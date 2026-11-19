/**
 * Customer side of growth (17 Nov 2026 review). All signed-in.
 *
 *   GET    /growth/invite                 my invite code, what it earns, how many joined
 *   POST   /growth/check-code             is this promoter / invite code good for my next order?
 *   GET    /growth/first-order            should checkout ask "How did you hear about us?"
 *   GET    /growth/waitlist?q=            communities we are coming to, and how many are waiting
 *   POST   /growth/waitlist/:id/join      count me in          DELETE … leave
 *   POST   /growth/community-requests     "my community isn't listed" — name it, and join its list
 *
 * Privacy: a waitlist join stores only the account id (the number is on the account already) and
 * is used for one thing — telling the person when delivery starts. Requests are capped per day.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../http.js';
import { validateBody } from '../validate.js';
import { listOrdersForCustomer } from '../store.js';
import { wasPlaced } from '../lib/customer-history.js';
import { id as newId } from '../lib/ids.js';
import { getOps, listOps, putOps, putOpsSoft, removeOps, getSettings } from '../ops-store.js';
import { HEARD_FROM, HEARD_FROM_ASKED, checkCode, inviteSummary } from '../lib/growth.js';
import { todayISO } from '../lib/dates.js';
import { track } from '../lib/events.js';

export const growthRouter = Router();

const isFirstOrderFor = (cid) => !listOrdersForCustomer(cid).some(wasPlaced);

/** The public link a code is shared on — the website page that explains it and links the app. */
// /go reads the tag on an Android phone and hands it to the Play Store as the install referrer, so
// the app knows the invite before anything is typed; other phones see the code on the /join page.
const shareLink = (code) => `https://fooducia.health/go?src=referral&r=${encodeURIComponent(code)}`;

growthRouter.get(
  '/invite',
  asyncHandler(async (req, res) => {
    const s = inviteSummary(req.customerId);
    const rupees = Math.round(Number(s.rewardPaise) / 100);
    if (!s.code)
      return res.json({
        ...s,
        link: null,
        shareText: null,
        howItWorks: 'Invites are coming soon. Check back in a few days.',
      });
    res.json({
      ...s,
      link: shareLink(s.code),
      shareText:
        `I order my vegetables from Fooducia — harvested after you order and at the door by breakfast. ` +
        `Use my code ${s.code} on your first order. ${shareLink(s.code)}`,
      howItWorks: s.enabled
        ? `Share your code. When a neighbour's first order is delivered, ₹${rupees} lands in your Fooducia wallet.`
        : 'Invites are paused right now — you can still share Fooducia with your neighbours.',
    });
  }),
);

growthRouter.post(
  '/check-code',
  validateBody(z.object({ code: z.string().trim().max(20) })),
  asyncHandler(async (req, res) => {
    const r = checkCode(req.body.code, {
      customerId: req.customerId,
      isFirstOrder: isFirstOrderFor(req.customerId),
    });
    if (!r.ok) return res.status(422).json({ error: { code: 'BAD_CODE', message: r.message } });
    if (r.neutral)
      return res.json({
        ok: true,
        kind: 'NEIGHBOUR_NUMBER',
        message:
          'Thanks — if your neighbour is on Fooducia, they will be thanked once your first order arrives.',
      });
    const k = r.resolved;
    res.json({
      ok: true,
      kind: k?.kind || null,
      message:
        k?.kind === 'PROMOTER'
          ? `Thanks! ${k.promoter.name}${k.promoter.stall ? ` at ${k.promoter.stall}` : ''} will be credited for helping you.`
          : k?.kind === 'INVITE'
            ? 'Invite code added — your neighbour will be thanked once your first order arrives.'
            : null,
    });
  }),
);

growthRouter.get(
  '/first-order',
  asyncHandler(async (req, res) => {
    const first = isFirstOrderFor(req.customerId);
    const s = getSettings('growth');
    res.json({
      isFirstOrder: first,
      askHeardFrom: first && !!s.askHeardFrom && !getOps('attribution', req.customerId),
      // Required before the first order (the brief): the app will not place it unanswered.
      required: true,
      options: HEARD_FROM_ASKED.map((key) => ({ key, label: HEARD_FROM[key] })),
    });
  }),
);

