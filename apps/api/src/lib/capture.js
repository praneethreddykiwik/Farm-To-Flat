/**
 * Turning a gateway payment into a confirmed order — the ONE place that does it.
 *
 * Two callers now reach this: the app's /payments/verify (fast, the customer is watching) and
 * Razorpay's webhook (slow, authoritative, arrives even when the app is gone). They must agree,
 * because whichever lands second has to be a no-op rather than a second confirmation or a second
 * refund.
 *
 * Idempotency is anchored on `payment.status`: once CAPTURED, every later call — retry, webhook
 * replay, double tap — returns `already` and changes nothing.
 */
import { getOrder, patchOrder } from '../store.js';
import {
  getPayment,
  getWallet,
  ledgerPush,
  paymentByRazorpayOrderId,
  savePayment,
} from '../customer-store.js';

/**
 * @param {{ paymentId?: string, razorpayOrderId?: string, razorpayPaymentId?: string,
 *           source?: 'client'|'webhook', amountPaise?: number|string, currency?: string }} args
 * @returns {Promise<{ outcome: 'already'|'captured'|'orphaned'|'unknown'|'mismatch',
 *                     payment?: any, order?: any, expectedPaise?: string, gotPaise?: string }>}
 */
export async function capturePayment({
  paymentId,
  razorpayOrderId,
  razorpayPaymentId,
  source = 'client',
  amountPaise,
  currency,
}) {
  // The webhook never sees our internal payment id — it only knows Razorpay's order id, so the
  // lookup has to work from either end.
  const pay = paymentId ? getPayment(paymentId) : paymentByRazorpayOrderId(razorpayOrderId);
  if (!pay) return { outcome: 'unknown' };
  if (pay.status === 'CAPTURED') return { outcome: 'already', payment: pay };

  // What the gateway says it took must match what we asked for. Nothing compared these before, so a
  // partial capture, a currency mismatch, or an order created with partial_payment would have
  // confirmed the order in full and credited a top-up that was never funded. Only the webhook knows
  // the real figure (the client leg has only a signature), so this runs when a caller supplies one.
  if (amountPaise != null && Number(amountPaise) !== Number(pay.amountPaise))
    return {
      outcome: 'mismatch',
      payment: pay,
      expectedPaise: String(pay.amountPaise),
      gotPaise: String(amountPaise),
    };
  if (currency && String(currency).toUpperCase() !== 'INR')
    return {
      outcome: 'mismatch',
      payment: pay,
      expectedPaise: String(pay.amountPaise),
      gotPaise: `${currency}`,
    };

  pay.status = 'CAPTURED';
  pay.razorpayPaymentId = razorpayPaymentId || pay.razorpayPaymentId || `pay_rzp_${Date.now()}`;
  pay.capturedVia = source;

  if (pay.purpose === 'TOPUP') {
    savePayment(pay);
    ledgerPush(
      pay.customerId,
      'CREDIT',
      pay.amountPaise,
      'TOPUP',
      pay.razorpayPaymentId,
      'Wallet top-up',
    );
    return { outcome: 'captured', payment: pay };
  }

  const current = getOrder(pay.orderId);
  if (current && current.status !== 'PENDING_PAYMENT') {
    // Money for an order that is no longer waiting for it — cancelled, or already failed, while the
    // checkout sheet was still open. Never swallow it: record the capture as orphaned and hand the
    // full amount back as wallet credit, visibly, so nothing is lost and ops can see it.
    pay.orphan = true;
    savePayment(pay);
    ledgerPush(
      pay.customerId,
      'CREDIT',
      pay.amountPaise,
      'REFUND',
      `${current.orderNumber}:gateway`,
      `Payment received after ${current.orderNumber} was ${String(current.status).toLowerCase().replace('_', ' ')} — returned to wallet`,
    );
    return { outcome: 'orphaned', payment: pay, order: current };
  }

  savePayment(pay);
  const updated = patchOrder(pay.orderId, (ord) => {
    if (ord.status === 'PENDING_PAYMENT') {
      ord.status = 'CONFIRMED';
      ord.timeline.push({ status: 'CONFIRMED', at: new Date().toISOString() });
    }
  });
  return { outcome: 'captured', payment: pay, order: updated };
}

/** The wallet balance after a capture, for the caller that wants to echo it back. */
export const walletBalanceOf = (customerId) => getWallet(customerId).balancePaise;
