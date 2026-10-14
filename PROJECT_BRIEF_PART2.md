# Cursor Build Prompt — Part 2: Database, Menus, UI Design, Price Lists, Drug Catalog & Inventory Entry

> Use together with `PROJECT_BRIEF.md` (Part 1). Save this file as `PROJECT_BRIEF_PART2.md` at the repo root.
> Tell Cursor: "Read PROJECT_BRIEF.md and PROJECT_BRIEF_PART2.md. Part 2 extends and, where it conflicts, overrides Part 1. Implement each section in the phase stated in its header."

## Where each requirement goes (follow this order)

| Section | Topic | Implement in phase |
| --- | --- | --- |
| A | Database name, engine, credentials, connection setup | Phase 0 |
| B | Full table list (schemas + tables) | Phase 0 (base) → each table in the phase of its module |
| C | Design system, colors, interactivity | Phase 0 (tokens + app shell), before any feature screen |
| D | SaaS menus (tenant app + platform admin) | Phase 0 (shell) → items enabled per phase |
| E | Drug master catalog (all dosage forms) + import | Phase 2 |
| F | Price list workflow (versions, bulk changes, Excel export/import, branches) | Phase 2 (sales snapshot in Phase 4) |
| G | Inventory entry (search / barcode, qty, batch, mfg date, expiry default 3 years, serial) | Phase 3 |
| H | Timestamps and audit on every transaction | Phase 0 (base model), enforced in every phase |

---

## A. Database — engine, name, credentials (Phase 0)

### A.1 Engine
| Environment | Engine | Edition |
| --- | --- | --- |
| Development | Microsoft SQL Server 2022 (Docker image `mcr.microsoft.com/mssql/server:2022-latest`) | Developer (free) |
| Production cloud | Microsoft SQL Server 2022 or Azure SQL Database | Standard / General Purpose |
| Branch edge server | Microsoft SQL Server 2022 Express | Express (free, 10 GB per DB) |

Collation: `Arabic_100_CI_AS_SC_UTF8` (Arabic + English search, case-insensitive). All text columns `NVARCHAR`.

### A.2 Databases and logins
| Item | Value (development defaults) |
| --- | --- |
| Main cloud database | `DawaaSaaS` |
| Edge database (branch server) | `DawaaEdge` |
| Test database | `DawaaSaaS_Test` |
| Host / port | `localhost,1433` (Docker service name `mssql` inside compose) |
| Admin login (setup/migrations only) | `sa` / password from `MSSQL_SA_PASSWORD` |
| Application login (API) | `dawaa_app` — `db_datareader`, `db_datawriter`, `EXECUTE`; no DDL |
| Migration login | `dawaa_migrator` — `db_owner` on `DawaaSaaS` only, used by CI/deploy |
| Reporting login (Python analytics) | `dawaa_reporting` — read-only + execute on reporting procs |

Rules:
1. **Never commit real passwords.** Create `.env.example` with placeholders and generate strong random dev passwords in `.env` (git-ignored) via a `scripts/init-env` script.
2. Create the database, logins, users, and roles with an idempotent script `infra/sql/000_init.sql`, run automatically by the compose init container.
3. Connection strings (Prisma format): `sqlserver://mssql:1433;database=DawaaSaaS;user=dawaa_app;password=${DAWAA_APP_PASSWORD};encrypt=true;trustServerCertificate=true` (dev only — production uses a trusted certificate).
4. Generate `docs/DATABASE.md` containing: engine/edition per environment, database names, logins and their permissions (never real passwords), how to connect with SSMS / Azure Data Studio, backup/restore commands, and an ER diagram (Mermaid) per schema. Keep it updated with every migration.

---

## B. Tables (Phase 0 base; each module's tables in its phase)

Use SQL Server **schemas** to group tables (Prisma `multiSchema`). Every tenant-owned table has `TenantId`; every branch-owned table has `BranchId`. Base columns on all tables are defined in Section H.

### `platform` — SaaS owner (no tenant RLS)
`Plan`, `PlanFeature`, `Tenant`, `Subscription`, `SubscriptionInvoice`, `PaymentProof`, `PlatformUser`, `Announcement`, `MasterDrug`, `MasterDrugBarcode`, `DosageForm`, `Manufacturer`, `ActiveIngredient`, `MasterDrugIngredient`

