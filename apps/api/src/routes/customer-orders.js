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
import { breakdownSnapshot, priceBreakdown } from '../lib/charges.js';
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
  projectOrderAddition,
  applyOrderAddition,
} from '../store.js';
import {
  clearCart,
  evaluateCoupon,
  createPayment,
  setGatewayOrderId,
  getCustomer,
  getWallet,
  ledgerPush,
  listAddresses,
  priceCart,
  rawCart,
  redeemCoupon,
  redeemedCodes,
  releaseCoupon,
  flushWallet,
  refundablePaymentsForOrder,
} from '../customer-store.js';
import { generateWindows } from '../lib/windows.js';
import { cancelOrder, failUnpaidOrder } from '../lib/order-lifecycle.js';
import { notifyAdmins } from '../lib/staff-notify.js';
import { emitNotification, COPY } from '../lib/notify.js';
import { buildInvoicePdf, invoiceNumberOf } from '../lib/invoice.js';
import {
  waOrderPlaced,
  waOrderCancelled,
  waCancelRequested,
  waRefundInitiated,
} from '../lib/notify-whatsapp.js';

// How long a refund typically takes to reach the customer (gateway refunds). Shown in the refund
// notification so the customer is not left wondering. Wallet refunds are instant but we quote the
// cautious number.
const REFUND_DAYS = Number(process.env.REFUND_ETA_DAYS || 5);
import {
  allowedImageTypes,
  assertRealImage,
  linkOrderIssuePhotos,
  storageEnabled,
  uploadIssuePhoto,
} from '../lib/storage.js';
import { baseUrlOf } from '../lib/media.js';
import { checkCode, recordOrderSource, trackOrderPlaced } from '../lib/growth.js';
import { launchOfferFor } from '../lib/launch-offer.js';
import { track } from '../lib/events.js';
import { wasPlaced } from '../lib/customer-history.js';
import { getOps, putOps } from '../ops-store.js';
import {
  idempotencyAbort,
  idempotencyBegin,
  idempotencyGet,
  idempotencyKeyOf,
  idempotencyPut,
} from '../lib/idempotency.js';
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
  // A promoter's code (the person at a community stall) or a neighbour's invite code. Optional.
  code: z.string().trim().max(20).optional().nullable(),
  // "How did you hear about Fooducia?" — asked before the first order only.
  heardFrom: z.string().max(20).optional().nullable(),
  // The bill total the checkout screen showed (cart.totalPaise, before any wallet split). Review #5
  // (21 Nov 2026): without it the server could not tell that its total differs from the one the
  // customer agreed to. Optional, so builds already on phones (which never send it) behave as before.
  expectedTotalPaise: z
    .union([z.string().regex(/^\d{1,12}$/), z.number().int().nonnegative()])
    .optional(),
});

