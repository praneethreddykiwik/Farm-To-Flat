/**
 * Who is allowed to drive the operator panel.
 *
 * The admin token used to be baked into the bundle at build time (`VITE_ADMIN_TOKEN`). A Vite
 * `VITE_*` variable is inlined as a literal, so that token shipped inside the public JavaScript and
 * the whole dashboard — revenue, orders, customers — opened for anyone who knew the URL. Nothing
 * about it was secret.
 *
 * Now the operator pastes the token once and the browser keeps it in localStorage. The bundle holds
 * no secret, an anonymous visitor gets a sign-in screen, and a token that stops working (rotated on
 * Render) signs the panel out instead of failing every request silently.
 *
 * This is device-local, not a user account: everyone with the token is the same "admin". Real
 * per-operator logins belong with the staff records the API already has.
 */
const KEY = 'f2f.admin.token';

/** Listeners so the shell can re-render the moment we sign in or out. */
const subs = new Set();
const emit = () => subs.forEach((fn) => fn());

export function getToken() {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    // Private mode, or storage blocked. Treat it as signed out rather than throwing on every render.
    return '';
  }
}

export function setToken(token) {
  try {
    localStorage.setItem(KEY, String(token || '').trim());
  } catch {
    /* nothing we can do; the session just won't survive a reload */
  }
  emit();
}

export function clearToken() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  emit();
}

/** Subscribe to sign-in/sign-out. Returns an unsubscribe. */
export function onAuthChange(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
