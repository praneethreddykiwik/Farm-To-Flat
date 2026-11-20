/**
 * Remembers which notification taps have already been acted on, across launches.
 *
 * Review #47 (21 Nov 2026): the "last notification response" outlives the app. The handled marker
 * was a ref, so it reset on every launch, and the next cold start read the same response again and
 * replayed it — including an action button: "Skip this day" opened the confirm screen with
 * do=skip and skipped the day a second time, "Skipped it" logged the meal as skipped again.
 *
 * Keyed by notification id + action + delivery time (a scheduled reminder's id can repeat on
 * another day, its delivery time cannot). Kept to the last few dozen keys; the store is the local
 * key-value cache, and nothing here leaves the phone.
 *
 * Pure apart from the load/save it is given, so it can be tested without React Native.
 */

export const MAX_HANDLED = 50;

/** @param {any} resp a NotificationResponse @returns {string|null} */
export function responseKey(resp) {
  const id = resp?.notification?.request?.identifier;
  if (!id) return null;
  return `${id}|${resp?.actionIdentifier || ''}|${resp?.notification?.date ?? ''}`;
}

/**
 * @param {{ load: () => any, save: (keys: string[]) => void, max?: number }} io
 */
export function createHandledResponses({ load, save, max = MAX_HANDLED }) {
  /** @type {string[] | null} */
  let keys = null;
  const all = () => {
    if (keys) return keys;
    let stored;
    try {
      stored = load();
    } catch {
      stored = null;
    }
    keys = Array.isArray(stored) ? stored.filter((k) => typeof k === 'string').slice(-max) : [];
    return keys;
  };
  return {
    /**
     * Records the response and says whether it is new. False = already handled, do nothing.
     * @param {any} resp
     */
    claim(resp) {
      const key = responseKey(resp);
      if (!key) return false;
      const list = all();
      if (list.includes(key)) return false;
      list.push(key);
      if (list.length > max) list.splice(0, list.length - max);
      try {
        save([...list]);
      } catch {}
      return true;
    },
  };
}
