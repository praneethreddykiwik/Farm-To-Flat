/**
 * The fee lines and tax on every customer's bill.
 *
 * These numbers go straight onto real bills, so the screen is built around one idea: you should
 * never have to imagine what a change does. A ₹500 sample basket is priced live from the form as
 * you type, and the Save button tells you the rupee difference before you commit to it.
 *
 * Talks to GET/PUT /admin/charges. The PUT replaces the whole list rather than patching one field,
 * because reordering and deleting a fee are as ordinary as editing one — so the form holds the
 * entire list and saves it as a unit.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast, useResource } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { ErrorNote, TableSkeleton } from '../components/ui.jsx';
import { inr, toPaise, toRupees } from '../lib/format.js';

const SAMPLE_PAISE = 50000; // the ₹500 basket the preview prices

const blank = () => ({
  key: Math.random().toString(36).slice(2),
  justAdded: true,
  label: '',
  kind: 'FLAT',
  rupees: '',
  percent: '',
  taxable: true,
  enabled: true,
});

/** Server shape → form shape. */
const toForm = (c) => ({
  key: c.id,
  id: c.id,
  label: c.label,
  kind: c.kind,
  rupees: c.kind === 'FLAT' ? String(toRupees(c.valuePaise)) : '',
  percent: c.kind === 'PERCENT' ? String((c.valueBps || 0) / 100) : '',
  taxable: c.taxable !== false,
  enabled: c.enabled !== false,
});

/** Form shape → server shape. */
const toRule = (f) => ({
  id: f.id,
  label: f.label.trim(),
  kind: f.kind,
  taxable: f.taxable,
  enabled: f.enabled,
  ...(f.kind === 'FLAT'
    ? { valuePaise: toPaise(Number(f.rupees) || 0) }
    : { valueBps: Math.round((Number(f.percent) || 0) * 100) }),
});

/**
 * The same arithmetic the server does, so the preview is honest.
 *
 * Duplicating it here is a real risk — two implementations of one rule drift. It is accepted
 * deliberately and kept to these fifteen lines: the alternative is a round trip on every
 * keystroke, which would make the preview too slow to be the thing that catches a typo. The
 * server's figure is the one that counts, and it comes back on save.
 */
function previewBill({ subtotalPaise, deliveryPaise, rules, tax }) {
  const lines = [];
  if (deliveryPaise > 0)
    lines.push({ label: 'Delivery fee', amountPaise: deliveryPaise, taxable: true });
  for (const f of rules) {
    if (!f.enabled) continue;
    const amount =
      f.kind === 'PERCENT'
        ? Math.round((subtotalPaise * Math.round((Number(f.percent) || 0) * 100)) / 10000)
        : toPaise(Number(f.rupees) || 0);
    if (amount > 0)
      lines.push({ label: f.label.trim() || 'Fee', amountPaise: amount, taxable: f.taxable });
  }
  const fees = lines.reduce((s, l) => s + l.amountPaise, 0);
  const taxableFees = lines.reduce((s, l) => s + (l.taxable ? l.amountPaise : 0), 0);
  const on = tax.enabled;
  const taxGoods = on ? Math.round((subtotalPaise * tax.goodsRateBps) / 10000) : 0;
  const taxFees = on ? Math.round((taxableFees * tax.feeRateBps) / 10000) : 0;
  const taxTotal = taxGoods + taxFees;
  return { lines, fees, taxTotal, total: subtotalPaise + fees + taxTotal };
}

