import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInRight } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useDispatch, useSelector } from 'react-redux';
import { ArrowRight, Check, ChefHat, Leaf, Sparkles, X } from 'lucide-react-native';
import { Button, Money, Pressy, ProductImage, Small, Stepper, Text } from '../ui';
import { colors, fonts, radius } from '../theme';
import { haptic } from '../lib/haptics';
import { lowEnd } from '../lib/deviceTier';
import { ideas, suggest } from '../lib/cookbook';
import { productLabel } from '../lib/i18n';
import { api } from '../api/api';
import { useCartLine } from '../hooks/useCart';
import { selectDietPref, selectLanguage, showToast } from '../features/ui/uiSlice';

const UNIT = { KG: '/kg', BUNCH: '/bunch', PIECE: '/pc', DOZEN: '/dozen', PACK: '/pack' };
const CARD_W = 172;

/**
 * "What are you cooking?" — in the basket, once the shopping is mostly done.
 *
 * The shopper names a dish; the card answers with what goes into it from today's shelf: first what
 * the dish needs, then what makes it better, each with one line saying why and — where the product
 * has earned one — its nutrition badge. Things already in the basket are ticked, so the row reads as
 * a checklist of the dish, not a list of things to buy.
 *
 * Nothing is added unless the shopper adds it. The knowledge is the app's own written cookbook
 * (lib/cookbook), so it answers at once, offline, and cannot suggest something we do not sell.
 *
 * @param {{ products: any[], basket: any[], onReveal?: () => void }} props
 *   `basket`: the cart's lines. `onReveal`: asked to scroll this card to the top, once it has an
 *   answer to show.
 */
export function CookingGuide({ products, basket, onReveal }) {
  const diet = useSelector(selectDietPref);
  const [text, setText] = useState('');
  const [asked, setAsked] = useState('');
  const input = useRef(/** @type {any} */ (null));

  const inBasket = useMemo(() => (basket || []).map((i) => i.productId), [basket]);
  const quick = useMemo(() => ideas(products, inBasket, 6), [products, inBasket]);
  const answer = useMemo(
    () => (asked ? suggest(asked, products, { inBasket, diet }) : null),
    [asked, products, inBasket, diet],
  );

  const ask = useCallback(
    (what) => {
      const q = String(what || '').trim();
      if (!q) {
        input.current?.focus();
        return;
      }
      haptic.tap();
      Keyboard.dismiss();
      setText(q);
      setAsked(q);
      // Let the answer lay out, then bring it into view.
      setTimeout(() => onReveal?.(), 260);
    },
    [onReveal],
  );
  const clear = () => {
    setText('');
    setAsked('');
  };

  return (
    <View>
      <LinearGradient
        colors={['#0B1510', '#143321', '#1E5A3A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        {/* Two soft discs of light behind the words: still, so they cost nothing. */}
        <View pointerEvents="none" style={[styles.glow, styles.glowA]} />
        <View pointerEvents="none" style={[styles.glow, styles.glowB]} />

        <View style={styles.heroTop}>
          <View style={styles.hat}>
            <ChefHat size={22} color={colors.ink} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.kicker}>
              <Sparkles size={12} color={colors.sprout} />
              <Small color={colors.sprout} style={styles.kickerText}>
                KITCHEN GUIDE
              </Small>
            </View>
            <Text variant="h2" color={colors.inkOnDark} style={{ marginTop: 2 }}>
              What are you cooking?
            </Text>
          </View>
        </View>
        <Small color="rgba(243,245,239,0.72)" style={{ marginTop: 8 }}>
          Name the dish. I’ll line up what goes into it from today’s harvest — and what would make
          it better.
        </Small>

        <View style={styles.ask}>
          <TextInput
            ref={input}
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => ask(text)}
            placeholder="Tomato curry, sambar, biryani…"
            placeholderTextColor="rgba(243,245,239,0.45)"
            returnKeyType="search"
            autoCapitalize="sentences"
            autoCorrect={false}
            maxLength={60}
            style={styles.input}
            accessibilityLabel="What are you cooking?"
          />
          {asked ? (
            <Pressy
              onPress={clear}
              haptics="select"
              style={styles.clear}
              accessibilityLabel="Clear"
            >
              <X size={16} color="rgba(243,245,239,0.7)" />
            </Pressy>
          ) : null}
          <Pressy
            onPress={() => ask(text)}
            haptics="none"
            scale={0.92}
            style={styles.go}
            accessibilityLabel="Show me what goes into it"
          >
            <ArrowRight size={20} color={colors.ink} strokeWidth={2.5} />
          </Pressy>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.ideas}
          contentContainerStyle={{ gap: 8, paddingRight: 18 }}
        >
          {quick.map((d) => {
            const on = answer?.title === d.name;
            return (
              <Pressy
                key={d.id}
                onPress={() => ask(d.name)}
                haptics="none"
                scale={0.95}
                style={[styles.idea, on && styles.ideaOn]}
              >
                <Small color={on ? colors.ink : colors.inkOnDark} style={styles.ideaText}>
                  {d.name}
                </Small>
              </Pressy>
            );
          })}
        </ScrollView>
      </LinearGradient>

      {asked && !answer ? (
        <Animated.View entering={FadeIn.duration(200)} style={styles.none}>
          <Small muted center>
            Nothing on today’s shelf matches that. Try the name of a dish, or of a vegetable.
          </Small>
        </Animated.View>
      ) : null}

      {answer ? <Answer key={asked} answer={answer} /> : null}
    </View>
  );
}

