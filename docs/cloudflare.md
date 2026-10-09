# Putting Cloudflare in front of Fooducia

## Where things stand today

| What                           | Where it lives              | DNS                                     |
| ------------------------------ | --------------------------- | --------------------------------------- |
| Marketing site + admin console | Vercel                      | Hostinger DNS → Vercel (`216.198.79.1`) |
| API                            | `farm-to-flat.onrender.com` | no custom domain at all                 |
| Images                         | Supabase Storage            | —                                       |

All four domains (`fooducia.in`, `fooduciary.in`, `fooducia.health`, `fooduciary.health`) resolve
through Hostinger's nameservers (`*.dns-parking.com`).

The API has no custom hostname, which is the first thing to change: you cannot put a CDN in front
of a name you do not control. Everything else follows from that.

## What this is actually buying

In rough order of value for an app that takes payments:

1. **Rate limiting counted globally.** The limiter in `apps/api/src/lib/rate-limit.js` is in-memory
   and per-process. Its own header comment says so: _"THIS LIMITER ONLY HOLDS WHILE THERE IS ONE
   PROCESS."_ The day you scale to two Render instances every limit silently doubles. Cloudflare
   counts at the edge, where there is only one of it. This matters most on `/auth/otp`, where each
   unthrottled request sends a real MSG91 SMS that costs real money.
2. **DDoS absorption** in front of a $7 instance.
3. **Bot rules** — stops the scrapers that would otherwise walk the whole catalogue.
4. **Origin lock.** Once traffic arrives via Cloudflare, the origin refuses anything that did not.
   Without this, all of the above is advisory: `farm-to-flat.onrender.com` is public and bypasses
   every rule at the edge.
5. **Caching** for the catalogue and images, which cuts Supabase egress.

## Code that had to land first

`apps/api/src/lib/edge.js`, shipped. Two problems, one mechanism — see that file's header for the
full reasoning. In short:

- `trust proxy` is `1` because Render terminates TLS one hop ahead. Cloudflare makes it two, so
  `req.ip` would become a **Cloudflare edge address** and every customer in the country would share
  one rate-limit bucket. Nothing throws; the logs look normal.
- `CF-Connecting-IP` carries the real address, but trusting it blindly is _worse_ than `req.ip`:
  anyone hitting the Render origin directly mints a fresh bucket per request by setting one header.

So Cloudflare injects a shared secret header, the origin requires it, and that single check is both
the origin lock and the thing that makes `CF-Connecting-IP` safe to believe.

Inert until `ORIGIN_SHARED_SECRET` is set. `/health` stays open — Render probes the container
directly, and failing those checks would take the service down in order to defend it.

## Steps

### 1. Move DNS to Cloudflare

Add each domain in the Cloudflare dashboard (Free plan is enough to start). Cloudflare imports the
existing records; **check the Vercel records came across** before continuing. Then at Hostinger,
change the nameservers to the two Cloudflare gives you. Propagation is usually under an hour.

Set **SSL/TLS → Overview → Full (strict)**. Not Flexible: Flexible serves HTTPS to the browser and
then talks plain HTTP to the origin, which is a downgrade dressed up as encryption.

### 2. Give the API a hostname

In Render → `f2f-api` → Settings → Custom Domain, add `api.fooducia.in`. In Cloudflare DNS:

```
CNAME   api   farm-to-flat.onrender.com   Proxied (orange cloud)
```

Wait for Render to show the certificate as issued.

### 3. Point the clients at it

- `apps/customer/eas.json` — `EXPO_PUBLIC_API_URL` → `https://api.fooducia.in` in both
  `preview-live` and `production`. Needs a new build.
- Vercel → admin project → `VITE_API_URL` → `https://api.fooducia.in`.
- Render → `CORS_ORIGIN` must already list every site origin; the API hostname is not a CORS origin
  and does not go in it.
- Razorpay dashboard → Webhooks → change the URL to
  `https://api.fooducia.in/api/v1/webhooks/razorpay`. **Keep the same webhook secret.**

### 4. Let the webhook through, before anything else

Cloudflare's bot and WAF rules will block Razorpay's server-to-server POST, and the failure is
quiet: payments stop confirming and nothing in the app looks wrong.

WAF → Custom rules → **Skip**, placed above every other rule:

```
(http.request.uri.path eq "/api/v1/webhooks/razorpay")
→ Skip: All remaining custom rules, Rate limiting, Bot Fight Mode, Managed rules
```

### 5. Rate limiting at the edge

WAF → Rate limiting rules:

| Path                | Limit             | Action            |
| ------------------- | ----------------- | ----------------- |
| `/api/v1/auth/otp*` | 5 / 10 min per IP | Block             |
| `/api/v1/*`         | 600 / min per IP  | Managed Challenge |

The second mirrors `RATE_LIMIT_PER_MIN` in the API, so the edge absorbs a flood before it costs you
a Render instance, and the in-process limiter stays as the backstop.

### 6. Turn on the origin lock — in this order

**The order matters. Reversed, the API goes down until the rule exists.**

a. Cloudflare → Rules → **Transform Rules → Modify Request Header** → Add:

```
Header name:  X-Origin-Secret
Value:        <the generated secret>
Applies to:   All incoming requests
```

b. Confirm `https://api.fooducia.in/health` still answers.

c. Render → `f2f-api` → Environment → add `ORIGIN_SHARED_SECRET` = the same value. Save; Render
redeploys.

d. Verify both sides:

```bash
curl -s https://api.fooducia.in/health | jq .originLock          # → true
curl -s -o /dev/null -w '%{http_code}\n' \
  https://farm-to-flat.onrender.com/api/v1/catalog/search?q=tomato   # → 403
```

The second is the whole point: the Render hostname still resolves, but no longer serves.

### 7. Caching

Caching rules → for `/api/v1/catalog*`, Cache eligible, Edge TTL ~5 minutes. Leave everything under
`/api/v1/auth`, `/me`, `/cart`, `/orders` and `/wallet` uncached — they are per-customer and
authenticated.

## Order of operations, condensed

1. Domains into Cloudflare, nameservers switched, SSL Full (strict).
2. `api.fooducia.in` → Render custom domain → certificate issued.
3. Webhook skip rule.
4. Razorpay webhook URL moved; clients repointed; verify a real payment confirms.
5. Rate limiting rules.
6. Transform Rule, **then** `ORIGIN_SHARED_SECRET`.
7. Caching.

Steps 1–2 are reversible in minutes. Step 6 is the one that can take the API down, which is why it
comes last and in that order.
