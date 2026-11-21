/** Two phones on one account: the app re-fetches account data when it returns to the screen. */
import { describe, expect, it, vi } from 'vitest';
import { LIVE_TAGS, shouldRefresh, watchForeground } from '../lib/foregroundRefresh';

function fakeAppState() {
  let fn = null;
  return {
    addEventListener: (_t, f) => {
      fn = f;
      return { remove: () => (fn = null) };
    },
    emit: (s) => fn && fn(s),
  };
}

describe('foreground refresh', () => {
  it('refreshes after the app was away for at least 5 s, not after a blink', () => {
    expect(shouldRefresh(null, 10_000)).toBe(false);
    expect(shouldRefresh(10_000, 12_000)).toBe(false);
    expect(shouldRefresh(10_000, 15_000)).toBe(true);
  });

  it('wires AppState: background → active triggers one refresh', () => {
    const app = fakeAppState();
    let t = 0;
    const refresh = vi.fn();
    const stop = watchForeground(app, refresh, () => t);
    app.emit('background');
    t = 60_000;
    app.emit('active');
    expect(refresh).toHaveBeenCalledTimes(1);
    app.emit('active'); // already active: nothing more
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
  });

  it('refreshes the basket and orders, not the product catalogue', () => {
    expect(LIVE_TAGS).toEqual(expect.arrayContaining(['Cart', 'Orders', 'Wallet']));
    expect(LIVE_TAGS).not.toContain('Catalog');
  });
});