customerOrdersRouter.post(
  '/',
  validateBody(OrderBody),
  asyncHandler(async (req, res) => {
    const cid = req.customerId;
    const { addressId, deliveryDate, window, couponCode, useWallet, deliveryNote } = req.body;
    const idempotencyKey = idempotencyKeyOf(req);
    const cod = req.body.paymentMethod === 'COD';
    const replay = idempotencyGet(cid, idempotencyKey);
    if (replay) return res.status(replay.status).json(replay.body);
    if (!idempotencyBegin(cid, idempotencyKey))
      throw fail(
        409,
        'ORDER_IN_PROGRESS',
        'Your order is still being placed. Please wait a moment.',
      );
    res.on('finish', () => {
      // Anything but the remembered success releases the key, so a genuine retry can run.
      if (res.statusCode !== 201) idempotencyAbort(cid, idempotencyKey);
    });
    const priced = priceCart(cid);
    if (priced.items.length === 0) throw fail(422, 'CART_EMPTY', 'Your basket is empty.');
    if (!priced.meetsMinimum)
      throw fail(422, 'MIN_ORDER_NOT_MET', 'Minimum order value is ₹500.', {
        minOrderPaise: String(constants().minOrderValuePaise),
      });

    // A typed code is checked BEFORE anything is committed: a typo is a message to fix, not a
    // credit silently lost after the money is taken.
    const firstOrder = !listOrdersForCustomer(cid).some(wasPlaced);
    if (req.body.code) {
      const chk = checkCode(req.body.code, { customerId: cid, isFirstOrder: firstOrder });
      if (!chk.ok) throw fail(422, 'BAD_CODE', chk.message);
    }

    const address = listAddresses(cid).find((a) => a.id === addressId);
    if (!address) throw fail(422, 'VALIDATION', 'Choose a delivery address.');

    const community = getCommunity(address.communityId);
    // Review #10 (21 Nov 2026): a community the operator has switched off (or removed) is not one
    // we deliver to. GET /communities already hides it, but an address saved while it was live
    // still pointed at it, and checkout took the order — for a van that is not going there.
    // Checked at commit time, like the cut-off below, never trusted from the app's earlier read.
    if (!community || community.isActive === false)
      throw fail(
        409,
        'COMMUNITY_INACTIVE',
        'We are not delivering to this community right now, so this order can’t be placed.',
        { communityId: address.communityId },
      );
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
    let freeLine = null;
    const typedCode = couponCode || rawCart(cid).couponCode;
    let code = null;
    if (typedCode) {
      // The SAME evaluator the cart preview used (review #6, 21 Nov 2026).
      const r = evaluateCoupon(cid, typedCode, subtotal);
      if (r.error) throw fail(r.error.status, r.error.code, r.error.message, r.error.details);
      // Security pentest 21 Nov 2026 (C2): the lookup is case-insensitive but the code used to be
      // recorded AS TYPED, while the "already used" check compares the coupon's canonical code — so
      // "farm-fresh100" after "FARM-FRESH100" (or any other casing) redeemed a single-use coupon
      // again. From here on only the canonical code is recorded, released and stored on the order.
      code = r.coupon.code;
      // Redemptions recorded before this fix may be in another case; they still count as used.
      const canon = code.toLowerCase();
      if ([...redeemedCodes(cid)].some((u) => String(u).trim().toLowerCase() === canon))
        throw fail(409, 'COUPON_ALREADY_USED', 'This code has already been used on your account.');
      discount = r.discountPaise;
      freeLine = r.freeLine;
    }
    // A FREE_ITEM gift is a real line, so it counts against the farm's day cap like any other.
    if (freeLine) {
      const p = getProduct(freeLine.productId);
      const already =
        (orderedQty.get(p.id) || 0) +
        Number(priced.items.find((l) => l.productId === p.id)?.quantity || 0);
      if (freeLine.quantity > Math.max(0, Number(p.dailyCap) - already))
        throw fail(
          409,
          'COUPON_ITEM_UNAVAILABLE',
          `The free ${p.name} on this code is fully booked for that day. Pick another day or remove the code.`,
          { productId: p.id },
        );
    }
    // Launch offer — the same function the cart preview used, and only without a coupon.
    let discountType = code ? 'COUPON' : null;
    if (!code) {
      const offer = launchOfferFor(cid, subtotal);
      if (offer && offer.discountPaise > 0) {
        discount = Math.min(offer.discountPaise, subtotal);
        discountType = offer.type;
      }
    }

    // The SAME function the cart preview used. If these two ever diverge, the customer is charged
    // something other than the figure they tapped Pay on.
    const k = constants();
    const bill = priceBreakdown({
      subtotalPaise: subtotal,
      discountPaise: discount,
      deliveryChargePaise: k.deliveryChargePaise,
      charges: k.charges,
      tax: k.tax,
    });
    const delivery = bill.deliveryChargePaise;
    const payable = bill.totalPaise;

    // The customer is charged only the total they saw. A price, fee or offer that changed between
    // the checkout screen and this moment refuses the order — before the coupon is locked or the
    // wallet touched — and hands back the new figure so the app can show it and ask again.
    if (req.body.expectedTotalPaise != null && Number(req.body.expectedTotalPaise) !== payable)
      throw fail(
        409,
        'PRICE_CHANGED',
        'Prices changed since you opened checkout. Please check the new total.',
        {
          expectedTotalPaise: String(req.body.expectedTotalPaise),
          totalPaise: String(payable),
        },
      );

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
      bill,
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
      lines: [
        ...rawCart(cid).items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          note: i.note,
        })),
        // The coupon's gift, at ₹0 — so it is packed and delivered, not just promised.
        ...(freeLine
          ? [
              {
                productId: freeLine.productId,
                quantity: freeLine.quantity,
                note: `Free with ${code}`,
                free: true,
              },
            ]
          : []),
      ],
      couponCode: code || null,
      couponDiscountPaise: discount,
      walletAppliedPaise: walletApplied,
      gatewayAmountPaise: gateway,
      paymentMethod: cod ? 'COD' : 'PREPAID',
      // Nothing to collect online, so a cash order is live the moment it is placed — the money
      // arrives at the door. This is what makes it the Zepto-style one-tap flow.
      status: gateway > 0 ? 'PENDING_PAYMENT' : 'CONFIRMED',
    });
    // Where this order came from (promoter, invite, "how did you hear"). Never throws.
    recordOrderSource({
      order,
      customerId: cid,
      code: req.body.code,
      heardFrom: req.body.heardFrom,
      discountType,
      discountPaise: discount,
    });
    if (order.isFirstOrder && req.body.heardFrom)
      track('source_answered', { answer: String(req.body.heardFrom) }, { customerId: cid });
    // order_placed fires when the order is CONFIRMED — now for cash/wallet, on capture if prepaid.
    if (order.status === 'CONFIRMED') trackOrderPlaced(order);
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

    // "Order placed successfully" — fires now for COD / wallet orders (already CONFIRMED). Prepaid
    // orders are still PENDING_PAYMENT here and get this notification when the payment is verified.
    if (order.status === 'CONFIRMED') {
      const placed = COPY.ORDER_PLACED(order);
      emitNotification(cid, {
        type: 'ORDER_PLACED',
        title: placed.title,
        body: placed.body,
        data: { orderId: order.id, orderNumber: order.orderNumber, action: 'track' },
      });
      waOrderPlaced(order, customer);
    }

    let paymentIntent = null;
    if (gateway > 0) {
      const pay = createPayment(cid, { purpose: 'ORDER', orderId: order.id, amountPaise: gateway });
      if (razorpayEnabled) {
        let rzOrder;
        try {
          rzOrder = await createRazorpayOrder({
            amountPaise: gateway,
            receipt: pay.id,
            notes: { purpose: 'ORDER', orderId: order.id, customerId: cid },
          });
        } catch (e) {
          // Review #3: no gateway order means nothing can be paid. Undo the order now — wallet
          // back, coupon free, basket restored — instead of leaving it "awaiting payment" for 30
          // minutes, and tell the customer plainly that no money was taken.
          failUnpaidOrder(order, { reason: `Payment could not start for ${order.orderNumber}` });
          throw fail(
            /** @type {any} */ (e)?.status === 504 ? 504 : 502,
            'PAYMENT_START_FAILED',
            'We couldn’t start the payment. No money was taken and your basket is back — please try again.',
          );
        }
        setGatewayOrderId(pay, rzOrder.id);
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
    // The wallet DEBIT for this order must be on disk before the order is acknowledged. The
    // failure it prevents: order row lands, wallet write does not, process restarts — and the
    // customer has a deliverable order they were never charged for.
    if (walletApplied > 0) await flushWallet(cid);
    const body = {
      order: linkOrderIssuePhotos(orderCustomer(order), baseUrlOf(req)),
      paymentIntent,
    };
    idempotencyPut(cid, idempotencyKey, 201, body);
    res.status(201).json(body);
  }),
);

