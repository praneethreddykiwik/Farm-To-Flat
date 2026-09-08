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

function systemPrompt() {
  const cats = listCategories();
  const catalog = listProducts()
    .filter((p) => p.isActive !== false)
    .map((p) => `${p.id} ${p.name} (${(p.aliases || []).slice(0, 2).join('/')}) ${p.unit}`)
    .join('; ');
  return [
    'You are a South-Indian dietitian planning meals ONLY from this grocery catalog.',
    `Categories: ${cats.map((c) => c.name).join(', ')}.`,
    `Catalog items (id name aliases unit): ${catalog}.`,
    'Return STRICT JSON: { title, summary, days:[{ day, meals:[{ slot, name, items:[{productId, grams}], steps, prepMinutes }] }], cautions }.',
    'Every productId MUST be from the catalog. No prose outside JSON.',
  ].join('\n');
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
    }),
  });
  if (!r.ok) throw fail(502, 'AI_UPSTREAM', `Planner upstream error (${r.status}).`);
  const data = await r.json();
  const text = data.choices?.[0]?.message?.content || '{}';
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
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
        generationConfig: { responseMimeType: 'application/json' },
      }),
    },
  );
  if (!r.ok) throw fail(502, 'AI_UPSTREAM', `Planner upstream error (${r.status}).`);
  const data = await r.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return JSON.parse(text);
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

    const prompt = systemPrompt();
    const user = JSON.stringify({
      profile: req.body.profile || {},
      request: req.body.request || '',
      horizon: req.body.horizon,
    });
    const plan = groq ? await callGroq(groq, prompt, user) : await callGemini(gemini, prompt, user);
    res.json({ plan });
  }),
);
