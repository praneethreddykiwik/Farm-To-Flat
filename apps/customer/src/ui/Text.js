import React from 'react';
import { Text as RNText, StyleSheet } from 'react-native';
import { colors, type } from '../theme';

/**
 * Typography primitives. `variant` maps to the type scale in @f2f/tokens.
 * @param {{ variant?: keyof typeof type, color?: string, center?: boolean, muted?: boolean, style?: any, children?: any } & import('react-native').TextProps} props
 */
export function Text({ variant = 'body', color, center, muted, style, children, ...rest }) {
  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={1.4}
      {...rest}
      style={[
        type[variant] || type.body,
        { color: color || (muted ? colors.ink3 : colors.ink) },
        center && styles.center,
        style,
      ]}
    >
      {children}
    </RNText>
  );
}

export const Display = (p) => <Text variant="h1" {...p} />;
export const Hero = (p) => <Text variant="hero" {...p} />;
export const Title = (p) => <Text variant="h2" {...p} />;
export const Subtitle = (p) => <Text variant="h3" {...p} />;
export const Body = (p) => <Text variant="body" {...p} />;
export const Small = (p) => <Text variant="small" {...p} />;
export const Mono = (p) => <Text variant="mono" {...p} />;
/** Uppercase micro label used for eyebrows and section kickers */
/** @param {any} props */
export const Label = ({ children, style = undefined, ...p }) => (
  <Text variant="micro" muted style={[styles.upper, style]} {...p}>
    {typeof children === 'string' ? children.toUpperCase() : children}
  </Text>
);

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  upper: { letterSpacing: 1.1 },
});
