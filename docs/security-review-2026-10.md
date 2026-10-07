# Fooducia — security review, 7 October 2026

White-box review of the whole stack (`apps/api`, `apps/admin`, `apps/customer`) against the
OWASP web application testing checklist. Four reviewers read the code; the only live traffic
was `curl -sI` against our own domains to read response headers and TLS version. No fuzzing,
no brute force, no writes.

## Score: 71 / 100

| Domain                                          | Score | Gated by                                                                           |
| ----------------------------------------------- | ----- | ---------------------------------------------------------------------------------- |
| Authentication · Session · Authorization        | 58    | `ALLOW_DEV_OTP=1`; `Math.random()` OTP; refresh tokens never expire                |
| Data validation · Injection · Upload · Payments | 78    | payment verification conditional on gateway config; uploads trust the claimed MIME |
| Configuration · Transport · Crypto              | 72    | `ALLOW_DEV_OTP=1`; anon JWT committed                                              |
| Info exposure · Business logic · Privacy        | 74    | no admin audit trail; single-process correctness                                   |

The arithmetic mean is 70.5. The number is capped by one finding: if `DEV_OTP_ALLOWLIST`
is empty on Render, there is effectively no authentication system. Close C1, H1 and H2 and
the stack scores in the mid-80s, because everything underneath them is sound.

N/A and excluded from the denominator: Flash/Silverlight, LDAP, XPath/XQuery, SOQL, ORM
injection beyond Prisma, buffer/format-string classes, CAPTCHA, password quality and
password reset (there are no passwords — auth is OTP and Google).

---

## Critical

### C1 · `ALLOW_DEV_OTP=1` ships in the production blueprint

`render.yaml:31` · `apps/api/src/customer-store.js:162,173-182,261`

`DEV_OTP_ALLOWLIST` is `sync: false`, so it is dashboard-set and unverifiable from the repo.
If empty, `devOtpAllowedFor` returns true for every number and `requestOtp` mints the fixed
`123456` while sending nothing. Anyone who knows a mobile number signs in as that person.
Because `routes/admin/auth.js:42` accepts a staff Bearer as admin auth, a guessed staff
number reaches the operator console with no shared secret.

`devOtpAllowedFor` already receives `ctx.isStaff` at `customer-store.js:259` and ignores it.
That parameter is dead code.

- Check the live state: `GET /admin/otp-status`
- Set `DEV_OTP_ALLOWLIST`, prove a real WhatsApp send, then delete the key from the blueprint
- Refuse to boot on `IS_PROD && ALLOW_DEV && !allowlist.size` instead of `console.warn`
- Never let a staff-roled mobile take the dev code

## High

### H1 · Login OTP generated with `Math.random()`

`apps/api/src/customer-store.js:261` · delivery code `apps/api/src/store.js:579`

V8's xorshift128+ is not a CSPRNG and its state is recoverable from observed outputs. An
attacker requests codes for numbers they control, solves for the state, and predicts the
code issued to a victim — zero guesses against the victim, so the 3-guess cap never engages.
Fix: `crypto.randomInt(100000, 1000000)` and `randomInt(1000, 10000)`.

### H2 · Refresh tokens never expire, and expired ones are resurrected at every boot

`apps/api/src/persistence.js:309,513` · `apps/api/src/customer-store.js:120,483`

The 90-day `expiresAt` is written to Postgres and never read back. Boot does an unfiltered
`session.findMany()`; hydration keeps only `refreshToken → customerId` and drops the date;
`sweepAuthState` never touches `cs.refresh`. A token from a two-year-old phone backup still
mints a fresh access token. Fix: filter the load, carry `expiresAt` into the map, check it
in `rotateRefresh`, sweep it.

### H3 · Payment verification is conditional on the gateway being configured

`apps/api/src/routes/wallet.js:123` · `apps/api/src/lib/razorpay.js:10`

Verification runs only when `razorpayEnabled && pay.razorpayOrderId`. If the key is unset,
blank, or fails the `^rzp_(test|live)_` shape test, the whole payment path reverts to the
local mock: no gateway order exists, and `POST /payments/verify {paymentId, success:true}`
confirms the order. Free goods, and wallet top-ups credited with no money moving. One
truncated paste in the Render dashboard is enough, and nothing fails loudly.

