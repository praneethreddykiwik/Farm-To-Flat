/**
 * Deleting an account — scheduled, with a 60-day grace period (owner's decision, 19 Nov 2026).
 *
 * How it works, modelled on what large consumer apps do (Uber/Uber Eats: deactivate now, delete
 * after 30 days, signing in again restores; outstanding payments must be cleared first):
 *
 *   1. The customer asks from the app. Nothing is scheduled while an order is still in progress —
 *      placed, being packed, or on its way — because a cash order cannot be completed without the
 *      code only that customer can read out at the door, and a prepaid one is still owed a delivery.
 *   2. They confirm with a one-time code sent to the account's own number (Apple allows this; it
 *      stops a borrowed phone from deleting someone's account).
 *   3. The account is signed out everywhere and scheduled for permanent deletion in 60 days.
 *   4. Signing in again within those 60 days cancels the deletion — the app says so on the way in.
 *   5. After 60 days the sweep below erases it exactly as an immediate deletion always did.
 *
 * The schedule is stored in the OpsRecord table (kind 'deletion'). If that table is not there, a
 * schedule could be lost at the next restart and the promise to delete broken, so the request is
 * honoured IMMEDIATELY instead — the stricter outcome, never the weaker one.
 */
import { listOrdersForCustomer } from '../store.js';
import { deleteCustomerAccount, getCustomer, logout } from '../customer-store.js';
import { getOps, listOps, putOps, putOpsSoft, removeOps, opsReady } from '../ops-store.js';
import { deleteMealPhotos } from './storage.js';
import { reportError } from './sentry.js';
import { deleteTicketsOf } from './tickets.js';
import { isLeader } from './leader.js';
import { logSecurityEvent } from './security-log.js';

export const GRACE_DAYS = 60;
const DAY = 864e5;

/** Orders that still need the customer: placed, packing, on the way, or a cash order unsettled. */
export function ordersBlockingDeletion(cid) {
  const IN_PROGRESS = new Set(['PENDING_PAYMENT', 'CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY']);
  return listOrdersForCustomer(cid).filter(
    (o) =>
      IN_PROGRESS.has(o.status) ||
      (o.status === 'DELIVERED' &&
        o.paymentMethod === 'COD' &&
        Number(o.codCollectedPaise || 0) < Number(o.totalPaise || 0)),
  );
}

/** The pending deletion for this customer, or null. */
export function scheduledDeletion(cid) {
  const r = getOps('deletion', cid);
  return r
    ? {
        requestedAt: r.requestedAt,
        deleteAfter: r.deleteAfter,
        via: r.via || null,
        consent: r.consent || null,
      }
    : null;
}

/** What we keep of the tick-box: that it was ticked, which wording, when, from which app. */
const consentOf = (c) =>
  c?.accepted
    ? {
        accepted: true,
        version: c.version,
        at: new Date().toISOString(),
        platform: c.platform || null,
        appVersion: c.appVersion || null,
      }
    : null;

/**
 * A lasting record that this account asked to be deleted, and what it agreed to. It outlives the
 * account on purpose — it is the proof that the deletion was the customer's own request — so it
 * holds the account's internal id only: no name, number or address (privacy policy §9).
 */
async function recordDeletionConsent(cid, { consent, via, reason }) {
  const at = new Date().toISOString();
  putOpsSoft('deletionConsent', `${cid}:${Date.parse(at)}`, {
    customerId: cid,
    at,
    via,
    reason: reason || null,
    consent: consentOf(consent),
  });
}

/** Every deletion request ever made by this account, oldest first. */
export const deletionConsentsOf = (cid) =>
  listOps('deletionConsent')
    .filter((x) => x.customerId === cid)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));

/**
 * Remove everything that goes with the account — the part every path shares. Orders, payments and
 * wallet entries stay (tax and consumer law); the person behind them does not.
 */
