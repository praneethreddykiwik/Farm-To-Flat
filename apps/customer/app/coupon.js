import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useDispatch } from 'react-redux';
import { ClipboardPaste, Ticket, X } from 'lucide-react-native';
import { Ambient, Button, Display, Glass, Input, Pressy, Small, Text } from '../src/ui';
import { useApplyCouponMutation } from '../src/api/api';
import { showToast } from '../src/features/ui/uiSlice';
import { haptic } from '../src/lib/haptics';
import { colors, radius } from '../src/theme';

/**
 * Coupon entry. A route rather than a nested bottom sheet: the basket is presented as a native
 * iOS form sheet, and a sheet presented from inside that controller never appears.
 */
export default function Coupon() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [apply, { isLoading }] = useApplyCouponMutation();

  const paste = async () => {
    const s = (await Clipboard.getStringAsync())?.trim();
    if (s) setCode(s.toUpperCase());
  };

  const submit = async () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    try {
      const res = await apply(c).unwrap();
      haptic.success();
      dispatch(
        showToast({ title: 'Coupon applied', message: res?.cart?.coupon?.label, tone: 'success' }),
      );
      router.back();
    } catch (e) {
      haptic.error();
      setError(e?.message || 'Could not apply that code');
    }
  };

  return (
    <View style={styles.root}>
      <Ambient intensity={0.7} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={{ flex: 1 }}>
            <Display>Have a coupon?</Display>
            <Small muted style={{ marginTop: 4 }}>
              From the brochure or the packet sticker
            </Small>
          </View>
          <Pressy onPress={() => router.back()} haptics="select" accessibilityLabel="Close">
            <Glass radius={radius.pill} innerStyle={styles.close}>
              <X size={20} color={colors.ink} />
            </Glass>
          </Pressy>
        </View>

        <View style={{ paddingHorizontal: 20 }}>
          <Input
            label="Coupon code"
            value={code}
            onChangeText={(t) => {
              setCode(t.toUpperCase());
              setError(null);
            }}
            placeholder="FARM-XXXXXXXX"
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            mono
            error={error}
            leading={<Ticket size={18} color={colors.ink3} />}
            trailing={
              <Pressy onPress={paste} haptics="select" accessibilityLabel="Paste code">
                <ClipboardPaste size={18} color={colors.leaf} />
              </Pressy>
            }
            onSubmitEditing={submit}
            returnKeyType="done"
          />
          <View style={styles.hints}>
            <Small muted>One coupon per order. Try </Small>
            <Pressy onPress={() => setCode('FARM-WELCOME')} haptics="select">
              <Text variant="smallMedium" color={colors.leafDeep}>
                FARM-WELCOME
              </Text>
            </Pressy>
          </View>
          <Button
            title="Apply coupon"
            onPress={submit}
            loading={isLoading}
            disabled={!code.trim()}
            style={{ marginTop: 18 }}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hints: { flexDirection: 'row', alignItems: 'center', marginTop: 10, marginLeft: 4 },
});
