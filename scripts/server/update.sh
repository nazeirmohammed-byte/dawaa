#!/usr/bin/env bash
# Dawaa server control menu. Usage: dawaa  or  dawaa <1-6>
set -uo pipefail
export PATH="$PATH:/opt/mssql-tools18/bin"

APP=/opt/dawaa
DOMAIN=dwaa.net
SERVICE=dawaa-api
SITE=/etc/nginx/sites-available/dwaa
MAINT_DIR=/var/www/dawaa-maintenance
BACKUP_DIR=/var/opt/mssql/backup
LOG=/var/log/dawaa-deploy.log

cd "$APP" || { echo "Missing $APP"; exit 1; }
exec > >(tee -a "$LOG") 2>&1

ok()   { printf '\e[32m  OK\e[0m   %s\n' "$*"; }
bad()  { printf '\e[31m  FAIL\e[0m %s\n' "$*"; }
step() { printf '\n\e[36m== %s\e[0m\n' "$*"; }
die()  { bad "$*"; echo "Deploy stopped. Log: $LOG"; exit 1; }

envval() { grep -E "^$1=" "$APP/.env" | tail -n 1 | cut -d= -f2-; }
MIG_URL=$(envval MIGRATE_DATABASE_URL)
MIG_USER=$(sed -n 's/.*user=\([^;]*\).*/\1/p' <<<"$MIG_URL")
MIG_PASS=$(sed -n 's/.*password=\([^;]*\).*/\1/p' <<<"$MIG_URL")
API_PORT=$(envval API_PORT); API_PORT=${API_PORT:-4190}

sql() { sqlcmd -S localhost -U "$MIG_USER" -P "$MIG_PASS" -C -b -I -d dawaa "$@"; }

pull() {
  step "Pull from GitHub"
  PREV=$(git rev-parse --short HEAD)
  git pull --ff-only || die "git pull failed (local changes on server?)"
  NOW=$(git rev-parse --short HEAD)
  [ "$PREV" = "$NOW" ] && ok "Already up to date ($NOW)" || ok "Updated $PREV -> $NOW"
  echo "  Rollback if needed: git -C $APP reset --hard $PREV && dawaa 1"
  pnpm install --frozen-lockfile || die "pnpm install failed"
  pnpm db:generate || die "prisma generate failed"
  pnpm --filter @dawaa/shared build || die "shared build failed"
}

backup_db() {
  step "Database backup"
  mkdir -p "$BACKUP_DIR" && chown mssql:mssql "$BACKUP_DIR"
  local file="$BACKUP_DIR/dawaa-$(date +%Y%m%d-%H%M%S).bak"
  sql -Q "BACKUP DATABASE dawaa TO DISK = N'$file' WITH INIT" >/dev/null || die "backup failed"
  ok "Saved $file"
  ls -1t "$BACKUP_DIR"/dawaa-*.bak 2>/dev/null | tail -n +8 | xargs -r rm -f
}

migrate_db() {
  step "Database migration"
  if (cd packages/db && DATABASE_URL="$MIG_URL" pnpm exec prisma db push --skip-generate) >/tmp/dawaa-push.out 2>&1; then
    ok "prisma db push"
  elif grep -q "Cannot alter column 'rowVersion'" /tmp/dawaa-push.out; then
    ok "prisma db push: rowVersion columns left unchanged (expected); SQL scripts apply the rest"
  else
    cat /tmp/dawaa-push.out
    die "prisma db push failed"
  fi

  local cat_id
  cat_id=$(sql -h -1 -W -Q "SET NOCOUNT ON; SELECT OBJECT_ID(N'dbo.Categories')" | tr -d '[:space:]')
  if [ -z "$cat_id" ] || [ "$cat_id" = "NULL" ]; then
    sql -i infra/sql/006_ops_tables.sql >/tmp/dawaa-sql.out 2>&1 && ok "006_ops_tables.sql" || { cat /tmp/dawaa-sql.out; die "006_ops_tables.sql failed"; }
  fi

    for f in 008_prices 009_catalog_price_stock 010_platform 011_tenant_login 013_alert_cases 001_rls 002_auth_lookup 003_grants 004_checks 005_ops_checks 007_branch_limit 012_goods_receipts 013_inventory_posting 014_place_check 015_receipt_cost 016_price_status 017_global_library; do
    [ -f "infra/sql/$f.sql" ] || continue
    sql -i "infra/sql/$f.sql" >/tmp/dawaa-sql.out 2>&1 && ok "$f.sql" || { cat /tmp/dawaa-sql.out; die "$f.sql failed"; }
  done

  sql -Q "GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO dawaa_app; GRANT EXECUTE ON dbo.usp_FindUserForLogin TO dawaa_app;" >/dev/null \
    && ok "dawaa_app permissions" || die "grants failed"
}

build_api() {
  step "Build backend"
  pnpm --filter @dawaa/db build || die "db build failed"
  pnpm --filter @dawaa/api build || die "API build failed"
  ok "API built"
}

