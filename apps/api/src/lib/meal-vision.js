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
    'You are a careful food-logging assistant for an Indian meal-tracking app.',
    'The photograph shows a COOKED meal — home-cooked Indian food is most common, often several dishes on one plate (a thali).',
    'List EVERY separate dish or item you can see, and estimate the portion SHOWN for each.',
    'Answer with JSON only:',
    '{"items":[{"name":"<plain dish name, e.g. cooked rice, dal, sambar, roti, chicken curry>",',
    '           "count":<number of pieces if countable (roti, idli, egg), else null>,',
    '           "grams":<approx grams as eaten>,',
    '           "kcal":<approx kcal integer>,"protein":<g>,"carbs":<g>,"fat":<g>}],',
    ' "confidence":"low"|"medium"|"high",',
    ' "note":"<one short line: what was hard to judge, e.g. portion of rice hidden under curry>"}',
    '',
    'Rules:',
    '- Use realistic Indian home portions: a katori of dal or curry ~150 g, a cup of cooked rice ~150 g, one roti ~40 g, one idli ~45 g.',
    '- Name dishes simply and in English with the common Indian word where there is one (dal, sambar, rasam, roti, poriyal, curd).',
    '- Do NOT add cooking oil or ghee as a separate item; estimate each dish as normally cooked.',
    '- Be honest about uncertainty. Mixed dishes, hidden layers or an unclear plate mean "low" or "medium" confidence, never "high".',
    '- If the image is not food, return items: [], confidence: "low", and say so in note.',
    '- JSON only. No text outside the JSON.',
  ].join('\n');
}

const numOrNull = (v) => (Number.isFinite(+v) && +v >= 0 ? +v : null);

/**
 * Parse the model's JSON defensively — a malformed reply must never throw. This only reads what the
 * model said; lib/meal-analysis.js then checks it against the reference table before anything is
 * stored or shown.
 */
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
        count: numOrNull(it?.count),
        grams: numOrNull(it?.grams) != null ? Math.round(+it.grams) : null,
        kcal: numOrNull(it?.kcal) != null ? Math.round(+it.kcal) : null,
        protein: numOrNull(it?.protein),
        carbs: numOrNull(it?.carbs),
        fat: numOrNull(it?.fat),
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
  // Bigger token budget than identify: the reasoning model needs room to think AND still emit the
  // items[] JSON. 512 left it empty (json_validate_failed); 1400 gives comfortable headroom.
  const raw = await callVision(apiKey, {
    prompt: mealVisionPrompt(),
    dataUrl,
    signal,
    maxTokens: 1800, // a thali can be six items, each now with macros
  });
  return parseMealReply(raw);
}
