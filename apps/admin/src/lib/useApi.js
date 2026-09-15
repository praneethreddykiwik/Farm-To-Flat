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

/**
 * Client-side pagination over an already-loaded list. Long tables (products, pricing, orders) were a
 * single scroll; this slices them into pages and jumps back to page 1 whenever the filter/search
 * (`resetKey`) changes so a new filter never lands on an empty page.
 * @template T
 * @param {T[]} items
 * @param {number} pageSize
 * @param {string} resetKey  anything that, when it changes, should reset to page 1
 */
export function usePager(items, pageSize = 25, resetKey = '') {
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [resetKey]);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);
  const slice = items.slice((current - 1) * pageSize, current * pageSize);
  return { page: current, setPage, pageCount, slice, from, to, total };
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
