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
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { ArrowRight, Leaf } from 'lucide-react-native';
import { Button, Glass, GlassPill, Small, Text } from '../../src/ui';
import { useGetCommunitiesQuery } from '../../src/api/api';
import { colors, fonts, radius } from '../../src/theme';

const { width: W, height: H } = Dimensions.get('window');

/** Slow, ambient "field" illustration: layered hills and a drifting sun. Pure vector, no image asset. */
function Field() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: 18000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [t]);
  const sun = useAnimatedStyle(() => ({
    transform: /** @type {any} */ ([{ translateY: t.value * 18 }, { translateX: t.value * 10 }]),
  }));
  const hillA = useAnimatedStyle(() => ({ transform: [{ translateX: -t.value * 14 }] }));
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={['#0B1510', '#12352A', '#1E7A4C']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[styles.sun, sun]}>
        <LinearGradient colors={[colors.sprout, '#F4E9B7']} style={styles.sunFill} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, hillA]}>
        <Svg width={W + 80} height={H} viewBox={`0 0 ${W + 80} ${H}`}>
          <Path
            d={`M-40 ${H * 0.62} C ${W * 0.2} ${H * 0.52}, ${W * 0.5} ${H * 0.7}, ${W + 80} ${H * 0.56} L ${W + 80} ${H} L -40 ${H} Z`}
            fill="#163D2C"
          />
        </Svg>
      </Animated.View>
      <HillFlow />
      <LinearGradient
        colors={['rgba(11,21,16,0)', 'rgba(11,21,16,0.85)']}
        style={[StyleSheet.absoluteFill, { top: H * 0.5 }]}
      />
      <FieldDetails />
    </View>
  );
}

/** The foreground hill — was a plain back-and-forth sway whose fixed 40px overhang ran out at one
 * end of the swing, showing a bare seam at the left edge. Rebuilt as two identical tiles (start/end
 * y match exactly) sliding left in one direction forever, so the silhouette has no edge to run out
 * of and reads as a continuously flowing ridge instead of a wave that snaps back. */
function HillFlow() {
  const hillTop = H * 0.72;
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withRepeat(withTiming(-W, { duration: 16000, easing: Easing.linear }), -1, false);
  }, [x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const amp = H * 0.028;
  const d = `M0 ${hillTop} C ${W * 0.22} ${hillTop - amp}, ${W * 0.28} ${hillTop + amp}, ${W * 0.5} ${hillTop} C ${W * 0.72} ${hillTop - amp}, ${W * 0.78} ${hillTop + amp}, ${W} ${hillTop} L ${W} ${H} L 0 ${H} Z`;
  const tileH = H - hillTop + 4;
  const tile = (key) => (
    <Svg key={key} width={W} height={tileH}>
      <Path d={d} fill="#1E7A4C" transform={`translate(0, -${hillTop})`} />
      <Circle cx={W * 0.78} cy={amp * 1.6} r={5} fill={colors.sprout} opacity={0.8} />
      <Circle cx={W * 0.2} cy={amp * 2.6} r={3} fill={colors.sprout} opacity={0.6} />
      <Circle cx={W * 0.5} cy={amp * 3.2} r={4} fill={colors.sprout} opacity={0.7} />
    </Svg>
  );
  return (
    <View style={[styles.hillWrap, { top: hillTop }]} pointerEvents="none">
      <Animated.View style={[{ flexDirection: 'row', width: W * 2 }, style]}>
        {tile('a')}
        {tile('b')}
      </Animated.View>
    </View>
  );
}

/** Minimalist, static foreground details on the ridge — a few grass/weed tufts, one small farmer
 * silhouette with a soft ground shadow. Fixed in place (not tied to HillFlow's scroll) so they read
 * as being "in front of" the field rather than drifting with it. Flat shapes only, no texture. */
function FieldDetails() {
  // The CTA card starts right below the hero copy, so the only place the hill (and anything
  // standing on it) is actually visible is the thin strip between the paragraph and the card —
  // match HillFlow's ridge exactly, clear of both.
  const ridgeY = H * 0.72;
  const tuft = (cx, s = 1) => (
    <Path
      key={cx}
      d={`M${cx} ${ridgeY} C ${cx - 3 * s} ${ridgeY - 9 * s}, ${cx - 1 * s} ${ridgeY - 15 * s}, ${cx} ${ridgeY - 17 * s} C ${cx + 1 * s} ${ridgeY - 15 * s}, ${cx + 3 * s} ${ridgeY - 9 * s}, ${cx + 4 * s} ${ridgeY}`}
      stroke={colors.sprout}
      strokeWidth={1.4 * s}
      strokeLinecap="round"
      fill="none"
      opacity={0.55}
    />
  );
  const farmerX = W * 0.87;
  const headY = ridgeY - 13;
  return (
    <Svg
      width={W}
      height={H}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      viewBox={`0 0 ${W} ${H}`}
    >
      {tuft(W * 0.06, 0.65)}
      {tuft(W * 0.11, 0.85)}
      {/* ground shadow, body, head, then a wide hat brim — a small, rounded, friendly silhouette */}
      <Ellipse cx={farmerX} cy={ridgeY + 1} rx={6} ry={1.8} fill="#0B1510" opacity={0.3} />
      <Path
        d={`M${farmerX - 3.5} ${ridgeY} L${farmerX - 2.5} ${headY + 2} Q${farmerX} ${headY - 1.5} ${farmerX + 2.5} ${headY + 2} L${farmerX + 3.5} ${ridgeY} Z`}
        fill="#12241B"
        opacity={0.7}
      />
      <Circle cx={farmerX} cy={headY - 2.5} r={2.3} fill="#12241B" opacity={0.7} />
      <Ellipse cx={farmerX} cy={headY - 4.5} rx={4.5} ry={1.3} fill="#12241B" opacity={0.7} />
    </Svg>
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
          style={{ marginTop: 28 }}
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
            <Button
              title="Ready? Let's go"
              variant="accent"
              onPress={() => router.push('/(auth)/phone')}
              trailing={<ArrowRight size={18} color={colors.ink} />}
            />
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
  card: { padding: 20 },
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
  hillWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
});
