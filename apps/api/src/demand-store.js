/**
 * Where people are asking us to deliver, and who wants to hear when we do.
 *
 * Two kinds of signal, kept deliberately apart:
 *
 *   A CHECK is anonymous. Someone outside every served community pressed "Use my location"; we add
 *   one to the count for their area and remember nothing about them. There is no column for a
 *   customer on an area — a check cannot be traced to a person because there is nowhere to write it.
 *
 *   A SUBSCRIPTION is a person. They pressed "tell me when you deliver here", which is the act of
 *   consent, and it is used for that one message. They can remove it, and deleting the account
 *   removes it too.
 *
 * Community LOCATIONS live here as well — the circle round each community's gate that the check is
 * made against — because they persist in a table of their own (see demand-db.js for why).
 *
 * Same shape as the rest of the API: an in-memory cache that the database is loaded into at boot.
 * Unlike the rest, every write goes to the DATABASE FIRST and memory second, so nothing is ever
 * shown as saved that a restart would take away.
 */
import { demandDb, isMissingTable } from './demand-db.js';
import { persistEnabled, persistenceOn } from './persistence.js';
import { applyCommunityGeo, listCommunities, updateCommunity } from './store.js';
import { id } from './lib/ids.js';
import { addDaysISO, todayISO } from './lib/dates.js';
import {
  DEFAULT_RADIUS_M,
  areaFor,
  isLatLng,
  nearestCommunity,
  roundTo,
  servingCommunity,
} from './lib/geo.js';

/** @type {[string, ...string[]]} */
export const AREA_STATUSES = ['OPEN', 'PLANNED', 'LAUNCHED', 'DISMISSED'];

/** One person may follow this many areas. Nobody lives in more; a script might try. */
export const MAX_SUBSCRIPTIONS = 10;
/** How many days of per-day check counts an area keeps. Enough for "last 7", bounded for ever. */
const KEEP_DAYS = 60;

const ds = {
  /** areaKey -> area */
  areas: new Map(),
  /** subscriptionId -> subscription */
  subs: new Map(),
  /**
   * `${customerId}|${areaKey}` of checks already counted, so pressing the button five times is one
   * request, not five. MEMORY ONLY: it is never written anywhere, and it is the only place a
   * customer and a check are ever mentioned together.
   */
  seen: new Set(),
};

// False only when a database is connected and the table is not there. A memory-only process
// (tests, local dev) is always ready: memory is all there is.
let geoReady = true;
let demandReady = true;
export const geoTableReady = () => geoReady;
export const demandTablesReady = () => demandReady;
export const setGeoTableReady = (ready) => {
  geoReady = !!ready;
};
export const setDemandTablesReady = (ready) => {
  demandReady = !!ready;
};

let lastProbe = 0;
const REPROBE_MS = 30 * 1000;

/** Replace everything with what the database holds (boot, each re-hydration, and "look again"). */
export function hydrateDemand(loaded) {
  geoReady = loaded.geo !== null;
  if (loaded.geo) applyCommunityGeo(loaded.geo);
  demandReady = loaded.areas !== null && loaded.subscriptions !== null;
  ds.areas = new Map((loaded.areas || []).map((a) => [a.key, a]));
  ds.subs = new Map((loaded.subscriptions || []).map((s) => [s.id, s]));
}

/**
 * Look again. Boot may have found a table missing that has been created since; nobody should have
 * to restart the API to be allowed to save. Only reads when something is actually marked missing.
 */
export async function recheckDemandTables() {
  if (geoReady && demandReady) return;
  if (!persistenceOn()) {
    // No database at all: nothing can be missing. (A configured-but-unreachable one stays as it is.)
    if (!persistEnabled) geoReady = demandReady = true;
    return;
  }
  // The console asks every time one of its pages opens. Until someone creates the tables that
  // would be three failed queries per page view, so ask the database at most twice a minute.
  if (Date.now() - lastProbe < REPROBE_MS) return;
  lastProbe = Date.now();
  hydrateDemand(await demandDb.loadAll());
}

/**
 * Why a write failed, in the two ways that have a known answer.
 * @returns {'MISSING'|'DOWN'|null}
 */
export function demandFault(e) {
  if (isMissingTable(e)) return 'MISSING';
  if (e?.code === 'DB_UNAVAILABLE') return 'DOWN';
  return null;
}

