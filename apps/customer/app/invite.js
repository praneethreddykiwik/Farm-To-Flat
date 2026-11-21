import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, Copy, Gift, Share2, Users, Wallet } from 'lucide-react-native';
import { Ambient, Button, Display, Glass, Label, Pressy, Small, Text } from '../src/ui';
import { selectLanguage } from '../src/features/ui/uiSlice';
import { inviteHeadline, rupeesOf, useInviteShare } from '../src/hooks/useInviteShare';
import { t } from '../src/lib/i18n';
import { colors, fonts, radius } from '../src/theme';

/**
 * Invite neighbours (17 Nov 2026 review). The customer's own code, a share sheet, and what they have
 * earned. The reward is paid when the invited neighbour's FIRST order is delivered — said plainly,
 * so nobody expects money for a sign-up. The amounts come from the admin (Growth → Neighbour
 * invites), so the screen never promises a figure the server will not pay.
 */
export default function Invite() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const lang = useSelector(selectLanguage);
  const invite = useInviteShare();
  const { data, isLoading, isError, refetch, sharing, share, copy, amount, welcome } = invite;
  const rupees = rupeesOf;
  const head = inviteHeadline(invite, lang);

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Ambient />
      <ScrollView
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

        <Display style={{ marginTop: 18 }}>
          {data?.enabled === false ? t('inviteNeighbours', lang) : head.title}
        </Display>
        <Small muted style={{ marginTop: 6 }}>
          {data?.enabled === false ? data?.howItWorks : head.sub}
        </Small>

        {isError || (data && !data.code) ? (
          <Glass radius={radius.lg} innerStyle={{ padding: 18, marginTop: 22 }}>
            <Text variant="bodyMedium">{t('inviteUnavailable', lang)}</Text>
            <Button title={t('tryAgain', lang)} onPress={refetch} style={{ marginTop: 14 }} />
          </Glass>
        ) : (
          <Animated.View entering={FadeInDown.duration(380).springify().damping(18)}>
            <Glass radius={radius.xl} innerStyle={styles.codeCard}>
              <View style={styles.giftIcon}>
                <Gift size={26} color={colors.leafDeep} />
              </View>
              <Small muted style={{ marginTop: 12 }}>
                {t('yourInviteCode', lang)}
              </Small>
              <Text
                style={styles.code}
                accessibilityLabel={`Code ${data?.code?.split('').join(' ') || ''}`}
              >
                {isLoading ? '········' : data?.code}
              </Text>
              <Pressy
                onPress={copy}
                haptics="select"
                disabled={!data?.code}
                accessibilityRole="button"
              >
                <View style={styles.copy}>
                  <Copy size={15} color={colors.leafDeep} />
                  <Text variant="smallMedium" color={colors.leafDeep}>
                    {t('copyCode', lang)}
                  </Text>
                </View>
              </Pressy>
              <Button
                title={t('shareInvite', lang)}
                onPress={() => share('invite_screen')}
                loading={sharing}
                disabled={!data}
                icon={<Share2 size={18} color={colors.inkOnDark} />}
                style={{ marginTop: 18, alignSelf: 'stretch' }}
              />
            </Glass>

            <Label style={{ marginTop: 26, marginBottom: 8 }}>{t('inviteSoFar', lang)}</Label>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Glass radius={radius.lg} innerStyle={styles.stat} style={{ flex: 1 }}>
                <Users size={18} color={colors.ink3} />
                <Text style={styles.statNum}>{data?.joined ?? 0}</Text>
                <Small muted>{t('neighboursJoined', lang)}</Small>
              </Glass>
              <Glass radius={radius.lg} innerStyle={styles.stat} style={{ flex: 1 }}>
                <Wallet size={18} color={colors.ink3} />
                <Text style={styles.statNum}>₹{rupees(data?.earnedPaise)}</Text>
                <Small muted>{t('earnedInWallet', lang)}</Small>
              </Glass>
            </View>

            <Label style={{ marginTop: 26, marginBottom: 8 }}>{t('howItWorksTitle', lang)}</Label>
            <Glass radius={radius.lg} innerStyle={{ padding: 16, gap: 12 }}>
              {[
                t('inviteStep1', lang),
                welcome > 0 ? t('inviteStep2Welcome', lang, { welcome }) : t('inviteStep2', lang),
                t('inviteStep3', lang, { amount }),
              ].map((line, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                  <View style={styles.stepDot}>
                    <Text variant="smallMedium" color={colors.inkOnDark}>
                      {i + 1}
                    </Text>
                  </View>
                  <Text variant="body" style={{ flex: 1 }}>
                    {line}
                  </Text>
                </View>
              ))}
              <Small muted>{t('inviteFinePrint', lang)}</Small>
            </Glass>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  codeCard: { padding: 22, marginTop: 22, alignItems: 'center' },
  giftIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.sprout,
    alignItems: 'center',
    justifyContent: 'center',
  },
  code: {
    fontFamily: fonts.display,
    fontSize: 34,
    // Fraunces is taller than its em box; without an explicit line height iOS clips the top.
    lineHeight: 46,
    paddingTop: 4,
    letterSpacing: 4,
    color: colors.ink,
    marginTop: 6,
  },
  copy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  stat: { padding: 16, gap: 4 },
  statNum: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 36,
    paddingTop: 2,
    color: colors.ink,
    marginTop: 4,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.leafDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
