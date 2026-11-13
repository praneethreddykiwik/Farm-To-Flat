import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ProductImage } from '../ui';
import { colors, motion, shadow } from '../theme';
import { pulseBag, selectBagPulse, selectReducedMotion } from '../features/ui/uiSlice';
import { bagTarget, onFly, setBagTarget } from '../lib/flyToBag';

const SIZE = 58;
/** How long the trip takes. Long enough to follow with the eye, short enough never to wait for. */
const TRIP_MS = 640;
/** Rapid tapping should read as a stream, not a swarm. */
const MAX_IN_FLIGHT = 5;

/**
 * One photo on its way to the basket. It rises off the card first and then falls into the bar — a
 * thrown arc rather than a straight slide, which is what makes it read as "dropped in" — shrinking
 * as it goes, and is gone by the time it lands so it never sits on top of the icon.
 */
function Flyer({ flight, onLanded }) {
  const { from, to } = flight;
  const t = useSharedValue(0);
  // The flight waits for its photo. The bitmap is already in the image cache, but it reaches the
  // screen a few frames after mount — longer on a slow phone — and a flight that left at once
  // opened on a blank disc. So it stays invisible where the product is until the photo is showing,
  // then goes. A product with no photo has nothing to wait for; and nothing waits long.
  const gone = useRef(false);
  const go = useCallback(() => {
    if (gone.current) return;
    gone.current = true;
    t.value = withTiming(
      1,
      { duration: TRIP_MS, easing: Easing.bezier(0.35, 0, 0.25, 1) },
      (finished) => {
        if (finished) runOnJS(onLanded)(flight.id);
      },
    );
  }, [flight.id, onLanded, t]);
  useEffect(() => {
    const wait = setTimeout(go, flight.uri ? 220 : 0);
    return () => clearTimeout(wait);
  }, [flight.uri, go]);

  const style = useAnimatedStyle(() => {
    const p = t.value;
    const q = 1 - p;
    // A quadratic curve through a point above both ends. The higher the start sits above the
    // basket, the less extra lift it needs to look thrown.
    const cx = from.x + (to.x - from.x) * 0.35;
    const cy = Math.min(from.y, to.y) - 70;
    const x = q * q * from.x + 2 * q * p * cx + p * p * to.x;
    const y = q * q * from.y + 2 * q * p * cy + p * p * to.y;
    return {
      opacity: interpolate(p, [0, 0.05, 0.82, 1], [0, 1, 1, 0]),
      // Cast: checked as plain JS, a mixed transform list is inferred as a union no single
      // transform type accepts.
      transform: /** @type {any} */ ([
        { translateX: x - SIZE / 2 },
        { translateY: y - SIZE / 2 },
        { scale: interpolate(p, [0, 0.18, 1], [0.7, 1.08, 0.3]) },
      ]),
    };
  });

  return (
    <Animated.View style={[styles.flyer, style]}>
      <View style={styles.photo}>
        <ProductImage
          uri={flight.uri}
          blurhash={flight.blurhash}
          tint={flight.tint}
          name={flight.name}
          size={SIZE - 6}
          radius={(SIZE - 6) / 2}
          // The same width the card (or the hero) asked for, so this is the bitmap already in
          // memory rather than a second download — and no fade-in: the flight is 640 ms long, and
          // a photo that spends the first 260 of them fading up from white leaves as a blank disc.
          renderWidth={flight.renderWidth || 480}
          transition={0}
          priority="high"
          onDisplay={go}
        />
      </View>
    </Animated.View>
  );
}

/**
 * Draws every "added to basket" flight. Mounted once, at the root, above the screens: a flight
 * starts on one surface (a card in a scrolling grid) and ends on another (the bar pinned over it),
 * and only something above both can carry it between them.
 *
 * It never takes a touch, and it is the single place the basket is told to bounce — on landing,
 * which is when the eye is on it.
 */
