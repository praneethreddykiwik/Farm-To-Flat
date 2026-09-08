/**
 * HTTP helpers. Every error the client sees is `{ error: { code, message, details? } }` — the
 * frozen contract shape. Never leak a stack trace, a SQL string, or an internal field.
 */

/** An error the router is allowed to surface to the client, with an HTTP status + contract code. */
export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   * @param {object} [details]
   */
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const fail = (status, code, message, details) =>
  new ApiError(status, code, message, details);

/** Wrap an async route so a thrown ApiError (or anything) reaches the error handler. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/** Send the contract error envelope. */
export function sendError(res, status, code, message, details) {
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}
