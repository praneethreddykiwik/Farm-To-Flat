import React, { forwardRef, useMemo, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useSelector } from 'react-redux';
import { Search, X } from 'lucide-react-native';
import { Sheet } from '../ui/Sheet';
import { Button, Glass, Input, Money, ProductImage, Small, Text } from '../ui';
import { Stepper } from '../ui/Stepper';
import { DietToggle } from './DietToggle';
import { colors, radius } from '../theme';
import { productLabel } from '../lib/i18n';
import { selectDietPref, filterByDiet } from '../features/ui/uiSlice';

const UNIT_SUFFIX = { KG: '/kg', G: '/100g', PIECE: ' each', BUNCH: '/bunch' };

/**
 * Pick extra items to add to an order that's still inside its edit window. The sheet only COLLECTS a
 * basket of additions and the running items-total it can see (unit price × quantity); it hands the
 * lines up to the order screen, which calls the server and lets the authoritative bill — delivery,
 * charges and tax recomputed on the larger order — drive the payment sheet. So the number here is the
 * honest "items" figure, not a promise about the final delta, which is why the footer says so.
 *
 * Two steps: PICK (search + steppers, filtered by the shared veg/non-veg preference so a veg shopper
 * never sees meat here) and REVIEW (confirm-to-add, with a remove on every staged line) so nothing is
 * added to a live order by accident.
 *
 * Quantities are capped at the product's remaining day-cap as a courtesy; the server re-checks it
 * against every order booked for the day and is the final word.
 * @param {{ products: any[], lang: string, busy?: boolean, onConfirm: (items: {productId:string,quantity:number}[], estPaise: number) => void }} props
 */