export function FlyToBagHost() {
  const dispatch = useDispatch();
  const reduced = useSelector(selectReducedMotion);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [flights, setFlights] = useState(/** @type {any[]} */ ([]));
  const seq = useRef(0);
  // Read through a ref so the listener is registered once and still sees today's values.
  const live = useRef({ reduced, width, height, bottom: insets.bottom });
  useEffect(() => {
    live.current = { reduced, width, height, bottom: insets.bottom };
  }, [reduced, width, height, insets.bottom]);

  useEffect(
    () =>
      onFly((flight) => {
        const now = live.current;
        // "Reduce motion" is a request not to send things flying across the screen. The basket
        // still acknowledges the add; nothing travels.
        if (now.reduced) {
          dispatch(pulseBag());
          return;
        }
        // Nothing on screen claims to be the basket: aim where the bar would be.
        const to = bagTarget() || { x: now.width / 2, y: now.height - now.bottom - 46 };
        const id = ++seq.current;
        setFlights((f) => [...f.slice(-(MAX_IN_FLIGHT - 1)), { ...flight, id, to }]);
      }),
    [dispatch],
  );

  const landed = useCallback(
    (id) => {
      setFlights((f) => f.filter((x) => x.id !== id));
      dispatch(pulseBag());
    },
    [dispatch],
  );

  if (!flights.length) return null;
  return (
    <View pointerEvents="none" style={styles.host}>
      {flights.map((f) => (
        <Flyer key={f.id} flight={f} onLanded={landed} />
      ))}
    </View>
  );
}

/**
 * Put this on whatever shows the basket, and it reports that view's centre as a landing spot for
 * as long as the view is mounted:
 *
 *   const [bagRef, bagLayout] = useBagTarget('tabs', 0);
 *   <View ref={bagRef} onLayout={bagLayout} collapsable={false}>…</View>
 *
 * @param {string} key
 * @param {number} priority  see setBagTarget
 * @param {boolean} [active]  false withdraws it without unmounting (a screen that is covered)
 * @returns {[(node: any) => void, () => void]}
 */
export function useBagTarget(key, priority, active = true) {
  const node = useRef(/** @type {any} */ (null));
  const live = useRef(active);
  const read = useCallback(() => {
    if (!live.current) return;
    node.current?.measureInWindow?.((x, y, w, h) => {
      if (live.current && w > 0 && h > 0)
        setBagTarget(key, { x: x + w / 2, y: y + h / 2 }, priority);
    });
  }, [key, priority]);
  const measure = useCallback(() => {
    // A frame later: on Android a view measured inside its own onLayout can still report where it
    // was before the layout that just ran. And once more after any slide-in has finished — a bar
    // that animates up into place is measured mid-journey the first time.
    requestAnimationFrame(read);
    setTimeout(read, 480);
  }, [read]);
  const attach = useCallback((n) => {
    node.current = n;
  }, []);
  useEffect(() => {
    live.current = active;
    if (active) measure();
    else setBagTarget(key, null);
    return () => setBagTarget(key, null);
  }, [active, key, measure]);
  return [attach, measure];
}

/**
 * The little jump a basket makes when something lands in it. Returns an animated style for the
 * icon; it reacts to every `pulseBag`, and stays still on first mount.
 * @param {number} [to]  how far it swells
 */
export function useBagBounce(to = 1.3) {
  const pulse = useSelector(selectBagPulse);
  const scale = useSharedValue(1);
  const seen = useRef(pulse);
  useEffect(() => {
    if (pulse === seen.current) return;
    seen.current = pulse;
    scale.value = withSequence(withSpring(to, motion.springSnappy), withSpring(1, motion.spring));
  }, [pulse, scale, to]);
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
}

const styles = StyleSheet.create({
  host: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  flyer: { position: 'absolute', top: 0, left: 0, width: SIZE, height: SIZE },
  // A white rim so the photo reads against a white card and a dark bar alike.
  photo: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.soft,
  },
});
