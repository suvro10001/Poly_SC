// Global Deleted Entity Tracker (Tombstones)
// Ensures that when any device deletes an item, bill, party, salesperson, expense,
// collection, or deposit, that deletion is synchronized across ALL devices and
// cannot be accidentally resurrected by local caches or race conditions.

const DELETED_IDS_KEY = 'polycables_global_deleted_ids';

let deletedIdsSet = new Set<string>();

const isInvalidShortNumericTombstone = (s: string) => /^\d{1,5}$/.test(s);

export const ALL_TRASH_STORAGE_KEYS = [
  'polycables_trashed_bills',
  'polycables_trashed_draft_bills',
  'polycables_trashed_challans',
  'polycables_trashed_items',
  'polycables_trashed_parties',
  'polycables_trashed_collections',
  'polycables_trashed_users',
  'polycables_trashed_branches',
  'polycables_trashed_requisitions',
  'polycables_trashed_conveyances',
  'polycables_trashed_expenses',
  'polycables_trashed_deposits',
  'polycables_trashed_returns',
  'polycables_trashed_factory_imports',
  'polycables_universal_trash'
];

// 7-day immunity window for explicitly restored IDs so stale Firestore/slice/cache snapshots cannot re-tombstone them
const RESTORE_IMMUNITY_MS = 7 * 24 * 60 * 60 * 1000;

// Initialize from localStorage and all trash collections
try {
  if (typeof window !== 'undefined') {
    const raw = localStorage.getItem(DELETED_IDS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        arr.forEach((id) => {
          if (id) {
            const str = String(id).trim();
            if (str && !isInvalidShortNumericTombstone(str)) {
              deletedIdsSet.add(str);
              deletedIdsSet.add(str.toLowerCase());
            }
          }
        });
      }
    }

    // Auto-seed tombstones from all trash collections so trashed records can NEVER resurrect
    for (const tk of ALL_TRASH_STORAGE_KEYS) {
      try {
        const rawTrash = localStorage.getItem(tk);
        if (rawTrash) {
          const list = JSON.parse(rawTrash);
          if (Array.isArray(list)) {
            list.forEach((entry: any) => {
              const candidateIds = [
                entry?.id,
                entry?.data?.id,
                entry?.originalId,
                entry?._id
              ];
              for (const cid of candidateIds) {
                if (cid) {
                  const s = String(cid).trim();
                  if (s && !isInvalidShortNumericTombstone(s)) {
                    deletedIdsSet.add(s);
                    deletedIdsSet.add(s.toLowerCase());
                  }
                }
              }
            });
          }
        }
      } catch {}
    }
  }
} catch {}

function persistDeletedIds() {
  if (typeof window === 'undefined') return;
  try {
    const arr = Array.from(deletedIdsSet);
    localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(arr));
  } catch {}
}

// Track recently restored IDs to guard against stale Firestore/SSE snapshots re-tombstoning them
const RECENTLY_RESTORED_KEY = 'polycables_recently_restored_ids';
const recentlyRestoredMap = new Map<string, number>();

try {
  if (typeof window !== 'undefined') {
    const rawRestored = localStorage.getItem(RECENTLY_RESTORED_KEY);
    if (rawRestored) {
      const parsed = JSON.parse(rawRestored);
      if (parsed && typeof parsed === 'object') {
        const now = Date.now();
        for (const [k, ts] of Object.entries(parsed)) {
          if (typeof ts === 'number' && now - ts < RESTORE_IMMUNITY_MS) {
            recentlyRestoredMap.set(k, ts);
            deletedIdsSet.delete(k);
          }
        }
      }
    }
  }
} catch {}

function persistRecentlyRestoredIds() {
  if (typeof window === 'undefined') return;
  try {
    const obj: Record<string, number> = {};
    const now = Date.now();
    for (const [k, ts] of recentlyRestoredMap.entries()) {
      if (now - ts < RESTORE_IMMUNITY_MS) {
        obj[k] = ts;
      }
    }
    localStorage.setItem(RECENTLY_RESTORED_KEY, JSON.stringify(obj));
  } catch {}
}

