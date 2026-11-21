/**
 * Who on the staff sees a customer's phone number and flat (review #33 / #34, 21 Nov 2026).
 *
 * The order board served every order's name, mobile and full address to every staff role, and the
 * CSV/XLSX exports let the lowest-trust role download the whole customer book — while the console's
 * own customer page required a reason and wrote an audit row to reveal one number. And an account
 * deleted under the DPDP Act still showed its name, number and flat on every old order, forever.
 *
 * The rule now:
 *   - ADMIN / SUPER_ADMIN see contact details (they handle complaints and refunds), except for an
 *     erased customer, whose details are hidden from everyone;
 *   - delivery / purchasing staff see them only on orders they are actually working: still open,
 *     due today or tomorrow (IST). Older and finished orders show a masked number and no flat.
 * The order itself is unchanged in memory and in the database — only what is SHOWN is reduced.
 */
import { getCustomer } from '../customer-store.js';
import { isErased } from './customer-history.js';
import { todayISO, addDaysISO } from './dates.js';

const FULL_VIEW = new Set(['ADMIN', 'SUPER_ADMIN']);
const WORKING = new Set(['CONFIRMED', 'PACKING', 'PACKED', 'OUT_FOR_DELIVERY']);

/** 9876543210 -> 98xxxxxx10 */
export function maskMobile(m) {
  const d = String(m || '');
  return d.length >= 6 ? `${d.slice(0, 2)}${'x'.repeat(d.length - 4)}${d.slice(-2)}` : null;
}

const erasedCustomer = (o) => {
  const c = o?.customerId ? getCustomer(o.customerId) : null;
  return !!c && isErased(c);
};

/** Does this staff member get the real number and flat on this order? */
export function seesContact(staff, o, today = todayISO()) {
  if (erasedCustomer(o)) return false;
  // No role recorded = the dev/test console with no sign-in configured: unchanged behaviour.
  if (!staff?.role || FULL_VIEW.has(staff.role)) return true;
  if (!WORKING.has(o.status)) return false;
  return o.deliveryDate === today || o.deliveryDate === addDaysISO(today, 1);
}

/** The order as this staff member may see it. Never mutates the order. */
export function redactForStaff(o, staff, today) {
  if (!o || seesContact(staff, o, today)) return o;
  const erased = erasedCustomer(o);
  const a = o.address || null;
  return {
    ...o,
    customerName: erased ? 'Deleted customer' : o.customerName,
    mobile: erased ? null : maskMobile(o.mobile),
    contactHidden: true,
    address: a
      ? {
          communityId: a.communityId,
          communityName: a.communityName,
          ...(erased ? {} : { block: a.block }),
        }
      : null,
  };
}
