import { Item, PriceHistoryEntry, PriceListSnapshot } from '../types';
import { formatDateDDMMYY, getTodayDDMMYY, parseDateToISO } from './dateUtils';
import { isGloballyDeletedId } from './deletedTracker';
import { categorizeCableItem } from './categoryHelper';
import { syncSpecialItemRatesWithBaseItems } from './stockHelper';

export interface ActivePriceCircularInfo {
  effectiveDate: string;
  displayDate: string;
  circularTitle: string;
  snapshotId?: string;
  itemCount?: number;
}

/**
 * Deterministic item ID generator so importing or syncing the same item across
 * multiple devices produces identical IDs instead of random Date.now() IDs.
 */
export function buildDeterministicItemId(code?: string, name?: string, category?: string): string {
  const c = (code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const n = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const cat = (category || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const base = `${c}::${n}::${cat}`;
  let hash = 2166136261;
  for (let i = 0; i < base.length; i++) {
    hash ^= base.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(36);
  const slug = (c || n).slice(0, 18) || 'item';
  return `pc-${slug}-${hex}`;
}

const parseSnapTs = (s: any): number => {
  if (!s || typeof s !== 'object') return 0;
  const raw = s.activatedAt || s.updatedAt || s.createdAt;
  if (!raw) return 0;
  const ms = Date.parse(String(raw));
  return isNaN(ms) ? 0 : ms;
};

/**
 * Generates an ISO timestamp strictly newer than both Date.now() and any existing
 * snapshot timestamp so explicit circular switches always win across clock skew.
 */
export function getNextMonotonicSnapshotIso(snapshots?: PriceListSnapshot[]): string {
  const maxExisting = (Array.isArray(snapshots) ? snapshots : []).reduce(
    (max, s) => Math.max(max, parseSnapTs(s)),
    0
  );
  return new Date(Math.max(Date.now(), maxExisting + 1)).toISOString();
}

import { safeSetStorageItem, idbSaveFailoverData } from './indexedDbStorage';

let memoryCachedSnapshots: PriceListSnapshot[] | null = null;

/**
 * Guarantees every device sees the exact same snapshot array with:
 * - No deleted/tombstoned IDs
 * - Deduplicated IDs (newest timestamp wins)
 * - Strictly ONE snapshot marked isActive: true (winning by latest activatedAt/updatedAt/createdAt)
 */
export function normalizePriceSnapshots(snapshots: PriceListSnapshot[]): PriceListSnapshot[] {
  if (!Array.isArray(snapshots)) return [];
  let deletedIds: string[] = [];
  try {
    deletedIds = JSON.parse(localStorage.getItem('polycables_deleted_snapshot_ids') || '[]');
  } catch {}

  const map = new Map<string, PriceListSnapshot>();
  for (const rawSnap of snapshots) {
    if (!rawSnap || !rawSnap.id) continue;
    if (deletedIds.includes(rawSnap.id) || isGloballyDeletedId(rawSnap.id)) continue;
    const rawItems = Array.isArray(rawSnap.items)
      ? rawSnap.items
      : Array.isArray((rawSnap as any).snapshotItems)
        ? (rawSnap as any).snapshotItems
        : Array.isArray((rawSnap as any).list)
          ? (rawSnap as any).list
          : Array.isArray((rawSnap as any).circularItems)
            ? (rawSnap as any).circularItems
            : [];
    const s: PriceListSnapshot = {
      ...rawSnap,
      items: rawItems,
      itemCount: rawItems.length > 0 ? rawItems.length : (Number(rawSnap.itemCount) || 0)
    };
    const prev = map.get(s.id);
    if (!prev || parseSnapTs(s) >= parseSnapTs(prev)) {
      map.set(s.id, s);
    }
  }

  const list = Array.from(map.values());
  if (list.length === 0) return [];

  // Determine the single winning active snapshot
  const activeCandidates = list.filter((s) => Boolean(s.isActive));
  let winnerId = '';
  if (activeCandidates.length > 0) {
    activeCandidates.sort((a, b) => parseSnapTs(b) - parseSnapTs(a));
    winnerId = activeCandidates[0].id;
  } else {
    const sortedAll = [...list].sort((a, b) => parseSnapTs(b) - parseSnapTs(a));
    winnerId = sortedAll[0].id;
  }

  return list.map((s) => ({
    ...s,
    isActive: s.id === winnerId
  }));
}

/**
 * Strips heavy/redundant properties (priceHistory, branchStock maps) before storing
 * snapshot item lists in localStorage, server state, or Firestore.
 */
export function toCompactSnapshotItems(items: Array<any>): Array<{
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  rate: number;
  sizeSpec?: string;
  serial?: number | string;
}> {
  return (Array.isArray(items) ? items : [])
    .filter((i) => i && (i.name || i.itemName || i.itemDescription || i.code))
    .map((i) => {
      const resolvedName = String(i.name || i.itemName || i.itemDescription || i.code || '').trim();
      return {
        id: String(i.id || buildDeterministicItemId(i.code, resolvedName, i.category)),
        code: String(i.code || ''),
        name: resolvedName,
        category: String(i.category || ''),
        unit: String(i.unit || 'Coils'),
        rate: Number(i.rate) || 0,
        ...(i.sizeSpec ? { sizeSpec: String(i.sizeSpec) } : {}),
        ...(i.serial !== undefined && i.serial !== null && i.serial !== ''
          ? { serial: i.serial }
          : i.serialNo !== undefined && i.serialNo !== null && i.serialNo !== ''
            ? { serial: i.serialNo }
            : {})
      };
    });
}

/**
 * Persists normalized price snapshots safely to in-memory cache, localStorage (with quota failover),
 * IndexedDB failover store, and dispatches cross-component update events.
 */
export function savePriceListSnapshots(
  snapshots: PriceListSnapshot[],
  options?: { effectiveDate?: string; dispatch?: boolean; circularTitle?: string }
): PriceListSnapshot[] {
  const normalized = normalizePriceSnapshots(snapshots);
  memoryCachedSnapshots = normalized;
  const active = normalized.find((s) => s.isActive) || normalized[0];
  const effDate = options?.effectiveDate || active?.effectiveDate;

  try {
    if (normalized.length === 0) {
      localStorage.setItem('polycables_price_snapshots_cleared', 'true');
    } else {
      localStorage.removeItem('polycables_price_snapshots_cleared');
    }
    const json = JSON.stringify(normalized);
    const savedPrimary = safeSetStorageItem('polycables_price_snapshots', json, normalized);
    if (savedPrimary) {
      try {
        localStorage.setItem('polycables_price_history_lists', json);
      } catch {}
    } else {
      try {
        localStorage.removeItem('polycables_price_history_lists');
      } catch {}
    }
    idbSaveFailoverData('polycables_price_snapshots', normalized).catch(() => {});
    if (effDate) {
      try {
        localStorage.setItem('polycables_active_effective_date', effDate);
      } catch {}
    }
  } catch {}

  if (options?.dispatch !== false && typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('polycables_snapshots_updated', { detail: { snapshots: normalized } }));
      window.dispatchEvent(new CustomEvent('polycables_price_snapshots_updated', { detail: { snapshots: normalized } }));
      if (effDate) {
        window.dispatchEvent(
          new CustomEvent('polycables_active_price_circular_changed', {
            detail: { effectiveDate: effDate, circularTitle: options?.circularTitle || active?.title || '' }
          })
        );
      }
    } catch {}
  }

  return normalized;
}

/**
 * Reads all price list snapshots from localStorage/memory or seeds the default initial list.
 */
export function getPriceListSnapshots(): PriceListSnapshot[] {
  let deletedIds: string[] = [];
  try {
    deletedIds = JSON.parse(localStorage.getItem('polycables_deleted_snapshot_ids') || '[]');
  } catch {}
  void deletedIds;

  try {
    const isIdbFailover = localStorage.getItem('polycables_price_snapshots__idb_only') === '1';
    if (isIdbFailover && memoryCachedSnapshots && Array.isArray(memoryCachedSnapshots) && memoryCachedSnapshots.length > 0) {
      return normalizePriceSnapshots(memoryCachedSnapshots);
    }

    const saved = localStorage.getItem('polycables_price_snapshots');
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        const normalized = normalizePriceSnapshots(parsed);
        if (normalized.length > 0 || !memoryCachedSnapshots || memoryCachedSnapshots.length === 0) {
          memoryCachedSnapshots = normalized;
          return normalized;
        }
      }
    }
    if (!isIdbFailover) {
      const legacySaved = localStorage.getItem('polycables_price_history_lists');
      if (legacySaved !== null) {
        const parsedLegacy = JSON.parse(legacySaved);
        if (Array.isArray(parsedLegacy)) {
          const normalizedLegacy = normalizePriceSnapshots(parsedLegacy);
          memoryCachedSnapshots = normalizedLegacy;
          return normalizedLegacy;
        }
      }
    }
    if (memoryCachedSnapshots && Array.isArray(memoryCachedSnapshots) && memoryCachedSnapshots.length > 0) {
      return normalizePriceSnapshots(memoryCachedSnapshots);
    }
    if (localStorage.getItem('polycables_price_snapshots_cleared') === 'true') {
      return [];
    }
  } catch (e) {
    console.error('Error reading polycables_price_snapshots:', e);
    if (memoryCachedSnapshots && memoryCachedSnapshots.length > 0) {
      return normalizePriceSnapshots(memoryCachedSnapshots);
    }
  }

  return [];
}

