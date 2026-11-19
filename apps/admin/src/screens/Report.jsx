/**
 * Friday report — the eleven numbers in Rapture7's Developer Tracking Brief (19 Nov 2026), for one
 * Monday–Sunday week, plus what feeds them:
 *
 *   Report           the eleven metrics, and the weekly export (xlsx: Metrics, Orders, Customers,
 *                    Events). Households are one-way keys — no names, numbers or flats — so the
 *                    file can go to the agency as it is.
 *   Counter sessions when and where a counter ran, and who staffed it — "assisted first orders per
 *                    session" is measured against these.
 *   Events           the tracking events as they arrive (sign-in, order placed, delivered, …).
 *   Offer & reminder the launch offer (OFF until approved), the 5 PM reminder, morning capacity.
 *
 * API: GET /admin/report/weekly(.xlsx)?week=YYYY-MM-DD, /admin/growth/counter-sessions,
 * GET /admin/events, GET|PUT /admin/business/settings/:name.
 */
import { useEffect, useState } from 'react';
import { toast, useResource } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { Drawer, ErrorNote, Stat, TableSkeleton } from '../components/ui.jsx';
import {
  IconClock,
  IconDownload,
  IconEdit,
  IconPlus,
  IconRupee,
  IconTrash,
  IconTrend,
  IconTruck,
  IconUsers,
} from '../components/icons.jsx';
import { Bar, SetupBanner, Tabs, addDays, istToday, pctText } from '../components/business.jsx';
import { dateTime, inr, shortDate } from '../lib/format.js';

const TABS = [
  { key: 'report', label: 'Report' },
  { key: 'sessions', label: 'Counter sessions' },
  { key: 'events', label: 'Events' },
  { key: 'settings', label: 'Offer & reminder' },
];

/** Monday of the week that holds `iso`. */
function mondayOf(iso) {
  const wd = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(iso, -wd);
}

const rupees = (paise) => (paise == null ? '—' : inr(paise));

export function Report() {
  const [tab, setTab] = useState('report');
  // The default is the week that holds yesterday — on a Friday, the week so far.
  const [week, setWeek] = useState(() => mondayOf(addDays(istToday(), -1)));
  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Friday report</h1>
          <p className="page-sub">
            The tracking brief’s eleven numbers, week of {shortDate(week)} to{' '}
            {shortDate(addDays(week, 6))}.
          </p>
        </div>
        <div className="hstack" style={{ gap: 8 }}>
          <button className="btn" onClick={() => setWeek((w) => addDays(w, -7))}>
            ← Previous week
          </button>
          <button
            className="btn"
            disabled={addDays(week, 7) > istToday()}
            onClick={() => setWeek((w) => addDays(w, 7))}
          >
            Next week →
          </button>
        </div>
      </header>
      <SetupBanner />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'report' && <WeeklyReport week={week} />}
      {tab === 'sessions' && <CounterSessions week={week} />}
      {tab === 'events' && <Events week={week} />}
      {tab === 'settings' && <OfferSettings />}
    </>
  );
}

