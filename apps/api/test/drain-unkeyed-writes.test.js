/**
 * The shutdown drain waits for writes that have no record key too, not only the per-record chains
 * (review #15, 21 Nov 2026). Before, a delete or a soft ops write issued just before SIGTERM was not
 * counted, so drainPersistence reported "drained" while it was still in flight.
 */
import { describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
const { drainPersistence, serialize, trackWrite } = await import('../src/persistence.js');

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('shutdown drain covers un-keyed writes', () => {
  it('waits for a tracked write to land before reporting drained', async () => {
    const w = deferred();
    let landed = false;
    trackWrite(w.promise.then(() => (landed = true)));
    setTimeout(() => w.resolve(), 30);
    const r = await drainPersistence(1000);
    expect(landed).toBe(true);
    expect(r).toEqual({ drained: true, pending: 0 });
  });

  it('reports a still-running un-keyed write as pending when the wait runs out', async () => {
    const w = deferred();
    trackWrite(w.promise);
    const r = await drainPersistence(20);
    expect(r).toEqual({ drained: false, pending: 1 });
    w.resolve();
    expect(await drainPersistence(1000)).toEqual({ drained: true, pending: 0 });
  });

  it('waits for keyed and un-keyed writes together, and a failed write still counts as settled', async () => {
    const keyed = deferred();
    const loose = deferred();
    serialize('order:drain-1', () => keyed.promise).catch(() => {});
    trackWrite(loose.promise).catch(() => {});
    setTimeout(() => keyed.resolve(), 10);
    setTimeout(() => loose.reject(new Error('db down')), 20);
    expect(await drainPersistence(1000)).toEqual({ drained: true, pending: 0 });
  });
});
