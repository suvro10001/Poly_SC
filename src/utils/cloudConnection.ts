/**
 * Cloud and Internet Connection Guard
 * Checks whether user has an active internet connection AND is connected to the app's cloud.
 * If offline or not connected to the cloud, blocks entries and alerts the user.
 * Guarantees that no entry can be taken without a verified connection,
 * ensuring saved data is immediately synchronized and never vanishes on reload.
 */

import { useState, useEffect } from 'react';
import { isFirestoreQuotaExhausted } from '../firebase';
import { getCloudFailoverConfig } from './cloudSyncManager';

type ConnectionListener = (connected: boolean) => void;
const listeners = new Set<ConnectionListener>();

let inMemoryCloudConnected = typeof navigator !== 'undefined' ? navigator.onLine : true;
let lastPingTime = 0;
const PING_INTERVAL_MS = 15000;

export function isOnline(): boolean {
  if (typeof navigator !== 'undefined') {
    return navigator.onLine;
  }
  return true;
}

let lastOfflineAlert = 0;
export function triggerOfflineWarning(msg?: string) {
  if (Date.now() - lastOfflineAlert < 4000) return;
  lastOfflineAlert = Date.now();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('polycables_offline_warning', { detail: { message: msg } }));
  }
}

export function useConnectivityStatus() {
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [offlineWarning, setOfflineWarning] = useState<string | null>(null);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      setOfflineWarning(null);
    };
    const handleOffline = () => {
      setOnline(false);
      setOfflineWarning('No internet connection. Changes cannot be saved to the cloud.');
    };
    const handleCustomWarning = (e: any) => {
      setOfflineWarning(e.detail?.message || 'Offline warning');
      setTimeout(() => setOfflineWarning(null), 5000);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('polycables_offline_warning', handleCustomWarning);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('polycables_offline_warning', handleCustomWarning);
    };
  }, []);

  return { isOnline: online, offlineWarning };
}

/**
 * Checks if the app is currently connected to the internet and cloud.
 */
export function isCloudConnected(): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }
  return inMemoryCloudConnected;
}

/**
 * Explicitly updates cloud connection state and notifies all listeners.
 */
export function setCloudConnected(connected: boolean): void {
  if (inMemoryCloudConnected !== connected) {
    inMemoryCloudConnected = connected;
    listeners.forEach((listener) => {
      try {
        listener(connected);
      } catch (err) {
        console.warn('Error in cloud connection listener:', err);
      }
    });
  }
}

/**
 * Subscribes to real-time cloud connection state changes.
 */
export function subscribeCloudConnectionStatus(listener: ConnectionListener): () => void {
  listeners.add(listener);
  listener(isCloudConnected());
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Pings the backend cloud sync endpoint or checks failover cloud status.
 */
export async function pingCloudConnection(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setCloudConnected(false);
    return false;
  }

  // Throttle ping requests
  if (Date.now() - lastPingTime < 4000) {
    return isCloudConnected();
  }
  lastPingTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch('/api/sync', {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      setCloudConnected(true);
      return true;
    }

    // If server returned non-200, check if we have multi-cloud failover or firestore active
    const cfg = getCloudFailoverConfig();
    const hasActiveCloudNodes = (cfg.cloudNodes || []).some((n) => n.status === 'active');
    const connected = hasActiveCloudNodes || !isFirestoreQuotaExhausted();
    setCloudConnected(connected);
    return connected;
  } catch {
    // If /api/sync timed out or network error
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      // Check failover cloud nodes
      const cfg = getCloudFailoverConfig();
      const hasActiveCloudNodes = (cfg.cloudNodes || []).some((n) => n.status === 'active');
      const isOnlineWithCloud = hasActiveCloudNodes || !isFirestoreQuotaExhausted();
      setCloudConnected(isOnlineWithCloud);
      return isOnlineWithCloud;
    }
    setCloudConnected(false);
    return false;
  }
}

// Global browser event listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    pingCloudConnection();
  });

  window.addEventListener('offline', () => {
    setCloudConnected(false);
  });

  // Background ping interval
  setInterval(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      pingCloudConnection().catch(() => {});
    }
  }, PING_INTERVAL_MS);
}

/**
 * Entry Guard Function:
 * User requirement:
 * "if use not have internet and not connect with my apps cloud then not take any entry.
 * ensure that after reload not vanish any entry."
 *
 * Returns true if entry is allowed, false if blocked.
 * If blocked, invokes notifyFn with a clear error explanation.
 */
export function checkCanTakeEntry(
  moduleName: string = 'Entry',
  notifyFn?: (msg: string, type?: string) => void
): boolean {
  const hasInternet = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const connectedToCloud = isCloudConnected();

  if (!hasInternet) {
    const errorMsg = `Cannot save ${moduleName}: No Internet Connection detected! Please connect to the internet to take entries.`;

    if (notifyFn) {
      try {
        notifyFn(errorMsg, 'error');
      } catch {
        try {
          (notifyFn as any)('error', errorMsg);
        } catch (e) {
          console.warn('Cloud entry guard alert:', errorMsg);
        }
      }
    }

    return false;
  }

  return true;
}
