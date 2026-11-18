/**
 * Procurement → Buffer & wastage. Every product we buy for an order comes with a little extra (the
 * buffer %) for short weight and bruising. This tab shows what that extra cost, and lets the buying
 * team record, per product per delivery day, how much of the extra was USED and how much was
 * THROWN AWAY. After a few recorded days the API suggests a better buffer % for each product.
 *
 * API: GET /admin/procurement/wastage?from&to, PUT/DELETE /admin/procurement/wastage/:date/:productId
 */
import { useEffect, useMemo, useState } from 'react';
import { toast, usePager, useResource } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { ErrorNote, Pager, Stat, TableSkeleton } from '../components/ui.jsx';
import { IconBasket, IconRupee, IconTrash, IconTrend } from '../components/icons.jsx';
import {
  DateRange,
  SetupBanner,
  Tabs,
  n0,
  pctText,
  useDateRange,
} from '../components/business.jsx';
import { inr, noLead, num, shortDate } from '../lib/format.js';

const UNIT = { KG: 'kg', BUNCH: 'bunch', PIECE: 'pc', DOZEN: 'dozen', PACK: 'pack' };
const u = (unit) => UNIT[unit] || String(unit || '').toLowerCase();
const qty = (q, unit) => (q == null ? '—' : `${n0(q, 3)} ${u(unit)}`);