function Answer({ answer }) {
  const dispatch = useDispatch();
  const [adding, setAdding] = useState(false);
  const missing = answer.picks.filter((x) => x.role === 'needs' && !x.inBasket);
  const missingPaise = missing.reduce(
    (s, x) => s + Math.round(Number(x.product.pricePaise) * Number(x.product.increment || 1)),
    0,
  );

  const addAll = async () => {
    if (adding || !missing.length) return;
    setAdding(true);
    haptic.success();
    try {
      // One after another, so each lands on the basket the last one left.
      for (const x of missing) {
        const write = api.endpoints.setCartItem.initiate({
          productId: x.product.id,
          quantity: String(x.product.increment || 1),
        });
        await /** @type {any} */ (dispatch)(write).unwrap();
      }
      dispatch(
        showToast({
          title: `Added ${missing.length} for ${answer.title.toLowerCase()}`,
          tone: 'success',
        }),
      );
    } catch (e) {
      dispatch(showToast({ title: e?.message || 'Could not add everything', tone: 'error' }));
    } finally {
      setAdding(false);
    }
  };

  const enter = (i) => (lowEnd ? undefined : FadeInRight.delay(Math.min(i, 6) * 55).duration(320));

  return (
    <Animated.View entering={lowEnd ? undefined : FadeInDown.duration(280)} style={styles.answer}>
      <View style={styles.answerHead}>
        <View style={{ flex: 1 }}>
          <Small muted style={styles.for}>
            FOR
          </Small>
          <Text variant="h2" numberOfLines={1}>
            {answer.title}
          </Text>
        </View>
        {answer.total > 0 ? <Progress have={answer.have} total={answer.total} /> : null}
      </View>
      {answer.note ? (
        <Small muted style={{ marginTop: 6, paddingHorizontal: 2 }}>
          {answer.note}
        </Small>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        snapToInterval={CARD_W + 10}
        decelerationRate="fast"
        style={styles.rail}
        contentContainerStyle={styles.railContent}
      >
        {answer.picks.map((x, i) => (
          <Animated.View key={x.product.id} entering={enter(i)}>
            <Pick pick={x} />
          </Animated.View>
        ))}
      </ScrollView>

      {missing.length ? (
        <Button
          title={`Add the ${missing.length} you’re missing`}
          trailing={<Money paise={missingPaise} variant="bodyMedium" color={colors.ink} />}
          variant="accent"
          size="md"
          loading={adding}
          onPress={addAll}
          style={{ marginTop: 14 }}
        />
      ) : answer.total > 0 ? (
        <View style={styles.ready}>
          <Check size={16} color={colors.leafDeep} strokeWidth={2.6} />
          <Small color={colors.leafDeep} style={{ fontFamily: fonts.bodySemi }}>
            You have everything this dish needs.
          </Small>
        </View>
      ) : null}
    </Animated.View>
  );
}

/** "2 of 4" with a dot for each thing the dish needs. */
function Progress({ have, total }) {
  return (
    <View style={styles.progress} accessibilityLabel={`${have} of ${total} in your basket`}>
      <View style={styles.dots}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.dot, i < have && styles.dotOn]} />
        ))}
      </View>
      <Small muted style={{ fontSize: 11 }}>
        {have} of {total} in your basket
      </Small>
    </View>
  );
}

