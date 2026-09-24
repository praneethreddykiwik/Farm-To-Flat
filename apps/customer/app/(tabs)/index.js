import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Dimensions, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSelector } from 'react-redux';
import { Ambient, Glass, Skeleton, Small } from '../../src/ui';
import { HomeHeader } from '../../src/components/HomeHeader';
import { SearchBar } from '../../src/components/SearchBar';
import { CategoryChips } from '../../src/components/CategoryChips';
import { HarvestBanner } from '../../src/components/HarvestBanner';
import { ConfirmBanner } from '../../src/components/ConfirmBanner';
import { ProductCard } from '../../src/components/ProductCard';
import { SectionHeader } from '../../src/components/SectionHeader';
import { CartBar } from '../../src/components/CartBar';
import { DietToggle } from '../../src/components/DietToggle';
import { SeasonalRail } from '../../src/components/SeasonalRail';
import { LanguageRail } from '../../src/components/LanguageRail';
import { useSlowHint, WAKING_MESSAGE } from '../../src/hooks/useSlowHint';
import { useGetCatalogQuery, useGetMeQuery, useGetWindowsQuery } from '../../src/api/api';
import { selectCustomer } from '../../src/features/auth/authSlice';
import { filterByDiet, selectDietPref } from '../../src/features/ui/uiSlice';
import { colors, radius } from '../../src/theme';
import { KV_KEYS, kv } from '../../src/lib/kv';

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList);
const GUTTER = 20;
const GAP = 12;
const COLS = 2;
const CARD_W = (Dimensions.get('window').width - GUTTER * 2 - GAP) / COLS;

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const customer = useSelector(selectCustomer);
  const me = useGetMeQuery();
  const catalog = useGetCatalogQuery();
  // First open after the service has slept can take ~50s on Render's free tier; say so.
  const catalogSlow = useSlowHint(catalog.isLoading);
  const windows = useGetWindowsQuery({}, { refetchOnMountOrArgChange: true, refetchOnFocus: true });
  const [category, setCategory] = useState(null);
  const dietPref = useSelector(selectDietPref);
  const listRef = useRef(null);
  const catalogY = useRef(600); // content offset where the catalog grid starts; measured below
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });

  const cached = useMemo(() => kv.getJSON(KV_KEYS.catalog), []);
  const data = catalog.data || cached;
  const categories = data?.categories || [];
  const products = useMemo(() => {
    const byDiet = filterByDiet(data?.products || [], dietPref);
    return category ? byDiet.filter((p) => p.categoryId === category) : byDiet;
  }, [data, category, dietPref]);
  // "In season now" rail — only on the unfiltered shop view, and respecting the veg/non-veg choice.
  const seasonal = useMemo(
    () =>
      filterByDiet(
        (data?.products || []).filter((p) => p.isSeasonal),
        dietPref,
      ),
    [data, dietPref],
  );
  const nextWindow = windows.data?.windows?.find((w) => w.isOpen) || null;

  // Sticky glass search bar: fades in as the header scrolls away.
  // The sticky search bar is invisible until the header scrolls away; while invisible it must not
  // swallow touches, or drags that start under it never reach the list.
  const [stickyVisible, setStickyVisible] = useState(false);
  useAnimatedReaction(
    () => y.value > 130,
    (visible, prev) => {
      if (visible !== prev) runOnJS(setStickyVisible)(visible);
    },
  );
  const stickyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [120, 180], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(y.value, [120, 180], [-12, 0], Extrapolation.CLAMP) }],
  }));
  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [0, 90], [1, 0], Extrapolation.CLAMP),
    transform: /** @type {any} */ ([
      { translateY: interpolate(y.value, [0, 120], [0, -24], Extrapolation.CLAMP) },
      { scale: interpolate(y.value, [0, 120], [1, 0.96], Extrapolation.CLAMP) },
    ]),
  }));

  const renderItem = useCallback(
    ({ item, index }) => <ProductCard product={item} index={index} width={CARD_W} />,
    [],
  );

  // "Build a basket" shows every product and scrolls the catalog grid up into view so shopping can
  // start straight away, instead of only resetting the (already default) category filter.
  const buildBasket = useCallback(() => {
    setCategory(null);
    // Scroll the catalog grid up into view. catalogY is measured from the header's onLayout, with a
    // sensible fallback, so it lands just below the sticky search bar on any screen size.
    const offset = Math.max(0, catalogY.current - insets.top - 56);
    listRef.current?.scrollToOffset?.({ offset, animated: true });
  }, [insets.top]);

  const header = (
    <View>
      <Animated.View style={headerStyle}>
        <HomeHeader name={customer?.name} address={me.data?.defaultAddress} />
        <SearchBar onPress={() => router.push('/search')} editable={false} style={styles.search} />
      </Animated.View>
      {/* The three languages we serve, drifting past. It is the cue that a Telugu or Hindi reader
          can switch — sitting where they are already looking rather than buried in a setting. */}
      <LanguageRail />
      <ConfirmBanner style={{ paddingHorizontal: 20, marginBottom: 12 }} />
      <View style={{ marginTop: 4 }}>
        <HarvestBanner nextWindow={nextWindow} onPress={buildBasket} />
      </View>
      {!category ? <SeasonalRail products={seasonal} /> : null}
      <View
        onLayout={(e) => {
          catalogY.current = e.nativeEvent.layout.y;
        }}
      >
        <SectionHeader
          eyebrow="From the field"
          title="Today’s catalog"
          action={{ label: 'Search', onPress: () => router.push('/search') }}
        />
      </View>
      <View style={styles.dietRow}>
        <DietToggle />
      </View>
      <CategoryChips categories={categories} selected={category} onSelect={setCategory} />
      <View style={{ height: 8 }} />
    </View>
  );

  return (
    <View style={styles.root}>
      <Ambient />
      {catalog.isLoading && !data ? (
        <View style={[styles.skeleton, { paddingTop: insets.top + 12 }]}>
          {catalogSlow ? (
            <Small muted center style={{ marginBottom: 16 }}>
              {WAKING_MESSAGE}
            </Small>
          ) : null}
          <Skeleton height={28} width={180} />
          <Skeleton height={50} radius={radius.pill} style={{ marginTop: 20 }} />
          <Skeleton height={176} radius={radius.xl} style={{ marginTop: 20 }} />
          <View style={{ flexDirection: 'row', gap: GAP, marginTop: 20 }}>
            <Skeleton height={230} width={CARD_W} radius={radius.lg} />
            <Skeleton height={230} width={CARD_W} radius={radius.lg} />
          </View>
        </View>
      ) : (
        <AnimatedFlashList
          ref={listRef}
          data={products}
          renderItem={/** @type {any} */ (renderItem)}
          keyExtractor={(p) => /** @type {any} */ (p).id}
          numColumns={COLS}
          onScroll={onScroll}
          scrollEventThrottle={16}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <Small muted center style={{ paddingVertical: 40 }}>
              Nothing in this category today.
            </Small>
          }
          contentContainerStyle={{
            paddingTop: insets.top + 8,
            paddingBottom: 200,
            paddingHorizontal: GUTTER - GAP / 2,
          }}
          ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          drawDistance={600}
          refreshControl={
            <RefreshControl
              refreshing={catalog.isFetching && !!data}
              onRefresh={catalog.refetch}
              tintColor={colors.leaf}
            />
          }
          extraData={`${category}|${dietPref}`}
        />
      )}
      <Animated.View
        pointerEvents={stickyVisible ? 'box-none' : 'none'}
        style={[styles.sticky, { top: insets.top + 6 }, stickyStyle]}
      >
        <Glass radius={radius.pill} innerStyle={{ padding: 0 }}>
          <SearchBar onPress={() => router.push('/search')} editable={false} />
        </Glass>
      </Animated.View>
      <CartBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  search: { marginHorizontal: GUTTER, marginTop: 18, marginBottom: 16 },
  dietRow: { paddingHorizontal: GUTTER, paddingBottom: 12 },
  sticky: { position: 'absolute', left: GUTTER, right: GUTTER },
  skeleton: { paddingHorizontal: GUTTER },
});
