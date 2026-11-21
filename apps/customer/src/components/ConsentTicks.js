import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { t } from '../lib/i18n';
import { colors } from '../theme';
import { Pressy, Small, Text } from '../ui';

const open = (path, lang) =>
  Linking.openURL(`https://fooducia.health/${path}?lang=${lang}`).catch(() => {});

/**
 * The two consent boxes (DPDP §6, §9), shared by the sign-in screen and the one-time prompt.
 *
 * The privacy notice and terms are links INSIDE the first sentence. They used to sit under the
 * "Send code" button, where the number keyboard covered them (owner, 21 Nov 2026: "where are the
 * terms and conditions, at least the link") — and a box you tick should name, and open, what you
 * agree to.
 *
 * @param {{ agreed: boolean, onAgree: () => void, adult: boolean, onAdult: () => void, lang: string }} props
 */
export function ConsentTicks({ agreed, onAgree, adult, onAdult, lang }) {
  const sentence = t('consentAgreeRich', lang);
  const parts = sentence.split(/(\{privacy\}|\{terms\})/);
  return (
    <View>
      <Tick checked={agreed} onPress={onAgree} a11y={t('consentAgree', lang)}>
        <Small style={{ flex: 1 }}>
          {parts.map((part, i) =>
            part === '{privacy}' ? (
              <Text
                key={i}
                variant="smallMedium"
                style={styles.link}
                onPress={() => open('privacy', lang)}
                accessibilityRole="link"
              >
                {t('consentPrivacyWord', lang)}
              </Text>
            ) : part === '{terms}' ? (
              <Text
                key={i}
                variant="smallMedium"
                style={styles.link}
                onPress={() => open('terms', lang)}
                accessibilityRole="link"
              >
                {t('consentTermsWord', lang)}
              </Text>
            ) : (
              part
            ),
          )}
        </Small>
      </Tick>
      <Tick checked={adult} onPress={onAdult} a11y={t('consentAdult', lang)}>
        <Small style={{ flex: 1 }}>{t('consentAdult', lang)}</Small>
      </Tick>
    </View>
  );
}

function Tick({ checked, onPress, a11y, children }) {
  return (
    <Pressy
      onPress={onPress}
      haptics="select"
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={a11y}
    >
      <View style={styles.tick}>
        <View style={[styles.box, checked && styles.boxOn]}>
          {checked ? <Check size={15} color={colors.inkOnDark} strokeWidth={3} /> : null}
        </View>
        {children}
      </View>
    </Pressy>
  );
}

const styles = StyleSheet.create({
  tick: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.ink3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.leafDeep, borderColor: colors.leafDeep },
  link: { color: colors.leafDeep, textDecorationLine: 'underline' },
});
