import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSelector } from 'react-redux';
import {
  Home,
  Leaf,
  ReceiptText,
  Search,
  ShoppingBag,
  Sparkles,
  Wallet,
} from 'lucide-react-native';
import { Glass, Pressy, Text } from '../ui';
import { colors, motion, radius } from '../theme';
import { selectBagPulse } from '../features/ui/uiSlice';
import { useGetCartQuery } from '../api/api';
import { selectIsSignedIn } from '../features/auth/authSlice';
import { selectAiVisible } from '../features/role/roleSlice';

const ICONS = {
  index: Home,
  plan: Sparkles,
  search: Search,
  orders: ReceiptText,
  wallet: Wallet,
  bag: ShoppingBag,
};

function TabIcon({ name, focused, color }) {
  const Icon = ICONS[name] || Leaf;
  const s = useSharedValue(1);
  useEffect(() => {
    if (focused)
      s.value = withSequence(withSpring(1.18, motion.springSnappy), withSpring(1, motion.spring));
  }, [focused, s]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={st}>
      <Icon size={22} color={color} strokeWidth={focused ? 2.4 : 2} />
    </Animated.View>
  );
}

/**
 * Floating dark glass tab bar, the "pill" from the reference screens. A sprout-coloured
 * indicator slides between tabs on a spring; the bag tab bounces and shows a count when
 * an item is added.
 */
export function TabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();
  const signedIn = useSelector(selectIsSignedIn);
  const { data } = useGetCartQuery(undefined, { skip: !signedIn });
  const count = data?.cart?.items?.length || 0;
  const pulse = useSelector(selectBagPulse);
  // AI planner (the "plan" tab) is super-admin only. expo-router consumes the screen's `href`
  // before it reaches these descriptors, so hiding via href:null doesn't take effect in a custom
  // tab bar — gate the route by name here instead, which is authoritative.
  const aiVisible = useSelector(selectAiVisible);
  const visible = state.routes.filter(
    (r) =>
      descriptors[r.key]?.options?.tabBarButton !== null &&
      descriptors[r.key]?.options?.href !== null &&
      (r.name !== 'plan' || aiVisible),
  );

  // Position of the focused tab WITHIN the visible set (plan may be filtered out), so the sliding
  // indicator lands on the right tab even when a route is hidden.
  const activeVisible = Math.max(
    0,
    visible.findIndex((r) => r.key === state.routes[state.index]?.key),
  );
  const idx = useSharedValue(activeVisible);
  useEffect(() => {
    idx.value = withSpring(activeVisible, motion.spring);
  }, [activeVisible, idx]);

  const bagScale = useSharedValue(1);
  useEffect(() => {
    if (pulse > 0)
      bagScale.value = withSequence(
        withSpring(1.35, motion.springSnappy),
        withSpring(1, motion.spring),
      );
  }, [pulse, bagScale]);
  const bagStyle = useAnimatedStyle(() => ({ transform: [{ scale: bagScale.value }] }));

  const [w, setW] = React.useState(0);
  const slot = visible.length ? w / visible.length : 0;
  const indicator = useAnimatedStyle(() => ({
    transform: [{ translateX: idx.value * slot }],
    opacity: withTiming(slot ? 1 : 0),
  }));

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      <Glass tone="dark" radius={radius.pill} liquid innerStyle={styles.inner}>
        <View style={styles.row} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
          {slot > 0 && (
            <Animated.View style={[styles.indicator, { width: slot - 8 }, indicator]}>
              <View style={styles.indicatorFill} />
            </Animated.View>
          )}
          {visible.map((route) => {
            const i = state.routes.indexOf(route);
            const focused = state.index === i;
            const { options } = descriptors[route.key];
            const label = options.title ?? route.name;
            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            };
            const color = focused ? colors.ink : 'rgba(243,245,239,0.72)';
            const isBag = route.name === 'bag';
            return (
              <Pressy
                key={route.key}
                onPress={onPress}
                haptics="select"
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={label}
                style={styles.tab}
                scale={0.92}
              >
                <Animated.View style={isBag ? bagStyle : undefined}>
                  <TabIcon name={route.name} focused={focused} color={color} />
                  {isBag && count > 0 ? (
                    <View style={styles.badge}>
                      <Text variant="micro" color={colors.ink} style={{ fontSize: 10 }}>
                        {count}
                      </Text>
                    </View>
                  ) : null}
                </Animated.View>
              </Pressy>
            );
          })}
        </View>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  inner: { paddingHorizontal: 6, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', width: 300, height: 56 },
  tab: { flex: 1, height: 56, alignItems: 'center', justifyContent: 'center' },
  indicator: { position: 'absolute', left: 4, top: 4, bottom: 4, borderRadius: radius.pill },
  indicatorFill: { flex: 1, borderRadius: radius.pill, backgroundColor: colors.sprout },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: colors.sprout,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.night,
  },
});
