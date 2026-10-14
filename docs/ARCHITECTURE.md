# Dawaa architecture

Dawaa is a multi-tenant pharmacy management SaaS for Sudan. A tenant is either one pharmacy (`INDIVIDUAL`) or a group with a head office and branches (`GROUP`). Phase 0 is the foundation: monorepo, SQL Server, API, web shell, Arabic RTL, and authenticated login. Later phases add catalog, stock, POS, sync, accounting, and reports. They must fit the isolation and money rules below.

There are no containers. Local SQL Server and process managers run every service. See `docs/DECISIONS.md`.

## Runtime

| Process | Port | Role |
| --- | --- | --- |
| `apps/api` NestJS | 4190 | System of record. The browser reaches it through the Vite proxy. |
| `apps/web` React | 4188 | Tenant app. Arabic RTL by default. Open `http://127.0.0.1:4188`. |
| `apps/admin` | — | Not created. Platform administration stays a later phase. |
| `apps/analytics` | 8000 | Not started. The API may probe it; a refused connection is expected. |
| `apps/print-bridge` | — | Not created. Receipts use the browser draft already in the tenant app. |
| SQL Server | 1433 | Database `dawaa` on the local instance. |
| Redis | 6379 | Not installed. Health reports Redis disabled. |

Dates are stored in UTC. The UI formats them in `Africa/Khartoum` with Western digits (`ar-SD-u-nu-latn`).

## Phase 0 identity model

These tables exist in Prisma and in SQL Server now.

```text
Tenants                 platform table, no RLS
Branches                tenant-owned
Users                   tenant-owned
Roles                   tenant-owned
Permissions             tenant-owned copy of the catalog
RolePermissions         tenant-owned
UserBranchRoles         tenant-owned
RefreshSessions         tenant-owned
AuditLogs               tenant-owned, append-only in the app
Devices                 tenant-owned
```

Every tenant-owned table has:

- `id` `UNIQUEIDENTIFIER` (client-generatable later for offline sales)
- `tenantId` `UNIQUEIDENTIFIER NOT NULL`
- `createdAt`, `createdBy`, `updatedAt`, `updatedBy` where the row is mutable
- `rowVersion` `ROWVERSION`
- an index that starts with `tenantId`
- `@@unique([tenantId, id])` so Prisma can scope `findUnique` / `update` / `delete` and so child foreign keys include the tenant

Child rows use a composite foreign key `(tenantId, parentId) -> parent (tenantId, id)`. A role assignment cannot point at a user from another tenant even if a query forgets the tenant filter.

`Tenants` is the platform record. Its primary key is the tenant id. It is not under RLS. The only tenant read in Phase 0 is “the tenant id from the access token”.

Soft delete (`isDeleted`) is on users, branches, roles, permissions, and devices. Audit rows and refresh sessions are not soft-deleted. Sessions are revoked. Audit rows are insert-only in application code.

## Prisma schema outline (full product)

The lists below are the contract for later migrations. They are not all created in Phase 0. Names are the future Prisma models. Money columns are `Decimal @db.Decimal(18, 2)`. Exchange rates are `Decimal @db.Decimal(18, 6)`. Quantities in base units are integers. Prisma cannot declare SQL Server enums; those columns stay `NVARCHAR` plus `CHECK` constraints, with zod enums in `@dawaa/shared`.

### Platform (no RLS) — Phase 1 unless noted

| Model | Purpose | Key fields |
| --- | --- | --- |
| `Tenant` | Customer account. **Migrated in Phase 0.** | `type`, `dbMode` (`SHARED` \| `DEDICATED`), `status`, trade name AR/EN, license, phone, email, `featureFlags`, `trialEndsAt` |
| `Plan` | Sellable plan. Prices live here, never in code. | `code`, `tenantType`, `features` JSON, `limits` JSON, `monthlyPrice`, `yearlyPrice`, `currency` |
| `Subscription` | Tenant’s current plan. | `tenantId` stored as data but the table is platform-scoped, `status`, `cycle`, `trialEndsAt`, `currentPeriodEnd` |
| `SubscriptionInvoice` | Bill for a cycle. | amounts, `dueAt`, `status` |
| `PaymentProof` | Bankak or transfer receipt uploaded by the tenant. | file reference, `status` (`PENDING` \| `APPROVED` \| `REJECTED`), reviewer, reason |
| `PlatformUser` | Super-admin login for `apps/admin`. | email, password hash, role |