function Pick({ pick }) {
  const { product, why, badge, role } = pick;
  const lang = useSelector(selectLanguage);
  const { quantity, setQuantity } = useCartLine(product);
  const have = quantity > 0;
  return (
    <View style={[styles.card, have && styles.cardHave]}>
      <View style={styles.photo}>
        <ProductImage
          uri={product.image}
          blurhash={product.blurhash}
          tint={product.tint}
          name={product.name}
          radius={radius.md}
          recyclingKey={product.id}
        />
        <View
          style={[
            styles.tag,
            have ? styles.tagHave : role === 'needs' ? styles.tagNeeds : styles.tagBetter,
          ]}
        >
          {have ? <Check size={11} color={colors.inkOnDark} strokeWidth={3} /> : null}
          <Small
            style={styles.tagText}
            color={have || role === 'needs' ? colors.inkOnDark : colors.ink}
          >
            {have ? 'IN BASKET' : role === 'needs' ? 'NEEDED' : 'MAKES IT BETTER'}
          </Small>
        </View>
      </View>
      <Text variant="bodyMedium" numberOfLines={1} style={{ marginTop: 10 }}>
        {productLabel(product, lang)}
      </Text>
      <Text numberOfLines={1}>
        <Money paise={product.pricePaise} variant="smallMedium" />
        <Small muted>{` ${UNIT[product.unit] || ''}`}</Small>
      </Text>
      {/* The one line: why this, for this dish. Three lines of room so it is never cut mid-thought. */}
      <Small style={styles.why} numberOfLines={3}>
        {why}
      </Small>
      <View style={styles.badgeSlot}>
        {badge ? (
          <View style={styles.badge}>
            <Leaf size={11} color={colors.leafDeep} strokeWidth={2.4} />
            <Small color={colors.leafDeep} style={styles.badgeText} numberOfLines={1}>
              {badge}
            </Small>
          </View>
        ) : null}
      </View>
      <View style={{ alignSelf: 'flex-start' }}>
        <Stepper
          value={quantity}
          increment={product.increment}
          unit={product.unit}
          max={product.dailyCap}
          onChange={setQuantity}
          size="sm"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 28, padding: 18, overflow: 'hidden' },
  glow: { position: 'absolute', borderRadius: 999 },
  glowA: {
    width: 220,
    height: 220,
    top: -110,
    right: -70,
    backgroundColor: 'rgba(205,245,106,0.16)',
  },
  glowB: {
    width: 160,
    height: 160,
    bottom: -90,
    left: -50,
    backgroundColor: 'rgba(191,233,208,0.10)',
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hat: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.sprout,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  kickerText: { fontSize: 10.5, letterSpacing: 1.2, fontFamily: fonts.bodySemi },
  ask: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(243,245,239,0.22)',
    paddingLeft: 18,
    paddingRight: 5,
  },
  input: {
    flex: 1,
    height: 52,
    color: colors.inkOnDark,
    fontFamily: fonts.body,
    fontSize: 15.5,
    paddingVertical: 0,
  },
  clear: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  go: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.sprout,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ideas: { marginTop: 12, marginRight: -18 },
  idea: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(243,245,239,0.16)',
  },
  ideaOn: { backgroundColor: colors.sprout, borderColor: colors.sprout },
  ideaText: { fontSize: 12.5, fontFamily: fonts.bodySemi },
  none: { paddingVertical: 18, paddingHorizontal: 12 },
  answer: { marginTop: 16 },
  answerHead: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 2 },
  for: { fontSize: 10.5, letterSpacing: 1.2 },
  progress: { alignItems: 'flex-end', gap: 5, paddingBottom: 3 },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 14, height: 5, borderRadius: 3, backgroundColor: 'rgba(14,27,20,0.12)' },
  dotOn: { backgroundColor: colors.leaf },
  // Bleeds to the screen's edges so cards slide in from, and out past, the gutter.
  rail: { marginTop: 12, marginHorizontal: -20 },
  railContent: { gap: 10, paddingHorizontal: 20, paddingBottom: 4 },
  card: {
    width: CARD_W,
    padding: 10,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.hairline,
  },
  cardHave: { borderColor: 'rgba(30,122,76,0.45)', backgroundColor: 'rgba(240,250,244,0.96)' },
  photo: { width: '100%', aspectRatio: 1.25, borderRadius: radius.md, overflow: 'hidden' },
  tag: {
    position: 'absolute',
    left: 7,
    top: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  tagNeeds: { backgroundColor: 'rgba(11,21,16,0.86)' },
  tagBetter: { backgroundColor: colors.sprout },
  tagHave: { backgroundColor: colors.leaf },
  tagText: { fontSize: 9.5, letterSpacing: 0.7, fontFamily: fonts.bodySemi },
  why: { marginTop: 7, fontSize: 12.5, lineHeight: 17, color: colors.ink2, minHeight: 34 },
  badgeSlot: { height: 24, marginTop: 6, marginBottom: 8, justifyContent: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(191,233,208,0.6)',
  },
  badgeText: { fontSize: 10.5, flexShrink: 1 },
  ready: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(191,233,208,0.5)',
  },
});
