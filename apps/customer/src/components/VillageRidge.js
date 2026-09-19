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

const INK = '#022416'; // silhouette fill, sampled from the reference figures
const SARI = '#BB7404'; // the rust sari — the one saturated warm note in the line
const LOAD = '#A4C506'; // the bundle is GREENS, not gold — bright yellow-green in the reference
const LIME = '#A4C506'; // the farmer's shirt is the same lit yellow-green
const LAMP = '#D2911C'; // the hut's window
const LEAF = '#153825'; // trees sit a shade lighter than the figures, as in the reference

/** Feet sit a touch below the ridge crest so a walker is always planted on filled ground. */
const FOOT = 2;

/**
 * The walking surface. A sine rather than a Bézier so its height is directly computable at any x —
 * that is what lets the ground and the villagers agree. The previous ridge swung ±24pt while the
 * figures stood at a fixed y, so they sank into the crests and floated over the troughs.
 *
 * Two whole cycles across the width, so f(0) === f(W) and the tiled ground has no seam. It also
 * means a shift of one screen width is a whole number of periods, so both copies of a lane can use
 * the same x without caring which copy they are.
 */
export const GROUND_AMP = 9;
const GROUND_CYCLES = 2;

/** Surface height at absolute screen x. Worklet — the figures call it every frame. */
export function surfaceY(x, ridgeY) {
  'worklet';
  return ridgeY + GROUND_AMP * Math.sin((x / W) * Math.PI * 2 * GROUND_CYCLES);
}

