import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { ArrowLeft } from 'lucide-react-native';
import {
  Ambient,
  Button,
  Display,
  Glass,
  Input,
  Pressy,
  Skeleton,
  Small,
  Text,
} from '../../src/ui';
import { useGetTicketQuery, useReplyTicketMutation } from '../../src/api/api';
import { selectLanguage } from '../../src/features/ui/uiSlice';
import { haptic } from '../../src/lib/haptics';
import { t } from '../../src/lib/i18n';
import { colors, radius } from '../../src/theme';
import { TicketStatus } from '../../src/components/TicketStatus';

const when = (iso) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

/** One help request: the thread with the team, and a box to add to it. */
export default function SupportThread() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const lang = useSelector(selectLanguage);
  const { id } = useLocalSearchParams();
  const { data, isLoading } = useGetTicketQuery(String(id), {
    pollingInterval: 30000,
    refetchOnFocus: true,
  });
  const [reply, { isLoading: sending }] = useReplyTicketMutation();
  const [text, setText] = useState('');
  const [error, setError] = useState(/** @type {string|null} */ (null));
  const tk = data?.ticket;

  const send = async () => {
    if (text.trim().length < 3) return;
    setError(null);
    try {
      await reply({ id: String(id), text: text.trim() }).unwrap();
      haptic.success();
      setText('');
    } catch (e) {
      haptic.error();
      setError(e?.message || 'Could not send. Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Ambient />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 40,
        }}
      >
        <Pressy onPress={() => router.back()} haptics="select" accessibilityLabel="Back">
          <Glass radius={radius.pill} innerStyle={styles.back}>
            <ArrowLeft size={20} color={colors.ink} />
          </Glass>
        </Pressy>

        {isLoading || !tk ? (
          <Skeleton height={120} radius={radius.lg} style={{ marginTop: 20 }} />
        ) : (
          <>
            <View style={styles.head}>
              <Display style={{ flex: 1 }}>{tk.number}</Display>
              <TicketStatus status={tk.status} lang={lang} />
            </View>
            <Small muted style={{ marginTop: 4 }}>
              {t(`ticketCat_${tk.category}`, lang)}
            </Small>

            <View style={{ gap: 10, marginTop: 20 }}>
              {tk.messages.map((m) => {
                const mine = m.from === 'CUSTOMER';
                return (
                  <View
                    key={m.id}
                    style={[styles.bubble, mine ? styles.mine : styles.theirs]}
                    accessibilityLabel={`${mine ? t('ticketYou', lang) : t('ticketTeam', lang)}: ${m.text}`}
                  >
                    <Small color={mine ? colors.inkOnDark : colors.ink2}>
                      {mine ? t('ticketYou', lang) : t('ticketTeam', lang)} · {when(m.at)}
                    </Small>
                    <Text variant="body" color={mine ? colors.inkOnDark : colors.ink}>
                      {m.text}
                    </Text>
                  </View>
                );
              })}
            </View>

            <Input
              value={text}
              onChangeText={(v) => {
                setText(v.slice(0, 1000));
                setError(null);
              }}
              placeholder={t('ticketReplyPh', lang)}
              multiline
              textAlignVertical="top"
              error={error}
              style={{ marginTop: 20 }}
            />
            <Button
              title={t('ticketSend', lang)}
              onPress={send}
              loading={sending}
              disabled={text.trim().length < 3}
              style={{ marginTop: 12 }}
            />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  bubble: { padding: 12, borderRadius: radius.md, gap: 4, maxWidth: '88%' },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.night },
  theirs: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.85)' },
});
