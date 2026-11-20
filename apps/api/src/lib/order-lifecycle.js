/**
 * The ONE way an order becomes CANCELLED, and the ONE way its wallet money comes back.
 *
 * Before this, three different code paths cancelled orders (customer cancel, admin cancel-decision,
 * admin status PATCH/advance) and two of them refunded while one didn't — so an admin "Cancelled"
 * from the board stranded the customer's wallet money with no way to get it back, and a
 * PAYMENT_FAILED → CONFIRMED → cancel sequence refunded the same money twice. Every path now goes
 * through cancelOrder(), and refunds are idempotent: the amount already returned for an order is
 * read from the customer's persisted wallet ledger, so a second refund (double click, retried
 * request, or a restart between two attempts) returns nothing.
 */
import { getOrder, patchOrder, rawOrders } from '../store.js';
import {
  refundablePaymentsForOrder,
  getWallet,
  ledgerPush,
  releaseCoupon,
  restoreCartFromOrder,
  savePayment,
  paymentForOrder,
} from '../customer-store.js';
import { createRazorpayRefund, razorpayEnabled } from './razorpay.js';
import { notifyAdmins } from './staff-notify.js';
import { IS_TEST } from './env.js';
import { isLeader } from './leader.js';

const TERMINAL = new Set(['CANCELLED', 'DELIVERED']);

/** Paise already credited back to the customer for this order (wallet portion). */
export function refundedForOrder(customerId, orderNumber) {
  const w = getWallet(customerId);
  return (w.ledger || [])
    .filter((e) => e.direction === 'CREDIT' && e.source === 'REFUND' && e.reference === orderNumber)
    .reduce((s, e) => s + Number(e.amountPaise), 0);
}

/**
 * Return whatever part of the order's wallet payment has NOT yet been refunded. Safe to call any
 * number of times; only the outstanding remainder (if any) is credited.
 * @returns {number} paise refunded by this call
 */
export function refundOrderWallet(order, note) {
  if (!order?.customerId || !(order.walletAppliedPaise > 0)) return 0;
  const outstanding =
    order.walletAppliedPaise - refundedForOrder(order.customerId, order.orderNumber);
  if (outstanding <= 0) return 0;
  ledgerPush(
    order.customerId,
    'CREDIT',
    outstanding,
    'REFUND',
    order.orderNumber,
    note || `Refund for ${order.orderNumber}`,
  );
  return outstanding;
}

/**
 * Send the GATEWAY portion of a cancelled order back to the card or UPI handle it came from.
 *
 * The wallet refund above only ever covered `walletAppliedPaise`, so a fully prepaid order — the
 * normal case once prepaid is the default — returned exactly nothing: the order went to CANCELLED,
 * the goods were released, and the money stayed with Razorpay. Verified end to end before this
 * existed: paid ₹1320, cancelled, got back ₹0.
 *
 * This money does NOT go to the wallet. It returns to the original instrument, so it is recorded on
 * the payment rather than the wallet ledger — a CREDIT there would hand the customer the value a
 * second time.
 *
 * Fire-and-forget by design: a cancellation must not fail because a gateway call timed out, and the
 * idempotency key makes the retry safe. A refund we could not place is flagged on the payment and
 * pushed to the operators, because the one thing worse than a slow refund is a silent one.
 * Every captured payment on the order is refunded — the original and each paid addition — each
 * under its own idempotency key.
 * @returns {Promise<number>} paise the gateway accepted for refund
 */
export async function refundOrderGateway(order, note) {
  if (!razorpayEnabled || !order?.id) return 0;
  let total = 0;
  for (const pay of refundablePaymentsForOrder(order.id))
    total += await refundGatewayPayment(order, pay, note);
  return total;
}

