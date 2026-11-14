import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { Button, Small, Text } from '../ui';
import { colors, fonts } from '../theme';
import { kv } from '../lib/kv';
import * as SplashScreen from 'expo-splash-screen';

/**
 * The opening of the app.
 *
 * Every launch: the three leaves of the mark unfurl one after another, and "fooducia" is written
 * in beside them — about a second and a half, on the same off-white as the system splash screen
 * underneath, so the hand-over from one to the other is invisible.
 *
 * The very first launch on a phone: the logo then rises and three short lines say what Fooducia
 * is, with one button to start. That is shown once and remembered on the phone; after it, only
 * the logo.
 *
 * It takes the system splash down itself, the moment it is on screen, and starts drawing; it
 * steps aside only once the app behind it is ready (`start`). The screens underneath load meanwhile.
 */

const SEEN_KEY = 'ui.introSeen.v1';
const readSeen = () => {
  try {
    return !!kv.getString(SEEN_KEY);
  } catch {
    return true; // a phone that cannot remember should not be shown the introduction every time
  }
};
const markSeen = () => {
  try {
    kv.setString(SEEN_KEY, new Date().toISOString());
  } catch {
    /* nothing to do */
  }
};

const LEAVES = [
  { src: require('../../assets/brand/leaf-top.png'), x: 195.63, y: 55, w: 654.38, h: 570.63 },
  { src: require('../../assets/brand/leaf-mid.png'), x: 207.5, y: 395, w: 526.25, h: 402.5 },
  { src: require('../../assets/brand/leaf-ember.png'), x: 218.13, y: 671.25, w: 265, h: 273.13 },
];

const MARK = 132;
const WORD_W = 236;
const WORD_ASPECT = 960 / 208;

const LINES = [
  'Vegetables harvested after you order.',
  'Order by evening — picked at first light.',
  'At your door by breakfast, in your own language.',
];

/** One leaf, growing from the foot of its stem. */
function Leaf({ leaf, delay, go }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (go) p.value = withDelay(delay, withSpring(1, { damping: 13, stiffness: 120, mass: 0.9 }));
  }, [go, delay, p]);
  const k = MARK / 1000;
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 3),
    transform: /** @type {any} */ ([
      { rotate: `${(1 - p.value) * -55}deg` },
      { scale: 0.35 + 0.65 * p.value },
    ]),
  }));
  return (
    <Animated.Image
      source={leaf.src}
      resizeMode="contain"
      style={[
        {
          position: 'absolute',
          left: leaf.x * k,
          top: leaf.y * k,
          width: leaf.w * k,
          height: leaf.h * k,
          transformOrigin: '4% 96%',
        },
        style,
      ]}
    />
  );
}

