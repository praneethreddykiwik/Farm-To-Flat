import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { ArrowLeft, BellOff, Trash2 } from 'lucide-react-native';
import {
  Ambient,
  Button,
  Chip,
  Display,
  EmptyState,
  Glass,
  Label,
  Mono,
  Pressy,
  Small,
  Text,
} from '../src/ui';
import { MealCard } from '../src/components/MealCard';
import { PlanShoppingList } from '../src/components/PlanShoppingList';
import { NutritionBars } from '../src/components/NutritionBars';
import { ConfirmBanner } from '../src/components/ConfirmBanner';
import { ScoreBar } from '../src/components/ScoreBar';
import { useGetCatalogQuery } from '../src/api/api';
import { dayToggled, planUnscheduled, selectScheduled } from '../src/features/plan/planSlice';
import { cancelReminders } from '../src/lib/reminders';
import {
  addDaysISO,
  dayNumber,
  dayShort,
  formatDateShort,
  monthShort,
  relativeDayLabel,
  todayISO,
  weekdayOf,
} from '../src/lib/dates';
import { colors, fonts, radius } from '../src/theme';

const VIEWS = [
  ['day', 'Day'],
  ['week', 'Week'],
  ['month', 'Month'],
];

export default function Calendar() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dispatch = useDispatch();
  const scheduled = useSelector(selectScheduled);
  const catalog = useGetCatalogQuery();
  const productsById = useMemo(
    () => Object.fromEntries((catalog.data?.products || []).map((p) => [p.id, p])),
    [catalog.data],
  );
  const [view, setView] = useState('week');
  const [selected, setSelected] = useState(() => {
    // Open on the next planned day so the customer lands on their meals, not an empty day.
    const today = todayISO();
    const upcoming = scheduled
      .flatMap((p) => p.days.map((d) => d.date))
      .filter((d) => d >= today)
      .sort()[0];
    return upcoming || today;
  });

  // date → meals (with plan refs)
  const byDate = useMemo(() => {
    const m = {};
    scheduled.forEach((p) =>
      p.days.forEach(
        (d) =>
          (m[d.date] = [
            ...(m[d.date] || []),
            ...d.meals.map((meal) => ({ ...meal, planId: p.id, planTitle: p.title })),
          ]),
      ),
    );
    return m;
  }, [scheduled]);

  const anchor = selected;
  const weekStart = addDaysISO(anchor, -((weekdayOf(anchor) + 6) % 7)); // Monday
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
  const monthStart = `${anchor.slice(0, 8)}01`;
  const firstWeekday = (weekdayOf(monthStart) + 6) % 7;
  const monthCells = Array.from({ length: 42 }, (_, i) => addDaysISO(monthStart, i - firstWeekday));

  const dayMeals = byDate[selected] || [];
  const dayItems = dayMeals.flatMap((m) => m.items);
  const dayShopping = Object.entries(
    dayItems.reduce((a, it) => ({ ...a, [it.productId]: (a[it.productId] || 0) + it.grams }), {}),
  ).map(([productId, grams]) => ({ productId, grams }));
  const targets = scheduled.find((p) => p.days.some((d) => d.date === selected))?.targets;
  const dayTotals = dayMeals.reduce(
    (t, m) => ({
      kcal: t.kcal + m.totals.kcal,
      protein: t.protein + m.totals.protein,
      carbs: t.carbs + m.totals.carbs,
      fat: t.fat + m.totals.fat,
      fibre: t.fibre + m.totals.fibre,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 },
  );

  const activePlan = scheduled.find((p) => p.days.some((d) => d.date === selected));
  const doneToday = !!activePlan?.completed?.includes(selected);
  const progressOf = (p) => ({ done: (p.completed || []).length, total: p.days.length });

  const remove = async (plan) => {
    await cancelReminders(plan.reminderIds);
    dispatch(planUnscheduled(plan.id));
  };

  /** @param {{ d: string, big?: boolean }} props */
  const DayCell = ({ d, big = false }) => {
    const has = (byDate[d] || []).length;
    const active = d === selected;
    const inMonth = d.slice(0, 7) === anchor.slice(0, 7);
    return (
      <Pressy onPress={() => setSelected(d)} haptics="select" style={{ flex: 1 }}>
        <View
          style={[
            styles.cell,
            big && styles.cellBig,
            active && styles.cellActive,
            !inMonth && view === 'month' && { opacity: 0.35 },
          ]}
        >
          {big ? (
            <Small color={active ? 'rgba(243,245,239,0.7)' : colors.ink3} style={{ fontSize: 10 }}>
              {dayShort(d).toUpperCase()}
            </Small>
          ) : null}
          <Text
            style={{
              fontFamily: fonts.display,
              fontSize: big ? 20 : 15,
              color: active ? colors.sprout : d === todayISO() ? colors.leafDeep : colors.ink,
            }}
          >
            {dayNumber(d)}
          </Text>
          <View style={styles.dots}>
            {Array.from({ length: Math.min(3, has) }).map((_, i) => (
              <View
                key={i}
                style={[styles.dotSm, { backgroundColor: active ? colors.sprout : colors.leaf }]}
              />
            ))}
          </View>
        </View>
      </Pressy>
    );
  };

  return (
    <View style={styles.root}>
      <Ambient />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 60,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressy
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/plan'))}
            haptics="select"
            accessibilityLabel="Back"
          >
            <Glass radius={radius.pill} innerStyle={styles.iconBtn}>
              <ArrowLeft size={20} color={colors.ink} />
            </Glass>
          </Pressy>
          <Display>Meal calendar</Display>
        </View>

        <ConfirmBanner style={{ marginTop: 16 }} />

        <View style={[styles.chips, { marginTop: 16 }]}>
          {VIEWS.map(([k, l]) => (
            <Chip key={k} label={l} selected={view === k} onPress={() => setView(k)} />
          ))}
          <View style={{ flex: 1 }} />
          <Pressy onPress={() => setSelected(todayISO())} haptics="select">
            <Small color={colors.leafDeep}>Today</Small>
          </Pressy>
        </View>

        <Animated.View layout={LinearTransition.springify().damping(18)} style={{ marginTop: 14 }}>
          <Glass radius={radius.lg} innerStyle={{ padding: 10 }}>
            <View style={styles.monthHead}>
              <Pressy
                onPress={() => setSelected(addDaysISO(selected, view === 'month' ? -30 : -7))}
                haptics="select"
                style={styles.nav}
              >
                <Text variant="bodyMedium">‹</Text>
              </Pressy>
              <Text variant="bodyMedium">
                {monthShort(anchor)} {anchor.slice(0, 4)}
              </Text>
              <Pressy
                onPress={() => setSelected(addDaysISO(selected, view === 'month' ? 30 : 7))}
                haptics="select"
                style={styles.nav}
              >
                <Text variant="bodyMedium">›</Text>
              </Pressy>
            </View>
            {view === 'month' ? (
              <View style={{ gap: 6 }}>
                <View style={styles.weekRow}>
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => (
                    <Small key={i} muted center style={{ flex: 1, fontSize: 10 }}>
                      {w}
                    </Small>
                  ))}
                </View>
                {Array.from({ length: 6 }, (_, r) => (
                  <View key={r} style={styles.weekRow}>
                    {monthCells.slice(r * 7, r * 7 + 7).map((d) => (
                      <DayCell key={d} d={d} />
                    ))}
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.weekRow}>
                {weekDays.map((d) => (
                  <DayCell key={d} d={d} big />
                ))}
              </View>
            )}
          </Glass>
        </Animated.View>

        <View style={styles.dayHead}>
          <View>
            <Label>{relativeDayLabel(selected)}</Label>
            <Text style={styles.dayTitle}>{formatDateShort(selected)}</Text>
          </View>
          {dayMeals.length ? (
            <Mono color={colors.leafDeep} style={{ fontSize: 12 }}>
              {dayTotals.kcal} kcal · {dayTotals.protein} g protein
            </Mono>
          ) : null}
        </View>

        {dayMeals.length === 0 ? (
          <EmptyState
            title="Nothing planned"
            message="Build a plan on the Dietitian tab and add it here. Each day shows its meals, steps and what to order."
            action={{ title: 'Build a plan', onPress: () => router.replace('/(tabs)/plan') }}
          />
        ) : (
          <Animated.View entering={FadeIn.duration(240)} style={{ gap: 10 }}>
            {targets ? (
              <Glass radius={radius.lg} innerStyle={{ padding: 16 }}>
                <NutritionBars totals={dayTotals} targets={targets} />
              </Glass>
            ) : null}
            {dayMeals.map((m, i) => (
              <MealCard
                key={`${m.planId}-${i}`}
                meal={m}
                productsById={productsById}
                index={i}
                compact
              />
            ))}
            <Label style={{ marginTop: 12, marginBottom: 6 }}>Order for this day</Label>
            <PlanShoppingList shopping={dayShopping} productsById={productsById} />
            {activePlan && selected > todayISO() ? (
              <View style={{ marginTop: 14 }}>
                <Button
                  title={
                    activePlan.ordered?.includes(selected)
                      ? 'Ordered · view or reorder'
                      : 'Confirm and order for this day'
                  }
                  variant={activePlan.ordered?.includes(selected) ? 'glass' : 'accent'}
                  onPress={() =>
                    router.push({ pathname: '/confirm/[date]', params: { date: selected } })
                  }
                  style={{ marginBottom: 10 }}
                />
              </View>
            ) : null}
            {activePlan ? (
              <View style={{ marginTop: 0 }}>
                <Button
                  title={doneToday ? 'Marked as done · undo' : 'I followed this day'}
                  variant={doneToday ? 'glass' : 'primary'}
                  onPress={() => dispatch(dayToggled({ id: activePlan.id, date: selected }))}
                />
              </View>
            ) : null}
          </Animated.View>
        )}

        {scheduled.length ? (
          <View style={{ marginTop: 28 }}>
            <Label style={{ marginBottom: 8 }}>Your plans</Label>
            {scheduled.map((p, i) => (
              <Animated.View
                key={p.id}
                entering={FadeInDown.delay(i * 50).duration(300)}
                style={{ marginBottom: 10 }}
              >
                <Glass radius={radius.lg} innerStyle={styles.planRow}>
                  <View style={{ flex: 1, gap: 10 }}>
                    <ScoreBar
                      percent={(progressOf(p).done / progressOf(p).total) * 100}
                      label={`${progressOf(p).done} of ${progressOf(p).total} days done`}
                      color={colors.leaf}
                    />
                    <Text variant="bodyMedium">{p.title}</Text>
                    <Small muted>
                      {formatDateShort(p.startDate)} →{' '}
                      {formatDateShort(p.days[p.days.length - 1].date)} · {p.days.length} day
                      {p.days.length > 1 ? 's' : ''}
                      {p.reminderIds?.length
                        ? ` · ${p.reminderIds.length} reminder${p.reminderIds.length > 1 ? 's' : ''}`
                        : ''}
                    </Small>
                  </View>
                  {!p.reminderIds?.length ? <BellOff size={16} color={colors.ink3} /> : null}
                  <Pressy
                    onPress={() => remove(p)}
                    haptics="select"
                    accessibilityLabel="Remove plan"
                    style={{ padding: 6 }}
                  >
                    <Trash2 size={18} color={colors.ink3} />
                  </Pressy>
                </Glass>
              </Animated.View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingBottom: 8,
  },
  nav: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  weekRow: { flexDirection: 'row', gap: 4 },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 12,
    minHeight: 40,
  },
  cellBig: {
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  cellActive: { backgroundColor: colors.night, borderColor: colors.night },
  dots: { flexDirection: 'row', gap: 3, marginTop: 3, height: 5 },
  dotSm: { width: 5, height: 5, borderRadius: 3 },
  dayHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 10,
  },
  dayTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.ink, marginTop: 2 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
});
