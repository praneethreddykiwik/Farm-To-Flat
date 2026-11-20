/** The crash screen's Reload button (review #43, 21 Nov 2026). */
import { describe, expect, it, vi } from 'vitest';
import { reloadApp } from '../lib/reloadApp';

describe('reloadApp', () => {
  it('uses expo-updates in a release build', async () => {
    const updates = { reloadAsync: vi.fn(async () => {}) };
    const reset = vi.fn();
    await expect(reloadApp({ updates, isDev: false, reset })).resolves.toBe('updates');
    expect(reset).not.toHaveBeenCalled();
  });

  it('falls back to a reset when reloadAsync fails', async () => {
    const updates = { reloadAsync: vi.fn(async () => Promise.reject(new Error('nope'))) };
    const reset = vi.fn();
    await expect(reloadApp({ updates, isDev: false, reset })).resolves.toBe('reset');
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('uses DevSettings in development, never reloadAsync', async () => {
    const updates = { reloadAsync: vi.fn() };
    const devSettings = { reload: vi.fn() };
    await expect(reloadApp({ updates, devSettings, isDev: true, reset: vi.fn() })).resolves.toBe(
      'dev',
    );
    expect(updates.reloadAsync).not.toHaveBeenCalled();
  });

  it('resets when there is nothing to reload with', async () => {
    const reset = vi.fn();
    await expect(reloadApp({ updates: null, isDev: false, reset })).resolves.toBe('reset');
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