### `core` — tenant organization & security
`Branch`, `Device`, `User`, `Role`, `Permission`, `RolePermission`, `UserBranchRole`, `TenantSetting`, `BranchSetting`, `NumberSequence` (invoice/document numbering per branch)

### `catalog` — tenant products
`Product` (linked to `platform.MasterDrug` when imported), `ProductUnit` (packaging levels + conversion factor), `ProductBarcode`, `Category`, `AlternativeGroup`, `ProductAlternative`

### `pricing`
`ExchangeRate`, `PriceList`, `PriceListItem`, `PriceListBranch`, `PriceListChangeBatch` (each bulk operation), `PriceListImportJob`, `PriceListImportRow`, `PriceHistory`

### `inv` — inventory
`StorageLocation`, `Batch`, `SerialNumber`, `StockBalance`, `StockMovement` (immutable ledger), `OpeningStock`, `OpeningStockLine`, `StockCount`, `StockCountLine`, `StockAdjustment`, `StockAdjustmentLine`, `BranchTransfer`, `BranchTransferLine`

### `purch` — purchasing
`Supplier`, `PurchaseOrder`, `PurchaseOrderLine`, `GoodsReceipt`, `GoodsReceiptLine`, `SupplierInvoice`, `SupplierPayment`, `SupplierReturn`, `SupplierReturnLine`

### `sales`
`Shift`, `ShiftCount`, `SaleInvoice`, `SaleInvoiceLine`, `SaleLineBatch` (FEFO allocations), `Payment`, `SaleReturn`, `SaleReturnLine`, `HeldInvoice`

### `crm` — customers & insurance
`Customer`, `CustomerAllergy`, `CustomerChronicMed`, `Doctor`, `Prescription`, `PrescriptionLine`, `InsuranceCompany`, `InsurancePlan`, `InsurancePlanCoverage`, `InsuranceClaim`, `InsuranceClaimLine`, `ControlledDrugRegister`

### `acc` — accounting
`Account`, `FiscalPeriod`, `JournalEntry`, `JournalLine`, `CashBox`, `BankAccount`, `Expense`, `ExpenseCategory`, `PostingRule`

### `sync`
`SyncOutbox`, `SyncInbox`, `DeviceCheckpoint`, `SyncConflict`

### `audit`
`AuditLog` (append-only, no UPDATE/DELETE permission for `dawaa_app`), `LoginHistory`, `DataExportLog`

---

## C. UI design system, colors, interactivity (Phase 0, before feature screens)

### C.1 Role and quality bar
Act as a senior product designer + frontend engineer. The UI must look like a modern, premium SaaS product (quality reference: Linear, Stripe Dashboard, Shopify POS) — not a generic admin template. Before building each screen, write its user, goal, primary action, and layout in the PR description.

### C.2 Color palette (define as CSS variables + Tailwind theme tokens)

**Light mode**
| Token | Hex | Use |
| --- | --- | --- |
| `primary` | `#0D9488` | Main actions, active menu, links |
| `primary-hover` | `#0F766E` | Hover / pressed |
| `primary-soft` | `#CCFBF1` | Selected rows, soft badges |
| `sidebar-bg` | `#0F172A` | Sidebar background (deep navy) |
| `sidebar-text` | `#CBD5E1` | Sidebar items |
| `sidebar-active` | `#14B8A6` | Active item indicator + icon |
| `accent` | `#6366F1` | Charts highlight, secondary emphasis, info chips |
| `bg` | `#F8FAFC` | Page background |
| `surface` | `#FFFFFF` | Cards, tables, dialogs |
| `border` | `#E2E8F0` | Dividers, inputs |
| `text` | `#0F172A` | Main text |
| `text-muted` | `#64748B` | Secondary text |
| `success` | `#16A34A` | Paid, synced, in stock, POS "Pay" button |
| `warning` | `#F59E0B` | Near expiry, low stock, pending |
| `danger` | `#DC2626` | Expired, errors, void |
| `info` | `#0EA5E9` | Notices, offline-pending |

**Dark mode**: `bg #0B1220`, `surface #111827`, `border #1F2937`, `text #E5E7EB`, `text-muted #94A3B8`, `primary #2DD4BF`, `sidebar-bg #020617`; semantic colors slightly brighter.

