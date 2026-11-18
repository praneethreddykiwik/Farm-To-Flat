/**
 * Where orders come from, and the neighbour-invites-neighbour reward.
 *
 * Two kinds of code can be typed at checkout, in the same box:
 *   PROMOTER code — the person at a community stall who helped the customer order. Credits the
 *                   stall and the person with the sale; costs the customer nothing, gives them nothing.
 *   INVITE code   — a customer's own code, shared with a neighbour. When the neighbour's FIRST order
 *                   is delivered, the inviter gets a wallet credit (₹30 by default, set in the admin).
 *
 * And one question before the first order: "How did you hear about Fooducia?" — so the business can
 * see which channel brings the first orders (stall, WhatsApp, a neighbour, a resident group…).
 *
 * Guard rails on the reward, because it is money:
 *   - only on the invited customer's first order, and only once it is DELIVERED (not on placing it:
 *     a cancelled first order earns nothing);
 *   - never to yourself, and never twice for the same new customer (the wallet ledger's idempotency
 *     key is `referral:<newCustomerId>`, so even a replayed status change cannot pay again);
 *   - at most MAX_REWARDS_PER_MONTH paid to one inviter in a calendar month.
 */
import { randomInt } from 'node:crypto';
import { getOps, listOps, putOps, putOpsSoft, getSettings, opsReady } from '../ops-store.js';
import { getCustomer, ledgerPush } from '../customer-store.js';
import { emitNotification } from './notify.js';
import { isErased } from './customer-history.js';

export const HEARD_FROM = {
  COUNTER: 'A Fooducia stall in my community',
  WHATSAPP: 'WhatsApp',
  NEIGHBOUR: 'A neighbour or friend',
  RESIDENT_GROUP: 'My residents’ group',
  SOCIAL: 'Instagram / Facebook / YouTube',
  OTHER: 'Somewhere else',
};

export const MAX_REWARDS_PER_MONTH = 20;

// No 0/O, 1/I/L: a code read aloud at a door or across a stall must not be mistyped.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const INVITE_PREFIX = 'NB';

