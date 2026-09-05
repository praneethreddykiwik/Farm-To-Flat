import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { colors, radius as R, shadow } from '../theme';

const liquid = Platform.OS === 'ios' && isLiquidGlassAvailable();

/**
 * Frosted surface. Three tones:
 *  - light (default): white frost over the ambient canvas
 *  - dark: deep forest frost, used for the tab bar, cart bar, product hero chrome
 *  - clear: hairline only, for nested surfaces inside another glass
 * On iOS 26 with Liquid Glass available and `liquid` set, uses the native GlassView.
 *
 * @param {{ tone?: 'light'|'dark'|'clear', radius?: number, intensity?: number, liquid?: boolean, elevated?: boolean, blur?: boolean, style?: any, innerStyle?: any, children?: any, pointerEvents?: any }} props
 */
export function Glass({
  tone = 'light',
  radius = R.lg,
  intensity,
  liquid: wantLiquid = false,
  elevated = true,
  // Long lists set blur={false}: dozens of stacked BlurViews are what makes scrolling stutter.
  blur = true,
  style,
  innerStyle,
  children,
  ...rest
}) {
  const isDark = tone === 'dark';
  const isClear = tone === 'clear';
  const border = isDark ? colors.glassDarkBorder : colors.glassBorder;

  if (wantLiquid && liquid && !isClear) {
    return (
      <View
        style={[elevated && (isDark ? shadow.lift : shadow.soft), { borderRadius: radius }, style]}
        {...rest}
      >
        <GlassView
          glassEffectStyle="regular"
          tintColor={isDark ? 'rgba(11,21,16,0.55)' : 'rgba(255,255,255,0.35)'}
          colorScheme={isDark ? 'dark' : 'light'}
          style={[{ borderRadius: radius, overflow: 'hidden' }, innerStyle]}
        >
          {children}
        </GlassView>
      </View>
    );
  }

  return (
    <View
      style={[
        elevated && !isClear && (isDark ? shadow.lift : shadow.soft),
        { borderRadius: radius },
        style,
      ]}
      {...rest}
    >
      <View
        style={[
          {
            borderRadius: radius,
            overflow: 'hidden',
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: border,
          },
          innerStyle,
        ]}
      >
        {!isClear && blur && (
          <BlurView
            intensity={intensity ?? (isDark ? 60 : 38)}
            tint={isDark ? 'dark' : 'light'}
            blurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
          />
        )}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: isDark
                ? colors.glassDark
                : isClear
                  ? 'rgba(255,255,255,0.28)'
                  : colors.glass,
            },
          ]}
        />
        {!isClear && (
          <LinearGradient
            pointerEvents="none"
            colors={
              isDark
                ? ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.0)']
                : ['rgba(255,255,255,0.75)', 'rgba(255,255,255,0.05)']
            }
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        {children}
      </View>
    </View>
  );
}

/** Small rounded glass chip, e.g. "Try-on" pills in the reference screens */
/** @param {any} props */
export function GlassPill({ children, tone = 'light', style = undefined, ...rest }) {
  return (
    <Glass
      tone={tone}
      radius={R.pill}
      elevated={false}
      style={style}
      innerStyle={styles.pill}
      {...rest}
    >
      {children}
    </Glass>
  );
}

export const isLiquidGlass = liquid;

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
