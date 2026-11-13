/**
 * Demand — where people are asking us to deliver, most wanted first.
 *
 * Two numbers per area, and they are different things:
 *
 *   WAITING   people who pressed "tell me when you deliver here". Each is a named person with a
 *             mobile number, who chose to give it for that one message. This is the number the
 *             list is ranked by, because it is the number you can act on: there is someone to tell.
 *
 *   CHECKS    how many times someone outside every community we serve pressed "Use my location".
 *             A count and nothing else — no name, no number, about a kilometre of precision. It
 *             shows where curiosity is, including the people who did not leave their details.
 *
 * Opening an area shows who is waiting and what community they named, how far it is from where the
 * van already goes, and lets you record what you have decided. "Notify" tells the people waiting —
 * each of them once, however often it is pressed — and is confirmed before it sends, because a
 * message to customers cannot be taken back.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast, useResource } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { Drawer, ErrorNote, Stat, TableSkeleton } from '../components/ui.jsx';
import { IconCopy, IconMap, IconPin, IconSearch } from '../components/icons.jsx';
import { dateTime, mapUrl } from '../lib/format.js';

const STATUS = {
  OPEN: { label: 'Open', hint: 'Nothing decided yet.' },
  PLANNED: { label: 'Planned', hint: 'We intend to deliver here.' },
  LAUNCHED: { label: 'Launched', hint: 'We deliver here now.' },
  DISMISSED: { label: 'Not for now', hint: 'Out of reach for the foreseeable future.' },
};
const TABS = [
  { key: 'ACTIVE', label: 'To decide', has: (a) => a.status === 'OPEN' || a.status === 'PLANNED' },
  { key: 'LAUNCHED', label: 'Launched', has: (a) => a.status === 'LAUNCHED' },
  { key: 'DISMISSED', label: 'Not for now', has: (a) => a.status === 'DISMISSED' },
  { key: 'ALL', label: 'All', has: () => true },
];

const people = (n) => `${n} ${n === 1 ? 'person' : 'people'}`;
/** The area key is "pin:500084" or "g:17.46,78.36" — it has to be encoded to travel in a path. */
const areaPath = (key) => `/admin/demand/${encodeURIComponent(key)}`;

function StatusBadge({ status }) {
  return (
    <span className={`badge dm-${status}`}>
      <span className="badge__dot" />
      {STATUS[status]?.label || status}
    </span>
  );
}

