/**
 * Profile + addresses (contract, authenticated). GET/PATCH /me, list/add addresses, set default.
 */
import { Router } from 'express';
import { track } from '../lib/events.js';
import {
  GRACE_DAYS,
  ordersBlockingDeletion,
  requestDeletion,
  scheduledDeletion,
} from '../lib/account-deletion.js';
import { z } from 'zod';
import { asyncHandler, fail } from '../http.js';
import { validateBody } from '../validate.js';
import { personName, email, flat, floor, shortText, mobile } from '../lib/validators.js';
import { customerPublic } from '../serialize.js';
import { money } from '../lib/money.js';
import { ipOf, rateLimit } from '../lib/rate-limit.js';
import { findStaffByMobile } from '../access-store.js';
import { recordAction } from '../lib/audit.js';
import { NOTICE_VERSION, consentOf, consentRequired, recordConsent } from '../lib/consent.js';
import { logSecurityEvent } from '../lib/security-log.js';
import {
  addAddress,
  cartCount,
  changeCustomerMobile,
  checkOtpOnly,
  defaultAddress,
  deleteAddress,
  getCustomer,
  getCustomerIdByMobile,
  getWallet,
  hasAddress,
  listAddresses,
  requestOtp,
  setDefaultAddress,
  updateAddress,
  updateCustomer,
} from '../customer-store.js';

// Review #23 (21 Nov 2026): the change-number and deletion codes had only the global per-IP limit,
// so they could be guessed far faster than the sign-in code. Limits per ACCOUNT (an attacker holds
// one) and per IP; the per-number wrong-guess cap in customer-store applies on top of both.
const codeChecksPerAccount = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  key: (req) => `mecode:c:${req.customerId}`,
  code: 'OTP_RATE_LIMITED',
  message: 'Too many attempts. Please wait a few minutes.',
});
const codeChecksPerIp = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 90,
  key: (req) => `mecode:ip:${ipOf(req)}`,
  code: 'OTP_RATE_LIMITED',
  message: 'Too many attempts. Please wait a few minutes.',
});
const numberChangeRequests = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 5,
  key: (req) => `mobchange:c:${req.customerId}`,
  code: 'OTP_RATE_LIMITED',
  message: 'Too many number changes today. Please try again tomorrow.',
});

/** A number that belongs to a staff member cannot be moved onto a customer account from the app. */
const isStaffNumber = (m) => !!findStaffByMobile(m);

export const meRouter = Router();

meRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const cid = req.customerId;
    res.json({
      customer: customerPublic(getCustomer(cid), { hasAddress: hasAddress(cid) }),
      walletBalancePaise: money(getWallet(cid).balancePaise),
      defaultAddress: defaultAddress(cid),
      cartCount: cartCount(cid),
    });
  }),
);

meRouter.patch(
  '/',
  validateBody(
    z.object({
      name: personName.optional(),
      email: email.nullable().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const c = updateCustomer(req.customerId, req.body);
    res.json({ customer: customerPublic(c, { hasAddress: hasAddress(req.customerId) }) });
  }),
);

/**
 * Delete (erase) the signed-in customer's account. Required by Google Play / App Store and by the
 * DPDP Act's right to erasure. Anonymises PII and revokes every session; order/payment records are
 * retained (de-identified) for tax/legal retention. `walletBalancePaise` is returned so the client
 * can warn when a balance would be left behind — refunding it is an operations decision.
 */
/**
 * Delete my account — with a 60-day grace period (lib/account-deletion.js).
 *
 *   GET    /me/deletion           can I delete now? (orders still in progress), and any schedule
 *   POST   /me/deletion/request   send a confirmation code to the account's own number
 *   POST   /me/deletion/confirm   check the code, then schedule deletion and sign out everywhere
 *   DELETE /me                    older app versions: schedules the same way (they have no code step)
 *
 * Refused while an order is still in progress: a cash order cannot be completed without the code
 * only this customer can read out at the door, and a prepaid one is still owed its delivery.
 */
function blockersOf(cid) {
  return ordersBlockingDeletion(cid).map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    deliveryDate: o.deliveryDate || null,
    cashDue: o.paymentMethod === 'COD',
  }));
}
const blockedError = (blockers) =>
  fail(
    409,
    'ORDERS_IN_PROGRESS',
    blockers.length === 1
      ? `Order ${blockers[0].orderNumber} is still in progress. You can delete your account once it is delivered (or cancelled).`
      : `${blockers.length} of your orders are still in progress. You can delete your account once they are delivered (or cancelled).`,
    { orders: blockers },
  );

