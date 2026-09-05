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

          <Input
            label="Avoid / allergies"
            value={p.avoid}
            onChangeText={(t) => set('avoid', t)}
            placeholder="e.g. no brinjal, lactose intolerant"
          />
          <Input
            label="Standing instructions for the planner"
            value={p.customInstructions}
            onChangeText={(t) => set('customInstructions', t)}
            placeholder="e.g. South Indian breakfasts, dinner before 8 pm, keep it under 20 minutes to cook"
            multiline
            numberOfLines={3}
            hint="The planner follows these every time, without you repeating them."
          />

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
