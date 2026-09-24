import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import { ArrowRight, Leaf } from 'lucide-react-native';
import { Button, Glass, GlassPill, Small, Text } from '../../src/ui';
import {
  GROUND_AMP,
  VillageRidge,
  groundPathD,
  useReducedMotion,
} from '../../src/components/VillageRidge';
import { useGetCommunitiesQuery } from '../../src/api/api';
import { colors, fonts, radius } from '../../src/theme';

const { width: W, height: H } = Dimensions.get('window');

/** The crest everything in the scene stands on — the hill, the villagers, the trees, the hut. */
const RIDGE_Y = H * 0.7;

/** Slow, ambient "field" illustration: layered hills and a drifting sun. Pure vector, no image asset. */
function Field() {
  const reduced = useReducedMotion();
  // One clock for the ground, shared by the hill that draws it and the villagers that stand on it.
  const ground = useSharedValue(0);
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(
      withTiming(1, { duration: 18000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [t, reduced]);
  const sun = useAnimatedStyle(() => ({
    transform: /** @type {any} */ ([{ translateY: t.value * 18 }, { translateX: t.value * 10 }]),
  }));
  const hillA = useAnimatedStyle(() => ({ transform: [{ translateX: -t.value * 14 }] }));
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Sampled from the reference: the sky is darkest overhead and warms to #658C3B right at
          the crest, which is what gives the scene its dawn. The old ramp did the opposite — it
          brightened toward the BOTTOM of the screen, washing the whole foreground mid-green. */}
      <LinearGradient
        colors={['#0B1510', '#17331F', '#2C5832', '#4F7736', '#658C3B']}
        locations={[0, 0.34, 0.53, 0.64, 0.7]}
        style={StyleSheet.absoluteFill}
      />
      <MoonGlow reduced={reduced} />
      <Animated.View style={[styles.sun, sun]}>
        <LinearGradient colors={[colors.sprout, '#F4E9B7']} style={styles.sunFill} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, hillA]}>
        <Svg width={W + 80} height={H} viewBox={`0 0 ${W + 80} ${H}`}>
          <Path
            d={`M-40 ${H * 0.62} C ${W * 0.2} ${H * 0.52}, ${W * 0.5} ${H * 0.7}, ${W + 80} ${H * 0.56} L ${W + 80} ${H} L -40 ${H} Z`}
            fill="#2F5A31"
          />
        </Svg>
      </Animated.View>
      <HillFlow reduced={reduced} ground={ground} />
      <VillageRidge ridgeY={RIDGE_Y} ground={ground} />
      <FrontBank />
    </View>
  );
}

/**
 * The moon's halo breathes; the moon itself never scales. Scaling the disc would read as the moon
 * moving toward you — only the light around it should swell and settle.
 */
function MoonGlow({ reduced }) {
  const g = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    g.value = withRepeat(
      withTiming(1, { duration: 10000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [g, reduced]);
  const style = useAnimatedStyle(() => ({
    // Deliberately faint: the moon already carries a shadow glow of its own, and stacking a bright
    // halo on top washed out the whole upper third. This only has to breathe, not light the scene.
    opacity: 0.16 + g.value * 0.12,
    transform: [{ scale: 1 + g.value * 0.06 }],
  }));
  const s = 300;
  return (
    <Animated.View pointerEvents="none" style={[styles.moonGlow, style]}>
      <Svg width={s} height={s}>
        <Defs>
          <RadialGradient id="moonHalo" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={colors.sprout} stopOpacity={0.3} />
            <Stop offset="45%" stopColor={colors.sprout} stopOpacity={0.07} />
            <Stop offset="100%" stopColor={colors.sprout} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={s / 2} cy={s / 2} r={s / 2} fill="url(#moonHalo)" />
      </Svg>
    </Animated.View>
  );
}

/** The foreground hill — was a plain back-and-forth sway whose fixed 40px overhang ran out at one
 * end of the swing, showing a bare seam at the left edge. Rebuilt as two identical tiles (start/end
 * y match exactly) sliding left in one direction forever, so the silhouette has no edge to run out
 * of and reads as a continuously flowing ridge instead of a wave that snaps back. */
/** The lit bank across the very bottom, in front of everything and behind the card. */
function FrontBank() {
  const h = H * 0.26;
  const d = `M0 ${h * 0.42} C ${W * 0.3} ${h * 0.12}, ${W * 0.66} ${h * 0.6} ${W} ${h * 0.26} L ${W} ${h} L 0 ${h} Z`;
  return (
    <Svg
      width={W}
      height={h}
      style={{ position: 'absolute', left: 0, bottom: 0 }}
      pointerEvents="none"
    >
      <Path d={d} fill="#255328" />
    </Svg>
  );
}

function HillFlow({ reduced, ground }) {
  const hillTop = RIDGE_Y;
  useEffect(() => {
    if (reduced) return;
    // A minute per screen width — slow enough that the villagers, who cross in 38s, are still the
    // fastest thing in the scene. `ground` is shared with the village: the same value that slides
    // this hill is what the walkers subtract to find where the surface is beneath them, so the
    // ground can drift without anyone sliding off it.
    ground.value = 0;
    ground.value = withRepeat(withTiming(W, { duration: 60000, easing: Easing.linear }), -1, false);
  }, [ground, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: ground.value }] }));
  const tileH = H - hillTop + GROUND_AMP + 4;
  const d = groundPathD(tileH);
  const tile = (key) => (
    <Svg key={key} width={W} height={tileH}>
      <Defs>
        <SvgGradient id="ridgeLight" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#2E6A2B" />
          <Stop offset="12%" stopColor="#04492B" />
          <Stop offset="42%" stopColor="#032C1E" />
          <Stop offset="100%" stopColor="#032A1B" />
        </SvgGradient>
      </Defs>
      <Path d={d} fill="url(#ridgeLight)" />
    </Svg>
  );
  return (
    <View style={[styles.hillWrap, { top: hillTop - GROUND_AMP }]} pointerEvents="none">
      <Animated.View style={[{ flexDirection: 'row', width: W * 2, marginLeft: -W }, style]}>
        {tile('a')}
        {tile('b')}
      </Animated.View>
    </View>
  );
}

