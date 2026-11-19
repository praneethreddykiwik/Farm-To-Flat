import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ArrowLeft,
  CalendarClock,
  PackageOpen,
  ShieldCheck,
  Trash2,
  Wallet,
} from 'lucide-react-native';
import { Ambient, Button, Display, Glass, Input, Label, Pressy, Small, Text } from '../src/ui';
import {
  useConfirmDeletionMutation,
  useGetDeletionStatusQuery,
  useRequestDeletionCodeMutation,
} from '../src/api/api';
import { selectCustomer } from '../src/features/auth/authSlice';
import { selectLanguage, showToast } from '../src/features/ui/uiSlice';
import { useSignOut } from '../src/hooks/useSession';
import { prettyNumber } from '../src/lib/phone';
import { haptic } from '../src/lib/haptics';
import { t } from '../src/lib/i18n';
import { colors, radius } from '../src/theme';

/**
 * Delete my account (app stores + DPDP right to erasure), with the 60-day grace period:
 *   1. say exactly what happens — signed out now, deleted for good after 60 days, signing in again
 *      before then keeps the account; what is removed and what the law makes us keep;
 *   2. refuse, with the order numbers, while an order is still in progress;
 *   3. confirm with a code sent to the account's own number;
 *   4. show the date it will be deleted, then sign out.
 */
