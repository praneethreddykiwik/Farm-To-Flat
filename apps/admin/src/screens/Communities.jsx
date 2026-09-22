/**
 * Communities & delivery windows. Left: the serviceable communities with delivery days and their
 * order cut-off times. Right: the selected community's live 14-day window schedule, each window
 * showing whether it's open and (inside the warning period) a live countdown to its cut-off.
 *
 * There is no capacity/booking-count limit any more — a window only closes when its cut-off clock
 * time passes for that delivery date. Editing a cut-off PATCHes /admin/communities/:id and the
 * schedule refetches.
 */
import { useEffect, useMemo, useState } from 'react';
import { useResource, toast } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { Drawer, ErrorNote } from '../components/ui.jsx';
import { IconMap, IconPlus } from '../components/icons.jsx';
import { noLead, shortDate } from '../lib/format.js';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAYNAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function Communities() {
  const { data, loading, error, reload } = useResource('/admin/communities');
  const communities = useMemo(() => data?.communities || [], [data]);
  const [selId, setSelId] = useState(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!selId && communities.length) setSelId(communities[0].id);
  }, [communities, selId]);

  // Debounced-by-blur cut-off time edit: the input holds its own draft value and only PATCHes when
  // it's a complete, valid HH:MM and differs from what's saved — typing "0" then "3" then "3:" etc.
  // never fires a request for a half-typed time.
  const CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  async function setCutoff(c, field, value) {
    if (!CLOCK_RE.test(value) || value === c[field]) return;
    try {
      await api.patch(`/admin/communities/${c.id}`, { [field]: value });
      toast(`${c.name} · ${field === 'morningCutoff' ? 'Morning' : 'Evening'} cut-off → ${value}`);
      reload();
    } catch (e) {
      toast(e.message || 'Could not update', 'err');
    }
  }

  async function toggleDay(c, dayIndex) {
    const has = c.deliveryDays.includes(dayIndex);
    const deliveryDays = has
      ? c.deliveryDays.filter((d) => d !== dayIndex)
      : [...c.deliveryDays, dayIndex].sort((a, b) => a - b);
    if (deliveryDays.length === 0) return toast('Keep at least one delivery day.', 'err');
    try {
      await api.patch(`/admin/communities/${c.id}`, { deliveryDays });
      toast(`${c.name} · ${DAYNAME[dayIndex]} ${has ? 'removed' : 'added'}`);
      reload();
    } catch (e) {
      toast(e.message || 'Could not update', 'err');
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Communities & windows</h1>
          <p className="page-sub">
            {communities.length} serviceable · cut-off times and delivery days
          </p>
        </div>
        <button className="btn btn--primary" onClick={() => setAdding(true)}>
          <IconPlus size={18} /> New community
        </button>
      </header>

      {adding && (
        <CommunityForm
          onClose={() => setAdding(false)}
          onSaved={(c) => {
            setAdding(false);
            setSelId(c.id);
            reload();
          }}
        />
      )}

      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : loading ? (
        <div className="glass card">
          <div className="skeleton" style={{ height: 200 }} />
        </div>
      ) : (
        <div
          className="grid-2 grid-2--even"
          style={{ gridTemplateColumns: '1fr 1.1fr', alignItems: 'start' }}
        >
          <div className="vstack stagger" style={{ gap: 14 }}>
            {communities.map((c) => (
              <div
                key={c.id}
                className="glass card reveal"
                onClick={() => setSelId(c.id)}
                style={{
                  cursor: 'pointer',
                  outline: selId === c.id ? '2px solid var(--leaf)' : 'none',
                }}
              >
                <div className="hstack" style={{ justifyContent: 'space-between' }}>
                  <div className="hstack" style={{ gap: 12 }}>
                    <div className="stat__icon" style={{ margin: 0 }}>
                      <IconMap size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 16 }}>{c.name}</div>
                      <div className="muted" style={{ fontSize: 12.5 }}>
                        {c.area} · {c.blocks.length} blocks
                      </div>
                    </div>
                  </div>
                  <span className={`badge ${c.isActive ? 'st-CONFIRMED' : 'st-CANCELLED'}`}>
                    <span className="badge__dot" />
                    {c.isActive ? 'Active' : 'Paused'}
                  </span>
                </div>

                <div
                  className="hstack"
                  style={{ gap: 5, marginTop: 16 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {DAYS.map((d, i) => (
                    <button
                      key={i}
                      title={`${DAYNAME[i]} — click to ${c.deliveryDays.includes(i) ? 'remove' : 'add'}`}
                      className="daypill"
                      onClick={() => toggleDay(c, i)}
                      style={{
                        background: c.deliveryDays.includes(i)
                          ? 'var(--leaf)'
                          : 'rgba(14,27,20,0.05)',
                        color: c.deliveryDays.includes(i) ? '#fff' : 'var(--ink-3)',
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>

                <div
                  className="hstack"
                  style={{ gap: 14, marginTop: 12 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <CutoffField
                    label="Morning closes"
                    icon="🌅"
                    value={c.morningCutoff}
                    onCommit={(v) => setCutoff(c, 'morningCutoff', v)}
                  />
                  <CutoffField
                    label="Evening closes"
                    icon="🌇"
                    value={c.eveningCutoff}
                    onCommit={(v) => setCutoff(c, 'eveningCutoff', v)}
                  />
                </div>
              </div>
            ))}
          </div>

          <WindowSchedule communityId={selId} community={communities.find((c) => c.id === selId)} />
        </div>
      )}
    </>
  );
}

/** "12:45:03" from a whole number of seconds. */
function hms(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${two(m)}:${two(sec)}`;
}

/** One window's live status: open / counting down to its cut-off / closed. Ticks every second
 * client-side from the server's `secondsUntilCutoff` snapshot — no per-second polling. */
function WindowStatus({ w }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!w.showCountdown) return undefined;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [w.id, w.showCountdown, w.secondsUntilCutoff]);

  if (!w.isOpen) {
    return (
      <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
        Closed
      </span>
    );
  }
  if (w.showCountdown) {
    const left = w.secondsUntilCutoff - elapsed;
    // Amber for the whole open period, red once inside the community's warning window.
    const color = w.isUrgent ? 'var(--tomato)' : 'var(--leaf-deep)';
    return (
      <span className="mono" style={{ fontSize: 11, color, fontWeight: 700 }}>
        {left > 0 ? `Closes in ${hms(left)}` : 'Closing…'}
      </span>
    );
  }
  return (
    <span className="mono" style={{ fontSize: 11, color: 'var(--leaf-deep)' }}>
      Open
    </span>
  );
}

function WindowSchedule({ communityId, community }) {
  const { data, loading, error } = useResource(
    communityId ? `/admin/communities/${communityId}/windows` : '/admin/communities',
  );
  if (!communityId) return null;
  const windows = data?.windows || [];
  const byDate = windows.reduce((acc, w) => ((acc[w.date] ||= []).push(w), acc), {});

  return (
    <div className="glass card reveal" style={{ alignSelf: 'start' }}>
      <div className="card__head">
        <h2 className="card__title">{community?.name || 'Schedule'} · next 14 days</h2>
        <span className="muted" style={{ fontSize: 12.5 }}>
          cut-off status
        </span>
      </div>
      {error ? (
        <div className="empty">Could not load schedule.</div>
      ) : loading ? (
        <div className="skeleton" style={{ height: 180 }} />
      ) : windows.length === 0 ? (
        <div className="empty">No delivery days in range.</div>
      ) : (
        <div className="vstack" style={{ gap: 12, maxHeight: 520, overflowY: 'auto' }}>
          {Object.entries(byDate).map(([date, ws]) => (
            <div key={date}>
              <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 7 }}>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{shortDate(date)}</span>
              </div>
              <div className="hstack" style={{ gap: 10 }}>
                {ws.map((w) => (
                  <div
                    key={w.id}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.6)',
                      border: '1px solid var(--hairline)',
                      opacity: w.isOpen ? 1 : 0.6,
                    }}
                  >
                    <div
                      className="hstack"
                      style={{ justifyContent: 'space-between', marginBottom: 6 }}
                    >
                      <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em' }}>
                        {w.window === 'MORNING' ? '🌅 Morning' : '🌇 Evening'}
                      </span>
                      <WindowStatus w={w} />
                    </div>
                    <div className="muted" style={{ fontSize: 10.5 }}>
                      {w.booked} order{w.booked === 1 ? '' : 's'} so far
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Inline HH:MM cut-off editor. Local draft state so a half-typed time never PATCHes; commits on
 * blur or Enter, only when the value is a valid, changed time. */
function CutoffField({ label, icon, value, onCommit }) {
  const [draft, setDraft] = useState(value || '');
  useEffect(() => setDraft(value || ''), [value]);
  return (
    <div>
      <div className="muted" style={{ fontSize: 10.5, marginBottom: 3 }}>
        {icon} {label}
      </div>
      <input
        className="field__input cutoff-time-input"
        style={{
          padding: '7px 10px',
          width: '100%',
          minWidth: 118,
          fontFamily: 'var(--font-mono)',
          fontSize: 13.5,
          letterSpacing: 0.2,
          borderRadius: 10,
        }}
        type="time"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </div>
  );
}

/** Create a new serviceable community — appears in the app's /communities immediately. */
function CommunityForm({ onClose, onSaved }) {
  const [f, setF] = useState({
    name: '',
    area: '',
    blocks: '',
    morningCutoff: '03:45',
    eveningCutoff: '15:00',
    // Start a new community delivering every day (admin deselects the days it doesn't serve),
    // so it has full windows immediately instead of only Tue/Thu/Sat.
    deliveryDays: [0, 1, 2, 3, 4, 5, 6],
  });
  const [saving, setSaving] = useState(false);
  const toggle = (i) =>
    setF((s) => ({
      ...s,
      deliveryDays: s.deliveryDays.includes(i)
        ? s.deliveryDays.filter((d) => d !== i)
        : [...s.deliveryDays, i].sort((a, b) => a - b),
    }));

  async function save() {
    const blocks = f.blocks
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean);
    if (!f.name.trim() || !f.area.trim()) return toast('Name and area are required.', 'err');
    if (blocks.length === 0) return toast('Add at least one block/tower.', 'err');
    if (f.deliveryDays.length === 0) return toast('Pick at least one delivery day.', 'err');
    setSaving(true);
    try {
      const { community } = await api.post('/admin/communities', {
        name: f.name.trim(),
        area: f.area.trim(),
        blocks,
        morningCutoff: f.morningCutoff,
        eveningCutoff: f.eveningCutoff,
        deliveryDays: f.deliveryDays,
      });
      toast(`${community.name} added — live in the app`);
      onSaved(community);
    } catch (e) {
      toast(e.message || 'Could not create', 'err');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      title="New community"
      subtitle="Becomes serviceable in the app right away"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={save} disabled={saving}>
            {saving ? 'Adding…' : 'Add community'}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field__label">Name</label>
        <input
          className="field__input"
          value={f.name}
          onChange={(e) => setF((s) => ({ ...s, name: noLead(e.target.value) }))}
          placeholder="Aparna Sarovar"
          maxLength={60}
        />
      </div>
      <div className="field">
        <label className="field__label">Area</label>
        <input
          className="field__input"
          value={f.area}
          onChange={(e) => setF((s) => ({ ...s, area: noLead(e.target.value) }))}
          placeholder="Nallagandla"
          maxLength={60}
        />
      </div>
      <div className="field">
        <label className="field__label">Blocks / towers (comma-separated)</label>
        <input
          className="field__input"
          value={f.blocks}
          onChange={(e) => setF((s) => ({ ...s, blocks: noLead(e.target.value) }))}
          placeholder="Tower A, Tower B, Tower C"
          maxLength={200}
        />
        <p className="field__hint">Residents pick their block when adding an address in the app.</p>
      </div>
      <div className="field">
        <label className="field__label">Delivery days</label>
        <div className="hstack" style={{ gap: 5 }}>
          {DAYS.map((d, i) => (
            <button
              key={i}
              type="button"
              className="daypill"
              title={DAYNAME[i]}
              onClick={() => toggle(i)}
              style={{
                background: f.deliveryDays.includes(i) ? 'var(--leaf)' : 'rgba(14,27,20,0.05)',
                color: f.deliveryDays.includes(i) ? '#fff' : 'var(--ink-3)',
              }}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      <div className="field__row">
        <div className="field">
          <label className="field__label">Morning window closes</label>
          <input
            className="field__input"
            type="time"
            value={f.morningCutoff}
            onChange={(e) => setF((s) => ({ ...s, morningCutoff: e.target.value }))}
          />
        </div>
        <div className="field">
          <label className="field__label">Evening window closes</label>
          <input
            className="field__input"
            type="time"
            value={f.eveningCutoff}
            onChange={(e) => setF((s) => ({ ...s, eveningCutoff: e.target.value }))}
          />
        </div>
      </div>
      <p className="field__hint">
        Orders for each window stop being accepted at this time on the delivery day itself — no
        booking limit, only the clock. Customers see a live countdown in the last 15 minutes.
      </p>
    </Drawer>
  );
}