export const normaliseCode = (s) =>
  String(s || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

/** Promoter codes: 3–12 letters/digits. Cannot start with the invite prefix, so the two never meet. */
export const PROMOTER_CODE_RE = /^[A-Z0-9]{3,12}$/;
export const isReservedPrefix = (code) => normaliseCode(code).startsWith(INVITE_PREFIX);

/** The customer's own invite code, minted once on first ask. */
export function inviteCodeFor(customerId) {
  const existing = listOps('refCode').find((r) => r.customerId === customerId);
  if (existing) return existing.id;
  let code;
  do {
    code = INVITE_PREFIX;
    for (let i = 0; i < 6; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  } while (getOps('refCode', code));
  putOpsSoft('refCode', code, { customerId, createdAt: new Date().toISOString() });
  return code;
}

/**
 * What a typed code is.
 * @returns {{ kind: 'PROMOTER', promoter: any } | { kind: 'INVITE', customerId: string } | null}
 */
export function resolveCode(raw) {
  const code = normaliseCode(raw);
  if (!code) return null;
  const promoter = getOps('promoter', code);
  if (promoter && promoter.active !== false) return { kind: 'PROMOTER', promoter };
  const ref = getOps('refCode', code);
  if (ref?.customerId) return { kind: 'INVITE', customerId: ref.customerId };
  return null;
}

/**
 * Check a code before the order is created, so a typo is a message, not a silently lost credit.
 * @returns {{ ok: boolean, resolved?: any, message?: string }}
 */
export function checkCode(raw, { customerId, isFirstOrder }) {
  if (!normaliseCode(raw)) return { ok: true, resolved: null };
  const r = resolveCode(raw);
  if (!r) return { ok: false, message: 'That code isn’t recognised. Check it, or leave it empty.' };
  if (r.kind === 'INVITE') {
    if (r.customerId === customerId)
      return {
        ok: false,
        message: 'That’s your own invite code — share it with a neighbour instead.',
      };
    if (!isFirstOrder) return { ok: false, message: 'Invite codes work on a first order only.' };
    if (!getSettings('growth').referralEnabled)
      return { ok: false, message: 'Invites are paused right now. You can leave the code empty.' };
  }
  return { ok: true, resolved: r };
}

/**
 * Record where this order came from. Called right after the order is created; never throws — the
 * order is already placed, and reporting must not undo it.
 */
export function recordOrderSource({ order, customerId, code, heardFrom }) {
  try {
    const now = new Date().toISOString();
    const r = code ? resolveCode(code) : null;
    if (r?.kind === 'PROMOTER')
      putOpsSoft('orderAttr', order.id, {
        orderId: order.id,
        customerId,
        promoterCode: r.promoter.id,
        stall: r.promoter.stall || null,
        at: now,
      });
    if (!order.isFirstOrder) return;
    if (!getOps('attribution', customerId)) {
      putOpsSoft('attribution', customerId, {
        customerId,
        heardFrom: HEARD_FROM[heardFrom] ? heardFrom : null,
        promoterCode: r?.kind === 'PROMOTER' ? r.promoter.id : null,
        referrerId: r?.kind === 'INVITE' ? r.customerId : null,
        firstOrderId: order.id,
        communityId: order.address?.communityId || null,
        at: now,
      });
    }
    if (r?.kind === 'INVITE' && r.customerId !== customerId && !getOps('referral', customerId)) {
      const s = getSettings('growth');
      putOpsSoft('referral', customerId, {
        refereeId: customerId,
        referrerId: r.customerId,
        code: normaliseCode(code),
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: 'PENDING',
        referrerRewardPaise: s.referrerRewardPaise,
        refereeRewardPaise: s.refereeRewardPaise,
        at: now,
      });
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[growth] could not record order source', e?.message || e);
  }
}

const monthOf = (iso) => String(iso || '').slice(0, 7);

/**
 * Pay the inviter once the invited customer's first order arrives. Safe to call on every DELIVERED
 * transition: it does nothing unless a PENDING referral for this customer exists.
 */
export function rewardReferral(order) {
  if (!order?.customerId || order.status !== 'DELIVERED') return null;
  const ref = getOps('referral', order.customerId);
  if (!ref || ref.status !== 'PENDING') return null;
  const s = getSettings('growth');
  const now = new Date().toISOString();
  if (!s.referralEnabled) return null;
  const inviter = getCustomer(ref.referrerId);
  if (!inviter || isErased(inviter)) {
    putOpsSoft('referral', order.customerId, {
      ...ref,
      status: 'VOID',
      reason: 'INVITER_GONE',
      settledAt: now,
    });
    return null;
  }
  const paidThisMonth = listOps('referral').filter(
    (x) =>
      x.referrerId === ref.referrerId &&
      x.status === 'REWARDED' &&
      monthOf(x.settledAt) === monthOf(now),
  ).length;
  if (paidThisMonth >= MAX_REWARDS_PER_MONTH) {
    putOpsSoft('referral', order.customerId, {
      ...ref,
      status: 'VOID',
      reason: 'MONTHLY_CAP',
      settledAt: now,
    });
    return null;
  }
  const amount = Number(ref.referrerRewardPaise ?? s.referrerRewardPaise) || 0;
  const welcome = Number(ref.refereeRewardPaise ?? s.refereeRewardPaise) || 0;
  try {
    if (amount > 0)
      ledgerPush(
        ref.referrerId,
        'CREDIT',
        amount,
        'REFERRAL',
        order.orderNumber,
        'A neighbour you invited got their first delivery',
        {
          idempotencyKey: `referral:${order.customerId}`,
        },
      );
    if (welcome > 0)
      ledgerPush(
        order.customerId,
        'CREDIT',
        welcome,
        'REFERRAL',
        order.orderNumber,
        'Welcome credit for joining with an invite',
        {
          idempotencyKey: `referral-welcome:${order.customerId}`,
        },
      );
  } catch (e) {
    // A duplicate key means it was already paid — settle the record to match, never pay twice.
    if (!/unique|idempot|duplicate/i.test(String(e?.message))) {
      // eslint-disable-next-line no-console
      console.error('[growth] referral reward failed', e?.message || e);
      return null;
    }
  }
  const settled = {
    ...ref,
    status: 'REWARDED',
    settledAt: now,
    paidPaise: amount,
    welcomePaise: welcome,
  };
  putOpsSoft('referral', order.customerId, settled);
  if (amount > 0)
    emitNotification(ref.referrerId, {
      type: 'WALLET_CREDIT',
      title: `₹${Math.round(amount / 100)} added to your wallet`,
      body: 'A neighbour you invited just got their first Fooducia delivery. Thank you for spreading the word!',
      data: { action: 'wallet' },
    });
  return settled;
}

/** What the customer's "Invite neighbours" screen shows. */
export function inviteSummary(customerId) {
  const s = getSettings('growth');
  // Until the operating table exists, a code could live only in memory and vanish at the next
  // restart — after the customer had already shared it. Better to say "not yet" than hand one out.
  if (!opsReady())
    return {
      enabled: false,
      code: null,
      rewardPaise: String(s.referrerRewardPaise),
      welcomePaise: '0',
      joined: 0,
      rewarded: 0,
      earnedPaise: '0',
    };
  const mine = listOps('referral').filter((r) => r.referrerId === customerId);
  return {
    enabled: !!s.referralEnabled,
    code: inviteCodeFor(customerId),
    rewardPaise: String(s.referrerRewardPaise),
    welcomePaise: String(s.refereeRewardPaise),
    joined: mine.length,
    rewarded: mine.filter((r) => r.status === 'REWARDED').length,
    earnedPaise: String(
      mine.reduce((n, r) => n + (r.status === 'REWARDED' ? Number(r.paidPaise || 0) : 0), 0),
    ),
  };
}

/** Make a promoter record from admin input (validated by the route). */
export async function savePromoter(code, data) {
  return putOps('promoter', normaliseCode(code), {
    name: data.name,
    stall: data.stall || null,
    communityId: data.communityId || null,
    mobile: data.mobile || null,
    active: data.active !== false,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}
