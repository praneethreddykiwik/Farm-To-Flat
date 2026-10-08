# Money paths — audit, 8 October 2026

Audited before switching to live Razorpay keys. Three passes: how Stripe, Razorpay, Uber and
Modern Treasury actually solve this; our wallet ledger; our order↔payment state machine.

The headline finding was live and exploitable. It is fixed.

---

## The three legs, and which one is the authority

Stripe's prescription for exactly our shape: the **webhook is the guaranteed path**, the **client
callback is a latency optimisation**, and both call _one idempotent server-side function_ that
**re-fetches the object from the gateway** rather than trusting anything the browser carried.

We had two of the three legs and neither re-fetched. Now:

| Leg                       | Role                                 | Verifies                                  |
| ------------------------- | ------------------------------------ | ----------------------------------------- |
| Client `/payments/verify` | fast path, customer is present       | signature **+ re-fetched gateway amount** |
| Webhook                   | guaranteed path                      | raw-body HMAC + amount from the event     |
| **Reconciler (new)**      | the one that notices nobody else ran | re-reads the gateway every 10 min         |

All three funnel into `lib/capture.js`, anchored on `payment.status`, with no `await` inside the
critical section.

---

## Fixed

### 1. Payment substitution — Critical, live, exploitable

`routes/wallet.js` verified the signature against `req.body.razorpayOrderId || pay.razorpayOrderId`.
The **caller chose what the signature was compared against**.

A Razorpay signature is `HMAC(order_id|payment_id, key_secret)`. It proves that pair was genuinely
paid on this merchant account. It says _nothing_ about which of our payment intents it settles.

1. Start a ₹5,000 top-up → intent A, `order_A`. Don't pay it.
2. Start a ₹100 top-up → intent B, `order_B`. Pay it for real.
3. `POST /payments/verify { paymentId: A, razorpayOrderId: order_B, …B's real triple }`

Owner check passed. Not-already-captured passed. Signature passed. **₹5,000 credited for ₹100
paid.** The same substitution confirms an arbitrarily expensive order for ₹1.

**Fixed:** bound to `pay.razorpayOrderId`; the body's value is ignored. A gateway payment id that
has already settled another intent is refused (`PAYMENT_ALREADY_USED`), so one genuine receipt
cannot be replayed against a fresh intent either.

### 2. The amount was never checked on the path that runs — Critical

The amount guard added a day earlier was dead on the client leg, which carries a signature but no
amount. And the client leg almost always wins the race: once it sets `CAPTURED`, the webhook
returns `already` and never compares. A partial capture confirmed the order in full.

**Fixed:** the client leg now calls `fetchRazorpayPayment()` and passes the gateway's own
`amount`/`currency` into the guard. An unreachable gateway is no longer treated as proof of
payment — it returns 503 and leaves the webhook or the reconciler to settle it, both idempotent.
The gateway's `order_id` is also checked against ours.

### 3. No reconciliation existed at all — Critical (structural)

Nothing ever asked Razorpay whether it agreed with us. The only outbound calls were _create order_
and _create refund_. So every divergence was **permanent and silent**: a webhook secret never set,
a capture lost to a restart, a bank authorising at minute thirty-two.

**Fixed:** `lib/reconcile.js`, every 10 minutes. For every order still open between 10 minutes and
7 days old it re-reads the gateway and routes a captured payment through the same idempotent path.

It converges towards **paid** only — that is provable from the gateway's record. It never cancels,
never refunds, never invents a payment, because converging towards _not paid_ is a judgement with
a customer attached. Anything else is reported to `GET /admin/payment-exceptions`.

First live pass: 4 orders checked, 0 captured, 0 flagged.

### 4. The sweeper could expire an order mid-payment — High

`expirePendingOrders` flipped any `PENDING_PAYMENT` order older than 30 minutes, with no re-check
inside the patch and no regard for an in-flight payment. A UPI collect or a 3DS page sits open past
thirty minutes routinely. The capture then landed on an order that no longer wanted it, became an
orphan, and the customer's only clue was a wallet ledger line — the order is hidden from their list.

**Fixed:** skips any order whose payment has left `CREATED`, and re-asserts the status inside the
patch callback.

### 5. Refund state was never persisted — High

