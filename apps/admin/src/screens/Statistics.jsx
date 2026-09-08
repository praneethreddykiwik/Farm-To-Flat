/**
 * Statistics — a detailed side-by-side of the serviceable communities on the numbers that decide
 * where to push: revenue, cost (COGS), profit, margin, orders, AOV, units and category mix, plus a
 * 14-day revenue trend per community. One call to /admin/analytics; charts via recharts.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useResource } from '../lib/useApi.js';
import { CountRupee, ErrorNote, Stat } from '../components/ui.jsx';
import { IconRupee, IconBox, IconTag, IconReceipt } from '../components/icons.jsx';
import { dayLabel, inr, titleCase } from '../lib/format.js';

/** distinct, on-brand colours, one per community (assigned by index) */
const SERIES = ['#1e7a4c', '#2c7fc0', '#d89b1a'];
const p2r = (paise) => Math.round(Number(paise) / 100);

const tip = {
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.85)',
  boxShadow: '0 8px 24px rgba(14,27,20,0.12)',
  fontFamily: 'IBM Plex Sans',
  fontSize: 13,
};

export function Statistics() {
  const { data, loading, error, reload } = useResource('/admin/analytics');

  if (error)
    return (
      <>
        <Head /> <ErrorNote error={error} onRetry={reload} />
      </>
    );
  if (loading || !data)
    return (
      <>
        <Head />
        <div className="glass card">
          <div className="skeleton" style={{ height: 320 }} />
        </div>
      </>
    );

  const { communities, revenueByDay, totals, leaders, categories } = data;
  const color = (id) => SERIES[communities.findIndex((c) => c.id === id) % SERIES.length];
  const blendedMargin =
    Number(totals.revenuePaise) > 0
      ? Math.round((Number(totals.profitPaise) / Number(totals.revenuePaise)) * 1000) / 10
      : 0;

  const rcp = communities.map((c) => ({
    name: c.name.replace(/^(Aparna |My Home |Prestige )/, ''),
    Revenue: p2r(c.revenuePaise),
    Cost: p2r(c.costPaise),
    Profit: p2r(c.profitPaise),
  }));

  const trend = revenueByDay.map((row) => {
    const out = { label: dayLabel(row.date) };
    for (const c of communities) out[c.id] = row[c.id] || 0;
    return out;
  });

  // category mix: rows = category, one bar segment per community
  const catRows = categories
    .map((cat) => {
      const row = { name: cat.name };
      let total = 0;
      for (const c of communities) {
        const v = c.categoryMix.find((m) => m.categoryId === cat.id);
        const r = v ? p2r(v.revenuePaise) : 0;
        row[c.id] = r;
        total += r;
      }
      row._total = total;
      return row;
    })
    .filter((r) => r._total > 0)
    .sort((a, b) => b._total - a._total);

  return (
    <>
      <Head />

      <section className="stat-grid stagger">
        <Stat
          icon={<IconRupee size={20} />}
          tint="sprout"
          value={<CountRupee paise={totals.revenuePaise} />}
          label="Total revenue"
          delta={{ kind: 'up', text: `${leaders.revenue} leads` }}
        />
        <Stat
          icon={<IconBox size={20} />}
          value={<CountRupee paise={totals.costPaise} />}
          label="Total cost (COGS)"
        />
        <Stat
          icon={<IconTag size={20} />}
          value={<CountRupee paise={totals.profitPaise} />}
          label="Total profit"
          delta={{ kind: 'up', text: `${leaders.profit} leads` }}
        />
        <Stat
          icon={<IconReceipt size={20} />}
          value={<span>{blendedMargin}%</span>}
          label="Blended margin"
          delta={{ kind: 'flat', text: `${leaders.margin} highest` }}
        />
      </section>

      <section className="grid-2">
        <div className="glass card reveal">
          <div className="card__head">
            <h2 className="card__title">Revenue · cost · profit by community</h2>
          </div>
          <div style={{ height: 300, marginLeft: -10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rcp} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={4}>
                <CartesianGrid stroke="rgba(14,27,20,0.06)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: '#3d4b43' }}
                  dy={6}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tick={{ fontSize: 11, fill: '#7c8781' }}
                  tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                />
                <Tooltip
                  contentStyle={tip}
                  formatter={(v, n) => [`₹${Number(v).toLocaleString('en-IN')}`, n]}
                  cursor={{ fill: 'rgba(30,122,76,0.06)' }}
                />
                <Legend wrapperStyle={{ fontSize: 12.5, paddingTop: 8 }} />
                <Bar dataKey="Revenue" fill="#1e7a4c" radius={[5, 5, 0, 0]} />
                <Bar dataKey="Cost" fill="#c9d3cb" radius={[5, 5, 0, 0]} />
                <Bar dataKey="Profit" fill="#9fd12c" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass card reveal">
          <div className="card__head">
            <h2 className="card__title">Average order value</h2>
            <span className="muted" style={{ fontSize: 12.5 }}>
              {leaders.aov} highest
            </span>
          </div>
          <div className="vstack" style={{ gap: 16, paddingTop: 6 }}>
            {communities.map((c) => {
              const max = Math.max(...communities.map((x) => Number(x.aovPaise)), 1);
              return (
                <div key={c.id}>
                  <div
                    className="hstack"
                    style={{ justifyContent: 'space-between', marginBottom: 6 }}
                  >
                    <span className="hstack" style={{ gap: 8, fontSize: 13.5, fontWeight: 500 }}>
                      <span
                        style={{ width: 9, height: 9, borderRadius: 3, background: color(c.id) }}
                      />
                      {c.name}
                    </span>
                    <span className="rupee">{inr(c.aovPaise)}</span>
                  </div>
                  <div
                    style={{
                      height: 8,
                      borderRadius: 8,
                      background: 'rgba(14,27,20,0.06)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${(Number(c.aovPaise) / max) * 100}%`,
                        background: color(c.id),
                        borderRadius: 8,
                        transition: 'width 0.8s var(--ease-out)',
                      }}
                    />
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>
                    {c.orders} orders · {c.marginPct}% margin
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="glass card reveal">
        <div className="card__head">
          <h2 className="card__title">Revenue trend · last 14 days</h2>
          <span className="muted" style={{ fontSize: 12.5 }}>
            by community
          </span>
        </div>
        <div style={{ height: 280, marginLeft: -10 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="rgba(14,27,20,0.06)" vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#7c8781' }}
                dy={6}
                interval={1}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={52}
                tick={{ fontSize: 11, fill: '#7c8781' }}
                tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
              />
              <Tooltip
                contentStyle={tip}
                formatter={(v, n) => [
                  `₹${Number(v).toLocaleString('en-IN')}`,
                  communities.find((c) => c.id === n)?.name || n,
                ]}
              />
              {communities.map((c) => (
                <Line
                  key={c.id}
                  type="monotone"
                  dataKey={c.id}
                  stroke={color(c.id)}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="hstack" style={{ gap: 18, marginTop: 6, flexWrap: 'wrap' }}>
          {communities.map((c) => (
            <span key={c.id} className="hstack" style={{ gap: 7, fontSize: 12.5 }}>
              <span style={{ width: 14, height: 3, borderRadius: 3, background: color(c.id) }} />
              {c.name}
            </span>
          ))}
        </div>
      </section>

      <section className="grid-2">
        <div className="glass card reveal">
          <div className="card__head">
            <h2 className="card__title">Category mix</h2>
          </div>
          <div style={{ height: Math.max(220, catRows.length * 42) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={catRows}
                margin={{ top: 4, right: 12, left: 8, bottom: 0 }}
                barCategoryGap={10}
              >
                <CartesianGrid stroke="rgba(14,27,20,0.06)" horizontal={false} />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: '#7c8781' }}
                  tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  width={110}
                  tick={{ fontSize: 12, fill: '#3d4b43' }}
                />
                <Tooltip
                  contentStyle={tip}
                  formatter={(v, n) => [
                    `₹${Number(v).toLocaleString('en-IN')}`,
                    communities.find((c) => c.id === n)?.name || n,
                  ]}
                  cursor={{ fill: 'rgba(30,122,76,0.06)' }}
                />
                {communities.map((c) => (
                  <Bar
                    key={c.id}
                    dataKey={c.id}
                    stackId="mix"
                    fill={color(c.id)}
                    radius={[0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass card reveal" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="card__head" style={{ padding: '20px 20px 0' }}>
            <h2 className="card__title">The numbers</h2>
          </div>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Community</th>
                  <th style={{ textAlign: 'right' }}>Orders</th>
                  <th style={{ textAlign: 'right' }}>Revenue</th>
                  <th style={{ textAlign: 'right' }}>Profit</th>
                  <th style={{ textAlign: 'right' }}>Margin</th>
                  <th style={{ textAlign: 'right' }}>AOV</th>
                </tr>
              </thead>
              <tbody>
                {communities.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="hstack" style={{ gap: 8 }}>
                        <span
                          style={{ width: 9, height: 9, borderRadius: 3, background: color(c.id) }}
                        />
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                      </span>
                      <div
                        className="muted"
                        style={{ fontSize: 11.5, marginTop: 2, marginLeft: 17 }}
                      >
                        {c.area} · {c.blocks} blocks
                        {c.cancelled ? ` · ${c.cancelled} cancelled` : ''}
                      </div>
                    </td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      {c.orders}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="rupee">{inr(c.revenuePaise)}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="rupee">{inr(c.profitPaise)}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span
                        className={`badge ${c.marginPct >= 25 ? 'st-CONFIRMED' : 'st-PENDING_PAYMENT'}`}
                      >
                        {c.marginPct}%
                      </span>
                    </td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      {inr(c.aovPaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}

function Head() {
  return (
    <header className="topbar">
      <div>
        <h1 className="page-title">Statistics</h1>
        <p className="page-sub">Comparing all communities · revenue, cost, profit & sales</p>
      </div>
    </header>
  );
}
