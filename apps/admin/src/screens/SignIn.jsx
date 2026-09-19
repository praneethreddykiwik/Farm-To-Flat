/**
 * The gate in front of the operator panel.
 *
 * Until now there was no gate at all: the admin token was compiled into the public bundle, so the
 * dashboard — today's revenue, every order, every customer address — rendered for anyone who opened
 * the URL. The token now lives only in the operator's own browser, and this is where it gets there.
 *
 * Self-contained styles, like Privacy/Terms: this renders before the shell, and a sign-in screen
 * that depends on the rest of the app loading correctly is a sign-in screen that can lock you out.
 */
import { useState } from 'react';
import { api } from '../lib/api.js';
import { clearToken, setToken } from '../lib/auth.js';
import { IconLeaf } from '../components/icons.jsx';

export function SignIn() {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const token = value.trim();
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    // Store first, then make a real admin call: the client reads the token per request, so this
    // proves the token against the live API instead of trusting whatever was typed.
    setToken(token);
    try {
      await api.get('/admin/orders?limit=1');
      // Signed in — onAuthChange already told the shell to swap this screen out.
    } catch (err) {
      clearToken();
      setError(
        err?.status === 401 || err?.status === 403
          ? 'That token was rejected. Check it against ADMIN_TOKEN on the API host.'
          : err?.message || 'Could not reach the API. Check your connection and try again.',
      );
      setBusy(false);
    }
  };

  return (
    <div style={S.page}>
      <form style={S.card} onSubmit={submit}>
        <div style={S.brand}>
          <IconLeaf size={20} style={{ color: 'var(--sprout, #A4C506)' }} />
          <span style={S.brandText}>Farm to Flat</span>
        </div>
        <h1 style={S.title}>Operations sign-in</h1>
        <p style={S.sub}>
          This panel manages live orders and customer data. Paste the admin token to continue.
        </p>

        <label style={S.label} htmlFor="admin-token">
          Admin token
        </label>
        <input
          id="admin-token"
          style={S.input}
          type="password"
          value={value}
          autoFocus
          autoComplete="current-password"
          spellCheck={false}
          placeholder="Paste the token"
          onChange={(e) => {
            setValue(e.target.value);
            // Clear the previous rejection as soon as they start correcting it — a stale red error
            // sitting under a field you've just fixed reads as "still wrong".
            if (error) setError(null);
          }}
        />

        {error && (
          <p role="alert" style={S.error}>
            {error}
          </p>
        )}

        <button type="submit" style={{ ...S.button, opacity: busy || !value.trim() ? 0.6 : 1 }}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>

        <p style={S.foot}>Stays on this device until you sign out.</p>
      </form>
    </div>
  );
}

const S = {
  page: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    padding: 24,
    background: '#0B1510',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    background: '#0F2018',
    border: '1px solid rgba(164,197,6,0.18)',
    borderRadius: 20,
    padding: 32,
    boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 26 },
  brandText: { color: '#F3F5EF', fontWeight: 600, fontSize: 15, letterSpacing: -0.2 },
  title: {
    color: '#F3F5EF',
    fontSize: 25,
    lineHeight: 1.2,
    margin: '0 0 8px',
    letterSpacing: -0.5,
  },
  sub: { color: 'rgba(243,245,239,0.62)', fontSize: 14, lineHeight: 1.55, margin: '0 0 24px' },
  label: {
    display: 'block',
    color: 'rgba(243,245,239,0.72)',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '13px 14px',
    fontSize: 15,
    color: '#F3F5EF',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(243,245,239,0.16)',
    borderRadius: 12,
    outline: 'none',
  },
  error: { color: '#F0A28A', fontSize: 13.5, lineHeight: 1.5, margin: '12px 0 0' },
  button: {
    width: '100%',
    marginTop: 20,
    padding: '13px 16px',
    fontSize: 15,
    fontWeight: 650,
    color: '#0B1510',
    background: '#A4C506',
    border: 'none',
    borderRadius: 999,
    cursor: 'pointer',
  },
  foot: {
    color: 'rgba(243,245,239,0.42)',
    fontSize: 12.5,
    textAlign: 'center',
    margin: '18px 0 0',
  },
};
