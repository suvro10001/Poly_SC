import React, { useState, useMemo, useEffect } from 'react';
import { Item, PriceListSnapshot, PriceHistoryEntry, CompanyDetails, BranchLocation } from '../types';
import { defaultBranches } from '../data/defaultData';
import { DateInputWithPicker } from './DateInputWithPicker';
import {
  History,
  TrendingUp,
  Download,
  Printer,
  Sparkles,
  Calendar,
  CheckCircle2,
  Plus,
  Check,
  Eye,
  Trash2,
  Edit2,
  ArrowLeft,
  X,
  AlertCircle,
  Upload,
  Search,
  LayoutGrid,
  List
} from 'lucide-react';
import { formatDateDDMMYY, getTodayDDMMYY } from '../utils/dateUtils';
import { getAllCategories, getCategoryNumbers } from '../utils/categoryHelper';
import { groupItemsByCategoryOrder, getCategorySerialRank } from '../utils/searchHelper';
import {
  exportPriceUpdateByEffectiveDate,
  parseXLSXForEffectiveDatePriceUpdate,
  PriceUpdatePreviewEntry
} from '../utils/xlsxItemHelper';
import { PriceExcelImportModal } from './PriceExcelImportModal';
import { ManualPriceUpdateView } from './ManualPriceUpdateView';
import { ItemPricePrintPreviewModal } from './ItemPricePrintPreviewModal';
import { recordDeletedEntityId, unrecordDeletedEntityIds, unrecordDeletedIdsLocally } from '../utils/deletedTracker';
import {
  buildDeterministicItemId,
  getNextMonotonicSnapshotIso,
  getPriceListSnapshots,
  normalizePriceSnapshots,
  savePriceListSnapshots,
  toCompactSnapshotItems,
  syncActiveSnapshotWithCatalogItems,
  reconcileCatalogItemsWithActiveSnapshot
} from '../utils/priceCircularHelper';
import { syncSpecialItemRatesWithBaseItems } from '../utils/stockHelper';
import { safeSetStorageItem, idbSaveFailoverData } from '../utils/indexedDbStorage';
import { emitErpNotification } from './NotificationChatHub';

interface PriceHistoryManagerProps {
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  onOpenBulkUpdateModal?: () => void;
  company?: CompanyDetails;
  branches?: BranchLocation[];
  onBack?: () => void;
  onClose?: () => void;
  onSyncCloud?: (slice: any, immediate?: boolean) => void;
}

type CircularViewItem = Partial<Item> & { id?: string; name: string; category?: string; rate: number };

type CircularDisplayRow =
  | { kind: 'cat'; category: string; count: number; isCont?: boolean }
  | { kind: 'item'; item: CircularViewItem; serialNum: number | string };

interface CircularDensityTier {
  name: string;
  theadH: number;
  rowH: number;
  catH: number;
  headerFont: string;
  fontClass: string;
  catFontClass: string;
  cellPad: string;
  catPad: string;
  rateClass: string;
}

const CIRCULAR_DENSITY_TIERS: CircularDensityTier[] = [
  {
    name: 'comfortable',
    theadH: 30,
    rowH: 30,
    catH: 24,
    headerFont: 'text-[11px]',
    fontClass: 'text-xs leading-tight',
    catFontClass: 'text-[11px] leading-tight',
    cellPad: 'py-1.5 px-2.5',
    catPad: 'py-1 px-2.5',
    rateClass: 'text-xs'
  },
  {
    name: 'cozy',
    theadH: 25,
    rowH: 23,
    catH: 20,
    headerFont: 'text-[10px]',
    fontClass: 'text-[11px] leading-tight',
    catFontClass: 'text-[10px] leading-tight',
    cellPad: 'py-[3px] px-2',
    catPad: 'py-[2px] px-2',
    rateClass: 'text-[11px]'
  },
  {
    name: 'compact',
    theadH: 22,
    rowH: 19,
    catH: 17,
    headerFont: 'text-[9.5px]',
    fontClass: 'text-[10.5px] leading-none',
    catFontClass: 'text-[9.5px] leading-none',
    cellPad: 'py-[2.5px] px-1.5',
    catPad: 'py-[2px] px-1.5',
    rateClass: 'text-[10.5px]'
  },
  {
    name: 'dense',
    theadH: 19,
    rowH: 16.5,
    catH: 15,
    headerFont: 'text-[9px]',
    fontClass: 'text-[9.5px] leading-none',
    catFontClass: 'text-[9px] leading-none',
    cellPad: 'py-[1.5px] px-1.5',
    catPad: 'py-[1.5px] px-1.5',
    rateClass: 'text-[9.5px]'
  },
  {
    name: 'micro',
    theadH: 17,
    rowH: 14,
    catH: 13,
    headerFont: 'text-[8.5px]',
    fontClass: 'text-[8.5px] leading-none',
    catFontClass: 'text-[8px] leading-none',
    cellPad: 'py-[1px] px-1',
    catPad: 'py-[1px] px-1',
    rateClass: 'text-[8.5px]'
  }
];

const CIRCULAR_GRID_CLASSES: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5'
};

function buildCircularDisplayRows(
  viewItems: CircularViewItem[],
  includeCategoryHeaders: boolean
): CircularDisplayRow[] {
  if (!includeCategoryHeaders) {
    return viewItems.map((item, idx) => ({
      kind: 'item',
      item,
      serialNum: item.serial !== undefined && item.serial !== '' ? item.serial : idx + 1
    }));
  }

  const orderedCategories: string[] = [];
  const byCategory = new Map<string, Array<{ item: CircularViewItem; origIdx: number }>>();

  viewItems.forEach((item, idx) => {
    const cat = String(item.category || 'General').trim() || 'General';
    if (!byCategory.has(cat)) {
      orderedCategories.push(cat);
      byCategory.set(cat, []);
    }
    byCategory.get(cat)!.push({ item, origIdx: idx });
  });

  const rows: CircularDisplayRow[] = [];
  orderedCategories.forEach((cat) => {
    const entries = byCategory.get(cat) || [];
    rows.push({ kind: 'cat', category: cat, count: entries.length });
    entries.forEach(({ item, origIdx }) => {
      rows.push({
        kind: 'item',
        item,
        serialNum: item.serial !== undefined && item.serial !== '' ? item.serial : origIdx + 1
      });
    });
  });
  return rows;
}

function splitRowsBalancedIntoColumns(
  rows: CircularDisplayRow[],
  colCount: number,
  tier: CircularDensityTier
): { columns: CircularDisplayRow[][]; maxColHeight: number } {
  if (colCount <= 1 || rows.length === 0) {
    const totalH =
      tier.theadH +
      rows.reduce((sum, r) => sum + (r.kind === 'cat' ? tier.catH : tier.rowH), 0) +
      4;
    return { columns: [rows], maxColHeight: totalH };
  }

  const rowHeights = rows.map((r) => (r.kind === 'cat' ? tier.catH : tier.rowH));
  const totalRowHeight = rowHeights.reduce((a, b) => a + b, 0);
  const targetHeight = totalRowHeight / colCount;

  const columns: CircularDisplayRow[][] = [];
  let cursor = 0;

  for (let c = 0; c < colCount; c++) {
    if (c === colCount - 1) {
      columns.push(rows.slice(cursor));
      break;
    }

    const colRows: CircularDisplayRow[] = [];
    let accH = 0;
    const minRemaining = colCount - 1 - c;

    while (cursor < rows.length - minRemaining) {
      const nextH = rowHeights[cursor];
      if (colRows.length > 0 && accH + nextH * 0.55 > targetHeight) {
        break;
      }
      colRows.push(rows[cursor]);
      accH += nextH;
      cursor++;
    }

    // Avoid orphan category header at the very bottom of a column
    if (colRows.length > 1 && colRows[colRows.length - 1].kind === 'cat') {
      colRows.pop();
      cursor--;
    }

    columns.push(colRows);
  }

  let maxColHeight = 0;
  for (const col of columns) {
    const h =
      tier.theadH +
      col.reduce((sum, r) => sum + (r.kind === 'cat' ? tier.catH : tier.rowH), 0) +
      4;
    if (h > maxColHeight) maxColHeight = h;
  }

  return { columns, maxColHeight };
}

