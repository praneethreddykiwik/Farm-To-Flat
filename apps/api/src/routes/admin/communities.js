/**
 * Admin communities + delivery-window config.
 *   GET   /admin/communities            operator view (capacity, cut-off, lat/lng, active flag)
 *   POST  /admin/communities            add a serviceable community
 *   PATCH /admin/communities/:id        edit capacity, delivery days, blocks, active flag
 *   GET   /admin/communities/:id/windows?date=   the generated schedule for one community
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../../http.js';
import { validateBody } from '../../validate.js';
import { communityAdmin } from '../../serialize.js';
import {
  bookedIndex,
  createCommunity,
  getCommunity,
  listCommunities,
  updateCommunity,
} from '../../store.js';
import { generateWindows } from '../../lib/windows.js';
import { todayISO } from '../../lib/dates.js';

export const adminCommunitiesRouter = Router();

const weekday = z.number().int().min(0).max(6);
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24h HH:MM, e.g. 03:45');
const CreateCommunity = z.object({
  name: z.string().min(1).max(80),
  area: z.string().min(1).max(80),
  lat: z.number().optional(),
  lng: z.number().optional(),
  // Optional on create: when omitted, the store defaults to all 7 delivery days + the standard
  // cut-off times, so a new community immediately has orderable windows (admin narrows from there).
  deliveryDays: z.array(weekday).min(1).max(7).optional(),
  // Same-day IST cut-off clock times — orders for a window close at this time on its own delivery
  // date. Replaces the old capacity-based limit: a window never "fills up", it only closes on time.
  morningCutoff: clockTime.optional(),
  // 0 = same-day ordering allowed; 1 = order today, delivered tomorrow (the default).
  orderLeadDays: z.coerce.number().int().min(0).max(7).optional(),
  eveningCutoff: clockTime.optional(),
  cutoffWarningMinutes: z.number().int().min(1).max(120).optional(),
  blocks: z.array(z.string().max(40)).max(100),
});
const UpdateCommunity = CreateCommunity.partial().extend({ isActive: z.boolean().optional() });

adminCommunitiesRouter.get(
  '/communities',
  asyncHandler(async (_req, res) => {
    res.json({ communities: listCommunities().map(communityAdmin) });
  }),
);

adminCommunitiesRouter.post(
  '/communities',
  validateBody(CreateCommunity),
  asyncHandler(async (req, res) => {
    const community = createCommunity(req.body);
    res.status(201).json({ community: communityAdmin(community) });
  }),
);

adminCommunitiesRouter.patch(
  '/communities/:id',
  validateBody(UpdateCommunity),
  asyncHandler(async (req, res) => {
    if (!getCommunity(req.params.id)) throw fail(404, 'NOT_FOUND', 'Community not found');
    const community = updateCommunity(req.params.id, req.body);
    res.json({ community: communityAdmin(community) });
  }),
);

adminCommunitiesRouter.get(
  '/communities/:id/windows',
  asyncHandler(async (req, res) => {
    const community = getCommunity(req.params.id);
    if (!community) throw fail(404, 'NOT_FOUND', 'Community not found');
    const date = typeof req.query.date === 'string' ? req.query.date : todayISO();
    res.json({ windows: generateWindows(community, date, bookedIndex(community.id)) });
  }),
);
