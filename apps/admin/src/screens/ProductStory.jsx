/**
 * Product page editor — what the app says about a product beyond its price: its story, when it is
 * at its best, how to keep it, a caution, and a recipe.
 *
 * The right-hand column is not a mock-up. As the operator types, the draft goes to the API's
 * preview route and comes back as the exact document the app would be served, plus anything the
 * food rules will not allow — so the preview and the check are the server's own answer, the same
 * code that serves customers, not a second copy of the rules living in this file.
 *
 * Two things here are deliberately not editable text:
 *   • The "Good to know" lines ("Naturally high in vitamin C") are calculated from reference data.
 *     The operator chooses which food the figures come from, or turns them off.
 *   • Wording the food rules forbid on a product page is refused on save, with the phrase named.
 *
 * Talks to GET / PUT / DELETE /admin/products/:id/knowledge and POST …/knowledge/preview.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { toast } from '../lib/useApi.js';
import { Drawer, ErrorNote } from '../components/ui.jsx';
import { IconAlert, IconClock } from '../components/icons.jsx';

const LIMIT = { story: 700, best: 120, keep: 400, careful: 400, recipeName: 80 };

/** One ingredient or step per line in the editor; a list on the wire. */
const toLines = (list) => (list || []).join('\n');
const fromLines = (text) =>
  String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/** The API's draft → the flat strings the form edits. */
const toForm = (d) => ({
  story: d?.story || '',
  best: d?.best || '',
  keep: d?.keep || '',
  careful: d?.careful || '',
  recipeName: d?.recipe?.name || '',
  mins: d?.recipe?.mins ? String(d.recipe.mins) : '',
  serves: d?.recipe?.serves ? String(d.recipe.serves) : '',
  needs: toLines(d?.recipe?.needs),
  steps: toLines(d?.recipe?.steps),
  nutrition: d?.nutrition || 'auto',
});

/** …and back. Whole numbers only for minutes and servings; anything else is left out. */
const toDraft = (f) => {
  const whole = (v) => (/^\d{1,4}$/.test(String(v).trim()) && Number(v) > 0 ? Number(v) : null);
  const needs = fromLines(f.needs);
  const steps = fromLines(f.steps);
  const hasRecipe = f.recipeName.trim() || needs.length || steps.length;
  return {
    story: f.story,
    best: f.best,
    keep: f.keep,
    careful: f.careful,
    recipe: hasRecipe
      ? { name: f.recipeName, mins: whole(f.mins), serves: whole(f.serves), needs, steps }
      : null,
    nutrition: f.nutrition,
  };
};

const when = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

