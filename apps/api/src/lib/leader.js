/**
 * Only ONE copy of the API runs the scheduled jobs (review #14, 21 Nov 2026).
 *
 * Render starts the new instance of a deploy before it stops the old one, and both run every timer
 * in the meantime: the 5 PM reminder, the pending-order expiry, the payment reconcile, the deletion
 * sweep, the refund retries. Each instance acts on its OWN in-memory copy of the data, so the overlap
 * meant duplicate WhatsApp messages and two copies deciding the same order differently.
 *
 * A lease row in the OpsRecord table decides who runs them. The holder renews it every 20 s; it
 * lapses 60 s after the last renewal, so if the holder dies the other copy takes over within a
 * minute. A shutting-down instance gives the lease up at once and stops running jobs.
 *
 * Without a database (tests, local dev) or before the ops table exists, this process is the only
 * one there is, so it leads — the old behaviour.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../db.js';
import { persistEnabled, isPersistenceEnabled } from '../persistence.js';
import { IS_TEST } from './env.js';

const ME = process.env.RENDER_INSTANCE_ID || randomUUID();
const LEASE_MS = 60_000;
const RENEW_MS = 20_000;

let leader = !persistEnabled; // memory-only process: always
let stopped = false;
let leaseKnown = false; // the table answered at least once
let timer = null;

/** Should this process run scheduled jobs right now? */
export function isLeader() {
  if (stopped) return false;
  if (!persistEnabled || !isPersistenceEnabled()) return !persistEnabled;
  // The ops table has never answered (missing, or not reached yet): behave as the only instance.
  if (!leaseKnown) return true;
  return leader;
}

/** One attempt to take or renew the lease. Exported for tests. */
export async function renewLease(now = Date.now()) {
  if (stopped || !persistEnabled) return leader;
  const data = JSON.stringify({ holder: ME, expiresAt: now + LEASE_MS });
  try {
    const rows = /** @type {any[]} */ (
      await prisma.$queryRawUnsafe(
        `INSERT INTO "OpsRecord" ("kind", "id", "data", "updatedAt")
         VALUES ('lease', 'scheduled-jobs', $1::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT ("kind", "id") DO UPDATE
           SET "data" = EXCLUDED."data", "updatedAt" = CURRENT_TIMESTAMP
           WHERE "OpsRecord"."data"->>'holder' = $2
              OR COALESCE(("OpsRecord"."data"->>'expiresAt')::bigint, 0) < $3
         RETURNING "data"->>'holder' AS holder`,
        data,
        ME,
        now,
      )
    );
    leaseKnown = true;
    const was = leader;
    leader = rows.length > 0 && rows[0].holder === ME;
    if (leader !== was)
      // eslint-disable-next-line no-console
      console.error(`[leader] ${leader ? 'now running' : 'no longer running'} scheduled jobs`);
  } catch (e) {
    // Table missing or database unreachable. Keep whatever we last knew; if we never knew, the
    // isLeader() fallback (run as the only instance) applies.
    // eslint-disable-next-line no-console
    if (!leaseKnown) console.error('[leader] lease unavailable:', e?.message || e);
  }
  return leader;
}

/** Start renewing. Called once after boot. */
export function startLeaderLease() {
  if (IS_TEST || timer || !persistEnabled) return;
  void renewLease();
  timer = setInterval(() => void renewLease(), RENEW_MS);
  timer.unref?.();
}

/** On SIGTERM: stop running jobs and hand the lease straight to the new instance. */
export async function releaseLeadership() {
  stopped = true;
  if (timer) clearInterval(timer);
  if (!persistEnabled || !leaseKnown) return;
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "OpsRecord" WHERE "kind" = 'lease' AND "id" = 'scheduled-jobs' AND "data"->>'holder' = $1`,
      ME,
    );
  } catch {
    /* it lapses on its own within a minute */
  }
}

/**
 * Test hook.
 * @param {{ isLeader?: boolean, known?: boolean, stop?: boolean }} [state]
 */
export function __setLeaderState({ isLeader: l = false, known = true, stop = false } = {}) {
  leader = !!l;
  leaseKnown = known;
  stopped = stop;
}
