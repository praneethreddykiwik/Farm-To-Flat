import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * The on-screen keyboard's height, or 0 when it is closed.
 *
 * KeyboardAvoidingView is not enough in two places we have: it does not measure inside an
 * absolutely-positioned overlay (the delivery door panel), and on a plain ScrollView it resizes the
 * frame without giving the content anywhere further to scroll — so whatever sits below the focused
 * field, including the button that submits the form, simply cannot be reached. Both cases need the
 * real height so the layout can make room for it.
 *
 * iOS gets `willShow` so the lift animates with the keyboard; Android only fires `didShow`.
 */
export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setHeight(e.endCoordinates?.height ?? 0),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setHeight(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