export function ProductStoryDrawer({ product, onClose }) {
  const [view, setView] = useState(null); // the editor document from the API
  const [loadError, setLoadError] = useState(null);
  const [f, setF] = useState(null); // the form
  const [preview, setPreview] = useState(null);
  const [problems, setProblems] = useState([]);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const started = useRef(''); // the form as loaded, to know whether anything changed

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const v = await api.get(`/admin/products/${product.id}/knowledge`);
      const form = toForm(v.draft);
      started.current = JSON.stringify(form);
      setView(v);
      setF(form);
      setPreview(v.preview);
      setProblems([]);
    } catch (e) {
      setLoadError(e);
    }
  }, [product.id]);
  useEffect(() => {
    load();
  }, [load]);

  // Ask the server what the app would show for the draft as it stands — a beat after the typing
  // stops, and never for an answer that a newer keystroke has already overtaken.
  const draftJson = f ? JSON.stringify(toDraft(f)) : '';
  useEffect(() => {
    if (!draftJson) return;
    let alive = true;
    setChecking(true);
    const id = setTimeout(async () => {
      try {
        const r = await api.post(
          `/admin/products/${product.id}/knowledge/preview`,
          JSON.parse(draftJson),
        );
        if (!alive) return;
        setPreview(r.preview);
        setProblems(r.problems || []);
      } catch (e) {
        // A field over its length limit is refused before the preview runs; say that, and keep
        // the last good preview on screen rather than blanking it mid-sentence.
        if (alive)
          setProblems([
            { field: 'form', label: '', message: e.message || 'Could not check that.' },
          ]);
      } finally {
        if (alive) setChecking(false);
      }
    }, 450);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [draftJson, product.id]);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const dirty = !!f && JSON.stringify(f) !== started.current;
  const problemsFor = (prefix) =>
    problems.filter((p) => p.field === prefix || p.field.startsWith(`${prefix}.`));

  async function save() {
    setSaving(true);
    try {
      await api.put(`/admin/products/${product.id}/knowledge`, toDraft(f));
      toast(`${product.name} · saved. The app shows it within a minute.`);
      onClose();
    } catch (e) {
      // The server's verdict wins over the preview's: show exactly what it refused.
      if (e.details?.problems?.length) setProblems(e.details.problems);
      toast(e.message || 'Could not save', 'err');
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (
      !window.confirm(
        `Go back to the built-in text for ${product.name}? What you wrote here will be removed from the app.`,
      )
    )
      return;
    setSaving(true);
    try {
      await api.del(`/admin/products/${product.id}/knowledge`);
      toast(`${product.name} · back to the built-in text`);
      onClose();
    } catch (e) {
      toast(e.message || 'Could not reset', 'err');
    } finally {
      setSaving(false);
    }
  }

  const auto = view?.nutrition?.auto;
  const blocked = problems.length > 0;

  return (
    <Drawer
      wide
      title={product.name}
      subtitle="What the app’s product page says — story, storage, recipe"
      onClose={onClose}
      footer={
        f ? (
          <>
            {view?.saved && (
              <button
                className="btn btn--ghost btn--sm"
                onClick={reset}
                disabled={saving}
                style={{ marginRight: 'auto' }}
              >
                Reset to built-in text
              </button>
            )}
            <button className="btn btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn--primary"
              onClick={save}
              disabled={saving || blocked || !dirty || view?.canSave === false}
              title={
                blocked
                  ? 'Fix the highlighted wording first'
                  : !dirty
                    ? 'Nothing has changed'
                    : undefined
              }
            >
              {saving ? 'Saving…' : 'Save to the app'}
            </button>
          </>
        ) : null
      }
    >
      {loadError ? (
        <ErrorNote error={loadError} onRetry={load} />
      ) : !f ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="story">
          <div className="story__form">
            {view.canSave === false && (
              <div className="story__warn" role="alert">
                <IconAlert size={18} />
                <div>
                  <b>Edits cannot be saved yet.</b> The database table for product pages has not
                  been created. The app is showing the built-in text. Ask whoever runs the database
                  to create the <span className="mono">ProductKnowledge</span> table, then reopen
                  this.
                </div>
              </div>
            )}

            <p className="story__status">
              <IconClock size={14} />
              {view.saved
                ? `Edited${view.saved.updatedBy ? ` by ${view.saved.updatedBy}` : ''} · ${when(view.saved.updatedAt)}`
                : view.original
                  ? 'Showing the built-in text. Save to replace it with yours.'
                  : 'Nothing written for this product yet — the app shows no story or recipe.'}
            </p>

            <Area
              label="Its story"
              hint="Where it grows, how it is cooked, what it tastes like. Two or three sentences."
              value={f.story}
              onChange={set('story')}
              max={LIMIT.story}
              rows={4}
              problems={problemsFor('story')}
            />
            <div className="field">
              <label className="field__label" htmlFor="ps-best">
                At its best
              </label>
              <input
                id="ps-best"
                className="field__input"
                value={f.best}
                onChange={set('best')}
                maxLength={LIMIT.best}
                placeholder="Monsoon through winter"
              />
              <Problems list={problemsFor('best')} />
            </div>
            <Area
              label="How to keep it"
              value={f.keep}
              onChange={set('keep')}
              max={LIMIT.keep}
              rows={2}
              problems={problemsFor('keep')}
            />
            <Area
              label="Worth knowing"
              hint="A kitchen caution — “wash well, the leaves hold grit”. Leave empty to show nothing."
              value={f.careful}
              onChange={set('careful')}
              max={LIMIT.careful}
              rows={2}
              problems={problemsFor('careful')}
            />

            <h4 className="story__section">Recipe</h4>
            <div className="field">
              <label className="field__label" htmlFor="ps-rname">
                Dish
              </label>
              <input
                id="ps-rname"
                className="field__input"
                value={f.recipeName}
                onChange={set('recipeName')}
                maxLength={LIMIT.recipeName}
                placeholder="Gongura pachadi"
              />
              <Problems list={problemsFor('recipe.name')} />
            </div>
            <div className="field__row">
              <div className="field">
                <label className="field__label" htmlFor="ps-mins">
                  Minutes
                </label>
                <input
                  id="ps-mins"
                  className="field__input"
                  inputMode="numeric"
                  value={f.mins}
                  onChange={set('mins')}
                  maxLength={4}
                  placeholder="25"
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="ps-serves">
                  Serves
                </label>
                <input
                  id="ps-serves"
                  className="field__input"
                  inputMode="numeric"
                  value={f.serves}
                  onChange={set('serves')}
                  maxLength={2}
                  placeholder="4"
                />
              </div>
            </div>
            <Area
              label="You’ll need"
              hint="One ingredient per line."
              value={f.needs}
              onChange={set('needs')}
              rows={5}
              problems={problemsFor('recipe.needs')}
            />
            <Area
              label="How"
              hint="One step per line. They are numbered in the app."
              value={f.steps}
              onChange={set('steps')}
              rows={5}
              problems={problemsFor('recipe.steps')}
            />

            <h4 className="story__section">Good to know — the nutrition lines</h4>
            <div className="field">
              <label className="field__label" htmlFor="ps-nutrition">
                Figures come from
              </label>
              <select
                id="ps-nutrition"
                className="field__select"
                value={f.nutrition}
                onChange={set('nutrition')}
              >
                <option value="auto">
                  {auto
                    ? `Automatic — ${auto.label}${auto.exact ? '' : ' (not an exact match: no lines shown)'}`
                    : 'Automatic — no matching food, so no lines'}
                </option>
                <option value="off">Don’t show nutrition lines</option>
                {view.nutrition.foods.map((food) => (
                  <option key={food.key} value={food.key}>
                    {food.label}
                    {food.description ? ` — ${food.description}` : ''}
                  </option>
                ))}
              </select>
              <p className="field__hint">
                These lines are calculated from published reference figures against the food-claims
                thresholds. They cannot be typed, here or anywhere: choose the food, and the app
                says only what the figures support.
              </p>
              <Problems list={problemsFor('nutrition')} />
            </div>
            <Problems list={problemsFor('form')} />
          </div>

          <aside className="story__side" aria-label="What the app shows">
            <div className="story__sidehead">
              <span>What the app shows</span>
              <span className="muted">{checking ? 'checking…' : dirty ? 'not saved yet' : ''}</span>
            </div>
            <Phone name={product.name} k={preview} />
            {blocked && (
              <div className="story__blocked" role="alert">
                <IconAlert size={16} />
                <span>
                  {problems.length === 1
                    ? 'One thing has to change before this can be saved.'
                    : `${problems.length} things have to change before this can be saved.`}
                </span>
              </div>
            )}
          </aside>
        </div>
      )}
    </Drawer>
  );
}