export function isRecentlyRestoredId(id: string | number | undefined | null): boolean {
  if (!id) return false;
  const key = String(id).trim().toLowerCase();
  const ts = recentlyRestoredMap.get(key);
  if (!ts) return false;
  if (Date.now() - ts < RESTORE_IMMUNITY_MS) {
    return true;
  }
  recentlyRestoredMap.delete(key);
  return false;
}

let isDispatchingDeletedEvent = false;
let isDispatchingRestoredEvent = false;

export function getClientSyncId(): string | undefined {
  if (typeof window !== 'undefined' && (window as any).__polycablesClientSyncId) {
    return String((window as any).__polycablesClientSyncId);
  }
  return undefined;
}

function getActiveClientId(): string | undefined {
  return getClientSyncId();
}

/**
 * Record an entity ID as deleted (instantly notifies server & local caches)
 */
export function recordDeletedEntityId(id: string | number | undefined | null) {
  if (!id) return;
  const str = String(id).trim();
  if (!str || isInvalidShortNumericTombstone(str)) return;
  recentlyRestoredMap.delete(str.toLowerCase());
  deletedIdsSet.add(str);
  deletedIdsSet.add(str.toLowerCase());
  persistDeletedIds();

  // Instant notification to cloud server
  if (typeof fetch !== 'undefined' && typeof window !== 'undefined' && navigator.onLine) {
    try {
      fetch('/api/sync/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({ clientId: getActiveClientId(), ids: [str] })
      }).catch(() => {});
    } catch {}
  }
  if (typeof window !== 'undefined' && !isDispatchingDeletedEvent) {
    try {
      isDispatchingDeletedEvent = true;
      window.dispatchEvent(new CustomEvent('polycables_entity_deleted', { detail: { id: str } }));
    } finally {
      isDispatchingDeletedEvent = false;
    }
  }
}

/**
 * Record multiple entity IDs as deleted
 */
export function recordDeletedEntityIds(ids: (string | number | undefined | null)[]) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const validIds: string[] = [];
  ids.forEach((id) => {
    if (!id) return;
    const str = String(id).trim();
    if (!str || isInvalidShortNumericTombstone(str)) return;
    recentlyRestoredMap.delete(str.toLowerCase());
    deletedIdsSet.add(str);
    deletedIdsSet.add(str.toLowerCase());
    validIds.push(str);
  });
  persistDeletedIds();

  // Instant notification to cloud server
  if (validIds.length > 0 && typeof fetch !== 'undefined' && typeof window !== 'undefined' && navigator.onLine) {
    try {
      fetch('/api/sync/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({ clientId: getActiveClientId(), ids: validIds })
      }).catch(() => {});
    } catch {}
  }

  if (typeof window !== 'undefined' && validIds.length > 0 && !isDispatchingDeletedEvent) {
    try {
      isDispatchingDeletedEvent = true;
      window.dispatchEvent(new CustomEvent('polycables_entity_deleted', { detail: { ids: validIds } }));
    } finally {
      isDispatchingDeletedEvent = false;
    }
  }
}

/**
 * Un-tombstones entity IDs purely in local memory & localStorage without triggering
 * redundant network requests or re-entrant DOM events (used by restore & remote sync handlers).
 */
export function unrecordDeletedIdsLocally(ids: (string | number | undefined | null)[]): string[] {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const now = Date.now();
  const validIds: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!id) continue;
    const str = String(id).trim();
    if (!str) continue;
    const low = str.toLowerCase();
    recentlyRestoredMap.set(low, now);
    deletedIdsSet.delete(str);
    deletedIdsSet.delete(low);
    validIds.push(str);
  }
  if (validIds.length > 0) {
    persistDeletedIds();
    persistRecentlyRestoredIds();
    if (typeof window !== 'undefined') {
      const restoredLowerSet = new Set(validIds.map((v) => v.toLowerCase()));
      const legacyArrayKeys = [
        'polycables_deleted_entity_ids',
        'polycables_deleted_item_ids',
        'polycables_deleted_salespersons',
        'polycables_deleted_snapshot_ids'
      ];
      for (const lk of legacyArrayKeys) {
        try {
          const raw = localStorage.getItem(lk);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const filtered = parsed.filter((x) => !restoredLowerSet.has(String(x || '').trim().toLowerCase()));
            if (filtered.length !== parsed.length) {
              localStorage.setItem(lk, JSON.stringify(filtered));
            }
          }
        } catch {}
      }
    }
  }
  return validIds;
}

