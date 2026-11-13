/**
 * "Do you deliver here?" — and what happens when the answer is no. Authenticated.
 *
 *   POST   /demand/checks              the app pressed "Use my location" somewhere we may not serve
 *   POST   /demand/subscriptions       "tell me when you deliver here"
 *   GET    /demand/subscriptions       the areas this customer is waiting on
 *   DELETE /demand/subscriptions/:id   stop waiting on one — withdrawal is one request
 *
 * The app does the matching itself, on the phone, from the community pins in GET /communities; it
 * only calls /checks once it already knows the answer is "not served". The check is repeated here
 * anyway, because a client's word is not evidence.
 *
 * A check is anonymous: see demand-store.js. A subscription is personal data given by an explicit
 * act, used for one message, removable here and erased with the account.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../http.js';
import { validateBody } from '../validate.js';
import { rateLimit } from '../lib/rate-limit.js';
import { shortText } from '../lib/validators.js';
import { isLatLng } from '../lib/geo.js';
import { getCustomer } from '../customer-store.js';
import {
  demandFault,
  listSubscriptions,
  recordCheck,
  subscribe,
  subscriptionPublic,
  unsubscribe,
} from '../demand-store.js';

export const demandRouter = Router();

// Every route here stores something on the say-so of a phone. Twenty a minute is far more than a
// person pressing a button, and far less than a script filling the table.
demandRouter.use(
  rateLimit({ windowMs: 60 * 1000, max: 20, key: (req) => `demand:${req.customerId}` }),
);

/**
 * A PIN code as a phone's geocoder might hand it over: "500 084", "500084", or — abroad, or on a
 * handset that does not know — something that is not an Indian PIN at all. Anything that is not
 * six digits is dropped rather than refused: the request still says where it came from.
 */
const pincode = z.preprocess((v) => {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length === 6 ? d : undefined;
}, z.string().optional());

const place = {
  locality: shortText(80).nullish(),
  city: shortText(80).nullish(),
  pincode,
};
const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

const Check = z
  .object({ lat, lng, ...place })
  .refine((b) => isLatLng(b.lat, b.lng), { message: 'That is not a location.', path: ['lat'] });

const Subscribe = z
  .object({
    lat: lat.nullish(),
    lng: lng.nullish(),
    ...place,
    communityName: shortText(80).nullish(),
    source: z.enum(['location', 'not_listed']).optional(),
  })
  // A pin needs both halves.
  .refine((b) => (b.lat == null) === (b.lng == null), {
    message: 'Send the latitude and the longitude together.',
    path: ['lng'],
  })
  .refine((b) => b.lat == null || isLatLng(b.lat, b.lng), {
    message: 'That is not a location.',
    path: ['lat'],
  })
  .refine((b) => b.lat != null || b.pincode || b.locality || b.communityName, {
    message: 'Tell us where: share your location, or type your area or community.',
    path: ['communityName'],
  });

/** What the customer sees when the request could not be stored. No SQL, no table names. */
const NOT_SAVED = 'We could not save that just now. Please try again in a little while.';

demandRouter.post(
  '/checks',
  validateBody(Check),
  asyncHandler(async (req, res) => {
    res.json(await recordCheck(req.customerId, req.body));
  }),
);

demandRouter.post(
  '/subscriptions',
  validateBody(Subscribe),
  asyncHandler(async (req, res) => {
    const customer = getCustomer(req.customerId);
    let r;
    try {
      r = await subscribe(
        { id: req.customerId, name: customer?.name, mobile: customer?.mobile },
        req.body,
      );
    } catch (e) {
      if (demandFault(e)) throw fail(503, 'NOT_READY', NOT_SAVED);
      throw e;
    }
    if ('error' in r) throw fail(r.error.status, r.error.code, r.error.message);
    res.status(r.created ? 201 : 200).json({ subscription: subscriptionPublic(r.subscription) });
  }),
);

demandRouter.get(
  '/subscriptions',
  asyncHandler(async (req, res) => {
    res.json({ subscriptions: listSubscriptions(req.customerId).map(subscriptionPublic) });
  }),
);

demandRouter.delete(
  '/subscriptions/:id',
  asyncHandler(async (req, res) => {
    let removed;
    try {
      removed = await unsubscribe(req.customerId, req.params.id);
    } catch (e) {
      if (demandFault(e)) throw fail(503, 'NOT_READY', NOT_SAVED);
      throw e;
    }
    // Someone else's id and an id that never existed look the same from outside, on purpose.
    if (!removed) throw fail(404, 'NOT_FOUND', 'That is not one of your areas.');
    res.status(204).end();
  }),
);
