/**
 * Customer-scoped in-memory state for the contract routes (auth, profile, addresses, cart, wallet).
 * Orders live in store.js (shared with admin). This is the seam Adnan's auth + wallet services and
 * the Prisma tables replace; the shapes and rules mirror apps/customer/src/api/mock/server.js so the
 * app runs against this API unchanged (EXPO_PUBLIC_USE_MOCKS=0). Money is integer paise.
 */
import {
  adjustCouponRedemption,
  constants,
  getProduct,
  listCommunities,
  listCoupons,
} from './store.js';
import { id, shortId } from './lib/ids.js';
import { msg91Enabled, sendOtpSms } from './lib/msg91.js';
import { IS_PROD, IS_TEST } from './lib/env.js';
import { findStaffByMobile } from './access-store.js';
import { persist } from './persistence.js';

const DEV_OTP = '123456';

const cs = {
  /** mobile -> { otp, attempts, expiresAt } */
  otp: new Map(),
  /** mobile -> [timestamps] — OTP request rate limiter */
  otpRate: new Map(),
  /** customerId -> customer */
  customers: new Map(),
  /** mobile -> customerId */
  byMobile: new Map(),
  /** accessToken -> { customerId, refreshToken } */
  sessions: new Map(),
  /** refreshToken -> customerId */
  refresh: new Map(),
  /** customerId -> Address[] */
  addresses: new Map(),
  /** customerId -> { items:[{id,productId,quantity,note}], couponCode } */
  carts: new Map(),
  /** customerId -> { balancePaise, ledger:[] } */
  wallets: new Map(),
  /** customerId -> Set(couponCode) */
  redemptions: new Map(),
  /** customerId -> Set(expoPushToken) */
  devices: new Map(),
  /** paymentId -> { purpose, orderId?, amountPaise, status, razorpayOrderId, customerId } */
  payments: new Map(),
};

const cart = (cid) =>
  cs.carts.get(cid) || cs.carts.set(cid, { items: [], couponCode: null }).get(cid);
const wallet = (cid) =>
  cs.wallets.get(cid) || cs.wallets.set(cid, { balancePaise: 0, ledger: [] }).get(cid);
const redemptions = (cid) => cs.redemptions.get(cid) || cs.redemptions.set(cid, new Set()).get(cid);

/**
 * Load customers, addresses, wallets, sessions, devices, redemptions and payments from Supabase into
 * the in-memory cache at boot. Carts and OTPs stay ephemeral (never persisted). Called once by boot().
 */
export function hydrateCustomerData({
  customers,
  addresses,
  sessions,
  devices,
  redemptions,
  payments,
}) {
  const communities = listCommunities();
  const comm = (cid) => communities.find((c) => c.id === cid);
  cs.customers = new Map();
  cs.byMobile = new Map();
  cs.wallets = new Map();
  cs.addresses = new Map();
  cs.refresh = new Map();
  cs.devices = new Map();
  cs.redemptions = new Map();
  cs.payments = new Map();
  for (const c of customers) {
    cs.customers.set(c.id, {
      id: c.id,
      mobile: c.mobile,
      name: c.name ?? null,
      email: c.email ?? null,
      createdAt: c.createdAt?.toISOString?.() || c.createdAt,
    });
    cs.byMobile.set(c.mobile, c.id);
    cs.wallets.set(c.id, {
      balancePaise: c.walletBalancePaise ?? 0,
      ledger: Array.isArray(c.walletLedger) ? c.walletLedger : [],
    });
  }
  for (const a of addresses) {
    const co = comm(a.communityId);
    const list =
      cs.addresses.get(a.customerId) || cs.addresses.set(a.customerId, []).get(a.customerId);
    list.push({
      id: a.id,
      communityId: a.communityId,
      communityName: co?.name,
      area: co?.area,
      block: a.block,
      flat: a.flat,
      floor: a.floor ?? null,
      landmark: a.landmark ?? null,
      recipientName: a.recipientName ?? null,
      contactNumber: a.contactNumber ?? null,
      isDefault: !!a.isDefault,
    });
  }
  for (const s of sessions) cs.refresh.set(s.refreshToken, s.customerId);
  for (const d of devices) {
    const set =
      cs.devices.get(d.customerId) || cs.devices.set(d.customerId, new Set()).get(d.customerId);
    set.add(d.expoPushToken);
  }
  for (const r of redemptions) {
    const set =
      cs.redemptions.get(r.customerId) ||
      cs.redemptions.set(r.customerId, new Set()).get(r.customerId);
    set.add(r.couponCode);
  }
  for (const p of payments) {
    cs.payments.set(p.id, {
      id: p.id,
      customerId: p.customerId,
      purpose: p.purpose,
      orderId: p.orderId ?? null,
      amountPaise: p.amountPaise,
      status: p.status,
      razorpayOrderId: p.razorpayOrderId ?? null,
      razorpayPaymentId: p.razorpayPaymentId ?? null,
    });
  }
}

