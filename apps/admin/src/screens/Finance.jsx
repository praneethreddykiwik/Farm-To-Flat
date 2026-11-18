/**
 * Finance — the full profit-and-loss for any date range, and the running costs that go into it.
 *
 *   Profit & loss  revenue → net sales → gross profit → net profit before and after tax.
 *                  Produce cost and the buffer come from the orders; operating expenses come from
 *                  the Expenses tab (a monthly one is spread across the days it covers).
 *   Expenses       add, edit and delete costs, or import a month of them from a spreadsheet.
 *
 * API: GET /admin/finance, /admin/finance/expenses (+ POST/PATCH/DELETE, POST …/import),
 * GET/PUT /admin/finance/settings. Money is integer paise; rupees are typed and converted here.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { toast, useResource } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { Drawer, ErrorNote, Stat, TableSkeleton } from '../components/ui.jsx';
import {
  IconDownload,
  IconEdit,
  IconLedger,
  IconPlus,
  IconRupee,
  IconTrash,
  IconTrend,
  IconUpload,
} from '../components/icons.jsx';
import {
  DateRange,
  SetupBanner,
  Tabs,
  istToday,
  paiseFrom,
  pctText,
  rangeLabel,
  rupeeInput,
  useDateRange,
} from '../components/business.jsx';
import { inr, noLead, num, shortDate } from '../lib/format.js';

const TABS = [
  { key: 'pnl', label: 'Profit & loss' },
  { key: 'expenses', label: 'Expenses' },
];

export function Finance() {
  const dr = useDateRange('month');
  const [tab, setTab] = useState('pnl');
  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Finance</h1>
          <p className="page-sub">
            What the business made, after every cost, for {rangeLabel(dr.range)}.
          </p>
        </div>
      </header>
      <SetupBanner />
      <DateRange dr={dr} />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'pnl' ? <ProfitAndLoss qs={dr.qs} /> : <Expenses qs={dr.qs} range={dr.range} />}
    </>
  );
}

// ── profit & loss ───────────────────────────────────────────────────────────

/** "−₹350" for a loss, rather than "₹-350". */
const signed = (paise) => (Number(paise) < 0 ? `−${inr(Math.abs(Number(paise)))}` : inr(paise));

/** A money cell: minus sign and red for a cost, so the statement reads top to bottom. */
const Money = ({ paise, minus = false }) => {
  const n = Number(paise) || 0;
  const neg = minus ? n !== 0 : n < 0;
  return <span className={neg ? 'neg' : undefined}>{`${neg ? '− ' : ''}${inr(Math.abs(n))}`}</span>;
};