**Expiry colors (everywhere):** green = > 180 days · amber = 31–180 days · red = ≤ 30 days or expired (expired also shows a lock icon).

Charts: teal `#0D9488`, indigo `#6366F1`, amber `#F59E0B`, sky `#0EA5E9`, rose `#F43F5E`, slate `#64748B`.

### C.3 Typography & layout
- Fonts: **IBM Plex Sans Arabic** (Arabic) + **Inter** (Latin); tabular numbers for prices, quantities, totals.
- Arabic RTL default, English LTR switch; use logical CSS properties only (`ms/me/ps/pe`, never `ml/mr`).
- 4 px spacing scale, radius 10 px (cards) / 8 px (inputs), soft shadows.
- Layout: collapsible sidebar (icons-only mode), top bar with branch switcher, global search (Ctrl+K), sync status, notifications bell, user menu, language and theme toggle.

### C.4 Interactivity (make it feel alive, but fast)
- shadcn/ui (Radix) + lucide-react icons + Framer Motion + Recharts.
- Hover elevation on cards, 150–200 ms transitions, animated number counters on KPI tiles, scanned item flash-highlight in the cart, toast notifications, smooth drawer/dialog animations, skeleton loaders (no spinners on pages).
- Optimistic updates; undo instead of confirm where safe; inline validation in Arabic.
- Every data view designs 4 states: loading, empty (illustration + action), error (message + retry), populated.
- Keyboard-first: visible focus rings, shortcuts in tooltips, Ctrl+K command palette (screens, products, actions).
- Accessibility WCAG 2.1 AA; touch targets ≥ 44 px; respect `prefers-reduced-motion`.
- **Performance guard:** must stay smooth on Core i3 / 4 GB RAM / Chrome 109 — no heavy blur/3D on POS, virtualize long tables, lazy-load charts.

### C.5 Deliverables & self-review
1. Build `/styleguide` showing all tokens and components in light/dark, Arabic/English. **Stop and show me screenshots before building screens.**
2. After each screen: Playwright screenshots at 1366×768 and mobile width (AR-light, AR-dark, EN-light), self-review against Section C, apply 5 improvements, then show me the result.

---

## D. SaaS menus (Phase 0 shell; items appear as phases are delivered)

Menus are **permission- and plan-driven**: an item shows only if the user has the permission and the tenant plan has the feature. Group-only items show only for `GROUP` tenants.

### D.1 Tenant application (Arabic label / English label)
1. **لوحة التحكم / Dashboard**
2. **نقطة البيع / POS** — Sell · Held invoices · Returns · Shift open/close
3. **الأصناف / Products** — Product list · Add from drug catalog · Units & barcodes · Categories · Alternatives · Print barcode labels
4. **قوائم الأسعار / Price Lists** — All price lists · New / copy list · Bulk change · Export / import Excel · Exchange rates · Price history
5. **المخزون / Inventory** — Stock on hand · Opening stock · Batches & serials · Expiry board · Stock count · Adjustments & damage · Storage locations
6. **المشتريات / Purchasing** — Purchase orders · Goods receipt · Supplier invoices · Supplier returns · Suppliers
7. **التحويلات / Transfers** *(Group)* — Send · Receive · Transfer history
8. **العملاء والتأمين / Customers & Insurance** — Customers/patients · Prescriptions · Insurance companies & plans · Claims · Controlled drugs register
9. **الحسابات / Accounting** — Journal entries · Expenses · Cash boxes & wallets · Banks · Customer ledger · Supplier ledger · Financial statements · Period closing
10. **التقارير / Reports** — Sales · Profit · Inventory · Expiry · Purchases · Financial · Insurance · Audit · Branch comparison *(Group)*
11. **الفروع / Branches** *(Group)* — Branch list · Branch performance
12. **المستخدمون والصلاحيات / Users & Roles** — Users · Roles · Permissions · Audit log
13. **الإعدادات / Settings** — Pharmacy profile · Branch settings · Printers & devices · Pricing rules & rounding · Expiry thresholds & default shelf life · Payment methods · Numbering · Backup
14. **الاشتراك / Subscription** — Current plan · Invoices · Upload payment proof · Upgrade

