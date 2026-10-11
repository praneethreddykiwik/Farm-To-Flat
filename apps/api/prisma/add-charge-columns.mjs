/**
 * Add the columns the itemised-bill feature needs.
 *
 * This exists because the deploy does not apply schema changes. `render.yaml`'s build command runs
 * `prisma generate` — which regenerates the CLIENT from schema.prisma — but nothing runs
 * `migrate deploy` or `db push`. So a new column in schema.prisma produces a client that selects a
 * column the database does not have, every query throws, boot hydration fails, and the API falls
 * back to in-memory seed data with `ok:false`. That is exactly what happened here: a live API
 * serving seed products instead of real orders.
 *
 * Deliberately raw SQL rather than `prisma db push`: push diffs the whole schema and will drop a
 * column that exists in the database but not in schema.prisma. On a database holding real orders
 * that is not a risk worth taking to add four nullable columns.
 *
 * Idempotent. ADD COLUMN IF NOT EXISTS cannot destroy anything, so re-running is free.
 *
 *   cd apps/api && node --env-file=.env prisma/add-charge-columns.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const statements = [
  `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "chargeBreakdown" JSONB`,
  `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "taxPaise" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "AppConfig" ADD COLUMN IF NOT EXISTS "charges" JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE "AppConfig" ADD COLUMN IF NOT EXISTS "tax" JSONB`,
];

for (const sql of statements) {
  await prisma.$executeRawUnsafe(sql);
  console.log('ok:', sql.replace(/\s+/g, ' '));
}

// Prove the database is readable afterwards rather than assuming it.
console.log('orders readable:', await prisma.order.count());
await prisma.$disconnect();
