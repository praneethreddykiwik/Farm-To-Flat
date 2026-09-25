import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Camera, ImagePlus, X } from 'lucide-react-native';
import { Button, Glass, Input, Label, Pressy, Small, Text } from '../ui';
import { colors, radius } from '../theme';
import { canTakePhotos, pickPhoto } from '../lib/photoPicker';

const REASONS = [
  { key: 'QUALITY', label: 'Not fresh' },
  { key: 'DAMAGED', label: 'Damaged' },
  { key: 'MISSING', label: 'Missing item' },
  { key: 'WRONG_ITEM', label: 'Wrong item' },
  { key: 'OTHER', label: 'Something else' },
];

/**
 * "Something in this bag is wrong."
 *
 * Offered once the order is delivered, because that is the first moment the customer can actually
 * see what arrived. A photograph is the whole point — it is the only evidence either side will ever
 * have, and it settles almost every dispute without an argument — so the camera is the primary
 * action and the words are optional.
 *
 * @param {{ onSubmit: (body: any) => Promise<void>, busy?: boolean }} props
 */
export function ReportIssue({ onSubmit, busy = false }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('QUALITY');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState(null);

  async function add(source) {
    setError(null);
    if (!canTakePhotos()) {
      setError('Update the app from the link you were sent to send photos.');
      return;
    }
    try {
      const p = await pickPhoto(source);
      if (p) setPhotos((cur) => [...cur, p].slice(0, 5));
    } catch (e) {
      setError(e?.message || 'Could not open the camera.');
    }
  }

  if (!open) {
    return (
      <Pressy onPress={() => setOpen(true)} haptics="select" style={{ marginTop: 24 }}>
        <Glass radius={radius.lg} innerStyle={styles.prompt}>
          <Camera size={18} color={colors.leafDeep} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium">Something not right?</Text>
            <Small muted style={{ marginTop: 2 }}>
              Send us a photo — we replace it or refund it.
            </Small>
          </View>
        </Glass>
      </Pressy>
    );
  }

  const canSend = photos.length > 0 || note.trim().length > 0;

  return (
    <View style={{ marginTop: 24 }}>
      <Label style={{ marginBottom: 8 }}>What went wrong?</Label>
      <Glass radius={radius.lg} innerStyle={{ padding: 16 }}>
        <View style={styles.reasons}>
          {REASONS.map((r) => {
            const on = reason === r.key;
            return (
              <Pressy
                key={r.key}
                onPress={() => setReason(r.key)}
                haptics="select"
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <View style={[styles.chip, on && styles.chipOn]}>
                  <Small style={{ color: on ? colors.inkOnDark : colors.ink }}>{r.label}</Small>
                </View>
              </Pressy>
            );
          })}
        </View>

        <View style={styles.photoRow}>
          {photos.map((p, i) => (
            <View key={p.uri} style={styles.thumbWrap}>
              <Image source={{ uri: p.uri }} style={styles.thumb} />
              <Pressy
                onPress={() => setPhotos((cur) => cur.filter((_, n) => n !== i))}
                haptics="select"
                accessibilityLabel="Remove this photo"
                // A 20pt circle is below the 44pt minimum touch target; the slop makes it hittable
                // without making the badge itself bigger.
                hitSlop={12}
                style={styles.removeBtn}
              >
                <X size={12} color={colors.inkOnDark} strokeWidth={3} />
              </Pressy>
            </View>
          ))}
          {photos.length < 5 ? (
            <>
              <Pressy
                onPress={() => add('camera')}
                haptics="select"
                accessibilityLabel="Take a photo"
              >
                <View style={styles.addTile}>
                  <Camera size={20} color={colors.leafDeep} />
                  <Small muted style={{ marginTop: 3, fontSize: 11 }}>
                    Camera
                  </Small>
                </View>
              </Pressy>
              <Pressy
                onPress={() => add('library')}
                haptics="select"
                accessibilityLabel="Choose a photo"
              >
                <View style={styles.addTile}>
                  <ImagePlus size={20} color={colors.leafDeep} />
                  <Small muted style={{ marginTop: 3, fontSize: 11 }}>
                    Gallery
                  </Small>
                </View>
              </Pressy>
            </>
          ) : null}
        </View>

        <View style={{ marginTop: 12 }}>
          <Input
            value={note}
            onChangeText={(t) => setNote(t.slice(0, 500))}
            placeholder="Tell us what happened (optional)"
            multiline
            maxLength={500}
            autoCapitalize="sentences"
          />
        </View>

        {error ? (
          <Small style={{ color: colors.tomato, marginTop: 10 }}>{error}</Small>
        ) : (
          <Small muted style={{ marginTop: 10 }}>
            A photo settles it fastest — we can see exactly what you got.
          </Small>
        )}

        <Button
          title={busy ? 'Sending…' : 'Send to the team'}
          onPress={async () => {
            setError(null);
            try {
              await onSubmit({
                reason,
                note: note.trim() || undefined,
                photos: photos.map(({ contentType, dataBase64 }) => ({ contentType, dataBase64 })),
              });
              setOpen(false);
              setPhotos([]);
              setNote('');
            } catch (e) {
              setError(e?.message || 'Could not send that. Try again.');
            }
          }}
          disabled={!canSend || busy}
          loading={busy}
          style={{ marginTop: 14 }}
        />
        <Pressy onPress={() => setOpen(false)} haptics="select" style={{ paddingVertical: 10 }}>
          <Small muted center>
            Not now
          </Small>
        </Pressy>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  prompt: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(14,27,20,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(14,27,20,0.08)',
  },
  chipOn: { backgroundColor: colors.leafDeep, borderColor: colors.leafDeep },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 14 },
  // The remove button used to sit at top/right -5, i.e. OUTSIDE this box. Android clips children to
  // their parent's bounds and delivers no touches beyond them, so on Android the X was invisible and
  // untappable — testers reported having no way to remove a photo they had attached. The wrap now
  // reserves room so the badge overhangs the thumbnail while staying inside the parent.
  thumbWrap: { width: 72, height: 72, paddingTop: 6, paddingRight: 6 },
  thumb: { width: 66, height: 66, borderRadius: 11, backgroundColor: 'rgba(14,27,20,0.06)' },
  removeBtn: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    width: 66,
    height: 66,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(122,168,62,0.5)',
    backgroundColor: 'rgba(122,168,62,0.07)',
  },
});
