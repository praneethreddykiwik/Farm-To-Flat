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
  addOrderIssue,
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
import { notifyAdmins } from '../lib/staff-notify.js';
import {
  allowedImageTypes,
  signOrderIssuePhotos,
  storageEnabled,
  uploadIssuePhoto,
} from '../lib/storage.js';
import { idempotencyGet, idempotencyPut } from '../lib/idempotency.js';
import { todayISO } from '../lib/dates.js';

export const customerOrdersRouter = Router();

const OrderBody = z.object({
  // Client-generated per checkout attempt; a retry with the same key replays the first response.
  idempotencyKey: z.string().min(8).max(80).optional(),
  addressId: z.string().min(1),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Not an enum: windows are per-community and operator-defined, so the set of valid keys is not
  // knowable here. The lookup against the community's own generated windows a few lines down is the
  // real check — and a stricter one, since it also rejects a key that is valid for a DIFFERENT
  // community than the one this address sits in.
  window: z.string().min(1).max(32),
  couponCode: z.string().nullable().optional(),
  useWallet: z.boolean().optional(),
  deliveryNote: z.string().trim().max(200).optional(), // "leave with the guard", gate code, etc.
  paymentMethod: z.enum(['PREPAID', 'COD']).optional(),
});

customerOrdersRouter.post(
  '/',
  validateBody(OrderBody),
  asyncHandler(async (req, res) => {
    const cid = req.customerId;
    const { addressId, deliveryDate, window, couponCode, useWallet, deliveryNote, idempotencyKey } =
      req.body;
    const cod = req.body.paymentMethod === 'COD';
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

    // Cash on delivery. Checked at COMMIT time against the live setting, never against what the app
    // believed when the basket was built — an operator who turns cash off must have it off now.
    if (cod) {
      const codCfg = constants().cod;
      if (!codCfg.enabled)
        throw fail(409, 'COD_UNAVAILABLE', 'Cash on delivery is not available right now.');
      if (payable > codCfg.maxOrderPaise)
        throw fail(422, 'COD_LIMIT_EXCEEDED', 'This order is too large to pay in cash.', {
          maxOrderPaise: String(codCfg.maxOrderPaise),
        });
    }

    const wallet = getWallet(cid);
    // A cash order is paid entirely in cash. Splitting it across the wallet would leave the person
    // at the door reconciling a part-payment, and a refund on a part-cash order has two sources.
    const walletApplied =
      !cod && useWallet && wallet.balancePaise > 0 ? Math.min(wallet.balancePaise, payable) : 0;
    const gateway = cod ? 0 : payable - walletApplied;

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
        // Who to ask for and what number to ring AT THE DOOR. The customer can put someone else
        // here — a spouse, a parent, the flat's help — and without it the delivery person rings the
        // account holder, who may be at work. The landmark is what actually gets them to the gate.
        recipientName: address.recipientName || null,
        contactNumber: address.contactNumber || null,
        landmark: address.landmark || null,
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
      paymentMethod: cod ? 'COD' : 'PREPAID',
      // Nothing to collect online, so a cash order is live the moment it is placed — the money
      // arrives at the door. This is what makes it the Zepto-style one-tap flow.
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
    const body = { order: await signOrderIssuePhotos(orderCustomer(order)), paymentIntent };
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
    res.json({ order: await signOrderIssuePhotos(orderCustomer(o)) });
  }),
);

