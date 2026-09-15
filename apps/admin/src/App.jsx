/**
 * Admin panel shell. Owner: Tharun. Real screens for the platform surface — dashboard, catalog,
 * pricing, communities/windows, orders, and the fulfilment board — talking to the same /api/v1 the
 * mobile app uses, and sharing the design language of the customer app (see styles/theme.css).
 */
import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Background, Toaster } from './components/ui.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { IconLeaf, IconMenu } from './components/icons.jsx';
import { Dashboard } from './screens/Dashboard.jsx';
import { Catalog } from './screens/Catalog.jsx';
import { Pricing } from './screens/Pricing.jsx';
import { Communities } from './screens/Communities.jsx';
import { Orders } from './screens/Orders.jsx';
import { Fulfilment } from './screens/Fulfilment.jsx';
import { Statistics } from './screens/Statistics.jsx';
import { Procurement } from './screens/Procurement.jsx';
import { Access } from './screens/Access.jsx';
import { Coupons } from './screens/Coupons.jsx';
import { Settings } from './screens/Settings.jsx';
import { Privacy } from './screens/Privacy.jsx';

/** The operator app: sidebar + the admin screens. Everything except the public privacy page. */
function AdminShell() {
  // Phone-only nav drawer state. Closes itself on navigation and on Escape.
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!navOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  return (
    <>
      <Background />
      {/* The mobile bar, the scrim and the rail all live INSIDE .shell on purpose: .shell is a
          stacking context (z-index:1), so a scrim outside it would always paint over the rail's
          z-index no matter how high it is — the open drawer showed up dimmed under the scrim. */}
      <div className="shell">
        {/* Mobile top bar — only shown by CSS under 900px */}
        <header className="mobilebar">
          <button
            className="mobilebar__btn"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            aria-expanded={navOpen}
          >
            <IconMenu size={22} />
          </button>
          <div className="mobilebar__brand">
            <IconLeaf size={18} style={{ color: 'var(--sprout)' }} />
            <span>Farm to Flat</span>
          </div>
        </header>
        {navOpen && <div className="rail-scrim" onClick={() => setNavOpen(false)} />}
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/catalog" element={<Catalog />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/coupons" element={<Coupons />} />
            <Route path="/communities" element={<Communities />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/procurement" element={<Procurement />} />
            <Route path="/fulfilment" element={<Fulfilment />} />
            <Route path="/stats" element={<Statistics />} />
            <Route path="/access" element={<Access />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
      <Toaster />
    </>
  );
}

function Root() {
  // /privacy is public and chrome-free — customers open it from the app, so no sidebar and no login.
  const { pathname } = useLocation();
  if (pathname === '/privacy') return <Privacy />;
  return <AdminShell />;
}

export function App() {
  return (
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  );
}
