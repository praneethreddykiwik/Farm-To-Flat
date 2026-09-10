/**
 * One place for every field rule the app enforces, so login, address and profile all agree.
 * Each `check*` returns an error string (or null when ok); each `clean*` sanitises keystrokes
 * so the field can only ever hold a legal value. Mirror of the server's apps/api/src/lib/validators.js.
 */

// ── Indian mobile ─────────────────────────────────────────────────────────────
// A real, dialable Indian mobile: exactly 10 digits, starts 6–9 (TRAI series), and not a single
// repeated digit (6666666666 etc. are reserved/never issued). +91 / 0 prefixes are stripped first.
const REPEATED = /^(\d)\1{9}$/;

/** Keep only what a mobile field may contain: digits, max 10, dropping a leading 91/0. */
export function cleanMobile(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
  if (d.length > 10 && d.startsWith('0')) d = d.replace(/^0+/, '');
  return d.slice(0, 10);
}

export function checkMobile(raw) {
  const d = cleanMobile(raw);
  if (d.length === 0) return 'Enter your mobile number';
  if (d.length < 10) return 'Enter all 10 digits';
  if (!/^[6-9]/.test(d)) return 'Indian numbers start with 6, 7, 8 or 9';
  if (REPEATED.test(d)) return 'Enter a real mobile number';
  return null;
}

export const isMobileValid = (raw) => checkMobile(raw) === null;

// ── OTP ───────────────────────────────────────────────────────────────────────
export const cleanOtp = (raw, len = 6) =>
  String(raw || '')
    .replace(/\D/g, '')
    .slice(0, len);

// ── Person name ───────────────────────────────────────────────────────────────
// Letters, spaces and the few marks real names use. No digits, no symbols, no emoji.
export function cleanName(raw, max = 40) {
  return String(raw || '')
    .replace(/[^\p{L}\s.'-]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, max);
}

export function checkName(raw) {
  const v = String(raw || '').trim();
  if (v.length < 2) return 'Enter a name (at least 2 letters)';
  if (v.length > 40) return 'That name is too long';
  if (!/\p{L}/u.test(v)) return 'Enter a valid name';
  return null;
}

// ── Email (optional field) ────────────────────────────────────────────────────
export function checkEmail(raw) {
  const v = String(raw || '').trim();
  if (!v) return null; // optional
  if (v.length > 120) return 'That email is too long';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Check that email address';
  return null;
}

// ── Flat / house number ───────────────────────────────────────────────────────
// Alphanumeric plus the separators flats use (1204, B-12, 3/4). No spaces run-on, max 12.
export function cleanFlat(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9/-]/g, '')
    .slice(0, 12);
}
export function checkFlat(raw) {
  const v = cleanFlat(raw);
  if (!v) return 'Enter your flat number';
  return null;
}

// ── Floor (numeric, allows ground = 0, basements not modelled) ─────────────────
export const cleanFloor = (raw) =>
  String(raw || '')
    .replace(/\D/g, '')
    .slice(0, 3);

// ── Free text (landmark, notes) ───────────────────────────────────────────────
export const cleanText = (raw, max = 80) =>
  String(raw || '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, max);
