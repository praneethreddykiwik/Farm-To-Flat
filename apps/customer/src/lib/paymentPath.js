/**
 * Which way a payment intent is taken: the native Razorpay sheet, the in-app simulator, or not at
 * all.
 *
 * Review #46 (21 Nov 2026): the simulated sheet ("Pay with UPI (succeeds)") was reachable in a
 * production build. Checkout and add-items already gated it, but the wallet top-up and the
 * "confirm tomorrow" screen fell through to it whenever the native SDK was missing, and the wallet
 * did not even check that the gateway had issued an order. One rule for all four screens now:
 *
 *  - native: the SDK is linked AND the server minted a gateway order (razorpayOrderId).
 *  - simulated: only in a development bundle or against the mock server.
 *  - unavailable: anything else — the screen shows an error, never a fake success.
 *
 * Pure, so the rule can be tested without React Native.
 *
 * @param {{ intent: any, nativeAvailable: boolean, isDev: boolean, useMocks: boolean }} p
 * @returns {'native'|'simulated'|'unavailable'}
 */
export function choosePaymentPath({ intent, nativeAvailable, isDev, useMocks }) {
  if (nativeAvailable && intent?.razorpayOrderId) return 'native';
  if (isDev || useMocks) return 'simulated';
  return 'unavailable';
}

/** @param {{ isDev: boolean, useMocks: boolean }} p */
export function simulatorAllowed({ isDev, useMocks }) {
  return !!(isDev || useMocks);
}
