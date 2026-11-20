/**
 * Background timers start only once the boot load has finished, and the process logs how much it
 * holds in memory (review #16, 21 Nov 2026).
 *
 * The boot load needs a real database, which the suite never has, so the ordering is checked in
 * the source of hydrateOnce: every timer start must come after the last load step. The memory
 * snapshot is checked directly.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
const { memorySnapshot } = await import('../src/lib/memory-log.js');

const code = (src) =>
  src
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');

describe('boot timers wait for the load', () => {
  const src = code(readFileSync(new URL('../src/index.js', import.meta.url), 'utf8'));
  const start = src.indexOf('async function hydrateOnce()');
  const body = src.slice(start, src.indexOf('\n}\n', start));

  it('starts the deletion sweep, cut-off reminder and memory log after orders are loaded', () => {
    expect(start).toBeGreaterThan(-1);
    const lastLoad = Math.max(
      body.indexOf('await loadTransactional()'),
      body.indexOf('hydrateCustomerData('),
      body.indexOf('hydrateOrders('),
      body.indexOf('enableOrderPersistence()'),
    );
    expect(lastLoad).toBeGreaterThan(-1);
    for (const timer of ['startDeletionSweep()', 'startCutoffReminders()', 'startMemoryLog()']) {
      const at = body.indexOf(timer);
      expect(at, `${timer} is started in hydrateOnce`).toBeGreaterThan(-1);
      expect(at, `${timer} starts after the load`).toBeGreaterThan(lastLoad);
      // …and only once: no stray early start left behind.
      expect(body.indexOf(timer, at + 1), `${timer} starts once`).toBe(-1);
    }
  });
});

describe('memory snapshot', () => {
  it('reports record counts per store and the process memory, without copying data', async () => {
    // Import the app so the stores hold their test seed.
    await import('../src/index.js');
    const s = memorySnapshot();
    expect(s.rssMb).toBeGreaterThan(0);
    expect(s.heapUsedMb).toBeGreaterThan(0);
    expect(s.store.products).toBeGreaterThan(0);
    expect(typeof s.store.orders).toBe('number');
    expect(typeof s.customers.customers).toBe('number');
    expect(typeof s.customers.sessions).toBe('number');
    expect(s.ops).toHaveProperty('reminder');
    expect(s.opsTotal).toBe(Object.values(s.ops).reduce((a, n) => a + n, 0));
  });
});
