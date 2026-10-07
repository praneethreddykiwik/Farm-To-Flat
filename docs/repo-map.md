# Where everything lives, and how to change it

One repository holds all three products. This is the map, who hosts each piece, and what you
actually do to ship a change.

## The three apps

```
farm-to-flat/
├── apps/
│   ├── admin/      ← THE WEBSITE + the operator console   → Vercel
│   ├── api/        ← the backend (Express + Prisma)       → Render
│   └── customer/   ← the phone app (Expo / React Native)  → App Store + Play Store
├── packages/tokens/  shared colours and type scale, used by all three
├── prisma/           the database schema (one file: schema.prisma)
├── brand/            logo masters and the script that renders every PNG size
├── docs/             this file, the deployment guide, the security review
└── marketing/        videos — NOT committed, and they contain a real flat number
```

**The website and the operator console are the same app.** That surprises people, so it is worth
saying plainly: `apps/admin` serves both. One deploy, one domain, split by address:

| Address                                               | What it is                | Who sees it                       |
| ----------------------------------------------------- | ------------------------- | --------------------------------- |
| `/`                                                   | the public marketing site | everyone                          |
| `/privacy` `/terms` `/refunds` `/shipping` `/contact` | public policy pages       | everyone, and Razorpay's reviewer |
| `/admin` and everything else                          | the operator console      | staff, after sign-in              |

Nothing links to `/admin` from the public page. You type it.

## The website, file by file

Everything public lives in `apps/admin/src/screens/`:

| File                        | What it controls                                                    |
| --------------------------- | ------------------------------------------------------------------- |
| `Landing.jsx`               | the whole marketing page — hero, timeline, footer                   |
| `styles/landing.css`        | how it looks (it is a separate file, ~1400 lines)                   |
| `Terms.jsx` · `Privacy.jsx` | the two long policy pages                                           |
| `terms-content.js`          | **the policy words themselves**, in English, Hindi and Telugu       |
| `PolicyPage.jsx`            | `/refunds`, `/shipping`, `/contact` — views onto `terms-content.js` |
| `policy-styles.js`          | the shared look for all four policy pages                           |
| `App.jsx`                   | which address shows which page                                      |

Images the site serves sit in `apps/admin/public/` — the phone screenshots are in `public/shots/`.

**To change a policy, edit `terms-content.js` and nothing else.** Each section has an `id`, and the
four pages pull from it by id. There is one copy of the text, so `/terms` and `/refunds` can never
disagree about what your refund rule is. Edit it once, in three languages, and every page follows.

## Who deploys what

| Part               | Host       | How it deploys                           | You do                   |
| ------------------ | ---------- | ---------------------------------------- | ------------------------ |
| Website + console  | Vercel     | push to `main` → builds automatically    | nothing                  |
| Backend API        | Render     | push to `main` → redeploys automatically | nothing                  |
| Phone app, JS only | EAS Update | `eas update`                             | run one command          |
| Phone app, native  | EAS Build  | `eas build` + store review               | run a command, then wait |

Two of the three are automatic. Push to `main` and the website and API both go live on their own —
Render's `autoDeploy: true` (`render.yaml:20`) and Vercel's git integration.

The phone app is the one that needs you, and it splits in two:

- **JavaScript changes** — screens, text, logic, fixes — go over the air with `eas update`. Minutes,
  no store review. This covers most work.
- **Native changes** — the app icon, the name, permissions, a new native library, an SDK upgrade —
  need a real build and a store review. Days.

The channel matters and is easy to get wrong: your installed test APK listens to **`preview-live`**,
not `production`. Publishing to the wrong channel looks like it worked and changes nothing on the
phone.

```bash
# JS fix to the test phones
cd apps/customer && eas update --branch preview-live -m "what changed"
```

## Day to day

```bash
pnpm dev            # everything at once
pnpm test           # the API test suite
pnpm lint           # whole repo
pnpm format         # prettier, also runs automatically on commit
```

Run one app on its own:

```bash
npm --prefix apps/admin run dev     # website + console → localhost:5173
npm --prefix apps/api start         # API → localhost:4000
pnpm dev:customer                   # phone app
```

A commit runs prettier on the staged files automatically (husky + lint-staged), so formatting is
never something you need to think about.

## Secrets — the one rule

**Real secrets live only in the hosting dashboard. Never in the repo.**

| Secret                                                                                                                                          | Where it belongs                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `RAZORPAY_KEY_SECRET`, `MSG91_AUTH_KEY`, `DATABASE_URL`, `ADMIN_TOKEN`, `ADMIN_SESSION_SECRET`, `MEDIA_TOKEN_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Render → Environment                               |
| Anything named `VITE_*`                                                                                                                         | Vercel — **and assume the public can read it**     |
| Anything named `EXPO_PUBLIC_*`                                                                                                                  | `eas.json` — **and assume the public can read it** |

`VITE_` and `EXPO_PUBLIC_` values are compiled into files anyone can download. That is how the admin
token leaked once before. If a value must stay private, it cannot have those prefixes, and it cannot
be in the front end at all — it goes in the API.

`render.yaml` lists every variable the API expects. Ones marked `sync: false` are deliberately blank
in the file and must be filled in the dashboard.

## Shipping a change

**Website or API** — the common case:

```bash
# edit, then
pnpm test                  # if you touched apps/api
npm --prefix apps/admin run build   # if you touched apps/admin — catches broken imports
git add -A && git commit -m "..." && git push
```

Push is the deploy. Vercel takes about a minute; Render a few more, and the free plan cold-starts
after ~15 minutes idle, so the first request after a quiet spell is slow. That is the plan, not a bug.

**Phone app** — decide which kind of change it is:

```bash
cd apps/customer
eas update --branch preview-live -m "..."   # JS only
eas build --platform android --profile preview-live   # native, or a new install
```

Full store submission is in `docs/deployment-guide.md`.

## Database changes

The schema is one file, `prisma/schema.prisma`. After editing it:

```bash
pnpm --filter api exec prisma migrate dev --name what_changed   # local
pnpm --filter api exec prisma generate
```

Render runs `prisma generate` on every deploy. Migrations against production are deliberately not
automatic — applying one is a decision, not a side effect of pushing.

## Checking something is actually live

```bash
curl -s https://farm-to-flat.onrender.com/health
curl -s -H "x-admin-token: $ADMIN_TOKEN" https://farm-to-flat.onrender.com/api/v1/admin/otp-status
curl -s -H "x-admin-token: $ADMIN_TOKEN" https://farm-to-flat.onrender.com/api/v1/admin/payments-status
```

`/health` returns 503 if the API booted without its database and is quietly serving demo data —
which is exactly when you most want to know.

## Things that will bite you

- **The website and the operator console deploy together.** A change meant for one goes live on both.
- **`preview-live` is the channel your test APK listens to**, not `production`.
- **The app icon cannot go over the air.** It is native. It needs a build and a store review.
- **The API sleeps on the free plan.** First request after idle takes several seconds.
- **`marketing/` is untracked on purpose** — those videos contain a real flat number.
- **One canonical domain.** Pick one of the four and 301 the rest to it, or Razorpay, Google OAuth
  and the stores will each verify a different address.
