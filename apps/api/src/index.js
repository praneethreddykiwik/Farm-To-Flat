/**
 * Farm-to-Flat API. Base path /api/v1. The frozen contract is docs/api-contract.md; a working
 * reference of the customer routes lives in apps/customer/src/api/mock/server.js.
 *
 * Owner: Tharun (catalog, cart, windows, admin) + Adnan (auth, wallet, order transaction, payments).
 * THIS build implements Tharun's platform surface — public catalog/communities/windows and the full
 * admin panel API — over an in-memory store (src/store.js) seeded from src/data/seed.js. Auth,
 * wallet, and the money transaction are stubbed at the boundary and land with Adnan's service +
 * the Prisma/Postgres swap (see README).
 */
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { ApiError } from './http.js';
import { catalogRouter } from './routes/catalog.js';
import { communitiesRouter, windowsRouter } from './routes/communities.js';
import { adminAuth } from './routes/admin/auth.js';
import { adminProductsRouter } from './routes/admin/products.js';
import { adminCommunitiesRouter } from './routes/admin/communities.js';
import { adminOrdersRouter } from './routes/admin/orders.js';
import { adminMetricsRouter } from './routes/admin/metrics.js';
import { adminAnalyticsRouter } from './routes/admin/analytics.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors()); // dev: allow the Vite panel on :5173. Lock to the admin origin in production.
app.use(express.json());
if (process.env.NODE_ENV !== 'test') app.use(pinoHttp());

app.get('/health', (_req, res) => res.json({ ok: true, service: 'f2f-api', ts: Date.now() }));

// ── public (frozen contract) ────────────────────────────────────────────────
const v1 = '/api/v1';
app.use(`${v1}/catalog`, catalogRouter);
app.use(`${v1}/communities`, communitiesRouter);
app.use(`${v1}/delivery-windows`, windowsRouter);

// ── admin (operator panel) ────────────────────────────────────────────────
const admin = express.Router();
admin.use(adminAuth);
admin.use(adminProductsRouter);
admin.use(adminCommunitiesRouter);
admin.use(adminOrdersRouter);
admin.use(adminMetricsRouter);
admin.use(adminAnalyticsRouter);
app.use(`${v1}/admin`, admin);

// Anything else under /api/v1 (auth, cart, orders, wallet, payments) is Adnan's / a later phase.
app.use(v1, (req, res) =>
  res.status(501).json({
    error: { code: 'NOT_IMPLEMENTED', message: `No route for ${req.method} ${req.path}` },
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
  req.log?.error?.(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
});

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`f2f-api listening on http://${HOST}:${PORT}  (in-memory store)`);
  });
}

export { app };
