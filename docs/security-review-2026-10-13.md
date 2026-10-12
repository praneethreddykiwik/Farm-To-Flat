# Security review — Fooducia, 13 Oct 2026

An OWASP-style review run against the live application with authorization. Scope: the API
(`api.fooducia.in`), the site + admin console (`*.fooducia.in`), and the customer app. Tested with a
real authenticated session. This records what was checked, what held, and the two things changed.

## Verdict

The core commerce and auth paths are sound. **No injection, no broken access control, no payment
forgery, no price tampering, no secret exposure.** Two hardening items were addressed; both were
defence-in-depth rather than live holes.

---

## What held (verified, not assumed)

### Transport & headers

- TLS 1.3, cipher `TLS_AES_256_GCM_SHA384`; cert valid, CN `api.fooducia.in`.
- HTTP → HTTPS 301 on the API.
- HSTS on both: API `max-age=31536000; includeSubDomains`, site `max-age=63072000`.
- Full header set via helmet: CSP, `X-Frame-Options` (DENY site / SAMEORIGIN api),
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, COOP, CORP.
- `Permissions-Policy` on the site disables camera/mic/geo/payment/usb.

### Authentication

- **No user enumeration** — an existing and a non-existent mobile get identical responses.
- Brute force is bounded: 3 guesses per code, the request limiter caps a number to 5 codes / 15 min
  (≈15 guesses per 15 min against a 10^6 space), and a dedicated `verifyPerIp` cap (90/15 min)
  exists precisely because requesting a new code resets the per-code counter.
- Logout revokes server-side; deleting the local token is not the same as logout.

### Session management

- Tokens are **Bearer tokens in the `Authorization` header**, not cookies — for both the customer
  API and the admin console (`x-admin-session`). No `Set-Cookie` is issued anywhere.
- Tokens come from `crypto.randomBytes` via `shortId`: access `acc_` + 20 chars, refresh
  `ref_` + 28 chars (~119 bits). CSPRNG, not `Math.random`.
- **CSRF is structurally not applicable**: browsers do not attach `Authorization` headers
  cross-site, and there are no ambient cookies to ride. Clickjacking is covered by
  `X-Frame-Options` + CSP `frame-ancestors`.

### Authorization

- A signed-in customer gets **403** on every `/admin/*` path.
- Another customer's order returns **404** (refuses even to confirm it exists), and a cancel on it
  is **404** — no horizontal access.
- `/me`, `/orders`, `/cart`, `/wallet` are **401** without a token.

### Injection & data validation

- Search treats SQLi / NoSQLi / path-traversal / template payloads as literal text (0 results, not
  "everything"); one SQL-shaped probe was additionally blocked at the Cloudflare edge.
- No reflected XSS: responses are `application/json`, input is never echoed as HTML.
- Errors return clean JSON (`BAD_JSON`, `VALIDATION`) with no stack traces.

### Payment integrity — the part that matters most

- **Client-supplied price is ignored.** Sending `pricePaise: 1` stores the real price.
- Negative / fractional / absurd quantities → 422.
- **The wallet cannot be credited without payment.** `/wallet/topup` returns an intent; the balance
  does not move. A verify with a forged signature on a real payment id →
  `SIGNATURE_INVALID`, balance unchanged. The order-substitution attack (fixed earlier) is still
  rejected.
- This confirms reported bug #14 (wallet credited without debit) was the **mock** payment
  simulator, not a defect in the real code.

### CORS

- An arbitrary origin (`evil.example`) receives **no** `Access-Control-Allow-Origin`. Only the
  configured site origins are reflected.

### Secrets / file exposure

- `.env`, `.git/config`, `package.json`, `.DS_Store` all resolve to the SPA fallback (HTML), not
  real files. The API 404s them.
- No credentials in the shipped admin bundle (verified in earlier work; `VITE_ADMIN_TOKEN` removed).

---

## Changed in this review

### 1. The OTP response was an enumeration oracle (fixed)

In production, `POST /auth/otp/request` returned the fixed dev code (`devOtp`) in the body for a
number on `DEV_OTP_ALLOWLIST`. The code is a constant (`123456`), so a legitimate tester learned
nothing from it — but anyone could request a code for an arbitrary number and read whether `devOtp`
came back, enumerating precisely which numbers are test accounts that accept the fixed code.

The code now **never appears in a production response body**; it is logged for the operator instead.
A named tester already knows it is `123456`, so nothing is lost, and the oracle is closed. (In
dev/test the field remains, where there is no real account to protect.)

### 2. Image uploads trusted the declared type (hardened)

Both upload paths — admin product images and customer complaint photos — validated the _declared_
`contentType` against a whitelist (which already excludes SVG) but did not verify the bytes. Live
risk was low (no SVG, objects served from a separate origin with a server-set content-type, both
endpoints authenticated), so this closes the checklist item _"file contents match the defined file
type"_ rather than a hole.

`assertRealImage()` now sniffs the file signature (JPEG/PNG/WebP/AVIF magic numbers) and rejects
anything whose bytes do not match its label — e.g. HTML or an SVG wearing a `.png` label. Wired into
both `/admin/products/upload-image` and `/orders/:id/issue`.

---

## Not yet covered

Time-boxed out of this pass, worth a later look: DOM-based XSS in the web admin specifically, the
Google-SSO token-exchange edge cases, and a load/anti-automation test of the AI endpoints
(`/ai/plan`, `/ai/identify`) which call paid providers.

400 API tests pass, including the two added here (image-signature validation, OTP no-oracle).
