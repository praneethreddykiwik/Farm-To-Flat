/**
 * Prefixed ids. In the real (Prisma) build these become uuid PKs; here we use a short
 * url-safe token from node:crypto so the API runs with zero extra dependencies.
 */
import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** e.g. shortId(8) -> "a1B2c3D4" */
export function shortId(len = 10) {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Prefixed id, e.g. id('ord') -> "ord_a1B2c3D4e5" */
export const id = (prefix, len = 10) => `${prefix}_${shortId(len)}`;
