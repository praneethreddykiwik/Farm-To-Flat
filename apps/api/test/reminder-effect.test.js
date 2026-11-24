/** Weekly insights → Routine: are the cut-off reminders working, and is interest rising or falling? */
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
const orders = vi.hoisted(() => ({ list: [] }));
vi.mock('../src/store.js', async (orig) => ({ ...(await orig()), listOrders: () => orders.list }));
const { track } = await import('../src/lib/events.js');
const { listOps, removeOps } = await import('../src/ops-store.js');
const { reminderEffect } = await import('../src/lib/reminder-effect.js');
const { addDaysISO, istInstantMs, todayISO } = await import('../src/lib/dates.js');

const DAY = addDaysISO(todayISO(), -10);
const at = (d, t) => new Date(istInstantMs(d, t)).toISOString();
const send = (cid, d = DAY, t = '17:00', channel = 'push') =>
  track('cutoff_reminder_sent', { channel }, { customerId: cid, at: at(d, t) });
const open = (cid, d = DAY, t = '17:05') =>
  track(
    'cutoff_reminder_opened',
    { channel: 'push', sent_on: d },
    { customerId: cid, at: at(d, t) },
  );
const order = (cid, d = DAY, t = '17:10') =>
  orders.list.push({
    id: `o${orders.list.length}`,
    customerId: cid,
    status: 'CONFIRMED',
    createdAt: at(d, t),
  });
const one = () => reminderEffect({ from: DAY, to: DAY });

beforeEach(async () => {
  orders.list = [];
  for (const e of listOps('event')) await removeOps('event', e.id);
});

describe('reminder effect', () => {
  it('counts who it reached, who opened it and who ordered afterwards', () => {
    for (const c of ['a', 'b', 'c', 'd']) send(c);
    open('a');
    open('b');
    order('a');
    order('c', DAY, '20:00'); // ordered without opening
    order('d', DAY, '16:00'); // before the reminder: not because of it
    order('z'); // never reminded
    expect(one().days[0]).toMatchObject({
      sent: 4,
      opened: 2,
      openedPct: 50,
      ordered: 2,
      orderedPct: 50,
      openedAndOrdered: 1,
      ordersAfter: 2,
    });
  });

  it('counts a person once: push and WhatsApp, two taps, sent again', () => {
    send('a');
    send('a', DAY, '17:00', 'whatsapp');
    send('a', DAY, '18:00');
    open('a');
    open('a', DAY, '17:30');
    expect(one().days[0]).toMatchObject({ sent: 1, opened: 1, whatsapp: 1 });
  });

  it('a late tap belongs to the reminder it came from, not the day it was tapped', () => {
    send('a');
    track(
      'cutoff_reminder_opened',
      { sent_on: DAY },
      { customerId: 'a', at: at(addDaysISO(DAY, 1), '09:00') },
    );
    expect(one().days[0].opened).toBe(1);
  });

  it('compares with the same hours on earlier same weekdays that had no reminder', () => {
    send('a');
    for (let i = 0; i < 5; i += 1) order(`n${i}`);
    order('old', addDaysISO(DAY, -60), '10:00'); // the shop was open this early
    for (let i = 0; i < 2; i += 1) order(`w1${i}`, addDaysISO(DAY, -7));
    for (let i = 0; i < 4; i += 1) order(`w2${i}`, addDaysISO(DAY, -14));
    send('q', addDaysISO(DAY, -21)); // a reminder day: not a fair comparison
    for (let i = 0; i < 9; i += 1) order(`w3${i}`, addDaysISO(DAY, -21));
    const d = one().days[0];
    expect(d.ordersAfter).toBe(5);
    expect(d.usualDays).toBe(4); // weeks 1, 2, 4 and 5
    expect(d.usual).toBe(1.5); // (2 + 4 + 0 + 0) / 4
    expect(d.change).toBe(3.5);
  });

  it('says nothing rather than zero when there is no earlier day to compare with', () => {
    send('a');
    order('a');
    expect(one().days[0]).toMatchObject({ usual: null, change: null });
    expect(one().trend).toEqual({ opened: null, ordered: null });
  });

  it('shows whether interest is rising or falling against the period before', () => {
    const prev = addDaysISO(DAY, -1);
    for (const c of ['a', 'b', 'c', 'd']) {
      send(c, prev);
      send(c);
    }
    open('a', prev);
    for (const c of ['a', 'b', 'c']) open(c);
    order('a', prev);
    order('b', prev);
    order('c');
    const e = one();
    expect(e.trend.opened).toEqual({ points: 50, way: 'up' });
    expect(e.trend.ordered).toEqual({ points: -25, way: 'down' });
  });

  it('an erased account stays a count and names nobody; an empty range is empty', () => {
    track('cutoff_reminder_sent', { channel: 'push' }, { at: at(DAY, '17:00') });
    send('a');
    expect(one().days[0].sent).toBe(2);
    expect(JSON.stringify(one())).not.toMatch(/gone:|customerId/);
    expect(reminderEffect({ from: '2020-01-01', to: '2020-01-02' })).toMatchObject({
      days: [],
      now: { sent: 0, openedPct: null },
    });
  });
});
