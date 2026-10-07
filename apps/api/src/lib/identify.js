/**
 * "What am I looking at?" — turn a photograph of produce into a product in OUR catalogue.
 *
 * Two layers, because a model's answer is a suggestion and the catalogue is the truth:
 *
 *   1. We hand the model the catalogue (id, name, aliases) and ask it to name the produce AND pick
 *      the matching id. Giving it the list is far more reliable than free-text matching, because
 *      "that bundle of greens" becomes a choice between twelve known greens rather than an open
 *      vocabulary problem.
 *   2. Whatever id comes back is VALIDATED against the real catalogue. A model can invent an id
 *      that looks plausible, and shipping an unvalidated one would put a product in someone's
 *      basket that does not exist. If the id does not resolve, we fall back to running the model's
 *      plain-language label through the same alias search the search bar uses — so "tamata",
 *      "టమాటా" and "tomato" all land on p_tomato.
 *
 * The model never sees prices, stock or anything about the customer. It sees a photograph and a
 * list of names.
 */
import { search } from './search.js';

/** Groq's vision model. Verified against console.groq.com/docs/models on 2026-10-07. */
export const VISION_MODEL = 'qwen/qwen3.8-27b';

/**
 * The catalogue as the model sees it: id, name, aliases. Compact on purpose — this is sent with
 * every photograph, so it is the per-call cost we pay forever.
 */
export function catalogueForPrompt(products) {
  return products
    .map((p) => {
      const alt = (p.aliases || []).join(', ');
      return `${p.id}\t${p.name}${alt ? ` (${alt})` : ''}`;
    })
    .join('\n');
}

export function systemPrompt(products) {
  return [
    'You identify fruit and vegetables in a photograph for an Indian grocery app.',
    '',
    'Below is the ENTIRE catalogue, one product per line as "id<TAB>name (other names it goes by)".',
    'Other names include Telugu and Hindi, in both script and transliteration.',
    '',
    catalogueForPrompt(products),
    '',
    'Look at the photograph and answer with JSON only:',
    '{"label": "<what you see, in plain English, 1-3 words>",',
    ' "productId": "<the id from the list that matches, or null if none does>",',
    ' "confidence": <0.0 to 1.0>}',
    '',
    'Rules:',
    '- productId MUST be copied exactly from the list above, or be null. Never invent one.',
    '- If the photograph shows produce we do not stock, give the label and null for productId.',
    '- If it is not produce at all (a person, a document, a pet), set label to what it is,',
    '  productId to null and confidence to 0.',
    '- One product only: the main subject of the photograph.',
  ].join('\n');
}

/**
 * Ask Groq. Thinking is turned down deliberately: this is recognition, not reasoning, and a
 * reasoning model left at full effort spends most of the bill — and most of the wait — on tokens
 * nobody reads.
 */
export async function callVision(apiKey, { prompt, dataUrl, signal }) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    signal,
    body: JSON.stringify({
      model: VISION_MODEL,
      reasoning_effort: 'low',
      response_format: { type: 'json_object' },
      max_completion_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    const err = new Error(`groq ${r.status}: ${body.slice(0, 300)}`);
    err.status = r.status;
    throw err;
  }
  const data = await r.json();
  return data.choices?.[0]?.message?.content || '{}';
}

/** Parse the model's JSON without letting a malformed reply throw. */
export function parseReply(text) {
  try {
    const o = JSON.parse(text);
    return {
      label: typeof o.label === 'string' ? o.label.slice(0, 60) : '',
      productId: typeof o.productId === 'string' ? o.productId : null,
      confidence: Number.isFinite(o.confidence) ? Math.min(1, Math.max(0, o.confidence)) : 0,
    };
  } catch {
    return { label: '', productId: null, confidence: 0 };
  }
}

/**
 * Resolve the model's answer against the real catalogue.
 * @returns {{ product: any|null, alternatives: any[], label: string, confidence: number, via: 'id'|'search'|'none' }}
 */
export function resolve(products, reply) {
  const byId = reply.productId ? products.find((p) => p.id === reply.productId) : null;
  if (byId) {
    // Near neighbours from the label, so "looks like spinach, or maybe amaranth" is offerable.
    const alts = (reply.label ? search(products, reply.label) : []).filter((p) => p.id !== byId.id);
    return {
      product: byId,
      alternatives: alts.slice(0, 3),
      label: reply.label,
      confidence: reply.confidence,
      via: 'id',
    };
  }
  // The id was absent or invented. Fall back to the alias search the search bar already uses.
  const hits = reply.label ? search(products, reply.label) : [];
  if (hits.length)
    return {
      product: hits[0],
      alternatives: hits.slice(1, 4),
      label: reply.label,
      // A search hit is a weaker claim than the model naming the id outright.
      confidence: Math.min(reply.confidence, 0.6),
      via: 'search',
    };
  return { product: null, alternatives: [], label: reply.label, confidence: 0, via: 'none' };
}
