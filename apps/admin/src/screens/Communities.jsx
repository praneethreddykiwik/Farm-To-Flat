/**
 * Communities & delivery windows. Left: the serviceable communities with delivery days and the
 * windows they run. Right: the selected community's live 14-day schedule, each window showing
 * whether it's open and a live countdown to its cut-off.
 *
 * WINDOWS ARE EDITABLE. A community is no longer stuck with morning + evening: add an afternoon
 * run, rename what customers see, re-time a delivery band, or drop a window entirely. The editor
 * holds a DRAFT of the whole list and PATCHes it in one write, because half-applying a list edit
 * (window added, removal not yet saved) is the state that would let a customer order into a window
 * nobody is staffing.
 *
 * A window's `key` is its identity and never changes — it is stamped on every order placed into it,
 * so renaming "Evening" to "Sundown" must not orphan them. Only new windows get a key, derived
 * server-side from the label. Removing a window stops it being offered; past orders keep reading.
 *
 * There is no capacity/booking-count limit — a window only closes when its cut-off clock time
 * passes for that delivery date.
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
          <p className="page-sub">{communities.length} serviceable · delivery days and windows</p>
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

                <div style={{ marginTop: 14 }} onClick={(e) => e.stopPropagation()}>
                  <WindowEditor community={c} onSaved={reload} />
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
              <div className="hstack" style={{ gap: 10, flexWrap: 'wrap' }}>
                {ws.map((w) => (
                  <div
                    key={w.id}
                    style={{
                      flex: '1 1 180px',
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
                        {windowEmoji(w.start)} {w.label || w.window}
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

/** An emoji for a window, from when it actually starts — so a 14:00 run doesn't get a sunrise. */
export function windowEmoji(start) {
  const h = Number(String(start || '06:00').slice(0, 2));
  if (h < 11) return '🌅';
  if (h < 16) return '☀️';
  if (h < 19) return '🌇';
  return '🌙';
}

const CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** "06:00" → 360, for ordering a window's three clock times against each other. */
const mins = (t) =>
  CLOCK_RE.test(t || '') ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : NaN;

/**
 * What is wrong with this window, in a sentence the operator can act on — or null.
 *
 * Ordering MUST close before the van sets off. A 06:00–12:00 run set to close at 17:17 stayed open
 * all day, long after the delivery had already happened, and orders were accepted against it. The
 * server refuses it now too; this catches it at the keyboard instead of as a failed save.
 */
function windowProblem(w) {
  if (!w.label?.trim()) return 'Give this window a name.';
  if ([w.start, w.end, w.cutoff].some((t) => !CLOCK_RE.test(t || '')))
    return 'Fill in all three times.';
  if (mins(w.end) <= mins(w.start)) return 'This window ends before it starts.';
  if (mins(w.cutoff) >= mins(w.start)) return 'Orders must close before the window begins.';
  return null;
}
const DEFAULT_NEW_WINDOW = { label: 'Afternoon', cutoff: '09:30', start: '14:00', end: '17:00' };

/**
 * Add / edit / re-time / remove a community's delivery windows.
 *
 * Edits accumulate in a local draft and save as ONE PATCH of the whole list. That is deliberate:
 * per-row saving would let "evening removed" land while "afternoon added" failed, leaving a
 * community advertising a window nobody is staffing. Save is disabled until the draft is both
 * different and valid, so the operator cannot write a half-finished list either.
 */