/**
 * Cancel an order, or ask to.
 *
 * Two different things, split at the packing bench:
 *
 *   • Before PACKING nobody has touched the order, so the customer cancels OUTRIGHT and is refunded
 *     immediately — no request, no waiting on a human.
 *   • From PACKING onwards the goods are already weighed and bagged against it, so it becomes a
 *     REQUEST an operator accepts or declines. Refusing outright was wrong: a customer whose plans
 *     change forty minutes before a delivery window has no way to tell anyone, and the bag goes out
 *     to a door nobody opens. Asking is always allowed; granting it is the operator's call.
 *
 * The operator answers on the Fulfilment board's "Cancellation requests" column, which refunds
 * through the same shared cancel path as everything else.
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
    // Packed or on the road: the goods exist and are allocated, so this becomes a request rather
    // than a cancellation. Idempotent — asking twice is the same as asking once.
    if (existing.status === 'PACKING' || existing.status === 'OUT_FOR_DELIVERY') {
      if (existing.cancelRequested)
        return res.json({
          order: await signOrderIssuePhotos(orderCustomer(existing)),
          cancelled: false,
          requested: true,
        });
      const updated = patchOrder(req.params.id, (ord) => {
        ord.cancelRequested = true;
        ord.cancelReason = req.body.reason || null;
        ord.cancelRequestedAt = new Date().toISOString();
        ord.timeline.push({ status: 'CANCEL_REQUESTED', at: ord.cancelRequestedAt });
      });
      // The operator has to actually find out. Without this the request sits on a board nobody is
      // looking at while the customer waits, which is worse than having refused in the first place.
      notifyAdmins({
        title: 'Cancellation requested',
        body: `${updated.orderNumber} · ${updated.customerName} · ${updated.address?.block || ''} ${updated.address?.flat || ''}`.trim(),
        data: { type: 'CANCEL_REQUEST', orderId: updated.id },
      });
      return res.json({
        order: await signOrderIssuePhotos(orderCustomer(updated)),
        cancelled: false,
        requested: true,
      });
    }

    // Everything before the packing bench — cancel outright and refund now.
    const { order: updated } = cancelOrder(req.params.id);
    res.json({
      order: await signOrderIssuePhotos(orderCustomer(updated)),
      cancelled: true,
      requested: false,
    });
  }),
);

/**
 * "Something in this bag is wrong."
 *
 * A photograph taken at the door is the only evidence either side will ever have, so the window to
 * send one is deliberately generous — a customer who unpacks an hour later can still report it —
 * but it closes eventually, because a claim about produce nobody can inspect any more is not
 * something an operator can fairly judge.
 *
 * Photos go through the API rather than straight to storage: the storage key stays server-side, and
 * an unbounded upload endpoint pointed at a public bucket is how that bucket becomes someone else's
 * file host.
 */
const ISSUE_WINDOW_HOURS = 48;
const IssueBody = z.object({
  reason: z.enum(['DAMAGED', 'MISSING', 'WRONG_ITEM', 'QUALITY', 'OTHER']).optional(),
  note: z.string().trim().max(500).optional(),
  photos: z
    .array(
      z.object({
        contentType: z.enum(/** @type {any} */ (allowedImageTypes)),
        dataBase64: z.string().min(1),
      }),
    )
    .max(5)
    .optional(),
});
customerOrdersRouter.post(
  '/:id/issue',
  validateBody(IssueBody),
  asyncHandler(async (req, res) => {
    const cid = req.customerId;
    const order = getOrderForCustomer(req.params.id, cid);
    if (!order) throw fail(404, 'NOT_FOUND', 'Order not found');
    if (order.status !== 'DELIVERED')
      throw fail(
        409,
        'NOT_DELIVERED',
        'You can report a problem once the order has been delivered.',
      );
    const deliveredAt = Date.parse(order.deliveredAt || order.createdAt);
    if (Number.isFinite(deliveredAt) && Date.now() - deliveredAt > ISSUE_WINDOW_HOURS * 3600 * 1000)
      throw fail(409, 'ISSUE_WINDOW_CLOSED', 'This order is too old to report a problem against.', {
        windowHours: String(ISSUE_WINDOW_HOURS),
      });

    const photos = [];
    for (const p of req.body.photos || []) {
      const buffer = Buffer.from(p.dataBase64, 'base64');
      if (!buffer.length) continue;
      if (buffer.length > 6 * 1024 * 1024)
        throw fail(413, 'TOO_LARGE', 'Each photo must be under 6 MB.');
      if (!storageEnabled) throw fail(501, 'STORAGE_OFF', 'Photo storage is not configured yet.');
      photos.push(
        await uploadIssuePhoto({
          buffer,
          contentType: p.contentType,
          orderId: order.id,
        }),
      );
    }
    if (!photos.length && !req.body.note)
      throw fail(422, 'VALIDATION', 'Add a photo or tell us what went wrong.');

    const issue = addOrderIssue(order.id, { ...req.body, photos });
    // The operator has to find out. A complaint sitting on a screen nobody opens is worse than no
    // complaint process at all.
    notifyAdmins({
      title: 'Problem reported',
      body: `${order.orderNumber} · ${order.customerName} · ${issue.reason}`,
      data: { type: 'ORDER_ISSUE', orderId: order.id, issueId: issue.id },
    });
    res.status(201).json({
      issue,
      order: await signOrderIssuePhotos(orderCustomer(getOrderForCustomer(order.id, cid))),
    });
  }),
);
