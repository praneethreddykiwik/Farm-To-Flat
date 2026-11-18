/**
 * The OpsRecord table is created by hand on production. When the owner creates it after the server
 * has started, the server must notice on its own — no restart, no admin page needing to be opened.
 */
import { describe, expect, it, vi } from 'vitest';

let tableExists = false;
vi.mock('../src/db.js', () => ({
  prisma: {
    opsRecord: {
      findMany: vi.fn(async () => {
        if (!tableExists)
          throw Object.assign(new Error('The table `OpsRecord` does not exist'), { code: 'P2021' });
        return [{ kind: 'settings', id: 'growth', data: { referrerRewardPaise: 4000 } }];
      }),
    },
  },
}));
vi.mock('../src/persistence.js', () => ({ persistEnabled: true, persistenceOn: () => true }));

const ops = await import('../src/ops-store.js');

describe('OpsRecord appears after boot', () => {
  it('is reported missing, then found by the background re-check', async () => {
    await ops.loadOps();
    expect(ops.opsReady()).toBe(false);

    tableExists = true; // the owner runs the SQL
    vi.useFakeTimers();
    const t = ops.startOpsRecheck(1000);
    expect(t).toBeTruthy();
    expect(ops.startOpsRecheck(1000)).toBe(t); // a second boot pass does not start a second timer
    vi.setSystemTime(Date.now() + 120_000); // past the once-a-minute throttle
    await vi.advanceTimersByTimeAsync(1000);
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 10));

    expect(ops.opsReady()).toBe(true);
    expect(ops.getSettings('growth').referrerRewardPaise).toBe(4000);
  });
});
