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

/** Ranked product ids for a query. Threshold matches the mock (0.28). */
export function search(products, q) {
  const nq = normalise(q);
  if (!nq) return [];
  return products
    .map((p) => ({ p, score: scoreProduct(p, nq) }))
    .filter((x) => x.score >= 0.28)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
}
