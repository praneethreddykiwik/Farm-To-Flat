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

meRouter.delete(
  '/',
  asyncHandler(async (req, res) => {
    // The app version already on phones calls this with no code step. Same rules, same 60 days.
    const blockers = blockersOf(req.customerId);
    if (blockers.length) throw blockedError(blockers);
    if (!getCustomer(req.customerId)) throw fail(404, 'NOT_FOUND', 'Account not found.');
    const r = await requestDeletion(req.customerId, {
      walletBalancePaise: getWallet(req.customerId).balancePaise || 0,
      via: 'APP_OLD_VERSION',
    });
    res.json({
      ok: true,
      scheduled: r.scheduled,
      deleteAfter: r.scheduled ? r.deleteAfter : null,
      walletBalancePaise: String(r.walletBalancePaise || 0),
    });
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
  validateBody(z.object({ mobile })),
  asyncHandler(async (req, res) => {
    const next = req.body.mobile;
    const me = getCustomer(req.customerId);
    if (me?.mobile === next) throw fail(422, 'SAME_MOBILE', 'That is already your number.');
    // Refuse early, before sending a code we would only reject at the last step.
    const holder = getCustomerIdByMobile(next);
    if (holder && holder !== req.customerId)
      throw fail(409, 'MOBILE_TAKEN', 'That number is already signed up. Sign in with it instead.');
    const r = await requestOtp(next);
    if (r.error) throw fail(r.error.status, r.error.code, r.error.message);
    res.json({ ok: true, expiresInSeconds: r.expiresInSeconds });
  }),
);

meRouter.post(
  '/mobile/verify',
  validateBody(z.object({ mobile, otp: z.string().regex(/^\d{6}$/) })),
  asyncHandler(async (req, res) => {
    const { mobile: next, otp } = req.body;
    // checkOtpOnly, not verifyOtp: the latter would mint a second account for the new number.
    const check = checkOtpOnly(next, otp);
    if (check.error) throw fail(check.error.status, check.error.code, check.error.message);
    const moved = changeCustomerMobile(req.customerId, next);
    if (moved.error) throw fail(moved.error.status, moved.error.code, moved.error.message);
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
