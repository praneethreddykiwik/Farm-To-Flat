/**
 * Thin client to the platform API's operator + access endpoints, for the STAFF experience (super
 * admin / admin / procurement / fulfilment). The customer flows stay on the in-app mock; only the
 * staff screens talk to the real API (on the simulator localhost:4000 resolves to the host). When
 * the app is pointed at a deployed API, this uses env.apiUrl automatically.
 */
import { env } from './env';
import { store } from '../store';

const V1 = `${env.apiUrl}/api/v1`;
const ADMIN = `${V1}/admin`;

async function j(url, opts = {}) {
  // Send the signed-in staff member's session so the server authorises them by role (no shared
  // secret embedded in the app). The admin endpoints accept a valid staff Bearer token.
  const token = store.getState()?.auth?.accessToken;
  const headers = { ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(url, { ...opts, headers });
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
  /** Procurement submits the price actually paid for a line; server auto-approves or flags it. */
  submitProcurementCost: (productId, actualCostPaise, date) =>
    j(`${ADMIN}/procurement/cost`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, actualCostPaise, ...(date ? { date } : {}) }),
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
