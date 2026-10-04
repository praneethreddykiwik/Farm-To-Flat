/**
 * Razorpay's server-to-server callback — the only confirmation that does not depend on the
 * customer's phone still being awake.
 *
 * WHY THIS EXISTS: until now the ONLY thing that moved an order out of PENDING_PAYMENT was the app
 * calling /payments/verify after the checkout sheet closed. Kill the app, lose signal, or lock the
 * phone in that window and Razorpay has the money while the order sits unpaid until the sweeper
 * cancels it. Several comments in this codebase already claimed "the webhook is the source of
 * truth"; it did not exist. This is it.
 *
 * THREE THINGS MAKE IT SAFE:
 *   1. It is mounted BEFORE express.json() and parses with express.raw, because the signature is an
 *      HMAC over the exact bytes Razorpay sent. Re-serialising parsed JSON reorders keys and loses
 *      whitespace, so every genuine callback would fail to verify.
 *   2. It is NOT behind requireAuth — Razorpay has no bearer token. The signature IS the
 *      authentication, and without RAZORPAY_WEBHOOK_SECRET set the endpoint refuses everything
 *      rather than trusting an unverified caller.
 *   3. It is idempotent. Razorpay retries until it gets a 2xx, so the same event arrives many times;
 *      capture is a no-op once the payment is CAPTURED.
 *
 * It always answers 2xx once the signature checks out, even if our own bookkeeping then fails.
 * A non-2xx makes Razorpay retry the same event for hours, which turns one bad row into a storm.
 */
import express from 'express';
import { verifyWebhookSignature, webhookEnabled } from '../lib/razorpay.js';
import { capturePayment } from '../lib/capture.js';

export const razorpayWebhookRouter = express.Router();

razorpayWebhookRouter.post(
  '/razorpay',
  express.raw({ type: '*/*', limit: '1mb' }),
  async (req, res) => {
    if (!webhookEnabled) {
      // eslint-disable-next-line no-console
      console.error(
        '[webhook] RAZORPAY_WEBHOOK_SECRET is not set — refusing an unverifiable call.',
      );
      return res.status(503).json({
        error: { code: 'WEBHOOK_NOT_CONFIGURED', message: 'Webhook secret is not configured.' },
      });
    }
    const signature = req.header('x-razorpay-signature');
    if (!verifyWebhookSignature(req.body, signature)) {
      // eslint-disable-next-line no-console
      console.warn('[webhook] rejected a call with a bad or missing signature.');
      return res
        .status(401)
        .json({ error: { code: 'SIGNATURE_INVALID', message: 'Signature does not match.' } });
    }

    let event = {};
    try {
      event = JSON.parse(Buffer.from(req.body).toString('utf8'));
    } catch {
      return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Unparseable body.' } });
    }

    const kind = event?.event;
    const entity = event?.payload?.payment?.entity || null;
    try {
      if (kind === 'payment.captured' && entity) {
        const r = await capturePayment({
          razorpayOrderId: entity.order_id,
          razorpayPaymentId: entity.id,
          source: 'webhook',
        });
        // eslint-disable-next-line no-console
        console.error(`[webhook] payment.captured ${entity.id} -> ${r.outcome}`);
      } else if (kind === 'payment.failed' && entity) {
        // eslint-disable-next-line no-console
        console.error(
          `[webhook] payment.failed ${entity.id} (${entity.error_description || 'no reason given'}) — leaving the order alone; the sweeper releases it.`,
        );
      }
    } catch (e) {
      // Swallow deliberately: see the 2xx note at the top. The log is how an operator finds this.
      // eslint-disable-next-line no-console
      console.error(`[webhook] ${kind} handling failed: ${e?.message || e}`);
    }
    return res.json({ ok: true });
  },
);
