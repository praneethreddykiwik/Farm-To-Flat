/**
 * The tracking brief's controls on the Friday report page — everything that used to be fixed in
 * code is created, edited, switched or deleted here:
 *
 *   Links & QR      saved /go links (counter QR, WhatsApp post, flyer) with their QR, scans and
 *                   installs; daily scan counts; which households arrived through an install link.
 *   Event switches  record all events or switch one off; delete a test event (in Events).
 *   Settings        the "how did you hear" answers, the reminder's wording / preview / send now,
 *                   the Home-screen nudges, the neighbour-number referral and the ₹ rewards.
 *
 * API: /admin/growth/links, /admin/growth/link-scans, /admin/growth/install-sources,
 * /admin/events/:id, /admin/business/settings/:name, /admin/business/reminders/*,
 * /admin/growth/settings. Every change is audit-logged on the server.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { toast, useResource } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { Drawer as UiDrawer, ErrorNote, TableSkeleton } from '../components/ui.jsx';
import { IconCopy, IconEdit, IconPlus, IconTrash } from '../components/icons.jsx';
import { addDays } from '../components/business.jsx';
import { dateTime, shortDate } from '../lib/format.js';

/**
 * Drawers are portalled to <body>: the cards they open from are their own stacking layers, so a
 * drawer rendered inside one was painted under the cards that come after it.
 */
const Drawer = (props) => createPortal(<UiDrawer {...props} />, document.body);

export function Card({ title, children, hint = null, action = null }) {
  return (
    <div className="glass card reveal">
      {(title || action) && (
        <div
          className="card__head"
          style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}
        >
          <h2 className="card__title" style={{ fontSize: 15 }}>
            {title}
          </h2>
          {action}
        </div>
      )}
      {children}
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

const Empty = ({ children }) => (
  <div className="empty" style={{ padding: '20px 12px' }}>
    {children}
  </div>
);

const Badge = ({ on, yes = 'On', no = 'Off' }) => (
  <span className={`badge ${on ? 'badge--located' : 'badge--unlocated'}`}>{on ? yes : no}</span>
);

async function call(fn, ok, done) {
  try {
    const r = await fn();
    if (ok) toast(ok);
    done?.(r);
    return r;
  } catch (e) {
    toast(e.message || 'Something went wrong.', 'err');
    return null;
  }
}

const SOURCES = ['counter', 'whatsapp', 'referral', 'resident_group', 'flyer', 'other'];

// ── Links & QR ──────────────────────────────────────────────────────────────

export function LinksTab({ week }) {
  return (
    <div className="vstack" style={{ gap: 16 }}>
      <TagLinks />
      <div className="grid-2 grid-2--even">
        <LinkScans week={week} />
        <InstallSources />
      </div>
    </div>
  );
}

function TagLinks() {
  const { data, error, reload } = useResource('/admin/growth/links');
  const [edit, setEdit] = useState(null);
  const [qr, setQr] = useState(null);
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  const links = data?.links || [];
  return (
    <Card
      title="Tagged links"
      hint="Each link opens fooducia.health/go. On Android it goes straight to Google Play and the app learns the tag on first open, so the stall, post or neighbour is credited without a code. Scans are anonymous daily counts; installs are households whose app arrived through the link."
      action={
        <button className="btn btn--primary" onClick={() => setEdit({ src: 'counter' })}>
          <IconPlus size={17} /> New link
        </button>
      }
    >
      {!data ? (
        <TableSkeleton rows={3} />
      ) : links.length === 0 ? (
        <Empty>No saved links yet. Make one per counter, WhatsApp post or flyer.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Link</th>
                <th style={{ textAlign: 'right' }}>Scans</th>
                <th style={{ textAlign: 'right' }}>Installs</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.id} style={l.active === false ? { opacity: 0.55 } : undefined}>
                  <td>
                    {l.name}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {l.active === false ? 'Paused · ' : ''}
                      {l.note || l.src}
                    </div>
                  </td>
                  <td className="mono" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>
                    {l.url}
                  </td>
                  <td style={{ textAlign: 'right' }} className="mono">
                    {l.scans}
                  </td>
                  <td style={{ textAlign: 'right' }} className="mono">
                    {l.installs}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      className="btn btn--ghost btn--sm"
                      aria-label="Copy link"
                      onClick={() =>
                        navigator.clipboard?.writeText(l.url).then(() => toast('Link copied'))
                      }
                    >
                      <IconCopy size={15} />
                    </button>
                    <button className="btn btn--ghost btn--sm" onClick={() => setQr(l)}>
                      QR
                    </button>
                    <button
                      className="btn btn--ghost btn--sm"
                      aria-label="Edit link"
                      onClick={() => setEdit(l)}
                    >
                      <IconEdit size={15} />
                    </button>
                    <button
                      className="btn btn--ghost btn--sm"
                      aria-label="Delete link"
                      onClick={() =>
                        window.confirm(
                          `Delete “${l.name}”? Scans already counted stay in the report.`,
                        ) &&
                        call(() => api.del(`/admin/growth/links/${l.id}`), 'Link deleted', reload)
                      }
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
        <LinkDrawer
          link={edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            reload();
          }}
        />
      )}
      {qr && <QrDrawer link={qr} onClose={() => setQr(null)} />}
    </Card>
  );
}

