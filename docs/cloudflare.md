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

Staged so that nothing which is working today can break at a step you have not reached yet. The
website and admin console stay on **DNS-only** throughout — Cloudflare is proxying the API, which
is the thing that needs a WAF, and leaving the Vercel records unproxied takes the live marketing
site entirely out of the blast radius. Proxying those too is step 8, optional, and separately
reversible.

Current records, for reference — all four domains are identical:

| Name                 | Type  | Value                                          |
| -------------------- | ----- | ---------------------------------------------- |
| `fooducia.in` (apex) | A     | `216.198.79.1` (Vercel)                        |
| `www`                | CNAME | `c9808e38df3dad37.vercel-dns-017.com` (Vercel) |

### 1. Add the domains to Cloudflare — nothing changes yet

Add `fooducia.in`, `fooduciary.in`, `fooducia.health`, `fooduciary.health`. Cloudflare scans the
existing records and imports them.

**Before touching the nameservers, check every imported record against the table above, and set the
cloud icon to grey (DNS only) on all of them.** An import that quietly drops a record is the usual
way this step goes wrong, and with grey clouds the switchover is a pure nameserver change: same
answers, different servers.

### 2. Switch nameservers at Hostinger

Hostinger → Domains → each domain → DNS / Nameservers → Change → use Cloudflare's two.
Usually live within an hour. Confirm with:

```bash
dig +short NS fooducia.in          # should return the two Cloudflare names
dig +short www.fooducia.in         # should still be the Vercel target
```

Then SSL/TLS → Overview → **Full (strict)**. Not Flexible — Flexible serves HTTPS to the browser
and plain HTTP to the origin, which is a downgrade wearing the padlock.

At this point the site behaves exactly as before. If anything looks wrong, point the nameservers
back at Hostinger and you are where you started.

### 3. Give the API a hostname

Render → `f2f-api` → Settings → Custom Domains → add `api.fooducia.in`.

Cloudflare → DNS → add, **grey cloud for now**:

```
CNAME   api   farm-to-flat.onrender.com
```

Wait for Render to report the certificate as issued — it needs to reach the origin unproxied to
validate, which is why this starts grey. Then check:

```bash
curl -s https://api.fooducia.in/health | jq .
```

Now switch that one record to **orange (Proxied)** and run the same curl again. If it still answers,
Cloudflare is in the path.

### 4. Let the webhook through — before any other rule

Cloudflare's bot and managed rules will block Razorpay's server-to-server POST, and the failure is
silent: payments stop confirming and nothing in the app looks wrong. Put this rule in place while
there is still nothing to block.

WAF → Custom rules → Create, **first in the list**:

```
Name:        razorpay-webhook-skip
Expression:  (http.host eq "api.fooducia.in" and
              http.request.uri.path eq "/api/v1/webhooks/razorpay")
Action:      Skip  →  tick All remaining custom rules, Rate limiting rules,
                      Managed rules, Bot Fight Mode
```

### 5. Move the clients over

- Razorpay dashboard → Webhooks → URL to `https://api.fooducia.in/api/v1/webhooks/razorpay`.
  **Keep the existing secret** — changing it means updating `RAZORPAY_WEBHOOK_SECRET` on Render too,
  and a mismatch there is how the last webhook outage happened.
- Vercel → admin project → `VITE_API_URL` = `https://api.fooducia.in` → redeploy.
- `apps/customer/eas.json` → `EXPO_PUBLIC_API_URL` = `https://api.fooducia.in` in `preview-live`
  and `production`. Needs a new build, so it rides along with the next one.
- `CORS_ORIGIN` on Render does **not** change. It lists the browser origins that call the API; the
  API's own hostname is not one of them.

Then put a real payment through and confirm the order reaches CONFIRMED. Do this before step 7 —
you want the payment path proven while it is still trivially reversible.

### 6. Rate limiting

The Free plan allows **one** rate-limiting rule and five WAF custom rules; if you want both of the
below, that is the Pro plan. With one, spend it here:

```
Name:       otp-flood
Expression: (http.host eq "api.fooducia.in" and
             starts_with(http.request.uri.path, "/api/v1/auth/otp"))
Characteristic: IP
Rate:       5 requests / 10 minutes
Action:     Block
```

Every request past that limit is an SMS that MSG91 bills you for, which is why this one comes first.

A second, if you have it — matching `RATE_LIMIT_PER_MIN` in the API so the edge absorbs a flood
before it reaches a $7 instance, with the in-process limiter still behind it as a backstop:

```
Expression: (http.host eq "api.fooducia.in" and
             starts_with(http.request.uri.path, "/api/v1/"))
Rate:       600 requests / minute per IP
Action:     Managed Challenge
```

### 7. The origin lock — order matters here

Reversed, the API is down until the rule exists.

**a.** Cloudflare → Rules → Transform Rules → **Modify Request Header** → Create:

```
Name:   origin-lock
If:     All incoming requests
Then:   Set static  →  Header: X-Origin-Secret
                       Value:  <the secret>
```

**b.** Confirm the edge is adding it, while the origin still ignores it:

```bash
curl -s https://api.fooducia.in/health | jq .originLock     # → false, and 200 OK
```

**c.** Render → `f2f-api` → Environment → add `ORIGIN_SHARED_SECRET` = the same value. Save, and
wait for the redeploy to finish.

**d.** Verify both sides:

```bash
curl -s https://api.fooducia.in/health | jq .originLock
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://farm-to-flat.onrender.com/api/v1/catalog/search?q=tomato"
```

`true`, then `403`. The second is the point of the whole exercise: the Render hostname still
resolves, but it no longer serves anyone who skipped the edge.

If something goes wrong, deleting `ORIGIN_SHARED_SECRET` on Render restores the previous behaviour
within one redeploy. The code is written to be inert without it.

### 8. Do NOT proxy the website

An earlier draft of this document had proxying the Vercel records as an optional later step. It
should not be done, and Vercel says so itself — the Domains page carries a warning on all eight
hostnames:

> Using a proxy in front of Vercel prevents our automated DDOS and bot-mitigation tools from
> working correctly. It can also degrade performance.

Vercel runs its own edge, its own DDoS absorption and its own bot mitigation. Putting Cloudflare
in front does not add a layer; it blinds the one that is already there, and takes on Vercel's
certificate renewal as a new failure mode in exchange. The apex and `www` records stay grey-cloud
permanently.

This costs nothing, because the protection was never needed there. The marketing site is static
and the admin console is a static bundle whose every call is authenticated by the API — which is
the thing being proxied. All of the value in this document comes from `api.fooducia.in`.

### 9. Caching

Caching → Cache Rules → for `(http.host eq "api.fooducia.in" and
starts_with(http.request.uri.path, "/api/v1/catalog"))` → Eligible for cache, Edge TTL 5 minutes.

Leave `/auth`, `/me`, `/cart`, `/orders` and `/wallet` uncached. They are per-customer and
authenticated, and a cache hit across customers there is a data leak, not a speed-up.