/** One payment's share of refundOrderGateway. @returns {Promise<number>} paise accepted */
async function refundGatewayPayment(order, pay, note) {
  if (!pay?.razorpayPaymentId) return 0;
  const already = Number(pay.refundedPaise || 0);
  const outstanding = Number(pay.amountPaise || 0) - already;
  if (outstanding <= 0) return 0;
  try {
    const refund = await createRazorpayRefund({
      paymentId: pay.razorpayPaymentId,
      amountPaise: outstanding,
      // Stable per order+payment, so a retry returns the first refund instead of making another.
      idempotencyKey: `refund:${order.orderNumber}:${pay.id}`,
      notes: { order: order.orderNumber, reason: note || 'Order cancelled' },
    });
    pay.refundedPaise = already + outstanding;
    pay.refundId = refund?.id || null;
    pay.refundedAt = new Date().toISOString();
    pay.refundFailed = null;
    savePayment(pay);
    return outstanding;
  } catch (e) {
    const firstFailure = !pay.refundFailed;
    pay.refundFailed = e?.message || 'Refund failed';
    pay.refundFailedAt = pay.refundFailedAt || new Date().toISOString();
    pay.refundAttempts = Number(pay.refundAttempts || 0) + 1;
    savePayment(pay);
    // eslint-disable-next-line no-console
    console.error(
      `[refund] ${order.orderNumber}: gateway refund of ${outstanding} paise FAILED (attempt ${pay.refundAttempts}) — ${pay.refundFailed}.`,
    );
    // Tell the operators once when it first fails (it will be retried automatically), and again
    // only when the retries give up and a person has to refund it by hand.
    if (firstFailure || pay.refundAttempts === REFUND_MAX_ATTEMPTS)
      notifyAdmins({
        title: firstFailure ? 'Refund failed — retrying' : 'Refund needs a human',
        body: firstFailure
          ? `${order.orderNumber} · ₹${Math.round(outstanding / 100)} could not be refunded yet. We will keep trying.`
          : `${order.orderNumber} · ₹${Math.round(outstanding / 100)} still not refunded after ${REFUND_MAX_ATTEMPTS} tries. Refund it in the Razorpay dashboard.`,
        data: { type: 'REFUND_FAILED', orderId: order.id },
      });
    return 0;
  }
}

/**
 * Retry gateway refunds that failed (review #4, 21 Nov 2026).
 *
 * A failed refund used to be attempted exactly once: it was flagged and the operators were told,
 * but if nobody acted, the customer simply never got their money back. Now cancelled orders with a
 * failed refund are retried every pass, under the SAME idempotency key (so a refund that actually
 * went through the first time is returned, never made twice), up to REFUND_MAX_ATTEMPTS.
 *
 * Note: `refundAttempts` is kept in memory; after a restart the count starts again, which only
 * means a few more (safe, idempotent) tries.
 * @returns {Promise<{ tried: number, refundedPaise: number }>}
 */
export async function retryFailedRefunds() {
  if (!razorpayEnabled) return { tried: 0, refundedPaise: 0 };
  let tried = 0;
  let refundedPaise = 0;
  for (const o of rawOrders()) {
    if (o.status !== 'CANCELLED') continue;
    for (const pay of refundablePaymentsForOrder(o.id)) {
      if (!pay.refundFailed) continue;
      if (Number(pay.refundAttempts || 0) >= REFUND_MAX_ATTEMPTS) continue;
      tried += 1;
      refundedPaise += await refundGatewayPayment(o, pay, 'Order cancelled (retry)');
    }
  }
  return { tried, refundedPaise };
}
const REFUND_MAX_ATTEMPTS = 12; // every 10 minutes → about two hours of retries
if (!IS_TEST)
  setInterval(
    () =>
      retryFailedRefunds().catch((e) =>
        // eslint-disable-next-line no-console
        console.error('[refund] retry pass failed', e?.message || e),
      ),
    10 * 60 * 1000,
  ).unref();

/**
 * Cancel an order: status → CANCELLED, request flag cleared, wallet refunded (idempotently), coupon
 * released. Idempotent: cancelling an already-cancelled order returns it unchanged. Never cancels a
 * DELIVERED order (callers decide what to do about that; this refuses).
 * @returns {{ order: any, changed: boolean, refundedPaise: number } | null}
 */
