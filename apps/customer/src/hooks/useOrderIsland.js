import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import {
  useGetAddressesQuery,
  useGetCatalogQuery,
  useGetOrdersQuery,
  useGetWindowsQuery,
  useQuoteItemsQuery,
} from '../api/api';
import { selectAuth } from '../features/auth/authSlice';
import { selectAiVisible, selectRoleState } from '../features/role/roleSlice';
import { daySkipped, selectScheduled } from '../features/plan/planSlice';
import { showToast } from '../features/ui/uiSlice';
import { formatDateShort, todayISO } from '../lib/dates';
import {
  buildCard,
  cardSignature,
  decideIsland,
  popAtFor,
  tomorrowsPlan,
} from '../lib/orderIsland';
import {
  newIslandToken,
  onIslandAsked,
  orderIsland,
  saveIsland,
  savedIsland,
} from '../lib/orderIslandNative';

// Not PENDING_PAYMENT: the card stays while someone is paying, so backing out leaves it there.
const HAS_ORDER = new Set(['CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY']);

/**
 * Keeps the "Tomorrow's order" card in the iPhone's Dynamic Island in step with the plan. Super
 * admin only, like the planner it belongs to. Mounted once, at the root. Rules: lib/orderIsland.js.
 */
export function useOrderIsland() {
  const dispatch = useDispatch();
  const status = useSelector(selectAuth).status;
  const visible = useSelector(selectAiVisible);
  const roleKnown = useSelector(selectRoleState).resolved;
  const scheduled = useSelector(selectScheduled);
  const [tick, setTick] = useState(0);
  const force = useRef(false);

  const supported = Platform.OS === 'ios' && orderIsland.supported();
  const enabled = supported && visible && status === 'signedIn';

  // Each return to the app: the day may have changed, or a button may have been pressed meanwhile.
  useEffect(() => {
    if (!enabled) return undefined;
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setTick((n) => n + 1));
    const off = onIslandAsked(() => {
      force.current = true;
      setTick((n) => n + 1);
    });
    return () => {
      sub.remove();
      off();
    };
  }, [enabled]);

  const { data: catalog } = useGetCatalogQuery(undefined, { skip: !enabled });
  const { data: addresses } = useGetAddressesQuery(undefined, { skip: !enabled });
  const { data: orders } = useGetOrdersQuery(undefined, { skip: !enabled });
  const address =
    (addresses?.addresses || []).find((a) => a.isDefault) || (addresses?.addresses || [])[0];
  const { data: windows } = useGetWindowsQuery(
    { addressId: address?.id },
    { skip: !enabled || !address },
  );
  const productsById = useMemo(
    () => Object.fromEntries((catalog?.products || []).map((p) => [p.id, p])),
    [catalog],
  );
  const today = todayISO();
  const plan = useMemo(
    () => (catalog ? tomorrowsPlan({ scheduled, productsById, today }) : null),
    [catalog, scheduled, productsById, today],
  );
  const { currentData: priced, isError: quoteFailed } = useQuoteItemsQuery(plan?.items, {
    skip: !enabled || !plan,
  });

  // Days skipped from the island, recorded here.
  useEffect(() => {
    if (!enabled) return;
    orderIsland.takeSkips().then((dates) => {
      for (const date of new Set(dates)) {
        const p = scheduled.find((x) => x.days.some((d) => d.date === date));
        if (!p || (p.ordered || []).includes(date) || (p.skipped || []).includes(date)) continue;
        dispatch(daySkipped({ id: p.id, date }));
        dispatch(
          showToast({
            title: `Skipped ${formatDateShort(date)}`,
            message: 'Nothing was ordered and nothing was charged.',
            tone: 'neutral',
          }),
        );
      }
    });
  }, [enabled, tick, scheduled, dispatch]);

  // Signed out, or not a super admin any more: the card goes.
  useEffect(() => {
    if (!supported) return;
    if (status === 'signedOut' || (status === 'signedIn' && roleKnown && !visible)) {
      if (!savedIsland()) return;
      saveIsland(null);
      orderIsland.endAll();
    }
  }, [supported, status, roleKnown, visible]);

  useEffect(() => {
    if (!enabled) return undefined;
    let stale = false;
    (async () => {
      const live = await orderIsland.list();
      if (stale) return;
      const now = Date.now();
      const asked = force.current;
      const placed =
        !asked &&
        (orders?.orders || []).some(
          (o) => o.deliveryDate === plan?.date && HAS_ORDER.has(o.status),
        );
      const card = placed
        ? null
        : buildCard({ plan, windows: windows?.windows, quote: priced?.quote, now });
      const known =
        !!catalog && (!plan || (!!orders && !!windows && (!!priced || quoteFailed)) || placed);
      const saved = savedIsland();
      const what = decideIsland({
        card,
        known,
        live,
        saved,
        now,
        canSchedule: orderIsland.canSchedule(),
        force: asked,
      });
      if (known) force.current = false;
      if (asked && known && !card)
        dispatch(
          showToast({
            title: 'Nothing to show for tomorrow',
            message: 'There is no order to confirm, or ordering has closed.',
            tone: 'neutral',
          }),
        );
      if (what === 'none') return;
      if (what === 'end') {
        await orderIsland.endAll();
        return;
      }
      const sig = cardSignature(card);
      if (what === 'update') {
        const token = saved?.date === card.date ? saved.token : newIslandToken();
        saveIsland({ ...saved, date: card.date, token, sig, totalPaise: card.totalPaise, card });
        await orderIsland.update({ ...card, token });
        return;
      }
      const popAt = what === 'start' ? now : popAtFor(card.closesAtMs, card.date);
      const token = newIslandToken();
      // Saved first: a button can be pressed the moment the card is up.
      saveIsland({ date: card.date, token, sig, popAt, totalPaise: card.totalPaise, card });
      const id = await orderIsland.start({ ...card, token }, what === 'schedule' ? popAt : null);
      if (!id) saveIsland(saved);
      else if (asked)
        dispatch(
          showToast({
            title: 'On your Dynamic Island',
            message: 'Leave the app to see it. Hold the island to open it.',
            tone: 'success',
          }),
        );
    })();
    return () => {
      stale = true;
    };
  }, [enabled, tick, catalog, plan, windows, orders, priced, quoteFailed, dispatch]);
}
