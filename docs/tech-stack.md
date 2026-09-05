# Farm-to-Flat — Technology Stack

**Scope:** everything needed to build and run Phase 1
**Companion to:** TDD v1.0 (design and flows) and SRS v3.0 (requirements)
**Lives at:** `docs/tech-stack.md` in the repo

---

## How to read this

**Versions here are policy, not pins.** Exact minor versions must be resolved at install time and then committed to the lockfile. A stack document that hard-codes `4.17.21` becomes wrong within a month and misleading within three. What matters is the major version and the reason for the choice — both of which are stated.

**One rule that will save the team a day:** in an Expo project, install native-touching packages with `npx expo install <pkg>`, never `pnpm add <pkg>`. Expo resolves the version that matches your SDK. Installing Reanimated or Gesture Handler directly gives you a version that compiles and then crashes on device, and the error message will not tell you why.

---

## 1. Languages and runtimes

| Layer | Choice | Version policy |
|---|---|---|
| Language | **JavaScript (ESM)** | No TypeScript. Guardrails in §7 |
| Runtime — server | **Node.js LTS** (22.x) | LTS only. Never odd-numbered releases |
| Runtime — mobile | **Hermes** | Bundled with Expo. Enabled by default; leave it on |
| Package manager | **pnpm 9+** | Workspaces. Committed lockfile, `--frozen-lockfile` in CI |
| Monorepo | **Turborepo 2.x** | Task graph and caching |
| Database | **PostgreSQL 15+** | Whatever Supabase provisions |

**Why JavaScript, given the risk:** this was a deliberate call by the team lead who will be working in the codebase daily. It is workable, but only with the three guardrails in §7 — those are not optional decoration, they are the substitute for a compiler in a codebase that moves money.

---

## 2. Mobile application — `apps/customer`

React Native via Expo. One codebase, both stores, and OTA updates that matter enormously inside a fifteen-day window.

### Core

| Package | Purpose | Notes |
|---|---|---|
| `expo` | Framework and toolchain | Use the **latest stable SDK**. Pin it, and do not straddle two SDKs across the monorepo |
| `react-native` | Runtime | Version is dictated by the Expo SDK. Never chosen independently |
| `react` | UI library | Also dictated by the SDK |
| `expo-router` | File-based routing | Typed routes, deep linking, and shared-element transitions between screens |
| `expo-dev-client` | Custom development build | Required — the Razorpay SDK is native and will not run in Expo Go |

### UI and styling

| Package | Purpose | Notes |
|---|---|---|
| `nativewind` (v4) | Tailwind for React Native | Consumes the same tokens as the admin web app |
| `tailwindcss` | Token engine | Peer of NativeWind. Default palette is **not** used — see the design system |
| `@expo-google-fonts/fraunces` | Display typeface | Headings, prices, large figures |
| `@expo-google-fonts/ibm-plex-sans` | Body typeface | All UI text |
| `@expo-google-fonts/ibm-plex-mono` | Utility typeface | Quantities, weights, IDs, timestamps |
| `expo-font` + `expo-splash-screen` | Font preloading | Hold the splash until fonts resolve, or you ship a visible font swap on every cold start |
| `lucide-react-native` | Icons | Consistent stroke weight. Never emoji as icons |

### Motion and interaction

| Package | Purpose | Notes |
|---|---|---|
| `react-native-reanimated` | Animation core | UI-thread worklets. **Never** use `Animated` from react-native core |
| `moti` | Declarative animation presets | Sits on Reanimated. Cuts hand-written animation substantially |
| `react-native-gesture-handler` | Touch and gestures | Required by Reanimated and the bottom sheet |
| `@gorhom/bottom-sheet` | Sheets | Cart, coupon entry and window selection are sheets, not full-screen modals |
| `expo-haptics` | Tactile feedback | Where most of the "premium" feel actually comes from |

### Data and lists

| Package | Purpose | Notes |
|---|---|---|
| `@reduxjs/toolkit` + `react-redux` | State | RTK Query handles caching, dedup and optimistic updates |
| `@shopify/flash-list` | Virtualised lists | Always set `estimatedItemSize`. Blank cells on fast scroll mean you didn't |
| `expo-image` | Images | Blurhash placeholders, memory cache limits. The catalog must not OOM on a 3 GB device |
| `react-native-mmkv` | Local key-value | Cached catalog and any offline queue. **Not** for tokens |

