/**
 * While the database is gone, serve NOTHING rather than a different shop.
 *
 * Boot hydration failing disables persistence for the life of the process, and the API used to
 * carry on answering 200 out of the in-memory SEED: the same product names with different pictures
 * — 51 of the 54 live products differ — a different price on one, and three real products missing
 * entirely. Customers saw a catalogue that was not ours and reported that the images had changed
 * on their own. Nothing in the system said anything was wrong; /health alone knew.
 *
 * The far worse half was writes. Nothing stopped a customer adding to a basket, checking out and
 * PAYING, through the live Razorpay account, for an order that existed only in this process's
 * memory. The next deploy — or the next spin-down on Render's free tier, which happens by itself —
 * would take that order with it. Real money in, no order, no record it ever existed.
 *
 * So the whole of /api/v1 answers 503 with a code the app can turn into a human sentence. Being
 * briefly and visibly down is a far smaller failure than quietly selling from a catalogue we do
 * not stock and losing the orders people paid for.
 *
 * /health stays open: Render's probe reads it, and it is how an operator finds out what is wrong.
 */
export const DEGRADED_MESSAGE =
  'We are briefly unavailable. Nothing in your basket has been lost — please try again in a few minutes.';

/**
 * @param {() => boolean} configured   whether a database is configured at all (false in dev/tests)
 * @param {() => boolean} healthy      whether persistence is currently working
 */
export function degradedGuard(configured, healthy) {
  return (req, res, next) => {
    if (!configured() || healthy()) return next();
    if (req.path === '/health') return next();
    return res.status(503).json({
      error: { code: 'SERVICE_DEGRADED', message: DEGRADED_MESSAGE },
    });
  };
}
