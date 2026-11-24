/**
 * Referral program (called "Growth" until 24 Nov 2026; the address is still /growth) — where new
 * customers come from, and the levers for it.
 *
 *   Promoters  the people at community stalls, each with a code a customer types at checkout. Their
 *              orders, first orders and sales for a date range; a printable QR card per person.
 *   Referrals  neighbour-invites-neighbour: who invited whom and what the reward cost.
 *   Waitlist   communities we do not deliver to yet, how many households are waiting in each, and
 *              the ones customers asked for (approve onto the waitlist, or decline).
 *   Settings   the referral reward, the welcome credit, the waitlist threshold and the
 *              "How did you hear about us?" question.
 *
 * API: /admin/growth/* (apps/api/src/routes/admin/business.js). Money is integer paise.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { goUrl } from '../lib/storeLinks.js';
import { toast, useResource } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { Drawer, ErrorNote, Stat, TableSkeleton } from '../components/ui.jsx';
import {
  IconEdit,
  IconPlus,
  IconPrint,
  IconQr,
  IconRupee,
  IconTrash,
  IconUsers,
} from '../components/icons.jsx';
import {
  Bar,
  DateRange,
  SetupBanner,
  Tabs,
  paiseFrom,
  rangeLabel,
  rupeeInput,
  sentence,
  useDateRange,
} from '../components/business.jsx';
import { dateTime, digits, inr, isMobile, noLead, num } from '../lib/format.js';
import logoFull from '../assets/fooducia-logo-full.png';

const TABS = [
  { key: 'promoters', label: 'Promoters' },
  { key: 'referrals', label: 'Neighbour invites' },
  { key: 'waitlist', label: 'Waitlist' },
  { key: 'settings', label: 'Settings' },
];

/**
 * The address a promoter's QR opens: /go tags the scan as a counter install for this promoter, and
 * on Android carries that tag through Google Play into the app (the install referrer).
 */
export const joinUrl = (code, communityId) =>
  goUrl({
    src: 'counter',
    p: code,
    c: communityId ? String(communityId).replace(/^com_/, '') : '',
  });

export function Growth() {
  const [tab, setTab] = useState('promoters');
  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Referral program</h1>
          <p className="page-sub">
            Where new customers come from: stalls, neighbours, and the waitlist.
          </p>
        </div>
      </header>
      <SetupBanner />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'promoters' && <Promoters />}
      {tab === 'referrals' && (
        <>
          <InviteRewards />
          <Referrals />
        </>
      )}
      {tab === 'waitlist' && <Waitlist />}
      {tab === 'settings' && <GrowthSettings />}
    </>
  );
}

// ── promoters ───────────────────────────────────────────────────────────────

