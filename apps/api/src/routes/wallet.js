/**
 * Wallet + payments (contract, authenticated). Top-up creates a payment intent; /payments/verify is
 * advisory in production (the webhook is the source of truth) but here it also plays the webhook so
 * the flow completes: it captures the payment, credits a top-up, or confirms an order.
 */
import { Router } from 'express';
import { z } from 'zod';
import { IS_PROD } from '../lib/env.js';
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
  paymentByRazorpayPaymentId,
  flushWallet,
} from '../customer-store.js';
import { refundOrderWallet } from '../lib/order-lifecycle.js';
import { capturePayment } from '../lib/capture.js';
import {
  createRazorpayOrder,
  fetchRazorpayPayment,
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
    //
    // Gating on `razorpayEnabled` made verification conditional on OUR OWN CONFIGURATION. If the
    // key is unset, blank, or fails the rzp_ shape test, the whole branch is skipped, no gateway
    // order is ever created, and `{paymentId, success:true}` captures the order with no money
    // moving. One truncated paste in the Render dashboard turns a payment system into a mock, and
    // nothing fails loudly. So in production this is an ASSERTION, not a condition.
    if (IS_PROD && !razorpayEnabled)
      throw fail(
        503,
        'PAYMENT_UNAVAILABLE',
        'Payments are not available right now. Nothing has been charged.',
      );
    // With the gateway live, every payment has a gateway order. One without is either a mock that
    // escaped into production or a forged id, and neither may be captured.
    if (razorpayEnabled && !pay.razorpayOrderId)
      throw fail(409, 'NO_GATEWAY_ORDER', 'This payment was never started with the gateway.');
    if (razorpayEnabled) {
      // The signature is checked against OUR stored order id, never one the caller supplies.
      //
      // A Razorpay signature is an HMAC over `order_id|payment_id`. It proves that pair was really
      // paid on this merchant account — it says nothing about WHICH of our payment intents is being
      // settled. Taking the order id from the request let the caller choose what the signature was
      // compared against, so a genuine ₹100 receipt could be presented to settle a ₹5,000 top-up:
      // start a large intent, pay a small one, then post the small one's valid triple against the
      // large one's paymentId. Every check passed, because every check was true — of the other
      // payment. Binding to pay.razorpayOrderId is what ties the proof to this intent.
      const ok = verifyRazorpaySignature({
        orderId: pay.razorpayOrderId,
        paymentId: razorpayPaymentId,
        signature: req.body.razorpaySignature,
      });
      if (!ok) throw fail(400, 'SIGNATURE_INVALID', 'Payment could not be verified.');

      // And a receipt may only ever be spent once. Binding above stops the substitution; this stops
      // the same genuine triple being replayed against a fresh intent of the same amount.
      const already = paymentByRazorpayPaymentId(razorpayPaymentId, pay.id);
      if (already)
        throw fail(409, 'PAYMENT_ALREADY_USED', 'That payment has already been applied.');
    }

    // Ask the gateway what it actually took, rather than inferring it from a signature.
    //
    // The signature proves authenticity, not value — it carries no amount at all. So the amount
    // guard in capturePayment was dead on this path, and the client leg is the one that almost
    // always wins the race to capture, which meant a partial capture confirmed the order in full.
    // Re-fetching server-side is the same thing Stripe prescribes for this exact shape: trust the
    // gateway's record, never the browser's.
    let gateway = null;
    if (razorpayEnabled) {
      gateway = await fetchRazorpayPayment(razorpayPaymentId);
      // The gateway being unreachable is not proof of payment. Leave the order pending and let the
      // webhook or the reconciliation sweep settle it — both are idempotent, so nothing is lost.
      if (!gateway)
        throw fail(
          503,
          'VERIFY_UNAVAILABLE',
          'We could not confirm that payment yet. If money has left your account it will be applied shortly.',
        );
      // A signature is valid for ITS order. Confirm the gateway agrees this payment belongs to the
      // intent we are settling — belt and braces alongside the signature binding above.
      if (gateway.order_id && gateway.order_id !== pay.razorpayOrderId)
        throw fail(409, 'PAYMENT_MISMATCH', 'That payment belongs to a different order.');
    }

    // Shared with the Razorpay webhook so the two can never disagree about what a capture means;
    // whichever arrives second is a no-op. See lib/capture.js.
    const r = await capturePayment({
      paymentId,
      razorpayPaymentId,
      source: 'client',
      amountPaise: gateway?.amount,
      currency: gateway?.currency,
    });
    // Do not tell the customer their money arrived until the row that proves it is on disk.
    // Everything else here is write-behind on purpose; a wallet credit is not everything else.
    await flushWallet(cid);
    if (r.outcome === 'mismatch')
      throw fail(409, 'AMOUNT_MISMATCH', 'The amount paid does not match this order.', {
        expectedPaise: r.expectedPaise,
        gotPaise: r.gotPaise,
      });
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
