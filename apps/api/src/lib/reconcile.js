/**
 * Ask the gateway what it thinks, and converge.
 *
 * Until now nothing ever did. Every way a payment and an order can disagree — a webhook secret
 * that was never set, a capture that landed while the process was restarting, a bank that
 * authorised at minute thirty-two — produced a state that stayed wrong for ever, because the only
 * two things that could fix it were the app calling back and a webhook, and both had already
 * happened or already failed.
 *
 * This is the third leg. It is deliberately the dullest of the three: it holds no opinion, it
 * simply re-reads the gateway's record for anything of ours that is still open and routes it
 * through the same idempotent capture path the other two use. Running it twice changes nothing.
 *
 * What it does NOT do: it never cancels, never refunds, never invents a payment. Converging
 * towards "paid" is safe — the money is demonstrably there. Converging towards "not paid" is a
 * judgement with a customer attached, so a payment the gateway has no record of is reported, not
 * resolved.
 */
import { capturePayment } from './capture.js';
import { fetchPaymentsForOrder, razorpayEnabled } from './razorpay.js';
import { IS_TEST } from './env.js';
import { listOrders } from '../store.js';
import { paymentForOrder } from '../customer-store.js';

/** Orders younger than this are still legitimately in flight; leave them alone. */
const MIN_AGE_MS = 10 * 60 * 1000;
/** Nothing older than this is worth chasing automatically — it belongs to a person. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Problems a human has to look at. Kept in memory and exposed; see routes/admin/payments.js. */
const exceptions = [];
export const listReconcileExceptions = () => exceptions.slice(-200).reverse();
function flag(kind, detail) {
  exceptions.push({ kind, at: new Date().toISOString(), ...detail });
  if (exceptions.length > 500) exceptions.splice(0, exceptions.length - 500);
  // eslint-disable-next-line no-console
  console.error(`[reconcile] ${kind}`, JSON.stringify(detail));
}

/**
 * One pass.
 * @returns {Promise<{checked:number, captured:number, flagged:number, skipped:string}>}
 */
export async function reconcileOnce({ now = Date.now() } = {}) {
  if (!razorpayEnabled) return { checked: 0, captured: 0, flagged: 0, skipped: 'gateway-disabled' };

  const candidates = listOrders().filter((o) => {
    if (o.status !== 'PENDING_PAYMENT' && o.status !== 'PAYMENT_FAILED') return false;
    const age = now - new Date(o.createdAt).getTime();
    return age > MIN_AGE_MS && age < MAX_AGE_MS;
  });

  let captured = 0;
  let flagged = 0;
  for (const o of candidates) {
    const intent = paymentForOrder(o.id);
    // No intent at all means this order never reached the gateway; nothing to reconcile against.
    if (!intent || !intent.razorpayOrderId) continue;
    if (intent.status === 'CAPTURED') continue;

    // Ask from OUR order id, not from a payment id we may never have been told.
    //
    // This is the whole point of the pass. The case worth recovering is the one where nothing ever
    // reported back — the app was killed at the checkout sheet, the webhook secret was unset, the
    // process restarted mid-capture. In every one of those we hold our gateway order id and
    // nothing else. Razorpay can list the attempts against it.
    const attempts = await fetchPaymentsForOrder(intent.razorpayOrderId);
    if (!attempts) continue; // unreachable now; the next pass will try again
    if (!attempts.length) continue; // genuinely never paid — correct as it stands

    // A gateway order can hold several attempts (a failed card, then a successful UPI). Only a
    // captured one is money we actually have.
    const gw =
      attempts.find((a) => a.status === 'captured') ||
      attempts.find((a) => a.status === 'authorized');
    if (!gw) continue;

    if (gw.status === 'captured') {
      const r = await capturePayment({
        paymentId: intent.id,
        razorpayPaymentId: gw.id,
        source: 'reconcile',
        amountPaise: gw.amount,
        currency: gw.currency,
      });
      if (r.outcome === 'captured') {
        captured += 1;
        // eslint-disable-next-line no-console
        console.error(`[reconcile] recovered ${o.orderNumber} from the gateway`);
      } else if (r.outcome === 'mismatch' || r.outcome === 'orphaned') {
        flag(r.outcome, {
          orderNumber: o.orderNumber,
          expectedPaise: r.expectedPaise,
          gotPaise: r.gotPaise,
          paymentId: gw.id,
        });
        flagged += 1;
      }
    } else if (gw.status === 'authorized') {
      // Money is held but not taken. We never capture manually, so this will auto-void at the
      // gateway in a few days — but somebody should know it happened.
      flag('authorized-not-captured', { orderNumber: o.orderNumber, paymentId: gw.id });
      flagged += 1;
    }
  }

  return { checked: candidates.length, captured, flagged, skipped: '' };
}

// Every 10 minutes. Long enough not to hammer the gateway, short enough that a customer whose
// phone died at checkout is sorted out before they think to complain.
if (!IS_TEST)
  setInterval(
    () =>
      reconcileOnce().catch((e) => {
        // eslint-disable-next-line no-console
        console.error('[reconcile] pass failed', e?.message || e);
      }),
    10 * 60 * 1000,
  ).unref();