/**
 * A slow halo behind the call to action. The button must not scale — a control that changes size
 * under the thumb is a control you can miss — so only the light around it moves, at a few percent.
 */
function CtaGlow({ children }) {
  const reduced = useReducedMotion();
  const g = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    g.value = withRepeat(
      withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [g, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: 0.05 + g.value * 0.03 }));
  return (
    <View>
      <Animated.View pointerEvents="none" style={[styles.ctaGlow, style]} />
      {children}
    </View>
  );
}

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Live serviceable-community count (public endpoint) — this was a hard-coded "3" while the admin
  // panel already listed five. Shows the real number once loaded.
  const communities = useGetCommunitiesQuery();
  const communityCount = communities.data?.communities?.length;
  return (
    <View style={styles.root}>
      <Field />
      <View
        style={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}
      >
        <Animated.View
          entering={FadeInDown.duration(500).springify().damping(18)}
          style={styles.brand}
        >
          <GlassPill tone="dark">
            <Leaf size={14} color={colors.sprout} />
            <Small color={colors.sprout} style={{ fontFamily: fonts.bodyMedium }}>
              Farm to Flat · Hyderabad
            </Small>
          </GlassPill>
        </Animated.View>

        <View style={{ flex: 1 }} />

        <Animated.View entering={FadeInUp.delay(120).duration(560).springify().damping(18)}>
          <Text style={styles.hero}>
            Picked tonight.{'\n'}At your door{'\n'}by breakfast.
          </Text>
          <Small
            color="rgba(243,245,239,0.72)"
            style={{ marginTop: 14, maxWidth: 300, lineHeight: 20 }}
          >
            Vegetables, greens and meat harvested after you order, delivered to your flat in a
            window you choose.
          </Small>
        </Animated.View>

        <Animated.View
          entering={FadeInUp.delay(260).duration(560).springify().damping(18)}
          // The village walks in the gap between this card and the paragraph above it. At the old
          // 28 there was no gap — the figures were pinned to the card's top edge.
          style={{ marginTop: 76 }}
        >
          <Glass tone="dark" radius={radius.xl} liquid innerStyle={styles.card}>
            <View style={styles.stats}>
              {[
                [communityCount != null ? String(communityCount) : '–', 'communities'],
                ['40+', 'farm items'],
                ['2', 'daily windows'],
              ].map(([n, l]) => (
                <View key={l} style={{ flex: 1 }}>
                  <Text style={styles.stat}>{n}</Text>
                  <Small color="rgba(243,245,239,0.6)">{l}</Small>
                </View>
              ))}
            </View>
            <CtaGlow>
              <Button
                title="Ready? Let's go"
                variant="accent"
                onPress={() => router.push('/(auth)/phone')}
                trailing={<ArrowRight size={18} color={colors.ink} />}
              />
            </CtaGlow>
            <Small center color="rgba(243,245,239,0.5)" style={{ marginTop: 12 }}>
              Sign in with your mobile number. No password, ever.
            </Small>
          </Glass>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.night },
  content: { flex: 1, paddingHorizontal: 20 },
  brand: { alignSelf: 'flex-start' },
  hero: {
    fontFamily: fonts.display,
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -1,
    color: colors.inkOnDark,
  },
  // The glass tone blurs whatever is behind it, and over a green hill that just returns more
  // green — the panel vanished entirely. The reference card is an explicit dark slab (#042115)
  // read against lighter ground, so give it a real fill instead of relying on the blur.
  card: { padding: 20, backgroundColor: 'rgba(4, 33, 21, 0.9)' },
  stats: { flexDirection: 'row', marginBottom: 18 },
  // lineHeight is REQUIRED for Fraunces (a tall display serif) — without it iOS clips the tops of the
  // numerals. Matches the type-scale convention of fontSize + 4 (see packages/tokens type scale).
  stat: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 30,
    color: colors.sprout,
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  sun: {
    position: 'absolute',
    top: H * 0.16,
    right: W * 0.14,
    width: 120,
    height: 120,
    borderRadius: 60,
    shadowColor: colors.sprout,
    shadowOpacity: 0.6,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 0 },
  },
  sunFill: { flex: 1, borderRadius: 60 },
  moonGlow: {
    position: 'absolute',
    top: H * 0.16 + 60 - 150,
    right: W * 0.14 + 60 - 150,
    width: 300,
    height: 300,
  },
  hillWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  ctaGlow: {
    position: 'absolute',
    left: -12,
    right: -12,
    top: -10,
    bottom: -10,
    borderRadius: 999,
    backgroundColor: colors.sprout,
    shadowColor: colors.sprout,
    shadowOpacity: 0.9,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
  },
});
