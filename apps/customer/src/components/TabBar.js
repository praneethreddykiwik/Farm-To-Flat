import React, { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { useSelector } from 'react-redux';
import {
  Home,
  Leaf,
  ReceiptText,
  Search,
  ShoppingBag,
  Sparkles,
  User,
  Wallet,
} from 'lucide-react-native';
import { Glass, Pressy, Text } from '../ui';
import { colors, fonts, motion, radius } from '../theme';
import { selectBagPulse } from '../features/ui/uiSlice';
import { useGetCartQuery } from '../api/api';
import { selectIsSignedIn } from '../features/auth/authSlice';
import { selectAiVisible } from '../features/role/roleSlice';
import { useBagTarget } from './FlyToBag';
import { measureTabBar } from '../lib/tabBarLayout';

const ICONS = {
  index: Home,
  plan: Sparkles,
  search: Search,
  orders: ReceiptText,
  wallet: Wallet,
  bag: ShoppingBag,
  account: User,
};

const IDLE = 'rgba(243,245,239,0.72)';
/**
 * The tint inside the current tab's icon: enough to read as "filled", not so much that the strokes
 * inside it (a receipt's lines, a wallet's clasp) disappear.
 */
const ICON_WASH = 'rgba(14,27,20,0.16)';
/** How the tabs make room for one another when the labelled one changes. */
const REFLOW = LinearTransition.springify().damping(22).stiffness(260).mass(0.8);
/**
 * Floating dark glass tab bar. The tab you are on is a sprout pill carrying its icon and its name;
 * the others are icons. Changing tab, the pill closes on one and opens on the next while the rest
 * slide to make room. The bag bounces and shows a count when something is added.
 *
 * Staff with the AI planner get it as its own round button to the right of the bar, apart from the
 * shop's tabs: it is a different kind of thing, and the shop's bar is then the same for them as for
 * a customer. Colours are the bar's own throughout — sprout always and only means "you are here".
 */
export function TabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const signedIn = useSelector(selectIsSignedIn);
  // Only the number of lines: the bar has no business redrawing on every change to a quantity.
  const { count } = useGetCartQuery(undefined, {
    skip: !signedIn,
    selectFromResult: ({ data }) => ({ count: data?.cart?.items?.length || 0 }),
  });
  const pulse = useSelector(selectBagPulse);
  // AI planner (the "plan" tab) is super-admin only. expo-router consumes the screen's `href`
  // before it reaches these descriptors, so hiding via href:null doesn't take effect in a custom
  // tab bar — gate the route by name here instead, which is authoritative.
  const aiVisible = useSelector(selectAiVisible);
  const shown = state.routes.filter(
    (r) =>
      descriptors[r.key]?.options?.tabBarButton !== null &&
      descriptors[r.key]?.options?.href !== null,
  );
  const tabs = shown.filter((r) => r.name !== 'plan');
  const plan = aiVisible ? shown.find((r) => r.name === 'plan') : null;
  const m = measureTabBar(screenW, tabs.length, !!plan);

  const bagScale = useSharedValue(1);
  useEffect(() => {
    if (pulse > 0)
      bagScale.value = withSequence(
        withSpring(1.35, motion.springSnappy),
        withSpring(1, motion.spring),
      );
  }, [pulse, bagScale]);
  const bagStyle = useAnimatedStyle(() => ({ transform: [{ scale: bagScale.value }] }));
  // Where an added product's photo lands. The lowest priority: a basket bar or a screen's own
  // basket button, when one is showing, is the nearer and more informative place to arrive.
  const [bagRef, bagLayout] = useBagTarget('tabs', 0);

  const isFocused = (route) => state.routes[state.index]?.key === route.key;
  // False on the AI screen: then no tab is current, and the tabs share the bar's width evenly.
  const oneIsCurrent = tabs.some(isFocused);
  const press = (route) => () => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!isFocused(route) && !event.defaultPrevented) navigation.navigate(route.name);
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { paddingBottom: Math.max(insets.bottom, 12), gap: m.aiGap }]}
    >
      <Glass
        tone="dark"
        radius={radius.pill}
        liquid
        innerStyle={{ paddingHorizontal: m.barPad, paddingVertical: 6 }}
      >
        <View style={[styles.row, { width: m.rowW }]}>
          {tabs.map((route) => {
            const focused = isFocused(route);
            const label = descriptors[route.key].options.title ?? route.name;
            const Icon = ICONS[route.name] || Leaf;
            const isBag = route.name === 'bag';
            const named = focused && m.showLabel;
            return (
              // The tab's own box is what moves when a neighbour opens or closes, so that is where
              // the bag's landing spot has to be re-read from.
              <Animated.View
                key={route.key}
                layout={REFLOW}
                onLayout={isBag ? bagLayout : undefined}
              >
                <Pressy
                  onPress={press(route)}
                  haptics="select"
                  accessibilityRole="tab"
                  accessibilityState={{ selected: focused }}
                  accessibilityLabel={label}
                  scale={0.94}
                  style={[
                    styles.tab,
                    named
                      ? { width: m.activeW, gap: m.gap }
                      : { width: oneIsCurrent ? m.tabW : m.rowW / tabs.length },
                  ]}
                >
                  {focused ? (
                    <Animated.View
                      entering={FadeIn.duration(180)}
                      exiting={FadeOut.duration(120)}
                      style={styles.pill}
                    />
                  ) : null}
                  <Animated.View
                    ref={isBag ? bagRef : undefined}
                    collapsable={false}
                    style={isBag ? bagStyle : undefined}
                  >
                    <Icon
                      size={m.icon}
                      color={focused ? colors.ink : IDLE}
                      strokeWidth={focused ? 2.4 : 2}
                      fill={focused ? ICON_WASH : 'none'}
                    />
                    {isBag && count > 0 ? (
                      <View style={styles.badge}>
                        <Text variant="micro" color={colors.ink} style={{ fontSize: 10 }}>
                          {count}
                        </Text>
                      </View>
                    ) : null}
                  </Animated.View>
                  {named ? (
                    <Animated.Text
                      entering={FadeIn.delay(70).duration(170)}
                      exiting={FadeOut.duration(70)}
                      numberOfLines={1}
                      // A bar this tight has no room for a label at 140%; the icon carries it then.
                      maxFontSizeMultiplier={1.1}
                      style={[styles.label, { fontSize: m.compact ? 13.5 : 14.5 }]}
                    >
                      {label}
                    </Animated.Text>
                  ) : null}
                </Pressy>
              </Animated.View>
            );
          })}
        </View>
      </Glass>

      {plan ? <AiButton size={m.aiSize} focused={isFocused(plan)} onPress={press(plan)} /> : null}
    </View>
  );
}

