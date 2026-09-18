/**
 * Checkout re-validates the basket against the live catalog: day-wide product caps and availability.
 * And a basket survives the admin deleting one of its products.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function customer(mobile) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  const token = v.body.accessToken;
  const { body: c } = await request(app).get('/api/v1/communities');
  const community = c.communities[0];
  const a = await request(app)
    .post('/api/v1/addresses')
    .set(auth(token))
    .send({ communityId: community.id, block: community.blocks[0], flat: '505', floor: '5' });
  const w = await request(app)
    .get(`/api/v1/delivery-windows?addressId=${a.body.address.id}`)
    .set(auth(token));
  return { token, addressId: a.body.address.id, win: w.body.windows.find((x) => x.isOpen) };
}
const add = (ctx, productId, quantity) =>
  request(app).put('/api/v1/cart/items').set(auth(ctx.token)).send({ productId, quantity });
const order = (ctx) =>
  request(app)
    .post('/api/v1/orders')
    .set(auth(ctx.token))
    .send({ addressId: ctx.addressId, deliveryDate: ctx.win.date, window: ctx.win.window });

async function products() {
  const { body } = await request(app).get('/api/v1/admin/products');
  return body.products.filter((p) => (p.availability || 'AVAILABLE') === 'AVAILABLE');
}
/** fill a basket past the ₹500 minimum WITHOUT the product under test */
async function filler(ctx, excludeId) {
  const ps = (await products()).filter((p) => p.id !== excludeId).slice(0, 6);
  for (const p of ps) await add(ctx, p.id, 6);
}

describe('checkout guards', () => {
  it('dailyCap applies across all orders for that day', async () => {
    // A product nobody has ordered yet. Reusing a seeded product coupled this test to whatever the
    // seed happened to have booked on the delivery date checkout resolves to, so the expected
    // remainder moved whenever the seed or the cut-off rules changed. Own the product, own the sums.
    const { body: cat } = await request(app).get('/api/v1/admin/products');
    const { body: made } = await request(app).post('/api/v1/admin/products').send({
      name: 'Cap test gourd',
      category: cat.categories[0].id,
      unit: 'KG',
      increment: '0.25',
      pricePaise: 10000,
      dailyCap: 10,
      availability: 'AVAILABLE',
    });
    const p = made.product;

    const a = await customer('9444000001');
    await filler(a, p.id);
    expect((await add(a, p.id, 6)).status).toBe(200);
    expect((await order(a)).status).toBe(201);

    const b = await customer('9444000002');
    await filler(b, p.id);
    expect((await add(b, p.id, 6)).status).toBe(200); // per-line check passes (6 ≤ 10)…
    const r = await order(b);
    expect(r.status).toBe(422); // …but only 4 are left for that day
    expect(r.body.error.code).toBe('CAP_EXCEEDED');
    expect(r.body.error.details.remaining).toBe('4');

    expect((await add(b, p.id, 4)).status).toBe(200);
    expect((await order(b)).status).toBe(201);
    await request(app).delete(`/api/v1/admin/products/${p.id}`);
  });

  it('a product that goes sold-out after being added cannot be ordered', async () => {
    const [, p] = (await products()).filter((x) => x.unit === 'KG');
    const c = await customer('9444000003');
    await filler(c, p.id);
    expect((await add(c, p.id, 1)).status).toBe(200);
    await request(app).patch(`/api/v1/admin/products/${p.id}`).send({ availability: 'SOLD_OUT' });
    const r = await order(c);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('UNAVAILABLE');
    expect(r.body.error.details.productId).toBe(p.id);
    await request(app).patch(`/api/v1/admin/products/${p.id}`).send({ availability: 'AVAILABLE' });
  });

  it('deleting a product that is in a basket does not break the cart', async () => {
    const created = await request(app)
      .post('/api/v1/admin/products')
      .send({
        name: 'Temp leaf',
        category: (await products())[0].categoryId,
        unit: 'BUNCH',
        increment: '1',
        pricePaise: 2000,
        costPaise: 1000,
        dailyCap: 50,
      });
    expect(created.status).toBe(201);
    const pid = created.body.product.id;
    const c = await customer('9444000004');
    expect((await add(c, pid, 2)).status).toBe(200);
    expect((await request(app).delete(`/api/v1/admin/products/${pid}`)).status).toBe(200);
    const cart = await request(app).get('/api/v1/cart').set(auth(c.token));
    expect(cart.status).toBe(200);
    expect(cart.body.cart.items.find((i) => i.productId === pid)).toBeUndefined();
  });
});
