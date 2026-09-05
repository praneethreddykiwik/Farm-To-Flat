import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Label, Pressy, Subtitle, Text } from '../ui';
import { colors } from '../theme';

/** @param {{ eyebrow?: string, title: string, action?: { label: string, onPress: () => void }, style?: any }} props */
export function SectionHeader({ eyebrow, title, action, style }) {
  return (
    <View style={[styles.row, style]}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Label>{eyebrow}</Label> : null}
        <Subtitle style={eyebrow ? { marginTop: 2 } : undefined}>{title}</Subtitle>
      </View>
      {action ? (
        <Pressy onPress={action.onPress} haptics="select" style={styles.action}>
          <Text variant="smallMedium" color={colors.leafDeep}>
            {action.label}
          </Text>
          <ChevronRight size={16} color={colors.leafDeep} />
        </Pressy>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 12,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 4 },
});
