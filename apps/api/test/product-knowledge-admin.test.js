import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { _memoryTrail } from '../src/lib/audit.js';
import {
  checkKnowledgeDraft,
  normaliseKnowledgeDraft,
  replaceKnowledgeOverrides,
  setKnowledgeTableReady,
} from '../src/lib/knowledge.js';

/**
 * The operator editing what the app's product page says — its story, how to keep it, a recipe —
 * from the admin console, and the app showing exactly that.
 */
const TOKEN = process.env.ADMIN_TOKEN || 'test-admin-token';
process.env.ADMIN_TOKEN = TOKEN;
const auth = (r) => r.set('x-admin-token', TOKEN);
const admin = (method, path) => auth(request(app)[method](`/api/v1/admin${path}`));
/** What a customer's phone is served. */
const inApp = async (id) =>
  (await request(app).get(`/api/v1/catalog/${id}/knowledge`)).body.knowledge;

const GUAVA = 'p_guava';
const RECIPE = {
  name: 'Guava with chilli salt',
  mins: 5,
  serves: 2,
  needs: ['2 ripe guavas', 'salt', 'chilli powder'],
  steps: ['Cut the guavas into wedges.', 'Dust with salt and chilli and eat at once.'],
};

beforeEach(() => {
  replaceKnowledgeOverrides([]);
  setKnowledgeTableReady(true);
  _memoryTrail.length = 0;
});

describe('opening the editor', () => {
  it('needs an operator', async () => {
    const r = await request(app).get(`/api/v1/admin/products/${GUAVA}/knowledge`);
    expect(r.status).toBe(401);
  });

  it('starts from the built-in text, and previews exactly what the app is served', async () => {
    const r = await admin('get', `/products/${GUAVA}/knowledge`);
    expect(r.status).toBe(200);
    expect(r.body.saved).toBeNull();
    expect(r.body.original.story).toBeTruthy();
    expect(r.body.draft.story).toBe(r.body.original.story);
    expect(r.body.draft.nutrition).toBe('auto');
    expect(r.body.preview).toEqual(await inApp(GUAVA));
    expect(r.body.canSave).toBe(true);
    // the picker: only foods whose figures are an exact match, the guava row among them
    expect(r.body.nutrition.auto.key).toBe('guava');
    expect(r.body.nutrition.foods.find((f) => f.key === 'guava')).toBeTruthy();
    expect(r.body.nutrition.foods.find((f) => f.key === 'rohu')).toBeFalsy();
  });

  it('is a 404 for a product that does not exist', async () => {
    expect((await admin('get', '/products/nope/knowledge')).status).toBe(404);
  });
});

