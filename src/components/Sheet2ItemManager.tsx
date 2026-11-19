import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Item, FactoryImportChallan, CompanyDetails, BranchLocation, StoredBill, Requisition, PriceListSnapshot } from '../types';
import { defaultBranches, defaultItems } from '../data/defaultData';
import {
  Plus,
  Trash2,
  Search,
  RotateCcw,
  Edit3,
  Save,
  Check,
  X,
  Database,
  RefreshCw,
  FileCheck,
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  EyeOff,
  Truck,
  FileText,
  Boxes,
  Tag,
  Layers,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  History,
  Sparkles,
  Calendar,
  FilterX,
  Printer,
  Building2,
  Palette,
  TrendingUp
} from 'lucide-react';
import {
  exportItemsToXLSX,
  parseXLSXToItemsWithDiagnostics,
  ExcelItemImportIssue,
  cleanItemNameDisplay,
  isCableSpecificationStart
} from '../utils/xlsxItemHelper';
import {
  parseXLSXToCategories,
  exportCategoriesToXLSX
} from '../utils/xlsxCategoryHelper';
import { BulkPriceUpdateModal } from './BulkPriceUpdateModal';
import { BulkItemUploadModal } from './BulkItemUploadModal';
import { FactoryImportManager } from './FactoryImportManager';
import { PriceHistoryManager } from './PriceHistoryManager';
import { PriceUpdateHistoryPage } from './PriceUpdateHistoryPage';
import { ItemPricePrintPreviewModal } from './ItemPricePrintPreviewModal';
import { CategoryListPrintPreviewModal } from './CategoryListPrintPreviewModal';
import { getPriceListSnapshots, normalizePriceSnapshots, savePriceListSnapshots, buildDeterministicItemId, syncActiveSnapshotWithCatalogItems, reconcileCatalogItemsWithActiveSnapshot } from '../utils/priceCircularHelper';
import { StockColorBreakdownModal } from './StockColorBreakdownModal';
import { matchesFlexibleSearch, sortItemsCategorySerialWise, groupItemsByCategoryOrder } from '../utils/searchHelper';
import { getAllCategories, getCategoryNumbers, getCategoryNumber, updateCategoryNumberAndName, saveCustomCategory, saveCategoryOrder, moveCategoryUp, moveCategoryDown, deleteCategory, categorizeCableItem } from '../utils/categoryHelper';
import { getItemOpeningStock, getItemFactoryImportQty, getItemTotalSales, getItemLiveStock, generateSpecialItemDisplayName, calculateSpecialItemRate, syncSpecialItemRatesWithBaseItems, resolveBaseItemForSpecialItem, formatItemNameWithCategoryIfDuplicate, getItemDisplayName, isItemActiveInBranch, getItemCoilMeters, getItemStockReturns, isItemNameMatch } from '../utils/stockHelper';
import { isSuperAdminOrAgm, isStrictSuperAdmin, isAnyAdmin, getUserBranch, getAdminBranches, isInCharge, isAccountsOrStaff } from '../utils/branchAccess';
import { moveToTrash, moveMultipleToTrash } from '../utils/trashHelper';
import {
  recordDeletedEntityId,
  recordDeletedEntityIds,
  unrecordDeletedEntityId,
  unrecordDeletedEntityIds,
  unrecordDeletedIdsLocally,
  getGlobalDeletedIds,
  isGloballyDeletedId,
  removeIdsFromAllTrashStorages
} from '../utils/deletedTracker';
import { AuthUser, StockReturnChallan, DeliveryChallan, ColorExchangeChallan } from '../types';
import { db, doc, setDoc } from '../firebase';
import { idbGetFailoverData, idbSaveFailoverData, safeSetStorageItem } from '../utils/indexedDbStorage';
import { checkCanTakeEntry } from '../utils/cloudConnection';

interface Sheet2ItemManagerProps {
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  factoryImports?: FactoryImportChallan[];
  setFactoryImports?: React.Dispatch<React.SetStateAction<FactoryImportChallan[]>>;
  stockReturns?: StockReturnChallan[];
  deliveryChallans?: DeliveryChallan[];
  colorExchanges?: ColorExchangeChallan[];
  company?: CompanyDetails;
  branches?: BranchLocation[];
  storedBills?: StoredBill[];
  setStoredBills?: React.Dispatch<React.SetStateAction<StoredBill[]>>;
  onResetItems: () => void;
  subTab?: 'items_list' | 'special_items' | 'categories' | 'price_history' | 'import_factory' | 'import_history' | 'trash';
  setSubTab?: (tab: 'items_list' | 'special_items' | 'categories' | 'price_history' | 'import_factory' | 'import_history' | 'trash') => void;
  currentUser?: AuthUser | null;
  requisitions?: Requisition[];
  setRequisitions?: React.Dispatch<React.SetStateAction<Requisition[]>>;
  onBack?: () => void;
  onClose?: () => void;
  onSyncCloud?: (slice: any, immediate?: boolean) => void;
}

