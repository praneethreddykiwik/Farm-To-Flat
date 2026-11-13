import React, { useMemo, useRef, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, View } from 'react-native';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import * as Location from 'expo-location';
import { useDispatch } from 'react-redux';
import Animated, { FadeIn, FadeInDown, LinearTransition, ZoomIn } from 'react-native-reanimated';
import {
  ArrowRight,
  BellRing,
  Building2,
  Check,
  ChevronDown,
  Home,
  LocateFixed,
  MapPin,
  MapPinOff,
  User,
} from 'lucide-react-native';
import { Button, Glass, Input, Pressy, Sheet, Small, Text } from '../ui';
import { colors, radius } from '../theme';
import {
  useCheckDemandMutation,
  useCreateAddressMutation,
  useGetCommunitiesQuery,
  useSubscribeDemandMutation,
  useUpdateAddressMutation,
} from '../api/api';
import { customerUpdated } from '../features/auth/authSlice';
import { showToast } from '../features/ui/uiSlice';
import { haptic } from '../lib/haptics';
import { distanceLabel, matchCommunity, placeFromGeocode, placeLabel } from '../lib/geo';
import { prettyNumber } from '../lib/phone';
import {
  checkFlat,
  checkFloor,
  checkName,
  cleanFlat,
  cleanFloor,
  cleanName,
  cleanText,
} from '../lib/validators';

/** The page gutter `Screen` puts around this form. See the note on the ScrollView. */
const GUTTER = 20;

/** A fix less certain than this cannot say whether someone is inside a community's radius. */
const VAGUE_FIX_M = 400;

/**
 * A field that opens a list instead of a keyboard. It carries its own error — the red outline, the
 * red label and the message — exactly as `Input` does, so a form that is missing three things shows
 * three fields in red rather than one red box and two lines of loose red text.
 * @param {any} props
 */