export function Demand() {
  const { data, loading, error, reload } = useResource('/admin/demand');
  const areas = useMemo(() => data?.areas || [], [data]);
  const [tab, setTab] = useState('ACTIVE');
  const [q, setQ] = useState('');
  const [openKey, setOpenKey] = useState(/** @type {string|null} */ (null));

  // Rank is the position in the WHOLE list, so "third most wanted" means the same thing whichever
  // tab or search is showing.
  const ranked = useMemo(() => areas.map((a, i) => ({ ...a, rank: i + 1 })), [areas]);
  const shown = useMemo(() => {
    const has = TABS.find((t) => t.key === tab)?.has || (() => true);
    const needle = q.trim().toLowerCase();
    return ranked.filter(
      (a) =>
        has(a) &&
        (!needle ||
          [a.label, a.pincode, a.locality, a.city, ...a.communities.map((c) => c.name)]
            .filter(Boolean)
            .some((s) => String(s).toLowerCase().includes(needle))),
    );
  }, [ranked, tab, q]);

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Demand</h1>
          <p className="page-sub">Where people are asking us to deliver — most wanted first.</p>
        </div>
      </header>

      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="glass card">
          <TableSkeleton rows={6} />
        </div>
      ) : (
        <>
          {data.ready === false && <SetupNote sql={data.setupSql} />}

          <div className="stat-grid stagger">
            <Stat
              icon={<IconPin size={20} />}
              value={data.totals.subscribers.toLocaleString('en-IN')}
              label="People waiting to be told"
              tint="sprout"
            />
            <Stat
              icon={<IconSearch size={20} />}
              value={data.totals.checks.toLocaleString('en-IN')}
              label="Location checks from outside — anonymous"
            />
            <Stat
              icon={<IconMap size={20} />}
              value={data.totals.areas.toLocaleString('en-IN')}
              label="Areas asked from"
            />
          </div>

          <div
            className="hstack"
            style={{ gap: 8, margin: '20px 0 14px', flexWrap: 'wrap', alignItems: 'center' }}
          >
            {TABS.map((t) => {
              const count = areas.filter(t.has).length;
              return (
                <button
                  key={t.key}
                  className={`chip${tab === t.key ? ' is-active' : ''}`}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                  <span className="chip__count">{count}</span>
                </button>
              );
            })}
            <input
              className="field__input"
              style={{ maxWidth: 260, marginLeft: 'auto' }}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search area, PIN or community"
              aria-label="Search areas"
            />
          </div>

          <div className="glass card reveal" style={{ padding: 0 }}>
            {areas.length === 0 ? (
              <div className="empty">
                <p style={{ fontWeight: 600, color: 'var(--ink-2)' }}>Nobody has asked yet.</p>
                <p style={{ marginTop: 6, maxWidth: 460, marginInline: 'auto' }}>
                  An area appears here when someone outside the communities we serve presses “Use my
                  location” in the app, or tells us their community is not in the list. That needs
                  each community’s location to be set first — see Communities.
                </p>
              </div>
            ) : shown.length === 0 ? (
              <div className="empty">Nothing here matches.</div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Area</th>
                      <th className="num">Waiting</th>
                      <th className="num">Checks</th>
                      <th className="num">Last 7 days</th>
                      <th>Communities asked for</th>
                      <th>Nearest we serve</th>
                      <th>Last request</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((a) => (
                      <tr
                        key={a.key}
                        className="demand__row"
                        onClick={() => setOpenKey(a.key)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setOpenKey(a.key);
                          }
                        }}
                        aria-label={`${a.label}: ${people(a.subscribers)} waiting`}
                      >
                        <td className="demand__rank">{a.rank}</td>
                        <td>
                          <div className="data__name" style={{ fontWeight: 600 }}>
                            {a.label}
                          </div>
                          {a.city && a.city !== a.locality && (
                            <div className="muted" style={{ fontSize: 12 }}>
                              {a.city}
                            </div>
                          )}
                        </td>
                        <td className="num">
                          <span
                            className={`demand__waiting${a.subscribers ? '' : ' demand__waiting--none'}`}
                          >
                            {a.subscribers}
                          </span>
                        </td>
                        <td className="num">{a.checks}</td>
                        <td className="num">{a.last7 ? `+${a.last7}` : '—'}</td>
                        <td>
                          {a.communities.length ? (
                            <div className="demand__asked">
                              {a.communities.slice(0, 3).map((c) => (
                                <span key={c.name} className="demand__name" title={c.name}>
                                  {c.name}
                                  {c.count > 1 && <b> ×{c.count}</b>}
                                </span>
                              ))}
                              {a.communities.length > 3 && (
                                <span className="muted" style={{ fontSize: 12 }}>
                                  +{a.communities.length - 3}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          {a.nearest ? (
                            <>
                              <div className="data__name">{a.nearest.name}</div>
                              <div className="muted" style={{ fontSize: 12 }}>
                                {a.nearest.distanceKm} km away
                              </div>
                            </>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="data__name">{dateTime(a.lastAt)}</td>
                        <td>
                          <StatusBadge status={a.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="field__hint" style={{ marginTop: 12, maxWidth: 720 }}>
            Ranked by people waiting, then by checks. A check carries no name or number and places
            someone only to about a kilometre; it cannot be traced back to a customer. The people
            waiting chose to leave their details so that we can tell them.
          </p>
        </>
      )}

      {openKey && (
        <AreaDrawer areaKey={openKey} onClose={() => setOpenKey(null)} onChanged={reload} />
      )}
    </>
  );
}

/** Shown only when the database has no tables for this yet. Says so, and gives the cure. */
function SetupNote({ sql }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(sql);
      toast('Copied');
    } catch {
      toast('Select the text and copy it by hand.', 'err');
    }
  }
  return (
    <div className="glass card reveal" style={{ marginBottom: 16 }}>
      <p style={{ fontWeight: 600, color: 'var(--tomato)', margin: 0 }}>
        Demand is not being recorded yet
      </p>
      <p className="muted" style={{ margin: '6px 0 0', maxWidth: 720 }}>
        The database has no tables for it, so a customer who asks to be told is shown “we could not
        save that” and nothing is counted. Whoever runs the database needs to run this once, in its
        SQL editor. It is safe to run twice and touches nothing else. This page notices by itself
        once it is done.
      </p>
      {sql && (
        <>
          <pre className="demand__sql">{sql}</pre>
          <button className="btn btn--ghost btn--sm" style={{ marginTop: 10 }} onClick={copy}>
            <IconCopy size={15} /> Copy
          </button>
        </>
      )}
    </div>
  );
}

function AreaDrawer({ areaKey, onClose, onChanged }) {
  const { data, loading, error, reload } = useResource(areaPath(areaKey));
  const { data: comData } = useResource('/admin/communities');
  const area = data?.area;
  const subscribers = data?.subscribers || [];
  const pending = subscribers.filter((s) => !s.notifiedAt);

  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState('');
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setNote(area?.note || ''), [area?.note]);

  const changed = () => {
    reload();
    onChanged();
  };

  async function patch(body, done) {
    setBusy(true);
    setRefused('');
    try {
      await api.patch(areaPath(areaKey), body);
      toast(done);
      changed();
    } catch (e) {
      // NOT_READY carries the statement that creates the missing tables. Keep it on screen.
      if (e.code === 'NOT_READY') setRefused(e.message);
      else toast(e.message || 'Could not save', 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      title={area?.label || 'Area'}
      subtitle={
        area
          ? `${people(area.subscribers)} waiting · ${area.checks} anonymous ${area.checks === 1 ? 'check' : 'checks'}`
          : undefined
      }
      onClose={onClose}
      footer={null}
      wide
    >
      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : loading && !data ? (
        <TableSkeleton rows={5} />
      ) : (
        <>
          <dl className="demand__facts" style={{ margin: 0 }}>
            <div className="demand__fact">
              <dt>Nearest we serve</dt>
              <dd>
                {area.nearest
                  ? `${area.nearest.name} · ${area.nearest.distanceKm} km`
                  : 'Not known'}
              </dd>
            </div>
            <div className="demand__fact">
              <dt>First asked</dt>
              <dd>{dateTime(area.firstAt)}</dd>
            </div>
            <div className="demand__fact">
              <dt>Last asked</dt>
              <dd>{dateTime(area.lastAt)}</dd>
            </div>
            <div className="demand__fact">
              <dt>Where</dt>
              <dd>
                {typeof area.lat === 'number' ? (
                  <a href={mapUrl(area.lat, area.lng)} target="_blank" rel="noopener noreferrer">
                    Open on map
                  </a>
                ) : (
                  'No location given'
                )}
              </dd>
            </div>
          </dl>
          {typeof area.lat === 'number' && (
            <p className="field__hint">
              The map opens on the middle of a square about a kilometre across — where the area is,
              not where anyone lives.
            </p>
          )}

          <section className="demand__section">
            <h4>What we have decided</h4>
            <div className="seg" role="group" aria-label="Status">
              {Object.entries(STATUS).map(([code, s]) => (
                <button
                  key={code}
                  type="button"
                  className={`seg__btn${area.status === code ? ` is-active dm-${code}` : ''}`}
                  disabled={busy}
                  title={s.hint}
                  aria-pressed={area.status === code}
                  onClick={() =>
                    area.status !== code &&
                    patch({ status: code }, `Marked ${s.label.toLowerCase()}`)
                  }
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="field__hint">
              {STATUS[area.status]?.hint} Changing this tells nobody — it is your own record.
            </p>
            <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
              <label className="field__label" htmlFor="demand-note">
                Note
                <span className="story__count">{note.length}/300</span>
              </label>
              <textarea
                id="demand-note"
                className="field__input story__area"
                rows={2}
                maxLength={300}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Spoke to the residents’ association; they want Tuesdays and Saturdays."
              />
            </div>
            {note.trim() !== (area.note || '') && (
              <div className="hstack" style={{ gap: 8, marginTop: 10 }}>
                <button
                  className="btn btn--primary btn--sm"
                  disabled={busy}
                  onClick={() => patch({ note: note.trim() || null }, 'Note saved')}
                >
                  {busy ? 'Saving…' : 'Save note'}
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => setNote(area.note || '')}>
                  Discard
                </button>
              </div>
            )}
            {refused && (
              <div className="refusal" role="alert">
                <strong>Not saved.</strong> {refused}
              </div>
            )}
          </section>

          <section className="demand__section">
            <h4>Tell the people waiting</h4>
            {subscribers.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Nobody here has asked to be told. Checks are anonymous, so there is no one to
                message.
              </p>
            ) : confirming ? (
              <NotifyConfirm
                area={area}
                areaKey={areaKey}
                pending={pending.length}
                communities={comData?.communities || []}
                onCancel={() => setConfirming(false)}
                onSent={() => {
                  setConfirming(false);
                  changed();
                }}
              />
            ) : (
              <div className="hstack" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  className="btn btn--primary"
                  disabled={pending.length === 0}
                  onClick={() => setConfirming(true)}
                >
                  Notify {people(pending.length)}…
                </button>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {pending.length === 0
                    ? `Everyone waiting was told on ${dateTime(area.notifiedAt)}.`
                    : subscribers.length > pending.length
                      ? `${subscribers.length - pending.length} already told; they will not be told again.`
                      : 'A notification in the app, and on their phone if they allow them. You will see the message before it goes.'}
                </span>
              </div>
            )}
          </section>

          <section className="demand__section">
            <h4>
              Waiting · {subscribers.length}
              {area.communities.length > 0 && ' — and the communities they named'}
            </h4>
            {subscribers.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Nobody yet.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Mobile</th>
                      <th>Community they named</th>
                      <th>Asked</th>
                      <th>Told</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscribers.map((s) => (
                      <tr key={s.id}>
                        <td className="data__name">{s.name || <span className="muted">—</span>}</td>
                        <td className="mono data__name">
                          {s.mobile ? (
                            <a href={`tel:+91${s.mobile}`}>{s.mobile}</a>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          {s.communityName || <span className="muted">—</span>}
                          {s.source === 'not_listed' && (
                            <div className="muted" style={{ fontSize: 11.5 }}>
                              typed it — said it was not in our list
                            </div>
                          )}
                        </td>
                        <td className="data__name">{dateTime(s.createdAt)}</td>
                        <td className="data__name">
                          {s.notifiedAt ? dateTime(s.notifiedAt) : <span className="muted">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="field__hint" style={{ marginTop: 10 }}>
              These people gave their number to be told when we deliver here, and for nothing else.
              Do not add them to any other list. Each can remove themselves in the app, and is
              removed when they delete their account.
            </p>
          </section>
        </>
      )}
    </Drawer>
  );
}

/**
 * The step between "Notify…" and anything being sent. Shows exactly who and exactly what, because
 * this is the one action on the page that reaches customers and cannot be undone.
 */
function NotifyConfirm({ area, areaKey, pending, communities, onCancel, onSent }) {
  const [communityId, setCommunityId] = useState('');
  const community = communities.find((c) => c.id === communityId);
  const place =
    community?.name || area.locality || area.city || area.communities[0]?.name || area.label;
  const standard = `We now deliver to ${place}. Open the app to add your address.`;
  const [message, setMessage] = useState(standard);
  const [edited, setEdited] = useState(false);
  const [sending, setSending] = useState(false);
  const [refused, setRefused] = useState('');
  // Follow the community picker until the operator writes their own words; then leave theirs alone.
  useEffect(() => {
    if (!edited) setMessage(standard);
  }, [standard, edited]);

  const text = message.trim();
  async function send() {
    setSending(true);
    setRefused('');
    try {
      const { notified } = await api.post(`${areaPath(areaKey)}/notify`, {
        // The standard wording is the server's to write; only send words the operator changed.
        ...(edited && text !== standard ? { message: text } : {}),
        ...(communityId ? { communityId } : {}),
      });
      toast(notified ? `Told ${people(notified)}` : 'Everyone had already been told');
      onSent();
    } catch (e) {
      if (e.code === 'NOT_READY') setRefused(e.message);
      else toast(e.message || 'Could not send', 'err');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="demand__confirm">
      <div className="field">
        <label className="field__label" htmlFor="demand-community">
          Which community are they now served by? (optional)
        </label>
        <select
          id="demand-community"
          className="field__select"
          value={communityId}
          onChange={(e) => setCommunityId(e.target.value)}
        >
          <option value="">Just name the area — {area.locality || area.label}</option>
          {communities
            .filter((c) => c.isActive)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}, {c.area}
              </option>
            ))}
        </select>
        <p className="field__hint">
          Add the community under Communities first, with its location, so that these people can
          actually pick it when they open the app.
        </p>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label className="field__label" htmlFor="demand-message">
          The message
          <span className={`story__count${message.length > 216 ? ' is-near' : ''}`}>
            {message.length}/240
          </span>
        </label>
        <textarea
          id="demand-message"
          className="field__input story__area"
          rows={3}
          maxLength={240}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            setEdited(true);
          }}
        />
        {edited && text !== standard && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            style={{ marginTop: 8 }}
            onClick={() => setEdited(false)}
          >
            Use the standard wording
          </button>
        )}
      </div>
      {refused && (
        <div className="refusal" role="alert">
          <strong>Not sent.</strong> {refused}
        </div>
      )}
      <div className="hstack" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button className="btn btn--primary" onClick={send} disabled={sending || !text}>
          {sending ? 'Sending…' : `Send to ${people(pending)}`}
        </button>
        <button className="btn btn--ghost" onClick={onCancel} disabled={sending}>
          Cancel
        </button>
        <span className="muted" style={{ fontSize: 12.5, alignSelf: 'center' }}>
          Each person is told once. This cannot be unsent.
        </span>
      </div>
    </div>
  );
}