// ── auth / otp ──────────────────────────────────────────────────────────────
// IS_PROD comes from lib/env.js so a hand-created Render service (no NODE_ENV) still counts as
// production — otherwise the OTP leaked in the response on the live API.
//
// The fixed 123456 code exists for a hosted TEST deployment before DLT/MSG91 is live
// (ALLOW_DEV_OTP=1). While that flag is on, EVERY number accepts it — staff included, because
// otherwise the staff roles cannot be signed into at all: they would be issued a random code and
// there is no SMS provider to deliver it, so the procurement, fulfilment and super-admin screens
// were untestable. That is a deliberate closed-test trade, and it means anyone who guesses a staff
// number can sign in as that role.
//
// DEV_OTP_ALLOWLIST (comma-separated mobiles) narrows it back down: set it and ONLY those numbers
// accept the fixed code — everyone else, staff or not, needs a real one. Use it as soon as the
// tester group is known.
//
// REMOVE ALLOW_DEV_OTP entirely for the real public launch.
const ALLOW_DEV = process.env.ALLOW_DEV_OTP === '1';
const DEV_OTP_ALLOWLIST = new Set(
  (process.env.DEV_OTP_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
/**
 * Pure decision: may `mobile` use the fixed dev OTP? Exported for tests.
 * @param {{ isProd:boolean, allowDev:boolean, allowlist:Set<string>, isStaff:boolean }} ctx
 */
export function devOtpAllowedFor(mobile, ctx) {
  if (!ctx.isProd) return true;
  if (!ctx.allowDev) return false;
  // Named explicitly — always allowed, which is how a staff number gets in once an allowlist exists.
  if (ctx.allowlist.has(mobile)) return true;
  // An allowlist is a confinement: anyone not on it needs a real code.
  if (ctx.allowlist.size > 0) return false;
  // No allowlist — the open closed-test posture: every number, staff included.
  return true;
}
if (IS_PROD && ALLOW_DEV && DEV_OTP_ALLOWLIST.size === 0)
  // eslint-disable-next-line no-console
  console.warn(
    '[otp] ALLOW_DEV_OTP=1 in production with no DEV_OTP_ALLOWLIST: EVERY number accepts 123456, including staff — anyone who guesses a staff number signs in as that role. Set DEV_OTP_ALLOWLIST to confine it, and remove ALLOW_DEV_OTP before launch.',
  );

/**
 * Request a login OTP. Security:
 *  - In production the code is RANDOM and is NEVER returned in the response (it must be delivered by
 *    SMS via MSG91 — wired in the auth pass). Only dev/test use the fixed 123456 for convenience.
 *  - Rate-limited per number (max 5 requests / 10 min) to stop SMS-bombing / abuse.
 * @returns {Promise<{ ok:true, expiresInSeconds:number, devOtp?:string } | { error:{status,code,message} }>}
 */
export async function requestOtp(mobile) {
  if (!IS_TEST) {
    const now = Date.now();
    const hits = (cs.otpRate.get(mobile) || []).filter((t) => now - t < 10 * 60 * 1000);
    if (hits.length >= 5)
      return {
        error: {
          status: 429,
          code: 'RATE_LIMITED',
          message: 'Too many code requests. Please wait a few minutes.',
        },
      };
    hits.push(now);
    cs.otpRate.set(mobile, hits);
  }
  const useDev = devOtpAllowedFor(mobile, {
    isProd: IS_PROD,
    allowDev: ALLOW_DEV,
    allowlist: DEV_OTP_ALLOWLIST,
    isStaff: !!findStaffByMobile(mobile),
  });
  const otp = useDev ? DEV_OTP : String(Math.floor(100000 + Math.random() * 900000));
  cs.otp.set(mobile, { otp, attempts: 0, expiresAt: Date.now() + 5 * 60 * 1000 });

  // Real production (no dev OTP for this number): deliver a random code by SMS and never return it.
  // Otherwise (dev / test / an allowlisted tester) use the fixed 123456 and skip SMS.
  if (!useDev) {
    if (msg91Enabled) {
      try {
        await sendOtpSms({ mobile, otp });
      } catch {
        return {
          error: {
            status: 502,
            code: 'OTP_SEND_FAILED',
            message: "Couldn't send the code right now. Please try again.",
          },
        };
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn('[otp] MSG91 not configured — OTP generated but not delivered.');
    }
    return { ok: true, expiresInSeconds: 300 }; // never leak the code in prod
  }
  // Never put the code in the HTTP response in production — even a test deployment with ALLOW_DEV_OTP=1
  // must not hand the OTP back to the caller (that turned the fixed 123456 into a public auth bypass).
  return { ok: true, expiresInSeconds: 300, ...(IS_PROD ? {} : { devOtp: DEV_OTP }) };
}

/** @returns {{ ok:true, customer:any, isNew:boolean } | { error:{status,code,message} }} */
export function verifyOtp(mobile, otp) {
  const rec = cs.otp.get(mobile);
  if (!rec || Date.now() > rec.expiresAt) {
    return {
      error: {
        status: 401,
        code: 'OTP_INVALID',
        message: 'That code has expired. Request a new one.',
      },
    };
  }
  if (otp !== rec.otp) {
    rec.attempts += 1;
    if (rec.attempts >= 3) {
      return {
        error: {
          status: 423,
          code: 'OTP_LOCKED',
          message: 'Too many attempts. Wait a few minutes and try again.',
        },
      };
    }
    return {
      error: {
        status: 401,
        code: 'OTP_INVALID',
        message: `That code is not right. ${3 - rec.attempts} attempts left.`,
      },
    };
  }
  cs.otp.delete(mobile);
  let customerId = cs.byMobile.get(mobile);
  const isNew = !customerId;
  if (!customerId) {
    customerId = id('cus', 8);
    const customer = {
      id: customerId,
      mobile,
      name: null,
      email: null,
      createdAt: new Date().toISOString(),
    };
    cs.customers.set(customerId, customer);
    cs.byMobile.set(mobile, customerId);
    persist.customerUpsert(customer, wallet(customerId));
  }
  return { ok: true, customer: cs.customers.get(customerId), isNew };
}

// Access tokens are short-lived (the app refreshes silently on 401); refresh tokens live in the DB
// for 90 days. Before this, access tokens never expired and every login added a session forever —
// measured: +50 MB per 10k logins, and any leaked `acc_` token stayed valid indefinitely.
const ACCESS_TTL_MS = Number(process.env.ACCESS_TOKEN_TTL_MS) || 24 * 60 * 60 * 1000;
const MAX_SESSIONS_PER_CUSTOMER = 10; // phones + tablets; oldest are dropped beyond this

export function issueTokens(customerId) {
  const accessToken = `acc_${shortId(20)}`;
  const refreshToken = `ref_${shortId(28)}`;
  cs.sessions.set(accessToken, {
    customerId,
    refreshToken,
    expiresAt: Date.now() + ACCESS_TTL_MS,
  });
  cs.refresh.set(refreshToken, customerId);
  persist.sessionUpsert(refreshToken, customerId);
  // cap live sessions per customer (oldest first)
  const mine = [...cs.sessions.entries()].filter(([, s]) => s.customerId === customerId);
  if (mine.length > MAX_SESSIONS_PER_CUSTOMER) {
    mine
      .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
      .slice(0, mine.length - MAX_SESSIONS_PER_CUSTOMER)
      .forEach(([tok]) => cs.sessions.delete(tok));
  }
  return { accessToken, refreshToken };
}

/** Resolve a Bearer access token to a customer id, or null (expired tokens are dropped on sight). */
export function resolveAccess(token) {
  const s = cs.sessions.get(token);
  if (!s) return null;
  if (s.expiresAt && Date.now() > s.expiresAt) {
    cs.sessions.delete(token);
    return null;
  }
  return s.customerId;
}

/**
 * Drop expired access tokens, expired/abandoned OTPs and stale rate-limit windows. Runs every ten
 * minutes; also exported so tests can call it directly. Without this every one of these maps only
 * ever grew (OTP entries were deleted only on a successful verify).
 */
export function sweepAuthState(now = Date.now()) {
  let removed = 0;
  for (const [tok, s] of cs.sessions)
    if (s.expiresAt && now > s.expiresAt) {
      cs.sessions.delete(tok);
      removed += 1;
    }
  for (const [mobile, rec] of cs.otp)
    if (now > rec.expiresAt) {
      cs.otp.delete(mobile);
      removed += 1;
    }
  for (const [mobile, hits] of cs.otpRate) {
    const live = hits.filter((t) => now - t < 10 * 60 * 1000);
    if (live.length === 0) {
      cs.otpRate.delete(mobile);
      removed += 1;
    } else if (live.length !== hits.length) cs.otpRate.set(mobile, live);
  }
  return removed;
}
if (!IS_TEST) setInterval(() => sweepAuthState(), 10 * 60 * 1000).unref();

export function rotateRefresh(refreshToken) {
  const customerId = cs.refresh.get(refreshToken);
  if (!customerId) return null;
  cs.refresh.delete(refreshToken);
  persist.sessionDelete(refreshToken);
  // drop old access tokens for this refresh
  for (const [tok, s] of cs.sessions) if (s.refreshToken === refreshToken) cs.sessions.delete(tok);
  return { customerId, ...issueTokens(customerId) };
}

export function logout(customerId) {
  for (const [tok, s] of cs.sessions) if (s.customerId === customerId) cs.sessions.delete(tok);
  for (const [tok, cid] of cs.refresh) if (cid === customerId) cs.refresh.delete(tok);
  persist.sessionsDeleteForCustomer(customerId);
}

// ── customer / addresses ──────────────────────────────────────────────────────
export const getCustomer = (cid) => cs.customers.get(cid) || null;
/** Resolve a mobile number to its customer id (null if that number never signed in). */
export const getCustomerIdByMobile = (mobile) => cs.byMobile.get(mobile) || null;
export function updateCustomer(cid, patch) {
  const c = cs.customers.get(cid);
  if (!c) return null;
  if (patch.name !== undefined) c.name = patch.name;
  if (patch.email !== undefined) c.email = patch.email;
  persist.customerUpsert(c, wallet(cid));
  return c;
}
export const listAddresses = (cid) => cs.addresses.get(cid) || [];
export const hasAddress = (cid) => (cs.addresses.get(cid) || []).length > 0;
export const defaultAddress = (cid) =>
  (cs.addresses.get(cid) || []).find((a) => a.isDefault) || null;

/** @returns {{ address:any } | { error:{status,code,message} }} */
export function addAddress(cid, body) {
  const communities = listCommunities();
  let community = communities.find((c) => c.id === body.communityId);
  if (!community && typeof body.lat === 'number' && typeof body.lng === 'number') {
    community = communities.find((c) => Math.hypot(c.lat - body.lat, c.lng - body.lng) < 0.02);
    if (!community)
      return {
        error: {
          status: 422,
          code: 'ADDRESS_NOT_SERVICEABLE',
          message: "We don't deliver to this location yet. We've noted it for expansion.",
        },
      };
  }
  if (!community)
    return { error: { status: 422, code: 'VALIDATION', message: 'Choose your community.' } };
  if (!community.blocks.includes(body.block))
    return {
      error: { status: 422, code: 'VALIDATION', message: 'Choose your block from the list.' },
    };
  if (!body.flat || String(body.flat).trim().length < 1)
    return { error: { status: 422, code: 'VALIDATION', message: 'Enter your flat number.' } };

  const list = cs.addresses.get(cid) || cs.addresses.set(cid, []).get(cid);
  const customer = cs.customers.get(cid);
  const address = {
    id: id('adr', 8),
    communityId: community.id,
    communityName: community.name,
    area: community.area,
    block: body.block,
    flat: String(body.flat).trim(),
    floor: body.floor || null,
    landmark: body.landmark || null,
    recipientName: body.recipientName || customer?.name || null,
    contactNumber: body.contactNumber || customer?.mobile,
    isDefault: list.length === 0 || !!body.isDefault,
  };
  if (address.isDefault) list.forEach((a) => (a.isDefault = false));
  list.push(address);
  if (body.recipientName && customer && !customer.name) {
    customer.name = body.recipientName;
    persist.customerUpsert(customer, wallet(cid));
  }
  list.forEach((a) => persist.addressUpsert(a, cid)); // new address + any changed default flags
  return { address };
}

export function setDefaultAddress(cid, addrId) {
  const list = cs.addresses.get(cid) || [];
  list.forEach((a) => (a.isDefault = a.id === addrId));
  list.forEach((a) => persist.addressUpsert(a, cid));
  return list;
}

// ── coupons ───────────────────────────────────────────────────────────────────
export function couponDiscount(c, subtotal) {
  if (c.type === 'PERCENT') return Math.round((subtotal * c.valueBp) / 10000);
  if (c.type === 'FLAT') return Math.min(subtotal, c.valuePaise);
  if (c.type === 'FREE_ITEM') {
    const p = getProduct(c.freeProductId);
    return p ? p.pricePaise : 0;
  }
  return 0;
}

/** @returns {{ coupon:any } | { error:{status,code,message,details?} }} */
export function validateCoupon(cid, code, subtotal) {
  const c = listCoupons().find((x) => x.code.toLowerCase() === String(code).trim().toLowerCase());
  if (!c)
    return {
      error: {
        status: 404,
        code: 'COUPON_NOT_FOUND',
        message: 'We could not find that code. Check the brochure and try again.',
      },
    };
  if (!c.isActive)
    return {
      error: { status: 404, code: 'COUPON_NOT_FOUND', message: 'That code is no longer active.' },
    };
  if (new Date(c.expiresAt).getTime() < Date.now())
    return { error: { status: 410, code: 'COUPON_EXPIRED', message: 'That code has expired.' } };
  if (redemptions(cid).has(c.code))
    return {
      error: {
        status: 409,
        code: 'COUPON_ALREADY_USED',
        message: 'This code has already been used on your account.',
      },
    };
  if (c.globalCap && c.redeemedCount >= c.globalCap)
    return {
      error: {
        status: 409,
        code: 'COUPON_CAP_REACHED',
        message: 'All of these have been claimed. Sorry, you just missed it.',
      },
    };
  if (subtotal < c.minOrderPaise)
    return {
      error: {
        status: 422,
        code: 'MIN_ORDER_NOT_MET',
        message: `Add ₹${Math.ceil((c.minOrderPaise - subtotal) / 100)} more to use this code.`,
        details: { minOrderPaise: String(c.minOrderPaise) },
      },
    };
  return { coupon: c };
}

export function redeemCoupon(cid, code) {
  redemptions(cid).add(code);
  persist.redemptionAdd(cid, code);
  adjustCouponRedemption(code, +1); // on the live record, so globalCap actually counts down
}
export function releaseCoupon(cid, code) {
  // Idempotent: only give the slot back if this customer actually held it.
  if (!redemptions(cid).has(code)) return;
  redemptions(cid).delete(code);
  persist.redemptionDelete(cid, code);
  adjustCouponRedemption(code, -1);
}

// ── cart ────────────────────────────────────────────────────────────────────
export function priceCart(cid) {
  const cur = cart(cid);
  // A product the admin removed from the catalog can still sit in a basket; drop such lines here
  // instead of dereferencing null (which turned the whole cart screen into a 500).
  cur.items = cur.items.filter((it) => getProduct(it.productId));
  const items = cur.items.map((it) => {
    const p = getProduct(it.productId);
    const qty = Number(it.quantity);
    return {
      id: it.id,
      productId: p.id,
      name: p.name,
      unit: p.unit,
      increment: p.increment,
      image: p.image,
      blurhash: p.blurhash || null,
      tint: p.tint,
      variableWeight: !!p.variableWeight,
      quantity: qty.toFixed(3),
      unitPricePaise: String(p.pricePaise),
      lineTotalPaise: String(Math.round(p.pricePaise * qty)),
      note: it.note || null,
    };
  });
  const subtotal = items.reduce((s, i) => s + Number(i.lineTotalPaise), 0);
  let coupon = null;
  let discount = 0;
  if (cur.couponCode) {
    const c = listCoupons().find((x) => x.code === cur.couponCode);
    if (c) {
      discount = couponDiscount(c, subtotal);
      coupon = { code: c.code, type: c.type, label: c.label, discountPaise: String(discount) };
    }
  }
  const k = constants();
  const delivery = k.deliveryChargePaise;
  const total = Math.max(0, subtotal - discount + delivery);
  return {
    items,
    subtotalPaise: String(subtotal),
    couponDiscountPaise: String(discount),
    deliveryChargePaise: String(delivery),
    totalPaise: String(total),
    minOrderValuePaise: String(k.minOrderValuePaise),
    meetsMinimum: subtotal >= k.minOrderValuePaise,
    coupon,
    walletBalancePaise: String(wallet(cid).balancePaise),
  };
}

/** @returns {{ ok:true } | { error:{status,code,message} }} */
export function setCartItem(cid, { productId, quantity, note }) {
  const prod = getProduct(productId);
  if (!prod) return { error: { status: 404, code: 'NOT_FOUND', message: 'Product not found' } };
  if (prod.availability && prod.availability !== 'AVAILABLE')
    return {
      error: { status: 409, code: 'UNAVAILABLE', message: `${prod.name} is sold out right now.` },
    };
  const qty = Number(quantity);
  const inc = Number(prod.increment);
  if (!(qty >= 0) || Math.abs(Math.round(qty / inc) * inc - qty) > 1e-6)
    return {
      error: {
        status: 422,
        code: 'VALIDATION',
        message: `Quantity must be in steps of ${prod.increment}`,
      },
    };
  if (qty > prod.dailyCap)
    return {
      error: {
        status: 422,
        code: 'CAP_EXCEEDED',
        message: `Only ${prod.dailyCap} ${prod.unit.toLowerCase()} available today.`,
      },
    };
  const cur = cart(cid);
  const existing = cur.items.find((i) => i.productId === productId);
  if (qty === 0) cur.items = cur.items.filter((i) => i.productId !== productId);
  else if (existing) {
    existing.quantity = qty;
    if (note !== undefined) existing.note = note;
  } else cur.items.push({ id: id('ci', 8), productId, quantity: qty, note: note || null });
  return { ok: true };
}

export function removeCartItem(cid, lineId) {
  const cur = cart(cid);
  cur.items = cur.items.filter((i) => i.id !== lineId && i.productId !== lineId);
}
export function setCartCoupon(cid, code) {
  cart(cid).couponCode = code;
}
export function clearCartCoupon(cid) {
  cart(cid).couponCode = null;
}
export const rawCart = (cid) => cart(cid);
export function clearCart(cid) {
  cs.carts.set(cid, { items: [], couponCode: null });
}

/**
 * Put an abandoned order's lines back in the basket.
 *
 * The basket is emptied when the order is CREATED, not when it is paid — so backing out of the
 * payment sheet left the shopper with a failed order and nothing to retry with, and the app asked
 * them to pick everything again. This returns the lines so "try again" means one tap.
 *
 * Only ever fills an EMPTY basket: if they have since started a new one, that is the basket they
 * are working on and silently merging a dead order into it would be worse than doing nothing.
 * @returns {boolean} whether anything was restored
 */
export function restoreCartFromOrder(cid, order) {
  const cur = cart(cid);
  if (cur.items.length) return false;
  const items = (order?.items || [])
    .filter((i) => i.productId)
    .map((i) => ({
      id: id('ci', 8),
      productId: i.productId,
      quantity: Number(i.quantity),
      note: i.note || null,
    }));
  if (!items.length) return false;
  cs.carts.set(cid, { items, couponCode: order.couponCode || null });
  return true;
}
export const cartCount = (cid) => cart(cid).items.length;

// ── wallet ────────────────────────────────────────────────────────────────────
export const getWallet = (cid) => wallet(cid);
export function ledgerPush(cid, direction, amount, source, ref, note) {
  const w = wallet(cid);
  const after = direction === 'CREDIT' ? w.balancePaise + amount : w.balancePaise - amount;
  w.balancePaise = after;
  w.ledger.unshift({
    id: `led_${shortId(10)}`,
    direction,
    amountPaise: String(amount),
    balanceAfterPaise: String(after),
    source,
    reference: ref,
    note,
    createdAt: new Date().toISOString(),
  });
  persist.walletUpdate(cid, w.balancePaise, w.ledger);
}

// ── payments (intents; the mock's /payments/verify doubles as the webhook) ──────
export function createPayment(cid, { purpose, orderId, amountPaise }) {
  const paymentId = id('pay', 10);
  const payment = {
    id: paymentId,
    customerId: cid,
    purpose,
    orderId: orderId || null,
    amountPaise,
    status: 'CREATED',
    razorpayOrderId: `order_${shortId(14)}`,
  };
  cs.payments.set(paymentId, payment);
  persist.paymentUpsert(payment);
  return payment;
}
export const getPayment = (paymentId) => cs.payments.get(paymentId) || null;
/** Persist a payment after a route mutates it (e.g. status -> CAPTURED on verify). */
export const savePayment = (payment) => persist.paymentUpsert(payment);

// ── devices ──────────────────────────────────────────────────────────────────
export function registerDevice(cid, token) {
  const set = cs.devices.get(cid) || cs.devices.set(cid, new Set()).get(cid);
  if (token) {
    set.add(token);
    persist.deviceUpsert(cid, token);
  }
}
/** A customer's registered Expo push tokens (for the push sender). */
export const getDevices = (cid) => [...(cs.devices.get(cid) || [])];

/** test helper */
export function _reset() {
  for (const k of Object.keys(cs)) cs[k] = cs[k] instanceof Map ? new Map() : cs[k];
}
