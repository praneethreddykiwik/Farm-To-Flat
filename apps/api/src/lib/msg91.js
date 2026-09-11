// Server-side SMS OTP delivery via MSG91 (India). We generate & verify the OTP ourselves (see
// customer-store.js); MSG91 only DELIVERS it. Falls back to disabled when the keys/template aren't
// set yet, so local dev and the test suite keep working (dev uses the fixed 123456 code, no SMS).
//
// Requires a DLT-registered sender + an OTP template with an `##OTP##` variable. Put these in the
// SERVER .env only (never EXPO_PUBLIC): MSG91_AUTH_KEY, MSG91_SENDER_ID, MSG91_OTP_TEMPLATE_ID.
const AUTH_KEY = process.env.MSG91_AUTH_KEY;
const SENDER = process.env.MSG91_SENDER_ID;
const TEMPLATE = process.env.MSG91_OTP_TEMPLATE_ID;

// Sender is carried by the DLT template, so the auth key + template id are the minimum to send.
// Off in the test env so the suite stays offline.
export const msg91Enabled = process.env.NODE_ENV !== 'test' && !!(AUTH_KEY && TEMPLATE);

/**
 * Deliver a login OTP by SMS. `mobile` is a 10-digit Indian number; we prefix the 91 country code.
 * Throws (status 502, code OTP_SEND_FAILED) if MSG91 rejects it, so the caller can tell the user.
 * @param {{ mobile: string, otp: string }} args
 */
export async function sendOtpSms({ mobile, otp }) {
  const to = `91${String(mobile).replace(/\D/g, '').slice(-10)}`;
  const url = new URL('https://control.msg91.com/api/v5/otp');
  url.searchParams.set('template_id', TEMPLATE);
  url.searchParams.set('mobile', to);
  url.searchParams.set('otp', String(otp)); // send OUR code (MSG91 won't generate its own)
  url.searchParams.set('otp_expiry', '5'); // minutes — matches our own 5-min expiry
  if (SENDER) url.searchParams.set('sender', SENDER);

  const r = await fetch(url, {
    method: 'POST',
    headers: { authkey: AUTH_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data?.type === 'error') {
    throw Object.assign(new Error(data?.message || 'MSG91 OTP send failed'), {
      status: 502,
      code: 'OTP_SEND_FAILED',
    });
  }
  return data; // { type: 'success', request_id: '...' }
}
