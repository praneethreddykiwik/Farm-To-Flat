/** "Before you go": why customers delete their account (22 Nov 2026). */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const { listOps } = await import('../src/ops-store.js');
const { sweepDeletions, GRACE_DAYS } = await import('../src/lib/account-deletion.js');
const { EXIT_REASON_KEYS } = await import('../src/lib/exit-reasons.js');
const { EXIT_REASONS: APP_REASONS, exitAnswer } = await import(
  '../../customer/src/lib/exitReasons.js'
);

const api = '/api/v1';
let seq = 0;
async function leave(exit) {
  const mobile = `93371${String(++seq).padStart(5, '0')}`;
  await request(app).post(`${api}/auth/otp/request`).send({ mobile });
  const v = await request(app).post(`${api}/auth/otp/verify`).send({ mobile, otp: '123456' });
  const h = { Authorization: `Bearer ${v.body.accessToken}` };
  const ask = await request(app).post(`${api}/me/deletion/request`).set(h);
  const r = await request(app)
    .post(`${api}/me/deletion/confirm`)
    .set(h)
    .send({ otp: ask.body.devOtp || '123456', ...(exit === undefined ? {} : { exit }) });
  return { r, id: v.body.customer.id };
}
const record = (id) => listOps('deletionConsent').find((x) => x.customerId === id);
const exits = async () => (await request(app).get(`${api}/admin/feedback/exits`)).body;

describe('the exit question', () => {
  it('the app and the server offer the same reasons', () => {
    expect(APP_REASONS.map((r) => r.key)).toEqual(EXIT_REASON_KEYS);
  });

  it('records the reason and the words, and the admin sees both', async () => {
    const before = await exits();
    const { r, id } = await leave({ reason: 'PRICE', note: '  Tomatoes cost more here  ' });
    expect(r.status).toBe(200);
    expect(record(id)).toMatchObject({ exitReason: 'PRICE', exitNote: 'Tomatoes cost more here' });
    const after = await exits();
    const n = (x) => x.byReason.find((b) => b.key === 'PRICE').count;
    expect(n(after)).toBe(n(before) + 1);
    expect(after.recent[0]).toMatchObject({ reason: 'PRICE', note: 'Tomatoes cost more here' });
  });

  it('never names the person in the admin list', async () => {
    const { id } = await leave({ reason: 'OTHER' });
    const body = await exits();
    for (const row of body.recent)
      expect(Object.keys(row).sort()).toEqual(['at', 'id', 'note', 'reason', 'reasonLabel', 'via']);
    expect(JSON.stringify(body)).not.toContain(id);
  });

  it('is optional: skipped, absent (older app) and unknown answers all still delete', async () => {
    for (const exit of [
      undefined,
      null,
      { reason: 'NOT_A_REASON' },
      { reason: 'PRICE', note: 'x'.repeat(301) },
      'junk',
    ]) {
      const { r, id } = await leave(exit);
      expect(r.status).toBe(200);
      expect(r.body.scheduled).toBe(true);
      expect(record(id).exitReason).toBeNull();
    }
  });

  it('when the account is erased the words go and the reason stays', async () => {
    const { id } = await leave({ reason: 'QUALITY', note: 'Call me on 9876543210' });
    await sweepDeletions(Date.now() + (GRACE_DAYS + 1) * 864e5);
    expect(record(id)).toMatchObject({ exitReason: 'QUALITY', exitNote: null });
  });

  it('what the app sends: null when skipped, trimmed and capped when answered', () => {
    expect(exitAnswer(null, 'hello')).toBeNull();
    expect(exitAnswer('NOPE', '')).toBeNull();
    expect(exitAnswer('APP', '   ')).toEqual({ reason: 'APP' });
    expect(exitAnswer('APP', `  ${'a'.repeat(400)}`).note).toHaveLength(300);
  });
});
