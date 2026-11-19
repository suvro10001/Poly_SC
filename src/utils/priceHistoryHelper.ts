import { Item, PriceListSnapshot } from '../types';
import { getNextMonotonicSnapshotIso, normalizePriceSnapshots, reconcileCatalogItemsWithActiveSnapshot, savePriceListSnapshots } from './priceCircularHelper';

export const PRICE_HISTORY_STORAGE_KEY = 'polycables_price_history_lists';

export function getPriceListHistory(): PriceListSnapshot[] {
  try {
    const saved = localStorage.getItem(PRICE_HISTORY_STORAGE_KEY) || localStorage.getItem('polycables_price_snapshots');
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return normalizePriceSnapshots(parsed);
      }
    }
  } catch (e) {
    console.error('Failed to load price history', e);
  }

  return [];
}

export function savePriceListHistory(history: PriceListSnapshot[]): void {
  try {
    savePriceListSnapshots(history, { dispatch: false });
  } catch (e) {
    console.error('Failed to save price history', e);
  }
}

export function addPriceListSnapshot(
  effectiveDate: string,
  items: Item[],
  notes: string = ''
): PriceListSnapshot[] {
  const currentHistory = getPriceListHistory();
  const nowIso = getNextMonotonicSnapshotIso(currentHistory);
  const snapshot: PriceListSnapshot = {
    id: `price-list-${Date.now()}-${effectiveDate.replace(/[^a-zA-Z0-9]/g, '_')}`,
    effectiveDate: effectiveDate,
    createdAt: nowIso,
    updatedAt: nowIso,
    activatedAt: nowIso,
    itemCount: items.length,
    items: items.map((it) => ({
      id: it.id,
      code: it.code,
      name: it.name,
      category: it.category || 'General',
      unit: it.unit || 'Coils',
      rate: it.rate
    })),
    isActive: true,
    notes: notes || `Bulk Price Update effective on ${effectiveDate}`
  };

  // Deactivate others and set this snapshot as active
  return savePriceListSnapshots([
    snapshot,
    ...currentHistory.map((h) => ({ ...h, isActive: false }))
  ], { effectiveDate });
}

export function switchActivePriceList(
  snapshotId: string,
  currentItems: Item[]
): { updatedItems: Item[]; updatedHistory: PriceListSnapshot[] } {
  const currentHistory = getPriceListHistory();
  const target = currentHistory.find((h) => h.id === snapshotId);
  if (!target) {
    return { updatedItems: currentItems, updatedHistory: currentHistory };
  }

  const nowIso = getNextMonotonicSnapshotIso(currentHistory);

  // Mark target as active
  const updatedHistory = savePriceListSnapshots(
    currentHistory.map((h) => ({
      ...h,
      isActive: h.id === snapshotId,
      ...(h.id === snapshotId ? { activatedAt: nowIso, updatedAt: nowIso } : {})
    })),
    { effectiveDate: target.effectiveDate, circularTitle: target.title }
  );

  const activeTarget = updatedHistory.find((h) => h.id === snapshotId) || target;
  const rec = reconcileCatalogItemsWithActiveSnapshot(currentItems, updatedHistory, {
    activateExplicitly: true,
    targetSnapshot: activeTarget
  });

  return { updatedItems: rec.items, updatedHistory };
}
