/** Review #3 (21 Nov 2026): a rejected checkout sheet is not always "you cancelled". */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/env', () => ({ env: { isExpoGo: true, useMocks: true } }));
const { classifyGatewayError } = await import('../lib/razorpay.js');

describe('classifyGatewayError', () => {
  it('the customer closing the sheet is a cancel', () => {
    expect(classifyGatewayError({ code: 2, description: 'Payment Cancelled' })).toBe('cancelled');
    expect(
      classifyGatewayError({
        code: 0,
        description: JSON.stringify({ error: { reason: 'payment_cancelled', description: 'x' } }),
      }),
    ).toBe('cancelled');
  });

  it('a bank decline is a failure, said as one', () => {
    expect(
      classifyGatewayError({
        code: 0,
        description: JSON.stringify({
          error: { reason: 'payment_failed', description: 'Declined by bank' },
        }),
      }),
    ).toBe('failed');
  });

  it('a dropped connection is unknown — the money may have gone, so nothing is marked failed', () => {
    expect(classifyGatewayError({ code: 0, description: 'Network error' })).toBe('unknown');
    expect(classifyGatewayError(undefined)).toBe('unknown');
  });
});
