/**
 * Review #47 (21 Nov 2026): staff screens shut to customers, and a handled notification tap is
 * never replayed after a relaunch.
 */
import { describe, expect, it } from 'vitest';
import { staffAccess, staffHomeFor } from '../lib/staffAccess';
import { MAX_HANDLED, createHandledResponses, responseKey } from '../lib/notificationDedup';

describe('staffAccess', () => {
  const on = { signedIn: true, resolved: true };

  it('waits while signed out or before the role is known', () => {
    expect(staffAccess({ signedIn: false, resolved: true, role: 'ADMIN' })).toBe('wait');
    expect(staffAccess({ signedIn: true, resolved: false, role: null })).toBe('wait');
  });

  it('sends a customer away from every staff screen', () => {
    for (const section of ['console', 'orders', 'approvals', 'complaints', 'notes', undefined])
      expect(staffAccess({ ...on, role: null, section })).toBe('deny');
    expect(staffHomeFor(null)).toBe('/(tabs)');
  });

  it('lets admin and super admin in everywhere', () => {
    for (const role of ['ADMIN', 'SUPER_ADMIN'])
      expect(staffAccess({ ...on, role, section: 'complaints' })).toBe('allow');
  });

  it('keeps procurement and fulfilment to their own screen and the notes', () => {
    expect(staffAccess({ ...on, role: 'PROCUREMENT', section: 'procurement' })).toBe('allow');
    expect(staffAccess({ ...on, role: 'PROCUREMENT', section: 'notes' })).toBe('allow');
    expect(staffAccess({ ...on, role: 'PROCUREMENT', section: 'console' })).toBe('deny');
    expect(staffAccess({ ...on, role: 'FULFILMENT', section: 'approvals' })).toBe('deny');
    expect(staffHomeFor('FULFILMENT')).toBe('/staff/fulfilment');
  });
});

const resp = (id, action = 'SKIP_DAY', date = 1763700000000) => ({
  actionIdentifier: action,
  notification: { date, request: { identifier: id, content: { data: {} } } },
});

describe('handled notification responses', () => {
  function disk() {
    let saved = null;
    return { load: () => saved, save: (k) => (saved = k), peek: () => saved };
  }

  it('acts on a response once', () => {
    const d = disk();
    const h = createHandledResponses(d);
    expect(h.claim(resp('n1'))).toBe(true);
    expect(h.claim(resp('n1'))).toBe(false);
  });

  it('does not replay after a relaunch (a fresh instance over the same storage)', () => {
    const d = disk();
    createHandledResponses(d).claim(resp('n1'));
    const afterRelaunch = createHandledResponses(d);
    expect(afterRelaunch.claim(resp('n1'))).toBe(false);
  });

  it('treats a different button or a later delivery of the same id as new', () => {
    const h = createHandledResponses(disk());
    expect(h.claim(resp('n1', 'SKIP_DAY'))).toBe(true);
    expect(h.claim(resp('n1', 'CONFIRM'))).toBe(true);
    expect(h.claim(resp('n1', 'SKIP_DAY', 1763786400000))).toBe(true);
  });

  it('ignores responses with no id, and keeps the stored list bounded', () => {
    const d = disk();
    const h = createHandledResponses(d);
    expect(h.claim({})).toBe(false);
    expect(responseKey(null)).toBe(null);
    for (let i = 0; i < MAX_HANDLED + 10; i++) h.claim(resp(`n${i}`));
    expect(d.peek()).toHaveLength(MAX_HANDLED);
  });

  it('survives unreadable storage', () => {
    const h = createHandledResponses({
      load: () => {
        throw new Error('no db');
      },
      save: () => {
        throw new Error('no db');
      },
    });
    expect(h.claim(resp('n1'))).toBe(true);
    expect(h.claim(resp('n1'))).toBe(false);
  });
});
