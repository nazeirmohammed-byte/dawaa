# Cursor Build Prompt — "Dawaa" Multi-Tenant Pharmacy Management SaaS (Sudan)

> Canonical product contract, saved 2026-10-11. Phase 0 is already running on database `dawaa`. See `docs/DECISIONS.md` before changing the database, adding containers, or restyling the shell. `PROJECT_BRIEF_PART2.md` still wins on those accepted points.

---

## 0. Your role and working rules

You are a senior full-stack architect and engineer. Build a production-grade, multi-tenant SaaS for pharmacy management targeting Sudan.

Work rules:
1. Work **phase by phase** (Section 14). At the end of each phase: run all tests, run the app, list what was built, list open issues, then STOP and wait for my approval.
2. Never skip tests for business logic (stock, pricing, money, tenancy). Every bug fix gets a regression test.
3. Never hard-code tenant data, prices, currency rates, or secrets. Use config and the database.
4. Every query that touches tenant data MUST be tenant-scoped (Section 4). Treat a cross-tenant leak as a critical bug.
5. Money is `DECIMAL(18,2)`; never use float for money or quantities.
6. Keep code typed (TypeScript strict, Python type hints + mypy), linted, and formatted.
7. When a requirement is ambiguous, choose the simplest option that satisfies Sections 2–3, note the assumption in `docs/DECISIONS.md`, and continue.

---

## 1. Product summary

A SaaS that lets any pharmacy in Sudan — a **single pharmacy** or a **pharmacy group (chain with branches)** — self-enroll, create its own tenant, choose a subscription plan, and run its full operation: retail sales (box / strip / tablet), receiving and purchasing, inventory with batches and expiry, dynamic pricing tied to exchange rate, accounting, insurance, controlled drugs, branch transfers, and reports.

Design for Sudanese reality:
- **Unreliable internet and power** → POS must keep selling offline and sync later.
- **Old hardware** (Windows 7/10, 4 GB RAM, Core i3) → lightweight browser UI, no heavy client.
- **Frequent price changes / inflation** → bulk repricing by exchange rate or margin, with full price history.
- **Arabic-first users** with mixed technical skill → RTL Arabic UI by default, English optional, large touch-friendly controls, keyboard shortcuts.
- **Payment methods**: Cash, Bankak, Fawry, bank transfer, credit (customer account), insurance, and split payments.

---

## 2. Technology stack (mandatory)

| Layer | Technology |
| --- | --- |
| Database | **Microsoft SQL Server 2022** (cloud). **SQL Server Express** for on-premise branch edge servers. |
| Core API | **Node.js 20 LTS + TypeScript + NestJS** |
| ORM | **Prisma** (provider `sqlserver`) for app code; raw T-SQL migrations for RLS policies, views, and stored procedures |
| Analytics / jobs service | **Python 3.12 + FastAPI**, `pyodbc`/`SQLAlchemy` (MSSQL), `pandas`, `openpyxl` (Excel), `WeasyPrint` (Arabic RTL PDF), `APScheduler` |
| Queue / cache | **Redis 7** + **BullMQ** (Node) |
| Frontend | **React 18 + Vite + TypeScript**, TanStack Query, React Router, Tailwind CSS (RTL), i18next (ar default, en), PWA (Workbox) |
| Offline storage (browser) | IndexedDB via **Dexie.js** |
| Branch edge server (optional) | Same NestJS API in "edge mode" + SQL Server Express, packaged as a Windows service |
| Auth | JWT access + refresh tokens (httpOnly cookies), argon2 password hashing, optional 4–6 digit PIN for fast cashier switch |
| Printing | ESC/POS thermal receipts (58 mm / 80 mm) via a small local print bridge (Node, `node-thermal-printer`) exposed on `localhost`; browser print fallback |
| Barcode | USB/HID scanners (keyboard wedge) + internal barcode label generation (Code128 / EAN-13) |
| Monorepo | **pnpm workspaces + Turborepo** |
| Dev env | **Docker Compose**: `mcr.microsoft.com/mssql/server:2022-latest`, redis, api, analytics, web |
| Tests | Jest/Vitest (Node, web), pytest (Python), Playwright (E2E) |
| CI | GitHub Actions: lint, typecheck, test, build |

