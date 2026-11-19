import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';
import { useSelector } from 'react-redux';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BadgeCheck, Gift } from 'lucide-react-native';
import { Glass, Input, Label, Pressy, Small, Text } from '../ui';
import { useCheckCodeMutation, useGetFirstOrderQuery } from '../api/api';
import { selectLanguage } from '../features/ui/uiSlice';
import { haptic } from '../lib/haptics';
import { t } from '../lib/i18n';
import { installCode } from '../lib/tracking';
import { colors, radius } from '../theme';

/**
 * Where this order came from, asked at checkout (17 Nov 2026 review; Rapture7 brief, 19 Nov):
 *   - "Have a code?" — optional: the promoter at a community stall, a neighbour's invite code, or —
 *     on an iPhone, which has no install referrer — the neighbour's 10-digit mobile number. Checked
 *     with the server as soon as it is applied. A number always gets the same neutral answer, so
 *     the box never reveals who is a customer. An Android install from a Fooducia link pre-fills it.
 *   - "How did you hear about Fooducia?" — REQUIRED before the first order (the brief): five
 *     answers, one tap. The checkout will not place a first order until it is answered.
 *
 * Reports `{ code, heardFrom, heardRequired }` upward; a code only once the server accepted it.
 * @param {{ onChange: (v: { code: string|null, heardFrom: string|null, heardRequired?: boolean }) => void, highlight?: boolean }} props
 */
export function OrderSource({ onChange, highlight = false }) {
  const lang = useSelector(selectLanguage);
  const { data: first } = useGetFirstOrderQuery();
  const [check, { isLoading }] = useCheckCodeMutation();
  // An Android install from a Fooducia link carries its code; it starts in the box.
  const [text, setText] = useState(() => installCode() || '');
  const [applied, setApplied] = useState(
    /** @type {{ code: string, message: string|null }|null} */ (null),
  );
  const [error, setError] = useState(/** @type {string|null} */ (null));
  const [heard, setHeard] = useState(/** @type {string|null} */ (null));

  const required = !!first?.askHeardFrom;
  const report = (next) =>
    onChange({ code: applied?.code ?? null, heardFrom: heard, heardRequired: required, ...next });
  useEffect(() => {
    onChange({ code: applied?.code ?? null, heardFrom: heard, heardRequired: required });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [required]);

  const apply = async (given) => {
    const code = String(given ?? text)
      .trim()
      .toUpperCase();
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

  // A first order from an Android install that came through a Fooducia link: apply its code.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !first?.isFirstOrder) return;
    prefilled.current = true;
    const c = installCode();
    if (!c) return;
    // Checked like a typed code; applied only if the server accepts it (state set in the callback).
    check(c)
      .unwrap()
      .then((r) => {
        setApplied({ code: c, message: r?.message || null });
        onChange({ code: c, heardFrom: heard, heardRequired: required });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first?.isFirstOrder]);
  const remove = () => {
    setApplied(null);
    setText('');
    setError(null);
    report({ code: null });
  };
  const pick = (key) => {
    const next = heard === key ? null : key;
    setHeard(next);
    onChange({ code: applied?.code ?? null, heardFrom: next, heardRequired: required });
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
                onSubmitEditing={() => apply()}
                returnKeyType="done"
              />
              <Pressy
                onPress={() => apply()}
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
          <Small
            muted={!(highlight && !heard)}
            color={highlight && !heard ? colors.tomato : undefined}
            style={{ marginTop: 4 }}
          >
            {highlight && !heard ? t('heardRequired', lang) : t('heardFromSub', lang)}
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
