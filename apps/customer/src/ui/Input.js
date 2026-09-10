import React, { forwardRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Glass } from './Glass';
import { Small, Text } from './Text';
import { KEYBOARD_DONE_ID } from './KeyboardDone';
import { colors, fonts, motion, radius } from '../theme';

// Numeric keyboards lack a return/Done key — attach the shared "Done" bar so they can be dismissed.
const NUMERIC_KEYBOARDS = new Set(['number-pad', 'decimal-pad', 'phone-pad', 'numeric']);

/**
 * Glass text field with a floating label and an animated focus ring.
 * @param {{ label?: string, error?: string|null, hint?: string, leading?: any, trailing?: any, mono?: boolean, style?: any } & import('react-native').TextInputProps} props
 */
export const Input = /** @type {any} */ (
  forwardRef(function Input(
    /** @type {any} */ {
      label,
      error,
      hint,
      leading,
      trailing,
      mono,
      style,
      onFocus,
      onBlur,
      ...rest
    },
    ref,
  ) {
    const [focused, setFocused] = useState(false);
    const focus = useSharedValue(0);
    const ring = useAnimatedStyle(() => ({
      borderColor: error ? colors.tomato : focus.value ? colors.leaf : 'rgba(255,255,255,0.9)',
      shadowOpacity: 0.12 * focus.value,
    }));

    return (
      <View style={style}>
        {label ? (
          <Small
            style={styles.label}
            color={error ? colors.tomato : focused ? colors.leaf : colors.ink2}
          >
            {label}
          </Small>
        ) : null}
        <Animated.View style={[styles.ring, ring]}>
          <Glass radius={radius.md} elevated={false} innerStyle={styles.inner}>
            <View style={styles.row}>
              {leading ? <View style={styles.adorn}>{leading}</View> : null}
              <TextInput
                ref={ref}
                placeholderTextColor={colors.ink3}
                selectionColor={colors.leaf}
                inputAccessoryViewID={
                  Platform.OS === 'ios' && NUMERIC_KEYBOARDS.has(rest.keyboardType)
                    ? KEYBOARD_DONE_ID
                    : undefined
                }
                {...rest}
                onFocus={(e) => {
                  setFocused(true);
                  focus.value = withTiming(1, { duration: motion.dur.fast });
                  onFocus?.(e);
                }}
                onBlur={(e) => {
                  setFocused(false);
                  focus.value = withTiming(0, { duration: motion.dur.fast });
                  onBlur?.(e);
                }}
                style={[styles.input, mono && { fontFamily: fonts.mono, letterSpacing: 1 }]}
              />
              {trailing ? <View style={styles.adorn}>{trailing}</View> : null}
            </View>
          </Glass>
        </Animated.View>
        {error ? (
          <Text variant="small" color={colors.tomato} style={styles.help}>
            {error}
          </Text>
        ) : hint ? (
          <Small muted style={styles.help}>
            {hint}
          </Small>
        ) : null}
      </View>
    );
  })
);

const styles = StyleSheet.create({
  label: { marginBottom: 6, marginLeft: 4 },
  ring: {
    borderRadius: radius.md + 1,
    borderWidth: 1.5,
    shadowColor: colors.leaf,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  inner: { borderWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 54, paddingHorizontal: 14 },
  adorn: { marginRight: 10 },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 16, color: colors.ink, paddingVertical: 12 },
  help: { marginTop: 6, marginLeft: 4 },
});