restart_api() {
  step "Restart API"
  systemctl restart "$SERVICE" || die "restart failed"
  for i in $(seq 1 20); do
    curl -sf "http://127.0.0.1:$API_PORT/api/v1/health" >/dev/null && { ok "API is up after ${i}s"; return; }
    sleep 1
  done
  journalctl -u "$SERVICE" -n 30 --no-pager
  die "API did not become healthy"
}

build_web() {
  step "Build frontend (site stays online during build)"
  cd "$APP/apps/web"
  pnpm exec tsc -p tsconfig.json --noEmit || die "frontend type check failed"
  pnpm exec vite build --outDir dist.next --emptyOutDir || die "frontend build failed"
  rm -rf dist.prev; [ -d dist ] && mv dist dist.prev; mv dist.next dist
  cd "$APP"
  ok "Frontend live (previous copy kept in apps/web/dist.prev)"
}

smoke_test() {
  step "Tests"
  local fails=0 code
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$API_PORT/api/v1/health")
  [ "$code" = 200 ] && ok "API health 200" || { bad "API health $code"; fails=$((fails+1)); }

  code=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/")
  [ "$code" = 200 ] && ok "https://$DOMAIN 200" || { bad "https://$DOMAIN $code"; fails=$((fails+1)); }

  code=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/api/v1/health")
  [ "$code" = 200 ] && ok "Public API via nginx 200" || { bad "Public API $code"; fails=$((fails+1)); }

  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$API_PORT/api/v1/platform/login" \
    -H 'content-type: application/json' -d '{"email":"deploy-check@dwaa.net","password":"not-a-real-pass"}')
  [[ "$code" =~ ^(400|401|403)$ ]] && ok "Admin sign-in reaches DB ($code)" || { bad "Admin sign-in returned $code (500 = DB permission problem)"; fails=$((fails+1)); }

  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$API_PORT/api/v1/auth/login" \
    -H 'content-type: application/json' -d '{"identifier":"deploy-check@dwaa.net","password":"not-a-real-pass"}')
  [[ "$code" =~ ^(400|401|403|429)$ ]] && ok "Pharmacy sign-in reaches DB ($code)" || { bad "Pharmacy sign-in returned $code"; fails=$((fails+1)); }

  local errs; errs=$(journalctl -u "$SERVICE" --since "-2 min" --no-pager | grep -c '"level":50')
  [ "$errs" = 0 ] && ok "No API errors in last 2 min" || { bad "$errs API errors in last 2 min"; fails=$((fails+1)); }

  [ "$fails" = 0 ] && printf '\n\e[32mALL TESTS PASSED\e[0m\n' || printf '\n\e[31m%s TEST(S) FAILED\e[0m\n' "$fails"
}

