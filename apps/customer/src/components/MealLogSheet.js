import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { Camera, Check, Images, Minus, Plus, Search, Utensils, X } from 'lucide-react-native';
import { Button, Pressy, Sheet, Small, Text } from '../ui';
import { useMealFoodsQuery } from '../api/api';
import { colors, fonts, radius } from '../theme';

/**
 * "Log your food" — the one sheet behind every "+" on the tracker.
 *
 * Four ways in, fastest first: photograph the plate, say you had the planned meal, pick foods from
 * the list, or mark the meal skipped. The list is searched by the names people actually use at home
 * — pappu, perugu, annam — as well as the English ones, and portions are counted in rotis and
 * katoris, because nobody weighs their dal.
 *
 * `ref.current.open(slot)` presents it for a meal.
 *
 * @param {{
 *   labelFor: (slot: string) => string,
 *   plannedFor: (slot: string) => { name: string, kcal: number } | null,
 *   busy: boolean,
 *   onPhoto: (slot: string, source: 'camera'|'library') => void,
 *   onPlanned: (slot: string) => void,
 *   onPicks: (slot: string, picks: { foodId: string, servings: number }[]) => void,
 *   onSkip: (slot: string) => void,
 * }} props
 */
export const MealLogSheet = /** @type {any} */ (
  forwardRef(function MealLogSheet(
    /** @type {any} */ { labelFor, plannedFor, busy, onPhoto, onPlanned, onPicks, onSkip },
    ref,
  ) {
    const sheet = useRef(null);
    const [slot, setSlot] = useState(/** @type {string|null} */ (null));
    const [mode, setMode] = useState(/** @type {'menu'|'search'} */ ('menu'));
    const [q, setQ] = useState('');
    const [picks, setPicks] = useState(/** @type {Record<string, number>} */ ({}));

    useImperativeHandle(ref, () => ({
      open(s) {
        setSlot(s);
        setMode('menu');
        setQ('');
        setPicks({});
        sheet.current?.present();
      },
      close() {
        sheet.current?.dismiss();
      },
    }));

    const foods = useMealFoodsQuery(q.trim(), { skip: mode !== 'search' });
    const list = foods.data?.foods || [];
    const planned = slot ? plannedFor(slot) : null;
    const chosen = useMemo(() => Object.entries(picks).filter(([, n]) => n > 0), [picks]);
    const pickedKcal = chosen.reduce((sum, [id, n]) => {
      const f = list.find((x) => x.id === id);
      return sum + (f ? f.serving.kcal * n : 0);
    }, 0);

    const bump = (id, by) =>
      setPicks((p) => ({ ...p, [id]: Math.max(0, Math.min(10, (p[id] || 0) + by)) }));

    return (
      <Sheet
        ref={sheet}
        title={slot ? `Log ${labelFor(slot).toLowerCase()}` : 'Log your food'}
        subtitle={mode === 'menu' ? 'A photo is the quickest. We do the counting.' : undefined}
        snapPoints={[mode === 'search' ? '86%' : '62%']}
        scroll
        keyboard
      >
        {mode === 'menu' ? (
          <View style={{ gap: 10 }}>
            <Option
              icon={<Camera size={22} color={colors.inkOnDark} />}
              tone="dark"
              title="Snap your plate"
              sub="One photo, taken from above. Every dish on the plate is counted."
              disabled={busy}
              onPress={() => slot && onPhoto(slot, 'camera')}
            />
            <Option
              icon={<Images size={20} color={colors.leafDeep} />}
              title="Choose a photo"
              sub="Already took one? Pick it from your gallery."
              disabled={busy}
              onPress={() => slot && onPhoto(slot, 'library')}
            />
            {planned ? (
              <Option
                icon={<Check size={20} color={colors.leafDeep} />}
                title="I had my planned meal"
                sub={`${planned.name}${planned.kcal ? ` · about ${Math.round(planned.kcal)} kcal` : ''}`}
                disabled={busy}
                onPress={() => slot && onPlanned(slot)}
              />
            ) : null}
            <Option
              icon={<Search size={20} color={colors.leafDeep} />}
              title="Search food"
              sub="Roti, annam, pappu, perugu… counted in rotis and katoris."
              disabled={busy}
              onPress={() => setMode('search')}
            />
            <Option
              icon={<X size={20} color={colors.ink3} />}
              title="I skipped this meal"
              sub="That counts as an answer too."
              disabled={busy}
              onPress={() => slot && onSkip(slot)}
            />
            {busy ? (
              <View style={styles.busy}>
                <ActivityIndicator color={colors.leaf} />
                <Small muted>Reading your plate…</Small>
              </View>
            ) : null}
          </View>
        ) : (
          <View>
            <View style={styles.search}>
              <Search size={18} color={colors.ink3} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Search — roti, pappu, sambar…"
                placeholderTextColor={colors.ink3}
                autoFocus
                autoCorrect={false}
                style={styles.input}
                accessibilityLabel="Search food"
              />
            </View>

            {foods.isLoading ? (
              <ActivityIndicator color={colors.leaf} style={{ marginTop: 24 }} />
            ) : list.length === 0 ? (
              <Small muted center style={{ marginTop: 24 }}>
                Nothing by that name yet. Try the photo instead — it reads dishes we have no entry
                for.
              </Small>
            ) : (
              <View style={{ marginTop: 10 }}>
                {list.map((f) => {
                  const n = picks[f.id] || 0;
                  return (
                    <View key={f.id} style={styles.food}>
                      <View style={styles.foodIcon}>
                        <Utensils size={16} color={colors.leafDeep} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyMedium" numberOfLines={1}>
                          {f.name}
                        </Text>
                        <Small muted numberOfLines={1}>
                          1 {f.serving.unit} · {f.serving.grams} g · {f.serving.kcal} kcal
                        </Small>
                      </View>
                      {n > 0 ? (
                        <View style={styles.stepper}>
                          <Pressy
                            onPress={() => bump(f.id, -0.5)}
                            haptics="select"
                            accessibilityLabel={`Less ${f.name}`}
                            style={styles.stepBtn}
                          >
                            <Minus size={16} color={colors.ink} />
                          </Pressy>
                          <Text variant="smallMedium" style={styles.count}>
                            {n}
                          </Text>
                          <Pressy
                            onPress={() => bump(f.id, 0.5)}
                            haptics="select"
                            accessibilityLabel={`More ${f.name}`}
                            style={styles.stepBtn}
                          >
                            <Plus size={16} color={colors.ink} />
                          </Pressy>
                        </View>
                      ) : (
                        <Pressy
                          onPress={() => bump(f.id, 1)}
                          haptics="select"
                          accessibilityLabel={`Add ${f.name}`}
                          style={styles.add}
                        >
                          <Plus size={18} color={colors.inkOnDark} />
                        </Pressy>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            <Button
              title={
                chosen.length
                  ? `Add ${chosen.length} · about ${Math.round(pickedKcal)} kcal`
                  : 'Pick what you ate'
              }
              disabled={!chosen.length || busy}
              loading={busy}
              style={{ marginTop: 16 }}
              onPress={() =>
                slot &&
                onPicks(
                  slot,
                  chosen.map(([foodId, servings]) => ({ foodId, servings })),
                )
              }
            />
            <Small muted center style={{ marginTop: 10, fontSize: 11.5 }}>
              Typical home portions. Reference values, not a measurement of your plate.
            </Small>
          </View>
        )}
      </Sheet>
    );
  })
);

/** @param {{ icon: any, title: string, sub: string, onPress: () => void, disabled?: boolean, tone?: 'dark' }} props */
function Option({ icon, title, sub, onPress, disabled, tone }) {
  const dark = tone === 'dark';
  return (
    <Pressy
      onPress={onPress}
      disabled={disabled}
      haptics="soft"
      scale={0.985}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      style={[styles.option, dark && styles.optionDark, disabled && { opacity: 0.5 }]}
    >
      <View style={[styles.optIcon, dark && { backgroundColor: 'rgba(255,255,255,0.14)' }]}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyMedium" color={dark ? colors.inkOnDark : colors.ink}>
          {title}
        </Text>
        <Small color={dark ? 'rgba(243,245,239,0.72)' : colors.ink3} style={{ marginTop: 1 }}>
          {sub}
        </Small>
      </View>
    </Pressy>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    minHeight: 68,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  optionDark: { backgroundColor: colors.night, borderColor: colors.night },
  optIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.leafSoft,
  },
  busy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 50,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 16, color: colors.ink, paddingVertical: 0 },
  food: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  foodIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.leafSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.leaf,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.canvasDeep,
    borderRadius: radius.pill,
  },
  stepBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  count: { minWidth: 26, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
