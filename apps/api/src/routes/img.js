/**
 * Public product-image proxy.
 *
 * Why this exists: Indian ISPs (observed: ACT Fibernet / Beam) transparently hijack DNS for
 * *.supabase.co and route it through their own TLS proxy. That proxy tolerates curl but closes the
 * connection during Android okhttp's TLS handshake — so EVERY product image failed to load on real
 * devices (SSLHandshakeException: connection closed), while the app's text and prices loaded fine
 * because the API is behind Cloudflare and is not intercepted.
 *
 * The fix is to stop the client ever talking to supabase.co. The app now points image URLs at this
 * route on api.fooducia.in (already Cloudflare-fronted, not intercepted). We fetch the object from
 * Supabase SERVER-SIDE — Render reaches Supabase's real address, not the ISP's proxy — and stream
 * the bytes back. The client only ever sees our own domain.
 *
 * Reliability and cost:
 *  - We ask Supabase for the WebP transform at the requested width, so the bytes are small.
 *  - We set a one-year immutable Cache-Control. Storage keys are content-addressed (they contain a
 *    timestamp and random suffix and never change), so this is safe, and it lets both expo-image's
 *    on-device cache and Cloudflare's edge cache serve repeats without touching Render.
 *
 * Security: this must never become an open proxy. The only thing a caller controls is the object
 * key within the fixed bucket. We rebuild the upstream URL ourselves from a validated key — no
 * caller-supplied host, scheme, or path traversal reaches fetch().
 */
import { Router } from 'express';
import { fail } from '../http.js';

export const imgRouter = Router();

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const BUCKET = 'product-images';
// Allowed render widths — mirrors the app's ladder so the cache has few variants.
const WIDTHS = new Set([120, 240, 480, 960]);

/** A storage key is `name.ext` with no slashes, no traversal, from the known extensions. */
const KEY_RE = /^[A-Za-z0-9._-]+\.(png|jpe?g|webp|avif)$/;

imgRouter.get('/:key', async (req, res, next) => {
  try {
    if (!SUPABASE_URL) throw fail(501, 'STORAGE_OFF', 'Image storage is not configured.');

    const key = String(req.params.key || '');
    // The one piece of caller input. Reject anything that is not a plain filename in the bucket:
    // no "..", no extra path segments, no query-smuggling. This is what stops it being an SSRF hole.
    if (!KEY_RE.test(key)) throw fail(400, 'BAD_KEY', 'Not a valid image.');

    const w = Number(req.query.w);
    const width = WIDTHS.has(w) ? w : 480;

    // Built entirely from server-side constants plus the validated key. The client never supplies
    // a URL, host or scheme.
    const upstream = `${SUPABASE_URL}/storage/v1/render/image/public/${BUCKET}/${encodeURIComponent(
      key,
    )}?width=${width}&quality=70&resize=contain`;

    const r = await fetch(upstream, {
      headers: { Accept: 'image/webp,image/avif,image/*,*/*' },
    });
    if (!r.ok) {
      // Fall back to the untransformed object: if the transform endpoint is unavailable (plan or
      // quota), the raw object is still served, so an image appears rather than a blank tile.
      const rawUpstream = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(key)}`;
      const raw = await fetch(rawUpstream);
      if (!raw.ok)
        throw fail(raw.status === 404 ? 404 : 502, 'IMAGE_UNAVAILABLE', 'Image unavailable.');
      return stream(raw, res);
    }
    return stream(r, res);
  } catch (e) {
    next(e);
  }
});

/** Copy an upstream image response to the client with an immutable cache and no leaked headers. */
async function stream(upstream, res) {
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.set('Content-Type', upstream.headers.get('content-type') || 'image/webp');
  // Content-addressed keys never change, so a long immutable cache is safe and is what lets
  // Cloudflare and the device cache carry the load instead of Render.
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('X-Content-Type-Options', 'nosniff');
  // These are public product images, deliberately embedded cross-origin: the admin console on
  // fooducia.in and the marketing site load them from api.fooducia.in via <img>. The app sets a
  // global Cross-Origin-Resource-Policy of same-origin (helmet), which a browser enforces on
  // embeds — it blocks the <img> and the thumbnail falls back to a letter tile. (curl, direct
  // navigation and the native app ignore CORP, which is why only the browser consoles broke.)
  // Override it here to cross-origin so these one bucket of public images can be embedded.
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.send(buf);
}
