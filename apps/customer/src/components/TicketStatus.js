import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../ui';
import { t } from '../lib/i18n';
import { colors, radius } from '../theme';

/** Status → pill colours. Resolved and closed read as finished; open ones stand out. */
const TICKET_TONE = {
  OPEN: { bg: '#FFF1D6', fg: '#8A5A00' },
  IN_PROGRESS: { bg: '#E3F0FF', fg: '#1D4E89' },
  RESOLVED: { bg: '#E4F2EA', fg: '#1E7A4C' },
  CLOSED: { bg: 'rgba(14,27,20,0.06)', fg: colors.ink2 },
};

/** @param {{ status: string, lang: string }} props */
export function TicketStatus({ status, lang }) {
  const tone = TICKET_TONE[status] || TICKET_TONE.CLOSED;
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text variant="micro" color={tone.fg}>
        {t(`ticketStatus_${status}`, lang)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
});
