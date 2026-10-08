import { useMemo, useState } from 'react';
import { Drawer, StatusBadge } from './ui.jsx';
import { api } from '../lib/api.js';
import { toast } from '../lib/useApi.js';
import { inr, shortDate } from '../lib/format.js';

/**
 * Confirming a bulk close.
 *
 * This cancels every order listed and REFUNDS the ones that were paid, so the dialog's job is to
 * make that unmissable before the click rather than to reassure. It leads with the money, gives the
 * span of delivery days (so "is this really all stale?" is answerable at a glance), and lists the
 * orders themselves — scrollable, because the operator should be able to spot the one that should
 * not be in there.
 *
 * Typing the count is deliberate friction. A button alone is one misplaced click away from an
 * irreversible refund across dozens of customers; typing the number means the number was read.
 */
export function CloseStaleDialog({ orders, onClose, onDone }) {
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const { total, oldest, newest } = useMemo(() => {
    const dates = orders.map((o) => o.deliveryDate).sort();
    return {
      total: orders.reduce((s, o) => s + Number(o.totalPaise || 0), 0),
      oldest: dates[0],
      newest: dates[dates.length - 1],
    };
  }, [orders]);

  const confirmed = typed.trim() === String(orders.length);

  async function run() {
    if (!confirmed || busy) return;
    setBusy(true);
    try {
      const r = await api.post('/admin/orders/close-stale', {
        expectedCount: orders.length,
        orderIds: orders.map((o) => o.id),
        reason: reason.trim() || undefined,
      });
      toast(
        `Closed ${r.closed} order${r.closed === 1 ? '' : 's'} · ${inr(r.refundedPaise)} refunded`,
      );
      onDone();
    } catch (e) {
      // Both server guards land here, and both mean "look again" rather than "try again", so the
      // server's own wording is shown instead of a generic failure.
      toast(e.message || 'Could not close these orders', 'err');
      setBusy(false);
    }
  }

  return (
    <Drawer
      title="Close orders past their delivery day"
      subtitle={`${orders.length} order${orders.length === 1 ? '' : 's'} · ${shortDate(oldest)} to ${shortDate(newest)}`}
      onClose={onClose}
      footer={
        <div className="hstack" style={{ gap: 8, width: '100%', justifyContent: 'flex-end' }}>
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={run}
            disabled={!confirmed || busy}
            style={
              confirmed ? { background: 'var(--tomato)', borderColor: 'var(--tomato)' } : undefined
            }
          >
            {busy ? 'Closing…' : `Close ${orders.length} and refund`}
          </button>
        </div>
      }
    >
      <div
        style={{
          padding: '12px 14px',
          borderRadius: 10,
          marginBottom: 16,
          background: 'rgba(214,92,63,0.10)',
          border: '1px solid rgba(214,92,63,0.28)',
        }}
      >
        <b style={{ color: 'var(--tomato)', fontSize: 13 }}>This refunds money to customers.</b>
        <p className="page-sub" style={{ margin: '6px 0 0' }}>
          Each order is cancelled, its wallet amount returned and its coupon released. Anything paid
          through Razorpay goes back to the original payment method. None of it can be undone here.
        </p>
      </div>

      <div className="hstack" style={{ gap: 20, marginBottom: 16 }}>
        <div>
          <div className="field__label">Orders</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 700 }}>
            {orders.length}
          </div>
        </div>
        <div>
          <div className="field__label">Value</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 700, color: 'var(--tomato)' }}>
            {inr(total)}
          </div>
        </div>
      </div>

      <div className="table-wrap" style={{ maxHeight: 240, overflowY: 'auto', marginBottom: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Delivery</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="mono">{o.orderNumber}</td>
                <td>{o.customerName}</td>
                <td>{shortDate(o.deliveryDate)}</td>
                <td>
                  <StatusBadge status={o.status} />
                </td>
                <td className="num" style={{ textAlign: 'right' }}>
                  {inr(o.totalPaise)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="close-stale-reason">
          Why (optional — this goes in the audit trail)
        </label>
        <input
          id="close-stale-reason"
          className="field__input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. reconciled against the September delivery sheets"
          maxLength={300}
        />
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label className="field__label" htmlFor="close-stale-confirm">
          Type {orders.length} to confirm
        </label>
        <input
          id="close-stale-confirm"
          className="field__input"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          placeholder={String(orders.length)}
          style={{ width: 120, letterSpacing: 2, fontSize: 16 }}
        />
      </div>
    </Drawer>
  );
}
