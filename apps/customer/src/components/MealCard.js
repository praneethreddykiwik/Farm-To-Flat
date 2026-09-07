import React, { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { ChevronDown, Clock, Coffee, Moon, Sun, Utensils } from 'lucide-react-native';
import { Glass, Mono, Pressy, ProductImage, Small, Text } from '../ui';
import { colors, motion, radius } from '../theme';

const SLOT = {
  breakfast: { label: 'Breakfast', Icon: Coffee, tint: colors.butter },
  lunch: { label: 'Lunch', Icon: Sun, tint: colors.mint },
  snack: { label: 'Snack', Icon: Utensils, tint: colors.lilac },
  dinner: { label: 'Dinner', Icon: Moon, tint: colors.sky },
};

/**
 * One meal: header with slot + computed kcal/protein, product chips (tap → product page), expandable steps.
 * @param {{ meal: any, productsById: Record<string, any>, index?: number, compact?: boolean }} props
 */
function MealCardBase({ meal, productsById, index = 0, compact = false }) {
  const router = useRouter();
  const [open, setOpen] = useState(!compact);
  const s = SLOT[meal.slot] || SLOT.lunch;
  return (
    <Animated.View
      entering={FadeInDown.delay(index * motion.stagger)
        .duration(360)
        .springify()
        .damping(18)}
      layout={LinearTransition.springify().damping(18)}
    >
      <Glass radius={radius.lg} blur={false} innerStyle={styles.card}>
        <Pressy onPress={() => setOpen((o) => !o)} haptics="select" scale={0.995}>
          <View style={styles.head}>
            <View style={[styles.slotIcon, { backgroundColor: s.tint }]}>
              <s.Icon size={16} color={colors.ink} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Small muted>{s.label}</Small>
              <Text variant="bodyMedium" numberOfLines={1}>
                {meal.name}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Mono color={colors.leafDeep} style={{ fontSize: 13 }}>
                {meal.totals.kcal} kcal
              </Mono>
              <Small muted style={{ fontSize: 11 }}>
                {meal.totals.protein} g protein
              </Small>
            </View>
            <ChevronDown
              size={18}
              color={colors.ink3}
              style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
            />
          </View>
        </Pressy>

        <View style={styles.items}>
          {meal.items.map((it, i) => {
            const p = productsById[it.productId];
            if (!p) return null;
            return (
              <Animated.View
                key={`${it.productId}-${i}`}
                entering={FadeInDown.delay(80 + i * 40).duration(280)}
              >
                <Pressy
                  onPress={() => router.push({ pathname: '/product/[id]', params: { id: p.id } })}
                  haptics="select"
                  style={styles.chip}
                >
                  <ProductImage uri={p.image} tint={p.tint} name={p.name} size={34} radius={10} />
                  <View style={{ flexShrink: 1, maxWidth: 130 }}>
                    <Text variant="smallMedium" numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Small muted style={{ fontSize: 11 }}>
                      {it.grams} g
                    </Small>
                  </View>
                </Pressy>
              </Animated.View>
            );
          })}
        </View>

        {open && meal.steps?.length ? (
          <Animated.View entering={FadeInDown.duration(240)} style={styles.steps}>
            {meal.steps.map((st, i) => (
              <View key={i} style={styles.step}>
                <View style={styles.stepNo}>
                  <Mono color={colors.inkOnDark} style={{ fontSize: 11 }}>
                    {i + 1}
                  </Mono>
                </View>
                <Small color={colors.ink2} style={{ flex: 1 }}>
                  {st}
                </Small>
              </View>
            ))}
            <View style={styles.prep}>
              <Clock size={12} color={colors.ink3} />
              <Small muted style={{ fontSize: 11 }}>
                about {meal.prepMinutes} min · pantry staples (rice, dal, curd, oil, spices) not
                included in the count
              </Small>
            </View>
          </Animated.View>
        ) : null}
      </Glass>
    </Animated.View>
  );
}

/** Memoised: a month plan renders dozens of these; only re-render when the meal itself changes. */
export const MealCard = memo(MealCardBase);

const styles = StyleSheet.create({
  card: { padding: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  slotIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  items: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 12,
    paddingLeft: 4,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    maxWidth: '100%',
  },
  steps: { marginTop: 12, gap: 8 },
  step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNo: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.night,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  prep: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
});
