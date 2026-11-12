/**
 * Where a notification tap — or a tap on one of its action buttons — takes the customer.
 *
 * Pure on purpose (no React Native imports) so the whole table is unit-tested. The rule the app
 * follows: an action button never does something irreversible on its own. "Confirm & pay" opens the
 * confirm screen with the amount and items on it and ONE button to press; it does not place the
 * order from the notification shade. Indian consumer rules want consent for a purchase to be an
 * explicit, affirmative act with the price in view (Consumer Protection (E-Commerce) Rules 2020,
 * r.4(9)), and a debit the customer did not see is exactly what RBI's payment rules forbid.
 */

/** Category ids. No ':' or '-' — expo-notifications rejects them on iOS. */
export const CATEGORY = {
  MEAL: 'mealcheckin',
  PLAN: 'planconfirm',
  DELIVERED: 'orderdelivered',
};

/** Action ids, shared by the category registration and this router. */
export const ACTION = {
  SNAP: 'SNAP',
  HAD: 'HAD',
  SKIP_MEAL: 'SKIP_MEAL',
  CONFIRM: 'CONFIRM',
  SKIP_DAY: 'SKIP_DAY',
  RATE: 'RATE',
  ISSUE: 'ISSUE',
};

/** The buttons each category shows. Every one brings the app forward — see the note above. */
export const CATEGORY_ACTIONS = {
  [CATEGORY.MEAL]: [
    { identifier: ACTION.SNAP, buttonTitle: 'Snap my plate' },
    { identifier: ACTION.HAD, buttonTitle: 'I had it' },
    { identifier: ACTION.SKIP_MEAL, buttonTitle: 'Skipped it' },
  ],
  [CATEGORY.PLAN]: [
    { identifier: ACTION.CONFIRM, buttonTitle: 'Confirm & pay' },
    { identifier: ACTION.SKIP_DAY, buttonTitle: 'Skip this day', destructive: true },
  ],
  [CATEGORY.DELIVERED]: [
    { identifier: ACTION.RATE, buttonTitle: 'View order' },
    { identifier: ACTION.ISSUE, buttonTitle: 'Something wrong?' },
  ],
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLOTS = ['breakfast', 'lunch', 'snack', 'dinner'];

/**
 * @param {{ actionIdentifier?: string, data?: Record<string, any> }} tap  the action pressed (absent
 *        or the platform default for a plain tap) and the notification's data payload
 * @returns {{ pathname: string, params?: Record<string, string> } | null} null = stay where you are
 */
export function routeForNotification({ actionIdentifier, data } = {}) {
  const d = data || {};
  const action = Object.values(ACTION).includes(actionIdentifier) ? actionIdentifier : null;

  // staff alerts
  if (d.kind === 'PROCUREMENT_BUFFER') return { pathname: '/staff/approvals' };

  // meal-time reminder
  if (d.kind === 'MEAL_CHECKIN') {
    /** @type {Record<string, string>} */
    const params = {};
    if (SLOTS.includes(d.slot)) params.slot = d.slot;
    if (action === ACTION.SNAP) params.do = 'snap';
    else if (action === ACTION.HAD) params.do = 'had';
    else if (action === ACTION.SKIP_MEAL) params.do = 'skip';
    return { pathname: '/meal-checkin', params };
  }

  // the evening-before "confirm tomorrow's order"
  if (d.type === 'plan-confirm' && DATE_RE.test(String(d.date || ''))) {
    /** @type {Record<string, string>} */
    const params = { date: String(d.date) };
    if (action === ACTION.SKIP_DAY) params.do = 'skip';
    else if (action === ACTION.CONFIRM) params.do = 'confirm';
    return { pathname: '/confirm/[date]', params };
  }

  // order updates
  if (d.orderId) {
    /** @type {Record<string, string>} */
    const params = { id: String(d.orderId) };
    if (action === ACTION.ISSUE) params.do = 'issue';
    else if (action === ACTION.RATE) params.do = 'rate';
    return { pathname: '/order/[id]', params };
  }

  return null;
}
