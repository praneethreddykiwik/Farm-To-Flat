import React, { useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { CalendarDays, Sparkles, UserRound, AlertTriangle, ArrowRight } from 'lucide-react-native';
import {
  Ambient,
  Button,
  Chip,
  Display,
  Glass,
  Label,
  Pressy,
  Sheet,
  Small,
  Text,
  Title,
} from '../../src/ui';
import { CartBar } from '../../src/components/CartBar';
import { ConfirmBanner } from '../../src/components/ConfirmBanner';
import { NutritionBars } from '../../src/components/NutritionBars';
import { ScoreBar } from '../../src/components/ScoreBar';
import { MealCard } from '../../src/components/MealCard';
import { PlanShoppingList } from '../../src/components/PlanShoppingList';
import { ProfileSheet } from '../../src/components/ProfileSheet';
import { useGetCatalogQuery } from '../../src/api/api';
import {
  draftSet,
  planScheduled,
  remindersAttached,
  selectDraft,
  selectProfile,
  selectProvider,
  selectScheduled,
} from '../../src/features/plan/planSlice';
import { showToast } from '../../src/features/ui/uiSlice';
import { generatePlan } from '../../src/lib/ai';
import { NUTRITION_SOURCE } from '../../src/lib/nutrition';
import { scheduleOrderReminders } from '../../src/lib/reminders';
import {
  addDaysISO,
  dayNumber,
  dayShort,
  monthShort,
  relativeDayLabel,
  todayISO,
} from '../../src/lib/dates';
import { haptic } from '../../src/lib/haptics';
import { colors, fonts, radius } from '../../src/theme';

const HORIZONS = [
  ['meal', 'One meal'],
  ['day', 'Today'],
  ['week', 'This week'],
  ['month', 'A month'],
];
const MEALS = [
  { n: 1, label: 'One meal' },
  { n: 2, label: '2 meals' },
  { n: 3, label: '3 meals' },
  { n: 4, label: '4 meals' },
];
const PROMPTS = [
  'I go to the gym, keep my protein high',
  'Light dinners, I want to lose weight',
  'Quick South Indian meals under 20 minutes',
  'Iron-rich greens for my mother, 55',
];

export default function Plan() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dispatch = useDispatch();
  const profile = useSelector(selectProfile);
  const provider = useSelector(selectProvider);
  const draft = useSelector(selectDraft);
  const scheduled = useSelector(selectScheduled);
  const catalog = useGetCatalogQuery();
  const products = useMemo(() => catalog.data?.products || [], [catalog.data]);
  const productsById = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products],
  );
  const [horizon, setHorizon] = useState(/** @type {any} */ ('day'));
  const [mealsPerDay, setMealsPerDay] = useState(Number(profile.mealsPerDay) || 3);
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState(addDaysISO(todayISO(), 1));
  const profileSheet = useRef(null);
  const scheduleSheet = useRef(null);
  const scrollRef = useRef(null);
  const profileReady = !!profile.age;

  const run = async () => {
    if (!profileReady) {
      profileSheet.current?.present();
      return;
    }
    setBusy(true);
    setError(null);
    haptic.soft();
    try {
      const plan = await generatePlan({
        profile: { ...profile, mealsPerDay },
        request,
        horizon,
        products,
        provider: provider || undefined,
        onProgress: setStage,
      });
      dispatch(draftSet(plan));
      haptic.success();
      setTimeout(() => scrollRef.current?.scrollTo({ y: 420, animated: true }), 250);
    } catch (e) {
      haptic.error();
      setError(e?.message || 'The planner is unavailable right now.');
    } finally {
      setBusy(false);
    }
  };

  const schedule = async (withReminder) => {
    if (!draft) return;
    const days = draft.days.map((d, i) => ({
      date: addDaysISO(startDate, i),
      meals: d.meals,
      totals: d.totals,
    }));
    const entry = {
      id: `sched_${Date.now().toString(36)}`,
      planId: draft.id,
      title: draft.title,
      horizon: draft.horizon,
      startDate,
      days,
      shopping: draft.shopping,
      targets: draft.targets,
      reminderIds: [],
    };
    dispatch(planScheduled(entry));
    scheduleSheet.current?.dismiss();
    if (withReminder) {
      const ids = await scheduleOrderReminders(entry);
      dispatch(remindersAttached({ id: entry.id, reminderIds: ids }));
      dispatch(
        showToast({
          title: ids.length
            ? `Reminder set for ${addDaysISO(startDate, -1)} at 6 pm`
            : 'Plan added. Notifications are off, so no reminder.',
          tone: ids.length ? 'success' : 'neutral',
        }),
      );
    } else {
      dispatch(showToast({ title: 'Added to your calendar', tone: 'success' }));
    }
    haptic.success();
    router.push('/calendar');
  };

  const dateStrip = Array.from({ length: 10 }, (_, i) => addDaysISO(todayISO(), i));

  return (
    <View style={styles.root}>
      <Ambient />
      {/* keyboardVerticalOffset keeps the tab bar clear; 'padding' alone clipped the page height,
          which stopped the generated plan from scrolling into view. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        style={{ flex: 1 }}
        enabled={false}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{
            paddingTop: insets.top + 12,
            paddingHorizontal: 20,
            paddingBottom: 220,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Display>Your dietitian</Display>
              <Small muted style={{ marginTop: 4 }}>
                Plans built only from what we harvest. Every number is computed, not guessed.
              </Small>
            </View>
            <Pressy
              onPress={() => profileSheet.current?.present()}
              haptics="select"
              accessibilityLabel="Your profile"
            >
              <Glass radius={radius.pill} innerStyle={styles.iconBtn}>
                <UserRound size={20} color={colors.ink} />
                {!profileReady ? <View style={styles.dot} /> : null}
              </Glass>
            </Pressy>
          </View>

          {scheduled.length ? (
            <Pressy
              onPress={() => router.push('/calendar')}
              haptics="soft"
              scale={0.985}
              style={{ marginTop: 16 }}
            >
              <Glass tone="dark" radius={radius.lg} innerStyle={styles.calRow}>
                <CalendarDays size={20} color={colors.sprout} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" color={colors.inkOnDark}>
                    {scheduled.length} plan{scheduled.length > 1 ? 's' : ''} on your calendar
                  </Text>
                  <Small color="rgba(243,245,239,0.7)">
                    Day, week and month views · order-before reminders
                  </Small>
                </View>
                <ArrowRight size={18} color={colors.sprout} />
              </Glass>
            </Pressy>
          ) : null}

          <ConfirmBanner style={{ marginTop: 12 }} />

          <Label style={{ marginTop: 22, marginBottom: 8 }}>Plan for</Label>
          <View style={styles.chips}>
            {HORIZONS.map(([k, l]) => (
              <Chip key={k} label={l} selected={horizon === k} onPress={() => setHorizon(k)} />
            ))}
          </View>

          {horizon !== 'meal' ? (
            <>
              <Label style={{ marginTop: 18, marginBottom: 8 }}>Meals a day</Label>
              <View style={styles.chips}>
                {MEALS.map(({ n, label }) => (
                  <Chip
                    key={n}
                    label={label}
                    selected={mealsPerDay === n}
                    onPress={() => setMealsPerDay(n)}
                  />
                ))}
              </View>
            </>
          ) : null}

          <Label style={{ marginTop: 18, marginBottom: 8 }}>Tell the planner</Label>
          <Glass radius={radius.lg} innerStyle={styles.inputWrap}>
            <TextInput
              value={request}
              onChangeText={setRequest}
              placeholder={
                profileReady
                  ? `e.g. ${PROMPTS[0]}`
                  : 'Add your age and goal first (tap the profile icon)'
              }
              placeholderTextColor={colors.ink3}
              multiline
              style={styles.input}
              editable={!busy}
            />
          </Glass>
          <View style={[styles.chips, { marginTop: 10 }]}>
            {PROMPTS.map((p) => (
              <Chip key={p} label={p} onPress={() => setRequest(p)} />
            ))}
          </View>

          <View style={{ marginTop: 16 }}>
            <Button
              title={
                busy ? stage || 'Planning…' : profileReady ? 'Build my plan' : 'Set up my profile'
              }
              onPress={run}
              loading={busy}
              variant="accent"
              icon={<Sparkles size={18} color={colors.ink} />}
            />
            {profileReady ? (
              <Small muted center style={{ marginTop: 8 }}>
                {profile.age} y · {profile.goal} · {profile.diet} ·{' '}
                {horizon === 'meal' ? 'one meal' : `${mealsPerDay} meals a day`}
                {profile.customInstructions ? ' · follows your instructions' : ''}
              </Small>
            ) : null}
          </View>

          {error ? (
            <Animated.View
              entering={FadeInDown.duration(240)}
              exiting={FadeOut}
              style={{ marginTop: 14 }}
            >
              <Glass radius={radius.md} innerStyle={styles.errorBox}>
                <AlertTriangle size={18} color={colors.tomato} />
                <Small color={colors.tomato} style={{ flex: 1 }}>
                  {error}
                </Small>
              </Glass>
            </Animated.View>
          ) : null}

          {draft ? (
            <Animated.View entering={FadeIn.duration(300)} style={{ marginTop: 28 }}>
              <Label>Your plan</Label>
              <Title style={{ marginTop: 2 }}>{draft.title}</Title>
              {draft.summary ? (
                <Small color={colors.ink2} style={{ marginTop: 4 }}>
                  {draft.summary}
                </Small>
              ) : null}

              <Animated.View
                entering={FadeInDown.delay(100).duration(360).springify().damping(18)}
                style={{ marginTop: 14 }}
              >
                <Glass tone="dark" radius={radius.xl} innerStyle={{ padding: 18 }}>
                  <View style={styles.coverHead}>
                    <Text variant="bodyMedium" color={colors.inkOnDark}>
                      {draft.days.length > 1 ? 'Average day from produce' : 'From produce'}
                    </Text>
                    <Small color="rgba(243,245,239,0.6)">of your daily target</Small>
                  </View>
                  <NutritionBars
                    totals={draft.averageDay}
                    targets={draft.targets}
                    dark
                    caption={`Computed from ${NUTRITION_SOURCE}. Pantry staples (rice, dal, curd, oil) add the rest.`}
                  />
                </Glass>
              </Animated.View>

              <Animated.View
                entering={FadeInDown.delay(220).duration(360).springify().damping(18)}
                style={{ marginTop: 12 }}
              >
                <Glass radius={radius.lg} innerStyle={{ padding: 16 }}>
                  <ScoreBar
                    percent={draft.score}
                    label="Goal coverage from produce"
                    caption={`${draft.days.length}-day plan · non-veg on ${draft.nonVegDays} of ${draft.days.length} days${draft.scaled ? ` · portions scaled ${draft.scaled}× to a real day's food` : ''} · protein weighted for your goal. Reaching 100% needs the pantry staples named in the steps.`}
                  />
                </Glass>
              </Animated.View>

              {draft.cautions?.length ? (
                <View style={{ marginTop: 12, gap: 6 }}>
                  {draft.cautions.map((c, i) => (
                    <View key={i} style={styles.caution}>
                      <AlertTriangle size={14} color={colors.amber} />
                      <Small color={colors.ink2} style={{ flex: 1 }}>
                        {c}
                      </Small>
                    </View>
                  ))}
                </View>
              ) : null}

              {draft.days.map((d, di) => (
                <View key={d.day} style={{ marginTop: 20 }}>
                  {draft.days.length > 1 ? (
                    <View style={styles.dayHead}>
                      <Text style={styles.dayTitle}>Day {d.day}</Text>
                      <Small muted>
                        {d.totals.kcal} kcal · {d.totals.protein} g protein
                      </Small>
                    </View>
                  ) : null}
                  <View style={{ gap: 10 }}>
                    {d.meals.map((m, mi) => (
                      <MealCard
                        key={`${di}-${mi}`}
                        meal={m}
                        productsById={productsById}
                        index={mi}
                        compact={draft.days.length > 3}
                      />
                    ))}
                  </View>
                </View>
              ))}

              <Label style={{ marginTop: 26, marginBottom: 8 }}>
                {draft.days.length > 7
                  ? 'What to order for the first week (repeats weekly)'
                  : 'What to order'}
              </Label>
              <PlanShoppingList
                shopping={draft.shopping}
                productsById={productsById}
                onSchedule={() => scheduleSheet.current?.present()}
              />

              <Small muted center style={{ marginTop: 16, fontSize: 11 }}>
                General nutrition guidance from reference tables, not medical advice. Consult a
                clinician for medical conditions. Engine: {draft.provider} · {draft.model}
              </Small>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn.delay(200)} style={{ marginTop: 32 }}>
              <Glass radius={radius.lg} innerStyle={{ padding: 16 }}>
                <Text variant="bodyMedium">Coming soon</Text>
                <Small muted style={{ marginTop: 4 }}>
                  Cold-pressed oils, millets, pulses and farm spices, so a whole recipe can be
                  ordered from one plan.
                </Small>
              </Glass>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <ProfileSheet ref={profileSheet} />

      <Sheet
        ref={scheduleSheet}
        title="Start on"
        subtitle="Ingredients arrive the morning of the first day. We remind you to order the evening before."
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
        >
          {dateStrip.map((d) => {
            const active = d === startDate;
            return (
              <Pressy key={d} onPress={() => setStartDate(d)} haptics="select">
                <View style={[styles.day, active && styles.dayActive]}>
                  <Small
                    color={active ? 'rgba(243,245,239,0.7)' : colors.ink3}
                    style={{ fontSize: 11 }}
                  >
                    {dayShort(d).toUpperCase()}
                  </Small>
                  <Text
                    style={{
                      fontFamily: fonts.display,
                      fontSize: 22,
                      color: active ? colors.sprout : colors.ink,
                      marginTop: 2,
                    }}
                  >
                    {dayNumber(d)}
                  </Text>
                  <Small
                    color={active ? 'rgba(243,245,239,0.7)' : colors.ink3}
                    style={{ fontSize: 11 }}
                  >
                    {monthShort(d)}
                  </Small>
                </View>
              </Pressy>
            );
          })}
        </ScrollView>
        <Small muted style={{ marginTop: 12 }}>
          {relativeDayLabel(startDate)} →{' '}
          {draft ? addDaysISO(startDate, draft.days.length - 1) : startDate}
        </Small>
        <Button
          title="Add and remind me to order"
          onPress={() => schedule(true)}
          style={{ marginTop: 18 }}
        />
        <Button
          title="Add without reminder"
          variant="glass"
          onPress={() => schedule(false)}
          style={{ marginTop: 10 }}
        />
      </Sheet>

      <CartBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconBtn: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.tomato,
  },
  calRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inputWrap: { padding: 14 },
  input: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  coverHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  caution: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  dayHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dayTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
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
});
