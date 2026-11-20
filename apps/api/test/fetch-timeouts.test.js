/**
 * Expo push and MSG91 calls carry an 8 s timeout, and a timed-out call is handled like any other
 * failed send (review #18, 21 Nov 2026).
 *
 * Waiting a real 8 s would slow the suite, so AbortSignal.timeout is spied on: the test checks it is
 * asked for 8000 ms, and hands back an already-expired signal so the fetch stub fails the way a hung
 * connection would once the limit is hit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV = {
  MSG91_AUTH_KEY: 'test-authkey',
  MSG91_WA_NUMBER: '919876543210',
  MSG91_WA_TEMPLATE_NAME: 'f2f_login_otp',
};

async function loadMsg91() {
  const saved = { ...process.env };
  Object.assign(process.env, ENV);
  process.env.NODE_ENV = 'development'; // the lib disables itself under NODE_ENV=test
  vi.resetModules();
  const mod = await import('../src/lib/msg91.js');
  process.env = saved;
  return mod;
}

let calls;
let timeoutSpy;
beforeEach(() => {
  calls = [];
  timeoutSpy = vi
    .spyOn(AbortSignal, 'timeout')
    .mockImplementation(() =>
      AbortSignal.abort(new DOMException('The operation timed out.', 'TimeoutError')),
    );
  // A fetch that only ever ends by its signal firing — i.e. a connection that hangs.
  vi.stubGlobal('fetch', async (url, init) => {
    calls.push({ url: String(url), init });
    if (init?.signal?.aborted) throw init.signal.reason;
    return new Promise(() => {});
  });
});
afterEach(() => {
  timeoutSpy.mockRestore();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('outbound call timeouts', () => {
  it('Expo push gives up after 8 s and the failure is swallowed, not thrown', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sendExpoPush, EXPO_PUSH_TIMEOUT_MS } = await import('../src/lib/push.js');
    expect(EXPO_PUSH_TIMEOUT_MS).toBe(8000);
    await expect(
      sendExpoPush(['ExponentPushToken[abc]'], { title: 't', body: 'b' }),
    ).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(timeoutSpy).toHaveBeenCalledWith(8000);
  });

  it('MSG91 WhatsApp OTP gives up after 8 s and deliverOtp reports it as a failed send', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { deliverOtp, MSG91_TIMEOUT_MS } = await loadMsg91();
    expect(MSG91_TIMEOUT_MS).toBe(8000);
    await expect(deliverOtp({ mobile: '9876500011', otp: '482913' })).rejects.toMatchObject({
      name: 'TimeoutError',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(timeoutSpy).toHaveBeenCalledWith(8000);
  });

  it('MSG91 order templates carry the same timeout', async () => {
    const { sendTemplate } = await loadMsg91();
    await expect(
      sendTemplate({ mobile: '9876500011', template: 'f2f_order_placed', params: ['A'] }),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(timeoutSpy).toHaveBeenCalledWith(8000);
  });
});
