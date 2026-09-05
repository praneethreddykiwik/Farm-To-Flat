import { describe, expect, it, vi } from 'vitest';

// The resolver reads env.supabaseUrl; pin it so the test is independent of the local .env.
vi.mock('../lib/env', () => ({
  env: { supabaseUrl: 'https://proj.supabase.co', supabaseAnonKey: 'anon' },
}));

const { resolveStorageImage, storagePublicUrl } = await import('../lib/supabase');

describe('supabase storage resolver (read-only)', () => {
  it('passes absolute and data URLs through unchanged', () => {
    const http = 'https://images.unsplash.com/photo-1.jpg?w=800';
    expect(resolveStorageImage(http)).toBe(http);
    expect(resolveStorageImage('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });

  it('turns a bucket-relative path into a public Storage URL', () => {
    expect(resolveStorageImage('product-images/p_palak.jpg')).toBe(
      'https://proj.supabase.co/storage/v1/object/public/product-images/p_palak.jpg',
    );
  });

  it('applies the default bucket to a bare key and strips leading slashes', () => {
    expect(storagePublicUrl('/p_tomato.jpg')).toBe(
      'https://proj.supabase.co/storage/v1/object/public/product-images/p_tomato.jpg',
    );
  });

  it('returns null for empty input so the caller shows its fallback tile', () => {
    expect(resolveStorageImage(null)).toBeNull();
    expect(resolveStorageImage('')).toBeNull();
    expect(resolveStorageImage(undefined)).toBeNull();
  });
});
