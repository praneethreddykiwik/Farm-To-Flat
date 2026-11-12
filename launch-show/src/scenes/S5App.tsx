import React from 'react';
import { interpolate } from 'remotion';
import { C, EMBER, F, fraunces } from '../brand';
import { S4, S5 as COPY } from '../copy';
import { E, bez, mix, ramp, useT, wave } from '../lib/anim';
import { Stage } from '../components/Stage';
import { Words } from '../components/Words';
import { LeafMark, Wordmark } from '../components/Logo';
import { PhoneFrame, SCREEN_H, SCREEN_W, Tap } from '../components/Phone';
import { Beetroot, Carrot, Gongura, Ponnaganti, Tomato } from '../components/Produce';

export const S5_INTRO = 30;
export const S5_LOOP = 4;

// beat boundaries (seconds)
const BEAT = [0, 5.5, 11.5, 18.5, 24.5, 999];
const T_HOME = 2.5;
const T_ADD1 = 6.5;
const T_ADD2 = 8.3;
const T_OPEN = 11.9;
const T_PRODUCT = 12.2;
const T_TAB2 = 14.2;
const T_TAB3 = 16.0;
const T_TRACK = 18.7;
const T_PLAN = 24.7;
const T_STAMP = 25.7;

const ink = C.ink;
const body = (size: number, weight = 400, color: string = ink): React.CSSProperties => ({
  fontFamily: F.body,
  fontWeight: weight,
  fontSize: size,
  color,
  lineHeight: 1.25,
});
const display = (size: number, color: string = ink): React.CSSProperties => ({
  ...fraunces(620),
  fontSize: size,
  color,
  letterSpacing: '-0.02em',
  lineHeight: 1.15,
});
const eyebrow = (color: string = C.leaf): React.CSSProperties => ({
  fontFamily: F.body,
  fontWeight: 600,
  fontSize: 10.5,
  letterSpacing: '0.1em',
  color,
});
const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.82)',
  border: '1px solid rgba(255,255,255,0.9)',
  boxShadow: '0 8px 24px rgba(14,27,20,0.08)',
};

// ───────────────────────────── screens ─────────────────────────────

