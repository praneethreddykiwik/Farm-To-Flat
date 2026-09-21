/**
 * Customer orders (contract, authenticated). POST /orders is the transaction: re-price the cart,
 * enforce the ₹500 minimum, resolve + capacity-check the window, lock the coupon, decrement the
 * window, debit the wallet, and return a paymentIntent only when a gateway amount remains. Orders
 * land in the shared store, so they appear on the admin fulfilment board immediately.
 *
 * This mirrors apps/customer/src/api/mock/server.js. The production version is Adnan's, with real
 * row locks + idempotency; the shape and rules are identical.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../http.js';
import { validateBody } from '../validate.js';
import { orderCustomer } from '../serialize.js';
import { createRazorpayOrder, razorpayEnabled, razorpayKeyId } from '../lib/razorpay.js';
import {
  bookedIndex,
  constants,
  createOrder,
  getCommunity,
  getOrderForCustomer,
  getProduct,
  listOrdersForCustomer,
  orderedQtyIndex,
  patchOrder,
} from '../store.js';
import {
  clearCart,
  couponDiscount,
  createPayment,
  getCustomer,
  getWallet,
  ledgerPush,
  listAddresses,
  priceCart,
  rawCart,
  redeemCoupon,
  releaseCoupon,
  validateCoupon,
} from '../customer-store.js';
import { generateWindows } from '../lib/windows.js';
import { cancelOrder } from '../lib/order-lifecycle.js';
import { idempotencyGet, idempotencyPut } from '../lib/idempotency.js';
import { todayISO } from '../lib/dates.js';

export const customerOrdersRouter = Router();

const OrderBody = z.object({
  // Client-generated per checkout attempt; a retry with the same key replays the first response.
  idempotencyKey: z.string().min(8).max(80).optional(),
  addressId: z.string().min(1),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  window: z.enum(['MORNING', 'EVENING']),
  couponCode: z.string().nullable().optional(),
  useWallet: z.boolean().optional(),
  deliveryNote: z.string().trim().max(200).optional(), // "leave with the guard", gate code, etc.
});

customerOrdersRouter.post(
  '/',
  validateBody(OrderBody),
  asyncHandler(async (req, res) => {
    const cid = req.customerId;
    const { addressId, deliveryDate, window, couponCode, useWallet, deliveryNote, idempotencyKey } =
      req.body;
    const replay = idempotencyGet(cid, idempotencyKey);
    if (replay) return res.status(replay.status).json(replay.body);
    const priced = priceCart(cid);
    if (priced.items.length === 0) throw fail(422, 'CART_EMPTY', 'Your basket is empty.');
    if (!priced.meetsMinimum)
      throw fail(422, 'MIN_ORDER_NOT_MET', 'Minimum order value is ₹500.', {
        minOrderPaise: String(constants().minOrderValuePaise),
      });

    const address = listAddresses(cid).find((a) => a.id === addressId);
    if (!address) throw fail(422, 'VALIDATION', 'Choose a delivery address.');

    const community = getCommunity(address.communityId);
    const windows = generateWindows(community, todayISO(), bookedIndex(community.id));
    const win = windows.find((w) => w.date === deliveryDate && w.window === window);
    if (!win) throw fail(422, 'VALIDATION', 'Choose a delivery window.');
    // No capacity limit — a window only closes when its cut-off time passes. Re-checked here at
    // commit time (never trust the client's earlier read of `isOpen`): a window open when the
    // customer started checkout can have crossed its cut-off by the time they tap "Pay".
    if (!win.isOpen) {
      throw fail(409, 'ORDER_CUTOFF_PASSED', 'Orders for that window have closed.', {
        nextAvailable: windows.find((w) => w.isOpen) || null,
      });
    }

    // Re-validate every line against the CURRENT catalog at the moment of commitment: a product that
    // went sold-out/hidden after it was added to the basket must not be ordered, and the farm's daily
    // cap applies to the whole day's orders, not to this one basket.
    // One pass for the whole basket, not one per line — the cap check is O(1) per line from here.
    const orderedQty = orderedQtyIndex(deliveryDate);
    for (const line of priced.items) {
      const p = getProduct(line.productId);
      if (!p || p.isActive === false || (p.availability && p.availability !== 'AVAILABLE'))
        throw fail(
          409,
          'UNAVAILABLE',
          `${line.name} is no longer available. Please remove it from your basket.`,
          { productId: line.productId },
        );
      const already = orderedQty.get(p.id) || 0;
      const left = Math.max(0, Number(p.dailyCap) - already);
      if (Number(line.quantity) > left)
        throw fail(
          422,
          'CAP_EXCEEDED',
          left > 0
            ? `Only ${left} ${p.unit.toLowerCase()} of ${p.name} left for that day.`
            : `${p.name} is fully booked for that day.`,
          { productId: p.id, remaining: String(left) },
        );
    }

    const subtotal = Number(priced.subtotalPaise);
    let discount = 0;
    const code = couponCode || rawCart(cid).couponCode;
    if (code) {
      const r = validateCoupon(cid, code, subtotal);
      if (r.error) throw fail(r.error.status, r.error.code, r.error.message, r.error.details);
      discount = couponDiscount(r.coupon, subtotal);
    }

    const delivery = constants().deliveryChargePaise;
    const payable = Math.max(0, subtotal - discount + delivery);
    const wallet = getWallet(cid);
    const walletApplied =
      useWallet && wallet.balancePaise > 0 ? Math.min(wallet.balancePaise, payable) : 0;
    const gateway = payable - walletApplied;

    // commit — the order itself is the booking (capacity is derived from live orders, see
    // store.bookedFor), so there is no separate counter to bump.
    if (code) redeemCoupon(cid, code);
    const customer = getCustomer(cid);
    const order = createOrder({
      customerId: cid,
      customerName: customer?.name || 'Customer',
      mobile: customer?.mobile,
      address: {
        communityId: address.communityId,
        communityName: address.communityName,
        area: address.area,
        block: address.block,
        flat: address.flat,
      },
      deliveryDate,
      window,
      deliveryNote: deliveryNote || null,
      lines: rawCart(cid).items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        note: i.note,
      })),
      couponCode: code || null,
      couponDiscountPaise: discount,
      walletAppliedPaise: walletApplied,
      gatewayAmountPaise: gateway,
      status: gateway > 0 ? 'PENDING_PAYMENT' : 'CONFIRMED',
    });
    if (walletApplied > 0)
      ledgerPush(
        cid,
        'DEBIT',
        walletApplied,
        'ORDER',
        order.orderNumber,
        `Order ${order.orderNumber}`,
      );
    clearCart(cid);

    let paymentIntent = null;
    if (gateway > 0) {
      const pay = createPayment(cid, { purpose: 'ORDER', orderId: order.id, amountPaise: gateway });
      if (razorpayEnabled) {
        const rzOrder = await createRazorpayOrder({
          amountPaise: gateway,
          receipt: pay.id,
          notes: { purpose: 'ORDER', orderId: order.id, customerId: cid },
        });
        pay.razorpayOrderId = rzOrder.id;
      }
      paymentIntent = {
        paymentId: pay.id,
        // Only advertise a gateway order the gateway actually issued. createPayment always stamps a
        // placeholder id (the mock verify flow keys off it), and handing that to the client made the
        // app open the Razorpay SDK with an order that does not exist — Razorpay then shows its own
        // "Something went wrong" sheet, which is what made checkout impossible on a local API.
        razorpayOrderId: razorpayEnabled ? pay.razorpayOrderId : null,
        keyId: razorpayKeyId,
        amountPaise: String(gateway),
        description: `Order ${order.orderNumber}`,
      };
    }
    const body = { order: orderCustomer(order), paymentIntent };
    idempotencyPut(cid, idempotencyKey, 201, body);
    res.status(201).json(body);
  }),
);

customerOrdersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({
      orders: listOrdersForCustomer(req.customerId).map(orderCustomer),
      nextCursor: null,
    });
  }),
);

customerOrdersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const o = getOrderForCustomer(req.params.id, req.customerId);
    if (!o) throw fail(404, 'NOT_FOUND', 'Order not found');
    res.json({ order: orderCustomer(o) });
  }),
);

/**
 * Cancel an order.
 *
 * The rule is the packing bench, not the payment: until the farm starts putting the order together
 * the customer cancels outright and is refunded immediately — no request, no waiting on staff. Once
 * it is PACKING the goods are already weighed and bagged against it, so cancelling is refused and
 * the app stops offering it.
 *
 * Previously everything from CONFIRMED onwards raised a CANCELLATION REQUEST for an operator to
 * approve, which left the customer waiting on a human for an order nobody had touched yet — and
 * showed the operator an order that was both "Confirmed" and "Cancellation requested" at once.
 */
customerOrdersRouter.post(
  '/:id/cancel',
  validateBody(z.object({ reason: z.string().max(300).optional() })),
  asyncHandler(async (req, res) => {
    const cid = req.customerId;
    const existing = getOrderForCustomer(req.params.id, cid);
    if (!existing) throw fail(404, 'NOT_FOUND', 'Order not found');
    if (existing.status === 'CANCELLED') throw fail(409, 'CANNOT_CANCEL', 'Already cancelled.');
    if (existing.status === 'DELIVERED')
      throw fail(409, 'CANNOT_CANCEL', 'This order has already been delivered.');
    // Packed or on the road: the goods exist and are allocated. Refuse, and say why.
    if (existing.status === 'PACKING' || existing.status === 'OUT_FOR_DELIVERY')
      throw fail(
        409,
        'CANNOT_CANCEL',
        'This order is already being packed, so it can no longer be cancelled here. Contact support if something is wrong.',
      );

    // Everything before the packing bench — cancel outright and refund now.
    const { order: updated } = cancelOrder(req.params.id);
    res.json({ order: orderCustomer(updated), cancelled: true });
  }),
);
