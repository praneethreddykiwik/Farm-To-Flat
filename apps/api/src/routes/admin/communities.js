/**
 * Admin communities + delivery-window config.
 *   GET   /admin/communities            operator view (capacity, cut-off, location, active flag)
 *   POST  /admin/communities            add a serviceable community
 *   PATCH /admin/communities/:id        edit delivery days, windows, blocks, location, active flag
 *   GET   /admin/communities/:id/windows?date=   the generated schedule for one community
 *
 * A community's LOCATION (lat, lng, radiusM) is what lets the app's "Use my location" recognise it.
 * It is stored in a table of its own and saved durably — see demand-db.js for why.
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
import { recheckWindowsColumn } from '../../persistence.js';
import {
  clearCommunityLocation,
  demandFault,
  geoTableReady,
  recheckDemandTables,
  setCommunityLocation,
} from '../../demand-store.js';
import {
  DEFAULT_RADIUS_M,
  MAX_RADIUS_M,
  MIN_RADIUS_M,
  communityGeo,
  isLatLng,
} from '../../lib/geo.js';
import { recordAction } from '../../lib/audit.js';
import { SETUP_SQL } from '../../demand-db.js';

export const adminCommunitiesRouter = Router();

const weekday = z.number().int().min(0).max(6);
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24h HH:MM, e.g. 03:45');
/** "06:00" → 360. Only used to order the three clock times of a window against each other. */
const minutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const CreateCommunity = z.object({
  name: z.string().min(1).max(80),
  area: z.string().min(1).max(80),
  // Where the community's gate is, and how far from it still counts as "inside". Together they are
  // the circle the app checks a customer's location against. `geo: null` clears it.
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  radiusM: z.number().int().min(MIN_RADIUS_M).max(MAX_RADIUS_M).optional(),
  geo: z.null().optional(),
  // Optional on create: when omitted, the store defaults to all 7 delivery days + the standard
  // cut-off times, so a new community immediately has orderable windows (admin narrows from there).
  deliveryDays: z.array(weekday).min(1).max(7).optional(),
  // Same-day IST cut-off clock times — orders for a window close at this time on its own delivery
  // date. Replaces the old capacity-based limit: a window never "fills up", it only closes on time.
  morningCutoff: clockTime.optional(),
  // 0 = same-day ordering allowed; 1 = order today, delivered tomorrow (the default).
  orderLeadDays: z.coerce.number().int().min(0).max(7).optional(),
  eveningCutoff: clockTime.optional(),
  // The community's delivery windows, sent WHOLE: the admin edits the list and PATCHes all of it,
  // so adding, renaming, re-timing and removing are one atomic write rather than four endpoints
  // that can half-apply. An entry with a `key` is being edited and keeps that key (orders point at
  // it); an entry without one is new and the store derives its key from the label.
  windows: z
    .array(
      z
        .object({
          key: z.string().min(1).max(32).optional(),
          label: z.string().min(1).max(40),
          cutoff: clockTime,
          start: clockTime,
          end: clockTime,
        })
        // A window has to end after it begins, and ordering has to close BEFORE the van sets off.
        // Without this an operator could set a 06:00–12:00 run to close at 17:17, and the window
        // then stayed open for the whole day — including hours after the delivery had already
        // happened. That is exactly how an order was accepted "after the delivery time closed".
        .refine((w) => minutes(w.end) > minutes(w.start), {
          message: 'A window has to end after it starts.',
          path: ['end'],
        }),
      // No rule tying the cut-off to `start` any more. It reads as the last occurrence of that
      // clock time before the run begins (lib/windows.js), so a time later than `start` simply
      // means the day before — "orders close 4pm" for a dawn delivery, which is how these runs
      // are actually scheduled. Ordering still always closes before the van leaves; that
      // invariant now lives in the time maths rather than in a rule the operator has to satisfy.
    )
    .min(1, 'A community needs at least one delivery window.')
    .max(6, 'Six windows a day is already more than anyone can staff.')
    .optional(),
  cutoffWarningMinutes: z.number().int().min(1).max(120).optional(),
  blocks: z.array(z.string().max(40)).max(100),
});
const UpdateCommunity = CreateCommunity.partial().extend({ isActive: z.boolean().optional() });

const GEO_TABLE_MISSING =
  'The location cannot be saved yet: the database has no CommunityGeo table. Create it with — ' +
  `${SETUP_SQL.geo} — then try again. Nothing was saved.`;
const DB_DOWN =
  'The database cannot be reached right now, so nothing was saved. Try again in a minute.';

