/**
 * Customers — everyone who has ordered, and which of their orders each one was.
 *
 * The question this answers is "is this their first order, their second, or their twentieth?" —
 * across the whole book on the list, and order by order when a customer is opened.
 *
 * It is the one screen that sets every customer side by side, so it is built to show as little of
 * each as the job needs:
 *
 *   - The list has a name, the last four digits of a number, and a community. Never the whole
 *     number, never a flat.
 *   - A customer's history has what they ordered and what became of it. Where it went and who was
 *     rung are on the order itself, for the people delivering it.
 *   - The whole number is one deliberate step away: say why it is needed, and it is shown — and the
 *     asking is written to the audit trail, as is opening anyone's history at all.
 *   - Someone who deleted their account keeps their orders (the tax record must stand) and loses
 *     their name and number, here as everywhere.
 *
 * There is no export, and there should not be one: these numbers were given to have vegetables
 * delivered, not to be messaged. Marketing to customers needs a consent nobody has been asked for.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast, usePager, useResource } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { Drawer, ErrorNote, Pager, Stat, StatusBadge, TableSkeleton } from '../components/ui.jsx';
import { IconReceipt, IconSearch, IconShield, IconUsers } from '../components/icons.jsx';
import { dateTime, inr, ordinal, shortDate } from '../lib/format.js';

const TABS = [
  { key: 'ALL', label: 'Everyone', has: () => true },
  { key: 'FIRST', label: 'First order', has: (c) => c.stage === 'FIRST' },
  { key: 'SECOND', label: 'Second order', has: (c) => c.stage === 'SECOND' },
  { key: 'REGULAR', label: 'Three or more', has: (c) => c.stage === 'REGULAR' },
];

/** Where a customer stands, in a word. */
function StageChip({ customer }) {
  const text =
    customer.stage === 'FIRST'
      ? '1st order'
      : customer.stage === 'SECOND'
        ? '2nd order'
        : `${customer.orders} orders`;
  return <span className={`cust__stage cust__stage--${customer.stage}`}>{text}</span>;
}

const whoIs = (c) => (c.erased ? 'Deleted account' : c.name || 'No name given');