Local development on this machine does **not** use Docker. See `docs/DECISIONS.md`.

---

## 3. Repository structure

```
apps/
  api/            # NestJS core API (cloud + edge mode)
  web/            # React PWA: tenant app (POS, inventory, accounting...)
  admin/          # React: platform super-admin portal (SaaS owner) — not created yet
  analytics/      # Python FastAPI: reports, exports, imports, scheduled jobs — not started
  print-bridge/   # Node local service for ESC/POS printers — not created yet
packages/
  db/             # Prisma schema, migrations, raw SQL (RLS, views), seeders
  shared/         # Shared TS types, zod schemas, enums, money/unit utils
  ui/             # Shared React components (RTL-ready) — not created yet
infra/
  sql/            # RLS policies, stored procedures, indexes
docs/
  ARCHITECTURE.md
  DECISIONS.md
  API.md
```

The workspace root is `Pharmacy-MGMT`, not a nested `dawaa/` folder.

---

## 4. Multi-tenancy (critical)

### 4.1 Tenant model
- **Tenant** = one customer account. Tenant `type` is chosen at enrollment:
  - `INDIVIDUAL` — one pharmacy (exactly one branch).
  - `GROUP` — a pharmacy group with a head office and N branches.
- Every tenant has ≥1 **Branch**. Individual tenants cannot add branches unless they upgrade to a group plan.
- Users belong to one tenant and are assigned to one or more branches with a role per branch.

### 4.2 Isolation strategy
- **Default: shared database, shared schema**, every tenant-owned table has `TenantId UNIQUEIDENTIFIER NOT NULL` plus an index starting with `TenantId`.
- **Defense in depth:**
  1. App layer: a NestJS `TenantContext` (AsyncLocalStorage) set from the JWT; a Prisma client extension auto-injects `tenantId` into every `where` / `create` on tenant-owned models and throws if missing.
  2. DB layer: **SQL Server Row-Level Security**. Predicate `dbo.fn_rls_tenant` reads `SESSION_CONTEXT(N'TenantId')`. Policy `TenantIsolation` uses FILTER + BLOCK on every tenant-owned table.
  3. Branch scoping: `BranchId` on branch-owned rows; enforce branch access in guards.
- **Enterprise option (later):** `Tenant.DbMode` (`SHARED` | `DEDICATED`) and a connection resolver. Stay on `SHARED` until that exists.
- Session context is set with `@read_only = 0` and cleared before the connection returns to the pool. `@read_only = 1` would pin a pooled connection. NULL context fails closed.
- Login uses `dbo.usp_FindUserForLogin WITH EXECUTE AS 'dawaa_rls_bypass'`. That user has no login. There is no bypass flag the app login can set.
- Automated tests prove tenant A cannot read or write tenant B, and that a missing session context returns no rows.

### 4.3 Platform (super-admin) scope
Platform tables (`Tenant`, and later `Plan`, `Subscription`, `SubscriptionInvoice`, `PlatformUser`) are not under tenant RLS and are only for the admin portal. Impersonation requires a reason, a time limit, and an audit row. The admin portal is not built yet.

---

## 5. Enrollment and subscriptions

### 5.1 Self-enrollment wizard (public)
1. Choose tenant type: **Individual pharmacy** or **Pharmacy group**.
2. Business info: trade name (AR/EN), pharmacy license number, state/city, phone (Sudan format `+249`), email, responsible pharmacist name and registration number.
3. Choose plan (filtered by tenant type) and billing cycle (monthly / yearly).
4. Create owner account (name, phone, email, password) with OTP verification (SMS provider abstraction; email fallback).
5. Group only: head office info + number of branches to start with (can add later).
6. Review → create tenant, first branch(es), owner user with `OWNER` role, default chart of accounts, default roles, default settings, and a **14-day trial**.
7. Onboarding checklist inside the app: import drug catalog, opening stock, printers, users.

