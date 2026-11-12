import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * True while this screen is the one on show; false while another is pushed over it.
 *
 * A screen stays MOUNTED underneath whatever is pushed on top, so anything it sets globally — the
 * status-bar colour, most of all — keeps applying after it is out of sight. The welcome screen is
 * dark and wants light status text; the phone-number screen that slides over it is pale, and
 * inherited white clock digits nobody could read. Gate such settings on this.
 *
 * @returns {boolean}
 */
export function useScreenFocused() {
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return focused;
}
