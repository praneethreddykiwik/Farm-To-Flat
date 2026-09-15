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
import { getOrder, listOrders, patchOrder } from '../store.js';
import { getWallet, ledgerPush, releaseCoupon } from '../customer-store.js';
import { IS_TEST } from './env.js';

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
  if (order.customerId && order.couponCode) releaseCoupon(order.customerId, order.couponCode);
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
  for (const o of listOrders()) {
    if (o.status !== 'PENDING_PAYMENT') continue;
    if (new Date(o.createdAt).getTime() > cutoff) continue;
    const updated = patchOrder(o.id, (ord) => {
      ord.status = 'PAYMENT_FAILED';
      ord.timeline.push({ status: 'PAYMENT_FAILED', at: new Date(now).toISOString() });
    });
    refundOrderWallet(updated, `Checkout timed out for ${o.orderNumber}, wallet returned`);
    if (o.customerId && o.couponCode) releaseCoupon(o.customerId, o.couponCode);
    n += 1;
  }
  return n;
}
if (!IS_TEST) setInterval(() => expirePendingOrders(), 60 * 1000).unref();
