/**
 * A promoter's QR, end to end through the HTTP API: the code is created, its QR page is opened, the
 * app is installed from it, and an order is placed. And the iPhone path, where the code is typed.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const { updatePaymentSettings } = await import('../src/store.js');
const { goUrl, playUrlFor, readTag } = await import('../../admin/src/lib/storeLinks.js');
const { parseReferrer } = await import('../src/routes/growth.js');

const A = '/api/v1/admin';
const auth = (t) => ({ Authorization: `Bearer ${t}` });
let seq = 0;

async function shopper() {
  const mobile = `93373${String(++seq).padStart(5, '0')}`;
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  const token = v.body.accessToken;
  const { body: c } = await request(app).get('/api/v1/communities');
  const com = c.communities[0];
  const a = await request(app)
    .post('/api/v1/addresses')
    .set(auth(token))
    .send({ communityId: com.id, block: com.blocks[0], flat: `${100 + seq}`, floor: '1' });
  return { token, addressId: a.body.address.id };
}
async function order(ctx, extra = {}) {
  const { body: cat } = await request(app).get(`${A}/products`);
  for (const p of cat.products.filter((x) => (x.availability || 'AVAILABLE') === 'AVAILABLE')) {
    await request(app)
      .put('/api/v1/cart/items')
      .set(auth(ctx.token))
      .send({ productId: p.id, quantity: 3 });
    const cart = await request(app).get('/api/v1/cart').set(auth(ctx.token));
    if (cart.body.cart?.meetsMinimum) break;
  }
  const w = await request(app)
    .get(`/api/v1/delivery-windows?addressId=${ctx.addressId}`)
    .set(auth(ctx.token));
  const win = w.body.windows.find((x) => x.isOpen);
  return request(app)
    .post('/api/v1/orders')
    .set(auth(ctx.token))
    .send({
      addressId: ctx.addressId,
      deliveryDate: win.date,
      window: win.window,
      paymentMethod: 'COD',
      heardFrom: 'COUNTER',
      ...extra,
    });
}
const scan = (tag) => request(app).post('/api/v1/links/click').send(tag);
const row = async (code) =>
  (await request(app).get(`${A}/growth/promoters`)).body.promoters.find((p) => p.code === code);
const make = (code, name = 'Ravi') =>
  request(app).post(`${A}/growth/promoters`).send({ code, name, stall: 'Gate 1' });

beforeAll(() => updatePaymentSettings({ codEnabled: true, codMaxOrderPaise: 500000 }));

describe('a promoter QR, end to end', () => {
  it('Android: scan → Play install tag → sign-up → order, with nobody typing anything', async () => {
    expect((await make('QRAND1')).status).toBe(201);
    expect(await row('QRAND1')).toMatchObject({ scans: 0, signUps: 0, firstOrders: 0, orders: 0 });

    // What is printed in the QR, read back the way the page reads it.
    const tag = readTag(
      new URL(goUrl({ src: 'counter', p: 'QRAND1', c: 'aquantis', r: '' })).search,
    );
    expect((await scan(tag)).status).toBe(202);
    await scan(tag);
    expect(await row('QRAND1')).toMatchObject({ scans: 2, signUps: 0 });

    // What the page hands to Google Play, and Google hands to the app on first open.
    const referrer = new URL(playUrlFor(tag)).searchParams.get('referrer');
    expect(parseReferrer(referrer)).toMatchObject({ src: 'counter', p: 'QRAND1' });
    const ctx = await shopper();
    await request(app)
      .post('/api/v1/growth/install-source')
      .set(auth(ctx.token))
      .send({ referrer });
    expect(await row('QRAND1')).toMatchObject({ scans: 2, signUps: 1, firstOrders: 0 });

    const o = await order(ctx);
    expect(o.status).toBe(201);
    const r = await row('QRAND1');
    expect(r).toMatchObject({ scans: 2, signUps: 1, firstOrders: 1, typed: 0, orders: 1 });
    expect(Number(r.revenuePaise)).toBeGreaterThan(0);
    expect(r.week).toHaveLength(7);
    expect(r.week[6].scans).toBe(2);
  });

  it('iPhone: the scan is counted, and the order when the code is typed', async () => {
    await make('QRIOS1');
    await scan({ src: 'counter', p: 'QRIOS1' });
    const ctx = await shopper();
    expect((await order(ctx, { code: 'qrios1' })).status).toBe(201);
    expect(await row('QRIOS1')).toMatchObject({
      scans: 1,
      signUps: 0,
      firstOrders: 1,
      typed: 1,
      orders: 1,
    });
  });

  it('each promoter keeps their own numbers, and the totals add up', async () => {
    const { promoters, totals } = (await request(app).get(`${A}/growth/promoters`)).body;
    const sum = (k) => promoters.reduce((n, p) => n + Number(p[k]), 0);
    for (const k of ['scans', 'signUps', 'firstOrders', 'orders', 'revenuePaise'])
      expect(Number(totals[k])).toBe(sum(k));
    expect(await row('QRAND1')).toMatchObject({ scans: 2, orders: 1 });
  });

  it('an install is counted once, even if the app sends the tag again', async () => {
    await make('QRONCE');
    const ctx = await shopper();
    for (let i = 0; i < 3; i += 1)
      await request(app)
        .post('/api/v1/growth/install-source')
        .set(auth(ctx.token))
        .send({ referrer: 'src=counter&p=QRONCE' });
    expect((await row('QRONCE')).signUps).toBe(1);
  });

  it('switching a promoter off stops the credit; the printed QR works again when switched on', async () => {
    await make('QROFF1');
    await request(app).patch(`${A}/growth/promoters/QROFF1`).send({ active: false });
    const a = await shopper();
    await request(app)
      .post('/api/v1/growth/install-source')
      .set(auth(a.token))
      .send({ referrer: 'src=counter&p=QROFF1' });
    expect((await order(a)).status).toBe(201);
    expect(await row('QROFF1')).toMatchObject({ firstOrders: 0, orders: 0 });
    await request(app).patch(`${A}/growth/promoters/QROFF1`).send({ active: true });
    const b = await shopper();
    await request(app)
      .post('/api/v1/growth/install-source')
      .set(auth(b.token))
      .send({ referrer: 'src=counter&p=QROFF1' });
    await order(b);
    expect(await row('QROFF1')).toMatchObject({ firstOrders: 1, orders: 1 });
  });

  it('a made-up code in a scan credits nobody', async () => {
    const before = (await request(app).get(`${A}/growth/promoters`)).body.totals.scans;
    await scan({ src: 'counter', p: 'NOSUCH' });
    expect((await request(app).get(`${A}/growth/promoters`)).body.totals.scans).toBe(before);
  });

  it('numbers belong to the dates asked for', async () => {
    const r = (await request(app).get(`${A}/growth/promoters?from=2025-01-01&to=2025-01-31`)).body;
    expect(r.totals).toEqual({
      scans: 0,
      signUps: 0,
      firstOrders: 0,
      orders: 0,
      revenuePaise: '0',
    });
  });
});
