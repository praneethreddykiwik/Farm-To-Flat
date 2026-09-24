import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Small, Text } from '../ui';
import { colors, fonts, radius } from '../theme';
import { useSelector } from 'react-redux';
import { selectReducedMotion } from '../features/ui/uiSlice';

/**
 * The code the customer reads out at the door.
 *
 * It is read aloud, once, usually one-handed while holding a bag — so each digit gets its own tile
 * rather than one long letter-spaced string. That string was also being clipped: at 42px with no
 * explicit lineHeight the glyphs were taller than their box, and Android adds font padding on top.
 * Every tile sets its own lineHeight and turns that padding off, so a digit cannot be cut again.
 *
 * The digits pop in one after another and the card breathes gently afterwards, so the code is the
 * thing your eye lands on when the screen opens. Honours reduce-motion: then it simply appears.
 */
export function DeliveryCode({ code, cashDuePaise = 0 }) {
  const digits = String(code ?? '').split('');
  const reduced = useSelector(selectReducedMotion);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reduced || !digits.length) return undefined;
    // A slow breath, not a flash — it has to stay readable while someone copies it out.
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(pulse);
  }, [reduced, digits.length, pulse]);

  const breathe = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  if (!digits.length) return null;

  return (
    <Animated.View style={[styles.card, breathe]}>
      <Small muted>Show this code to the delivery partner</Small>
      <View
        style={styles.row}
        accessible
        accessibilityRole="text"
        accessibilityLabel={`Your delivery code is ${digits.join(' ')}`}
      >
        {digits.map((d, i) => (
          <Digit key={`${i}-${d}`} value={d} index={i} reduced={reduced} />
        ))}
      </View>
      {cashDuePaise > 0 ? (
        <Small style={styles.cash}>
          Keep ₹{Math.round(Number(cashDuePaise) / 100)} in cash ready
        </Small>
      ) : null}
    </Animated.View>
  );
}

/** One tile. Pops in after the tile before it, so the code reads left to right as it lands. */
function Digit({ value, index, reduced }) {
  const s = useSharedValue(reduced ? 1 : 0.4);
  const o = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    s.value = withDelay(index * 90, withSpring(1, { damping: 11, stiffness: 190 }));
    o.value = withDelay(index * 90, withTiming(1, { duration: 200 }));
  }, [index, reduced, s, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={[styles.tile, style]}>
      <Text style={styles.digit} allowFontScaling={false}>
        {value}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 20,
    padding: 18,
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.leaf,
    backgroundColor: colors.white,
  },
  row: { flexDirection: 'row', gap: 10, marginTop: 10 },
  tile: {
    width: 56,
    height: 68,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(122,168,62,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(122,168,62,0.35)',
  },
  digit: {
    fontFamily: fonts.mono,
    fontSize: 34,
    // Explicit line height + no font padding: this is what stops the glyph being clipped.
    lineHeight: 42,
    includeFontPadding: false,
    textAlignVertical: 'center',
    color: colors.leafDeep,
  },
  cash: { marginTop: 12, color: colors.tomato },
});
