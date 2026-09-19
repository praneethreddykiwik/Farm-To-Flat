import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

const { width: W, height: H } = Dimensions.get('window');

/**
 * The village living on the ridge: a procession of tiny walkers and animals crossing the hill,
 * trees breathing in the breeze, a lit hut, and a few fireflies.
 *
 * Everything is under ~2% of screen height and low contrast. It must read as "the farm is quietly
 * awake" out of the corner of the eye and never compete with the headline or the call to action.
 *
 * The walk is real, not implied. An earlier version slid the figures sideways and bobbed them up
 * and down, which reads as dragging: nothing articulates and the feet leave the ground. Now each
 * figure's legs scissor about the hip with the foot pinned to the ground line, and the cadence is
 * derived from how fast its lane actually travels, so a stride covers the distance crossed and
 * nobody moonwalks.
 *
 * Built on transforms and animated path data on Reanimated's UI thread — no layout or repaint work
 * per frame. Honours the OS "reduce motion" setting by rendering the same scene completely still.
 */

const AnimatedPath = Animated.createAnimatedComponent(Path);

const INK = '#0D1F16'; // silhouette fill — reads as shadow against the lit hill
const SARI = '#9C5B38'; // one warm accent in the line, as in a real morning procession
const LOAD = '#C8A02E'; // the bundle of greens carried on the head
const LAMP = '#F2C14E'; // the hut's window

/** Feet sit a touch below the ridge crest so a walker is always planted on filled ground. */
const FOOT = 2;

/** Lane travel in pixels per second — the gait periods below are derived from these, not guessed. */
const LANE = { far: W / 58, main: W / 38, near: W / 29 };

/**
 * Period of one full two-step cycle for a figure travelling at `speed` with the given stride reach.
 * Over a cycle the body advances four reaches (each leg swings from behind the hip to in front of
 * it), so period = 4 * reach / speed. Getting this wrong is exactly what makes a tiny figure look
 * like it is being dragged along the ground instead of walking.
 */
const gaitPeriod = (speed, reach) => (4 * reach * 1000) / speed;

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (alive) setReduced(!!v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduced(!!v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduced;
}

/**
 * A sawtooth 0→1 driving one gait. sin(2πp) is continuous across the wrap, so the legs never snap
 * when the cycle restarts. Under reduced motion the figure holds a natural mid-stride pose rather
 * than standing to attention.
 */
function useGait(period, delay, reduced) {
  const p = useSharedValue(0.12);
  useEffect(() => {
    if (reduced) {
      p.value = 0.12;
      return;
    }
    p.value = 0;
    p.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: period, easing: Easing.linear }), -1, false),
    );
  }, [p, period, delay, reduced]);
  return p;
}

/**
 * One horizontal lane of scenery that loops without a visible seam: the lane is two identical
 * copies side by side, and sliding it exactly one screen width puts the second copy precisely
 * where the first began. Nothing ever teleports, so the loop cannot be spotted.
 */
function Lane({ duration, reduced, render, opacity = 1 }) {
  const x = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    x.value = 0;
    x.value = withRepeat(withTiming(W, { duration, easing: Easing.linear }), -1, false);
  }, [x, duration, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: -W, top: 0, width: W * 2, height: H, opacity }, style]}
    >
      <View style={[styles.copy, { left: 0 }]}>{render('a')}</View>
      <View style={[styles.copy, { left: W }]}>{render('b')}</View>
    </Animated.View>
  );
}

/**
 * Places a figure on the ground line. No bob and no sway — the body stays exactly on the floor and
 * every bit of the movement lives in the legs, which is the difference between walking and
 * hovering. `graze` lets an animal fall back against its lane for a few seconds then amble to catch
 * up; the lane must hold its exact constant speed or the seamless loop breaks, so the pause lives
 * here as a local offset.
 */
