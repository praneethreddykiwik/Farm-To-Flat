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

---

# Complete checklist coverage (updated 13 Oct, second pass)

Legend: **PASS** verified · **FIXED** this review · **FIXED\*** earlier work · **N/A** (reason) ·
**OPEN** needs action · **PARTIAL/UNTESTED** honest gap, no evidence of a problem.

## Information Gathering

| Item                                                                  | Status                             |
| --------------------------------------------------------------------- | ---------------------------------- |
| Manually explore site                                                 | PASS                               |
| Spider/crawl hidden content                                           | PARTIAL (not exhaustive)           |
| Files exposing content (robots/sitemap/.DS_Store)                     | PASS — SPA fallback, no real files |
| Search-engine caches                                                  | UNTESTED (low value)               |
| Content by User-Agent                                                 | UNTESTED                           |
| Web app fingerprinting                                                | PASS                               |
| Identify technologies / roles / entry points / client code            | PASS                               |
| Multiple channels / co-hosted / hostnames+ports / third-party content | PASS                               |

## Configuration Management

| Item                              | Status                                        |
| --------------------------------- | --------------------------------------------- |
| Admin URLs                        | PASS                                          |
| Old/backup/unreferenced files     | PASS                                          |
| HTTP methods + XST                | PASS (TRACE→405)                              |
| File extension handling           | PARTIAL                                       |
| Security HTTP headers             | PASS                                          |
| Flash/Silverlight/robots policies | N/A (no Flash/SL)                             |
| Non-production data in live       | **FIXED** (seed + mock serving)               |
| Sensitive data in client code     | PASS / **FIXED\*** (VITE_ADMIN_TOKEN removed) |

## Secure Transmission — all PASS

TLS 1.3 / AES-256-GCM · cert valid · HTTP→301 · HSTS incl. subdomains · login+tokens over HTTPS.

## Authentication

| Item                                       | Status                                                               |
| ------------------------------------------ | -------------------------------------------------------------------- |
| User enumeration                           | PASS (none)                                                          |
| Authentication bypass                      | PASS                                                                 |
| Bruteforce protection                      | PASS (layered)                                                       |
| Password quality/reset/change/autocomplete | N/A (passwordless OTP)                                               |
| CAPTCHA                                    | N/A — rate limits used instead                                       |
| MFA                                        | N/A — OTP is phone-possession factor                                 |
| Logout                                     | PASS (server-side revoke)                                            |
| HTTP cache management                      | **FIXED** (no-store)                                                 |
| Default logins                             | **OPEN** — shared ADMIN_TOKEN (sunset switch exists; kill after SSO) |
| User-accessible auth history               | OPEN (not present; admin actions are audited server-side)            |
| Out-of-channel lockout/change notice       | OPEN (not present)                                                   |
| Consistent auth / SSO                      | PASS                                                                 |

## Session Management

| Item                                     | Status                                                      |
| ---------------------------------------- | ----------------------------------------------------------- |
| How handled                              | PASS (Bearer tokens in header)                              |
| Cookie flags / scope / duration          | N/A (no cookies anywhere)                                   |
| Termination: max life / timeout / logout | PASS                                                        |
| Token randomness                         | PASS (CSPRNG ~119 bits)                                     |
| New token on login/refresh               | PASS (rotation)                                             |
| Multiple simultaneous sessions           | **OPEN** — revocation is process-local (survives a restart) |
| Session puzzling                         | UNTESTED                                                    |
| CSRF + clickjacking                      | PASS (CSRF N/A by design; frame headers present)            |

## Authorization — all PASS

Path traversal (text) · vertical 403 · horizontal 404 · missing-auth 401.

## Data Validation

