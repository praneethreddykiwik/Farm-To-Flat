import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Glass, Pressy, Small, Text } from '../ui';
import { colors, fonts, radius } from '../theme';

/**
 * What the customer is agreeing to, shown before they pay rather than buried in a policy page.
 *
 * These are the things that actually cause disputes — a cancellation after the bag is packed, and
 * produce the customer is unhappy with at the door — so they are stated plainly at the one moment
 * the customer is deciding. Agreement is explicit and not pre-ticked: a pre-ticked box is not
 * consent, and on a fresh-produce order the replacement rule is the part people need to have read.
 */
export const ORDER_TERMS = [
  {
    title: 'Cancel free until we start packing',
    body: 'Once your bag is being packed you can still ask us to cancel, but our team has to approve it — the produce has already been weighed out for you.',
  },
  {
    title: 'Check your produce at the door',
    body: 'Please look through the bag while the delivery partner is still with you. It is much easier to put right there and then.',
  },
  {
    title: 'Something not right? Photograph it',
    body: 'Show the delivery partner, or send us a photo from your order screen. We review it and replace the item or refund it — no argument.',
  },
  {
    title: 'Weighed items are billed on actual weight',
    body: 'Meat, fish and loose vegetables are cut and weighed fresh, so the final amount can differ from the estimate by up to 10%.',
  },
  {
    title: 'Someone needs to be reachable',
    body: 'We call from downstairs. If nobody answers we leave the bag with your security desk and mark it delivered.',
  },
];

/**
 * @param {{ accepted: boolean, onToggle: () => void }} props
 */
export function OrderTerms({ accepted, onToggle }) {
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
                {term.title}
              </Text>
              <Small muted style={{ marginTop: 2, lineHeight: 18 }}>
                {term.body}
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
        accessibilityLabel="I have read and agree to these terms"
        style={{ marginTop: 12 }}
      >
        <View style={styles.agree}>
          <View style={[styles.box, accepted && styles.boxOn]}>
            {accepted ? <Check size={14} color={colors.inkOnDark} strokeWidth={3} /> : null}
          </View>
          <Small style={{ flex: 1, color: colors.ink, lineHeight: 19 }}>
            I have read and agree to these terms.
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
