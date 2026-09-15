/**
 * Public communities + delivery windows (frozen contract):
 *   GET /communities                       serviceable communities, blocks, delivery days
 *   GET /delivery-windows?communityId=&date=   14-day window schedule with capacity + cut-off
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../http.js';
import { validateQuery } from '../validate.js';
import { communityPublic } from '../serialize.js';
import { bookedFor, getCommunity, listCommunities } from '../store.js';
import { listAddresses, resolveAccess } from '../customer-store.js';
import { generateWindows } from '../lib/windows.js';
import { todayISO } from '../lib/dates.js';

export const communitiesRouter = Router();
communitiesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({
      communities: listCommunities()
        .filter((c) => c.isActive !== false)
        .map(communityPublic),
    });
  }),
);

const WindowsQuery = z.object({
  communityId: z.string().optional(),
  // The app asks by the customer's saved address; resolved to its community via the Bearer session.
  addressId: z.string().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/**
 * Which community's schedule to show. Explicit communityId wins; else an addressId is looked up on the
 * signed-in customer's own addresses; else (no hint at all) the first serviceable community.
 *
 * This used to ignore addressId entirely and fall back to the FIRST community, so every customer saw
 * Prestige High Fields' Tue/Thu/Sat regardless of where they lived — a Bhoomi resident (Sun/Tue/Thu/
 * Sat) never saw Sundays. A hint that can't be resolved is now a 404, never a silent wrong answer.
 */
function resolveCommunity(req, { communityId, addressId }) {
  if (communityId) return getCommunity(communityId);
  if (addressId) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const cid = token && resolveAccess(token);
    const address = cid && listAddresses(cid).find((a) => a.id === addressId);
    return address ? getCommunity(address.communityId) : null;
  }
  return listCommunities()[0] || null;
}

export const windowsRouter = Router();
windowsRouter.get(
  '/',
  validateQuery(WindowsQuery),
  asyncHandler(async (req, res) => {
    // @ts-expect-error validatedQuery attached by middleware
    const { communityId, addressId, date } = req.validatedQuery;
    const community = resolveCommunity(req, { communityId, addressId });
    if (!community) throw fail(404, 'NOT_FOUND', 'No serviceable community.');
    res.json({ windows: generateWindows(community, date || todayISO(), bookedFor) });
  }),
);
