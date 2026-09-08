/**
 * Admin web panel — skeleton. Owner: Tharun. This is the shell only; the real screens (catalog CRUD,
 * pricing, communities/windows, order list, and the fulfilment screen + CSV export) mount inside a
 * router here. It talks to the same /api/v1 the mobile app uses, and shares the design tokens in
 * packages/tokens so the admin and app look like one product.
 */
const SCREENS = [
  ['Catalog', 'Products, aliases, images, categories, availability'],
  ['Pricing', 'Procurement cost, margins, rounding, price history'],
  ['Communities & windows', 'Serviceable communities, blocks, delivery windows and capacity'],
  ['Orders', 'Order list, filters, status'],
  ['Fulfilment', 'Packing + delivery view and CSV exports — the highest-leverage screen'],
];

export function App() {
  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 720,
        margin: '0 auto',
        padding: '48px 24px',
        color: '#0e1b14',
      }}
    >
      <p style={{ color: '#1e7a4c', fontWeight: 600, letterSpacing: '0.02em', margin: 0 }}>
        Farm to Flat
      </p>
      <h1 style={{ fontSize: 30, margin: '6px 0 4px' }}>Admin panel</h1>
      <p style={{ color: '#5f6b63', margin: '0 0 28px' }}>
        Skeleton. Build the screens below and route them here — see <code>CONTRIBUTING.md</code> and{' '}
        <code>docs/api-contract.md</code>.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {SCREENS.map(([name, desc]) => (
          <li
            key={name}
            style={{
              padding: '14px 0',
              borderTop: '1px solid #e7ece2',
              display: 'grid',
              gridTemplateColumns: '190px 1fr',
              gap: 16,
            }}
          >
            <b>{name}</b>
            <span style={{ color: '#5f6b63' }}>{desc}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