### Device and platform

| Package | Purpose | Notes |
|---|---|---|
| `expo-secure-store` | Token storage | Refresh tokens go here. **Never** AsyncStorage |
| `expo-location` | GPS | One-time capture at address creation for serviceability. Not tracking |
| `expo-notifications` | Push | Order status, wallet credited |
| `react-native-razorpay` | Payment SDK | Official SDK. **Never** a WebView wrapper around checkout |
| `expo-clipboard` | Coupon paste | Small thing; noticeably nicer at the stall |
| `expo-updates` | OTA updates | EAS Update channel. Essential inside a 15-day launch |

### Not in Phase 1

`react-native-maps`, `expo-camera`, `expo-barcode-scanner`, `expo-print`, `expo-keep-awake` — all arrive with the operations app in P2.

---

## 3. Admin panel — `apps/admin`

Deliberately web, not mobile. Sixteen configuration screens and dense two-handed desk work.

| Package | Purpose |
|---|---|
| `react` + `react-dom` | UI |
| `vite` | Build tool and dev server |
| `react-router-dom` | Routing |
| `tailwindcss` | Styling, from the shared token package |
| `@reduxjs/toolkit` | State and RTK Query |
| `@tanstack/react-table` | Data tables — sorting, filtering, column sizing |
| `papaparse` | CSV export for procurement and packing sheets |
| `recharts` | The few charts on the dashboard |

---

## 4. Backend — `apps/api`

| Package | Purpose | Notes |
|---|---|---|
| `express` (4.x) | HTTP framework | 4.x for stability. 5.x exists; not worth the migration risk inside this deadline |
| `zod` | Validation | At **every** boundary — route inputs, external responses, webhook payloads |
| `@prisma/client` + `prisma` | ORM and migrations | Server-side only. Never imported into a mobile workspace |
| `ioredis` | Redis client | OTP storage, token revocation, idempotency keys |
| `bullmq` | Job queue | The order-release job. Grows a lot in P2 (SLA escalation) |
| `jsonwebtoken` | JWT | Access and refresh tokens |
| `argon2` | Password hashing | Admin passwords only. Customers have no password |
| `helmet` | Security headers | Sensible defaults, one line |
| `express-rate-limit` + `rate-limit-redis` | Rate limiting | OTP, login, order placement |
| `pino` + `pino-http` | Structured logging | JSON logs with request correlation IDs |
| `razorpay` | Payment SDK | Order creation, refunds, reconciliation pulls |
| `@sentry/node` | Error tracking | Paired with `@sentry/react-native` |
| `nanoid` | ID generation | Order numbers and coupon codes, from an unambiguous alphabet |
| `date-fns` + `date-fns-tz` | Dates | **Always Asia/Kolkata.** Never rely on server local time |

### Deliberately absent

No GraphQL, no tRPC, no NestJS, no ORM other than Prisma. Every one adds a concept the team would be learning during a fifteen-day build.

---

## 5. Data layer

### PostgreSQL via Supabase

| Item | Detail |
|---|---|
| Version | 15+, whatever Supabase provisions |
| Extensions | `pg_trgm` (alias search), `uuid-ossp` |
| Connection — runtime | Pooler, port **6543**, `?pgbouncer=true&connection_limit=1` |
| Connection — migrations | Direct, port **5432**, as `DIRECT_URL` |
| Money columns | `BIGINT` paise. Never `NUMERIC`, never `FLOAT` |
| Quantities | `DECIMAL(10,3)` with explicit precision |
| Timestamps | `TIMESTAMPTZ`, always |

**Get both connection strings into `schema.prisma` on Day 1.** Omitting `DIRECT_URL` makes migrations hang against the pooler — and it fails in production, not locally.

### Supabase Storage

Product images and, in P2, proof-of-delivery photos. Use the image transformation endpoint to serve device-appropriate widths rather than shipping full-size photographs over mobile data.

### Redis — Upstash

Ephemeral only. Nothing here is a source of truth.

| Key pattern | TTL | Purpose |
|---|---|---|
| `otp:{mobile}` | 5 min | Hashed OTP and attempt counter |
| `rl:{scope}:{key}` | Varies | Rate limit counters |
| `revoked:{jti}` | Token lifetime | Refresh token revocation |
| `idem:{key}` | 24 h | Idempotency response snapshots |

