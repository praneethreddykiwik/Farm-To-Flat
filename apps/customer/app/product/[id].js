import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Extrapolation,
  FadeInDown,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { ArrowLeft, Scale, ShoppingBag, Sprout } from 'lucide-react-native';
import {
  Glass,
  GlassPill,
  Label,
  Money,
  Pressy,
  ProductImage,
  Skeleton,
  Small,
  Stepper,
  Text,
  Title,
  VariableWeightNote,
} from '../../src/ui';
import { useGetCatalogQuery, useGetProductQuery } from '../../src/api/api';
import { useCartLine } from '../../src/hooks/useCart';
import { colors, fonts, radius, tintOf } from '../../src/theme';
import { useSelector } from 'react-redux';
import { selectLanguage } from '../../src/features/ui/uiSlice';
import { productLabel } from '../../src/lib/i18n';

const { width: W } = Dimensions.get('window');
const HERO = W * 1.05;
const UNIT_SUFFIX = {
  KG: 'per kg',
  BUNCH: 'per bunch',
  PIECE: 'per piece',
  DOZEN: 'per dozen',
  PACK: 'per pack',
};

export default function ProductDetail() {
  const { id } = useLocalSearchParams();
  const lang = useSelector(selectLanguage);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const catalog = useGetCatalogQuery();
  const cachedProduct = useMemo(
    () => catalog.data?.products?.find((p) => p.id === id),
    [catalog.data, id],
  );
  const detail = useGetProductQuery(id, { skip: !!cachedProduct });
  const product = cachedProduct || detail.data?.product;
  const { quantity, setQuantity } = useCartLine(product || { id });
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  // Parallax + zoom on the hero, sheet lifts over it.
  const heroStyle = useAnimatedStyle(() => ({
    transform: /** @type {any} */ ([
      {
        translateY: interpolate(
          y.value,
          [-HERO, 0, HERO],
          [-HERO / 2, 0, HERO * 0.35],
          Extrapolation.CLAMP,
        ),
      },
      { scale: interpolate(y.value, [-HERO, 0], [2, 1], Extrapolation.CLAMP) },
    ]),
  }));
  const titleBar = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [HERO - 160, HERO - 80], [0, 1], Extrapolation.CLAMP),
  }));

  if (!product) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 60, paddingHorizontal: 20 }]}>
        <Skeleton height={HERO - 120} radius={radius.xl} />
        <Skeleton height={28} width={200} style={{ marginTop: 20 }} />
        <Skeleton height={18} width={120} style={{ marginTop: 10 }} />
      </View>
    );
  }
  const t = tintOf(product.tint);
  const lineTotal = Math.round(Number(product.pricePaise) * quantity);
  const aliases = (product.aliases || []).slice(0, 4);
  // The card grid hides the Add button on a sold-out product, but this screen did not — so a
  // customer who opened Coriander after the operator marked it SOLD_OUT could still add it, and
  // only found out when the order was placed. Same rule in both places.
  const soldOut = !!product.availability && product.availability !== 'AVAILABLE';
  const label = productLabel(product, lang);

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.hero, heroStyle]}>
        {/* Without a recycling key expo-image keeps the PREVIOUS product's bitmap in this view when
            one detail screen replaces another — which is why opening Karela showed Banana. */}
        <ProductImage
          uri={product.image}
          blurhash={product.blurhash}
          tint={product.tint}
          name={label}
          radius={0}
          priority="high"
          recyclingKey={product.id}
        />
        <LinearGradient
          colors={['rgba(11,21,16,0.35)', 'rgba(11,21,16,0)', 'rgba(243,245,239,0)', colors.canvas]}
          locations={[0, 0.3, 0.75, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 160 }}
        bounces
      >
        <View style={{ height: HERO - 90 }} />
        <Animated.View
          entering={FadeInDown.duration(420).springify().damping(18)}
          style={styles.sheetWrap}
        >
          <Glass radius={radius.xxl} innerStyle={styles.sheet}>
            <View style={styles.pills}>
              <GlassPill>
                <Sprout size={13} color={colors.leafDeep} />
                <Small color={colors.leafDeep} style={{ fontFamily: fonts.bodyMedium }}>
                  {product.farm}
                </Small>
              </GlassPill>
              {product.variableWeight ? (
                <GlassPill>
                  <Scale size={13} color={colors.ink2} />
                  <Small color={colors.ink2} style={{ fontFamily: fonts.bodyMedium }}>
                    Weighed at packing
                  </Small>
                </GlassPill>
              ) : null}
            </View>
            <Text style={styles.name}>{label}</Text>
            <View style={styles.aliasRow}>
              {aliases.map((a) => (
                <View key={a} style={[styles.alias, { backgroundColor: t.bg }]}>
                  <Small color={t.fg}>{a}</Small>
                </View>
              ))}
            </View>
            <View style={styles.priceRow}>
              <Money paise={product.pricePaise} variant="h1" />
              <Small muted style={{ marginBottom: 6 }}>
                {UNIT_SUFFIX[product.unit]}
                {product.unit === 'KG' ? ` · steps of ${Number(product.increment) * 1000} g` : ''}
              </Small>
            </View>

            <View style={styles.divider} />
            <Label>Why it’s good</Label>
            <Text variant="body" color={colors.ink2} style={{ marginTop: 6 }}>
              {product.variableWeight
                ? 'Cut fresh on the morning of delivery. The packer records the actual weight and your bill adjusts to it, within ±10%.'
                : `Picked from ${product.farm} after the cut-off, so it never sits in a cold room. Washed once, never waxed.`}
            </Text>
            {product.variableWeight ? (
              <View style={{ marginTop: 6 }}>
                <VariableWeightNote />
              </View>
            ) : null}
            <View style={styles.facts}>
              {[
                ['Category', product.categoryName],
                ['Sold by', product.unit === 'KG' ? 'weight' : product.unit.toLowerCase()],
                ['Daily cap', `${product.dailyCap} ${product.unit === 'KG' ? 'kg' : ''}`.trim()],
              ].map(([k, v]) => (
                <View key={k} style={styles.fact}>
                  <Small muted>{k}</Small>
                  <Text variant="smallMedium">{v}</Text>
                </View>
              ))}
            </View>
          </Glass>
        </Animated.View>
      </Animated.ScrollView>

      {/* Top chrome */}
      <View pointerEvents="box-none" style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, titleBar]}>
          <Glass radius={0} elevated={false} innerStyle={{ flex: 1, borderWidth: 0 }} />
        </Animated.View>
        <View style={styles.topRow}>
          <Pressy onPress={() => router.back()} haptics="select" accessibilityLabel="Back">
            <Glass tone="dark" radius={radius.pill} innerStyle={styles.iconBtn}>
              <ArrowLeft size={20} color={colors.inkOnDark} />
            </Glass>
          </Pressy>
          <Animated.View style={[{ flex: 1, alignItems: 'center' }, titleBar]}>
            <Title numberOfLines={1}>{label}</Title>
          </Animated.View>
          <Pressy onPress={() => router.push('/cart')} haptics="select" accessibilityLabel="Basket">
            <Glass tone="dark" radius={radius.pill} innerStyle={styles.iconBtn}>
              <ShoppingBag size={19} color={colors.inkOnDark} />
            </Glass>
          </Pressy>
        </View>
      </View>

      {/* Bottom action bar */}
      <View pointerEvents="box-none" style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]}>
        <Glass tone="dark" radius={radius.xl} liquid innerStyle={styles.bar}>
          <View style={{ flex: 1 }}>
            <Small color="rgba(243,245,239,0.65)">
              {soldOut ? 'Sold out today' : quantity > 0 ? 'In your basket' : 'Add to basket'}
            </Small>
            <Money
              paise={quantity > 0 ? lineTotal : product.pricePaise}
              animated
              color={soldOut ? 'rgba(243,245,239,0.45)' : colors.sprout}
              variant="h2"
            />
          </View>
          {soldOut ? (
            <GlassPill>
              <Small color="rgba(243,245,239,0.75)">Back tomorrow</Small>
            </GlassPill>
          ) : (
            <Stepper
              value={quantity}
              increment={product.increment}
              unit={product.unit}
              max={product.dailyCap}
              onChange={setQuantity}
              tone="dark"
            />
          )}
        </Glass>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  hero: { position: 'absolute', top: 0, left: 0, right: 0, height: HERO },
  sheetWrap: { paddingHorizontal: 12 },
  sheet: { padding: 22 },
  pills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  name: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.7,
    color: colors.ink,
    marginTop: 14,
  },
  aliasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  alias: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 16 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
    marginVertical: 18,
  },
  facts: { flexDirection: 'row', marginTop: 18, gap: 10 },
  fact: { flex: 1, backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: radius.md, padding: 12 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', left: 16, right: 16, bottom: 0 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
});
