/**
 * The operating records the business asked for in the 17 Nov 2026 review — one table, many kinds.
 *
 *   promoter       a person at a community stall, and the code that credits them with an order
 *   attribution    how a customer first heard of us, and who (promoter / neighbour) brought them
 *   orderAttr      the promoter code entered on one particular order
 *   referral       "my neighbour invited me": who referred whom, and whether the reward was paid
 *   refCode        a customer's own invite code → the customer it belongs to
 *   waitlist       a community we do not serve yet but plan to — pre-loaded, or asked for by a customer
 *   waitlistJoin   one customer waiting for one waitlist community
 *   review         a customer's rating of a delivered order, and our reply
 *   expense        a business cost that is not produce: transport, fuel, salaries, hosting, marketing…
 *   wastage        for one product on one delivery day: how much of the buffer was used, how much thrown
 *   communityMeta  per-community numbers that have no column of their own (orders it can take a morning)
 *   delay          why a late delivery was late
 *   reminder       when a "order before the cut-off" reminder went out, so its effect can be measured
 *   settings       small documents of switches: referral reward, waitlist threshold, tax rate
 *
 * ONE generic table rather than a dozen, because this project creates tables by hand on the
 * production database (no migrations run on deploy) and every new table is a step the owner has to
 * take before a feature works. A missing table must never stop the shop opening, so loading it is
 * caught and reported as "not set up"; the admin console then shows the single statement to run.
 *
 * Writes from the console are DURABLE — awaited, and they throw — for the same reason as
 * demand-db.js: an operator who saves an expense has been told it is saved. Writes made on a
 * customer's path (recording where an order came from) are SOFT: a reporting table must never be
 * the reason someone could not buy their vegetables. They are kept in memory and retried once.
 */
import { prisma } from './db.js';
import { persistEnabled, persistenceOn } from './persistence.js';
import { fail } from './http.js';

export const OPS_KINDS = [
  'promoter',
  'attribution',
  'orderAttr',
  'referral',
  'refCode',
  'waitlist',
  'waitlistJoin',
  'review',
  'expense',
  'wastage',
  'communityMeta',
  'delay',
  'reminder',
  'settings',
];

/**
 * Word for word what the operator is told to run. `IF NOT EXISTS`: safe to run twice. Row-level
 * security ON with no policy = nobody but the database owner (the API) can read it — the public
 * REST endpoint Supabase puts in front of every table sees nothing.
 */
export const OPS_SETUP_SQL =
  'CREATE TABLE IF NOT EXISTS "OpsRecord" ("kind" TEXT NOT NULL, "id" TEXT NOT NULL, ' +
  '"data" JSONB NOT NULL DEFAULT \'{}\'::jsonb, ' +
  '"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ' +
  '"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ' +
  'PRIMARY KEY ("kind", "id")); ' +
  'ALTER TABLE "OpsRecord" ENABLE ROW LEVEL SECURITY;';

/** kind → (id → record). Records are plain objects; `id` is always set on them. */
const mem = new Map(OPS_KINDS.map((k) => [k, new Map()]));

/** 'memory' (no database configured), 'ok', or 'missing' (database there, table not created yet). */
let state = persistEnabled ? 'missing' : 'memory';

const isMissingTable = (e) =>
  e?.code === 'P2021' || /table\b.*\bdoes not exist/i.test(String(e?.message || ''));

const delegate = () => {
  const m = /** @type {any} */ (prisma).opsRecord;
  if (!m)
    throw Object.assign(new Error('OpsRecord is not in the generated client.'), { code: 'P2021' });
  return m;
};

const assertKind = (kind) => {
  if (!mem.has(kind)) throw new Error(`ops-store: unknown kind ${kind}`);
};

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

/** Load every record at boot. Never throws: a missing table leaves the store empty and 'missing'. */
export async function loadOps() {
  if (!persistEnabled) return;
  try {
    const rows = await delegate().findMany();
    for (const m of mem.values()) m.clear();
    for (const r of rows) {
      if (!mem.has(r.kind)) continue; // a kind a newer deploy wrote; ignore rather than crash
      mem.get(r.kind).set(r.id, { ...(r.data || {}), id: r.id });
    }
    state = 'ok';
  } catch (e) {
    state = 'missing';
    // eslint-disable-next-line no-console
    console.error(
      '[ops] OpsRecord table unavailable — run OPS_SETUP_SQL (see admin console).',
      e?.message,
    );
  }
}

/** Is the table there NOW? Re-checked when the console asks, so creating it needs no restart. */
export async function opsStatus() {
  if (state === 'missing' && persistEnabled && persistenceOn()) await loadOps();
  return {
    ready: state !== 'missing',
    mode: state,
    sql: state === 'missing' ? OPS_SETUP_SQL : null,
  };
}

/**
 * Is the table there? While it is missing this also nudges a re-check (at most once a minute, in
 * the background), so the owner creating the table takes effect without a restart and without
 * anyone having to open an admin page first. The answer for THIS call is still the current state.
 */
export const opsReady = () => {
  if (state === 'missing') recheckSoon();
  return state !== 'missing';
};

