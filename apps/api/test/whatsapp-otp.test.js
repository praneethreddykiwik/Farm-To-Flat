/**
 * OTP delivery goes over WhatsApp.
 *
 * The request body is pinned here because it is the one thing that cannot be checked without a
 * live MSG91 account and an approved Meta template: a wrong field name fails at runtime, in
 * production, as "the code never arrived". The shape below is MSG91's documented
 * whatsapp-outbound-message/bulk payload for an authentication template.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV = {
  MSG91_AUTH_KEY: 'test-authkey',
  MSG91_WA_NUMBER: '919876543210',
  MSG91_WA_TEMPLATE_NAME: 'f2f_login_otp',
  MSG91_WA_TEMPLATE_LANG: 'en_US',
  MSG91_WA_TEMPLATE_NAMESPACE: 'ns_123',
};

/** Import lib/msg91.js fresh with `env` applied — it reads process.env at module load. */
async function loadWith(env) {
  const saved = { ...process.env };
  Object.assign(process.env, ENV, env);
  process.env.NODE_ENV = 'development'; // the lib disables itself under NODE_ENV=test
  vi.resetModules();
  const mod = await import('../src/lib/msg91.js');
  process.env = saved;
  return mod;
}

let calls;
beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', async (url, init) => {
    calls.push({ url: String(url), init });
    return { ok: true, json: async () => ({ type: 'success' }) };
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('WhatsApp OTP delivery', () => {
  it('posts MSG91’s documented authentication-template payload', async () => {
    const { sendOtpWhatsApp } = await loadWith({});
    await sendOtpWhatsApp({ mobile: '9876500011', otp: '482913' });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/',
    );
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers.authkey).toBe('test-authkey');

    const body = JSON.parse(calls[0].init.body);
    expect(body.integrated_number).toBe('919876543210');
    expect(body.content_type).toBe('template');
    const t = body.payload.template;
    expect(body.payload.messaging_product).toBe('whatsapp');
    expect(t.name).toBe('f2f_login_otp');
    expect(t.language).toEqual({ code: 'en_US', policy: 'deterministic' });
    expect(t.namespace).toBe('ns_123');

    const entry = t.to_and_components[0];
    expect(entry.to).toEqual(['919876500011']); // 91-prefixed
    // Meta authentication templates take the code twice: once in the body, once in the
    // copy-code button.
    expect(entry.components.body_1).toEqual({ type: 'text', value: '482913' });
    expect(entry.components.button_1).toEqual({
      subtype: 'url',
      type: 'text',
      value: '482913',
    });
  });

  it('omits the button component for a template that has none', async () => {
    const { sendOtpWhatsApp } = await loadWith({ MSG91_WA_TEMPLATE_BUTTON: '0' });
    await sendOtpWhatsApp({ mobile: '9876500011', otp: '111222' });
    const entry = JSON.parse(calls[0].init.body).payload.template.to_and_components[0];
    expect(entry.components.body_1.value).toBe('111222');
    expect(entry.components.button_1).toBeUndefined();
  });

  it('treats a 200 carrying an error envelope as a failure, not a delivery', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({ type: 'error', message: 'template not approved' }),
    }));
    const { sendOtpWhatsApp } = await loadWith({});
    await expect(sendOtpWhatsApp({ mobile: '9876500011', otp: '1' })).rejects.toMatchObject({
      code: 'OTP_SEND_FAILED',
    });
  });

  it('does not fall back to SMS unless the fallback is switched on', async () => {
    vi.stubGlobal('fetch', async (url) => {
      calls.push({ url: String(url) });
      return { ok: false, json: async () => ({ message: 'nope' }) };
    });
    const { deliverOtp } = await loadWith({
      MSG91_OTP_TEMPLATE_ID: 'sms_tpl', // configured, but OTP_FALLBACK_SMS is not set
    });
    await expect(deliverOtp({ mobile: '9876500011', otp: '1' })).rejects.toMatchObject({
      code: 'OTP_SEND_FAILED',
    });
    expect(calls.every((c) => c.url.includes('whatsapp'))).toBe(true);
  });

  it('falls back to SMS when WhatsApp fails and the fallback is on', async () => {
    vi.stubGlobal('fetch', async (url) => {
      calls.push({ url: String(url) });
      const isWa = String(url).includes('whatsapp');
      return { ok: !isWa, json: async () => (isWa ? { message: 'no' } : { type: 'success' }) };
    });
    const { deliverOtp } = await loadWith({
      MSG91_OTP_TEMPLATE_ID: 'sms_tpl',
      OTP_FALLBACK_SMS: '1',
    });
    await expect(deliverOtp({ mobile: '9876500011', otp: '424242' })).resolves.toEqual({
      channel: 'sms',
    });
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toContain('control.msg91.com/api/v5/otp');
    expect(calls[1].url).toContain('otp=424242');
  });
});