// ── waitlist ────────────────────────────────────────────────────────────────

function view(w, cid, threshold) {
  const joins = listOps('waitlistJoin').filter((j) => j.waitlistId === w.id);
  return {
    id: w.id,
    name: w.name,
    area: w.area || null,
    waiting: joins.length,
    threshold,
    joined: joins.some((j) => j.customerId === cid),
    mine: w.requestedBy === cid,
    status: w.status || 'WAITLIST',
  };
}

growthRouter.get(
  '/waitlist',
  asyncHandler(async (req, res) => {
    const cid = req.customerId;
    const threshold = getSettings('growth').waitlistOpenAt;
    const q = String(req.query.q || '')
      .trim()
      .toLowerCase();
    // Shown to everyone: communities the team put on the list. A customer's own request is shown
    // only to them until the team has looked at it — a free-text name is not published unchecked.
    const list = listOps('waitlist')
      .filter(
        (w) =>
          (w.status || 'WAITLIST') === 'WAITLIST' ||
          (w.status === 'REQUESTED' && w.requestedBy === cid),
      )
      .filter((w) => !q || `${w.name} ${w.area || ''}`.toLowerCase().includes(q))
      .map((w) => view(w, cid, threshold))
      .sort(
        (a, b) =>
          Number(b.joined) - Number(a.joined) ||
          b.waiting - a.waiting ||
          a.name.localeCompare(b.name),
      );
    res.json({
      waitlist: list,
      threshold,
      message: `When ${threshold} households from a community are waiting, we plan our next opening there. Invite your neighbours to get there sooner.`,
    });
  }),
);

growthRouter.post(
  '/waitlist/:id/join',
  asyncHandler(async (req, res) => {
    const w = getOps('waitlist', req.params.id);
    const cid = req.customerId;
    if (
      !w ||
      !['WAITLIST', 'REQUESTED'].includes(w.status || 'WAITLIST') ||
      (w.status === 'REQUESTED' && w.requestedBy !== cid)
    )
      throw fail(404, 'NOT_FOUND', 'That community isn’t on our list.');
    const already = !!getOps('waitlistJoin', `${w.id}:${cid}`);
    await putOps('waitlistJoin', `${w.id}:${cid}`, {
      waitlistId: w.id,
      customerId: cid,
      at: new Date().toISOString(),
    });
    if (!already)
      track(
        'waitlist_vote',
        { community: w.name, area: w.area || null, via: 'waitlist' },
        { customerId: cid },
      );
    res.json({ community: view(w, cid, getSettings('growth').waitlistOpenAt) });
  }),
);

growthRouter.delete(
  '/waitlist/:id/join',
  asyncHandler(async (req, res) => {
    const w = getOps('waitlist', req.params.id);
    if (!w) throw fail(404, 'NOT_FOUND', 'That community isn’t on our list.');
    if (getOps('waitlistJoin', `${w.id}:${req.customerId}`))
      await removeOps('waitlistJoin', `${w.id}:${req.customerId}`);
    res.json({ community: view(w, req.customerId, getSettings('growth').waitlistOpenAt) });
  }),
);

const RequestBody = z.object({
  name: z.string().trim().min(3, 'Enter the community’s name.').max(80),
  area: z.string().trim().max(80).optional().nullable(),
  towers: z.number().int().min(1).max(500).optional().nullable(),
  flats: z.number().int().min(1).max(100000).optional().nullable(),
  note: z.string().trim().max(200).optional().nullable(),
});

export const REQUESTS_PER_DAY = 3;

