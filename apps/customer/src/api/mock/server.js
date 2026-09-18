/**
 * In-app mock of the /api/v1 contract (docs/api-contract.md). Enough behaviour to exercise
 * every screen end to end without Tharun's API or Adnan's money service running:
 *  - OTP login (dev OTP is 123456), refresh, logout
 *  - catalog, alias search, product detail
 *  - cart with re-pricing, ₹500 minimum, one coupon per order
 *  - delivery windows with capacity, cut-off
 *  - the order transaction incl. wallet leg and payment intent
 *  - wallet top-up + ledger, "webhook" simulated by /payments/verify
 * State lives in memory and resets on reload. Money is integer paise, serialised as strings.
 */
import {
  CATEGORIES,
  COMMUNITIES,
  COUPONS,
  DELIVERY_CHARGE_PAISE,
  MIN_ORDER_VALUE_PAISE,
  PRODUCTS,
  TOPUP_DENOMINATIONS_PAISE,
} from './data';
import { addDaysISO, todayISO, weekdayOf } from '../../lib/dates';
import { shortId } from '../../lib/ids';

const DEV_OTP = '123456';
const LATENCY_MS = [180, 420];

const money = (n) => String(Math.round(n));

/**
 * State survives reloads: it is mirrored into the on-device KV store after every mutating call,
 * so a Fast Refresh or a relaunch does not sign the tester out. Never used by the real API.
 */
let kv = null;
try {
  kv = require('../../lib/kv').kv;
} catch {
  kv = null; // node / vitest
}
const PERSIST_KEY = 'mock.state.v1';

const state = {
  customer: null,
  addresses: [],
  cart: { items: [], couponCode: null },
  wallet: { balancePaise: 0, ledger: [] },
  orders: [],
  payments: {},
  redemptions: new Set(),
  windows: new Map(), // key `${communityId}|${date}|${window}` -> booked count
  otp: null,
};

function persist() {
  if (!kv) return;
  try {
    kv.setJSON(PERSIST_KEY, {
      customer: state.customer,
      addresses: state.addresses,
      cart: state.cart,
      wallet: state.wallet,
      orders: state.orders,
      payments: state.payments,
      redemptions: [...state.redemptions],
      windows: [...state.windows.entries()],
    });
  } catch {}
}

(function hydrate() {
  if (!kv) return;
  const saved = kv.getJSON(PERSIST_KEY);
  if (!saved || !saved.customer) return;
  state.customer = saved.customer;
  state.addresses = saved.addresses || [];
  state.cart = saved.cart || { items: [], couponCode: null };
  state.wallet = saved.wallet || { balancePaise: 0, ledger: [] };
  state.orders = saved.orders || [];
  state.payments = saved.payments || {};
  state.redemptions = new Set(saved.redemptions || []);
  state.windows = new Map(saved.windows || []);
})();

/** Test/dev helper: wipe persisted mock state. */
export function resetMockState() {
  state.customer = null;
  state.addresses = [];
  state.cart = { items: [], couponCode: null };
  state.wallet = { balancePaise: 0, ledger: [] };
  state.orders = [];
  state.payments = {};
  state.redemptions = new Set();
  state.windows = new Map();
  state.otp = null;
  if (kv) kv.remove(PERSIST_KEY);
}

function err(status, code, message, details) {
  return { status, body: { error: { code, message, ...(details ? { details } : {}) } } };
}
// Responses are deep-cloned so RTK Query's frozen cache never shares objects with mock state.
const ok = (body, status = 200) => ({ status, body: JSON.parse(JSON.stringify(body)) });

function serialiseProduct(p) {
  const cat = CATEGORIES.find((c) => c.id === p.category);
  return {
    id: p.id,
    name: p.name,
    aliases: p.aliases,
    categoryId: p.category,
    categoryName: cat?.name,
    tint: cat?.tint,
    unit: p.unit,
    increment: p.increment,
    pricePaise: money(p.pricePaise),
    dailyCap: p.dailyCap,
    farm: p.farm,
    image: p.image,
    blurhash: p.blurhash || null,
    variableWeight: !!p.variableWeight,
    isActive: true,
  };
}

