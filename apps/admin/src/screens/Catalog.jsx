/**
 * Catalog — the operator's product list. Search + category filter, row-click to edit, and a create
 * drawer. Talks to GET/POST/PATCH/DELETE /admin/products. Prices are shown and edited in rupees but
 * always cross the wire as integer paise.
 */
import { useMemo, useState } from 'react';
import { useResource, usePager, toast } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { Drawer, ErrorNote, Pager, TableSkeleton, Thumb } from '../components/ui.jsx';
import { IconEdit, IconPlus, IconSearch, IconTrash } from '../components/icons.jsx';
import { UNIT_LABEL, inr, noLead, num, toPaise, toRupees } from '../lib/format.js';

const UNITS = ['KG', 'BUNCH', 'PIECE', 'DOZEN', 'PACK'];

/** Availability states, with what each means for the customer (shown in the picker). */
const AVAIL = {
  AVAILABLE: { label: 'Available', cls: 'av-available', hint: 'Customers can order it' },
  SOLD_OUT: { label: 'Sold out', cls: 'av-sold', hint: 'Shown, but can’t be added to a basket' },
  HIDDEN: { label: 'Hidden', cls: 'av-hidden', hint: 'Removed from the app catalog' },
};
const availOf = (p) => p.availability || (p.isActive === false ? 'HIDDEN' : 'AVAILABLE');

