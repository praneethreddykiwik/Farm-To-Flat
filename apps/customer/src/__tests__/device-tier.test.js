/** Which phones the app goes easy on. */
import { describe, expect, it } from 'vitest';
import { isLowEnd } from '../lib/deviceTierRule';

const GB = 2 ** 30;

describe('a phone to go easy on', () => {
  it('is an Android phone with 4 GB of memory or less', () => {
    expect(isLowEnd({ os: 'android', totalMemoryBytes: 3.7 * GB, screenWidthPx: 1080 })).toBe(true);
    expect(isLowEnd({ os: 'android', totalMemoryBytes: 2.5 * GB, screenWidthPx: 1080 })).toBe(true);
  });

  it('is an Android phone built around a 720-pixel screen, whatever its memory', () => {
    expect(isLowEnd({ os: 'android', totalMemoryBytes: 5.6 * GB, screenWidthPx: 720 })).toBe(true);
  });

  it('is not a phone with more memory and a full-HD screen', () => {
    expect(isLowEnd({ os: 'android', totalMemoryBytes: 5.6 * GB, screenWidthPx: 1080 })).toBe(
      false,
    );
    expect(isLowEnd({ os: 'android', totalMemoryBytes: 7.5 * GB, screenWidthPx: 1220 })).toBe(
      false,
    );
  });

  it('is not decided by the year the system gives a phone, which stops at 2016 for all of them', () => {
    expect(
      isLowEnd({
        os: 'android',
        totalMemoryBytes: 7.5 * GB,
        screenWidthPx: 1220,
        yearClass: 2016,
      }),
    ).toBe(false);
  });

  it('is never an iPhone', () => {
    expect(isLowEnd({ os: 'ios', totalMemoryBytes: 3 * GB, screenWidthPx: 640 })).toBe(false);
  });

  it('is judged by the screen alone when the phone will not say how much memory it has', () => {
    expect(isLowEnd({ os: 'android', totalMemoryBytes: null, screenWidthPx: 720 })).toBe(true);
    expect(isLowEnd({ os: 'android', totalMemoryBytes: null, screenWidthPx: 1080 })).toBe(false);
    expect(isLowEnd({ os: 'android' })).toBe(false);
    expect(isLowEnd()).toBe(false);
  });
});
