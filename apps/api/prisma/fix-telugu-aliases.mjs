/**
 * One-off: push the corrected Telugu product-name aliases into an EXISTING database.
 *
 * Why this is needed: the catalog is seeded with `createMany({ skipDuplicates: true })`, so a
 * re-seed never touches products that already exist — and prod/staging already hold the old
 * aliases, where "Mutton curry cut" resolved to the generic మాంసం ("meat"). The customer app shows
 * the FIRST Telugu-script alias, so fixing the displayed name means rewriting the stored `aliases`
 * array in the right order. The Hindi fix ships in code (HINDI_NAMES) and needs no DB change.
 *
 * Safe to run repeatedly. Source of truth is the (corrected) seed, so it can never drift from it.
 *
 *   node --env-file=.env prisma/fix-telugu-aliases.mjs           # report only — shows before/after
 *   node --env-file=.env prisma/fix-telugu-aliases.mjs --write   # actually update the rows
 *
 * Point DATABASE_URL at the environment you mean to change (staging first, then prod).
 */
import { PrismaClient } from '@prisma/client';
import { PRODUCTS } from '../src/data/seed.js';

const prisma = new PrismaClient();
const WRITE = process.argv.includes('--write');

// Only the items whose translations were corrected. Their aliases are taken from the seed, so the
// exact value and order live in one place (src/data/seed.js), not duplicated here.
const IDS = [
  'p_moong_sprout',
  'p_chana_sprout',
  'p_chana_soaked',
  'p_almond_soaked',
  'p_chicken',
  'p_mutton',
];

const seedById = new Map(PRODUCTS.map((p) => [p.id, p]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  let changed = 0;
  for (const id of IDS) {
    const seed = seedById.get(id);
    if (!seed) {
      console.log(`SKIP ${id} — not in seed (renamed?)`);
      continue;
    }
    const row = await prisma.product.findUnique({ where: { id }, select: { aliases: true } });
    if (!row) {
      console.log(`SKIP ${id} — not in this database`);
      continue;
    }
    const want = seed.aliases ?? [];
    if (same(row.aliases || [], want)) {
      console.log(`OK   ${id} — already correct`);
      continue;
    }
    console.log(`FIX  ${id}`);
    console.log(`       from: ${JSON.stringify(row.aliases)}`);
    console.log(`       to:   ${JSON.stringify(want)}`);
    changed += 1;
    if (WRITE) await prisma.product.update({ where: { id }, data: { aliases: want } });
  }
  console.log(
    WRITE
      ? `\nUpdated ${changed} product(s).`
      : `\n${changed} product(s) would change. Re-run with --write to apply.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
