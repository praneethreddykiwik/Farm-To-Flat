/**
 * How many people use the meal planner, and does asking "have you tried it?" work?
 * (Discussion on Fooducia Strategies, 22 Nov 2026.) People are counted, never listed.
 */
import { listEvents } from './events.js';
import { addDaysISO, istInstantMs } from './dates.js';
import { istDate } from './insights.js';

const STEPS = [
  ['planner_nudge_shown', 'Saw “Have you tried it?”'],
  ['planner_nudge_tapped', 'Tapped Try it'],
  ['planner_opened', 'Opened the planner'],
  ['plan_generated', 'Made a plan'],
  ['plan_scheduled', 'Put a plan on the calendar'],
  ['meal_logged', 'Logged a meal'],
];

/** An event's person. One whose account was erased is a count with no account behind it. */
const people = (list) => new Set(list.filter((e) => e.customerId).map((e) => e.customerId));

function countsFor({ from, to }) {
  const events = listEvents({
    fromMs: istInstantMs(from, '00:00'),
    toMs: istInstantMs(addDaysISO(to, 1), '00:00') - 1,
  });
  const of = (name) => events.filter((e) => e.name === name);
  return {
    events,
    steps: STEPS.map(([key, label]) => ({
      key,
      label,
      people: people(of(key)).size,
      times: of(key).length,
    })),
    dismissed: of('planner_nudge_dismissed').length,
  };
}

const daysBetween = (from, to) =>
  Math.round((istInstantMs(to, '00:00') - istInstantMs(from, '00:00')) / 864e5) + 1;

export function plannerUsage({ from, to }) {
  const now = countsFor({ from, to });
  const span = daysBetween(from, to);
  const before = countsFor({ from: addDaysISO(from, -span), to: addDaysISO(from, -1) });
  const shown = people(now.events.filter((e) => e.name === 'planner_nudge_shown'));
  const tapped = people(now.events.filter((e) => e.name === 'planner_nudge_tapped'));
  const made = people(now.events.filter((e) => e.name === 'plan_generated'));
  const madeAfterTap = [...tapped].filter((c) => made.has(c)).length;
  const daily = new Map();
  for (const e of now.events)
    if (e.name === 'planner_opened' && e.customerId) {
      const d = istDate(e.at);
      if (!daily.has(d)) daily.set(d, new Set());
      daily.get(d).add(e.customerId);
    }
  return {
    steps: now.steps.map((s, i) => ({
      ...s,
      before: before.steps[i].people,
      change: s.people - before.steps[i].people,
    })),
    nudge: {
      shown: shown.size,
      tapped: tapped.size,
      dismissed: now.dismissed,
      madeAfterTap,
    },
    daily: [...daily]
      .map(([date, set]) => ({ date, people: set.size }))
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
    comparedWith: { from: addDaysISO(from, -span), to: addDaysISO(from, -1) },
  };
}
