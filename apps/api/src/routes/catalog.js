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
import { categoryPublic, productPublic } from '../serialize.js';
import { getProduct, listCategories, listProducts, rawProducts } from '../store.js';
import { search } from '../lib/search.js';

export const catalogRouter = Router();

catalogRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({
      categories: listCategories()
        .sort((a, b) => a.order - b.order)
        .map(categoryPublic),
      products: listProducts()
        .filter((p) => p.isActive !== false)
        .map(productPublic),
      generatedAt: new Date().toISOString(),
    });
  }),
);

const SearchQuery = z.object({ q: z.string().optional() });
catalogRouter.get(
  '/search',
  validateQuery(SearchQuery),
  asyncHandler(async (req, res) => {
    // @ts-expect-error validatedQuery is attached by validateQuery
    const { q } = req.validatedQuery;
    const results = search(rawProducts(), q).filter((p) => p.isActive !== false);
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
