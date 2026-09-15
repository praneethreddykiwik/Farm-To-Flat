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
import { getOrder, patchOrder } from '../store.js';
import { getWallet, ledgerPush, releaseCoupon } from '../customer-store.js';

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
