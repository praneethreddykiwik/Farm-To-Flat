/**
 * Calorie tracker — what did I actually eat today? (super-admin only for now)
 *
 * One screen: the day as a ring against the target, the three macros, the logging streak, and the
 * day's meals. Each meal has a "+" that opens one sheet — snap the plate, say you had the planned
 * meal, pick foods from the list, or mark it skipped. A logged meal opens to show every dish the
 * photo found, and can be corrected in one tap: bigger or smaller portion, how much oil went in,
 * drop a dish the camera got wrong.
 *
 * WHAT IT IS CAREFUL ABOUT
 *  • It asks first. Nothing is kept until the customer has read what is kept — the meals, the
 *    photographs (for a fixed number of days), and that each photo is sent to an AI service to be
 *    read — and said yes. That choice can be withdrawn here at any time.
 *  • It does not pretend. A photo cannot measure a meal, and misses cooking oil most of all, so every
 *    estimate comes with a range and the screen says plainly that this is not a medical device.
 *  • It does not scold. Going over the target does not turn anything red, and the streak forgives a
 *    missed day.
 *
 * Opened from the Planner tab, or straight from a meal-time reminder: `?slot=lunch&do=snap|had|skip`
 * carries the button the customer pressed on the notification.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  ChevronDown,
  ChevronUp,
  Cookie,
  Flame,
  Moon,
  Plus,
  Sun,
  Sunrise,
  Trash2,
  X,
} from 'lucide-react-native';
import { Ambient, Body, Button, Chip, Glass, Label, Pressy, Small, Text, Title } from '../src/ui';
import { CalorieRing, MacroBar } from '../src/components/CalorieRing';
import { MealLogSheet } from '../src/components/MealLogSheet';
import { ProfileSheet } from '../src/components/ProfileSheet';
import { colors, fonts, radius } from '../src/theme';
import { selectAiVisible } from '../src/features/role/roleSlice';
import { profileUpdated, selectMealsOn, selectProfile } from '../src/features/plan/planSlice';
import { showToast } from '../src/features/ui/uiSlice';
import {
  useMealCorrectMutation,
  useMealDayQuery,
  useMealDeleteMutation,
  useMealLogMutation,
  useMealStreakQuery,
} from '../src/api/api';
import { dailyTargets } from '../src/lib/nutrition';
import { pickPhoto } from '../src/lib/photoPicker';
import { settleMealReminder } from '../src/lib/mealReminders';
import { todayISO } from '../src/lib/dates';
import { haptic } from '../src/lib/haptics';

const SLOT_ORDER = ['breakfast', 'lunch', 'snack', 'dinner'];
const SLOT = {
  breakfast: { label: 'Breakfast', Icon: Sunrise, tint: colors.butter },
  lunch: { label: 'Lunch', Icon: Sun, tint: colors.mint },
  snack: { label: 'Snack', Icon: Cookie, tint: colors.blush },
  dinner: { label: 'Dinner', Icon: Moon, tint: colors.lilac },
};
const OIL = [
  ['none', 'No oil'],
  ['light', 'A little'],
  ['normal', 'Normal'],
  ['heavy', 'Generous'],
];
const CHECK_NOTE = {
  adjusted: 'corrected to a typical value',
  unverified: 'not in our reference list',
  yours: 'as you set it',
};
const n0 = (v) => Math.round(Number(v) || 0).toLocaleString('en-IN');

export default function MealTracker() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const params = useLocalSearchParams();
  const aiVisible = useSelector(selectAiVisible);
  const profile = useSelector(selectProfile);
  const date = todayISO(); // the customer's day, in IST — not the UTC date
  const planned = useSelector(selectMealsOn(date));
  const consented = !!profile.trackingConsentAt;
  const live = aiVisible && consented;

  const { data: day, isLoading } = useMealDayQuery(date, { skip: !live });
  const { data: streak } = useMealStreakQuery(date, { skip: !live });
  const [logMeal] = useMealLogMutation();
  const [correct] = useMealCorrectMutation();
  const [remove] = useMealDeleteMutation();
  const [busy, setBusy] = useState(/** @type {string|null} */ (null));
  const [open, setOpen] = useState(/** @type {string|null} */ (null));
  const sheet = useRef(null);
  const profileSheet = useRef(null);

  const logsBySlot = useMemo(() => {
    const m = {};
    for (const l of day?.logs || []) m[l.slot] = l;
    return m;
  }, [day]);
  const plannedBySlot = useMemo(() => {
    const m = {};
    for (const p of planned) m[p.slot] = { name: p.name, kcal: p.totals?.kcal || 0 };
    return m;
  }, [planned]);

  const targets = useMemo(() => dailyTargets(profile), [profile]);
  const totals = day?.summary?.totals || { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const retention = day?.photoRetentionDays || 35;
  const remindersOn = profile.mealReminders ?? planned.length > 0;

  const fail = useCallback(
    (e, fallback) =>
      dispatch(
        showToast({
          title: 'Could not save that',
          message: e?.data?.error?.message || fallback || 'Please try again.',
          tone: 'error',
        }),
      ),
    [dispatch],
  );

  /** Every way of logging a meal ends here. */
  const send = useCallback(
    async (slot, body) => {
      setBusy(slot);
      try {
        const p = plannedBySlot[slot];
        await logMeal({
          date,
          slot,
          ...(p ? { mealName: p.name, plannedKcal: Math.round(p.kcal) } : {}),
          ...body,
        }).unwrap();
        haptic.success();
        sheet.current?.close();
        if (body.mode !== 'skipped') setOpen(slot);
        settleMealReminder(date, slot); // this meal is answered — its reminder must not fire
      } catch (e) {
        haptic.error();
        fail(
          e,
          body.mode === 'photo'
            ? 'Could not read that photo. Try again in better light.'
            : undefined,
        );
      } finally {
        setBusy(null);
      }
    },
    [date, fail, logMeal, plannedBySlot],
  );

  const snap = useCallback(
    /** @param {string} slot @param {'camera'|'library'} [source] */
    async (slot, source = 'camera') => {
      let shot = null;
      try {
        shot = await pickPhoto(source);
      } catch (e) {
        // camera refused: the gallery still works, and is better than a dead end
        if (e?.code === 'PERMISSION' && source === 'camera') {
          try {
            shot = await pickPhoto('library');
          } catch {
            shot = null;
          }
        } else fail(e, e?.message);
      }
      if (!shot) return;
      await send(slot, {
        mode: 'photo',
        imageBase64: shot.dataBase64,
        contentType: shot.contentType,
      });
    },
    [fail, send],
  );

  // Arrived from a reminder's action button: do the thing that was pressed, once.
  const acted = useRef(false);
  useEffect(() => {
    if (!live || acted.current || isLoading) return;
    const slot = SLOT_ORDER.includes(String(params.slot)) ? String(params.slot) : null;
    const act = String(params.do || '');
    if (!slot || !act) return;
    acted.current = true;
    // Deferred a beat: the camera (or the save) starts once this screen has finished arriving,
    // not in the middle of its first render. Deliberately not cleared on re-render — `acted` is
    // already set, so cancelling here would silently drop what the customer pressed.
    setTimeout(() => {
      if (act === 'snap') snap(slot);
      else if (act === 'skip') send(slot, { mode: 'skipped' });
      else if (act === 'had') {
        if (plannedBySlot[slot]) send(slot, { mode: 'planned' });
        else sheet.current?.open(slot); // nothing planned to have "had" — ask what it was
      }
    }, 300);
  }, [live, isLoading, params.slot, params.do, snap, send, plannedBySlot]);

  const adjust = async (log, body) => {
    setBusy(log.slot);
    try {
      await correct({ id: log.id, ...body }).unwrap();
      haptic.soft();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const del = async (log) => {
    setBusy(log.slot);
    try {
      await remove(log.id).unwrap();
      setOpen(null);
      dispatch(
        showToast({
          title: 'Removed',
          message: 'The meal and its photo are deleted.',
          tone: 'neutral',
        }),
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.root}>
      <Ambient intensity={0.6} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 48,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressy onPress={() => router.back()} haptics="select" accessibilityLabel="Back">
            <Glass radius={radius.pill} innerStyle={styles.iconBtn}>
              <ArrowLeft size={20} color={colors.ink} />
            </Glass>
          </Pressy>
          <Title style={{ flex: 1, textAlign: 'center' }}>Calorie tracker</Title>
          {live ? (
            <Pressy
              onPress={() => {
                dispatch(profileUpdated({ mealReminders: !remindersOn }));
                dispatch(
                  showToast({
                    title: remindersOn ? 'Meal reminders off' : 'Meal reminders on',
                    message: remindersOn
                      ? undefined
                      : 'We’ll nudge you at meal times, and stop once you’ve logged.',
                    tone: 'neutral',
                  }),
                );
              }}
              haptics="select"
              accessibilityRole="switch"
              accessibilityState={{ checked: remindersOn }}
              accessibilityLabel="Meal-time reminders"
            >
              <Glass radius={radius.pill} innerStyle={styles.iconBtn}>
                {remindersOn ? (
                  <Bell size={19} color={colors.leafDeep} />
                ) : (
                  <BellOff size={19} color={colors.ink3} />
                )}
              </Glass>
            </Pressy>
          ) : (
            <View style={{ width: 44 }} />
          )}
        </View>

        {!aiVisible ? (
          <Glass radius={radius.lg} innerStyle={styles.card} style={{ marginTop: 20 }}>
            <Body>Meal tracking isn’t available on this account yet.</Body>
          </Glass>
        ) : !consented ? (
          <Consent
            retention={retention}
            onAgree={() => {
              dispatch(profileUpdated({ trackingConsentAt: new Date().toISOString() }));
              haptic.success();
            }}
            onDecline={() => router.back()}
          />
        ) : (
          <>
            {/* the day */}
            <Animated.View entering={FadeInDown.duration(360)}>
              <Glass radius={radius.xl} innerStyle={styles.dayCard} style={{ marginTop: 18 }}>
                <CalorieRing
                  eaten={totals.kcal}
                  target={targets.kcal}
                  low={totals.kcalLow}
                  high={totals.kcalHigh}
                />
                <Pressy
                  onPress={() => profileSheet.current?.present()}
                  haptics="select"
                  accessibilityRole="button"
                  accessibilityLabel="Change your daily target"
                  style={styles.edit}
                >
                  <Small style={{ fontFamily: fonts.bodyMedium }}>
                    {profile.age ? 'Change target' : 'Set your target'}
                  </Small>
                </Pressy>
                <View style={styles.macros}>
                  <MacroBar label="Carbs" value={totals.carbs} target={targets.carbs} />
                  <MacroBar label="Fat" value={totals.fat} target={targets.fat} />
                  <MacroBar label="Protein" value={totals.protein} target={targets.protein} />
                </View>
              </Glass>
            </Animated.View>

            {/* the streak */}
            {streak ? <Streak streak={streak} /> : null}

            {/* the meals */}
            <Label style={{ marginTop: 26, marginBottom: 2 }}>Today’s meals</Label>
            {isLoading ? <ActivityIndicator color={colors.leaf} style={{ marginTop: 24 }} /> : null}
            {SLOT_ORDER.map((slot, i) => (
              <MealRow
                key={slot}
                index={i}
                slot={slot}
                planned={plannedBySlot[slot]}
                log={logsBySlot[slot]}
                busy={busy === slot}
                expanded={open === slot}
                onToggle={() => setOpen(open === slot ? null : slot)}
                onAdd={() => sheet.current?.open(slot)}
                onAdjust={adjust}
                onRetake={() => snap(slot)}
                onDelete={del}
              />
            ))}

            <Small muted style={styles.fine}>
              Calories are estimated from your photo and typical recipes. One photo cannot measure a
              meal, and it tends to miss cooking oil, so read the number as a guide and the range as
              the truth. This is general information for building a habit — not medical advice, and
              not a medical device. Speak to a doctor before changing your diet for a health
              condition. Photos are deleted after {retention} days; the numbers stay until you
              delete them.
            </Small>
            <Pressy
              onPress={() => {
                dispatch(profileUpdated({ trackingConsentAt: null, mealReminders: false }));
                dispatch(
                  showToast({
                    title: 'Tracking turned off',
                    message:
                      'Delete individual meals from their card. Deleting your account removes all of them.',
                    tone: 'neutral',
                  }),
                );
              }}
              haptics="select"
              accessibilityRole="button"
              style={{
                marginTop: 14,
                alignSelf: 'center',
                minHeight: 44,
                justifyContent: 'center',
              }}
            >
              <Small color={colors.ink2} style={{ textDecorationLine: 'underline' }}>
                Stop tracking and withdraw my consent
              </Small>
            </Pressy>
          </>
        )}
      </ScrollView>

      <MealLogSheet
        ref={sheet}
        labelFor={(s) => SLOT[s].label}
        plannedFor={(s) => plannedBySlot[s] || null}
        busy={!!busy}
        onPhoto={(s, source) => snap(s, source)}
        onPlanned={(s) => send(s, { mode: 'planned' })}
        onPicks={(s, picks) =>
          send(s, { mode: 'pick', picks, append: !!logsBySlot[s]?.items?.length })
        }
        onSkip={(s) => send(s, { mode: 'skipped' })}
      />
      <ProfileSheet ref={profileSheet} />
    </View>
  );
}

/** What we keep, said before we keep it. */
function Consent({ retention, onAgree, onDecline }) {
  const lines = [
    ['The meals you log', 'and the calories and macros estimated for each one.'],
    ['A photo of each meal', `kept for ${retention} days so you can look back, then deleted.`],
    [
      'Each photo is read by an AI service',
      'It is sent to our image-recognition provider (Groq) to name the dishes. It is not used for advertising.',
    ],
    [
      'Your age, weight, height and goal',
      'are stored on this phone and set your daily target. They are sent to the planner only when you ask it for a plan.',
    ],
  ];
  return (
    <Animated.View entering={FadeInDown.duration(360)}>
      <Glass radius={radius.xl} innerStyle={{ padding: 20 }} style={{ marginTop: 20 }}>
        <Text style={styles.consentTitle}>Before you start</Text>
        <Body muted style={{ marginTop: 6 }}>
          Tracking what you eat means keeping a record of it. This is what that record is.
        </Body>
        <View style={{ marginTop: 16, gap: 14 }}>
          {lines.map(([head, rest]) => (
            <View key={head} style={styles.consentRow}>
              <View style={styles.consentDot} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium">{head}</Text>
                <Small muted style={{ marginTop: 1 }}>
                  {rest}
                </Small>
              </View>
            </View>
          ))}
        </View>
        <Small color={colors.ink2} style={{ marginTop: 16 }}>
          You can delete any meal, turn tracking off, or delete your account and everything with it,
          at any time. The estimates are general information, not medical advice.
        </Small>
        <Button title="I agree — start tracking" onPress={onAgree} style={{ marginTop: 18 }} />
        <Button title="Not now" variant="ghost" onPress={onDecline} style={{ marginTop: 6 }} />
      </Glass>
    </Animated.View>
  );
}

function Streak({ streak }) {
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return (
    <Animated.View entering={FadeInDown.delay(80).duration(360)}>
      <Glass radius={radius.lg} innerStyle={styles.card} style={{ marginTop: 12 }}>
        <View style={styles.streakHead}>
          <View style={[styles.flame, streak.current > 0 && { backgroundColor: colors.amberSoft }]}>
            <Flame size={20} color={streak.current > 0 ? colors.amber : colors.ink3} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium">
              {streak.current > 0
                ? `${streak.current}-day streak`
                : streak.best > 0
                  ? 'Start a new streak today'
                  : 'Log a meal to start your streak'}
            </Text>
            <Small muted>
              {streak.daysThisWeek} of {streak.weeklyGoal} days this week
              {streak.best > streak.current ? ` · best ${streak.best}` : ''}
            </Small>
          </View>
          {streak.goalMet ? (
            <View style={styles.goal}>
              <Check size={13} color={colors.leafDeep} />
              <Small color={colors.leafDeep}>Week done</Small>
            </View>
          ) : null}
        </View>
        <View
          style={styles.week}
          accessible
          accessibilityLabel={`${streak.daysThisWeek} of the last seven days logged`}
        >
          {streak.week.map((d) => {
            const [y, m, dd] = d.date.split('-').map(Number);
            const wd = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
            return (
              <View key={d.date} style={styles.weekDay}>
                <View style={[styles.weekDot, d.logged && styles.weekDotOn]}>
                  {d.logged ? <Check size={13} color={colors.inkOnDark} /> : null}
                </View>
                <Small muted style={{ fontSize: 11 }}>
                  {days[wd]}
                </Small>
              </View>
            );
          })}
        </View>
        {streak.restDaysUsed > 0 ? (
          <Small muted style={{ marginTop: 10, fontSize: 11.5 }}>
            One missed day a week doesn’t break your streak.
          </Small>
        ) : null}
      </Glass>
    </Animated.View>
  );
}

function MealRow({
  index,
  slot,
  planned,
  log,
  busy,
  expanded,
  onToggle,
  onAdd,
  onAdjust,
  onRetake,
  onDelete,
}) {
  const { label, Icon, tint } = SLOT[slot];
  const skipped = log?.status === 'SKIPPED';
  const eaten = log && !skipped;
  const items = Array.isArray(log?.items) ? log.items : [];
  const kcal = eaten ? (log.actualKcal != null ? log.actualKcal : log.plannedKcal) : null;
  const oilNow = items.find((it) => it.dish === 'added-fat');
  const oilLevel = !oilNow
    ? null
    : oilNow.grams <= 5
      ? 'light'
      : oilNow.grams <= 10
        ? 'normal'
        : 'heavy';

  return (
    <Animated.View entering={FadeInDown.delay(140 + index * 50).duration(340)}>
      <Glass radius={radius.lg} innerStyle={{ padding: 0 }} style={{ marginTop: 10 }}>
        <Pressy
          onPress={eaten && items.length ? onToggle : onAdd}
          haptics="select"
          scale={0.99}
          accessibilityRole="button"
          accessibilityLabel={`${label}${eaten && kcal != null ? `, ${n0(kcal)} kilocalories logged` : skipped ? ', skipped' : ', not logged yet'}`}
          style={styles.mealHead}
        >
          <View style={[styles.mealIcon, { backgroundColor: tint }]}>
            <Icon size={20} color={colors.ink} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium">{label}</Text>
            <Small muted numberOfLines={1}>
              {eaten
                ? `${kcal != null ? `${n0(kcal)} kcal` : 'Logged'}${log.source === 'plan' ? ' · as planned' : ''}`
                : skipped
                  ? 'Skipped'
                  : planned
                    ? `Planned: ${planned.name}`
                    : 'Not logged yet'}
            </Small>
          </View>
          {busy ? (
            <ActivityIndicator color={colors.leaf} />
          ) : eaten && items.length ? (
            expanded ? (
              <ChevronUp size={20} color={colors.ink3} />
            ) : (
              <ChevronDown size={20} color={colors.ink3} />
            )
          ) : (
            <View style={[styles.plus, (eaten || skipped) && styles.plusDone]}>
              {eaten ? (
                <Check size={18} color={colors.leafDeep} />
              ) : skipped ? (
                <X size={18} color={colors.ink3} />
              ) : (
                <Plus size={20} color={colors.inkOnDark} />
              )}
            </View>
          )}
        </Pressy>

        {eaten && items.length && expanded ? (
          <View style={styles.detail}>
            {items.map((it, k) => (
              <View key={`${it.name}-${k}`} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Small numberOfLines={1} style={{ color: colors.ink }}>
                    {it.name}
                    {it.grams ? ` · ${it.grams} g` : ''}
                  </Small>
                  {CHECK_NOTE[it.check] ? (
                    <Small muted style={{ fontSize: 11 }}>
                      {CHECK_NOTE[it.check]}
                    </Small>
                  ) : null}
                </View>
                {it.kcal != null ? (
                  <Small muted style={styles.tab}>
                    {n0(it.kcal)} kcal
                  </Small>
                ) : null}
                {it.dish !== 'added-fat' && items.length > 1 ? (
                  <Pressy
                    onPress={() => onAdjust(log, { removeItem: k })}
                    disabled={busy}
                    haptics="select"
                    accessibilityLabel={`Remove ${it.name}`}
                    style={styles.removeItem}
                  >
                    <X size={15} color={colors.ink3} />
                  </Pressy>
                ) : (
                  <View style={{ width: 8 }} />
                )}
              </View>
            ))}

            {log.totals ? (
              <View style={styles.totals}>
                <Small muted style={styles.tab}>
                  Carbs {Math.round(log.totals.carbs)} g · Fat {Math.round(log.totals.fat)} g ·
                  Protein {Math.round(log.totals.protein)} g
                </Small>
                {log.source === 'photo' ? (
                  <Small muted style={{ marginTop: 3 }}>
                    Likely {n0(log.totals.kcalLow)}–{n0(log.totals.kcalHigh)} kcal ·{' '}
                    {log.confidence || 'low'} confidence
                  </Small>
                ) : null}
                {log.note ? (
                  <Small muted style={{ marginTop: 3 }}>
                    {log.note}
                  </Small>
                ) : null}
              </View>
            ) : null}

            <Label style={{ marginTop: 14 }}>Was the portion right?</Label>
            <View style={styles.chips}>
              <Chip label="Smaller" onPress={() => onAdjust(log, { scale: 0.75 })} />
              <Chip label="Bigger" onPress={() => onAdjust(log, { scale: 1.25 })} />
            </View>
            {/* Asked of a PHOTO only. A photo cannot see the oil a dish was cooked in, which is the
                biggest thing it gets wrong. A food picked from the list already carries a typical
                recipe's oil in its number — asking again would count it twice. */}
            {log.source === 'photo' ? (
              <>
                <Label style={{ marginTop: 14 }}>How much oil or ghee went in?</Label>
                <View style={styles.chips}>
                  {OIL.map(([key, text]) => (
                    <Chip
                      key={key}
                      label={text}
                      selected={oilLevel === key}
                      onPress={() => onAdjust(log, { oil: key })}
                    />
                  ))}
                </View>
              </>
            ) : null}

            <View style={styles.rowActions}>
              <Pressy
                onPress={onAdd}
                haptics="select"
                accessibilityRole="button"
                style={styles.linkBtn}
              >
                <Small color={colors.leafDeep} style={{ fontFamily: fonts.bodyMedium }}>
                  Add more
                </Small>
              </Pressy>
              <Pressy
                onPress={onRetake}
                haptics="select"
                accessibilityRole="button"
                style={styles.linkBtn}
              >
                <Small color={colors.leafDeep} style={{ fontFamily: fonts.bodyMedium }}>
                  {log.source === 'photo' ? 'Retake photo' : 'Use a photo instead'}
                </Small>
              </Pressy>
              <Pressy
                onPress={() => onDelete(log)}
                haptics="select"
                accessibilityRole="button"
                accessibilityLabel={`Delete ${label.toLowerCase()} and its photo`}
                style={[styles.linkBtn, styles.deleteBtn]}
              >
                <Trash2 size={15} color={colors.tomato} />
                <Small color={colors.tomato} style={{ fontFamily: fonts.bodyMedium }}>
                  Delete
                </Small>
              </Pressy>
            </View>
          </View>
        ) : null}

        {(eaten && !items.length) || skipped ? (
          <View style={styles.thin}>
            <Pressy
              onPress={onAdd}
              haptics="select"
              accessibilityRole="button"
              style={styles.linkBtn}
            >
              <Small color={colors.leafDeep} style={{ fontFamily: fonts.bodyMedium }}>
                {skipped ? 'Actually, I ate' : 'Add a photo to check the calories'}
              </Small>
            </Pressy>
            <Pressy
              onPress={() => onDelete(log)}
              haptics="select"
              accessibilityRole="button"
              accessibilityLabel={`Clear ${label.toLowerCase()}`}
              style={[styles.linkBtn, { marginLeft: 'auto' }]}
            >
              <Small muted>Clear</Small>
            </Pressy>
          </View>
        ) : null}
      </Glass>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 16 },
  dayCard: { padding: 20, alignItems: 'center' },
  edit: {
    marginTop: 12,
    minHeight: 44,
    paddingHorizontal: 18,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  macros: { flexDirection: 'row', alignSelf: 'stretch', marginTop: 20 },
  streakHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flame: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvasDeep,
  },
  goal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.leafSoft,
  },
  week: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  weekDay: { alignItems: 'center', gap: 4 },
  weekDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvasDeep,
  },
  weekDotOn: { backgroundColor: colors.leaf },
  mealHead: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, minHeight: 72 },
  mealIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.night,
  },
  plusDone: { backgroundColor: colors.canvasDeep },
  detail: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    paddingTop: 10,
  },
  // Each item is a name line and, often, a note line under it. Without the padding the note of one
  // row sat against the name of the next and read as belonging to it.
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingVertical: 2,
  },
  removeItem: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -10,
  },
  tab: { fontVariant: ['tabular-nums'] },
  totals: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 14 },
  thin: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 6,
    marginTop: -6,
  },
  linkBtn: { minHeight: 44, justifyContent: 'center' },
  // A row (icon + word), so it needs its own cross-axis centring — without it "Delete" rode
  // higher than the two links beside it.
  deleteBtn: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6 },
  fine: { marginTop: 22, fontSize: 11.5, lineHeight: 17 },
  consentTitle: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 30,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  consentRow: { flexDirection: 'row', gap: 12 },
  consentDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.leaf, marginTop: 8 },
});
