/**
 * The 5 PM reminder saves its "sent today" marker to the ops store, awaited, BEFORE it sends
 * anything — so a restart part-way through, or before the old after-the-fact soft write landed,
 * cannot send the batch a second time (review #17, 21 Nov 2026).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';

// Records the order things happen in: the durable marker write vs each notification.
const h = vi.hoisted(() => ({ log: [], failMarker: false }));

vi.mock('../src/ops-store.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    putOps: async (kind, id, data) => {
      if (kind === 'reminder') {
        h.log.push(`putOps:${id}`);
        if (h.failMarker) throw new Error('database unreachable');
      }
      return real.putOps(kind, id, data);
    },
  };
});
vi.mock('../src/lib/notify.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    emitNotification: (cid, n) => {
      if (n?.type === 'CUTOFF_REMINDER') h.log.push(`notify:${cid}`);
      return real.emitNotification(cid, n);
    },
  };
});

const { app } = await import('../src/index.js');
const { runCutoffReminder } = await import('../src/lib/reminders.js');
const { getOps, saveSettings } = await import('../src/ops-store.js');
const { istInstantMs, todayISO } = await import('../src/lib/dates.js');

async function shopperWithDevice(mobile) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  const token = v.body.accessToken;
  await request(app)
    .post('/api/v1/devices')
    .set({ Authorization: `Bearer ${token}` })
    .send({ expoPushToken: `ExponentPushToken[rem${mobile}]` });
}

beforeEach(() => {
  h.log.length = 0;
  h.failMarker = false;
});

describe('cut-off reminder sent marker', () => {
  // Each case uses its own IST day so the markers do not collide.
  const at = (daysAhead) => {
    const day = new Date(Date.now() + daysAhead * 864e5);
    const iso = todayISO(day.getTime());
    return { iso, now: istInstantMs(iso, '17:05') };
  };

  it('saves the marker before the first notification, and a second run that day sends nothing', async () => {
    await saveSettings('reminders', { enabled: true, time: '17:00' });
    await shopperWithDevice('9346100001');
    const { iso, now } = at(3);

    const sent = await runCutoffReminder(now);
    expect(sent).toBeGreaterThan(0);
    const firstNotify = h.log.findIndex((x) => x.startsWith('notify:'));
    expect(h.log[0]).toBe(`putOps:auto-${iso}`);
    expect(firstNotify).toBeGreaterThan(0);
    expect(getOps('reminder', `auto-${iso}`)).toBeTruthy();

    // A restarted process reads the marker back from the store and does not send again.
    h.log.length = 0;
    expect(await runCutoffReminder(now + 60e3)).toBe(0);
    expect(h.log.filter((x) => x.startsWith('notify:'))).toHaveLength(0);
  });

  it('sends nothing when the marker cannot be saved', async () => {
    await saveSettings('reminders', { enabled: true, time: '17:00' });
    await shopperWithDevice('9346100002');
    const { iso, now } = at(4);
    h.failMarker = true;

    expect(await runCutoffReminder(now)).toBe(0);
    expect(h.log).toEqual([`putOps:auto-${iso}`]);
    expect(getOps('reminder', `auto-${iso}`)).toBeNull();
  });
});
