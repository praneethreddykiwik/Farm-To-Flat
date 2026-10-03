/**
 * Hindi and Telugu names for a product, suggested by Groq for the operator to accept or ignore.
 *
 * WHY THIS SHAPE: localised product names are not a column. `productName()` in lib/i18n.js reads
 * the operator's own `aliases` and picks whichever one is written in the requested script, so the
 * way to give a product a Telugu name has always been "add a Telugu alias". This endpoint therefore
 * suggests ALIASES — it never writes anything itself. The operator clicks a suggestion and it lands
 * in the aliases field they were already going to fill in, which is also why a wrong suggestion
 * costs nothing: it is a draft until they save.
 *
 * The model is asked for the name a Hyderabad shopper would actually say, not a transliteration of
 * the English — "Spinach" should come back as पालक / పాలకూర, not स्पिनच / స్పినాచ్.
 */
import { fail } from '../http.js';
import { HINDI_NAMES } from './i18n.js';

const MODEL = 'openai/gpt-oss-120b';

const SYSTEM = `You translate grocery product names for an Indian grocery delivery service in Hyderabad.
Given an English product name, reply with the name a local shopper would actually use.

Rules:
- "hi" must be Hindi in Devanagari script. "te" must be Telugu in Telugu script.
- Use the REAL local name, never a transliteration of the English word, when a real name exists.
  Spinach -> पालक / పాలకూర. Bottle gourd -> लौकी / సొరకాయ.
- Only transliterate when the item genuinely has no local name (e.g. "Broccoli").
- Keep it to the product name alone: no brand, no quantity, no punctuation, no explanation.
- Reply with JSON only: {"hi":"...","te":"..."}

Worked examples (these are correct — match this level of specificity):
Spinach -> {"hi":"पालक","te":"పాలకూర"}
Bitter gourd -> {"hi":"करेला","te":"కాకరకాయ"}
Ridge gourd -> {"hi":"तोरई","te":"బీరకాయ"}
Bottle gourd -> {"hi":"लौकी","te":"సొరకాయ"}
Sorrel leaves -> {"hi":"अंबाडी","te":"గోంగూర"}
Coriander -> {"hi":"धनिया","te":"కొత్తిమీర"}
Okra -> {"hi":"भिंडी","te":"బెండకాయ"}
Brinjal -> {"hi":"बैंगन","te":"వంకాయ"}
Note how the gourds differ from one another — do not confuse them.`;

const DEVANAGARI = /[ऀ-ॿ]/;
const TELUGU = /[ఀ-౿]/;

/** Trim to a plausible product name: one line, no quotes, nothing enormous. */
const clean = (v) =>
  String(v ?? '')
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);

/**
 * Build few-shot lines from the catalogue the operator has ALREADY vetted. Every product that
 * carries an alias in both scripts is a worked example in their own house style, which beats a
 * fixed list baked in here: a generic model confidently returned "jaggery" for cluster beans and
 * "fennel" for drumstick, and no amount of prompt wording fixes knowledge it does not have.
 * @param {any[]} products
 */
export function examplesFromCatalog(products) {
  const out = [];
  for (const p of products || []) {
    const aliases = (p.aliases || []).map(String);
    // Telugu is carried on the product as an alias; Hindi lives in its own id-keyed table, so pull
    // from both or the Hindi half of every example comes back blank and the model free-associates
    // (it returned "jaggery" for cluster beans with Telugu grounded and Hindi not).
    const hi = aliases.find((a) => DEVANAGARI.test(a)) || HINDI_NAMES[p.id] || '';
    const te = aliases.find((a) => TELUGU.test(a)) || '';
    if (p.name && (hi || te)) out.push(`${p.name} -> {"hi":"${hi}","te":"${te}"}`);
    if (out.length >= 40) break;
  }
  return out;
}

/**
 * @param {{ name: string, category?: string, examples?: string[] }} args
 * @returns {Promise<{ hi: string, te: string }>}
 */
export async function suggestProductNames({ name, category, examples }) {
  const key = process.env.GROQ_API_KEY;
  // Say so plainly rather than returning empty suggestions that look like "the model had no idea".
  if (!key)
    throw fail(501, 'AI_NOT_CONFIGURED', 'Name suggestions need GROQ_API_KEY set on the server.');

  const grounding = examples?.length
    ? `\n\nNames already in use in this catalogue — follow these exactly where they apply:\n${examples.join('\n')}`
    : '';
  const user =
    (category ? `Product: ${name}\nCategory: ${category}` : `Product: ${name}`) + grounding;
  let r;
  try {
    r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: user },
        ],
        // Near-zero: there is one right answer for "what is spinach called in Telugu", and a
        // creative one is a wrong one.
        temperature: 0.1,
        // Generous on purpose. This model emits reasoning tokens before the JSON, so a tight cap
        // makes it run out mid-document and Groq rejects the whole call with
        // "max completion tokens reached before generating a valid document" — which looked like
        // the model refusing certain products ("Mutton Keema") rather than a budget problem.
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      }),
    });
  } catch {
    throw fail(502, 'AI_UPSTREAM', 'Could not reach the suggestion service.');
  }
  if (!r.ok) throw fail(502, 'AI_UPSTREAM', `Suggestion service error (${r.status}).`);

  const data = await r.json().catch(() => ({}));
  let parsed = {};
  try {
    parsed = JSON.parse(data?.choices?.[0]?.message?.content || '{}');
  } catch {
    throw fail(502, 'AI_UNREADABLE', 'The suggestion service sent something unreadable.');
  }

  const hi = clean(parsed.hi);
  const te = clean(parsed.te);
  // Check the SCRIPT, not just that something came back. A model that echoes the English name is
  // the common failure here, and an English "suggestion" dropped into the aliases field would
  // quietly make productName() treat it as a Hindi name forever.
  return {
    hi: DEVANAGARI.test(hi) ? hi : '',
    te: TELUGU.test(te) ? te : '',
  };
}