describe('saving', () => {
  it('puts the operator’s words in the app, whole', async () => {
    const r = await admin('put', `/products/${GUAVA}/knowledge`).send({
      story: '  Jama from the Shamshabad belt,   picked firm.  ',
      best: 'Winter',
      keep: 'On the counter until it gives a little, then the fridge.',
      careful: '',
      recipe: RECIPE,
    });
    expect(r.status).toBe(200);
    expect(r.body.saved.story).toBe('Jama from the Shamshabad belt, picked firm.');

    const k = await inApp(GUAVA);
    expect(k.story).toBe('Jama from the Shamshabad belt, picked firm.');
    expect(k.best).toBe('Winter');
    expect(k.keep).toBe('On the counter until it gives a little, then the fridge.');
    expect(k.careful).toBeNull(); // cleared means not shown — not "fall back to the old text"
    expect(k.recipe).toEqual(RECIPE);
  });

  it('leaves the nutrient statements alone — nobody types those', async () => {
    const before = await inApp(GUAVA);
    await admin('put', `/products/${GUAVA}/knowledge`).send({ story: 'A different story.' });
    const after = await inApp(GUAVA);
    expect(after.goodToKnow).toEqual(before.goodToKnow);
    expect(after.goodToKnow.map((c) => c.text)).toContain('Naturally high in vitamin C');
    expect(after.nutrition).toEqual(before.nutrition);
  });

  it('records who changed what', async () => {
    await admin('put', `/products/${GUAVA}/knowledge`).send({ story: 'A different story.' });
    const row = _memoryTrail.find((a) => a.action === 'PRODUCT_KNOWLEDGE_UPDATED');
    expect(row.target).toBe(GUAVA);
    expect(row.details.after.story).toBe('A different story.');
    expect(row.details.before).toBeNull();
  });

  it('lets a product we wrote nothing about be given a page', async () => {
    const made = await admin('post', '/products').send({
      name: 'Zzyzx berry',
      category: 'cat_leafy',
      unit: 'PACK',
      increment: '1',
      pricePaise: 9900,
      dailyCap: 10,
    });
    const id = made.body.product.id;
    expect(await inApp(id)).toBeNull();

    const view = await admin('get', `/products/${id}/knowledge`);
    expect(view.body.original).toBeNull();
    expect(view.body.nutrition.auto).toBeNull();

    await admin('put', `/products/${id}/knowledge`).send({ story: 'New this week.' });
    const k = await inApp(id);
    expect(k.story).toBe('New this week.');
    expect(k.goodToKnow).toEqual([]); // no reference food, so no statements
    await admin('delete', `/products/${id}`);
  });
});

describe('wording the food rules do not allow', () => {
  it('is refused, with the field and the phrase named', async () => {
    const r = await admin('put', `/products/${GUAVA}/knowledge`).send({
      story: 'Guava boosts immunity and cures a cold.',
      recipe: { ...RECIPE, steps: ['A healthy snack in two minutes.'] },
    });
    expect(r.status).toBe(422);
    const problems = r.body.error.details.problems;
    expect(problems.map((p) => p.field)).toEqual(
      expect.arrayContaining(['story', 'recipe.steps.0']),
    );
    expect(problems.find((p) => p.field === 'story').match.toLowerCase()).toMatch(/cures|boosts/);
    expect(problems[0].message).not.toMatch(/^reg /); // said for an operator, not a lawyer
  });

  it('changes nothing in the app when refused', async () => {
    const before = await inApp(GUAVA);
    await admin('put', `/products/${GUAVA}/knowledge`).send({ story: 'Prevents diabetes.' });
    expect(await inApp(GUAVA)).toEqual(before);
    expect(_memoryTrail).toHaveLength(0);
  });

  it('refuses a recipe that is only half written', async () => {
    const noSteps = await admin('put', `/products/${GUAVA}/knowledge`).send({
      recipe: { name: 'Guava something', needs: ['guava'], steps: [] },
    });
    expect(noSteps.status).toBe(422);
    const noName = await admin('put', `/products/${GUAVA}/knowledge`).send({
      recipe: { name: '', needs: [], steps: ['Eat it.'] },
    });
    expect(noName.status).toBe(422);
  });

  it('refuses text far longer than a phone screen should carry', async () => {
    const r = await admin('put', `/products/${GUAVA}/knowledge`).send({ story: 'x'.repeat(701) });
    expect(r.status).toBe(422);
  });
});

