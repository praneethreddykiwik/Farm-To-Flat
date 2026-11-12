import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AlertTriangle, Clock, Users } from 'lucide-react-native';
import { Label, Pressy, Skeleton, Small, Text } from '../ui';
import { useGetProductKnowledgeQuery } from '../api/api';
import { colors, fonts, radius } from '../theme';

/**
 * What we know about a product, in three short tabs: what it naturally contains, its story, and a
 * dish to cook tonight.
 *
 * Every nutrition line here arrives ready-made from the server (lib/claims.js), which only produces
 * one when the food meets the Schedule I condition of the FSS claims regulations. This component
 * must never invent, reword or shorten those lines — "High in iron" and "Naturally high in iron" are
 * not the same statement in law. It renders what it is given, with the amount beside it.
 *
 * @param {{ productId: string, initialTab?: 'know'|'story'|'recipe', compact?: boolean }} props
 */
export function ProductKnowledge({ productId, initialTab, compact = false }) {
  // Asked again when a page opens if what we hold is more than a minute old. The words are edited
  // in the admin console, and an operator who has just fixed a recipe should see it when they
  // look — the cached copy still shows instantly while the fresh one arrives.
  const { data, isLoading } = useGetProductKnowledgeQuery(productId, {
    skip: !productId,
    refetchOnMountOrArgChange: 60,
  });
  const k = data?.knowledge;

  const tabs = useMemo(() => {
    /** @type {{ key: string, label: string }[]} */
    const out = [];
    if (!k) return out;
    if (k.goodToKnow?.length || k.nutrition) out.push({ key: 'know', label: 'Good to know' });
    // Any of the four, not only the story: this text is edited in the admin console now, and an
    // operator may write how to keep something without writing where it comes from.
    if (k.story || k.best || k.keep || k.careful) out.push({ key: 'story', label: 'Its story' });
    if (k.recipe) out.push({ key: 'recipe', label: 'Recipe' });
    return out;
  }, [k]);
  const [picked, setPicked] = useState(/** @type {string|null} */ (initialTab || null));
  const tab = tabs.find((t) => t.key === picked) ? picked : tabs[0]?.key;

  if (isLoading) {
    return (
      <View style={{ marginTop: 18 }}>
        <Skeleton height={44} radius={radius.pill} />
        <Skeleton height={18} width="80%" style={{ marginTop: 16 }} />
        <Skeleton height={18} width="60%" style={{ marginTop: 8 }} />
      </View>
    );
  }
  if (!k || tabs.length === 0) return null;

  return (
    <View style={{ marginTop: compact ? 6 : 18 }}>
      {tabs.length > 1 ? (
        <View style={styles.tabs} accessibilityRole="tablist">
          {tabs.map(({ key, label }) => {
            const on = key === tab;
            return (
              <Pressy
                key={key}
                onPress={() => setPicked(key)}
                haptics="select"
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[styles.tab, on && styles.tabOn]}
              >
                <Text
                  variant="smallMedium"
                  color={on ? colors.ink : colors.ink3}
                  numberOfLines={1}
                  style={{ fontFamily: on ? fonts.bodySemi : fonts.bodyMedium }}
                >
                  {label}
                </Text>
              </Pressy>
            );
          })}
        </View>
      ) : null}

      <Animated.View key={tab} entering={FadeIn.duration(220)} style={{ marginTop: 16 }}>
        {tab === 'know' ? <GoodToKnow k={k} /> : null}
        {tab === 'story' ? <Story k={k} /> : null}
        {tab === 'recipe' ? <Recipe recipe={k.recipe} /> : null}
      </Animated.View>
    </View>
  );
}

