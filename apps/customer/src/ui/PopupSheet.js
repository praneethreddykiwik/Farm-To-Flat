import React, { useCallback, useEffect, useImperativeHandle } from 'react';
import { BackHandler, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import { colors } from '../theme';

/**
 * A screen shown as a sheet: it rises over the page you came from, which stays in view above it,
 * dimmed — so it reads as "this is on top of where I was", not "I have gone somewhere else".
 *
 * On iPhone the system draws this (the basket is a native form sheet). On Android the same screen
 * simply opened as a full page, which is why the basket felt like a different thing there. Android
 * has a native sheet too, but how it sizes its content and shares scrolling with a list inside it
 * varies from phone to phone, and this goes to every phone at once. So the route is presented as a
 * see-through screen and the sheet is drawn here, where it behaves the same everywhere:
 *
 *  - it slides up, the page behind dims; both by moving one number on the UI thread. The route
 *    itself is given no animation of its own — a fade of the whole screen on top of the slide was
 *    the same journey paid for twice;
 *  - it leaves by the close button, a tap on the dimmed page, the back button, or by dragging its
 *    top (the handle and whatever is passed as `header`) downwards;
 *  - it is pinned to the top and bottom rather than given a height, so when the keyboard takes the
 *    bottom of the screen the sheet shortens instead of pushing its own title off the top.
 *
 * @param {object} props
 * @param {() => void} props.onClose  take the screen away (it is called after the sheet has left)
 * @param {React.ReactNode} [props.background]  drawn behind everything inside the sheet
 * @param {React.ReactNode} [props.header]  the top of the sheet; dragging it down closes the sheet
 * @param {React.ReactNode} props.children
 * @param {number} [props.cover]  how much of the screen's height the sheet takes (0–1)
 * @param {number} [props.radius]
 * @param {React.Ref<{ close: () => void }>} [props.ref]  `close()` slides it away, then calls onClose
 */
export function PopupSheet({
  onClose,
  background,
  header,
  children,
  cover = 0.87,
  radius = 32,
  ref,
}) {
  const { height } = useWindowDimensions();
  const top = Math.round(height * (1 - cover));
  const travel = height - top;
  // How far the sheet sits below its resting place. It starts wholly off the bottom.
  const y = useSharedValue(travel);

  useEffect(() => {
    y.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
  }, [y]);

  // Set once the sheet has been told to go, so a second tap, or the back button during the slide,
  // does not send it off twice.
  const leaving = useSharedValue(false);
  const leave = useCallback(() => {
    if (leaving.value) return;
    leaving.value = true;
    y.value = withTiming(travel, { duration: 190, easing: Easing.in(Easing.quad) });
    // On a timer rather than on the animation's own callback: the screen must go even if the
    // animation is cut short or the phone has animations switched off.
    setTimeout(onClose, 170);
  }, [leaving, onClose, travel, y]);

  useImperativeHandle(ref, () => ({ close: leave }), [leave]);

  // The back button takes the sheet down the same way the close button does.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        leave();
        return true;
      });
      return () => sub.remove();
    }, [leave]),
  );

  const drag = Gesture.Pan()
    // Only a clearly downward pull: a tap on the close button, or a sideways brush, is not a drag.
    .activeOffsetY(10)
    .failOffsetX([-24, 24])
    .onChange((e) => {
      y.value = Math.max(0, y.value + e.changeY);
    })
    .onEnd((e) => {
      if (y.value > travel * 0.22 || e.velocityY > 900) runOnJS(leave)();
      else y.value = withSpring(0, { damping: 24, stiffness: 260 });
    });

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [0, travel], [1, 0], 'clamp'),
  }));
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  return (
    <View style={styles.fill}>
      <Animated.View style={[styles.fill, styles.scrim, scrimStyle]}>
        <Pressable
          style={styles.fill}
          onPress={leave}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.card,
          { top, borderTopLeftRadius: radius, borderTopRightRadius: radius },
          cardStyle,
        ]}
      >
        {background}
        <GestureDetector gesture={drag}>
          <View collapsable={false}>
            <View style={styles.handle} />
            {header}
          </View>
        </GestureDetector>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  scrim: { backgroundColor: 'rgba(9,18,13,0.42)' },
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    backgroundColor: colors.canvas,
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    marginTop: 8,
    backgroundColor: 'rgba(14,27,20,0.18)',
  },
});