export function WastagePanel() {
  const dr = useDateRange('7d');
  const { data, loading, error, reload } = useResource(`/admin/procurement/wastage?${dr.qs}`);
  const [show, setShow] = useState('todo');
  const days = useMemo(() => data?.days || [], [data]);
  const shown = useMemo(
    () => (show === 'todo' ? days.filter((d) => !d.recorded) : days),
    [days, show],
  );
  const pager = usePager(shown, 30, `${show}|${dr.qs}`);

  return (
    <>
      <SetupBanner />
      <DateRange dr={dr} />
      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : !data ? (
        <div className="glass card">
          <TableSkeleton rows={5} />
        </div>
      ) : (
        <div className="vstack" style={{ gap: 16, opacity: loading ? 0.6 : 1 }}>
          <div className="stat-grid stagger">
            <Stat
              icon={<IconRupee size={20} />}
              tint="sprout"
              value={inr(data.totals.extraCostPaise)}
              label="Spent on the buffer (extra bought)"
            />
            <Stat
              icon={<IconBasket size={20} />}
              value={inr(data.totals.usedCostPaise)}
              label="Of it used"
            />
            <Stat
              icon={<IconTrash size={20} />}
              value={inr(data.totals.wastedCostPaise)}
              label="Of it thrown away"
            />
            <Stat
              icon={<IconTrend size={20} />}
              value={pctText(data.totals.wastedPctOfExtra)}
              label="Wasted, as a share of the extra"
              delta={{
                kind: 'flat',
                text: `Recorded on ${data.totals.recordedLines} of ${data.totals.lines} product-days`,
              }}
            />
          </div>

          <div className="glass card reveal" style={{ padding: 0 }}>
            <div className="card__head" style={{ padding: '18px 20px 0' }}>
              <h2 className="card__title" style={{ fontSize: 15 }}>
                By product
              </h2>
            </div>
            {data.perProduct.length === 0 ? (
              <div className="empty" style={{ padding: 28 }}>
                No deliveries in this range.
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="num">Buffer now</th>
                      <th className="num">Ordered</th>
                      <th className="num">Extra bought</th>
                      <th className="num">Extra cost</th>
                      <th className="num">Used</th>
                      <th className="num">Thrown away</th>
                      <th className="num">Wasted cost</th>
                      <th>Suggested buffer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perProduct.map((p) => {
                      const need = Math.max(0, data.minDaysForSuggestion - p.recordedDays);
                      return (
                        <tr key={p.productId}>
                          <td className="data__name" style={{ fontWeight: 600 }}>
                            {p.name}
                            <div className="muted" style={{ fontSize: 11.5, fontWeight: 400 }}>
                              recorded {p.recordedDays} of {p.days} days
                            </div>
                          </td>
                          <td className="num">{p.bufferPct}%</td>
                          <td className="num data__name">{qty(p.orderedQty, p.unit)}</td>
                          <td className="num data__name">{qty(p.extraQty, p.unit)}</td>
                          <td className="num">{inr(p.extraCostPaise)}</td>
                          <td className="num data__name">
                            {qty(p.usedQty, p.unit)}
                            <div className="muted">{pctText(p.usedPctOfExtra)} of extra</div>
                          </td>
                          <td className="num data__name">{qty(p.wastedQty, p.unit)}</td>
                          <td className="num">{inr(p.wastedCostPaise)}</td>
                          <td>
                            {p.suggestedBufferPct == null ? (
                              <span className="muted" style={{ fontSize: 12.5 }}>
                                needs {need} more {need === 1 ? 'day' : 'days'} recorded
                              </span>
                            ) : (
                              <span
                                className={`pill ${p.suggestedBufferPct < p.bufferPct ? 'pill--leaf' : p.suggestedBufferPct > p.bufferPct ? 'pill--amber' : ''}`}
                              >
                                {p.suggestedBufferPct}%
                                {p.suggestedBufferPct !== p.bufferPct && ` (now ${p.bufferPct}%)`}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="field__hint" style={{ padding: '0 16px 14px' }}>
              The suggestion is the worst recorded day’s real need plus 2 points, shown once a
              product has {data.minDaysForSuggestion} recorded days. Change a product’s buffer on
              the buy list.
            </p>
          </div>

          <div className="glass card reveal" style={{ padding: 0 }}>
            <div
              className="card__head"
              style={{ padding: '18px 20px 0', flexWrap: 'wrap', gap: 10 }}
            >
              <h2 className="card__title" style={{ fontSize: 15 }}>
                Record each day
              </h2>
              <Tabs
                tabs={[
                  {
                    key: 'todo',
                    label: 'Not recorded yet',
                    count: days.filter((d) => !d.recorded).length,
                  },
                  { key: 'all', label: 'All days', count: days.length },
                ]}
                value={show}
                onChange={setShow}
              />
            </div>
            <p className="field__hint" style={{ padding: '0 20px', marginTop: 0 }}>
              Of the <b>extra</b> bought for that day, enter how much went into orders (topping up
              short weight, replacing a bruised piece) and how much was thrown away, in the
              product’s own unit.
            </p>
            {shown.length === 0 ? (
              <div className="empty" style={{ padding: 28 }}>
                {show === 'todo'
                  ? 'Every day in this range is recorded.'
                  : 'No deliveries in this range.'}
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Delivery day</th>
                      <th>Product</th>
                      <th className="num">Ordered</th>
                      <th className="num">Extra bought</th>
                      <th>Extra used</th>
                      <th>Thrown away</th>
                      <th>Note</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {pager.slice.map((d) => (
                      <WastageRow key={`${d.date}:${d.productId}`} d={d} onChanged={reload} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pager {...pager} onPage={pager.setPage} />
          </div>
        </div>
      )}
    </>
  );
}

function WastageRow({ d, onChanged }) {
  const init = () => ({
    used: d.usedQty == null ? '' : String(d.usedQty),
    wasted: d.wastedQty == null ? '' : String(d.wastedQty),
    note: d.note || '',
  });
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  // Re-seed the boxes when the saved record changes (after a save or a clear).
  useEffect(() => setF(init()), [d.usedQty, d.wastedQty, d.note]);
  const dirty = JSON.stringify(f) !== JSON.stringify(init());
  const over = Number(f.used || 0) + Number(f.wasted || 0) > d.extraQty + 1e-9;

  async function save() {
    if (f.used === '' || f.wasted === '')
      return toast(
        'Enter both: how much was used and how much was thrown away (0 if none).',
        'err',
      );
    setBusy(true);
    try {
      await api.put(`/admin/procurement/wastage/${d.date}/${encodeURIComponent(d.productId)}`, {
        usedQty: Number(f.used),
        wastedQty: Number(f.wasted),
        note: f.note.trim() || null,
      });
      toast(`${d.name}, ${shortDate(d.date)}: recorded`);
      onChanged();
    } catch (e) {
      toast(e.message || 'Could not save', 'err');
    } finally {
      setBusy(false);
    }
  }
  async function clear() {
    if (!confirm(`Clear what was recorded for ${d.name} on ${shortDate(d.date)}?`)) return;
    setBusy(true);
    try {
      await api.del(`/admin/procurement/wastage/${d.date}/${encodeURIComponent(d.productId)}`);
      toast(`${d.name}, ${shortDate(d.date)}: cleared`);
      onChanged();
    } catch (e) {
      toast(e.message || 'Could not clear', 'err');
    } finally {
      setBusy(false);
    }
  }
  const unit = u(d.unit);
  return (
    <tr>
      <td className="data__name">{shortDate(d.date)}</td>
      <td style={{ fontWeight: 600, minWidth: 140 }}>
        {d.name}
        <div className="muted" style={{ fontSize: 11.5, fontWeight: 400 }}>
          buffer {d.bufferPct}% · extra cost {inr(d.extraCostPaise)}
        </div>
      </td>
      <td className="num data__name">{qty(d.orderedQty, d.unit)}</td>
      <td className="num data__name">
        <b>{qty(d.extraQty, d.unit)}</b>
        <div className="muted">of {qty(d.procureQty, d.unit)} bought</div>
      </td>
      <td>
        <span className="hstack" style={{ gap: 4 }}>
          <input
            className="field__input cell-input"
            inputMode="decimal"
            value={f.used}
            placeholder="0"
            aria-label={`${d.name} extra used, ${unit}`}
            onChange={(e) => setF((s) => ({ ...s, used: num(e.target.value, { max: 100000 }) }))}
          />
          <span className="muted" style={{ fontSize: 12 }}>
            {unit}
          </span>
        </span>
      </td>
      <td>
        <span className="hstack" style={{ gap: 4 }}>
          <input
            className="field__input cell-input"
            inputMode="decimal"
            value={f.wasted}
            placeholder="0"
            aria-label={`${d.name} thrown away, ${unit}`}
            onChange={(e) => setF((s) => ({ ...s, wasted: num(e.target.value, { max: 100000 }) }))}
          />
          <span className="muted" style={{ fontSize: 12 }}>
            {unit}
          </span>
        </span>
        {over && (
          <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 3 }}>
            More than the extra bought
          </div>
        )}
      </td>
      <td>
        <input
          className="field__input cell-input cell-input--wide"
          value={f.note}
          maxLength={200}
          placeholder="Optional"
          onChange={(e) => setF((s) => ({ ...s, note: noLead(e.target.value) }))}
        />
      </td>
      <td className="row-actions-cell">
        <div className="row-actions">
          {(dirty || !d.recorded) && (
            <button className="btn btn--primary btn--sm" onClick={save} disabled={busy || !dirty}>
              Save
            </button>
          )}
          {d.recorded && !dirty && (
            <>
              <span className="pill pill--leaf">Recorded</span>
              <button
                className="btn btn--ghost btn--icon"
                style={{ color: 'var(--tomato)' }}
                onClick={clear}
                disabled={busy}
                aria-label="Clear this record"
              >
                <IconTrash size={15} />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