/** Turn a failed location write into the sentence an operator can act on. */
function locationError(e) {
  const fault = demandFault(e);
  if (fault === 'MISSING') return fail(503, 'NOT_READY', GEO_TABLE_MISSING);
  if (fault === 'DOWN') return fail(503, 'NOT_READY', DB_DOWN);
  return e;
}

/**
 * What a request wants done to a community's location.
 *
 * `geo: null` clears it. Otherwise any of lat / lng / radiusM changes it, and what the request
 * leaves out is taken from what the community already has — so the radius can be widened without
 * retyping the pin. A pin needs both halves: one coordinate on its own is refused rather than
 * paired with a stale other half.
 *
 * @returns {{ clear: boolean, set: { lat: number, lng: number, radiusM: number } | null } | null}
 */
function locationChange(body, current) {
  if (body.geo === null) return { clear: true, set: null };
  if (body.lat === undefined && body.lng === undefined && body.radiusM === undefined) return null;
  const had = communityGeo(current);
  const lat = body.lat ?? had?.lat;
  const lng = body.lng ?? had?.lng;
  if (!isLatLng(lat, lng))
    throw fail(
      422,
      'VALIDATION',
      body.lat === undefined && body.lng === undefined
        ? 'Set the coordinates before the radius.'
        : 'A location needs both the latitude and the longitude.',
    );
  return {
    clear: false,
    set: { lat, lng, radiusM: body.radiusM ?? had?.radiusM ?? DEFAULT_RADIUS_M },
  };
}

/** The location fields are saved by their own durable write, never by the general community one. */
function withoutLocation(body) {
  const { lat: _lat, lng: _lng, radiusM: _radiusM, geo: _geo, ...rest } = body;
  return rest;
}

/** Apply a location change, database first, and record who made it. */
async function applyLocation(req, community, change) {
  const before = communityGeo(community);
  const by = req.staff?.email || req.staff?.name || null;
  if (change.clear) await clearCommunityLocation(community.id);
  else await setCommunityLocation(community.id, change.set, by);
  await recordAction({
    staff: req.staff,
    action: change.clear ? 'COMMUNITY_LOCATION_CLEARED' : 'COMMUNITY_LOCATION_UPDATED',
    target: community.id,
    details: { community: community.name, before, after: change.clear ? null : change.set },
  });
}

adminCommunitiesRouter.get(
  '/communities',
  asyncHandler(async (_req, res) => {
    // Boot found no CommunityGeo table? Look again — it may have been created since.
    if (!geoTableReady()) await recheckDemandTables();
    res.json({ communities: listCommunities().map(communityAdmin) });
  }),
);

adminCommunitiesRouter.post(
  '/communities',
  validateBody(CreateCommunity),
  asyncHandler(async (req, res) => {
    const change = locationChange(req.body, null);
    const community = createCommunity(withoutLocation(req.body));
    // The community exists from here on, so a location that cannot be saved is REPORTED, not
    // thrown: an error status would have the operator press Add again and create it twice.
    let locationNotSaved = null;
    if (change?.set) {
      try {
        await applyLocation(req, community, change);
      } catch (e) {
        const known = locationError(e);
        if (known === e) throw e;
        locationNotSaved = known.message;
      }
    }
    res.status(201).json({
      community: communityAdmin(getCommunity(community.id)),
      ...(locationNotSaved ? { locationNotSaved } : {}),
    });
  }),
);

adminCommunitiesRouter.patch(
  '/communities/:id',
  validateBody(UpdateCommunity),
  asyncHandler(async (req, res) => {
    if (!getCommunity(req.params.id)) throw fail(404, 'NOT_FOUND', 'Community not found');
    // Refuse rather than accept-and-lose. Without the `windows` column the write silently drops the
    // list, so a deleted slot came back on the next boot with nothing having reported a failure —
    // which is exactly how it was reported: "removed initially, back after refreshing".
    if (req.body.windows !== undefined && !(await recheckWindowsColumn()))
      throw fail(
        503,
        'WINDOWS_NOT_PERSISTABLE',
        'Delivery windows cannot be saved yet: the database is missing the windows column. Add it ' +
          'with `ALTER TABLE "Community" ADD COLUMN IF NOT EXISTS "windows" JSONB NOT NULL ' +
          "DEFAULT '[]'::jsonb`, then try again.",
      );
    // Location first, and durably: if it cannot be saved the whole request is refused, so the
    // operator is never shown a half-applied edit.
    const change = locationChange(req.body, getCommunity(req.params.id));
    if (change) {
      try {
        await applyLocation(req, getCommunity(req.params.id), change);
      } catch (e) {
        throw locationError(e);
      }
    }
    const rest = withoutLocation(req.body);
    const community = Object.keys(rest).length
      ? updateCommunity(req.params.id, rest)
      : getCommunity(req.params.id);
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
