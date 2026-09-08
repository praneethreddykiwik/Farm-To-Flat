# apps/admin — admin web panel (Tharun)

React + Vite (web, not mobile). The operator's control panel: catalog, pricing, communities and
windows, orders, and the fulfilment screen with CSV exports.

## Run

```bash
pnpm install                       # from repo root
pnpm --filter @f2f/admin dev       # http://localhost:5173
```

The dev server proxies `/api` → `http://localhost:4000`, so run `@f2f/api` alongside it.

## Where things go

- `src/App.jsx` — shell (skeleton). Add `react-router-dom` routes and screens here.
- Uses the shared design tokens in `packages/tokens` (same tokens as the mobile app).
- State + data via `@reduxjs/toolkit` (RTK Query), tables via `@tanstack/react-table`, CSV via
  `papaparse`, charts via `recharts`.

## Rules (see `CONTRIBUTING.md`)

- **No server secret ever lands here** — the pre-commit hook blocks it. The panel only ever holds the
  API URL and (at most) the public Supabase anon key for read-only Storage.
- Money is integer **paise**. The customer-facing serialiser rules apply to any shared response.
