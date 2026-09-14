/**
 * Push notifications aimed at operators, not customers. Where lib/push.js rings a single customer's
 * devices for their own order, this fans a message out to every ADMIN / SUPER_ADMIN who has the app
 * installed — used for events an operator must act on, above all a procurement cost that broke the
 * buffer and is now waiting on an accept/reject.
 *
 * Same delivery caveat as lib/push.js: Expo relays to APNs/FCM, so a real phone only rings once those
 * are configured in the build. Until then this is a safe no-op and the in-app approvals list (which
 * polls) remains the source of truth. Fire-and-forget; never throws into the request path.
 */
import { listStaff } from '../access-store.js';
import { getCustomerIdByMobile, getDevices } from '../customer-store.js';
import { sendExpoPush } from './push.js';
import { formatINR } from './money.js';

const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

/** Every push token belonging to a signed-in admin / super-admin, de-duplicated. */
export function adminPushTokens() {
  const tokens = new Set();
  for (const s of listStaff()) {
    if (!ADMIN_ROLES.has(s.role)) continue;
    const cid = getCustomerIdByMobile(s.mobile);
    if (!cid) continue;
    for (const t of getDevices(cid)) tokens.add(t);
  }
  return [...tokens];
}

/** Low-level fan-out to admins. Safe no-op when no admin has the app installed. */
export function notifyAdmins({ title, body, data }) {
  const tokens = adminPushTokens();
  if (!tokens.length) return;
  sendExpoPush(tokens, { title, body, data: data || {} });
}

/**
 * A procurement line's paid price broke the cost buffer and needs an admin decision. Push the exact
 * numbers the operator asked for: how far over the buffer it went, and the jump from the estimated
 * cost to the price actually paid. Only fires for a record the server marked NEEDS_APPROVAL.
 *
 * @param {object} record  the decided record from submitProcurementCost
 * @param {string} name    product name for the line
 */
export function notifyBufferExceeded(record, name) {
  if (!record || record.status !== 'NEEDS_APPROVAL') return;
  const v = record.variancePct;
  const buffer = Number(record.bufferPctAtSubmit || 0);
  const exceeded = v != null && Math.abs(v) > buffer;
  const dir = v == null ? 'off' : v >= 0 ? 'over' : 'under';
  const pct = v == null ? '?' : Math.abs(v).toFixed(1);
  const from = formatINR(record.estCostPaise);
  const to = formatINR(record.actualCostPaise);
  notifyAdmins({
    title: exceeded ? 'Cost over buffer — approval needed' : 'Cost needs your approval',
    // "this buffer value has been exceeded up to X% from cost A to cost B", plus what to do. When the
    // buy is inside the buffer (auto-approve is off) we say so instead of claiming it broke the buffer.
    body: exceeded
      ? `${name}: buffer exceeded ${pct}% ${dir} the ±${buffer}% limit — ${from} → ${to}. Accept or reject.`
      : `${name}: ${from} → ${to} (${pct}% ${dir}). Accept or reject.`,
    data: {
      kind: 'PROCUREMENT_BUFFER',
      productId: record.productId,
      dateKey: record.dateKey,
      variancePct: v,
      estCostPaise: record.estCostPaise,
      actualCostPaise: record.actualCostPaise,
      bufferPct: record.bufferPctAtSubmit,
    },
  });
}
