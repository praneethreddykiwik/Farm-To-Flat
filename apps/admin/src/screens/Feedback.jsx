/**
 * Feedback — what customers tell us, in one place: star ratings with their comments, and the
 * complaints queue. /feedback opens on Reviews; /complaints (the old address) opens on Complaints.
 *
 * Reviews: GET /admin/feedback/reviews?rating&unreplied, PUT /admin/feedback/reviews/:orderId with
 * { reply } or { hidden }. A reply is shown to the customer on their order.
 */
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast, useResource } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { ErrorNote, Stat, TableSkeleton } from '../components/ui.jsx';
import { IconStar } from '../components/icons.jsx';
import { Bar, SetupBanner, Tabs, sentence } from '../components/business.jsx';
import { dateTime } from '../lib/format.js';
import { ComplaintsPanel } from './Complaints.jsx';

export function Feedback() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tab = pathname === '/complaints' ? 'complaints' : 'reviews';
  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Feedback</h1>
          <p className="page-sub">
            Ratings, comments and complaints from customers, after delivery.
          </p>
        </div>
      </header>
      <SetupBanner />
      <Tabs
        tabs={[
          { key: 'reviews', label: 'Reviews' },
          { key: 'complaints', label: 'Complaints' },
        ]}
        value={tab}
        onChange={(k) => navigate(k === 'complaints' ? '/complaints' : '/feedback')}
      />
      {tab === 'reviews' ? <Reviews /> : <ComplaintsPanel />}
    </>
  );
}

export const Stars = ({ n }) => (
  <span className="stars" aria-label={`${n} out of 5 stars`}>
    {'★'.repeat(n)}
    <span className="stars__off">{'★'.repeat(5 - n)}</span>
  </span>
);