/**
 * Keeps the active price snapshot synchronized whenever catalog items are added/edited/deleted/imported
 * in Master Item Directory so Price Update History and Master Item Directory never drift across devices.
 */
export function syncActiveSnapshotWithCatalogItems(
  catalogItems: Array<any>,
  options?: { includeItemIds?: string[]; forceReplaceAll?: boolean }
): PriceListSnapshot[] | null {
  try {
    const snapshots = getPriceListSnapshots();
    const standardCatalog = (Array.isArray(catalogItems) ? catalogItems : []).filter(
      (i) => i && !i.isSpecialItem
    );
    const includeSet = new Set(
      (options?.includeItemIds || []).map((id) => String(id).trim()).filter(Boolean)
    );

    if (!Array.isArray(snapshots) || snapshots.length === 0) {
      if (standardCatalog.length === 0 || (!options?.forceReplaceAll && includeSet.size === 0)) {
        return null;
      }
      const seedSource = options?.forceReplaceAll
        ? standardCatalog
        : standardCatalog.filter((it) => {
            const idStr = String(it.id || '').trim();
            return idStr && includeSet.has(idStr);
          });
      if (seedSource.length === 0) return null;

      const nowIso = new Date().toISOString();
      let effDate = '';
      try {
        effDate = localStorage.getItem('polycables_active_effective_date') || '';
      } catch {}
      if (!effDate) effDate = getTodayDDMMYY();

      const compact = toCompactSnapshotItems(seedSource);
      const initialSnap: PriceListSnapshot = {
        id: `snap-${Date.now()}`,
        title: 'Master Price Circular (Current Active)',
        effectiveDate: effDate,
        createdAt: nowIso,
        updatedAt: nowIso,
        activatedAt: nowIso,
        isActive: true,
        itemCount: compact.length,
        items: compact
      };
      return savePriceListSnapshots([initialSnap], { effectiveDate: effDate });
    }

    const catalogById = new Map<string, any>();
    const catalogByCode = new Map<string, any>();
    standardCatalog.forEach((it) => {
      if (it.id) catalogById.set(String(it.id).trim(), it);
      if (it.code) catalogByCode.set(String(it.code).trim().toLowerCase(), it);
    });

    const nowIso = new Date().toISOString();
    let activeIdx = snapshots.findIndex((s) => s.isActive);
    if (activeIdx < 0) activeIdx = 0;

    const updated = snapshots.map((snap, idx) => {
      if (idx !== activeIdx) return { ...snap, isActive: false };

      let nextSnapSource: any[] = [];
      if (options?.forceReplaceAll) {
        nextSnapSource = standardCatalog;
      } else if (Array.isArray(snap.items) && snap.items.length > 0) {
        const seenSnapIds = new Set<string>();
        nextSnapSource = snap.items
          .map((si) => {
            if (!si) return null;
            const sId = String(si.id || '').trim();
            const sCode = String(si.code || '').trim().toLowerCase();
            const matched =
              (sId ? catalogById.get(sId) : undefined) ||
              (sCode ? catalogByCode.get(sCode) : undefined);
            if (!matched) {
              // Item deleted from catalog -> remove from snapshot
              return null;
            }
            if (matched.id) seenSnapIds.add(String(matched.id).trim());
            return {
              ...matched,
              serial: matched.serial ?? matched.serialNo ?? si.serial
            };
          })
          .filter(Boolean);

        if (includeSet.size > 0) {
          standardCatalog.forEach((it) => {
            const idStr = String(it.id || '').trim();
            if (idStr && includeSet.has(idStr) && !seenSnapIds.has(idStr)) {
              seenSnapIds.add(idStr);
              nextSnapSource.push(it);
            }
          });
        }
      } else if (includeSet.size > 0) {
        nextSnapSource = standardCatalog.filter((it) => {
          const idStr = String(it.id || '').trim();
          return idStr && includeSet.has(idStr);
        });
      }

      const compact = toCompactSnapshotItems(nextSnapSource);
      return {
        ...snap,
        isActive: true,
        items: compact,
        itemCount: compact.length,
        updatedAt: nowIso
      };
    });

    return savePriceListSnapshots(updated);
  } catch {
    return null;
  }
}

