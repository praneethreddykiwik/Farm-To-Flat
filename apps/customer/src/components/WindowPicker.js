import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { Moon, Sun } from 'lucide-react-native';
import { Glass, Mono, Pressy, Skeleton, Small, Text } from '../ui';
import { colors, fonts, radius, shadow } from '../theme';
import { WINDOWS, dayNumber, dayShort, monthShort, relativeDayLabel } from '../lib/dates';

/**
 * Date strip + morning/evening cards with remaining capacity.
 * @param {{ windows: any[]|undefined, loading?: boolean, value: {date:string, window:string}|null, onChange: (v: {date:string, window:string}) => void }} props
 */
export function WindowPicker({ windows, loading, value, onChange }) {
  const days = useMemo(() => {
    const map = new Map();
    (windows || []).forEach((w) => {
      if (!map.has(w.date)) map.set(w.date, []);
      map.get(w.date).push(w);
    });
    return [...map.entries()];
  }, [windows]);
  const selectedDate = value?.date || days[0]?.[0];
  const slots = days.find(([d]) => d === selectedDate)?.[1] || [];

  if (loading) {
    return (
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width={64} height={76} radius={radius.md} />
          ))}
        </View>
        <Skeleton height={84} />
        <Skeleton height={84} />
      </View>
    );
  }
  if (!days.length) {
    return (
      <Small muted center style={{ paddingVertical: 24 }}>
        No delivery days configured for your community yet.
      </Small>
    );
  }

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.days}
      >
        {days.map(([date, ws]) => {
          const active = date === selectedDate;
          const anyOpen = ws.some((w) => w.isOpen);
          return (
            <Pressy
              key={date}
              onPress={() =>
                onChange({
                  date,
                  window:
                    value?.date === date
                      ? value.window
                      : ws.find((w) => w.isOpen)?.window || ws[0].window,
                })
              }
              haptics="select"
              disabled={!anyOpen}
            >
              <View
                style={[
                  styles.day,
                  active && styles.dayActive,
                  !anyOpen && { opacity: 0.4 },
                  active && shadow.soft,
                ]}
              >
                <Small
                  color={active ? 'rgba(243,245,239,0.7)' : colors.ink3}
                  style={{ fontSize: 11 }}
                >
                  {dayShort(date).toUpperCase()}
                </Small>
                <Text
                  style={{
                    fontFamily: fonts.display,
                    fontSize: 22,
                    color: active ? colors.sprout : colors.ink,
                    marginTop: 2,
                  }}
                >
                  {dayNumber(date)}
                </Text>
                <Small
                  color={active ? 'rgba(243,245,239,0.7)' : colors.ink3}
                  style={{ fontSize: 11 }}
                >
                  {monthShort(date)}
                </Small>
              </View>
            </Pressy>
          );
        })}
      </ScrollView>
      <Small muted style={{ marginTop: 12, marginBottom: 8 }}>
        {relativeDayLabel(selectedDate)} ·{' '}
        {selectedDate === days[0]?.[0] ? 'earliest available' : 'pick a window'}
      </Small>
      <Animated.View layout={LinearTransition.springify().damping(18)} style={{ gap: 10 }}>
        {slots.map((w) => {
          const meta = WINDOWS[w.window];
          const active = value?.date === w.date && value?.window === w.window;
          const Icon = w.window === 'MORNING' ? Sun : Moon;
          const tight = w.remaining > 0 && w.remaining <= 5;
          return (
            <Animated.View key={w.id} entering={FadeIn.duration(200)}>
              <Pressy
                onPress={() => onChange({ date: w.date, window: w.window })}
                disabled={!w.isOpen}
                haptics="select"
                scale={0.985}
              >
                <Glass
                  radius={radius.lg}
                  elevated={active}
                  innerStyle={[
                    styles.slot,
                    active && styles.slotActive,
                    !w.isOpen && { opacity: 0.5 },
                  ]}
                >
                  <View
                    style={[
                      styles.slotIcon,
                      { backgroundColor: w.window === 'MORNING' ? colors.butter : colors.lilac },
                    ]}
                  >
                    <Icon size={20} color={colors.ink} strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium">{meta.label}</Text>
                    <Small muted>{meta.hours}</Small>
                  </View>
                  {w.isOpen ? (
                    <Mono color={tight ? colors.tomato : colors.leafDeep} style={{ fontSize: 12 }}>
                      {tight ? `${w.remaining} left` : 'open'}
                    </Mono>
                  ) : (
                    <Mono color={colors.ink3} style={{ fontSize: 12 }}>
                      {w.remaining === 0 ? 'full' : 'closed'}
                    </Mono>
                  )}
                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active ? <View style={styles.radioDot} /> : null}
                  </View>
                </Glass>
              </Pressy>
            </Animated.View>
          );
        })}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  days: { gap: 10, paddingVertical: 4 },
  day: {
    width: 64,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  dayActive: { backgroundColor: colors.night, borderColor: colors.night },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  slotActive: { backgroundColor: 'rgba(255,255,255,0.4)' },
  slotIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(14,27,20,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: colors.leaf, backgroundColor: colors.leaf },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.sprout },
});