/**
 * Remove an entity ID from deleted tracker when restored (instantly notifies server)
 */
export function unrecordDeletedEntityId(
  id: string | number | undefined | null,
  options?: { notifyServer?: boolean; dispatchEvent?: boolean }
) {
  if (!id) return;
  const valid = unrecordDeletedIdsLocally([id]);
  if (valid.length === 0) return;
  const str = valid[0];

  if (options?.notifyServer !== false && typeof fetch !== 'undefined' && typeof window !== 'undefined' && navigator.onLine) {
    try {
      fetch('/api/sync/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({ clientId: getActiveClientId(), ids: [str] })
      }).catch(() => {});
    } catch {}
  }

  if (options?.dispatchEvent !== false && typeof window !== 'undefined' && !isDispatchingRestoredEvent) {
    try {
      isDispatchingRestoredEvent = true;
      window.dispatchEvent(new CustomEvent('polycables_entity_restored', { detail: { id: str } }));
    } finally {
      isDispatchingRestoredEvent = false;
    }
  }
}

/**
 * Remove multiple entity IDs from deleted tracker when restored
 */
export function unrecordDeletedEntityIds(
  ids: (string | number | undefined | null)[],
  options?: { notifyServer?: boolean; dispatchEvent?: boolean }
) {
  const validIds = unrecordDeletedIdsLocally(ids);
  if (validIds.length === 0) return;

  if (options?.notifyServer !== false && typeof fetch !== 'undefined' && typeof window !== 'undefined' && navigator.onLine) {
    try {
      fetch('/api/sync/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({ clientId: getActiveClientId(), ids: validIds })
      }).catch(() => {});
    } catch {}
  }

  if (options?.dispatchEvent !== false && typeof window !== 'undefined' && !isDispatchingRestoredEvent) {
    try {
      isDispatchingRestoredEvent = true;
      window.dispatchEvent(new CustomEvent('polycables_entity_restored', { detail: { ids: validIds } }));
    } finally {
      isDispatchingRestoredEvent = false;
    }
  }
}

/**
 * Cleanly remove entity IDs from universal & legacy trash localStorage collections (used during restore / permanent empty)
 */
export function removeIdsFromAllTrashStorages(ids: (string | number | undefined | null)[]) {
  if (typeof window === 'undefined' || !Array.isArray(ids) || ids.length === 0) return;
  const idSet = new Set(ids.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean));
  const trashKeys = [
    'polycables_trashed_bills',
    'polycables_trashed_draft_bills',
    'polycables_trashed_challans',
    'polycables_trashed_items',
    'polycables_trashed_parties',
    'polycables_trashed_collections',
    'polycables_trashed_users',
    'polycables_trashed_branches',
    'polycables_trashed_requisitions',
    'polycables_trashed_conveyances',
    'polycables_trashed_expenses',
    'polycables_trashed_deposits',
    'polycables_trashed_returns',
    'polycables_trashed_factory_imports',
    'polycables_universal_trash'
  ];
  for (const key of trashKeys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) continue;
      const filtered = list.filter((entry: any) => {
        const candidates = [entry?.id, entry?.data?.id, entry?.originalId, entry?._id];
        return !candidates.some((c) => c && idSet.has(String(c).trim().toLowerCase()));
      });
      if (filtered.length !== list.length) {
        localStorage.setItem(key, JSON.stringify(filtered));
      }
    } catch {}
  }
}

