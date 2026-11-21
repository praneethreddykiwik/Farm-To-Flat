/**
 * Thin client to the platform API's operator + access endpoints, for the STAFF experience (super
 * admin / admin / procurement / fulfilment). The customer flows stay on the in-app mock; only the
 * staff screens talk to the real API. Authorises with the signed-in staff member's own Bearer
 * session (no shared secret in the app), and refreshes it once on a 401 so the ops console keeps
 * working after the API restarts (e.g. a free-tier host waking from sleep drops in-memory sessions).
 */
import { env } from './env';
import { store } from '../store';
import { refreshSessionShared } from '../api/baseQuery';

const V1 = `${env.apiUrl}/api/v1`;
const ADMIN = `${V1}/admin`;

// The app's ONE shared refresh (review #40): a second refresher here used to spend the single-use
// refresh token at the same moment as the customer screens' own, and one of them lost and signed out.
async function refreshSession() {
  const out = await refreshSessionShared({ dispatch: store.dispatch });
  return out?.accessToken || null;
}

async function j(url, opts = {}, retried = false) {
  const token = store.getState()?.auth?.accessToken;
  const headers = { ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  // A cold host (free-tier waking from sleep) can leave a request hanging forever, stranding staff
  // screens on 'Loading…'. Abort after ~22s so the request rejects and the screens' retry UI shows.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22000);
  let r;
  try {
    r = await fetch(url, { ...opts, headers, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (r.status === 401 && !retried && (await refreshSession())) {
    return j(url, opts, true); // retry once with the refreshed session
  }
  const isJson = (r.headers.get('content-type') || '').includes('application/json');
  const body = isJson ? await r.json() : await r.text();
  if (!r.ok) throw new Error((isJson && body?.error?.message) || `HTTP ${r.status}`);
  return body;
}

export const adminApi = {
  /** the access seam — which role/sections/AI a phone number has */
  // The server resolves the caller's OWN number from the Bearer session and ignores any ?mobile=
  // param, so we don't send it — keeping the customer's phone number out of the request URL (and
  // therefore out of server access logs).
  resolveRole: () => j(`${V1}/access/resolve`),
  metrics: () => j(`${ADMIN}/metrics`),
  procurement: (qs = '') => j(`${ADMIN}/procurement${qs}`),
  /** Every customer note on the live orders — what the buyer and the delivery team act on. */
  orderNotes: (qs = '') => j(`${ADMIN}/orders/notes${qs}`),
  procurementCsvUrl: (qs = '') => `${ADMIN}/procurement/export.csv${qs}`,
  procurementXlsxUrl: (qs = '') => `${ADMIN}/procurement/export.xlsx${qs}`,
  /** Fetch the procurement CSV as text WITH the Bearer auth header (j() sends it and returns text for non-JSON responses). */
  procurementCsv: (qs = '') => j(`${ADMIN}/procurement/export.csv${qs}`),
  /** Procurement submits the price actually paid for a line; server auto-approves or flags it. */
  submitProcurementCost: (productId, actualCostPaise, date) =>
    j(`${ADMIN}/procurement/cost`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, actualCostPaise, ...(date ? { date } : {}) }),
    }),
  /** Cost-buffer lines waiting on an admin accept/reject (over/under the buffer). */
  procurementApprovals: (qs = '') => j(`${ADMIN}/procurement/approvals${qs}`),
  /** Admin accepts or rejects a flagged cost line. decision: 'APPROVE' | 'REJECT'. */
  procurementApprove: (productId, decision, date) =>
    j(`${ADMIN}/procurement/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, decision, ...(date ? { date } : {}) }),
    }),
  /** Read / change the cost-buffer settings (± tolerance and auto-approve). */
  procurementSettings: () => j(`${ADMIN}/procurement/settings`),
  updateProcurementSettings: (patch) =>
    j(`${ADMIN}/procurement/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  orders: (qs = '') => j(`${ADMIN}/orders${qs}`),
  order: (id) => j(`${ADMIN}/orders/${id}`),
  advance: (orderIds, status) =>
    j(`${ADMIN}/orders/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderIds, status }),
    }),
  /**
   * Complete a delivery at the door: the code the customer read out, and the cash taken. Separate
   * from setStatus because DELIVERED is refused through the plain status route while either is
   * outstanding — that guard is what makes the proof mean anything.
   */
  deliver: (id, body) =>
    j(`${ADMIN}/orders/${id}/deliver`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  /**
   * The complaints queue — every problem reported about a delivery, newest first. `status=OPEN` is
   * the only one anyone is waiting on, which is what the staff screen asks for by default.
   */
  issues: (qs = '') => j(`${ADMIN}/issues${qs}`),
  /** Answer one. RESOLVED = put right, DECLINED = looked at and not upheld. Never rewrites it. */
  answerIssue: (orderId, issueId, body) =>
    j(`${ADMIN}/orders/${orderId}/issues/${issueId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  setStatus: (id, status) =>
    j(`${ADMIN}/orders/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }),
};
