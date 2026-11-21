import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSelector } from 'react-redux';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Copy, Gift, Share2 } from 'lucide-react-native';
import { selectLanguage } from '../features/ui/uiSlice';
import { inviteHeadline, useInviteShare } from '../hooks/useInviteShare';
import { t } from '../lib/i18n';
import { colors, fonts, radius } from '../theme';
import { Button, Label, Pressy, Small, Text } from '../ui';

/**
 * "Invite neighbours" on the Profile screen (21 Nov 2026). It was one grey row that read like a
 * setting; now it is a card you notice: the reward in big type, your code (tap to copy) and a Share
 * button that opens the share sheet straight away. Tapping the rest of the card opens the full
 * Invite screen with what you have earned so far.
 *
 * Hidden when invites are switched off in the admin, or while the code is unavailable.
 */
export function InviteCard() {
  const router = useRouter();
  const lang = useSelector(selectLanguage);
  const invite = useInviteShare();
  const { data, sharing, share, copy } = invite;
  if (!data?.code || data.enabled === false) return null;
  const head = inviteHeadline(invite, lang);

  return (
    <>
      <Label style={{ marginTop: 26, marginBottom: 8 }}>{t('inviteNeighbours', lang)}</Label>
      <Pressy
        onPress={() => router.push('/invite')}
        haptics="select"
        accessibilityRole="button"
        accessibilityLabel={`${head.title}. ${head.sub}`}
        style={styles.wrap}
      >
        <LinearGradient
          colors={['#F4FBDF', '#D6F2B8', '#A9E0C1']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.orb} />
        <View style={styles.inner}>
          <View style={styles.top}>
            <View style={styles.gift}>
              <Gift size={22} color={colors.leafDeep} />
            </View>
            <View style={styles.more}>
              <Small color={colors.leafDeep}>{t('howItWorksTitle', lang)}</Small>
              <ChevronRight size={16} color={colors.leafDeep} />
            </View>
          </View>
          <Text style={styles.title}>{head.title}</Text>
          <Small color={colors.ink2} style={{ marginTop: 6 }}>
            {head.sub}
          </Small>
          <View style={styles.actions}>
            <Pressy
              onPress={copy}
              haptics="select"
              accessibilityRole="button"
              accessibilityLabel={`${t('copyCode', lang)} ${data.code.split('').join(' ')}`}
              style={styles.codeChip}
            >
              <Text style={styles.code}>{data.code}</Text>
              <Copy size={14} color={colors.leafDeep} />
            </Pressy>
            <Button
              title={t('inviteShareShort', lang)}
              onPress={() => share('profile_card')}
              loading={sharing}
              size="md"
              full={false}
              icon={<Share2 size={16} color={colors.inkOnDark} />}
            />
          </View>
        </View>
      </Pressy>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.xl, overflow: 'hidden' },
  inner: { padding: 18 },
  orb: {
    position: 'absolute',
    right: -40,
    top: -40,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gift: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  more: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  title: {
    fontFamily: fonts.display,
    fontSize: 26,
    // Fraunces is taller than its em box; without an explicit line height iOS clips the top.
    lineHeight: 34,
    paddingTop: 2,
    color: colors.ink,
    marginTop: 14,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  codeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.leafDeep,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  code: { fontFamily: fonts.mono, fontSize: 16, letterSpacing: 2, color: colors.ink },
});