/**
 * Check if an entity ID has been deleted anywhere across devices or exists in Trash
 */
export function isGloballyDeletedId(id: string | number | undefined | null): boolean {
  if (!id) return false;
  const str = String(id).trim();
  if (!str || isInvalidShortNumericTombstone(str)) return false;
  if (isRecentlyRestoredId(str)) return false;

  const low = str.toLowerCase();
  if (deletedIdsSet.has(str) || deletedIdsSet.has(low)) {
    return true;
  }

  // Double-check active local trash for immediate safety
  if (typeof window !== 'undefined') {
    try {
      const trashedBillsRaw = localStorage.getItem('polycables_trashed_bills');
      if (trashedBillsRaw && (trashedBillsRaw.includes(`"${str}"`) || trashedBillsRaw.includes(`"${low}"`))) {
        deletedIdsSet.add(str);
        deletedIdsSet.add(low);
        return true;
      }
      const univTrashRaw = localStorage.getItem('polycables_universal_trash');
      if (univTrashRaw && (univTrashRaw.includes(`"${str}"`) || univTrashRaw.includes(`"${low}"`))) {
        deletedIdsSet.add(str);
        deletedIdsSet.add(low);
        return true;
      }
    } catch {}
  }

  return false;
}

/**
 * Get all recorded deleted IDs
 */
export function getGlobalDeletedIds(): string[] {
  return Array.from(deletedIdsSet).filter((s) => s && !isInvalidShortNumericTombstone(s));
}

/**
 * Merge remote deleted IDs into local tracker
 */
export function syncGlobalDeletedIds(incomingIds: (string | number)[]): void {
  if (!Array.isArray(incomingIds)) return;
  let changed = false;
  for (const id of incomingIds) {
    if (!id) continue;
    const str = String(id).trim();
    if (!str || isInvalidShortNumericTombstone(str)) continue;
    if (isRecentlyRestoredId(str)) continue; // Protected against stale snapshot resurrection
    if (!deletedIdsSet.has(str)) {
      deletedIdsSet.add(str);
      deletedIdsSet.add(str.toLowerCase());
      changed = true;
    }
  }
  if (changed) {
    persistDeletedIds();
  }
}

/**
 * Authoritative synchronization of remote deleted IDs.
 * Performs a UNION merge so locally deleted records are never erased by an empty remote state.
 */
export function replaceGlobalDeletedIds(authoritativeIds: (string | number)[]): void {
  if (!Array.isArray(authoritativeIds)) return;
  let changed = false;
  for (const id of authoritativeIds) {
    if (!id) continue;
    const str = String(id).trim();
    if (!str || isInvalidShortNumericTombstone(str)) continue;
    if (isRecentlyRestoredId(str)) continue;
    if (!deletedIdsSet.has(str)) {
      deletedIdsSet.add(str);
      deletedIdsSet.add(str.toLowerCase());
      changed = true;
    }
  }
  if (changed) {
    persistDeletedIds();
  }
}

/**
 * Clear all recorded deleted entity tombstones (used during complete backup restore)
 */
export function resetGlobalDeletedIds(): void {
  deletedIdsSet.clear();
  recentlyRestoredMap.clear();
  persistDeletedIds();
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(RECENTLY_RESTORED_KEY);
    }
  } catch {}
}

/**
 * Filter an array of entities, removing any that have been marked deleted
 */
export function filterOutDeletedEntities<T>(
  entities: T[],
  idExtractor?: (item: T) => (string | undefined | null)[]
): T[] {
  if (!Array.isArray(entities)) return [];
  return entities.filter((item: any) => {
    if (!item) return false;
    if (idExtractor) {
      const candidates = idExtractor(item);
      for (const c of candidates) {
        if (c && isGloballyDeletedId(c)) return false;
      }
    }
    // Only check unique primary IDs, NEVER generic billNo, mrNo, or challanNo
    if (item.id && isGloballyDeletedId(item.id)) return false;
    if (item._id && isGloballyDeletedId(item._id)) return false;
    return true;
  });
}
