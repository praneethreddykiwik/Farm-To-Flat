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
} from '../customer-store.js';

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
    res.status(201).json({
      paymentIntent: {
        paymentId: pay.id,
        razorpayOrderId: pay.razorpayOrderId,
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
      if (pay.purpose === 'ORDER') {
        const o = getOrder(pay.orderId);
        if (o && o.status === 'PENDING_PAYMENT') {
          patchOrder(pay.orderId, (ord) => {
            ord.status = 'PAYMENT_FAILED';
            ord.timeline.push({ status: 'PAYMENT_FAILED', at: new Date().toISOString() });
          });
          if (o.walletAppliedPaise > 0)
            ledgerPush(
              cid,
              'CREDIT',
              o.walletAppliedPaise,
              'REFUND',
              o.orderNumber,
              'Payment abandoned, wallet returned',
            );
          if (o.couponCode) releaseCoupon(cid, o.couponCode);
        }
      }
      return res.json({ status: 'FAILED' });
    }

    pay.status = 'CAPTURED';
    pay.razorpayPaymentId = razorpayPaymentId || `pay_rzp_${Date.now()}`;
    if (pay.purpose === 'TOPUP') {
      ledgerPush(cid, 'CREDIT', pay.amountPaise, 'TOPUP', pay.razorpayPaymentId, 'Wallet top-up');
      return res.json({
        status: 'CAPTURED',
        walletBalancePaise: money(getWallet(cid).balancePaise),
      });
    }
    const updated = patchOrder(pay.orderId, (ord) => {
      if (ord.status === 'PENDING_PAYMENT') {
        ord.status = 'CONFIRMED';
        ord.timeline.push({ status: 'CONFIRMED', at: new Date().toISOString() });
      }
    });
    res.json({ status: 'CAPTURED', order: updated ? orderCustomer(updated) : null });
  }),
);
