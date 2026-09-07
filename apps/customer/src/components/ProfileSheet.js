import React, { forwardRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { Button, Chip, Input, Label, Sheet, Small } from '../ui';
import { colors } from '../theme';
import {
  profileUpdated,
  providerSet,
  selectProfile,
  selectProvider,
} from '../features/plan/planSlice';
import { dailyTargets } from '../lib/nutrition';
import { env } from '../lib/env';

const GOALS = [
  ['lose', 'Lose weight'],
  ['maintain', 'Stay fit'],
  ['muscle', 'Build muscle'],
  ['gain', 'Gain weight'],
];
const ACTIVITY = [
  ['sedentary', 'Desk'],
  ['moderate', 'Moderate'],
  ['active', 'Gym / active'],
];
const DIETS = ['vegetarian', 'vegetarian + eggs', 'non-vegetarian', 'vegan'];
// Common allergens / dislikes to exclude with one tap. The planner drops these from items AND steps.
const AVOID_OPTIONS = [
  'Eggs',
  'Chicken',
  'Mutton',
  'Prawns',
  'Dairy',
  'Peanuts',
  'Gluten',
  'Soy',
  'Onion',
  'Garlic',
  'Brinjal',
  'Okra',
  'Mushroom',
];
// One-tap meal-timing / cooking rules appended to the standing instructions.
const INSTRUCTION_PRESETS = [
  'No acidic foods at lunch',
  'Light dinner',
  'High-protein breakfast',
  'Dinner before 8 pm',
  'Under 20 min to cook',
];

/**
 * The customer's standing profile and instructions. Everything here is sent with every plan request,
 * so the planner follows it without being asked again ("customization the AI keeps").
 */
export const ProfileSheet = /** @type {any} */ (
  forwardRef(function ProfileSheet(/** @type {any} */ { onSaved }, ref) {
    const dispatch = useDispatch();
    const saved = useSelector(selectProfile);
    const provider = useSelector(selectProvider);
    const [p, setP] = useState(saved);
    const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
    const isExcluded = (n) => (p.excludes || []).includes(n);
    const toggleExclude = (n) =>
      setP((x) => {
        const cur = x.excludes || [];
        return { ...x, excludes: cur.includes(n) ? cur.filter((v) => v !== n) : [...cur, n] };
      });
    const addInstruction = (text) =>
      setP((x) => {
        const cur = (x.customInstructions || '').trim();
        if (cur.toLowerCase().includes(text.toLowerCase())) return x;
        return { ...x, customInstructions: cur ? `${cur}. ${text}` : text };
      });
    const isNonVegDiet = p.diet === 'non-vegetarian';
    const targets = dailyTargets(p);
    const both = !!env.groqKey && !!env.geminiKey;

    const save = () => {
      dispatch(profileUpdated(p));
      onSaved?.();
      /** @type {any} */ (ref)?.current?.dismiss();
    };

    return (
      <Sheet
        ref={ref}
        title="About you"
        subtitle="Used to size every plan. Stays on this phone."
        scroll
        snapPoints={['88%']}
        keyboard
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 16, paddingBottom: 24 }}
        >
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Input
              label="Age"
              value={String(p.age || '')}
              onChangeText={(t) => set('age', t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder="24"
              style={{ flex: 1 }}
            />
            <Input
              label="Weight (kg)"
              value={String(p.weightKg || '')}
              onChangeText={(t) => set('weightKg', t.replace(/[^\d.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="70"
              style={{ flex: 1 }}
            />
            <Input
              label="Height (cm)"
              value={String(p.heightCm || '')}
              onChangeText={(t) => set('heightCm', t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder="172"
              style={{ flex: 1 }}
            />
          </View>

          <View>
            <Label style={{ marginBottom: 8 }}>Sex</Label>
            <View style={styles.chips}>
              {[
                ['male', 'Male'],
                ['female', 'Female'],
              ].map(([k, l]) => (
                <Chip key={k} label={l} selected={p.sex === k} onPress={() => set('sex', k)} />
              ))}
            </View>
          </View>

          <View>
            <Label style={{ marginBottom: 8 }}>Goal</Label>
            <View style={styles.chips}>
              {GOALS.map(([k, l]) => (
                <Chip key={k} label={l} selected={p.goal === k} onPress={() => set('goal', k)} />
              ))}
            </View>
          </View>

          <View>
            <Label style={{ marginBottom: 8 }}>Activity</Label>
            <View style={styles.chips}>
              {ACTIVITY.map(([k, l]) => (
                <Chip
                  key={k}
                  label={l}
                  selected={p.activity === k}
                  onPress={() => set('activity', k)}
                />
              ))}
            </View>
          </View>

          <View>
            <Label style={{ marginBottom: 8 }}>Diet</Label>
            <View style={styles.chips}>
              {DIETS.map((d) => (
                <Chip key={d} label={d} selected={p.diet === d} onPress={() => set('diet', d)} />
              ))}
            </View>
          </View>

          <View>
            <Label style={{ marginBottom: 8 }}>Meals a day</Label>
            <View style={styles.chips}>
              {[2, 3, 4].map((n) => (
                <Chip
                  key={n}
                  label={`${n} meals`}
                  selected={Number(p.mealsPerDay) === n}
                  onPress={() => set('mealsPerDay', n)}
                />
              ))}
            </View>
          </View>

          <View>
            <Label style={{ marginBottom: 8 }}>Cheat days a week</Label>
            <View style={styles.chips}>
              {[0, 1, 2, 3].map((n) => (
                <Chip
                  key={n}
                  label={n === 0 ? 'None' : `${n}`}
                  selected={Number(p.cheatDaysPerWeek ?? 0) === n}
                  onPress={() => set('cheatDaysPerWeek', n)}
                />
              ))}
            </View>
            <Small muted style={{ marginTop: 6 }}>
              Flexible eating — one relaxed, tasty meal on each cheat day (week & month plans).
            </Small>
          </View>

          <View>
            <Label style={{ marginBottom: 8 }}>Cooking style</Label>
            <View style={styles.chips}>
              {[
                ['south', 'South Indian'],
                ['north', 'North Indian'],
                ['both', 'Both'],
              ].map(([k, l]) => (
                <Chip
                  key={k}
                  label={l}
                  selected={(p.region || 'south') === k}
                  onPress={() => set('region', k)}
                />
              ))}
            </View>
          </View>

          {isNonVegDiet ? (
            <View>
              <Label style={{ marginBottom: 8 }}>Non-veg days a week</Label>
              <View style={styles.chips}>
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <Chip
                    key={n}
                    label={n === 0 ? 'None' : `${n}`}
                    selected={Number(p.nonVegDaysPerWeek ?? 4) === n}
                    onPress={() => set('nonVegDaysPerWeek', n)}
                  />
                ))}
              </View>
              <Small muted style={{ marginTop: 6 }}>
                The rest of the week is planned vegetarian.
              </Small>
            </View>
          ) : null}

          <View>
            <Label style={{ marginBottom: 8 }}>Avoid / allergies</Label>
            <View style={styles.chips}>
              {AVOID_OPTIONS.map((a) => (
                <Chip key={a} label={a} selected={isExcluded(a)} onPress={() => toggleExclude(a)} />
              ))}
            </View>
            <Small muted style={{ marginTop: 6 }}>
              Tap anything you can’t eat — the planner never uses it, in a dish or its steps.
            </Small>
            <Input
              value={p.avoid}
              onChangeText={(t) => set('avoid', t)}
              placeholder="Anything else? e.g. lactose intolerant, no seafood"
              style={{ marginTop: 10 }}
            />
          </View>

          <View>
            <Label style={{ marginBottom: 8 }}>Standing instructions</Label>
            <View style={styles.chips}>
              {INSTRUCTION_PRESETS.map((t) => (
                <Chip key={t} label={t} onPress={() => addInstruction(t)} />
              ))}
            </View>
            <Input
              value={p.customInstructions}
              onChangeText={(t) => set('customInstructions', t)}
              placeholder="e.g. South Indian breakfasts, no acidic foods at lunch"
              multiline
              numberOfLines={3}
              style={{ marginTop: 10 }}
              hint="Tap a chip or type your own. The planner follows these every time."
            />
          </View>

          {both ? (
            <View>
              <Label style={{ marginBottom: 8 }}>Planner engine</Label>
              <View style={styles.chips}>
                <Chip
                  label="Groq"
                  selected={(provider || env.aiProvider) === 'groq'}
                  onPress={() => dispatch(providerSet('groq'))}
                />
                <Chip
                  label="Gemini"
                  selected={(provider || env.aiProvider) === 'gemini'}
                  onPress={() => dispatch(providerSet('gemini'))}
                />
              </View>
            </View>
          ) : null}

          <View style={styles.targets}>
            <Small color={colors.ink2}>
              Daily target from these details:{' '}
              <Small style={{ fontFamily: 'IBMPlexMono_500Medium' }}>
                {targets.kcal} kcal · {targets.protein} g protein
              </Small>
            </Small>
            <Small muted style={{ fontSize: 11, marginTop: 4 }}>
              {targets.method}
            </Small>
          </View>

          <Button title="Save" onPress={save} />
        </ScrollView>
      </Sheet>
    );
  })
);

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  targets: { backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 14, padding: 12 },
});
