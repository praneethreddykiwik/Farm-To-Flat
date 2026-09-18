import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * Keeps a staff screen's data honest.
 *
 * Staff screens read state the admin WEBSITE can change while the screen sits open — a cost
 * approval decided on the web, an order shipped from the fulfilment board. Nothing pushes that
 * down to the phone, so a buyer standing in the market could watch "Awaiting admin" forever after
 * the admin had already approved. Refetch whenever the screen comes back into focus, and give the
 * user a pull-to-refresh so they can ask for it on the spot.
 *
 * `load` must return the promise for its fetch, so the spinner stops when the data actually lands.
 *
 * @param {() => Promise<unknown> | void} load
 * @returns {{ refreshing: boolean, onRefresh: () => void }}
 */
export function useStaffRefresh(load) {
  const [refreshing, setRefreshing] = useState(false);

  // Runs on mount too, so this replaces the screen's initial useEffect rather than adding to it.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.resolve(load()).finally(() => setRefreshing(false));
  }, [load]);

  return { refreshing, onRefresh };
}
