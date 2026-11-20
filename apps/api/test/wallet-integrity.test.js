/** Review #13 (21 Nov 2026): the boot check reports wallet drift and never changes anything. */
import { describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
const update = vi.fn();
vi.mock('../src/db.js', () => ({
  prisma: {
    customer: {
      findMany: async () => [
        { id: 'c_ok', walletBalancePaise: 500 },
        { id: 'c_drift', walletBalancePaise: 900 },
        { id: 'c_noentries', walletBalancePaise: 300 },
      ],
      update,
    },
    walletLedger: {
      findMany: async () => [
        { customerId: 'c_ok', direction: 'CREDIT', amountPaise: 700 },
        { customerId: 'c_ok', direction: 'DEBIT', amountPaise: 200 },
        { customerId: 'c_drift', direction: 'CREDIT', amountPaise: 400 },
      ],
    },
  },
}));
vi.mock('../src/lib/sentry.js', () => ({ reportError: vi.fn(), sentryEnabled: false }));

const { runWalletIntegrityCheck, lastWalletIntegrity } = await import(
  '../src/lib/wallet-integrity.js'
);

describe('wallet integrity at boot', () => {
  it('reports the one balance that differs from its ledger, and writes nothing', async () => {
    const r = await runWalletIntegrityCheck();
    expect(r.drifted).toEqual([{ customerId: 'c_drift', cached: 900, fromLedger: 400, diff: 500 }]);
    expect(r.checkedCustomers).toBe(3);
    expect(lastWalletIntegrity()).toBe(r);
    expect(update).not.toHaveBeenCalled();
  });
});
