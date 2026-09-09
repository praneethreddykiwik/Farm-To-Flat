import React, { useEffect, useMemo, useState } from 'react';
import { Dimensions, Keyboard, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SearchX } from 'lucide-react-native';
import { useSelector } from 'react-redux';
import { Ambient, Chip, Display, EmptyState, Label, Small } from '../src/ui';
import { SearchBar } from '../src/components/SearchBar';
import { ProductCard } from '../src/components/ProductCard';
import { CartBar } from '../src/components/CartBar';
import { DietToggle } from '../src/components/DietToggle';
import { useGetCatalogQuery, useLazySearchCatalogQuery } from '../src/api/api';
import { filterByDiet, selectDietPref } from '../src/features/ui/uiSlice';
import { colors } from '../src/theme';

const GUTTER = 20;
const GAP = 12;
const CARD_W = (Dimensions.get('window').width - GUTTER * 2 - GAP) / 2;
const SUGGESTIONS = [
  'tamata',
  'karela',
  'palak',
  'kothimeera',
  'bendakaya',
  'sorakaya',
  'chicken',
  'eggs',
];

export default function Search() {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [trigger, result] = useLazySearchCatalogQuery();
  const catalog = useGetCatalogQuery();
  const dietPref = useSelector(selectDietPref);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return undefined;
    const t = setTimeout(() => trigger(term), 220);
    return () => clearTimeout(t);
  }, [q, trigger]);

  const active = q.trim().length >= 2;
  const products = useMemo(
    () => filterByDiet(active ? result.data?.products || [] : [], dietPref),
    [active, result.data, dietPref],
  );
  const popular = useMemo(
    () => filterByDiet(catalog.data?.products || [], dietPref).slice(0, 12),
    [catalog.data, dietPref],
  );

  return (
    <View style={styles.root}>
      <Ambient />
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: GUTTER }}>
        <Display>Find anything</Display>
        <Small muted style={{ marginTop: 4 }}>
          English, Telugu or Hindi names all work. Spelling doesn’t have to be perfect.
        </Small>
        <SearchBar
          value={q}
          onChangeText={setQ}
          autoFocus
          voice
          style={{ marginTop: 16 }}
          onSubmit={Keyboard.dismiss}
        />
        <DietToggle style={{ marginTop: 14 }} />
      </View>

      {!active ? (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 20, paddingBottom: 200 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeIn.duration(240)}>
            <Label>Try</Label>
            <View style={styles.chips}>
              {SUGGESTIONS.map((s) => (
                <Chip key={s} label={s} onPress={() => setQ(s)} />
              ))}
            </View>
            <Label style={{ marginTop: 24 }}>Popular this week</Label>
            <View style={styles.grid}>
              {popular.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} width={CARD_W} />
              ))}
            </View>
          </Animated.View>
        </ScrollView>
      ) : result.isFetching && !result.data ? (
        <Small muted center style={{ marginTop: 40 }}>
          Searching…
        </Small>
      ) : products.length === 0 ? (
        <EmptyState
          icon={<SearchX size={28} color={colors.ink2} />}
          title={`Nothing for “${q.trim()}”`}
          message="Try another name — kakarakaya, karela and bitter gourd all find the same thing."
        />
      ) : (
        <FlashList
          data={products}
          keyExtractor={(p) => p.id}
          numColumns={2}
          renderItem={({ item, index }) => (
            <ProductCard product={item} index={index} width={CARD_W} />
          )}
          contentContainerStyle={{
            paddingTop: 16,
            paddingBottom: 200,
            paddingHorizontal: GUTTER - GAP / 2,
          }}
          ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={
            <Animated.View
              entering={FadeInDown.duration(240)}
              style={{ paddingHorizontal: GAP / 2, paddingBottom: 10 }}
            >
              <Small muted>
                {products.length} {products.length === 1 ? 'match' : 'matches'}
              </Small>
            </Animated.View>
          }
        />
      )}
      <CartBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginTop: 10 },
});
