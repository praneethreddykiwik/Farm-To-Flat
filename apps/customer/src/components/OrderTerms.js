import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useSelector } from 'react-redux';
import { Glass, Pressy, Small, Text } from '../ui';
import { colors, fonts, radius } from '../theme';
import { selectLanguage } from '../features/ui/uiSlice';
import { t } from '../lib/i18n';

/**
 * What the customer is agreeing to, shown before they pay rather than buried in a policy page.
 *
 * These are the things that actually cause disputes — a cancellation after the bag is packed, and
 * produce the customer is unhappy with at the door — so they are stated plainly at the one moment
 * the customer is deciding. Agreement is explicit and not pre-ticked: a pre-ticked box is not
 * consent, and on a fresh-produce order the replacement rule is the part people need to have read.
 */
// Keys, not sentences: these are shown at the one moment the customer is deciding to pay, so they
// have to read in the language the rest of the app is in. The array stays exported because the
// order screen counts them.
export const ORDER_TERMS = [
  { title: 'term1Title', body: 'term1Body' },
  { title: 'term2Title', body: 'term2Body' },
  { title: 'term3Title', body: 'term3Body' },
  { title: 'term4Title', body: 'term4Body' },
  { title: 'term5Title', body: 'term5Body' },
];

/**
 * @param {{ accepted: boolean, onToggle: () => void }} props
 */
export function OrderTerms({ accepted, onToggle }) {
  const lang = useSelector(selectLanguage);
  return (
    <View>
      <Glass radius={radius.lg} innerStyle={styles.card}>
        {ORDER_TERMS.map((term, i) => (
          <View key={term.title} style={[styles.row, i > 0 && styles.rowGap]}>
            <View style={styles.bullet}>
              <Text style={styles.bulletText}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyMedium" style={{ fontSize: 14 }}>
                {t(term.title, lang)}
              </Text>
              <Small muted style={{ marginTop: 2, lineHeight: 18 }}>
                {t(term.body, lang)}
              </Small>
            </View>
          </View>
        ))}
      </Glass>

      <Pressy
        onPress={onToggle}
        haptics="select"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
        accessibilityLabel={t('termsConsent', lang)}
        style={{ marginTop: 12 }}
      >
        <View style={styles.agree}>
          <View style={[styles.box, accepted && styles.boxOn]}>
            {accepted ? <Check size={14} color={colors.inkOnDark} strokeWidth={3} /> : null}
          </View>
          <Small style={{ flex: 1, color: colors.ink, lineHeight: 19 }}>
            {t('termsConsent', lang)}
          </Small>
        </View>
      </Pressy>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  row: { flexDirection: 'row', gap: 11 },
  rowGap: { marginTop: 14 },
  bullet: {
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: 'rgba(122,168,62,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  bulletText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 15,
    color: colors.leafDeep,
  },
  agree: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(14,27,20,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.leafDeep, borderColor: colors.leafDeep },
});
