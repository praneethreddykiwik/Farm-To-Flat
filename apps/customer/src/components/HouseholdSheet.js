import React, { forwardRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { Baby, Minus, Plus, UserRound } from 'lucide-react-native';
import { Button, Pressy, Sheet, Small, Text } from '../ui';
import { colors, radius } from '../theme';
import { haptic } from '../lib/haptics';
import { MAX_ADULTS, MAX_CHILDREN, householdLabel } from '../lib/household';
import {
  declineHousehold,
  selectHousehold,
  setHousehold,
} from '../features/household/householdSlice';

/**
 * "Who's eating at home?" — two numbers, adults and children.
 *
 * Asked once after the first sign-in and changeable from Profile and the basket. It is what lets
 * the app say "that may be light for four" instead of nothing at all. Nothing else is asked, and the
 * answer stays on this phone (see features/household).
 *
 * Closing it without answering counts as "not now": it is not put in front of the shopper again on
 * its own.
 */
export const HouseholdSheet = /** @type {any} */ (
  forwardRef(function HouseholdSheet(/** @type {any} */ { onDone }, ref) {
    const dispatch = useDispatch();
    return (
      <Sheet
        ref={ref}
        title="Who’s eating at home?"
        subtitle="So we can tell you when a quantity looks light for your family."
        onDismiss={() => dispatch(declineHousehold())}
      >
        <Picker
          onSave={(h) => {
            dispatch(setHousehold(h));
            haptic.success();
            /** @type {any} */ (ref)?.current?.dismiss();
            onDone?.(h);
          }}
          onSkip={() => /** @type {any} */ (ref)?.current?.dismiss()}
        />
      </Sheet>
    );
  })
);

function Picker({ onSave, onSkip }) {
  const saved = useSelector(selectHousehold);
  const [adults, setAdults] = useState(saved?.adults ?? 2);
  const [children, setChildren] = useState(saved?.children ?? 0);
  return (
    <View style={{ gap: 12 }}>
      <Counter
        label="Adults"
        hint="13 and older"
        value={adults}
        min={1}
        max={MAX_ADULTS}
        onChange={setAdults}
        Icon={UserRound}
        tint={colors.mint}
      />
      <Counter
        label="Children"
        hint="12 and under"
        value={children}
        min={0}
        max={MAX_CHILDREN}
        onChange={setChildren}
        Icon={Baby}
        tint={colors.butter}
      />
      <Small muted center style={{ marginTop: 2 }}>
        Kept on this phone only. We never ask for names or ages.
      </Small>
      <Button
        title={`Save — ${householdLabel({ adults, children })}`}
        variant="accent"
        onPress={() => onSave({ adults, children })}
        style={{ marginTop: 4 }}
      />
      <Pressy onPress={onSkip} haptics="select" style={{ alignSelf: 'center', padding: 8 }}>
        <Small muted>Not now</Small>
      </Pressy>
    </View>
  );
}

function Counter({ label, hint, value, min, max, onChange, Icon, tint }) {
  const step = (d) => {
    const next = Math.min(max, Math.max(min, value + d));
    if (next === value) {
      haptic.warning();
      return;
    }
    haptic.select();
    onChange(next);
  };
  // One little figure per person, up to six; beyond that the number says it.
  const shown = Math.min(value, 6);
  return (
    <View style={styles.counter}>
      <View style={{ flex: 1 }}>
        <Text variant="bodyMedium">{label}</Text>
        <Small muted>{hint}</Small>
        <View style={styles.people}>
          {Array.from({ length: shown }, (_, i) => (
            <View key={i} style={[styles.person, { backgroundColor: tint }]}>
              <Icon size={14} color={colors.leafDeep} strokeWidth={2.2} />
            </View>
          ))}
          {value > shown ? <Small muted>+{value - shown}</Small> : null}
          {value === 0 ? <Small muted>None</Small> : null}
        </View>
      </View>
      <View style={styles.stepper}>
        <Pressy
          onPress={() => step(-1)}
          haptics="none"
          style={styles.btn}
          accessibilityLabel={`Fewer ${label.toLowerCase()}`}
        >
          <Minus size={18} color={colors.inkOnDark} strokeWidth={2.5} />
        </Pressy>
        <Text variant="h2" color={colors.sprout} style={styles.figure}>
          {value}
        </Text>
        <Pressy
          onPress={() => step(1)}
          haptics="none"
          style={styles.btn}
          accessibilityLabel={`More ${label.toLowerCase()}`}
        >
          <Plus size={18} color={colors.inkOnDark} strokeWidth={2.5} />
        </Pressy>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.hairline,
  },
  people: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, minHeight: 26 },
  person: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.night,
    borderRadius: radius.pill,
    height: 48,
  },
  btn: { width: 46, height: 48, alignItems: 'center', justifyContent: 'center' },
  figure: { width: 34, textAlign: 'center' },
});
