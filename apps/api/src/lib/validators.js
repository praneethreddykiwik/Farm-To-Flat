/**
 * Shared field rules for request bodies — the server's copy of the app's validators, so a crafted
 * request can never store what the UI would refuse. Import these into route zod schemas.
 */
import { z } from 'zod';

const REPEATED = /^(\d)\1{9}$/;

/** A real, dialable Indian mobile: 10 digits, starts 6–9, not a single repeated digit. */
export const mobile = z
  .string()
  .transform((s) => {
    let d = String(s).replace(/\D/g, '');
    if (d.length > 10 && d.startsWith('91')) d = d.slice(2); // country code
    if (d.length > 10 && d.startsWith('0')) d = d.replace(/^0+/, ''); // trunk prefix
    return d;
  })
  .refine((d) => /^[6-9]\d{9}$/.test(d) && !REPEATED.test(d), {
    message: 'Enter a valid 10-digit Indian mobile number.',
  });

export const personName = z
  .string()
  .trim()
  .min(2, 'Name is too short')
  .max(40, 'Name is too long')
  .regex(/^[\p{L}\s.'-]+$/u, 'Name has invalid characters');

export const email = z.string().trim().email('Invalid email').max(120);

export const flat = z
  .string()
  .trim()
  .min(1, 'Flat number required')
  .max(12, 'Flat number too long')
  // Separators ("-", "/") are INTERNAL only (B-12, 3/4) — a leading/trailing one is rejected, so a
  // negative like "-44" can never be stored.
  .regex(/^[A-Za-z0-9]+([/-][A-Za-z0-9]+)*$/, 'Enter a valid flat number')
  // A purely numeric flat must be > 0 — rejects "0" / "00".
  .refine((v) => !/^\d+$/.test(v) || Number(v) > 0, 'Flat number must be greater than 0');

// Optional; when given it must be a POSITIVE number — empty is fine, but "0" and negatives are rejected.
export const floor = z
  .string()
  .trim()
  .max(3)
  .regex(/^([1-9]\d*)?$/, 'Floor must be a positive number');

export const shortText = (max = 80) => z.string().trim().max(max);
