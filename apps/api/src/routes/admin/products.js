/**
 * Admin catalog management. Operator-only — returns cost + margin (never sent to customers).
 *   GET    /admin/products                list (with cost/margin), plus categories
 *   POST   /admin/products                create
 *   PATCH  /admin/products/:id            edit any field incl. pricePaise / costPaise
 *   DELETE /admin/products/:id            remove
 *   GET    /admin/categories              category list
 *   POST   /admin/products/suggest-names   Hindi + Telugu name suggestions for an English name
 *
 * What the app's product page says about a product (its story, how to keep it, a recipe):
 *   GET    /admin/products/:id/knowledge           the saved text, the built-in text, and a preview
 *   POST   /admin/products/:id/knowledge/preview   what the app would show for an unsaved draft
 *   PUT    /admin/products/:id/knowledge           save — refused if the wording breaks the food rules
 *   DELETE /admin/products/:id/knowledge           back to the built-in text
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
import {
  allowedImageTypes,
  storageEnabled,
  uploadProductImage,
  assertRealImage,
} from '../../lib/storage.js';
import { examplesFromCatalog, suggestProductNames } from '../../lib/suggest-names.js';
import {
  autoReferenceFor,
  builtInKnowledgeFor,
  checkKnowledgeDraft,
  clearKnowledgeOverride,
  getKnowledgeOverride,
  knowledgeFor,
  knowledgeTableReady,
  normaliseKnowledgeDraft,
  referenceFoods,
  setKnowledgeOverride,
  setKnowledgeTableReady,
} from '../../lib/knowledge.js';
import {
  deleteProductKnowledge,
  productKnowledgeTableExists,
  saveProductKnowledge,
} from '../../persistence.js';
import { recordAction } from '../../lib/audit.js';

export const adminProductsRouter = Router();

/** @type {[string, ...string[]]} */
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
  diet: z.enum(['VEG', 'NONVEG']).optional(),
  isSeasonal: z.boolean().optional(),
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
    // Its product-page text goes with it. Best-effort: an orphaned row is harmless, and a product
    // that has just been deleted must not be reported as "could not delete".
    clearKnowledgeOverride(req.params.id);
    deleteProductKnowledge(req.params.id).catch(() => {});
    res.json({ ok: true });
  }),
);

// ───────────────────────── the product page's words ─────────────────────────

const text = (max) => z.string().max(max).nullable().optional();
const KnowledgeDraft = z.object({
  story: text(700),
  best: text(120),
  keep: text(400),
  careful: text(400),
  recipe: z
    .object({
      name: text(80),
      mins: z.number().int().min(1).max(1440).nullable().optional(),
      serves: z.number().int().min(1).max(50).nullable().optional(),
      needs: z.array(z.string().max(160)).max(30).optional(),
      steps: z.array(z.string().max(500)).max(20).optional(),
    })
    .nullable()
    .optional(),
  // 'auto' — follow the built-in match · 'off' — make no nutrient statements · else a reference key
  nutrition: z.string().max(60).optional(),
});

const BLANK = { story: null, best: null, keep: null, careful: null, recipe: null };

/** Everything the editor needs for one product, in one response. */
function editorView(product) {
  const saved = getKnowledgeOverride(product.id);
  const original = builtInKnowledgeFor(product);
  return {
    productId: product.id,
    productName: product.name,
    // what the operator saved, if anything — with who and when
    saved: saved ? { ...saved.data, updatedAt: saved.updatedAt, updatedBy: saved.updatedBy } : null,
    // the built-in text "Reset" goes back to; null for a product we wrote nothing about
    original,
    // what the editor's fields should start from
    draft: {
      ...BLANK,
      ...(saved?.data || original || {}),
      nutrition: saved?.data?.nutrition || 'auto',
    },
    // exactly what GET /catalog/:id/knowledge sends the app right now
    preview: knowledgeFor(product),
    nutrition: { auto: autoReferenceFor(product), foods: referenceFoods() },
    // false only when a database is connected but the ProductKnowledge table is missing
    canSave: knowledgeTableReady(),
  };
}

function productOr404(req) {
  const product = getProduct(req.params.id);
  if (!product) throw fail(404, 'NOT_FOUND', 'Product not found');
  return product;
}

const TABLE_MISSING =
  'Product pages cannot be edited yet: the ProductKnowledge table has not been created in the ' +
  'database. Ask whoever runs the database to create it (the SQL is in prisma/schema.prisma). ' +
  'Nothing was saved.';

const DB_DOWN =
  'The database cannot be reached right now, so nothing was saved. Try again in a minute.';

/** Prisma's "that table does not exist" — the one failure here with a known cure. */
const isMissingTable = (e) =>
  e?.code === 'P2021' || /table\b.*\bdoes not exist/i.test(String(e?.message || ''));