maintenance() {
  step "Maintenance mode"
  mkdir -p "$MAINT_DIR" /etc/nginx/snippets
  cat > "$MAINT_DIR/maintenance.html" <<'HTML'
<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>دواء - صيانة</title><style>body{font-family:system-ui,Tahoma,sans-serif;background:#0f3d3a;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center}
.box{max-width:480px;padding:32px}h1{font-size:28px;margin:0 0 12px}p{opacity:.85;line-height:1.7}</style></head>
<body><div class="box"><h1>النظام تحت الصيانة</h1><p>نقوم بتحديث نظام دواء الآن. سنعود خلال دقائق.</p>
<p dir="ltr">Dawaa is being updated. We will be back in a few minutes.</p></div></body></html>
HTML
  cat > /etc/nginx/snippets/dawaa-maintenance.conf <<'NGX'
set $dawaa_maint 0;
if (-f /var/www/dawaa-maintenance/on) { set $dawaa_maint 1; }
if ($uri = /maintenance.html) { set $dawaa_maint 0; }
error_page 503 /maintenance.html;
location = /maintenance.html { root /var/www/dawaa-maintenance; add_header Cache-Control "no-store" always; add_header Retry-After 600 always; }
if ($dawaa_maint) { return 503; }
NGX
  if ! grep -q 'dawaa-maintenance.conf' "$SITE"; then
    cp "$SITE" "$SITE.bak.$(date +%s)"
    sed -i '/server_name/a\    include snippets/dawaa-maintenance.conf;' "$SITE"
  fi
  nginx -t >/dev/null 2>&1 || { nginx -t; die "nginx config invalid"; }
  systemctl reload nginx

  if [ -f "$MAINT_DIR/on" ]; then
    read -r -p "Maintenance is ON. Turn it OFF? [y/N] " a
    [[ "$a" =~ ^[yY]$ ]] && rm -f "$MAINT_DIR/on" && ok "Maintenance OFF, site is live"
  else
    read -r -p "Maintenance is OFF. Turn it ON (visitors see the maintenance page)? [y/N] " a
    [[ "$a" =~ ^[yY]$ ]] && touch "$MAINT_DIR/on" && ok "Maintenance ON"
  fi
}

health() {
  step "Services"
  for s in "$SERVICE" nginx mssql-server; do
    systemctl is-active --quiet "$s" && ok "$s running" || bad "$s NOT running"
  done
  [ -f "$MAINT_DIR/on" ] && bad "Maintenance mode is ON" || ok "Maintenance mode off"

  step "Response time"
  curl -s -o /dev/null -w "  API health   : %{http_code} in %{time_total}s\n" "http://127.0.0.1:$API_PORT/api/v1/health"
  curl -s -o /dev/null -w "  Website      : %{http_code} in %{time_total}s\n" "https://$DOMAIN/"
  curl -s "http://127.0.0.1:$API_PORT/api/v1/health"; echo

  step "CPU and memory"
  local cores; cores=$(nproc)
  read -r l1 l5 l15 _ < /proc/loadavg
  echo "  Cores: $cores   Load 1/5/15 min: $l1 / $l5 / $l15   (load above $cores = overloaded)"
  top -bn1 | awk '/Cpu\(s\)/{printf "  CPU used: %.1f%%\n", 100-$8}'
  free -m | awk '/Mem:/{printf "  RAM: %d / %d MB used (%.0f%%)\n",$3,$2,$3*100/$2} /Swap:/{if($2>0) printf "  Swap: %d / %d MB used\n",$3,$2}'
  echo "  Top processes:"
  ps -eo pid,comm,%cpu,%mem,rss --sort=-%cpu | head -n 6 | awk 'NR==1{print "   "$0;next}{printf "   %-7s %-16s %5s %5s %6d MB\n",$1,$2,$3,$4,$5/1024}'

  step "Disk"
  df -h / /var/opt/mssql 2>/dev/null | awk 'NR==1 || !seen[$1]++'
  echo "  Database files: $(du -sh /var/opt/mssql/data 2>/dev/null | cut -f1)   Backups: $(du -sh $BACKUP_DIR 2>/dev/null | cut -f1)"
  sql -W -h -1 -Q "SET NOCOUNT ON; SELECT CONCAT('  dawaa DB size: ', CAST(SUM(size)*8/1024 AS INT), ' MB (Express limit 10240 MB per DB)') FROM sys.database_files WHERE type=0" 2>/dev/null

  step "Traffic and errors"
  echo "  Open HTTPS connections : $(ss -Htn state established '( sport = :443 )' | wc -l)"
  local today; today=$(date +%d/%b/%Y)
  if [ -f /var/log/nginx/access.log ]; then
    echo "  Requests today           : $(grep -c "$today" /var/log/nginx/access.log)"
    echo "  Server errors (5xx) today: $(grep "$today" /var/log/nginx/access.log | awk '$9 ~ /^5/' | wc -l)"
  fi
  echo "  API errors last hour   : $(journalctl -u "$SERVICE" --since '-1 hour' --no-pager | grep -c '"level":50')"
  echo "  API memory / restarts  : $(systemctl show "$SERVICE" -p MemoryCurrent --value | awk '{printf "%d MB", $1/1048576}') / $(systemctl show "$SERVICE" -p NRestarts --value)"

  step "Security"
  local exp; exp=$(echo | openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  [ -n "$exp" ] && echo "  SSL certificate expires: $exp" || bad "Could not read SSL certificate"
  ufw status | head -n 8 | sed 's/^/  /'
  echo "  Pending OS updates: $(apt list --upgradable 2>/dev/null | grep -c upgradable)"
}

full_deploy()   { backup_db; pull; migrate_db; build_api; build_web; restart_api; smoke_test; }
backend_only()  { pull; build_api; restart_api; smoke_test; }
frontend_only() { pull; build_web; smoke_test; }
restart_all()   { step "Restart services"; systemctl restart mssql-server && ok "SQL Server"; sleep 3; restart_api; systemctl reload nginx && ok "nginx reloaded"; smoke_test; }

run() {
  echo "[$(date '+%F %T')] option $1" >>"$LOG"
  case "$1" in
    1) full_deploy ;;
    2) backend_only ;;
    3) frontend_only ;;
    4) restart_all ;;
    5) maintenance ;;
    6) health ;;
    0|q) exit 0 ;;
    *) echo "Unknown option" ;;
  esac
}

[ $# -ge 1 ] && { run "$1"; exit; }

while true; do
  cat <<MENU

  ========== DAWAA SERVER ($(git rev-parse --short HEAD)) ==========
   1) Full deploy  (backup DB + pull + DB migration + backend + frontend + restart + tests)
   2) Backend only (pull + build API + restart + tests)
   3) Frontend only (pull + build web, no downtime + tests)
   4) Restart services (SQL Server, API, nginx + tests)
   5) Maintenance mode ON / OFF
   6) Health check and server performance
   0) Exit
MENU
  read -r -p "  Choose: " choice
  run "$choice"
done