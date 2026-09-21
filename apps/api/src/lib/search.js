/**
 * Alias search with misspelling tolerance. In the Prisma build this becomes a Postgres
 * `pg_trgm` similarity() query over the product + alias tables; the scoring here mirrors that
 * shape (exact > prefix > substring > trigram) so the customer app gets identical results from
 * the mock, this in-memory API, and the eventual database.
 */

export function normalise(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9ఀ-౿ ]/g, '')
    .trim();
}

function trigrams(s) {
  const t = `  ${s} `;
  const set = new Set();
  for (let i = 0; i < t.length - 2; i += 1) set.add(t.slice(i, i + 3));
  return set;
}

/** Jaccard trigram similarity in [0,1]. */
export function similarity(a, b) {
  const ta = trigrams(a);
  const tb = trigrams(b);
  let inter = 0;
  ta.forEach((g) => tb.has(g) && (inter += 1));
  return inter / Math.max(1, ta.size + tb.size - inter);
}

/**
 * Score one product against a normalised query. Considers the name and every alias.
 * @returns {number} score in [0,1]
 */
export function scoreProduct(product, nq) {
  const names = [product.name, ...(product.aliases || [])].map(normalise);
  let score = 0;
  for (const name of names) {
    if (name === nq) score = Math.max(score, 1);
    else if (name.startsWith(nq)) score = Math.max(score, 0.9);
    else if (name.includes(nq)) score = Math.max(score, 0.75);
    else score = Math.max(score, similarity(name, nq) * 0.9);
  }
  return score;
}

/** Absolute floor — low enough that a real misspelling still finds its product. */
const MIN_SCORE = 0.28;
/** At or above this, the top hit is a confident match rather than a guess. */
const STRONG_SCORE = 0.6;
/** When there IS a confident hit, everything else must reach this fraction of it. */
const RELATIVE_TO_TOP = 0.5;

/**
 * Ranked products for a query.
 *
 * The absolute floor alone is not enough. Searching "karela" returned Banana, because one of its
 * aliases is "kela"; "chicken" returned Soaked chana, because one of ITS aliases is "chickpea".
 * Both are genuine trigram neighbours, not noise — but showing them next to an exact hit makes the
 * search look broken, and that is what a shopper reports.
 *
 * So the floor stays (a misspelling with no strong match still finds its product), and a second
 * rule applies only when a confident match exists: near-misses must be at least half as good as the
 * winner, otherwise they are a distraction rather than an alternative.
 */
export function search(products, q) {
  const nq = normalise(q);
  if (!nq) return [];
  const ranked = products
    .map((p) => ({ p, score: scoreProduct(p, nq) }))
    .filter((x) => x.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return [];

  const top = ranked[0].score;
  const cutoff = top >= STRONG_SCORE ? Math.max(MIN_SCORE, top * RELATIVE_TO_TOP) : MIN_SCORE;
  return ranked.filter((x) => x.score >= cutoff).map((x) => x.p);
}
