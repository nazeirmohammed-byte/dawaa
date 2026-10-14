# Decisions

## 2026-10-11 — Platform admin opens from the pharmacy home page

The owner panel is an Admin sign-in tab on `http://127.0.0.1:4188`. After sign-in the board is `http://127.0.0.1:4188/admin/dashboard`. The screen code stays in `apps/admin` and is mounted by the pharmacy web app. Port 5174 is no longer the entry.

## 2026-10-11 — Platform admin is a separate app

The SaaS owner panel is `apps/admin` on port 5174. Pharmacy staff stay on port 4188 and cannot call platform routes. Platform tokens use type `platform`, so the pharmacy guard rejects them.

Existing pharmacies were already operating, so their verification status defaults to VALID. A pharmacy created from a subscription request stays inactive until both licenses are verified, unless a super admin records an override reason. Global catalog updates write the shared medicine row only and do not change a pharmacy's stock or prices.

## 2026-10-11 — Phase 0 stays closed when the brief is pasted again

The full product brief was pasted again with “start Phase 0.” The foundation is already running: app `http://127.0.0.1:4188`, API `4190`, database `dawaa`, health 200, demo login 201. It is not rebuilt, and Docker is still not introduced.

The control board the owner asked for is the live shell: right green sidebar, quick sale, and figures from the tenant database. Section 11A’s exact `#064E4A` palette is not a second restyle. The next phase still waits for approval.

## 2026-10-11 — Re-maintain against PROJECT_BRIEF.md without a new foundation

The owner asked to re-maintain Dawaa using the full product brief. That text is `PROJECT_BRIEF.md`. The brief says to start at Phase 0 and stop for approval.

Phase 0 is already running, so it was not rebuilt. The app stays at `http://127.0.0.1:4188`, the API at `4190`, and the database stays `dawaa`. Docker Compose is still out of scope (see the 2026-10-10 container decision). Redis stays optional until a job needs it.

The live shell is the control board the owner asked for after this note: pharmacy name in a right-hand green sidebar, quick sale on the left, and dashboard figures from the database.

Later brief phases are added on the current schema. A missing module is new work. A module that already sells, receives, or prices is left in place.

## 2026-10-10 — Where to open the app

The screen is served at `http://127.0.0.1:4188`. That port was free on this machine. The API listens on `4190` and the page proxies `/api` to it, so the browser only needs one address. Credentials and the click-path are in `GUIDE.md`.

The operations board and the 58 mm receipt are rows in `OperationalSignals` and `ReceiptDrafts` for the demo tenant. The page does not invent prices in the browser. Those rows are a viewing aid until live sales, stock, and purchasing exist.

## 2026-10-10 — Touch mode is a layout, not a separate app

`html[data-touch="on"]` raises the control size to 68px and shows a thumb bar. The choice is stored in `localStorage` (`dawaa.touch`). Desk mode stays available for a mouse.

Assumptions and choices made while building Dawaa. Newest first.

## 2026-10-10 — Phase 0 runs without containers

The product brief specifies Docker Compose for local development. The project owner overrode that: do not use Docker or any other container runtime.

Local development uses the SQL Server instance already installed on this machine:

- Instance: `DESKTOP-3BBNP8U\TPADB` (SQL Server 2025 Developer, engine 17.0)
- TCP: `127.0.0.1,1433`
- Database: `dawaa` (created by `scripts/setup-db.ps1`; existing databases are not modified)

Redis is not installed. Phase 0 treats it as optional. `/api/v1/health` reports `redis: disabled` until `REDIS_URL` is set. Login and tenant isolation do not depend on Redis. BullMQ arrives with the jobs that need it.

The target production database remains SQL Server. The local engine is newer than SQL Server 2022; we avoid features that 2022 cannot run.

## 2026-10-10 — Repository root is the workspace

The brief shows a `dawaa/` directory. This workspace is already `Pharmacy-MGMT`, so `apps/`, `packages/`, `infra/`, and `docs/` live at the root. The npm package name is still `dawaa`.

## 2026-10-10 — Row-level security does not pin the connection

The brief asks each request to run:

```sql
EXEC sp_set_session_context
  @key = N'TenantId',
  @value = @tid,
  @read_only = 1;
```

