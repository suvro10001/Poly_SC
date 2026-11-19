import React, { useState, useMemo, useEffect } from 'react';
import { Item, PriceListSnapshot, BranchLocation } from '../types';
import { defaultBranches } from '../data/defaultData';
import { X, FileSpreadsheet, CheckCircle2, AlertTriangle, Save, Calendar, Plus } from 'lucide-react';
import { formatDateDDMMYY, getTodayDDMMYY, parseDateToISO } from '../utils/dateUtils';
import {
  buildDeterministicItemId,
  getNextMonotonicSnapshotIso,
  getPriceListSnapshots,
  normalizePriceSnapshots,
  savePriceListSnapshots,
  toCompactSnapshotItems,
  reconcileCatalogItemsWithActiveSnapshot
} from '../utils/priceCircularHelper';
import { safeSetStorageItem, idbSaveFailoverData } from '../utils/indexedDbStorage';
import { getAllCategories, getCategoryNumbers, categorizeCableItem, saveCustomCategory } from '../utils/categoryHelper';
import { groupItemsByCategoryOrder } from '../utils/searchHelper';
import { unrecordDeletedEntityIds, unrecordDeletedIdsLocally } from '../utils/deletedTracker';
import { SearchableItemSelector, SelectableCatalogOption } from './SearchableItemSelector';

interface PriceExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  previewList: Array<{
    serial?: number | string;
    code: string;
    name?: string;
    excelName?: string;
    catalogName?: string;
    hasNameMismatch?: boolean;
    category?: string;
    unit?: string;
    sizeSpec?: string;
    openingStock?: number;
    remarks?: string;
    newRate: number;
    currentRate?: number;
    matchedItem?: Item;
    status: 'matched' | 'unmatched';
  }>;
  detectedEffectiveDate?: string;
  targetSnapshotId?: string | null;
  items: Item[];
  previousItems?: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  snapshots?: PriceListSnapshot[];
  setSnapshots?: (updater: any) => void;
  branches?: BranchLocation[];
  isSpecialItemMode?: boolean;
  onSuccessNotification?: (msg: string) => void;
  onSyncCloud?: (slice: any, immediate?: boolean) => void;
}