/**
 * The customer's own orders.
 *
 * PAYMENT_FAILED is left out on purpose. It is not an order that exists: the wallet was returned,
 * the stock released and the coupon freed the moment the payment failed, and nothing will ever be
 * delivered against it. Listing it put a card with a date and a total in front of the customer that
 * looked exactly like a real order, and the app already refuses to send them to it — checkout sends
 * a failed payment back to the CART, because that is the basket they can still do something with.
 *
 * It stays reachable by id, so an old notification or link still opens and explains itself.
 */
customerOrdersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({
      orders: listOrdersForCustomer(req.customerId)
        .filter((o) => o.status !== 'PAYMENT_FAILED')
        .map(orderCustomer),
      nextCursor: null,
    });
  }),
);

customerOrdersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const o = getOrderForCustomer(req.params.id, req.customerId);
    if (!o) throw fail(404, 'NOT_FOUND', 'Order not found');
    res.json({ order: linkOrderIssuePhotos(orderCustomer(o), baseUrlOf(req)) });
  }),
);

/**
 * Add items to an order AFTER it was placed — the "forgot the coriander" top-up.
 *
 * Allowed only while the order is still editable: status CONFIRMED (not yet being packed) AND the
 * order's delivery window is still open (now < its cut-off). Add-only — there is no remove here;
 * removing paid items opens a refund path we don't want on a window edit.
 *
 * COD orders apply immediately (the extra is collected at the door). PREPAID orders get a payment
 * intent for the DELTA only; the lines are stashed as `pendingAddition` and attach when that payment
 * is verified (lib/capture.js), exactly like the initial order confirms on its payment.
 */