const RECHECK_MS = 60_000;
let lastRecheck = 0;
let rechecking = false;
function recheckSoon() {
  if (!persistEnabled || rechecking || Date.now() - lastRecheck < RECHECK_MS) return;
  lastRecheck = Date.now();
  rechecking = true;
  Promise.resolve()
    .then(() => (persistenceOn() ? loadOps() : null))
    .catch(() => {})
    .finally(() => {
      rechecking = false;
    });
}

/**
 * Keep looking for the table every five minutes while it is missing. Started once at boot; the
 * timer stops itself once the table is found and never holds the process open.
 */
let recheckTimer = null;
export function startOpsRecheck(everyMs = 5 * 60_000) {
  if (!persistEnabled || state !== 'missing' || recheckTimer) return recheckTimer;
  recheckTimer = setInterval(() => {
    if (state !== 'missing') {
      clearInterval(recheckTimer);
      recheckTimer = null;
      return;
    }
    recheckSoon();
  }, everyMs);
  recheckTimer.unref?.();
  return recheckTimer;
}

const setupNeeded = () =>
  fail(
    503,
    'SETUP_NEEDED',
    'This needs a one-time database step before it can save. Run the SQL shown at the top of this page in Supabase.',
    { sql: OPS_SETUP_SQL },
  );

async function writeRow(kind, id, data) {
  if (state === 'memory') return;
  if (!persistenceOn())
    throw fail(503, 'DB_UNAVAILABLE', 'The database is unreachable. Try again shortly.');
  try {
    const { id: _drop, ...body } = data;
    await delegate().upsert({
      where: { kind_id: { kind, id } },
      create: { kind, id, data: body },
      update: { data: body },
    });
    state = 'ok';
  } catch (e) {
    if (isMissingTable(e)) {
      state = 'missing';
      throw setupNeeded();
    }
    throw e;
  }
}

async function deleteRow(kind, id) {
  if (state === 'memory') return;
  if (!persistenceOn())
    throw fail(503, 'DB_UNAVAILABLE', 'The database is unreachable. Try again shortly.');
  try {
    await delegate().deleteMany({ where: { kind, id } });
  } catch (e) {
    if (isMissingTable(e)) {
      state = 'missing';
      throw setupNeeded();
    }
    throw e;
  }
}

/** Every record of a kind (copies). */
export function listOps(kind) {
  assertKind(kind);
  return [...mem.get(kind).values()].map(clone);
}

/** One record, or null. */
export function getOps(kind, id) {
  assertKind(kind);
  const r = mem.get(kind).get(String(id));
  return r ? clone(r) : null;
}

/**
 * Save a record durably: the database first, then memory. Throws SETUP_NEEDED (503) when the
 * table has not been created, so the console can say exactly what to do.
 * @param {string} kind
 * @param {string} id
 * @param {object} data
 */
export async function putOps(kind, id, data) {
  assertKind(kind);
  const rec = { ...clone(data), id: String(id) };
  if (state === 'missing') {
    // One more look: the owner may have just created it.
    await opsStatus();
    if (state === 'missing') throw setupNeeded();
  }
  await writeRow(kind, String(id), rec);
  mem.get(kind).set(String(id), rec);
  return clone(rec);
}

/**
 * Save without ever failing the caller — for the customer's path. Memory is updated at once; the
 * database write is attempted and, if it fails, logged (the record still counts until a restart).
 */
export function putOpsSoft(kind, id, data) {
  assertKind(kind);
  const rec = { ...clone(data), id: String(id) };
  mem.get(kind).set(String(id), rec);
  if (state !== 'memory')
    writeRow(kind, String(id), rec).catch((e) =>
      // eslint-disable-next-line no-console
      console.error(`[ops] soft write ${kind}/${id} not saved:`, e?.message || e),
    );
  return clone(rec);
}

/** Delete durably. Returns true when something was there. */
export async function removeOps(kind, id) {
  assertKind(kind);
  const had = mem.get(kind).has(String(id));
  if (state === 'missing') throw setupNeeded();
  await deleteRow(kind, String(id));
  mem.get(kind).delete(String(id));
  return had;
}

/** Test helper: forget everything. */
export function __resetOps() {
  for (const m of mem.values()) m.clear();
  state = persistEnabled ? 'missing' : 'memory';
}

// ── settings documents, with their defaults ─────────────────────────────────

/** What each settings document holds when nobody has changed it. */
export const SETTINGS_DEFAULTS = {
  growth: {
    // ₹30 to the neighbour who invited, once the new customer's first order is delivered.
    referralEnabled: true,
    referrerRewardPaise: 3000,
    // Optional welcome credit for the person who was invited. Off until the business decides.
    refereeRewardPaise: 0,
    // A waitlist community "opens" for planning when this many households are waiting.
    waitlistOpenAt: 20,
    // Ask "How did you hear about us?" before the first order.
    askHeardFrom: true,
  },
  finance: {
    // Estimated income tax on profit, for the "after tax" line. An estimate, not tax advice.
    incomeTaxPct: 25,
  },
};

export function getSettings(name) {
  const base = SETTINGS_DEFAULTS[name] || {};
  const saved = getOps('settings', name) || {};
  const { id: _id, ...rest } = saved;
  return { ...base, ...rest };
}

export async function saveSettings(name, patch) {
  const next = { ...getSettings(name), ...patch };
  await putOps('settings', name, next);
  return next;
}
