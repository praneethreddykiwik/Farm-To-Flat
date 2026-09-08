# apps/api — backend (Adnan · Tharun)

Node + Express (ESM). Base path `/api/v1`. Owners: **Adnan** (auth, wallet, coupons, payments, the
order transaction) and **Tharun** (catalog, cart, delivery windows, admin endpoints).

## Run

```bash
pnpm install                     # from repo root
pnpm --filter @f2f/api dev       # http://localhost:4000/health
```

Fill env from `docs/handoff-tharun-env.md §2` into the repo-root `.env` (or `apps/api/.env`).
**Server secrets live here only** — never in `apps/customer` / `apps/admin`.

## Where things go

- `src/index.js` — app bootstrap (health, helmet, logging, error shape, `validate()` middleware). Done.
- `src/routes/*` — one router per resource. Mount them in `index.js`.
- `src/db` — Prisma client. Schema is `db/schema.sql` today; the canonical `prisma/schema.prisma`
  is Adnan's Day-1 task (`docs/handoff-tharun-env.md`).

## Rules (see `CONTRIBUTING.md`)

- Money is integer **paise**, serialised as strings. No floats.
- **Zod at every boundary** — use `validate(schema)`.
- The customer serialiser never emits `margin`, `procurementCost`, `consumablesCost`, `costPaise`.
- Match `apps/customer/src/api/mock/server.js` field-for-field so the app needs zero changes.
