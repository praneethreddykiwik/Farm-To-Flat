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
import Svg, { Circle, Path } from 'react-native-svg';
import { ArrowRight, Leaf } from 'lucide-react-native';
import { Button, Glass, GlassPill, Small, Text } from '../../src/ui';
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
  const hillB = useAnimatedStyle(() => ({ transform: [{ translateX: t.value * 22 }] }));
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
      <Animated.View style={[StyleSheet.absoluteFill, hillB]}>
        <Svg width={W + 80} height={H} viewBox={`0 0 ${W + 80} ${H}`}>
          <Path
            d={`M-40 ${H * 0.72} C ${W * 0.3} ${H * 0.62}, ${W * 0.6} ${H * 0.82}, ${W + 80} ${H * 0.68} L ${W + 80} ${H} L -40 ${H} Z`}
            fill="#1E7A4C"
          />
          <Circle cx={W * 0.78} cy={H * 0.7} r={5} fill={colors.sprout} opacity={0.8} />
          <Circle cx={W * 0.2} cy={H * 0.76} r={3} fill={colors.sprout} opacity={0.6} />
          <Circle cx={W * 0.5} cy={H * 0.8} r={4} fill={colors.sprout} opacity={0.7} />
        </Svg>
      </Animated.View>
      <LinearGradient
        colors={['rgba(11,21,16,0)', 'rgba(11,21,16,0.85)']}
        style={[StyleSheet.absoluteFill, { top: H * 0.5 }]}
      />
    </View>
  );
}

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
                ['3', 'communities'],
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
  stat: { fontFamily: fonts.display, fontSize: 26, color: colors.sprout, letterSpacing: -0.5 },
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
});
