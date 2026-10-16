/**
 * Support contact — the email and phone shown to customers in the app. Each is only surfaced when
 * its toggle is on, mirroring the public /support endpoint. Talks to GET/PATCH /admin/support: the
 * two visibility chips save on click (optimistic, one field), the text fields save on Save.
 */
import { useEffect, useState } from 'react';
import { toast, useResource } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { ErrorNote, TableSkeleton } from '../components/ui.jsx';
import { IconCheck, IconLifeBuoy } from '../components/icons.jsx';
import { digits, isEmail, isMobile } from '../lib/format.js';
import { getOperator, getCredential } from '../lib/auth.js';

const empty = { email: '', phone: '', showEmail: false, showPhone: false };

/**
 * Who may open this panel with Google. SUPER_ADMIN only (the API enforces it too). "Owners" come
 * from the server's ADMIN_GOOGLE_EMAILS failsafe and are read-only here; everything added below
 * gets the Admin role, and removing someone cuts their access on their next request.
 */
function AdminEmails() {
  const { data, loading, error, reload } = useResource('/admin/admin-emails');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const bad = !!email.trim() && !isEmail(email.trim());

  async function add() {
    const e = email.trim().toLowerCase();
    if (!e || bad) return;
    setBusy(true);
    try {
      await api.post('/admin/admin-emails', { email: e });
      toast(`${e} can now sign in`);
      setEmail('');
      reload();
    } catch (err) {
      toast(err.message || 'Could not add', 'err');
    } finally {
      setBusy(false);
    }
  }

  async function remove(e) {
    try {
      await api.del(`/admin/admin-emails/${encodeURIComponent(e)}`);
      toast(`${e} removed`);
      reload();
    } catch (err) {
      toast(err.message || 'Could not remove', 'err');
    }
  }

  const owners = data?.owners || [];
  const managed = data?.managed || [];

  return (
    <div className="glass card reveal" style={{ marginTop: 20 }}>
      <div className="card__head">
        <h2 className="card__title">Who can access admin</h2>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: -4, marginBottom: 8 }}>
        Only these Google accounts can sign in to the operator panel. Everyone added here gets the
        Admin role.
      </p>

      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : loading ? (
        <TableSkeleton rows={3} />
      ) : (
        <>
          <div className="vstack" style={{ gap: 8 }}>
            {owners.map((o) => (
              <div
                key={o.email}
                className="hstack"
                style={{
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 12px',
                  border: '1px solid var(--hairline)',
                  borderRadius: 10,
                }}
              >
                <span className="hstack" style={{ gap: 8, minWidth: 0 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.email}</span>
                </span>
                <span
                  className="chip is-active"
                  title="Set in server configuration — change it there"
                  style={{ flexShrink: 0 }}
                >
                  {o.role === 'SUPER_ADMIN' ? 'Owner' : o.role} · locked
                </span>
              </div>
            ))}
            {managed.map((m) => (
              <div
                key={m.email}
                className="hstack"
                style={{
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 12px',
                  border: '1px solid var(--hairline)',
                  borderRadius: 10,
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email}</span>
                <button
                  className="btn btn--ghost"
                  onClick={() => remove(m.email)}
                  style={{ flexShrink: 0 }}
                >
                  Remove
                </button>
              </div>
            ))}
            {owners.length + managed.length === 0 && (
              <p className="muted" style={{ fontSize: 13 }}>
                No one is on the list yet. Add an email below.
              </p>
            )}
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label className="field__label">Add an email</label>
            <div className="hstack" style={{ gap: 10, alignItems: 'flex-start' }}>
              <input
                className="field__input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && add()}
                placeholder="person@example.com"
                maxLength={120}
                style={{ flex: 1 }}
              />
              <button
                className="btn btn--primary"
                onClick={add}
                disabled={busy || !email.trim() || bad}
              >
                {busy ? 'Adding…' : 'Add'}
              </button>
            </div>
            {bad && (
              <p className="field__hint" style={{ color: 'var(--tomato)' }}>
                Enter a valid email address.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function Settings() {
  const { data, loading, error, reload } = useResource('/admin/support');
  const [f, setF] = useState(empty);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  // Populate the fields from the API once loaded.
  useEffect(() => {
    if (data?.support) setF({ ...empty, ...data.support });
  }, [data]);

  async function toggle(key) {
    const next = !f[key];
    setF((s) => ({ ...s, [key]: next })); // optimistic
    try {
      await api.patch('/admin/support', { [key]: next });
      reload();
    } catch (e) {
      setF((s) => ({ ...s, [key]: !next })); // roll back
      toast(e.message || 'Could not update', 'err');
    }
  }

  // Inline validity — only flag a field that's been filled in.
  const emailBad = !!f.email.trim() && !isEmail(f.email.trim());
  const phoneBad = !!f.phone && !isMobile(f.phone);

  async function save() {
    if (emailBad || phoneBad) return;
    setSaving(true);
    try {
      await api.patch('/admin/support', { email: f.email.trim(), phone: f.phone.trim() });
      toast('Support contact updated');
      reload();
    } catch (e) {
      toast(e.message || 'Could not save', 'err');
    } finally {
      setSaving(false);
    }
  }

  // What a customer would actually get from the public endpoint.
  const seen = [f.showEmail && f.email.trim(), f.showPhone && f.phone.trim()].filter(Boolean);
  const preview = seen.length ? seen.join(' · ') : 'Nothing (both hidden)';

  // The admin-access list is SUPER_ADMIN-only (the API enforces it too). A shared-token sign-in is
  // treated as SUPER_ADMIN, so it may manage it as well.
  const canManageAccess =
    getOperator()?.role === 'SUPER_ADMIN' || getCredential()?.kind === 'token';

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Support contact</h1>
          <p className="page-sub">The email and phone customers can reach you on from the app.</p>
        </div>
      </header>

      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : loading ? (
        <div className="glass">
          <TableSkeleton rows={3} />
        </div>
      ) : (
        <div className="glass card reveal">
          <div className="card__head">
            <h2 className="card__title">
              <span className="hstack" style={{ gap: 8 }}>
                <IconLifeBuoy size={18} style={{ color: 'var(--ink-3)' }} />
                Support contact
              </span>
            </h2>
          </div>

          <p className="muted" style={{ fontSize: 13, marginTop: -4, marginBottom: 4 }}>
            The email and phone shown to customers in the app. Each is only visible when its toggle
            is on.
          </p>

          <div className="field">
            <label className="field__label">Email</label>
            <input
              className="field__input"
              type="email"
              value={f.email}
              onChange={set('email')}
              placeholder="support@fooducia.health"
              maxLength={120}
            />
            {emailBad && (
              <p className="field__hint" style={{ color: 'var(--tomato)' }}>
                Enter a valid email address.
              </p>
            )}
            <button
              className={`chip${f.showEmail ? ' is-active' : ''}`}
              onClick={() => toggle('showEmail')}
              title="Toggle whether customers see the email"
              style={{ marginTop: 8 }}
            >
              {f.showEmail ? 'Shown to customers' : 'Hidden'}
            </button>
          </div>

          <div className="field">
            <label className="field__label">Phone</label>
            <input
              className="field__input"
              type="tel"
              value={f.phone}
              onChange={(e) => setF((s) => ({ ...s, phone: digits(e.target.value, 10) }))}
              placeholder="98480 00000"
              inputMode="numeric"
              maxLength={10}
            />
            {phoneBad && (
              <p className="field__hint" style={{ color: 'var(--tomato)' }}>
                Enter a valid 10-digit mobile (starts 6–9).
              </p>
            )}
            <button
              className={`chip${f.showPhone ? ' is-active' : ''}`}
              onClick={() => toggle('showPhone')}
              title="Toggle whether customers see the phone"
              style={{ marginTop: 8 }}
            >
              {f.showPhone ? 'Shown to customers' : 'Hidden'}
            </button>
          </div>

          <div
            className="hstack"
            style={{ justifyContent: 'space-between', marginTop: 4, gap: 12, flexWrap: 'wrap' }}
          >
            <span className="muted" style={{ fontSize: 12.5 }}>
              Customers will see: <strong style={{ color: 'var(--ink)' }}>{preview}</strong>
            </span>
            <button
              className="btn btn--primary"
              onClick={save}
              disabled={saving || emailBad || phoneBad}
            >
              <IconCheck size={17} /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {canManageAccess && <AdminEmails />}
    </>
  );
}
