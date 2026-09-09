/**
 * Coupons — create and manage discount codes. Codes are one of PERCENT (% off), FLAT (₹ off) or
 * FREE_ITEM (a free product). Money crosses the wire as integer paise; rupee inputs are converted
 * on submit. Talks to GET/POST/PATCH/DELETE /admin/coupons, and reads /admin/products to offer the
 * free-item dropdown. Coupons have no cost/margin — this screen never shows either.
 */
import { useState } from 'react';
import { toast, useResource } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { ErrorNote, TableSkeleton } from '../components/ui.jsx';
import { IconPlus, IconTicket, IconTrash } from '../components/icons.jsx';
import { inr, toPaise } from '../lib/format.js';

/** Discount types — the segmented picker mirrors Access's role picker. */
const TYPES = [
  { code: 'PERCENT', label: '% off', tint: { bg: 'var(--leaf-soft)', fg: 'var(--leaf-deep)' } },
  { code: 'FLAT', label: '₹ off', tint: { bg: '#d9ecfb', fg: '#1c5a8a' } },
  { code: 'FREE_ITEM', label: 'Free item', tint: { bg: '#ece4fb', fg: '#6a3fb0' } },
];
const TINT = Object.fromEntries(TYPES.map((t) => [t.code, t.tint]));

const emptyForm = {
  code: '',
  type: 'PERCENT',
  percentOff: '',
  valueR: '',
  freeProductId: '',
  minOrderR: '',
  label: '',
};

