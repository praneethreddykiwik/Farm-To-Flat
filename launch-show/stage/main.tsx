// The live stage: what actually runs on the venue screen.
//
// Each cue is an animated scene that plays once and then holds on a seamless idle loop until the
// presenter moves on — so the speaker sets the pace, not the video. The "hold" cue waits for the
// chief guest: ENTER (or any advance key, or the operator's click) fires the launch.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Thumbnail } from '@remotion/player';
import '../src/fonts';
import launchSting from '../src/assets/launch.mp3';
import { FPS, H, W } from '../src/brand';
import { SCENES, type SceneDef } from '../src/scenes';
import { Standby, STANDBY_INTRO, STANDBY_LOOP } from '../src/scenes/Standby';

const params = new URLSearchParams(window.location.search);
const DEBUG_T = params.has('t') ? Number(params.get('t')) : null; // freeze a scene at t seconds
const START = Math.min(SCENES.length - 1, Math.max(0, Number(params.get('scene') ?? 1) - 1));
const FADE_MS = 520;
const LAUNCH = SCENES.findIndex((s) => s.id === 'S7Launch');

const STANDBY: SceneDef = {
  id: 'Standby',
  title: 'Standby',
  cue: 'Ready. Press any key or click to begin.',
  Component: Standby,
  intro: STANDBY_INTRO,
  loop: STANDBY_LOOP,
};

const sting = new Audio(launchSting);
sting.preload = 'auto';

const sceneFrames = (s: SceneDef) => Math.round((s.intro + s.loop) * FPS);

/** Seconds since the cue fired → the frame to draw (play once, then loop the idle tail). */
const frameAt = (s: SceneDef, elapsed: number) => {
  const total = s.intro + s.loop;
  const sec = elapsed < total ? elapsed : s.intro + ((elapsed - s.intro) % s.loop);
  return Math.min(sceneFrames(s) - 1, Math.max(0, Math.floor(sec * FPS)));
};

