# Razorpay — how it works here, and what is left to switch on

Verified 8 October 2026 against the live API (`ef7db87e`) and the real Razorpay test account.

## The two legs

A payment is confirmed by whichever of these arrives first; the second is a no-op.

|                                                  | Who calls it                   | What it proves                                                        |
| ------------------------------------------------ | ------------------------------ | --------------------------------------------------------------------- |
| **Client leg** `POST /payments/verify`           | the app, after checkout closes | a signature over `order_id\|payment_id`, verified with the key secret |
| **Webhook leg** `POST /api/v1/webhooks/razorpay` | Razorpay's servers             | a signature over the raw body — **and the amount actually taken**     |

They share `lib/capture.js`, so the two can never disagree about what a capture means.

The webhook is the authoritative one, for two reasons. It is the only leg that survives the phone
dying mid-checkout, and it is the only leg that knows the real figure — the client leg carries a
signature but no amount, so it cannot detect a partial capture.

## Verified working

- **Credentials** — created a real order on the test account: `order_TlS7OP2b7mSzxo`, ₹500, `created`.
- **Payment signature**, against the real key secret: genuine accepted; forged, truncated, missing,
  wrong order id and wrong payment id all rejected, none throwing.
- **Webhook signature**: genuine accepted; forged, empty and **tampered body** rejected — changing
  the amount from 50000 to 1 invalidates it, which is the point.
- **Amount check**: a partial capture, an overpayment and a non-INR currency each leave the order
  `PENDING_PAYMENT` instead of confirming it.
- **Idempotency**: a second capture is a no-op, not a second credit.

## Still off, and why it matters

`RAZORPAY_WEBHOOK_SECRET` is unset on Render, so `/api/v1/webhooks/razorpay` answers every call with
`WEBHOOK_NOT_CONFIGURED`. Confirmed live.

That is not a forgery risk — the endpoint fails closed. The cost is the opposite. With the webhook
dead, the only thing that confirms an order is the app calling back. If the phone locks, loses
signal or is killed while the Razorpay sheet is open, Razorpay has the money, the order expires to
`PAYMENT_FAILED` after 30 minutes, and nothing reconciles it. It is invisible until someone reads
the Razorpay dashboard by hand. Razorpay will also retry the 503 for hours and may disable the
endpoint.

It is also the only leg that checks the amount, so until it is on, a partial capture cannot be
detected at all.

## Switching it on

1. **Render** → `f2f-api` → Environment → add:

   | Key                       | Value                              |
   | ------------------------- | ---------------------------------- |
   | `RAZORPAY_WEBHOOK_SECRET` | `Dzi8Ddu2IP8BEYY879rQBhHU-I3v5eCf` |

   (Generated with `crypto.randomBytes(24)`. Replace it with your own if you prefer — it only has to
   match what you type into Razorpay below.)

2. **Razorpay Dashboard** → Settings → Webhooks → Add New Webhook:
   - **URL**: `https://farm-to-flat.onrender.com/api/v1/webhooks/razorpay`
   - **Secret**: the same value
   - **Events**: `payment.captured`, `payment.failed`

3. Wait for Render to restart, then confirm the process actually sees it:

   ```bash
   curl -s -H "x-admin-token: $ADMIN_TOKEN" https://farm-to-flat.onrender.com/api/v1/admin/payments-status
   ```

   `webhookConfigured` must be `true` and `blockers` empty. The blocker text is deliberate: the
   variable can be set in the dashboard while the running process has not restarted, and that looks
   identical from outside.

4. Press **Send Test Webhook** in Razorpay. A valid signature returns `{"ok":true}`.

## Going live

Everything above is the **test** account — `rzp_test_…`, test cards only, no real money moves.

Real payments need, in order:

1. Razorpay activation completed (the business-details form, which also needs the policy pages now
   live at `/refunds`, `/shipping`, `/contact`)
2. Live keys swapped on Render: `RAZORPAY_KEY_ID` → `rzp_live_…`, plus its secret
3. A **separate** webhook secret for the live account — the test one does not carry over
4. `EXPO_PUBLIC_RAZORPAY_KEY_ID` updated in `eas.json` and a new app build, since the key id ships
   in the bundle

Check `/admin/payments-status` after each step. `keyId` tells you which mode is actually running,
and it is the one number worth reading before trusting a test.

## Testing with test cards

With test keys, use Razorpay's published test cards — e.g. `4111 1111 1111 1111`, any future expiry,
any CVV. Netbanking and UPI have their own test flows in the Razorpay docs. Nothing is charged.

## What protects the money

- The amount is **never** accepted from the client. `OrderBody` has no amount field; every line is
  re-priced from the live catalogue at commit time and the gateway order is created from that
  server-side figure.
- Verification is an **assertion in production**, not a condition. It used to be gated on
  `razorpayEnabled`, which meant an unset or malformed key silently turned the whole payment system
  into the local mock and `{paymentId, success:true}` confirmed orders for free.
- A payment with no gateway order id is refused rather than captured.
- Both HMAC comparisons are constant-time and length-checked first.
- The webhook is mounted **before** `express.json()`, so the signature is computed over the exact
  bytes Razorpay signed.
- Refunds are idempotent, derived from the persisted ledger rather than an in-memory flag, with a
  stable Razorpay idempotency key.
