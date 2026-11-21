/**
 * Admin smoke tests (review #52, 21 Nov 2026): the admin console had no test runner at all.
 * These cover the pure helpers money and links depend on, and keep the Hindi and Telugu privacy
 * notices in step with the English one (DPDP §5(3)).
 */
import { describe, expect, it } from 'vitest';
import { inr, toPaise, toRupees } from '../lib/format.js';
import { playUrlFor } from '../lib/storeLinks.js';
import { SECTIONS as EN } from '../screens/Privacy.jsx';
import * as HI from '../screens/privacy/i18n-hi.js';
import * as TE from '../screens/privacy/i18n-te.js';

describe('money', () => {
  it('paise and rupees round-trip without drift', () => {
    expect(toPaise(12.34)).toBe(1234);
    expect(toRupees(1234)).toBe(12.34);
    expect(toPaise(0.1 + 0.2)).toBe(30);
  });
  it('formats rupees with the ₹ sign', () => {
    expect(inr(150000)).toContain('₹');
    expect(inr(150000)).toContain('1,500');
  });
});

describe('store links', () => {
  it('points Android installs at the Play Store listing', () => {
    expect(playUrlFor('stall-01')).toContain('in.fooducia.customer');
  });
});

describe('privacy notice translations', () => {
  const en = EN('support@example.in');
  const vars = {
    CONTACT: 'support@example.in',
    ENTITY: 'E',
    REG_ADDRESS: 'R',
    GRIEVANCE_OFFICER: 'G',
  };
  for (const [name, mod] of [
    ['Hindi', HI],
    ['Telugu', TE],
  ]) {
    it(`${name} has the same sections, paragraphs and list items as the English`, () => {
      const tr = mod.SECTIONS(vars);
      expect(tr.length).toBe(en.length);
      tr.forEach((sec, i) => {
        expect(sec.p?.length || 0, `section ${i + 1} paragraphs`).toBe(en[i].p?.length || 0);
        expect(sec.list?.length || 0, `section ${i + 1} list`).toBe(en[i].list?.length || 0);
        expect(sec.after?.length || 0, `section ${i + 1} after`).toBe(en[i].after?.length || 0);
        expect(sec.h.split('.')[0]).toBe(en[i].h.split('.')[0]);
      });
      expect(JSON.stringify(tr)).toContain('support@example.in');
      expect(mod.META.title).toBeTruthy();
    });
  }
});