describe('the nutrition figures', () => {
  it('can be switched off for a product', async () => {
    await admin('put', `/products/${GUAVA}/knowledge`).send({ story: 'Jama.', nutrition: 'off' });
    const k = await inApp(GUAVA);
    expect(k.goodToKnow).toEqual([]);
    expect(k.nutrition).toBeNull();
    expect(k.footnote).toBeNull();
    // and the tile in the catalogue stops carrying the badge
    const list = (await request(app).get('/api/v1/catalog')).body.products;
    expect(list.find((p) => p.id === GUAVA).goodToKnow).toEqual([]);
  });

  it('can be pointed at another reference food — and are then computed from it', async () => {
    await admin('put', `/products/${GUAVA}/knowledge`).send({
      story: 'Jama.',
      nutrition: 'banana',
    });
    const k = await inApp(GUAVA);
    expect(k.goodToKnow.map((c) => c.text)).not.toContain('Naturally high in vitamin C');
    expect(k.nutrition.rows.find((r) => r.label === 'Energy').value).toBe('89 kcal');
  });

  it('makes no statements from a herb, however it was chosen', async () => {
    await admin('put', `/products/${GUAVA}/knowledge`).send({
      story: 'Jama.',
      nutrition: 'coriander_leaves',
    });
    expect((await inApp(GUAVA)).goodToKnow).toEqual([]);
  });

  it('cannot be pointed at a food we hold no exact figures for', async () => {
    for (const nutrition of ['dragonfruit', 'rohu']) {
      const r = await admin('put', `/products/${GUAVA}/knowledge`).send({
        story: 'Jama.',
        nutrition,
      });
      expect(r.status).toBe(422);
      expect(r.body.error.details.problems[0].field).toBe('nutrition');
    }
  });
});

describe('previewing before saving', () => {
  it('shows what the app would say, and what is wrong, without storing anything', async () => {
    const before = await inApp(GUAVA);
    const r = await admin('post', `/products/${GUAVA}/knowledge/preview`).send({
      story: 'A draft story that boosts nothing.',
      nutrition: 'off',
    });
    expect(r.status).toBe(200);
    expect(r.body.preview.story).toBe('A draft story that boosts nothing.');
    expect(r.body.preview.goodToKnow).toEqual([]);
    expect(r.body.problems.map((p) => p.field)).toEqual(['story']);
    expect(await inApp(GUAVA)).toEqual(before);
  });
});

describe('resetting', () => {
  it('goes back to the built-in text and says who did it', async () => {
    const original = await inApp(GUAVA);
    await admin('put', `/products/${GUAVA}/knowledge`).send({ story: 'Temporary.' });
    const r = await admin('delete', `/products/${GUAVA}/knowledge`);
    expect(r.status).toBe(200);
    expect(r.body.saved).toBeNull();
    expect(await inApp(GUAVA)).toEqual(original);
    expect(_memoryTrail.map((a) => a.action)).toEqual([
      'PRODUCT_KNOWLEDGE_UPDATED',
      'PRODUCT_KNOWLEDGE_RESET',
    ]);
  });

  it('is harmless on a product that was never edited', async () => {
    const r = await admin('delete', `/products/${GUAVA}/knowledge`);
    expect(r.status).toBe(200);
    expect(_memoryTrail).toHaveLength(0);
  });
});

describe('when the database table has not been created', () => {
  it('says so in the editor, and looks again rather than waiting for a restart', async () => {
    setKnowledgeTableReady(false);
    // No database in the test process, so "look again" finds memory, which is all there is.
    const r = await admin('get', `/products/${GUAVA}/knowledge`);
    expect(r.body.canSave).toBe(true);
  });
});

describe('tidying a draft', () => {
  it('trims, collapses whitespace, and drops empty rows', () => {
    const d = normaliseKnowledgeDraft({
      story: '  two   spaces ',
      best: '   ',
      recipe: { name: ' Chaat ', mins: '5', serves: 0, needs: ['a', '  ', 'b'], steps: [' Mix. '] },
    });
    expect(d).toEqual({
      story: 'two spaces',
      best: null,
      keep: null,
      careful: null,
      recipe: { name: 'Chaat', mins: 5, serves: null, needs: ['a', 'b'], steps: ['Mix.'] },
      nutrition: 'auto',
    });
  });

  it('treats an entirely empty recipe as no recipe', () => {
    const d = normaliseKnowledgeDraft({ recipe: { name: '', needs: [''], steps: [] } });
    expect(d.recipe).toBeNull();
    expect(checkKnowledgeDraft(d)).toEqual([]);
  });
});
