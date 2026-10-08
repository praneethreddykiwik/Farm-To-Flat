import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The two ways a payment could have been confirmed without money arriving.
 *
 * Both are about the gap between "the gateway told us" and "we decided": verification used to be
 * conditional on our own configuration, and the captured amount was never compared to the amount
 * owed.
 */
describe('capture compares what arrived against what was owed', () => {
  let capture;
  let store;

  beforeEach(async () => {
    vi.resetModules();
    store = {
      pay: {
        id: 'pay_1',
        customerId: 'cus_1',
        purpose: 'TOPUP',
        amountPaise: 50000,
        status: 'PENDING',
      },
      ledger: [],
    };
    vi.doMock('../src/customer-store.js', () => ({
      getPayment: (id) => (id === 'pay_1' ? store.pay : null),
      paymentByRazorpayOrderId: () => store.pay,
      savePayment: (p) => {
        store.pay = p;
      },
      ledgerPush: (...a) => store.ledger.push(a),
      restoreCartFromOrder: () => {},
    }));
    vi.doMock('../src/store.js', () => ({
      getOrder: () => null,
      patchOrder: (_id, fn) => {
        const o = { status: 'PENDING_PAYMENT', timeline: [] };
        fn(o);
        return o;
      },
    }));
    capture = (await import('../src/lib/capture.js')).capturePayment;
  });

  it('captures when the amount matches', async () => {
    const r = await capture({ paymentId: 'pay_1', amountPaise: 50000, currency: 'INR' });
    expect(r.outcome).toBe('captured');
    expect(store.ledger).toHaveLength(1);
  });

  it('REFUSES a partial capture rather than confirming in full', async () => {
    const r = await capture({ paymentId: 'pay_1', amountPaise: 100, currency: 'INR' });
    expect(r.outcome).toBe('mismatch');
    expect(r.expectedPaise).toBe('50000');
    expect(r.gotPaise).toBe('100');
    // Nothing moved: no credit, and the payment is still waiting.
    expect(store.ledger).toHaveLength(0);
    expect(store.pay.status).toBe('PENDING');
  });

  it('refuses an overpayment too — a mismatch is a mismatch', async () => {
    const r = await capture({ paymentId: 'pay_1', amountPaise: 500000, currency: 'INR' });
    expect(r.outcome).toBe('mismatch');
    expect(store.ledger).toHaveLength(0);
  });

  it('refuses a currency that is not INR', async () => {
    const r = await capture({ paymentId: 'pay_1', amountPaise: 50000, currency: 'USD' });
    expect(r.outcome).toBe('mismatch');
    expect(store.ledger).toHaveLength(0);
  });

  it('still captures when no amount is supplied — the client leg has only a signature', async () => {
    const r = await capture({ paymentId: 'pay_1' });
    expect(r.outcome).toBe('captured');
  });

  it('is idempotent: a second capture is a no-op, not a second credit', async () => {
    await capture({ paymentId: 'pay_1', amountPaise: 50000 });
    const again = await capture({ paymentId: 'pay_1', amountPaise: 50000 });
    expect(again.outcome).toBe('already');
    expect(store.ledger).toHaveLength(1);
  });
});
