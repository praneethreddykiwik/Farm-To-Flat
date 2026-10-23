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
// FIRST, before anything else is imported: Sentry patches http/express at require time, so
// initialising it after those modules load means its auto-instrumentation never attaches.
import { initSentry, flushSentry, reportError, sentryEnabled } from './lib/sentry.js';
import { razorpayMode, webhookEnabled } from './lib/razorpay.js';

initSentry();

import './load-env.js'; // load apps/api/.env before anything reads process.env
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { ApiError } from './http.js';
import { requireAuth } from './routes/require-auth.js';
import {
  disablePersistence,
  enablePersistence,
  isPersistenceEnabled,
  loadAll,
  loadTransactional,
  persistEnabled,
  drainPersistence,
} from './persistence.js';
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
import { razorpayWebhookRouter } from './routes/razorpay-webhook.js';
import { mediaRouter } from './routes/media.js';
import { imgRouter } from './routes/img.js';
import { devicesRouter } from './routes/devices.js';
import { notificationsRouter } from './routes/notifications.js';
import { aiRouter } from './routes/ai.js';
import { mealsRouter } from './routes/meals.js';
// Side-effect import: starts the 10-minute gateway reconciliation pass. The third leg, after the
// client callback and the webhook — the one that notices when neither of those happened.
import './lib/reconcile.js';
// admin (operator)
import { adminAuth, adminAuthorize } from './routes/admin/auth.js';
import { adminProductsRouter } from './routes/admin/products.js';
import { adminCommunitiesRouter } from './routes/admin/communities.js';
import { adminOrdersRouter } from './routes/admin/orders.js';
import { adminMetricsRouter } from './routes/admin/metrics.js';
import { adminAnalyticsRouter } from './routes/admin/analytics.js';
import { adminPaymentsRouter } from './routes/admin/payments.js';
import { adminProcurementRouter } from './routes/admin/procurement.js';
import { adminAccessRouter } from './routes/admin/access.js';
import { adminAuthPublicRouter } from './routes/admin/auth-public.js';
import { adminOtpRouter } from './routes/admin/otp.js';
import { adminCouponsRouter } from './routes/admin/coupons.js';
import { supportRouter, adminSupportRouter } from './routes/support.js';
import { adminChargesRouter } from './routes/admin/charges.js';
import { adminEmailsRouter } from './routes/admin/admin-emails.js';
import { accessRouter } from './routes/access.js';
import { ipOf, rateLimit } from './lib/rate-limit.js';
import { requireCloudflare, originLockEnabled } from './lib/edge.js';
import { degradedGuard, masterDataProblem } from './lib/degraded.js';

const app = express();
app.disable('x-powered-by');
// Render terminates TLS at a proxy, so without this every request reports the proxy's address and
// any per-IP limit would apply to all users at once. One hop.
app.set('trust proxy', 1);
// Before anything else, including the webhook: with Cloudflare in front, a request that reaches
// this process without passing the edge has skipped every WAF, bot and rate-limit rule there, and
// the Render hostname is public. No-op until ORIGIN_SHARED_SECRET is set. See lib/edge.js.
app.use(requireCloudflare);
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
const v1 = '/api/v1';

// The whole of /api/v1 refuses while the database is gone. See lib/degraded.js for why that is
// better than serving the seed catalogue and taking payments for orders we cannot keep.
app.use(
  v1,
  degradedGuard(() => persistEnabled, isPersistenceEnabled),
);

/**
 * API answers are never cacheable by the client, and this is not a micro-optimisation.
 *
 * Express sends an ETag and no Cache-Control. That combination lets a client apply HEURISTIC
 * freshness — reuse a stored response without asking us at all — and Android's HTTP stack does.
 * The consequence was not subtle. While the database was unavailable the API answered out of the
 * seed; phones stored THAT; and they went on showing it after the database came back. Three
 * communities instead of eight, the wrong product photographs, an empty non-veg section — against
 * a server that was by then returning the right answers to anyone who asked it fresh. Clearing the
 * app's data fixed it instantly, which is what proved where the stale copy was living.
 *
 * A catalogue, a basket and an order list are all things the customer has to see as they are now.
 * None of them is worth a millisecond of staleness, let alone a day of it.
 *
 * /media is exempt on purpose: those are immutable token-addressed objects whose whole point is
 * to be cached.
 */
