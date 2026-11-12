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
import { DietMark } from '../../src/components/DietMark';
import { ProductKnowledge } from '../../src/components/ProductKnowledge';

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
  // The small title in the bar used to fade in on the same curve as the bar itself, which put it
  // on screen while the big product name was still sliding underneath — two copies of the name,
  // one on top of the other. It now waits until the big one has gone under the bar. `nameEnd` is
  // the scroll offset of the bottom edge of the big name, measured, not guessed.
  const nameEnd = useSharedValue(HERO);
  const barHeight = insets.top + 6 + 44 + 8;
  const titleText = useAnimatedStyle(() => ({
    opacity: interpolate(
      y.value,
      [nameEnd.value - barHeight - 6, nameEnd.value - barHeight + 18],
      [0, 1],
      Extrapolation.CLAMP,
    ),
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
          renderWidth={960}
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
              {/* The veg / non-veg declaration is mandatory on every food listing, eggs and meat
                  included — shape as well as colour, so it never relies on colour alone. */}
              <GlassPill>
                <DietMark diet={product.diet} size={14} />
                <Small color={colors.ink2} style={{ fontFamily: fonts.bodyMedium }}>
                  {product.diet === 'NONVEG' ? 'Non-vegetarian' : 'Vegetarian'}
                </Small>
              </GlassPill>
              {/* A product added from the console may have no farm recorded; an empty pill with a
                  lone leaf icon looked like a rendering fault. */}
              {product.farm ? (
                <GlassPill>
                  <Sprout size={13} color={colors.leafDeep} />
                  <Small color={colors.leafDeep} style={{ fontFamily: fonts.bodyMedium }}>
                    {product.farm}
                  </Small>
                </GlassPill>
              ) : null}
              {product.variableWeight ? (
                <GlassPill>
                  <Scale size={13} color={colors.ink2} />
                  <Small color={colors.ink2} style={{ fontFamily: fonts.bodyMedium }}>
                    Weighed at packing
                  </Small>
                </GlassPill>
              ) : null}
            </View>
            <Text
              style={styles.name}
              onLayout={(e) => {
                // y is measured from the top of the sheet; the sheet starts HERO - 90 down the page.
                nameEnd.value = HERO - 90 + e.nativeEvent.layout.y + e.nativeEvent.layout.height;
              }}
            >
              {label}
            </Text>
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
            {/* States what WE do, and nothing about anyone else's produce: a line like "never sits in
                a cold room, never waxed" casts doubt on other food, which the FSS claims regulations
                (reg 10(5), 10(7)) do not allow. */}
            <Label>How it reaches you</Label>
            <Text variant="body" color={colors.ink2} style={{ marginTop: 6 }}>
              {product.variableWeight
                ? 'Cut on the morning of delivery. The packer records the actual weight and your bill adjusts to it, within ±10%.'
                : product.farm
                  ? `Harvested after the order cut-off (${product.farm}) and delivered the next morning.`
                  : 'Harvested after the order cut-off and delivered the next morning.'}
            </Text>
            {product.variableWeight ? (
              <View style={{ marginTop: 6 }}>
                <VariableWeightNote />
              </View>
            ) : null}
            <ProductKnowledge productId={product.id} />
            <View style={styles.divider} />
            <View style={[styles.facts, { marginTop: 0 }]}>
              {[
                ['Category', product.categoryName],
                ['Sold by', product.unit === 'KG' ? 'weight' : product.unit.toLowerCase()],
                // "Daily cap" was our own word for it. What it means to a customer: we harvest only
                // so much of this a day, so it can run out.
                [
                  'Harvested a day',
                  `up to ${product.dailyCap}${product.unit === 'KG' ? ' kg' : ''}`,
                ],
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
        {/* A solid bar, not glass. Frosted glass under a fading parent does not blur on iOS (the
            effect view gives up while its opacity is animating), so the page text ran, perfectly
            sharp, straight through the title. Same canvas as the status-bar scrim above it. */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.topFill, titleBar]}
        />
        <View style={styles.topRow}>
          <Pressy onPress={() => router.back()} haptics="select" accessibilityLabel="Back">
            <Glass tone="dark" radius={radius.pill} innerStyle={styles.iconBtn}>
              <ArrowLeft size={20} color={colors.inkOnDark} />
            </Glass>
          </Pressy>
          <Animated.View style={[{ flex: 1, alignItems: 'center' }, titleText]}>
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
  topFill: {
    backgroundColor: colors.canvas,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
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
