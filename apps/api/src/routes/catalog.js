/**
 * Public catalog — the frozen contract. Matches apps/customer/src/api/mock/server.js field-for-field:
 *   GET /catalog            categories + products
 *   GET /catalog/search?q=  alias search with misspelling tolerance
 *   GET /catalog/:id        one product
 * Public routes never require auth and never emit cost/margin.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../http.js';
import { validateQuery } from '../validate.js';
import { categoryPublic, dietOf, productPublic } from '../serialize.js';
import { getProduct, listCategories, listProducts, rawProducts } from '../store.js';
import { search } from '../lib/search.js';

export const catalogRouter = Router();

// Optional customer filters, shared by list + search:
//   diet=VEG|NONVEG   only veg or only non-veg items
//   seasonal=1        only items marked "in season now"
const dietFilter = (diet) => (diet ? (p) => dietOf(p) === diet : () => true);
const seasonalFilter = (seasonal) => (seasonal ? (p) => !!p.isSeasonal : () => true);

const ListQuery = z.object({
  diet: z.enum(['VEG', 'NONVEG']).optional(),
  seasonal: z.enum(['0', '1']).optional(),
});

catalogRouter.get(
  '/',
  validateQuery(ListQuery),
  asyncHandler(async (req, res) => {
    // @ts-expect-error validatedQuery is attached by validateQuery
    const { diet, seasonal } = req.validatedQuery;
    res.json({
      categories: listCategories()
        .sort((a, b) => a.order - b.order)
        .map(categoryPublic),
      products: listProducts()
        .filter((p) => p.isActive !== false)
        .filter(dietFilter(diet))
        .filter(seasonalFilter(seasonal === '1'))
        .map(productPublic),
      generatedAt: new Date().toISOString(),
    });
  }),
);

const SearchQuery = z.object({
  q: z.string().optional(),
  diet: z.enum(['VEG', 'NONVEG']).optional(),
  seasonal: z.enum(['0', '1']).optional(),
});
catalogRouter.get(
  '/search',
  validateQuery(SearchQuery),
  asyncHandler(async (req, res) => {
    // @ts-expect-error validatedQuery is attached by validateQuery
    const { q, diet, seasonal } = req.validatedQuery;
    const results = search(rawProducts(), q)
      .filter((p) => p.isActive !== false)
      .filter(dietFilter(diet))
      .filter(seasonalFilter(seasonal === '1'));
    res.json({ products: results.map(productPublic) });
  }),
);

catalogRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = getProduct(req.params.id);
    if (!product || product.isActive === false) throw fail(404, 'NOT_FOUND', 'Product not found');
    res.json({ product: productPublic(product) });
  }),
);
