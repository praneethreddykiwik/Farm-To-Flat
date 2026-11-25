/**
 * The native side of the Dynamic Island card, or a stand-in that does nothing: Android, Expo Go,
 * tests, and every iPhone build made before the card existed (an over-the-air update reaches those
 * too, so nothing here may assume the module is there).
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { cardForLink } from './orderIsland';
import { shortId } from './ids';
import { KV_KEYS, kv } from './kv';

const Native = Platform.OS === 'ios' ? requireOptionalNativeModule('OrderIsland') : null;

const quiet = async (fn, fallback) => {
  if (!Native) return fallback;
  try {
    return await fn();
  } catch {
    return fallback; // a card is a convenience, never a crash
  }
};

export const orderIsland = {
  supported() {
    try {
      return !!Native?.isSupported();
    } catch {
      return false;
    }
  },
  canSchedule() {
    try {
      return !!Native?.canSchedule();
    } catch {
      return false;
    }
  },
  /** @returns {Promise<any[]>} */
  list: () => quiet(() => Native.list(), []),
  /** @returns {Promise<string[]>} */
  takeSkips: () => quiet(() => Native.takeSkips(), []),
  start: (card, atMs = null) => quiet(() => Native.start(toNative(card), atMs), null),
  update: (card) => quiet(() => Native.update(toNative(card)), undefined),
  endAll: () => quiet(() => Native.endAll(), undefined),
};

function toNative({ totalPaise, ...card }) {
  return card;
}

export const newIslandToken = () => shortId(24);
export const savedIsland = () => kv.getJSON(KV_KEYS.orderIsland);
export const saveIsland = (v) =>
  v ? kv.setJSON(KV_KEYS.orderIsland, v) : kv.remove(KV_KEYS.orderIsland);

/**
 * Check a link against the card and use its token up. The card gets a fresh one straight away, so
 * its buttons still work after a payment the customer backed out of, while the same link opened
 * again (a reload, a saved URL) does nothing.
 */
export function claimIslandLink({ date, token }) {
  const saved = cardForLink(savedIsland(), { date, token });
  if (!saved) return null;
  const next = newIslandToken();
  saveIsland({ ...saved, token: next });
  if (saved.card) orderIsland.update({ ...saved.card, token: next });
  return saved;
}

/** "Show on Dynamic Island" on the confirm screen asks the root hook to put the card up now. */
const askers = new Set();
export const onIslandAsked = (fn) => {
  askers.add(fn);
  return () => {
    askers.delete(fn);
  };
};
export const askForIsland = () => askers.forEach((fn) => fn());
