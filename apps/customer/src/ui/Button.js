import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Pressy } from './Pressy';
import { Glass } from './Glass';
import { Text } from './Text';
import { colors, radius, shadow } from '../theme';

/**
 * @param {{
 *  title: string, onPress?: () => void, variant?: 'primary'|'accent'|'glass'|'ghost'|'danger',
 *  size?: 'md'|'lg'|'sm', loading?: boolean, disabled?: boolean, icon?: any, trailing?: any, style?: any, full?: boolean
 * }} props
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  loading,
  disabled,
  icon,
  trailing,
  style,
  full = true,
}) {
  const isDisabled = disabled || loading;
  const h = size === 'lg' ? 56 : size === 'md' ? 48 : 38;
  const textColor =
    variant === 'primary'
      ? colors.inkOnDark
      : variant === 'accent'
        ? colors.ink
        : variant === 'danger'
          ? colors.tomato
          : colors.ink;

  const content = (
    <View style={[styles.row, { height: h, paddingHorizontal: size === 'sm' ? 14 : 22 }]}>
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <Text
            variant={size === 'sm' ? 'smallMedium' : 'bodyMedium'}
            color={textColor}
            style={styles.label}
          >
            {title}
          </Text>
          {trailing ? <View style={styles.icon}>{trailing}</View> : null}
        </>
      )}
    </View>
  );

  const base = [
    {
      borderRadius: radius.pill,
      opacity: isDisabled ? 0.55 : 1,
      alignSelf: full ? 'stretch' : 'flex-start',
    },
    style,
  ];

  if (variant === 'glass') {
    return (
      <Pressy onPress={onPress} disabled={isDisabled} style={base} haptics="soft">
        <Glass radius={radius.pill} elevated>
          {content}
        </Glass>
      </Pressy>
    );
  }
  const bg =
    variant === 'primary'
      ? colors.night
      : variant === 'accent'
        ? colors.sprout
        : variant === 'danger'
          ? colors.tomatoSoft
          : 'transparent';
  return (
    <Pressy
      onPress={onPress}
      disabled={isDisabled}
      style={[
        base,
        { backgroundColor: bg },
        variant === 'primary' && !isDisabled && shadow.lift,
        variant === 'accent' && !isDisabled && shadow.glow,
      ]}
      haptics={/** @type {any} */ (variant === 'ghost' ? 'select' : 'medium')}
    >
      {content}
    </Pressy>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  icon: { alignItems: 'center', justifyContent: 'center' },
  label: { letterSpacing: 0.1 },
});
