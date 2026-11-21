/**
 * Review #12 (21 Nov 2026): a database write that fails is retried and kept in order, never dropped
 * silently. Tested against the write-through wrapper with persistence switched on and a fake Prisma.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://fake/never-used';

const calls = [];
let failuresLeft = 0;
let failWith = () => Object.assign(new Error('Can’t reach database server'), { code: 'P1001' });
const upsert = vi.fn(async ({ create }) => {
  if (failuresLeft > 0) {
    failuresLeft -= 1;
    throw failWith();
  }
  calls.push(create.status);
});
vi.mock('../src/db.js', () => ({
  prisma: new Proxy({}, { get: () => ({ upsert, deleteMany: upsert, create: upsert }) }),
}));
vi.mock('../src/lib/sentry.js', () => ({ reportError: vi.fn(), sentryEnabled: false }));

const P = await import('../src/persistence.js');
P.enablePersistence('test');

const pay = (status) => ({
  id: 'pay_retry1',
  customerId: 'c',
  purpose: 'ORDER',
  amountPaise: 100,
  status,
});

beforeEach(() => {
  calls.length = 0;
  failuresLeft = 0;
});

describe('failed writes', () => {
  it('a blip is retried straight away and the row lands', async () => {
    failuresLeft = 1;
    await P.persist.paymentUpsert(pay('CREATED'));
    expect(calls).toEqual(['CREATED']);
    expect(P.writeBacklog().pending).toBe(0);
  });

  it('a longer outage parks the write, keeps later writes in order, and replays them', async () => {
    failuresLeft = 100;
    await P.persist.paymentUpsert(pay('CREATED'));
    failuresLeft = 0;
    // the database is back, but this record still has a parked write: the newer one must queue
    await P.persist.paymentUpsert(pay('CAPTURED'));
    expect(calls).toEqual([]);
    expect(P.writeBacklog().pending).toBe(2);
    await P.retryParkedWrites();
    expect(calls).toEqual(['CREATED', 'CAPTURED']); // oldest first: the newest row wins
    expect(P.writeBacklog().pending).toBe(0);
    expect(P.writeBacklog().recovered).toBeGreaterThanOrEqual(2);
  });

  it('an error retrying cannot fix is reported and dropped, not retried forever', async () => {
    const before = P.writeBacklog().dropped;
    failuresLeft = 1;
    const prev = failWith;
    failWith = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    await P.persist.paymentUpsert(pay('CREATED'));
    failWith = prev;
    expect(P.writeBacklog().pending).toBe(0);
    expect(P.writeBacklog().dropped).toBe(before + 1);
  });
});
