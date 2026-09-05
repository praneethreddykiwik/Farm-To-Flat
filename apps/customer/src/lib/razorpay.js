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

// Use the native SDK only in a real build, against the real API, with a real key.
// With the mock server or a placeholder key the in-app simulator sheet is used instead.
const keyLooksReal =
  /^rzp_(test|live)_[A-Za-z0-9]{10,}$/.test(env.razorpayKeyId) &&
  !env.razorpayKeyId.includes('xxxx');
export const razorpayAvailable =
  !!RazorpayCheckout && !env.isExpoGo && !env.useMocks && keyLooksReal;

/**
 * @param {{ razorpayOrderId: string, amountPaise: string|number, description: string, contact?: string, name?: string }} intent
 * @returns {Promise<{ razorpay_payment_id: string, razorpay_order_id: string, razorpay_signature: string }>}
 */
export function openRazorpay(intent) {
  if (!razorpayAvailable) {
    return Promise.reject(
      Object.assign(new Error('Razorpay SDK unavailable'), { code: 'SDK_UNAVAILABLE' }),
    );
  }
  return RazorpayCheckout.open({
    key: env.razorpayKeyId,
    order_id: intent.razorpayOrderId,
    amount: String(intent.amountPaise),
    currency: 'INR',
    name: 'Farm to Flat',
    description: intent.description,
    prefill: { contact: intent.contact, name: intent.name },
    theme: { color: '#1E7A4C' },
  });
}
