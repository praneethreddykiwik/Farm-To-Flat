import React, { useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
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
import {
  useGetAddressesQuery,
  useRegisterDeviceMutation,
  useSetDefaultAddressMutation,
  useUpdateMeMutation,
} from '../src/api/api';
import { customerUpdated, selectCustomer } from '../src/features/auth/authSlice';
import { profileUpdated, selectProfile } from '../src/features/plan/planSlice';
import { showToast } from '../src/features/ui/uiSlice';
import { useSignOut } from '../src/hooks/useSession';
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

export default function Profile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const customer = useSelector(selectCustomer);
  const dietProfile = useSelector(selectProfile);
  const { data } = useGetAddressesQuery();
  const [setDefault] = useSetDefaultAddressMutation();
  const [registerDevice] = useRegisterDeviceMutation();
  const [updateMe, { isLoading: saving }] = useUpdateMeMutation();
  const signOut = useSignOut();
  const [push, setPush] = useState(false);
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

  const changeMobile = () => {
    Alert.alert(
      'Change mobile number',
      'Your number is how you sign in, so a new one has to be verified by OTP. We’ll sign you out and send a code to the new number.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: signOut },
      ],
    );
  };

  const togglePush = async (v) => {
    setPush(v);
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
            <Text style={{ fontFamily: fonts.displayItalic, fontSize: 30, color: colors.sprout }}>
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
                hint: 'The delivery team asks for this at your door.',
                validate: (v) => (v.length < 2 ? 'Enter your name' : null),
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
                hint: 'We send invoices here. Optional.',
                validate: (v) => (v && !/^\S+@\S+\.\S+$/.test(v) ? 'Check that address' : null),
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
          />
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
        </Glass>

        <Label style={{ marginTop: 26, marginBottom: 8 }}>About</Label>
        <Glass radius={radius.lg} blur={false} innerStyle={{ padding: 16, gap: 6 }}>
          <Small muted>Farm to Flat · v{env.appVersion}</Small>
          <Small muted>
            {env.useMocks ? 'Running against the in-app mock server' : `API: ${env.apiUrl}`}
          </Small>
          <Small muted>{env.isExpoGo ? 'Expo Go' : 'Development build'}</Small>
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
