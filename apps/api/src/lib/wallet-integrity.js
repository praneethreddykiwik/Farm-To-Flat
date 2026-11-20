/**
 * Boot-time wallet check (review #13, 21 Nov 2026). READ-ONLY.
 *
 * Every wallet movement writes a WalletLedger row and the customer's cached balance in one
 * transaction, but the API rebuilds balances at boot from the cached column (and the ledger shown to
 * the customer from a JSON copy on the customer row). Nothing ever compared them with the ledger
 * table, and `checkWalletIntegrity` had no caller. A drift matters because refund idempotency reads
 * the ledger: a balance without its entries makes a cancelled order look unrefunded.
 *
 * This compares them once after boot and REPORTS any difference (log + Sentry). It never corrects a
 * balance — which side is right is a decision about real money, for a person to make.
 */
import { prisma } from '../db.js';
import { checkWalletIntegrity } from '../customer-store.js';
import { reportError } from './sentry.js';

/** @type {{ at: string, drifted: any[], checkedCustomers: number } | null} */
let last = null;
export const lastWalletIntegrity = () => last;

/** @returns {Promise<{ at: string, drifted: any[], checkedCustomers: number } | null>} */
export async function runWalletIntegrityCheck() {
  try {
    const [customers, entries] = await Promise.all([
      prisma.customer.findMany({ select: { id: true, walletBalancePaise: true } }),
      prisma.walletLedger.findMany({
        select: { customerId: true, direction: true, amountPaise: true },
      }),
    ]);
    const drifted = checkWalletIntegrity(customers, entries);
    last = { at: new Date().toISOString(), drifted, checkedCustomers: customers.length };
    if (drifted.length) {
      // eslint-disable-next-line no-console
      console.error(
        `[wallet] ${drifted.length} balance(s) differ from the ledger:`,
        JSON.stringify(drifted.slice(0, 20)),
      );
      reportError(new Error(`wallet drift: ${drifted.length} customer(s)`), {
        scope: 'wallet-integrity',
        sample: drifted.slice(0, 10),
      });
    }
    return last;
  } catch (e) {
    // A missing table or a cold database: say so, change nothing.
    // eslint-disable-next-line no-console
    console.error('[wallet] integrity check could not run:', e?.message || e);
    return null;
  }
}
