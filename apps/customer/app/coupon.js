import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useDispatch } from 'react-redux';
import { ClipboardPaste, Lock, Ticket, X } from 'lucide-react-native';
import { Ambient, Button, Display, Glass, Input, Label, Pressy, Small, Text } from '../src/ui';
import { useApplyCouponMutation, useGetCartQuery, useGetCouponsQuery } from '../src/api/api';
import { showToast } from '../src/features/ui/uiSlice';
import { haptic } from '../src/lib/haptics';
import { colors, fonts, radius } from '../src/theme';

/**
 * Coupon entry + the list of available offers, with the terms spelled out ("Spend ₹500 to unlock").
 * A route rather than a nested bottom sheet: the basket is a native iOS form sheet, and a sheet
 * presented from inside that controller never appears.
 */
export default function Coupon() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [apply, { isLoading }] = useApplyCouponMutation();

  const cart = useGetCartQuery();
  const subtotal = Number(cart.data?.cart?.subtotalPaise || 0);
  const { data: couponData } = useGetCouponsQuery(subtotal);
  const coupons = couponData?.coupons || [];

  const paste = async () => {
    const s = (await Clipboard.getStringAsync())?.trim();
    if (s) setCode(s.toUpperCase());
  };

  const applyCode = async (raw) => {
    const c = String(raw).trim().toUpperCase();
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
              Tap an offer below, or type a code from the brochure
            </Small>
          </View>
          <Pressy onPress={() => router.back()} haptics="select" accessibilityLabel="Close">
            <Glass radius={radius.pill} innerStyle={styles.close}>
              <X size={20} color={colors.ink} />
            </Glass>
          </Pressy>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
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
            mono
            error={error}
            leading={<Ticket size={18} color={colors.ink3} />}
            trailing={
              <Pressy onPress={paste} haptics="select" accessibilityLabel="Paste code">
                <ClipboardPaste size={18} color={colors.leaf} />
              </Pressy>
            }
            onSubmitEditing={() => applyCode(code)}
            returnKeyType="done"
          />
          <Button
            title="Apply coupon"
            onPress={() => applyCode(code)}
            loading={isLoading}
            disabled={!code.trim()}
            style={{ marginTop: 16 }}
          />

          {coupons.length > 0 ? (
            <>
              <Label style={{ marginTop: 28, marginBottom: 4 }}>Available offers</Label>
              {coupons.map((c) => (
                <CouponCard key={c.code} coupon={c} onApply={() => applyCode(c.code)} />
              ))}
              <Small muted center style={{ marginTop: 12 }}>
                One coupon per order.
              </Small>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function CouponCard({ coupon, onApply }) {
  const locked = !coupon.meetsMinimum;
  return (
    <Pressable
      onPress={locked ? undefined : onApply}
      disabled={locked}
      style={[styles.card, locked && styles.cardLocked]}
      accessibilityRole="button"
      accessibilityState={{ disabled: locked }}
    >
      <View style={styles.stub}>
        <Ticket size={20} color={locked ? colors.ink3 : colors.leafDeep} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.cardTop}>
          <Text style={styles.discount}>{coupon.discountText}</Text>
          <Text style={styles.codeText}>{coupon.code}</Text>
        </View>
        {coupon.label ? (
          <Small muted style={{ marginTop: 1 }}>
            {coupon.label}
          </Small>
        ) : null}
        <View style={styles.termRow}>
          {locked ? <Lock size={12} color={colors.amber} /> : null}
          <Small style={{ color: locked ? colors.amber : colors.leaf }}>
            {locked ? coupon.unlockText : coupon.minOrderText}
          </Small>
        </View>
      </View>
      {!locked ? (
        <View style={styles.applyPill}>
          <Text style={styles.applyText}>Apply</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 14,
    marginTop: 10,
  },
  cardLocked: { backgroundColor: 'rgba(14,27,20,0.03)' },
  stub: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.leafSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTop: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  discount: { fontFamily: fonts.display, fontSize: 17, color: colors.ink, letterSpacing: -0.3 },
  codeText: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.ink3 },
  termRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  applyPill: {
    backgroundColor: colors.leaf,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  applyText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.white },
});
