import React, { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Glass, Money, Pressy, ProductImage, Small, Stepper, Text } from '../ui';
import { colors, motion, radius } from '../theme';
import { useCartLine } from '../hooks/useCart';

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
  const alias = product.aliases?.find(
    (a) => /^[a-z ]+$/i.test(a) && a.toLowerCase() !== product.name.toLowerCase(),
  );

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
          accessibilityLabel={`${product.name}, ${alias || ''}`}
        >
          <View style={styles.imageWrap}>
            <ProductImage
              uri={product.image}
              blurhash={product.blurhash}
              tint={product.tint}
              name={product.name}
              radius={radius.md}
              recyclingKey={product.id}
            />
            {product.variableWeight ? (
              <View style={styles.tag}>
                <Small style={{ fontSize: 10, color: colors.inkOnDark }}>WEIGHED</Small>
              </View>
            ) : null}
          </View>
          <View style={styles.meta}>
            <Text variant="bodyMedium" numberOfLines={1}>
              {product.name}
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
            <Small muted style={{ marginLeft: 2, marginBottom: 2 }}>
              {UNIT_SUFFIX[product.unit] || ''}
            </Small>
          </View>
          <View style={styles.stepperRow}>
            <Stepper
              value={quantity}
              increment={product.increment}
              unit={product.unit}
              max={product.dailyCap}
              onChange={setQuantity}
              size="sm"
            />
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
  imageWrap: { aspectRatio: 1, width: '100%' },
  tag: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: colors.glassDark,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  meta: { paddingTop: 10, paddingHorizontal: 2 },
  footer: { paddingTop: 10, paddingHorizontal: 2, gap: 8 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end' },
  stepperRow: { alignSelf: 'flex-start' },
});
