/**
 * The database side of community locations and expansion demand: three tables, each OPTIONAL.
 *
 *   CommunityGeo        where a community is, so "Use my location" can recognise it
 *   DemandArea          one row per area people have asked from — an anonymous count, and the
 *                       operator's status and note
 *   DemandSubscription  one row per person who asked to be told when delivery starts in their area
 *
 * Optional, because this code deploys ahead of its schema (this project creates tables by hand).
 * A missing table must never stop the shop opening, so every read here is caught and reported as
 * `null` — "no table" — which is different from `[]`, "a table with nothing in it".
 *
 * And DURABLE, unlike `persist.*`: these writes are awaited and they throw. An operator who saves a
 * community's location, and a customer who is told "we'll let you know", have both been promised
 * something that has to still be true after the next restart. A queued write that is lost would
 * make that a lie with no error anywhere.
 *
 * Exported as one object so a test can make a single write fail the way a missing table does.
 */
import { prisma } from './db.js';
import { persistEnabled, persistenceOn } from './persistence.js';

/**
 * The statements that create these tables, word for word what an operator is told to run when one
 * is missing. One copy, here, so the error message, the admin console and prisma/schema.prisma
 * cannot drift apart. `IF NOT EXISTS` throughout: safe to run twice.
 *
 * Row-level security is switched ON with no policy, which on Supabase means "nobody but the
 * database owner" — the API connects as the owner and is unaffected, while the public REST endpoint
 * Supabase puts in front of every table can read nothing. DemandSubscription holds names and
 * mobile numbers; without that line it would be readable with the public key.
 */
export const SETUP_SQL = {
  geo:
    'CREATE TABLE IF NOT EXISTS "CommunityGeo" ("communityId" TEXT PRIMARY KEY, ' +
    '"lat" DOUBLE PRECISION NOT NULL, "lng" DOUBLE PRECISION NOT NULL, ' +
    '"radiusM" INTEGER NOT NULL DEFAULT 600, "updatedBy" TEXT, ' +
    '"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP); ' +
    'ALTER TABLE "CommunityGeo" ENABLE ROW LEVEL SECURITY;',
  demand:
    'CREATE TABLE IF NOT EXISTS "DemandArea" ("key" TEXT PRIMARY KEY, "label" TEXT NOT NULL, ' +
    '"pincode" TEXT, "locality" TEXT, "city" TEXT, "lat" DOUBLE PRECISION, ' +
    '"lng" DOUBLE PRECISION, "checks" INTEGER NOT NULL DEFAULT 0, ' +
    '"checksByDay" JSONB NOT NULL DEFAULT \'{}\'::jsonb, ' +
    '"firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ' +
    '"lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ' +
    '"status" TEXT NOT NULL DEFAULT \'OPEN\', "note" TEXT, "notifiedAt" TIMESTAMP(3), ' +
    '"updatedBy" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP); ' +
    'ALTER TABLE "DemandArea" ENABLE ROW LEVEL SECURITY; ' +
    'CREATE TABLE IF NOT EXISTS "DemandSubscription" ("id" TEXT PRIMARY KEY, ' +
    '"customerId" TEXT NOT NULL, "name" TEXT, "mobile" TEXT, "areaKey" TEXT NOT NULL, ' +
    '"areaLabel" TEXT NOT NULL, "lat" DOUBLE PRECISION, "lng" DOUBLE PRECISION, "pincode" TEXT, ' +
    '"locality" TEXT, "city" TEXT, "communityName" TEXT, ' +
    '"source" TEXT NOT NULL DEFAULT \'location\', ' +
    '"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ' +
    '"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "notifiedAt" TIMESTAMP(3)); ' +
    'CREATE UNIQUE INDEX IF NOT EXISTS "DemandSubscription_customerId_areaKey_key" ' +
    'ON "DemandSubscription" ("customerId", "areaKey"); ' +
    'CREATE INDEX IF NOT EXISTS "DemandSubscription_areaKey_idx" ' +
    'ON "DemandSubscription" ("areaKey"); ' +
    'ALTER TABLE "DemandSubscription" ENABLE ROW LEVEL SECURITY;',
};

/** Prisma's "that table does not exist" — and a generated client that predates the model. */
export const isMissingTable = (e) =>
  e?.code === 'P2021' || /table\b.*\bdoes not exist/i.test(String(e?.message || ''));

const unreachable = () =>
  Object.assign(new Error('The database is unreachable.'), { code: 'DB_UNAVAILABLE' });

/**
 * The Prisma delegate for a model — or a missing-table error if the generated client has never
 * heard of it (a deploy whose `prisma generate` ran against an older schema). Without this the
 * failure would be a TypeError on `undefined.findMany`, which nothing downstream recognises.
 * @param {string} name
 * @returns {any}
 */
function model(name) {
  const m = /** @type {any} */ (prisma)[name];
  if (!m)
    throw Object.assign(new Error(`The table ${name} does not exist in the generated client.`), {
      code: 'P2021',
    });
  return m;
}

/**
 * Should this write go to a database?
 * @returns {boolean} false in a memory-only process (tests, local dev) — memory is all there is
 * @throws when a database is configured but this process has lost it: refusing is the only honest
 *   answer, since an edit accepted into memory would vanish at the next restart
 */
