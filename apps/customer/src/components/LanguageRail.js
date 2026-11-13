import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '../ui';
import { colors, fonts } from '../theme';
import { RAIL_WORDS } from '../lib/i18n';
import { useSelector } from 'react-redux';
import { selectReducedMotion } from '../features/ui/uiSlice';
import { useIsFocused } from 'expo-router';
import { lowEnd } from '../lib/deviceTier';

/**
 * A strip of the same few phrases drifting past in English, Hindi and Telugu, looping forever.
 *
 * It exists to say "this shop speaks your language" at a glance — a shopper who reads Telugu sees
 * their own script go by without having to find a setting first.
 *
 * The loop is seamless because the content is rendered TWICE and the track is translated by exactly
 * one copy's width before snapping back: at the moment it resets, the second copy is sitting where
 * the first one started, so there is no visible jump. Measuring the real width (rather than guessing
 * from character counts) is what keeps that true in three different scripts.
 *
 * @param {object} props
 * @param {number} [props.speed]  points per second
 * @param {any} [props.scrollY]  how far the page holding the strip has scrolled (a shared value)
 * @param {any} [props.endY]  the scroll distance at which the strip has left the screen
 */
export function LanguageRail({ speed = 42, scrollY, endY }) {
  const reduced = useSelector(selectReducedMotion);
  const focused = useIsFocused();
  // Whether the strip is still on screen, worked out from how far the page has scrolled. Kept in
  // here so that crossing the line redraws this strip and nothing else.
  const [inView, setInView] = useState(true);
  useAnimatedReaction(
    () => !scrollY || !endY || scrollY.value < endY.value,
    (now, before) => {
      if (now !== before) runOnJS(setInView)(now);
    },
  );
  // It moves only while someone can see it move. Left running it never stops: scrolled far down
  // the catalog, or with another tab in front, it was still asking for a new frame sixty times a
  // second — which is what "the screen is busy" means to a phone, and what a cheap one cannot
  // spare. On a phone to go easy on it does not move at all; the three scripts are still there to
  // be read.
  const still = reduced || lowEnd;
  const run = inView && focused && !still;
  const x = useSharedValue(0);
  const [w, setW] = useState(0);

  // One flat list: each phrase in all three scripts, interleaved so the languages alternate rather
  // than appearing in three separate blocks.
  const items = useMemo(() => RAIL_WORDS.flatMap((w) => [w.en, w.hi, w.te]).filter(Boolean), []);

  useEffect(() => {
    cancelAnimation(x);
    x.value = 0;
    if (!w || !run) return undefined;
    x.value = withRepeat(
      withTiming(-w, { duration: (w / speed) * 1000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(x);
  }, [run, speed, w, x]);

  const onLayout = (e) => {
    const next = Math.round(e.nativeEvent.layout.width);
    if (next && next !== w) setW(next);
  };

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View style={styles.root} accessibilityRole="text" accessibilityLabel="Fresh from the farm">
      <Animated.View style={[styles.track, style]}>
        <RailCopy items={items} onLayout={onLayout} />
        {/* The second copy is what makes the loop seamless; it must not be read out twice. */}
        <RailCopy items={items} ariaHidden />
      </Animated.View>
    </View>
  );
}

/**
 * One pass of the words. Rendered twice — see the loop note above.
 * @param {{ items: string[], onLayout?: (e: any) => void, ariaHidden?: boolean }} props
 */
function RailCopy({ items, onLayout, ariaHidden }) {
  return (
    <View
      style={styles.copy}
      onLayout={onLayout}
      accessibilityElementsHidden={ariaHidden}
      importantForAccessibility={ariaHidden ? 'no-hide-descendants' : 'auto'}
    >
      {items.map((word, i) => (
        <View key={`${word}-${i}`} style={styles.item}>
          <Text style={styles.word}>{word}</Text>
          <View style={styles.dot} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden', height: 26, justifyContent: 'center' },
  track: { flexDirection: 'row' },
  copy: { flexDirection: 'row', alignItems: 'center' },
  item: { flexDirection: 'row', alignItems: 'center' },
  word: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 20,
    color: colors.ink2,
    opacity: 0.75,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.leaf,
    marginHorizontal: 12,
    opacity: 0.6,
  },
});