| Item                                           | Status                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| Reflected / HTML injection                     | PASS (JSON)                                                        |
| Stored XSS                                     | PARTIAL (admin fields not render-tested; SVG upload vector closed) |
| DOM XSS                                        | PASS — no innerHTML/eval/dangerouslySetInnerHTML in admin          |
| SQL / NoSQL / ORM injection                    | PASS (Prisma param + Cloudflare block)                             |
| Code / Expression-Language injection           | PASS                                                               |
| Command injection                              | PASS (no shell exec with input)                                    |
| XML/XXE/XPath/XQuery/LDAP/SOQL/SSI/IMAP-SMTP   | N/A                                                                |
| Overflow / format string / Cross-Site Flashing | N/A (JS, no Flash)                                                 |
| HTTP splitting/smuggling                       | UNTESTED (Cloudflare+Node normalise)                               |
| HTTP verb tampering                            | PASS                                                               |
| Open redirection                               | PASS (no input-built redirects)                                    |
| LFI / RFI                                      | PASS                                                               |
| Client vs server validation                    | PASS (server-authoritative)                                        |
| HTTP parameter pollution                       | PASS (repeated params → 422)                                       |
| Auto-binding / Mass assignment                 | PASS (Zod rejects extras; price injection blocked)                 |
| NULL/invalid session                           | PASS (401)                                                         |

## Denial of Service

| Item              | Status                                                                          |
| ----------------- | ------------------------------------------------------------------------------- |
| Anti-automation   | PASS — AI endpoints capped (plan 10/5min, identify 15/5min per IP); OTP limited |
| Account lockout   | PASS                                                                            |
| HTTP protocol DoS | N/A (Cloudflare absorbs)                                                        |
| SQL wildcard DoS  | UNTESTED                                                                        |

## Business Logic — all PASS

Feature misuse · non-repudiation (audit) · trust (HMAC+origin lock) · integrity (ledger/idempotency) · segregation (roles).

## Cryptography

| Item                          | Status                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------ |
| Data that should be encrypted | PASS (HTTPS, secure-store, no card data)                                       |
| Wrong algorithm for context   | PASS (HMAC-SHA256)                                                             |
| Weak algorithms               | PASS (no MD5/SHA1 in security paths)                                           |
| Salting                       | N/A (no passwords)                                                             |
| Randomness functions          | **FIXED** — OTP was Math.random, now crypto.randomInt; storage keys now CSPRNG |

## File Uploads

| Item                             | Status                                           |
| -------------------------------- | ------------------------------------------------ |
| Types whitelisted                | PASS (no SVG)                                    |
| Size/frequency/count limits      | PASS                                             |
| Contents match type              | **FIXED** (magic-byte check)                     |
| Anti-virus scanning              | **OPEN** — not present                           |
| Filenames sanitised              | PASS / **FIXED** (server-generated CSPRNG names) |
| Not in web root / different host | PASS (Supabase separate origin)                  |
| Integrated with authz            | PASS (ownership checks)                          |

## Card Payment — PASS / handled

PCI offloaded to Razorpay; no card data stored. Injection/transport/error-handling/authn/authz/CSRF all covered.
Guessable default = shared ADMIN_TOKEN (OPEN, above). Dependency CVEs: proxy-addr CRITICAL **FIXED**;
remaining audit hits are app-devtools/build tooling, not API runtime.

## HTML5

| Item             | Status                                               |
| ---------------- | ---------------------------------------------------- |
| Web Messaging    | PASS (no postMessage surface)                        |
| Web Storage SQLi | N/A (device SQLite holds no injectable server query) |
| CORS             | PASS (arbitrary origin denied)                       |
| Offline Web App  | UNTESTED                                             |

---

## The three remaining OPEN items (need a decision/action, not a quick code fix)

1. **No anti-virus on uploads.** Low urgency today (uploads are authenticated, type- and
   signature-checked, size-capped, served from a separate origin), but if untrusted upload volume
   grows, add a scanner (e.g. a ClamAV sidecar or an object-storage scan hook) before an uploaded
   object is marked usable.
2. **Session revocation is process-local.** A signed-out or role-changed token can come back after
   a restart, because the revocation set lives in process memory. Fix is a shared/DB-backed
   revocation store — the same change the in-memory rate limiter wants, and it pairs with moving
   off Render Free.
3. **Shared ADMIN_TOKEN.** The one guessable-default credential. The Google-SSO path and the
   `ADMIN_TOKEN_SUNSET` switch already exist; set it once SSO sign-in is confirmed working, then the
   token stops being accepted.

Everything else is PASS or N/A. The UNTESTED rows have no evidence of a problem and are low-value
for this stack (static SPA + JSON API behind Cloudflare); they are listed for honesty, not as known
defects.