function normalise(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9ఀ-౿ ]/g, '')
    .trim();
}

/** cheap trigram similarity for misspelling tolerance */
function trigrams(s) {
  const t = `  ${s} `;
  const set = new Set();
  for (let i = 0; i < t.length - 2; i += 1) set.add(t.slice(i, i + 3));
  return set;
}
function similarity(a, b) {
  const ta = trigrams(a);
  const tb = trigrams(b);
  let inter = 0;
  ta.forEach((g) => tb.has(g) && (inter += 1));
  return inter / Math.max(1, ta.size + tb.size - inter);
}

function searchProducts(q) {
  const n = normalise(q);
  if (!n) return [];
  return PRODUCTS.map((p) => {
    const names = [p.name, ...p.aliases].map(normalise);
    let score = 0;
    names.forEach((name) => {
      if (name === n) score = Math.max(score, 1);
      else if (name.startsWith(n)) score = Math.max(score, 0.9);
      else if (name.includes(n)) score = Math.max(score, 0.75);
      else score = Math.max(score, similarity(name, n) * 0.9);
    });
    return { p, score };
  })
    .filter((x) => x.score >= 0.28)
    .sort((a, b) => b.score - a.score)
    .map((x) => serialiseProduct(x.p));
}

function priceCart() {
  const items = state.cart.items.map((it) => {
    const p = PRODUCTS.find((x) => x.id === it.productId);
    const qty = Number(it.quantity);
    const line = Math.round(p.pricePaise * qty);
    return {
      id: it.id,
      productId: p.id,
      name: p.name,
      unit: p.unit,
      increment: p.increment,
      image: p.image,
      blurhash: p.blurhash || null,
      tint: CATEGORIES.find((c) => c.id === p.category)?.tint,
      variableWeight: !!p.variableWeight,
      quantity: qty.toFixed(3),
      unitPricePaise: money(p.pricePaise),
      lineTotalPaise: money(line),
      note: it.note || null,
    };
  });
  const subtotal = items.reduce((s, i) => s + Number(i.lineTotalPaise), 0);
  let coupon = null;
  let discount = 0;
  if (state.cart.couponCode) {
    const c = COUPONS.find((x) => x.code === state.cart.couponCode);
    if (c) {
      discount = couponDiscount(c, subtotal);
      coupon = { code: c.code, type: c.type, label: c.label, discountPaise: money(discount) };
    }
  }
  const delivery = DELIVERY_CHARGE_PAISE;
  const total = Math.max(0, subtotal - discount + delivery);
  return {
    items,
    subtotalPaise: money(subtotal),
    couponDiscountPaise: money(discount),
    deliveryChargePaise: money(delivery),
    totalPaise: money(total),
    minOrderValuePaise: money(MIN_ORDER_VALUE_PAISE),
    meetsMinimum: subtotal >= MIN_ORDER_VALUE_PAISE,
    coupon,
    walletBalancePaise: money(state.wallet.balancePaise),
  };
}

function couponDiscount(c, subtotal) {
  if (c.type === 'PERCENT') return Math.round((subtotal * c.valueBp) / 10000);
  if (c.type === 'FLAT') return Math.min(subtotal, c.valuePaise);
  if (c.type === 'FREE_ITEM') {
    const p = PRODUCTS.find((x) => x.id === c.freeProductId);
    return p ? p.pricePaise : 0;
  }
  return 0;
}

function validateCoupon(code, subtotal) {
  const c = COUPONS.find((x) => x.code.toLowerCase() === String(code).trim().toLowerCase());
  if (!c)
    return err(
      404,
      'COUPON_NOT_FOUND',
      'We could not find that code. Check the brochure and try again.',
    );
  if (!c.isActive) return err(404, 'COUPON_NOT_FOUND', 'That code is no longer active.');
  if (new Date(c.expiresAt).getTime() < Date.now())
    return err(410, 'COUPON_EXPIRED', 'That code has expired.');
  if (state.redemptions.has(c.code))
    return err(409, 'COUPON_ALREADY_USED', 'This code has already been used on your account.');
  if (c.globalCap && c.redeemedCount >= c.globalCap)
    return err(
      409,
      'COUPON_CAP_REACHED',
      'All of these have been claimed. Sorry, you just missed it.',
    );
  if (subtotal < c.minOrderPaise) {
    return err(
      422,
      'MIN_ORDER_NOT_MET',
      `Add ₹${Math.ceil((c.minOrderPaise - subtotal) / 100)} more to use this code.`,
      {
        minOrderPaise: money(c.minOrderPaise),
      },
    );
  }
  return { coupon: c };
}

