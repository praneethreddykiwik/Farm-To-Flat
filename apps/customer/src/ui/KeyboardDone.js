import React from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, fonts } from '../theme';

// Numeric keyboards (number-pad / decimal-pad / phone-pad) have NO return key, so there's no clean
// way to dismiss them. This is the shared "Done" bar that sits above those keyboards — rendered once
// at the app root, referenced by numeric inputs via KEYBOARD_DONE_ID. iOS only (Android numeric
// keyboards already carry a dismiss affordance).
export const KEYBOARD_DONE_ID = 'f2f-keyboard-done';

export function KeyboardDoneBar() {
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={KEYBOARD_DONE_ID}>
      <View style={styles.bar}>
        <Pressable onPress={() => Keyboard.dismiss()} hitSlop={10} style={styles.btn}>
          <Text style={styles.txt}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(238,242,232,0.97)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(14,27,20,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  btn: { paddingHorizontal: 16, paddingVertical: 6 },
  txt: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.leaf },
});
