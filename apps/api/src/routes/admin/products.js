/**
 * Admin catalog management. Operator-only — returns cost + margin (never sent to customers).
 *   GET    /admin/products                list (with cost/margin), plus categories
 *   POST   /admin/products                create
 *   PATCH  /admin/products/:id            edit any field incl. pricePaise / costPaise
 *   DELETE /admin/products/:id            remove
 *   GET    /admin/categories              category list
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, fail } from '../../http.js';
import { validateBody } from '../../validate.js';
import { categoryPublic, productAdmin } from '../../serialize.js';
import {
  createProduct,
  deleteProduct,
  getProduct,
  listCategories,
  listProducts,
  updateProduct,
} from '../../store.js';

export const adminProductsRouter = Router();

const UNITS = ['KG', 'BUNCH', 'PIECE', 'DOZEN', 'PACK'];
const paise = z.number().int().nonnegative();

const CreateProduct = z.object({
  name: z.string().min(1).max(80),
  category: z.string().min(1),
  aliases: z.array(z.string().max(60)).max(12).optional(),
  unit: z.enum(UNITS),
  increment: z.string().regex(/^\d+(\.\d+)?$/),
  pricePaise: paise,
  costPaise: paise.optional(),
  bufferPct: z.number().min(0).max(100).optional(),
  dailyCap: z.number().int().positive().max(100000),
  farm: z.string().max(80).optional(),
  image: z.string().url().nullable().optional(),
  variableWeight: z.boolean().optional(),
  isActive: z.boolean().optional(),
  availability: z.enum(['AVAILABLE', 'SOLD_OUT', 'HIDDEN']).optional(),
});

/** Availability drives the public catalog: HIDDEN is filtered out (isActive false). */
function syncAvailability(body) {
  if (body.availability) body.isActive = body.availability !== 'HIDDEN';
  else if (body.isActive === false) body.availability = 'HIDDEN';
  else if (body.isActive === true) body.availability = 'AVAILABLE';
  return body;
}

const UpdateProduct = CreateProduct.partial();

adminProductsRouter.get(
  '/products',
  asyncHandler(async (_req, res) => {
    res.json({
      products: listProducts().map(productAdmin),
      categories: listCategories()
        .sort((a, b) => a.order - b.order)
        .map(categoryPublic),
    });
  }),
);

adminProductsRouter.post(
  '/products',
  validateBody(CreateProduct),
  asyncHandler(async (req, res) => {
    const cats = listCategories();
    if (!cats.find((c) => c.id === req.body.category))
      throw fail(422, 'VALIDATION', 'Unknown category.');
    const product = createProduct(syncAvailability(req.body));
    res.status(201).json({ product: productAdmin(product) });
  }),
);

adminProductsRouter.patch(
  '/products/:id',
  validateBody(UpdateProduct),
  asyncHandler(async (req, res) => {
    if (!getProduct(req.params.id)) throw fail(404, 'NOT_FOUND', 'Product not found');
    if (req.body.category && !listCategories().find((c) => c.id === req.body.category))
      throw fail(422, 'VALIDATION', 'Unknown category.');
    const product = updateProduct(req.params.id, syncAvailability(req.body));
    res.json({ product: productAdmin(product) });
  }),
);

adminProductsRouter.delete(
  '/products/:id',
  asyncHandler(async (req, res) => {
    if (!deleteProduct(req.params.id)) throw fail(404, 'NOT_FOUND', 'Product not found');
    res.json({ ok: true });
  }),
);

adminProductsRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    res.json({
      categories: listCategories()
        .sort((a, b) => a.order - b.order)
        .map(categoryPublic),
    });
  }),
);