function computeBestCircularFitLayout(
  viewItems: CircularViewItem[],
  availW: number,
  availH: number,
  includeCategoryHeaders: boolean
): {
  cols: number;
  tier: CircularDensityTier;
  columns: CircularDisplayRow[][];
  fitsWithoutScroll: boolean;
} {
  const rows = buildCircularDisplayRows(viewItems, includeCategoryHeaders);
  const widthCap =
    availW < 640 ? 1 : availW < 980 ? 2 : availW < 1320 ? 3 : availW < 1680 ? 4 : 5;
  const itemCap = Math.max(1, Math.ceil(Math.max(1, viewItems.length) / 6));
  const maxCols = Math.min(widthCap, itemCap);

  for (const tier of CIRCULAR_DENSITY_TIERS) {
    for (let cols = 1; cols <= maxCols; cols++) {
      const split = splitRowsBalancedIntoColumns(rows, cols, tier);
      if (split.maxColHeight <= availH) {
        return {
          cols,
          tier,
          columns: split.columns,
          fitsWithoutScroll: true
        };
      }
    }
  }

  // Fallback: even if ultra-large list exceeds micro capacity on current screen height, use maxCols + micro tier
  const fallbackTier = CIRCULAR_DENSITY_TIERS[CIRCULAR_DENSITY_TIERS.length - 1];
  const fallbackSplit = splitRowsBalancedIntoColumns(rows, maxCols, fallbackTier);
  return {
    cols: maxCols,
    tier: fallbackTier,
    columns: fallbackSplit.columns,
    fitsWithoutScroll: fallbackSplit.maxColHeight <= availH
  };
}

