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
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export const windowsRouter = Router();
windowsRouter.get(
  '/',
  validateQuery(WindowsQuery),
  asyncHandler(async (req, res) => {
    // @ts-expect-error validatedQuery attached by middleware
    const { communityId, date } = req.validatedQuery;
    const list = listCommunities();
    const community = (communityId && getCommunity(communityId)) || list[0];
    if (!community) throw fail(404, 'NOT_FOUND', 'No serviceable community.');
    res.json({ windows: generateWindows(community, date || todayISO(), bookedFor) });
  }),
);
