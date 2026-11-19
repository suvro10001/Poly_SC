import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense } from 'react';
import { ViewTab, CompanyDetails, BillHeader, BillLineItem, Item, StoredBill, Party, Salesperson, FactoryImportChallan, StockReturnChallan, DeliveryChallan, ExpenseEntry, CollectionMR, BankDeposit, AuthUser, BackupDataPackage, BranchLocation, Requisition, FinancialYearClosing, ColorExchangeChallan, ConveyanceEntry } from './types';
import { defaultCompany, defaultHeader, defaultItems, defaultBillLines, defaultBankDeposits, defaultCollections, defaultBanks, defaultAccounts, defaultBranches, defaultRequisitions, defaultStoredBills } from './data/defaultData';
import { generateMonthEndHoAutoDeposits } from './utils/autoDeposits';
import { LoginPage } from './components/LoginPage';
import {
  db,
  doc,
  getDocsFromServer,
  onSnapshot,
  setDoc,
  deleteDoc,
  writeBatch,
  collection,
  cleanForFirestore,
  isFirestoreQuotaExhausted,
  markFirestoreQuotaExhausted,
  isFirestoreUnavailable,
  markFirestoreUnavailable,
  isFirestoreInFallbackCooldown,
  isFirestorePayloadSizeError,
  probeFirestoreQuotaRecovery,
  isQuotaRelatedError,
  reportCloudSyncSuccess,
  handleFirestoreError,
  OperationType
} from './firebase';
import { exportBillToExcel } from './utils/excelExporter';
import { getPriceListSnapshots, normalizePriceSnapshots, pruneDeletedIdsFromSnapshots, reconcileCatalogItemsWithActiveSnapshot, savePriceListSnapshots } from './utils/priceCircularHelper';
import { convertToTakaWords } from './utils/numberToWords';
import { Navbar } from './components/Navbar';
import { getBankAndAccountShortTag } from './components/BankAndAccountDirectory';
import { computeBranchRunningBillNo, findHeadOfficeBranch, withHeadOfficeForAdmin } from './utils/salesCenterHelper';
import { checkCanTakeEntry, isOnline, useConnectivityStatus, triggerOfflineWarning } from './utils/cloudConnection';
import { Sidebar } from './components/Sidebar';
import { ChromeTabBar, ChromeTabItem, getTabMeta } from './components/ChromeTabBar';
export type ApprovedHubSubTab = 'sales_approved' | 'conveyance_approved' | 'expense_approved';
import { AppTheme } from './types';
import { ArrowLeft, X, WifiOff, CheckCircle2, FileText, Car, Sparkles, Receipt } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotificationChatHub, emitErpNotification } from './components/NotificationChatHub';
import { unlockAudio } from './utils/soundNotifier';

import {
  viewModuleLoaders,
  preloadViewModule,
  preloadAllViewModules,
  type ViewLoaderKey
} from './utils/viewPreloader';
export { preloadViewModule, preloadAllViewModules };

const BillInvoiceView = React.lazy(viewModuleLoaders.builder);
const Sheet2ItemManager = React.lazy(viewModuleLoaders.item_directory);
const SalesReportView = React.lazy(viewModuleLoaders.sales_report);
const SalesReportItemView = React.lazy(viewModuleLoaders.sales_items);
const ChallanManager = React.lazy(viewModuleLoaders.challan_menu);
const ColorExchangeManager = React.lazy(viewModuleLoaders.color_exchange);
const StoredBillsDirectory = React.lazy(viewModuleLoaders.stored_bills);
const PartyDirectory = React.lazy(viewModuleLoaders.party_directory);
const SalespersonDirectory = React.lazy(viewModuleLoaders.salesperson_directory);
const ReturnsManager = React.lazy(viewModuleLoaders.returns_menu);
const Trash = React.lazy(viewModuleLoaders.trash_bin);
const ExpenseManager = React.lazy(viewModuleLoaders.expense_directory);
const ReportDashboard = React.lazy(viewModuleLoaders.report_dashboard);
const CustomerLedger = React.lazy(viewModuleLoaders.customer_ledger);
const SettingsView = React.lazy(viewModuleLoaders.settings);
const RequisitionPage = React.lazy(viewModuleLoaders.requisition);
const SlipPadChallanView = React.lazy(viewModuleLoaders.slip_pad_memo);
const KeyboardShortcutsModal = React.lazy(viewModuleLoaders.shortcuts);
const MainMenuPage = React.lazy(viewModuleLoaders.main_menu);
const AISalesForecastModal = React.lazy(viewModuleLoaders.ai_sales_forecast);
const AdminSalesCollectionReportPage = React.lazy(viewModuleLoaders.admin_sales_collection_report);
const ConveyanceManager = React.lazy(viewModuleLoaders.conveyance);
const PriceUpdateHistoryPage = React.lazy(viewModuleLoaders.price_history);
const ApproveExpenseHub = React.lazy(viewModuleLoaders.approved_menu);

import { getItemFactoryImportQty } from './utils/stockHelper';
import { autoFixStoredBillsWithMasterCatalog, autoFixBillLineItemWithMasterCatalog } from './utils/itemMatcher';
import {
  cleanCategoryLabel,
  getAllCategories,
  getCategoryNumbers,
  saveCategoryNumbers,
  isPureCableCategoryLabel,
  isSubCategoryQualifier,
  saveCustomCategory
} from './utils/categoryHelper';
import { moveToTrash } from './utils/trashHelper';
import { ALL_TRASH_STORAGE_KEYS, isGloballyDeletedId, isRecentlyRestoredId, removeIdsFromAllTrashStorages, recordDeletedEntityId, recordDeletedEntityIds, getGlobalDeletedIds, syncGlobalDeletedIds, unrecordDeletedEntityIds, unrecordDeletedIdsLocally, replaceGlobalDeletedIds, resetGlobalDeletedIds } from './utils/deletedTracker';
import {
  applyRemoteCloudFailoverConfig,
  clearInMemoryFailoverQueue,
  failoverPushToCloudNodes,
  failoverPullFromCloudNodes,
  flushInMemoryFailoverQueue,
  hasPendingInMemoryFailoverQueue,
  saveCloudFailoverConfig
} from './utils/cloudSyncManager';
import {
  probeSupabaseRecovery,
  flushSupabaseRetryQueue,
  isSupabaseUnavailable
} from './utils/supabaseClient';
import { idbSaveFailoverData, idbGetFailoverData, safeSetStorageItem } from './utils/indexedDbStorage';
import {
  executeAutomatedDailyBackup,
  getAutomatedBackupStatus,
  LAST_AUTO_BACKUP_DATE_KEY
} from './utils/autoBackupManager';
import {
  isSuvroAdmin,
  isStrictSuperAdmin,
  isAccountsAdmin,
  isSuperAdminOrAgm,
  isInCharge,
  getUserBranch,
  filterBillsForUser,
  filterCollectionsForUser,
  filterReturnsForUser,
  filterExpensesForUser,
  filterRequisitionsForUser,
  filterDepositsForUser,
  filterPartiesForUser,
  filterChallansForUser,
  filterSalespersonsForUser,
  filterBranchesForUser,
  isFactoryUser,
  isDefaultAdmin,
  isAnyAdmin,
  isProtectedSalesCenter,
  isUnwantedSalesCenter,
  cleanBranchName
} from './utils/branchAccess';

export const sanitizeAndSortBranches = (list: BranchLocation[]): BranchLocation[] => {
  if (!Array.isArray(list)) return [];
  const cleaned = list
    .filter((b) => b && b.id !== 'branch-main' && !isUnwantedSalesCenter(b))
    .map((b: BranchLocation) => {
      const next: BranchLocation = { ...b };
      const adminIdLow = String(next.adminId || '').trim().toLowerCase();
      const assignedAdminIdLow = String(next.assignedAdminId || '').trim().toLowerCase();
      const adminUserLow = String(next.adminUsername || '').trim().toLowerCase();
      const adminNameLow = String(next.adminName || '').trim().toLowerCase();
      const approverNameLow = String(next.approverName || '').trim().toLowerCase();
      const inChargeIdLow = String(next.inChargeId || '').trim().toLowerCase();

      const isFakeAdmin =
        adminIdLow === 'adm-mahmudul' ||
        adminIdLow === 'adm-subrata' ||
        adminIdLow === 'adm-rashidul' ||
        adminIdLow === 'sp-1791978445459' ||
        adminIdLow === '111' ||
        assignedAdminIdLow === 'adm-mahmudul' ||
        assignedAdminIdLow === 'adm-subrata' ||
        assignedAdminIdLow === 'adm-rashidul' ||
        assignedAdminIdLow === 'sp-1791978445459' ||
        assignedAdminIdLow === '111' ||
        adminUserLow === 'admin1' ||
        adminUserLow === 'admin2' ||
        adminUserLow === 'admin3' ||
        adminUserLow === '111' ||
        adminUserLow === 'admin' ||
        adminNameLow === 'admin' ||
        adminNameLow.includes('mahmudul hasan') ||
        adminNameLow.includes('rashidul islam') ||
        adminNameLow.includes('subrata sutradhar') ||
        adminNameLow.includes('admin 1') ||
        adminNameLow.includes('admin 2') ||
        adminNameLow.includes('admin 3');

      if (isFakeAdmin) {
        delete next.adminId;
        delete next.assignedAdminId;
        delete next.adminName;
        delete next.adminUsername;
      }

      if (
        approverNameLow.includes('mahmudul hasan') ||
        approverNameLow === 'admin' ||
        String(next.approverId || '').trim().toLowerCase() === 'adm-mahmudul'
      ) {
        delete next.approverId;
        delete next.approverName;
      }

      if (
        inChargeIdLow === 'adm-mahmudul' ||
        inChargeIdLow === 'adm-subrata' ||
        inChargeIdLow === 'adm-rashidul' ||
        inChargeIdLow === 'sp-1791978445459' ||
        inChargeIdLow === '111' ||
        (next.id === 'branch-mymensingh' && (next.inChargeId === 'sp-sanjoy' || next.inChargeName?.includes('Sanjoy')))
      ) {
        delete next.inChargeId;
        delete next.inChargeName;
        delete next.inChargePhone;
      }

      const rawBranchNameLow = String(next.name || '').trim().toLowerCase();
      const rawAddrLow = String(next.address || '').trim().toLowerCase();
      const isCorporateHo =
        next.type === 'head_office' ||
        next.id === 'branch-head-office' ||
        next.id === 'branch-ho' ||
        rawBranchNameLow.includes('head office') ||
        rawBranchNameLow.includes('corporate office') ||
        rawBranchNameLow === 'central';

      if (isCorporateHo) {
        next.name = 'CORPORATE OFFICE';
        next.type = 'head_office';
        if (
          !rawAddrLow ||
          rawAddrLow.includes('dilkusha') ||
          rawAddrLow.includes('motijheel') ||
          rawAddrLow.includes('poly tower')
        ) {
          next.address = 'House-16, Block-C, Main Road, Aftabnagar, Dhaka, Bangladesh';
        }
        if (!next.phone || next.phone === '01713-434290' || next.phone === '01713434290') {
          next.phone = '01730732000';
        }
      }

      return next;
    });
  return cleaned.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
};

export const sanitizeSalespersonsList = (list: Salesperson[]): Salesperson[] => {
  if (!Array.isArray(list)) return [];
  const unique: Salesperson[] = [];
  const seenIds = new Set<string>();
  const seenCodes = new Set<string>();
  const seenNames = new Set<string>();

  for (const sp of list) {
    if (!sp || typeof sp !== 'object') continue;
    const c = sp.code?.trim().toLowerCase();
    const n = sp.name?.trim().toLowerCase();
    const u = sp.username?.trim().toLowerCase();
    const id = sp.id?.trim().toLowerCase();
    const r = sp.role?.trim().toLowerCase() || '';

    if (id && isGloballyDeletedId(id)) {
      continue;
    }

    if (
      c === '111' ||
      u === '111' ||
      id === '111' ||
      id === 'sp-1791978445459' ||
      c === 'adm-111' ||
      n === 'admin' ||
      u === 'admin' ||
      c === 'admin' ||
      id === 'adm-mahmudul' ||
      id === 'adm-subrata' ||
      id === 'adm-rashidul' ||
      u === 'admin1' ||
      u === 'admin2' ||
      u === 'admin3' ||
      c === 'adm-01' ||
      c === 'adm-02' ||
      c === 'adm-03' ||
      (r.includes('admin') &&
        n &&
        (n.includes('mahmudul hasan') ||
          n.includes('rashidul islam') ||
          n.includes('subrata sutradhar') ||
          n.includes('admin 1') ||
          n.includes('admin 2') ||
          n.includes('admin 3'))) ||
      (n && n.includes('admin') && (n.includes('mahmudul') || n.includes('subrata') || n.includes('rashidul')))
    ) {
      continue;
    }

    if (sp.id && seenIds.has(sp.id)) continue;
    if (c && c !== 'ic' && c !== '' && seenCodes.has(c)) continue;
    if (n && seenNames.has(n)) continue;
    if (sp.id) seenIds.add(sp.id);
    if (c && c !== 'ic' && c !== '') seenCodes.add(c);
    if (n) seenNames.add(n);

    let effectivePassword = (sp.password || '123456').trim();
    if (effectivePassword === '1234' || effectivePassword.length < 6) {
      effectivePassword = '123456';
    }

    unique.push({
      ...sp,
      username: sp.username || (sp.code ? sp.code.toLowerCase() : `user-${sp.id}`),
      password: effectivePassword,
      isApproved: true
    });
  }
  return unique;
};

// ============================================================================
// AUTHENTICATION & LOGIN CONFIGURATION
// By default, authentication is fully enforced.
// suvroadmin / AGM have full global supervision across all Sales Centers.
// Marketing / Sales Center staff are automatically restricted to their own Sales Center.
// ============================================================================
export const BYPASS_LOGIN_FOR_DEV = false;

export const DEV_ADMIN_USER: AuthUser = {
  username: 'suvroadmin',
  name: 'Super Admin',
  role: 'admin',
  isSuperAdmin: true
};

function computeNextBillNumber(
  storedBills: StoredBill[],
  isOfficeBill: boolean = false,
  branch?: BranchLocation | string | null
): string {
  if (branch) {
    return computeBranchRunningBillNo(storedBills, branch, isOfficeBill);
  }
  return computeBranchRunningBillNo(storedBills, undefined, isOfficeBill);
}

function buildLightStoredBillsForStorage(bills: StoredBill[]): StoredBill[] {
  return (bills || []).map((b) => {
    if (!b) return b;
    const hasHeavy =
      (typeof b.receivedCopy === 'string' && b.receivedCopy.length > 1500) ||
      (typeof b.header?.receivedCopy === 'string' && b.header.receivedCopy.length > 1500);
    if (!hasHeavy) return b;
    const copy: any = { ...b };
    if (typeof copy.receivedCopy === 'string' && copy.receivedCopy.length > 1500) delete copy.receivedCopy;
    if (copy.header && typeof copy.header.receivedCopy === 'string' && copy.header.receivedCopy.length > 1500) {
      copy.header = { ...copy.header };
      delete copy.header.receivedCopy;
    }
    return copy;
  });
}

function deduplicateBills(bills: StoredBill[]): StoredBill[] {
  const seenIds = new Set<string>();
  const seenBillNumbers = new Set<string>();
  const result: StoredBill[] = [];

  for (let i = 0; i < bills.length; i++) {
    const b = bills[i];
    if (!b) continue;
    const bId = (b.id && typeof b.id === 'string' && b.id.trim()) ? b.id.trim() : `bill-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const isOffice = Boolean(b.isOfficeBill || b.header?.isOfficeBill);
    const bNo = (b.header?.billNo || '').trim().toLowerCase();
    const pName = (b.header?.partyName || '').trim().toLowerCase();
    const total = b.grandTotal ?? 0;
    const date = (b.header?.date || b.savedAt?.substring(0, 10) || '').trim();

    const branchKey = (b.branchId || b.header?.branchId || b.header?.branchName || b.branchName || '').trim().toLowerCase();
    const key = bNo ? `${branchKey}::${isOffice ? 'office' : 'showroom'}::${bNo}::${pName}::${total}::${date}` : bId;
    if (seenIds.has(bId) || seenBillNumbers.has(key)) continue;

    seenIds.add(bId);
    seenBillNumbers.add(key);
    result.push({ ...b, id: bId });
  }

  return result;
}

export function repairCategoryInItemNameRecords(itemsList: Item[]): {
  items: Item[];
  removedPseudoItemIds: string[];
  repairedCategories: string[];
  changed: boolean;
} {
  if (!Array.isArray(itemsList)) {
    return { items: [], removedPseudoItemIds: [], repairedCategories: [], changed: false };
  }

  const seenIds = new Set<string>();
  const result: Item[] = [];
  const removedPseudoItemIds: string[] = [];
  const repairedCatSet = new Set<string>();
  let changed = false;
  let activeRepairedCategory = '';
  let prevWasBanner = false;

  for (let i = 0; i < itemsList.length; i++) {
    const rawItem = itemsList[i];
    if (!rawItem) continue;
    const strId =
      rawItem.id && typeof rawItem.id === 'string' && rawItem.id.trim()
        ? rawItem.id.trim()
        : rawItem.code
        ? `item-${rawItem.code.trim().toLowerCase()}`
        : `item-${i}`;

    if (seenIds.has(strId)) continue;

    const rawName = cleanCategoryLabel(rawItem.name || '');
    const rawSpec = cleanCategoryLabel(rawItem.sizeSpec || '');

    const hasConcreteItemData = (Number(rawItem.rate) > 0) || (Number(rawItem.openingStock) > 0);
    // Detect if a pure cable category label (e.g. "(H.T XLPE Cable) (Copper Tape Screen)") landed in Item Name
    if (rawName && isPureCableCategoryLabel(rawName)) {
      // Case A: Actual item size/name was placed in sizeSpec while category was placed in name -> swap in place
      if (rawSpec && !isPureCableCategoryLabel(rawSpec)) {
        const catLabel = rawName;
        saveCustomCategory(catLabel);
        repairedCatSet.add(catLabel);
        activeRepairedCategory = catLabel;
        prevWasBanner = false;
        seenIds.add(strId);
        changed = true;
        result.push({
          ...rawItem,
          id: strId,
          name: rawSpec,
          category: catLabel,
          sizeSpec: ''
        });
        continue;
      }

      // Case B: ONLY remove as pseudo-item banner if it has NO price, NO stock, and NO real code
      if (!hasConcreteItemData) {
        if (prevWasBanner && activeRepairedCategory && isSubCategoryQualifier(rawName)) {
          activeRepairedCategory = cleanCategoryLabel(`${activeRepairedCategory} ${rawName}`);
        } else {
          activeRepairedCategory = rawName;
        }
        saveCustomCategory(activeRepairedCategory);
        repairedCatSet.add(activeRepairedCategory);
        prevWasBanner = true;
        changed = true;
        if (rawItem.id && typeof rawItem.id === 'string' && rawItem.id.trim()) {
          removedPseudoItemIds.push(rawItem.id.trim());
        }
        continue;
      }
    }

    prevWasBanner = false;
    seenIds.add(strId);

    let nextItem: Item = { ...rawItem, id: strId };

    // Propagate rescued section category onto immediately following grouped items whose category defaulted heuristically
    if (activeRepairedCategory) {
      const isSeededDefaultItem = /^item-\d+$/.test(strId);
      if (isSeededDefaultItem) {
        activeRepairedCategory = '';
      } else {
        const curCat = (nextItem.category || '').trim();
        const curCatLow = curCat.toLowerCase();
        const activeCatLow = activeRepairedCategory.toLowerCase();
        const wasHeuristicByaFromRm =
          curCatLow === 'bya' &&
          !/\bbya\b/i.test(nextItem.name || '') &&
          !/\bbya\b/i.test(nextItem.sizeSpec || '') &&
          /xlpe|h\.?\s*t\.?|l\.?\s*t\.?|screen|armour|armor|nyy|nym|power|control/i.test(activeRepairedCategory);

        if (!curCat || curCatLow === 'general' || curCatLow === 'single core wires' || wasHeuristicByaFromRm) {
          nextItem = { ...nextItem, category: activeRepairedCategory };
          changed = true;
        } else if (curCatLow !== activeCatLow) {
          activeRepairedCategory = '';
        }
      }
    }

    result.push(nextItem);
  }

  return {
    items: result,
    removedPseudoItemIds,
    repairedCategories: Array.from(repairedCatSet),
    changed
  };
}

export function sanitizeAndDeduplicateItems(itemsList: Item[]): Item[] {
  return repairCategoryInItemNameRecords(itemsList).items;
}

export default function App() {
  // Auth & Login State with 10-Minute Inactivity Auto-Logout
  const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
  const [sessionExpiredMsg, setSessionExpiredMsg] = useState<string>('');
  const lastActivityRef = useRef<number>(Date.now());
  const [appToast, setAppToast] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const { isOnline: isCloudOnline, offlineWarning } = useConnectivityStatus();

  useEffect(() => {
    if (appToast) {
      const timer = setTimeout(() => setAppToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [appToast]);

  const [currentTheme, setCurrentTheme] = useState<AppTheme>(() => {
    try {
      const saved = localStorage.getItem('polycables_app_theme');
      if (saved) return saved as AppTheme;
    } catch {}
    return 'cyber_teal';
  });

  useEffect(() => {
    try {
      localStorage.setItem('polycables_app_theme', currentTheme);
      document.body.className = `theme-${currentTheme.replace(/_/g, '-')}`;
      document.documentElement.setAttribute('data-theme', currentTheme);
    } catch {}
  }, [currentTheme]);

  const [giantSuccessToast, setGiantSuccessToast] = useState<string | null>(null);

  const triggerGiantSuccess = useCallback((message: string, onDone?: () => void) => {
    setGiantSuccessToast(message);
    setTimeout(() => {
      setGiantSuccessToast(null);
      if (onDone) onDone();
    }, 1000);
  }, []);

  useEffect(() => {
    const handleGiantSuccessEvent = (e: any) => {
      const msg = e.detail?.message || 'Saved Successfully!';
      triggerGiantSuccess(msg, e.detail?.onDone);
    };
    window.addEventListener('polycables_giant_success', handleGiantSuccessEvent);
    return () => {
      window.removeEventListener('polycables_giant_success', handleGiantSuccessEvent);
    };
  }, [triggerGiantSuccess]);

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    // When development bypass is enabled, auto-login directly as Admin
    if (BYPASS_LOGIN_FOR_DEV) {
      return DEV_ADMIN_USER;
    }
    try {
      const saved = localStorage.getItem('app_current_user');
      const lastActive = Number(localStorage.getItem('polycables_last_activity'));
      // If previous session was idle for more than 10 minutes, expire it immediately
      if (saved && lastActive && Date.now() - lastActive > 10 * 60 * 1000) {
        localStorage.removeItem('app_current_user');
        localStorage.removeItem('polycables_last_activity');
        return null;
      }
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && (parsed.username?.toLowerCase() === 'suvroadmin' || parsed.isSuperAdmin)) {
          parsed.name = 'Super Admin';
          parsed.userRole = 'Super Admin';
        }
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  });

  // Multi-Tab Chrome-style Tabs State (Executive Dashboard is never a tab pill; it's the home view)
  const [tabs, setTabs] = useState<ChromeTabItem[]>(() => {
    try {
      const saved = localStorage.getItem('polycables_open_tabs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const sanitized: ChromeTabItem[] = [];
          for (const item of parsed) {
            if (item && typeof item === 'object' && typeof item.viewTab === 'string') {
              if (item.viewTab === 'slip_pad_memo' || item.viewTab === 'report_dashboard') continue;
              sanitized.push({
                id: typeof item.id === 'string' ? item.id : `tab-${Math.random().toString(36).slice(2, 8)}`,
                viewTab: item.viewTab,
                title: typeof item.title === 'string' ? item.title : 'Tab',
                itemSubTab: typeof item.itemSubTab === 'string' ? item.itemSubTab : undefined,
                reportSubTab: typeof item.reportSubTab === 'string' ? item.reportSubTab : undefined,
                expenseSubTab: typeof item.expenseSubTab === 'string' ? item.expenseSubTab : undefined,
                settingsSubTab: typeof item.settingsSubTab === 'string' ? item.settingsSubTab : undefined,
                requisitionSubTab: typeof item.requisitionSubTab === 'string' ? item.requisitionSubTab : undefined,
              });
            }
          }
          // Deduplicate any duplicate viewTabs on initial load
          const seen = new Set<string>();
          const deduped: ChromeTabItem[] = [];
          for (const t of sanitized) {
            if (!seen.has(t.viewTab)) {
              seen.add(t.viewTab);
              deduped.push(t);
            }
          }
          if (deduped.length > 0) return deduped;
        }
      }
    } catch {}
    return [
      { id: 'tab-main', viewTab: 'builder', title: 'Bill Invoicer' }
    ];
  });

  const tabsRef = useRef<ChromeTabItem[]>(tabs);
  tabsRef.current = tabs;

  const [activeTabId, setActiveTabId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('polycables_active_tab_id');
      if (saved) return saved;
    } catch {}
    return 'tab-main';
  });
  const [selectedLedgerPartyId, setSelectedLedgerPartyId] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem('polycables_selected_ledger_party_id') || undefined;
    } catch {
      return undefined;
    }
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [itemSubTab, setItemSubTab] = useState<'items_list' | 'special_items' | 'categories' | 'price_history' | 'import_factory' | 'import_history' | 'trash'>(() => {
    try {
      const saved = localStorage.getItem('polycables_item_subtab');
      if (saved) return saved as any;
    } catch {}
    return 'items_list';
  });
  const [expenseSubTab, setExpenseSubTab] = useState<'list' | 'report' | 'trash' | 'monthly_expense' | 'expense_amount' | 'conveyance'>(() => {
    try {
      const saved = localStorage.getItem('polycables_expense_subtab');
      if (saved) return saved as any;
    } catch {}
    return 'list';
  });
  const [reportSubTab, setReportSubTab] = useState<'customer_wise_sales_collection' | 'party_bank_details' | 'special_bank_cash' | 'bill_wise_sales' | 'office_report' | 'executive_dashboard'>(() => {
    try {
      const saved = localStorage.getItem('polycables_report_subtab');
      if (saved) return saved as any;
    } catch {}
    return 'customer_wise_sales_collection';
  });
  const [requisitionSubTab, setRequisitionSubTab] = useState<'entry_slip' | 'list' | 'approved_history' | 'delivered'>(() => {
    try {
      const saved = localStorage.getItem('polycables_requisition_subtab');
      if (saved) return saved as any;
    } catch {}
    return 'entry_slip';
  });
  const [factorySubTab, setFactorySubTab] = useState<'approved_history' | 'delivered'>(() => {
    try {
      const saved = localStorage.getItem('polycables_factory_subtab');
      if (saved) return saved as any;
    } catch {}
    return 'approved_history';
  });

  useEffect(() => {
    if (activeTabId) {
      try { localStorage.setItem('polycables_active_tab_id', activeTabId); } catch {}
    }
  }, [activeTabId]);

  useEffect(() => {
    try {
      if (selectedLedgerPartyId) {
        localStorage.setItem('polycables_selected_ledger_party_id', selectedLedgerPartyId);
      } else {
        localStorage.removeItem('polycables_selected_ledger_party_id');
      }
    } catch {}
  }, [selectedLedgerPartyId]);

  useEffect(() => {
    try { localStorage.setItem('polycables_item_subtab', itemSubTab); } catch {}
  }, [itemSubTab]);

  useEffect(() => {
    try { localStorage.setItem('polycables_expense_subtab', expenseSubTab); } catch {}
  }, [expenseSubTab]);

  useEffect(() => {
    try { localStorage.setItem('polycables_report_subtab', reportSubTab); } catch {}
  }, [reportSubTab]);

  useEffect(() => {
    try { localStorage.setItem('polycables_requisition_subtab', requisitionSubTab); } catch {}
  }, [requisitionSubTab]);

  useEffect(() => {
    try { localStorage.setItem('polycables_factory_subtab', factorySubTab); } catch {}
  }, [factorySubTab]);

  // Idle-deferred light module warmup after login so initial dashboard renders smoothly without chunk-loading stalls
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    const warmKeys: ViewLoaderKey[] = ['builder', 'stored_bills', 'item_directory', 'expense_directory'];
    const timer = setTimeout(() => {
      if (cancelled) return;
      warmKeys.forEach((k, idx) => {
        setTimeout(() => {
          if (!cancelled) preloadViewModule(k);
        }, idx * 250);
      });
    }, 2500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [currentUser]);

  // Derive active tab from activeTabId - defaults cleanly to Bill Invoicer
  const currentTab = useMemo(() => {
    if (activeTabId === 'tab-factory') {
      return {
        id: 'tab-factory',
        viewTab: 'factory' as ViewTab,
        title: 'Factory'
      };
    }
    if (activeTabId === 'tab-dashboard') {
      const meta = getTabMeta('report_dashboard', undefined, reportSubTab);
      return {
        id: 'tab-dashboard',
        viewTab: 'report_dashboard' as ViewTab,
        title: meta.title,
        reportSubTab: reportSubTab
      };
    }
    if (activeTabId === 'tab-dashboard-admin') {
      return {
        id: 'tab-dashboard-admin',
        viewTab: 'admin_sales_collection_report' as ViewTab,
        title: 'Dashboard • Sales & Collection (Admin)'
      };
    }
    if (activeTabId === 'tab-main-menu') {
      if (isFactoryUser(currentUser)) {
        return {
          id: 'tab-factory',
          viewTab: 'factory' as ViewTab,
          title: 'Factory'
        };
      }
      return {
        id: 'tab-main-menu',
        viewTab: 'main_menu' as ViewTab,
        title: 'Main Menu'
      };
    }
    const found = tabs.find((t) => t.id === activeTabId);
    if (found) return found;
    return {
      id: 'tab-main',
      viewTab: 'builder' as ViewTab,
      title: 'Bill Invoicer'
    };
  }, [tabs, activeTabId, reportSubTab, currentUser]);

  const activeTab = currentTab.viewTab;
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [isCommHubOpen, setIsCommHubOpen] = useState(false);
  const [unreadCommCount, setUnreadCommCount] = useState(0);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);

  useEffect(() => {
    const handleUnlock = () => {
      unlockAudio();
    };
    const handleOpenHub = () => {
      unlockAudio();
      setIsCommHubOpen(true);
    };
    window.addEventListener('pointerdown', handleUnlock, { once: true });
    window.addEventListener('keydown', handleUnlock, { once: true });
    window.addEventListener('polycables_open_comm_hub', handleOpenHub);
    return () => {
      window.removeEventListener('pointerdown', handleUnlock);
      window.removeEventListener('keydown', handleUnlock);
      window.removeEventListener('polycables_open_comm_hub', handleOpenHub);
    };
  }, []);
  const [settingsSubTab, setSettingsSubTab] = useState<'backup' | 'banks_accounts' | 'email_smtp' | 'trash' | 'system' | 'shortcuts' | 'user_roles_menus' | 'allowance_settings'>(() => {
    try {
      const saved = localStorage.getItem('polycables_settings_subtab');
      if (saved) return saved as any;
    } catch {}
    return 'backup';
  });
  const [approvedHubSubTab, setApprovedHubSubTab] = useState<ApprovedHubSubTab>(() => {
    try {
      const saved = localStorage.getItem('polycables_approved_hub_subtab');
      if (saved === 'sales_approved' || saved === 'conveyance_approved' || saved === 'expense_approved') return saved;
    } catch {}
    return 'sales_approved';
  });
  const [isConvertedFromReq, setIsConvertedFromReq] = useState<boolean>(false);

  useEffect(() => {
    try { localStorage.setItem('polycables_settings_subtab', settingsSubTab); } catch {}
  }, [settingsSubTab]);

  useEffect(() => {
    try { localStorage.setItem('polycables_approved_hub_subtab', approvedHubSubTab); } catch {}
  }, [approvedHubSubTab]);

  // Ensure Co-pilot is strictly closed and unauthorized access prevented for non-Suvroadmin users
  useEffect(() => {
    if (!isSuvroAdmin(currentUser)) {
      setIsCopilotOpen(false);
    }
  }, [currentUser]);

  // Set active tab (Single-tab by default; Ctrl+Click opens 2nd/new tab)
  const setActiveTab = useCallback((
    tab: ViewTab,
    forceNewTab: boolean = false,
    subTabs?: {
      itemSubTab?: 'items_list' | 'special_items' | 'categories' | 'price_history' | 'import_factory' | 'import_history' | 'trash';
      reportSubTab?: 'customer_wise_sales_collection' | 'party_bank_details' | 'special_bank_cash' | 'bill_wise_sales' | 'office_report' | 'executive_dashboard';
      expenseSubTab?: 'list' | 'report' | 'trash' | 'monthly_expense' | 'expense_amount' | 'conveyance';
      settingsSubTab?: 'backup' | 'banks_accounts' | 'email_smtp' | 'trash' | 'system' | 'shortcuts' | 'user_roles_menus' | 'allowance_settings';
      requisitionSubTab?: 'entry_slip' | 'list' | 'approved_history' | 'delivered';
      factorySubTab?: 'approved_history' | 'delivered';
      approvedHubSubTab?: ApprovedHubSubTab;
    }
  ) => {
    const cleanItemSub = typeof subTabs?.itemSubTab === 'string' ? subTabs.itemSubTab : undefined;
    const cleanReportSub = typeof subTabs?.reportSubTab === 'string' ? subTabs.reportSubTab : undefined;
    const cleanExpenseSub = typeof subTabs?.expenseSubTab === 'string' ? subTabs.expenseSubTab : undefined;
    const cleanSettingsSub = typeof subTabs?.settingsSubTab === 'string' ? subTabs.settingsSubTab : undefined;
    const cleanReqSub = (
      subTabs?.requisitionSubTab === 'entry_slip' ||
      subTabs?.requisitionSubTab === 'list' ||
      subTabs?.requisitionSubTab === 'approved_history' ||
      subTabs?.requisitionSubTab === 'delivered'
    ) ? subTabs.requisitionSubTab : undefined;
    const cleanFactorySub = (subTabs?.factorySubTab === 'approved_history' || subTabs?.factorySubTab === 'delivered') ? subTabs.factorySubTab : undefined;
    const cleanApprovedSub = (
      subTabs?.approvedHubSubTab === 'sales_approved' ||
      subTabs?.approvedHubSubTab === 'conveyance_approved' ||
      subTabs?.approvedHubSubTab === 'expense_approved'
    ) ? subTabs.approvedHubSubTab : undefined;

    if (cleanItemSub) setItemSubTab(cleanItemSub);
    if (cleanReportSub && cleanReportSub !== 'executive_dashboard') setReportSubTab(cleanReportSub);
    if (cleanExpenseSub) setExpenseSubTab(cleanExpenseSub);
    if (cleanSettingsSub) setSettingsSubTab(cleanSettingsSub);
    if (cleanReqSub) setRequisitionSubTab(cleanReqSub);
    if (cleanFactorySub) setFactorySubTab(cleanFactorySub);
    if (cleanApprovedSub) setApprovedHubSubTab(cleanApprovedSub);

    if (tab === 'factory') {
      setSelectedLedgerPartyId(undefined);
      setActiveTabId('tab-factory');
      return;
    }

    if (tab === 'report_dashboard') {
      setSelectedLedgerPartyId(undefined);
      setActiveTabId('tab-dashboard');
      if (cleanReportSub) {
        setTabs((prev) =>
          prev.map((t) =>
            t.id === 'tab-dashboard'
              ? {
                  ...t,
                  reportSubTab: cleanReportSub,
                  title: getTabMeta('report_dashboard', undefined, cleanReportSub).title
                }
              : t
          )
        );
      }
      return;
    }

    if (tab !== 'customer_ledger') {
      setSelectedLedgerPartyId(undefined);
    }

    const meta = getTabMeta(tab, cleanItemSub, cleanReportSub, cleanExpenseSub, cleanSettingsSub, cleanReqSub);

    const prev = tabsRef.current;
    let next: ChromeTabItem[] = [];
    let targetId = '';

    // 1. If forceNewTab is requested (e.g. Ctrl + Click or explicit new tab), create a new tab
    if (forceNewTab) {
      const newTab: ChromeTabItem = {
        id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        viewTab: tab,
        title: meta.title,
        itemSubTab: cleanItemSub,
        reportSubTab: cleanReportSub,
        expenseSubTab: cleanExpenseSub,
        settingsSubTab: cleanSettingsSub,
        requisitionSubTab: cleanReqSub
      };
      targetId = newTab.id;
      next = [...prev.filter((t) => t.viewTab !== 'report_dashboard'), newTab];
    } else {
      // 2. Normal click: Every menu works on ONE active tab!
      const activeIdx = prev.findIndex((t) => t.id === activeTabId);
      if (activeIdx !== -1) {
        targetId = prev[activeIdx].id;
        next = [...prev];
        next[activeIdx] = {
          ...next[activeIdx],
          viewTab: tab,
          title: meta.title,
          itemSubTab: cleanItemSub,
          reportSubTab: cleanReportSub,
          expenseSubTab: cleanExpenseSub,
          settingsSubTab: cleanSettingsSub,
          requisitionSubTab: cleanReqSub
        };
      } else if (prev.length > 0) {
        targetId = prev[0].id;
        next = [...prev];
        next[0] = {
          ...next[0],
          viewTab: tab,
          title: meta.title,
          itemSubTab: cleanItemSub,
          reportSubTab: cleanReportSub,
          expenseSubTab: cleanExpenseSub,
          settingsSubTab: cleanSettingsSub,
          requisitionSubTab: cleanReqSub
        };
      } else {
        const newTab: ChromeTabItem = {
          id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          viewTab: tab,
          title: meta.title,
          itemSubTab: cleanItemSub,
          reportSubTab: cleanReportSub,
          expenseSubTab: cleanExpenseSub,
          settingsSubTab: cleanSettingsSub,
          requisitionSubTab: cleanReqSub
        };
        targetId = newTab.id;
        next = [newTab];
      }
    }

    tabsRef.current = next;
    try { localStorage.setItem('polycables_open_tabs', JSON.stringify(next)); } catch {}
    setTabs(next);

    if (targetId) {
      setActiveTabId(targetId);
    }
  }, [activeTabId]);

  // Chrome Tab Bar Event Handlers
  const handleSelectTab = (tabId: string) => {
    setActiveTabId(tabId);
    const t = tabs.find((x) => x.id === tabId);
    if (t) {
      if (t.itemSubTab) setItemSubTab(t.itemSubTab as any);
      if (t.reportSubTab && t.reportSubTab !== 'executive_dashboard') setReportSubTab(t.reportSubTab as any);
      if (t.expenseSubTab) setExpenseSubTab(t.expenseSubTab as any);
      if (t.settingsSubTab) setSettingsSubTab(t.settingsSubTab as any);
      if (t.requisitionSubTab) setRequisitionSubTab(t.requisitionSubTab as any);
    }
  };

  // When a tab is closed, activate remaining tab if present, else show Main Menu
  const handleCloseTab = (tabId: string) => {
    const next = tabsRef.current.filter((t) => t.id !== tabId);
    tabsRef.current = next;
    try { localStorage.setItem('polycables_open_tabs', JSON.stringify(next)); } catch {}
    setTabs(next);
    if (activeTabId === tabId) {
      if (next.length > 0) {
        setActiveTabId(next[next.length - 1].id);
      } else {
        setActiveTabId('tab-main-menu');
      }
    }
  };

  const handleNewTab = (
    viewTab: ViewTab = 'builder',
    customTitle?: string,
    subTabs?: {
      itemSubTab?: 'items_list' | 'special_items' | 'categories' | 'price_history' | 'import_factory' | 'import_history' | 'trash';
      reportSubTab?: 'customer_wise_sales_collection' | 'party_bank_details' | 'special_bank_cash' | 'bill_wise_sales' | 'office_report' | 'executive_dashboard';
      expenseSubTab?: 'list' | 'report' | 'trash';
    }
  ) => {
    const targetTab = viewTab === 'report_dashboard' ? 'builder' : viewTab;
    const meta = getTabMeta(targetTab, subTabs?.itemSubTab, subTabs?.reportSubTab, subTabs?.expenseSubTab);
    const newTab: ChromeTabItem = {
      id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      viewTab: targetTab,
      title: customTitle || meta.title,
      itemSubTab: subTabs?.itemSubTab,
      reportSubTab: subTabs?.reportSubTab,
      expenseSubTab: subTabs?.expenseSubTab
    };

    const next = [...tabsRef.current.filter((t) => t.viewTab !== 'report_dashboard'), newTab];
    tabsRef.current = next;
    try { localStorage.setItem('polycables_open_tabs', JSON.stringify(next)); } catch {}
    setTabs(next);
    setActiveTabId(newTab.id);

    if (subTabs?.itemSubTab) setItemSubTab(subTabs.itemSubTab);
    if (subTabs?.reportSubTab && subTabs.reportSubTab !== 'executive_dashboard') setReportSubTab(subTabs.reportSubTab);
    if (subTabs?.expenseSubTab) setExpenseSubTab(subTabs.expenseSubTab);
  };

  const handleCloseOtherTabs = (tabId: string) => {
    const target = tabsRef.current.find((t) => t.id === tabId);
    if (!target) return;
    const next = [target];
    tabsRef.current = next;
    try { localStorage.setItem('polycables_open_tabs', JSON.stringify(next)); } catch {}
    setTabs(next);
    setActiveTabId(target.id);
  };

  const handleDuplicateTab = (tabId: string) => {
    const target = tabsRef.current.find((t) => t.id === tabId);
    if (!target) return;
    const duplicated: ChromeTabItem = {
      ...target,
      id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `${target.title} (Copy)`
    };
    const next = [...tabsRef.current, duplicated];
    tabsRef.current = next;
    try { localStorage.setItem('polycables_open_tabs', JSON.stringify(next)); } catch {}
    setTabs(next);
    setActiveTabId(duplicated.id);
  };

  // Navigation History Stack to enable "Back" button to open previous page
  interface PageHistoryState {
    viewTab: ViewTab;
    activeTabId: string;
    itemSubTab?: string;
    reportSubTab?: string;
    expenseSubTab?: string;
    settingsSubTab?: string;
    requisitionSubTab?: string;
    selectedLedgerPartyId?: string;
  }

  const pageHistoryRef = useRef<PageHistoryState[]>([]);
  const isPoppingHistoryRef = useRef<boolean>(false);
  const prevPageStateRef = useRef<PageHistoryState | null>(null);

  // Monitor tab and sub-tab transitions and record history
  useEffect(() => {
    const currentState: PageHistoryState = {
      viewTab: activeTab,
      activeTabId,
      itemSubTab,
      reportSubTab,
      expenseSubTab,
      settingsSubTab,
      requisitionSubTab,
      selectedLedgerPartyId
    };

    if (isPoppingHistoryRef.current) {
      prevPageStateRef.current = currentState;
      return;
    }

    if (prevPageStateRef.current) {
      const prev = prevPageStateRef.current;
      const isChanged =
        prev.viewTab !== currentState.viewTab ||
        prev.activeTabId !== currentState.activeTabId ||
        prev.itemSubTab !== currentState.itemSubTab ||
        prev.reportSubTab !== currentState.reportSubTab ||
        prev.expenseSubTab !== currentState.expenseSubTab ||
        prev.settingsSubTab !== currentState.settingsSubTab ||
        prev.requisitionSubTab !== currentState.requisitionSubTab ||
        prev.selectedLedgerPartyId !== currentState.selectedLedgerPartyId;

      if (isChanged) {
        const history = pageHistoryRef.current;
        const last = history[history.length - 1];
        const isDuplicateOfLast =
          last &&
          last.viewTab === prev.viewTab &&
          last.activeTabId === prev.activeTabId &&
          last.itemSubTab === prev.itemSubTab &&
          last.reportSubTab === prev.reportSubTab &&
          last.expenseSubTab === prev.expenseSubTab &&
          last.settingsSubTab === prev.settingsSubTab &&
          last.requisitionSubTab === prev.requisitionSubTab &&
          last.selectedLedgerPartyId === prev.selectedLedgerPartyId;

        if (!isDuplicateOfLast) {
          history.push(prev);
          if (history.length > 50) history.shift();
        }
      }
    }

    prevPageStateRef.current = currentState;
  }, [
    activeTab,
    activeTabId,
    itemSubTab,
    reportSubTab,
    expenseSubTab,
    settingsSubTab,
    requisitionSubTab,
    selectedLedgerPartyId
  ]);

  // Auto-hide mobile sidebar menu on any route/tab/sub-tab selection, Escape key, or desktop resize
  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [
    activeTab,
    activeTabId,
    itemSubTab,
    reportSubTab,
    expenseSubTab,
    settingsSubTab,
    requisitionSubTab,
    factorySubTab,
    approvedHubSubTab,
    selectedLedgerPartyId
  ]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMobileSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Track origin view before editing a bill so Save, Close, or Cancel returns exactly where user was
  const billEditOriginRef = useRef<{
    viewTab: ViewTab;
    itemSubTab?: any;
    reportSubTab?: any;
    expenseSubTab?: any;
    settingsSubTab?: any;
    requisitionSubTab?: any;
    selectedLedgerPartyId?: string;
  } | null>(null);

  const handleReturnFromBillEdit = () => {
    let origin = billEditOriginRef.current;
    if (!origin) {
      try {
        const saved = localStorage.getItem('polycables_bill_edit_origin');
        if (saved) origin = JSON.parse(saved);
      } catch {}
    }

    if (origin) {
      billEditOriginRef.current = null;
      try {
        localStorage.removeItem('polycables_bill_edit_origin');
        localStorage.removeItem('polycables_editing_bill_id');
      } catch {}
      setEditingBillId(null);
      if (origin.selectedLedgerPartyId) {
        setSelectedLedgerPartyId(origin.selectedLedgerPartyId);
      }
      setActiveTab(origin.viewTab, false, {
        itemSubTab: origin.itemSubTab,
        reportSubTab: origin.reportSubTab,
        expenseSubTab: origin.expenseSubTab,
        settingsSubTab: origin.settingsSubTab,
        requisitionSubTab: origin.requisitionSubTab
      });
      return true;
    }
    if (editingBillId) {
      setEditingBillId(null);
      try {
        localStorage.removeItem('polycables_bill_edit_origin');
        localStorage.removeItem('polycables_editing_bill_id');
      } catch {}
      setActiveTab('stored_bills');
      return true;
    }
    return false;
  };

  // Back button action: open previous page where user was
  const handleBack = () => {
    // If currently editing a bill, return directly to where the user came from
    if (handleReturnFromBillEdit()) {
      return;
    }

    if (isConvertedFromReq || (header.refNo && (header.refNo.toLowerCase().includes('req') || header.refNo.toLowerCase().includes('sq')))) {
      setIsConvertedFromReq(false);
      setActiveTab('requisition');
      return;
    }

    if (pageHistoryRef.current.length > 0) {
      const prev = pageHistoryRef.current.pop();
      if (prev) {
        isPoppingHistoryRef.current = true;
        if (prev.viewTab === 'customer_ledger') {
          setSelectedLedgerPartyId(prev.selectedLedgerPartyId);
        } else {
          setSelectedLedgerPartyId(undefined);
        }

        if (prev.itemSubTab) setItemSubTab(prev.itemSubTab as any);
        if (prev.reportSubTab) setReportSubTab(prev.reportSubTab as any);
        if (prev.expenseSubTab) setExpenseSubTab(prev.expenseSubTab as any);
        if (prev.settingsSubTab) setSettingsSubTab(prev.settingsSubTab as any);
        if (prev.requisitionSubTab) setRequisitionSubTab(prev.requisitionSubTab as any);

        const existingTab = tabs.find((t) => t.id === prev.activeTabId);
        if (existingTab) {
          setActiveTabId(existingTab.id);
        } else if (prev.activeTabId === 'tab-main-menu') {
          setActiveTabId('tab-main-menu');
        } else {
          setActiveTab(prev.viewTab, false, {
            itemSubTab: prev.itemSubTab as any,
            reportSubTab: prev.reportSubTab as any,
            expenseSubTab: prev.expenseSubTab as any,
            settingsSubTab: prev.settingsSubTab as any,
            requisitionSubTab: prev.requisitionSubTab as any,
          });
        }

        setTimeout(() => {
          isPoppingHistoryRef.current = false;
        }, 80);
        return;
      }
    }

    setActiveTabId('tab-main-menu');
  };

  // Browser Back Button (popstate) listener
  useEffect(() => {
    const handlePopState = () => {
      handleBack();
    };
    window.addEventListener('popstate', handlePopState);

    const handleNavigateTabEvent = (e: any) => {
      const detail = e.detail;
      if (detail?.tab) {
        setActiveTab(detail.tab, Boolean(detail.forceNewTab), {
          itemSubTab: detail.itemSubTab,
          reportSubTab: detail.reportSubTab,
          expenseSubTab: detail.expenseSubTab,
          settingsSubTab: detail.settingsSubTab,
          requisitionSubTab: detail.requisitionSubTab,
          factorySubTab: detail.factorySubTab,
          approvedHubSubTab: detail.approvedHubSubTab
        });
      }
    };
    window.addEventListener('polycables_navigate_tab', handleNavigateTabEvent);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('polycables_navigate_tab', handleNavigateTabEvent);
    };
  }, [setActiveTab]);

  const handleClose = () => {
    if (handleReturnFromBillEdit()) {
      return;
    }
    pageHistoryRef.current = [];
    setActiveTabId('tab-main-menu');
  };

  const handleLogout = useCallback(() => {
    try {
      localStorage.removeItem('app_current_user');
      localStorage.removeItem('polycables_last_activity');
      localStorage.removeItem('polycables_active_tab_id');
      localStorage.removeItem('polycables_selected_ledger_party_id');
      localStorage.removeItem('polycables_current_header');
      localStorage.removeItem('polycables_current_lines');
      localStorage.removeItem('polycables_editing_bill_id');
      localStorage.removeItem('polycables_bill_edit_origin');
      localStorage.removeItem('polycables_stored_bills_filters');
      sessionStorage.removeItem('polycables_stored_bills_filters');
      localStorage.removeItem('polycables_report_marketing_person');
    } catch {}
    setIsCopilotOpen(false);
    setEditingBillId(null);
    setHasSavedCurrentBill(false);
    setHeader(defaultHeader);
    setLines(defaultBillLines);
    setCurrentUser(null);
  }, []);

  // Inactivity tracking effect: logs out after 10 min of inactivity (disabled during dev bypass)
  useEffect(() => {
    if (!currentUser) return;

    // Reset last activity on mount/login
    lastActivityRef.current = Date.now();
    try {
      localStorage.setItem('polycables_last_activity', String(Date.now()));
    } catch {}

    let throttleTimer: number | null = null;
    const handleUserActivity = () => {
      lastActivityRef.current = Date.now();
      if (!throttleTimer) {
        throttleTimer = window.setTimeout(() => {
          try {
            localStorage.setItem('polycables_last_activity', String(Date.now()));
          } catch {}
          throttleTimer = null;
        }, 3000);
      }
    };

    const activityEvents: (keyof WindowEventMap)[] = [
      'mousedown',
      'keydown',
      'touchstart',
      'click'
    ];

    activityEvents.forEach((evt) => {
      window.addEventListener(evt, handleUserActivity, { passive: true });
    });

    // Globally prevent mouse wheel scrolling from changing any number inputs anywhere in the app
    const handleGlobalWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'number') {
        e.preventDefault();
        target.blur();
      }
    };
    window.addEventListener('wheel', handleGlobalWheel, { passive: false });

    // Check every 5 seconds for inactivity timeout
    const interval = setInterval(() => {
      // In development mode with bypass active, skip auto-logout
      if (BYPASS_LOGIN_FOR_DEV) return;

      const savedTimestamp = Number(localStorage.getItem('polycables_last_activity')) || lastActivityRef.current;
      const effectiveLast = Math.max(lastActivityRef.current, savedTimestamp);
      const idleTime = Date.now() - effectiveLast;

      if (idleTime >= INACTIVITY_TIMEOUT_MS) {
        handleLogout();
        setSessionExpiredMsg('You were automatically signed out after 10 minutes of inactivity.');
      }
    }, 5000);

    return () => {
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, handleUserActivity);
      });
      window.removeEventListener('wheel', handleGlobalWheel);
      clearInterval(interval);
      if (throttleTimer) clearTimeout(throttleTimer);
    };
  }, [currentUser, handleLogout, INACTIVITY_TIMEOUT_MS]);

  // Company, Active Bill & Editing States
  const [editingBillId, setEditingBillId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('polycables_editing_bill_id') || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (editingBillId) {
        localStorage.setItem('polycables_editing_bill_id', editingBillId);
      } else {
        localStorage.removeItem('polycables_editing_bill_id');
      }
    } catch {}
  }, [editingBillId]);
  const [hasSavedCurrentBill, setHasSavedCurrentBill] = useState<boolean>(false);
  const [company, setCompany] = useState<CompanyDetails>(() => {
    try {
      const saved = localStorage.getItem('polycables_company');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && parsed.name) return { ...defaultCompany, ...parsed };
      }
    } catch {}
    return defaultCompany;
  });
  const [header, setHeader] = useState<BillHeader>(() => {
    try {
      const saved = localStorage.getItem('polycables_current_header');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') return { ...defaultHeader, ...parsed };
      }
    } catch {}
    return defaultHeader;
  });
  const [lines, setLines] = useState<BillLineItem[]>(() => {
    try {
      const saved = localStorage.getItem('polycables_current_lines');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return defaultBillLines;
  });

  // Continuously persist active bill entered data so reload never wipes in-progress work
  useEffect(() => {
    try {
      localStorage.setItem('polycables_current_header', JSON.stringify(header));
    } catch {}
  }, [header]);

  useEffect(() => {
    try {
      localStorage.setItem('polycables_current_lines', JSON.stringify(lines));
    } catch {}
  }, [lines]);

  // Master Directories (starts clean without pre-seeded default items; strictly synced to active Price Update History list)
  const [items, setItems] = useState<Item[]>(() => {
    const cleanBootKey = 'polycables_catalog_clean_v1';
    const hasCleanBoot = (() => {
      try {
        return localStorage.getItem(cleanBootKey) === 'true';
      } catch {
        return true;
      }
    })();

    const initialSnapshots = getPriceListSnapshots();

    if (!hasCleanBoot) {
      try {
        localStorage.setItem(cleanBootKey, 'true');
      } catch {}
      const recInit = reconcileCatalogItemsWithActiveSnapshot([], initialSnapshots);
      if (recInit.items.length === 0) {
        try {
          localStorage.setItem('polycables_items', '[]');
          localStorage.setItem('polycables_special_items', '[]');
          localStorage.setItem('polycables_permanent_special_items', '[]');
          localStorage.setItem('polycables_items_cleared', 'true');
        } catch {}
        return [];
      }
      return sanitizeAndDeduplicateItems(recInit.items);
    }

    const isItemsCleared = localStorage.getItem('polycables_items_cleared') === 'true';
    const saved = localStorage.getItem('polycables_items');
    let list: Item[] = [];
    if (saved !== null) {
      try {
        const parsed = JSON.parse(saved);
        list = Array.isArray(parsed) ? parsed : [];
      } catch {
        list = [];
      }
      if (isItemsCleared && list.length === 0) {
        return [];
      }
    }

    // Ensure trashed items remain in trash and are excluded from active list
    let trashedItemIds = new Set<string>();
    try {
      const savedTrashed = localStorage.getItem('polycables_trashed_items');
      if (savedTrashed) {
        const parsedTrashed = JSON.parse(savedTrashed);
        if (Array.isArray(parsedTrashed)) {
          parsedTrashed.forEach((tr: any) => {
            if (tr?.id) trashedItemIds.add(tr.id);
            if (tr?.data?.id) trashedItemIds.add(tr.data.id);
          });
        }
      }
    } catch {}
    try {
      const savedDeleted = localStorage.getItem('polycables_deleted_item_ids');
      if (savedDeleted) {
        const parsed = JSON.parse(savedDeleted);
        if (Array.isArray(parsed)) {
          parsed.forEach((id: string) => trashedItemIds.add(id));
        }
      }
    } catch {}
    try {
      const globalDeleted = localStorage.getItem('polycables_global_deleted_ids');
      if (globalDeleted) {
        const parsed = JSON.parse(globalDeleted);
        if (Array.isArray(parsed)) {
          parsed.forEach((id: string) => trashedItemIds.add(id));
        }
      }
    } catch {}

    if (trashedItemIds.size > 0) {
      list = list.filter((i) => !trashedItemIds.has(i.id));
    }

    const cleanedList = sanitizeAndDeduplicateItems(list);
    const reconciledInit = reconcileCatalogItemsWithActiveSnapshot(cleanedList, initialSnapshots);
    return sanitizeAndDeduplicateItems(reconciledInit.items);
  });

// Helper to guarantee all parties have unique non-colliding IDs and clean records
  const sanitizeAndDeduplicateParties = (partyList: Party[]): Party[] => {
  if (!Array.isArray(partyList)) return [];
  const seenIds = new Set<string>();
  const sanitized: Party[] = [];

  for (let i = 0; i < partyList.length; i++) {
    const p = partyList[i];
    if (!p) continue;
    let finalId = (p.id || '').trim();
    if (!finalId || seenIds.has(finalId)) {
      finalId = finalId ? `${finalId}-dup-${i}` : `party-${i + 1}`;
    }
    seenIds.add(finalId);
    sanitized.push({
      ...p,
      id: finalId,
    });
  }
  return sanitized;
};

  const [parties, setParties] = useState<Party[]>(() => {
    const saved = localStorage.getItem('polycables_parties');
    if (saved !== null) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const deduped = sanitizeAndDeduplicateParties(parsed).filter(
            (p) => p && !isGloballyDeletedId(p.id)
          );
          return deduped;
        }
      } catch {}
    }
    return [];
  });

  const [salespersons, setSalespersons] = useState<Salesperson[]>(() => {
    try {
      const savedDefApprover = localStorage.getItem('polycables_default_approver');
      if (savedDefApprover && savedDefApprover.toLowerCase().includes('mahmudul hasan')) {
        localStorage.removeItem('polycables_default_approver');
      }
      const savedReqApprover = localStorage.getItem('polycables_req_approved_by');
      if (savedReqApprover && savedReqApprover.toLowerCase().includes('mahmudul hasan')) {
        localStorage.removeItem('polycables_req_approved_by');
      }
    } catch {}

    const saved = localStorage.getItem('polycables_salespersons');
    if (saved !== null) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const unique = sanitizeSalespersonsList(parsed);
          try {
            localStorage.setItem('polycables_salespersons', JSON.stringify(unique));
          } catch {}
          return unique;
        }
      } catch (e) {}
    }
    return [];
  });

  // Continuous User & Staff Security & Synchronization Guard:
  // 1. If currentUser designation or role changes in Users & Staff, auto-sync currentUser state & session.
  // 2. If currentUser's account is removed, blocked, or deactivated in Users & Staff, immediately block and sign out user.
  useEffect(() => {
    if (!currentUser || BYPASS_LOGIN_FOR_DEV) return;
    const curUsername = (currentUser.username || '').toLowerCase().trim();
    if (curUsername === 'suvroadmin') return; // root master super admin

    const curCode = (currentUser.salespersonCode || '').toLowerCase().trim();
    const curId = ((currentUser as any).id || '').toLowerCase().trim();

    if (salespersons.length === 0) return;

    const matchedSp = salespersons.find((s) => {
      if (!s) return false;
      const sCode = (s.code || '').toLowerCase().trim();
      const sUser = (s.username || '').toLowerCase().trim();
      const sId = (s.id || '').toLowerCase().trim();
      return (curCode && sCode === curCode) || (curUsername && sUser === curUsername) || (curId && sId === curId);
    });

    if (!matchedSp) {
      setAppToast({ text: 'User ID does not match any record in Users & Staff. Access blocked.', type: 'error' });
      handleLogout();
      return;
    }

    if (matchedSp.isActive === false || (matchedSp as any).isBlocked) {
      setAppToast({ text: `Account "${matchedSp.name}" is blocked or inactive in Users & Staff. Access blocked.`, type: 'error' });
      handleLogout();
      return;
    }

    // Role & Designation synchronization
    const roleLower = (matchedSp.role || '').toLowerCase();
    const isAdminRole = roleLower === 'admin' || matchedSp.role === 'Admin' || (matchedSp.code && matchedSp.code.startsWith('ADM'));
    const isAgmRole = roleLower.includes('agm') || roleLower.includes('director') || roleLower.includes('general manager');
    const newSystemRole = isAdminRole ? 'admin' : (isAgmRole ? 'agm' : 'salesperson');
    const newDesignation = matchedSp.designation || 'Executive';
    const newUserRole = matchedSp.role || (isAdminRole ? 'Admin' : 'Sales Representative');
    const newName = matchedSp.name;
    const newInCharge = Boolean(matchedSp.isInCharge);
    const newBranchId = matchedSp.branchId;
    const newBranchName = matchedSp.branchName;

    if (
      currentUser.role !== newSystemRole ||
      currentUser.designation !== newDesignation ||
      currentUser.userRole !== newUserRole ||
      currentUser.name !== newName ||
      Boolean(currentUser.isInCharge) !== newInCharge ||
      currentUser.branchId !== newBranchId ||
      currentUser.branchName !== newBranchName
    ) {
      const syncedUser: AuthUser = {
        ...currentUser,
        role: newSystemRole,
        designation: newDesignation,
        userRole: newUserRole,
        name: newName,
        isInCharge: newInCharge,
        branchId: newBranchId,
        branchName: newBranchName
      };
      try {
        localStorage.setItem('app_current_user', JSON.stringify(syncedUser));
      } catch {}
      setCurrentUser(syncedUser);
    }
  }, [salespersons, currentUser, handleLogout]);

  // Factory Import Challans History
  const [factoryImports, setFactoryImports] = useState<FactoryImportChallan[]>(() => {
    const saved = localStorage.getItem('polycables_factory_imports');
    return saved ? JSON.parse(saved) : [];
  });

  // Stock Returns History (Party Returns & Factory Returns)
  const [stockReturns, setStockReturns] = useState<StockReturnChallan[]>(() => {
    const saved = localStorage.getItem('polycables_stock_returns');
    return saved ? JSON.parse(saved) : [];
  });

  // Delivery Challans State
  const [deliveryChallans, setDeliveryChallans] = useState<DeliveryChallan[]>(() => {
    const saved = localStorage.getItem('polycables_delivery_challans');
    return saved ? JSON.parse(saved) : [];
  });

  // Color Exchanges State
  const [colorExchanges, setColorExchanges] = useState<ColorExchangeChallan[]>(() => {
    const saved = localStorage.getItem('polycables_color_exchanges');
    return saved ? JSON.parse(saved) : [];
  });

  const handleSaveColorExchange = (exchange: ColorExchangeChallan) => {
    const stampedExchange: ColorExchangeChallan = {
      ...exchange,
      updatedAt: new Date().toISOString()
    } as ColorExchangeChallan;
    setColorExchanges((prev) => {
      const idx = prev.findIndex((e) => e.id === stampedExchange.id);
      const next = idx >= 0 ? prev.map((e, i) => (i === idx ? stampedExchange : e)) : [stampedExchange, ...prev];
      try { localStorage.setItem('polycables_color_exchanges', JSON.stringify(next)); } catch {}
      scheduleCloudSync({ colorExchanges: next }, true);
      return next;
    });
  };

  const handleDeleteColorExchange = (id: string) => {
    if (!checkCanTakeEntry('Delete Color Exchange', (msg) => setAppToast({ text: msg, type: 'error' }))) {
      return;
    }
    recordDeletedEntityId(id);
    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: clientSyncIdRef.current, ids: [id], type: 'color_exchange' })
    }).catch(() => {});

    setColorExchanges((prev) => {
      const next = prev.filter((e) => e.id !== id);
      try { localStorage.setItem('polycables_color_exchanges', JSON.stringify(next)); } catch {}
      scheduleCloudSync({ colorExchanges: next, deletedEntityIds: getGlobalDeletedIds() }, true);
      return next;
    });
  };

  // Expense Entries State
  const [expenses, setExpenses] = useState<ExpenseEntry[]>(() => {
    const saved = localStorage.getItem('polycables_expenses');
    return saved ? JSON.parse(saved) : [];
  });

  // Conveyance Entries State
  const [conveyances, setConveyances] = useState<ConveyanceEntry[]>(() => {
    try {
      const saved = localStorage.getItem('polycables_conveyances');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });
  const conveyancesRef = useRef(conveyances);
  conveyancesRef.current = conveyances;

  // Helper to clean bogus summary/total rows and lingering sample items when real imports exist
  const sanitizeCollectionsList = (rawList: CollectionMR[]): CollectionMR[] => {
    if (!Array.isArray(rawList)) return [];
    const hasImportedRecords = rawList.some((c) => c && typeof c.id === 'string' && c.id.startsWith('col-import-'));
    const defaultIds = new Set(defaultCollections.map((d) => d.id));

    const seenIds = new Set<string>();
    let filtered = rawList.filter((c) => {
      if (!c) return false;
      const pName = (c.partyName || '').trim().toLowerCase();
      if (
        !pName ||
        pName === '-' ||
        pName === '0' ||
        pName === 'imported customer' ||
        pName === 'unknown party' ||
        /^(total|grand\s*total|sub\s*total|subtotal|মোট|সর্বমোট|total\s*amount|total\s*collection|party\s*name|customer\s*name)$/i.test(pName)
      ) {
        return false;
      }
      // If user has imported their own collection sheet, strip lingering default sample items (e.g., col-1)
      if (hasImportedRecords && defaultIds.has(c.id)) {
        return false;
      }
      // Strict ID and record deduplication to avoid duplicate React keys
      const itemKey = c.id || `${(c.partyName || '').trim()}-${c.mrNo || ''}-${c.date || ''}-${c.amount}`;
      if (seenIds.has(itemKey)) {
        return false;
      }
      seenIds.add(itemKey);
      return true;
    });

    // Also check if an imported batch accidentally included a bottom Total row whose amount equals the sum of the rest
    if (filtered.length > 2) {
      const totalSum = filtered.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
      const halfSum = totalSum / 2;
      if (halfSum > 0) {
        const lastIdx = filtered.length - 1;
        const firstIdx = 0;
        if (Math.abs((Number(filtered[lastIdx].amount) || 0) - halfSum) < 0.01 && filtered[lastIdx].id?.startsWith('col-import-')) {
          filtered = filtered.slice(0, lastIdx);
        } else if (Math.abs((Number(filtered[firstIdx].amount) || 0) - halfSum) < 0.01 && filtered[firstIdx].id?.startsWith('col-import-')) {
          filtered = filtered.slice(1);
        }
      }
    }

    return filtered;
  };

  // Money Receipt Collections State
  const [collections, setCollections] = useState<CollectionMR[]>(() => {
    const saved = localStorage.getItem('polycables_collections');
    if (saved !== null) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          if (parsed.length === 0) return [];
          const defMap = new Map(defaultCollections.map((c) => [c.id, c]));
          const partyMap = new Map((parties || []).map((p) => [(p.name || '').trim().toLowerCase(), p]));
          const enriched = parsed.map((c: CollectionMR) => {
            const def = defMap.get(c.id);
            let cleanP = (c.partyName || def?.partyName || '').trim();
            const parenMatch = cleanP.match(/^(.*?)\s*\((.*?)\)$/);
            if (parenMatch) {
              cleanP = parenMatch[1].trim();
            }
            const pKey = cleanP.toLowerCase();
            const matchedP = partyMap.get(pKey);
            const isSonchita = pKey === 'new sonchita enterprise' || pKey.includes('sonchita');
            if (def) {
              return {
                ...def,
                ...c,
                partyName: cleanP,
                branchId: c.branchId || def.branchId || matchedP?.branchId || 'branch-1',
                branchName: c.branchName || def.branchName || matchedP?.branchName || 'Madhupur Sales Center',
                marketingPerson: isSonchita ? 'Sanjoy Chowhan' : (c.marketingPerson || def.marketingPerson || matchedP?.salespersonName || 'Subrata Sutradhar'),
                salesmanCode: isSonchita ? '149' : (c.salesmanCode || def.salesmanCode || matchedP?.salesmanCode || '134'),
                isDeposited: c.id === 'col-1' ? true : (c.isDeposited !== undefined ? c.isDeposited : def.isDeposited),
                depositDate: c.id === 'col-1' ? (c.depositDate || '2026-07-01') : (c.depositDate || def.depositDate),
                bankDepositId: c.id === 'col-1' ? (c.bankDepositId || 'bd-0') : (c.bankDepositId || def.bankDepositId)
              };
            }
            return {
              ...c,
              partyName: cleanP,
              branchId: c.branchId || matchedP?.branchId || 'branch-1',
              branchName: c.branchName || matchedP?.branchName || 'Madhupur Sales Center',
              marketingPerson: isSonchita ? 'Sanjoy Chowhan' : (c.marketingPerson || matchedP?.salespersonName || 'Subrata Sutradhar'),
              salesmanCode: isSonchita ? '149' : (c.salesmanCode || matchedP?.salesmanCode || '134')
            };
          });
          return sanitizeCollectionsList(enriched);
        }
      } catch (e) {
        // fallback
      }
    }
    return sanitizeCollectionsList(defaultCollections);
  });

  // Bank Deposits State
  const [bankDeposits, setBankDeposits] = useState<BankDeposit[]>(() => {
    const saved = localStorage.getItem('polycables_bank_deposits');
    const savedHistory = localStorage.getItem('depositHistory');
    const parseArray = (raw: string | null): BankDeposit[] => {
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    const primaryList = parseArray(saved);
    const historyList = parseArray(savedHistory);

    if (saved !== null || savedHistory !== null) {
      const mergedMap = new Map<string, BankDeposit>();
      [...primaryList, ...historyList].forEach((d: any) => {
        if (!d || typeof d !== 'object' || !d.id || d.isAutoDeposit || String(d.id).startsWith('auto-ho-')) return;
        if (!mergedMap.has(d.id)) mergedMap.set(d.id, d);
      });
      if (mergedMap.size === 0 && primaryList.length === 0 && saved !== null) {
        return [];
      }
      if (mergedMap.size > 0) {
        return Array.from(mergedMap.values()).map((d: BankDeposit) => {
          if (d.id === 'bd-0') {
            return {
              ...d,
              bankName: 'Pubali Bank PLC',
              accountName: 'Padma Enterprise',
              bankShortCode: 'PBL',
              accountShortCode: 'PE',
              displayTag: 'PBL(PE)',
              depositDate: d.depositDate || d.date || '2026-07-01'
            };
          }
          if (d.bankName === 'H/O' || d.displayTag === 'H/O') {
            return {
              ...d,
              bankName: 'H/O',
              accountName: d.accountName || 'H/O',
              displayTag: 'H/O',
              depositDate: d.depositDate || d.date
            };
          }
          if (!d.depositDate && d.date) {
            return { ...d, depositDate: d.date };
          }
          if (!d.date && d.depositDate) {
            return { ...d, date: d.depositDate };
          }
          return d;
        });
      }
    }
    return defaultBankDeposits;
  });

  // Requisitions & Branches State (Audit Directory workflow)
  const [branches, setBranches] = useState<BranchLocation[]>(() => {
    const saved = localStorage.getItem('polycables_branches');
    let branchList = defaultBranches;
    if (saved !== null) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          branchList = parsed;
        }
      } catch (e) {}
    }
    const cleaned = sanitizeAndSortBranches(branchList);
    try {
      localStorage.setItem('polycables_branches', JSON.stringify(cleaned));
    } catch {}
    return cleaned;
  });

  const [requisitions, setRequisitions] = useState<Requisition[]>(() => {
    const saved = localStorage.getItem('polycables_requisitions');
    let parsedList = defaultRequisitions;
    if (saved !== null) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) parsedList = parsed;
      } catch (e) {}
    }
    // Guarantee req # 66, req # 01, req # 02, and req # 03 are consistent and distinct
    return (parsedList || []).map((r) => {
      if (
        r.id === 'req-103' ||
        (r.partyName || '').trim().toLowerCase() === 'new sonchita enterprise' ||
        (r.reqNo || '').includes('66')
      ) {
        return {
          ...r,
          reqNo: (r.reqNo || '').replace('Kabir', 'Sanjoy').replace('# 66', '# 66-Sanjoy'),
          marketingPersonName: 'Sanjoy Chowhan',
          createdByName: 'Sanjoy Chowhan',
          salesmanCode: '149'
        };
      }
      if (r.id === 'req-070' && (r.reqNo === '# 01-Subrata Sutradhar' || r.seqNumber === 1)) {
        return {
          ...r,
          reqNo: '# 03-Subrata Sutradhar',
          seqNumber: 3,
          branchId: 'branch-1',
          branchName: 'Madhupur Sales Center',
          marketingPersonName: 'Subrata Sutradhar',
          createdByName: 'Subrata Sutradhar',
          salesmanCode: '134',
          inChargeApproved: true,
          inChargeApprovedBy: 'Subrata Sutradhar'
        };
      }
      if (r.id === 'req-101') {
        return {
          ...r,
          reqNo: '# 02-Subrata Sutradhar',
          seqNumber: 2,
          branchId: 'branch-1',
          branchName: 'Madhupur Sales Center',
          marketingPersonName: 'Subrata Sutradhar',
          createdByName: 'Subrata Sutradhar',
          salesmanCode: '134',
          inChargeApproved: true,
          inChargeApprovedBy: 'Subrata Sutradhar'
        };
      }
      if (r.id === 'req-102') {
        return {
          ...r,
          reqNo: '# 01-Subrata Sutradhar',
          seqNumber: 1,
          branchId: 'branch-1',
          branchName: 'Madhupur Sales Center',
          marketingPersonName: 'Subrata Sutradhar',
          createdByName: 'Subrata Sutradhar',
          salesmanCode: '134',
          inChargeApproved: true,
          inChargeApprovedBy: 'Subrata Sutradhar'
        };
      }
      return r;
    });
  });

  // Track user-deleted auto deposit IDs
  const [deletedAutoDepositIds, setDeletedAutoDepositIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('polycables_deleted_auto_deposits');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // fallback
      }
    }
    return [];
  });

  // Bank deposits with month-end H/O auto deposits
  const effectiveBankDeposits = useMemo(() => {
    return generateMonthEndHoAutoDeposits(collections, bankDeposits, deletedAutoDepositIds, expenses);
  }, [collections, bankDeposits, deletedAutoDepositIds, expenses]);

  // Centralized Bank and Account Lists (Shared globally across entire system)
  const isInvalidStorageEntry = (val: any) => {
    if (val === undefined || val === null) return true;
    if (typeof val === 'object') {
      const candidate = (val?.name || val?.bankName || val?.accountName || '').trim();
      return !candidate || candidate === '[object Object]' || candidate.startsWith('[object ');
    }
    const s = String(val).trim();
    return !s || s === '[object Object]' || s.startsWith('[object ') || s === 'undefined' || s === 'null';
  };

  const toCleanBankOrAccountName = (val: any): string => {
    if (val === undefined || val === null) return '';
    let candidate = '';
    if (typeof val === 'string') {
      candidate = val.trim();
    } else if (typeof val === 'object') {
      candidate = String(val?.name || val?.bankName || val?.accountName || '').trim();
    } else {
      candidate = String(val).trim();
    }
    if (!candidate || candidate === '[object Object]' || candidate.startsWith('[object ') || candidate === 'undefined' || candidate === 'null') {
      return '';
    }
    return candidate;
  };

  const [bankList, setBankList] = useState<string[]>(() => {
    const saved = localStorage.getItem('polycables_bank_list');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const sanitized = parsed
            .map((item: any) => toCleanBankOrAccountName(item))
            .filter((item) => item && !isInvalidStorageEntry(item));
          if (sanitized.length > 0) return sanitized;
        }
      } catch (e) {}
    }
    return defaultBanks;
  });

  const [accountList, setAccountList] = useState<string[]>(() => {
    const saved = localStorage.getItem('polycables_account_list');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const sanitized = parsed
            .map((item: any) => toCleanBankOrAccountName(item))
            .filter((item) => item && !isInvalidStorageEntry(item));
          if (sanitized.length > 0) return sanitized;
        }
      } catch (e) {}
    }
    return defaultAccounts;
  });

  // Financial Year Closings State
  const [closings, setClosings] = useState<FinancialYearClosing[]>(() => {
    const saved = localStorage.getItem('polycables_closings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    return [];
  });

  // Ensure content area stays smooth and stable at top when switching tabs or sub-menus
  useEffect(() => {
    const mainEl = document.getElementById('main-content-area') || document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTop = 0;
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [activeTab, activeTabId, itemSubTab]);

  const handleSaveClosing = useCallback((newClosing: FinancialYearClosing, updatedParties: Party[]) => {
    const nowIso = new Date().toISOString();
    const stampedClosing = { ...newClosing, updatedAt: nowIso };
    const nextClosings = [stampedClosing, ...closings.filter((c) => c.id !== stampedClosing.id)];
    setClosings(nextClosings);
    localStorage.setItem('polycables_closings', JSON.stringify(nextClosings));
    setParties(updatedParties);
    localStorage.setItem('polycables_parties', JSON.stringify(updatedParties));

    let updatedCollectionsList: CollectionMR[] | undefined = undefined;
    if (stampedClosing.settlementCollection && stampedClosing.settlementCollection.amount > 0 && stampedClosing.partyName) {
      const isBank = Boolean(
        stampedClosing.settlementCollection.bankName &&
        stampedClosing.settlementCollection.bankName.trim() !== '' &&
        !stampedClosing.settlementCollection.bankName.toLowerCase().includes('cash')
      );

      const newCol: CollectionMR = {
        id: `col_close_${Date.now()}`,
        date: stampedClosing.settlementCollection.date,
        entityName: 'Madhupur Sales Center',
        partyName: stampedClosing.partyName,
        mrNo: stampedClosing.settlementCollection.mrNo || 'YE-Close',
        amount: stampedClosing.settlementCollection.amount,
        bankName: isBank ? (stampedClosing.settlementCollection.bankName || 'Bank') : 'Cash',
        paymentType: isBank ? 'cheque' : 'cash',
        remarks: isBank ? `Regular Collection (${stampedClosing.financialYear})` : `Regular Cash Collection (${stampedClosing.financialYear})`,
        isYearClosingCollection: true,
        updatedAt: nowIso
      } as CollectionMR;
      setCollections((prevCols) => {
        const nextCols = [newCol, ...prevCols];
        safeSetStorageItem('polycables_collections', JSON.stringify(nextCols), nextCols);
        updatedCollectionsList = nextCols;
        return nextCols;
      });
    }

    scheduleCloudSync({
      closings: nextClosings,
      parties: updatedParties,
      ...(updatedCollectionsList ? { collections: updatedCollectionsList } : {})
    }, true);
  }, [closings]);

  const handleReopenClosing = useCallback((closingId: string) => {
    let targetClosing: FinancialYearClosing | undefined;
    setClosings((prev) => {
      targetClosing = prev.find((c) => c.id === closingId);
      const updated = prev.map((c) => (c.id === closingId ? { ...c, status: 'reopened' as const } : c));
      safeSetStorageItem('polycables_closings', JSON.stringify(updated), updated);
      return updated;
    });

    let updatedParties: Party[] | undefined = undefined;
    if (targetClosing && targetClosing.partyId) {
      setParties((prevParties) => {
        const nextParties = prevParties.map((p) => {
          if (
            targetClosing?.partyId
              ? p.id === targetClosing.partyId
              : p.name.trim().toLowerCase() === targetClosing?.partyName?.trim().toLowerCase()
          ) {
            return {
              ...p,
              openingBalance: targetClosing?.totalOpeningBalance ?? p.openingBalance
            };
          }
          return p;
        });
        safeSetStorageItem('polycables_parties', JSON.stringify(nextParties), nextParties);
        updatedParties = nextParties;
        return nextParties;
      });
    }

    let updatedCollections: CollectionMR[] | undefined = undefined;
    if (targetClosing) {
      const closingYear = targetClosing.financialYear;
      // On FY reopen, convert settlement collection to regular collection
      setCollections((prevCols) => {
        const nextCols = prevCols.map((c) => {
          if (c.isYearClosingCollection && (c.remarks?.includes(closingYear) || (targetClosing?.partyName && (c.partyName || c.entityName) === targetClosing.partyName))) {
            const isBank = Boolean(c.bankName && c.bankName.trim() !== '' && !c.bankName.toLowerCase().includes('cash'));
            return {
              ...c,
              isYearClosingCollection: false,
              remarks: isBank ? `Regular Collection (${closingYear})` : `Regular Cash Collection (${closingYear})`,
              paymentType: (isBank ? 'cheque' : 'cash') as 'cash' | 'cheque'
            };
          }
          return c;
        });
        safeSetStorageItem('polycables_collections', JSON.stringify(nextCols), nextCols);
        updatedCollections = nextCols as CollectionMR[];
        return nextCols as CollectionMR[];
      });
    }

    setClosings((prev) => {
      scheduleCloudSync({
        closings: prev,
        ...(updatedParties ? { parties: updatedParties } : {}),
        ...(updatedCollections ? { collections: updatedCollections } : {})
      }, true);
      return prev;
    });
  }, []);

  const handleDeleteClosing = useCallback((closingId: string) => {
    if (!checkCanTakeEntry('Delete Closing', (msg) => setAppToast({ text: msg, type: 'error' }))) {
      return;
    }
    recordDeletedEntityId(closingId);
    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: clientSyncIdRef.current, ids: [closingId], type: 'closing' })
    }).catch(() => {});

    let targetClosing: FinancialYearClosing | undefined;
    setClosings((prev) => {
      targetClosing = prev.find((c) => c.id === closingId);
      const updated = prev.filter((c) => c.id !== closingId);
      safeSetStorageItem('polycables_closings', JSON.stringify(updated), updated);
      return updated;
    });

    let updatedParties: Party[] | undefined = undefined;
    if (targetClosing && targetClosing.partyId) {
      setParties((prevParties) => {
        const nextParties = prevParties.map((p) => {
          if (
            targetClosing?.partyId
              ? p.id === targetClosing.partyId
              : p.name.trim().toLowerCase() === targetClosing?.partyName?.trim().toLowerCase()
          ) {
            return {
              ...p,
              openingBalance: targetClosing?.totalOpeningBalance ?? p.openingBalance
            };
          }
          return p;
        });
        safeSetStorageItem('polycables_parties', JSON.stringify(nextParties), nextParties);
        updatedParties = nextParties;
        return nextParties;
      });
    }

    let updatedCollections: CollectionMR[] | undefined = undefined;
    if (targetClosing) {
      const closingYear = targetClosing.financialYear;
      setCollections((prevCols) => {
        const nextCols = prevCols.filter((c) => {
          if (c.isYearClosingCollection && (c.remarks?.includes(closingYear) || (targetClosing?.partyName && (c.partyName || c.entityName) === targetClosing.partyName))) {
            return false;
          }
          return true;
        });
        safeSetStorageItem('polycables_collections', JSON.stringify(nextCols), nextCols);
        updatedCollections = nextCols;
        return nextCols;
      });
    }

    setClosings((prev) => {
      scheduleCloudSync({
        closings: prev,
        deletedEntityIds: getGlobalDeletedIds(),
        ...(updatedParties ? { parties: updatedParties } : {}),
        ...(updatedCollections ? { collections: updatedCollections } : {})
      }, true);
      return prev;
    });
  }, []);

  const handleUpdateClosing = useCallback((updatedClosing: FinancialYearClosing) => {
    const stampedClosing = { ...updatedClosing, updatedAt: new Date().toISOString() } as FinancialYearClosing;
    setClosings((prev) => {
      const updated = prev.map((c) => (c.id === stampedClosing.id ? stampedClosing : c));
      localStorage.setItem('polycables_closings', JSON.stringify(updated));
      scheduleCloudSync({ closings: updated }, true);
      return updated;
    });
  }, []);

  const handleAddBank = useCallback((name: string) => {
    if (!checkCanTakeEntry('Add Bank', (msg) => setAppToast({ text: msg, type: 'error' }))) {
      return;
    }
    const clean = toCleanBankOrAccountName(name);
    if (!clean) return;
    setBankList((prev) => {
      const safePrev = (prev || []).map((b) => toCleanBankOrAccountName(b)).filter(Boolean);
      if (safePrev.some((b) => b.toLowerCase() === clean.toLowerCase())) return safePrev;
      const updated = [clean, ...safePrev];
      safeSetStorageItem('polycables_bank_list', JSON.stringify(updated), updated);
      scheduleCloudSync({ bankList: updated }, true);
      return updated;
    });
  }, []);

  const handleDeleteBank = useCallback((name: string) => {
    if (!checkCanTakeEntry('Delete Bank', (msg) => setAppToast({ text: msg, type: 'error' }))) {
      return;
    }
    const target = toCleanBankOrAccountName(name).toLowerCase();
    setBankList((prev) => {
      const safePrev = (prev || []).map((b) => toCleanBankOrAccountName(b)).filter(Boolean);
      const updated = safePrev.filter((b) => b.toLowerCase() !== target);
      safeSetStorageItem('polycables_bank_list', JSON.stringify(updated), updated);
      scheduleCloudSync({ bankList: updated }, true);
      return updated;
    });
  }, []);

  const handleEditBank = useCallback((oldName: string, newName: string) => {
    if (!checkCanTakeEntry('Edit Bank', (msg) => setAppToast({ text: msg, type: 'error' }))) {
      return;
    }
    const clean = toCleanBankOrAccountName(newName);
    if (!clean) return;
    const oldTarget = toCleanBankOrAccountName(oldName).toLowerCase();
    setBankList((prev) => {
      const safePrev = (prev || []).map((b) => toCleanBankOrAccountName(b)).filter(Boolean);
      const updated = safePrev.map((b) => (b.toLowerCase() === oldTarget ? clean : b));
      safeSetStorageItem('polycables_bank_list', JSON.stringify(updated), updated);
      scheduleCloudSync({ bankList: updated }, true);
      return updated;
    });
  }, []);

  const handleResetBanks = useCallback(() => {
    if (!checkCanTakeEntry('Reset Banks', (msg) => setAppToast({ text: msg, type: 'error' }))) {
      return;
    }
    setBankList(defaultBanks);
    safeSetStorageItem('polycables_bank_list', JSON.stringify(defaultBanks), defaultBanks);
    scheduleCloudSync({ bankList: defaultBanks }, true);
  }, []);

  const handleAddAccount = useCallback((name: string) => {
    if (!checkCanTakeEntry('Add Account', (msg) => setAppToast({ text: msg, type: 'error' }))) {
      return;
    }
    const clean = toCleanBankOrAccountName(name);
    if (!clean) return;
    setAccountList((prev) => {
      const safePrev = (prev || []).map((a) => toCleanBankOrAccountName(a)).filter(Boolean);
      if (safePrev.some((a) => a.toLowerCase() === clean.toLowerCase())) return safePrev;
      const updated = [clean, ...safePrev];
      safeSetStorageItem('polycables_account_list', JSON.stringify(updated), updated);
      scheduleCloudSync({ accountList: updated }, true);
      return updated;
    });
  }, []);

  const handleDeleteAccount = useCallback((name: string) => {
    if (!checkCanTakeEntry('Delete Account', (msg) => setAppToast({ text: msg, type: 'error' }))) {
      return;
    }
    const target = toCleanBankOrAccountName(name).toLowerCase();
    setAccountList((prev) => {
      const safePrev = (prev || []).map((a) => toCleanBankOrAccountName(a)).filter(Boolean);
      const updated = safePrev.filter((a) => a.toLowerCase() !== target);
      safeSetStorageItem('polycables_account_list', JSON.stringify(updated), updated);
      scheduleCloudSync({ accountList: updated }, true);
      return updated;
    });
  }, []);

  const handleEditAccount = useCallback((oldName: string, newName: string) => {
    if (!checkCanTakeEntry('Edit Account', (msg) => setAppToast({ text: msg, type: 'error' }))) {
      return;
    }
    const clean = toCleanBankOrAccountName(newName);
    if (!clean) return;
    const oldTarget = toCleanBankOrAccountName(oldName).toLowerCase();
    setAccountList((prev) => {
      const safePrev = (prev || []).map((a) => toCleanBankOrAccountName(a)).filter(Boolean);
      const updated = safePrev.map((a) => (a.toLowerCase() === oldTarget ? clean : a));
      safeSetStorageItem('polycables_account_list', JSON.stringify(updated), updated);
      scheduleCloudSync({ accountList: updated }, true);
      return updated;
    });
  }, []);

  const handleResetAccounts = useCallback(() => {
    if (!checkCanTakeEntry('Reset Accounts', (msg) => setAppToast({ text: msg, type: 'error' }))) {
      return;
    }
    setAccountList(defaultAccounts);
    safeSetStorageItem('polycables_account_list', JSON.stringify(defaultAccounts), defaultAccounts);
    scheduleCloudSync({ accountList: defaultAccounts }, true);
  }, []);

  const handleDeleteBankDeposit = useCallback((id: string) => {
    if (!checkCanTakeEntry('Delete Bank Deposit', (msg) => setAppToast({ text: msg, type: 'error' }))) {
      return;
    }
    recordDeletedEntityId(id);
    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: clientSyncIdRef.current, ids: [id], type: 'deposit' })
    }).catch(() => {});

    if (id.startsWith('auto-ho-')) {
      setDeletedAutoDepositIds((prev) => {
        const next = prev.includes(id) ? prev : [...prev, id];
        safeSetStorageItem('polycables_deleted_auto_deposits', JSON.stringify(next), next);
        scheduleCloudSync({ deletedAutoDeposits: next, deletedEntityIds: getGlobalDeletedIds() }, true);
        return next;
      });
    } else {
      setBankDeposits((prev) => {
        const next = prev.filter((d) => d.id !== id);
        safeSetStorageItem('polycables_bank_deposits', JSON.stringify(next), next);
        safeSetStorageItem('depositHistory', JSON.stringify(next), next);
        scheduleCloudSync({ bankDeposits: next, deletedEntityIds: getGlobalDeletedIds() }, true);
        return next;
      });
    }
    setCollections((prev) => {
      const nextCol = prev.map((c) => {
        if (c.bankDepositId === id) {
          return {
            ...c,
            isDeposited: false,
            bankDepositId: undefined,
            depositDate: undefined,
            depositBankTag: undefined,
            bankName: (c.bankName || '').toUpperCase() === 'H/O' ? undefined : c.bankName
          };
        }
        return c;
      });
      safeSetStorageItem('polycables_collections', JSON.stringify(nextCol), nextCol);
      scheduleCloudSync({ collections: nextCol }, true);
      return nextCol;
    });
  }, []);

  const lastRestoreTimestampRef = useRef<number>(
    typeof window !== 'undefined' ? Number(localStorage.getItem('polycables_last_restore_time') || 0) : 0
  );

  // Stored Bills History Directory - Cloud-Live with local cache and IndexedDB resilience
  const [storedBills, setStoredBills] = useState<StoredBill[]>(() => {
    try {
      let candidateBills: StoredBill[] = [];
      const savedBills = localStorage.getItem('polycables_stored_bills');
      if (savedBills !== null) {
        const parsed = JSON.parse(savedBills);
        if (Array.isArray(parsed)) candidateBills = parsed;
      } else {
        const localCache = localStorage.getItem('polycables_stored_bills_cache');
        if (localCache) {
          const parsed = JSON.parse(localCache);
          if (Array.isArray(parsed) && parsed.length > 0) candidateBills = parsed;
        }
      }
      return candidateBills
        .filter((b) => b && b.id && !isGloballyDeletedId(b.id))
        .map((b) => {
          if (!b.lines || !Array.isArray(b.lines)) return b;
          let hasInvalid = false;
          const cleanLines = b.lines.map((l) => {
            const q = Number(l.coilQty);
            if (!isFinite(q) || isNaN(q) || q > 50000) {
              hasInvalid = true;
              return { ...l, coilQty: 0 };
            }
            return l;
          });
          return hasInvalid ? { ...b, lines: cleanLines } : b;
        });
    } catch (e) {}
    return [];
  });
  const [isCloudBillsLoading, setIsCloudBillsLoading] = useState<boolean>(true);
  const isCloudAuthoritativeHydratedRef = useRef<boolean>(false);

  // Restore stored bills and conveyances from IndexedDB failover storage on startup
  useEffect(() => {
    const isIdbAuthoritative = localStorage.getItem('polycables_stored_bills__idb_only') === '1';
    const hasLocalBills = localStorage.getItem('polycables_stored_bills') !== null;
    idbGetFailoverData('polycables_stored_bills').then((cachedBills) => {
      if (isCloudAuthoritativeHydratedRef.current) return;
      if (!cachedBills || !Array.isArray(cachedBills) || cachedBills.length === 0) return;
      const validCached = cachedBills.filter((b: any) => b && b.id && !isGloballyDeletedId(b.id));
      if (validCached.length === 0) return;

      const parseBillTs = (obj: any): number => {
        if (!obj || typeof obj !== 'object') return 0;
        const raw = obj.updatedAt ?? obj.header?.updatedAt ?? obj.savedAt;
        if (!raw) return 0;
        if (typeof raw === 'number') return isFinite(raw) ? raw : 0;
        const ms = Date.parse(String(raw));
        return isNaN(ms) ? 0 : ms;
      };

      setStoredBills((prev) => {
        if (isIdbAuthoritative || !hasLocalBills || prev.length === 0) {
          const mergedMap = new Map<string, any>();
          validCached.forEach((b: any) => mergedMap.set(b.id, b));
          prev.forEach((b: any) => {
            if (!b || !b.id || isGloballyDeletedId(b.id)) return;
            const cached = mergedMap.get(b.id);
            if (!cached) {
              mergedMap.set(b.id, b);
            } else {
              const pTs = parseBillTs(b);
              const cTs = parseBillTs(cached);
              if (pTs > cTs) {
                const rc = b.receivedCopy || b.header?.receivedCopy || cached.receivedCopy || cached.header?.receivedCopy;
                mergedMap.set(b.id, {
                  ...cached,
                  ...b,
                  ...(rc ? { receivedCopy: rc, header: { ...b.header, receivedCopy: rc } } : {})
                });
              }
            }
          });
          const next = deduplicateBills(Array.from(mergedMap.values()));
          if (
            next.length === prev.length &&
            next.every((n, idx) => n.id === prev[idx]?.id && parseBillTs(n) === parseBillTs(prev[idx]))
          ) {
            return prev;
          }
          storedBillsRef.current = next;
          return next;
        } else {
          const cachedMap = new Map<string, any>();
          validCached.forEach((b: any) => {
            if (b?.id) cachedMap.set(b.id, b);
          });
          let changed = false;
          const prevMap = new Map<string, any>();
          const updated = prev.map((b) => {
            if (!b || !b.id) return b;
            prevMap.set(b.id, b);
            const match = cachedMap.get(b.id);
            if (!match) return b;
            const cTs = parseBillTs(match);
            const pTs = parseBillTs(b);
            if (cTs > pTs) {
              changed = true;
              const rc = match.receivedCopy || match.header?.receivedCopy || b.receivedCopy || b.header?.receivedCopy;
              return {
                ...b,
                ...match,
                ...(rc ? { receivedCopy: rc, header: { ...match.header, receivedCopy: rc } } : {})
              };
            }
            if (!b.receivedCopy && !b.header?.receivedCopy) {
              const rc = match.receivedCopy || match.header?.receivedCopy;
              if (rc) {
                changed = true;
                return {
                  ...b,
                  receivedCopy: rc,
                  receivedCopyName: b.receivedCopyName || match.receivedCopyName || match.header?.receivedCopyName,
                  receivedCopyDate: b.receivedCopyDate || match.receivedCopyDate || match.header?.receivedCopyDate,
                  header: {
                    ...b.header,
                    receivedCopy: rc,
                    receivedCopyName: b.header?.receivedCopyName || match.receivedCopyName || match.header?.receivedCopyName,
                    receivedCopyDate: b.header?.receivedCopyDate || match.receivedCopyDate || match.header?.receivedCopyDate
                  }
                };
              }
            }
            return b;
          });
          validCached.forEach((b: any) => {
            if (b?.id && !prevMap.has(b.id)) {
              changed = true;
              updated.push(b);
            }
          });
          if (!changed) return prev;
          const next = deduplicateBills(updated);
          storedBillsRef.current = next;
          return next;
        }
      });
    }).catch(() => {});

    // Also hydrate conveyances, items, and parties from IndexedDB failover storage if needed
    idbGetFailoverData('polycables_conveyances').then((cachedConv) => {
      if (isCloudAuthoritativeHydratedRef.current) return;
      if (Array.isArray(cachedConv) && cachedConv.length > 0) {
        const valid = cachedConv.filter((c: any) => c && c.id && !isGloballyDeletedId(c.id));
        if (valid.length > 0) {
          setConveyances((prev) => (prev.length === 0 ? valid : prev));
        }
      }
    }).catch(() => {});

    const isItemsClearedFlag = localStorage.getItem('polycables_items_cleared') === 'true';
    const isIdbItemsAuthoritative = localStorage.getItem('polycables_items__idb_only') === '1';
    const hasLocalItemsKey = localStorage.getItem('polycables_items') !== null;
    if (isItemsClearedFlag) {
      idbSaveFailoverData('polycables_items', []).catch(() => {});
      idbSaveFailoverData('polycables_special_items', []).catch(() => {});
      idbSaveFailoverData('polycables_permanent_special_items', []).catch(() => {});
    } else {
      idbGetFailoverData('polycables_items').then((cachedItems) => {
        if (isCloudAuthoritativeHydratedRef.current) return;
        if (localStorage.getItem('polycables_items_cleared') === 'true') return;
        if (Array.isArray(cachedItems) && cachedItems.length > 0) {
          const trashedIds = new Set<string>();
          try {
            const st = localStorage.getItem('polycables_trashed_items');
            if (st) {
              const p = JSON.parse(st);
              if (Array.isArray(p)) p.forEach((x: any) => { if (x?.id) trashedIds.add(String(x.id)); if (x?.data?.id) trashedIds.add(String(x.data.id)); });
            }
            const sd = localStorage.getItem('polycables_deleted_item_ids');
            if (sd) {
              const p = JSON.parse(sd);
              if (Array.isArray(p)) p.forEach((id: string) => trashedIds.add(String(id)));
            }
          } catch {}
          const valid = sanitizeAndDeduplicateItems(
            cachedItems.filter((i: any) => i && i.id && !isGloballyDeletedId(i.id) && !trashedIds.has(String(i.id)))
          );
          const reconciledValid = reconcileCatalogItemsWithActiveSnapshot(valid, getPriceListSnapshots()).items;
          if (reconciledValid.length > 0 && (isIdbItemsAuthoritative || !hasLocalItemsKey)) {
            wasItemsLoadedFromStorageRef.current = true;
            isSyncingFromRemote.current = true;
            itemsRef.current = reconciledValid;
            lastSyncedSliceJsonRef.current.items = JSON.stringify(reconciledValid);
            setItems(reconciledValid);
            scheduleUnlockRemoteSync(120);
          } else if (reconciledValid.length > 0) {
            setItems((prev) => (prev.length === 0 ? reconciledValid : prev));
          }
        }
      }).catch(() => {});
    }

    idbGetFailoverData('polycables_parties').then((cachedParties) => {
      if (isCloudAuthoritativeHydratedRef.current) return;
      if (Array.isArray(cachedParties) && cachedParties.length > 0) {
        const valid = cachedParties.filter((p: any) => p && p.id && !isGloballyDeletedId(p.id));
        if (valid.length > 0) {
          setParties((prev) => (prev.length === 0 ? valid : prev));
        }
      }
    }).catch(() => {});
  }, []);

  const [focusedStoredBillId, setFocusedStoredBillId] = useState<string | null>(null);

  // Multi-Tenancy Data Isolation (Sales Center wise scoping)
  // Super Admin (e.g. suvroadmin) & AGM have global access across all Sales Centers.
  // Sales Center marketing personnel only have access to their own Sales Center data.
  // Draft bills are strictly visible to their own Sales Center only.
  const visibleStoredBills = useMemo(() => {
    return filterBillsForUser(storedBills, currentUser, salespersons, branches, parties);
  }, [storedBills, currentUser, salespersons, branches, parties]);

  const visibleCollections = useMemo(() => {
    return filterCollectionsForUser(collections, currentUser, salespersons, branches, parties);
  }, [collections, currentUser, salespersons, branches, parties]);

  const visibleStockReturns = useMemo(() => {
    return filterReturnsForUser(stockReturns, currentUser, salespersons, branches, parties);
  }, [stockReturns, currentUser, salespersons, branches, parties]);

  const visibleExpenses = useMemo(() => {
    return filterExpensesForUser(expenses, currentUser, salespersons, branches);
  }, [expenses, currentUser, salespersons, branches]);

  const visibleRequisitions = useMemo(() => {
    return filterRequisitionsForUser(requisitions, currentUser, salespersons, branches, parties);
  }, [requisitions, currentUser, salespersons, branches, parties]);

  const visibleBankDeposits = useMemo(() => {
    return filterDepositsForUser(effectiveBankDeposits, currentUser, salespersons, branches);
  }, [effectiveBankDeposits, currentUser, salespersons, branches]);

  const visibleParties = useMemo(() => {
    return filterPartiesForUser(parties, currentUser, salespersons, branches);
  }, [parties, currentUser, salespersons, branches]);

  const visibleDeliveryChallans = useMemo(() => {
    return filterChallansForUser(deliveryChallans, currentUser, salespersons, branches, parties);
  }, [deliveryChallans, currentUser, salespersons, branches, parties]);

  const visibleSalespersons = useMemo(() => {
    return filterSalespersonsForUser(salespersons, currentUser, branches);
  }, [salespersons, currentUser, branches]);

  const visibleBranches = useMemo(() => {
    return filterBranchesForUser(branches, currentUser, salespersons);
  }, [branches, currentUser, salespersons]);

  const isShowroomInCharge = useMemo(() => {
    return isInCharge(currentUser, salespersons);
  }, [currentUser, salespersons]);

  // Keep latest refs to prevent sync loops while enabling live multi-device updates
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const partiesRef = useRef(parties);
  partiesRef.current = parties;
  const salespersonsRef = useRef(salespersons);
  salespersonsRef.current = salespersons;
  const factoryImportsRef = useRef(factoryImports);
  factoryImportsRef.current = factoryImports;
  const stockReturnsRef = useRef(stockReturns);
  stockReturnsRef.current = stockReturns;
  const deliveryChallansRef = useRef(deliveryChallans);
  deliveryChallansRef.current = deliveryChallans;
  const colorExchangesRef = useRef(colorExchanges);
  colorExchangesRef.current = colorExchanges;
  const expensesRef = useRef(expenses);
  expensesRef.current = expenses;
  const collectionsRef = useRef(collections);
  collectionsRef.current = collections;
  const bankDepositsRef = useRef(bankDeposits);
  bankDepositsRef.current = bankDeposits;
  const branchesRef = useRef(branches);
  branchesRef.current = branches;
  const requisitionsRef = useRef(requisitions);
  requisitionsRef.current = requisitions;
  const bankListRef = useRef(bankList);
  bankListRef.current = bankList;
  const accountListRef = useRef(accountList);
  accountListRef.current = accountList;
  const closingsRef = useRef(closings);
  closingsRef.current = closings;
  const deletedAutoDepositIdsRef = useRef(deletedAutoDepositIds);
  deletedAutoDepositIdsRef.current = deletedAutoDepositIds;
  const storedBillsRef = useRef(storedBills);
  storedBillsRef.current = storedBills;
  const companyRef = useRef(company);
  companyRef.current = company;

  // Keep active Bill Entry header synced with logged-in user's Sales Center & Sales-Center bill number
  const lastEnforcedSessionUserRef = useRef<string>('');
  const headerBranchResolution = useMemo(() => {
    if (!currentUser || branches.length === 0) return null;
    const allowed = filterBranchesForUser(branches, currentUser, salespersons);
    if (allowed.length === 0) return null;
    const isSuperOrAcc = isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser);
    const isSingleRestricted = !isSuperOrAcc && allowed.length <= 1;
    const userBr = getUserBranch(currentUser, salespersons, allowed.length > 0 ? allowed : branches);
    const userTargetBranch =
      allowed.find((b) => b.id === userBr.branchId) ||
      allowed.find((b) => cleanBranchName(b.name).toLowerCase() === cleanBranchName(userBr.branchName).toLowerCase()) ||
      allowed[0];
    return { allowed, isSuperOrAcc, isSingleRestricted, userTargetBranch };
  }, [currentUser, branches, salespersons]);

  useEffect(() => {
    if (!currentUser || editingBillId || !headerBranchResolution) return;
    const { allowed, isSuperOrAcc, isSingleRestricted, userTargetBranch } = headerBranchResolution;

    const sessionUserKey = `${currentUser.username || ''}::${currentUser.salespersonCode || ''}::${currentUser.branchId || ''}::${currentUser.role || ''}`;
    const userChanged = lastEnforcedSessionUserRef.current !== sessionUserKey;
    if (userChanged) {
      lastEnforcedSessionUserRef.current = sessionUserKey;
    }

    setHeader((prev) => {
      const prevBranchId = prev.branchId || '';
      const isAll = prevBranchId === 'ALL' || prevBranchId.toLowerCase() === 'all';
      const isAllowedBranch = isAll
        ? (isSuperOrAcc || allowed.length > 1)
        : allowed.some((b) => b.id === prevBranchId);

      let resolvedBranch: BranchLocation | null | undefined = null;
      let shouldUpdateBranch = false;

      if (isSingleRestricted && userTargetBranch) {
        if (prevBranchId !== userTargetBranch.id) {
          resolvedBranch = userTargetBranch;
          shouldUpdateBranch = true;
        }
      } else if (!isAllowedBranch && userTargetBranch) {
        resolvedBranch = userTargetBranch;
        shouldUpdateBranch = true;
      } else if (userChanged && currentUser.branchId && currentUser.branchId.toLowerCase() !== 'all' && userTargetBranch) {
        if (prevBranchId !== userTargetBranch.id) {
          resolvedBranch = userTargetBranch;
          shouldUpdateBranch = true;
        }
      }

      if (!shouldUpdateBranch || !resolvedBranch) return prev;

      const isOffice = Boolean(prev.isOfficeBill);
      const nextNo = computeBranchRunningBillNo(storedBillsRef.current, resolvedBranch, isOffice);
      return {
        ...prev,
        branchId: resolvedBranch.id,
        branchName: resolvedBranch.name,
        billNo: !hasSavedCurrentBill ? nextNo : prev.billNo
      };
    });
  }, [currentUser, editingBillId, hasSavedCurrentBill, headerBranchResolution]);

  // Per-slice JSON tracking & timestamps for 100% deterministic, race-free multi-device sync
  const clientSyncIdRef = useRef<string>(`client-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`);
  if (typeof window !== 'undefined') {
    (window as any).__polycablesClientSyncId = clientSyncIdRef.current;
  }
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const localSliceModifiedAtRef = useRef<Record<string, number>>({});
  const recentlyCreatedLocalIdsRef = useRef<Map<string, number>>(new Map());
  const initialPersistSkippedRef = useRef<Set<string>>(new Set());
  const lastSyncedSliceInitRef = useRef(false);
  const lastSyncedSliceJsonRef = useRef<Record<string, string>>({});
  if (!lastSyncedSliceInitRef.current) {
    lastSyncedSliceInitRef.current = true;
    lastSyncedSliceJsonRef.current = {
      items: JSON.stringify(items),
      parties: JSON.stringify(parties),
      salespersons: JSON.stringify(salespersons),
      factoryImports: JSON.stringify(factoryImports),
      stockReturns: JSON.stringify(stockReturns),
      deliveryChallans: JSON.stringify(deliveryChallans),
      colorExchanges: JSON.stringify(colorExchanges),
      expenses: JSON.stringify(expenses),
      conveyances: JSON.stringify(conveyances),
      collections: JSON.stringify(collections),
      bankDeposits: JSON.stringify(bankDeposits),
      branches: JSON.stringify(branches),
      requisitions: JSON.stringify(requisitions),
      bankList: JSON.stringify(bankList),
      accountList: JSON.stringify(accountList),
      closings: JSON.stringify(closings),
      deletedAutoDeposits: JSON.stringify(deletedAutoDepositIds),
      storedBills: JSON.stringify(storedBills),
      company: JSON.stringify(company)
    };
  }

  // Persist directories to LocalStorage, Server Sync Hub (/api/sync), and Firebase Firestore Online Cloud Database
  const isRemoteSyncDone = useRef(false);
  const isSyncingFromRemote = useRef(false);
  const remoteSyncUnlockTimerRef = useRef<any>(null);
  const scheduleUnlockRemoteSync = (delayMs: number = 220) => {
    if (remoteSyncUnlockTimerRef.current) {
      clearTimeout(remoteSyncUnlockTimerRef.current);
    }
    remoteSyncUnlockTimerRef.current = setTimeout(() => {
      remoteSyncUnlockTimerRef.current = null;
      isSyncingFromRemote.current = false;
    }, delayMs);
  };
  const isRestoringFirestoreRef = useRef(false);
  const firestoreRestoreSucceededRef = useRef(true);
  const wasItemsLoadedFromStorageRef = useRef<boolean>(Boolean(typeof window !== 'undefined' && localStorage.getItem('polycables_items') !== null));
  const localItemsVersionRef = useRef<number>(
    typeof window !== 'undefined' ? (Number(localStorage.getItem('polycables_items_version') || 0) || 0) : 0
  );
  const lastFetchedSliceVersionsRef = useRef<Record<string, number>>({});
  const knownSliceVersionsRef = useRef<Record<string, number>>({});
  const knownAppDocIsSlicedRef = useRef(false);
  const knownSliceKeysRef = useRef<string[]>([
    'items', 'specialItems', 'parties', 'salespersons', 'storedBills',
    'factoryImports', 'stockReturns', 'deliveryChallans', 'colorExchanges',
    'expenses', 'conveyances', 'collections', 'bankDeposits', 'branches',
    'requisitions', 'closings', 'company', 'header', 'bankList', 'accountList',
    'orderedCategories', 'customCategories', 'deletedCategories', 'deletedAutoDeposits', 'priceSnapshots'
  ]);
  const quotaExhaustedRef = useRef(isFirestoreQuotaExhausted());
  const FIRESTORE_SYNC_DEBOUNCE_MS = 1500;
  const syncTimeoutRef = useRef<any>(null);
  const pendingCloudDataRef = useRef<Record<string, any>>({});
  const firestoreSyncTimeoutRef = useRef<any>(null);
  const pendingFirestoreDataRef = useRef<Record<string, any>>({});
  const pendingFirestoreBillUpsertsRef = useRef<Map<string, StoredBill>>(new Map());
  const pendingFirestoreBillDeletesRef = useRef<Set<string>>(new Set());
  const lastFirestoreSliceJsonRef = useRef<Record<string, string>>({});
  const lastFirestoreDeletedIdsJsonRef = useRef<string>('');
  const lastFirestorePullAtRef = useRef<number>(0);
  const lastServerVersionRef = useRef<number>(0);
  const noteServerVersion = useCallback((ver: any) => {
    const n = Number(ver || 0);
    if (isFinite(n) && n > lastServerVersionRef.current) {
      lastServerVersionRef.current = n;
    }
  }, []);
  const hasHydratedStoreRef = useRef<boolean>(false);

  // Strictly in-memory retry queues (zero localStorage / IndexedDB failover persistence)
  type FirestoreRetryQueueState = {
    patch: Record<string, any>;
    deletedBillIds: string[];
    updatedBillIds: string[];
    queuedAt: number;
  };
  const firestoreRetryQueueRef = useRef<FirestoreRetryQueueState>({
    patch: {},
    deletedBillIds: [],
    updatedBillIds: [],
    queuedAt: 0
  });
  const isFlushingRetryQueueRef = useRef(false);

  const enqueueFirestoreFallbackSync = useCallback(
    (
      patch?: Record<string, any>,
      extra?: { deletedBillIds?: string[]; updatedBillIds?: string[] }
    ) => {
      const cur = firestoreRetryQueueRef.current;
      const nextPatch = patch ? { ...cur.patch, ...patch } : { ...cur.patch };
      const nextDeleted = new Set(cur.deletedBillIds);
      const nextUpdated = new Set(cur.updatedBillIds);

      if (patch?._forceClear) {
        nextUpdated.clear();
        nextDeleted.clear();
      }
      if (Array.isArray(extra?.updatedBillIds)) {
        for (const bid of extra.updatedBillIds) {
          if (!bid) continue;
          nextDeleted.delete(bid);
          nextUpdated.add(bid);
        }
      }
      if (Array.isArray(extra?.deletedBillIds)) {
        for (const bid of extra.deletedBillIds) {
          if (!bid) continue;
          nextUpdated.delete(bid);
          nextDeleted.add(bid);
        }
      }

      firestoreRetryQueueRef.current = {
        patch: nextPatch,
        deletedBillIds: Array.from(nextDeleted),
        updatedBillIds: Array.from(nextUpdated),
        queuedAt: Date.now()
      };
    },
    []
  );

  const clearFirestoreRetryQueue = useCallback(() => {
    firestoreRetryQueueRef.current = {
      patch: {},
      deletedBillIds: [],
      updatedBillIds: [],
      queuedAt: 0
    };
  }, []);

  // Active cloud sync tier tracker & strictly in-memory /api/sync retry queue (zero localStorage fallback)
  const activeCloudTierRef = useRef<'firebase' | 'secondary_cloud' | 'in_memory'>('firebase');
  const serverSyncRetryQueueRef = useRef<{ patch: Record<string, any>; queuedAt: number }>({
    patch: {},
    queuedAt: 0
  });
  const isFlushingServerRetryRef = useRef(false);

  const enqueueServerSyncRetry = useCallback(
    (patch?: Record<string, any>) => {
      if (!patch || Object.keys(patch).length === 0) return;
      const cur = serverSyncRetryQueueRef.current;
      const nextPatch = patch._forceClear ? { ...patch } : { ...cur.patch, ...patch };
      serverSyncRetryQueueRef.current = { patch: nextPatch, queuedAt: Date.now() };
    },
    []
  );

  const clearServerSyncRetryQueue = useCallback(() => {
    serverSyncRetryQueueRef.current = { patch: {}, queuedAt: 0 };
  }, []);

  const flushServerSyncRetryQueue = useCallback(async (): Promise<boolean> => {
    if (isFlushingServerRetryRef.current) return false;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
    const q = serverSyncRetryQueueRef.current;
    if (!q.patch || Object.keys(q.patch).length === 0) return true;

    isFlushingServerRetryRef.current = true;
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientSyncIdRef.current,
          patch: q.patch
        })
      });
      if (!res.ok) return false;
      try {
        const resJson = await res.json();
        if (resJson?.version) noteServerVersion(resJson.version);
      } catch {}
      if (serverSyncRetryQueueRef.current.queuedAt <= q.queuedAt) {
        clearServerSyncRetryQueue();
      }
      return true;
    } catch {
      return false;
    } finally {
      isFlushingServerRetryRef.current = false;
    }
  }, [clearServerSyncRetryQueue, noteServerVersion]);

  const buildSecondaryFallbackPatch = useCallback(
    (rawPatch: Record<string, any>, billUpsertsList: StoredBill[], billDeletesList: string[]): Record<string, any> => {
      const merged: Record<string, any> = { ...(rawPatch || {}) };
      if ((billUpsertsList.length > 0 || billDeletesList.length > 0) && !Array.isArray(merged.storedBills)) {
        merged.storedBills = storedBillsRef.current;
      }
      return merged;
    },
    []
  );

  useEffect(() => {
    // Purge any legacy browser localStorage/IndexedDB failover or queue entries so sync stays 100% cloud-only
    try {
      localStorage.removeItem('polycables_failover_cloud_storage');
      localStorage.removeItem('polycables_firestore_retry_queue');
      localStorage.removeItem('polycables_server_sync_retry_queue');
      localStorage.removeItem('polycables_supabase_failover_data');
      localStorage.removeItem('polycables_supabase_retry_queue');
    } catch {}
    idbSaveFailoverData('polycables_firestore_retry_queue', null).catch(() => {});
    idbSaveFailoverData('polycables_server_sync_retry_queue', null).catch(() => {});

    const handleQuotaExhausted = () => {
      quotaExhaustedRef.current = true;
    };
    const handleQuotaRecovered = () => {
      quotaExhaustedRef.current = false;
    };
    window.addEventListener('polycables_firestore_quota_exhausted', handleQuotaExhausted);
    window.addEventListener('polycables_firestore_quota_recovered', handleQuotaRecovered);
    return () => {
      window.removeEventListener('polycables_firestore_quota_exhausted', handleQuotaExhausted);
      window.removeEventListener('polycables_firestore_quota_recovered', handleQuotaRecovered);
    };
  }, []);

  // Helper to keep Firestore store/app_data under the 1 MiB limit by stripping heavy base64 strings and compacting snapshot items
  const prepareFirestoreSafePayload = (payload: Record<string, any>): Record<string, any> => {
    const safePayload: Record<string, any> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (k === 'storedBills' && Array.isArray(v)) {
        safePayload[k] = v.map((b: StoredBill) => {
          const hasHeavyCopy =
            (typeof b.receivedCopy === 'string' && b.receivedCopy.length > 1500) ||
            (typeof b.header?.receivedCopy === 'string' && b.header.receivedCopy.length > 1500);
          if (!hasHeavyCopy) return cleanForFirestore(b);
          const stripped = { ...b };
          if (typeof stripped.receivedCopy === 'string' && stripped.receivedCopy.length > 1500) {
            delete stripped.receivedCopy;
          }
          if (stripped.header && typeof stripped.header.receivedCopy === 'string' && stripped.header.receivedCopy.length > 1500) {
            stripped.header = { ...stripped.header };
            delete stripped.header.receivedCopy;
          }
          return cleanForFirestore(stripped);
        });
      } else if ((k === 'priceSnapshots' || k === 'price_snapshots') && Array.isArray(v)) {
        const compacted = v.map((snap: any) => {
          if (!snap || typeof snap !== 'object') return snap;
          return {
            ...snap,
            items: Array.isArray(snap.items)
              ? snap.items.map((it: any) => ({
                  id: it.id,
                  code: it.code,
                  name: it.name,
                  category: it.category,
                  unit: it.unit,
                  rate: it.rate,
                  ...(it.sizeSpec ? { sizeSpec: it.sizeSpec } : {}),
                  ...(it.serial !== undefined ? { serial: it.serial } : {})
                }))
              : []
          };
        });
        safePayload['priceSnapshots'] = cleanForFirestore(compacted);
      } else {
        safePayload[k] = cleanForFirestore(v);
      }
    }
    return safePayload;
  };

  // Shared slice-aware Firestore writer: writes ONLY modified slice_<key> docs and individual stored_bills/<id> docs
  const commitFirestorePatchToCloud = useCallback(
    async (
      rawPatch: Record<string, any>,
      billUpsertsList: StoredBill[] = [],
      billDeletesList: string[] = [],
      options?: { fromRetryQueue?: boolean }
    ): Promise<boolean> => {
      const hasPatchKeys = rawPatch && Object.keys(rawPatch).length > 0;
      const hasBillOps = billUpsertsList.length > 0 || billDeletesList.length > 0;
      if (!hasPatchKeys && !hasBillOps) return true;

      if (quotaExhaustedRef.current || isFirestoreInFallbackCooldown()) {
        if (isFirestoreQuotaExhausted()) {
          quotaExhaustedRef.current = true;
        }
        if (!options?.fromRetryQueue) {
          enqueueFirestoreFallbackSync(hasPatchKeys ? rawPatch : undefined, {
            updatedBillIds: billUpsertsList.map((b) => b.id).filter(Boolean),
            deletedBillIds: billDeletesList.filter(Boolean)
          });
        }
        // Strict Cloud-Only Priority Failover:
        // Node #1 Madhupur Firebase -> Node #2 Firebase Mirror -> Node #3 Supabase -> B2 -> R2 -> GCS -> S3 -> Appwrite -> Neon -> Server Hub (/api/sync).
        // If all remote cloud nodes are unreachable, failoverPushToCloudNodes queues strictly in-memory (zero localStorage/IDB).
        const secondaryPatch = buildSecondaryFallbackPatch(rawPatch, billUpsertsList, billDeletesList);
        const failoverRes = await failoverPushToCloudNodes(secondaryPatch, {
          clientId: clientSyncIdRef.current
        });
        if (failoverRes.ok && failoverRes.node) {
          activeCloudTierRef.current = 'secondary_cloud';
          saveCloudFailoverConfig({
            primaryCloudStatus: quotaExhaustedRef.current ? 'quota_exhausted' : 'error',
            secondaryCloudStatus: 'active',
            failoverProvider: failoverRes.node.provider,
            failoverEmail: failoverRes.node.accountEmail,
            lastSyncTimestamp: new Date().toISOString()
          });
        } else {
          activeCloudTierRef.current = 'in_memory';
        }
        if (rawPatch?._isRestore) {
          firestoreRestoreSucceededRef.current = true;
          isRestoringFirestoreRef.current = false;
        }
        return false;
      }

      const nowVersion = Date.now();
      const nowIsoStr = new Date(nowVersion).toISOString();
      const firestorePayload = hasPatchKeys ? prepareFirestoreSafePayload(rawPatch) : {};

      // A. Restore bulk stored_bills batch (only during full backup restore)
      const hasAsyncBillBatch = Boolean(rawPatch._isRestore && Array.isArray(rawPatch.storedBills));
      if (hasAsyncBillBatch) {
        const targetBills: StoredBill[] = rawPatch.storedBills.filter((b: any) => b && b.id);
        const targetBillIdSet = new Set(targetBills.map((b) => String(b.id)));
        const shouldPruneOldBills = Boolean(rawPatch._forceClear || rawPatch._replaceStoredBills);
        isRestoringFirestoreRef.current = true;
        lastRestoreTimestampRef.current = Date.now();

        (async () => {
          try {
            const ops: Array<{ type: 'set' | 'delete'; id: string; data?: any }> = [];
            if (shouldPruneOldBills && !isFirestoreQuotaExhausted()) {
              try {
                const existingSnap = await getDocsFromServer(collection(db, 'stored_bills'));
                existingSnap.docs.forEach((docSnap) => {
                  if (!targetBillIdSet.has(docSnap.id)) {
                    ops.push({ type: 'delete', id: docSnap.id });
                  }
                });
              } catch {}
            }

            for (let i = 0; i < targetBills.length; i++) {
              const bill = targetBills[i];
              const rcLen =
                (typeof bill.receivedCopy === 'string' ? bill.receivedCopy.length : 0) +
                (typeof bill.header?.receivedCopy === 'string' ? bill.header.receivedCopy.length : 0);
              if (rcLen > 650000) {
                const lightBill: any = { ...bill };
                delete lightBill.receivedCopy;
                if (lightBill.header) {
                  lightBill.header = { ...lightBill.header };
                  delete lightBill.header.receivedCopy;
                }
                ops.push({ type: 'set', id: String(bill.id), data: lightBill });
              } else {
                ops.push({ type: 'set', id: String(bill.id), data: bill });
              }
            }

            const BATCH_SIZE = 150;
            for (let offset = 0; offset < ops.length; offset += BATCH_SIZE) {
              if (quotaExhaustedRef.current || isFirestoreQuotaExhausted()) {
                enqueueFirestoreFallbackSync(rawPatch);
                break;
              }
              lastRestoreTimestampRef.current = Date.now();
              const chunk = ops.slice(offset, offset + BATCH_SIZE);
              const batch = writeBatch(db);
              for (const op of chunk) {
                const ref = doc(db, 'stored_bills', op.id);
                if (op.type === 'delete') {
                  batch.delete(ref);
                } else {
                  batch.set(ref, op.data);
                }
              }
              await batch.commit().catch((batchErr) => {
                if (isQuotaRelatedError(batchErr)) {
                  quotaExhaustedRef.current = true;
                  markFirestoreQuotaExhausted(true);
                }
                enqueueFirestoreFallbackSync(rawPatch);
              });
              lastRestoreTimestampRef.current = Date.now();
              if (offset + BATCH_SIZE < ops.length) {
                await new Promise((resolve) => setTimeout(resolve, 25));
              }
            }
          } catch {
            enqueueFirestoreFallbackSync(rawPatch);
          } finally {
            lastRestoreTimestampRef.current = Date.now();
            isRestoringFirestoreRef.current = false;
          }
        })();
      }

      const writeFirestoreSliceWithChunking = async (
        sk: string,
        sVal: any,
        extraFields?: Record<string, any>
      ): Promise<void> => {
        if (Array.isArray(sVal)) {
          const approxBytes = JSON.stringify(sVal).length;
          if (approxBytes > 500000) {
            const chunks: any[][] = [];
            let currentChunk: any[] = [];
            let currentBytes = 2;
            for (const elem of sVal) {
              const elemLen = JSON.stringify(elem).length + 1;
              if (currentChunk.length > 0 && currentBytes + elemLen > 450000) {
                chunks.push(currentChunk);
                currentChunk = [elem];
                currentBytes = 2 + elemLen;
              } else {
                currentChunk.push(elem);
                currentBytes += elemLen;
              }
            }
            if (currentChunk.length > 0) chunks.push(currentChunk);

            await Promise.all([
              ...chunks.map((chunkArr, idx) =>
                setDoc(doc(db, 'store', `slice_${sk}_${idx}`), {
                  key: `${sk}_${idx}`,
                  chunkIndex: idx,
                  value: chunkArr,
                  version: nowVersion,
                  updatedAt: nowIsoStr,
                  _senderId: clientSyncIdRef.current
                })
              ),
              setDoc(doc(db, 'store', `slice_${sk}`), {
                key: sk,
                _chunked: true,
                chunkCount: chunks.length,
                value: [],
                version: nowVersion,
                updatedAt: nowIsoStr,
                _senderId: clientSyncIdRef.current,
                ...(extraFields || {})
              }),
              // Prune any trailing stale chunks from a prior larger chunkCount
              ...[0, 1, 2, 3].map((extraOffset) =>
                deleteDoc(doc(db, 'store', `slice_${sk}_${chunks.length + extraOffset}`)).catch(() => {})
              )
            ]);
            return;
          }
        }
        await Promise.all([
          setDoc(doc(db, 'store', `slice_${sk}`), {
            key: sk,
            _chunked: false,
            chunkCount: 0,
            value: sVal,
            version: nowVersion,
            updatedAt: nowIsoStr,
            _senderId: clientSyncIdRef.current,
            ...(extraFields || {})
          }),
          // Clear any old chunk_0..chunk_2 if a slice shrunk below the chunking threshold
          ...[0, 1, 2].map((oldIdx) =>
            deleteDoc(doc(db, 'store', `slice_${sk}_${oldIdx}`)).catch(() => {})
          )
        ]);
      };

      try {
        const writePromises: Promise<any>[] = [];

        // B. Individual bill upserts & deletes -> write ONLY modified stored_bills/<id> docs (never rewrite app_data or slice_storedBills)
        if (!hasAsyncBillBatch && (billUpsertsList.length > 0 || billDeletesList.length > 0)) {
          const billOps: Array<{ type: 'set' | 'delete'; id: string; data?: any }> = [];
          for (const bill of billUpsertsList) {
            if (!bill || !bill.id) continue;
            const rcLen =
              (typeof bill.receivedCopy === 'string' ? bill.receivedCopy.length : 0) +
              (typeof bill.header?.receivedCopy === 'string' ? bill.header.receivedCopy.length : 0);
            let safeBill: any = cleanForFirestore(bill);
            if (rcLen > 650000) {
              safeBill = { ...safeBill };
              delete safeBill.receivedCopy;
              if (safeBill.header) {
                safeBill.header = { ...safeBill.header };
                delete safeBill.header.receivedCopy;
              }
            }
            billOps.push({ type: 'set', id: String(bill.id), data: safeBill });
          }
          for (const delId of billDeletesList) {
            if (!delId) continue;
            billOps.push({ type: 'delete', id: String(delId) });
          }
          const BILL_BATCH_SIZE = 150;
          for (let i = 0; i < billOps.length; i += BILL_BATCH_SIZE) {
            const chunk = billOps.slice(i, i + BILL_BATCH_SIZE);
            const batch = writeBatch(db);
            for (const op of chunk) {
              const ref = doc(db, 'stored_bills', op.id);
              if (op.type === 'delete') {
                batch.delete(ref);
              } else {
                batch.set(ref, op.data, { merge: true });
              }
            }
            writePromises.push(batch.commit());
          }
        }

        // C. Modified slices -> ALWAYS write into chunk-safe store/slice_<sk> documents and keep store/app_data as lightweight index (<10KB, never exceeds Firestore 1 MiB limit)
        {
          const skipStoredBillsSlice = !rawPatch._forceClear && !rawPatch._isRestore && rawPatch._skipFirestoreSlice === 'storedBills';
          const updatedSliceKeys = Object.keys(firestorePayload).filter(
            (k) =>
              !k.startsWith('_') &&
              k !== 'restoredEntityIds' &&
              k !== 'deletedEntityIds' &&
              k !== 'activeEffectiveDate' &&
              k !== 'itemsVersion' &&
              !(skipStoredBillsSlice && k === 'storedBills')
          );

          const effectiveItemsCleared =
            typeof firestorePayload._itemsCleared === 'boolean'
              ? firestorePayload._itemsCleared
              : localStorage.getItem('polycables_items_cleared') === 'true';
          const effectiveItemsVer = Number(firestorePayload.itemsVersion || localItemsVersionRef.current || 0);

          if (rawPatch._forceClear) {
            knownAppDocIsSlicedRef.current = true;
            knownSliceVersionsRef.current = {};
            lastFirestoreSliceJsonRef.current = {};
            lastFirestoreDeletedIdsJsonRef.current = '[]';
          }

          const actuallyWrittenSlices: string[] = [];
          for (const sk of updatedSliceKeys) {
            const sVal = firestorePayload[sk];
            let sJson = '';
            try {
              sJson = JSON.stringify(sVal);
            } catch {}

            // Skip writing if identical to what Firestore already has (unless restore / forceClear)
            if (!rawPatch._isRestore && !rawPatch._forceClear && sJson && lastFirestoreSliceJsonRef.current[sk] === sJson) {
              continue;
            }

            const extraMeta: Record<string, any> = {};
            if (sk === 'items') {
              extraMeta._itemsCleared = effectiveItemsCleared;
              if (effectiveItemsVer > 0) extraMeta.itemsVersion = effectiveItemsVer;
            } else if (sk === 'priceSnapshots' && typeof firestorePayload.activeEffectiveDate === 'string') {
              extraMeta.activeEffectiveDate = firestorePayload.activeEffectiveDate;
            }

            if (sJson) {
              lastFirestoreSliceJsonRef.current[sk] = sJson;
            }
            knownSliceKeysRef.current = Array.from(new Set([...knownSliceKeysRef.current, sk]));
            knownSliceVersionsRef.current[sk] = nowVersion;
            lastFetchedSliceVersionsRef.current[sk] = nowVersion;
            actuallyWrittenSlices.push(sk);
            writePromises.push(writeFirestoreSliceWithChunking(sk, sVal, extraMeta));
          }

          // Persist deletedEntityIds to its own dedicated slice ONLY when it changes or during clear/restore
          if (rawPatch._forceClear || Array.isArray(firestorePayload.deletedEntityIds)) {
            const delIdsToWrite = rawPatch._forceClear ? [] : (firestorePayload.deletedEntityIds || []);
            const delJson = JSON.stringify(delIdsToWrite);
            if (
              rawPatch._forceClear ||
              (delJson !== lastFirestoreDeletedIdsJsonRef.current &&
                (delIdsToWrite.length > 0 || rawPatch._isDeleteOperation || rawPatch._isRestore))
            ) {
              lastFirestoreDeletedIdsJsonRef.current = delJson;
              writePromises.push(
                writeFirestoreSliceWithChunking('deletedEntityIds', delIdsToWrite)
              );
            }
          }

          // Write lightweight store/app_data index ONLY (never inline full collections into app_data so it never hits the 1 MiB Firestore document cap)
          if (rawPatch._isRestore || rawPatch._forceClear) {
            knownAppDocIsSlicedRef.current = true;
            writePromises.push(
              setDoc(
                doc(db, 'store', 'app_data'),
                {
                  _sliced: true,
                  _syncProtocolVersion: 2,
                  _senderId: clientSyncIdRef.current,
                  _itemsCleared: effectiveItemsCleared,
                  ...(effectiveItemsVer > 0 ? { itemsVersion: effectiveItemsVer } : {}),
                  ...(typeof firestorePayload.activeEffectiveDate === 'string'
                    ? { activeEffectiveDate: firestorePayload.activeEffectiveDate }
                    : {}),
                  _updatedAt: nowIsoStr,
                  sliceKeys: knownSliceKeysRef.current,
                  sliceVersions: knownSliceVersionsRef.current,
                  deletedEntityIds: rawPatch._forceClear
                    ? []
                    : Array.isArray(firestorePayload.deletedEntityIds)
                      ? firestorePayload.deletedEntityIds
                      : []
                }
              )
            );
          }

          if (writePromises.length === 0 && actuallyWrittenSlices.length === 0 && !hasBillOps) {
            return true;
          }
        }

        if (writePromises.length > 0) {
          await Promise.all(writePromises);
        }

        if (rawPatch._isRestore) {
          firestoreRestoreSucceededRef.current = true;
          lastRestoreTimestampRef.current = Date.now();
          if (!hasAsyncBillBatch) {
            isRestoringFirestoreRef.current = false;
          }
        }
        activeCloudTierRef.current = 'firebase';
        markFirestoreUnavailable(false);
        reportCloudSyncSuccess('Synced with Cloud Firestore');
        saveCloudFailoverConfig({
          primaryCloudStatus: 'online',
          secondaryCloudStatus: 'standby',
          lastSyncTimestamp: nowIsoStr,
          lastSyncItemCount: Object.keys(rawPatch).length + billUpsertsList.length + billDeletesList.length
        });
        return true;
      } catch (err: any) {
        if (isQuotaRelatedError(err)) {
          quotaExhaustedRef.current = true;
          markFirestoreQuotaExhausted(true);
        } else if (!isFirestorePayloadSizeError(err)) {
          markFirestoreUnavailable(true);
        }
        if (rawPatch._isRestore) {
          firestoreRestoreSucceededRef.current = true;
          if (!hasAsyncBillBatch) {
            isRestoringFirestoreRef.current = false;
          }
        }
        if (!options?.fromRetryQueue) {
          enqueueFirestoreFallbackSync(hasPatchKeys ? rawPatch : undefined, {
            updatedBillIds: billUpsertsList.map((b) => b.id).filter(Boolean),
            deletedBillIds: billDeletesList.filter(Boolean)
          });
        }
        // Strict Cloud-Only Priority Failover:
        // Node #1 Madhupur Firebase -> Node #2 Firebase Mirror -> Node #3 Supabase -> B2 -> R2 -> GCS -> S3 -> Appwrite -> Neon -> Server Hub (/api/sync).
        const secondaryPatch = buildSecondaryFallbackPatch(rawPatch, billUpsertsList, billDeletesList);
        const failoverRes = await failoverPushToCloudNodes(secondaryPatch, {
          clientId: clientSyncIdRef.current
        });
        if (failoverRes.ok && failoverRes.node) {
          activeCloudTierRef.current = 'secondary_cloud';
          saveCloudFailoverConfig({
            primaryCloudStatus: quotaExhaustedRef.current ? 'quota_exhausted' : 'error',
            secondaryCloudStatus: 'active',
            failoverProvider: failoverRes.node.provider,
            failoverEmail: failoverRes.node.accountEmail,
            lastSyncTimestamp: new Date().toISOString()
          });
        } else {
          activeCloudTierRef.current = 'in_memory';
        }
        return false;
      }
    },
    [enqueueFirestoreFallbackSync, buildSecondaryFallbackPatch]
  );

  // Instant sync to Server Hub (/api/sync + SSE), BroadcastChannel & immediate micro-batched Slice-Only Firestore writes
  const scheduleCloudSync = (
    dataSlice: Record<string, any>,
    immediate: boolean = true,
    options?: { rollback?: () => void; onError?: (err: any) => void; onSuccess?: () => void }
  ) => {
    if (!dataSlice || Object.keys(dataSlice).length === 0) return;

    if (!dataSlice._isRestore && !isOnline()) {
      triggerOfflineWarning('No internet connection. Changes cannot be saved to the cloud');
      options?.onError?.(new Error('No internet connection. Changes cannot be saved to the cloud'));
      return;
    }

    const now = Date.now();
    if (dataSlice._isRestore) {
      lastRestoreTimestampRef.current = now;
      try {
        localStorage.setItem('polycables_last_restore_time', String(now));
      } catch {}
    }
    for (const [k, v] of Object.entries(dataSlice)) {
      if (k.startsWith('_')) continue;
      localSliceModifiedAtRef.current[k] = now;
      try {
        lastSyncedSliceJsonRef.current[k] = JSON.stringify(v);
      } catch {}
      if (Array.isArray(v)) {
        for (const itm of v) {
          if (itm && typeof itm === 'object' && itm.id) {
            recentlyCreatedLocalIdsRef.current.set(String(itm.id), now);
          }
        }
      }
    }

    // Separate bill-level metadata flags from payload sent to BroadcastChannel / /api/sync
    const {
      _billUpserts,
      _billDeletes,
      _skipFirestoreSlice,
      ...cleanDataSlice
    } = dataSlice;

    const enrichedSlice = {
      ...cleanDataSlice,
      ...((Array.isArray(cleanDataSlice.deletedEntityIds) && cleanDataSlice.deletedEntityIds.length > 0) ||
          cleanDataSlice._replaceStoredBills ||
          cleanDataSlice._forceEmpty
        ? { _isDeleteOperation: true }
        : {})
    };

    // 1. Instant cross-tab broadcast via BroadcastChannel
    try {
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({
          type: 'sync_update',
          senderId: clientSyncIdRef.current,
          patch: enrichedSlice
        });
      }
    } catch {}

    // Merge slice into pending /api/sync buffer (fast 80ms flush)
    pendingCloudDataRef.current = { ...pendingCloudDataRef.current, ...enrichedSlice };

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }

    const resolveDeletedIds = (target: Record<string, any>) => {
      if (target._isRestore || target._forceClear) {
        target.deletedEntityIds = [];
      } else {
        let globalDeleted = getGlobalDeletedIds();
        if (Array.isArray(target.restoredEntityIds) && target.restoredEntityIds.length > 0) {
          const restoreSet = new Set(target.restoredEntityIds.map((x: any) => String(x).toLowerCase().trim()));
          globalDeleted = globalDeleted.filter((id) => !restoreSet.has(String(id).toLowerCase().trim()));
        }
        target.deletedEntityIds = globalDeleted.filter(
          (id) => id && String(id).trim() !== '1' && !/^\d{1,5}$/.test(String(id).trim())
        );
      }
    };

    const flushToServerHub = async () => {
      const dataToSync = { ...pendingCloudDataRef.current };
      if (Object.keys(dataToSync).length === 0) {
        return;
      }
      pendingCloudDataRef.current = {};

      if (dataToSync.items !== undefined && !dataToSync.itemsVersion) {
        const stampedVer = Math.max(Date.now(), (localItemsVersionRef.current || 0) + 1);
        localItemsVersionRef.current = stampedVer;
        dataToSync.itemsVersion = stampedVer;
        try {
          localStorage.setItem('polycables_items_version', String(stampedVer));
        } catch {}
      }

      resolveDeletedIds(dataToSync);

      // 2. Sync immediately to Backend Real-Time Sync Hub (/api/sync -> atomic disk state + SSE broadcast)
      //    If /api/sync fails or is unreachable, queue patch durably in Tier-3 retry queue + local IndexedDB/localStorage.
      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientSyncIdRef.current,
          patch: dataToSync
        })
      })
        .then(async (res) => {
          if (!res.ok) {
            throw new Error(`Sync server responded with ${res.status}`);
          }
          try {
            const resJson = await res.json();
            if (resJson?.version) {
              noteServerVersion(resJson.version);
            }
          } catch {}
          flushServerSyncRetryQueue();
          options?.onSuccess?.();
        })
        .catch((err) => {
          enqueueServerSyncRetry(dataToSync);
          console.warn('[Instant Cloud Sync Note]: Server hub temporarily unreachable, buffered in-memory:', err);
          options?.onError?.(err);
        });

      if (dataToSync._isRestore) {
        for (const [k, v] of Object.entries(dataToSync)) {
          if (k.startsWith('_') || k === 'restoredEntityIds' || k === 'deletedEntityIds') continue;
          try {
            lastSyncedSliceJsonRef.current[k] = JSON.stringify(v);
          } catch {}
        }
      }
    };

    // 4. Accumulate modified slices / bill documents for Debounced Firestore Sync (7s batching)
    if (Array.isArray(_billUpserts)) {
      for (const bill of _billUpserts) {
        if (bill && bill.id) {
          pendingFirestoreBillDeletesRef.current.delete(String(bill.id));
          pendingFirestoreBillUpsertsRef.current.set(String(bill.id), bill);
        }
      }
    }
    if (Array.isArray(_billDeletes)) {
      for (const bid of _billDeletes) {
        if (bid) {
          pendingFirestoreBillUpsertsRef.current.delete(String(bid));
          pendingFirestoreBillDeletesRef.current.add(String(bid));
        }
      }
    }

    const nextFsPatch: Record<string, any> = { ...pendingFirestoreDataRef.current };
    for (const [k, v] of Object.entries(enrichedSlice)) {
      if (_skipFirestoreSlice === k) continue;
      nextFsPatch[k] = v;
    }
    if (_skipFirestoreSlice === 'storedBills' && !('storedBills' in nextFsPatch)) {
      nextFsPatch._skipFirestoreSlice = 'storedBills';
    } else if (!_skipFirestoreSlice && 'storedBills' in enrichedSlice) {
      delete nextFsPatch._skipFirestoreSlice;
    }
    pendingFirestoreDataRef.current = nextFsPatch;

    if (firestoreSyncTimeoutRef.current) {
      clearTimeout(firestoreSyncTimeoutRef.current);
      firestoreSyncTimeoutRef.current = null;
    }

    const flushFirestoreDebounced = async () => {
      const fsPatch = { ...pendingFirestoreDataRef.current };
      const fsBillUpserts = Array.from(pendingFirestoreBillUpsertsRef.current.values());
      const fsBillDeletes = Array.from(pendingFirestoreBillDeletesRef.current);
      pendingFirestoreDataRef.current = {};
      pendingFirestoreBillUpsertsRef.current.clear();
      pendingFirestoreBillDeletesRef.current.clear();

      if (Object.keys(fsPatch).length === 0 && fsBillUpserts.length === 0 && fsBillDeletes.length === 0) {
        return;
      }

      if (fsPatch.items !== undefined && !fsPatch.itemsVersion) {
        fsPatch.itemsVersion = localItemsVersionRef.current || Date.now();
      }
      resolveDeletedIds(fsPatch);
      await commitFirestorePatchToCloud(fsPatch, fsBillUpserts, fsBillDeletes);
    };

    // Immediate push to /api/sync & SSE for committed actions (0ms), with 150ms coalesced micro-batch for Firestore slice writes
    if (
      immediate ||
      cleanDataSlice._isRestore ||
      cleanDataSlice._forceClear ||
      cleanDataSlice._isDeleteOperation ||
      cleanDataSlice._forceEmpty ||
      cleanDataSlice._replacePriceSnapshots
    ) {
      flushToServerHub();
    } else {
      syncTimeoutRef.current = setTimeout(() => {
        syncTimeoutRef.current = null;
        flushToServerHub();
      }, 150);
    }

    const firestoreDelayMs =
      cleanDataSlice._isRestore || cleanDataSlice._forceClear
        ? 100
        : immediate ||
            cleanDataSlice._isDeleteOperation ||
            cleanDataSlice._forceEmpty ||
            cleanDataSlice._replacePriceSnapshots
          ? 150
          : FIRESTORE_SYNC_DEBOUNCE_MS;

    firestoreSyncTimeoutRef.current = setTimeout(() => {
      firestoreSyncTimeoutRef.current = null;
      flushFirestoreDebounced();
    }, firestoreDelayMs);
  };

  // One-time startup & local storage repair: if any saved item record has a pure cable category label
  // (e.g. "(H.T XLPE Cable) (Copper Tape Screen)") in Item Name, repair/remove it and sync to storage + cloud
  const didRunCategoryItemRepairRef = useRef(false);
  useEffect(() => {
    if (didRunCategoryItemRepairRef.current) return;
    didRunCategoryItemRepairRef.current = true;
    try {
      const savedRaw = localStorage.getItem('polycables_items');
      if (!savedRaw) return;
      const parsed = JSON.parse(savedRaw);
      if (!Array.isArray(parsed) || parsed.length === 0) return;

      const { items: repaired, removedPseudoItemIds, repairedCategories, changed } =
        repairCategoryInItemNameRecords(parsed);
      if (!changed && removedPseudoItemIds.length === 0) return;

      repairedCategories.forEach((cat) => saveCustomCategory(cat));
      if (removedPseudoItemIds.length > 0) {
        removedPseudoItemIds.forEach((id) => recordDeletedEntityId(id));
        try {
          const savedDel = localStorage.getItem('polycables_deleted_item_ids');
          const delArr: string[] = savedDel ? JSON.parse(savedDel) : [];
          const mergedDel = Array.from(new Set([...(Array.isArray(delArr) ? delArr : []), ...removedPseudoItemIds]));
          localStorage.setItem('polycables_deleted_item_ids', JSON.stringify(mergedDel));
        } catch {}
        fetch('/api/sync/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: removedPseudoItemIds })
        }).catch(() => {});
      }

      setItems(repaired);
      safeSetStorageItem('polycables_items', JSON.stringify(repaired), repaired);
      const updatedOrderedCats = getAllCategories();
      let updatedCustomCats: string[] = [];
      let updatedDeletedCats: string[] = [];
      try {
        updatedCustomCats = JSON.parse(localStorage.getItem('polycables_custom_categories') || '[]');
        updatedDeletedCats = JSON.parse(localStorage.getItem('polycables_deleted_categories') || '[]');
      } catch {}
      window.dispatchEvent(new CustomEvent('categories-updated', { detail: updatedOrderedCats }));
      window.dispatchEvent(new CustomEvent('polycables_items_updated', { detail: { items: repaired } }));

      const repairVer = Date.now();
      localItemsVersionRef.current = repairVer;
      try { localStorage.setItem('polycables_items_version', String(repairVer)); } catch {}
      scheduleCloudSync(
        {
          items: repaired,
          specialItems: repaired.filter((it) => it.isSpecialItem),
          _replaceItems: true,
          itemsVersion: repairVer,
          orderedCategories: updatedOrderedCats,
          customCategories: Array.isArray(updatedCustomCats) ? updatedCustomCats : [],
          deletedCategories: Array.isArray(updatedDeletedCats) ? updatedDeletedCats : [],
          ...(removedPseudoItemIds.length > 0 ? { deletedEntityIds: removedPseudoItemIds } : {})
        },
        true
      );
    } catch {}
  }, []);

  // Helper to safely serialize unload payload within browser beacon 64KB constraint
  const serializeSafeUnloadPayload = (data: Record<string, any>, clientId: string): { blob: Blob; jsonStr: string } => {
    let cleanPatch = { ...data };

    // 1. Strip bulky base64 image strings from bills in unload beacon (already persisted locally in IDB & storage)
    if (Array.isArray(cleanPatch.storedBills)) {
      cleanPatch.storedBills = cleanPatch.storedBills.map((b: any) => {
        if (!b || typeof b !== 'object') return b;
        const { receivedCopy: _rc, ...rest } = b;
        let header = b.header;
        if (header && typeof header === 'object' && header.receivedCopy) {
          const { receivedCopy: _hrc, ...restHeader } = header;
          header = restHeader;
        }
        return { ...rest, header };
      });
    }

    let jsonStr = JSON.stringify({ clientId, patch: cleanPatch });
    let blob = new Blob([jsonStr], { type: 'application/json' });

    // 2. If payload exceeds 50KB (approaching browser 64KB limit), progressively trim storedBills array
    if (blob.size > 50000 && Array.isArray(cleanPatch.storedBills)) {
      cleanPatch.storedBills = cleanPatch.storedBills.slice(0, 25);
      jsonStr = JSON.stringify({ clientId, patch: cleanPatch });
      blob = new Blob([jsonStr], { type: 'application/json' });
    }

    // 3. If still above 55KB, send top 10 bills (full dataset is already persisted in LocalStorage & IDB)
    if (blob.size > 55000 && Array.isArray(cleanPatch.storedBills)) {
      cleanPatch.storedBills = cleanPatch.storedBills.slice(0, 10);
      jsonStr = JSON.stringify({ clientId, patch: cleanPatch });
      blob = new Blob([jsonStr], { type: 'application/json' });
    }

    return { blob, jsonStr };
  };

  // Immediate synchronous flush on page refresh / tab close to guarantee no entry is ever lost
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
      if (firestoreSyncTimeoutRef.current) {
        clearTimeout(firestoreSyncTimeoutRef.current);
        firestoreSyncTimeoutRef.current = null;
      }

      // Persist any un-flushed debounced Firestore changes into the retry queue so next load completes them
      const pendingFsPatch = { ...pendingFirestoreDataRef.current };
      const pendingUpsertIds = Array.from(pendingFirestoreBillUpsertsRef.current.keys());
      const pendingDeleteIds = Array.from(pendingFirestoreBillDeletesRef.current);
      if (
        Object.keys(pendingFsPatch).length > 0 ||
        pendingUpsertIds.length > 0 ||
        pendingDeleteIds.length > 0
      ) {
        enqueueFirestoreFallbackSync(
          Object.keys(pendingFsPatch).length > 0 ? pendingFsPatch : undefined,
          {
            updatedBillIds: pendingUpsertIds,
            deletedBillIds: pendingDeleteIds
          }
        );
      }

      const dataToSync = { ...pendingCloudDataRef.current };
      if (Object.keys(dataToSync).length === 0) return;
      pendingCloudDataRef.current = {};

      const { blob, jsonStr } = serializeSafeUnloadPayload(dataToSync, clientSyncIdRef.current);

      let beaconSent = false;
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        try {
          beaconSent = navigator.sendBeacon('/api/sync', blob);
        } catch {
          beaconSent = false;
        }
      }

      // If sendBeacon returns false (e.g. queue exceeded or unsupported), fallback to fetch keepalive
      if (!beaconSent) {
        try {
          fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: jsonStr,
            keepalive: true
          }).catch(() => {});
        } catch {}
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, [enqueueFirestoreFallbackSync]);

  // Helper to safely apply remote slice to state only when remote data differs and wasn't just modified locally
  const applyRemoteDataIfChanged = <T,>(
    remoteVal: T | undefined,
    currentRef: React.MutableRefObject<T>,
    setter: (val: T) => void,
    storageKey?: string,
    sliceKey?: string,
    fromRealtimePeer: boolean = false,
    authoritativeReplace: boolean = false
  ) => {
    if (remoteVal === undefined || remoteVal === null) return;
    if (isRestoringFirestoreRef.current && !fromRealtimePeer) return;
    if (sliceKey && !fromRealtimePeer) {
      if (sliceKey in pendingCloudDataRef.current || sliceKey in pendingFirestoreDataRef.current) return;
      const lastLocalMod = localSliceModifiedAtRef.current[sliceKey] || 0;
      if (Date.now() - lastLocalMod < 2000) return;
    }
    try {
      const allowEmptyItems = sliceKey === 'items' && localStorage.getItem('polycables_items_cleared') === 'true';
      const isPrimitiveArray =
        Array.isArray(remoteVal) &&
        (sliceKey === 'bankList' ||
          sliceKey === 'accountList' ||
          sliceKey === 'deletedAutoDeposits' ||
          remoteVal.some((x: any) => typeof x === 'string' || typeof x === 'number'));

      // Guard: empty remote array or empty object must NEVER wipe active local user data (unless items were explicitly cleared or primitive list intentionally updated by peer)!
      if (Array.isArray(currentRef.current) && currentRef.current.length > 0 && !allowEmptyItems && !(fromRealtimePeer && isPrimitiveArray)) {
        if (!Array.isArray(remoteVal) || remoteVal.length === 0) {
          return;
        }
      } else if (
        currentRef.current &&
        typeof currentRef.current === 'object' &&
        !Array.isArray(currentRef.current) &&
        Object.keys(currentRef.current).length > 0
      ) {
        if (!remoteVal || typeof remoteVal !== 'object' || Object.keys(remoteVal).length === 0) {
          return;
        }
      }

      let finalVal: any = remoteVal;
      const isFreshBootCatalogReplace =
        sliceKey === 'items' &&
        (Boolean((remoteVal as any)?._replace) ||
          (!fromRealtimePeer &&
            !wasItemsLoadedFromStorageRef.current &&
            !localSliceModifiedAtRef.current.items)) &&
        Array.isArray(remoteVal) &&
        remoteVal.length > 0;

      // Primitive string arrays (bankList, accountList, deletedAutoDeposits) must replace directly rather than object ID-merging
      if (
        !isFreshBootCatalogReplace &&
        !isPrimitiveArray &&
        Array.isArray(currentRef.current) &&
        Array.isArray(remoteVal) &&
        currentRef.current.length > 0 &&
        !(allowEmptyItems && remoteVal.length === 0)
      ) {
        const trashedItemIds = new Set<string>();
        if (sliceKey === 'items') {
          try {
            const savedTrashed = localStorage.getItem('polycables_trashed_items');
            if (savedTrashed) {
              const parsed = JSON.parse(savedTrashed);
              if (Array.isArray(parsed)) {
                parsed.forEach((x: any) => {
                  if (x?.id) trashedItemIds.add(String(x.id));
                  if (x?.data?.id) trashedItemIds.add(String(x.data.id));
                });
              }
            }
          } catch {}
          try {
            const savedDel = localStorage.getItem('polycables_deleted_item_ids');
            if (savedDel) {
              const parsed = JSON.parse(savedDel);
              if (Array.isArray(parsed)) {
                parsed.forEach((id: string) => trashedItemIds.add(String(id)));
              }
            }
          } catch {}
        }

        // Single Source of Truth: build lookup of current local items
        const localMap = new Map<string, any>();
        currentRef.current.forEach((item: any) => {
          if (!item || typeof item !== 'object') return;
          const id = item.id || item.billNo || item.mrNo || item.challanNo || item.code || item.name;
          if (id) {
            localMap.set(String(id), item);
          }
        });

        const parseEntityTime = (obj: any): number => {
          if (!obj || typeof obj !== 'object') return 0;
          const raw = obj.updatedAt ?? obj.modifiedAt ?? obj.header?.updatedAt ?? obj.savedAt ?? obj.createdAt;
          if (!raw) return 0;
          if (typeof raw === 'number') return isFinite(raw) ? raw : 0;
          const ms = Date.parse(String(raw));
          return isNaN(ms) ? 0 : ms;
        };

        // The cloud database merges with local data; newer timestamp wins cleanly (when authoritativeReplace is true, stale un-synced local records are dropped)
        const idMap = new Map<string, any>();
        remoteVal.forEach((item: any) => {
          if (!item || typeof item !== 'object') return;
          const id = item.id || item.billNo || item.mrNo || item.challanNo || item.code || item.name;
          if (!id) return;
          const strId = String(id);
          if (isGloballyDeletedId(strId) || (sliceKey === 'items' && trashedItemIds.has(strId))) {
            return;
          }
          const localItem = localMap.get(strId);
          if (localItem) {
            const localTime = parseEntityTime(localItem);
            const remoteTime = parseEntityTime(item);
            if ((fromRealtimePeer && remoteTime === 0) || authoritativeReplace) {
              idMap.set(strId, { ...localItem, ...item });
            } else if (localTime > remoteTime) {
              idMap.set(strId, { ...item, ...localItem });
            } else {
              idMap.set(strId, { ...localItem, ...item });
            }
          } else {
            idMap.set(strId, item);
          }
        });

        const nowMs = Date.now();
        // Keep local records that have NOT been globally deleted (if authoritativeReplace, only preserve records created locally in the last 10s)
        localMap.forEach((localItem, id) => {
          if (idMap.has(id) || isGloballyDeletedId(id) || (sliceKey === 'items' && trashedItemIds.has(id))) {
            return;
          }
          if (authoritativeReplace) {
            const createdRecentlyTs = recentlyCreatedLocalIdsRef.current.get(id) || 0;
            if (nowMs - createdRecentlyTs < 10000) {
              idMap.set(id, localItem);
            }
          } else {
            idMap.set(id, localItem);
          }
        });

        finalVal = Array.from(idMap.values()).filter((it: any) => {
          if (!it) return false;
          const itId = String(it.id || it.billNo || it.mrNo || it.challanNo || '');
          if (itId && isGloballyDeletedId(itId)) return false;
          if (sliceKey === 'items' && itId && trashedItemIds.has(itId)) return false;
          return true;
        });
        if (sliceKey === 'items' && Array.isArray(finalVal)) {
          finalVal = sanitizeAndDeduplicateItems(finalVal);
        }
      } else if (isFreshBootCatalogReplace && Array.isArray(remoteVal)) {
        wasItemsLoadedFromStorageRef.current = true;
        finalVal = sanitizeAndDeduplicateItems(
          remoteVal.filter((it: any) => it && !isGloballyDeletedId(String(it.id || '')))
        );
      }

      const remoteStr = JSON.stringify(finalVal);
      if (sliceKey && lastSyncedSliceJsonRef.current[sliceKey] === remoteStr) {
        return;
      }
      const localStr = JSON.stringify(currentRef.current);
      if (remoteStr !== localStr) {
        if (sliceKey) {
          lastSyncedSliceJsonRef.current[sliceKey] = remoteStr;
        }
        isSyncingFromRemote.current = true;
        setter(finalVal);
        if (storageKey) {
          try {
            safeSetStorageItem(storageKey, remoteStr, finalVal);
          } catch {}
        }
      } else if (sliceKey) {
        lastSyncedSliceJsonRef.current[sliceKey] = localStr;
      }
    } catch (e) {
      console.warn('Sync comparison error:', e);
    }
  };

  // Universal purge helper to remove deleted entities across React state, refs, localStorage, IndexedDB, and price snapshots immediately
  const purgeDeletedFromStateAndStorage = (deletedIds: (string | number)[]) => {
    if (!Array.isArray(deletedIds) || deletedIds.length === 0) return;
    syncGlobalDeletedIds(deletedIds);
    const delSet = new Set(deletedIds.map((x) => String(x).toLowerCase().trim()));
    try {
      pruneDeletedIdsFromSnapshots(deletedIds);
    } catch {}

    const isMatch = (item: any) => {
      if (!item || typeof item !== 'object') return false;
      const candidates = [item.id, item._id];
      for (const c of candidates) {
        if (!c) continue;
        const str = String(c).toLowerCase().trim();
        if (!str || /^\d{1,5}$/.test(str)) continue;
        if (delSet.has(str) || isGloballyDeletedId(str)) return true;
      }
      return false;
    };

    setStoredBills((prev) => {
      const next = prev.filter((b) => !isMatch(b));
      if (next.length !== prev.length) {
        storedBillsRef.current = next;
        const nextStr = JSON.stringify(next);
        lastSyncedSliceJsonRef.current.storedBills = nextStr;
        safeSetStorageItem('polycables_stored_bills', JSON.stringify(buildLightStoredBillsForStorage(next)), next);
        idbSaveFailoverData('polycables_stored_bills', next).catch(() => {});
      }
      return next;
    });

    setSalespersons((prev) => {
      const next = prev.filter((s) => !isMatch(s));
      if (next.length !== prev.length) {
        salespersonsRef.current = next;
        const nextStr = JSON.stringify(next);
        lastSyncedSliceJsonRef.current.salespersons = nextStr;
        safeSetStorageItem('polycables_salespersons', nextStr, next);
      }
      return next;
    });

    setBranches((prev) => {
      const next = prev.filter((b) => !isMatch(b));
      if (next.length !== prev.length) {
        branchesRef.current = next;
        const nextStr = JSON.stringify(next);
        lastSyncedSliceJsonRef.current.branches = nextStr;
        safeSetStorageItem('polycables_branches', nextStr, next);
      }
      return next;
    });

    setItems((prev) => {
      const next = prev.filter((i) => !isMatch(i));
      if (next.length !== prev.length) {
        itemsRef.current = next;
        const nextStr = JSON.stringify(next);
        lastSyncedSliceJsonRef.current.items = nextStr;
        if (prev.length > 0 && next.length === 0) {
          try {
            localStorage.setItem('polycables_items_cleared', 'true');
          } catch {}
        }
        safeSetStorageItem('polycables_items', nextStr, next);
        const spec = next.filter((it) => it.isSpecialItem);
        safeSetStorageItem('polycables_special_items', JSON.stringify(spec), spec);
        idbSaveFailoverData('polycables_items', next).catch(() => {});
        idbSaveFailoverData('polycables_special_items', spec).catch(() => {});
      }
      return next;
    });

    setParties((prev) => {
      const next = prev.filter((p) => !isMatch(p));
      if (next.length !== prev.length) {
        partiesRef.current = next;
        const nextStr = JSON.stringify(next);
        lastSyncedSliceJsonRef.current.parties = nextStr;
        safeSetStorageItem('polycables_parties', nextStr, next);
        idbSaveFailoverData('polycables_parties', next).catch(() => {});
      }
      return next;
    });

    setDeliveryChallans((prev) => {
      const next = prev.filter((c) => !isMatch(c));
      if (next.length !== prev.length) {
        deliveryChallansRef.current = next;
        const nextStr = JSON.stringify(next);
        lastSyncedSliceJsonRef.current.deliveryChallans = nextStr;
        safeSetStorageItem('polycables_delivery_challans', nextStr, next);
      }
      return next;
    });

    setCollections((prev) => {
      const next = prev.filter((c) => !isMatch(c));
      if (next.length !== prev.length) {
        collectionsRef.current = next;
        const nextStr = JSON.stringify(next);
        lastSyncedSliceJsonRef.current.collections = nextStr;
        safeSetStorageItem('polycables_collections', nextStr, next);
      }
      return next;
    });

    setExpenses((prev) => {
      const next = prev.filter((e) => !isMatch(e));
      if (next.length !== prev.length) {
        expensesRef.current = next;
        const nextStr = JSON.stringify(next);
        lastSyncedSliceJsonRef.current.expenses = nextStr;
        safeSetStorageItem('polycables_expenses', nextStr, next);
      }
      return next;
    });

    setBankDeposits((prev) => {
      const next = prev.filter((d) => !isMatch(d));
      if (next.length !== prev.length) {
        bankDepositsRef.current = next;
        const nextStr = JSON.stringify(next);
        lastSyncedSliceJsonRef.current.bankDeposits = nextStr;
        safeSetStorageItem('polycables_bank_deposits', nextStr, next);
      }
      return next;
    });

    setColorExchanges((prev) => {
      const next = prev.filter((x) => !isMatch(x));
      if (next.length !== prev.length) {
        colorExchangesRef.current = next;
        const nextStr = JSON.stringify(next);
        lastSyncedSliceJsonRef.current.colorExchanges = nextStr;
        safeSetStorageItem('polycables_color_exchanges', nextStr, next);
      }
      return next;
    });

    setStockReturns((prev) => {
      const next = prev.filter((r) => !isMatch(r));
      if (next.length !== prev.length) {
        stockReturnsRef.current = next;
        const nextStr = JSON.stringify(next);
        lastSyncedSliceJsonRef.current.stockReturns = nextStr;
        safeSetStorageItem('polycables_stock_returns', nextStr, next);
      }
      return next;
    });

    setFactoryImports((prev) => {
      const next = prev.filter((f) => !isMatch(f));
      if (next.length !== prev.length) {
        factoryImportsRef.current = next;
        const nextStr = JSON.stringify(next);
        lastSyncedSliceJsonRef.current.factoryImports = nextStr;
        safeSetStorageItem('polycables_factory_imports', nextStr, next);
      }
      return next;
    });

    setClosings((prev) => {
      const next = prev.filter((cl) => !isMatch(cl));
      if (next.length !== prev.length) {
        closingsRef.current = next;
        const nextStr = JSON.stringify(next);
        lastSyncedSliceJsonRef.current.closings = nextStr;
        safeSetStorageItem('polycables_closings', nextStr, next);
      }
      return next;
    });

    setRequisitions((prev) => {
      const next = prev.filter((r) => !isMatch(r));
      if (next.length !== prev.length) {
        requisitionsRef.current = next;
        const nextStr = JSON.stringify(next);
        lastSyncedSliceJsonRef.current.requisitions = nextStr;
        safeSetStorageItem('polycables_requisitions', nextStr, next);
      }
      return next;
    });

    setConveyances((prev) => {
      const next = prev.filter((c) => !isMatch(c));
      if (next.length !== prev.length) {
        conveyancesRef.current = next;
        const nextStr = JSON.stringify(next);
        lastSyncedSliceJsonRef.current.conveyances = nextStr;
        safeSetStorageItem('polycables_conveyances', nextStr, next);
        idbSaveFailoverData('polycables_conveyances', next).catch(() => {});
      }
      return next;
    });
  };

  // Unified handler to apply any incoming remote state/patch (from Firestore, Server SSE /api/sync, or BroadcastChannel)
  const applyIncomingRemoteData = (
    data: Record<string, any>,
    fromRealtimePeerOrOpts: boolean | { fromRealtimePeer?: boolean; authoritativeCloud?: boolean } = false,
    extraOpts?: { authoritativeCloud?: boolean }
  ) => {
    if (!data || typeof data !== 'object') return;
    const fromRealtimePeer =
      typeof fromRealtimePeerOrOpts === 'object'
        ? Boolean(fromRealtimePeerOrOpts.fromRealtimePeer)
        : Boolean(fromRealtimePeerOrOpts);
    const authoritativeCloud =
      typeof fromRealtimePeerOrOpts === 'object'
        ? Boolean(fromRealtimePeerOrOpts.authoritativeCloud)
        : Boolean(extraOpts?.authoritativeCloud);

    // 1. Process restoredEntityIds first (un-tombstone restored records locally)
    const restoreSet = new Set<string>();
    if (Array.isArray(data.restoredEntityIds) && data.restoredEntityIds.length > 0) {
      unrecordDeletedIdsLocally(data.restoredEntityIds);
      data.restoredEntityIds.forEach((x: any) => restoreSet.add(String(x).toLowerCase().trim()));
    }

    const inRestoreGraceWindow =
      isRestoringFirestoreRef.current ||
      (lastRestoreTimestampRef.current > 0 && Date.now() - lastRestoreTimestampRef.current < 4000);

    // 2. Process deletedEntityIds tombstones (skip passive snapshots only during active 4s local restore burst)
    if (Array.isArray(data.deletedEntityIds) && data.deletedEntityIds.length > 0 && (!inRestoreGraceWindow || data._isDeleteOperation || fromRealtimePeer)) {
      const cleanDeleted = data.deletedEntityIds.filter(
        (id: any) => !restoreSet.has(String(id).toLowerCase().trim()) && !isRecentlyRestoredId(id)
      );
      if (cleanDeleted.length > 0) {
        purgeDeletedFromStateAndStorage(cleanDeleted);
      }
    }

    if (inRestoreGraceWindow && !fromRealtimePeer && !data._isRestore && !data._isDeleteOperation) {
      return;
    }

    if (data.storedBills && Array.isArray(data.storedBills)) {
      const lastLocalBillMod = localSliceModifiedAtRef.current.storedBills || 0;
      const canApplyBills = fromRealtimePeer || (!('storedBills' in pendingCloudDataRef.current) && Date.now() - lastLocalBillMod >= 3000);
      if (canApplyBills) {
        const cloudBills = deduplicateBills(data.storedBills).filter((b) => b && b.id && !isGloballyDeletedId(b.id));
        if (cloudBills.length === 0 && storedBillsRef.current.length > 0 && !data._forceEmpty && !authoritativeCloud) {
          console.warn('Guarded storedBills from being wiped by empty remote array.');
        } else {
          setStoredBills((prev) => {
            // Preserve local receivedCopy data URLs if remote summary stripped them for size limits
            const localCopyMap = new Map<string, { receivedCopy?: string; receivedCopyName?: string; receivedCopyDate?: string }>();
            prev.forEach((b) => {
              if (!b || !b.id) return;
              const rc = b.receivedCopy || b.header?.receivedCopy;
              if (rc) {
                localCopyMap.set(b.id, {
                  receivedCopy: rc,
                  receivedCopyName: b.receivedCopyName || b.header?.receivedCopyName,
                  receivedCopyDate: b.receivedCopyDate || b.header?.receivedCopyDate
                });
              }
            });

            // Single Source of Truth: Populate billMap strictly from authoritative cloudBills
            const billMap = new Map<string, StoredBill>();
            cloudBills.forEach((cb) => {
              if (!cb || !cb.id) return;
              if (isGloballyDeletedId(cb.id)) return;

              const existing = prev.find((b) => b.id === cb.id);
              const hasCopy = cb.receivedCopy || cb.header?.receivedCopy;
              const localCopy = localCopyMap.get(cb.id);

              const effectiveCopy = hasCopy ? (cb.receivedCopy || cb.header?.receivedCopy) : (localCopy?.receivedCopy || existing?.receivedCopy);
              const effectiveCopyName = cb.receivedCopyName || cb.header?.receivedCopyName || localCopy?.receivedCopyName || existing?.receivedCopyName;
              const effectiveCopyDate = cb.receivedCopyDate || cb.header?.receivedCopyDate || localCopy?.receivedCopyDate || existing?.receivedCopyDate;

              const parseTime = (val: any) => {
                if (!val) return 0;
                if (typeof val === 'number') return val;
                const d = new Date(val).getTime();
                return isNaN(d) ? 0 : d;
              };
              const existingTime = parseTime((existing as any)?.updatedAt) || parseTime((existing?.header as any)?.updatedAt) || parseTime(existing?.savedAt);
              const remoteTime = parseTime((cb as any)?.updatedAt) || parseTime((cb?.header as any)?.updatedAt) || parseTime(cb?.savedAt);
              const isLocalNewer = Boolean(!authoritativeCloud && existing && !(fromRealtimePeer && remoteTime === 0) && (!remoteTime || (existingTime && existingTime > remoteTime)));

              const winner = isLocalNewer && existing ? existing : cb;
              const merged = {
                ...(isLocalNewer ? cb : (existing || {})),
                ...winner,
                receivedCopy: effectiveCopy,
                receivedCopyName: effectiveCopyName,
                receivedCopyDate: effectiveCopyDate,
                header: {
                  ...(isLocalNewer ? (cb.header || {}) : (existing?.header || {})),
                  ...(winner.header || {}),
                  receivedCopy: effectiveCopy,
                  receivedCopyName: effectiveCopyName,
                  receivedCopyDate: effectiveCopyDate
                }
              };
              billMap.set(cb.id, merged as StoredBill);
            });

            // When authoritativeCloud is true (direct Firestore state), do not resurrect stale local/IDB bills not in cloud (except locally created in last 10s)
            if (authoritativeCloud && !fromRealtimePeer) {
              const nowMs = Date.now();
              prev.forEach((b) => {
                if (b && b.id && !billMap.has(b.id) && !isGloballyDeletedId(b.id)) {
                  const createdTs = recentlyCreatedLocalIdsRef.current.get(b.id) || 0;
                  if (nowMs - createdTs < 10000) {
                    billMap.set(b.id, b);
                  }
                }
              });
            } else if (!(fromRealtimePeer && data._replaceStoredBills)) {
              prev.forEach((b) => {
                if (b && b.id && !billMap.has(b.id) && !isGloballyDeletedId(b.id)) {
                  billMap.set(b.id, b);
                }
              });
              storedBillsRef.current.forEach((b) => {
                if (b && b.id && !billMap.has(b.id) && !isGloballyDeletedId(b.id)) {
                  billMap.set(b.id, b);
                }
              });
            }

            const mergedBills = deduplicateBills(Array.from(billMap.values()));
            if (
              !data._replaceStoredBills &&
              !authoritativeCloud &&
              prev.length === mergedBills.length &&
              prev.every(
                (b, i) =>
                  b.id === mergedBills[i]?.id &&
                  b.savedAt === mergedBills[i]?.savedAt &&
                  (b as any).updatedAt === (mergedBills[i] as any)?.updatedAt &&
                  (b.header as any)?.updatedAt === (mergedBills[i]?.header as any)?.updatedAt
              )
            ) {
              return prev;
            }
            storedBillsRef.current = mergedBills;
            isSyncingFromRemote.current = true;
            const nextJson = JSON.stringify(mergedBills);
            if (nextJson === lastSyncedSliceJsonRef.current.storedBills && prev.length === mergedBills.length) {
              return prev;
            }
            try {
              idbSaveFailoverData('polycables_stored_bills', mergedBills).catch(() => {});
              const localPayload = nextJson.length <= 1200000 ? nextJson : JSON.stringify(buildLightStoredBillsForStorage(mergedBills));
              safeSetStorageItem('polycables_stored_bills', localPayload, mergedBills);
            } catch {}
            lastSyncedSliceJsonRef.current.storedBills = nextJson;
            return mergedBills;
          });
        }
      }
      setIsCloudBillsLoading(false);
    }

    // Sync category lists (deletedCategories, customCategories, categoryNumbers, orderedCategories) before items
    let categoriesChanged = false;
    if (Array.isArray(data.deletedCategories)) {
      const remoteDelJson = JSON.stringify(data.deletedCategories);
      if (localStorage.getItem('polycables_deleted_categories') !== remoteDelJson) {
        safeSetStorageItem('polycables_deleted_categories', remoteDelJson, data.deletedCategories);
        categoriesChanged = true;
      }
    }
    if (Array.isArray(data.customCategories)) {
      const remoteCustomJson = JSON.stringify(data.customCategories);
      if (localStorage.getItem('polycables_custom_categories') !== remoteCustomJson) {
        safeSetStorageItem('polycables_custom_categories', remoteCustomJson, data.customCategories);
        categoriesChanged = true;
      }
    }
    if (data.categoryNumbers && typeof data.categoryNumbers === 'object' && !Array.isArray(data.categoryNumbers)) {
      const normalizedNums = saveCategoryNumbers(data.categoryNumbers);
      const numJson = JSON.stringify(normalizedNums);
      if (localStorage.getItem('polycables_category_numbers') !== numJson) {
        categoriesChanged = true;
      }
    }
    if (Array.isArray(data.orderedCategories)) {
      const remoteOrderedJson = JSON.stringify(data.orderedCategories);
      if (localStorage.getItem('polycables_ordered_categories') !== remoteOrderedJson) {
        safeSetStorageItem('polycables_ordered_categories', remoteOrderedJson, data.orderedCategories);
        categoriesChanged = true;
      }
    }
    if (categoriesChanged) {
      window.dispatchEvent(new CustomEvent('categories-updated', { detail: getAllCategories() }));
    }

    const remoteItemsVer = Number(data.itemsVersion || 0);
    if (remoteItemsVer > (localItemsVersionRef.current || 0)) {
      localItemsVersionRef.current = remoteItemsVer;
      try {
        localStorage.setItem('polycables_items_version', String(remoteItemsVer));
      } catch {}
    }

    if (
      data._itemsCleared === true ||
      (Array.isArray(data.items) && data.items.length === 0 && (data._forceEmpty || data._itemsCleared))
    ) {
      try {
        localStorage.setItem('polycables_items_cleared', 'true');
      } catch {}
      wasItemsLoadedFromStorageRef.current = true;
      itemsRef.current = [];
      lastSyncedSliceJsonRef.current.items = '[]';
      isSyncingFromRemote.current = true;
      setItems([]);
      safeSetStorageItem('polycables_items', '[]', []);
      safeSetStorageItem('polycables_special_items', '[]', []);
      idbSaveFailoverData('polycables_items', []).catch(() => {});
      idbSaveFailoverData('polycables_special_items', []).catch(() => {});
      idbSaveFailoverData('polycables_permanent_special_items', []).catch(() => {});
      try {
        localStorage.setItem('polycables_permanent_special_items', '[]');
      } catch {}
    } else if (data.items && Array.isArray(data.items)) {
      if (data.items.length > 0 && data._itemsCleared !== true) {
        try {
          localStorage.removeItem('polycables_items_cleared');
        } catch {}
      }
      const localItemsCleared = localStorage.getItem('polycables_items_cleared') === 'true';
      if (!localItemsCleared) {
        const trashedItemIds = new Set<string>();
        try {
          const savedTrashed = localStorage.getItem('polycables_trashed_items');
          if (savedTrashed) {
            const parsed = JSON.parse(savedTrashed);
            if (Array.isArray(parsed)) {
              parsed.forEach((x: any) => {
                if (x?.id) trashedItemIds.add(String(x.id));
                if (x?.data?.id) trashedItemIds.add(String(x.data.id));
              });
            }
          }
        } catch {}
        try {
          const savedDel = localStorage.getItem('polycables_deleted_item_ids');
          if (savedDel) {
            const parsed = JSON.parse(savedDel);
            if (Array.isArray(parsed)) {
              parsed.forEach((id: string) => trashedItemIds.add(String(id)));
            }
          }
        } catch {}

        let mergedItems = data.items.filter((it: any) => {
          const strId = String(it?.id || '');
          return !isGloballyDeletedId(strId) && !trashedItemIds.has(strId);
        });
        if (data.specialItems && Array.isArray(data.specialItems)) {
          const cleanSpecials = data.specialItems.filter((s: any) => {
            const strId = String(s?.id || '');
            return !isGloballyDeletedId(strId) && !trashedItemIds.has(strId);
          });
          const existingIds = new Set(mergedItems.map((i: any) => String(i.id)));
          cleanSpecials.forEach((s: any) => {
            const sId = String(s.id);
            if (!existingIds.has(sId)) {
              existingIds.add(sId);
              mergedItems.push(s);
            }
          });
        }

        const {
          items: cleanMerged,
          removedPseudoItemIds,
          repairedCategories,
          changed: remoteItemsRepaired
        } = repairCategoryInItemNameRecords(mergedItems);

        if (removedPseudoItemIds.length > 0) {
          removedPseudoItemIds.forEach((id) => recordDeletedEntityId(id));
          fetch('/api/sync/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId: clientSyncIdRef.current, ids: removedPseudoItemIds })
          }).catch(() => {});
        }

        const hasPendingLocalItems =
          'items' in pendingCloudDataRef.current ||
          'items' in pendingFirestoreDataRef.current ||
          Date.now() - (localSliceModifiedAtRef.current.items || 0) < 4000;
        const prevLocalVerBeforeRemote = Number(localStorage.getItem('polycables_items_version_applied') || 0);
        const shouldReplaceItemsCatalog =
          Boolean(data._replaceItems) ||
          (authoritativeCloud && !hasPendingLocalItems) ||
          (remoteItemsVer > 0 && remoteItemsVer > prevLocalVerBeforeRemote && !hasPendingLocalItems) ||
          (!wasItemsLoadedFromStorageRef.current && !hasPendingLocalItems) ||
          (!fromRealtimePeer && !hasPendingLocalItems && prevLocalVerBeforeRemote === 0);

        if (shouldReplaceItemsCatalog && Array.isArray(cleanMerged) && cleanMerged.length > 0) {
          wasItemsLoadedFromStorageRef.current = true;
          const cleanStr = JSON.stringify(cleanMerged);
          lastSyncedSliceJsonRef.current.items = cleanStr;
          isSyncingFromRemote.current = true;
          itemsRef.current = cleanMerged;
          setItems(cleanMerged);
          safeSetStorageItem('polycables_items', cleanStr, cleanMerged);
          const spOnly = cleanMerged.filter((it: any) => it?.isSpecialItem);
          safeSetStorageItem('polycables_special_items', JSON.stringify(spOnly), spOnly);
          idbSaveFailoverData('polycables_items', cleanMerged).catch(() => {});
          idbSaveFailoverData('polycables_special_items', spOnly).catch(() => {});
          try {
            localStorage.setItem('polycables_permanent_special_items', JSON.stringify(spOnly));
            if (remoteItemsVer > 0) {
              localStorage.setItem('polycables_items_version_applied', String(remoteItemsVer));
              localStorage.setItem('polycables_items_version', String(remoteItemsVer));
            }
          } catch {}
        } else {
          applyRemoteDataIfChanged(cleanMerged, itemsRef, setItems, 'polycables_items', 'items', fromRealtimePeer, authoritativeCloud && !fromRealtimePeer);
          idbSaveFailoverData('polycables_items', cleanMerged).catch(() => {});
          if (remoteItemsVer > 0) {
            try {
              localStorage.setItem('polycables_items_version_applied', String(remoteItemsVer));
            } catch {}
          }
        }
        try {
          window.dispatchEvent(new CustomEvent('polycables_items_updated', { detail: { items: cleanMerged } }));
        } catch {}

        if (repairedCategories.length > 0) {
          repairedCategories.forEach((cat) => saveCustomCategory(cat));
          window.dispatchEvent(new CustomEvent('categories-updated', { detail: getAllCategories() }));
        }
        if (remoteItemsRepaired || removedPseudoItemIds.length > 0) {
          scheduleCloudSync(
            {
              items: cleanMerged,
              specialItems: cleanMerged.filter((it: any) => it?.isSpecialItem),
              _replaceItems: true,
              orderedCategories: getAllCategories(),
              ...(removedPseudoItemIds.length > 0 ? { deletedEntityIds: removedPseudoItemIds } : {})
            },
            true
          );
        }
      }
    }
    if (data.specialItems && Array.isArray(data.specialItems) && localStorage.getItem('polycables_items_cleared') !== 'true') {
      safeSetStorageItem('polycables_special_items', JSON.stringify(data.specialItems), data.specialItems);
    }

    const useAuthoritativeSliceReplace = authoritativeCloud && !fromRealtimePeer;
    if (data.parties && Array.isArray(data.parties)) {
      const cleanRemoteParties = sanitizeAndDeduplicateParties(data.parties);
      applyRemoteDataIfChanged(cleanRemoteParties, partiesRef, setParties, 'polycables_parties', 'parties', fromRealtimePeer, useAuthoritativeSliceReplace);
    }
    if (data.salespersons && Array.isArray(data.salespersons)) {
      const cleanRemoteSp = sanitizeSalespersonsList(data.salespersons);
      applyRemoteDataIfChanged(cleanRemoteSp, salespersonsRef, setSalespersons, 'polycables_salespersons', 'salespersons', fromRealtimePeer, useAuthoritativeSliceReplace);
    }
    if (data.factoryImports && Array.isArray(data.factoryImports)) {
      applyRemoteDataIfChanged(data.factoryImports, factoryImportsRef, setFactoryImports, 'polycables_factory_imports', 'factoryImports', fromRealtimePeer, useAuthoritativeSliceReplace);
    }
    if (data.stockReturns && Array.isArray(data.stockReturns)) {
      applyRemoteDataIfChanged(data.stockReturns, stockReturnsRef, setStockReturns, 'polycables_stock_returns', 'stockReturns', fromRealtimePeer, useAuthoritativeSliceReplace);
    }
    if (data.deliveryChallans && Array.isArray(data.deliveryChallans)) {
      applyRemoteDataIfChanged(data.deliveryChallans, deliveryChallansRef, setDeliveryChallans, 'polycables_delivery_challans', 'deliveryChallans', fromRealtimePeer, useAuthoritativeSliceReplace);
    }
    if (data.colorExchanges && Array.isArray(data.colorExchanges)) {
      applyRemoteDataIfChanged(data.colorExchanges, colorExchangesRef, setColorExchanges, 'polycables_color_exchanges', 'colorExchanges', fromRealtimePeer, useAuthoritativeSliceReplace);
    }
    if (data.expenses && Array.isArray(data.expenses)) {
      applyRemoteDataIfChanged(data.expenses, expensesRef, setExpenses, 'polycables_expenses', 'expenses', fromRealtimePeer, useAuthoritativeSliceReplace);
    }
    if (data.conveyances && Array.isArray(data.conveyances)) {
      applyRemoteDataIfChanged(data.conveyances, conveyancesRef, setConveyances, 'polycables_conveyances', 'conveyances', fromRealtimePeer, useAuthoritativeSliceReplace);
    }
    if (data.collections && Array.isArray(data.collections)) {
      applyRemoteDataIfChanged(sanitizeCollectionsList(data.collections), collectionsRef, setCollections, 'polycables_collections', 'collections', fromRealtimePeer, useAuthoritativeSliceReplace);
    }
    if (data.bankDeposits && Array.isArray(data.bankDeposits)) {
      applyRemoteDataIfChanged(data.bankDeposits, bankDepositsRef, setBankDeposits, 'polycables_bank_deposits', 'bankDeposits', fromRealtimePeer, useAuthoritativeSliceReplace);
    }
    if (data.branches && Array.isArray(data.branches)) {
      const sanitized = sanitizeAndSortBranches(data.branches);
      applyRemoteDataIfChanged(sanitized, branchesRef, setBranches, 'polycables_branches', 'branches', fromRealtimePeer, useAuthoritativeSliceReplace);
    }
    if (data.requisitions && Array.isArray(data.requisitions)) {
      applyRemoteDataIfChanged(data.requisitions, requisitionsRef, setRequisitions, 'polycables_requisitions', 'requisitions', fromRealtimePeer, useAuthoritativeSliceReplace);
    }
    if (data.bankList && Array.isArray(data.bankList)) {
      const sanitized = data.bankList.map((item: any) => (typeof item === 'string' ? item : (item?.name || item?.bankName || String(item || ''))).trim()).filter(Boolean);
      applyRemoteDataIfChanged(sanitized, bankListRef, setBankList, 'polycables_bank_list', 'bankList', fromRealtimePeer, useAuthoritativeSliceReplace);
    }
    if (data.accountList && Array.isArray(data.accountList)) {
      const sanitized = data.accountList.map((item: any) => (typeof item === 'string' ? item : (item?.name || item?.accountName || String(item || ''))).trim()).filter(Boolean);
      applyRemoteDataIfChanged(sanitized, accountListRef, setAccountList, 'polycables_account_list', 'accountList', fromRealtimePeer, useAuthoritativeSliceReplace);
    }
    if (data.closings && Array.isArray(data.closings)) {
      applyRemoteDataIfChanged(data.closings, closingsRef, setClosings, 'polycables_closings', 'closings', fromRealtimePeer, useAuthoritativeSliceReplace);
    }
    if (Array.isArray(data.deletedAutoDeposits)) {
      applyRemoteDataIfChanged(data.deletedAutoDeposits, deletedAutoDepositIdsRef, setDeletedAutoDepositIds, 'polycables_deleted_auto_deposits', 'deletedAutoDeposits', fromRealtimePeer, useAuthoritativeSliceReplace);
    }
    if (data.company && typeof data.company === 'object' && data.company.name) {
      applyRemoteDataIfChanged(data.company, companyRef, setCompany, 'polycables_company', 'company', fromRealtimePeer, useAuthoritativeSliceReplace);
    }
    if (Array.isArray(data.expenseCategories)) {
      try {
        const expCatJson = JSON.stringify(data.expenseCategories);
        localStorage.setItem('polycables_expense_categories_v2', expCatJson);
        localStorage.setItem('polycables_expense_categories', expCatJson);
        window.dispatchEvent(new Event('storage'));
      } catch {}
    }
    if (typeof data.activeEffectiveDate === 'string' && data.activeEffectiveDate.trim()) {
      try {
        localStorage.setItem('polycables_active_effective_date', data.activeEffectiveDate.trim());
      } catch {}
    }
    const lastLocalSnapMod = Math.max(
      localSliceModifiedAtRef.current.priceSnapshots || 0,
      localSliceModifiedAtRef.current.price_snapshots || 0
    );
    const hasPendingLocalSnapshots =
      !fromRealtimePeer &&
      ('priceSnapshots' in pendingCloudDataRef.current ||
        'price_snapshots' in pendingCloudDataRef.current ||
        'priceSnapshots' in pendingFirestoreDataRef.current ||
        'price_snapshots' in pendingFirestoreDataRef.current ||
        Date.now() - lastLocalSnapMod < 2500);
    const hasPendingLocalItemsSnapGuard =
      !fromRealtimePeer &&
      ('items' in pendingCloudDataRef.current ||
        'items' in pendingFirestoreDataRef.current ||
        Date.now() - (localSliceModifiedAtRef.current.items || 0) < 2000);

    const remotePriceSnapshots = data.priceSnapshots || data.price_snapshots;
    if (Array.isArray(remotePriceSnapshots) && !hasPendingLocalSnapshots) {
      try {
        const deletedSnapIds: string[] = JSON.parse(localStorage.getItem('polycables_deleted_snapshot_ids') || '[]');
        const filteredSnapshots = remotePriceSnapshots.filter(
          (s: any) => s && s.id && !deletedSnapIds.includes(s.id) && !isGloballyDeletedId(s.id)
        );
        const currentLocalSnaps = getPriceListSnapshots();
        const prevSnapJson = JSON.stringify(currentLocalSnaps);
        const provisionalNorm = normalizePriceSnapshots(filteredSnapshots);
        const nextSnapJson = JSON.stringify(provisionalNorm);
        const activeSnap = provisionalNorm.find((s) => s.isActive);
        const normalizedSnapshots =
          nextSnapJson !== prevSnapJson
            ? savePriceListSnapshots(provisionalNorm, {
                effectiveDate: activeSnap?.effectiveDate,
                circularTitle: activeSnap?.title,
                dispatch: true
              })
            : provisionalNorm;
        const rec = reconcileCatalogItemsWithActiveSnapshot(itemsRef.current, normalizedSnapshots);
        if (rec.changed) {
          const nextStr = JSON.stringify(rec.items);
          lastSyncedSliceJsonRef.current.items = nextStr;
          itemsRef.current = rec.items;
          setItems(rec.items);
          try {
            if (rec.items.length === 0) {
              localStorage.setItem('polycables_items_cleared', 'true');
            } else {
              localStorage.removeItem('polycables_items_cleared');
            }
          } catch {}
          safeSetStorageItem('polycables_items', nextStr, rec.items);
          const spList = rec.items.filter((it: any) => it?.isSpecialItem);
          safeSetStorageItem('polycables_special_items', JSON.stringify(spList), spList);
          idbSaveFailoverData('polycables_items', rec.items).catch(() => {});
          idbSaveFailoverData('polycables_special_items', spList).catch(() => {});
          window.dispatchEvent(new CustomEvent('polycables_items_updated', { detail: { items: rec.items } }));
        }
      } catch (err) {
        console.error('Failed to sync price snapshots:', err);
      }
    } else if (data.items && Array.isArray(data.items) && !hasPendingLocalSnapshots && !hasPendingLocalItemsSnapGuard) {
      const rec = reconcileCatalogItemsWithActiveSnapshot(itemsRef.current, getPriceListSnapshots());
      if (rec.changed) {
        const nextStr = JSON.stringify(rec.items);
        lastSyncedSliceJsonRef.current.items = nextStr;
        itemsRef.current = rec.items;
        setItems(rec.items);
        try {
          if (rec.items.length === 0) {
            localStorage.setItem('polycables_items_cleared', 'true');
          } else {
            localStorage.removeItem('polycables_items_cleared');
          }
        } catch {}
        safeSetStorageItem('polycables_items', nextStr, rec.items);
        const spList = rec.items.filter((it: any) => it?.isSpecialItem);
        safeSetStorageItem('polycables_special_items', JSON.stringify(spList), spList);
        idbSaveFailoverData('polycables_items', rec.items).catch(() => {});
      }
    }

    if (data.salespersonTargets && typeof data.salespersonTargets === 'object') {
      try {
        localStorage.setItem('polycables_salesperson_yearly_targets', JSON.stringify(data.salespersonTargets));
        window.dispatchEvent(new CustomEvent('polycables_targets_updated', { detail: { salespersonTargets: data.salespersonTargets } }));
      } catch {}
    }
    if (data.salesCenterTargets && typeof data.salesCenterTargets === 'object') {
      try {
        localStorage.setItem('polycables_salescenter_yearly_targets', JSON.stringify(data.salesCenterTargets));
        window.dispatchEvent(new CustomEvent('polycables_targets_updated', { detail: { salesCenterTargets: data.salesCenterTargets } }));
      } catch {}
    }

    isRemoteSyncDone.current = true;
    scheduleUnlockRemoteSync(80);
  };

  const applyIncomingRemoteDataRef = useRef(applyIncomingRemoteData);
  applyIncomingRemoteDataRef.current = applyIncomingRemoteData;

  const mergeServerBillsUnion = (
    baseBills: StoredBill[] | undefined,
    colBills: StoredBill[],
    trashedBillIds: Set<string>
  ): StoredBill[] | undefined => {
    if (baseBills === undefined && colBills.length === 0) {
      return undefined;
    }
    const parseTs = (val: any): number => {
      if (!val) return 0;
      if (typeof val === 'number') return isFinite(val) ? val : 0;
      const ms = Date.parse(String(val));
      return isNaN(ms) ? 0 : ms;
    };
    const billMap = new Map<string, StoredBill>();
    const addOrMerge = (b: StoredBill) => {
      if (!b || !b.id || isGloballyDeletedId(b.id) || trashedBillIds.has(b.id)) return;
      const prev = billMap.get(b.id);
      if (!prev) {
        billMap.set(b.id, b);
        return;
      }
      const prevTs = parseTs((prev as any).updatedAt) || parseTs((prev.header as any)?.updatedAt) || parseTs(prev.savedAt);
      const curTs = parseTs((b as any).updatedAt) || parseTs((b.header as any)?.updatedAt) || parseTs(b.savedAt);
      const winner = curTs >= prevTs ? b : prev;
      const loser = curTs >= prevTs ? prev : b;
      const effectiveCopy = winner.receivedCopy || winner.header?.receivedCopy || loser.receivedCopy || loser.header?.receivedCopy;
      const effectiveCopyName = winner.receivedCopyName || winner.header?.receivedCopyName || loser.receivedCopyName || loser.header?.receivedCopyName;
      const effectiveCopyDate = winner.receivedCopyDate || winner.header?.receivedCopyDate || loser.receivedCopyDate || loser.header?.receivedCopyDate;
      billMap.set(b.id, {
        ...loser,
        ...winner,
        ...(effectiveCopy ? { receivedCopy: effectiveCopy } : {}),
        ...(effectiveCopyName ? { receivedCopyName: effectiveCopyName } : {}),
        ...(effectiveCopyDate ? { receivedCopyDate: effectiveCopyDate } : {}),
        header: {
          ...(loser.header || {}),
          ...(winner.header || {}),
          ...(effectiveCopy ? { receivedCopy: effectiveCopy } : {}),
          ...(effectiveCopyName ? { receivedCopyName: effectiveCopyName } : {}),
          ...(effectiveCopyDate ? { receivedCopyDate: effectiveCopyDate } : {})
        } as BillHeader
      });
    };
    if (Array.isArray(baseBills)) {
      baseBills.forEach(addOrMerge);
    }
    colBills.forEach(addOrMerge);
    return deduplicateBills(Array.from(billMap.values()));
  };

  const pullFromServerSyncFallback = useCallback(async (reason: string): Promise<boolean> => {
    try {
      const isPeerCatchup =
        reason === 'fallback-poll' ||
        reason === 'realtime-version-poll' ||
        reason.startsWith('sse-');
      const res = await fetch('/api/sync', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null));
      if (res && res.success && res.data && typeof res.data === 'object') {
        if (res.version) {
          noteServerVersion(res.version);
        }
        const remoteKeys = Object.keys(res.data).filter((k) => !k.startsWith('_'));
        const hasMeaningfulData = remoteKeys.some((k) => {
          const v = res.data[k];
          return Array.isArray(v) ? v.length > 0 : Boolean(v && typeof v === 'object' && Object.keys(v).length > 0);
        });
        if (res.data._syncProtocolVersion === 2 && (hasMeaningfulData || res.data._itemsCleared === true)) {
          applyIncomingRemoteDataRef.current(res.data, {
            fromRealtimePeer: isPeerCatchup,
            authoritativeCloud: false
          });
        }
      }
      const itemsRes = await fetch('/api/items', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (itemsRes?.version) {
        noteServerVersion(itemsRes.version);
      }
      if (itemsRes && itemsRes.success && Date.now() - (localSliceModifiedAtRef.current.items || 0) >= 2000) {
        const serverVer = Number(itemsRes.itemsVersion || 0);
        const serverCleared = Boolean(itemsRes.itemsCleared);
        const serverItems = Array.isArray(itemsRes.items) ? itemsRes.items : [];
        if (serverCleared || serverItems.length > 0 || serverVer > (localItemsVersionRef.current || 0)) {
          applyIncomingRemoteDataRef.current(
            {
              items: serverItems,
              specialItems: Array.isArray(itemsRes.specialItems) ? itemsRes.specialItems : serverItems.filter((i: any) => i?.isSpecialItem),
              itemsVersion: serverVer,
              _itemsCleared: serverCleared,
              _forceEmpty: serverCleared,
              _replaceItems: true,
              ...(Array.isArray(itemsRes.orderedCategories) ? { orderedCategories: itemsRes.orderedCategories } : {}),
              ...(Array.isArray(itemsRes.customCategories) ? { customCategories: itemsRes.customCategories } : {}),
              ...(Array.isArray(itemsRes.deletedCategories) ? { deletedCategories: itemsRes.deletedCategories } : {}),
              ...(itemsRes.categoryNumbers ? { categoryNumbers: itemsRes.categoryNumbers } : {}),
              ...(Array.isArray(itemsRes.deletedEntityIds) ? { deletedEntityIds: itemsRes.deletedEntityIds } : {}),
              ...(Array.isArray(itemsRes.priceSnapshots) ? { priceSnapshots: itemsRes.priceSnapshots } : {}),
              ...(typeof itemsRes.activeEffectiveDate === 'string' ? { activeEffectiveDate: itemsRes.activeEffectiveDate } : {})
            },
            { fromRealtimePeer: isPeerCatchup, authoritativeCloud: false }
          );
        }
      }
      return true;
    } catch {
      return false;
    } finally {
      setIsCloudBillsLoading(false);
      isRemoteSyncDone.current = true;
    }
  }, [noteServerVersion]);

  const pullFromSecondaryCloudThenLocal = useCallback(
    async (reason: string): Promise<void> => {
      // Strict Cloud-Only Failover Pull:
      // Walks secondary cloud nodes in priority order (Node #1 Madhupur Firebase -> Node #2 -> Node #3 Supabase -> B2/R2/GCS/S3/Appwrite/Neon -> Server Hub /api/sync)
      try {
        const failoverRes = await failoverPullFromCloudNodes();
        if (failoverRes.ok && failoverRes.data && Object.keys(failoverRes.data).length > 0 && !isRestoringFirestoreRef.current) {
          activeCloudTierRef.current = 'secondary_cloud';
          hasHydratedStoreRef.current = true;
          isCloudAuthoritativeHydratedRef.current = true;
          applyIncomingRemoteDataRef.current(failoverRes.data, {
            fromRealtimePeer: false,
            authoritativeCloud: true
          });
          setIsCloudBillsLoading(false);
          isRemoteSyncDone.current = true;
          return;
        }
      } catch {}

      // Final remote server hub check (/api/sync + /api/items, never reads localStorage failover cache)
      activeCloudTierRef.current = 'secondary_cloud';
      await pullFromServerSyncFallback(reason);
    },
    [pullFromServerSyncFallback]
  );

  const inFlightCloudPullRef = useRef<Promise<{ ok: boolean; error?: string }> | null>(null);

  const pullLatestFromFirestore = useCallback(
    async (reason: string, forceResetQuota: boolean = false): Promise<{ ok: boolean; error?: string }> => {
      if (isRestoringFirestoreRef.current) {
        return { ok: true };
      }
      if (inFlightCloudPullRef.current && !forceResetQuota) {
        return inFlightCloudPullRef.current;
      }

      const runPull = async (): Promise<{ ok: boolean; error?: string }> => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          setIsCloudBillsLoading(false);
          isRemoteSyncDone.current = true;
          return { ok: false };
        }

        if (forceResetQuota) {
          markFirestoreQuotaExhausted(false);
          markFirestoreUnavailable(false);
          quotaExhaustedRef.current = false;
        }
        if (quotaExhaustedRef.current || isFirestoreInFallbackCooldown()) {
          if (isFirestoreQuotaExhausted()) {
            quotaExhaustedRef.current = true;
          }
          await pullFromSecondaryCloudThenLocal(reason);
          return { ok: true };
        }

        try {
          lastFirestorePullAtRef.current = Date.now();
          const [storeSnap, billsSnap] = await Promise.all([
            getDocsFromServer(collection(db, 'store')),
            getDocsFromServer(collection(db, 'stored_bills'))
          ]);

          let trashedBillIds = new Set<string>();
          try {
            const rawTrashed = localStorage.getItem('polycables_trashed_bills');
            if (rawTrashed) {
              const parsed = JSON.parse(rawTrashed);
              if (Array.isArray(parsed)) {
                parsed.forEach((tb: any) => {
                  if (tb?.id) trashedBillIds.add(String(tb.id));
                  if (tb?.data?.id) trashedBillIds.add(String(tb.data.id));
                });
              }
            }
          } catch {}

          let assembled: Record<string, any> = {};
          let appHasMeaningfulCloudState = false;
          const docMap = new Map<string, Record<string, any>>();
          storeSnap.docs.forEach((d) => {
            docMap.set(d.id, d.data() || {});
          });

          // 1. Read legacy inline fields & metadata from app_data if present
          const appData = docMap.get('app_data');
          if (appData && typeof appData === 'object' && Object.keys(appData).length > 0) {
            appHasMeaningfulCloudState = true;
            knownAppDocIsSlicedRef.current = Boolean(appData._sliced);
            if (Array.isArray(appData.sliceKeys) && appData.sliceKeys.length > 0) {
              knownSliceKeysRef.current = Array.from(new Set([...knownSliceKeysRef.current, ...appData.sliceKeys]));
            }
            if (appData.sliceVersions && typeof appData.sliceVersions === 'object') {
              knownSliceVersionsRef.current = { ...knownSliceVersionsRef.current, ...appData.sliceVersions };
            }
            if (typeof appData._itemsCleared === 'boolean') {
              assembled._itemsCleared = appData._itemsCleared;
            }
            if (Number(appData.itemsVersion || 0) > 0) {
              assembled.itemsVersion = Number(appData.itemsVersion);
            }
            if (typeof appData.activeEffectiveDate === 'string') {
              assembled.activeEffectiveDate = appData.activeEffectiveDate;
            }
            for (const [k, v] of Object.entries(appData)) {
              if (k.startsWith('_') || k === 'sliceKeys' || k === 'sliceVersions') continue;
              assembled[k] = v;
            }
          }

          // 2. Overlay all dedicated slice_<key> docs (newer per-slice writes always override legacy inline app_data)
          const chunkGroups = new Map<string, Array<{ idx: number; val: any[] }>>();
          const primarySlices: Array<{ sk: string; data: Record<string, any> }> = [];
          for (const [docId, sData] of docMap.entries()) {
            if (!docId.startsWith('slice_')) continue;
            const chunkMatch = docId.match(/^slice_(.+)_(\d+)$/);
            if (chunkMatch) {
              const parentKey = chunkMatch[1];
              const idx = Number(chunkMatch[2]);
              const list = chunkGroups.get(parentKey) || [];
              if (Array.isArray(sData?.value)) {
                list.push({ idx, val: sData.value });
              }
              chunkGroups.set(parentKey, list);
            } else {
              primarySlices.push({ sk: docId.slice('slice_'.length), data: sData });
            }
          }

          let deletedIdsUnion: string[] = Array.isArray(assembled.deletedEntityIds)
            ? [...assembled.deletedEntityIds]
            : [];

          let bestPriceSnapVer = -1;
          for (const { sk, data: sData } of primarySlices) {
            appHasMeaningfulCloudState = true;
            knownAppDocIsSlicedRef.current = true;
            const ver = Number(sData?.version || Date.now());
            lastFetchedSliceVersionsRef.current[sk] = ver;
            knownSliceVersionsRef.current[sk] = ver;

            let sliceValue: any = sData?.value;
            if (sData?._chunked && Number(sData.chunkCount) > 0) {
              const chunks = (chunkGroups.get(sk) || [])
                .filter((c) => c.idx < Number(sData.chunkCount))
                .sort((a, b) => a.idx - b.idx);
              sliceValue = chunks.flatMap((c) => c.val);
            }

            if (sk === 'deletedEntityIds') {
              if (Array.isArray(sliceValue)) {
                deletedIdsUnion = Array.from(new Set([...deletedIdsUnion, ...sliceValue]));
                try {
                  lastFirestoreDeletedIdsJsonRef.current = JSON.stringify(sliceValue);
                } catch {}
              }
              continue;
            }

            if (sk === 'priceSnapshots' || sk === 'price_snapshots') {
              knownSliceKeysRef.current = Array.from(new Set([...knownSliceKeysRef.current, 'priceSnapshots']));
              if (ver >= bestPriceSnapVer) {
                bestPriceSnapVer = ver;
                assembled.priceSnapshots = sliceValue;
                delete assembled.price_snapshots;
                if (typeof sData.activeEffectiveDate === 'string') {
                  assembled.activeEffectiveDate = sData.activeEffectiveDate;
                }
              }
              continue;
            }

            knownSliceKeysRef.current = Array.from(new Set([...knownSliceKeysRef.current, sk]));
            assembled[sk] = sliceValue;
            if (sk === 'items') {
              if (typeof sData._itemsCleared === 'boolean') assembled._itemsCleared = sData._itemsCleared;
              if (Number(sData.itemsVersion || 0) > 0) assembled.itemsVersion = Number(sData.itemsVersion);
            }
          }

          if (deletedIdsUnion.length > 0 && !isRestoringFirestoreRef.current) {
            replaceGlobalDeletedIds(deletedIdsUnion);
            assembled.deletedEntityIds = deletedIdsUnion;
          }

          const colBills = billsSnap.docs
            .map((d) => d.data() as StoredBill)
            .filter((b) => b && b.id && b.header && !trashedBillIds.has(b.id) && !isGloballyDeletedId(b.id));

          if (colBills.length > 0) {
            // Authoritative 'stored_bills' collection takes precedence so single-bill deletes stay identical on all devices
            assembled.storedBills = deduplicateBills(colBills);
            appHasMeaningfulCloudState = true;
          } else if (Array.isArray(assembled.storedBills)) {
            const cleanedSliceBills = assembled.storedBills.filter(
              (b: any) => b && b.id && !trashedBillIds.has(b.id) && !isGloballyDeletedId(b.id)
            );
            assembled.storedBills = deduplicateBills(cleanedSliceBills);
            appHasMeaningfulCloudState = true;
          }

          hasHydratedStoreRef.current = true;
          activeCloudTierRef.current = 'firebase';
          markFirestoreUnavailable(false);
          if (appHasMeaningfulCloudState && !isRestoringFirestoreRef.current) {
            isCloudAuthoritativeHydratedRef.current = true;
            applyIncomingRemoteDataRef.current(assembled, { fromRealtimePeer: false, authoritativeCloud: true });
          }

          setIsCloudBillsLoading(false);
          isRemoteSyncDone.current = true;
          reportCloudSyncSuccess(`Cloud synced (${reason})`);
          return { ok: true };
        } catch (err: any) {
          if (isQuotaRelatedError(err)) {
            quotaExhaustedRef.current = true;
            markFirestoreQuotaExhausted(true);
          } else {
            markFirestoreUnavailable(true);
          }
          // Silent automatic fallback: Tier 2 (Supabase) -> Tier 3 (/api/sync + localStorage/IndexedDB)
          await pullFromSecondaryCloudThenLocal(reason);
          return { ok: true };
        }
      };

      const promise = runPull().finally(() => {
        if (inFlightCloudPullRef.current === promise) {
          inFlightCloudPullRef.current = null;
        }
      });
      inFlightCloudPullRef.current = promise;
      return promise;
    },
    [pullFromSecondaryCloudThenLocal]
  );

  // Multi-Tier Cloud-Only Background Recovery:
  // Continuously retries any in-memory queues across secondary cloud nodes and probes Tier-0 Firestore recovery.
  const flushFirestoreRetryQueue = useCallback(async () => {
    if (isFlushingRetryQueueRef.current || isRestoringFirestoreRef.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    isFlushingRetryQueueRef.current = true;
    try {
      // 1. Flush any in-memory /api/sync server hub retry queue items
      await flushServerSyncRetryQueue().catch(() => {});

      // 2. Flush any strictly in-memory failover queue across priority cloud nodes (Firebase Mirror -> Supabase -> Object/DB Clouds -> /api/sync)
      if (hasPendingInMemoryFailoverQueue()) {
        const flushedSecondary = await flushInMemoryFailoverQueue(clientSyncIdRef.current).catch(() => false);
        if (flushedSecondary && activeCloudTierRef.current === 'in_memory') {
          activeCloudTierRef.current = 'secondary_cloud';
        }
      }

      // 3. Probe Tier-0 (Primary Firebase Firestore) recovery if cooldown elapsed
      const q = firestoreRetryQueueRef.current;
      const hasQueuedWork =
        Object.keys(q.patch).length > 0 ||
        q.deletedBillIds.length > 0 ||
        q.updatedBillIds.length > 0;

      if ((hasQueuedWork || quotaExhaustedRef.current || activeCloudTierRef.current !== 'firebase') && !isFirestoreInFallbackCooldown()) {
        const recovered = await probeFirestoreQuotaRecovery();
        if (recovered) {
          quotaExhaustedRef.current = false;
          markFirestoreUnavailable(false);
          activeCloudTierRef.current = 'firebase';

          if (!hasQueuedWork) {
            await pullLatestFromFirestore('tier1-recovery-silent');
          } else {
            const snapshotPatch = { ...q.patch };
            const snapshotDeleted = [...q.deletedBillIds];
            const billById = new Map(storedBillsRef.current.map((b) => [b.id, b]));
            const snapshotUpdatedBills = q.updatedBillIds
              .map((bid) => billById.get(bid))
              .filter((b): b is StoredBill => Boolean(b));

            const ok = await commitFirestorePatchToCloud(snapshotPatch, snapshotUpdatedBills, snapshotDeleted, {
              fromRetryQueue: true
            });

            if (ok) {
              if (firestoreRetryQueueRef.current.queuedAt <= q.queuedAt) {
                clearFirestoreRetryQueue();
              }
              saveCloudFailoverConfig({
                primaryCloudStatus: 'online',
                secondaryCloudStatus: 'standby'
              });
              reportCloudSyncSuccess('Background cloud recovery synced');
            }
          }
        }
      }

      // 4. Probe Supabase recovery and flush any in-memory Supabase retry queue if cooldown elapsed
      if (!isSupabaseUnavailable() && (activeCloudTierRef.current !== 'firebase' || !isFirestoreInFallbackCooldown())) {
        const flushedSupa = await flushSupabaseRetryQueue(clientSyncIdRef.current).catch(() => false);
        if (activeCloudTierRef.current === 'in_memory' || (flushedSupa && activeCloudTierRef.current !== 'firebase')) {
          const supaHealthy = await probeSupabaseRecovery().catch(() => false);
          if (supaHealthy) {
            activeCloudTierRef.current = 'secondary_cloud';
            saveCloudFailoverConfig({
              secondaryCloudStatus: 'active',
              failoverProvider: 'supabase'
            });
          }
        }
      }
    } catch (err: any) {
      if (isQuotaRelatedError(err)) {
        quotaExhaustedRef.current = true;
        markFirestoreQuotaExhausted(true);
      } else {
        markFirestoreUnavailable(true);
      }
    } finally {
      isFlushingRetryQueueRef.current = false;
    }
  }, [clearFirestoreRetryQueue, commitFirestorePatchToCloud, flushServerSyncRetryQueue, pullLatestFromFirestore]);

  // Pull latest authoritative cloud state immediately upon user login
  const prevLoginUserKeyRef = useRef<string | null>(
    currentUser ? `${currentUser.username || ''}::${(currentUser as any).id || ''}` : null
  );
  useEffect(() => {
    const nextKey = currentUser ? `${currentUser.username || ''}::${(currentUser as any).id || ''}` : null;
    if (nextKey && nextKey !== prevLoginUserKeyRef.current) {
      prevLoginUserKeyRef.current = nextKey;
      pullLatestFromFirestore('login');
    } else if (!nextKey) {
      prevLoginUserKeyRef.current = null;
    }
  }, [currentUser, pullLatestFromFirestore]);

  // 1. Live real-time listener from Firebase Firestore Cloud Database, Server SSE (/api/sync/stream), and BroadcastChannel
  useEffect(() => {

    let unsubAppData: (() => void) | undefined;
    let unsubBillsCol: (() => void) | undefined;
    let sseSource: EventSource | null = null;
    const bootSyncUnlockTimer = setTimeout(() => {
      isRemoteSyncDone.current = true;
    }, 6000);

    // Immediately pull authoritative Cloud Firestore state on startup
    pullLatestFromFirestore('startup');

    // A. Setup BroadcastChannel for instant zero-latency cross-tab synchronization
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('polycables_live_sync_channel');
        bc.onmessage = (ev) => {
          const msg = ev.data;
          if (msg && msg.type === 'sync_update' && msg.senderId !== clientSyncIdRef.current && msg.patch) {
            applyIncomingRemoteData(msg.patch, true);
          }
        };
        broadcastChannelRef.current = bc;
      }
    } catch {}

    const pushFullSeedToServer = () => {
      const filterActive = (arr: any[]) => {
        if (!Array.isArray(arr)) return arr;
        return arr.filter((x: any) => {
          if (!x) return false;
          const candidates = [x.id, x._id];
          for (const c of candidates) {
            if (c && isGloballyDeletedId(c)) return false;
          }
          return true;
        });
      };
      const isLocalItemsCleared = localStorage.getItem('polycables_items_cleared') === 'true';
      const activeSeedItems = isLocalItemsCleared ? [] : filterActive(itemsRef.current);
      let seedOrderedCats: any = undefined;
      let seedCustomCats: any = undefined;
      let seedDeletedCats: any = undefined;
      let seedPriceSnapshots: any = undefined;
      try {
        const ocRaw = localStorage.getItem('polycables_ordered_categories');
        if (ocRaw) seedOrderedCats = JSON.parse(ocRaw);
        const ccRaw = localStorage.getItem('polycables_custom_categories');
        if (ccRaw) seedCustomCats = JSON.parse(ccRaw);
        const dcRaw = localStorage.getItem('polycables_deleted_categories');
        if (dcRaw) seedDeletedCats = JSON.parse(dcRaw);
        const psRaw = localStorage.getItem('polycables_price_snapshots');
        if (psRaw) seedPriceSnapshots = JSON.parse(psRaw);
      } catch {}
      const fullSnapshot = {
        items: activeSeedItems,
        specialItems: activeSeedItems.filter((it: any) => it?.isSpecialItem),
        itemsVersion: localItemsVersionRef.current || Date.now(),
        _itemsCleared: isLocalItemsCleared,
        ...(isLocalItemsCleared ? { _forceEmpty: true } : {}),
        ...(Array.isArray(seedOrderedCats) ? { orderedCategories: seedOrderedCats } : {}),
        ...(Array.isArray(seedCustomCats) ? { customCategories: seedCustomCats } : {}),
        ...(Array.isArray(seedDeletedCats) ? { deletedCategories: seedDeletedCats } : {}),
        categoryNumbers: getCategoryNumbers(),
        parties: filterActive(partiesRef.current),
        salespersons: filterActive(salespersonsRef.current),
        storedBills: filterActive(storedBillsRef.current),
        factoryImports: filterActive(factoryImportsRef.current),
        stockReturns: filterActive(stockReturnsRef.current),
        deliveryChallans: filterActive(deliveryChallansRef.current),
        colorExchanges: filterActive(colorExchangesRef.current),
        expenses: filterActive(expensesRef.current),
        conveyances: filterActive(conveyancesRef.current),
        collections: filterActive(collectionsRef.current),
        bankDeposits: filterActive(bankDepositsRef.current),
        branches: filterActive(branchesRef.current),
        requisitions: filterActive(requisitionsRef.current),
        bankList: bankListRef.current,
        accountList: accountListRef.current,
        closings: filterActive(closingsRef.current),
        deletedAutoDeposits: deletedAutoDepositIdsRef.current,
        company: companyRef.current,
        ...(Array.isArray(seedPriceSnapshots) ? { priceSnapshots: seedPriceSnapshots } : {}),
        deletedEntityIds: getGlobalDeletedIds()
      };
      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientSyncIdRef.current,
          patch: fullSnapshot
        })
      }).catch(() => {});
    };

    const reconcileItemsFromApi = () => {
      fetch('/api/items')
        .then((r) => (r.ok ? r.json() : null))
        .then((res) => {
          if (!res || !res.success) return;
          if (Date.now() - (localSliceModifiedAtRef.current.items || 0) < 3500) return;
          const serverVer = Number(res.itemsVersion || 0);
          const serverCleared = Boolean(res.itemsCleared);
          const serverItems = Array.isArray(res.items) ? res.items : [];
          if (serverCleared || serverItems.length > 0 || serverVer > (localItemsVersionRef.current || 0)) {
            applyIncomingRemoteData({
              items: serverItems,
              specialItems: Array.isArray(res.specialItems) ? res.specialItems : serverItems.filter((i: any) => i?.isSpecialItem),
              itemsVersion: serverVer,
              _itemsCleared: serverCleared,
              _forceEmpty: serverCleared,
              _replaceItems: true,
              ...(Array.isArray(res.orderedCategories) ? { orderedCategories: res.orderedCategories } : {}),
              ...(Array.isArray(res.customCategories) ? { customCategories: res.customCategories } : {}),
              ...(Array.isArray(res.deletedCategories) ? { deletedCategories: res.deletedCategories } : {}),
              ...(res.categoryNumbers ? { categoryNumbers: res.categoryNumbers } : {}),
              ...(Array.isArray(res.deletedEntityIds) ? { deletedEntityIds: res.deletedEntityIds } : {}),
              ...(Array.isArray(res.priceSnapshots) ? { priceSnapshots: res.priceSnapshots } : {}),
              ...(typeof res.activeEffectiveDate === 'string' ? { activeEffectiveDate: res.activeEffectiveDate } : {})
            }, false);
          }
        })
        .catch(() => {});
    };

    fetch('/api/sync', { cache: 'no-store' })
      .then((r) => r.json())
      .then((res) => {
        if (res?.version) {
          noteServerVersion(res.version);
        }
        if (isCloudAuthoritativeHydratedRef.current) return;
        if (res && res.success && res.data && typeof res.data === 'object') {
          const timeSinceRestore = Date.now() - (lastRestoreTimestampRef.current || 0);
          const isRecentlyRestored = timeSinceRestore < 4000;

          if (!isRecentlyRestored && Array.isArray(res.data.deletedEntityIds)) {
            replaceGlobalDeletedIds(res.data.deletedEntityIds);
          }
          // Check if remote data is initialized and contains meaningful records
          const remoteKeys = Object.keys(res.data).filter((k) => !k.startsWith('_'));
          const hasMeaningfulData = remoteKeys.some((k) => {
            const v = res.data[k];
            return Array.isArray(v) ? v.length > 0 : Boolean(v && typeof v === 'object' && Object.keys(v).length > 0);
          });

          if (res.data._syncProtocolVersion === 2 && (hasMeaningfulData || res.data._itemsCleared === true)) {
            if (!isCloudAuthoritativeHydratedRef.current) {
              applyIncomingRemoteData(res.data, false);
              reconcileItemsFromApi();
            }
          }
        }
      })
      .catch((err) => {
        console.warn('Initial server sync fetch offline/error:', err);
      });

    let sseReconnectCount = 0;
    let lastSseErrorPullAt = 0;
    try {
      if (typeof EventSource !== 'undefined') {
        sseSource = new EventSource('/api/sync/stream');
        sseSource.addEventListener('open', () => {
          sseReconnectCount++;
          if (sseReconnectCount > 1) {
            pullFromServerSyncFallback('sse-reconnect');
          }
        });
        sseSource.addEventListener('connected', (ev: MessageEvent) => {
          try {
            const payload = JSON.parse(ev.data);
            const srvVer = Number(payload?.version || 0);
            const hadVersion = lastServerVersionRef.current > 0;
            const hasGap = hadVersion && srvVer > lastServerVersionRef.current;
            if (sseReconnectCount > 1 || hasGap) {
              pullFromServerSyncFallback('sse-reconnect');
            } else {
              noteServerVersion(srvVer);
            }
          } catch {
            if (sseReconnectCount > 1) {
              pullFromServerSyncFallback('sse-reconnect');
            }
          }
        });
        sseSource.addEventListener('error', () => {
          const now = Date.now();
          if (now - lastSseErrorPullAt >= 4000) {
            lastSseErrorPullAt = now;
            pullFromServerSyncFallback('sse-error-fallback');
          }
        });
        sseSource.addEventListener('sync', (ev: MessageEvent) => {
          try {
            const payload = JSON.parse(ev.data);
            if (payload?.version) {
              noteServerVersion(payload.version);
            }
            if (payload && payload.senderId !== clientSyncIdRef.current) {
              if (payload.type === 'cloud_failover_update' && payload.config) {
                applyRemoteCloudFailoverConfig(payload.config);
                return;
              }
              if (payload.type === 'sync_delete' && Array.isArray(payload.deletedEntityIds)) {
                purgeDeletedFromStateAndStorage(payload.deletedEntityIds);
                if (payload.itemsCleared === true) {
                  try {
                    localStorage.setItem('polycables_items_cleared', 'true');
                  } catch {}
                  itemsRef.current = [];
                  lastSyncedSliceJsonRef.current.items = '[]';
                  isSyncingFromRemote.current = true;
                  setItems([]);
                  safeSetStorageItem('polycables_items', '[]', []);
                  safeSetStorageItem('polycables_special_items', '[]', []);
                  idbSaveFailoverData('polycables_items', []).catch(() => {});
                  idbSaveFailoverData('polycables_special_items', []).catch(() => {});
                  idbSaveFailoverData('polycables_permanent_special_items', []).catch(() => {});
                  setTimeout(() => {
                    isSyncingFromRemote.current = false;
                  }, 50);
                }
              } else if (payload.type === 'sync_restore') {
                if (Array.isArray(payload.restoredEntityIds)) {
                  unrecordDeletedIdsLocally(payload.restoredEntityIds);
                  removeIdsFromAllTrashStorages(payload.restoredEntityIds);
                }
                if (payload.restoredItems && typeof payload.restoredItems === 'object') {
                  applyIncomingRemoteData(payload.restoredItems, true);
                } else if (payload.patch && typeof payload.patch === 'object') {
                  applyIncomingRemoteData(payload.patch, true);
                }
              } else if (payload.patch && typeof payload.patch === 'object') {
                applyIncomingRemoteData(payload.patch, true);
              }
            } else if (payload?.type === 'cloud_failover_update' && payload.config) {
              applyRemoteCloudFailoverConfig(payload.config);
            }
          } catch {}
        });
      }
    } catch {}

    // C. Firebase Firestore real-time subscription on 'store' collection (receives ONLY changed slice_<key> docs)
    try {
      unsubAppData = onSnapshot(
        collection(db, 'store'),
        (colSnap) => {
          if (isRestoringFirestoreRef.current) {
            setIsCloudBillsLoading(false);
            return;
          }
          const isFromServer = !colSnap.metadata?.fromCache;
          const docMap = new Map<string, Record<string, any>>();
          colSnap.docs.forEach((d) => {
            docMap.set(d.id, d.data() || {});
          });

          if (docMap.size === 0) {
            setIsCloudBillsLoading(false);
            isRemoteSyncDone.current = true;
            return;
          }

          const resolveSliceValueFromMap = (sk: string, sData: Record<string, any>) => {
            if (sData?._chunked && Number(sData.chunkCount) > 0) {
              const count = Number(sData.chunkCount);
              const combined: any[] = [];
              for (let idx = 0; idx < count; idx++) {
                const cData = docMap.get(`slice_${sk}_${idx}`);
                if (cData && Array.isArray(cData.value)) {
                  combined.push(...cData.value);
                }
              }
              return combined;
            }
            return sData?.value;
          };

          const changes = colSnap.docChanges();
          const alreadyHydrated = hasHydratedStoreRef.current;

          if (alreadyHydrated && changes.length > 0) {
            // Incremental update: apply ONLY changed slice documents from remote peers
            const changedSliceKeys = new Set<string>();
            let appDataChanged = false;
            for (const chg of changes) {
              if (chg.type === 'removed') continue;
              const id = chg.doc.id;
              if (id === 'app_data') {
                appDataChanged = true;
              } else if (id.startsWith('slice_')) {
                const chunkMatch = id.match(/^slice_(.+)_(\d+)$/);
                changedSliceKeys.add(chunkMatch ? chunkMatch[1] : id.slice('slice_'.length));
              }
            }

            const patch: Record<string, any> = {};
            let hasRemoteChanges = false;

            let bestChangedSnapVer = -1;
            for (const sk of changedSliceKeys) {
              const sData = docMap.get(`slice_${sk}`);
              if (!sData) continue;
              if (sData._senderId && sData._senderId === clientSyncIdRef.current) continue;
              const remoteVer = Number(sData.version || 0);
              const localVer = Number(lastFetchedSliceVersionsRef.current[sk] || 0);
              if (remoteVer && remoteVer <= localVer) continue;
              if (remoteVer) lastFetchedSliceVersionsRef.current[sk] = remoteVer;

              const val = resolveSliceValueFromMap(sk, sData);
              if (sk === 'deletedEntityIds') {
                if (Array.isArray(val)) {
                  patch.deletedEntityIds = val;
                  hasRemoteChanges = true;
                }
                continue;
              }
              if (sk === 'priceSnapshots' || sk === 'price_snapshots') {
                if (remoteVer >= bestChangedSnapVer) {
                  bestChangedSnapVer = remoteVer;
                  patch.priceSnapshots = val;
                  hasRemoteChanges = true;
                  if (typeof sData.activeEffectiveDate === 'string') {
                    patch.activeEffectiveDate = sData.activeEffectiveDate;
                  }
                }
                continue;
              }
              patch[sk] = val;
              hasRemoteChanges = true;
              if (sk === 'items') {
                if (typeof sData._itemsCleared === 'boolean') patch._itemsCleared = sData._itemsCleared;
                if (Number(sData.itemsVersion || 0) > 0) patch.itemsVersion = Number(sData.itemsVersion);
              }
            }

            if (appDataChanged) {
              const aData = docMap.get('app_data');
              if (aData && !(aData._senderId && aData._senderId === clientSyncIdRef.current)) {
                if (typeof aData._itemsCleared === 'boolean') patch._itemsCleared = aData._itemsCleared;
                if (Number(aData.itemsVersion || 0) > 0) patch.itemsVersion = Number(aData.itemsVersion);
                if (typeof aData.activeEffectiveDate === 'string') patch.activeEffectiveDate = aData.activeEffectiveDate;
                if (Array.isArray(aData.deletedEntityIds)) patch.deletedEntityIds = aData.deletedEntityIds;
                for (const [k, v] of Object.entries(aData)) {
                  if (k.startsWith('_') || k === 'sliceKeys' || k === 'sliceVersions') continue;
                  if (!docMap.has(`slice_${k}`) && !(k in patch)) {
                    patch[k] = v;
                  }
                }
                hasRemoteChanges = true;
              }
            }

            if (hasRemoteChanges) {
              if (!patch.storedBills) {
                setIsCloudBillsLoading(false);
              }
              if (isFromServer) {
                isCloudAuthoritativeHydratedRef.current = true;
                reportCloudSyncSuccess('Live cloud sync active');
              }
              applyIncomingRemoteData(patch, { fromRealtimePeer: false, authoritativeCloud: isFromServer });
            } else {
              setIsCloudBillsLoading(false);
              if (isFromServer) {
                reportCloudSyncSuccess('Live cloud sync active');
              }
            }
            return;
          }

          // Initial hydration from snapshot
          const assembled: Record<string, any> = {};
          const appData = docMap.get('app_data');
          if (appData && typeof appData === 'object') {
            knownAppDocIsSlicedRef.current = Boolean(appData._sliced);
            if (Array.isArray(appData.sliceKeys)) {
              knownSliceKeysRef.current = Array.from(new Set([...knownSliceKeysRef.current, ...appData.sliceKeys]));
            }
            if (typeof appData._itemsCleared === 'boolean') assembled._itemsCleared = appData._itemsCleared;
            if (Number(appData.itemsVersion || 0) > 0) assembled.itemsVersion = Number(appData.itemsVersion);
            if (typeof appData.activeEffectiveDate === 'string') assembled.activeEffectiveDate = appData.activeEffectiveDate;
            for (const [k, v] of Object.entries(appData)) {
              if (k.startsWith('_') || k === 'sliceKeys' || k === 'sliceVersions') continue;
              assembled[k] = v;
            }
          }

          let bestInitSnapVer = -1;
          for (const [docId, sData] of docMap.entries()) {
            if (!docId.startsWith('slice_') || /^slice_(.+)_(\d+)$/.test(docId)) continue;
            const sk = docId.slice('slice_'.length);
            const ver = Number(sData?.version || Date.now());
            lastFetchedSliceVersionsRef.current[sk] = ver;
            const val = resolveSliceValueFromMap(sk, sData);
            if (sk === 'deletedEntityIds') {
              if (Array.isArray(val)) {
                assembled.deletedEntityIds = Array.from(
                  new Set([...(Array.isArray(assembled.deletedEntityIds) ? assembled.deletedEntityIds : []), ...val])
                );
              }
              continue;
            }
            if (sk === 'priceSnapshots' || sk === 'price_snapshots') {
              knownSliceKeysRef.current = Array.from(new Set([...knownSliceKeysRef.current, 'priceSnapshots']));
              if (ver >= bestInitSnapVer) {
                bestInitSnapVer = ver;
                assembled.priceSnapshots = val;
                delete assembled.price_snapshots;
                if (typeof sData.activeEffectiveDate === 'string') {
                  assembled.activeEffectiveDate = sData.activeEffectiveDate;
                }
              }
              continue;
            }
            knownSliceKeysRef.current = Array.from(new Set([...knownSliceKeysRef.current, sk]));
            assembled[sk] = val;
            if (sk === 'items') {
              if (typeof sData._itemsCleared === 'boolean') assembled._itemsCleared = sData._itemsCleared;
              if (Number(sData.itemsVersion || 0) > 0) assembled.itemsVersion = Number(sData.itemsVersion);
            }
          }

          hasHydratedStoreRef.current = true;
          if (!assembled.storedBills) {
            setIsCloudBillsLoading(false);
          }
          if (isFromServer) {
            isCloudAuthoritativeHydratedRef.current = true;
            reportCloudSyncSuccess('Live cloud sync active');
          }
          if (Object.keys(assembled).length > 0) {
            applyIncomingRemoteData(assembled, { fromRealtimePeer: false, authoritativeCloud: isFromServer });
          }
        },
        (error: any) => {
          const msg = error?.message || String(error);
          if (
            error?.code === 'resource-exhausted' ||
            msg.includes('resource-exhausted') ||
            msg.includes('Quota limit exceeded')
          ) {
            quotaExhaustedRef.current = true;
            markFirestoreQuotaExhausted(true);
          } else {
            markFirestoreUnavailable(true);
            handleFirestoreError(error, OperationType.GET, 'store', 'Live Cloud Subscription');
          }
          pullFromSecondaryCloudThenLocal('firestore-store-error');
          setIsCloudBillsLoading(false);
          isRemoteSyncDone.current = true;
        }
      );
    } catch (e: any) {
      markFirestoreUnavailable(true);
      handleFirestoreError(e, OperationType.GET, 'store', 'Live Cloud Subscription Setup');
      pullFromSecondaryCloudThenLocal('firestore-store-setup-error');
      setIsCloudBillsLoading(false);
      isRemoteSyncDone.current = true;
    }

    // Safety fallback: ensure isCloudBillsLoading is never stuck longer than 4 seconds
    const billsLoadingSafetyTimer = setTimeout(() => {
      setIsCloudBillsLoading(false);
    }, 4000);

    // 2. Real-time listener for the dedicated 'stored_bills' collection
    try {
      unsubBillsCol = onSnapshot(
        collection(db, 'stored_bills'),
        (colSnap) => {
          if (isRestoringFirestoreRef.current) {
            setIsCloudBillsLoading(false);
            return;
          }
          const lastLocalBillMod = localSliceModifiedAtRef.current.storedBills || 0;
          if (
            'storedBills' in pendingCloudDataRef.current ||
            'storedBills' in pendingFirestoreDataRef.current ||
            pendingFirestoreBillUpsertsRef.current.size > 0 ||
            pendingFirestoreBillDeletesRef.current.size > 0 ||
            Date.now() - lastLocalBillMod < 1500
          ) {
            setIsCloudBillsLoading(false);
            return;
          }

          // Propagate single-bill deletions cleanly from Firestore docChanges() without rewriting app_data
          if (!colSnap.metadata?.fromCache) {
            const removedIds = colSnap
              .docChanges()
              .filter((chg) => chg.type === 'removed' && chg.doc?.id)
              .map((chg) => String(chg.doc.id));
            if (removedIds.length > 0) {
              purgeDeletedFromStateAndStorage(removedIds);
            }
          }

          if (!colSnap.empty) {
            let trashedBillIds = new Set<string>();
            try {
              const rawTrashed = localStorage.getItem('polycables_trashed_bills');
              if (rawTrashed) {
                const parsed = JSON.parse(rawTrashed);
                if (Array.isArray(parsed)) {
                  parsed.forEach((tb: any) => {
                    if (tb?.id) trashedBillIds.add(tb.id);
                    if (tb?.data?.id) trashedBillIds.add(tb.data.id);
                  });
                }
              }
            } catch {}

            // Actively purge any orphaned Firestore doc that has been tombstoned or trashed
            if (!quotaExhaustedRef.current && !isFirestoreQuotaExhausted()) {
              colSnap.docs.forEach((d) => {
                if (isGloballyDeletedId(d.id) || trashedBillIds.has(d.id)) {
                  deleteDoc(doc(db, 'stored_bills', d.id)).catch(() => {});
                }
              });
            }

            const rawDocs = colSnap.docs
              .map((d) => d.data() as StoredBill)
              .filter((b) => b && b.id && b.header && !trashedBillIds.has(b.id) && !isGloballyDeletedId(b.id));

            if (rawDocs.length > 0) {
              let didUpdateBills = false;
              setStoredBills((prev) => {
                const localMap = new Map<string, StoredBill>();
                const localCopyMap = new Map<string, { receivedCopy?: string; receivedCopyName?: string; receivedCopyDate?: string }>();
                prev.forEach((b) => {
                  if (!b || !b.id) return;
                  localMap.set(b.id, b);
                  const rc = b.receivedCopy || b.header?.receivedCopy;
                  if (rc) {
                    localCopyMap.set(b.id, {
                      receivedCopy: rc,
                      receivedCopyName: b.receivedCopyName || b.header?.receivedCopyName,
                      receivedCopyDate: b.receivedCopyDate || b.header?.receivedCopyDate
                    });
                  }
                });

                const parseBillTs = (val: any) => {
                  if (!val) return 0;
                  if (typeof val === 'number') return val;
                  const ms = Date.parse(String(val));
                  return isNaN(ms) ? 0 : ms;
                };

                const billMap = new Map<string, StoredBill>();
                rawDocs.forEach((rb) => {
                  if (!rb || !rb.id || isGloballyDeletedId(rb.id) || trashedBillIds.has(rb.id)) return;
                  const existing = localMap.get(rb.id);
                  const localCopy = localCopyMap.get(rb.id);
                  const effectiveCopy = rb.receivedCopy || rb.header?.receivedCopy || localCopy?.receivedCopy;
                  const effectiveCopyName = rb.receivedCopyName || rb.header?.receivedCopyName || localCopy?.receivedCopyName;
                  const effectiveCopyDate = rb.receivedCopyDate || rb.header?.receivedCopyDate || localCopy?.receivedCopyDate;

                  const localTs = parseBillTs((existing as any)?.updatedAt) || parseBillTs((existing?.header as any)?.updatedAt) || parseBillTs(existing?.savedAt);
                  const remoteTs = parseBillTs((rb as any)?.updatedAt) || parseBillTs((rb?.header as any)?.updatedAt) || parseBillTs(rb?.savedAt);
                  const useLocal = Boolean(existing && (!remoteTs || (localTs && localTs > remoteTs)));
                  const winner = useLocal && existing ? existing : rb;

                  billMap.set(rb.id, {
                    ...(useLocal ? rb : (existing || {})),
                    ...winner,
                    receivedCopy: effectiveCopy,
                    receivedCopyName: effectiveCopyName,
                    receivedCopyDate: effectiveCopyDate,
                    header: {
                      ...(useLocal ? (rb.header || {}) : (existing?.header || {})),
                      ...(winner.header || {}),
                      partyName: winner.header?.partyName || '',
                      receivedCopy: effectiveCopy,
                      receivedCopyName: effectiveCopyName,
                      receivedCopyDate: effectiveCopyDate
                    } as BillHeader
                  });
                });

                // Authoritative parity across all PCs & mobile: when reading live server collection, only retain unsynced local bills created in the last 10s
                const isAuthoritativeSnap = !colSnap.metadata?.fromCache;
                const nowSnapMs = Date.now();
                prev.forEach((b) => {
                  if (!b || !b.id || billMap.has(b.id) || isGloballyDeletedId(b.id) || trashedBillIds.has(b.id)) return;
                  if (isAuthoritativeSnap) {
                    const createdRecentlyTs = recentlyCreatedLocalIdsRef.current.get(String(b.id)) || 0;
                    if (nowSnapMs - createdRecentlyTs < 10000) {
                      billMap.set(b.id, b);
                    }
                  } else {
                    billMap.set(b.id, b);
                  }
                });

                const combined = deduplicateBills(Array.from(billMap.values()));
                if (
                  prev.length === combined.length &&
                  prev.every((b, i) => b.id === combined[i]?.id && b.savedAt === combined[i]?.savedAt && (b as any).updatedAt === (combined[i] as any)?.updatedAt)
                ) {
                  return prev;
                }
                didUpdateBills = true;
                isSyncingFromRemote.current = true;
                storedBillsRef.current = combined;
                lastSyncedSliceJsonRef.current.storedBills = JSON.stringify(combined);
                try {
                  idbSaveFailoverData('polycables_stored_bills', combined).catch(() => {});
                  const nextStr = lastSyncedSliceJsonRef.current.storedBills;
                  const localPayload = nextStr.length <= 1200000 ? nextStr : JSON.stringify(buildLightStoredBillsForStorage(combined));
                  safeSetStorageItem('polycables_stored_bills', localPayload, combined);
                } catch {}
                return combined;
              });
              if (didUpdateBills) {
                scheduleUnlockRemoteSync(80);
              }
              setIsCloudBillsLoading(false);
            } else {
              setIsCloudBillsLoading(false);
            }
          } else {
            setIsCloudBillsLoading(false);
          }
        },
        (colErr: any) => {
          setIsCloudBillsLoading(false);
          const msg = colErr?.message || String(colErr);
          if (
            colErr?.code === 'resource-exhausted' ||
            msg.includes('resource-exhausted') ||
            msg.includes('Quota limit exceeded')
          ) {
            quotaExhaustedRef.current = true;
            markFirestoreQuotaExhausted(true);
          } else {
            markFirestoreUnavailable(true);
            handleFirestoreError(colErr, OperationType.LIST, 'stored_bills', 'Live Bills Subscription');
          }
          pullFromSecondaryCloudThenLocal('firestore-bills-error');
        }
      );
    } catch (colEx: any) {
      setIsCloudBillsLoading(false);
      markFirestoreUnavailable(true);
      handleFirestoreError(colEx, OperationType.LIST, 'stored_bills', 'Live Bills Subscription Setup');
      pullFromSecondaryCloudThenLocal('firestore-bills-setup-error');
    }

    // Refresh authoritative Cloud sync on tab resume / focus / reconnect (throttled Firestore server pulls to save quota)
    let lastResumeSyncAt = 0;
    const triggerResumeSyncFetch = (forceOnlinePull: boolean = false) => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (!forceOnlinePull && now - lastResumeSyncAt < 1500) return;
      lastResumeSyncAt = now;
      pullFromServerSyncFallback(forceOnlinePull ? 'online-reconnect' : 'tab-focus');
      if (forceOnlinePull || now - lastFirestorePullAtRef.current >= 15000) {
        pullLatestFromFirestore(forceOnlinePull ? 'online-reconnect' : 'tab-focus', false);
      }
      flushFirestoreRetryQueue();
    };
    const handleOnlineReconnect = () => triggerResumeSyncFetch(true);
    const handleFocusOrVisibility = () => triggerResumeSyncFetch(false);
    window.addEventListener('focus', handleFocusOrVisibility);
    window.addEventListener('online', handleOnlineReconnect);
    document.addEventListener('visibilitychange', handleFocusOrVisibility);

    // Flush any queued Firestore writes persisted from a previous tab session shortly after boot
    const startupQueueFlushTimer = setTimeout(() => {
      flushFirestoreRetryQueue();
    }, 2500);

    // Lightweight 4-second visible-tab version heartbeat: checks /api/sync/status (~250 bytes, zero Firestore reads)
    // and only fetches /api/sync if another device incremented server version (catches dropped mobile/NAT SSE streams immediately)
    let lastRetryCheckAt = Date.now();
    let isStatusPollInFlight = false;
    const backgroundRecoveryInterval = setInterval(async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      const now = Date.now();
      if (!isStatusPollInFlight) {
        isStatusPollInFlight = true;
        try {
          const st = await fetch('/api/sync/status', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null));
          const srvVer = Number(st?.version || 0);
          if (srvVer > lastServerVersionRef.current) {
            await pullFromServerSyncFallback('realtime-version-poll');
          }
        } catch {
        } finally {
          isStatusPollInFlight = false;
        }
      }

      const hasQueuedItems =
        Object.keys(firestoreRetryQueueRef.current.patch).length > 0 ||
        firestoreRetryQueueRef.current.deletedBillIds.length > 0 ||
        firestoreRetryQueueRef.current.updatedBillIds.length > 0 ||
        Object.keys(serverSyncRetryQueueRef.current.patch).length > 0 ||
        hasPendingInMemoryFailoverQueue();

      const retryIntervalMs = hasQueuedItems ? 8000 : 30000;
      if (now - lastRetryCheckAt >= retryIntervalMs) {
        lastRetryCheckAt = now;
        flushFirestoreRetryQueue();
      }
    }, 4000);

    return () => {
      clearTimeout(bootSyncUnlockTimer);
      clearTimeout(billsLoadingSafetyTimer);
      clearTimeout(startupQueueFlushTimer);
      clearInterval(backgroundRecoveryInterval);
      window.removeEventListener('focus', handleFocusOrVisibility);
      window.removeEventListener('online', handleOnlineReconnect);
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
      if (unsubAppData) unsubAppData();
      if (unsubBillsCol) unsubBillsCol();
      if (sseSource) sseSource.close();
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
        broadcastChannelRef.current = null;
      }
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      if (firestoreSyncTimeoutRef.current) clearTimeout(firestoreSyncTimeoutRef.current);
    };
  }, [pullLatestFromFirestore, pullFromServerSyncFallback, pullFromSecondaryCloudThenLocal, flushFirestoreRetryQueue, noteServerVersion]);

  // Automated Daily Cloud Backup Background Scheduler & Verification
  // Runs upon the first login of a new calendar day or checks once every 24 hours.
  // Packages all 14 core ERP modules and uploads directly to primary cloud storage & failover nodes.
  useEffect(() => {
    if (!currentUser) return;

    let isMounted = true;
    const runScheduledDailyCloudBackup = async () => {
      try {
        const st = getAutomatedBackupStatus();
        if (!st.enabled) return;
        if (st.isBackedUpToday) return;

        const res = await executeAutomatedDailyBackup(() => ({
          storedBills,
          items,
          parties,
          salespersons,
          collections,
          expenses,
          bankDeposits: effectiveBankDeposits,
          factoryImports,
          stockReturns,
          closings,
          deliveryChallans,
          colorExchanges,
          branches,
          requisitions,
          customCategories: (window as any)._customCategories || [],
          orderedCategories: (window as any)._orderedCategories || [],
          bankList: bankListRef.current && bankListRef.current.length > 0 ? bankListRef.current : defaultBanks,
          accountList: accountListRef.current && accountListRef.current.length > 0 ? accountListRef.current : defaultAccounts,
          company,
          header
        }), {
          notify: false,
          showToast: (msg, type) => {
            if (isMounted) {
              setAppToast({ text: msg, type: type || 'success' });
            }
          }
        });

        if (res && res.success && !res.skipped && isMounted) {
          setAppToast({
            text: `✓ Automated daily cloud backup completed (${res.dateKey})`,
            type: 'success'
          });
        }
      } catch (err) {
        console.warn('[AutoBackup Scheduler Warn]:', err);
      }
    };

    // Wait 3.5 seconds after login to allow state hydration from cloud/localStorage
    const bootTimer = setTimeout(() => {
      runScheduledDailyCloudBackup();
    }, 3500);

    // Periodic check every 30 minutes for calendar day transition
    const intervalTimer = setInterval(() => {
      runScheduledDailyCloudBackup();
    }, 30 * 60 * 1000);

    return () => {
      isMounted = false;
      clearTimeout(bootTimer);
      clearInterval(intervalTimer);
    };
  }, [currentUser]);

  // Listen for completed automated cloud backups across any tab or background trigger
  useEffect(() => {
    const handleBackupCompleted = (e: any) => {
      if (e.detail?.date) {
        setAppToast({
          text: `✓ Daily cloud backup snapshot verified (${e.detail.date})`,
          type: 'success'
        });
      }
    };
    window.addEventListener('polycables_auto_backup_completed', handleBackupCompleted);
    return () => window.removeEventListener('polycables_auto_backup_completed', handleBackupCompleted);
  }, []);

  // Listen to entity deleted & restored custom events across modules to trigger zero-delay sync
  useEffect(() => {
    const handleEntityDeleted = (ev: any) => {
      const detail = ev.detail;
      const ids = Array.isArray(detail?.ids) ? detail.ids : (detail?.id ? [detail.id] : []);
      if (ids.length > 0) {
        purgeDeletedFromStateAndStorage(ids);
      }
    };
    const handleEntityRestored = (ev: any) => {
      const detail = ev.detail;
      const ids = Array.isArray(detail?.ids) ? detail.ids : (detail?.id ? [detail.id] : []);
      if (ids.length > 0) {
        unrecordDeletedIdsLocally(ids);
      }
    };
    window.addEventListener('polycables_entity_deleted', handleEntityDeleted);
    window.addEventListener('polycables_entity_restored', handleEntityRestored);
    return () => {
      window.removeEventListener('polycables_entity_deleted', handleEntityDeleted);
      window.removeEventListener('polycables_entity_restored', handleEntityRestored);
    };
  }, []);

  // Sync storedBills changes automatically across LocalStorage, IndexedDB, and Cloud
  useEffect(() => {
    if (isSyncingFromRemote.current) return;
    if (!initialPersistSkippedRef.current.has('storedBills')) {
      initialPersistSkippedRef.current.add('storedBills');
      try { if (localStorage.getItem('polycables_stored_bills') !== null) return; } catch {}
    }
    const deduped = deduplicateBills(storedBills);
    const currentJson = JSON.stringify(deduped);
    if (lastSyncedSliceJsonRef.current.storedBills === currentJson) return;
    idbSaveFailoverData('polycables_stored_bills', deduped).catch(() => {});
    if (currentJson.length <= 1200000) {
      safeSetStorageItem('polycables_stored_bills', currentJson, deduped);
    } else {
      const lightBills = buildLightStoredBillsForStorage(deduped);
      safeSetStorageItem('polycables_stored_bills', JSON.stringify(lightBills), deduped);
    }
    if (!isRemoteSyncDone.current) {
      lastSyncedSliceJsonRef.current.storedBills = currentJson;
      return;
    }
    lastSyncedSliceJsonRef.current.storedBills = currentJson;
    localSliceModifiedAtRef.current.storedBills = Date.now();
    scheduleCloudSync({ storedBills: deduped }, true);
  }, [storedBills]);

  // 2. Save state to LocalStorage (safely with IndexedDB fallback) and live Cloud/Server Store whenever local state changes
  useEffect(() => {
    if (isSyncingFromRemote.current) return;
    if (!initialPersistSkippedRef.current.has('items')) {
      initialPersistSkippedRef.current.add('items');
      try {
        if (localStorage.getItem('polycables_items') !== null || !isRemoteSyncDone.current) return;
      } catch {}
    }
    if (!isRemoteSyncDone.current && !wasItemsLoadedFromStorageRef.current) {
      return;
    }
    const dedupedItems = sanitizeAndDeduplicateItems(items);
    if (dedupedItems.length !== items.length) {
      setItems(dedupedItems);
      return;
    }
    if (dedupedItems.length > 0) {
      try {
        localStorage.removeItem('polycables_items_cleared');
      } catch {}
    }
    const currentJson = JSON.stringify(dedupedItems);
    if (lastSyncedSliceJsonRef.current.items === currentJson) return;
    wasItemsLoadedFromStorageRef.current = true;
    safeSetStorageItem('polycables_items', currentJson, dedupedItems);
    const specialList = dedupedItems.filter((i) => i.isSpecialItem);
    safeSetStorageItem('polycables_special_items', JSON.stringify(specialList), specialList);
    idbSaveFailoverData('polycables_items', dedupedItems).catch(() => {});
    idbSaveFailoverData('polycables_special_items', specialList).catch(() => {});
    if (!isRemoteSyncDone.current) {
      lastSyncedSliceJsonRef.current.items = currentJson;
      return;
    }
    lastSyncedSliceJsonRef.current.items = currentJson;
    localSliceModifiedAtRef.current.items = Date.now();
    const nextVer = Math.max(Date.now(), (localItemsVersionRef.current || 0) + 1);
    localItemsVersionRef.current = nextVer;
    try {
      localStorage.setItem('polycables_items_version', String(nextVer));
      localStorage.setItem('polycables_items_version_applied', String(nextVer));
    } catch {}
    const isItemsCleared = dedupedItems.length === 0 && localStorage.getItem('polycables_items_cleared') === 'true';
    scheduleCloudSync(
      {
        items: dedupedItems,
        specialItems: specialList,
        _replaceItems: true,
        itemsVersion: nextVer,
        _itemsCleared: isItemsCleared,
        ...(isItemsCleared ? { _forceEmpty: true } : {})
      },
      true
    );
  }, [items]);

  useEffect(() => {
    if (isSyncingFromRemote.current) return;
    if (!initialPersistSkippedRef.current.has('parties')) {
      initialPersistSkippedRef.current.add('parties');
      try { if (localStorage.getItem('polycables_parties') !== null) return; } catch {}
    }
    const currentJson = JSON.stringify(parties);
    safeSetStorageItem('polycables_parties', currentJson, parties);
    if (!isRemoteSyncDone.current) {
      lastSyncedSliceJsonRef.current.parties = currentJson;
      return;
    }
    if (lastSyncedSliceJsonRef.current.parties !== currentJson) {
      lastSyncedSliceJsonRef.current.parties = currentJson;
      localSliceModifiedAtRef.current.parties = Date.now();
      scheduleCloudSync({ parties }, true);
    }
  }, [parties]);

  useEffect(() => {
    if (isSyncingFromRemote.current) return;
    if (!initialPersistSkippedRef.current.has('salespersons')) {
      initialPersistSkippedRef.current.add('salespersons');
      try { if (localStorage.getItem('polycables_salespersons') !== null) return; } catch {}
    }
    const currentJson = JSON.stringify(salespersons);
    safeSetStorageItem('polycables_salespersons', currentJson, salespersons);
    if (!isRemoteSyncDone.current) {
      lastSyncedSliceJsonRef.current.salespersons = currentJson;
      return;
    }
    if (lastSyncedSliceJsonRef.current.salespersons !== currentJson) {
      lastSyncedSliceJsonRef.current.salespersons = currentJson;
      localSliceModifiedAtRef.current.salespersons = Date.now();
      scheduleCloudSync({ salespersons }, true);
    }
  }, [salespersons]);

  useEffect(() => {
    if (isSyncingFromRemote.current) return;
    if (!initialPersistSkippedRef.current.has('factoryImports')) {
      initialPersistSkippedRef.current.add('factoryImports');
      try { if (localStorage.getItem('polycables_factory_imports') !== null) return; } catch {}
    }
    const currentJson = JSON.stringify(factoryImports);
    safeSetStorageItem('polycables_factory_imports', currentJson, factoryImports);
    if (!isRemoteSyncDone.current) {
      lastSyncedSliceJsonRef.current.factoryImports = currentJson;
      return;
    }
    if (lastSyncedSliceJsonRef.current.factoryImports !== currentJson) {
      lastSyncedSliceJsonRef.current.factoryImports = currentJson;
      localSliceModifiedAtRef.current.factoryImports = Date.now();
      scheduleCloudSync({ factoryImports }, true);
    }
    if (Date.now() - (lastRestoreTimestampRef.current || 0) >= 300000 && !isSyncingFromRemote.current && factoryImports.length > 0 && items.length > 0) {
      // Single-pass O(M) indexing of factory import quantities
      const qtyById = new Map<string, number>();
      const qtyByCode = new Map<string, number>();
      const qtyByName = new Map<string, number>();
      for (const ch of factoryImports) {
        if (!ch || !Array.isArray(ch.lines)) continue;
        for (const l of ch.lines) {
          const q = Number(l.quantity) || 0;
          if (!q) continue;
          if (l.itemId) qtyById.set(l.itemId, (qtyById.get(l.itemId) || 0) + q);
          if (l.itemCode) {
            const c = l.itemCode.toLowerCase().trim();
            if (c) qtyByCode.set(c, (qtyByCode.get(c) || 0) + q);
          }
          const n = ((l.itemName || (l as any).itemDescription || '')).toLowerCase().trim();
          if (n) qtyByName.set(n, (qtyByName.get(n) || 0) + q);
        }
      }
      setItems((prevItems) => {
        let changed = false;
        const updated = prevItems.map((item) => {
          const idQty = qtyById.get(item.id) || 0;
          const codeQty = (!idQty && item.code) ? (qtyByCode.get(item.code.toLowerCase().trim()) || 0) : 0;
          const nameQty = (!idQty && !codeQty && item.name) ? (qtyByName.get(item.name.toLowerCase().trim()) || 0) : 0;
          const calcQty = idQty || codeQty || nameQty;
          const currentAdded = Math.max(Number(item.addedStock) || 0, Number(item.importFactory) || 0);
          if (calcQty > currentAdded) {
            changed = true;
            return {
              ...item,
              addedStock: calcQty,
              importFactory: calcQty
            };
          }
          return item;
        });
        return changed ? updated : prevItems;
      });
    }
  }, [factoryImports]);

  useEffect(() => {
    if (isSyncingFromRemote.current) return;
    if (!initialPersistSkippedRef.current.has('stockReturns')) {
      initialPersistSkippedRef.current.add('stockReturns');
      try { if (localStorage.getItem('polycables_stock_returns') !== null) return; } catch {}
    }
    const currentJson = JSON.stringify(stockReturns);
    safeSetStorageItem('polycables_stock_returns', currentJson, stockReturns);
    if (!isRemoteSyncDone.current) {
      lastSyncedSliceJsonRef.current.stockReturns = currentJson;
      return;
    }
    if (lastSyncedSliceJsonRef.current.stockReturns !== currentJson) {
      lastSyncedSliceJsonRef.current.stockReturns = currentJson;
      localSliceModifiedAtRef.current.stockReturns = Date.now();
      scheduleCloudSync({ stockReturns }, true);
    }
  }, [stockReturns]);

  useEffect(() => {
    if (isSyncingFromRemote.current) return;
    if (!initialPersistSkippedRef.current.has('deliveryChallans')) {
      initialPersistSkippedRef.current.add('deliveryChallans');
      try { if (localStorage.getItem('polycables_delivery_challans') !== null) return; } catch {}
    }
    const currentJson = JSON.stringify(deliveryChallans);
    safeSetStorageItem('polycables_delivery_challans', currentJson, deliveryChallans);
    if (!isRemoteSyncDone.current) {
      lastSyncedSliceJsonRef.current.deliveryChallans = currentJson;
      return;
    }
    if (lastSyncedSliceJsonRef.current.deliveryChallans !== currentJson) {
      lastSyncedSliceJsonRef.current.deliveryChallans = currentJson;
      localSliceModifiedAtRef.current.deliveryChallans = Date.now();
      scheduleCloudSync({ deliveryChallans }, true);
    }
  }, [deliveryChallans]);

  useEffect(() => {
    if (isSyncingFromRemote.current) return;
    if (!initialPersistSkippedRef.current.has('colorExchanges')) {
      initialPersistSkippedRef.current.add('colorExchanges');
      try { if (localStorage.getItem('polycables_color_exchanges') !== null) return; } catch {}
    }
    const currentJson = JSON.stringify(colorExchanges);
    safeSetStorageItem('polycables_color_exchanges', currentJson, colorExchanges);
    if (!isRemoteSyncDone.current) {
      lastSyncedSliceJsonRef.current.colorExchanges = currentJson;
      return;
    }
    if (lastSyncedSliceJsonRef.current.colorExchanges !== currentJson) {
      lastSyncedSliceJsonRef.current.colorExchanges = currentJson;
      localSliceModifiedAtRef.current.colorExchanges = Date.now();
      scheduleCloudSync({ colorExchanges }, true);
    }
  }, [colorExchanges]);

  useEffect(() => {
    if (isSyncingFromRemote.current) return;
    if (!initialPersistSkippedRef.current.has('expenses')) {
      initialPersistSkippedRef.current.add('expenses');
      try { if (localStorage.getItem('polycables_expenses') !== null) return; } catch {}
    }
    const currentJson = JSON.stringify(expenses);
    safeSetStorageItem('polycables_expenses', currentJson, expenses);
    if (!isRemoteSyncDone.current) {
      lastSyncedSliceJsonRef.current.expenses = currentJson;
      return;
    }
    if (lastSyncedSliceJsonRef.current.expenses !== currentJson) {
      lastSyncedSliceJsonRef.current.expenses = currentJson;
      localSliceModifiedAtRef.current.expenses = Date.now();
      scheduleCloudSync({ expenses }, true);
    }
  }, [expenses]);

  useEffect(() => {
    if (isSyncingFromRemote.current) return;
    if (!initialPersistSkippedRef.current.has('conveyances')) {
      initialPersistSkippedRef.current.add('conveyances');
      try { if (localStorage.getItem('polycables_conveyances') !== null) return; } catch {}
    }
    const currentJson = JSON.stringify(conveyances);
    safeSetStorageItem('polycables_conveyances', currentJson, conveyances);
    idbSaveFailoverData('polycables_conveyances', conveyances).catch(() => {});
    if (!isRemoteSyncDone.current) {
      lastSyncedSliceJsonRef.current.conveyances = currentJson;
      return;
    }
    if (lastSyncedSliceJsonRef.current.conveyances !== currentJson) {
      lastSyncedSliceJsonRef.current.conveyances = currentJson;
      localSliceModifiedAtRef.current.conveyances = Date.now();
      scheduleCloudSync({ conveyances }, true);
    }
  }, [conveyances]);

  useEffect(() => {
    if (isSyncingFromRemote.current) return;
    if (!initialPersistSkippedRef.current.has('collections')) {
      initialPersistSkippedRef.current.add('collections');
      try { if (localStorage.getItem('polycables_collections') !== null) return; } catch {}
    }
    const currentJson = JSON.stringify(collections);
    safeSetStorageItem('polycables_collections', currentJson, collections);
    if (!isRemoteSyncDone.current) {
      lastSyncedSliceJsonRef.current.collections = currentJson;
      return;
    }
    if (lastSyncedSliceJsonRef.current.collections !== currentJson) {
      lastSyncedSliceJsonRef.current.collections = currentJson;
      localSliceModifiedAtRef.current.collections = Date.now();
      scheduleCloudSync({ collections }, true);
    }
  }, [collections]);

  useEffect(() => {
    if (isSyncingFromRemote.current) return;
    const cleanDeposits = (bankDeposits || []).filter(
      (d) => d && !d.isAutoDeposit && !String(d.id || '').startsWith('auto-ho-')
    );
    if (!initialPersistSkippedRef.current.has('bankDeposits')) {
      initialPersistSkippedRef.current.add('bankDeposits');
      try {
        if (localStorage.getItem('polycables_bank_deposits') !== null) {
          safeSetStorageItem('depositHistory', JSON.stringify(cleanDeposits), cleanDeposits);
          return;
        }
      } catch {}
    }
    const currentJson = JSON.stringify(cleanDeposits);
    safeSetStorageItem('polycables_bank_deposits', currentJson, cleanDeposits);
    safeSetStorageItem('depositHistory', currentJson, cleanDeposits);
    if (!isRemoteSyncDone.current) {
      lastSyncedSliceJsonRef.current.bankDeposits = currentJson;
      return;
    }
    if (lastSyncedSliceJsonRef.current.bankDeposits !== currentJson) {
      lastSyncedSliceJsonRef.current.bankDeposits = currentJson;
      localSliceModifiedAtRef.current.bankDeposits = Date.now();
      scheduleCloudSync({ bankDeposits: cleanDeposits }, true);
    }
  }, [bankDeposits]);

  useEffect(() => {
    const handleExternalDepositsUpdated = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      const incomingList: BankDeposit[] = Array.isArray(detail?.deposits)
        ? detail.deposits
        : detail?.deposit
        ? [detail.deposit]
        : [];
      if (incomingList.length === 0) return;

      setBankDeposits((prev) => {
        const cleanPrev = (prev || []).filter(
          (d) => d && !d.isAutoDeposit && !String(d.id || '').startsWith('auto-ho-')
        );
        const byId = new Map<string, BankDeposit>(cleanPrev.map((d) => [d.id, d]));
        let changed = false;
        incomingList.forEach((item) => {
          if (!item || !item.id || item.isAutoDeposit || String(item.id).startsWith('auto-ho-')) return;
          const existing = byId.get(item.id);
          if (!existing || (item.updatedAt && item.updatedAt !== existing.updatedAt)) {
            byId.set(item.id, item);
            changed = true;
          }
        });
        if (!changed) return prev;
        const incomingIds = new Set(incomingList.map((i) => i.id));
        const ordered = [
          ...incomingList.filter((i) => i && i.id && !i.isAutoDeposit && !String(i.id).startsWith('auto-ho-')),
          ...cleanPrev.filter((d) => !incomingIds.has(d.id))
        ];
        return ordered;
      });
    };

    window.addEventListener('polycables_deposits_updated', handleExternalDepositsUpdated);
    return () => window.removeEventListener('polycables_deposits_updated', handleExternalDepositsUpdated);
  }, []);

  useEffect(() => {
    if (isSyncingFromRemote.current) return;
    if (!initialPersistSkippedRef.current.has('branches')) {
      initialPersistSkippedRef.current.add('branches');
      try { if (localStorage.getItem('polycables_branches') !== null) return; } catch {}
    }
    const currentJson = JSON.stringify(branches);
    safeSetStorageItem('polycables_branches', currentJson, branches);
    if (!isRemoteSyncDone.current) {
      lastSyncedSliceJsonRef.current.branches = currentJson;
      return;
    }
    if (lastSyncedSliceJsonRef.current.branches !== currentJson) {
      lastSyncedSliceJsonRef.current.branches = currentJson;
      localSliceModifiedAtRef.current.branches = Date.now();
      scheduleCloudSync({ branches }, true);
    }
  }, [branches]);

  useEffect(() => {
    if (isSyncingFromRemote.current) return;
    if (!initialPersistSkippedRef.current.has('requisitions')) {
      initialPersistSkippedRef.current.add('requisitions');
      try { if (localStorage.getItem('polycables_requisitions') !== null) return; } catch {}
    }
    const currentJson = JSON.stringify(requisitions);
    safeSetStorageItem('polycables_requisitions', currentJson, requisitions);
    if (!isRemoteSyncDone.current) {
      lastSyncedSliceJsonRef.current.requisitions = currentJson;
      return;
    }
    if (lastSyncedSliceJsonRef.current.requisitions !== currentJson) {
      lastSyncedSliceJsonRef.current.requisitions = currentJson;
      localSliceModifiedAtRef.current.requisitions = Date.now();
      scheduleCloudSync({ requisitions }, true);
    }
  }, [requisitions]);

  useEffect(() => {
    if (isSyncingFromRemote.current) return;
    const currentJson = JSON.stringify(company);
    safeSetStorageItem('polycables_company', currentJson, company);
    if (!isRemoteSyncDone.current) {
      lastSyncedSliceJsonRef.current.company = currentJson;
      return;
    }
    if (lastSyncedSliceJsonRef.current.company !== currentJson) {
      lastSyncedSliceJsonRef.current.company = currentJson;
      localSliceModifiedAtRef.current.company = Date.now();
      scheduleCloudSync({ company }, true);
    }
  }, [company]);

  useEffect(() => {
    if (isSyncingFromRemote.current) return;
    const currentJson = JSON.stringify(deletedAutoDepositIds);
    safeSetStorageItem('polycables_deleted_auto_deposits', currentJson, deletedAutoDepositIds);
    if (!isRemoteSyncDone.current) {
      lastSyncedSliceJsonRef.current.deletedAutoDeposits = currentJson;
      return;
    }
    if (lastSyncedSliceJsonRef.current.deletedAutoDeposits !== currentJson) {
      lastSyncedSliceJsonRef.current.deletedAutoDeposits = currentJson;
      localSliceModifiedAtRef.current.deletedAutoDeposits = Date.now();
      scheduleCloudSync({ deletedAutoDeposits: deletedAutoDepositIds }, true);
    }
  }, [deletedAutoDepositIds]);

  useEffect(() => {
    if (isSyncingFromRemote.current) return;
    const currentJson = JSON.stringify(bankList);
    safeSetStorageItem('polycables_bank_list', currentJson, bankList);
    if (!isRemoteSyncDone.current) {
      lastSyncedSliceJsonRef.current.bankList = currentJson;
      return;
    }
    if (lastSyncedSliceJsonRef.current.bankList !== currentJson) {
      lastSyncedSliceJsonRef.current.bankList = currentJson;
      localSliceModifiedAtRef.current.bankList = Date.now();
      scheduleCloudSync({ bankList }, true);
    }
  }, [bankList]);

  useEffect(() => {
    if (isSyncingFromRemote.current) return;
    const currentJson = JSON.stringify(accountList);
    safeSetStorageItem('polycables_account_list', currentJson, accountList);
    if (!isRemoteSyncDone.current) {
      lastSyncedSliceJsonRef.current.accountList = currentJson;
      return;
    }
    if (lastSyncedSliceJsonRef.current.accountList !== currentJson) {
      lastSyncedSliceJsonRef.current.accountList = currentJson;
      localSliceModifiedAtRef.current.accountList = Date.now();
      scheduleCloudSync({ accountList }, true);
    }
  }, [accountList]);

  useEffect(() => {
    if (isSyncingFromRemote.current) return;
    const currentJson = JSON.stringify(closings);
    safeSetStorageItem('polycables_closings', currentJson, closings);
    if (!isRemoteSyncDone.current) {
      lastSyncedSliceJsonRef.current.closings = currentJson;
      return;
    }
    if (lastSyncedSliceJsonRef.current.closings !== currentJson) {
      lastSyncedSliceJsonRef.current.closings = currentJson;
      localSliceModifiedAtRef.current.closings = Date.now();
      scheduleCloudSync({ closings }, true);
    }
  }, [closings]);

  // Auto-fix unsaved / fuzzy item names in previous bills matching Master Item List (>= 70% name match + 100% price match)
  // Deferred & gated behind actual catalog additions/updates so startup renders instantaneously without main-thread stalls
  const lastAutoFixItemSigRef = useRef<string>(`${items.length}`);
  useEffect(() => {
    const sig = `${items.length}`;
    if (!isRemoteSyncDone.current) {
      lastAutoFixItemSigRef.current = sig;
      return;
    }
    if (sig === lastAutoFixItemSigRef.current) return;
    lastAutoFixItemSigRef.current = sig;
    if (isSyncingFromRemote.current || isRestoringFirestoreRef.current || Date.now() - lastRestoreTimestampRef.current < 15000) return;
    if (!items || items.length === 0 || !storedBillsRef.current || storedBillsRef.current.length === 0) return;
    const timer = setTimeout(() => {
      if (isSyncingFromRemote.current || isRestoringFirestoreRef.current || Date.now() - lastRestoreTimestampRef.current < 15000) return;
      const currentBills = storedBillsRef.current;
      const { fixedBills, totalFixedCount } = autoFixStoredBillsWithMasterCatalog(currentBills, items);
      if (totalFixedCount > 0) {
        setStoredBills(fixedBills);
        if (isRemoteSyncDone.current && !isSyncingFromRemote.current) {
          scheduleCloudSync({ storedBills: fixedBills });
        }
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [items]);

  // Start a fresh new bill
  const handleNewBill = (forceNewTab: boolean = false, isOfficeBill: boolean = false) => {
    const allowedBranches = withHeadOfficeForAdmin(
      filterBranchesForUser(branches, currentUser, salespersons),
      currentUser
    );
    const isSuperOrAcc = isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser) || isAnyAdmin(currentUser);
    const isSingleRestricted = !isSuperOrAcc && allowedBranches.length <= 1;
    const { branchId: userBranchId, branchName: userBranchName } = getUserBranch(currentUser, salespersons, allowedBranches.length > 0 ? allowedBranches : branches);
    const userBranchObj =
      allowedBranches.find((b) => b.id === userBranchId) ||
      allowedBranches.find((b) => cleanBranchName(b.name).toLowerCase() === cleanBranchName(userBranchName).toLowerCase()) ||
      allowedBranches[0];

    const hasSpecificAssignedCenter = Boolean(
      !isSuperOrAcc && userBranchId && userBranchId !== 'all' && userBranchId !== 'ALL'
    );
    const activeBranchObj = isSuperOrAcc
      ? null
      : (hasSpecificAssignedCenter && userBranchObj)
        ? userBranchObj
        : isSingleRestricted
          ? (userBranchObj || branches[0])
          : (userBranchObj || branches[0]);
    const nextNo = computeNextBillNumber(storedBills, isOfficeBill, activeBranchObj);

    setEditingBillId(null);
    setHasSavedCurrentBill(false);
    try {
      localStorage.removeItem('polycables_editing_bill_id');
    } catch {}

    // Reset header fields to clean blank state
    const today = new Date().toISOString().split('T')[0];
    const userSp = salespersons.find(
      (s) => (currentUser?.salespersonCode && s.code === currentUser.salespersonCode) ||
             (currentUser?.name && s.name.toLowerCase() === currentUser.name.toLowerCase())
    );
    const defaultSalesmanCode = userSp?.code || currentUser?.salespersonCode || '';
    const defaultSalespersonName = userSp?.name || (currentUser?.salespersonCode ? currentUser.name : '');

    setHeader({
      billNo: nextNo,
      date: today,
      orderDate: today,
      challanDate: today,
      partyName: '',
      address: '',
      salesmanCode: defaultSalesmanCode,
      salespersonName: defaultSalespersonName,
      orderNumber: '',
      challanNo: '',
      refNo: '',
      discountPercent: 0,
      isOfficeBill: isOfficeBill,
      branchId: isSuperOrAcc ? 'ALL' : activeBranchObj?.id,
      branchName: isSuperOrAcc
        ? (isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser) ? 'All Sales Centers' : `All Assigned Centers (${allowedBranches.length})`)
        : activeBranchObj?.name
    });

    // Reset line items to 1 clean empty row
    setLines([
      {
        id: `line-${Date.now()}`,
        slNo: 1,
        itemDescription: '',
        sizeSpec: '',
        coilQty: 0,
        unit: 'Coils',
        rate: 0,
        amount: 0
      }
    ]);

    setActiveTab('builder', forceNewTab);
  };

  // Store / Save current bill to Stored Bills Directory
  const handleStoreCurrentBill = (
    customHeader?: BillHeader,
    customLines?: BillLineItem[],
    customEditingId?: string | null
  ) => {
    // Check internet and cloud connection before taking any entry
    if (!checkCanTakeEntry('Bill', (msg, type) => setAppToast({ text: msg, type: type === 'success' || type === 'info' ? type : 'error' }))) {
      return;
    }

    // Support both direct BillHeader and { header, lines } payload from BillInvoiceView
    const rawHeader = (customHeader as any)?.header ? (customHeader as any).header : (customHeader || header);
    const rawLines = (customHeader as any)?.lines ? (customHeader as any).lines : (customLines || lines);
    const activeHeader: BillHeader = { ...rawHeader };
    const activeRawLines: BillLineItem[] = [...rawLines];
    const activeEditingId = customEditingId !== undefined
      ? customEditingId
      : ((customHeader as any)?.editingBillId || (customHeader as any)?.id || editingBillId);

    const pName = (activeHeader.partyName || '').trim();
    if (!pName) {
      setAppToast({ text: 'Cannot save bill: Party Name is required! Please select or enter a party name.', type: 'error' });
      return;
    }

    const subtotal = activeRawLines.reduce((acc, cur) => acc + (cur.amount || 0), 0);
    const discountPercent = activeHeader.discountPercent ?? 0;
    const rawCalculatedDiscount = (subtotal * discountPercent) / 100;
    const discountAmount = activeHeader.discountAmount !== undefined && activeHeader.discountAmount !== null
      ? activeHeader.discountAmount
      : Math.round(rawCalculatedDiscount);
    const grandTotal = subtotal - discountAmount;
    const inWords = convertToTakaWords(grandTotal);

    const rawBillNo = (activeHeader.billNo || '01').trim();
    const billNoClean = rawBillNo;
    const isEditing = Boolean(activeEditingId);

    const prevBills = [...storedBills];

    // Auto-fix lines before saving if any unsaved/fuzzy item names match Master Item List (>= 70% name match + 100% price match)
    // "if item have but quantity 0 then remove that line."
    const validLines = activeRawLines.filter((l) => {
      const hasDesc = Boolean(l.itemDescription && l.itemDescription.trim() !== '');
      const qty = Number(l.coilQty) || 0;
      if (hasDesc && qty <= 0) return false;
      return true;
    });
    const linesToSave = validLines.filter((l) => Boolean(l.itemDescription && l.itemDescription.trim() !== ''));
    const effectiveLines = linesToSave.length > 0 ? linesToSave : validLines;

    const cleanLines = effectiveLines.map((l, idx) => ({
      ...l,
      slNo: idx + 1,
      itemDescription: (l.itemDescription || l.itemName || '').trim(),
      itemName: (l.itemDescription || l.itemName || '').trim(),
      manuallyEdited: true
    }));

    const isDraftBill = Boolean(activeHeader.isDraft);

    let finalSavedHeader: BillHeader = { ...activeHeader };
    let finalSavedBillId = activeEditingId || `bill-${Date.now()}`;

    setStoredBills((prev) => {
      let existingIdx = -1;

      // Only match by existingIdx if explicitly editing an existing bill
      if (activeEditingId) {
        existingIdx = prev.findIndex((b) => b.id === activeEditingId);
      }
      // Fallback: match by billNo ONLY within the same normalized sales center / office flag
      const activeBrNorm = String(activeHeader.branchId || '').trim().toLowerCase() === 'branch-main'
        ? 'branch-1'
        : String(activeHeader.branchId || '').trim().toLowerCase();
      const activeIsOffice = Boolean(activeHeader.isOfficeBill);
      if (existingIdx === -1 && billNoClean) {
        existingIdx = prev.findIndex((b) => {
          const obNo = (b.header?.billNo || (b as any).billNo || '').trim().toLowerCase();
          if (obNo !== billNoClean.toLowerCase()) return false;
          if (Boolean(b.header?.isOfficeBill ?? b.isOfficeBill) !== activeIsOffice) return false;
          const bBrNorm = String(b.header?.branchId || b.branchId || '').trim().toLowerCase() === 'branch-main'
            ? 'branch-1'
            : String(b.header?.branchId || b.branchId || '').trim().toLowerCase();
          if (activeBrNorm && activeBrNorm !== 'all' && bBrNorm && bBrNorm !== activeBrNorm) return false;
          return true;
        });
      }

      const existingBill = existingIdx !== -1 ? prev[existingIdx] : null;
      const billRecordId = existingBill ? existingBill.id : (activeEditingId || `bill-${Date.now()}`);
      finalSavedBillId = billRecordId;

      // STRICT Sales Center Branch Isolation:
      // An MP bill must NEVER be stamped as Ashulia, and an AS bill must NEVER be stamped as Madhupur!
      const billNoUpper = billNoClean.toUpperCase().trim();
      let assignedBranchId: string;
      let assignedBranchName: string;

      const isPlaceholderBranchVal = (val?: string | null) => {
        const low = (val || '').trim().toLowerCase();
        return !low || low === 'all' || low === 'branch-main' || low.startsWith('all sales') || low.startsWith('all assigned');
      };

      // Resolve party if matched (disambiguating duplicate party names by salesman)
      const savePartyNameLow = (activeHeader.partyName || '').trim().toLowerCase();
      const saveSpCodeLow = (activeHeader.salesmanCode || '').trim().toLowerCase();
      const saveSpNameLow = (activeHeader.salespersonName || '').trim().toLowerCase();
      const candidateSaveParties = savePartyNameLow
        ? parties.filter((p) => (p.name || '').trim().toLowerCase() === savePartyNameLow)
        : [];
      const matchedSaveParty =
        ((activeHeader as any).partyId
          ? parties.find((p) => p.id === (activeHeader as any).partyId)
          : undefined) ||
        (candidateSaveParties.length === 1
          ? candidateSaveParties[0]
          : candidateSaveParties.find(
              (p) =>
                (saveSpCodeLow && (p.salesmanCode || '').trim().toLowerCase() === saveSpCodeLow) ||
                (saveSpNameLow && (p.salespersonName || '').trim().toLowerCase() === saveSpNameLow)
            ));

      if (existingBill?.branchId && !isPlaceholderBranchVal(existingBill.branchId)) {
        assignedBranchId = existingBill.branchId;
        assignedBranchName = !isPlaceholderBranchVal(existingBill.branchName)
          ? existingBill.branchName!
          : !isPlaceholderBranchVal(existingBill.header?.branchName)
          ? existingBill.header!.branchName!
          : 'Madhupur Sales Center';
      } else if (existingBill?.header?.branchId && !isPlaceholderBranchVal(existingBill.header.branchId)) {
        assignedBranchId = existingBill.header.branchId;
        assignedBranchName = !isPlaceholderBranchVal(existingBill.header?.branchName)
          ? existingBill.header!.branchName!
          : !isPlaceholderBranchVal(existingBill.branchName)
          ? existingBill.branchName!
          : 'Madhupur Sales Center';
      } else if (billNoUpper.startsWith('MP')) {
        assignedBranchId = 'branch-1';
        assignedBranchName = 'Madhupur Sales Center';
      } else if (billNoUpper.startsWith('AS')) {
        assignedBranchId = 'branch-ashulia';
        assignedBranchName = 'Ashulia Sales Center';
      } else if (activeHeader.branchId && !isPlaceholderBranchVal(activeHeader.branchId)) {
        assignedBranchId = activeHeader.branchId;
        assignedBranchName = !isPlaceholderBranchVal(activeHeader.branchName)
          ? activeHeader.branchName!
          : 'Madhupur Sales Center';
      } else if (matchedSaveParty?.branchId && !isPlaceholderBranchVal(matchedSaveParty.branchId)) {
        assignedBranchId = matchedSaveParty.branchId;
        assignedBranchName = !isPlaceholderBranchVal(matchedSaveParty.branchName)
          ? matchedSaveParty.branchName!
          : 'Madhupur Sales Center';
      } else {
        const { branchId: userBranchId, branchName: userBranchName } = getUserBranch(currentUser, salespersons, branches);
        assignedBranchId = !isPlaceholderBranchVal(userBranchId) ? userBranchId : 'branch-1';
        assignedBranchName = !isPlaceholderBranchVal(userBranchName) ? userBranchName : 'Madhupur Sales Center';
      }

      const assignedCreatedBy = activeHeader.createdBy || existingBill?.createdBy || existingBill?.header?.createdBy || currentUser?.username || 'system';
      const nowIso = new Date().toISOString();
      const preservedSavedAt = existingBill?.savedAt || existingBill?.header?.date || nowIso;

      const calculatedTotalCoils = cleanLines.reduce((acc, cur) => {
        const qty = Number(cur.coilQty) || 0;
        if (qty <= 0) return acc;
        const unitLow = (cur.unit || '').trim().toLowerCase();
        const descLow = (cur.itemDescription || '').trim().toLowerCase();
        const isMeter = unitLow.includes('meter') || unitLow === 'mtr' || unitLow === 'm' || descLow.includes('arial') || descLow.includes('aerial') || /\bd-\s*1[12]\b/i.test(descLow);
        if (isMeter) {
          return acc + (qty / 100);
        }
        return acc + qty;
      }, 0);

      finalSavedHeader = {
        ...activeHeader,
        billNo: billNoClean,
        branchId: assignedBranchId,
        branchName: assignedBranchName,
        createdBy: assignedCreatedBy
      };

      const billData: StoredBill = cleanForFirestore({
        id: billRecordId,
        savedAt: preservedSavedAt,
        updatedAt: nowIso,
        company,
        header: finalSavedHeader,
        branchId: assignedBranchId,
        branchName: assignedBranchName,
        createdBy: assignedCreatedBy,
        lines: cleanLines,
        subtotal,
        discountAmount,
        grandTotal,
        totalCoils: calculatedTotalCoils,
        inWords,
        isOfficeBill: activeHeader.isOfficeBill || false,
        isDraft: isDraftBill,
        status: isDraftBill ? 'draft' : 'saved',
        ...(activeHeader.receivedCopy ? { receivedCopy: activeHeader.receivedCopy } : {}),
        ...(activeHeader.receivedCopyName ? { receivedCopyName: activeHeader.receivedCopyName } : {}),
        ...(activeHeader.receivedCopyDate ? { receivedCopyDate: activeHeader.receivedCopyDate } : {})
      });

      // Place newly saved/edited bill at index 0 and filter out previous version of this record / same-branch duplicate
      const assignedNorm = assignedBranchId.trim().toLowerCase() === 'branch-main' ? 'branch-1' : assignedBranchId.trim().toLowerCase();
      const updatedList: StoredBill[] = [
        billData,
        ...prev.filter((b) => {
          if (b.id === billRecordId) return false;
          const obNo = (b.header?.billNo || '').trim().toLowerCase();
          if (!obNo || obNo !== billNoClean.toLowerCase()) return true;
          const bBr = String(b.header?.branchId || b.branchId || '').trim().toLowerCase();
          const bBrNorm = bBr === 'branch-main' ? 'branch-1' : bBr;
          return bBrNorm !== assignedNorm || Boolean(b.header?.isOfficeBill ?? b.isOfficeBill) !== isDraftBill && Boolean(b.header?.isOfficeBill ?? b.isOfficeBill) !== Boolean(activeHeader.isOfficeBill);
        })
      ];
      const deduped = deduplicateBills(updatedList);

      // Ensure newly saved or updated bill ID / bill number is never treated as deleted
      const billId = billData.id;
      const billNo = billData.header?.billNo;
      const idsToRevive = [billId, billNo].filter(Boolean) as string[];
      if (idsToRevive.length > 0) {
        unrecordDeletedEntityIds(idsToRevive);
        unrecordDeletedIdsLocally(idsToRevive);
      }
      
      // Update authoritative in-memory ref and modification timestamp immediately
      storedBillsRef.current = deduped;
      lastSyncedSliceJsonRef.current.storedBills = JSON.stringify(deduped);
      localSliceModifiedAtRef.current.storedBills = Date.now();

      // Immediately persist to IndexedDB & light LocalStorage copy (prevents Android quota failures)
      idbSaveFailoverData('polycables_stored_bills', deduped).catch(() => {});
      const lightSavedBills = buildLightStoredBillsForStorage(deduped);
      safeSetStorageItem('polycables_stored_bills', JSON.stringify(lightSavedBills), deduped);
      safeSetStorageItem('polycables_stored_bills_cache', JSON.stringify(lightSavedBills.slice(0, 100)), deduped.slice(0, 100));

      // Instant local/server sync + debounced Firestore single-bill write (stored_bills/<id> only)
      scheduleCloudSync(
        { storedBills: deduped, _billUpserts: [billData], _skipFirestoreSlice: 'storedBills' },
        true
      );

      return deduped;
    });

    // Synchronously update editor state and local storage so browser refresh retains exact edited file
    setHeader(finalSavedHeader);
    setLines(cleanLines);
    setEditingBillId(finalSavedBillId);
    setFocusedStoredBillId(finalSavedBillId);
    try {
      localStorage.setItem('polycables_current_header', JSON.stringify(finalSavedHeader));
      localStorage.setItem('polycables_current_lines', JSON.stringify(cleanLines));
      localStorage.setItem('polycables_editing_bill_id', finalSavedBillId);
    } catch (e) {}

    setHasSavedCurrentBill(true);

    // Two-way sync: Auto-add Party to Party Directory with Salesman link if not already existing (only for finalized non-draft bills)
    if (!activeHeader.isDraft && activeHeader.partyName && activeHeader.partyName.trim()) {
      const pName = activeHeader.partyName.trim();
      const pAddress = activeHeader.address ? activeHeader.address.trim() : '';
      const pSalesmanCode = activeHeader.salesmanCode ? activeHeader.salesmanCode.trim() : '';

      let spName = activeHeader.salespersonName || '';
      if (pSalesmanCode && !spName) {
        const matchSp = salespersons.find((s) => s.code.toLowerCase() === pSalesmanCode.toLowerCase());
        if (matchSp) spName = matchSp.name;
      }

      const { branchId: currentBranchId, branchName: currentBranchName } = getUserBranch(currentUser, salespersons, branches);
      const effectivePartyBranchId = finalSavedHeader.branchId || currentBranchId;
      const effectivePartyBranchName = finalSavedHeader.branchName || currentBranchName;
      const headerPartyId = (activeHeader as any).partyId || '';

      setParties((prev) => {
        const matchingByName = prev.filter((p) => p.name.toLowerCase().trim() === pName.toLowerCase());
        if (matchingByName.length === 0) {
          // Never auto-add extra parties on bill save
          return prev;
        }
        // Disambiguate when multiple parties share the same name with different marketing persons
        let targetPartyId = '';
        if (headerPartyId && matchingByName.some((p) => p.id === headerPartyId)) {
          targetPartyId = headerPartyId;
        } else if (matchingByName.length === 1) {
          targetPartyId = matchingByName[0].id;
        } else {
          const spMatch = matchingByName.find((p) => {
            const pCode = (p.salesmanCode || '').trim().toLowerCase();
            const pSp = (p.salespersonName || '').trim().toLowerCase();
            return (
              (pSalesmanCode && pCode === pSalesmanCode.toLowerCase()) ||
              (spName && pSp === spName.toLowerCase())
            );
          });
          if (spMatch) {
            targetPartyId = spMatch.id;
          } else {
            const brMatch = matchingByName.find(
              (p) =>
                (effectivePartyBranchId && p.branchId === effectivePartyBranchId) ||
                (effectivePartyBranchName && (p.branchName || '').toLowerCase() === effectivePartyBranchName.toLowerCase())
            );
            if (brMatch) targetPartyId = brMatch.id;
          }
        }
        if (!targetPartyId) return prev;

        const nowPartyIso = new Date().toISOString();
        const next = prev.map((p) => {
          if (p.id === targetPartyId) {
            return {
              ...p,
              address: pAddress || p.address,
              salesmanCode: pSalesmanCode || p.salesmanCode,
              salespersonName: spName || p.salespersonName,
              branchId: p.branchId || effectivePartyBranchId,
              branchName: p.branchName || effectivePartyBranchName,
              updatedAt: nowPartyIso
            };
          }
          return p;
        });
        try {
          localStorage.setItem('polycables_parties', JSON.stringify(next));
        } catch {}
        scheduleCloudSync({ parties: next }, true);
        return next;
      });
    }

    if (isConvertedFromReq || (activeHeader.refNo && (activeHeader.refNo.toLowerCase().includes('req') || activeHeader.refNo.toLowerCase().includes('sq')))) {
      setIsConvertedFromReq(false);
      setActiveTab('requisition');
    }

    const isCurrentOffice = Boolean(activeHeader.isOfficeBill);
    emitErpNotification({
      title: isEditing ? `Bill Updated: #${billNoClean}` : `New Bill Saved: #${billNoClean}`,
      message: `${pName} • ৳${Math.round(grandTotal).toLocaleString('en-IN')}`,
      type: 'bill',
      branchName: finalSavedHeader.branchName,
      actorId: currentUser?.id || currentUser?.username,
      actorName: currentUser?.name || currentUser?.username
    });
    triggerGiantSuccess(isEditing ? 'Bill Updated Successfully!' : 'Bill Saved Successfully!', () => {
      handleNewBill(false, isCurrentOffice);
      if (isCurrentOffice) {
        setHeader((prev) => ({ ...prev, isOfficeBill: true }));
      }
    });
  };

  // Store an imported bill directly to Cloud & Stored Bills with instant live sync
  const handleStoreImportedBill = (importedHeader: BillHeader, importedLines: BillLineItem[]) => {
    const safeLines = (importedLines || [])
      .filter((l) => l && String(l.itemDescription || '').trim() !== '' && (Number(l.coilQty) > 0 || Number(l.amount) > 0))
      .map((l) => autoFixBillLineItemWithMasterCatalog(l, items).line);

    const finalLines = safeLines.length > 0 ? safeLines : (importedLines || []);

    const subtotal = finalLines.reduce((acc, cur) => acc + (Number(cur?.amount) || 0), 0);
    const discountPercent = Number(importedHeader.discountPercent) || 0;
    const rawDiscount = (subtotal * discountPercent) / 100;
    const discountAmount = typeof importedHeader.discountAmount === 'number'
      ? importedHeader.discountAmount
      : Math.round(rawDiscount);
    const grandTotal = Math.max(0, Math.round(subtotal - discountAmount));
    const inWords = convertToTakaWords(grandTotal);

    const calculatedTotalCoils = finalLines.reduce((acc, cur) => {
      const qty = Number(cur?.coilQty) || 0;
      if (qty <= 0) return acc;
      const unitLow = String(cur?.unit || '').trim().toLowerCase();
      const descLow = String(cur?.itemDescription || '').trim().toLowerCase();
      const isMeter = unitLow.includes('meter') || unitLow === 'mtr' || unitLow === 'm' || descLow.includes('arial') || descLow.includes('aerial') || /\bd-\s*1[12]\b/i.test(descLow);
      if (isMeter) {
        return acc + (qty / 100);
      }
      return acc + qty;
    }, 0);

    const billNoClean = String(importedHeader.billNo || '01').trim();
    const isPlaceholderImpBranch = (val?: string | null) => {
      const low = (val || '').trim().toLowerCase();
      return !low || low === 'all' || low === 'branch-main' || low.startsWith('all sales') || low.startsWith('all assigned');
    };
    const { branchId: userBranchId, branchName: userBranchName } = getUserBranch(currentUser, salespersons, branches);
    const impPartyNameLow = (importedHeader.partyName || '').trim().toLowerCase();
    const impSpCodeLow = (importedHeader.salesmanCode || '').trim().toLowerCase();
    const impPartyCandidates = impPartyNameLow ? parties.filter((p) => (p.name || '').trim().toLowerCase() === impPartyNameLow) : [];
    const matchedImpParty =
      impPartyCandidates.length === 1
        ? impPartyCandidates[0]
        : impPartyCandidates.find((p) => impSpCodeLow && (p.salesmanCode || '').trim().toLowerCase() === impSpCodeLow);

    const assignedBranchId = !isPlaceholderImpBranch(importedHeader.branchId)
      ? importedHeader.branchId!
      : matchedImpParty?.branchId && !isPlaceholderImpBranch(matchedImpParty.branchId)
      ? matchedImpParty.branchId
      : !isPlaceholderImpBranch(userBranchId)
      ? userBranchId
      : 'branch-1';
    const assignedBranchName = !isPlaceholderImpBranch(importedHeader.branchName)
      ? importedHeader.branchName!
      : matchedImpParty?.branchName && !isPlaceholderImpBranch(matchedImpParty.branchName)
      ? matchedImpParty.branchName
      : !isPlaceholderImpBranch(userBranchName)
      ? userBranchName
      : 'Madhupur Sales Center';
    const assignedCreatedBy = importedHeader.createdBy || currentUser?.username || 'system';
    const nowIso = new Date().toISOString();

    const billRecordId = `bill-imp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const billData: StoredBill = cleanForFirestore({
      id: billRecordId,
      savedAt: nowIso,
      updatedAt: nowIso,
      company,
      header: {
        ...importedHeader,
        billNo: billNoClean,
        branchId: assignedBranchId,
        branchName: assignedBranchName,
        createdBy: assignedCreatedBy,
        updatedAt: nowIso
      },
      branchId: assignedBranchId,
      branchName: assignedBranchName,
      createdBy: assignedCreatedBy,
      lines: finalLines,
      subtotal,
      discountAmount,
      grandTotal,
      totalCoils: calculatedTotalCoils,
      inWords,
      isOfficeBill: Boolean(importedHeader.isOfficeBill),
      isDraft: Boolean(importedHeader.isDraft),
      status: importedHeader.isDraft ? 'draft' : 'saved',
      ...(importedHeader.receivedCopy ? { receivedCopy: importedHeader.receivedCopy } : {}),
      ...(importedHeader.receivedCopyName ? { receivedCopyName: importedHeader.receivedCopyName } : {}),
      ...(importedHeader.receivedCopyDate ? { receivedCopyDate: importedHeader.receivedCopyDate } : {})
    });

    setEditingBillId(billRecordId);
    setFocusedStoredBillId(billRecordId);
    setHasSavedCurrentBill(true);

    // Save to storedBills state & persist via instant /api/sync + debounced single-bill Firestore write
    setStoredBills((prev) => {
      const updatedList = [billData, ...prev.filter((b) => b.id !== billRecordId)];
      const deduped = deduplicateBills(updatedList);
      storedBillsRef.current = deduped;
      lastSyncedSliceJsonRef.current.storedBills = JSON.stringify(deduped);
      localSliceModifiedAtRef.current.storedBills = Date.now();

      scheduleCloudSync(
        { storedBills: deduped, _billUpserts: [billData], _skipFirestoreSlice: 'storedBills' },
        true
      );

      return deduped;
    });

    // Never auto-create extra parties on bill import; only update existing party metadata if already present
    if (!importedHeader.isDraft && importedHeader.partyName && importedHeader.partyName.trim()) {
      const pName = importedHeader.partyName.trim();
      const pAddress = importedHeader.address ? importedHeader.address.trim() : '';
      const pSalesmanCode = importedHeader.salesmanCode ? importedHeader.salesmanCode.trim() : '';
      let spName = importedHeader.salespersonName || '';
      if (pSalesmanCode && !spName) {
        const matchSp = salespersons.find((s) => s.code.toLowerCase() === pSalesmanCode.toLowerCase());
        if (matchSp) spName = matchSp.name;
      }

      setParties((prev) => {
        const matchingByName = prev.filter((p) => p.name.toLowerCase().trim() === pName.toLowerCase());
        if (matchingByName.length === 0) return prev;
        let targetPartyId = '';
        if (matchingByName.length === 1) {
          targetPartyId = matchingByName[0].id;
        } else {
          const spMatch = matchingByName.find((p) => {
            const pCode = (p.salesmanCode || '').trim().toLowerCase();
            const pSp = (p.salespersonName || '').trim().toLowerCase();
            return (
              (pSalesmanCode && pCode === pSalesmanCode.toLowerCase()) ||
              (spName && pSp === spName.toLowerCase())
            );
          });
          if (spMatch) targetPartyId = spMatch.id;
        }
        if (!targetPartyId) return prev;

        const next = prev.map((p) => {
          if (p.id === targetPartyId) {
            return {
              ...p,
              address: pAddress || p.address,
              salesmanCode: pSalesmanCode || p.salesmanCode,
              salespersonName: spName || p.salespersonName,
              branchId: p.branchId || assignedBranchId,
              branchName: p.branchName || assignedBranchName
            };
          }
          return p;
        });
        try {
          localStorage.setItem('polycables_parties', JSON.stringify(next));
        } catch {}
        scheduleCloudSync({ parties: next }, true);
        return next;
      });
    }
  };

  // Clear all stored bills (Cloud-Only)
  const handleClearAllBills = () => {
    const prevIds = storedBillsRef.current.map((b) => b.id).filter(Boolean);
    if (prevIds.length > 0) {
      recordDeletedEntityIds(prevIds);
    }
    storedBillsRef.current = [];
    setStoredBills([]);
    idbSaveFailoverData('polycables_stored_bills', []).catch(() => {});
    try {
      localStorage.setItem('polycables_stored_bills', '[]');
      localStorage.removeItem('polycables_stored_bills_cache');
    } catch {}
    const currentDeleted = getGlobalDeletedIds();
    lastSyncedSliceJsonRef.current.storedBills = '[]';
    scheduleCloudSync(
      {
        storedBills: [],
        _replaceStoredBills: true,
        _forceEmpty: true,
        deletedEntityIds: currentDeleted,
        ...(prevIds.length > 0 ? { _billDeletes: prevIds } : {})
      },
      true
    );
  };

  // Remove duplicate bills (Cloud-Only)
  const handleRemoveDuplicateBills = () => {
    setStoredBills((prev) => {
      const seen = new Set<string>();
      const removedIds: string[] = [];
      const deduped = prev.filter((b) => {
        const key = `${b.header.billNo.trim().toLowerCase()}-${b.header.partyName.trim().toLowerCase()}-${b.grandTotal}`;
        if (seen.has(key)) {
          if (b.id) removedIds.push(b.id);
          return false;
        }
        seen.add(key);
        return true;
      });
      if (removedIds.length > 0) {
        recordDeletedEntityIds(removedIds);
      }
      storedBillsRef.current = deduped;
      lastSyncedSliceJsonRef.current.storedBills = JSON.stringify(deduped);
      safeSetStorageItem('polycables_stored_bills', JSON.stringify(deduped), deduped);
      idbSaveFailoverData('polycables_stored_bills', deduped).catch(() => {});
      const currentDeleted = getGlobalDeletedIds();
      scheduleCloudSync(
        {
          storedBills: deduped,
          _replaceStoredBills: true,
          deletedEntityIds: currentDeleted,
          ...(removedIds.length > 0 ? { _billDeletes: removedIds, _skipFirestoreSlice: 'storedBills' } : {})
        },
        true
      );
      return deduped;
    });
  };

  // Restore All Data from Backup Package - Applies snapshot cleanly across local state, IndexedDB, Server Sync Hub, and Firestore without blocking UI
  const handleRestoreAllData = (dataPkg: BackupDataPackage) => {
    try {
      if (!dataPkg || !dataPkg.data) return;
      const restoreNow = Date.now();
      lastRestoreTimestampRef.current = restoreNow;
      isSyncingFromRemote.current = true;
      isRestoringFirestoreRef.current = true;
      try {
        localStorage.setItem('polycables_last_restore_time', String(restoreNow));
      } catch {}
      const d = dataPkg.data as any;
      const present: Record<string, boolean> | undefined = d._presentModules;

      // 0. Clear pending sync/retry queues and all tombstones BEFORE restoring so stale caches/queues cannot overwrite backup data
      clearFirestoreRetryQueue();
      clearServerSyncRetryQueue();
      clearInMemoryFailoverQueue();
      pendingCloudDataRef.current = {};
      pendingFirestoreDataRef.current = {};
      pendingFirestoreBillUpsertsRef.current.clear();
      pendingFirestoreBillDeletesRef.current.clear();
      lastFirestoreSliceJsonRef.current = {};
      lastFetchedSliceVersionsRef.current = {};
      lastFirestoreDeletedIdsJsonRef.current = '[]';
      resetGlobalDeletedIds();
      try {
        localStorage.removeItem('polycables_global_deleted_ids');
        localStorage.removeItem('polycables_deleted_entity_ids');
        localStorage.removeItem('polycables_deleted_item_ids');
        localStorage.removeItem('polycables_deleted_salespersons');
        localStorage.removeItem('polycables_deleted_snapshot_ids');
        localStorage.removeItem('polycables_recently_restored_ids');
        for (const tk of ALL_TRASH_STORAGE_KEYS) {
          localStorage.removeItem(tk);
        }
      } catch (_) {}

      const hasMod = (key: string, arrCandidate: any, altKeys: string[] = []): boolean => {
        if (present && typeof present === 'object') {
          if (present[key]) return true;
          for (const ak of altKeys) {
            if (present[ak]) return true;
          }
          return Array.isArray(arrCandidate) && arrCandidate.length > 0;
        }
        return Array.isArray(arrCandidate);
      };

      const sanitizeRestoreList = (raw: any[], fallback: string[]): string[] => {
        if (!Array.isArray(raw) || raw.length === 0) return fallback;
        const res: string[] = [];
        const seen = new Set<string>();
        for (const itm of raw) {
          const str = toCleanBankOrAccountName(itm);
          if (str && !isInvalidStorageEntry(str)) {
            const low = str.toLowerCase();
            if (!seen.has(low)) {
              seen.add(low);
              res.push(str);
            }
          }
        }
        return res.length > 0 ? res : fallback;
      };

      // 1. Prepare target datasets (preserving current data when module is omitted from partial backup, and sanitizing branches/users)
      const rawItems = Array.isArray(d.items) ? d.items : (Array.isArray(d.masterItems) ? d.masterItems : (Array.isArray(d.products) ? d.products : undefined));
      const targetItems = hasMod('items', rawItems, ['masterItems', 'products']) && Array.isArray(rawItems)
        ? rawItems.filter((x: any) => x && typeof x === 'object')
        : items;
      const rawParties = Array.isArray(d.parties) ? d.parties : (Array.isArray(d.customers) ? d.customers : (Array.isArray(d.clients) ? d.clients : undefined));
      const targetParties = hasMod('parties', rawParties, ['parties', 'customers', 'clients']) && Array.isArray(rawParties)
        ? sanitizeAndDeduplicateParties(rawParties.filter((x: any) => x && typeof x === 'object'))
        : parties;
      const rawSp = Array.isArray(d.salespersons) ? d.salespersons : (Array.isArray(d.users) ? d.users : (Array.isArray(d.salesmen) ? d.salesmen : undefined));
      const targetSalespersons = hasMod('salespersons', rawSp, ['salespersons', 'users', 'salesmen']) && Array.isArray(rawSp)
        ? sanitizeSalespersonsList(rawSp.filter((x: any) => x && typeof x === 'object'))
        : salespersons;
      const rawBillsArr = Array.isArray(d.storedBills) ? d.storedBills : (Array.isArray(d.stored_bills) ? d.stored_bills : (Array.isArray(d.bills) ? d.bills : (Array.isArray(d.invoices) ? d.invoices : undefined)));
      const targetStoredBills = hasMod('storedBills', rawBillsArr, ['storedBills', 'stored_bills', 'bills', 'invoices']) && Array.isArray(rawBillsArr)
        ? deduplicateBills(rawBillsArr.filter((x: any) => x && typeof x === 'object'))
        : storedBills;
      const rawImports = Array.isArray(d.factoryImports) ? d.factoryImports : (Array.isArray(d.factory_imports) ? d.factory_imports : (Array.isArray(d.imports) ? d.imports : undefined));
      const targetFactoryImports = hasMod('factoryImports', rawImports, ['factoryImports', 'factory_imports', 'imports']) && Array.isArray(rawImports)
        ? rawImports.filter((x: any) => x && typeof x === 'object')
        : factoryImports;
      const rawReturns = Array.isArray(d.stockReturns) ? d.stockReturns : (Array.isArray(d.stock_returns) ? d.stock_returns : (Array.isArray(d.returns) ? d.returns : undefined));
      const targetStockReturns = hasMod('stockReturns', rawReturns, ['stockReturns', 'stock_returns', 'returns', 'challansAndReturns']) && Array.isArray(rawReturns)
        ? rawReturns.filter((x: any) => x && typeof x === 'object')
        : stockReturns;
      const rawChallans = Array.isArray(d.deliveryChallans) ? d.deliveryChallans : (Array.isArray(d.delivery_challans) ? d.delivery_challans : (Array.isArray(d.challans) ? d.challans : undefined));
      const targetDeliveryChallans = hasMod('deliveryChallans', rawChallans, ['deliveryChallans', 'delivery_challans', 'challans', 'challansAndReturns']) && Array.isArray(rawChallans)
        ? rawChallans.filter((x: any) => x && typeof x === 'object')
        : deliveryChallans;
      const rawColorEx = Array.isArray(d.colorExchanges) ? d.colorExchanges : (Array.isArray(d.color_exchanges) ? d.color_exchanges : undefined);
      const targetColorExchanges = hasMod('colorExchanges', rawColorEx, ['colorExchanges', 'color_exchanges']) && Array.isArray(rawColorEx)
        ? rawColorEx.filter((x: any) => x && typeof x === 'object')
        : colorExchanges;
      const rawExpenses = Array.isArray(d.expenses) ? d.expenses : (Array.isArray(d.monthlyExpenses) ? d.monthlyExpenses : (Array.isArray(d.monthlyExpense) ? d.monthlyExpense : undefined));
      const targetExpenses = hasMod('expenses', rawExpenses, ['expenses', 'monthlyExpense', 'expenseEntryLog', 'monthlyExpenses']) && Array.isArray(rawExpenses)
        ? rawExpenses.filter((x: any) => x && typeof x === 'object')
        : expenses;
      const targetConveyances = hasMod('conveyances', d.conveyances, ['conveyances']) && Array.isArray(d.conveyances)
        ? d.conveyances.filter((x: any) => x && typeof x === 'object')
        : conveyances;

      const rawColl = Array.isArray(d.collections) ? d.collections : (Array.isArray(d.collectionList) ? d.collectionList : (Array.isArray(d.moneyReceipts) ? d.moneyReceipts : (Array.isArray(d.mrs) ? d.mrs : undefined)));
      const targetCollections = hasMod('collections', rawColl, ['collectionList', 'collections', 'moneyReceipts', 'mrs']) && Array.isArray(rawColl)
        ? rawColl.filter((x: any) => x && typeof x === 'object')
        : collections;

      const rawBankDeposits = Array.isArray(d.bankDeposits) ? d.bankDeposits : (Array.isArray(d.bank_deposits) ? d.bank_deposits : (Array.isArray(d.deposits) ? d.deposits : (Array.isArray(d.depositHistory) ? d.depositHistory : undefined)));
      const targetBankDeposits = hasMod('bankDeposits', rawBankDeposits, ['depositHistory', 'bankDeposits', 'deposits', 'bank_deposits']) && Array.isArray(rawBankDeposits)
        ? rawBankDeposits.filter((dp: any) => dp && typeof dp === 'object' && !dp.isAutoDeposit && !String(dp.id || '').startsWith('auto-ho-'))
        : bankDeposits;

      const rawBranches = Array.isArray(d.branches) ? d.branches : (Array.isArray(d.salesCenters) ? d.salesCenters : (Array.isArray(d.sales_centers) ? d.sales_centers : undefined));
      const targetBranches = hasMod('branches', rawBranches, ['branches', 'salesCenters', 'sales_centers']) && Array.isArray(rawBranches) && rawBranches.length > 0
        ? sanitizeAndSortBranches(rawBranches.filter((x: any) => x && typeof x === 'object'))
        : sanitizeAndSortBranches(branches);
      const targetRequisitions = hasMod('requisitions', d.requisitions, ['requisitions']) && Array.isArray(d.requisitions)
        ? d.requisitions.filter((x: any) => x && typeof x === 'object')
        : requisitions;
      const targetCompany = d.company && typeof d.company === 'object' && d.company.name ? d.company : (company || defaultCompany);
      const targetHeader = d.header && typeof d.header === 'object' && d.header.billNo ? d.header : (header || defaultHeader);
      const targetBankList = sanitizeRestoreList(d.bankList || d.bank_list, bankList);
      const targetAccountList = sanitizeRestoreList(d.accountList || d.account_list, accountList);
      const targetDeletedAutoDeposits = Array.isArray(d.deletedAutoDeposits) ? d.deletedAutoDeposits.filter(Boolean) : deletedAutoDepositIds;

      const rawClosings = Array.isArray(d.closings) ? d.closings : (Array.isArray(d.cashInHand) ? d.cashInHand : undefined);
      const targetClosings = hasMod('closings', rawClosings, ['cashInHand', 'closings']) && Array.isArray(rawClosings)
        ? rawClosings.filter((x: any) => x && typeof x === 'object')
        : closings;
      const targetTrashedItems = hasMod('trashedItems', d.trashedItems) && Array.isArray(d.trashedItems) ? d.trashedItems.filter(Boolean) : [];
      const targetTrashedParties = hasMod('trashedParties', d.trashedParties) && Array.isArray(d.trashedParties) ? d.trashedParties.filter(Boolean) : [];
      const targetTrashedCollections = hasMod('trashedCollections', d.trashedCollections) && Array.isArray(d.trashedCollections) ? d.trashedCollections.filter(Boolean) : [];
      const targetTrashedChallans = hasMod('trashedChallans', d.trashedChallans) && Array.isArray(d.trashedChallans) ? d.trashedChallans.filter(Boolean) : [];
      const targetOrderedCategories = Array.isArray(d.orderedCategories) && d.orderedCategories.length > 0
        ? d.orderedCategories.filter(Boolean)
        : (() => { try { return JSON.parse(localStorage.getItem('polycables_ordered_categories') || '[]'); } catch { return []; } })();
      const targetCustomCategories = Array.isArray(d.customCategories) && d.customCategories.length > 0
        ? d.customCategories.filter(Boolean)
        : (() => { try { return JSON.parse(localStorage.getItem('polycables_custom_categories') || '[]'); } catch { return []; } })();
      const rawPriceSnaps = Array.isArray(d.priceSnapshots) ? d.priceSnapshots : (Array.isArray(d.price_snapshots) ? d.price_snapshots : undefined);
      const targetPriceSnapshots = Array.isArray(rawPriceSnaps) ? normalizePriceSnapshots(rawPriceSnaps) : undefined;

      const reconciledTargetCollections = targetCollections;

      // 1.5. Collect all restored primary entity IDs & mark them restored locally
      const allRestoredIds: string[] = [];
      const collectIds = (arr: any[]) => {
        if (!Array.isArray(arr)) return;
        for (let i = 0; i < arr.length; i++) {
          const itm = arr[i];
          if (itm && typeof itm === 'object') {
            if (itm.id) allRestoredIds.push(String(itm.id));
            if (itm._id) allRestoredIds.push(String(itm._id));
          }
        }
      };
      collectIds(targetItems);
      collectIds(targetParties);
      collectIds(targetSalespersons);
      collectIds(targetStoredBills);
      collectIds(targetFactoryImports);
      collectIds(targetStockReturns);
      collectIds(targetDeliveryChallans);
      collectIds(targetColorExchanges);
      collectIds(targetExpenses);
      collectIds(targetConveyances);
      collectIds(reconciledTargetCollections);
      collectIds(targetBankDeposits);
      collectIds(targetBranches);
      collectIds(targetRequisitions);
      collectIds(targetClosings);

      unrecordDeletedIdsLocally(allRestoredIds);

      // 2. Overwrite React state & Refs immediately so UI renders restored records smoothly
      itemsRef.current = targetItems;
      partiesRef.current = targetParties;
      salespersonsRef.current = targetSalespersons;
      storedBillsRef.current = targetStoredBills;
      factoryImportsRef.current = targetFactoryImports;
      stockReturnsRef.current = targetStockReturns;
      deliveryChallansRef.current = targetDeliveryChallans;
      colorExchangesRef.current = targetColorExchanges;
      expensesRef.current = targetExpenses;
      conveyancesRef.current = targetConveyances;
      collectionsRef.current = reconciledTargetCollections;
      bankDepositsRef.current = targetBankDeposits;
      branchesRef.current = targetBranches;
      requisitionsRef.current = targetRequisitions;
      closingsRef.current = targetClosings;
      companyRef.current = targetCompany;
      bankListRef.current = targetBankList;
      accountListRef.current = targetAccountList;
      deletedAutoDepositIdsRef.current = targetDeletedAutoDeposits;

      setItems(targetItems);
      setParties(targetParties);
      setSalespersons(targetSalespersons);
      setStoredBills(targetStoredBills);
      setFactoryImports(targetFactoryImports);
      setStockReturns(targetStockReturns);
      setDeliveryChallans(targetDeliveryChallans);
      setColorExchanges(targetColorExchanges);
      setExpenses(targetExpenses);
      setConveyances(targetConveyances);
      setCollections(reconciledTargetCollections);
      setBankDeposits(targetBankDeposits);
      setBranches(targetBranches);
      setRequisitions(targetRequisitions);
      setClosings(targetClosings);
      setCompany(targetCompany);
      setHeader(targetHeader);
      setBankList(targetBankList);
      setAccountList(targetAccountList);
      setDeletedAutoDepositIds(targetDeletedAutoDeposits);

      if (targetOrderedCategories.length > 0) {
        window.dispatchEvent(new CustomEvent('categories-updated', { detail: targetOrderedCategories }));
      }

      // 3. Persist to LocalStorage, IndexedDB, Server Sync Hub, and Firestore immediately
      try {
        if (targetItems.length > 0) {
          try {
            localStorage.removeItem('polycables_items_cleared');
          } catch {}
        } else if (hasMod('items', d.items)) {
          try {
            localStorage.setItem('polycables_items_cleared', 'true');
          } catch {}
        }
        const specialItemsList = targetItems.filter((it: any) => it?.isSpecialItem);
        safeSetStorageItem('polycables_items', JSON.stringify(targetItems), targetItems);
        safeSetStorageItem('polycables_special_items', JSON.stringify(specialItemsList), specialItemsList);
        idbSaveFailoverData('polycables_items', targetItems).catch(() => {});
        idbSaveFailoverData('polycables_special_items', specialItemsList).catch(() => {});
        safeSetStorageItem('polycables_parties', JSON.stringify(targetParties), targetParties);
        idbSaveFailoverData('polycables_parties', targetParties).catch(() => {});
        safeSetStorageItem('polycables_salespersons', JSON.stringify(targetSalespersons), targetSalespersons);

        idbSaveFailoverData('polycables_stored_bills', targetStoredBills).catch(() => {});
        const lightBillsForLocal = targetStoredBills.map((b: StoredBill) => {
          if (!b) return b;
          const hasHeavy =
            (typeof b.receivedCopy === 'string' && b.receivedCopy.length > 1500) ||
            (typeof b.header?.receivedCopy === 'string' && b.header.receivedCopy.length > 1500);
          if (!hasHeavy) return b;
          const copy: any = { ...b };
          if (typeof copy.receivedCopy === 'string' && copy.receivedCopy.length > 1500) delete copy.receivedCopy;
          if (copy.header && typeof copy.header.receivedCopy === 'string' && copy.header.receivedCopy.length > 1500) {
            copy.header = { ...copy.header };
            delete copy.header.receivedCopy;
          }
          return copy;
        });
        safeSetStorageItem('polycables_stored_bills', JSON.stringify(lightBillsForLocal), targetStoredBills);

        safeSetStorageItem('polycables_factory_imports', JSON.stringify(targetFactoryImports), targetFactoryImports);
        safeSetStorageItem('polycables_stock_returns', JSON.stringify(targetStockReturns), targetStockReturns);
        safeSetStorageItem('polycables_delivery_challans', JSON.stringify(targetDeliveryChallans), targetDeliveryChallans);
        safeSetStorageItem('polycables_color_exchanges', JSON.stringify(targetColorExchanges), targetColorExchanges);
        safeSetStorageItem('polycables_expenses', JSON.stringify(targetExpenses), targetExpenses);
        safeSetStorageItem('polycables_conveyances', JSON.stringify(targetConveyances), targetConveyances);
        idbSaveFailoverData('polycables_conveyances', targetConveyances).catch(() => {});
        safeSetStorageItem('polycables_collections', JSON.stringify(reconciledTargetCollections), reconciledTargetCollections);
        safeSetStorageItem('polycables_bank_deposits', JSON.stringify(targetBankDeposits), targetBankDeposits);
        safeSetStorageItem('polycables_branches', JSON.stringify(targetBranches), targetBranches);
        safeSetStorageItem('polycables_requisitions', JSON.stringify(targetRequisitions), targetRequisitions);
        safeSetStorageItem('polycables_closings', JSON.stringify(targetClosings), targetClosings);
        safeSetStorageItem('polycables_company', JSON.stringify(targetCompany), targetCompany);
        safeSetStorageItem('polycables_header', JSON.stringify(targetHeader), targetHeader);
        safeSetStorageItem('polycables_bank_list', JSON.stringify(targetBankList), targetBankList);
        safeSetStorageItem('polycables_account_list', JSON.stringify(targetAccountList), targetAccountList);
        safeSetStorageItem('polycables_deleted_auto_deposits', JSON.stringify(targetDeletedAutoDeposits), targetDeletedAutoDeposits);
        safeSetStorageItem('polycables_trashed_items', JSON.stringify(targetTrashedItems), targetTrashedItems);
        safeSetStorageItem('polycables_trashed_parties', JSON.stringify(targetTrashedParties), targetTrashedParties);
        safeSetStorageItem('polycables_trashed_collections', JSON.stringify(targetTrashedCollections), targetTrashedCollections);
        safeSetStorageItem('polycables_trashed_challans', JSON.stringify(targetTrashedChallans), targetTrashedChallans);
        safeSetStorageItem('polycables_ordered_categories', JSON.stringify(targetOrderedCategories), targetOrderedCategories);
        safeSetStorageItem('polycables_custom_categories', JSON.stringify(targetCustomCategories), targetCustomCategories);
        if (targetPriceSnapshots && targetPriceSnapshots.length > 0) {
          const actSnap = targetPriceSnapshots.find((s) => s.isActive);
          savePriceListSnapshots(targetPriceSnapshots, {
            effectiveDate: actSnap?.effectiveDate,
            circularTitle: actSnap?.title,
            dispatch: true
          });
        }
        if (d.categoryNumbers && typeof d.categoryNumbers === 'object') {
          saveCategoryNumbers(d.categoryNumbers);
        }
        if (Array.isArray(d.expenseCategories)) {
          localStorage.setItem('polycables_expense_categories', JSON.stringify(d.expenseCategories));
        }

        let targetDeletedCategories: string[] = [];
        try {
          targetDeletedCategories = JSON.parse(localStorage.getItem('polycables_deleted_categories') || '[]');
          if (!Array.isArray(targetDeletedCategories)) targetDeletedCategories = [];
        } catch {}
        const restoreItemsVer = Date.now();
        localItemsVersionRef.current = restoreItemsVer;
        try {
          localStorage.setItem('polycables_items_version', String(restoreItemsVer));
          localStorage.setItem('polycables_items_version_applied', String(restoreItemsVer));
        } catch {}
        if (d.adminPassword) {
          safeSetStorageItem('app_admin_password', d.adminPassword);
        }

        // 4. Force cloud database full overwrite across chunked slices (stays well under 1 MiB limit per doc)
        const fullCloudState: Record<string, any> = {
          _isRestore: true,
          _forceClear: true,
          _forceEmpty: true,
          _itemsCleared: targetItems.length === 0,
          _replaceStoredBills: true,
          _replaceItems: true,
          itemsVersion: restoreItemsVer,
          deletedEntityIds: [],
          restoredEntityIds: allRestoredIds,
          items: targetItems,
          specialItems: specialItemsList,
          parties: targetParties,
          salespersons: targetSalespersons,
          storedBills: targetStoredBills,
          factoryImports: targetFactoryImports,
          stockReturns: targetStockReturns,
          deliveryChallans: targetDeliveryChallans,
          colorExchanges: targetColorExchanges,
          expenses: targetExpenses,
          conveyances: targetConveyances,
          collections: reconciledTargetCollections,
          bankDeposits: targetBankDeposits,
          branches: targetBranches,
          requisitions: targetRequisitions,
          closings: targetClosings,
          company: targetCompany,
          header: targetHeader,
          bankList: targetBankList,
          accountList: targetAccountList,
          orderedCategories: targetOrderedCategories,
          customCategories: targetCustomCategories,
          deletedCategories: targetDeletedCategories,
          deletedAutoDeposits: targetDeletedAutoDeposits,
          ...(targetPriceSnapshots ? { priceSnapshots: targetPriceSnapshots, _replacePriceSnapshots: true } : {}),
          ...(d.categoryNumbers && typeof d.categoryNumbers === 'object' ? { categoryNumbers: d.categoryNumbers, _replaceCategoryNumbers: true } : {}),
          ...(Array.isArray(d.expenseCategories) ? { expenseCategories: d.expenseCategories } : {})
        };

        for (const [sk, sv] of Object.entries(fullCloudState)) {
          if (sk.startsWith('_')) continue;
          try {
            lastSyncedSliceJsonRef.current[sk] = JSON.stringify(sv);
            localSliceModifiedAtRef.current[sk] = restoreNow;
          } catch {}
        }

        fetch('/api/sync/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: clientSyncIdRef.current,
            ids: allRestoredIds,
            type: 'all',
            restoredItems: fullCloudState
          })
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((resJson) => {
            if (resJson?.version) noteServerVersion(resJson.version);
          })
          .catch(() => {});

        scheduleCloudSync(fullCloudState, true);
      } catch (persistErr) {
        console.error('Immediate restore persistence error:', persistErr);
        isRestoringFirestoreRef.current = false;
      } finally {
        setTimeout(() => {
          isSyncingFromRemote.current = false;
          isRemoteSyncDone.current = true;
        }, 600);
      }
    } catch (err: any) {
      isSyncingFromRemote.current = false;
      isRestoringFirestoreRef.current = false;
      console.error('Failed to execute handleRestoreAllData:', err);
    }
  };

  // Load a stored bill back into active bill editor
  const handleLoadStoredBill = (bill: StoredBill) => {
    const origin = {
      viewTab: activeTab,
      itemSubTab,
      reportSubTab,
      expenseSubTab,
      settingsSubTab,
      requisitionSubTab,
      selectedLedgerPartyId
    };
    billEditOriginRef.current = origin;
    try {
      localStorage.setItem('polycables_bill_edit_origin', JSON.stringify(origin));
    } catch {}

    setEditingBillId(bill.id);
    setFocusedStoredBillId(bill.id);
    setHasSavedCurrentBill(true);
    setCompany(bill.company);
    const rawBranchId = bill.header?.branchId || bill.branchId;
    const normBranchId = rawBranchId === 'branch-main' ? 'branch-1' : (rawBranchId || 'branch-1');
    const rawBranchName = bill.header?.branchName || bill.branchName || 'Madhupur Sales Center';
    const newHeader: BillHeader = {
      ...bill.header,
      branchId: normBranchId,
      branchName: rawBranchName,
      receivedCopy: bill.receivedCopy || bill.header.receivedCopy,
      receivedCopyName: bill.receivedCopyName || bill.header.receivedCopyName,
      receivedCopyDate: bill.receivedCopyDate || bill.header.receivedCopyDate
    };
    setHeader(newHeader);
    // Preserve exact bill line items without overwriting user edits with master catalog values
    const fixedLines = (bill.lines || []).map((l, idx) => ({
      ...l,
      slNo: l.slNo || idx + 1
    }));
    setLines(fixedLines);
    try {
      localStorage.setItem('polycables_editing_bill_id', bill.id);
      localStorage.setItem('polycables_current_header', JSON.stringify(newHeader));
      localStorage.setItem('polycables_current_lines', JSON.stringify(fixedLines));
    } catch {}
    setActiveTab('builder', false, undefined);
  };

  // Update Received Copy on a Stored Bill directly
  const handleUpdateBillReceivedCopy = (
    billId: string,
    receivedCopy?: string,
    receivedCopyName?: string,
    receivedCopyDate?: string
  ) => {
    if (!checkCanTakeEntry('Update Received Copy', (msg) => setAppToast({ text: msg, type: 'error' }))) {
      return;
    }
    const nowIso = new Date().toISOString();
    setStoredBills((prev) => {
      let changedBill: StoredBill | null = null;
      const updatedRaw = prev.map((b) => {
        if (b.id === billId) {
          changedBill = {
            ...b,
            updatedAt: nowIso,
            receivedCopy,
            receivedCopyName,
            receivedCopyDate,
            header: {
              ...b.header,
              updatedAt: nowIso,
              receivedCopy,
              receivedCopyName,
              receivedCopyDate
            }
          };
          return changedBill;
        }
        return b;
      });
      const updated = deduplicateBills(updatedRaw);

      storedBillsRef.current = updated;
      lastSyncedSliceJsonRef.current.storedBills = JSON.stringify(updated);
      localSliceModifiedAtRef.current.storedBills = Date.now();
      idbSaveFailoverData('polycables_stored_bills', updated).catch(() => {});
      safeSetStorageItem('polycables_stored_bills', JSON.stringify(buildLightStoredBillsForStorage(updated)), updated);
      scheduleCloudSync(
        {
          storedBills: updated,
          ...(changedBill ? { _billUpserts: [changedBill], _skipFirestoreSlice: 'storedBills' } : {})
        },
        true
      );

      return updated;
    });

    if (editingBillId === billId) {
      setHeader((prev) => ({
        ...prev,
        receivedCopy,
        receivedCopyName,
        receivedCopyDate
      }));
    }
  };

  // Update Salesman on a Stored Bill directly (e.g. remove out-list name)
  const handleUpdateBillSalesman = (billId: string, salesmanCode?: string, salesmanName?: string) => {
    if (!checkCanTakeEntry('Update Bill Salesperson', (msg) => setAppToast({ text: msg, type: 'error' }))) {
      return;
    }
    const nowIso = new Date().toISOString();
    setStoredBills((prev) => {
      let changedBill: StoredBill | null = null;
      const updatedRaw = prev.map((b) => {
        if (b.id === billId) {
          changedBill = {
            ...b,
            updatedAt: nowIso,
            header: {
              ...b.header,
              updatedAt: nowIso,
              salesmanCode: salesmanCode || '',
              salespersonName: salesmanName || ''
            }
          };
          return changedBill;
        }
        return b;
      });
      const updated = deduplicateBills(updatedRaw);

      storedBillsRef.current = updated;
      lastSyncedSliceJsonRef.current.storedBills = JSON.stringify(updated);
      localSliceModifiedAtRef.current.storedBills = Date.now();
      idbSaveFailoverData('polycables_stored_bills', updated).catch(() => {});
      safeSetStorageItem('polycables_stored_bills', JSON.stringify(buildLightStoredBillsForStorage(updated)), updated);
      scheduleCloudSync(
        {
          storedBills: updated,
          ...(changedBill ? { _billUpserts: [changedBill], _skipFirestoreSlice: 'storedBills' } : {})
        },
        true
      );

      return updated;
    });

    if (editingBillId === billId) {
      setHeader((prev) => ({
        ...prev,
        salesmanCode: salesmanCode || '',
        salespersonName: salesmanName || ''
      }));
    }
  };

  // Update line item descriptions/codes/IDs on Stored Bills (e.g. matching legacy bill items to active catalog while preserving historical prices/totals)
  const handleUpdateStoredBillsLineItems = (billLineUpdates: Record<string, BillLineItem[]>) => {
    const updateIds = Object.keys(billLineUpdates || {});
    if (updateIds.length === 0) return;

    const nowIso = new Date().toISOString();
    setStoredBills((prev) => {
      const changedBills: StoredBill[] = [];
      const updatedRaw = prev.map((b) => {
        if (!billLineUpdates[b.id]) return b;
        const updatedBill: StoredBill = {
          ...b,
          updatedAt: nowIso,
          lines: billLineUpdates[b.id]
        };
        changedBills.push(updatedBill);
        return updatedBill;
      });
      const updated = deduplicateBills(updatedRaw);

      storedBillsRef.current = updated;
      lastSyncedSliceJsonRef.current.storedBills = JSON.stringify(updated);
      localSliceModifiedAtRef.current.storedBills = Date.now();
      idbSaveFailoverData('polycables_stored_bills', updated).catch(() => {});
      safeSetStorageItem('polycables_stored_bills', JSON.stringify(buildLightStoredBillsForStorage(updated)), updated);
      scheduleCloudSync(
        {
          storedBills: updated,
          ...(changedBills.length > 0 ? { _billUpserts: changedBills, _skipFirestoreSlice: 'storedBills' } : {})
        },
        true
      );

      return updated;
    });

    if (editingBillId && billLineUpdates[editingBillId]) {
      setLines(billLineUpdates[editingBillId]);
    }
  };

  // Delete stored bill: Immediate multi-tier purge guaranteeing bills never return after refresh
  const handleDeleteStoredBill = (id: string) => {
    if (!checkCanTakeEntry('Delete Bill', (msg) => setAppToast({ text: msg, type: 'error' }))) {
      return;
    }

    // 1. Record in global deleted tracker
    recordDeletedEntityId(id);
    const prevBills = [...storedBills];
    const targetBill = prevBills.find((b) => b.id === id);

    // 2. Safely archive to trash
    if (targetBill) {
      const isOffice = Boolean(targetBill.isOfficeBill || targetBill.header?.isOfficeBill);
      const isDraft = Boolean(targetBill.header?.isDraft || targetBill.header?.status === 'draft');
      const catTitle = isDraft ? 'Draft Bill' : (isOffice ? 'Office Bill' : 'Sales Center Bill');
      moveToTrash('polycables_trashed_bills', targetBill, catTitle);
    }

    // 3. Purge from local React state
    const nextBills = prevBills.filter((b) => b.id !== id && !isGloballyDeletedId(b.id));
    setStoredBills(nextBills);
    storedBillsRef.current = nextBills;

    // 4. Clean local storage and failover caches
    const lightNextBills = buildLightStoredBillsForStorage(nextBills);
    safeSetStorageItem('polycables_stored_bills', JSON.stringify(lightNextBills), nextBills);
    try {
      localStorage.removeItem('polycables_stored_bills_cache');
    } catch {}

    // 5. Update IndexedDB failover store
    idbSaveFailoverData('polycables_stored_bills', nextBills).catch(() => {});

    if (editingBillId === id) {
      setEditingBillId(null);
      try {
        localStorage.removeItem('polycables_editing_bill_id');
      } catch {}
    }

    const currentDeleted = getGlobalDeletedIds();
    lastSyncedSliceJsonRef.current.storedBills = JSON.stringify(nextBills);
    localSliceModifiedAtRef.current.storedBills = Date.now();

    // 6. Instant /api/sync update + debounced single-bill Firestore delete
    scheduleCloudSync(
      {
        storedBills: nextBills,
        deletedEntityIds: currentDeleted,
        _replaceStoredBills: true,
        _billDeletes: [id],
        _skipFirestoreSlice: 'storedBills'
      },
      true
    );

    // 7. Immediate backend sync API delete request
    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: clientSyncIdRef.current,
        ids: [id],
        type: 'bill'
      })
    }).catch((err) => {
      console.warn('[Bill Delete API Note]:', err);
    });
  };

  // Salesperson Management Handlers
  const handleAddSalesperson = (sp: Omit<Salesperson, 'id'> | Salesperson) => {
    if (!checkCanTakeEntry('Add Salesperson / User', (msg) => setAppToast({ text: msg, type: 'error' }))) {
      return;
    }
    const newSp: Salesperson = {
      ...sp,
      isApproved: true,
      id: (sp as Salesperson).id || `sp-${Date.now()}`
    };
    setSalespersons((prev) => {
      const filtered = prev.filter(
        (s) => s.id !== newSp.id && s.code.toLowerCase() !== newSp.code.toLowerCase()
      );
      const updated = [...filtered, newSp];
      safeSetStorageItem('polycables_salespersons', JSON.stringify(updated), updated);
      scheduleCloudSync({ salespersons: updated }, true);
      return updated;
    });
  };

  const handleUpdateSalesperson = (updatedSp: Salesperson) => {
    if (!checkCanTakeEntry('Update Salesperson', (msg) => setAppToast({ text: msg, type: 'error' }))) {
      return;
    }
    const stampedSp: Salesperson = { ...updatedSp, updatedAt: Date.now() };
    setSalespersons((prev) => {
      const updated = prev.map((s) => (s.id === stampedSp.id ? stampedSp : s));
      safeSetStorageItem('polycables_salespersons', JSON.stringify(updated), updated);
      scheduleCloudSync({ salespersons: updated }, true);
      return updated;
    });

    // If the updated user is the current active session, immediately synchronize designation, role, and details
    if (
      currentUser &&
      (currentUser.salespersonCode === updatedSp.code ||
       currentUser.username?.toLowerCase() === (updatedSp.username || updatedSp.code).toLowerCase() ||
       (currentUser as any).id === updatedSp.id)
    ) {
      const roleLower = (updatedSp.role || '').toLowerCase();
      const isAdminRole = roleLower === 'admin' || updatedSp.role === 'Admin' || (updatedSp.code && updatedSp.code.startsWith('ADM'));
      const isAgmRole = roleLower.includes('agm') || roleLower.includes('director') || roleLower.includes('general manager');
      const isStrictSuper = Boolean(updatedSp.isSuperAdmin || updatedSp.role === 'Super Admin');
      setCurrentUser((prevCur) => {
        if (!prevCur) return null;
        const nextCur: AuthUser = {
          ...prevCur,
          name: updatedSp.name,
          username: updatedSp.username || updatedSp.code,
          salespersonCode: updatedSp.code,
          role: isAdminRole ? 'admin' : (isAgmRole ? 'agm' : 'salesperson'),
          userRole: updatedSp.role || (isAdminRole ? 'Admin' : 'Sales Representative'),
          designation: updatedSp.designation || 'Executive',
          isInCharge: Boolean(updatedSp.isInCharge),
          branchId: updatedSp.branchId,
          branchName: updatedSp.branchName,
          isSuperAdmin: isStrictSuper
        };
        try {
          localStorage.setItem('app_current_user', JSON.stringify(nextCur));
        } catch {}
        return nextCur;
      });
    }

    // Sync salesperson name update in parties
    setParties((prev) =>
      prev.map((p) => {
        if (p.salesmanCode && p.salesmanCode.toLowerCase() === updatedSp.code.toLowerCase()) {
          return { ...p, salespersonName: updatedSp.name };
        }
        return p;
      })
    );
  };

  const handleUpdateAllSalespersons = (updatedList: Salesperson[]) => {
    if (!checkCanTakeEntry('Update Salespersons', (msg) => setAppToast({ text: msg, type: 'error' }))) {
      return;
    }
    setSalespersons(updatedList);
    safeSetStorageItem('polycables_salespersons', JSON.stringify(updatedList), updatedList);
    scheduleCloudSync({ salespersons: updatedList }, true);
  };

  const handleDeleteSalesperson = (id: string) => {
    if (!checkCanTakeEntry('Delete User', (msg) => setAppToast({ text: msg, type: 'error' }))) {
      return;
    }
    recordDeletedEntityId(id);
    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: clientSyncIdRef.current, ids: [id], type: 'salesperson' })
    }).catch(() => {});

    const spToDelete = salespersons.find((s) => s.id === id);
    if (spToDelete) {
      if (
        currentUser &&
        (currentUser.salespersonCode === spToDelete.code ||
         currentUser.username?.toLowerCase() === (spToDelete.username || spToDelete.code).toLowerCase() ||
         (currentUser as any).id === id)
      ) {
        setAppToast({ text: `Account "${spToDelete.name}" has been deleted. Access blocked.`, type: 'error' });
        handleLogout();
      }
      moveToTrash('polycables_trashed_users', spToDelete, 'Salespersons / Users');
      // If deleted user was an admin, unassign their managed branches
      const isSpAdmin =
        spToDelete.role === 'Admin' ||
        (spToDelete.code && spToDelete.code.toUpperCase().startsWith('ADM')) ||
        spToDelete.username?.startsWith('admin');
      if (isSpAdmin) {
        setBranches((prev) => {
          const updatedB = prev.map((b) => {
            if (
              b.adminId === spToDelete.id ||
              b.adminUsername === spToDelete.username ||
              b.adminName === spToDelete.name ||
              spToDelete.assignedBranchIds?.includes(b.id)
            ) {
              return {
                ...b,
                adminId: undefined,
                adminName: undefined,
                adminUsername: undefined
              };
            }
            return b;
          });
          safeSetStorageItem('polycables_branches', JSON.stringify(updatedB), updatedB);
          scheduleCloudSync({ branches: updatedB, deletedEntityIds: getGlobalDeletedIds() }, true);
          return updatedB;
        });
      }
    }
    setSalespersons((prev) => {
      const updated = prev.filter((s) => s.id !== id && !isGloballyDeletedId(s.id));
      safeSetStorageItem('polycables_salespersons', JSON.stringify(updated), updated);
      scheduleCloudSync({ salespersons: updated, deletedEntityIds: getGlobalDeletedIds() }, true);
      return updated;
    });
    if (spToDelete) {
      // Clear salesman links from parties assigned to deleted salesperson
      setParties((prev) =>
        prev.map((p) => {
          if (p.salesmanCode && p.salesmanCode.toLowerCase() === spToDelete.code.toLowerCase()) {
            return {
              ...p,
              salesmanCode: undefined,
              salespersonName: undefined
            };
          }
          return p;
        })
      );
    }
  };

  // Branch / Showroom Management Handlers
  const handleAddBranch = (branch: Omit<BranchLocation, 'id'>) => {
    if (!checkCanTakeEntry('Add Branch', (msg) => setAppToast({ text: msg, type: 'error' }))) {
      return;
    }
    const newBranch: BranchLocation = {
      ...branch,
      id: `branch-${Date.now()}`,
      isUserCreated: true,
      adminId:
        branch.adminId ||
        (currentUser && isAnyAdmin(currentUser) && !isStrictSuperAdmin(currentUser)
          ? currentUser.id || currentUser.username
          : undefined)
    };
    setBranches((prev) => {
      const updated = sanitizeAndSortBranches([...prev, newBranch]);
      safeSetStorageItem('polycables_branches', JSON.stringify(updated), updated);
      scheduleCloudSync({ branches: updated }, true);
      return updated;
    });
  };

  const handleUpdateBranch = (updatedBranch: BranchLocation) => {
    if (!checkCanTakeEntry('Update Branch', (msg) => setAppToast({ text: msg, type: 'error' }))) {
      return;
    }
    setBranches((prev) => {
      const updated = sanitizeAndSortBranches(prev.map((b) => (b.id === updatedBranch.id ? updatedBranch : b)));
      safeSetStorageItem('polycables_branches', JSON.stringify(updated), updated);
      scheduleCloudSync({ branches: updated }, true);
      return updated;
    });
  };

  const handleDeleteBranch = (id: string) => {
    if (!checkCanTakeEntry('Delete Branch', (msg) => setAppToast({ text: msg, type: 'error' }))) {
      return;
    }
    const targetBranch = branches.find((b) => b.id === id);
    if (targetBranch && isProtectedSalesCenter(targetBranch, salespersons)) {
      alert(`"${targetBranch.name}" is a core Sales Center assigned to Default Admin and CANNOT be deleted or removed from the system.`);
      return;
    }
    if (targetBranch) {
      moveToTrash('polycables_trashed_branches', targetBranch, 'Sales Centers');
    }
    recordDeletedEntityId(id);
    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: clientSyncIdRef.current, ids: [id], type: 'branch' })
    }).catch(() => {});

    setBranches((prev) => {
      const updated = sanitizeAndSortBranches(prev.filter((b) => b.id !== id && !isGloballyDeletedId(b.id)));
      safeSetStorageItem('polycables_branches', JSON.stringify(updated), updated);
      scheduleCloudSync({ branches: updated, deletedEntityIds: getGlobalDeletedIds() }, true);
      return updated;
    });
  };

  // Reset bill (clear party & selected items)
  const handleResetSample = () => {
    const isOffice = Boolean(header.isOfficeBill);
    const allowedBranches = withHeadOfficeForAdmin(
      filterBranchesForUser(branches, currentUser, salespersons),
      currentUser
    );
    const isSuperOrAcc = isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser) || isAnyAdmin(currentUser);
    const isSingleRestricted = !isSuperOrAcc && allowedBranches.length <= 1;
    const { branchId: userBranchId, branchName: userBranchName } = getUserBranch(currentUser, salespersons, allowedBranches.length > 0 ? allowedBranches : branches);
    const userBranchObj =
      allowedBranches.find((b) => b.id === userBranchId) ||
      allowedBranches.find((b) => cleanBranchName(b.name).toLowerCase() === cleanBranchName(userBranchName).toLowerCase()) ||
      allowedBranches[0];
    const headerBranchObj =
      header.branchId && header.branchId.toLowerCase() !== 'all'
        ? allowedBranches.find((b) => b.id === header.branchId)
        : null;
    const isKeepAllForAdmin = isSuperOrAcc && (!header.branchId || header.branchId.toLowerCase() === 'all');
    const activeBranchObj = isKeepAllForAdmin
      ? null
      : isSingleRestricted
        ? (userBranchObj || branches[0])
        : (headerBranchObj || (isSuperOrAcc ? null : userBranchObj || branches[0]));
    const nextNo = computeNextBillNumber(storedBills, isOffice, activeBranchObj);
    setEditingBillId(null);
    setHasSavedCurrentBill(false);

    setHeader({
      billNo: nextNo,
      date: new Date().toISOString().split('T')[0],
      partyName: '',
      address: '',
      salesmanCode: '',
      orderNumber: '',
      challanNo: '',
      refNo: '',
      discountPercent: 0,
      isOfficeBill: isOffice,
      branchId: isKeepAllForAdmin ? 'ALL' : activeBranchObj?.id,
      branchName: isKeepAllForAdmin
        ? (isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser) ? 'All Sales Centers' : `All Assigned Centers (${allowedBranches.length})`)
        : activeBranchObj?.name
    });

    setLines([
      {
        id: `line-${Date.now()}`,
        slNo: 1,
        itemDescription: '',
        sizeSpec: '',
        coilQty: 1,
        unit: 'Coils',
        rate: 0,
        amount: 0
      }
    ]);
  };

  // Export Excel
  const handleExportExcel = () => {
    exportBillToExcel(company, header, lines, items);
  };

  // Print Invoice
  const handlePrint = () => {
    window.print();
  };

  const [snapshotSyncTick, setSnapshotSyncTick] = useState(0);
  useEffect(() => {
    const bumpSnapshot = () => setSnapshotSyncTick((t) => t + 1);
    window.addEventListener('polycables_price_snapshots_updated', bumpSnapshot);
    window.addEventListener('polycables_snapshots_updated', bumpSnapshot);
    window.addEventListener('polycables_active_price_circular_changed', bumpSnapshot);
    return () => {
      window.removeEventListener('polycables_price_snapshots_updated', bumpSnapshot);
      window.removeEventListener('polycables_snapshots_updated', bumpSnapshot);
      window.removeEventListener('polycables_active_price_circular_changed', bumpSnapshot);
    };
  }, []);

  // Strictly keep Master Item Directory synchronized with active Price Update History list (or empty when none has items)
  useEffect(() => {
    const snaps = getPriceListSnapshots();
    const rec = reconcileCatalogItemsWithActiveSnapshot(itemsRef.current, snaps);
    if (rec.changed) {
      itemsRef.current = rec.items;
      setItems(rec.items);
      try {
        if (rec.items.length === 0) {
          localStorage.setItem('polycables_items_cleared', 'true');
        } else {
          localStorage.removeItem('polycables_items_cleared');
        }
        const nextStr = JSON.stringify(rec.items);
        safeSetStorageItem('polycables_items', nextStr, rec.items);
        const spList = rec.items.filter((it: any) => it?.isSpecialItem);
        safeSetStorageItem('polycables_special_items', JSON.stringify(spList), spList);
        idbSaveFailoverData('polycables_items', rec.items).catch(() => {});
        idbSaveFailoverData('polycables_special_items', spList).catch(() => {});
      } catch {}
    }
  }, [snapshotSyncTick, items]);

  const activeMasterItemCount = useMemo(() => {
    void snapshotSyncTick;
    return items.filter((i) => i.isActive !== false && !i.isSpecialItem).length;
  }, [items, snapshotSyncTick]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      // Shift + ? or F1 or Alt + K: Open Keyboard Shortcuts in Settings view
      if ((e.key === '?' && e.shiftKey && !isInput) || e.key === 'F1' || (e.altKey && (e.key === 'k' || e.key === 'K'))) {
        e.preventDefault();
        setActiveTab('settings', false, { settingsSubTab: 'shortcuts' });
        return;
      }

      // Ctrl + S: Save Bill
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleStoreCurrentBill();
        return;
      }

      // Alt + T: Open New Tab
      if (e.altKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        handleNewTab('report_dashboard');
        return;
      }

      // Alt + W: Close Active Tab
      if (e.altKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        handleCloseTab(activeTabId);
        return;
      }

      // Alt + [ or Alt + Left Arrow: Previous Tab
      if (e.altKey && (e.key === '[' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        const currentIdx = tabs.findIndex((t) => t.id === activeTabId);
        if (currentIdx > 0) {
          handleSelectTab(tabs[currentIdx - 1].id);
        }
        return;
      }

      // Alt + ] or Alt + Right Arrow: Next Tab
      if (e.altKey && (e.key === ']' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const currentIdx = tabs.findIndex((t) => t.id === activeTabId);
        if (currentIdx !== -1 && currentIdx < tabs.length - 1) {
          handleSelectTab(tabs[currentIdx + 1].id);
        }
        return;
      }

      // Alt + N: New Bill
      if (e.altKey && (e.key === 'n' || e.key === 'N') && !isInput) {
        e.preventDefault();
        handleNewBill(Boolean(e.ctrlKey || e.metaKey));
        return;
      }

      // Alt + E: Quick Expense
      if (e.altKey && (e.key === 'e' || e.key === 'E') && !isInput) {
        e.preventDefault();
        setActiveTab('expense_entry', Boolean(e.ctrlKey || e.metaKey));
        return;
      }

      // Alt + C: Collection Entry
      if (e.altKey && (e.key === 'c' || e.key === 'C') && !isInput) {
        e.preventDefault();
        setActiveTab('collection_entry', Boolean(e.ctrlKey || e.metaKey));
        return;
      }

      // Alt + B: Backup & Restore System
      if (e.altKey && (e.key === 'b' || e.key === 'B') && !isInput) {
        e.preventDefault();
        setActiveTab('settings', Boolean(e.ctrlKey || e.metaKey), { settingsSubTab: 'backup' });
        return;
      }

      // Alt + D: Delivery Challan
      if (e.altKey && (e.key === 'd' || e.key === 'D') && !isInput) {
        e.preventDefault();
        setActiveTab('challan_menu', Boolean(e.ctrlKey || e.metaKey));
        return;
      }

      // Alt + Number Keys (1-9, 0)
      if (e.altKey && !isNaN(Number(e.key))) {
        const num = Number(e.key);
        const isCtrl = Boolean(e.ctrlKey || e.metaKey);
        if (num === 1) { e.preventDefault(); setActiveTab('report_dashboard', isCtrl); }
        else if (num === 2) { e.preventDefault(); setActiveTab('builder', isCtrl); }
        else if (num === 3) { e.preventDefault(); setActiveTab('challan_menu', isCtrl); }
        else if (num === 4) { e.preventDefault(); setActiveTab('item_directory', isCtrl); }
        else if (num === 5) { e.preventDefault(); setActiveTab('party_directory', isCtrl); }
        else if (num === 6) { e.preventDefault(); setActiveTab('stored_bills', isCtrl); }
        else if (num === 7) { e.preventDefault(); setActiveTab('sales_report', isCtrl); }
        else if (num === 8) { e.preventDefault(); setActiveTab('customer_ledger', isCtrl); }
        else if (num === 9) { e.preventDefault(); setActiveTab('settings', isCtrl); }
        else if (num === 0) { e.preventDefault(); setActiveTab('cash_in_hand', isCtrl); }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabId, tabs, handleStoreCurrentBill, handleNewBill, handleNewTab, handleCloseTab, handleSelectTab, setActiveTab]);

  // Pending Delivery Challans Count (excludes fully billed challans)
  const pendingDeliveryChallansCount = useMemo(() => {
    return visibleDeliveryChallans.filter((ch) => {
      const dueQ = ch.dueQuantity ?? Math.max(0, (ch.totalQuantity || 0) - (ch.billedQuantity || 0));
      return ch.status !== 'billed' && dueQ > 0;
    }).length;
  }, [visibleDeliveryChallans]);

  if (!currentUser) {
    return (
      <div className="min-h-screen flex flex-col aurora-app-canvas">
        {(!isCloudOnline || offlineWarning) && (
          <div className="bg-amber-600 text-white px-4 py-2 text-center text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-md sticky top-0 z-50">
            <WifiOff className="w-4 h-4 animate-pulse flex-shrink-0" />
            <span>{offlineWarning || 'No internet connection. Changes cannot be saved to the cloud'}</span>
          </div>
        )}
        <LoginPage
          salespersons={salespersons}
          branches={branches}
          onRegisterSalesperson={handleAddSalesperson}
          sessionExpiredMsg={sessionExpiredMsg}
          onLogin={(user) => {
            setSessionExpiredMsg('');
            try {
              localStorage.removeItem('polycables_stored_bills_filters');
              sessionStorage.removeItem('polycables_stored_bills_filters');
              localStorage.removeItem('polycables_report_marketing_person');
              localStorage.removeItem('polycables_editing_bill_id');
              localStorage.removeItem('polycables_bill_edit_origin');
            } catch {}

            const allowed = withHeadOfficeForAdmin(
              filterBranchesForUser(branches, user, salespersons),
              user
            );
            const userBr = getUserBranch(user, salespersons, allowed.length > 0 ? allowed : branches);
            const isSuperOrAccUser = isStrictSuperAdmin(user) || isAccountsAdmin(user) || isAnyAdmin(user);
            const isExplicitAll =
              isSuperOrAccUser ||
              ((user.branchId || '').toLowerCase() === 'all' && allowed.length > 1);
            const targetBranchObj = isExplicitAll
              ? null
              : (allowed.find((b) => b.id === userBr.branchId) ||
                  allowed.find((b) => cleanBranchName(b.name).toLowerCase() === cleanBranchName(userBr.branchName).toLowerCase()) ||
                  allowed[0] ||
                  branches[0]);
            const nextNo = computeBranchRunningBillNo(storedBills, targetBranchObj, false);
            const today = new Date().toISOString().split('T')[0];
            const userSp = salespersons.find(
              (s) =>
                (user.salespersonCode && s.code?.toLowerCase() === user.salespersonCode.toLowerCase()) ||
                (user.username && s.username?.toLowerCase() === user.username.toLowerCase()) ||
                (user.name && s.name?.toLowerCase() === user.name.toLowerCase())
            );
            const resolvedLoginBranch = isSuperOrAccUser
              ? null
              : isExplicitAll
                ? null
                : targetBranchObj || null;
            setEditingBillId(null);
            setHasSavedCurrentBill(false);
            setHeader({
              billNo: resolvedLoginBranch
                ? computeBranchRunningBillNo(storedBills, resolvedLoginBranch, false)
                : nextNo,
              date: today,
              orderDate: today,
              challanDate: today,
              partyName: '',
              address: '',
              salesmanCode: userSp?.code || user.salespersonCode || '',
              salespersonName: userSp?.name || (user.salespersonCode ? user.name : ''),
              orderNumber: '',
              challanNo: '',
              refNo: '',
              discountPercent: 0,
              isOfficeBill: false,
              branchId: resolvedLoginBranch
                ? resolvedLoginBranch.id
                : (isExplicitAll ? 'ALL' : (userBr.branchId || '')),
              branchName: resolvedLoginBranch
                ? resolvedLoginBranch.name
                : (isExplicitAll
                  ? (isStrictSuperAdmin(user) || isAccountsAdmin(user) ? 'All Sales Centers' : `All Assigned Centers (${allowed.length})`)
                  : (userBr.branchName || ''))
            });
            setLines([
              {
                id: `line-${Date.now()}`,
                slNo: 1,
                itemDescription: '',
                sizeSpec: '',
                coilQty: 0,
                unit: 'Coils',
                rate: 0,
                amount: 0
              }
            ]);

            setCurrentUser(user);
            if (isFactoryUser(user)) {
              setActiveTabId('tab-factory');
            } else if (isStrictSuperAdmin(user) || isAnyAdmin(user)) {
              setActiveTabId('tab-dashboard-admin');
            } else {
              setActiveTabId('tab-main-menu');
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen aurora-app-canvas flex flex-col font-sans text-slate-100">
      {/* Connectivity Warning Banner (offline network only) */}
      {(!isCloudOnline || offlineWarning) && (
        <div className="bg-amber-600 text-white px-4 py-2 text-center text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-md sticky top-0 z-50">
          <WifiOff className="w-4 h-4 animate-pulse flex-shrink-0" />
          <span>{offlineWarning || 'No internet connection. Changes cannot be saved to the cloud'}</span>
        </div>
      )}

      {/* Navigation Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onExportExcel={handleExportExcel}
        onPrint={handlePrint}
        onSaveCurrentBill={handleStoreCurrentBill}
        onNewBill={handleNewBill}
        itemCount={activeMasterItemCount}
        storedBillsCount={storedBills.length}
        challansCount={pendingDeliveryChallansCount}
        currentUser={currentUser}
        branches={branches}
        onLogout={handleLogout}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        onOpenShortcuts={() => setShortcutsModalOpen(true)}
        company={company}
      />

      {/* Main Container with Left Sidebar & Multi-Tab Area */}
      <div className="flex-1 flex w-full relative pt-[54px] md:pt-0">
        {/* Left Side Panel Navigation */}
        <Sidebar
          currentUser={currentUser}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          itemCount={activeMasterItemCount}
          storedBillsCount={storedBills.length}
          challansCount={pendingDeliveryChallansCount}
          requisitionsCount={requisitions.length}
          onNewBill={handleNewBill}
          isOfficeBillActive={Boolean(header.isOfficeBill)}
          itemSubTab={itemSubTab}
          setItemSubTab={setItemSubTab}
          expenseSubTab={expenseSubTab}
          setExpenseManagerTab={setExpenseSubTab}
          reportSubTab={reportSubTab}
          setReportDashboardTab={setReportSubTab}
          settingsSubTab={settingsSubTab}
          setSettingsSubTab={setSettingsSubTab}
          requisitionSubTab={requisitionSubTab}
          setRequisitionSubTab={setRequisitionSubTab}
          factorySubTab={factorySubTab}
          setFactorySubTab={setFactorySubTab}
          approvedHubSubTab={approvedHubSubTab}
          setApprovedHubSubTab={setApprovedHubSubTab}
          isOpenMobile={isMobileSidebarOpen}
          setIsOpenMobile={setIsMobileSidebarOpen}
          onOpenShortcuts={() => setActiveTab('settings', false, { settingsSubTab: 'shortcuts' })}
        />

        {/* Right Section: Multi-Tab Chrome Bar + Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Chrome Multi-Tab Browser Bar */}
          <ChromeTabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelectTab={handleSelectTab}
            onCloseTab={handleCloseTab}
            onNewTab={handleNewTab}
            onCloseOtherTabs={handleCloseOtherTabs}
            onDuplicateTab={handleDuplicateTab}
            onOpenShortcuts={() => setActiveTab('settings', false, { settingsSubTab: 'shortcuts' })}
            onBack={handleBack}
          />

          {/* Main Content Area */}
          <main
            id="main-content-area"
            className={`flex-1 w-full min-w-0 overflow-x-hidden overflow-y-auto ${
              activeTab === 'stored_bills' ? 'p-1 sm:p-1.5 flex flex-col' : 'pt-1 sm:pt-1.5 px-2 sm:px-5 pb-6'
            }`}
          >
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-20 text-cyan-300 text-xs font-semibold gap-2.5">
                  <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  <span>Loading module...</span>
                </div>
              }
            >
        {(activeTab === 'main_menu' || (activeTab === 'report_dashboard' && reportSubTab === 'executive_dashboard')) && !isFactoryUser(currentUser) && (
          <div className="max-w-7xl mx-auto">
            <MainMenuPage
              storedBills={visibleStoredBills}
              collections={visibleCollections}
              bankDeposits={visibleBankDeposits}
              parties={visibleParties}
              salespersons={isStrictSuperAdmin(currentUser) ? salespersons : visibleSalespersons}
              items={items}
              deliveryChallans={visibleDeliveryChallans}
              requisitions={visibleRequisitions}
              company={company}
              currentUser={currentUser}
              branches={isStrictSuperAdmin(currentUser) ? branches : visibleBranches}
              allBranches={branches}
              allStoredBills={storedBills}
              allCollections={collections}
              onSyncCloud={scheduleCloudSync}
              onNavigate={(tab, itemSub, repSub, expSub, setSub, reqSub) => {
                setActiveTab(tab, false, {
                  itemSubTab: itemSub,
                  reportSubTab: repSub,
                  expenseSubTab: expSub,
                  settingsSubTab: setSub,
                  requisitionSubTab: reqSub
                });
              }}
              onNewBill={handleNewBill}
              onOpenShortcuts={() => setShortcutsModalOpen(true)}
              unreadCommCount={unreadCommCount}
              onOpenNotifications={() => {
                unlockAudio();
                setIsCommHubOpen(true);
              }}
            />
          </div>
        )}

        {activeTab === 'builder' && (
          <div className="max-w-4xl mx-auto">
            <ErrorBoundary fallbackTitle="Invoice & Bill Editor" onReset={handleResetSample}>
              <BillInvoiceView
                company={company}
                setCompany={setCompany}
                header={header}
                setHeader={setHeader}
                lines={lines}
                setLines={setLines}
                items={items}
                setItems={setItems}
                onAddItem={(item) => {
                  setItems((prev) => {
                    const next = sanitizeAndDeduplicateItems([...prev.filter((i) => i.id !== item.id), item]);
                    safeSetStorageItem('polycables_items', JSON.stringify(next), next);
                    const specialList = next.filter((it) => it.isSpecialItem);
                    safeSetStorageItem('polycables_special_items', JSON.stringify(specialList), specialList);
                    scheduleCloudSync({ items: next, specialItems: specialList, _replaceItems: true, itemsVersion: Date.now() }, true);
                    return next;
                  });
                }}
                parties={visibleParties}
                setParties={setParties}
                onAddParty={(newParty) => {
                  setParties((prev) => {
                    const next = [...prev, newParty];
                    localStorage.setItem('polycables_parties', JSON.stringify(next));
                    scheduleCloudSync({ parties: next }, true);
                    return next;
                  });
                }}
                salespersons={isStrictSuperAdmin(currentUser) ? salespersons : visibleSalespersons}
                branches={isStrictSuperAdmin(currentUser) ? branches : visibleBranches}
                currentUser={currentUser}
                factoryImports={factoryImports}
                storedBills={visibleStoredBills}
                allStoredBills={storedBills}
                stockReturns={visibleStockReturns}
                editingBillId={editingBillId}
                setEditingBillId={setEditingBillId}
                onSaveBill={handleStoreCurrentBill}
                onStoreImportedBill={handleStoreImportedBill}
                onNewBill={handleNewBill}
                onResetSample={handleResetSample}
                onBack={handleBack}
                onClose={handleClose}
                onCancel={() => {
                  if (isConvertedFromReq || (header.refNo && (header.refNo.toLowerCase().includes('req') || header.refNo.toLowerCase().includes('sq')))) {
                    setIsConvertedFromReq(false);
                    setActiveTab('requisition');
                  } else if (handleReturnFromBillEdit()) {
                    // Returned to origin
                  } else {
                    handleClose();
                  }
                }}
              />
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 'item_directory' && (
          <div className="max-w-5xl mx-auto">
            <Sheet2ItemManager
              items={items}
              setItems={setItems}
              factoryImports={factoryImports}
              setFactoryImports={setFactoryImports}
              stockReturns={stockReturns}
              deliveryChallans={deliveryChallans}
              colorExchanges={colorExchanges}
              company={company}
              branches={isSuperAdminOrAgm(currentUser) ? branches : visibleBranches}
              storedBills={storedBills}
              setStoredBills={setStoredBills}
              onResetItems={() => {
                try {
                  localStorage.removeItem('polycables_items_cleared');
                  localStorage.removeItem('polycables_deleted_item_ids');
                } catch {}
                const defIds = defaultItems.map((i) => i.id);
                unrecordDeletedIdsLocally(defIds);
                setItems(defaultItems);
                scheduleCloudSync(
                  {
                    items: defaultItems,
                    specialItems: defaultItems.filter((i) => i.isSpecialItem),
                    _itemsCleared: false,
                    restoredEntityIds: defIds
                  },
                  true
                );
              }}
              subTab={itemSubTab}
              setSubTab={setItemSubTab}
              currentUser={currentUser}
              requisitions={requisitions}
              setRequisitions={setRequisitions}
              onBack={handleBack}
              onClose={handleClose}
              onSyncCloud={scheduleCloudSync}
            />
          </div>
        )}

        {activeTab === 'price_history' && (
          <div className="max-w-7xl mx-auto">
            <PriceUpdateHistoryPage
              items={items}
              setItems={setItems}
              company={company}
              branches={isSuperAdminOrAgm(currentUser) ? branches : visibleBranches}
              currentUser={currentUser}
              onBack={handleBack}
              onClose={handleClose}
              onSyncCloud={scheduleCloudSync}
            />
          </div>
        )}

        {activeTab === 'sales_report' && (
          <div className="max-w-6xl mx-auto">
            <SalesReportView
              items={items}
              storedBills={visibleStoredBills}
              deliveryChallans={visibleDeliveryChallans}
              factoryImports={factoryImports}
              stockReturns={visibleStockReturns}
              colorExchanges={colorExchanges}
              parties={visibleParties}
              salespersons={isStrictSuperAdmin(currentUser) ? salespersons : visibleSalespersons}
              branches={isStrictSuperAdmin(currentUser) ? branches : visibleBranches}
              currentUser={currentUser}
              onBack={handleBack}
              onClose={handleClose}
            />
          </div>
        )}

        {activeTab === 'sales_items' && (
          <div className="max-w-6xl mx-auto">
            <SalesReportItemView
              storedBills={isStrictSuperAdmin(currentUser) ? storedBills : visibleStoredBills}
              items={items}
              parties={isStrictSuperAdmin(currentUser) ? parties : visibleParties}
              salespersons={isStrictSuperAdmin(currentUser) ? salespersons : visibleSalespersons}
              branches={isStrictSuperAdmin(currentUser) ? branches : visibleBranches}
              company={company}
              currentUser={currentUser}
              onBack={handleBack}
            />
          </div>
        )}

        {(activeTab === 'report_dashboard' || activeTab === 'customer_ledger') && (
          <div className="max-w-6xl mx-auto">
            <ReportDashboard
              key={`${activeTab}-${reportSubTab}-${selectedLedgerPartyId || 'all'}`}
              storedBills={visibleStoredBills}
              collections={visibleCollections}
              bankDeposits={visibleBankDeposits}
              parties={visibleParties}
              salespersons={visibleSalespersons}
              company={company}
              items={items}
              deliveryChallans={visibleDeliveryChallans}
              branches={isStrictSuperAdmin(currentUser) ? branches : visibleBranches}
              selectedPartyId={selectedLedgerPartyId}
              reportSubTab={reportSubTab}
              initialStatementViewMode={activeTab === 'customer_ledger' || !!selectedLedgerPartyId ? 'grouped' : 'unified'}
              currentUser={currentUser}
              financialYearClosings={closings}
              onSaveClosing={handleSaveClosing}
              onReopenClosing={handleReopenClosing}
              onDeleteClosing={handleDeleteClosing}
              onUpdateClosing={handleUpdateClosing}
              onLoadBill={handleLoadStoredBill}
              setCollections={setCollections}
              bankList={bankList}
              onSyncCloud={scheduleCloudSync}
              onBack={handleBack}
              onClose={handleClose}
            />
          </div>
        )}

        {activeTab === 'stored_bills' && (
          <div className="w-full max-w-none flex-1 flex flex-col min-h-[calc(100vh-7.4rem)]">
            <ErrorBoundary fallbackTitle="Stored Bills Directory">
              <StoredBillsDirectory
                storedBills={isStrictSuperAdmin(currentUser) ? storedBills : visibleStoredBills}
                isCloudLoading={isCloudBillsLoading}
                items={items}
                salespersons={isStrictSuperAdmin(currentUser) ? salespersons : visibleSalespersons}
                branches={isStrictSuperAdmin(currentUser) ? branches : visibleBranches}
                parties={isStrictSuperAdmin(currentUser) ? parties : visibleParties}
                currentUser={currentUser}
                focusedBillId={focusedStoredBillId}
                onLoadBill={handleLoadStoredBill}
                onDeleteBill={handleDeleteStoredBill}
                onUpdateReceivedCopy={handleUpdateBillReceivedCopy}
                onExportAllBills={handleExportExcel}
                onClearAllBills={handleClearAllBills}
                onRemoveDuplicates={handleRemoveDuplicateBills}
                onUpdateSalesman={handleUpdateBillSalesman}
                onUpdateStoredBillsLineItems={handleUpdateStoredBillsLineItems}
                onImportBill={() => {
                  setActiveTab('builder');
                  let attempts = 0;
                  const tryClick = () => {
                    attempts++;
                    const el = document.getElementById('bill-file-upload-input') as HTMLInputElement | null;
                    if (el) {
                      el.click();
                    } else if (attempts < 12) {
                      setTimeout(tryClick, 50);
                    }
                  };
                  setTimeout(tryClick, 40);
                }}
                onBack={handleBack}
                onClose={handleClose}
              />
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 'party_directory' && (
          <div className="w-full max-w-7xl mx-auto px-0 sm:px-2">
            <PartyDirectory
              parties={visibleParties}
              salespersons={isStrictSuperAdmin(currentUser) ? salespersons : visibleSalespersons}
              branches={isStrictSuperAdmin(currentUser) ? branches : visibleBranches}
              currentUser={currentUser}
              setParties={setParties}
              storedBills={storedBills}
              setStoredBills={setStoredBills}
              deliveryChallans={deliveryChallans}
              setDeliveryChallans={setDeliveryChallans}
              collections={collections}
              setCollections={setCollections}
              onSyncCloud={scheduleCloudSync}
              onSelectPartyForBill={(p) => {
                setSelectedLedgerPartyId(p.id);
                setReportSubTab('customer_wise_sales_collection');
                setActiveTab('customer_ledger', false, { reportSubTab: 'customer_wise_sales_collection' });
              }}
              onSelectPartyForLedger={(p) => {
                setSelectedLedgerPartyId(p.id);
                setReportSubTab('customer_wise_sales_collection');
                setActiveTab('customer_ledger', false, { reportSubTab: 'customer_wise_sales_collection' });
              }}
              onBack={handleBack}
              onClose={handleClose}
            />
          </div>
        )}

        {activeTab === 'challan_menu' && (
          <div className="max-w-6xl mx-auto">
            <ChallanManager
              challans={visibleDeliveryChallans}
              setChallans={setDeliveryChallans}
              items={items}
              setItems={setItems}
              onAddItem={(item) => {
                setItems((prev) => {
                  const next = sanitizeAndDeduplicateItems([...prev.filter((i) => i.id !== item.id), item]);
                  safeSetStorageItem('polycables_items', JSON.stringify(next), next);
                  const specialList = next.filter((it) => it.isSpecialItem);
                  safeSetStorageItem('polycables_special_items', JSON.stringify(specialList), specialList);
                  scheduleCloudSync({ items: next, specialItems: specialList, _replaceItems: true, itemsVersion: Date.now() }, true);
                  return next;
                });
              }}
              parties={visibleParties}
              salespersons={isStrictSuperAdmin(currentUser) ? salespersons : visibleSalespersons}
              company={company}
              factoryImports={factoryImports}
              storedBills={visibleStoredBills}
              stockReturns={visibleStockReturns}
              currentUser={currentUser}
              branches={isStrictSuperAdmin(currentUser) ? branches : visibleBranches}
              onSyncCloud={scheduleCloudSync}
              onOpenInvoicerWithBill={(bHeader, bLines) => {
                const branchListWithHo = withHeadOfficeForAdmin(branches, currentUser);
                const isSuperOrAcc = isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser) || isAnyAdmin(currentUser);
                const isAll = (bHeader.branchId || '').toLowerCase() === 'all' || (!bHeader.branchId && isSuperOrAcc);
                const targetBranchId = isAll ? 'ALL' : (bHeader.branchId || getUserBranch(currentUser, salespersons, branchListWithHo).branchId);
                const targetBranchObj = isAll
                  ? null
                  : (branchListWithHo.find((b) => b.id === targetBranchId || cleanBranchName(b.name).toLowerCase() === cleanBranchName(bHeader.branchName).toLowerCase()) ||
                    branchListWithHo[0]);
                const nextNo = computeNextBillNumber(storedBills, Boolean(bHeader.isOfficeBill), targetBranchObj);
                setHeader({
                  ...bHeader,
                  branchId: isAll ? 'ALL' : (bHeader.branchId || targetBranchObj?.id),
                  branchName: isAll
                    ? (isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser) ? 'All Sales Centers' : `All Assigned Centers (${branchListWithHo.length})`)
                    : (bHeader.branchName || targetBranchObj?.name),
                  billNo: nextNo
                });
                setLines(bLines);
                setEditingBillId(null);
                setActiveTab('builder');
              }}
              onBack={handleBack}
              onClose={handleClose}
            />
          </div>
        )}

        {activeTab === 'color_exchange' && (
          <div className="max-w-6xl mx-auto">
            <ColorExchangeManager
              parties={visibleParties}
              items={items}
              company={company}
              colorExchanges={colorExchanges}
              factoryImports={factoryImports}
              storedBills={visibleStoredBills}
              stockReturns={visibleStockReturns}
              onSaveColorExchange={handleSaveColorExchange}
              onDeleteColorExchange={handleDeleteColorExchange}
              onBack={handleBack}
              onClose={handleClose}
            />
          </div>
        )}

        {(activeTab === 'requisition' || activeTab === 'factory') && (
          <div className="w-full">
            <RequisitionPage
              subTab={activeTab === 'factory' ? (factorySubTab === 'delivered' ? 'delivered' : 'approved_history') : requisitionSubTab}
              setSubTab={(t: 'entry_slip' | 'list' | 'approved_history' | 'delivered') => {
                setRequisitionSubTab(t);
                if (t === 'approved_history' || t === 'delivered') {
                  setFactorySubTab(t);
                }
                setTabs((prev) =>
                  prev.map((tab) =>
                    tab.id === activeTabId
                      ? {
                          ...tab,
                          requisitionSubTab: t,
                          title: getTabMeta(tab.viewTab, undefined, undefined, undefined, undefined, t).title
                        }
                      : tab
                  )
                );
              }}
              requisitions={visibleRequisitions}
              setRequisitions={setRequisitions}
              items={items}
              parties={visibleParties}
              salespersons={isStrictSuperAdmin(currentUser) ? salespersons : visibleSalespersons}
              company={company}
              storedBills={visibleStoredBills}
              setStoredBills={setStoredBills}
              deliveryChallans={visibleDeliveryChallans}
              setDeliveryChallans={setDeliveryChallans}
              collections={visibleCollections}
              stockReturns={visibleStockReturns}
              currentUser={currentUser}
              branches={isStrictSuperAdmin(currentUser) ? branches : visibleBranches}
              factoryImports={factoryImports}
              onSyncCloud={scheduleCloudSync}
              onOpenBillInEditor={(bHeader, bLines) => {
                setIsConvertedFromReq(true);
                setHeader(bHeader);
                setLines(bLines);
                setEditingBillId(null);
                setActiveTab('builder');
              }}
              onOpenForecast={isShowroomInCharge ? () => setActiveTab('ai_sales_forecast') : undefined}
              onBack={handleBack}
              onClose={handleClose}
            />
          </div>
        )}


        {activeTab === 'slip_pad_memo' && (
          <div className="w-full">
            <SlipPadChallanView
              parties={visibleParties}
              items={items}
              salespersons={isStrictSuperAdmin(currentUser) ? salespersons : visibleSalespersons}
              company={company}
              deliveryChallans={visibleDeliveryChallans}
              setDeliveryChallans={setDeliveryChallans}
              currentUser={currentUser}
              branches={isStrictSuperAdmin(currentUser) ? branches : visibleBranches}
              onSaveChallan={(saved) => {
                const stamped = { ...saved, updatedAt: new Date().toISOString() };
                setDeliveryChallans((prev) => {
                  const next = [stamped, ...prev.filter((c) => c.id !== stamped.id)];
                  safeSetStorageItem('polycables_delivery_challans', JSON.stringify(next), next);
                  scheduleCloudSync({ deliveryChallans: next }, true);
                  return next;
                });
                emitErpNotification({
                  title: `Delivery Challan: #${stamped.challanNo || 'New'}`,
                  message: `${stamped.partyName || 'Party'} • ${stamped.totalQuantity || 0} Coils`,
                  type: 'challan',
                  branchName: stamped.branchName,
                  actorId: currentUser?.id || currentUser?.username,
                  actorName: currentUser?.name || currentUser?.username
                });
              }}
              onBack={handleBack}
              onClose={handleClose}
            />
          </div>
        )}

        {activeTab === 'returns_menu' && (
          <div className="max-w-6xl mx-auto">
            <ReturnsManager
              items={items}
              setItems={setItems}
              parties={visibleParties}
              salespersons={isStrictSuperAdmin(currentUser) ? salespersons : visibleSalespersons}
              branches={isStrictSuperAdmin(currentUser) ? branches : visibleBranches}
              currentUser={currentUser}
              stockReturns={visibleStockReturns}
              setStockReturns={setStockReturns}
              storedBills={visibleStoredBills}
              deliveryChallans={visibleDeliveryChallans}
              factoryImports={factoryImports}
              colorExchanges={colorExchanges}
              onSaveColorExchange={handleSaveColorExchange}
              onDeleteColorExchange={handleDeleteColorExchange}
              onSyncCloud={scheduleCloudSync}
              company={company}
              onBack={handleBack}
              onClose={handleClose}
            />
          </div>
        )}

        {activeTab === 'approved_menu' && (
          <div className="max-w-7xl mx-auto w-full px-2 sm:px-4 pt-0 pb-2 space-y-2">
            {approvedHubSubTab === 'sales_approved' ? (
              <div className="w-full">
                <RequisitionPage
                  subTab="list"
                  isApprovalPage={true}
                  requisitions={visibleRequisitions}
                  setRequisitions={setRequisitions}
                  items={items}
                  parties={visibleParties}
                  salespersons={isStrictSuperAdmin(currentUser) ? salespersons : visibleSalespersons}
                  company={company}
                  storedBills={visibleStoredBills}
                  setStoredBills={setStoredBills}
                  deliveryChallans={visibleDeliveryChallans}
                  setDeliveryChallans={setDeliveryChallans}
                  collections={visibleCollections}
                  stockReturns={visibleStockReturns}
                  currentUser={currentUser}
                  branches={isStrictSuperAdmin(currentUser) ? branches : visibleBranches}
                  factoryImports={factoryImports}
                  onSyncCloud={scheduleCloudSync}
                  onOpenBillInEditor={(bHeader, bLines) => {
                    setIsConvertedFromReq(true);
                    setHeader(bHeader);
                    setLines(bLines);
                    setActiveTab('builder');
                  }}
                  onOpenForecast={() => setActiveTab('ai_sales_forecast')}
                  onBack={handleBack}
                  onClose={handleClose}
                />
              </div>
            ) : approvedHubSubTab === 'expense_approved' ? (
              <div className="w-full">
                <ApproveExpenseHub
                  expenses={visibleExpenses}
                  setExpenses={setExpenses}
                  currentUser={currentUser}
                  branches={isStrictSuperAdmin(currentUser) ? branches : visibleBranches}
                  allBranches={branches}
                  salespersons={visibleSalespersons}
                  allSalespersons={salespersons}
                  parties={visibleParties}
                  company={company}
                  onSyncCloud={scheduleCloudSync}
                  onBack={handleBack}
                  onClose={handleClose}
                />
              </div>
            ) : (
              <div className="w-full">
                <ConveyanceManager
                  conveyances={conveyances}
                  setConveyances={setConveyances}
                  salespersons={visibleSalespersons}
                  allSalespersons={salespersons}
                  branches={isStrictSuperAdmin(currentUser) ? branches : visibleBranches}
                  allBranches={branches}
                  company={company}
                  currentUser={currentUser}
                  initialMode="approval"
                  onSyncCloud={scheduleCloudSync}
                  onBack={handleBack}
                  onClose={handleClose}
                />
              </div>
            )}
          </div>
        )}

        {(activeTab === 'conveyance' || (activeTab === 'expense_directory' && expenseSubTab === 'conveyance')) && (
          <div className="max-w-7xl mx-auto w-full">
            <ConveyanceManager
              conveyances={conveyances}
              setConveyances={setConveyances}
              salespersons={visibleSalespersons}
              allSalespersons={salespersons}
              branches={isStrictSuperAdmin(currentUser) ? branches : visibleBranches}
              allBranches={branches}
              company={company}
              currentUser={currentUser}
              onSyncCloud={scheduleCloudSync}
              onBack={handleBack}
              onClose={handleClose}
            />
          </div>
        )}

        {((activeTab === 'expense_directory' && expenseSubTab !== 'conveyance') || activeTab === 'expense_entry' || activeTab === 'collection_entry' || activeTab === 'collection_list' || activeTab === 'cash_in_hand' || activeTab === 'cheque_in_hand' || activeTab === 'deposit_history') && (
          <div className={`${activeTab === 'deposit_history' ? 'max-w-[1400px]' : 'max-w-6xl'} mx-auto w-full`}>
            <ExpenseManager
              key="expense-manager-stable"
              expenses={visibleExpenses}
              setExpenses={setExpenses}
              collections={visibleCollections}
              setCollections={setCollections}
              bankDeposits={visibleBankDeposits}
              setBankDeposits={setBankDeposits}
              onDeleteBankDeposit={handleDeleteBankDeposit}
              bankList={bankList}
              setBankList={setBankList}
              onAddBank={handleAddBank}
              onDeleteBank={handleDeleteBank}
              onEditBank={handleEditBank}
              onResetBanks={handleResetBanks}
              accountList={accountList}
              setAccountList={setAccountList}
              onAddAccount={handleAddAccount}
              onDeleteAccount={handleDeleteAccount}
              onEditAccount={handleEditAccount}
              onResetAccounts={handleResetAccounts}
              salespersons={visibleSalespersons}
              allSalespersons={salespersons}
              parties={visibleParties}
              setParties={setParties}
              storedBills={visibleStoredBills}
              company={company}
              currentUser={currentUser}
              branches={isStrictSuperAdmin(currentUser) ? branches : visibleBranches}
              allBranches={branches}
              initialMode={
                activeTab === 'expense_entry'
                  ? 'entry'
                  : activeTab === 'collection_entry'
                  ? 'collection_entry'
                  : activeTab === 'collection_list'
                  ? 'collection_list'
                  : activeTab === 'cash_in_hand'
                  ? 'cash_in_hand'
                  : activeTab === 'cheque_in_hand'
                  ? 'cheque_in_hand'
                  : activeTab === 'deposit_history'
                  ? 'deposit_history'
                  : expenseSubTab === 'report'
                  ? 'report'
                  : (expenseSubTab === 'expense_amount' || expenseSubTab === 'monthly_expense')
                  ? 'expense_amount'
                  : expenseSubTab === 'trash'
                  ? 'trash'
                  : 'directory'
              }
              conveyances={conveyances}
              setConveyances={setConveyances}
              onSyncCloud={scheduleCloudSync}
              onBack={handleBack}
              onClose={handleClose}
            />
          </div>
        )}


        {activeTab === 'trash_bin' && (
          <div className="max-w-6xl mx-auto">
            <Trash
              items={items}
              setItems={setItems}
              parties={parties}
              setParties={setParties}
              storedBills={storedBills}
              setStoredBills={setStoredBills}
              collections={collections}
              setCollections={setCollections}
              deliveryChallans={deliveryChallans}
              setDeliveryChallans={setDeliveryChallans}
              salespersons={salespersons}
              setSalespersons={setSalespersons}
              branches={branches}
              setBranches={setBranches}
              requisitions={requisitions}
              setRequisitions={setRequisitions}
              conveyances={conveyances}
              setConveyances={setConveyances}
              onSyncCloud={scheduleCloudSync}
              onBack={handleBack}
              onClose={handleClose}
            />
          </div>
        )}

        {(activeTab === 'settings' || activeTab === 'allowance_settings') && (
          <div className="max-w-6xl mx-auto">
            <SettingsView
                items={items}
                setItems={setItems}
                parties={parties}
                setParties={setParties}
                salespersons={salespersons}
                setSalespersons={setSalespersons}
                storedBills={storedBills}
                setStoredBills={setStoredBills}
                factoryImports={factoryImports}
                setFactoryImports={setFactoryImports}
                stockReturns={stockReturns}
                setStockReturns={setStockReturns}
                deliveryChallans={deliveryChallans}
                setDeliveryChallans={setDeliveryChallans}
                expenses={expenses}
                setExpenses={setExpenses}
                collections={collections}
                setCollections={setCollections}
                bankDeposits={effectiveBankDeposits}
                setBankDeposits={setBankDeposits}
                bankList={bankList}
                setBankList={setBankList}
                onAddBank={handleAddBank}
                onDeleteBank={handleDeleteBank}
                onEditBank={handleEditBank}
                onResetBanks={handleResetBanks}
                accountList={accountList}
                setAccountList={setAccountList}
                onAddAccount={handleAddAccount}
                onDeleteAccount={handleDeleteAccount}
                onEditAccount={handleEditAccount}
                onResetAccounts={handleResetAccounts}
                company={company}
                setCompany={setCompany}
                header={header}
                setHeader={setHeader}
                closings={closings}
                setClosings={setClosings}
                branches={branches}
                setBranches={setBranches}
                requisitions={requisitions}
                setRequisitions={setRequisitions}
                colorExchanges={colorExchanges}
                setColorExchanges={setColorExchanges}
                conveyances={conveyances}
                setConveyances={setConveyances}
                onRestoreAllData={handleRestoreAllData}
                scheduleCloudSync={scheduleCloudSync}
                initialTab={settingsSubTab as any}
                currentUser={currentUser}
                currentTheme={currentTheme}
                onThemeChange={setCurrentTheme}
                onUpdateSalesperson={handleUpdateSalesperson}
                onBack={handleBack}
                onClose={handleClose}
              />
          </div>
        )}

        {activeTab === 'salesperson_directory' && (
          <div className="max-w-6xl mx-auto">
            <SalespersonDirectory
              currentUser={currentUser}
              salespersons={isStrictSuperAdmin(currentUser) ? salespersons : visibleSalespersons}
              setSalespersons={setSalespersons}
              parties={isStrictSuperAdmin(currentUser) ? parties : visibleParties}
              setParties={setParties}
              branches={isStrictSuperAdmin(currentUser) ? branches : visibleBranches}
              setBranches={setBranches}
              onAddSalesperson={handleAddSalesperson}
              onUpdateSalesperson={handleUpdateSalesperson}
              onDeleteSalesperson={handleDeleteSalesperson}
              onAddBranch={handleAddBranch}
              onUpdateBranch={handleUpdateBranch}
              onDeleteBranch={handleDeleteBranch}
              onNavigate={(targetTab, options) => {
                if (options?.salesmanCode) {
                  setHeader((prev) => ({
                    ...prev,
                    salesmanCode: options.salesmanCode,
                    salespersonName: options.salespersonName || prev.salespersonName
                  }));
                }
                setActiveTab(targetTab as ViewTab);
              }}
              onBack={handleBack}
              onClose={handleClose}
            />
          </div>
        )}

        {activeTab === 'ai_sales_forecast' && (
          isShowroomInCharge ? (
            <div className="w-full">
              <AISalesForecastModal
                isOpen={true}
                onClose={() => setActiveTab('main_menu')}
                currentUser={currentUser}
                storedBills={isStrictSuperAdmin(currentUser) ? storedBills : visibleStoredBills}
                collections={isStrictSuperAdmin(currentUser) ? collections : visibleCollections}
                bankDeposits={isStrictSuperAdmin(currentUser) ? bankDeposits : visibleBankDeposits}
                items={items}
                parties={visibleParties}
                salespersons={visibleSalespersons}
                company={company}
                requisitions={visibleRequisitions}
                onNavigateToRequisitions={() => setActiveTab('requisition')}
                branches={isStrictSuperAdmin(currentUser) ? branches : visibleBranches}
              />
            </div>
          ) : (
            <div className="max-w-md mx-auto my-12 p-6 cyber-glass-card rounded-2xl text-center text-white">
              <p className="text-sm text-slate-200">Access Restricted: AI Demand Forecast is exclusively available to Sales Center In-Charge.</p>
              <button
                onClick={() => setActiveTab('main_menu')}
                className="mt-4 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-xs font-semibold rounded-xl cursor-pointer transition-colors"
              >
                Return to Main Menu
              </button>
            </div>
          )
        )}

        {activeTab === 'admin_sales_collection_report' && (
          <div className="w-full">
            <AdminSalesCollectionReportPage
              storedBills={isStrictSuperAdmin(currentUser) ? storedBills : visibleStoredBills}
              collections={isStrictSuperAdmin(currentUser) ? collections : visibleCollections}
              salespersons={isStrictSuperAdmin(currentUser) ? salespersons : visibleSalespersons}
              branches={isStrictSuperAdmin(currentUser) ? branches : visibleBranches}
              allBranches={branches}
              allStoredBills={storedBills}
              allCollections={collections}
              onSyncCloud={scheduleCloudSync}
              parties={isStrictSuperAdmin(currentUser) ? parties : visibleParties}
              items={items}
              stockReturns={stockReturns}
              company={company}
              currentUser={currentUser}
              onUpdateSalesperson={handleUpdateSalesperson}
              onBack={handleBack}
              onNavigateToParty={(partyId) => {
                setActiveTab('customer_ledger');
              }}
              unreadCommCount={unreadCommCount}
              onOpenNotifications={() => {
                unlockAudio();
                setIsCommHubOpen(true);
              }}
            />
          </div>
        )}
            </Suspense>
      </main>
        </div>
      </div>

      {/* App Footer */}
      <footer className="bg-[#071924]/58 backdrop-blur-xl border-t border-white/[0.10] text-slate-400 py-3 px-6 text-center text-xs no-print">
        <p className="max-w-[1600px] mx-auto flex items-center justify-center">
          <span>
            Poly Cables Ind. Ltd. • Store & Billing System
          </span>
        </p>
      </footer>

      {/* Keyboard Shortcuts Modal */}
      {shortcutsModalOpen && (
        <Suspense fallback={null}>
          <KeyboardShortcutsModal
            isOpen={shortcutsModalOpen}
            onClose={() => setShortcutsModalOpen(false)}
          />
        </Suspense>
      )}

      {/* Real-Time Notifications, Tong Sound, All Users Chat, Video Call & Screen Share Hub */}
      {currentUser && (
        <NotificationChatHub
          isOpen={isCommHubOpen}
          onClose={() => setIsCommHubOpen(false)}
          currentUser={currentUser}
          salespersons={salespersons}
          branches={branches}
          onUnreadCountChange={setUnreadCommCount}
        />
      )}



      {/* Universal Centered Giant Green Success Toast (Auto-Dismisses after 1s) */}
      {giantSuccessToast && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/75 backdrop-blur-md transition-all duration-200">
          <div className="bg-[#052216]/95 border-2 border-emerald-400 rounded-3xl p-8 sm:p-12 shadow-[0_0_80px_rgba(16,185,129,0.55)] flex flex-col items-center gap-4 text-center transform scale-105 animate-in fade-in zoom-in-95 max-w-lg mx-4">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.5)]">
              <CheckCircle2 className="w-12 h-12" />
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-emerald-400 tracking-wide drop-shadow-[0_0_25px_rgba(16,185,129,0.7)]">
              {giantSuccessToast}
            </h2>
            <p className="text-xs sm:text-sm font-semibold text-emerald-300/80 uppercase tracking-widest">
              Ready For New Entry...
            </p>
          </div>
        </div>
      )}

      {/* Non-intrusive Floating App Toast Notification */}
      {appToast && (
        <div className="fixed bottom-20 right-6 z-50 flex items-center space-x-2.5 px-4 py-3 rounded-xl shadow-2xl border text-xs font-semibold backdrop-blur-md transition-all duration-300 animate-slide-up bg-slate-900/95 text-white border-slate-700">
          <span className={`w-2 h-2 rounded-full ${appToast.type === 'error' ? 'bg-rose-500' : 'bg-emerald-400 animate-pulse'}`} />
          <span>{appToast.text}</span>
          <button
            onClick={() => setAppToast(null)}
            className="ml-2 text-slate-400 hover:text-white cursor-pointer"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
