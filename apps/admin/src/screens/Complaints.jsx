/**
 * Complaints — every problem a customer has reported about a delivery, in one queue.
 *
 * Before this the only way to reach a complaint was the order drawer, which meant an operator had to
 * already know which order it sat on, or catch the push the moment it arrived. A complaint nobody
 * can find is a complaint nobody answers, and the photograph a customer took at their door is the
 * only evidence either side will ever have.
 *
 * Open first and selected by default, because that is the whole job: the ones still waiting.
 * Answered ones stay reachable rather than disappearing — "what did we decide about that bag?" is a
 * question that gets asked days later.
 */
import { useMemo, useState } from 'react';
import { toast, useResource } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { ErrorNote } from '../components/ui.jsx';
import { IconAlert } from '../components/icons.jsx';
import { inr, titleCase } from '../lib/format.js';

const TABS = [
  { key: 'OPEN', label: 'Waiting' },
  { key: 'RESOLVED', label: 'Put right' },
  { key: 'DECLINED', label: 'Declined' },
  { key: '', label: 'All' },
];

/** "3 Oct, 4:05 pm" — complaints are read against when the delivery happened, not a bare date. */
function when(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function Complaints() {
  const [tab, setTab] = useState('OPEN');
  const { data, loading, error, reload } = useResource(
    `/admin/issues${tab ? `?status=${tab}` : ''}`,
  );
  const issues = useMemo(() => data?.issues || [], [data]);
  const openCount = data?.openCount ?? 0;
  const [busy, setBusy] = useState(/** @type {string|null} */ (null));

  /** Answer a report. The customer's own words and photos are never rewritten — only added to. */
  async function answer(iss, status) {
    const resolution =
      status === 'RESOLVED'
        ? window.prompt('What did you do about it? (shown to the customer)') || undefined
        : window.prompt('Why are you declining it? (shown to the customer)') || undefined;
    setBusy(iss.id);
    try {
      await api.post(`/admin/orders/${iss.order.id}/issues/${iss.id}`, { status, resolution });
      toast(status === 'RESOLVED' ? 'Marked as put right' : 'Report declined');
      reload();
    } catch (e) {
      toast(e.message || 'Could not update the report', 'err');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Complaints</h1>
          <p className="page-sub">
            {openCount === 0
              ? 'Nothing waiting on a decision'
              : `${openCount} waiting on a decision`}
          </p>
        </div>
      </header>

      <div className="hstack" style={{ gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.key || 'all'}
            className="daypill"
            onClick={() => setTab(t.key)}
            style={{
              width: 'auto',
              padding: '7px 14px',
              background: tab === t.key ? 'var(--leaf)' : 'rgba(14,27,20,0.05)',
              color: tab === t.key ? '#fff' : 'var(--ink-3)',
              fontSize: 13,
            }}
          >
            {t.label}
            {t.key === 'OPEN' && openCount > 0 ? ` · ${openCount}` : ''}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : loading ? (
        <div className="glass card">
          <div className="skeleton" style={{ height: 200 }} />
        </div>
      ) : issues.length === 0 ? (
        <div className="glass card">
          <div className="empty">
            {tab === 'OPEN'
              ? 'No complaints waiting. Every report has been answered.'
              : 'Nothing here.'}
          </div>
        </div>
      ) : (
        <div className="vstack stagger" style={{ gap: 14 }}>
          {issues.map((iss) => (
            <ComplaintCard
              key={iss.id}
              iss={iss}
              busy={busy === iss.id}
              onAnswer={(status) => answer(iss, status)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ComplaintCard({ iss, busy, onAnswer }) {
  const o = iss.order || {};
  const open = iss.status === 'OPEN';
  return (
    <div
      className="glass card reveal"
      style={{ borderLeft: `3px solid ${open ? 'var(--tomato)' : 'var(--ink-3)'}` }}
    >
      <div className="hstack" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="hstack" style={{ gap: 12 }}>
          <div className="stat__icon" style={{ margin: 0 }}>
            <IconAlert size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>
              {titleCase(String(iss.reason || 'OTHER').replace(/_/g, ' '))}
            </div>
            {/* Everything needed to act without opening the order: who, where, which delivery. */}
            <div className="muted" style={{ fontSize: 12.5 }}>
              {[
                o.orderNumber,
                o.customerName,
                [o.community, o.block, o.flat && `Flat ${o.flat}`].filter(Boolean).join(' · '),
              ]
                .filter(Boolean)
                .join(' — ')}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {[
                o.deliveredAt ? `Delivered ${when(o.deliveredAt)}` : null,
                `Reported ${when(iss.createdAt)}`,
                o.totalPaise != null ? inr(o.totalPaise) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
        </div>
        <span className={`badge ${open ? 'st-CANCELLED' : 'st-CONFIRMED'}`}>
          <span className="badge__dot" />
          {open ? 'Waiting on you' : titleCase(iss.status)}
        </span>
      </div>

      {iss.note && <div style={{ fontSize: 14, marginTop: 12 }}>{iss.note}</div>}

      {iss.photos?.length > 0 && (
        <div className="hstack" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {iss.photos.map((u) => (
            // Opens full size: a bruise or a short weight is often invisible in a thumbnail.
            <a key={u} href={u} target="_blank" rel="noreferrer">
              <img
                src={u}
                alt="Reported problem"
                loading="lazy"
                style={{
                  width: 104,
                  height: 104,
                  objectFit: 'cover',
                  borderRadius: 10,
                  border: '1px solid rgba(14,27,20,0.1)',
                }}
              />
            </a>
          ))}
        </div>
      )}

      {iss.resolution && (
        <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>
          {iss.resolution}
        </div>
      )}

      {open && (
        <div className="hstack" style={{ gap: 8, marginTop: 14 }}>
          <button
            className="btn btn--primary btn--sm"
            disabled={busy}
            onClick={() => onAnswer('RESOLVED')}
          >
            Put right
          </button>
          <button
            className="btn btn--ghost btn--sm"
            disabled={busy}
            onClick={() => onAnswer('DECLINED')}
          >
            Decline
          </button>
        </div>
      )}
    </div>
  );
}
