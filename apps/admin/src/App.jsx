/**
 * Admin panel shell. Owner: Tharun. Real screens for the platform surface — dashboard, catalog,
 * pricing, communities/windows, orders, and the fulfilment board — talking to the same /api/v1 the
 * mobile app uses, and sharing the design language of the customer app (see styles/theme.css).
 */
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Background, Toaster } from './components/ui.jsx';
import { Sidebar } from './components/Sidebar.jsx';
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
  return (
    <>
      <Background />
      <div className="shell">
        <Sidebar />
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
