import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ProductCard } from './ProductCard';
import { colors, fonts } from '../theme';

const CARD_W = 156;

// "In season now" — a horizontal rail of the produce marked seasonal in the catalog. Sits above the
// main grid on the shop. Hidden entirely when nothing is in season (or the diet filter empties it).
export function SeasonalRail({ products }) {
  if (!products || products.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Peak season</Text>
          <Text style={styles.title}>In season now</Text>
        </View>
        <View style={styles.count}>
          <Text style={styles.countText}>{products.length}</Text>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        {products.map((p, i) => (
          <View key={p.id} style={{ width: CARD_W }}>
            <ProductCard product={p} index={i} width={CARD_W} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 6, marginBottom: 8 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  eyebrow: {
    fontFamily: fonts.bodySemi,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.leaf,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 20,
    lineHeight: 24,
    color: colors.ink,
    letterSpacing: -0.3,
    marginTop: 2,
  },
  count: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: colors.leafSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.leafDeep },
  rail: { paddingHorizontal: 20, gap: 12 },
});