function Placed({ left, baseY, w, h, opacity = 0.9, graze, reduced, children }) {
  const g = useSharedValue(0);
  useEffect(() => {
    if (reduced || !graze) return;
    g.value = withDelay(
      graze,
      withRepeat(
        withSequence(
          withTiming(-7, { duration: 2800, easing: Easing.inOut(Easing.quad) }),
          withTiming(-7, { duration: 2200, easing: Easing.linear }),
          withTiming(0, { duration: 3600, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
  }, [g, graze, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: g.value }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left, top: baseY - h, width: w, height: h, opacity }, style]}
    >
      <Svg width={w} height={h}>
        {children}
      </Svg>
    </Animated.View>
  );
}

/** Trees and grass do not travel — they lean, each on its own clock, as a light breeze passes. */
function Sway({ left, baseY, w, h, period, delay, reduced, amount = 1.2, opacity = 1, children }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: period, easing: Easing.inOut(Easing.quad) }), -1, true),
    );
  }, [t, period, delay, reduced]);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${(t.value - 0.5) * amount * 2}deg` }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left, top: baseY - h, width: w, height: h, opacity }, style]}
    >
      <Svg width={w} height={h}>
        {children}
      </Svg>
    </Animated.View>
  );
}

// ── walkers ───────────────────────────────────────────────────────────────────
// All face right. Feet rest on the bottom edge of their own box, and stay there.

/**
 * Both legs and the counter-swinging arm in a single animated path — one path per figure keeps the
 * per-frame work small. The feet hold y = h throughout, so a stride shortens and lengthens the leg
 * rather than lifting it: invisible at this size, and it guarantees nobody ever floats.
 */
function Limbs({ w, h, phase, reach, lineWidth }) {
  const props = useAnimatedProps(() => {
    const s = Math.sin(phase.value * Math.PI * 2) * reach;
    const hx = w * 0.5;
    const hipY = h * 0.6;
    const shoulderY = h * 0.34;
    return {
      d:
        `M${hx} ${hipY} L${hx + s} ${h} ` +
        `M${hx} ${hipY} L${hx - s} ${h} ` +
        `M${hx} ${shoulderY} L${hx - s * 0.75} ${h * 0.55}`,
    };
  });
  return (
    <AnimatedPath
      animatedProps={props}
      stroke={INK}
      strokeWidth={lineWidth}
      strokeLinecap="round"
      fill="none"
    />
  );
}

function Person({ w, h, phase, reach, hat, load, skirt }) {
  return (
    <>
      <Circle cx={w * 0.5} cy={h * 0.13} r={h * 0.105} fill={INK} />
      <Path
        d={`M${w * 0.5} ${h * 0.25} L${w * 0.5} ${skirt ? h * 0.5 : h * 0.62}`}
        stroke={INK}
        strokeWidth={h * 0.2}
        strokeLinecap="round"
      />
      {/* the sari stops above the ankles so the stride still reads underneath it */}
      {skirt ? (
        <Path
          d={`M${w * 0.5} ${h * 0.46} L${w * 0.24} ${h * 0.82} L${w * 0.76} ${h * 0.82} Z`}
          fill={SARI}
          opacity={0.7}
        />
      ) : null}
      <Limbs w={w} h={h} phase={phase} reach={reach} lineWidth={h * 0.1} />
      {hat ? <Ellipse cx={w * 0.5} cy={h * 0.06} rx={w * 0.34} ry={h * 0.045} fill={INK} /> : null}
      {load ? (
        <Ellipse
          cx={w * 0.5}
          cy={h * 0.035}
          rx={w * 0.3}
          ry={h * 0.055}
          fill={LOAD}
          opacity={0.9}
        />
      ) : null}
    </>
  );
}

/** The staff plants on the ground and swings with the opposite hand. */
function Farmer({ w, h, phase, reach }) {
  const props = useAnimatedProps(() => {
    const s = Math.sin(phase.value * Math.PI * 2 + Math.PI) * reach * 0.5;
    return { d: `M${w * 0.8} ${h * 0.3} L${w * 0.84 + s} ${h}` };
  });
  return (
    <>
      <Person w={w} h={h} phase={phase} reach={reach} hat />
      <AnimatedPath
        animatedProps={props}
        stroke={INK}
        strokeWidth={h * 0.045}
        strokeLinecap="round"
        fill="none"
        opacity={0.85}
      />
    </>
  );
}

/**
 * Four legs on a diagonal gait — front-left swings with back-right. Same rule as the people:
 * hooves stay on the ground line.
 */
function Quadruped({ w, h, phase, reach, horns, ears }) {
  const props = useAnimatedProps(() => {
    const s = Math.sin(phase.value * Math.PI * 2) * reach;
    const o = -s;
    return {
      d:
        `M${w * 0.26} ${h * 0.62} L${w * 0.26 + s} ${h} ` +
        `M${w * 0.4} ${h * 0.64} L${w * 0.4 + o} ${h} ` +
        `M${w * 0.58} ${h * 0.64} L${w * 0.58 + s} ${h} ` +
        `M${w * 0.7} ${h * 0.62} L${w * 0.7 + o} ${h}`,
    };
  });
  return (
    <>
      <Ellipse cx={w * 0.46} cy={h * 0.42} rx={w * 0.3} ry={h * 0.22} fill={INK} />
      <AnimatedPath
        animatedProps={props}
        stroke={INK}
        strokeWidth={h * 0.085}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d={`M${w * 0.72} ${h * 0.32} L${w * 0.88} ${h * 0.22}`}
        stroke={INK}
        strokeWidth={h * 0.17}
        strokeLinecap="round"
      />
      {horns ? (
        <Path
          d={`M${w * 0.86} ${h * 0.18} L${w * 0.95} ${h * 0.07}`}
          stroke={INK}
          strokeWidth={h * 0.05}
          strokeLinecap="round"
        />
      ) : null}
      {ears ? <Circle cx={w * 0.84} cy={h * 0.16} r={h * 0.1} fill={INK} /> : null}
      <Path
        d={`M${w * 0.17} ${h * 0.3} L${w * 0.05} ${h * 0.56}`}
        stroke={INK}
        strokeWidth={h * 0.045}
        strokeLinecap="round"
      />
    </>
  );
}

// ── rooted scenery ────────────────────────────────────────────────────────────

const tree = (w, h) => (
  <>
    <Path
      d={`M${w * 0.5} ${h} L${w * 0.5} ${h * 0.55}`}
      stroke={INK}
      strokeWidth={w * 0.09}
      strokeLinecap="round"
    />
    <Ellipse cx={w * 0.5} cy={h * 0.38} rx={w * 0.42} ry={h * 0.3} fill={INK} />
    <Ellipse cx={w * 0.3} cy={h * 0.5} rx={w * 0.26} ry={h * 0.2} fill={INK} />
    <Ellipse cx={w * 0.72} cy={h * 0.5} rx={w * 0.26} ry={h * 0.2} fill={INK} />
  </>
);

const palm = (w, h) => (
  <>
    <Path
      d={`M${w * 0.5} ${h} Q ${w * 0.42} ${h * 0.5} ${w * 0.5} ${h * 0.24}`}
      stroke={INK}
      strokeWidth={w * 0.07}
      strokeLinecap="round"
      fill="none"
    />
    {[
      [0.06, 0.12],
      [0.94, 0.12],
      [0.0, 0.32],
      [1.0, 0.32],
      [0.5, 0.02],
    ].map(([fx, fy], i) => (
      <Path
        key={i}
        d={`M${w * 0.5} ${h * 0.24} Q ${w * (0.5 + (fx - 0.5) * 0.6)} ${h * (fy - 0.04)} ${w * fx} ${h * fy}`}
        stroke={INK}
        strokeWidth={w * 0.055}
        strokeLinecap="round"
        fill="none"
      />
    ))}
  </>
);

const hut = (w, h) => (
  <>
    <Path d={`M${w * 0.5} 0 L${w} ${h * 0.44} L0 ${h * 0.44} Z`} fill={INK} />
    <Rect x={w * 0.14} y={h * 0.44} width={w * 0.72} height={h * 0.56} fill={INK} />
    <Rect x={w * 0.38} y={h * 0.58} width={w * 0.24} height={h * 0.26} rx={w * 0.03} fill={LAMP} />
  </>
);

const tuft = (w, h) => (
  <>
    {[0.2, 0.5, 0.8].map((fx, i) => (
      <Path
        key={i}
        d={`M${w * fx} ${h} C ${w * (fx - 0.12)} ${h * 0.6}, ${w * (fx - 0.04)} ${h * 0.3}, ${w * (fx + 0.06)} 0`}
        stroke="#5BBF7A"
        strokeWidth={w * 0.07}
        strokeLinecap="round"
        fill="none"
        opacity={0.5}
      />
    ))}
  </>
);

// ── atmosphere ────────────────────────────────────────────────────────────────

/** A firefly: drifts up and sideways, fading in and out, never sparkling. */
function Firefly({ left, top, drift, period, delay, reduced }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: period, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
  }, [t, period, delay, reduced]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.18 + t.value * 0.38,
    transform: [{ translateY: -t.value * 14 }, { translateX: t.value * drift }],
  }));
  if (reduced) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left, top, width: 3, height: 3 }, style]}
    >
      <Svg width={3} height={3}>
        <Circle cx={1.5} cy={1.5} r={1.5} fill="#CFF67F" />
      </Svg>
    </Animated.View>
  );
}

/** Depth only: a wide, almost invisible band easing across behind the hill. */
function Fog({ base, reduced }) {
  const f = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    f.value = withRepeat(
      withTiming(1, { duration: 42000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [f, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: -30 + f.value * 60 }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: -40, top: base - 150, width: W + 80, height: 120 },
        style,
      ]}
    >
      <Svg width={W + 80} height={120}>
        <Defs>
          <LinearGradient id="fog" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%" stopColor="#CFEBD4" stopOpacity={0} />
            <Stop offset="45%" stopColor="#CFEBD4" stopOpacity={0.045} />
            <Stop offset="100%" stopColor="#CFEBD4" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={W + 80} height={120} fill="url(#fog)" />
      </Svg>
    </Animated.View>
  );
}

/**
 * One bird, far off, crossing about every half minute. It exists to be noticed on the third or
 * fourth look — never on the first, and never while someone is reading the headline.
 */
function Bird({ reduced }) {
  const b = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    b.value = withRepeat(
      withSequence(
        withDelay(9000, withTiming(1, { duration: 17000, easing: Easing.linear })),
        withTiming(0, { duration: 0 }),
      ),
      -1,
      false,
    );
  }, [b, reduced]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.sin(Math.PI * b.value) * 0.3,
    transform: [
      { translateX: -24 + b.value * (W + 48) },
      { translateY: Math.sin(b.value * Math.PI * 3) * 9 },
    ],
  }));
  if (reduced) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, top: H * 0.3, width: 14, height: 7 }, style]}
    >
      <Svg width={14} height={7}>
        <Path
          d="M1 5 Q3.5 1 6.5 4.5 Q9.5 1 13 5"
          stroke="#DCEFC8"
          strokeWidth={1.1}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}

// ── the scene ─────────────────────────────────────────────────────────────────

/**
 * One villager, owning its own gait clock so the line never marches in lockstep. `pace` nudges the
 * cadence either side of the lane's true speed — enough that some walk briskly and others amble,
 * not enough for anyone to look like they are skating.
 */
function Villager({
  kind,
  left,
  baseY,
  w,
  h,
  speed,
  pace = 1,
  delay = 0,
  reduced,
  opacity,
  graze,
}) {
  const reach = w * 0.3;
  const phase = useGait(gaitPeriod(speed, reach) / pace, delay, reduced);
  const quad = kind === 'cow' || kind === 'dog';
  return (
    <Placed left={left} baseY={baseY} w={w} h={h} opacity={opacity} graze={graze} reduced={reduced}>
      {kind === 'farmer' ? <Farmer w={w} h={h} phase={phase} reach={reach} /> : null}
      {kind === 'carrier' ? <Person w={w} h={h} phase={phase} reach={reach} load /> : null}
      {kind === 'sari' ? <Person w={w} h={h} phase={phase} reach={reach} skirt /> : null}
      {kind === 'person' || kind === 'child' ? (
        <Person w={w} h={h} phase={phase} reach={reach} />
      ) : null}
      {quad ? (
        <Quadruped
          w={w}
          h={h}
          phase={phase}
          reach={reach * 0.55}
          horns={kind === 'cow'}
          ears={kind === 'dog'}
        />
      ) : null}
    </Placed>
  );
}

export function VillageRidge({ ridgeY }) {
  const reduced = useReducedMotion();
  const base = ridgeY + FOOT;

  const far = (k) => (
    <React.Fragment key={k}>
      <Villager
        kind="person"
        left={W * 0.12}
        baseY={base - 4}
        w={9}
        h={13}
        speed={LANE.far}
        pace={0.9}
        reduced={reduced}
        opacity={0.5}
      />
      <Villager
        kind="person"
        left={W * 0.21}
        baseY={base - 4}
        w={8}
        h={12}
        speed={LANE.far}
        pace={1.1}
        delay={300}
        reduced={reduced}
        opacity={0.45}
      />
      <Villager
        kind="cow"
        left={W * 0.66}
        baseY={base - 4}
        w={15}
        h={10}
        speed={LANE.far}
        pace={0.85}
        delay={600}
        reduced={reduced}
        opacity={0.45}
        graze={7000}
      />
    </React.Fragment>
  );

  const main = (k) => (
    <React.Fragment key={k}>
      <Villager
        kind="farmer"
        left={W * 0.04}
        baseY={base}
        w={14}
        h={20}
        speed={LANE.main}
        pace={1.05}
        reduced={reduced}
      />
      <Villager
        kind="cow"
        left={W * 0.17}
        baseY={base}
        w={27}
        h={17}
        speed={LANE.main}
        pace={0.8}
        delay={220}
        reduced={reduced}
        opacity={0.88}
        graze={400}
      />
      <Villager
        kind="carrier"
        left={W * 0.35}
        baseY={base}
        w={14}
        h={20}
        speed={LANE.main}
        pace={0.92}
        delay={120}
        reduced={reduced}
      />
      <Villager
        kind="sari"
        left={W * 0.47}
        baseY={base}
        w={14}
        h={19}
        speed={LANE.main}
        pace={1.08}
        delay={420}
        reduced={reduced}
      />
      <Villager
        kind="sari"
        left={W * 0.56}
        baseY={base}
        w={13}
        h={18}
        speed={LANE.main}
        pace={1.14}
        delay={540}
        reduced={reduced}
      />
      <Villager
        kind="dog"
        left={W * 0.67}
        baseY={base}
        w={15}
        h={9}
        speed={LANE.main}
        pace={1.5}
        delay={80}
        reduced={reduced}
        opacity={0.85}
        graze={2600}
      />
      <Villager
        kind="farmer"
        left={W * 0.78}
        baseY={base}
        w={14}
        h={20}
        speed={LANE.main}
        pace={0.96}
        delay={300}
        reduced={reduced}
      />
      <Villager
        kind="child"
        left={W * 0.88}
        baseY={base}
        w={10}
        h={14}
        speed={LANE.main}
        pace={1.35}
        delay={660}
        reduced={reduced}
        opacity={0.9}
      />
    </React.Fragment>
  );

  const near = (k) => (
    <React.Fragment key={k}>
      <Villager
        kind="carrier"
        left={W * 0.3}
        baseY={base + 3}
        w={15}
        h={23}
        speed={LANE.near}
        pace={0.95}
        delay={200}
        reduced={reduced}
      />
      <Villager
        kind="dog"
        left={W * 0.44}
        baseY={base + 3}
        w={17}
        h={10}
        speed={LANE.near}
        pace={1.45}
        delay={520}
        reduced={reduced}
        opacity={0.85}
        graze={5200}
      />
    </React.Fragment>
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Backlight: without a lit horizon the dark silhouettes sit exactly on the dark/green
          boundary and disappear. This is the dawn band they are read against. */}
      <View style={{ position: 'absolute', left: 0, top: base - 104, width: W, height: 108 }}>
        <Svg width={W} height={108}>
          <Defs>
            <LinearGradient id="dawn" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#7FD98F" stopOpacity={0} />
              <Stop offset="68%" stopColor="#7FD98F" stopOpacity={0.13} />
              <Stop offset="100%" stopColor="#B6EE72" stopOpacity={0.32} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={W} height={108} fill="url(#dawn)" />
        </Svg>
      </View>
      <Fog base={base} reduced={reduced} />
      <Bird reduced={reduced} />

      {/* Standing scenery: rooted, so it sways rather than travels. */}
      <Sway
        left={W * 0.02}
        baseY={base}
        w={20}
        h={28}
        period={5200}
        delay={0}
        reduced={reduced}
        opacity={0.9}
      >
        {tree(20, 28)}
      </Sway>
      <Sway
        left={W * 0.24}
        baseY={base}
        w={15}
        h={20}
        period={6100}
        delay={900}
        reduced={reduced}
        opacity={0.75}
      >
        {tree(15, 20)}
      </Sway>
      <Sway
        left={W * 0.84}
        baseY={base}
        w={23}
        h={38}
        period={5600}
        delay={400}
        reduced={reduced}
        amount={0.9}
      >
        {palm(23, 38)}
      </Sway>
      <Sway
        left={W * 0.93}
        baseY={base}
        w={19}
        h={32}
        period={6400}
        delay={1300}
        reduced={reduced}
        amount={0.9}
      >
        {palm(19, 32)}
      </Sway>
      <View style={{ position: 'absolute', left: W * 0.71, top: base - 19, width: 23, height: 19 }}>
        <Svg width={23} height={19}>
          {hut(23, 19)}
        </Svg>
      </View>

      {/* Grass catching the same breeze. */}
      <Sway
        left={W * 0.06}
        baseY={base}
        w={18}
        h={14}
        period={3800}
        delay={0}
        reduced={reduced}
        amount={2}
      >
        {tuft(18, 14)}
      </Sway>
      <Sway
        left={W * 0.38}
        baseY={base}
        w={15}
        h={12}
        period={4300}
        delay={700}
        reduced={reduced}
        amount={2}
      >
        {tuft(15, 12)}
      </Sway>
      <Sway
        left={W * 0.62}
        baseY={base}
        w={17}
        h={13}
        period={4700}
        delay={1500}
        reduced={reduced}
        amount={2}
      >
        {tuft(17, 13)}
      </Sway>

      {/* The procession. */}
      <Lane duration={58000} reduced={reduced} render={far} opacity={0.55} />
      <Lane duration={38000} reduced={reduced} render={main} />
      <Lane duration={29000} reduced={reduced} render={near} />

      {/* Fireflies over the field. */}
      {[
        [W * 0.16, base - 34, 6, 5200, 0],
        [W * 0.33, base - 52, -5, 6100, 900],
        [W * 0.55, base - 40, 7, 4800, 1800],
        [W * 0.74, base - 60, -6, 6600, 500],
        [W * 0.9, base - 30, 5, 5500, 2400],
      ].map(([l, t, d, p, dl]) => (
        <Firefly
          key={`${l}-${t}`}
          left={l}
          top={t}
          drift={d}
          period={p}
          delay={dl}
          reduced={reduced}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  copy: { position: 'absolute', top: 0, width: W, height: H },
});