export const PriceExcelImportModal: React.FC<PriceExcelImportModalProps> = ({
  isOpen,
  onClose,
  previewList,
  detectedEffectiveDate,
  targetSnapshotId,
  items,
  previousItems = [],
  setItems,
  snapshots,
  setSnapshots,
  branches = defaultBranches,
  isSpecialItemMode = false,
  onSuccessNotification,
  onSyncCloud
}) => {
  const effectiveBranches = branches && branches.length > 0 ? branches : defaultBranches;
  const [effectiveDate, setEffectiveDate] = useState<string>(
    (detectedEffectiveDate ? formatDateDDMMYY(detectedEffectiveDate) : '') || getTodayDDMMYY()
  );
  const [importNote, setImportNote] = useState('Excel Circular Import');
  const [nameChoices, setNameChoices] = useState<Record<number, 'catalog' | 'excel'>>({});
  const [manualMappings, setManualMappings] = useState<Record<number, string>>({});
  const [expandedMapRow, setExpandedMapRow] = useState<number | null>(null);
  const [importMode, setImportMode] = useState<'create_new' | 'update_existing'>(
    targetSnapshotId ? 'update_existing' : 'create_new'
  );
  const [selectedTargetSnapId, setSelectedTargetSnapId] = useState<string>(targetSnapshotId || '');
  const [setActiveOnSave, setSetActiveOnSave] = useState<boolean>(true);

  const availableSnapshots = useMemo(() => {
    try {
      const savedRaw = localStorage.getItem('polycables_price_snapshots');
      const parsed = savedRaw ? JSON.parse(savedRaw) : null;
      const base =
        Array.isArray(parsed) && parsed.length > 0
          ? parsed
          : (Array.isArray(snapshots) && snapshots.length > 0 ? snapshots : getPriceListSnapshots());
      return normalizePriceSnapshots(base);
    } catch {
      return normalizePriceSnapshots(snapshots || []);
    }
  }, [snapshots, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setEffectiveDate(
        (detectedEffectiveDate ? formatDateDDMMYY(detectedEffectiveDate) : '') || getTodayDDMMYY()
      );
      setNameChoices({});
      setManualMappings({});
      setExpandedMapRow(null);
      const nextMode: 'create_new' | 'update_existing' = targetSnapshotId ? 'update_existing' : 'create_new';
      setImportMode(nextMode);
      const fallbackTargetId =
        targetSnapshotId ||
        availableSnapshots.find((s) => s.isActive)?.id ||
        availableSnapshots[0]?.id ||
        '';
      setSelectedTargetSnapId(fallbackTargetId);
      if (nextMode === 'update_existing' && targetSnapshotId) {
        const tgt = availableSnapshots.find((s) => s.id === targetSnapshotId);
        setSetActiveOnSave(tgt ? Boolean(tgt.isActive || availableSnapshots.length <= 1) : true);
      } else {
        setSetActiveOnSave(true);
      }
    }
  }, [isOpen, detectedEffectiveDate, previewList, targetSnapshotId]);

  // Deduplicated pool of all existing Master Item Directory items + previous Price Update list items
  const candidatePool = useMemo(() => {
    const map = new Map<string, Item & { _sourceLabel?: string }>();
    const byNameCat = new Map<string, string>();

    const addCandidate = (raw: any, sourceLabel: string) => {
      if (!raw) return;
      if (isSpecialItemMode ? !raw.isSpecialItem : Boolean(raw.isSpecialItem)) return;
      const name = String(raw.name || raw.itemName || '').trim();
      if (!name) return;
      const id = String(raw.id || buildDeterministicItemId(raw.code, name, raw.category)).trim();
      const cat = String(raw.category || categorizeCableItem(name, raw.sizeSpec) || 'Single Core Wires').trim();
      const ncKey = `${name.toLowerCase()}::${cat.toLowerCase()}`;

      if (map.has(id) || byNameCat.has(ncKey)) return;
      const normalizedItem: Item & { _sourceLabel?: string } = {
        ...raw,
        id,
        code: String(raw.code || '').trim(),
        name,
        category: cat,
        unit: String(raw.unit || 'Coils'),
        rate: Number(raw.rate) || 0,
        openingStock: Number(raw.openingStock) || 0,
        _sourceLabel: sourceLabel
      };
      map.set(id, normalizedItem);
      byNameCat.set(ncKey, id);
    };

    (Array.isArray(items) ? items : []).forEach((it) => addCandidate(it, 'Active Directory'));
    (Array.isArray(previousItems) ? previousItems : []).forEach((it) => addCandidate(it, 'Existing / Previous'));
    (Array.isArray(snapshots) ? snapshots : []).forEach((snap) => {
      const snapLabel = snap?.effectiveDate ? `List ${snap.effectiveDate}` : 'Previous List';
      (Array.isArray(snap?.items) ? snap.items : []).forEach((si) => addCandidate(si, snapLabel));
    });

    return Array.from(map.values());
  }, [items, previousItems, snapshots]);

  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => getAllCategories());
  useEffect(() => {
    const syncCats = () => setCategoryOrder(getAllCategories());
    window.addEventListener('categories-updated', syncCats);
    return () => window.removeEventListener('categories-updated', syncCats);
  }, []);

  const selectorOptions: SelectableCatalogOption[] = useMemo(() => {
    const grouped = groupItemsByCategoryOrder(candidatePool, categoryOrder);
    return grouped.orderedItems.map((it) => ({
      id: it.id,
      code: it.code,
      name: it.name,
      category: it.category,
      unit: it.unit,
      rate: Number(it.rate) || 0,
      sourceLabel: (it as any)._sourceLabel
    }));
  }, [candidatePool, categoryOrder]);

  const resolvedList = useMemo(() => {
    return previewList.map((p, idx) => {
      const pCode = (p.code || '').trim().toLowerCase();
      const pName = (p.excelName || p.name || '').trim().toLowerCase();
      const pNorm = pName.replace(/[^a-z0-9]/g, '');

      const matched =
        (p.status !== 'unmatched' && p.matchedItem ? p.matchedItem : undefined) ||
        (p.status !== 'unmatched' && (p as any).matchedItemId
          ? candidatePool.find((i) => i.id === (p as any).matchedItemId)
          : undefined) ||
        (pCode ? candidatePool.find((i) => i.code && i.code.trim().toLowerCase() === pCode) : undefined) ||
        (pName ? candidatePool.find((i) => i.name && i.name.trim().toLowerCase() === pName) : undefined) ||
        (pNorm.length >= 3
          ? candidatePool.find((i) => i.name && i.name.toLowerCase().replace(/[^a-z0-9]/g, '') === pNorm)
          : undefined);

      const status: 'matched' | 'unmatched' = matched ? 'matched' : 'unmatched';
      const curRate = matched?.rate ?? (p as any).currentRate ?? (p as any).oldRate ?? 0;
      const rate = Number(p.newRate) || curRate;
      const excelName = (p.excelName || p.name || '').trim();
      const catalogName = (matched?.name || p.catalogName || '').trim();
      const hasNameMismatch = Boolean(matched && excelName && catalogName && excelName !== catalogName);

      return {
        ...p,
        rowIdx: idx,
        status,
        matchedItem: matched,
        excelName,
        catalogName,
        hasNameMismatch,
        currentRate: curRate,
        newRate: rate
      };
    });
  }, [previewList, candidatePool]);

  if (!isOpen) return null;

  const matchedList = resolvedList.filter((p) => p.status === 'matched' && p.matchedItem);
  const unmatchedList = resolvedList.filter((p) => p.status === 'unmatched' || !p.matchedItem);
  const mismatchedList = resolvedList.filter((p) => p.hasNameMismatch);

  const mappedUnmatchedCount = unmatchedList.filter((row) => {
    const targetId = manualMappings[row.rowIdx];
    return Boolean(targetId && candidatePool.some((c) => c.id === targetId));
  }).length;
  const newCreateCount = unmatchedList.length - mappedUnmatchedCount;
  const totalFinalImportCount = resolvedList.length;

  const handleSetAllNameChoices = (choice: 'catalog' | 'excel') => {
    const next: Record<number, 'catalog' | 'excel'> = {};
    mismatchedList.forEach((m) => {
      next[m.rowIdx] = choice;
    });
    setNameChoices(next);
  };

  const handleConfirmImport = () => {
    if (resolvedList.length === 0) {
      onSuccessNotification?.('No valid rows to import.');
      onClose();
      return;
    }

    const finalEffectiveDate = formatDateDDMMYY(effectiveDate.trim()) || getTodayDDMMYY();
    const nowBatchIso = new Date().toISOString();
    const primaryAllSalesCentersStatus: Record<string, boolean> = {};
    effectiveBranches.forEach((b) => {
      primaryAllSalesCentersStatus[b.id] = true;
      primaryAllSalesCentersStatus[b.name] = true;
    });

    // Build matched/mapped updates AND directly create new catalog items for any new rows
    const importedSourceItems: Array<{
      id: string;
      code: string;
      name: string;
      category: string;
      unit: string;
      rate: number;
      sizeSpec?: string;
      serial?: number | string;
    }> = [];
    const newlyCreatedCatalogItems: Item[] = [];
    const seenSourceIds = new Set<string>();
    const existingAllIds = new Set(items.map((i) => i.id).filter(Boolean));

    resolvedList.forEach((row, idx) => {
      let targetItem: Item | undefined = row.matchedItem;
      let chosenName = (row.excelName || row.name || row.catalogName || '').trim().replace(/\s+/g, ' ');
      const parsedRate = Number(row.newRate) || 0;

      if (row.status === 'matched' && row.matchedItem) {
        if (row.hasNameMismatch) {
          const picked = nameChoices[row.rowIdx] || 'catalog';
          chosenName = picked === 'excel' ? row.excelName : row.catalogName;
        } else {
          chosenName = row.matchedItem.name;
        }
      } else {
        const mappedId = manualMappings[row.rowIdx];
        if (mappedId) {
          const mappedCand = candidatePool.find((c) => c.id === mappedId);
          if (mappedCand) {
            targetItem = mappedCand;
            chosenName = mappedCand.name;
          }
        }
      }

      if (targetItem) {
        if (seenSourceIds.has(targetItem.id)) return;
        seenSourceIds.add(targetItem.id);

        const resolvedCat =
          targetItem.category || row.category || categorizeCableItem(chosenName, targetItem.sizeSpec) || 'Single Core Wires';
        if (resolvedCat) saveCustomCategory(resolvedCat);

        importedSourceItems.push({
          id: targetItem.id,
          code: targetItem.code || row.code || '',
          name: chosenName || targetItem.name,
          category: resolvedCat,
          unit: targetItem.unit || row.unit || (isSpecialItemMode ? 'Bobin' : 'Coils'),
          rate: parsedRate,
          sizeSpec: targetItem.sizeSpec || row.sizeSpec,
          serial: (row as any).serial ?? targetItem.serial ?? (idx + 1)
        });
      } else {
        // Direct Item & Rate Ingestion: auto-prepare new catalog item from valid Excel row
        const cleanNewName = chosenName || row.code || `Item #${idx + 1}`;
        const resolvedCat =
          row.category || categorizeCableItem(cleanNewName, row.sizeSpec) || 'Single Core Wires';
        if (resolvedCat) saveCustomCategory(resolvedCat);

        const resolvedUnit = row.unit || (isSpecialItemMode ? 'Bobin' : 'Coils');
        const baseDetId = buildDeterministicItemId(
          `${isSpecialItemMode ? 'sp-' : ''}${row.code || ''}`,
          cleanNewName,
          resolvedCat
        );
        let assignedId = baseDetId;
        let suffix = 1;
        while (seenSourceIds.has(assignedId) || existingAllIds.has(assignedId)) {
          assignedId = `${baseDetId}-${suffix++}`;
        }
        seenSourceIds.add(assignedId);
        existingAllIds.add(assignedId);

        const itemSerial = (row as any).serial ?? (items.length + newlyCreatedCatalogItems.length + 1);
        const itemCode = row.code || `PC-${100 + items.length + newlyCreatedCatalogItems.length + 1}`;

        const createdItem: Item = {
          id: assignedId,
          code: itemCode,
          name: cleanNewName,
          category: resolvedCat,
          unit: resolvedUnit,
          sizeSpec: row.sizeSpec || '',
          openingStock: Number(row.openingStock) || 0,
          remarks: row.remarks || '',
          rate: parsedRate,
          serial: itemSerial,
          serialNo: itemSerial,
          order: typeof itemSerial === 'number' ? itemSerial : items.length + newlyCreatedCatalogItems.length + 1,
          isSpecialItem: Boolean(isSpecialItemMode),
          isActive: true,
          branchActiveStatus: primaryAllSalesCentersStatus,
          effectiveDate: finalEffectiveDate,
          updatedAt: nowBatchIso,
          priceHistory: [
            {
              effectiveDate: finalEffectiveDate,
              rate: parsedRate,
              updatedAt: nowBatchIso,
              notes: `Created via Excel import: ৳${parsedRate} (Eff: ${finalEffectiveDate})`
            }
          ]
        };
        newlyCreatedCatalogItems.push(createdItem);

        importedSourceItems.push({
          id: assignedId,
          code: itemCode,
          name: cleanNewName,
          category: resolvedCat,
          unit: resolvedUnit,
          rate: parsedRate,
          sizeSpec: row.sizeSpec || '',
          serial: itemSerial
        });
      }
    });

    if (importedSourceItems.length === 0) {
      onSuccessNotification?.('No valid items to import.');
      onClose();
      return;
    }

    const compactImportedItems = toCompactSnapshotItems(importedSourceItems);

    let finalSnapshots: PriceListSnapshot[] = [];
    let willBeActive = true;
    let updatedExistingListTitle: string | null = null;
    let resultTargetSnap: PriceListSnapshot | undefined;
    try {
      const savedSnapshotsRaw = localStorage.getItem('polycables_price_snapshots');
      const parsedSaved = savedSnapshotsRaw ? JSON.parse(savedSnapshotsRaw) : null;
      const rawPrevSnapshots: PriceListSnapshot[] =
        Array.isArray(parsedSaved) && parsedSaved.length > 0
          ? parsedSaved
          : (Array.isArray(snapshots) && snapshots.length > 0 ? snapshots : getPriceListSnapshots());
      const prevSnapshots = normalizePriceSnapshots(rawPrevSnapshots);
      const nowIso = getNextMonotonicSnapshotIso(prevSnapshots);

      const resolvedUpdateId =
        importMode === 'update_existing'
          ? (selectedTargetSnapId || targetSnapshotId || '')
          : '';
      const existingTarget = resolvedUpdateId
        ? prevSnapshots.find((s) => s.id === resolvedUpdateId)
        : undefined;

      const hasAnyActive = prevSnapshots.some((s) => s && s.isActive);
      willBeActive = existingTarget
        ? Boolean(setActiveOnSave || !hasAnyActive || prevSnapshots.length <= 1)
        : Boolean(setActiveOnSave || !hasAnyActive || prevSnapshots.length === 0);

      let nextSnapshotArray: PriceListSnapshot[];
      if (existingTarget) {
        const mergedById = new Map<string, any>();
        const existingIdByCode = new Map<string, string>();
        const existingIdByName = new Map<string, string>();

        (Array.isArray(existingTarget.items) ? existingTarget.items : []).forEach((ei) => {
          if (!ei || !ei.id) return;
          mergedById.set(ei.id, ei);
          if (ei.code) existingIdByCode.set(ei.code.trim().toLowerCase(), ei.id);
          if (ei.name) existingIdByName.set(ei.name.trim().toLowerCase(), ei.id);
        });

        compactImportedItems.forEach((ci) => {
          const codeKey = ci.code ? ci.code.trim().toLowerCase() : '';
          const nameKey = ci.name ? ci.name.trim().toLowerCase() : '';
          const matchedId =
            (mergedById.has(ci.id) ? ci.id : undefined) ||
            (codeKey ? existingIdByCode.get(codeKey) : undefined) ||
            (nameKey ? existingIdByName.get(nameKey) : undefined);

          if (matchedId) {
            const prevEntry = mergedById.get(matchedId) || {};
            mergedById.set(matchedId, {
              ...prevEntry,
              ...ci,
              id: matchedId
            });
          } else {
            mergedById.set(ci.id, ci);
          }
        });

        const mergedSnapItems = Array.from(mergedById.values());
        const resolvedTitle =
          importNote && importNote !== 'Excel Circular Import'
            ? importNote
            : existingTarget.title && existingTarget.title.startsWith('Price List (')
              ? `Price List (${finalEffectiveDate})`
              : (existingTarget.title || `Price List (${finalEffectiveDate})`);
        updatedExistingListTitle = resolvedTitle;

        const updatedSnap: PriceListSnapshot = {
          ...existingTarget,
          title: resolvedTitle,
          effectiveDate: finalEffectiveDate,
          updatedAt: nowIso,
          ...(willBeActive ? { activatedAt: nowIso, isActive: true } : {}),
          itemCount: mergedSnapItems.length,
          items: mergedSnapItems,
          notes:
            importNote && importNote !== 'Excel Circular Import'
              ? importNote
              : `Updated ${compactImportedItems.length} item(s) in place effective ${finalEffectiveDate}`
        };
        resultTargetSnap = updatedSnap;

        nextSnapshotArray = prevSnapshots.map((s) => {
          if (s.id === existingTarget.id) {
            return updatedSnap;
          }
          return willBeActive ? { ...s, isActive: false } : s;
        });
      } else {
        const newSnapshot: PriceListSnapshot = {
          id: `snap_${Date.now()}`,
          title: importNote && importNote !== 'Excel Circular Import' ? importNote : `Price List (${finalEffectiveDate})`,
          effectiveDate: finalEffectiveDate,
          createdAt: nowIso,
          updatedAt: nowIso,
          ...(willBeActive ? { activatedAt: nowIso } : {}),
          itemCount: compactImportedItems.length,
          items: compactImportedItems,
          isActive: willBeActive,
          notes: importNote || `Excel import applied for ${compactImportedItems.length} items (Updated: ${matchedList.length}, Mapped: ${mappedUnmatchedCount}, New Created: ${newCreateCount}) effective ${finalEffectiveDate}`
        };
        resultTargetSnap = newSnapshot;
        const preservedPrev = willBeActive
          ? prevSnapshots.map((s) => ({ ...s, isActive: false }))
          : prevSnapshots;
        nextSnapshotArray = [newSnapshot, ...preservedPrev];
      }

      const activeAfterSnap = nextSnapshotArray.find((s) => s.isActive) || resultTargetSnap;
      finalSnapshots = savePriceListSnapshots(
        nextSnapshotArray,
        activeAfterSnap
          ? {
              effectiveDate: activeAfterSnap.effectiveDate,
              circularTitle: activeAfterSnap.title,
              dispatch: false
            }
          : { dispatch: false }
      );
      setSnapshots?.(finalSnapshots);
    } catch {
      finalSnapshots = snapshots || [];
    }

    // Seed newly created items + candidate metadata so reconcile preserves full item metadata and creates all new items cleanly
    const mergedBasePool: Item[] = [...items];
    const existingItemIds = new Set(mergedBasePool.map((i) => i.id));
    newlyCreatedCatalogItems.forEach((created) => {
      if (!existingItemIds.has(created.id)) {
        mergedBasePool.push(created);
        existingItemIds.add(created.id);
      }
    });
    importedSourceItems.forEach((src) => {
      if (!existingItemIds.has(src.id)) {
        const cand = candidatePool.find((c) => c.id === src.id);
        if (cand) {
          const { _sourceLabel, ...cleanCand } = cand;
          void _sourceLabel;
          mergedBasePool.push(cleanCand);
          existingItemIds.add(src.id);
        }
      }
    });

    const activeFinalSnap = finalSnapshots.find((s) => s.isActive) || (willBeActive ? resultTargetSnap : undefined);
    const rec = reconcileCatalogItemsWithActiveSnapshot(mergedBasePool, finalSnapshots, {
      activateExplicitly: willBeActive,
      ...(willBeActive && activeFinalSnap ? { targetSnapshot: activeFinalSnap } : {})
    });

    const finalUpdatedItems = rec.items;
    const activeIds = finalUpdatedItems.map((it) => it.id).filter(Boolean);
    if (activeIds.length > 0) {
      unrecordDeletedIdsLocally(activeIds);
      unrecordDeletedEntityIds(activeIds);
    }

    if (willBeActive || rec.changed) {
      setItems(finalUpdatedItems);
    }

    const specialList = finalUpdatedItems.filter((i) => i.isSpecialItem);
    const itemsVer = Date.now();
    const clientId = typeof window !== 'undefined' ? (window as any).__polycablesClientSyncId : undefined;
    const effectiveActiveDate = activeFinalSnap?.effectiveDate || finalEffectiveDate;

    if (willBeActive || rec.changed) {
      try {
        if (finalUpdatedItems.length === 0) {
          localStorage.setItem('polycables_items_cleared', 'true');
        } else {
          localStorage.removeItem('polycables_items_cleared');
        }
        localStorage.setItem('polycables_items_version', String(itemsVer));
        localStorage.setItem('polycables_items_version_applied', String(itemsVer));
        localStorage.removeItem('polycables_price_snapshots_cleared');
        safeSetStorageItem('polycables_items', JSON.stringify(finalUpdatedItems), finalUpdatedItems);
        safeSetStorageItem('polycables_special_items', JSON.stringify(specialList), specialList);
        idbSaveFailoverData('polycables_items', finalUpdatedItems).catch(() => {});
        idbSaveFailoverData('polycables_special_items', specialList).catch(() => {});
      } catch {}

      fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          items: finalUpdatedItems,
          specialItems: specialList,
          itemsVersion: itemsVer,
          itemsCleared: finalUpdatedItems.length === 0,
          priceSnapshots: finalSnapshots,
          activeEffectiveDate: effectiveActiveDate,
          orderedCategories: getAllCategories(),
          categoryNumbers: getCategoryNumbers()
        })
      }).catch(() => {});
    }

    const syncPatch: any = {
      priceSnapshots: finalSnapshots,
      price_snapshots: finalSnapshots,
      _replacePriceSnapshots: true,
      ...(willBeActive ? { activeEffectiveDate: effectiveActiveDate } : {}),
      ...(willBeActive || rec.changed
        ? {
            items: finalUpdatedItems,
            specialItems: specialList,
            itemsVersion: itemsVer,
            _itemsCleared: finalUpdatedItems.length === 0,
            _replaceItems: true
          }
        : {})
    };

    if (onSyncCloud) {
      onSyncCloud(syncPatch, true);
    } else {
      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          patch: syncPatch
        })
      }).catch(() => {});
    }

    try {
      if (willBeActive || rec.changed) {
        window.dispatchEvent(new CustomEvent('polycables_items_updated', { detail: { items: finalUpdatedItems } }));
      }
      window.dispatchEvent(new CustomEvent('polycables_snapshots_updated', { detail: { snapshots: finalSnapshots } }));
      window.dispatchEvent(new CustomEvent('polycables_price_snapshots_updated', { detail: { snapshots: finalSnapshots } }));
      if (willBeActive) {
        window.dispatchEvent(
          new CustomEvent('polycables_active_price_circular_changed', {
            detail: { effectiveDate: finalEffectiveDate, circularTitle: updatedExistingListTitle || importNote }
          })
        );
      }
    } catch {}

    onSuccessNotification?.(
      `${updatedExistingListTitle ? 'Updated existing price list' : 'Imported'} ${compactImportedItems.length} item(s) effective ${finalEffectiveDate} (${matchedList.length} matched, ${newCreateCount} new${mappedUnmatchedCount > 0 ? `, ${mappedUnmatchedCount} mapped` : ''}).`
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-5xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-none">
          <div className="flex items-center space-x-3 text-indigo-700">
            <div className="p-2.5 bg-indigo-100 rounded-xl">
              <FileSpreadsheet className="w-6 h-6 text-indigo-700" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">
                Excel Price Import Preview
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Direct bulk import ready: matched items update catalog prices and new rows are automatically prepared for creation.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Settings */}
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs flex-none space-y-2.5">
          {availableSnapshots.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-700">Circular Action:</span>
                <button
                  type="button"
                  onClick={() => {
                    setImportMode('create_new');
                    setSetActiveOnSave(true);
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold border transition-colors cursor-pointer ${
                    importMode === 'create_new'
                      ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  Create New Circular (Preserve Previous Lists)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportMode('update_existing');
                    const tid = selectedTargetSnapId || availableSnapshots.find((s) => s.isActive)?.id || availableSnapshots[0]?.id || '';
                    setSelectedTargetSnapId(tid);
                    const tgt = availableSnapshots.find((s) => s.id === tid);
                    if (tgt) {
                      setSetActiveOnSave(Boolean(tgt.isActive || availableSnapshots.length <= 1));
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold border transition-colors cursor-pointer ${
                    importMode === 'update_existing'
                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  Update Existing Circular (Preserve Others)
                </button>
              </div>
              {importMode === 'update_existing' && (
                <select
                  value={selectedTargetSnapId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSelectedTargetSnapId(nextId);
                    const tgt = availableSnapshots.find((s) => s.id === nextId);
                    if (tgt) {
                      setSetActiveOnSave(Boolean(tgt.isActive || availableSnapshots.length <= 1));
                    }
                  }}
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg font-bold text-slate-800"
                >
                  {availableSnapshots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.effectiveDate} — {s.title || 'Price List'} ({Array.isArray(s.items) ? s.items.length : 0} items){s.isActive ? ' [ACTIVE]' : ''}
                    </option>
                  ))}
                </select>
              )}
              <label className="flex items-center gap-1.5 font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={setActiveOnSave}
                  onChange={(e) => setSetActiveOnSave(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Set as Active Directory List</span>
              </label>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Effective Date (dd.mm.yy):</label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  onBlur={() => {
                    const normalized = formatDateDDMMYY(effectiveDate.trim());
                    if (normalized) setEffectiveDate(normalized);
                  }}
                  placeholder="dd.mm.yy (e.g. 10.08.26)"
                  className="w-full p-2 pr-9 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900"
                />
                <div className="absolute right-2 flex items-center">
                  <Calendar className="w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    type="date"
                    value={parseDateToISO(effectiveDate)}
                    onChange={(e) => {
                      const formatted = formatDateDDMMYY(e.target.value);
                      if (formatted) setEffectiveDate(formatted);
                    }}
                    title="Pick Effective Date"
                    className="absolute inset-0 opacity-0 cursor-pointer w-5 h-5"
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Price Update Note:</label>
              <input
                type="text"
                value={importNote}
                onChange={(e) => setImportNote(e.target.value)}
                placeholder="e.g. Master Price Revision 2026"
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs px-2.5 flex-none bg-slate-50 py-2.5 rounded-xl border border-slate-200">
          <span className="font-bold text-slate-700">
            Ready to Import: <strong className="text-slate-900 font-mono text-sm">{resolvedList.length}</strong> row(s)
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-emerald-700 font-bold flex items-center space-x-1 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Matched Updates: {matchedList.length}</span>
            </span>
            {newCreateCount > 0 && (
              <span className="text-indigo-700 font-bold flex items-center space-x-1 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                <Plus className="w-3.5 h-3.5" />
                <span>New Items (Auto-Create): {newCreateCount}</span>
              </span>
            )}
            {mappedUnmatchedCount > 0 && (
              <span className="text-teal-700 font-bold flex items-center space-x-1 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Mapped: {mappedUnmatchedCount}</span>
              </span>
            )}
            {mismatchedList.length > 0 && (
              <span className="text-amber-800 font-bold flex items-center space-x-1.5 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>Name Variations: {mismatchedList.length}</span>
                <button
                  type="button"
                  onClick={() => handleSetAllNameChoices('catalog')}
                  className="ml-1 px-1.5 py-0.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded text-[10px] font-bold cursor-pointer"
                >
                  Keep All Catalog
                </button>
                <button
                  type="button"
                  onClick={() => handleSetAllNameChoices('excel')}
                  className="px-1.5 py-0.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-[10px] font-bold cursor-pointer"
                >
                  Use All Excel
                </button>
              </span>
            )}
          </div>
        </div>

        {/* Direct Bulk Import Readiness Notice */}
        {resolvedList.length > 0 && (
          <div className="flex-none bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2 text-xs text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Direct Bulk Import Ready:</strong> All <strong>{resolvedList.length}</strong> parsed item(s) will be imported directly into {isSpecialItemMode ? 'Special Item List' : 'Master Item Directory'} and this circular ({matchedList.length} updated, {newCreateCount} new).
            </span>
          </div>
        )}

        {/* Scrollable Table */}
        <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-80">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10">
              <tr>
                <th className="p-2 w-24">Item Code</th>
                <th className="p-2">Item Name &amp; Category / Unit</th>
                <th className="p-2 text-right w-24">Current (৳)</th>
                <th className="p-2 text-right w-24">New Rate (৳)</th>
                <th className="p-2 text-center w-32">Import Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {resolvedList.map((row, idx) => {
                const isMatched = row.status === 'matched' && row.matchedItem;
                const mappedId = manualMappings[row.rowIdx];
                const mappedTarget = mappedId
                  ? candidatePool.find((c) => c.id === mappedId)
                  : undefined;
                const curRate = row.matchedItem?.rate ?? mappedTarget?.rate ?? row.currentRate ?? 0;
                const pickedNameSide = nameChoices[row.rowIdx] || 'catalog';
                const isMapPickerOpen = expandedMapRow === row.rowIdx;

                return (
                  <tr
                    key={idx}
                    className={
                      row.hasNameMismatch
                        ? 'bg-amber-50/70'
                        : isMatched
                          ? 'hover:bg-slate-50'
                          : mappedTarget
                            ? 'bg-teal-50/40'
                            : 'bg-indigo-50/35 hover:bg-indigo-50/60'
                    }
                  >
                    <td className="p-2 font-mono font-bold text-slate-900 align-top">{row.code || 'AUTO'}</td>
                    <td className="p-2 font-medium text-slate-800">
                      {row.hasNameMismatch ? (
                        <div className="space-y-1">
                          <div className="text-[10px] font-bold text-amber-700 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Name variation — select which name to save:</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => setNameChoices((prev) => ({ ...prev, [row.rowIdx]: 'catalog' }))}
                              className={`px-2 py-1 rounded text-[11px] font-bold border text-left transition-colors cursor-pointer ${
                                pickedNameSide === 'catalog'
                                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                              }`}
                            >
                              Catalog: {row.catalogName}
                            </button>
                            <button
                              type="button"
                              onClick={() => setNameChoices((prev) => ({ ...prev, [row.rowIdx]: 'excel' }))}
                              className={`px-2 py-1 rounded text-[11px] font-bold border text-left transition-colors cursor-pointer ${
                                pickedNameSide === 'excel'
                                  ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                              }`}
                            >
                              Excel: {row.excelName}
                            </button>
                          </div>
                        </div>
                      ) : isMatched ? (
                        <div>
                          <div className="font-semibold text-slate-900">{row.matchedItem?.name || row.name}</div>
                          <div className="text-[10px] text-slate-500">
                            {row.matchedItem?.category || row.category || 'Single Core Wires'} • {row.matchedItem?.unit || row.unit || 'Coils'}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="font-bold text-slate-900">
                                {mappedTarget ? mappedTarget.name : (row.excelName || row.name || 'New Item')}
                              </span>
                              <div className="text-[10px] text-slate-500">
                                {mappedTarget
                                  ? `Mapped to existing item (Excel: ${row.excelName || row.name})`
                                  : `${row.category || categorizeCableItem(row.excelName || row.name || '', row.sizeSpec) || 'Single Core Wires'} • ${row.unit || 'Coils'}`}
                              </div>
                            </div>
                            {selectorOptions.length > 0 && (
                              <div className="flex items-center gap-1.5">
                                {mappedTarget && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setManualMappings((prev) => {
                                        const next = { ...prev };
                                        delete next[row.rowIdx];
                                        return next;
                                      });
                                      setExpandedMapRow(null);
                                    }}
                                    className="text-[10px] font-bold text-indigo-700 hover:underline cursor-pointer"
                                  >
                                    Create as New Instead
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setExpandedMapRow(isMapPickerOpen ? null : row.rowIdx)}
                                  className="text-[10px] font-semibold text-slate-500 hover:text-indigo-700 underline cursor-pointer"
                                >
                                  {isMapPickerOpen ? 'Hide Mapper' : mappedTarget ? 'Change Match' : 'Map to Existing'}
                                </button>
                              </div>
                            )}
                          </div>
                          {isMapPickerOpen && (
                            <SearchableItemSelector
                              theme="light"
                              options={selectorOptions}
                              value={mappedTarget ? mappedTarget.id : ''}
                              placeholder="Optional: map to an existing catalog item..."
                              skipLabel="Auto-Create as New Item"
                              emptyOptionsMessage="No existing items available — will auto-create as new"
                              onChange={(val) => {
                                if (!val || val === '__SKIP__') {
                                  setManualMappings((prev) => {
                                    const next = { ...prev };
                                    delete next[row.rowIdx];
                                    return next;
                                  });
                                } else {
                                  setManualMappings((prev) => ({
                                    ...prev,
                                    [row.rowIdx]: val
                                  }));
                                }
                                setExpandedMapRow(null);
                              }}
                            />
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-2 text-right font-mono text-slate-600 align-top">
                      {isMatched || mappedTarget ? `৳${Number(curRate).toFixed(2)}` : 'New'}
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-emerald-700 align-top">
                      ৳{Number(row.newRate).toFixed(2)}
                    </td>
                    <td className="p-2 text-center align-top">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          row.hasNameMismatch
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : isMatched
                              ? 'bg-emerald-100 text-emerald-800'
                              : mappedTarget
                                ? 'bg-teal-100 text-teal-800 border border-teal-200'
                                : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                        }`}
                      >
                        {row.hasNameMismatch
                          ? 'Name Choice'
                          : isMatched
                            ? 'Matched'
                            : mappedTarget
                              ? 'Mapped'
                              : 'Ready (New)'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-3 border-t border-slate-200 flex-none">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmImport}
            disabled={resolvedList.length === 0}
            className="w-full sm:w-auto px-5 py-2 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-lg transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Finalize &amp; Import ({totalFinalImportCount} Items)</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PriceExcelImportModal;