export const PriceHistoryManager: React.FC<PriceHistoryManagerProps> = ({
  items,
  setItems,
  onOpenBulkUpdateModal,
  company,
  branches,
  onBack,
  onClose,
  onSyncCloud
}) => {
  const [activeTab, setActiveTab] = useState<'circulars' | 'manual_update'>('circulars');
  const [activeCircularModalItem, setActiveCircularModalItem] = useState<PriceListSnapshot | null>(null);
  const [circularViewSearch, setCircularViewSearch] = useState('');
  const [circularViewCategory, setCircularViewCategory] = useState('All');
  const [circularViewLayoutMode, setCircularViewLayoutMode] = useState<'fit_page' | 'detailed'>('fit_page');
  const circularContentAreaRef = React.useRef<HTMLDivElement | null>(null);
  const [circularContentSize, setCircularContentSize] = useState<{ width: number; height: number }>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth - 24 : 1200,
    height: typeof window !== 'undefined' ? Math.max(360, window.innerHeight - 135) : 680
  }));
  const [activePrintSnapshot, setActivePrintSnapshot] = useState<PriceListSnapshot | null>(null);
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);

  // Measure full-page circular view container dynamically so all items fit cleanly on one page
  useEffect(() => {
    if (!activeCircularModalItem) return;

    const updateSize = () => {
      const el = circularContentAreaRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setCircularContentSize({ width: rect.width - 16, height: rect.height - 12 });
          return;
        }
      }
      setCircularContentSize({
        width: Math.max(320, window.innerWidth - 24),
        height: Math.max(320, window.innerHeight - 135)
      });
    };

    const rafId = window.requestAnimationFrame(updateSize);
    window.addEventListener('resize', updateSize);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && circularContentAreaRef.current) {
      observer = new ResizeObserver(updateSize);
      observer.observe(circularContentAreaRef.current);
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateSize);
      observer?.disconnect();
    };
  }, [activeCircularModalItem, circularViewLayoutMode]);

  // Excel Import state
  const excelFileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [targetImportSnapshot, setTargetImportSnapshot] = useState<{
    id: string;
    effectiveDate: string;
    title?: string;
  } | null>(null);
  const [excelImportData, setExcelImportData] = useState<{
    isOpen: boolean;
    previewList: PriceUpdatePreviewEntry[];
    detectedDate: string;
    targetSnapshotId?: string | null;
  } | null>(null);

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Quick New Revision Modal State
  const [isCreatingCircular, setIsCreatingCircular] = useState(false);
  const [newCircularDate, setNewCircularDate] = useState('10.08.26');
  const [newCircularNotes, setNewCircularNotes] = useState('Price revision effective from date');
  const [newCircularAdjustmentPercent, setNewCircularAdjustmentPercent] = useState<number>(0);
  const [newCircularSetActive, setNewCircularSetActive] = useState(true);

  // Edit Snapshot Modal State
  const [isEditingCircular, setIsEditingCircular] = useState(false);
  const [editingSnapId, setEditingSnapId] = useState<string | null>(null);
  const [editCircularDate, setEditCircularDate] = useState('');
  const [editCircularNotes, setEditCircularNotes] = useState('');
  const [editCircularAdjustmentPercent, setEditCircularAdjustmentPercent] = useState<number>(0);
  const [editCircularSetActive, setEditCircularSetActive] = useState(false);

  // Load Snapshots deterministically
  const [snapshots, setSnapshots] = useState<PriceListSnapshot[]>(() => getPriceListSnapshots());

  // Listen for real-time snapshot & catalog item updates across tabs/cloud
  useEffect(() => {
    const handleSnapshotsUpdate = (e: any) => {
      if (e?.detail?.snapshots && Array.isArray(e.detail.snapshots)) {
        setSnapshots(normalizePriceSnapshots(e.detail.snapshots));
        return;
      }
      setSnapshots(getPriceListSnapshots());
    };
    const handleStorageChange = (e: StorageEvent) => {
      if (
        !e.key ||
        e.key === 'polycables_price_snapshots' ||
        e.key === 'polycables_price_history_lists' ||
        e.key === 'polycables_active_effective_date'
      ) {
        setSnapshots(getPriceListSnapshots());
      }
    };
    window.addEventListener('polycables_snapshots_updated', handleSnapshotsUpdate);
    window.addEventListener('polycables_price_snapshots_updated', handleSnapshotsUpdate);
    window.addEventListener('polycables_active_price_circular_changed', handleSnapshotsUpdate);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('polycables_snapshots_updated', handleSnapshotsUpdate);
      window.removeEventListener('polycables_price_snapshots_updated', handleSnapshotsUpdate);
      window.removeEventListener('polycables_active_price_circular_changed', handleSnapshotsUpdate);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Sync Master Item Directory strictly with active/single Price Update History list (or empty [] when none has items)
  useEffect(() => {
    const rec = reconcileCatalogItemsWithActiveSnapshot(items, snapshots);
    if (rec.changed) {
      if (rec.restoredIds.length > 0) {
        unrecordDeletedIdsLocally(rec.restoredIds);
      }
      setItems(rec.items);
      const specialList = rec.items.filter((i) => i.isSpecialItem);
      try {
        if (rec.items.length === 0) {
          localStorage.setItem('polycables_items_cleared', 'true');
        } else {
          localStorage.removeItem('polycables_items_cleared');
        }
        safeSetStorageItem('polycables_items', JSON.stringify(rec.items), rec.items);
        safeSetStorageItem('polycables_special_items', JSON.stringify(specialList), specialList);
        idbSaveFailoverData('polycables_items', rec.items).catch(() => {});
        idbSaveFailoverData('polycables_special_items', specialList).catch(() => {});
        window.dispatchEvent(new CustomEvent('polycables_items_updated', { detail: { items: rec.items } }));
      } catch {}
    }
  }, [snapshots, items]);

  // Sync active effective date
  const activeSnapshot = useMemo(() => {
    return snapshots.find((s) => s.isActive) || snapshots[0];
  }, [snapshots]);

  const activeEffectiveDate = activeSnapshot?.effectiveDate || '10.08.26';

  // Deduplicated pool of current + previous circular items (for Excel price import matching & unmatched resolution)
  const existingAndPreviousItems = useMemo(() => {
    const byId = new Map<string, Item>();
    const byNameCat = new Set<string>();
    const pushItem = (raw: any) => {
      if (!raw || raw.isSpecialItem) return;
      const name = String(raw.name || raw.itemName || raw.itemDescription || '').trim();
      if (!name) return;
      const cat = String(raw.category || 'Single Core Wires').trim();
      const id = String(raw.id || buildDeterministicItemId(raw.code, name, cat)).trim();
      const ncKey = `${name.toLowerCase()}::${cat.toLowerCase()}`;
      if ((id && byId.has(id)) || byNameCat.has(ncKey)) return;
      byId.set(id, { ...raw, id, name, category: cat });
      byNameCat.add(ncKey);
    };
    (Array.isArray(items) ? items : []).forEach(pushItem);
    (Array.isArray(snapshots) ? snapshots : []).forEach((s) => {
      (Array.isArray(s?.items) ? s.items : []).forEach((si) => pushItem(si));
    });
    return Array.from(byId.values());
  }, [items, snapshots]);

  // Handler to switch active price circular (strictly displays only targetSnap items in Master Item Directory)
  const handleActivateSnapshot = (snapId: string) => {
    const targetSnap = snapshots.find((s) => s.id === snapId);
    if (!targetSnap) return;

    const nowIso = getNextMonotonicSnapshotIso(snapshots);
    const targetSnapItems = toCompactSnapshotItems(Array.isArray(targetSnap.items) ? targetSnap.items : []);
    const activatedTargetSnap: PriceListSnapshot = {
      ...targetSnap,
      isActive: true,
      items: targetSnapItems,
      itemCount: targetSnapItems.length,
      activatedAt: nowIso,
      updatedAt: nowIso
    };

    const updatedSnapshots = savePriceListSnapshots(
      snapshots.map((s) =>
        s.id === snapId ? activatedTargetSnap : { ...s, isActive: false }
      ),
      { effectiveDate: targetSnap.effectiveDate, circularTitle: targetSnap.title }
    );

    setSnapshots(updatedSnapshots);

    // Seed metadata pool from existing items so preserved fields (openingStock, branchStock, etc.) carry across switches
    const rec = reconcileCatalogItemsWithActiveSnapshot(existingAndPreviousItems, updatedSnapshots, {
      activateExplicitly: true,
      targetSnapshot: activatedTargetSnap
    });
    const nextItemsForSync = rec.items;
    const specialList = nextItemsForSync.filter((i) => i.isSpecialItem);
    const itemsVer = Date.now();
    const clientId = typeof window !== 'undefined' ? (window as any).__polycablesClientSyncId : undefined;

    if (rec.changed || nextItemsForSync.length !== items.length) {
      if (rec.restoredIds.length > 0) {
        unrecordDeletedIdsLocally(rec.restoredIds);
        unrecordDeletedEntityIds(rec.restoredIds);
      }
      setItems(nextItemsForSync);
      try {
        if (nextItemsForSync.length === 0) {
          localStorage.setItem('polycables_items_cleared', 'true');
        } else {
          localStorage.removeItem('polycables_items_cleared');
        }
        safeSetStorageItem('polycables_items', JSON.stringify(nextItemsForSync), nextItemsForSync);
        safeSetStorageItem('polycables_special_items', JSON.stringify(specialList), specialList);
        idbSaveFailoverData('polycables_items', nextItemsForSync).catch(() => {});
        idbSaveFailoverData('polycables_special_items', specialList).catch(() => {});
        window.dispatchEvent(new CustomEvent('polycables_items_updated', { detail: { items: nextItemsForSync } }));
      } catch {}
    }

    fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        items: nextItemsForSync,
        specialItems: specialList,
        itemsVersion: itemsVer,
        itemsCleared: nextItemsForSync.length === 0,
        priceSnapshots: updatedSnapshots,
        activeEffectiveDate: targetSnap.effectiveDate,
        orderedCategories: getAllCategories(),
        categoryNumbers: getCategoryNumbers()
      })
    }).catch(() => {});

    onSyncCloud?.({
      priceSnapshots: updatedSnapshots,
      price_snapshots: updatedSnapshots,
      _replacePriceSnapshots: true,
      activeEffectiveDate: targetSnap.effectiveDate,
      items: nextItemsForSync,
      specialItems: nextItemsForSync.filter((i) => i.isSpecialItem),
      itemsVersion: Date.now(),
      _replaceItems: true,
      _itemsCleared: nextItemsForSync.length === 0
    }, true);
    emitErpNotification({
      title: `Price Circular Activated (${targetSnap.effectiveDate})`,
      message: `${targetSnapItems.length} items synced to Master Item Directory`,
      type: 'price'
    });
    showNotification(`Activated circular (${targetSnap.effectiveDate}) — ${targetSnapItems.length} items synced to Master Item Directory.`);
  };

  // Handler to open edit modal for a snapshot
  const handleStartEditCircular = (snap: PriceListSnapshot) => {
    setEditingSnapId(snap.id);
    setEditCircularDate(snap.effectiveDate);
    setEditCircularNotes(snap.notes || '');
    setEditCircularAdjustmentPercent(0);
    setEditCircularSetActive(snap.isActive);
    setIsEditingCircular(true);
  };

  // Delete confirmation modal state
  const [deleteConfirmSnap, setDeleteConfirmSnap] = useState<{ id: string; effectiveDate: string; title: string } | null>(null);

  // Handler to delete a price circular snapshot from the list
  const handleDeleteCircular = (snapId: string, effectiveDate: string) => {
    const targetSnap = snapshots.find((s) => s.id === snapId);
    setDeleteConfirmSnap({
      id: snapId,
      effectiveDate,
      title: targetSnap?.title || `Price Circular (${effectiveDate})`
    });
  };

  const confirmExecuteDeleteCircular = () => {
    if (!deleteConfirmSnap) return;
    const { id: snapId } = deleteConfirmSnap;
    const targetSnap = snapshots.find((s) => s.id === snapId);
    let remainingRaw = snapshots.filter((s) => s.id !== snapId);
    const nowIso = getNextMonotonicSnapshotIso(remainingRaw);
    if (targetSnap?.isActive && remainingRaw.length > 0) {
      remainingRaw = remainingRaw.map((s, idx) =>
        idx === 0 ? { ...s, isActive: true, activatedAt: nowIso, updatedAt: nowIso } : { ...s, isActive: false }
      );
    }
    const remaining = savePriceListSnapshots(remainingRaw);
    const activeAfter = remaining.find((s) => s.isActive) || (remaining.length === 1 ? remaining[0] : undefined);
    setSnapshots(remaining);

    // Reconcile Master Item Directory against remaining snapshots (clears to [] if no active list has items)
    const rec = reconcileCatalogItemsWithActiveSnapshot(items, remaining, {
      activateExplicitly: Boolean(activeAfter)
    });
    const nextCatalogItems = rec.items;
    if (rec.changed) {
      setItems(nextCatalogItems);
      const specialList = nextCatalogItems.filter((i) => i.isSpecialItem);
      try {
        if (nextCatalogItems.length === 0) {
          localStorage.setItem('polycables_items_cleared', 'true');
        } else {
          localStorage.removeItem('polycables_items_cleared');
        }
        safeSetStorageItem('polycables_items', JSON.stringify(nextCatalogItems), nextCatalogItems);
        safeSetStorageItem('polycables_special_items', JSON.stringify(specialList), specialList);
        idbSaveFailoverData('polycables_items', nextCatalogItems).catch(() => {});
        idbSaveFailoverData('polycables_special_items', specialList).catch(() => {});
        window.dispatchEvent(new CustomEvent('polycables_items_updated', { detail: { items: nextCatalogItems } }));
      } catch {}
    }

    // 1. Tombstone deleted snapshot ID locally
    try {
      recordDeletedEntityId(snapId);
      const delRaw = localStorage.getItem('polycables_deleted_snapshot_ids');
      const delArr: string[] = delRaw ? JSON.parse(delRaw) : [];
      if (!delArr.includes(snapId)) delArr.push(snapId);
      localStorage.setItem('polycables_deleted_snapshot_ids', JSON.stringify(delArr));
      window.dispatchEvent(new Event('storage'));
    } catch {}

    // 2. Immediate backend API delete request
    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: (typeof window !== 'undefined' ? (window as any).__polycablesClientSyncId : undefined),
        ids: [snapId],
        type: 'price_snapshot'
      })
    }).catch(() => {});

    // 3. Sync patch to backend state & Firestore
    const itemsVer = Date.now();
    const specialAfterDelete = nextCatalogItems.filter((i) => i.isSpecialItem);
    const clientId = typeof window !== 'undefined' ? (window as any).__polycablesClientSyncId : undefined;
    if (rec.changed || remaining.length === 0) {
      fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          items: nextCatalogItems,
          specialItems: specialAfterDelete,
          itemsVersion: itemsVer,
          itemsCleared: nextCatalogItems.length === 0,
          priceSnapshots: remaining,
          ...(activeAfter?.effectiveDate ? { activeEffectiveDate: activeAfter.effectiveDate } : {}),
          orderedCategories: getAllCategories(),
          categoryNumbers: getCategoryNumbers()
        })
      }).catch(() => {});
    }

    const syncPatch = {
      priceSnapshots: remaining,
      price_snapshots: remaining,
      _replacePriceSnapshots: true,
      deletedEntityIds: [snapId],
      _forceEmpty: remaining.length === 0,
      ...(rec.changed ? {
        items: nextCatalogItems,
        specialItems: specialAfterDelete,
        itemsVersion: itemsVer,
        _replaceItems: true,
        _itemsCleared: nextCatalogItems.length === 0
      } : {}),
      ...(activeAfter?.effectiveDate ? { activeEffectiveDate: activeAfter.effectiveDate } : {})
    };
    onSyncCloud?.(syncPatch, true);

    showNotification(`Price circular "${deleteConfirmSnap.title}" deleted.`);
    setDeleteConfirmSnap(null);
  };

  // Handler to save edited circular
  const handleSaveEditedCircular = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSnapId || !editCircularDate.trim()) return;

    const snap = snapshots.find((s) => s.id === editingSnapId);
    if (!snap) return;

    const nowIso = getNextMonotonicSnapshotIso(snapshots);
    const effDateClean = formatDateDDMMYY(editCircularDate.trim()) || editCircularDate.trim();
    const multiplier = 1 + (editCircularAdjustmentPercent || 0) / 100;
    const baseItems = snap.items && snap.items.length > 0 ? snap.items : items;
    const updatedItems = toCompactSnapshotItems(
      baseItems.map((i) => ({
        ...i,
        rate: Math.round((Number(i.rate) || 0) * multiplier)
      }))
    );

    const updatedSnapshots = savePriceListSnapshots(
      snapshots.map((s) => {
        if (s.id === editingSnapId) {
          return {
            ...s,
            title: `Price List (${effDateClean})`,
            effectiveDate: effDateClean,
            notes: editCircularNotes.trim(),
            isActive: editCircularSetActive,
            items: updatedItems,
            itemCount: updatedItems.length,
            updatedAt: nowIso,
            activatedAt: editCircularSetActive ? nowIso : s.activatedAt
          };
        }
        if (editCircularSetActive) {
          return { ...s, isActive: false };
        }
        return s;
      }),
      editCircularSetActive ? { effectiveDate: effDateClean, circularTitle: `Price List (${effDateClean})` } : undefined
    );

    setSnapshots(updatedSnapshots);

    let nextCatalogItems = items;
    // If active, reconcile ALL active circular items into live catalog and record history
    if (editCircularSetActive) {
      const editedSnap = updatedSnapshots.find((s) => s.id === editingSnapId);
      const rec = reconcileCatalogItemsWithActiveSnapshot(items, updatedSnapshots, {
        activateExplicitly: true,
        targetSnapshot: editedSnap
      });
      nextCatalogItems = rec.items;
      if (rec.restoredIds.length > 0) {
        unrecordDeletedIdsLocally(rec.restoredIds);
        unrecordDeletedEntityIds(rec.restoredIds);
      }
      setItems(nextCatalogItems);
      try {
        const specialList = nextCatalogItems.filter((i) => i.isSpecialItem);
        localStorage.removeItem('polycables_items_cleared');
        localStorage.setItem('polycables_active_effective_date', effDateClean);
        safeSetStorageItem('polycables_items', JSON.stringify(nextCatalogItems), nextCatalogItems);
        safeSetStorageItem('polycables_special_items', JSON.stringify(specialList), specialList);
        idbSaveFailoverData('polycables_items', nextCatalogItems).catch(() => {});
        idbSaveFailoverData('polycables_special_items', specialList).catch(() => {});
        window.dispatchEvent(new CustomEvent('polycables_items_updated', { detail: { items: nextCatalogItems } }));
        window.dispatchEvent(new CustomEvent('polycables_active_price_circular_changed', {
          detail: { effectiveDate: effDateClean, circularTitle: `Price List (${effDateClean})` }
        }));
        fetch('/api/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: typeof window !== 'undefined' ? (window as any).__polycablesClientSyncId : undefined,
            items: nextCatalogItems,
            specialItems: specialList,
            itemsVersion: Date.now(),
            itemsCleared: false,
            priceSnapshots: updatedSnapshots,
            activeEffectiveDate: effDateClean,
            orderedCategories: getAllCategories(),
            categoryNumbers: getCategoryNumbers()
          })
        }).catch(() => {});
      } catch {}
    }

    onSyncCloud?.({
      priceSnapshots: updatedSnapshots,
      price_snapshots: updatedSnapshots,
      _replacePriceSnapshots: true,
      ...(editCircularSetActive ? {
        activeEffectiveDate: effDateClean,
        items: nextCatalogItems,
        specialItems: nextCatalogItems.filter((i) => i.isSpecialItem),
        itemsVersion: Date.now(),
        _replaceItems: true,
        _itemsCleared: false
      } : {})
    }, true);

    setIsEditingCircular(false);
    setEditingSnapId(null);
    showNotification(`Saved changes to circular (${effDateClean}).`);
  };

  // Create New Price Revision Circular
  const handleCreateCircular = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCircularDate.trim()) {
      showNotification('Please provide an effective date (e.g. 10.08.26).');
      return;
    }

    const nowIso = getNextMonotonicSnapshotIso(snapshots);
    const effDateClean = formatDateDDMMYY(newCircularDate.trim()) || newCircularDate.trim();
    const multiplier = 1 + (newCircularAdjustmentPercent || 0) / 100;
    const circularItems = toCompactSnapshotItems(
      items
        .filter((i) => !i.isSpecialItem)
        .map((i) => ({
          ...i,
          rate: Math.round((Number(i.rate) || 0) * multiplier)
        }))
    );

    const newSnap: PriceListSnapshot = {
      id: `snap_${Date.now()}`,
      title: `Price List (${effDateClean})`,
      effectiveDate: effDateClean,
      createdAt: nowIso,
      updatedAt: nowIso,
      activatedAt: newCircularSetActive ? nowIso : undefined,
      itemCount: circularItems.length,
      isActive: newCircularSetActive,
      notes: newCircularNotes.trim() || `Effective from ${effDateClean}`,
      items: circularItems
    } as PriceListSnapshot;

    let updatedSnapshotsRaw: PriceListSnapshot[];
    let nextCatalogItems = items;
    if (newCircularSetActive) {
      updatedSnapshotsRaw = [
        newSnap,
        ...snapshots.map((s) => ({ ...s, isActive: false }))
      ];
      const mapped = items.map((i) => {
        const newRate = Math.round((Number(i.rate) || 0) * multiplier);
        const currentHist = Array.isArray(i.priceHistory) ? i.priceHistory : [];
        const historyEntry: PriceHistoryEntry = {
          effectiveDate: effDateClean,
          rate: newRate,
          updatedAt: nowIso,
          notes: newCircularNotes.trim() || `Price Circular effective ${effDateClean}`
        };
        return {
          ...i,
          rate: newRate,
          effectiveDate: effDateClean,
          updatedAt: nowIso,
          priceHistory: [
            historyEntry,
            ...currentHist.filter((h) => h.effectiveDate !== effDateClean)
          ]
        };
      });
      nextCatalogItems = syncSpecialItemRatesWithBaseItems(mapped);
      setItems(nextCatalogItems);
      try {
        const specialList = nextCatalogItems.filter((i) => i.isSpecialItem);
        localStorage.setItem('polycables_active_effective_date', effDateClean);
        safeSetStorageItem('polycables_items', JSON.stringify(nextCatalogItems), nextCatalogItems);
        safeSetStorageItem('polycables_special_items', JSON.stringify(specialList), specialList);
        window.dispatchEvent(new CustomEvent('polycables_items_updated', { detail: { items: nextCatalogItems } }));
        window.dispatchEvent(new CustomEvent('polycables_active_price_circular_changed', {
          detail: { effectiveDate: effDateClean, circularTitle: newSnap.title }
        }));
      } catch {}
    } else {
      updatedSnapshotsRaw = [newSnap, ...snapshots];
    }

    const updatedSnapshots = savePriceListSnapshots(
      updatedSnapshotsRaw,
      newCircularSetActive ? { effectiveDate: effDateClean, circularTitle: newSnap.title } : undefined
    );
    setSnapshots(updatedSnapshots);
    const itemsVer = Date.now();
    const specialListAfterCreate = nextCatalogItems.filter((i) => i.isSpecialItem);
    if (newCircularSetActive) {
      try {
        localStorage.removeItem('polycables_items_cleared');
        fetch('/api/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: typeof window !== 'undefined' ? (window as any).__polycablesClientSyncId : undefined,
            items: nextCatalogItems,
            specialItems: specialListAfterCreate,
            itemsVersion: itemsVer,
            itemsCleared: nextCatalogItems.length === 0,
            priceSnapshots: updatedSnapshots,
            activeEffectiveDate: effDateClean,
            orderedCategories: getAllCategories(),
            categoryNumbers: getCategoryNumbers()
          })
        }).catch(() => {});
      } catch {}
    }

    onSyncCloud?.({
      priceSnapshots: updatedSnapshots,
      price_snapshots: updatedSnapshots,
      _replacePriceSnapshots: true,
      ...(newCircularSetActive ? {
        activeEffectiveDate: effDateClean,
        items: nextCatalogItems,
        specialItems: specialListAfterCreate,
        itemsVersion: itemsVer,
        _replaceItems: true,
        _itemsCleared: nextCatalogItems.length === 0
      } : {})
    }, true);

    setIsCreatingCircular(false);
    showNotification(`Created price circular (${effDateClean}).`);
  };

  const handlePrintPriceList = () => {
    setIsPrintPreviewOpen(true);
  };

  const handleExportPriceList = () => {
    exportPriceUpdateByEffectiveDate(items, activeEffectiveDate);
  };

  const handleExportSingleCircular = (snap: PriceListSnapshot) => {
    const snapItems: Item[] = snap.items && snap.items.length > 0
      ? snap.items.map((si) => ({
          id: si.id,
          code: si.code,
          name: si.name,
          category: si.category,
          unit: si.unit,
          rate: si.rate,
          openingStock: 0,
          effectiveDate: snap.effectiveDate
        }))
      : items.map((i) => ({ ...i, effectiveDate: snap.effectiveDate }));
    exportPriceUpdateByEffectiveDate(snapItems, snap.effectiveDate);
  };

  const triggerCircularImport = (snap?: PriceListSnapshot) => {
    if (snap) {
      setTargetImportSnapshot({
        id: snap.id,
        effectiveDate: snap.effectiveDate,
        title: snap.title
      });
    } else {
      setTargetImportSnapshot(null);
    }
    excelFileInputRef.current?.click();
  };

  const handleExcelFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const overrideDate = targetImportSnapshot?.effectiveDate || getTodayDDMMYY();
    try {
      const parsed = await parseXLSXForEffectiveDatePriceUpdate(file, existingAndPreviousItems, overrideDate);
      if (!parsed || parsed.previewList.length === 0) {
        showNotification('No valid item or price rows found in the uploaded file.');
        setTargetImportSnapshot(null);
        return;
      }
      setExcelImportData({
        isOpen: true,
        previewList: parsed.previewList,
        detectedDate: formatDateDDMMYY(parsed.detectedEffectiveDate || overrideDate) || getTodayDDMMYY(),
        targetSnapshotId: targetImportSnapshot?.id || null
      });
    } catch (err: any) {
      showNotification(`Failed to parse Excel file: ${err?.message || 'Invalid format'}`);
      setTargetImportSnapshot(null);
    } finally {
      if (excelFileInputRef.current) {
        excelFileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="cyber-glass-card rounded-2xl overflow-hidden font-sans text-white">
      {/* Hidden Excel File Input */}
      <input
        type="file"
        ref={excelFileInputRef}
        accept=".xlsx, .xls, .csv"
        onChange={handleExcelFileChange}
        className="hidden"
      />

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="bg-emerald-500/20 border-b border-emerald-400/35 text-emerald-200 px-4 py-2.5 text-xs font-bold flex items-center justify-between animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-emerald-200 hover:bg-emerald-500/20 p-1 rounded cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Banner - All in One Line */}
      <div className="cyber-glass-header text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap lg:flex-nowrap min-h-[52px]">
        <div className="flex items-center space-x-3 shrink-0">
          <div className="p-2 bg-cyan-500/20 border border-cyan-400/35 rounded-lg">
            <History className="w-4 h-4 text-cyan-300" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2 whitespace-nowrap">
              <span>Price Update History</span>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/35 text-[11px] px-2 py-0.5 rounded-full font-mono font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Active: {activeEffectiveDate}
              </span>
            </h2>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => {
              if (onOpenBulkUpdateModal) {
                onOpenBulkUpdateModal();
              } else {
                setIsCreatingCircular(true);
              }
            }}
            className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1 shadow-xs border border-purple-400/40 transition-colors cursor-pointer whitespace-nowrap"
            title="Bulk Price Update by Effective Date"
          >
            <TrendingUp className="w-3.5 h-3.5 text-purple-300" />
            <span>Bulk Price Update</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('manual_update')}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 border transition-colors shadow-2xs cursor-pointer whitespace-nowrap ${
              activeTab === 'manual_update'
                ? 'bg-amber-500 text-slate-950 font-black border-amber-400'
                : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border-amber-400/40'
            }`}
            title="Update Catalog Prices Manually"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Price Update</span>
          </button>

          <button
            type="button"
            onClick={() => triggerCircularImport()}
            className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1 shadow-xs border border-emerald-400/40 transition-colors cursor-pointer whitespace-nowrap"
            title="Import Price Update (.xlsx) while preserving previous price lists"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-300" />
            <span>Import (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCreatingCircular(true)}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-3 py-1.5 rounded-lg font-black flex items-center space-x-1 shadow-xs transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Circular</span>
          </button>

          <button
            type="button"
            onClick={handleExportPriceList}
            className="bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 px-3 py-1.5 rounded-lg font-medium flex items-center space-x-1 border border-cyan-500/30 transition-colors cursor-pointer whitespace-nowrap"
            title="Export Price Update with Previous Rate & Update Price (.xlsx)"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={handlePrintPriceList}
            className="bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 px-3 py-1.5 rounded-lg font-medium flex items-center space-x-1 border border-cyan-500/30 transition-colors cursor-pointer whitespace-nowrap"
            title="Print Price List"
          >
            <Printer className="w-3.5 h-3.5 text-cyan-300" />
            <span>Print</span>
          </button>

          {/* Back and Close buttons */}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 rounded-lg transition-colors cursor-pointer"
              title="Go Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/40 text-rose-200 rounded-lg transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center space-x-2 px-5 pt-3 bg-[#071824]/80 border-b border-cyan-500/25 text-xs font-bold overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('circulars')}
          className={`pb-2.5 px-3 border-b-2 flex items-center space-x-1.5 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'circulars'
              ? 'border-cyan-400 text-cyan-200 font-extrabold'
              : 'border-transparent text-slate-300 hover:text-white'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Price Circulars List ({snapshots.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('manual_update')}
          className={`pb-2.5 px-3 border-b-2 flex items-center space-x-1.5 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'manual_update'
              ? 'border-amber-400 text-amber-300 font-extrabold bg-amber-500/10 rounded-t'
              : 'border-transparent text-slate-300 hover:text-white'
          }`}
        >
          <Calendar className="w-3.5 h-3.5 text-amber-400" />
          <span>Manual Price Update</span>
        </button>
      </div>

      {/* TAB 1: PRICE CIRCULARS LIST */}
      {activeTab === 'circulars' && (
        <div className="p-5 space-y-3">
          {/* Import System Banner inside Price Circulars List */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0b2334]/80 border border-cyan-500/25 rounded-xl px-4 py-2.5 text-xs">
            <div className="flex items-center gap-2 text-slate-200">
              <Upload className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Import an Excel (.xlsx / .csv) Price Circular to populate an effective-date list. Active list items appear automatically in Master Item Directory.
              </span>
            </div>
            <button
              type="button"
              onClick={() => triggerCircularImport()}
              className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 rounded-lg font-bold flex items-center space-x-1.5 transition-colors cursor-pointer shrink-0"
              title="Import Price Update (.xlsx / .csv) while preserving previous price lists"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-300" />
              <span>Import List (.xlsx)</span>
            </button>
          </div>

          {snapshots.length === 0 ? (
            <div className="rounded-xl border border-dashed border-cyan-500/35 bg-[#071824]/70 p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center mx-auto text-cyan-300">
                <History className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white">No Price Circular List Found</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Master Item Directory remains empty until a Price Circular list with items is imported or created for an effective date.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => triggerCircularImport()}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs font-black flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import Price List (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingCircular(true)}
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg text-xs font-black flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Circular</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {snapshots.map((snap) => {
                const isActive = snap.isActive;
                const snapItemCount = Array.isArray(snap.items) ? snap.items.length : 0;
                return (
                  <div
                    key={snap.id}
                    className={`rounded-xl border p-3.5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isActive
                        ? 'bg-emerald-500/10 border-emerald-400/50 shadow-xs ring-1 ring-emerald-400/30'
                        : 'cyber-glass-subcard border-cyan-500/25 hover:border-cyan-400/45'
                    }`}
                  >
                    {/* Clean Date Display */}
                    <div className="flex items-center space-x-3.5">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg font-mono flex-shrink-0 ${
                        isActive ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40 shadow-xs' : 'bg-[#0b2334] text-cyan-300 border border-cyan-500/25'
                      }`}>
                        <Calendar className="w-5 h-5" />
                      </div>

                      <div className="flex items-center flex-wrap gap-2">
                        <span className="text-base font-black font-mono text-white tracking-tight">
                          {snap.effectiveDate}
                        </span>
                        {isActive ? (
                          <span className="bg-emerald-500/25 text-emerald-200 border border-emerald-400/40 text-[10px] font-bold px-2.5 py-0.5 rounded-full font-mono">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="bg-[#0b2334] text-slate-300 border border-cyan-500/25 text-[10px] font-semibold px-2.5 py-0.5 rounded-full font-mono">
                            Historical
                          </span>
                        )}
                        <span className="bg-[#081b28] text-cyan-200 border border-cyan-500/25 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono">
                          {snapItemCount} Items
                        </span>
                        {snap.title && snap.title !== `Price Circular Revision (${snap.effectiveDate})` && (
                          <span className="text-xs text-slate-300 font-medium hidden md:inline">
                            — {snap.title}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons: Activate, Import, Edit, Export, Print, View, Delete */}
                    <div className="flex items-center flex-wrap gap-1.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-cyan-500/20">
                      {!isActive && (
                        <button
                          type="button"
                          onClick={() => handleActivateSnapshot(snap.id)}
                          className="px-2.5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg text-xs font-black transition-all shadow-xs cursor-pointer flex items-center space-x-1"
                          title="Set as active price circular"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Activate</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => triggerCircularImport(snap)}
                        className="px-2.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/35 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1"
                        title="Import items/prices (.xlsx) into this effective-date list"
                      >
                        <Upload className="w-3.5 h-3.5 text-emerald-300" />
                        <span>Import</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStartEditCircular(snap)}
                        className="px-2.5 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-400/35 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1"
                        title="Edit this price circular date & rates"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-amber-300" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportSingleCircular(snap)}
                        className="px-2.5 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1 border border-cyan-500/30"
                        title="Export this circular to Excel"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Export</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActivePrintSnapshot(snap);
                          setIsPrintPreviewOpen(true);
                        }}
                        className="px-2.5 py-1.5 bg-[#0e2d42] hover:bg-[#143b56] text-white border border-cyan-400/40 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1 shadow-2xs"
                        title="Print Circular Preview (White Background & Black Font)"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setCircularViewSearch('');
                          setCircularViewCategory('All');
                          setCircularViewLayoutMode('fit_page');
                          setActiveCircularModalItem(snap);
                        }}
                        className="px-2.5 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1 border border-cyan-500/30"
                        title="View Full-Page Price List (All Fit on One Page)"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteCircular(snap.id, snap.effectiveDate)}
                        className="px-2.5 py-1.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1 border border-rose-400/35"
                        title="Delete this price circular"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MANUAL PRICE UPDATE */}
      {activeTab === 'manual_update' && (
        <ManualPriceUpdateView
          items={items}
          setItems={setItems}
          snapshots={snapshots}
          setSnapshots={setSnapshots}
          activeEffectiveDate={activeEffectiveDate}
          onOpenExcelImport={() => triggerCircularImport()}
          onSuccessNotification={showNotification}
          onCancel={() => setActiveTab('circulars')}
          branches={branches}
          company={company}
          onSyncCloud={onSyncCloud}
        />
      )}

      {/* CREATE NEW CIRCULAR MODAL */}
      {isCreatingCircular && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030d14]/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 max-w-lg w-full overflow-hidden text-white">
            <div className="bg-[#0c2638]/90 border-b border-cyan-500/25 text-white p-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-cyan-300" />
                <h3 className="font-bold text-sm">Create New Price Revision Circular</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreatingCircular(false)}
                className="text-slate-300 hover:text-white hover:bg-cyan-500/15 p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCircular} className="p-5 space-y-4 text-xs">
              <div>
                <label className="font-bold text-cyan-200 block mb-1">
                  Effective Date (dd.mm.yy): <span className="text-rose-400">*</span>
                </label>
                <DateInputWithPicker
                  value={newCircularDate}
                  onChange={setNewCircularDate}
                  valueFormat="ddmmyy"
                  theme="dark"
                  required
                  inputClassName="p-2 text-white"
                />
              </div>

              <div>
                <label className="font-bold text-cyan-200 block mb-1">
                  Rate Adjustment (% Change from Current Rates):
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    step="any"
                    value={newCircularAdjustmentPercent}
                    onChange={(e) => setNewCircularAdjustmentPercent(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-24 bg-[#061520] border border-cyan-500/30 rounded-lg p-2 font-mono font-bold text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400 text-center"
                  />
                  <span className="text-slate-300">
                    % (Enter 0 to duplicate current rates, or e.g. +5 / -5)
                  </span>
                </div>
              </div>

              <div>
                <label className="font-bold text-cyan-200 block mb-1">Notes:</label>
                <textarea
                  rows={2}
                  value={newCircularNotes}
                  onChange={(e) => setNewCircularNotes(e.target.value)}
                  placeholder="Price revision notes..."
                  className="w-full bg-[#061520] border border-cyan-500/30 rounded-lg p-2 text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="bg-[#0b2334]/80 p-3 rounded-lg border border-cyan-500/25">
                <label className="flex items-center space-x-2 cursor-pointer font-bold text-slate-200">
                  <input
                    type="checkbox"
                    checked={newCircularSetActive}
                    onChange={(e) => setNewCircularSetActive(e.target.checked)}
                    className="rounded text-cyan-400 focus:ring-0"
                  />
                  <span>Make this the currently ACTIVE master price list immediately</span>
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-cyan-500/20">
                <button
                  type="button"
                  onClick={() => setIsCreatingCircular(false)}
                  className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 text-slate-200 rounded-lg font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg font-black shadow-md cursor-pointer flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Save & Apply Circular</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PRICE CIRCULAR MODAL */}
      {isEditingCircular && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030d14]/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-150 font-sans">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 max-w-lg w-full overflow-hidden text-white">
            <div className="bg-[#0c2638]/90 text-white p-4 flex items-center justify-between border-b border-cyan-500/25">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-amber-500/20 border border-amber-400/35 text-amber-300 rounded-lg">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Edit Price Circular</h3>
                  <p className="text-[11px] text-slate-300">Modify circular effective date and price values</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingCircular(false)}
                className="text-slate-300 hover:text-white hover:bg-cyan-500/15 p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditedCircular} className="p-5 space-y-4 text-xs">
              <div>
                <label className="font-bold text-cyan-200 block mb-1">
                  Effective Date (dd.mm.yy):
                </label>
                <DateInputWithPicker
                  value={editCircularDate}
                  onChange={setEditCircularDate}
                  valueFormat="ddmmyy"
                  theme="dark"
                  required
                  inputClassName="p-2 text-base text-white"
                />
              </div>

              <div>
                <label className="font-bold text-cyan-200 block mb-1">
                  Adjustment Percentage (% Change to Apply):
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    step="any"
                    value={editCircularAdjustmentPercent}
                    onChange={(e) => setEditCircularAdjustmentPercent(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-24 bg-[#061520] border border-cyan-500/30 rounded-lg p-2 font-mono font-bold text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400 text-center"
                  />
                  <span className="text-slate-300">
                    % (0 to keep current item rates, or e.g. +5 / -5)
                  </span>
                </div>
              </div>

              <div>
                <label className="font-bold text-cyan-200 block mb-1">Notes:</label>
                <textarea
                  rows={2}
                  value={editCircularNotes}
                  onChange={(e) => setEditCircularNotes(e.target.value)}
                  placeholder="Price revision notes..."
                  className="w-full bg-[#061520] border border-cyan-500/30 rounded-lg p-2 text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="bg-[#0b2334]/80 p-3 rounded-lg border border-cyan-500/25">
                <label className="flex items-center space-x-2 cursor-pointer font-bold text-slate-200">
                  <input
                    type="checkbox"
                    checked={editCircularSetActive}
                    onChange={(e) => setEditCircularSetActive(e.target.checked)}
                    className="rounded text-amber-400 focus:ring-0 cursor-pointer"
                  />
                  <span>Set as the ACTIVE master price circular</span>
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-cyan-500/20">
                <button
                  type="button"
                  onClick={() => setIsEditingCircular(false)}
                  className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 text-slate-200 rounded-lg font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg font-black shadow-md cursor-pointer flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW CIRCULAR RATES — FULL PAGE & ALL FIT ON ONE PAGE */}
      {activeCircularModalItem && (() => {
        const categoryOrder = getAllCategories();
        const rawViewItems = (activeCircularModalItem.items && activeCircularModalItem.items.length > 0
          ? activeCircularModalItem.items
          : items) as CircularViewItem[];
        const categoriesInCircular = Array.from(
          new Set(rawViewItems.map((it) => String(it.category || 'General').trim()).filter(Boolean))
        ).sort((a, b) => getCategorySerialRank(a, categoryOrder) - getCategorySerialRank(b, categoryOrder));
        const searchLower = circularViewSearch.trim().toLowerCase();
        const rawFilteredViewItems = rawViewItems.filter((it) => {
          const cat = String(it.category || 'General').trim();
          if (circularViewCategory !== 'All' && cat !== circularViewCategory) return false;
          if (!searchLower) return true;
          return (
            String(it.name || '').toLowerCase().includes(searchLower) ||
            String(it.code || '').toLowerCase().includes(searchLower) ||
            cat.toLowerCase().includes(searchLower) ||
            String(it.sizeSpec || '').toLowerCase().includes(searchLower) ||
            String(it.unit || '').toLowerCase().includes(searchLower)
          );
        });
        const filteredViewItems = groupItemsByCategoryOrder(rawFilteredViewItems as any, categoryOrder)
          .orderedItems as CircularViewItem[];

        const includeCatHeaders = circularViewCategory === 'All' && categoriesInCircular.length > 1;
        const fitLayout = computeBestCircularFitLayout(
          filteredViewItems,
          circularContentSize.width,
          circularContentSize.height,
          includeCatHeaders
        );
        const gridColsClass = CIRCULAR_GRID_CLASSES[fitLayout.cols] || 'grid-cols-1';
        const showCodeColInFit = fitLayout.cols <= 2;

        return (
          <div className="print-preview-modal-backdrop fixed inset-0 z-50 w-screen h-screen bg-[#061520] text-white flex flex-col overflow-hidden animate-in fade-in duration-150 print:static print:w-full print:h-auto print:bg-white print:text-black print:overflow-visible">
            {/* Compact Full-Page Top Header & Filter Controls */}
            <div className="bg-[#0c2638] border-b border-cyan-500/30 px-3 sm:px-5 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0 shadow-lg print:hidden">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setActiveCircularModalItem(null)}
                  className="px-2.5 py-1 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/35 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                  title="Back to Price Update History"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <div className="min-w-0">
                  <div className="flex items-center flex-wrap gap-1.5">
                    <h3 className="font-black text-sm sm:text-base text-white truncate">
                      {activeCircularModalItem.title || `Price List (${activeCircularModalItem.effectiveDate})`}
                    </h3>
                    {activeCircularModalItem.isActive ? (
                      <span className="bg-emerald-500/25 text-emerald-200 border border-emerald-400/40 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono">
                        ACTIVE
                      </span>
                    ) : (
                      <span className="bg-[#081b28] text-slate-300 border border-cyan-500/30 text-[10px] font-semibold px-2 py-0.5 rounded-full font-mono">
                        Historical
                      </span>
                    )}
                    <span className="text-[11px] text-cyan-200/90 font-mono font-semibold">
                      • {activeCircularModalItem.effectiveDate} • {filteredViewItems.length}/{rawViewItems.length} Items
                    </span>
                  </div>
                </div>
              </div>

              {/* Inline Search, Category Filter & Action Buttons */}
              <div className="flex items-center flex-wrap gap-1.5">
                <div className="relative w-44 sm:w-52">
                  <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={circularViewSearch}
                    onChange={(e) => setCircularViewSearch(e.target.value)}
                    placeholder="Filter items..."
                    className="w-full pl-8 pr-6 py-1 bg-[#061520] border border-cyan-500/35 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400"
                  />
                  {circularViewSearch && (
                    <button
                      type="button"
                      onClick={() => setCircularViewSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-[11px] cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <select
                  value={circularViewCategory}
                  onChange={(e) => setCircularViewCategory(e.target.value)}
                  className="px-2.5 py-1 bg-[#061520] border border-cyan-500/35 rounded-lg text-xs font-semibold text-white focus:outline-none focus:border-cyan-400 cursor-pointer max-w-[160px]"
                >
                  <option value="All">All Categories ({rawViewItems.length})</option>
                  {categoriesInCircular.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>

                {/* Fit-All-On-Page vs Detailed List Toggle */}
                <div className="flex items-center bg-[#061520] border border-cyan-500/35 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setCircularViewLayoutMode('fit_page')}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                      circularViewLayoutMode === 'fit_page'
                        ? 'bg-cyan-500 text-slate-950 font-black'
                        : 'text-slate-300 hover:text-white'
                    }`}
                    title="Fit all items cleanly on one single page"
                  >
                    <LayoutGrid className="w-3 h-3" />
                    <span>Fit 1 Page</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCircularViewLayoutMode('detailed')}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                      circularViewLayoutMode === 'detailed'
                        ? 'bg-cyan-500 text-slate-950 font-black'
                        : 'text-slate-300 hover:text-white'
                    }`}
                    title="View detailed single-column table"
                  >
                    <List className="w-3 h-3" />
                    <span>Detailed</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleExportSingleCircular(activeCircularModalItem)}
                  className="px-2.5 py-1 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/35 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Export this circular to Excel"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">Export</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1"
                  title="Print this 1-Page Sheet directly"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Print Sheet</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const snapToPrint = activeCircularModalItem;
                    setActiveCircularModalItem(null);
                    setActivePrintSnapshot(snapToPrint);
                    setIsPrintPreviewOpen(true);
                  }}
                  className="px-2.5 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg text-xs font-black cursor-pointer flex items-center gap-1 shadow-xs"
                  title="Open Stock & Valuation Print Preview"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Full Preview</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveCircularModalItem(null)}
                  className="p-1.5 bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/40 text-rose-200 rounded-lg transition-colors cursor-pointer"
                  title="Close Full-Page View"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Print-Only Compact Official Header */}
            <div className="hidden print:flex items-center justify-between border-b-2 border-black pb-1 mb-1.5 text-black px-1">
              <div>
                <div className="text-sm font-black uppercase leading-tight">
                  {company?.name || 'POLY CABLES INDUSTRIES LTD.'}
                </div>
                <div className="text-[10px] font-bold">
                  {activeCircularModalItem.title || `Price Circular (${activeCircularModalItem.effectiveDate})`}
                </div>
              </div>
              <div className="text-right text-[10px] font-bold font-mono">
                <div>Effective Date: {activeCircularModalItem.effectiveDate}</div>
                <div>Total Items: {filteredViewItems.length}</div>
              </div>
            </div>

            {/* Full-Page Body: Auto-Fit 1-Page Multi-Column Sheet or Detailed Table */}
            <div
              ref={circularContentAreaRef}
              className={`flex-1 min-h-0 bg-[#071824] px-2.5 py-1.5 print:p-0 print:bg-white print:overflow-visible ${
                circularViewLayoutMode === 'fit_page'
                  ? fitLayout.fitsWithoutScroll
                    ? 'overflow-hidden'
                    : 'overflow-y-auto'
                  : 'overflow-auto px-4 sm:px-6 py-3'
              }`}
            >
              {filteredViewItems.length === 0 ? (
                <div className="h-full flex items-center justify-center border border-cyan-500/25 rounded-xl bg-[#091e2c]/70 text-slate-400 text-xs">
                  No products match your current search or category filter.
                </div>
              ) : circularViewLayoutMode === 'fit_page' ? (
                <div className={`grid ${gridColsClass} gap-2 items-start w-full print:gap-1.5`}>
                  {fitLayout.columns.map((colRows, colIdx) => (
                    <div
                      key={colIdx}
                      className="border border-cyan-500/30 rounded-lg overflow-hidden bg-[#091e2c]/80 shadow-md print:border-black print:rounded-none print:bg-white"
                    >
                      <table className={`w-full text-left border-collapse table-fixed ${fitLayout.tier.fontClass} print:text-black`}>
                        <thead className={`bg-[#0c2638] text-cyan-200 font-bold uppercase border-b border-cyan-500/35 ${fitLayout.tier.headerFont} print:bg-slate-100 print:text-black print:border-black`}>
                          <tr>
                            <th className={`${fitLayout.tier.cellPad} w-8 text-center border-r border-cyan-500/20 print:border-slate-300`}>
                              SL
                            </th>
                            {showCodeColInFit && (
                              <th className={`${fitLayout.tier.cellPad} w-16 border-r border-cyan-500/20 print:border-slate-300`}>
                                Code
                              </th>
                            )}
                            <th className={`${fitLayout.tier.cellPad} border-r border-cyan-500/20 print:border-slate-300`}>
                              Item Name
                            </th>
                            <th className={`${fitLayout.tier.cellPad} w-11 text-center border-r border-cyan-500/20 print:border-slate-300`}>
                              Unit
                            </th>
                            <th className={`${fitLayout.tier.cellPad} w-[86px] text-right whitespace-nowrap`}>
                              Rate (৳)
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-cyan-500/15 print:divide-slate-300">
                          {colRows.map((row, rIdx) => {
                            if (row.kind === 'cat') {
                              return (
                                <tr
                                  key={`cat-${colIdx}-${rIdx}-${row.category}`}
                                  className="bg-[#0e2d42] text-cyan-200 font-black uppercase tracking-wide border-y border-cyan-400/30 print:bg-slate-200 print:text-black print:border-slate-400"
                                >
                                  <td
                                    colSpan={showCodeColInFit ? 5 : 4}
                                    className={`${fitLayout.tier.catPad} ${fitLayout.tier.catFontClass}`}
                                  >
                                    <div className="flex items-center justify-between gap-1 truncate">
                                      <span className="truncate">{row.category}</span>
                                      <span className="font-mono text-cyan-300/80 print:text-slate-700 shrink-0">
                                        ({row.count})
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            }

                            const item = row.item;
                            const rowTooltip = `${item.code ? `[${item.code}] ` : ''}${item.name}${
                              item.category ? ` • ${item.category}` : ''
                            }${item.sizeSpec ? ` • ${item.sizeSpec}` : ''}`;

                            return (
                              <tr
                                key={item.id || `${colIdx}-${rIdx}`}
                                title={rowTooltip}
                                className="hover:bg-cyan-500/[0.08] transition-colors"
                              >
                                <td className={`${fitLayout.tier.cellPad} text-center font-mono text-slate-400 whitespace-nowrap border-r border-cyan-500/15 print:text-black print:border-slate-200`}>
                                  {row.serialNum}
                                </td>
                                {showCodeColInFit && (
                                  <td className={`${fitLayout.tier.cellPad} font-mono font-bold text-cyan-300 truncate border-r border-cyan-500/15 print:text-black print:border-slate-200`}>
                                    {item.code || '—'}
                                  </td>
                                )}
                                <td className={`${fitLayout.tier.cellPad} font-semibold text-white truncate border-r border-cyan-500/15 print:text-black print:border-slate-200`}>
                                  {item.name}
                                </td>
                                <td className={`${fitLayout.tier.cellPad} text-center text-slate-300 truncate border-r border-cyan-500/15 print:text-black print:border-slate-200`}>
                                  {item.unit || 'Coils'}
                                </td>
                                <td className={`${fitLayout.tier.cellPad} text-right font-mono font-black text-emerald-300 whitespace-nowrap ${fitLayout.tier.rateClass} print:text-black`}>
                                  {Number(item.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="w-full border border-cyan-500/25 rounded-xl overflow-hidden bg-[#091e2c]/70 shadow-xl print:border-black print:rounded-none print:bg-white">
                  <table className="w-full text-left text-xs border-collapse print:text-black">
                    <thead className="bg-[#0c2638] text-cyan-200 font-bold uppercase text-[11px] sticky top-0 z-10 border-b border-cyan-500/30 print:bg-slate-100 print:text-black print:border-black">
                      <tr>
                        <th className="py-2 px-3 w-14 text-center">SL</th>
                        <th className="py-2 px-3 w-28">Code</th>
                        <th className="py-2 px-3">Item Name / Description</th>
                        <th className="py-2 px-3">Category</th>
                        <th className="py-2 px-3 hidden md:table-cell">Size / Spec</th>
                        <th className="py-2 px-3 text-center w-24">Unit</th>
                        <th className="py-2 px-3 text-right w-36">Rate (৳)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cyan-500/15 print:divide-slate-300">
                      {filteredViewItems.map((item, idx) => (
                        <tr key={item.id || idx} className="hover:bg-cyan-500/[0.07] transition-colors">
                          <td className="py-2 px-3 text-center font-mono text-slate-400 print:text-black">
                            {item.serial !== undefined && item.serial !== '' ? item.serial : idx + 1}
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-cyan-300 print:text-black">
                            {item.code || '—'}
                          </td>
                          <td className="py-2 px-3 font-bold text-white print:text-black">
                            {item.name}
                          </td>
                          <td className="py-2 px-3">
                            <span className="bg-[#0b2334] border border-cyan-500/20 text-cyan-200 px-2 py-0.5 rounded text-[11px] font-semibold print:bg-white print:text-black print:border-slate-300">
                              {item.category || 'General'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-300 hidden md:table-cell print:text-black">
                            {item.sizeSpec || '—'}
                          </td>
                          <td className="py-2 px-3 text-center text-slate-200 print:text-black">
                            {item.unit || 'Coils'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-black text-emerald-300 text-sm print:text-black">
                            ৳{Number(item.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Slim Full-Page Footer */}
            <div className="bg-[#0c2638] border-t border-cyan-500/30 px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0 print:hidden">
              <div className="flex items-center flex-wrap gap-3 text-slate-300 font-medium">
                <span>
                  Status:{' '}
                  <strong className={activeCircularModalItem.isActive ? 'text-emerald-300' : 'text-cyan-300'}>
                    {activeCircularModalItem.isActive ? 'ACTIVE' : 'Historical Snapshot'}
                  </strong>
                </span>
                <span>•</span>
                <span>
                  Effective Date: <strong className="text-white font-mono">{activeCircularModalItem.effectiveDate}</strong>
                </span>
                {circularViewLayoutMode === 'fit_page' && filteredViewItems.length > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-cyan-200 font-mono font-semibold">
                      {fitLayout.cols} {fitLayout.cols === 1 ? 'Column' : 'Columns'} •{' '}
                      {fitLayout.fitsWithoutScroll
                        ? `All ${filteredViewItems.length} Items Fitted on 1 Page`
                        : `Compact ${fitLayout.tier.name} View (${filteredViewItems.length} Items)`}
                    </span>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setActiveCircularModalItem(null)}
                className="px-3 py-1 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 text-slate-200 rounded-lg font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        );
      })()}

      {/* EXCEL IMPORT PREVIEW & CONFIRMATION MODAL */}
      {excelImportData && excelImportData.isOpen && (
        <PriceExcelImportModal
          isOpen={excelImportData.isOpen}
          onClose={() => {
            setExcelImportData(null);
            setTargetImportSnapshot(null);
          }}
          previewList={excelImportData.previewList as any}
          detectedEffectiveDate={excelImportData.detectedDate}
          targetSnapshotId={excelImportData.targetSnapshotId}
          items={items}
          previousItems={existingAndPreviousItems}
          setItems={setItems}
          snapshots={snapshots}
          setSnapshots={setSnapshots}
          branches={branches}
          onSuccessNotification={showNotification}
          onSyncCloud={onSyncCloud}
        />
      )}

      {/* MASTER ITEM & PRICE LIST PRINT PREVIEW MODAL (White background, Black Font, Sales Center Filter) */}
      {isPrintPreviewOpen && (
        <ItemPricePrintPreviewModal
          isOpen={isPrintPreviewOpen}
          onClose={() => {
            setIsPrintPreviewOpen(false);
            setActivePrintSnapshot(null);
          }}
          items={((activePrintSnapshot?.items && activePrintSnapshot.items.length > 0 ? activePrintSnapshot.items : items) as any)}
          company={company}
          branches={branches}
          effectiveDate={activePrintSnapshot?.effectiveDate || activeEffectiveDate}
          title={activePrintSnapshot?.title || "Master Item Directory & Price Circular"}
          initialCategory="All"
        />
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmSnap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#030d14]/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-md w-full border border-rose-400/35 overflow-hidden text-white">
            <div className="p-4 bg-rose-500/20 border-b border-rose-400/30 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-rose-300" />
                <h3 className="text-base font-bold text-rose-200">Delete Price Circular</h3>
              </div>
              <button
                type="button"
                onClick={() => setDeleteConfirmSnap(null)}
                className="text-rose-200 hover:bg-rose-500/20 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm font-semibold text-white">
                Are you sure you want to delete this price circular?
              </p>
              <div className="p-3 bg-[#071824] border border-cyan-500/25 rounded-lg text-xs space-y-1">
                <p className="font-bold text-white">{deleteConfirmSnap.title}</p>
                <p className="text-cyan-200 font-mono">Effective Date: {deleteConfirmSnap.effectiveDate}</p>
              </div>
              <p className="text-xs text-rose-300 font-medium">
                This circular will be removed from the Price Update History.
              </p>
            </div>
            <div className="p-4 bg-[#071824]/90 border-t border-cyan-500/20 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmSnap(null)}
                className="px-4 py-2 bg-[#081b28] border border-cyan-500/30 text-slate-200 font-bold text-xs rounded-lg hover:bg-[#0e2a3d] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmExecuteDeleteCircular}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg shadow-sm transition-colors cursor-pointer flex items-center space-x-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
