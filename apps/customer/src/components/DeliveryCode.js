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
 * The digits rise in one after another and the card's border glows gently afterwards, so the code
 * is the thing your eye lands on when the screen opens. Honours reduce-motion: then it simply appears.
 *
 * No scale transforms touch the text (21 Nov 2026). iOS draws a scaled view as a bitmap, so digits
 * that sprang up from 40% size, inside a card that "breathed" between 100% and 102% for ever, looked
 * blurry until the phone re-drew them. Now the digits only fade and slide, and the pulse is a
 * separate ring's opacity, so the numbers are drawn sharp from the first frame.
 */
export function DeliveryCode({ code, cashDuePaise = 0 }) {
  const digits = String(code ?? '').split('');
  const reduced = useSelector(selectReducedMotion);
  const glow = useSharedValue(0);

  useEffect(() => {
    if (reduced || !digits.length) return undefined;
    // A slow glow on the border, not a flash, and never a size change on the digits themselves.
    glow.value = withDelay(
      700,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(glow);
  }, [reduced, digits.length, glow]);

  const ring = useAnimatedStyle(() => ({ opacity: glow.value }));
  if (!digits.length) return null;

  return (
    <View style={styles.card}>
      <Animated.View pointerEvents="none" style={[styles.ring, ring]} />
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
    </View>
  );
}

/** One tile. Rises in after the tile before it, so the code reads left to right as it lands. */
function Digit({ value, index, reduced }) {
  const y = useSharedValue(reduced ? 0 : 10);
  const o = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    y.value = withDelay(index * 90, withSpring(0, { damping: 14, stiffness: 190 }));
    o.value = withDelay(index * 90, withTiming(1, { duration: 220 }));
  }, [index, reduced, y, o]);
  // translateY moves the layer without resampling it, so the digit stays crisp while it moves.
  const style = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ translateY: y.value }],
  }));
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
  ring: {
    position: 'absolute',
    top: -1.5,
    left: -1.5,
    right: -1.5,
    bottom: -1.5,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: colors.leaf,
  },
  row: { flexDirection: 'row', gap: 10, marginTop: 10 },
  tile: {
    // Flex so six tiles fit any screen — 6×56 + gaps overflowed narrow phones. Caps at 56 on wide
    // screens; shrinks (down to minWidth 0) on small ones so the outer digits never clip.
    flex: 1,
    minWidth: 0,
    maxWidth: 56,
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