const clean = (s, max = 80) => {
  const t = String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return t || null;
};
const pin = (s) => (/^\d{6}$/.test(String(s || '')) ? String(s) : null);

// ── community locations ───────────────────────────────────────────────────────

/**
 * Save where a community is. The database first: if that fails, the app must not start recognising
 * a location that will be forgotten at the next restart.
 * @returns {Promise<any>} the updated community
 */
export async function setCommunityLocation(communityId, { lat, lng, radiusM }, by) {
  const geo = { lat, lng, radiusM: radiusM || DEFAULT_RADIUS_M };
  try {
    await demandDb.saveCommunityGeo(communityId, geo, by);
  } catch (e) {
    if (isMissingTable(e)) geoReady = false;
    throw e;
  }
  geoReady = true;
  return updateCommunity(communityId, geo);
}

/** Forget where a community is. The app stops recognising it by location; nothing else changes. */
export async function clearCommunityLocation(communityId) {
  try {
    await demandDb.deleteCommunityGeo(communityId);
  } catch (e) {
    // No table means there was never a row to remove.
    if (!isMissingTable(e)) throw e;
    geoReady = false;
  }
  return updateCommunity(communityId, { lat: null, lng: null, radiusM: null });
}

// ── areas ─────────────────────────────────────────────────────────────────────

/**
 * The next state of an area after one more signal from it — without touching the stored one, so a
 * failed write leaves memory exactly as it was.
 * @param {{ key: string, label: string }} where
 * @param {any} input the request (lat, lng, pincode, locality, city)
 * @param {{ check?: boolean, now?: number }} [opts]
 */
function nextArea(where, input, { check = false, now = Date.now() } = {}) {
  const at = new Date(now).toISOString();
  const had = ds.areas.get(where.key);
  const a = had
    ? { ...had, checksByDay: { ...had.checksByDay } }
    : {
        key: where.key,
        label: where.label,
        pincode: null,
        locality: null,
        city: null,
        lat: null,
        lng: null,
        checks: 0,
        checksByDay: {},
        firstAt: at,
        lastAt: at,
        status: 'OPEN',
        note: null,
        notifiedAt: null,
        updatedBy: null,
      };
  // Fill in what an earlier request from here did not know. Never overwrite: the first phone to
  // name a place is as right as the tenth, and a label that kept changing would be unreadable.
  a.pincode ||= pin(input.pincode);
  a.locality ||= clean(input.locality);
  a.city ||= clean(input.city);
  if (a.lat == null && isLatLng(input.lat, input.lng)) {
    // An AREA is coarse whoever asked: about a kilometre, never a doorstep.
    a.lat = roundTo(input.lat, 2);
    a.lng = roundTo(input.lng, 2);
  }
  // A PIN-only label ("500084") becomes "Kondapur · 500084" once somebody's phone names the place.
  if (where.key.startsWith('pin:') || where.key.startsWith('g:')) {
    a.label =
      areaFor({ pincode: a.pincode, lat: a.lat, lng: a.lng, locality: a.locality, city: a.city })
        ?.label || a.label;
  }
  a.lastAt = at;
  if (check) {
    const day = todayISO(now);
    a.checks += 1;
    a.checksByDay[day] = (a.checksByDay[day] || 0) + 1;
    const oldest = addDaysISO(day, -KEEP_DAYS);
    for (const d of Object.keys(a.checksByDay)) if (d < oldest) delete a.checksByDay[d];
  }
  return a;
}

/**
 * "Use my location", from somewhere we may or may not deliver.
 *
 * Inside a served community: say which, and record nothing. Outside: add one to the area's count.
 * `customerId` is used for exactly one thing — not counting the same person twice — and is not
 * written to the area, the database, or a log.
 *
 * @returns {Promise<{ served: true, communityId: string } |
 *                   { served: false, area: { key: string, label: string }, counted: boolean }>}
 *   `counted` is false when the request could not be stored (table missing, database down), so the
 *   app never tells someone they were counted when they were not.
 */