function LinkDrawer({ link, onClose, onSaved }) {
  const { data: comms } = useResource('/admin/communities');
  const { data: proms } = useResource('/admin/growth/promoters');
  const [f, setF] = useState({
    name: link.name || '',
    src: link.src || 'counter',
    p: link.p || '',
    c: link.c || '',
    r: link.r || '',
    note: link.note || '',
    active: link.active !== false,
  });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = () => {
    const body = {
      name: f.name.trim(),
      src: f.src.trim(),
      p: f.p.trim() || null,
      c: f.c.trim() || null,
      r: f.r.trim() || null,
      note: f.note.trim() || null,
      active: f.active,
    };
    return call(
      () =>
        link.id
          ? api.patch(`/admin/growth/links/${link.id}`, body)
          : api.post('/admin/growth/links', body),
      link.id ? 'Link saved' : 'Link created',
      onSaved,
    );
  };
  return (
    <Drawer
      title={link.id ? 'Edit link' : 'New tagged link'}
      subtitle="Where the link will be shared, and who should be credited."
      onClose={onClose}
      footer={
        <div className="hstack" style={{ justifyContent: 'flex-end', width: '100%' }}>
          <button className="btn btn--primary" onClick={save} disabled={f.name.trim().length < 2}>
            Save link
          </button>
        </div>
      }
    >
      <div className="vstack" style={{ gap: 12 }}>
        <label className="field">
          <span className="field__label">Name</span>
          <input
            className="field__input"
            value={f.name}
            onChange={set('name')}
            placeholder="Aquantis gate counter"
            maxLength={80}
          />
        </label>
        <label className="field">
          <span className="field__label">Shared through</span>
          <select className="field__input" value={f.src} onChange={set('src')}>
            {[...new Set([...SOURCES, f.src])].map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Promoter (optional)</span>
          <select className="field__input" value={f.p} onChange={set('p')}>
            <option value="">— none —</option>
            {(proms?.promoters || []).map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Community (optional)</span>
          <select className="field__input" value={f.c} onChange={set('c')}>
            <option value="">— any —</option>
            {(comms?.communities || []).map((c) => {
              const slug = String(c.id).replace(/^com_/, '');
              return (
                <option key={c.id} value={slug}>
                  {c.name}
                </option>
              );
            })}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Invite code (optional)</span>
          <input
            className="field__input mono"
            value={f.r}
            onChange={set('r')}
            placeholder="NBXXXXXX"
            maxLength={12}
          />
        </label>
        <label className="field">
          <span className="field__label">Note</span>
          <input className="field__input" value={f.note} onChange={set('note')} maxLength={200} />
        </label>
        <label className="hstack" style={{ gap: 8 }}>
          <input
            type="checkbox"
            checked={f.active}
            onChange={(e) => setF((x) => ({ ...x, active: e.target.checked }))}
          />
          <span>Active (untick to mark it paused in this list)</span>
        </label>
      </div>
    </Drawer>
  );
}

function QrDrawer({ link, onClose }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(link.url, { width: 520, margin: 1 })
      .then((d) => live && setSrc(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [link.url]);
  return (
    <Drawer
      title={`QR · ${link.name}`}
      subtitle="Save or print it for the counter, poster or post."
      onClose={onClose}
    >
      <div className="vstack" style={{ gap: 12, alignItems: 'center' }}>
        {src ? (
          <img src={src} alt={`QR code for ${link.name}`} style={{ width: 260, height: 260 }} />
        ) : (
          <div className="skeleton" style={{ width: 260, height: 260 }} />
        )}
        <p className="mono" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>
          {link.url}
        </p>
        {src && (
          <a className="btn btn--primary" href={src} download={`fooducia-${link.id}.png`}>
            Download QR
          </a>
        )}
      </div>
    </Drawer>
  );
}

function LinkScans({ week }) {
  const { data, error, reload } = useResource(
    `/admin/growth/link-scans?from=${week}&to=${addDays(week, 6)}`,
  );
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  return (
    <Card
      title={`Scans this week${data ? ` · ${data.total}` : ''}`}
      hint="Opens of any /go link, per day and tag. No IP, device or cookie is kept. Delete a row to clear test scans."
    >
      {!data ? (
        <TableSkeleton rows={3} />
      ) : data.scans.length === 0 ? (
        <Empty>No scans this week.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Tag</th>
                <th style={{ textAlign: 'right' }}>Scans</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.scans.map((k) => (
                <tr key={k.id}>
                  <td>{shortDate(k.day)}</td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {[k.src, k.p, k.c].filter(Boolean).join(' · ')}
                  </td>
                  <td style={{ textAlign: 'right' }} className="mono">
                    {k.n}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn--ghost btn--sm"
                      aria-label="Delete scan count"
                      onClick={() =>
                        window.confirm('Delete this scan count?') &&
                        call(
                          () => api.del(`/admin/growth/link-scans/${encodeURIComponent(k.id)}`),
                          'Deleted',
                          reload,
                        )
                      }
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
  );
}

function InstallSources() {
  const { data, error, reload } = useResource('/admin/growth/install-sources');
  const [edit, setEdit] = useState(null);
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  return (
    <Card
      title="Installs from a link"
      hint="Households whose Android app arrived through a tagged link. Correct a wrong tag, or delete it to stop it crediting anyone."
    >
      {!data ? (
        <TableSkeleton rows={3} />
      ) : data.installs.length === 0 ? (
        <Empty>No installs through a link yet.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Household</th>
                <th>Tag</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.installs.map((i) => (
                <tr key={i.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{dateTime(i.at)}</td>
                  <td>
                    {i.customer?.name || '—'}
                    <div className="muted mono" style={{ fontSize: 12 }}>
                      {i.customer?.mobileMasked || 'deleted'}
                    </div>
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {[i.src, i.p, i.c, i.r].filter(Boolean).join(' · ')}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      className="btn btn--ghost btn--sm"
                      aria-label="Correct tag"
                      onClick={() => setEdit(i)}
                    >
                      <IconEdit size={15} />
                    </button>
                    <button
                      className="btn btn--ghost btn--sm"
                      aria-label="Delete install source"
                      onClick={() =>
                        window.confirm(
                          'Remove this install source? The household stops being credited to it.',
                        ) &&
                        call(
                          () => api.del(`/admin/growth/install-sources/${i.id}`),
                          'Removed',
                          reload,
                        )
                      }
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
        <InstallDrawer
          row={edit}
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

function InstallDrawer({ row, onClose, onSaved }) {
  const [f, setF] = useState({
    src: row.src || '',
    p: row.p || '',
    c: row.c || '',
    r: row.r || '',
  });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Drawer
      title="Correct an install source"
      onClose={onClose}
      footer={
        <div className="hstack" style={{ justifyContent: 'flex-end', width: '100%' }}>
          <button
            className="btn btn--primary"
            onClick={() =>
              call(() => api.patch(`/admin/growth/install-sources/${row.id}`, f), 'Saved', onSaved)
            }
          >
            Save
          </button>
        </div>
      }
    >
      <div className="vstack" style={{ gap: 12 }}>
        {[
          ['src', 'Shared through'],
          ['p', 'Promoter code'],
          ['c', 'Community'],
          ['r', 'Invite code'],
        ].map(([k, label]) => (
          <label key={k} className="field">
            <span className="field__label">{label}</span>
            <input className="field__input mono" value={f[k]} onChange={set(k)} maxLength={40} />
          </label>
        ))}
      </div>
    </Drawer>
  );
}

// ── event switches + delete ─────────────────────────────────────────────────

export function EventSwitches({ names, onChanged }) {
  const { data, reload } = useResource('/admin/business/settings/tracking');
  if (!data) return null;
  const s = data.settings;
  const off = new Set(s.disabledEvents || []);
  const save = (body) =>
    call(
      () => api.put('/admin/business/settings/tracking', body),
      'Saved',
      () => {
        reload();
        onChanged?.();
      },
    );
  return (
    <Card
      title="What is recorded"
      hint="Switch an event off and it is no longer recorded from now on; what is already recorded stays. Switching tracking off stops every event (the Friday report then has nothing new to count)."
      action={
        <button
          className={`btn ${s.enabled === false ? 'btn--primary' : ''}`}
          onClick={() =>
            (s.enabled === false || window.confirm('Stop recording all tracking events?')) &&
            save({ enabled: s.enabled === false })
          }
        >
          {s.enabled === false ? 'Turn tracking on' : 'Turn all tracking off'}
        </button>
      }
    >
      <div className="vstack" style={{ gap: 8 }}>
        {s.enabled === false && <Badge on={false} no="All tracking is off" />}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
            gap: 8,
          }}
        >
          {names.map((n) => (
            <label key={n} className="hstack" style={{ gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={!off.has(n)}
                disabled={s.enabled === false}
                onChange={(e) => {
                  const next = new Set(off);
                  if (e.target.checked) next.delete(n);
                  else next.add(n);
                  save({ disabledEvents: [...next] });
                }}
              />
              <span className="mono">{n}</span>
            </label>
          ))}
        </div>
      </div>
    </Card>
  );
}

export const deleteEvent = (e, done) =>
  window.confirm(`Delete this ${e.name} event? Use this for test traffic only.`) &&
  call(() => api.del(`/admin/events/${e.id}`), 'Event deleted', done);

// ── settings: source question, reminder, nudges, referrals ───────────────────

export function MoreSettings() {
  const sq = useResource('/admin/business/settings/sourceQuestion');
  const rem = useResource('/admin/business/settings/reminders');
  const nud = useResource('/admin/business/settings/appNudges');
  const gro = useResource('/admin/growth/settings');
  if (!sq.data || !rem.data || !nud.data || !gro.data) return <TableSkeleton rows={6} />;
  return (
    <>
      <div className="grid-2 grid-2--even">
        <SourceQuestion s={sq.data.settings} onSaved={sq.reload} />
        <ReminderFull s={rem.data.settings} onSaved={rem.reload} />
      </div>
      <div className="grid-2 grid-2--even">
        <Nudges s={nud.data.settings} onSaved={nud.reload} />
        <Referrals s={gro.data.settings} onSaved={gro.reload} />
      </div>
    </>
  );
}

const putSettings = (name, body, done) =>
  call(() => api.put(`/admin/business/settings/${name}`, body), 'Saved', done);

function SourceQuestion({ s, onSaved }) {
  const [opts, setOpts] = useState(() =>
    s.options.map((o) => ({ ...o, enabled: o.enabled !== false, saved: true, rid: o.key })),
  );
  const update = (i, patch) => setOpts((l) => l.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const move = (i, d) =>
    setOpts((l) => {
      const n = [...l];
      const [x] = n.splice(i, 1);
      n.splice(Math.max(0, Math.min(n.length, i + d)), 0, x);
      return n;
    });
  const save = (patch = {}) =>
    putSettings(
      'sourceQuestion',
      {
        options: opts.map(({ key, label, enabled }) => ({ key, label: label.trim(), enabled })),
        ...patch,
      },
      onSaved,
    );
  return (
    <Card
      title="“How did you hear about Fooducia?”"
      hint="The answers the app offers at the first order, in this order. Reports group by the key, so an answer that has been used is switched off rather than deleted. New answers get a key like FLYER."
      action={
        <button
          className={`btn ${s.required ? '' : 'btn--primary'}`}
          onClick={() => putSettings('sourceQuestion', { required: !s.required }, onSaved)}
        >
          {s.required ? 'Make it optional' : 'Make it required'}
        </button>
      }
    >
      <div className="vstack" style={{ gap: 8 }}>
        <Badge on={s.required} yes="Required before the first order" no="Optional" />
        {opts.map((o, i) => (
          <div key={o.rid} className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
            <input
              className="field__input mono"
              style={{ width: 150 }}
              value={o.key}
              disabled={o.saved}
              onChange={(e) =>
                update(i, {
                  key: e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9_]/g, '')
                    .slice(0, 20),
                })
              }
              aria-label="Answer key"
            />
            <input
              className="field__input"
              style={{ flex: 1, minWidth: 160 }}
              value={o.label}
              maxLength={60}
              onChange={(e) => update(i, { label: e.target.value })}
              aria-label="Answer shown to customers"
            />
            <label className="hstack" style={{ gap: 4, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={o.enabled}
                onChange={(e) => update(i, { enabled: e.target.checked })}
              />
              shown
            </label>
            <button
              className="btn btn--ghost btn--sm"
              aria-label="Move up"
              onClick={() => move(i, -1)}
            >
              ↑
            </button>
            <button
              className="btn btn--ghost btn--sm"
              aria-label="Move down"
              onClick={() => move(i, 1)}
            >
              ↓
            </button>
            {!o.saved && (
              <button
                className="btn btn--ghost btn--sm"
                aria-label="Remove answer"
                onClick={() => setOpts((l) => l.filter((_, j) => j !== i))}
              >
                <IconTrash size={15} />
              </button>
            )}
          </div>
        ))}
        <div className="hstack" style={{ gap: 8, justifyContent: 'space-between', marginTop: 6 }}>
          <button
            className="btn"
            disabled={opts.length >= 12}
            onClick={() =>
              setOpts((l) => [
                ...l,
                { key: '', label: '', enabled: true, saved: false, rid: `new-${Date.now()}` },
              ])
            }
          >
            <IconPlus size={16} /> Add an answer
          </button>
          <button className="btn btn--primary" onClick={() => save()}>
            Save answers
          </button>
        </div>
        <p className="field__hint" style={{ margin: 0 }}>
          The five built-in answers are translated into Hindi and Telugu in the app; a new answer
          shows as typed here.
        </p>
      </div>
    </Card>
  );
}

function ReminderFull({ s, onSaved }) {
  const [f, setF] = useState({ time: s.time, title: s.title, body: s.body });
  const prev = useResource('/admin/business/reminders/preview');
  const [busy, setBusy] = useState(false);
  const sendNow = async () => {
    const p = prev.data;
    if (
      !window.confirm(
        `Send “${f.title}” now to ${p?.reach ?? 'every eligible'} household(s)? This counts as today’s reminder.`,
      )
    )
      return;
    setBusy(true);
    await call(
      () => api.post('/admin/business/reminders/send-now'),
      null,
      (r) => {
        toast(`Sent to ${r.sent} household(s)`);
        prev.reload();
      },
    );
    setBusy(false);
  };
  return (
    <Card
      title="Cut-off reminder"
      hint="A daily app notification at the set time to households with notifications on and no order for tomorrow. It goes out once a day; “Send now” counts as that day’s. WhatsApp joins once a Meta-approved template is set up."
      action={
        <button
          className={`btn ${s.enabled ? '' : 'btn--primary'}`}
          onClick={() => putSettings('reminders', { enabled: !s.enabled }, onSaved)}
        >
          {s.enabled ? 'Switch off' : 'Switch on'}
        </button>
      }
    >
      <div className="vstack" style={{ gap: 12 }}>
        <Badge on={s.enabled} yes={`On — daily at ${s.time} IST`} />
        <label className="field">
          <span className="field__label">Send at (IST)</span>
          <input
            type="time"
            className="field__input"
            value={f.time}
            onChange={(e) => setF((x) => ({ ...x, time: e.target.value }))}
          />
        </label>
        <label className="field">
          <span className="field__label">Title</span>
          <input
            className="field__input"
            maxLength={60}
            value={f.title}
            onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))}
          />
        </label>
        <label className="field">
          <span className="field__label">Message</span>
          <textarea
            className="field__input"
            rows={2}
            maxLength={160}
            value={f.body}
            onChange={(e) => setF((x) => ({ ...x, body: e.target.value }))}
          />
        </label>
        <div className="glass" style={{ padding: 12, borderRadius: 14 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            Preview
          </div>
          <b>{f.title}</b>
          <div style={{ fontSize: 13 }}>{f.body}</div>
          {prev.data && (
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Right now it would reach {prev.data.reach} household(s); {prev.data.alreadyOrdered}{' '}
              already ordered for {shortDate(prev.data.forDate)}.{' '}
              {prev.data.sentToday ? 'Today’s reminder has gone out.' : 'Not sent today yet.'}
            </div>
          )}
        </div>
        <div className="hstack" style={{ gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn" disabled={busy || prev.data?.sentToday} onClick={sendNow}>
            Send now
          </button>
          <button
            className="btn btn--primary"
            onClick={() =>
              putSettings('reminders', f, () => {
                onSaved();
                prev.reload();
              })
            }
          >
            Save reminder
          </button>
        </div>
      </div>
    </Card>
  );
}

function Nudges({ s, onSaved }) {
  const [hours, setHours] = useState(s.countdownHours);
  return (
    <Card
      title="Home screen nudges"
      hint="What the app shows on Home. The countdown appears only while tomorrow morning’s window is open and closes within the hours set. Repeat basket appears after a delivered order when nothing else is on its way."
    >
      <div className="vstack" style={{ gap: 12 }}>
        <label className="hstack" style={{ gap: 8 }}>
          <input
            type="checkbox"
            checked={!!s.countdown}
            onChange={(e) => putSettings('appNudges', { countdown: e.target.checked }, onSaved)}
          />
          <span>Cut-off countdown (“Order in 2h 15m for tomorrow morning”)</span>
        </label>
        <label className="field">
          <span className="field__label">
            Show the countdown from this many hours before the cut-off
          </span>
          <div className="hstack" style={{ gap: 8 }}>
            <input
              type="number"
              min="1"
              max="24"
              className="field__input"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
            <button
              className="btn"
              onClick={() => putSettings('appNudges', { countdownHours: Number(hours) }, onSaved)}
            >
              Save
            </button>
          </div>
        </label>
        <label className="hstack" style={{ gap: 8 }}>
          <input
            type="checkbox"
            checked={!!s.repeatBasket}
            onChange={(e) => putSettings('appNudges', { repeatBasket: e.target.checked }, onSaved)}
          />
          <span>“Repeat your last basket”</span>
        </label>
      </div>
    </Card>
  );
}

function Referrals({ s, onSaved }) {
  const [f, setF] = useState({
    referrer: String(s.referrerRewardPaise / 100),
    referee: String(s.refereeRewardPaise / 100),
  });
  const save = (body) => call(() => api.put('/admin/growth/settings', body), 'Saved', onSaved);
  return (
    <Card
      title="Neighbour referrals"
      hint="Both rewards are wallet credit, paid once the invited household’s first order is delivered. The same settings live on Referral program → Settings."
    >
      <div className="vstack" style={{ gap: 12 }}>
        <label className="hstack" style={{ gap: 8 }}>
          <input
            type="checkbox"
            checked={!!s.referralEnabled}
            onChange={(e) => save({ referralEnabled: e.target.checked })}
          />
          <span>Referrals on</span>
        </label>
        <label className="hstack" style={{ gap: 8 }}>
          <input
            type="checkbox"
            checked={s.mobileReferral !== false}
            onChange={(e) => save({ mobileReferral: e.target.checked })}
          />
          <span>
            Accept a neighbour’s mobile number as the code (for iPhones, which have no install link)
          </span>
        </label>
        <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: 1, minWidth: 140 }}>
            <span className="field__label">Neighbour who invited gets ₹</span>
            <input
              type="number"
              min="0"
              className="field__input"
              value={f.referrer}
              onChange={(e) => setF((x) => ({ ...x, referrer: e.target.value }))}
            />
          </label>
          <label className="field" style={{ flex: 1, minWidth: 140 }}>
            <span className="field__label">New household gets ₹</span>
            <input
              type="number"
              min="0"
              className="field__input"
              value={f.referee}
              onChange={(e) => setF((x) => ({ ...x, referee: e.target.value }))}
            />
          </label>
        </div>
        <div className="hstack" style={{ justifyContent: 'flex-end' }}>
          <button
            className="btn btn--primary"
            onClick={() =>
              save({
                referrerRewardPaise: Math.round(Number(f.referrer) * 100),
                refereeRewardPaise: Math.round(Number(f.referee) * 100),
              })
            }
          >
            Save rewards
          </button>
        </div>
      </div>
    </Card>
  );
}