The live app has a shorter “open a pharmacy” signup (branch count and stock mode). It is not this wizard. Plans, OTP, and payment proofs are still open.

### 5.2 Plans (seed data, editable from admin portal; prices in SDG)
| Code | Tenant type | Includes | Monthly | Yearly |
| --- | --- | --- | --- | --- |
| `BASIC` | Individual | 1 device, POS, inventory, expiry, pricing, basic reports | 12,000 | 120,000 |
| `PRO` | Individual | Up to 3 devices + purchasing, accounting, insurance, controlled drugs | 24,000 | 240,000 |
| `CHAIN` | Group | PRO + central management, transfers, branch comparison | 21,000 per branch + 30,000 head office | 210,000 per branch + 300,000 head office |
| Setup fee | Any | Installation, catalog load, opening stock, 1 day training | 60,000 per branch (one-time) | — |

Implement plans as data: `Plan` has `features` (JSON list of feature flags) and `limits` (maxDevices, maxBranches, maxUsers). Enforce features with a `@RequireFeature('ACCOUNTING')` guard and in the UI menu. Do not hard-code these prices in application logic.

### 5.3 Billing lifecycle
- Statuses: `TRIAL` → `ACTIVE` → `PAST_DUE` (7-day grace) → `SUSPENDED` (read-only: can view and export, cannot sell) → `CANCELLED`.
- Invoices generated per cycle by a scheduled job; branch count changes are prorated.
- **Payment collection (Sudan):** tenant uploads a Bankak / bank transfer receipt (image/PDF) against an invoice → platform admin approves → subscription activated. Keep a `PaymentGateway` interface so an online gateway can be plugged in later.
- Notifications (SMS/email/WhatsApp abstraction) at 7, 3, 1 days before due, on due date, and on suspension.
- POS keeps working offline even if subscription expires mid-shift; enforcement applies at next sync/login.

---

## 6. Core domain model (minimum)

All tables: `Id UNIQUEIDENTIFIER` (client-generatable for offline), `TenantId` where tenant-owned, `CreatedAt`, `CreatedBy`, `UpdatedAt`, `UpdatedBy`, `RowVersion ROWVERSION`, soft delete `IsDeleted` where appropriate.

Money columns are `DECIMAL(18,2)`. Exchange rates are `DECIMAL(18,6)`. Stock quantities in base units are integers. SQL Server has no Prisma enums; status columns are `NVARCHAR` plus `CHECK`, validated with zod in `@dawaa/shared`.

Already migrated on `dawaa` (names are the live Prisma models, not a second schema): `Tenant`, `Branch`, `User`, `Role`, `Permission`, `RolePermission`, `UserBranchRole`, `Device`, `AuditLog`, `Category`, `Product`, `StockLot`, `StockMovement`, `Supplier`, `PurchaseOrder`, `PurchaseLine`, `Customer`, `Sale`, `SaleLine`, `LedgerAccount`, `JournalEntry`, `JournalLine`, `Expense`, `PharmacySetting`, `StandardMedicine`, `DosageForm`, `PriceList`, `BranchPriceActivation`, `ProductPrice`, `ExchangeRate`, `PriceListChangeBatch`, `PriceHistory`.

Still outline-only until their phase is approved: `Plan`, `Subscription`, `SubscriptionInvoice`, `PaymentProof`, `PlatformUser`, `ProductUnit`, `Barcode`, `AlternativeGroup`, `Shift`, `Payment`, `SaleReturn`, insurance and prescription models, `ControlledDrugRegister`, `BranchTransfer`, sync outbox/inbox, and the full accounting set beyond the current ledger.

---

## 7. Functional requirements by module

