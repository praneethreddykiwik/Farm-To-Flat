import React from 'react';
import { C, F, fraunces } from '../brand';
import { S4 as COPY } from '../copy';
import { E, mix, ramp, useT, wave } from '../lib/anim';
import { Stage } from '../components/Stage';
import { Eyebrow, Words } from '../components/Words';
import { PRODUCE, type ProduceKey } from '../components/Produce';

export const S4_INTRO = 20;
// The hold keeps turning through the three vegetables: 4 s each, so 12 s before it repeats.
export const S4_LOOP = 12;

const TINT: Record<string, string> = { ponnaganti: '#BFE9D0', gongura: '#F4E9B7', beetroot: '#F6D5C8' };
const CARD_W = 380;
const CARD_H = 452;
const RAIL_X = [330, 770, 1210];
const RAIL_Y = 548;
const HERO = { x: 130, y: 262, s: 1.3 };

// when the hero card turns to the next vegetable
const TURNS = [
  { at: 4.6, to: 0 },
  { at: 12.6, to: 1 },
  { at: 15.4, to: 2 },
  { at: 20, to: 0 },
  { at: 24, to: 1 },
  { at: 28, to: 2 },
];

const Card: React.FC<{ item: (typeof COPY.items)[number] }> = ({ item }) => {
  const Art = PRODUCE[item.key as ProduceKey];
  return (
    <div
      style={{
        width: CARD_W,
        height: CARD_H,
        borderRadius: 40,
        background: C.cream,
        padding: 20,
        boxShadow: '0 40px 90px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          height: 250,
          borderRadius: 28,
          background: `radial-gradient(circle at 50% 38%, #FFFFFF 0%, ${TINT[item.key]} 78%)`,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Art size={212} />
      </div>
      <div style={{ padding: '18px 10px 0' }}>
        <div style={{ fontFamily: F.mono, fontWeight: 500, fontSize: 19, letterSpacing: '0.16em', color: C.leaf }}>PEAK SEASON</div>
        <div style={{ ...fraunces(640), fontSize: 46, lineHeight: 1.1, letterSpacing: '-0.02em', color: C.ink, marginTop: 6, whiteSpace: 'nowrap' }}>{item.name}</div>
        <div style={{ fontFamily: F.telugu, fontWeight: 600, fontSize: 36, lineHeight: 1.25, color: C.leaf, marginTop: 4 }}>{item.telugu}</div>
      </div>
    </div>
  );
};

const Panel: React.FC<{ label: string; at: number; top: number; height: number; children: React.ReactNode; index: number }> = ({
  label,
  at,
  top,
  height,
  children,
  index,
}) => {
  const { t } = useT();
  const p = ramp(t, at, 0.8, E.out);
  return (
    <div
      style={{
        position: 'absolute',
        left: 716,
        width: 1074,
        top,
        height,
        borderRadius: 32,
        background: 'rgba(243,245,239,0.07)',
        border: '2px solid rgba(243,245,239,0.18)',
        padding: '26px 38px',
        opacity: p,
        transform: `translateX(${(1 - p) * 140}px) translateY(${wave(t, 4, index * 1.3) * 3}px)`,
      }}
    >
      <div style={{ fontFamily: F.mono, fontWeight: 500, fontSize: 27, letterSpacing: '0.2em', color: C.sprout }}>{label}</div>
      {children}
    </div>
  );
};

/** Slide 4 — the knowledge that comes with the vegetable: good to know, its story, a recipe. */
export const S4Knowledge: React.FC = () => {
  const { t } = useT();

  // which vegetable is up, and how far through the turn we are
  let ti = -1;
  for (let i = 0; i < TURNS.length; i++) if (t >= TURNS[i].at) ti = i;
  const cur = ti >= 0 ? TURNS[ti].to : 0;
  const prev = ti > 0 ? TURNS[ti - 1].to : 0;
  const q = ti >= 0 ? t - TURNS[ti].at : 0;
  const turning = ti > 0;
  const flip = turning ? ramp(q, 0, 0.75, E.inOut) : 1;
  const faceItem = flip < 0.5 ? prev : cur;
  const rotY = flip < 0.5 ? flip * 180 : (flip - 1) * 180;
  const outP = turning ? 1 - ramp(q, 0, 0.3, E.in) : 0; // old words leaving
  const inAt = (delay: number) => (turning ? ramp(q, 0.3 + delay, 0.55, E.out) : 1); // new words arriving

  const sel = ramp(t, 4.6, 0.95, E.inOut);
  const tapP = ramp(t, 4.15, 0.7, E.out);
  const press = 1 - 0.05 * Math.sin(Math.min(1, ramp(t, 4.15, 0.45, E.linear)) * Math.PI);

  const content = (render: (item: (typeof COPY.items)[number]) => React.ReactNode, delay: number) => (
    <div style={{ position: 'relative' }}>
      {turning && outP > 0 ? (
        <div style={{ position: 'absolute', inset: 0, opacity: outP, transform: `translateY(${(1 - outP) * -22}px)` }}>{render(COPY.items[prev])}</div>
      ) : null}
      <div style={{ opacity: inAt(delay), transform: `translateY(${(1 - inAt(delay)) * 26}px)` }}>{render(COPY.items[cur])}</div>
    </div>
  );

  const stepNow = Math.floor((((t % 4) + 4) % 4) / (4 / 3));

  return (
    <Stage background={`radial-gradient(ellipse 75% 85% at 26% 44%, #0D3D28 0%, ${C.night} 78%)`} push={1 + Math.min(t, S4_INTRO) * 0.0008} vignette={0.36}>
      {/* A — the line, and the rail as it looks in the app */}
      <div style={{ position: 'absolute', left: 130, top: 104 }}>
        <Words text={COPY.title} at={0.4} out={4.05} size={132} weight={640} lineHeight={1.06} />
      </div>
      <div style={{ position: 'absolute', left: 334, top: 468 }}>
        <Eyebrow at={1.4} out={4.3} size={28}>
          {COPY.rail}
        </Eyebrow>
      </div>

      {/* the two cards that are not chosen */}
      {[1, 2].map((i) => {
        const p = ramp(t, 1.6 + i * 0.18, 0.9, E.out);
        const away = ramp(t, 4.5, 0.6, E.in);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: RAIL_X[i],
              top: RAIL_Y,
              opacity: p * (1 - away),
              transform: `translateY(${(1 - p) * 160}px) translateX(${away * 260}px) scale(${1 - away * 0.1})`,
            }}
          >
            <Card item={COPY.items[i]} />
          </div>
        );
      })}

      {/* the chosen card: rises with the rail, is tapped, becomes the hero, then turns */}
      <div
        style={{
          position: 'absolute',
          left: mix(RAIL_X[0], HERO.x, sel),
          top: mix(RAIL_Y, HERO.y, sel) + (1 - ramp(t, 1.6, 0.9, E.out)) * 160 + wave(t, 4) * 5 * sel,
          opacity: ramp(t, 1.6, 0.9, E.out),
          transformOrigin: '0% 0%',
          transform: `scale(${mix(1, HERO.s, sel) * press})`,
          perspective: 1600,
        }}
      >
        <div style={{ transform: `rotateY(${rotY}deg)`, transformStyle: 'preserve-3d' }}>
          <Card item={COPY.items[faceItem]} />
        </div>
      </div>

      {/* the tap */}
      <div
        style={{
          position: 'absolute',
          left: RAIL_X[0] + CARD_W / 2 - 150,
          top: RAIL_Y + 150 - 150,
          width: 300,
          height: 300,
          borderRadius: '50%',
          border: `6px solid ${C.sprout}`,
          transform: `scale(${tapP})`,
          opacity: tapP > 0 && tapP < 1 ? (1 - tapP) * 0.9 : 0,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: RAIL_X[0] + CARD_W / 2 - 30,
          top: RAIL_Y + 150 - 30,
          width: 60,
          height: 60,
          borderRadius: '50%',
          background: 'rgba(205,245,106,0.85)',
          transform: `scale(${1 - tapP * 0.6})`,
          opacity: tapP > 0 && tapP < 1 ? 1 - tapP : 0,
        }}
      />

      {/* header over the panels */}
      <div style={{ position: 'absolute', left: 720, top: 120 }}>
        <Eyebrow at={5.0} out={17.9} size={28}>
          TAP ANY ITEM
        </Eyebrow>
      </div>
      <div style={{ position: 'absolute', left: 716, top: 150 }}>
        <Words text={COPY.close} at={18.2} size={84} weight={640} accent={C.emberA} />
      </div>

      {/* B — the three things every item carries */}
      <Panel label={COPY.panels[0]} at={5.4} top={282} height={196} index={0}>
        {content(
          (item) => (
            <div style={{ display: 'flex', gap: 20, marginTop: 22 }}>
              {item.has.map((h, i) => {
                const pop = turning ? 1 : ramp(t, 5.9 + i * 0.22, 0.55, E.back);
                const lit = 0.5 + 0.5 * wave(t, 4, -i * 2.1);
                return (
                  <div
                    key={h}
                    style={{
                      padding: '14px 30px',
                      borderRadius: 22,
                      background: C.sprout,
                      color: C.ink,
                      fontFamily: F.body,
                      fontWeight: 700,
                      fontSize: 44,
                      transform: `scale(${pop})`,
                      boxShadow: `0 0 ${10 + lit * 26}px rgba(205,245,106,${0.15 + lit * 0.3})`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </div>
                );
              })}
            </div>
          ),
          0,
        )}
      </Panel>

      <Panel label={COPY.panels[1]} at={6.7} top={504} height={206} index={1}>
        {content(
          (item) => (
            <div style={{ ...fraunces(480), fontStyle: 'italic', fontSize: 47, lineHeight: 1.22, color: C.cream, marginTop: 16 }}>{item.story}</div>
          ),
          0.1,
        )}
      </Panel>

      <Panel label={COPY.panels[2]} at={8.0} top={736} height={224} index={2}>
        {content(
          (item) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 14 }}>
              <div style={{ ...fraunces(640), fontSize: 60, letterSpacing: '-0.02em', color: C.cream, whiteSpace: 'nowrap' }}>{item.recipe}</div>
              <div
                style={{
                  padding: '8px 22px',
                  borderRadius: 999,
                  border: `2px solid ${C.emberA}`,
                  color: C.emberA,
                  fontFamily: F.mono,
                  fontWeight: 500,
                  fontSize: 30,
                  whiteSpace: 'nowrap',
                }}
              >
                {item.mins}
              </div>
            </div>
          ),
          0.2,
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 20, opacity: ramp(t, 8.8, 0.7) }}>
          {['Prep', 'Cook', 'Serve'].map((s, i) => (
            <React.Fragment key={s}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  fontFamily: F.body,
                  fontWeight: 600,
                  fontSize: 32,
                  color: stepNow === i ? C.sprout : 'rgba(243,245,239,0.6)',
                }}
              >
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    background: stepNow === i ? C.sprout : 'transparent',
                    border: `3px solid ${stepNow === i ? C.sprout : 'rgba(243,245,239,0.4)'}`,
                    color: stepNow === i ? C.ink : 'rgba(243,245,239,0.7)',
                    fontFamily: F.mono,
                    fontSize: 22,
                  }}
                >
                  {i + 1}
                </span>
                {s}
              </div>
              {i < 2 ? <div style={{ width: 70, height: 3, background: 'rgba(243,245,239,0.3)', borderRadius: 2 }} /> : null}
            </React.Fragment>
          ))}
        </div>
      </Panel>
    </Stage>
  );
};
