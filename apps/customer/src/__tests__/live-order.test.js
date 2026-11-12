import { describe, expect, it } from 'vitest';
import { isLiveStatus, liveStep, pickLiveOrder } from '../lib/liveOrder';

const o = (id, status, deliveryDate) => ({ id, status, deliveryDate });

describe('which order is live', () => {
  it('is nothing when there are no orders, or none is moving', () => {
    expect(pickLiveOrder(undefined)).toBeNull();
    expect(pickLiveOrder([])).toBeNull();
    expect(
      pickLiveOrder([o('a', 'DELIVERED', '2026-11-12'), o('b', 'CANCELLED', '2026-11-14')]),
    ).toBeNull();
  });

  it('ignores an order that is still waiting for payment', () => {
    // Not confirmed means not ours to harvest yet — showing it as "on its way" would be a lie.
    expect(pickLiveOrder([o('a', 'PENDING_PAYMENT', '2026-11-14')])).toBeNull();
  });

  it('picks the order arriving first', () => {
    const got = pickLiveOrder([
      o('later', 'CONFIRMED', '2026-11-16'),
      o('sooner', 'CONFIRMED', '2026-11-14'),
      o('done', 'DELIVERED', '2026-11-12'),
    ]);
    expect(got.id).toBe('sooner');
  });

  it('on the same day, picks the one furthest along', () => {
    const got = pickLiveOrder([
      o('booked', 'CONFIRMED', '2026-11-14'),
      o('rolling', 'OUT_FOR_DELIVERY', '2026-11-14'),
      o('packing', 'PACKING', '2026-11-14'),
    ]);
    expect(got.id).toBe('rolling');
  });

  it('does not reorder the list it was given', () => {
    const orders = [o('b', 'CONFIRMED', '2026-11-16'), o('a', 'CONFIRMED', '2026-11-14')];
    pickLiveOrder(orders);
    expect(orders.map((x) => x.id)).toEqual(['b', 'a']);
  });
});

describe('where an order is on the track', () => {
  it('numbers the four stops from one', () => {
    expect(liveStep('CONFIRMED')).toBe(1);
    expect(liveStep('PACKING')).toBe(2);
    expect(liveStep('OUT_FOR_DELIVERY')).toBe(3);
    expect(liveStep('DELIVERED')).toBe(4);
  });

  it('is zero for a status that is not on the track', () => {
    expect(liveStep('CANCELLED')).toBe(0);
    expect(liveStep(undefined)).toBe(0);
  });

  it('counts only moving orders as live', () => {
    expect(['CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY'].every(isLiveStatus)).toBe(true);
    expect(['DELIVERED', 'CANCELLED', 'REFUNDED', 'PENDING_PAYMENT'].some(isLiveStatus)).toBe(
      false,
    );
  });
});
