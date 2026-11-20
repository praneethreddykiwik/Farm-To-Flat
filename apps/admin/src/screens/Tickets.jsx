/**
 * Support tickets — problems or complaints customers raise about using the app (or the website),
 * as opposed to a problem with one delivery, which lives in Feedback → Complaints.
 *
 * Open ones first, because that is the job. Each ticket is a thread: the customer's words, the
 * team's replies, and the app version and phone it came from (so "the screen is blank" can be
 * reproduced). A reply reaches the customer's notification centre and phone at once.
 *
 * API: GET /admin/tickets?status=, PATCH /admin/tickets/:id { status?, reply? },
 *      DELETE /admin/tickets/:id. Admins and the owner only.
 */
import { useMemo, useState } from 'react';
import { toast, useResource } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { ErrorNote } from '../components/ui.jsx';
import { IconLifeBuoy, IconTrash } from '../components/icons.jsx';
import { dateTime } from '../lib/format.js';

const TABS = [
  { key: 'OPEN', label: 'New' },
  { key: 'IN_PROGRESS', label: 'In progress' },
  { key: 'RESOLVED', label: 'Resolved' },
  { key: 'CLOSED', label: 'Closed' },
  { key: '', label: 'All' },
];
const STATUS_LABEL = {
  OPEN: 'New',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};
const STATUS_CLASS = {
  OPEN: 'st-CANCELLED',
  IN_PROGRESS: 'st-PACKING',
  RESOLVED: 'st-CONFIRMED',
  CLOSED: 'st-DELIVERED',
};

export function Tickets() {
  const [tab, setTab] = useState('OPEN');
  const { data, loading, error, reload } = useResource(
    `/admin/tickets${tab ? `?status=${tab}` : ''}`,
  );
  const tickets = useMemo(() => data?.tickets || [], [data]);
  const counts = data?.counts || {};
  const waiting = (counts.OPEN || 0) + (counts.IN_PROGRESS || 0);

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Support tickets</h1>
          <p className="page-sub">
            Problems and complaints customers raise about using the app. Replies reach the customer
            in the app straight away. Problems with a delivery are under Feedback → Complaints.
          </p>
        </div>
      </header>

      <p className="muted" style={{ margin: '0 0 12px', fontSize: 13.5 }}>
        {!data
          ? ' '
          : waiting === 0
            ? 'Nothing is waiting on an answer.'
            : `${waiting} waiting on an answer.`}
      </p>

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
            {t.key && counts[t.key] ? ` · ${counts[t.key]}` : ''}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : loading ? (
        <div className="glass card">
          <div className="skeleton" style={{ height: 200 }} />
        </div>
      ) : tickets.length === 0 ? (
        <div className="glass card">
          <div className="empty">
            {tab === 'OPEN' ? 'No new tickets. Everything has been picked up.' : 'Nothing here.'}
          </div>
        </div>
      ) : (
        <div className="vstack stagger" style={{ gap: 14 }}>
          {tickets.map((tk) => (
            <TicketCard key={tk.id} tk={tk} onChanged={reload} />
          ))}
        </div>
      )}
    </>
  );
}

function TicketCard({ tk, onChanged }) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const open = tk.status === 'OPEN' || tk.status === 'IN_PROGRESS';
  const c = tk.customer || {};
  const ctx = tk.context || {};

  async function update(body, done) {
    setBusy(true);
    try {
      await api.patch(`/admin/tickets/${tk.id}`, body);
      toast(done);
      setReply('');
      onChanged();
    } catch (e) {
      toast(e.message || 'Could not update the ticket', 'err');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${tk.number}? The customer will no longer see it either.`)) return;
    setBusy(true);
    try {
      await api.del(`/admin/tickets/${tk.id}`);
      toast('Ticket deleted');
      onChanged();
    } catch (e) {
      toast(e.message || 'Could not delete the ticket', 'err');
      setBusy(false);
    }
  }

  return (
    <div
      className="glass card reveal"
      style={{ borderLeft: `3px solid ${open ? 'var(--tomato)' : 'var(--ink-3)'}` }}
    >
      <div className="hstack" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="hstack" style={{ gap: 12 }}>
          <div className="stat__icon" style={{ margin: 0 }}>
            <IconLifeBuoy size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>
              {tk.number} · {tk.categoryLabel}
            </div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {[c.name || 'Customer', c.mobileMasked].filter(Boolean).join(' · ')}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {[
                `Raised ${dateTime(tk.createdAt)}`,
                ctx.platform ? `${ctx.platform === 'ios' ? 'iPhone' : ctx.platform}` : null,
                ctx.appVersion ? `app ${ctx.appVersion}` : null,
                ctx.screen ? `on ${ctx.screen}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
        </div>
        <span className={`badge ${STATUS_CLASS[tk.status] || ''}`}>
          <span className="badge__dot" />
          {STATUS_LABEL[tk.status] || tk.status}
        </span>
      </div>

      <div className="vstack" style={{ gap: 8, marginTop: 14 }}>
        {tk.messages.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.from === 'TEAM' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              padding: '8px 12px',
              borderRadius: 12,
              background: m.from === 'TEAM' ? 'var(--leaf-soft, #E4F2EA)' : 'rgba(14,27,20,0.05)',
              fontSize: 14,
            }}
          >
            <div className="muted" style={{ fontSize: 11.5, marginBottom: 2 }}>
              {m.from === 'TEAM' ? `Team${m.actor ? ` (${m.actor})` : ''}` : 'Customer'} ·{' '}
              {dateTime(m.at)}
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
          </div>
        ))}
      </div>

      <textarea
        className="field__input"
        rows={2}
        placeholder="Write a reply — the customer sees it in the app"
        value={reply}
        maxLength={1000}
        onChange={(e) => setReply(e.target.value)}
        style={{ marginTop: 12, width: '100%', resize: 'vertical' }}
        aria-label={`Reply to ${tk.number}`}
      />
      <div className="hstack" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button
          className="btn btn--primary btn--sm"
          disabled={busy || !reply.trim()}
          onClick={() => update({ reply: reply.trim() }, 'Reply sent')}
        >
          Send reply
        </button>
        {open ? (
          <>
            <button
              className="btn btn--ghost btn--sm"
              disabled={busy}
              onClick={() =>
                update(
                  { status: 'RESOLVED', ...(reply.trim() ? { reply: reply.trim() } : {}) },
                  'Marked resolved',
                )
              }
            >
              {reply.trim() ? 'Reply and resolve' : 'Mark resolved'}
            </button>
            <button
              className="btn btn--ghost btn--sm"
              disabled={busy}
              onClick={() => update({ status: 'CLOSED' }, 'Closed')}
            >
              Close
            </button>
          </>
        ) : (
          <button
            className="btn btn--ghost btn--sm"
            disabled={busy}
            onClick={() => update({ status: 'OPEN' }, 'Reopened')}
          >
            Reopen
          </button>
        )}
        <button
          className="btn btn--ghost btn--sm"
          disabled={busy}
          onClick={remove}
          style={{ marginLeft: 'auto' }}
          aria-label={`Delete ${tk.number}`}
        >
          <IconTrash size={14} /> Delete
        </button>
      </div>
    </div>
  );
}
