import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import * as Location from 'expo-location';
import { useDispatch } from 'react-redux';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Building2, ChevronDown, Home, LocateFixed, MapPin, User } from 'lucide-react-native';
import { Button, Glass, Input, Pressy, Sheet, Small, Text } from '../ui';
import { colors, radius } from '../theme';
import { useCreateAddressMutation, useGetCommunitiesQuery } from '../api/api';
import { customerUpdated } from '../features/auth/authSlice';
import { showToast } from '../features/ui/uiSlice';
import { haptic } from '../lib/haptics';
import {
  checkFlat,
  checkFloor,
  checkName,
  cleanFlat,
  cleanFloor,
  cleanName,
  cleanText,
} from '../lib/validators';

/** @param {any} props */
function Picker({ label, value, placeholder, icon, onPress, disabled = false }) {
  return (
    <View>
      <Small style={{ marginBottom: 6, marginLeft: 4 }} color={colors.ink2}>
        {label}
      </Small>
      <Pressy onPress={onPress} haptics="select" disabled={disabled} scale={0.99}>
        <Glass
          radius={radius.md}
          elevated={false}
          innerStyle={[styles.picker, disabled && { opacity: 0.5 }]}
        >
          {icon}
          <Text variant="body" color={value ? colors.ink : colors.ink3} style={{ flex: 1 }}>
            {value || placeholder}
          </Text>
          <ChevronDown size={18} color={colors.ink3} />
        </Glass>
      </Pressy>
    </View>
  );
}

/**
 * Structured address capture: community and block from admin masters (never free-typed),
 * flat number, optional floor/landmark, recipient. GPS is a one-time serviceability check.
 * @param {{ onSaved: (address: any) => void, defaultName?: string|null, mobile?: string }} props
 */
