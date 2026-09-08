/**
 * Admin panel shell. Owner: Tharun. Real screens for the platform surface — dashboard, catalog,
 * pricing, communities/windows, orders, and the fulfilment board — talking to the same /api/v1 the
 * mobile app uses, and sharing the design language of the customer app (see styles/theme.css).
 */
import { BrowserRouter, Route, Routes } from 'react-router-dom';
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

export function App() {
  return (
    <BrowserRouter>
      <Background />
      <div className="shell">
        <Sidebar />
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/catalog" element={<Catalog />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/communities" element={<Communities />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/procurement" element={<Procurement />} />
            <Route path="/fulfilment" element={<Fulfilment />} />
            <Route path="/stats" element={<Statistics />} />
            <Route path="/access" element={<Access />} />
          </Routes>
        </main>
      </div>
      <Toaster />
    </BrowserRouter>
  );
}