`Tenant.dbMode` stays `SHARED` until a dedicated-database connection resolver exists. The resolver must sit behind the same `TenantDb` API so feature code does not branch.

### Identity — Phase 0 (migrated)

| Model | Purpose | Key fields |
| --- | --- | --- |
| `Branch` | One store. An individual tenant has exactly one. | `code`, names AR/EN, `isHeadOffice`, city, state, phone |
| `User` | Person inside one tenant. | email, phone `+249`, `passwordHash`, optional `pinHash`, `displayName`, `isActive` |
| `Role` | Seeded system roles, later custom roles. | `code`, `isSystem` |
| `Permission` | Fine-grained code such as `price.edit`. | `code` |
| `RolePermission` | Role to permission. | composite FK to both |
| `UserBranchRole` | Role of a user at a branch. | user, branch, role |
| `RefreshSession` | Revocable refresh token. | `tokenHash`, `expiresAt`, `revokedAt`, `replacedById` |
| `Device` | A POS terminal. | `branchId`, `name`, `lastSyncAt` |
| `AuditLog` | Sensitive actions. | `actorId`, `action`, `entityType`, `entityId`, `details` |

Seeded role codes: `OWNER`, `BRANCH_MANAGER`, `PHARMACIST`, `ASSISTANT_PHARMACIST`, `CASHIER`, `STOREKEEPER`, `ACCOUNTANT`.

### Catalog and units — Phase 2

| Model | Purpose | Key fields |
| --- | --- | --- |
| `Category` | Product grouping. | names AR/EN |
| `Manufacturer` | Drug manufacturer. | name |
| `Product` | Trade item. | names AR/EN, generic name, dosage form, strength, `isControlled`, `requiresPrescription`, `reorderLevel` |
| `ProductUnit` | Packaging level. | `name`, `factorToBase` (integer), `isBase` |
| `Barcode` | Many barcodes per product unit. | `code`, `symbology` |
| `AlternativeGroup` | Same active ingredient. | name |
| `ProductAlternative` | Product membership in a group. | product, group |

Stock is an integer count of the base unit (usually the tablet). A sale line stores the unit the cashier picked and the factor used, so a later edit to packaging does not rewrite history.

### Inventory — Phase 3

| Model | Purpose | Key fields |
| --- | --- | --- |
| `StorageLocation` | Shelf or fridge. | branch, name |
| `Batch` | One lot. | product, batch number, expiry, `purchaseCostPerBase` decimal, supplier |
| `StockBalance` | Derived cache. | branch, batch, `qtyBase` integer. Recomputed from the ledger. |
| `StockMovement` | Immutable ledger. | `type` (`RECEIVE`, `SALE`, `RETURN`, `ADJUST`, `TRANSFER_OUT`, `TRANSFER_IN`, `DAMAGE`, `EXPIRE`), `qtyBase`, batch, source document id |
| `StockCount` | Count session. | branch, status |
| `StockCountLine` | Counted qty vs system qty. | product, batch, variance |

`StockBalance` is never edited by the POS. Offline sales append movements; the server replays them.

### Purchasing — Phase 3

`Supplier`, `PurchaseOrder`, `PurchaseOrderLine`, `GoodsReceipt`, `GoodsReceiptLine` (batch and expiry required, bonus qty), `SupplierInvoice`, `SupplierPayment`, `SupplierReturn`.

Receipt lines store cost as `Decimal(18,2)` per base unit. Remaining shelf life is rejected below the tenant threshold (default 6 months) unless a permitted user overrides. That rule is Phase 3.

### Pricing — Phase 2

| Model | Purpose | Key fields |
| --- | --- | --- |
| `PriceList` | `GENERAL`, `INSURANCE`, `WHOLESALE`, `STAFF`. | code |
| `ProductPrice` | Price of one unit level on one list. | `amount`, `effectiveFrom` |
| `PriceHistory` | Every change. | old, new, reason, actor |
| `ExchangeRate` | SDG per 1 USD. | `rate Decimal(18,6)`, `effectiveOn`, `source` |
| `PricingRule` | Margin, USD-linked flag, rounding increment (for example 50 SDG). | margin percent as decimal, `roundTo` |

