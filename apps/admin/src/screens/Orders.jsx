/**
 * Orders — filter by status (chips carry live counts), search across order no / name / mobile /
 * flat, open an order to see items + timeline and advance its fulfilment state, and export the
 * current filter as a packing list or driver manifest CSV.
 */
import { useMemo, useState } from 'react';
import { useResource, usePager, toast } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { Drawer, ErrorNote, Pager, StatusBadge, TableSkeleton } from '../components/ui.jsx';
import { IconDownload, IconSearch } from '../components/icons.jsx';
import { inr, shortDate, titleCase } from '../lib/format.js';

/** Mirrors the server's fulfilment state machine (routes/admin/orders.js). */
const NEXT = {
  PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED', 'PAYMENT_FAILED'],
  CONFIRMED: ['PACKING', 'CANCELLED'],
  PACKING: ['OUT_FOR_DELIVERY', 'CONFIRMED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'PACKING'],
  DELIVERED: [],
  CANCELLED: [],
  PAYMENT_FAILED: ['CONFIRMED', 'CANCELLED'],
};
const FILTERS = [
  'CONFIRMED',
  'PACKING',
  'OUT_FOR_DELIVERY',
  'PENDING_PAYMENT',
  'DELIVERED',
  'CANCELLED',
];

// A live cancellation request is an order the customer asked to cancel that the team hasn't decided
// on yet (it keeps its real status until then). Delivered/cancelled orders can't be "requested".
const isCancelRequest = (o) => o.cancelRequested && !['CANCELLED', 'DELIVERED'].includes(o.status);

export function Orders() {
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const query = new URLSearchParams();
  // "Cancel requests" is a client-side view over ALL orders (the server filters by status only).
  const cancelView = status === 'CANCEL_REQUESTED';
  if (status !== 'all' && !cancelView) query.set('status', status);
  if (q.trim()) query.set('q', q.trim());
  const qs = query.toString();
  const { data, loading, error, reload } = useResource(`/admin/orders${qs ? `?${qs}` : ''}`);
  const [openId, setOpenId] = useState(null);

  const counts = data?.counts || {};
  const all = useMemo(() => data?.orders || [], [data]);
  const orders = useMemo(() => (cancelView ? all.filter(isCancelRequest) : all), [all, cancelView]);
  // Count of open cancellation requests — known whenever we're looking at the unfiltered list.
  const cancelCount = status === 'all' || cancelView ? all.filter(isCancelRequest).length : null;
  const pager = usePager(orders, 25, `${status}|${q}`);

  async function download(type) {
    const p = new URLSearchParams(query);
    p.set('type', type);
    const day = new Date().toISOString().slice(0, 10);
    try {
      await api.download(`/admin/orders/export.csv?${p.toString()}`, `f2f-${type}-${day}.csv`);
      toast(`${titleCase(type)} CSV exported`);
    } catch (e) {
      toast(e.message || 'Could not export', 'err');
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Orders</h1>
          <p className="page-sub">
            {data?.total ?? '—'} matching · {Object.values(counts).reduce((a, b) => a + b, 0)} total
          </p>
        </div>
        <div className="topbar__actions">
          <button className="btn btn--ghost" onClick={() => download('packing')}>
            <IconDownload size={17} /> Packing CSV
          </button>
          <button className="btn btn--ghost" onClick={() => download('manifest')}>
            <IconDownload size={17} /> Manifest CSV
          </button>
        </div>
      </header>

      <div className="toolbar">
        <div className="search">
          <IconSearch size={18} style={{ color: 'var(--ink-3)' }} />
          <input
            placeholder="Search order, name, mobile, flat…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      <div className="toolbar" style={{ gap: 7 }}>
        <button
          className={`chip${status === 'all' ? ' is-active' : ''}`}
          onClick={() => setStatus('all')}
        >
          All
        </button>
        {FILTERS.map((s) => (
          <button
            key={s}
            className={`chip${status === s ? ' is-active' : ''}`}
            onClick={() => setStatus(s)}
          >
            {titleCase(s)}
            <span className="chip__count">{counts[s] || 0}</span>
          </button>
        ))}
        <button
          className={`chip${cancelView ? ' is-active' : ''}`}
          onClick={() => setStatus('CANCEL_REQUESTED')}
          style={cancelCount ? { borderColor: 'var(--tomato)', color: 'var(--tomato)' } : undefined}
        >
          Cancel requests
          {cancelCount != null && <span className="chip__count">{cancelCount}</span>}
        </button>
      </div>

      <div className="glass" style={{ overflow: 'hidden' }}>
        {error ? (
          <ErrorNote error={error} onRetry={reload} />
        ) : loading ? (
          <TableSkeleton />
        ) : orders.length === 0 ? (
          <div className="empty">No orders match this filter.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Delivery</th>
                  <th style={{ textAlign: 'right' }}>Items</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pager.slice.map((o) => (
                  <tr key={o.id} onClick={() => setOpenId(o.id)} style={{ cursor: 'pointer' }}>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {o.orderNumber}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{o.customerName}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {o.address?.communityName} · {o.address?.block} {o.address?.flat}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: 13 }}>{shortDate(o.deliveryDate)}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {titleCase(o.window)}
                      </div>
                    </td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      {o.itemCount}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="rupee">{inr(o.totalPaise)}</span>
                    </td>
                    <td>
                      {/* A pending cancellation is the state that needs a decision, so it reads as
                          ONE state with the fulfilment status behind it. Showing both as equal
                          badges made an order look like it was "Confirmed" and "Cancellation
                          requested" at the same time, which reads as a contradiction. */}
                      {isCancelRequest(o) ? (
                        <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                          <span className="badge st-CANCELLED" title="Customer asked to cancel">
                            <span className="badge__dot" />
                            Cancellation requested
                          </span>
                          <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                            was {String(o.status).replace(/_/g, ' ').toLowerCase()}
                          </span>
                        </div>
                      ) : (
                        <StatusBadge status={o.status} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager {...pager} onPage={pager.setPage} />
          </div>
        )}
      </div>

      {openId && <OrderDrawer id={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </>
  );
}

export function OrderDrawer({ id, onClose, onChanged }) {
  const { data, loading, error, reload } = useResource(`/admin/orders/${id}`);
  const [busy, setBusy] = useState(false);
  const o = data?.order;

  async function move(status) {
    setBusy(true);
    try {
      await api.patch(`/admin/orders/${id}/status`, { status });
      toast(`Moved to ${titleCase(status)}`);
      reload();
      onChanged?.();
    } catch (e) {
      toast(e.message || 'Could not update', 'err');
    } finally {
      setBusy(false);
    }
  }

  const nexts = o ? NEXT[o.status] || [] : [];

  return (
    <Drawer
      title={o ? o.orderNumber : 'Order'}
      subtitle={o ? `${o.customerName} · ${o.mobile}` : undefined}
      onClose={onClose}
      footer={
        nexts.length > 0 ? (
          <>
            {/* "Advance to" alone did not say what it acted on or what would happen — a tester
                asked what the button was for. Name the thing being moved. */}
            <span
              className="muted"
              style={{ fontSize: 12.5, marginRight: 'auto', alignSelf: 'center' }}
              title="Moves this order to the next fulfilment stage. The customer sees the change immediately."
            >
              Move this order to
            </span>
            {nexts.map((s) => (
              <button
                key={s}
                className={`btn btn--sm ${s === 'CANCELLED' || s === 'PAYMENT_FAILED' ? 'btn--ghost' : 'btn--primary'}`}
                disabled={busy}
                onClick={() => move(s)}
                style={s === 'CANCELLED' ? { color: 'var(--tomato)' } : undefined}
              >
                {titleCase(s)}
              </button>
            ))}
          </>
        ) : (
          <span className="muted" style={{ fontSize: 12.5 }}>
            No further transitions.
          </span>
        )
      }
    >
      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : loading || !o ? (
        <div className="skeleton" style={{ height: 300 }} />
      ) : (
        <>
          <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 18 }}>
            <StatusBadge status={o.status} />
            <span className="muted" style={{ fontSize: 12.5 }}>
              {shortDate(o.deliveryDate)} · {titleCase(o.window)}
            </span>
          </div>
          {isCancelRequest(o) && (
            <div
              className="glass--flat glass"
              style={{
                padding: 14,
                marginBottom: 18,
                borderLeft: '3px solid var(--tomato)',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--tomato)' }}>
                Customer requested cancellation
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                {o.cancelReason ? `“${o.cancelReason}” · ` : ''}
                Approve or decline it on the Fulfilment board (Cancellation requests column).
              </div>
            </div>
          )}

          <div className="glass--flat glass" style={{ padding: 14, marginBottom: 18 }}>
            <div style={{ fontWeight: 600 }}>{o.address?.communityName}</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
              {o.address?.block}, {o.address?.flat} · {o.address?.area}
            </div>
          </div>

          <div className="field__label">Items ({o.items.length})</div>
          <div className="vstack" style={{ gap: 0, marginBottom: 18 }}>
            {o.items.map((it) => (
              <div
                key={it.id}
                className="hstack"
                style={{
                  justifyContent: 'space-between',
                  padding: '9px 0',
                  borderBottom: '1px solid var(--hairline)',
                }}
              >
                <div>
                  <span style={{ fontWeight: 500 }}>{it.name}</span>
                  {it.note && (
                    <div className="muted" style={{ fontSize: 12 }}>
                      “{it.note}”
                    </div>
                  )}
                </div>
                <div className="hstack" style={{ gap: 14 }}>
                  <span className="mono muted" style={{ fontSize: 12.5 }}>
                    {Number(it.quantity)} {it.unit}
                  </span>
                  <span className="rupee" style={{ minWidth: 60, textAlign: 'right' }}>
                    {inr(it.lineTotalPaise)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div
            className="hstack"
            style={{ justifyContent: 'space-between', padding: '4px 0 18px' }}
          >
            <span style={{ fontWeight: 600, fontFamily: 'var(--font-display)', fontSize: 17 }}>
              Total
            </span>
            <span className="rupee" style={{ fontSize: 20 }}>
              {inr(o.totalPaise)}
            </span>
          </div>

          <div className="field__label">Timeline</div>
          <div className="vstack" style={{ gap: 0 }}>
            {o.timeline.map((t, i) => (
              <div key={i} className="hstack" style={{ gap: 12, padding: '8px 0' }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: i === o.timeline.length - 1 ? 'var(--leaf)' : 'var(--ink-3)',
                    flex: 'none',
                  }}
                />
                <span style={{ fontWeight: 500, fontSize: 13.5 }}>{titleCase(t.status)}</span>
                <span className="spacer" />
                <span className="muted mono" style={{ fontSize: 11.5 }}>
                  {new Date(t.at).toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Drawer>
  );
}
