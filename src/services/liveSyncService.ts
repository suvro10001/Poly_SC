// Live Multi-Device Real-Time Synchronization Service
// Connects this device to the Server Sync Hub via Server-Sent Events (SSE)
// and handles instant bidirectional data sync across all devices.

import { syncGlobalDeletedIds } from '../utils/deletedTracker';

export interface SyncStatus {
  connected: boolean;
  version: number;
  lastSyncedAt: string | null;
  clientCount: number;
}

type PatchListener = (patch: Record<string, any>, serverVersion: number) => void;

class LiveSyncService {
  private clientId: string;
  private eventSource: EventSource | null = null;
  private patchListeners: Set<PatchListener> = new Set();
  private localVersion = 0;
  private isConnected = false;
  private clientCount = 1;
  private lastSyncedAt: string | null = null;
  private reconnectTimeout: any = null;
  private heartbeatInterval: any = null;
  private pendingPushBatch: Record<string, any> = {};
  private pushTimer: any = null;

  constructor() {
    // Generate or retrieve persistent session ID for this client/device
    let cid = '';
    try {
      cid = sessionStorage.getItem('polycables_live_client_id') || '';
    } catch {}
    if (!cid) {
      cid = `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      try {
        sessionStorage.setItem('polycables_live_client_id', cid);
      } catch {}
    }
    this.clientId = cid;

    // Listen to tab visibility & window focus to instantly catch up
    if (typeof window !== 'undefined') {
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.checkServerVersionAndCatchUp();
        }
      });
      window.addEventListener('focus', () => {
        this.checkServerVersionAndCatchUp();
      });
      window.addEventListener('online', () => {
        this.connect();
        this.checkServerVersionAndCatchUp();
      });
    }
  }

  public getClientId(): string {
    return this.clientId;
  }

  public getStatus(): SyncStatus {
    return {
      connected: this.isConnected,
      version: this.localVersion,
      lastSyncedAt: this.lastSyncedAt,
      clientCount: this.clientCount
    };
  }

  /**
   * Subscribe to live patches pushed from other devices
   */
  public onPatch(listener: PatchListener): () => void {
    this.patchListeners.add(listener);
    return () => {
      this.patchListeners.delete(listener);
    };
  }

  /**
   * Start live SSE connection to server
   */
  public connect() {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {}
      this.eventSource = null;
    }

    try {
      this.eventSource = new EventSource('/api/sync/stream');

      this.eventSource.addEventListener('connected', (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data);
          this.isConnected = true;
          this.clientCount = payload.clientCount || 1;
          if (payload.version) {
            this.localVersion = payload.version;
          }
          this.lastSyncedAt = new Date().toISOString();
          this.notifyStatusChange();
        } catch {}
      });

      this.eventSource.addEventListener('sync', (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data);
          if (!payload) return;

          this.isConnected = true;
          if (payload.version) {
            this.localVersion = payload.version;
          }
          this.lastSyncedAt = new Date().toISOString();

          // Sync tombstones across all devices
          if (Array.isArray(payload.deletedEntityIds) && payload.deletedEntityIds.length > 0) {
            syncGlobalDeletedIds(payload.deletedEntityIds);
          }
          if (payload.patch?.deletedEntityIds && Array.isArray(payload.patch.deletedEntityIds)) {
            syncGlobalDeletedIds(payload.patch.deletedEntityIds);
          }

          // If event was sent by another device, notify all local listeners
          if (payload.senderId !== this.clientId) {
            const dataToNotify = payload.patch || (payload.deletedEntityIds ? { deletedEntityIds: payload.deletedEntityIds } : null);
            if (dataToNotify) {
              for (const listener of this.patchListeners) {
                try {
                  listener(dataToNotify, payload.version);
                } catch (e) {
                  console.warn('[LiveSync] Error in listener callback:', e);
                }
              }
            }
          }
          this.notifyStatusChange();
        } catch (e) {
          console.warn('[LiveSync] Error parsing incoming sync payload:', e);
        }
      });

      this.eventSource.onopen = () => {
        this.isConnected = true;
        this.notifyStatusChange();
      };

      this.eventSource.onerror = () => {
        this.isConnected = false;
        this.notifyStatusChange();
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }
        // Fast retry connection in 2 seconds
        if (!this.reconnectTimeout) {
          this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            this.connect();
          }, 2000);
        }
      };

      // Periodic check every 4 seconds to ensure no patches were missed
      if (!this.heartbeatInterval) {
        this.heartbeatInterval = setInterval(() => {
          this.checkServerVersionAndCatchUp();
        }, 4000);
      }
    } catch (e) {
      console.warn('[LiveSync] Failed to initialize EventSource:', e);
    }
  }

  /**
   * Fetch full state from server (for initial hydration or catch-up)
   */
  public async fetchFullState(): Promise<Record<string, any> | null> {
    try {
      const res = await fetch('/api/sync', { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      if (data && data.success && data.data) {
        if (data.version) {
          this.localVersion = data.version;
        }
        this.isConnected = true;
        this.lastSyncedAt = new Date().toISOString();
        this.notifyStatusChange();
        return data.data;
      }
      return null;
    } catch (err) {
      console.warn('[LiveSync] Failed to fetch full state from server:', err);
      return null;
    }
  }

  /**
   * Push a local update slice to the server so ALL other devices receive it in real-time
   * Instant zero-delay dispatch without debounce delays
   */
  public pushUpdate(dataSlice: Record<string, any>) {
    if (!dataSlice || typeof dataSlice !== 'object') return;

    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }

    // Merge into pending push batch
    this.pendingPushBatch = { ...this.pendingPushBatch, ...dataSlice };

    // Zero-delay instant background synchronization
    this.flushPendingPush();
  }

  /**
   * Immediately flush an update without debounce (crucial for deletes & final saves)
   */
  public pushUpdateNow(dataSlice: Record<string, any>) {
    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
    if (dataSlice && typeof dataSlice === 'object') {
      this.pendingPushBatch = { ...this.pendingPushBatch, ...dataSlice };
    }
    return this.flushPendingPush();
  }

  /**
   * Optimistic mutation sync with automatic rollback on network/server error
   */
  public async syncMutation(
    patch: Record<string, any>,
    rollbackFn?: () => void,
    onSuccess?: () => void,
    onError?: (err: Error) => void
  ): Promise<boolean> {
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: this.clientId,
          patch
        })
      });

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const result = await res.json();
      if (result && result.version) {
        this.localVersion = result.version;
      }
      this.isConnected = true;
      this.lastSyncedAt = new Date().toISOString();
      this.notifyStatusChange();
      onSuccess?.();
      return true;
    } catch (err: any) {
      console.error('[LiveSync] Mutation sync failed, triggering rollback:', err);
      rollbackFn?.();
      onError?.(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }

  /**
   * Optimistic delete sync with automatic rollback on network/server error
   */
  public async syncDeleteMutation(
    idOrIds: string | string[],
    type?: string,
    rollbackFn?: () => void,
    onSuccess?: () => void,
    onError?: (err: Error) => void
  ): Promise<boolean> {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    if (ids.length === 0) return true;
    syncGlobalDeletedIds(ids);

    try {
      const res = await fetch('/api/sync/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: this.clientId,
          ids,
          type
        })
      });

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const result = await res.json();
      if (result && result.version) {
        this.localVersion = result.version;
      }
      this.isConnected = true;
      this.lastSyncedAt = new Date().toISOString();
      this.notifyStatusChange();
      onSuccess?.();
      return true;
    } catch (err: any) {
      console.error('[LiveSync] Delete sync failed, triggering rollback:', err);
      rollbackFn?.();
      onError?.(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }


  /**
   * Explicitly notify server of deleted entity ID(s)
   */
  public async deleteEntity(idOrIds: string | string[], type?: string): Promise<boolean> {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    if (ids.length === 0) return true;
    syncGlobalDeletedIds(ids);

    try {
      const res = await fetch('/api/sync/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: this.clientId,
          ids,
          type
        })
      });
      if (res.ok) {
        const result = await res.json();
        if (result && result.version) {
          this.localVersion = result.version;
        }
        this.isConnected = true;
        this.lastSyncedAt = new Date().toISOString();
        this.notifyStatusChange();
        return true;
      }
    } catch (err) {
      console.warn('[LiveSync] Error sending delete to server:', err);
    }
    return false;
  }

  private async flushPendingPush() {
    const patchToSend = { ...this.pendingPushBatch };
    this.pendingPushBatch = {};
    if (Object.keys(patchToSend).length === 0) return;

    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: this.clientId,
          patch: patchToSend
        })
      });

      if (res.ok) {
        const result = await res.json();
        if (result && result.version) {
          this.localVersion = result.version;
        }
        this.isConnected = true;
        this.lastSyncedAt = new Date().toISOString();
        this.notifyStatusChange();
      } else {
        // Re-queue on HTTP error
        this.pendingPushBatch = { ...patchToSend, ...this.pendingPushBatch };
      }
    } catch (err) {
      // Re-queue on network failure
      this.pendingPushBatch = { ...patchToSend, ...this.pendingPushBatch };
      this.isConnected = false;
      this.notifyStatusChange();
    }
  }

  /**
   * Fast version check: if server has newer data, pull it
   */
  private async checkServerVersionAndCatchUp() {
    try {
      const res = await fetch('/api/sync/status', { cache: 'no-store' });
      if (!res.ok) return;
      const status = await res.json();
      if (status && status.version && status.version > this.localVersion) {
        const fullData = await this.fetchFullState();
        if (fullData) {
          for (const listener of this.patchListeners) {
            try {
              listener(fullData, this.localVersion);
            } catch {}
          }
        }
      }
      this.isConnected = true;
      if (status.clientCount) this.clientCount = status.clientCount;
      this.notifyStatusChange();
    } catch {
      // offline
    }
  }

  private notifyStatusChange() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('polycables_live_sync_status', {
          detail: this.getStatus()
        })
      );
    }
  }
}

export const liveSync = new LiveSyncService();
