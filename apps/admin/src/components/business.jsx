/**
 * Pieces shared by the business-review screens (Growth, Weekly insights, Finance, Feedback, and the
 * buffer & wastage tab on Procurement): the one-time database banner, the date-range control, the
 * tab strip, and a couple of small formatters.
 */
import { useMemo, useState } from 'react';
import { toast, useResource } from '../lib/useApi.js';
import { IconCopy } from './icons.jsx';

// ── dates (IST business dates, YYYY-MM-DD) ──────────────────────────────────

/** Today in India, whatever the operator's laptop clock is set to. */
export const istToday = () => new Date(Date.now() + 330 * 60e3).toISOString().slice(0, 10);

/** "2026-11-19" + n days. */
export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const isoOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

export const RANGE_PRESETS = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'custom', label: 'Custom' },
];

/** The from/to a preset stands for, worked out from today in IST. */
export function presetRange(key) {
  const today = istToday();
  if (key === '7d') return { from: addDays(today, -6), to: today };
  if (key === '30d') return { from: addDays(today, -29), to: today };
  if (key === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
  if (key === 'lastMonth') {
    const lastOfPrev = addDays(`${today.slice(0, 8)}01`, -1);
    return { from: `${lastOfPrev.slice(0, 8)}01`, to: lastOfPrev };
  }
  return null; // 'all' or 'custom'
}

/**
 * Date-range state for a screen. `allowAll` adds an "All time" preset that sends no dates at all.
 * @param {string} [initial]
 */
export function useDateRange(initial = '30d') {
  const [preset, setPresetState] = useState(initial);
  const start = presetRange(initial === 'all' || initial === 'custom' ? '30d' : initial);
  const [custom, setCustom] = useState(start);
  const range = useMemo(() => {
    if (preset === 'all') return { from: null, to: null };
    if (preset === 'custom') return custom;
    return presetRange(preset);
  }, [preset, custom]);
  function setPreset(key) {
    // Switching to Custom starts from what was on screen, so the operator only nudges one end.
    if (key === 'custom' && range.from) setCustom({ from: range.from, to: range.to });
    setPresetState(key);
  }
  const valid = !range.from || (isoOk(range.from) && isoOk(range.to));
  // A custom "to" before "from" is sent as a one-day range rather than an error.
  const qs =
    range.from && valid
      ? `from=${range.from}&to=${range.to < range.from ? range.from : range.to}`
      : '';
  return { preset, setPreset, range, custom, setCustom, qs };
}

/** "8 Nov – 19 Nov 2026" */
export function rangeLabel(r) {
  if (!r?.from) return 'All time';
  const f = (iso, year) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: year ? 'numeric' : undefined,
      timeZone: 'UTC',
    });
  return r.from === r.to ? f(r.from, true) : `${f(r.from, false)} – ${f(r.to, true)}`;
}

/**
 * Preset chips + two date boxes for Custom, like a bank statement.
 * @param {{ dr: ReturnType<typeof useDateRange>, allowAll?: boolean }} props
 */
export function DateRange({ dr, allowAll = false }) {
  const presets = allowAll ? [{ key: 'all', label: 'All time' }, ...RANGE_PRESETS] : RANGE_PRESETS;
  return (
    <div className="daterange">
      {presets.map((p) => (
        <button
          key={p.key}
          type="button"
          className={`chip${dr.preset === p.key ? ' is-active' : ''}`}
          onClick={() => dr.setPreset(p.key)}
        >
          {p.label}
        </button>
      ))}
      {dr.preset === 'custom' ? (
        <span className="daterange__custom">
          <input
            type="date"
            className="field__input"
            aria-label="From"
            value={dr.custom.from}
            max={dr.custom.to || undefined}
            onChange={(e) =>
              e.target.value && dr.setCustom((c) => ({ ...c, from: e.target.value }))
            }
          />
          <span className="muted">to</span>
          <input
            type="date"
            className="field__input"
            aria-label="To"
            value={dr.custom.to}
            min={dr.custom.from || undefined}
            max={istToday()}
            onChange={(e) => e.target.value && dr.setCustom((c) => ({ ...c, to: e.target.value }))}
          />
        </span>
      ) : dr.range.from ? (
        <span className="muted daterange__label">{rangeLabel(dr.range)}</span>
      ) : null}
    </div>
  );
}

// ── tabs ────────────────────────────────────────────────────────────────────

/**
 * A row of tabs. `sheet` draws them like spreadsheet sheet tabs (used for product categories).
 * @param {{ tabs: {key:string,label:any,count?:number}[], value: string, onChange: (k:string)=>void, sheet?: boolean }} props
 */
export function Tabs({ tabs, value, onChange, sheet = false }) {
  return (
    <div className={sheet ? 'sheettabs' : 'tabbar'} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          className={
            sheet
              ? `sheettabs__tab${value === t.key ? ' is-active' : ''}`
              : `chip${value === t.key ? ' is-active' : ''}`
          }
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.count != null && <span className="chip__count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ── the one-time database step ──────────────────────────────────────────────

/**
 * Reads /admin/business/status. When the operating-records table is missing, every save on these
 * screens fails with SETUP_NEEDED, so say so up front, with the SQL to run. Screens still render
 * whatever they can read.
 */
export function SetupBanner() {
  const { data } = useResource('/admin/business/status');
  if (!data || data.ready !== false) return null;
  async function copy() {
    try {
      await navigator.clipboard.writeText(data.sql || '');
      toast('SQL copied');
    } catch {
      toast('Select the text and copy it by hand.', 'err');
    }
  }
  return (
    <div className="glass card reveal setup-banner" role="alert">
      <p style={{ fontWeight: 600, color: 'var(--tomato)', margin: 0 }}>
        One-time database step needed
      </p>
      <p className="muted" style={{ margin: '6px 0 0', maxWidth: 760 }}>
        The database has no table for these records yet, so nothing on this page can be saved —
        promoters, waitlist, expenses, reminders, wastage and replies included. Numbers worked out
        from orders still show. Whoever runs the database should run this once in the Supabase SQL
        editor; it is safe to run twice. Reload this page afterwards.
      </p>
      {data.sql && (
        <>
          <pre className="demand__sql">{data.sql}</pre>
          <button className="btn btn--ghost btn--sm" style={{ marginTop: 10 }} onClick={copy}>
            <IconCopy size={15} /> Copy SQL
          </button>
        </>
      )}
    </div>
  );
}

// ── small formatters ────────────────────────────────────────────────────────

/** 42.5 → "42.5%"; null → "—" */
export const pctText = (n) => (n == null || Number.isNaN(Number(n)) ? '—' : `${Number(n)}%`);

/** A number with Indian grouping and at most `d` decimals. */
export const n0 = (n, d = 1) =>
  n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: d });

/** Thin progress bar, 0–100. */
export function Bar({ pct, tone = 'leaf' }) {
  const w = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <div className={`pbar pbar--${tone}`} aria-hidden>
      <div className="pbar__fill" style={{ width: `${w}%` }} />
    </div>
  );
}

/** Sentence-case label from an enum key: "OUT_FOR_DELIVERY" → "Out for delivery". */
export const sentence = (s) => {
  const t = String(s || '')
    .toLowerCase()
    .replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Rupee text from a form field to integer paise, or null when it is not a usable amount. */
export function paiseFrom(text) {
  const clean = String(text ?? '')
    .replace(/[₹,\s]/g, '')
    .trim();
  if (clean === '' || !/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/** paise → rupee text for an input box ("3000" → "30"). */
export const rupeeInput = (paise) => {
  const n = Number(paise || 0) / 100;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};
