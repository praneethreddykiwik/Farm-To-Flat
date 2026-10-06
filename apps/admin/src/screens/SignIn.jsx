/**
 * The gate in front of the operator panel.
 *
 * Until now there was no gate at all: the admin token was compiled into the public bundle, so the
 * dashboard — today's revenue, every order, every customer address — rendered for anyone who opened
 * the URL. The credential now lives only in the operator's own browser, and this is where it gets
 * there.
 *
 * TWO WAYS IN, in the order we want them used:
 *   Google   — identifies a person. The API verifies Google's signature and then checks the address
 *              against the operator allowlist, so this is the one that can be revoked for one human
 *              being without changing anything for anyone else.
 *   The token — identifies nobody. Everyone holding it is the same anonymous admin. It stays while
 *              Google access is rolled out, and it is the way back in if Google is unreachable.
 *
 * Self-contained styles, like Privacy/Terms: this renders before the shell, and a sign-in screen
 * that depends on the rest of the app loading correctly is a sign-in screen that can lock you out.
 * The same reasoning governs the Google script — it is loaded lazily and every failure path ends
 * with the token field still usable, because an outage at Google must not become an outage here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../lib/api.js';
import { setSession, setToken } from '../lib/auth.js';
import mark from '../assets/fooducia-mark.png';

const GSI_SRC = 'https://accounts.google.com/gsi/client';
const API_BASE = `${import.meta.env.VITE_API_URL || ''}/api/v1`;

/** Load the Google Identity script once, shared across re-renders and remounts. */
let gsiPromise = null;
function loadGsi() {
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve(window.google);
    const el = document.createElement('script');
    el.src = GSI_SRC;
    el.async = true;
    el.defer = true;
    el.onload = () =>
      window.google?.accounts?.id ? resolve(window.google) : reject(new Error('gsi'));
    el.onerror = () => {
      gsiPromise = null; // let a later attempt retry rather than caching the failure forever
      reject(new Error('gsi'));
    };
    document.head.appendChild(el);
  });
  return gsiPromise;
}