adminProductsRouter.get(
  '/products/:id/knowledge',
  asyncHandler(async (req, res) => {
    const product = productOr404(req);
    // Boot found no table? Look again — it may have been created since, and nobody should have to
    // restart the API to be allowed to save.
    if (!knowledgeTableReady()) setKnowledgeTableReady(await productKnowledgeTableExists());
    res.json(editorView(product));
  }),
);

// Nothing is stored. The console calls this as the operator types, so the phone-shaped preview and
// the wording problems are the server's own answer — the same code the app is served by — rather
// than a second copy of the rules in the browser that could drift from it.
adminProductsRouter.post(
  '/products/:id/knowledge/preview',
  validateBody(KnowledgeDraft),
  asyncHandler(async (req, res) => {
    const product = productOr404(req);
    const data = normaliseKnowledgeDraft(req.body);
    res.json({ preview: knowledgeFor(product, data), problems: checkKnowledgeDraft(data) });
  }),
);

adminProductsRouter.put(
  '/products/:id/knowledge',
  validateBody(KnowledgeDraft),
  asyncHandler(async (req, res) => {
    const product = productOr404(req);
    const data = normaliseKnowledgeDraft(req.body);
    const problems = checkKnowledgeDraft(data);
    if (problems.length)
      throw fail(422, 'VALIDATION', problems[0].message, {
        problems,
      });

    const before = getKnowledgeOverride(product.id)?.data || null;
    const by = req.staff?.email || req.staff?.name || null;
    // The database first, memory second: if the write fails, the app must not start showing text
    // that will be gone at the next restart.
    try {
      await saveProductKnowledge(product.id, data, by);
    } catch (e) {
      if (isMissingTable(e)) {
        setKnowledgeTableReady(false);
        throw fail(503, 'NOT_READY', TABLE_MISSING);
      }
      if (e?.code === 'DB_UNAVAILABLE') throw fail(503, 'NOT_READY', DB_DOWN);
      throw e;
    }
    setKnowledgeTableReady(true);
    setKnowledgeOverride(product.id, data, by);
    await recordAction({
      staff: req.staff,
      action: 'PRODUCT_KNOWLEDGE_UPDATED',
      target: product.id,
      details: { product: product.name, before, after: data },
    });
    res.json(editorView(product));
  }),
);

adminProductsRouter.delete(
  '/products/:id/knowledge',
  asyncHandler(async (req, res) => {
    const product = productOr404(req);
    const before = getKnowledgeOverride(product.id)?.data || null;
    if (before) {
      try {
        await deleteProductKnowledge(product.id);
      } catch (e) {
        if (e?.code === 'DB_UNAVAILABLE') throw fail(503, 'NOT_READY', DB_DOWN);
        if (!isMissingTable(e)) throw e; // no table means there was never a row to remove
      }
      clearKnowledgeOverride(product.id);
      await recordAction({
        staff: req.staff,
        action: 'PRODUCT_KNOWLEDGE_RESET',
        target: product.id,
        details: { product: product.name, before },
      });
    }
    res.json(editorView(product));
  }),
);

/**
 * Upload a product image to Supabase Storage and return its public URL. The admin sends the file as
 * base64; the URL then goes into the product's `image` field (create/edit). Server-side upload keeps
 * the storage key off the browser.
 */
// Suggestions only: this never touches the product. The operator clicks what they want and it
// lands in the aliases field, which is what productName() reads for Hindi and Telugu.
const SuggestNames = z.object({
  name: z.string().min(1).max(80),
  category: z.string().max(60).optional(),
});

adminProductsRouter.post(
  '/products/suggest-names',
  validateBody(SuggestNames),
  asyncHandler(async (req, res) => {
    res.json(
      await suggestProductNames({ ...req.body, examples: examplesFromCatalog(listProducts()) }),
    );
  }),
);

const UploadImage = z.object({
  contentType: z.enum(/** @type {any} */ (allowedImageTypes)),
  dataBase64: z.string().min(1),
});
adminProductsRouter.post(
  '/products/upload-image',
  validateBody(UploadImage),
  asyncHandler(async (req, res) => {
    if (!storageEnabled)
      throw fail(
        501,
        'STORAGE_OFF',
        'Image storage is not configured (set SUPABASE_URL + service key).',
      );
    const buffer = Buffer.from(req.body.dataBase64, 'base64');
    if (buffer.length === 0) throw fail(422, 'VALIDATION', 'Empty image.');
    if (buffer.length > 5 * 1024 * 1024) throw fail(413, 'TOO_LARGE', 'Image must be under 5 MB.');
    // The declared contentType is not evidence — verify the bytes actually are that image type.
    assertRealImage(buffer, req.body.contentType);
    const url = await uploadProductImage({ buffer, contentType: req.body.contentType });
    res.status(201).json({ url });
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