const IST_OFFSET_MIN = 5 * 60 + 30;
/** Mirrors apps/api/src/lib/dates.js istInstantMs — the real UTC instant for `hhmm` IST on `iso`. */
function istInstantMs(iso, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const midnightIstUtcMs = Date.parse(`${iso}T00:00:00Z`) - IST_OFFSET_MIN * 60 * 1000;
  return midnightIstUtcMs + (h * 60 + m) * 60 * 1000;
}

/**
 * Mirrors apps/api/src/lib/windows.js: a window closes at its community's same-day cut-off clock
 * time, not at a booking count. `booked` is informational only. See that file for the full rationale.
 */
function windowsFor(communityId, date) {
  const com = COMMUNITIES.find((c) => c.id === communityId) || COMMUNITIES[0];
  const out = [];
  const warningMs = 15 * 60 * 1000;
  for (let i = 0; i < 14; i += 1) {
    const d = addDaysISO(date, i);
    if (!com.deliveryDays.includes(weekdayOf(d))) continue;
    for (const w of ['MORNING', 'EVENING']) {
      const booked = state.windows.get(`${com.id}|${d}|${w}`) || 0;
      const cutoffTime = w === 'MORNING' ? com.morningCutoff : com.eveningCutoff;
      const cutoffAtMs = istInstantMs(d, cutoffTime);
      const msLeft = cutoffAtMs - Date.now();
      const isOpen = msLeft > 0;
      out.push({
        id: `win_${com.id}_${d}_${w}`,
        date: d,
        window: w,
        booked,
        isOpen,
        cutoffAt: new Date(cutoffAtMs).toISOString(),
        secondsUntilCutoff: isOpen ? Math.round(msLeft / 1000) : 0,
        showCountdown: isOpen && msLeft <= warningMs,
      });
    }
  }
  return out;
}

function ledgerPush(direction, amount, source, ref, note) {
  const before = state.wallet.balancePaise;
  const after = direction === 'CREDIT' ? before + amount : before - amount;
  state.wallet.balancePaise = after;
  state.wallet.ledger.unshift({
    id: `led_${shortId(10)}`,
    direction,
    amountPaise: money(amount),
    balanceAfterPaise: money(after),
    source,
    reference: ref,
    note,
    createdAt: new Date().toISOString(),
  });
}

function serialiseOrder(o) {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    items: o.items,
    subtotalPaise: money(o.subtotal),
    couponDiscountPaise: money(o.discount),
    deliveryChargePaise: money(o.delivery),
    totalPaise: money(o.total),
    walletAppliedPaise: money(o.walletApplied),
    gatewayAmountPaise: money(o.gatewayAmount),
    couponCode: o.couponCode,
    deliveryDate: o.deliveryDate,
    window: o.window,
    address: o.address,
    createdAt: o.createdAt,
    timeline: o.timeline,
    canCancel: ['CONFIRMED', 'PENDING_PAYMENT'].includes(o.status),
  };
}

function requireAuth(headers) {
  const auth = headers?.Authorization || headers?.authorization;
  if (!auth || !auth.startsWith('Bearer ') || !state.customer) {
    return err(401, 'UNAUTHENTICATED', 'Please sign in again.');
  }
  return null;
}

/**
 * @param {string} method
 * @param {string} path   e.g. "/catalog/search?q=tam"
 * @param {object|undefined} body
 * @param {Record<string,string>} headers
 */
export async function handle(method, path, body, headers = {}) {
  const res = await route(method, path, body, headers);
  if (method !== 'GET') persist();
  return res;
}

