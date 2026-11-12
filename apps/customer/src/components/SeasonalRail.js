import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSelector } from 'react-redux';
import { BookOpen, Leaf } from 'lucide-react-native';
import { ProductCard } from './ProductCard';
import { ProductKnowledge } from './ProductKnowledge';
import { Button, Pressy, Sheet, Small } from '../ui';
import { selectLanguage } from '../features/ui/uiSlice';
import { productLabel } from '../lib/i18n';
import { colors, fonts, radius } from '../theme';

const CARD_W = 156;

// "In season now" — a horizontal rail of the produce marked seasonal in the catalog. Sits above the
// main grid on the shop. Hidden entirely when nothing is in season (or the diet filter empties it).
//
// Each card carries a "Good to know" strip. Tapping it opens a short pop-up with what the vegetable
// naturally contains, its story and a recipe — the knowledge that comes with the vegetable — without
// leaving the shop. The first line of the strip is a nutrition statement computed by the server
// under the FSS claims thresholds; when there is none for a product it reads "Its story" instead,
// and never anything we made up here.
export function SeasonalRail({ products }) {
  const router = useRouter();
  const lang = useSelector(selectLanguage);
  const sheet = useRef(null);
  const [peek, setPeek] = useState(null);
  if (!products || products.length === 0) return null;

  const open = (p) => {
    setPeek(p);
    sheet.current?.present();
  };

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
        {products.map((p, i) => {
          const badge = p.goodToKnow?.[0];
          return (
            <View key={p.id} style={{ width: CARD_W }}>
              <ProductCard product={p} index={i} width={CARD_W} />
              <Pressy
                onPress={() => open(p)}
                haptics="select"
                accessibilityRole="button"
                accessibilityLabel={`About ${productLabel(p, lang)}: good to know, its story and a recipe`}
                style={styles.know}
              >
                {badge ? (
                  <Leaf size={13} color={colors.leafDeep} />
                ) : (
                  <BookOpen size={13} color={colors.leafDeep} />
                )}
                <Small numberOfLines={2} color={colors.leafDeep} style={styles.knowText}>
                  {badge || 'Its story & a recipe'}
                </Small>
              </Pressy>
            </View>
          );
        })}
      </ScrollView>

      {/* Fixed snap point: a sheet sized by its (asynchronously loaded) content opens at zero height
          on Android, the same fault the schedule sheet on the Plan tab had. */}
      <Sheet
        ref={sheet}
        title={peek ? productLabel(peek, lang) : ''}
        subtitle={peek?.farm ? `From ${peek.farm}` : undefined}
        snapPoints={['72%']}
        scroll
      >
        {peek ? (
          <View style={{ paddingBottom: 24 }}>
            <ProductKnowledge productId={peek.id} compact />
            <Button
              title="See the full page"
              variant="glass"
              style={{ marginTop: 20 }}
              onPress={() => {
                sheet.current?.dismiss();
                router.push({ pathname: '/product/[id]', params: { id: peek.id } });
              }}
            />
          </View>
        ) : null}
      </Sheet>
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
  know: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    minHeight: 44, // a comfortable touch target
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.leafSoft,
  },
  knowText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 15 },
});