const Layer: React.FC<{ scene: SceneDef; startedAt: number; paused: boolean; fadeIn: boolean }> = ({
  scene,
  startedAt,
  paused,
  fadeIn,
}) => {
  const [frame, setFrame] = useState(() => (DEBUG_T === null ? 0 : frameAt(scene, DEBUG_T)));
  // The cross-fade runs off the same clock as the frames (not a CSS transition), so it can never
  // stall half-way if the browser is busy.
  const [alpha, setAlpha] = useState(fadeIn && DEBUG_T === null ? 0 : 1);
  const pausedAt = useRef<number | null>(null);
  const offset = useRef(0);

  useEffect(() => {
    if (DEBUG_T !== null) return;
    let raf = 0;
    const tick = (now: number) => {
      if (fadeIn) {
        const a = Math.min(1, Math.max(0, (now - startedAt) / FADE_MS));
        setAlpha((prev) => (prev === a ? prev : a));
      }
      if (paused) {
        if (pausedAt.current === null) pausedAt.current = now;
      } else {
        if (pausedAt.current !== null) {
          offset.current += now - pausedAt.current;
          pausedAt.current = null;
        }
        const next = frameAt(scene, (now - startedAt - offset.current) / 1000);
        setFrame((prev) => (prev === next ? prev : next));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scene, startedAt, paused, fadeIn]);

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: alpha }}>
      <Thumbnail
        component={scene.Component}
        compositionWidth={W}
        compositionHeight={H}
        frameToDisplay={frame}
        durationInFrames={sceneFrames(scene)}
        fps={FPS}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

/** index -1 is the standby card shown before the segment begins. */
type Live = { key: number; index: number; startedAt: number; fadeIn: boolean };
const sceneOf = (index: number) => (index < 0 ? STANDBY : SCENES[index]);

const App: React.FC = () => {
  const [live, setLive] = useState<Live>({
    key: 0,
    index: DEBUG_T !== null || params.has('scene') ? START : -1,
    startedAt: performance.now(),
    fadeIn: false,
  });
  const [leaving, setLeaving] = useState<Live | null>(null);
  const [paused, setPaused] = useState(false);
  const [blackout, setBlackout] = useState(false);
  const [muted, setMuted] = useState(params.get('mute') === '1');
  const [hud, setHud] = useState(params.get('hud') === '1');
  const [idle, setIdle] = useState(false);
  const lastCue = useRef(0);
  const liveRef = useRef(live);
  liveRef.current = live;

  useEffect(() => {
    sting.muted = muted;
  }, [muted]);

  const go = useCallback((index: number, force = false) => {
    const now = performance.now();
    // a clicker double-press must never skip a cue
    if (!force && now - lastCue.current < 650) return;
    if (index < 0 || index >= SCENES.length) return;
    lastCue.current = now;
    setPaused(false);
    setBlackout(false);
    const cut = !!SCENES[index].cut;
    const next = { key: liveRef.current.key + 1, index, startedAt: now, fadeIn: !cut };
    sting.pause();
    if (index === LAUNCH) {
      sting.currentTime = 0;
      void sting.play().catch(() => undefined);
    }
    if (cut) {
      // the launch answers the key press on the very next frame — no cross-fade
      setLeaving(null);
      setLive(next);
      return;
    }
    // the outgoing scene stays underneath, fully opaque, while the new one fades in over it
    setLeaving({ ...liveRef.current, fadeIn: false });
    setLive(next);
    window.setTimeout(() => setLeaving((l) => (l && l.key === next.key - 1 ? null : l)), FADE_MS + 400);
  }, []);

  useEffect(() => {
    const fullscreen = () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen().catch(() => undefined);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const i = liveRef.current.index;
      switch (e.key) {
        case 'Enter':
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          e.preventDefault();
          go(i + 1, i < 0);
          break;
        case 'ArrowLeft':
        case 'PageUp':
        case 'Backspace':
          e.preventDefault();
          go(i - 1, true);
          break;
        case 'r':
        case 'R':
          go(Math.max(0, i), true);
          break;
        case 'f':
        case 'F':
          fullscreen();
          break;
        case 'h':
        case 'H':
          setHud((v) => !v);
          break;
        case 'b':
        case 'B':
          setBlackout((v) => !v);
          break;
        case 'm':
        case 'M':
          setMuted((v) => !v);
          break;
        case 'p':
        case 'P':
          setPaused((v) => !v);
          break;
        default:
          if (/^[1-9]$/.test(e.key)) go(Number(e.key) - 1, true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  // hide the pointer when it is not moving
  useEffect(() => {
    let timer = 0;
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), 1800);
    };
    wake();
    window.addEventListener('mousemove', wake);
    return () => {
      window.removeEventListener('mousemove', wake);
      window.clearTimeout(timer);
    };
  }, []);

  const scene = sceneOf(live.index);
  const standby = live.index < 0;

  return (
    <div
      onClick={() => go(live.index + 1, standby)}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        display: 'grid',
        placeItems: 'center',
        cursor: idle ? 'none' : 'default',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: `min(100vw, calc(100vh * ${W} / ${H}))`,
          height: `min(100vh, calc(100vw * ${H} / ${W}))`,
          background: '#000',
          overflow: 'hidden',
        }}
      >
        {leaving ? (
          <Layer key={leaving.key} scene={sceneOf(leaving.index)} startedAt={leaving.startedAt} paused={false} fadeIn={false} />
        ) : null}
        <Layer key={live.key} scene={scene} startedAt={live.startedAt} paused={paused} fadeIn={live.fadeIn} />
        {blackout ? <div style={{ position: 'absolute', inset: 0, background: '#000' }} /> : null}
      </div>

      {hud || standby ? (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: 22,
            padding: '10px 18px',
            borderRadius: 12,
            background: 'rgba(0,0,0,0.72)',
            color: '#F3F5EF',
            font: '500 14px/1.55 ui-monospace, Menlo, monospace',
            letterSpacing: '0.02em',
            pointerEvents: 'none',
            maxWidth: 'min(94vw, 820px)',
            textAlign: 'center',
          }}
        >
          {standby ? (
            <>
              <div style={{ color: '#CDF56A' }}>READY · press F for full screen, then → or click to begin</div>
              <div style={{ opacity: 0.62 }}>→ / Enter next · ← back · R replay · 1–{SCENES.length} jump · B black · M mute · H notes</div>
            </>
          ) : (
            <>
              <div style={{ color: '#CDF56A' }}>
                CUE {live.index + 1} / {SCENES.length} · {scene.title}
                {paused ? ' · PAUSED' : ''}
                {muted ? ' · MUTED' : ''}
              </div>
              <div style={{ opacity: 0.85 }}>{scene.cue}</div>
              <div style={{ opacity: 0.6 }}>→ / Enter next · ← back · R replay · 1–{SCENES.length} jump · F full screen · B black · M mute · H hide</div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
};

// one root, even when the dev server hot-reloads this module
const host = window as unknown as { __stageRoot?: ReturnType<typeof createRoot> };
host.__stageRoot = host.__stageRoot ?? createRoot(document.getElementById('root')!);
host.__stageRoot.render(<App />);