---

## 6. Third-party services

| Service | Purpose | Account lead time | Blocks |
|---|---|---|---|
| **Supabase** | Postgres, Storage | Minutes | Day 1 |
| **Upstash Redis** | Cache, locks, OTP | Minutes | Day 2 |
| **Razorpay** | Payments, refunds | **1–4 weeks (KYC)** | Days 10–11 |
| **MSG91** or Kaleyra | Transactional SMS | **1–3 weeks (DLT)** | Day 2 — *all login* |
| **Expo EAS** | Builds, OTA updates | Minutes | Day 15 |
| **Apple Developer** | iOS distribution | 1–7 days | TestFlight |
| **Google Play Console** | Android distribution | Days — **register as an organisation** | Release |
| **Sentry** | Error tracking | Minutes | Day 14 |
| **API host** (Railway / Render / Fly) | Runs the API | Minutes | Day 1 |

### The two that will actually hurt

**DLT registration** blocks *every* login in the app, customer and operations. Supabase phone auth is not DLT-compliant and OTPs simply will not deliver in India. Register the entity, the header and every template in week one — template approval alone runs days per template.

**Play Console account type** must be decided on day one. A *personal* account requires a closed test with 12+ testers running 14 continuous days before you can apply for production access — a hard two-week wall at exactly the wrong moment. An *organisation* account needs a D-U-N-S number, takes longer up front, and skips that requirement entirely.

---

## 7. The three JavaScript guardrails

Not optional. These substitute for the compiler.

### `jsconfig.json` in every workspace

```json
{
  "compilerOptions": {
    "checkJs": true,
    "strict": true,
    "noEmit": true,
    "target": "ES2022",
    "moduleResolution": "bundler",
    "baseUrl": "."
  },
  "include": ["src/**/*.js", "src/**/*.jsx"]
}
```

Annotate exported functions with JSDoc, and import Prisma's generated types through it:

```js
/**
 * @param {import('@prisma/client').Order} order
 * @param {"customer"|"admin"} role
 * @returns {object}
 */
export function serialiseOrder(order, role) { /* … */ }
```

`pnpm typecheck` runs `tsc --noEmit` across workspaces and **gates CI**. A red squiggle is a build failure.

### Zod at every boundary

A route registered without a schema throws at application startup. Make forgetting impossible rather than discouraged.

### The serialiser test suite

An allow-list per role, plus a test asserting that no customer-facing response can emit `margin`, `procurementCost` or `consumablesCost` under any code path, including nested objects. Runs on every commit, blocks merge.

In TypeScript a leaked margin field is a compile error. Here it is a test, and that test is load-bearing.

---

## 8. Development tooling

| Tool | Purpose | Notes |
|---|---|---|
| `eslint` + `eslint-config-expo` | Linting | Plus `eslint-plugin-security` on the API |
| `prettier` | Formatting | No debates, no diffs about spacing |
| `husky` + `lint-staged` | Pre-commit | Runs lint, format, **and the secret grep** |
| `vitest` | Unit and integration tests | Faster than Jest, and the API is ESM |
| `supertest` | API integration tests | Endpoint-level coverage |
| `@testing-library/react-native` | Component tests | |
| `maestro` | Mobile E2E | Optional in P1; worth it by P2 |
| `dotenv-cli` | Env loading | Per-environment scripts |

### The pre-commit hook that matters

```bash
# .husky/pre-commit
pnpm lint-staged

# Fail the commit if a secret reaches a mobile workspace
if git diff --cached --name-only | grep -qE '^apps/(customer|admin)/'; then
  if git diff --cached | grep -qE 'SERVICE_ROLE|DATABASE_URL|RAZORPAY_KEY_SECRET|WEBHOOK_SECRET'; then
    echo "✖ Secret detected in a client workspace. Blocked."
    exit 1
  fi
fi
```

Anything shipped to a device is public. This makes that structurally hard to forget.

---

## 9. CI/CD

**GitHub Actions**, three workflows:

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | Every PR | install → lint → **typecheck** → test → build |
| `deploy-api.yml` | Merge to `main` | Migrate, deploy API, smoke-test `/health` |
| `eas-build.yml` | Tag | EAS build and submit; OTA update on JS-only changes |

