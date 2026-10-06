/**
 * Private media, served by us.
 *
 * Deliberately NOT behind requireAuth or adminAuth: this is loaded by a plain `<img src>`, which
 * cannot send an Authorization header. The TOKEN is the credential — an HMAC over the object path
 * and an expiry, minted only into responses the caller was already allowed to see. It cannot be
 * guessed, it cannot be edited to point at somebody else's photograph, and it stops working on its
 * own after a shift.
 *
 * It exists because handing the browser a third-party storage URL meant the image only loaded if the
 * customer's network could reach that provider — and on at least one large Indian ISP it cannot.
 * See lib/media.js for the measurement.
 */
import { Router } from 'express';
import { readMediaToken } from '../lib/media.js';
import { downloadIssuePhoto, storageEnabled } from '../lib/storage.js';
import { rateLimit, ipOf } from '../lib/rate-limit.js';

export const mediaRouter = Router();

mediaRouter.get(
  '/issue/:token',
  // A token is unguessable, so this is not an access control — it is a ceiling on how hard one
  // leaked link can be used to hammer the origin.
  rateLimit({
    windowMs: 60 * 1000,
    max: 240,
    key: (req) => `media:${ipOf(req)}`,
  }),
  async (req, res) => {
    if (!storageEnabled) return res.status(503).end();
    const path = readMediaToken(req.params.token);
    // One answer for forged, edited and expired alike: a 404 tells a prober nothing about which.
    if (!path) return res.status(404).end();

    const file = await downloadIssuePhoto(path);
    if (!file) return res.status(404).end();

    res.set({
      'Content-Type': file.contentType,
      'Content-Length': String(file.buffer.length),
      // Private: it is a photograph of someone's kitchen attached to their address. A shared cache
      // must never hold it. The browser may, for less time than the token lives.
      'Cache-Control': 'private, max-age=3600',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.end(file.buffer);
  },
);
