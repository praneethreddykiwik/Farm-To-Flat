import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { Body, Button, Sheet, Small, Title } from '../ui';
import { ProductCard } from './ProductCard';
import { colors, radius } from '../theme';

/**
 * What the lens saw.
 *
 * Deliberately phrased as a guess, not an answer — "Looks like Tomato", with the confidence shown
 * rather than hidden. A recogniser that states its findings as fact is worse than one that admits
 * doubt: the customer is the one holding the vegetable, and they can tell instantly whether we got
 * it right. What they cannot do is tell whether a confident-sounding wrong answer is wrong.
 *
 * Three outcomes, all of which have to feel like a reasonable reply:
 *   - we found it           → show the product, ready to add
 *   - we know what it is but do not stock it → say so by name, offer to search
 *   - it is not produce     → say that plainly rather than guessing at a vegetable
 *
 * @param {{ result: any, onClose: () => void, onSearch: (t: string) => void }} props
 */
export function LensResult({ result, onClose, onSearch }) {
  const ref = useRef(null);
  useEffect(() => {
    if (result) ref.current?.present();
    else ref.current?.dismiss();
  }, [result]);

  if (!result) return null;

  const { product, alternatives = [], label, confidence } = result;
  const sure = confidence >= 0.75;

  return (
    <Sheet ref={ref} onDismiss={onClose}>
      <View style={styles.head}>
        <View style={styles.badge}>
          <Sparkles size={14} color={colors.leafDeep} strokeWidth={2.4} />
        </View>
        <Small muted>{sure ? 'Found it' : 'Best guess'}</Small>
      </View>

      {product ? (
        <>
          <Title style={styles.title}>
            {sure ? 'That’s' : 'Looks like'} {product.name}
          </Title>
          <View style={styles.card}>
            <ProductCard product={product} width={null} />
          </View>
          {alternatives.length ? (
            <>
              <Small muted style={styles.or}>
                Not it? It might be
              </Small>
              {alternatives.map((p) => (
                <View key={p.id} style={styles.alt}>
                  <ProductCard product={p} width={null} />
                </View>
              ))}
            </>
          ) : null}
        </>
      ) : label ? (
        <>
          <Title style={styles.title}>That looks like {label}</Title>
          <Body style={styles.body}>
            We don’t have it on the list right now. Harvests change week to week, so it may turn up.
          </Body>
          <Button title={`Search for ${label}`} onPress={() => onSearch(label)} />
        </>
      ) : (
        <>
          <Title style={styles.title}>Couldn’t tell what that is</Title>
          <Body style={styles.body}>
            Try again with the vegetable filling most of the frame, in good light.
          </Body>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.leafSoft,
  },
  title: { marginBottom: 14 },
  body: { marginBottom: 18, color: colors.ink2 },
  card: { borderRadius: radius?.md ?? 16, overflow: 'hidden' },
  or: { marginTop: 22, marginBottom: 10 },
  alt: { marginBottom: 10 },
});
