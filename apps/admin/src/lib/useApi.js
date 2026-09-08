/**
 * Tiny data hooks over the api client. Deliberately small — the README earmarks RTK Query for the
 * platform build; this keeps the panel running today with predictable loading/error state and a
 * manual `reload()` after mutations. Swapping to RTK Query later touches only these hooks.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/**
 * Fetch a resource on mount and whenever `path` changes.
 * @param {string} path
 * @returns {{ data:any, loading:boolean, error:Error|null, reload:()=>void }}
 */
export function useResource(path) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(/** @type {Error|null} */ (null));
  const live = useRef(true);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get(path)
      .then((d) => live.current && (setData(d), setError(null)))
      .catch((e) => live.current && setError(e))
      .finally(() => live.current && setLoading(false));
  }, [path]);

  useEffect(() => {
    live.current = true;
    load();
    return () => {
      live.current = false;
    };
  }, [load]);

  return { data, loading, error, reload: load };
}

/** Toast bus — dead simple pub/sub so any screen can `toast(msg)`. */
const listeners = new Set();
export function toast(message, kind = 'ok') {
  listeners.forEach((l) => l({ id: Math.random().toString(36).slice(2), message, kind }));
}
export function onToast(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