/** The official wordmark, as vectors (from the brand SVG). */
function Wordmark({ width }) {
  return (
    <Svg width={width} height={width / WORD_ASPECT} viewBox="20 396 960 208">
      <Defs>
        <LinearGradient
          id="bi-a"
          x1="174.88"
          y1="547.72"
          x2="208.87"
          y2="567.45"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#fabc15" />
          <Stop offset="1" stopColor="#ed2725" />
        </LinearGradient>
        <LinearGradient
          id="bi-b"
          x1="239.05"
          y1="494.99"
          x2="383.17"
          y2="494.99"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#fabc15" />
          <Stop offset="1" stopColor="#ed2725" />
        </LinearGradient>
        <LinearGradient
          id="bi-c"
          x1="798"
          y1="414.6"
          x2="813.79"
          y2="455.82"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#fabc15" />
          <Stop offset="1" stopColor="#ed2725" />
        </LinearGradient>
      </Defs>
      <G fill={INK}>
        <Path d="M174,423.51A20.08,20.08,0,0,1,154,443.57h-31a24.55,24.55,0,0,0-24.56,24.56v2.95H119.7a18.59,18.59,0,1,1,0,37.17H98.38v65.23c0,12.32-9.640,22.88-21.94,23.13a22.38,22.38,0,0,1-22.79-22.38v-66h-9.6a18.59,18.59,0,1,1,0-37.17h9.6v-4.53a63.150,63.150,0,0,1,63.27-63.16l37,.06A20,20,0,0,1,174,423.51Z" />
        <Path d="M255.54,560.89l-.19.27c-2.08,2.83-21,27.1-58.89,23.08-14.05-1.49-25.62-6.43-34.32-13.36-13.79-10.94-20.48-26.89-18.64-42.22,2.49-20.81,25.33-43,59.68-28.5,0,0-15.36,10.63-18.41,24.29a19.92,19.920,0,0,0,2.61,15.38C199.780,560,219.510,548,219.510,548L255,560.7Z" />
        <Path d="M151.34,502.09s51.84-34.41,89.22,19l29.93-27.63S245.87,465,221.81,462.2C189.8,458.47,164.15,475.14,151.34,502.09Z" />
        <Path d="M378.43,557.94S331.33,587,294,533.65L264,563.16s17.25,21.72,41.15,25.6C334.56,593.53,364,587.52,378.43,557.94Z" />
        <Path d="M370,558.72c-28.78,8.06-41.780-4.93-41.780-4.93,13.170-7.69,20.440-16.63,23.620-25,5.420-14.21-.89-26.74-10-28.6a13.78,13.78,0,0,0-4-.23c-15.94,1-37.26,25.14-66,49.4-28.55,24.11-40.23,33.22-63.59,35.85s-40.61-11.52-40.61-11.52,19,6.86,71.34-44.3c1.6-1.54,3.24-3.18,4.91-4.85,52.51-52.86,80.8-76.63,120.75-57.23a45.8,45.8,0,0,1,18.46,16.24C400.71,510.25,391.32,552.74,370,558.72Z" />
        <Path d="M518.88,422.66A21,21,0,0,0,483,437.53v28.32a67.83,67.830,0,0,0-24.58-4.57c-36.83,0-66.67,29.11-66.67,65s29.84,65,66.67,65c31.34,0,57.64-21.12,64.76-49.55a62.74,62.74,0,0,0,1.92-15.47V437.53A20.92,20.92,0,0,0,518.88,422.66ZM456.73,555.37a29.07,29.070,0,1,1,29.06-29A29.07,29.07,0,0,1,456.73,555.37Z" />
        <Path d="M659.55,483.58V535c0,.66,0,1.34,0,2-1.24,29.32-29.75,52.78-64.76,52.78S531.26,566.35,530,537c0-.66,0-1.34,0-2V483.58a21.05,21.050,0,0,1,42.1,0V537s.32,17.56,22.73,17.57c22,0,22.64-17.57,22.64-17.57V483.58a21.05,21.05,0,1,1,42.1,0Z" />
        <Path d="M766.85,582.09A65.77,65.77,0,1,1,766,471.35a18.55,18.55,0,0,1,3,28.76h0a18.47,18.47,0,0,1-22.89,2.66,28.51,28.51,0,0,0-16.5-4.37,28.61,28.61,0,0,0,1.25,57.2,28.51,28.51,0,0,0,15.88-4.8,18.35,18.35,0,0,1,22,1.52h0A18.61,18.61,0,0,1,766.85,582.09Z" />
        <Rect x="782.79" y="463.19" width="41.77" height="128.77" rx="11.1" />
        <Path d="M957.53,486.53c-17.31-18.2-48.32-25.4-71.51-20.92h0a62.68,62.68,0,1,0,48.12,110.9,20.88,20.88,0,0,0,40.41-7.4V537S974.85,504.73,957.53,486.53Zm-57.34,69.71a28.66,28.66,0,1,1,28.66-28.66A28.65,28.65,0,0,1,900.19,556.24Z" />
      </G>
      <Path
        d="M254.48,563.32c-2.18,2.74-22.07,26.27-59.73,20.79-14-2-25.35-7.41-33.78-14.68-5.66-24.29,12.52-38.84,24.41-45.52a19.88,19.88,0,0,0,2,15.47c11.61,20.6,31.79,9.43,31.79,9.43l35,14Z"
        fill="url(#bi-a)"
      />
      <Path
        d="M383.17,483.54c-2.41,40.82-31.33,45.24-31.33,45.24h0c5.42-14.21-.89-26.74-10-28.6a13.78,13.78,0,0,0-4-.23c-36.41-4.43-76.76,12.52-98.84,29.43,1.6-1.54,3.24-3.180,4.91-4.85,52.51-52.86,80.8-76.63,120.75-57.23A45.8,45.8,0,0,1,383.17,483.54Z"
        fill="url(#bi-b)"
      />
      <Circle cx="804.33" cy="431.12" r="27.13" fill="url(#bi-c)" />
    </Svg>
  );
}

const INK = '#05472F';

/**
 * @param {{ start: boolean }} props  `start`: the app behind is ready to be seen.
 */