### 7.1 POS (cashier)
- Search by trade name, generic name (Arabic or English, fuzzy), or barcode scan; results show stock per unit level and price.
- Sell by box / strip / tablet; auto-convert to base units.
- **FEFO allocation:** automatically consume from the earliest-expiry non-expired batch(es); a line can span multiple batches.
- **Block sale of expired batches** and of controlled drugs without a registered prescription.
- Show alternatives (same AlternativeGroup) when out of stock.
- Discounts with per-role limits; manager PIN override above limit; prevent selling below cost without permission.
- Split payments across methods; change calculation; credit sale only for customers with credit limit.
- Hold/resume invoice; returns/exchange within configurable days (supervisor permission).
- Print ESC/POS Arabic receipt (58/80 mm) with tenant logo/name, branch, invoice no., items, totals, payment methods; optional WhatsApp share link.
- Keyboard shortcuts: F2 search, F4 customer, F8 discount, F9 pay, F12 print, Esc cancel.
- Target: a typical 3-item sale completes in < 30 seconds; search response < 200 ms locally.

The live sales screen already posts a sale, allocates the earliest non-expired lot, rejects expired stock, and can show a 58 mm browser receipt. Shifts, split payments, PIN override, alternatives, and the print bridge are still open.

### 7.2 Inventory
- Product card with all units, prices, batches, movement history.
- Stock count (full/partial), mobile-friendly counting screen with camera barcode scanning, variance approval by manager, auto adjustment entries.
- Damage/expiry write-off with reasons.
- Reorder suggestions based on reorder level and average daily sales (last 30/60/90 days).

Live inventory can add a product with a lot, receive stock by search or barcode, and adjust quantity. Stock count and reorder suggestions are still open.

### 7.3 Receiving & purchasing
- Purchase orders (manual or auto-suggested), approval workflow.
- Goods receipt against PO or direct; **batch number and expiry are mandatory**; reject batches with remaining shelf life below a tenant-configurable threshold (default 6 months) unless overridden.
- Bonus quantities, supplier discounts, landed cost.
- Supplier invoices, payments, returns; supplier price comparison per product.
- Print barcode/price labels for received items without manufacturer barcodes.

### 7.4 Pricing
- Price per unit level per price list.
- Methods: fixed margin on cost, manual price, or **USD-linked** (cost in USD × current rate × (1 + margin)).
- **Bulk repricing wizard:** filter (all / manufacturer / category / USD-linked) → choose rule (new exchange rate, margin %, fixed %) → preview old vs new with rounding → approve → writes PriceHistory and notifies POS devices via sync.
- Full audit of who changed what and when.

Live price lists are versioned. An ACTIVE list is locked. Copy creates a DRAFT. Bulk change can preview percentage, amount, margin, and exchange rate, then apply on the draft only. CSV export/import stands in for the protected Excel workbook. Sale lines store the price, list id, and version used at sale time.

### 7.5 Expiry management
- Alerts at 180 / 90 / 30 days (configurable) on dashboard and daily job.
- Color status: green / yellow / red; expired batches auto-locked.
- Suggested action per batch: return to supplier, transfer to faster-selling branch, or discount.

### 7.6 Accounting
- Seeded chart of accounts for pharmacies (editable).
- Automatic journal posting rules for every operational document; manual journal entries for accountants.
- Cash boxes, banks, e-wallets (Bankak/Fawry), expenses (rent, electricity, generator fuel, salaries).
- AR/AP ledgers with aging; income statement, balance sheet, trial balance; period closing.

### 7.7 Insurance & patients
- Patient profile (chronic meds, allergies, dispensing history), refill reminders via SMS.
- Insurance plans with coverage % and covered lists; POS splits patient share vs insurer share.
- Monthly claim batches per company; export to Excel/PDF; track accepted/rejected.

### 7.8 Branches (GROUP tenants)
- Head office sees all branches; branches operate independently offline.
- Central catalog and price lists pushed to branches; branch-specific overrides allowed if permitted.
- Branch transfers with issue/receive documents and discrepancy handling.
- Branch comparison dashboard.

The demo pharmacy can switch branches and keep stock separate. A transfer document workflow is still open.

### 7.9 Users, roles, permissions
- Seeded roles: OWNER, BRANCH_MANAGER, PHARMACIST, ASSISTANT_PHARMACIST, CASHIER, STOREKEEPER, ACCOUNTANT.
- Fine-grained permissions (e.g., `price.edit`, `discount.over_limit`, `invoice.void`, `stock.adjust`, `controlled.dispense`).
- Immutable audit log for sensitive actions (price changes, voids, adjustments, discounts over limit, logins, impersonation).