function Promoters() {
  const dr = useDateRange('30d');
  const { data, loading, error, reload } = useResource(
    `/admin/growth/promoters${dr.qs ? `?${dr.qs}` : ''}`,
  );
  const promoters = data?.promoters || [];
  const communities = data?.communities || [];
  const [editing, setEditing] = useState(/** @type {any} */ (null)); // promoter | 'new'
  const [card, setCard] = useState(/** @type {any} */ (null));
  // Live at a stall: the numbers refresh by themselves while the page is in view.
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && reload(), 30e3);
    return () => clearInterval(t);
  }, [reload]);

  async function toggle(p) {
    try {
      await api.patch(`/admin/growth/promoters/${encodeURIComponent(p.code)}`, {
        active: !p.active,
      });
      toast(
        p.active
          ? `${p.code} switched off — the code no longer works`
          : `${p.code} is active again`,
      );
      reload();
    } catch (e) {
      toast(e.message || 'Could not update the promoter', 'err');
    }
  }
  async function remove(p) {
    if (
      !confirm(
        `Delete promoter ${p.code} (${p.name})?\n\nThe code stops working at checkout. Orders already credited to it stay counted.`,
      )
    )
      return;
    try {
      await api.del(`/admin/growth/promoters/${encodeURIComponent(p.code)}`);
      toast(`Promoter ${p.code} deleted`);
      reload();
    } catch (e) {
      toast(e.message || 'Could not delete the promoter', 'err');
    }
  }

  return (
    <>
      <div className="hstack" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <DateRange dr={dr} />
        <button
          className="btn btn--primary"
          onClick={() => setEditing('new')}
          style={{ marginBottom: 16 }}
        >
          <IconPlus size={17} /> Add promoter
        </button>
      </div>
      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : !data ? (
        <div className="glass card">
          <TableSkeleton rows={4} />
        </div>
      ) : promoters.length === 0 ? (
        <div className="glass card">
          <div className="empty">
            <p style={{ fontWeight: 600, color: 'var(--ink-2)' }}>No promoters yet.</p>
            <p style={{ marginTop: 6 }}>
              Add the person at each community stall. They get a code and a QR card to hand out.
            </p>
          </div>
        </div>
      ) : (
        <>
          {data.totals && (
            <div className="stat-grid" style={{ marginBottom: 16 }}>
              <Stat icon={<IconQr size={20} />} value={num(data.totals.scans)} label="QR scans" />
              <Stat
                icon={<IconUsers size={20} />}
                value={num(data.totals.signUps)}
                label="Sign-ups from a QR (Android)"
              />
              <Stat
                icon={<IconUsers size={20} />}
                tint="sprout"
                value={num(data.totals.firstOrders)}
                label="First orders"
              />
              <Stat
                icon={<IconRupee size={20} />}
                value={inr(data.totals.revenuePaise)}
                label={`Sales from ${num(data.totals.orders)} ${data.totals.orders === 1 ? 'order' : 'orders'}`}
              />
            </div>
          )}
          <div className="glass card reveal" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name · mobile</th>
                    <th>Stall · community</th>
                    <th>Status</th>
                    <th className="num">Scans</th>
                    <th className="num">Sign-ups</th>
                    <th className="num">First orders</th>
                    <th className="num">Orders</th>
                    <th className="num">Sales</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {promoters.map((p) => (
                    <tr key={p.code}>
                      <td className="mono" style={{ fontWeight: 700 }}>
                        {p.code}
                      </td>
                      <td>
                        <div className="data__name" style={{ fontWeight: 600 }}>
                          {p.name}
                        </div>
                        <div className="muted mono" style={{ fontSize: 12 }}>
                          {p.mobile || 'No mobile'}
                        </div>
                      </td>
                      <td>
                        <div className="data__name">
                          {p.stall || <span className="muted">No stall named</span>}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {p.communityName || 'Any community'}
                        </div>
                      </td>
                      <td>
                        <span className={`pill ${p.active ? 'pill--leaf' : ''}`}>
                          {p.active ? 'Active' : 'Switched off'}
                        </span>
                      </td>
                      <td className="num">
                        {p.scans ?? '—'}
                        {p.week && <ScanWeek week={p.week} />}
                      </td>
                      <td className="num">{p.signUps ?? '—'}</td>
                      <td className="num">
                        {p.firstOrders}
                        {p.typed > 0 && (
                          <div className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                            {p.typed} typed the code
                          </div>
                        )}
                      </td>
                      <td className="num">{p.orders}</td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {inr(p.revenuePaise)}
                      </td>
                      <td className="row-actions-cell">
                        <div className="row-actions">
                          <button className="btn btn--ghost btn--sm" onClick={() => setCard(p)}>
                            <IconQr size={15} /> QR card
                          </button>
                          <button className="btn btn--ghost btn--sm" onClick={() => setEditing(p)}>
                            <IconEdit size={15} /> Edit
                          </button>
                          <button className="btn btn--ghost btn--sm" onClick={() => toggle(p)}>
                            {p.active ? 'Switch off' : 'Switch on'}
                          </button>
                          <button
                            className="btn btn--ghost btn--icon"
                            style={{ color: 'var(--tomato)' }}
                            onClick={() => remove(p)}
                            aria-label={`Delete ${p.code}`}
                          >
                            <IconTrash size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="field__hint" style={{ padding: '0 16px 14px' }}>
              For {rangeLabel(dr.range)}, refreshed every 30 seconds. A scan is the QR page being
              opened, so one person can count twice. Sign-ups from a QR can be seen on Android only:
              Apple does not pass the QR through the App Store, so iPhone customers type the code
              and appear under first orders. Sales are item totals before fees, cancelled orders
              left out.
            </p>
          </div>
        </>
      )}
      {editing && (
        <PromoterDrawer
          promoter={editing === 'new' ? null : editing}
          communities={communities}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
      {card && <QrCardDrawer promoter={card} onClose={() => setCard(null)} />}
    </>
  );
}

/** Scans on each of the last seven days, as seven small bars. */
function ScanWeek({ week }) {
  const max = Math.max(1, ...week.map((d) => d.scans));
  const label = week.map((d) => `${d.day}: ${d.scans}`).join(', ');
  return (
    <div
      role="img"
      aria-label={`Scans by day. ${label}`}
      title={label}
      style={{
        display: 'flex',
        gap: 2,
        alignItems: 'flex-end',
        height: 18,
        marginTop: 4,
      }}
    >
      {week.map((d) => (
        <span
          key={d.day}
          style={{
            width: 5,
            height: d.scans ? Math.max(3, (d.scans / max) * 18) : 2,
            borderRadius: 2,
            background: d.scans ? 'var(--leaf)' : 'rgba(14,27,20,0.14)',
          }}
        />
      ))}
    </div>
  );
}

function PromoterDrawer({ promoter, communities, onClose, onSaved }) {
  const isNew = !promoter;
  const [f, setF] = useState({
    code: promoter?.code || '',
    name: promoter?.name || '',
    stall: promoter?.stall || '',
    communityId: promoter?.communityId || '',
    mobile: promoter?.mobile || '',
    active: promoter ? promoter.active : true,
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setErr('');
    const code = f.code.trim().toUpperCase();
    if (isNew) {
      if (!/^[A-Z0-9]{3,12}$/.test(code))
        return setErr('A code is 3–12 letters or digits, e.g. RAVI01.');
      if (code.startsWith('NB'))
        return setErr('Codes starting with NB are kept for customer invite codes.');
    }
    if (!f.name.trim()) return setErr('Enter the promoter’s name.');
    if (f.mobile && !isMobile(f.mobile))
      return setErr('Enter a 10-digit Indian mobile number, or leave it blank.');
    const body = {
      name: f.name.trim(),
      stall: f.stall.trim() || null,
      communityId: f.communityId || null,
      mobile: f.mobile || null,
      active: f.active,
    };
    setBusy(true);
    try {
      if (isNew) await api.post('/admin/growth/promoters', { code, ...body });
      else await api.patch(`/admin/growth/promoters/${encodeURIComponent(promoter.code)}`, body);
      toast(isNew ? `Promoter ${code} added` : `Promoter ${promoter.code} saved`);
      onSaved();
    } catch (e) {
      setErr(e.message || 'Could not save the promoter.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      title={isNew ? 'Add a promoter' : `Edit ${promoter.code}`}
      subtitle="The person at a community stall who helps residents place their first order."
      onClose={onClose}
      footer={
        <div className="hstack" style={{ justifyContent: 'space-between', width: '100%' }}>
          <span style={{ fontSize: 12.5, color: 'var(--tomato)' }}>{err}</span>
          <button className="btn btn--primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Add promoter' : 'Save'}
          </button>
        </div>
      }
    >
      <div className="field">
        <label className="field__label">Code</label>
        <input
          className="field__input mono"
          value={f.code}
          disabled={!isNew}
          onChange={(e) =>
            setF((s) => ({
              ...s,
              code: e.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '')
                .slice(0, 12),
            }))
          }
          placeholder="RAVI01"
          autoFocus={isNew}
        />
        <p className="field__hint">
          {isNew
            ? '3–12 letters or digits. Customers type this at checkout. It cannot be changed later.'
            : 'A code cannot be changed. Delete this promoter and add a new one to change it.'}
        </p>
      </div>
      <div className="field">
        <label className="field__label">Name</label>
        <input
          className="field__input"
          value={f.name}
          maxLength={60}
          onChange={(e) => setF((s) => ({ ...s, name: noLead(e.target.value) }))}
          placeholder="Ravi Kumar"
        />
      </div>
      <div className="field__row">
        <div className="field">
          <label className="field__label">Stall (optional)</label>
          <input
            className="field__input"
            value={f.stall}
            maxLength={60}
            onChange={(e) => setF((s) => ({ ...s, stall: noLead(e.target.value) }))}
            placeholder="Clubhouse gate, Sunday"
          />
        </div>
        <div className="field">
          <label className="field__label">Mobile (optional)</label>
          <input
            className="field__input mono"
            inputMode="numeric"
            value={f.mobile}
            onChange={(e) => setF((s) => ({ ...s, mobile: digits(e.target.value) }))}
            placeholder="98xxxxxxxx"
          />
        </div>
      </div>
      <div className="field">
        <label className="field__label">Community (optional)</label>
        <select
          className="field__select"
          value={f.communityId}
          onChange={(e) => setF((s) => ({ ...s, communityId: e.target.value }))}
        >
          <option value="">Not tied to one community</option>
          {communities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={f.active}
          onChange={(e) => setF((s) => ({ ...s, active: e.target.checked }))}
        />
        Active — the code works at checkout
      </label>
    </Drawer>
  );
}

function QrCardDrawer({ promoter, onClose }) {
  const [src, setSrc] = useState('');
  const [err, setErr] = useState('');
  const url = joinUrl(promoter.code, promoter.communityId);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(url, { width: 520, margin: 1, color: { dark: '#0e1b14', light: '#ffffff' } })
      .then((d) => live && setSrc(d))
      .catch(() => live && setErr('Could not draw the QR code.'));
    return () => {
      live = false;
    };
  }, [url]);
  return (
    <Drawer
      title={`QR card · ${promoter.code}`}
      subtitle="Print it and keep it at the stall. On Android, scanning installs the app already credited to this promoter; an iPhone shows the code to type."
      onClose={onClose}
      footer={
        <div className="hstack" style={{ justifyContent: 'flex-end', width: '100%' }}>
          <button className="btn btn--primary" onClick={() => window.print()} disabled={!src}>
            <IconPrint size={17} /> Print
          </button>
        </div>
      }
    >
      <PromoterCard promoter={promoter} src={src} />
      {/* A copy straight under <body>, shown only when printing: the drawer sits inside animated
          (transformed) ancestors, which would pin a fixed-position print layout to the drawer. */}
      {createPortal(
        <div className="print-area">
          <PromoterCard promoter={promoter} src={src} />
        </div>,
        document.body,
      )}
      {err && <p style={{ color: 'var(--tomato)', fontSize: 13 }}>{err}</p>}
      <p className="field__hint" style={{ marginTop: 14, overflowWrap: 'anywhere' }}>
        The QR opens <span className="mono">{url}</span>
      </p>
    </Drawer>
  );
}

function PromoterCard({ promoter, src }) {
  return (
    <div className="qrcard">
      <img className="qrcard__logo" src={logoFull} alt="Fooducia" />
      <div className="qrcard__name">{promoter.name}</div>
      {promoter.stall && <div className="qrcard__stall">{promoter.stall}</div>}
      {src ? (
        <img className="qrcard__qr" src={src} alt={`QR code for ${promoter.code}`} />
      ) : (
        <div className="qrcard__qr skeleton" />
      )}
      <div className="qrcard__code">{promoter.code}</div>
      <div className="qrcard__how">Scan, install Fooducia, and enter this code at checkout.</div>
    </div>
  );
}

// ── referrals ───────────────────────────────────────────────────────────────

const REF_TONE = { REWARDED: 'pill--leaf', PENDING: 'pill--amber', VOID: 'pill--tomato' };
const REF_LABEL = {
  REWARDED: 'Rewarded',
  PENDING: 'Waiting for first delivery',
  VOID: 'No reward',
};
const REF_REASON = {
  INVITER_GONE: 'The inviter deleted their account',
  MONTHLY_CAP: 'The inviter reached this month’s limit',
};
const person = (p) =>
  p?.name || p?.mobileMasked ? (
    <>
      <div className="data__name" style={{ fontWeight: 600 }}>
        {p.name || 'No name given'}
      </div>
      <div className="muted mono" style={{ fontSize: 12 }}>
        {p.mobileMasked || ''}
      </div>
    </>
  ) : (
    <span className="muted">Deleted account</span>
  );

function Referrals() {
  const { data, error, reload } = useResource('/admin/growth/referrals');
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!data)
    return (
      <div className="glass card">
        <TableSkeleton rows={4} />
      </div>
    );
  const { totals, referrals } = data;

  // Only a pending referral can be changed; a settled one (rewarded or void) is history and the
  // server answers 409.
  async function voidRef(r) {
    const why = window.prompt(
      'Why is this referral void? (3–140 characters, kept in the audit log)',
    );
    if (why === null) return;
    const reason = why.trim();
    if (reason.length < 3) return toast('Give a reason of at least 3 characters.', 'err');
    try {
      await api.patch(`/admin/growth/referrals/${encodeURIComponent(r.id)}`, {
        status: 'VOID',
        reason: reason.slice(0, 140),
      });
      toast('Referral voided — no reward will be paid');
      reload();
    } catch (e) {
      toast(e.message || 'Could not void the referral', 'err');
    }
  }
  async function removeRef(r) {
    if (
      !window.confirm(
        'Delete this pending referral?\n\nIt disappears from the list and no reward will be paid. This cannot be undone.',
      )
    )
      return;
    try {
      await api.del(`/admin/growth/referrals/${encodeURIComponent(r.id)}`);
      toast('Referral deleted');
      reload();
    } catch (e) {
      toast(e.message || 'Could not delete the referral', 'err');
    }
  }

  return (
    <>
      <div className="stat-grid stagger" style={{ marginBottom: 16 }}>
        <Stat
          icon={<IconUsers size={20} />}
          tint="sprout"
          value={totals.invites}
          label="Invites used"
        />
        <Stat
          icon={<IconUsers size={20} />}
          value={totals.pending}
          label="Waiting for first delivery"
        />
        <Stat icon={<IconUsers size={20} />} value={totals.rewarded} label="Rewarded" />
        <Stat
          icon={<IconRupee size={20} />}
          value={inr(totals.paidPaise)}
          label="Paid out in wallet credit"
        />
      </div>
      <div className="glass card reveal" style={{ padding: 0 }}>
        {referrals.length === 0 ? (
          <div className="empty">
            No invites used yet. A customer’s invite code appears in their app under “Invite a
            neighbour”.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Invited by</th>
                  <th>New customer</th>
                  <th>Status</th>
                  <th className="num">Reward</th>
                  <th className="num">Welcome credit</th>
                  <th>Order</th>
                  <th>Invited on</th>
                  <th>Settled</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {referrals.map((r) => (
                  <tr key={r.id}>
                    <td>{person(r.inviter)}</td>
                    <td>{person(r.invited)}</td>
                    <td>
                      <span className={`pill ${REF_TONE[r.status] || ''}`}>
                        {REF_LABEL[r.status] || sentence(r.status)}
                      </span>
                      {r.reason && (
                        <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                          {REF_REASON[r.reason] || sentence(r.reason)}
                        </div>
                      )}
                    </td>
                    <td className="num">{inr(r.paidPaise)}</td>
                    <td className="num">{inr(r.welcomePaise)}</td>
                    <td className="mono">{r.orderNumber || <span className="muted">—</span>}</td>
                    <td className="data__name">{dateTime(r.at)}</td>
                    <td className="data__name">
                      {r.settledAt ? dateTime(r.settledAt) : <span className="muted">—</span>}
                    </td>
                    <td>
                      {r.status === 'PENDING' && (
                        <div className="hstack" style={{ gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn btn--ghost btn--sm" onClick={() => voidRef(r)}>
                            Void
                          </button>
                          <button
                            className="btn btn--ghost btn--sm"
                            style={{ color: 'var(--tomato)' }}
                            onClick={() => removeRef(r)}
                            aria-label="Delete referral"
                          >
                            <IconTrash size={15} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ── waitlist ────────────────────────────────────────────────────────────────

const WL_TONE = {
  WAITLIST: 'pill--amber',
  REQUESTED: 'pill--sky',
  OPENED: 'pill--leaf',
  DECLINED: 'pill--tomato',
};
const WL_LABEL = {
  WAITLIST: 'On the waitlist',
  REQUESTED: 'Asked for by a customer',
  OPENED: 'Opened',
  DECLINED: 'Declined',
};

function Waitlist() {
  const { data, error, loading, reload } = useResource('/admin/growth/waitlist');
  const { data: comm } = useResource('/admin/communities');
  const communities = comm?.communities || [];
  const [editing, setEditing] = useState(/** @type {any} */ (null));
  const list = data?.waitlist || [];
  const requested = list.filter((w) => w.status === 'REQUESTED').length;

  async function setStatus(w, status, msg) {
    try {
      await api.patch(`/admin/growth/waitlist/${w.id}`, { status });
      toast(msg);
      reload();
    } catch (e) {
      toast(e.message || 'Could not update', 'err');
    }
  }
  async function remove(w) {
    if (
      !confirm(
        `Delete ${w.name} from the waitlist?\n\n${w.waiting} waiting ${w.waiting === 1 ? 'household' : 'households'} will be removed with it. This cannot be undone.`,
      )
    )
      return;
    try {
      await api.del(`/admin/growth/waitlist/${w.id}`);
      toast(`${w.name} removed from the waitlist`);
      reload();
    } catch (e) {
      toast(e.message || 'Could not delete', 'err');
    }
  }

  return (
    <>
      <div
        className="hstack"
        style={{ justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 16 }}
      >
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
          {data
            ? `A community is ready to plan for once ${data.threshold} households are waiting.${
                requested ? ` ${requested} asked for by customers need a decision.` : ''
              }`
            : ' '}
        </p>
        <button className="btn btn--primary" onClick={() => setEditing('new')}>
          <IconPlus size={17} /> Add community
        </button>
      </div>
      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : !data ? (
        <div className="glass card">
          <TableSkeleton rows={4} />
        </div>
      ) : list.length === 0 ? (
        <div className="glass card">
          <div className="empty">
            No waitlist communities yet. Add the ones you plan to open next, so residents can join
            the queue from the app.
          </div>
        </div>
      ) : (
        <div className="glass card reveal" style={{ padding: 0, opacity: loading ? 0.6 : 1 }}>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Community</th>
                  <th>Waiting</th>
                  <th>Status</th>
                  <th>Added by</th>
                  <th>Size</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <div className="data__name" style={{ fontWeight: 600 }}>
                        {w.name}
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {[w.area, w.distanceKm != null ? `${w.distanceKm} km from the hub` : null]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </div>
                      {w.note && (
                        <div
                          className="muted"
                          style={{ fontSize: 12, marginTop: 2, maxWidth: 320 }}
                        >
                          {w.note}
                        </div>
                      )}
                    </td>
                    <td style={{ minWidth: 150 }}>
                      <div className="hstack" style={{ gap: 8, marginBottom: 5 }}>
                        <b>{w.waiting}</b>
                        <span className="muted" style={{ fontSize: 12 }}>
                          of {w.threshold} · {w.progressPct}%
                        </span>
                      </div>
                      <Bar pct={w.progressPct} tone={w.progressPct >= 100 ? 'leaf' : 'amber'} />
                    </td>
                    <td>
                      <span className={`pill ${WL_TONE[w.status] || ''}`}>
                        {WL_LABEL[w.status] || w.status}
                      </span>
                    </td>
                    <td>
                      <div className="data__name">
                        {w.source === 'CUSTOMER' ? 'A customer' : 'Admin'}
                      </div>
                      {w.requestedBy && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {[w.requestedBy.name, w.requestedBy.mobileMasked]
                            .filter(Boolean)
                            .join(' · ') || 'Deleted account'}
                        </div>
                      )}
                    </td>
                    <td className="muted" style={{ fontSize: 12.5 }}>
                      {[
                        w.towers != null && `${w.towers} towers`,
                        w.flats != null && `${w.flats} flats`,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </td>
                    <td className="row-actions-cell">
                      <div className="row-actions">
                        {w.status === 'REQUESTED' && (
                          <>
                            <button
                              className="btn btn--primary btn--sm"
                              onClick={() =>
                                setStatus(
                                  w,
                                  'WAITLIST',
                                  `${w.name} approved — it now shows on the waitlist in the app`,
                                )
                              }
                            >
                              Approve
                            </button>
                            <button
                              className="btn btn--ghost btn--sm"
                              onClick={() =>
                                confirm(`Decline ${w.name}? It will not show in the app.`) &&
                                setStatus(w, 'DECLINED', `${w.name} declined`)
                              }
                            >
                              Decline
                            </button>
                          </>
                        )}
                        <button className="btn btn--ghost btn--sm" onClick={() => setEditing(w)}>
                          <IconEdit size={15} /> Edit
                        </button>
                        <button
                          className="btn btn--ghost btn--icon"
                          style={{ color: 'var(--tomato)' }}
                          onClick={() => remove(w)}
                          aria-label={`Delete ${w.name}`}
                        >
                          <IconTrash size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {editing && (
        <WaitlistDrawer
          item={editing === 'new' ? null : editing}
          communities={communities}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function WaitlistDrawer({ item, communities, onClose, onSaved }) {
  const isNew = !item;
  const [f, setF] = useState({
    name: item?.name || '',
    area: item?.area || '',
    towers: item?.towers != null ? String(item.towers) : '',
    flats: item?.flats != null ? String(item.flats) : '',
    distanceKm: item?.distanceKm != null ? String(item.distanceKm) : '',
    note: item?.note || '',
    status: item?.status || 'WAITLIST',
    communityId: item?.communityId || '',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const intOrNull = (s) => (s === '' ? null : Number(s));

  async function save() {
    setErr('');
    if (f.name.trim().length < 2) return setErr('Enter the community’s name.');
    const body = {
      name: f.name.trim(),
      area: f.area.trim() || null,
      towers: intOrNull(f.towers),
      flats: intOrNull(f.flats),
      distanceKm: f.distanceKm === '' ? null : Number(f.distanceKm),
      note: f.note.trim() || null,
      status: f.status,
      communityId: f.communityId || null,
    };
    setBusy(true);
    try {
      if (isNew) await api.post('/admin/growth/waitlist', body);
      else await api.patch(`/admin/growth/waitlist/${item.id}`, body);
      toast(isNew ? `${body.name} added to the waitlist` : `${body.name} saved`);
      onSaved();
    } catch (e) {
      setErr(e.message || 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      title={isNew ? 'Add a waitlist community' : `Edit ${item.name}`}
      subtitle="Residents can find it in the app and join the queue."
      onClose={onClose}
      footer={
        <div className="hstack" style={{ justifyContent: 'space-between', width: '100%' }}>
          <span style={{ fontSize: 12.5, color: 'var(--tomato)' }}>{err}</span>
          <button className="btn btn--primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Add' : 'Save'}
          </button>
        </div>
      }
    >
      <div className="field">
        <label className="field__label">Community name</label>
        <input
          className="field__input"
          value={f.name}
          maxLength={80}
          onChange={(e) => setF((s) => ({ ...s, name: noLead(e.target.value) }))}
          placeholder="Aparna Sarovar Zenith"
          autoFocus={isNew}
        />
      </div>
      <div className="field__row">
        <div className="field">
          <label className="field__label">Area (optional)</label>
          <input
            className="field__input"
            value={f.area}
            maxLength={80}
            onChange={(e) => setF((s) => ({ ...s, area: noLead(e.target.value) }))}
            placeholder="Nallagandla"
          />
        </div>
        <div className="field">
          <label className="field__label">Distance from hub (km)</label>
          <input
            className="field__input"
            inputMode="decimal"
            value={f.distanceKm}
            onChange={(e) => setF((s) => ({ ...s, distanceKm: num(e.target.value, { max: 100 }) }))}
            placeholder="6.5"
          />
        </div>
      </div>
      <div className="field__row">
        <div className="field">
          <label className="field__label">Towers</label>
          <input
            className="field__input"
            inputMode="numeric"
            value={f.towers}
            onChange={(e) =>
              setF((s) => ({ ...s, towers: num(e.target.value, { max: 500, integer: true }) }))
            }
          />
        </div>
        <div className="field">
          <label className="field__label">Flats</label>
          <input
            className="field__input"
            inputMode="numeric"
            value={f.flats}
            onChange={(e) =>
              setF((s) => ({ ...s, flats: num(e.target.value, { max: 100000, integer: true }) }))
            }
          />
        </div>
      </div>
      <div className="field">
        <label className="field__label">Status</label>
        <select
          className="field__select"
          value={f.status}
          onChange={(e) => setF((s) => ({ ...s, status: e.target.value }))}
        >
          {Object.entries(WL_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <p className="field__hint">
          Only “On the waitlist” communities show in the app for residents to join.
        </p>
      </div>
      {f.status === 'OPENED' && (
        <div className="field">
          <label className="field__label">Now delivered as</label>
          <select
            className="field__select"
            value={f.communityId}
            onChange={(e) => setF((s) => ({ ...s, communityId: e.target.value }))}
          >
            <option value="">Not linked</option>
            {communities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label className="field__label">Note (optional)</label>
        <textarea
          className="field__input"
          value={f.note}
          maxLength={300}
          onChange={(e) => setF((s) => ({ ...s, note: noLead(e.target.value) }))}
          placeholder="Committee meeting on 1 Dec"
        />
      </div>
    </Drawer>
  );
}

// ── invite rewards ──────────────────────────────────────────────────────────

/**
 * The neighbour-invite reward, on the same tab as the list of invites (21 Nov 2026: the owner
 * looked for it there; it used to sit in Settings). Saves only these four fields.
 *
 * How the money works, said on the card so nobody has to ask: the reward is wallet credit, a
 * discount Fooducia funds. No money moves through Razorpay when it is paid. When the customer spends
 * it, Razorpay simply collects that much less for the order.
 */
function InviteRewards() {
  const { data, error, reload } = useResource('/admin/growth/settings');
  const s = data?.settings;
  const [f, setF] = useState(/** @type {any} */ (null));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (s)
      setF({
        referralEnabled: !!s.referralEnabled,
        referrer: rupeeInput(s.referrerRewardPaise),
        referee: rupeeInput(s.refereeRewardPaise),
        cap: String(s.referralMonthlyCap ?? 20),
      });
  }, [s]);

  async function save() {
    const referrerRewardPaise = paiseFrom(f.referrer);
    const refereeRewardPaise = paiseFrom(f.referee);
    const referralMonthlyCap = Number(f.cap);
    if (referrerRewardPaise == null || referrerRewardPaise > 100000)
      return toast('Enter the inviter’s reward in rupees, up to ₹1,000.', 'err');
    if (refereeRewardPaise == null || refereeRewardPaise > 100000)
      return toast('Enter the welcome credit in rupees, up to ₹1,000 (0 for none).', 'err');
    if (!Number.isInteger(referralMonthlyCap) || referralMonthlyCap < 1 || referralMonthlyCap > 500)
      return toast('The monthly limit is a whole number from 1 to 500.', 'err');
    setBusy(true);
    try {
      await api.put('/admin/growth/settings', {
        referralEnabled: f.referralEnabled,
        referrerRewardPaise,
        refereeRewardPaise,
        referralMonthlyCap,
      });
      toast('Invite rewards saved');
      reload();
    } catch (e) {
      toast(e.message || 'Could not save the invite rewards', 'err');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!f)
    return (
      <div className="glass card" style={{ marginBottom: 16 }}>
        <TableSkeleton rows={2} />
      </div>
    );
  const give = Number(f.referee) || 0;
  const get = Number(f.referrer) || 0;
  return (
    <div className="glass card reveal" style={{ marginBottom: 16 }}>
      <div className="card__head">
        <h2 className="card__title">Invite rewards</h2>
        <span className="field__hint" style={{ margin: 0 }}>
          The app shows: “
          {give > 0 ? `Give ₹${give}, get ₹${get}` : `Get ₹${get} for every neighbour`}”
        </span>
      </div>
      <label className="check" style={{ marginBottom: 14 }}>
        <input
          type="checkbox"
          checked={f.referralEnabled}
          onChange={(e) => setF((x) => ({ ...x, referralEnabled: e.target.checked }))}
        />
        Invites are on: customers can share their code with neighbours
      </label>
      <div className="field__row">
        <div className="field">
          <label className="field__label">Reward to the inviter (₹)</label>
          <input
            className="field__input"
            inputMode="decimal"
            value={f.referrer}
            onChange={(e) => setF((x) => ({ ...x, referrer: num(e.target.value, { max: 1000 }) }))}
          />
          <p className="field__hint">Paid once the new customer’s first order is delivered.</p>
        </div>
        <div className="field">
          <label className="field__label">Welcome credit for the new customer (₹)</label>
          <input
            className="field__input"
            inputMode="decimal"
            value={f.referee}
            onChange={(e) => setF((x) => ({ ...x, referee: num(e.target.value, { max: 1000 }) }))}
          />
          <p className="field__hint">Paid with the inviter’s reward. 0 for none.</p>
        </div>
        <div className="field">
          <label className="field__label">Most rewards per inviter, per month</label>
          <input
            className="field__input"
            inputMode="numeric"
            value={f.cap}
            onChange={(e) =>
              setF((x) => ({ ...x, cap: num(e.target.value, { max: 500, integer: true }) }))
            }
          />
          <p className="field__hint">Stops one person farming codes. Default 20.</p>
        </div>
      </div>
      <p className="field__hint">
        Both rewards are <strong>wallet credit</strong>, a discount Fooducia pays for. No money
        moves through Razorpay when credit is added. When the customer spends it, Razorpay collects
        that much less for the order (or nothing, if the wallet covers it all). A change applies to
        invites used from now on; invites already waiting keep the amount they were promised.
      </p>
      <div className="hstack" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn btn--primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save invite rewards'}
        </button>
      </div>
    </div>
  );
}

// ── settings ────────────────────────────────────────────────────────────────

function GrowthSettings() {
  const { data, error, reload } = useResource('/admin/growth/settings');
  const s = data?.settings;
  const [f, setF] = useState(/** @type {any} */ (null));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (s)
      setF({
        waitlistOpenAt: String(s.waitlistOpenAt),
        askHeardFrom: !!s.askHeardFrom,
      });
  }, [s]);
  const heard = useMemo(() => Object.values(data?.heardFrom || {}), [data]);

  async function save() {
    const waitlistOpenAt = Number(f.waitlistOpenAt);
    if (!Number.isInteger(waitlistOpenAt) || waitlistOpenAt < 1 || waitlistOpenAt > 10000)
      return toast('The waitlist threshold is a whole number of households, 1 or more.', 'err');
    setBusy(true);
    try {
      await api.put('/admin/growth/settings', {
        waitlistOpenAt,
        askHeardFrom: f.askHeardFrom,
      });
      toast('Referral program settings saved');
      reload();
    } catch (e) {
      toast(e.message || 'Could not save the settings', 'err');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!f)
    return (
      <div className="glass card">
        <TableSkeleton rows={3} />
      </div>
    );
  return (
    <div className="glass card reveal" style={{ maxWidth: 640 }}>
      <div className="card__head">
        <h2 className="card__title">Waitlist</h2>
      </div>
      <div className="field" style={{ maxWidth: 300 }}>
        <label className="field__label">Households needed before a community is ready</label>
        <input
          className="field__input"
          inputMode="numeric"
          value={f.waitlistOpenAt}
          onChange={(e) =>
            setF((x) => ({
              ...x,
              waitlistOpenAt: num(e.target.value, { max: 10000, integer: true }),
            }))
          }
        />
      </div>
      <div className="card__head" style={{ marginTop: 10 }}>
        <h2 className="card__title">First order</h2>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={f.askHeardFrom}
          onChange={(e) => setF((x) => ({ ...x, askHeardFrom: e.target.checked }))}
        />
        Ask “How did you hear about Fooducia?” before a customer’s first order
      </label>
      {heard.length > 0 && (
        <p className="field__hint" style={{ marginLeft: 24 }}>
          Choices: {heard.join(' · ')}
        </p>
      )}
      <div className="hstack" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn--primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </div>
      <p className="field__hint" style={{ marginTop: 10 }}>
        Changes take effect in the app straight away and are written to the audit trail. Invite
        rewards are set on the Neighbour invites tab.
      </p>
    </div>
  );
}