/**
 * Returns the active price circular details based on Price Update History List ACTIVE item.
 * Default: Master Price Circular (Current Active) with effectiveDate 10.08.26.
 */
export function getActivePriceCircularInfo(): ActivePriceCircularInfo {
  try {
    const snapshots = getPriceListSnapshots();
    const activeSnap = snapshots.find((s) => s.isActive) || snapshots[0];
    const directDate = localStorage.getItem('polycables_active_effective_date');

    const effectiveDate = activeSnap?.effectiveDate || directDate || '10.08.26';
    const circularTitle = activeSnap?.title || 'Master Price Circular (Current Active)';
    const displayDate = formatDateDDMMYY(effectiveDate);

    return {
      effectiveDate,
      displayDate,
      circularTitle,
      snapshotId: activeSnap?.id,
      itemCount: activeSnap?.itemCount
    };
  } catch (e) {
    console.error('Error getting active price circular info:', e);
  }

  return {
    effectiveDate: '10.08.26',
    displayDate: '10.08.26',
    circularTitle: 'Master Price Circular (Current Active)'
  };
}

/**
 * Resolves the accurate item rate for a bill based on the bill date and price history.
 * If the bill has a date, finds the latest price entry effective on or before that date.
 * If bill date is omitted or current/future, returns the item's current active rate.
 */
