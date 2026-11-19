/**
 * POST /api/v1/events — the few tracking events only the phone can see (Rapture7 brief): the Play
 * install referrer, checkout opened, invite shared, reorder tapped, voice used, reminder opened.
 * Signed-in only; an allowlist of names; small flat properties; capped per customer per day so a
 * misbehaving client cannot fill the table.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../http.js';
import { validateBody } from '../validate.js';
import { CLIENT_EVENTS, listEvents, track } from '../lib/events.js';
import { getOps, listOps, putOpsSoft } from '../ops-store.js';
import { todayISO } from '../lib/dates.js';

const LINK_TAGS_PER_DAY = 300;

export const eventsRouter = Router();

export const CLIENT_EVENTS_PER_DAY = 300;

eventsRouter.post(
  '/',
  validateBody(
    z.object({
      name: z.enum(/** @type {[string, ...string[]]} */ (CLIENT_EVENTS)),
      props: z
        .record(z.string(), z.union([z.string().max(120), z.number(), z.boolean(), z.null()]))
        .optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const since = Date.now() - 864e5;
    const mine = listEvents({ fromMs: since }).filter(
      (e) => e.customerId === req.customerId,
    ).length;
    if (mine >= CLIENT_EVENTS_PER_DAY) throw fail(429, 'RATE_LIMITED', 'Too many events.');
    track(req.body.name, req.body.props || {}, { customerId: req.customerId });
    res.status(202).json({ ok: true });
  }),
);

/**
 * POST /api/v1/links/click — PUBLIC. fooducia.health/go (a counter QR, a WhatsApp post, an invite)
 * counts the scan before sending the phone to the store, so a counter session's scans can be set
 * against its installs. Anonymous on purpose: a daily count per tag — no IP, no device, no cookie.
 */
export const linksRouter = Router();
const tagPart = z
  .string()
  .max(40)
  .regex(/^[A-Za-z0-9_-]*$/)
  .optional();
linksRouter.post(
  '/click',
  validateBody(z.object({ src: tagPart, p: tagPart, c: tagPart, r: tagPart })),
  asyncHandler(async (req, res) => {
    const { src = '', p = '', c = '' } = req.body;
    if (!src && !p) return res.status(202).json({ ok: true });
    const day = todayISO();
    const id = `${day}:${src.toLowerCase()}:${p.toUpperCase()}:${c.toLowerCase()}`;
    const cur = getOps('linkClick', id);
    // At most 300 distinct tags a day: a made-up tag cannot grow the table without limit.
    if (!cur && listOps('linkClick').filter((k) => k.day === day).length >= LINK_TAGS_PER_DAY)
      return res.status(202).json({ ok: true });
    putOpsSoft('linkClick', id, {
      day,
      src: src.toLowerCase(),
      p: p.toUpperCase() || null,
      c: c.toLowerCase() || null,
      n: (cur?.n || 0) + 1,
    });
    res.status(202).json({ ok: true });
  }),
);