const AddItemsBody = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1).max(60),
        quantity: z.number().positive().max(100000),
        note: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(30),
});
customerOrdersRouter.post(
  '/:id/add-items',
  validateBody(AddItemsBody),
  asyncHandler(async (req, res) => {
    const cid = req.customerId;
    const order = getOrderForCustomer(req.params.id, cid);
    if (!order) throw fail(404, 'NOT_FOUND', 'Order not found');
    if (order.status !== 'CONFIRMED')
      throw fail(409, 'NOT_EDITABLE', 'This order is already being prepared and can’t be edited.');

    // Re-check the window at THIS moment — never trust the client's earlier read. The edit window is
    // the same cut-off that governs new orders for this slot.
    const community = getCommunity(order.address.communityId);
    const windows = generateWindows(community, todayISO(), bookedIndex(community.id));
    const win = windows.find((w) => w.date === order.deliveryDate && w.window === order.window);
    if (!win || !win.isOpen)
      throw fail(
        409,
        'ORDER_CUTOFF_PASSED',
        'The window for this order has closed — items can’t be added.',
      );

    // Validate every added line against the LIVE catalog + the day's cap (counting what's already
    // booked across all orders for the day, including this one).
    const lineInputs = req.body.items;
    const orderedQty = orderedQtyIndex(order.deliveryDate);
    // What THIS request adds per product, so several lines of the same item are capped together
    // rather than each against the full remainder.
    const adding = new Map();
    for (const l of lineInputs) {
      const p = getProduct(l.productId);
      if (!p || p.isActive === false || (p.availability && p.availability !== 'AVAILABLE'))
        throw fail(409, 'UNAVAILABLE', 'One of those items is no longer available.', {
          productId: l.productId,
        });
      // The same step rule as the basket (setCartItem): 0.001 of a PIECE is not something we sell.
      const qty = Number(l.quantity);
      const inc = Number(p.increment);
      if (inc > 0 && Math.abs(Math.round(qty / inc) * inc - qty) > 1e-6)
        throw fail(422, 'VALIDATION', `Quantity must be in steps of ${p.increment}`, {
          productId: p.id,
        });
      const already = (orderedQty.get(p.id) || 0) + (adding.get(p.id) || 0);
      const left = Math.max(0, Number(p.dailyCap) - already);
      adding.set(p.id, (adding.get(p.id) || 0) + qty);
      if (qty > left)
        throw fail(
          422,
          'CAP_EXCEEDED',
          left > 0
            ? `Only ${left} ${p.unit.toLowerCase()} of ${p.name} left for that day.`
            : `${p.name} is fully booked for that day.`,
          { productId: p.id, remaining: String(left) },
        );
    }

    const proj = projectOrderAddition(order, lineInputs);
    if (proj.added.length === 0 || proj.deltaPaise <= 0)
      throw fail(422, 'NOTHING_TO_ADD', 'Add at least one item.');

    // COD — nothing to collect online; the door amount just grows. Re-check the cash ceiling.
    if (order.paymentMethod === 'COD') {
      const codCfg = constants().cod;
      if (proj.bill.totalPaise > codCfg.maxOrderPaise)
        throw fail(422, 'COD_LIMIT_EXCEEDED', 'That would take this order over the cash limit.', {
          maxOrderPaise: String(codCfg.maxOrderPaise),
        });
      const updated = applyOrderAddition(order.id, lineInputs, { gatewayPaid: 0 });
      emitNotification(cid, {
        type: 'ORDER_UPDATED',
        title: 'Items added',
        body: `${proj.added.length} item(s) added to ${order.orderNumber}.`,
        data: { orderId: order.id, orderNumber: order.orderNumber, action: 'track' },
      });
      return res.json({
        order: linkOrderIssuePhotos(orderCustomer(updated), baseUrlOf(req)),
        addedPaise: String(proj.deltaPaise),
        paymentIntent: null,
      });
    }

    // PREPAID — the delta is paid online; stash the lines and hand back a payment intent for it.
    const pay = createPayment(cid, {
      purpose: 'ORDER_ADDITION',
      orderId: order.id,
      amountPaise: proj.deltaPaise,
    });
    patchOrder(order.id, (ord) => {
      ord.pendingAddition = { paymentId: pay.id, lineInputs };
    });
    let razorpayOrderId = null;
    if (razorpayEnabled) {
      const rz = await createRazorpayOrder({
        amountPaise: proj.deltaPaise,
        receipt: pay.id,
        notes: { purpose: 'ORDER_ADDITION', orderId: order.id, customerId: cid },
      });
      setGatewayOrderId(pay, rz.id);
      razorpayOrderId = rz.id;
    }
    res.json({
      order: linkOrderIssuePhotos(orderCustomer(order), baseUrlOf(req)),
      addedPaise: String(proj.deltaPaise),
      paymentIntent: {
        paymentId: pay.id,
        razorpayOrderId: razorpayEnabled ? razorpayOrderId : null,
        keyId: razorpayKeyId,
        amountPaise: String(proj.deltaPaise),
        description: `Add to ${order.orderNumber}`,
      },
    });
  }),
);