export function getItemRateForBillDate(item: { rate: number; effectiveDate?: string; priceHistory?: Array<{ effectiveDate: string; rate: number }> }, billDateStr?: string): number {
  if (!item) return 0;
  const currentRate = typeof item.rate === 'number' ? item.rate : 0;
  if (!billDateStr || !Array.isArray(item.priceHistory) || item.priceHistory.length === 0) {
    return currentRate;
  }

  const billIso = parseDateToISO(billDateStr);
  if (!billIso) return currentRate;

  // Filter and sort price history entries by effective date descending
  const sorted = [...item.priceHistory]
    .filter((h) => h && typeof h.rate === 'number' && h.rate > 0 && h.effectiveDate)
    .sort((a, b) => {
      const aIso = parseDateToISO(a.effectiveDate) || a.effectiveDate;
      const bIso = parseDateToISO(b.effectiveDate) || b.effectiveDate;
      return bIso.localeCompare(aIso);
    });

  if (sorted.length === 0) return currentRate;

  // Find latest entry effective on or before the bill date
  const matched = sorted.find((h) => {
    const hIso = parseDateToISO(h.effectiveDate) || h.effectiveDate;
    return hIso <= billIso;
  });

  if (matched) {
    return matched.rate;
  }

  // If the bill date is earlier than all known price changes, use the earliest recorded rate
  const earliest = sorted[sorted.length - 1];
  return earliest.rate || currentRate;
}

