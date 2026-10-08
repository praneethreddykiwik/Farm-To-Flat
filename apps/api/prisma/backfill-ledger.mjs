/**
 * Move the existing wallet history out of the JSON blob and into the WalletLedger table.
 *
 * Every customer carries a `walletLedger` array that was rewritten whole on each transaction.
 * Those entries are real money history and must not be stranded when the blob stops being
 * written: refund idempotency reads the ledger, so a refund whose entry only exists in the blob
 * would look like it never happened and run a second time.
 *
 * Safe to run more than once. Each entry gets a deterministic idempotency key, and the unique
 * index refuses a duplicate — so a re-run inserts only what is missing.
 *
 * Reports drift rather than fixing it. Whether the cached balance or the entries are right is a
 * judgement about real money, and this script is not entitled to make it.
 *
 *   node --env-file=.env prisma/backfill-ledger.mjs          # report only
 *   node --env-file=.env prisma/backfill-ledger.mjs --write  # actually insert
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const WRITE = process.argv.includes('--write');

const toPaise = (v) => Math.round(Number(v) || 0);

async function main() {
  const customers = await prisma.customer.findMany({
    select: { id: true, walletBalancePaise: true, walletLedger: true },
  });

  let seen = 0;
  let inserted = 0;
  let skipped = 0;
  const drift = [];

  for (const c of customers) {
    const blob = Array.isArray(c.walletLedger) ? c.walletLedger : [];
    if (!blob.length) continue;

    // The blob is newest-first (unshift). Replay oldest-first so balanceAfterPaise reads forward.
    const entries = [...blob].reverse();
    let running = 0;

    for (let i = 0; i < entries.length; i += 1) {
      const e = entries[i];
      const amount = toPaise(e.amountPaise);
      const direction = e.direction === 'CREDIT' ? 'CREDIT' : 'DEBIT';
      running += direction === 'CREDIT' ? amount : -amount;
      seen += 1;

      const row = {
        id: e.id || `led_bf_${c.id.slice(-6)}_${i}`,
        customerId: c.id,
        direction,
        amountPaise: amount,
        // Prefer what was recorded at the time; fall back to the replayed running total.
        balanceAfterPaise: e.balanceAfterPaise != null ? toPaise(e.balanceAfterPaise) : running,
        source: e.source || 'UNKNOWN',
        reference: e.reference ?? null,
        note: e.note ?? null,
        actor: 'backfill',
        // Index, not content: two genuine ₹100 top-ups on the same day are different movements
        // and must both survive.
        idempotencyKey: `backfill:${c.id}:${i}:${e.id || amount}`,
        createdAt: e.createdAt ? new Date(e.createdAt) : new Date(),
      };

      if (!WRITE) continue;
      try {
        await prisma.walletLedger.create({ data: row });
        inserted += 1;
      } catch (err) {
        if (err?.code === 'P2002') skipped += 1;
        else throw err;
      }
    }

    const cached = c.walletBalancePaise ?? 0;
    if (cached !== running) drift.push({ customerId: c.id, cached, fromLedger: running });
  }

  console.log(`customers         : ${customers.length}`);
  console.log(`entries in blobs  : ${seen}`);
  if (WRITE) {
    console.log(`inserted          : ${inserted}`);
    console.log(`already present   : ${skipped}`);
  } else {
    console.log('(dry run — pass --write to insert)');
  }
  console.log(`\nbalance drift     : ${drift.length}`);
  for (const d of drift.slice(0, 20))
    console.log(`  ${d.customerId}  cached ${d.cached}  ledger ${d.fromLedger}  diff ${d.cached - d.fromLedger}`);
  if (drift.length) console.log('\nDrift is REPORTED, not corrected — decide each case deliberately.');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
