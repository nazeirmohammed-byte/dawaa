# DAWAA 2.0 – UI/UX audit (Phase 1)

Date: 2026-03-22. Scope: frontend presentation only; backend and workflows unchanged.

## Stack

| Layer | Technology |
| --- | --- |
| Pharmacy app | React 18, Vite 6, react-router 6, react-i18next, single global `index.css` |
| Super admin | React 18, Vite, shared `admin/src/screens.tsx` (large monolith), `index.css` |
| API | NestJS (`apps/api`) – **out of scope for visual redesign** |
| Shared types | `@dawaa/shared` (CJS; not imported in web bundle) |

## Pharmacy tenant – routes (unchanged)

- `/` Login
- `/app` Dashboard (HomeDash)
- `/app/pos`, `/app/sales`, `/app/inventory`, `/app/purchasing`, `/app/prices`, `/app/finance`, `/app/reports`, `/app/alerts`, `/app/customers`, `/app/prescriptions`, `/app/branches`, `/app/users`, `/app/settings`, `/app/account`
- `/admin/*` PlatformHost → admin app shell
- `/subscribe` Subscription request (admin screens)

## Shell & navigation

- **Shell** (`DashboardPage.tsx`): sticky sidebar, grouped expandable nav, permission-filtered items, topbar (title, branch select, search → inventory, touch/lang/settings, alerts bell, profile menu, online chip).
- **UiProvider** (`ui.tsx`): touch mode, light/dark theme (`data-theme`), language toggle, toasts.
- **RTL**: `applyLanguage()` sets `html[dir]`; logical CSS in many places; sidebar still LTR-ordered flex row (fixed in 2.0 tokens/layout).
- **Note**: Icon-only sidebar collapse CSS exists (`data-side="icons"`) but toggle was removed from product; not re-enabled in 2.0 unless requested.

## Major UI surfaces

| Surface | File(s) | Notes |
| --- | --- | --- |
| Dashboard / POS | `HomeDash.tsx` | KPI cards, board lanes, embedded POS |
| Operations | `modules.tsx` (~4k lines) | Inventory, prices, procurement, finance, sales, settings |
| Alerts | `AlertsCenter.tsx` | Standalone alert center |
| Reports | `ReportsHub.tsx` | Report picker + print |
| Stock receive | `stock-post.tsx` | Receive-to-stock workflow |
| Library request | `library-request.tsx` | Tenant global-library requests |
| Login | `LoginPage.tsx` | Tenant + platform admin entry |

## Super admin

- **App** (`apps/admin/src/App.tsx`): platform login, `AdminShell`, routes for tenants, catalog, billing, partners, audit, settings.
- **Visual**: separate `.platform` theme block in web `index.css` (warm stone sidebar) when hosted via `PlatformHost`.

## i18n

- Default **Arabic**; English via `dawaa.lang` + `toggleLanguage`.
- Large key set in `apps/web/src/i18n.ts`; admin uses `locale.tsx` / `tx()`.

## Design tokens (before 2.0)

- Legacy palette: navy sidebar `#17345c`, green accent `#1b8a5a`, red logo `#c23b4a`.
- Touch scaling via `html[data-touch="on"]`.
- Dark mode via `html[data-theme="dark"]`.

## Workflows that must not change

Procurement → goods receiving → batch registration → inventory → price list → sales. No stock from PO alone. Price list activation/approval rules unchanged. Direct payment / no POS FX. Permissions and API paths unchanged.

## Inconsistencies to address in 2.0

1. Mixed legacy colors vs spec brand (#087F8C).
2. No shared React component library (Page, panels ad hoc in CSS).
3. Medicine rows mostly text-only (no category illustration system).
4. Theme switcher in UI state but **not exposed** in pharmacy topbar.
5. Admin and tenant CSS partially duplicated.
6. Heavy `modules.tsx` – redesign via CSS + small shared components first.

## Phase 2+ plan (this branch)

1. Semantic tokens + legacy aliases (`design-system/tokens.css`).
2. Shell polish: brand logo, RTL sidebar order, theme control, breadcrumbs hook.
3. `MedicineIllustration` + static SVG/WebP assets under `public/assets/medicine-illustrations/`.
4. Shared `ds` components (StatCard, StatusBadge, EmptyState, PageHeader).
5. Incremental screen passes (dashboard → procurement → prices → admin).

## Screenshots

Before/after captures to be added under `docs/ui-modernization/screenshots/` as phases complete.
