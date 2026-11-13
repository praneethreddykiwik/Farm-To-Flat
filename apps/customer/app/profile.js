import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { kv } from '../src/lib/kv';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import {
  ArrowLeft,
  Bell,
  BellRing,
  ChevronRight,
  Leaf,
  LogOut,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  UserRound,
} from 'lucide-react-native';
import { Ambient, Button, Display, Glass, Label, Pressy, Small, Text } from '../src/ui';
import { EditFieldSheet } from '../src/components/EditFieldSheet';
import { checkEmail, checkName } from '../src/lib/validators';
import {
  useDeleteAddressMutation,
  useGetAddressesQuery,
  useGetDemandSubscriptionsQuery,
  useGetSupportQuery,
  useRegisterDeviceMutation,
  useRemoveDemandSubscriptionMutation,
  useSetDefaultAddressMutation,
  useUpdateMeMutation,
  useDeleteAccountMutation,
} from '../src/api/api';
import { customerUpdated, selectCustomer } from '../src/features/auth/authSlice';
import { profileUpdated, selectProfile } from '../src/features/plan/planSlice';
import { selectAiVisible } from '../src/features/role/roleSlice';
import { showToast, selectLanguage } from '../src/features/ui/uiSlice';
import { useSignOut } from '../src/hooks/useSession';
import { LanguagePicker } from '../src/components/LanguagePicker';
import { t } from '../src/lib/i18n';
import { colors, fonts, radius } from '../src/theme';
import { registerForPush } from '../src/lib/notifications';
import { env } from '../src/lib/env';

/**
 * One tappable row in a settings group.
 * @param {{ icon: any, label: string, value?: any, hint?: string, onPress?: () => void, right?: any, last?: boolean, lines?: number }} props
 */
function Row({
  icon,
  label,
  value,
  hint = undefined,
  onPress = undefined,
  right = undefined,
  last = false,
  // Most values are one thing (a name, a number) and should never wrap. A value that is a sentence
  // says so, and gets the second line it needs instead of being cut off mid-word.
  lines = 1,
}) {
  // Its own subscription: Row is a sibling component, not a child of Profile's scope.
  const lang = useSelector(selectLanguage);
  return (
    <Pressy onPress={onPress} haptics="select" scale={0.995} disabled={!onPress}>
      <View style={[styles.row, !last && styles.rowDivider]}>
        <View style={styles.rowIcon}>{icon}</View>
        <View style={{ flex: 1 }}>
          <Small muted>{label}</Small>
          <Text variant="bodyMedium" numberOfLines={lines} color={value ? colors.ink : colors.ink3}>
            {value || hint || t('notSet', lang)}
          </Text>
        </View>
        {right ?? (onPress ? <ChevronRight size={18} color={colors.ink3} /> : null)}
      </View>
    </Pressy>
  );
}

const DIETS = ['vegetarian', 'vegetarian + eggs', 'non-vegetarian', 'vegan'];

/** Whether the shopper wants order/wallet notifications, independent of the OS permission. */
const PUSH_PREF = 'notifications.enabled';

