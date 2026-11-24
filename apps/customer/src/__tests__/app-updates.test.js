/** Published updates reach customers without waiting for a full restart (24 Nov 2026). */
import { describe, expect, it, vi } from 'vitest';
import {
  APPLY_AFTER_AWAY_MS,
  CHECK_AFTER_AWAY_MS,
  decideOnReturn,
  describeRunningUpdate,
  isSafeToRestart,
  watchAppUpdates,
} from '../lib/appUpdates';
import { friendlyVoiceError } from '../lib/voiceErrors';

function fakeAppState() {
  let fn = null;
  return {
    addEventListener: (_t, f) => {
      fn = f;
      return { remove: () => (fn = null) };
    },
    emit: (s) => fn && fn(s),
    listening: () => fn != null,
  };
}

function fakeUpdates({ available = true, isNew = true, fail = false } = {}) {
  return {
    isEnabled: true,
    checkForUpdateAsync: vi.fn(async () => {
      if (fail) throw new Error('offline');
      return { isAvailable: available };
    }),
    fetchUpdateAsync: vi.fn(async () => ({ isNew })),
    reloadAsync: vi.fn(async () => {}),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('which screens may restart', () => {
  it('home, basket, search, product and profile are safe', () => {
    for (const p of [
      '/',
      '',
      null,
      '/bag',
      '/search',
      '/product/p_tomato',
      '/profile',
      '/orders',
      '/plan',
    ])
      expect(isSafeToRestart(p)).toBe(true);
  });

  it('paying, ordering, forms and sign-in are never interrupted', () => {
    for (const p of [
      '/checkout',
      '/confirm/2026-11-25',
      '/order/abc',
      '/order/success',
      '/wallet',
      '/coupon',
      '/address/new',
      '/change-mobile',
      '/delete-account',
      '/support',
      '/support/t1',
      '/staff/orders',
      '/otp',
      '/phone?x=1',
    ])
      expect(isSafeToRestart(p)).toBe(false);
  });
});

describe('what to do when the app comes back', () => {
  it('applies a downloaded update only after a long break on a safe screen', () => {
    expect(decideOnReturn({ ready: true, awayMs: APPLY_AFTER_AWAY_MS, path: '/' })).toBe('apply');
    expect(decideOnReturn({ ready: true, awayMs: APPLY_AFTER_AWAY_MS - 1, path: '/' })).toBe(
      'none',
    );
    expect(
      decideOnReturn({ ready: true, awayMs: APPLY_AFTER_AWAY_MS * 10, path: '/checkout' }),
    ).toBe('none');
  });

  it('checks again after a minute away when nothing is waiting', () => {
    expect(decideOnReturn({ ready: false, awayMs: CHECK_AFTER_AWAY_MS, path: '/' })).toBe('check');
    expect(decideOnReturn({ ready: false, awayMs: 5_000, path: '/' })).toBe('none');
  });
});

describe('watching for updates', () => {
  it('checks and downloads at start, then switches it on after a long break', async () => {
    const updates = fakeUpdates();
    const app = fakeAppState();
    let t = 0;
    watchAppUpdates({ updates, appState: app, getPath: () => '/', clock: () => t });
    await flush();
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1);
    expect(updates.fetchUpdateAsync).toHaveBeenCalledTimes(1);

    app.emit('background');
    t = APPLY_AFTER_AWAY_MS + 1;
    app.emit('active');
    await flush();
    expect(updates.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it('never restarts mid-payment: returning from a UPI app to checkout keeps the screen', async () => {
    const updates = fakeUpdates();
    const app = fakeAppState();
    let t = 0;
    watchAppUpdates({ updates, appState: app, getPath: () => '/checkout', clock: () => t });
    await flush();
    app.emit('background');
    t = 60 * 60 * 1000;
    app.emit('active');
    await flush();
    expect(updates.reloadAsync).not.toHaveBeenCalled();
  });

  it('a quick switch away and back does not restart', async () => {
    const updates = fakeUpdates();
    const app = fakeAppState();
    let t = 0;
    watchAppUpdates({ updates, appState: app, getPath: () => '/', clock: () => t });
    await flush();
    app.emit('inactive');
    app.emit('background');
    t = 30_000;
    app.emit('active');
    await flush();
    expect(updates.reloadAsync).not.toHaveBeenCalled();
  });

  it('with no update published, nothing restarts and it checks again later', async () => {
    const updates = fakeUpdates({ available: false });
    const app = fakeAppState();
    let t = 0;
    watchAppUpdates({ updates, appState: app, getPath: () => '/', clock: () => t });
    await flush();
    expect(updates.fetchUpdateAsync).not.toHaveBeenCalled();
    app.emit('background');
    t = APPLY_AFTER_AWAY_MS + 1;
    app.emit('active');
    await flush();
    expect(updates.reloadAsync).not.toHaveBeenCalled();
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(2);
  });

  it('offline: the failure is swallowed, the app keeps running, and it retries on return', async () => {
    const updates = fakeUpdates({ fail: true });
    const onError = vi.fn();
    const app = fakeAppState();
    let t = 0;
    watchAppUpdates({ updates, appState: app, getPath: () => '/', clock: () => t, onError });
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    app.emit('background');
    t = CHECK_AFTER_AWAY_MS;
    app.emit('active');
    await flush();
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(2);
    expect(updates.reloadAsync).not.toHaveBeenCalled();
  });

  it('does nothing without expo-updates (Expo Go, tests, development)', () => {
    const app = fakeAppState();
    const stop = watchAppUpdates({ updates: null, appState: app, getPath: () => '/' });
    expect(app.listening()).toBe(false);
    stop();
    watchAppUpdates({ updates: { isEnabled: false }, appState: app, getPath: () => '/' });
    expect(app.listening()).toBe(false);
  });

  it('stops listening when stopped', async () => {
    const app = fakeAppState();
    const stop = watchAppUpdates({ updates: fakeUpdates(), appState: app, getPath: () => '/' });
    expect(app.listening()).toBe(true);
    stop();
    expect(app.listening()).toBe(false);
  });
});

describe('Profile → About version line', () => {
  it('names the running update and its date', () => {
    expect(
      describeRunningUpdate({
        isEnabled: true,
        isEmbeddedLaunch: false,
        updateId: '01a1ff65-61ba-7bbe-b8bc-c4efa8a92ee3',
        createdAt: new Date(2026, 10, 21, 18, 36),
      }),
    ).toBe('update 21 Nov · 01a1ff65');
  });

  it('says "built-in version" when no update has been applied', () => {
    expect(describeRunningUpdate({ isEnabled: true, isEmbeddedLaunch: true, updateId: 'x' })).toBe(
      'built-in version',
    );
    expect(describeRunningUpdate(null)).toBe('built-in version');
  });
});

describe('voice search errors', () => {
  it('a phone call holding the microphone gets a plain sentence, not "Session activation failed"', () => {
    expect(friendlyVoiceError('Session activation failed')).toMatch(/microphone is busy/);
    expect(friendlyVoiceError('network')).toMatch(/internet/);
    expect(friendlyVoiceError('not-allowed')).toMatch(/Settings/);
    expect(friendlyVoiceError(undefined)).toMatch(/Try again/);
  });
});