export const AddItemsSheet = /** @type {any} */ (
  forwardRef(function AddItemsSheet(
    /** @type {any} */ { products, lang, busy = false, onConfirm },
    ref,
  ) {
    const [qty, setQty] = useState(/** @type {Record<string, number>} */ ({}));
    const [q, setQ] = useState('');
    const [phase, setPhase] = useState(/** @type {'pick'|'review'} */ ('pick'));
    const dietPref = useSelector(selectDietPref);

    // Only things actually buyable right now — a sold-out or deactivated product can't be added — and
    // then only those matching the shopper's veg/non-veg preference, same as the shop and search.
    const sellable = useMemo(
      () =>
        filterByDiet(
          (products || []).filter(
            (p) => p.isActive !== false && (!p.availability || p.availability === 'AVAILABLE'),
          ),
          dietPref,
        ),
      [products, dietPref],
    );
    const shown = useMemo(() => {
      const term = q.trim().toLowerCase();
      if (!term) return sellable;
      return sellable.filter((p) => productLabel(p, lang).toLowerCase().includes(term));
    }, [sellable, q, lang]);

    // Resolve the staged lines against the FULL product list (not `sellable`): once an item is staged
    // it stays in review even if the diet toggle changes, so its price must still resolve.
    const staged = useMemo(
      () =>
        Object.entries(qty)
          .filter(([, n]) => n > 0)
          .map(([id, n]) => ({ product: (products || []).find((x) => x.id === id), quantity: n }))
          .filter((s) => s.product),
      [qty, products],
    );
    const estPaise = useMemo(
      () =>
        staged.reduce((s, { product, quantity }) => s + Number(product.pricePaise) * quantity, 0),
      [staged],
    );
    const lineCount = staged.length;

    const set = (id, n) =>
      setQty((cur) => {
        const next = { ...cur };
        if (n > 0) next[id] = n;
        else delete next[id];
        return next;
      });

    const reset = () => {
      setQty({});
      setQ('');
      setPhase('pick');
    };

    const confirm = () => {
      const items = staged.map(({ product, quantity }) => ({
        productId: product.id,
        quantity,
      }));
      if (items.length) onConfirm(items, estPaise);
    };

    return (
      <Sheet
        ref={ref}
        title={phase === 'review' ? 'Confirm these items' : 'Add items'}
        subtitle={
          phase === 'review'
            ? 'Review what joins this order. Remove anything you changed your mind about.'
            : "They'll join this order and arrive in the same delivery."
        }
        snapPoints={['86%']}
        scroll
        onDismiss={reset}
      >
        {phase === 'pick' ? (
          <>
            <Glass radius={radius.lg} innerStyle={styles.searchBox}>
              <Search size={18} color={colors.ink2} />
              <Input
                value={q}
                onChangeText={setQ}
                placeholder="Search produce"
                style={{ flex: 1 }}
                autoCapitalize="none"
              />
            </Glass>

            <DietToggle style={{ marginTop: 12 }} />

            <View style={{ marginTop: 12, gap: 2 }}>
              {shown.map((p) => {
                const already = Number(qty[p.id] || 0);
                const label = productLabel(p, lang);
                return (
                  <View key={p.id} style={styles.row}>
                    <ProductImage
                      uri={p.image}
                      blurhash={p.blurhash}
                      tint={p.tint}
                      name={label}
                      size={44}
                      radius={12}
                    />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium" numberOfLines={1}>
                        {label}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                        <Money paise={p.pricePaise} variant="small" />
                        <Small muted>{UNIT_SUFFIX[p.unit] || ''}</Small>
                      </View>
                    </View>
                    <Stepper
                      value={already}
                      increment={p.increment}
                      unit={p.unit}
                      max={p.dailyCap}
                      size="sm"
                      onChange={(n) => set(p.id, n)}
                    />
                  </View>
                );
              })}
              {shown.length === 0 ? (
                <Small muted center style={{ paddingVertical: 24 }}>
                  {q.trim() ? `Nothing matches “${q}”.` : 'Nothing available to add right now.'}
                </Small>
              ) : null}
            </View>

            <View style={{ height: 8 }} />
            <Button
              title={
                lineCount === 0
                  ? 'Add items'
                  : `Review ${lineCount} item${lineCount > 1 ? 's' : ''} · ${rupees(estPaise)}+`
              }
              variant="accent"
              onPress={() => setPhase('review')}
              disabled={lineCount === 0 || busy}
            />
          </>
        ) : (
          <>
            <View style={{ marginTop: 4, gap: 2 }}>
              {staged.map(({ product: p, quantity }) => {
                const label = productLabel(p, lang);
                return (
                  <View key={p.id} style={styles.row}>
                    <ProductImage
                      uri={p.image}
                      blurhash={p.blurhash}
                      tint={p.tint}
                      name={label}
                      size={44}
                      radius={12}
                    />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium" numberOfLines={1}>
                        {label}
                      </Text>
                      <Small muted>
                        {quantity} × <Money paise={p.pricePaise} variant="small" />
                      </Small>
                    </View>
                    <Money paise={Number(p.pricePaise) * quantity} variant="small" />
                    <Pressable
                      onPress={() => set(p.id, 0)}
                      hitSlop={10}
                      style={styles.remove}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${label}`}
                    >
                      <X size={16} color={colors.ink2} />
                    </Pressable>
                  </View>
                );
              })}
              {lineCount === 0 ? (
                <Small muted center style={{ paddingVertical: 24 }}>
                  Nothing left to add. Go back to pick some items.
                </Small>
              ) : null}
            </View>

            <View style={{ height: 8 }} />
            <Button
              title={
                lineCount === 0
                  ? 'Confirm'
                  : `Confirm & add ${lineCount} item${lineCount > 1 ? 's' : ''} · ${rupees(estPaise)}+`
              }
              variant="accent"
              onPress={confirm}
              loading={busy}
              disabled={lineCount === 0 || busy}
            />
            <Button
              title="Back to items"
              variant="ghost"
              onPress={() => setPhase('pick')}
              disabled={busy}
              style={{ marginTop: 8 }}
            />
          </>
        )}
        <Small muted center style={{ marginTop: 8 }}>
          Final total includes delivery &amp; taxes on the larger order — you&apos;ll see the exact
          amount before paying.
        </Small>
      </Sheet>
    );
  })
);

const rupees = (p) => `₹${Math.round(Number(p) / 100)}`;

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    height: 48,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  remove: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14,27,20,0.05)',
  },
});