export async function recordCheck(customerId, input, now = Date.now()) {
  const hit = servingCommunity(listCommunities(), input.lat, input.lng);
  if (hit) return { served: true, communityId: hit.community.id };

  const where = areaFor(input);
  // Unreachable through the route, which refuses a point that is not a real coordinate.
  if (!where) return { served: false, area: { key: '', label: '' }, counted: false };
  const area = { key: where.key, label: ds.areas.get(where.key)?.label || where.label };
  const mark = `${customerId}|${where.key}`;
  if (ds.seen.has(mark)) return { served: false, area, counted: true };

  const next = nextArea(where, input, { check: true, now });
  try {
    await demandDb.saveArea(next);
  } catch (e) {
    if (isMissingTable(e)) demandReady = false;
    // eslint-disable-next-line no-console
    else console.error('[demand] could not count a location check:', e?.message || e);
    return { served: false, area, counted: false };
  }
  ds.areas.set(next.key, next);
  if (ds.seen.size > 50000) ds.seen.clear(); // a cache, not a record — losing it costs a recount
  ds.seen.add(mark);
  return { served: false, area: { key: next.key, label: next.label }, counted: true };
}

// ── subscriptions ─────────────────────────────────────────────────────────────

/** What the customer's own app is shown. No name or number: they know their own. */
export const subscriptionPublic = (s) => ({
  id: s.id,
  areaKey: s.areaKey,
  areaLabel: s.areaLabel,
  communityName: s.communityName,
  createdAt: s.createdAt,
  notifiedAt: s.notifiedAt,
});

