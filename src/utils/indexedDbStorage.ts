/**
 * IndexedDB storage utility for client-side caching & failover
 */

const DB_NAME = 'PolyCablesFailoverDB';
const STORE_NAME = 'failover_store';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbSaveFailoverData(key: string, data: any): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.put(data, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    // Fallback to localStorage if IDB fails
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (_) {}
  }
}

export async function idbGetFailoverData(key: string): Promise<any | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (_) {
      return null;
    }
  }
}

const idbSaveDebounceTimers = new Map<string, any>();

export function debouncedIdbSave(key: string, data: any, delayMs = 600) {
  if (typeof window === 'undefined' || !window.indexedDB) return;
  if (idbSaveDebounceTimers.has(key)) {
    clearTimeout(idbSaveDebounceTimers.get(key));
  }
  const timer = setTimeout(() => {
    idbSaveDebounceTimers.delete(key);
    idbSaveFailoverData(key, data).catch(() => {});
  }, delayMs);
  idbSaveDebounceTimers.set(key, timer);
}

/**
 * Safely saves data to localStorage and mirrors to IndexedDB.
 * If localStorage quota is exceeded (QuotaExceededError), it clears expendable caches
 * and ensures data is preserved in IndexedDB without crashing the application.
 */
export function safeSetStorageItem(key: string, value: string, rawData?: any): boolean {
  try {
    localStorage.setItem(key, value);
    try {
      localStorage.removeItem(`${key}__idb_only`);
    } catch (_) {}
    if (rawData !== undefined) {
      debouncedIdbSave(key, rawData, 800);
    }
    return true;
  } catch (err: any) {
    console.warn(`[Storage Warning] localStorage quota exceeded while writing "${key}":`, err?.message || err);
    const dataToSave = rawData !== undefined ? rawData : (() => {
      try {
        return typeof value === 'string' ? JSON.parse(value) : value;
      } catch {
        return value;
      }
    })();

    // Always persist full unstripped payload to IndexedDB first
    try {
      idbSaveFailoverData(key, dataToSave).catch(() => {});
    } catch (_) {}

    // 1. Attempt to free up expendable local caches and retry
    try {
      const expendableKeys = [
        'polycables_stored_bills_cache',
        'polycables_pdf_cache',
        'polycables_print_preview_cache',
        'polycables_temp_backup',
        'polycables_auto_draft',
        'polycables_failover_cloud_storage'
      ];
      expendableKeys.forEach((k) => {
        if (k !== key) {
          try { localStorage.removeItem(k); } catch (_) {}
        }
      });
      localStorage.setItem(key, value);
      try {
        localStorage.removeItem(`${key}__idb_only`);
      } catch (_) {}
      return true;
    } catch (_) {
      // 2. If still too large (e.g. storedBills with base64 receivedCopy scans), store lightweight version in localStorage
      // and mark IndexedDB as holding full attachments so stale pre-restore localStorage data never lingers
      try {
        localStorage.removeItem(key);
        if (Array.isArray(dataToSave)) {
          const lightArr = dataToSave.map((item: any) => {
            if (!item || typeof item !== 'object') return item;
            const copy = { ...item };
            if (typeof copy.receivedCopy === 'string' && copy.receivedCopy.length > 1500) {
              delete copy.receivedCopy;
            }
            if (copy.header && typeof copy.header === 'object' && typeof copy.header.receivedCopy === 'string' && copy.header.receivedCopy.length > 1500) {
              copy.header = { ...copy.header };
              delete copy.header.receivedCopy;
            }
            return copy;
          });
          localStorage.setItem(key, JSON.stringify(lightArr));
        }
      } catch (_) {
        try { localStorage.removeItem(key); } catch {}
      }
      try {
        localStorage.setItem(`${key}__idb_only`, '1');
      } catch (_) {}
      return false;
    }
  }
}