USD-linked price = cost in USD × current rate × (1 + margin), then rounded. Rates and margins come from these tables, never from constants in code.

Rounding helper (already in `@dawaa/shared`): half-up to the nearest increment, using decimal strings.

### Sales — Phase 4

`Shift`, `SaleInvoice`, `SaleLine` (unit, qty, `qtyBase`, price, discount, batch allocations), `Payment` (`CASH`, `BANKAK`, `FAWRY`, `TRANSFER`, `CREDIT`, `INSURANCE`), `SaleReturn`.

Invoice and payment ids are client-generated UUIDs so an offline sale can be inserted once. `Idempotency-Key` is required on those POSTs. A second request with the same key returns the original row.

FEFO walks non-expired batches by expiry ascending. Expired batches never allocate. Controlled products require a prescription id. Those rules are pure functions with unit tests in Phase 4; they must not live only in the UI.

### People, insurance, controlled drugs — Phase 7

`Customer`, `InsuranceCompany`, `InsurancePlan`, `InsurancePlanProduct`, `Prescription`, `PrescriptionLine`, `InsuranceClaim`, `InsuranceClaimLine`, `ControlledDrugRegister`.

Patient fields are hidden unless the caller has the matching permission. Exports write an audit row.

### Transfers — Phase 8

`BranchTransfer`, `BranchTransferLine`. Status moves `DRAFT -> ISSUED -> IN_TRANSIT -> RECEIVED` or `DISCREPANCY`. Issue and receipt are separate documents. Stock moves only through `StockMovement`.

### Accounting — Phase 6

`Account`, `JournalEntry`, `JournalLine`, `CashBox`, `BankAccount`, `Expense`, `CustomerLedger`, `SupplierLedger`.

Journal lines use `Decimal(18,2)`. A posting rule must balance (debits = credits) before insert; the test for that rule is part of Phase 6. Currencies: SDG base and optional USD, with an explicit FX difference account. No floats.

### Sync — Phase 5

`SyncOutbox`, `SyncInbox`, `DeviceCheckpoint`.

Ownership:

- Catalog, price lists, settings: server wins.
- Sales, shifts, receipts, counts: branch-owned, append-only after sync, reversed only by a return document.
- Stock balance: derived on the server after movements apply.

`OperationId` is the idempotency key. Negative stock from two offline devices is allowed and flagged, not silently dropped.

## Row-level security

Defense in depth, both layers mandatory:

1. **Application.** `TenantContext` (AsyncLocalStorage) is filled from the verified access token. `TenantDb` is a Prisma client extension. For every tenant-owned model it:
   - throws if there is no tenant id
   - throws if the id is not a UUID
   - injects `tenantId` into `where` / `create` / `createMany`
   - rewrites unique `where: { id }` to `where: { tenantId_id: { tenantId, id } }`
   - rejects a payload whose `tenantId` disagrees with the context
   - rejects nested relation writes (those skip the flat injection)
2. **Database.** Security policy `dbo.TenantIsolation` applies `FILTER` and `BLOCK` predicates on every tenant-owned table.

Predicate:

```sql
CREATE FUNCTION dbo.fn_rls_tenant(@TenantId uniqueidentifier)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
  SELECT 1 AS fn_result
  WHERE
    USER_NAME() = N'dawaa_rls_bypass'
    OR @TenantId = CONVERT(uniqueidentifier, SESSION_CONTEXT(N'TenantId'));
```

When the session key is missing, `CONVERT` of NULL is NULL, the comparison is unknown, and the row is invisible. A bad or missing context fails closed.

`BLOCK` covers `AFTER INSERT` and `AFTER UPDATE`, so a row cannot be written into another tenant and an update cannot move a row across tenants.

Login cannot know the tenant yet, and a fail-closed policy would hide every user. The only cross-tenant read is:

```sql
CREATE PROCEDURE dbo.usp_FindUserForLogin
  @Identifier nvarchar(320)
WITH EXECUTE AS 'dawaa_rls_bypass'
```