Fix: assert rather than condition — `if (!razorpayEnabled && IS_PROD) throw fail(503, ...)`
before capture, with the mock behind an explicit `NODE_ENV !== 'production'`.

### H4 · No admin audit trail on money-moving actions

`apps/api/src/routes/admin/auth.js:35,47,65,69`

`req.staff = {role, email, name}` is populated on every admin request and never written down.
Cancellations, cancel-decision approvals, complaint resolutions and refunds all record no
actor; `POST /orders/advance` can sweep 500 orders anonymously. Worst case, `ADMIN_TOKEN`
grants SUPER_ADMIN with no identity at all. The only sign-in record in the system is one
`console.error` on an ephemeral free-plan log.

Fix: add `by: {email, role, via}` to every `timeline.push`, to the refund ledger entry and to
issue resolutions; thread an `actor` through `cancelOrder`/`transition`/`refundOrderWallet`;
write an append-only `admin_action` row for cancel, refund, catalog edit, role change and
COD settlement.

### H5 · Single-process correctness, no transactions (latent)

`apps/api/src/customer-store.js:22-47,812-823` · `apps/api/src/lib/idempotency.js:15`

The debit path is safe today only because the critical section in `POST /orders` is fully
synchronous — Node's event loop provides incidental atomicity. State is in-memory `Map`s
with Supabase as write-behind. A second instance means divergent wallet balances, the same
balance spent twice, and per-process idempotency caches that let a retry place a second order.

Fix before scaling off the free plan: wallet debit + order insert in one Postgres transaction
with `SELECT ... FOR UPDATE`; idempotency backed by a unique index on
`(customer_id, idempotency_key)`. Make `idempotencyKey` required — the app already sends it.

### H6 · `RAZORPAY_WEBHOOK_SECRET` unset in production

`apps/api/src/routes/razorpay-webhook.js:34` · `apps/api/src/lib/capture.js`

Not a forgery risk — the endpoint 503s and the code fails closed correctly. The problem is the
opposite: the webhook is the documented authoritative confirmation path and it is dead. A
customer whose phone locks mid-checkout has their money taken by Razorpay, their order expired
to `PAYMENT_FAILED` after 30 minutes, and nothing ever reconciles it, because the only caller
of `/payments/verify` is the app that died. Razorpay will also retry the 503 for hours and may
disable the endpoint.

Fix: set the secret and restart. Add a reconciliation job over orders stuck in
`PENDING_PAYMENT`/`PAYMENT_FAILED`.

## Medium

### M1 · Host-header injection leaks private photo tokens

`apps/api/src/lib/media.js:79`

`baseUrlOf` trusts `x-forwarded-host`. A request carrying `X-Forwarded-Host: evil.tld` gets
back `https://evil.tld/api/v1/media/issue/<token>`, and that token is the sole credential for
a photograph of someone's home tied to a named order and address, for 8 hours.
Fix: derive from a configured `PUBLIC_API_URL`; fall back to `req.get('host')` only in dev.

### M2 · Uploads whitelist the claimed MIME type, never the bytes

`apps/api/src/routes/customer-orders.js:354-399` · `apps/api/src/routes/admin/products.js:126-145`

