/**
 * Feedback — what customers tell us, in one place: star ratings with their comments, and the
 * complaints queue, and why people delete their account. /feedback opens on Reviews; /complaints
 * (the old address) opens on Complaints; /feedback?tab=… opens the others.
 *
 * Reviews: GET /admin/feedback/reviews?rating&unreplied, PUT /admin/feedback/reviews/:orderId with
 * { reply } or { hidden }. A reply is shown to the customer on their order.
 */
import { useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast, useResource } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { ErrorNote, Stat, TableSkeleton } from '../components/ui.jsx';
import { IconStar, IconUsers } from '../components/icons.jsx';
import {
  Bar,
  DateRange,
  SetupBanner,
  Tabs,
  sentence,
  useDateRange,
} from '../components/business.jsx';
import { dateTime } from '../lib/format.js';
import { ComplaintsPanel } from './Complaints.jsx';

const TABS = [
  { key: 'reviews', label: 'Order reviews' },
  { key: 'stores', label: 'App store reviews' },
  { key: 'complaints', label: 'Complaints' },
  { key: 'exits', label: 'Why people leave' },
];

export function Feedback() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const asked = params.get('tab');
  const tab =
    pathname === '/complaints'
      ? 'complaints'
      : TABS.some((x) => x.key === asked)
        ? asked
        : 'reviews';
  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Feedback</h1>
          <p className="page-sub">Ratings, comments and complaints, and why customers leave.</p>
        </div>
      </header>
      <SetupBanner />
      <Tabs
        tabs={TABS}
        value={tab}
        onChange={(k) =>
          navigate(
            k === 'complaints'
              ? '/complaints'
              : k === 'reviews'
                ? '/feedback'
                : `/feedback?tab=${k}`,
          )
        }
      />
      {tab === 'reviews' && <Reviews />}
      {tab === 'stores' && <StoreReviews />}
      {tab === 'complaints' && <ComplaintsPanel />}
      {tab === 'exits' && <Exits />}
    </>
  );
}

const NOT_CONNECTED = {
  apple:
    'Not connected. Add ASC_ISSUER_ID, ASC_KEY_ID and ASC_PRIVATE_KEY on Render, from an App Store Connect API key that can read reviews.',
  google:
    'Not connected. Add GOOGLE_PLAY_SERVICE_ACCOUNT_JSON on Render, from a service account allowed to see reviews in Play Console.',
};

