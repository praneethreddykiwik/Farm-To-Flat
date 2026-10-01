/**
 * Delivery window names in the reader's language — without rewriting the operator's own words.
 *
 * Keys are immutable once issued, so a MORNING window whose label now reads "Early run" has been
 * deliberately renamed. Translating that to "ఉదయం" would be putting words in the operator's mouth,
 * so we translate only while the label is still the canonical English for the key.
 */
import { describe, expect, it } from 'vitest';
import { windowHours, windowLabel } from '../lib/dates.js';

describe('window labels', () => {
  it('translates the familiar windows', () => {
    expect(windowLabel('MORNING', null, 'te')).toBe('ఉదయం');
    expect(windowLabel('EVENING', null, 'hi')).toBe('शाम');
    expect(windowLabel('MORNING', { label: 'Morning' }, 'hi')).toBe('सुबह');
  });

  it('leaves English alone', () => {
    expect(windowLabel('MORNING', null, 'en')).toBe('Morning');
    expect(windowLabel('MORNING', null, undefined)).toBe('Morning');
  });

  it('keeps a name the operator chose, in every language', () => {
    for (const lang of ['en', 'hi', 'te'])
      expect(windowLabel('MORNING', { label: 'Early run' }, lang)).toBe('Early run');
  });

  it('falls back to the server label for a window it has no translation for', () => {
    expect(windowLabel('LATE_NIGHT', { label: 'Late night' }, 'te')).toBe('Late night');
  });

  it('derives something readable from the key when nothing else is known', () => {
    expect(windowLabel('LATE_NIGHT', null, 'te')).toBe('Late night');
    expect(windowLabel('', null, 'te')).toBe('');
  });
});

describe('window hours', () => {
  it('translates only the am/pm markers — digits read the same everywhere', () => {
    expect(windowHours('MORNING', { hours: '6:00 am – 12:00 pm' }, 'te')).toBe('6:00 ఉ – 12:00 సా');
    expect(windowHours('MORNING', { hours: '6:00 am – 12:00 pm' }, 'hi')).toBe(
      '6:00 पूर्वाह्न – 12:00 अपराह्न',
    );
  });

  it('leaves English untouched and returns nothing when the hours are unknown', () => {
    expect(windowHours('MORNING', { hours: '6:00 am – 12:00 pm' }, 'en')).toBe(
      '6:00 am – 12:00 pm',
    );
    expect(windowHours('GONE', null, 'te')).toBe('');
  });
});
