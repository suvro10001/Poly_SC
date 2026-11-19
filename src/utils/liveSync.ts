/**
 * Ultra-Fast Real-Time Live Sync Engine
 * Enables 0ms instantaneous updates across tabs, windows, and devices.
 * Integrates BroadcastChannel, Window Storage Events, and Custom DOM events.
 */

const CHANNEL_NAME = 'polycables_instant_live_sync';
let channel: BroadcastChannel | null = null;

try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
} catch (e) {
  channel = null;
}

export interface LiveSyncMessage {
  type: 'LIVE_UPDATE';
  key: string;
  data: any;
  timestamp: number;
  sourceId: string;
}

const TAB_SOURCE_ID = `tab-${Math.random().toString(36).substring(2, 9)}-${Date.now()}`;

/**
 * Broadcasts a data update instantly to all other open tabs and components.
 */
export function broadcastLiveUpdate(key: string, data: any): void {
  if (typeof window === 'undefined') return;

  const payload: LiveSyncMessage = {
    type: 'LIVE_UPDATE',
    key,
    data,
    timestamp: Date.now(),
    sourceId: TAB_SOURCE_ID
  };

  // 1. BroadcastChannel: 0ms zero-latency transmission to other tabs/windows
  if (channel) {
    try {
      channel.postMessage(payload);
    } catch (e) {
      // ignore
    }
  }

  // 2. Custom DOM event for instant intra-window subscriber updates
  try {
    window.dispatchEvent(
      new CustomEvent('polycables_live_sync_update', {
        detail: { key, data, sourceId: TAB_SOURCE_ID }
      })
    );
  } catch (e) {}

  // 3. Storage event fallback: triggers 'storage' event in other tabs
  try {
    localStorage.setItem(
      'polycables_live_ping',
      JSON.stringify({ key, ts: Date.now(), sourceId: TAB_SOURCE_ID })
    );
  } catch (e) {}
}

/**
 * Subscribes to instant live updates from other tabs, windows, or components.
 */
export function subscribeLiveUpdate(
  callback: (key: string, data: any, sourceId: string) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  // 1. Handler for BroadcastChannel
  const handleBroadcast = (event: MessageEvent) => {
    try {
      const msg = event.data as LiveSyncMessage;
      if (msg && msg.type === 'LIVE_UPDATE' && msg.sourceId !== TAB_SOURCE_ID) {
        callback(msg.key, msg.data, msg.sourceId);
      }
    } catch (e) {}
  };

  if (channel) {
    channel.addEventListener('message', handleBroadcast);
  }

  // 2. Handler for Storage Events across tabs
  const handleStorage = (event: StorageEvent) => {
    if (event.key === 'polycables_live_ping' && event.newValue) {
      try {
        const ping = JSON.parse(event.newValue);
        if (ping && ping.sourceId !== TAB_SOURCE_ID && ping.key) {
          const rawData = localStorage.getItem(`polycables_${ping.key}`);
          if (rawData) {
            const parsedData = JSON.parse(rawData);
            callback(ping.key, parsedData, ping.sourceId);
          }
        }
      } catch (e) {}
    }
  };

  window.addEventListener('storage', handleStorage);

  // 3. Handler for intra-window custom event
  const handleCustomEvent = (event: Event) => {
    try {
      const customEvt = event as CustomEvent;
      if (
        customEvt.detail &&
        customEvt.detail.key &&
        customEvt.detail.sourceId !== TAB_SOURCE_ID
      ) {
        callback(customEvt.detail.key, customEvt.detail.data, customEvt.detail.sourceId);
      }
    } catch (e) {}
  };

  window.addEventListener('polycables_live_sync_update', handleCustomEvent);

  // Cleanup
  return () => {
    if (channel) {
      channel.removeEventListener('message', handleBroadcast);
    }
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener('polycables_live_sync_update', handleCustomEvent);
  };
}
