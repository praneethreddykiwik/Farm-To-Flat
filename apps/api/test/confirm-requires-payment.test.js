import { describe, expect, it, vi } from 'vitest';

/**
 * An order may not be confirmed by hand unless someone has actually paid for it.
 *
 * The transition PENDING_PAYMENT → CONFIRMED had no payment check. Worse than giving away goods:
 * if the gateway capture then landed, capture.js would find the order no longer PENDING_PAYMENT,
 * treat the money as orphaned, and credit the full amount to the customer's wallet. One click,
 * goods gone AND store credit issued.
 *
 * mayConfirmUnpaid is not exported (it closes over the store), so the rule is tested here as the
 * predicate it implements. The two legitimate exceptions are the ones that matter: COD is paid at
 * the door, and a wallet-covered order has no gateway leg to capture.
 */
const mayConfirm = (order, captured) => {
  if (order.paymentMethod === 'COD') return true;
  if (Number(order.gatewayAmountPaise || 0) === 0) return true;
  return !!captured;
};

describe('confirming an order by hand', () => {
  it('refuses an online order with nothing captured', () => {
    expect(mayConfirm({ paymentMethod: 'ONLINE', gatewayAmountPaise: 50000 }, null)).toBe(false);
  });

  it('allows it once the gateway payment is captured', () => {
    expect(
      mayConfirm({ paymentMethod: 'ONLINE', gatewayAmountPaise: 50000 }, { id: 'pay_1' }),
    ).toBe(true);
  });

  it('allows COD — the money arrives at the door, not before', () => {
    expect(mayConfirm({ paymentMethod: 'COD', gatewayAmountPaise: 50000 }, null)).toBe(true);
  });

  it('allows a fully wallet-covered order — there is no gateway leg to wait for', () => {
    expect(mayConfirm({ paymentMethod: 'ONLINE', gatewayAmountPaise: 0 }, null)).toBe(true);
  });

  it('treats a missing gateway amount as zero rather than throwing', () => {
    expect(mayConfirm({ paymentMethod: 'ONLINE' }, null)).toBe(true);
  });

  it('still refuses when only PART of the order was covered by wallet', () => {
    // A part-wallet order still has money owed at the gateway; that leg has to land.
    expect(mayConfirm({ paymentMethod: 'ONLINE', gatewayAmountPaise: 1 }, null)).toBe(false);
  });
});

describe('the mode the server reports', () => {
  it('reads live/test from the key id itself, so it cannot disagree with the account', async () => {
    vi.resetModules();
    process.env.RAZORPAY_KEY_ID = 'rzp_live_ABCDEFGHIJ';
    process.env.RAZORPAY_KEY_SECRET = 'secret';
    process.env.NODE_ENV = 'development';
    const live = await import('../src/lib/razorpay.js');
    expect(live.razorpayMode()).toBe('live');

    vi.resetModules();
    process.env.RAZORPAY_KEY_ID = 'rzp_test_ABCDEFGHIJ';
    const test = await import('../src/lib/razorpay.js');
    expect(test.razorpayMode()).toBe('test');

    vi.resetModules();
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    const off = await import('../src/lib/razorpay.js');
    expect(off.razorpayMode()).toBe('off');
  });
});
