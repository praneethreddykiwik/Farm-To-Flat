/**
 * Where to deliver next — the operator's view of who is asking.
 *
 *   GET   /admin/demand               every area that has asked, most wanted first
 *   GET   /admin/demand/:key          one area and the people waiting on it
 *   PATCH /admin/demand/:key          the operator's status and note
 *   POST  /admin/demand/:key/notify   tell the people waiting — once each
 *
 * Open to roles with the `communities` section (routes/admin/auth.js). The detail view carries
 * names and mobile numbers, which is why the delivery and purchasing roles are kept out.
 *
 * `:key` is an area key — "pin:500084", "g:17.46,78.36" — so callers must URL-encode it.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../../http.js';
import { validateBody } from '../../validate.js';
import { getCommunity } from '../../store.js';
import { getCustomer } from '../../customer-store.js';
import { emitNotification } from '../../lib/notify.js';
import { recordAction } from '../../lib/audit.js';
import { SETUP_SQL } from '../../demand-db.js';
import {
  AREA_STATUSES,
  demandArea,
  demandFault,
  demandOverview,
  demandTablesReady,
  recheckDemandTables,
  stampNotified,
  updateArea,
} from '../../demand-store.js';

export const adminDemandRouter = Router();

const TABLES_MISSING =
  'Demand cannot be saved yet: the database has no DemandArea / DemandSubscription tables. ' +
  `Create them with — ${SETUP_SQL.demand} — then try again. Nothing was changed.`;
const DB_DOWN =
  'The database cannot be reached right now, so nothing was changed. Try again in a minute.';

/** Turn a failed write into the sentence an operator can act on. */
function writeError(e) {
  const fault = demandFault(e);
  if (fault === 'MISSING') return fail(503, 'NOT_READY', TABLES_MISSING);
  if (fault === 'DOWN') return fail(503, 'NOT_READY', DB_DOWN);
  return e;
}

/**
 * A subscriber as the operator sees them. Name and number are read from the account as it is NOW —
 * someone who has since changed their number should be shown, and called, on the new one — with
 * what was saved at the time as the fallback.
 */
function subscriberView(s) {
  const c = getCustomer(s.customerId);
  return {
    id: s.id,
    name: c?.name ?? s.name ?? null,
    mobile: c?.mobile ?? s.mobile ?? null,
    communityName: s.communityName,
    source: s.source,
    createdAt: s.createdAt,
    notifiedAt: s.notifiedAt,
  };
}

function areaOr404(key) {
  const found = demandArea(key);
  if (!found) throw fail(404, 'NOT_FOUND', 'Nobody has asked from that area.');
  return found;
}

adminDemandRouter.get(
  '/demand',
  asyncHandler(async (_req, res) => {
    // Boot found the tables missing? Look again — they may have been created since.
    if (!demandTablesReady()) await recheckDemandTables();
    const ready = demandTablesReady();
    res.json({
      ready,
      // Only when it is needed: the exact statements to run, so the console can show them.
      ...(ready ? {} : { setupSql: SETUP_SQL.demand }),
      ...demandOverview(),
    });
  }),
);

adminDemandRouter.get(
  '/demand/:key',
  asyncHandler(async (req, res) => {
    const { area, subscribers } = areaOr404(req.params.key);
    // This is the one place in the console that lists people's mobile numbers in full — they
    // asked to be told, and telling them may mean ringing. So opening it is written to the audit
    // trail, like opening a customer's history, and before anything is returned: a list of
    // numbers nobody can be shown to have looked at is not one to hand over. An area with only
    // anonymous checks has nobody in it, and nothing to record.
    if (subscribers.length)
      await recordAction({
        staff: req.staff,
        action: 'DEMAND_SUBSCRIBERS_VIEWED',
        target: area.key,
        details: { subscribers: subscribers.length },
      });
    res.json({ area, subscribers: subscribers.map(subscriberView) });
  }),
);

const UpdateArea = z
  .object({
    status: z.enum(AREA_STATUSES).optional(),
    note: z.string().max(300).nullable().optional(),
  })
  .refine((b) => b.status !== undefined || b.note !== undefined, {
    message: 'Nothing to change.',
  });

adminDemandRouter.patch(
  '/demand/:key',
  validateBody(UpdateArea),
  asyncHandler(async (req, res) => {
    const { area } = areaOr404(req.params.key);
    let change;
    try {
      change = await updateArea(area.key, req.body, req.staff?.email || req.staff?.name || null);
    } catch (e) {
      throw writeError(e);
    }
    await recordAction({
      staff: req.staff,
      action: 'DEMAND_AREA_UPDATED',
      target: area.key,
      details: { area: area.label, ...change },
    });
    res.json({ area: areaOr404(area.key).area });
  }),
);

const Notify = z.object({
  message: z.string().trim().min(1).max(240).optional(),
  communityId: z.string().min(1).max(60).optional(),
});

/** What to call the place in a sentence: "Kondapur", not "Kondapur · 500084". */
const placeName = (area) => area.locality || area.city || area.communities[0]?.name || area.label;

adminDemandRouter.post(
  '/demand/:key/notify',
  validateBody(Notify),
  asyncHandler(async (req, res) => {
    const { area, subscribers } = areaOr404(req.params.key);
    const community = req.body.communityId ? getCommunity(req.body.communityId) : null;
    if (req.body.communityId && !community)
      throw fail(422, 'VALIDATION', 'That community does not exist.');

    const message =
      req.body.message ||
      `We now deliver to ${community?.name || placeName(area)}. Open the app to add your address.`;
    // Only people who have not been told, and whose account still exists.
    const pending = subscribers.filter((s) => !s.notifiedAt && getCustomer(s.customerId));
    if (!pending.length) return res.json({ notified: 0 });

    // Recorded BEFORE anything is sent: a message to customers that leaves no trace of who sent it
    // is the thing the audit trail exists to prevent. If this cannot be written, nothing goes.
    await recordAction({
      staff: req.staff,
      action: 'DEMAND_AREA_NOTIFIED',
      target: area.key,
      details: {
        area: area.label,
        subscribers: pending.length,
        message,
        communityId: community?.id || null,
      },
    });

    const at = new Date().toISOString();
    let notified = 0;
    try {
      for (const s of pending) {
        // Stamped first, sent second. If the stamp cannot be saved the message is not sent, so a
        // retry can never tell the same person twice.
        await stampNotified(s.id, at);
        emitNotification(s.customerId, {
          type: 'AREA_LAUNCHED',
          title: req.body.message ? 'An update for your area' : 'Now delivering in your area 🌱',
          body: message,
          data: { areaKey: area.key, communityId: community?.id || null },
        });
        notified += 1;
      }
      await updateArea(area.key, { notifiedAt: at }, req.staff?.email || req.staff?.name || null);
    } catch (e) {
      const known = writeError(e);
      if (known === e) throw e;
      throw fail(
        503,
        'NOT_READY',
        notified
          ? `${notified} of ${pending.length} were told before the database stopped answering. ` +
              'Press Notify again in a minute — nobody will be told twice.'
          : known.message,
      );
    }
    res.json({ notified });
  }),
);
