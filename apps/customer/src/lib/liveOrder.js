/**
 * Which order is "live", and how far along it is.
 *
 * Pure on purpose — no React Native — so the choice is unit-tested and shared: the home screen's
 * live card and the Android ongoing notification must agree about which order they are showing.
 */

/** The four things a customer waits for, in order. */
export const LIVE_STEPS = ['CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY', 'DELIVERED'];

/** Short labels under the progress track. */
export const STEP_LABELS = ['Confirmed', 'Packed', 'On its way', 'Delivered'];

/** What to say about each moving status: a headline, and what happens next. */
export const LIVE_HEADLINE = {
  CONFIRMED: ['Order confirmed', 'Your produce is booked for harvest.'],
  PACKING: ['Being packed', 'Weighed and bagged for your flat.'],
  OUT_FOR_DELIVERY: ['On its way', 'Heading to your block now.'],
};

/** True while an order is moving — confirmed but not yet delivered, cancelled or refunded. */
export const isLiveStatus = (s) => s === 'CONFIRMED' || s === 'PACKING' || s === 'OUT_FOR_DELIVERY';

/** 1-based step for a status; 0 when the status is not on the track at all. */
export const liveStep = (status) => LIVE_STEPS.indexOf(status) + 1;

/**
 * The order to show. With several moving at once, the one arriving first — and among those on the
 * same day, the one furthest along, because that is the one about to ring the doorbell.
 *
 * @param {{ id: string, status: string, deliveryDate?: string }[] | undefined | null} orders
 * @returns {any | null}
 */
export function pickLiveOrder(orders) {
  const moving = (orders || []).filter((o) => o && isLiveStatus(o.status));
  if (!moving.length) return null;
  return moving.sort(
    (a, b) =>
      String(a.deliveryDate || '').localeCompare(String(b.deliveryDate || '')) ||
      liveStep(b.status) - liveStep(a.status),
  )[0];
}