export function SignIn() {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(null); // null | 'token' | 'google'
  const [error, setError] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [google, setGoogle] = useState({ state: 'loading', clientId: null });
  const buttonSlot = useRef(null);

  /** Hand a verified Google credential to our API and take the session it returns. */
  const onGoogleCredential = useCallback(async (response) => {
    setBusy('google');
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, data?.error?.code, data?.error?.message);
      setAccepted(true);
      // Let the accepted state be seen before the shell replaces this screen.
      setTimeout(() => setSession(data.session, data.operator, data.expiresAt), 520);
    } catch (err) {
      setBusy(null);
      setError(err?.message || 'That sign-in could not be completed. Try again.');
    }
  }, []);

  // Ask the API which sign-in methods it actually offers, then render Google's button if it does.
  useEffect(() => {
    let dead = false;
    (async () => {
      let config;
      try {
        const res = await fetch(`${API_BASE}/admin/auth/config`);
        config = await res.json();
      } catch {
        if (!dead) setGoogle({ state: 'unavailable', clientId: null });
        return;
      }
      if (dead) return;
      if (!config?.google?.enabled) return setGoogle({ state: 'off', clientId: null });
      setGoogle({ state: 'loading', clientId: config.google.clientId });
      try {
        const g = await loadGsi();
        if (dead) return;
        g.accounts.id.initialize({
          client_id: config.google.clientId,
          callback: onGoogleCredential,
          // No One Tap prompt on a sign-in page: the button is the whole point of the screen, and a
          // floating prompt over it is two competing ways to do the same thing.
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        // Google's button takes a width in PIXELS and renders in an iframe that will not shrink
        // below it, so a hard-coded 340 pushed the card wider than a 375px phone screen and the
        // whole sign-in scrolled sideways. Measure the space it actually has instead. Google
        // accepts 200-400.
        const slot = buttonSlot.current;
        const available = Math.round(slot?.parentElement?.clientWidth || 340);
        g.accounts.id.renderButton(slot, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          logo_alignment: 'center',
          width: Math.max(200, Math.min(400, available)),
        });
        setGoogle({ state: 'ready', clientId: config.google.clientId });
      } catch {
        if (!dead) setGoogle({ state: 'unavailable', clientId: null });
      }
    })();
    return () => {
      dead = true;
    };
  }, [onGoogleCredential]);

  const submit = async (e) => {
    e.preventDefault();
    const token = value.trim();
    if (!token || busy) return;
    setBusy('token');
    setError(null);
    // Prove the token BEFORE storing it. Storing first is what the panel used to do, and because the
    // shell swaps itself in the instant a credential appears, a WRONG token rendered the whole
    // operator console — sidebar, dashboard, the lot — for as long as the rejection took to come
    // back, and then threw this screen away along with the error message explaining what happened.
    // So: a bare fetch that carries the header without committing to it, and only then sign in.
    try {
      const res = await fetch(`${API_BASE}/admin/orders?limit=1`, {
        headers: { 'x-admin-token': token },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new ApiError(res.status, data?.error?.code, data?.error?.message);
      }
      setAccepted(true);
      // Let the accepted state be seen before the shell replaces this screen.
      setTimeout(() => setToken(token), 520);
    } catch (err) {
      setError(
        err?.status === 401 || err?.status === 403
          ? 'That token was rejected. Check it against ADMIN_TOKEN on the API host.'
          : 'Could not reach the API. Check your connection and try again.',
      );
      setBusy(null);
    }
  };

  const showGoogle = google.state !== 'off';
  const disabled = !!busy || accepted;

  return (
    <div className="si">
      <style>{CSS}</style>
      {/* Three slow-drifting washes of colour. Decorative only, and the first thing dropped under
          prefers-reduced-motion. */}
      <div className="si__aurora" aria-hidden="true">
        <span className="si__blob si__blob--a" />
        <span className="si__blob si__blob--b" />
        <span className="si__blob si__blob--c" />
      </div>
      <div className="si__grid" aria-hidden="true" />

      <form
        className={`si__card${error ? ' is-rejected' : ''}${accepted ? ' is-accepted' : ''}`}
        onSubmit={submit}
        noValidate
      >
        <span className="si__edge" aria-hidden="true" />

        <div className="si__row" style={{ '--i': 0 }}>
          <img className="si__mark" src={mark} alt="" width={26} height={26} />
          <span className="si__brand">Fooducia</span>
        </div>

        <h1 className="si__title" style={{ '--i': 1 }}>
          Operations sign-in
        </h1>
        <p className="si__sub" style={{ '--i': 2 }}>
          This panel manages live orders and customer data. Sign in with your Fooducia Google
          account, or paste the operator token.
        </p>

        {showGoogle && (
          <div className="si__google" style={{ '--i': 3 }}>
            <div ref={buttonSlot} className="si__gbtn" />
            {google.state === 'loading' && <div className="si__gskeleton" aria-hidden="true" />}
            {google.state === 'unavailable' && (
              <p className="si__note">
                Google sign-in could not load. Use the operator token below.
              </p>
            )}
          </div>
        )}

        {showGoogle && (
          <div className="si__or" style={{ '--i': 4 }} aria-hidden="true">
            <span>or</span>
          </div>
        )}

        <label className="si__label" htmlFor="admin-token" style={{ '--i': 5 }}>
          Operator token
        </label>
        <div className="si__field" style={{ '--i': 6 }}>
          <input
            id="admin-token"
            className="si__input"
            type="password"
            value={value}
            autoFocus={!showGoogle}
            autoComplete="current-password"
            spellCheck={false}
            disabled={disabled}
            placeholder="Paste the token"
            onChange={(e) => {
              setValue(e.target.value);
              // Clear the previous rejection as soon as they start correcting it — a stale red error
              // sitting under a field you've just fixed reads as "still wrong".
              if (error) setError(null);
            }}
          />
          <span className="si__underline" aria-hidden="true" />
        </div>

        {error && (
          <p role="alert" className="si__error">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="si__button"
          aria-label="Sign in with the operator token"
          disabled={disabled || !value.trim()}
          style={{ '--i': 7 }}
        >
          <span className="si__sheen" aria-hidden="true" />
          <span className="si__buttonText">
            {accepted ? 'Signed in' : busy === 'token' ? 'Checking' : 'Sign in'}
            {busy === 'token' && (
              <span className="si__dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            )}
          </span>
        </button>

        <p className="si__foot" style={{ '--i': 8 }}>
          {busy === 'google'
            ? 'Checking that account…'
            : 'Stays on this device until you sign out.'}
        </p>
      </form>
    </div>
  );
}

/**
 * Everything the screen needs, inline. Motion is layered on top of a page that is already correct
 * and readable without it: every animation either fades something in from a visible resting state
 * or is purely decorative, and `prefers-reduced-motion` removes the lot.
 */
const CSS = `
.si {
  --ink: #08110C;
  --panel: #0E1D15;
  --sprout: #A4C506;
  --mist: #F3F5EF;
  --line: rgba(164,197,6,0.16);
  position: relative;
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  overflow: hidden;
  background: var(--ink);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.si__aurora { position: absolute; inset: -20%; filter: blur(80px); opacity: 0.9; pointer-events: none; }
.si__blob { position: absolute; display: block; border-radius: 50%; }
.si__blob--a { width: 48vmax; height: 48vmax; left: -6vmax; top: -10vmax;
  background: radial-gradient(circle, rgba(164,197,6,0.42), transparent 64%);
  animation: si-drift-a 34s ease-in-out infinite; }
.si__blob--b { width: 42vmax; height: 42vmax; right: -10vmax; bottom: -14vmax;
  background: radial-gradient(circle, rgba(29,140,88,0.58), transparent 66%);
  animation: si-drift-b 44s ease-in-out infinite; }
.si__blob--c { width: 30vmax; height: 30vmax; left: 38%; top: 46%;
  background: radial-gradient(circle, rgba(124,180,40,0.34), transparent 68%);
  animation: si-drift-c 52s ease-in-out infinite; }
@keyframes si-drift-a { 50% { transform: translate3d(7vmax, 5vmax, 0) scale(1.14); } }
@keyframes si-drift-b { 50% { transform: translate3d(-8vmax, -4vmax, 0) scale(1.09); } }
@keyframes si-drift-c { 50% { transform: translate3d(4vmax, -7vmax, 0) scale(0.9); } }

/* A faint field rule, so the ground reads as a surface rather than flat black. */
.si__grid {
  position: absolute; inset: 0; pointer-events: none;
  background-image: linear-gradient(rgba(243,245,239,0.055) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(243,245,239,0.055) 1px, transparent 1px);
  background-size: 64px 64px;
  mask-image: radial-gradient(ellipse at 50% 45%, #000 15%, transparent 72%);
  -webkit-mask-image: radial-gradient(ellipse at 50% 45%, #000 15%, transparent 72%);
}

.si__card {
  position: relative;
  width: 100%;
  max-width: 420px;
  box-sizing: border-box;
  padding: 32px;
  border-radius: 22px;
  border: 1px solid var(--line);
  background: linear-gradient(180deg, rgba(18,38,27,0.92), rgba(10,22,16,0.94));
  box-shadow: 0 30px 70px rgba(0,0,0,0.55), inset 0 1px 0 rgba(243,245,239,0.06);
  backdrop-filter: blur(14px);
  animation: si-card-in 720ms cubic-bezier(0.22,1,0.36,1) both;
}
@keyframes si-card-in {
  from { opacity: 0; transform: translateY(22px) scale(0.975); filter: blur(7px); }
  to   { opacity: 1; transform: none; filter: none; }
}

/* A single light travelling the card's edge — one flourish, kept quiet. */
.si__edge {
  position: absolute; inset: -1px; border-radius: 23px; padding: 1px; pointer-events: none;
  background: conic-gradient(from var(--a, 0deg), transparent 0 72%,
              rgba(164,197,6,0.75) 84%, rgba(164,197,6,0) 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  animation: si-edge 7s linear infinite;
  opacity: 0.85;
}
@property --a { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
@keyframes si-edge { to { --a: 360deg; } }

.si__card > *:not(.si__edge) { animation: si-rise 560ms cubic-bezier(0.22,1,0.36,1) both;
  animation-delay: calc(140ms + var(--i, 0) * 55ms); }
@keyframes si-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

.si__row { display: flex; align-items: center; gap: 9px; margin-bottom: 24px; }
.si__mark { display: block; border-radius: 7px; }
.si__brand { color: var(--mist); font-weight: 600; font-size: 15px; letter-spacing: -0.2px; }
.si__title { color: var(--mist); font-size: 26px; line-height: 1.18; margin: 0 0 8px;
  letter-spacing: -0.6px; text-wrap: balance; }
.si__sub { color: rgba(243,245,239,0.62); font-size: 14px; line-height: 1.6; margin: 0 0 22px; }

.si__google { position: relative; min-height: 44px; display: grid; justify-items: center; }
.si__gbtn { color-scheme: dark; max-width: 100%; }
.si__gskeleton { position: absolute; inset: 0; border-radius: 999px;
  background: linear-gradient(90deg, rgba(243,245,239,0.05), rgba(243,245,239,0.11), rgba(243,245,239,0.05));
  background-size: 200% 100%; animation: si-shimmer 1.3s linear infinite; }
@keyframes si-shimmer { to { background-position: -200% 0; } }
.si__note { color: rgba(243,245,239,0.52); font-size: 12.5px; line-height: 1.5; margin: 6px 0 0;
  text-align: center; }

.si__or { display: flex; align-items: center; gap: 12px; margin: 20px 0 18px;
  color: rgba(243,245,239,0.38); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
.si__or::before, .si__or::after { content: ''; flex: 1; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(243,245,239,0.16), transparent); }

.si__label { display: block; color: rgba(243,245,239,0.72); font-size: 12px; font-weight: 600;
  letter-spacing: 0.6px; text-transform: uppercase; margin-bottom: 8px; }
.si__field { position: relative; }
.si__input {
  width: 100%; box-sizing: border-box; padding: 13px 14px; font-size: 15px; color: var(--mist);
  background: rgba(255,255,255,0.05); border: 1px solid rgba(243,245,239,0.16);
  border-radius: 12px; outline: none; transition: border-color 180ms, background 180ms, box-shadow 180ms;
}
.si__input::placeholder { color: rgba(243,245,239,0.34); }
.si__input:focus { border-color: rgba(164,197,6,0.55); background: rgba(255,255,255,0.07);
  box-shadow: 0 0 0 4px rgba(164,197,6,0.13); }
.si__input:disabled { opacity: 0.55; }
/* The focus rule under the field fills from the centre as you type into it. */
.si__underline { position: absolute; left: 14px; right: 14px; bottom: 0; height: 2px;
  border-radius: 2px; background: var(--sprout); transform: scaleX(0); transform-origin: 50% 50%;
  transition: transform 300ms cubic-bezier(0.22,1,0.36,1); }
.si__input:focus ~ .si__underline { transform: scaleX(1); }

.si__error { color: #F0A28A; font-size: 13.5px; line-height: 1.5; margin: 12px 0 0;
  animation: si-rise 260ms ease both; }

.si__button {
  position: relative; overflow: hidden; width: 100%; margin-top: 20px; padding: 13px 16px;
  font-size: 15px; font-weight: 650; color: #0B1510; background: var(--sprout);
  border: none; border-radius: 999px; cursor: pointer;
  transition: transform 140ms cubic-bezier(0.22,1,0.36,1), box-shadow 200ms, opacity 160ms;
  box-shadow: 0 8px 24px rgba(164,197,6,0.22);
}
.si__button:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 30px rgba(164,197,6,0.3); }
.si__button:active:not(:disabled) { transform: translateY(0) scale(0.985); }
.si__button:disabled { opacity: 0.55; cursor: default; box-shadow: none; }
.si__buttonText { position: relative; display: inline-flex; align-items: center; gap: 7px; }
.si__sheen { position: absolute; inset: 0;
  background: linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.5) 50%, transparent 62%);
  transform: translateX(-120%); }
.si__button:hover:not(:disabled) .si__sheen { animation: si-sheen 760ms ease; }
@keyframes si-sheen { to { transform: translateX(120%); } }

.si__dots { display: inline-flex; gap: 3px; }
.si__dots i { width: 4px; height: 4px; border-radius: 50%; background: currentColor;
  animation: si-dot 1s ease-in-out infinite; }
.si__dots i:nth-child(2) { animation-delay: 0.15s; }
.si__dots i:nth-child(3) { animation-delay: 0.3s; }
@keyframes si-dot { 0%, 100% { opacity: 0.25; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-2px); } }

.si__foot { color: rgba(243,245,239,0.42); font-size: 12.5px; text-align: center; margin: 18px 0 0; }

/* A rejection shakes the card once. Small amplitude on purpose: it should read as "no", not as a
   malfunction. */
.si__card.is-rejected { animation: si-shake 420ms cubic-bezier(0.36,0.07,0.19,0.97) both; }
@keyframes si-shake { 10%, 90% { transform: translateX(-2px); } 20%, 80% { transform: translateX(4px); }
  30%, 50%, 70% { transform: translateX(-6px); } 40%, 60% { transform: translateX(6px); } }

/* Acceptance: the card settles and a ring of the brand colour expands once. */
.si__card.is-accepted { animation: si-accept 520ms cubic-bezier(0.22,1,0.36,1) both; }
@keyframes si-accept {
  40% { transform: scale(1.012); box-shadow: 0 30px 70px rgba(0,0,0,0.55), 0 0 0 6px rgba(164,197,6,0.22); }
  100% { transform: scale(1); box-shadow: 0 30px 70px rgba(0,0,0,0.55), 0 0 0 0 rgba(164,197,6,0); }
}

@media (max-width: 460px) { .si__card { padding: 26px 22px; } .si__title { font-size: 23px; } }

@media (prefers-reduced-motion: reduce) {
  .si__blob, .si__edge, .si__gskeleton, .si__dots i { animation: none !important; }
  .si__card, .si__card > *, .si__card.is-rejected, .si__card.is-accepted {
    animation: si-fade 200ms ease both !important; }
  .si__underline, .si__button { transition: none !important; }
  @keyframes si-fade { from { opacity: 0; } to { opacity: 1; } }
}
`;