app.use(v1, (req, res, next) => {
  if (!req.path.startsWith('/media') && !req.path.startsWith('/img'))
    res.set('Cache-Control', 'no-store');
  next();
});

// BEFORE express.json, and deliberately so: the Razorpay webhook authenticates by HMAC over the
// exact bytes it sent, and a parsed-then-reserialised body hashes differently. It also sits outside
// requireAuth below — Razorpay holds no bearer token, the signature is the credential.
app.use(`${v1}/webhooks`, razorpayWebhookRouter);
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
          'req.headers["x-admin-session"]',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
        ],
        censor: '[redacted]',
      },
    }),
  );

/**
 * Liveness AND data-source check — the platform's health probe points here.
 *
 * Answering a plain "ok" was how a broken deploy went unnoticed. When boot hydration fails the API
 * deliberately still starts, serving the in-memory DEMO SEED with persistence switched off, so that
 * a database blip does not take the app down entirely. The cost of that choice is that the failure
 * is invisible: the process boots, answers every route, and returns demo products and communities
 * as if they were real. One unmigrated column did exactly this in production and nothing flagged it.
 *
 * So a process that was GIVEN a database and is not using it reports 503. Render then refuses to
 * promote that deploy and keeps the last good one serving, which is the outcome we want: a schema
 * change that outruns its migration fails loudly at the door instead of quietly swapping live data
 * for demo data.
 *
 * A process with no DATABASE_URL at all — local dev, tests — is not degraded. It was never meant to
 * have a database, and calling it unhealthy would just make the signal meaningless.
 */
/**
 * Flipped by the SIGTERM handler. A shutting-down process is not healthy: the load balancer should
 * stop sending it new work immediately, while it finishes what it already accepted.
 */
let shuttingDown = false;
export const markShuttingDown = () => {
  shuttingDown = true;
};

app.get('/health', (_req, res) => {
  const degraded = (persistEnabled && !isPersistenceEnabled()) || shuttingDown;
  res.status(degraded ? 503 : 200).json({
    ok: !degraded,
    ...(shuttingDown ? { shuttingDown: true } : {}),
    service: 'f2f-api',
    // Named rather than boolean so the answer is readable straight from a curl or a dashboard.
    data: !persistEnabled
      ? 'in-memory'
      : degraded
        ? 'in-memory seed (DATABASE UNAVAILABLE)'
        : 'database',
    // WHICH COMMIT IS ACTUALLY SERVING. Render sets RENDER_GIT_COMMIT and RENDER_GIT_BRANCH on
    // every deploy. Without them echoed here there is no way to tell a deployed fix from an
    // undeployed one from the outside — which is exactly how the API sat 56 commits behind `main`
    // for ten days while the fixes were being merged and verified against it.
    // Whether error reporting is actually ON in THIS process. A DSN set in the dashboard but not
    // yet picked up by the running process looks identical from outside, and "we have Sentry" is
    // worth nothing if the process that would report never initialised it.
    sentry: sentryEnabled,
    // Which Razorpay account is actually serving, and whether the webhook can verify. The key ID
    // is public by design (it ships in the app bundle and goes out with every payment intent), so
    // only the MODE is exposed here — but "are we on live keys?" is the single most important
    // operational fact once real money is involved, and it should not require a token to answer.
    payments: { mode: razorpayMode(), webhook: webhookEnabled },
    // Whether the origin is refusing traffic that bypassed Cloudflare. Reported because the whole
    // point of the lock is that it fails invisibly when it is off — everything still works.
    originLock: originLockEnabled(),
    commit: process.env.RENDER_GIT_COMMIT?.slice(0, 8) || 'unknown',
    branch: process.env.RENDER_GIT_BRANCH || 'unknown',
    ts: Date.now(),
  });
});

