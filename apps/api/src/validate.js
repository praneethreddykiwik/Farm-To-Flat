/**
 * Boundary validation. Every route parses its input through Zod — parse, never cast. A route
 * without a schema is a bug. Validation failures return 422 with the contract error shape.
 */

/**
 * Validate `req.body` against a Zod schema; on success replaces req.body with the parsed value.
 * @param {import('zod').ZodTypeAny} schema
 * @returns {import('express').RequestHandler}
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const r = schema.safeParse(req.body);
    if (!r.success) {
      return res.status(422).json({
        error: { code: 'VALIDATION', message: 'Invalid request.', details: r.error.issues },
      });
    }
    req.body = r.data;
    next();
  };
}

/**
 * Validate `req.query` against a Zod schema; parsed value is placed on `req.validatedQuery`
 * (Express 5 makes req.query read-only).
 * @param {import('zod').ZodTypeAny} schema
 * @returns {import('express').RequestHandler}
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    const r = schema.safeParse(req.query);
    if (!r.success) {
      return res.status(422).json({
        error: { code: 'VALIDATION', message: 'Invalid query.', details: r.error.issues },
      });
    }
    // @ts-expect-error augmenting the request
    req.validatedQuery = r.data;
    next();
  };
}
