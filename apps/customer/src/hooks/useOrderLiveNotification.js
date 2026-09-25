import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useSelector } from 'react-redux';
import { useGetOrdersQuery } from '../api/api';
import { selectAuth } from '../features/auth/authSlice';
import { windowLabel } from '../lib/dates';
import { isLiveStatus, presentOrderLive, dismissOrderLive } from '../lib/notifications';

/**
 * Keeps ONE Android "live order" notification in sync with the customer's active order — the closest
 * Android has to an iOS Live Activity. While signed in it polls the orders list, finds the order
 * that's currently moving (Confirmed → Packing → On the road) and updates the sticky card in place;
 * when the order is delivered, cancelled, or there's none, it clears the card.
 *
 * Android-only and cheap: the query only runs on Android for a signed-in user, and the notification
 * is only re-presented when the active order's id or status actually changes. iOS is a no-op here and
 * gets real Live Activities later (needs a paid Apple Developer account + native build).
 */
export function useOrderLiveNotification() {
  const auth = useSelector(selectAuth);
  const signedIn = auth.status === 'signedIn';
  const enabled = Platform.OS === 'android' && signedIn;

  const { data } = useGetOrdersQuery(undefined, {
    skip: !enabled,
    pollingInterval: 30000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  // Remember what the card currently shows so we only touch the notification on a real change.
  const shownKey = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    const orders = data?.orders || [];
    // The active order = the one that's moving. If several, take the earliest delivery date so the
    // card tracks the order arriving next.
    const active = orders
      .filter((o) => isLiveStatus(o.status))
      .sort((a, b) => String(a.deliveryDate).localeCompare(String(b.deliveryDate)))[0];

    if (!active) {
      if (shownKey.current) {
        dismissOrderLive();
        shownKey.current = null;
      }
      return;
    }

    const key = `${active.id}|${active.status}`;
    if (key === shownKey.current) return; // nothing changed — leave the card as-is
    shownKey.current = key;
    presentOrderLive({
      orderId: active.id,
      orderNumber: active.orderNumber,
      status: active.status,
      windowLabel: windowLabel(active.window),
    });
  }, [enabled, data]);

  // Clear the card on sign-out so a stale order doesn't linger for the next person on the phone.
  useEffect(() => {
    if (!signedIn && Platform.OS === 'android') {
      dismissOrderLive();
      shownKey.current = null;
    }
  }, [signedIn]);
}
