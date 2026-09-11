/**
 * Customer-scoped in-memory state for the contract routes (auth, profile, addresses, cart, wallet).
 * Orders live in store.js (shared with admin). This is the seam Adnan's auth + wallet services and
 * the Prisma tables replace; the shapes and rules mirror apps/customer/src/api/mock/server.js so the
 * app runs against this API unchanged (EXPO_PUBLIC_USE_MOCKS=0). Money is integer paise.
 */
import { constants, getProduct, listCommunities, listCoupons } from './store.js';
import { id, shortId } from './lib/ids.js';
import { msg91Enabled, sendOtpSms } from './lib/msg91.js';

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

// ── auth / otp ──────────────────────────────────────────────────────────────
const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Request a login OTP. Security:
 *  - In production the code is RANDOM and is NEVER returned in the response (it must be delivered by
 *    SMS via MSG91 — wired in the auth pass). Only dev/test use the fixed 123456 for convenience.
 *  - Rate-limited per number (max 5 requests / 10 min) to stop SMS-bombing / abuse.
 * @returns {Promise<{ ok:true, expiresInSeconds:number, devOtp?:string } | { error:{status,code,message} }>}
 */
export async function requestOtp(mobile) {
  if (process.env.NODE_ENV !== 'test') {
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
  const otp = IS_PROD ? String(Math.floor(100000 + Math.random() * 900000)) : DEV_OTP;
  cs.otp.set(mobile, { otp, attempts: 0, expiresAt: Date.now() + 5 * 60 * 1000 });

  // Deliver the code by SMS. Only in production (dev/test use the fixed 123456 and skip SMS). When
  // MSG91 isn't configured yet, we can't deliver — surface that rather than pretending it was sent.
  if (IS_PROD) {
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
  return { ok: true, expiresInSeconds: 300, devOtp: DEV_OTP };
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
    cs.customers.set(customerId, {
      id: customerId,
      mobile,
      name: null,
      email: null,
      createdAt: new Date().toISOString(),
    });
    cs.byMobile.set(mobile, customerId);
  }
  return { ok: true, customer: cs.customers.get(customerId), isNew };
}

export function issueTokens(customerId) {
  const accessToken = `acc_${shortId(20)}`;
  const refreshToken = `ref_${shortId(28)}`;
  cs.sessions.set(accessToken, { customerId, refreshToken });
  cs.refresh.set(refreshToken, customerId);
  return { accessToken, refreshToken };
}

/** Resolve a Bearer access token to a customer id, or null. */
export function resolveAccess(token) {
  return cs.sessions.get(token)?.customerId || null;
}

export function rotateRefresh(refreshToken) {
  const customerId = cs.refresh.get(refreshToken);
  if (!customerId) return null;
  cs.refresh.delete(refreshToken);
  // drop old access tokens for this refresh
  for (const [tok, s] of cs.sessions) if (s.refreshToken === refreshToken) cs.sessions.delete(tok);
  return { customerId, ...issueTokens(customerId) };
}

export function logout(customerId) {
  for (const [tok, s] of cs.sessions) if (s.customerId === customerId) cs.sessions.delete(tok);
  for (const [tok, cid] of cs.refresh) if (cid === customerId) cs.refresh.delete(tok);
}

// ── customer / addresses ──────────────────────────────────────────────────────
export const getCustomer = (cid) => cs.customers.get(cid) || null;
export function updateCustomer(cid, patch) {
  const c = cs.customers.get(cid);
  if (!c) return null;
  if (patch.name !== undefined) c.name = patch.name;
  if (patch.email !== undefined) c.email = patch.email;
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
  if (body.recipientName && customer && !customer.name) customer.name = body.recipientName;
  return { address };
}

export function setDefaultAddress(cid, addrId) {
  const list = cs.addresses.get(cid) || [];
  list.forEach((a) => (a.isDefault = a.id === addrId));
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
  const c = listCoupons().find((x) => x.code === code);
  if (c) c.redeemedCount += 1;
}
export function releaseCoupon(cid, code) {
  redemptions(cid).delete(code);
}

// ── cart ────────────────────────────────────────────────────────────────────
export function priceCart(cid) {
  const cur = cart(cid);
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
  return payment;
}
export const getPayment = (paymentId) => cs.payments.get(paymentId) || null;

// ── devices ──────────────────────────────────────────────────────────────────
export function registerDevice(cid, token) {
  const set = cs.devices.get(cid) || cs.devices.set(cid, new Set()).get(cid);
  if (token) set.add(token);
}

/** test helper */
export function _reset() {
  for (const k of Object.keys(cs)) cs[k] = cs[k] instanceof Map ? new Map() : cs[k];
}
