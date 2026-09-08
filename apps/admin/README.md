# apps/admin — admin web panel (Tharun)

React + Vite (web). The operator's control panel, sharing the mobile app's "linen & leaf" design
language (see `src/styles/theme.css` — a bespoke glass/aurora system mirroring `packages/tokens`).

## Screens (all built, all live against `/api/v1`)

- **Dashboard** — today's orders + revenue (count-up), 7-day GMV area chart (recharts), order-mix,
  top products by revenue.
- **Products** — searchable/filterable catalog table, create + edit drawer, live margin preview.
- **Pricing & margins** — operator-only cost/price/margin, inline edit, blended margin per category.
- **Communities & windows** — capacity steppers, delivery days, live 14-day window schedule.
- **Orders** — status filter chips with counts, search, order drawer (items + timeline + status
  transitions), packing / manifest CSV export.
- **Fulfilment** — live kanban board (Confirmed → Packing → On the road → Delivered) with one-tap
  advance and packing CSV.

## Run

```bash
pnpm --filter @f2f/api dev      # backend on :4000 (run this first)
pnpm --filter @f2f/admin dev    # panel on http://localhost:5173
```

The dev server proxies `/api` → `http://localhost:4000` (see `vite.config.js`), so panel and API
share an origin — no CORS, no base URL to configure.

## How it's wired

- `src/lib/api.js` — fetch client over `/api/v1`; throws the contract error as `ApiError`.
- `src/lib/useApi.js` — small `useResource()` hook + a toast bus. **RTK Query is earmarked** (deps are
  installed: `@reduxjs/toolkit`, `react-redux`) and swaps in behind these hooks without touching screens.
  `@tanstack/react-table` and `papaparse` are installed for when a screen outgrows the hand-built tables
  or needs client-side CSV parsing.
- `src/components/` — design-system primitives (aurora background, glass cards, stat count-up, status
  badges, drawer, toaster). `src/screens/` — the six screens above.

## Rules (see `CONTRIBUTING.md`)

- **No server secret ever lands here** — the pre-commit hook blocks it. The panel only ever holds the
  API URL and (at most) the public Supabase anon key for read-only Storage.
- Money is integer **paise**, formatted to rupees only for display (`src/lib/format.js`).