export const listSubscriptions = (customerId) =>
  [...ds.subs.values()]
    .filter((s) => s.customerId === customerId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

/**
 * "Tell me when you deliver here." One per person per area: asking again updates the one they have.
 *
 * @param {{ id: string, name?: string|null, mobile?: string|null }} customer
 * @param {any} input
 * @returns {Promise<{ subscription: any, created: boolean } | { error: { status: number, code: string, message: string } }>}
 */
export async function subscribe(customer, input, now = Date.now()) {
  const where = areaFor(input);
  if (!where)
    return {
      error: {
        status: 422,
        code: 'VALIDATION',
        message: 'Tell us where: share your location, or type your area or community.',
      },
    };
  const mine = listSubscriptions(customer.id);
  const had = mine.find((s) => s.areaKey === where.key);
  if (!had && mine.length >= MAX_SUBSCRIPTIONS)
    return {
      error: {
        status: 422,
        code: 'TOO_MANY',
        message: `You are already following ${MAX_SUBSCRIPTIONS} areas. Remove one in Profile first.`,
      },
    };

  const area = nextArea(where, input, { now });
  const at = new Date(now).toISOString();
  const place = isLatLng(input.lat, input.lng);
  const sub = {
    id: had?.id || id('dsub'),
    customerId: customer.id,
    name: customer.name ?? null,
    mobile: customer.mobile ?? null,
    areaKey: area.key,
    areaLabel: area.label,
    // Closer than an area — about a hundred metres — because "which gate" is the question an
    // operator planning a route actually has. Still not a doorstep.
    lat: place ? roundTo(input.lat, 3) : (had?.lat ?? null),
    lng: place ? roundTo(input.lng, 3) : (had?.lng ?? null),
    pincode: pin(input.pincode) || had?.pincode || null,
    locality: clean(input.locality) || had?.locality || null,
    city: clean(input.city) || had?.city || null,
    communityName: clean(input.communityName) || had?.communityName || null,
    source: input.source || had?.source || 'location',
    createdAt: had?.createdAt || at,
    updatedAt: at,
    notifiedAt: had?.notifiedAt || null,
  };
  try {
    await demandDb.saveArea(area);
    await demandDb.saveSubscription(sub);
  } catch (e) {
    if (isMissingTable(e)) demandReady = false;
    throw e;
  }
  demandReady = true;
  ds.areas.set(area.key, area);
  ds.subs.set(sub.id, sub);
  return { subscription: sub, created: !had };
}

/** Remove one of the caller's own. @returns {Promise<boolean>} false if it is not theirs */
export async function unsubscribe(customerId, subscriptionId) {
  const s = ds.subs.get(subscriptionId);
  if (!s || s.customerId !== customerId) return false;
  await demandDb.deleteSubscription(subscriptionId);
  ds.subs.delete(subscriptionId);
  return true;
}

/**
 * Erasure. Memory always; the database unless the table was never created (then there is nothing
 * there to erase). Any other failure is thrown, so the caller decides — a deleted account whose
 * name and number quietly survive in this table is the outcome to avoid.
 */
export async function deleteSubscriptionsForCustomer(customerId) {
  for (const s of ds.subs.values()) if (s.customerId === customerId) ds.subs.delete(s.id);
  for (const mark of ds.seen) if (mark.startsWith(`${customerId}|`)) ds.seen.delete(mark);
  try {
    await demandDb.deleteSubscriptionsForCustomer(customerId);
  } catch (e) {
    if (!isMissingTable(e)) throw e;
  }
}

// ── the operator's view ───────────────────────────────────────────────────────

const subsIn = (key) => [...ds.subs.values()].filter((s) => s.areaKey === key);

/** The community names people typed, most-asked first. "my home bhooja" and "My Home Bhooja" are one. */
function namesAsked(subs) {
  /** @type {Map<string, { name: string, count: number }>} */
  const tally = new Map();
  for (const s of subs) {
    if (!s.communityName) continue;
    const k = s.communityName.toLowerCase();
    const row = tally.get(k) || { name: s.communityName, count: 0 };
    row.count += 1;
    tally.set(k, row);
  }
  return [...tally.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function areaView(a, communities, now) {
  const subs = subsIn(a.key);
  const today = todayISO(now);
  let last7 = 0;
  for (let i = 0; i < 7; i += 1) last7 += a.checksByDay?.[addDaysISO(today, -i)] || 0;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  last7 += subs.filter((s) => Date.parse(s.createdAt) >= weekAgo).length;
  return {
    key: a.key,
    label: a.label,
    pincode: a.pincode,
    locality: a.locality,
    city: a.city,
    lat: a.lat,
    lng: a.lng,
    subscribers: subs.length,
    checks: a.checks,
    last7,
    firstAt: a.firstAt,
    lastAt: a.lastAt,
    communities: namesAsked(subs).slice(0, 5),
    nearest: nearestCommunity(communities, a.lat, a.lng),
    status: a.status,
    note: a.note,
    notifiedAt: a.notifiedAt,
  };
}

/** Every area that has asked, most wanted first. */
export function demandOverview(now = Date.now()) {
  const communities = listCommunities();
  const areas = [...ds.areas.values()]
    .map((a) => areaView(a, communities, now))
    .sort(
      (a, b) =>
        b.subscribers - a.subscribers ||
        b.checks - a.checks ||
        (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0),
    );
  return {
    totals: {
      subscribers: ds.subs.size,
      checks: areas.reduce((n, a) => n + a.checks, 0),
      areas: areas.length,
    },
    areas,
  };
}

/** One area and the people waiting on it, oldest request first. */
export function demandArea(key, now = Date.now()) {
  const a = ds.areas.get(key);
  if (!a) return null;
  return {
    area: areaView(a, listCommunities(), now),
    subscribers: subsIn(key).sort((x, y) => (x.createdAt > y.createdAt ? 1 : -1)),
  };
}

/** The operator's status and note. @returns {Promise<{ before: any, after: any } | null>} */
export async function updateArea(key, patch, by) {
  const a = ds.areas.get(key);
  if (!a) return null;
  const next = { ...a, updatedBy: by || null };
  if (patch.status !== undefined) next.status = patch.status;
  if (patch.note !== undefined) next.note = clean(patch.note, 300);
  if (patch.notifiedAt !== undefined) next.notifiedAt = patch.notifiedAt;
  try {
    await demandDb.saveArea(next);
  } catch (e) {
    if (isMissingTable(e)) demandReady = false;
    throw e;
  }
  ds.areas.set(key, next);
  return {
    before: { status: a.status, note: a.note },
    after: { status: next.status, note: next.note },
  };
}

/**
 * Stamp one subscriber as told. Written BEFORE the message goes, so that whatever else happens
 * nobody is told twice.
 */
export async function stampNotified(subscriptionId, at) {
  const s = ds.subs.get(subscriptionId);
  if (!s) return null;
  const next = { ...s, notifiedAt: at };
  await demandDb.saveSubscription(next);
  ds.subs.set(s.id, next);
  return next;
}

/** Test seam. */
export function _resetDemand() {
  ds.areas.clear();
  ds.subs.clear();
  ds.seen.clear();
  geoReady = true;
  demandReady = true;
}
