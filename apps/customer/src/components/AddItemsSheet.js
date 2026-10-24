import React, { forwardRef, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Search } from 'lucide-react-native';
import { Sheet } from '../ui/Sheet';
import { Button, Glass, Input, Money, ProductImage, Small, Text } from '../ui';
import { Stepper } from '../ui/Stepper';
import { colors, radius } from '../theme';
import { productLabel } from '../lib/i18n';

const UNIT_SUFFIX = { KG: '/kg', G: '/100g', PIECE: ' each', BUNCH: '/bunch' };

/**
 * Pick extra items to add to an order that's still inside its edit window. The sheet only COLLECTS a
 * basket of additions and the running items-total it can see (unit price × quantity); it hands the
 * lines up to the order screen, which calls the server and lets the authoritative bill — delivery,
 * charges and tax recomputed on the larger order — drive the payment sheet. So the number here is the
 * honest "items" figure, not a promise about the final delta, which is why the footer says so.
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

    // Only things actually buyable right now — a sold-out or deactivated product can't be added.
    const sellable = useMemo(
      () =>
        (products || []).filter(
          (p) => p.isActive !== false && (!p.availability || p.availability === 'AVAILABLE'),
        ),
      [products],
    );
    const shown = useMemo(() => {
      const term = q.trim().toLowerCase();
      if (!term) return sellable;
      return sellable.filter((p) => productLabel(p, lang).toLowerCase().includes(term));
    }, [sellable, q, lang]);

    const estPaise = useMemo(
      () =>
        Object.entries(qty).reduce((s, [id, n]) => {
          const p = sellable.find((x) => x.id === id);
          return s + (p ? Number(p.pricePaise) * Number(n) : 0);
        }, 0),
      [qty, sellable],
    );
    const lineCount = Object.values(qty).filter((n) => n > 0).length;

    const set = (id, n) =>
      setQty((cur) => {
        const next = { ...cur };
        if (n > 0) next[id] = n;
        else delete next[id];
        return next;
      });

    const confirm = () => {
      const items = Object.entries(qty)
        .filter(([, n]) => n > 0)
        .map(([productId, n]) => ({ productId, quantity: n }));
      if (items.length) onConfirm(items, estPaise);
    };

    return (
      <Sheet
        ref={ref}
        title="Add items"
        subtitle="They'll join this order and arrive in the same delivery."
        snapPoints={['86%']}
        scroll
        onDismiss={() => {
          setQty({});
          setQ('');
        }}
      >
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
              Nothing matches “{q}”.
            </Small>
          ) : null}
        </View>

        <View style={{ height: 8 }} />
        <Button
          title={
            lineCount === 0
              ? 'Add items'
              : `Add ${lineCount} item${lineCount > 1 ? 's' : ''} · ${rupees(estPaise)}+`
          }
          variant="accent"
          onPress={confirm}
          loading={busy}
          disabled={lineCount === 0 || busy}
        />
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
});