export default function DeleteAccount() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const lang = useSelector(selectLanguage);
  const customer = useSelector(selectCustomer);
  const signOut = useSignOut();
  const { data, isLoading, refetch } = useGetDeletionStatusQuery();
  const [requestCode, { isLoading: sending }] = useRequestDeletionCodeMutation();
  const [confirm, { isLoading: confirming }] = useConfirmDeletionMutation();
  const [step, setStep] = useState(/** @type {'info'|'code'|'done'} */ ('info'));
  const [otp, setOtp] = useState('');
  const [error, setError] = useState(/** @type {string|null} */ (null));
  const [result, setResult] = useState(/** @type {any} */ (null));

  const days = data?.graceDays || 60;
  const blockers = data?.ordersInProgress || [];
  const wallet = Math.round(Number(data?.walletBalancePaise || 0) / 100);
  const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  const send = async () => {
    setError(null);
    try {
      await requestCode().unwrap();
      haptic.success();
      setStep('code');
    } catch (e) {
      haptic.error();
      setError(e?.message || t('deleteFailed', lang));
      refetch();
    }
  };
  const finish = async () => {
    if (otp.length < 4) return;
    setError(null);
    try {
      const r = await confirm(otp).unwrap();
      haptic.success();
      setResult(r);
      setStep('done');
    } catch (e) {
      haptic.error();
      setError(e?.message || t('deleteFailed', lang));
      setOtp('');
    }
  };
  const done = () => {
    signOut();
    dispatch(showToast({ title: t('deleteSignedOut', lang), tone: 'neutral' }));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Ambient />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 40,
        }}
      >
        {step !== 'done' ? (
          <Pressy onPress={() => router.back()} haptics="select" accessibilityLabel="Back">
            <Glass radius={radius.pill} innerStyle={styles.back}>
              <ArrowLeft size={20} color={colors.ink} />
            </Glass>
          </Pressy>
        ) : null}

        {step === 'done' ? (
          <Animated.View entering={FadeInDown.duration(380)} style={{ marginTop: 40 }}>
            <View style={styles.bigIcon}>
              <CalendarClock size={30} color={colors.ink} />
            </View>
            <Display style={{ marginTop: 18 }}>{t('deleteScheduledTitle', lang)}</Display>
            <Text variant="body" style={{ marginTop: 10 }}>
              {result?.scheduled
                ? t('deleteScheduledBody', lang, { date: fmtDate(result.deleteAfter), days })
                : t('deleteDoneBody', lang)}
            </Text>
            {result?.scheduled ? (
              <Small muted style={{ marginTop: 10 }}>
                {t('deleteChangeMind', lang, { date: fmtDate(result.deleteAfter) })}
              </Small>
            ) : null}
            <Button title={t('deleteOk', lang)} onPress={done} style={{ marginTop: 26 }} />
          </Animated.View>
        ) : (
          <>
            <Display style={{ marginTop: 18 }}>{t('deleteTitle', lang)}</Display>
            <Small muted style={{ marginTop: 6 }}>
              {t('deleteLede', lang, { days })}
            </Small>

            <Glass radius={radius.lg} innerStyle={{ padding: 16, gap: 16, marginTop: 20 }}>
              <Point
                Icon={CalendarClock}
                title={t('deleteWhenTitle', lang, { days })}
                body={t('deleteWhenBody', lang, { days })}
              />
              <Point
                Icon={Trash2}
                title={t('deleteWhatTitle', lang)}
                body={t('deleteWhatBody', lang)}
              />
              <Point
                Icon={ShieldCheck}
                title={t('deleteKeptTitle', lang)}
                body={t('deleteKeptBody', lang)}
              />
              {wallet > 0 ? (
                <Point
                  Icon={Wallet}
                  title={t('deleteWalletTitle', lang, { amount: wallet })}
                  body={t('deleteWalletBody', lang, { days })}
                />
              ) : null}
            </Glass>

            {blockers.length ? (
              <Animated.View entering={FadeInDown.duration(300)}>
                <Label style={{ marginTop: 24, marginBottom: 8 }}>
                  {t('deleteBlockedLabel', lang)}
                </Label>
                <Glass radius={radius.lg} innerStyle={{ padding: 16, gap: 10 }}>
                  <Small>{t('deleteBlockedBody', lang)}</Small>
                  {blockers.map((o) => (
                    <Pressy
                      key={o.id}
                      onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })}
                      haptics="select"
                    >
                      <View style={styles.blocker}>
                        <PackageOpen size={18} color={colors.ink} />
                        <Text variant="bodyMedium" style={{ flex: 1 }}>
                          {o.orderNumber}
                        </Text>
                        <Small muted>
                          {o.cashDue ? t('deleteCashDue', lang) : t('deleteOnItsWay', lang)}
                        </Small>
                      </View>
                    </Pressy>
                  ))}
                </Glass>
              </Animated.View>
            ) : null}

            {step === 'code' ? (
              <Animated.View entering={FadeInDown.duration(300)} style={{ marginTop: 24 }}>
                <Label style={{ marginBottom: 8 }}>{t('deleteCodeLabel', lang)}</Label>
                <Small muted style={{ marginBottom: 10 }}>
                  {t('deleteCodeSent', lang, {
                    mobile: customer?.mobile ? `+91 ${prettyNumber(customer.mobile)}` : '',
                  })}
                </Small>
                <Input
                  value={otp}
                  onChangeText={(v) => {
                    setOtp(v.replace(/\D/g, '').slice(0, 6));
                    setError(null);
                  }}
                  placeholder="••••••"
                  keyboardType="number-pad"
                  maxLength={6}
                  error={error}
                  mono
                />
                <Button
                  title={t('deleteConfirmButton', lang)}
                  variant="danger"
                  onPress={finish}
                  loading={confirming}
                  disabled={otp.length < 4}
                  style={{ marginTop: 16 }}
                />
                <Pressy
                  onPress={send}
                  haptics="select"
                  style={{ alignSelf: 'center', padding: 10 }}
                >
                  <Small muted>{t('deleteResend', lang)}</Small>
                </Pressy>
              </Animated.View>
            ) : (
              <View style={{ marginTop: 24 }}>
                {error ? (
                  <Small style={{ color: colors.tomato, marginBottom: 10 }}>{error}</Small>
                ) : null}
                <Button
                  title={t('deleteSendCode', lang)}
                  variant="danger"
                  onPress={send}
                  loading={sending || isLoading}
                  disabled={isLoading || blockers.length > 0}
                />
                <Button
                  title={t('keepAccount', lang)}
                  variant="ghost"
                  onPress={() => router.back()}
                  style={{ marginTop: 10 }}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** @param {{ Icon: any, title: string, body: string }} props */
function Point({ Icon, title, body }) {
  return (
    <View style={styles.point}>
      <View style={styles.pointIcon}>
        <Icon size={18} color={colors.ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyMedium">{title}</Text>
        <Small muted style={{ marginTop: 2 }}>
          {body}
        </Small>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  point: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  pointIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(14,27,20,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.sprout,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blocker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: 'rgba(14,27,20,0.05)',
  },
});