Contained for complaint photos (private bucket, token required, nosniff, delivered-only, 48h).
But `uploadProductImage` returns a **public** CDN URL where our `nosniff` header does not
reach, so an admin uploading an HTML file there is stored XSS on that origin.
Fix: check magic bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF…WEBP`, AVIF
`ftypavif`), derive the type from the bytes, reject on mismatch.

### M3 · `/me/mobile/request` is an unthrottled SMS amplifier and an account oracle

`apps/api/src/routes/me.js:66-82`

Takes an arbitrary target number and sends a real MSG91 message with no rate-limit middleware,
unlike `/auth/otp/request` which has two. One signed-in account can send ~3,000 paid messages
a minute. It also throws `409 MOBILE_TAKEN` before sending, answering "does this number have
an account?" at 600 queries a minute.
Fix: per-IP and per-customer limiters; move the taken-check to verify, or respond identically.

### M4 · Operator sign-out does not survive a restart

`apps/api/src/lib/admin-session.js:39,93`

Revocation is a process-local `Set` of `jti`. A signed-out 12-hour token becomes valid again
after any deploy, and is valid on other replicas immediately. `revoked` also never evicts
past `exp`.
Fix: persist revoked `jti` + `exp`, or move to a server-side session table.

### M5 · Shared `ADMIN_TOKEN` is unthrottled and unattributable

`apps/api/src/routes/admin/auth.js:68`

Constant-time comparison (good), but no failure limiter beyond the global 600/min. It
identifies nobody, bypasses the Google allowlist and `superOnly`, and cannot be revoked
per-person. `/admin/auth/google` is capped at 20/10min; the strictly more powerful path is not.
Note: the token is currently `123456` by explicit decision until Google auth is enabled.

### M6 · No refresh-token reuse detection

`apps/api/src/customer-store.js:506-513`

A replay of a rotated token returns `null` without invalidating the family. A thief who uses
the stolen token first holds an indefinitely renewable session while the victim is signed out.
Fix: on presentation of a consumed token, `logout(customerId)`.

### M7 · Session cap evicts access tokens but not refresh tokens

`apps/api/src/customer-store.js:457-463`

Over 10 sessions, only `cs.sessions` entries drop; `cs.refresh` and the DB rows survive, so
the evicted device calls `/auth/refresh` and returns. The cap enforces nothing.

### M8 · Captured amount never compared to the expected amount

`apps/api/src/lib/capture.js:26-80`

A partial capture or currency mismatch would confirm the order in full. Low likelihood today
because orders are created server-side with the exact amount, but the invariant is unenforced.

### M9 · Supabase anon JWT committed

`apps/customer/eas.json:29,42`

Public-by-design only if RLS is correct on every table; long-lived (exp 2036) and unrotatable
without a rebuild. Move to an EAS secret and confirm RLS.

## Low

- **L1** No `robots.txt` / `sitemap.xml`; the operator panel and the marketing page share one
  origin, so `/orders`, `/access-roles` etc. are crawlable paths. Add a disallow and
  `noindex` on the authenticated shell.
- **L2** HSTS on the four sites lacks `includeSubDomains` and `preload` (the API has both).
- **L3** `access-control-allow-origin: *` on the admin site's static responses (Vercel default).
- **L4** Rate limiting is single-process in-memory; every limit multiplies on a second replica.
- **L5** `ledgerPush` has no invariant of its own (`customer-store.js:812`) — no `amount > 0`,
  no `after >= 0`. Safety lives entirely in the single caller. Three lines makes the next
  caller safe by construction.
- **L6** `otpPerMobile` keys on the unnormalised body (`routes/auth.js:31`), so `+91…`,
  `0…` and spaced forms are three buckets for one number. Run `validateBody` first.
- **L7** FULFILMENT and PROCUREMENT can hit `/orders/export.xlsx`, which carries name, mobile,
  community, block and flat for every matching order. Scope to ADMIN_UP, or to today's date.
- **L8** Admin credentials in `localStorage` (strict CSP makes this hard to reach).
- **L9** Unencoded path interpolation in `storage.js:138`; not reachable today, but the
  legacy `issuePhotoPath` branch `decodeURIComponent`s a stored value without validation.
- **L10** Per-photo cap (6 MB × 5) disagrees with the 8 MB body limit that actually fires.
- **L11** `apps/admin/public/shots/.claude/` — empty tooling artifact inside the served folder.

## Personal, not a vulnerability

`apps/admin/public/shots/home.webp` and `tracking.webp` show **our own** name and flat —
"Hello, Vivek", "Block 1 · 1204, My Home Avatar" — plus order `F2F-4319`, its delivery window
and total. Not a third party's data, so not a breach and nobody's call but ours. Worth a
decision anyway: it is a home address and a standing delivery window on a public marketing
page, and both files are git-tracked. The untracked `marketing/*.mp4` carry the same frames.
The other five screenshots are clean.

---

## Verified clean

These were actively looked for and not found.

- **No IDOR.** Every customer route taking an `:id` was traced. `getOrderForCustomer`
  (`store.js:265`) filters on `customerId` inside the lookup rather than after it; addresses,
  wallet, cart, devices and payments all read from the session.
- **No SQL injection.** Prisma throughout; the single raw query (`persistence.js:364`) is a
  tagged template with a constant. No `$queryRawUnsafe`/`$executeRawUnsafe` in the repo.
- **No XSS sink in the admin.** Zero `dangerouslySetInnerHTML`, `innerHTML`, `eval` or
  `new Function`. The only dynamic hrefs take server-minted media URLs.
- **No SSRF, no open redirect, no command injection, no XXE.** Every outbound fetch targets a
  hardcoded or env-configured host; there is no `res.redirect`, no `child_process`, no XML.
- **No mass assignment.** Zod `z.object` strips unknown keys before all three `...req.body`
  spreads; no `req.body` reaches a Prisma create/update unfiltered.
- **Price integrity.** `OrderBody` carries no amount field. Every line is re-derived from the
  live catalog at commit time, along with availability, daily cap, window cut-off, COD
  enablement and COD ceiling. All money is integer paise.
- **Refund idempotency.** Derived from the persisted ledger, not an in-memory flag, so a
  double click, a retry and a restart mid-attempt all return zero. The orphan-capture credit
  uses a distinct reference so it cannot collide. Gateway leg separately guarded by
  `pay.refundedPaise` and a stable Razorpay idempotency key.
- **Cancellation after delivery is refused on all three paths**, and `DELIVERED` is
  unreachable while cash or a door code is outstanding.
- **CSRF is not applicable by construction** — credentials ride in headers, never cookies.
- **Clickjacking handled** at the origin that matters: `frame-ancestors 'none'` + XFO: DENY.
- **No user enumeration on the primary login paths** (the one oracle is M3).
- **`google-auth.js` is correct line by line** — RS256 pinned before key lookup, `aud` checked
  against our client id, bounded skew, strict `email_verified`, JWKS cached per Google's own
  `cache-control`.
- **Every HMAC comparison is constant-time and length-checked first** — admin session, media
  token, both Razorpay paths. The media token compares the MAC _before_ parsing the payload.
- **Error handler leaks nothing** — `ApiError` surfaces a contract shape, everything else is
  logged server-side and answered `{code:'INTERNAL'}`.
- **Logs are clean** — no OTP, token, secret or phone number in any log statement; pino
  redacts auth headers and cookies.
- **CSV formula injection handled**, including tab and CR variants.
- **Fails closed in production throughout** — no `ADMIN_TOKEN` → 503, no `CORS_ORIGIN` →
  `origin: false`, no webhook secret → 503, empty allowlist → Google button hidden.
- **Role is re-read from the allowlist on every request**, so de-allowlisting takes effect on
  the next call. RBAC denies by default, so new routes are closed until opened.
- **No source maps ship**; no `.DS_Store`, `.bak` or swap file is tracked; no real `.env` has
  ever been committed; no secret remains in any shipped bundle.
- **TLS 1.0/1.1 refused; HTTP/2; clean chain.** Real CSP, HSTS, XFO, nosniff, Referrer-Policy,
  Permissions-Policy and COOP verified live on all four domains.

---

## Fix order

1. `DEV_OTP_ALLOWLIST` on Render, then delete `ALLOW_DEV_OTP` (C1) — minutes
2. `RAZORPAY_WEBHOOK_SECRET` and `MEDIA_TOKEN_SECRET` on Render (H6) — minutes
3. `crypto.randomInt` for both codes (H1) — one line each
4. Refresh-token expiry: filter, carry, check, sweep (H2)
5. Payment verification asserts in production (H3)
6. `PUBLIC_API_URL` instead of `x-forwarded-host` (M1)
7. Rate-limit `/me/mobile/request` (M3)
8. Magic-byte validation on uploads (M2)
9. Admin audit trail (H4) — about a day
10. Transactions and DB-backed idempotency, before a second replica (H5)
