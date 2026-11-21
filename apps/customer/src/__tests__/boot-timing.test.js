/**
 * A slow start-up is reported with its timings (21 Nov 2026): the opening logo sat on the owner's
 * phone with no way to see why. Quick starts are not reported; slow ones name their slowest step.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  _resetBoot,
  bootMarks,
  markBoot,
  MAX_HOLD_MS,
  slowBootReport,
  SLOW_BOOT_MS,
} from '../lib/bootTiming';
import { SLOW_AFTER_MS } from '../features/auth/restoreSession';

describe('start-up timings', () => {
  beforeEach(() => _resetBoot());

  it('records each step once, from the first time it happens', () => {
    const t = Date.now();
    markBoot('ready', t);
    markBoot('ready', t + 9999);
    expect(Object.keys(bootMarks())).toEqual(['ready']);
  });

  it('says nothing about a quick start', () => {
    expect(slowBootReport({ ready: 400, 'auth.signedIn': 900, introDone: 2100 })).toBeNull();
  });

  it('reports a slow start and names the slowest step', () => {
    const r = slowBootReport({ ready: 300, 'auth.reconnecting': 6200, introDone: 6600 });
    expect(r.total).toBe(6600);
    expect(r.slowest).toBe('auth.reconnecting');
    expect(r.marks.ready).toBe(300);
  });

  it('only numbers and step names are in a report — nothing about the customer', () => {
    const r = slowBootReport({ ready: 9000, introDone: 9100 });
    for (const v of Object.values(r.marks)) expect(typeof v).toBe('number');
    expect(SLOW_BOOT_MS).toBe(5000);
  });
});

describe('the logo never holds the app for long', () => {
  it('a slow sign-in says "reconnecting" after 3 seconds, and the logo waits at most 2.5 s once drawn', () => {
    expect(SLOW_AFTER_MS).toBeLessThanOrEqual(3000);
    expect(MAX_HOLD_MS).toBeLessThanOrEqual(2500);
  });
});