export function Coupons() {
  const { data, loading, error, reload } = useResource('/admin/coupons');
  const { data: prodData } = useResource('/admin/products');
  const coupons = data?.coupons || [];
  const products = prodData?.products || [];

  const [f, setF] = useState(emptyForm);
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function create() {
    setFormErr('');
    const code = f.code.trim().toUpperCase();
    if (!/^[A-Z0-9-]+$/.test(code)) return setFormErr('Code must be letters, numbers or dashes.');

    const body = {
      code,
      type: f.type,
      label: f.label.trim() || undefined,
      minOrderPaise: f.minOrderR ? toPaise(f.minOrderR) : 0,
    };
    if (f.type === 'PERCENT') {
      const pct = Number(f.percentOff);
      if (!Number.isInteger(pct) || pct < 1 || pct > 100)
        return setFormErr('Enter a whole % between 1 and 100.');
      body.percentOff = pct;
    } else if (f.type === 'FLAT') {
      const paise = toPaise(f.valueR || 0);
      if (!(paise > 0)) return setFormErr('Enter a rupee amount to take off.');
      body.valuePaise = paise;
    } else if (f.type === 'FREE_ITEM') {
      if (!f.freeProductId) return setFormErr('Pick a product to give free.');
      body.freeProductId = f.freeProductId;
    }

    setSaving(true);
    try {
      await api.post('/admin/coupons', body);
      toast(`Coupon ${code} created`);
      setF(emptyForm);
      reload();
    } catch (e) {
      if (e.code === 'CODE_TAKEN') setFormErr(`Code ${code} is already in use.`);
      else setFormErr(e.message || 'Could not create coupon.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c) {
    try {
      await api.patch(`/admin/coupons/${c.code}`, { isActive: !c.isActive });
      toast(c.isActive ? `${c.code} paused` : `${c.code} active`);
      reload();
    } catch (e) {
      toast(e.message || 'Could not update', 'err');
    }
  }

  async function remove(c) {
    if (!confirm(`Remove coupon ${c.code}?`)) return;
    try {
      await api.del(`/admin/coupons/${c.code}`);
      toast('Coupon removed');
      reload();
    } catch (e) {
      toast(e.message || 'Could not remove', 'err');
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Coupons</h1>
          <p className="page-sub">Discount codes customers can apply at checkout.</p>
        </div>
      </header>

      {/* create coupon */}
      <div className="glass card reveal">
        <div className="card__head">
          <h2 className="card__title">Create a coupon</h2>
        </div>

        <div className="field__row">
          <div className="field">
            <label className="field__label">Code</label>
            <input
              className="field__input mono"
              value={f.code}
              onChange={(e) =>
                setF((s) => ({
                  ...s,
                  code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''),
                }))
              }
              placeholder="FRESH10"
            />
          </div>
          <div className="field">
            <label className="field__label">Label (optional)</label>
            <input
              className="field__input"
              value={f.label}
              onChange={set('label')}
              placeholder="Welcome offer"
            />
          </div>
        </div>

        <div className="field">
          <label className="field__label">Discount type</label>
          <div className="seg">
            {TYPES.map((t) => (
              <button
                key={t.code}
                type="button"
                className={`seg__btn${f.type === t.code ? ' is-active' : ''}`}
                style={f.type === t.code ? { background: t.tint.bg, color: t.tint.fg } : undefined}
                onClick={() => setF((s) => ({ ...s, type: t.code }))}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field__row">
          {/* value field — changes with type */}
          {f.type === 'PERCENT' && (
            <div className="field">
              <label className="field__label">Percent off</label>
              <input
                className="field__input"
                type="number"
                min="1"
                max="100"
                value={f.percentOff}
                onChange={set('percentOff')}
                placeholder="10"
              />
              <p className="field__hint">Whole number, 1–100.</p>
            </div>
          )}
          {f.type === 'FLAT' && (
            <div className="field">
              <label className="field__label">Amount off (₹)</label>
              <input
                className="field__input"
                type="number"
                min="0"
                value={f.valueR}
                onChange={set('valueR')}
                placeholder="100"
              />
            </div>
          )}
          {f.type === 'FREE_ITEM' && (
            <div className="field">
              <label className="field__label">Free product</label>
              <select
                className="field__select"
                value={f.freeProductId}
                onChange={set('freeProductId')}
              >
                <option value="">Pick a product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label className="field__label">Minimum order (₹, optional)</label>
            <input
              className="field__input"
              type="number"
              min="0"
              value={f.minOrderR}
              onChange={set('minOrderR')}
              placeholder="0"
            />
            <p className="field__hint">Leave blank or 0 for no minimum.</p>
          </div>
        </div>

        <div className="hstack" style={{ justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 12.5, color: 'var(--tomato)' }}>{formErr}</span>
          <button className="btn btn--primary" onClick={create} disabled={saving}>
            <IconPlus size={17} /> {saving ? 'Creating…' : 'Create coupon'}
          </button>
        </div>
      </div>

      {/* existing coupons */}
      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : loading ? (
        <div className="glass">
          <TableSkeleton rows={4} />
        </div>
      ) : coupons.length === 0 ? (
        <div className="glass">
          <div className="empty">No coupons yet.</div>
        </div>
      ) : (
        <div className="glass card reveal">
          <div className="card__head">
            <h2 className="card__title" style={{ fontSize: 15 }}>
              <span className="hstack" style={{ gap: 8 }}>
                <IconTicket size={18} style={{ color: 'var(--ink-3)' }} />
                {coupons.length} {coupons.length === 1 ? 'coupon' : 'coupons'}
              </span>
            </h2>
          </div>
          <div className="vstack" style={{ gap: 0 }}>
            {coupons.map((c, i) => (
              <div
                key={c.code}
                className="hstack"
                style={{
                  justifyContent: 'space-between',
                  padding: '12px 0',
                  borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
                }}
              >
                <div>
                  <div className="hstack" style={{ gap: 8 }}>
                    <span className="mono" style={{ fontWeight: 600 }}>
                      {c.code}
                    </span>
                    <span
                      className="badge"
                      style={{
                        background: (TINT[c.type] || TINT.PERCENT).bg,
                        color: (TINT[c.type] || TINT.PERCENT).fg,
                      }}
                    >
                      {c.discountText}
                    </span>
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                    {c.label ? `${c.label} · ` : ''}
                    {c.minOrderPaise > 0 ? `Min ${inr(c.minOrderPaise)} · ` : ''}
                    {c.redeemedCount || 0}
                    {c.globalCap ? ` / ${c.globalCap}` : ''} redeemed
                  </div>
                </div>
                <div className="hstack" style={{ gap: 6 }}>
                  <button className="chip" onClick={() => toggleActive(c)} title="Toggle active">
                    {c.isActive ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    className="btn btn--ghost btn--icon"
                    onClick={() => remove(c)}
                    style={{ color: 'var(--tomato)' }}
                    aria-label="Remove"
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
