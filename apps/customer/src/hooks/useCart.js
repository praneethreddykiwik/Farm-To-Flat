import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useGetCartQuery, useSetCartItemMutation } from '../api/api';
import { pulseBag, showToast } from '../features/ui/uiSlice';
import { selectIsSignedIn } from '../features/auth/authSlice';

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
 * Quantity for one product, with a debounced write so rapid taps become one request.
 * Optimistic locally; the server cart is authoritative on settle.
 * @param {{ id: string, name: string, dailyCap?: number }} product
 */
export function useCartLine(product) {
  const { cart } = useCart();
  const dispatch = useDispatch();
  const [setCartItem] = useSetCartItemMutation();
  const serverQty = useMemo(
    () => Number(cart?.items?.find((i) => i.productId === product.id)?.quantity || 0),
    [cart, product.id],
  );
  const [local, setLocal] = useState(serverQty);
  const pending = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    if (pending.current === null) setLocal(serverQty);
  }, [serverQty]);

  const setQuantity = useCallback(
    (qty) => {
      const wasZero = local === 0;
      setLocal(qty);
      pending.current = qty;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const q = pending.current;
        pending.current = null;
        try {
          await setCartItem({ productId: product.id, quantity: String(q) }).unwrap();
          if (wasZero && q > 0) dispatch(pulseBag());
        } catch (e) {
          setLocal(serverQty);
          dispatch(showToast({ title: e?.message || 'Could not update basket', tone: 'error' }));
        }
      }, 320);
    },
    [dispatch, local, product.id, serverQty, setCartItem],
  );

  return { quantity: local, setQuantity };
}