function Picker({ label, value, placeholder, icon, onPress, disabled = false, error = null }) {
  return (
    <View>
      <Small style={styles.label} color={error ? colors.tomato : colors.ink2}>
        {label}
      </Small>
      <Pressy
        onPress={onPress}
        haptics="select"
        disabled={disabled}
        scale={0.99}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${value || placeholder}`}
      >
        <View style={[styles.ring, error && styles.ringError]}>
          <Glass
            radius={radius.md}
            elevated={false}
            innerStyle={[styles.picker, disabled && { opacity: 0.5 }]}
          >
            {icon}
            <Text
              variant="body"
              color={value ? colors.ink : colors.ink3}
              style={{ flex: 1 }}
              numberOfLines={1}
            >
              {value || placeholder}
            </Text>
            <ChevronDown size={18} color={colors.ink3} />
          </Glass>
        </View>
      </Pressy>
      {error ? (
        <Text variant="small" color={colors.tomato} style={styles.help}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Structured address capture: community and block from admin masters (never free-typed), flat
 * number, floor, optional landmark, recipient. Given an `address` it edits that one instead.
 *
 * "Use my location" is a one-time check, and it is answered ON THE PHONE: the app already holds
 * each community's gate and radius, so where the shopper is standing is compared here and goes
 * nowhere. Only when they turn out to be outside every community is anything sent — a rounded area
 * with no name or number, counted as one more request for that neighbourhood. Asking to be told when
 * delivery starts there is a separate, deliberate tap, and that is the only thing that attaches
 * their account to a place.
 *
 * @param {{ onSaved: (address: any) => void, defaultName?: string|null, mobile?: string, address?: any }} props
 */
export function AddressForm({ onSaved, defaultName, mobile, address = null }) {
  const editing = !!address;
  const kb = useKeyboardHeight();
  const dispatch = useDispatch();
  const { data, isLoading } = useGetCommunitiesQuery();
  const [createAddress, { isLoading: creating }] = useCreateAddressMutation();
  const [updateAddress, { isLoading: updating }] = useUpdateAddressMutation();
  const [checkDemand] = useCheckDemandMutation();
  const [subscribeDemand, { isLoading: subscribing }] = useSubscribeDemandMutation();
  const saving = creating || updating;
  const communities = useMemo(() => data?.communities || [], [data]);
  const [communityId, setCommunityId] = useState(address?.communityId || null);
  const [block, setBlock] = useState(address?.block || null);
  const [flat, setFlat] = useState(address?.flat || '');
  const [floor, setFloor] = useState(address?.floor ? String(address.floor) : '');
  const [landmark, setLandmark] = useState(address?.landmark || '');
  const [name, setName] = useState(address?.recipientName || defaultName || '');
  const [locating, setLocating] = useState(false);
  /**
   * What the location check found.
   *   ok      inside a community (already selected in the picker)
   *   out     outside every community — `here`, `place`, `areaLabel`, `nearest` say where
   *   unsure  could not tell: not every community has coordinates on record yet, so a miss proves
   *           nothing. Nothing is counted in this state.
   *   denied  no permission, or no fix
   * @type {[any, Function]}
   */
  const [gps, setGps] = useState(null);
  /** Set once they have asked to be told: `{ areaLabel }`. */
  const [asked, setAsked] = useState(/** @type {any} */ (null));
  const [errors, setErrors] = useState(/** @type {any} */ ({}));
  // Drop a field's error the moment the shopper starts fixing it. Without this the red message and
  // red border stayed under a field they had already corrected — the form looked broken while it was
  // actually valid.
  const clearError = (key) =>
    setErrors((e) => (e[key] === undefined ? e : { ...e, [key]: undefined }));
  const comSheet = useRef(null);
  const blockSheet = useRef(null);
  const askSheet = useRef(null);
  const scroll = useRef(null);
  // Where each typed field sits, so focusing one can bring it clear of the keyboard. A ScrollView
  // does not do this by itself: the keyboard rose over "Recipient name" and the shopper typed blind.
  const fieldsY = useRef(0);
  const fieldY = useRef(/** @type {Record<string, number>} */ ({}));
  const reveal = (key) =>
    setTimeout(
      () =>
        scroll.current?.scrollTo({
          y: Math.max(0, fieldsY.current + (fieldY.current[key] || 0) - 24),
          animated: true,
        }),
      260,
    );
  const community = useMemo(
    () => communities.find((c) => c.id === communityId),
    [communities, communityId],
  );

  const choose = (c) => {
    setCommunityId(c.id);
    // A block only means something inside its community: keep it if the new one has it too.
    setBlock((b) => (b && c.blocks.includes(b) ? b : null));
    clearError('community');
  };

  const locate = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGps({ state: 'denied' });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const { hit, nearest, located } = matchCommunity(communities, here, {
        accuracyM: pos.coords.accuracy ?? 0,
      });
      if (hit) {
        choose(hit);
        setGps({ state: 'ok', communityName: hit.name });
        haptic.success();
        return;
      }

      // Outside — or we cannot tell. Put a name to the place using the phone's own geocoder; if
      // that is unavailable the request still works, it is just labelled by its coordinates.
      let place = {};
      try {
        const [g] = await Location.reverseGeocodeAsync({
          latitude: here.lat,
          longitude: here.lng,
        });
        place = placeFromGeocode(g);
      } catch {
        // No geocoder on this phone, or no network for it.
      }

      // A miss only means "not served" when EVERY community has coordinates to miss. Until then a
      // shopper standing inside a community we do serve would be counted as demand for a new area.
      // The same goes for a vague fix: Android lets a customer share an "approximate" location,
      // good to a couple of kilometres, which cannot tell one side of a gate from the other.
      const vague = (pos.coords.accuracy ?? 0) > VAGUE_FIX_M;
      if (!communities.length || located < communities.length || vague) {
        setGps({ state: 'unsure', here, place, areaLabel: placeLabel(place) });
        haptic.warning();
        return;
      }

      let areaLabel = placeLabel(place);
      try {
        const res = await checkDemand({ ...here, ...place }).unwrap();
        // The server holds the same list, possibly fresher than this phone's copy.
        const served = res?.served && communities.find((c) => c.id === res.communityId);
        if (served) {
          choose(served);
          setGps({ state: 'ok', communityName: served.name });
          haptic.success();
          return;
        }
        if (res?.area?.label) areaLabel = areaLabel || res.area.label;
      } catch {
        // Counting the request failed. They can still ask to be told, which is what matters.
      }
      setGps({ state: 'out', here, place, areaLabel, nearest });
      haptic.warning();
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
      // Bring the first thing that needs fixing into view; on a small phone the top of the form has
      // scrolled away by the time Save is pressed.
      const first = ['community', 'block', 'flat', 'floor', 'name'].find((k) => e[k]);
      scroll.current?.scrollTo({
        y:
          first === 'community' || first === 'block'
            ? Math.max(0, fieldsY.current - 12)
            : Math.max(0, fieldsY.current + (fieldY.current[first] || 0) - 24),
        animated: true,
      });
      return;
    }
    const body = {
      communityId,
      block,
      flat: flat.trim(),
      floor: floor.trim(),
      recipientName: name.trim(),
    };
    try {
      if (editing) {
        const res = await updateAddress({
          id: address.id,
          ...body,
          landmark: landmark.trim() || null,
        }).unwrap();
        haptic.success();
        onSaved(res.address);
      } else {
        const res = await createAddress({
          ...body,
          landmark: landmark.trim() || undefined,
          contactNumber: mobile,
        }).unwrap();
        dispatch(customerUpdated({ hasAddress: true, name: name.trim() }));
        haptic.success();
        onSaved(res.address);
      }
    } catch (err) {
      haptic.error();
      dispatch(showToast({ title: err?.message || 'Could not save address', tone: 'error' }));
    }
  };

  const out = gps?.state === 'out' || gps?.state === 'unsure';
  const gpsTitle = locating
    ? 'Finding your community…'
    : gps?.state === 'ok'
      ? `You're in ${gps.communityName}`
      : gps?.state === 'out'
        ? `We don't deliver to ${gps.areaLabel || 'your location'} yet`
        : gps?.state === 'unsure'
          ? "We couldn't place you in one of our communities"
          : 'Use my location';
  const gpsLine =
    gps?.state === 'ok'
      ? 'Picked for you below. Change it if we got it wrong.'
      : gps?.state === 'out'
        ? gps.nearest
          ? `The nearest we serve is ${gps.nearest.community.name}, ${distanceLabel(gps.nearest.distanceM)} away. If you live in one of ours, pick it below.`
          : 'If you live in one of our communities, pick it below.'
        : gps?.state === 'unsure'
          ? 'Pick yours from the list below — or tell us where you are.'
          : gps?.state === 'denied'
            ? 'Location unavailable. Pick your community below.'
            : 'One-time check that we deliver to your gate. Not tracking.';

  return (
    <>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        // The scroll area runs to the screen's edges and pads its content back in. A ScrollView
        // clips what it draws, and when it stopped at the page gutter it cut every shadow that
        // reached that line — most visibly the Save button's, which showed as a hard-edged box
        // around the pill instead of a soft glow.
        style={styles.bleed}
        // Room for the keyboard. Without it the fields below the focused one — including the
        // button that saves the address — sit under the keyboard with nowhere left to scroll.
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 40 + kb }}
      >
        {editing ? null : (
          <Animated.View entering={FadeInDown.duration(380).springify().damping(18)}>
            <Glass tone="dark" radius={radius.lg}>
              <Pressy
                onPress={locate}
                haptics="soft"
                disabled={locating}
                scale={0.985}
                accessibilityRole="button"
                accessibilityLabel={`${gpsTitle}. ${gpsLine}`}
              >
                <View style={styles.gps}>
                  <View style={[styles.gpsIcon, out && { backgroundColor: colors.butter }]}>
                    {out ? (
                      <MapPinOff size={20} color={colors.ink} />
                    ) : (
                      <LocateFixed size={20} color={colors.ink} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium" color={colors.inkOnDark}>
                      {gpsTitle}
                    </Text>
                    <Small color="rgba(243,245,239,0.7)">{gpsLine}</Small>
                  </View>
                </View>
              </Pressy>
              {out ? (
                <Animated.View entering={FadeIn.duration(260)} style={styles.askRow}>
                  {asked ? (
                    <View style={styles.askedLine}>
                      <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.tick}>
                        <Check size={14} color={colors.ink} strokeWidth={3} />
                      </Animated.View>
                      <Small color={colors.inkOnDark} style={{ flex: 1 }}>
                        You&rsquo;re on the list. We&rsquo;ll message you when we reach{' '}
                        {asked.areaLabel}.
                      </Small>
                    </View>
                  ) : (
                    <Pressy
                      onPress={() => askSheet.current?.present()}
                      haptics="soft"
                      style={styles.askBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Tell me when you deliver here"
                    >
                      <BellRing size={16} color={colors.ink} />
                      <Text variant="smallMedium" color={colors.ink} style={{ flex: 1 }}>
                        Tell me when you deliver here
                      </Text>
                      <ArrowRight size={16} color={colors.ink} />
                    </Pressy>
                  )}
                </Animated.View>
              ) : null}
            </Glass>
          </Animated.View>
        )}

        <Animated.View
          layout={LinearTransition.springify().damping(18)}
          onLayout={(ev) => (fieldsY.current = ev.nativeEvent.layout.y)}
          style={{ gap: 16, marginTop: editing ? 0 : 20 }}
        >
          <Picker
            label="Community"
            value={community ? `${community.name}, ${community.area}` : null}
            placeholder={isLoading ? 'Loading…' : 'Choose your community'}
            icon={<Building2 size={18} color={colors.ink3} />}
            onPress={() => comSheet.current?.present()}
            error={errors.community}
          />
          <Picker
            label="Block / Tower"
            value={block}
            placeholder={community ? 'Choose your block' : 'Pick a community first'}
            icon={<Home size={18} color={colors.ink3} />}
            onPress={() => blockSheet.current?.present()}
            disabled={!community}
            error={errors.block}
          />
          <View
            style={{ flexDirection: 'row', gap: 12 }}
            onLayout={(ev) => {
              fieldY.current.flat = ev.nativeEvent.layout.y;
              fieldY.current.floor = ev.nativeEvent.layout.y;
            }}
          >
            <Input
              label="Flat number"
              value={flat}
              onChangeText={(t) => {
                setFlat(cleanFlat(t));
                clearError('flat');
              }}
              onFocus={() => reveal('flat')}
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
              onChangeText={(t) => {
                setFloor(cleanFloor(t));
                clearError('floor');
              }}
              onFocus={() => reveal('floor')}
              placeholder="12"
              keyboardType="number-pad"
              maxLength={3}
              error={errors.floor}
              // The one thing a ground-floor resident needs to be told. It gives way to the error.
              hint="0 = ground"
              style={{ flex: 0.8 }}
            />
          </View>
          <View onLayout={(ev) => (fieldY.current.landmark = ev.nativeEvent.layout.y)}>
            <Input
              label="Landmark (optional)"
              value={landmark}
              onChangeText={(t) => setLandmark(cleanText(t, 80))}
              onFocus={() => reveal('landmark')}
              placeholder="Near the clubhouse lift"
              maxLength={80}
            />
          </View>
          <View onLayout={(ev) => (fieldY.current.name = ev.nativeEvent.layout.y)}>
            <Input
              label="Recipient name"
              value={name}
              onChangeText={(t) => {
                setName(cleanName(t));
                clearError('name');
              }}
              onFocus={() => reveal('name')}
              placeholder="Who should we hand it to?"
              autoCapitalize="words"
              textContentType="name"
              maxLength={40}
              error={errors.name}
              leading={<User size={18} color={colors.ink3} />}
            />
          </View>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(200)} style={{ marginTop: 28 }}>
          <Button
            title={editing ? 'Save changes' : 'Save address'}
            onPress={submit}
            loading={saving}
          />
          <Small muted center style={{ marginTop: 12 }}>
            {editing
              ? 'Orders you have already placed keep the address they were placed with.'
              : 'Community and block come from our list so the delivery team never guesses.'}
          </Small>
        </Animated.View>
      </ScrollView>

      <Sheet
        ref={comSheet}
        title="Your community"
        // Counted from the list actually loaded. It used to read "three communities" while the
        // sheet below listed seven, which is the first thing a new customer sees us get wrong.
        subtitle={
          communities.length
            ? `Currently serving ${communities.length} ${
                communities.length === 1 ? 'community' : 'communities'
              } in West Hyderabad`
            : 'Loading communities…'
        }
        scroll
      >
        <View style={{ gap: 10 }}>
          {communities.map((c) => (
            <Pressy
              key={c.id}
              onPress={() => {
                choose(c);
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
                    {c.area} · {c.blocks.length} {c.blocks.length === 1 ? 'block' : 'blocks'}
                  </Small>
                </View>
                {communityId === c.id ? <View style={styles.dot} /> : null}
              </Glass>
            </Pressy>
          ))}
          {/* The way out for someone who is not on the list at all. Without it the only choices
              were to pick a community they do not live in, or to leave. */}
          {editing ? null : (
            <Pressy
              onPress={() => {
                comSheet.current?.dismiss();
                setTimeout(() => askSheet.current?.present(), 260);
              }}
              haptics="select"
              style={styles.notListed}
              accessibilityRole="button"
            >
              <BellRing size={16} color={colors.leafDeep} />
              <Text variant="smallMedium" color={colors.leafDeep} style={{ flex: 1 }}>
                My community isn&rsquo;t listed
              </Text>
              <ArrowRight size={16} color={colors.leafDeep} />
            </Pressy>
          )}
        </View>
      </Sheet>

      <Sheet
        ref={blockSheet}
        title="Block or tower"
        subtitle={community?.name}
        // Sized to its contents: eight chips do not need two thirds of the screen. A community with
        // forty towers still scrolls.
        scroll={(community?.blocks?.length || 0) > 24}
        snapPoints={(community?.blocks?.length || 0) > 24 ? ['70%'] : undefined}
      >
        <View style={styles.blocks}>
          {(community?.blocks || []).map((b) => (
            <Pressy
              key={b}
              onPress={() => {
                setBlock(b);
                clearError('block');
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

      {editing ? null : (
        <AskSheet
          ref={askSheet}
          gps={gps}
          mobile={mobile}
          busy={subscribing}
          onAsk={async (request) => {
            try {
              const res = await subscribeDemand(request).unwrap();
              haptic.success();
              setAsked({ areaLabel: res?.subscription?.areaLabel || 'your area' });
              return res?.subscription || {};
            } catch (err) {
              haptic.error();
              dispatch(
                showToast({ title: err?.message || 'Could not save your request', tone: 'error' }),
              );
              return null;
            }
          }}
        />
      )}
    </>
  );
}

/**
 * "Tell me when you deliver here." Reached two ways: from a location check that came back outside
 * our communities (then we already know roughly where), or from "My community isn't listed" (then
 * they tell us). Either way this is the only step that ties an account to a place, so it says so in
 * plain words before the button, and how to undo it.
 */
const AskSheet = /** @type {any} */ (
  React.forwardRef(function AskSheet(/** @type {any} */ { gps, mobile, busy, onAsk }, ref) {
    const located = !!gps?.here;
    const [communityName, setCommunityName] = useState('');
    const [locality, setLocality] = useState('');
    const [pincode, setPincode] = useState('');
    const [errors, setErrors] = useState(/** @type {any} */ ({}));
    const [done, setDone] = useState(/** @type {any} */ (null));

    const send = async () => {
      const e = {};
      const cn = communityName.trim();
      const loc = locality.trim();
      if (!located) {
        if (cn.length < 2) e.communityName = 'Enter your community or apartment name';
        if (loc.length < 2) e.locality = 'Enter your area';
        if (pincode && !/^\d{6}$/.test(pincode)) e.pincode = 'A PIN code has six digits';
      }
      setErrors(e);
      if (Object.keys(e).length) {
        haptic.warning();
        return;
      }
      const request = located
        ? {
            ...gps.here,
            ...gps.place,
            ...(cn ? { communityName: cn } : {}),
            source: 'location',
          }
        : {
            communityName: cn,
            locality: loc,
            ...(pincode ? { pincode } : {}),
            source: 'not_listed',
          };
      // Let go of the field first. When the form is swapped for the confirmation its focused input
      // unmounts, and Android hands focus to the next field it can find — the flat number in the
      // form UNDER the sheet, with the keyboard still up for it.
      Keyboard.dismiss();
      const saved = await onAsk(request);
      if (saved) setDone({ areaLabel: saved.areaLabel || gps?.areaLabel || loc || 'your area' });
    };

    if (done) {
      return (
        <Sheet ref={ref} onDismiss={() => setDone(null)}>
          <View style={styles.doneBox}>
            <Animated.View entering={ZoomIn.springify().damping(11)} style={styles.doneTick}>
              <Check size={30} color={colors.ink} strokeWidth={3} />
            </Animated.View>
            <Text variant="h2" center style={{ marginTop: 16 }}>
              You&rsquo;re on the list
            </Text>
            <Small muted center style={{ marginTop: 6, marginHorizontal: 12 }}>
              We&rsquo;ll message you the day we start delivering in {done.areaLabel}. You can
              remove this request in Profile at any time.
            </Small>
            <Button
              title="Done"
              onPress={() => /** @type {any} */ (ref)?.current?.dismiss()}
              style={{ marginTop: 22 }}
            />
          </View>
        </Sheet>
      );
    }

    return (
      <Sheet
        ref={ref}
        title="Bring Fooducia to your gate"
        subtitle={
          located
            ? `We count every request from ${gps.areaLabel || 'your area'} when we choose where to go next.`
            : 'Tell us where you live. We count every request when we choose where to go next.'
        }
        keyboard
      >
        <View style={{ gap: 14 }}>
          <Input
            label={
              located ? 'Your community or apartment (optional)' : 'Your community or apartment'
            }
            value={communityName}
            onChangeText={(t) => {
              setCommunityName(cleanText(t, 80));
              setErrors((x) => ({ ...x, communityName: undefined }));
            }}
            placeholder="e.g. Lakeview Residency"
            autoCapitalize="words"
            maxLength={80}
            error={errors.communityName}
            leading={<Building2 size={18} color={colors.ink3} />}
          />
          {located ? null : (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Input
                label="Area"
                value={locality}
                onChangeText={(t) => {
                  setLocality(cleanText(t, 80));
                  setErrors((x) => ({ ...x, locality: undefined }));
                }}
                placeholder="e.g. Kondapur"
                autoCapitalize="words"
                maxLength={80}
                error={errors.locality}
                style={{ flex: 1.3 }}
              />
              <Input
                label="PIN (optional)"
                value={pincode}
                onChangeText={(t) => {
                  setPincode(t.replace(/\D/g, '').slice(0, 6));
                  setErrors((x) => ({ ...x, pincode: undefined }));
                }}
                placeholder="500084"
                keyboardType="number-pad"
                maxLength={6}
                error={errors.pincode}
                style={{ flex: 1 }}
              />
            </View>
          )}
          <Button
            title="Tell me when you deliver here"
            onPress={send}
            loading={busy}
            icon={<BellRing size={18} color={colors.inkOnDark} />}
          />
          {/* Said before the button is pressed, not after: what is kept, why, and how to undo it. */}
          <Small muted center>
            We&rsquo;ll keep your name,{' '}
            {mobile ? `+91 ${prettyNumber(mobile)}` : 'your mobile number'}
            {located ? ', this approximate area' : ', this area'} and the community name you give —
            only to message you when delivery starts there. Remove it in Profile whenever you like.
          </Small>
        </View>
      </Sheet>
    );
  })
);

const styles = StyleSheet.create({
  bleed: { marginHorizontal: -GUTTER },
  label: { marginBottom: 6, marginLeft: 4 },
  help: { marginTop: 6, marginLeft: 4 },
  // The same outline `Input` draws, so a picker and a text field in error look like one family.
  ring: { borderRadius: radius.md + 1, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)' },
  ringError: { borderColor: colors.tomato },
  gps: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  gpsIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.sprout,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askRow: { paddingHorizontal: 14, paddingBottom: 14 },
  askBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.sprout,
  },
  askedLine: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  tick: {
    width: 24,
    height: 24,
    borderRadius: 12,
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
    borderWidth: 0,
  },
  option: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  optionActive: { borderWidth: 1.5, borderColor: colors.leaf },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.leaf },
  notListed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  blocks: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  blockChip: {
    paddingHorizontal: 16,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  blockChipActive: { backgroundColor: colors.night, borderColor: colors.night },
  doneBox: { alignItems: 'stretch', paddingTop: 8 },
  doneTick: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.sprout,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
