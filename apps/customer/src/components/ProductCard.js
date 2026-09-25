import React, { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Glass, Money, Pressy, ProductImage, Small, Stepper, Text } from '../ui';
import { colors, motion, radius } from '../theme';
import { useCartLine } from '../hooks/useCart';
import { useSelector } from 'react-redux';
import { selectLanguage } from '../features/ui/uiSlice';
import { productLabel } from '../lib/i18n';

const UNIT_SUFFIX = { KG: '/kg', BUNCH: '/bunch', PIECE: '/pc', DOZEN: '/dozen', PACK: '/pack' };

/**
 * Catalog tile. Photo (or botanical fallback), name with one alias, price per unit and a stepper
 * that lives on the card so a basket can be built without leaving the grid.
 * @param {{ product: any, index?: number, width?: number }} props
 */
function ProductCardBase({ product, index = 0, width }) {
  const router = useRouter();
  const { quantity, setQuantity } = useCartLine(product);
  const open = useCallback(
    () => router.push({ pathname: '/product/[id]', params: { id: product.id } }),
    [product.id, router],
  );
  const lang = useSelector(selectLanguage);
  const label = productLabel(product, lang);
  // The romanised alias under the name. In English it is the local word for the produce; once the
  // name itself is already Telugu or Hindi it would just repeat, so show the English name instead —
  // which is the useful cross-reference in that direction.
  const alias =
    lang === 'en'
      ? product.aliases?.find(
          (a) => /^[a-z ]+$/i.test(a) && a.toLowerCase() !== product.name.toLowerCase(),
        )
      : label !== product.name
        ? product.name
        : null;
  // The server already refuses a sold-out product with 409 UNAVAILABLE, so nothing oversells — but
  // the card showed a live stepper regardless, so the shopper tapped Add and got an error instead
  // of simply seeing that it had run out.
  const soldOut = !!product.availability && product.availability !== 'AVAILABLE';

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * motion.stagger)
        .duration(380)
        .springify()
        .damping(18)}
      style={width ? { width, flexGrow: 0, flexShrink: 0 } : styles.wrap}
    >
      <Glass radius={radius.lg} blur={false} innerStyle={styles.inner}>
        <Pressy
          onPress={open}
          haptics="soft"
          scale={0.985}
          accessibilityLabel={`${label}, ${alias || ''}`}
        >
          <View style={styles.imageWrap}>
            <ProductImage
              uri={product.image}
              blurhash={product.blurhash}
              tint={product.tint}
              name={label}
              radius={radius.md}
              recyclingKey={product.id}
            />
            {product.variableWeight && !soldOut ? (
              <View style={styles.tag}>
                <Small style={{ fontSize: 10, color: colors.inkOnDark }}>WEIGHED</Small>
              </View>
            ) : null}
            {soldOut ? (
              <View style={styles.soldOutVeil}>
                <View style={styles.soldOutPill}>
                  <Small style={{ fontSize: 10.5, color: colors.inkOnDark }}>SOLD OUT</Small>
                </View>
              </View>
            ) : null}
          </View>
          <View style={styles.meta}>
            <Text variant="bodyMedium" numberOfLines={1}>
              {label}
            </Text>
            <Small muted numberOfLines={1} style={{ marginTop: 1 }}>
              {alias ? `${alias} · ` : ''}
              {product.farm}
            </Small>
          </View>
        </Pressy>
        <View style={styles.footer}>
          <View style={styles.priceRow}>
            <Money paise={product.pricePaise} variant="price" />
            <Small muted style={styles.priceUnit}>
              {UNIT_SUFFIX[product.unit] || ''}
            </Small>
          </View>
          <View style={styles.stepperRow}>
            {soldOut ? (
              <View style={styles.soldOutNote}>
                <Small muted>Back when it&rsquo;s picked</Small>
              </View>
            ) : (
              <Stepper
                value={quantity}
                increment={product.increment}
                unit={product.unit}
                max={product.dailyCap}
                onChange={setQuantity}
                size="sm"
              />
            )}
          </View>
        </View>
      </Glass>
    </Animated.View>
  );
}

export const ProductCard = memo(ProductCardBase);

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  inner: { padding: 10 },
  // `position: relative` anchors the WEIGHED pill and the sold-out veil to the IMAGE rather than
  // letting them resolve against an ancestor and drift over the name beneath.
  //
  // Deliberately NOT `overflow: 'hidden'`. That looked like the tidy fix — clip the overlays to the
  // photo's rounded corners — but on Android a clipped, rounded parent renders its children into a
  // layer where stacking follows ELEVATION rather than document order, and the image painted over
  // the sold-out veil: a sold-out product lost its veil and its SOLD OUT pill entirely. The badges
  // are kept inside the box by their own maxWidth and radius instead, and the overlays are given an
  // explicit elevation so they sit above the photo on Android as well as iOS.
  imageWrap: { aspectRatio: 1, width: '100%', position: 'relative' },
  tag: {
    position: 'absolute',
    top: 8,
    left: 8,
    // Never wider than the image it sits on, so a long label stays on the photo instead of
    // spilling across the text below.
    maxWidth: '90%',
    zIndex: 2,
    elevation: 2,
    backgroundColor: colors.glassDark,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  soldOutVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(243,245,239,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    // Matches the photo's own corners, so the wash does not sit square over a rounded image.
    borderRadius: radius.md,
    // Android orders overlapping siblings by elevation, not by which is written last.
    zIndex: 2,
    elevation: 2,
  },
  soldOutPill: {
    backgroundColor: colors.glassDark,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  soldOutNote: { paddingVertical: 6 },
  meta: { paddingTop: 10, paddingHorizontal: 2 },
  footer: { paddingTop: 10, paddingHorizontal: 2, gap: 8 },
  // The card is given a fixed width by the grid, so a wide price ("₹160") could squeeze the unit
  // beside it until only the slash survived — "₹160 /" with the "kg" clipped away. The price keeps
  // its size, the unit is allowed to wrap onto its own line rather than be cut, and neither is
  // shrunk to fit.
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap' },
  priceUnit: { flexShrink: 0, marginLeft: 2, marginBottom: 2 },
  stepperRow: { alignSelf: 'flex-start' },
});
