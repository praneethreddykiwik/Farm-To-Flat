/**
 * Pricing & margins — the operator-only view (cost + margin never reach a customer). Edit price and
 * cost inline; margin recomputes live and a Save appears only for changed rows. A summary strip
 * shows the blended margin per category so Tharun can see where the money is.
 */
import { useMemo, useState } from 'react';
import { useResource, usePager, toast } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { ErrorNote, Pager, TableSkeleton, Thumb } from '../components/ui.jsx';
import { IconCheck } from '../components/icons.jsx';
import { inr, num, toPaise, toRupees } from '../lib/format.js';

export function Pricing() {
  const { data, loading, error, reload } = useResource('/admin/products');
  const [cat, setCat] = useState('all');
  const [edits, setEdits] = useState({}); // id -> { priceR, costR }

  const products = data?.products || [];
  const categories = data?.categories || [];

  const summary = useMemo(() => {
    const map = new Map();
    for (const p of products) {
      const cur = map.get(p.categoryId) || { name: p.categoryName, price: 0, cost: 0, n: 0 };
      cur.price += Number(p.pricePaise);
      cur.cost += Number(p.costPaise);
      cur.n += 1;
      map.set(p.categoryId, cur);
    }
    return [...map.values()].map((c) => ({
      ...c,
      marginPct: c.price > 0 ? Math.round(((c.price - c.cost) / c.price) * 1000) / 10 : 0,
    }));
  }, [products]);

  const shown = useMemo(
    () => (cat === 'all' ? products : products.filter((p) => p.categoryId === cat)),
    [products, cat],
  );
  const pager = usePager(shown, 25, cat);

  function edit(id, key, val, base) {
    setEdits((s) => {
      const cur = {
        priceR: toRupees(base.pricePaise),
        costR: toRupees(base.costPaise),
        ...s[id],
        [key]: val,
      };
      return { ...s, [id]: cur };
    });
  }

  async function save(p) {
    const e = edits[p.id];
    const pricePaise = toPaise(e.priceR);
    const costPaise = toPaise(e.costR);
    if (!(pricePaise > 0)) return toast('Price must be greater than zero.', 'err');
    try {
      await api.patch(`/admin/products/${p.id}`, { pricePaise, costPaise });
      toast(`${p.name} repriced`);
      setEdits((s) => {
        const n = { ...s };
        delete n[p.id];
        return n;
      });
      reload();
    } catch (err) {
      toast(err.message || 'Could not save', 'err');
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Pricing & margins</h1>
          <p className="page-sub">Operator-only. Customers never see cost or margin.</p>
        </div>
      </header>

      {!loading && !error && (
        <section
          className="stat-grid stagger"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
        >
          {summary.map((c) => (
            <div key={c.name} className="glass stat" style={{ padding: '14px 18px' }}>
              <div className="stat__label" style={{ marginTop: 0, marginBottom: 6 }}>
                {c.name}
              </div>
              <div className="stat__value" style={{ fontSize: 26 }}>
                {c.marginPct}%
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                {c.n} products · blended
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="toolbar" style={{ gap: 7 }}>
        <button
          className={`chip${cat === 'all' ? ' is-active' : ''}`}
          onClick={() => setCat('all')}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            className={`chip${cat === c.id ? ' is-active' : ''}`}
            onClick={() => setCat(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="glass" style={{ overflow: 'hidden' }}>
        {error ? (
          <ErrorNote error={error} onRetry={reload} />
        ) : loading ? (
          <TableSkeleton />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Product</th>
                  <th style={{ width: 130 }}>Cost (₹)</th>
                  <th style={{ width: 130 }}>Price (₹)</th>
                  <th style={{ textAlign: 'right' }}>Margin</th>
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {pager.slice.map((p) => {
                  const e = edits[p.id];
                  const priceR = e ? e.priceR : toRupees(p.pricePaise);
                  const costR = e ? e.costR : toRupees(p.costPaise);
                  const price = toPaise(priceR || 0);
                  const cost = toPaise(costR || 0);
                  const marginPct =
                    price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : 0;
                  const dirty =
                    !!e &&
                    (toPaise(e.priceR) !== Number(p.pricePaise) ||
                      toPaise(e.costR) !== Number(p.costPaise));
                  return (
                    <tr key={p.id}>
                      <td>
                        <div className="prodcell">
                          <Thumb name={p.name} image={p.image} tint={p.tint} />
                          <div>
                            <div className="prodcell__name">{p.name}</div>
                            <div className="prodcell__alias">
                              {p.categoryName} · {p.unit}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <input
                          className="field__input"
                          style={{ padding: '7px 10px', width: 84, minWidth: 84 }}
                          type="number"
                          min="0"
                          inputMode="decimal"
                          value={costR}
                          onChange={(ev) =>
                            edit(p.id, 'costR', num(ev.target.value, { max: 100000 }), p)
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="field__input"
                          style={{ padding: '7px 10px', width: 84, minWidth: 84 }}
                          type="number"
                          min="0"
                          inputMode="decimal"
                          value={priceR}
                          onChange={(ev) =>
                            edit(p.id, 'priceR', num(ev.target.value, { max: 100000 }), p)
                          }
                        />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span
                          className={`badge ${marginPct >= 20 ? 'st-CONFIRMED' : 'st-PENDING_PAYMENT'}`}
                        >
                          {marginPct}%
                        </span>
                        <div className="muted mono" style={{ fontSize: 11, marginTop: 3 }}>
                          {inr(price - cost)}
                        </div>
                      </td>
                      <td>
                        <button
                          className="btn btn--accent btn--sm"
                          disabled={!dirty}
                          onClick={() => save(p)}
                          style={{ opacity: dirty ? 1 : 0.4 }}
                        >
                          <IconCheck size={15} /> Save
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pager {...pager} onPage={pager.setPage} />
          </div>
        )}
      </div>
    </>
  );
}