meRouter.get(
  '/deletion',
  asyncHandler(async (req, res) => {
    const blockers = blockersOf(req.customerId);
    res.json({
      graceDays: GRACE_DAYS,
      canDelete: blockers.length === 0,
      ordersInProgress: blockers,
      walletBalancePaise: String(getWallet(req.customerId).balancePaise || 0),
      scheduled: scheduledDeletion(req.customerId),
    });
  }),
);

meRouter.post(
  '/deletion/request',
  asyncHandler(async (req, res) => {
    const blockers = blockersOf(req.customerId);
    if (blockers.length) throw blockedError(blockers);
    const c = getCustomer(req.customerId);
    if (!c) throw fail(404, 'NOT_FOUND', 'Account not found.');
    const r = await requestOtp(c.mobile);
    if (r.error) throw fail(r.error.status, r.error.code, r.error.message);
    res.json({
      ok: true,
      expiresInSeconds: r.expiresInSeconds,
      ...(r.devOtp ? { devOtp: r.devOtp } : {}),
    });
  }),
);

meRouter.post(
  '/deletion/confirm',
  codeChecksPerAccount,
  codeChecksPerIp,
  validateBody(
    z.object({
      otp: z.string().regex(/^\d{4,8}$/, 'Enter the code we sent.'),
      // The box the customer ticks: "I have read what is deleted and what is kept, and I agree".
      // Optional only so an app that has not taken the update yet still works; it is recorded
      // either way, and the current app will not send the code without it.
      consent: z
        .object({
          accepted: z.literal(true),
          version: z.string().trim().min(1).max(40),
          platform: z.enum(['ios', 'android', 'web']).optional(),
          appVersion: z.string().max(40).optional(),
        })
        .optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const c = getCustomer(req.customerId);
    if (!c) throw fail(404, 'NOT_FOUND', 'Account not found.');
    const chk = checkOtpOnly(c.mobile, req.body.otp);
    if (chk.error) throw fail(chk.error.status, chk.error.code, chk.error.message);
    // Re-checked at the moment of commitment — an order could have been placed in between.
    const blockers = blockersOf(req.customerId);
    if (blockers.length) throw blockedError(blockers);
    const r = await requestDeletion(req.customerId, {
      walletBalancePaise: getWallet(req.customerId).balancePaise || 0,
      consent: req.body.consent || null,
      via: 'APP_WITH_CODE',
    });
    logSecurityEvent('DELETION_REQUESTED', { req, customerId: req.customerId });
    res.json({
      ok: true,
      graceDays: GRACE_DAYS,
      scheduled: r.scheduled,
      deleteAfter: r.scheduled ? r.deleteAfter : null,
      deletedNow: !!r.deletedNow,
      walletBalancePaise: String(r.walletBalancePaise || 0),
    });
  }),
);

// Security pentest 21 Nov 2026 (A45): this old code-free path scheduled deletion (and, with no ops
// table, erased at once) and signed the owner out everywhere on a bare access token — a stolen token
// was enough. The current app uses /deletion/request + /deletion/confirm (code to the account's own
// number), so this path now refuses and tells an outdated app to update. With it gone, the only
// customer-reachable way into requestDeletion() — including its "erase immediately" branch — is
// /deletion/confirm, which checks the code first. (The admin route is staff-only.)
meRouter.delete(
  '/',
  asyncHandler(async () => {
    throw fail(
      426,
      'USE_DELETION_CONFIRM',
      'Please update the Fooducia app to delete your account. You will be asked to confirm with a code we send to your number.',
    );
  }),
);

/**
 * Change the mobile number on THIS account, proven by an OTP to the new number.
 *
 * Before this there was no such route: the app's "change number" simply signed you out, so you came
 * back through the normal sign-in as a brand-new customer and were asked for your community and
 * address again, with your orders and wallet left behind on the old account.
 *
 * Two steps, both authenticated, so the person changing the number is already holding the account:
 *   POST /me/mobile/request  — send a code to the new number
 *   POST /me/mobile/verify   — check it, then move the account
 * The customer id never changes, so addresses, orders, wallet and existing sessions all follow.
 */

meRouter.post(
  '/mobile/request',
  numberChangeRequests,
  validateBody(z.object({ mobile })),
  asyncHandler(async (req, res) => {
    const next = req.body.mobile;
    const me = getCustomer(req.customerId);
    if (me?.mobile === next) throw fail(422, 'SAME_MOBILE', 'That is already your number.');
    // Review #27: answering "that number is already signed up" here told any signed-in user whether a
    // number belongs to a Fooducia customer. A number that cannot be taken (another account's, or a
    // staff number) now gets the same reply as any other — but no code is sent to it, so its owner is
    // not disturbed and the verify step below can only fail.
    const holder = getCustomerIdByMobile(next);
    if ((holder && holder !== req.customerId) || isStaffNumber(next)) {
      res.json({ ok: true, expiresInSeconds: 300 });
      return;
    }
    const r = await requestOtp(next);
    if (r.error) throw fail(r.error.status, r.error.code, r.error.message);
    res.json({ ok: true, expiresInSeconds: r.expiresInSeconds });
  }),
);

meRouter.post(
  '/mobile/verify',
  codeChecksPerAccount,
  codeChecksPerIp,
  validateBody(z.object({ mobile, otp: z.string().regex(/^\d{6}$/) })),
  asyncHandler(async (req, res) => {
    const { mobile: next, otp } = req.body;
    // Staff are recognised by their phone number. Moving a customer account onto a staff number
    // would hand that account the staff role (review #23), so it is refused outright.
    if (isStaffNumber(next))
      throw fail(401, 'OTP_INVALID', 'That code has expired. Request a new one.');
    // checkOtpOnly, not verifyOtp: the latter would mint a second account for the new number.
    const check = checkOtpOnly(next, otp);
    if (check.error) throw fail(check.error.status, check.error.code, check.error.message);
    const before = getCustomer(req.customerId)?.mobile || null;
    const moved = changeCustomerMobile(req.customerId, next);
    if (moved.error) throw fail(moved.error.status, moved.error.code, moved.error.message);
    logSecurityEvent('MOBILE_CHANGED', {
      req,
      customerId: req.customerId,
      mobile: next,
      details: { from: maskMobile(before) },
    });
    // Every number change leaves a row in the audit trail — it is how an account is taken over.
    recordAction({
      staff: { email: `customer:${req.customerId}`, role: 'CUSTOMER', via: 'app' },
      action: 'CUSTOMER_MOBILE_CHANGED',
      target: req.customerId,
      details: { from: maskMobile(before), to: maskMobile(next) },
    }).catch((e) => console.error('[audit] mobile change not recorded:', e?.message || e));
    res.json({
      customer: customerPublic(moved.customer, { hasAddress: hasAddress(req.customerId) }),
    });
  }),
);

export const addressesRouter = Router();

addressesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ addresses: listAddresses(req.customerId) });
  }),
);