async function route(method, path, body, headers = {}) {
  const [rawPath, qs = ''] = path.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  const p = rawPath.replace(/\/$/, '');
  await new Promise((r) =>
    setTimeout(r, LATENCY_MS[0] + Math.random() * (LATENCY_MS[1] - LATENCY_MS[0])),
  );

  // ---------- AUTH ----------
  if (method === 'POST' && p === '/auth/otp/request') {
    const mobile = String(body?.mobile || '');
    if (!/^[6-9]\d{9}$/.test(mobile))
      return err(422, 'VALIDATION', 'Enter a valid 10-digit Indian mobile number.');
    state.otp = { mobile, attempts: 0, expiresAt: Date.now() + 5 * 60 * 1000 };
    return ok({ ok: true, expiresInSeconds: 300, devOtp: DEV_OTP });
  }
  if (method === 'POST' && p === '/auth/otp/verify') {
    const { mobile, otp } = body || {};
    if (!state.otp || state.otp.mobile !== mobile || Date.now() > state.otp.expiresAt) {
      return err(401, 'OTP_INVALID', 'That code has expired. Request a new one.');
    }
    if (otp !== DEV_OTP) {
      state.otp.attempts += 1;
      if (state.otp.attempts >= 3)
        return err(423, 'OTP_LOCKED', 'Too many attempts. Wait a few minutes and try again.');
      return err(
        401,
        'OTP_INVALID',
        `That code is not right. ${3 - state.otp.attempts} attempts left.`,
      );
    }
    const isNew = !state.customer;
    state.customer = state.customer || {
      id: `cus_${shortId(8)}`,
      mobile,
      name: null,
      createdAt: new Date().toISOString(),
    };
    state.otp = null;
    return ok({
      accessToken: `mock_access_${shortId(12)}`,
      refreshToken: `mock_refresh_${shortId(24)}`,
      customer: { ...state.customer, isNew, hasAddress: state.addresses.length > 0 },
    });
  }
  if (method === 'POST' && p === '/auth/refresh') {
    if (!state.customer || !String(body?.refreshToken || '').startsWith('mock_refresh_')) {
      return err(401, 'REFRESH_INVALID', 'Session expired.');
    }
    return ok({
      accessToken: `mock_access_${shortId(12)}`,
      refreshToken: `mock_refresh_${shortId(24)}`,
      customer: { ...state.customer, hasAddress: state.addresses.length > 0 },
    });
  }
  if (method === 'POST' && p === '/auth/logout') {
    resetMockState();
    return ok({ ok: true });
  }

  // ---------- PUBLIC ----------
  if (method === 'GET' && p === '/communities') {
    return ok({
      communities: COMMUNITIES.map(({ id, name, area, blocks, deliveryDays }) => ({
        id,
        name,
        area,
        blocks,
        deliveryDays,
      })),
    });
  }
  if (method === 'GET' && p === '/catalog') {
    return ok({
      categories: CATEGORIES.map(({ id, name, tint, order }) => ({ id, name, tint, order })),
      products: PRODUCTS.map(serialiseProduct),
      generatedAt: new Date().toISOString(),
    });
  }
  if (method === 'GET' && p === '/catalog/search') return ok({ products: searchProducts(query.q) });
  if (method === 'GET' && p.startsWith('/catalog/')) {
    const prod = PRODUCTS.find((x) => x.id === p.slice('/catalog/'.length));
    if (!prod) return err(404, 'NOT_FOUND', 'Product not found');
    return ok({ product: serialiseProduct(prod) });
  }

  // ---------- AUTHENTICATED ----------
  const unauth = requireAuth(headers);
  if (unauth) return unauth;

  if (method === 'GET' && p === '/me') {
    return ok({
      customer: { ...state.customer, hasAddress: state.addresses.length > 0 },
      walletBalancePaise: money(state.wallet.balancePaise),
      defaultAddress: state.addresses.find((a) => a.isDefault) || null,
      cartCount: state.cart.items.length,
    });
  }
  if (method === 'PATCH' && p === '/me') {
    state.customer = {
      ...state.customer,
      name: body?.name ?? state.customer.name,
      email: body?.email ?? state.customer.email ?? null,
    };
    return ok({ customer: { ...state.customer, hasAddress: state.addresses.length > 0 } });
  }
  if (method === 'GET' && p === '/addresses') return ok({ addresses: state.addresses });
  if (method === 'POST' && p === '/addresses') {
    const { communityId, block, flat, floor, landmark, recipientName, contactNumber, lat, lng } =
      body || {};
    let community = COMMUNITIES.find((c) => c.id === communityId);
    if (!community && typeof lat === 'number' && typeof lng === 'number') {
      community = COMMUNITIES.find((c) => Math.hypot(c.lat - lat, c.lng - lng) < 0.02);
      if (!community)
        return err(
          422,
          'ADDRESS_NOT_SERVICEABLE',
          "We don't deliver to this location yet. We've noted it for expansion.",
        );
    }
    if (!community) return err(422, 'VALIDATION', 'Choose your community.');
    if (!community.blocks.includes(block))
      return err(422, 'VALIDATION', 'Choose your block from the list.');
    if (!flat || String(flat).trim().length < 1)
      return err(422, 'VALIDATION', 'Enter your flat number.');
    const address = {
      id: `adr_${shortId(8)}`,
      communityId: community.id,
      communityName: community.name,
      area: community.area,
      block,
      flat: String(flat).trim(),
      floor: floor || null,
      landmark: landmark || null,
      recipientName: recipientName || state.customer.name || null,
      contactNumber: contactNumber || state.customer.mobile,
      isDefault: state.addresses.length === 0 || !!body?.isDefault,
    };
    if (address.isDefault) state.addresses.forEach((a) => (a.isDefault = false));
    state.addresses.push(address);
    if (recipientName && !state.customer.name) state.customer.name = recipientName;
    return ok({ address }, 201);
  }
  if (method === 'POST' && /^\/addresses\/[^/]+\/default$/.test(p)) {
    const id = p.split('/')[2];
    state.addresses.forEach((a) => (a.isDefault = a.id === id));
    return ok({ addresses: state.addresses });
  }

  // ---------- CART ----------
  if (method === 'GET' && p === '/cart') return ok({ cart: priceCart() });
  if (method === 'PUT' && p === '/cart/items') {
    const { productId, quantity, note } = body || {};
    const prod = PRODUCTS.find((x) => x.id === productId);
    if (!prod) return err(404, 'NOT_FOUND', 'Product not found');
    const qty = Number(quantity);
    const inc = Number(prod.increment);
    if (!(qty >= 0) || Math.abs(Math.round(qty / inc) * inc - qty) > 1e-6) {
      return err(422, 'VALIDATION', `Quantity must be in steps of ${prod.increment}`);
    }
    if (qty > prod.dailyCap)
      return err(
        422,
        'CAP_EXCEEDED',
        `Only ${prod.dailyCap} ${prod.unit.toLowerCase()} available today.`,
      );
    const existing = state.cart.items.find((i) => i.productId === productId);
    if (qty === 0) {
      state.cart.items = state.cart.items.filter((i) => i.productId !== productId);
    } else if (existing) {
      existing.quantity = qty;
      if (note !== undefined) existing.note = note;
    } else {
      state.cart.items.push({
        id: `ci_${shortId(8)}`,
        productId,
        quantity: qty,
        note: note || null,
      });
    }
    return ok({ cart: priceCart() });
  }
  if (method === 'DELETE' && p.startsWith('/cart/items/')) {
    const id = p.slice('/cart/items/'.length);
    state.cart.items = state.cart.items.filter((i) => i.id !== id && i.productId !== id);
    return ok({ cart: priceCart() });
  }
  if (method === 'POST' && p === '/cart/coupon') {
    const cart = priceCart();
    const res = validateCoupon(body?.code, Number(cart.subtotalPaise));
    if (res.status) return res;
    state.cart.couponCode = res.coupon.code;
    return ok({ cart: priceCart() });
  }
  if (method === 'DELETE' && p === '/cart/coupon') {
    state.cart.couponCode = null;
    return ok({ cart: priceCart() });
  }

  // ---------- WINDOWS ----------
  if (method === 'GET' && p === '/delivery-windows') {
    const addr =
      state.addresses.find((a) => a.id === query.addressId) ||
      state.addresses.find((a) => a.isDefault);
    const from = query.date || todayISO();
    return ok({ windows: windowsFor(addr?.communityId, from) });
  }

  // ---------- ORDERS ----------
  if (method === 'POST' && p === '/orders') {
    const { addressId, deliveryDate, window, couponCode, useWallet } = body || {};
    const cart = priceCart();
    if (cart.items.length === 0) return err(422, 'CART_EMPTY', 'Your basket is empty.');
    if (!cart.meetsMinimum)
      return err(422, 'MIN_ORDER_NOT_MET', 'Minimum order value is ₹500.', {
        minOrderPaise: money(MIN_ORDER_VALUE_PAISE),
      });
    const address = state.addresses.find((a) => a.id === addressId);
    if (!address) return err(422, 'VALIDATION', 'Choose a delivery address.');
    const win = windowsFor(address.communityId, todayISO()).find(
      (w) => w.date === deliveryDate && w.window === window,
    );
    if (!win) return err(422, 'VALIDATION', 'Choose a delivery window.');
    if (!win.isOpen) {
      const next = windowsFor(address.communityId, todayISO()).find((w) => w.isOpen);
      return err(409, 'ORDER_CUTOFF_PASSED', 'Orders for that window have closed.', {
        nextAvailable: next || null,
      });
    }
    const subtotal = Number(cart.subtotalPaise);
    let discount = 0;
    const code = couponCode || state.cart.couponCode;
    if (code) {
      const res = validateCoupon(code, subtotal);
      if (res.status) return res;
      discount = couponDiscount(res.coupon, subtotal);
      state.redemptions.add(res.coupon.code);
      res.coupon.redeemedCount += 1;
    }
    const key = `${address.communityId}|${deliveryDate}|${window}`;
    state.windows.set(key, (state.windows.get(key) || 0) + 1);
    const delivery = DELIVERY_CHARGE_PAISE;
    const payable = Math.max(0, subtotal - discount + delivery);
    let walletApplied = 0;
    const id = `ord_${shortId(10)}`;
    const orderNumber = `F2F-${shortId(6)}`;
    if (useWallet && state.wallet.balancePaise > 0) {
      walletApplied = Math.min(state.wallet.balancePaise, payable);
      if (walletApplied > 0)
        ledgerPush('DEBIT', walletApplied, 'ORDER', orderNumber, `Order ${orderNumber}`);
    }
    const gatewayAmount = payable - walletApplied;
    const now = new Date().toISOString();
    const order = {
      id,
      orderNumber,
      status: gatewayAmount > 0 ? 'PENDING_PAYMENT' : 'CONFIRMED',
      items: cart.items,
      subtotal,
      discount,
      delivery,
      total: payable,
      walletApplied,
      gatewayAmount,
      couponCode: code || null,
      deliveryDate,
      window,
      address,
      createdAt: now,
      timeline: [{ status: gatewayAmount > 0 ? 'PENDING_PAYMENT' : 'CONFIRMED', at: now }],
    };
    state.orders.unshift(order);
    state.cart = { items: [], couponCode: null };
    let paymentIntent = null;
    if (gatewayAmount > 0) {
      const payId = `pay_${shortId(10)}`;
      state.payments[payId] = {
        id: payId,
        purpose: 'ORDER',
        orderId: id,
        amountPaise: gatewayAmount,
        status: 'CREATED',
        razorpayOrderId: `order_${shortId(14)}`,
      };
      paymentIntent = {
        paymentId: payId,
        razorpayOrderId: state.payments[payId].razorpayOrderId,
        amountPaise: money(gatewayAmount),
        description: `Order ${orderNumber}`,
      };
    }
    return ok({ order: serialiseOrder(order), paymentIntent }, 201);
  }
  if (method === 'GET' && p === '/orders')
    return ok({ orders: state.orders.map(serialiseOrder), nextCursor: null });
  if (method === 'GET' && /^\/orders\/[^/]+$/.test(p)) {
    const o = state.orders.find((x) => x.id === p.split('/')[2]);
    if (!o) return err(404, 'NOT_FOUND', 'Order not found');
    return ok({ order: serialiseOrder(o) });
  }
  if (method === 'POST' && /^\/orders\/[^/]+\/cancel$/.test(p)) {
    const o = state.orders.find((x) => x.id === p.split('/')[2]);
    if (!o) return err(404, 'NOT_FOUND', 'Order not found');
    if (!['CONFIRMED', 'PENDING_PAYMENT'].includes(o.status))
      return err(409, 'CANNOT_CANCEL', 'This order has already been packed.');
    o.status = 'CANCELLED';
    o.timeline.push({ status: 'CANCELLED', at: new Date().toISOString() });
    if (o.walletApplied > 0)
      ledgerPush('CREDIT', o.walletApplied, 'REFUND', o.orderNumber, `Refund for ${o.orderNumber}`);
    if (o.couponCode) state.redemptions.delete(o.couponCode);
    return ok({ order: serialiseOrder(o) });
  }

  // ---------- WALLET ----------
  if (method === 'GET' && p === '/wallet') {
    return ok({
      balancePaise: money(state.wallet.balancePaise),
      ledger: state.wallet.ledger,
      nextCursor: null,
      denominationsPaise: TOPUP_DENOMINATIONS_PAISE.map(money),
    });
  }
  if (method === 'POST' && p === '/wallet/topup') {
    const amount = Number(body?.amountPaise);
    if (!TOPUP_DENOMINATIONS_PAISE.includes(amount))
      return err(422, 'VALIDATION', 'Choose one of the top-up amounts.');
    const payId = `pay_${shortId(10)}`;
    state.payments[payId] = {
      id: payId,
      purpose: 'TOPUP',
      amountPaise: amount,
      status: 'CREATED',
      razorpayOrderId: `order_${shortId(14)}`,
    };
    return ok(
      {
        paymentIntent: {
          paymentId: payId,
          razorpayOrderId: state.payments[payId].razorpayOrderId,
          amountPaise: money(amount),
          description: 'Wallet top-up',
        },
      },
      201,
    );
  }
  if (method === 'POST' && p === '/payments/verify') {
    // Advisory in production. In the mock it also plays the role of the webhook so the flow completes.
    const { paymentId, razorpayPaymentId, success } = body || {};
    const pay = state.payments[paymentId];
    if (!pay) return err(404, 'NOT_FOUND', 'Payment not found');
    if (pay.status === 'CAPTURED') return ok({ status: 'CAPTURED', duplicate: true });
    if (success === false) {
      pay.status = 'FAILED';
      if (pay.purpose === 'ORDER') {
        const o = state.orders.find((x) => x.id === pay.orderId);
        if (o && o.status === 'PENDING_PAYMENT') {
          o.status = 'PAYMENT_FAILED';
          o.timeline.push({ status: 'PAYMENT_FAILED', at: new Date().toISOString() });
          if (o.walletApplied > 0)
            ledgerPush(
              'CREDIT',
              o.walletApplied,
              'REFUND',
              o.orderNumber,
              'Payment abandoned, wallet returned',
            );
          if (o.couponCode) state.redemptions.delete(o.couponCode);
        }
      }
      return ok({ status: 'FAILED' });
    }
    pay.status = 'CAPTURED';
    pay.razorpayPaymentId = razorpayPaymentId || `pay_rzp_${shortId(10)}`;
    if (pay.purpose === 'TOPUP') {
      ledgerPush('CREDIT', pay.amountPaise, 'TOPUP', pay.razorpayPaymentId, 'Wallet top-up');
      return ok({ status: 'CAPTURED', walletBalancePaise: money(state.wallet.balancePaise) });
    }
    const o = state.orders.find((x) => x.id === pay.orderId);
    if (o && o.status === 'PENDING_PAYMENT') {
      o.status = 'CONFIRMED';
      o.timeline.push({ status: 'CONFIRMED', at: new Date().toISOString() });
    }
    return ok({ status: 'CAPTURED', order: o ? serialiseOrder(o) : null });
  }
  if (method === 'POST' && p === '/devices') return ok({ ok: true });

  return err(404, 'NOT_FOUND', `No mock route for ${method} ${p}`);
}

/** Exposed for the dev drawer / tests */
export const mockState = state;