### 7.10 Reports (Python analytics service)
At minimum, exportable to Excel and Arabic PDF:
- Daily sales by cashier/shift/payment method; voids, returns, discounts.
- Profit by invoice, product, branch; top/bottom products.
- Stock valuation (cost & retail), slow movers, shortages, product movement.
- Near-expiry (30/90/180) and expired; monthly write-off value.
- Purchases by supplier; unpaid supplier invoices.
- Financial statements; customer/supplier statements; aging.
- Insurance claims by company/month.
- Controlled drugs register; audit log; price change log.
- Branch comparison; transfers.

The tenant app has on-screen reports. Excel and Arabic PDF from the Python service are not built. Do not start that service on port 8000 until its phase is approved.

### 7.11 Platform admin portal (`apps/admin`)
- Tenants list with type, plan, status, branch/device/user counts, last sync, MRR.
- Approve payment proofs, issue/cancel invoices, extend trials, change plans, suspend/reactivate.
- Manage plans, feature flags, limits, global drug catalog (master list tenants can import), announcements.
- Usage and health metrics; impersonation with audit.

The master drug list (`StandardMedicine` plus seeded `DosageForm`) is edited through the API publish path, not through an admin portal yet.

---

## 8. Offline-first and sync

Two supported deployment modes per branch (configurable per Device):
1. **Browser PWA only** (small pharmacy): app shell + catalog + prices + batch stock cached in IndexedDB; sales recorded locally with client-generated GUIDs and pushed when online.
2. **Branch edge server** (multi-device branch): NestJS in `EDGE_MODE` + SQL Server Express on a local PC; all branch devices talk to it over LAN; the edge server syncs with the cloud.

Sync design:
- **Outbox pattern** on each client/edge: every change is an append-only operation with `OperationId` (GUID, idempotency key), `DeviceId`, `EntityType`, `Payload`, `CreatedAt`.
- Push: POST batches to `/sync/push`; server applies idempotently and returns acknowledgements.
- Pull: GET `/sync/pull?since=<checkpoint>` returns changes (catalog, prices, settings, transfers, users) using `RowVersion` checkpoints per device.
- Ownership rules to avoid conflicts:
  - Catalog, price lists, plans, settings → owned by head office/cloud (server wins).
  - Sales, shifts, receipts, counts → owned by the branch (append-only; never edited after sync, only reversed by return documents).
  - Stock balance is derived from the movement ledger; recompute on the server after applying movements.
- Negative stock caused by offline sales from two devices is allowed but flagged for review.
- Resumable sync over slow links (small batches, gzip, retry with backoff).
- Visible sync status indicator in the UI (online / offline / pending N operations / last sync time).

Not implemented. Do not add it until Phase 5 is approved.

---

## 9. Non-functional requirements
- **Language & layout:** Arabic RTL default, English LTR optional, per-user setting; Arabic-capable fonts (IBM Plex Sans Arabic is loaded); numbers display with Western digits by default.
- **Performance:** web app usable on Core i3 / 4 GB RAM / Chrome 109; initial JS bundle < 300 KB gzipped for the POS route; code-split everything else.
- **Accessibility/UX:** buttons ≥ 44 px, high-contrast option, every daily task ≤ 3 steps.
- **Security:** OWASP top 10, rate limiting, input validation with zod, parameterized queries only, secrets via env, TLS everywhere, encrypted backups, password policy, session revocation.
- **Data protection:** patient data visible only to permitted roles; exports logged.
- **Backups:** nightly SQL Server backups (cloud); edge servers back up daily to local disk/USB and push to cloud when online; documented restore of a branch onto a new PC in < 1 hour.
- **Observability:** structured JSON logs (pino), request IDs with tenant ID, health endpoints, basic metrics.
- **Dates/time:** store UTC; display in `Africa/Khartoum`.
- **Currency:** SDG base with optional USD; all money `DECIMAL(18,2)`, rates `DECIMAL(18,6)`. JavaScript numbers are rejected by the money helpers.

