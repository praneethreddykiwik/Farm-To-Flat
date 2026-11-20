/** The simulated payment sheet must never be reachable in a production build (review #46, 21 Nov 2026). */
import { describe, expect, it } from 'vitest';
import { choosePaymentPath, simulatorAllowed } from '../lib/paymentPath';

const withOrder = { razorpayOrderId: 'order_1', keyId: 'rzp_live_x' };
const noOrder = { razorpayOrderId: null };
const prod = { isDev: false, useMocks: false };

describe('choosePaymentPath', () => {
  it('opens the native sheet only with the SDK and a gateway order', () => {
    expect(choosePaymentPath({ intent: withOrder, nativeAvailable: true, ...prod })).toBe('native');
  });

  it('refuses in production without the SDK — never the simulator', () => {
    expect(choosePaymentPath({ intent: withOrder, nativeAvailable: false, ...prod })).toBe(
      'unavailable',
    );
  });

  it('refuses in production when the server minted no gateway order', () => {
    expect(choosePaymentPath({ intent: noOrder, nativeAvailable: true, ...prod })).toBe(
      'unavailable',
    );
    expect(choosePaymentPath({ intent: undefined, nativeAvailable: true, ...prod })).toBe(
      'unavailable',
    );
  });

  it('simulates in development or against the mock server', () => {
    const base = { intent: noOrder, nativeAvailable: false };
    expect(choosePaymentPath({ ...base, isDev: true, useMocks: false })).toBe('simulated');
    expect(choosePaymentPath({ ...base, isDev: false, useMocks: true })).toBe('simulated');
  });

  it('still prefers the real sheet in development when a gateway order exists', () => {
    expect(
      choosePaymentPath({ intent: withOrder, nativeAvailable: true, isDev: true, useMocks: false }),
    ).toBe('native');
  });
});

describe('simulatorAllowed', () => {
  it('is false only for a production bundle on the real API', () => {
    expect(simulatorAllowed(prod)).toBe(false);
    expect(simulatorAllowed({ isDev: true, useMocks: false })).toBe(true);
    expect(simulatorAllowed({ isDev: false, useMocks: true })).toBe(true);
  });
});