Branch protection on `main`: no direct pushes, CI green required, one review.

---

## 10. Running costs

Rough monthly, one pilot community. **Verify current pricing** — all of these change, and several have India-specific rates.

| Service | Tier | Approx. monthly |
|---|---|---|
| Supabase | Free → Pro | $0 – $25 |
| Upstash Redis | Pay-as-you-go | $0 – $10 |
| API hosting | Small instance | $5 – $20 |
| Sentry | Free → Team | $0 – $26 |
| Expo EAS | Free → paid | $0 – $99 |
| **Subtotal** | | **≈ $5 – $180** |
| Razorpay | Per transaction | **~2% + GST** |
| SMS | Per message | ~₹0.15 – ₹0.25 |
| **One-time** | | |
| Apple Developer | Annual | $99/yr |
| Google Play | Once | $25 |
| DLT registration | Once + per template | ₹5,000 – ₹8,000 |

The free tiers genuinely carry a single-community pilot. The costs that scale are transactional, and they scale with revenue rather than ahead of it — which is the right shape for this business.

---

## 11. Developer setup

```bash
# Prerequisites: Node 22 LTS, pnpm 9+, Git
npm i -g pnpm eas-cli

git clone <repo> && cd farm-to-flat
pnpm install

cp .env.example .env          # fill in Supabase, Redis, MSG91, Razorpay
pnpm db:migrate               # prisma migrate dev
pnpm db:seed                  # 3 communities, 40 products, one admin

pnpm dev                      # api + admin + expo, in parallel

# Physical device — required, not optional
cd apps/customer && npx expo start --dev-client
```

**Test on a physical mid-range Android.** Not a simulator, not a flagship. This app gets used at 5am in a field on a ₹12,000 phone, and that device is the ground truth for animation smoothness, image memory and network behaviour.

---

## 12. What we deliberately did not choose

Recorded so nobody relitigates it in week two.

| Rejected | Why |
|---|---|
| **TypeScript** | Team-lead call, made knowingly. Mitigated by the three guardrails in §7 |
| **MongoDB** | Wrong shape. Wallet atomicity, coupon uniqueness and the P2 aggregation drill-down are relational transactional work |
| **Neon** | Excellent Postgres, but no Storage, Realtime or image transforms — three things you'd then bolt on separately |
| **Firebase** | Would mean two databases, or giving up relational integrity where money lives |
| **Flutter** | Team knows React. Fifteen days is not a window for learning a language |
| **Next.js for admin** | No SSR requirement. Vite is faster to develop against |
| **NestJS / GraphQL / tRPC** | Each adds a concept to learn during the build |
| **Building a payment flow** | Never. Razorpay handles card data; it must never touch this system |
| **Supabase Auth (phone)** | Not DLT-compliant. OTPs will not deliver in India |
| **Supabase client from the app** | The API is the only thing that touches Postgres. Anon key is read-only Storage at most |

---

## 13. Phase 2 additions

Recorded now so the architecture doesn't have to change to accept them.

| Area | Adds |
|---|---|
| Operations app | A second Expo app: procurement, distribution, delivery, billing, support |
| Routing | Google Maps Platform — Routes API, Distance Matrix, `react-native-maps` |
| Offline | Sync queue over MMKV, background sync, conflict handling |
| Scanning and printing | `expo-camera` barcode scanning, Bluetooth thermal label printing |
| SLA escalation | Heavy BullMQ use, scheduled comparison jobs, Supabase Realtime for the ticket queue |
| Reporting | Materialised views for profitability; CSV and Excel export |
| Invoicing | Server-side PDF generation, GST-compliant numbering |

None of this changes the Phase 1 stack. It extends it — which is the point of choosing a relational database and a real job queue now rather than later.

---

## Version pinning policy

- **Pin exact versions in `package.json`.** No `^`, no `~`, on anything.
- **Commit the lockfile.** CI installs with `--frozen-lockfile`.
- **Never upgrade the Expo SDK mid-sprint.** It moves React Native, React and every native module at once.
- **Security patches** land immediately. Feature upgrades wait for a quiet week.
- Use `npx expo install` for anything with native code so versions match the SDK.
