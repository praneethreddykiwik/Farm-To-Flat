/**
 * Fulfilment board — the packing bench's live view. Columns follow the fulfilment flow; each card
 * has a one-tap advance to the next state, and the whole board exports to a packing CSV. Tapping a
 * card opens the full order drawer (shared with the Orders screen).
 */
import { useMemo, useState } from 'react';
import { useResource, toast } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { ErrorNote } from '../components/ui.jsx';
import { IconDownload } from '../components/icons.jsx';
import { OrderDrawer } from './Orders.jsx';
import { inr, titleCase } from '../lib/format.js';

const COLUMNS = [
  { status: 'CONFIRMED', title: 'Confirmed', next: 'PACKING', nextLabel: 'Start packing' },
  { status: 'PACKING', title: 'Packing', next: 'OUT_FOR_DELIVERY', nextLabel: 'Out for delivery' },
  {
    status: 'OUT_FOR_DELIVERY',
    title: 'On the road',
    next: 'DELIVERED',
    nextLabel: 'Mark delivered',
  },
  { status: 'DELIVERED', title: 'Delivered', next: null },
];

export function Fulfilment() {
  const { data, loading, error, reload } = useResource('/admin/orders');
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(null);

  const cols = useMemo(() => {
    const orders = data?.orders || [];
    const map = Object.fromEntries(COLUMNS.map((c) => [c.status, []]));
    for (const o of orders) if (map[o.status]) map[o.status].push(o);
    return map;
  }, [data]);

  async function advance(o, next) {
    setBusy(o.id);
    try {
      await api.patch(`/admin/orders/${o.id}/status`, { status: next });
      toast(`${o.orderNumber} → ${titleCase(next)}`);
      reload();
    } catch (e) {
      toast(e.message || 'Could not update', 'err');
    } finally {
      setBusy(null);
    }
  }

  function downloadPacking() {
    const a = document.createElement('a');
    a.href = api.url('/admin/orders/export.csv?type=packing');
    a.click();
    toast('Packing CSV exported');
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Fulfilment</h1>
          <p className="page-sub">Live packing board · tap a card to advance it</p>
        </div>
        <button className="btn btn--accent" onClick={downloadPacking}>
          <IconDownload size={17} /> Packing list CSV
        </button>
      </header>

      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : loading ? (
        <div className="glass card">
          <div className="skeleton" style={{ height: 300 }} />
        </div>
      ) : (
        <div className="board">
          {COLUMNS.map((col) => (
            <div key={col.status} className="glass board__col">
              <div className="board__colhead">
                <span className={`badge st-${col.status}`}>
                  <span className="badge__dot" />
                  {col.title}
                </span>
                <span className="board__count">{cols[col.status].length}</span>
              </div>
              {cols[col.status].length === 0 ? (
                <div
                  className="muted"
                  style={{ fontSize: 12.5, padding: '18px 6px', textAlign: 'center' }}
                >
                  Nothing here.
                </div>
              ) : (
                cols[col.status].map((o) => (
                  <div key={o.id} className="ocard" onClick={() => setOpenId(o.id)}>
                    <div className="hstack" style={{ justifyContent: 'space-between' }}>
                      <span className="ocard__no">{o.orderNumber}</span>
                      <span className="rupee" style={{ fontSize: 13 }}>
                        {inr(o.totalPaise)}
                      </span>
                    </div>
                    <div className="ocard__name">{o.customerName}</div>
                    <div className="ocard__meta">
                      <span>
                        {o.address?.block} {o.address?.flat}
                      </span>
                      <span>
                        {o.itemCount} items · {titleCase(o.window)}
                      </span>
                    </div>
                    {col.next && (
                      <button
                        className="btn btn--primary btn--sm"
                        style={{ width: '100%', marginTop: 11 }}
                        disabled={busy === o.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          advance(o, col.next);
                        }}
                      >
                        {busy === o.id ? '…' : col.nextLabel}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      )}

      {openId && <OrderDrawer id={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </>
  );
}
