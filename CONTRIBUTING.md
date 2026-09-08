# Contributing to Farm-to-Flat

One **monorepo**, three streams, one `main`. Read this once before your first push.

## Layout

```
apps/customer   Mobile app (Expo / React Native)   — Vivek        · done
apps/admin      Admin web panel (React + Vite)      — Tharun       · skeleton
apps/api        Backend (Node + Express, ESM)       — Adnan/Tharun · skeleton
packages/tokens Shared design tokens (app + admin share these)
prisma/ · db/   Database schema (db/schema.sql is the source of truth today)
docs/           Plans + the FROZEN API contract (docs/api-contract.md)
```

## Setup

```bash
git clone git@github.com:praneethreddykiwik/F2F.git
cd F2F
pnpm install                      # installs every workspace
cp .env.example .env              # fill from docs/handoff-tharun-env.md §2
```

Run just your app:

```bash
pnpm --filter @f2f/api dev        # backend on :4000
pnpm --filter @f2f/admin dev      # admin web on :5173
cd apps/customer && npx expo start --dev-client   # mobile
```

## Streams and ownership

| Stream                       | Owner  | Folder(s)                | Owns                                                                                                                                                         |
| ---------------------------- | ------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Money + core transaction** | Adnan  | `apps/api`, `prisma/`    | Schema, auth, wallet + ledger, coupons, Razorpay (server: order create, webhook, signature, idempotency, reconciliation, refunds), **the order transaction** |
| **Platform + admin**         | Tharun | `apps/api`, `apps/admin` | API contract, catalog + search, cart, delivery windows, the admin web panel, fulfilment screen + CSV                                                         |
| **Mobile**                   | Vivek  | `apps/customer`          | Every customer screen, navigation, state, the AI dietitian                                                                                                   |

## Branches and PRs

- Branch per stream: `money/*`, `platform/*`, `mobile/*`. Never push straight to `main`.
- One review from another dev before merge. Merge mergeable work to `main` the same day.
- **The Prisma/DB schema has one editor at a time.** Announce it, edit it, merge it, tell people to rebase. Never two migrations in flight.

## Non-negotiable rules

- **All money is integer paise.** No floats, anywhere, ever. Money crosses the wire as paise **strings**.
- **No secret ever enters `apps/customer` or `apps/admin`.** The pre-commit hook blocks `SERVICE_ROLE`, `DATABASE_URL`, `RAZORPAY_KEY_SECRET`, `WEBHOOK_SECRET` in those folders. Server secrets live only in `apps/api` env, never committed.
- **Every API route gets a Zod schema** at the boundary — parse, never cast. A route without one should throw at startup.
- **The customer serialiser never emits** `margin`, `procurementCost`, `consumablesCost`, `costPaise`. There is a test in the app that greps for these; keep it green.
- **`pnpm typecheck` and `pnpm test` pass before you say "done."** CI gates on them.
- **Nothing is done until it runs on a physical mid-range Android** (mobile).

## The frozen contract

`docs/api-contract.md` is frozen. Base path `/api/v1`, JSON, Bearer tokens, errors as
`{ error: { code, message, details? } }`. The mobile app runs against a working reference
implementation of every route in `apps/customer/src/api/mock/server.js` — match it field-for-field
and the app needs zero changes. Changing the contract needs agreement from all three.

## Version policy

- Pin **exact** versions in `package.json` (no `^`, no `~`) once resolved; commit the lockfile.
- Install native-touching mobile packages with `npx expo install`, never `pnpm add`.
- Never upgrade the Expo SDK mid-sprint.

_(The two skeleton `package.json` files under `apps/api` and `apps/admin` currently use `^` ranges so
they install cleanly on first run — pin them exact after your first `pnpm install`.)_