// ── public ──────────────────────────────────────────────────────────────────
// A ceiling on everything, so one host cannot simply flood the service. Set well above real use:
// behind carrier-grade NAT a single IP can be very many genuine customers, and throttling them to
// protect against a flood would be the worse failure. A blunt instrument, not a usage quota.
app.use(
  v1,
  rateLimit({
    windowMs: 60 * 1000,
    // Tunable without a deploy: ops may need to raise it for a known burst (a campaign, a load
    // test) or lower it under attack.
    max: Number(process.env.RATE_LIMIT_PER_MIN) || 600,
    key: (req) => `all:${ipOf(req)}`,
  }),
);

// Private media, authenticated by the token in the path rather than by a header, because an
// <img> cannot send one. Public by necessity, unguessable by construction. See routes/media.js.
app.use(`${v1}/media`, mediaRouter);
app.use(`${v1}/img`, imgRouter); // public product-image proxy — see routes/img.js (ISP hijacks supabase.co)
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
app.use(`${v1}/notifications`, requireAuth, notificationsRouter);
app.use(`${v1}/ai`, requireAuth, aiRouter);
app.use(`${v1}/meals`, requireAuth, mealsRouter);

// ── admin (operator panel) ─────────────────────────────────────────────────
// Sign-in FIRST, and deliberately outside the authenticated router below: these are the routes you
// call when you do not yet have a credential. Mounted on the more specific path, so Express reaches
// them before /admin's adminAuth ever runs.
app.use(`${v1}/admin/auth`, adminAuthPublicRouter);

const admin = express.Router();
admin.use(adminAuth);
admin.use(adminAuthorize); // per-route role check — any staff is NOT full admin
admin.use(adminProductsRouter);
admin.use(adminCommunitiesRouter);
admin.use(adminOrdersRouter);
admin.use(adminMetricsRouter);
admin.use(adminAnalyticsRouter);
admin.use(adminPaymentsRouter);
admin.use(adminProcurementRouter);
admin.use(adminAccessRouter);
admin.use(adminOtpRouter);
admin.use(adminCouponsRouter);
admin.use(adminSupportRouter);
admin.use(adminChargesRouter);
admin.use(adminEmailsRouter);
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
  // Everything above is an expected outcome with a contract. Reaching here is not: it is a bug we
  // did not know about, which is exactly and only what is worth reporting. Tagged with the route
  // rather than the URL, because a URL carries ids and a route does not.
  reportError(err, { route: `${req.method} ${req.route?.path || req.path}` });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
});

// Process-level safety net. Node 22 terminates on an unhandled rejection; without these, a failed
// fire-and-forget push (Expo unreachable) or a lost DB connection outside a request took the whole
// API down and dropped every in-memory session. Log loudly, keep serving; exit only on a genuinely
// unknown state (uncaught exception), where the host restarts us.
process.on('unhandledRejection', (reason) => {
  reportError(reason, { kind: 'unhandledRejection' });
  // eslint-disable-next-line no-console
  console.error('[fatal-avoided] unhandled rejection:', reason?.stack || reason);
});
process.on('uncaughtException', (err) => {
  reportError(err, { kind: 'uncaughtException' });
  // eslint-disable-next-line no-console
  console.error('[fatal] uncaught exception, exiting for a clean restart:', err?.stack || err);
  // Give the report a moment to leave. This is the one crash you most want to see, and exiting
  // 100ms later would usually lose it.
  flushSentry(1500).finally(() => setTimeout(() => process.exit(1), 100).unref());
});

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';

