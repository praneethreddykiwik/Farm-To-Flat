import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { api, useGetCartQuery } from '../api/api';
import { pulseBag, showToast } from '../features/ui/uiSlice';
import { selectIsSignedIn } from '../features/auth/authSlice';
import { pendingQty, requestQuantity, watchLine } from '../lib/cartWrites';

/** Current server cart with derived totals. */
export function useCart() {
  const signedIn = useSelector(selectIsSignedIn);
  const q = useGetCartQuery(undefined, { skip: !signedIn });
  const cart = q.data?.cart;
  const count = cart?.items?.length || 0;
  const units = useMemo(
    () => (cart?.items || []).reduce((s, i) => s + (i.unit === 'KG' ? 1 : Number(i.quantity)), 0),
    [cart],
  );
  return {
    cart,
    count,
    units,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    refetch: q.refetch,
    error: q.error,
  };
}

/**
 * Quantity for one product: instant on screen, written to the server a moment later.
 *
 * The figure shown is the shopper's own while it is ahead of the server's, and the server's
 * otherwise — see lib/cartWrites.js for why that figure is kept by product and not by card.
 *
 * It reads only its own line out of the basket. Every card used to take the whole basket, so one
 * tap redrew every card on screen, and the next tap had to wait for that.
 * @param {{ id: string, name?: string, dailyCap?: number }} product
 */
export function useCartLine(product) {
  const id = product.id;
  const dispatch = useDispatch();
  const signedIn = useSelector(selectIsSignedIn);
  const { serverQty } = useGetCartQuery(undefined, {
    skip: !signedIn,
    selectFromResult: ({ data }) => ({
      serverQty: Number(data?.cart?.items?.find((i) => i.productId === id)?.quantity || 0),
    }),
  });
  const watch = useCallback((fn) => watchLine(id, fn), [id]);
  const mine = useSyncExternalStore(watch, () => pendingQty(id));

  const setQuantity = useCallback(
    /**
     * @param {number} qty
     * @param {{ pulse?: boolean }} [opts]  `pulse: false` when something else acknowledges the add —
     *   a photo flying into the basket bounces it on landing, and a second bounce when the server
     *   answers a moment later reads as a glitch.
     */
    (qty, { pulse = true } = {}) => {
      // New to the basket, as far as the server has said: that is what earns the bounce.
      const fresh = serverQty === 0;
      requestQuantity(id, qty, {
        send: async (q) => {
          const write = api.endpoints.setCartItem.initiate({ productId: id, quantity: String(q) });
          const res = await /** @type {any} */ (dispatch)(write).unwrap();
          if (!res?.cart) return q;
          return Number(res.cart.items?.find((i) => i.productId === id)?.quantity || 0);
        },
        onSaved: (saved) => {
          if (pulse && fresh && saved > 0) dispatch(pulseBag());
        },
        onError: (e) =>
          dispatch(showToast({ title: e?.message || 'Could not update basket', tone: 'error' })),
      });
    },
    [dispatch, id, serverQty],
  );

  return { quantity: mine ?? serverQty, setQuantity };
}
