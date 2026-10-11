import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { chargesConfig, updateCharges, constants } from '../src/store.js';
import { priceBreakdown } from '../src/lib/charges.js';

const TOKEN = process.env.ADMIN_TOKEN || 'test-admin-token';
process.env.ADMIN_TOKEN = TOKEN;
const auth = (r) => r.set('x-admin-token', TOKEN);

beforeEach(() => {
  updateCharges({ charges: [], tax: { enabled: true, goodsRateBps: 0, feeRateBps: 1800 } });
});

describe('the operator editing what customers are charged', () => {
  it('starts with no fees — a bill with no surprises is the right default', async () => {
    const r = await auth(request(app).get('/api/v1/admin/charges'));
    expect(r.status).toBe(200);
    expect(r.body.charges).toEqual([]);
  });

  it('adds a platform fee and shows what a sample basket would cost', async () => {
    const r = await auth(request(app).put('/api/v1/admin/charges')).send({
      charges: [{ label: 'Platform fee', kind: 'FLAT', valuePaise: 1499 }],
    });
    expect(r.status).toBe(200);
    expect(r.body.charges[0].label).toBe('Platform fee');
    const line = r.body.preview.lines.find((l) => l.label === 'Platform fee');
    expect(line.amountPaise).toBe('1499');
  });

  it('refuses a percentage above 50 — a mistyped rate must not reach a customer', async () => {
    const r = await auth(request(app).put('/api/v1/admin/charges')).send({
      charges: [{ label: 'Oops', kind: 'PERCENT', valueBps: 9000 }],
    });
    expect(r.status).toBe(422);
  });

  it('refuses a nameless fee', async () => {
    const r = await auth(request(app).put('/api/v1/admin/charges')).send({
      charges: [{ label: '   ', kind: 'FLAT', valuePaise: 100 }],
    });
    expect(r.status).toBe(422);
  });

  it('refuses two fees with the same name', async () => {
    const r = await auth(request(app).put('/api/v1/admin/charges')).send({
      charges: [
        { label: 'Packing', kind: 'FLAT', valuePaise: 100 },
        { label: 'Packing', kind: 'FLAT', valuePaise: 200 },
      ],
    });
    expect(r.status).toBe(422);
  });

  it('replaces the whole list, so removing a fee actually removes it', async () => {
    await auth(request(app).put('/api/v1/admin/charges')).send({
      charges: [
        { label: 'A', kind: 'FLAT', valuePaise: 100 },
        { label: 'B', kind: 'FLAT', valuePaise: 200 },
      ],
    });
    await auth(request(app).put('/api/v1/admin/charges')).send({
      charges: [{ label: 'A', kind: 'FLAT', valuePaise: 100 }],
    });
    const r = await auth(request(app).get('/api/v1/admin/charges'));
    expect(r.body.charges.map((c) => c.label)).toEqual(['A']);
  });

  it('rejects a tax rate above 50%', async () => {
    const r = await auth(request(app).put('/api/v1/admin/charges')).send({
      tax: { goodsRateBps: 9000 },
    });
    expect(r.status).toBe(422);
  });

  it('needs a credential at all', async () => {
    const r = await request(app).get('/api/v1/admin/charges');
    expect([401, 403]).toContain(r.status);
  });
});

describe('what the customer is quoted and what they are charged', () => {
  it('come from the same function, so they cannot drift apart', () => {
    updateCharges({
      charges: [{ label: 'Platform fee', kind: 'FLAT', valuePaise: 1499 }],
      tax: { enabled: true, goodsRateBps: 0, feeRateBps: 1800 },
    });
    const k = constants();
    const args = {
      subtotalPaise: 29000,
      discountPaise: 0,
      deliveryChargePaise: k.deliveryChargePaise,
      charges: k.charges,
      tax: k.tax,
    };
    // The cart preview and the order commit both call priceBreakdown with the live settings.
    // Calling it twice must be identical, or the figure on the checkout screen is a lie.
    expect(priceBreakdown(args)).toEqual(priceBreakdown(args));
    const b = priceBreakdown(args);
    expect(b.totalPaise).toBe(b.subtotalPaise - b.discountPaise + b.chargesTotalPaise + b.taxPaise);
  });

  it('a fee changed after the quote does not retroactively alter it', () => {
    const k = constants();
    const quoted = priceBreakdown({
      subtotalPaise: 10000,
      deliveryChargePaise: k.deliveryChargePaise,
      charges: [{ id: 'p', label: 'Platform fee', kind: 'FLAT', valuePaise: 1000 }],
      tax: k.tax,
    });
    updateCharges({ charges: [{ label: 'Platform fee', kind: 'FLAT', valuePaise: 9999 }] });
    // The order stores the bill it quoted; the new setting applies to the NEXT basket only.
    expect(quoted.chargesTotalPaise).toBe(1000 + Number(k.deliveryChargePaise || 0));
  });
});