`dawaa_rls_bypass` is a user without a login. The procedure returns at most two matches for one identifier. The API refuses ambiguous matches. See `docs/DECISIONS.md` for why this is not a session-context bypass flag.

Request flow for a normal query:

```text
cookie access token
  -> verify signature
  -> AsyncLocalStorage.tenantId
  -> Prisma interactive transaction
       EXEC sp_set_session_context @key=N'TenantId', @value=@tid, @read_only=0
       extension adds tenantId to the statement
       SQL Server policy filters the rows again
       EXEC sp_set_session_context @key=N'TenantId', @value=NULL, @read_only=0
```

Two database logins:

| Login | Rights | Used by |
| --- | --- | --- |
| `dawaa_migrator` | database owner | Prisma migrate, RLS scripts, seed |
| `dawaa_app` | `SELECT/INSERT/UPDATE/DELETE` on schema `dbo`, `EXECUTE` on the login procedure | API |

`dawaa_app` is not `db_owner`, so it cannot disable the security policy. Integration tests connect as `dawaa_app` and prove tenant A cannot read or update tenant B, and that a cleared session context returns no user rows.

Adding a tenant-owned table later requires all of:

- `tenantId` plus an index starting with it
- `@@unique([tenantId, id])` and composite FKs
- the model name in `TENANT_SCOPED_MODELS` (`packages/shared`)
- the table name in `infra/sql/001_rls.sql`
- the unit test that fails if the SQL policy omits a table

## Auth

- Access token: JWT, 15 minutes, httpOnly cookie `dawaa_access`.
- Refresh token: JWT, 7 days, httpOnly cookie `dawaa_refresh`. The database stores only the SHA-256 of the token. Rotation on refresh. Presenting a revoked token revokes the user’s remaining sessions.
- Passwords: argon2id.
- Optional cashier PIN is a column only in Phase 0. The PIN login screen comes with the POS.
- Cancelled tenants cannot log in. Suspended tenants can authenticate; blocking sales is Phase 1.
- Unknown user and wrong password return the same error. Disabled accounts get a distinct message so the owner can tell those cases apart.

## API

- Prefix `/api/v1`.
- Errors: `{ code, message, messageKey, details }`. `message` follows `Accept-Language` (`ar` default, otherwise `en`). `messageKey` is stable for the client.
- OpenAPI: `/api/docs`.
- Health: `/api/v1/health`.
- Analytics is called only with `ANALYTICS_SERVICE_TOKEN` and is not part of the public OpenAPI surface. Its own docs are disabled.

## Web

Arabic is the default language and the layout is RTL. English is LTR. The choice is stored in `localStorage` (`dawaa.lang`). Buttons and inputs are at least 44px. The POS bundle budget (under 300 KB gzipped) applies when the POS route exists; Phase 0 only ships the shell, and the route is code-split later so the POS does not download accounting.

The service worker uses `NetworkOnly` for `/api` so a cached shell cannot replay a sale.

## Money and units (shared, tested)

`@dawaa/shared` currently provides:

- `addMoney`, `subMoney` on decimal strings, scale 2
- `roundToIncrement` (half-up)
- `toBaseUnits` for integer qty × integer factor

JavaScript `number` is rejected. Phase 2 pricing and Phase 4 FEFO must build on these helpers rather than reimplement them.

## What is running now

Phase 0 is in place on database `dawaa`: monorepo, NestJS, React Arabic RTL, JWT cookies, tenant context, and row-level security. The live schema has also grown, additively, through catalog, stock, purchasing, sales, a simple ledger, and versioned price lists. Those tables follow the same `tenantId` and RLS rules. They are not a second database.

`PROJECT_BRIEF.md` is the product contract. `PROJECT_BRIEF_PART2.md` still wins on the points already accepted in `docs/DECISIONS.md`: no containers, keep `dawaa`, and the teal/navy shell.

Still not built, and not started in this pass:

- Self-enrollment, `Plan` / `Subscription` / payment proofs, and `apps/admin`
- Offline outbox, Dexie, and an edge SQL Server
- Insurance, prescriptions, controlled-drug register, shifts, and branch-transfer documents
- Python Excel/PDF reports
- The section 11A shell (right sidebar and the `#064E4A` palette)

The next phase to approve is subscriptions and enrollment. Do not recreate Phase 0 to get there.
