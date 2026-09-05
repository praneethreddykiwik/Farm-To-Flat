import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react-native';
import { Glass } from './Glass';
import { Small, Text } from './Text';
import { colors } from '../theme';
import { hideToast, selectToast } from '../features/ui/uiSlice';

/** Global glass toast, mounted once in the root layout. Dispatch showToast({ title, message?, tone }). */
export function ToastHost() {
  const toast = useSelector(selectToast);
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => dispatch(hideToast()), toast.duration || 2600);
    return () => clearTimeout(t);
  }, [toast, dispatch]);

  if (!toast) return null;
  const tone = toast.tone || 'neutral';
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? AlertCircle : Info;
  const iconColor = tone === 'success' ? colors.sprout : tone === 'error' ? '#FF9B7A' : colors.sky;

  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 8 }]}>
      <Animated.View
        key={toast.id}
        entering={FadeInUp.duration(280).springify().damping(18)}
        exiting={FadeOutUp.duration(180)}
      >
        <Glass tone="dark" radius={20} innerStyle={styles.inner}>
          <Icon size={20} color={iconColor} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium" color={colors.inkOnDark}>
              {toast.title}
            </Text>
            {toast.message ? (
              <Small color="rgba(243,245,239,0.72)" style={{ marginTop: 2 }}>
                {toast.message}
              </Small>
            ) : null}
          </View>
        </Glass>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, zIndex: 100 },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});
