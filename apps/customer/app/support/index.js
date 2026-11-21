import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, ChevronRight, MessageSquare } from 'lucide-react-native';
import {
  Ambient,
  Button,
  Chip,
  Display,
  Glass,
  Input,
  Label,
  Pressy,
  Skeleton,
  Small,
  Text,
} from '../../src/ui';
import { useCreateTicketMutation, useGetSupportQuery, useGetTicketsQuery } from '../../src/api/api';
import { selectLanguage, showToast } from '../../src/features/ui/uiSlice';
import { env } from '../../src/lib/env';
import { haptic } from '../../src/lib/haptics';
import { t } from '../../src/lib/i18n';
import { TicketStatus } from '../../src/components/TicketStatus';
import { colors, radius } from '../../src/theme';

/** Named on the privacy page (apps/admin/src/screens/Privacy.jsx, GRIEVANCE_OFFICER). */
const GRIEVANCE_OFFICER = 'Praneeth Ramaswamy';

const CATEGORIES = ['APP_PROBLEM', 'PAYMENT', 'ACCOUNT', 'DELIVERY', 'SUGGESTION', 'OTHER'];

/**
 * Help requests: problems or complaints about the app or the service that are not about one order.
 * The customer raises one here and follows the thread; the team answers from the admin website.
 */
export default function SupportRequests() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const lang = useSelector(selectLanguage);
  const { data, isLoading } = useGetTicketsQuery(undefined, { refetchOnFocus: true });
  const { data: support } = useGetSupportQuery(undefined);
  const [create, { isLoading: sending }] = useCreateTicketMutation();
  const [category, setCategory] = useState(/** @type {string|null} */ (null));
  const [message, setMessage] = useState('');
  const [error, setError] = useState(/** @type {string|null} */ (null));
  const tickets = data?.tickets || [];

  const send = async () => {
    if (!category || message.trim().length < 3) return;
    setError(null);
    try {
      const r = await create({
        category,
        message: message.trim(),
        context: {
          platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
          appVersion: env.appVersion,
        },
      }).unwrap();
      haptic.success();
      setMessage('');
      setCategory(null);
      dispatch(showToast({ title: t('ticketSent', lang), tone: 'success' }));
      router.push({ pathname: '/support/[id]', params: { id: r.ticket.id } });
    } catch (e) {
      haptic.error();
      setError(e?.message || 'Could not send. Please try again.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
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

        <Display style={{ marginTop: 18 }}>{t('ticketsTitle', lang)}</Display>
        <Small muted style={{ marginTop: 6 }}>
          {t('ticketsLede', lang)}
        </Small>

        <Label style={{ marginTop: 24, marginBottom: 8 }}>{t('ticketNew', lang)}</Label>
        <Glass radius={radius.lg} innerStyle={{ padding: 16 }}>
          <Small muted style={{ marginBottom: 10 }}>
            {t('ticketCategory', lang)}
          </Small>
          <View style={styles.chips}>
            {CATEGORIES.map((c) => (
              <Chip
                key={c}
                label={t(`ticketCat_${c}`, lang)}
                selected={category === c}
                onPress={() => {
                  setCategory(c);
                  setError(null);
                }}
              />
            ))}
          </View>
          <Input
            label={t('ticketMessage', lang)}
            value={message}
            onChangeText={(v) => {
              setMessage(v.slice(0, 1000));
              setError(null);
            }}
            placeholder={t('ticketMessagePh', lang)}
            multiline
            textAlignVertical="top"
            error={error}
            style={{ marginTop: 14 }}
          />
          <Small muted style={{ marginTop: 8 }}>
            {t('ticketOrderHint', lang)}
          </Small>
          <Button
            title={t('ticketSend', lang)}
            onPress={send}
            loading={sending}
            disabled={!category || message.trim().length < 3}
            style={{ marginTop: 14 }}
          />
        </Glass>

        <Label style={{ marginTop: 26, marginBottom: 8 }}>{t('ticketsTitle', lang)}</Label>
        {isLoading ? (
          <Skeleton height={64} radius={radius.lg} />
        ) : tickets.length ? (
          <View style={{ gap: 10 }}>
            {tickets.map((tk) => (
              <Animated.View key={tk.id} entering={FadeInDown.duration(260)}>
                <Pressy
                  onPress={() => router.push({ pathname: '/support/[id]', params: { id: tk.id } })}
                  haptics="select"
                  accessibilityLabel={`${tk.number}, ${t(`ticketStatus_${tk.status}`, lang)}`}
                >
                  <Glass radius={radius.lg} innerStyle={styles.row}>
                    <MessageSquare size={18} color={colors.ink} />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium" numberOfLines={1}>
                        {t(`ticketCat_${tk.category}`, lang)}
                      </Text>
                      <Small muted numberOfLines={1}>
                        {tk.number} · {tk.messages?.[tk.messages.length - 1]?.text || ''}
                      </Small>
                    </View>
                    <TicketStatus status={tk.status} lang={lang} />
                    <ChevronRight size={18} color={colors.ink3} />
                  </Glass>
                </Pressy>
              </Animated.View>
            ))}
          </View>
        ) : (
          <Small muted>{t('ticketNone', lang)}</Small>
        )}

        {/* DPDP Rule 9: who answers questions about your data, in the app as well as on the web. */}
        <Label style={{ marginTop: 28, marginBottom: 8 }}>{t('privacyBoxTitle', lang)}</Label>
        <Glass radius={radius.lg} innerStyle={{ padding: 16 }}>
          <Small>
            {t('privacyBoxBody', lang, {
              name: GRIEVANCE_OFFICER,
              email: support?.support?.email || 'support@fooducia.health',
            })}
          </Small>
        </Glass>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
});
