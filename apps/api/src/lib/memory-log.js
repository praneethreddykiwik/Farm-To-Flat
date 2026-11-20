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
      console.log('[memory]', JSON.stringify(memorySnapshot()));
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
