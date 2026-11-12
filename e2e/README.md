# End-to-end & quality tooling

Four additive test layers that sit alongside the unit/integration suites (`pnpm test`). None of them
ship in the app; they test a running deployment or the database.

| Tool              | What it checks                                                                  | How to run                                                                                                                   | Target                                                                                     |
| ----------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Playwright**    | Real browser clicks through pages; broken layouts, dead content, console errors | `cd e2e && pnpm install && pnpm install-browsers && pnpm test`                                                               | `E2E_BASE_URL` (default `https://fooducia.in`) — the public pages, or a **staging** deploy |
| **Lighthouse CI** | Performance + accessibility scores on the public pages                          | GitHub Action `lighthouse` (PRs touching admin, weekly, manual); locally `npx @lhci/cli autorun --config=.lighthouserc.json` | Live public URLs in `.lighthouserc.json`                                                   |
| **OWASP ZAP**     | Passive security baseline scan                                                  | GitHub Action `zap-baseline` (**manual/weekly only**)                                                                        | `STAGING_URL` secret — **staging only**, the workflow refuses prod                         |
| **pgTAP**         | Formal Postgres invariants: RLS on every table, no anon writes                  | `supabase test db`, or `psql "$DATABASE_URL" -f supabase/tests/database/security.test.sql` (needs the `pgtap` extension)     | A DB with the schema applied (local/staging)                                               |

## Notes & next steps

- **Playwright** currently covers the no-login public pages (privacy, terms, account-deletion) plus a
  mobile-overflow check. To test the operator console, add a `storageState` login fixture (a signed-in
  session) — there's a commented block in `tests/smoke.spec.ts` showing where.
- **ZAP** needs a `STAGING_URL` repo secret. Point it at the Render staging API / a Vercel preview,
  never `api.fooducia.in` / `fooducia.in` / `fooducia.health` — the workflow guard enforces this.
- **Lighthouse** gates accessibility at ≥0.90 (hard) and warns on performance/SEO so a slow third
  party never blocks a merge. Tune thresholds in `.lighthouserc.json`.
- These are intentionally **not** wired to run on every push (they need external targets and are
  slower); they run on schedule, on demand, or on PRs that touch the relevant surface.