/** Load master data from Supabase into the in-memory cache before serving (source of truth). */
/** One attempt at filling the in-memory cache from the database. Throws if anything fails. */
async function hydrateOnce() {
  const data = await loadAll(); // master data first (communities needed to enrich addresses)
  // A SUCCESSFUL BUT EMPTY LOAD IS NOT A SUCCESS.
  //
  // loadAll throws when a query fails, so a refused connection is caught. What it cannot tell you
  // is that it reached a database and found nothing — a blank schema, the wrong DATABASE_URL, a
  // restore that has not finished. In that case hydrate() would replace the catalogue with nothing
  // and KEEP the seed categories (it only overwrites a list it is given a non-empty one for), and
  // the service would report itself healthy while serving a shop that is part seed and part void.
  //
  // A live grocery API with no products or no communities is not a state worth serving. Treating
  // it as a failed hydration routes it into the same path as a refused connection: refuse traffic,
  // say so, and keep retrying until the database has something real in it.
  const problem = masterDataProblem(data);
  if (problem) throw new Error(problem);
  hydrate(data);
  hydrateStaff(data.staff);
  const tx = await loadTransactional();
  hydrateCustomerData(tx);
  hydrateOrders(tx.orders);
  enableOrderPersistence(); // real orders now write through (import-time seed did not)
  return `Supabase (${data.products.length} products, ${tx.customers.length} customers, ${tx.orders.length} orders)`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Keep trying to reach the database, in the background, for as long as it takes.
 *
 * One failed attempt used to poison the process for its entire life: persistence was disabled and
 * the API served the SEED catalogue — 3 communities instead of 8, different product photographs,
 * the non-veg items missing entirely — until somebody noticed and redeployed. On a plan where the
 * instance sleeps and wakes by itself, that is not a rare event. Every wake is a fresh boot and a
 * fresh chance for a cold database to refuse the first connection, and a free-tier Postgres is
 * exactly the kind that refuses the first connection and accepts the second.
 *
 * So the instance now heals itself: it retries, and the moment the database answers it rehydrates
 * and switches persistence back on. Nobody has to be watching.
 */
async function retryHydrationForever() {
  let wait = 2000;
  for (;;) {
    await sleep(wait);
    wait = Math.min(wait * 2, 60000);
    try {
      const source = await hydrateOnce();
      enablePersistence(`database reachable again — ${source}`);
      return;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(
        `[boot] rehydration attempt failed, retrying in ${wait / 1000}s:`,
        e?.message || e,
      );
    }
  }
}

async function boot() {
  let source = 'in-memory seed';
  if (persistEnabled) {
    // Three quick attempts before giving up on the fast path. A cold database usually answers on
    // the second; a single attempt is what turned a two-second hiccup into hours of wrong data.
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        source = await hydrateOnce();
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        // eslint-disable-next-line no-console
        console.error(`[boot] hydration attempt ${attempt}/3 failed:`, e?.message || e);
        if (attempt < 3) await sleep(attempt * 1500);
      }
    }
    if (lastErr) {
      // Serve nothing rather than the seed catalogue (see lib/degraded.js), and keep trying in the
      // background so the instance recovers without anyone redeploying it.
      disablePersistence('hydration failed; refusing to write seed data over the live database');
      retryHydrationForever();
    }
  }
  const server = app.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`f2f-api listening on http://${HOST}:${PORT}  (data: ${source})`);
  });

  /**
   * Shut down without dropping anything.
   *
   * Render sends SIGTERM on every deploy and waits a short grace period before SIGKILL. Until now
   * nothing listened, so the process died mid-flight: open requests were cut, and — the part that
   * actually costs money — writes that had been issued but not awaited went with it. Persistence is
   * write-behind (see persistence.js), so "the API said CAPTURED" and "the row reached Postgres"
   * are two different moments, and a deploy landing between them loses a wallet credit.
   *
   * So: stop accepting new connections, let the in-flight ones finish, give the write-behind queue
   * a moment to drain, then exit. Deploys happen many times a day; this is the difference between
   * that being routine and it being a lottery.
   */
  let closing = false;
  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    // eslint-disable-next-line no-console
    console.log(`[shutdown] ${signal} — finishing in-flight requests`);
    // Fail the health check immediately so the load balancer stops sending new work, even while
    // we are still serving what we already accepted.
    markShuttingDown();
    server.close(async () => {
      try {
        await flushSentry(2000);
        await drainPersistence(4000);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[shutdown] drain failed', e?.message || e);
      }
      // eslint-disable-next-line no-console
      console.log('[shutdown] clean');
      process.exit(0);
    });
    // Render's grace period is finite; never hang past it and get SIGKILLed mid-write.
    setTimeout(() => {
      // eslint-disable-next-line no-console
      console.error('[shutdown] grace period expired, exiting anyway');
      process.exit(0);
    }, 12000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (process.env.NODE_ENV !== 'test') boot();

export { app };