export const Sheet2ItemManager: React.FC<Sheet2ItemManagerProps> = ({
  items,
  setItems,
  factoryImports = [],
  setFactoryImports = () => {},
  stockReturns = [],
  deliveryChallans = [],
  colorExchanges = [],
  company,
  branches = defaultBranches,
  storedBills = [],
  setStoredBills,
  onResetItems,
  subTab: propSubTab,
  setSubTab: propSetSubTab,
  currentUser,
  requisitions,
  setRequisitions,
  onBack,
  onClose,
  onSyncCloud
}) => {
  const effectiveBranches = (branches && branches.length > 0) ? branches : defaultBranches;
  const isSuperAdmin = isSuperAdminOrAgm(currentUser);
  const isPureSuperAdmin =
    (currentUser?.role as string) === 'super_admin' ||
    (currentUser?.role as string) === 'super admin' ||
    currentUser?.isSuperAdmin === true ||
    currentUser?.username?.toLowerCase() === 'suvroadmin' ||
    currentUser?.username?.toLowerCase() === 'suvro' ||
    (currentUser?.userRole || '').toLowerCase().includes('super_admin') ||
    (currentUser?.userRole || '').toLowerCase().includes('super admin');
  const isStrictSuper = isStrictSuperAdmin(currentUser) || isPureSuperAdmin;
  const isAdmin = !currentUser ||
    isSuperAdmin ||
    isAnyAdmin(currentUser) ||
    currentUser?.isSuperAdmin === true ||
    (currentUser?.role || '').toLowerCase().includes('admin') ||
    (currentUser?.userRole || '').toLowerCase().includes('admin');
  const userBranchInfo = useMemo(() => {
    return getUserBranch(currentUser, undefined, effectiveBranches);
  }, [currentUser, effectiveBranches]);
  
  // Scoping branches for current user: Regional Admin sees only his assigned sales centers, Super Admin sees all
  const allowedBranches = useMemo(() => {
    if (isStrictSuper) return effectiveBranches;
    let spList: any[] = [];
    try {
      const saved = localStorage.getItem('polycables_salespersons');
      if (saved) spList = JSON.parse(saved);
    } catch {}
    if (isAdmin) {
      // Regional Admin: only sees his assigned sales centers
      const adminBranches = getAdminBranches(currentUser, effectiveBranches, spList);
      if (adminBranches.length > 0) return adminBranches;
      if (userBranchInfo.branchId) {
        const fallback = effectiveBranches.filter((b) => b.id === userBranchInfo.branchId);
        if (fallback.length > 0) return fallback;
      }
      return effectiveBranches.slice(0, 1);
    }
    return effectiveBranches.filter((b) => b.id === userBranchInfo.branchId);
  }, [isStrictSuper, isAdmin, effectiveBranches, userBranchInfo.branchId, currentUser]);

  const isBranchLocked = !isAdmin;
  const initialBranchId = useMemo(() => {
    if (isBranchLocked) return userBranchInfo.branchId || 'branch-1';
    if (isStrictSuper) return 'ALL';
    return 'MY_ALL';
  }, [isBranchLocked, isStrictSuper]);

  const [selectedBranchId, setSelectedBranchId] = useState<string>(initialBranchId);

  const lastMasterItemsUserKeyRef = useRef<string>('');
  useEffect(() => {
    const userKey = `${currentUser?.username || ''}::${currentUser?.salespersonCode || ''}::${currentUser?.branchId || ''}::${currentUser?.role || ''}`;
    const userChanged = lastMasterItemsUserKeyRef.current !== '' && lastMasterItemsUserKeyRef.current !== userKey;
    lastMasterItemsUserKeyRef.current = userKey;

    if (isBranchLocked && userBranchInfo.branchId) {
      setSelectedBranchId(userBranchInfo.branchId);
    } else if (userChanged) {
      setSelectedBranchId(isStrictSuper ? 'ALL' : 'MY_ALL');
    } else if (isAdmin && !isStrictSuper && selectedBranchId === 'ALL') {
      setSelectedBranchId('MY_ALL');
    }
  }, [currentUser, isBranchLocked, userBranchInfo.branchId, isAdmin, isStrictSuper, selectedBranchId]);

  const activeBranchId = useMemo(() => {
    if (isBranchLocked) return userBranchInfo.branchId || 'branch-1';
    if (selectedBranchId === 'MY_ALL') {
      return allowedBranches.map((b) => b.id).join(',');
    }
    return selectedBranchId;
  }, [isBranchLocked, userBranchInfo.branchId, selectedBranchId, allowedBranches]);

  const activeBranch = useMemo(() => {
    if (selectedBranchId === 'MY_ALL' || selectedBranchId === 'ALL') return undefined;
    return effectiveBranches.find((b) => b.id === activeBranchId);
  }, [effectiveBranches, activeBranchId, selectedBranchId]);
  const activeBranchName = activeBranch?.name;
  // Rule: all showroom in-charge, marketing role, Showroom Staff, account open Master Item Directory read only mode.
  const isReadOnly = !isAdmin;
  // Rule: Import from factory and import from factory list page open for in-charge, sales center staff and account roles.
  const isShowroomInCharge = isInCharge(currentUser, undefined, effectiveBranches);
  const isStaffOrAccountsUser = isAccountsOrStaff(currentUser);
  const canAccessImportFactory = isAdmin || isShowroomInCharge || isStaffOrAccountsUser;

  const [localSubTab, setLocalSubTab] = useState<'items_list' | 'special_items' | 'categories' | 'price_history' | 'import_factory' | 'import_history'>('items_list');
  const rawSubTab = (propSubTab === 'trash' ? 'items_list' : propSubTab) || localSubTab;
  // Import from Factory page is hidden per user request; redirect to items_list
  const subTab = (rawSubTab === 'import_factory' || (!canAccessImportFactory && rawSubTab === 'import_history'))
    ? 'items_list'
    : (isReadOnly && (rawSubTab === 'categories' || rawSubTab === 'price_history') ? 'items_list' : rawSubTab);
  const setSubTab = (newTab: 'items_list' | 'special_items' | 'categories' | 'price_history' | 'import_factory' | 'import_history' | 'trash') => {
    if (newTab === 'trash') {
      window.dispatchEvent(new CustomEvent('polycables_navigate_tab', { detail: { tab: 'trash_bin' } }));
      return;
    }
    if (newTab === 'import_factory' || (!canAccessImportFactory && newTab === 'import_history')) return;
    if (isReadOnly && (newTab === 'categories' || newTab === 'price_history')) return;
    if (propSetSubTab) propSetSubTab(newTab as any);
    else setLocalSubTab(newTab as any);
  };
  const [showSpecialInfo, setShowSpecialInfo] = useState(false);
  const [showSyncItemNamesModal, setShowSyncItemNamesModal] = useState(false);

  // Scroll to top immediately when subTab changes so page never jumps up-down
  useEffect(() => {
    const mainEl = document.getElementById('main-content-area') || document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTop = 0;
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [subTab]);

  const handleSelectSubTab = (newTab: 'items_list' | 'special_items' | 'categories' | 'price_history' | 'import_factory' | 'import_history' | 'trash') => {
    setSubTab(newTab);
    const mainEl = document.getElementById('main-content-area') || document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTop = 0;
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };
  const [search, setSearch] = useState('');
  const [showOpeningStock, setShowOpeningStock] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Item | null>(null);
  const editRowRef = useRef<HTMLTableRowElement>(null);
  const editFormRef = useRef<Item | null>(null);
  editFormRef.current = editForm;
  const originalItemRef = useRef<Item | null>(null);
  const itemsRef = useRef<Item[]>(items);
  itemsRef.current = items;

  const [priceSnapshots, setPriceSnapshots] = useState<PriceListSnapshot[]>(() => getPriceListSnapshots());

  // Ensure every item in the ACTIVE Price Update History list is present, active, and visible in Master Item Directory
  useEffect(() => {
    let isCancelled = false;

    const applyReconcile = (snaps: PriceListSnapshot[]) => {
      const normalized = normalizePriceSnapshots(snaps);
      setPriceSnapshots(normalized);
      const rec = reconcileCatalogItemsWithActiveSnapshot(itemsRef.current, normalized);
      if (rec.changed) {
        if (rec.restoredIds.length > 0) {
          unrecordDeletedIdsLocally(rec.restoredIds);
        }
        itemsRef.current = rec.items;
        setItems(rec.items);
        const specialList = rec.items.filter((i) => i.isSpecialItem);
        try {
          if (rec.items.length === 0) {
            localStorage.setItem('polycables_items_cleared', 'true');
          } else {
            localStorage.removeItem('polycables_items_cleared');
          }
        } catch {}
        safeSetStorageItem('polycables_items', JSON.stringify(rec.items), rec.items);
        safeSetStorageItem('polycables_special_items', JSON.stringify(specialList), specialList);
        idbSaveFailoverData('polycables_items', rec.items).catch(() => {});
        idbSaveFailoverData('polycables_special_items', specialList).catch(() => {});
      }
    };

    const syncFromActiveCircular = (ev?: any) => {
      try {
        const nextSnaps =
          ev?.detail?.snapshots && Array.isArray(ev.detail.snapshots)
            ? ev.detail.snapshots
            : getPriceListSnapshots();
        applyReconcile(nextSnaps);

        // If localStorage had empty active items (e.g. cold reload under __idb_only failover), hydrate full snapshots from IndexedDB
        const curActive = nextSnaps.find((s: any) => s && s.isActive);
        const hasActiveItems = curActive && Array.isArray(curActive.items) && curActive.items.length > 0;
        if (!hasActiveItems && !(ev?.detail?.snapshots && Array.isArray(ev.detail.snapshots))) {
          idbGetFailoverData('polycables_price_snapshots')
            .then((idbSnaps) => {
              if (isCancelled || !Array.isArray(idbSnaps) || idbSnaps.length === 0) return;
              const normIdb = normalizePriceSnapshots(idbSnaps);
              const idbActive = normIdb.find((s) => s && s.isActive);
              if (idbActive && Array.isArray(idbActive.items) && idbActive.items.length > 0) {
                savePriceListSnapshots(normIdb, { dispatch: false });
                applyReconcile(normIdb);
              }
            })
            .catch(() => {});
        }
      } catch (err) {
        console.warn('Active circular catalog reconcile notice:', err);
      }
    };

    const handleStorageSnap = (e: StorageEvent) => {
      if (
        !e.key ||
        e.key === 'polycables_price_snapshots' ||
        e.key === 'polycables_price_history_lists' ||
        e.key === 'polycables_price_snapshots_cleared' ||
        e.key === 'polycables_active_effective_date'
      ) {
        syncFromActiveCircular();
      }
    };

    syncFromActiveCircular();
    window.addEventListener('polycables_snapshots_updated', syncFromActiveCircular);
    window.addEventListener('polycables_price_snapshots_updated', syncFromActiveCircular);
    window.addEventListener('polycables_active_price_circular_changed', syncFromActiveCircular);
    window.addEventListener('storage', handleStorageSnap);
    window.addEventListener('focus', syncFromActiveCircular);
    return () => {
      isCancelled = true;
      window.removeEventListener('polycables_snapshots_updated', syncFromActiveCircular);
      window.removeEventListener('polycables_price_snapshots_updated', syncFromActiveCircular);
      window.removeEventListener('polycables_active_price_circular_changed', syncFromActiveCircular);
      window.removeEventListener('storage', handleStorageSnap);
      window.removeEventListener('focus', syncFromActiveCircular);
    };
  }, [items]);

  const getClientSyncId = () =>
    typeof window !== 'undefined' ? (window as any).__polycablesClientSyncId : undefined;

  const getCategorySyncPayload = (overrideOrdered?: string[]) => {
    const ordered = overrideOrdered || getAllCategories();
    const categoryNumbers = getCategoryNumbers();
    let customCategories: string[] = [];
    let deletedCategories: string[] = [];
    try {
      const cc = localStorage.getItem('polycables_custom_categories');
      if (cc) {
        const parsed = JSON.parse(cc);
        if (Array.isArray(parsed)) customCategories = parsed;
      }
      const dc = localStorage.getItem('polycables_deleted_categories');
      if (dc) {
        const parsed = JSON.parse(dc);
        if (Array.isArray(parsed)) deletedCategories = parsed;
      }
    } catch {}
    return {
      orderedCategories: ordered,
      customCategories,
      deletedCategories,
      categoryNumbers,
      _replaceCategoryNumbers: true
    };
  };

  const persistCategoryOrderAndNumbersToApi = (catPayload: ReturnType<typeof getCategorySyncPayload>) => {
    fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: getClientSyncId(),
        items: itemsRef.current,
        specialItems: itemsRef.current.filter((it) => it.isSpecialItem),
        itemsVersion: Date.now(),
        itemsCleared: localStorage.getItem('polycables_items_cleared') === 'true',
        orderedCategories: catPayload.orderedCategories,
        customCategories: catPayload.customCategories,
        deletedCategories: catPayload.deletedCategories,
        categoryNumbers: catPayload.categoryNumbers
      })
    }).catch(() => {});
  };

  useEffect(() => {
    if (editingId) {
      originalItemRef.current = items.find((i) => i.id === editingId) || null;
    } else {
      originalItemRef.current = null;
    }
  }, [editingId, items]);

  // Auto-save edited item if user clicks outside or anywhere else
  useEffect(() => {
    if (!editingId) return;

    const handleClickOutsideItemEdit = (e: MouseEvent) => {
      if (editRowRef.current && !editRowRef.current.contains(e.target as Node)) {
        const cur = editFormRef.current;
        const orig = originalItemRef.current;
        if (cur && orig) {
          const isChanged =
            cur.name !== orig.name ||
            cur.rate !== orig.rate ||
            cur.unit !== orig.unit ||
            cur.category !== orig.category ||
            cur.sizeSpec !== orig.sizeSpec ||
            cur.code !== orig.code ||
            String(cur.serial ?? '') !== String(orig.serial ?? '') ||
            String(cur.serialNo ?? '') !== String(orig.serialNo ?? '') ||
            (cur as any).remarks !== (orig as any).remarks ||
            cur.stockMultiplier !== orig.stockMultiplier ||
            cur.baseItemId !== orig.baseItemId ||
            cur.openingStock !== orig.openingStock;

          if (isChanged) {
            const rawSerial = cur.serial !== undefined && cur.serial !== null ? String(cur.serial).trim() : '';
            const normalizedSerial = rawSerial === '' ? undefined : (/^\d+(?:\.\d+)?$/.test(rawSerial) ? parseFloat(rawSerial) : rawSerial);
            const finalOpening = Number(cur.openingStock) || 0;
            const finalForm: Item = {
              ...cur,
              serial: normalizedSerial,
              serialNo: normalizedSerial,
              order: typeof normalizedSerial === 'number' ? normalizedSerial : cur.order,
              openingStock: finalOpening,
              updatedAt: Date.now(),
              branchOpeningStock: {
                ...(cur.branchOpeningStock || {}),
                ...(activeBranchId && activeBranchId !== 'ALL'
                  ? { [activeBranchId]: finalOpening }
                  : { 'branch-1': finalOpening, 'branch-main': finalOpening })
              }
            };

            const updated = itemsRef.current.map((i) => (i.id === finalForm.id ? finalForm : i));
            setItems(updated);
            const specialList = updated.filter((it) => it.isSpecialItem);
            try {
              safeSetStorageItem('polycables_items', JSON.stringify(updated), updated);
              safeSetStorageItem('polycables_special_items', JSON.stringify(specialList), specialList);
              idbSaveFailoverData('polycables_items', updated).catch(() => {});
              idbSaveFailoverData('polycables_special_items', specialList).catch(() => {});
            } catch {}
            const syncedSnaps = syncActiveSnapshotWithCatalogItems(updated);
            const itemsVer = Date.now();
            const catSync = getCategorySyncPayload();
            const syncPayload: any = {
              items: updated,
              specialItems: specialList,
              ...catSync,
              itemsVersion: itemsVer,
              _replaceItems: true,
              _itemsCleared: updated.length === 0,
              ...(syncedSnaps ? { priceSnapshots: syncedSnaps, price_snapshots: syncedSnaps, _replacePriceSnapshots: true } : {})
            };

            fetch('/api/items', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                clientId: getClientSyncId(),
                items: updated,
                specialItems: specialList,
                itemsVersion: itemsVer,
                itemsCleared: updated.length === 0,
                orderedCategories: catSync.orderedCategories,
                customCategories: catSync.customCategories,
                deletedCategories: catSync.deletedCategories,
                categoryNumbers: catSync.categoryNumbers
              })
            }).catch(() => {});

            onSyncCloud?.(syncPayload, true);
            try {
              window.dispatchEvent(new CustomEvent('polycables_items_updated', {
                detail: { items: updated }
              }));
            } catch {}
            showNotification('success', `✓ Auto-saved changes to "${cur.name}".`);
          }
        }
        setEditingId(null);
        setEditForm(null);
      }
    };

    const handleTouchOutside = (e: TouchEvent) => handleClickOutsideItemEdit(e as unknown as MouseEvent);
    document.addEventListener('mousedown', handleClickOutsideItemEdit);
    document.addEventListener('touchstart', handleTouchOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideItemEdit);
      document.removeEventListener('touchstart', handleTouchOutside);
    };
  }, [editingId]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Dynamic Category State
  const [categoriesList, setCategoriesList] = useState<string[]>(() => getAllCategories());
  const [categoryNumbersMap, setCategoryNumbersMap] = useState<Record<string, number>>(() => getCategoryNumbers());
  const [editingCategoryKey, setEditingCategoryKey] = useState<string | null>(null);
  const [editCatNumberInput, setEditCatNumberInput] = useState<string>('');
  const [editCatNameInput, setEditCatNameInput] = useState<string>('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [selectedColorStockItem, setSelectedColorStockItem] = useState<Item | null>(null);

  // Category stock & count placeholder declared below after itemStockCache for O(1) lookup

  // Category-wise Manual Item Entry State
  const [categoryAddItemModal, setCategoryAddItemModal] = useState<{
    isOpen: boolean;
    category: string;
    name: string;
    serial: string;
    code: string;
    sizeSpec: string;
    unit: string;
    rate: number;
    openingStock: number;
  } | null>(null);

  const handleSaveCategoryWiseItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryAddItemModal || !categoryAddItemModal.name.trim()) return;
    if (!checkCanTakeEntry('Add Item', (msg) => showNotification('error', msg))) return;

    let enteredSerial = categoryAddItemModal.serial && categoryAddItemModal.serial.trim() !== ''
      ? (isNaN(Number(categoryAddItemModal.serial)) ? categoryAddItemModal.serial.trim() : Number(categoryAddItemModal.serial))
      : undefined;

    const cleanName = cleanItemNameDisplay(categoryAddItemModal.name.trim(), enteredSerial);
    if (enteredSerial === undefined && !isCableSpecificationStart(categoryAddItemModal.name)) {
      const m = categoryAddItemModal.name.match(/^0*(\d{1,4})(?:[.)\-])\s*(?=[a-zA-Z]|\d+\s*(?:x|\*|\/|\.|pair|rm|re|bya|sq|flexible|coils|mtr))/i);
      if (m && !/^\d+\.\d+\s*(rm|re|sq|mm)/i.test(categoryAddItemModal.name)) {
        enteredSerial = parseInt(m[1], 10);
      }
    }

    const baseCatTarget = categoryAddItemModal.category.trim() || 'Single Core Wires';
    const rawDetId = buildDeterministicItemId(categoryAddItemModal.code.trim(), cleanName || categoryAddItemModal.name.trim(), baseCatTarget);
    const newId = items.some((it) => it.id === rawDetId) ? `${rawDetId}-${Date.now()}` : rawDetId;
    const effectiveBranchStatus: Record<string, boolean> = {};
    effectiveBranches.forEach((b) => {
      effectiveBranchStatus[b.id] = true;
      effectiveBranchStatus[b.name] = true;
    });

    const targetCat = baseCatTarget;
    const updatedCats = saveCustomCategory(targetCat);
    setCategoriesList([...updatedCats]);

    const itemToAdd: Item = {
      id: newId,
      code: categoryAddItemModal.code.trim() || `PC-${100 + items.length + 1}`,
      name: cleanName || categoryAddItemModal.name.trim(),
      sizeSpec: categoryAddItemModal.sizeSpec.trim(),
      unit: categoryAddItemModal.unit || 'Coils',
      rate: parseFloat(String(categoryAddItemModal.rate)) || 0,
      openingStock: Number(categoryAddItemModal.openingStock) || 0,
      category: targetCat,
      serial: enteredSerial,
      serialNo: enteredSerial,
      order: typeof enteredSerial === 'number' ? enteredSerial : items.length + 1,
      isActive: true,
      branchActiveStatus: effectiveBranchStatus,
      effectiveDate: new Date().toISOString().slice(0, 10),
      hasExplicitStock: true,
      updatedAt: Date.now()
    };

    const nextItems = [...items, itemToAdd];
    setItems(nextItems);

    const specialList = nextItems.filter((it) => it.isSpecialItem);
    try {
      localStorage.removeItem('polycables_items_cleared');
      safeSetStorageItem('polycables_items', JSON.stringify(nextItems), nextItems);
      safeSetStorageItem('polycables_special_items', JSON.stringify(specialList), specialList);
      unrecordDeletedIdsLocally([itemToAdd.id, itemToAdd.code]);
      unrecordDeletedEntityIds([itemToAdd.id, itemToAdd.code]);
    } catch {}

    const syncedSnaps = syncActiveSnapshotWithCatalogItems(nextItems, { includeItemIds: [itemToAdd.id] });
    const syncPayload: any = {
      items: nextItems,
      specialItems: specialList,
      ...getCategorySyncPayload(updatedCats),
      itemsVersion: Date.now(),
      _itemsCleared: false,
      _replaceItems: true,
      restoredEntityIds: [itemToAdd.id, itemToAdd.code],
      ...(syncedSnaps ? { priceSnapshots: syncedSnaps, price_snapshots: syncedSnaps, _replacePriceSnapshots: true } : {})
    };

    // Immediate authoritative live sync to /api/sync and cloud
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: getClientSyncId(), patch: syncPayload })
    }).catch((err) => console.warn('[Category Item Sync Warning]:', err));

    onSyncCloud?.(syncPayload, true);

    try {
      window.dispatchEvent(new CustomEvent('polycables_items_updated', { detail: { items: nextItems } }));
    } catch {}

    showNotification('success', `✓ Successfully added item "${itemToAdd.name}" under category "${categoryAddItemModal.category}"!`);
    setCategoryAddItemModal(null);
  };

  // Live Category Listener across windows/tabs and remote Firestore events
  useEffect(() => {
    const handleCategoriesUpdate = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        setCategoriesList(e.detail);
      } else {
        setCategoriesList(getAllCategories());
      }
      setCategoryNumbersMap(getCategoryNumbers());
    };
    window.addEventListener('categories-updated', handleCategoriesUpdate);
    window.addEventListener('storage', handleCategoriesUpdate);
    return () => {
      window.removeEventListener('categories-updated', handleCategoriesUpdate);
      window.removeEventListener('storage', handleCategoriesUpdate);
    };
  }, []);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [unitFilter, setUnitFilter] = useState<'All' | 'Meters' | 'Coils' | 'Bobin'>('All');
  const [isBulkPriceUpdateOpen, setIsBulkPriceUpdateOpen] = useState(false);
  const [isBulkUploadModalOpen, setIsBulkUploadModalOpen] = useState(false);
  const [uploadTargetCategory, setUploadTargetCategory] = useState<string | null>(null);

  const handleToggleActiveStatus = (id: string) => {
    // Every user can toggle active/inactive status, but non-admins cannot edit/change item properties
    setItems((prev) => {
      const updated = prev.map((i) => {
        if (i.id === id) {
          if (activeBranchId && activeBranchId !== 'ALL') {
            const currentActive = isItemActiveInBranch(i, activeBranchId, activeBranchName);
            const nextActive = !currentActive;
            const bMap = { ...(i.branchActiveStatus || {}) };
            bMap[activeBranchId] = nextActive;
            if (activeBranchName) bMap[activeBranchName] = nextActive;
            return {
              ...i,
              branchActiveStatus: bMap,
              updatedAt: Date.now()
            };
          } else {
            const currentIsActive = i.isActive !== false;
            const nextActive = !currentIsActive;
            const bMap: Record<string, boolean> = {};
            effectiveBranches.forEach((b) => {
              bMap[b.id] = nextActive;
              bMap[b.name] = nextActive;
            });
            return {
              ...i,
              isActive: nextActive,
              branchActiveStatus: bMap,
              updatedAt: Date.now()
            };
          }
        }
        return i;
      });
      const specialList = updated.filter((it) => it.isSpecialItem);
      try {
        safeSetStorageItem('polycables_items', JSON.stringify(updated), updated);
        safeSetStorageItem('polycables_special_items', JSON.stringify(specialList), specialList);
      } catch {}
      onSyncCloud?.({
        items: updated,
        specialItems: specialList,
        itemsVersion: Date.now(),
        _replaceItems: true
      }, true);
      try {
        window.dispatchEvent(new CustomEvent('polycables_items_updated', {
          detail: { items: updated }
        }));
      } catch {}
      return updated;
    });
    showNotification('success', 'Item status updated.');
  };

  const handleResetWithPassword = () => {
    if (isReadOnly || !isPureSuperAdmin) return;
    const pwd = window.prompt('Enter Super Admin Password to Reset Default Items:');
    if (pwd === '1234' || pwd === 'admin') {
      if (window.confirm('Are you sure you want to reset all items to default?')) {
        onResetItems();
        showNotification('success', 'Master items reset to default.');
      }
    } else if (pwd !== null) {
      alert('Incorrect password! Reset default cancelled.');
    }
  };

  const handleAddNewCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryInput.trim()) return;
    if (!checkCanTakeEntry('Add Category', (msg) => showNotification('error', msg))) return;
    const updated = saveCustomCategory(newCategoryInput.trim());
    setCategoriesList([...updated]);
    setCategoryNumbersMap(getCategoryNumbers());
    const catPayload = getCategorySyncPayload(updated);
    persistCategoryOrderAndNumbersToApi(catPayload);
    onSyncCloud?.(catPayload, true);
    showNotification('success', `Category "${newCategoryInput.trim()}" added successfully!`);
    setNewCategoryInput('');
    setIsAddingCategory(false);
  };

  const handleStartEditCategory = (catName: string, index: number) => {
    if (isReadOnly) return;
    const curNum = getCategoryNumber(catName, index);
    setEditingCategoryKey(catName);
    setEditCatNumberInput(String(curNum));
    setEditCatNameInput(catName);
  };

  const handleSaveCategoryEdit = (oldCatName: string) => {
    if (isReadOnly) return;
    if (!checkCanTakeEntry('Edit Category', (msg) => showNotification('error', msg))) return;
    const cleanedName = editCatNameInput.trim();
    if (!cleanedName) {
      showNotification('error', 'Category name cannot be empty.');
      return;
    }
    const parsedNum = parseFloat(editCatNumberInput);
    const finalNum = !isNaN(parsedNum) && parsedNum > 0 ? parsedNum : 1;

    const result = updateCategoryNumberAndName(oldCatName, finalNum, cleanedName);
    setCategoriesList([...result.ordered]);
    setCategoryNumbersMap({ ...result.numbers });
    setEditingCategoryKey(null);

    const oldLower = oldCatName.trim().toLowerCase();
    const renamed = oldLower !== cleanedName.toLowerCase();
    let updatedItems = itemsRef.current;
    if (renamed) {
      updatedItems = itemsRef.current.map((it) =>
        (it.category || '').trim().toLowerCase() === oldLower
          ? { ...it, category: cleanedName, updatedAt: Date.now() }
          : it
      );
      setItems(updatedItems);
      const spList = updatedItems.filter((i) => i.isSpecialItem);
      try {
        safeSetStorageItem('polycables_items', JSON.stringify(updatedItems), updatedItems);
        safeSetStorageItem('polycables_special_items', JSON.stringify(spList), spList);
        idbSaveFailoverData('polycables_items', updatedItems).catch(() => {});
        idbSaveFailoverData('polycables_special_items', spList).catch(() => {});
        window.dispatchEvent(new CustomEvent('polycables_items_updated', { detail: { items: updatedItems } }));
      } catch {}
    }

    const syncedSnaps = renamed ? syncActiveSnapshotWithCatalogItems(updatedItems) : null;
    const catPayload = getCategorySyncPayload(result.ordered);
    const itemsVer = Date.now();

    fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: getClientSyncId(),
        items: updatedItems,
        specialItems: updatedItems.filter((i) => i.isSpecialItem),
        itemsVersion: itemsVer,
        itemsCleared: localStorage.getItem('polycables_items_cleared') === 'true',
        orderedCategories: catPayload.orderedCategories,
        customCategories: catPayload.customCategories,
        deletedCategories: catPayload.deletedCategories,
        categoryNumbers: catPayload.categoryNumbers
      })
    }).catch(() => {});

    onSyncCloud?.({
      ...catPayload,
      ...(renamed ? {
        items: updatedItems,
        specialItems: updatedItems.filter((i) => i.isSpecialItem),
        itemsVersion: itemsVer,
        _replaceItems: true
      } : {}),
      ...(syncedSnaps ? { priceSnapshots: syncedSnaps, price_snapshots: syncedSnaps, _replacePriceSnapshots: true } : {})
    }, true);

    showNotification('success', `Category #${finalNum} "${cleanedName}" updated!`);
  };

  const handleMoveCategoryUp = (index: number) => {
    const updated = moveCategoryUp(index);
    setCategoriesList([...updated]);
    setCategoryNumbersMap(getCategoryNumbers());
    const catPayload = getCategorySyncPayload(updated);
    persistCategoryOrderAndNumbersToApi(catPayload);
    onSyncCloud?.(catPayload, true);
    showNotification('success', 'Category sequence moved up!');
  };

  const handleMoveCategoryDown = (index: number) => {
    const updated = moveCategoryDown(index);
    setCategoriesList([...updated]);
    setCategoryNumbersMap(getCategoryNumbers());
    const catPayload = getCategorySyncPayload(updated);
    persistCategoryOrderAndNumbersToApi(catPayload);
    onSyncCloud?.(catPayload, true);
    showNotification('success', 'Category sequence moved down!');
  };

  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<string | null>(null);

  const handleDeleteCategory = (catName: string) => {
    if (!checkCanTakeEntry('Delete Category', (msg) => showNotification('error', msg))) return;
    setDeleteCategoryTarget(catName);
  };

  const confirmDeleteCategory = () => {
    if (!deleteCategoryTarget) return;
    const catName = deleteCategoryTarget;
    setDeleteCategoryTarget(null);
    const updated = deleteCategory(catName);
    setCategoriesList([...updated]);
    setCategoryNumbersMap(getCategoryNumbers());
    const catPayload = getCategorySyncPayload(updated);
    persistCategoryOrderAndNumbersToApi(catPayload);
    onSyncCloud?.(catPayload, true);
    showNotification('success', `Category "${catName}" deleted successfully.`);
  };

  const [isCategoryPrintModalOpen, setIsCategoryPrintModalOpen] = useState(false);
  const categoryImportFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleImportCategoriesXLSX = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!checkCanTakeEntry('Import Categories', (msg) => showNotification('error', msg))) {
      if (categoryImportFileInputRef.current) categoryImportFileInputRef.current.value = '';
      return;
    }

    try {
      const parsedCategories = await parseXLSXToCategories(file);
      if (parsedCategories.length === 0) {
        showNotification('error', 'No valid categories found in the Excel file. Please ensure the file has a category column.');
        return;
      }

      const existingLower = new Set(categoriesList.map((c) => c.trim().toLowerCase()));
      const newCategoriesToAdd = parsedCategories.filter((c) => !existingLower.has(c.trim().toLowerCase()));

      if (newCategoriesToAdd.length === 0) {
        showNotification('error', `All ${parsedCategories.length} categories from the Excel file already exist in your Category List.`);
        return;
      }

      const updated = [...categoriesList, ...newCategoriesToAdd];
      saveCategoryOrder(updated);
      setCategoriesList(updated);
      setCategoryNumbersMap(getCategoryNumbers());
      const catPayload = getCategorySyncPayload(updated);
      persistCategoryOrderAndNumbersToApi(catPayload);
      onSyncCloud?.(catPayload, true);
      showNotification(
        'success',
        `🎉 Successfully imported ${newCategoriesToAdd.length} new categories from Excel! (${parsedCategories.length - newCategoriesToAdd.length} already existed)`
      );
    } catch (err: any) {
      console.error('Category Excel Import Error:', err);
      showNotification('error', `Failed to parse Excel file: ${err?.message || 'Unknown error'}`);
    } finally {
      if (categoryImportFileInputRef.current) {
        categoryImportFileInputRef.current.value = '';
      }
    }
  };

  // Trash Bin State
  const [trashedItems, setTrashedItems] = useState<Item[]>(() => {
    try {
      const saved = localStorage.getItem('polycables_trashed_items');
      const parsed = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(parsed)) return [];
      const seen = new Set<string>();
      return parsed.filter((it: any) => {
        if (!it || !it.id) return false;
        const id = String(it.id).trim();
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    } catch {
      return [];
    }
  });


  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const singleItemInputRef = useRef<HTMLInputElement | null>(null);

  // Single Item Backup / Export handler
  const handleExportSingleItem = (item: Item) => {
    try {
      const singlePayload = {
        app: 'PolyCablesERP',
        packageType: 'single_item_backup',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        item
      };
      const blob = new Blob([JSON.stringify(singlePayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeName = (item.name || 'item').replace(/[^a-zA-Z0-9_-]/g, '_');
      link.download = `backup_item_${item.code || safeName}_${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      showNotification('success', `✓ Single item "${item.name}" exported successfully!`);
    } catch (err: any) {
      showNotification('error', 'Failed to export single item: ' + err?.message);
    }
  };

  // Single Item Restore handler
  const handleRestoreSingleItemFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        let targetItem: Item | null = null;
        if (parsed?.packageType === 'single_item_backup' && parsed?.item) {
          targetItem = parsed.item;
        } else if (parsed?.name && (parsed?.id || parsed?.code)) {
          targetItem = parsed;
        } else if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.name) {
          targetItem = parsed[0];
        } else if (parsed?.data?.items && Array.isArray(parsed.data.items) && parsed.data.items.length > 0) {
          targetItem = parsed.data.items[0];
        }

        if (targetItem && targetItem.name) {
          const restored = targetItem;
          try {
            localStorage.removeItem('polycables_items_cleared');
            if (restored.id) {
              unrecordDeletedIdsLocally([restored.id]);
            }
          } catch {}
          setItems((prev) => {
            const idx = prev.findIndex(
              (i) => i.id === restored.id || (i.name && restored.name && i.name.trim().toLowerCase() === restored.name.trim().toLowerCase())
            );
            let next: Item[];
            if (idx !== -1) {
              next = [...prev];
              next[idx] = { ...prev[idx], ...restored };
            } else {
              next = [...prev, restored];
            }
            const specialList = next.filter((i) => i.isSpecialItem);
            try {
              safeSetStorageItem('polycables_items', JSON.stringify(next), next);
              safeSetStorageItem('polycables_special_items', JSON.stringify(specialList), specialList);
            } catch {}
            onSyncCloud?.(
              {
                items: next,
                specialItems: specialList,
                ...getCategorySyncPayload(),
                itemsVersion: Date.now(),
                _replaceItems: true,
                _itemsCleared: false,
                ...(restored.id ? { restoredEntityIds: [restored.id] } : {})
              },
              true
            );
            return next;
          });
          showNotification('success', `✓ Single item "${targetItem.name}" restored successfully into catalog!`);
        } else {
          showNotification('error', 'Invalid single item backup file format.');
        }
      } catch (err: any) {
        showNotification('error', 'Failed to restore single item: ' + err?.message);
      }
      if (e.target) e.target.value = '';
    };
    reader.readAsText(file);
  };

  const [isAddingNew, setIsAddingNew] = useState(false);
  const [isSpecialItemType, setIsSpecialItemType] = useState(false);
  const [selectedBaseItemId, setSelectedBaseItemId] = useState<string>('');
  const [stockMultiplierInput, setStockMultiplierInput] = useState<number>(500);
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);

  const [customNewItemCategory, setCustomNewItemCategory] = useState('');
  const [newItem, setNewItem] = useState<Omit<Item, 'id'>>({
    code: 'PC-' + (items.length + 101),
    name: '',
    sizeSpec: '',
    unit: 'Coils',
    rate: 0,
    openingStock: 100,
    category: 'Single Core Wires',
    serial: ''
  });

  const [specialItemFilter, setSpecialItemFilter] = useState<'with' | 'without' | 'special_only'>('with');

  const standardItems = useMemo(() => {
    const seen = new Set<string>();
    return items.filter((i) => {
      if (!i || i.isSpecialItem) return false;
      const id = i.id ? String(i.id).trim() : '';
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [items]);

  const specialItems = useMemo(() => {
    const seen = new Set<string>();
    return items.filter((i) => {
      if (!i || !i.isSpecialItem) return false;
      const id = i.id ? String(i.id).trim() : '';
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [items]);

  const masterStandardSerialMap = useMemo(() => {
    const map = new Map<string, number>();
    const sorted = sortItemsCategorySerialWise(standardItems, categoriesList, 'serial_only');
    sorted.forEach((item, idx) => {
      map.set(item.id, idx + 1);
      if (item.code) map.set(item.code, idx + 1);
    });
    return map;
  }, [standardItems, categoriesList]);

  const masterAllSerialMap = useMemo(() => {
    const map = new Map<string, number>();
    const sorted = sortItemsCategorySerialWise(items, categoriesList, 'serial_only');
    sorted.forEach((item, idx) => {
      map.set(item.id, idx + 1);
      if (item.code) map.set(item.code, idx + 1);
    });
    return map;
  }, [items, categoriesList]);

  // Helper to get prioritized user-defined serial or fallback to master catalog order
  const getItemDisplaySerial = (item: Item, index: number): number | string => {
    if (item.serial !== undefined && item.serial !== null && item.serial !== '') {
      return item.serial;
    }
    if (item.serialNo !== undefined && item.serialNo !== null && item.serialNo !== '') {
      return item.serialNo;
    }
    if (subTab === 'special_items') {
      return index + 1;
    }
    return (specialItemFilter === 'without' ? masterStandardSerialMap.get(item.id) : masterAllSerialMap.get(item.id)) || index + 1;
  };

  // High-performance true O(N + M) single-pass stock memoization across all items & transactions
  const itemStockCache = useMemo(() => {
    const cache = new Map<string, {
      opening: number;
      live: number;
      linkedBobinsOpening: number;
      linkedCoilsOpening: number;
      linkedBobinsLive: number;
      linkedCoilsLive: number;
    }>();

    const targetBranchId = (activeBranchId || '').toLowerCase().trim();
    const targetBranchName = (activeBranchName || '').toLowerCase().trim();
    const targetBranchIds = targetBranchId.includes(',')
      ? targetBranchId.split(',').map((x) => x.trim()).filter(Boolean)
      : [targetBranchId];

    const matchesBranch = (chBranchId: string, chBranchName: string) => {
      if (!activeBranchId || activeBranchId === 'ALL') return true;
      return targetBranchIds.some((tId) => {
        if (!tId) return false;
        return (
          (chBranchId && (chBranchId === tId || chBranchId === targetBranchName)) ||
          (chBranchName && (chBranchName === targetNameLower(targetBranchName) || chBranchName === tId || chBranchName.includes(targetBranchName) || targetBranchName.includes(chBranchName))) ||
          (!chBranchId && !chBranchName && (tId === 'branch-1' || tId === 'branch-main' || targetBranchName.includes('madhupur')))
        );
      });
    };
    function targetNameLower(s: string) { return s; }

    const cleanStr = (s: string) => s.toLowerCase().replace(/[^\w\d]/g, ' ').replace(/\s+/g, ' ').trim();

    // 0. Single pass: Index all catalog items for O(1) line -> Item resolution
    const itemsById = new Map<string, Item>();
    const itemsByCode = new Map<string, Item[]>();
    const itemsByExactName = new Map<string, Item[]>();
    const itemsByCleanName = new Map<string, Item[]>();
    const specialItemById = new Map<string, Item>();
    const specialItemByCode = new Map<string, Item[]>();
    const specialItemByName = new Map<string, Item>();

    const pushBucket = (map: Map<string, Item[]>, k: string, it: Item) => {
      if (!k) return;
      const arr = map.get(k);
      if (arr) arr.push(it);
      else map.set(k, [it]);
    };

    for (const it of items) {
      if (!it || !it.id) continue;
      itemsById.set(it.id, it);
      if (it.code) pushBucket(itemsByCode, it.code.toLowerCase().trim(), it);
      const rawName = (it.name || '').toLowerCase().trim();
      const dispName = getItemDisplayName(it).toLowerCase().trim();
      if (rawName) {
        pushBucket(itemsByExactName, rawName, it);
        pushBucket(itemsByCleanName, cleanStr(rawName), it);
      }
      if (dispName && dispName !== rawName) {
        pushBucket(itemsByExactName, dispName, it);
        pushBucket(itemsByCleanName, cleanStr(dispName), it);
      }
      if (it.isSpecialItem) {
        specialItemById.set(it.id, it);
        if (it.name) specialItemByName.set(rawName, it);
      }
      if (it.baseItemCode) {
        pushBucket(specialItemByCode, it.baseItemCode.toLowerCase().trim(), it);
      }
    }

    const matchCache = new Map<string, string[]>();
    const resolveDirectMatchIds = (lIdRaw?: string, lCodeRaw?: string, lNameRaw?: string, allowCodeWhenHasId = false): string[] => {
      const lId = (lIdRaw || '').trim();
      const lCode = (lCodeRaw || '').toLowerCase().trim();
      const lName = (lNameRaw || '').toLowerCase().trim();
      const cacheKey = `${lId}::${lCode}::${lName}::${allowCodeWhenHasId ? 1 : 0}`;
      const cached = matchCache.get(cacheKey);
      if (cached) return cached;

      const matchedIds: string[] = [];
      const seenMatched = new Set<string>();

      if (lId && itemsById.has(lId)) {
        seenMatched.add(lId);
        matchedIds.push(lId);
      }
      if ((!lId || allowCodeWhenHasId) && lCode && itemsByCode.has(lCode)) {
        for (const it of itemsByCode.get(lCode)!) {
          if (seenMatched.has(it.id)) continue;
          const itemNormName = (it.name || '').toLowerCase().trim();
          const itemDisplayName = getItemDisplayName(it).toLowerCase().trim();
          if (!lName || isItemNameMatch(lName, itemNormName, itemDisplayName)) {
            seenMatched.add(it.id);
            matchedIds.push(it.id);
          }
        }
      }
      if (lName) {
        const tryList = (arr?: Item[]) => {
          if (!arr) return;
          for (const it of arr) {
            if (seenMatched.has(it.id)) continue;
            const itemNormName = (it.name || '').toLowerCase().trim();
            const itemDisplayName = getItemDisplayName(it).toLowerCase().trim();
            if (isItemNameMatch(lName, itemNormName, itemDisplayName)) {
              seenMatched.add(it.id);
              matchedIds.push(it.id);
            }
          }
        };
        tryList(itemsByExactName.get(lName));
        tryList(itemsByCleanName.get(cleanStr(lName)));
      }
      matchCache.set(cacheKey, matchedIds);
      return matchedIds;
    };

    const addQty = (map: Map<string, number>, id: string, qty: number) => {
      if (!qty) return;
      map.set(id, (map.get(id) || 0) + qty);
    };

    // 1. Single pass: Factory Imports
    const importByItemId = new Map<string, number>();
    const hasFactoryImports = Array.isArray(factoryImports) && factoryImports.length > 0;
    if (hasFactoryImports) {
      for (const challan of factoryImports) {
        if (!challan) continue;
        const chBranchId = (challan.branchId || '').toLowerCase().trim();
        const chBranchName = (challan.branchName || (challan as any).salesCenter || '').toLowerCase().trim();
        if (!matchesBranch(chBranchId, chBranchName)) continue;
        if (!Array.isArray(challan.lines)) continue;

        for (const line of challan.lines) {
          const qty = Number(line.quantity) || 0;
          if (!qty) continue;
          const matchedIds = resolveDirectMatchIds(line.itemId, line.itemCode, line.itemName || (line as any).itemDescription);
          for (const mId of matchedIds) {
            addQty(importByItemId, mId, qty);
          }
        }
      }
    }

    // 2. Single pass: Sales from Stored Bills
    const salesByItemId = new Map<string, number>();
    const hasStoredBills = Array.isArray(storedBills) && storedBills.length > 0;
    if (hasStoredBills) {
      for (const bill of storedBills) {
        if (!bill || bill.isDraft || bill.header?.isDraft || bill.status === 'draft') continue;
        const isOffice = Boolean(
          bill.isOfficeBill ||
          bill.header?.isOfficeBill ||
          (bill as any).billType === 'office' ||
          (bill.header as any)?.billType === 'office' ||
          (bill as any).type === 'office' ||
          (bill.header as any)?.type === 'office' ||
          ((bill.header as any)?.billTitle && String((bill.header as any).billTitle).toLowerCase().includes('office'))
        );
        if (isOffice) continue;

        const billBranchId = (bill.header?.branchId || bill.branchId || '').toLowerCase().trim();
        const billBranchName = (bill.header?.branchName || bill.branchName || (bill as any).salesCenter || (bill.header as any)?.salesCenter || '').toLowerCase().trim();
        if (!matchesBranch(billBranchId, billBranchName)) continue;
        if (!Array.isArray(bill.lines)) continue;

        for (const line of bill.lines) {
          const qty = Number(line.coilQty) || 0;
          if (!qty) continue;
          const lineDesc = line.itemDescription || line.itemName || '';
          const matchedIds = resolveDirectMatchIds(line.itemId, line.itemCode, lineDesc);
          const matchedSet = new Set(matchedIds);
          for (const mId of matchedIds) {
            addQty(salesByItemId, mId, qty);
          }
          // Special item -> base item deduction when base item was not already directly matched
          if (line.baseItemId && !matchedSet.has(line.baseItemId)) {
            const mult = Number(line.stockMultiplier) || 1;
            addQty(salesByItemId, line.baseItemId, qty * mult);
          } else if (line.isSpecialItem && line.baseItemCode) {
            const bArr = itemsByCode.get(String(line.baseItemCode).toLowerCase().trim()) || [];
            const mult = Number(line.stockMultiplier) || 1;
            for (const bIt of bArr) {
              if (!matchedSet.has(bIt.id)) addQty(salesByItemId, bIt.id, qty * mult);
            }
          } else if (line.itemId) {
            const spIt = specialItemById.get(line.itemId) || (lineDesc ? specialItemByName.get(lineDesc.toLowerCase().trim()) : undefined);
            if (spIt && spIt.isSpecialItem && spIt.baseItemId && !matchedSet.has(spIt.baseItemId)) {
              const mult = Number(spIt.stockMultiplier) || 1;
              addQty(salesByItemId, spIt.baseItemId, qty * mult);
            }
          }
        }
      }
    }

    // 3. Single pass: Unbilled Delivery Challan dispatches (only when bills array is checked, matching getItemLiveStock)
    if (hasStoredBills && Array.isArray(deliveryChallans) && deliveryChallans.length > 0) {
      for (const challan of deliveryChallans) {
        if (!challan || (challan as any).isBilled || challan.status === 'billed') continue;
        const chBranchId = (challan.branchId || (challan as any).header?.branchId || '').toLowerCase().trim();
        const chBranchName = (challan.branchName || (challan as any).branch || (challan as any).salesCenter || '').toLowerCase().trim();
        if (!matchesBranch(chBranchId, chBranchName)) continue;
        if (!Array.isArray(challan.lines)) continue;

        for (const line of challan.lines) {
          const unbilledQty = line.dueQty !== undefined
            ? Number(line.dueQty) || 0
            : Math.max(0, (Number(line.coilQty) || 0) - (Number(line.billedQty) || 0));
          if (unbilledQty <= 0) continue;

          const lDesc = (line.itemDescription || line.itemName || '').trim().toLowerCase();
          const lCode = (line.itemCode || '').trim().toLowerCase();
          const matchedSet = new Set<string>();
          if (line.itemId && itemsById.has(line.itemId)) matchedSet.add(line.itemId);
          if (lDesc) {
            for (const it of (itemsByExactName.get(lDesc) || [])) matchedSet.add(it.id);
          }
          if (lCode) {
            for (const it of (itemsByCode.get(lCode) || [])) matchedSet.add(it.id);
          }
          for (const mId of matchedSet) {
            addQty(salesByItemId, mId, unbilledQty);
          }
          if (line.baseItemId && !matchedSet.has(line.baseItemId)) {
            const mult = Number(line.stockMultiplier) || 1;
            addQty(salesByItemId, line.baseItemId, unbilledQty * mult);
          } else if (line.isSpecialItem && line.baseItemCode) {
            const bArr = itemsByCode.get(String(line.baseItemCode).toLowerCase().trim()) || [];
            const mult = Number(line.stockMultiplier) || 1;
            for (const bIt of bArr) {
              if (!matchedSet.has(bIt.id)) addQty(salesByItemId, bIt.id, unbilledQty * mult);
            }
          } else if (line.itemId) {
            const spIt = specialItemById.get(line.itemId);
            if (spIt && spIt.isSpecialItem && spIt.baseItemId && !matchedSet.has(spIt.baseItemId)) {
              const mult = Number(spIt.stockMultiplier) || 1;
              addQty(salesByItemId, spIt.baseItemId, unbilledQty * mult);
            }
          }
        }
      }
    }

    // 4. Single pass: Stock Returns
    const partyReturnByItemId = new Map<string, number>();
    const factoryReturnByItemId = new Map<string, number>();
    if (Array.isArray(stockReturns) && stockReturns.length > 0) {
      for (const sr of stockReturns) {
        if (!sr) continue;
        const srBranchId = (sr.branchId || (sr as any).header?.branchId || '').toLowerCase().trim();
        const srBranchName = (sr.branchName || (sr as any).salesCenter || '').toLowerCase().trim();
        if (!matchesBranch(srBranchId, srBranchName)) continue;

        const rType = String((sr as any).returnType || (sr as any).type || (sr as any).header?.returnType || '').toLowerCase().trim();
        const defaultIsParty = rType.includes('party') || rType.includes('customer') || rType === 'pr' || (!rType.includes('factory') && !rType.includes('fr'));
        if (!Array.isArray(sr.lines)) continue;

        for (const line of sr.lines) {
          const qty = Number(line.quantity || (line as any).coilQty || (line as any).qty) || 0;
          if (!qty) continue;
          const lineRType = String((line as any).returnType || '').toLowerCase().trim();
          const lineIsParty = lineRType ? (lineRType.includes('party') || lineRType.includes('customer')) : defaultIsParty;
          const matchedIds = resolveDirectMatchIds(line.itemId, line.itemCode, line.itemName || (line as any).itemDescription);
          for (const mId of matchedIds) {
            addQty(lineIsParty ? partyReturnByItemId : factoryReturnByItemId, mId, qty);
          }
        }
      }
    }

    // 5. Single pass: Color Exchanges
    const exchangeInByItemId = new Map<string, number>();
    const exchangeOutByItemId = new Map<string, number>();
    if (Array.isArray(colorExchanges) && colorExchanges.length > 0) {
      for (const ex of colorExchanges) {
        if (!ex) continue;
        const exBranchId = (ex.branchId || '').toLowerCase().trim();
        const exBranchName = (ex.branchName || '').toLowerCase().trim();
        if (!matchesBranch(exBranchId, exBranchName)) continue;
        if (!Array.isArray(ex.lines)) continue;

        for (const l of ex.lines) {
          const inEquiv = l.inCoilEquivalent !== undefined ? Number(l.inCoilEquivalent) || 0 : Number(l.inQty) || 0;
          if (inEquiv) {
            const inSet = new Set<string>();
            if (l.inItemId && itemsById.has(l.inItemId)) inSet.add(l.inItemId);
            if (l.inItemCode) {
              for (const it of (itemsByCode.get(l.inItemCode.toLowerCase().trim()) || [])) inSet.add(it.id);
            }
            if (l.inItemName) {
              for (const it of (itemsByExactName.get(l.inItemName.toLowerCase().trim()) || [])) inSet.add(it.id);
            }
            for (const mId of inSet) addQty(exchangeInByItemId, mId, inEquiv);
          }

          const outEquiv = l.outCoilEquivalent !== undefined ? Number(l.outCoilEquivalent) || 0 : Number(l.outQty) || 0;
          if (outEquiv) {
            const outSet = new Set<string>();
            if (l.outItemId && itemsById.has(l.outItemId)) outSet.add(l.outItemId);
            if (l.outItemCode) {
              for (const it of (itemsByCode.get(l.outItemCode.toLowerCase().trim()) || [])) outSet.add(it.id);
            }
            if (l.outItemName) {
              for (const it of (itemsByExactName.get(l.outItemName.toLowerCase().trim()) || [])) outSet.add(it.id);
            }
            for (const mId of outSet) addQty(exchangeOutByItemId, mId, outEquiv);
          }
        }
      }
    }

    // Pass 1: O(N) live & opening stock calculation using the pre-indexed maps
    const allowStaticFallback = !activeBranchId || activeBranchId === 'ALL' || activeBranchId === 'branch-1';
    const rawMap = new Map<string, { opening: number; live: number }>();
    for (const it of items) {
      if (!it || !it.id) continue;
      const op = getItemOpeningStock(it, activeBranchId, activeBranchName);

      const dynImport = importByItemId.get(it.id) || 0;
      const staticImport = (!hasFactoryImports && allowStaticFallback)
        ? Math.max(Number(it.addedStock) || 0, Number(it.importFactory) || 0)
        : 0;
      const imported = dynImport > 0 ? dynImport : staticImport;

      const sales = hasStoredBills
        ? (salesByItemId.get(it.id) || 0)
        : (!storedBills && allowStaticFallback ? (Number(it.totalSales) || 0) : 0);

      const dynPartyRet = partyReturnByItemId.get(it.id) || 0;
      const dynFactoryRet = factoryReturnByItemId.get(it.id) || 0;
      const partyReturn = dynPartyRet > 0 ? dynPartyRet : (allowStaticFallback ? (Number(it.returnParty) || 0) : 0);
      const factoryReturn = dynFactoryRet > 0 ? dynFactoryRet : (allowStaticFallback ? (Number(it.returnFactory) || 0) : 0);

      const exchangeIn = exchangeInByItemId.get(it.id) || 0;
      const exchangeOut = exchangeOutByItemId.get(it.id) || 0;

      const totalInflow = op + imported + partyReturn + exchangeIn;
      const lv = totalInflow === 0 ? 0 : (totalInflow - sales - factoryReturn - exchangeOut);
      rawMap.set(it.id, { opening: op, live: lv });
    }

    // Pass 2: calculate linked special items for base items using pre-indexed buckets
    const specialByBaseId = new Map<string, Item[]>();
    const specialByBaseCode = new Map<string, Item[]>();
    for (const s of specialItems) {
      if (!s) continue;
      if (s.baseItemId) {
        const arr = specialByBaseId.get(s.baseItemId) || [];
        arr.push(s);
        specialByBaseId.set(s.baseItemId, arr);
      }
      if (s.baseItemCode) {
        const cLow = s.baseItemCode.toLowerCase().trim();
        const arr = specialByBaseCode.get(cLow) || [];
        arr.push(s);
        specialByBaseCode.set(cLow, arr);
      }
    }

    for (const baseItem of items) {
      if (!baseItem || !baseItem.id) continue;
      const baseRaw = rawMap.get(baseItem.id) || { opening: 0, live: 0 };

      let linkedBobinsOpening = 0;
      let linkedCoilsOpening = 0;
      let linkedBobinsLive = 0;
      let linkedCoilsLive = 0;

      if (!baseItem.isSpecialItem) {
        const linkedSet = new Set<string>();
        const directList = specialByBaseId.get(baseItem.id) || [];
        const codeList = baseItem.code ? (specialByBaseCode.get(baseItem.code.toLowerCase().trim()) || []) : [];
        const candidateSpecials = [...directList, ...codeList];

        for (const s of candidateSpecials) {
          if (!s || linkedSet.has(s.id)) continue;
          linkedSet.add(s.id);
          const sRaw = rawMap.get(s.id) || { opening: 0, live: 0 };
          const mult = Number(s.stockMultiplier) || 5;
          linkedBobinsOpening += sRaw.opening;
          linkedCoilsOpening += sRaw.opening * mult;
          linkedBobinsLive += sRaw.live;
          linkedCoilsLive += sRaw.live * mult;
        }

        if (candidateSpecials.length === 0 && baseItem.name) {
          for (const s of specialItems) {
            if (!s || linkedSet.has(s.id)) continue;
            if (s.name && isItemNameMatch(s.name, baseItem.name, getItemDisplayName(baseItem))) {
              linkedSet.add(s.id);
              const sRaw = rawMap.get(s.id) || { opening: 0, live: 0 };
              const mult = Number(s.stockMultiplier) || 5;
              linkedBobinsOpening += sRaw.opening;
              linkedCoilsOpening += sRaw.opening * mult;
              linkedBobinsLive += sRaw.live;
              linkedCoilsLive += sRaw.live * mult;
            }
          }
        }
      }

      cache.set(baseItem.id, {
        opening: baseRaw.opening,
        live: baseRaw.live,
        linkedBobinsOpening,
        linkedCoilsOpening,
        linkedBobinsLive,
        linkedCoilsLive
      });
    }

    return cache;
  }, [items, specialItems, factoryImports, storedBills, stockReturns, deliveryChallans, colorExchanges, activeBranchId, activeBranchName]);

  // Fast O(N) category stock and count map reading directly from itemStockCache
  const { categoryStockMap, categoryCountMap } = useMemo(() => {
    const stockMap: Record<string, number> = {};
    const countMap: Record<string, number> = {};
    if (subTab !== 'categories') {
      return { categoryStockMap: stockMap, categoryCountMap: countMap };
    }
    for (let i = 0; i < items.length; i++) {
      const itm = items[i];
      const rawCat = (itm.category || '').trim();
      const effCat = rawCat || categorizeCableItem(itm.name, itm.sizeSpec);
      const effKey = effCat.trim().toLowerCase();
      if (!effKey) continue;

      const stock = itemStockCache.get(itm.id)?.live ?? 0;

      countMap[effKey] = (countMap[effKey] || 0) + 1;
      stockMap[effKey] = (stockMap[effKey] || 0) + stock;

      const cleanKey = effKey.replace(/[\s\-_()]+/g, ' ').trim();
      if (cleanKey && cleanKey !== effKey) {
        countMap[cleanKey] = (countMap[cleanKey] || 0) + 1;
        stockMap[cleanKey] = (stockMap[cleanKey] || 0) + stock;
      }
    }
    return { categoryStockMap: stockMap, categoryCountMap: countMap };
  }, [subTab, items, itemStockCache]);

  // Fast helper reading from cache
  const getLinkedSpecialBobinAndCoils = (baseItem: Item) => {
    const cached = itemStockCache.get(baseItem.id);
    if (cached) {
      return {
        linked: [],
        bobinsOpening: cached.linkedBobinsOpening,
        coilsOpening: cached.linkedCoilsOpening,
        bobinsLive: cached.linkedBobinsLive,
        coilsLive: cached.linkedCoilsLive
      };
    }
    return { linked: [], bobinsOpening: 0, coilsOpening: 0, bobinsLive: 0, coilsLive: 0 };
  };

  const activePriceSnapshot = useMemo(() => {
    if (!Array.isArray(priceSnapshots) || priceSnapshots.length === 0) return null;
    return priceSnapshots.find((s) => s && s.isActive) || (priceSnapshots.length === 1 ? priceSnapshots[0] : null);
  }, [priceSnapshots]);

  const activeCircularSnapItems = useMemo(() => {
    if (!activePriceSnapshot) return [];
    if (Array.isArray(activePriceSnapshot.items)) return activePriceSnapshot.items;
    if (Array.isArray((activePriceSnapshot as any).snapshotItems)) return (activePriceSnapshot as any).snapshotItems;
    if (Array.isArray((activePriceSnapshot as any).list)) return (activePriceSnapshot as any).list;
    return [];
  }, [activePriceSnapshot]);

  const targetList = useMemo(() => {
    // Special Item List is always permanently fixed
    if (subTab === 'special_items') {
      return sortItemsCategorySerialWise(specialItems, categoriesList, 'serial_only');
    }

    if (specialItemFilter === 'special_only') {
      return sortItemsCategorySerialWise(specialItems, categoriesList, 'serial_only');
    }

    // Strictly display ONLY items belonging to the active (or single) Price Update History list.
    // If no active list exists or it has no items, keep the Master Item Directory completely empty.
    if (!activePriceSnapshot || activeCircularSnapItems.length === 0) {
      return [];
    }

    const stdById = new Map<string, Item>();
    const stdByCode = new Map<string, Item[]>();
    const stdByNameCat = new Map<string, Item>();
    const stdByName = new Map<string, Item[]>();

    standardItems.forEach((it) => {
      if (it.id) stdById.set(String(it.id).trim(), it);
      const cLow = String(it.code || '').trim().toLowerCase();
      if (cLow) {
        const arr = stdByCode.get(cLow) || [];
        arr.push(it);
        stdByCode.set(cLow, arr);
      }
      const nLow = String(it.name || '').trim().toLowerCase();
      const catLow = String(it.category || '').trim().toLowerCase();
      if (nLow) {
        stdByNameCat.set(`${nLow}::${catLow}`, it);
        const arr = stdByName.get(nLow) || [];
        arr.push(it);
        stdByName.set(nLow, arr);
      }
    });

    const seenIds = new Set<string>();
    const circularResolvedItems: Item[] = [];
    const effDate = String(activePriceSnapshot.effectiveDate || '').trim();

    activeCircularSnapItems.forEach((snapIt: any, idx: number) => {
      if (!snapIt) return;
      const snapName = String(snapIt.name || snapIt.itemName || snapIt.itemDescription || snapIt.code || '').trim();
      if (!snapName) return;
      const sId = String(snapIt.id || '').trim();
      const sCode = String(snapIt.code || '').trim().toLowerCase();
      const sName = snapName.toLowerCase();
      const sCatRaw = String(snapIt.category || '').trim();
      const sCat = sCatRaw.toLowerCase();

      let matched =
        (sId ? stdById.get(sId) : undefined) ||
        (sName && sCat ? stdByNameCat.get(`${sName}::${sCat}`) : undefined);

      if (!matched && sCode) {
        const candidates = stdByCode.get(sCode) || [];
        matched =
          candidates.find((c) => !seenIds.has(c.id) && String(c.category || '').trim().toLowerCase() === sCat) ||
          candidates.find((c) => !seenIds.has(c.id));
      }
      if (!matched && sName) {
        const candidates = stdByName.get(sName) || [];
        matched = candidates.find((c) => !seenIds.has(c.id));
      }

      if (matched) {
        if (seenIds.has(matched.id)) return;
        seenIds.add(matched.id);
        const resolvedSerial =
          matched.serial !== undefined && matched.serial !== null && matched.serial !== ''
            ? matched.serial
            : (snapIt.serial ?? idx + 1);
        const resolvedCat =
          (!matched.category || matched.category.trim().toLowerCase() === 'general') && sCatRaw && sCat !== 'general'
            ? sCatRaw
            : matched.category;
        circularResolvedItems.push({
          ...matched,
          isActive: true,
          category: resolvedCat || categorizeCableItem(matched.name || snapName, matched.sizeSpec || snapIt.sizeSpec) || 'Single Core Wires',
          serial: resolvedSerial,
          serialNo: resolvedSerial,
          rate: snapIt.rate !== undefined && !isNaN(Number(snapIt.rate)) ? Number(snapIt.rate) : matched.rate,
          effectiveDate: effDate || matched.effectiveDate
        });
      } else {
        const fallbackId = sId || buildDeterministicItemId(snapIt.code, snapName, sCatRaw);
        if (seenIds.has(fallbackId)) return;
        seenIds.add(fallbackId);
        const resolvedSerial = snapIt.serial ?? idx + 1;
        const resolvedCat =
          sCatRaw && sCat !== 'general'
            ? sCatRaw
            : categorizeCableItem(snapName, snapIt.sizeSpec) || 'Single Core Wires';
        circularResolvedItems.push({
          id: fallbackId,
          code: String(snapIt.code || `PC-${100 + idx + 1}`),
          name: snapName,
          category: resolvedCat,
          unit: String(snapIt.unit || 'Coils'),
          rate: Number(snapIt.rate) || 0,
          openingStock: 0,
          isActive: true,
          serial: resolvedSerial,
          serialNo: resolvedSerial,
          ...(snapIt.sizeSpec ? { sizeSpec: snapIt.sizeSpec } : {}),
          ...(effDate ? { effectiveDate: effDate } : {})
        });
      }
    });

    if (specialItemFilter === 'with') {
      const activeBaseCodeSet = new Set(
        circularResolvedItems.map((ci) => String(ci.code || '').trim().toLowerCase()).filter(Boolean)
      );
      specialItems.forEach((sp) => {
        if (!sp || !sp.id || seenIds.has(sp.id)) return;
        const matchesBaseId = Boolean(sp.baseItemId && seenIds.has(sp.baseItemId));
        const matchesBaseCode = Boolean(sp.baseItemCode && activeBaseCodeSet.has(String(sp.baseItemCode).trim().toLowerCase()));
        if (matchesBaseId || matchesBaseCode) {
          seenIds.add(sp.id);
          circularResolvedItems.push(sp);
        }
      });
    }

    return sortItemsCategorySerialWise(circularResolvedItems, categoriesList, 'serial_only');
  }, [subTab, specialItems, specialItemFilter, standardItems, activePriceSnapshot, activeCircularSnapItems, categoriesList]);

  // Exact active item count matching the visible directory list (never lower than filteredItems.length)
  const activeItemCount = useMemo(() => {
    if (subTab === 'items_list' || !subTab) {
      return targetList.length;
    }
    if (subTab === 'special_items') {
      return specialItems.length;
    }
    return items.filter((i) => i.isActive !== false && !i.isSpecialItem).length;
  }, [subTab, targetList, specialItems.length, items]);

  const filteredItems = useMemo(() => {
    const matched = targetList.filter((i) => {
      if (categoryFilter !== 'All') {
        const cTarget = categoryFilter.trim().toLowerCase();
        let iCat = (i.category || '').trim().toLowerCase();
        if (!iCat) {
          iCat = categorizeCableItem(i.name, i.sizeSpec).trim().toLowerCase();
        }
        const cleanT = cTarget.replace(/[^a-z0-9]/g, '');
        const cleanI = iCat.replace(/[^a-z0-9]/g, '');
        const isMatch =
          iCat === cTarget ||
          (cleanT !== '' && cleanI === cleanT);
        if (!isMatch) return false;
      }
      if (subTab !== 'special_items') {
        if (statusFilter === 'Active' && i.isActive === false) return false;
        if (statusFilter === 'Inactive' && i.isActive !== false) return false;
      } else if (statusFilter === 'Inactive' && i.isActive !== false) {
        return false;
      }

      if (unitFilter !== 'All') {
        const u = (i.unit || '').trim().toLowerCase();
        if (unitFilter === 'Coils' && !u.includes('coil')) return false;
        if (unitFilter === 'Meters' && !u.includes('meter') && !u.includes('metre') && u !== 'm') return false;
        if (unitFilter === 'Bobin' && !u.includes('bobin')) return false;
      }

      if (!search.trim()) return true;
      const targetStr = `${i.name} ${i.code || ''} ${i.sizeSpec || ''} ${i.category || ''} ${i.unit || ''} ${(i as any).remarks || ''}`;
      return matchesFlexibleSearch(targetStr, search);
    });
    if (search.trim()) {
      return groupItemsByCategoryOrder(matched, categoriesList).orderedItems;
    }
    return matched;
  }, [targetList, subTab, categoryFilter, statusFilter, unitFilter, search, categoriesList]);

  // Pagination State for Master Item Directory - show all items cleanly with optional page size slices
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | 'all'>('all');

  useEffect(() => {
    setCurrentPage(1);
  }, [search, categoryFilter, statusFilter, unitFilter, specialItemFilter, subTab]);

  const totalFilteredCount = filteredItems.length;
  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(totalFilteredCount / pageSize));
  const paginatedItems = useMemo(() => {
    if (pageSize === 'all') return filteredItems;
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  const lastSpecialsJsonRef = useRef<string>('');
  // Keep special items storage synchronized with current catalog (including deletions)
  useEffect(() => {
    const specials = items.filter((i) => i.isSpecialItem);
    try {
      const json = JSON.stringify(specials);
      if (json !== lastSpecialsJsonRef.current) {
        lastSpecialsJsonRef.current = json;
        safeSetStorageItem('polycables_permanent_special_items', json, specials);
        safeSetStorageItem('polycables_special_items', json, specials);
      }
    } catch {}
  }, [items]);

  // Sync all historical stored bills line items with current item directory names
  const handleSyncAllPreviousBillsItemNames = () => {
    if (!storedBills || storedBills.length === 0 || !setStoredBills) {
      showNotification('error', 'No stored bills available to sync.');
      return;
    }

    const itemById = new Map<string, Item>();
    const itemByCode = new Map<string, Item>();
    const itemByName = new Map<string, Item>();
    const itemByClean = new Map<string, Item>();

    items.forEach((it) => {
      if (!it) return;
      if (it.id) itemById.set(it.id.toLowerCase(), it);
      if (it.code) {
        const c = it.code.trim().toUpperCase();
        itemByCode.set(c, it);
        itemByCode.set(c.replace(/^0+/, ''), it);
      }
      if (it.name) {
        itemByName.set(it.name.trim().toLowerCase(), it);
        const cleaned = cleanItemNameDisplay(it.name);
        if (cleaned) itemByName.set(cleaned.trim().toLowerCase(), it);
        const norm = it.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (norm) itemByClean.set(norm, it);
      }
    });

    let updatedBillsCount = 0;
    let updatedLinesCount = 0;
    const changedBillDocs: StoredBill[] = [];

    const nextBills = storedBills.map((b) => {
      let billChanged = false;
      const updatedLines = (b.lines || []).map((line) => {
        let matchedItem: Item | undefined;
        const lineId = (line.itemId || '').trim().toLowerCase();
        const lineCode = (line.itemCode || '').trim().toUpperCase();
        const lineDesc = (line.itemDescription || line.itemName || '').trim();
        const lineDescLower = lineDesc.toLowerCase();
        const lineDescNorm = lineDescLower.replace(/[^a-z0-9]/g, '');

        if (lineId && itemById.has(lineId)) {
          matchedItem = itemById.get(lineId);
        } else if (lineCode && (itemByCode.has(lineCode) || itemByCode.has(lineCode.replace(/^0+/, '')))) {
          matchedItem = itemByCode.get(lineCode) || itemByCode.get(lineCode.replace(/^0+/, ''));
        } else if (lineDescLower && itemByName.has(lineDescLower)) {
          matchedItem = itemByName.get(lineDescLower);
        } else if (lineDescNorm && itemByClean.has(lineDescNorm)) {
          matchedItem = itemByClean.get(lineDescNorm);
        } else if (lineDescNorm) {
          matchedItem = items.find((it) => {
            const itNorm = (it.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            return itNorm && (itNorm.includes(lineDescNorm) || lineDescNorm.includes(itNorm));
          });
        }

        if (matchedItem && (line.itemDescription !== matchedItem.name || line.itemName !== matchedItem.name || line.itemId !== matchedItem.id)) {
          billChanged = true;
          updatedLinesCount++;
          return {
            ...line,
            itemId: matchedItem.id,
            itemCode: matchedItem.code || line.itemCode,
            itemName: matchedItem.name,
            itemDescription: matchedItem.name
          };
        }
        return line;
      });

      if (billChanged) {
        updatedBillsCount++;
        const updatedBill = { ...b, lines: updatedLines };
        changedBillDocs.push(updatedBill);
        return updatedBill;
      }
      return b;
    });

    if (updatedBillsCount > 0) {
      setStoredBills(nextBills);
      try {
        localStorage.setItem('polycables_stored_bills', JSON.stringify(nextBills));
        idbSaveFailoverData('polycables_stored_bills', nextBills).catch(() => {});
      } catch {}

      // Persist individual changed bills directly to Firestore collection 'stored_bills'
      changedBillDocs.forEach((bill) => {
        if (bill && bill.id) {
          setDoc(doc(db, 'stored_bills', bill.id), bill, { merge: true }).catch((err) => {
            console.warn('Firestore stored_bills item name sync note:', err);
          });
        }
      });

      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: getClientSyncId(), patch: { storedBills: nextBills } })
      }).catch(() => {});
      onSyncCloud?.({ storedBills: nextBills }, true);
      showNotification('success', `✓ Successfully updated item names across ${updatedLinesCount} item(s) in ${updatedBillsCount} bill(s)!`);
    } else {
      showNotification('success', '✓ All previous bills already match current item names.');
    }
  };

  const showNotification = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleStartEdit = (item: Item) => {
    if (isReadOnly) return;
    setEditingId(item.id);
    const currentOpening = getItemOpeningStock(item, activeBranchId);
    const isCat6 = (item.code || '').toUpperCase().includes('CAT6') || (item.name || '').toUpperCase().includes('CAT-6') || (item.name || '').toUpperCase().includes('CAT6');
    let resolvedBase: Item | undefined = undefined;
    if (item.baseItemId && !(isCat6 && (item.baseItemId === 'item-57' || item.baseItemId === 'PC-157'))) {
      resolvedBase = standardItems.find((s) => s.id === item.baseItemId || s.code === item.baseItemId);
    }
    if (!resolvedBase && item.baseItemCode && !(isCat6 && (item.baseItemCode === 'PC-157' || item.baseItemCode === 'item-57'))) {
      resolvedBase = standardItems.find((s) => s.code === item.baseItemCode || s.id === item.baseItemCode);
    }
    if (!resolvedBase && item.isSpecialItem) {
      resolvedBase = resolveBaseItemForSpecialItem(item, standardItems);
    }
    if (isCat6 && (!resolvedBase || resolvedBase.id === 'item-57' || resolvedBase.code === 'PC-157')) {
      const cat6Base = standardItems.find((s) => (s.id === 'item-57-cat6' || (s.code && s.code.toUpperCase().includes('CAT6')) || (s.name && s.name.toUpperCase().includes('CAT-6') && !s.isSpecialItem)) && !s.isSpecialItem);
      if (cat6Base) resolvedBase = cat6Base;
    }
    setEditForm({
      ...item,
      baseItemId: resolvedBase ? resolvedBase.id : item.baseItemId,
      baseItemCode: resolvedBase ? resolvedBase.code : item.baseItemCode,
      openingStock: currentOpening,
      unit: item.unit || (item.isSpecialItem ? 'Bobin' : 'Coils')
    });
  };

  const handleSaveEdit = () => {
    if (isReadOnly || !editForm) return;
    if (!checkCanTakeEntry('Edit Item', (msg) => showNotification('error', msg))) return;
    const prevItems = [...items];
    const finalOpening = Number(editForm.openingStock) || 0;
    const oldItem = items.find((i) => i.id === editForm.id);
    const effDate = editForm.effectiveDate || localStorage.getItem('polycables_active_effective_date') || new Date().toLocaleDateString('en-GB').replace(/\//g, '.');
    let currentHistory = Array.isArray(editForm.priceHistory) ? [...editForm.priceHistory] : [];
    if (oldItem && oldItem.rate !== editForm.rate) {
      currentHistory = [
        {
          effectiveDate: effDate,
          rate: editForm.rate,
          updatedAt: new Date().toISOString(),
          notes: `Price update: ৳${oldItem.rate} -> ৳${editForm.rate}`
        },
        ...currentHistory.filter((h) => h.effectiveDate !== effDate)
      ];
    }

    const rawSerialStr = editForm.serial !== undefined && editForm.serial !== null ? String(editForm.serial).trim() : '';
    const normalizedSerial = rawSerialStr === '' ? undefined : (/^\d+(?:\.\d+)?$/.test(rawSerialStr) ? parseFloat(rawSerialStr) : rawSerialStr);

    const finalForm: Item = {
      ...editForm,
      serial: normalizedSerial,
      serialNo: normalizedSerial,
      order: typeof normalizedSerial === 'number' ? normalizedSerial : editForm.order,
      effectiveDate: effDate,
      priceHistory: currentHistory,
      openingStock: finalOpening,
      updatedAt: Date.now(),
      branchOpeningStock: {
        ...(editForm.branchOpeningStock || {}),
        ...(activeBranchId && activeBranchId !== 'ALL'
          ? { [activeBranchId]: finalOpening }
          : { 'branch-1': finalOpening, 'branch-main': finalOpening })
      }
    };

    const updatedRaw = items.map((i) => (i.id === finalForm.id ? finalForm : i));
    const updated = syncSpecialItemRatesWithBaseItems(updatedRaw);
    setItems(updated);
    const specialList = updated.filter((it) => it.isSpecialItem);
    try {
      safeSetStorageItem('polycables_items', JSON.stringify(updated), updated);
      safeSetStorageItem('polycables_special_items', JSON.stringify(specialList), specialList);
      idbSaveFailoverData('polycables_items', updated).catch(() => {});
      idbSaveFailoverData('polycables_special_items', specialList).catch(() => {});
    } catch {}
    const syncedSnaps = syncActiveSnapshotWithCatalogItems(updated);
    const itemsVer = Date.now();
    const catSync = getCategorySyncPayload();
    const syncPayload: any = {
      items: updated,
      specialItems: specialList,
      ...catSync,
      itemsVersion: itemsVer,
      _replaceItems: true,
      _itemsCleared: updated.length === 0,
      ...(syncedSnaps ? { priceSnapshots: syncedSnaps, price_snapshots: syncedSnaps, _replacePriceSnapshots: true } : {})
    };

    // Immediate authoritative /api/items request
    fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: getClientSyncId(),
        items: updated,
        specialItems: specialList,
        itemsVersion: itemsVer,
        itemsCleared: updated.length === 0,
        orderedCategories: catSync.orderedCategories,
        customCategories: catSync.customCategories,
        deletedCategories: catSync.deletedCategories,
        categoryNumbers: catSync.categoryNumbers
      })
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Item sync failed: ${res.status}`);
      })
      .catch((err) => {
        console.error('[Item Edit Sync Error]:', err);
        setItems(prevItems);
        const prevSpecialList = prevItems.filter((it) => it.isSpecialItem);
        try {
          safeSetStorageItem('polycables_items', JSON.stringify(prevItems), prevItems);
          safeSetStorageItem('polycables_special_items', JSON.stringify(prevSpecialList), prevSpecialList);
          idbSaveFailoverData('polycables_items', prevItems).catch(() => {});
          idbSaveFailoverData('polycables_special_items', prevSpecialList).catch(() => {});
        } catch {}
        syncActiveSnapshotWithCatalogItems(prevItems);
        showNotification('error', `Cloud sync failed! Changes to "${finalForm.name}" were rolled back.`);
      });

    onSyncCloud?.(syncPayload, true);
    try {
      window.dispatchEvent(new CustomEvent('polycables_items_updated', {
        detail: { items: updated }
      }));
    } catch {}

    const oldName = oldItem?.name?.trim();
    const newName = finalForm.name.trim();

    // If item name changed, update all previous stored bills lines with current item name
    if (oldName && oldName !== newName && setStoredBills) {
      setStoredBills((prevBills) => {
        let touched = false;
        const updatedBills = prevBills.map((b) => {
          let bTouched = false;
          const newLines = (b.lines || []).map((line) => {
            const matchId = line.itemId && line.itemId === finalForm.id;
            const matchCode = finalForm.code && line.itemCode && line.itemCode.trim().toLowerCase() === finalForm.code.trim().toLowerCase();
            const matchDesc = (line.itemDescription && line.itemDescription.trim().toLowerCase() === oldName.toLowerCase()) ||
                              (line.itemName && line.itemName.trim().toLowerCase() === oldName.toLowerCase());
            if (matchId || matchCode || matchDesc) {
              bTouched = true;
              touched = true;
              return {
                ...line,
                itemId: finalForm.id,
                itemCode: finalForm.code || line.itemCode,
                itemName: newName,
                itemDescription: newName
              };
            }
            return line;
          });
          if (bTouched) {
            return { ...b, lines: newLines };
          }
          return b;
        });

        if (touched) {
          try {
            safeSetStorageItem('polycables_stored_bills', JSON.stringify(updatedBills), updatedBills);
          } catch {}
          fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId: getClientSyncId(), patch: { storedBills: updatedBills } })
          }).catch(() => {});
          onSyncCloud?.({ storedBills: updatedBills }, true);
        }
        return updatedBills;
      });
    }

    setEditingId(null);
    setEditForm(null);
    showNotification('success', `✓ Item "${finalForm.name}" updated successfully!`);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const [deleteConfirmItem, setDeleteConfirmItem] = useState<Item | null>(null);

  const handleDeleteItem = (id: string) => {
    if (isReadOnly) return;
    const itemToDelete = items.find((i) => i.id === id);
    if (!itemToDelete) return;
    setDeleteConfirmItem(itemToDelete);
  };

  const confirmExecuteDeleteItem = () => {
    if (isReadOnly || !deleteConfirmItem) return;
    if (!checkCanTakeEntry('Delete Item', (msg) => showNotification('error', msg))) return;
    const itemToDelete = deleteConfirmItem;
    const updatedItems = items.filter((i) => i.id !== itemToDelete.id);
    const isAllCleared = updatedItems.length === 0;
    const idsToTombstone = isAllCleared
      ? Array.from(new Set([itemToDelete.id, ...defaultItems.map((d) => d.id)]))
      : [itemToDelete.id];

    // Update items state & localStorage + immediate IDB flush
    setItems(updatedItems);
    const specialList = updatedItems.filter((i) => i.isSpecialItem);
    try {
      if (isAllCleared) {
        localStorage.setItem('polycables_items_cleared', 'true');
      }
      safeSetStorageItem('polycables_items', JSON.stringify(updatedItems), updatedItems);
      safeSetStorageItem('polycables_special_items', JSON.stringify(specialList), specialList);
      safeSetStorageItem('polycables_permanent_special_items', JSON.stringify(specialList), specialList);
      idbSaveFailoverData('polycables_items', updatedItems).catch(() => {});
      idbSaveFailoverData('polycables_special_items', specialList).catch(() => {});
      idbSaveFailoverData('polycables_permanent_special_items', specialList).catch(() => {});
    } catch {}

    // Track in polycables_deleted_item_ids
    try {
      const savedDel = localStorage.getItem('polycables_deleted_item_ids');
      const delArr: string[] = savedDel ? JSON.parse(savedDel) : [];
      const mergedDel = Array.from(new Set([...delArr, ...idsToTombstone]));
      localStorage.setItem('polycables_deleted_item_ids', JSON.stringify(mergedDel));
    } catch {}

    // Safely move to universal trash and record global deletion tombstones
    moveToTrash('polycables_trashed_items', itemToDelete, itemToDelete.isSpecialItem ? 'Special Items' : 'Master Item Directory');
    recordDeletedEntityIds(idsToTombstone);

    setSelectedIds((prev) => {
      if (!prev.has(itemToDelete.id)) return prev;
      const next = new Set(prev);
      next.delete(itemToDelete.id);
      return next;
    });

    setTrashedItems((prev) => {
      const next = [itemToDelete, ...prev.filter((i) => i.id !== itemToDelete.id)];
      try {
        localStorage.setItem('polycables_trashed_items', JSON.stringify(next));
      } catch {}
      return next;
    });

    const syncedSnaps = syncActiveSnapshotWithCatalogItems(updatedItems);
    const itemsVer = Date.now();
    const deleteSyncPatch: any = {
      items: updatedItems,
      specialItems: specialList,
      deletedEntityIds: getGlobalDeletedIds(),
      itemsVersion: itemsVer,
      _replaceItems: true,
      _itemsCleared: isAllCleared,
      ...(isAllCleared ? { _forceEmpty: true } : {}),
      ...(syncedSnaps ? { priceSnapshots: syncedSnaps, price_snapshots: syncedSnaps, _replacePriceSnapshots: true } : {})
    };

    // Single atomic server item delete/clear endpoint (no racing /api/sync call)
    fetch('/api/items/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        clientId: getClientSyncId(),
        ids: idsToTombstone,
        clearAllItems: isAllCleared,
        clearAll: isAllCleared
      })
    }).catch((err) => {
      console.warn('[Item Delete Sync Notice]:', err);
    });

    // Cloud sync & dispatch event for all 14 modules
    onSyncCloud?.(deleteSyncPatch, true);
    try {
      window.dispatchEvent(new CustomEvent('polycables_items_updated', { detail: { items: updatedItems } }));
      window.dispatchEvent(new CustomEvent('polycables_trash_updated', { detail: { storageKey: 'polycables_trashed_items', id: itemToDelete.id } }));
    } catch {}

    setDeleteConfirmItem(null);
    showNotification('success', `✓ Item "${itemToDelete.name}" deleted and moved to Trash Bin.`);
  };

  const handleRestoreItem = (id: string) => {
    const itemToRestore = trashedItems.find((i) => i.id === id);
    if (itemToRestore) {
      try {
        localStorage.removeItem('polycables_items_cleared');
        const savedDel = localStorage.getItem('polycables_deleted_item_ids');
        if (savedDel) {
          const delArr = JSON.parse(savedDel);
          if (Array.isArray(delArr)) {
            localStorage.setItem(
              'polycables_deleted_item_ids',
              JSON.stringify(delArr.filter((x: string) => x !== id))
            );
          }
        }
      } catch {}
      unrecordDeletedEntityId(id);
      if (itemToRestore.code) unrecordDeletedEntityId(itemToRestore.code);
      removeIdsFromAllTrashStorages([id]);
      const restoredItem: Item = { ...itemToRestore, updatedAt: Date.now() };
      setItems((prev) => {
        const next = [...prev.filter((i) => i.id !== id), restoredItem];
        const specialList = next.filter((i) => i.isSpecialItem);
        try {
          safeSetStorageItem('polycables_items', JSON.stringify(next), next);
          safeSetStorageItem('polycables_special_items', JSON.stringify(specialList), specialList);
          safeSetStorageItem('polycables_permanent_special_items', JSON.stringify(specialList), specialList);
          idbSaveFailoverData('polycables_items', next).catch(() => {});
          idbSaveFailoverData('polycables_special_items', specialList).catch(() => {});
          idbSaveFailoverData('polycables_permanent_special_items', specialList).catch(() => {});
        } catch {}
        const syncedSnaps = syncActiveSnapshotWithCatalogItems(next, { includeItemIds: [restoredItem.id] });
        const restorePatch: any = {
          items: next,
          specialItems: specialList,
          itemsVersion: Date.now(),
          _itemsCleared: false,
          _replaceItems: true,
          restoredEntityIds: [id, itemToRestore.code].filter(Boolean),
          deletedEntityIds: getGlobalDeletedIds(),
          ...(syncedSnaps ? { priceSnapshots: syncedSnaps, price_snapshots: syncedSnaps, _replacePriceSnapshots: true } : {})
        };
        fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: getClientSyncId(), patch: restorePatch })
        }).catch(() => {});
        onSyncCloud?.(restorePatch, true);
        try {
          window.dispatchEvent(new CustomEvent('polycables_items_updated', { detail: { items: next } }));
        } catch {}
        return next;
      });
      setTrashedItems((prev) => prev.filter((i) => i.id !== id));
      showNotification('success', `✓ Item "${itemToRestore.name}" restored successfully into catalog!`);
    }
  };

  const handlePermanentDeleteItem = (id: string) => {
    recordDeletedEntityId(id);
    removeIdsFromAllTrashStorages([id]);
    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ clientId: getClientSyncId(), ids: [id], type: 'item' })
    }).catch(() => {});
    onSyncCloud?.({ deletedEntityIds: getGlobalDeletedIds() }, true);
    setTrashedItems((prev) => prev.filter((i) => i.id !== id));
    showNotification('success', 'Item permanently deleted from Trash.');
  };

  const [showEmptyTrashConfirm, setShowEmptyTrashConfirm] = useState(false);

  const handleEmptyTrash = () => {
    if (trashedItems.length === 0) return;
    setShowEmptyTrashConfirm(true);
  };

  const executeEmptyTrash = () => {
    if (trashedItems.length === 0) return;
    const ids = trashedItems.map((it) => it.id);
    recordDeletedEntityIds(ids);
    removeIdsFromAllTrashStorages(ids);
    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ clientId: getClientSyncId(), ids, type: 'item' })
    }).catch(() => {});
    onSyncCloud?.({ deletedEntityIds: getGlobalDeletedIds() }, true);
    setTrashedItems([]);
    setShowEmptyTrashConfirm(false);
    showNotification('success', 'Trash Bin emptied successfully.');
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const allFilteredIds = filteredItems.map((i) => i.id);
    const areAllSelected = allFilteredIds.every((id) => selectedIds.has(id));

    if (areAllSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        allFilteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        allFilteredIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    setShowBulkDeleteConfirm(true);
  };

  const executeBatchDeleteItems = (itemsToTrash: Item[]) => {
    if (isReadOnly || itemsToTrash.length === 0) return;
    if (!checkCanTakeEntry('Delete Items', (msg) => showNotification('error', msg))) return;

    const count = itemsToTrash.length;
    const trashedIds = new Set(itemsToTrash.map((it) => it.id));
    const updatedItems = items.filter((i) => !trashedIds.has(i.id));
    const isAllCleared = updatedItems.length === 0;
    const idsToTombstone = isAllCleared
      ? Array.from(new Set([...Array.from(trashedIds), ...defaultItems.map((d) => d.id)]))
      : Array.from(trashedIds);

    // Single fast O(N) batch write to trash & deletedTracker (avoids fetch/DOM storm)
    moveMultipleToTrash('polycables_trashed_items', itemsToTrash, subTab === 'special_items' ? 'Special Items' : 'Master Item Directory');
    recordDeletedEntityIds(idsToTombstone);

    setTrashedItems((prev) => {
      const next = [...itemsToTrash, ...prev.filter((i) => !trashedIds.has(i.id))];
      try {
        localStorage.setItem('polycables_trashed_items', JSON.stringify(next));
      } catch {}
      return next;
    });

    setItems(updatedItems);
    const specialList = updatedItems.filter((i) => i.isSpecialItem);
    try {
      if (isAllCleared) {
        localStorage.setItem('polycables_items_cleared', 'true');
      }
      safeSetStorageItem('polycables_items', JSON.stringify(updatedItems), updatedItems);
      safeSetStorageItem('polycables_special_items', JSON.stringify(specialList), specialList);
      safeSetStorageItem('polycables_permanent_special_items', JSON.stringify(specialList), specialList);
      idbSaveFailoverData('polycables_items', updatedItems).catch(() => {});
      idbSaveFailoverData('polycables_special_items', specialList).catch(() => {});
      idbSaveFailoverData('polycables_permanent_special_items', specialList).catch(() => {});
    } catch {}

    // Track in polycables_deleted_item_ids
    try {
      const savedDel = localStorage.getItem('polycables_deleted_item_ids');
      const delArr: string[] = savedDel ? JSON.parse(savedDel) : [];
      const mergedDel = Array.from(new Set([...delArr, ...idsToTombstone]));
      localStorage.setItem('polycables_deleted_item_ids', JSON.stringify(mergedDel));
    } catch {}

    const syncedSnaps = syncActiveSnapshotWithCatalogItems(updatedItems);
    const batchDeletePatch: any = {
      items: updatedItems,
      specialItems: specialList,
      deletedEntityIds: getGlobalDeletedIds(),
      itemsVersion: Date.now(),
      _replaceItems: true,
      _itemsCleared: isAllCleared,
      ...(isAllCleared ? { _forceEmpty: true } : {}),
      ...(syncedSnaps ? { priceSnapshots: syncedSnaps, price_snapshots: syncedSnaps, _replacePriceSnapshots: true } : {})
    };

    // Single atomic server item delete/clear endpoint
    fetch('/api/items/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        clientId: getClientSyncId(),
        ids: idsToTombstone,
        clearAllItems: isAllCleared,
        clearAll: isAllCleared
      })
    }).catch((err) => {
      console.warn('[Batch Item Delete Sync Notice]:', err);
    });

    onSyncCloud?.(batchDeletePatch, true);
    try {
      window.dispatchEvent(new CustomEvent('polycables_items_updated', { detail: { items: updatedItems } }));
      window.dispatchEvent(new CustomEvent('polycables_trash_updated', { detail: { storageKey: 'polycables_trashed_items' } }));
    } catch {}

    setSelectedIds(new Set());
    setShowBulkDeleteConfirm(false);
    setShowDeleteAllConfirm(false);
    showNotification(
      'success',
      isAllCleared
        ? `✓ Deleted all ${count} item(s) from Master Item Directory and moved them to Trash Bin.`
        : `✓ Moved ${count} selected item(s) to Trash Bin.`
    );
  };

  const confirmBulkDelete = () => {
    if (selectedIds.size === 0) return;
    const itemsToTrash = items.filter((i) => selectedIds.has(i.id));
    if (itemsToTrash.length === 0) {
      setShowBulkDeleteConfirm(false);
      return;
    }
    executeBatchDeleteItems(itemsToTrash);
  };

  const confirmDeleteAllItems = () => {
    const itemsToTrash = subTab === 'special_items'
      ? items.filter((i) => i.isSpecialItem)
      : items;
    if (itemsToTrash.length === 0) {
      showNotification('error', 'No items available to delete.');
      setShowDeleteAllConfirm(false);
      return;
    }
    executeBatchDeleteItems(itemsToTrash);
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleCreateItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name.trim()) return;
    if (!checkCanTakeEntry('Create Item', (msg) => showNotification('error', msg))) return;

    let baseItem: Item | undefined;
    if (isSpecialItemType && selectedBaseItemId) {
      baseItem = items.find((i) => i.id === selectedBaseItemId);
    }

    const isMeterUnit = /meters?|mtrs?|^m$/i.test((newItem.unit || '').trim());
    // 1 coil = 100 meters: when unit is Meters, convert entered meters to coils for base stock deduction
    const coilsMultiplier = isMeterUnit
      ? ((stockMultiplierInput || 100) / 100)
      : (stockMultiplierInput || 1);

    const targetCategory = (
      newItem.category === '__new__'
        ? (customNewItemCategory.trim() || 'Single Core Wires')
        : (newItem.category?.trim() || 'Single Core Wires')
    );
    const updatedCats = saveCustomCategory(targetCategory);
    setCategoriesList([...updatedCats]);

    let enteredSerial = newItem.serial !== undefined && newItem.serial !== null && String(newItem.serial).trim() !== ''
      ? (isNaN(Number(newItem.serial)) ? String(newItem.serial).trim() : Number(newItem.serial))
      : undefined;

    const cleanedName = cleanItemNameDisplay(newItem.name.trim(), enteredSerial);
    if (enteredSerial === undefined && !isCableSpecificationStart(newItem.name)) {
      const m = newItem.name.match(/^0*(\d{1,4})(?:[.)\-])\s*(?=[a-zA-Z]|\d+\s*(?:x|\*|\/|\.|pair|rm|re|bya|sq|flexible|coils|mtr))/i);
      if (m && !/^\d+\.\d+\s*(rm|re|sq|mm)/i.test(newItem.name)) {
        enteredSerial = parseInt(m[1], 10);
      }
    }

    const finalName = cleanedName || newItem.name.trim();
    const rawDetId = buildDeterministicItemId(newItem.code, finalName, targetCategory);
    const detItemId = items.some((it) => it.id === rawDetId) ? `${rawDetId}-${Date.now()}` : rawDetId;

    const itemToAdd: Item = {
      ...newItem,
      name: finalName,
      serial: enteredSerial,
      serialNo: enteredSerial,
      order: typeof enteredSerial === 'number' ? enteredSerial : items.length + 1,
      category: targetCategory,
      rate: parseFloat(String(newItem.rate)) || 0,
      unit: newItem.unit || (isSpecialItemType ? 'Meters' : 'Coils'),
      id: detItemId,
      isSpecialItem: isSpecialItemType,
      baseItemId: baseItem ? baseItem.id : undefined,
      baseItemCode: baseItem ? baseItem.code : undefined,
      stockMultiplier: isSpecialItemType ? coilsMultiplier : undefined,
      hasExplicitStock: true,
      updatedAt: Date.now()
    };

    const next = [...items, itemToAdd];
    setItems(next);
    const specialList = next.filter((it) => it.isSpecialItem);
    try {
      localStorage.removeItem('polycables_items_cleared');
      safeSetStorageItem('polycables_items', JSON.stringify(next), next);
      safeSetStorageItem('polycables_special_items', JSON.stringify(specialList), specialList);
      safeSetStorageItem('polycables_permanent_special_items', JSON.stringify(specialList), specialList);
      idbSaveFailoverData('polycables_items', next).catch(() => {});
      idbSaveFailoverData('polycables_special_items', specialList).catch(() => {});
      unrecordDeletedIdsLocally([itemToAdd.id, itemToAdd.code]);
      unrecordDeletedEntityIds([itemToAdd.id, itemToAdd.code]);
    } catch {}

    const syncedSnaps = syncActiveSnapshotWithCatalogItems(next, { includeItemIds: [itemToAdd.id] });
    const itemsVer = Date.now();
    const catSync = getCategorySyncPayload(updatedCats);
    const createPatch: any = {
      items: next,
      specialItems: specialList,
      ...catSync,
      itemsVersion: itemsVer,
      _itemsCleared: false,
      _replaceItems: true,
      restoredEntityIds: [itemToAdd.id, itemToAdd.code],
      ...(syncedSnaps ? { priceSnapshots: syncedSnaps, price_snapshots: syncedSnaps, _replacePriceSnapshots: true } : {})
    };

    // Atomic /api/items sync
    fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: getClientSyncId(),
        items: next,
        specialItems: specialList,
        itemsVersion: itemsVer,
        itemsCleared: false,
        orderedCategories: catSync.orderedCategories,
        customCategories: catSync.customCategories,
        deletedCategories: catSync.deletedCategories,
        categoryNumbers: catSync.categoryNumbers
      })
    }).catch((err) => console.warn('[Item Create Sync Warning]:', err));

    onSyncCloud?.(createPatch, true);

    try {
      window.dispatchEvent(new CustomEvent('polycables_items_updated', { detail: { items: next } }));
    } catch {}

    showNotification('success', `Item "${itemToAdd.name}" added successfully!`);
    setIsAddingNew(false);
    setIsSpecialItemType(false);
    setSelectedBaseItemId('');
    setCustomNewItemCategory('');
    setStockMultiplierInput(500);
    setNewItem({
      code: 'PC-' + (items.length + 102),
      name: '',
      sizeSpec: '',
      unit: 'Coils',
      rate: 0,
      openingStock: 0,
      category: targetCategory || 'Single Core Wires',
      serial: ''
    });
    showNotification('success', isSpecialItemType ? 'Special Item created successfully!' : `Item created successfully in category "${targetCategory}"!`);
  };

  const [xlsxImportIssues, setXlsxImportIssues] = useState<ExcelItemImportIssue[]>([]);

  // Handle XLSX file import for new/additional items (takes ALL items & reports any problems + how to fix)
  const handleImportXLSX = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isSpecialImportTab = subTab === 'special_items';
    const normalizeImportName = (val?: string) => String(val || '').trim().replace(/\s+/g, ' ').toLowerCase();

    try {
      const { items: parsed, issues } = await parseXLSXToItemsWithDiagnostics(file, {
        isSpecialItemMode: isSpecialImportTab
      });
      if (issues.length > 0) {
        setXlsxImportIssues(issues);
      }

      if (parsed.length === 0) {
        const firstErr = issues.find((iss) => iss.severity === 'error')?.problem || issues[0]?.problem;
        showNotification(
          'error',
          firstErr ||
            'No valid item rows or recognized item columns found in the uploaded file. Ensure an "Item Name" column contains product names.'
        );
        return;
      }

      let addedCount = 0;
      let updatedCount = 0;

      const primaryAllSalesCentersStatus: Record<string, boolean> = {};
      effectiveBranches.forEach((b) => {
        primaryAllSalesCentersStatus[b.id] = true;
        primaryAllSalesCentersStatus[b.name] = true;
      });

      const itemMap = new Map<string, Item>();
      items.forEach((item) => {
        if (item && item.id) {
          itemMap.set(item.id, item);
        }
      });

      parsed.forEach((p) => {
        if (p.category && p.category.trim()) {
          saveCustomCategory(p.category.trim());
        }
        const cleanedName = cleanItemNameDisplay(p.name, p.serial ?? p.serialNo).replace(/\s+/g, ' ').trim();
        const hasExplicitIncomingSerial =
          (p.serial !== undefined && p.serial !== null && String(p.serial).trim() !== '') ||
          (p.serialNo !== undefined && p.serialNo !== null && String(p.serialNo).trim() !== '');
        const incomingSerial = hasExplicitIncomingSerial
          ? (p.serial !== undefined && p.serial !== null && String(p.serial).trim() !== '' ? p.serial : p.serialNo)
          : undefined;
        const fallbackNewSerial = incomingSerial ?? (itemMap.size + 1);

        const key = normalizeImportName(cleanedName || p.name);
        const incomingCat = normalizeImportName(p.category);
        const hasExpUnit = Boolean((p as any).hasExplicitUnit);
        const tabScopedVals = Array.from(itemMap.values()).filter((it) =>
          isSpecialImportTab ? Boolean(it.isSpecialItem) : Boolean(!it.isSpecialItem)
        );

        const existing =
          (incomingCat
            ? tabScopedVals.find(
                (it) =>
                  normalizeImportName(it.name) === key &&
                  normalizeImportName(it.category) === incomingCat
              )
            : undefined) ||
          tabScopedVals.find((it) => normalizeImportName(it.name) === key);

        if (existing) {
          const resolvedSerial = incomingSerial !== undefined ? incomingSerial : (existing.serial ?? existing.serialNo);
          itemMap.set(existing.id, {
            ...existing,
            name: cleanedName || existing.name,
            serial: resolvedSerial,
            serialNo: resolvedSerial,
            order: typeof resolvedSerial === 'number' ? resolvedSerial : existing.order,
            rate: p.rate > 0 ? p.rate : existing.rate,
            openingStock: p.hasExplicitStock && p.openingStock !== undefined ? p.openingStock : existing.openingStock,
            unit: hasExpUnit ? p.unit : (existing.unit || p.unit || (isSpecialImportTab ? 'Bobin' : 'Coils')),
            category: p.category && p.category !== 'General' ? p.category : existing.category,
            sizeSpec: p.sizeSpec || existing.sizeSpec,
            code: p.code || existing.code
          });
          updatedCount++;
        } else {
          const itemFinalName = cleanedName || p.name;
          const baseDetId = buildDeterministicItemId(
            `${isSpecialImportTab ? 'sp-' : ''}${p.code || ''}`,
            itemFinalName,
            p.category
          );
          const newId = itemMap.has(baseDetId) ? `${baseDetId}-${addedCount}` : baseDetId;
          itemMap.set(newId, {
            ...p,
            name: itemFinalName,
            isSpecialItem: isSpecialImportTab || Boolean(p.isSpecialItem),
            unit: p.unit || (isSpecialImportTab ? 'Bobin' : 'Coils'),
            serial: fallbackNewSerial,
            serialNo: fallbackNewSerial,
            order: typeof fallbackNewSerial === 'number' ? fallbackNewSerial : itemMap.size + 1,
            id: newId,
            isActive: true,
            branchActiveStatus: primaryAllSalesCentersStatus
          });
          addedCount++;
        }
      });

      // Guarantee special items never delete; when item import occurs, keep special items and auto-set again
      let permanentSpecials: Item[] = [];
      try {
        const savedPerm = localStorage.getItem('polycables_permanent_special_items') || localStorage.getItem('polycables_special_items');
        if (savedPerm) {
          const parsedPerm = JSON.parse(savedPerm);
          if (Array.isArray(parsedPerm) && parsedPerm.length > 0) {
            permanentSpecials = parsedPerm;
          }
        }
      } catch {}
      if (permanentSpecials.length === 0) {
        permanentSpecials = items.filter((i) => i.isSpecialItem && !i.id.startsWith('default-'));
      }

      permanentSpecials
        .filter((sp) => sp && sp.id && !isGloballyDeletedId(sp.id) && (!sp.code || !isGloballyDeletedId(sp.code)))
        .forEach((sp) => {
          if (!itemMap.has(sp.id)) {
            itemMap.set(sp.id, sp);
          }
        });

      const nextListRaw = Array.from(itemMap.values());
      const nextList = syncSpecialItemRatesWithBaseItems(nextListRaw);
      const activeIds = nextList.map((i) => i.id).filter(Boolean);
      const activeCodes = nextList.map((i) => i.code).filter(Boolean);
      const allRestored = Array.from(new Set([...activeIds, ...activeCodes]));

      // 1. Immediately update localStorage/IndexedDB and unrecord deleted IDs
      const specialList = nextList.filter((i) => i.isSpecialItem);
      try {
        if (nextList.length > 0) {
          localStorage.removeItem('polycables_items_cleared');
          unrecordDeletedIdsLocally(allRestored);
          unrecordDeletedEntityIds(allRestored);
        }
        safeSetStorageItem('polycables_items', JSON.stringify(nextList), nextList);
        safeSetStorageItem('polycables_special_items', JSON.stringify(specialList), specialList);
        safeSetStorageItem('polycables_permanent_special_items', JSON.stringify(specialList), specialList);
        idbSaveFailoverData('polycables_items', nextList).catch(() => {});
        idbSaveFailoverData('polycables_special_items', specialList).catch(() => {});
      } catch {}

      const refreshedCats = getAllCategories();
      setCategoriesList([...refreshedCats]);
      setCategoryNumbersMap(getCategoryNumbers());

      const syncedSnaps = syncActiveSnapshotWithCatalogItems(nextList, { includeItemIds: activeIds });

      // 2. Immediately update React state & dispatch event
      setItems(nextList);
      try {
        window.dispatchEvent(new CustomEvent('polycables_items_updated', { detail: { items: nextList } }));
      } catch {}

      const itemsVer = Date.now();
      const catSync = getCategorySyncPayload(refreshedCats);
      const importPatch: any = {
        items: nextList,
        specialItems: specialList,
        ...catSync,
        itemsVersion: itemsVer,
        _itemsCleared: false,
        _replaceItems: true,
        restoredEntityIds: allRestored,
        ...(syncedSnaps ? { priceSnapshots: syncedSnaps, price_snapshots: syncedSnaps, _replacePriceSnapshots: true } : {})
      };

      // 3. Immediately send to authoritative /api/items endpoint
      fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: getClientSyncId(),
          items: nextList,
          specialItems: specialList,
          itemsVersion: itemsVer,
          itemsCleared: false,
          orderedCategories: catSync.orderedCategories,
          customCategories: catSync.customCategories,
          deletedCategories: catSync.deletedCategories,
          categoryNumbers: catSync.categoryNumbers
        })
      }).catch((err) => console.warn('[Item Upload Sync Warning]:', err));

      // 4. Immediately trigger cloud sync (Google Cloud Firestore)
      onSyncCloud?.(importPatch, true);

      showNotification(
        'success',
        `Imported all ${parsed.length} item(s) from Excel (${addedCount} new added, ${updatedCount} updated).${
          issues.length > 0 ? ` ${issues.length} issue(s) reported with fix instructions.` : ''
        }`
      );
    } catch (err: any) {
      const msg = `Failed to parse Excel file: ${err?.message || 'Unsupported format'}.`;
      showNotification('error', msg);
      setXlsxImportIssues([
        {
          sheetName: file.name,
          rowNumber: 1,
          itemName: file.name,
          problem: msg,
          howToFix: 'Save your spreadsheet as a standard .xlsx, .xls, or .csv file and import again.',
          severity: 'error'
        }
      ]);
    } finally {
      if (importFileInputRef.current) importFileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4 font-sans">
      {/* Excel Import Diagnostics Modal (What's the Problem & How to Fix It) */}
      {xlsxImportIssues.length > 0 && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-amber-400/35 text-white max-w-lg w-full overflow-hidden">
            <div className="bg-[#0c2638]/90 border-b border-amber-400/25 text-white px-4 py-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-amber-300" />
                <div>
                  <h3 className="font-bold text-sm text-white">Excel Item Import Diagnostics</h3>
                  <p className="text-[11px] text-amber-200/80">
                    {xlsxImportIssues.length} issue(s) detected — review what happened and how to fix it
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setXlsxImportIssues([])}
                className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-cyan-500/15 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2.5">
              {xlsxImportIssues.map((iss, idx) => (
                <div key={idx} className="bg-[#071824]/80 border border-amber-400/30 rounded-xl p-3 text-xs space-y-1">
                  <div className="font-bold text-white">
                    {iss.sheetName} • Row {iss.rowNumber}: {iss.itemName}
                  </div>
                  <div className="text-rose-300">
                    <strong>Problem:</strong> {iss.problem}
                  </div>
                  <div className="text-emerald-200 bg-emerald-500/15 p-1.5 rounded border border-emerald-400/30">
                    <strong>How to Fix:</strong> {iss.howToFix}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 bg-[#071824]/90 border-t border-cyan-500/20 flex justify-end">
              <button
                type="button"
                onClick={() => setXlsxImportIssues([])}
                className="px-4 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black rounded-xl cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty Trash Confirmation Modal */}
      {showEmptyTrashConfirm && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl p-6 max-w-md w-full shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-rose-400/35 text-white space-y-4 animate-scaleUp">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-3 bg-rose-500/15 border border-rose-400/30 rounded-full">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Empty Item Trash?</h3>
                <p className="text-xs text-slate-400">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-xs text-slate-200">
              Are you sure you want to permanently delete all <strong className="text-rose-300 font-bold">{trashedItems.length}</strong> item(s) from the Trash Bin?
            </p>
            <div className="flex items-center justify-end space-x-3 pt-2 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setShowEmptyTrashConfirm(false)}
                className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeEmptyTrash}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center space-x-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Yes, Empty Trash Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}



      {/* RENDER COMPONENT DEPENDING ON SUB TAB */}
      {subTab === 'categories' ? (
        <div className="cyber-glass-card rounded-2xl overflow-hidden font-sans text-white">
          <div className="cyber-glass-header px-4 py-3 flex items-center justify-between gap-3 flex-wrap lg:flex-nowrap min-h-[52px]">
            <div className="flex items-center space-x-3 shrink-0">
              <div className="bg-purple-500/20 border border-purple-400/30 p-2 rounded-lg">
                <Tag className="w-4 h-4 text-purple-300" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white whitespace-nowrap">
                  Category List ({categoriesList.length})
                </h2>
              </div>
            </div>
            <input
              type="file"
              ref={categoryImportFileInputRef}
              onChange={handleImportCategoriesXLSX}
              accept=".xlsx, .xls, .csv"
              className="hidden"
            />
          </div>

          {/* Add New Category Form */}
          {isAddingCategory && (
            <form onSubmit={handleAddNewCategory} className="bg-[#081b28]/90 p-4 border-b border-cyan-500/25 text-xs">
              <div className="max-w-md space-y-3">
                <h3 className="font-extrabold text-cyan-200 text-sm flex items-center space-x-1.5">
                  <Tag className="w-4 h-4 text-purple-300" />
                  <span>Create Product Category</span>
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCategoryInput}
                    onChange={(e) => setNewCategoryInput(e.target.value)}
                    placeholder="e.g. Submersible Cable, Power Cable..."
                    className="flex-1 p-2 bg-[#061520] border border-cyan-500/30 rounded-lg font-bold text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                    required
                  />
                  <button
                    type="submit"
                    className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-4 py-2 rounded-lg font-black shadow-xs cursor-pointer"
                  >
                    Save Category
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingCategory(false)}
                    className="bg-[#0c2638] hover:bg-[#11334a] text-slate-200 border border-cyan-500/30 px-3 py-2 rounded-lg font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="p-4 overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#0c2638] text-cyan-200 font-bold border-b border-cyan-500/30 uppercase text-[10px]">
                  <th className="p-3 w-20 text-center">Reorder</th>
                  <th className="p-3 w-20 text-center">Cat #</th>
                  <th className="p-3 min-w-[200px]">Category Name</th>
                  <th className="p-3 w-32 text-center">Products Count</th>
                  <th className="p-3 w-40 text-right">Total Current Stock</th>
                  <th className="p-3 w-64 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                {categoriesList.map((cat, idx) => {
                  const catKey = cat.trim().toLowerCase();
                  const cleanCatKey = catKey.replace(/[\s\-_()]+/g, ' ').trim();
                  const productsCount = categoryCountMap[catKey] || categoryCountMap[cleanCatKey] || 0;
                  const totalLiveStock = categoryStockMap[catKey] || categoryStockMap[cleanCatKey] || 0;
                  const catDisplayNum = categoryNumbersMap[catKey] ?? getCategoryNumber(cat, idx);
                  const isEditingThisCat = editingCategoryKey === cat;

                  return (
                    <tr key={`${cat}-${idx}`} className="hover:bg-cyan-500/[0.06] transition-colors">
                      <td className="p-2.5 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            type="button"
                            disabled={idx === 0 || isEditingThisCat}
                            onClick={() => handleMoveCategoryUp(idx)}
                            className={`p-1 rounded border transition-colors ${
                              idx === 0 || isEditingThisCat
                                ? 'text-slate-600 border-cyan-500/15 cursor-not-allowed'
                                : 'text-cyan-200 hover:bg-cyan-500/20 hover:text-white border-cyan-500/30 cursor-pointer'
                            }`}
                            title="Move Category Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === categoriesList.length - 1 || isEditingThisCat}
                            onClick={() => handleMoveCategoryDown(idx)}
                            className={`p-1 rounded border transition-colors ${
                              idx === categoriesList.length - 1 || isEditingThisCat
                                ? 'text-slate-600 border-cyan-500/15 cursor-not-allowed'
                                : 'text-cyan-200 hover:bg-cyan-500/20 hover:text-white border-cyan-500/30 cursor-pointer'
                            }`}
                            title="Move Category Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="p-2.5 text-center font-mono font-bold text-cyan-300">
                        {isEditingThisCat ? (
                          <input
                            type="number"
                            step="any"
                            min="1"
                            value={editCatNumberInput}
                            onChange={(e) => setEditCatNumberInput(e.target.value)}
                            className="w-16 p-1 bg-[#061520] border border-cyan-400 rounded text-center text-xs font-mono font-bold text-white focus:outline-none"
                            title="Category Serial Number"
                          />
                        ) : (
                          <span>{catDisplayNum}</span>
                        )}
                      </td>
                      <td className="p-2.5 font-extrabold text-white text-sm">
                        {isEditingThisCat ? (
                          <input
                            type="text"
                            value={editCatNameInput}
                            onChange={(e) => setEditCatNameInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveCategoryEdit(cat);
                              } else if (e.key === 'Escape') {
                                setEditingCategoryKey(null);
                              }
                            }}
                            className="w-full p-1.5 bg-[#061520] border border-cyan-400 rounded-lg text-xs font-bold text-white focus:outline-none"
                            autoFocus
                          />
                        ) : (
                          <div className="flex items-center space-x-2">
                            <Tag className="w-4 h-4 text-purple-300 flex-shrink-0" />
                            <span>{cat}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        <span className="bg-purple-500/20 text-purple-200 text-xs font-black px-2.5 py-0.5 rounded-full border border-purple-400/30">
                          {productsCount} Products
                        </span>
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-emerald-300 text-xs">
                        {(totalLiveStock ?? 0).toLocaleString('en-IN')} Coils
                      </td>
                      <td className="p-2.5 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          {isEditingThisCat ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSaveCategoryEdit(cat)}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer"
                                title="Save Category Number & Name"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Save</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingCategoryKey(null)}
                                className="bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer"
                                title="Cancel Edit"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStartEditCategory(cat, idx)}
                                className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/35 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center space-x-1 transition-colors cursor-pointer"
                                title="Edit Category Number & Name"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const existingCategoryItems = items.filter(
                                    (i) => i.category?.trim().toLowerCase() === cat.trim().toLowerCase()
                                  );
                                  const maxSerial = existingCategoryItems.reduce((max, i) => {
                                    const ser = Number(i.serial ?? (i.name.match(/^(\d+)[.)\s]/)?.[1] || 0));
                                    return ser > max ? ser : max;
                                  }, 0);
                                  setCategoryAddItemModal({
                                    isOpen: true,
                                    category: cat,
                                    name: '',
                                    serial: String(maxSerial + 1),
                                    code: `PC-${100 + items.length + 1}`,
                                    sizeSpec: '',
                                    unit: 'Coils',
                                    rate: 0,
                                    openingStock: 100
                                  });
                                }}
                                className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/35 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center space-x-1 transition-colors cursor-pointer shadow-xs"
                                title={`Add manual item under category "${cat}"`}
                              >
                                <Plus className="w-3 h-3" />
                                <span>Add Item</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setUploadTargetCategory(cat);
                                  setIsBulkUploadModalOpen(true);
                                }}
                                className="bg-[#081b28] hover:bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center space-x-1 transition-colors cursor-pointer"
                                title={`Single Category Excel Import: Import products directly into category "${cat}"`}
                              >
                                <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
                                <span>Import (.xlsx)</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setCategoryFilter(cat);
                                  setSearch('');
                                  setStatusFilter('All');
                                  setUnitFilter('All');
                                  setSpecialItemFilter('with');
                                  setCurrentPage(1);
                                  setSubTab('items_list');
                                }}
                                className="bg-[#081b28] hover:bg-purple-500/20 text-purple-200 border border-purple-400/30 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center space-x-1 transition-colors cursor-pointer"
                                title={`View all products under category "${cat}"`}
                              >
                                <Search className="w-3 h-3" />
                                <span>View Products</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCategory(cat)}
                                className="text-slate-400 hover:text-rose-400 p-1.5 rounded hover:bg-rose-500/15 transition-colors cursor-pointer"
                                title="Delete Category"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bottom Categories Action Bar */}
          <div className="px-4 py-3 bg-[#081b28]/90 border-t border-cyan-500/20 flex flex-wrap items-center justify-end gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                const defaultCat = categoriesList[0] || 'Single Core Wires';
                const existingCategoryItems = items.filter(
                  (i) => (i.category || '').trim().toLowerCase() === defaultCat.trim().toLowerCase()
                );
                const maxSerial = existingCategoryItems.reduce((max, i) => {
                  const ser = Number(i.serial ?? (i.name.match(/^(\d+)[.)\s]/)?.[1] || 0));
                  return ser > max ? ser : max;
                }, 0);
                setCategoryAddItemModal({
                  isOpen: true,
                  category: defaultCat,
                  name: '',
                  serial: String(maxSerial + 1),
                  code: `PC-${100 + items.length + 1}`,
                  sizeSpec: '',
                  unit: 'Coils',
                  rate: 0,
                  openingStock: 100
                });
              }}
              className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/35 text-xs px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
              title="Add a manual item directly under any category"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Category-Wise Item</span>
            </button>
            <button
              type="button"
              onClick={() => setIsAddingCategory(!isAddingCategory)}
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs px-3 py-1.5 rounded-lg font-black flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Category</span>
            </button>
            <button
              type="button"
              onClick={() => categoryImportFileInputRef.current?.click()}
              className="bg-[#081b28] hover:bg-[#0e2a3d] text-emerald-300 border border-emerald-400/30 text-xs px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
              title="Import Category List from Excel (.xlsx/.xls/.csv)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Import (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={() => exportCategoriesToXLSX(categoriesList, items)}
              className="bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/30 text-xs px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 transition-colors cursor-pointer"
              title="Export Category List to Excel (.xlsx)"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCategoryPrintModalOpen(true)}
              className="bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/30 text-xs px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 transition-colors cursor-pointer"
              title="Print Category List"
            >
              <Printer className="w-3.5 h-3.5 text-amber-300" />
              <span>Print</span>
            </button>
          </div>

          {/* Category Delete Confirmation Modal */}
          {deleteCategoryTarget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030d14]/80 p-4 backdrop-blur-sm">
              <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl max-w-sm w-full p-5 shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-rose-400/35 text-white">
                <div className="flex items-center space-x-3 text-rose-400 mb-3">
                  <div className="p-2 bg-rose-500/15 border border-rose-400/30 rounded-lg">
                    <Trash2 className="w-5 h-5 text-rose-400" />
                  </div>
                  <h3 className="text-base font-bold text-white">Delete Category</h3>
                </div>
                <p className="text-xs text-slate-300 mb-4 leading-relaxed">
                  Are you sure you want to delete the category <span className="font-bold text-white">"{deleteCategoryTarget}"</span>? This will remove it from your Category List.
                </p>
                <div className="flex items-center justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setDeleteCategoryTarget(null)}
                    className="px-3 py-1.5 text-xs font-semibold bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmDeleteCategory}
                    className="px-4 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors cursor-pointer shadow-xs"
                  >
                    Delete Category
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : subTab === 'price_history' ? (
        <PriceUpdateHistoryPage
          items={items}
          setItems={setItems}
          company={company}
          branches={effectiveBranches}
          currentUser={currentUser}
          onBack={onBack || (() => handleSelectSubTab('items_list'))}
          onClose={onClose || (() => handleSelectSubTab('items_list'))}
          onSyncCloud={onSyncCloud}
        />
      ) : subTab === 'import_history' ? (
        <FactoryImportManager
          key={subTab}
          items={items}
          setItems={setItems}
          factoryImports={factoryImports}
          setFactoryImports={setFactoryImports}
          company={company}
          branches={branches}
          requisitions={requisitions}
          setRequisitions={setRequisitions}
          initialSubTab="history"
          hideInternalTabs={true}
          currentUser={currentUser}
          onBack={onBack || (() => handleSelectSubTab('items_list'))}
          onClose={onClose || (() => handleSelectSubTab('items_list'))}
        />
      ) : (
        <div className="cyber-glass-card rounded-2xl overflow-hidden font-sans space-y-0 text-white">
          {/* Hidden File Input for Import */}
          <input
            type="file"
            ref={importFileInputRef}
            onChange={handleImportXLSX}
            accept=".xlsx, .xls, .csv"
            className="hidden"
          />

          {/* Hidden File Input for Single Item JSON Restore */}
          <input
            type="file"
            ref={singleItemInputRef}
            onChange={handleRestoreSingleItemFile}
            accept=".json"
            className="hidden"
          />

      {/* Title Bar - Item Master & Special Item List */}
      <div className="cyber-glass-header px-3 sm:px-4 py-2 flex items-center justify-between gap-2.5 overflow-x-auto min-h-[48px] whitespace-nowrap">
        {/* Left Side: Title */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center space-x-2 shrink-0">
            <div className={subTab === 'special_items' ? 'bg-amber-500/20 border border-amber-400/30 p-1.5 rounded-lg' : 'bg-cyan-500/20 border border-cyan-400/30 p-1.5 rounded-lg'}>
              {subTab === 'special_items' ? <Sparkles className="w-4 h-4 text-amber-300" /> : <Database className="w-4 h-4 text-cyan-300" />}
            </div>
            <h2 className="text-sm font-bold text-white whitespace-nowrap flex items-center gap-2">
              <span>{subTab === 'special_items' ? 'Special Item List' : 'Item Master'}</span>
              {subTab === 'special_items' ? (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-400/35">
                  Fixed Roster ({specialItems.length}) • Auto Rate Sync
                </span>
              ) : activePriceSnapshot && (
                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-400/30">
                  Active Circular: {activePriceSnapshot.effectiveDate}
                </span>
              )}
            </h2>
          </div>
        </div>
      </div>

      {subTab === 'special_items' && showSpecialInfo && (
        <div className="p-2.5 px-4 bg-amber-500/15 border-b border-amber-400/30 text-amber-200 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-300 flex-shrink-0" />
            <span>
              <strong>Special Items Info:</strong> Special items use a base item stock with a coil quantity ratio (e.g. <strong>1 x 1.0 Rm BYA (500 m Length)- 01 Coil</strong> = <strong>5 Coils</strong> of base item 1 x 1.0 Rm BYA). Selling 1 special coil reduces 5 coils from base item stock. Special items are not shown in stock reports.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowSpecialInfo(false)}
            className="text-amber-300 hover:text-white p-1 cursor-pointer"
            title="Dismiss Info"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Notification Toast Message */}
      {message && (
        <div
          className={`p-3 text-xs flex items-center space-x-2 border-b font-medium ${
            message.type === 'success'
              ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30'
              : 'bg-rose-500/15 text-rose-200 border-rose-400/30'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* GLOBAL CONTROLS & FILTER BAR - Sales Center -> Search -> Reset -> Filters */}
      <div className="bg-[#081e2d]/85 backdrop-blur-xl p-2.5 px-3.5 rounded-2xl border border-cyan-500/25 flex items-center gap-2 text-xs text-white shadow-lg no-print m-3 flex-wrap lg:flex-nowrap">
        {/* 1. Sales Center Filter */}
        <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
          <Building2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-cyan-200/80 font-bold text-[11px] whitespace-nowrap">Sales Center:</span>
          <select
            id="master-items-sales-center-filter-top"
            value={isBranchLocked ? userBranchInfo.branchId : selectedBranchId}
            onChange={(e) => {
              if (!isBranchLocked) setSelectedBranchId(e.target.value);
            }}
            disabled={isBranchLocked}
            className={`bg-transparent text-cyan-100 font-bold text-xs focus:outline-none ${
              isBranchLocked ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'
            }`}
            title={isBranchLocked ? `Locked to ${userBranchInfo.branchName}` : "Filter stock and details by Sales Center"}
          >
            {isStrictSuper && (
              <option value="ALL" className="bg-[#091e2c] text-white">All Sales Centers ({effectiveBranches.length})</option>
            )}
            {!isStrictSuper && isAdmin && (
              <option value="MY_ALL" className="bg-[#091e2c] text-white">All Sales Centers ({allowedBranches.length})</option>
            )}
            {allowedBranches.map((b) => (
              <option key={b.id} value={b.id} className="bg-[#091e2c] text-white">
                {b.name} {isBranchLocked && ' (Locked)'}
              </option>
            ))}
          </select>
          {isBranchLocked && (
            <span
              className="text-[10px] text-amber-300 font-semibold px-1 py-0.5 bg-amber-500/15 border border-amber-400/30 rounded flex items-center gap-0.5 shrink-0"
              title="Stock locked to your assigned sales center"
            >
              🔒
            </span>
          )}
        </div>

        {/* 2. Search Box immediately after Sales Center Filter */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items by name, code, or spec..."
            className="w-full pl-8 pr-7 py-1.5 h-[34px] text-xs bg-[#061520]/90 text-white placeholder-slate-400 border border-cyan-500/30 rounded-xl focus:ring-1 focus:ring-cyan-400 focus:outline-none font-medium"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* 3. Reset Button immediately after Search Box */}
        <button
          type="button"
          onClick={() => {
            setSearch('');
            setCategoryFilter('All');
            setStatusFilter('All');
            setUnitFilter('All');
            setSpecialItemFilter('with');
            if (!isBranchLocked) {
              setSelectedBranchId('ALL');
            }
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1 h-[34px] bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/35 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
          title="Reset all filters"
        >
          <FilterX className="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>

        {/* Category Filter */}
        <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
          <Tag className="w-3.5 h-3.5 text-purple-300 shrink-0" />
          <span className="text-cyan-200/80 font-bold text-[11px] whitespace-nowrap">Category:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-transparent text-cyan-100 font-bold text-xs focus:outline-none cursor-pointer max-w-[140px]"
          >
            <option value="All" className="bg-[#091e2c] text-white">All Categories ({categoriesList.length})</option>
            {categoriesList.map((cat, cIdx) => (
              <option key={`${cat}-${cIdx}`} value={cat} className="bg-[#091e2c] text-white">
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
          <Layers className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span className="text-cyan-200/80 font-bold text-[11px] whitespace-nowrap">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-transparent text-cyan-100 font-bold text-xs focus:outline-none cursor-pointer"
          >
            <option value="All" className="bg-[#091e2c] text-white">All Status</option>
            <option value="Active" className="bg-[#091e2c] text-white">Active Only</option>
            <option value="Inactive" className="bg-[#091e2c] text-white">Inactive Only</option>
          </select>
        </div>

        {/* Unit Option Filter */}
        <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
          <span className="text-cyan-200/80 font-bold text-[11px] whitespace-nowrap">Unit:</span>
          <select
            id="master-items-unit-filter"
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value as any)}
            className="bg-transparent text-cyan-100 font-bold text-xs focus:outline-none cursor-pointer"
          >
            <option value="All" className="bg-[#091e2c] text-white">All Units</option>
            <option value="Meters" className="bg-[#091e2c] text-white">Meters (m)</option>
            <option value="Coils" className="bg-[#091e2c] text-white">Coils</option>
            <option value="Bobin" className="bg-[#091e2c] text-white">Bobin</option>
          </select>
        </div>

        {/* Special Item Filter */}
        {subTab === 'items_list' && (
          <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
            <Sparkles className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
            <span className="text-cyan-200/80 font-bold text-[11px] whitespace-nowrap">Special:</span>
            <select
              id="master-items-special-filter"
              value={specialItemFilter}
              onChange={(e) => setSpecialItemFilter(e.target.value as any)}
              className="bg-transparent text-cyan-100 font-bold text-xs focus:outline-none cursor-pointer"
            >
              <option value="with" className="bg-[#091e2c] text-white">⚡ With Special</option>
              <option value="without" className="bg-[#091e2c] text-white">📦 Without Special</option>
              <option value="special_only" className="bg-[#091e2c] text-white">✨ Special Only</option>
            </select>
          </div>
        )}

        {/* Showing Items Counter */}
        <div className="flex items-center space-x-2 text-[11px] text-slate-300 whitespace-nowrap shrink-0 pl-1">
          <span>Showing <strong className="text-emerald-400 font-bold font-mono">{filteredItems.length}</strong> of <span className="font-mono">{activeItemCount}</span> {statusFilter === 'Active' ? 'Active Items' : 'Items'}</span>
        </div>
      </div>

      {/* Add New Item Modal Form */}
      {isAddingNew && (
        <form
          onSubmit={handleCreateItem}
          className="p-4 bg-[#081b28]/90 border-b border-cyan-500/25 space-y-3 text-xs shadow-inner"
        >
          <div className="flex items-center space-x-3 bg-[#061520] p-2 rounded-lg border border-cyan-500/30 w-fit">
            <span className="font-bold text-cyan-200">Item Type:</span>
            <label className="flex items-center space-x-1 cursor-pointer">
              <input
                type="radio"
                name="itemTypeRadio"
                checked={!isSpecialItemType}
                onChange={() => setIsSpecialItemType(false)}
                className="text-cyan-400 focus:ring-cyan-400 accent-cyan-400"
              />
              <span className="font-semibold text-white">Standard Item</span>
            </label>
            <label className="flex items-center space-x-1 cursor-pointer">
              <input
                type="radio"
                name="itemTypeRadio"
                checked={isSpecialItemType}
                onChange={() => {
                  setIsSpecialItemType(true);
                  setNewItem((prev) => ({ ...prev, unit: prev.unit || 'Meters' }));
                  setStockMultiplierInput((prev) => (prev < 50 ? 500 : prev));
                }}
                className="text-amber-400 focus:ring-amber-400 accent-amber-400"
              />
              <span className="font-bold text-amber-300 flex items-center space-x-1">
                <span>⚡ Special Item (Length / Coil Variant)</span>
              </span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {isSpecialItemType && (
              <div className="sm:col-span-2">
                <label className="block font-semibold text-amber-200 mb-1">Select Base Stock Item *</label>
                <select
                  value={selectedBaseItemId}
                  onChange={(e) => {
                    const bId = e.target.value;
                    setSelectedBaseItemId(bId);
                    const bItem = items.find((i) => i.id === bId);
                    if (bItem) {
                      const autoName = generateSpecialItemDisplayName(bItem.name, bItem.category);
                      const unit = newItem.unit || 'Meters';
                      const deductVal = stockMultiplierInput || (unit === 'Meters' ? 500 : 5);
                      const autoRate = calculateSpecialItemRate(bItem.rate, deductVal, unit);
                      setNewItem((prev) => ({
                        ...prev,
                        name: autoName,
                        category: bItem.category,
                        unit: unit,
                        rate: autoRate,
                        sizeSpec: `${bItem.sizeSpec || bItem.name} (${unit === 'Meters' ? deductVal + ' m' : (deductVal * 100) + ' m'})`
                      }));
                    }
                  }}
                  className="w-full p-1.5 border border-amber-400/40 rounded bg-[#061520] font-bold text-white focus:ring-2 focus:ring-amber-400"
                  required={isSpecialItemType}
                >
                  <option value="">-- Choose Base Stock Item (Category-wise) --</option>
                  {Array.from(new Set(items.filter((i) => !i.isSpecialItem).map((i) => i.category || 'Standard Wires'))).map((catName) => {
                    const catItems = items.filter((i) => !i.isSpecialItem && (i.category || 'Standard Wires') === catName);
                    if (catItems.length === 0) return null;
                    return (
                      <optgroup key={catName} label={`📂 ${catName}`}>
                        {catItems.map((i) => (
                          <option key={i.id} value={i.id}>
                            {formatItemNameWithCategoryIfDuplicate(i, items)} ({i.unit || 'Coils'}) - ৳{i.rate}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
            )}

            <div className={isSpecialItemType ? 'sm:col-span-2' : 'sm:col-span-2'}>
              <label className="block font-semibold text-cyan-200/90 mb-1">
                {isSpecialItemType ? 'Special Item Bill Display Name' : 'Item Name'}
              </label>
              <input
                type="text"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                placeholder={isSpecialItemType ? 'e.g. 1 X 1.5 Rm (7-w) BYA (500 m Length)' : 'e.g. 1 X 1.5 Re (1-w)'}
                className="w-full p-1.5 border border-cyan-500/30 rounded bg-[#061520] text-white placeholder-slate-400 font-medium focus:ring-2 focus:ring-cyan-400"
                required
              />
            </div>

            {isSpecialItemType ? (
              <>
                <div>
                  <label className="block font-semibold text-amber-200 mb-1">
                    {newItem.unit === 'Meters' ? 'Base Meters Deduct' : 'Base Coils Deduct'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={stockMultiplierInput}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setStockMultiplierInput(val);
                      if (selectedBaseItemId) {
                        const bItem = items.find((i) => i.id === selectedBaseItemId);
                        if (bItem) {
                          setNewItem((prev) => ({
                            ...prev,
                            rate: calculateSpecialItemRate(bItem.rate, val, prev.unit || 'Meters')
                          }));
                        }
                      }
                    }}
                    placeholder={newItem.unit === 'Meters' ? 'e.g. 500' : 'e.g. 5'}
                    className="w-full p-1.5 border border-amber-400/40 rounded bg-[#061520] font-black text-amber-200 focus:ring-2 focus:ring-amber-400 text-center"
                    required
                  />
                  {newItem.unit === 'Meters' && (
                    <span className="block text-[10px] text-amber-300 font-medium text-center mt-0.5">
                      1 Coil = 100m ({stockMultiplierInput ? (stockMultiplierInput / 100).toFixed(2).replace(/\.00$/, '') : 0} Coils)
                    </span>
                  )}
                </div>
                <div>
                  <label className="block font-semibold text-purple-200 mb-1">Unit Option *</label>
                  <select
                    value={newItem.unit === 'Coils' ? 'Coils' : 'Meters'}
                    onChange={(e) => {
                      const newUnit = e.target.value;
                      let newDeduct = stockMultiplierInput;
                      if (newUnit === 'Meters' && stockMultiplierInput < 50) {
                        newDeduct = (stockMultiplierInput || 5) * 100;
                        setStockMultiplierInput(newDeduct);
                      } else if (newUnit === 'Coils' && stockMultiplierInput >= 50) {
                        newDeduct = Math.max(1, Math.round(stockMultiplierInput / 100));
                        setStockMultiplierInput(newDeduct);
                      }
                      let newRate = newItem.rate;
                      if (selectedBaseItemId) {
                        const bItem = items.find((i) => i.id === selectedBaseItemId);
                        if (bItem) {
                          newRate = calculateSpecialItemRate(bItem.rate, newDeduct, newUnit);
                        }
                      }
                      setNewItem((prev) => ({
                        ...prev,
                        unit: newUnit,
                        rate: newRate
                      }));
                    }}
                    className="w-full p-1.5 border border-purple-400/35 rounded bg-[#061520] font-bold text-purple-200 focus:ring-2 focus:ring-purple-400 text-center cursor-pointer"
                    required
                  >
                    <option value="Meters">Meters (m)</option>
                    <option value="Coils">Coils</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block font-semibold text-cyan-200/90 mb-1">Category *</label>
                  <select
                    value={newItem.category}
                    onChange={(e) => {
                      const selCat = e.target.value;
                      if (selCat !== '__new__') {
                        const existingCatItems = items.filter(
                          (i) => (i.category || '').trim().toLowerCase() === selCat.trim().toLowerCase()
                        );
                        const maxSerial = existingCatItems.reduce((max, i) => {
                          const ser = Number(i.serial ?? (i.name.match(/^(\d+)[.)\s]/)?.[1] || 0));
                          return ser > max ? ser : max;
                        }, 0);
                        setNewItem({ ...newItem, category: selCat, serial: String(maxSerial + 1) });
                      } else {
                        setNewItem({ ...newItem, category: '__new__' });
                      }
                    }}
                    className="w-full p-1.5 border border-cyan-500/30 rounded bg-[#061520] font-bold text-white focus:ring-2 focus:ring-cyan-400 cursor-pointer"
                  >
                    {categoriesList.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value="__new__">+ New Category...</option>
                  </select>
                  {newItem.category === '__new__' && (
                    <input
                      type="text"
                      value={customNewItemCategory}
                      onChange={(e) => setCustomNewItemCategory(e.target.value)}
                      placeholder="Type Category Name..."
                      className="mt-1 w-full p-1 border border-emerald-400/40 rounded bg-[#061520] font-semibold text-emerald-200 focus:ring-1 focus:ring-emerald-400 text-xs"
                      required
                    />
                  )}
                </div>
                <div>
                  <label className="block font-semibold text-cyan-200/90 mb-1">SL / Serial #</label>
                  <input
                    type="text"
                    value={newItem.serial ?? ''}
                    onChange={(e) => setNewItem({ ...newItem, serial: e.target.value })}
                    placeholder="e.g. 1"
                    className="w-full p-1.5 border border-cyan-500/30 rounded bg-[#061520] font-mono font-bold text-white text-center focus:ring-2 focus:ring-cyan-400"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-cyan-200/90 mb-1">Unit Option *</label>
                  <select
                    value={newItem.unit === 'Meters' ? 'Meters' : 'Coils'}
                    onChange={(e) => {
                      const newUnit = e.target.value;
                      const oldUnit = newItem.unit || 'Coils';
                      let newRate = newItem.rate;
                      if (newUnit === 'Meters' && oldUnit !== 'Meters' && newItem.rate > 0) {
                        newRate = parseFloat((newItem.rate / 100).toFixed(4));
                      } else if (newUnit === 'Coils' && oldUnit === 'Meters' && newItem.rate > 0) {
                        newRate = parseFloat((newItem.rate * 100).toFixed(2));
                      }
                      setNewItem({ ...newItem, unit: newUnit, rate: newRate });
                    }}
                    className="w-full p-1.5 border border-cyan-500/30 rounded bg-[#061520] font-bold text-white focus:ring-2 focus:ring-cyan-400 text-center cursor-pointer"
                    required
                  >
                    <option value="Coils">Coils</option>
                    <option value="Meters">Meters (m)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-cyan-200/90 mb-1">Opening Stock ({newItem.unit || 'Coils'})</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={newItem.openingStock}
                    onChange={(e) => setNewItem({ ...newItem, openingStock: parseFloat(e.target.value) || 0 })}
                    className="w-full p-1.5 border border-cyan-500/30 rounded bg-[#061520] font-bold text-cyan-200"
                    required
                  />
                </div>
              </>
            )}

            <div>
              <label className="block font-semibold text-cyan-200/90 mb-1">Rate / Price (Tk)</label>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="0.00"
                value={newItem.rate === 0 ? '' : newItem.rate}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setNewItem({ ...newItem, rate: isNaN(val) ? 0 : val });
                }}
                className="w-full p-1.5 border border-cyan-500/30 rounded bg-[#061520] font-bold text-emerald-300"
                required
              />
            </div>

            <div className="flex items-end space-x-2">
              <button
                type="submit"
                className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 p-1.5 rounded font-black flex items-center justify-center space-x-1 cursor-pointer"
              >
                <FileCheck className="w-3.5 h-3.5" />
                <span>{isSpecialItemType ? 'Save Special Item' : 'Save Item'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddingNew(false);
                  setIsSpecialItemType(false);
                }}
                className="bg-[#0c2638] hover:bg-[#11334a] text-slate-200 border border-cyan-500/30 px-3 py-1.5 rounded font-semibold cursor-pointer text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Bulk Delete Selection Bar */}
      {selectedIds.size > 0 && !isReadOnly && (
        <div className="bg-rose-950/85 text-white p-3 px-4 flex items-center justify-between gap-3 border-b border-rose-500/35 text-xs font-semibold animate-fadeIn flex-wrap">
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <span className="bg-rose-500/25 text-rose-200 px-2 py-0.5 rounded font-mono border border-rose-400/35">
              {selectedIds.size} {selectedIds.size === 1 ? 'item' : 'items'} selected
            </span>
            {selectedIds.size < (subTab === 'special_items' ? specialItems.length : items.length) && (
              <button
                type="button"
                onClick={() => {
                  const allDirectoryItems = subTab === 'special_items' ? specialItems : items;
                  setSelectedIds(new Set(allDirectoryItems.map((it) => it.id)));
                }}
                className="bg-[#081b28] hover:bg-rose-500/20 text-amber-200 border border-rose-400/35 px-2.5 py-0.5 rounded text-[11px] font-bold transition-colors cursor-pointer"
              >
                Select All Directory Items ({subTab === 'special_items' ? specialItems.length : items.length})
              </button>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleBulkDelete}
              className="bg-rose-600 hover:bg-rose-500 text-white px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 transition-colors shadow-2xs cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected ({selectedIds.size})</span>
            </button>
            <button
              type="button"
              onClick={handleClearSelection}
              className="bg-[#081b28] hover:bg-[#0e2a3d] text-rose-200 border border-rose-400/30 px-2.5 py-1.5 rounded-lg transition-colors text-[11px] cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl p-6 max-w-md w-full shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-rose-400/35 text-white space-y-4 animate-scaleUp">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-3 bg-rose-500/15 border border-rose-400/30 rounded-full">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Confirm Bulk Delete</h3>
                <p className="text-xs text-slate-400">Selected items will be moved to the Item Trash Bin.</p>
              </div>
            </div>
            <p className="text-xs text-slate-200">
              Are you sure you want to delete <strong className="text-rose-300 font-bold">{selectedIds.size}</strong> selected item(s) from your Master Item Directory?
            </p>
            <div className="flex items-center justify-end space-x-3 pt-2 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmBulkDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center space-x-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Yes, Delete {selectedIds.size} Items</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Items Confirmation Modal */}
      {showDeleteAllConfirm && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl p-6 max-w-md w-full shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-rose-400/35 text-white space-y-4 animate-scaleUp">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-3 bg-rose-500/15 border border-rose-400/30 rounded-full">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {subTab === 'special_items' ? 'Delete All Special Items?' : 'Delete All Master Items?'}
                </h3>
                <p className="text-xs text-slate-400">All items will be moved safely to the Item Trash Bin.</p>
              </div>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed">
              Are you sure you want to delete all{' '}
              <strong className="text-rose-300 font-bold">
                {subTab === 'special_items' ? specialItems.length : items.length}
              </strong>{' '}
              item(s) (including active, inactive, and special items) from your{' '}
              {subTab === 'special_items' ? 'Special Item Directory' : 'Master Item Directory'}?
            </p>
            <div className="flex items-center justify-end space-x-3 pt-2 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setShowDeleteAllConfirm(false)}
                className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteAllItems}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center space-x-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>
                  Yes, Delete All ({subTab === 'special_items' ? specialItems.length : items.length})
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Items Table - Responsive for Mobile & Desktop with Smooth Scrolling */}
      <div className="w-full overflow-x-auto border border-cyan-500/25 bg-[#071824]/70 rounded-xl shadow-xs scrollbar-thin">
        <table className="w-full min-w-[760px] table-fixed text-left text-xs border-collapse">
          <thead className="bg-[#0c2638] border-b border-cyan-500/30 select-none">
            <tr className="text-cyan-200 font-bold uppercase text-[10px]">
              <th className="p-2 w-[3%] text-center">
                <input
                  type="checkbox"
                  checked={filteredItems.length > 0 && filteredItems.every((i) => selectedIds.has(i.id))}
                  onChange={handleSelectAll}
                  className="rounded border-cyan-500/40 text-cyan-500 focus:ring-cyan-400 cursor-pointer"
                  title="Select All"
                />
              </th>
              <th className="p-2 w-[4.5%] text-center font-mono">
                #
              </th>
              {subTab === 'special_items' ? (
                <>
                  <th className="p-2 w-[22%] min-w-[150px]">Special Item Bill Name</th>
                  <th className="p-2 w-[18%] min-w-[130px]">Linked Base Stock Item</th>
                  <th className="p-2 w-[9%] min-w-[85px] text-center bg-amber-500/15 text-amber-200 border-x border-amber-500/25">
                    Deduct Ratio
                  </th>
                  <th className="p-2 w-[11%] min-w-[110px] text-center bg-purple-500/15 text-purple-200 border-r border-purple-500/25">
                    Unit
                  </th>
                  {showOpeningStock && (
                    <th className="p-2 w-[7%] min-w-[65px] text-center bg-cyan-500/15 text-cyan-200 border-r border-cyan-500/25">
                      Opening
                    </th>
                  )}
                  <th className="p-2 w-[13%] min-w-[125px] text-center bg-emerald-500/15 text-emerald-300 border-r border-emerald-500/25">
                    Today Stock
                  </th>
                  <th className="p-2 w-[8%] min-w-[75px] text-right">Price (Tk)</th>
                  <th className="p-2 w-[9%] min-w-[80px]">Category</th>
                  <th className="p-2 w-[4%] text-center">Status</th>
                  <th className="p-2 w-[6%] text-center">Actions</th>
                </>
              ) : (
                <>
                  <th className={`p-2 ${showOpeningStock ? 'w-[28%]' : 'w-[31%]'} truncate`}>Item Description / Name</th>
                  {showOpeningStock && (
                    <th className="p-2 w-[8%] text-center bg-cyan-500/15 text-cyan-200 border-x border-cyan-500/25">
                      Opening
                    </th>
                  )}
                  <th className={`p-2 ${showOpeningStock ? 'w-[9%]' : 'w-[11%]'} text-center bg-emerald-500/15 text-emerald-300 border-r border-emerald-500/25`}>
                    Today Stock
                  </th>
                  <th className={`p-2 ${showOpeningStock ? 'w-[5%]' : 'w-[6%]'} text-center`}>Unit</th>
                  <th className={`p-2 ${showOpeningStock ? 'w-[9%]' : 'w-[10%]'} text-right`}>Price (Tk)</th>
                  <th className={`p-2 ${showOpeningStock ? 'w-[11%]' : 'w-[12%]'} text-right bg-emerald-500/15 text-emerald-200 font-black border-r border-emerald-500/25`}>
                    Amount (Tk)
                  </th>
                  <th className="p-2 w-[12%]">Category</th>
                  <th className="p-2 w-[4%] text-center">Status</th>
                  <th className="p-2 w-[7%] text-center">Actions</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
            {(() => {
              const renderItemRow = (item: Item, index: number) => {
              const isEditing = editingId === item.id;
              const isSelected = selectedIds.has(item.id);

              if (isEditing && editForm) {
                if (subTab === 'special_items') {
                  const itemOpening = getItemOpeningStock(item, activeBranchId);
                  const itemImport = getItemFactoryImportQty(item, factoryImports, activeBranchId);
                  const itemSales = (activeBranchId && activeBranchId !== 'ALL' && storedBills.length > 0)
                    ? getItemTotalSales(item, storedBills, items, activeBranchId)
                    : (Number(item.totalSales) || 0);
                  const { partyReturn: rParty, factoryReturn: rFactory } = getItemStockReturns(item, stockReturns, activeBranchId, activeBranchName);
                  const sLive = (editForm.openingStock ?? itemOpening) + itemImport + rParty - itemSales - rFactory;

                  return (
                    <tr key={item.id ? `${item.id}-${index}` : `item-${index}`} ref={editRowRef} className="bg-amber-500/15 border-b border-amber-500/30">
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(item.id)}
                          className="rounded border-cyan-500/40 text-amber-400 focus:ring-amber-400 cursor-pointer"
                        />
                      </td>
                      <td className="p-2 text-center font-mono font-bold text-xs text-slate-300">
                        <input
                          type="text"
                          value={editForm.serial ?? editForm.serialNo ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditForm({ ...editForm, serial: val, serialNo: val });
                          }}
                          placeholder={String(getItemDisplaySerial(item, index))}
                          className="w-full p-1 bg-[#061520] text-amber-200 border border-amber-400/50 rounded text-xs text-center font-mono font-bold"
                          title="Edit Item Serial #"
                        />
                      </td>
                      <td className="p-2 min-w-0">
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full p-1 bg-[#061520] text-white border border-amber-400/50 rounded text-xs font-semibold"
                        />
                      </td>
                      <td className="p-2 min-w-0">
                        <select
                          value={editForm.baseItemId || ''}
                          onChange={(e) => {
                            const bId = e.target.value;
                            const bItem = standardItems.find((i) => i.id === bId);
                            const unit = editForm.unit === 'Coils' ? 'Coils' : 'Meters';
                            const deduct = unit === 'Meters'
                              ? ((editForm.stockMultiplier || 1) * 100)
                              : (editForm.stockMultiplier || 1);
                            const autoRate = bItem ? calculateSpecialItemRate(bItem.rate, deduct, unit) : editForm.rate;
                            setEditForm({
                              ...editForm,
                              baseItemId: bId,
                              baseItemCode: bItem?.code,
                              rate: autoRate
                            });
                          }}
                          className="w-full p-1 border border-amber-400/50 rounded text-xs font-semibold bg-[#061520] text-white"
                        >
                          <option value="">-- Choose Base Item (Category-wise) --</option>
                          {Array.from(new Set(standardItems.map((i) => i.category || 'Standard Wires'))).map((catName) => {
                            const catItems = standardItems.filter((i) => (i.category || 'Standard Wires') === catName);
                            if (catItems.length === 0) return null;
                            return (
                              <optgroup key={catName} label={`📂 ${catName}`}>
                                {catItems.map((base) => (
                                  <option key={base.id} value={base.id}>
                                    {base.name} ({base.unit || 'Coils'}) - ৳{base.rate}
                                  </option>
                                ))}
                              </optgroup>
                            );
                          })}
                        </select>
                      </td>
                      <td className="p-2 text-center bg-amber-500/15">
                        <div className="space-y-0.5">
                          <input
                            type="number"
                            min="1"
                            value={
                              editForm.unit === 'Meters'
                                ? Math.round((editForm.stockMultiplier || 1) * 100)
                                : (editForm.stockMultiplier || 1)
                            }
                            onChange={(e) => {
                              const rawVal = parseFloat(e.target.value) || 0;
                              const isMtr = editForm.unit === 'Meters';
                              const mult = isMtr ? rawVal / 100 : rawVal;
                              const bItem = standardItems.find(
                                (i) => i.id === editForm.baseItemId || (i.code && i.code === editForm.baseItemCode)
                              );
                              const autoRate = bItem
                                ? calculateSpecialItemRate(bItem.rate, rawVal, isMtr ? 'Meters' : 'Coils')
                                : editForm.rate;
                              setEditForm({
                                ...editForm,
                                stockMultiplier: mult,
                                rate: autoRate
                              });
                            }}
                            className="w-full p-1 bg-[#061520] border border-amber-400/50 rounded text-xs text-center font-bold text-amber-200"
                            title={editForm.unit === 'Meters' ? 'Base Meters Deduct' : 'Base Coils Deduct'}
                          />
                          <span className="block text-[9px] font-bold text-amber-300">
                            {editForm.unit === 'Meters' ? 'Meters' : 'Coils'}
                          </span>
                        </div>
                      </td>
                      <td className="p-2 text-center bg-purple-500/15">
                        <select
                          value={editForm.unit === 'Coils' ? 'Coils' : 'Meters'}
                          onChange={(e) => {
                            const newUnit = e.target.value;
                            const bItem = standardItems.find(
                              (i) => i.id === editForm.baseItemId || (i.code && i.code === editForm.baseItemCode)
                            );
                            const mult = editForm.stockMultiplier || 1;
                            let autoRate = editForm.rate;
                            if (bItem) {
                              if (newUnit === 'Meters') {
                                autoRate = Number(calculateSpecialItemRate(bItem.rate, mult * 100, 'Meters').toFixed(2));
                              } else {
                                autoRate = Number(calculateSpecialItemRate(bItem.rate, mult, 'Coils').toFixed(2));
                              }
                            } else {
                              const metersPerCoil = getItemCoilMeters(editForm) || 90;
                              if (newUnit === 'Meters' && editForm.unit === 'Coils' && editForm.rate > 0) {
                                autoRate = Number((editForm.rate / metersPerCoil).toFixed(2));
                              } else if (newUnit === 'Coils' && editForm.unit === 'Meters' && editForm.rate > 0) {
                                autoRate = Number((editForm.rate * metersPerCoil).toFixed(2));
                              }
                            }
                            setEditForm({
                              ...editForm,
                              unit: newUnit,
                              rate: autoRate
                            });
                          }}
                          className="w-full p-1 border border-purple-400/50 rounded text-xs text-center font-bold text-purple-200 bg-[#061520] cursor-pointer"
                        >
                          <option value="Meters">Meters (m)</option>
                          <option value="Coils">Coils</option>
                        </select>
                      </td>
                      {showOpeningStock && (
                        <td className="p-2 text-center bg-cyan-500/15">
                          <input
                            type="number"
                            value={editForm.openingStock ?? itemOpening}
                            onChange={(e) => setEditForm({ ...editForm, openingStock: parseFloat(e.target.value) || 0 })}
                            className="w-full p-1 bg-[#061520] border border-cyan-500/40 rounded text-xs text-center font-bold text-cyan-200"
                            title="Opening stock"
                          />
                        </td>
                      )}
                      <td className="p-2 text-center bg-emerald-500/15 font-mono font-bold text-emerald-300">
                        <div className="flex flex-col items-center">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={editForm.openingStock === 0 ? '' : (editForm.openingStock ?? '')}
                            placeholder="0"
                            onChange={(e) => setEditForm({ ...editForm, openingStock: e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0) })}
                            className="w-16 p-1 border border-cyan-400/50 rounded text-xs text-center font-bold text-cyan-200 bg-[#061520]"
                            title="Edit Quantity / Opening Stock"
                          />
                          <span className="text-[9px] text-emerald-300 font-semibold mt-0.5">Live: {(sLive ?? 0).toLocaleString('en-IN')}</span>
                        </div>
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editForm.rate !== undefined && editForm.rate !== null && !isNaN(editForm.rate) ? Number(editForm.rate).toFixed(2) : '0.00'}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setEditForm({ ...editForm, rate: isNaN(val) ? 0 : Number(val.toFixed(2)) });
                          }}
                          className="w-full p-1 bg-[#061520] text-white border border-amber-400/50 rounded text-xs text-right font-bold font-mono"
                          title="Unit price (stay decimal with radix point)"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={editForm.category || ''}
                          onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                          className="w-full p-1 border border-amber-400/50 rounded text-xs font-semibold bg-[#061520] text-white"
                        >
                          <option value="">-- Select Category --</option>
                          {categoriesList.map((cat, cIdx) => (
                            <option key={`${cat}-${cIdx}`} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => setEditForm({ ...editForm, isActive: editForm.isActive === false ? true : false })}
                          className="p-1 rounded-full cursor-pointer transition-colors inline-flex items-center justify-center hover:bg-cyan-500/15"
                          title={editForm.isActive === false ? 'Inactive (Click to activate)' : 'Active (Click to deactivate)'}
                        >
                          {editForm.isActive === false ? (
                            <XCircle className="w-4 h-4 text-slate-400" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          )}
                        </button>
                      </td>
                      <td className="p-2 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              handleSaveEdit();
                            }}
                            onClick={handleSaveEdit}
                            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 p-1 rounded cursor-pointer shadow-xs flex items-center justify-center gap-1 font-bold text-[11px]"
                            title="Save / Confirm (Sign)"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 p-1 rounded hover:bg-[#13364d] cursor-pointer"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                const liveStockVal = getItemLiveStock(
                  { ...item, ...editForm, openingStock: editForm.openingStock ?? item.openingStock },
                  factoryImports,
                  0,
                  activeBranchId,
                  storedBills,
                  items,
                  stockReturns,
                  deliveryChallans,
                  colorExchanges,
                  activeBranchName
                );

                return (
                  <tr key={item.id ? `${item.id}-${index}` : `item-${index}`} ref={editRowRef} className="bg-cyan-500/15 border-b border-cyan-500/30">
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(item.id)}
                        className="rounded border-cyan-500/40 text-cyan-500 focus:ring-cyan-400 cursor-pointer"
                      />
                    </td>
                    <td className="p-2 text-center font-mono font-bold text-xs text-slate-300">
                      <input
                        type="text"
                        value={editForm.serial ?? editForm.serialNo ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditForm({ ...editForm, serial: val, serialNo: val });
                        }}
                        placeholder={String(getItemDisplaySerial(item, index))}
                        className="w-full p-1 bg-[#061520] text-cyan-200 border border-cyan-500/40 rounded text-xs text-center font-mono font-bold"
                        title="Edit Item Serial #"
                      />
                    </td>
                    <td className="p-2 min-w-0">
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full p-1 bg-[#061520] text-white border border-cyan-500/35 rounded text-xs font-semibold"
                      />
                    </td>
                    {showOpeningStock && (
                      <td className="p-2 text-center bg-cyan-500/15">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={editForm.openingStock === 0 ? '' : (editForm.openingStock ?? '')}
                          placeholder="0"
                          onChange={(e) => setEditForm({ ...editForm, openingStock: e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0) })}
                          className="w-full p-1 bg-[#061520] border border-cyan-500/35 rounded text-xs text-center font-bold text-cyan-200"
                          title="Opening stock used during initial item entry"
                        />
                      </td>
                    )}
                    <td className="p-2 text-center bg-emerald-500/15 font-mono font-bold text-emerald-300">
                      <div className="flex flex-col items-center">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={editForm.openingStock === 0 ? '' : (editForm.openingStock ?? '')}
                          placeholder="0"
                          onChange={(e) => setEditForm({ ...editForm, openingStock: e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0) })}
                          className="w-16 p-1 border border-cyan-400/50 rounded text-xs text-center font-bold text-cyan-200 bg-[#061520]"
                          title="Edit Quantity / Opening Stock"
                        />
                        <span className="text-[9px] text-emerald-300 font-semibold mt-0.5">Today: {(liveStockVal ?? 0).toLocaleString('en-IN')}</span>
                      </div>
                    </td>
                    <td className="p-2">
                      <select
                        value={editForm.unit || 'Coils'}
                        onChange={(e) => {
                          const newUnit = e.target.value;
                          const oldUnit = editForm.unit || 'Coils';
                          let newRate = editForm.rate;
                          const metersPerCoil = getItemCoilMeters(editForm) || 90;
                          if (/meters?|mtrs?|^m$/i.test(newUnit) && !/meters?|mtrs?|^m$/i.test(oldUnit) && editForm.rate > 0) {
                            newRate = Number((editForm.rate / metersPerCoil).toFixed(2));
                          } else if (!/meters?|mtrs?|^m$/i.test(newUnit) && /meters?|mtrs?|^m$/i.test(oldUnit) && editForm.rate > 0) {
                            newRate = Number((editForm.rate * metersPerCoil).toFixed(2));
                          }
                          setEditForm({ ...editForm, unit: newUnit, rate: newRate });
                        }}
                        className="w-full p-1 border border-cyan-500/35 rounded text-xs text-center font-bold text-white bg-[#061520]"
                      >
                        <option value="Coils">Coils</option>
                        <option value="Meters">Meters</option>
                      </select>
                    </td>
                    <td className="p-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editForm.rate !== undefined && editForm.rate !== null && !isNaN(editForm.rate) ? Number(editForm.rate).toFixed(2) : '0.00'}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setEditForm({ ...editForm, rate: isNaN(val) ? 0 : Number(val.toFixed(2)) });
                        }}
                        className="w-full p-1 bg-[#061520] text-white border border-cyan-500/35 rounded text-xs text-right font-bold font-mono"
                        title="Unit price (stay decimal with radix point)"
                      />
                    </td>
                    <td className="p-2 text-right font-bold text-emerald-200 font-mono bg-emerald-500/15">
                      ৳{(liveStockVal * (editForm.rate || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-2">
                      <select
                        value={editForm.category || ''}
                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                        className="w-full p-1 border border-cyan-500/35 rounded text-xs font-semibold bg-[#061520] text-white"
                      >
                        <option value="">-- Select Category --</option>
                        {categoriesList.map((cat, cIdx) => (
                          <option key={`${cat}-${cIdx}`} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => setEditForm({ ...editForm, isActive: editForm.isActive === false ? true : false })}
                        className="p-1 rounded-full cursor-pointer transition-colors inline-flex items-center justify-center hover:bg-cyan-500/15"
                        title={editForm.isActive === false ? 'Inactive (Click to activate)' : 'Active (Click to deactivate)'}
                      >
                        {editForm.isActive === false ? (
                          <XCircle className="w-4 h-4 text-slate-400" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        )}
                      </button>
                    </td>
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        <button
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={handleSaveEdit}
                          className="bg-emerald-500 text-slate-950 p-1 rounded hover:bg-emerald-400 cursor-pointer"
                          title="Save"
                        >
                          <Save className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 p-1 rounded hover:bg-[#13364d] cursor-pointer"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }

              if (item.isSpecialItem && subTab === 'items_list') {
                const cachedStock = itemStockCache.get(item.id);
                const itemOpening = cachedStock?.opening ?? getItemOpeningStock(item, activeBranchId);
                const sLive = cachedStock?.live ?? 0;

                return (
                  <tr
                    key={item.id ? `${item.id}-${index}` : `item-${index}`}
                    className={`border-b border-cyan-500/15 transition-colors ${
                      isSelected ? 'bg-rose-500/15 hover:bg-rose-500/20' : 'hover:bg-cyan-500/[0.06]'
                    }`}
                  >
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(item.id)}
                        className="rounded border-cyan-500/40 text-cyan-500 focus:ring-cyan-400 cursor-pointer"
                      />
                    </td>
                    <td className="p-2 text-center font-mono text-slate-400 text-xs font-bold">
                      {getItemDisplaySerial(item, index)}
                    </td>
                    <td className="p-2 font-semibold text-white truncate" title={getItemDisplayName(item)}>
                      {getItemDisplayName(item)}
                    </td>
                    {showOpeningStock && (
                      <td className="p-2 text-center font-bold text-cyan-200 bg-cyan-500/10 border-x border-cyan-500/20 font-mono text-xs">
                        {(itemOpening ?? 0).toLocaleString('en-IN')}
                      </td>
                    )}
                    <td className="p-2 text-center font-extrabold text-emerald-300 bg-emerald-500/10 border-r border-emerald-500/20 font-mono text-xs">
                      <div>{(sLive ?? 0).toLocaleString('en-IN')}</div>
                    </td>
                    <td className="p-3 text-center text-slate-300">
                      {item.unit || 'Bobin'}
                    </td>
                    <td className="p-2 text-right font-bold text-emerald-300 font-mono text-xs">
                      ৳{Number(item.rate ?? 0).toLocaleString('en-IN', { minimumFractionDigits: (item.rate ?? 0) % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-right font-extrabold text-emerald-200 bg-emerald-500/10 border-r border-emerald-500/20 font-mono text-xs whitespace-nowrap">
                      ৳{((sLive || 0) * (item.rate || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 min-w-0">
                      <span className="bg-[#0e2a3d] text-cyan-200 px-2 py-0.5 rounded text-[11px] font-bold border border-cyan-500/25 truncate inline-block max-w-full" title={item.category}>
                        {item.category}
                      </span>
                    </td>
                    <td className="p-2 text-center">
                      {(() => {
                        const isRowActive = activeBranchId && activeBranchId !== 'ALL'
                          ? isItemActiveInBranch(item, activeBranchId, activeBranchName)
                          : item.isActive !== false;
                        return (
                          <button
                            type="button"
                            onClick={() => handleToggleActiveStatus(item.id)}
                            className="p-1 rounded-full cursor-pointer transition-colors inline-flex items-center justify-center hover:bg-cyan-500/15"
                            title={isRowActive
                              ? (activeBranchId && activeBranchId !== 'ALL' ? `Active in ${activeBranchName || 'Sales Center'} (Click to deactivate)` : 'Active (Click to deactivate)')
                              : (activeBranchId && activeBranchId !== 'ALL' ? `Inactive in ${activeBranchName || 'Sales Center'} (Click to activate)` : 'Inactive (Click to activate)')
                            }
                          >
                            {!isRowActive ? (
                              <XCircle className="w-4 h-4 text-slate-400" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            )}
                          </button>
                        );
                      })()}
                    </td>
                    <td className="p-3 text-center">
                      {isReadOnly ? (
                        <span className="text-[10px] text-slate-400 font-semibold italic">View Only</span>
                      ) : (
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            type="button"
                            onClick={() => handleExportSingleItem(item)}
                            className="text-slate-400 hover:text-cyan-300 p-1 rounded hover:bg-cyan-500/15 cursor-pointer"
                            title="Backup / Export Single Item (JSON)"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleStartEdit(item)}
                            className="text-slate-400 hover:text-emerald-300 p-1 rounded hover:bg-emerald-500/15 cursor-pointer"
                            title="Edit Item"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id)}
                            className="text-slate-400 hover:text-rose-400 p-1 rounded hover:bg-rose-500/15 cursor-pointer"
                            title="Delete / Move to Trash"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              }

              if (subTab === 'special_items') {
                const baseItem = resolveBaseItemForSpecialItem(item, standardItems.length > 0 ? standardItems : items) ||
                  (item.baseItemId ? standardItems.find((i) => i.id === item.baseItemId) || items.find((i) => i.id === item.baseItemId) : undefined);
                const cachedStock = itemStockCache.get(item.id);
                const itemOpening = cachedStock?.opening ?? getItemOpeningStock(item, activeBranchId, activeBranchName);
                const sLive = cachedStock?.live ?? 0;

                return (
                  <tr
                    key={item.id ? `${item.id}-${index}` : `item-${index}`}
                    className={`border-b border-cyan-500/15 transition-colors ${
                      isSelected ? 'bg-amber-500/15' : 'hover:bg-cyan-500/[0.06]'
                    }`}
                  >
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(item.id)}
                        className="rounded border-cyan-500/40 text-amber-400 focus:ring-amber-400 cursor-pointer"
                      />
                    </td>
                    <td className="p-3 text-center font-mono text-slate-400">{getItemDisplaySerial(item, index)}</td>
                    <td className="p-2 min-w-0 font-semibold text-amber-200 flex items-center space-x-1.5 truncate" title={item.name}>
                      <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      <span className="truncate">{formatItemNameWithCategoryIfDuplicate(item, items)}</span>
                    </td>
                    <td className="p-2 min-w-0 font-medium text-slate-200 truncate" title={baseItem?.name || 'Unlinked'}>
                      {baseItem ? (
                        <span className="bg-[#0e2a3d] text-cyan-200 px-2 py-0.5 rounded border border-cyan-500/30 font-bold truncate inline-block max-w-full">
                          {baseItem.name}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Unlinked Base Item</span>
                      )}
                    </td>
                    <td className="p-3 text-center font-bold text-amber-200 bg-amber-500/10 border-x border-amber-500/20 font-mono text-xs">
                      {item.unit === 'Meters'
                        ? `${Math.round((item.stockMultiplier || 1) * 100)} Meters`
                        : `${item.stockMultiplier || 1} Coils`}
                    </td>
                    <td className="p-3 text-center bg-purple-500/10 border-r border-purple-500/20 min-w-[110px]">
                      <select
                        value={item.unit === 'Coils' ? 'Coils' : 'Meters'}
                        onChange={(e) => {
                          const newUnit = e.target.value;
                          let newRate = item.rate;
                          if (baseItem) {
                            const mult = item.stockMultiplier || 1;
                            if (newUnit === 'Meters') {
                              newRate = calculateSpecialItemRate(baseItem.rate, mult * 100, 'Meters');
                            } else {
                              newRate = calculateSpecialItemRate(baseItem.rate, mult, 'Coils');
                            }
                          }
                          setItems((prev) => {
                            const next = prev.map((it) =>
                              it.id === item.id ? { ...it, unit: newUnit, rate: newRate, updatedAt: Date.now() } : it
                            );
                            const spOnly = next.filter((it) => it.isSpecialItem);
                            try {
                              safeSetStorageItem('polycables_items', JSON.stringify(next), next);
                              safeSetStorageItem('polycables_special_items', JSON.stringify(spOnly), spOnly);
                              idbSaveFailoverData('polycables_items', next).catch(() => {});
                              idbSaveFailoverData('polycables_special_items', spOnly).catch(() => {});
                            } catch {}
                            const itemsVer = Date.now();
                            fetch('/api/items', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                clientId: getClientSyncId(),
                                items: next,
                                specialItems: spOnly,
                                itemsVersion: itemsVer,
                                itemsCleared: false
                              })
                            }).catch(() => {});
                            onSyncCloud?.({ items: next, specialItems: spOnly, itemsVersion: itemsVer, _replaceItems: true }, true);
                            return next;
                          });
                          showNotification(
                            'success',
                            `Updated unit for "${item.name}" to ${newUnit} (Auto-calculated price: ৳${(newRate ?? 0).toLocaleString('en-IN')})`
                          );
                        }}
                        className="bg-[#061520] text-purple-200 px-2.5 py-1 rounded text-xs font-black border border-purple-400/40 shadow-2xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple-400 w-full max-w-[105px] mx-auto block"
                        title="Decide item unit: Meters or Coils"
                      >
                        <option value="Meters">Meters (m)</option>
                        <option value="Coils">Coils</option>
                      </select>
                    </td>
                    {showOpeningStock && (
                      <td className="p-3 text-center font-bold text-cyan-200 bg-cyan-500/10 border-x border-cyan-500/20">
                        {(itemOpening ?? 0).toLocaleString('en-IN')}
                      </td>
                    )}
                    <td className="p-3 text-center font-extrabold text-emerald-300 bg-emerald-500/10 border-r border-emerald-500/20 font-mono min-w-[125px]">
                      <div className="flex items-center justify-center gap-1">
                        <span>{(sLive ?? 0).toLocaleString('en-IN')}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedColorStockItem(item)}
                          className="p-1 hover:bg-emerald-500/20 text-emerald-300 rounded transition-colors cursor-pointer"
                          title="View live colour-wise stock breakdown"
                        >
                          <Palette className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className="inline-block text-[9px] font-semibold text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 px-1 py-0.5 rounded mt-0.5 whitespace-nowrap">Today Stock</span>
                    </td>
                    <td className="p-2 text-right font-bold text-emerald-300 font-mono text-xs">
                      ৳{Number(item.rate ?? 0).toLocaleString('en-IN', { minimumFractionDigits: (item.rate ?? 0) % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 min-w-0">
                      <span className="bg-amber-500/15 text-amber-200 px-2 py-0.5 rounded text-[11px] font-bold border border-amber-500/30 truncate inline-block max-w-full" title={item.category}>
                        {item.category}
                      </span>
                    </td>
                    <td className="p-2 text-center">
                      {(() => {
                        const isRowActive = activeBranchId && activeBranchId !== 'ALL'
                          ? isItemActiveInBranch(item, activeBranchId, activeBranchName)
                          : item.isActive !== false;
                        return (
                          <button
                            type="button"
                            onClick={() => handleToggleActiveStatus(item.id)}
                            className="p-1 rounded-full cursor-pointer transition-colors inline-flex items-center justify-center hover:bg-amber-500/15"
                            title={isRowActive
                              ? (activeBranchId && activeBranchId !== 'ALL' ? `Active in ${activeBranchName || 'Sales Center'} (Click to deactivate)` : 'Active (Click to deactivate)')
                              : (activeBranchId && activeBranchId !== 'ALL' ? `Inactive in ${activeBranchName || 'Sales Center'} (Click to activate)` : 'Inactive (Click to activate)')
                            }
                          >
                            {!isRowActive ? (
                              <XCircle className="w-4 h-4 text-slate-400" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            )}
                          </button>
                        );
                      })()}
                    </td>
                    <td className="p-3 text-center">
                      {isReadOnly ? (
                        <span className="text-[10px] text-slate-400 font-semibold italic">View Only</span>
                      ) : (
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            type="button"
                            onClick={() => handleExportSingleItem(item)}
                            className="text-slate-400 hover:text-cyan-300 p-1 rounded hover:bg-cyan-500/15 cursor-pointer"
                            title="Backup / Export Single Item (JSON)"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleStartEdit(item)}
                            className="text-slate-400 hover:text-amber-300 p-1 rounded hover:bg-amber-500/15 cursor-pointer"
                            title="Edit Special Item"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="text-slate-400 hover:text-rose-400 p-1 rounded hover:bg-rose-500/15 cursor-pointer"
                            title="Delete / Move to Trash"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              }

              const cachedStock = itemStockCache.get(item.id) || { opening: 0, live: 0, linkedBobinsOpening: 0, linkedCoilsOpening: 0, linkedBobinsLive: 0, linkedCoilsLive: 0 };
              const effectiveOpeningStock = cachedStock.opening;
              const effectiveLiveStock = cachedStock.live;

              return (
                <tr
                  key={item.id ? `${item.id}-${index}` : `item-${index}`}
                  className={`border-b border-cyan-500/15 transition-colors ${
                    isSelected ? 'bg-rose-500/15 hover:bg-rose-500/20' : 'hover:bg-cyan-500/[0.06]'
                  }`}
                >
                  <td className="p-2 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelect(item.id)}
                      className="rounded border-cyan-500/40 text-cyan-500 focus:ring-cyan-400 cursor-pointer"
                    />
                  </td>
                  <td className="p-2 text-center font-mono text-slate-400 text-xs font-bold">
                    {getItemDisplaySerial(item, index)}
                  </td>
                  <td className="p-2 font-semibold text-white truncate" title={getItemDisplayName(item)}>
                    {getItemDisplayName(item)}
                  </td>
                  {showOpeningStock && (
                    <td className="p-2 text-center font-bold text-cyan-200 bg-cyan-500/10 border-x border-cyan-500/20 font-mono text-xs">
                      {(effectiveOpeningStock ?? 0).toLocaleString('en-IN')}
                    </td>
                  )}
                  <td className="p-2 text-center font-extrabold text-emerald-300 bg-emerald-500/10 border-r border-emerald-500/20 font-mono text-xs">
                    <div className="flex items-center justify-center gap-1">
                      <span>{(effectiveLiveStock ?? 0).toLocaleString('en-IN')}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedColorStockItem(item)}
                        className="p-0.5 hover:bg-emerald-500/20 text-emerald-300 rounded transition-colors cursor-pointer"
                        title="View live colour-wise stock breakdown"
                      >
                        <Palette className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                  <td className="p-2 text-center text-slate-300 text-xs">{item.unit || 'Coils'}</td>
                  <td className="p-2 text-right font-bold text-emerald-300 font-mono text-xs">
                    ৳{Number(item.rate ?? 0).toLocaleString('en-IN', { minimumFractionDigits: (item.rate ?? 0) % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })}
                  </td>
                  <td className="p-2 text-right font-extrabold text-emerald-200 bg-emerald-500/10 border-r border-emerald-500/20 font-mono text-xs whitespace-nowrap">
                    ৳{((effectiveLiveStock || 0) * (item.rate || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                  <td className="p-2 min-w-0">
                    <span className="bg-[#0e2a3d] text-cyan-200 px-2 py-0.5 rounded text-[11px] font-bold border border-cyan-500/25 truncate inline-block max-w-full" title={item.category}>
                      {item.category}
                    </span>
                  </td>
                  <td className="p-2 text-center">
                    {(() => {
                      const isRowActive = activeBranchId && activeBranchId !== 'ALL'
                        ? isItemActiveInBranch(item, activeBranchId, activeBranchName)
                        : item.isActive !== false;
                      return (
                        <button
                          type="button"
                          onClick={() => handleToggleActiveStatus(item.id)}
                          className="p-1 rounded-full cursor-pointer transition-colors inline-flex items-center justify-center hover:bg-cyan-500/15"
                          title={isRowActive
                            ? (activeBranchId && activeBranchId !== 'ALL' ? `Active in ${activeBranchName || 'Sales Center'} (Click to deactivate)` : 'Active (Click to deactivate)')
                            : (activeBranchId && activeBranchId !== 'ALL' ? `Inactive in ${activeBranchName || 'Sales Center'} (Click to activate)` : 'Inactive (Click to activate)')
                          }
                        >
                          {!isRowActive ? (
                            <XCircle className="w-4 h-4 text-slate-400" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          )}
                        </button>
                      );
                    })()}
                  </td>
                  <td className="p-3 text-center">
                    {isReadOnly ? (
                      <span className="text-[10px] text-slate-400 font-semibold italic">View Only</span>
                    ) : (
                      <div className="flex items-center justify-center space-x-1">
                        <button
                          type="button"
                          onClick={() => handleExportSingleItem(item)}
                          className="text-slate-400 hover:text-cyan-300 p-1 rounded hover:bg-cyan-500/15 cursor-pointer"
                          title="Backup / Export Single Item (JSON)"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleStartEdit(item)}
                          className="text-slate-400 hover:text-emerald-300 p-1 rounded hover:bg-emerald-500/15 cursor-pointer"
                          title="Edit Item"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="text-slate-400 hover:text-rose-400 p-1 rounded hover:bg-rose-500/15 cursor-pointer"
                          title="Delete / Move to Trash"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
              };

              const startOffset = pageSize === 'all' ? 0 : (currentPage - 1) * pageSize;
              if (search.trim()) {
                const groupedPaginated = groupItemsByCategoryOrder(paginatedItems, categoriesList);
                const colSpanCount = subTab === 'special_items' ? (showOpeningStock ? 12 : 11) : (showOpeningStock ? 11 : 10);
                return groupedPaginated.groups.map((grp) => (
                  <React.Fragment key={grp.category}>
                    <tr className="bg-[#0c2638]/90 border-y border-cyan-500/25">
                      <td colSpan={colSpanCount} className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-cyan-300">
                        {grp.category} ({grp.items.length})
                      </td>
                    </tr>
                    {grp.items.map(({ item, flatIndex }) => renderItemRow(item, startOffset + flatIndex))}
                  </React.Fragment>
                ));
              }

              return paginatedItems.map((item, localIdx) => renderItemRow(item, startOffset + localIdx));
            })()}
            {paginatedItems.length === 0 && (
              <tr>
                <td colSpan={subTab === 'special_items' ? (showOpeningStock ? 12 : 11) : (showOpeningStock ? 11 : 10)} className="p-10 text-center">
                  {(!activePriceSnapshot || activeCircularSnapItems.length === 0) && subTab !== 'special_items' ? (
                    <div className="max-w-md mx-auto space-y-2">
                      <p className="text-sm font-bold text-slate-200">No Active Price Circular Items Found</p>
                      <p className="text-xs text-slate-400">
                        {priceSnapshots.length === 0
                          ? 'Price Update History has no list. Import or activate a Price Circular list in Price Update History to display items here.'
                          : 'The active effective-date list in Price Update History has 0 items. Import items into a circular to view them here.'}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 font-medium">No items match the current search or filter criteria.</p>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination Bar - Smooth 60fps performance */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 bg-[#0c2638]/85 border-t border-cyan-500/25 text-xs text-slate-300">
          <div className="flex items-center space-x-2">
            <span>Show:</span>
            <select
              value={pageSize === 'all' ? 'all' : String(pageSize)}
              onChange={(e) => {
                const val = e.target.value;
                setPageSize(val === 'all' ? 'all' : Number(val));
                setCurrentPage(1);
              }}
              className="p-1 border border-cyan-500/30 rounded bg-[#061520] text-white text-xs font-semibold cursor-pointer"
            >
              <option value="25">25 items</option>
              <option value="50">50 items</option>
              <option value="100">100 items</option>
              <option value="250">250 items</option>
              <option value="500">500 items</option>
              <option value="all">Show All ({totalFilteredCount})</option>
            </select>
            <span className="text-slate-400 font-medium">
              Showing {totalFilteredCount === 0 ? 0 : (pageSize === 'all' ? 1 : (currentPage - 1) * pageSize + 1)}–
              {pageSize === 'all' ? totalFilteredCount : Math.min(currentPage * pageSize, totalFilteredCount)} of {totalFilteredCount} items
            </span>
          </div>

          {pageSize !== 'all' && totalPages > 1 && (
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 bg-[#081b28] border border-cyan-500/30 text-slate-200 rounded font-bold hover:bg-[#0e2a3d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Previous
              </button>
              <span className="px-2 font-bold text-cyan-200">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 bg-[#081b28] border border-cyan-500/30 text-slate-200 rounded font-bold hover:bg-[#0e2a3d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Bottom Action Footer Bar */}
        <div className="flex flex-wrap items-center justify-end gap-1.5 px-3 py-3 bg-[#081b28]/90 border-t border-cyan-500/25 text-xs">
          {!isReadOnly && (
            <button
              type="button"
              onClick={() => {
                setIsAddingNew(true);
                setIsSpecialItemType(subTab === 'special_items');
              }}
              className={`${
                subTab === 'special_items' ? 'bg-amber-500 hover:bg-amber-400 text-slate-950' : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
              } text-xs px-2.5 py-1.5 rounded-md font-black flex items-center space-x-1 shadow-xs transition-colors cursor-pointer whitespace-nowrap`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{subTab === 'special_items' ? 'Add Special Item' : 'Add Item'}</span>
            </button>
          )}

          {!isReadOnly && (
            <button
              type="button"
              onClick={() => setIsBulkUploadModalOpen(true)}
              className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 px-2.5 py-1.5 rounded-md font-semibold flex items-center space-x-1.5 border border-emerald-400/35 transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
              title="Import items and prices from XLSX file"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Import (.xlsx)</span>
            </button>
          )}

          {!isReadOnly && (
            <button
              type="button"
              onClick={() => setIsBulkPriceUpdateOpen(true)}
              className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 px-2.5 py-1.5 rounded-md font-semibold flex items-center space-x-1.5 border border-purple-400/35 transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
              title="Bulk price update effected date wise"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Bulk Price Update</span>
            </button>
          )}

          {!isReadOnly && (
            <button
              type="button"
              onClick={() => setShowDeleteAllConfirm(true)}
              className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 px-2.5 py-1.5 rounded-md font-semibold flex items-center space-x-1.5 border border-rose-400/35 transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
              title={subTab === 'special_items' ? 'Delete all special items and move to Trash Bin' : 'Delete all items from Master Item Directory and move to Trash Bin'}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete All ({subTab === 'special_items' ? specialItems.length : items.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => exportItemsToXLSX(subTab === 'special_items' ? specialItems : items)}
            className="bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 px-2.5 py-1.5 rounded-md font-semibold flex items-center space-x-1.5 border border-cyan-500/30 transition-colors cursor-pointer whitespace-nowrap"
            title="Export items to XLSX file"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export (.xlsx)</span>
          </button>

          {!isReadOnly && storedBills && storedBills.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSyncItemNamesModal(true)}
              className="bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 px-2.5 py-1.5 rounded-md font-semibold flex items-center space-x-1.5 border border-indigo-400/35 transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
              title="Update previous bills with renamed item descriptions while strictly preserving all historical rates, quantities, and totals"
            >
              <RefreshCw className="w-3.5 h-3.5 text-indigo-300" />
              <span>Sync Item Names to Previous Bills</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsPrintPreviewOpen(true)}
            className="bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 hover:text-white px-2.5 py-1.5 rounded-md font-semibold flex items-center space-x-1.5 border border-cyan-500/30 transition-colors cursor-pointer whitespace-nowrap"
            title="Print Item List (A4 Master Order)"
          >
            <Printer className="w-3.5 h-3.5 text-cyan-300" />
            <span>Print</span>
          </button>
        </div>
      </div>
        </div>
      )}

      {/* Bulk Price Update by Effective Date Modal */}
      <BulkPriceUpdateModal
        isOpen={isBulkPriceUpdateOpen}
        onClose={() => setIsBulkPriceUpdateOpen(false)}
        items={items}
        setItems={setItems}
        onSyncCloud={onSyncCloud}
        onSuccess={(count, effDate) => {
          setMessage({
            type: 'success',
            text: `Successfully updated prices for ${count} item(s) effective ${effDate}. Historical bills remain unaffected.`
          });
        }}
      />

      {/* Robust Bulk Item & Price Upload Modal supporting all 14 modules */}
      <BulkItemUploadModal
        isOpen={isBulkUploadModalOpen}
        onClose={() => {
          setIsBulkUploadModalOpen(false);
          setUploadTargetCategory(null);
        }}
        targetCategory={uploadTargetCategory || undefined}
        isSpecialItemMode={subTab === 'special_items'}
        items={items}
        setItems={setItems}
        branches={effectiveBranches}
        onSyncCloud={(updatedItems) => {
          const refreshedCats = getAllCategories();
          setCategoriesList([...refreshedCats]);
          const nextCatalogList = updatedItems || items;
          const latestSnaps = getPriceListSnapshots();
          onSyncCloud?.(
            {
              items: nextCatalogList,
              specialItems: nextCatalogList.filter((i) => i.isSpecialItem),
              ...getCategorySyncPayload(refreshedCats),
              itemsVersion: Date.now(),
              _itemsCleared: nextCatalogList.length === 0,
              _replaceItems: true,
              priceSnapshots: latestSnaps,
              price_snapshots: latestSnaps,
              _replacePriceSnapshots: true
            },
            true
          );
        }}
        onSuccess={(addedCount, updatedCount) => {
          setCategoriesList([...getAllCategories()]);
          setPriceSnapshots(getPriceListSnapshots());
          showNotification(
            'success',
            `🎉 Bulk Upload complete! ${addedCount} new items added, ${updatedCount} items/prices updated across all 14 ERP modules.`
          );
        }}
      />

      {/* Master Item List Print Preview Modal */}
      {isPrintPreviewOpen && (
        <ItemPricePrintPreviewModal
          isOpen={isPrintPreviewOpen}
          onClose={() => setIsPrintPreviewOpen(false)}
          items={filteredItems}
          company={company}
          branches={effectiveBranches}
          initialBranchId={activeBranchId}
          title={subTab === 'special_items' ? 'Special Item Directory & Rates' : 'Master Item Directory & Price List'}
          initialCategory={categoryFilter}
          initialSearch={search}
          initialOnlyActive={statusFilter === 'Active'}
        />
      )}

      {/* Category List Print Preview Modal */}
      {isCategoryPrintModalOpen && (
        <CategoryListPrintPreviewModal
          isOpen={isCategoryPrintModalOpen}
          onClose={() => setIsCategoryPrintModalOpen(false)}
          categories={categoriesList}
          items={items}
          branches={effectiveBranches}
          company={company}
          factoryImports={factoryImports}
        />
      )}

      {/* Delete Item Confirmation Modal */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#030d14]/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-md w-full border border-rose-500/35 overflow-hidden text-white">
            <div className="p-4 bg-[#0c2638]/90 border-b border-rose-500/25 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-rose-400" />
                <h3 className="text-base font-bold">Delete Item Confirmation</h3>
              </div>
              <button
                type="button"
                onClick={() => setDeleteConfirmItem(null)}
                className="text-slate-300 hover:text-white hover:bg-cyan-500/15 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm font-semibold text-slate-200">
                Are you sure you want to delete this item?
              </p>
              <div className="p-3 bg-[#071824]/80 border border-cyan-500/25 rounded-lg text-xs space-y-1">
                <p className="font-bold text-white">{deleteConfirmItem.name}</p>
                <div className="flex items-center space-x-2 text-slate-400 font-mono">
                  {deleteConfirmItem.code && <span>Code: {deleteConfirmItem.code}</span>}
                  {deleteConfirmItem.category && <span>• Category: {deleteConfirmItem.category}</span>}
                  {deleteConfirmItem.unit && <span>• Unit: {deleteConfirmItem.unit}</span>}
                </div>
              </div>
              <p className="text-xs text-amber-200 bg-amber-500/15 p-2.5 rounded-lg border border-amber-500/30">
                ⚠️ <strong>Delete Action:</strong> This item will be removed from all active catalogs, billing, and requisitions, and safely stored in the <strong>Item Trash Bin</strong> where it can be restored anytime or deleted permanently.
              </p>
            </div>
            <div className="p-4 bg-[#071824]/90 border-t border-cyan-500/20 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmItem(null)}
                className="px-4 py-2 bg-[#081b28] border border-cyan-500/30 text-slate-200 font-bold text-xs rounded-lg hover:bg-[#0e2a3d] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmExecuteDeleteItem}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg shadow-sm transition-colors cursor-pointer flex items-center space-x-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete & Move to Trash</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Category-Wise Manual Item Addition Modal */}
      {categoryAddItemModal && categoryAddItemModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#030d14]/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-lg w-full border border-cyan-400/35 overflow-hidden flex flex-col text-white">
            <div className="p-4 bg-[#0c2638]/90 border-b border-cyan-500/25 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Tag className="w-5 h-5 text-cyan-300" />
                <div>
                  <h3 className="text-sm font-bold">Add Item to Category</h3>
                  <p className="text-[11px] text-cyan-200/80">
                    Category:{' '}
                    <span className="font-extrabold text-cyan-200 bg-cyan-500/20 border border-cyan-500/30 px-2 py-0.5 rounded-full">
                      {categoryAddItemModal.category}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCategoryAddItemModal(null)}
                className="text-slate-300 hover:text-white hover:bg-cyan-500/15 p-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategoryWiseItem} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-cyan-200 mb-1">
                  Category *
                </label>
                <select
                  value={categoriesList.includes(categoryAddItemModal.category) ? categoryAddItemModal.category : '__custom__'}
                  onChange={(e) => {
                    const selCat = e.target.value;
                    if (selCat !== '__custom__') {
                      const existingCatItems = items.filter(
                        (i) => (i.category || '').trim().toLowerCase() === selCat.trim().toLowerCase()
                      );
                      const maxSerial = existingCatItems.reduce((max, i) => {
                        const ser = Number(i.serial ?? (i.name.match(/^(\d+)[.)\s]/)?.[1] || 0));
                        return ser > max ? ser : max;
                      }, 0);
                      setCategoryAddItemModal((prev) =>
                        prev ? { ...prev, category: selCat, serial: String(maxSerial + 1) } : null
                      );
                    }
                  }}
                  className="w-full p-2 bg-[#061520] border border-cyan-500/30 rounded-lg font-bold text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none cursor-pointer"
                >
                  {categoriesList.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  <option value="__custom__">+ Custom Category...</option>
                </select>
                {(!categoriesList.includes(categoryAddItemModal.category) || categoryAddItemModal.category === '__custom__') && (
                  <input
                    type="text"
                    value={categoryAddItemModal.category === '__custom__' ? '' : categoryAddItemModal.category}
                    onChange={(e) =>
                      setCategoryAddItemModal((prev) => (prev ? { ...prev, category: e.target.value } : null))
                    }
                    placeholder="Enter Custom Category Name..."
                    className="mt-1.5 w-full p-2 bg-[#061520] border border-purple-400/40 rounded-lg font-bold text-purple-200 focus:ring-2 focus:ring-purple-400 text-xs"
                    required
                  />
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-cyan-200 mb-1">
                    SL / Serial #
                  </label>
                  <input
                    type="text"
                    value={categoryAddItemModal.serial}
                    onChange={(e) =>
                      setCategoryAddItemModal((prev) => (prev ? { ...prev, serial: e.target.value } : null))
                    }
                    placeholder="e.g. 1"
                    className="w-full p-2 bg-[#061520] border border-cyan-500/30 rounded-lg font-mono font-bold text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-cyan-200 mb-1">
                    Item Code
                  </label>
                  <input
                    type="text"
                    value={categoryAddItemModal.code}
                    onChange={(e) =>
                      setCategoryAddItemModal((prev) => (prev ? { ...prev, code: e.target.value } : null))
                    }
                    placeholder="e.g. PC-125"
                    className="w-full p-2 bg-[#061520] border border-cyan-500/30 rounded-lg font-mono text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-cyan-200 mb-1">
                    Unit *
                  </label>
                  <select
                    value={categoryAddItemModal.unit}
                    onChange={(e) =>
                      setCategoryAddItemModal((prev) => (prev ? { ...prev, unit: e.target.value } : null))
                    }
                    className="w-full p-2 bg-[#061520] border border-cyan-500/30 rounded-lg font-bold text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  >
                    <option value="Coils">Coils</option>
                    <option value="Meters">Meters</option>
                    <option value="Bobin">Bobin</option>
                    <option value="Pcs">Pcs</option>
                    <option value="Packet">Packet</option>
                    <option value="Drum">Drum</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-cyan-200 mb-1">
                  Item Description / Name *
                </label>
                <input
                  type="text"
                  required
                  value={categoryAddItemModal.name}
                  onChange={(e) =>
                    setCategoryAddItemModal((prev) => (prev ? { ...prev, name: e.target.value } : null))
                  }
                  placeholder="e.g. 1 X 1.3 Rm BYA"
                  className="w-full p-2.5 bg-[#061520] border border-cyan-500/30 rounded-lg font-bold text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none text-xs"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Serial is preserved in the SL column and omitted from the item description.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-cyan-200 mb-1">
                    Price / Rate (Tk) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={categoryAddItemModal.rate === 0 ? '' : categoryAddItemModal.rate}
                    onChange={(e) =>
                      setCategoryAddItemModal((prev) =>
                        prev ? { ...prev, rate: parseFloat(e.target.value) || 0 } : null
                      )
                    }
                    placeholder="0"
                    className="w-full p-2 bg-[#061520] border border-cyan-500/30 rounded-lg font-mono font-bold text-white text-right focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-cyan-200 mb-1">
                    Opening Stock ({categoryAddItemModal.unit || 'Coils'})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={categoryAddItemModal.openingStock === 0 ? '' : categoryAddItemModal.openingStock}
                    onChange={(e) =>
                      setCategoryAddItemModal((prev) =>
                        prev ? { ...prev, openingStock: parseFloat(e.target.value) || 0 } : null
                      )
                    }
                    placeholder="0"
                    className="w-full p-2 bg-[#061520] border border-cyan-500/30 rounded-lg font-mono font-bold text-emerald-300 text-right focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-cyan-500/20 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setCategoryAddItemModal(null)}
                  className="px-4 py-2 bg-[#081b28] border border-cyan-500/30 text-slate-200 font-bold text-xs rounded-lg hover:bg-[#0e2a3d] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs rounded-lg shadow-sm transition-colors cursor-pointer flex items-center space-x-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Save Item to Category</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Color-wise Live Stock Breakdown Modal */}
      {selectedColorStockItem && (
        <StockColorBreakdownModal
          isOpen={Boolean(selectedColorStockItem)}
          item={selectedColorStockItem}
          initialCategory="closing"
          storedBills={storedBills}
          factoryImports={factoryImports}
          stockReturns={stockReturns}
          branchId={activeBranchId}
          branchName={activeBranchName}
          colorExchanges={colorExchanges}
          deliveryChallans={deliveryChallans}
          onClose={() => setSelectedColorStockItem(null)}
        />
      )}
      {/* Confirmation Modal for Syncing Item Names to Previous Bills */}
      {showSyncItemNamesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030d14]/80 p-4 backdrop-blur-sm">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl max-w-md w-full p-6 shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 text-white animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3 text-cyan-300 mb-3">
              <div className="p-2.5 bg-cyan-500/15 border border-cyan-500/30 rounded-xl">
                <RefreshCw className="w-5 h-5 text-cyan-300" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Sync Item Names to Previous Bills</h3>
                <p className="text-xs text-slate-300">Historical Bills Item Description Harmonizer</p>
              </div>
            </div>

            <div className="bg-[#071824]/80 border border-cyan-500/25 rounded-xl p-3.5 mb-4 text-xs space-y-2 text-slate-200">
              <p>
                This will match line items in your past bills by ID and Code, and update their descriptions to current Master Catalog names.
              </p>
              <div className="p-2.5 bg-emerald-500/15 border border-emerald-500/30 rounded-lg text-emerald-200 font-semibold flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Strict Price Guarantee:</strong> All line rates, prices, discounts, quantities, subtotals, and grand totals will remain <strong>100% strictly preserved and untouched</strong>.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowSyncItemNamesModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-200 bg-[#081b28] border border-cyan-500/30 hover:bg-[#0e2a3d] rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSyncItemNamesModal(false);
                  handleSyncAllPreviousBillsItemNames();
                }}
                className="px-4 py-2 text-xs font-black bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl shadow-sm transition-colors cursor-pointer flex items-center space-x-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Confirm & Sync Item Names</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

