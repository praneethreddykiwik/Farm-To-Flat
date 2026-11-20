import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Clock, RotateCcw } from 'lucide-react-native';
import { Glass, Pressy, Small, Text } from '../ui';
import { useGetOrdersQuery, useGetSupportQuery, useSetCartItemMutation } from '../api/api';
import { selectLanguage, showToast } from '../features/ui/uiSlice';
import { addDaysISO, formatDateShort, todayISO } from '../lib/dates';
import { haptic } from '../lib/haptics';
import { t } from '../lib/i18n';
import { track } from '../lib/tracking';
import { colors, radius } from '../theme';

/** "2h 15m", "45m", "under a minute". */
export function timeLeft(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 1) return '<1m';
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

/**
 * Two small nudges on Home (Rapture7 brief, NEXT):
 *   - the cut-off countdown — "Order in 2h 15m for tomorrow morning" — while tomorrow's window is
 *     still open and closes within the day (minute by minute, red in the last hour);
 *   - "Repeat your last basket" — the items of the latest delivered order back in the bag in one
 *     tap (repeat_basket_used). Prices are today's; the cart shows them before anything is paid.
 * Neither shows when it has nothing to say.
 * @param {{ nextWindow?: { date: string, cutoffAt?: string }|null, style?: any }} props
 */
export function HomeNudges({ nextWindow, style }) {
  const lang = useSelector(selectLanguage);
  const router = useRouter();
  const dispatch = useDispatch();
  const orders = useGetOrdersQuery();
  // Switched in the admin (Friday report → Settings → Home screen nudges). Older API: both on.
  const nudges = useGetSupportQuery().data?.features?.nudges || {};
  const countdownOn = nudges.countdown !== false;
  const repeatOn = nudges.repeatBasket !== false;
  const hours = Number(nudges.countdownHours) || 12;
  const [setCartItem] = useSetCartItemMutation();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30e3);
    return () => clearInterval(id);
  }, []);

  const cutoffMs = nextWindow?.cutoffAt ? Date.parse(nextWindow.cutoffAt) - now : null;
  const tomorrow = addDaysISO(todayISO(), 1);
  const showCountdown =
    countdownOn &&
    cutoffMs != null &&
    cutoffMs > 0 &&
    cutoffMs < hours * 3600e3 &&
    nextWindow?.date === tomorrow;
  const urgent = showCountdown && cutoffMs < 3600e3;

  const list = orders.data?.orders;
  const last = useMemo(
    () =>
      (list || [])
        .filter((o) => o.status === 'DELIVERED' && (o.items || []).length > 0)
        .sort((a, b) => (a.deliveryDate < b.deliveryDate ? 1 : -1))[0] || null,
    [list],
  );
  // Nothing to repeat while an order for tomorrow is already placed.
  const hasUpcoming = (list || []).some((o) =>
    ['CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY', 'PENDING_PAYMENT'].includes(o.status),
  );

  const repeat = async () => {
    if (!last || busy) return;
    setBusy(true);
    try {
      for (const it of last.items) {
        await setCartItem({ productId: it.productId, quantity: String(it.quantity) }).unwrap();
      }
      track('repeat_basket_used', {
        from: 'home',
        order_id: last.id,
        items_count: last.items.length,
      });
      haptic.success();
      dispatch(showToast({ title: t('repeatBasketDone', lang), tone: 'success' }));
      router.push('/cart');
    } catch (e) {
      dispatch(showToast({ title: e?.message || 'Could not add all items', tone: 'error' }));
    } finally {
      setBusy(false);
    }
  };

  const showRepeat = repeatOn && !!last && !hasUpcoming;
  if (!showCountdown && !showRepeat) return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(320).springify().damping(18)}
      style={[styles.wrap, style]}
    >
      {showCountdown ? (
        <Glass radius={radius.lg} innerStyle={styles.row}>
          <Clock size={18} color={urgent ? colors.tomato : colors.leafDeep} />
          <Text
            variant="smallMedium"
            color={urgent ? colors.tomato : colors.ink}
            style={{ flex: 1 }}
          >
            {t(urgent ? 'cutoffSoon' : 'cutoffIn', lang, { time: timeLeft(cutoffMs) })}
          </Text>
        </Glass>
      ) : null}
      {showRepeat ? (
        <Pressy
          onPress={repeat}
          haptics="soft"
          scale={0.985}
          accessibilityRole="button"
          disabled={busy}
        >
          <Glass radius={radius.lg} innerStyle={styles.row}>
            <RotateCcw size={18} color={colors.leafDeep} />
            <View style={{ flex: 1 }}>
              <Text variant="smallMedium">{busy ? '…' : t('repeatBasket', lang)}</Text>
              <Small muted>
                {t('repeatBasketSub', lang, {
                  count: last.items.length,
                  date: formatDateShort(last.deliveryDate),
                })}
              </Small>
            </View>
          </Glass>
        </Pressy>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // The home list already pads 14 pt; this lands the cards 16 pt from the screen edge.
  wrap: { paddingHorizontal: 2, marginBottom: 12, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
});
