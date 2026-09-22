// Server-side OTP delivery via MSG91. We generate & verify the OTP ourselves (see
// customer-store.js); MSG91 only DELIVERS it.
//
// WHATSAPP IS THE DELIVERY CHANNEL. It is billed as a Meta "authentication" conversation — roughly
// a third of the cost of a utility message — and, unlike SMS in India, it needs no TRAI/DLT
// registration at all. That removes the entity/header/template DLT paperwork from the launch path.
//
// The SMS path is kept below and stays dormant unless OTP_FALLBACK_SMS=1. It exists because a
// number that is not on WhatsApp can never receive a code, and that customer cannot sign in at all
// — with no fallback, "not on WhatsApp" means "locked out". Turn it on and a failed WhatsApp send
// retries over SMS (which then does need the DLT template).
//
// SERVER .env only, never EXPO_PUBLIC:
//   MSG91_AUTH_KEY              account auth key (both channels)
//   MSG91_WA_NUMBER             the integrated WhatsApp Business number, e.g. 919876543210
//   MSG91_WA_TEMPLATE_NAME      approved AUTHENTICATION template name
//   MSG91_WA_TEMPLATE_LANG      template language code, e.g. en_US   (default en_US)
//   MSG91_WA_TEMPLATE_NAMESPACE template namespace from the WABA
//   MSG91_WA_TEMPLATE_BUTTON    "0" if the template has no copy-code button (default: it has one)
//   OTP_FALLBACK_SMS=1          also try SMS when WhatsApp delivery fails
//   MSG91_SENDER_ID / MSG91_OTP_TEMPLATE_ID   SMS-only, DLT-registered (fallback path)
const AUTH_KEY = process.env.MSG91_AUTH_KEY;

const WA_NUMBER = process.env.MSG91_WA_NUMBER;
const WA_TEMPLATE = process.env.MSG91_WA_TEMPLATE_NAME;
const WA_LANG = process.env.MSG91_WA_TEMPLATE_LANG || 'en_US';
const WA_NAMESPACE = process.env.MSG91_WA_TEMPLATE_NAMESPACE;
// Meta's authentication templates carry a copy-code button that takes the OTP as its own variable.
// A template without one rejects the extra component, so it is switchable.
const WA_HAS_BUTTON = process.env.MSG91_WA_TEMPLATE_BUTTON !== '0';

const SENDER = process.env.MSG91_SENDER_ID;
const SMS_TEMPLATE = process.env.MSG91_OTP_TEMPLATE_ID;
const SMS_FALLBACK = process.env.OTP_FALLBACK_SMS === '1';

const IS_TEST = process.env.NODE_ENV === 'test';

/** WhatsApp is configured and usable. Off in the test env so the suite stays offline. */
export const whatsappEnabled = !IS_TEST && !!(AUTH_KEY && WA_NUMBER && WA_TEMPLATE);
/** SMS is configured AND explicitly enabled as a fallback. */
export const smsFallbackEnabled = !IS_TEST && SMS_FALLBACK && !!(AUTH_KEY && SMS_TEMPLATE);
/** Any channel at all can deliver a code. */
export const msg91Enabled = whatsappEnabled || smsFallbackEnabled;

/** 10-digit Indian number → the 91-prefixed form both MSG91 APIs expect. */
const toE164 = (mobile) => `91${String(mobile).replace(/\D/g, '').slice(-10)}`;

const deliveryError = (message) =>
  Object.assign(new Error(message || 'OTP delivery failed'), {
    status: 502,
    code: 'OTP_SEND_FAILED',
  });

/**
 * Deliver a login OTP over WhatsApp, using an approved Meta AUTHENTICATION template.
 * The same code fills the body variable and the copy-code button, which is how Meta's
 * authentication templates are shaped.
 * @param {{ mobile: string, otp: string }} args
 */
export async function sendOtpWhatsApp({ mobile, otp }) {
  const components = { body_1: { type: 'text', value: String(otp) } };
  if (WA_HAS_BUTTON) components.button_1 = { subtype: 'url', type: 'text', value: String(otp) };

  const body = {
    integrated_number: WA_NUMBER,
    content_type: 'template',
    payload: {
      messaging_product: 'whatsapp',
      type: 'template',
      template: {
        name: WA_TEMPLATE,
        language: { code: WA_LANG, policy: 'deterministic' },
        ...(WA_NAMESPACE ? { namespace: WA_NAMESPACE } : {}),
        to_and_components: [{ to: [toE164(mobile)], components }],
      },
    },
  };

  const r = await fetch('https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/', {
    method: 'POST',
    headers: { authkey: AUTH_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  // MSG91 answers 200 with an error envelope on template/number problems, so the status alone is
  // not enough to call it delivered.
  if (!r.ok || data?.type === 'error' || data?.status === 'error')
    throw deliveryError(data?.message);
  return data;
}

/**
 * Deliver a login OTP by SMS (fallback only). Needs a DLT-registered sender + an OTP template with
 * an `##OTP##` variable.
 * @param {{ mobile: string, otp: string }} args
 */
export async function sendOtpSms({ mobile, otp }) {
  const url = new URL('https://control.msg91.com/api/v5/otp');
  url.searchParams.set('template_id', SMS_TEMPLATE);
  url.searchParams.set('mobile', toE164(mobile));
  url.searchParams.set('otp', String(otp)); // send OUR code (MSG91 won't generate its own)
  url.searchParams.set('otp_expiry', '5'); // minutes — matches our own 5-min expiry
  if (SENDER) url.searchParams.set('sender', SENDER);

  const r = await fetch(url, {
    method: 'POST',
    headers: { authkey: AUTH_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data?.type === 'error') throw deliveryError(data?.message);
  return data;
}

/**
 * Deliver the code on whichever channel is configured: WhatsApp first, SMS only if it is switched
 * on as a fallback. Throws OTP_SEND_FAILED when every available channel fails.
 * @param {{ mobile: string, otp: string }} args
 * @returns {Promise<{ channel: 'whatsapp'|'sms' }>}
 */
export async function deliverOtp({ mobile, otp }) {
  let firstError;
  if (whatsappEnabled) {
    try {
      await sendOtpWhatsApp({ mobile, otp });
      return { channel: 'whatsapp' };
    } catch (e) {
      firstError = e;
      // eslint-disable-next-line no-console
      console.warn(`[otp] WhatsApp delivery failed: ${e.message}`);
    }
  }
  if (smsFallbackEnabled) {
    await sendOtpSms({ mobile, otp });
    return { channel: 'sms' };
  }
  throw firstError || deliveryError('No OTP delivery channel is configured.');
}
