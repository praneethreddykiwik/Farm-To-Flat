/**
 * The shopper's own figure for a product, while it is ahead of what the server has.
 *
 * Tapping a stepper has to feel instant, so the number on screen is the shopper's, not the
 * server's, until the two agree. Where that number lives matters more than it looks:
 *
 * It used to live inside each card. The home grid recycles its cards — the box that showed tomatoes
 * shows beans a scroll later — so a figure held by the card went with the box, not with the
 * product: add something, flick the list, and a product that was never touched showed a quantity.
 * And once a write had been sent, the card took whatever the server said next, including a reply
 * that had left before the write arrived. The figure stepped backwards under the shopper's thumb,
 * and the next tap counted up from the wrong number. Both only happen when someone is moving
 * quickly, which is exactly when they were noticed.
 *
 * So it is kept here, by product:
 *  - one figure per product, shared by every place that product is on screen;
 *  - quick taps wait a moment and go as one request;
 *  - one request at a time per product, so two can never arrive in the wrong order; taps made
 *    while one is on its way are sent, as one, when it comes back;
 *  - after the last write is saved the figure is held a little longer, because a reply older than
 *    the write can still be on its way; then the server's word is taken again.
 *
 * No React in here: the hook in hooks/useCart.js reads it, the tests drive it directly.
 */

/** How long quick taps are gathered before they are sent. */
export const TAP_GATHER_MS = 320;
/** How long a saved figure outlasts its write, to sit out replies that left before it. */
export const SETTLE_MS = 2500;

/**
 * productId -> {
 *   qty: number,            what to show
 *   want: number|null,      a figure not yet sent
 *   io: object,             how to send it and whom to tell (the latest caller's)
 *   sending: boolean,
 *   timer: any, settle: any
 * }
 */
const lines = new Map();
/** productId -> Set<() => void> */
const watchers = new Map();

function tell(id) {
  const set = watchers.get(id);
  if (set) for (const fn of [...set]) fn();
}

/** The shopper's figure for this product, or null when the server's is the one to show. */
export function pendingQty(id) {
  const l = lines.get(id);
  return l ? l.qty : null;
}

/** Be told when {@link pendingQty} for this product may have changed. Returns the unsubscribe. */
export function watchLine(id, fn) {
  let set = watchers.get(id);
  if (!set) watchers.set(id, (set = new Set()));
  set.add(fn);
  return () => {
    set.delete(fn);
    if (!set.size && watchers.get(id) === set) watchers.delete(id);
  };
}

function drop(id) {
  const l = lines.get(id);
  if (!l) return;
  clearTimeout(l.timer);
  clearTimeout(l.settle);
  lines.delete(id);
  tell(id);
}

async function drain(id) {
  const l = lines.get(id);
  if (!l || l.sending) return;
  l.sending = true;
  let failed = false;
  while (l.want !== null) {
    const q = l.want;
    const io = l.io;
    l.want = null;
    try {
      const got = await io.send(q);
      // The server may have settled on a different figure than was asked for (a daily limit, say).
      // Show its figure — unless the shopper has tapped again since, in which case theirs is newer.
      const saved = Number.isFinite(got) ? got : q;
      failed = false;
      if (l.want === null && l.qty !== saved) {
        l.qty = saved;
        tell(id);
      }
      io.onSaved?.(saved);
    } catch (e) {
      // Only what was being sent has failed. Taps made since are still waiting and get their turn.
      failed = l.want === null;
      io.onError?.(e);
    }
  }
  l.sending = false;
  if (failed) {
    // Nothing of the shopper's survived: back to what the server holds.
    drop(id);
    return;
  }
  clearTimeout(l.settle);
  l.settle = setTimeout(() => {
    const cur = lines.get(id);
    if (cur === l && l.want === null && !l.sending) drop(id);
  }, SETTLE_MS);
}

/**
 * The shopper set a quantity.
 * @param {string} id  product id
 * @param {number} qty
 * @param {object} io
 * @param {(qty: number) => Promise<number|void>} io.send  write it; resolves with the figure the
 *   server ended up holding for this product, when it says
 * @param {(saved: number) => void} [io.onSaved]
 * @param {(error: any) => void} [io.onError]
 * @param {number} [io.delay]
 */
export function requestQuantity(id, qty, io) {
  let l = lines.get(id);
  if (!l) {
    l = { qty, want: null, io, sending: false, timer: null, settle: null };
    lines.set(id, l);
  }
  l.qty = qty;
  l.want = qty;
  l.io = io;
  clearTimeout(l.settle);
  clearTimeout(l.timer);
  l.timer = setTimeout(() => drain(id), io.delay ?? TAP_GATHER_MS);
  tell(id);
}

/**
 * Forget every figure that is only being held, not sent or waiting to be. For when the basket has
 * been changed by some other route — a line removed, an order placed — and the server's word is
 * the only one worth showing.
 */
export function forgetSettledLines() {
  for (const [id, l] of [...lines]) if (l.want === null && !l.sending) drop(id);
}

/** Tests only: a clean slate. */
export function resetCartWrites() {
  for (const l of lines.values()) {
    clearTimeout(l.timer);
    clearTimeout(l.settle);
  }
  lines.clear();
  watchers.clear();
}