function Problems({ list }) {
  if (!list?.length) return null;
  return (
    <ul className="story__problems" role="alert">
      {list.map((p, i) => (
        <li key={`${p.field}-${i}`}>
          {/* "Step 2: …" when the field is one line of many, so the operator knows which. */}
          {/^recipe\.(needs|steps)\.\d+$/.test(p.field) ? <b>{p.label}: </b> : null}
          {p.message}
        </li>
      ))}
    </ul>
  );
}

/** @param {{ label: string, hint?: string, value: any, onChange: (e: any) => void, max?: number, rows?: number, problems: any[] }} props */
function Area({ label, hint, value, onChange, max, rows = 3, problems }) {
  const id = `ps-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {max ? (
          <span className={`story__count${value.length > max * 0.9 ? ' is-near' : ''}`}>
            {value.length}/{max}
          </span>
        ) : null}
      </label>
      <textarea
        id={id}
        className={`field__input story__area${problems?.length ? ' has-problem' : ''}`}
        value={value}
        onChange={onChange}
        maxLength={max}
        rows={rows}
      />
      {hint ? <p className="field__hint">{hint}</p> : null}
      <Problems list={problems} />
    </div>
  );
}

/**
 * The product page's three tabs, laid out one under another so the whole page is visible at once.
 * Rendered from the document the API returned — the same one the phone is served.
 */
function Phone({ name, k }) {
  const hasKnow = k && (k.goodToKnow?.length > 0 || k.nutrition);
  const hasStory = k && (k.story || k.best || k.keep || k.careful);
  return (
    <div className="phone">
      <div className="phone__name">{name}</div>
      {!k || (!hasKnow && !hasStory && !k.recipe) ? (
        <p className="phone__empty">
          Nothing to show. The product page will have its price and “How it reaches you”, and no
          tabs below.
        </p>
      ) : (
        <>
          {hasKnow ? (
            <section>
              <div className="phone__tab">Good to know</div>
              {k.goodToKnow.map((c) => (
                <div key={c.text} className="phone__claim">
                  <span className="phone__dot" />
                  <div>
                    <div className="phone__strong">{c.text}</div>
                    <div className="phone__muted">
                      {c.amount}
                      {c.pctDaily ? ` · ${c.pctDaily}% of an adult’s daily requirement` : ''}
                    </div>
                    {c.role ? <div className="phone__role">{c.role}</div> : null}
                  </div>
                </div>
              ))}
              {k.nutrition ? (
                <div className="phone__table">
                  <div className="phone__per">Per {k.nutrition.per}</div>
                  <div className="phone__cells">
                    {k.nutrition.rows.map((r) => (
                      <div key={r.label}>
                        <div className="phone__strong">{r.value}</div>
                        <div className="phone__muted">{r.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {k.footnote ? (
                <p className="phone__foot">
                  {k.footnote}
                  {k.nutrition?.source ? ` Source: ${k.nutrition.source}.` : ''}
                </p>
              ) : null}
            </section>
          ) : null}

          {hasStory ? (
            <section>
              <div className="phone__tab">Its story</div>
              {k.story ? <p className="phone__story">{k.story}</p> : null}
              {k.best ? (
                <>
                  <div className="phone__label">At its best</div>
                  <div className="phone__strong">{k.best}</div>
                </>
              ) : null}
              {k.keep ? (
                <>
                  <div className="phone__label">How to keep it</div>
                  <div className="phone__body">{k.keep}</div>
                </>
              ) : null}
              {/* In the app this is an amber note with a warning mark, not a labelled line. */}
              {k.careful ? (
                <div className="phone__careful">
                  <IconAlert size={15} />
                  <span>{k.careful}</span>
                </div>
              ) : null}
            </section>
          ) : null}

          {k.recipe ? (
            <section>
              <div className="phone__tab">Recipe</div>
              <div className="phone__dish">{k.recipe.name}</div>
              <div className="phone__muted">
                {[
                  k.recipe.mins ? `${k.recipe.mins} min` : null,
                  k.recipe.serves ? `Serves ${k.recipe.serves}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              {k.recipe.needs?.length ? (
                <>
                  <div className="phone__label">You’ll need</div>
                  <ul className="phone__needs">
                    {k.recipe.needs.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {k.recipe.steps?.length ? (
                <>
                  <div className="phone__label">How</div>
                  <ol className="phone__steps">
                    {k.recipe.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
