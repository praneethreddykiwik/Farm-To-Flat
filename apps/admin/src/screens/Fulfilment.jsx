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
  const [drag, setDrag] = useState(null); // { kind:'order'|'group', order?, orders?, community? }
  const [overCol, setOverCol] = useState(null);
  const [freshIds, setFreshIds] = useState(new Set());
  const [simulating, setSimulating] = useState(false);
  const [grouped, setGrouped] = useState(true);
  const knownIds = useRef(null);
  const dragging = useRef(false);
  const longPressTimer = useRef(null);
  const touchStart = useRef(null);
  const suppressClick = useRef(false);
  const [touchPicked, setTouchPicked] = useState(false);

  // Long-press touch fallback: HTML5 drag-and-drop (draggable + onDragStart) never fires on a
  // touchscreen, so mobile only had the one-tap "advance" button (forward-only). Long-press a card
  // to pick it up into the same `drag` state the mouse path uses, then tap a column to drop it.
  const startLongPress = useCallback((e, payload) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      dragging.current = true;
      suppressClick.current = true;
      setDrag(payload);
      setTouchPicked(true);
      if (navigator.vibrate) navigator.vibrate(15);
    }, 420);
  }, []);
  const cancelPickup = useCallback(() => {
    dragging.current = false;
    setDrag(null);
    setTouchPicked(false);
    setOverCol(null);
  }, []);
  const moveTouch = useCallback((e) => {
    if (!touchStart.current || !longPressTimer.current) return;
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - touchStart.current.x);
    const dy = Math.abs(t.clientY - touchStart.current.y);
    if (dx > 12 || dy > 12) clearTimeout(longPressTimer.current);
  }, []);
  const endTouch = useCallback(() => {
    clearTimeout(longPressTimer.current);
    touchStart.current = null;
  }, []);

  const cols = useMemo(() => {
    const orders = data?.orders || [];
    const map = Object.fromEntries(COLUMNS.map((c) => [c.status, []]));
    for (const o of orders) if (map[o.status]) map[o.status].push(o);
    return map;
  }, [data]);

  // Cancellation requests can come from any stage — filter on the boolean, not on status. But a
  // request on an order that is already CANCELLED or DELIVERED is settled: the board used to keep
  // offering Approve on delivered orders, and approving one would have refunded goods the customer
  // already has. Same predicate the Orders screen uses, so the two counts agree.
  const cancelReqs = useMemo(
    () =>
      (data?.orders || []).filter(
        (o) => o.cancelRequested === true && !['CANCELLED', 'DELIVERED'].includes(o.status),
      ),
    [data],
  );

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
    setTouchPicked(false);
    const payload = drag;
    setDrag(null);
    if (!payload) return;
    const items = payload.kind === 'group' ? payload.orders : [payload.order];
    const from = items[0]?.status;
    if (!from || from === targetStatus) return;
    if (!(ALLOWED[from] || []).includes(targetStatus)) {
      toast(`Can't move ${titleCase(from)} → ${titleCase(targetStatus)}`, 'err');
      return;
    }
    if (payload.kind === 'group') shipGroup(payload.orders, targetStatus);
    else move(payload.order, targetStatus);
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

  /** Approve or decline a cancellation request. Approve → CANCELLED (server refunds + releases coupon). */
  async function decideCancel(order, decision) {
    setBusy(`cancel:${order.id}`);
    try {
      await api.post(`/admin/orders/${order.id}/cancel-decision`, { decision });
      toast(decision === 'APPROVE' ? 'Cancellation approved' : 'Request declined');
      reload();
    } catch (e) {
      toast(e.message || 'Could not update', 'err');
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

  async function downloadPacking() {
    const day = new Date().toISOString().slice(0, 10);
    try {
      await api.download('/admin/orders/export.xlsx?type=packing', `f2f-packing-${day}.xlsx`);
      toast('Packing sheet exported');
    } catch (e) {
      toast(e.message || 'Could not export', 'err');
    }
  }

  const renderCard = (o, col) => (
    <div
      key={o.id}
      className={`ocard${drag?.order?.id === o.id ? (touchPicked ? ' ocard--picked' : ' ocard--drag') : ''}${freshIds.has(o.id) ? ' ocard--fresh' : ''}`}
      draggable
      onDragStart={() => {
        dragging.current = true;
        setDrag({ kind: 'order', order: o });
      }}
      onDragEnd={() => {
        dragging.current = false;
        setDrag(null);
        setOverCol(null);
      }}
      onTouchStart={(e) => startLongPress(e, { kind: 'order', order: o })}
      onTouchMove={moveTouch}
      onTouchEnd={endTouch}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        if (drag) return; // a different card is picked up — this tap targets the column, not this card
        setOpenId(o.id);
      }}
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
            if (drag) return; // a card is picked up — this tap targets the column, not this button
            move(o, col.next);
          }}
        >
          {busy === o.id ? '…' : col.nextLabel}
        </button>
      )}
    </div>
  );

  /** One community collapsed into a single draggable card — drag it to advance the whole community. */
  const renderGroupCard = (community, orders, col) => {
    const total = orders.reduce((s, o) => s + Number(o.totalPaise), 0);
    const items = orders.reduce((s, o) => s + o.itemCount, 0);
    const isBusy = busy === `grp:${orders[0].id}`;
    const isDragging =
      drag?.kind === 'group' &&
      drag.community === community &&
      drag.orders[0]?.status === col.status;
    const groupPayload = { kind: 'group', community, orders };
    return (
      <div
        key={community}
        className={`ocard commcard${isDragging ? (touchPicked ? ' ocard--picked' : ' ocard--drag') : ''}`}
        draggable
        onDragStart={() => {
          dragging.current = true;
          setDrag(groupPayload);
        }}
        onDragEnd={() => {
          dragging.current = false;
          setDrag(null);
          setOverCol(null);
        }}
        onTouchStart={(e) => startLongPress(e, groupPayload)}
        onTouchMove={moveTouch}
        onTouchEnd={endTouch}
      >
        <div
          className="hstack"
          style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <span className="commcard__name">{community}</span>
          <span className="commcard__badge">{orders.length}</span>
        </div>
        <div className="ocard__meta" style={{ marginTop: 4 }}>
          <span>
            {orders.length} order{orders.length !== 1 ? 's' : ''} · {items} items
          </span>
          <span className="rupee">{inr(total)}</span>
        </div>
        <div className="commcard__list">
          {orders.slice(0, 4).map((o) => (
            <button
              key={o.id}
              className="commcard__row"
              onClick={() => {
                if (drag) return; // a card is picked up — this tap targets the column, not this row
                setOpenId(o.id);
              }}
            >
              <span>
                {o.address?.block} {o.address?.flat}
              </span>
              <span className="muted mono">{o.orderNumber}</span>
            </button>
          ))}
          {orders.length > 4 && (
            <div className="muted commcard__more">+{orders.length - 4} more</div>
          )}
        </div>
        {col.next && (
          <button
            className="btn btn--accent btn--sm"
            style={{ width: '100%', marginTop: 10 }}
            disabled={isBusy}
            onClick={() => {
              if (drag) return; // a card is picked up — this tap targets the column, not this button
              shipGroup(orders, col.next);
            }}
          >
            {isBusy ? '…' : `Ship all → ${titleCase(col.next)}`}
          </button>
        )}
      </div>
    );
  };

  /** A cancellation-request card — an action list item, not a drag target. */
  const renderCancelCard = (o) => {
    const isBusy = busy === `cancel:${o.id}`;
    return (
      <div key={o.id} className="ocard ocard--cancel" onClick={() => setOpenId(o.id)}>
        <div className="hstack" style={{ justifyContent: 'space-between' }}>
          <span className="ocard__no">{o.orderNumber}</span>
          <span className="rupee" style={{ fontSize: 13 }}>
            {inr(o.totalPaise)}
          </span>
        </div>
        <div className="ocard__name">{o.customerName}</div>
        <div className="ocard__meta">
          <span>
            {o.address?.communityName} · {o.address?.block} {o.address?.flat}
          </span>
        </div>
        <div className="hstack" style={{ marginTop: 8 }}>
          <span className={`badge st-${o.status}`} style={{ fontSize: 11 }}>
            <span className="badge__dot" />
            {titleCase(o.status)}
          </span>
        </div>
        {o.cancelReason && (
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Reason: {o.cancelReason}
          </div>
        )}
        <div className="hstack" style={{ gap: 8, marginTop: 11, width: '100%' }}>
          <button
            className="btn btn--primary btn--sm"
            style={{
              flex: 2,
              minWidth: 0,
              justifyContent: 'center',
              background: 'var(--tomato)',
              boxShadow: 'none',
            }}
            disabled={isBusy}
            onClick={(e) => {
              e.stopPropagation();
              decideCancel(o, 'APPROVE');
            }}
          >
            {isBusy ? '…' : 'Approve'}
          </button>
          <button
            className="btn btn--sm"
            style={{
              flex: 1,
              minWidth: 0,
              justifyContent: 'center',
              color: 'var(--ink)',
              background: 'var(--panel, #fff)',
              border: '1px solid var(--line)',
              boxShadow: 'none',
            }}
            disabled={isBusy}
            onClick={(e) => {
              e.stopPropagation();
              decideCancel(o, 'DECLINE');
            }}
          >
            Decline
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Fulfilment</h1>
          <p className="page-sub">
            {grouped
              ? 'Each community is one card — drag (or long-press, then tap a column) to ship it'
              : 'Live board · drag a card between columns, long-press on mobile, or tap advance'}
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
          {/* Demo helper only — the API refuses it in production, so don't show it there either. */}
          {import.meta.env.DEV && (
            <button className="btn btn--ghost" onClick={simulate} disabled={simulating}>
              <IconPlus size={17} /> {simulating ? 'Adding…' : 'Simulate incoming order'}
            </button>
          )}
          <button className="btn btn--accent" onClick={downloadPacking}>
            <IconDownload size={17} /> Packing sheet
          </button>
        </div>
      </header>

      {touchPicked && drag && (
        <div className="pickup-banner">
          <span>
            {drag.kind === 'group' ? drag.community : drag.order.orderNumber} picked up — tap a
            highlighted column to move it
          </span>
          <button onClick={cancelPickup}>Cancel</button>
        </div>
      )}

      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="glass card">
          <div className="skeleton" style={{ height: 300 }} />
        </div>
      ) : (
        <div className="board">
          {(() => {
            const pickedFrom = drag
              ? drag.kind === 'group'
                ? drag.orders[0]?.status
                : drag.order.status
              : null;
            const validTargets = pickedFrom ? ALLOWED[pickedFrom] || [] : [];
            return COLUMNS.map((col) => (
              <div
                key={col.status}
                className={`glass board__col${overCol === col.status ? ' board__col--over' : ''}${touchPicked && validTargets.includes(col.status) ? ' board__col--target' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overCol !== col.status) setOverCol(col.status);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget))
                    setOverCol((s) => (s === col.status ? null : s));
                }}
                onDrop={() => onDrop(col.status)}
                onClick={() => {
                  if (touchPicked && drag) onDrop(col.status);
                }}
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
                  byCommunity(cols[col.status]).map(([community, orders]) =>
                    renderGroupCard(community, orders, col),
                  )
                ) : (
                  cols[col.status].map((o) => renderCard(o, col))
                )}
              </div>
            ));
          })()}

          {/* Cancellation requests — always the final stack, flat list, not a drag target */}
          <div className="glass board__col board__col--cancel">
            <div className="board__colhead">
              <span className="badge st-CANCELLED">
                <span className="badge__dot" />
                Cancellation requests
              </span>
              <span className="board__count">{cancelReqs.length}</span>
            </div>
            {cancelReqs.length === 0 ? (
              <div className="board__empty">No requests</div>
            ) : (
              cancelReqs.map((o) => renderCancelCard(o))
            )}
          </div>
        </div>
      )}

      {openId && <OrderDrawer id={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </>
  );
}
