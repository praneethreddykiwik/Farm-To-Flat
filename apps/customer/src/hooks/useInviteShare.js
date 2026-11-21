import { useState } from 'react';
import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useDispatch, useSelector } from 'react-redux';
import { useGetInviteQuery } from '../api/api';
import { selectLanguage, showToast } from '../features/ui/uiSlice';
import { haptic } from '../lib/haptics';
import { t } from '../lib/i18n';
import { track } from '../lib/tracking';

/** Whole rupees from a paise string, for the headline ("Give ₹30, get ₹30"). */
export const rupeesOf = (p) => Math.round(Number(p || 0) / 100);

/**
 * The customer's invite code and the two things people do with it: share it, or copy it. Shared by
 * the Profile card and the Invite screen so both open the same share sheet with the same message.
 */
export function useInviteShare() {
  const dispatch = useDispatch();
  const lang = useSelector(selectLanguage);
  const query = useGetInviteQuery();
  const { data } = query;
  const [sharing, setSharing] = useState(false);

  const share = async (from = 'invite_screen') => {
    if (!data?.shareText) return;
    setSharing(true);
    try {
      const r = await Share.share({ message: data.shareText });
      // referral_link_shared (tracking brief). iOS says whether it was sent; Android cannot tell.
      if (r?.action !== Share.dismissedAction)
        track('referral_link_shared', { channel: r?.activityType || 'share_sheet', from });
    } catch {
      /* dismissed */
    } finally {
      setSharing(false);
    }
  };

  const copy = async () => {
    if (!data?.code) return;
    await Clipboard.setStringAsync(data.code);
    haptic.success();
    dispatch(showToast({ title: t('codeCopied', lang), tone: 'success' }));
  };

  return {
    ...query,
    sharing,
    share,
    copy,
    amount: rupeesOf(data?.rewardPaise || 3000),
    welcome: rupeesOf(data?.welcomePaise || 0),
  };
}

/** The headline and the line under it, worded for whether the new neighbour gets credit too. */
export function inviteHeadline({ amount, welcome }, lang) {
  return welcome > 0
    ? {
        title: t('inviteHeadlineBoth', lang, { amount, welcome }),
        sub: t('inviteCardSubBoth', lang),
      }
    : {
        title: t('inviteHeadlineOne', lang, { amount }),
        sub: t('inviteCardSubOne', lang, { amount }),
      };
}