---

## 10. API conventions
- REST, versioned `/api/v1`, OpenAPI generated from NestJS decorators (published at `/api/docs`).
- Pagination (`page`, `pageSize`), filtering, sorting on list endpoints.
- Consistent error format `{ code, message, details }` with Arabic and English messages via i18n keys. The live body also includes `messageKey`.
- Idempotency-Key header supported on all POST endpoints that create financial or stock documents.
- Python analytics service is internal only (called by the API with a service token); never exposed publicly.

---

## 11. UI screens (tenant app)
Login (password or PIN, branch selection, connection status) · Dashboard · POS · Payment dialog · Product card · Product list/import · Goods receipt · Purchase orders · Bulk repricing wizard · Expiry board · Stock count · Branch transfers · Shift close · Prescriptions & insurance · Customers · Suppliers · Accounting (journal, expenses, ledgers, statements) · Reports center · Users & roles · Settings (branch, printers, pricing rules, expiry thresholds, payment methods) · Subscription & billing (plan, invoices, upload payment proof).

Public: landing page, pricing page, enrollment wizard.

Live screens: login, dashboard, inventory, sales, purchasing, finance, reports, users, settings, prices (catalog import, versioned lists, bulk change, CSV). PIN login, insurance, shifts, transfers, subscription billing, and the public pricing page are still open.

---

## 11A. UI/UX implementation reference and components

The live shell already follows `PROJECT_BRIEF_PART2.md`: teal primary, navy sidebar, light workspace, Arabic RTL, collapsible sidebar, dark theme toggle. Section 11A below stays the target for a later visual pass. Do not restyle the running app to the `#064E4A` palette or move the sidebar unless that pass is approved.

### 11A.1 Visual direction

Default style: **Modern Healthcare + Retail POS Focus**.

Design principles:
- Arabic RTL first; English/LTR optional.
- Dense but readable operational layout.
- Sidebar on the **right**.
- POS quick-sale panel visible on the **left** of the dashboard on desktop.
- Main dashboard content in the center.
- No decorative hero sections, no large marketing text, no dark main workspace.
- Cards radius: 8 px.
- Clear status colors for stock, expiry, sync, payment, and subscription.
- Keep all tables scannable on old screens and low-resolution monitors.
- All important daily tasks should be reachable in 1-3 clicks.

Color tokens:
```ts
const theme = {
  primary: '#064E4A',
  primarySoft: '#CCFBF1',
  action: '#059669',
  actionHover: '#047857',
  background: '#F6F8FA',
  surface: '#FFFFFF',
  border: '#E5E7EB',
  text: '#111827',
  muted: '#6B7280',
  info: '#2563EB',
  infoSoft: '#DBEAFE',
  success: '#16A34A',
  successSoft: '#D1FAE5',
  warning: '#F59E0B',
  warningSoft: '#FEF3C7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2'
}
```

Typography:
- Arabic font: `IBM Plex Sans Arabic`, `Noto Sans Arabic`, or `Tajawal`.
- Body: 14 px.
- Table text: 13-14 px.
- KPI values: 24-30 px.
- Buttons: minimum 44 px height for touch.
- Use Western digits by default, with a setting to switch to Arabic digits later.

### 11A.2 App shell components

Create reusable components under `packages/ui` and consume them in `apps/web` when that package is approved.

Required layout components:
- `AppShell`, `Sidebar`, `Topbar`, `PageHeader`, `Breadcrumbs`, `ModuleTabs`
- `CommandSearch`, `GlobalQuickActions`, `NotificationCenter`, `SyncStatusIndicator`
- `TenantBranchSwitcher`, `UserProfileMenu`, `FeatureGate`, `PermissionGate`

Sidebar groups: Daily Operations, Stock, Purchasing, Finance, Clinical, Admin. Each item respects feature flags and permissions.

Topbar search placeholder: `ابحث عن دواء، مستحضر، عميل، أو رقم فاتورة...`

