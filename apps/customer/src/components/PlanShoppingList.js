import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDispatch } from 'react-redux';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CalendarPlus, ShoppingBag } from 'lucide-react-native';
import { Button, Glass, Money, Pressy, ProductImage, Small, Text } from '../ui';
import { formatQty } from '../ui/Stepper';
import { colors, motion, radius } from '../theme';
import { orderQuantityFor } from '../lib/nutrition';
import { useSetCartItemMutation } from '../api/api';
import { pulseBag, showToast } from '../features/ui/uiSlice';
import { haptic } from '../lib/haptics';

/**
 * The aggregated product list under a plan: grams → orderable quantity in the product's unit,
 * price, and two actions: add everything to the basket, or put the plan on the calendar.
 * @param {{ shopping: {productId:string, grams:number}[], productsById: Record<string, any>, onSchedule?: () => void, compact?: boolean }} props
 */
export function PlanShoppingList({ shopping, productsById, onSchedule, compact }) {
  const dispatch = useDispatch();
  const router = useRouter();
  const [setCartItem] = useSetCartItemMutation();
  const [adding, setAdding] = useState(false);

  const lines = useMemo(
    () =>
      shopping
        .map((s) => {
          const p = productsById[s.productId];
          if (!p) return null;
          const qty = orderQuantityFor(p, s.productId, s.grams);
          return { p, grams: s.grams, qty, paise: Math.round(Number(p.pricePaise) * qty) };
        })
        .filter(Boolean)
        .sort((a, b) => b.paise - a.paise),
    [shopping, productsById],
  );
  const total = lines.reduce((s, l) => s + l.paise, 0);

  const addAll = async () => {
    if (adding || !lines.length) return;
    setAdding(true);
    try {
      // Fire the adds in parallel (a month plan has ~36 lines — doing them one-by-one over the network
      // took many seconds and looked frozen) and don't let one bad line abort the rest.
      const results = await Promise.allSettled(
        lines.map((l) => setCartItem({ productId: l.p.id, quantity: String(l.qty) }).unwrap()),
      );
      const added = results.filter((r) => r.status === 'fulfilled').length;
      dispatch(pulseBag());
      if (added === 0) {
        dispatch(
          showToast({ title: 'Could not add these items. Please try again.', tone: 'error' }),
        );
        return;
      }
      haptic.success();
      dispatch(
        showToast({
          title:
            added === lines.length
              ? `${added} items added to your basket`
              : `${added} of ${lines.length} items added`,
          tone: 'success',
        }),
      );
      router.push('/cart');
    } catch (e) {
      dispatch(showToast({ title: e?.message || 'Could not add everything', tone: 'error' }));
    } finally {
      setAdding(false);
    }
  };

  return (
    <View>
      <Glass
        radius={radius.lg}
        blur={false}
        innerStyle={{ paddingHorizontal: 14, paddingVertical: 4 }}
      >
        {lines.map((l, i) => (
          <Animated.View
            key={l.p.id}
            entering={FadeInDown.delay(i * (motion.stagger / 2)).duration(260)}
          >
            <Pressy
              onPress={() => router.push({ pathname: '/product/[id]', params: { id: l.p.id } })}
              haptics="select"
              scale={0.995}
            >
              <View style={[styles.line, i < lines.length - 1 && styles.divider]}>
                <ProductImage
                  uri={l.p.image}
                  tint={l.p.tint}
                  name={l.p.name}
                  size={40}
                  radius={12}
                />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {l.p.name}
                  </Text>
                  <Small muted>
                    {l.grams} g in plan → {formatQty(l.qty, l.p.unit)}
                  </Small>
                </View>
                <Money paise={l.paise} variant="bodyMedium" />
              </View>
            </Pressy>
          </Animated.View>
        ))}
        <View style={styles.totalRow}>
          <Small muted style={{ flex: 1, marginRight: 12 }} numberOfLines={2}>
            {lines.length} products · rounded up to sale units
          </Small>
          <Money paise={total} variant="h3" style={{ flexShrink: 0 }} />
        </View>
      </Glass>
      {!compact ? (
        <View style={styles.actions}>
          <Button
            title="Add all to basket"
            onPress={addAll}
            loading={adding}
            icon={<ShoppingBag size={18} color={colors.inkOnDark} />}
          />
          {onSchedule ? (
            <Button
              title="Add to calendar"
              variant="glass"
              onPress={onSchedule}
              icon={<CalendarPlus size={18} color={colors.ink} />}
              style={{ marginTop: 10 }}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  actions: { marginTop: 14 },
});
