/**
 * Supabase persistence for the master data (catalog, communities, coupons, staff, settings).
 *
 * Model chosen with the team: Supabase is the SOURCE OF TRUTH. On boot we load every master-data
 * table into the in-memory store (store.js / access-store.js); every admin write updates the cache
 * AND writes through to Supabase. On a single server the app therefore always reads current data and
 * it survives restarts. Reads stay synchronous, so routes and serializers are untouched.
 *
 * Disabled under NODE_ENV=test (the suite keeps its fast, offline in-memory path) or when no
 * DATABASE_URL is set (pure local demo). Writes are fire-and-forget with error logging so a slow DB
 * never blocks a response; the cache already reflects the change.
 *
 * Transactional data (customers, orders, wallet) is NOT here yet — that is stage 2.
 */
import { prisma } from './db.js';

export const persistEnabled = process.env.NODE_ENV !== 'test' && !!process.env.DATABASE_URL;

const iso = (d) => (d && d.toISOString ? d.toISOString() : d);

// ── DB row → in-memory shape (must match what store.js / serialize.js expect) ──
const rowToCategory = (r) => ({ id: r.id, name: r.name, tint: r.tint, order: r.order });
const rowToProduct = (r) => ({
  id: r.id,
  category: r.categoryId,
  name: r.name,
  aliases: r.aliases || [],
  unit: r.unit,
  increment: Number(r.increment),
  pricePaise: r.pricePaise,
  costPaise: r.costPaise,
  dailyCap: r.dailyCap,
  bufferPct: r.bufferPct,
  farm: r.farm,
  image: r.image,
  blurhash: r.blurhash,
  variableWeight: r.variableWeight,
  diet: r.diet,
  isSeasonal: r.isSeasonal,
  isActive: r.isActive,
  availability: r.availability,
  createdAt: iso(r.createdAt),
});
const rowToCommunity = (r) => ({
  id: r.id,
  name: r.name,
  area: r.area,
  blocks: r.blocks || [],
  deliveryDays: r.deliveryDays || [],
  cutoffHours: r.cutoffHours,
  windowCapacity: r.windowCapacity,
  isActive: r.isActive,
});
const rowToCoupon = (r) => ({
  code: r.code,
  label: r.label,
  type: r.type,
  valueBp: r.valueBp,
  valuePaise: r.valuePaise,
  freeProductId: r.freeProductId,
  minOrderPaise: r.minOrderPaise,
  batchId: r.batchId,
  expiresAt: iso(r.expiresAt),
  globalCap: r.globalCap,
  redeemedCount: r.redeemedCount,
  isActive: r.isActive,
});
const rowToStaff = (r) => ({
  id: r.id,
  mobile: r.mobile,
  name: r.name,
  role: r.role,
  aiAccess: r.aiAccess,
  createdAt: iso(r.createdAt),
});

// ── in-memory shape → DB columns ──
const productToRow = (p) => ({
  id: p.id,
  categoryId: p.category,
  name: p.name,
  aliases: p.aliases || [],
  unit: p.unit,
  increment: String(p.increment),
  pricePaise: p.pricePaise,
  costPaise: p.costPaise ?? 0,
  dailyCap: p.dailyCap ?? 100,
  bufferPct: p.bufferPct ?? 10,
  farm: p.farm ?? null,
  image: p.image ?? null,
  blurhash: p.blurhash ?? null,
  variableWeight: !!p.variableWeight,
  diet: p.diet || (p.category === 'cat_meat' ? 'NONVEG' : 'VEG'),
  isSeasonal: !!p.isSeasonal,
  isActive: p.isActive !== false,
  availability: p.availability || 'AVAILABLE',
});
const couponToRow = (c) => ({
  code: String(c.code).toUpperCase(),
  label: c.label ?? null,
  type: c.type,
  valueBp: c.valueBp ?? null,
  valuePaise: c.valuePaise ?? null,
  freeProductId: c.freeProductId ?? null,
  minOrderPaise: c.minOrderPaise ?? 0,
  batchId: c.batchId ?? null,
  expiresAt: new Date(c.expiresAt || '2030-12-31T23:59:59+05:30'),
  globalCap: c.globalCap ?? null,
  redeemedCount: c.redeemedCount ?? 0,
  isActive: c.isActive !== false,
});
const communityToRow = (c) => ({
  id: c.id,
  name: c.name,
  area: c.area ?? null,
  blocks: c.blocks || [],
  deliveryDays: c.deliveryDays || [],
  cutoffHours: c.cutoffHours ?? 10,
  windowCapacity: c.windowCapacity ?? 30,
  isActive: c.isActive !== false,
});
const staffToRow = (s) => ({
  id: s.id,
  mobile: String(s.mobile),
  name: s.name ?? null,
  role: s.role,
  aiAccess: !!s.aiAccess,
});

/** Read every master-data table and return in-memory-shaped collections + the settings row. */
export async function loadAll() {
  const [categories, products, communities, coupons, staff, config] = await Promise.all([
    prisma.category.findMany(),
    prisma.product.findMany(),
    prisma.community.findMany(),
    prisma.coupon.findMany(),
    prisma.staff.findMany(),
    prisma.appConfig.findUnique({ where: { id: 1 } }),
  ]);
  return {
    categories: categories.map(rowToCategory).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    products: products.map(rowToProduct),
    communities: communities.map(rowToCommunity),
    coupons: coupons.map(rowToCoupon),
    staff: staff.map(rowToStaff),
    config,
  };
}

const logErr = (op) => (e) =>
  // eslint-disable-next-line no-console
  console.error(`[persist] ${op} failed:`, e?.message || e);

/** Write-through helpers. No-ops when persistence is off, so callers never branch. */
export const persist = persistEnabled
  ? {
      productUpsert: (p) => {
        const row = productToRow(p);
        return prisma.product
          .upsert({ where: { id: p.id }, create: row, update: row })
          .catch(logErr('product.upsert'));
      },
      productDelete: (pid) =>
        prisma.product.delete({ where: { id: pid } }).catch(logErr('product.delete')),
      couponUpsert: (c) => {
        const row = couponToRow(c);
        return prisma.coupon
          .upsert({ where: { code: row.code }, create: row, update: row })
          .catch(logErr('coupon.upsert'));
      },
      couponDelete: (code) =>
        prisma.coupon
          .delete({ where: { code: String(code).toUpperCase() } })
          .catch(logErr('coupon.delete')),
      communityUpsert: (c) => {
        const row = communityToRow(c);
        return prisma.community
          .upsert({ where: { id: c.id }, create: row, update: row })
          .catch(logErr('community.upsert'));
      },
      staffUpsert: (s) => {
        const row = staffToRow(s);
        return prisma.staff
          .upsert({ where: { id: s.id }, create: row, update: row })
          .catch(logErr('staff.upsert'));
      },
      staffDelete: (sid) =>
        prisma.staff.delete({ where: { id: sid } }).catch(logErr('staff.delete')),
      configUpdate: (data) =>
        prisma.appConfig
          .upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data })
          .catch(logErr('config.update')),
    }
  : {
      productUpsert() {},
      productDelete() {},
      couponUpsert() {},
      couponDelete() {},
      communityUpsert() {},
      staffUpsert() {},
      staffDelete() {},
      configUpdate() {},
    };
