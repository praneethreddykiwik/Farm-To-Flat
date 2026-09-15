/**
 * Forest nav rail. Sections mirror the operator's day: overview first, then the catalog surfaces
 * (products, pricing, communities), then the live work (orders, fulfilment).
 *
 * On desktop it's a fixed rail. On phones (≤ 900px) it's an off-canvas drawer opened from the
 * hamburger in the mobile top bar — before this the rail was simply `display:none` on small screens,
 * leaving no way to navigate the panel from a phone.
 */
import { NavLink } from 'react-router-dom';
import {
  IconBasket,
  IconCatalog,
  IconChart,
  IconDash,
  IconLeaf,
  IconLifeBuoy,
  IconMap,
  IconReceipt,
  IconShield,
  IconTag,
  IconTicket,
  IconTruck,
  IconX,
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
  { to: '/settings', label: 'Support contact', icon: IconLifeBuoy },
];

/**
 * @param {{ open?: boolean, onClose?: () => void }} props  `open` only matters on phones.
 */
export function Sidebar({ open = false, onClose }) {
  return (
    <nav className={`rail${open ? ' rail--open' : ''}`} aria-label="Main">
      <div className="brand">
        <div className="brand__mark">
          <IconLeaf size={22} style={{ color: '#eaffc2' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="brand__name">Farm to Flat</div>
          <div className="brand__sub">Operations</div>
        </div>
        {onClose && (
          <button className="rail__close" onClick={onClose} aria-label="Close menu">
            <IconX size={18} />
          </button>
        )}
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
              onClick={onClose}
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
