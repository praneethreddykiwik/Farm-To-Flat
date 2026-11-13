/**
 * Editing and removing a saved address.
 *
 * The profile listed addresses but offered no way to change one: a typo in a flat number, or a move
 * to another tower, meant living with a wrong address or deleting the whole account. These are the
 * rules that make the two new routes safe:
 *   - they only ever touch the caller's OWN addresses;
 *   - an edit is re-checked against the community's block list, exactly like a new address;
 *   - an order keeps the address it was placed with;
 *   - the last address cannot be removed, and there is never a moment with no default.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function signIn(mobile) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  return v.body.accessToken;
}

async function communities() {
  const { body } = await request(app).get('/api/v1/communities');
  return body.communities;
}

async function addAddress(token, community, extra = {}) {
  const r = await request(app)
    .post('/api/v1/addresses')
    .set(auth(token))
    .send({
      communityId: community.id,
      block: community.blocks[0],
      flat: '1204',
      floor: '12',
      recipientName: 'Asha Rao',
      ...extra,
    });
  expect(r.status).toBe(201);
  return r.body.address;
}

const list = async (token) =>
  (await request(app).get('/api/v1/addresses').set(auth(token))).body.addresses;

describe('PATCH /addresses/:id', () => {
  it('changes only what was sent, and the list shows it', async () => {
    const token = await signIn('9811100001');
    const [com] = await communities();
    const a = await addAddress(token, com);

    const r = await request(app)
      .patch(`/api/v1/addresses/${a.id}`)
      .set(auth(token))
      .send({ flat: '1402', floor: '14', landmark: 'Next to the lift' });
    expect(r.status).toBe(200);
    expect(r.body.address).toMatchObject({
      id: a.id,
      flat: '1402',
      floor: '14',
      landmark: 'Next to the lift',
      block: com.blocks[0],
      communityId: com.id,
      recipientName: 'Asha Rao',
    });
    const saved = await list(token);
    expect(saved).toHaveLength(1);
    expect(saved[0].flat).toBe('1402');
    expect(saved[0].isDefault).toBe(true);
  });

  it('moves an address to another community and refreshes the names that go with it', async () => {
    const token = await signIn('9811100002');
    const [one, two] = await communities();
    const a = await addAddress(token, one);

    const r = await request(app)
      .patch(`/api/v1/addresses/${a.id}`)
      .set(auth(token))
      .send({ communityId: two.id, block: two.blocks[0] });
    expect(r.status).toBe(200);
    expect(r.body.address).toMatchObject({
      communityId: two.id,
      communityName: two.name,
      area: two.area,
      block: two.blocks[0],
    });
  });

  it('refuses a block the community does not have', async () => {
    const token = await signIn('9811100003');
    const [com] = await communities();
    const a = await addAddress(token, com);

    const r = await request(app)
      .patch(`/api/v1/addresses/${a.id}`)
      .set(auth(token))
      .send({ block: 'Tower That Does Not Exist' });
    expect(r.status).toBe(422);
    expect((await list(token))[0].block).toBe(com.blocks[0]);
  });

  it('refuses a move that leaves the old block behind in a community without it', async () => {
    const token = await signIn('9811100004');
    const all = await communities();
    const one = all[0];
    // A second community that does not share the first one's first block name.
    const two = all.find((c) => c.id !== one.id && !c.blocks.includes(one.blocks[0]));
    if (!two) return; // every community shares block names in this seed: nothing to prove
    const a = await addAddress(token, one);

    const r = await request(app)
      .patch(`/api/v1/addresses/${a.id}`)
      .set(auth(token))
      .send({ communityId: two.id });
    expect(r.status).toBe(422);
    expect((await list(token))[0].communityId).toBe(one.id);
  });

  it('runs the same field rules as a new address', async () => {
    const token = await signIn('9811100005');
    const [com] = await communities();
    const a = await addAddress(token, com);
    const patch = (body) =>
      request(app).patch(`/api/v1/addresses/${a.id}`).set(auth(token)).send(body);

    expect((await patch({ flat: '-44' })).status).toBe(422);
    expect((await patch({ flat: '0' })).status).toBe(422);
    expect((await patch({ floor: '-1' })).status).toBe(422);
    expect((await patch({ floor: '007' })).status).toBe(422);
    expect((await patch({})).status).toBe(422);
    // 0 is the ground floor, and null clears it.
    expect((await patch({ floor: '0' })).body.address.floor).toBe('0');
    expect((await patch({ floor: null })).body.address.floor).toBe(null);
  });

  it("cannot reach another customer's address", async () => {
    const mine = await signIn('9811100006');
    const theirs = await signIn('9811100007');
    const [com] = await communities();
    const a = await addAddress(theirs, com);

    const r = await request(app)
      .patch(`/api/v1/addresses/${a.id}`)
      .set(auth(mine))
      .send({ flat: '999' });
    expect(r.status).toBe(404);
    expect((await list(theirs))[0].flat).toBe('1204');
  });

  it('needs a session', async () => {
    const r = await request(app).patch('/api/v1/addresses/adr_whatever').send({ flat: '1' });
    expect(r.status).toBe(401);
  });

  it('leaves an order already placed pointing at the address it was placed with', async () => {
    const token = await signIn('9811100008');
    const [com] = await communities();
    const a = await addAddress(token, com);
    const { body: catalog } = await request(app).get('/api/v1/admin/products');
    const picked = catalog.products
      .filter((x) => (x.availability || 'AVAILABLE') === 'AVAILABLE')
      .slice(0, 4);
    for (const p of picked)
      await request(app)
        .put('/api/v1/cart/items')
        .set(auth(token))
        .send({ productId: p.id, quantity: 6 });
    const w = await request(app).get(`/api/v1/delivery-windows?addressId=${a.id}`).set(auth(token));
    const win = w.body.windows.find((x) => x.isOpen);
    const placed = await request(app).post('/api/v1/orders').set(auth(token)).send({
      addressId: a.id,
      deliveryDate: win.date,
      window: win.window,
      useWallet: false,
    });
    expect(placed.status).toBe(201);
    const orderId = placed.body.order.id;
    expect(placed.body.order.address.flat).toBe('1204');

    const edit = await request(app)
      .patch(`/api/v1/addresses/${a.id}`)
      .set(auth(token))
      .send({ flat: '1402' });
    expect(edit.status).toBe(200);
    const after = await request(app).get(`/api/v1/orders/${orderId}`).set(auth(token));
    expect(after.body.order.address.flat).toBe('1204');
  });
});

describe('DELETE /addresses/:id', () => {
  it('will not remove the only address', async () => {
    const token = await signIn('9811100011');
    const [com] = await communities();
    const a = await addAddress(token, com);

    const r = await request(app).delete(`/api/v1/addresses/${a.id}`).set(auth(token));
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('LAST_ADDRESS');
    expect(await list(token)).toHaveLength(1);
  });

  it('removes a second address and leaves the default alone', async () => {
    const token = await signIn('9811100012');
    const [com] = await communities();
    const first = await addAddress(token, com);
    const second = await addAddress(token, com, { flat: '305', floor: '3' });

    const r = await request(app).delete(`/api/v1/addresses/${second.id}`).set(auth(token));
    expect(r.status).toBe(200);
    expect(r.body.addresses.map((x) => x.id)).toEqual([first.id]);
    expect(r.body.addresses[0].isDefault).toBe(true);
  });

  it('hands the default to another address when the default is removed', async () => {
    const token = await signIn('9811100013');
    const [com] = await communities();
    const first = await addAddress(token, com);
    const second = await addAddress(token, com, { flat: '305', floor: '3' });
    expect(first.isDefault).toBe(true);

    const r = await request(app).delete(`/api/v1/addresses/${first.id}`).set(auth(token));
    expect(r.status).toBe(200);
    expect(r.body.addresses).toHaveLength(1);
    expect(r.body.addresses[0]).toMatchObject({ id: second.id, isDefault: true });
    // …and the profile agrees, so checkout still has somewhere to deliver.
    const me = await request(app).get('/api/v1/me').set(auth(token));
    expect(me.body.defaultAddress.id).toBe(second.id);
  });

  it("cannot remove another customer's address", async () => {
    const mine = await signIn('9811100014');
    const theirs = await signIn('9811100015');
    const [com] = await communities();
    await addAddress(theirs, com);
    const target = await addAddress(theirs, com, { flat: '305', floor: '3' });

    const r = await request(app).delete(`/api/v1/addresses/${target.id}`).set(auth(mine));
    expect(r.status).toBe(404);
    expect(await list(theirs)).toHaveLength(2);
  });

  it('is a 404 the second time', async () => {
    const token = await signIn('9811100016');
    const [com] = await communities();
    await addAddress(token, com);
    const second = await addAddress(token, com, { flat: '305', floor: '3' });

    expect(
      (await request(app).delete(`/api/v1/addresses/${second.id}`).set(auth(token))).status,
    ).toBe(200);
    expect(
      (await request(app).delete(`/api/v1/addresses/${second.id}`).set(auth(token))).status,
    ).toBe(404);
  });
});

describe('floor', () => {
  it('accepts 0 as the ground floor on a new address', async () => {
    const token = await signIn('9811100021');
    const [com] = await communities();
    const a = await addAddress(token, com, { flat: 'G2', floor: '0' });
    expect(a.floor).toBe('0');
  });

  it('still accepts an address with no floor, for the app builds already on phones', async () => {
    const token = await signIn('9811100022');
    const [com] = await communities();
    const r = await request(app)
      .post('/api/v1/addresses')
      .set(auth(token))
      .send({ communityId: com.id, block: com.blocks[0], flat: '77' });
    expect(r.status).toBe(201);
    expect(r.body.address.floor).toBe(null);
  });
});