export function Catalog() {
  const { data, loading, error, reload } = useResource('/admin/products');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [editing, setEditing] = useState(null); // product | 'new' | null
  const [availFor, setAvailFor] = useState(null); // product id whose availability menu is open

  const products = useMemo(() => data?.products || [], [data]);
  const categories = data?.categories || [];

  const filtered = useMemo(() => {
    const nq = q.trim().toLowerCase();
    return products.filter((p) => {
      if (cat !== 'all' && p.categoryId !== cat) return false;
      if (!nq) return true;
      return `${p.name} ${(p.aliases || []).join(' ')}`.toLowerCase().includes(nq);
    });
  }, [products, q, cat]);
  const pager = usePager(filtered, 25, `${q}|${cat}`);

  // The status badge is a deliberate control, but it used to CYCLE on every click (Available → Sold
  // out → Hidden), so a stray click silently hid a product. Now it opens a small picker and the
  // operator chooses the state explicitly.
  async function setAvailability(p, next) {
    setAvailFor(null);
    if (next === availOf(p)) return;
    try {
      await api.patch(`/admin/products/${p.id}`, { availability: next });
      toast(`${p.name} · ${AVAIL[next].label}`);
      reload();
    } catch (e) {
      toast(e.message || 'Could not update', 'err');
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Products</h1>
          <p className="page-sub">
            {products.length} in the catalog · {categories.length} categories
          </p>
        </div>
        <button className="btn btn--primary" onClick={() => setEditing('new')}>
          <IconPlus size={18} /> New product
        </button>
      </header>

      <div className="toolbar">
        <div className="search">
          <IconSearch size={18} style={{ color: 'var(--ink-3)' }} />
          <input
            placeholder="Search name or alias — tamata, karela…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="toolbar" style={{ gap: 7 }}>
          <button
            className={`chip${cat === 'all' ? ' is-active' : ''}`}
            onClick={() => setCat('all')}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={`chip${cat === c.id ? ' is-active' : ''}`}
              onClick={() => setCat(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="glass" style={{ overflow: 'hidden' }}>
        {error ? (
          <ErrorNote error={error} onRetry={reload} />
        ) : loading ? (
          <TableSkeleton />
        ) : filtered.length === 0 ? (
          <div className="empty">No products match.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Unit</th>
                  <th style={{ textAlign: 'right' }}>Price</th>
                  <th style={{ textAlign: 'right' }}>Daily cap</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pager.slice.map((p) => (
                  <tr key={p.id} onClick={() => setEditing(p)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div className="prodcell">
                        <Thumb name={p.name} image={p.image} tint={p.tint} />
                        <div>
                          <div className="prodcell__name">{p.name}</div>
                          {p.aliases?.length > 0 && (
                            <div className="prodcell__alias">
                              {p.aliases.slice(0, 3).join(' · ')}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="muted">{p.categoryName}</td>
                    <td className="muted">
                      {p.unit}
                      {p.variableWeight ? ' ·wt' : ''}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="rupee">{inr(p.pricePaise)}</span>
                      <span className="muted" style={{ fontSize: 11 }}>
                        {UNIT_LABEL[p.unit]}
                      </span>
                    </td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      {p.dailyCap}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="dropdown">
                        <button
                          className={`badge avail ${AVAIL[availOf(p)].cls}`}
                          onClick={() => setAvailFor(availFor === p.id ? null : p.id)}
                          title="Change availability"
                          aria-haspopup="menu"
                          aria-expanded={availFor === p.id}
                        >
                          <span className="badge__dot" />
                          {AVAIL[availOf(p)].label}
                          <span className="avail__caret" aria-hidden>
                            ▾
                          </span>
                        </button>
                        {availFor === p.id && (
                          <>
                            <div className="dropdown__scrim" onClick={() => setAvailFor(null)} />
                            <div className="dropdown__menu" role="menu" style={{ minWidth: 230 }}>
                              <div className="dropdown__label">Set availability</div>
                              {Object.entries(AVAIL).map(([code, a]) => (
                                <button
                                  key={code}
                                  role="menuitemradio"
                                  aria-checked={availOf(p) === code}
                                  className="dropdown__item"
                                  onClick={() => setAvailability(p, code)}
                                >
                                  <span className={`badge ${a.cls}`} style={{ marginRight: 8 }}>
                                    <span className="badge__dot" />
                                    {a.label}
                                  </span>
                                  <span className="muted" style={{ fontSize: 12 }}>
                                    {a.hint}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                    <td>
                      <button
                        className="btn btn--ghost btn--icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(p);
                        }}
                        aria-label="Edit"
                      >
                        <IconEdit size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager {...pager} onPage={pager.setPage} />
          </div>
        )}
      </div>

      {editing && (
        <ProductForm
          product={editing === 'new' ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function ProductForm({ product, categories, onClose, onSaved }) {
  const isNew = !product;
  const [f, setF] = useState(() => ({
    name: product?.name || '',
    category: product?.categoryId || categories[0]?.id || '',
    unit: product?.unit || 'KG',
    increment: product?.increment || '0.25',
    priceR: product ? String(toRupees(product.pricePaise)) : '',
    costR: product ? String(toRupees(product.costPaise)) : '',
    dailyCap: product?.dailyCap || 50,
    bufferPct: product?.bufferPct ?? 10,
    farm: product?.farm || '',
    aliases: (product?.aliases || []).join(', '),
    image: product?.image || '',
    availability: product ? availOf(product) : 'AVAILABLE',
    variableWeight: product ? product.variableWeight : false,
  }));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (k) => (e) =>
    setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const price = toPaise(f.priceR || 0);
  const cost = toPaise(f.costR || 0);
  const marginPct = price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : 0;

  async function uploadImage(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast('Image must be under 5 MB', 'err');
    setUploading(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read the file'));
        reader.readAsDataURL(file);
      });
      const dataBase64 = String(dataUrl).split(',')[1] || '';
      const { url } = await api.post('/admin/products/upload-image', {
        contentType: file.type,
        dataBase64,
      });
      setF((s) => ({ ...s, image: url }));
      toast('Image uploaded');
    } catch (err) {
      toast(err.message || 'Could not upload image', 'err');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!f.name.trim() || !(price > 0)) return toast('Name and a price are required.', 'err');
    setSaving(true);
    const payload = {
      name: f.name.trim(),
      category: f.category,
      unit: f.unit,
      increment: String(f.increment),
      pricePaise: price,
      costPaise: cost,
      dailyCap: Number(f.dailyCap),
      bufferPct: Number(f.bufferPct),
      farm: f.farm.trim() || undefined,
      aliases: f.aliases
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      image: f.image.trim() || null,
      availability: f.availability,
      variableWeight: !!f.variableWeight,
    };
    try {
      if (isNew) await api.post('/admin/products', payload);
      else await api.patch(`/admin/products/${product.id}`, payload);
      toast(isNew ? 'Product added' : 'Product saved');
      onSaved();
    } catch (e) {
      toast(e.message || 'Could not save', 'err');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Remove ${product.name} from the catalog?`)) return;
    try {
      await api.del(`/admin/products/${product.id}`);
      toast('Product removed');
      onSaved();
    } catch (e) {
      toast(e.message || 'Could not remove', 'err');
    }
  }

  return (
    <Drawer
      title={isNew ? 'New product' : f.name}
      subtitle={isNew ? 'Add to the catalog' : product.categoryName}
      onClose={onClose}
      footer={
        <>
          {!isNew && (
            <button
              className="btn btn--ghost btn--sm"
              onClick={remove}
              style={{ color: 'var(--tomato)', marginRight: 'auto' }}
            >
              <IconTrash size={16} /> Remove
            </button>
          )}
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Add product' : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field__label">Name</label>
        <input
          className="field__input"
          value={f.name}
          onChange={(e) => setF((s) => ({ ...s, name: noLead(e.target.value) }))}
          placeholder="Tomato"
          maxLength={80}
        />
      </div>
      <div className="field__row">
        <div className="field">
          <label className="field__label">Category</label>
          <select className="field__select" value={f.category} onChange={set('category')}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label">Unit</label>
          <select className="field__select" value={f.unit} onChange={set('unit')}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field__row">
        <div className="field">
          <label className="field__label">Price (₹)</label>
          <input
            className="field__input"
            type="number"
            min="0"
            inputMode="decimal"
            value={f.priceR}
            onChange={(e) => setF((s) => ({ ...s, priceR: num(e.target.value, { max: 100000 }) }))}
            placeholder="36"
          />
        </div>
        <div className="field">
          <label className="field__label">Cost (₹)</label>
          <input
            className="field__input"
            type="number"
            min="0"
            inputMode="decimal"
            value={f.costR}
            onChange={(e) => setF((s) => ({ ...s, costR: num(e.target.value, { max: 100000 }) }))}
            placeholder="26"
          />
        </div>
      </div>
      <div className="field" style={{ marginTop: -6 }}>
        <div
          className="hstack"
          style={{
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderRadius: 10,
            background: marginPct >= 20 ? 'var(--leaf-soft)' : 'var(--amber-soft)',
          }}
        >
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: marginPct >= 20 ? 'var(--leaf-deep)' : '#9a6a00',
            }}
          >
            Margin
          </span>
          <span
            style={{ fontWeight: 700, color: marginPct >= 20 ? 'var(--leaf-deep)' : '#9a6a00' }}
          >
            {marginPct}% · {inr(price - cost)}
          </span>
        </div>
      </div>
      <div className="field__row">
        <div className="field">
          <label className="field__label">Increment</label>
          <input
            className="field__input"
            inputMode="decimal"
            value={f.increment}
            onChange={(e) => setF((s) => ({ ...s, increment: num(e.target.value, { max: 1000 }) }))}
            placeholder="0.25"
          />
        </div>
        <div className="field">
          <label className="field__label">Daily cap</label>
          <input
            className="field__input"
            type="number"
            min="1"
            inputMode="numeric"
            value={f.dailyCap}
            onChange={(e) =>
              setF((s) => ({ ...s, dailyCap: num(e.target.value, { max: 100000, integer: true }) }))
            }
          />
        </div>
      </div>
      <div className="field">
        <label className="field__label">Procurement buffer (%)</label>
        <input
          className="field__input"
          type="number"
          min="0"
          max="100"
          inputMode="numeric"
          value={f.bufferPct}
          onChange={(e) =>
            setF((s) => ({ ...s, bufferPct: num(e.target.value, { max: 100, integer: true }) }))
          }
          placeholder="10"
        />
        <p className="field__hint">
          Extra bought over what's ordered — spoilage / trim / short-weight headroom. Perishables
          higher.
        </p>
      </div>
      <div className="field">
        <label className="field__label">Farm / source</label>
        <input
          className="field__input"
          value={f.farm}
          onChange={(e) => setF((s) => ({ ...s, farm: noLead(e.target.value) }))}
          placeholder="Shamshabad belt"
          maxLength={60}
        />
      </div>
      <div className="field">
        <label className="field__label">Aliases (comma-separated)</label>
        <input
          className="field__input"
          value={f.aliases}
          onChange={set('aliases')}
          placeholder="tamata, tamatar, టమాటా"
          maxLength={200}
        />
        <p className="field__hint">Powers alias search in the app — add Telugu / Hindi names.</p>
      </div>
      <div className="field">
        <label className="field__label">Image</label>
        <div className="hstack" style={{ gap: 12, alignItems: 'flex-start' }}>
          {f.image && <Thumb name={f.name} image={f.image} tint={product?.tint} />}
          <div style={{ flex: 1 }}>
            <input
              className="field__input"
              value={f.image}
              onChange={set('image')}
              placeholder="https://…"
              maxLength={500}
            />
            <label
              className="btn btn--ghost btn--sm"
              style={{ marginTop: 8, cursor: uploading ? 'default' : 'pointer' }}
            >
              {uploading ? 'Uploading…' : 'Upload image'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/avif"
                onChange={uploadImage}
                disabled={uploading}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </div>
        <p className="field__hint">
          Paste a URL or upload a file (PNG, JPEG, WebP, AVIF · max 5 MB).
        </p>
      </div>
      <div className="field">
        <label className="field__label">Availability</label>
        <div className="seg">
          {Object.entries(AVAIL).map(([code, a]) => (
            <button
              key={code}
              type="button"
              className={`seg__btn ${a.cls}${f.availability === code ? ' is-active' : ''}`}
              onClick={() => setF((s) => ({ ...s, availability: code }))}
            >
              {a.label}
            </button>
          ))}
        </div>
        <p className="field__hint">
          <b>Available</b> — customers can order it. <b>Sold out</b> — shown in the app but can't be
          added to cart. <b>Hidden</b> — removed from the app catalog.
        </p>
      </div>
      <div className="hstack" style={{ gap: 20, marginTop: 4 }}>
        <label className="hstack" style={{ gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={f.variableWeight} onChange={set('variableWeight')} />{' '}
          <span style={{ fontSize: 13.5 }}>Variable weight</span>
        </label>
      </div>
    </Drawer>
  );
}
