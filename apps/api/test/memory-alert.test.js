/** Review #16 follow-up: one Sentry alert when memory passes the threshold. */
import { describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
vi.mock('../src/lib/sentry.js', () => ({ reportError: vi.fn(), sentryEnabled: false }));
const { checkMemoryPressure } = await import('../src/lib/memory-log.js');
const { reportError } = await import('../src/lib/sentry.js');

describe('memory alert', () => {
  it('stays quiet below 70%, alerts once above it', () => {
    expect(checkMemoryPressure({ rssMb: 300 }, 512, 70)).toBe(false);
    expect(checkMemoryPressure({ rssMb: 400 }, 512, 70)).toBe(true);
    expect(checkMemoryPressure({ rssMb: 450 }, 512, 70)).toBe(false);
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});
