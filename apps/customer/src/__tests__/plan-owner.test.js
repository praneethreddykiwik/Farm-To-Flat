/**
 * Review #35 (21 Nov 2026): the diet profile (age, weight, health conditions) must not outlive a
 * sign-out, and must never become the NEXT account's plan.
 */
import { describe, expect, it, vi } from 'vitest';

const store = new Map();
vi.mock('../lib/kv', () => ({
  kv: {
    getJSON: (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
    setJSON: (k, v) => store.set(k, JSON.stringify(v)),
    remove: (k) => store.delete(k),
  },
  KV_KEYS: { plan: 'plan.v1' },
}));

const { default: reducer, profileUpdated } = await import('../features/plan/planSlice.js');

const signedIn = (id) => ({
  type: 'auth/signedIn',
  payload: { accessToken: 't', customer: { id } },
});
const signedOut = (reason) => ({ type: 'auth/signedOut', payload: { reason } });

describe('whose plan is on this phone', () => {
  it('signing out clears the profile and the stored copy', () => {
    let s = reducer(undefined, signedIn('cus_a'));
    s = reducer(s, profileUpdated({ age: 41, weightKg: 80, conditions: 'diabetes' }));
    expect(store.get('plan.v1')).toContain('diabetes');
    s = reducer(s, signedOut('user'));
    expect(s.profile.age).toBe('');
    expect(s.owner).toBeNull();
    expect(store.has('plan.v1')).toBe(false);
  });

  it('an expired session keeps it for the same person', () => {
    let s = reducer(undefined, signedIn('cus_b'));
    s = reducer(s, profileUpdated({ age: 30 }));
    s = reducer(s, signedOut('expired'));
    s = reducer(s, signedIn('cus_b'));
    expect(s.profile.age).toBe(30);
  });

  it('a DIFFERENT person signing in after an expiry gets a blank planner', () => {
    let s = reducer(undefined, signedIn('cus_c'));
    s = reducer(s, profileUpdated({ age: 52, conditions: 'BP' }));
    s = reducer(s, signedOut('expired'));
    s = reducer(s, signedIn('cus_d'));
    expect(s.profile.age).toBe('');
    expect(s.profile.conditions).toBeUndefined();
    expect(s.owner).toBe('cus_d');
  });

  it('an older copy with no owner is adopted by the first account, not wiped', () => {
    let s = reducer(undefined, { type: '@@init' });
    s = reducer(s, profileUpdated({ age: 28 }));
    s = { ...s, owner: null };
    s = reducer(s, signedIn('cus_e'));
    expect(s.profile.age).toBe(28);
    expect(s.owner).toBe('cus_e');
  });
});