const Splash: React.FC = () => {
  const { t } = useT();
  return (
    <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(160deg, ${C.leaf} 0%, #135A37 60%, #0B1510 130%)`, display: 'grid', placeItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: -30 }}>
        <div style={{ filter: 'drop-shadow(0 10px 24px rgba(0,0,0,0.35))' }}>
          <LeafMark size={190} p={[ramp(t, 0.7, 0.7, E.back), ramp(t, 0.85, 0.7, E.back), ramp(t, 1.0, 0.7, E.back)]} />
        </div>
        <Wordmark width={210} ink={C.cream} p={(i) => ramp(t, 1.25 + i * 0.06, 0.5, E.back)} style={{ marginTop: -6 }} />
      </div>
    </div>
  );
};

const RAIL = [
  { key: 'ponnaganti', name: 'Ponnaganti kura', alias: 'ponnaganti · Shamshabad', price: '₹20', unit: '/bunch', tint: '#BFE9D0', Art: Ponnaganti },
  { key: 'gongura', name: 'Gongura', alias: 'sorrel leaves · Chevella', price: '₹30', unit: '/bunch', tint: '#F4E9B7', Art: Gongura },
  { key: 'beetroot', name: 'Beetroot', alias: 'chukandar', price: '₹40', unit: '/kg', tint: '#F6D5C8', Art: Beetroot },
];
const CARD_X = [20, 188, 356];
const RAIL_Y = 400;

const Home: React.FC = () => {
  const { t } = useT();
  const inn = (i: number) => ramp(t, T_HOME + 0.25 + i * 0.12, 0.7, E.out);
  const rise = (i: number): React.CSSProperties => ({ opacity: inn(i), transform: `translateY(${(1 - inn(i)) * 22}px)` });
  const added = [t >= T_ADD1 + 0.15, t >= T_ADD2 + 0.15];
  const count = added[1] ? 2 : added[0] ? 1 : 0;
  const cartUp = ramp(t, T_ADD1 + 0.45, 0.6, E.back);
  const bump = 1 + 0.12 * Math.sin(Math.min(1, ramp(t, T_ADD2 + 0.55, 0.4, E.linear)) * Math.PI);

  return (
    <div style={{ position: 'absolute', inset: 0, background: C.cream }}>
      {/* ambient blobs, as in the app */}
      <div style={{ position: 'absolute', left: -80, top: -60, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(191,233,208,0.9), rgba(191,233,208,0))' }} />
      <div style={{ position: 'absolute', right: -110, top: 240, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(244,233,183,0.8), rgba(244,233,183,0))' }} />

      {/* header */}
      <div style={{ position: 'absolute', left: 20, right: 20, top: 60, display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...rise(0) }}>
        <div>
          <div style={display(26)}>Good evening</div>
          <div style={{ ...body(12.5, 500, C.ink3), marginTop: 2 }}>Block C · Your community ▾</div>
        </div>
        <div style={{ width: 42, height: 42, borderRadius: 21, background: C.leaf, display: 'grid', placeItems: 'center', ...body(17, 600, '#fff') }}>F</div>
      </div>

      {/* search */}
      <div style={{ position: 'absolute', left: 20, right: 20, top: 126, height: 48, borderRadius: 24, ...glass, display: 'flex', alignItems: 'center', padding: '0 18px', gap: 10, ...rise(1) }}>
        <svg width="18" height="18" viewBox="0 0 18 18">
          <circle cx="8" cy="8" r="5.5" fill="none" stroke={C.ink3} strokeWidth="2" />
          <path d="M12.5,12.5 L16,16" stroke={C.ink3} strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span style={body(14.5, 400, C.ink3)}>Search gongura, tomato, palakura…</span>
      </div>

      {/* harvest banner */}
      <div style={{ position: 'absolute', left: 20, right: 20, top: 192, height: 132, borderRadius: 28, background: `linear-gradient(135deg, ${C.leaf} 0%, #135A37 100%)`, padding: '20px 22px', overflow: 'hidden', ...rise(2) }}>
        <div style={eyebrow(C.sprout)}>TOMORROW’S HARVEST</div>
        <div style={{ ...display(23, '#fff'), marginTop: 6 }}>Order by 9 PM tonight</div>
        <div style={{ ...body(12.5, 500, 'rgba(255,255,255,0.82)'), marginTop: 6 }}>Picked at dawn · at your door by morning</div>
        <div style={{ position: 'absolute', right: -14, top: 26, width: 86, height: 86, borderRadius: '50%', background: EMBER, boxShadow: '0 0 30px rgba(250,188,21,0.6)', transform: `scale(${1 + wave(t, 4) * 0.04})` }} />
      </div>

      {/* in season now */}
      <div style={{ position: 'absolute', left: 20, right: 20, top: 344, display: 'flex', alignItems: 'center', ...rise(3) }}>
        <div style={{ flex: 1 }}>
          <div style={eyebrow()}>PEAK SEASON</div>
          <div style={{ ...display(20), marginTop: 2 }}>In season now</div>
        </div>
        <div style={{ minWidth: 26, height: 26, borderRadius: 13, background: '#DDF0E4', display: 'grid', placeItems: 'center', ...body(13, 600, '#135A37') }}>3</div>
      </div>
      {RAIL.map((p, i) => {
        const isAdded = i < 2 && added[i];
        const pop = i < 2 ? 1 + 0.25 * Math.sin(Math.min(1, ramp(t, (i === 0 ? T_ADD1 : T_ADD2) + 0.1, 0.4, E.linear)) * Math.PI) : 1;
        return (
          <div key={p.key} style={{ position: 'absolute', left: CARD_X[i], top: RAIL_Y, width: 156, height: 234, borderRadius: 24, padding: 10, ...glass, ...rise(4 + i) }}>
            <div style={{ height: 118, borderRadius: 16, background: `radial-gradient(circle at 50% 40%, #fff, ${p.tint} 80%)`, display: 'grid', placeItems: 'center' }}>
              <p.Art size={96} />
            </div>
            <div style={{ ...body(15, 500), marginTop: 9, whiteSpace: 'nowrap' }}>{p.name}</div>
            <div style={{ ...body(11.5, 400, C.ink3), marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>{p.alias}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
              <div>
                <span style={body(16, 600)}>{p.price}</span>
                <span style={body(11.5, 400, C.ink3)}> {p.unit}</span>
              </div>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  background: isAdded ? C.sprout : C.leaf,
                  color: isAdded ? ink : '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  ...body(isAdded ? 15 : 21, 600, isAdded ? ink : '#fff'),
                  transform: `scale(${pop})`,
                }}
              >
                {isAdded ? '1' : '+'}
              </div>
            </div>
          </div>
        );
      })}

      {/* today's catalog */}
      <div style={{ position: 'absolute', left: 20, right: 20, top: 654, ...rise(7) }}>
        <div style={eyebrow()}>FROM THE FIELD</div>
        <div style={{ ...display(20), marginTop: 2 }}>Today’s catalog</div>
      </div>
      {[
        { Art: Tomato, tint: '#F6D5C8', x: 20 },
        { Art: Carrot, tint: '#F4E9B7', x: 203 },
      ].map((g, i) => (
        <div key={i} style={{ position: 'absolute', left: g.x, top: 712, width: 167, height: 200, borderRadius: 24, padding: 10, ...glass, ...rise(8) }}>
          <div style={{ height: 112, borderRadius: 16, background: `radial-gradient(circle at 50% 40%, #fff, ${g.tint} 80%)`, display: 'grid', placeItems: 'center' }}>
            <g.Art size={86} />
          </div>
        </div>
      ))}

      {/* the item that flies into the basket */}
      {[0, 1].map((i) => {
        const at = (i === 0 ? T_ADD1 : T_ADD2) + 0.12;
        const p = ramp(t, at, 0.62, E.inOut);
        if (p <= 0 || p >= 1) return null;
        const from: [number, number] = [CARD_X[i] + 78, RAIL_Y + 70];
        const to: [number, number] = [62, 792];
        const [x, y] = bez(p, from, [from[0] + 40, from[1] - 120], [to[0] + 80, to[1] - 200], to);
        const A = RAIL[i].Art;
        return (
          <div key={i} style={{ position: 'absolute', left: x - 40, top: y - 40, transform: `scale(${mix(1, 0.35, p)}) rotate(${p * 40}deg)`, opacity: p > 0.92 ? (1 - p) * 12 : 1 }}>
            <A size={80} />
          </div>
        );
      })}

      {/* basket bar */}
      <div
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          top: 762,
          height: 62,
          borderRadius: 31,
          background: 'rgba(14,27,20,0.94)',
          boxShadow: '0 16px 36px rgba(14,27,20,0.35)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px 0 12px',
          gap: 12,
          transform: `translateY(${(1 - cartUp) * 120}px) scale(${bump})`,
        }}
      >
        <div style={{ width: 40, height: 40, borderRadius: 20, background: C.sprout, display: 'grid', placeItems: 'center', ...body(17, 700) }}>{count || 1}</div>
        <div style={{ flex: 1 }}>
          <div style={body(15, 600, '#fff')}>{count > 1 ? '2 items' : '1 item'}</div>
          <div style={body(11.5, 400, 'rgba(255,255,255,0.65)')}>₹{count > 1 ? 450 : 480} to free delivery</div>
        </div>
        <div style={{ height: 42, padding: '0 16px', borderRadius: 21, background: C.leaf, display: 'flex', alignItems: 'center', ...body(14.5, 600, '#fff') }}>₹{count > 1 ? 50 : 20} · Basket →</div>
      </div>

      <Tap x={CARD_X[0] + 129} y={RAIL_Y + 207} at={T_ADD1 - 0.12} />
      <Tap x={CARD_X[1] + 129} y={RAIL_Y + 207} at={T_ADD2 - 0.12} />
      <Tap x={CARD_X[0] + 78} y={RAIL_Y + 70} at={T_OPEN} />
    </div>
  );
};

const Product: React.FC = () => {
  const { t } = useT();
  const item = S4.items[0];
  const tab = t < T_TAB2 ? 0 : t < T_TAB3 ? 1 : 2;
  const tabX = interpolate(t, [T_TAB2, T_TAB2 + 0.4, T_TAB3, T_TAB3 + 0.4], [0, 1, 1, 2], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: E.inOut });
  const since = t - (tab === 0 ? T_PRODUCT + 0.7 : tab === 1 ? T_TAB2 + 0.15 : T_TAB3 + 0.15);
  const cin = ramp(since, 0, 0.5, E.out);
  const TAB_W = (SCREEN_W - 40 - 8) / 3;
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.cream }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 350, background: 'radial-gradient(circle at 50% 48%, #FFFFFF 0%, #BFE9D0 78%)', display: 'grid', placeItems: 'center' }}>
        <div style={{ marginTop: 40, transform: `scale(${0.8 + 0.2 * ramp(t, T_PRODUCT + 0.2, 0.8, E.back)}) rotate(${wave(t, 4) * 2}deg)` }}>
          <Ponnaganti size={230} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: 20, top: 58, width: 40, height: 40, borderRadius: 20, ...glass, display: 'grid', placeItems: 'center', ...body(20, 500) }}>‹</div>

      <div style={{ position: 'absolute', left: 0, right: 0, top: 318, bottom: 0, borderRadius: '32px 32px 0 0', background: C.cream, padding: '24px 20px 0' }}>
        <div style={display(30)}>{item.name}</div>
        <div style={{ fontFamily: F.telugu, fontWeight: 600, fontSize: 21, color: C.leaf, marginTop: 2 }}>{item.telugu}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <span style={body(22, 600)}>₹20</span>
          <span style={body(13, 400, C.ink3)}>/bunch</span>
          <span style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 999, background: '#DDF0E4', ...body(12, 600, '#135A37') }}>Harvested at dawn</span>
        </div>

        {/* the three things every item carries */}
        <div style={{ position: 'relative', height: 46, borderRadius: 23, background: '#E7ECE2', marginTop: 20, padding: 4, display: 'flex' }}>
          <div style={{ position: 'absolute', left: 4 + tabX * TAB_W, top: 4, width: TAB_W, height: 38, borderRadius: 19, background: '#fff', boxShadow: '0 4px 12px rgba(14,27,20,0.12)' }} />
          {['Good to know', 'Story', 'Recipe'].map((label, i) => (
            <div key={label} style={{ position: 'relative', width: TAB_W, display: 'grid', placeItems: 'center', ...body(13.5, 600, tab === i ? ink : C.ink3) }}>
              {label}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, opacity: cin, transform: `translateY(${(1 - cin) * 14}px)`, height: 190 }}>
          {tab === 0 ? (
            <div>
              <div style={eyebrow()}>NATURALLY HAS</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {item.has.map((h, i) => (
                  <div key={h} style={{ padding: '10px 16px', borderRadius: 14, background: C.sprout, ...body(16, 700), transform: `scale(${ramp(since, 0.1 + i * 0.12, 0.4, E.back)})` }}>
                    {h}
                  </div>
                ))}
              </div>
              <div style={{ ...body(13.5, 400, C.ink2), marginTop: 14 }}>A tender leafy green, best cooked the day it is cut.</div>
            </div>
          ) : tab === 1 ? (
            <div>
              <div style={eyebrow()}>ITS STORY</div>
              <div style={{ ...fraunces(480), fontStyle: 'italic', fontSize: 22, lineHeight: 1.3, color: ink, marginTop: 10 }}>{item.story}</div>
              <div style={{ ...body(13, 400, C.ink3), marginTop: 12 }}>Grown this week in the Shamshabad belt.</div>
            </div>
          ) : (
            <div>
              <div style={eyebrow()}>COOK IT TONIGHT</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <div style={display(24)}>{item.recipe}</div>
                <div style={{ padding: '4px 10px', borderRadius: 999, border: `1.5px solid ${C.emberB}`, ...body(12, 600, C.emberB) }}>{item.mins}</div>
              </div>
              {['Wash and chop the leaves', 'Simmer with toor dal', 'Temper, and serve with rice'].map((s, i) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, opacity: ramp(since, 0.15 + i * 0.15, 0.4) }}>
                  <div style={{ width: 24, height: 24, borderRadius: 12, background: '#DDF0E4', display: 'grid', placeItems: 'center', ...body(12, 700, '#135A37') }}>{i + 1}</div>
                  <div style={body(14, 500, C.ink2)}>{s}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ position: 'absolute', left: 20, right: 20, top: 762, height: 58, borderRadius: 29, background: C.leaf, display: 'grid', placeItems: 'center', ...body(16, 600, '#fff'), boxShadow: '0 14px 30px rgba(30,122,76,0.35)' }}>Add to basket · ₹20</div>

      <Tap x={20 + 4 + TAB_W * 1.5} y={318 + 24 + 134 + 23} at={T_TAB2 - 0.1} />
      <Tap x={20 + 4 + TAB_W * 2.5} y={318 + 24 + 134 + 23} at={T_TAB3 - 0.1} />
    </div>
  );
};