### D.2 Platform admin portal (SaaS owner)
Dashboard (MRR, active tenants, trials, overdue) · Tenants · Subscriptions & invoices · Payment proofs (approve/reject) · Plans & features · **Drug master catalog** (import, review, publish) · Dosage forms, manufacturers, active ingredients · Announcements · Usage & health · Platform users · Audit log

---

## E. Drug master catalog — all dosage forms (Phase 2)

1. A **platform-level master catalog** (`platform.MasterDrug`) holds all medicines and pharmacy items, shared read-only by all tenants. It is maintained from the admin portal.
2. Supported dosage forms (`platform.DosageForm`, seeded, extendable): tablet, film-coated tablet, effervescent tablet, capsule, syrup, suspension, oral solution, oral drops, eye drops, ear drops, nasal drops/spray, injection — ampoule, injection — vial, pre-filled syringe, IV infusion, cream, ointment, gel, lotion, suppository, pessary, inhaler, nebuliser solution, sachet, powder, lozenge, transdermal patch, medical device, consumable, cosmetic, supplement.
3. MasterDrug fields: trade name (AR/EN), generic name, active ingredients + strength, dosage form, route, manufacturer, country, pack description, default units & conversion (e.g. box = 3 strips = 30 tablets), GTIN/barcodes, `IsControlled`, `RequiresPrescription`, `TrackSerial` default, ATC code (optional), status.
4. **Bulk import** (Python analytics service): Excel/CSV template download → upload → validation report (duplicates, missing fields, unknown dosage form) → preview → publish. Re-import updates by GTIN or code without creating duplicates.
5. Tenants **do not type medicines manually**: in "Add from drug catalog" they search the master catalog (name / generic / barcode), select one or many, and import them into their own `catalog.Product` (keeping a link to the master record). Tenants can still create a local product when it is missing from the master, flagged "local" for platform review.

---

## F. Price list workflow (Phase 2; sales price snapshot in Phase 4)

Prices change frequently because of the exchange rate. The workflow must allow fast mass changes **without ever changing historical sales**.

### F.1 Data model
- `PriceList`: `Id`, `TenantId`, `Code`, `Name`, `Type` (GENERAL / INSURANCE / WHOLESALE / STAFF), `Status` (DRAFT / ACTIVE / ARCHIVED), `VersionNo`, `SourcePriceListId` (copied from), `ExchangeRateUsed`, `EffectiveFrom`, `EffectiveTo`, `ActivatedAt`, `ActivatedBy`, `Notes`, + base columns (Section H).
- `PriceListItem`: `PriceListId`, `ProductId`, `ProductUnitId`, `Price DECIMAL(18,2)`, `CostReference`, `MarginPct`, `IsManualOverride`, + base columns.
- `PriceListBranch`: `PriceListId`, `BranchId` — which branches use this list.
- `PriceListChangeBatch`: records every bulk operation (rule, filter, value, rows affected, user, timestamp).

### F.2 Rules
1. **ACTIVE lists are locked** (read-only). To change prices: **"Copy to new list"** → creates a DRAFT with `VersionNo + 1` and `SourcePriceListId` → edit → activate.
2. **Activation:** user selects which branches the list applies to (multi-select; individual tenants auto-select their single branch). Activating a list for a branch automatically archives (sets `EffectiveTo`) the previous active list of the same type for that branch. Only one ACTIVE list per type per branch at any time (enforce with a DB constraint/trigger + service check).
3. Optional scheduled activation (`EffectiveFrom` in the future) handled by a job.
4. **Historical sales are never affected:** each `SaleInvoiceLine` stores a snapshot of `UnitPrice`, `PriceListId`, `PriceListVersionNo`, `UnitCost`, and discount at the time of sale. Reports use the snapshot, never the current list.
5. Archived lists remain viewable and can be copied again.

### F.3 Editing a DRAFT list — three ways
1. **Bulk change all (or filtered) items at once**
   - Filters: all items, category, manufacturer, dosage form, USD-linked items, or a manual selection.
   - Operations: increase/decrease by **percentage** (e.g. +15%) · increase/decrease by **fixed amount** (e.g. +500 SDG) · **set by exchange rate** (cost in USD × new rate × (1 + margin)) · set margin % on cost.
   - Rounding rule (none / nearest 10 / 50 / 100 SDG, up or nearest).
   - Apply per unit level (box, strip, tablet) or recalculate smaller units from the box price by conversion factor.
   - **Preview grid** before applying: old price, new price, difference, % change; highlight items below cost in red. Apply only after confirmation; log a `PriceListChangeBatch`.
