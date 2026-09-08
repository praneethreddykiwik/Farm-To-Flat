/**
 * Dashboard — the operator's morning glance. One call to /admin/metrics powers today's order and
 * revenue tallies, a 7-day GMV area chart, the live status mix, and the top products by revenue.
 */
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useResource } from '../lib/useApi.js';
import { CountRupee, CountUp, ErrorNote, Stat, TableSkeleton } from '../components/ui.jsx';
import { IconBox, IconClock, IconReceipt, IconRupee } from '../components/icons.jsx';
import { dayLabel, inr, titleCase } from '../lib/format.js';

const STATUS_TINT = {
  CONFIRMED: 'var(--leaf)',
  PACKING: '#2c7fc0',
  OUT_FOR_DELIVERY: '#7d54c9',
  PENDING_PAYMENT: 'var(--amber)',
  DELIVERED: 'var(--ink-3)',
  CANCELLED: 'var(--tomato)',
  PAYMENT_FAILED: 'var(--tomato)',
};

export function Dashboard() {
  const { data, loading, error, reload } = useResource('/admin/metrics');

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Good morning, Hyderabad</h1>
          <p className="page-sub">Here's how the farm is moving today.</p>
        </div>
        <span className="badge st-CONFIRMED">
          <span className="badge__dot" />
          Live
        </span>
      </header>

      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : loading || !data ? (
        <div className="stat-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="glass stat">
              <div className="skeleton" style={{ height: 74 }} />
            </div>
          ))}
        </div>
      ) : (
        <>
          <section className="stat-grid stagger">
            <Stat
              icon={<IconReceipt size={20} />}
              value={<CountUp value={data.today.orders} />}
              label="Orders for today"
              delta={{ kind: 'up', text: `${data.today.live} live now` }}
            />
            <Stat
              icon={<IconRupee size={20} />}
              tint="sprout"
              value={<CountRupee paise={data.today.revenuePaise} />}
              label="Revenue booked today"
              delta={{ kind: 'up', text: 'Confirmed + delivered' }}
            />
            <Stat
              icon={<IconClock size={20} />}
              value={<CountUp value={data.today.live} />}
              label="In the kitchen & on the road"
              delta={{ kind: 'flat', text: 'Needs packing' }}
            />
            <Stat
              icon={<IconBox size={20} />}
              value={
                <>
                  <CountUp value={data.catalog.active} />
                  <span style={{ fontSize: 18, color: 'var(--ink-3)' }}>
                    {' '}
                    / {data.catalog.total}
                  </span>
                </>
              }
              label="Products live in catalog"
            />
          </section>

          <section className="grid-2">
            <div className="glass card reveal">
              <div className="card__head">
                <h2 className="card__title">Revenue, last 7 days</h2>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  GMV · booked
                </span>
              </div>
              <RevenueChart data={data.revenueByDay} />
            </div>

            <div className="glass card reveal">
              <div className="card__head">
                <h2 className="card__title">Order mix</h2>
              </div>
              <StatusBars byStatus={data.byStatus} />
            </div>
          </section>

          <section className="glass card reveal">
            <div className="card__head">
              <h2 className="card__title">Top products by revenue</h2>
              <span className="muted" style={{ fontSize: 12.5 }}>
                Across live + delivered orders
              </span>
            </div>
            {data.topProducts.length === 0 ? (
              <div className="empty">No sales yet.</div>
            ) : (
              <div className="vstack" style={{ gap: 2 }}>
                {data.topProducts.map((p, i) => {
                  const max = Number(data.topProducts[0].revenuePaise) || 1;
                  const pct = (Number(p.revenuePaise) / max) * 100;
                  return (
                    <div
                      key={p.productId}
                      style={{
                        padding: '11px 0',
                        borderBottom:
                          i < data.topProducts.length - 1 ? '1px solid var(--hairline)' : 'none',
                      }}
                    >
                      <div
                        className="hstack"
                        style={{ justifyContent: 'space-between', marginBottom: 7 }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          <span className="muted mono" style={{ marginRight: 10 }}>
                            {String(i + 1).padStart(2, '0')}
                          </span>
                          {p.name}
                        </span>
                        <span className="hstack" style={{ gap: 14 }}>
                          <span className="muted" style={{ fontSize: 12.5 }}>
                            {p.qty} sold
                          </span>
                          <span className="rupee">{inr(p.revenuePaise)}</span>
                        </span>
                      </div>
                      <div
                        style={{
                          height: 6,
                          borderRadius: 6,
                          background: 'rgba(14,27,20,0.06)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${pct}%`,
                            borderRadius: 6,
                            background: 'linear-gradient(90deg, var(--leaf), var(--sprout-deep))',
                            transition: 'width 0.8s var(--ease-out)',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

function RevenueChart({ data }) {
  const rows = data.map((d) => ({ label: dayLabel(d.date), gmv: Number(d.gmvPaise) / 100 }));
  return (
    <div style={{ height: 240, marginLeft: -8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1e7a4c" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#1e7a4c" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(14,27,20,0.06)" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: '#7c8781' }}
            dy={6}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={54}
            tick={{ fontSize: 11, fill: '#7c8781' }}
            tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
          />
          <Tooltip
            cursor={{ stroke: 'rgba(30,122,76,0.3)' }}
            contentStyle={{
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.85)',
              boxShadow: '0 8px 24px rgba(14,27,20,0.12)',
              fontFamily: 'IBM Plex Sans',
              fontSize: 13,
            }}
            formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'GMV']}
          />
          <Area type="monotone" dataKey="gmv" stroke="#1e7a4c" strokeWidth={2.5} fill="url(#g)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function StatusBars({ byStatus }) {
  const entries = Object.entries(byStatus).filter(([, n]) => n > 0);
  const total = entries.reduce((s, [, n]) => s + n, 0) || 1;
  return (
    <div className="vstack" style={{ gap: 14, paddingTop: 4 }}>
      {entries.map(([status, n]) => (
        <div key={status}>
          <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{titleCase(status)}</span>
            <span className="mono muted" style={{ fontSize: 12.5 }}>
              {n} · {Math.round((n / total) * 100)}%
            </span>
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
                width: `${(n / total) * 100}%`,
                background: STATUS_TINT[status] || 'var(--ink-3)',
                borderRadius: 8,
                transition: 'width 0.8s var(--ease-out)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