export default function Profile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const customer = useSelector(selectCustomer);
  const dietProfile = useSelector(selectProfile);
  const aiVisible = useSelector(selectAiVisible);
  const { data } = useGetAddressesQuery();
  const { data: supportData } = useGetSupportQuery();
  const support = supportData?.support;
  const [setDefault] = useSetDefaultAddressMutation();
  const [deleteAddress] = useDeleteAddressMutation();
  // "Tell me when you deliver here" requests. Listed here because this is where the form said they
  // could be removed; the section does not exist until there is one.
  const { data: requestData } = useGetDemandSubscriptionsQuery();
  const [removeRequest] = useRemoveDemandSubscriptionMutation();
  const requests = requestData?.subscriptions || [];
  const [registerDevice] = useRegisterDeviceMutation();
  const [updateMe, { isLoading: saving }] = useUpdateMeMutation();
  const [deleteAccount, { isLoading: deleting }] = useDeleteAccountMutation();
  const signOut = useSignOut();
  const lang = useSelector(selectLanguage);

  // Right-to-erasure. Two-step confirm; warns first if a wallet balance would be left behind, then
  // deletes server-side and signs out. The account is anonymised and the session revoked by the API.
  const confirmDelete = useCallback(() => {
    const balance = Number(customer?.balancePaise || 0);
    const body =
      t('deleteAccountBody', lang) + (balance > 0 ? `\n\n${t('deleteAccountWallet', lang)}` : '');
    Alert.alert(t('deleteAccountTitle', lang), body, [
      { text: t('keepAccount', lang), style: 'cancel' },
      {
        text: t('deleteAccountConfirm', lang),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAccount().unwrap();
            signOut();
          } catch {
            dispatch(showToast({ title: t('deleteAccountFailed', lang), tone: 'error' }));
          }
        },
      },
    ]);
  }, [customer, lang, deleteAccount, signOut, dispatch]);
  // Reflect the REAL notification permission, not a guess. This was `useState(false)`, so the
  // switch reset itself to off every time the screen remounted — turn it on, go back, come back,
  // and it read as off while notifications were in fact enabled.
  const [push, setPush] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Notifications.getPermissionsAsync()
        // Two things have to be true: the OS lets us notify, and the shopper has not switched it
        // off in here. The OS permission cannot be revoked from inside the app, so without the
        // second half, turning the switch off and coming back would show it on again.
        .then(
          (perm) => alive && setPush(perm.status === 'granted' && kv.getString(PUSH_PREF) !== '0'),
        )
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, []),
  );
  const [busy, setBusy] = useState(false);
  const [field, setField] = useState(null);
  const editSheet = useRef(null);

  const addresses = useMemo(() => data?.addresses || [], [data]);

  const makeDefault = async (a) => {
    try {
      await setDefault(a.id).unwrap();
      dispatch(showToast({ title: t('defaultChanged', lang), tone: 'success' }));
    } catch (e) {
      dispatch(showToast({ title: e?.message || t('couldNotSave', lang), tone: 'error' }));
    }
  };

  // Removing needs a second, deliberate tap — and the last address cannot go at all, because an
  // account with nowhere to deliver is thrown back into sign-up. The server enforces both; saying
  // so here first saves the customer a round trip to find out.
  const removeAddress = (a) => {
    if (addresses.length <= 1) {
      Alert.alert(t('onlyAddressTitle', lang), t('onlyAddressBody', lang), [
        { text: t('close', lang), style: 'cancel' },
        { text: t('addAnotherAddress', lang), onPress: () => router.push('/address/new') },
      ]);
      return;
    }
    Alert.alert(
      t('removeAddressTitle', lang),
      t('removeAddressBody', lang, { label: `${a.block} · ${a.flat}` }),
      [
        { text: t('keepAddress', lang), style: 'cancel' },
        {
          text: t('removeAddress', lang),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAddress(a.id).unwrap();
              dispatch(showToast({ title: t('addressRemoved', lang), tone: 'success' }));
            } catch (e) {
              dispatch(showToast({ title: e?.message || t('couldNotSave', lang), tone: 'error' }));
            }
          },
        },
      ],
    );
  };

  const floorText = (floor) =>
    floor === null || floor === undefined || floor === ''
      ? null
      : String(floor) === '0'
        ? t('floorGround', lang)
        : t('floorN', lang, { n: floor });

  const edit = (f) => {
    setField(f);
    setTimeout(() => editSheet.current?.present(), 60);
  };

  const save = async (key, value) => {
    try {
      if (key === 'diet') {
        dispatch(profileUpdated({ diet: value }));
      } else {
        await updateMe({ [key]: value }).unwrap();
        dispatch(customerUpdated({ [key]: value }));
      }
      dispatch(showToast({ title: t('savedToast', lang), tone: 'success' }));
      editSheet.current?.dismiss();
    } catch (e) {
      dispatch(showToast({ title: e?.message || t('couldNotSave', lang), tone: 'error' }));
    }
  };

  // Changing the number no longer signs you out. It used to, which meant you came back through
  // sign-in as a brand-new customer and were asked for your community and address again, with your
  // orders left on the old number.
  const changeMobile = () => router.push('/change-mobile');

  const togglePush = async (v) => {
    setPush(v);
    kv.setString(PUSH_PREF, v ? '1' : '0');
    if (!v) return;
    setBusy(true);
    const token = await registerForPush();
    setBusy(false);
    if (token) {
      registerDevice({ expoPushToken: token });
      dispatch(
        showToast({
          title: 'Notifications on',
          message: 'Order updates and wallet credits.',
          tone: 'success',
        }),
      );
    } else {
      dispatch(
        showToast({
          title: env.isExpoGo ? 'Push needs a development build' : 'Notifications not permitted',
          message: env.isExpoGo
            ? 'Local notifications still work in Expo Go.'
            : 'Enable them in Settings.',
          tone: 'neutral',
        }),
      );
    }
  };

  return (
    <View style={styles.root}>
      <Ambient />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressy onPress={() => router.back()} haptics="select" accessibilityLabel="Back">
            <Glass radius={radius.pill} innerStyle={styles.iconBtn}>
              <ArrowLeft size={20} color={colors.ink} />
            </Glass>
          </Pressy>
        </View>

        <Animated.View
          entering={FadeInDown.duration(360).springify().damping(18)}
          style={styles.hero}
        >
          <View style={styles.avatar}>
            <Text
              style={{
                fontFamily: fonts.displayItalic,
                fontSize: 30,
                lineHeight: 38,
                color: colors.sprout,
              }}
            >
              {(customer?.name || 'F').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Display>{customer?.name || t('yourAccount', lang)}</Display>
          <Small muted style={{ marginTop: 4 }}>
            {t('profileSubtitle', lang)}
          </Small>
        </Animated.View>

        <Label style={{ marginTop: 26, marginBottom: 8 }}>{t('personalDetails', lang)}</Label>
        <Glass radius={radius.lg} blur={false} innerStyle={styles.group}>
          <Row
            icon={<UserRound size={18} color={colors.ink} />}
            label={t('fullName', lang)}
            value={customer?.name}
            hint={t('addYourName', lang)}
            onPress={() =>
              edit({
                key: 'name',
                label: t('fullName', lang),
                value: customer?.name || '',
                placeholder: 'Vivek Goud',
                autoCapitalize: 'words',
                maxLength: 40,
                hint: t('nameAtDoor', lang),
                validate: checkName,
              })
            }
          />
          <Row
            icon={<Phone size={18} color={colors.ink} />}
            label={t('mobileNumber', lang)}
            value={customer?.mobile ? `+91 ${customer.mobile}` : null}
            onPress={changeMobile}
            right={
              <View style={styles.verified}>
                <ShieldCheck size={14} color={colors.leafDeep} />
                <Small color={colors.leafDeep} style={{ fontSize: 11 }}>
                  {t('verifiedBadge', lang)}
                </Small>
              </View>
            }
          />
          <Row
            icon={<Mail size={18} color={colors.ink} />}
            label={t('emailOptional', lang)}
            value={customer?.email}
            hint={t('forInvoices', lang)}
            onPress={() =>
              edit({
                key: 'email',
                label: t('emailLabel', lang),
                value: customer?.email || '',
                placeholder: 'you@example.com',
                keyboardType: 'email-address',
                autoCapitalize: 'none',
                maxLength: 120,
                hint: t('invoicesHere', lang),
                validate: checkEmail,
              })
            }
          />
          <Row
            icon={<Leaf size={18} color={colors.ink} />}
            label={t('foodPreference', lang)}
            // Stored lower-case; shown like every other value on this screen.
            value={
              dietProfile.diet
                ? dietProfile.diet[0].toUpperCase() + dietProfile.diet.slice(1)
                : null
            }
            onPress={() => {
              const i = DIETS.indexOf(dietProfile.diet);
              const next = DIETS[(i + 1) % DIETS.length];
              dispatch(profileUpdated({ diet: next }));
              dispatch(showToast({ title: `Preference set to ${next}`, tone: 'success' }));
            }}
            last
          />
        </Glass>

        <View style={styles.sectionHead}>
          <Label>{t('deliveryAddresses', lang)}</Label>
          <Small muted>{t('savedCount', lang, { n: addresses.length })}</Small>
        </View>
        <View style={{ gap: 10 }}>
          {addresses.map((a, i) => (
            <Animated.View
              key={a.id}
              entering={FadeInDown.delay(60 + i * 50).duration(320)}
              // A removed address fades and the ones below close the gap, rather than the list
              // snapping shut under the confirmation the customer has just dismissed.
              exiting={FadeOut.duration(180)}
              layout={LinearTransition.springify().damping(20)}
            >
              <Glass radius={radius.lg} blur={false}>
                <View style={styles.addr}>
                  <View
                    style={[styles.addrIcon, a.isDefault && { backgroundColor: colors.sprout }]}
                  >
                    <MapPin size={18} color={colors.ink} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium">
                      {a.block} · {a.flat}
                    </Text>
                    <Small muted numberOfLines={1}>
                      {[a.communityName, a.area].filter(Boolean).join(', ')}
                    </Small>
                    {/* Floor, then who and how to reach them — one line of small print, so a long
                        community name wraps on its own line rather than orphaning "12". */}
                    {floorText(a.floor) || a.recipientName || a.contactNumber ? (
                      <Small muted style={{ fontSize: 11, marginTop: 2 }}>
                        {[
                          floorText(a.floor),
                          a.recipientName,
                          a.contactNumber && `+91 ${a.contactNumber}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Small>
                    ) : null}
                  </View>
                  {a.isDefault ? (
                    <View style={styles.defaultTag}>
                      <Star size={12} color={colors.leafDeep} fill={colors.leafDeep} />
                      <Small color={colors.leafDeep} style={{ fontSize: 11 }}>
                        {t('defaultBadge', lang)}
                      </Small>
                    </View>
                  ) : null}
                </View>
                {/* What can be done with it, in words. The card used to be one silent tap target
                    that only ever set the default: there was no way to correct a flat number or
                    drop an old address short of deleting the whole account. */}
                <View style={styles.addrActions}>
                  <Pressy
                    onPress={() => router.push({ pathname: '/address/[id]', params: { id: a.id } })}
                    haptics="select"
                    style={styles.addrAction}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('editAddress', lang)} ${a.block} ${a.flat}`}
                  >
                    <Pencil size={15} color={colors.leafDeep} />
                    <Small color={colors.leafDeep} style={styles.addrActionText}>
                      {t('editAddress', lang)}
                    </Small>
                  </Pressy>
                  <View style={styles.addrActionRule} />
                  <Pressy
                    onPress={() => removeAddress(a)}
                    haptics="select"
                    style={styles.addrAction}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('removeAddress', lang)} ${a.block} ${a.flat}`}
                  >
                    <Trash2 size={15} color={colors.tomato} />
                    <Small color={colors.tomato} style={styles.addrActionText}>
                      {t('removeAddress', lang)}
                    </Small>
                  </Pressy>
                  {a.isDefault ? null : (
                    <>
                      <View style={styles.addrActionRule} />
                      <Pressy
                        onPress={() => makeDefault(a)}
                        haptics="select"
                        style={styles.addrAction}
                        accessibilityRole="button"
                        accessibilityLabel={`${t('makeDefault', lang)} ${a.block} ${a.flat}`}
                      >
                        <Star size={15} color={colors.ink2} />
                        <Small color={colors.ink2} style={styles.addrActionText}>
                          {t('makeDefault', lang)}
                        </Small>
                      </Pressy>
                    </>
                  )}
                </View>
              </Glass>
            </Animated.View>
          ))}
          <Button
            title={t('addAnotherAddress', lang)}
            variant="glass"
            size="md"
            onPress={() => router.push('/address/new')}
            icon={<Plus size={18} color={colors.ink} />}
          />
        </View>

        {requests.length ? (
          <>
            <Label style={{ marginTop: 26, marginBottom: 8 }}>{t('deliveryRequests', lang)}</Label>
            <Glass radius={radius.lg} blur={false} innerStyle={styles.group}>
              {requests.map((r, i) => (
                <Row
                  key={r.id}
                  icon={<BellRing size={18} color={colors.ink} />}
                  label={r.communityName || t('deliveryRequestNote', lang)}
                  value={r.areaLabel}
                  last={i === requests.length - 1}
                  right={
                    <Pressy
                      onPress={async () => {
                        try {
                          await removeRequest(r.id).unwrap();
                          dispatch(
                            showToast({ title: t('requestRemoved', lang), tone: 'success' }),
                          );
                        } catch (e) {
                          dispatch(
                            showToast({
                              title: e?.message || t('couldNotSave', lang),
                              tone: 'error',
                            }),
                          );
                        }
                      }}
                      haptics="select"
                      style={styles.requestRemove}
                      accessibilityRole="button"
                      accessibilityLabel={`${t('removeAddress', lang)} ${r.areaLabel}`}
                    >
                      <Small color={colors.tomato} style={styles.addrActionText}>
                        {t('removeAddress', lang)}
                      </Small>
                    </Pressy>
                  }
                />
              ))}
            </Glass>
          </>
        ) : null}

        <Label style={{ marginTop: 26, marginBottom: 8 }}>{t('preferencesLabel', lang)}</Label>
        <Glass radius={radius.lg} blur={false} innerStyle={styles.group}>
          <Row
            icon={<Bell size={18} color={colors.ink} />}
            label={t('orderWalletUpdates', lang)}
            value={t('orderWalletUpdatesHint', lang)}
            lines={2}
            right={
              <Switch
                value={push}
                onValueChange={togglePush}
                disabled={busy}
                trackColor={{ true: colors.leaf, false: 'rgba(14,27,20,0.15)' }}
                thumbColor={colors.white}
              />
            }
            last={!aiVisible}
          />
          {aiVisible ? (
            <Row
              icon={<Sparkles size={18} color={colors.ink} />}
              label={t('dietitianProfile', lang)}
              value={
                dietProfile.age
                  ? `${dietProfile.age} y · ${dietProfile.goal} · ${dietProfile.mealsPerDay} meals a day`
                  : null
              }
              hint={t('dietitianProfileHint', lang)}
              onPress={() => router.push('/(tabs)/plan')}
              last
            />
          ) : null}
        </Glass>

        {aiVisible ? (
          <>
            <Label style={{ marginTop: 26, marginBottom: 8 }}>{t('superAdmin', lang)}</Label>
            <Glass radius={radius.lg} blur={false} innerStyle={styles.group}>
              <Row
                icon={<ShieldCheck size={18} color={colors.ink} />}
                label={t('operationsConsole', lang)}
                hint={t('operationsConsoleHint', lang)}
                onPress={() => router.push('/staff/console')}
                last
              />
            </Glass>
          </>
        ) : null}

        {support && (support.email || support.phone) ? (
          <>
            <Label style={{ marginTop: 26, marginBottom: 8 }}>{t('helpAndSupport', lang)}</Label>
            <Glass radius={radius.lg} blur={false} innerStyle={styles.group}>
              {support.email ? (
                <Row
                  icon={<Mail size={18} color={colors.ink} />}
                  label={t('emailUs', lang)}
                  value={support.email}
                  onPress={() => Linking.openURL(`mailto:${support.email}`).catch(() => {})}
                  last={!support.phone}
                />
              ) : null}
              {support.phone ? (
                <Row
                  icon={<Phone size={18} color={colors.ink} />}
                  label={t('callUs', lang)}
                  value={support.phone}
                  onPress={() =>
                    Linking.openURL(`tel:${support.phone.replace(/\s/g, '')}`).catch(() => {})
                  }
                  last
                />
              ) : null}
            </Glass>
          </>
        ) : null}

        {/* In English the translated word IS "Language", so pairing them read "Language ·
            Language". Show the pair only when it actually says something. */}
        <Label style={{ marginTop: 26, marginBottom: 8 }}>
          {lang === 'en' ? 'Language' : `${t('language', lang)} · Language`}
        </Label>
        <Glass radius={radius.lg} blur={false} innerStyle={{ padding: 14 }}>
          <LanguagePicker />
          <Small muted style={{ marginTop: 10 }}>
            {t('languageNote', lang)}
          </Small>
        </Glass>

        <Label style={{ marginTop: 26, marginBottom: 8 }}>{t('aboutLabel', lang)}</Label>
        <Glass radius={radius.lg} blur={false} innerStyle={{ padding: 16, gap: 6 }}>
          <Small muted>Fooducia · v{env.appVersion}</Small>
          {/* The food-business licence number, where a customer can find it. Appears once
              EXPO_PUBLIC_FSSAI_LICENCE is set; until then there is deliberately no placeholder. */}
          {env.fssaiLicence ? (
            <Small muted selectable>
              FSSAI Lic. No. {env.fssaiLicence}
            </Small>
          ) : null}
          {/* Carry the reader's language to the web page, which renders in all three. */}
          <Pressy
            onPress={() =>
              Linking.openURL(`https://fooducia.health/privacy?lang=${lang}`).catch(() => {})
            }
            haptics="select"
          >
            <Small style={{ color: colors.leafDeep, textDecorationLine: 'underline' }}>
              {t('privacyPolicy', lang)}
            </Small>
          </Pressy>
          <Pressy
            onPress={() =>
              Linking.openURL(`https://fooducia.health/terms?lang=${lang}`).catch(() => {})
            }
            haptics="select"
          >
            <Small style={{ color: colors.leafDeep, textDecorationLine: 'underline' }}>
              {t('termsAndConditions', lang)}
            </Small>
          </Pressy>
          <Pressy
            onPress={() =>
              Linking.openURL(`https://fooducia.health/refunds?lang=${lang}`).catch(() => {})
            }
            haptics="select"
          >
            <Small style={{ color: colors.leafDeep, textDecorationLine: 'underline' }}>
              {t('cancellationRefund', lang)}
            </Small>
          </Pressy>
          <Pressy
            onPress={() =>
              Linking.openURL(`https://fooducia.health/shipping?lang=${lang}`).catch(() => {})
            }
            haptics="select"
          >
            <Small style={{ color: colors.leafDeep, textDecorationLine: 'underline' }}>
              {t('shippingDelivery', lang)}
            </Small>
          </Pressy>
          <Pressy
            onPress={() =>
              Linking.openURL(`https://fooducia.health/contact?lang=${lang}`).catch(() => {})
            }
            haptics="select"
          >
            <Small style={{ color: colors.leafDeep, textDecorationLine: 'underline' }}>
              {t('contactGrievance', lang)}
            </Small>
          </Pressy>
        </Glass>

        <View style={{ marginTop: 26 }}>
          <Button
            title={t('signOut', lang)}
            variant="danger"
            onPress={signOut}
            icon={<LogOut size={18} color={colors.tomato} />}
          />
        </View>

        {/* Right-to-erasure: required by the app stores and the DPDP Act. */}
        <View style={{ marginTop: 14, alignItems: 'center' }}>
          <Pressy onPress={confirmDelete} haptics="select" disabled={deleting}>
            <Small style={{ color: colors.tomato, textDecorationLine: 'underline' }}>
              {t('deleteAccount', lang)}
            </Small>
          </Pressy>
        </View>
      </ScrollView>

      <EditFieldSheet ref={editSheet} field={field} onSave={save} saving={saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hero: { marginTop: 20 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.night,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  group: { paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 26,
    marginBottom: 8,
  },
  addr: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  addrIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addrActions: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  // 44 points tall each: these are the smallest things on the screen that have to be hit.
  addrAction: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
  },
  addrActionText: { fontFamily: fonts.bodyMedium },
  addrActionRule: { width: StyleSheet.hairlineWidth, height: 20, backgroundColor: colors.hairline },
  requestRemove: { minHeight: 44, justifyContent: 'center', paddingLeft: 12 },
});