/**
 * The order's invoice as a PDF (base64), built from the order's own stored snapshot. Available once
 * the order is confirmed (an order still awaiting payment has nothing to invoice yet). The app saves
 * the bytes to a file and shares / downloads them.
 */
customerOrdersRouter.get(
  '/:id/invoice',
  asyncHandler(async (req, res) => {
    const o = getOrderForCustomer(req.params.id, req.customerId);
    if (!o) throw fail(404, 'NOT_FOUND', 'Order not found');
    if (o.status === 'PENDING_PAYMENT' || o.status === 'PAYMENT_FAILED')
      throw fail(409, 'NO_INVOICE', 'An invoice is available once the order is confirmed.');
    const pdf = await buildInvoicePdf(o);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoiceNumberOf(o)}.pdf"`);
    res.send(pdf);
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
          order: linkOrderIssuePhotos(orderCustomer(existing), baseUrlOf(req)),
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
      // Confirm to the customer that the request was received (req: cancel after packing).
      const cr = COPY.CANCEL_REQUESTED(updated);
      emitNotification(cid, {
        type: 'CANCEL_REQUESTED',
        title: cr.title,
        body: cr.body,
        data: { orderId: updated.id, orderNumber: updated.orderNumber },
      });
      waCancelRequested(updated, getCustomer(cid));
      return res.json({
        order: linkOrderIssuePhotos(orderCustomer(updated), baseUrlOf(req)),
        cancelled: false,
        requested: true,
      });
    }

    // Everything before the packing bench — cancel outright and refund now.
    const { order: updated } = cancelOrder(req.params.id);
    // What actually gets refunded: any wallet money applied, plus any captured gateway payment.
    // Split the refund by destination: wallet money (walletAppliedPaise) comes back to the wallet
    // instantly; gateway money (a captured Razorpay payment) returns to the bank/UPI it came from.
    // Every captured payment counts — the order's own and any paid for items added later.
    const walletPaise = Number(updated.walletAppliedPaise || 0);
    const bankPaise = refundablePaymentsForOrder(updated.id).reduce(
      (s, p) => s + Number(p.amountPaise || 0),
      0,
    );
    const refundPaise = walletPaise + bankPaise;
    const cc = COPY.ORDER_CANCELLED({ ...updated, refundPaise });
    emitNotification(cid, {
      type: 'ORDER_CANCELLED',
      title: cc.title,
      body: cc.body,
      data: { orderId: updated.id, orderNumber: updated.orderNumber, refundPaise },
    });
    const customerC = getCustomer(cid);
    const refundLine =
      refundPaise > 0
        ? `A refund of ₹${Math.round(refundPaise / 100)} has been initiated.`
        : 'No payment was taken.';
    waOrderCancelled(updated, customerC, refundLine);
    if (refundPaise > 0) {
      const rf = COPY.REFUND_INITIATED(updated, { bankPaise, walletPaise, days: REFUND_DAYS });
      emitNotification(cid, {
        type: 'REFUND_INITIATED',
        title: rf.title,
        body: rf.body,
        data: {
          orderId: updated.id,
          orderNumber: updated.orderNumber,
          refundPaise,
          bankPaise,
          walletPaise,
        },
      });
      // WhatsApp refund message only applies to the bank-bound portion (it speaks of working days);
      // a pure wallet refund is instant and covered by the in-app notification above.
      if (bankPaise > 0)
        waRefundInitiated(updated, customerC, `₹${Math.round(bankPaise / 100)}`, REFUND_DAYS);
    }
    res.json({
      order: linkOrderIssuePhotos(orderCustomer(updated), baseUrlOf(req)),
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
      // Trust the bytes, not the label: the declared type must match the file's signature.
      assertRealImage(buffer, p.contentType);
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
      order: linkOrderIssuePhotos(
        orderCustomer(getOrderForCustomer(order.id, cid)),
        baseUrlOf(req),
      ),
    });
  }),
);

