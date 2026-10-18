# DAWAA 2.0 – implementation progress

Branch: `feature/dawaa-2-ui`

## Completed in this pass

| Phase | Deliverable |
| --- | --- |
| 1 | [DAWAA-2-AUDIT.md](./DAWAA-2-AUDIT.md) – stack, routes, shell, protected workflows |
| 2 | `apps/web/src/design-system/tokens.css` – semantic tokens + legacy aliases, RTL sidebar order, dark theme |
| 2 | `apps/web/src/components/ds.tsx` – PageHeader, StatCard, StatusBadge, EmptyState, LoadingSkeleton, ErrorState |
| 6 | `medicine-art.ts`, `MedicineIllustration.tsx`, `public/assets/medicine-illustrations/*.svg` |
| 3 | Shell: DAWAA logo, breadcrumbs, **light/dark toggle** in topbar, refreshed sidebar/topbar styling |
| 4 | Procurement medicine picker: category illustrations on search rows |

## Next (recommended order)

1. Apply `MedicineIllustration` to inventory, POS, and price-list pickers (same row pattern).
2. Migrate KPI/dashboard blocks to `StatCard` + refined chart CSS in `HomeDash.tsx`.
3. Login/onboarding visual pass (brand panel, form fields).
4. Super admin: import shared tokens or duplicate minimal platform palette in `apps/admin/src/index.css`.
5. Lucide icons (optional package) for sidebar marks without changing routes.
6. Screenshot folder `docs/ui-modernization/screenshots/` before/after per module.

## Verification run

- `pnpm --filter @dawaa/web typecheck`
- `pnpm --filter @dawaa/web exec vite build`

## Unchanged by design

- All API paths, ops logic, DB schema, permissions, procurement/receive/sales workflows.