const AddressBody = z.object({
  communityId: z.string().min(1).max(60).optional(),
  block: z.string().trim().min(1).max(40),
  flat,
  floor: floor.nullable().optional(),
  landmark: shortText(80).nullable().optional(),
  recipientName: personName.optional(),
  contactNumber: mobile.optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  isDefault: z.boolean().optional(),
});
addressesRouter.post(
  '/',
  validateBody(AddressBody),
  asyncHandler(async (req, res) => {
    const r = addAddress(req.customerId, req.body);
    if (r.error) throw fail(r.error.status, r.error.code, r.error.message);
    track(
      'community_selected',
      {
        community: r.address.communityName || r.address.communityId,
        community_id: r.address.communityId,
        tower: r.address.block,
      },
      { customerId: req.customerId },
    );
    res.status(201).json({ address: r.address });
  }),
);

addressesRouter.post(
  '/:id/default',
  asyncHandler(async (req, res) => {
    const list = setDefaultAddress(req.customerId, req.params.id);
    if (!list) throw fail(404, 'NOT_FOUND', 'That address is not on your account.');
    res.json({ addresses: list });
  }),
);

// An edit sends only what changed. Community and block travel together from the app (a block only
// means something inside its community), but each is optional here so a caller correcting just a
// landmark does not have to restate the rest. `lat`/`lng`/`isDefault` are deliberately absent: the
// default has its own endpoint, and an edit is not a serviceability check.
const AddressPatch = z
  .object({
    communityId: z.string().min(1).max(60),
    block: z.string().trim().min(1).max(40),
    flat,
    floor: floor.nullable(),
    landmark: shortText(80).nullable(),
    recipientName: personName,
    contactNumber: mobile,
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change.' });

addressesRouter.patch(
  '/:id',
  validateBody(AddressPatch),
  asyncHandler(async (req, res) => {
    const r = updateAddress(req.customerId, req.params.id, req.body);
    if (r.error) throw fail(r.error.status, r.error.code, r.error.message);
    if (req.body.communityId || req.body.block)
      track(
        'community_selected',
        {
          community: r.address.communityName || r.address.communityId,
          community_id: r.address.communityId,
          tower: r.address.block,
        },
        { customerId: req.customerId },
      );
    res.json({ address: r.address, addresses: r.addresses });
  }),
);

addressesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const r = deleteAddress(req.customerId, req.params.id);
    if (r.error) throw fail(r.error.status, r.error.code, r.error.message);
    res.json({ addresses: r.addresses });
  }),
);

