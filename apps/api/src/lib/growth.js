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
 *   - at most `referralMonthlyCap` (admin setting, default MAX_REWARDS_PER_MONTH) paid to one
 *     inviter in a calendar month.
 */
import { randomInt } from 'node:crypto';
import { getOps, listOps, putOps, putOpsSoft, getSettings, opsReady } from '../ops-store.js';
import { getCustomer, getCustomerIdByMobile, ledgerPush } from '../customer-store.js';
import { getOrder } from '../store.js';
import { track } from './events.js';
import { emitNotification } from './notify.js';
import { isErased } from './customer-history.js';
import { istMonthOf } from './dates.js';

export const HEARD_FROM = {
  COUNTER: 'A Fooducia stall in my community',
  WHATSAPP: 'The Fooducia WhatsApp channel',
  NEIGHBOUR: 'A neighbour or friend',
  RESIDENT_GROUP: 'My residents’ group',
  SOCIAL: 'Instagram / Facebook / YouTube',
  OTHER: 'Somewhere else',
};

/**
 * The five answers the app offers (Rapture7 brief, 19 Nov 2026). SOCIAL stays a valid stored value
 * so answers given before then still read correctly in the reports.
 */
export const HEARD_FROM_ASKED = ['COUNTER', 'WHATSAPP', 'NEIGHBOUR', 'RESIDENT_GROUP', 'OTHER'];

/** Every answer key ever offered → its label (built-in keys plus the admin's own answers). */
export function heardFromLabels() {
  const m = { ...HEARD_FROM };
  for (const o of getSettings('sourceQuestion').options || []) m[o.key] = o.label;
  return m;
}
/** The answers the app shows right now (admin → Friday report → Settings). */
export const heardFromOptions = () =>
  (getSettings('sourceQuestion').options || []).filter((o) => o.enabled !== false);
const validHeard = (k) => (k && heardFromLabels()[k] ? k : null);

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

const MOBILE_RE = /^[6-9]\d{9}$/;
const digitsOnly = (s) =>
  String(s || '')
    .replace(/\D/g, '')
    .replace(/^(91|0)(?=[6-9]\d{9}$)/, '');

/**
 * What a typed code is: a promoter's code, a customer's invite code, or — for iPhone, where no tag
 * survives the App Store — the inviting neighbour's mobile number (Rapture7 brief, 19 Nov 2026).
 * @returns {{ kind: 'PROMOTER', promoter: any } | { kind: 'INVITE', customerId: string } | null}
 */
