/**
 * Procurement — the buy list. Every open order's items, grouped by product, so the operator knows
 * exactly how much to procure: ordered quantity + a per-item buffer (spoilage / trim / short-weight,
 * editable inline) rounded up to a purchase unit, with the cost of buying it. Filter to one delivery
 * date to build a single run's list, apply a run-level buffer override, tick items off as bought
 * (shared checklist), and export the purchase CSV. Also summarised by farm/source.
 */
import { useEffect, useState } from 'react';
import { toast, useResource } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { CountRupee, ErrorNote, TableSkeleton, Thumb } from '../components/ui.jsx';
import { IconCheck, IconDownload } from '../components/icons.jsx';
import { inr, num, shortDate } from '../lib/format.js';

const UNIT_SHORT = { KG: 'kg', BUNCH: 'bunch', PIECE: 'pc', DOZEN: 'dz', PACK: 'pack' };
const qty = (q, unit) =>
  `${Number(q).toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${UNIT_SHORT[unit] || ''}`;

const LANG_OPTS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिंदी · Hindi' },
  { code: 'te', label: 'తెలుగు · Telugu' },
];

export function Procurement() {
  const [date, setDate] = useState('all');
  const [override, setOverride] = useState(''); // run-level buffer override %
  const [editBuf, setEditBuf] = useState({});
  const [langMenu, setLangMenu] = useState(false);

  const params = new URLSearchParams();
  if (date !== 'all') params.set('date', date);
  if (override !== '' && Number(override) >= 0) params.set('bufferPct', override);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const { data, loading, error, reload } = useResource(`/admin/procurement${qs}`);

  // Cost-buffer approval — settings + the flagged buys awaiting a decision.
  const { data: settingsData, reload: reloadSettings } = useResource('/admin/procurement/settings');
  const settings = settingsData?.settings;
  const [bufPct, setBufPct] = useState('');
  const [autoApprove, setAutoApprove] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  useEffect(() => {
    if (settings) {
      setBufPct(String(settings.costBufferPct));
      setAutoApprove(!!settings.autoApprove);
    }
  }, [settings]);

  const {
    data: apprData,
    loading: apprLoading,
    error: apprError,
    reload: reloadApprovals,
  } = useResource('/admin/procurement/approvals');
  const approvals = apprData?.approvals || [];
  const apprCount = apprData?.count ?? approvals.length;
  const [deciding, setDeciding] = useState({});

  async function saveSettings(patch, msg) {
    setSavingSettings(true);
    try {
      const r = await api.patch('/admin/procurement/settings', patch);
      if (r?.settings) {
        setBufPct(String(r.settings.costBufferPct));
        setAutoApprove(!!r.settings.autoApprove);
      }
      toast(msg || 'Settings saved');
      reloadSettings();
    } catch (e) {
      toast(e.message || 'Could not save', 'err');
      if (settings) setAutoApprove(!!settings.autoApprove); // revert optimistic toggle
    } finally {
      setSavingSettings(false);
    }
  }
  function saveBuffer() {
    const n = Number(bufPct);
    if (!Number.isInteger(n) || n < 0 || n > 100)
      return toast('Enter a whole number between 0 and 100.', 'err');
    if (settings && n === Number(settings.costBufferPct)) return;
    saveSettings({ costBufferPct: n }, 'Buffer saved');
  }
  function toggleAutoApprove() {
    const next = !autoApprove;
    setAutoApprove(next); // optimistic — reverted on error
    saveSettings({ autoApprove: next }, next ? 'Auto-approve on' : 'Every buy needs approval');
  }

  async function decide(productId, decision) {
    setDeciding((s) => ({ ...s, [productId]: decision }));
    try {
      await api.post('/admin/procurement/approve', { productId, decision });
      toast(decision === 'APPROVE' ? 'Buy approved' : 'Buy rejected');
      reloadApprovals();
      reload();
    } catch (e) {
      toast(e.message || 'Could not update', 'err');
      setDeciding((s) => {
        const n = { ...s };
        delete n[productId];
        return n;
      });
    }
  }

  const varPct = (v) =>
    `${v > 0 ? '+' : ''}${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`;
  const varTint = (v) =>
    v > 0
      ? { bg: '#fbe3e1', fg: 'var(--tomato)' }
      : { bg: 'var(--leaf-soft)', fg: 'var(--leaf-deep)' };

  const dates = data?.dates || [];

  async function saveBuffer(productId, rawValue, currentPct) {
    setEditBuf((s) => {
      const n = { ...s };
      delete n[productId];
      return n;
    });
    const bufferPct = Number(rawValue);
    if (!Number.isFinite(bufferPct) || bufferPct < 0 || bufferPct > 100) return;
    if (bufferPct === Number(currentPct)) return;
    try {
      await api.patch(`/admin/products/${productId}`, { bufferPct });
      toast('Buffer updated');
      reload();
    } catch (e) {
      toast(e.message || 'Could not update', 'err');
    }
  }

  async function toggleProcured(productId, next) {
    try {
      await api.post('/admin/procurement/mark', {
        productId,
        date: date !== 'all' ? date : undefined,
        procured: next,
      });
      reload();
    } catch (e) {
      toast(e.message || 'Could not update', 'err');
    }
  }

  function downloadCsv(lang = 'en') {
    const p = new URLSearchParams(params);
    if (lang !== 'en') p.set('lang', lang);
    const a = document.createElement('a');
    a.href = api.url(`/admin/procurement/export.csv${p.toString() ? `?${p.toString()}` : ''}`);
    a.click();
    setLangMenu(false);
    toast(`Purchase list exported · ${LANG_OPTS.find((l) => l.code === lang).label.split(' ')[0]}`);
  }

  const overrideActive = data?.filters?.bufferOverride != null;

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Procurement</h1>
          <p className="page-sub">
            What to buy for the open orders · quantity + buffer, rounded to purchase units
          </p>
        </div>
        <div className="dropdown">
          <button className="btn btn--accent" onClick={() => setLangMenu((v) => !v)}>
            <IconDownload size={17} /> Purchase list CSV ▾
          </button>
          {langMenu && (
            <>
              <div className="dropdown__scrim" onClick={() => setLangMenu(false)} />
              <div className="dropdown__menu">
                <div className="dropdown__label">Download in</div>
                {LANG_OPTS.map((l) => (
                  <button
                    key={l.code}
                    className="dropdown__item"
                    onClick={() => downloadCsv(l.code)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </header>

      <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
        {/* cost-buffer approval settings */}
        <div className="glass card reveal">
          <div className="card__head">
            <h2 className="card__title" style={{ fontSize: 15 }}>
              Cost-buffer approval
            </h2>
          </div>
          <div className="field">
            <label className="field__label">
              Auto-approve within ±{bufPct === '' ? 0 : bufPct}% of the estimate
            </label>
            <div className="hstack" style={{ gap: 8 }}>
              <input
                className="field__input"
                type="number"
                min="0"
                max="100"
                inputMode="numeric"
                value={bufPct}
                onChange={(e) => setBufPct(num(e.target.value, { max: 100, integer: true }))}
                onKeyDown={(e) => e.key === 'Enter' && saveBuffer()}
                style={{ width: 110 }}
              />
              <span className="muted" style={{ fontSize: 13 }}>
                %
              </span>
              <button className="btn btn--primary" onClick={saveBuffer} disabled={savingSettings}>
                Save
              </button>
            </div>
          </div>
          <div className="field">
            <label className="field__label">Approval mode</label>
            <div>
              <button
                type="button"
                className={`chip${autoApprove ? ' is-active' : ''}`}
                onClick={toggleAutoApprove}
                disabled={savingSettings}
                title="Toggle auto-approve"
              >
                {autoApprove ? 'Auto-approve on' : 'Every buy needs approval'}
              </button>
            </div>
          </div>
          <p className="field__hint">
            If the price paid is within this band of the estimate, the buy is approved
            automatically. Outside it, it waits here for your approval.
          </p>
        </div>

        {/* buys awaiting approval */}
        <div className="glass card reveal">
          <div className="card__head">
            <h2 className="card__title" style={{ fontSize: 15 }}>
              Awaiting approval{apprCount ? ` · ${apprCount}` : ''}
            </h2>
          </div>
          {apprError ? (
            <ErrorNote error={apprError} onRetry={reloadApprovals} />
          ) : apprLoading ? (
            <TableSkeleton rows={3} />
          ) : approvals.length === 0 ? (
            <div className="empty">Nothing waiting — everything&rsquo;s within budget.</div>
          ) : (
            <div className="vstack" style={{ gap: 0 }}>
              {approvals.map((a, i) => {
                const tint = varTint(a.variancePct);
                const busy = deciding[a.productId];
                return (
                  <div
                    key={a.productId}
                    className="hstack"
                    style={{
                      justifyContent: 'space-between',
                      padding: '12px 0',
                      borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
                      gap: 10,
                    }}
                  >
                    <div>
                      <div className="hstack" style={{ gap: 8 }}>
                        <span style={{ fontWeight: 600 }}>{a.name}</span>
                        <span className="badge" style={{ background: tint.bg, color: tint.fg }}>
                          {varPct(a.variancePct)}
                        </span>
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                        <span className="rupee">{inr(a.estCostPaise)}</span> →{' '}
                        <span className="rupee">{inr(a.actualCostPaise)}</span>
                        {a.unit ? ` · ${a.unit}` : ''}
                      </div>
                    </div>
                    <div className="hstack" style={{ gap: 6 }}>
                      <button
                        className="btn btn--primary"
                        onClick={() => decide(a.productId, 'APPROVE')}
                        disabled={!!busy}
                      >
                        {busy === 'APPROVE' ? '…' : 'Approve'}
                      </button>
                      <button
                        className="btn btn--ghost"
                        onClick={() => decide(a.productId, 'REJECT')}
                        style={{ color: 'var(--tomato)' }}
                        disabled={!!busy}
                      >
                        {busy === 'REJECT' ? '…' : 'Reject'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {!loading && !error && data && (
        <section
          className="stat-grid stagger"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
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
            <div className="stat__value">
              {data.procuredCount}
              <span style={{ fontSize: 18, color: 'var(--ink-3)' }}> / {data.skuCount}</span>
            </div>
            <div className="stat__label">Bought so far</div>
            <div
              style={{
                height: 6,
                borderRadius: 6,
                background: 'rgba(14,27,20,0.06)',
                overflow: 'hidden',
                marginTop: 10,
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${data.skuCount ? (data.procuredCount / data.skuCount) * 100 : 0}%`,
                  background: 'linear-gradient(90deg, var(--leaf), var(--sprout-deep))',
                  borderRadius: 6,
                  transition: 'width 0.6s var(--ease-out)',
                }}
              />
            </div>
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
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 12.5 }}>
          Run buffer
        </span>
        <input
          className="buf-input"
          type="number"
          min="0"
          max="100"
          inputMode="numeric"
          placeholder="auto"
          value={override}
          onChange={(e) => setOverride(num(e.target.value, { max: 100, integer: true }))}
          style={{ width: 62 }}
        />
        <span className="muted" style={{ fontSize: 12 }}>
          %
        </span>
        {overrideActive && (
          <button className="chip is-active" onClick={() => setOverride('')} title="Clear override">
            override on ✕
          </button>
        )}
      </div>

      {!loading && !error && data && data.byCategory.length > 0 && (
        <p className="muted" style={{ fontSize: 12.5, margin: '-4px 2px 0', maxWidth: 720 }}>
          Tick each item as you buy it. <b>To procure</b> = ordered + buffer, rounded up to a whole
          purchase unit (kg in half-kilos) — buffer covers spoilage, trim and short weight.
        </p>
      )}

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
                        <th style={{ width: 40 }}></th>
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
                          <tr
                            key={it.productId}
                            style={it.procured ? { opacity: 0.55 } : undefined}
                          >
                            <td>
                              <button
                                className={`tick${it.procured ? ' tick--on' : ''}`}
                                onClick={() => toggleProcured(it.productId, !it.procured)}
                                title={it.procured ? 'Bought — click to undo' : 'Mark as bought'}
                                aria-label="Mark procured"
                              >
                                {it.procured && <IconCheck size={13} />}
                              </button>
                            </td>
                            <td>
                              <div className="prodcell">
                                <Thumb name={it.name} tint={g.tint} />
                                <div>
                                  <div
                                    className="prodcell__name"
                                    style={
                                      it.procured ? { textDecoration: 'line-through' } : undefined
                                    }
                                  >
                                    {it.name}
                                  </div>
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
                                  inputMode="numeric"
                                  value={editing ? editBuf[it.productId] : it.bufferPct}
                                  onChange={(e) =>
                                    setEditBuf((s) => ({
                                      ...s,
                                      [it.productId]: num(e.target.value, {
                                        max: 100,
                                        integer: true,
                                      }),
                                    }))
                                  }
                                  onBlur={(e) =>
                                    saveBuffer(it.productId, e.target.value, it.bufferPct)
                                  }
                                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                                  disabled={overrideActive}
                                  title={
                                    overrideActive
                                      ? 'Run override active — clear it to edit per item'
                                      : ''
                                  }
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
