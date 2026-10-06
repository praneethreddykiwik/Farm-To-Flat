/**
 * Who is allowed to drive the operator panel.
 *
 * The admin token used to be baked into the bundle at build time (`VITE_ADMIN_TOKEN`). A Vite
 * `VITE_*` variable is inlined as a literal, so that token shipped inside the public JavaScript and
 * the whole dashboard — revenue, orders, customers — opened for anyone who knew the URL. Nothing
 * about it was secret.
 *
 * There are now TWO ways to hold the panel open, and this module is the one place that knows which:
 *
 *   session — a Google sign-in, verified by the API against Google's own signing keys and then
 *             against the operator allowlist. It identifies a PERSON, carries their role, and
 *             expires on its own after twelve hours.
 *   token   — the shared operator token, typed in. It identifies nobody: everyone who has it is the
 *             same anonymous "admin". It stays while Google access is rolled out, and it is the way
 *             back in if Google is ever unreachable.
 *
 * Both live in this browser's localStorage and nowhere else. The bundle holds no secret, an
 * anonymous visitor gets the sign-in screen, and a credential the API stops accepting signs the
 * panel out instead of failing every request silently.
 */
const KEY = 'f2f.admin.cred';
const LEGACY_KEY = 'f2f.admin.token';

/** Listeners so the shell can re-render the moment we sign in or out. */
const subs = new Set();
const emit = () => subs.forEach((fn) => fn());

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const cred = JSON.parse(raw);
      if (!cred?.value) return null;
      // A session carries its own deadline. Treat a lapsed one as signed out here rather than
      // letting every request fail with a 401 the operator has to interpret.
      if (cred.kind === 'session' && cred.expiresAt && Date.now() >= cred.expiresAt) {
        localStorage.removeItem(KEY);
        return null;
      }
      return cred;
    }
    // Anyone already signed in with the shared token keeps their session across this change.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const cred = { kind: 'token', value: legacy };
      localStorage.setItem(KEY, JSON.stringify(cred));
      localStorage.removeItem(LEGACY_KEY);
      return cred;
    }
    return null;
  } catch {
    // Private mode, or storage blocked. Treat it as signed out rather than throwing on every render.
    return null;
  }
}

function write(cred) {
  try {
    if (cred) localStorage.setItem(KEY, JSON.stringify(cred));
    else localStorage.removeItem(KEY);
  } catch {
    /* nothing we can do; the session just won't survive a reload */
  }
  emit();
}

/** @returns {{kind:'token'|'session', value:string, operator?:object, expiresAt?:number}|null} */
export const getCredential = () => read();

/** Truthy when signed in — what the shell gates on. */
export const getToken = () => read()?.value || '';

/** The signed-in person, when we know who they are. The shared token identifies nobody. */
export const getOperator = () => read()?.operator || null;

/** The auth header for an API call. Empty when signed out. */
export function authHeader() {
  const cred = read();
  if (!cred) return {};
  return cred.kind === 'session'
    ? { 'x-admin-session': cred.value }
    : { 'x-admin-token': cred.value };
}

/** Sign in with the shared operator token. */
export const setToken = (token) => write({ kind: 'token', value: String(token || '').trim() });

/** Sign in as a person, with the session the API issued after verifying Google. */
export const setSession = (session, operator, expiresAt) =>
  write({ kind: 'session', value: session, operator: operator || null, expiresAt: expiresAt || 0 });

/**
 * Sign out. A Google session is also revoked ON THE SERVER — dropping it from localStorage alone
 * would leave a token that still works for up to twelve hours in anything that copied it. Fire and
 * forget: the local half must happen whether or not the network call does.
 */
export function clearToken() {
  const cred = read();
  if (cred?.kind === 'session') {
    const base = `${import.meta.env.VITE_API_URL || ''}/api/v1`;
    try {
      fetch(`${base}/admin/auth/signout`, {
        method: 'POST',
        headers: { 'x-admin-session': cred.value },
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* offline — the local sign-out below still happens */
    }
  }
  write(null);
}

/** Subscribe to sign-in/sign-out. Returns an unsubscribe. */
export function onAuthChange(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
