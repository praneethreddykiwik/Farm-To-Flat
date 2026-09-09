/**
 * Forest nav rail. Sections mirror the operator's day: overview first, then the catalog surfaces
 * (products, pricing, communities), then the live work (orders, fulfilment).
 */
import { NavLink } from 'react-router-dom';
import {
  IconBasket,
  IconCatalog,
  IconChart,
  IconDash,
  IconLeaf,
  IconMap,
  IconReceipt,
  IconShield,
  IconTag,
  IconTicket,
  IconTruck,
} from './icons.jsx';

const NAV = [
  { section: 'Overview' },
  { to: '/', label: 'Dashboard', icon: IconDash, end: true },
  { section: 'Catalog' },
  { to: '/catalog', label: 'Products', icon: IconCatalog },
  { to: '/pricing', label: 'Pricing & margins', icon: IconTag },
  { to: '/coupons', label: 'Coupons', icon: IconTicket },
  { to: '/communities', label: 'Communities', icon: IconMap },
  { section: 'Operations' },
  { to: '/orders', label: 'Orders', icon: IconReceipt },
  { to: '/procurement', label: 'Procurement', icon: IconBasket },
  { to: '/fulfilment', label: 'Fulfilment', icon: IconTruck },
  { to: '/stats', label: 'Statistics', icon: IconChart },
  { section: 'Admin' },
  { to: '/access', label: 'Access & roles', icon: IconShield },
];

export function Sidebar() {
  return (
    <nav className="rail">
      <div className="brand">
        <div className="brand__mark">
          <IconLeaf size={22} style={{ color: '#eaffc2' }} />
        </div>
        <div>
          <div className="brand__name">Farm to Flat</div>
          <div className="brand__sub">Operations</div>
        </div>
      </div>

      <div className="nav">
        {NAV.map((item, i) =>
          item.section ? (
            <div className="nav__label" key={`s${i}`}>
              {item.section}
            </div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav__item${isActive ? ' is-active' : ''}`}
            >
              <item.icon size={19} />
              {item.label}
            </NavLink>
          ),
        )}
      </div>

      <div className="rail__spacer" />
      <div className="rail__foot">
        <div className="rail__avatar">TH</div>
        <div style={{ lineHeight: 1.2 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>Operations</div>
          <div style={{ fontSize: 11, color: 'rgba(243,245,239,0.5)' }}>Hyderabad · live</div>
        </div>
      </div>
    </nav>
  );
}