function ProfitAndLoss({ qs }) {
  const { data, loading, error, reload } = useResource(`/admin/finance?${qs}`);
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!data)
    return (
      <div className="glass card">
        <div className="skeleton" style={{ height: 360 }} />
      </div>
    );
  const L = data.lines;
  const cats = data.expensesByCategory;
  return (
    <div className="vstack" style={{ gap: 16, opacity: loading ? 0.6 : 1 }}>
      <div className="stat-grid stagger">
        <Stat
          icon={<IconRupee size={20} />}
          tint="sprout"
          value={signed(L.netSalesPaise)}
          label={`Net sales · ${data.orders} orders`}
        />
        <Stat
          icon={<IconTrend size={20} />}
          value={signed(L.grossProfitPaise)}
          label={`Gross profit · ${pctText(L.grossMarginPct)}`}
        />
        <Stat
          icon={<IconLedger size={20} />}
          value={inr(L.operatingExpensesPaise)}
          label="Operating expenses"
        />
        <Stat
          icon={<IconRupee size={20} />}
          value={signed(L.netProfitAfterTaxPaise)}
          label={`Net profit after tax · ${pctText(L.netMarginPct)}`}
        />
      </div>
      <div className="grid-2">
        <div className="glass card reveal">
          <div className="card__head">
            <h2 className="card__title">Profit & loss</h2>
            <span className="muted" style={{ fontSize: 12.5 }}>
              {data.range.days} days · delivered and in-hand orders, by delivery date
            </span>
          </div>
          <table className="pnl">
            <tbody>
              <tr>
                <td>Revenue (items sold)</td>
                <td>
                  <Money paise={L.revenuePaise} />
                </td>
              </tr>
              <tr className="pnl__sub">
                <td>Coupon discounts</td>
                <td>
                  <Money paise={L.discountsPaise} minus />
                </td>
              </tr>
              <tr className="pnl__sub">
                <td>Delivery fees</td>
                <td>
                  <Money paise={L.deliveryFeesPaise} />
                </td>
              </tr>
              <tr className="pnl__sub">
                <td>Other fees charged</td>
                <td>
                  <Money paise={L.otherFeesPaise} />
                </td>
              </tr>
              <tr className="pnl__total">
                <td>Net sales</td>
                <td>
                  <Money paise={L.netSalesPaise} />
                </td>
              </tr>
              <tr className="pnl__sub">
                <td>Produce cost</td>
                <td>
                  <Money paise={L.produceCostPaise} minus />
                </td>
              </tr>
              <tr className="pnl__sub">
                <td>Buffer cost (extra bought on top of orders)</td>
                <td>
                  <Money paise={L.bufferCostPaise} minus />
                </td>
              </tr>
              <tr className="pnl__total">
                <td>
                  Gross profit{' '}
                  <span className="muted" style={{ fontWeight: 500 }}>
                    · {pctText(L.grossMarginPct)} margin
                  </span>
                </td>
                <td>
                  <Money paise={L.grossProfitPaise} />
                </td>
              </tr>
              {cats.map((c) => (
                <tr className="pnl__sub" key={c.category}>
                  <td>
                    {c.label}{' '}
                    <span className="muted" style={{ fontSize: 11.5 }}>
                      {Number(c.fixedPaise) > 0 && Number(c.variablePaise) > 0
                        ? `fixed ${inr(c.fixedPaise)} · variable ${inr(c.variablePaise)}`
                        : Number(c.fixedPaise) > 0
                          ? 'fixed'
                          : 'variable'}
                    </span>
                  </td>
                  <td>
                    <Money paise={c.totalPaise} minus />
                  </td>
                </tr>
              ))}
              <tr className="pnl__sub">
                <td>
                  Referral rewards paid{' '}
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    variable
                  </span>
                </td>
                <td>
                  <Money paise={L.referralRewardsPaise} minus />
                </td>
              </tr>
              <tr className="pnl__sub">
                <td style={{ fontWeight: 600 }}>
                  Operating expenses{' '}
                  <span className="muted" style={{ fontSize: 11.5, fontWeight: 400 }}>
                    fixed {inr(data.fixedPaise)} · variable {inr(data.variablePaise)}
                  </span>
                </td>
                <td style={{ fontWeight: 600 }}>
                  <Money paise={L.operatingExpensesPaise} minus />
                </td>
              </tr>
              <tr className="pnl__total">
                <td>Net profit before tax</td>
                <td>
                  <Money paise={L.netProfitBeforeTaxPaise} />
                </td>
              </tr>
              <tr className="pnl__sub">
                <td>
                  <TaxRate pct={L.incomeTaxPct} onSaved={reload} />
                </td>
                <td>
                  <Money paise={L.estimatedTaxPaise} minus />
                </td>
              </tr>
              <tr className="pnl__final">
                <td>
                  Net profit after tax{' '}
                  <span className="muted" style={{ fontWeight: 500 }}>
                    · {pctText(L.netMarginPct)} of net sales
                  </span>
                </td>
                <td>
                  <Money paise={L.netProfitAfterTaxPaise} />
                </td>
              </tr>
            </tbody>
          </table>
          <p className="field__hint" style={{ marginTop: 12 }}>
            GST collected: <b>{inr(L.gstCollectedPaise)}</b> — shown separately because it is passed
            on to the government, not income. Tax is an estimate on profit, not tax advice. Monthly
            expenses are spread evenly across the days they cover.
          </p>
        </div>
        <div className="glass card reveal">
          <div className="card__head">
            <h2 className="card__title" style={{ fontSize: 15 }}>
              Buffer & wastage
            </h2>
          </div>
          <dl className="demand__facts" style={{ margin: 0 }}>
            <div className="demand__fact">
              <dt>Extra bought</dt>
              <dd>{inr(data.wastage.extraCostPaise)}</dd>
            </div>
            <div className="demand__fact">
              <dt>Used</dt>
              <dd>{inr(data.wastage.usedCostPaise)}</dd>
            </div>
            <div className="demand__fact">
              <dt>Thrown away</dt>
              <dd>{inr(data.wastage.wastedCostPaise)}</dd>
            </div>
            <div className="demand__fact">
              <dt>Wasted share of the extra</dt>
              <dd>{pctText(data.wastage.wastedPctOfExtra)}</dd>
            </div>
          </dl>
          <p className="field__hint">
            Recorded on {data.wastage.recordedLines} of {data.wastage.lines} product-days. Staff
            enter used and wasted quantities under Procurement → Buffer & wastage.
          </p>
        </div>
      </div>
    </div>
  );
}

