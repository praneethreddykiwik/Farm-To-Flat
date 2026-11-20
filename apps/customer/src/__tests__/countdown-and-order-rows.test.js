/** Review #48 (21 Nov 2026): a countdown that keeps time, and the orders tab as list rows. */
import { describe, expect, it } from 'vitest';
import { deadlineFrom, secondsLeft } from '../lib/countdown';
import { orderListRows } from '../lib/liveOrder';

describe('countdown', () => {
  const t0 = 1_763_700_000_000;

  it('reads the clock, so a paused timer does not fall behind', () => {
    const deadline = deadlineFrom(3600, t0);
    expect(secondsLeft(deadline, t0)).toBe(3600);
    // Ten minutes in the background with no ticks at all: the next tick is still right.
    expect(secondsLeft(deadline, t0 + 10 * 60 * 1000)).toBe(3000);
  });

  it('rounds a part second up and never goes below zero', () => {
    const deadline = deadlineFrom(5, t0);
    expect(secondsLeft(deadline, t0 + 4100)).toBe(1);
    expect(secondsLeft(deadline, t0 + 60_000)).toBe(0);
  });

  it('treats a missing or negative snapshot as closed', () => {
    expect(secondsLeft(deadlineFrom(undefined, t0), t0)).toBe(0);
    expect(secondsLeft(deadlineFrom(-30, t0), t0)).toBe(0);
  });
});

describe('orderListRows', () => {
  const o = (id, status) => ({ id, status });

  it('puts moving orders first under their heading, then the rest under "Earlier"', () => {
    const rows = orderListRows([o('a', 'DELIVERED'), o('b', 'PACKING'), o('c', 'CANCELLED')]);
    expect(rows.map((r) => (r.kind === 'label' ? `#${r.text}` : r.key))).toEqual([
      '#On its way',
      'b',
      '#Earlier',
      'a',
      'c',
    ]);
    expect(rows.filter((r) => r.kind === 'order').map((r) => r.index)).toEqual([0, 1, 2]);
  });

  it('has no "Earlier" heading when nothing is moving, and nothing for no orders', () => {
    expect(orderListRows([o('a', 'DELIVERED')]).map((r) => r.kind)).toEqual(['order']);
    expect(orderListRows(undefined)).toEqual([]);
  });

  it('keeps keys unique for a long history', () => {
    const many = Array.from({ length: 400 }, (_, i) =>
      o(`o${i}`, i < 2 ? 'CONFIRMED' : 'DELIVERED'),
    );
    const keys = orderListRows(many).map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
