import React, { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useConsentSaveMutation, useConsentStatusQuery } from '../api/api';
import { selectAuth } from '../features/auth/authSlice';
import { selectLanguage, showToast } from '../features/ui/uiSlice';
import { useSignOut } from '../hooks/useSession';
import { NOTICE_VERSION } from '../lib/consent';
import { t } from '../lib/i18n';
import { colors } from '../theme';
import { Body, Button, Display, Pressy, Small } from '../ui';
import { ConsentTicks } from './ConsentTicks';

/**
 * The privacy notice, once, for customers who signed up before consent became two ticked boxes —
 * or after the notice changes (DPDP Act §5(2), §6, §9; 21 Nov 2026).
 *
 * Shown over everything while the server says this account has not agreed to the current notice.
 * It cannot be dismissed: the choices are "agree (and confirm 18+)" or sign out. Offline or on an
 * API that does not know /me/consent yet, nothing is shown — a customer is never locked out by a
 * missing endpoint.
 */
export function ConsentPrompt() {
  const signedIn = useSelector(selectAuth).status === 'signedIn';
  const lang = useSelector(selectLanguage);
  const dispatch = useDispatch();
  const signOut = useSignOut();
  const { data } = useConsentStatusQuery(undefined, { skip: !signedIn });
  const [save, { isLoading }] = useConsentSaveMutation();
  const [agreed, setAgreed] = useState(false);
  const [adult, setAdult] = useState(false);

  if (!signedIn || !data?.required) return null;

  const agree = async () => {
    if (!agreed || !adult) {
      dispatch(showToast({ title: t('consentNeeded', lang), tone: 'neutral' }));
      return;
    }
    try {
      await save({ version: NOTICE_VERSION, adult: true }).unwrap();
    } catch (e) {
      dispatch(
        showToast({ title: /** @type {any} */ (e)?.message || 'Please try again', tone: 'error' }),
      );
    }
  };

  return (
    <View style={styles.cover} accessibilityViewIsModal>
      <ScrollView contentContainerStyle={styles.inner}>
        <Display style={{ marginBottom: 12 }}>{t('consentTitle', lang)}</Display>
        <Body style={{ marginBottom: 16 }}>{t('consentBody', lang)}</Body>
        <Pressy
          onPress={() =>
            Linking.openURL(`https://fooducia.health/privacy?lang=${lang}`).catch(() => {})
          }
          haptics="select"
        >
          <Small style={styles.link}>{t('privacyPolicy', lang)}</Small>
        </Pressy>
        <View style={{ height: 20 }} />
        <ConsentTicks
          agreed={agreed}
          onAgree={() => setAgreed((v) => !v)}
          adult={adult}
          onAdult={() => setAdult((v) => !v)}
          lang={lang}
        />
        <Button
          title={t('consentContinue', lang)}
          onPress={agree}
          loading={isLoading}
          disabled={!agreed || !adult}
          style={{ marginTop: 20 }}
        />
        <Pressy onPress={signOut} haptics="select" style={{ marginTop: 16, alignSelf: 'center' }}>
          <Small muted>{t('consentSignOut', lang)}</Small>
        </Pressy>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.canvas,
    zIndex: 900,
  },
  inner: { padding: 24, paddingTop: 96, paddingBottom: 48 },
  link: { color: colors.leafDeep, textDecorationLine: 'underline' },
});
