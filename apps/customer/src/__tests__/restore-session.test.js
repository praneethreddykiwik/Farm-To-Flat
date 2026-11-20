/**
 * Cold-start session restore (review #41, 21 Nov 2026): a slow network must never sign a stored
 * session out. Only a 401 from the refresh does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RETRY_BACKOFF_MS, SLOW_AFTER_MS, restoreSession } from '../features/auth/restoreSession';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function harness({ token = 'rt-1', replies = [] } = {}) {
  const events = [];
  const queue = [...replies];
  const deps = {
    readToken: vi.fn(async () => token),
    refresh: vi.fn(() => {
      const next = queue.shift();
      return typeof next === 'function' ? next() : Promise.resolve(next);
    }),
    saveToken: vi.fn(async () => {}),
    clearToken: vi.fn(async () => {}),
    onSignedIn: vi.fn(() => events.push('signedIn')),
    onSignedOut: vi.fn(() => events.push('signedOut')),
    onReconnecting: vi.fn(() => events.push('reconnecting')),
    isAlive: () => true,
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
  return { deps, events };
}

const ok = { data: { accessToken: 'at', refreshToken: 'rt-2', customer: { id: 'c1' } } };

describe('restoreSession', () => {
  it('signs out at once when nothing is stored', async () => {
    const { deps, events } = harness({ token: null });
    await expect(restoreSession(deps)).resolves.toBe('signedOut');
    expect(events).toEqual(['signedOut']);
    expect(deps.refresh).not.toHaveBeenCalled();
  });

  it('signs in and saves the rotated token on a quick answer', async () => {
    const { deps, events } = harness({ replies: [ok] });
    await expect(restoreSession(deps)).resolves.toBe('signedIn');
    expect(events).toEqual(['signedIn']);
    expect(deps.saveToken).toHaveBeenCalledWith('rt-2');
  });

  it('clears the token and signs out only on a 401', async () => {
    const { deps, events } = harness({ replies: [{ error: { status: 401 } }] });
    await expect(restoreSession(deps)).resolves.toBe('signedOut');
    expect(deps.clearToken).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['signedOut']);
  });

  it('keeps the session through network errors, 5xx and throws, then signs in', async () => {
    const { deps, events } = harness({
      replies: [
        { error: { status: 0 } },
        { error: { status: 503 } },
        () => Promise.reject(new Error('offline')),
        ok,
      ],
    });
    const done = restoreSession(deps);
    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS.slice(0, 3).reduce((a, b) => a + b, 0));
    await expect(done).resolves.toBe('signedIn');
    expect(events).toEqual(['reconnecting', 'signedIn']);
    expect(deps.clearToken).not.toHaveBeenCalled();
    expect(deps.onSignedOut).not.toHaveBeenCalled();
  });

  it('says reconnecting while a slow attempt is still out, and waits for it rather than abandoning it', async () => {
    let answer;
    const { deps, events } = harness({ replies: [() => new Promise((r) => (answer = r))] });
    const done = restoreSession(deps);
    await vi.advanceTimersByTimeAsync(SLOW_AFTER_MS);
    expect(events).toEqual(['reconnecting']);
    // Long past the old 22 s cut-off: still no sign-out, still the same single request.
    await vi.advanceTimersByTimeAsync(60000);
    expect(deps.onSignedOut).not.toHaveBeenCalled();
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    answer(ok);
    await expect(done).resolves.toBe('signedIn');
    expect(deps.saveToken).toHaveBeenCalledWith('rt-2');
  });

  it('stops quietly when the app goes away', async () => {
    let alive = true;
    const { deps, events } = harness({ replies: [{ error: { status: 0 } }] });
    deps.isAlive = () => alive;
    const done = restoreSession(deps);
    await vi.advanceTimersByTimeAsync(0);
    alive = false;
    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS[0]);
    await expect(done).resolves.toBe('stopped');
    expect(events).toEqual(['reconnecting']);
  });
});