/** Reviews published elsewhere: App Store and Google Play fetched hourly, others added by hand. */
function StoreReviews() {
  const [store, setStore] = useState('');
  const [rating, setRating] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const p = new URLSearchParams();
  if (store) p.set('store', store);
  if (rating) p.set('rating', rating);
  const { data, loading, error, reload } = useResource(
    `/admin/feedback/store-reviews${p.size ? `?${p}` : ''}`,
  );
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!data)
    return (
      <div className="glass card">
        <TableSkeleton rows={4} />
      </div>
    );

  async function sync() {
    setBusy(true);
    try {
      const { result } = await api.post('/admin/feedback/store-reviews/sync');
      const problem = Object.values(result).find((r) => r.error);
      const added = Object.values(result).reduce((n, r) => n + (r.added || 0), 0);
      if (problem) toast(problem.error, 'err');
      else if (!Object.keys(result).length) toast('No store is connected yet.', 'err');
      else toast(added ? `${added} new` : 'Up to date');
      reload();
    } catch (e) {
      toast(e.message || 'Could not check', 'err');
    } finally {
      setBusy(false);
    }
  }
  async function remove(r) {
    if (!confirm('Remove this review from the list?')) return;
    try {
      await api.del(`/admin/feedback/store-reviews/${encodeURIComponent(r.id)}`);
      reload();
    } catch (e) {
      toast(e.message || 'Could not remove', 'err');
    }
  }
  const auto = data.stores.filter((s) => !s.manual);
  const filters = data.stores.filter((s) => !s.manual || s.count > 0);

  return (
    <>
      <div className="stat-grid stagger" style={{ marginBottom: 16 }}>
        {auto.map((s) => (
          <Stat
            key={s.key}
            icon={<IconStar size={20} />}
            value={s.average == null ? '—' : `${s.average} ★`}
            label={`${s.label} · ${s.count} saved`}
            delta={
              s.error
                ? { kind: 'down', text: s.error }
                : s.connected
                  ? {
                      kind: 'flat',
                      text: s.lastSyncAt ? `Checked ${dateTime(s.lastSyncAt)}` : 'Connected',
                    }
                  : { kind: 'flat', text: 'Not connected' }
            }
          />
        ))}
      </div>
      {auto.some((s) => !s.connected) && (
        <div className="glass card" style={{ marginBottom: 16 }}>
          {auto
            .filter((s) => !s.connected)
            .map((s) => (
              <p key={s.key} style={{ fontSize: 13.5, lineHeight: 1.6 }}>
                <b>{s.label}:</b> {NOT_CONNECTED[s.key]}
              </p>
            ))}
        </div>
      )}
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <button className={`chip${store === '' ? ' is-active' : ''}`} onClick={() => setStore('')}>
          All
        </button>
        {filters.map((s) => (
          <button
            key={s.key}
            className={`chip${store === s.key ? ' is-active' : ''}`}
            onClick={() => setStore(s.key)}
          >
            {s.label}
          </button>
        ))}
        <select
          className="field__select"
          style={{ width: 130 }}
          value={rating}
          onChange={(e) => setRating(e.target.value)}
          aria-label="Stars"
        >
          <option value="">All stars</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} ★
            </option>
          ))}
        </select>
        <button className="btn btn--ghost btn--sm" onClick={sync} disabled={busy}>
          {busy ? 'Checking…' : 'Check now'}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Close' : 'Add one by hand'}
        </button>
      </div>
      {adding && (
        <AddReview
          stores={data.stores.filter((s) => s.manual)}
          onSaved={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
      {data.reviews.length === 0 ? (
        <div className="glass card">
          <div className="empty">No reviews here yet.</div>
        </div>
      ) : (
        <div className="vstack" style={{ gap: 14, opacity: loading ? 0.6 : 1 }}>
          {data.reviews.map((r) => (
            <div key={r.id} className="glass card">
              <div className="hstack" style={{ gap: 10, flexWrap: 'wrap' }}>
                <Stars n={r.rating} />
                <span className="pill">{r.storeLabel}</span>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {[r.author, r.country, r.version && `v${r.version}`, dateTime(r.at)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              {r.title && <p style={{ fontWeight: 600, marginTop: 8 }}>{r.title}</p>}
              {r.body && <p style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{r.body}</p>}
              {r.reply && (
                <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                  Our reply: {r.reply}
                </p>
              )}
              <div className="hstack" style={{ gap: 12, marginTop: 8 }}>
                {r.url && /^https:\/\//.test(r.url) && (
                  <a href={r.url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                )}
                {!auto.some((s) => s.key === r.store) && (
                  <button className="btn btn--ghost btn--sm" onClick={() => remove(r)}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="field__hint" style={{ marginTop: 12 }}>
        Google gives us only written reviews from the last seven days, so each is saved as it
        appears. Reply in App Store Connect or Play Console.
      </p>
    </>
  );
}

function AddReview({ stores, onSaved }) {
  const [f, setF] = useState({ store: 'maps', rating: 5, body: '', author: '', url: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function save() {
    if (!f.body.trim()) return toast('Write what the review says.', 'err');
    setBusy(true);
    try {
      await api.post('/admin/feedback/store-reviews', {
        store: f.store,
        rating: Number(f.rating),
        body: f.body.trim(),
        author: f.author.trim() || null,
        url: f.url.trim() || null,
      });
      toast('Review added');
      onSaved();
    } catch (e) {
      toast(e.message || 'Could not save', 'err');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="glass card" style={{ marginBottom: 14 }}>
      <div className="field__row">
        <div className="field">
          <label className="field__label">Where</label>
          <select className="field__select" value={f.store} onChange={set('store')}>
            {stores.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label">Stars</label>
          <select className="field__select" value={f.rating} onChange={set('rating')}>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} ★
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label className="field__label">What it says</label>
        <textarea
          className="field__input"
          rows={3}
          maxLength={2000}
          value={f.body}
          onChange={set('body')}
        />
      </div>
      <div className="field__row">
        <div className="field">
          <label className="field__label">Name shown (optional)</label>
          <input
            className="field__input"
            maxLength={80}
            value={f.author}
            onChange={set('author')}
          />
        </div>
        <div className="field">
          <label className="field__label">Link (optional)</label>
          <input
            className="field__input"
            maxLength={500}
            value={f.url}
            onChange={set('url')}
            placeholder="https://"
          />
        </div>
      </div>
      <button className="btn btn--primary" onClick={save} disabled={busy}>
        {busy ? 'Saving…' : 'Add review'}
      </button>
    </div>
  );
}

/** Why customers delete their account: the optional question in the app. Never who they were. */
function Exits() {
  const dr = useDateRange('30d');
  const { data, loading, error, reload } = useResource(
    `/admin/feedback/exits${dr.qs ? `?${dr.qs}` : ''}`,
  );
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  const max = Math.max(1, ...(data?.byReason || []).map((r) => r.count));
  return (
    <>
      <DateRange dr={dr} />
      {!data ? (
        <div className="glass card">
          <TableSkeleton rows={4} />
        </div>
      ) : (
        <div style={{ opacity: loading ? 0.6 : 1 }}>
          <div className="stat-grid stagger" style={{ marginBottom: 16 }}>
            <Stat icon={<IconUsers size={20} />} value={data.requests} label="Deletion requests" />
            <Stat icon={<IconStar size={20} />} value={data.answered} label="Told us why" />
            <Stat
              icon={<IconUsers size={20} />}
              value={data.skipped}
              label="Skipped or not asked"
            />
          </div>
          <div className="glass card reveal" style={{ marginBottom: 16 }}>
            <div className="card__head">
              <h2 className="card__title">Reasons</h2>
            </div>
            {data.byReason.map((r) => (
              <div key={r.key} className="hstack" style={{ gap: 10, padding: '5px 0' }}>
                <span style={{ width: 210, fontSize: 13 }}>{r.label}</span>
                <span style={{ flex: 1 }}>
                  <Bar pct={(r.count / max) * 100} tone="amber" />
                </span>
                <span className="num" style={{ width: 30, textAlign: 'right' }}>
                  {r.count}
                </span>
              </div>
            ))}
          </div>
          <div className="glass card reveal" style={{ padding: 0 }}>
            {data.recent.length === 0 ? (
              <div className="empty">No deletion requests in this range.</div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Reason</th>
                      <th>In their words</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((r) => (
                      <tr key={r.id}>
                        <td className="data__name">{dateTime(r.at)}</td>
                        <td>{r.reasonLabel || <span className="muted">No answer</span>}</td>
                        <td style={{ whiteSpace: 'normal', maxWidth: 420 }}>{r.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="field__hint" style={{ marginTop: 10 }}>
            The question is optional. What a customer wrote is removed when their account is erased;
            the reason stays as a count.
          </p>
        </div>
      )}
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
