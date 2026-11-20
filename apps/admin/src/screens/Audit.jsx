/**
 * Audit log — every change staff make through the admin API, newest first: who (the signed-in
 * staff email and role, or the shared token, which names nobody), what, to which record, and the
 * details sent.
 *
 * Read-only by design. The log is append-only: entries cannot be edited or deleted from here or
 * anywhere else, because a trail that can be rewritten proves nothing.
 *
 * API: GET /admin/audit?limit=&target= (owner only — anyone else gets 403).
 */
import { useState } from 'react';
import { useResource } from '../lib/useApi.js';
import { ErrorNote, TableSkeleton } from '../components/ui.jsx';
import { IconSearch } from '../components/icons.jsx';
import { dateTime } from '../lib/format.js';

const LIMITS = [50, 100, 200, 500];

const sentence = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());

/** One line per detail field, values trimmed — enough to read at a glance; hover for the lot. */
function Details({ details }) {
  if (!details || typeof details !== 'object' || Object.keys(details).length === 0)
    return <span className="muted">—</span>;
  const full = JSON.stringify(details, null, 2);
  const entries = Object.entries(details).slice(0, 4);
  return (
    <div className="mono" style={{ fontSize: 11.5, lineHeight: 1.5 }} title={full}>
      {entries.map(([k, v]) => {
        const text = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
        return (
          <div
            key={k}
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 320,
            }}
          >
            <span className="muted">{k}:</span> {text.length > 60 ? `${text.slice(0, 60)}…` : text}
          </div>
        );
      })}
      {Object.keys(details).length > entries.length && (
        <div className="muted">+{Object.keys(details).length - entries.length} more</div>
      )}
    </div>
  );
}

export function Audit() {
  const [limit, setLimit] = useState(200);
  const [draft, setDraft] = useState('');
  const [target, setTarget] = useState('');
  const qs = new URLSearchParams({ limit: String(limit), ...(target ? { target } : {}) });
  const { data, loading, error, reload } = useResource(`/admin/audit?${qs}`);
  const actions = data?.actions || [];

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Audit log</h1>
          <p className="page-sub">
            Every change made through the admin panel — who made it, what it was and what it
            touched. Owner only.
          </p>
        </div>
      </header>

      <div className="glass card reveal" style={{ marginBottom: 16 }}>
        <form
          className="hstack"
          style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}
          onSubmit={(e) => {
            e.preventDefault();
            setTarget(draft.trim());
          }}
        >
          <div className="field" style={{ flex: '1 1 240px', marginBottom: 0 }}>
            <label className="field__label">Target (exact record id)</label>
            <input
              className="field__input"
              value={draft}
              maxLength={80}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. an order, customer or promoter id"
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field__label">Show</label>
            <select
              className="field__select"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              {LIMITS.map((n) => (
                <option key={n} value={n}>
                  Latest {n}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn--primary">
            <IconSearch size={16} /> Filter
          </button>
          {target && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setDraft('');
                setTarget('');
              }}
            >
              Clear
            </button>
          )}
        </form>
        <p className="field__hint" style={{ marginTop: 10 }}>
          The audit log is append-only on purpose — entries cannot be edited or deleted, by anyone.
          A record that could be rewritten would prove nothing.
        </p>
      </div>

      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="glass card">
          <TableSkeleton rows={6} />
        </div>
      ) : actions.length === 0 ? (
        <div className="glass card empty">
          {target ? `Nothing recorded against ${target}.` : 'Nothing recorded yet.'}
        </div>
      ) : (
        <div className="glass card reveal" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((a) => (
                  <tr key={a.id}>
                    <td className="data__name" style={{ whiteSpace: 'nowrap' }}>
                      {dateTime(a.at)}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {a.actor === 'shared-token' ? (
                          <span title="The shared admin token names nobody">Shared token</span>
                        ) : (
                          a.actor
                        )}
                      </div>
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {sentence(a.role)}
                        {a.via
                          ? ` · ${a.via === 'google' ? 'Google sign-in' : 'shared token'}`
                          : ''}
                      </div>
                    </td>
                    <td className="data__name">{sentence(a.action)}</td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {a.target ? (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm mono"
                          title="Show only this record"
                          onClick={() => {
                            setDraft(a.target);
                            setTarget(a.target);
                          }}
                        >
                          {a.target}
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <Details details={a.details} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
