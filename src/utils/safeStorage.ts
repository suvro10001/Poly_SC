/**
 * Safe LocalStorage and JSON utilities to eliminate "Uncaught SyntaxError: 'undefined' is not valid JSON"
 * and prevent invalid serialization/deserialization issues.
 */

export function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) {
    return fallback;
  }
  if (typeof raw !== 'string') {
    return raw as T;
  }
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === 'undefined' || trimmed === 'null' || trimmed === '[object Object]') {
    return fallback;
  }
  try {
    const parsed = nativeJsonParse(trimmed);
    return parsed !== undefined && parsed !== null ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function safeLocalStorageGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback;
  }
  try {
    const raw = localStorage.getItem(key);
    return safeJsonParse<T>(raw, fallback);
  } catch {
    return fallback;
  }
}

export function safeLocalStorageSet(key: string, value: unknown): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    if (value === undefined || value === null) {
      localStorage.removeItem(key);
      return;
    }
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (!serialized || serialized === 'undefined' || serialized === 'null') {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, serialized);
    }
  } catch {
    // Storage quota or browser restriction
  }
}

/**
 * Sweeps localStorage and removes any corrupted keys that contain literal "undefined" or "null".
 * Run immediately on application bootstrap.
 */
export function cleanCorruptLocalStorage(): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    const badKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const val = localStorage.getItem(key);
        if (val === 'undefined' || val === 'null' || val === '[object Object]') {
          badKeys.push(key);
        }
      }
    }
    badKeys.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
  } catch {}
}

// Preserve original JSON.parse reference
const nativeJsonParse = JSON.parse.bind(JSON);

// Global patch for JSON.parse to prevent "Uncaught SyntaxError: 'undefined' is not valid JSON"
// from legacy/third-party or unshielded callers receiving "undefined" or undefined string
if (typeof JSON !== 'undefined' && JSON.parse) {
  try {
    (JSON as any).parse = function (text: any, reviver?: any) {
      if (text === undefined || text === null) {
        return null;
      }
      if (typeof text === 'string') {
        const trimmed = text.trim();
        if (trimmed === 'undefined') {
          return null;
        }
        if (trimmed === '' || trimmed === 'null') {
          return null;
        }
      }
      return nativeJsonParse(text, reviver);
    };
  } catch {
    // If JSON.parse is non-configurable in some environment
  }
}

// Clean corrupt localStorage on bootstrap
cleanCorruptLocalStorage();

// Global resilience against QuotaExceededError on localStorage & sessionStorage
if (typeof window !== 'undefined' && typeof Storage !== 'undefined' && Storage.prototype && Storage.prototype.setItem) {
  const origSetItem = Storage.prototype.setItem;
  if (!(Storage.prototype as any).__quota_safe_installed) {
    (Storage.prototype as any).__quota_safe_installed = true;
    Storage.prototype.setItem = function (key: string, value: string) {
      try {
        origSetItem.call(this, key, value);
      } catch (err: any) {
        const isQuota =
          err?.name === 'QuotaExceededError' ||
          err?.code === 22 ||
          err?.number === -2147024882 ||
          String(err?.message || '').toLowerCase().includes('quota') ||
          String(err || '').toLowerCase().includes('quota');

        if (isQuota) {
          console.warn(`[Storage Quota Protected] Failed to write key "${key}". Cleaning expendable caches...`);
          try {
            const expendables = [
              'polycables_stored_bills_cache',
              'polycables_pdf_cache',
              'polycables_print_preview_cache',
              'polycables_temp_backup',
              'polycables_auto_draft'
            ];
            expendables.forEach((k) => {
              try { this.removeItem(k); } catch (_) {}
            });
            origSetItem.call(this, key, value);
          } catch (_) {
            // Still full: suppress uncaught exception to prevent React component crash
            // Asynchronously preserve data in IndexedDB
            try {
              if (window.indexedDB) {
                import('./indexedDbStorage').then((m) => {
                  try {
                    const parsed = JSON.parse(value);
                    m.idbSaveFailoverData(key, parsed).catch(() => {});
                  } catch {
                    m.idbSaveFailoverData(key, value).catch(() => {});
                  }
                }).catch(() => {});
              }
            } catch {}
          }
        } else {
          throw err;
        }
      }
    };
  }
}

