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
import { Demand } from './screens/Demand.jsx';
import { Customers } from './screens/Customers.jsx';
import { Orders } from './screens/Orders.jsx';
import { Fulfilment } from './screens/Fulfilment.jsx';
import { Feedback } from './screens/Feedback.jsx';
import { Growth } from './screens/Growth.jsx';
import { Insights } from './screens/Insights.jsx';
import { Report } from './screens/Report.jsx';
import { Finance } from './screens/Finance.jsx';
import { Join } from './screens/Join.jsx';
import { AINotice } from './screens/AINotice.jsx';
import { Statistics } from './screens/Statistics.jsx';
import { Procurement } from './screens/Procurement.jsx';
import { Access } from './screens/Access.jsx';
import { Coupons } from './screens/Coupons.jsx';
import { Settings } from './screens/Settings.jsx';
import { Charges } from './screens/Charges.jsx';
import Payments from './screens/Payments.jsx';
import { Privacy } from './screens/Privacy.jsx';
import { Terms } from './screens/Terms.jsx';
import { PolicyPage, PAGES } from './screens/PolicyPage.jsx';
import { SignIn } from './screens/SignIn.jsx';
import { Landing } from './screens/Landing.jsx';
import { NotFound } from './screens/NotFound.jsx';
import { getToken, onAuthChange } from './lib/auth.js';

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
            <span>Fooducia</span>
          </div>
        </header>
        {navOpen && <div className="rail-scrim" onClick={() => setNavOpen(false)} />}
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
        <main className="main">
          <Routes>
            <Route path="/admin" element={<Dashboard />} />
            <Route path="/catalog" element={<Catalog />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/coupons" element={<Coupons />} />
            <Route path="/communities" element={<Communities />} />
            <Route path="/demand" element={<Demand />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/procurement" element={<Procurement />} />
            <Route path="/fulfilment" element={<Fulfilment />} />
            {/* /complaints is the old address: it opens Feedback on the Complaints tab. */}
            <Route path="/complaints" element={<Feedback />} />
            <Route path="/feedback" element={<Feedback />} />
            <Route path="/growth" element={<Growth />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/report" element={<Report />} />
            <Route path="/finance" element={<Finance />} />
            <Route path="/stats" element={<Statistics />} />
            <Route path="/access" element={<Access />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/charges" element={<Charges />} />
            <Route path="/payments" element={<Payments />} />
          </Routes>
        </main>
      </div>
      <Toaster />
    </>
  );
}

/** Addresses that are public and chrome-free: no sidebar, no sign-in, customer-facing titles. */
const PUBLIC = new Set([
  '/',
  '/privacy',
  '/terms',
  '/join',
  '/go',
  '/ai-notice',
  ...Object.keys(PAGES).map((p) => `/${p}`),
]);

/**
 * The operator console lives ONLY at these addresses. Anything else — /mm, a typo, a probe — is a
 * 404, not the sign-in screen. Previously every unmatched path fell through to <SignIn/>, so the
 * whole domain looked like a login wall and leaked the fact that an operator panel exists.
 */
const ADMIN_PATHS = new Set([
  '/admin',
  '/catalog',
  '/pricing',
  '/coupons',
  '/communities',
  '/demand',
  '/customers',
  '/orders',
  '/procurement',
  '/fulfilment',
  '/complaints',
  '/feedback',
  '/growth',
  '/insights',
  '/report',
  '/finance',
  '/stats',
  '/access',
  '/settings',
  '/charges',
  '/payments',
]);

function Root() {
  // /privacy and /terms are public and chrome-free — customers open them from the app, so no
  // sidebar and no login.
  const { pathname } = useLocation();
  // Re-render whenever the token is stored or dropped, so signing in swaps the gate for the shell
  // and a rejected token (rotated on the API host) drops straight back to the gate mid-session.
  const [token, setTokenState] = useState(getToken);
  useEffect(() => onAuthChange(() => setTokenState(getToken())), []);

  // The tab title is the customer site's by default (it is what `/` serves). An operator on the
  // console should not be looking at a marketing headline in their tab strip.
  useEffect(() => {
    const policy = PAGES[pathname.slice(1)];
    document.title = policy
      ? `${policy.title.en} · Fooducia`
      : ADMIN_PATHS.has(pathname)
        ? 'Fooducia · Operations'
        : pathname === '/join' || pathname === '/go'
          ? 'Your Fooducia code'
          : pathname === '/ai-notice'
            ? 'AI Notice · Fooducia'
            : !PUBLIC.has(pathname)
              ? 'Page not found · Fooducia'
              : 'Fooducia — vegetables harvested after you order';
  }, [pathname]);

  // The customer-facing site is what `/` is for now. The operator panel lives at /admin and the
  // screens below it; operators type that address, it is not linked from the public page.
  if (pathname === '/') return <Landing />;
  if (pathname === '/privacy') return <Privacy />;
  if (pathname === '/terms') return <Terms />;
  // A promoter's QR card and a neighbour's invite link land here: the code, and where to get the app.
  if (pathname === '/join' || pathname === '/go') return <Join />;
  if (pathname === '/ai-notice') return <AINotice />;
  // /refunds, /shipping, /contact — views onto the Terms sections. Public, like the two above.
  const policy = pathname.slice(1);
  if (PAGES[policy]) return <PolicyPage page={policy} />;
  // The operator console is reachable only at its own addresses. Everything else is a real 404,
  // so random URLs no longer surface the sign-in gate.
  if (ADMIN_PATHS.has(pathname)) return token ? <AdminShell /> : <SignIn />;
  return <NotFound />;
}

export function App() {
  return (
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  );
}
