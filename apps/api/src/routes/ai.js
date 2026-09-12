/**
 * AI diet planner passthrough (contract, authenticated). Builds a system prompt from the live
 * catalog, calls Groq (openai/gpt-oss-120b) or Gemini (gemini-3.6-flash) with the SERVER-side key,
 * and returns the raw model JSON untouched — the app validates it against the catalog and computes
 * every calorie itself. Owner: Vivek. In dev the app calls providers directly with EXPO_PUBLIC keys;
 * this server route is the production path and stays behind a rate limiter.
 *
 * With no server key configured it returns 501 (honest) rather than pretending — set GROQ_API_KEY
 * or GEMINI_API_KEY in apps/api env to enable it.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../http.js';
import { validateBody } from '../validate.js';
import { listCategories, listProducts } from '../store.js';

export const aiRouter = Router();

const PlanBody = z.object({
  profile: z.record(z.string(), z.any()).optional(),
  request: z.string().max(2000).optional(),
  horizon: z.enum(['meal', 'day', 'week', 'month']).default('day'),
});

// The app only needs a compact rotation from the model: one day for meal/day, seven for week, and a
// seven-day rotation for month (the app tiles it to 30 itself — see normalisePlan in the client's
// src/lib/ai.js). Capping the day count is what keeps the JSON small enough not to truncate, which is
// exactly why "This week" / "A month" used to fail while "Today" worked.
const TEMPLATE_DAYS = { meal: 1, day: 1, week: 7, month: 7 };

function systemPrompt(horizon) {
  const cats = listCategories();
  const catalog = listProducts()
    .filter((p) => p.isActive !== false)
    .map((p) => `${p.id} ${p.name} (${(p.aliases || []).slice(0, 2).join('/')}) ${p.unit}`)
    .join('; ');
  const days = TEMPLATE_DAYS[horizon] || 1;
  return [
    'You are a South-Indian dietitian planning meals ONLY from this grocery catalog.',
    `Categories: ${cats.map((c) => c.name).join(', ')}.`,
    `Catalog items (id name aliases unit): ${catalog}.`,
    `Return EXACTLY ${days} day object(s) in "days" — no more.${
      horizon === 'month'
        ? ' These seven days are a rotation the app repeats across the month.'
        : ''
    }`,
    'Keep it compact: max 4 short steps per meal (≤ 12 words each), dish names ≤ 5 words.',
    'Return STRICT JSON: { title, summary, days:[{ day, meals:[{ slot, name, items:[{productId, grams}], steps, prepMinutes }] }], cautions }.',
    'Every productId MUST be from the catalog. No prose outside JSON.',
  ].join('\n');
}

/**
 * Parse model output into an object, tolerating a run that got cut off mid-array (long horizons).
 * Mirrors the client's extractJSON: try whole, then the first {...} block, then keep every complete
 * day object and close the structure. Throws only if nothing usable survives.
 */
function extractJSON(text) {
  const t = String(text || '').trim();
  try {
    return JSON.parse(t);
  } catch {}
  const m = t.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {}
  }
  const cut = Math.max(t.lastIndexOf('{ "day"'), t.lastIndexOf('{"day"'));
  if (cut > 0) {
    const head = t.slice(0, cut).replace(/,\s*$/, '');
    try {
      return JSON.parse(`${head}]}`);
    } catch {}
  }
  throw fail(502, 'AI_INCOMPLETE', 'The planner sent an incomplete plan. Please try again.');
}

async function callGroq(key, prompt, user) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: user },
      ],
      temperature: 0.6,
      max_tokens: 12000,
      response_format: { type: 'json_object' },
    }),
  });
  if (!r.ok) throw fail(502, 'AI_UPSTREAM', `Planner upstream error (${r.status}).`);
  const data = await r.json();
  return extractJSON(data.choices?.[0]?.message?.content || '{}');
}

async function callGemini(key, prompt, user) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 12000 },
      }),
    },
  );
  if (!r.ok) throw fail(502, 'AI_UPSTREAM', `Planner upstream error (${r.status}).`);
  const data = await r.json();
  return extractJSON(data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '{}');
}

aiRouter.post(
  '/plan',
  validateBody(PlanBody),
  asyncHandler(async (req, res) => {
    const groq = process.env.GROQ_API_KEY;
    const gemini = process.env.GEMINI_API_KEY;
    if (!groq && !gemini)
      throw fail(
        501,
        'NOT_IMPLEMENTED',
        'AI planner needs a server key (GROQ_API_KEY or GEMINI_API_KEY). In dev the app calls the provider directly.',
      );

    const prompt = systemPrompt(req.body.horizon);
    const user = JSON.stringify({
      profile: req.body.profile || {},
      request: req.body.request || '',
      horizon: req.body.horizon,
    });
    // Try the primary provider; if it errors (Groq's free tier is only 8k tokens/min, so a second
    // plan within a minute 429s), fall back to the other provider so the customer still gets a plan.
    const providers = [
      groq && (() => callGroq(groq, prompt, user)),
      gemini && (() => callGemini(gemini, prompt, user)),
    ].filter(Boolean);
    let plan;
    let lastErr;
    for (const run of providers) {
      try {
        plan = await run();
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!plan) throw lastErr || fail(502, 'AI_UPSTREAM', 'The planner is unavailable right now.');
    res.json({ plan });
  }),
);
