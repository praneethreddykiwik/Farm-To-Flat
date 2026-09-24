import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { kv } from '../src/lib/kv';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  Leaf,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  UserRound,
} from 'lucide-react-native';
import { Ambient, Button, Display, Glass, Label, Pressy, Small, Text } from '../src/ui';
import { EditFieldSheet } from '../src/components/EditFieldSheet';
import { checkEmail, checkName } from '../src/lib/validators';
import {
  useGetAddressesQuery,
  useGetSupportQuery,
  useRegisterDeviceMutation,
  useSetDefaultAddressMutation,
  useUpdateMeMutation,
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
 * @param {{ icon: any, label: string, value?: any, hint?: string, onPress?: () => void, right?: any, last?: boolean }} props
 */
function Row({
  icon,
  label,
  value,
  hint = undefined,
  onPress = undefined,
  right = undefined,
  last = false,
}) {
  return (
    <Pressy onPress={onPress} haptics="select" scale={0.995} disabled={!onPress}>
      <View style={[styles.row, !last && styles.rowDivider]}>
        <View style={styles.rowIcon}>{icon}</View>
        <View style={{ flex: 1 }}>
          <Small muted>{label}</Small>
          <Text variant="bodyMedium" numberOfLines={1} color={value ? colors.ink : colors.ink3}>
            {value || hint || 'Not set'}
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
  const [registerDevice] = useRegisterDeviceMutation();
  const [updateMe, { isLoading: saving }] = useUpdateMeMutation();
  const signOut = useSignOut();
  const lang = useSelector(selectLanguage);
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
      dispatch(showToast({ title: 'Saved', tone: 'success' }));
      editSheet.current?.dismiss();
    } catch (e) {
      dispatch(showToast({ title: e?.message || 'Could not save', tone: 'error' }));
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
          <Display>{customer?.name || 'Your account'}</Display>
          <Small muted style={{ marginTop: 4 }}>
            Personal details, addresses and preferences
          </Small>
        </Animated.View>

        <Label style={{ marginTop: 26, marginBottom: 8 }}>Personal details</Label>
        <Glass radius={radius.lg} blur={false} innerStyle={styles.group}>
          <Row
            icon={<UserRound size={18} color={colors.ink} />}
            label="Full name"
            value={customer?.name}
            hint="Add your name"
            onPress={() =>
              edit({
                key: 'name',
                label: 'Full name',
                value: customer?.name || '',
                placeholder: 'Vivek Goud',
                autoCapitalize: 'words',
                maxLength: 40,
                hint: 'The delivery team asks for this at your door.',
                validate: checkName,
              })
            }
          />
          <Row
            icon={<Phone size={18} color={colors.ink} />}
            label="Mobile number"
            value={customer?.mobile ? `+91 ${customer.mobile}` : null}
            onPress={changeMobile}
            right={
              <View style={styles.verified}>
                <ShieldCheck size={14} color={colors.leafDeep} />
                <Small color={colors.leafDeep} style={{ fontSize: 11 }}>
                  Verified
                </Small>
              </View>
            }
          />
          <Row
            icon={<Mail size={18} color={colors.ink} />}
            label="Email (optional)"
            value={customer?.email}
            hint="For invoices and receipts"
            onPress={() =>
              edit({
                key: 'email',
                label: 'Email',
                value: customer?.email || '',
                placeholder: 'you@example.com',
                keyboardType: 'email-address',
                autoCapitalize: 'none',
                maxLength: 120,
                hint: 'We send invoices here. Optional.',
                validate: checkEmail,
              })
            }
          />
          <Row
            icon={<Leaf size={18} color={colors.ink} />}
            label="Food preference"
            value={dietProfile.diet}
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
          <Label>Delivery addresses</Label>
          <Small muted>{addresses.length} saved</Small>
        </View>
        <View style={{ gap: 10 }}>
          {addresses.map((a, i) => (
            <Animated.View key={a.id} entering={FadeInDown.delay(60 + i * 50).duration(320)}>
              <Pressy
                onPress={() => !a.isDefault && setDefault(a.id)}
                haptics="select"
                scale={0.99}
              >
                <Glass radius={radius.lg} blur={false} innerStyle={styles.addr}>
                  <View
                    style={[styles.addrIcon, a.isDefault && { backgroundColor: colors.sprout }]}
                  >
                    <MapPin size={18} color={colors.ink} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium">
                      {a.block} · {a.flat}
                    </Text>
                    <Small muted>
                      {a.communityName}, {a.area}
                    </Small>
                    {a.recipientName || a.contactNumber ? (
                      <Small muted style={{ fontSize: 11, marginTop: 2 }}>
                        {[a.recipientName, a.contactNumber && `+91 ${a.contactNumber}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </Small>
                    ) : null}
                  </View>
                  {a.isDefault ? (
                    <View style={styles.defaultTag}>
                      <Star size={12} color={colors.leafDeep} fill={colors.leafDeep} />
                      <Small color={colors.leafDeep} style={{ fontSize: 11 }}>
                        Default
                      </Small>
                    </View>
                  ) : (
                    <Small color={colors.ink3}>Set default</Small>
                  )}
                </Glass>
              </Pressy>
            </Animated.View>
          ))}
          <Button
            title="Add another address"
            variant="glass"
            size="md"
            onPress={() => router.push('/address/new')}
            icon={<Plus size={18} color={colors.ink} />}
          />
        </View>

        <Label style={{ marginTop: 26, marginBottom: 8 }}>Preferences</Label>
        <Glass radius={radius.lg} blur={false} innerStyle={styles.group}>
          <Row
            icon={<Bell size={18} color={colors.ink} />}
            label="Order and wallet updates"
            value="Packed, out for delivery, wallet credited"
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
              label="Dietitian profile"
              value={
                dietProfile.age
                  ? `${dietProfile.age} y · ${dietProfile.goal} · ${dietProfile.mealsPerDay} meals a day`
                  : null
              }
              hint="Age, goal, standing instructions"
              onPress={() => router.push('/(tabs)/plan')}
              last
            />
          ) : null}
        </Glass>

        {aiVisible ? (
          <>
            <Label style={{ marginTop: 26, marginBottom: 8 }}>Super admin</Label>
            <Glass radius={radius.lg} blur={false} innerStyle={styles.group}>
              <Row
                icon={<ShieldCheck size={18} color={colors.ink} />}
                label="Operations console"
                hint="Procurement, fulfilment, dashboard"
                onPress={() => router.push('/staff/console')}
                last
              />
            </Glass>
          </>
        ) : null}

        {support && (support.email || support.phone) ? (
          <>
            <Label style={{ marginTop: 26, marginBottom: 8 }}>Help &amp; support</Label>
            <Glass radius={radius.lg} blur={false} innerStyle={styles.group}>
              {support.email ? (
                <Row
                  icon={<Mail size={18} color={colors.ink} />}
                  label="Email us"
                  value={support.email}
                  onPress={() => Linking.openURL(`mailto:${support.email}`).catch(() => {})}
                  last={!support.phone}
                />
              ) : null}
              {support.phone ? (
                <Row
                  icon={<Phone size={18} color={colors.ink} />}
                  label="Call us"
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
            Product names appear in the language you choose. Prices and your order history stay the
            same.
          </Small>
        </Glass>

        <Label style={{ marginTop: 26, marginBottom: 8 }}>About</Label>
        <Glass radius={radius.lg} blur={false} innerStyle={{ padding: 16, gap: 6 }}>
          <Small muted>Farm to Flat · v{env.appVersion}</Small>
          <Pressy
            onPress={() =>
              Linking.openURL('https://farm-to-flat.vercel.app/privacy').catch(() => {})
            }
            haptics="select"
          >
            <Small style={{ color: colors.leafDeep, textDecorationLine: 'underline' }}>
              Privacy policy
            </Small>
          </Pressy>
          <Pressy
            onPress={() => Linking.openURL('https://farm-to-flat.vercel.app/terms').catch(() => {})}
            haptics="select"
          >
            <Small style={{ color: colors.leafDeep, textDecorationLine: 'underline' }}>
              Terms & conditions
            </Small>
          </Pressy>
        </Glass>

        <View style={{ marginTop: 26 }}>
          <Button
            title="Sign out"
            variant="danger"
            onPress={signOut}
            icon={<LogOut size={18} color={colors.tomato} />}
          />
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
});
