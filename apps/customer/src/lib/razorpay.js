/**
 * Razorpay handoff. The official native SDK is used in development/production builds.
 * In Expo Go the native module does not exist, so we fall back to an in-app simulator sheet
 * (src/components/PaymentSimulator) that the checkout screen renders. Never a WebView wrapper.
 *
 * The client result is ADVISORY. The server's webhook is the only thing that moves money.
 */
import { env } from './env';

let RazorpayCheckout = null;
try {
  const mod = /** @type {any} */ (require('react-native-razorpay'));
  RazorpayCheckout = mod?.default ?? mod;
  if (!RazorpayCheckout || typeof RazorpayCheckout.open !== 'function') RazorpayCheckout = null;
} catch {
  RazorpayCheckout = null;
}

/**
 * Use the native SDK only in a real build against the real API. With mocks or in Expo Go the
 * in-app simulator sheet is used instead.
 *
 * This deliberately does NOT look at a key id bundled into the app. It used to, and that made the
 * bundled key load-bearing for something it has no business deciding: whether a real checkout can
 * open at all. The consequence was a trap — `eas.json` still carried `rzp_test_…` long after the
 * server moved to live keys, and anyone tidying that stale value away would have silently dropped
 * production to the simulated sheet. Whether a gateway exists is the server's answer to give, and
 * it gives it by returning a key id on the payment intent.
 */
export const razorpayAvailable = !!RazorpayCheckout && !env.isExpoGo && !env.useMocks;

/**
 * The key id comes from the PAYMENT INTENT, not from this bundle.
 *
 * The server mints the gateway order, so the server is the only thing that knows which Razorpay
 * account it belongs to. Opening checkout with our own bundled key id meant the two could disagree:
 * switch the server to live keys and every installed app would present a TEST key against a LIVE
 * order and fail at the sheet — a release away from being fixable, during the first hour of taking
 * real money. Taking the id from the intent makes going live a server-side change with nothing to
 * ship.
 *
 * There is no fallback to a bundled key, and that is the point. A fallback can only ever fire when
 * the server did not say which account the order belongs to, and guessing wrong means presenting a
 * TEST key against a LIVE order at the sheet — or worse, the reverse. Refusing is recoverable: the
 * screen shows a payment error and the customer tries again. Guessing is not.
 *
 * @param {{ razorpayOrderId: string, keyId?: string, amountPaise: string|number, description: string, contact?: string, name?: string }} intent
 * @returns {Promise<{ razorpay_payment_id: string, razorpay_order_id: string, razorpay_signature: string }>}
 */
export function openRazorpay(intent) {
  if (!razorpayAvailable) {
    return Promise.reject(
      Object.assign(new Error('Razorpay SDK unavailable'), { code: 'SDK_UNAVAILABLE' }),
    );
  }
  if (!intent.keyId) {
    return Promise.reject(
      Object.assign(new Error('Payment intent carried no Razorpay key id'), {
        code: 'NO_GATEWAY_KEY',
      }),
    );
  }
  return RazorpayCheckout.open({
    key: intent.keyId,
    order_id: intent.razorpayOrderId,
    amount: String(intent.amountPaise),
    currency: 'INR',
    name: 'Fooducia',
    description: intent.description,
    prefill: { contact: intent.contact, name: intent.name },
    theme: { color: '#1E7A4C' },
  });
}