const STEPS = [
  { title: 'Order placed', sub: 'Last night · 8:42 PM' },
  { title: 'Harvested', sub: 'This morning · 5:12 AM · Shamshabad' },
  { title: 'Packed', sub: '5:50 AM' },
  { title: 'On the way', sub: '2 stops away' },
  { title: 'At your door', sub: 'By 6:40 AM' },
];

const Track: React.FC = () => {
  const { t } = useT();
  const go = ramp(t, T_TRACK + 0.8, 4.6, E.inOut) * 0.74 + 0.02;
  const A: [number, number] = [44, 150];
  const B: [number, number] = [120, 40];
  const Cp: [number, number] = [220, 190];
  const D: [number, number] = [306, 62];
  const [vx, vy] = bez(go, A, B, Cp, D);
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.cream }}>
      <div style={{ position: 'absolute', left: -80, top: -60, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(191,233,208,0.9), rgba(191,233,208,0))' }} />
      <div style={{ position: 'absolute', left: 20, right: 20, top: 62 }}>
        <div style={eyebrow()}>YOUR ORDER</div>
        <div style={{ ...display(27), marginTop: 2 }}>It’s on the way</div>
      </div>

      <div style={{ position: 'absolute', left: 20, right: 20, top: 134, height: 212, borderRadius: 28, ...glass, overflow: 'hidden' }}>
        <svg width="350" height="212" viewBox="0 0 350 212">
          <path d={`M${A.join(',')} C${B.join(',')} ${Cp.join(',')} ${D.join(',')}`} stroke="#C9D8CC" strokeWidth="6" strokeLinecap="round" strokeDasharray="1 13" fill="none" />
          <path d={`M${A.join(',')} C${B.join(',')} ${Cp.join(',')} ${D.join(',')}`} stroke={C.leaf} strokeWidth="6" strokeLinecap="round" fill="none" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - go} />
          {/* farm */}
          <circle cx={A[0]} cy={A[1]} r="15" fill={C.leaf} />
          <path d={`M${A[0]},${A[1] + 6} L${A[0]},${A[1] - 5} M${A[0]},${A[1] - 1} L${A[0] - 6},${A[1] - 7} M${A[0]},${A[1] - 1} L${A[0] + 6},${A[1] - 7}`} stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
          {/* home */}
          <circle cx={D[0]} cy={D[1]} r="15" fill={ink} />
          <path d={`M${D[0] - 7},${D[1] + 6} L${D[0] - 7},${D[1] - 1} L${D[0]},${D[1] - 7} L${D[0] + 7},${D[1] - 1} L${D[0] + 7},${D[1] + 6} Z`} fill="#fff" />
          {/* the bag in transit */}
          <circle cx={vx} cy={vy} r={15 + wave(t, 1) * 2} fill="rgba(250,188,21,0.3)" />
          <circle cx={vx} cy={vy} r="9" fill={C.emberA} stroke="#fff" strokeWidth="3" />
        </svg>
        <div style={{ position: 'absolute', left: 16, bottom: 14, ...body(12, 600, C.ink3) }}>SHAMSHABAD FARM</div>
        <div style={{ position: 'absolute', right: 14, top: 14, padding: '7px 13px', borderRadius: 999, background: ink, ...body(12.5, 600, '#fff'), transform: `scale(${ramp(t, T_TRACK + 2.6, 0.5, E.back)})` }}>2 stops away</div>
      </div>

      <div style={{ position: 'absolute', left: 20, right: 20, top: 368 }}>
        {STEPS.map((s, i) => {
          const done = ramp(t, T_TRACK + 0.9 + i * 0.75, 0.45, E.back);
          const active = i === 3;
          const reached = i <= 3;
          return (
            <div key={s.title} style={{ display: 'flex', gap: 14, height: 76 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 30 }}>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    background: reached ? (active ? C.emberA : C.leaf) : 'transparent',
                    border: reached ? 'none' : `2px solid ${C.ink3}`,
                    display: 'grid',
                    placeItems: 'center',
                    transform: `scale(${reached ? done : 1})`,
                    boxShadow: active ? `0 0 0 ${5 + wave(t, 2) * 3}px rgba(250,188,21,0.25)` : 'none',
                  }}
                >
                  {reached && !active ? (
                    <svg width="14" height="14" viewBox="0 0 14 14">
                      <path d="M2.5,7.5 L5.5,10.5 L11.5,3.5" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </div>
                {i < STEPS.length - 1 ? <div style={{ flex: 1, width: 2.5, background: i < 3 ? C.leaf : '#C9D8CC', opacity: i < 3 ? done : 1, margin: '4px 0' }} /> : null}
              </div>
              <div style={{ opacity: reached ? Math.min(1, done * 1.5) : 0.5 }}>
                <div style={body(16.5, 600)}>{s.title}</div>
                <div style={{ ...body(12.5, 400, C.ink3), marginTop: 2 }}>{s.sub}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Plan: React.FC = () => {
  const { t } = useT();
  const shimmer = (((t % 2) + 2) % 2) / 2; // periodic sweep
  const bar = (w: number | string, h = 12, o = 1): React.CSSProperties => ({ width: w, height: h, borderRadius: h / 2, background: '#D9E2D6', opacity: o });
  const stamp = ramp(t, T_STAMP, 0.7, E.back);
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.cream, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', right: -100, top: -40, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(226,217,243,0.95), rgba(226,217,243,0))' }} />
      <div style={{ position: 'absolute', left: 20, right: 20, top: 62 }}>
        <div style={eyebrow()}>MADE FOR YOU</div>
        <div style={{ ...display(27), marginTop: 2 }}>Your diet plan</div>
      </div>
      <div style={{ position: 'absolute', left: 20, right: 20, top: 134, height: 170, borderRadius: 28, ...glass, padding: 20, display: 'flex', gap: 20, alignItems: 'center' }}>
        <svg width="120" height="120" viewBox="-60 -60 120 120">
          <circle r="46" fill="none" stroke="#E2E9DE" strokeWidth="13" />
          <circle r="46" fill="none" stroke={C.leaf} strokeWidth="13" strokeLinecap="round" strokeDasharray="289" strokeDashoffset={289 * 0.32} transform="rotate(-90)" />
          <circle r="27" fill="none" stroke="#E2E9DE" strokeWidth="11" />
          <circle r="27" fill="none" stroke={C.emberA} strokeWidth="11" strokeLinecap="round" strokeDasharray="170" strokeDashoffset={170 * 0.5} transform="rotate(-90)" />
        </svg>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={bar('80%', 16)} />
          <div style={bar('100%')} />
          <div style={bar('64%')} />
          <div style={bar('46%')} />
        </div>
      </div>
      {['Breakfast', 'Lunch', 'Dinner'].map((m, i) => (
        <div key={m} style={{ position: 'absolute', left: 20, right: 20, top: 324 + i * 122, height: 106, borderRadius: 24, ...glass, padding: 14, display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ width: 78, height: 78, borderRadius: 18, background: ['#F4E9B7', '#BFE9D0', '#F6D5C8'][i] }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={body(15, 600)}>{m}</div>
            <div style={bar('90%')} />
            <div style={bar('55%')} />
          </div>
        </div>
      ))}
      {/* shimmer sweep */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, width: 160, left: -200 + shimmer * 760, background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.55), rgba(255,255,255,0))', transform: 'skewX(-18deg)' }} />
      {/* not yet */}
      <div style={{ position: 'absolute', inset: 0, background: `rgba(14,27,20,${0.5 * ramp(t, T_STAMP - 0.2, 0.6)})` }} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 372,
          display: 'grid',
          placeItems: 'center',
          transform: `scale(${stamp}) rotate(${-7 + wave(t, 4) * 1.2}deg)`,
          opacity: Math.min(1, stamp * 2),
        }}
      >
        <div style={{ padding: '16px 30px', borderRadius: 20, background: C.sprout, border: `3px solid ${ink}`, fontFamily: F.mono, fontWeight: 500, fontSize: 28, letterSpacing: '0.16em', color: ink, boxShadow: '0 20px 50px rgba(0,0,0,0.4)' }}>
          {COPY.comingSoon}
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────── the scene ─────────────────────────────

const KEYS = COPY.captions.map((c) => c.k.toUpperCase());

/** Slide 5 — a quick glimpse of the app itself. One action per beat; the camera goes to the tap. */
export const S5App: React.FC = () => {
  const { t } = useT();
  const beat = BEAT.findIndex((b, i) => t >= b && t < BEAT[i + 1]);

  // camera: zoom to where the action is
  const times = [0, 5.6, 6.4, 11.2, 12.0, 12.7, 13.5, 18.2, 18.9, 19.5, 20.3, 24.2, 25.0];
  const cam = (vals: number[]) => interpolate(t, times, vals, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: E.inOut });
  const zoom = cam([1, 1, 1.4, 1.4, 1, 1, 1.32, 1.32, 1, 1, 1.26, 1.26, 1]);
  const focusY = cam([422, 422, 600, 600, 422, 422, 520, 520, 422, 422, 450, 450, 422]);
  const K = 1.04;
  const enter = ramp(t, 0.15, 1.3, E.out);

  const homeIn = ramp(t, T_HOME, 0.6, E.inOut);
  const productIn = ramp(t, T_PRODUCT, 0.7, E.out);
  const trackIn = ramp(t, T_TRACK, 0.7, E.out);
  const planIn = ramp(t, T_PLAN, 0.7, E.out);

  return (
    <Stage background={`radial-gradient(ellipse 60% 80% at 70% 50%, #114A30 0%, ${C.night} 76%)`} vignette={0.36}>
      {/* light behind the phone */}
      <div
        style={{
          position: 'absolute',
          left: 1330 - 520,
          top: 540 - 520,
          width: 1040,
          height: 1040,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(205,245,106,0.2) 0%, rgba(205,245,106,0) 62%)',
          transform: `scale(${1 + wave(t, 4) * 0.04})`,
        }}
      />

      {/* the phone */}
      <div
        style={{
          position: 'absolute',
          left: 1330,
          top: 540 + (1 - enter) * 900 + wave(t, 4) * 5,
          width: SCREEN_W,
          height: SCREEN_H,
          transformOrigin: '0 0',
          transform: `scale(${zoom * K}) translate(${-SCREEN_W / 2}px, ${-focusY}px) rotate(${(1 - enter) * 7}deg)`,
        }}
      >
        <PhoneFrame>
          {homeIn < 1 ? <Splash /> : null}
          {homeIn > 0 && productIn < 1 ? (
            <div style={{ position: 'absolute', inset: 0, opacity: homeIn }}>
              <Home />
            </div>
          ) : null}
          {productIn > 0 && trackIn < 1 ? (
            <div style={{ position: 'absolute', inset: 0, transform: `translateY(${(1 - productIn) * SCREEN_H}px)` }}>
              <Product />
            </div>
          ) : null}
          {trackIn > 0 && planIn < 1 ? (
            <div style={{ position: 'absolute', inset: 0, transform: `translateX(${(1 - trackIn) * SCREEN_W}px)` }}>
              <Track />
            </div>
          ) : null}
          {planIn > 0 ? (
            <div style={{ position: 'absolute', inset: 0, transform: `translateX(${(1 - planIn) * SCREEN_W}px)` }}>
              <Plan />
            </div>
          ) : null}
        </PhoneFrame>
      </div>

      {/* where we are in the walk-through */}
      <div style={{ position: 'absolute', left: 130, top: 236, display: 'flex', gap: 14, opacity: ramp(t, 0.6, 0.8) }}>
        {KEYS.map((k, i) => {
          const on = i === beat;
          const seen = i < beat;
          return (
            <div
              key={k}
              style={{
                padding: '10px 22px',
                borderRadius: 999,
                fontFamily: F.mono,
                fontWeight: 500,
                fontSize: 26,
                letterSpacing: '0.14em',
                background: on ? C.sprout : 'transparent',
                color: on ? C.ink : seen ? 'rgba(205,245,106,0.75)' : 'rgba(243,245,239,0.35)',
                border: `2px solid ${on ? C.sprout : seen ? 'rgba(205,245,106,0.45)' : 'rgba(243,245,239,0.2)'}`,
              }}
            >
              {k}
            </div>
          );
        })}
      </div>

      {/* the caption for this beat */}
      {COPY.captions.map((c, i) => (
        <div key={c.k} style={{ position: 'absolute', left: 130, top: 350 }}>
          <Words text={c.line} at={BEAT[i] + (i === 0 ? 0.9 : 0.35)} out={i < 4 ? BEAT[i + 1] - 0.3 : undefined} size={116} weight={640} lineHeight={1.08} accent={C.emberA} />
        </div>
      ))}
    </Stage>
  );
};