export function BrandIntro({ start }) {
  const [firstRun] = useState(() => !readSeen());
  const [gone, setGone] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [showLines, setShowLines] = useState(false);

  const word = useSharedValue(0); // the wordmark being written in, 0 → 1
  const lift = useSharedValue(0); // the logo rising to make room for the introduction
  const out = useSharedValue(1); // the whole cover, 1 = shown

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => setReduce(!!v))
      .catch(() => {});
  }, []);

  // The drawing starts the moment this is on screen — it does not wait for the app behind it, so
  // there is never a blank screen between the system splash and the logo. Only the stepping aside
  // waits for the app to be ready (`start`).
  const [played, setPlayed] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const onShown = () => {
    if (played) return;
    setPlayed(true);
    SplashScreen.hideAsync().catch(() => {});
  };

  useEffect(() => {
    if (!played) return undefined;
    const fast = reduce ? 0.4 : 1;
    word.value = withDelay(
      520 * fast,
      withTiming(1, { duration: 700 * fast, easing: Easing.out(Easing.cubic) }),
    );
    const t = setTimeout(() => setDrawn(true), 1650 * fast);
    return () => clearTimeout(t);
  }, [played, reduce, word]);

  useEffect(() => {
    if (!drawn || !start) return undefined;
    if (firstRun) {
      lift.value = withTiming(1, { duration: 650, easing: Easing.inOut(Easing.cubic) });
      const t = setTimeout(() => setShowLines(true), 550);
      return () => clearTimeout(t);
    }
    // Every other launch: the logo has had its moment and the app is ready — step aside.
    out.value = withTiming(0, { duration: 380, easing: Easing.in(Easing.quad) }, (done) => {
      if (done) runOnJS(setGone)(true);
    });
    return undefined;
  }, [drawn, start, firstRun, lift, out]);

  const finish = () => {
    markSeen();
    out.value = withTiming(0, { duration: 420, easing: Easing.in(Easing.quad) }, (done) => {
      if (done) runOnJS(setGone)(true);
    });
  };

  const cover = useAnimatedStyle(() => ({ opacity: out.value }));
  const lockup = useAnimatedStyle(() => ({
    transform: /** @type {any} */ ([
      { translateY: -lift.value * 150 },
      { scale: 1 - lift.value * 0.12 },
    ]),
  }));
  const wordClip = useAnimatedStyle(() => ({ width: WORD_W * word.value }));
  const wordIn = useAnimatedStyle(() => ({
    opacity: Math.min(1, word.value * 2),
    transform: [{ translateY: (1 - word.value) * 8 }],
  }));

  if (gone) return null;

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.root, cover]}
      pointerEvents={firstRun ? 'auto' : 'none'}
      accessibilityViewIsModal={firstRun}
    >
      <Animated.View
        style={[styles.lockup, lockup]}
        accessible
        accessibilityLabel="Fooducia"
        onLayout={onShown}
      >
        <View style={{ width: MARK, height: MARK }}>
          {LEAVES.map((leaf, i) => (
            <Leaf key={i} leaf={leaf} delay={i * 140} go={played} />
          ))}
        </View>
        <Animated.View style={[styles.wordWrap, wordIn]}>
          <Animated.View style={[{ overflow: 'hidden', height: WORD_W / WORD_ASPECT }, wordClip]}>
            <Wordmark width={WORD_W} />
          </Animated.View>
        </Animated.View>
      </Animated.View>

      {firstRun && showLines ? (
        <View style={styles.intro}>
          {LINES.map((line, i) => (
            <Line key={line} text={line} delay={i * 260} />
          ))}
          <FadeUp delay={LINES.length * 260 + 150} style={{ marginTop: 34, alignSelf: 'stretch' }}>
            <Button title="Get started" variant="primary" onPress={finish} />
            <Small muted center style={{ marginTop: 14 }}>
              Farm to flat · Hyderabad
            </Small>
          </FadeUp>
        </View>
      ) : null}
    </Animated.View>
  );
}

/** @param {{ delay: number, style?: any, children?: any }} props */
function FadeUp({ delay, style = undefined, children }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
  }, [delay, p]);
  const a = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * 14 }],
  }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

function Line({ text, delay }) {
  return (
    <FadeUp delay={delay}>
      <Text variant="h3" center style={styles.line}>
        {text}
      </Text>
    </FadeUp>
  );
}

const styles = StyleSheet.create({
  root: {
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockup: { alignItems: 'center' },
  wordWrap: { marginTop: 10, width: WORD_W, alignItems: 'flex-start' },
  intro: {
    position: 'absolute',
    left: 32,
    right: 32,
    top: '50%',
    marginTop: 6,
    alignItems: 'center',
    gap: 12,
  },
  line: { fontFamily: fonts.display, color: colors.ink, lineHeight: 30 },
});
