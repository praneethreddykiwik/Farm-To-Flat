/**
 * Read a photo of a COOKED meal and estimate what was eaten — the "objective" half of the adherence
 * loop. Unlike identify.js (which names a single raw vegetable against our catalog), this looks at a
 * finished plate of Indian home food and returns the dishes it sees plus a calorie estimate for the
 * portion shown. We reuse identify.js's Groq vision call; only the prompt and the parsing differ.
 *
 * Honesty over precision: estimating calories from one photo is approximate (portion size is the hard
 * part), so the model self-rates confidence and we surface it. This is for adherence and trends, not a
 * medical number.
 */
import { callVision } from './identify.js';

export function mealVisionPrompt() {
  return [
    'You are a nutrition assistant for an Indian meal-tracking app.',
    'The photograph shows a COOKED meal — home-cooked Indian food is most common.',
    'Identify the dishes and main ingredients, and estimate the calories for the portion SHOWN.',
    'Answer with JSON only:',
    '{"items":[{"name":"<dish or ingredient>","grams":<approx grams or null>,"kcal":<approx kcal integer>}],',
    ' "totalKcal":<approx total kcal integer>,',
    ' "confidence":"low"|"medium"|"high",',
    ' "note":"<one short line — e.g. a caveat about the portion>"}',
    '',
    'Rules:',
    '- Use realistic Indian home portions: a katori of dal ~150 g, a cup of cooked rice ~150 g, one roti ~40 g.',
    '- Be conservative and honest. If the plate is unclear or portions are ambiguous, use "low" confidence.',
    '- totalKcal should roughly equal the sum of the item kcal values.',
    '- If the image is not food, return items: [], totalKcal: 0, confidence: "low", and say so in note.',
    '- JSON only. No text outside the JSON.',
  ].join('\n');
}

/** Parse the model's JSON defensively — a malformed reply must never throw. */
export function parseMealReply(text) {
  let obj = {};
  try {
    obj = JSON.parse(text);
  } catch {
    obj = {};
  }
  const items = Array.isArray(obj.items)
    ? obj.items.slice(0, 12).map((it) => ({
        name: String(it?.name || 'item').slice(0, 60),
        grams: Number.isFinite(+it?.grams) ? Math.max(0, Math.round(+it.grams)) : null,
        kcal: Number.isFinite(+it?.kcal) ? Math.max(0, Math.round(+it.kcal)) : null,
      }))
    : [];
  let totalKcal = Number.isFinite(+obj.totalKcal) ? Math.max(0, Math.round(+obj.totalKcal)) : null;
  if (totalKcal == null && items.length) {
    const sum = items.reduce((a, it) => a + (it.kcal || 0), 0);
    totalKcal = sum || null;
  }
  const confidence = ['low', 'medium', 'high'].includes(obj.confidence) ? obj.confidence : 'low';
  const note = typeof obj.note === 'string' ? obj.note.slice(0, 200) : null;
  return { items, totalKcal, confidence, note };
}

/** Photo (as a data URL) → { items, totalKcal, confidence, note }. */
export async function analyseMealPhoto(apiKey, { dataUrl, signal }) {
  const raw = await callVision(apiKey, { prompt: mealVisionPrompt(), dataUrl, signal });
  return parseMealReply(raw);
}