### 11A.3–11A.14

Dashboard KPIs, charts, expiry and low-stock tables, POS quick sale, inventory filters, goods receipt, bulk repricing wizard, accounting screens, insurance, users and audit, reports center, settings, loading/empty/error states, and Playwright screenshots (dashboard, POS, inventory, goods receipt, reports, settings) remain the acceptance list for the UI phases. They are not Phase 0.

---

## 12. Seed and demo data
- Plans from Section 5.2 — not seeded yet. Prices must live in the `Plan` table when that phase starts.
- Default chart of accounts, roles, permissions — roles and a pharmacy ledger exist for the demo tenant.
- A sample catalog of common medicines exists as `StandardMedicine`, with dosage forms seeded. It is not yet a 200-item clinical catalog.
- Demo tenant: Nile Pharmacy, owner `owner@demo.dawaa.local`, two branches (main and Bahri). A second tenant exists. A full GROUP demo with three branches, insurance claims, and near-expiry storytelling is still open.

---

## 13. Testing requirements
- Unit tests: unit conversion, FEFO allocation, pricing rules and rounding, journal posting rules, subscription state machine, proration.
- Integration tests against SQL Server: tenant isolation (API + RLS), sync idempotency, stock ledger consistency.
- E2E (Playwright): enrollment → first sale → receipt print preview; offline sale then sync; bulk repricing; branch transfer.
- Load test: 50 concurrent POS devices per tenant pushing sales.

Current automated coverage: money helpers, tenant-table list vs RLS script, tenant A/B isolation on SQL Server, FEFO and journal balance, auth logic, price-change math. Subscription, sync, Playwright, and load tests are still open.

---

## 14. Delivery phases (stop after each for approval)

| Phase | Scope | Done when |
| --- | --- | --- |
| **0. Foundation** | Monorepo, NestJS + React, Prisma on SQL Server, CI, i18n + RTL, auth, `docs/ARCHITECTURE.md` | Health is green and login works. **This phase is done.** Docker Compose is intentionally not used. |
| **1. Tenancy & subscriptions** | Plans, trial lifecycle, feature flags, enrollment wizard, admin portal basics, payment proof approval | Isolation tests pass; two tenants enrolled end-to-end through the wizard |
| **2. Catalog, units, pricing** | Products, units, barcodes, alternatives, price lists, USD-linked pricing, bulk repricing, Excel catalog import | Import 200 products; reprice by new rate with preview |
| **3. Receiving & inventory** | Suppliers, POs, goods receipt with batches/expiry, stock ledger, counts, damage, expiry board, labels | Stock ledger reconciles; expiry alerts generated |
| **4. POS** | POS screen, FEFO, splits, returns, shifts, ESC/POS, shortcuts, controlled-drug blocking | 3-item sale < 30 s; shift close balances |
| **5. Offline & sync** | PWA caching, Dexie outbox, sync endpoints, edge mode, status indicator | Sell offline 1 hour → reconnect → all synced, no duplicates |
| **6. Accounting** | Chart of accounts, auto posting, expenses, cash/bank/wallets, AR/AP, statements | Trial balance balances after demo data |
| **7. Insurance, patients, controlled drugs** | Plans, coverage split, prescriptions, claims, register, refill SMS | Monthly claim export per insurer |
| **8. Groups & transfers** | Head office views, central price push, transfers, branch comparison | Transfer flow end-to-end across branches |
| **9. Reports & dashboards** | Full report set (Section 7.10) in Excel + Arabic PDF | All reports render correctly in Arabic |
| **10. Hardening & launch** | Security review, load tests, backups/restore runbook, monitoring, billing jobs, deployment scripts | Restore drill < 1 hour; load test passes |

Phases 2, 3, 4, 6, and 8 are **partly** present on the live app (catalog, receipt, sales, ledger, two branches, versioned prices). Do not delete them to restart a phase. The next phase waiting for approval is **Phase 1** (plans, billing, enrollment wizard, admin portal), because it is the first phase that is still missing as a whole.
