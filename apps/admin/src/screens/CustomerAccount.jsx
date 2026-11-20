/**
 * Managing a customer's ACCOUNT (as opposed to their order history): the name on it, the wallet and
 * its ledger, and deleting the account when the customer asks for that by phone or email.
 *
 *   AccountPanel      the panel itself — used inside the customer drawer, and on its own
 *   AccountDrawer     the panel in a drawer, for an account found by mobile number (it may have no
 *                     orders, so it is not on the Customers list at all)
 *   MobileLookup      "Find by mobile number" box at the top of the Customers page
 *   DeletionsDrawer   every scheduled deletion, soonest first, with Cancel
 *
 * Moving wallet money and scheduling / cancelling a deletion are owner-only on the server. The
 * controls are disabled for everyone else, with a note saying who can do it, rather than offered
 * and refused.
 *
 * API: /admin/customers/:key/account, /admin/customers/:key/wallet, /admin/customers/:key/deletion,
 * /admin/deletions, /admin/customer-lookup. Every change is audit-logged on the server.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { toast, useResource } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { getCredential, getOperator } from '../lib/auth.js';
import { Drawer as UiDrawer, ErrorNote, TableSkeleton } from '../components/ui.jsx';
import { IconEdit, IconRupee, IconSearch, IconTrash } from '../components/icons.jsx';
import { dateTime, digits, inr, isMobile, noLead, num, toPaise } from '../lib/format.js';

/** Drawers are portalled to <body> so no card's stacking layer paints over them. */
const Drawer = (props) => createPortal(<UiDrawer {...props} />, document.body);

/** Owner (SUPER_ADMIN), or the shared token, which the API treats as the owner. */
export const isOwner = () =>
  getOperator()?.role === 'SUPER_ADMIN' || getCredential()?.kind === 'token';

/** Guest orders have no account behind them. */
export const hasAccount = (key) => !!key && !String(key).startsWith('g_');

const longDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

const SOURCE_LABEL = {
  ADJUSTMENT: 'Adjustment by the team',
  REFUND: 'Refund',
  ORDER: 'Order',
  REFERRAL: 'Referral reward',
  TOPUP: 'Top-up',
};

const OwnerOnly = () => (
  <p className="field__hint" style={{ margin: '6px 0 0' }}>
    Only the owner can do this.
  </p>
);

/**
 * @param {{ customerKey: string, onChanged?: () => void }} props
 */