2. **Item by item:** editable data grid (search, filters, keyboard navigation, inline edit, undo), showing cost and margin live.
3. **Excel export → edit → upload**
   - Export: `.xlsx` with columns `PriceListItemId` (hidden/locked), `ProductCode`, `Barcode`, `TradeName`, `GenericName`, `Unit`, `Cost`, `CurrentPrice`, `NewPrice` (only editable column), sheet protected except `NewPrice`, Arabic RTL sheet.
   - Upload: validate (unknown IDs, non-numeric, negative, below cost warning) → **diff report** (changed / unchanged / errors) → apply to the DRAFT only.
   - Export/import is logged in `DataExportLog` / `PriceListImportJob`.

### F.4 Screens
Price lists overview (cards with status badge, version, branches, effective date) · Price list detail (grid + toolbar: Bulk change, Export, Import, Copy to new list, Activate) · Bulk change wizard (Filter → Rule → Preview → Apply) · Activate dialog (branch multi-select + effective date) · Exchange rates (history + chart) · Price history per product.

---

## G. Inventory entry — search or barcode, expiry, serial (Phase 3)

Applies to **Opening stock**, **Goods receipt**, and **Adjustments (increase)**.

1. **Add item** by either:
   - **Search & select** from the tenant products / master catalog (autocomplete by trade name, generic name, code), or
   - **Barcode scan** (keyboard-wedge scanner or camera on mobile) — cursor stays in the scan field; each scan adds or increments the line.
2. For each line the user enters/edits: **Unit** (box/strip/tablet…), **Quantity**, **Batch/Lot number**, **Production (manufacturing) date**, **Expiry date**, **Serial number** (optional; required only if the product has `TrackSerial`), purchase cost, bonus qty, storage location.
3. **Default expiry:** when the expiry date is unknown, set `ExpiryDate = entry date + default shelf life`, default **36 months (3 years)**, configurable in Settings (tenant and per product). The field stays editable, and the line shows an "estimated expiry" badge until a user confirms or a barcode supplies the real date.
4. **GS1 barcode parsing:** if the scanned code is a GS1 DataMatrix / GS1-128, parse Application Identifiers and auto-fill, overriding defaults:
   - `(01)` GTIN → product · `(10)` batch/lot · `(11)` production date · `(17)` expiry date · `(21)` serial number.
   Plain EAN/UPC barcodes only identify the product; the user fills the rest.
5. **Validation:** expiry > production date; expiry > today (else block as expired); warning when remaining shelf life < tenant threshold (default 6 months); duplicate serial numbers rejected; quantity > 0.
6. Saving the document creates `inv.Batch` (and `inv.SerialNumber` rows when applicable) and immutable `inv.StockMovement` rows in base units.
7. Screen UX: fast entry grid, big scan field with sound + flash feedback on success/error, running totals (lines, quantity, value), keyboard shortcuts (Enter next field, F2 search, Ctrl+S save).

---

## H. Timestamps & audit on every transaction (Phase 0 base, enforced everywhere)

1. Base columns on **every** table:
   `CreatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()`, `CreatedBy UNIQUEIDENTIFIER`, `UpdatedAt DATETIME2(3) NULL`, `UpdatedBy UNIQUEIDENTIFIER NULL`, `RowVersion ROWVERSION`.
2. Transaction/document tables also have: `TransactionAt DATETIME2(3)` (business time; may differ from `CreatedAt` for offline entries), `BranchId`, `DeviceId`, `ShiftId` (sales), `DocumentNo` (from `core.NumberSequence`), `Status`.
3. `inv.StockMovement`, `audit.AuditLog`, and posted financial documents are **append-only** — corrections are made with reversing documents, never updates/deletes (enforce via DB permissions + triggers).
4. Store UTC; display in `Africa/Khartoum`. Show "created by / at" and "last updated by / at" on every document screen.
5. Audit log captures: entity, entity ID, action, old values, new values (JSON), user, branch, device, IP, timestamp — at minimum for price changes, price list activation, stock adjustments, voids/returns, discounts over limit, user/role changes, logins, exports, impersonation.