/**
 * Reconciles Master Item Directory `items` STRICTLY with the ACTIVE Price Update History snapshot.
 * - If Price Update History has one list with items or an Active list with items, Master Item Directory
 *   contains ONLY those items (with their prices from that list).
 * - If no active list has items, Master Item Directory stays empty (`[]`) without falling back to extra/unlisted items.
 */
export function reconcileCatalogItemsWithActiveSnapshot(
  currentItems: Item[],
  snapshotsInput?: PriceListSnapshot[],
  options?: {
    activateExplicitly?: boolean;
    targetSnapshot?: PriceListSnapshot;
  }
): {
  items: Item[];
  changed: boolean;
  addedCount: number;
  reactivatedCount: number;
  updatedCount: number;
  restoredIds: string[];
} {
  const baseList = Array.isArray(currentItems) ? currentItems : [];
  const snaps = Array.isArray(snapshotsInput) ? normalizePriceSnapshots(snapshotsInput) : getPriceListSnapshots();
  const activeSnap =
    options?.targetSnapshot ||
    snaps.find((s) => s && s.isActive) ||
    (snaps.length === 1 ? snaps[0] : undefined);

  const activeSnapItems = Array.isArray(activeSnap?.items)
    ? activeSnap.items
    : Array.isArray((activeSnap as any)?.snapshotItems)
      ? (activeSnap as any).snapshotItems
      : Array.isArray((activeSnap as any)?.list)
        ? (activeSnap as any).list
        : [];

  const standaloneSpecials = baseList.filter(
    (sp) => sp && sp.isSpecialItem && !sp.baseItemId && !sp.baseItemCode
  );
  const activateExplicitly = Boolean(options?.activateExplicitly);

  if (typeof localStorage !== 'undefined' && !activateExplicitly) {
    try {
      if (localStorage.getItem('polycables_items_cleared') === 'true') {
        const isSameCleared =
          standaloneSpecials.length === baseList.length &&
          standaloneSpecials.every((s, idx) => s.id === baseList[idx]?.id);
        return {
          items: standaloneSpecials,
          changed: !isSameCleared,
          addedCount: 0,
          reactivatedCount: 0,
          updatedCount: 0,
          restoredIds: []
        };
      }
    } catch {}
  }

  if (!activeSnap || activeSnapItems.length === 0) {
    const isSame =
      standaloneSpecials.length === baseList.length &&
      standaloneSpecials.every((s, idx) => s.id === baseList[idx]?.id);
    return {
      items: standaloneSpecials,
      changed: !isSame,
      addedCount: 0,
      reactivatedCount: 0,
      updatedCount: 0,
      restoredIds: []
    };
  }

  if (typeof localStorage !== 'undefined' && activateExplicitly) {
    try {
      if (localStorage.getItem('polycables_items_cleared') === 'true') {
        localStorage.removeItem('polycables_items_cleared');
      }
      if (localStorage.getItem('polycables_price_snapshots_cleared') === 'true') {
        localStorage.removeItem('polycables_price_snapshots_cleared');
      }
    } catch {}
  }

  let trashedIdSet = new Set<string>();
  try {
    const rawTrash = localStorage.getItem('polycables_trashed_items');
    if (rawTrash) {
      const parsedTrash = JSON.parse(rawTrash);
      if (Array.isArray(parsedTrash)) {
        parsedTrash.forEach((t: any) => {
          if (t?.id) trashedIdSet.add(String(t.id));
          if (t?.data?.id) trashedIdSet.add(String(t.data.id));
        });
      }
    }
  } catch {}

  const effDate = String(activeSnap.effectiveDate || '').trim();
  const snapTitle = String(activeSnap.title || effDate || 'Active Price Circular').trim();
  const nowIso = new Date().toISOString();

  const existingStandard = baseList.filter((it) => it && !it.isSpecialItem);
  const existingSpecial = baseList.filter((it) => it && it.isSpecialItem);

  const indexById = new Map<string, number>();
  const indicesByCode = new Map<string, number[]>();
  const indexByNameAndCat = new Map<string, number>();
  const indicesByName = new Map<string, number[]>();

  existingStandard.forEach((item, idx) => {
    if (item.id) indexById.set(String(item.id).trim(), idx);
    const codeKey = String(item.code || '').trim().toLowerCase();
    if (codeKey) {
      const arr = indicesByCode.get(codeKey) || [];
      arr.push(idx);
      indicesByCode.set(codeKey, arr);
    }
    const nameKey = String(item.name || '').trim().toLowerCase();
    const catKey = String(item.category || '').trim().toLowerCase();
    if (nameKey) {
      indexByNameAndCat.set(`${nameKey}::${catKey}`, idx);
      const arr = indicesByName.get(nameKey) || [];
      arr.push(idx);
      indicesByName.set(nameKey, arr);
    }
  });

  const matchedBaseIndices = new Set<number>();
  const usedIds = new Set<string>();
  const restoredIds: string[] = [];
  const strictStandardItems: Item[] = [];
  let addedCount = 0;
  let reactivatedCount = 0;
  let updatedCount = 0;

  for (let sIdx = 0; sIdx < activeSnapItems.length; sIdx++) {
    const snapIt = activeSnapItems[sIdx] as any;
    if (!snapIt) continue;
    const snapName = String(snapIt.name || snapIt.itemName || snapIt.itemDescription || '').trim();
    const snapCode = String(snapIt.code || '').trim();
    if (!snapName && !snapCode) continue;

    const snapId = String(snapIt.id || '').trim();
    const snapCodeLow = snapCode.toLowerCase();
    const snapNameLow = snapName.toLowerCase();
    const snapCatRaw = String(snapIt.category || '').trim();
    const snapCatLow = snapCatRaw.toLowerCase();
    const snapRate = Number(snapIt.rate) || 0;

    let matchIdx: number | undefined;
    if (snapId && indexById.has(snapId)) {
      const idx = indexById.get(snapId)!;
      if (!matchedBaseIndices.has(idx)) matchIdx = idx;
    }
    if (matchIdx === undefined && snapNameLow && snapCatLow) {
      const ncIdx = indexByNameAndCat.get(`${snapNameLow}::${snapCatLow}`);
      if (ncIdx !== undefined && !matchedBaseIndices.has(ncIdx)) {
        matchIdx = ncIdx;
      }
    }
    if (matchIdx === undefined && snapCodeLow) {
      const candidates = indicesByCode.get(snapCodeLow) || [];
      const exactCatCand = snapCatLow
        ? candidates.find((cIdx) => !matchedBaseIndices.has(cIdx) && String(existingStandard[cIdx]?.category || '').trim().toLowerCase() === snapCatLow)
        : undefined;
      const exactNameCand = snapNameLow
        ? candidates.find((cIdx) => !matchedBaseIndices.has(cIdx) && String(existingStandard[cIdx]?.name || '').trim().toLowerCase() === snapNameLow)
        : undefined;
      matchIdx = exactCatCand ?? exactNameCand ?? candidates.find((cIdx) => !matchedBaseIndices.has(cIdx));
    }
    if (matchIdx === undefined && snapNameLow) {
      const candidates = indicesByName.get(snapNameLow) || [];
      matchIdx = candidates.find((cIdx) => !matchedBaseIndices.has(cIdx));
    }

    if (matchIdx !== undefined) {
      matchedBaseIndices.add(matchIdx);
      const existing = existingStandard[matchIdx];
      if (
        !activateExplicitly &&
        ((existing.id && (isGloballyDeletedId(existing.id) || trashedIdSet.has(existing.id))) ||
          (snapId && (isGloballyDeletedId(snapId) || trashedIdSet.has(snapId))))
      ) {
        continue;
      }
      const updated: Item = { ...existing };

      if (updated.isActive === false) {
        if (!activateExplicitly && ((updated.id && isGloballyDeletedId(updated.id)) || updated.deletedAt)) {
          continue;
        }
        updated.isActive = true;
        if (updated.deletedAt) delete updated.deletedAt;
        if (updated.id && activateExplicitly) restoredIds.push(updated.id);
        reactivatedCount++;
      }

      // Always reflect price from the active Price Update History list
      if (snapIt.rate !== undefined && Number(updated.rate) !== snapRate) {
        updated.rate = snapRate;
        updated.updatedAt = nowIso;
        updatedCount++;
      }
      if (effDate && updated.effectiveDate !== effDate) {
        updated.effectiveDate = effDate;
      }
      if (activateExplicitly && effDate) {
        const currentHist = Array.isArray(updated.priceHistory) ? updated.priceHistory : [];
        const hasEffHist = currentHist.some((h) => h.effectiveDate === effDate && Number(h.rate) === snapRate);
        if (!hasEffHist) {
          const historyEntry: PriceHistoryEntry = {
            effectiveDate: effDate,
            rate: snapRate,
            updatedAt: nowIso,
            notes: `Activated circular (${snapTitle})`
          };
          updated.priceHistory = [
            historyEntry,
            ...currentHist.filter((h) => h.effectiveDate !== effDate)
          ];
        }
      }
      if (snapIt.serial !== undefined && snapIt.serial !== null && snapIt.serial !== '') {
        updated.serial = snapIt.serial;
      }
      if ((!updated.category || updated.category.trim().toLowerCase() === 'general') && (snapCatRaw || snapName)) {
        const resolvedCat = snapCatRaw || categorizeCableItem(snapName, snapIt.sizeSpec);
        if (resolvedCat) updated.category = resolvedCat;
      }

      if (updated.id) usedIds.add(updated.id);
      strictStandardItems.push(updated);
    } else {
      const candidateId = snapId || buildDeterministicItemId(snapCode, snapName, snapCatRaw);
      if (
        !activateExplicitly &&
        (trashedIdSet.has(candidateId) ||
          isGloballyDeletedId(candidateId) ||
          (snapId && (trashedIdSet.has(snapId) || isGloballyDeletedId(snapId))))
      ) {
        continue;
      }

      let uniqueId = candidateId;
      if (usedIds.has(uniqueId)) {
        uniqueId = `${candidateId}-${sIdx + 1}`;
      }
      usedIds.add(uniqueId);

      const resolvedCategory =
        snapCatRaw && snapCatLow !== 'general'
          ? snapCatRaw
          : categorizeCableItem(snapName, snapIt.sizeSpec) || 'Single Core Wires';
      const newItem: Item = {
        id: uniqueId,
        code: snapCode || `PC-${100 + strictStandardItems.length + 1}`,
        name: snapName || snapCode,
        category: resolvedCategory,
        unit: String(snapIt.unit || 'Coils'),
        rate: snapRate,
        openingStock: 0,
        isActive: true,
        ...(snapIt.sizeSpec ? { sizeSpec: String(snapIt.sizeSpec) } : {}),
        ...(snapIt.serial !== undefined && snapIt.serial !== null && snapIt.serial !== '' ? { serial: snapIt.serial } : {}),
        ...(effDate ? { effectiveDate: effDate } : {}),
        updatedAt: nowIso,
        priceHistory: effDate
          ? [
              {
                effectiveDate: effDate,
                rate: snapRate,
                updatedAt: nowIso,
                notes: `Synced from active circular (${snapTitle})`
              }
            ]
          : []
      };
      restoredIds.push(uniqueId);
      addedCount++;
      strictStandardItems.push(newItem);
    }
  }

  // Preserve special items linked to the active list OR standalone imported/created special items
  const activeBaseIdSet = new Set(strictStandardItems.map((i) => i.id));
  const activeBaseCodeSet = new Set(strictStandardItems.map((i) => String(i.code || '').trim().toLowerCase()).filter(Boolean));
  const linkedSpecials = existingSpecial.filter((sp) => {
    if (sp.baseItemId && activeBaseIdSet.has(sp.baseItemId)) return true;
    if (sp.baseItemCode && activeBaseCodeSet.has(String(sp.baseItemCode).trim().toLowerCase())) return true;
    if (!sp.baseItemId && !sp.baseItemCode) return true;
    return false;
  });

  const combinedStrict = [...strictStandardItems, ...linkedSpecials];
  const finalItems = syncSpecialItemRatesWithBaseItems(combinedStrict);

  const isSameList =
    finalItems.length === baseList.length &&
    finalItems.every((fi, i) => {
      const bi = baseList[i];
      return (
        bi &&
        fi.id === bi.id &&
        fi.name === bi.name &&
        fi.code === bi.code &&
        Number(fi.rate) === Number(bi.rate) &&
        fi.isActive === bi.isActive &&
        (fi.effectiveDate || '') === (bi.effectiveDate || '') &&
        (fi.category || '') === (bi.category || '') &&
        (fi.unit || '') === (bi.unit || '')
      );
    });

  if (isSameList) {
    return {
      items: baseList,
      changed: false,
      addedCount: 0,
      reactivatedCount: 0,
      updatedCount: 0,
      restoredIds: []
    };
  }

  return {
    items: finalItems,
    changed: true,
    addedCount,
    reactivatedCount,
    updatedCount,
    restoredIds
  };
}