function GoodToKnow({ k }) {
  return (
    <View>
      {k.goodToKnow.map((c) => (
        <View key={c.text} style={styles.claim}>
          <View style={[styles.dot, c.level === 'low' && { backgroundColor: colors.mint }]} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium">{c.text}</Text>
            <Small muted style={{ marginTop: 1 }}>
              {c.amount}
              {c.pctDaily ? ` · ${c.pctDaily}% of an adult’s daily requirement` : ''}
            </Small>
            {c.role ? (
              <Small color={colors.ink2} style={{ marginTop: 4 }}>
                {c.role}
              </Small>
            ) : null}
          </View>
        </View>
      ))}

      {k.nutrition ? (
        <View style={[styles.table, k.goodToKnow.length ? { marginTop: 14 } : null]}>
          <Label>Per {k.nutrition.per}</Label>
          <View style={styles.cells}>
            {k.nutrition.rows.map((r) => (
              <View key={r.label} style={styles.cell}>
                <Text variant="smallMedium" style={styles.num}>
                  {r.value}
                </Text>
                <Small muted style={{ fontSize: 11.5 }}>
                  {r.label}
                </Small>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {k.footnote ? (
        <Small muted style={styles.footnote}>
          {k.footnote}
          {k.nutrition?.source ? ` Source: ${k.nutrition.source}.` : ''}
        </Small>
      ) : null}
    </View>
  );
}

function Story({ k }) {
  return (
    <View>
      {k.story ? (
        <Text variant="body" color={colors.ink2} style={styles.story}>
          {k.story}
        </Text>
      ) : null}
      {k.best ? (
        <View style={styles.fact}>
          <Label>At its best</Label>
          <Text variant="smallMedium" style={{ marginTop: 3 }}>
            {k.best}
          </Text>
        </View>
      ) : null}
      {k.keep ? (
        <View style={styles.fact}>
          <Label>How to keep it</Label>
          <Small color={colors.ink2} style={{ marginTop: 3 }}>
            {k.keep}
          </Small>
        </View>
      ) : null}
      {k.careful ? (
        <View style={styles.careful}>
          <AlertTriangle size={15} color={colors.amber} />
          <Small color={colors.ink2} style={{ flex: 1 }}>
            {k.careful}
          </Small>
        </View>
      ) : null}
    </View>
  );
}

function Recipe({ recipe }) {
  return (
    <View>
      <Text style={styles.recipeName}>{recipe.name}</Text>
      {/* Time and servings are optional in the admin editor; a recipe without them must not read
          "null min · Serves null". */}
      {recipe.mins || recipe.serves ? (
        <View style={styles.meta}>
          {recipe.mins ? (
            <View style={styles.metaItem}>
              <Clock size={14} color={colors.ink3} />
              <Small muted>{recipe.mins} min</Small>
            </View>
          ) : null}
          {recipe.serves ? (
            <View style={styles.metaItem}>
              <Users size={14} color={colors.ink3} />
              <Small muted>Serves {recipe.serves}</Small>
            </View>
          ) : null}
        </View>
      ) : null}

      {recipe.needs?.length ? (
        <>
          <Label style={{ marginTop: 16 }}>You’ll need</Label>
          <View style={{ marginTop: 6, gap: 4 }}>
            {/* Keyed by position: two lines may say the same thing ("salt", then "salt" again). */}
            {recipe.needs.map((n, i) => (
              <View key={`${i}-${n}`} style={styles.need}>
                <View style={styles.bullet} />
                <Small color={colors.ink2} style={{ flex: 1 }}>
                  {n}
                </Small>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <Label style={{ marginTop: 16 }}>How</Label>
      <View style={{ marginTop: 8, gap: 10 }}>
        {(recipe.steps || []).map((s, i) => (
          <View key={`${i}-${s}`} style={styles.step}>
            <View style={styles.stepNum}>
              <Text variant="smallMedium" color={colors.leafDeep} style={styles.num}>
                {i + 1}
              </Text>
            </View>
            <Text variant="body" color={colors.ink2} style={{ flex: 1 }}>
              {s}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.canvasDeep,
    borderRadius: radius.pill,
    padding: 4,
  },
  tab: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: 6,
  },
  tabOn: {
    backgroundColor: colors.white,
    shadowColor: colors.ink,
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  claim: { flexDirection: 'row', gap: 12, paddingVertical: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.sproutDeep, marginTop: 6 },
  table: { backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: radius.md, padding: 12 },
  cells: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, rowGap: 10 },
  cell: { width: '33.33%' },
  num: { fontVariant: ['tabular-nums'] },
  footnote: { marginTop: 12, fontSize: 11.5, lineHeight: 16 },
  story: { fontFamily: fonts.displayItalic, fontSize: 17, lineHeight: 25 },
  fact: { marginTop: 14 },
  careful: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.amberSoft,
  },
  recipeName: {
    fontFamily: fonts.display,
    fontSize: 22,
    lineHeight: 26,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  meta: { flexDirection: 'row', gap: 16, marginTop: 6 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  need: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bullet: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.ink3, marginTop: 7 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.leafSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
