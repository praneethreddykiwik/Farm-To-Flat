/**
 * Review #33 / #34 (21 Nov 2026): delivery staff see a customer's number and flat only on the orders
 * they are working; an erased customer's details are hidden from everyone; exports are audited.
 */
import { describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
const customers = new Map([
  ['c_live', { id: 'c_live', mobile: '9876543210', name: 'Asha' }],
  ['c_gone', { id: 'c_gone', mobile: 'deleted_c_gone', name: null }],
]);
vi.mock('../src/customer-store.js', async (orig) => ({
  ...(await orig()),
  getCustomer: (id) => customers.get(id) || null,
}));
const { redactForStaff, seesContact } = await import('../src/lib/contact-policy.js');

const TODAY = '2026-11-21';
const order = (over = {}) => ({
  id: 'o1',
  customerId: 'c_live',
  customerName: 'Asha',
  mobile: '9876543210',
  status: 'CONFIRMED',
  deliveryDate: TODAY,
  address: { communityId: 'm1', communityName: 'My Home', block: 'B', flat: '402', floor: '4' },
  ...over,
});
const DRIVER = { role: 'FULFILMENT' };
const ADMIN = { role: 'ADMIN' };

describe('who sees contact details', () => {
  it("a driver sees today's open order in full", () => {
    expect(seesContact(DRIVER, order(), TODAY)).toBe(true);
    expect(redactForStaff(order(), DRIVER, TODAY).mobile).toBe('9876543210');
  });

  it('a driver gets a masked number and no flat on an old or finished order', () => {
    for (const o of [order({ deliveryDate: '2026-10-01' }), order({ status: 'DELIVERED' })]) {
      const v = redactForStaff(o, DRIVER, TODAY);
      expect(v.mobile).toBe('98xxxxxx10');
      expect(v.address.flat).toBeUndefined();
      expect(v.address.communityName).toBe('My Home');
      expect(v.contactHidden).toBe(true);
    }
  });

  it('an admin sees everything, except an erased customer', () => {
    expect(redactForStaff(order({ status: 'DELIVERED' }), ADMIN, TODAY).mobile).toBe('9876543210');
    const gone = redactForStaff(order({ customerId: 'c_gone' }), ADMIN, TODAY);
    expect(gone.customerName).toBe('Deleted customer');
    expect(gone.mobile).toBeNull();
    expect(gone.address.block).toBeUndefined();
  });

  it('never changes the order itself', () => {
    const o = order({ status: 'DELIVERED' });
    redactForStaff(o, DRIVER, TODAY);
    expect(o.mobile).toBe('9876543210');
    expect(o.address.flat).toBe('402');
  });
});
