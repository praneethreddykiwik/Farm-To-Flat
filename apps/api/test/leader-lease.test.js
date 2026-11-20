/** Review #14 (21 Nov 2026): only the lease holder runs scheduled jobs; a stopping one gives it up. */
import { describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://fake/never-used';

let holder = null;
let expiresAt = 0;
const queryRawUnsafe = vi.fn(async (_sql, data, me, now) => {
  const d = JSON.parse(data);
  if (holder === null || holder === me || expiresAt < now) {
    holder = me;
    expiresAt = d.expiresAt;
    return [{ holder: me }];
  }
  return [];
});
const executeRawUnsafe = vi.fn(async (_sql, me) => {
  if (holder === me) holder = null;
});
vi.mock('../src/db.js', () => ({
  prisma: { $queryRawUnsafe: queryRawUnsafe, $executeRawUnsafe: executeRawUnsafe },
}));
vi.mock('../src/persistence.js', () => ({
  persistEnabled: true,
  isPersistenceEnabled: () => true,
}));

const L = await import('../src/lib/leader.js');

describe('scheduled-jobs lease', () => {
  it('runs jobs as the only instance until the lease table has answered', () => {
    L.__setLeaderState({ isLeader: false, known: false });
    expect(L.isLeader()).toBe(true);
  });

  it('takes a free lease, and is refused while another instance holds a live one', async () => {
    L.__setLeaderState({ isLeader: false, known: false });
    expect(await L.renewLease(1_000)).toBe(true);
    expect(L.isLeader()).toBe(true);
    // another instance holds it now
    holder = 'someone-else';
    expiresAt = 100_000;
    expect(await L.renewLease(2_000)).toBe(false);
    expect(L.isLeader()).toBe(false);
    // ...until theirs lapses
    expect(await L.renewLease(200_000)).toBe(true);
  });

  it('a shutting-down instance stops running jobs and releases the lease', async () => {
    L.__setLeaderState({ isLeader: true, known: true });
    holder = null;
    await L.renewLease(300_000);
    await L.releaseLeadership();
    expect(L.isLeader()).toBe(false);
    expect(holder).toBeNull();
  });
});
