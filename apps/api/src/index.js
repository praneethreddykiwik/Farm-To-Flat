/**
 * Farm-to-Flat API. Base path /api/v1. The frozen contract is docs/api-contract.md; a working
 * reference lives in apps/customer/src/api/mock/server.js.
 *
 * This build implements the FULL customer contract (auth, profile, addresses, catalog, cart,
 * windows, the order transaction, wallet, payments, devices, AI passthrough) over an in-memory
 * store, PLUS the operator/admin surface (Tharun). It is a drop-in for the app's mock: point the
 * app at it with EXPO_PUBLIC_USE_MOCKS=0 and EXPO_PUBLIC_API_URL. Prisma/Postgres + Adnan's real
 * auth/payments swap in behind store.js / customer-store.js without route changes.
 */
import './load-env.js'; // load apps/api/.env before anything reads process.env
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { ApiError } from './http.js';
import { requireAuth } from './routes/require-auth.js';
import { disablePersistence, loadAll, loadTransactional, persistEnabled } from './persistence.js';
import { hydrate, hydrateOrders, enableOrderPersistence } from './store.js';
import { IS_PROD } from './lib/env.js';
import { hydrateStaff } from './access-store.js';
import { hydrateCustomerData } from './customer-store.js';

// public
import { authRouter } from './routes/auth.js';
import { catalogRouter } from './routes/catalog.js';
import { communitiesRouter, windowsRouter } from './routes/communities.js';
import { couponsRouter } from './routes/coupons.js';
// authenticated (customer contract)
import { meRouter, addressesRouter } from './routes/me.js';
import { cartRouter } from './routes/cart.js';
import { customerOrdersRouter } from './routes/customer-orders.js';
import { walletRouter, paymentsRouter } from './routes/wallet.js';
import { devicesRouter } from './routes/devices.js';
import { aiRouter } from './routes/ai.js';
// admin (operator)
import { adminAuth, adminAuthorize } from './routes/admin/auth.js';
import { adminProductsRouter } from './routes/admin/products.js';
import { adminCommunitiesRouter } from './routes/admin/communities.js';
import { adminOrdersRouter } from './routes/admin/orders.js';
import { adminMetricsRouter } from './routes/admin/metrics.js';
import { adminAnalyticsRouter } from './routes/admin/analytics.js';
import { adminProcurementRouter } from './routes/admin/procurement.js';
import { adminAccessRouter } from './routes/admin/access.js';
import { adminCouponsRouter } from './routes/admin/coupons.js';
import { supportRouter, adminSupportRouter } from './routes/support.js';
import { accessRouter } from './routes/access.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
// CORS: in production, lock to an allowlist — set CORS_ORIGIN to a comma-separated list of the
// admin/site origins (e.g. "https://admin.farmtoflat.in"). When unset (local dev) it reflects any
// origin so the local admin panel and tools work without configuration.
const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
// Fail CLOSED in production: if CORS_ORIGIN is missing we deny cross-origin rather than reflecting any
// origin (which would let any site call the API with credentials). Reflect-any stays for local dev only.
if (IS_PROD && !corsOrigins.length) {
  console.error('[cors] CORS_ORIGIN is not set in production — denying all cross-origin requests.');
}
app.use(
  cors(
    corsOrigins.length
      ? { origin: corsOrigins, credentials: true }
      : IS_PROD
        ? { origin: false } // production + no allowlist → deny cross-origin
        : {}, // dev → reflect any origin
  ),
);
app.use(express.json({ limit: '8mb' })); // headroom for base64 product-image uploads
// Request logging. Credentials are REDACTED: pino-http logs every request header by default, so
// customer Bearer tokens and the admin token were being written into the host's log retention.
if (process.env.NODE_ENV !== 'test')
  app.use(
    pinoHttp({
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers["x-admin-token"]',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
        ],
        censor: '[redacted]',
      },
    }),
  );

app.get('/health', (_req, res) => res.json({ ok: true, service: 'f2f-api', ts: Date.now() }));

const v1 = '/api/v1';

