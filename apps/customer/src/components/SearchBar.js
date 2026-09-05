import React, { useEffect } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Mic, Search, Square, X } from 'lucide-react-native';
import { Glass, Pressy, Small } from '../ui';
import { colors, fonts, radius } from '../theme';
import { useVoiceSearch, voiceUnavailableReason } from '../lib/voice';
import { haptic } from '../lib/haptics';

/** Pulsing ring behind the mic while it is listening. */
function ListeningPulse() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
  }, [p]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - p.value),
    transform: [{ scale: 1 + p.value * 0.9 }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.pulse, style]} />;
}

/**
 * Search field with a voice button. Speaking fills the field live; the final transcript is
 * submitted. The mic is hidden when the native recogniser is unavailable (Expo Go).
 *
 * @param {{ value?: string, onChangeText?: (t: string) => void, onPress?: () => void, autoFocus?: boolean, placeholder?: string, style?: any, editable?: boolean, onSubmit?: () => void, voice?: boolean }} props
 */
export function SearchBar({
  value = '',
  onChangeText,
  onPress,
  autoFocus,
  placeholder = 'Search "tamata", "karela", "palak"…',
  style,
  editable = true,
  onSubmit,
  voice = false,
}) {
  const { supported, listening, error, start, stop } = useVoiceSearch({
    onResult: (t) => onChangeText?.(t),
    onFinal: (t) => {
      onChangeText?.(t);
      haptic.success();
      onSubmit?.();
    },
  });
  const showMic = voice && supported && editable && !value?.length;

  const inner = (
    <Glass radius={radius.pill} innerStyle={styles.inner}>
      <Search size={18} color={colors.ink3} strokeWidth={2.2} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={listening ? 'Listening… say a vegetable' : placeholder}
        placeholderTextColor={listening ? colors.leaf : colors.ink3}
        autoFocus={autoFocus}
        editable={editable}
        pointerEvents={editable ? 'auto' : 'none'}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        autoCorrect={false}
        autoCapitalize="none"
        style={styles.input}
        accessibilityLabel="Search products"
      />
      {value?.length ? (
        <Pressy
          onPress={() => onChangeText?.('')}
          haptics="select"
          accessibilityLabel="Clear search"
        >
          <X size={16} color={colors.ink2} />
        </Pressy>
      ) : null}
      {showMic || listening ? (
        <Pressy
          onPress={() => (listening ? stop() : start())}
          haptics="tap"
          accessibilityLabel={listening ? 'Stop listening' : 'Search by voice'}
          accessibilityRole="button"
        >
          <View style={[styles.mic, listening && styles.micOn]}>
            {listening ? <ListeningPulse /> : null}
            {listening ? (
              <Square size={13} color={colors.ink} fill={colors.ink} />
            ) : (
              <Mic size={16} color={colors.leafDeep} strokeWidth={2.2} />
            )}
          </View>
        </Pressy>
      ) : null}
    </Glass>
  );

  return (
    <View style={style}>
      {onPress ? (
        <Pressy onPress={onPress} haptics="soft" scale={0.985}>
          {inner}
        </Pressy>
      ) : (
        inner
      )}
      {error ? (
        <Small color={colors.tomato} style={styles.error}>
          {error}
        </Small>
      ) : voice && !supported && __DEV__ ? (
        <Small muted style={styles.error}>
          Voice off: {voiceUnavailableReason || 'not supported on this build'}
        </Small>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, height: 50 },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.ink, paddingVertical: 0 },
  mic: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.leafSoft,
  },
  micOn: { backgroundColor: colors.sprout },
  pulse: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.sprout,
  },
  error: { marginTop: 6, marginLeft: 16 },
});
