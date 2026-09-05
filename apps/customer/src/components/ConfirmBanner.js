import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSelector } from 'react-redux';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowRight, CalendarClock } from 'lucide-react-native';
import { Glass, Pressy, Small, Text } from '../ui';
import { selectNextUnordered } from '../features/plan/planSlice';
import { relativeDayLabel, todayISO, addDaysISO } from '../lib/dates';
import { colors, radius } from '../theme';

/**
 * In-app twin of the evening reminder: if a planned day is coming up and has not been ordered,
 * show it wherever the customer is, so a missed notification does not mean a missed harvest.
 * @param {{ style?: any }} props
 */
export function ConfirmBanner({ style }) {
  const router = useRouter();
  const next = useSelector(selectNextUnordered);
  if (!next) return null;
  const tomorrow = addDaysISO(todayISO(), 1);
  const urgent = next.date <= tomorrow;
  return (
    <Animated.View entering={FadeInDown.duration(320).springify().damping(18)} style={style}>
      <Pressy
        onPress={() => router.push({ pathname: '/confirm/[date]', params: { date: next.date } })}
        haptics="soft"
        scale={0.985}
      >
        <Glass
          tone="dark"
          radius={radius.lg}
          innerStyle={[styles.row, urgent && { borderColor: colors.sprout }]}
        >
          <View style={[styles.icon, { backgroundColor: urgent ? colors.sprout : colors.mint }]}>
            <CalendarClock size={18} color={colors.ink} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium" color={colors.inkOnDark}>
              {urgent ? 'Confirm tomorrow’s order' : `Order for ${relativeDayLabel(next.date)}`}
            </Text>
            <Small color="rgba(243,245,239,0.7)">
              {next.title} · {next.meals} meals · we harvest tonight
            </Small>
          </View>
          <ArrowRight size={18} color={colors.sprout} />
        </Glass>
      </Pressy>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