/**
 * Strips permanently/trashed deleted item IDs from stored Price List Snapshots
 * so deleted catalog items cannot reappear from cached snapshot lists.
 */
export function pruneDeletedIdsFromSnapshots(
  deletedIds: (string | number | undefined | null)[]
): PriceListSnapshot[] | null {
  if (!Array.isArray(deletedIds) || deletedIds.length === 0) return null;
  const delSet = new Set(
    deletedIds.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
  );
  if (delSet.size === 0) return null;

  try {
    const currentSnaps = getPriceListSnapshots();
    if (!Array.isArray(currentSnaps) || currentSnaps.length === 0) return null;

    let anyModified = false;
    const nextSnaps = currentSnaps.map((snap) => {
      if (!snap || !Array.isArray(snap.items)) return snap;
      const filteredItems = snap.items.filter((it: any) => {
        if (!it) return false;
        const cId = String(it.id || '').trim().toLowerCase();
        const detId = buildDeterministicItemId(it.code || '', it.name || '', it.category || '').toLowerCase();
        if (cId && delSet.has(cId)) return false;
        if (detId && delSet.has(detId)) return false;
        return true;
      });
      if (filteredItems.length !== snap.items.length) {
        anyModified = true;
        return {
          ...snap,
          items: filteredItems,
          itemCount: filteredItems.length,
          updatedAt: new Date().toISOString()
        };
      }
      return snap;
    });

    if (anyModified) {
      savePriceListSnapshots(nextSnaps);
      return nextSnaps;
    }
  } catch {}
  return null;
}