export async function eraseAccountNow(cid) {
  const r = await deleteCustomerAccount(cid);
  if (!r.ok) return r;
  // Kept for its year (DPDP Rule 8(3)): an internal id and the event, nothing that names anyone.
  logSecurityEvent('ACCOUNT_ERASED', { customerId: cid });
  await deleteMealPhotos(r.mealPhotoKeys).catch((e) =>
    reportError(e, { scope: 'erasure', what: 'meal photos' }),
  );
  // Waitlist places and the personal invite code (privacy policy §9).
  try {
    for (const j of listOps('waitlistJoin').filter((x) => x.customerId === cid))
      await removeOps('waitlistJoin', j.id);
    for (const c of listOps('refCode').filter((x) => x.customerId === cid))
      await removeOps('refCode', c.id);
    if (getOps('deletion', cid)) await removeOps('deletion', cid);
    // Install tag and usage events (privacy policy §3, §9): the tag goes; events are detached from
    // the account and survive only as anonymous counts, so past weekly numbers do not change.
    if (getOps('installSource', cid)) await removeOps('installSource', cid);
    // Support requests carry the customer's own words about their problem (privacy policy §9).
    await deleteTicketsOf(cid);
    // The diet plan and profile saved for the calorie tracker.
    if (getOps('mealPlan', cid)) await removeOps('mealPlan', cid);
    for (const e of listOps('event').filter((x) => x.customerId === cid))
      putOpsSoft('event', e.id, { ...e, customerId: null });
  } catch (e) {
    reportError(e, { scope: 'erasure', what: 'ops records' });
  }
  return r;
}

/**
 * Schedule deletion (or, without the table, delete now). Caller has already checked the code.
 * @returns {Promise<{ scheduled: boolean, deleteAfter?: string, deletedNow?: boolean, walletBalancePaise: number }>}
 */
export async function requestDeletion(
  cid,
  { walletBalancePaise = 0, consent = null, via = 'APP', reason = null } = {},
) {
  await recordDeletionConsent(cid, { consent, via, reason });
  if (!opsReady()) {
    const r = await eraseAccountNow(cid);
    return {
      scheduled: false,
      deletedNow: true,
      walletBalancePaise: r.walletBalancePaise ?? walletBalancePaise,
    };
  }
  const now = Date.now();
  const rec = {
    requestedAt: new Date(now).toISOString(),
    deleteAfter: new Date(now + GRACE_DAYS * DAY).toISOString(),
    via,
    consent: consentOf(consent),
  };
  await putOps('deletion', cid, rec);
  logout(cid); // signed out everywhere, at once
  return { scheduled: true, deleteAfter: rec.deleteAfter, walletBalancePaise };
}

/** Signing in again during the grace period keeps the account. Returns true when one was cancelled. */
export async function cancelDeletionOnSignIn(cid) {
  if (!getOps('deletion', cid)) return false;
  await removeOps('deletion', cid);
  return true;
}

/** Erase every account whose grace period is over. Safe to run any number of times. */
/** Usage events are kept for 24 months (privacy policy §9). */
export const EVENT_RETENTION_DAYS = 730;

export async function sweepDeletions(now = Date.now()) {
  let erased = 0;
  const cutoff = now - EVENT_RETENTION_DAYS * 864e5;
  for (const e of listOps('event'))
    if (Date.parse(e.at) < cutoff) await removeOps('event', e.id).catch(() => {});
  for (const d of listOps('deletion')) {
    if (Date.parse(d.deleteAfter) > now) continue;
    if (!getCustomer(d.id)) {
      await removeOps('deletion', d.id).catch(() => {});
      continue;
    }
    try {
      await eraseAccountNow(d.id);
      erased += 1;
    } catch (e) {
      reportError(e, { scope: 'erasure', what: 'scheduled deletion', customerId: d.id });
    }
  }
  return erased;
}

let sweepTimer = null;
/** Run the sweep every hour (and once shortly after boot). Never holds the process open. */
export function startDeletionSweep(everyMs = 60 * 60e3) {
  if (sweepTimer) return sweepTimer;
  const run = () =>
    isLeader() &&
    sweepDeletions().catch((e) => reportError(e, { scope: 'erasure', what: 'sweep' }));
  setTimeout(run, 60e3).unref?.();
  sweepTimer = setInterval(run, everyMs);
  sweepTimer.unref?.();
  return sweepTimer;
}