export function Customers() {
  const [q, setQ] = useState('');
  const [asked, setAsked] = useState('');
  // The search runs on the server, because a mobile number can only be matched there — this page
  // never holds one. Wait for a pause in typing before asking.
  useEffect(() => {
    const t = setTimeout(() => setAsked(q.trim()), 320);
    return () => clearTimeout(t);
  }, [q]);
  const { data, loading, error, reload } = useResource(
    asked ? `/admin/customers?q=${encodeURIComponent(asked)}` : '/admin/customers',
  );
  const customers = useMemo(() => data?.customers || [], [data]);
  const [tab, setTab] = useState('ALL');
  const [openKey, setOpenKey] = useState(/** @type {string|null} */ (null));
  const shown = useMemo(
    () => customers.filter(TABS.find((t) => t.key === tab)?.has || (() => true)),
    [customers, tab],
  );
  const pager = usePager(shown, 25, `${tab}|${asked}`);
  const totals = data?.totals;

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-sub">Everyone who has ordered, and which order they are on.</p>
        </div>
      </header>

      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : !data ? (
        <div className="glass card">
          <TableSkeleton rows={6} />
        </div>
      ) : (
        <>
          <div className="stat-grid stagger">
            <Stat
              icon={<IconUsers size={20} />}
              value={totals.customers.toLocaleString('en-IN')}
              label="Customers who have ordered"
              tint="sprout"
            />
            <Stat
              icon={<IconReceipt size={20} />}
              value={totals.first.toLocaleString('en-IN')}
              label="On their first order"
            />
            <Stat
              icon={<IconReceipt size={20} />}
              value={totals.second.toLocaleString('en-IN')}
              label="On their second"
            />
            <Stat
              icon={<IconReceipt size={20} />}
              value={totals.regular.toLocaleString('en-IN')}
              label="Three orders or more"
            />
          </div>
          {totals.cameBackPct !== null && (
            <p className="cust__lead">
              <b>{totals.cameBackPct}%</b> of the people who have ordered came back and ordered
              again.
            </p>
          )}

          <div
            className="hstack"
            style={{ gap: 8, margin: '18px 0 14px', flexWrap: 'wrap', alignItems: 'center' }}
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`chip${tab === t.key ? ' is-active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
                <span className="chip__count">{customers.filter(t.has).length}</span>
              </button>
            ))}
            <div className="cust__search">
              <IconSearch size={15} />
              <input
                className="field__input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name, order number or mobile"
                aria-label="Search customers"
              />
            </div>
          </div>

          <div
            className="glass card reveal"
            style={{ padding: 0, opacity: loading ? 0.6 : 1, transition: 'opacity 160ms' }}
          >
            {customers.length === 0 ? (
              <div className="empty">
                {asked ? (
                  <>
                    <p style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
                      Nobody matches “{asked}”.
                    </p>
                    <p style={{ marginTop: 6 }}>
                      Try a name, an order number, or at least four digits of a mobile number.
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ fontWeight: 600, color: 'var(--ink-2)' }}>No orders yet.</p>
                    <p style={{ marginTop: 6 }}>
                      A customer appears here the moment their first order is placed.
                    </p>
                  </>
                )}
              </div>
            ) : shown.length === 0 ? (
              <div className="empty">Nobody is at this stage yet.</div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Community</th>
                      <th>On their</th>
                      <th className="num">Delivered</th>
                      <th>First order</th>
                      <th>Latest order</th>
                      <th className="num">Spent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pager.slice.map((c) => (
                      <tr
                        key={c.key}
                        className="demand__row"
                        onClick={() => setOpenKey(c.key)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setOpenKey(c.key);
                          }
                        }}
                        aria-label={`${whoIs(c)}: ${c.orders} ${c.orders === 1 ? 'order' : 'orders'}`}
                      >
                        <td>
                          <div
                            className="data__name"
                            style={{
                              fontWeight: 600,
                              color: c.erased ? 'var(--ink-3)' : undefined,
                            }}
                          >
                            {whoIs(c)}
                          </div>
                          <div className="muted mono" style={{ fontSize: 12 }}>
                            {c.erased ? 'No details kept' : c.mobileMasked || 'No number'}
                          </div>
                        </td>
                        <td className="data__name">
                          {c.community || <span className="muted">—</span>}
                        </td>
                        <td>
                          <StageChip customer={c} />
                        </td>
                        <td className="num">
                          {c.delivered}
                          {c.cancelled > 0 && (
                            <span className="muted" style={{ fontSize: 12 }}>
                              {' '}
                              · {c.cancelled} cancelled
                            </span>
                          )}
                        </td>
                        <td className="data__name">{dateTime(c.firstOrderAt)}</td>
                        <td>
                          <div className="data__name">{dateTime(c.lastOrderAt)}</div>
                          <div style={{ marginTop: 4 }}>
                            <StatusBadge status={c.lastStatus} />
                          </div>
                        </td>
                        <td className="num" style={{ fontWeight: 600 }}>
                          {c.spentPaise ? inr(c.spentPaise) : <span className="muted">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pager {...pager} onPage={pager.setPage} />
          </div>

          <p className="field__hint cust__note">
            <IconShield size={14} />
            <span>
              Shown to serve and support customers, and to see how many come back. It is not a
              contact list: numbers stay hidden until one is needed, opening a customer and showing
              a number are both recorded, and there is no export. A customer who deletes their
              account stays in the counts without a name or number.
            </span>
          </p>
        </>
      )}

      {openKey && (
        <CustomerDrawer
          customerKey={openKey}
          reasons={data?.reasons || {}}
          onClose={() => setOpenKey(null)}
        />
      )}
    </>
  );
}

function CustomerDrawer({ customerKey, reasons, onClose }) {
  const { data, loading, error, reload } = useResource(
    `/admin/customers/${encodeURIComponent(customerKey)}`,
  );
  const c = data?.customer;
  const orders = data?.orders || [];

  return (
    <Drawer
      title={c ? whoIs(c) : 'Customer'}
      subtitle={
        c
          ? `${c.orders} ${c.orders === 1 ? 'order' : 'orders'} · first on ${dateTime(c.firstOrderAt)}`
          : undefined
      }
      onClose={onClose}
      footer={null}
    >
      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : loading && !data ? (
        <TableSkeleton rows={5} />
      ) : (
        <>
          <dl className="demand__facts" style={{ margin: 0 }}>
            <div className="demand__fact">
              <dt>On their</dt>
              <dd>{c.orders === 1 ? '1st order' : `${ordinal(c.orders)} order`}</dd>
            </div>
            <div className="demand__fact">
              <dt>Delivered</dt>
              <dd>
                {c.delivered}
                {c.inHand > 0 && ` · ${c.inHand} on the way`}
              </dd>
            </div>
            <div className="demand__fact">
              <dt>Spent</dt>
              <dd>{c.spentPaise ? inr(c.spentPaise) : '—'}</dd>
            </div>
            <div className="demand__fact">
              <dt>Community</dt>
              <dd>{c.community || '—'}</dd>
            </div>
          </dl>

          <section className="demand__section">
            <h4>Contact</h4>
            {c.erased ? (
              <p className="field__hint" style={{ margin: 0 }}>
                This customer deleted their account. Their orders are kept because the tax record
                has to be; their name and number were removed and are not shown anywhere.
              </p>
            ) : (
              <Contact customerKey={customerKey} masked={c.mobileMasked} reasons={reasons} />
            )}
          </section>

          <section className="demand__section">
            <h4>Orders — newest first</h4>
            <ol className="cust__orders">
              {orders.map((o) => (
                <li key={o.id} className="cust__order">
                  <div className={`cust__no${o.n === 1 ? ' cust__no--first' : ''}`}>
                    {o.label.replace(' order', '')}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <span className="mono" style={{ fontWeight: 600 }}>
                        {o.orderNumber}
                      </span>
                      <StatusBadge status={o.status} />
                      {o.paymentMethod === 'COD' && <span className="cust__tag">Cash</span>}
                      {o.couponCode && <span className="cust__tag">{o.couponCode}</span>}
                    </div>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                      Placed {dateTime(o.placedAt)}
                      {o.deliveryDate && ` · for ${shortDate(o.deliveryDate)}`}
                      {o.community && ` · ${o.community}`}
                    </div>
                    <div style={{ fontSize: 13, marginTop: 4, overflowWrap: 'anywhere' }}>
                      {o.items || `${o.itemCount} items`}
                    </div>
                  </div>
                  <div className="cust__amount">{inr(o.totalPaise)}</div>
                </li>
              ))}
            </ol>
          </section>

          <p className="field__hint" style={{ marginTop: 18 }}>
            Opening this was recorded. The flat an order went to, and the number that was rung, are
            on the order itself under Orders.
          </p>
        </>
      )}
    </Drawer>
  );
}

/**
 * The number, one deliberate step away. Hidden by default; shown for a stated reason, once per
 * opening of the drawer — closing it hides the number again.
 */
function Contact({ customerKey, masked, reasons }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [mobile, setMobile] = useState(/** @type {string|null} */ (null));

  async function show() {
    if (!reason) return;
    setBusy(true);
    try {
      const r = await api.post(`/admin/customers/${encodeURIComponent(customerKey)}/contact`, {
        reason,
      });
      setMobile(r.mobile);
      setAsking(false);
    } catch (e) {
      toast(e.message || 'Could not show the number.', 'err');
    } finally {
      setBusy(false);
    }
  }

  if (mobile) {
    return (
      <div className="demand__confirm">
        <div className="mono" style={{ fontSize: 18, fontWeight: 600, userSelect: 'all' }}>
          +91 {mobile.slice(0, 5)} {mobile.slice(5)}
        </div>
        <p className="field__hint" style={{ margin: '6px 0 0' }}>
          Shown for: {reasons[reason] || reason}. Recorded against your name. Use it for that, and
          nothing else.
        </p>
      </div>
    );
  }

  return (
    <div className="demand__confirm">
      <div className="hstack" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="mono" style={{ fontSize: 16, fontWeight: 600 }}>
          {masked || 'No number on record'}
        </span>
        {masked && !asking && (
          <button className="btn btn--ghost btn--sm" onClick={() => setAsking(true)}>
            Show number
          </button>
        )}
      </div>
      {asking && (
        <div style={{ marginTop: 12 }}>
          <label className="field" style={{ margin: 0 }}>
            <span className="field__label">What do you need it for?</span>
            <select
              className="field__select"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            >
              <option value="">Choose a reason</option>
              {Object.entries(reasons).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="hstack" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
            <button className="btn btn--primary btn--sm" onClick={show} disabled={!reason || busy}>
              {busy ? 'Showing…' : 'Show it'}
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => setAsking(false)}>
              Cancel
            </button>
            <span className="field__hint" style={{ margin: 0 }}>
              This is recorded, with the reason.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