`refundedPaise`, `refundId`, `refundFailed`, `orphan` and `capturedVia` lived only in memory and
were absent from the schema. Refund idempotency reads `refundedPaise`, so **after any restart it
read 0 and the next cancel refunded the whole amount again** — caught only by Razorpay's own
idempotency window, which is finite.

**Fixed:** columns added, persisted and hydrated. Applied to production with targeted
`ADD COLUMN IF NOT EXISTS`.

### 6. The ledger had no invariants — Medium

`ledgerPush` would happily write a negative balance, a fractional amount or an unknown direction.
Safety lived entirely in the single caller's `Math.min(balance, payable)`.

**Fixed:** it now refuses a non-integer or negative amount, an unknown direction, and any debit
larger than the balance. A ledger that cannot refuse an impossible entry is not a ledger.

---

## Known and NOT fixed

Honest list. None is exploitable today; several become serious under load or a second instance.

| #   | Issue                                                                        | Why it is not urgent                                                         | Why it matters later                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Wallet is a mutable balance + JSON blob**, not an append-only ledger table | One writer, one process; the blob is rewritten whole so it cannot half-apply | Industry practice is an append-only double-entry journal with the balance _derived_. Append-only is a convention here, not an enforcement, and every top-up rewrites the entire history (O(n) per write)   |
| 2   | **Money writes are fire-and-forget**                                         | `plan: free` restarts are rare mid-write                                     | The API answers "captured" before the write lands. A process death in that window destroys a credit or loses a debit. `lib/audit.js` already makes this exact argument — money deserves the same treatment |
| 3   | **Single instance is a hard, undocumented requirement**                      | Render is on `plan: free`, one instance                                      | Two processes ⇒ last-writer-wins full-blob wallet writes and a per-process idempotency map. Scaling out silently loses money                                                                               |
| 4   | **Idempotency key is reserved _after_ the work**                             | The emptied cart stops the double-tap in practice                            | Two concurrent requests with the same key both pass. The fix is a DB row with a `UNIQUE` constraint inserted _before_ the work                                                                             |
| 5   | **An operator can advance an unpaid order to CONFIRMED**                     | Requires staff access                                                        | No payment check on that transition; a late capture then also credits the wallet — goods free _and_ credit issued                                                                                          |
| 6   | **Webhook events are not deduplicated by event id**                          | `payment.status` already makes capture idempotent                            | Razorpay sends `x-razorpay-event-id`, unique per event. A processed-id table is the standard defence                                                                                                       |
| 7   | **No boot-time `sum(ledger) === balance` check**                             | Nothing has drifted                                                          | If the ledger blob is ever lost while the balance survives, refund idempotency resets and every cancelled order re-refunds                                                                                 |
| 8   | **`payment.authorized`, `order.paid`, `refund.*`, disputes unhandled**       | We never use manual capture                                                  | A chargeback or a gateway-side refund failure never reaches this system                                                                                                                                    |

Fix order if you want them: 2 → 4 → 5 → 1.

---

## One regulatory note worth knowing

Our wallet is **store credit only** — it cannot be cashed out, cannot pay a third party, and is
redeemable only in our own app. Under RBI's Master Directions on Prepaid Payment Instruments
(para 2.1) that is a **Closed System PPI**, whose issuance is explicitly _"not classified as a
payment system requiring approval / authorisation by RBI."_
([rbi.org.in](https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12156))

That exemption ends the moment we allow cash-out, person-to-person transfer, or spending at other
merchants. At that point the ₹10,000 small-PPI cap, escrow with a scheduled commercial bank,
quarterly auditor certificates and KYC thresholds all apply, and they need authorisation we would
not have. Worth deciding deliberately rather than discovering.

Note also that a draft PPI Master Direction was reportedly issued in April 2026; whether it has
been notified was not verifiable. Check before relying on the 2021 figures.

---

## Before the live keys

1. `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` → live values on Render
2. A **new webhook** in Live mode with its own secret (webhooks are per-mode)
3. Confirm `keyId` starts `rzp_live_` in `/admin/payments-status`
4. **Rotate `ADMIN_TOKEN`** — still `123456`, and it reaches the panel that issues refunds
5. Consider Render **Starter**: the free plan sleeps after ~15 minutes, and a reconciler that does
   not run is the one thing this whole audit was about

Take one small real payment, check it captured at the gateway, confirmed in the panel, and shows
200 on the webhook — then refund it from the panel to prove that direction too.
