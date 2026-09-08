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
import {
  bookedFor,
  book,
  constants,
  createOrder,
  getCommunity,
  getOrderForCustomer,
  listOrdersForCustomer,
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
import { todayISO } from '../lib/dates.js';

export const customerOrdersRouter = Router();

const OrderBody = z.object({
  addressId: z.string().min(1),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  window: z.enum(['MORNING', 'EVENING']),
  couponCode: z.string().nullable().optional(),
  useWallet: z.boolean().optional(),
});

customerOrdersRouter.post(
  '/',
  validateBody(OrderBody),
  asyncHandler(async (req, res) => {
    const cid = req.customerId;
    const { addressId, deliveryDate, window, couponCode, useWallet } = req.body;
    const priced = priceCart(cid);
    if (priced.items.length === 0) throw fail(422, 'CART_EMPTY', 'Your basket is empty.');
    if (!priced.meetsMinimum)
      throw fail(422, 'MIN_ORDER_NOT_MET', 'Minimum order value is ₹500.', {
        minOrderPaise: String(constants().minOrderValuePaise),
      });

    const address = listAddresses(cid).find((a) => a.id === addressId);
    if (!address) throw fail(422, 'VALIDATION', 'Choose a delivery address.');

    const community = getCommunity(address.communityId);
    const windows = generateWindows(community, todayISO(), bookedFor);
    const win = windows.find((w) => w.date === deliveryDate && w.window === window);
    if (!win) throw fail(422, 'VALIDATION', 'Choose a delivery window.');
    if (!win.isOpen || win.remaining <= 0) {
      throw fail(409, 'WINDOW_FULL', 'That window just filled up.', {
        nextAvailable: windows.find((w) => w.isOpen) || null,
      });
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

    // commit
    book(address.communityId, deliveryDate, window);
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
      paymentIntent = {
        paymentId: pay.id,
        razorpayOrderId: pay.razorpayOrderId,
        amountPaise: String(gateway),
        description: `Order ${order.orderNumber}`,
      };
    }
    res.status(201).json({ order: orderCustomer(order), paymentIntent });
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

customerOrdersRouter.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const cid = req.customerId;
    const existing = getOrderForCustomer(req.params.id, cid);
    if (!existing) throw fail(404, 'NOT_FOUND', 'Order not found');
    if (!['CONFIRMED', 'PENDING_PAYMENT'].includes(existing.status))
      throw fail(409, 'CANNOT_CANCEL', 'This order has already been packed.');
    const updated = patchOrder(req.params.id, (o) => {
      o.status = 'CANCELLED';
      o.timeline.push({ status: 'CANCELLED', at: new Date().toISOString() });
    });
    if (existing.walletAppliedPaise > 0)
      ledgerPush(
        cid,
        'CREDIT',
        existing.walletAppliedPaise,
        'REFUND',
        existing.orderNumber,
        `Refund for ${existing.orderNumber}`,
      );
    if (existing.couponCode) releaseCoupon(cid, existing.couponCode);
    res.json({ order: orderCustomer(updated) });
  }),
);