export function resolveCode(raw) {
  const mobile = digitsOnly(raw);
  if (MOBILE_RE.test(mobile)) {
    if (getSettings('growth').mobileReferral === false) return null;
    const cid = getCustomerIdByMobile(mobile);
    const c = cid ? getCustomer(cid) : null;
    return c && !isErased(c) ? { kind: 'INVITE', customerId: cid } : null;
  }
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
 * A MOBILE NUMBER always gets the same neutral answer, found or not — otherwise this would tell
 * anyone whether a given number is a Fooducia customer.
 * @returns {{ ok: boolean, resolved?: any, message?: string, neutral?: boolean }}
 */
export function checkCode(raw, { customerId, isFirstOrder }) {
  const mobile = digitsOnly(raw);
  if (MOBILE_RE.test(mobile)) {
    if (getSettings('growth').mobileReferral === false)
      return {
        ok: false,
        message: 'A neighbour’s number can’t be used right now. Leave it empty.',
      };
    if (!isFirstOrder)
      return { ok: false, message: 'A neighbour’s number works on a first order only.' };
    const me = getCustomer(customerId);
    if (me && digitsOnly(me.mobile) === mobile)
      return {
        ok: false,
        message: 'That’s your own number — enter the neighbour who told you about us.',
      };
    return { ok: true, resolved: null, neutral: true };
  }
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
 * The tag an Android install arrived with (Play Install Referrer → POST /growth/install-source).
 * @returns {{ src: string|null, p: string|null, c: string|null, r: string|null } | null}
 */
export const installTagOf = (customerId) => getOps('installSource', customerId);

/**
 * Record where this order came from, and how it was discounted. Called right after the order is
 * created; never throws — the order is already placed, and reporting must not undo it.
 *
 * Source precedence (brief): the install TAG wins over the typed code, which wins over the answer.
 * Returns what was recorded, for the order_placed event.
 */
export function recordOrderSource({
  order,
  customerId,
  code,
  heardFrom,
  discountType = null,
  discountPaise = 0,
}) {
  try {
    const now = new Date().toISOString();
    const typed = code ? resolveCode(code) : null;
    const tag = order.isFirstOrder ? installTagOf(customerId) : null;
    const tagPromoter = tag?.p ? getOps('promoter', normaliseCode(tag.p)) : null;
    const tagReferrer = tag?.r ? resolveCode(tag.r) : null;
    const promoter =
      tagPromoter && tagPromoter.active !== false
        ? tagPromoter
        : typed?.kind === 'PROMOTER'
          ? typed.promoter
          : null;
    const invite =
      tagReferrer?.kind === 'INVITE' && tagReferrer.customerId !== customerId
        ? tagReferrer
        : typed?.kind === 'INVITE' && typed.customerId !== customerId
          ? typed
          : null;
    const sourceTag = tag?.src || (promoter ? 'counter' : invite ? 'referral' : null);

    const attr = {
      orderId: order.id,
      customerId,
      promoterCode: promoter ? promoter.id : null,
      stall: promoter?.stall || null,
      referrerKey: invite ? invite.customerId : null,
      sourceTag,
      discountType: discountPaise > 0 ? discountType : null,
      discountPaise: discountPaise > 0 ? discountPaise : 0,
      at: now,
    };
    putOpsSoft('orderAttr', order.id, attr);

    if (order.isFirstOrder && !getOps('attribution', customerId)) {
      putOpsSoft('attribution', customerId, {
        customerId,
        heardFrom: validHeard(heardFrom),
        promoterCode: attr.promoterCode,
        referrerId: attr.referrerKey,
        // acquisition_source (brief): the tag if present, otherwise the answer.
        acquisitionSource: sourceTag || validHeard(heardFrom),
        firstOrderId: order.id,
        communityId: order.address?.communityId || null,
        at: now,
      });
    }
    if (order.isFirstOrder && invite && !getOps('referral', customerId)) {
      const s = getSettings('growth');
      if (s.referralEnabled)
        putOpsSoft('referral', customerId, {
          refereeId: customerId,
          referrerId: invite.customerId,
          code: tagReferrer?.kind === 'INVITE' ? normaliseCode(tag.r) : normaliseCode(code),
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: 'PENDING',
          referrerRewardPaise: s.referrerRewardPaise,
          refereeRewardPaise: s.refereeRewardPaise,
          at: now,
        });
    }
    return attr;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[growth] could not record order source', e?.message || e);
    return null;
  }
}

/**
 * The brief's order_placed event — fired when an order is CONFIRMED: straight away for cash and
 * wallet orders, on payment capture for prepaid ones (an abandoned payment page is not an order).
 */
export function trackOrderPlaced(order) {
  if (!order?.id) return;
  const a = getOps('orderAttr', order.id) || {};
  track(
    'order_placed',
    {
      order_id: order.id,
      order_number: order.orderNumber,
      order_value: Number(order.subtotalPaise),
      items_count: (order.items || []).length,
      discount_type: a.discountType || null,
      discount_value: Number(a.discountPaise || order.couponDiscountPaise || 0),
      payment_method: order.paymentMethod,
      community: order.address?.communityName || null,
      tower: order.address?.block || null,
      source_tag: a.sourceTag || null,
      promoter_id: a.promoterCode || null,
      referrer_id: a.referrerKey || null,
      is_first_order: !!order.isFirstOrder,
      placed_at: order.createdAt,
    },
    { customerId: order.customerId },
  );
}

// The referral monthly cap counts by IST calendar month; slicing the UTC string put rewards paid
// between 00:00 and 05:30 IST on the 1st into the previous month (review #19, 21 Nov 2026).
const monthOf = istMonthOf;

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
  // Security pentest 21 Nov 2026 (R5): the reward is for the order the invite came in on, and ONLY
  // that order. Any DELIVERED order used to pay it, so a first order placed with the invite and then
  // cancelled still paid both rewards when a later, uninvited order arrived. A different order never
  // pays; if the invite's own order was cancelled (or never got paid), the referral is settled VOID
  // so it cannot pay later either. Referrals from before orderId was recorded keep the old rule.
  if (ref.orderId && order.id !== ref.orderId) {
    const own = getOrder(ref.orderId);
    if (!own || own.status === 'CANCELLED' || own.status === 'PAYMENT_FAILED')
      putOpsSoft('referral', order.customerId, {
        ...ref,
        status: 'VOID',
        reason: 'FIRST_ORDER_CANCELLED',
        settledAt: now,
      });
    return null;
  }
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
  const cap =
    Number(s.referralMonthlyCap) > 0 ? Number(s.referralMonthlyCap) : MAX_REWARDS_PER_MONTH;
  if (paidThisMonth >= cap) {
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
  if (amount > 0)
    track(
      'referral_reward_applied',
      { order_id: order.id, role: 'referrer', amount },
      { customerId: ref.referrerId },
    );
  if (welcome > 0)
    track(
      'referral_reward_applied',
      { order_id: order.id, role: 'new_customer', amount: welcome },
      { customerId: order.customerId },
    );
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
