/**
 * UI primitives shared across screens: animated background, status badge, count-up number,
 * stat card, product thumbnail, drawer, toaster, and loading skeletons. Kept in one file so the
 * design language stays consistent and easy to tune.
 */
import { useEffect, useRef, useState } from 'react';
import { IconX } from './icons.jsx';
import { onToast } from '../lib/useApi.js';
import { inr, titleCase } from '../lib/format.js';

/** Aurora + grain background — fixed, behind everything. */
export function Background() {
  return (
    <div className="aurora" aria-hidden>
      <div className="aurora__blob aurora__blob--1" />
      <div className="aurora__blob aurora__blob--2" />
      <div className="aurora__blob aurora__blob--3" />
      <div className="aurora__grain" />
    </div>
  );
}

/** Status pill with a coloured dot; className drives the palette (.st-<STATUS>). */
export function StatusBadge({ status }) {
  return (
    <span className={`badge st-${status}`}>
      <span className="badge__dot" />
      {titleCase(status)}
    </span>
  );
}

/** Animate a number from 0 to `value` once, respecting reduced-motion. */
export function CountUp({
  value,
  format = (v) => Math.round(v).toLocaleString('en-IN'),
  duration = 900,
}) {
  const [n, setN] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return setN(value);
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(value * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);
  return <span>{format(n)}</span>;
}

/** Money count-up (paise in). */
export const CountRupee = ({ paise, decimals = 0 }) => (
  <CountUp value={Number(paise)} format={(v) => inr(v, { decimals })} />
);

export function Stat({ icon, value, label, delta, tint = 'leaf' }) {
  return (
    <div className="glass stat reveal">
      <div
        className="stat__icon"
        style={
          tint === 'sprout' ? { background: 'var(--sprout)', color: 'var(--night)' } : undefined
        }
      >
        {icon}
      </div>
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
      {delta && (
        <div className={`stat__delta stat__delta--${delta.kind || 'up'}`}>{delta.text}</div>
      )}
    </div>
  );
}

/** Product thumbnail — photo when available, else a tinted initial (mirrors the app). */
export function Thumb({ name, image, tint }) {
  const [broke, setBroke] = useState(false);
  if (image && !broke) {
    return (
      <img className="thumb" src={image} alt="" loading="lazy" onError={() => setBroke(true)} />
    );
  }
  return (
    <div className={`thumb thumb--ph tint-${tint || 'mint'}`} aria-hidden>
      {(name || '?').charAt(0)}
    </div>
  );
}

/** Right-hand slide-in drawer. */
export function Drawer({ title, subtitle, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="drawer__head">
          <div>
            <h3 className="card__title" style={{ fontSize: 20 }}>
              {title}
            </h3>
            {subtitle && <p className="page-sub">{subtitle}</p>}
          </div>
          <button className="btn btn--ghost btn--icon" onClick={onClose} aria-label="Close">
            <IconX size={18} />
          </button>
        </div>
        <div className="drawer__body">{children}</div>
        {footer && <div className="drawer__foot">{footer}</div>}
      </aside>
    </>
  );
}

/**
 * Global toast host — subscribes to the toast bus. The same message is shown ONCE while it's on
 * screen (repeated clicks on a failing "Add community" used to stack eight identical validation
 * toasts), and at most four toasts are visible at a time.
 */
export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(
    () =>
      onToast((t) => {
        let added = false;
        setItems((xs) => {
          if (xs.some((x) => x.message === t.message && x.kind === t.kind)) return xs;
          added = true;
          return [...xs, t].slice(-4);
        });
        // Only schedule removal for a toast that actually got shown.
        setTimeout(() => {
          if (added) setItems((xs) => xs.filter((x) => x.id !== t.id));
        }, 3200);
      }),
    [],
  );
  return (
    <div className="toast-host">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'err' ? 'toast--err' : ''}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

/**
 * Pagination footer for a table. Pairs with `usePager` from lib/useApi.js. Shows the visible range
 * and Prev / numbered pages / Next; hidden entirely when everything fits on one page.
 */
export function Pager({ page, pageCount, from, to, total, onPage }) {
  if (pageCount <= 1) return null;
  // Show up to 7 page numbers around the current one; ellipsis where pages are skipped.
  const pages = [];
  const lo = Math.max(1, page - 3);
  const hi = Math.min(pageCount, page + 3);
  if (lo > 1) pages.push(1, lo > 2 ? '…' : null);
  for (let i = lo; i <= hi; i += 1) pages.push(i);
  if (hi < pageCount) pages.push(hi < pageCount - 1 ? '…' : null, pageCount);
  return (
    <nav className="pager" aria-label="Pagination">
      <span className="pager__range muted">
        Showing {from}–{to} of {total}
      </span>
      <div className="pager__pages">
        <button
          className="btn btn--ghost btn--sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          ‹ Prev
        </button>
        {pages
          .filter((p) => p !== null)
          .map((p, i) =>
            p === '…' ? (
              <span key={`e${i}`} className="pager__gap muted">
                …
              </span>
            ) : (
              <button
                key={p}
                className={`pager__num${p === page ? ' is-active' : ''}`}
                onClick={() => onPage(p)}
                aria-current={p === page ? 'page' : undefined}
              >
                {p}
              </button>
            ),
          )}
        <button
          className="btn btn--ghost btn--sm"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          Next ›
        </button>
      </div>
    </nav>
  );
}

export function TableSkeleton({ rows = 6 }) {
  return (
    <div style={{ padding: 16 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ height: 44, marginBottom: 10, opacity: 1 - i * 0.08 }}
        />
      ))}
    </div>
  );
}

export function ErrorNote({ error, onRetry }) {
  return (
    <div className="glass card empty">
      <p style={{ fontWeight: 600, color: 'var(--tomato)' }}>Could not load</p>
      <p className="muted" style={{ marginTop: 6 }}>
        {error?.message || 'The API did not respond. Is @f2f/api running on :4000?'}
      </p>
      {onRetry && (
        <button className="btn btn--ghost btn--sm" style={{ marginTop: 14 }} onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