export function AccountPanel({ customerKey, onChanged }) {
  const path = `/admin/customers/${encodeURIComponent(customerKey)}/account`;
  const { data, loading, error, reload } = useResource(path);
  const owner = isOwner();

  const changed = () => {
    reload();
    onChanged?.();
  };

  if (error) {
    if (error.status === 404)
      return (
        <p className="field__hint" style={{ margin: 0 }}>
          No account behind these orders — they were placed as a guest.
        </p>
      );
    if (error.status === 410)
      return (
        <p className="field__hint" style={{ margin: 0 }}>
          This account has been deleted.
        </p>
      );
    return <ErrorNote error={error} onRetry={reload} />;
  }
  if (loading && !data) return <TableSkeleton rows={3} />;
  const a = data.account;
  const ledger = [...(data.ledger || [])].sort((x, y) =>
    String(y.createdAt).localeCompare(String(x.createdAt)),
  );

  return (
    <div className="vstack" style={{ gap: 14 }}>
      <NameRow account={a} path={path} onSaved={changed} />
      <div className="muted" style={{ fontSize: 12.5 }}>
        <span className="mono">{a.mobileMasked || 'No number'}</span>
        {a.createdAt && ` · account since ${longDate(a.createdAt)}`}
      </div>

      <div className="demand__confirm">
        <div className="hstack" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="field__label" style={{ margin: 0 }}>
            Wallet balance
          </span>
          <span className="rupee" style={{ fontSize: 20, fontWeight: 700 }}>
            {inr(a.walletBalancePaise)}
          </span>
        </div>
        <WalletForm
          customerKey={customerKey}
          name={a.name}
          balancePaise={Number(a.walletBalancePaise)}
          owner={owner}
          onDone={changed}
        />
      </div>

      <div>
        <div className="field__label">Wallet history — latest first</div>
        {ledger.length === 0 ? (
          <p className="field__hint" style={{ margin: 0 }}>
            Nothing has moved through this wallet yet.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>What</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ textAlign: 'right' }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((l) => (
                  <tr key={l.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>
                      {dateTime(l.createdAt)}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {l.note || SOURCE_LABEL[l.source] || l.source}
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {SOURCE_LABEL[l.source] || l.source}
                        {l.reference ? ` · ${l.reference}` : ''}
                      </div>
                    </td>
                    <td
                      className="mono"
                      style={{
                        textAlign: 'right',
                        whiteSpace: 'nowrap',
                        color: l.direction === 'CREDIT' ? 'var(--leaf-deep)' : 'var(--tomato)',
                      }}
                    >
                      {l.direction === 'CREDIT' ? '+' : '−'}
                      {inr(l.amountPaise)}
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {l.balanceAfterPaise != null ? inr(l.balanceAfterPaise) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DeletionBlock customerKey={customerKey} account={a} owner={owner} onDone={changed} />
    </div>
  );
}

function NameRow({ account, path, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.name || '');
  const [busy, setBusy] = useState(false);

  async function save() {
    const v = name.trim();
    if (!v) return toast('Enter a name.', 'err');
    setBusy(true);
    try {
      await api.patch(path, { name: v });
      toast('Name saved');
      setEditing(false);
      onSaved();
    } catch (e) {
      toast(e.message || 'Could not save the name.', 'err');
    } finally {
      setBusy(false);
    }
  }

  if (!editing)
    return (
      <div className="hstack" style={{ gap: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>
          {account.name || <span className="muted">No name given</span>}
        </span>
        <button
          className="btn btn--ghost btn--sm"
          aria-label="Edit name"
          onClick={() => {
            setName(account.name || '');
            setEditing(true);
          }}
        >
          <IconEdit size={15} /> Edit name
        </button>
      </div>
    );

  return (
    <div className="field" style={{ margin: 0 }}>
      <label className="field__label">Name on the account</label>
      <div className="hstack" style={{ gap: 8 }}>
        <input
          className="field__input"
          value={name}
          maxLength={80}
          autoFocus
          onChange={(e) => setName(noLead(e.target.value))}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <button className="btn btn--primary btn--sm" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
      <p className="field__hint">The customer sees this name in the app.</p>
    </div>
  );
}

function WalletForm({ customerKey, name, balancePaise, owner, onDone }) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState('CREDIT');
  const [rupees, setRupees] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const paise = toPaise(rupees || 0);
  const r = reason.trim();
  const tooMuch = direction === 'DEBIT' && paise > balancePaise;
  const valid = paise >= 100 && paise <= 500000 && r.length >= 3 && r.length <= 140 && !tooMuch;

  async function submit() {
    if (!valid) return;
    const who = name || 'this customer';
    const ok = window.confirm(
      direction === 'CREDIT'
        ? `Add ${inr(paise)} to ${who}'s wallet?\n\nThey will see this in their wallet history: “${r}”.\nThis is recorded against your name.`
        : `Take ${inr(paise)} out of ${who}'s wallet?\n\nThe balance goes from ${inr(balancePaise)} to ${inr(balancePaise - paise)}. They will see: “${r}”.\nThis is recorded against your name.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/admin/customers/${encodeURIComponent(customerKey)}/wallet`, {
        direction,
        amountPaise: paise,
        reason: r,
      });
      toast(direction === 'CREDIT' ? `${inr(paise)} added` : `${inr(paise)} taken out`);
      setRupees('');
      setReason('');
      setOpen(false);
      onDone();
    } catch (e) {
      toast(e.message || 'Could not change the wallet.', 'err');
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <div style={{ marginTop: 10 }}>
        <button className="btn btn--ghost btn--sm" onClick={() => setOpen(true)} disabled={!owner}>
          <IconRupee size={15} /> Credit / debit wallet
        </button>
        {!owner && <OwnerOnly />}
      </div>
    );

  return (
    <div style={{ marginTop: 12 }}>
      <div className="seg" style={{ marginBottom: 10 }}>
        {[
          ['CREDIT', 'Credit (add)'],
          ['DEBIT', 'Debit (take out)'],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`seg__btn${direction === k ? ' is-active' : ''}`}
            onClick={() => setDirection(k)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="field">
        <label className="field__label">Amount (₹)</label>
        <input
          className="field__input"
          inputMode="decimal"
          value={rupees}
          placeholder="50"
          onChange={(e) => setRupees(num(e.target.value, { max: 5000 }))}
        />
        <p className="field__hint">
          ₹1 to ₹5,000.
          {tooMuch && ` That is more than the ${inr(balancePaise)} in the wallet.`}
        </p>
      </div>
      <div className="field">
        <label className="field__label">Reason — the customer sees this</label>
        <input
          className="field__input"
          value={reason}
          maxLength={140}
          placeholder="Sorry the spinach was wilted on 18 Nov"
          onChange={(e) => setReason(noLead(e.target.value))}
        />
        <p className="field__hint">{r.length}/140 · at least 3 characters.</p>
      </div>
      <div className="hstack" style={{ gap: 8 }}>
        <button className="btn btn--primary btn--sm" onClick={submit} disabled={!valid || busy}>
          {busy
            ? 'Saving…'
            : direction === 'CREDIT'
              ? `Add ${paise >= 100 ? inr(paise) : ''}`.trim()
              : `Take out ${paise >= 100 ? inr(paise) : ''}`.trim()}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function DeletionBlock({ customerKey, account, owner, onDone }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const path = `/admin/customers/${encodeURIComponent(customerKey)}/deletion`;
  const who = account.name || 'this customer';
  const del = account.deletion;

  async function schedule() {
    const r = reason.trim();
    if (r.length < 3) return toast('Say why — for example “Asked by phone on 20 Nov”.', 'err');
    const ok = window.confirm(
      `Delete ${who}'s account?\n\n` +
        `• They are signed out of the app on every phone, now.\n` +
        `• The account is erased for good in 60 days. Until then it can be cancelled here, or by them signing in again.\n` +
        `• After erasure their name and number are gone; their orders stay (the tax record must) without them.\n` +
        (Number(account.walletBalancePaise) > 0
          ? `• ${inr(account.walletBalancePaise)} is still in their wallet.\n`
          : '') +
        `\nOnly do this because they asked. Continue?`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(path, { reason: r });
      toast('Deletion scheduled — erased in 60 days');
      setAsking(false);
      setReason('');
      onDone();
    } catch (e) {
      toast(e.message || 'Could not schedule the deletion.', 'err');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (
      !window.confirm(
        `Cancel the deletion of ${who}'s account? It is kept, and they can sign in again as normal.`,
      )
    )
      return;
    setBusy(true);
    try {
      await api.del(path);
      toast('Deletion cancelled');
      onDone();
    } catch (e) {
      toast(e.message || 'Could not cancel the deletion.', 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="demand__confirm">
      <div className="field__label">Delete account</div>
      {del ? (
        <>
          <p style={{ margin: '0 0 8px', fontSize: 13.5 }}>
            Scheduled on {longDate(del.requestedAt)}. The account is erased on{' '}
            <b>{longDate(del.deleteAfter)}</b>.
          </p>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 12.5 }}>
            {howAsked(del)}
          </p>
          <button className="btn btn--ghost btn--sm" onClick={cancel} disabled={!owner || busy}>
            {busy ? 'Cancelling…' : 'Cancel deletion'}
          </button>
          {!owner && <OwnerOnly />}
        </>
      ) : !asking ? (
        <>
          <button
            className="btn btn--ghost btn--sm"
            style={{ color: 'var(--tomato)' }}
            onClick={() => setAsking(true)}
            disabled={!owner}
          >
            <IconTrash size={15} /> Delete account on request
          </button>
          {owner ? (
            <p className="field__hint" style={{ margin: '6px 0 0' }}>
              For a customer who asked by phone or email. 60 days to change their mind.
            </p>
          ) : (
            <OwnerOnly />
          )}
        </>
      ) : (
        <>
          <div className="field">
            <label className="field__label">How did they ask?</label>
            <input
              className="field__input"
              value={reason}
              maxLength={140}
              autoFocus
              placeholder="Asked by phone on 20 Nov"
              onChange={(e) => setReason(noLead(e.target.value))}
            />
            <p className="field__hint">
              Recorded in the audit trail. They are signed out everywhere at once, and the account
              is erased after 60 days unless cancelled.
            </p>
          </div>
          <div className="hstack" style={{ gap: 8 }}>
            <button
              className="btn btn--primary btn--sm"
              style={{ background: 'var(--tomato)' }}
              onClick={schedule}
              disabled={busy || reason.trim().length < 3}
            >
              {busy ? 'Scheduling…' : 'Schedule deletion'}
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => setAsking(false)}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * How the deletion was asked for, and whether the customer ticked the box confirming they read what
 * is deleted and kept (recorded on the server with the wording version and time).
 */
function howAsked(d, short = false) {
  const c = d?.consent;
  if (short) {
    const where =
      d?.via === 'ADMIN_ON_REQUEST'
        ? 'By the team'
        : d?.via === 'APP_OLD_VERSION'
          ? 'Older app'
          : 'In the app';
    return c?.accepted ? `${where} · agreed ✓` : where;
  }
  const by =
    d?.via === 'ADMIN_ON_REQUEST'
      ? 'Scheduled by the team on the customer’s request.'
      : d?.via === 'APP_OLD_VERSION'
        ? 'Asked from an older app (no tick-box there).'
        : 'Asked in the app, confirmed with a code.';
  if (!c?.accepted) return by;
  return `${by} Ticked “I have read and agree” on ${longDate(c.at)} (${c.version}${
    c.platform ? `, ${c.platform === 'ios' ? 'iPhone' : c.platform}` : ''
  }).`;
}

/** The Account panel on its own — for an account found by number, or opened from deletions. */
export function AccountDrawer({ account, onClose, onChanged }) {
  return (
    <Drawer
      title={account.name || 'Customer account'}
      subtitle={account.mobileMasked || undefined}
      onClose={onClose}
      footer={null}
    >
      <AccountPanel customerKey={account.key} onChanged={onChanged} />
      <p className="field__hint" style={{ marginTop: 18 }}>
        Their orders, if any, are on the Customers list.
      </p>
    </Drawer>
  );
}

/** "Find by mobile number" — reaches accounts that have never ordered, too. */
export function MobileLookup({ onFound }) {
  const [mobile, setMobile] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  async function find() {
    if (!isMobile(mobile)) return setNote('Enter a 10-digit mobile number starting 6–9.');
    setBusy(true);
    setNote('');
    try {
      const r = await api.get(`/admin/customer-lookup?mobile=${mobile}`);
      onFound(r.account);
    } catch (e) {
      setNote(e.message || 'Could not look that up.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="hstack" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="cust__search" style={{ marginLeft: 0 }}>
          <IconSearch size={15} />
          <input
            className="field__input"
            inputMode="numeric"
            value={mobile}
            placeholder="Find by mobile number"
            aria-label="Find an account by mobile number"
            onChange={(e) => {
              setMobile(digits(e.target.value, 10));
              setNote('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && find()}
          />
        </div>
        <button
          className="btn btn--ghost btn--sm"
          onClick={find}
          disabled={busy || mobile.length !== 10}
        >
          {busy ? 'Finding…' : 'Open account'}
        </button>
      </div>
      <p className="field__hint" style={{ margin: '4px 0 0' }}>
        {note || 'The whole number — finds accounts with no orders too. The lookup is recorded.'}
      </p>
    </div>
  );
}

/** Every scheduled deletion, soonest first. */
export function DeletionsDrawer({ data, error, reload, onOpen, onClose }) {
  const owner = isOwner();
  const rows = data?.deletions || [];

  async function cancel(d) {
    if (
      !window.confirm(
        `Cancel the deletion of ${d.name || 'this account'}? It is kept, and they can sign in again as normal.`,
      )
    )
      return;
    try {
      await api.del(`/admin/customers/${encodeURIComponent(d.key)}/deletion`);
      toast('Deletion cancelled');
      reload();
    } catch (e) {
      toast(e.message || 'Could not cancel the deletion.', 'err');
    }
  }

  return (
    <Drawer
      title="Scheduled deletions"
      subtitle="Accounts that will be erased, soonest first"
      onClose={onClose}
      footer={null}
    >
      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : !data ? (
        <TableSkeleton rows={3} />
      ) : rows.length === 0 ? (
        <div className="empty" style={{ padding: '20px 12px' }}>
          No account is waiting to be deleted.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Asked</th>
                <th>How</th>
                <th>Erased on</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.key}>
                  <td>
                    {d.name || <span className="muted">No name given</span>}
                    <div className="muted mono" style={{ fontSize: 12 }}>
                      {d.mobileMasked || ''}
                    </div>
                  </td>
                  <td style={{ fontSize: 12.5 }}>{longDate(d.requestedAt)}</td>
                  <td
                    className="muted"
                    style={{ fontSize: 12, whiteSpace: 'nowrap' }}
                    title={howAsked(d)}
                  >
                    {howAsked(d, true)}
                  </td>
                  <td style={{ fontSize: 12.5, fontWeight: 600 }}>{longDate(d.deleteAfter)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn--ghost btn--sm" onClick={() => onOpen(d)}>
                      Open
                    </button>
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => cancel(d)}
                      disabled={!owner}
                      title={owner ? undefined : 'Only the owner can cancel a deletion'}
                    >
                      Cancel deletion
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="field__hint" style={{ marginTop: 14 }}>
        A customer who signs in again before the date also cancels their own deletion.
        {!owner && ' Only the owner can cancel one here.'}
      </p>
    </Drawer>
  );
}
