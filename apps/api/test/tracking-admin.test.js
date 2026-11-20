/**
 * Everything in the tracking brief is controllable from the admin (Friday report page):
 * saved /go links CRUD, scan counts, install sources (view/correct/delete), event switches and
 * deleting a test event, the "how did you hear" answers, the reminder wording + preview + send now,
 * the Home-screen nudges, and the neighbour's-number switch. Delivery staff are refused.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const { listEvents } = await import('../src/lib/events.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const A = '/api/v1/admin';
let seq = 0;
async function shopper() {
  const mobile = `93470${String(++seq).padStart(5, '0')}`;
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  const me = await request(app).get('/api/v1/me').set(auth(v.body.accessToken));
  return { mobile, token: v.body.accessToken, id: me.body.customer.id };
}

describe('saved /go links', () => {
  it('create, list with scans and installs, edit, delete', async () => {
    await request(app).post(`${A}/growth/promoters`).send({ code: 'LNK01', name: 'Links' });
    const bad = await request(app)
      .post(`${A}/growth/links`)
      .send({ name: 'X', src: 'counter', p: 'NOPE99' });
    expect(bad.status).toBe(422);
    const made = await request(app)
      .post(`${A}/growth/links`)
      .send({ name: 'Aquantis gate counter', src: 'counter', p: 'LNK01', c: 'aquantis' });
    expect(made.status).toBe(201);
    expect(made.body.link.url).toBe('https://fooducia.health/go?src=counter&p=LNK01&c=aquantis');
    const id = made.body.link.id;

    await request(app)
      .post('/api/v1/links/click')
      .send({ src: 'counter', p: 'LNK01', c: 'aquantis' });
    const s = await shopper();
    await request(app)
      .post('/api/v1/growth/install-source')
      .set(auth(s.token))
      .send({ referrer: 'src=counter&p=LNK01&c=aquantis' });
    const list = await request(app).get(`${A}/growth/links`);
    const l = list.body.links.find((x) => x.id === id);
    expect(l.scans).toBe(1);
    expect(l.installs).toBe(1);

    const ed = await request(app)
      .patch(`${A}/growth/links/${id}`)
      .send({ name: 'Gate 2', active: false });
    expect(ed.body.link.name).toBe('Gate 2');
    expect(ed.body.link.active).toBe(false);
    expect((await request(app).delete(`${A}/growth/links/${id}`)).status).toBe(200);
    expect((await request(app).delete(`${A}/growth/links/${id}`)).status).toBe(404);
  });

  it('scan counts list and delete', async () => {
    await request(app).post('/api/v1/links/click').send({ src: 'flyer', p: '', c: 'muppa' });
    const r = await request(app).get(`${A}/growth/link-scans`);
    const row = r.body.scans.find((k) => k.src === 'flyer');
    expect(row.n).toBe(1);
    expect(
      (await request(app).delete(`${A}/growth/link-scans/${encodeURIComponent(row.id)}`)).status,
    ).toBe(200);
    const after = await request(app).get(`${A}/growth/link-scans`);
    expect(after.body.scans.find((k) => k.src === 'flyer')).toBeUndefined();
  });
});

describe('install sources', () => {
  it('lists with a masked number, corrects a tag, deletes', async () => {
    const s = await shopper();
    await request(app)
      .post('/api/v1/growth/install-source')
      .set(auth(s.token))
      .send({ referrer: 'src=whatsapp' });
    const list = await request(app).get(`${A}/growth/install-sources`);
    const row = list.body.installs.find((i) => i.id === s.id);
    expect(row.src).toBe('whatsapp');
    expect(JSON.stringify(row)).not.toContain(s.mobile);
    const fix = await request(app)
      .patch(`${A}/growth/install-sources/${s.id}`)
      .send({ src: 'resident_group' });
    expect(fix.body.install.src).toBe('resident_group');
    expect((await request(app).delete(`${A}/growth/install-sources/${s.id}`)).status).toBe(200);
  });
});

describe('events: switches and deleting a test event', () => {
  it('a switched-off event is not recorded; an event can be deleted', async () => {
    const off = await request(app)
      .put(`${A}/business/settings/tracking`)
      .send({ disabledEvents: ['checkout_started'] });
    expect(off.status).toBe(200);
    const s = await shopper();
    await request(app).post('/api/v1/events').set(auth(s.token)).send({ name: 'checkout_started' });
    expect(
      listEvents({ name: 'checkout_started' }).filter((e) => e.customerId === s.id),
    ).toHaveLength(0);
    await request(app).put(`${A}/business/settings/tracking`).send({ disabledEvents: [] });
    await request(app).post('/api/v1/events').set(auth(s.token)).send({ name: 'checkout_started' });
    const ev = listEvents({ name: 'checkout_started' }).find((e) => e.customerId === s.id);
    expect(ev).toBeTruthy();
    expect((await request(app).delete(`${A}/events/${ev.id}`)).status).toBe(200);
    expect(listEvents({ name: 'checkout_started' }).find((e) => e.id === ev.id)).toBeUndefined();
    const junk = await request(app)
      .put(`${A}/business/settings/tracking`)
      .send({ disabledEvents: ['nope'] });
    expect(junk.status).toBe(422);
  });
});

describe('the "how did you hear" answers', () => {
  it('admin edits the answers; the app gets them; a new answer is accepted on an order', async () => {
    const bad = await request(app)
      .put(`${A}/business/settings/sourceQuestion`)
      .send({ options: [{ key: 'A1', label: 'One', enabled: false }] });
    expect(bad.status).toBe(422);
    const ok = await request(app)
      .put(`${A}/business/settings/sourceQuestion`)
      .send({
        required: true,
        options: [
          { key: 'COUNTER', label: 'A Fooducia stall', enabled: true },
          { key: 'FLYER', label: 'A flyer in my lift', enabled: true },
          { key: 'OTHER', label: 'Somewhere else', enabled: false },
        ],
      });
    expect(ok.status).toBe(200);
    const s = await shopper();
    const first = await request(app).get('/api/v1/growth/first-order').set(auth(s.token));
    expect(first.body.required).toBe(true);
    expect(first.body.options.map((o) => o.key)).toEqual(['COUNTER', 'FLYER']);
    // put the defaults back for other suites sharing the process
    await request(app)
      .put(`${A}/business/settings/sourceQuestion`)
      .send({
        options: [
          { key: 'COUNTER', label: 'A Fooducia stall in my community', enabled: true },
          { key: 'WHATSAPP', label: 'The Fooducia WhatsApp channel', enabled: true },
          { key: 'NEIGHBOUR', label: 'A neighbour or friend', enabled: true },
          { key: 'RESIDENT_GROUP', label: 'My residents’ group', enabled: true },
          { key: 'OTHER', label: 'Somewhere else', enabled: true },
        ],
      });
  });
});

describe('reminder wording, preview and send now', () => {
  it('edits the text, previews the reach, sends once, refuses a second send', async () => {
    const t = await request(app)
      .put(`${A}/business/settings/reminders`)
      .send({ title: 'Last call for tomorrow', body: 'Order by 5:30 and we pick it tonight.' });
    expect(t.body.settings.title).toBe('Last call for tomorrow');
    const s = await shopper();
    await request(app)
      .post('/api/v1/devices')
      .set(auth(s.token))
      .send({ expoPushToken: `ExponentPushToken[adm${s.mobile}]` });
    const p = await request(app).get(`${A}/business/reminders/preview`);
    expect(p.body.reach).toBeGreaterThanOrEqual(1);
    expect(p.body.sentToday).toBe(false);
    const sent = await request(app).post(`${A}/business/reminders/send-now`);
    expect(sent.status).toBe(200);
    expect(sent.body.sent).toBeGreaterThanOrEqual(1);
    const notes = await request(app).get('/api/v1/notifications').set(auth(s.token));
    expect(JSON.stringify(notes.body)).toContain('Last call for tomorrow');
    expect((await request(app).post(`${A}/business/reminders/send-now`)).status).toBe(409);
  });
});

describe('Home nudges and the neighbour-number switch', () => {
  it('nudges reach the app through /support; numbers can be switched off', async () => {
    await request(app)
      .put(`${A}/business/settings/appNudges`)
      .send({ countdown: false, countdownHours: 6 });
    const sup = await request(app).get('/api/v1/support');
    expect(sup.body.features.nudges).toMatchObject({
      countdown: false,
      countdownHours: 6,
      repeatBasket: true,
    });
    await request(app)
      .put(`${A}/business/settings/appNudges`)
      .send({ countdown: true, countdownHours: 12 });

    await request(app).put(`${A}/growth/settings`).send({ mobileReferral: false });
    const s = await shopper();
    const r = await request(app)
      .post('/api/v1/growth/check-code')
      .set(auth(s.token))
      .send({ code: '9000022222' });
    expect(r.status).toBe(422);
    await request(app).put(`${A}/growth/settings`).send({ mobileReferral: true });
  });

  it('delivery staff cannot reach any of it', async () => {
    const mobile = '9848022222';
    await request(app).post('/api/v1/auth/otp/request').send({ mobile });
    const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
    for (const p of [
      '/growth/links',
      '/growth/link-scans',
      '/growth/install-sources',
      '/business/reminders/preview',
    ]) {
      const r = await request(app).get(`${A}${p}`).set(auth(v.body.accessToken));
      expect(r.status, p).toBe(403);
    }
  });
});
