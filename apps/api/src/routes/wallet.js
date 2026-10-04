/**
 * Wallet + payments (contract, authenticated). Top-up creates a payment intent; /payments/verify is
 * advisory in production (the webhook is the source of truth) but here it also plays the webhook so
 * the flow completes: it captures the payment, credits a top-up, or confirms an order.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../http.js';
import { validateBody } from '../validate.js';
import { orderCustomer } from '../serialize.js';
import { money } from '../lib/money.js';
import { constants, getOrder, patchOrder } from '../store.js';
import {
  createPayment,
  getPayment,
  getWallet,
  ledgerPush,
  releaseCoupon,
  savePayment,
  restoreCartFromOrder,
} from '../customer-store.js';
import { refundOrderWallet } from '../lib/order-lifecycle.js';
import { capturePayment } from '../lib/capture.js';
import {
  createRazorpayOrder,
  razorpayEnabled,
  razorpayKeyId,
  verifyRazorpaySignature,
} from '../lib/razorpay.js';

export const walletRouter = Router();

walletRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const w = getWallet(req.customerId);
    res.json({
      balancePaise: money(w.balancePaise),
      ledger: w.ledger,
      nextCursor: null,
      denominationsPaise: constants().topupDenominationsPaise.map(money),
    });
  }),
);

walletRouter.post(
  '/topup',
  validateBody(z.object({ amountPaise: z.union([z.number(), z.string()]) })),
  asyncHandler(async (req, res) => {
    const amount = Number(req.body.amountPaise);
    if (!constants().topupDenominationsPaise.includes(amount))
      throw fail(422, 'VALIDATION', 'Choose one of the top-up amounts.');
    const pay = createPayment(req.customerId, { purpose: 'TOPUP', amountPaise: amount });
    // Create a REAL Razorpay order so the app's checkout has a valid order to pay against.
    if (razorpayEnabled) {
      const order = await createRazorpayOrder({
        amountPaise: amount,
        receipt: pay.id,
        notes: { purpose: 'TOPUP', customerId: req.customerId },
      });
      pay.razorpayOrderId = order.id;
    }
    res.status(201).json({
      paymentIntent: {
        paymentId: pay.id,
        // Same as orders: never hand out createPayment's placeholder id as if it were a real
        // gateway order — the app would open Razorpay against an order that does not exist.
        razorpayOrderId: razorpayEnabled ? pay.razorpayOrderId : null,
        keyId: razorpayKeyId,
        amountPaise: money(amount),
        description: 'Wallet top-up',
      },
    });
  }),
);

export const paymentsRouter = Router();

paymentsRouter.post(
  '/verify',
  validateBody(
    z.object({
      paymentId: z.string().min(1),
      razorpayPaymentId: z.string().optional(),
      razorpayOrderId: z.string().optional(),
      razorpaySignature: z.string().optional(),
      success: z.boolean().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const cid = req.customerId;
    const { paymentId, razorpayPaymentId, success } = req.body;
    const pay = getPayment(paymentId);
    if (!pay || pay.customerId !== cid) throw fail(404, 'NOT_FOUND', 'Payment not found');
    if (pay.status === 'CAPTURED') return res.json({ status: 'CAPTURED', duplicate: true });

    if (success === false) {
      pay.status = 'FAILED';
      savePayment(pay);
      if (pay.purpose === 'ORDER') {
        const o = getOrder(pay.orderId);
        if (o && o.status === 'PENDING_PAYMENT') {
          patchOrder(pay.orderId, (ord) => {
            ord.status = 'PAYMENT_FAILED';
            ord.timeline.push({ status: 'PAYMENT_FAILED', at: new Date().toISOString() });
          });
          // Idempotent: only the not-yet-returned wallet portion is credited.
          refundOrderWallet(o, 'Payment abandoned, wallet returned');
          if (o.couponCode) releaseCoupon(cid, o.couponCode);
          // Give the basket back, so "try again" does not mean "pick it all out again".
          restoreCartFromOrder(cid, o);
        }
      }
      return res.json({ status: 'FAILED' });
    }

    // With real Razorpay, the checkout returns a signature we MUST verify with the key secret before
    // capturing — never trust the client's "success" alone. (Production also confirms via webhook.)
    // Gate on the PAYMENT, not on what the caller chose to send. Keying this off
    // `razorpayPaymentId || razorpaySignature` meant a request carrying neither — just
    // `{ paymentId, success: true }` — skipped verification completely and captured the order
    // without a rupee moving. Once the gateway has issued an order id, a signature is mandatory.
    if (razorpayEnabled && pay.razorpayOrderId) {
      const ok = verifyRazorpaySignature({
        orderId: req.body.razorpayOrderId || pay.razorpayOrderId,
        paymentId: razorpayPaymentId,
        signature: req.body.razorpaySignature,
      });
      if (!ok) throw fail(400, 'SIGNATURE_INVALID', 'Payment could not be verified.');
    }

    // Shared with the Razorpay webhook so the two can never disagree about what a capture means;
    // whichever arrives second is a no-op. See lib/capture.js.
    const r = await capturePayment({ paymentId, razorpayPaymentId, source: 'client' });
    if (r.outcome === 'already') return res.json({ status: 'CAPTURED', duplicate: true });
    if (pay.purpose === 'TOPUP')
      return res.json({
        status: 'CAPTURED',
        walletBalancePaise: money(getWallet(cid).balancePaise),
      });
    if (r.outcome === 'orphaned')
      return res.json({
        status: 'CAPTURED',
        orphaned: true,
        order: orderCustomer(r.order),
        walletBalancePaise: money(getWallet(cid).balancePaise),
      });
    res.json({ status: 'CAPTURED', order: r.order ? orderCustomer(r.order) : null });
  }),
);
