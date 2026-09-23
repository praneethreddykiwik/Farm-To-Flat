import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { Glass, Pressy, Small, Text } from '../ui';
import { colors, fonts, radius } from '../theme';
import { LANGUAGES } from '../lib/i18n';
import { selectLanguage, setLanguage } from '../features/ui/uiSlice';

/**
 * The language choice, as three tappable cards.
 *
 * Each option is written IN its own script — someone who cannot read English cannot be asked to
 * find "Telugu" in a list of English words. That is the whole reason this is a row of native
 * labels rather than a dropdown.
 *
 * @param {{ tone?: 'light'|'dark', onPick?: (code: string) => void }} props
 */
export function LanguagePicker({ tone = 'light', onPick }) {
  const dispatch = useDispatch();
  const current = useSelector(selectLanguage);
  const dark = tone === 'dark';

  return (
    <View style={styles.row}>
      {LANGUAGES.map((l) => {
        const active = current === l.code;
        return (
          <Pressy
            key={l.code}
            style={{ flex: 1 }}
            haptics="select"
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={l.label}
            onPress={() => {
              dispatch(setLanguage(l.code));
              onPick?.(l.code);
            }}
          >
            <Glass
              tone={tone}
              radius={radius.lg}
              innerStyle={[
                styles.card,
                {
                  borderColor: active
                    ? colors.leaf
                    : dark
                      ? 'rgba(243,245,239,0.16)'
                      : 'rgba(14,27,20,0.10)',
                },
              ]}
            >
              <Text
                style={[
                  styles.native,
                  { color: dark ? colors.inkOnDark : active ? colors.leafDeep : colors.ink },
                ]}
              >
                {l.native}
              </Text>
              <Small
                color={dark ? 'rgba(243,245,239,0.55)' : undefined}
                muted={!dark}
                style={{ marginTop: 2 }}
              >
                {l.label}
              </Small>
            </Glass>
          </Pressy>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 9 },
  card: { paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center', borderWidth: 1.5 },
  native: { fontFamily: fonts.bodyMedium, fontSize: 17, lineHeight: 23 },
});
