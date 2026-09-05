import React, { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { Button, Money, Sheet, Small, Text } from '../ui';
import { colors, radius } from '../theme';

/**
 * Stand-in for the Razorpay checkout while the app runs in Expo Go (no native SDK) or against the
 * mock server. Lets the flow be exercised end to end: success and failure both reach the same
 * handlers the real SDK would. Never shipped in a release build (see checkout.js).
 * @param {{ intent: any, onResult: (r: { success: boolean, paymentId?: string }) => void }} props
 */
export const PaymentSimulator = /** @type {any} */ (
  forwardRef(function PaymentSimulator(/** @type {any} */ { intent, onResult }, ref) {
    return (
      <Sheet
        ref={ref}
        title="Razorpay (simulated)"
        subtitle="Real builds open the native Razorpay checkout here"
      >
        <View style={styles.card}>
          <View style={{ flex: 1 }}>
            <Small color="rgba(243,245,239,0.7)">{intent?.description || 'Payment'}</Small>
            <Money paise={intent?.amountPaise || 0} color={colors.sprout} variant="h1" />
          </View>
          <ShieldCheck size={28} color={colors.sprout} />
        </View>
        <Small muted style={{ marginTop: 14, marginBottom: 18 }}>
          The server’s webhook is the only thing that confirms money moved. This simulator just
          plays both the SDK callback and the webhook so you can test the screens.
        </Small>
        <Button
          title="Pay with UPI (succeeds)"
          onPress={() => onResult({ success: true, paymentId: `pay_sim_${Date.now()}` })}
        />
        <Button
          title="Simulate failure"
          variant="glass"
          onPress={() => onResult({ success: false })}
          style={{ marginTop: 10 }}
        />
        <Text variant="small" muted center style={{ marginTop: 14 }}>
          Card numbers, UPI PINs and bank credentials never touch this app.
        </Text>
      </Sheet>
    );
  })
);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.night,
    borderRadius: radius.lg,
    padding: 18,
  },
});
