/**
 * Payment options the operator controls.
 *   GET   /admin/payment-settings   cash-on-delivery + delivery-OTP configuration
 *   PATCH /admin/payment-settings   turn them on or off, set the cash cap
 *   GET   /admin/payments-status    what the gateway is actually configured with, right now
 *
 * Cash on delivery is off until someone deliberately turns it on: an unpaid order costs a real
 * packed bag if nobody answers the door, so it is a business decision rather than a default.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http.js';
import { validateBody } from '../../validate.js';
import { getPaymentSettings, updatePaymentSettings } from '../../store.js';
import { razorpayEnabled, razorpayKeyId, webhookEnabled } from '../../lib/razorpay.js';

export const adminPaymentsRouter = Router();

adminPaymentsRouter.get(
  '/payment-settings',
  asyncHandler(async (_req, res) => res.json({ settings: getPaymentSettings() })),
);

/**
 * What this PROCESS believes about the gateway — names and booleans only, never a secret.
 *
 * It exists because "I set the environment variable" and "the running server can see it" are
 * different claims, and the only way to tell them apart was to fire a webhook at production and
 * read the error. Both flags are captured when the module loads, so this also answers the follow-up
 * question: whether the service has actually restarted since the variable was added.
 */
adminPaymentsRouter.get(
  '/payments-status',
  asyncHandler(async (_req, res) =>
    res.json({
      razorpay: {
        // Safe to show: the key id ships inside the mobile app. The SECRET never leaves the server.
        keyId: razorpayKeyId || null,
        enabled: razorpayEnabled,
        webhookConfigured: webhookEnabled,
      },
      blockers: [
        ...(razorpayEnabled ? [] : ['RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not both set']),
        ...(webhookEnabled
          ? []
          : [
              'RAZORPAY_WEBHOOK_SECRET is not set in THIS process — the webhook refuses every call with 503. If you have just added it, the service has not restarted yet.',
            ]),
      ],
    }),
  ),
);

adminPaymentsRouter.patch(
  '/payment-settings',
  validateBody(
    z.object({
      codEnabled: z.boolean().optional(),
      // A cap keeps a large amount of cash off a rider's person. 0 means "no cash orders at all",
      // which is deliberately distinct from switching the feature off.
      codMaxOrderPaise: z.number().int().min(0).max(10000000).optional(),
      deliveryOtpEnabled: z.boolean().optional(),
    }),
  ),
  asyncHandler(async (req, res) => res.json({ settings: updatePaymentSettings(req.body) })),
);

/**
 * GET /admin/payment-exceptions — where money and order state disagree.
 *
 * Every divergence used to be discoverable only by reading Render's logs, which are ephemeral on
 * the free plan. These are the ones the reconciler could not resolve on its own.
 */
adminPaymentsRouter.get(
  '/payment-exceptions',
  asyncHandler(async (_req, res) => {
    const { listReconcileExceptions, reconcileOnce } = await import('../../lib/reconcile.js');
    res.json({ exceptions: listReconcileExceptions(), lastPass: await reconcileOnce() });
  }),
);

/**
 * GET /admin/sentry-test — throw on purpose.
 *
 * An error tracker nobody has watched fire is a hypothesis, the same as an untested backup. This
 * exists so the whole path can be proved once: throw here, see it in Sentry within a minute,
 * tagged service:api, with a stack trace that points at this file.
 *
 * Deliberately a GET so it can be triggered from a browser, and deliberately behind the admin
 * gate so it is not a free way for anyone to fill the quota.
 */
adminPaymentsRouter.get(
  '/sentry-test',
  asyncHandler(async () => {
    throw new Error('Sentry test error — thrown on purpose from /admin/sentry-test');
  }),
);
