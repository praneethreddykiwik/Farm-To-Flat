/**
 * Thin client to the platform API's operator + access endpoints, for the STAFF experience (super
 * admin / admin / procurement / fulfilment). The customer flows stay on the in-app mock; only the
 * staff screens talk to the real API (on the simulator localhost:4000 resolves to the host). When
 * the app is pointed at a deployed API, this uses env.apiUrl automatically.
 */
import { env } from './env';

const V1 = `${env.apiUrl}/api/v1`;
const ADMIN = `${V1}/admin`;

async function j(url, opts) {
  const r = await fetch(url, opts);
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
