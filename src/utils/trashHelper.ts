// Universal Trash Helper for PolyCables ERP
// Ensures every delete from any page or module is safely stored in Trash

export interface TrashedItemRecord<T = any> {
  id: string;
  data: T;
  trashedAt: string;
  type: string;
  title: string;
  subtitle?: string;
  amount?: number;
}

import { recordDeletedEntityId, recordDeletedEntityIds } from './deletedTracker';

export function moveToTrash<T extends { id?: string; code?: string; billNo?: string; mrNo?: string; challanNo?: string }>(
  storageKey: string,
  item: T,
  categoryTitle: string
) {
  if (!item) return;
  try {
    const raw = localStorage.getItem(storageKey);
    const list: any[] = raw ? JSON.parse(raw) : [];
    const id = item.id || `trashed-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nowIso = new Date().toISOString();
    const record = {
      ...item,
      id,
      trashedAt: nowIso,
      trashCategory: categoryTitle
    };
    
    // Prepend to trash list, preventing duplicates
    const nextList = [record, ...list.filter((x: any) => x.id !== id)];
    localStorage.setItem(storageKey, JSON.stringify(nextList));

    // Also update universal all-trash log
    const universalRaw = localStorage.getItem('polycables_universal_trash');
    const universalList: any[] = universalRaw ? JSON.parse(universalRaw) : [];
    const universalEntry = {
      id: `univ-${id}`,
      originalId: id,
      storageKey,
      categoryTitle,
      data: item,
      trashedAt: nowIso
    };
    const nextUniversal = [universalEntry, ...universalList.filter((x: any) => x.originalId !== id)].slice(0, 1000);
    localStorage.setItem('polycables_universal_trash', JSON.stringify(nextUniversal));

    // Record tombstones strictly for unique primary entity IDs
    recordDeletedEntityId(id);
    if (item.id && item.id !== id) recordDeletedEntityId(item.id);

    // Notify components
    window.dispatchEvent(new CustomEvent('polycables_trash_updated', { detail: { storageKey, id, item } }));
  } catch (err) {
    console.error('Error moving item to trash:', err);
  }
}

export function moveMultipleToTrash<T extends { id?: string }>(
  storageKey: string,
  items: T[],
  categoryTitle: string
) {
  if (!items || items.length === 0) return;
  try {
    const nowIso = new Date().toISOString();
    const raw = localStorage.getItem(storageKey);
    const existingList: any[] = raw ? JSON.parse(raw) : [];

    const universalRaw = localStorage.getItem('polycables_universal_trash');
    const existingUniversal: any[] = universalRaw ? JSON.parse(universalRaw) : [];

    const newRecords: any[] = [];
    const newUniversalEntries: any[] = [];
    const batchIdsSet = new Set<string>();
    const allDeletedIds: string[] = [];

    items.forEach((item, idx) => {
      if (!item) return;
      const id = item.id || `trashed-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`;
      if (batchIdsSet.has(id)) return;
      batchIdsSet.add(id);
      allDeletedIds.push(id);
      if (item.id && item.id !== id) {
        allDeletedIds.push(item.id);
      }

      newRecords.push({
        ...item,
        id,
        trashedAt: nowIso,
        trashCategory: categoryTitle
      });

      newUniversalEntries.push({
        id: `univ-${id}`,
        originalId: id,
        storageKey,
        categoryTitle,
        data: item,
        trashedAt: nowIso
      });
    });

    if (newRecords.length === 0) return;

    const nextList = [
      ...newRecords,
      ...existingList.filter((x: any) => !x || !batchIdsSet.has(String(x.id)))
    ];
    localStorage.setItem(storageKey, JSON.stringify(nextList));

    const nextUniversal = [
      ...newUniversalEntries,
      ...existingUniversal.filter((x: any) => !x || !batchIdsSet.has(String(x.originalId)))
    ].slice(0, 1000);
    localStorage.setItem('polycables_universal_trash', JSON.stringify(nextUniversal));

    recordDeletedEntityIds(allDeletedIds);

    window.dispatchEvent(
      new CustomEvent('polycables_trash_updated', {
        detail: { storageKey, ids: Array.from(batchIdsSet) }
      })
    );
  } catch (err) {
    console.error('Error moving multiple items to trash:', err);
  }
}