function Reviews() {
  const [rating, setRating] = useState('');
  const [unreplied, setUnreplied] = useState(false);
  const params = new URLSearchParams();
  if (rating) params.set('rating', rating);
  if (unreplied) params.set('unreplied', '1');
  const qs = params.toString();
  const { data, loading, error, reload } = useResource(
    `/admin/feedback/reviews${qs ? `?${qs}` : ''}`,
  );

  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!data)
    return (
      <div className="glass card">
        <TableSkeleton rows={4} />
      </div>
    );
  const { totals, reviews } = data;
  const maxCount = Math.max(1, ...totals.byRating.map((r) => r.count));

  return (
    <>
      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="stat-grid stagger">
          <Stat
            icon={<IconStar size={20} />}
            tint="sprout"
            value={totals.average == null ? '—' : `${totals.average} ★`}
            label="Average rating"
          />
          <Stat icon={<IconStar size={20} />} value={totals.count} label="Ratings" />
          <Stat
            icon={<IconStar size={20} />}
            value={totals.unreplied}
            label="Not replied to"
            delta={totals.unreplied > 0 ? { kind: 'flat', text: 'Reply below' } : undefined}
          />
        </div>
        <div className="glass card reveal">
          <div className="card__head">
            <h2 className="card__title" style={{ fontSize: 15 }}>
              How they rated us
            </h2>
          </div>
          {totals.byRating.map((r) => (
            <button
              key={r.rating}
              type="button"
              className="hstack"
              onClick={() => setRating(rating === String(r.rating) ? '' : String(r.rating))}
              style={{
                width: '100%',
                gap: 10,
                padding: '5px 0',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                font: 'inherit',
                opacity: rating && rating !== String(r.rating) ? 0.45 : 1,
              }}
              title={`Show only ${r.rating}-star ratings`}
            >
              <span style={{ width: 34, fontSize: 13, fontWeight: 600 }}>{r.rating} ★</span>
              <span style={{ flex: 1 }}>
                <Bar
                  pct={(r.count / maxCount) * 100}
                  tone={r.rating <= 2 ? 'tomato' : r.rating === 3 ? 'amber' : 'leaf'}
                />
              </span>
              <span className="num" style={{ width: 30, textAlign: 'right' }}>
                {r.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 14 }}>
        {['', '5', '4', '3', '2', '1'].map((r) => (
          <button
            key={r || 'all'}
            className={`chip${rating === r ? ' is-active' : ''}`}
            onClick={() => setRating(r)}
          >
            {r ? `${r} ★` : 'All ratings'}
          </button>
        ))}
        <label className="check" style={{ marginLeft: 8 }}>
          <input
            type="checkbox"
            checked={unreplied}
            onChange={(e) => setUnreplied(e.target.checked)}
          />
          Only ones not replied to
        </label>
      </div>

      {reviews.length === 0 ? (
        <div className="glass card">
          <div className="empty">
            {totals.count === 0
              ? 'No ratings yet. Customers are asked to rate an order once it is delivered.'
              : 'No ratings match these filters.'}
          </div>
        </div>
      ) : (
        <div className="vstack stagger" style={{ gap: 14, opacity: loading ? 0.6 : 1 }}>
          {reviews.map((r) => (
            <ReviewCard key={r.orderId} r={r} onChanged={reload} />
          ))}
        </div>
      )}
    </>
  );
}

function ReviewCard({ r, onChanged }) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState(r.reply || '');
  const [busy, setBusy] = useState(false);

  async function put(body, msg) {
    setBusy(true);
    try {
      await api.put(`/admin/feedback/reviews/${encodeURIComponent(r.orderId)}`, body);
      toast(msg);
      setReplying(false);
      onChanged();
    } catch (e) {
      toast(e.message || 'Could not save', 'err');
    } finally {
      setBusy(false);
    }
  }
  function sendReply() {
    const t = text.trim();
    if (!t) return toast('Write a reply first.', 'err');
    put({ reply: t }, r.reply ? 'Reply updated' : 'Reply sent to the customer');
  }
  function removeReply() {
    if (!confirm('Remove this reply? The customer will no longer see it.')) return;
    setText('');
    put({ reply: null }, 'Reply removed');
  }

  const who =
    r.customer?.name || r.customer?.mobileMasked
      ? [r.customer.name, r.customer.mobileMasked].filter(Boolean).join(' · ')
      : 'Deleted account';
  return (
    <div className={`glass card reveal review${r.hidden ? ' review--hidden' : ''}`}>
      <div
        className="hstack"
        style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}
      >
        <div>
          <div className="hstack" style={{ gap: 10, flexWrap: 'wrap' }}>
            <Stars n={r.rating} />
            {r.hidden && <span className="pill">Hidden</span>}
            {r.tags.map((t) => (
              <span key={t} className="cust__tag">
                {sentence(t)}
              </span>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
            {[who, r.communityName, r.orderNumber, dateTime(r.at)].filter(Boolean).join(' — ')}
          </div>
        </div>
        <div className="hstack" style={{ gap: 6 }}>
          {!replying && (
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => setReplying(true)}
              disabled={busy}
            >
              {r.reply ? 'Edit reply' : 'Reply'}
            </button>
          )}
          <button
            className="btn btn--ghost btn--sm"
            disabled={busy}
            onClick={() =>
              put({ hidden: !r.hidden }, r.hidden ? 'Review shown again' : 'Review hidden')
            }
          >
            {r.hidden ? 'Unhide' : 'Hide'}
          </button>
        </div>
      </div>
      {r.comment ? (
        <div style={{ fontSize: 14.5, marginTop: 10 }}>{r.comment}</div>
      ) : (
        <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>
          No comment, just the rating.
        </div>
      )}
      {r.reply && !replying && (
        <div className="review__reply">
          <b>Our reply</b>
          <span className="muted" style={{ fontSize: 12 }}>
            {' '}
            · {r.repliedBy} · {dateTime(r.repliedAt)}
          </span>
          <div style={{ marginTop: 4 }}>{r.reply}</div>
        </div>
      )}
      {replying && (
        <div style={{ marginTop: 12 }}>
          <textarea
            className="field__input"
            value={text}
            maxLength={500}
            autoFocus
            placeholder="Thank them, or say what you have done about it. The customer sees this on their order."
            onChange={(e) => setText(e.target.value)}
          />
          <div className="hstack" style={{ gap: 8, marginTop: 8 }}>
            <button className="btn btn--primary btn--sm" onClick={sendReply} disabled={busy}>
              {busy ? 'Saving…' : r.reply ? 'Save reply' : 'Send reply'}
            </button>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setText(r.reply || '');
                setReplying(false);
              }}
            >
              Cancel
            </button>
            {r.reply && (
              <button
                className="btn btn--ghost btn--sm"
                style={{ color: 'var(--tomato)' }}
                onClick={removeReply}
                disabled={busy}
              >
                Remove reply
              </button>
            )}
            <span className="field__hint" style={{ margin: 0 }}>
              {text.length}/500
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