growthRouter.post(
  '/community-requests',
  validateBody(RequestBody),
  asyncHandler(async (req, res) => {
    const cid = req.customerId;
    const today = todayISO();
    const mineToday = listOps('waitlist').filter(
      (w) => w.requestedBy === cid && String(w.createdAt || '').slice(0, 10) >= today,
    ).length;
    if (mineToday >= REQUESTS_PER_DAY)
      throw fail(
        429,
        'RATE_LIMITED',
        'You’ve sent a few requests today — we’ll look at those first.',
      );
    const name = req.body.name.replace(/\s+/g, ' ');
    // Already on the list (under the same name)? Join that one instead of making a duplicate.
    const same = listOps('waitlist').find(
      (w) => w.name.trim().toLowerCase() === name.toLowerCase(),
    );
    const threshold = getSettings('growth').waitlistOpenAt;
    if (same && (same.status === 'WAITLIST' || same.requestedBy === cid)) {
      await putOps('waitlistJoin', `${same.id}:${cid}`, {
        waitlistId: same.id,
        customerId: cid,
        at: new Date().toISOString(),
      });
      return res.json({ community: view(same, cid, threshold), existing: true });
    }
    const wid = newId('wl', 8);
    const saved = await putOps('waitlist', wid, {
      name,
      area: req.body.area || null,
      towers: req.body.towers ?? null,
      flats: req.body.flats ?? null,
      note: req.body.note || null,
      status: 'REQUESTED',
      source: 'CUSTOMER',
      requestedBy: cid,
      createdAt: new Date().toISOString(),
    });
    await putOps('waitlistJoin', `${wid}:${cid}`, {
      waitlistId: wid,
      customerId: cid,
      at: new Date().toISOString(),
    });
    track(
      'waitlist_vote',
      { community: name, area: req.body.area || null, via: 'request' },
      { customerId: cid },
    );
    res.status(201).json({ community: view(saved, cid, threshold), existing: false });
  }),
);

// A customer must never be shown the operator's setup instructions. If the operating table has not
// been created yet, say plainly that this part is not available yet.
growthRouter.use((err, _req, _res, next) => {
  if (err?.code === 'SETUP_NEEDED')
    return next(fail(503, 'UNAVAILABLE', 'This isn’t available just yet. Please try again later.'));
  return next(err);
});

// ── Android install tag (Play Install Referrer) ─────────────────────────────
// The app reads the referrer ONCE on first open (expo-application) and sends it after sign-in.
// Only the tag fields are kept: src (counter / whatsapp / resident / referral …), p (promoter
// code), c (community slug), r (invite code). The tag wins over the "how did you hear" answer.
const InstallSource = z.object({
  referrer: z.string().max(500),
});

/** Parse "src=counter&p=PR01&c=aquantis" (also accepts utm_source / utm_campaign). */
export function parseReferrer(raw) {
  let q;
  try {
    q = new URLSearchParams(String(raw || '').replace(/^\?/, ''));
  } catch {
    return null;
  }
  const pick = (...keys) => {
    for (const k of keys) {
      const v = q.get(k);
      if (v && /^[A-Za-z0-9_.-]{1,40}$/.test(v)) return v;
    }
    return null;
  };
  const tag = {
    src: pick('src', 'utm_source'),
    p: pick('p', 'promoter'),
    c: pick('c', 'community', 'utm_campaign'),
    r: pick('r', 'ref'),
  };
  // Google fills the referrer with "utm_source=google-play&utm_medium=organic" for a plain store
  // install — that is not a tag anyone gave us.
  if (tag.src === 'google-play' && !tag.p && !tag.r) return null;
  return tag.src || tag.p || tag.r ? tag : null;
}

growthRouter.post(
  '/install-source',
  validateBody(InstallSource),
  asyncHandler(async (req, res) => {
    const cid = req.customerId;
    const tag = parseReferrer(req.body.referrer);
    if (!tag) return res.json({ ok: true, recorded: false });
    // First tag wins: an install happens once; a later re-install must not rewrite the history.
    if (!getOps('installSource', cid)) {
      putOpsSoft('installSource', cid, { ...tag, at: new Date().toISOString() });
      track(
        'install_source_captured',
        { source_tag: tag.src, promoter_id: tag.p, referrer_code: tag.r, community: tag.c },
        { customerId: cid },
      );
    }
    res.json({ ok: true, recorded: true, tag: getOps('installSource', cid) });
  }),
);
