import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { selectDietPref, setDietPref } from '../features/ui/uiSlice';
import { haptic } from '../lib/haptics';
import { colors, fonts } from '../theme';

// Veg / non-veg preference, shared across the shop and search. Green dot = veg, red dot = non-veg
// (the familiar Indian packaged-food marks), so it reads at a glance.
const OPTIONS = [
  { key: 'ALL', label: 'All', dot: null },
  { key: 'VEG', label: 'Veg', dot: colors.leaf },
  { key: 'NONVEG', label: 'Non-veg', dot: '#c0392b' },
];

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
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            {o.dot ? (
              <View style={[styles.dotBox, { borderColor: o.dot }]}>
                <View style={[styles.dot, { backgroundColor: o.dot }]} />
              </View>
            ) : null}
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
  dotBox: {
    width: 13,
    height: 13,
    borderRadius: 3,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  txt: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.ink3 },
  txtOn: { fontFamily: fonts.bodySemi, color: colors.ink },
});