export function AddressForm({ onSaved, defaultName, mobile }) {
  const dispatch = useDispatch();
  const { data, isLoading } = useGetCommunitiesQuery();
  const [createAddress, { isLoading: saving }] = useCreateAddressMutation();
  const communities = useMemo(() => data?.communities || [], [data]);
  const [communityId, setCommunityId] = useState(null);
  const [block, setBlock] = useState(null);
  const [flat, setFlat] = useState('');
  const [floor, setFloor] = useState('');
  const [landmark, setLandmark] = useState('');
  const [name, setName] = useState(defaultName || '');
  const [locating, setLocating] = useState(false);
  const [gps, setGps] = useState(/** @type {any} */ (null)); // { state: 'ok'|'out'|'denied', communityName? }
  const [errors, setErrors] = useState(/** @type {any} */ ({}));
  const comSheet = useRef(null);
  const blockSheet = useRef(null);
  const community = useMemo(
    () => communities.find((c) => c.id === communityId),
    [communities, communityId],
  );

  const locate = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGps({ state: 'denied' });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      // Serviceability = within ~2 km of a configured community. The server repeats this check.
      const KNOWN = {
        com_cyberzon: [17.4645, 78.3062],
        com_avatar: [17.3982, 78.3634],
        com_highfields: [17.4286, 78.3496],
      };
      const hit = communities.find((c) => {
        const k = KNOWN[c.id];
        return k && Math.hypot(k[0] - latitude, k[1] - longitude) < 0.02;
      });
      if (hit) {
        setCommunityId(hit.id);
        setBlock(null);
        setGps({ state: 'ok', communityName: hit.name });
        haptic.success();
      } else {
        setGps({ state: 'out' });
        haptic.warning();
      }
    } catch {
      setGps({ state: 'denied' });
    } finally {
      setLocating(false);
    }
  };

  const submit = async () => {
    const e = {};
    if (!communityId) e.community = 'Choose your community';
    if (!block) e.block = 'Choose your block';
    const flatErr = checkFlat(flat);
    if (flatErr) e.flat = flatErr;
    const floorErr = checkFloor(floor);
    if (floorErr) e.floor = floorErr;
    const nameErr = checkName(name);
    if (nameErr) e.name = nameErr;
    setErrors(e);
    if (Object.keys(e).length) {
      haptic.warning();
      return;
    }
    try {
      const res = await createAddress({
        communityId,
        block,
        flat: flat.trim(),
        floor: floor.trim() || undefined,
        landmark: landmark.trim() || undefined,
        recipientName: name.trim(),
        contactNumber: mobile,
      }).unwrap();
      dispatch(customerUpdated({ hasAddress: true, name: name.trim() }));
      haptic.success();
      onSaved(res.address);
    } catch (err) {
      haptic.error();
      dispatch(showToast({ title: err?.message || 'Could not save address', tone: 'error' }));
    }
  };

  return (
    <>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <Animated.View entering={FadeInDown.duration(380).springify().damping(18)}>
          <Pressy onPress={locate} haptics="soft" disabled={locating} scale={0.985}>
            <Glass tone="dark" radius={radius.lg} innerStyle={styles.gps}>
              <View style={styles.gpsIcon}>
                <LocateFixed size={20} color={colors.ink} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium" color={colors.inkOnDark}>
                  {locating
                    ? 'Finding your community…'
                    : gps?.state === 'ok'
                      ? `You're in ${gps.communityName}`
                      : 'Use my location'}
                </Text>
                <Small color="rgba(243,245,239,0.7)">
                  {gps?.state === 'out'
                    ? "We don't deliver here yet. We've noted it for expansion. You can still pick a community."
                    : gps?.state === 'denied'
                      ? 'Location unavailable. Pick your community below.'
                      : 'One-time check that we deliver to your gate. Not tracking.'}
                </Small>
              </View>
            </Glass>
          </Pressy>
        </Animated.View>

        <Animated.View
          layout={LinearTransition.springify().damping(18)}
          style={{ gap: 16, marginTop: 20 }}
        >
          <Picker
            label="Community"
            value={community ? `${community.name}, ${community.area}` : null}
            placeholder={isLoading ? 'Loading…' : 'Choose your community'}
            icon={<Building2 size={18} color={colors.ink3} />}
            onPress={() => comSheet.current?.present()}
          />
          {errors.community ? (
            <Small color={colors.tomato} style={{ marginTop: -10, marginLeft: 4 }}>
              {errors.community}
            </Small>
          ) : null}
          <Picker
            label="Block / Tower"
            value={block}
            placeholder={community ? 'Choose your block' : 'Pick a community first'}
            icon={<Home size={18} color={colors.ink3} />}
            onPress={() => blockSheet.current?.present()}
            disabled={!community}
          />
          {errors.block ? (
            <Small color={colors.tomato} style={{ marginTop: -10, marginLeft: 4 }}>
              {errors.block}
            </Small>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Input
              label="Flat number"
              value={flat}
              onChangeText={(t) => setFlat(cleanFlat(t))}
              placeholder="1204"
              autoCapitalize="characters"
              maxLength={12}
              error={errors.flat}
              style={{ flex: 1.2 }}
              leading={<MapPin size={18} color={colors.ink3} />}
            />
            <Input
              label="Floor"
              value={floor}
              onChangeText={(t) => setFloor(cleanFloor(t))}
              placeholder="12"
              keyboardType="number-pad"
              maxLength={3}
              error={errors.floor}
              style={{ flex: 0.8 }}
            />
          </View>
          <Input
            label="Landmark (optional)"
            value={landmark}
            onChangeText={(t) => setLandmark(cleanText(t, 80))}
            placeholder="Near the clubhouse lift"
            maxLength={80}
          />
          <Input
            label="Recipient name"
            value={name}
            onChangeText={(t) => setName(cleanName(t))}
            placeholder="Who should we hand it to?"
            autoCapitalize="words"
            textContentType="name"
            maxLength={40}
            error={errors.name}
            leading={<User size={18} color={colors.ink3} />}
          />
        </Animated.View>

        <Animated.View entering={FadeIn.delay(200)} style={{ marginTop: 28 }}>
          <Button title="Save address" onPress={submit} loading={saving} />
          <Small muted center style={{ marginTop: 12 }}>
            Community and block come from our list so the delivery team never guesses.
          </Small>
        </Animated.View>
      </ScrollView>

      <Sheet
        ref={comSheet}
        title="Your community"
        subtitle="Currently serving three communities in West Hyderabad"
      >
        <View style={{ gap: 10 }}>
          {communities.map((c) => (
            <Pressy
              key={c.id}
              onPress={() => {
                setCommunityId(c.id);
                setBlock(null);
                setErrors((e) => ({ ...e, community: undefined }));
                comSheet.current?.dismiss();
              }}
              haptics="select"
            >
              <Glass
                radius={radius.md}
                elevated={false}
                innerStyle={[styles.option, communityId === c.id && styles.optionActive]}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium">{c.name}</Text>
                  <Small muted>
                    {c.area} · {c.blocks.length} blocks
                  </Small>
                </View>
                {communityId === c.id ? <View style={styles.dot} /> : null}
              </Glass>
            </Pressy>
          ))}
        </View>
      </Sheet>

      <Sheet
        ref={blockSheet}
        title="Block or tower"
        subtitle={community?.name}
        scroll
        snapPoints={['60%']}
      >
        <View style={styles.blocks}>
          {(community?.blocks || []).map((b) => (
            <Pressy
              key={b}
              onPress={() => {
                setBlock(b);
                setErrors((e) => ({ ...e, block: undefined }));
                blockSheet.current?.dismiss();
              }}
              haptics="select"
            >
              <View style={[styles.blockChip, block === b && styles.blockChipActive]}>
                <Text variant="smallMedium" color={block === b ? colors.inkOnDark : colors.ink}>
                  {b}
                </Text>
              </View>
            </Pressy>
          ))}
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  gps: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  gpsIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.sprout,
    alignItems: 'center',
    justifyContent: 'center',
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    minHeight: 54,
  },
  option: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  optionActive: { borderWidth: 1.5, borderColor: colors.leaf },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.leaf },
  blocks: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  blockChip: {
    paddingHorizontal: 16,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  blockChipActive: { backgroundColor: colors.night, borderColor: colors.night },
});
