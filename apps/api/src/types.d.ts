// Shared shapes for the API's JSDoc. Global on purpose: this file has no imports or exports, so
// the names below can be used in any `@type` / `@returns` without importing them.

/** How a store function reports a refusal. The route turns it into an HTTP error with fail(). */
type StoreError = { status: number; code: string; message: string; details?: any };

/**
 * What a store function returns: either its success fields, or `{ error }` — never both. Routes
 * branch on `r.error`, so each side declares the other's fields as absent.
 */
type StoreResult<T> =
  | (T & { error?: undefined })
  | ({ error: StoreError } & { [K in keyof T]?: undefined });

/**
 * Express middleware. A stand-in while `@types/express` is not installed; once it is, use
 * `import('express').RequestHandler` instead and declare `validatedQuery` (set by validateQuery)
 * on its Request type.
 */
type ExpressHandler = (req: any, res: any, next: (err?: any) => void) => any;

/**
 * Errors here carry the HTTP status and contract code they should be answered with — ApiError in
 * http.js sets both, and so do the plain Errors thrown from lib/ and by the body parser.
 */
interface Error {
  status?: number;
  code?: string;
}
