/**
 * Shrink a photograph before it is sent to the vision model (21 Nov 2026).
 *
 * The app sends the photo straight from the camera — often 12 megapixels, 350–550 KB. Recognising
 * a vegetable, or the dishes on a plate, needs nothing like that, so the copy that goes to the
 * model is scaled to 640 px on the long side, turned upright from the camera's orientation, and
 * re-encoded as a JPEG (about 40–55 KB). The photo we STORE (complaints, meal log) is untouched —
 * only the model's copy shrinks.
 *
 * Measured against Groq on 21 Nov 2026 (4 products, full photo vs this copy): the same answers,
 * about 10× less data sent and replies about 27% faster (1.41 s → 1.02 s on average); the shrink
 * itself takes ~40 ms. It does NOT save tokens: Groq's vision model charges a fixed ~2,200 tokens
 * per image whatever its size (a 320 px copy and `detail: "low"` cost exactly the same). The
 * token saving on photos comes from the shorter catalogue in lib/identify.js instead.
 *
 * If anything goes wrong while shrinking, the original is sent: a slower call is better than a
 * failed search.
 */
import sharp from 'sharp';

/** Longest side, in pixels, of the copy the model sees. */
export const VISION_MAX_SIDE = 640;
/** JPEG quality of that copy: plenty for recognition, small on the wire. */
export const VISION_JPEG_QUALITY = 80;

/**
 * @param {Buffer} buffer  the photo as uploaded (already checked to be a real image)
 * @param {string} contentType  its declared type
 * @returns {Promise<{ buffer: Buffer, contentType: string, shrunk: boolean, ms: number,
 *   from?: { width: number, height: number }, to?: { width: number, height: number } }>}
 */
export async function shrinkForVision(buffer, contentType) {
  const started = Date.now();
  try {
    const img = sharp(buffer, { failOn: 'none', limitInputPixels: 50_000_000 });
    const meta = await img.metadata();
    const out = await img
      .rotate() // honour the camera's orientation flag, then drop it
      .resize({
        width: VISION_MAX_SIDE,
        height: VISION_MAX_SIDE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: VISION_JPEG_QUALITY, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    // Never make it bigger: a small, already-compressed photo goes as it came.
    if (out.data.length >= buffer.length)
      return { buffer, contentType, shrunk: false, ms: Date.now() - started };
    return {
      buffer: out.data,
      contentType: 'image/jpeg',
      shrunk: true,
      ms: Date.now() - started,
      from: { width: meta.width || 0, height: meta.height || 0 },
      to: { width: out.info.width, height: out.info.height },
    };
  } catch {
    return { buffer, contentType, shrunk: false, ms: Date.now() - started };
  }
}

/** The data URL the vision API takes. */
export const toDataUrl = ({ buffer, contentType }) =>
  `data:${contentType};base64,${buffer.toString('base64')}`;