export function Charges() {
  const { data, loading, error, reload } = useResource('/admin/charges');
  const [rules, setRules] = useState([]);
  const [tax, setTax] = useState({
    enabled: false,
    label: 'GST',
    goodsRateBps: 0,
    feeRateBps: 1800,
  });
  const [deliveryPaise, setDeliveryPaise] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedTotal, setSavedTotal] = useState(null);

  useEffect(() => {
    if (!data) return;
    setRules((data.charges || []).map(toForm));
    setTax({
      enabled: false,
      label: 'GST',
      goodsRateBps: 0,
      feeRateBps: 1800,
      ...(data.tax || {}),
    });
    setDeliveryPaise(Number(data.deliveryChargePaise) || 0);
    setSavedTotal(Number(data.preview?.totalPaise) || null);
  }, [data]);

  const bill = useMemo(
    () => previewBill({ subtotalPaise: SAMPLE_PAISE, deliveryPaise, rules, tax }),
    [deliveryPaise, rules, tax],
  );

  const patch = (key, k) => (v) =>
    setRules((s) => s.map((r) => (r.key === key ? { ...r, [k]: v } : r)));

  const nameless = rules.some((r) => !r.label.trim());
  const dupes = (() => {
    const seen = new Set();
    return rules.some((r) => {
      const n = r.label.trim().toLowerCase();
      if (!n) return false;
      if (seen.has(n)) return true;
      seen.add(n);
      return false;
    });
  })();
  const badPercent = rules.some((r) => r.kind === 'PERCENT' && Number(r.percent) > 50);
  const blocked = nameless || dupes || badPercent;

  // What the change actually costs the customer, in rupees, before it is committed.
  const delta = savedTotal == null ? null : bill.total - savedTotal;

  async function save() {
    if (blocked) return;
    setSaving(true);
    try {
      const body = {
        charges: rules.map(toRule),
        tax: {
          enabled: tax.enabled,
          label: tax.label,
          goodsRateBps: tax.goodsRateBps,
          feeRateBps: tax.feeRateBps,
        },
      };
      const r = await api.put('/admin/charges', body);
      setSavedTotal(Number(r?.preview?.totalPaise) || null);
      toast('Bill updated — the app shows it on the next basket');
      reload();
    } catch (e) {
      toast(e.message || 'Could not save', 'err');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Fees &amp; tax</h1>
          <p className="page-sub">
            What appears on a customer&apos;s bill under the items. Changes apply to the next basket
            — orders already placed keep the bill they agreed to.
          </p>
        </div>
      </header>

      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : loading ? (
        <div className="glass">
          <TableSkeleton rows={4} />
        </div>
      ) : (
        <div className="grid-2">
          <div className="vstack" style={{ gap: 16, minWidth: 0 }}>
            {/* ── fee lines ─────────────────────────────────────────────── */}
            <div className="glass card reveal">
              <div className="card__head">
                <h2 className="card__title">Fee lines</h2>
                <button className="btn btn--ghost" onClick={() => setRules((s) => [...s, blank()])}>
                  + Add fee
                </button>
              </div>

              {rules.length === 0 ? (
                <p className="muted" style={{ fontSize: 13 }}>
                  No fees. The customer pays for the items and delivery, nothing else.
                </p>
              ) : (
                <div className="vstack" style={{ gap: 14 }}>
                  {rules.map((r) => (
                    <div
                      key={r.key}
                      className="vstack"
                      style={{
                        gap: 8,
                        padding: 12,
                        borderRadius: 10,
                        border: '1px solid var(--line)',
                        opacity: r.enabled ? 1 : 0.55,
                      }}
                    >
                      <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
                        <input
                          className="field__input"
                          style={{
                            flex: '2 1 180px',
                            // An empty name is the single reason a save is blocked, and the grey
                            // placeholder used to look exactly like a filled value — so people typed
                            // the amount, saw Save do nothing, and concluded it did not store. Flag
                            // the actual culprit field in red.
                            borderColor: !r.label.trim() ? 'var(--tomato)' : undefined,
                          }}
                          value={r.label}
                          maxLength={48}
                          autoFocus={r.justAdded}
                          placeholder="Name this fee (e.g. Platform fee)"
                          onChange={(e) => patch(r.key, 'label')(e.target.value)}
                        />
                        <select
                          className="field__input"
                          style={{ flex: '0 0 120px' }}
                          value={r.kind}
                          onChange={(e) => patch(r.key, 'kind')(e.target.value)}
                        >
                          <option value="FLAT">₹ fixed</option>
                          <option value="PERCENT">% of items</option>
                        </select>
                        {r.kind === 'FLAT' ? (
                          <input
                            className="field__input"
                            style={{ flex: '0 0 110px' }}
                            type="number"
                            min="0"
                            step="0.01"
                            value={r.rupees}
                            placeholder="14.99"
                            onChange={(e) => patch(r.key, 'rupees')(e.target.value)}
                          />
                        ) : (
                          <input
                            className="field__input"
                            style={{ flex: '0 0 110px' }}
                            type="number"
                            min="0"
                            max="50"
                            step="0.1"
                            value={r.percent}
                            placeholder="2.5"
                            onChange={(e) => patch(r.key, 'percent')(e.target.value)}
                          />
                        )}
                        <button
                          className="btn btn--ghost"
                          title="Remove this fee"
                          onClick={() => setRules((s) => s.filter((x) => x.key !== r.key))}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
                        <button
                          className={`chip${r.enabled ? ' is-active' : ''}`}
                          onClick={() => patch(r.key, 'enabled')(!r.enabled)}
                        >
                          {r.enabled ? 'Charging' : 'Paused'}
                        </button>
                        <button
                          className={`chip${r.taxable ? ' is-active' : ''}`}
                          onClick={() => patch(r.key, 'taxable')(!r.taxable)}
                          title="Whether tax is added on top of this fee"
                        >
                          {r.taxable ? `${tax.label} applies` : `No ${tax.label}`}
                        </button>
                        {r.kind === 'PERCENT' && Number(r.percent) > 50 && (
                          <span style={{ color: 'var(--tomato)', fontSize: 12 }}>
                            Must be 50% or less.
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {nameless && (
                <p className="field__hint" style={{ color: 'var(--tomato)' }}>
                  Every fee needs a name — it is printed on the customer&apos;s bill.
                </p>
              )}
              {dupes && (
                <p className="field__hint" style={{ color: 'var(--tomato)' }}>
                  Two fees share a name. The customer would see the same line twice.
                </p>
              )}
            </div>

            {/* ── tax ───────────────────────────────────────────────────── */}
            <div className="glass card reveal">
              <div className="card__head">
                <h2 className="card__title">Tax</h2>
                <button
                  className={`chip${tax.enabled ? ' is-active' : ''}`}
                  onClick={() => setTax((t) => ({ ...t, enabled: !t.enabled }))}
                >
                  {tax.enabled ? 'On' : 'Off'}
                </button>
              </div>

              <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>
                Two rates, and that is deliberate. Fresh unbranded vegetables, fruit and meat are
                nil-rated under Indian GST — 0%, not 18%. A platform or delivery fee is a service,
                at 18%. One flat rate would overcharge a basket of tomatoes and collect tax you have
                no business collecting. Check the current rates for anything packaged or branded you
                add to the catalogue.
              </p>

              <div className="hstack" style={{ gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
                <div className="field" style={{ flex: '0 0 130px' }}>
                  <label className="field__label">Label</label>
                  <input
                    className="field__input"
                    value={tax.label}
                    maxLength={24}
                    onChange={(e) => setTax((t) => ({ ...t, label: e.target.value }))}
                  />
                </div>
                <div className="field" style={{ flex: '0 0 150px' }}>
                  <label className="field__label">On items (%)</label>
                  <input
                    className="field__input"
                    type="number"
                    min="0"
                    max="50"
                    step="0.5"
                    value={tax.goodsRateBps / 100}
                    onChange={(e) =>
                      setTax((t) => ({
                        ...t,
                        goodsRateBps: Math.round((Number(e.target.value) || 0) * 100),
                      }))
                    }
                  />
                  <p className="field__hint">0 for fresh produce.</p>
                </div>
                <div className="field" style={{ flex: '0 0 150px' }}>
                  <label className="field__label">On fees (%)</label>
                  <input
                    className="field__input"
                    type="number"
                    min="0"
                    max="50"
                    step="0.5"
                    value={tax.feeRateBps / 100}
                    onChange={(e) =>
                      setTax((t) => ({
                        ...t,
                        feeRateBps: Math.round((Number(e.target.value) || 0) * 100),
                      }))
                    }
                  />
                  <p className="field__hint">18 for services.</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── live preview ────────────────────────────────────────────── */}
          <div
            className="glass card reveal"
            style={{ alignSelf: 'start', position: 'sticky', top: 16 }}
          >
            <div className="card__head">
              <h2 className="card__title">A ₹500 basket</h2>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
              Exactly what the customer would see.
            </p>

            <div className="vstack" style={{ gap: 6, marginTop: 10, fontSize: 14 }}>
              <Row label="Item total" value={inr(SAMPLE_PAISE)} />
              {bill.lines.map((l, i) => (
                <Row key={`${l.label}-${i}`} label={l.label} value={inr(l.amountPaise)} />
              ))}
              {bill.taxTotal > 0 && (
                <Row label={`${tax.label} (govt. taxes)`} value={inr(bill.taxTotal)} />
              )}
              <div style={{ borderTop: '1px solid var(--line)', margin: '6px 0' }} />
              <Row label="To pay" value={inr(bill.total)} strong />
            </div>

            {delta !== null && delta !== 0 && (
              <p
                className="field__hint"
                style={{ marginTop: 10, color: delta > 0 ? 'var(--tomato)' : 'var(--leaf)' }}
              >
                {delta > 0 ? '+' : '−'}
                {inr(Math.abs(delta))} per ₹500 basket versus what customers pay now.
              </p>
            )}

            <button
              className="btn btn--primary"
              style={{ width: '100%', marginTop: 12 }}
              disabled={saving || blocked}
              onClick={save}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {blocked && (
              // Say WHY the button is dead, next to the button — not only as a line up in the fee
              // list that the operator has already scrolled past. This is the difference between
              // "it won't save" and "nothing is stored".
              <p className="field__hint" style={{ marginTop: 8, color: 'var(--tomato)' }}>
                {nameless
                  ? 'Give every fee a name before saving — the red box above is empty.'
                  : dupes
                    ? 'Two fees share a name. Rename one before saving.'
                    : 'A percentage must be 50% or less.'}
              </p>
            )}
            <p className="field__hint" style={{ marginTop: 8 }}>
              Applies to the next basket. Orders already placed keep the bill they agreed to.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className="hstack" style={{ justifyContent: 'space-between', gap: 12 }}>
      <span
        style={{ color: strong ? 'var(--ink-1)' : 'var(--ink-3)', fontWeight: strong ? 700 : 400 }}
      >
        {label}
      </span>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: strong ? 700 : 500 }}>
        {value}
      </span>
    </div>
  );
}
