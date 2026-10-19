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
      // A Google session no longer keeps its token here — that lives only in the HttpOnly f2f_admin
      // cookie, which the page's JS cannot read (and cannot leak to an XSS). What we keep is the
      // non-sensitive profile so the shell can render who is signed in and gate on it; the cookie is
      // what actually authenticates each request. A lapsed session is treated as signed out here
      // rather than letting every request 401.
      if (cred.kind === 'session') {
        if (cred.expiresAt && Date.now() >= cred.expiresAt) {
          localStorage.removeItem(KEY);
          return null;
        }
        if (!cred.operator) return null;
        return cred;
      }
      // The shared operator token (sunset) still identifies itself by its value.
      if (!cred?.value) return null;
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

/** Truthy when signed in — what the shell gates on. A cookie session has no local token value, so
 *  report the operator's email as the truthy marker; the shared token reports its own value. */
export const getToken = () => {
  const cred = read();
  if (!cred) return '';
  return cred.kind === 'session' ? cred.operator?.email || 'session' : cred.value || '';
};

/** The signed-in person, when we know who they are. The shared token identifies nobody. */
export const getOperator = () => read()?.operator || null;

/** The auth header for an API call. A Google session sends NO header — it authenticates with the
 *  HttpOnly cookie (requests go out with credentials:'include'). Only the shared token needs one. */
export function authHeader() {
  const cred = read();
  if (!cred || cred.kind === 'session') return {};
  return { 'x-admin-token': cred.value };
}

/** Sign in with the shared operator token. */
export const setToken = (token) => write({ kind: 'token', value: String(token || '').trim() });

/**
 * Sign in as a person. The API set the session as an HttpOnly cookie on the sign-in response; we do
 * NOT keep the token (`session`) here — only the profile and its deadline, so the token is never
 * readable by JavaScript. The `session` arg is accepted for signature compatibility and ignored.
 */
export const setSession = (_session, operator, expiresAt) =>
  write({ kind: 'session', operator: operator || null, expiresAt: expiresAt || 0 });

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
        credentials: 'include', // the f2f_admin cookie identifies the session to revoke and clear
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
