/**
 * Thin client to the platform API's operator + access endpoints, for the STAFF experience (super
 * admin / admin / procurement / fulfilment). The customer flows stay on the in-app mock; only the
 * staff screens talk to the real API. Authorises with the signed-in staff member's own Bearer
 * session (no shared secret in the app), and refreshes it once on a 401 so the ops console keeps
 * working after the API restarts (e.g. a free-tier host waking from sleep drops in-memory sessions).
 */
import { env } from './env';
import { store } from '../store';
import { accessRefreshed } from '../features/auth/authSlice';
import { readRefreshToken, saveRefreshToken } from '../features/auth/secure';

const V1 = `${env.apiUrl}/api/v1`;
const ADMIN = `${V1}/admin`;

// One in-flight refresh shared by concurrent calls.
let refreshing = null;
async function refreshSession() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const refreshToken = await readRefreshToken();
    if (!refreshToken) return null;
    const r = await fetch(`${V1}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    if (data?.refreshToken) await saveRefreshToken(data.refreshToken);
    if (data?.accessToken) store.dispatch(accessRefreshed(data.accessToken));
    return data?.accessToken || null;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
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
  resolveRole: (mobile) => j(`${V1}/access/resolve?mobile=${encodeURIComponent(mobile)}`),
  metrics: () => j(`${ADMIN}/metrics`),
  procurement: (qs = '') => j(`${ADMIN}/procurement${qs}`),
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
  setStatus: (id, status) =>
    j(`${ADMIN}/orders/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }),
};