`@read_only = 1` cannot be cleared for the rest of that physical connection. Prisma pools connections, so a pinned tenant id would either stick to the next request (cross-tenant leak) or make the connection unusable for any other tenant.

Phase 0 sets the context inside a Prisma interactive transaction and clears it before the connection returns to the pool:

```sql
EXEC sp_set_session_context @key = N'TenantId', @value = @tid, @read_only = 0;
-- work
EXEC sp_set_session_context @key = N'TenantId', @value = NULL, @read_only = 0;
```

NULL context fails closed: the filter predicate matches no rows. The app-layer Prisma extension still injects `tenantId`. Both layers are required.

## 2026-10-10 — Login lookup uses EXECUTE AS, not a bypass flag

`IS_MEMBER()` does not see roles granted only through a certificate signature, so a signed procedure cannot reliably flip an `IS_MEMBER('rls_bypass')` check.

`SESSION_CONTEXT(N'BypassRls')` is also rejected. The application login can set any session key, so a bypass flag would let a bug or injection read every tenant.

The login path is `dbo.usp_FindUserForLogin`, defined `WITH EXECUTE AS 'dawaa_rls_bypass'`. That user has no login. The predicate allows rows only when the session tenant matches, or when `USER_NAME()` is `dawaa_rls_bypass`. The procedure body is fixed and parameterized. `dawaa_app` is granted `EXECUTE` on that procedure only, not `IMPERSONATE`.

## 2026-10-10 — Platform tables are not under RLS

Per the brief, `Tenants` is a platform table. It has no `tenantId` filter predicate. Tenant users never receive a generic tenant-list API. The API loads a tenant only by the id in the signed access token.

`Plans`, `Subscriptions`, and `PlatformUsers` are specified in the schema outline and are not migrated until Phase 1.

## 2026-10-10 — Row version is a SQL Server column Prisma does not type

The installed Prisma SQL Server connector rejects `@db.RowVersion`. Each table still has a real `rowversion` column, declared as `Unsupported("rowversion")`, so the database maintains it and the client does not write it.

## 2026-10-10 — SQL Server has no Prisma enums

The Prisma SQL Server provider cannot declare native enums. Status and type columns are `NVARCHAR` with `CHECK` constraints in `infra/sql/004_checks.sql`. Application code validates them with zod enums in `@dawaa/shared`.

## 2026-10-10 — Money rejects JavaScript numbers

`DECIMAL(18,2)` is the only money representation. Shared helpers accept decimal strings and throw if a JS number is passed, so a float cannot enter the domain by accident. Quantities use integer strings for the same reason.

## 2026-10-10 — Password hashing is argon2id

The library is `@node-rs/argon2` (prebuilt binaries on Windows). Parameters follow the OWASP argon2id baseline: 19 MiB memory, 2 iterations, parallelism 1. High-entropy refresh tokens are stored as SHA-256 hashes, not argon2, so logout and reuse detection stay cheap.

## 2026-10-10 — Cookies stay first-party through the Vite proxy

Access and refresh tokens are httpOnly cookies. The browser talks only to the Vite origin; `/api` is proxied to Nest. That keeps the cookies same-site without putting tokens in `localStorage`.

Suspended tenants may still authenticate. The brief says a suspended subscription is read-only and that POS enforcement waits until the next sync or login. Read-only enforcement itself is Phase 1. Cancelled tenants cannot log in.

## 2026-10-10 — Phase 0 schema is the identity slice

`docs/ARCHITECTURE.md` is the full domain outline. The migrated Prisma schema is only what Phase 0 needs: tenant, branch, user, role, permission, sessions, audit, device. Later phases add tables without rewriting isolation.

The demo tenant is an individual pharmacy on a 14-day trial with the BASIC feature flags stored as data. Plan prices are not hard-coded; the `Plan` table is Phase 1.

## 2026-10-10 — Toolchain on this machine

Node 20 LTS is the CI target. This workstation has Node 24, which satisfies `engines.node >= 20`.

Python 3.12 is the CI target. This workstation has Python 3.14. The analytics service uses only the standard type-hint syntax and FastAPI, which run on both. WeasyPrint is not installed in Phase 0 (it needs native GTK libraries). Arabic PDF export is Phase 9.
