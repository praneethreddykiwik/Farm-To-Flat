import React, { forwardRef, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';
import { Title, Small } from './Text';

function GlassBackground({ style }) {
  return (
    <View style={[style, styles.bg]}>
      <BlurView
        intensity={50}
        tint="light"
        blurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(247,249,244,0.86)' }]} />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0)']}
        style={[StyleSheet.absoluteFill, { height: 120 }]}
      />
    </View>
  );
}

/**
 * Frosted bottom sheet. Cart, coupon entry, window selection and top-up all use this.
 * `ref.current.present()` / `.dismiss()`.
 * @param {{ title?: string, subtitle?: string, snapPoints?: (string|number)[], scroll?: boolean, children: any, onDismiss?: () => void, dynamic?: boolean, keyboard?: boolean }} props
 */
export const Sheet = /** @type {any} */ (
  forwardRef(function Sheet(
    /** @type {any} */ {
      title,
      subtitle,
      snapPoints,
      scroll = false,
      children,
      onDismiss,
      dynamic = true,
      keyboard = false,
    },
    ref,
  ) {
    const insets = useSafeAreaInsets();
    const points = useMemo(() => snapPoints, [snapPoints]);
    const renderBackdrop = useCallback(
      (p) => (
        <BottomSheetBackdrop
          {...p}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          pressBehavior="close"
          opacity={0.45}
        />
      ),
      [],
    );
    const Body = scroll ? BottomSheetScrollView : BottomSheetView;
    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={points}
        enableDynamicSizing={dynamic && !points}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundComponent={/** @type {any} */ (GlassBackground)}
        handleIndicatorStyle={styles.handle}
        onDismiss={onDismiss}
        keyboardBehavior={keyboard ? 'interactive' : 'extend'}
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        stackBehavior="push"
      >
        <Body
          style={styles.body}
          contentContainerStyle={scroll ? { paddingBottom: insets.bottom + 24 } : undefined}
        >
          {title ? (
            <View style={styles.header}>
              <Title>{title}</Title>
              {subtitle ? (
                <Small muted style={{ marginTop: 4 }}>
                  {subtitle}
                </Small>
              ) : null}
            </View>
          ) : null}
          <View style={{ paddingBottom: scroll ? 0 : insets.bottom + 16 }}>{children}</View>
        </Body>
      </BottomSheetModal>
    );
  })
);

const styles = StyleSheet.create({
  bg: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  handle: { backgroundColor: 'rgba(14,27,20,0.22)', width: 44, height: 5 },
  body: { paddingHorizontal: 20 },
  header: { marginBottom: 16, marginTop: 4 },
});
