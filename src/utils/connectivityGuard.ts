import { useState, useEffect } from 'react';

/**
 * Strict Connectivity Guard & Real-Time Connection Monitoring
 * 
 * Enforces rule:
 * 1. Checks for active internet connection before any write, update, or delete.
 * 2. If offline, blocks the upload entirely, prevents local fallback queuing,
 *    and displays a clear, non-blocking UI warning.
 * 3. Operations only execute and sync when cloud connection is actively established and verified.
 */

const OFFLINE_EVENT = 'polycables_offline_warning';
const OFFLINE_WARNING_TEXT = 'No internet connection. Changes cannot be saved to the cloud';

let cachedIsOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;

// Setup global window listeners to track online/offline status in real time
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    cachedIsOnline = true;
    window.dispatchEvent(new CustomEvent('polycables_connectivity_change', { detail: { isOnline: true } }));
  });
  window.addEventListener('offline', () => {
    cachedIsOnline = false;
    window.dispatchEvent(new CustomEvent('polycables_connectivity_change', { detail: { isOnline: false } }));
  });
}

/**
 * Synchronous check if the browser is currently online
 */
export function isOnline(): boolean {
  if (typeof navigator !== 'undefined') {
    return navigator.onLine && cachedIsOnline;
  }
  return true;
}

/**
 * Trigger the non-blocking UI warning indicating that changes cannot be saved offline
 */
export function triggerOfflineWarning(customMessage?: string, actionName?: string) {
  if (typeof window === 'undefined') return;
  const message = customMessage || OFFLINE_WARNING_TEXT;
  window.dispatchEvent(
    new CustomEvent(OFFLINE_EVENT, {
      detail: {
        message,
        actionName,
        timestamp: Date.now()
      }
    })
  );
}

/**
 * Strict Connectivity Guard:
 * Call this BEFORE performing ANY mutation (create, edit, delete).
 * Returns true if online and allowed to proceed.
 * If offline, blocks mutation entirely, prevents queuing, triggers non-blocking warning, and returns false.
 */
export function assertOnline(actionName?: string): boolean {
  if (!isOnline()) {
    triggerOfflineWarning(OFFLINE_WARNING_TEXT, actionName);
    return false;
  }
  return true;
}

/**
 * Custom React hook to monitor connectivity status and listen for offline blocked attempts
 */
export function useConnectivityStatus() {
  const [onlineStatus, setOnlineStatus] = useState<boolean>(() => isOnline());
  const [offlineWarning, setOfflineWarning] = useState<string | null>(null);

  useEffect(() => {
    const handleStatusChange = (e: Event) => {
      const customEv = e as CustomEvent<{ isOnline: boolean }>;
      const next = customEv?.detail?.isOnline !== undefined ? customEv.detail.isOnline : isOnline();
      setOnlineStatus(next);
      if (next) {
        setOfflineWarning(null);
      }
    };

    const handleOfflineBlocked = (e: Event) => {
      const customEv = e as CustomEvent<{ message: string; actionName?: string }>;
      const msg = customEv.detail?.message || OFFLINE_WARNING_TEXT;
      setOfflineWarning(msg);
      // Automatically clear toast message after 4.5 seconds
      setTimeout(() => {
        setOfflineWarning((prev) => (prev === msg ? null : prev));
      }, 4500);
    };

    window.addEventListener('online', handleStatusChange);
    window.addEventListener('offline', handleStatusChange);
    window.addEventListener('polycables_connectivity_change', handleStatusChange);
    window.addEventListener(OFFLINE_EVENT, handleOfflineBlocked);

    return () => {
      window.removeEventListener('online', handleStatusChange);
      window.removeEventListener('offline', handleStatusChange);
      window.removeEventListener('polycables_connectivity_change', handleStatusChange);
      window.removeEventListener(OFFLINE_EVENT, handleOfflineBlocked);
    };
  }, []);

  return {
    isOnline: onlineStatus,
    offlineWarning,
    clearWarning: () => setOfflineWarning(null)
  };
}
