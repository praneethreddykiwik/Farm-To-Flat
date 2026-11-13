import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, FadeOut } from 'react-native-reanimated';
import { Minus, Plus } from 'lucide-react-native';
import { Pressy } from './Pressy';
import { Mono, Small, Text } from './Text';
import { colors, radius, shadow } from '../theme';
import { haptic } from '../lib/haptics';

const UNIT_LABEL = { KG: 'kg', BUNCH: 'bunch', PIECE: 'pc', DOZEN: 'dz', PACK: 'pack' };

/** @param {number} qty @param {string} unit */
export function formatQty(qty, unit) {
  const q = Number(qty);
  if (unit === 'KG') return q >= 1 ? `${Number(q.toFixed(3))} kg` : `${Math.round(q * 1000)} g`;
  const n = Number(q.toFixed(3));
  const label = UNIT_LABEL[unit] || unit.toLowerCase();
  return `${n} ${label}${n !== 1 && label !== 'kg' && label !== 'pc' && label !== 'dz' ? (label === 'bunch' ? 'es' : 's') : ''}`;
}

/**
 * Quantity stepper that respects the product increment. Collapses to a single "Add" pill at 0.
 * @param {{ value: number, increment: string|number, unit: string, max?: number, onChange: (q: number) => void, tone?: 'light'|'dark', size?: 'sm'|'md' }} props
 */
export function Stepper({
  value,
  increment,
  unit,
  max = 999,
  onChange,
  tone = 'light',
  size = 'md',
}) {
  const inc = Number(increment) || 1;
  const dark = tone === 'dark';
  const h = size === 'sm' ? 34 : 42;

  // Which way the figure last moved, so the new one can arrive from the right side: up from below
  // when adding, down from above when taking away. A counter that ticks, rather than a label that
  // is silently replaced. Worked out from the value itself (adjusted during render, as React
  // recommends for derived state), so it is right however the quantity changed.
  const [seen, setSeen] = useState(value);
  const [rising, setRising] = useState(true);
  if (seen !== value) {
    setRising(value > seen);
    setSeen(value);
  }
  // The figure the next tap counts from. Not `value`: two taps can arrive before the screen has
  // redrawn with the first, and both would then count up from the same number — tap twice, get
  // one. So each tap moves this on itself, and it is brought back in step whenever the value
  // changes for any other reason.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  const dec = useCallback(() => {
    const next = Math.max(0, Math.round((latest.current - inc) * 1000) / 1000);
    latest.current = next;
    haptic.select();
    onChange(next);
  }, [inc, onChange]);
  const add = useCallback(() => {
    const next = Math.round((latest.current + inc) * 1000) / 1000;
    if (next > max) {
      haptic.warning();
      return;
    }
    latest.current = next;
    haptic.tap();
    onChange(next);
  }, [inc, max, onChange]);
  // The figure sits in a box of one fixed width, and shrinks to fit when it is a long one. The box
  // used to grow with the words — "1 bunch", "2 bunches", "10 bunches" — which slid the plus
  // button along under the thumb, so the next tap landed on the label; and past ten it pushed the
  // button off the edge of a product card.
  const valueW = size === 'sm' ? 64 : 86;

  if (value <= 0) {
    return (
      <Pressy
        onPress={add}
        haptics="none"
        style={[
          styles.addPill,
          { height: h, backgroundColor: dark ? colors.sprout : colors.night },
          shadow.soft,
        ]}
      >
        <Plus size={16} color={dark ? colors.ink : colors.sprout} strokeWidth={2.5} />
        <Text variant="smallMedium" color={dark ? colors.ink : colors.inkOnDark}>
          Add
        </Text>
      </Pressy>
    );
  }

  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(120)}
      style={[
        styles.wrap,
        { height: h, backgroundColor: dark ? 'rgba(255,255,255,0.12)' : colors.night },
        shadow.soft,
      ]}
    >
      <Pressy
        onPress={dec}
        haptics="none"
        style={[styles.btn, { width: h }]}
        accessibilityLabel="Decrease quantity"
      >
        <Minus size={16} color={colors.inkOnDark} strokeWidth={2.5} />
      </Pressy>
      <View style={[styles.value, { width: valueW }]}>
        {/* Keyed by the value: each change mounts a fresh figure, which is what lets it animate in. */}
        <Animated.View
          key={String(value)}
          entering={(rising ? FadeInDown : FadeInUp).duration(170)}
        >
          <Mono
            color={colors.sprout}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={{ fontSize: size === 'sm' ? 12 : 13, width: valueW, textAlign: 'center' }}
          >
            {formatQty(value, unit)}
          </Mono>
        </Animated.View>
      </View>
      <Pressy
        onPress={add}
        haptics="none"
        style={[styles.btn, { width: h }]}
        accessibilityLabel="Increase quantity"
      >
        <Plus size={16} color={colors.inkOnDark} strokeWidth={2.5} />
      </Pressy>
    </Animated.View>
  );
}

/** Small helper under variable-weight lines */
export function VariableWeightNote() {
  return (
    <Small muted style={{ fontSize: 11 }}>
      Billed on packed weight, ±10%
    </Small>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  btn: { height: '100%', alignItems: 'center', justifyContent: 'center' },
  value: { alignItems: 'center', justifyContent: 'center' },
  addPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
  },
});
