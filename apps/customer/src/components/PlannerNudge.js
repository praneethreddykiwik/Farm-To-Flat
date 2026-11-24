import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSelector } from 'react-redux';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Sparkles, X } from 'lucide-react-native';
import { Glass, Pressy, Small, Text } from '../ui';
import { selectAiVisible } from '../features/role/roleSlice';
import { selectDraft, selectScheduled } from '../features/plan/planSlice';
import { selectLanguage } from '../features/ui/uiSlice';
import { KV_KEYS, kv } from '../lib/kv';
import { hasTriedPlanner, shouldShowNudge, snoozeUntil } from '../lib/plannerNudge';
import { armPlannerNudge, clearPlannerNudge } from '../lib/plannerNudgeNotification';
import { todayISO } from '../lib/dates';
import { t } from '../lib/i18n';
import { track } from '../lib/tracking';
import { colors, radius } from '../theme';

/**
 * "Have you tried the meal planner?" with a direct Try it button. See lib/plannerNudge.js for who
 * sees it and how often.
 * @param {{ style?: any }} props
 */
export function PlannerNudge({ style }) {
  const router = useRouter();
  const lang = useSelector(selectLanguage);
  const visible = useSelector(selectAiVisible);
  const draft = useSelector(selectDraft);
  const scheduled = useSelector(selectScheduled);
  const tried = hasTriedPlanner({ draft, scheduled });
  const [state, setState] = useState(() => kv.getJSON(KV_KEYS.plannerNudge) || {});
  const [now] = useState(() => Date.now());
  const show = shouldShowNudge({ visible, tried, snoozedUntil: state.snoozedUntil, now });

  const save = (patch) => {
    const next = { ...(kv.getJSON(KV_KEYS.plannerNudge) || {}), ...patch };
    kv.setJSON(KV_KEYS.plannerNudge, next);
    setState(next);
  };

  // The reminder exists only while the question still makes sense.
  useEffect(() => {
    if (visible && !tried)
      armPlannerNudge({
        snoozedUntil: state.snoozedUntil,
        title: t('plannerNudgeTitle', lang),
        body: t('plannerNudgeBody', lang),
      });
    else clearPlannerNudge();
  }, [visible, tried, state.snoozedUntil, lang]);

  // Counted once a day, however often Home is opened.
  useEffect(() => {
    const today = todayISO();
    const saved = kv.getJSON(KV_KEYS.plannerNudge) || {};
    if (!show || saved.shownOn === today) return;
    kv.setJSON(KV_KEYS.plannerNudge, { ...saved, shownOn: today });
    track('planner_nudge_shown', { from: 'home' });
  }, [show]);

  if (!show) return null;
  return (
    <Animated.View entering={FadeInDown.duration(320).springify().damping(18)} style={style}>
      <Glass tone="dark" radius={radius.lg} innerStyle={styles.card}>
        <View style={styles.top}>
          <View style={styles.icon}>
            <Sparkles size={18} color={colors.ink} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium" color={colors.inkOnDark}>
              {t('plannerNudgeTitle', lang)}
            </Text>
            <Small color="rgba(243,245,239,0.72)" style={{ marginTop: 2 }}>
              {t('plannerNudgeBody', lang)}
            </Small>
          </View>
          <Pressy
            onPress={() => {
              track('planner_nudge_dismissed', { from: 'home' });
              save({ snoozedUntil: snoozeUntil(Date.now()) });
            }}
            haptics="select"
            accessibilityRole="button"
            accessibilityLabel={t('plannerNudgeLater', lang)}
            hitSlop={10}
          >
            <X size={18} color="rgba(243,245,239,0.72)" />
          </Pressy>
        </View>
        <Pressy
          onPress={() => {
            track('planner_nudge_tapped', { from: 'home' });
            router.push('/(tabs)/plan');
          }}
          haptics="soft"
          accessibilityRole="button"
        >
          <View style={styles.button}>
            <Text variant="bodyMedium" color={colors.ink}>
              {t('plannerNudgeTry', lang)}
            </Text>
          </View>
        </Pressy>
      </Glass>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: 12 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sprout,
  },
  button: {
    minHeight: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sprout,
  },
});
