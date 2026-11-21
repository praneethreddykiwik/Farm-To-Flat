/**
 * The vision model gets a 640 px copy of the photo (21 Nov 2026): fewer tokens on Groq's free plan,
 * a faster upload to the model, and the stored photo untouched.
 */
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { shrinkForVision, toDataUrl, VISION_MAX_SIDE } from '../src/lib/vision-image.js';
import { catalogueForPrompt, systemPrompt } from '../src/lib/identify.js';

/** A camera-sized photo: 4032×3024 of busy detail, saved the way the app saves it (JPEG q55). */
async function cameraPhoto({ orientation } = {}) {
  const w = 4032;
  const h = 3024;
  const noise = Buffer.alloc(w * h * 3);
  for (let i = 0; i < noise.length; i += 1) noise[i] = (i * 2654435761) >>> 24;
  let img = sharp(noise, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 55 });
  if (orientation) img = img.withMetadata({ orientation });
  return img.toBuffer();
}

describe('shrinking a photo for the vision model', () => {
  it('a 12 MP camera photo becomes a 640 px JPEG, many times smaller, quickly', async () => {
    const big = await cameraPhoto();
    const out = await shrinkForVision(big, 'image/jpeg');
    expect(out.shrunk).toBe(true);
    expect(out.contentType).toBe('image/jpeg');
    expect(Math.max(out.to.width, out.to.height)).toBe(VISION_MAX_SIDE);
    expect(out.from).toEqual({ width: 4032, height: 3024 });
    expect(out.buffer.length * 5).toBeLessThan(big.length);
    expect(out.ms).toBeLessThan(1500);
  });

  it('turns a sideways camera photo upright', async () => {
    const big = await cameraPhoto({ orientation: 6 }); // phone held upright: stored rotated 90°
    const out = await shrinkForVision(big, 'image/jpeg');
    expect(out.to.height).toBeGreaterThan(out.to.width);
  });

  it('leaves a small photo as it is', async () => {
    const small = await sharp({
      create: { width: 300, height: 200, channels: 3, background: '#3a7' },
    })
      .jpeg({ quality: 70 })
      .toBuffer();
    const out = await shrinkForVision(small, 'image/jpeg');
    expect(out.buffer.length).toBeLessThanOrEqual(small.length);
  });

  it('sends the original if the image cannot be read, rather than failing the search', async () => {
    const junk = Buffer.from('not really an image');
    const out = await shrinkForVision(junk, 'image/png');
    expect(out.shrunk).toBe(false);
    expect(out.buffer).toBe(junk);
    expect(toDataUrl(out)).toMatch(/^data:image\/png;base64,/);
  });
});

describe('the catalogue the vision model reads', () => {
  const products = [
    { id: 'p_tomato', name: 'Tomato', aliases: ['tamata', 'tamatar', 'టమాటా'] },
    { id: 'p_ridge', name: 'Ridge gourd', aliases: ['beerakaya', 'turai', 'బీరకాయ', 'तोरई'] },
  ];

  it('keeps English and romanised names, drops Telugu and Devanagari script', () => {
    const c = catalogueForPrompt(products);
    expect(c).toContain('Tomato (tamata, tamatar)');
    expect(c).toContain('Ridge gourd (beerakaya, turai)');
    expect(c).not.toMatch(/[\p{Script=Telugu}\p{Script=Devanagari}]/u);
    expect(systemPrompt(products)).not.toMatch(/[\p{Script=Telugu}\p{Script=Devanagari}]/u);
  });
});
