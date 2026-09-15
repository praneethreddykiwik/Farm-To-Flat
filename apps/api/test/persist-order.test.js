/**
 * Write-through ordering: writes to the same record are applied in call order even when an earlier
 * one is slower; writes to different records still overlap.
 */
import { describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
const { serialize } = await import('../src/persistence.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('persistence serialisation', () => {
  it('same key: a slow first write still lands before a fast second write', async () => {
    const landed = [];
    const a = serialize('order:1', async () => {
      await sleep(40);
      landed.push('create');
    });
    const b = serialize('order:1', async () => {
      landed.push('cancel');
    });
    await Promise.all([a, b]);
    expect(landed).toEqual(['create', 'cancel']);
  });

  it('different keys overlap (no global lock)', async () => {
    const started = [];
    const a = serialize('order:2', async () => {
      started.push('a');
      await sleep(40);
    });
    const b = serialize('order:3', async () => {
      started.push('b');
    });
    await sleep(5);
    expect(started).toEqual(['a', 'b']); // b started while a was still sleeping
    await Promise.all([a, b]);
  });

  it('a failing write does not block the next one on the same key', async () => {
    const landed = [];
    const a = serialize('order:4', async () => {
      throw new Error('db down');
    }).catch(() => landed.push('a-failed'));
    const b = serialize('order:4', async () => {
      landed.push('b');
    });
    await Promise.all([a, b]);
    expect(landed).toEqual(['a-failed', 'b']);
  });
});
