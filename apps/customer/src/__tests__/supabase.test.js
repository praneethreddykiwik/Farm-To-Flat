import { describe, expect, it, vi } from 'vitest';

// The resolver reads env.supabaseUrl; pin it so the test is independent of the local .env.
vi.mock('../lib/env', () => ({
  env: { supabaseUrl: 'https://proj.supabase.co', supabaseAnonKey: 'anon' },
}));

const { resolveStorageImage, storagePublicUrl, renderedUrl, snapWidth } = await import(
  '../lib/supabase'
);

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

  it('without a width, serves the original — existing callers are unaffected', () => {
    expect(resolveStorageImage('product-images/p_palak.jpg')).toBe(
      'https://proj.supabase.co/storage/v1/object/public/product-images/p_palak.jpg',
    );
  });
});

describe('rendered (resized) image URLs', () => {
  const ORIGINAL = 'https://proj.supabase.co/storage/v1/object/public/product-images/p_palak.jpg';

  it('rewrites our own Storage URL to the render endpoint at the asked width', () => {
    expect(renderedUrl(ORIGINAL, 240)).toBe(
      'https://proj.supabase.co/storage/v1/render/image/public/product-images/p_palak.jpg?width=240&quality=70&resize=contain',
    );
  });

  it('works from a bucket-relative path too, via resolveStorageImage', () => {
    expect(resolveStorageImage('product-images/p_palak.jpg', undefined, 120)).toBe(
      'https://proj.supabase.co/storage/v1/render/image/public/product-images/p_palak.jpg?width=120&quality=70&resize=contain',
    );
  });

  it('snaps to the ladder rather than asking for a pixel-perfect width', () => {
    expect(snapWidth(1)).toBe(120);
    expect(snapWidth(120)).toBe(120);
    expect(snapWidth(121)).toBe(240);
    expect(snapWidth(500)).toBe(960);
    expect(snapWidth(99999)).toBe(960); // clamped, never an unbounded request
  });

  it('leaves third-party hosts alone — they do not understand these parameters', () => {
    const unsplash = 'https://images.unsplash.com/photo-1.jpg?w=800';
    expect(renderedUrl(unsplash, 240)).toBe(unsplash);
    expect(resolveStorageImage(unsplash, undefined, 240)).toBe(unsplash);
  });

  it('does not double-rewrite a URL that is already a render URL', () => {
    const already = renderedUrl(ORIGINAL, 240);
    expect(renderedUrl(already, 480)).toBe(already);
  });

  it('passes through null/empty untouched', () => {
    expect(renderedUrl(null, 240)).toBeNull();
    expect(renderedUrl('', 240)).toBe('');
  });
});