/**
 * The AI planner, as a round button beside the bar. Dark like the bar with a sprout mark while you
 * are elsewhere; filled sprout when it is the screen you are on — the same rule the tabs follow.
 */
function AiButton({ size, focused, onPress }) {
  return (
    <Animated.View layout={REFLOW}>
      <Pressy
        onPress={onPress}
        haptics="select"
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel="Planner"
        scale={0.92}
      >
        <Glass
          tone="dark"
          radius={radius.pill}
          liquid
          innerStyle={[styles.ai, { width: size, height: size }]}
        >
          {focused ? (
            <Animated.View
              entering={FadeIn.duration(180)}
              exiting={FadeOut.duration(120)}
              style={styles.pill}
            />
          ) : null}
          <Sparkles
            size={24}
            color={focused ? colors.ink : colors.sprout}
            strokeWidth={focused ? 2.4 : 2.1}
            fill={focused ? ICON_WASH : 'none'}
          />
        </Glass>
      </Pressy>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 56 tall inside 6 of padding: the bar is 68 high, which is what the basket bar floats above.
  row: { flexDirection: 'row', alignItems: 'center', height: 56 },
  tab: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The sprout fill behind the current tab (and behind the AI mark when that is the current screen).
  pill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.sprout,
  },
  label: {
    fontFamily: fonts.bodySemi,
    color: colors.ink,
    letterSpacing: 0.1,
    includeFontPadding: false,
  },
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
  ai: { alignItems: 'center', justifyContent: 'center' },
});