function writable() {
  if (persistenceOn()) return true;
  if (persistEnabled) throw unreachable();
  return false;
}

/** Read one table, or `null` if it cannot be read. Never throws. */
async function readOrNull(name, label) {
  try {
    return await model(name).findMany();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      `[persist] ${label} table unavailable — create it with the SQL in prisma/schema.prisma.`,
      e?.message,
    );
    return null;
  }
}

const iso = (d) => (d && d.toISOString ? d.toISOString() : d || null);
const date = (s) => (s ? new Date(s) : null);

const rowToArea = (r) => ({
  key: r.key,
  label: r.label,
  pincode: r.pincode ?? null,
  locality: r.locality ?? null,
  city: r.city ?? null,
  lat: r.lat ?? null,
  lng: r.lng ?? null,
  checks: r.checks ?? 0,
  checksByDay: r.checksByDay && typeof r.checksByDay === 'object' ? r.checksByDay : {},
  firstAt: iso(r.firstAt),
  lastAt: iso(r.lastAt),
  status: r.status || 'OPEN',
  note: r.note ?? null,
  notifiedAt: iso(r.notifiedAt),
  updatedBy: r.updatedBy ?? null,
});
const areaToRow = (a) => ({
  label: a.label,
  pincode: a.pincode ?? null,
  locality: a.locality ?? null,
  city: a.city ?? null,
  lat: a.lat ?? null,
  lng: a.lng ?? null,
  checks: a.checks ?? 0,
  checksByDay: a.checksByDay || {},
  firstAt: date(a.firstAt) || new Date(),
  lastAt: date(a.lastAt) || new Date(),
  status: a.status || 'OPEN',
  note: a.note ?? null,
  notifiedAt: date(a.notifiedAt),
  updatedBy: a.updatedBy ?? null,
});

const rowToSubscription = (r) => ({
  id: r.id,
  customerId: r.customerId,
  name: r.name ?? null,
  mobile: r.mobile ?? null,
  areaKey: r.areaKey,
  areaLabel: r.areaLabel,
  lat: r.lat ?? null,
  lng: r.lng ?? null,
  pincode: r.pincode ?? null,
  locality: r.locality ?? null,
  city: r.city ?? null,
  communityName: r.communityName ?? null,
  source: r.source || 'location',
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
  notifiedAt: iso(r.notifiedAt),
});
const subscriptionToRow = (s) => ({
  customerId: s.customerId,
  name: s.name ?? null,
  mobile: s.mobile ?? null,
  areaKey: s.areaKey,
  areaLabel: s.areaLabel,
  lat: s.lat ?? null,
  lng: s.lng ?? null,
  pincode: s.pincode ?? null,
  locality: s.locality ?? null,
  city: s.city ?? null,
  communityName: s.communityName ?? null,
  source: s.source || 'location',
  createdAt: date(s.createdAt) || new Date(),
  notifiedAt: date(s.notifiedAt),
});

export const demandDb = {
  /**
   * Everything, for boot and for "look again". Each collection is `null` when its table is not
   * there. Reads unconditionally — boot hydration calls this while persistence is still switched
   * off — so only call it in a process that has a database.
   * @returns {Promise<{ geo: any[]|null, areas: any[]|null, subscriptions: any[]|null }>}
   */
  async loadAll() {
    const [geo, areas, subscriptions] = await Promise.all([
      readOrNull('communityGeo', 'CommunityGeo'),
      readOrNull('demandArea', 'DemandArea'),
      readOrNull('demandSubscription', 'DemandSubscription'),
    ]);
    return {
      geo,
      areas: areas && areas.map(rowToArea),
      subscriptions: subscriptions && subscriptions.map(rowToSubscription),
    };
  },

  /** @returns {Promise<boolean>} true once stored; false when there is no database to store it in */
  async saveCommunityGeo(communityId, { lat, lng, radiusM }, updatedBy) {
    if (!writable()) return false;
    const row = { lat, lng, radiusM, updatedBy: updatedBy || null };
    await model('communityGeo').upsert({
      where: { communityId },
      create: { communityId, ...row },
      update: row,
    });
    return true;
  },

  /** @returns {Promise<boolean>} */
  async deleteCommunityGeo(communityId) {
    if (!writable()) return false;
    await model('communityGeo').deleteMany({ where: { communityId } });
    return true;
  },

  /** @returns {Promise<boolean>} */
  async saveArea(area) {
    if (!writable()) return false;
    const row = areaToRow(area);
    await model('demandArea').upsert({
      where: { key: area.key },
      create: { key: area.key, ...row },
      update: row,
    });
    return true;
  },

  /** @returns {Promise<boolean>} */
  async saveSubscription(sub) {
    if (!writable()) return false;
    const row = subscriptionToRow(sub);
    await model('demandSubscription').upsert({
      where: { id: sub.id },
      create: { id: sub.id, ...row },
      update: row,
    });
    return true;
  },

  /** @returns {Promise<boolean>} */
  async deleteSubscription(id) {
    if (!writable()) return false;
    await model('demandSubscription').deleteMany({ where: { id } });
    return true;
  },

  /** Erasure: every subscription one person holds. @returns {Promise<boolean>} */
  async deleteSubscriptionsForCustomer(customerId) {
    if (!writable()) return false;
    await model('demandSubscription').deleteMany({ where: { customerId } });
    return true;
  },
};
