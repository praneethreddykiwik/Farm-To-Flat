import React, { useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';
import { useSelector } from 'react-redux';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BadgeCheck, Gift } from 'lucide-react-native';
import { Glass, Input, Label, Pressy, Small, Text } from '../ui';
import { useCheckCodeMutation, useGetFirstOrderQuery } from '../api/api';
import { selectLanguage } from '../features/ui/uiSlice';
import { haptic } from '../lib/haptics';
import { t } from '../lib/i18n';
import { colors, radius } from '../theme';

/**
 * Where this order came from (17 Nov 2026 review), asked at checkout and always optional:
 *   - "Have a code?" — the promoter at a community stall, or a neighbour's invite code. Checked with
 *     the server as soon as it is applied, so a typo is a message now, not a lost credit later.
 *   - "How did you hear about Fooducia?" — first order only, one tap, skippable.
 *
 * Reports `{ code, heardFrom }` upward; a code is only reported once the server accepted it.
 * @param {{ onChange: (v: { code: string|null, heardFrom: string|null }) => void }} props
 */
export function OrderSource({ onChange }) {
  const lang = useSelector(selectLanguage);
  const { data: first } = useGetFirstOrderQuery();
  const [check, { isLoading }] = useCheckCodeMutation();
  const [text, setText] = useState('');
  const [applied, setApplied] = useState(
    /** @type {{ code: string, message: string|null }|null} */ (null),
  );
  const [error, setError] = useState(/** @type {string|null} */ (null));
  const [heard, setHeard] = useState(/** @type {string|null} */ (null));

  const report = (next) => onChange({ code: applied?.code ?? null, heardFrom: heard, ...next });

  const apply = async () => {
    const code = text.trim().toUpperCase();
    if (!code) return;
    Keyboard.dismiss();
    try {
      const r = await check(code).unwrap();
      haptic.success();
      setApplied({ code, message: r?.message || null });
      setError(null);
      report({ code });
    } catch (e) {
      haptic.warning();
      setError(e?.message || 'That code isn’t recognised.');
    }
  };
  const remove = () => {
    setApplied(null);
    setText('');
    setError(null);
    report({ code: null });
  };
  const pick = (key) => {
    const next = heard === key ? null : key;
    setHeard(next);
    onChange({ code: applied?.code ?? null, heardFrom: next });
  };

  return (
    <View style={{ gap: 20 }}>
      <View>
        <Label>{t('haveACode', lang)}</Label>
        <Glass radius={radius.lg} innerStyle={{ padding: 12, marginTop: 8 }}>
          {applied ? (
            <Animated.View entering={FadeIn.duration(200)} style={styles.applied}>
              <BadgeCheck size={20} color={colors.leafDeep} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium">{applied.code}</Text>
                {applied.message ? <Small muted>{applied.message}</Small> : null}
              </View>
              <Pressy onPress={remove} haptics="select" accessibilityRole="button">
                <Text variant="smallMedium" color={colors.tomato}>
                  {t('codeRemove', lang)}
                </Text>
              </Pressy>
            </Animated.View>
          ) : (
            <View style={styles.row}>
              <Input
                value={text}
                onChangeText={(v) => {
                  setText(
                    v
                      .replace(/[^A-Za-z0-9]/g, '')
                      .slice(0, 12)
                      .toUpperCase(),
                  );
                  setError(null);
                }}
                placeholder={t('codeHint', lang)}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={12}
                error={error}
                leading={<Gift size={18} color={colors.ink3} />}
                style={{ flex: 1 }}
                onSubmitEditing={apply}
                returnKeyType="done"
              />
              <Pressy
                onPress={apply}
                haptics="select"
                disabled={!text.trim() || isLoading}
                accessibilityRole="button"
              >
                <View style={[styles.applyBtn, (!text.trim() || isLoading) && { opacity: 0.45 }]}>
                  <Text variant="smallMedium" color={colors.inkOnDark}>
                    {isLoading ? '…' : t('codeApply', lang)}
                  </Text>
                </View>
              </Pressy>
            </View>
          )}
        </Glass>
      </View>

      {first?.askHeardFrom ? (
        <View>
          <Label>{t('heardFromTitle', lang)}</Label>
          <Small muted style={{ marginTop: 4 }}>
            {t('heardFromSub', lang)}
          </Small>
          <View style={styles.chips}>
            {(first.options || []).map((o) => {
              const on = heard === o.key;
              const label = t(`heard_${o.key}`, lang);
              return (
                <Pressy
                  key={o.key}
                  onPress={() => pick(o.key)}
                  haptics="select"
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <View style={[styles.chip, on && styles.chipOn]}>
                    <Text variant="smallMedium" color={on ? colors.inkOnDark : colors.ink}>
                      {label === `heard_${o.key}` ? o.label : label}
                    </Text>
                  </View>
                </Pressy>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  applyBtn: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: colors.leafDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applied: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1.2,
    borderColor: 'rgba(14,27,20,0.14)',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  chipOn: { backgroundColor: colors.leafDeep, borderColor: colors.leafDeep },
});
