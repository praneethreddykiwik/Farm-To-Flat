/**
 * Catalog — the operator's product list. Search + category filter, row-click to edit, and a create
 * drawer. Talks to GET/POST/PATCH/DELETE /admin/products. Prices are shown and edited in rupees but
 * always cross the wire as integer paise.
 */
import { useMemo, useState } from 'react';
import { useResource, toast } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { Drawer, ErrorNote, TableSkeleton, Thumb } from '../components/ui.jsx';
import { IconEdit, IconPlus, IconSearch, IconTrash } from '../components/icons.jsx';
import { UNIT_LABEL, inr, toPaise, toRupees } from '../lib/format.js';

const UNITS = ['KG', 'BUNCH', 'PIECE', 'DOZEN', 'PACK'];

export function Catalog() {
  const { data, loading, error, reload } = useResource('/admin/products');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [editing, setEditing] = useState(null); // product | 'new' | null

  const products = data?.products || [];
  const categories = data?.categories || [];

  const filtered = useMemo(() => {
    const nq = q.trim().toLowerCase();
    return products.filter((p) => {
      if (cat !== 'all' && p.categoryId !== cat) return false;
      if (!nq) return true;
      return `${p.name} ${(p.aliases || []).join(' ')}`.toLowerCase().includes(nq);
    });
  }, [products, q, cat]);

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
                {filtered.map((p) => (
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
                    <td>
                      <span className={`badge ${p.isActive ? 'st-CONFIRMED' : 'st-CANCELLED'}`}>
                        <span className="badge__dot" />
                        {p.isActive ? 'Live' : 'Hidden'}
                      </span>
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
    farm: product?.farm || '',
    aliases: (product?.aliases || []).join(', '),
    image: product?.image || '',
    isActive: product ? product.isActive : true,
    variableWeight: product ? product.variableWeight : false,
  }));
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) =>
    setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const price = toPaise(f.priceR || 0);
  const cost = toPaise(f.costR || 0);
  const marginPct = price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : 0;

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
      farm: f.farm.trim() || undefined,
      aliases: f.aliases
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      image: f.image.trim() || null,
      isActive: !!f.isActive,
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
          onChange={set('name')}
          placeholder="Tomato"
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
            value={f.priceR}
            onChange={set('priceR')}
            placeholder="36"
          />
        </div>
        <div className="field">
          <label className="field__label">Cost (₹)</label>
          <input
            className="field__input"
            type="number"
            min="0"
            value={f.costR}
            onChange={set('costR')}
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
            value={f.increment}
            onChange={set('increment')}
            placeholder="0.25"
          />
        </div>
        <div className="field">
          <label className="field__label">Daily cap</label>
          <input
            className="field__input"
            type="number"
            min="1"
            value={f.dailyCap}
            onChange={set('dailyCap')}
          />
        </div>
      </div>
      <div className="field">
        <label className="field__label">Farm / source</label>
        <input
          className="field__input"
          value={f.farm}
          onChange={set('farm')}
          placeholder="Shamshabad belt"
        />
      </div>
      <div className="field">
        <label className="field__label">Aliases (comma-separated)</label>
        <input
          className="field__input"
          value={f.aliases}
          onChange={set('aliases')}
          placeholder="tamata, tamatar, టమాటా"
        />
        <p className="field__hint">Powers alias search in the app — add Telugu / Hindi names.</p>
      </div>
      <div className="field">
        <label className="field__label">Image URL</label>
        <input
          className="field__input"
          value={f.image}
          onChange={set('image')}
          placeholder="https://…"
        />
      </div>
      <div className="hstack" style={{ gap: 20, marginTop: 4 }}>
        <label className="hstack" style={{ gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={f.isActive} onChange={set('isActive')} />{' '}
          <span style={{ fontSize: 13.5 }}>Live in app</span>
        </label>
        <label className="hstack" style={{ gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={f.variableWeight} onChange={set('variableWeight')} />{' '}
          <span style={{ fontSize: 13.5 }}>Variable weight</span>
        </label>
      </div>
    </Drawer>
  );
}
