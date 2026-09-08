/**
 * Farm-to-Flat API — skeleton. Owner: Adnan (money + auth + order transaction), Tharun (catalog,
 * cart, windows, admin endpoints). Base path /api/v1. The frozen contract is docs/api-contract.md;
 * a working reference of every route lives in apps/customer/src/api/mock/server.js.
 *
 * This file boots an Express app with health, security headers, structured logging and the error
 * shape the app expects. Add real routers under src/routes and mount them below. Do NOT put any
 * business logic here.
 */
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

const app = express();
app.use(helmet());
app.use(express.json());
app.use(pinoHttp());

// Liveness probe — deploy target smoke-tests this.
app.get('/health', (_req, res) => res.json({ ok: true, service: 'f2f-api' }));

/**
 * Boundary validation. Every route wraps its input in a Zod schema and calls this — parse, never
 * cast. A route registered without one should be considered a bug.
 * @param {import('zod').ZodTypeAny} schema
 */
export function validate(schema) {
  /** @type {import('express').RequestHandler} */
  return (req, res, next) => {
    const r = schema.safeParse(req.body);
    if (!r.success) {
      return res.status(422).json({
        error: { code: 'VALIDATION_FAILED', message: 'Invalid request', details: r.error.issues },
      });
    }
    req.body = r.data;
    next();
  };
}

// ── mount real routers here as they are built ──────────────────────────────
// import { authRouter } from './routes/auth.js';        // Adnan
// import { catalogRouter } from './routes/catalog.js';  // Tharun
// app.use('/api/v1/auth', authRouter);
// app.use('/api/v1/catalog', catalogRouter);

// Anything under /api/v1 that isn't built yet returns the contract's error shape, not a stack trace.
app.use('/api/v1', (_req, res) =>
  res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Route not built yet' } }),
);

// Global error handler — never leak a stack trace or SQL to the client.
/** @type {import('express').ErrorRequestHandler} */
app.use((err, req, res, _next) => {
  req.log?.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
});

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`f2f-api listening on http://${HOST}:${PORT}`);
});

export { app };
