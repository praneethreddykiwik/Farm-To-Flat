/**
 * Meal-plan adherence check-in (super-admin only for now).
 *
 * Today's planned meals, each with "I had it" / "Skipped". Saying you had it reveals "Add a photo";
 * the photo goes to the server's vision model, which reads back the dishes and an estimated calorie
 * count — so we can show PLANNED vs ACTUAL, not just a self-report. A rolling 7-day adherence summary
 * sits at the top.
 *
 * Gated on the SUPER_ADMIN role (selectAiVisible), the same gate as the AI planner. Rolling this out
 * to customers later is removing that gate — the screen itself makes no assumption about who's here.
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, Camera, Check, Utensils, X } from 'lucide-react-native';
import { Ambient, Body, Button, Glass, Pressy, Small, Text, Title } from '../src/ui';
import { colors, fonts, radius } from '../src/theme';
import { selectAiVisible } from '../src/features/role/roleSlice';
import { selectMealsOn } from '../src/features/plan/planSlice';
import { showToast } from '../src/features/ui/uiSlice';
import {
  useMealAdherenceQuery,
  useMealCheckinMutation,
  useMealDayQuery,
  useMealPhotoMutation,
} from '../src/api/api';
import { pickPhoto } from '../src/lib/photoPicker';

const SLOT_ORDER = ['breakfast', 'lunch', 'snack', 'dinner'];
const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

export default function MealCheckin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const aiVisible = useSelector(selectAiVisible);
  const date = todayISO();
  const meals = useSelector(selectMealsOn(date));
  const { data: dayData, refetch } = useMealDayQuery(date, { skip: !aiVisible });
  const { data: adh, refetch: refetchAdh } = useMealAdherenceQuery(
    { from: daysAgoISO(6), to: date },
    { skip: !aiVisible },
  );
  const [checkin] = useMealCheckinMutation();
  const [uploadPhoto] = useMealPhotoMutation();
  const [busy, setBusy] = useState(null); // the slot currently saving

  const logsBySlot = useMemo(() => {
    const m = {};
    for (const l of dayData?.logs || []) m[l.slot] = l;
    return m;
  }, [dayData]);

  const ordered = useMemo(
    () => [...meals].sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot)),
    [meals],
  );

  const fail = (message) =>
    dispatch(showToast({ title: 'Could not save', message, tone: 'error' }));

  async function respond(meal, status) {
    setBusy(meal.slot);
    try {
      await checkin({
        date,
        slot: meal.slot,
        mealName: meal.name,
        status,
        plannedKcal: Math.round(meal.totals?.kcal || 0),
      }).unwrap();
      await Promise.all([refetch(), refetchAdh()]);
    } catch (e) {
      fail(e?.data?.error?.message || 'Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function addPhoto(meal, log) {
    let shot = null;
    try {
      shot = await pickPhoto('camera');
    } catch (e) {
      if (e?.code === 'PERMISSION') shot = await pickPhoto('library');
    }
    if (!shot) return;
    setBusy(meal.slot);
    try {
      await uploadPhoto({
        id: log.id,
        imageBase64: shot.dataBase64,
        contentType: shot.contentType,
      }).unwrap();
      await Promise.all([refetch(), refetchAdh()]);
    } catch (e) {
      fail(e?.data?.error?.message || 'Could not read that photo.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.root}>
      <Ambient intensity={0.6} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Pressy
          onPress={() => router.back()}
          haptics="select"
          accessibilityLabel="Back"
          style={{ alignSelf: 'flex-start' }}
        >
          <Glass radius={radius.pill} innerStyle={styles.iconBtn}>
            <ArrowLeft size={20} color={colors.ink} />
          </Glass>
        </Pressy>

        <Animated.View entering={FadeInDown.duration(360)} style={{ marginTop: 18 }}>
          <Title>Today’s meals</Title>
          <Body muted style={{ marginTop: 6 }}>
            Log each meal and add a photo — we check what you actually ate against your plan.
          </Body>
        </Animated.View>

        {!aiVisible ? (
          <Glass radius={radius.lg} innerStyle={styles.card} style={{ marginTop: 20 }}>
            <Body>Meal tracking isn’t available on this account yet.</Body>
          </Glass>
        ) : (
          <>
            {adh && adh.totals?.meals > 0 ? <AdherenceCard adh={adh} /> : null}

            {ordered.length === 0 ? (
              <Glass radius={radius.lg} innerStyle={styles.card} style={{ marginTop: 20 }}>
                <Text variant="bodyMedium">No plan scheduled for today</Text>
                <Small muted style={{ marginTop: 6 }}>
                  Create and schedule a plan on the Plan tab, then come back to track each meal.
                </Small>
              </Glass>
            ) : (
              ordered.map((meal, i) => (
                <MealRow
                  key={meal.slot}
                  index={i}
                  meal={meal}
                  log={logsBySlot[meal.slot]}
                  busy={busy === meal.slot}
                  onFollow={() => respond(meal, 'FOLLOWED')}
                  onSkip={() => respond(meal, 'SKIPPED')}
                  onPhoto={(log) => addPhoto(meal, log)}
                />
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function AdherenceCard({ adh }) {
  const { totals, adherencePct, kcalDelta } = adh;
  return (
    <Animated.View entering={FadeInDown.delay(60).duration(360)}>
      <Glass radius={radius.lg} innerStyle={styles.card} style={{ marginTop: 18 }}>
        <Small muted style={styles.eyebrow}>
          LAST 7 DAYS
        </Small>
        <View style={styles.adhRow}>
          <View>
            <Text style={styles.bigNum}>{adherencePct == null ? '—' : `${adherencePct}%`}</Text>
            <Small muted>followed</Small>
          </View>
          <View style={styles.adhStat}>
            <Text variant="bodyMedium">{totals.plannedKcal || 0}</Text>
            <Small muted>planned kcal</Small>
          </View>
          <View style={styles.adhStat}>
            <Text variant="bodyMedium">{totals.actualKcal || 0}</Text>
            <Small muted>actual kcal</Small>
          </View>
        </View>
        <Small muted style={{ marginTop: 10 }}>
          {totals.followed} followed · {totals.skipped} skipped · {totals.deviated} off-plan
          {kcalDelta ? ` · ${kcalDelta > 0 ? '+' : ''}${kcalDelta} kcal vs plan` : ''}
        </Small>
      </Glass>
    </Animated.View>
  );
}

function MealRow({ index, meal, log, busy, onFollow, onSkip, onPhoto }) {
  const planned = Math.round(meal.totals?.kcal || 0);
  const followed = log?.status === 'FOLLOWED';
  const skipped = log?.status === 'SKIPPED';
  const deviated = log?.status === 'DEVIATED';
  const analysed = followed && log?.actualKcal != null;

  return (
    <Animated.View entering={FadeInDown.delay(120 + index * 60).duration(360)}>
      <Glass radius={radius.lg} innerStyle={styles.card} style={{ marginTop: 14 }}>
        <View style={styles.mealHead}>
          <View style={styles.mealIcon}>
            <Utensils size={18} color={colors.leafDeep} />
          </View>
          <View style={{ flex: 1 }}>
            <Small muted style={styles.eyebrow}>
              {SLOT_LABEL[meal.slot] || meal.slot}
            </Small>
            <Text variant="bodyMedium" numberOfLines={2}>
              {meal.name}
            </Text>
            <Small muted style={{ marginTop: 2 }}>
              ~{planned} kcal planned
              {analysed ? ` · ~${log.actualKcal} kcal eaten` : ''}
            </Small>
          </View>
          {busy ? <ActivityIndicator color={colors.leaf} /> : null}
          {followed ? (
            <View style={[styles.pill, { backgroundColor: 'rgba(30,122,76,0.12)' }]}>
              <Check size={14} color={colors.leafDeep} />
              <Small style={{ color: colors.leafDeep }}>Had it</Small>
            </View>
          ) : skipped ? (
            <View style={[styles.pill, { backgroundColor: 'rgba(14,27,20,0.06)' }]}>
              <X size={14} color={colors.ink3} />
              <Small muted>Skipped</Small>
            </View>
          ) : null}
        </View>

        {/* vision result */}
        {analysed && Array.isArray(log.items) && log.items.length ? (
          <View style={styles.analysis}>
            {log.items.slice(0, 6).map((it, k) => (
              <View key={k} style={styles.itemRow}>
                <Small numberOfLines={1} style={{ flex: 1 }}>
                  {it.name}
                  {it.grams ? ` · ${it.grams}g` : ''}
                </Small>
                {it.kcal != null ? <Small muted>{it.kcal} kcal</Small> : null}
              </View>
            ))}
            {log.confidence ? (
              <Small muted style={{ marginTop: 6 }}>
                Estimate · {log.confidence} confidence
              </Small>
            ) : null}
          </View>
        ) : null}

        {/* actions */}
        {!log || deviated ? (
          <View style={styles.actions}>
            <Button title="I had it" onPress={onFollow} disabled={busy} style={{ flex: 1 }} />
            <Button
              title="Skipped"
              variant="ghost"
              onPress={onSkip}
              disabled={busy}
              style={{ flex: 1 }}
            />
          </View>
        ) : followed && !analysed ? (
          <View style={styles.actions}>
            <Button
              title="Add a photo"
              onPress={() => onPhoto(log)}
              disabled={busy}
              leading={<Camera size={16} color={colors.canvas} />}
              style={{ flex: 1 }}
            />
          </View>
        ) : skipped ? (
          <Pressy onPress={onFollow} disabled={busy} style={{ marginTop: 10 }}>
            <Small center style={{ color: colors.leafDeep }}>
              Actually, I had it
            </Small>
          </Pressy>
        ) : analysed ? (
          <Pressy onPress={() => onPhoto(log)} disabled={busy} style={{ marginTop: 10 }}>
            <Small center muted>
              Retake photo
            </Small>
          </Pressy>
        ) : null}
      </Glass>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 16 },
  eyebrow: { letterSpacing: 0.6, fontSize: 11.5 },
  adhRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 22, marginTop: 10 },
  adhStat: { alignItems: 'flex-start' },
  bigNum: { fontFamily: fonts.display, fontSize: 36, color: colors.ink, lineHeight: 40 },
  mealHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mealIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,122,76,0.1)',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  analysis: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(14,27,20,0.1)',
    gap: 4,
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
});
