/**
 * Delivery windows are an editable LIST, not the fixed MORNING/EVENING pair.
 *
 * Three things have to hold together for that to be safe:
 *   - a community can run one window, or four, each with its own cut-off and countdown;
 *   - a community stored before the list existed still generates its two windows, because the
 *     migration is additive and the old cut-off columns are read as a fallback;
 *   - a window's KEY survives being renamed and outlives being deleted, because orders point at it.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { communityWindows, generateWindows, keyFromLabel } from '../src/lib/windows.js';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');

const everyDay = [0, 1, 2, 3, 4, 5, 6];
const noBookings = () => 0;
const admin = (r) => r.set('x-admin-token', process.env.ADMIN_TOKEN || '123456');

describe('a community defines its own list of windows', () => {
  it('generates one entry per window per delivery day, in order of the day', () => {
    const community = {
      id: 'com_three',
      deliveryDays: everyDay,
      orderLeadDays: 0,
      windows: [
        { key: 'EVENING', label: 'Evening', cutoff: '15:00', start: '17:00', end: '21:00' },
        { key: 'MORNING', label: 'Morning', cutoff: '03:45', start: '06:00', end: '12:00' },
        { key: 'AFTERNOON', label: 'Afternoon', cutoff: '09:30', start: '13:00', end: '16:00' },
      ],
    };
    const windows = generateWindows(
      community,
      '2026-10-01',
      noBookings,
      Date.parse('2026-09-30T00:00:00Z'),
    );
    const firstDay = windows.filter((w) => w.date === '2026-10-01');
    // Sorted by start time regardless of the order the operator listed them in.
    expect(firstDay.map((w) => w.window)).toEqual(['MORNING', 'AFTERNOON', 'EVENING']);
    // Each carries its OWN deadline — the bug this whole module exists to prevent.
    expect(new Set(firstDay.map((w) => w.cutoffAt)).size).toBe(3);
  });

  it('carries the operator’s label and hours, so the app need not know the key', () => {
    const community = {
      id: 'com_named',
      deliveryDays: everyDay,
      orderLeadDays: 0,
      windows: [{ key: 'DAWN', label: 'Dawn run', cutoff: '02:00', start: '05:30', end: '08:00' }],
    };
    const [w] = generateWindows(
      community,
      '2026-10-01',
      noBookings,
      Date.parse('2026-09-30T00:00:00Z'),
    );
    expect(w.label).toBe('Dawn run');
    expect(w.hours).toBe('5:30 am – 8:00 am');
  });

  it('runs a single window for a community that only delivers at dawn', () => {
    const community = {
      id: 'com_one',
      deliveryDays: everyDay,
      orderLeadDays: 0,
      windows: [
        { key: 'MORNING', label: 'Morning', cutoff: '03:45', start: '06:00', end: '12:00' },
      ],
    };
    const windows = generateWindows(
      community,
      '2026-10-01',
      noBookings,
      Date.parse('2026-09-30T00:00:00Z'),
    );
    expect(windows.filter((w) => w.date === '2026-10-01')).toHaveLength(1);
  });
});

describe('a community stored before windows were a list', () => {
  it('still generates the MORNING/EVENING pair from its old cut-off columns', () => {
    const legacy = {
      id: 'com_legacy',
      deliveryDays: everyDay,
      orderLeadDays: 0,
      morningCutoff: '04:15',
      eveningCutoff: '16:30',
    };
    const defs = communityWindows(legacy);
    expect(defs.map((w) => w.key)).toEqual(['MORNING', 'EVENING']);
    // The operator's own cut-offs, not the module defaults — otherwise the migration silently
    // reverts every community's configuration.
    expect(defs.map((w) => w.cutoff)).toEqual(['04:15', '16:30']);
  });
});

describe('window keys', () => {
  it('derives a stable key from a label, and never collides', () => {
    expect(keyFromLabel('Late night')).toBe('LATE_NIGHT');
    expect(keyFromLabel('Morning', ['MORNING'])).toBe('MORNING_2');
  });
});

describe('the admin edits the whole list at once', () => {
  it('adds, renames and removes windows — and a rename keeps the key orders point at', async () => {
    const created = await admin(request(app).post('/api/v1/admin/communities')).send({
      name: 'Window Test Towers',
      area: 'Testville',
      blocks: ['A'],
      deliveryDays: [1, 3, 5],
    });
    expect(created.status).toBe(201);
    const id = created.body.community.id;
    // A brand-new community is orderable straight away, with the standard pair.
    expect(created.body.community.windows.map((w) => w.key)).toEqual(['MORNING', 'EVENING']);

    // Rename MORNING, re-time it, drop EVENING, and add a new window in one write.
    const patched = await admin(request(app).patch(`/api/v1/admin/communities/${id}`)).send({
      windows: [
        { key: 'MORNING', label: 'Sunrise run', cutoff: '02:30', start: '06:00', end: '10:00' },
        { label: 'Afternoon', cutoff: '11:00', start: '14:00', end: '17:00' },
      ],
    });
    expect(patched.status).toBe(200);
    const saved = patched.body.community.windows;
    expect(saved).toHaveLength(2);
    // The renamed window KEPT its key — every order ever placed into it still resolves.
    expect(saved[0]).toMatchObject({ key: 'MORNING', label: 'Sunrise run', cutoff: '02:30' });
    // The new one got a key derived from its label.
    expect(saved[1]).toMatchObject({ key: 'AFTERNOON', label: 'Afternoon' });
    // And EVENING is gone from what is offered.
    expect(saved.map((w) => w.key)).not.toContain('EVENING');

    const windows = await admin(request(app).get(`/api/v1/admin/communities/${id}/windows`));
    expect(windows.status).toBe(200);
    const keys = new Set(windows.body.windows.map((w) => w.window));
    expect(keys).toEqual(new Set(['MORNING', 'AFTERNOON']));
  });

  it('refuses to leave a community with no window at all', async () => {
    const created = await admin(request(app).post('/api/v1/admin/communities')).send({
      name: 'Empty Window Towers',
      area: 'Testville',
      blocks: ['A'],
    });
    const r = await admin(
      request(app).patch(`/api/v1/admin/communities/${created.body.community.id}`),
    ).send({ windows: [] });
    expect(r.status).toBe(422);
  });
});