function WindowEditor({ community, onSaved }) {
  const saved = useMemo(() => community.windows || [], [community.windows]);
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  // Re-sync when the community reloads (someone else edited it, or our own save came back).
  useEffect(() => setDraft(saved), [saved]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const problems = draft.map(windowProblem);
  const invalid = draft.length === 0 || problems.some(Boolean);

  const edit = (i, patch) => setDraft((d) => d.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  const remove = (i) => setDraft((d) => d.filter((_, j) => j !== i));
  const add = () => setDraft((d) => [...d, { ...DEFAULT_NEW_WINDOW }]);

  async function save() {
    setSaving(true);
    try {
      // Sent whole. `key` rides along on existing rows so the server keeps them; new rows have
      // none and the server derives one from the label.
      await api.patch(`/admin/communities/${community.id}`, { windows: draft });
      toast(`${community.name} · ${draft.length} window${draft.length === 1 ? '' : 's'} saved`);
      onSaved();
    } catch (e) {
      toast(e.message || 'Could not save windows', 'err');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="vstack" style={{ gap: 8 }}>
      <div className="muted" style={{ fontSize: 10.5, letterSpacing: '0.04em' }}>
        DELIVERY WINDOWS
      </div>
      {draft.map((w, i) => (
        <div key={w.key || `new-${i}`} className="vstack" style={WINDOW_ROW}>
          {/* Name on its own line: three time inputs beside it squeezed it to "Morn". */}
          <div className="hstack" style={{ gap: 8 }}>
            <span style={{ fontSize: 16 }}>{windowEmoji(w.start)}</span>
            <input
              className="field__input"
              style={{ ...INPUT, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600 }}
              value={w.label || ''}
              maxLength={40}
              placeholder="Afternoon"
              aria-label="Window name"
              onChange={(e) => edit(i, { label: noLead(e.target.value) })}
            />
            <button
              className="btn btn--ghost"
              title={
                draft.length === 1
                  ? 'A community needs at least one window'
                  : `Remove ${w.label || 'this window'}`
              }
              disabled={draft.length === 1}
              onClick={() => remove(i)}
              style={{ padding: '5px 9px' }}
            >
              ✕
            </button>
          </div>
          {problems[i] ? (
            <div style={{ fontSize: 12, color: 'var(--tomato)', marginTop: -2 }}>{problems[i]}</div>
          ) : null}
          <div className="hstack" style={{ gap: 10, alignItems: 'flex-end' }}>
            <WinField label="Delivers" grow>
              <div className="hstack" style={{ gap: 4 }}>
                <input
                  className="field__input cutoff-time-input"
                  style={INPUT}
                  type="time"
                  aria-label="Delivery starts"
                  value={w.start || ''}
                  onChange={(e) => edit(i, { start: e.target.value })}
                />
                <input
                  className="field__input cutoff-time-input"
                  style={INPUT}
                  type="time"
                  aria-label="Delivery ends"
                  value={w.end || ''}
                  onChange={(e) => edit(i, { end: e.target.value })}
                />
              </div>
            </WinField>
            <WinField label="Orders close" grow>
              <input
                className="field__input cutoff-time-input"
                style={INPUT}
                type="time"
                aria-label="Orders close at"
                value={w.cutoff || ''}
                onChange={(e) => edit(i, { cutoff: e.target.value })}
              />
            </WinField>
          </div>
        </div>
      ))}
      <div className="hstack" style={{ gap: 8 }}>
        <button
          className="btn btn--ghost"
          onClick={add}
          disabled={draft.length >= 6}
          title={draft.length >= 6 ? 'Six windows a day is already a lot to staff' : 'Add a window'}
          style={{ padding: '6px 11px', fontSize: 12.5 }}
        >
          <IconPlus size={15} /> Add window
        </button>
        {dirty && (
          <>
            <button
              className="btn btn--primary"
              onClick={save}
              disabled={saving || invalid}
              title={invalid ? problems.find(Boolean) || 'Fix the windows first' : 'Save'}
              style={{ padding: '6px 13px', fontSize: 12.5 }}
            >
              {saving ? 'Saving…' : 'Save windows'}
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => setDraft(saved)}
              style={{ padding: '6px 11px', fontSize: 12.5 }}
            >
              Discard
            </button>
          </>
        )}
      </div>
      <p className="field__hint" style={{ margin: 0 }}>
        Orders for a window stop at its close time on the delivery day itself — no booking limit,
        only the clock. Renaming a window keeps its past orders; removing one stops it being
        offered.
      </p>
    </div>
  );
}

const WINDOW_ROW = {
  gap: 8,
  padding: '10px 11px',
  borderRadius: 12,
  background: 'rgba(255,255,255,0.55)',
  border: '1px solid var(--hairline)',
};

const INPUT = {
  padding: '6px 9px',
  fontFamily: 'var(--font-mono)',
  fontSize: 12.5,
  borderRadius: 9,
  minWidth: 0,
  width: '100%',
};

function WinField({ label, grow, children }) {
  return (
    <div style={{ flex: grow ? 1 : '0 0 auto', minWidth: 0 }}>
      <div className="muted" style={{ fontSize: 10, marginBottom: 3 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

/** Create a new serviceable community — appears in the app's /communities immediately. */
function CommunityForm({ onClose, onSaved }) {
  const [f, setF] = useState({
    name: '',
    area: '',
    blocks: '',
    // Seeded with the pair almost every community runs; the operator adds, renames or removes
    // before saving, exactly as they would afterwards.
    windows: [
      { label: 'Morning', cutoff: '03:45', start: '06:00', end: '12:00' },
      { label: 'Evening', cutoff: '15:00', start: '17:00', end: '21:00' },
    ],
    // Start a new community delivering every day (admin deselects the days it doesn't serve),
    // so it has full windows immediately instead of only Tue/Thu/Sat.
    deliveryDays: [0, 1, 2, 3, 4, 5, 6],
  });
  const [saving, setSaving] = useState(false);
  const setWindow = (i, patch) =>
    setF((s) => ({ ...s, windows: s.windows.map((w, j) => (j === i ? { ...w, ...patch } : w)) }));
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
    if (f.windows.length === 0) return toast('Add at least one delivery window.', 'err');
    if (f.windows.some((w) => !w.label.trim()))
      return toast('Every delivery window needs a name.', 'err');
    setSaving(true);
    try {
      const { community } = await api.post('/admin/communities', {
        name: f.name.trim(),
        area: f.area.trim(),
        blocks,
        windows: f.windows,
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
      <div className="field">
        <label className="field__label">Delivery windows</label>
        <div className="vstack" style={{ gap: 8 }}>
          {f.windows.map((w, i) => (
            <div key={i} className="vstack" style={WINDOW_ROW}>
              <div className="hstack" style={{ gap: 8 }}>
                <span style={{ fontSize: 16 }}>{windowEmoji(w.start)}</span>
                <input
                  className="field__input"
                  style={{ ...INPUT, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600 }}
                  value={w.label}
                  maxLength={40}
                  aria-label="Window name"
                  onChange={(e) => setWindow(i, { label: noLead(e.target.value) })}
                />
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={f.windows.length === 1}
                  title={
                    f.windows.length === 1
                      ? 'A community needs at least one window'
                      : 'Remove window'
                  }
                  onClick={() =>
                    setF((s) => ({ ...s, windows: s.windows.filter((_, j) => j !== i) }))
                  }
                  style={{ padding: '5px 9px' }}
                >
                  ✕
                </button>
              </div>
              <div className="hstack" style={{ gap: 10, alignItems: 'flex-end' }}>
                <WinField label="Delivers" grow>
                  <div className="hstack" style={{ gap: 4 }}>
                    <input
                      className="field__input"
                      style={INPUT}
                      type="time"
                      aria-label="Delivery starts"
                      value={w.start}
                      onChange={(e) => setWindow(i, { start: e.target.value })}
                    />
                    <input
                      className="field__input"
                      style={INPUT}
                      type="time"
                      aria-label="Delivery ends"
                      value={w.end}
                      onChange={(e) => setWindow(i, { end: e.target.value })}
                    />
                  </div>
                </WinField>
                <WinField label="Orders close" grow>
                  <input
                    className="field__input"
                    style={INPUT}
                    type="time"
                    aria-label="Orders close at"
                    value={w.cutoff}
                    onChange={(e) => setWindow(i, { cutoff: e.target.value })}
                  />
                </WinField>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="btn btn--ghost"
            disabled={f.windows.length >= 6}
            onClick={() =>
              setF((s) => ({ ...s, windows: [...s.windows, { ...DEFAULT_NEW_WINDOW }] }))
            }
            style={{ padding: '6px 11px', fontSize: 12.5, alignSelf: 'flex-start' }}
          >
            <IconPlus size={15} /> Add window
          </button>
        </div>
        <p className="field__hint">
          Orders for a window stop at its close time on the delivery day itself — no booking limit,
          only the clock. Add as many runs a day as you can staff.
        </p>
      </div>
    </Drawer>
  );
}
