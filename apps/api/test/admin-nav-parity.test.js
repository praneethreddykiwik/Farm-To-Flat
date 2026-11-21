/**
 * The admin menu hides pages a role cannot use (security audit, 21 Nov 2026, S8-01). The server's
 * roleMayAccess is the real gate; this keeps the menu's copy of those rules in step with it, so a
 * page is never shown to a role the server would refuse, nor hidden from one it would serve.
 */
import { describe, expect, it } from 'vitest';
import { roleMayAccess } from '../src/routes/admin/auth.js';
import { mayOpenPage } from '../../admin/src/lib/nav-access.js';

// Each menu page → the main admin API it loads. Pages not listed load admin-only APIs.
const PAGE_API = {
  '/admin': '/metrics',
  '/catalog': '/products',
  '/pricing': '/products',
  '/coupons': '/coupons',
  '/communities': '/communities',
  '/demand': '/demand',
  '/orders': '/orders',
  '/customers': '/customers',
  '/procurement': '/procurement',
  '/fulfilment': '/orders',
  '/feedback': '/feedback/reviews',
  '/tickets': '/tickets',
  '/stats': '/analytics',
  '/growth': '/growth/settings',
  '/insights': '/insights',
  '/report': '/business',
  '/finance': '/finance',
  '/access': '/access',
  '/payments': '/payment-settings',
  '/charges': '/charges',
  '/settings': '/support',
  '/audit': '/audit',
};
const ROLES = ['SUPER_ADMIN', 'ADMIN', 'PROCUREMENT', 'FULFILMENT'];

describe('admin menu matches the server’s role rules', () => {
  for (const [page, apiPath] of Object.entries(PAGE_API))
    for (const role of ROLES)
      it(`${role} ${roleMayAccess(role, apiPath, 'GET') ? 'sees' : 'does not see'} ${page}`, () => {
        expect(mayOpenPage(page, role)).toBe(roleMayAccess(role, apiPath, 'GET'));
      });

  it('a delivery or purchasing role sees only its own board and the dashboard', () => {
    const pages = Object.keys(PAGE_API);
    expect(pages.filter((p) => mayOpenPage(p, 'PROCUREMENT'))).toEqual(['/admin', '/procurement']);
    expect(pages.filter((p) => mayOpenPage(p, 'FULFILMENT'))).toEqual([
      '/admin',
      '/orders',
      '/fulfilment',
    ]);
  });

  it('nobody signed in sees nothing; the old shared token still sees everything', () => {
    expect(mayOpenPage('/admin', null)).toBe(false);
    expect(mayOpenPage('/audit', null, true)).toBe(true);
  });
});