// ── public ──────────────────────────────────────────────────────────────────
app.use(`${v1}/auth`, authRouter);
app.use(`${v1}/catalog`, catalogRouter);
app.use(`${v1}/communities`, communitiesRouter);
app.use(`${v1}/delivery-windows`, windowsRouter);
app.use(`${v1}/coupons`, couponsRouter);
app.use(`${v1}/support`, supportRouter);
app.use(`${v1}/access`, requireAuth, accessRouter); // authenticated: resolves the caller's OWN number only

// ── authenticated customer contract ───────────────────────────────────────────
app.use(`${v1}/me`, requireAuth, meRouter);
app.use(`${v1}/addresses`, requireAuth, addressesRouter);
app.use(`${v1}/cart`, requireAuth, cartRouter);
app.use(`${v1}/orders`, requireAuth, customerOrdersRouter);
app.use(`${v1}/wallet`, requireAuth, walletRouter);
app.use(`${v1}/payments`, requireAuth, paymentsRouter);
app.use(`${v1}/devices`, requireAuth, devicesRouter);
app.use(`${v1}/ai`, requireAuth, aiRouter);

// ── admin (operator panel) ─────────────────────────────────────────────────
const admin = express.Router();
admin.use(adminAuth);
admin.use(adminAuthorize); // per-route role check — any staff is NOT full admin
admin.use(adminProductsRouter);
admin.use(adminCommunitiesRouter);
admin.use(adminOrdersRouter);
admin.use(adminMetricsRouter);
admin.use(adminAnalyticsRouter);
admin.use(adminProcurementRouter);
admin.use(adminAccessRouter);
admin.use(adminCouponsRouter);
admin.use(adminSupportRouter);
app.use(`${v1}/admin`, admin);

// Unknown route → 404 (was 501 NOT_IMPLEMENTED, which reads as a server fault to clients/monitors).
app.use(v1, (req, res) =>
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
  }),
);

// ── error handler — contract shape, never a stack trace ──────────────────────
/** @type {import('express').ErrorRequestHandler} */
app.use((err, req, res, _next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }
  // Body-parser failures are the caller's fault, not ours: say so with the right status instead of
  // a 500 (a 9 MB upload and `{bad json` both used to come back as INTERNAL).
  if (err?.type === 'entity.too.large')
    return res
      .status(413)
      .json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' } });
  if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400))
    return res
      .status(400)
      .json({ error: { code: 'BAD_JSON', message: 'Request body is not valid JSON.' } });
  req.log?.error?.(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
});

// Process-level safety net. Node 22 terminates on an unhandled rejection; without these, a failed
// fire-and-forget push (Expo unreachable) or a lost DB connection outside a request took the whole
// API down and dropped every in-memory session. Log loudly, keep serving; exit only on a genuinely
// unknown state (uncaught exception), where the host restarts us.
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[fatal-avoided] unhandled rejection:', reason?.stack || reason);
});
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[fatal] uncaught exception, exiting for a clean restart:', err?.stack || err);
  setTimeout(() => process.exit(1), 100).unref();
});

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';

/** Load master data from Supabase into the in-memory cache before serving (source of truth). */
async function boot() {
  let source = 'in-memory seed';
  if (persistEnabled) {
    try {
      const data = await loadAll(); // master data first (communities needed to enrich addresses)
      hydrate(data);
      hydrateStaff(data.staff);
      const tx = await loadTransactional();
      hydrateCustomerData(tx);
      hydrateOrders(tx.orders);
      enableOrderPersistence(); // real orders now write through (import-time seed did not)
      source = `Supabase (${data.products.length} products, ${tx.customers.length} customers, ${tx.orders.length} orders)`;
    } catch (e) {
      // Fall back to seed so the API still boots if the DB is unreachable — but NEVER let this
      // seed-backed process write through: the first admin edit would upsert demo rows over live
      // data and new logins would create duplicate customers. Read-only until a healthy restart.
      // eslint-disable-next-line no-console
      console.error('[boot] Supabase load failed — using in-memory seed:', e?.message || e);
      disablePersistence('hydration failed; refusing to write seed data over the live database');
    }
  }
  app.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`f2f-api listening on http://${HOST}:${PORT}  (data: ${source})`);
  });
}

if (process.env.NODE_ENV !== 'test') boot();

export { app };