/** "Estimated income tax at [25]%" — the rate is editable where it is used. */
function TaxRate({ pct, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(String(pct));
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(String(pct)), [pct]);
  async function save() {
    const n = Number(v);
    if (v === '' || !(n >= 0 && n <= 60))
      return toast('Enter a tax rate between 0 and 60%.', 'err');
    setBusy(true);
    try {
      await api.put('/admin/finance/settings', { incomeTaxPct: n });
      toast(`Tax rate set to ${n}%`);
      setEditing(false);
      onSaved();
    } catch (e) {
      toast(e.message || 'Could not save the tax rate', 'err');
    } finally {
      setBusy(false);
    }
  }
  if (!editing)
    return (
      <span>
        Estimated income tax at {pct}%{' '}
        <button
          className="btn btn--ghost btn--sm"
          style={{ padding: '2px 8px', marginLeft: 4 }}
          onClick={() => setEditing(true)}
        >
          Change
        </button>
      </span>
    );
  return (
    <span className="hstack" style={{ gap: 6 }}>
      Estimated income tax at
      <input
        className="field__input"
        style={{ width: 70, padding: '4px 8px', fontSize: 13 }}
        inputMode="decimal"
        value={v}
        autoFocus
        onChange={(e) => setV(num(e.target.value, { max: 60 }))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
        aria-label="Income tax rate, percent"
      />
      %
      <button className="btn btn--primary btn--sm" onClick={save} disabled={busy}>
        Save
      </button>
      <button className="btn btn--ghost btn--sm" onClick={() => setEditing(false)}>
        Cancel
      </button>
    </span>
  );
}

// ── expenses ────────────────────────────────────────────────────────────────

function Expenses({ qs, range }) {
  const [all, setAll] = useState(false);
  const { data, loading, error, reload } = useResource(
    `/admin/finance/expenses?${qs}${all ? '&all=1' : ''}`,
  );
  const categories = data?.categories || {};
  const expenses = data?.expenses || [];
  const [editing, setEditing] = useState(/** @type {any} */ (null));
  const [importing, setImporting] = useState(false);
  const total = expenses.reduce(
    (s, e) => s + (e.recurring === 'MONTHLY' ? 0 : Number(e.amountPaise)),
    0,
  );
  const monthly = expenses.reduce(
    (s, e) => s + (e.recurring === 'MONTHLY' ? Number(e.amountPaise) : 0),
    0,
  );

  async function remove(e) {
    if (
      !confirm(
        `Delete this expense?\n\n${e.categoryLabel} · ${inr(e.amountPaise)} on ${shortDate(e.date)}`,
      )
    )
      return;
    try {
      await api.del(`/admin/finance/expenses/${e.id}`);
      toast('Expense deleted');
      reload();
    } catch (err) {
      toast(err.message || 'Could not delete the expense', 'err');
    }
  }

  return (
    <>
      <div
        className="hstack"
        style={{ justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 16 }}
      >
        <label className="check">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          Show every expense, not only {rangeLabel(range)}
        </label>
        <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => setImporting(true)} disabled={!data}>
            <IconUpload size={17} /> Import from spreadsheet
          </button>
          <button className="btn btn--primary" onClick={() => setEditing('new')} disabled={!data}>
            <IconPlus size={17} /> Add expense
          </button>
        </div>
      </div>
      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : !data ? (
        <div className="glass card">
          <TableSkeleton rows={5} />
        </div>
      ) : expenses.length === 0 ? (
        <div className="glass card">
          <div className="empty">
            <p style={{ fontWeight: 600, color: 'var(--ink-2)' }}>No expenses in this range.</p>
            <p style={{ marginTop: 6 }}>
              Add rent, salaries, fuel, packaging and the rest — or import them from a spreadsheet —
              so the profit-and-loss shows the real net profit.
            </p>
          </div>
        </div>
      ) : (
        <div className="glass card reveal" style={{ padding: 0, opacity: loading ? 0.6 : 1 }}>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Kind</th>
                  <th className="num">Amount</th>
                  <th>Repeats</th>
                  <th>Vendor</th>
                  <th>Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td className="data__name">{shortDate(e.date)}</td>
                    <td className="data__name" style={{ fontWeight: 600 }}>
                      {e.categoryLabel}
                    </td>
                    <td>
                      <span className={`pill ${e.kind === 'FIXED' ? 'pill--sky' : 'pill--amber'}`}>
                        {e.kind === 'FIXED' ? 'Fixed' : 'Variable'}
                      </span>
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      {inr(e.amountPaise)}
                    </td>
                    <td className="data__name">
                      {e.recurring === 'MONTHLY' ? (
                        <>
                          Monthly
                          <div className="muted" style={{ fontSize: 11.5 }}>
                            {e.endDate ? `until ${shortDate(e.endDate)}` : 'no end date'}
                          </div>
                        </>
                      ) : (
                        <span className="muted">Once</span>
                      )}
                    </td>
                    <td className="data__name">{e.vendor || <span className="muted">—</span>}</td>
                    <td className="muted" style={{ fontSize: 12.5, maxWidth: 240 }}>
                      {e.note || '—'}
                    </td>
                    <td className="row-actions-cell">
                      <div className="row-actions">
                        <button className="btn btn--ghost btn--sm" onClick={() => setEditing(e)}>
                          <IconEdit size={15} /> Edit
                        </button>
                        <button
                          className="btn btn--ghost btn--icon"
                          style={{ color: 'var(--tomato)' }}
                          onClick={() => remove(e)}
                          aria-label="Delete expense"
                        >
                          <IconTrash size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="field__hint" style={{ padding: '0 16px 14px' }}>
            One-off expenses listed: {inr(total)}. Monthly expenses listed: {inr(monthly)} a month —
            the profit-and-loss counts the part of each month that falls in the range.
          </p>
        </div>
      )}
      {editing && (
        <ExpenseDrawer
          expense={editing === 'new' ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
      {importing && (
        <ImportDrawer
          categories={categories}
          onClose={() => setImporting(false)}
          onDone={() => {
            setImporting(false);
            reload();
          }}
        />
      )}
    </>
  );
}

function ExpenseDrawer({ expense, categories, onClose, onSaved }) {
  const isNew = !expense;
  const [f, setF] = useState({
    date: expense?.date || istToday(),
    category: expense?.category || Object.keys(categories)[0] || 'OTHER',
    kind: expense?.kind || 'VARIABLE',
    amount: expense ? rupeeInput(expense.amountPaise) : '',
    recurring: expense?.recurring || 'NONE',
    endDate: expense?.endDate || '',
    vendor: expense?.vendor || '',
    note: expense?.note || '',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function save() {
    setErr('');
    const amountPaise = paiseFrom(f.amount);
    if (!f.date) return setErr('Pick the date of the expense.');
    if (!amountPaise || amountPaise <= 0) return setErr('Enter an amount in rupees, above zero.');
    if (amountPaise > 1_000_000_000) return setErr('That amount is too large (limit ₹1 crore).');
    if (f.recurring === 'MONTHLY' && f.endDate && f.endDate < f.date)
      return setErr('The end date is before the start date.');
    const body = {
      date: f.date,
      category: f.category,
      kind: f.kind,
      amountPaise,
      recurring: f.recurring,
      endDate: f.recurring === 'MONTHLY' && f.endDate ? f.endDate : null,
      vendor: f.vendor.trim() || null,
      note: f.note.trim() || null,
    };
    setBusy(true);
    try {
      if (isNew) await api.post('/admin/finance/expenses', body);
      else await api.patch(`/admin/finance/expenses/${expense.id}`, body);
      toast(isNew ? `Expense of ${inr(amountPaise)} added` : 'Expense saved');
      onSaved();
    } catch (e) {
      setErr(e.message || 'Could not save the expense.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      title={isNew ? 'Add an expense' : 'Edit expense'}
      subtitle="Money spent running the business, other than the produce itself."
      onClose={onClose}
      footer={
        <div className="hstack" style={{ justifyContent: 'space-between', width: '100%' }}>
          <span style={{ fontSize: 12.5, color: 'var(--tomato)' }}>{err}</span>
          <button className="btn btn--primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Add expense' : 'Save'}
          </button>
        </div>
      }
    >
      <div className="field__row">
        <div className="field">
          <label className="field__label">{f.recurring === 'MONTHLY' ? 'Starts on' : 'Date'}</label>
          <input type="date" className="field__input" value={f.date} onChange={set('date')} />
        </div>
        <div className="field">
          <label className="field__label">Amount (₹)</label>
          <input
            className="field__input"
            inputMode="decimal"
            value={f.amount}
            onChange={(e) =>
              setF((s) => ({ ...s, amount: num(e.target.value, { max: 10000000 }) }))
            }
            placeholder="12000"
            autoFocus={isNew}
          />
        </div>
      </div>
      <div className="field">
        <label className="field__label">Category</label>
        <select className="field__select" value={f.category} onChange={set('category')}>
          {Object.entries(categories).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field__label">Fixed or variable</label>
        <div className="seg">
          {[
            ['FIXED', 'Fixed — the same whatever we sell'],
            ['VARIABLE', 'Variable — grows with orders'],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`seg__btn${f.kind === k ? ' is-active' : ''}`}
              style={
                f.kind === k
                  ? { background: 'var(--leaf-soft)', color: 'var(--leaf-deep)' }
                  : undefined
              }
              onClick={() => setF((s) => ({ ...s, kind: k }))}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="field__row">
        <div className="field">
          <label className="field__label">Repeats</label>
          <select className="field__select" value={f.recurring} onChange={set('recurring')}>
            <option value="NONE">Once</option>
            <option value="MONTHLY">Every month</option>
          </select>
        </div>
        {f.recurring === 'MONTHLY' && (
          <div className="field">
            <label className="field__label">Ends on (optional)</label>
            <input
              type="date"
              className="field__input"
              value={f.endDate}
              min={f.date}
              onChange={set('endDate')}
            />
          </div>
        )}
      </div>
      <div className="field">
        <label className="field__label">Vendor (optional)</label>
        <input
          className="field__input"
          value={f.vendor}
          maxLength={80}
          onChange={(e) => setF((s) => ({ ...s, vendor: noLead(e.target.value) }))}
          placeholder="Sri Sai Transport"
        />
      </div>
      <div className="field">
        <label className="field__label">Note (optional)</label>
        <textarea
          className="field__input"
          value={f.note}
          maxLength={200}
          onChange={(e) => setF((s) => ({ ...s, note: noLead(e.target.value) }))}
        />
      </div>
    </Drawer>
  );
}

// ── spreadsheet import ──────────────────────────────────────────────────────

const TEMPLATE_HEAD = ['date', 'category', 'kind', 'amount', 'recurring', 'vendor', 'note'];

/** A template the operator can fill in Excel or Google Sheets and save as CSV. */
function templateCsv() {
  const rows = [
    TEMPLATE_HEAD,
    [istToday(), 'RENT', 'FIXED', '25000', 'MONTHLY', 'Hub landlord', 'Hub rent'],
    [istToday(), 'FUEL', 'VARIABLE', '1850.50', 'NONE', 'HP Petrol', 'Van diesel'],
  ];
  return rows.map((r) => r.join(',')).join('\n');
}

function downloadTemplate() {
  const blob = new Blob([templateCsv()], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fooducia-expenses-template.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** "19/11/2026", "19-11-2026" or "2026-11-19" → "2026-11-19"; null if it is not a real date. */
function readDate(s) {
  const t = String(s || '').trim();
  let y, m, d;
  let mm = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (mm) [, y, m, d] = mm;
  else if ((mm = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) [, d, m, y] = mm;
  else return null;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso ? null : iso;
}

/** One spreadsheet row → { row, errors[] }. */
function checkRow(raw, categories) {
  const g = (k) => String(raw[k] ?? '').trim();
  const errors = [];
  const date = readDate(g('date'));
  if (!date) errors.push('date must be like 2026-11-19 or 19/11/2026');
  const catIn = g('category');
  const byLabel = Object.entries(categories).find(
    ([, v]) => v.toLowerCase() === catIn.toLowerCase(),
  );
  const category = categories[catIn.toUpperCase()] ? catIn.toUpperCase() : byLabel?.[0] || null;
  if (!category) errors.push(`unknown category “${catIn || '(blank)'}”`);
  const kindIn = g('kind').toUpperCase();
  const kind = kindIn === 'FIXED' || kindIn === 'VARIABLE' ? kindIn : null;
  if (!kind) errors.push('kind must be FIXED or VARIABLE');
  const amountPaise = paiseFrom(g('amount'));
  if (!amountPaise || amountPaise <= 0) errors.push('amount must be rupees above zero');
  else if (amountPaise > 1_000_000_000) errors.push('amount is over ₹1 crore');
  const recIn = g('recurring').toUpperCase();
  const recurring =
    recIn === '' || recIn === 'NONE' || recIn === 'NO' || recIn === 'ONCE'
      ? 'NONE'
      : recIn === 'MONTHLY'
        ? 'MONTHLY'
        : null;
  if (!recurring) errors.push('recurring must be NONE or MONTHLY');
  const endIn = g('end_date') || g('enddate') || g('end date');
  const endDate = endIn ? readDate(endIn) : null;
  if (endIn && !endDate) errors.push('end date is not a date');
  if (endDate && date && endDate < date) errors.push('end date is before the date');
  const vendor = g('vendor').slice(0, 80) || null;
  const note = g('note').slice(0, 200) || null;
  return {
    row: {
      date,
      category,
      kind,
      amountPaise,
      recurring,
      endDate: recurring === 'MONTHLY' ? endDate : null,
      vendor,
      note,
    },
    errors,
  };
}

function ImportDrawer({ categories, onClose, onDone }) {
  const [file, setFile] = useState('');
  const [rows, setRows] = useState(/** @type {{row:any, errors:string[], line:number}[]} */ ([]));
  const [parseErr, setParseErr] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef(/** @type {HTMLInputElement|null} */ (null));
  const valid = useMemo(() => rows.filter((r) => r.errors.length === 0), [rows]);

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f.name);
    setParseErr('');
    setRows([]);
    Papa.parse(f, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) =>
        h
          .trim()
          .toLowerCase()
          .replace(/\s*\(.*\)\s*$/, ''),
      complete: (res) => {
        const fields = res.meta.fields || [];
        const missing = ['date', 'category', 'kind', 'amount'].filter((c) => !fields.includes(c));
        if (missing.length) {
          setParseErr(`The file has no ${missing.join(', ')} column. Start from the template.`);
          return;
        }
        if (res.data.length > 500) {
          setParseErr(`That is ${res.data.length} rows; import at most 500 at a time.`);
          return;
        }
        setRows(res.data.map((raw, i) => ({ ...checkRow(raw, categories), line: i + 2 })));
      },
      error: (err) => setParseErr(err.message || 'Could not read that file.'),
    });
  }

  async function doImport() {
    if (!valid.length) return;
    setBusy(true);
    try {
      const r = await api.post('/admin/finance/expenses/import', { rows: valid.map((v) => v.row) });
      toast(`${r.imported} ${r.imported === 1 ? 'expense' : 'expenses'} imported`);
      onDone();
    } catch (e) {
      toast(e.message || 'Could not import the expenses', 'err');
    } finally {
      setBusy(false);
    }
  }

  const bad = rows.length - valid.length;
  return (
    <Drawer
      wide
      title="Import expenses from a spreadsheet"
      subtitle="Save the sheet as CSV with columns: date, category, kind, amount (₹), recurring, vendor, note."
      onClose={onClose}
      footer={
        <div className="hstack" style={{ justifyContent: 'space-between', width: '100%' }}>
          <span style={{ fontSize: 12.5, color: bad ? 'var(--tomato)' : 'var(--ink-3)' }}>
            {rows.length
              ? bad
                ? `${bad} ${bad === 1 ? 'row has' : 'rows have'} problems and will be skipped.`
                : 'Every row looks right.'
              : ''}
          </span>
          <button className="btn btn--primary" onClick={doImport} disabled={busy || !valid.length}>
            <IconUpload size={17} />{' '}
            {busy ? 'Importing…' : `Import ${valid.length} ${valid.length === 1 ? 'row' : 'rows'}`}
          </button>
        </div>
      }
    >
      <div className="hstack" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button className="btn" onClick={() => input.current?.click()}>
          <IconUpload size={17} /> Choose a .csv file
        </button>
        <button className="btn btn--ghost" onClick={downloadTemplate}>
          <IconDownload size={17} /> Download template CSV
        </button>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          style={{ display: 'none' }}
        />
        {file && (
          <span className="muted mono" style={{ fontSize: 12.5 }}>
            {file}
          </span>
        )}
      </div>
      <p className="field__hint" style={{ marginTop: 0 }}>
        Category is one of:{' '}
        {Object.entries(categories)
          .map(([k, v]) => `${k} (${v})`)
          .join(', ')}
        . Kind is FIXED or VARIABLE. Recurring is NONE or MONTHLY; an optional end_date column ends
        a monthly one. Dates as 2026-11-19 or 19/11/2026. Nothing is saved until you press Import.
      </p>
      {parseErr && <p style={{ color: 'var(--tomato)', fontSize: 13 }}>{parseErr}</p>}
      {rows.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Line</th>
                <th>Date</th>
                <th>Category</th>
                <th>Kind</th>
                <th className="num">Amount</th>
                <th>Repeats</th>
                <th>Vendor</th>
                <th>Problem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ row, errors, line }) => (
                <tr key={line} className={errors.length ? 'row-err' : undefined}>
                  <td className="num">{line}</td>
                  <td className="data__name">{row.date ? shortDate(row.date) : '—'}</td>
                  <td className="data__name">{row.category ? categories[row.category] : '—'}</td>
                  <td>{row.kind || '—'}</td>
                  <td className="num">{row.amountPaise ? inr(row.amountPaise) : '—'}</td>
                  <td>
                    {row.recurring === 'MONTHLY'
                      ? 'Monthly'
                      : row.recurring === 'NONE'
                        ? 'Once'
                        : '—'}
                  </td>
                  <td className="data__name">{row.vendor || ''}</td>
                  <td style={{ color: 'var(--tomato)', fontSize: 12.5 }}>{errors.join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Drawer>
  );
}
