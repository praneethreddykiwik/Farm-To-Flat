import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSelector } from 'react-redux';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { Button, Display, Glass, Input, Label, Pressy, Small, Text } from '../ui';
import { selectLanguage } from '../features/ui/uiSlice';
import { EXIT_NOTE_MAX, EXIT_REASONS } from '../lib/exitReasons';
import { t } from '../lib/i18n';
import { colors, radius } from '../theme';

/**
 * The first step of deleting an account: why? One tap, optional, and Skip is always on screen —
 * deletion must stay easy (App Store 5.1.1(v), DPDP), so this asks and never argues.
 *
 * @param {{ reason: string|null, note: string, onReason: (k: string|null) => void,
 *   onNote: (v: string) => void, onContinue: () => void, onSkip: () => void }} props
 */
export function ExitQuestion({ reason, note, onReason, onNote, onContinue, onSkip }) {
  const lang = useSelector(selectLanguage);
  const router = useRouter();
  const help = EXIT_REASONS.find((r) => r.key === reason)?.help;
  const goHelp = () => {
    if (help === 'Support') router.push('/support');
    else if (help === 'Notify') router.push('/profile');
    else if (help === 'Moved') router.push('/address/new');
    else if (help === 'Privacy')
      Linking.openURL(`https://fooducia.health/privacy?lang=${lang}`).catch(() => {});
  };
  return (
    <Animated.View entering={FadeInDown.duration(320)}>
      <Display style={{ marginTop: 18 }}>{t('exitTitle', lang)}</Display>
      <Small muted style={{ marginTop: 6 }}>
        {t('exitLede', lang)}
      </Small>

      <Glass radius={radius.lg} innerStyle={{ paddingVertical: 6, marginTop: 20 }}>
        {EXIT_REASONS.map((r, i) => {
          const on = reason === r.key;
          return (
            <Pressy
              key={r.key}
              onPress={() => onReason(on ? null : r.key)}
              haptics="select"
              scale={0.99}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t(`exit_${r.key}`, lang)}
            >
              <View style={[styles.row, i > 0 && styles.rule]}>
                <View style={[styles.radio, on && styles.radioOn]}>
                  {on ? <Check size={13} color={colors.inkOnDark} strokeWidth={3} /> : null}
                </View>
                <Text variant={on ? 'bodyMedium' : 'body'} style={{ flex: 1 }}>
                  {t(`exit_${r.key}`, lang)}
                </Text>
              </View>
            </Pressy>
          );
        })}
      </Glass>

      {reason ? (
        <Animated.View entering={FadeIn.duration(220)}>
          {help ? (
            <View style={styles.help}>
              <Small style={{ color: colors.leafDeep }}>{t(`exitHelp${help}`, lang)}</Small>
              <Pressy onPress={goHelp} haptics="select" accessibilityRole="button">
                <Text variant="smallMedium" color={colors.leafDeep} style={styles.helpLink}>
                  {t(`exitHelp${help}Btn`, lang)}
                </Text>
              </Pressy>
            </View>
          ) : null}
          <Label style={{ marginTop: 20, marginBottom: 8 }}>{t('exitNoteLabel', lang)}</Label>
          <Input
            value={note}
            onChangeText={(v) => onNote(v.slice(0, EXIT_NOTE_MAX))}
            placeholder={t('exitNotePh', lang)}
            maxLength={EXIT_NOTE_MAX}
            multiline
          />
        </Animated.View>
      ) : null}

      <Button
        title={t('exitContinue', lang)}
        onPress={onContinue}
        disabled={!reason}
        style={{ marginTop: 24 }}
      />
      <Button
        title={t('exitSkip', lang)}
        variant="ghost"
        onPress={onSkip}
        style={{ marginTop: 10 }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(14,27,20,0.12)' },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(14,27,20,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { backgroundColor: colors.leafDeep, borderColor: colors.leafDeep },
  help: {
    marginTop: 14,
    padding: 14,
    gap: 8,
    borderRadius: radius.md,
    backgroundColor: 'rgba(30,122,76,0.10)',
  },
  helpLink: { textDecorationLine: 'underline' },
});
