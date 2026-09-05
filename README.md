# Farm-to-Flat

Fresh produce and meat, harvested after you order, delivered to your flat in a window you choose.
Phase 1 monorepo: customer app (Expo), thin admin (Vite), API (Express), Postgres on Supabase.

```
farm-to-flat/
├─ apps/
│  ├─ customer/     Expo / React Native, JavaScript      — Vivek
│  ├─ admin/        Vite + React (placeholder)           — Tharun
│  └─ api/          Express, ESM (placeholder)           — Tharun + Adnan
├─ packages/
│  └─ tokens/       Design tokens shared by mobile and web
├─ prisma/          Schema and migrations (placeholder)  — Adnan
└─ docs/            TDD, SRS, plans, API contract, handoff notes
```

## Quick start (customer app, no backend needed)

```bash
npm i -g pnpm
pnpm install
cd apps/customer && cp .env.example .env
pnpm start
```

Scan the QR code with **Expo Go** (iOS: Camera app → open in Expo Go; Android: Expo Go → Scan). The app runs
against an in-app mock of the API. Dev OTP is `123456`.

Same Wi-Fi not available? `pnpm start:tunnel`.

## Scripts

| Command | What |
|---|---|
| `pnpm dev:customer` | Metro dev server with QR code |
| `pnpm typecheck` | `tsc --noEmit` with `checkJs` across workspaces (CI gate) |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier |

## Read next
- `docs/execution-plan.md` — who does what, day by day
- `docs/api-contract.md` — the frozen `/api/v1` shape the app is built on
- `docs/mobile-handoff.md` — what the mobile stream needs from platform and money
- `docs/tech-stack.md` — versions policy and the three JavaScript guardrails
