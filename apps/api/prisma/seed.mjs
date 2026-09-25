// Seeds the reference data (catalog, communities, coupons, staff) into Supabase Postgres.
// Run once after `prisma db push`:  node prisma/seed.mjs
import { PrismaClient } from '@prisma/client';
import { CATEGORIES, PRODUCTS, COMMUNITIES, COUPONS } from '../src/data/seed.js';

const prisma = new PrismaClient();

// Same staff the in-memory build seeds, so every role works immediately.
const STAFF = [
  { mobile: '9999900001', name: 'Owner (example)', role: 'SUPER_ADMIN', aiAccess: true },
  { mobile: '9848033333', name: 'Admin (example)', role: 'ADMIN', aiAccess: false },
  { mobile: '9848011111', name: 'Procurement (example)', role: 'PROCUREMENT', aiAccess: false },
  { mobile: '9848022222', name: 'Fulfilment (example)', role: 'FULFILMENT', aiAccess: false },
];

async function main() {
  await prisma.category.createMany({
    data: CATEGORIES.map((c) => ({
      id: c.id,
      name: c.name,
      tint: c.tint ?? null,
      order: c.order ?? 0,
    })),
    skipDuplicates: true,
  });

  await prisma.product.createMany({
    data: PRODUCTS.map((p) => ({
      id: p.id,
      categoryId: p.category,
      name: p.name,
      aliases: p.aliases ?? [],
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
      diet: p.diet ?? (p.category === 'cat_meat' ? 'NONVEG' : 'VEG'),
      isSeasonal: !!p.isSeasonal,
      isActive: p.isActive !== false,
      availability: p.availability ?? 'AVAILABLE',
    })),
    skipDuplicates: true,
  });

  await prisma.community.createMany({
    data: COMMUNITIES.map((c) => ({
      id: c.id,
      name: c.name,
      area: c.area ?? null,
      blocks: c.blocks ?? [],
      deliveryDays: c.deliveryDays ?? [],
      cutoffHours: c.cutoffHours ?? 10,
      windowCapacity: c.windowCapacity ?? 30,
      isActive: c.isActive !== false,
    })),
    skipDuplicates: true,
  });

  await prisma.coupon.createMany({
    data: COUPONS.map((c) => ({
      code: c.code,
      label: c.label ?? null,
      type: c.type,
      valueBp: c.valueBp ?? null,
      valuePaise: c.valuePaise ?? null,
      freeProductId: c.freeProductId ?? null,
      minOrderPaise: c.minOrderPaise ?? 0,
      batchId: c.batchId ?? null,
      expiresAt: new Date(c.expiresAt),
      globalCap: c.globalCap ?? null,
      redeemedCount: c.redeemedCount ?? 0,
      isActive: c.isActive !== false,
    })),
    skipDuplicates: true,
  });

  await prisma.staff.createMany({ data: STAFF, skipDuplicates: true });
  await prisma.appConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  const counts = {
    categories: await prisma.category.count(),
    products: await prisma.product.count(),
    communities: await prisma.community.count(),
    coupons: await prisma.coupon.count(),
    staff: await prisma.staff.count(),
  };
  console.log('SEEDED ' + JSON.stringify(counts));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
