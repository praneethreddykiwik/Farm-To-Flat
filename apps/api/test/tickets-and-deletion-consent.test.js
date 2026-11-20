/**
 * Support tickets (app problems and complaints, not about one order) and the deletion consent
 * tick-box recorded on the server (21 Nov 2026).
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const { listOps } = await import('../src/ops-store.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const A = '/api/v1/admin';
let seq = 0;
async function shopper() {
  const mobile = `93490${String(++seq).padStart(5, '0')}`;
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  const me = await request(app).get('/api/v1/me').set(auth(v.body.accessToken));
  return { mobile, token: v.body.accessToken, id: me.body.customer.id };
}

describe('support tickets', () => {
  it('needs a sign-in', async () => {
    expect((await request(app).get('/api/v1/support/tickets')).status).toBe(401);
    // The public support contact still works without one.
    expect((await request(app).get('/api/v1/support')).status).toBe(200);
  });

  it('customer raises, team replies and resolves, customer sees it, reply reopens', async () => {
    const s = await shopper();
    const bad = await request(app)
      .post('/api/v1/support/tickets')
      .set(auth(s.token))
      .send({ category: 'NOPE', message: 'x' });
    expect(bad.status).toBe(422);

    const made = await request(app)
      .post('/api/v1/support/tickets')
      .set(auth(s.token))
      .send({
        category: 'APP_PROBLEM',
        message: 'The checkout screen stays blank after I pick a slot.',
        context: { platform: 'ios', appVersion: '0.2.0', screen: 'checkout' },
      });
    expect(made.status).toBe(201);
    const t = made.body.ticket;
    expect(t.number).toMatch(/^TKT-\d+$/);
    expect(t.status).toBe('OPEN');

    const list = await request(app).get(`${A}/tickets?status=OPEN`);
    const row = list.body.tickets.find((x) => x.id === t.id);
    expect(row.customer.id).toBe(s.id);
    expect(JSON.stringify(row)).not.toContain(s.mobile);
    expect(row.context.screen).toBe('checkout');

    const reply = await request(app)
      .patch(`${A}/tickets/${t.id}`)
      .send({ reply: 'Fixed in today’s update — please reopen the app.' });
    expect(reply.body.ticket.status).toBe('IN_PROGRESS');
    const done = await request(app).patch(`${A}/tickets/${t.id}`).send({ status: 'RESOLVED' });
    expect(done.body.ticket.status).toBe('RESOLVED');

    const mine = await request(app).get(`/api/v1/support/tickets/${t.id}`).set(auth(s.token));
    expect(mine.body.ticket.messages.map((m) => m.from)).toEqual(['CUSTOMER', 'TEAM']);
    expect(JSON.stringify(mine.body)).not.toContain('actor');
    const notes = await request(app).get('/api/v1/notifications').set(auth(s.token));
    expect(JSON.stringify(notes.body)).toContain(t.number);

    const again = await request(app)
      .post(`/api/v1/support/tickets/${t.id}/messages`)
      .set(auth(s.token))
      .send({ text: 'Still blank on my phone.' });
    expect(again.body.ticket.status).toBe('OPEN');

    // Someone else cannot read or add to it.
    const other = await shopper();
    expect(
      (await request(app).get(`/api/v1/support/tickets/${t.id}`).set(auth(other.token))).status,
    ).toBe(404);

    expect((await request(app).delete(`${A}/tickets/${t.id}`)).status).toBe(200);
    expect((await request(app).get(`${A}/tickets/${t.id}`)).status).toBe(404);
  });

  it('limits open requests per customer', async () => {
    const s = await shopper();
    for (let i = 0; i < 5; i++)
      await request(app)
        .post('/api/v1/support/tickets')
        .set(auth(s.token))
        .send({ category: 'OTHER', message: `Problem number ${i}` });
    const sixth = await request(app)
      .post('/api/v1/support/tickets')
      .set(auth(s.token))
      .send({ category: 'OTHER', message: 'One more problem' });
    expect(sixth.status).toBe(429);
  });

  it('delivery staff cannot read tickets', async () => {
    const mobile = '9848022222';
    await request(app).post('/api/v1/auth/otp/request').send({ mobile });
    const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
    const r = await request(app).get(`${A}/tickets`).set(auth(v.body.accessToken));
    expect(r.status).toBe(403);
  });
});

describe('deletion consent', () => {
  it('records the tick-box with the request; the admin sees it; erasure removes tickets', async () => {
    const s = await shopper();
    await request(app)
      .post('/api/v1/support/tickets')
      .set(auth(s.token))
      .send({ category: 'ACCOUNT', message: 'Please delete my account.' });
    const code = await request(app).post('/api/v1/me/deletion/request').set(auth(s.token));
    expect(code.status).toBe(200);
    const ok = await request(app)
      .post('/api/v1/me/deletion/confirm')
      .set(auth(s.token))
      .send({
        otp: '123456',
        consent: { accepted: true, version: 'deletion-2026-11-21', platform: 'ios' },
      });
    expect(ok.status).toBe(200);
    expect(ok.body.scheduled).toBe(true);

    const acct = await request(app).get(`${A}/customers/${s.id}/account`);
    expect(acct.body.account.deletion.consent).toMatchObject({
      accepted: true,
      version: 'deletion-2026-11-21',
    });
    expect(acct.body.account.deletionRequests[0].via).toBe('APP_WITH_CODE');
    const dels = await request(app).get(`${A}/deletions`);
    expect(dels.body.deletions.find((d) => d.key === s.id).consent.accepted).toBe(true);

    // A false "accepted" is refused outright.
    const t2 = await shopper();
    const lie = await request(app)
      .post('/api/v1/me/deletion/confirm')
      .set(auth(t2.token))
      .send({ otp: '123456', consent: { accepted: false, version: 'x' } });
    expect(lie.status).toBe(422);

    // When the account is finally erased, its tickets go; the consent record stays as proof.
    const { eraseAccountNow } = await import('../src/lib/account-deletion.js');
    await eraseAccountNow(s.id);
    expect(listOps('ticket').filter((t) => t.customerId === s.id)).toHaveLength(0);
    expect(listOps('deletionConsent').some((c) => c.customerId === s.id)).toBe(true);
  });
});
