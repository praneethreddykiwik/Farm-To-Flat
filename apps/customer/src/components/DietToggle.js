import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { selectDietPref, setDietPref } from '../features/ui/uiSlice';
import { haptic } from '../lib/haptics';
import { colors, fonts } from '../theme';
import { DietMark } from './DietMark';

// Veg / non-veg preference, shared across the shop and search. The filter wears the SAME mark the
// product cards do — green circle for veg, brown triangle for non-veg, each in its square. It used
// to draw its own (a red dot in a red box for non-veg), so the filter and the thing it filtered
// disagreed about what non-veg looks like, and red-versus-green alone is the pair a colour-blind
// customer cannot tell apart.
const OPTIONS = [
  { key: 'ALL', label: 'All', mark: false, a11y: 'All products' },
  { key: 'VEG', label: 'Veg', mark: true, a11y: 'Vegetarian only' },
  { key: 'NONVEG', label: 'Non-veg', mark: true, a11y: 'Non-vegetarian only' },
];

/** @param {{ style?: any }} props */
export function DietToggle({ style }) {
  const dispatch = useDispatch();
  const pref = useSelector(selectDietPref);
  return (
    <View style={[styles.row, style]}>
      {OPTIONS.map((o) => {
        const active = pref === o.key;
        return (
          <Pressable
            key={o.key}
            style={[styles.seg, active && styles.segOn]}
            onPress={() => {
              haptic.select();
              dispatch(setDietPref(o.key));
            }}
            // The pill is 31pt tall by design; the slop brings what a thumb can hit up to 44.
            hitSlop={{ top: 7, bottom: 7 }}
            accessibilityRole="button"
            accessibilityLabel={o.a11y}
            accessibilityState={{ selected: active }}
          >
            {o.mark ? <DietMark diet={o.key} size={14} /> : null}
            <Text style={[styles.txt, active && styles.txtOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(14,27,20,0.05)',
    borderRadius: 999,
    padding: 3,
    gap: 2,
  },
  seg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
  },
  segOn: {
    backgroundColor: colors.white,
    shadowColor: '#0e1b14',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  txt: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.ink3 },
  txtOn: { fontFamily: fonts.bodySemi, color: colors.ink },
});
