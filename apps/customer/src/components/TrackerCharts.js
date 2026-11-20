import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Camera, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Chip, Glass, Mono, Pressy, Small, Text } from '../ui';
import { addDaysISO, dayNumber, todayISO, weekdayOf } from '../lib/dates';
import { colors, fonts, radius } from '../theme';

/*
 * The calorie tracker's comparisons (21 Nov 2026):
 *   WeekStrip   — pick a day; dots say what the day holds (logged / planned only)
 *   PlanVsPlate — the chosen day: target, the calendar's plan, everything logged, and the PHOTO
 *                 ESTIMATE on its own bar with its range, so the least certain number is never
 *                 mixed into the others
 *   WeekChart   — the week as columns: plan vs eaten per day against the target line, calories or
 *                 protein, with the photo estimate marked on each day it exists
 *
 * Nothing here turns red for going over. Over or under is shown as a plain number.
 */

const n0 = (v) => Math.round(Number(v) || 0).toLocaleString('en-IN');
const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Monday of the week that holds `iso`. */
export const mondayOf = (iso) => addDaysISO(iso, -((weekdayOf(iso) + 6) % 7));

/**
 * @param {{ date: string, onSelect: (d: string) => void, days?: any[], plannedOn?: (d: string) => number }} props
 */
export function WeekStrip({ date, onSelect, days = [], plannedOn }) {
  const start = mondayOf(date);
  const week = Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
  const today = todayISO();
  const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
  return (
    <Glass radius={radius.lg} innerStyle={styles.strip} style={{ marginTop: 16 }}>
      <Pressy
        onPress={() => onSelect(addDaysISO(date, -7))}
        haptics="select"
        accessibilityLabel="Previous week"
        style={styles.stripNav}
      >
        <ChevronLeft size={18} color={colors.ink2} />
      </Pressy>
      {week.map((d) => {
        const active = d === date;
        const logged = (byDate[d]?.mealsLogged || 0) > 0;
        const planned = (plannedOn?.(d) || byDate[d]?.planned?.kcal || 0) > 0;
        return (
          <Pressy
            key={d}
            onPress={() => onSelect(d)}
            haptics="select"
            style={{ flex: 1 }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${d}${logged ? ', meals logged' : planned ? ', meals planned' : ''}`}
          >
            <View style={[styles.day, active && styles.dayActive]}>
              <Small
                style={{ fontSize: 10 }}
                color={active ? 'rgba(243,245,239,0.7)' : colors.ink3}
              >
                {LETTERS[weekdayOf(d)]}
              </Small>
              <Text
                style={[
                  styles.dayNum,
                  {
                    color: active ? colors.sprout : d === today ? colors.leafDeep : colors.ink,
                  },
                ]}
              >
                {dayNumber(d)}
              </Text>
              <View
                style={[
                  styles.dayDot,
                  logged
                    ? { backgroundColor: active ? colors.sprout : colors.leaf }
                    : planned
                      ? { borderWidth: 1.5, borderColor: active ? colors.sprout : colors.ink3 }
                      : { backgroundColor: 'transparent' },
                ]}
              />
            </View>
          </Pressy>
        );
      })}
      <Pressy
        onPress={() => onSelect(addDaysISO(date, 7))}
        haptics="select"
        accessibilityLabel="Next week"
        style={styles.stripNav}
      >
        <ChevronRight size={18} color={colors.ink2} />
      </Pressy>
    </Glass>
  );
}

/**
 * One bar of the comparison. `low`/`high` draw the range band behind the value.
 * @param {{ label: string, hint?: string, value: number|null, max: number, color: string, low?: number, high?: number, empty?: string, icon?: any }} props
 */
function Row({ label, hint, value, max, color, low, high, empty, icon }) {
  /** @param {any} v @returns {any} a percentage width */
  const pct = (v) => `${Math.max(0, Math.min(100, (Number(v) / (max || 1)) * 100))}%`;
  const has = value != null && value > 0;
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.rowHead}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          {icon}
          <Text variant="smallMedium">{label}</Text>
          {hint ? <Small muted>· {hint}</Small> : null}
        </View>
        <Mono style={{ fontSize: 12 }} color={has ? colors.ink : colors.ink3}>
          {has ? `${n0(value)} kcal` : '—'}
        </Mono>
      </View>
      <View style={styles.track}>
        {has && low != null && high != null && high > low ? (
          <View
            style={[
              styles.band,
              {
                left: pct(low),
                width: /** @type {any} */ (
                  `${Math.max(0, Math.min(100, ((high - low) / (max || 1)) * 100))}%`
                ),
                backgroundColor: color,
                opacity: 0.22,
              },
            ]}
          />
        ) : null}
        {has ? <View style={[styles.fill, { width: pct(value), backgroundColor: color }]} /> : null}
      </View>
      {!has && empty ? (
        <Small muted style={{ fontSize: 12 }}>
          {empty}
        </Small>
      ) : null}
      {has && low != null && high != null && high - low >= 40 ? (
        <Small muted style={{ fontSize: 12 }}>
          likely {n0(low)}–{n0(high)} kcal
        </Small>
      ) : null}
    </View>
  );
}

/**
 * The chosen day: target, plan, everything logged, and the photo estimate on its own bar.
 * @param {{ target: number, planned: number, eaten: { kcal: number, kcalLow?: number, kcalHigh?: number, protein?: number, carbs?: number, fat?: number }, photo?: { kcal: number, kcalLow: number, kcalHigh: number, meals: number }, plannedMacros?: { protein?: number, carbs?: number, fat?: number }|null, macroTargets?: { protein: number, carbs: number, fat: number }, future?: boolean }} props
 */
export function PlanVsPlate({
  target,
  planned,
  eaten,
  photo,
  plannedMacros,
  macroTargets,
  future,
}) {
  const max =
    Math.max(target || 0, planned || 0, eaten?.kcalHigh || eaten?.kcal || 0, photo?.kcalHigh || 0) *
      1.05 || 1;
  const eatenKcal = eaten?.kcal || 0;
  const vsPlan = planned > 0 && eatenKcal > 0 ? Math.round((eatenKcal / planned) * 100) : null;
  const vsTarget = target > 0 && eatenKcal > 0 ? Math.round((eatenKcal / target) * 100) : null;
  return (
    <Glass radius={radius.lg} innerStyle={styles.card} style={{ marginTop: 14 }}>
      <Text variant="bodyMedium">Plan vs plate</Text>
      <Small muted style={{ marginTop: 2 }}>
        {future
          ? 'This day hasn’t happened yet — here is what the calendar has planned.'
          : vsPlan != null
            ? `${vsPlan}% of the plan · ${vsTarget}% of your target so far`
            : vsTarget != null
              ? `${vsTarget}% of your target so far`
              : 'Log a meal to compare it with your plan.'}
      </Small>
      <View style={{ gap: 14, marginTop: 14 }}>
        <Row label="Daily target" value={target} max={max} color={colors.ink3} />
        <Row
          label="Planned"
          hint="your calendar"
          value={planned || null}
          max={max}
          color={colors.sproutDeep}
          empty="Nothing on the calendar for this day."
        />
        {!future ? (
          <Row
            label="Eaten"
            hint="everything logged"
            value={eatenKcal || null}
            low={eaten?.kcalLow}
            high={eaten?.kcalHigh}
            max={max}
            color={colors.leaf}
            empty="Nothing logged yet."
          />
        ) : null}
        {!future ? (
          <Row
            label="From photos"
            hint={photo?.meals ? `${photo.meals} meal${photo.meals > 1 ? 's' : ''}` : undefined}
            icon={<Camera size={14} color={colors.amber} />}
            value={photo?.kcal || null}
            low={photo?.kcalLow}
            high={photo?.kcalHigh}
            max={max}
            color={colors.amber}
            empty="No photos yet — snap a plate to see what the camera reads."
          />
        ) : null}
      </View>
      {macroTargets && !future ? (
        <View style={styles.macroTable}>
          <View style={styles.macroRow}>
            <Small muted style={{ flex: 1.2 }} />
            {['Eaten', 'Planned', 'Target'].map((h) => (
              <Small key={h} muted style={styles.macroCell}>
                {h}
              </Small>
            ))}
          </View>
          {[
            ['Protein', 'protein'],
            ['Carbs', 'carbs'],
            ['Fat', 'fat'],
          ].map(([label, k]) => (
            <View key={k} style={styles.macroRow}>
              <Text variant="small" style={{ flex: 1.2 }}>
                {label}
              </Text>
              <Mono style={styles.macroCell}>{n0(eaten?.[k])} g</Mono>
              <Mono style={styles.macroCell} color={colors.ink2}>
                {plannedMacros?.[k] != null ? `${n0(plannedMacros[k])} g` : '—'}
              </Mono>
              <Mono style={styles.macroCell} color={colors.ink3}>
                {n0(macroTargets[k])} g
              </Mono>
            </View>
          ))}
        </View>
      ) : null}
    </Glass>
  );
}

/**
 * The week as columns: plan (pale) vs eaten (green) per day, the target as a line, and an amber
 * tick where the photos put the day. Tap a column to open that day.
 * @param {{ days: any[], date: string, onSelect: (d: string) => void, targets: { kcal: number, protein: number }, plannedOn?: (d: string) => { kcal: number, protein: number }|null }} props
 */
export function WeekChart({ days, date, onSelect, targets, plannedOn }) {
  const [metric, setMetric] = useState(/** @type {'kcal'|'protein'} */ ('kcal'));
  const unit = metric === 'kcal' ? 'kcal' : 'g';
  const target = metric === 'kcal' ? targets.kcal : targets.protein;
  const rows = days.map((d) => {
    const local = plannedOn?.(d.date);
    const plan = local?.[metric] || d.planned?.[metric] || 0;
    const eaten = d.eaten?.[metric] || 0;
    const photo = metric === 'kcal' ? d.photo?.kcal || 0 : 0;
    return { date: d.date, plan, eaten, photo, logged: (d.mealsLogged || 0) > 0 };
  });
  const max = Math.max(target * 1.25, ...rows.map((r) => Math.max(r.plan, r.eaten, r.photo)), 1);
  const H = 132;
  const y = (v) => (Math.min(v, max) / max) * H;
  const loggedDays = rows.filter((r) => r.logged);
  const avg = (f) =>
    loggedDays.length ? loggedDays.reduce((a, r) => a + r[f], 0) / loggedDays.length : 0;
  const onTarget = loggedDays.filter((r) => Math.abs(r.eaten - target) <= target * 0.1).length;
  const today = todayISO();

  return (
    <Glass radius={radius.lg} innerStyle={styles.card} style={{ marginTop: 14 }}>
      <View style={styles.rowHead}>
        <Text variant="bodyMedium" style={{ flex: 1 }}>
          This week
        </Text>
        <Chip label="Calories" selected={metric === 'kcal'} onPress={() => setMetric('kcal')} />
        <View style={{ width: 6 }} />
        <Chip
          label="Protein"
          selected={metric === 'protein'}
          onPress={() => setMetric('protein')}
        />
      </View>
      <Small muted style={{ marginTop: 6 }}>
        {loggedDays.length
          ? `Logged ${loggedDays.length} of 7 days · eaten ${n0(avg('eaten'))} ${unit}/day on average against ${n0(target)} ${unit} · ${onTarget} day${onTarget === 1 ? '' : 's'} within 10% of target`
          : 'No meals logged this week yet.'}
      </Small>

      <View style={[styles.chart, { height: H + 22 }]}>
        <View style={[styles.targetLine, { bottom: 22 + y(target) }]}>
          <Mono style={styles.targetLabel} color={colors.ink3}>
            {n0(target)}
          </Mono>
        </View>
        {rows.map((r) => {
          const active = r.date === date;
          return (
            <Pressy
              key={r.date}
              onPress={() => onSelect(r.date)}
              haptics="select"
              style={styles.col}
              accessibilityRole="button"
              accessibilityLabel={`${r.date}: planned ${n0(r.plan)} ${unit}, eaten ${n0(r.eaten)} ${unit}${r.photo ? `, photos ${n0(r.photo)} kcal` : ''}`}
            >
              <View style={[styles.bars, { height: H }]}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: Math.max(r.plan ? 3 : 0, y(r.plan)),
                      backgroundColor: colors.leafSoft,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.bar,
                    {
                      height: Math.max(r.eaten ? 3 : 0, y(r.eaten)),
                      backgroundColor: active ? colors.leafDeep : colors.leaf,
                    },
                  ]}
                />
                {r.photo ? <View style={[styles.photoTick, { bottom: y(r.photo) - 1.5 }]} /> : null}
              </View>
              <Small
                style={{
                  fontSize: 10,
                  marginTop: 6,
                  fontFamily: active ? fonts.bodyMedium : undefined,
                }}
                color={active ? colors.ink : r.date === today ? colors.leafDeep : colors.ink3}
              >
                {LETTERS[weekdayOf(r.date)]}
              </Small>
            </Pressy>
          );
        })}
      </View>

      <View style={styles.legend}>
        <Legend color={colors.leafSoft} label="Planned" />
        <Legend color={colors.leaf} label="Eaten" />
        {metric === 'kcal' ? <Legend color={colors.amber} label="Photos" thin /> : null}
        <Legend color={colors.ink3} label="Target" thin />
      </View>
    </Glass>
  );
}

/** @param {{ color: string, label: string, thin?: boolean }} props */
function Legend({ color, label, thin }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View
        style={{
          width: 12,
          height: thin ? 3 : 10,
          borderRadius: thin ? 2 : 3,
          backgroundColor: color,
        }}
      />
      <Small muted style={{ fontSize: 11 }}>
        {label}
      </Small>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4 },
  stripNav: { width: 28, height: 44, alignItems: 'center', justifyContent: 'center' },
  day: { alignItems: 'center', paddingVertical: 6, borderRadius: radius.md, gap: 2 },
  dayActive: { backgroundColor: colors.night },
  dayNum: { fontFamily: fonts.display, fontSize: 17 },
  dayDot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
  card: { padding: 16 },
  rowHead: { flexDirection: 'row', alignItems: 'center' },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.canvasDeep,
    overflow: 'hidden',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 5 },
  band: { position: 'absolute', top: 0, bottom: 0, borderRadius: 5 },
  macroTable: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(14,27,20,0.12)',
    gap: 6,
  },
  macroRow: { flexDirection: 'row', alignItems: 'center' },
  macroCell: { flex: 1, textAlign: 'right', fontSize: 12 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 14 },
  col: { flex: 1, alignItems: 'center' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  bar: { width: 10, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  photoTick: {
    position: 'absolute',
    left: -3,
    right: -3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.amber,
  },
  targetLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.ink3,
  },
  targetLabel: { position: 'absolute', right: 0, top: -16, fontSize: 10 },
  legend: { flexDirection: 'row', gap: 14, marginTop: 12, flexWrap: 'wrap' },
});
