import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { MessageCircle, Star } from 'lucide-react-native';
import { Button, Glass, Input, Label, Pressy, Small, Text } from '../ui';
import { useGetReviewQuery, useSaveReviewMutation } from '../api/api';
import { selectLanguage, showToast } from '../features/ui/uiSlice';
import { haptic } from '../lib/haptics';
import { t } from '../lib/i18n';
import { colors, radius } from '../theme';

/**
 * Rate a delivered order: 1–5 stars, a few quick tags, an optional word. Goes to the admin Feedback
 * page, where the team can reply — and the reply shows here (17 Nov 2026 review: one Feedback place
 * for the good and the bad, not only complaints).
 * `stamp` changes whenever the order screen reloads the order (pull to refresh, push), so a reply
 * the team just wrote appears with it.
 * @param {{ orderId: string, stamp?: number }} props
 */
export function RateOrder({ orderId, stamp }) {
  const lang = useSelector(selectLanguage);
  const dispatch = useDispatch();
  const { data, isLoading, refetch } = useGetReviewQuery(orderId);
  useEffect(() => {
    if (stamp) refetch();
  }, [stamp, refetch]);
  const [save, { isLoading: saving }] = useSaveReviewMutation();
  const review = data?.review || null;
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState(/** @type {string[]} */ ([]));
  const [comment, setComment] = useState('');

  if (isLoading || !data?.canReview) return null;

  const submit = async () => {
    if (!rating) {
      haptic.warning();
      return;
    }
    try {
      await save({ orderId, rating, tags, comment: comment.trim() || null }).unwrap();
      haptic.success();
      setEditing(false);
      dispatch(showToast({ title: t('ratingThanks', lang), tone: 'success' }));
    } catch (e) {
      haptic.error();
      dispatch(showToast({ title: e?.message || 'Could not save your rating', tone: 'error' }));
    }
  };

  // Already rated, not editing: show it, and the team's reply if there is one.
  if (review && !editing) {
    return (
      <Animated.View entering={FadeInDown.duration(320)} style={{ marginTop: 20 }}>
        <Label style={{ marginBottom: 8 }}>{t('yourRating', lang)}</Label>
        <Glass radius={radius.lg} innerStyle={{ padding: 16, gap: 10 }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Stars value={review.rating} size={22} />
            <Pressy
              onPress={() => {
                // Start the form from what they said last time.
                setRating(review.rating);
                setTags(review.tags || []);
                setComment(review.comment || '');
                setEditing(true);
              }}
              haptics="select"
              accessibilityRole="button"
            >
              <Text variant="smallMedium" color={colors.leafDeep}>
                {t('editRating', lang)}
              </Text>
            </Pressy>
          </View>
          {review.tags?.length ? <Small muted>{review.tags.join(' · ')}</Small> : null}
          {review.comment ? <Text variant="body">“{review.comment}”</Text> : null}
          {review.reply ? (
            <View style={styles.reply}>
              <MessageCircle size={16} color={colors.leafDeep} />
              <View style={{ flex: 1 }}>
                <Small style={{ color: colors.leafDeep }}>{t('teamReplied', lang)}</Small>
                <Text variant="body">{review.reply}</Text>
              </View>
            </View>
          ) : null}
        </Glass>
      </Animated.View>
    );
  }

  const quick = data?.tags || [];
  return (
    <Animated.View entering={FadeInDown.duration(320)} style={{ marginTop: 20 }}>
      <Label style={{ marginBottom: 4 }}>{t('rateOrder', lang)}</Label>
      <Small muted style={{ marginBottom: 8 }}>
        {t('rateOrderSub', lang)}
      </Small>
      <Glass radius={radius.lg} innerStyle={{ padding: 16, gap: 14 }}>
        <Stars value={rating} onPick={setRating} />
        {rating ? (
          <>
            <View style={styles.tags}>
              {quick.map((tag) => {
                const on = tags.includes(tag);
                return (
                  <Pressy
                    key={tag}
                    onPress={() => setTags((x) => (on ? x.filter((y) => y !== tag) : [...x, tag]))}
                    haptics="select"
                  >
                    <View style={[styles.tag, on && styles.tagOn]}>
                      <Text variant="smallMedium" color={on ? colors.inkOnDark : colors.ink}>
                        {tag}
                      </Text>
                    </View>
                  </Pressy>
                );
              })}
            </View>
            <Input
              value={comment}
              onChangeText={(v) => setComment(v.slice(0, 500))}
              placeholder={t('ratingPlaceholder', lang)}
              multiline
              maxLength={500}
            />
            <Button title={t('sendRating', lang)} onPress={submit} loading={saving} />
          </>
        ) : null}
      </Glass>
    </Animated.View>
  );
}

/** @param {{ value: number, size?: number, onPick?: ((n: number) => void) | null }} props */
function Stars({ value, size = 30, onPick = null }) {
  return (
    <View
      style={styles.stars}
      accessibilityRole={onPick ? 'adjustable' : undefined}
      accessibilityLabel={`${value} of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const icon = (
          <Star
            size={size}
            color={n <= value ? colors.amber || '#E4A11B' : 'rgba(14,27,20,0.25)'}
            fill={n <= value ? colors.amber || '#E4A11B' : 'transparent'}
          />
        );
        return onPick ? (
          <Pressy
            key={n}
            onPress={() => onPick(n)}
            haptics="select"
            accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
          >
            <Animated.View entering={ZoomIn.delay(n * 40)}>{icon}</Animated.View>
          </Pressy>
        ) : (
          <View key={n}>{icon}</View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: 'row', gap: 8 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.2,
    borderColor: 'rgba(14,27,20,0.14)',
  },
  tagOn: { backgroundColor: colors.leafDeep, borderColor: colors.leafDeep },
  reply: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: 'rgba(30,122,76,0.08)',
  },
});