/** The same curve as an SVG path, in local coords where y=0 is ridgeY - GROUND_AMP. */
export function groundPathD(height) {
  const N = 64;
  let d = '';
  for (let i = 0; i <= N; i++) {
    const x = (W * i) / N;
    const y = GROUND_AMP + GROUND_AMP * Math.sin((x / W) * Math.PI * 2 * GROUND_CYCLES);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(2)} `;
  }
  return `${d}L${W} ${height} L0 ${height} Z`;
}

/** Lane travel in pixels per second — the gait periods below are derived from these, not guessed. */
// Kept close together on purpose. A wide spread made figures in different lanes visibly
// overtake one another, which reads as some of them drifting backwards rather than one
// procession moving together. These still give depth, but nobody races past anybody.
const LANE = { far: W / 46, main: W / 38, near: W / 33 };

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
 *
 * Travels RIGHT. The ridge behind it was flipped to match: when the two disagree, the figures are
 * walking against their own ground, which is what made the procession look wrong at the start.
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
      <View style={[styles.copy, { left: 0 }]}>{render('a', x)}</View>
      <View style={[styles.copy, { left: W }]}>{render('b', x)}</View>
    </Animated.View>
  );
}

/**
 * Places a figure on the ground line. No bob, no sway and no local offset of any kind — the body
 * sits exactly on the floor and travels only with its lane, so the whole procession moves as one
 * constant forward flow. (An earlier version let animals drift backwards to "graze"; on screen
 * that just read as some of them walking backwards.)
 */
function Placed({ left, baseY, w, h, opacity = 0.9, laneX, children }) {
  // Feet track the ground beneath them, so a villager rises over a crest and dips into a hollow
  // instead of skimming a flat line across a curved hill.
  const style = useAnimatedStyle(() => {
    const x = left + (laneX ? laneX.value : 0);
    return { transform: [{ translateY: surfaceY(x, baseY) - baseY }] };
  });
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
  const groundY = surfaceY(left + w / 2, baseY);
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
      style={[
        { position: 'absolute', left, top: groundY - h, width: w, height: h, opacity },
        style,
      ]}
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

function Person({ w, h, phase, reach, hat, load, skirt, shirt }) {
  return (
    <>
      <Circle cx={w * 0.5} cy={h * 0.13} r={h * 0.105} fill={INK} />
      <Path
        d={`M${w * 0.5} ${h * 0.25} L${w * 0.5} ${skirt ? h * 0.5 : h * 0.62}`}
        stroke={shirt || INK}
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
      <Person w={w} h={h} phase={phase} reach={reach} hat shirt={LIME} />
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
/**
 * A zebu — the humped desi cow you actually see on a Hyderabad road, not a generic barnyard
 * quadruped. An ellipse with a stub pointing up reads as a sheep; what says "cow" at 30px across
 * is the profile: a long flat back, the shoulder hump, the head carried LOW on a forward-sloping
 * neck, a dewlap swinging under the throat, curved horns, drooping ears and a tufted tail.
 */
function Cow({ w, h, phase, reach }) {
  // diagonal gait: near-hind swings with far-fore, so each visible pair scissors
  const props = useAnimatedProps(() => {
    const s = Math.sin(phase.value * Math.PI * 2) * reach;
    const o = -s;
    return {
      d:
        `M${w * 0.17} ${h * 0.54} L${w * 0.17 + s} ${h} ` +
        `M${w * 0.27} ${h * 0.54} L${w * 0.27 + o} ${h} ` +
        `M${w * 0.63} ${h * 0.54} L${w * 0.63 + o} ${h} ` +
        `M${w * 0.73} ${h * 0.54} L${w * 0.73 + s} ${h}`,
    };
  });
  const p = (x, y) => `${w * x} ${h * y}`;
  return (
    <>
      {/* tail, hanging straight off the rump with a tuft on the end */}
      <Path
        d={`M${p(0.07, 0.29)} C ${p(0.03, 0.42)} ${p(0.02, 0.6)} ${p(0.04, 0.74)}`}
        stroke={INK}
        strokeWidth={h * 0.04}
        strokeLinecap="round"
        fill="none"
      />
      <Ellipse cx={w * 0.04} cy={h * 0.82} rx={w * 0.03} ry={h * 0.075} fill={INK} />
      <AnimatedPath
        animatedProps={props}
        stroke={INK}
        strokeWidth={h * 0.085}
        strokeLinecap="round"
        fill="none"
      />
      {/* Barrel body with a long, near-level back and a deep chest — the earlier version tapered
          to a wedge and carried a pointed hump, which read as a goat. Only a slight rise over the
          shoulder remains. */}
      <Path
        d={
          `M${p(0.05, 0.36)} ` +
          `C ${p(0.04, 0.26)} ${p(0.12, 0.22)} ${p(0.24, 0.22)} ` +
          `L ${p(0.5, 0.21)} ` +
          `C ${p(0.58, 0.18)} ${p(0.65, 0.16)} ${p(0.7, 0.21)} ` +
          `L ${p(0.79, 0.27)} ` +
          `C ${p(0.87, 0.28)} ${p(0.96, 0.31)} ${p(0.99, 0.37)} ` +
          `C ${p(1.0, 0.43)} ${p(0.96, 0.47)} ${p(0.9, 0.46)} ` +
          `L ${p(0.82, 0.41)} ` +
          `C ${p(0.77, 0.45)} ${p(0.74, 0.5)} ${p(0.71, 0.54)} ` +
          `L ${p(0.66, 0.57)} ` +
          `L ${p(0.2, 0.57)} ` +
          `C ${p(0.1, 0.56)} ${p(0.05, 0.48)} ${p(0.05, 0.36)} Z`
        }
        fill={INK}
      />
      {/* drooping ear, set behind the horns */}
      <Path d={`M${p(0.84, 0.32)} L${p(0.77, 0.31)} L${p(0.82, 0.39)} Z`} fill={INK} />
      {/* horns, sweeping up and back */}
      <Path
        d={`M${p(0.89, 0.29)} C ${p(0.91, 0.22)} ${p(0.95, 0.19)} ${p(0.98, 0.21)}`}
        stroke={INK}
        strokeWidth={h * 0.045}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d={`M${p(0.86, 0.31)} C ${p(0.87, 0.25)} ${p(0.91, 0.22)} ${p(0.94, 0.23)}`}
        stroke={INK}
        strokeWidth={h * 0.038}
        strokeLinecap="round"
        fill="none"
        opacity={0.75}
      />
    </>
  );
}

/** Leaner, head up, pricked ear and a tail carried high — everything the cow is not. */
function Dog({ w, h, phase, reach }) {
  const props = useAnimatedProps(() => {
    const s = Math.sin(phase.value * Math.PI * 2) * reach;
    const o = -s;
    return {
      d:
        `M${w * 0.24} ${h * 0.6} L${w * 0.24 + s} ${h} ` +
        `M${w * 0.34} ${h * 0.6} L${w * 0.34 + o} ${h} ` +
        `M${w * 0.62} ${h * 0.6} L${w * 0.62 + o} ${h} ` +
        `M${w * 0.72} ${h * 0.6} L${w * 0.72 + s} ${h}`,
    };
  });
  const p = (x, y) => `${w * x} ${h * y}`;
  return (
    <>
      <Path
        d={`M${p(0.2, 0.46)} C ${p(0.1, 0.36)} ${p(0.06, 0.2)} ${p(0.12, 0.12)}`}
        stroke={INK}
        strokeWidth={h * 0.07}
        strokeLinecap="round"
        fill="none"
      />
      <AnimatedPath
        animatedProps={props}
        stroke={INK}
        strokeWidth={h * 0.08}
        strokeLinecap="round"
        fill="none"
      />
      <Ellipse cx={w * 0.46} cy={h * 0.45} rx={w * 0.28} ry={h * 0.17} fill={INK} />
      <Path
        d={`M${p(0.66, 0.4)} L${p(0.8, 0.24)}`}
        stroke={INK}
        strokeWidth={h * 0.13}
        strokeLinecap="round"
      />
      <Circle cx={w * 0.83} cy={h * 0.22} r={h * 0.12} fill={INK} />
      <Path d={`M${p(0.79, 0.16)} L${p(0.78, 0.03)} L${p(0.87, 0.12)} Z`} fill={INK} />
      <Path
        d={`M${p(0.88, 0.24)} L${p(0.99, 0.26)}`}
        stroke={INK}
        strokeWidth={h * 0.08}
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
      stroke={LEAF}
      strokeWidth={w * 0.09}
      strokeLinecap="round"
    />
    <Ellipse cx={w * 0.5} cy={h * 0.38} rx={w * 0.42} ry={h * 0.3} fill={LEAF} />
    <Ellipse cx={w * 0.3} cy={h * 0.5} rx={w * 0.26} ry={h * 0.2} fill={LEAF} />
    <Ellipse cx={w * 0.72} cy={h * 0.5} rx={w * 0.26} ry={h * 0.2} fill={LEAF} />
  </>
);

const palm = (w, h) => (
  <>
    <Path
      d={`M${w * 0.5} ${h} Q ${w * 0.42} ${h * 0.5} ${w * 0.5} ${h * 0.24}`}
      stroke={LEAF}
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
        stroke={LEAF}
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
        stroke="#5B8923"
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
  laneX,
}) {
  const reach = w * 0.3;
  const phase = useGait(gaitPeriod(speed, reach) / pace, delay, reduced);
  // The cow and the dog have their own silhouettes — one generic quadruped with swappable horns
  // made both of them read as the same blob.
  return (
    <Placed left={left} baseY={baseY} w={w} h={h} opacity={opacity} laneX={laneX}>
      {kind === 'farmer' ? <Farmer w={w} h={h} phase={phase} reach={reach} /> : null}
      {kind === 'carrier' ? <Person w={w} h={h} phase={phase} reach={reach} load /> : null}
      {kind === 'sari' ? <Person w={w} h={h} phase={phase} reach={reach} skirt /> : null}
      {kind === 'person' || kind === 'child' ? (
        <Person w={w} h={h} phase={phase} reach={reach} />
      ) : null}
      {kind === 'cow' ? <Cow w={w} h={h} phase={phase} reach={reach * 0.5} /> : null}
      {kind === 'dog' ? <Dog w={w} h={h} phase={phase} reach={reach * 0.55} /> : null}
    </Placed>
  );
}

export function VillageRidge({ ridgeY }) {
  const reduced = useReducedMotion();
  const base = ridgeY + FOOT;

  // Sized and spaced from the reference: ~7 figures across the width at roughly 3% of screen
  // height. The old far lane added three more dim bodies on a third timeline, which just read as
  // clutter overtaking the real procession.
  const main = (k, laneX) => (
    <React.Fragment key={k}>
      <Villager
        kind="farmer"
        left={W * 0.05}
        baseY={base}
        w={19}
        h={27}
        speed={LANE.main}
        pace={1.04}
        reduced={reduced}
        laneX={laneX}
      />
      <Villager
        kind="cow"
        left={W * 0.18}
        baseY={base}
        w={33}
        h={21}
        speed={LANE.main}
        pace={0.82}
        delay={220}
        reduced={reduced}
        laneX={laneX}
        opacity={0.92}
      />
      <Villager
        kind="carrier"
        left={W * 0.35}
        baseY={base}
        w={19}
        h={27}
        speed={LANE.main}
        pace={0.94}
        delay={120}
        reduced={reduced}
        laneX={laneX}
      />
      <Villager
        kind="sari"
        left={W * 0.47}
        baseY={base}
        w={18}
        h={26}
        speed={LANE.main}
        pace={1.08}
        delay={420}
        reduced={reduced}
        laneX={laneX}
      />
      <Villager
        kind="dog"
        left={W * 0.59}
        baseY={base}
        w={18}
        h={11}
        speed={LANE.main}
        pace={1.45}
        delay={80}
        reduced={reduced}
        laneX={laneX}
        opacity={0.88}
      />
      <Villager
        kind="person"
        left={W * 0.72}
        baseY={base}
        w={19}
        h={27}
        speed={LANE.main}
        pace={0.97}
        delay={300}
        reduced={reduced}
        laneX={laneX}
      />
    </React.Fragment>
  );

  const near = (k, laneX) => (
    <React.Fragment key={k}>
      <Villager
        kind="carrier"
        left={W * 0.88}
        baseY={base + 3}
        w={21}
        h={30}
        speed={LANE.near}
        pace={0.95}
        delay={200}
        reduced={reduced}
        laneX={laneX}
      />
    </React.Fragment>
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
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
      {/* The village itself — a lit house and a smaller outbuilding, sized to the reference. One
          tiny dark hut was getting lost against the ridge. */}
      <View
        style={{
          position: 'absolute',
          left: W * 0.76,
          top: surfaceY(W * 0.76 + 15, base) - 24,
          width: 30,
          height: 24,
        }}
      >
        <Svg width={30} height={24}>
          {hut(30, 24)}
        </Svg>
      </View>
      <View
        style={{
          position: 'absolute',
          left: W * 0.68,
          top: surfaceY(W * 0.68 + 10, base) - 17,
          width: 21,
          height: 17,
        }}
      >
        <Svg width={21} height={17}>
          {hut(21, 17)}
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
      <Lane duration={38000} reduced={reduced} render={main} />
      <Lane duration={33000} reduced={reduced} render={near} />

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
