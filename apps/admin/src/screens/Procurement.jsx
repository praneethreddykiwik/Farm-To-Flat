/**
 * Procurement — the buy list. Every open order's items, grouped by product, so the operator knows
 * exactly how much to procure: ordered quantity + a per-item buffer (spoilage / trim / short-weight,
 * editable inline) rounded up to a purchase unit, with the cost of buying it. Filter to one delivery
 * date to build a single run's list; export it as a purchase CSV. Also summarised by farm/source.
 */
import { useMemo, useState } from 'react';
import { toast, useResource } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { CountRupee, ErrorNote, TableSkeleton, Thumb } from '../components/ui.jsx';
import { IconDownload } from '../components/icons.jsx';
import { inr, shortDate } from '../lib/format.js';

const UNIT_SHORT = { KG: 'kg', BUNCH: 'bunch', PIECE: 'pc', DOZEN: 'dz', PACK: 'pack' };
const qty = (q, unit) =>
  `${Number(q).toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${UNIT_SHORT[unit] || ''}`;

export function Procurement() {
  const [date, setDate] = useState('all');
  const [editBuf, setEditBuf] = useState({}); // productId -> string while editing
  const q = date !== 'all' ? `?date=${date}` : '';
  const { data, loading, error, reload } = useResource(`/admin/procurement${q}`);

  const dates = data?.dates || [];

  async function saveBuffer(productId, rawValue, currentPct) {
    setEditBuf((s) => {
      const n = { ...s };
      delete n[productId];
      return n;
    });
    const bufferPct = Number(rawValue);
    if (!Number.isFinite(bufferPct) || bufferPct < 0 || bufferPct > 100) return;
    if (bufferPct === Number(currentPct)) return; // unchanged
    try {
      await api.patch(`/admin/products/${productId}`, { bufferPct });
      toast('Buffer updated');
      reload();
    } catch (e) {
      toast(e.message || 'Could not update', 'err');
    }
  }

  function downloadCsv() {
    const a = document.createElement('a');
    a.href = api.url(`/admin/procurement/export.csv${q}`);
    a.click();
    toast('Purchase list exported');
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Procurement</h1>
          <p className="page-sub">
            What to buy for the open orders · quantity + buffer, rounded to purchase units
          </p>
        </div>
        <button className="btn btn--accent" onClick={downloadCsv}>
          <IconDownload size={17} /> Purchase list CSV
        </button>
      </header>

      {!loading && !error && data && (
        <section
          className="stat-grid stagger"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}
        >
          <div className="glass stat">
            <div className="stat__value">
              <CountRupee paise={data.totalProcureCostPaise} />
            </div>
            <div className="stat__label">Estimated to procure</div>
          </div>
          <div className="glass stat">
            <div className="stat__value">{data.skuCount}</div>
            <div className="stat__label">Distinct products</div>
          </div>
          <div className="glass stat">
            <div className="stat__value">{data.orderCount}</div>
            <div className="stat__label">Open orders covered</div>
          </div>
        </section>
      )}

      <div className="toolbar" style={{ gap: 7 }}>
        <span className="muted" style={{ fontSize: 12.5, marginRight: 4 }}>
          Delivery day
        </span>
        <button
          className={`chip${date === 'all' ? ' is-active' : ''}`}
          onClick={() => setDate('all')}
        >
          All open
        </button>
        {dates.map((d) => (
          <button
            key={d}
            className={`chip${date === d ? ' is-active' : ''}`}
            onClick={() => setDate(d)}
          >
            {shortDate(d)}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : loading ? (
        <div className="glass">
          <TableSkeleton />
        </div>
      ) : data.byCategory.length === 0 ? (
        <div className="glass card empty">No open orders to procure for.</div>
      ) : (
        <div className="grid-2" style={{ gridTemplateColumns: '1fr 300px', alignItems: 'start' }}>
          <div className="vstack" style={{ gap: 18 }}>
            {data.byCategory.map((g) => (
              <div key={g.categoryId} className="glass reveal" style={{ overflow: 'hidden' }}>
                <div
                  className="hstack"
                  style={{ justifyContent: 'space-between', padding: '14px 18px 10px' }}
                >
                  <h2 className="card__title" style={{ fontSize: 15 }}>
                    {g.name}
                  </h2>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {g.items.length} items · <span className="rupee">{inr(g.subtotalPaise)}</span>
                  </span>
                </div>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th style={{ textAlign: 'right' }}>Ordered</th>
                        <th style={{ textAlign: 'center', width: 90 }}>Buffer</th>
                        <th style={{ textAlign: 'right' }}>To procure</th>
                        <th style={{ textAlign: 'right' }}>Est. cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((it) => {
                        const editing = editBuf[it.productId] !== undefined;
                        return (
                          <tr key={it.productId}>
                            <td>
                              <div className="prodcell">
                                <Thumb name={it.name} tint={g.tint} />
                                <div>
                                  <div className="prodcell__name">{it.name}</div>
                                  <div className="prodcell__alias">
                                    {it.farm} · {it.orders} order{it.orders > 1 ? 's' : ''}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="num" style={{ textAlign: 'right' }}>
                              {qty(it.requiredQty, it.unit)}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span className="hstack" style={{ gap: 3, justifyContent: 'center' }}>
                                <input
                                  className="buf-input"
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={editing ? editBuf[it.productId] : it.bufferPct}
                                  onChange={(e) =>
                                    setEditBuf((s) => ({ ...s, [it.productId]: e.target.value }))
                                  }
                                  onBlur={(e) =>
                                    saveBuffer(it.productId, e.target.value, it.bufferPct)
                                  }
                                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                                />
                                <span className="muted" style={{ fontSize: 12 }}>
                                  %
                                </span>
                              </span>
                              <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>
                                +{qty(it.bufferQty, it.unit)}
                              </div>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span style={{ fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                                {qty(it.procureQty, it.unit)}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span className="rupee">{inr(it.procureCostPaise)}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          <div className="glass card reveal" style={{ position: 'sticky', top: 12 }}>
            <div className="card__head">
              <h2 className="card__title" style={{ fontSize: 15 }}>
                Spend by source
              </h2>
            </div>
            <div className="vstack" style={{ gap: 0 }}>
              {data.bySource.map((s, i) => {
                const max = Number(data.bySource[0].procureCostPaise) || 1;
                return (
                  <div
                    key={s.farm}
                    style={{
                      padding: '10px 0',
                      borderBottom:
                        i < data.bySource.length - 1 ? '1px solid var(--hairline)' : 'none',
                    }}
                  >
                    <div
                      className="hstack"
                      style={{ justifyContent: 'space-between', marginBottom: 6 }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{s.farm}</span>
                      <span className="rupee" style={{ fontSize: 13.5 }}>
                        {inr(s.procureCostPaise)}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 6,
                        background: 'rgba(14,27,20,0.06)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${(Number(s.procureCostPaise) / max) * 100}%`,
                          background: 'linear-gradient(90deg, var(--leaf), var(--sprout-deep))',
                          borderRadius: 6,
                        }}
                      />
                    </div>
                    <div className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>
                      {s.items} item{s.items > 1 ? 's' : ''}
                    </div>
                  </div>
                );
              })}
            </div>
            <div
              className="hstack"
              style={{
                justifyContent: 'space-between',
                marginTop: 14,
                paddingTop: 12,
                borderTop: '2px solid var(--hairline)',
              }}
            >
              <span style={{ fontWeight: 600, fontFamily: 'var(--font-display)' }}>Total</span>
              <span className="rupee" style={{ fontSize: 18 }}>
                {inr(data.totalProcureCostPaise)}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
