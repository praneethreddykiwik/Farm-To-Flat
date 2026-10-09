# Releasing — how a change reaches a customer

Until now a change reached customers the instant it was pushed. There was no step where anyone
could look at it running, which is why something could behave one way on a laptop and another way
live, and the first person to notice was a customer.

This is the sequence that replaces that. The rule behind all of it: **nothing reaches a customer
that has not been seen working somewhere else first.**

---

## The backend

```
  push to main
       │
       ├─► CI            lint · typecheck · 380 tests · admin build
       │                 runs on every push now, not just pull requests
       │
       ├─► STAGING       f2f-api-staging, deploys automatically
       │                 own database, Razorpay TEST keys
       │                 ← you look at it here
       │
       └─► PRODUCTION    manual: Render → f2f-api → Manual Deploy
                         same commit, promoted not rebuilt
```

**Production no longer auto-deploys.** A push updates staging; promoting to production is a
deliberate click once staging looks right.

### Checking staging before you promote

```bash
curl -s https://f2f-api-staging.onrender.com/health
```

`commit` must be the one you just pushed. Then exercise whatever you changed. Staging is free-plan
so the first request after a quiet spell takes a few seconds — that is spin-down, not a fault.

### Promoting

Render → `f2f-api` → **Manual Deploy** → **Deploy latest commit**. Then:

```bash
curl -s https://api.fooducia.in/health
```

The `commit` field is the whole point of that endpoint: it is the only way to tell a deployed fix
from an undeployed one from the outside.

### Setting staging up (once)

1. **A separate Supabase project.** Not a schema in the live one — a separate project. A staging
   service pointed at the production database is worse than no staging: it looks like a safety net
   while editing real orders and real wallets.
2. In Render, sync the blueprint. `f2f-api-staging` appears with its env vars blank.
3. Fill them. `DATABASE_URL` → the new project. `RAZORPAY_*` → **test** keys, always. A staging
   service must never be able to move real money.
4. `pnpm --filter api exec prisma db push` against the staging database, then seed it.

---

## The app

The same shape, using EAS channels. This is where "test it before users get it" matters most,
because an over-the-air update reaches every phone within minutes and there is no undo.

```
  eas update --branch preview-live     → your test phones only
       │
       │  install, use it, satisfied?
       ▼
  eas channel:edit production --branch preview-live
                                       → the exact tested bundle, promoted to everyone
```

### Why promote rather than re-publish

`eas update --branch production` would build a **new** bundle from your working tree. That is not
the thing you tested — it is a rebuild of roughly the same source, which is how a last-minute edit
reaches customers unexamined.

`channel:edit` repoints the production channel at the **bundle you already installed and used**.
Byte for byte the same.

```bash
# 1. publish to the test channel
cd apps/customer
eas update --branch preview-live --environment preview -m "what changed"

# 2. install on a phone, actually use the thing you changed

# 3. promote that exact bundle
eas channel:edit production --branch preview-live
```

### Rolling back

Faster than fixing forward, and the right first move:

```bash
eas update:list --branch production          # find the last good update group
eas channel:edit production --branch <previous-branch>
```

Phones pick up the rollback on next launch.

### Two places hold the public env, and they are read by different commands

`eas.json`'s per-profile `env` block is read by **`eas build`**. The EAS _environments_
(`eas env:list --environment preview|production`) are read by **`eas update --environment …`**,
which is the release path above. Changing one does not change the other, and nothing warns you.

That divergence had already produced two live traps:

- The `production` environment had no `EXPO_PUBLIC_USE_MOCKS`, and the app reads it as
  `process.env.EXPO_PUBLIC_USE_MOCKS !== '0'` — **unset means mocks ON**. An
  `eas update --environment production` would have shipped a bundle running entirely on the in-app
  mock server: fake catalogue, fake orders, no real payments, and nothing about it looking broken.
  It also had no Supabase URL or anon key, so product images would have been blank.
- The `preview` environment had no `EXPO_PUBLIC_API_URL` at all, so the bundler fell through to
  whatever was in the local `.env` of the machine running the command. The comment in that file
  suggests putting a LAN IP there for on-device testing — meaning an OTA could have shipped a
  laptop's address to real phones.

Both are now set in both environments. Before any `eas update`, run:

```bash
eas env:list --environment preview      # must include EXPO_PUBLIC_API_URL and USE_MOCKS=0
```

If a variable is missing there, it is not "inherited" from `eas.json`. It is simply absent, and the
app's default takes over.

### What cannot go over the air

Anything native: the app icon, the name, permissions, a new native module, an SDK upgrade. Those
need `eas build` and a store review. If a change touches `app.json` outside the JS, assume a build.

---

## What gates what

| Change          | Gate before customers see it                                       |
| --------------- | ------------------------------------------------------------------ |
| API             | CI → staging → manual promote                                      |
| Website / admin | CI → Vercel preview on the PR, or check the deploy before sharing  |
| App, JS only    | `preview-live` → install → `channel:edit`                          |
| App, native     | build → install → store review                                     |
| Database schema | apply to staging first, then production, **never** `db push` blind |

---

## The things that will still bite

Honest list, because a process that pretends these do not exist is worse than none.

- **Staging is only as good as its data.** An empty staging database will not reproduce a bug that
  needs 112 orders and a stale cart. Seed it with something realistic.
- **One person approving their own work** catches typos, not blind spots. The value here is the
  _pause_, not the ceremony.
- **The admin console has no tests.** CI builds it; nothing checks it behaves. It is the surface
  that issues refunds.
- **Database migrations have no staging rehearsal yet.** `prisma db push` against production is
  still a hand-run command. Run it against staging first, every time.
- **No error tracking.** When something breaks in production you will hear it from a customer, not
  from a tool. Sentry's free tier would change that and costs nothing.
