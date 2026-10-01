/**
 * Language must survive an expired session.
 *
 * It is cleared on sign-out deliberately — signing out of a Telugu account and into another should
 * not leave the second person in Telugu. But the SAME action is dispatched when a refresh token is
 * rejected, and placing an order is the heaviest moment in the app for that: one tap refetches
 * Cart, Orders, Wallet, Windows and Me at once. A single 401 in that burst used to drop the reader
 * back into English mid-checkout and delete the stored key, making it permanent.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const removed = [];
vi.mock('../lib/kv', () => ({
  kv: {
    getString: () => null,
    set: () => {},
    remove: (k) => removed.push(k),
  },
  KV_KEYS: { language: 'ui.language' },
}));

const { default: uiReducer, setLanguage } = await import('../features/ui/uiSlice.js');

const signedOut = (reason) => ({
  type: 'auth/signedOut',
  payload: reason ? { reason } : undefined,
});

describe('language across a sign-out', () => {
  beforeEach(() => {
    removed.length = 0;
  });

  it('keeps the chosen language when the session merely expired', () => {
    const chosen = uiReducer(undefined, setLanguage('te'));
    expect(chosen.language).toBe('te');

    const after = uiReducer(chosen, signedOut('expired'));
    expect(after.language).toBe('te');
    expect(removed).toEqual([]); // the stored key survives, so a relaunch is still Telugu
  });

  it('keeps it when the action carries no reason at all', () => {
    const chosen = uiReducer(undefined, setLanguage('te'));
    const after = uiReducer(chosen, signedOut());
    expect(after.language).toBe('te');
    expect(removed).toEqual([]);
  });

  it('still clears it when someone actually signs out', () => {
    const chosen = uiReducer(undefined, setLanguage('te'));
    const after = uiReducer(chosen, signedOut('user'));
    expect(after.language).toBeNull(); // null, not 'en' — the next person is ASKED
    expect(removed).toEqual(['ui.language']);
  });

  it('resets the per-account diet filter either way', () => {
    const picked = uiReducer(undefined, { type: 'ui/setDietPref', payload: 'VEG' });
    for (const reason of ['user', 'expired']) {
      expect(uiReducer(picked, signedOut(reason)).dietPref).toBe(
        uiReducer(undefined, { type: '@@INIT' }).dietPref,
      );
    }
  });
});
