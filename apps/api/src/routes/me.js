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
    res.json({ addresses: setDefaultAddress(req.customerId, req.params.id) });
  }),
);
