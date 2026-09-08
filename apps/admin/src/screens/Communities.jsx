/**
 * Communities & delivery windows. Left: the serviceable communities with capacity, delivery days,
 * and blocks. Right: the selected community's live 14-day window schedule with capacity fill.
 * Editing capacity PATCHes /admin/communities/:id and the schedule refetches.
 */
import { useEffect, useMemo, useState } from 'react';
import { useResource, toast } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { Drawer, ErrorNote } from '../components/ui.jsx';
import { IconMap, IconPlus } from '../components/icons.jsx';
import { shortDate } from '../lib/format.js';

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

  async function setCapacity(c, delta) {
    const windowCapacity = Math.max(5, c.windowCapacity + delta);
    try {
      await api.patch(`/admin/communities/${c.id}`, { windowCapacity });
      toast(`${c.name} capacity → ${windowCapacity}`);
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
          <p className="page-sub">{communities.length} serviceable · capacity and delivery days</p>
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
        <div className="grid-2--even" style={{ gridTemplateColumns: '1fr 1.1fr' }}>
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
                  <span className="spacer" />
                  <div className="hstack" style={{ gap: 8 }} onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn--ghost btn--icon" onClick={() => setCapacity(c, -5)}>
                      –
                    </button>
                    <div style={{ textAlign: 'center', minWidth: 54 }}>
                      <div
                        style={{ fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: 18 }}
                      >
                        {c.windowCapacity}
                      </div>
                      <div className="muted" style={{ fontSize: 10 }}>
                        per window
                      </div>
                    </div>
                    <button className="btn btn--ghost btn--icon" onClick={() => setCapacity(c, 5)}>
                      +
                    </button>
                  </div>
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
          capacity fill
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
                {ws.map((w) => {
                  const fill = Math.round((w.booked / w.capacity) * 100);
                  const tone =
                    fill >= 90 ? 'var(--tomato)' : fill >= 65 ? 'var(--amber)' : 'var(--leaf)';
                  return (
                    <div
                      key={w.id}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        borderRadius: 12,
                        background: 'rgba(255,255,255,0.6)',
                        border: '1px solid var(--hairline)',
                      }}
                    >
                      <div
                        className="hstack"
                        style={{ justifyContent: 'space-between', marginBottom: 8 }}
                      >
                        <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em' }}>
                          {w.window === 'MORNING' ? '🌅 Morning' : '🌇 Evening'}
                        </span>
                        <span className="mono" style={{ fontSize: 11, color: tone }}>
                          {w.remaining} left
                        </span>
                      </div>
                      <div
                        style={{
                          height: 7,
                          borderRadius: 7,
                          background: 'rgba(14,27,20,0.06)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${fill}%`,
                            background: tone,
                            borderRadius: 7,
                            transition: 'width 0.6s var(--ease-out)',
                          }}
                        />
                      </div>
                      <div className="muted" style={{ fontSize: 10.5, marginTop: 5 }}>
                        {w.booked}/{w.capacity} booked{!w.isOpen ? ' · closed' : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Create a new serviceable community — appears in the app's /communities immediately. */
function CommunityForm({ onClose, onSaved }) {
  const [f, setF] = useState({
    name: '',
    area: '',
    blocks: '',
    windowCapacity: 40,
    deliveryDays: [2, 4, 6],
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
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
        windowCapacity: Number(f.windowCapacity),
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
          onChange={set('name')}
          placeholder="Aparna Sarovar"
        />
      </div>
      <div className="field">
        <label className="field__label">Area</label>
        <input
          className="field__input"
          value={f.area}
          onChange={set('area')}
          placeholder="Nallagandla"
        />
      </div>
      <div className="field">
        <label className="field__label">Blocks / towers (comma-separated)</label>
        <input
          className="field__input"
          value={f.blocks}
          onChange={set('blocks')}
          placeholder="Tower A, Tower B, Tower C"
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
        <label className="field__label">Capacity per window</label>
        <input
          className="field__input"
          type="number"
          min="5"
          value={f.windowCapacity}
          onChange={set('windowCapacity')}
        />
      </div>
    </Drawer>
  );
}
