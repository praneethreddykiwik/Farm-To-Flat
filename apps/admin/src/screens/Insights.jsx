/**
 * Weekly insights — the five questions the business asks every Friday, for any date range:
 *
 *   1. First orders  where do new customers come from?
 *   2. Repeat        do they come back, and how fast?
 *   3. Routine       do reminders move orders, and how full is each community's morning?
 *   4. Promise       do we deliver on time, and are refunds made?
 *   5. Offers        does a coupon pay back?
 * plus Products: winners and losers, item by item.
 *
 * Everything is worked out on the API from the order book on each request
 * (GET /admin/insights, /admin/insights/products). What staff record here — reminders sent, a
 * community's capacity, why a delivery was late — is saved under /admin/insights/*.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bar as RBar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast, useResource } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { Drawer as UiDrawer, ErrorNote, Stat, TableSkeleton } from '../components/ui.jsx';
import {
  IconClock,
  IconEdit,
  IconPlus,
  IconReceipt,
  IconRupee,
  IconTicket,
  IconTrash,
  IconTrend,
  IconUsers,
} from '../components/icons.jsx';
import {
  Bar,
  DateRange,
  SetupBanner,
  Tabs,
  n0,
  pctText,
  rangeLabel,
  sentence,
  useDateRange,
} from '../components/business.jsx';
import { dateTime, dayLabel, inr, noLead, num, shortDate } from '../lib/format.js';

const TABS = [
  { key: 'first', label: 'First orders' },
  { key: 'repeat', label: 'Repeat' },
  { key: 'routine', label: 'Routine' },
  { key: 'promise', label: 'Promise' },
  { key: 'offers', label: 'Offers' },
  { key: 'planner', label: 'Meal planner' },
  { key: 'products', label: 'Products' },
];

const COLORS = ['#1e7a4c', '#2c7fc0', '#d89b1a', '#d9532b', '#6a3fb0', '#9fd12c', '#7c8781'];
const tip = {
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.85)',
  boxShadow: '0 8px 24px rgba(14,27,20,0.12)',
  fontFamily: 'IBM Plex Sans',
  fontSize: 13,
};

export function Insights() {
  const dr = useDateRange('30d');
  const [tab, setTab] = useState('first');
  const { data, loading, error, reload } = useResource(`/admin/insights?${dr.qs}`);

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Weekly insights</h1>
          <p className="page-sub">The five Friday questions, for {rangeLabel(dr.range)}.</p>
        </div>
      </header>
      <SetupBanner />
      <DateRange dr={dr} />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'products' ? (
        <Products qs={dr.qs} />
      ) : error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : !data ? (
        <div className="glass card">
          <div className="skeleton" style={{ height: 280 }} />
        </div>
      ) : (
        <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 160ms' }}>
          {tab === 'first' && <FirstOrders a={data.acquisition} />}
          {tab === 'repeat' && <Repeat r={data.repeat} />}
          {tab === 'routine' && <Routine r={data.routine} onChanged={reload} />}
          {tab === 'promise' && (
            <PromiseTab p={data.promise} reasons={data.delayReasons} onChanged={reload} />
          )}
          {tab === 'offers' && <Offers o={data.offers} />}
          {tab === 'planner' && <Planner p={data.planner} />}
        </div>
      )}
    </>
  );
}

function Card({ title, children, hint = null, pad = true }) {
  return (
    <div className="glass card reveal" style={pad ? undefined : { padding: 0 }}>
      {title && (
        <div className="card__head" style={pad ? undefined : { padding: '18px 20px 0' }}>
          <h2 className="card__title" style={{ fontSize: 15 }}>
            {title}
          </h2>
        </div>
      )}
      {children}
      {hint && (
        <p className="field__hint" style={pad ? undefined : { padding: '0 16px 14px' }}>
          {hint}
        </p>
      )}
    </div>
  );
}

const Empty = ({ children }) => (
  <div className="empty" style={{ padding: '28px 16px' }}>
    {children}
  </div>
);

// ── 1. first orders ─────────────────────────────────────────────────────────

function FirstOrders({ a }) {
  const channel = a.byChannel.map((c) => ({
    name: c.label,
    value: c.firstOrders,
    share: c.sharePct,
  }));
  const heard = a.byHeardFrom.map((h) => ({
    name: h.label,
    value: h.firstOrders,
    share: h.sharePct,
  }));
  return (
    <div className="vstack" style={{ gap: 16 }}>
      <div className="stat-grid stagger">
        <Stat
          icon={<IconUsers size={20} />}
          tint="sprout"
          value={a.firstOrders}
          label="First orders in the range"
        />
        <Stat
          icon={<IconTicket size={20} />}
          value={a.byChannel.find((c) => c.key === 'STALL')?.firstOrders || 0}
          label="Through a stall / promoter code"
        />
        <Stat
          icon={<IconUsers size={20} />}
          value={a.byChannel.find((c) => c.key === 'INVITE')?.firstOrders || 0}
          label="Through a neighbour’s invite"
        />
      </div>
      <div className="grid-2 grid-2--even">
        <Card title="By channel">
          {channel.length === 0 ? (
            <Empty>No first orders in this range.</Empty>
          ) : (
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={channel} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid stroke="rgba(14,27,20,0.06)" horizontal={false} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={170}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: '#3d4b43' }}
                  />
                  <Tooltip
                    contentStyle={tip}
                    formatter={(v, _n, p) => [`${v} (${p.payload.share}%)`, 'First orders']}
                  />
                  <RBar dataKey="value" radius={[0, 6, 6, 0]} fill="#1e7a4c" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card
          title="How did you hear about us?"
          hint="Asked before a customer’s first order. Customers who skipped it are not in this chart."
        >
          {heard.length === 0 ? (
            <Empty>No answers yet in this range.</Empty>
          ) : (
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={heard}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={heard.length > 1 ? 2 : 0}
                  >
                    {heard.map((h, i) => (
                      <Cell key={h.name} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tip}
                    formatter={(v, n, p) => [`${v} (${p.payload.share}%)`, n]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
      <div className="grid-2 grid-2--even">
        <Card title="By promoter" pad={false}>
          {a.byPromoter.length === 0 ? (
            <Empty>No promoters yet. Add them under Referral program → Promoters.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Promoter</th>
                    <th>Stall</th>
                    <th className="num">Orders</th>
                    <th className="num">First orders</th>
                    <th className="num">Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {a.byPromoter.map((p) => (
                    <tr key={p.code}>
                      <td>
                        <div className="data__name" style={{ fontWeight: 600 }}>
                          {p.name}
                        </div>
                        <div className="muted mono" style={{ fontSize: 12 }}>
                          {p.code}
                          {!p.active && ' · switched off'}
                        </div>
                      </td>
                      <td className="data__name">{p.stall || <span className="muted">—</span>}</td>
                      <td className="num">{p.orders}</td>
                      <td className="num">{p.firstOrders}</td>
                      <td className="num">{inr(p.revenuePaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="By stall" pad={false}>
          {a.byStall.length === 0 ? (
            <Empty>No stalls yet.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Stall</th>
                    <th className="num">Promoters</th>
                    <th className="num">Orders</th>
                    <th className="num">First orders</th>
                    <th className="num">Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {a.byStall.map((s) => (
                    <tr key={s.stall}>
                      <td className="data__name" style={{ fontWeight: 600 }}>
                        {s.stall}
                      </td>
                      <td className="num">{s.promoters}</td>
                      <td className="num">{s.orders}</td>
                      <td className="num">{s.firstOrders}</td>
                      <td className="num">{inr(s.revenuePaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ── 2. repeat ───────────────────────────────────────────────────────────────

function Repeat({ r }) {
  const weekly = r.weekly.map((w) => ({
    label: dayLabel(w.weekOf),
    'New customers': w.newCustomers,
    'Back within 7 days': w.second7,
    'Back within 30 days': w.second30,
  }));
  return (
    <div className="vstack" style={{ gap: 16 }}>
      <div className="stat-grid stagger">
        <Stat
          icon={<IconUsers size={20} />}
          tint="sprout"
          value={r.newCustomers}
          label="New customers"
        />
        <Stat
          icon={<IconTrend size={20} />}
          value={pctText(r.secondOrderWithin7Pct)}
          label={`Second order within 7 days (${r.secondOrderWithin7})`}
          delta={
            r.stillTooNewFor7 > 0
              ? { kind: 'flat', text: `${r.stillTooNewFor7} too new to judge yet` }
              : undefined
          }
        />
        <Stat
          icon={<IconTrend size={20} />}
          value={pctText(r.secondOrderWithin30Pct)}
          label={`Second order within 30 days (${r.secondOrderWithin30})`}
        />
        <Stat
          icon={<IconClock size={20} />}
          value={r.medianDaysToSecond == null ? '—' : `${n0(r.medianDaysToSecond)} d`}
          label="Median days to a second order"
        />
      </div>
      <Card
        title="Week by week"
        hint="Each week is the customers whose FIRST order fell in it, and how many of them came back. A customer counts against 7 or 30 days only once that long has passed since their first order."
      >
        {weekly.length === 0 ? (
          <Empty>No new customers in this range.</Empty>
        ) : (
          <>
            <div style={{ height: 260, marginLeft: -10 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekly} barGap={3}>
                  <CartesianGrid stroke="rgba(14,27,20,0.06)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    width={36}
                  />
                  <Tooltip contentStyle={tip} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <RBar dataKey="New customers" fill="#2c7fc0" radius={[6, 6, 0, 0]} />
                  <RBar dataKey="Back within 7 days" fill="#1e7a4c" radius={[6, 6, 0, 0]} />
                  <RBar dataKey="Back within 30 days" fill="#d89b1a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="table-wrap" style={{ marginTop: 10 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Week of</th>
                    <th className="num">New customers</th>
                    <th className="num">Back within 7 days</th>
                    <th className="num">Back within 30 days</th>
                  </tr>
                </thead>
                <tbody>
                  {r.weekly.map((w) => (
                    <tr key={w.weekOf}>
                      <td className="data__name">{shortDate(w.weekOf)}</td>
                      <td className="num">{w.newCustomers}</td>
                      <td className="num">
                        {w.second7} ({Math.round((w.second7 / Math.max(1, w.newCustomers)) * 100)}%)
                      </td>
                      <td className="num">
                        {w.second30} ({Math.round((w.second30 / Math.max(1, w.newCustomers)) * 100)}
                        %)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ── meal planner usage ──────────────────────────────────────────────────────

const changeText = (n) => (n > 0 ? `+${n}` : n < 0 ? String(n) : 'same');
const changeColor = (n) => (n > 0 ? 'var(--leaf-deep)' : n < 0 ? 'var(--tomato)' : undefined);

/** Who uses the meal planner, and whether the "Have you tried it?" card brings people in. */
function Planner({ p }) {
  if (!p) return <Empty>Meal planner usage needs the latest server version.</Empty>;
  const max = Math.max(1, ...p.steps.map((s) => s.people));
  return (
    <div className="vstack" style={{ gap: 16 }}>
      <Card
        title="People at each step"
        pad={false}
        hint={`Different people, not taps. Compared with ${shortDate(p.comparedWith.from)} to ${shortDate(p.comparedWith.to)}. The planner is open to super admin only for now, so these are your own team’s numbers.`}
      >
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Step</th>
                <th style={{ width: '34%' }} />
                <th className="num">People</th>
                <th className="num">Times</th>
                <th className="num">Before</th>
                <th className="num">Change</th>
              </tr>
            </thead>
            <tbody>
              {p.steps.map((s) => (
                <tr key={s.key}>
                  <td className="data__name">{s.label}</td>
                  <td>
                    <Bar pct={(s.people / max) * 100} tone="leaf" />
                  </td>
                  <td className="num" style={{ fontWeight: 700 }}>
                    {s.people}
                  </td>
                  <td className="num">{s.times}</td>
                  <td className="num">{s.before}</td>
                  <td className="num" style={{ fontWeight: 700, color: changeColor(s.change) }}>
                    {changeText(s.change)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Does “Have you tried it?” work?">
        <p style={{ fontSize: 14, lineHeight: 1.6 }}>
          {p.nudge.shown === 0 ? (
            'Nobody has been shown the card in this range.'
          ) : (
            <>
              <b>{p.nudge.shown}</b> saw it, <b>{p.nudge.tapped}</b> tapped Try it, and{' '}
              <b>{p.nudge.madeAfterTap}</b> of those made a plan. It was closed{' '}
              <b>{p.nudge.dismissed}</b> {p.nudge.dismissed === 1 ? 'time' : 'times'}.
            </>
          )}
        </p>
      </Card>
    </div>
  );
}

// ── 3. routine ──────────────────────────────────────────────────────────────

const CHANNELS = [
  { key: 'WHATSAPP', label: 'WhatsApp' },
  { key: 'PUSH', label: 'App notification' },
  { key: 'SMS', label: 'SMS' },
  { key: 'BROADCAST', label: 'Residents’ group broadcast' },
  { key: 'OTHER', label: 'Other' },
];
const channelLabel = (k) => CHANNELS.find((c) => c.key === k)?.label || sentence(k);

/** Drawers are portalled to <body> so a card's stacking layer cannot paint over them. */
const Drawer = (props) => createPortal(<UiDrawer {...props} />, document.body);

/** ISO → the value a datetime-local input takes, in the browser's own time zone. */
function toLocalInput(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Correct a logged reminder — its time, channel, community or note. Audit-logged on the server. */
function ReminderDrawer({ reminder, communities, onClose, onSaved }) {
  const [f, setF] = useState({
    at: toLocalInput(reminder.at),
    channel: reminder.channel || 'WHATSAPP',
    communityId: reminder.communityId || '',
    note: reminder.note || '',
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    const t = new Date(f.at);
    if (!f.at || Number.isNaN(t.getTime())) return toast('That time could not be read.', 'err');
    setBusy(true);
    try {
      await api.patch(`/admin/insights/reminders/${encodeURIComponent(reminder.id)}`, {
        at: t.toISOString(),
        channel: f.channel,
        communityId: f.communityId || null,
        note: f.note.trim() || null,
      });
      toast('Reminder updated');
      onSaved();
    } catch (e) {
      toast(e.message || 'Could not update the reminder', 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      title="Edit reminder"
      subtitle={`Logged ${dateTime(reminder.at)}${reminder.by ? ` by ${reminder.by}` : ''}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field__label">Sent</label>
        <input
          type="datetime-local"
          className="field__input"
          value={f.at}
          onChange={(e) => setF((s) => ({ ...s, at: e.target.value }))}
        />
      </div>
      <div className="field">
        <label className="field__label">Sent by</label>
        <select
          className="field__select"
          value={f.channel}
          onChange={(e) => setF((s) => ({ ...s, channel: e.target.value }))}
        >
          {CHANNELS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field__label">To</label>
        <select
          className="field__select"
          value={f.communityId}
          onChange={(e) => setF((s) => ({ ...s, communityId: e.target.value }))}
        >
          <option value="">All communities</option>
          {communities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field__label">Note (optional)</label>
        <input
          className="field__input"
          value={f.note}
          maxLength={200}
          onChange={(e) => setF((s) => ({ ...s, note: noLead(e.target.value) }))}
        />
      </div>
    </Drawer>
  );
}

const Trend = ({ d }) =>
  d ? (
    <span style={{ fontWeight: 700, color: changeColor(d.points) }}>
      {d.way === 'up' ? '▲ rising' : d.way === 'down' ? '▼ falling' : 'steady'}
      {d.points !== 0 && ` (${d.points > 0 ? '+' : ''}${d.points} points)`}
    </span>
  ) : (
    <span className="muted">no earlier reminders to compare with</span>
  );

/** Is the cut-off reminder working, and is interest in it going up or down? */
function ReminderEffect({ e }) {
  if (!e) return null;
  const share = (n, p) => (p == null ? '—' : `${n} (${p}%)`);
  return (
    <Card
      title="Is the reminder working?"
      pad={false}
      hint={`“Ordered” is people who got the reminder and ordered later that day. “Usual” is the average number of orders in the same ${e.windowHours} hours on earlier same weekdays with no reminder. More orders after a reminder suggests it helped; it is not proof. Opens are counted for app notifications only.`}
    >
      <div style={{ padding: '12px 20px 4px', fontSize: 14, lineHeight: 1.8 }}>
        {e.now.reminders === 0 ? (
          <span className="muted">
            No reminder has gone out in this range. Switch it on in Friday report → Settings →
            Cut-off reminder.
          </span>
        ) : (
          <>
            <div>
              Opened by <b>{share(e.now.opened, e.now.openedPct)}</b> of {num(e.now.sent)} sent ·{' '}
              <Trend d={e.trend.opened} />
            </div>
            <div>
              Ordered that day: <b>{share(e.now.ordered, e.now.orderedPct)}</b> ·{' '}
              <Trend d={e.trend.ordered} />
            </div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              Compared with {shortDate(e.comparedWith.from)} to {shortDate(e.comparedWith.to)}.
            </div>
          </>
        )}
      </div>
      {e.days.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Reminder</th>
                <th className="num">Sent</th>
                <th className="num">Opened</th>
                <th className="num">Ordered</th>
                <th className="num">Orders in {e.windowHours} h</th>
                <th className="num">Usual</th>
                <th className="num">Change</th>
              </tr>
            </thead>
            <tbody>
              {e.days.map((d) => (
                <tr key={d.date}>
                  <td className="data__name">{dateTime(d.at)}</td>
                  <td className="num">{d.sent}</td>
                  <td className="num">{share(d.opened, d.openedPct)}</td>
                  <td className="num">{share(d.ordered, d.orderedPct)}</td>
                  <td className="num">{d.ordersAfter}</td>
                  <td className="num">{d.usual == null ? '—' : d.usual}</td>
                  <td
                    className="num"
                    style={{ fontWeight: 700, color: changeColor(d.change || 0) }}
                  >
                    {d.change == null ? '—' : d.change > 0 ? `+${d.change}` : d.change}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Routine({ r, onChanged }) {
  const communities = r.communities;
  const nameOf = (id) => communities.find((c) => c.id === id)?.name || 'All communities';
  const [f, setF] = useState({ channel: 'WHATSAPP', communityId: '', note: '', at: '' });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(/** @type {any} */ (null));

  async function logReminder() {
    const body = {
      channel: f.channel,
      communityId: f.communityId || null,
      note: f.note.trim() || null,
    };
    if (f.at) {
      const t = new Date(f.at);
      if (Number.isNaN(t.getTime())) return toast('That time could not be read.', 'err');
      body.at = t.toISOString();
    }
    setBusy(true);
    try {
      await api.post('/admin/insights/reminders', body);
      toast('Reminder logged');
      setF({ channel: f.channel, communityId: '', note: '', at: '' });
      onChanged();
    } catch (e) {
      toast(e.message || 'Could not log the reminder', 'err');
    } finally {
      setBusy(false);
    }
  }
  async function removeReminder(x) {
    if (!confirm(`Delete the ${channelLabel(x.channel)} reminder from ${dateTime(x.at)}?`)) return;
    try {
      await api.del(`/admin/insights/reminders/${x.id}`);
      toast('Reminder deleted');
      onChanged();
    } catch (e) {
      toast(e.message || 'Could not delete', 'err');
    }
  }

  return (
    <div className="vstack" style={{ gap: 16 }}>
      {editing && (
        <ReminderDrawer
          reminder={editing}
          communities={communities}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
      <ReminderEffect e={r.effect} />
      <Card title="Log a reminder">
        <div className="field__row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div className="field">
            <label className="field__label">Sent by</label>
            <select
              className="field__select"
              value={f.channel}
              onChange={(e) => setF((s) => ({ ...s, channel: e.target.value }))}
            >
              {CHANNELS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label">To</label>
            <select
              className="field__select"
              value={f.communityId}
              onChange={(e) => setF((s) => ({ ...s, communityId: e.target.value }))}
            >
              <option value="">All communities</option>
              {communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label">When (blank = now)</label>
            <input
              type="datetime-local"
              className="field__input"
              value={f.at}
              onChange={(e) => setF((s) => ({ ...s, at: e.target.value }))}
            />
          </div>
        </div>
        <div className="hstack" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label className="field__label">Note (optional)</label>
            <input
              className="field__input"
              value={f.note}
              maxLength={200}
              onChange={(e) => setF((s) => ({ ...s, note: noLead(e.target.value) }))}
              placeholder="“Order by 10 pm for tomorrow morning”"
            />
          </div>
          <button className="btn btn--primary" onClick={logReminder} disabled={busy}>
            <IconPlus size={17} /> {busy ? 'Logging…' : 'Log reminder'}
          </button>
        </div>
      </Card>

      <Card
        title={`Reminders in the range · orders ${r.reminderWindowHours} h before vs after`}
        pad={false}
        hint={`Orders placed in the ${r.reminderWindowHours} hours before each reminder, against the ${r.reminderWindowHours} hours after it — in the community it went to, or everywhere.`}
      >
        {r.reminders.length === 0 ? (
          <Empty>No reminders logged in this range.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Sent</th>
                  <th>By</th>
                  <th>To</th>
                  <th>Note</th>
                  <th className="num">Before</th>
                  <th className="num">After</th>
                  <th className="num">Change</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {r.reminders.map((x) => (
                  <tr key={x.id}>
                    <td className="data__name">{dateTime(x.at)}</td>
                    <td className="data__name">{channelLabel(x.channel)}</td>
                    <td className="data__name">{nameOf(x.communityId)}</td>
                    <td className="muted" style={{ fontSize: 12.5, maxWidth: 260 }}>
                      {x.note || '—'}
                      {x.by && <div style={{ fontSize: 11 }}>by {x.by}</div>}
                    </td>
                    <td className="num">{x.ordersBefore}</td>
                    <td className="num">{x.ordersAfter}</td>
                    <td
                      className="num"
                      style={{
                        fontWeight: 700,
                        color:
                          x.lift > 0
                            ? 'var(--leaf-deep)'
                            : x.lift < 0
                              ? 'var(--tomato)'
                              : undefined,
                      }}
                    >
                      {x.lift > 0 ? `+${x.lift}` : x.lift}
                    </td>
                    <td className="row-actions-cell">
                      <button
                        className="btn btn--ghost btn--icon"
                        onClick={() => setEditing(x)}
                        aria-label="Edit reminder"
                      >
                        <IconEdit size={15} />
                      </button>
                      <button
                        className="btn btn--ghost btn--icon"
                        style={{ color: 'var(--tomato)' }}
                        onClick={() => removeReminder(x)}
                        aria-label="Delete reminder"
                      >
                        <IconTrash size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="Communities · orders per delivery morning"
        pad={false}
        hint="Capacity is how many orders a community’s morning run can take. Set it to see how full each one is."
      >
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Community</th>
                <th>Capacity / morning</th>
                <th className="num">Average</th>
                <th className="num">Peak</th>
                <th>Full</th>
                <th className="num">Mornings</th>
              </tr>
            </thead>
            <tbody>
              {communities.map((c) => (
                <CapacityRow key={c.id} c={c} onChanged={onChanged} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Towers · orders per morning" pad={false}>
        {r.towers.length === 0 ? (
          <Empty>No deliveries in this range.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Community</th>
                  <th>Tower</th>
                  <th className="num">Orders</th>
                  <th className="num">Per morning it ordered</th>
                  <th className="num">Per delivery morning</th>
                </tr>
              </thead>
              <tbody>
                {r.towers.map((t) => (
                  <tr key={`${t.communityId}|${t.tower}`}>
                    <td className="data__name">{t.communityName}</td>
                    <td className="data__name" style={{ fontWeight: 600 }}>
                      {t.tower}
                    </td>
                    <td className="num">{t.orders}</td>
                    <td className="num">{n0(t.avgPerMorning)}</td>
                    <td className="num">{n0(t.perMorningAcrossRange, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function CapacityRow({ c, onChanged }) {
  const [v, setV] = useState(c.capacity == null ? '' : String(c.capacity));
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(c.capacity == null ? '' : String(c.capacity)), [c.capacity]);
  const dirty = v !== (c.capacity == null ? '' : String(c.capacity));
  async function save() {
    setBusy(true);
    try {
      await api.put(`/admin/insights/capacity/${encodeURIComponent(c.id)}`, {
        capacity: v === '' ? null : Number(v),
      });
      toast(v === '' ? `${c.name}: capacity cleared` : `${c.name}: ${v} orders a morning`);
      onChanged();
    } catch (e) {
      toast(e.message || 'Could not save the capacity', 'err');
    } finally {
      setBusy(false);
    }
  }
  const u = c.utilisationPct;
  return (
    <tr>
      <td className="data__name" style={{ fontWeight: 600 }}>
        {c.name}
      </td>
      <td>
        <div className="hstack" style={{ gap: 6 }}>
          <input
            className="field__input cell-input"
            inputMode="numeric"
            value={v}
            placeholder="Not set"
            aria-label={`Capacity for ${c.name}`}
            onChange={(e) => setV(num(e.target.value, { integer: true, max: 100000 }))}
            onKeyDown={(e) => e.key === 'Enter' && dirty && save()}
          />
          {dirty && (
            <button className="btn btn--primary btn--sm" onClick={save} disabled={busy}>
              Save
            </button>
          )}
        </div>
      </td>
      <td className="num">{n0(c.avgPerMorning)}</td>
      <td className="num">{c.peakMorning}</td>
      <td style={{ minWidth: 130 }}>
        {u == null ? (
          <span className="muted">—</span>
        ) : (
          <>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>{pctText(u)}</div>
            <Bar pct={u} tone={u >= 90 ? 'tomato' : u >= 70 ? 'amber' : 'leaf'} />
          </>
        )}
      </td>
      <td className="num">{c.mornings}</td>
    </tr>
  );
}

// ── 4. promise ──────────────────────────────────────────────────────────────

function PromiseTab({ p, reasons, onChanged }) {
  return (
    <div className="vstack" style={{ gap: 16 }}>
      <div className="stat-grid stagger">
        <Stat
          icon={<IconClock size={20} />}
          tint="sprout"
          value={pctText(p.onTimePct)}
          label={`On time at the door (${p.onTime} of ${p.delivered} delivered)`}
        />
        <Stat
          icon={<IconReceipt size={20} />}
          value={p.deliveries}
          label="Deliveries due in the range"
        />
        <Stat icon={<IconClock size={20} />} value={p.late.length} label="Late or overdue" />
        <Stat
          icon={<IconRupee size={20} />}
          value={`${p.refunds.done} / ${p.refunds.due}`}
          label="Refunds made / due"
          delta={
            p.refunds.failed > 0 ? { kind: 'flat', text: `${p.refunds.failed} failed` } : undefined
          }
        />
      </div>
      <Card
        title="Late and overdue deliveries"
        pad={false}
        hint="Record why each one was late, so the pattern shows over the weeks. Overdue means the slot has ended and it is still not delivered."
      >
        {p.late.length === 0 ? (
          <Empty>Every delivery in this range was on time.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Community</th>
                  <th>Due</th>
                  <th>State</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {p.late.map((o) => (
                  <tr key={o.id}>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {o.orderNumber}
                    </td>
                    <td className="data__name">{o.communityName || '—'}</td>
                    <td className="data__name">
                      {shortDate(o.deliveryDate)}
                      <div className="muted" style={{ fontSize: 12 }}>
                        {sentence(o.window)}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`pill ${o.state === 'OVERDUE' ? 'pill--tomato' : 'pill--amber'}`}
                      >
                        {o.state === 'OVERDUE' ? 'Overdue' : `${o.minutesLate} min late`}
                      </span>
                      {o.deliveredAt && (
                        <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                          Delivered {dateTime(o.deliveredAt)}
                        </div>
                      )}
                    </td>
                    <td>
                      <DelayEditor o={o} reasons={reasons} onChanged={onChanged} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Refunds on cancelled orders" pad={false}>
        {p.refunds.list.length === 0 ? (
          <Empty>No paid orders were cancelled in this range.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Order</th>
                  <th className="num">Paid</th>
                  <th>Refund</th>
                  <th className="num">Hours to wallet refund</th>
                </tr>
              </thead>
              <tbody>
                {p.refunds.list.map((x) => (
                  <tr key={x.orderNumber}>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {x.orderNumber}
                    </td>
                    <td className="num">{inr(x.paidPaise)}</td>
                    <td>
                      <span
                        className={`pill ${x.failed ? 'pill--tomato' : x.done ? 'pill--leaf' : 'pill--amber'}`}
                      >
                        {x.failed ? 'Failed' : x.done ? 'Made' : 'Still due'}
                      </span>
                    </td>
                    <td className="num">
                      {x.hoursToWalletRefund == null ? '—' : n0(x.hoursToWalletRefund)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function DelayEditor({ o, reasons, onChanged }) {
  const [reason, setReason] = useState(o.reason || '');
  const [note, setNote] = useState(o.reasonNote || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setReason(o.reason || '');
    setNote(o.reasonNote || '');
  }, [o.reason, o.reasonNote]);
  const dirty = reason !== (o.reason || '') || note !== (o.reasonNote || '');

  async function save() {
    if (!reason) return toast('Pick a reason first.', 'err');
    setBusy(true);
    try {
      await api.put(`/admin/insights/delays/${encodeURIComponent(o.id)}`, {
        reason,
        note: note.trim() || null,
      });
      toast(`${o.orderNumber}: reason saved`);
      onChanged();
    } catch (e) {
      toast(e.message || 'Could not save the reason', 'err');
    } finally {
      setBusy(false);
    }
  }
  async function clear() {
    if (!confirm(`Clear the late reason on ${o.orderNumber}?`)) return;
    setBusy(true);
    try {
      await api.del(`/admin/insights/delays/${encodeURIComponent(o.id)}`);
      toast(`${o.orderNumber}: reason cleared`);
      onChanged();
    } catch (e) {
      toast(e.message || 'Could not clear the reason', 'err');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
      <select
        className="field__select"
        style={{ width: 200, padding: '7px 10px', fontSize: 13 }}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        aria-label={`Why ${o.orderNumber} was late`}
      >
        <option value="">Not recorded</option>
        {Object.entries(reasons || {}).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <input
        className="field__input"
        style={{ width: 180, padding: '7px 10px', fontSize: 13 }}
        value={note}
        maxLength={200}
        placeholder="Note (optional)"
        onChange={(e) => setNote(noLead(e.target.value))}
      />
      {dirty && (
        <button className="btn btn--primary btn--sm" onClick={save} disabled={busy}>
          Save
        </button>
      )}
      {o.reason && !dirty && (
        <button className="btn btn--ghost btn--sm" onClick={clear} disabled={busy}>
          Clear
        </button>
      )}
    </div>
  );
}

// ── 5. offers ───────────────────────────────────────────────────────────────

function Offers({ o }) {
  return (
    <div className="vstack" style={{ gap: 16 }}>
      <div className="stat-grid stagger">
        <Stat
          icon={<IconReceipt size={20} />}
          tint="sprout"
          value={o.orders}
          label="Orders in the range"
        />
        <Stat icon={<IconTicket size={20} />} value={o.withCoupon} label="With a coupon" />
        <Stat
          icon={<IconRupee size={20} />}
          value={inr(o.aovNoCouponPaise)}
          label="Average order, no coupon"
        />
        <Stat
          icon={<IconTrend size={20} />}
          value={pctText(o.marginNoCouponPct)}
          label="Margin, no coupon"
        />
      </div>
      <Card
        title="Coupon by coupon"
        pad={false}
        hint="Came back = new customers from the coupon who have ordered again since. Cost per new customer = the discount given ÷ the new customers it brought. Margin is item sales less produce cost and the discount."
      >
        {o.coupons.length === 0 ? (
          <Empty>No coupons used in this range.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Coupon</th>
                  <th className="num">Orders</th>
                  <th className="num">New customers</th>
                  <th className="num">Came back</th>
                  <th className="num">Discount given</th>
                  <th className="num">Avg order</th>
                  <th className="num">vs no coupon</th>
                  <th className="num">Margin after discount</th>
                  <th className="num">Cost per new customer</th>
                </tr>
              </thead>
              <tbody>
                {o.coupons.map((c) => {
                  const diff = Number(c.aovVsNoCouponPaise);
                  const used = c.orders > 0;
                  const dash = <span className="muted">—</span>;
                  return (
                    <tr key={c.code}>
                      <td className="data__name">
                        <span className="mono" style={{ fontWeight: 700 }}>
                          {c.code}
                        </span>
                        {!c.active && (
                          <span className="pill" style={{ marginLeft: 6 }}>
                            Paused
                          </span>
                        )}
                      </td>
                      <td className="num">{c.orders}</td>
                      <td className="num">{c.newCustomers}</td>
                      <td className="num">{c.newCustomersCameBack}</td>
                      <td className="num">{inr(c.discountPaise)}</td>
                      <td className="num">{used ? inr(c.aovPaise) : dash}</td>
                      <td
                        className="num"
                        style={{
                          color: !used
                            ? undefined
                            : diff > 0
                              ? 'var(--leaf-deep)'
                              : diff < 0
                                ? 'var(--tomato)'
                                : undefined,
                        }}
                      >
                        {used
                          ? `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${inr(Math.abs(diff))}`
                          : dash}
                      </td>
                      <td className="num">
                        {used ? (
                          <>
                            {inr(c.marginAfterDiscountPaise)}{' '}
                            <span className="muted">({pctText(c.marginAfterDiscountPct)})</span>
                          </>
                        ) : (
                          dash
                        )}
                      </td>
                      <td className="num">
                        {c.costPerNewCustomerPaise == null ? '—' : inr(c.costPerNewCustomerPaise)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── products: winners and losers ─────────────────────────────────────────────

const SORTS = {
  orders: { label: 'Orders', of: (p) => p.orders },
  revenue: { label: 'Sales', of: (p) => Number(p.revenuePaise) },
  profit: { label: 'Profit', of: (p) => Number(p.profitPaise) },
  margin: { label: 'Margin', of: (p) => p.marginPct },
};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const UNIT = { KG: 'kg', BUNCH: 'bunch', PIECE: 'pc', DOZEN: 'dozen', PACK: 'pack' };

function Products({ qs }) {
  const { data, loading, error, reload } = useResource(`/admin/insights/products?${qs}`);
  const [cat, setCat] = useState('all');
  const [sort, setSort] = useState({ key: 'profit', dir: -1 });
  const rows = useMemo(() => {
    const list = (data?.products || []).filter((p) => cat === 'all' || p.categoryId === cat);
    const of = SORTS[sort.key].of;
    return [...list].sort((a, b) => (of(a) - of(b)) * sort.dir || a.name.localeCompare(b.name));
  }, [data, cat, sort]);

  async function park(p) {
    if (
      !confirm(
        `Park ${p.name}?\n\nIt will be hidden from the app catalog (availability: Hidden). You can bring it back any time from Products.`,
      )
    )
      return;
    try {
      await api.patch(`/admin/products/${p.id}`, { availability: 'HIDDEN' });
      toast(`${p.name} parked — hidden from the app`);
      reload();
    } catch (e) {
      toast(e.message || 'Could not park the product', 'err');
    }
  }

  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!data)
    return (
      <div className="glass card">
        <TableSkeleton rows={6} />
      </div>
    );

  const counts = (id) =>
    (data.products || []).filter((p) => id === 'all' || p.categoryId === id).length;
  const sheetTabs = [
    { key: 'all', label: 'All', count: counts('all') },
    ...data.categories.map((c) => ({ key: c.id, label: c.name, count: counts(c.id) })),
  ];
  const th = (key, align = 'num') => (
    <th
      className={`${align} sortable`}
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : -1 }))}
      aria-sort={sort.key === key ? (sort.dir < 0 ? 'descending' : 'ascending') : 'none'}
    >
      {SORTS[key].label}
      {sort.key === key ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}
    </th>
  );

  return (
    <div className="vstack" style={{ gap: 16, opacity: loading ? 0.6 : 1 }}>
      <div className="grid-2 grid-2--even">
        <Card title="Winners · most profit">
          {data.winners.length === 0 ? (
            <Empty>Nothing sold in this range.</Empty>
          ) : (
            <ol className="vstack" style={{ gap: 0, margin: 0, padding: 0, listStyle: 'none' }}>
              {data.winners.map((p, i) => (
                <li
                  key={p.id}
                  className="hstack"
                  style={{
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderTop: i ? '1px solid var(--hairline)' : 'none',
                  }}
                >
                  <span>
                    <b>{p.name}</b>{' '}
                    <span className="muted" style={{ fontSize: 12 }}>
                      {plural(p.orders, 'order')} · {pctText(p.marginPct)} margin
                    </span>
                  </span>
                  <span className="rupee" style={{ color: 'var(--leaf-deep)' }}>
                    {inr(p.profitPaise)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card
          title="Losers · least ordered"
          hint={`${data.neverOrdered} live ${data.neverOrdered === 1 ? 'product was' : 'products were'} not ordered at all in this range. Parking hides a product from the app; it stays in Products.`}
        >
          {data.losers.length === 0 ? (
            <Empty>No live products.</Empty>
          ) : (
            <ol className="vstack" style={{ gap: 0, margin: 0, padding: 0, listStyle: 'none' }}>
              {data.losers.map((p, i) => (
                <li
                  key={p.id}
                  className="hstack"
                  style={{
                    justifyContent: 'space-between',
                    padding: '7px 0',
                    borderTop: i ? '1px solid var(--hairline)' : 'none',
                  }}
                >
                  <span>
                    <b>{p.name}</b>{' '}
                    <span className="muted" style={{ fontSize: 12 }}>
                      {p.orders === 0
                        ? 'no orders'
                        : `${plural(p.orders, 'order')} · ${inr(p.profitPaise)} profit`}
                    </span>
                  </span>
                  {p.availability !== 'HIDDEN' && (
                    <button className="btn btn--ghost btn--sm" onClick={() => park(p)}>
                      Park product
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <div className="glass card reveal" style={{ padding: 0 }}>
        <div style={{ paddingTop: 14 }}>
          <Tabs sheet tabs={sheetTabs} value={cat} onChange={setCat} />
        </div>
        {rows.length === 0 ? (
          <Empty>No products in this category.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  {th('orders')}
                  <th className="num">Units</th>
                  {th('revenue')}
                  <th className="num">Cost</th>
                  {th('profit')}
                  {th('margin')}
                  <th className="num">Share of sales</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="data__name" style={{ fontWeight: 600 }}>
                      {p.name}
                      {p.availability !== 'AVAILABLE' && (
                        <span className="pill" style={{ marginLeft: 6 }}>
                          {sentence(p.availability)}
                        </span>
                      )}
                    </td>
                    <td className="data__name muted">{p.category}</td>
                    <td className="num">{p.orders}</td>
                    <td className="num">
                      {n0(p.units, 2)} {UNIT[p.unit] || ''}
                    </td>
                    <td className="num">{inr(p.revenuePaise)}</td>
                    <td className="num">{inr(p.costPaise)}</td>
                    <td
                      className="num"
                      style={{
                        fontWeight: 600,
                        color: Number(p.profitPaise) < 0 ? 'var(--tomato)' : undefined,
                      }}
                    >
                      {inr(p.profitPaise)}
                    </td>
                    <td className="num">{pctText(p.marginPct)}</td>
                    <td className="num">{pctText(p.revenueSharePct)}</td>
                    <td className="row-actions-cell">
                      {p.isActive &&
                        p.availability !== 'HIDDEN' &&
                        data.losers.some((l) => l.id === p.id) && (
                          <button className="btn btn--ghost btn--sm" onClick={() => park(p)}>
                            Park product
                          </button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="field__hint" style={{ padding: '0 16px 14px' }}>
          Counted by delivery date, cancelled orders left out. Click Orders, Sales, Profit or Margin
          to sort.
        </p>
      </div>
    </div>
  );
}
