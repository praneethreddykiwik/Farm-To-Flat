/**
 * Fulfilment board — the packing bench's live view.
 *  • Drag a card between columns to change its state (the same PATCH the buttons use), or use the
 *    one-tap advance button. Illegal moves (skipping a step) are refused with a toast.
 *  • Auto-listing: the board polls every few seconds, so an order placed in the app appears here on
 *    its own — new cards flash in. "Simulate incoming order" fabricates one to demo the flow until
 *    the customer app is pointed at this API.
 *  • Whatever state you set is stored + served by the API, so the customer app's tracking reflects
 *    it the moment it reads from here (USE_MOCKS=0). Tapping a card opens the full order drawer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast, useResource } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { ErrorNote } from '../components/ui.jsx';
import { IconDownload, IconPlus } from '../components/icons.jsx';
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
/** legal moves per column, mirroring the server state machine (drag may go forward or one step back) */
const ALLOWED = {
  CONFIRMED: ['PACKING'],
  PACKING: ['OUT_FOR_DELIVERY', 'CONFIRMED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'PACKING'],
  DELIVERED: [],
};
const POLL_MS = 6000;

export function Fulfilment() {
  const { data, loading, error, reload } = useResource('/admin/orders');
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [freshIds, setFreshIds] = useState(new Set());
  const [simulating, setSimulating] = useState(false);
  const [grouped, setGrouped] = useState(true);
  const knownIds = useRef(null);
  const dragging = useRef(false);

  const cols = useMemo(() => {
    const orders = data?.orders || [];
    const map = Object.fromEntries(COLUMNS.map((c) => [c.status, []]));
    for (const o of orders) if (map[o.status]) map[o.status].push(o);
    return map;
  }, [data]);

  // detect newly-arrived orders and flash them
  useEffect(() => {
    const orders = data?.orders;
    if (!orders) return;
    const ids = new Set(orders.map((o) => o.id));
    if (knownIds.current) {
      const fresh = [...ids].filter((id) => !knownIds.current.has(id));
      if (fresh.length) {
        setFreshIds(new Set(fresh));
        setTimeout(() => setFreshIds(new Set()), 2400);
      }
    }
    knownIds.current = ids;
  }, [data]);

  // live polling — paused while a drag is in progress so it can't yank a card mid-move
  useEffect(() => {
    const t = setInterval(() => {
      if (!dragging.current) reload();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [reload]);

  const move = useCallback(
    async (order, next) => {
      setBusy(order.id);
      try {
        await api.patch(`/admin/orders/${order.id}/status`, { status: next });
        toast(`${order.orderNumber} → ${titleCase(next)}`);
        reload();
      } catch (e) {
        toast(e.message || 'Could not update', 'err');
      } finally {
        setBusy(null);
      }
    },
    [reload],
  );

  function onDrop(targetStatus) {
    dragging.current = false;
    setOverCol(null);
    const order = (data?.orders || []).find((o) => o.id === dragId);
    setDragId(null);
    if (!order || order.status === targetStatus) return;
    if (!(ALLOWED[order.status] || []).includes(targetStatus)) {
      toast(`Can't move ${titleCase(order.status)} → ${titleCase(targetStatus)}`, 'err');
      return;
    }
    move(order, targetStatus);
  }

  /** Advance every order of one community (in one column) together — one action, one notification batch. */
  async function shipGroup(orders, next) {
    const ids = orders.map((o) => o.id);
    setBusy(`grp:${ids[0]}`);
    try {
      const r = await api.post('/admin/orders/advance', { orderIds: ids, status: next });
      toast(
        `${r.count} order${r.count !== 1 ? 's' : ''} → ${titleCase(next)} · ${r.notified} notified`,
      );
      reload();
    } catch (e) {
      toast(e.message || 'Could not advance', 'err');
    } finally {
      setBusy(null);
    }
  }

  const byCommunity = (arr) => {
    const m = {};
    for (const o of arr) (m[o.address?.communityName || '—'] ||= []).push(o);
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  };

  async function simulate() {
    setSimulating(true);
    try {
      const { order } = await api.post('/admin/orders/simulate');
      toast(`New order ${order.orderNumber} · ${order.customerName}`);
      reload();
    } catch (e) {
      toast(e.message || 'Could not simulate', 'err');
    } finally {
      setSimulating(false);
    }
  }

  function downloadPacking() {
    const a = document.createElement('a');
    a.href = api.url('/admin/orders/export.csv?type=packing');
    a.click();
    toast('Packing CSV exported');
  }

  const renderCard = (o, col) => (
    <div
      key={o.id}
      className={`ocard${dragId === o.id ? ' ocard--drag' : ''}${freshIds.has(o.id) ? ' ocard--fresh' : ''}`}
      draggable
      onDragStart={() => {
        dragging.current = true;
        setDragId(o.id);
      }}
      onDragEnd={() => {
        dragging.current = false;
        setDragId(null);
        setOverCol(null);
      }}
      onClick={() => setOpenId(o.id)}
    >
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
            move(o, col.next);
          }}
        >
          {busy === o.id ? '…' : col.nextLabel}
        </button>
      )}
    </div>
  );

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Fulfilment</h1>
          <p className="page-sub">
            Live board · drag a card between columns, or tap advance
            <span className="live-dot" title="Auto-refreshing" />
          </p>
        </div>
        <div className="topbar__actions">
          <button
            className={`chip${grouped ? ' is-active' : ''}`}
            onClick={() => setGrouped((v) => !v)}
            title="Group orders by community and ship each together"
          >
            Group by community
          </button>
          <button className="btn btn--ghost" onClick={simulate} disabled={simulating}>
            <IconPlus size={17} /> {simulating ? 'Adding…' : 'Simulate incoming order'}
          </button>
          <button className="btn btn--accent" onClick={downloadPacking}>
            <IconDownload size={17} /> Packing CSV
          </button>
        </div>
      </header>

      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="glass card">
          <div className="skeleton" style={{ height: 300 }} />
        </div>
      ) : (
        <div className="board">
          {COLUMNS.map((col) => (
            <div
              key={col.status}
              className={`glass board__col${overCol === col.status ? ' board__col--over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (overCol !== col.status) setOverCol(col.status);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget))
                  setOverCol((s) => (s === col.status ? null : s));
              }}
              onDrop={() => onDrop(col.status)}
            >
              <div className="board__colhead">
                <span className={`badge st-${col.status}`}>
                  <span className="badge__dot" />
                  {col.title}
                </span>
                <span className="board__count">{cols[col.status].length}</span>
              </div>

              {cols[col.status].length === 0 ? (
                <div className="board__empty">Drop here</div>
              ) : grouped ? (
                byCommunity(cols[col.status]).map(([community, orders]) => (
                  <div key={community} className="commgroup">
                    <div className="commgroup__head">
                      <span className="commgroup__name">
                        {community} <span className="muted">· {orders.length}</span>
                      </span>
                      {col.next && (
                        <button
                          className="btn btn--accent btn--sm"
                          disabled={busy === `grp:${orders[0].id}`}
                          onClick={() => shipGroup(orders, col.next)}
                          title={`Advance all ${orders.length} orders for ${community}`}
                        >
                          {busy === `grp:${orders[0].id}` ? '…' : `Ship all →`}
                        </button>
                      )}
                    </div>
                    {orders.map((o) => renderCard(o, col))}
                  </div>
                ))
              ) : (
                cols[col.status].map((o) => renderCard(o, col))
              )}
            </div>
          ))}
        </div>
      )}

      {openId && <OrderDrawer id={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </>
  );
}
