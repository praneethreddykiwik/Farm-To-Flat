/**
 * Profile + addresses (contract, authenticated). GET/PATCH /me, list/add addresses, set default.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../http.js';
import { validateBody } from '../validate.js';
import { personName, email, flat, floor, shortText, mobile } from '../lib/validators.js';
import { customerPublic } from '../serialize.js';
import { money } from '../lib/money.js';
import {
  addAddress,
  changeCustomerMobile,
  checkOtpOnly,
  getCustomerIdByMobile,
  requestOtp,
  cartCount,
  defaultAddress,
  getCustomer,
  getWallet,
  hasAddress,
  listAddresses,
  setDefaultAddress,
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