/** 9876543210 -> 98xxxxxx10: enough to tell numbers apart in an audit row, not enough to call. */
function maskMobile(m) {
  const d = String(m || '');
  return d.length >= 6 ? `${d.slice(0, 2)}${'x'.repeat(d.length - 4)}${d.slice(-2)}` : null;
}

/**
 * The privacy notice and the 18+ confirmation (DPDP §5, §6, §9; Rules 3 and 10).
 *   GET  /me/consent  — does this account still have to agree to the current notice?
 *   POST /me/consent  — { version, adult: true }: the one-time prompt shown to customers who signed
 *                       up before the consent boxes existed, or after the notice changes.
 */
meRouter.get('/consent', (req, res) => {
  const c = consentOf(req.customerId);
  res.json({
    required: consentRequired(req.customerId),
    version: NOTICE_VERSION,
    accepted: c ? { version: c.version, adult: c.adult, at: c.at } : null,
  });
});

meRouter.post(
  '/consent',
  validateBody(z.object({ version: z.string().max(60), adult: z.boolean() })),
  asyncHandler(async (req, res) => {
    let r;
    try {
      r = await recordConsent(req.customerId, { ...req.body, via: 'prompt' });
    } catch {
      throw fail(503, 'TRY_AGAIN', 'Could not save that just now. Please try again.');
    }
    if ('error' in r) throw fail(r.error.status, r.error.code, r.error.message);
    logSecurityEvent('CONSENT_GIVEN', {
      req,
      customerId: req.customerId,
      details: { via: 'prompt' },
    });
    res.json({ ok: true, required: false, version: NOTICE_VERSION });
  }),
);
