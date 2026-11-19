// Supabase Tier-2 Cloud Fallback Client (Strict Cloud-Only, In-Memory Retry Queue Only)
// Never persists master application data or failover queues in localStorage or IndexedDB.

import { getCloudFailoverConfig, saveCloudFailoverConfig } from './cloudSyncManager';

const SUPABASE_DEFAULT_TABLE = 'app_sync_store';

export interface SupabaseRetryQueueState {
  patch: Record<string, any>;
  queuedAt: number;
}

// Strictly in-memory retry queue (zero localStorage / IndexedDB persistence)
let inMemorySupabaseRetryQueue: SupabaseRetryQueueState = { patch: {}, queuedAt: 0 };
let supabaseUnavailableUntil = 0;
let supabaseNotConfiguredOnServer = false;
let supabaseServerCheckAt = 0;

// Purge any legacy localStorage failover data from earlier builds
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('polycables_supabase_failover_data');
    localStorage.removeItem('polycables_supabase_retry_queue');
  } catch {}
}

function getClientSupabaseCredentials(): { url: string; key: string; table: string } | null {
  try {
    const envUrl = String((import.meta as any)?.env?.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
    const envKey = String((import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY || '').trim();
    if (envUrl && envKey && /^https?:\/\//i.test(envUrl)) {
      return {
        url: envUrl,
        key: envKey,
        table: String((import.meta as any)?.env?.VITE_SUPABASE_SYNC_TABLE || SUPABASE_DEFAULT_TABLE).trim()
      };
    }
    const cfg = getCloudFailoverConfig();
    const supaNode = (cfg.cloudNodes || []).find(
      (n) =>
        n.provider === 'supabase' &&
        n.status !== 'disabled' &&
        Boolean(n.apiKey && n.apiKey.trim().length > 10) &&
        Boolean(n.databaseUrl && /^https?:\/\//i.test(n.databaseUrl) && !n.databaseUrl.includes('polycables-erp.supabase.co'))
    );
    if (supaNode && supaNode.databaseUrl && supaNode.apiKey) {
      return {
        url: supaNode.databaseUrl.trim().replace(/\/+$/, ''),
        key: supaNode.apiKey.trim(),
        table: SUPABASE_DEFAULT_TABLE
      };
    }
  } catch {}
  return null;
}

export function isSupabaseUnavailable(): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (supabaseUnavailableUntil > 0 && Date.now() < supabaseUnavailableUntil) {
    return true;
  }
  supabaseUnavailableUntil = 0;
  return false;
}

export function markSupabaseUnavailable(unavailable: boolean = true, cooldownMs: number = 45 * 1000) {
  supabaseUnavailableUntil = unavailable ? Date.now() + cooldownMs : 0;
}

export async function getSupabaseRetryQueue(): Promise<SupabaseRetryQueueState> {
  return {
    patch: { ...inMemorySupabaseRetryQueue.patch },
    queuedAt: inMemorySupabaseRetryQueue.queuedAt
  };
}

export async function enqueueSupabaseRetry(patch: Record<string, any>): Promise<void> {
  if (!patch || Object.keys(patch).length === 0) return;
  inMemorySupabaseRetryQueue = {
    patch: patch._forceClear ? { ...patch } : { ...inMemorySupabaseRetryQueue.patch, ...patch },
    queuedAt: Date.now()
  };
}

export async function clearSupabaseRetryQueue(): Promise<void> {
  inMemorySupabaseRetryQueue = { patch: {}, queuedAt: 0 };
}

function buildSupabaseRows(patch: Record<string, any>, clientId?: string) {
  const nowVer = Date.now();
  const nowIso = new Date(nowVer).toISOString();
  const rows: Array<{ slice_key: string; value: any; version: number; updated_at: string; sender_id: string }> = [];
  for (const [k, v] of Object.entries(patch)) {
    if (!k || (k.startsWith('_') && k !== '_itemsCleared')) continue;
    if (v === undefined) continue;
    rows.push({
      slice_key: k,
      value: v,
      version: nowVer,
      updated_at: nowIso,
      sender_id: clientId || 'client'
    });
  }
  return rows;
}

/**
 * Tier 2 Push: Writes changed slices strictly to remote Supabase REST (direct client env/node or server proxy).
 * Returns { ok: false } when unreachable/unconfigured so the orchestrator cascades directly to the next cloud node.
 */
export async function pushPatchToSupabase(
  patch: Record<string, any>,
  options?: { clientId?: string; skipQueue?: boolean; fromRetryQueue?: boolean }
): Promise<{ ok: boolean; reason?: string }> {
  if (!patch || Object.keys(patch).length === 0) {
    return { ok: true };
  }

  if (isSupabaseUnavailable()) {
    if (!options?.fromRetryQueue && !options?.skipQueue) {
      enqueueSupabaseRetry(patch).catch(() => {});
    }
    return { ok: false, reason: 'cooldown' };
  }

  const directCreds = getClientSupabaseCredentials();
  if (directCreds) {
    try {
      const rows = buildSupabaseRows(patch, options?.clientId);
      if (rows.length === 0) return { ok: true };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(
        `${directCreds.url}/rest/v1/${encodeURIComponent(directCreds.table)}?on_conflict=slice_key`,
        {
          method: 'POST',
          headers: {
            apikey: directCreds.key,
            Authorization: `Bearer ${directCreds.key}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify(rows),
          signal: controller.signal
        }
      );
      clearTimeout(timer);

      if (res.ok) {
        markSupabaseUnavailable(false);
        saveCloudFailoverConfig({
          secondaryCloudStatus: 'active',
          failoverProvider: 'supabase',
          lastSyncTimestamp: new Date().toISOString()
        });
        return { ok: true };
      }
      markSupabaseUnavailable(true);
      if (!options?.fromRetryQueue && !options?.skipQueue) {
        enqueueSupabaseRetry(patch).catch(() => {});
      }
      return { ok: false, reason: `supabase_http_${res.status}` };
    } catch {
      markSupabaseUnavailable(true);
      if (!options?.fromRetryQueue && !options?.skipQueue) {
        enqueueSupabaseRetry(patch).catch(() => {});
      }
      return { ok: false, reason: 'supabase_network_error' };
    }
  }

  if (supabaseNotConfiguredOnServer && Date.now() - supabaseServerCheckAt < 5 * 60 * 1000) {
    return { ok: false, reason: 'supabase_not_configured' };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('/api/sync/supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: options?.clientId || 'client',
        patch
      }),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) {
      markSupabaseUnavailable(true);
      if (!options?.fromRetryQueue && !options?.skipQueue) {
        enqueueSupabaseRetry(patch).catch(() => {});
      }
      return { ok: false, reason: `proxy_http_${res.status}` };
    }
    const json = await res.json().catch(() => null);
    if (json && json.configured === false) {
      supabaseNotConfiguredOnServer = true;
      supabaseServerCheckAt = Date.now();
      return { ok: false, reason: 'supabase_not_configured' };
    }
    if (json && json.success) {
      supabaseNotConfiguredOnServer = false;
      markSupabaseUnavailable(false);
      saveCloudFailoverConfig({
        secondaryCloudStatus: 'active',
        failoverProvider: 'supabase',
        lastSyncTimestamp: new Date().toISOString()
      });
      return { ok: true };
    }

    markSupabaseUnavailable(true);
    if (!options?.fromRetryQueue && !options?.skipQueue) {
      enqueueSupabaseRetry(patch).catch(() => {});
    }
    return { ok: false, reason: json?.error || 'supabase_proxy_failed' };
  } catch {
    markSupabaseUnavailable(true);
    if (!options?.fromRetryQueue && !options?.skipQueue) {
      enqueueSupabaseRetry(patch).catch(() => {});
    }
    return { ok: false, reason: 'proxy_unreachable' };
  }
}

/**
 * Tier 2 Pull: Reads synced state strictly from remote Supabase REST (direct or /api/sync/supabase proxy).
 */
export async function pullStateFromSupabase(): Promise<{ ok: boolean; data: Record<string, any> | null }> {
  if (isSupabaseUnavailable()) {
    return { ok: false, data: null };
  }

  const directCreds = getClientSupabaseCredentials();
  if (directCreds) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(
        `${directCreds.url}/rest/v1/${encodeURIComponent(directCreds.table)}?select=slice_key,value,version,updated_at,sender_id`,
        {
          method: 'GET',
          headers: {
            apikey: directCreds.key,
            Authorization: `Bearer ${directCreds.key}`,
            Accept: 'application/json'
          },
          signal: controller.signal
        }
      );
      clearTimeout(timer);
      if (!res.ok) {
        markSupabaseUnavailable(true);
        return { ok: false, data: null };
      }
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        return { ok: true, data: null };
      }
      const assembled: Record<string, any> = {};
      for (const row of rows) {
        if (row && row.slice_key) {
          assembled[String(row.slice_key)] = row.value;
        }
      }
      markSupabaseUnavailable(false);
      return { ok: true, data: assembled };
    } catch {
      markSupabaseUnavailable(true);
      return { ok: false, data: null };
    }
  }

  if (supabaseNotConfiguredOnServer && Date.now() - supabaseServerCheckAt < 5 * 60 * 1000) {
    return { ok: false, data: null };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('/api/sync/supabase', {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) {
      markSupabaseUnavailable(true);
      return { ok: false, data: null };
    }
    const json = await res.json().catch(() => null);
    if (json && json.configured === false) {
      supabaseNotConfiguredOnServer = true;
      supabaseServerCheckAt = Date.now();
      return { ok: false, data: null };
    }
    if (json && json.success) {
      supabaseNotConfiguredOnServer = false;
      markSupabaseUnavailable(false);
      return { ok: true, data: json.data && typeof json.data === 'object' ? json.data : null };
    }
    markSupabaseUnavailable(true);
    return { ok: false, data: null };
  } catch {
    markSupabaseUnavailable(true);
    return { ok: false, data: null };
  }
}

export async function probeSupabaseRecovery(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  if (isSupabaseUnavailable()) return false;

  const directCreds = getClientSupabaseCredentials();
  if (directCreds) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(
        `${directCreds.url}/rest/v1/${encodeURIComponent(directCreds.table)}?select=slice_key&limit=1`,
        {
          method: 'GET',
          headers: {
            apikey: directCreds.key,
            Authorization: `Bearer ${directCreds.key}`,
            Accept: 'application/json'
          },
          signal: controller.signal
        }
      );
      clearTimeout(timer);
      if (res.ok) {
        markSupabaseUnavailable(false);
        return true;
      }
      markSupabaseUnavailable(true);
      return false;
    } catch {
      markSupabaseUnavailable(true);
      return false;
    }
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch('/api/sync/supabase/health', {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return false;
    const json = await res.json().catch(() => null);
    if (json && json.configured === false) {
      supabaseNotConfiguredOnServer = true;
      supabaseServerCheckAt = Date.now();
      return false;
    }
    if (json && json.reachable === true) {
      supabaseNotConfiguredOnServer = false;
      markSupabaseUnavailable(false);
      return true;
    }
    markSupabaseUnavailable(true);
    return false;
  } catch {
    markSupabaseUnavailable(true);
    return false;
  }
}

export async function flushSupabaseRetryQueue(clientId?: string): Promise<boolean> {
  const q = inMemorySupabaseRetryQueue;
  if (!q.patch || Object.keys(q.patch).length === 0) return true;
  const healthy = await probeSupabaseRecovery();
  if (!healthy) return false;

  const res = await pushPatchToSupabase(q.patch, {
    clientId,
    fromRetryQueue: true
  });
  if (res.ok) {
    if (inMemorySupabaseRetryQueue.queuedAt <= q.queuedAt) {
      await clearSupabaseRetryQueue();
    }
    return true;
  }
  return false;
}

export async function fetchDataFromSupabase(): Promise<Record<string, any>> {
  const remote = await pullStateFromSupabase();
  return remote.ok && remote.data ? remote.data : {};
}

export async function syncDataSliceToSupabase(dataSlice: Record<string, any>): Promise<boolean> {
  const res = await pushPatchToSupabase(dataSlice, { skipQueue: true });
  return res.ok;
}
