import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSelector } from 'react-redux';
import { UsersRound } from 'lucide-react-native';
import { Glass, Pressy, Small, Text } from '../ui';
import { useCartLine } from '../hooks/useCart';
import { haptic } from '../lib/haptics';
import { householdLabel } from '../lib/household';
import { colors, radius } from '../theme';
import { formatQty } from '../ui/Stepper';
import { headcount, topUpTo } from '../lib/household';
import { selectHousehold } from '../features/household/householdSlice';

/**
 * Under a basket line whose quantity looks light for the household: what one meal usually takes,
 * and one tap to make it that. Says nothing when the quantity is enough, when no household has been
 * entered, or for things nobody buys by the head (herbs).
 *
 * @param {{ product: any, quantity: number, onTopUp: (q: number) => void }} props
 */
export function FamilyHint({ product, quantity, onTopUp }) {
  const household = useSelector(selectHousehold);
  const need = product ? topUpTo(product, quantity, household) : null;
  if (!need) return null;
  return (
    <Pressy
      onPress={() => onTopUp(need)}
      haptics="soft"
      scale={0.98}
      style={styles.hint}
      accessibilityLabel={`May be light for ${headcount(household)}. Make it ${formatQty(need, product.unit)}`}
    >
      <UsersRound size={13} color={colors.leafDeep} strokeWidth={2.2} />
      <Small color={colors.leafDeep} style={styles.text} numberOfLines={2}>
        May be light for {headcount(household)} ·{' '}
        <Small color={colors.leafDeep} style={styles.strong}>
          make it {formatQty(need, product.unit)}
        </Small>
      </Small>
    </Pressy>
  );
}

/** The words used in the toast when something is first added in a quantity that looks light. */
export function lightFor(product, quantity, household) {
  const need = topUpTo(product, quantity, household);
  if (!need) return null;
  return {
    need,
    title: `May be light for your family of ${headcount(household)}`,
    message: `${formatQty(quantity, product.unit)} of ${product.name} — about ${formatQty(need, product.unit)} covers one meal.`,
  };
}

/**
 * At checkout: the lines that look light for the household, together, with one tap each to top up.
 * Shown only when there is something to say — a basket that covers the family shows nothing.
 *
 * @param {{ items: any[], byId: Map<string, any>, style?: any }} props  cart lines and the catalogue
 */
export function FamilyCheck({ items, byId, style }) {
  const household = useSelector(selectHousehold);
  if (!household) return null;
  const light = (items || [])
    .map((it) => ({ it, product: byId.get(it.productId) }))
    .filter((x) => x.product && topUpTo(x.product, Number(x.it.quantity), household));
  if (!light.length) return null;
  return (
    <View style={style}>
      <Glass radius={radius.lg} innerStyle={styles.check}>
        <View style={styles.checkHead}>
          <View style={styles.checkIcon}>
            <UsersRound size={17} color={colors.leafDeep} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium">Enough for everyone?</Text>
            <Small muted>
              For {householdLabel(household)}, {light.length === 1 ? 'this looks' : 'these look'} a
              little light for one meal.
            </Small>
          </View>
        </View>
        {light.map(({ it, product }) => (
          <CheckRow key={it.id} product={product} />
        ))}
      </Glass>
    </View>
  );
}

function CheckRow({ product }) {
  const household = useSelector(selectHousehold);
  const { quantity, setQuantity } = useCartLine(product);
  const need = topUpTo(product, quantity, household);
  if (!need) return null;
  return (
    <View style={styles.checkRow}>
      <View style={{ flex: 1 }}>
        <Text variant="smallMedium" numberOfLines={1}>
          {product.name}
        </Text>
        <Small muted>
          {formatQty(quantity, product.unit)} now · about {formatQty(need, product.unit)} covers it
        </Small>
      </View>
      <Pressy
        onPress={() => {
          haptic.success();
          setQuantity(need);
        }}
        haptics="none"
        scale={0.95}
        style={styles.checkBtn}
        accessibilityLabel={`Make ${product.name} ${formatQty(need, product.unit)}`}
      >
        <Small color={colors.inkOnDark} style={{ fontSize: 12.5 }}>
          Make it {formatQty(need, product.unit)}
        </Small>
      </Pressy>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(191,233,208,0.55)',
    maxWidth: 240,
  },
  check: { padding: 14 },
  checkHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(191,233,208,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  checkBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.night,
  },
  text: { fontSize: 12, flexShrink: 1 },
  strong: { fontSize: 12, textDecorationLine: 'underline' },
});