function Card({ title, children, hint = null }) {
  return (
    <div className="glass card reveal">
      {title && (
        <div className="card__head">
          <h2 className="card__title" style={{ fontSize: 15 }}>
            {title}
          </h2>
        </div>
      )}
      {children}
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

function KeyTable({ rows, label = 'Group', value = 'Count', fmt = (x) => x }) {
  if (!rows || rows.length === 0)
    return (
      <div className="empty" style={{ padding: '20px 12px' }}>
        Nothing this week.
      </div>
    );
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{label}</th>
            <th style={{ textAlign: 'right' }}>{value}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.key}</td>
              <td style={{ textAlign: 'right' }} className="mono">
                {fmt(r.n)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── the eleven metrics ──────────────────────────────────────────────────────

function WeeklyReport({ week }) {
  const { data: r, error, reload, loading } = useResource(`/admin/report/weekly?week=${week}`);
  const [busy, setBusy] = useState(false);
  async function exportXlsx() {
    setBusy(true);
    try {
      await api.download(`/admin/report/weekly.xlsx?week=${week}`, `fooducia-weekly-${week}.xlsx`);
      toast('Weekly export downloaded');
    } catch (e) {
      toast(e.message || 'Could not download the export.', 'error');
    } finally {
      setBusy(false);
    }
  }
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!r) return <TableSkeleton rows={8} />;
  return (
    <div className="vstack" style={{ gap: 16, opacity: loading ? 0.6 : 1 }}>
      <div
        className="hstack"
        style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}
      >
        <p className="field__hint" style={{ margin: 0 }}>
          Generated {dateTime(r.generatedAt)}. Households in the export are one-way keys — no names,
          phone numbers or flats.
        </p>
        <button className="btn btn--primary" onClick={exportXlsx} disabled={busy}>
          <IconDownload size={17} /> {busy ? 'Preparing…' : 'Download weekly export (.xlsx)'}
        </button>
      </div>

      <div className="stat-grid stagger">
        <Stat
          icon={<IconUsers size={20} />}
          tint="sprout"
          value={r.northStar.households}
          label="1 · Households that ordered this week"
        />
        <Stat
          icon={<IconUsers size={20} />}
          value={r.assisted.perSession ?? '—'}
          label="2 · Assisted first orders per counter session"
        />
        <Stat
          icon={<IconTrend size={20} />}
          value={pctText(r.secondOrder.within7Pct)}
          label="3 · Second order within 7 days of first delivery"
        />
        <Stat
          icon={<IconTrend size={20} />}
          value={r.threeWeeks.households}
          label="4 · Households ordering three weeks running"
        />
      </div>

      <div className="grid-2 grid-2--even">
        <Card
          title="1 · Ordering households by community"
          hint="The north star: households that placed at least one order this week."
        >
          <KeyTable rows={r.northStar.byCommunity} label="Community" value="Households" />
        </Card>
        <Card
          title="2 · Counter sessions"
          hint="First orders during a session at that community, or tagged with a promoter who staffed it. Scans are anonymous QR counts."
        >
          {r.assisted.rows.length === 0 ? (
            <div className="empty" style={{ padding: '20px 12px' }}>
              No counter sessions logged this week. Add them on the Counter sessions tab.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Session</th>
                    <th style={{ textAlign: 'right' }}>Scans</th>
                    <th style={{ textAlign: 'right' }}>First orders</th>
                  </tr>
                </thead>
                <tbody>
                  {r.assisted.rows.map((s) => (
                    <tr key={s.id}>
                      <td>
                        {s.community}
                        <div className="muted" style={{ fontSize: 12 }}>
                          {shortDate(s.date)} · {s.start}–{s.end}
                          {s.promoters ? ` · ${s.promoters}` : ''}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }} className="mono">
                        {s.scans}
                      </td>
                      <td style={{ textAlign: 'right' }} className="mono">
                        {s.assistedFirstOrders}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="grid-2 grid-2--even">
        <Card
          title="3 · Second order, by week of first delivery"
          hint={`Judged once the window has passed. 7 days: ${r.secondOrder.hit7}/${r.secondOrder.eligible7}. 30 days: ${r.secondOrder.hit30}/${r.secondOrder.eligible30} (${pctText(r.secondOrder.within30Pct)}).`}
        >
          {r.secondOrder.cohorts.length === 0 ? (
            <div className="empty" style={{ padding: '20px 12px' }}>
              No first deliveries old enough to judge yet.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Cohort week</th>
                    <th style={{ textAlign: 'right' }}>Within 7 days</th>
                    <th style={{ textAlign: 'right' }}>Within 30 days</th>
                  </tr>
                </thead>
                <tbody>
                  {r.secondOrder.cohorts.map((c) => (
                    <tr key={c.cohortWeek || c.key}>
                      <td>{c.cohortWeek ? shortDate(c.cohortWeek) : c.key}</td>
                      <td style={{ textAlign: 'right' }} className="mono">
                        {pctText(c.within7Pct)}
                      </td>
                      <td style={{ textAlign: 'right' }} className="mono">
                        {pctText(c.within30Pct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card
          title="5 · Orders and kilos per morning"
          hint={`Measured against ${r.capacity.capacityKg} kg a morning (change it on Offer & reminder). Kilos count items sold by weight.`}
        >
          {r.capacity.days.length === 0 ? (
            <div className="empty" style={{ padding: '20px 12px' }}>
              No deliveries this week.
            </div>
          ) : (
            <div className="vstack" style={{ gap: 10 }}>
              {r.capacity.days.map((d) => (
                <div key={d.date}>
                  <div className="hstack" style={{ justifyContent: 'space-between', fontSize: 13 }}>
                    <span>
                      {shortDate(d.date)} · {d.orders} orders
                    </span>
                    <span className="mono">
                      {d.kg} kg · {pctText(d.capacityPct)}
                    </span>
                  </div>
                  <Bar
                    pct={Math.min(100, d.capacityPct || 0)}
                    tone={(d.capacityPct || 0) > 90 ? 'tomato' : 'leaf'}
                  />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="stat-grid stagger">
        <Stat
          icon={<IconRupee size={20} />}
          value={rupees(r.basketValue.firstPaise)}
          label={`6 · Average 1st basket (${r.basketValue.counts.first})`}
        />
        <Stat
          icon={<IconRupee size={20} />}
          value={rupees(r.basketValue.secondPaise)}
          label={`6 · Average 2nd basket (${r.basketValue.counts.second})`}
        />
        <Stat
          icon={<IconRupee size={20} />}
          value={rupees(r.basketValue.laterPaise)}
          label={`6 · Average later basket (${r.basketValue.counts.later})`}
        />
        <Stat
          icon={<IconTruck size={20} />}
          tint="sprout"
          value={pctText(r.onTime.onTimePct)}
          label={`8 · On time, ${r.onTime.onTime}/${r.onTime.delivered} delivered`}
        />
      </div>

      <div className="grid-2 grid-2--even">
        <Card
          title="7 · Discount cost and the margin left"
          hint="Margin left = sales − discounts − packaging, delivery staff, transport and fuel expenses for the week (Finance)."
        >
          <div className="vstack" style={{ gap: 6, fontSize: 14 }}>
            <Row k="Sales (before discount)" v={rupees(r.discounts.revenuePaise)} />
            {r.discounts.byType.map((d) => (
              <Row key={d.type} k={`Discount · ${typeLabel(d.type)}`} v={`− ${rupees(d.paise)}`} />
            ))}
            <Row
              k="Packaging and delivery"
              v={`− ${rupees(r.discounts.packagingAndDeliveryPaise)}`}
            />
            <Row
              k={<b>Left after both</b>}
              v={
                <b>
                  {rupees(r.discounts.marginLeftPaise)} · {pctText(r.discounts.marginLeftPct)}
                </b>
              }
            />
          </div>
        </Card>
        <Card
          title="9 · Refunds and replacements"
          hint={`${r.refunds.refundedOrReplaced} of ${r.refunds.delivered} delivered orders (${pctText(r.refunds.ratePct)}).`}
        >
          <KeyTable rows={r.refunds.byReason} label="Reason" value="Orders" />
        </Card>
      </div>

      <div className="grid-2 grid-2--even">
        <Card
          title="10 · First orders that came from a neighbour"
          hint={`${r.referral.withReferrer} of ${r.referral.firstOrders} first orders (${pctText(r.referral.sharePct)}).`}
        >
          <KeyTable rows={r.referral.byCommunity} label="Community" value="Referred first orders" />
        </Card>
        <Card
          title="11 · Waitlist votes"
          hint={`${r.waitlist.votes} votes this week for areas we do not deliver to yet.`}
        >
          <KeyTable rows={r.waitlist.byArea} label="Area / community" value="Votes" />
        </Card>
      </div>

      <Card title="8 · On time by community">
        <KeyTable
          rows={(r.onTime.byCommunity || []).map((x) => ({
            key: x.key,
            n: `${x.onTime}/${x.delivered} · ${pctText(x.onTimePct)}`,
          }))}
          label="Community"
          value="On time"
        />
      </Card>
    </div>
  );
}

const typeLabel = (t) =>
  ({
    COUPON: 'coupons',
    LAUNCH_FIRST: 'launch offer, 1st order',
    LAUNCH_SECOND: 'launch offer, 2nd order',
    REFERRAL_CREDIT: 'neighbour ₹30 credits',
  })[t] || String(t).toLowerCase();

const Row = ({ k, v }) => (
  <div className="hstack" style={{ justifyContent: 'space-between' }}>
    <span>{k}</span>
    <span className="mono">{v}</span>
  </div>
);

// ── counter sessions ────────────────────────────────────────────────────────

function CounterSessions({ week }) {
  const { data, error, reload } = useResource(
    `/admin/growth/counter-sessions?from=${week}&to=${addDays(week, 6)}`,
  );
  const communities = useResource('/admin/communities');
  const [edit, setEdit] = useState(null);
  async function remove(s) {
    if (!window.confirm(`Delete the session at ${s.communityName} on ${shortDate(s.date)}?`))
      return;
    try {
      await api.del(`/admin/growth/counter-sessions/${s.id}`);
      toast('Session deleted');
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  }
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  const list = data?.sessions || [];
  return (
    <Card
      title="Counter sessions this week"
      hint="Log every counter: the report credits first orders placed at that community during the session, or tagged with a promoter who staffed it."
    >
      <div className="hstack" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
        <button
          className="btn btn--primary"
          onClick={() =>
            setEdit({ date: istToday(), start: '17:00', end: '20:00', promoterCodes: [] })
          }
        >
          <IconPlus size={17} /> Add a session
        </button>
      </div>
      {!data ? (
        <TableSkeleton rows={3} />
      ) : list.length === 0 ? (
        <div className="empty" style={{ padding: '20px 12px' }}>
          No sessions logged this week.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Community</th>
                <th>Promoters</th>
                <th>Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td>
                    {shortDate(s.date)} · {s.start}–{s.end}
                  </td>
                  <td>{s.communityName}</td>
                  <td className="mono">{s.promoterCodes.join(', ') || '—'}</td>
                  <td>{s.note || '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      className="btn btn--ghost btn--sm"
                      aria-label="Edit session"
                      onClick={() => setEdit(s)}
                    >
                      <IconEdit size={15} />
                    </button>
                    <button
                      className="btn btn--ghost btn--sm"
                      aria-label="Delete session"
                      onClick={() => remove(s)}
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
      {edit && (
        <SessionDrawer
          session={edit}
          communities={communities.data?.communities || []}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            reload();
          }}
        />
      )}
    </Card>
  );
}

function SessionDrawer({ session, communities, onClose, onSaved }) {
  const [f, setF] = useState({
    communityId: session.communityId || communities[0]?.id || '',
    date: session.date,
    start: session.start,
    end: session.end,
    promoterCodes: (session.promoterCodes || []).join(', '),
    note: session.note || '',
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!f.communityId && communities[0]) setF((x) => ({ ...x, communityId: communities[0].id }));
  }, [communities, f.communityId]);
  async function save() {
    setBusy(true);
    const body = {
      communityId: f.communityId,
      date: f.date,
      start: f.start,
      end: f.end,
      promoterCodes: f.promoterCodes.split(/[\s,]+/).filter(Boolean),
      note: f.note.trim() || null,
    };
    try {
      if (session.id) await api.patch(`/admin/growth/counter-sessions/${session.id}`, body);
      else await api.post('/admin/growth/counter-sessions', body);
      toast(session.id ? 'Session saved' : 'Session added');
      onSaved();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Drawer
      title={session.id ? 'Edit counter session' : 'Add a counter session'}
      subtitle="Where and when the counter ran, and who staffed it."
      onClose={onClose}
      footer={
        <div className="hstack" style={{ justifyContent: 'flex-end', width: '100%' }}>
          <button className="btn btn--primary" onClick={save} disabled={busy || !f.communityId}>
            {busy ? 'Saving…' : 'Save session'}
          </button>
        </div>
      }
    >
      <div className="vstack" style={{ gap: 12 }}>
        <label className="field">
          <span className="field__label">Community</span>
          <select className="field__input" value={f.communityId} onChange={set('communityId')}>
            {communities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Date</span>
          <input type="date" className="field__input" value={f.date} onChange={set('date')} />
        </label>
        <div className="hstack" style={{ gap: 10 }}>
          <label className="field" style={{ flex: 1 }}>
            <span className="field__label">From</span>
            <input type="time" className="field__input" value={f.start} onChange={set('start')} />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span className="field__label">To</span>
            <input type="time" className="field__input" value={f.end} onChange={set('end')} />
          </label>
        </div>
        <label className="field">
          <span className="field__label">Promoter codes</span>
          <input
            className="field__input mono"
            placeholder="RAVI01, PR02"
            value={f.promoterCodes}
            onChange={set('promoterCodes')}
          />
          <span className="field__hint">
            The codes of the people at the counter (Growth → Promoters).
          </span>
        </label>
        <label className="field">
          <span className="field__label">Note</span>
          <input
            className="field__input"
            placeholder="Gate 2, with tasting"
            value={f.note}
            onChange={set('note')}
            maxLength={200}
          />
        </label>
      </div>
    </Drawer>
  );
}

// ── events ──────────────────────────────────────────────────────────────────

function Events({ week }) {
  const [name, setName] = useState('');
  const q = `/admin/events?from=${week}&to=${addDays(week, 6)}${name ? `&name=${name}` : ''}`;
  const { data, error, reload } = useResource(q);
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!data) return <TableSkeleton rows={6} />;
  return (
    <Card
      title="Tracking events"
      hint="Recorded on our own server — no third-party analytics. Events carry business facts only: never a name, phone number or flat. The latest 500 are shown."
    >
      <div className="daterange" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className={`chip${!name ? ' is-active' : ''}`}
          onClick={() => setName('')}
        >
          All
        </button>
        {data.names.map((n) => (
          <button
            key={n}
            type="button"
            className={`chip${name === n ? ' is-active' : ''}`}
            onClick={() => setName(n)}
          >
            {n} <span className="muted">{data.counts[n] || 0}</span>
          </button>
        ))}
      </div>
      {data.events.length === 0 ? (
        <div className="empty" style={{ padding: '20px 12px' }}>
          No events this week.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>Properties</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((e) => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{dateTime(e.at)}</td>
                  <td className="mono">{e.name}</td>
                  <td className="mono" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>
                    {Object.entries(e.props || {})
                      .filter(([, v]) => v !== null && v !== '')
                      .map(([k, v]) => `${k}=${v}`)
                      .join('  ')}
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

// ── launch offer, reminder, capacity ────────────────────────────────────────

function OfferSettings() {
  const offer = useResource('/admin/business/settings/launchOffer');
  const rem = useResource('/admin/business/settings/reminders');
  const rep = useResource('/admin/business/settings/report');
  if (offer.error) return <ErrorNote error={offer.error} onRetry={offer.reload} />;
  if (!offer.data || !rem.data || !rep.data) return <TableSkeleton rows={6} />;
  return (
    <div className="vstack" style={{ gap: 16 }}>
      <LaunchOffer s={offer.data.settings} onSaved={offer.reload} />
      <div className="grid-2 grid-2--even">
        <Reminder s={rem.data.settings} onSaved={rem.reload} />
        <Capacity s={rep.data.settings} onSaved={rep.reload} />
      </div>
    </div>
  );
}

async function saveSettings(name, body, done) {
  try {
    await api.put(`/admin/business/settings/${name}`, body);
    toast('Saved');
    done();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function LaunchOffer({ s, onSaved }) {
  const [f, setF] = useState({
    ...s,
    secondOrderThreshold: s.secondOrderThresholdPaise / 100,
    secondOrderCap: s.secondOrderCapPaise / 100,
  });
  const num = (k) => (e) =>
    setF((x) => ({ ...x, [k]: e.target.value === '' ? '' : Number(e.target.value) }));
  const save = (patch = {}) =>
    saveSettings(
      'launchOffer',
      {
        enabled: f.enabled,
        startDate: f.startDate,
        endDate: f.endDate,
        firstOrderPct: Number(f.firstOrderPct),
        secondOrderWithinDays: Number(f.secondOrderWithinDays),
        secondOrderThresholdPaise: Math.round(Number(f.secondOrderThreshold) * 100),
        secondOrderPct: Number(f.secondOrderPct),
        secondOrderCapPaise: Math.round(Number(f.secondOrderCap) * 100),
        secondOrderLowPct: Number(f.secondOrderLowPct),
        ...patch,
      },
      onSaved,
    );
  return (
    <Card
      title="Launch offer"
      hint="One discount per order: a coupon the customer applies wins and the offer stands aside. The app shows the offer in the cart and the bill. Switch it on only once the rules are approved."
    >
      <div
        className="hstack"
        style={{ justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}
      >
        <span className={`badge ${s.enabled ? 'badge--located' : 'badge--unlocated'}`}>
          {s.enabled ? 'On — customers see it' : 'Off'}
        </span>
        <button
          className={`btn ${s.enabled ? '' : 'btn--primary'}`}
          onClick={() => {
            if (
              !s.enabled &&
              !window.confirm(
                'Switch the launch offer on? Every eligible customer gets it from their next cart.',
              )
            )
              return;
            save({ enabled: !s.enabled });
          }}
        >
          {s.enabled ? 'Switch off' : 'Switch on'}
        </button>
      </div>
      <div
        className="form-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
          gap: 12,
        }}
      >
        <label className="field">
          <span className="field__label">Orders placed from</span>
          <input
            type="date"
            className="field__input"
            value={f.startDate}
            onChange={(e) => setF((x) => ({ ...x, startDate: e.target.value }))}
          />
        </label>
        <label className="field">
          <span className="field__label">Until (inclusive)</span>
          <input
            type="date"
            className="field__input"
            value={f.endDate}
            onChange={(e) => setF((x) => ({ ...x, endDate: e.target.value }))}
          />
        </label>
        <label className="field">
          <span className="field__label">First order, % off</span>
          <input
            type="number"
            min="0"
            max="50"
            className="field__input"
            value={f.firstOrderPct}
            onChange={num('firstOrderPct')}
          />
        </label>
        <label className="field">
          <span className="field__label">2nd order within (days of 1st delivery)</span>
          <input
            type="number"
            min="1"
            max="60"
            className="field__input"
            value={f.secondOrderWithinDays}
            onChange={num('secondOrderWithinDays')}
          />
        </label>
        <label className="field">
          <span className="field__label">2nd order, % off at or above ₹</span>
          <input
            type="number"
            min="0"
            className="field__input"
            value={f.secondOrderThreshold}
            onChange={num('secondOrderThreshold')}
          />
        </label>
        <label className="field">
          <span className="field__label">… % off</span>
          <input
            type="number"
            min="0"
            max="50"
            className="field__input"
            value={f.secondOrderPct}
            onChange={num('secondOrderPct')}
          />
        </label>
        <label className="field">
          <span className="field__label">… capped at ₹</span>
          <input
            type="number"
            min="0"
            className="field__input"
            value={f.secondOrderCap}
            onChange={num('secondOrderCap')}
          />
        </label>
        <label className="field">
          <span className="field__label">2nd order below the threshold, % off</span>
          <input
            type="number"
            min="0"
            max="50"
            className="field__input"
            value={f.secondOrderLowPct}
            onChange={num('secondOrderLowPct')}
          />
        </label>
      </div>
      <div className="hstack" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn btn--primary" onClick={() => save()}>
          Save rules
        </button>
      </div>
    </Card>
  );
}

function Reminder({ s, onSaved }) {
  const [time, setTime] = useState(s.time);
  return (
    <Card
      title="5 PM cut-off reminder"
      hint="Once a day, an app notification to households that have notifications on and no order for tomorrow yet. WhatsApp joins once a Meta-approved reminder template is set up. Each day’s send appears in Weekly insights → Routine."
    >
      <div className="vstack" style={{ gap: 12 }}>
        <span className={`badge ${s.enabled ? 'badge--located' : 'badge--unlocated'}`}>
          {s.enabled ? 'On' : 'Off'}
        </span>
        <label className="field">
          <span className="field__label">
            <IconClock size={14} /> Send at (IST)
          </span>
          <input
            type="time"
            className="field__input"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
        <div className="hstack" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => saveSettings('reminders', { time }, onSaved)}>
            Save time
          </button>
          <button
            className={`btn ${s.enabled ? '' : 'btn--primary'}`}
            onClick={() => saveSettings('reminders', { enabled: !s.enabled, time }, onSaved)}
          >
            {s.enabled ? 'Switch off' : 'Switch on'}
          </button>
        </div>
      </div>
    </Card>
  );
}

function Capacity({ s, onSaved }) {
  const [kg, setKg] = useState(s.capacityKgPerMorning);
  return (
    <Card
      title="Morning capacity"
      hint="What one morning’s packing and delivery can carry. The report’s metric 5 measures each morning against it."
    >
      <div className="vstack" style={{ gap: 12 }}>
        <label className="field">
          <span className="field__label">Kilos per morning</span>
          <input
            type="number"
            min="1"
            className="field__input"
            value={kg}
            onChange={(e) => setKg(e.target.value)}
          />
        </label>
        <div className="hstack" style={{ justifyContent: 'flex-end' }}>
          <button
            className="btn btn--primary"
            onClick={() => saveSettings('report', { capacityKgPerMorning: Number(kg) }, onSaved)}
          >
            Save
          </button>
        </div>
      </div>
    </Card>
  );
}