// ── reviews ─────────────────────────────────────────────────────────────────
// A rating (1–5) and an optional word on a DELIVERED order, editable for 14 days. The team can
// reply from the admin Feedback page; the reply shows here.
const REVIEW_EDIT_DAYS = 14;
const REVIEW_TAGS = [
  'Fresh',
  'On time',
  'Well packed',
  'Good value',
  'Not fresh',
  'Late',
  'Missing item',
  'Damaged',
];
const reviewOut = (r) =>
  r
    ? {
        rating: r.rating,
        comment: r.comment || null,
        tags: r.tags || [],
        at: r.at,
        reply: r.reply || null,
        repliedAt: r.repliedAt || null,
      }
    : null;

customerOrdersRouter.get(
  '/:id/review',
  asyncHandler(async (req, res) => {
    const o = getOrderForCustomer(req.params.id, req.customerId);
    if (!o) throw fail(404, 'NOT_FOUND', 'Order not found');
    res.json({
      review: reviewOut(getOps('review', o.id)),
      canReview: o.status === 'DELIVERED',
      tags: REVIEW_TAGS,
    });
  }),
);

customerOrdersRouter.put(
  '/:id/review',
  validateBody(
    z.object({
      rating: z.number().int().min(1).max(5),
      comment: z.string().trim().max(500).optional().nullable(),
      tags: z
        .array(z.enum(/** @type {[string, ...string[]]} */ (REVIEW_TAGS)))
        .max(8)
        .optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const o = getOrderForCustomer(req.params.id, req.customerId);
    if (!o) throw fail(404, 'NOT_FOUND', 'Order not found');
    if (o.status !== 'DELIVERED')
      throw fail(409, 'NOT_DELIVERED', 'You can rate an order once it has been delivered.');
    const cur = getOps('review', o.id);
    if (cur && Date.now() - Date.parse(cur.at) > REVIEW_EDIT_DAYS * 864e5)
      throw fail(409, 'LOCKED', 'This review can no longer be changed.');
    try {
      const saved = await putOps('review', o.id, {
        ...(cur || {}),
        orderNumber: o.orderNumber,
        customerId: req.customerId,
        rating: req.body.rating,
        comment: req.body.comment || null,
        tags: req.body.tags || [],
        at: cur?.at || new Date().toISOString(),
        editedAt: cur ? new Date().toISOString() : null,
      });
      res.json({ review: reviewOut(saved) });
    } catch (e) {
      if (e?.code === 'SETUP_NEEDED')
        throw fail(
          503,
          'UNAVAILABLE',
          'Ratings aren’t available just yet. Please try again later.',
        );
      throw e;
    }
  }),
);
