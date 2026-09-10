/**
 * Access & roles — assign a phone number a staff role (+ AI-button access). When that number opens
 * the app, it goes straight into the role's tools instead of the customer shopping app. The app is
 * NOT wired to this yet — the API's /access/resolve seam is ready for when it is.
 */
import { useState } from 'react';
import { toast, useResource } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { ErrorNote, TableSkeleton } from '../components/ui.jsx';
import { IconPlus, IconShield, IconTrash } from '../components/icons.jsx';
import { digits, isMobile, noLead } from '../lib/format.js';

const ROLE_TINT = {
  SUPER_ADMIN: { bg: 'var(--sprout)', fg: 'var(--night)' },
  ADMIN: { bg: 'var(--leaf-soft)', fg: 'var(--leaf-deep)' },
  PROCUREMENT: { bg: '#d9ecfb', fg: '#1c5a8a' },
  FULFILMENT: { bg: '#ece4fb', fg: '#6a3fb0' },
};

export function Access() {
  const { data, loading, error, reload } = useResource('/admin/access');
  const roles = data?.roles || [];
  const staff = data?.staff || [];
  const [f, setF] = useState({ mobile: '', role: 'ADMIN', name: '', aiAccess: false });

  async function add() {
    if (!/^[6-9]\d{9}$/.test(f.mobile))
      return toast('Enter a valid 10-digit mobile number.', 'err');
    try {
      await api.post('/admin/access', {
        mobile: f.mobile,
        role: f.role,
        name: f.name.trim() || undefined,
        aiAccess: f.aiAccess,
      });
      toast('Member added');
      setF({ mobile: '', role: f.role, name: '', aiAccess: false });
      reload();
    } catch (e) {
      toast(e.message || 'Could not add', 'err');
    }
  }
  async function remove(s) {
    if (!confirm(`Remove ${s.mobile} (${s.roleLabel})?`)) return;
    try {
      await api.del(`/admin/access/${s.id}`);
      toast('Access revoked');
      reload();
    } catch (e) {
      toast(e.message || 'Could not remove', 'err');
    }
  }
  async function patch(s, body, msg) {
    try {
      await api.patch(`/admin/access/${s.id}`, body);
      if (msg) toast(msg);
      reload();
    } catch (e) {
      toast(e.message || 'Could not update', 'err');
    }
  }

  const grouped = roles.map((r) => ({ role: r, members: staff.filter((s) => s.role === r.code) }));
  const mobileBad = !!f.mobile && !isMobile(f.mobile); // only flag once something's typed

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Access & roles</h1>
          <p className="page-sub">
            Give a phone number a role — the app opens into their tools, not the shopping app.
          </p>
        </div>
      </header>

      {/* add member */}
      <div className="glass card reveal">
        <div className="card__head">
          <h2 className="card__title">Add a team member</h2>
        </div>
        <div className="field">
          <label className="field__label">Role</label>
          <div className="seg" style={{ flexWrap: 'wrap' }}>
            {roles.map((r) => (
              <button
                key={r.code}
                type="button"
                className={`seg__btn${f.role === r.code ? ' is-active' : ''}`}
                style={
                  f.role === r.code
                    ? { background: ROLE_TINT[r.code].bg, color: ROLE_TINT[r.code].fg }
                    : undefined
                }
                onClick={() => setF((s) => ({ ...s, role: r.code, aiAccess: r.ai || s.aiAccess }))}
              >
                {r.label}
              </button>
            ))}
          </div>
          <p className="field__hint">{roles.find((r) => r.code === f.role)?.description}</p>
        </div>
        <div className="field__row">
          <div className="field">
            <label className="field__label">Mobile number</label>
            <input
              className="field__input"
              value={f.mobile}
              onChange={(e) => setF((s) => ({ ...s, mobile: digits(e.target.value, 10) }))}
              placeholder="98480 00000"
              inputMode="numeric"
              maxLength={10}
            />
            {mobileBad && (
              <p className="field__hint" style={{ color: 'var(--tomato)' }}>
                10 digits, starting 6–9.
              </p>
            )}
          </div>
          <div className="field">
            <label className="field__label">Name (optional)</label>
            <input
              className="field__input"
              value={f.name}
              onChange={(e) => setF((s) => ({ ...s, name: noLead(e.target.value) }))}
              placeholder="Ravi · buyer"
              maxLength={60}
            />
          </div>
        </div>
        <div className="hstack" style={{ justifyContent: 'space-between', marginTop: 4 }}>
          <label className="hstack" style={{ gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={f.aiAccess || f.role === 'SUPER_ADMIN'}
              disabled={f.role === 'SUPER_ADMIN'}
              onChange={(e) => setF((s) => ({ ...s, aiAccess: e.target.checked }))}
            />
            <span style={{ fontSize: 13.5 }}>
              Can see the AI planner button
              {f.role === 'SUPER_ADMIN' && (
                <span className="muted"> · always on for super admin</span>
              )}
            </span>
          </label>
          <button className="btn btn--primary" onClick={add} disabled={!isMobile(f.mobile)}>
            <IconPlus size={17} /> Add member
          </button>
        </div>
      </div>

      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : loading ? (
        <div className="glass">
          <TableSkeleton rows={4} />
        </div>
      ) : (
        <div className="grid-2" style={{ gridTemplateColumns: '1.4fr 1fr', alignItems: 'start' }}>
          {/* staff by role */}
          <div className="vstack" style={{ gap: 16 }}>
            {grouped.map(({ role, members }) => (
              <div key={role.code} className="glass card reveal">
                <div
                  className="hstack"
                  style={{ justifyContent: 'space-between', marginBottom: members.length ? 12 : 0 }}
                >
                  <span className="hstack" style={{ gap: 10 }}>
                    <span
                      className="badge"
                      style={{
                        background: ROLE_TINT[role.code].bg,
                        color: ROLE_TINT[role.code].fg,
                      }}
                    >
                      <span className="badge__dot" />
                      {role.label}
                    </span>
                    {role.ai && (
                      <span className="badge av-available" style={{ fontSize: 11 }}>
                        AI
                      </span>
                    )}
                  </span>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {members.length} {members.length === 1 ? 'number' : 'numbers'}
                  </span>
                </div>
                {members.length === 0 ? (
                  <p className="muted" style={{ fontSize: 12.5 }}>
                    No numbers yet.
                  </p>
                ) : (
                  <div className="vstack" style={{ gap: 0 }}>
                    {members.map((s) => (
                      <div
                        key={s.id}
                        className="hstack"
                        style={{
                          justifyContent: 'space-between',
                          padding: '10px 0',
                          borderTop: '1px solid var(--hairline)',
                        }}
                      >
                        <div>
                          <div className="hstack" style={{ gap: 8 }}>
                            <span className="mono" style={{ fontWeight: 600 }}>
                              {s.mobile}
                            </span>
                            {s.aiAccess && (
                              <span className="badge av-available" style={{ fontSize: 10.5 }}>
                                AI
                              </span>
                            )}
                          </div>
                          {s.name && (
                            <div className="muted" style={{ fontSize: 12 }}>
                              {s.name}
                            </div>
                          )}
                        </div>
                        <div className="hstack" style={{ gap: 6 }}>
                          {s.role !== 'SUPER_ADMIN' && (
                            <button
                              className="chip"
                              onClick={() =>
                                patch(
                                  s,
                                  { aiAccess: !s.aiAccess },
                                  s.aiAccess ? 'AI access removed' : 'AI access granted',
                                )
                              }
                              title="Toggle AI planner access"
                            >
                              {s.aiAccess ? 'AI on' : 'AI off'}
                            </button>
                          )}
                          <button
                            className="btn btn--ghost btn--icon"
                            onClick={() => remove(s)}
                            style={{ color: 'var(--tomato)' }}
                            aria-label="Remove"
                          >
                            <IconTrash size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* role reference */}
          <div className="glass card reveal" style={{ position: 'sticky', top: 12 }}>
            <div className="card__head">
              <h2 className="card__title" style={{ fontSize: 15 }}>
                What each role sees
              </h2>
              <IconShield size={18} style={{ color: 'var(--ink-3)' }} />
            </div>
            <div className="vstack" style={{ gap: 14 }}>
              {roles.map((r) => (
                <div
                  key={r.code}
                  style={{ paddingBottom: 12, borderBottom: '1px solid var(--hairline)' }}
                >
                  <div className="hstack" style={{ gap: 8, marginBottom: 5 }}>
                    <span
                      className="badge"
                      style={{ background: ROLE_TINT[r.code].bg, color: ROLE_TINT[r.code].fg }}
                    >
                      {r.label}
                    </span>
                    {r.ai && (
                      <span className="muted" style={{ fontSize: 11 }}>
                        + AI
                      </span>
                    )}
                  </div>
                  <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>
                    {r.description}
                  </div>
                  <div className="hstack" style={{ gap: 5, flexWrap: 'wrap' }}>
                    {r.sections.map((sec) => (
                      <span
                        key={sec}
                        className="chip"
                        style={{ fontSize: 11, padding: '4px 9px', textTransform: 'capitalize' }}
                      >
                        {sec}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
              The app reads this at login to open the right surface. It isn't wired to the app yet —
              this sets it up for when it is.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
