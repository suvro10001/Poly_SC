import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY_PREFIX = 'polycables_filter_';
const CLEARED_EVENT = 'polycables_filters_cleared';

/**
 * Retrieve a saved filter value from storage. Returns defaultValue if not found or corrupted.
 */
export function getSavedFilter<T>(key: string, defaultValue: T | (() => T)): T {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${key}`);
    if (raw === null || raw === undefined) {
      return typeof defaultValue === 'function' ? (defaultValue as () => T)() : defaultValue;
    }
    return JSON.parse(raw) as T;
  } catch {
    return typeof defaultValue === 'function' ? (defaultValue as () => T)() : defaultValue;
  }
}

/**
 * Persist a filter value to storage until user logs out.
 */
export function setSavedFilter<T>(key: string, value: T): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${key}`, JSON.stringify(value));
  } catch (err) {
    console.warn(`Failed to persist filter "${key}":`, err);
  }
}

/**
 * Clear all persistent date and period filters (called strictly upon user logout).
 */
export function clearAllSavedFilters(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    window.dispatchEvent(new CustomEvent(CLEARED_EVENT));
  } catch (err) {
    console.warn('Failed to clear saved filters:', err);
  }
}

/**
 * React hook that acts like useState, but automatically loads from and persists to storage until logout.
 */
export function usePersistentFilter<T>(
  key: string,
  defaultValue: T | (() => T)
): [T, (val: T | ((prev: T) => T)) => void] {
  const [state, setStateInternal] = useState<T>(() => getSavedFilter<T>(key, defaultValue));

  const setValue = useCallback(
    (valOrUpdater: T | ((prev: T) => T)) => {
      setStateInternal((prev) => {
        const next =
          typeof valOrUpdater === 'function'
            ? (valOrUpdater as (prev: T) => T)(prev)
            : valOrUpdater;
        setSavedFilter(key, next);
        return next;
      });
    },
    [key]
  );

  useEffect(() => {
    const handleClear = () => {
      setStateInternal(typeof defaultValue === 'function' ? (defaultValue as () => T)() : defaultValue);
    };
    window.addEventListener(CLEARED_EVENT, handleClear);
    return () => window.removeEventListener(CLEARED_EVENT, handleClear);
  }, [defaultValue]);

  return [state, setValue];
}
