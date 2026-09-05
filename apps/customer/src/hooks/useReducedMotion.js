import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useDispatch } from 'react-redux';
import { setReducedMotion } from '../features/ui/uiSlice';

/** Mirrors the OS "reduce motion" setting into the store so ambient animations can stop. */
export function useReducedMotionSync() {
  const dispatch = useDispatch();
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && dispatch(setReducedMotion(v)))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) =>
      dispatch(setReducedMotion(v)),
    );
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, [dispatch]);
}
