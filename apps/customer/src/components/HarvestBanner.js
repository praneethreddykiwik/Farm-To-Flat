import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowRight, Sprout } from 'lucide-react-native';
import { Glass, Pressy, Small, Text } from '../ui';
import { colors, fonts, radius } from '../theme';
import { relativeDayLabel, windowLabel } from '../lib/dates';

/**
 * The "harvest" card: what is being picked tonight and when it lands. Dark glass over a green field.
 * @param {{ nextWindow?: { date: string, window: string }|null, onPress: () => void }} props
 */
export function HarvestBanner({ nextWindow, onPress }) {
  // Lower-cased because it reads as part of a sentence ("Tomorrow morning"), and taken from the
  // window itself so a community that runs an afternoon slot doesn't get called an evening one.
  const when = nextWindow
    ? `${relativeDayLabel(nextWindow.date)} ${windowLabel(nextWindow.window, nextWindow).toLowerCase()}`
    : 'this week';
  return (
    <Animated.View entering={FadeInDown.duration(420).springify().damping(18)} style={styles.wrap}>
      <Pressy onPress={onPress} haptics="soft" scale={0.985}>
        <View style={styles.card}>
          <LinearGradient
            colors={['#0F2A1C', '#1E7A4C', '#3FA46F']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.ring} />
          <View style={styles.ring2} />
          <View style={styles.content}>
            <View style={styles.row}>
              <Glass tone="dark" radius={radius.pill} elevated={false} innerStyle={styles.pill}>
                <Sprout size={14} color={colors.sprout} />
                <Small color={colors.sprout} style={{ fontFamily: fonts.bodyMedium }}>
                  Picked tonight
                </Small>
              </Glass>
            </View>
            <Text style={styles.title}>Farm-fresh, delivered {when}.</Text>
            <Small color="rgba(243,245,239,0.78)" style={{ marginTop: 6, maxWidth: 240 }}>
              Harvested after your order, never from a cold room. Minimum basket ₹500.
            </Small>
            <View style={[styles.row, { marginTop: 14 }]}>
              <View style={styles.cta}>
                <Text variant="smallMedium" color={colors.ink}>
                  Build a basket
                </Text>
                <ArrowRight size={16} color={colors.ink} />
              </View>
            </View>
          </View>
        </View>
      </Pressy>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20 },
  card: { borderRadius: radius.xl, overflow: 'hidden', minHeight: 176 },
  ring: {
    position: 'absolute',
    right: -60,
    top: -70,
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 40,
    borderColor: 'rgba(205,245,106,0.16)',
  },
  ring2: {
    position: 'absolute',
    right: 40,
    bottom: -90,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  content: { padding: 20 },
  row: { flexDirection: 'row', alignItems: 'center' },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.4,
    color: colors.inkOnDark,
    marginTop: 12,
    maxWidth: 260,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.sprout,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: radius.pill,
  },
});
