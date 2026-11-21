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
  radius: radiusProp = R.lg,
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
  // A fixed square asking for a pill radius (the 44×44 back, basket and bell buttons) is a round
  // button: exactly half the shorter side, drawn as a single circle further down.
  const box = StyleSheet.flatten(innerStyle) || {};
  const round =
    typeof box.width === 'number' &&
    typeof box.height === 'number' &&
    radiusProp >= Math.min(box.width, box.height) / 2;
  const radius = round ? Math.min(box.width, box.height) / 2 : radiusProp;
  const isDark = tone === 'dark';
  const isClear = tone === 'clear';
  const border = isDark ? colors.glassDarkBorder : colors.glassBorder;

  // Real background blur only exists on iOS. On Android the dimezisBlurView method falls back to
  // "none", so a translucent fill would let the ambient colour blobs bleed through and the surface
  // reads as muddy. There we skip the (ineffective) BlurView and use a near-opaque frosted fill so
  // every card, sheet and bar reads as a clean surface — matching the frosted look iOS gets for free.
  //
  // The dark tone is fully opaque there. It is the chrome that floats OVER scrolling content (the
  // tab bar, the basket bar), and at 94% a white card passing underneath still read through it:
  // product names and "Add" buttons ghosting across the tab bar. Without blur, anything short of
  // solid is legible.
  const isIOS = Platform.OS === 'ios';
  // A round button carries no blur (see below), so on iOS its fill is a little denser to read the
  // same over a photo or the ambient background.
  const fill = isDark
    ? isIOS
      ? round
        ? 'rgba(14,27,20,0.86)'
        : colors.glassDark
      : 'rgb(13,25,18)'
    : isClear
      ? isIOS
        ? 'rgba(255,255,255,0.28)'
        : 'rgba(255,255,255,0.55)'
      : isIOS && !round
        ? colors.glass
        : // Android: no real blur, so a near-solid fill — but 0.94 hid the background glow
          // completely and every card read flat white next to the iPhone build (21 Nov 2026).
          // 0.86 lets the green/yellow glow tint the card while text stays crisp.
          'rgba(255,255,255,0.86)';

  // A small round button (the 44-pt back, basket and bell buttons) is drawn as ONE plain circle:
  // fill + radius on a single view, no hairline border, no clipped inner layer. The layered build
  // below (border + clipped inner view + blur + gradient) came out on iOS as a rounded square with
  // its top, bottom and sides shaved flat; a single filled view with the same radius is a true
  // circle (checked side by side on the simulator, 21 Nov 2026). The shadow still follows it.
  if (round) {
    return (
      <View
        style={[
          elevated && !isClear && (isDark ? shadow.lift : shadow.soft),
          { borderRadius: radius, backgroundColor: isClear ? 'transparent' : fill },
          style,
          innerStyle,
        ]}
        {...rest}
      >
        {children}
      </View>
    );
  }

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
        {!isClear && blur && isIOS && (
          <BlurView
            intensity={intensity ?? (isDark ? 60 : 38)}
            tint={isDark ? 'dark' : 'light'}
            blurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
          />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
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
