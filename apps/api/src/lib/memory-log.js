/**
 * A periodic log line of how much the process is holding in memory.
 *
 * Everything is loaded from the database at boot and kept in memory for the life of the process,
 * and nothing is evicted. That is fine at today's size, but there was no way to see it growing
 * until the instance ran out of memory (review #16, 21 Nov 2026). One line every 30 minutes —
 * record counts per store plus the process's resident and heap size — makes the trend readable in
 * the Render logs long before it becomes an outage. It only reports; it never drops anything.
 */
import { storeSizes } from '../store.js';
import { customerStoreSizes } from '../customer-store.js';
import { opsSizes } from '../ops-store.js';
import { reportError } from './sentry.js';

/**
 * When to raise the alarm (review #16 follow-up, 21 Nov 2026). Data is never evicted from memory, so
 * the real protection is seeing growth early: an alert to Sentry once the process passes this share
 * of the instance's memory, well before it is killed. MEMORY_LIMIT_MB is the plan's RAM (512 on the
 * $7 Render instance); MEMORY_ALERT_PCT defaults to 70. Matches the "upgrade above 80%" rule.
 */
const LIMIT_MB = Number(process.env.MEMORY_LIMIT_MB) || 512;
const ALERT_PCT = Number(process.env.MEMORY_ALERT_PCT) || 70;
let alerted = false;

/** @returns {boolean} whether this snapshot crossed the alert line (alerts once per process) */
export function checkMemoryPressure(snapshot, limitMb = LIMIT_MB, pct = ALERT_PCT) {
  const used = (snapshot.rssMb / limitMb) * 100;
  if (used < pct || alerted) return false;
  alerted = true;
  reportError(new Error(`memory at ${Math.round(used)}% of ${limitMb} MB — plan an upgrade`), {
    scope: 'memory',
    snapshot,
  });
  return true;
}

const mb = (bytes) => Math.round(bytes / (1024 * 1024));

/** Counts per in-memory store, and the process's memory in MB. */
export function memorySnapshot() {
  const m = process.memoryUsage();
  const ops = opsSizes();
  return {
    rssMb: mb(m.rss),
    heapUsedMb: mb(m.heapUsed),
    store: storeSizes(),
    customers: customerStoreSizes(),
    opsTotal: Object.values(ops).reduce((a, n) => a + n, 0),
    ops,
  };
}

let timer = null;
/** Log once now and then every `everyMs`. Never holds the process open. */
export function startMemoryLog(everyMs = 30 * 60e3) {
  if (timer) return timer;
  const log = () => {
    try {
      // eslint-disable-next-line no-console
      const snap = memorySnapshot();
      console.log('[memory]', JSON.stringify(snap));
      checkMemoryPressure(snap);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[memory] snapshot failed:', e?.message || e);
    }
  };
  log();
  timer = setInterval(log, everyMs);
  timer.unref?.();
  return timer;
}
