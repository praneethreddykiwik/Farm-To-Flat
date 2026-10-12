import { describe, expect, it } from 'vitest';
import { assertRealImage, sniffImageType, allowedImageTypes } from '../src/lib/storage.js';

/** Minimal real file signatures. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);
// An HTML file with an SVG-ish payload, labelled as a PNG — the classic upload trick.
const HTML_AS_PNG = Buffer.from('<html><script>alert(1)</script></html>', 'latin1');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

describe('sniffing an image by its bytes', () => {
  it('recognises the real formats', () => {
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(WEBP)).toBe('image/webp');
  });
  it('returns null for things that are not images', () => {
    expect(sniffImageType(HTML_AS_PNG)).toBeNull();
    expect(sniffImageType(SVG)).toBeNull();
    expect(sniffImageType(Buffer.from('nope'))).toBeNull();
  });
});

describe('assertRealImage — the upload gate', () => {
  it('passes a real PNG declared as PNG', () => {
    expect(() => assertRealImage(PNG, 'image/png')).not.toThrow();
  });

  it('rejects HTML bytes wearing a PNG label — the actual attack', () => {
    expect(() => assertRealImage(HTML_AS_PNG, 'image/png')).toThrow(
      /not a recognised image|not a/i,
    );
  });

  it('rejects an SVG even if declared image/png — SVG is where upload-XSS lives', () => {
    expect(() => assertRealImage(SVG, 'image/png')).toThrow();
  });

  it('rejects a real JPEG that lies and says it is a PNG', () => {
    expect(() => assertRealImage(JPEG, 'image/png')).toThrow(/is a image\/jpeg, not a image\/png/);
  });

  it('rejects a type that is not on the whitelist at all', () => {
    expect(() => assertRealImage(SVG, 'image/svg+xml')).toThrow(/Unsupported/);
    expect(allowedImageTypes).not.toContain('image/svg+xml');
  });

  it('attaches a 422 status and a code for the HTTP layer', () => {
    try {
      assertRealImage(HTML_AS_PNG, 'image/png');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.status).toBe(422);
      expect(e.code).toBe('NOT_AN_IMAGE');
    }
  });
});
