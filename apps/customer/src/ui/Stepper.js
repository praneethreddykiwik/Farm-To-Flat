import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
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

  const dec = useCallback(() => {
    const next = Math.max(0, Math.round((value - inc) * 1000) / 1000);
    haptic.select();
    onChange(next);
  }, [inc, onChange, value]);
  const add = useCallback(() => {
    const next = Math.round((value + inc) * 1000) / 1000;
    if (next > max) {
      haptic.warning();
      return;
    }
    haptic.tap();
    onChange(next);
  }, [inc, max, onChange, value]);

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
      layout={LinearTransition.springify().damping(18)}
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
      <View style={styles.value}>
        <Mono color={colors.sprout} style={{ fontSize: size === 'sm' ? 12 : 13 }}>
          {formatQty(value, unit)}
        </Mono>
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
  value: { minWidth: 58, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  addPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
  },
});
