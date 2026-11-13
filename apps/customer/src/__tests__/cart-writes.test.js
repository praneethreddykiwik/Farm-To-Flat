/**
 * Quick taps on a stepper.
 *
 * What went wrong in the app, and only when someone was moving fast: a tap was undone by a reply
 * from the server that had left before the tap arrived; two writes for one product could land in
 * either order; and because the figure lived in the card and the grid reuses its cards, a product
 * nobody had touched could show another product's quantity after a scroll.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SETTLE_MS,
  TAP_GATHER_MS,
  forgetSettledLines,
  pendingQty,
  requestQuantity,
  resetCartWrites,
  watchLine,
} from '../lib/cartWrites';

/** A server that answers when told to, so a test decides what is "on its way". */
function server() {
  const calls = [];
  const send = (q) =>
    new Promise((resolve, reject) => calls.push({ q, resolve: () => resolve(q), reject }));
  return { calls, send };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetCartWrites();
});
afterEach(() => {
  vi.useRealTimers();
});

const tick = (ms) => vi.advanceTimersByTimeAsync(ms);

describe('tapping a stepper', () => {
  it('shows the new figure at once and writes it a moment later', async () => {
    const s = server();
    requestQuantity('tomato', 1, { send: s.send });
    expect(pendingQty('tomato')).toBe(1);
    expect(s.calls).toHaveLength(0);
    await tick(TAP_GATHER_MS);
    expect(s.calls.map((c) => c.q)).toEqual([1]);
  });

  it('sends five quick taps as one request, for the last figure', async () => {
    const s = server();
    for (let q = 1; q <= 5; q += 1) {
      requestQuantity('tomato', q, { send: s.send });
      await tick(60);
    }
    await tick(TAP_GATHER_MS);
    expect(s.calls.map((c) => c.q)).toEqual([5]);
  });

  it('never has two requests for one product on their way at the same time', async () => {
    const s = server();
    requestQuantity('tomato', 1, { send: s.send });
    await tick(TAP_GATHER_MS);
    // The first is on its way. More taps:
    requestQuantity('tomato', 2, { send: s.send });
    requestQuantity('tomato', 3, { send: s.send });
    await tick(TAP_GATHER_MS * 3);
    expect(s.calls.map((c) => c.q)).toEqual([1]); // still only the one
    expect(pendingQty('tomato')).toBe(3); // and the screen has not gone backwards

    s.calls[0].resolve();
    await tick(0);
    expect(s.calls.map((c) => c.q)).toEqual([1, 3]); // the rest, as one, once it is back
  });

  it('does not let an old reply from the server undo a tap', async () => {
    const s = server();
    requestQuantity('tomato', 2, { send: s.send });
    await tick(TAP_GATHER_MS);
    s.calls[0].resolve();
    await tick(0);
    // Saved. A reply that left before the write could still arrive saying "1": the hook shows
    // pendingQty ?? server, so the shopper's figure has to be held for a while yet.
    expect(pendingQty('tomato')).toBe(2);
    await tick(SETTLE_MS - 1);
    expect(pendingQty('tomato')).toBe(2);
    await tick(1);
    expect(pendingQty('tomato')).toBeNull(); // then the server's word is taken again
  });

  it('keeps holding while the shopper keeps tapping', async () => {
    const s = server();
    requestQuantity('tomato', 1, { send: s.send });
    await tick(TAP_GATHER_MS);
    s.calls[0].resolve();
    await tick(SETTLE_MS - 100);
    requestQuantity('tomato', 2, { send: s.send });
    await tick(200); // past the first hold's end
    expect(pendingQty('tomato')).toBe(2);
  });

  it('shows the figure the server settled on when that is not the one asked for', async () => {
    const send = vi.fn(async () => 3); // asked for 5, a daily limit made it 3
    const onSaved = vi.fn();
    requestQuantity('tomato', 5, { send, onSaved });
    await tick(TAP_GATHER_MS);
    expect(pendingQty('tomato')).toBe(3);
    expect(onSaved).toHaveBeenCalledWith(3);
  });
});

describe('when a write fails', () => {
  it('goes back to what the server holds, and says so', async () => {
    const s = server();
    const onError = vi.fn();
    requestQuantity('tomato', 9, { send: s.send, onError });
    await tick(TAP_GATHER_MS);
    s.calls[0].reject(new Error('Only 5 kg available today.'));
    await tick(0);
    expect(pendingQty('tomato')).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('still sends what was tapped while the failed one was on its way', async () => {
    const s = server();
    const onError = vi.fn();
    requestQuantity('tomato', 9, { send: s.send, onError });
    await tick(TAP_GATHER_MS);
    requestQuantity('tomato', 4, { send: s.send, onError });
    s.calls[0].reject(new Error('no'));
    await tick(0);
    expect(s.calls.map((c) => c.q)).toEqual([9, 4]);
    expect(pendingQty('tomato')).toBe(4);
  });
});

describe('the figure belongs to the product, not to the card showing it', () => {
  it('one product never shows another product’s figure', async () => {
    const s = server();
    requestQuantity('tomato', 2, { send: s.send });
    // The card that showed tomatoes is reused for beans before the write has even been sent.
    expect(pendingQty('beans')).toBeNull();
    expect(pendingQty('tomato')).toBe(2);
    await tick(TAP_GATHER_MS);
    expect(s.calls.map((c) => c.q)).toEqual([2]); // and the tomatoes are still written
  });

  it('two products are written side by side, neither waiting for the other', async () => {
    const s = server();
    requestQuantity('tomato', 1, { send: s.send });
    requestQuantity('beans', 1, { send: s.send });
    await tick(TAP_GATHER_MS);
    expect(s.calls).toHaveLength(2);
  });

  it('tells whoever is showing that product, and only them', async () => {
    const tomato = vi.fn();
    const beans = vi.fn();
    const stop = watchLine('tomato', tomato);
    watchLine('beans', beans);
    requestQuantity('tomato', 1, { send: async () => 1 });
    expect(tomato).toHaveBeenCalled();
    expect(beans).not.toHaveBeenCalled();
    stop();
    tomato.mockClear();
    requestQuantity('tomato', 2, { send: async () => 2 });
    expect(tomato).not.toHaveBeenCalled();
  });
});

describe('when the basket is changed some other way', () => {
  it('lets go of figures that are only being held, not ones still to be written', async () => {
    const s = server();
    requestQuantity('tomato', 1, { send: s.send });
    await tick(TAP_GATHER_MS);
    s.calls[0].resolve();
    await tick(0);
    requestQuantity('beans', 2, { send: s.send }); // waiting to be sent
    forgetSettledLines();
    expect(pendingQty('tomato')).toBeNull();
    expect(pendingQty('beans')).toBe(2);
  });
});
