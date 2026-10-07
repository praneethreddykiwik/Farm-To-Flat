import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { Pressy } from '../ui';
import { colors, radius } from '../theme';
import { canTakePhotos, pickPhoto } from '../lib/photoPicker';
import { useAiIdentifyMutation } from '../api/api';
import { haptic } from '../lib/haptics';

/**
 * Lens — point the camera at a vegetable and we find it in the catalogue.
 *
 * Sits beside the mic, so the search field offers the three ways a person might ask for something:
 * type it, say it, or show it. The sparkle marks it as the one that is doing something clever,
 * which also sets the expectation that it can be wrong.
 *
 * On a binary built before expo-image-picker shipped, `canTakePhotos()` is false and the button is
 * simply absent — the same rule the mic already follows. That is what keeps this safe to send as an
 * over-the-air update: an older install loses nothing and crashes on nothing.
 *
 * @param {{ onResult: (r: any) => void, onError?: (m: string) => void }} props
 */
export function LensButton({ onResult, onError }) {
  const [identify] = useAiIdentifyMutation();
  const [busy, setBusy] = useState(false);
  if (!canTakePhotos()) return null;

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      let shot;
      try {
        shot = await pickPhoto('camera');
      } catch (e) {
        // No camera permission in this build, or the customer said no. The gallery needs neither,
        // so offer it rather than dead-ending.
        if (e?.code === 'PERMISSION') shot = await pickPhoto('library');
        else throw e;
      }
      if (!shot) return; // cancelled — say nothing
      const r = await identify({
        imageBase64: shot.dataBase64,
        contentType: shot.contentType,
      }).unwrap();
      haptic.success();
      onResult(r);
    } catch (e) {
      onError?.(e?.data?.error?.message || e?.message || 'Could not read that photo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressy
      onPress={run}
      haptics="tap"
      accessibilityLabel="Search by photo"
      accessibilityRole="button"
      accessibilityHint="Opens the camera to identify a vegetable or fruit"
    >
      <View style={styles.lens}>
        {busy ? (
          <ActivityIndicator size="small" color={colors.leafDeep} />
        ) : (
          <Sparkles size={16} color={colors.leafDeep} strokeWidth={2.2} />
        )}
      </View>
    </Pressy>
  );
}

const styles = StyleSheet.create({
  lens: {
    width: 32,
    height: 32,
    borderRadius: radius?.pill ? 16 : 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.leafSoft,
  },
});