export function cancelOrder(orderId, { timelineStatus = 'CANCELLED' } = {}) {
  const existing = getOrder(orderId);
  if (!existing) return null;
  if (existing.status === 'DELIVERED') return { order: existing, changed: false, refundedPaise: 0 };
  let changed = false;
  const order = patchOrder(orderId, (o) => {
    if (!TERMINAL.has(o.status)) {
      o.status = 'CANCELLED';
      o.timeline.push({ status: timelineStatus, at: new Date().toISOString() });
      changed = true;
    }
    if (o.cancelRequested) {
      o.cancelRequested = false;
      changed = true;
    }
  });
  const refundedPaise = refundOrderWallet(order);
  // The gateway leg is async and must not hold up the cancellation, which is already decided.
  if (changed)
    refundOrderGateway(order, 'Order cancelled').catch(() => {
      /* refundOrderGateway already flagged and reported this */
    });
  if (order.customerId && order.couponCode) releaseCoupon(order.customerId, order.couponCode);
  // An order that never got paid for is an abandoned checkout, not a completed purchase: give the
  // basket back so "try again" is one tap, not a re-shop. Only ever fills an EMPTY cart
  // (restoreCartFromOrder refuses otherwise), so a basket built since is never clobbered.
  if (changed && existing.status === 'PENDING_PAYMENT' && order.customerId)
    restoreCartFromOrder(order.customerId, order);
  return { order, changed, refundedPaise };
}

/**
 * An order that has been PENDING_PAYMENT for longer than ORDER_RELEASE_MINUTES (default 30) is the
 * customer abandoning checkout. Until now such orders lived forever — holding the window slot, the
 * day's product cap, the coupon and the wallet debit. They now become PAYMENT_FAILED (wallet returned,
 * coupon released, slot freed by derivation). A payment that still captures later is handled by the
 * orphan path in /payments/verify (returned to the wallet).
 * @returns {number} orders expired by this pass
 */
export function expirePendingOrders({
  now = Date.now(),
  minutes = Number(process.env.ORDER_RELEASE_MINUTES) || 30,
} = {}) {
  const cutoff = now - minutes * 60 * 1000;
  let n = 0;
  // Two passes on purpose. This runs every 60s forever, and listOrders() deep-clones the entire
  // order book (JSON round-trip) just to read three fields off each one. Select first from the live
  // array without cloning, then patch — so nothing structurally mutates while we're iterating it.
  const expired = [];
  for (const o of rawOrders()) {
    if (o.status !== 'PENDING_PAYMENT') continue;
    if (new Date(o.createdAt).getTime() > cutoff) continue;
    expired.push({
      id: o.id,
      orderNumber: o.orderNumber,
      customerId: o.customerId,
      couponCode: o.couponCode,
    });
  }
  for (const o of expired) {
    if (
      failUnpaidOrder(o, {
        now,
        reason: `Checkout timed out for ${o.orderNumber}, wallet returned`,
      })
    )
      n += 1;
  }
  return n;
}

/**
 * Give up on an order that was never paid: PAYMENT_FAILED, wallet returned, coupon released, basket
 * put back. Shared by the 30-minute expiry above and by checkout itself when the gateway refuses to
 * open a payment at all (review #3, 21 Nov 2026) — that order used to sit in "awaiting payment"
 * holding the slot, the stock and the wallet money for half an hour while the customer saw an error.
 *
 * @param {{ id: string, orderNumber: string, customerId?: string, couponCode?: string }} o
 * @param {{ now?: number, reason: string }} opts
 * @returns {boolean} whether the order was failed by this call
 */
export function failUnpaidOrder(o, { now = Date.now(), reason }) {
  {
    // A payment that is no longer CREATED means the gateway has it — authorised, captured, or
    // being argued over with a bank. Expiring that order would return the wallet leg and restore
    // the cart while the money is still in flight; the capture then lands on an order that no
    // longer wants it and becomes an orphan credit. A UPI collect or a 3DS page can easily sit
    // open past thirty minutes, so this is not a narrow race.
    const pay = paymentForOrder(o.id);
    if (pay && pay.status !== 'CREATED') return false;
    let changed = false;
    const updated = patchOrder(o.id, (ord) => {
      // Re-assert inside the patch: the order may have been paid between selection and here.
      if (ord.status !== 'PENDING_PAYMENT') return;
      ord.status = 'PAYMENT_FAILED';
      ord.timeline.push({ status: 'PAYMENT_FAILED', at: new Date(now).toISOString() });
      changed = true;
    });
    if (!changed) return false;
    refundOrderWallet(updated, reason);
    if (o.customerId && o.couponCode) releaseCoupon(o.customerId, o.couponCode);
    // The customer walked away mid-payment. Put the basket back for when they return.
    if (o.customerId) restoreCartFromOrder(o.customerId, updated);
    return true;
  }
}
if (!IS_TEST) setInterval(() => isLeader() && expirePendingOrders(), 60 * 1000).unref();
