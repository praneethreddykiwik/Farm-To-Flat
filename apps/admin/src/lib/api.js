/**
 * API client. Talks to the platform API at /api/v1 — in dev the Vite server proxies /api to
 * http://localhost:4000 (see vite.config.js), so there is no CORS and no base URL to configure.
 * Every non-2xx response carries the contract envelope { error: { code, message } }, which we
 * surface as a thrown ApiError so screens can show the operator a real message.
 */
// In dev the Vite proxy handles /api → localhost:4000, so no base URL is needed. In production set
// VITE_API_URL (e.g. https://api.farmtoflat.in) so the built site calls the live API directly.
const BASE = `${import.meta.env.VITE_API_URL || ''}/api/v1`;
// When the hosted API sets ADMIN_TOKEN, the operator panel must send it. Set VITE_ADMIN_TOKEN to the
// same value at build time. Left blank in local dev (the API is open there).
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || '';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message || 'Request failed');
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(method, path, body) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (ADMIN_TOKEN) headers['x-admin-token'] = ADMIN_TOKEN;
  const res = await fetch(BASE + path, {
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const e = isJson && data?.error ? data.error : { code: 'HTTP', message: `HTTP ${res.status}` };
    throw new ApiError(res.status, e.code, e.message, e.details);
  }
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b),
  patch: (p, b) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
  /** Build a full URL for a browser download (CSV export). */
  url: (p) => BASE + p,
};
