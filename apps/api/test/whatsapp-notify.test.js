/**
 * Order and complaint updates over WhatsApp.
 *
 * Two properties matter more than the copy: a notification must never break the thing it is
 * reporting on, and it must stay silent until its template exists. Both are pinned here, because
 * both fail invisibly — a thrown send would surface as a 500 on an order that actually went out,
 * and a missing template would surface as Meta rejecting every message in production.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV = {
  MSG91_AUTH_KEY: 'test-authkey',
  MSG91_WA_NUMBER: '919876543210',
  MSG91_WA_TEMPLATE_NAME: 'f2f_login_otp',
  MSG91_WA_TEMPLATE_DELIVERY: 'ftf_order_on_the_way',
  MSG91_WA_TEMPLATE_COMPLAINT: 'ftf_complaint_update',
};

async function loadWith(env) {
  const saved = { ...process.env };
  Object.assign(process.env, ENV, env);
  process.env.NODE_ENV = 'development'; // the lib disables itself under NODE_ENV=test
  vi.resetModules();
  const msg91 = await import('../src/lib/msg91.js');
  const notify = await import('../src/lib/notify-whatsapp.js');
  process.env = saved;
  return { ...notify, ...msg91 };
}

let calls;
let reply;
beforeEach(() => {
  calls = [];
  reply = { ok: true, json: async () => ({ type: 'success' }) };
  vi.stubGlobal('fetch', async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    if (reply instanceof Error) throw reply;
    return reply;
  });
});
afterEach(() => vi.unstubAllGlobals());

const ORDER = {
  orderNumber: 'F2F-4231',
  status: 'OUT_FOR_DELIVERY',
  deliveryOtp: '8412',
  customerId: 'cus_1',
};
const CUSTOMER = { mobile: '9912341655', name: 'Praneeth Reddy' };

/** The components object of the single send that was made. */
const sentParams = () => calls[0].body.payload.template.to_and_components[0].components;

describe('templateParam', () => {
  it('flattens the newlines an operator types, which Meta rejects outright', async () => {
    const { templateParam } = await loadWith({});
    expect(templateParam('Refunded ₹120.\n\nSorry about that.')).toBe(
      'Refunded ₹120. Sorry about that.',
    );
  });

  it('collapses runs of spaces — more than four is a rejection', async () => {
    const { templateParam } = await loadWith({});
    expect(templateParam('a        b')).toBe('a b');
  });

  it('truncates past Meta’s parameter ceiling instead of being refused', async () => {
    const { templateParam } = await loadWith({});
    const out = templateParam('x'.repeat(2000));
    expect(out.length).toBeLessThanOrEqual(900);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('notifyOrderOnTheWay', () => {
  it('sends the door code, named first, in template order', async () => {
    const { notifyOrderOnTheWay } = await loadWith({});
    notifyOrderOnTheWay(ORDER, CUSTOMER, 'Morning, 6:00 am – 12:00 pm');
    expect(calls).toHaveLength(1);
    const p = sentParams();
    expect(calls[0].body.payload.template.name).toBe('ftf_order_on_the_way');
    expect(p.body_1.value).toBe('Praneeth'); // first name only
    expect(p.body_2.value).toBe('F2F-4231');
    expect(p.body_3.value).toBe('Morning, 6:00 am – 12:00 pm');
    expect(p.body_4.value).toContain('8412');
  });

  it('still reads correctly when the order carries no door code', async () => {
    const { notifyOrderOnTheWay } = await loadWith({});
    notifyOrderOnTheWay({ ...ORDER, deliveryOtp: null }, CUSTOMER, 'today');
    // Never an empty variable: Meta refuses the send, and a template cannot omit one.
    expect(sentParams().body_4.value).toBe('Our delivery partner will hand it over at your door.');
  });

  it('is silent when the template is not configured', async () => {
    const { notifyOrderOnTheWay } = await loadWith({ MSG91_WA_TEMPLATE_DELIVERY: '' });
    notifyOrderOnTheWay(ORDER, CUSTOMER, 'today');
    expect(calls).toHaveLength(0);
  });

  it('swallows a delivery failure — the order already went out', async () => {
    const { notifyOrderOnTheWay } = await loadWith({});
    reply = { ok: false, json: async () => ({ type: 'error', message: 'template not found' }) };
    expect(() => notifyOrderOnTheWay(ORDER, CUSTOMER, 'today')).not.toThrow();
    await new Promise((r) => setTimeout(r, 0)); // let the detached promise settle
  });
});

describe('notifyComplaintResolved', () => {
  it('sends the operator’s own words', async () => {
    const { notifyComplaintResolved } = await loadWith({});
    notifyComplaintResolved(ORDER, { resolution: 'Refunded ₹120 for the tomatoes.' }, CUSTOMER);
    expect(calls[0].body.payload.template.name).toBe('ftf_complaint_update');
    expect(sentParams().body_3.value).toBe('Refunded ₹120 for the tomatoes.');
  });

  it('says nothing when the operator wrote no reason', async () => {
    const { notifyComplaintResolved } = await loadWith({});
    notifyComplaintResolved(ORDER, { resolution: '   ' }, CUSTOMER);
    expect(calls).toHaveLength(0);
  });
});
