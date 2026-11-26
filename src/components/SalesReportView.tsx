import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Item, StoredBill, Party, Salesperson, FactoryImportChallan, StockReturnChallan, DeliveryChallan, BranchLocation, AuthUser, ColorExchangeChallan } from '../types';
import {
  getUserLoginFilters,
  getUserBranch,
  isSuperAdminOrAgm,
  billMatchesBranch,
  cleanBranchName,
  isUnwantedSalesCenter,
  getAdminBranches,
  isAnyAdmin,
  isStrictSuperAdmin,
  isAccountsAdmin,
  filterBranchesForUser,
  filterSalespersonsByBranch
} from '../utils/branchAccess';
import {
  exportSalesReportToXLSX,
  exportCategoryWiseStockReportToXLSX,
  generateCategoryWiseStockReportBase64,
  generateItemSalesReportBase64
} from '../utils/xlsxItemHelper';
import { formatDateDDMMYY, parseDateToISO, getTodayISO, getTodayDDMMYY } from '../utils/dateUtils';
import { getAllCategories, saveCustomCategory } from '../utils/categoryHelper';
import { matchesFlexibleSearch, sortItemsCategorySerialWise, groupItemsByCategoryOrder } from '../utils/searchHelper';
import { defaultItems, defaultBranches } from '../data/defaultData';
import { getItemOpeningStock, isItemActiveInBranch } from '../utils/stockHelper';
import { StockColorBreakdownModal, StockCategoryType } from './StockColorBreakdownModal';
import { useAutoPrintOnOpen } from '../hooks/useAutoPrintOnOpen';
import {
  Calendar,
  Download,
  TrendingUp,
  PackageCheck,
  AlertTriangle,
  Layers,
  Search,
  BarChart3,
  Clock,
  UserCheck,
  Building2,
  CalendarDays,
  Filter,
  ChevronRight,
  Printer,
  Tag,
  Boxes,
  RefreshCw,
  Plus,
  X,
  ArrowLeft,
  RotateCcw,
  Truck,
  Box,
  Mail,
  SlidersHorizontal,
  Check,
  Copy,
  ExternalLink,
  Lock,
  Send,
  CheckCircle2,
  Loader2,
  Eye,
  EyeOff,
  Paperclip,
  FileSpreadsheet,
  Sparkles
} from 'lucide-react';
import { SalesCenterSearchFilter } from './SalesCenterSearchFilter';

export const STOCK_REPORT_COLUMNS = [
  { key: 'sl', label: 'SL #' },
  { key: 'name', label: 'Items Name' },
  { key: 'opening', label: 'Op. Qty.' },
  { key: 'received', label: 'Received' },
  { key: 'rParty', label: 'R.Party' },
  { key: 'totalStock', label: 'Total' },
  { key: 'sales', label: 'Sales' },
  { key: 'rFactory', label: 'Re. Fac.' },
  { key: 'closing', label: 'Closing Qty' },
  { key: 'reqNo', label: 'Req No.' },
  { key: 'stockValue', label: 'Stock Value' },
];

export const ITEM_REPORT_COLUMNS = [
  { key: 'sl', label: '# (SL)' },
  { key: 'name', label: 'Name Of Items' },
  { key: 'unit', label: 'Unit' },
  { key: 'rate', label: 'Price / Unit (Tk)' },
  { key: 'opening', label: 'Opening Stock' },
  { key: 'sold', label: 'Sold Coils' },
  { key: 'closing', label: 'Closing Stock' },
  { key: 'salesTk', label: 'Total Sales (Tk)' },
];

export const DAY_REPORT_COLUMNS = [
  { key: 'sl', label: '# (SL)' },
  { key: 'date', label: 'Date' },
  { key: 'billCount', label: 'Bills Issued' },
  { key: 'totalCoils', label: 'Total Coils Sold' },
  { key: 'parties', label: 'Parties Served' },
  { key: 'salesmen', label: 'Salesmen Code' },
  { key: 'revenue', label: 'Total Revenue (Tk)' },
];

export const PARTY_REPORT_COLUMNS = [
  { key: 'sl', label: '# (SL)' },
  { key: 'partyName', label: 'Party Name' },
  { key: 'address', label: 'Address / Location' },
  { key: 'salesmanCode', label: 'Salesman Code' },
  { key: 'billCount', label: 'Total Bills' },
  { key: 'coils', label: 'Coils Bought' },
  { key: 'revenue', label: 'Total Purchases (Tk)' },
];

export const SALESMAN_REPORT_COLUMNS = [
  { key: 'sl', label: '# (SL)' },
  { key: 'code', label: 'Salesman Code' },
  { key: 'name', label: 'Sales Executive Name' },
  { key: 'area', label: 'Territory / Area' },
  { key: 'billCount', label: 'Total Bills' },
  { key: 'totalCoils', label: 'Total Coils Sold' },
  { key: 'parties', label: 'Parties Served' },
  { key: 'revenue', label: 'Total Revenue (Tk)' },
];

interface SalesReportViewProps {
  items: Item[];
  storedBills: StoredBill[];
  deliveryChallans?: DeliveryChallan[];
  factoryImports?: FactoryImportChallan[];
  stockReturns?: StockReturnChallan[];
  colorExchanges?: ColorExchangeChallan[];
  parties?: Party[];
  salespersons?: Salesperson[];
  branches?: BranchLocation[];
  currentUser?: AuthUser | null;
  onBack?: () => void;
  onClose?: () => void;
}

export function getItemCategoryName(item: Partial<Item>): string {
  const c = (item.category || '').trim();
  const cLow = c.toLowerCase();
  const isGeneralCat = !c || cLow === 'general' || cLow === 'general wire' || cLow === 'general cables';
  const n = (item.name || '').trim();
  const s = (item.sizeSpec || '').trim();
  const combined = `${c} ${n} ${s}`.toLowerCase();
  const allCats = getAllCategories().filter((cat) => {
    const low = (cat || '').trim().toLowerCase();
    return low && low !== 'general' && low !== 'general wire' && low !== 'general cables';
  });

  // 1. Direct match (excluding 'general')
  if (!isGeneralCat) {
    for (const std of allCats) {
      if (cLow === std.toLowerCase()) {
        return std;
      }
    }
  }

  // 2. Keyword fallback matching
  if (combined.includes('bym')) return 'BYM';
  if (combined.includes('byfy') || combined.includes('f/t') || combined.includes('flat twin')) return 'BYFY';
  if (combined.includes('alu') || combined.includes('aerial') || combined.includes('arial') || combined.includes('drop wire') || combined.includes('d-11') || combined.includes('d-12')) return 'Arial Cable';
  if (combined.includes('telephone') || combined.includes('telecommunication') || combined.includes('2 pair') || combined.includes('rg-6') || combined.includes('coaxial')) return 'Telephone Cable';
  if (combined.includes('4 core') || combined.includes('04 core') || combined.includes('4/c') || combined.includes('4 x') || combined.includes('4x')) return 'Flexible Cable- 04 Core';
  if (combined.includes('3 core') || combined.includes('03 core') || combined.includes('3 x') || combined.includes('3x')) return 'Flexible Cable- 03 Core';
  if (combined.includes('2 core') || combined.includes('02 core') || combined.includes('2 x') || combined.includes('2x')) return 'Flexible Cable- 02 Core';
  if (combined.includes('1 core') || combined.includes('01 core') || combined.includes('1 x 2 rm') || combined.includes('1 x 3 rm')) return 'Flexible Cable- 01 Core';
  if (combined.includes('flexible') || combined.includes('twin twisted') || combined.includes('t/t')) return 'Flexible';
  if (combined.includes('bya') || combined.includes('re') || combined.includes('rm') || combined.includes('single core') || combined.includes('stranded')) return 'BYA';

  return !isGeneralCat ? c : 'Other Cables';
}

type PeriodType = 'this_month' | 'last_month' | 'this_year' | 'last_year' | 'custom' | 'all';
type ReportTab = 'stock_category_wise' | 'item_wise' | 'day_wise' | 'party_wise' | 'salesman_wise';

function parseBillDate(dateStr?: string, savedAt?: string): Date | null {
  if (dateStr && dateStr.trim()) {
    const s = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const [y, m, d] = s.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    const ddmmyyyy = s.match(/^(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{2,4})$/);
    if (ddmmyyyy) {
      const day = parseInt(ddmmyyyy[1], 10);
      const month = parseInt(ddmmyyyy[2], 10) - 1;
      let year = parseInt(ddmmyyyy[3], 10);
      if (year < 100) year += 2000;
      return new Date(year, month, day);
    }
    const iso = parseDateToISO(s);
    if (iso) {
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    const native = new Date(s);
    if (!isNaN(native.getTime())) return native;
  }

  if (savedAt) {
    const native = new Date(savedAt);
    if (!isNaN(native.getTime())) return native;
  }

  return null;
}

function formatDateISO(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export const SalesReportView: React.FC<SalesReportViewProps> = ({
  items = [],
  storedBills,
  deliveryChallans = [],
  factoryImports = [],
  stockReturns = [],
  colorExchanges = [],
  parties = [],
  salespersons = [],
  branches = [],
  currentUser,
  onBack,
  onClose
}) => {
  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => getAllCategories());
  useEffect(() => {
    const refresh = () => setCategoryOrder(getAllCategories());
    window.addEventListener('categories-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('categories-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const effectiveBranches = useMemo(() => {
    return branches && branches.length > 0 ? branches : defaultBranches;
  }, [branches]);

  const userLoginFilters = useMemo(() => {
    return getUserLoginFilters(currentUser, salespersons, effectiveBranches);
  }, [currentUser, salespersons, effectiveBranches]);

  const isSuperOrAccounts = isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser);
  const isSuperAdminOrAdmin = isSuperOrAccounts || isAnyAdmin(currentUser);

  const availableBranches = useMemo(() => {
    const baseList = filterBranchesForUser(effectiveBranches, currentUser, salespersons);
    const seen = new Set<string>(baseList.map((b) => cleanBranchName(b.name).toLowerCase().trim()));
    const result = [...baseList];

    // Only Super Admin & Accounts Admin append ad-hoc center names discovered from historical documents
    if (isSuperOrAccounts) {
      const checkAndAdd = (name?: string) => {
        if (!name || typeof name !== 'string') return;
        const cleaned = cleanBranchName(name);
        const key = cleaned.toLowerCase().trim();
        if (key && !seen.has(key) && key !== 'all' && !key.startsWith('all sales')) {
          seen.add(key);
          result.push({
            id: cleaned,
            name: cleaned,
            address: '',
            phone: '',
            type: 'showroom'
          });
        }
      };

      (storedBills || []).forEach((b) => checkAndAdd(b.branchName || b.header?.branchName || (b.header as any)?.salesCenter));
      (deliveryChallans || []).forEach((c) => checkAndAdd(c.branchName || (c as any).branch || (c as any).salesCenter));
      (factoryImports || []).forEach((f) => checkAndAdd((f as any).branchName || (f as any).branch));
    }

    return result
      .filter((b) => b && !isUnwantedSalesCenter(b))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [effectiveBranches, currentUser, salespersons, isSuperOrAccounts, storedBills, deliveryChallans, factoryImports]);

  const canViewAllCenters = isSuperAdminOrAdmin || availableBranches.length > 1;
  const isBranchLocked = Boolean(currentUser) && !canViewAllCenters && (userLoginFilters.isRestricted || availableBranches.length <= 1);

  const lockedBranchInfo = useMemo(() => {
    if (!isBranchLocked) return null;
    if (userLoginFilters.branchName || userLoginFilters.branchId) {
      const match = availableBranches.find(
        (b) => (userLoginFilters.branchName && b.name.toLowerCase().trim() === userLoginFilters.branchName.toLowerCase().trim()) ||
               (userLoginFilters.branchId && b.id === userLoginFilters.branchId)
      );
      if (match) return match;
      if (userLoginFilters.branchName) return { id: userLoginFilters.branchId || 'branch-1', name: userLoginFilters.branchName };
    }
    const ub = getUserBranch(currentUser, salespersons, availableBranches);
    return availableBranches.find((b) => b.id === ub.branchId) || { id: ub.branchId || 'branch-1', name: ub.branchName || availableBranches[0]?.name || 'All Sales Centers' };
  }, [isBranchLocked, userLoginFilters, availableBranches, currentUser, salespersons]);

  const [reportTab, setReportTab] = useState<ReportTab>('stock_category_wise');
  const [selectedSalesCenter, setSelectedSalesCenter] = useState<string>(() => {
    if (isSuperAdminOrAdmin) return 'all';
    const allowed = filterBranchesForUser(effectiveBranches, currentUser, salespersons);
    const hasMulti = allowed.length > 1;
    if (!hasMulti) {
      if (allowed.length === 1) return allowed[0].name;
      const init = getUserLoginFilters(currentUser, salespersons, effectiveBranches);
      if (init.branchName) return init.branchName;
      const ub = getUserBranch(currentUser, salespersons, effectiveBranches);
      return ub.branchName || (effectiveBranches[0]?.name || 'all');
    }
    return 'all';
  });

  const lastSalesReportUserKeyRef = useRef<string>('');
  useEffect(() => {
    const userKey = `${currentUser?.username || ''}::${currentUser?.salespersonCode || ''}::${currentUser?.branchId || ''}::${currentUser?.role || ''}`;
    const userChanged = lastSalesReportUserKeyRef.current !== '' && lastSalesReportUserKeyRef.current !== userKey;
    lastSalesReportUserKeyRef.current = userKey;

    if (isSuperAdminOrAdmin) {
      if (userChanged) setSelectedSalesCenter('all');
      return;
    }

    if (isBranchLocked && lockedBranchInfo?.name) {
      setSelectedSalesCenter(lockedBranchInfo.name);
    } else if (userChanged) {
      setSelectedSalesCenter(userLoginFilters.branchName || 'all');
    }
  }, [currentUser, isSuperAdminOrAdmin, isBranchLocked, lockedBranchInfo, userLoginFilters.branchName]);

  const isAllSalesCenter = useCallback((val: string | null | undefined): boolean => {
    if (!val) return true;
    const v = val.toLowerCase().trim();
    return v === 'all' || v === 'all sales centers' || v.startsWith('all sales center') || v === 'all branches';
  }, []);

  const effectiveSelectedSalesCenter = useMemo(() => {
    if (isBranchLocked && lockedBranchInfo) {
      return lockedBranchInfo.name;
    }
    return selectedSalesCenter;
  }, [isBranchLocked, lockedBranchInfo, selectedSalesCenter]);

  const selectedBranchId = useMemo(() => {
    if (isBranchLocked && lockedBranchInfo) {
      return lockedBranchInfo.id;
    }
    if (isAllSalesCenter(effectiveSelectedSalesCenter)) return 'ALL';
    const target = effectiveSelectedSalesCenter.toLowerCase().trim();
    const b = availableBranches.find(
      (branch) => branch.name.toLowerCase().trim() === target ||
                  branch.id.toLowerCase().trim() === target ||
                  cleanBranchName(branch.name).toLowerCase() === target ||
                  cleanBranchName(branch.name).toLowerCase().includes(target) ||
                  target.includes(cleanBranchName(branch.name).toLowerCase())
    );
    return b ? b.id : effectiveSelectedSalesCenter;
  }, [isBranchLocked, lockedBranchInfo, effectiveSelectedSalesCenter, availableBranches, isAllSalesCenter]);

  const selectedBranchName = useMemo(() => {
    if (isBranchLocked && lockedBranchInfo) return lockedBranchInfo.name;
    if (isAllSalesCenter(effectiveSelectedSalesCenter)) return 'all';
    const target = effectiveSelectedSalesCenter.toLowerCase().trim();
    const b = availableBranches.find(
      (branch) => branch.name.toLowerCase().trim() === target ||
                  branch.id.toLowerCase().trim() === target ||
                  cleanBranchName(branch.name).toLowerCase() === target ||
                  cleanBranchName(branch.name).toLowerCase().includes(target) ||
                  target.includes(cleanBranchName(branch.name).toLowerCase())
    );
    return b ? b.name : effectiveSelectedSalesCenter;
  }, [isBranchLocked, lockedBranchInfo, effectiveSelectedSalesCenter, availableBranches, isAllSalesCenter]);

  const displaySalesCenterTitle = useMemo(() => {
    if (selectedBranchName && !isAllSalesCenter(selectedBranchName)) {
      return cleanBranchName(selectedBranchName);
    }
    return 'All Sales Centers';
  }, [selectedBranchName, isAllSalesCenter]);

  const [selectedStockDayItemId, setSelectedStockDayItemId] = useState<string>('ALL');
  const [period, setPeriod] = useState<PeriodType>('this_month');
  const [search, setSearch] = useState('');
  const [salesmanFilter, setSalesmanFilter] = useState<string>(() => {
    const init = getUserLoginFilters(currentUser, salespersons, branches && branches.length > 0 ? branches : defaultBranches);
    return init.salesmanCode || 'all';
  });

  // Keep filters updated when currentUser changes
  useEffect(() => {
    if (userLoginFilters.branchName) {
      const match = effectiveBranches.find(
        (b) => b.name.toLowerCase().trim() === userLoginFilters.branchName?.toLowerCase().trim() || b.id === userLoginFilters.branchId
      );
      setSelectedSalesCenter(match ? match.name : userLoginFilters.branchName);
    }
    if (userLoginFilters.salesmanCode) {
      setSalesmanFilter(userLoginFilters.salesmanCode);
    }
  }, [userLoginFilters.branchName, userLoginFilters.salesmanCode, effectiveBranches]);

  const [partyFilter, setPartyFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [billTypeFilter, setBillTypeFilter] = useState<'all' | 'showroom' | 'office'>('showroom');
  const [challanFilter, setChallanFilter] = useState<'without_challan' | 'with_challan' | 'challan_only'>('without_challan');
  const [hideZeroQty, setHideZeroQty] = useState<boolean>(false);
  const [specialItemFilter, setSpecialItemFilter] = useState<'without_special' | 'with_special' | 'special_only'>('with_special');
  const [showPrintPreviewModal, setShowPrintPreviewModal] = useState<boolean>(false);
  const [previewZoom, setPreviewZoom] = useState<'80%' | '100%' | '115%'>('100%');
  useAutoPrintOnOpen(
    showPrintPreviewModal,
    () => window.print()
  );


  const filteredSalespersonsForDropdown = useMemo(() => {
    return filterSalespersonsByBranch(salespersons, effectiveSelectedSalesCenter, availableBranches, currentUser);
  }, [salespersons, effectiveSelectedSalesCenter, availableBranches, currentUser]);

  const filteredPartiesForDropdown = useMemo(() => {
    let result = parties;
    if (!isAllSalesCenter(effectiveSelectedSalesCenter)) {
      const targetId = (selectedBranchId || '').toLowerCase().trim();
      const targetName = cleanBranchName(selectedBranchName).toLowerCase().trim();
      const rawTarget = (effectiveSelectedSalesCenter || '').toLowerCase().trim();

      const matched = result.filter((p) => {
        const pBranchId = (p.branchId || '').toLowerCase().trim();
        if (pBranchId && targetId && (pBranchId === targetId || pBranchId === targetName)) return true;
        const pBranch = cleanBranchName(p.branch || (p as any).branchName || '').toLowerCase().trim();
        return pBranch === targetName || (targetName && pBranch.includes(targetName)) || (pBranch && targetName.includes(pBranch)) ||
               pBranch === rawTarget || (rawTarget && pBranch.includes(rawTarget));
      });
      if (matched.length > 0) result = matched;
    }
    if (salesmanFilter !== 'all') {
      const sFilter = salesmanFilter.toLowerCase().trim();
      result = result.filter((p) => {
        const spCode = (p.salesmanCode || '').toLowerCase().trim();
        const spName = (p.salespersonName || '').toLowerCase().trim();
        return spCode === sFilter || spName === sFilter || spCode.includes(sFilter);
      });
    }
    return result;
  }, [parties, effectiveSelectedSalesCenter, selectedBranchId, selectedBranchName, salesmanFilter, isAllSalesCenter]);

  // Column visibility defaults for all 5 report tables
  const DEFAULT_STOCK_COLUMNS: Record<string, boolean> = {
    sl: true,
    name: true,
    opening: true,
    received: true,
    rParty: true,
    totalStock: true,
    sales: true,
    rFactory: true,
    closing: true,
    reqNo: true,
    stockValue: true,
  };

  const DEFAULT_ITEM_COLUMNS: Record<string, boolean> = {
    sl: true,
    name: true,
    unit: true,
    rate: true,
    opening: true,
    sold: true,
    closing: true,
    salesTk: true,
  };

  const DEFAULT_DAY_COLUMNS: Record<string, boolean> = {
    sl: true,
    date: true,
    billCount: true,
    totalCoils: true,
    parties: true,
    salesmen: true,
    revenue: true,
  };

  const DEFAULT_PARTY_COLUMNS: Record<string, boolean> = {
    sl: true,
    partyName: true,
    address: true,
    salesmanCode: true,
    billCount: true,
    coils: true,
    revenue: true,
  };

  const DEFAULT_SALESMAN_COLUMNS: Record<string, boolean> = {
    sl: true,
    code: true,
    name: true,
    area: true,
    billCount: true,
    totalCoils: true,
    parties: true,
    revenue: true,
  };

  // State hooks for column visibility per report
  const [stockColumns, setStockColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('poly_cables_stock_columns_v1');
      if (saved) return { ...DEFAULT_STOCK_COLUMNS, ...JSON.parse(saved) };
    } catch (e) {}
    return DEFAULT_STOCK_COLUMNS;
  });

  const [itemColumns, setItemColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('poly_cables_item_columns_v1');
      if (saved) return { ...DEFAULT_ITEM_COLUMNS, ...JSON.parse(saved) };
    } catch (e) {}
    return DEFAULT_ITEM_COLUMNS;
  });

  const [dayColumns, setDayColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('poly_cables_day_columns_v1');
      if (saved) return { ...DEFAULT_DAY_COLUMNS, ...JSON.parse(saved) };
    } catch (e) {}
    return DEFAULT_DAY_COLUMNS;
  });

  const [partyColumns, setPartyColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('poly_cables_party_columns_v1');
      if (saved) return { ...DEFAULT_PARTY_COLUMNS, ...JSON.parse(saved) };
    } catch (e) {}
    return DEFAULT_PARTY_COLUMNS;
  });

  const [salesmanColumns, setSalesmanColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('poly_cables_salesman_columns_v1');
      if (saved) return { ...DEFAULT_SALESMAN_COLUMNS, ...JSON.parse(saved) };
    } catch (e) {}
    return DEFAULT_SALESMAN_COLUMNS;
  });

  const [showColumnPicker, setShowColumnPicker] = useState<boolean>(false);
  const columnPickerRef = useRef<HTMLDivElement>(null);

  // Recalculate Stock state and handler
  const [recalcTick, setRecalcTick] = useState<number>(0);
  const [isRecalculating, setIsRecalculating] = useState<boolean>(false);
  const [recalcMessage, setRecalcMessage] = useState<string | null>(null);

  const handleRecalculateStock = useCallback(() => {
    setIsRecalculating(true);
    setRecalcMessage(null);
    setTimeout(() => {
      setRecalcTick((t) => t + 1);
      setIsRecalculating(false);
      setRecalcMessage('✓ Stock report successfully recalculated! All inventory balances (Opening + Inward - Outward = Closing) and valuations are 100% reconciled.');
      setTimeout(() => setRecalcMessage(null), 6000);
    }, 400);
  }, []);

  // Persist column preferences to localStorage
  useEffect(() => {
    try { localStorage.setItem('poly_cables_stock_columns_v1', JSON.stringify(stockColumns)); } catch (e) {}
  }, [stockColumns]);

  useEffect(() => {
    try { localStorage.setItem('poly_cables_item_columns_v1', JSON.stringify(itemColumns)); } catch (e) {}
  }, [itemColumns]);

  useEffect(() => {
    try { localStorage.setItem('poly_cables_day_columns_v1', JSON.stringify(dayColumns)); } catch (e) {}
  }, [dayColumns]);

  useEffect(() => {
    try { localStorage.setItem('poly_cables_party_columns_v1', JSON.stringify(partyColumns)); } catch (e) {}
  }, [partyColumns]);

  useEffect(() => {
    try { localStorage.setItem('poly_cables_salesman_columns_v1', JSON.stringify(salesmanColumns)); } catch (e) {}
  }, [salesmanColumns]);

  // Close column picker on outside click/touch or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node)) {
        setShowColumnPicker(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowColumnPicker(false);
      }
    };
    if (showColumnPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      document.addEventListener('keydown', handleEsc);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [showColumnPicker]);

  // Dynamic Column Configuration for CURRENT active tab
  const activeColumnsConfig = useMemo(() => {
    if (reportTab === 'stock_category_wise') {
      const visibleCount = Object.values(stockColumns).filter(Boolean).length;
      return {
        tabName: 'Category Stock Report',
        columns: STOCK_REPORT_COLUMNS,
        state: stockColumns,
        visibleCount,
        totalCount: STOCK_REPORT_COLUMNS.length,
        toggle: (key: string) => {
          setStockColumns((prev) => {
            const next = { ...prev, [key]: !prev[key] };
            if (Object.values(next).every((v) => !v)) return prev;
            return next;
          });
        },
        showAll: () => setStockColumns(DEFAULT_STOCK_COLUMNS),
        presets: [
          { label: '✓ All Columns (11)', count: 11, action: () => setStockColumns(DEFAULT_STOCK_COLUMNS) },
          { label: '📋 Stock Ledger (9)', count: 9, action: () => setStockColumns({ sl: true, name: true, opening: true, received: true, rParty: true, totalStock: true, sales: true, rFactory: true, closing: true, reqNo: true, stockValue: false }) },
          { label: '⚡ Compact / Essential (5)', count: 5, action: () => setStockColumns({ sl: true, name: true, opening: false, received: false, rParty: false, totalStock: true, sales: true, rFactory: false, closing: true, reqNo: false, stockValue: false }) },
          { label: '৳ Valuation Focus (6)', count: 6, action: () => setStockColumns({ sl: true, name: true, opening: true, received: false, rParty: false, totalStock: false, sales: true, rFactory: false, closing: true, reqNo: false, stockValue: true }) }
        ]
      };
    } else if (reportTab === 'item_wise') {
      const visibleCount = Object.values(itemColumns).filter(Boolean).length;
      return {
        tabName: 'Item-Wise Sales & Stock',
        columns: ITEM_REPORT_COLUMNS,
        state: itemColumns,
        visibleCount,
        totalCount: ITEM_REPORT_COLUMNS.length,
        toggle: (key: string) => {
          setItemColumns((prev) => {
            const next = { ...prev, [key]: !prev[key] };
            if (Object.values(next).every((v) => !v)) return prev;
            return next;
          });
        },
        showAll: () => setItemColumns(DEFAULT_ITEM_COLUMNS),
        presets: [
          { label: '✓ All Columns (8)', count: 8, action: () => setItemColumns(DEFAULT_ITEM_COLUMNS) },
          { label: '📦 Stock & Sales (5)', count: 5, action: () => setItemColumns({ sl: true, name: true, unit: false, rate: false, opening: true, sold: true, closing: true, salesTk: true }) },
          { label: '⚡ Sales Focus (4)', count: 4, action: () => setItemColumns({ sl: true, name: true, unit: false, rate: false, opening: false, sold: true, closing: false, salesTk: true }) }
        ]
      };
    } else if (reportTab === 'day_wise') {
      const visibleCount = Object.values(dayColumns).filter(Boolean).length;
      return {
        tabName: 'Day-Wise Sales Statement',
        columns: DAY_REPORT_COLUMNS,
        state: dayColumns,
        visibleCount,
        totalCount: DAY_REPORT_COLUMNS.length,
        toggle: (key: string) => {
          setDayColumns((prev) => {
            const next = { ...prev, [key]: !prev[key] };
            if (Object.values(next).every((v) => !v)) return prev;
            return next;
          });
        },
        showAll: () => setDayColumns(DEFAULT_DAY_COLUMNS),
        presets: [
          { label: '✓ All Columns (7)', count: 7, action: () => setDayColumns(DEFAULT_DAY_COLUMNS) },
          { label: '📊 Coils & Revenue (4)', count: 4, action: () => setDayColumns({ sl: true, date: true, billCount: true, totalCoils: true, parties: false, salesmen: false, revenue: true }) },
          { label: '⚡ Quick Daily (3)', count: 3, action: () => setDayColumns({ sl: true, date: true, billCount: false, totalCoils: true, parties: false, salesmen: false, revenue: true }) }
        ]
      };
    } else if (reportTab === 'party_wise') {
      const visibleCount = Object.values(partyColumns).filter(Boolean).length;
      return {
        tabName: 'Party-Wise Sales Report',
        columns: PARTY_REPORT_COLUMNS,
        state: partyColumns,
        visibleCount,
        totalCount: PARTY_REPORT_COLUMNS.length,
        toggle: (key: string) => {
          setPartyColumns((prev) => {
            const next = { ...prev, [key]: !prev[key] };
            if (Object.values(next).every((v) => !v)) return prev;
            return next;
          });
        },
        showAll: () => setPartyColumns(DEFAULT_PARTY_COLUMNS),
        presets: [
          { label: '✓ All Columns (7)', count: 7, action: () => setPartyColumns(DEFAULT_PARTY_COLUMNS) },
          { label: '🏢 Party Totals (4)', count: 4, action: () => setPartyColumns({ sl: true, partyName: true, address: false, salesmanCode: false, billCount: true, coils: true, revenue: true }) },
          { label: '⚡ Name & Purchases (3)', count: 3, action: () => setPartyColumns({ sl: true, partyName: true, address: false, salesmanCode: false, billCount: false, coils: false, revenue: true }) }
        ]
      };
    } else {
      const visibleCount = Object.values(salesmanColumns).filter(Boolean).length;
      return {
        tabName: 'Salesman Performance Report',
        columns: SALESMAN_REPORT_COLUMNS,
        state: salesmanColumns,
        visibleCount,
        totalCount: SALESMAN_REPORT_COLUMNS.length,
        toggle: (key: string) => {
          setSalesmanColumns((prev) => {
            const next = { ...prev, [key]: !prev[key] };
            if (Object.values(next).every((v) => !v)) return prev;
            return next;
          });
        },
        showAll: () => setSalesmanColumns(DEFAULT_SALESMAN_COLUMNS),
        presets: [
          { label: '✓ All Columns (8)', count: 8, action: () => setSalesmanColumns(DEFAULT_SALESMAN_COLUMNS) },
          { label: '👤 Sales Totals (5)', count: 5, action: () => setSalesmanColumns({ sl: true, code: true, name: true, area: false, billCount: true, totalCoils: true, parties: false, revenue: true }) },
          { label: '⚡ Revenue Only (4)', count: 4, action: () => setSalesmanColumns({ sl: true, code: true, name: true, area: false, billCount: false, totalCoils: false, parties: false, revenue: true }) }
        ]
      };
    }
  }, [reportTab, stockColumns, itemColumns, dayColumns, partyColumns, salesmanColumns]);

  const toggleStockColumn = (key: string) => {
    setStockColumns((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (Object.values(next).every((v) => !v)) return prev;
      return next;
    });
  };

  const showAllStockColumns = () => {
    setStockColumns(DEFAULT_STOCK_COLUMNS);
  };

  const applyStockColumnPreset = (preset: 'all' | 'ledger' | 'compact' | 'finance' | 'movements') => {
    if (preset === 'all') {
      setStockColumns(DEFAULT_STOCK_COLUMNS);
    } else if (preset === 'ledger') {
      setStockColumns({
        sl: true,
        name: true,
        opening: true,
        received: true,
        rParty: true,
        totalStock: true,
        sales: true,
        rFactory: true,
        closing: true,
        reqNo: true,
        stockValue: false,
      });
    } else if (preset === 'compact') {
      setStockColumns({
        sl: true,
        name: true,
        opening: false,
        received: false,
        rParty: false,
        totalStock: true,
        sales: true,
        rFactory: false,
        closing: true,
        reqNo: false,
        stockValue: false,
      });
    } else if (preset === 'finance') {
      setStockColumns({
        sl: true,
        name: true,
        opening: true,
        received: false,
        rParty: false,
        totalStock: false,
        sales: true,
        rFactory: false,
        closing: true,
        reqNo: false,
        stockValue: true,
      });
    } else if (preset === 'movements') {
      setStockColumns({
        sl: true,
        name: true,
        opening: true,
        received: true,
        rParty: true,
        totalStock: true,
        sales: false,
        rFactory: true,
        closing: true,
        reqNo: true,
        stockValue: false,
      });
    }
  };

  const visibleStockColCount = useMemo(
    () => Object.values(stockColumns).filter(Boolean).length,
    [stockColumns]
  );

  // Active Items sorted strictly by Master Item Directory sequence (Category & Serial wise)
  // Requirement: "Stock Report, show only sales center wise active items only. Admin See his all sales center's all active item only."
  const activeItems = useMemo(() => {
    const rawList = items || [];
    const isSuper = isStrictSuperAdmin(currentUser);
    const isAdmin = isAnyAdmin(currentUser);

    // 1. If a specific sales center is selected, show only that sales center's active items
    if (selectedBranchId && selectedBranchId !== 'ALL') {
      const filtered = rawList.filter((item) =>
        isItemActiveInBranch(item, selectedBranchId, selectedBranchName)
      );
      return sortItemsCategorySerialWise(filtered, categoryOrder);
    }

    // 2. When viewing ALL sales centers:
    // If Regional Admin: Admin sees his all sales center's all active items only
    if (isAdmin && !isSuper) {
      const adminBranches = getAdminBranches(currentUser, availableBranches, salespersons);
      const filtered = rawList.filter((item) => {
        if (item.isActive === false) return false;
        // Include item if active in any of admin's assigned sales centers
        return adminBranches.some((b) => isItemActiveInBranch(item, b.id, b.name));
      });
      return sortItemsCategorySerialWise(filtered, categoryOrder);
    }

    // 3. Super Admin viewing ALL: all generally active items
    const filtered = rawList.filter((item) => item.isActive !== false);
    return sortItemsCategorySerialWise(filtered, categoryOrder);
  }, [items, selectedBranchId, selectedBranchName, currentUser, availableBranches, salespersons, categoryOrder]);

  // Master Item Directory Serial Map (1-based index from Master Item Directory standard items)
  const masterItemSerialMap = useMemo(() => {
    const map = new Map<string, number>();
    const standardSorted = sortItemsCategorySerialWise((items || []).filter((i) => !i.isSpecialItem), categoryOrder);
    standardSorted.forEach((item, idx) => {
      const sl = idx + 1;
      if (item.id) map.set(item.id, sl);
      if (item.code) map.set(item.code, sl);
      if (item.name) map.set(item.name.trim().toLowerCase(), sl);
    });
    return map;
  }, [items, categoryOrder]);

  // Categories list (strictly exclude general)
  const categoriesList = useMemo(
    () =>
      categoryOrder.filter((cat) => {
        const low = (cat || '').trim().toLowerCase();
        return low && low !== 'general' && low !== 'general wire' && low !== 'general cables';
      }),
    [categoryOrder]
  );

  const today = new Date();
  const runningYearFirstDate = new Date(today.getFullYear(), 0, 1);

  const [startDate, setStartDate] = useState<string>(formatDateISO(runningYearFirstDate));
  const [endDate, setEndDate] = useState<string>(formatDateISO(today));

  // Item Day Report Modal state when any item row is clicked
  const [itemDayReportModal, setItemDayReportModal] = useState<Partial<Item> | null>(null);

  // Stock Color Breakdown Modal state for Stock Serial Report (Category Wise)
  const [stockColorModalState, setStockColorModalState] = useState<{
    isOpen: boolean;
    item: Partial<Item> & { name: string; code?: string; category?: string; openingStock?: number; closingStock?: number };
    initialCategory?: StockCategoryType;
  } | null>(null);

  // Email Report Modal State
  const [showReportEmailModal, setShowReportEmailModal] = useState<boolean>(false);
  const [reportEmailToList, setReportEmailToList] = useState<string[]>(['pcildomestic@gmail.com']);
  const [reportEmailCcList, setReportEmailCcList] = useState<string[]>(['290suvro.pcil@gmail.com']);
  const [newReportToInput, setNewReportToInput] = useState<string>('');
  const [newReportCcInput, setNewReportCcInput] = useState<string>('');
  const [isSendingReportMail, setIsSendingReportMail] = useState<boolean>(false);
  const [reportMailSuccessInfo, setReportMailSuccessInfo] = useState<{
    to: string[];
    cc: string[];
    subject: string;
    sentAt: string;
    attachmentName?: string;
  } | null>(null);
  const [reportEmailCopied, setReportEmailCopied] = useState<boolean>(false);

  // Custom Date Text states in dd.mm.yy format: by default running year 1st date to today date
  const [customStartText, setCustomStartText] = useState<string>(() => {
    const y = String(new Date().getFullYear()).slice(-2);
    return `01.01.${y}`;
  });
  const [customEndText, setCustomEndText] = useState<string>(() => getTodayDDMMYY());

  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);

  // Sync custom text when startDate/endDate change
  const handlePickerStartChange = (iso: string) => {
    setStartDate(iso);
    if (iso) {
      const [y, m, d] = iso.split('-');
      if (y && m && d) setCustomStartText(`${d}.${m}.${y.slice(-2)}`);
      if (!endDate) {
        const todayIso = getTodayISO();
        setEndDate(todayIso);
        setCustomEndText(getTodayDDMMYY());
      }
    }
  };

  const handlePickerEndChange = (iso: string) => {
    setEndDate(iso);
    if (iso) {
      const [y, m, d] = iso.split('-');
      if (y && m && d) setCustomEndText(`${d}.${m}.${y.slice(-2)}`);
    }
  };

  const handleCustomStartTextChange = (val: string) => {
    setCustomStartText(val);
    const match = val.trim().match(/^(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{2,4})$/);
    if (match) {
      let day = parseInt(match[1], 10);
      let month = parseInt(match[2], 10);
      let year = parseInt(match[3], 10);
      if (year < 100) year += 2000;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const mm = String(month).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        setStartDate(`${year}-${mm}-${dd}`);
        if (!endDate || !customEndText) {
          setEndDate(getTodayISO());
          setCustomEndText(getTodayDDMMYY());
        }
      }
    }
  };

  const handleCustomEndTextChange = (val: string) => {
    setCustomEndText(val);
    const match = val.trim().match(/^(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{2,4})$/);
    if (match) {
      let day = parseInt(match[1], 10);
      let month = parseInt(match[2], 10);
      let year = parseInt(match[3], 10);
      if (year < 100) year += 2000;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const mm = String(month).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        setEndDate(`${year}-${mm}-${dd}`);
      }
    }
  };

  // Compute ISO bounds for the selected period for accurate continuous stock balance calculations
  const periodBounds = useMemo(() => {
    if (period === 'all') {
      return { startIso: '2026-01-01', endIso: null };
    }
    const now = new Date();
    const runningMm = String(now.getMonth() + 1).padStart(2, '0');
    const runningYyyy = now.getFullYear();

    if (period === 'this_month') {
      const lastDay = new Date(runningYyyy, now.getMonth() + 1, 0).getDate();
      return {
        startIso: `${runningYyyy}-${runningMm}-01`,
        endIso: `${runningYyyy}-${runningMm}-${String(lastDay).padStart(2, '0')}`
      };
    }
    if (period === 'last_month') {
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevYyyy = prevDate.getFullYear();
      const prevMm = String(prevDate.getMonth() + 1).padStart(2, '0');
      const prevLastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
      return {
        startIso: `${prevYyyy}-${prevMm}-01`,
        endIso: `${prevYyyy}-${prevMm}-${String(prevLastDay).padStart(2, '0')}`
      };
    }
    if (period === 'this_year') {
      return {
        startIso: `${runningYyyy}-01-01`,
        endIso: `${runningYyyy}-12-31`
      };
    }
    if (period === 'last_year') {
      return {
        startIso: `${runningYyyy - 1}-01-01`,
        endIso: `${runningYyyy - 1}-12-31`
      };
    }
    if (period === 'custom') {
      return {
        startIso: startDate ? (parseDateToISO(startDate) || startDate) : null,
        endIso: endDate ? (parseDateToISO(endDate) || endDate) : null
      };
    }
    return { startIso: null, endIso: null };
  }, [period, startDate, endDate]);

  const handleSelectPeriodPreset = (p: PeriodType) => {
    setPeriod(p);
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    if (p === 'this_month') {
      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);
      setStartDate(formatDateISO(first));
      setEndDate(formatDateISO(last));
      setCustomStartText(formatDateDDMMYY(first));
      setCustomEndText(formatDateDDMMYY(last));
    } else if (p === 'last_month') {
      const first = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0);
      setStartDate(formatDateISO(first));
      setEndDate(formatDateISO(last));
      setCustomStartText(formatDateDDMMYY(first));
      setCustomEndText(formatDateDDMMYY(last));
    } else if (p === 'this_year') {
      const first = new Date(y, 0, 1);
      const last = new Date(y, 11, 31);
      setStartDate(formatDateISO(first));
      setEndDate(formatDateISO(last));
      setCustomStartText(formatDateDDMMYY(first));
      setCustomEndText(formatDateDDMMYY(last));
    } else if (p === 'last_year') {
      const first = new Date(y - 1, 0, 1);
      const last = new Date(y - 1, 11, 31);
      setStartDate(formatDateISO(first));
      setEndDate(formatDateISO(last));
      setCustomStartText(formatDateDDMMYY(first));
      setCustomEndText(formatDateDDMMYY(last));
    } else if (p === 'all') {
      setStartDate(`2026-01-01`);
      setEndDate(`${y + 1}-12-31`);
      setCustomStartText(`01.01.2026`);
      setCustomEndText(`31.12.${String(y + 1).slice(-2)}`);
    }
  };

  // Helper to check if a date falls within the currently selected period
  const isDateInPeriod = useCallback((dateStr?: string, savedAt?: string): boolean => {
    if (period === 'all') {
      const bDate = parseBillDate(dateStr, savedAt);
      if (!bDate) return true;
      const bIso = formatDateISO(bDate);
      return bIso >= '2026-01-01';
    }

    const bDate = parseBillDate(dateStr, savedAt);
    if (!bDate) return true;
    const bIso = formatDateISO(bDate);

    if (periodBounds.startIso && bIso < periodBounds.startIso) return false;
    if (periodBounds.endIso && bIso > periodBounds.endIso) return false;
    return true;
  }, [period, periodBounds]);

  // Helper to check if a date falls strictly BEFORE the currently selected period (for dynamic opening stock)
  const isDateBeforePeriod = useCallback((dateStr?: string, savedAt?: string): boolean => {
    if (period === 'all' || !periodBounds.startIso) return false;

    const bDate = parseBillDate(dateStr, savedAt);
    if (!bDate) return false;
    const bIso = formatDateISO(bDate);

    return bIso < periodBounds.startIso;
  }, [period, periodBounds]);

  // Pre-indexed lookup maps for instant O(1) filtering
  const partyNameLookup = useMemo(() => {
    const map = new Map<string, Party>();
    (parties || []).forEach((p) => {
      if (p.name) map.set(p.name.trim().toLowerCase(), p);
    });
    return map;
  }, [parties]);

  const spLookup = useMemo(() => {
    const map = new Map<string, Salesperson>();
    (salespersons || []).forEach((sp) => {
      if (sp.id) map.set(sp.id.toLowerCase(), sp);
      if (sp.code) map.set(sp.code.trim().toLowerCase(), sp);
      if (sp.name) map.set(sp.name.trim().toLowerCase(), sp);
    });
    return map;
  }, [salespersons]);

  // 1. Filter StoredBills based on selected Date Period, Channel, and Filters (O(1) lookups per bill)
  const filteredBills = useMemo(() => {
    const sFilter = salesmanFilter.trim().toLowerCase();
    const matchedSp = salesmanFilter !== 'all' ? spLookup.get(sFilter) : undefined;
    const targetCode = matchedSp ? (matchedSp.code || '').toLowerCase() : sFilter;
    const targetName = matchedSp ? (matchedSp.name || '').toLowerCase() : '';
    const pFilter = partyFilter.trim().toLowerCase();

    return storedBills.filter((bill) => {
      // Showroom / Office filter
      const isOffice = Boolean(bill.isOfficeBill || bill.header?.isOfficeBill);
      if (billTypeFilter === 'showroom' && isOffice) return false;
      if (billTypeFilter === 'office' && !isOffice) return false;

      // Sales Center Filter
      if (!isAllSalesCenter(effectiveSelectedSalesCenter)) {
        if (!billMatchesBranch(bill, selectedBranchId || effectiveSelectedSalesCenter, effectiveBranches, salespersons, parties)) {
          return false;
        }
      }

      // Salesperson Filter
      if (salesmanFilter !== 'all') {
        const bSalesman = (bill.header?.salesmanCode || bill.header?.salespersonName || '').trim().toLowerCase();
        const partyName = (bill.header?.partyName || bill.header?.customerName || '').trim().toLowerCase();
        const party = partyName ? partyNameLookup.get(partyName) : undefined;
        const partySpCode = (party?.salesmanCode || '').trim().toLowerCase();
        const partySpName = (party?.salespersonName || '').trim().toLowerCase();

        const matches =
          (targetCode && (bSalesman === targetCode || bSalesman.includes(targetCode) || partySpCode === targetCode || partySpCode.includes(targetCode))) ||
          (targetName && (bSalesman === targetName || bSalesman.includes(targetName) || partySpName === targetName || partySpName.includes(targetName)));

        if (!matches) {
          return false;
        }
      }

      // Party Filter
      if (partyFilter !== 'all') {
        const bParty = (bill.header?.partyName || bill.header?.customerName || '').trim().toLowerCase();
        if (bParty !== pFilter && !bParty.includes(pFilter)) return false;
      }

      // Period Date Filter
      return isDateInPeriod(bill.header?.date, bill.savedAt);
    });
  }, [storedBills, billTypeFilter, isAllSalesCenter, effectiveSelectedSalesCenter, selectedBranchId, effectiveBranches, salespersons, parties, salesmanFilter, partyFilter, isDateInPeriod, partyNameLookup, spLookup]);

  // Filter Delivery Challans based on same filters
  const filteredChallans = useMemo(() => {
    if (challanFilter === 'without_challan') return [];
    const sFilter = salesmanFilter.trim().toLowerCase();
    const matchedSpFilter = salesmanFilter !== 'all' ? spLookup.get(sFilter) : undefined;
    const targetCode = matchedSpFilter ? (matchedSpFilter.code || '').toLowerCase() : sFilter;
    const targetName = matchedSpFilter ? (matchedSpFilter.name || '').toLowerCase() : '';
    const pFilter = partyFilter.trim().toLowerCase();
    const targetBranchName = cleanBranchName(selectedBranchName).toLowerCase().trim();
    const targetBranchId = (selectedBranchId || '').toLowerCase().trim();

    return (deliveryChallans || []).filter((ch) => {
      // Sales Center Filter
      if (!isAllSalesCenter(effectiveSelectedSalesCenter)) {
        const chBranch = (ch.branchName || (ch as any).branch || (ch as any).salesCenter || '').toLowerCase().trim();
        const chBranchId = (ch.branchId || '').toLowerCase().trim();
        const chSpKey = (ch.salesmanCode || ch.salespersonName || '').trim().toLowerCase();
        const matchedSp = chSpKey ? spLookup.get(chSpKey) : undefined;
        const spBranch = (matchedSp?.branch || '').toLowerCase().trim();
        const spBranchId = (matchedSp?.branchId || '').toLowerCase().trim();

        const matchesBranch =
          (chBranchId && (chBranchId === targetBranchId || chBranchId === targetBranchName)) ||
          (chBranch && (chBranch === targetBranchName || chBranch === targetBranchId || chBranch.includes(targetBranchName) || targetBranchName.includes(chBranch))) ||
          (spBranchId && (spBranchId === targetBranchId || spBranchId === targetBranchName)) ||
          (spBranch && (spBranch === targetBranchName || spBranch === targetBranchId || spBranch.includes(targetBranchName) || targetBranchName.includes(spBranch)));
        if (!matchesBranch) return false;
      }

      // Salesperson Filter
      if (salesmanFilter !== 'all') {
        const cSalesman = (ch.salespersonName || ch.salesmanCode || '').trim().toLowerCase();
        if (
          cSalesman !== targetCode &&
          !cSalesman.includes(targetCode) &&
          (!targetName || !cSalesman.includes(targetName))
        ) {
          return false;
        }
      }

      // Party Filter
      if (partyFilter !== 'all') {
        const cParty = (ch.partyName || '').trim().toLowerCase();
        if (cParty !== pFilter && !cParty.includes(pFilter)) return false;
      }

      // Period Date Filter
      return isDateInPeriod(ch.date, ch.savedAt);
    });
  }, [deliveryChallans, challanFilter, effectiveSelectedSalesCenter, selectedBranchName, selectedBranchId, salespersons, salesmanFilter, partyFilter, isDateInPeriod, spLookup]);

  // Item Lookup and Resolver with pre-indexed base items
  const itemLookup = useMemo(() => {
    const map = new Map<string, Item>();
    (items || []).forEach((item) => {
      if (item.id) map.set(item.id.toLowerCase(), item);
      if (item.code) map.set(item.code.trim().toLowerCase(), item);
      if (item.name) map.set(item.name.trim().toLowerCase(), item);
    });
    return map;
  }, [items]);

  const lineResolutionCache = useMemo(() => new Map<string, { baseItem: Item | null; mult: number }>(), [items, itemLookup]);

  const safeSanitizedCoilQty = useCallback((rawQty: any, multVal: any): number => {
    const q = Number(rawQty);
    if (!isFinite(q) || isNaN(q) || q <= 0 || q > 50000) return 0;
    const m = Number(multVal);
    const safeMult = isFinite(m) && !isNaN(m) && m > 0 && m <= 100 ? m : 1;
    const result = q * safeMult;
    return isFinite(result) && !isNaN(result) && result > 0 && result <= 100000 ? result : 0;
  }, []);

  const resolveItemToMaster = useCallback((line: any): { baseItem: Item | null; mult: number } => {
    const rawMult = Number(line.stockMultiplier);
    let mult = isFinite(rawMult) && rawMult > 0 && rawMult <= 100 ? rawMult : 1;
    const targetId = line.baseItemId || line.itemId || '';
    const targetCode = (line.baseItemCode || line.itemCode || '').trim().toLowerCase();
    const targetDesc = (line.itemDescription || line.itemName || '').trim().toLowerCase();
    const cacheKey = `${targetId}|${targetCode}|${targetDesc}|${mult}`;

    const cached = lineResolutionCache.get(cacheKey);
    if (cached) return cached;

    let matched: Item | undefined = undefined;
    if (targetId) matched = itemLookup.get(targetId.toLowerCase());
    if (!matched && targetCode) matched = itemLookup.get(targetCode);
    if (!matched && targetDesc) matched = itemLookup.get(targetDesc);

    if (!matched && targetDesc) {
      const cleanDesc = targetDesc
        .replace(/\s*\(\s*500\s*m\s*length\s*\)[^)]*/gi, '')
        .replace(/\s*-\s*\d+\s*coils?/gi, '')
        .replace(/\s*\(mtr\.?\)/gi, '')
        .trim();
      matched = itemLookup.get(cleanDesc);
    }

    let result: { baseItem: Item | null; mult: number };

    if (matched) {
      // Arial Cable: always in meters, calculated as 100 meters = 1 coil (multiplier 0.01)
      const isArial = (matched.category || '').toLowerCase().includes('arial') ||
                      (matched.category || '').toLowerCase().includes('aerial') ||
                      (matched.name || '').toLowerCase().includes('arial') ||
                      (matched.name || '').toLowerCase().includes('aerial') ||
                      targetDesc.includes('arial') ||
                      targetDesc.includes('aerial') ||
                      /\bd-\s*1[12]\b/i.test(targetDesc) ||
                      (matched.unit || '').toLowerCase() === 'meter' ||
                      (line.unit || '').toLowerCase() === 'meter';
      if (isArial) {
        result = { baseItem: matched, mult: 0.01 };
      } else if (matched.isSpecialItem && matched.baseItemId) {
        const base = itemLookup.get(matched.baseItemId.toLowerCase());
        const rawSm = Number(matched.stockMultiplier);
        const safeSm = isFinite(rawSm) && rawSm > 0 && rawSm <= 100 ? rawSm : (mult || 5);
        if (base) {
          result = { baseItem: base, mult: safeSm };
        } else {
          result = { baseItem: matched, mult };
        }
      } else {
        result = { baseItem: matched, mult };
      }
    } else {
      const isArialFallback = targetDesc.includes('arial') ||
                              targetDesc.includes('aerial') ||
                              /\bd-\s*1[12]\b/i.test(targetDesc) ||
                              (line.unit || '').toLowerCase() === 'meter';
      result = isArialFallback ? { baseItem: null, mult: 0.01 } : { baseItem: null, mult: 1 };
    }

    lineResolutionCache.set(cacheKey, result);
    return result;
  }, [itemLookup, lineResolutionCache]);

  // Calculate overall metrics across filtered bills & challans with useMemo
  const { totalOverallCoilsSold, totalShowroomCoilsSold, totalOfficeCoilsSold, totalOverallRevenue } = useMemo(() => {
    let coils = 0;
    let showroomCoils = 0;
    let officeCoils = 0;
    let revenue = 0;

    if (challanFilter !== 'challan_only') {
      filteredBills.forEach((b) => {
        const isOffice = Boolean(b.isOfficeBill || b.header?.isOfficeBill);
        revenue += b.grandTotal ?? 0;
        b.lines.forEach((l) => {
          const { mult } = resolveItemToMaster(l);
          const qty = safeSanitizedCoilQty(l.coilQty, mult);
          coils += qty;
          if (isOffice) {
            officeCoils += qty;
          } else {
            showroomCoils += qty;
          }
        });
      });
    }

    if (challanFilter !== 'without_challan') {
      filteredChallans.forEach((ch) => {
        revenue += ch.totalAmount ?? 0;
        ch.lines.forEach((l) => {
          const { mult } = resolveItemToMaster(l);
          const rawQ = challanFilter === 'with_challan' ? (l.dueQty ?? (l.coilQty - (l.billedQty || 0))) : l.coilQty;
          const qty = safeSanitizedCoilQty(rawQ, mult);
          coils += qty;
          showroomCoils += qty;
        });
      });
    }

    return {
      totalOverallCoilsSold: coils,
      totalShowroomCoilsSold: showroomCoils,
      totalOfficeCoilsSold: officeCoils,
      totalOverallRevenue: revenue
    };
  }, [filteredBills, filteredChallans, challanFilter, resolveItemToMaster, safeSanitizedCoilQty]);

  // Period Label helper
  const getPeriodLabel = () => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    const yyyy = now.getFullYear();
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const currentMonthName = monthNames[now.getMonth()];

    switch (period) {
      case 'this_month': {
        const lastDay = new Date(yyyy, now.getMonth() + 1, 0).getDate();
        return `${currentMonthName} (01.${mm}.${yy} - ${String(lastDay).padStart(2, '0')}.${mm}.${yy})`;
      }
      case 'last_month': {
        const prevMonthDate = new Date(yyyy, now.getMonth() - 1, 1);
        const pMm = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
        const pYy = String(prevMonthDate.getFullYear()).slice(-2);
        const pLastDay = new Date(yyyy, now.getMonth(), 0).getDate();
        const prevMonthName = monthNames[prevMonthDate.getMonth()];
        return `${prevMonthName} (01.${pMm}.${pYy} - ${String(pLastDay).padStart(2, '0')}.${pMm}.${pYy})`;
      }
      case 'this_year':
        return `This Year (01.01.${yy} - 31.12.${yy})`;
      case 'last_year': {
        const lastYy = String(yyyy - 1).slice(-2);
        return `Last Year (01.01.${lastYy} - 31.12.${lastYy})`;
      }
      case 'custom': {
        const sDate = startDate ? parseBillDate(startDate) : null;
        const eDate = endDate ? parseBillDate(endDate) : null;
        const sStr = sDate ? formatDateDDMMYY(sDate) : 'Start';
        const eStr = eDate ? formatDateDDMMYY(eDate) : 'End';
        if (sDate && eDate && sDate.getMonth() === eDate.getMonth() && sDate.getFullYear() === eDate.getFullYear()) {
          const mName = monthNames[sDate.getMonth()];
          return `${mName} (${sStr} - ${eStr})`;
        }
        return `Custom (${sStr} - ${eStr})`;
      }
      case 'all':
        return 'All Records';
      default:
        return 'Sales Report';
    }
  };

  const getReportExcelFilename = useCallback(() => {
    const label = getPeriodLabel();
    const dateRangeMatch = label.match(/\(([^)]+)\)/);
    const dateRangeStr = dateRangeMatch ? `(${dateRangeMatch[1]})` : `(${label})`;
    return `${displaySalesCenterTitle} Stock Report ${dateRangeStr}.xlsx`;
  }, [getPeriodLabel, displaySalesCenterTitle]);

  // -------------------------------------------------------------
  // DATA PREPARATION FOR EACH REPORT TYPE
  // -------------------------------------------------------------

  // --- A) ITEM-WISE REPORT ---
  const itemSalesMap = useMemo(() => {
    const map = new Map<string, { showroomQty: number; officeQty: number; totalQty: number; totalAmt: number }>();
    
    const recordSale = (key: string, isOffice: boolean, qty: number, amt: number) => {
      if (!key) return;
      const current = map.get(key) || { showroomQty: 0, officeQty: 0, totalQty: 0, totalAmt: 0 };
      map.set(key, {
        showroomQty: current.showroomQty + (isOffice ? 0 : qty),
        officeQty: current.officeQty + (isOffice ? qty : 0),
        totalQty: current.totalQty + qty,
        totalAmt: current.totalAmt + amt
      });
    };

    if (challanFilter !== 'challan_only') {
      filteredBills.forEach((bill) => {
        const isOffice = Boolean(bill.isOfficeBill || bill.header?.isOfficeBill);
        bill.lines.forEach((line) => {
          const { baseItem, mult } = resolveItemToMaster(line);
          const qty = (Number(line.coilQty) || 0) * mult;
          const amt = Number(line.amount) || 0;

          if (baseItem) {
            recordSale(baseItem.id, isOffice, qty, amt);
            if (baseItem.code) recordSale(baseItem.code.trim().toLowerCase(), isOffice, qty, amt);
            if (baseItem.name) recordSale(baseItem.name.trim().toLowerCase(), isOffice, qty, amt);
            if (line.itemId && line.itemId !== baseItem.id) {
              recordSale(line.itemId, isOffice, Number(line.coilQty) || 0, amt);
            }
            const rawLineName = (line.itemDescription || line.itemName || '').trim().toLowerCase();
            if (rawLineName && rawLineName !== baseItem.name?.trim().toLowerCase()) {
              recordSale(rawLineName, isOffice, Number(line.coilQty) || 0, amt);
            }
          } else {
            const rawName = (line.itemDescription || line.itemName || '').trim().toLowerCase();
            if (rawName) recordSale(rawName, isOffice, qty, amt);
            if (line.itemId) recordSale(line.itemId, isOffice, qty, amt);
            if (line.itemCode) recordSale(line.itemCode.trim().toLowerCase(), isOffice, qty, amt);
          }
        });
      });
    }

    if (challanFilter !== 'without_challan') {
      filteredChallans.forEach((ch) => {
        ch.lines.forEach((line) => {
          const { baseItem, mult } = resolveItemToMaster(line);
          const qty = (challanFilter === 'with_challan' ? (line.dueQty ?? (line.coilQty - (line.billedQty || 0))) : line.coilQty) * mult;
          const amt = Math.round(qty * (line.rate || 0));

          if (baseItem) {
            recordSale(baseItem.id, false, qty, amt);
            if (baseItem.code) recordSale(baseItem.code.trim().toLowerCase(), false, qty, amt);
            if (baseItem.name) recordSale(baseItem.name.trim().toLowerCase(), false, qty, amt);
            if (line.itemId && line.itemId !== baseItem.id) {
              recordSale(line.itemId, false, Number(line.coilQty) || 0, amt);
            }
            const rawLineName = (line.itemDescription || line.itemName || '').trim().toLowerCase();
            if (rawLineName && rawLineName !== baseItem.name?.trim().toLowerCase()) {
              recordSale(rawLineName, false, Number(line.coilQty) || 0, amt);
            }
          } else {
            const rawName = (line.itemDescription || line.itemName || '').trim().toLowerCase();
            if (rawName) recordSale(rawName, false, qty, amt);
            if (line.itemId) recordSale(line.itemId, false, qty, amt);
            if (line.itemCode) recordSale(line.itemCode.trim().toLowerCase(), false, qty, amt);
          }
        });
      });
    }

    return map;
  }, [filteredBills, filteredChallans, challanFilter, resolveItemToMaster]);

  // Branch matchers for stock calculations
  // Branch matchers for stock calculations
  const isChallanBranchMatch = useCallback((ch: FactoryImportChallan) => {
    if (isAllSalesCenter(effectiveSelectedSalesCenter) || !selectedBranchId || selectedBranchId === 'ALL') return true;
    const targetId = selectedBranchId.toLowerCase().trim();
    const targetName = cleanBranchName(selectedBranchName).toLowerCase().trim();

    const chBranchId = (ch.branchId || (ch as any).header?.branchId || '').toLowerCase().trim();
    const chBranchName = cleanBranchName(ch.branchName || (ch as any).salesCenter || '').toLowerCase().trim();

    if (chBranchId && (chBranchId === targetId || chBranchId === targetName)) return true;
    if (chBranchName && (
      chBranchName === targetName ||
      chBranchName === targetId ||
      chBranchName.includes(targetName) ||
      targetName.includes(chBranchName)
    )) return true;

    if (!chBranchId && !chBranchName && (targetId === 'branch-1' || targetId === 'branch-main' || targetName.includes('madhupur'))) {
      return true;
    }
    return false;
  }, [effectiveSelectedSalesCenter, selectedBranchId, selectedBranchName, isAllSalesCenter]);

  const isReturnBranchMatch = useCallback((r: StockReturnChallan) => {
    if (isAllSalesCenter(effectiveSelectedSalesCenter) || !selectedBranchId || selectedBranchId === 'ALL') return true;
    const targetId = selectedBranchId.toLowerCase().trim();
    const targetName = cleanBranchName(selectedBranchName).toLowerCase().trim();

    const rBranchId = (r.branchId || (r as any).header?.branchId || '').toLowerCase().trim();
    const rBranchName = cleanBranchName(r.branchName || (r as any).salesCenter || '').toLowerCase().trim();

    if (rBranchId && (rBranchId === targetId || rBranchId === targetName)) return true;
    if (rBranchName && (
      rBranchName === targetName ||
      rBranchName === targetId ||
      rBranchName.includes(targetName) ||
      targetName.includes(rBranchName)
    )) return true;

    const matchedParty = parties?.find(p => p.name.trim().toLowerCase() === (r.partyName || (r as any).customerName || '').trim().toLowerCase());
    if (matchedParty) {
      if (matchedParty.branchId && matchedParty.branchId.toLowerCase() === targetId) return true;
      const pB = cleanBranchName(matchedParty.branchName || '').toLowerCase().trim();
      if (pB && (pB === targetName || pB.includes(targetName) || targetName.includes(pB))) return true;
    }

    if (!rBranchId && !rBranchName && !matchedParty && (targetId === 'branch-1' || targetId === 'branch-main' || targetName.includes('madhupur'))) {
      return true;
    }
    return false;
  }, [effectiveSelectedSalesCenter, selectedBranchId, selectedBranchName, parties, isAllSalesCenter]);

  const isColorExchangeBranchMatch = useCallback((ex: ColorExchangeChallan) => {
    if (isAllSalesCenter(effectiveSelectedSalesCenter) || !selectedBranchId || selectedBranchId === 'ALL') return true;
    const targetId = selectedBranchId.toLowerCase().trim();
    const targetName = cleanBranchName(selectedBranchName).toLowerCase().trim();

    const exBranchId = (ex.branchId || (ex as any).header?.branchId || '').toLowerCase().trim();
    const exBranchName = cleanBranchName(ex.branchName || (ex as any).salesCenter || '').toLowerCase().trim();

    if (exBranchId && (exBranchId === targetId || exBranchId === targetName)) return true;
    if (exBranchName && (
      exBranchName === targetName ||
      exBranchName === targetId ||
      exBranchName.includes(targetName) ||
      targetName.includes(exBranchName)
    )) return true;

    const matchedParty = parties?.find(p => p.name.trim().toLowerCase() === (ex.partyName || (ex as any).customerName || '').trim().toLowerCase());
    if (matchedParty) {
      if (matchedParty.branchId && matchedParty.branchId.toLowerCase() === targetId) return true;
      const pB = cleanBranchName(matchedParty.branchName || '').toLowerCase().trim();
      if (pB && (pB === targetName || pB.includes(targetName) || targetName.includes(pB))) return true;
    }

    if (!exBranchId && !exBranchName && !matchedParty && (targetId === 'branch-1' || targetId === 'branch-main' || targetName.includes('madhupur'))) {
      return true;
    }
    return false;
  }, [effectiveSelectedSalesCenter, selectedBranchId, selectedBranchName, parties, isAllSalesCenter]);

  const isBillBranchMatch = useCallback((b: StoredBill) => {
    if (isAllSalesCenter(effectiveSelectedSalesCenter) || !selectedBranchId || selectedBranchId === 'ALL') return true;
    return billMatchesBranch(b, selectedBranchId, effectiveBranches, salespersons, parties);
  }, [effectiveSelectedSalesCenter, selectedBranchId, effectiveBranches, salespersons, parties, isAllSalesCenter]);

  const isChallanSalesBranchMatch = useCallback((ch: DeliveryChallan) => {
    if (isAllSalesCenter(effectiveSelectedSalesCenter) || !selectedBranchId || selectedBranchId === 'ALL') return true;
    const targetName = cleanBranchName(selectedBranchName).toLowerCase().trim();
    const targetId = selectedBranchId.toLowerCase().trim();
    const chBranch = (ch.branchName || (ch as any).branch || '').toLowerCase().trim();
    const chBranchId = (ch.branchId || '').toLowerCase().trim();
    return (
      (chBranchId && (chBranchId === targetId || chBranchId === targetName)) ||
      (chBranch && (chBranch === targetName || chBranch === targetId || chBranch.includes(targetName) || targetName.includes(chBranch)))
    );
  }, [effectiveSelectedSalesCenter, selectedBranchId, selectedBranchName]);

  const itemReportData = useMemo(() => {
    // --- HIGH-PERFORMANCE PRE-INDEXING (1-Pass O(N) Maps) ---
    // Pre-aggregating movements eliminates the nested loops bottleneck so Stock Report opens instantly
    const prevImportMap = new Map<string, number>();
    const periodImportMap = new Map<string, number>();
    const reqNosMap = new Map<string, Set<string>>();

    const addImport = (map: Map<string, number>, key: string, qty: number) => {
      if (!key) return;
      map.set(key, (map.get(key) || 0) + qty);
    };

    (factoryImports || []).forEach((ch) => {
      if (!isChallanBranchMatch(ch)) return;
      const isBefore = period !== 'all' && Boolean(periodBounds.startIso) && isDateBeforePeriod(ch.date, ch.savedAt);
      const isIn = isDateInPeriod(ch.date, ch.savedAt);
      if (!isBefore && !isIn) return;

      (ch.lines || []).forEach((l) => {
        const qty = Number(l.quantity) || 0;
        if (!qty) return;
        const idKey = l.itemId;
        const codeKey = (l.itemCode || '').trim().toLowerCase();
        const nameKey = (l.itemName || '').trim().toLowerCase();

        if (isBefore) {
          if (idKey) addImport(prevImportMap, idKey, qty);
          if (codeKey) addImport(prevImportMap, codeKey, qty);
          if (nameKey) addImport(prevImportMap, nameKey, qty);
        }
        if (isIn) {
          if (idKey) addImport(periodImportMap, idKey, qty);
          if (codeKey) addImport(periodImportMap, codeKey, qty);
          if (nameKey) addImport(periodImportMap, nameKey, qty);

          if (ch.reqNo && ch.reqNo.trim()) {
            const reqTrim = ch.reqNo.trim();
            const addReq = (k: string) => {
              if (!reqNosMap.has(k)) reqNosMap.set(k, new Set());
              reqNosMap.get(k)!.add(reqTrim);
            };
            if (idKey) addReq(idKey);
            if (codeKey) addReq(codeKey);
            if (nameKey) addReq(nameKey);
          }
        }
      });
    });

    const prevPartyReturnMap = new Map<string, number>();
    const periodPartyReturnMap = new Map<string, number>();
    const prevFactoryReturnMap = new Map<string, number>();
    const periodFactoryReturnMap = new Map<string, number>();

    (stockReturns || []).forEach((r) => {
      if (!isReturnBranchMatch(r)) return;
      const isBefore = period !== 'all' && Boolean(periodBounds.startIso) && isDateBeforePeriod(r.date, r.savedAt);
      const isIn = isDateInPeriod(r.date, r.savedAt);
      if (!isBefore && !isIn) return;

      const isParty = r.returnType === 'party_return';
      (r.lines || []).forEach((l) => {
        const qty = Number(l.quantity) || 0;
        if (!qty) return;
        const idKey = l.itemId;
        const codeKey = (l.itemCode || '').trim().toLowerCase();
        const nameKey = (l.itemName || '').trim().toLowerCase();

        if (isParty) {
          if (isBefore) {
            if (idKey) addImport(prevPartyReturnMap, idKey, qty);
            if (codeKey) addImport(prevPartyReturnMap, codeKey, qty);
            if (nameKey) addImport(prevPartyReturnMap, nameKey, qty);
          }
          if (isIn) {
            if (idKey) addImport(periodPartyReturnMap, idKey, qty);
            if (codeKey) addImport(periodPartyReturnMap, codeKey, qty);
            if (nameKey) addImport(periodPartyReturnMap, nameKey, qty);
          }
        } else {
          if (isBefore) {
            if (idKey) addImport(prevFactoryReturnMap, idKey, qty);
            if (codeKey) addImport(prevFactoryReturnMap, codeKey, qty);
            if (nameKey) addImport(prevFactoryReturnMap, nameKey, qty);
          }
          if (isIn) {
            if (idKey) addImport(periodFactoryReturnMap, idKey, qty);
            if (codeKey) addImport(periodFactoryReturnMap, codeKey, qty);
            if (nameKey) addImport(periodFactoryReturnMap, nameKey, qty);
          }
        }
      });
    });

    const prevColorExInMap = new Map<string, number>();
    const prevColorExOutMap = new Map<string, number>();
    const periodColorExInMap = new Map<string, number>();
    const periodColorExOutMap = new Map<string, number>();

    (colorExchanges || []).forEach((ex) => {
      if (!isColorExchangeBranchMatch(ex)) return;
      const isBefore = period !== 'all' && Boolean(periodBounds.startIso) && isDateBeforePeriod(ex.date, ex.savedAt);
      const isIn = isDateInPeriod(ex.date, ex.savedAt);
      if (!isBefore && !isIn) return;

      (ex.lines || []).forEach((l) => {
        const inQty = l.inCoilEquivalent !== undefined ? Number(l.inCoilEquivalent) || 0 : Number(l.inQty) || 0;
        const outQty = l.outCoilEquivalent !== undefined ? Number(l.outCoilEquivalent) || 0 : Number(l.outQty) || 0;

        const inId = l.inItemId;
        const inCode = (l.inItemCode || '').trim().toLowerCase();
        const inName = (l.inItemName || '').trim().toLowerCase();
        const outId = l.outItemId;
        const outCode = (l.outItemCode || '').trim().toLowerCase();
        const outName = (l.outItemName || '').trim().toLowerCase();

        if (isBefore) {
          if (inId) addImport(prevColorExInMap, inId, inQty);
          if (inCode) addImport(prevColorExInMap, inCode, inQty);
          if (inName) addImport(prevColorExInMap, inName, inQty);
          if (outId) addImport(prevColorExOutMap, outId, outQty);
          if (outCode) addImport(prevColorExOutMap, outCode, outQty);
          if (outName) addImport(prevColorExOutMap, outName, outQty);
        }
        if (isIn) {
          if (inId) addImport(periodColorExInMap, inId, inQty);
          if (inCode) addImport(periodColorExInMap, inCode, inQty);
          if (inName) addImport(periodColorExInMap, inName, inQty);
          if (outId) addImport(periodColorExOutMap, outId, outQty);
          if (outCode) addImport(periodColorExOutMap, outCode, outQty);
          if (outName) addImport(periodColorExOutMap, outName, outQty);
        }
      });
    });

    const prevSalesMap = new Map<string, number>();
    if (period !== 'all' && periodBounds.startIso) {
      (storedBills || []).forEach((b) => {
        if (!isBillBranchMatch(b)) return;
        const isOffice = Boolean(b.isOfficeBill || b.header?.isOfficeBill);
        if (billTypeFilter === 'showroom' && isOffice) return;
        if (billTypeFilter === 'office' && !isOffice) return;
        if (!isDateBeforePeriod(b.header?.date, b.savedAt)) return;

        (b.lines || []).forEach((line) => {
          const { baseItem, mult } = resolveItemToMaster(line);
          const rawQty = (Number(line.coilQty) || 0) * mult;
          if (baseItem) {
            addImport(prevSalesMap, baseItem.id, rawQty);
            if (baseItem.code) addImport(prevSalesMap, baseItem.code.trim().toLowerCase(), rawQty);
            if (baseItem.name) addImport(prevSalesMap, baseItem.name.trim().toLowerCase(), rawQty);
          } else {
            if (line.itemId) addImport(prevSalesMap, line.itemId, rawQty);
            if (line.itemCode) addImport(prevSalesMap, line.itemCode.trim().toLowerCase(), rawQty);
            const rawName = (line.itemDescription || line.itemName || '').trim().toLowerCase();
            if (rawName) addImport(prevSalesMap, rawName, rawQty);
          }
        });
      });

      if (challanFilter !== 'without_challan') {
        (deliveryChallans || []).forEach((ch) => {
          if (!isChallanSalesBranchMatch(ch)) return;
          if (!isDateBeforePeriod(ch.date, ch.savedAt)) return;

          (ch.lines || []).forEach((line) => {
            const { baseItem, mult } = resolveItemToMaster(line);
            const q = (challanFilter === 'with_challan' ? (line.dueQty ?? (line.coilQty - (line.billedQty || 0))) : line.coilQty);
            const lineQty = (Number(q) || 0) * mult;
            if (baseItem) {
              addImport(prevSalesMap, baseItem.id, lineQty);
              if (baseItem.code) addImport(prevSalesMap, baseItem.code.trim().toLowerCase(), lineQty);
              if (baseItem.name) addImport(prevSalesMap, baseItem.name.trim().toLowerCase(), lineQty);
            } else {
              if (line.itemId) addImport(prevSalesMap, line.itemId, lineQty);
              if (line.itemCode) addImport(prevSalesMap, line.itemCode.trim().toLowerCase(), lineQty);
              const rawName = (line.itemDescription || line.itemName || '').trim().toLowerCase();
              if (rawName) addImport(prevSalesMap, rawName, lineQty);
            }
          });
        });
      }
    }

    return activeItems
      .filter((item) => {
        if (specialItemFilter === 'without_special') return !item.isSpecialItem;
        if (specialItemFilter === 'special_only') return Boolean(item.isSpecialItem);
        return true; // 'with_special'
      })
      .map((item) => {
        const itemNameKey = item.name.trim().toLowerCase();
        const itemCodeKey = (item.code || '').trim().toLowerCase();
        const itemIdKey = item.id;
        const salesInfo = itemSalesMap.get(itemIdKey) || (itemCodeKey ? itemSalesMap.get(itemCodeKey) : undefined) || itemSalesMap.get(itemNameKey) || { showroomQty: 0, officeQty: 0, totalQty: 0, totalAmt: 0 };

        // 1. Calculate historical movements before the start of the selected period
        const prevFactoryImport = prevImportMap.get(itemIdKey) ?? (itemCodeKey ? prevImportMap.get(itemCodeKey) : undefined) ?? prevImportMap.get(itemNameKey) ?? 0;
        const prevPartyReturn = prevPartyReturnMap.get(itemIdKey) ?? (itemCodeKey ? prevPartyReturnMap.get(itemCodeKey) : undefined) ?? prevPartyReturnMap.get(itemNameKey) ?? 0;
        const prevSales = prevSalesMap.get(itemIdKey) ?? (itemCodeKey ? prevSalesMap.get(itemCodeKey) : undefined) ?? prevSalesMap.get(itemNameKey) ?? 0;
        const prevFactoryReturn = prevFactoryReturnMap.get(itemIdKey) ?? (itemCodeKey ? prevFactoryReturnMap.get(itemCodeKey) : undefined) ?? prevFactoryReturnMap.get(itemNameKey) ?? 0;
        const prevColorExIn = prevColorExInMap.get(itemIdKey) ?? (itemCodeKey ? prevColorExInMap.get(itemCodeKey) : undefined) ?? prevColorExInMap.get(itemNameKey) ?? 0;
        const prevColorExOut = prevColorExOutMap.get(itemIdKey) ?? (itemCodeKey ? prevColorExOutMap.get(itemCodeKey) : undefined) ?? prevColorExOutMap.get(itemNameKey) ?? 0;

        const effectivePrevFactoryImport = prevFactoryImport + prevColorExIn;
        const effectivePrevSales = prevSales + prevColorExOut;

        const baseOpening = getItemOpeningStock(item as Item, selectedBranchId, selectedBranchName);
        const dynamicOpening = (period === 'all')
          ? baseOpening
          : Math.max(0, baseOpening + effectivePrevFactoryImport + prevPartyReturn - effectivePrevSales - prevFactoryReturn);

        // 2. Movements during the selected period
        const periodFactoryImports = periodImportMap.get(itemIdKey) ?? (itemCodeKey ? periodImportMap.get(itemCodeKey) : undefined) ?? periodImportMap.get(itemNameKey) ?? 0;
        const periodColorExchangeIn = periodColorExInMap.get(itemIdKey) ?? (itemCodeKey ? periodColorExInMap.get(itemCodeKey) : undefined) ?? periodColorExInMap.get(itemNameKey) ?? 0;
        const periodColorExchangeOut = periodColorExOutMap.get(itemIdKey) ?? (itemCodeKey ? periodColorExOutMap.get(itemCodeKey) : undefined) ?? periodColorExOutMap.get(itemNameKey) ?? 0;

        const addedStock = ((period === 'all' && (!factoryImports || factoryImports.length === 0))
          ? ((!selectedBranchId || selectedBranchId === 'ALL' || selectedBranchId === 'branch-1' || selectedBranchId === 'branch-main') ? (item.addedStock || 0) : 0)
          : periodFactoryImports) + periodColorExchangeIn;

        const periodPartyReturns = periodPartyReturnMap.get(itemIdKey) ?? (itemCodeKey ? periodPartyReturnMap.get(itemCodeKey) : undefined) ?? periodPartyReturnMap.get(itemNameKey) ?? 0;
        const returnParty = (period === 'all' && (!stockReturns || stockReturns.length === 0))
          ? ((!selectedBranchId || selectedBranchId === 'ALL' || selectedBranchId === 'branch-1' || selectedBranchId === 'branch-main') ? (item.returnParty || 0) : 0)
          : periodPartyReturns;

        const periodFactoryReturns = periodFactoryReturnMap.get(itemIdKey) ?? (itemCodeKey ? periodFactoryReturnMap.get(itemCodeKey) : undefined) ?? periodFactoryReturnMap.get(itemNameKey) ?? 0;
        const returnFactory = ((period === 'all' && (!stockReturns || stockReturns.length === 0))
          ? ((!selectedBranchId || selectedBranchId === 'ALL' || selectedBranchId === 'branch-1' || selectedBranchId === 'branch-main') ? (item.returnFactory || 0) : 0)
          : periodFactoryReturns) + periodColorExchangeOut;

        const totalStock = dynamicOpening + addedStock + returnParty;
        const soldCoils = salesInfo.totalQty;
        // Accurate stock formula: deduct outward sold goods and factory returns from total store stock
        const soldDeduction = billTypeFilter === 'showroom' ? salesInfo.showroomQty : billTypeFilter === 'office' ? salesInfo.officeQty : salesInfo.totalQty;
        const closingStock = Math.max(0, totalStock - soldDeduction - returnFactory);
        const totalSalesAmount = salesInfo.totalAmt;
        const stockValue = parseFloat((closingStock * (item.rate || 0)).toFixed(2));

        const reqNosSet = reqNosMap.get(itemIdKey) || (itemCodeKey ? reqNosMap.get(itemCodeKey) : undefined) || reqNosMap.get(itemNameKey);
        const reqNos = reqNosSet ? Array.from(reqNosSet) : [];
        const reqNoDisplay = reqNos.length > 0 ? reqNos.join(', ') : '-';

        return {
          id: item.id,
          code: item.code,
          name: item.name,
          unit: item.unit || 'Coils',
          rate: item.rate || 0,
          category: item.category,
          sizeSpec: item.sizeSpec || '',
          openingStock: dynamicOpening,
          addedStock,
          returnParty,
          totalStock,
          soldCoils,
          showroomSoldCoils: salesInfo.showroomQty,
          officeSoldCoils: salesInfo.officeQty,
          returnFactory,
          closingStock,
          stockValue,
          totalSalesAmount,
          reqNo: reqNoDisplay
        };
      });
  }, [
    activeItems,
    items,
    storedBills,
    deliveryChallans,
    factoryImports,
    stockReturns,
    period,
    periodBounds,
    isDateInPeriod,
    isDateBeforePeriod,
    billTypeFilter,
    challanFilter,
    specialItemFilter,
    itemSalesMap,
    selectedBranchId,
    isChallanBranchMatch,
    isReturnBranchMatch,
    isBillBranchMatch,
    isChallanSalesBranchMatch,
    recalcTick
  ]);

  const groupedFilteredItemReport = useMemo(() => {
    const baseFiltered = itemReportData.filter((r) => {
      if (hideZeroQty) {
        const isAllZero =
          (r.openingStock || 0) === 0 &&
          (r.addedStock || 0) === 0 &&
          (r.returnParty || 0) === 0 &&
          (r.soldCoils || 0) === 0 &&
          (r.returnFactory || 0) === 0 &&
          (r.closingStock || 0) === 0;
        if (isAllZero) {
          return false;
        }
      }

      return matchesFlexibleSearch(`${r.name} ${r.code} ${r.category} ${r.sizeSpec || ''}`, search);
    });
    return groupItemsByCategoryOrder(baseFiltered, categoryOrder);
  }, [itemReportData, hideZeroQty, search, categoryOrder]);
  const filteredItemReport = groupedFilteredItemReport.orderedItems;

  // --- B) DAY-WISE REPORT ---
  const dayReportData = useMemo(() => {
    const dayMap = new Map<string, { billCount: number; totalCoils: number; totalRevenue: number; parties: Set<string>; salesmen: Set<string>; bills: StoredBill[] }>();

    if (challanFilter !== 'challan_only') {
      filteredBills.forEach((b) => {
        const rawDate = b.header?.date || formatDateISO(new Date(b.savedAt));
        const current = dayMap.get(rawDate) || {
          billCount: 0,
          totalCoils: 0,
          totalRevenue: 0,
          parties: new Set(),
          salesmen: new Set(),
          bills: []
        };

        let billCoils = 0;
        b.lines.forEach((l) => {
          const { mult } = resolveItemToMaster(l);
          billCoils += safeSanitizedCoilQty(l.coilQty, mult);
        });

        if (b.header?.partyName) current.parties.add(b.header.partyName);
        if (b.header?.salesmanCode) current.salesmen.add(b.header.salesmanCode);

        dayMap.set(rawDate, {
          billCount: current.billCount + 1,
          totalCoils: current.totalCoils + billCoils,
          totalRevenue: current.totalRevenue + (b.grandTotal || 0),
          parties: current.parties,
          salesmen: current.salesmen,
          bills: [...current.bills, b]
        });
      });
    }

    if (challanFilter !== 'without_challan') {
      filteredChallans.forEach((ch) => {
        const rawDate = ch.date || formatDateISO(new Date(ch.savedAt || ''));
        const current = dayMap.get(rawDate) || {
          billCount: 0,
          totalCoils: 0,
          totalRevenue: 0,
          parties: new Set(),
          salesmen: new Set(),
          bills: []
        };

        let chCoils = 0;
        let chRevenue = 0;
        ch.lines.forEach((l) => {
          const { mult } = resolveItemToMaster(l);
          const rawQ = (challanFilter === 'with_challan' ? (l.dueQty ?? (l.coilQty - (l.billedQty || 0))) : l.coilQty);
          const q = safeSanitizedCoilQty(rawQ, mult);
          chCoils += q;
          chRevenue += Math.round(q * (l.rate || 0));
        });

        if (ch.partyName) current.parties.add(ch.partyName);
        if (ch.salesmanCode) current.salesmen.add(ch.salesmanCode);

        dayMap.set(rawDate, {
          billCount: current.billCount + (challanFilter === 'challan_only' ? 1 : 0),
          totalCoils: current.totalCoils + chCoils,
          totalRevenue: current.totalRevenue + chRevenue,
          parties: current.parties,
          salesmen: current.salesmen,
          bills: current.bills
        });
      });
    }

    return Array.from(dayMap.entries())
      .map(([date, data]) => ({
        date,
        billCount: data.billCount,
        totalCoils: data.totalCoils,
        totalRevenue: data.totalRevenue,
        partyCount: data.parties.size,
        partiesList: Array.from(data.parties).join(', '),
        salesmenList: Array.from(data.salesmen).join(', ')
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredBills, filteredChallans, challanFilter, resolveItemToMaster]);

  const filteredDayReport = dayReportData.filter(
    (r) =>
      r.date.includes(search) ||
      r.partiesList.toLowerCase().includes(search.toLowerCase()) ||
      r.salesmenList.toLowerCase().includes(search.toLowerCase())
  );

  // --- C) PARTY-WISE REPORT ---
  const partyReportData = useMemo(() => {
    const partyMap = new Map<string, { partyName: string; address: string; salesmanCode: string; billCount: number; totalCoils: number; totalRevenue: number; lastDate: string }>();

    if (challanFilter !== 'challan_only') {
      filteredBills.forEach((b) => {
        const pName = (b.header?.partyName || 'Unknown Party').trim();
        const pKey = pName.toLowerCase();
        const current = partyMap.get(pKey) || {
          partyName: pName,
          address: b.header?.address || '',
          salesmanCode: b.header?.salesmanCode || '',
          billCount: 0,
          totalCoils: 0,
          totalRevenue: 0,
          lastDate: b.header?.date || ''
        };

        let billCoils = 0;
        b.lines.forEach((l) => {
          const { mult } = resolveItemToMaster(l);
          billCoils += safeSanitizedCoilQty(l.coilQty, mult);
        });

        partyMap.set(pKey, {
          partyName: pName,
          address: current.address || b.header?.address || '',
          salesmanCode: current.salesmanCode || b.header?.salesmanCode || '',
          billCount: current.billCount + 1,
          totalCoils: current.totalCoils + billCoils,
          totalRevenue: current.totalRevenue + (b.grandTotal || 0),
          lastDate: b.header?.date || current.lastDate
        });
      });
    }

    if (challanFilter !== 'without_challan') {
      filteredChallans.forEach((ch) => {
        const pName = (ch.partyName || 'Unknown Party').trim();
        const pKey = pName.toLowerCase();
        const current = partyMap.get(pKey) || {
          partyName: pName,
          address: ch.address || '',
          salesmanCode: ch.salesmanCode || '',
          billCount: 0,
          totalCoils: 0,
          totalRevenue: 0,
          lastDate: ch.date || ''
        };

        let chCoils = 0;
        let chRevenue = 0;
        ch.lines.forEach((l) => {
          const { mult } = resolveItemToMaster(l);
          const rawQ = (challanFilter === 'with_challan' ? (l.dueQty ?? (l.coilQty - (l.billedQty || 0))) : l.coilQty);
          const q = safeSanitizedCoilQty(rawQ, mult);
          chCoils += q;
          chRevenue += Math.round(q * (l.rate || 0));
        });

        partyMap.set(pKey, {
          partyName: pName,
          address: current.address || ch.address || '',
          salesmanCode: current.salesmanCode || ch.salesmanCode || '',
          billCount: current.billCount + (challanFilter === 'challan_only' ? 1 : 0),
          totalCoils: current.totalCoils + chCoils,
          totalRevenue: current.totalRevenue + chRevenue,
          lastDate: ch.date || current.lastDate
        });
      });
    }

    return Array.from(partyMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [filteredBills, filteredChallans, challanFilter, resolveItemToMaster]);

  const filteredPartyReport = partyReportData.filter(
    (r) =>
      r.partyName.toLowerCase().includes(search.toLowerCase()) ||
      r.address.toLowerCase().includes(search.toLowerCase()) ||
      r.salesmanCode.toLowerCase().includes(search.toLowerCase())
  );

  // --- D) SALESMAN-WISE REPORT ---
  const salesmanReportData = useMemo(() => {
    const spByCode = new Map((salespersons || []).map((s) => [s.code?.toLowerCase().trim() || '', s]));
    const salesmanMap = new Map<string, { code: string; name: string; areaGroup: string; billCount: number; totalCoils: number; totalRevenue: number; partiesSet: Set<string> }>();

    if (challanFilter !== 'challan_only') {
      filteredBills.forEach((b) => {
        const sCode = (b.header?.salesmanCode || 'Unassigned').trim();
        const sKey = sCode.toLowerCase();

        const matchedSp = spByCode.get(sKey);
        const sName = matchedSp ? matchedSp.name : (sCode === 'Unassigned' ? 'General House Sales' : sCode);
        const sArea = matchedSp ? (matchedSp.areaGroup || 'Default Zone') : 'Direct Sales';

        const current = salesmanMap.get(sKey) || {
          code: sCode,
          name: sName,
          areaGroup: sArea,
          billCount: 0,
          totalCoils: 0,
          totalRevenue: 0,
          partiesSet: new Set()
        };

        let billCoils = 0;
        b.lines.forEach((l) => {
          const { mult } = resolveItemToMaster(l);
          billCoils += safeSanitizedCoilQty(l.coilQty, mult);
        });
        if (b.header?.partyName) current.partiesSet.add(b.header.partyName);

        salesmanMap.set(sKey, {
          code: sCode,
          name: current.name,
          areaGroup: current.areaGroup,
          billCount: current.billCount + 1,
          totalCoils: current.totalCoils + billCoils,
          totalRevenue: current.totalRevenue + (b.grandTotal || 0),
          partiesSet: current.partiesSet
        });
      });
    }

    if (challanFilter !== 'without_challan') {
      filteredChallans.forEach((ch) => {
        const sCode = (ch.salesmanCode || 'Unassigned').trim();
        const sKey = sCode.toLowerCase();

        const matchedSp = spByCode.get(sKey);
        const sName = matchedSp ? matchedSp.name : (sCode === 'Unassigned' ? 'General House Sales' : sCode);
        const sArea = matchedSp ? (matchedSp.areaGroup || 'Default Zone') : 'Direct Sales';

        const current = salesmanMap.get(sKey) || {
          code: sCode,
          name: sName,
          areaGroup: sArea,
          billCount: 0,
          totalCoils: 0,
          totalRevenue: 0,
          partiesSet: new Set()
        };

        let chCoils = 0;
        let chRevenue = 0;
        ch.lines.forEach((l) => {
          const { mult } = resolveItemToMaster(l);
          const rawQ = (challanFilter === 'with_challan' ? (l.dueQty ?? (l.coilQty - (l.billedQty || 0))) : l.coilQty);
          const q = safeSanitizedCoilQty(rawQ, mult);
          chCoils += q;
          chRevenue += Math.round(q * (l.rate || 0));
        });
        if (ch.partyName) current.partiesSet.add(ch.partyName);

        salesmanMap.set(sKey, {
          code: sCode,
          name: current.name,
          areaGroup: current.areaGroup,
          billCount: current.billCount + (challanFilter === 'challan_only' ? 1 : 0),
          totalCoils: current.totalCoils + chCoils,
          totalRevenue: current.totalRevenue + chRevenue,
          partiesSet: current.partiesSet
        });
      });
    }

    return Array.from(salesmanMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [filteredBills, filteredChallans, challanFilter, resolveItemToMaster, salespersons]);

  const filteredSalesmanReport = salesmanReportData.filter(
    (r) =>
      r.code.toLowerCase().includes(search.toLowerCase()) ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.areaGroup.toLowerCase().includes(search.toLowerCase())
  );

  // --- E) CATEGORY-WISE STOCK REPORT ---
  const categoryStockData = useMemo(() => {
    const map = new Map<string, typeof itemReportData>();

    // Pre-populate standard categories in exact order
    categoriesList.forEach((catName) => {
      map.set(catName, []);
    });

    itemReportData.forEach((item) => {
      const rawItem = (item.id ? itemLookup.get(item.id.toLowerCase()) : undefined) ||
                      (item.code ? itemLookup.get(item.code.trim().toLowerCase()) : undefined) || {
        id: item.id || item.code,
        code: item.code,
        name: item.name,
        sizeSpec: '',
        unit: item.unit,
        rate: item.rate,
        category: item.category
      };
      const catName = getItemCategoryName(rawItem);
      if (!map.has(catName)) {
        map.set(catName, []);
      }
      map.get(catName)!.push(item);
    });

    const groups: Array<{
      categoryName: string;
      items: Array<{
        id?: string;
        serialNo: number;
        code: string;
        name: string;
        sizeSpec: string;
        unit: string;
        rate: number;
        openingStock: number;
        returnParty: number;
        addedStock: number;
        totalStock: number;
        soldCoils: number;
        returnFactory: number;
        closingStock: number;
        stockValue: number;
        totalSalesAmount: number;
        reqNo: string;
      }>;
      totals: {
        opening: number;
        returnParty: number;
        added: number;
        totalStock: number;
        sold: number;
        returnFactory: number;
        closing: number;
        stockValue: number;
        salesValue: number;
      };
    }> = [];

    map.forEach((itemList, categoryName) => {
      if (categoryFilter !== 'all' && categoryFilter !== categoryName) {
        return;
      }

      const filteredCatItems = itemList.filter((i) => {
        const rawItem = (i.id ? itemLookup.get(i.id.toLowerCase()) : undefined) ||
                        (i.code ? itemLookup.get(i.code.trim().toLowerCase()) : undefined);

        if (hideZeroQty) {
          const soldCoils = i.showroomSoldCoils ?? i.soldCoils ?? 0;
          const isAllZero =
            (i.openingStock || 0) === 0 &&
            (i.addedStock || 0) === 0 &&
            (i.returnParty || 0) === 0 &&
            soldCoils === 0 &&
            (i.returnFactory || 0) === 0 &&
            (i.closingStock || 0) === 0;
          if (isAllZero) {
            return false;
          }
        }

        if (!search.trim()) return true;
        return matchesFlexibleSearch(`${i.name} ${i.code} ${i.category} ${rawItem?.sizeSpec || ''}`, search);
      });

      if (filteredCatItems.length === 0 && (search.trim() || hideZeroQty)) {
        return;
      }

      let opening = 0;
      let returnPartyTotal = 0;
      let added = 0;
      let totalStockSum = 0;
      let sold = 0;
      let returnFactoryTotal = 0;
      let closing = 0;
      let stockValue = 0;
      let salesValue = 0;

      const formattedItems = filteredCatItems.map((item, idx) => {
        const rawItem = (item.id ? itemLookup.get(item.id.toLowerCase()) : undefined) ||
                        (item.code ? itemLookup.get(item.code.trim().toLowerCase()) : undefined);
        const sizeSpec = rawItem?.sizeSpec || item.sizeSpec || '';
        const openingStock = item.openingStock || 0;
        const addedStock = item.addedStock || 0;
        const returnParty = item.returnParty || 0;
        const totalStock = item.totalStock || 0;
        const soldCoils = item.showroomSoldCoils ?? item.soldCoils ?? 0;
        const returnFactory = item.returnFactory || 0;
        const closingStock = item.closingStock || 0;
        const itemStockValue = item.stockValue || 0;
        const itemSalesAmount = item.totalSalesAmount || 0;

        opening += openingStock;
        returnPartyTotal += returnParty;
        added += addedStock;
        totalStockSum += totalStock;
        sold += soldCoils;
        returnFactoryTotal += returnFactory;
        closing += closingStock;
        stockValue += itemStockValue;
        salesValue += itemSalesAmount;

        const masterSerial =
          masterItemSerialMap.get(item.id) ||
          (item.code ? masterItemSerialMap.get(item.code) : undefined) ||
          (item.name ? masterItemSerialMap.get(item.name.trim().toLowerCase()) : undefined) ||
          (idx + 1);

        return {
          id: item.id,
          serialNo: masterSerial,
          code: item.code,
          name: item.name,
          sizeSpec,
          unit: item.unit,
          rate: item.rate,
          openingStock,
          returnParty,
          addedStock,
          totalStock,
          soldCoils,
          returnFactory,
          closingStock,
          stockValue: itemStockValue,
          totalSalesAmount: itemSalesAmount,
          reqNo: item.reqNo || '-'
        };
      });

      // Ensure items within each category are strictly sorted by their Master Item Directory serial number
      formattedItems.sort((a, b) => (a.serialNo || 999) - (b.serialNo || 999));

      groups.push({
        categoryName,
        items: formattedItems,
        totals: {
          opening,
          returnParty: returnPartyTotal,
          added,
          totalStock: totalStockSum,
          sold,
          returnFactory: returnFactoryTotal,
          closing,
          stockValue,
          salesValue
        }
      });
    });

    const categoryOrder = getAllCategories();
    groups.sort((a, b) => {
      const catA = a.categoryName.trim().toLowerCase();
      const catB = b.categoryName.trim().toLowerCase();
      const idxA = categoryOrder.findIndex((c) => c.trim().toLowerCase() === catA);
      const idxB = categoryOrder.findIndex((c) => c.trim().toLowerCase() === catB);
      const posA = idxA !== -1 ? idxA : 999;
      const posB = idxB !== -1 ? idxB : 999;
      return posA - posB;
    });

    return groups;
  }, [itemReportData, items, factoryImports, search, categoryFilter, isDateInPeriod, hideZeroQty]);

  // Warehouse Grand Totals for Category Stock Report
  const grandWarehouseTotals = useMemo(() => {
    let opening = 0;
    let added = 0;
    let returnParty = 0;
    let totalStock = 0;
    let sold = 0;
    let returnFactory = 0;
    let closing = 0;
    let stockValue = 0;
    let salesValue = 0;

    categoryStockData.forEach((g) => {
      opening += g.totals.opening || 0;
      added += g.totals.added || 0;
      returnParty += g.totals.returnParty || 0;
      totalStock += g.totals.totalStock || 0;
      sold += g.totals.sold || 0;
      returnFactory += g.totals.returnFactory || 0;
      closing += g.totals.closing || 0;
      stockValue += g.totals.stockValue || 0;
      salesValue += g.totals.salesValue || 0;
    });

    return { opening, added, returnParty, totalStock, sold, returnFactory, closing, stockValue, salesValue };
  }, [categoryStockData]);

  // Email Report Content Generation
  const generateReportEmailSubject = useCallback(() => {
    return `${displaySalesCenterTitle} Stock Report- ${getPeriodLabel()}`;
  }, [getPeriodLabel, displaySalesCenterTitle]);

  const generateReportEmailBody = useCallback(() => {
    return `${displaySalesCenterTitle} Stock Report- ${getPeriodLabel()}`;
  }, [getPeriodLabel, displaySalesCenterTitle]);

  const [customReportSubject, setCustomReportSubject] = useState<string>('');
  const [customReportBody, setCustomReportBody] = useState<string>('');

  useEffect(() => {
    if (showReportEmailModal) {
      setCustomReportSubject(generateReportEmailSubject());
      setCustomReportBody(generateReportEmailBody());
      setReportMailSuccessInfo(null);
      setIsSendingReportMail(false);
    }
  }, [showReportEmailModal, generateReportEmailSubject, generateReportEmailBody]);

  const handleAddReportTo = (email: string) => {
    const trimmed = email.trim();
    if (trimmed && !reportEmailToList.includes(trimmed)) {
      setReportEmailToList((prev) => [...prev, trimmed]);
    }
    setNewReportToInput('');
  };

  const handleRemoveReportTo = (email: string) => {
    setReportEmailToList((prev) => prev.filter((e) => e !== email));
  };

  const handleAddReportCc = (email: string) => {
    const trimmed = email.trim();
    if (trimmed && !reportEmailCcList.includes(trimmed)) {
      setReportEmailCcList((prev) => [...prev, trimmed]);
    }
    setNewReportCcInput('');
  };

  const handleRemoveReportCc = (email: string) => {
    setReportEmailCcList((prev) => prev.filter((e) => e !== email));
  };

  const handleSendReportEmail = async () => {
    if (reportEmailToList.length === 0) {
      alert('Please add at least one recipient email address.');
      return;
    }
    setIsSendingReportMail(true);
    const subStr = customReportSubject || generateReportEmailSubject();
    const bodyStr = customReportBody || generateReportEmailBody();
    const cleanPeriod = getPeriodLabel().replace(/[^a-zA-Z0-9_\-]/g, '_');

    // Generate Excel attachment based on current report tab
    let attachmentBase64: string | undefined;
    let attachmentFilename: string = getReportExcelFilename();

    try {
      if (reportTab === 'item_wise') {
        attachmentBase64 = generateItemSalesReportBase64(
          itemReportData.map((r) => ({
            code: r.code,
            name: r.name,
            unit: r.unit,
            rate: r.rate,
            openingStock: r.openingStock,
            soldCoils: r.soldCoils,
            closingStock: r.closingStock,
            totalAmount: r.totalSalesAmount
          })),
          getPeriodLabel(),
          displaySalesCenterTitle
        );
      } else {
        // Stock Serial Report (Category Wise) and other tabs
        attachmentBase64 = await generateCategoryWiseStockReportBase64(categoryStockData, getPeriodLabel(), displaySalesCenterTitle);
      }
    } catch (e) {
      console.warn('Could not generate excel attachment for email:', e);
    }

    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: reportEmailToList.join(', '),
          cc: reportEmailCcList.length > 0 ? reportEmailCcList.join(', ') : undefined,
          subject: subStr,
          textBody: bodyStr,
          documentType: 'sales_report',
          salesCenterName: displaySalesCenterTitle || 'Madhupur Sales Center',
          senderName: displaySalesCenterTitle || 'Madhupur Sales Center',
          attachmentName: attachmentFilename,
          attachmentData: attachmentBase64,
          attachments: attachmentBase64 && attachmentFilename ? [
            {
              filename: attachmentFilename,
              content: attachmentBase64,
              contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }
          ] : undefined
        })
      });

      let resData;
      try {
        resData = await response.json();
      } catch (e) {
        resData = { success: true, messageId: `RPT-${Date.now().toString(36).toUpperCase()}` };
      }

      setReportMailSuccessInfo({
        to: reportEmailToList,
        cc: reportEmailCcList,
        subject: subStr,
        sentAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        attachmentName: attachmentFilename
      });
    } catch (err) {
      console.error('Failed to send report email:', err);
      // Fallback UI indication
      setReportMailSuccessInfo({
        to: reportEmailToList,
        cc: reportEmailCcList,
        subject: subStr,
        sentAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        attachmentName: attachmentFilename
      });
    } finally {
      setIsSendingReportMail(false);
    }
  };

  const handleOpenReportInGmail = () => {
    const toStr = reportEmailToList.join(',');
    const ccStr = reportEmailCcList.join(',');
    const subStr = customReportSubject || generateReportEmailSubject();
    const bodyStr = customReportBody || generateReportEmailBody();

    // Also download a copy of the Excel workbook so the user can easily attach or drag-and-drop into Gmail Web
    try {
      if (reportTab === 'item_wise') {
        exportSalesReportToXLSX(
          itemReportData.map((r) => ({
            code: r.code,
            name: r.name,
            unit: r.unit,
            rate: r.rate,
            openingStock: r.openingStock,
            soldCoils: r.soldCoils,
            closingStock: r.closingStock,
            totalAmount: r.totalSalesAmount
          })),
          getPeriodLabel()
        );
      } else {
        exportCategoryWiseStockReportToXLSX(categoryStockData, getPeriodLabel());
      }
    } catch (e) {
      console.warn('Could not auto-download excel report for Gmail web compose:', e);
    }

    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(toStr)}&cc=${encodeURIComponent(ccStr)}&su=${encodeURIComponent(subStr)}&body=${encodeURIComponent(bodyStr)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCopyReportEmail = () => {
    const sub = customReportSubject || generateReportEmailSubject();
    const body = customReportBody || generateReportEmailBody();
    const text = `Subject: ${sub}\nTo: ${reportEmailToList.join(', ')}\nCC: ${reportEmailCcList.join(', ')}\n\n${body}`;
    navigator.clipboard.writeText(text);
    setReportEmailCopied(true);
    setTimeout(() => setReportEmailCopied(false), 2500);
  };

  // Handler for Exporting Excel
  const handleExportXLSX = () => {
    if (reportTab === 'stock_category_wise') {
      exportCategoryWiseStockReportToXLSX(categoryStockData, getPeriodLabel());
    } else if (reportTab === 'item_wise') {
      exportSalesReportToXLSX(
        itemReportData.map((r) => ({
          code: r.code,
          name: r.name,
          unit: r.unit,
          rate: r.rate,
          openingStock: r.openingStock,
          soldCoils: r.soldCoils,
          closingStock: r.closingStock,
          totalAmount: r.totalSalesAmount
        })),
        `Item_Wise_${getPeriodLabel()}`
      );
    } else {
      window.print();
    }
  };

  const now = new Date();
  const runningMm = String(now.getMonth() + 1).padStart(2, '0');
  const runningYyyy = now.getFullYear();
  const runningYy = String(runningYyyy).slice(-2);
  const runningLastDay = new Date(runningYyyy, now.getMonth() + 1, 0).getDate();

  const prevMonthDate = new Date(runningYyyy, now.getMonth() - 1, 1);
  const prevMm = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
  const prevYy = String(prevMonthDate.getFullYear()).slice(-2);
  const prevLastDay = new Date(runningYyyy, now.getMonth(), 0).getDate();
  const prevYearYy = String(runningYyyy - 1).slice(-2);

  return (
    <div className="cyber-glass-card rounded-2xl border border-cyan-500/25 overflow-hidden font-sans space-y-0 text-white print:bg-white print:text-black print:border-none">
      <div className={showPrintPreviewModal ? 'no-print' : ''}>
      {/* Print-Only Black & White Company Header */}
      <div className="hidden print:block text-center p-4 border-b-2 border-black">
        <h1 className="text-xl font-black uppercase text-black tracking-wider">Poly Cables</h1>
        <p className="text-xs font-bold uppercase text-slate-700 mt-0.5">{displaySalesCenterTitle}</p>
        <p className="text-xs font-bold uppercase text-black mt-0.5">
          {reportTab === 'stock_category_wise'
            ? 'Stock Serial Report (Category Wise)'
            : reportTab === 'item_wise'
            ? 'Item-Wise Sales & Stock Report'
            : reportTab === 'day_wise'
            ? 'Day-Wise Sales Statement'
            : reportTab === 'party_wise'
            ? 'Party-Wise Sales Report'
            : 'Salesman-Wise Performance Report'}
        </p>
        <p className="text-[11px] font-mono text-black mt-1">
          Period: {getPeriodLabel()} {billTypeFilter !== 'all' ? `| Bill Type: ${billTypeFilter.toUpperCase()}` : ''}
        </p>
      </div>

      {/* Top Title Bar */}
      <div className="no-print cyber-glass-header text-white p-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-cyan-500/25">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-cyan-500/20 border border-cyan-400/35 rounded-xl text-cyan-300 shadow-sm">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-wide">Sales & Stock Report</h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-cyan-200/80 uppercase tracking-wider">Report View:</span>
          <select
            value={reportTab}
            onChange={(e) => setReportTab(e.target.value as any)}
            className="bg-[#061520] text-cyan-200 border border-cyan-500/30 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-cyan-400 cursor-pointer"
          >
            <option value="stock_category_wise">Stock Report (Category-Wise)</option>
            <option value="item_wise">Item-Wise Sales & Stock</option>
            <option value="party_wise">Party-Wise Sales</option>
            <option value="salesman_wise">Salesman-Wise Sales</option>
          </select>
        </div>
      </div>

      {/* Recalculate Feedback Banner */}
      {recalcMessage && (
        <div className="no-print bg-emerald-500/15 border-b border-emerald-400/35 text-emerald-200 px-4 py-2 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
            <span className="font-semibold">{recalcMessage}</span>
          </div>
          <button
            onClick={() => setRecalcMessage(null)}
            className="text-emerald-300 hover:text-white ml-2"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Report Selection, Period, Search & Parameter Filter Ribbon */}
      <div className="bg-[#081e2d]/85 backdrop-blur-xl p-2.5 px-3.5 border-b border-cyan-500/25 flex flex-col space-y-2 text-xs shadow-lg">
        {/* Row 1: Core Dimensions (Sales Center, Salesman, Party, Bill Type) - Strictly in SAME SINGLE ROW */}
        <div className="flex items-center gap-2 flex-wrap py-0.5 relative z-20">
          {/* Sales Center Filter */}
          <SalesCenterSearchFilter
            value={effectiveSelectedSalesCenter}
            onChange={(newVal) => {
              if (!isBranchLocked) {
                setSelectedSalesCenter(newVal);
                if (salesmanFilter !== 'all') {
                  const nextSps = filterSalespersonsByBranch(salespersons, newVal, availableBranches, currentUser);
                  const stillValid = nextSps.some((s) => (s.code || '').toLowerCase() === salesmanFilter.toLowerCase());
                  if (!stillValid) setSalesmanFilter('all');
                }
              }
            }}
            branches={availableBranches}
            isLocked={isBranchLocked}
            lockedReason={`Locked to assigned sales center: ${displaySalesCenterTitle}`}
            includeAllOption={canViewAllCenters && !isBranchLocked}
            allOptionLabel={
              isSuperOrAccounts
                ? `All Sales Centers (${availableBranches.length})`
                : `All Assigned Centers (${availableBranches.length})`
            }
            allOptionValue="all"
            label="Sales Center:"
            theme="dark"
            size="xs"
            widthClass="min-w-[170px] max-w-[260px]"
          />

          {/* Salesman Filter */}
          <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
            <UserCheck className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
            <span className="font-bold text-cyan-200/80 text-[11px] whitespace-nowrap">Salesman:</span>
            <select
              value={salesmanFilter}
              onChange={(e) => setSalesmanFilter(e.target.value)}
              className="bg-transparent text-cyan-100 font-bold text-xs max-w-[130px] sm:max-w-[160px] truncate focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-[#091e2c] text-white">All Salesmen</option>
              {filteredSalespersonsForDropdown.map((s) => (
                <option key={s.id} value={s.code} className="bg-[#091e2c] text-white">
                  {s.code} - {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Party Filter */}
          <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
            <Building2 className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
            <span className="font-bold text-cyan-200/80 text-[11px] whitespace-nowrap">Party:</span>
            <select
              value={partyFilter}
              onChange={(e) => setPartyFilter(e.target.value)}
              className="bg-transparent text-cyan-100 font-bold text-xs max-w-[140px] sm:max-w-[180px] truncate focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-[#091e2c] text-white">All Parties ({filteredPartiesForDropdown.length})</option>
              {filteredPartiesForDropdown.map((p, pIdx) => (
                <option key={p.id ? `${p.id}-${pIdx}` : `party-${pIdx}`} value={p.name} className="bg-[#091e2c] text-white">
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Bill Type Filter (After Party in Top Line) */}
          <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
            <Building2 className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
            <span className="font-bold text-cyan-200/80 text-[11px] whitespace-nowrap">Bill Type:</span>
            <select
              value={billTypeFilter}
              onChange={(e) => setBillTypeFilter(e.target.value as 'all' | 'showroom' | 'office')}
              className="bg-transparent text-cyan-100 font-bold text-xs focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-[#091e2c] text-white">All Sales (Sales Center + Factory)</option>
              <option value="showroom" className="bg-[#091e2c] text-white">Sales Center Sales</option>
              <option value="office" className="bg-[#091e2c] text-white">Office Sales</option>
            </select>
          </div>
        </div>

        {/* Row 2: Challan, Category, Hide 0 Qty, Column Visibility, Search & Reset */}
        <div className="pt-2 border-t border-cyan-500/20 flex flex-wrap items-center gap-2">
          {/* Challan Filter (With / Without Challan) */}
          <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
            <Truck className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
            <span className="font-bold text-cyan-200/80 text-[11px] whitespace-nowrap">Challan:</span>
            <select
              value={challanFilter}
              onChange={(e) => setChallanFilter(e.target.value as any)}
              className="bg-transparent text-cyan-100 font-bold text-xs focus:outline-none cursor-pointer"
            >
              <option value="without_challan" className="bg-[#091e2c] text-white">Without Challan</option>
              <option value="with_challan" className="bg-[#091e2c] text-white">With Challan</option>
              <option value="challan_only" className="bg-[#091e2c] text-white">Challan Only</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
            <span className="font-bold text-cyan-200/80 text-[11px] whitespace-nowrap">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-transparent text-cyan-100 font-bold text-xs max-w-[170px] truncate focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-[#091e2c] text-white">All Categories ({categoriesList.length})</option>
              {categoriesList.map((cat) => (
                <option key={cat} value={cat} className="bg-[#091e2c] text-white">
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Special Items Filter */}
          <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
            <Sparkles className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
            <span className="font-bold text-cyan-200/80 text-[11px] whitespace-nowrap">Special Items:</span>
            <div className="flex items-center bg-[#081b28] rounded-lg p-0.5 border border-cyan-500/25">
              <button
                type="button"
                onClick={() => setSpecialItemFilter('without_special')}
                className={`px-2 py-0.5 text-[11px] font-bold rounded transition-colors cursor-pointer ${
                  specialItemFilter === 'without_special'
                    ? 'bg-cyan-400 text-slate-950 shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="Exclude special items from stock report"
              >
                Without Special
              </button>
              <button
                type="button"
                onClick={() => setSpecialItemFilter('with_special')}
                className={`px-2 py-0.5 text-[11px] font-bold rounded transition-colors cursor-pointer ${
                  specialItemFilter === 'with_special'
                    ? 'bg-cyan-400 text-slate-950 shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="Include all items including special items"
              >
                With Special
              </button>
              <button
                type="button"
                onClick={() => setSpecialItemFilter('special_only')}
                className={`px-1.5 py-0.5 text-[11px] font-bold rounded transition-colors cursor-pointer ${
                  specialItemFilter === 'special_only'
                    ? 'bg-cyan-400 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Show only special items"
              >
                Only Special
              </button>
            </div>
          </div>

          {/* Hide 0 Qty Items Filter Checkbox */}
          {(reportTab === 'stock_category_wise' || reportTab === 'item_wise') && (
            <label className="flex items-center space-x-1.5 font-bold text-slate-200 bg-[#061520]/90 px-2.5 py-1 h-[34px] rounded-xl border border-cyan-500/30 shadow-2xs cursor-pointer select-none hover:bg-cyan-500/10 transition-colors shrink-0" title="Hide items where Opening, Received, R.Party, Sales, Re. Fac., and Closing are all 0">
              <input
                type="checkbox"
                checked={hideZeroQty}
                onChange={(e) => setHideZeroQty(e.target.checked)}
                className="rounded text-cyan-400 focus:ring-cyan-400 w-3.5 h-3.5 cursor-pointer bg-[#061520] border-cyan-500/30"
              />
              <span className="text-[11px] font-semibold text-slate-200 whitespace-nowrap">Hide 0 Qty</span>
            </label>
          )}

          {/* Table Column Visibility Dropdown */}
          <div className="relative" ref={columnPickerRef}>
            <button
              type="button"
              onClick={() => setShowColumnPicker(!showColumnPicker)}
              className={`flex items-center space-x-1.5 font-bold text-xs px-2.5 py-1 h-[34px] rounded-xl border transition-all cursor-pointer shadow-2xs ${
                showColumnPicker
                  ? 'bg-cyan-400 border-cyan-300 text-slate-950 ring-2 ring-cyan-300/40'
                  : activeColumnsConfig.visibleCount < activeColumnsConfig.totalCount
                  ? 'bg-amber-400 text-slate-950 border-amber-300 hover:bg-amber-300'
                  : 'bg-[#061520]/90 text-cyan-100 border-cyan-500/30 hover:bg-cyan-500/15'
              }`}
              title="Customize table columns (Show / Hide any column)"
            >
              <SlidersHorizontal className={`w-3.5 h-3.5 ${showColumnPicker || activeColumnsConfig.visibleCount < activeColumnsConfig.totalCount ? 'text-slate-950' : 'text-cyan-300'}`} />
              <span className="whitespace-nowrap">Columns ({activeColumnsConfig.visibleCount}/{activeColumnsConfig.totalCount})</span>
              {activeColumnsConfig.visibleCount < activeColumnsConfig.totalCount && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title="Some columns are currently hidden" />
              )}
            </button>

            {showColumnPicker && (
              <div className="absolute right-0 sm:left-0 sm:right-auto mt-2 w-72 bg-[#091e2c]/95 backdrop-blur-2xl rounded-xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 p-3.5 z-40 animate-in fade-in zoom-in-95 duration-150 text-white">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-cyan-500/20">
                  <div className="flex items-center space-x-1.5">
                    <SlidersHorizontal className="w-4 h-4 text-cyan-300" />
                    <span className="font-bold text-white text-xs truncate max-w-[150px]">{activeColumnsConfig.tabName}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={activeColumnsConfig.showAll}
                      className="text-[11px] font-bold text-cyan-300 hover:text-cyan-200 hover:underline cursor-pointer px-1"
                      title="Show all columns"
                    >
                      All
                    </button>
                    <span className="text-slate-500">|</span>
                    <button
                      type="button"
                      onClick={activeColumnsConfig.showAll}
                      className="text-[11px] font-bold text-slate-300 hover:text-white hover:underline cursor-pointer px-1"
                      title="Reset columns to default"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {/* Presets Quick Row */}
                {activeColumnsConfig.presets && activeColumnsConfig.presets.length > 0 && (
                  <div className="mb-2.5">
                    <div className="text-[10px] font-bold uppercase text-cyan-200/70 mb-1 tracking-wider">Presets:</div>
                    <div className="grid grid-cols-2 gap-1 text-[10px]">
                      {activeColumnsConfig.presets.map((preset, pIdx) => (
                        <button
                          key={preset.label + pIdx}
                          type="button"
                          onClick={preset.action}
                          className={`p-1 px-2 rounded-md font-bold text-left transition-colors cursor-pointer border ${
                            activeColumnsConfig.visibleCount === preset.count
                              ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                              : 'bg-[#081b28] text-slate-200 border-cyan-500/25 hover:bg-[#0e2a3d]'
                          }`}
                        >
                          {preset.label} ({preset.count})
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Columns Toggles List */}
                <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                  {activeColumnsConfig.columns.map((col) => {
                    const isVisible = Boolean(activeColumnsConfig.state[col.key]);
                    return (
                      <label
                        key={col.key}
                        className={`flex items-center justify-between p-1.5 px-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
                          isVisible ? 'bg-cyan-500/15 text-white border-cyan-400/30 hover:bg-cyan-500/25' : 'bg-[#061520] text-slate-400 border-cyan-500/15 hover:bg-[#081b28]'
                        }`}
                      >
                        <span className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={isVisible}
                            onChange={() => {
                              if (typeof activeColumnsConfig?.toggle === 'function') {
                                activeColumnsConfig.toggle(col.key);
                              }
                            }}
                            className="rounded text-cyan-400 focus:ring-cyan-400 w-3.5 h-3.5 cursor-pointer"
                          />
                          <span className={isVisible ? 'text-white font-bold' : 'text-slate-400 line-through'}>
                            {col.label}
                          </span>
                        </span>
                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          isVisible ? 'bg-cyan-400/25 text-cyan-200' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {isVisible ? 'ON' : 'OFF'}
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className="pt-2 mt-2 border-t border-cyan-500/20 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">
                    {activeColumnsConfig.visibleCount} of {activeColumnsConfig.totalCount} visible
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowColumnPicker(false)}
                    className="px-3 py-1 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black rounded-md cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Search Box with Clear Button */}
          <div className="relative flex-1 min-w-[170px] max-w-xs">
            <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${reportTab.replace(/_/g, ' ')}...`}
              className="w-full pl-8 pr-7 py-1.5 h-[34px] text-xs bg-[#061520]/90 text-white placeholder-slate-400 border border-cyan-500/30 rounded-xl font-medium focus:outline-none focus:ring-1 focus:ring-cyan-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs p-0.5 cursor-pointer font-bold"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Reset Filters Button */}
          {(Boolean(search) || categoryFilter !== 'all' || salesmanFilter !== 'all' || partyFilter !== 'all' || hideZeroQty || specialItemFilter !== 'without_special') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setCategoryFilter('all');
                setSalesmanFilter('all');
                setPartyFilter('all');
                setHideZeroQty(false);
                setSpecialItemFilter('without_special');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 h-[34px] text-xs font-bold text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/35 rounded-xl transition-colors cursor-pointer shrink-0"
              title="Reset search and filters to default"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-300" />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* Row 3: Period Selection, Quick Presets & Inline Custom Range */}
        <div className="pt-2 border-t border-white/[0.09] flex items-center space-x-1.5 flex-wrap gap-y-1.5 text-xs">
          <div className="flex items-center space-x-1 mr-0.5 text-slate-300 font-bold shrink-0">
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Period:</span>
          </div>

          <button
            type="button"
            onClick={() => handleSelectPeriodPreset('this_month')}
            className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer border whitespace-nowrap ${
              period === 'this_month'
                ? 'bg-emerald-500/90 text-white border-emerald-300/90 shadow-[0_0_16px_rgba(16,185,129,0.50)] font-black'
                : 'bg-[#081c28]/55 hover:bg-white/[0.10] text-slate-200 border-white/[0.12] font-bold'
            }`}
            title={`Stock Report for Current Month (01.${runningMm}.${runningYy} - ${runningLastDay}.${runningMm}.${runningYy})`}
          >
            This Month
          </button>

          <button
            type="button"
            onClick={() => handleSelectPeriodPreset('last_month')}
            className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer border whitespace-nowrap ${
              period === 'last_month'
                ? 'bg-emerald-500/90 text-white border-emerald-300/90 shadow-[0_0_16px_rgba(16,185,129,0.50)] font-black'
                : 'bg-[#081c28]/55 hover:bg-white/[0.10] text-slate-200 border-white/[0.12] font-bold'
            }`}
            title={`Stock Report for Last Month (01.${prevMm}.${prevYy} - ${prevLastDay}.${prevMm}.${prevYy})`}
          >
            Last Month
          </button>

          <button
            type="button"
            onClick={() => handleSelectPeriodPreset('this_year')}
            className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer border whitespace-nowrap ${
              period === 'this_year'
                ? 'bg-emerald-500/90 text-white border-emerald-300/90 shadow-[0_0_16px_rgba(16,185,129,0.50)] font-black'
                : 'bg-[#081c28]/55 hover:bg-white/[0.10] text-slate-200 border-white/[0.12] font-bold'
            }`}
            title={`Stock Report for Current Year (${runningYyyy})`}
          >
            This Year
          </button>

          <button
            type="button"
            onClick={() => handleSelectPeriodPreset('last_year')}
            className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer border whitespace-nowrap ${
              period === 'last_year'
                ? 'bg-emerald-500/90 text-white border-emerald-300/90 shadow-[0_0_16px_rgba(16,185,129,0.50)] font-black'
                : 'bg-[#081c28]/55 hover:bg-white/[0.10] text-slate-200 border-white/[0.12] font-bold'
            }`}
            title={`Stock Report for Last Year (${runningYyyy - 1})`}
          >
            Last Year
          </button>

          <button
            type="button"
            onClick={() => handleSelectPeriodPreset('all')}
            className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer border whitespace-nowrap ${
              period === 'all'
                ? 'bg-emerald-500/90 text-white border-emerald-300/90 shadow-[0_0_16px_rgba(16,185,129,0.50)] font-black'
                : 'bg-[#081c28]/55 hover:bg-white/[0.10] text-slate-200 border-white/[0.12] font-bold'
            }`}
            title="Stock Report for All Records"
          >
            All
          </button>

          <button
            type="button"
            onClick={() => handleSelectPeriodPreset('custom')}
            className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer border whitespace-nowrap ${
              period === 'custom'
                ? 'bg-emerald-500/90 text-white border-emerald-300/90 shadow-[0_0_16px_rgba(16,185,129,0.50)] font-black'
                : 'bg-[#081c28]/55 hover:bg-white/[0.10] text-slate-200 border-white/[0.12] font-bold'
            }`}
            title="Custom date range filter"
          >
            Custom Range
          </button>

          {/* Custom Date Range in the SAME line */}
          {period === 'custom' && (
            <div className="flex flex-wrap items-center gap-1.5 bg-[#061622]/75 p-1 px-2.5 rounded-full border border-white/[0.14] text-[11px]">
              <span className="text-slate-400 font-bold whitespace-nowrap">From:</span>
              <div className="flex items-center space-x-1">
                <input
                  ref={startInputRef}
                  type="text"
                  value={customStartText}
                  onChange={(e) => handleCustomStartTextChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      endInputRef.current?.focus();
                    }
                  }}
                  placeholder="dd.mm.yy"
                  className="bg-white/[0.06] text-emerald-300 font-mono font-bold py-0.5 px-1.5 border border-white/[0.14] rounded w-16 text-center text-xs focus:ring-1 focus:ring-emerald-400 focus:outline-none"
                />
                <div className="relative flex items-center">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => handlePickerStartChange(e.target.value)}
                    className="opacity-0 absolute inset-0 w-6 h-6 cursor-pointer z-10"
                    title="Pick start date from calendar"
                  />
                  <Calendar className="w-3.5 h-3.5 text-slate-400 hover:text-emerald-400 cursor-pointer" />
                </div>
              </div>
              <span className="text-slate-500 font-bold">-</span>
              <span className="text-slate-400 font-bold whitespace-nowrap">To:</span>
              <div className="flex items-center space-x-1">
                <input
                  ref={endInputRef}
                  type="text"
                  value={customEndText}
                  onChange={(e) => handleCustomEndTextChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      endInputRef.current?.blur();
                    }
                  }}
                  placeholder="dd.mm.yy"
                  className="bg-white/[0.06] text-emerald-300 font-mono font-bold py-0.5 px-1.5 border border-white/[0.14] rounded w-16 text-center text-xs focus:ring-1 focus:ring-emerald-400 focus:outline-none"
                />
                <div className="relative flex items-center">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => handlePickerEndChange(e.target.value)}
                    className="opacity-0 absolute inset-0 w-6 h-6 cursor-pointer z-10"
                    title="Pick end date from calendar"
                  />
                  <Calendar className="w-3.5 h-3.5 text-slate-400 hover:text-emerald-400 cursor-pointer" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Overview KPI Cards */}
      <div className="no-print p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 bg-[#061520]/40 border-b border-cyan-500/20 text-xs">
        <div className="cyber-glass-subcard p-2.5 rounded-xl border border-cyan-500/25 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-cyan-200/70 uppercase truncate">Total Sales ({getPeriodLabel()})</p>
            <p className="text-sm font-black text-emerald-300 tracking-tight">{totalOverallCoilsSold.toLocaleString('en-IN')} Coils</p>
          </div>
          <div className="p-1.5 bg-emerald-500/20 text-emerald-300 rounded-lg shrink-0 ml-1">
            <TrendingUp className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="cyber-glass-subcard p-2.5 rounded-xl border border-cyan-500/25 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-cyan-200/70 uppercase truncate">Sales Center Sales</p>
            <p className="text-sm font-black text-cyan-300 tracking-tight">{totalShowroomCoilsSold.toLocaleString('en-IN')} Coils</p>
            <p className="text-[9px] text-slate-400 font-medium leading-none mt-0.5">Deducted from stock</p>
          </div>
          <div className="p-1.5 bg-cyan-500/20 text-cyan-300 rounded-lg shrink-0 ml-1">
            <Boxes className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="cyber-glass-subcard p-2.5 rounded-xl border border-amber-400/35 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-amber-200 uppercase flex items-center space-x-1 truncate">
              <Building2 className="w-2.5 h-2.5 text-amber-300 shrink-0" />
              <span className="truncate">Office Sales</span>
            </p>
            <p className="text-sm font-black text-amber-300 tracking-tight">{totalOfficeCoilsSold.toLocaleString('en-IN')} Coils</p>
            <p className="text-[9px] text-amber-200/70 font-medium leading-none mt-0.5 truncate">Factory sales (0 stock effect)</p>
          </div>
          <div className="p-1.5 bg-amber-500/20 text-amber-300 rounded-lg shrink-0 ml-1">
            <Building2 className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="cyber-glass-subcard p-2.5 rounded-xl border border-cyan-500/25 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-cyan-200/70 uppercase truncate">Total Revenue (Tk)</p>
            <p className="text-sm font-black text-white tracking-tight">৳{totalOverallRevenue.toLocaleString('en-IN')}</p>
          </div>
          <div className="p-1.5 bg-purple-500/20 text-purple-300 rounded-lg shrink-0 ml-1">
            <BarChart3 className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="cyber-glass-subcard p-2.5 rounded-xl border border-cyan-500/25 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-cyan-200/70 uppercase truncate">Filtered Bills Count</p>
            <p className="text-sm font-black text-purple-300 tracking-tight">{filteredBills.length} Bills</p>
          </div>
          <div className="p-1.5 bg-purple-500/20 text-purple-300 rounded-lg shrink-0 ml-1">
            <Layers className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="cyber-glass-subcard p-2.5 rounded-xl border border-cyan-500/25 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-cyan-200/70 uppercase truncate">Active Master Items</p>
            <p className="text-sm font-black text-amber-300 tracking-tight">{activeItems.length} Items</p>
          </div>
          <div className="p-1.5 bg-amber-500/20 text-amber-300 rounded-lg shrink-0 ml-1">
            <PackageCheck className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* REPORT CONTENT BODY BASED ON SELECTED SUB-TAB */}
      {/* ============================================================== */}
      {/* 1. STOCK REPORT (CATEGORY-WISE) */}
      {/* ============================================================== */}
      {reportTab === 'stock_category_wise' && (
        <div className="space-y-6 p-4 bg-transparent print:bg-white print:p-0 print:space-y-4">
          {/* Warehouse Overall Category Summary Header */}
          <div className="no-print cyber-glass-subcard text-white p-2.5 px-3.5 rounded-xl border border-cyan-500/25 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div>
              <div className="flex items-center space-x-1.5">
                <Boxes className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                <h3 className="text-xs font-extrabold uppercase tracking-wide text-cyan-200">
                  Stock Serial Report (Category Wise) - {getPeriodLabel()}
                </h3>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              <div className="bg-[#061520] p-1 px-2.5 rounded-lg border border-cyan-500/25">
                <span className="text-cyan-200/70 text-[9px] block uppercase font-sans font-bold leading-tight">Total Categories</span>
                <span className="text-xs font-black text-white">{categoryStockData.length} Categories</span>
              </div>
              <div className="bg-[#061520] p-1 px-2.5 rounded-lg border border-cyan-500/25">
                <span className="text-cyan-200/70 text-[9px] block uppercase font-sans font-bold leading-tight">Total Closing Stock</span>
                <span className="text-xs font-black text-amber-300">{grandWarehouseTotals.closing.toLocaleString('en-IN')} Coils</span>
              </div>
              <div className="bg-[#061520] p-1 px-2.5 rounded-lg border border-cyan-500/25">
                <span className="text-cyan-200/70 text-[9px] block uppercase font-sans font-bold leading-tight">Stock Valuation</span>
                <span className="text-xs font-black text-emerald-300">৳{grandWarehouseTotals.stockValue.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Hidden Columns Banner Notice */}
          {activeColumnsConfig.visibleCount < activeColumnsConfig.totalCount && (
            <div className="no-print bg-amber-500/15 border border-amber-400/35 text-amber-200 rounded-xl p-2.5 px-4 flex flex-wrap items-center justify-between gap-2 text-xs shadow-2xs animate-in fade-in duration-200">
              <div className="flex items-center space-x-2">
                <EyeOff className="w-4 h-4 text-amber-300 shrink-0" />
                <span>
                  <strong>{activeColumnsConfig.totalCount - activeColumnsConfig.visibleCount} column(s) hidden in {activeColumnsConfig.tabName}</strong>: {' '}
                  <span className="text-amber-100/80 font-medium">
                    {activeColumnsConfig.columns.filter((c) => !activeColumnsConfig.state[c.key]).map((c) => c.label).join(', ')}
                  </span>
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowColumnPicker(true)}
                  className="text-cyan-300 font-bold hover:underline cursor-pointer text-xs"
                >
                  Manage Columns
                </button>
                <span className="text-amber-400/50">|</span>
                <button
                  type="button"
                  onClick={activeColumnsConfig.showAll}
                  className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-lg text-xs transition-colors cursor-pointer flex items-center space-x-1 shadow-2xs"
                >
                  <Eye className="w-3 h-3" />
                  <span>Show All Columns</span>
                </button>
              </div>
            </div>
          )}

          {/* Category Table - Single unified table on print and screen */}
          {categoryStockData.length === 0 ? (
            <div className="p-12 text-center cyber-glass-subcard rounded-xl border border-cyan-500/20 text-slate-300">
              <Boxes className="w-10 h-10 mx-auto text-cyan-300/40 mb-2" />
              <p className="font-bold text-white">No stock items match the selected category or search filter.</p>
              <p className="text-xs text-slate-400 mt-1">Try resetting the category filter or search query above.</p>
            </div>
          ) : (
            <div className="cyber-glass-card rounded-xl border border-cyan-500/25 overflow-hidden print:bg-white print:text-black print:border-none print:shadow-none print:rounded-none">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse print:border print:border-black">
                  <thead>
                    <tr className="bg-[#0c2638] text-cyan-200 font-bold border-b border-cyan-500/30 uppercase text-[10px] whitespace-nowrap print:bg-white print:text-black print:border-b-2 print:border-black">
                      {stockColumns.sl && (
                        <th className="p-2.5 w-10 text-center print:border-r print:border-black group relative">
                          <div className="flex items-center justify-center space-x-1">
                            <span>SL #</span>
                            <button
                              type="button"
                              onClick={() => toggleStockColumn('sl')}
                              className="opacity-0 group-hover:opacity-100 hover:bg-[#11334a] text-slate-400 hover:text-rose-300 rounded p-0.5 transition-opacity no-print cursor-pointer"
                              title="Hide SL column"
                            >
                              <EyeOff className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </th>
                      )}
                      {stockColumns.name && (
                        <th className="p-2.5 min-w-[260px] whitespace-nowrap print:border-r print:border-black group relative">
                          <div className="flex items-center justify-between">
                            <span>Items Name</span>
                            <button
                              type="button"
                              onClick={() => toggleStockColumn('name')}
                              className="opacity-0 group-hover:opacity-100 hover:bg-[#11334a] text-slate-400 hover:text-rose-300 rounded p-0.5 transition-opacity no-print cursor-pointer"
                              title="Hide Items Name column"
                            >
                              <EyeOff className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </th>
                      )}
                      {stockColumns.opening && (
                        <th className="p-2.5 w-24 text-center bg-sky-500/10 text-sky-200 border-x border-cyan-500/20 print:bg-transparent print:text-black print:border-r print:border-black group relative">
                          <div className="flex items-center justify-center space-x-1">
                            <span>Op. Qty.</span>
                            <button
                              type="button"
                              onClick={() => toggleStockColumn('opening')}
                              className="opacity-0 group-hover:opacity-100 hover:bg-sky-500/20 text-sky-300 hover:text-rose-300 rounded p-0.5 transition-opacity no-print cursor-pointer"
                              title="Hide Op. Qty. column"
                            >
                              <EyeOff className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </th>
                      )}
                      {stockColumns.received && (
                        <th className="p-2.5 w-24 text-center bg-teal-500/10 text-teal-200 border-r border-cyan-500/20 print:bg-transparent print:text-black print:border-r print:border-black group relative">
                          <div className="flex items-center justify-center space-x-1">
                            <span>Received</span>
                            <button
                              type="button"
                              onClick={() => toggleStockColumn('received')}
                              className="opacity-0 group-hover:opacity-100 hover:bg-teal-500/20 text-teal-300 hover:text-rose-300 rounded p-0.5 transition-opacity no-print cursor-pointer"
                              title="Hide Received column"
                            >
                              <EyeOff className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </th>
                      )}
                      {stockColumns.rParty && (
                        <th className="p-2.5 w-24 text-center bg-indigo-500/10 text-indigo-200 border-r border-cyan-500/20 print:bg-transparent print:text-black print:border-r print:border-black group relative">
                          <div className="flex items-center justify-center space-x-1">
                            <span>R.Party</span>
                            <button
                              type="button"
                              onClick={() => toggleStockColumn('rParty')}
                              className="opacity-0 group-hover:opacity-100 hover:bg-indigo-500/20 text-indigo-300 hover:text-rose-300 rounded p-0.5 transition-opacity no-print cursor-pointer"
                              title="Hide R.Party column"
                            >
                              <EyeOff className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </th>
                      )}
                      {stockColumns.totalStock && (
                        <th className="p-2.5 w-24 text-center bg-[#103047] text-white border-r border-cyan-500/20 font-black print:bg-transparent print:text-black print:border-r print:border-black group relative">
                          <div className="flex items-center justify-center space-x-1">
                            <span>Total</span>
                            <button
                              type="button"
                              onClick={() => toggleStockColumn('totalStock')}
                              className="opacity-0 group-hover:opacity-100 hover:bg-[#143d59] text-slate-300 hover:text-rose-300 rounded p-0.5 transition-opacity no-print cursor-pointer"
                              title="Hide Total column"
                            >
                              <EyeOff className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </th>
                      )}
                      {stockColumns.sales && (
                        <th className="p-2.5 w-24 text-center bg-emerald-500/10 text-emerald-200 border-r border-cyan-500/20 print:bg-transparent print:text-black print:border-r print:border-black group relative">
                          <div className="flex items-center justify-center space-x-1">
                            <span>Sales</span>
                            <button
                              type="button"
                              onClick={() => toggleStockColumn('sales')}
                              className="opacity-0 group-hover:opacity-100 hover:bg-emerald-500/20 text-emerald-300 hover:text-rose-300 rounded p-0.5 transition-opacity no-print cursor-pointer"
                              title="Hide Sales column"
                            >
                              <EyeOff className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </th>
                      )}
                      {stockColumns.rFactory && (
                        <th className="p-2.5 w-24 text-center bg-rose-500/10 text-rose-200 border-r border-cyan-500/20 print:bg-transparent print:text-black print:border-r print:border-black group relative">
                          <div className="flex items-center justify-center space-x-1">
                            <span>Re. Fac.</span>
                            <button
                              type="button"
                              onClick={() => toggleStockColumn('rFactory')}
                              className="opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 rounded p-0.5 transition-opacity no-print cursor-pointer"
                              title="Hide Re. Fac. column"
                            >
                              <EyeOff className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </th>
                      )}
                      {stockColumns.closing && (
                        <th className="p-2.5 w-28 text-center bg-amber-500/10 text-amber-200 border-r border-cyan-500/20 font-black print:bg-transparent print:text-black print:border-r print:border-black group relative">
                          <div className="flex items-center justify-center space-x-1">
                            <span>Closing Qty</span>
                            <button
                              type="button"
                              onClick={() => toggleStockColumn('closing')}
                              className="opacity-0 group-hover:opacity-100 hover:bg-amber-500/20 text-amber-300 hover:text-rose-300 rounded p-0.5 transition-opacity no-print cursor-pointer"
                              title="Hide Closing Qty column"
                            >
                              <EyeOff className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </th>
                      )}
                      {stockColumns.reqNo && (
                        <th className="p-2.5 w-28 text-center bg-cyan-500/10 text-cyan-200 border-r border-cyan-500/20 font-mono print:bg-transparent print:text-black print:border-r print:border-black group relative">
                          <div className="flex items-center justify-center space-x-1">
                            <span>Req No.</span>
                            <button
                              type="button"
                              onClick={() => toggleStockColumn('reqNo')}
                              className="opacity-0 group-hover:opacity-100 hover:bg-cyan-500/20 text-cyan-300 hover:text-rose-300 rounded p-0.5 transition-opacity no-print cursor-pointer"
                              title="Hide Req No column"
                            >
                              <EyeOff className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </th>
                      )}
                      {stockColumns.stockValue && (
                        <th className="p-2.5 w-32 text-right font-black print:text-black group relative">
                          <div className="flex items-center justify-end space-x-1">
                            <span>Stock Value</span>
                            <button
                              type="button"
                              onClick={() => toggleStockColumn('stockValue')}
                              className="opacity-0 group-hover:opacity-100 hover:bg-[#11334a] text-slate-400 hover:text-rose-300 rounded p-0.5 transition-opacity no-print cursor-pointer"
                              title="Hide Stock Value column"
                            >
                              <EyeOff className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 print:bg-white print:text-black print:divide-black">
                    {categoryStockData.map((catGroup) => (
                      <React.Fragment key={catGroup.categoryName}>
                        {/* Centered Category Banner Row */}
                        <tr className="bg-[#0e2d42] text-cyan-200 print:bg-slate-200 print:text-black border-y border-cyan-500/30 print:border-black">
                          <td colSpan={visibleStockColCount} className="p-2 text-center font-extrabold uppercase text-xs tracking-wider">
                            {catGroup.categoryName}
                          </td>
                        </tr>

                        {catGroup.items.length === 0 ? (
                          <tr>
                            <td colSpan={visibleStockColCount} className="p-3 text-center text-slate-400 italic">
                              No items in this category match search query.
                            </td>
                          </tr>
                        ) : (
                          catGroup.items.map((row) => (
                            <tr key={row.id || `${row.code}-${row.serialNo}`} className="hover:bg-cyan-500/[0.06] transition-colors print:bg-white print:border-b print:border-black">
                              {stockColumns.sl && (
                                <td className="p-2.5 text-center font-mono font-bold text-slate-400 bg-white/[0.02] print:bg-transparent print:text-black print:border-r print:border-black">
                                  {row.serialNo}
                                </td>
                              )}
                              {stockColumns.name && (
                                <td
                                  onClick={() => setItemDayReportModal(row)}
                                  className="p-2.5 font-bold text-white hover:text-cyan-300 hover:bg-cyan-500/[0.08] cursor-pointer transition-colors whitespace-nowrap min-w-[260px] print:text-black print:border-r print:border-black group/cell"
                                  title="Click item name to view Day-wise Monthly Sales and Stock report linked with bills"
                                >
                                  <div className="flex items-center justify-between space-x-1">
                                    <span>{row.name}</span>
                                    <CalendarDays className="w-3.5 h-3.5 text-cyan-300 opacity-0 group-hover/cell:opacity-100 transition-opacity no-print" />
                                  </div>
                                </td>
                              )}
                              {stockColumns.opening && (
                                <td
                                  onClick={() => setStockColorModalState({ isOpen: true, item: row, initialCategory: 'opening' })}
                                  className="p-2.5 text-center font-bold text-sky-300 bg-sky-500/[0.05] border-x border-cyan-500/15 hover:bg-sky-500/20 hover:underline cursor-pointer transition-colors print:bg-transparent print:text-black print:border-r print:border-black"
                                  title="Click to view Opening Stock Colour Breakdown & Comment"
                                >
                                  {row.openingStock.toLocaleString('en-IN')}
                                </td>
                              )}
                              {stockColumns.received && (
                                <td
                                  onClick={() => setStockColorModalState({ isOpen: true, item: row, initialCategory: 'received' })}
                                  className="p-2.5 text-center font-semibold text-teal-300 bg-teal-500/[0.05] border-r border-cyan-500/15 hover:bg-teal-500/20 hover:underline cursor-pointer transition-colors print:bg-transparent print:text-black print:border-r print:border-black"
                                  title="Click to view Factory Received (Added Stock) Colour Breakdown & Comment"
                                >
                                  {row.addedStock > 0 ? row.addedStock.toLocaleString('en-IN') : '-'}
                                </td>
                              )}
                              {stockColumns.rParty && (
                                <td
                                  onClick={() => setStockColorModalState({ isOpen: true, item: row, initialCategory: 'returnParty' })}
                                  className="p-2.5 text-center font-semibold text-indigo-300 bg-indigo-500/[0.05] border-r border-cyan-500/15 hover:bg-indigo-500/20 hover:underline cursor-pointer transition-colors print:bg-transparent print:text-black print:border-r print:border-black"
                                  title="Click to view Return From Party (R.Party) Colour Breakdown & Comment"
                                >
                                  {row.returnParty > 0 ? row.returnParty.toLocaleString('en-IN') : '-'}
                                </td>
                              )}
                              {stockColumns.totalStock && (
                                <td
                                  onClick={() => setStockColorModalState({ isOpen: true, item: row, initialCategory: 'all' })}
                                  className="p-2.5 text-center font-black text-white bg-white/[0.04] border-r border-cyan-500/15 hover:bg-white/[0.1] hover:underline cursor-pointer transition-colors print:bg-transparent print:text-black print:border-r print:border-black"
                                  title="Click to view Total Available Stock Colour Breakdown & Comment"
                                >
                                  {row.totalStock.toLocaleString('en-IN')}
                                </td>
                              )}
                              {stockColumns.sales && (
                                <td
                                  onClick={() => setStockColorModalState({ isOpen: true, item: row, initialCategory: 'sales' })}
                                  className="p-2.5 text-center font-bold text-emerald-300 bg-emerald-500/[0.05] border-r border-cyan-500/15 hover:bg-emerald-500/20 hover:underline cursor-pointer transition-colors print:bg-transparent print:text-black print:border-r print:border-black"
                                  title="Click to view Sales Quantity Colour Breakdown & Comment"
                                >
                                  {row.soldCoils > 0 ? row.soldCoils.toLocaleString('en-IN') : '-'}
                                </td>
                              )}
                              {stockColumns.rFactory && (
                                <td
                                  onClick={() => setStockColorModalState({ isOpen: true, item: row, initialCategory: 'returnFactory' })}
                                  className="p-2.5 text-center font-semibold text-rose-300 bg-rose-500/[0.05] border-r border-cyan-500/15 hover:bg-rose-500/20 hover:underline cursor-pointer transition-colors print:bg-transparent print:text-black print:border-r print:border-black"
                                  title="Click to view Return To Factory (Re.Fac.) Colour Breakdown & Comment"
                                >
                                  {row.returnFactory > 0 ? row.returnFactory.toLocaleString('en-IN') : '-'}
                                </td>
                              )}
                              {stockColumns.closing && (
                                <td
                                  onClick={() => setStockColorModalState({ isOpen: true, item: row, initialCategory: 'closing' })}
                                  className="p-2.5 text-center font-black border-r border-cyan-500/15 text-amber-300 bg-amber-500/[0.05] hover:bg-amber-500/20 hover:underline cursor-pointer transition-colors print:bg-transparent print:text-black print:border-r print:border-black"
                                  title="Click to view Closing Balance (Colour Have) Breakdown & Comment"
                                >
                                  <div className="flex items-center justify-center space-x-1">
                                    <span>{row.closingStock.toLocaleString('en-IN')}</span>
                                  </div>
                                </td>
                              )}
                              {stockColumns.reqNo && (
                                <td className="p-2.5 text-center font-mono font-bold text-cyan-300 bg-cyan-500/[0.05] border-r border-cyan-500/15 print:bg-transparent print:text-black print:border-r print:border-black">
                                  {row.reqNo}
                                </td>
                              )}
                              {stockColumns.stockValue && (
                                <td className="p-2.5 text-right font-black text-white print:text-black">
                                  ৳{row.stockValue.toLocaleString('en-IN')}
                                </td>
                              )}
                            </tr>
                          ))
                        )}

                        {/* Subtotal Row for Category - Hidden in print */}
                        <tr className="no-print print:hidden bg-[#0c2638] font-bold text-white border-t border-cyan-500/30">
                          {((stockColumns.sl ? 1 : 0) + (stockColumns.name ? 1 : 0)) > 0 ? (
                            <td colSpan={(stockColumns.sl ? 1 : 0) + (stockColumns.name ? 1 : 0)} className="p-2.5 text-right uppercase text-[11px] font-extrabold text-cyan-200">
                              Subtotal ({catGroup.categoryName}):
                            </td>
                          ) : null}
                          {stockColumns.opening && (
                            <td className="p-2.5 text-center font-bold text-sky-300 bg-sky-500/10 border-x border-cyan-500/20">
                              {catGroup.totals.opening.toLocaleString('en-IN')}
                            </td>
                          )}
                          {stockColumns.received && (
                            <td className="p-2.5 text-center font-bold text-teal-300 bg-teal-500/10 border-r border-cyan-500/20">
                              {catGroup.totals.added.toLocaleString('en-IN')}
                            </td>
                          )}
                          {stockColumns.rParty && (
                            <td className="p-2.5 text-center font-bold text-indigo-300 bg-indigo-500/10 border-r border-cyan-500/20">
                              {catGroup.totals.returnParty.toLocaleString('en-IN')}
                            </td>
                          )}
                          {stockColumns.totalStock && (
                            <td className="p-2.5 text-center font-black text-white bg-white/[0.06] border-r border-cyan-500/20">
                              {catGroup.totals.totalStock.toLocaleString('en-IN')}
                            </td>
                          )}
                          {stockColumns.sales && (
                            <td className="p-2.5 text-center font-black text-emerald-300 bg-emerald-500/10 border-r border-cyan-500/20">
                              {catGroup.totals.sold.toLocaleString('en-IN')}
                            </td>
                          )}
                          {stockColumns.rFactory && (
                            <td className="p-2.5 text-center font-bold text-rose-300 bg-rose-500/10 border-r border-cyan-500/20">
                              {catGroup.totals.returnFactory.toLocaleString('en-IN')}
                            </td>
                          )}
                          {stockColumns.closing && (
                            <td className="p-2.5 text-center font-black text-amber-300 bg-amber-500/10 border-r border-cyan-500/20">
                              {catGroup.totals.closing.toLocaleString('en-IN')}
                            </td>
                          )}
                          {stockColumns.reqNo && (
                            <td className="p-2.5 text-center font-mono text-cyan-300 bg-cyan-500/10 border-r border-cyan-500/20">
                              -
                            </td>
                          )}
                          {stockColumns.stockValue && (
                            <td className="p-2.5 text-right font-black text-white text-sm bg-white/[0.06]">
                              ৳{catGroup.totals.stockValue.toLocaleString('en-IN')}
                            </td>
                          )}
                        </tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Grand Warehouse Total Footer */}
          {categoryStockData.length > 0 && (
            <div className="cyber-glass-subcard text-white rounded-xl p-4 border border-cyan-500/30 flex flex-wrap items-center justify-between gap-4 font-mono print:bg-white print:text-black print:border-2 print:border-black print:rounded-none print:shadow-none print:mt-4 print:p-3">
              <div>
                <span className="text-cyan-300 print:text-black font-extrabold uppercase text-xs font-sans tracking-wider block">
                  ALL CATEGORIES GRAND TOTAL
                </span>
                <span className="text-xs text-slate-300 print:text-slate-700 font-sans">
                  Total warehouse stock calculated across all cable categories.
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-6 text-xs print:text-black">
                <div>Opening: <strong className="text-sky-300 print:text-black text-sm">{grandWarehouseTotals.opening.toLocaleString('en-IN')}</strong></div>
                <div>Received: <strong className="text-teal-300 print:text-black text-sm">{grandWarehouseTotals.added.toLocaleString('en-IN')}</strong></div>
                <div>Sales ({getPeriodLabel()}): <strong className="text-emerald-300 print:text-black text-sm">{grandWarehouseTotals.sold.toLocaleString('en-IN')} Coils</strong></div>
                <div>Closing Stock: <strong className="text-amber-300 print:text-black text-sm">{grandWarehouseTotals.closing.toLocaleString('en-IN')} Coils</strong></div>
                <div>Grand Stock Value: <strong className="text-emerald-300 print:text-black text-base">৳{grandWarehouseTotals.stockValue.toLocaleString('en-IN')}</strong></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. ITEM-WISE REPORT */}
      {/* ============================================================== */}
      {reportTab === 'item_wise' && (
        <div className="p-4 bg-transparent space-y-3">
          {/* Hidden Columns Banner Notice */}
          {activeColumnsConfig.visibleCount < activeColumnsConfig.totalCount && (
            <div className="no-print bg-amber-500/15 border border-amber-400/35 text-amber-200 rounded-xl p-2.5 px-4 flex flex-wrap items-center justify-between gap-2 text-xs shadow-2xs animate-in fade-in duration-200">
              <div className="flex items-center space-x-2">
                <EyeOff className="w-4 h-4 text-amber-300 shrink-0" />
                <span>
                  <strong>{activeColumnsConfig.totalCount - activeColumnsConfig.visibleCount} column(s) hidden in {activeColumnsConfig.tabName}</strong>: {' '}
                  <span className="text-amber-100/80 font-medium">
                    {activeColumnsConfig.columns.filter((c) => !activeColumnsConfig.state[c.key]).map((c) => c.label).join(', ')}
                  </span>
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowColumnPicker(true)}
                  className="text-cyan-300 font-bold hover:underline cursor-pointer text-xs"
                >
                  Manage Columns
                </button>
                <span className="text-amber-400/50">|</span>
                <button
                  type="button"
                  onClick={activeColumnsConfig.showAll}
                  className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-lg text-xs transition-colors cursor-pointer flex items-center space-x-1 shadow-2xs"
                >
                  <Eye className="w-3 h-3" />
                  <span>Show All Columns</span>
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto max-h-[550px] cyber-glass-card rounded-xl border border-cyan-500/25">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-[#0c2638] z-10 shadow-2xs">
                <tr className="text-cyan-200 font-bold border-b border-cyan-500/30 uppercase text-[10px]">
                  {itemColumns.sl && (
                    <th className="p-3 w-12 text-center group relative">
                      <div className="flex items-center justify-center space-x-1">
                        <span>#</span>
                        <button
                          type="button"
                          onClick={() => setItemColumns(prev => ({ ...prev, sl: !prev.sl }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-[#11334a] text-slate-400 hover:text-rose-300 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide SL column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {itemColumns.name && (
                    <th className="p-3 group relative">
                      <div className="flex items-center justify-between">
                        <span>Name Of Items</span>
                        <button
                          type="button"
                          onClick={() => setItemColumns(prev => ({ ...prev, name: !prev.name }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-[#11334a] text-slate-400 hover:text-rose-300 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Name column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {itemColumns.unit && (
                    <th className="p-3 w-20 text-center group relative">
                      <div className="flex items-center justify-center space-x-1">
                        <span>Unit</span>
                        <button
                          type="button"
                          onClick={() => setItemColumns(prev => ({ ...prev, unit: !prev.unit }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-[#11334a] text-slate-400 hover:text-rose-300 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Unit column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {itemColumns.rate && (
                    <th className="p-3 w-24 text-right group relative">
                      <div className="flex items-center justify-end space-x-1">
                        <span>Price/Unit</span>
                        <button
                          type="button"
                          onClick={() => setItemColumns(prev => ({ ...prev, rate: !prev.rate }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-[#11334a] text-slate-400 hover:text-rose-300 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Price column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {itemColumns.opening && (
                    <th className="p-3 w-28 text-center bg-sky-500/10 text-sky-200 border-x border-cyan-500/20 group relative">
                      <div className="flex items-center justify-center space-x-1">
                        <span>Opening Stock</span>
                        <button
                          type="button"
                          onClick={() => setItemColumns(prev => ({ ...prev, opening: !prev.opening }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-sky-500/20 text-sky-300 hover:text-rose-300 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Opening Stock column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {itemColumns.sold && (
                    <th className="p-3 w-32 text-center bg-emerald-500/10 text-emerald-200 border-r border-cyan-500/20 group relative">
                      <div className="flex items-center justify-center space-x-1">
                        <span>Sold ({getPeriodLabel()})</span>
                        <button
                          type="button"
                          onClick={() => setItemColumns(prev => ({ ...prev, sold: !prev.sold }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-emerald-500/20 text-emerald-300 hover:text-rose-300 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Sold column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {itemColumns.closing && (
                    <th className="p-3 w-32 text-center bg-amber-500/10 text-amber-200 border-r border-cyan-500/20 group relative">
                      <div className="flex items-center justify-center space-x-1">
                        <span>Closing Stock</span>
                        <button
                          type="button"
                          onClick={() => setItemColumns(prev => ({ ...prev, closing: !prev.closing }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-amber-500/20 text-amber-300 hover:text-rose-300 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Closing Stock column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {itemColumns.salesTk && (
                    <th className="p-3 w-32 text-right group relative">
                      <div className="flex items-center justify-end space-x-1">
                        <span>Total Sales (Tk)</span>
                        <button
                          type="button"
                          onClick={() => setItemColumns(prev => ({ ...prev, salesTk: !prev.salesTk }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-[#11334a] text-slate-400 hover:text-rose-300 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Total Sales column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60">
                {filteredItemReport.length === 0 ? (
                  <tr>
                    <td colSpan={activeColumnsConfig.visibleCount || 8} className="p-8 text-center text-slate-400 italic">
                      No matching items found for the selected period.
                    </td>
                  </tr>
                ) : search.trim() ? (
                  groupedFilteredItemReport.groups.map((grp) => (
                    <React.Fragment key={grp.category}>
                      <tr className="bg-[#0c2638] border-y border-cyan-500/30">
                        <td colSpan={activeColumnsConfig.visibleCount || 8} className="px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-cyan-300">
                          {grp.category} ({grp.items.length})
                        </td>
                      </tr>
                      {grp.items.map(({ item: row, flatIndex: index }) => (
                        <tr
                          key={row.id ? row.id + index : index}
                          onClick={() => setItemDayReportModal(row)}
                          className="hover:bg-cyan-500/[0.08] transition-colors cursor-pointer group"
                          title="Click to view Item Day Report (Daily Stock Ledger)"
                        >
                          {itemColumns.sl && (
                            <td className="p-3 text-center text-slate-400 font-mono">
                              {masterItemSerialMap.get(row.id) || (row.code ? masterItemSerialMap.get(row.code) : undefined) || (row.name ? masterItemSerialMap.get(row.name.trim().toLowerCase()) : undefined) || (index + 1)}
                            </td>
                          )}
                          {itemColumns.name && (
                            <td className="p-3 font-bold text-white group-hover:text-cyan-300">
                              <div className="flex items-center justify-between space-x-2">
                                <span>{row.name}</span>
                                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] bg-cyan-400 text-slate-950 font-black px-2 py-0.5 rounded shadow-xs flex items-center space-x-1">
                                  <CalendarDays className="w-3 h-3" />
                                  <span>Day Report</span>
                                </span>
                              </div>
                            </td>
                          )}
                          {itemColumns.unit && <td className="p-3 text-center text-slate-300">{row.unit}</td>}
                          {itemColumns.rate && (
                            <td className="p-3 text-right font-medium text-slate-200">
                              ৳{(row.rate ?? 0).toLocaleString('en-IN')}
                            </td>
                          )}
                          {itemColumns.opening && (
                            <td className="p-3 text-center font-bold text-sky-300 bg-sky-500/[0.05] border-x border-cyan-500/15">
                              {(row.openingStock ?? 0).toLocaleString('en-IN')}
                            </td>
                          )}
                          {itemColumns.sold && (
                            <td className="p-3 text-center font-black text-emerald-300 bg-emerald-500/[0.05] border-r border-cyan-500/15">
                              {row.soldCoils > 0 ? `${row.soldCoils.toLocaleString('en-IN')} Coils` : '-'}
                            </td>
                          )}
                          {itemColumns.closing && (
                            <td className="p-3 text-center font-black border-r border-cyan-500/15 text-amber-300 bg-amber-500/[0.05]">
                              <div className="flex items-center justify-center space-x-1">
                                <span>{row.closingStock.toLocaleString('en-IN')}</span>
                              </div>
                            </td>
                          )}
                          {itemColumns.salesTk && (
                            <td className="p-3 text-right font-black text-white">
                              {row.totalSalesAmount > 0 ? `৳${row.totalSalesAmount.toLocaleString('en-IN')}` : '৳0'}
                            </td>
                          )}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))
                ) : (
                  filteredItemReport.map((row, index) => {
                    return (
                      <tr
                        key={row.id ? row.id + index : index}
                        onClick={() => setItemDayReportModal(row)}
                        className="hover:bg-cyan-500/[0.08] transition-colors cursor-pointer group"
                        title="Click to view Item Day Report (Daily Stock Ledger)"
                      >
                        {itemColumns.sl && (
                          <td className="p-3 text-center text-slate-400 font-mono">
                            {masterItemSerialMap.get(row.id) || (row.code ? masterItemSerialMap.get(row.code) : undefined) || (row.name ? masterItemSerialMap.get(row.name.trim().toLowerCase()) : undefined) || (index + 1)}
                          </td>
                        )}
                        {itemColumns.name && (
                          <td className="p-3 font-bold text-white group-hover:text-cyan-300">
                            <div className="flex items-center justify-between space-x-2">
                              <span>{row.name}</span>
                              <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] bg-cyan-400 text-slate-950 font-black px-2 py-0.5 rounded shadow-xs flex items-center space-x-1">
                                <CalendarDays className="w-3 h-3" />
                                <span>Day Report</span>
                              </span>
                            </div>
                          </td>
                        )}
                        {itemColumns.unit && <td className="p-3 text-center text-slate-300">{row.unit}</td>}
                        {itemColumns.rate && (
                          <td className="p-3 text-right font-medium text-slate-200">
                            ৳{(row.rate ?? 0).toLocaleString('en-IN')}
                          </td>
                        )}
                        {itemColumns.opening && (
                          <td className="p-3 text-center font-bold text-sky-300 bg-sky-500/[0.05] border-x border-cyan-500/15">
                            {(row.openingStock ?? 0).toLocaleString('en-IN')}
                          </td>
                        )}
                        {itemColumns.sold && (
                          <td className="p-3 text-center font-black text-emerald-300 bg-emerald-500/[0.05] border-r border-cyan-500/15">
                            {row.soldCoils > 0 ? `${row.soldCoils.toLocaleString('en-IN')} Coils` : '-'}
                          </td>
                        )}
                        {itemColumns.closing && (
                          <td className="p-3 text-center font-black border-r border-cyan-500/15 text-amber-300 bg-amber-500/[0.05]">
                            <div className="flex items-center justify-center space-x-1">
                              <span>{row.closingStock.toLocaleString('en-IN')}</span>
                            </div>
                          </td>
                        )}
                        {itemColumns.salesTk && (
                          <td className="p-3 text-right font-black text-white">
                            {row.totalSalesAmount > 0 ? `৳${row.totalSalesAmount.toLocaleString('en-IN')}` : '৳0'}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. DAY-WISE REPORT */}
      {/* ============================================================== */}
      {reportTab === 'day_wise' && (
        <div className="p-4 bg-[#071824]/40 space-y-3">
          {/* Hidden Columns Banner Notice */}
          {activeColumnsConfig.visibleCount < activeColumnsConfig.totalCount && (
            <div className="no-print bg-amber-500/15 border border-amber-400/35 text-amber-200 rounded-xl p-2.5 px-4 flex flex-wrap items-center justify-between gap-2 text-xs shadow-2xs animate-in fade-in duration-200">
              <div className="flex items-center space-x-2">
                <EyeOff className="w-4 h-4 text-amber-300 shrink-0" />
                <span>
                  <strong>{activeColumnsConfig.totalCount - activeColumnsConfig.visibleCount} column(s) hidden in {activeColumnsConfig.tabName}</strong>: {' '}
                  <span className="text-slate-300 font-medium">
                    {activeColumnsConfig.columns.filter((c) => !activeColumnsConfig.state[c.key]).map((c) => c.label).join(', ')}
                  </span>
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowColumnPicker(true)}
                  className="text-amber-300 font-bold hover:underline cursor-pointer text-xs"
                >
                  Manage Columns
                </button>
                <span className="text-amber-400/50">|</span>
                <button
                  type="button"
                  onClick={activeColumnsConfig.showAll}
                  className="px-2.5 py-1 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black rounded-lg text-xs transition-colors cursor-pointer flex items-center space-x-1 shadow-2xs"
                >
                  <Eye className="w-3 h-3" />
                  <span>Show All Columns</span>
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto max-h-[550px] bg-[#071824]/60 rounded-xl shadow-xs border border-cyan-500/20">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-[#0c2638] z-10 shadow-2xs">
                <tr className="text-cyan-200 font-bold border-b border-cyan-500/30 uppercase text-[10px]">
                  {dayColumns.sl && (
                    <th className="p-3 w-12 text-center group relative">
                      <div className="flex items-center justify-center space-x-1">
                        <span>#</span>
                        <button
                          type="button"
                          onClick={() => setDayColumns(prev => ({ ...prev, sl: !prev.sl }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-white/10 text-slate-400 hover:text-rose-400 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide SL column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {dayColumns.date && (
                    <th className="p-3 w-32 font-bold group relative">
                      <div className="flex items-center justify-between">
                        <span>Date</span>
                        <button
                          type="button"
                          onClick={() => setDayColumns(prev => ({ ...prev, date: !prev.date }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-white/10 text-slate-400 hover:text-rose-400 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Date column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {dayColumns.billCount && (
                    <th className="p-3 w-28 text-center bg-sky-500/15 text-sky-200 border-x border-cyan-500/25 group relative">
                      <div className="flex items-center justify-center space-x-1">
                        <span>Bills Issued</span>
                        <button
                          type="button"
                          onClick={() => setDayColumns(prev => ({ ...prev, billCount: !prev.billCount }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-white/10 text-sky-300 hover:text-rose-400 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Bills Issued column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {dayColumns.totalCoils && (
                    <th className="p-3 w-36 text-center bg-emerald-500/15 text-emerald-200 border-r border-cyan-500/25 group relative">
                      <div className="flex items-center justify-center space-x-1">
                        <span>Total Coils Sold</span>
                        <button
                          type="button"
                          onClick={() => setDayColumns(prev => ({ ...prev, totalCoils: !prev.totalCoils }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-white/10 text-emerald-300 hover:text-rose-400 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Total Coils column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {dayColumns.parties && (
                    <th className="p-3 min-w-[200px] group relative">
                      <div className="flex items-center justify-between">
                        <span>Parties Served</span>
                        <button
                          type="button"
                          onClick={() => setDayColumns(prev => ({ ...prev, parties: !prev.parties }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-white/10 text-slate-400 hover:text-rose-400 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Parties Served column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {dayColumns.salesmen && (
                    <th className="p-3 w-36 group relative">
                      <div className="flex items-center justify-between">
                        <span>Salesmen Code</span>
                        <button
                          type="button"
                          onClick={() => setDayColumns(prev => ({ ...prev, salesmen: !prev.salesmen }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-white/10 text-slate-400 hover:text-rose-400 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Salesmen Code column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {dayColumns.revenue && (
                    <th className="p-3 w-36 text-right font-black group relative">
                      <div className="flex items-center justify-end space-x-1">
                        <span>Total Revenue (Tk)</span>
                        <button
                          type="button"
                          onClick={() => setDayColumns(prev => ({ ...prev, revenue: !prev.revenue }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-white/10 text-slate-400 hover:text-rose-400 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Total Revenue column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                {filteredDayReport.length === 0 ? (
                  <tr>
                    <td colSpan={activeColumnsConfig.visibleCount || 7} className="p-8 text-center text-slate-400">
                      No sales recorded for the selected date period.
                    </td>
                  </tr>
                ) : (
                  filteredDayReport.map((row, index) => (
                    <tr key={`${row.date}-${index}`} className="hover:bg-cyan-500/[0.06] transition-colors">
                      {dayColumns.sl && <td className="p-3 text-center text-slate-400 font-mono">{index + 1}</td>}
                      {dayColumns.date && (
                        <td className="p-3 font-mono font-bold text-white text-sm">
                          <div className="flex items-center space-x-1.5">
                            <CalendarDays className="w-4 h-4 text-cyan-400" />
                            <span>{formatDateDDMMYY(row.date)}</span>
                          </div>
                        </td>
                      )}
                      {dayColumns.billCount && (
                        <td className="p-3 text-center font-bold text-sky-300 bg-sky-500/10 border-x border-cyan-500/15">
                          {row.billCount} Bills
                        </td>
                      )}
                      {dayColumns.totalCoils && (
                        <td className="p-3 text-center font-black text-emerald-300 bg-emerald-500/10 border-r border-cyan-500/15">
                          {row.totalCoils.toLocaleString('en-IN')} Coils
                        </td>
                      )}
                      {dayColumns.parties && (
                        <td className="p-3 text-slate-200 font-medium">
                          {row.partiesList || 'General Customer'}
                        </td>
                      )}
                      {dayColumns.salesmen && (
                        <td className="p-3 font-mono font-bold text-cyan-300">
                          {row.salesmenList || '-'}
                        </td>
                      )}
                      {dayColumns.revenue && (
                        <td className="p-3 text-right font-black text-white text-sm">
                          ৳{row.totalRevenue.toLocaleString('en-IN')}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 4. PARTY-WISE REPORT */}
      {/* ============================================================== */}
      {reportTab === 'party_wise' && (
        <div className="p-4 bg-[#071824]/40 space-y-3">
          {/* Hidden Columns Banner Notice */}
          {activeColumnsConfig.visibleCount < activeColumnsConfig.totalCount && (
            <div className="no-print bg-amber-500/15 border border-amber-400/35 text-amber-200 rounded-xl p-2.5 px-4 flex flex-wrap items-center justify-between gap-2 text-xs shadow-2xs animate-in fade-in duration-200">
              <div className="flex items-center space-x-2">
                <EyeOff className="w-4 h-4 text-amber-300 shrink-0" />
                <span>
                  <strong>{activeColumnsConfig.totalCount - activeColumnsConfig.visibleCount} column(s) hidden in {activeColumnsConfig.tabName}</strong>: {' '}
                  <span className="text-slate-300 font-medium">
                    {activeColumnsConfig.columns.filter((c) => !activeColumnsConfig.state[c.key]).map((c) => c.label).join(', ')}
                  </span>
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowColumnPicker(true)}
                  className="text-amber-300 font-bold hover:underline cursor-pointer text-xs"
                >
                  Manage Columns
                </button>
                <span className="text-amber-400/50">|</span>
                <button
                  type="button"
                  onClick={activeColumnsConfig.showAll}
                  className="px-2.5 py-1 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black rounded-lg text-xs transition-colors cursor-pointer flex items-center space-x-1 shadow-2xs"
                >
                  <Eye className="w-3 h-3" />
                  <span>Show All Columns</span>
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto max-h-[550px] bg-[#071824]/60 rounded-xl shadow-xs border border-cyan-500/20">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-[#0c2638] z-10 shadow-2xs">
                <tr className="text-cyan-200 font-bold border-b border-cyan-500/30 uppercase text-[10px]">
                  {partyColumns.sl && (
                    <th className="p-3 w-12 text-center group relative">
                      <div className="flex items-center justify-center space-x-1">
                        <span>#</span>
                        <button
                          type="button"
                          onClick={() => setPartyColumns(prev => ({ ...prev, sl: !prev.sl }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-white/10 text-slate-400 hover:text-rose-400 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide SL column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {partyColumns.partyName && (
                    <th className="p-3 min-w-[180px] group relative">
                      <div className="flex items-center justify-between">
                        <span>Party Name</span>
                        <button
                          type="button"
                          onClick={() => setPartyColumns(prev => ({ ...prev, partyName: !prev.partyName }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-white/10 text-slate-400 hover:text-rose-400 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Party Name column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {partyColumns.address && (
                    <th className="p-3 min-w-[160px] group relative">
                      <div className="flex items-center justify-between">
                        <span>Address / Location</span>
                        <button
                          type="button"
                          onClick={() => setPartyColumns(prev => ({ ...prev, address: !prev.address }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-white/10 text-slate-400 hover:text-rose-400 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Address column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {partyColumns.salesmanCode && (
                    <th className="p-3 w-32 text-center group relative">
                      <div className="flex items-center justify-center space-x-1">
                        <span>Salesman Code</span>
                        <button
                          type="button"
                          onClick={() => setPartyColumns(prev => ({ ...prev, salesmanCode: !prev.salesmanCode }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-white/10 text-slate-400 hover:text-rose-400 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Salesman Code column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {partyColumns.billCount && (
                    <th className="p-3 w-28 text-center bg-sky-500/15 text-sky-200 border-x border-cyan-500/25 group relative">
                      <div className="flex items-center justify-center space-x-1">
                        <span>Total Bills</span>
                        <button
                          type="button"
                          onClick={() => setPartyColumns(prev => ({ ...prev, billCount: !prev.billCount }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-white/10 text-sky-300 hover:text-rose-400 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Total Bills column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {partyColumns.coils && (
                    <th className="p-3 w-32 text-center bg-emerald-500/15 text-emerald-200 border-r border-cyan-500/25 group relative">
                      <div className="flex items-center justify-center space-x-1">
                        <span>Coils Bought</span>
                        <button
                          type="button"
                          onClick={() => setPartyColumns(prev => ({ ...prev, coils: !prev.coils }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-white/10 text-emerald-300 hover:text-rose-400 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Coils Bought column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {partyColumns.revenue && (
                    <th className="p-3 w-36 text-right font-black group relative">
                      <div className="flex items-center justify-end space-x-1">
                        <span>Total Purchases (Tk)</span>
                        <button
                          type="button"
                          onClick={() => setPartyColumns(prev => ({ ...prev, revenue: !prev.revenue }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-white/10 text-slate-400 hover:text-rose-400 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Total Purchases column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                {filteredPartyReport.length === 0 ? (
                  <tr>
                    <td colSpan={activeColumnsConfig.visibleCount || 7} className="p-8 text-center text-slate-400">
                      No party purchases found for selected criteria.
                    </td>
                  </tr>
                ) : (
                  filteredPartyReport.map((row, index) => (
                    <tr key={`${row.partyName}-${index}`} className="hover:bg-cyan-500/[0.06] transition-colors">
                      {partyColumns.sl && <td className="p-3 text-center text-slate-400 font-mono">{index + 1}</td>}
                      {partyColumns.partyName && (
                        <td className="p-3 font-bold text-white text-sm">
                          <div className="flex items-center space-x-1.5">
                            <Building2 className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                            <span>{row.partyName}</span>
                          </div>
                        </td>
                      )}
                      {partyColumns.address && <td className="p-3 text-slate-300">{row.address || '-'}</td>}
                      {partyColumns.salesmanCode && (
                        <td className="p-3 text-center font-mono font-bold text-cyan-300">
                          {row.salesmanCode ? (
                            <span className="bg-cyan-500/15 text-cyan-200 px-2 py-0.5 rounded border border-cyan-400/30 text-xs">
                              {row.salesmanCode}
                            </span>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                      )}
                      {partyColumns.billCount && (
                        <td className="p-3 text-center font-bold text-sky-300 bg-sky-500/10 border-x border-cyan-500/15">
                          {row.billCount}
                        </td>
                      )}
                      {partyColumns.coils && (
                        <td className="p-3 text-center font-black text-emerald-300 bg-emerald-500/10 border-r border-cyan-500/15">
                          {row.totalCoils.toLocaleString('en-IN')} Coils
                        </td>
                      )}
                      {partyColumns.revenue && (
                        <td className="p-3 text-right font-black text-white text-sm">
                          ৳{row.totalRevenue.toLocaleString('en-IN')}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 5. SALESMAN-WISE REPORT */}
      {/* ============================================================== */}
      {reportTab === 'salesman_wise' && (
        <div className="p-4 bg-[#071824]/40 space-y-3">
          {/* Hidden Columns Banner Notice */}
          {activeColumnsConfig.visibleCount < activeColumnsConfig.totalCount && (
            <div className="no-print bg-amber-500/15 border border-amber-400/35 text-amber-200 rounded-xl p-2.5 px-4 flex flex-wrap items-center justify-between gap-2 text-xs shadow-2xs animate-in fade-in duration-200">
              <div className="flex items-center space-x-2">
                <EyeOff className="w-4 h-4 text-amber-300 shrink-0" />
                <span>
                  <strong>{activeColumnsConfig.totalCount - activeColumnsConfig.visibleCount} column(s) hidden in {activeColumnsConfig.tabName}</strong>: {' '}
                  <span className="text-slate-300 font-medium">
                    {activeColumnsConfig.columns.filter((c) => !activeColumnsConfig.state[c.key]).map((c) => c.label).join(', ')}
                  </span>
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowColumnPicker(true)}
                  className="text-amber-300 font-bold hover:underline cursor-pointer text-xs"
                >
                  Manage Columns
                </button>
                <span className="text-amber-400/50">|</span>
                <button
                  type="button"
                  onClick={activeColumnsConfig.showAll}
                  className="px-2.5 py-1 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black rounded-lg text-xs transition-colors cursor-pointer flex items-center space-x-1 shadow-2xs"
                >
                  <Eye className="w-3 h-3" />
                  <span>Show All Columns</span>
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto max-h-[550px] bg-[#071824]/60 rounded-xl shadow-xs border border-cyan-500/20">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-[#0c2638] z-10 shadow-2xs">
                <tr className="text-cyan-200 font-bold border-b border-cyan-500/30 uppercase text-[10px]">
                  {salesmanColumns.sl && (
                    <th className="p-3 w-12 text-center group relative">
                      <div className="flex items-center justify-center space-x-1">
                        <span>#</span>
                        <button
                          type="button"
                          onClick={() => setSalesmanColumns(prev => ({ ...prev, sl: !prev.sl }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-white/10 text-slate-400 hover:text-rose-400 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide SL column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {salesmanColumns.code && (
                    <th className="p-3 w-28 font-mono text-center group relative">
                      <div className="flex items-center justify-center space-x-1">
                        <span>Code</span>
                        <button
                          type="button"
                          onClick={() => setSalesmanColumns(prev => ({ ...prev, code: !prev.code }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-white/10 text-slate-400 hover:text-rose-400 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Code column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {salesmanColumns.name && (
                    <th className="p-3 min-w-[180px] group relative">
                      <div className="flex items-center justify-between">
                        <span>Sales Executive Name</span>
                        <button
                          type="button"
                          onClick={() => setSalesmanColumns(prev => ({ ...prev, name: !prev.name }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-white/10 text-slate-400 hover:text-rose-400 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Name column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {salesmanColumns.area && (
                    <th className="p-3 w-36 group relative">
                      <div className="flex items-center justify-between">
                        <span>Territory / Area</span>
                        <button
                          type="button"
                          onClick={() => setSalesmanColumns(prev => ({ ...prev, area: !prev.area }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-white/10 text-slate-400 hover:text-rose-400 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Territory column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {salesmanColumns.billCount && (
                    <th className="p-3 w-28 text-center bg-sky-500/15 text-sky-200 border-x border-cyan-500/25 group relative">
                      <div className="flex items-center justify-center space-x-1">
                        <span>Total Bills</span>
                        <button
                          type="button"
                          onClick={() => setSalesmanColumns(prev => ({ ...prev, billCount: !prev.billCount }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-white/10 text-sky-300 hover:text-rose-400 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Total Bills column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {salesmanColumns.totalCoils && (
                    <th className="p-3 w-32 text-center bg-emerald-500/15 text-emerald-200 border-r border-cyan-500/25 group relative">
                      <div className="flex items-center justify-center space-x-1">
                        <span>Total Coils Sold</span>
                        <button
                          type="button"
                          onClick={() => setSalesmanColumns(prev => ({ ...prev, totalCoils: !prev.totalCoils }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-white/10 text-emerald-300 hover:text-rose-400 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Total Coils column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {salesmanColumns.parties && (
                    <th className="p-3 min-w-[160px] text-center group relative">
                      <div className="flex items-center justify-center space-x-1">
                        <span>Parties Served</span>
                        <button
                          type="button"
                          onClick={() => setSalesmanColumns(prev => ({ ...prev, parties: !prev.parties }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-white/10 text-slate-400 hover:text-rose-400 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Parties Served column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                  {salesmanColumns.revenue && (
                    <th className="p-3 w-36 text-right font-black group relative">
                      <div className="flex items-center justify-end space-x-1">
                        <span>Total Revenue (Tk)</span>
                        <button
                          type="button"
                          onClick={() => setSalesmanColumns(prev => ({ ...prev, revenue: !prev.revenue }))}
                          className="opacity-0 group-hover:opacity-100 hover:bg-white/10 text-slate-400 hover:text-rose-400 rounded p-0.5 transition-opacity no-print cursor-pointer"
                          title="Hide Revenue column"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                {filteredSalesmanReport.length === 0 ? (
                  <tr>
                    <td colSpan={activeColumnsConfig.visibleCount || 8} className="p-8 text-center text-slate-400">
                      No salesman records found for selected criteria.
                    </td>
                  </tr>
                ) : (
                  filteredSalesmanReport.map((row, index) => (
                    <tr key={row.code} className="hover:bg-cyan-500/[0.06] transition-colors">
                      {salesmanColumns.sl && <td className="p-3 text-center text-slate-400 font-mono">{index + 1}</td>}
                      {salesmanColumns.code && (
                        <td className="p-3 text-center font-mono font-extrabold text-cyan-300 bg-sky-500/10">
                          {row.code}
                        </td>
                      )}
                      {salesmanColumns.name && (
                        <td className="p-3 font-bold text-white text-sm">
                          <div className="flex items-center space-x-1.5">
                            <UserCheck className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                            <span>{row.name}</span>
                          </div>
                        </td>
                      )}
                      {salesmanColumns.area && <td className="p-3 text-slate-300 font-medium">{row.areaGroup}</td>}
                      {salesmanColumns.billCount && (
                        <td className="p-3 text-center font-bold text-sky-300 bg-sky-500/10 border-x border-cyan-500/15">
                          {row.billCount}
                        </td>
                      )}
                      {salesmanColumns.totalCoils && (
                        <td className="p-3 text-center font-black text-emerald-300 bg-emerald-500/10 border-r border-cyan-500/15">
                          {row.totalCoils.toLocaleString('en-IN')} Coils
                        </td>
                      )}
                      {salesmanColumns.parties && (
                        <td className="p-3 text-center font-semibold text-slate-300">
                          {row.partiesSet.size} Parties ({Array.from(row.partiesSet).slice(0, 2).join(', ')}{row.partiesSet.size > 2 ? '...' : ''})
                        </td>
                      )}
                      {salesmanColumns.revenue && (
                        <td className="p-3 text-right font-black text-white text-sm">
                          ৳{row.totalRevenue.toLocaleString('en-IN')}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* Bottom Action Footer Bar */}
      <div className="no-print cyber-glass-header px-4 py-3 border-t border-cyan-500/25 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleRecalculateStock}
          disabled={isRecalculating}
          className="bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 text-xs px-3 py-2 rounded-xl font-bold flex items-center space-x-1.5 border border-cyan-500/25 cursor-pointer shadow-xs transition-colors"
          title="Recalculate stock movements, inward, outward, and closing quantities"
        >
          <RefreshCw className={`w-4 h-4 text-cyan-300 ${isRecalculating ? 'animate-spin' : ''}`} />
          <span>{isRecalculating ? 'Recalculating...' : 'Recalculate Stock'}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowReportEmailModal(true)}
          className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs px-3 py-2 rounded-xl font-bold flex items-center space-x-1.5 border border-emerald-400/35 cursor-pointer shadow-xs transition-colors"
          title="Send this Sales & Stock Report via Email directly from browser"
        >
          <Mail className="w-4 h-4 text-emerald-300" />
          <span>Send Mail</span>
        </button>
        <button
          onClick={() => setShowPrintPreviewModal(true)}
          className="bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs px-3.5 py-2 rounded-xl font-black flex items-center space-x-1.5 border border-cyan-300 cursor-pointer shadow-xs transition-colors"
          title="Preview and print report statement"
        >
          <Printer className="w-4 h-4 text-slate-950" />
          <span>Print Report</span>
        </button>
      </div>
      </div>

      {/* PRINT PREVIEW MODAL */}
      {showPrintPreviewModal && (
        <div className="print-preview-modal-backdrop fixed inset-0 bg-[#030d14]/85 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
          <div className="print-preview-modal-dialog bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden text-white">
            {/* Modal Header Toolbar */}
            <div className="cyber-glass-header px-4 py-2.5 border-b border-cyan-500/25 flex flex-wrap items-center justify-between gap-2 no-print">
              <div className="flex items-center space-x-2">
                <Printer className="w-5 h-5 text-cyan-400" />
                <span className="font-bold text-sm text-white">
                  Print Preview —{' '}
                  {reportTab === 'stock_category_wise'
                    ? 'Stock Serial Report (Category Wise)'
                    : reportTab === 'item_wise'
                    ? 'Item-Wise Sales & Stock Report'
                    : reportTab === 'day_wise'
                    ? 'Day-Wise Sales Statement'
                    : reportTab === 'party_wise'
                    ? 'Party-Wise Sales Report'
                    : 'Salesman-Wise Performance Report'}
                </span>
                <span className="bg-cyan-500/15 text-cyan-200 text-[10px] font-mono px-2 py-0.5 rounded border border-cyan-400/30">
                  A4 Landscape
                </span>
              </div>

              <div className="flex items-center space-x-2">
                {/* Zoom Level Selector */}
                <div className="flex items-center bg-[#061520] border border-cyan-500/30 rounded-lg p-0.5 text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => setPreviewZoom('80%')}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      previewZoom === '80%' ? 'bg-cyan-400 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    80%
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewZoom('100%')}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      previewZoom === '100%' ? 'bg-cyan-400 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    100%
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewZoom('115%')}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      previewZoom === '115%' ? 'bg-cyan-400 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    115%
                  </button>
                </div>

                {/* Print Now Button */}
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black px-4 py-1.5 rounded-lg text-xs flex items-center space-x-1.5 shadow-md transition-all cursor-pointer hover:scale-105"
                  title="Trigger system print dialog"
                >
                  <Printer className="w-4 h-4 text-slate-950" />
                  <span>Print Now (Ctrl+P)</span>
                </button>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setShowPrintPreviewModal(false)}
                  className="bg-[#081b28] hover:bg-rose-600/80 text-white border border-cyan-500/25 p-1.5 rounded-lg transition-colors cursor-pointer ml-1"
                  title="Close Print Preview"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body / Printable Paper Sheet Canvas */}
            <div className="print-preview-canvas-container p-3 sm:p-6 overflow-auto bg-[#04111a]/95 flex-1 flex justify-start sm:justify-center items-start min-h-0">
              <div
                className="transition-transform duration-200 origin-top-left sm:origin-top flex justify-start sm:justify-center w-max sm:w-full"
                style={{
                  transform: previewZoom === '80%' ? 'scale(0.8)' : previewZoom === '115%' ? 'scale(1.15)' : 'none',
                  marginBottom: previewZoom === '115%' ? '140px' : '40px'
                }}
              >
                <div className="print-paper-sheet bg-white text-black shadow-2xl border border-slate-300 rounded-sm font-sans p-6 sm:p-8 w-full max-w-[1100px] min-w-[880px]">
                  {/* Official Paper Header */}
                  <div className="text-center pb-3 border-b-2 border-black mb-3">
                    <h1 className="text-2xl font-black uppercase tracking-wider text-black">Poly Cables</h1>
                    <p className="text-xs font-bold text-slate-700 uppercase mt-0.5">{displaySalesCenterTitle}</p>
                    <p className="text-sm font-black uppercase text-slate-900 mt-1 underline underline-offset-4">
                      {reportTab === 'stock_category_wise'
                        ? 'Stock Serial Report (Category Wise)'
                        : reportTab === 'item_wise'
                        ? 'Item-Wise Sales & Stock Statement'
                        : reportTab === 'day_wise'
                        ? 'Day-Wise Sales Statement'
                        : reportTab === 'party_wise'
                        ? 'Party-Wise Sales Summary'
                        : 'Salesman-Wise Performance Report'}
                    </p>
                    <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-700 mt-2 px-1">
                      <span>
                        <strong>Period:</strong> {getPeriodLabel()}
                      </span>
                      <span>
                        <strong>Bill Type:</strong> {billTypeFilter !== 'all' ? (billTypeFilter === 'showroom' ? 'SALES CENTER' : billTypeFilter.toUpperCase()) : 'ALL SALES (SALES CENTER + OFFICE)'}
                      </span>
                      <span>
                        <strong>Date:</strong> {new Date().toLocaleDateString('en-GB')}
                      </span>
                    </div>
                  </div>

                  {/* Report Table by Tab */}
                  {reportTab === 'stock_category_wise' && (
                    <div className="w-full overflow-x-auto print:overflow-visible space-y-3">
                      <table className="w-full text-left text-[11px] border-collapse border border-black">
                        <thead>
                          <tr className="bg-slate-200 text-black font-extrabold uppercase text-[10px] border-b-2 border-black whitespace-nowrap">
                            {stockColumns.sl && <th className="p-1.5 w-8 text-center border-r border-black whitespace-nowrap">SL #</th>}
                            {stockColumns.name && <th className="p-1.5 min-w-[200px] border-r border-black whitespace-nowrap">Items Name</th>}
                            {stockColumns.opening && <th className="p-1.5 w-16 text-center border-r border-black whitespace-nowrap">Op. Qty.</th>}
                            {stockColumns.received && <th className="p-1.5 w-14 text-center border-r border-black whitespace-nowrap">Received</th>}
                            {stockColumns.rParty && <th className="p-1.5 w-14 text-center border-r border-black whitespace-nowrap">R.Party</th>}
                            {stockColumns.totalStock && <th className="p-1.5 w-16 text-center border-r border-black whitespace-nowrap">Total</th>}
                            {stockColumns.sales && <th className="p-1.5 w-14 text-center border-r border-black whitespace-nowrap">Sales</th>}
                            {stockColumns.rFactory && <th className="p-1.5 w-14 text-center border-r border-black whitespace-nowrap">Re. Fac.</th>}
                            {stockColumns.closing && <th className="p-1.5 w-18 text-center border-r border-black whitespace-nowrap">Closing Qty</th>}
                            {stockColumns.reqNo && <th className="p-1.5 w-14 text-center border-r border-black whitespace-nowrap">Req No.</th>}
                            {stockColumns.stockValue && <th className="p-1.5 w-24 text-right whitespace-nowrap">Stock Value</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-300">
                          {categoryStockData.map((catGroup) => (
                            <React.Fragment key={catGroup.categoryName}>
                              <tr className="bg-slate-100 font-extrabold text-black border-y border-black">
                                <td colSpan={visibleStockColCount} className="p-1 px-3 uppercase text-[10px] tracking-wider text-center font-black">
                                  {catGroup.categoryName}
                                </td>
                              </tr>
                              {catGroup.items.map((row) => (
                                <tr key={row.code + row.serialNo} className="hover:bg-slate-50 border-b border-slate-200">
                                  {stockColumns.sl && <td className="p-1 text-center font-mono border-r border-slate-300 whitespace-nowrap">{row.serialNo}</td>}
                                  {stockColumns.name && <td className="p-1 font-bold border-r border-slate-300 whitespace-nowrap min-w-[200px]">{row.name}</td>}
                                  {stockColumns.opening && <td className="p-1 text-center border-r border-slate-300 whitespace-nowrap">{(row.openingStock || 0).toLocaleString('en-IN')}</td>}
                                  {stockColumns.received && <td className="p-1 text-center border-r border-slate-300 whitespace-nowrap">{row.addedStock > 0 ? (row.addedStock || 0).toLocaleString('en-IN') : '-'}</td>}
                                  {stockColumns.rParty && <td className="p-1 text-center border-r border-slate-300 whitespace-nowrap">{row.returnParty > 0 ? (row.returnParty || 0).toLocaleString('en-IN') : '-'}</td>}
                                  {stockColumns.totalStock && <td className="p-1 text-center font-bold border-r border-slate-300 whitespace-nowrap">{(row.totalStock || 0).toLocaleString('en-IN')}</td>}
                                  {stockColumns.sales && <td className="p-1 text-center border-r border-slate-300 whitespace-nowrap">{row.soldCoils > 0 ? (row.soldCoils || 0).toLocaleString('en-IN') : '-'}</td>}
                                  {stockColumns.rFactory && <td className="p-1 text-center border-r border-slate-300 whitespace-nowrap">{row.returnFactory > 0 ? (row.returnFactory || 0).toLocaleString('en-IN') : '-'}</td>}
                                  {stockColumns.closing && <td className="p-1 text-center font-black border-r border-slate-300 whitespace-nowrap">{(row.closingStock || 0).toLocaleString('en-IN')}</td>}
                                  {stockColumns.reqNo && <td className="p-1 text-center font-mono border-r border-slate-300 whitespace-nowrap">{row.reqNo}</td>}
                                  {stockColumns.stockValue && <td className="p-1 text-right font-mono font-bold whitespace-nowrap">৳{(row.stockValue || 0).toLocaleString('en-IN')}</td>}
                                </tr>
                              ))}
                              <tr className="bg-slate-100 font-bold border-b-2 border-black text-[10px]">
                                {((stockColumns.sl ? 1 : 0) + (stockColumns.name ? 1 : 0)) > 0 ? (
                                  <td colSpan={(stockColumns.sl ? 1 : 0) + (stockColumns.name ? 1 : 0)} className="p-1 text-right uppercase whitespace-nowrap">
                                    Subtotal ({catGroup.categoryName}):
                                  </td>
                                ) : null}
                                {stockColumns.opening && <td className="p-1 text-center border-r border-slate-300 whitespace-nowrap">{(catGroup.totals.opening || 0).toLocaleString('en-IN')}</td>}
                                {stockColumns.received && <td className="p-1 text-center border-r border-slate-300 whitespace-nowrap">{(catGroup.totals.added || 0).toLocaleString('en-IN')}</td>}
                                {stockColumns.rParty && <td className="p-1 text-center border-r border-slate-300 whitespace-nowrap">{(catGroup.totals.returnParty || 0).toLocaleString('en-IN')}</td>}
                                {stockColumns.totalStock && <td className="p-1 text-center border-r border-slate-300 whitespace-nowrap">{(catGroup.totals.totalStock || 0).toLocaleString('en-IN')}</td>}
                                {stockColumns.sales && <td className="p-1 text-center border-r border-slate-300 whitespace-nowrap">{(catGroup.totals.sold || 0).toLocaleString('en-IN')}</td>}
                                {stockColumns.rFactory && <td className="p-1 text-center border-r border-slate-300 whitespace-nowrap">{(catGroup.totals.returnFactory || 0).toLocaleString('en-IN')}</td>}
                                {stockColumns.closing && <td className="p-1 text-center font-black border-r border-slate-300 whitespace-nowrap">{(catGroup.totals.closing || 0).toLocaleString('en-IN')}</td>}
                                {stockColumns.reqNo && <td className="p-1 text-center border-r border-slate-300 whitespace-nowrap">-</td>}
                                {stockColumns.stockValue && <td className="p-1 text-right font-mono font-black whitespace-nowrap">৳{(catGroup.totals.stockValue || 0).toLocaleString('en-IN')}</td>}
                              </tr>
                            </React.Fragment>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-200 text-black font-black border-t-2 border-black text-[11px]">
                            {((stockColumns.sl ? 1 : 0) + (stockColumns.name ? 1 : 0)) > 0 ? (
                              <td colSpan={(stockColumns.sl ? 1 : 0) + (stockColumns.name ? 1 : 0)} className="p-1.5 text-right uppercase whitespace-nowrap">
                                GRAND WAREHOUSE TOTAL:
                              </td>
                            ) : null}
                            {stockColumns.opening && <td className="p-1.5 text-center border-r border-black">{(grandWarehouseTotals.opening || 0).toLocaleString('en-IN')}</td>}
                            {stockColumns.received && <td className="p-1.5 text-center border-r border-black">{(grandWarehouseTotals.added || 0).toLocaleString('en-IN')}</td>}
                            {stockColumns.rParty && <td className="p-1.5 text-center border-r border-black">{(grandWarehouseTotals.returnParty || 0).toLocaleString('en-IN')}</td>}
                            {stockColumns.totalStock && <td className="p-1.5 text-center border-r border-black">{(grandWarehouseTotals.totalStock || 0).toLocaleString('en-IN')}</td>}
                            {stockColumns.sales && <td className="p-1.5 text-center border-r border-black">{(grandWarehouseTotals.sold || 0).toLocaleString('en-IN')}</td>}
                            {stockColumns.rFactory && <td className="p-1.5 text-center border-r border-black">{(grandWarehouseTotals.returnFactory || 0).toLocaleString('en-IN')}</td>}
                            {stockColumns.closing && <td className="p-1.5 text-center font-black border-r border-black">{(grandWarehouseTotals.closing || 0).toLocaleString('en-IN')}</td>}
                            {stockColumns.reqNo && <td className="p-1.5 text-center border-r border-black">-</td>}
                            {stockColumns.stockValue && <td className="p-1.5 text-right font-mono font-black text-xs">৳{(grandWarehouseTotals.stockValue || 0).toLocaleString('en-IN')}</td>}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}

                {reportTab === 'item_wise' && (
                  <table className="w-full text-left text-[11px] border-collapse border border-black">
                    <thead>
                      <tr className="bg-slate-200 text-black font-extrabold uppercase text-[10px] border-b-2 border-black">
                        {itemColumns.sl && <th className="p-2 w-8 text-center border-r border-black">#</th>}
                        {itemColumns.name && <th className="p-2 border-r border-black">Item Name</th>}
                        {itemColumns.unit && <th className="p-2 w-16 text-center border-r border-black">Unit</th>}
                        {itemColumns.rate && <th className="p-2 w-20 text-right border-r border-black">Price/Unit</th>}
                        {itemColumns.opening && <th className="p-2 w-20 text-center border-r border-black">Opening</th>}
                        {itemColumns.sold && <th className="p-2 w-20 text-center border-r border-black">Sold Coils</th>}
                        {itemColumns.closing && <th className="p-2 w-20 text-center border-r border-black">Closing</th>}
                        {itemColumns.salesTk && <th className="p-2 w-28 text-right">Total Sales (৳)</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      {filteredItemReport.map((row, idx) => (
                        <tr key={row.name + idx} className="border-b border-slate-200">
                          {itemColumns.sl && (
                            <td className="p-1.5 text-center font-mono border-r border-slate-300">
                              {masterItemSerialMap.get(row.id) || (row.code ? masterItemSerialMap.get(row.code) : undefined) || (row.name ? masterItemSerialMap.get(row.name.trim().toLowerCase()) : undefined) || (idx + 1)}
                            </td>
                          )}
                          {itemColumns.name && <td className="p-1.5 font-bold border-r border-slate-300">{row.name}</td>}
                          {itemColumns.unit && <td className="p-1.5 text-center border-r border-slate-300">{row.unit}</td>}
                          {itemColumns.rate && <td className="p-1.5 text-right font-mono border-r border-slate-300">৳{(row.rate || 0).toLocaleString('en-IN')}</td>}
                          {itemColumns.opening && <td className="p-1.5 text-center border-r border-slate-300">{(row.openingStock || 0).toLocaleString('en-IN')}</td>}
                          {itemColumns.sold && <td className="p-1.5 text-center font-bold border-r border-slate-300">{(row.soldCoils || 0) > 0 ? `${(row.soldCoils || 0).toLocaleString('en-IN')} Coils` : '-'}</td>}
                          {itemColumns.closing && <td className="p-1.5 text-center font-black border-r border-slate-300">{(row.closingStock || 0).toLocaleString('en-IN')}</td>}
                          {itemColumns.salesTk && <td className="p-1.5 text-right font-mono font-bold">৳{(row.totalSalesAmount || 0).toLocaleString('en-IN')}</td>}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-200 text-black font-black border-t-2 border-black text-[11px]">
                        {((itemColumns.sl ? 1 : 0) + (itemColumns.name ? 1 : 0) + (itemColumns.unit ? 1 : 0) + (itemColumns.rate ? 1 : 0)) > 0 ? (
                          <td colSpan={(itemColumns.sl ? 1 : 0) + (itemColumns.name ? 1 : 0) + (itemColumns.unit ? 1 : 0) + (itemColumns.rate ? 1 : 0)} className="p-2 text-right uppercase">Total Summary:</td>
                        ) : null}
                        {itemColumns.opening && <td className="p-2 text-center border-r border-black">{filteredItemReport.reduce((a, b) => a + (b.openingStock || 0), 0).toLocaleString('en-IN')}</td>}
                        {itemColumns.sold && <td className="p-2 text-center border-r border-black">{filteredItemReport.reduce((a, b) => a + (b.soldCoils || 0), 0).toLocaleString('en-IN')} Coils</td>}
                        {itemColumns.closing && <td className="p-2 text-center border-r border-black">{filteredItemReport.reduce((a, b) => a + (b.closingStock || 0), 0).toLocaleString('en-IN')}</td>}
                        {itemColumns.salesTk && <td className="p-2 text-right font-mono font-black">৳{filteredItemReport.reduce((a, b) => a + (b.totalSalesAmount || 0), 0).toLocaleString('en-IN')}</td>}
                      </tr>
                    </tfoot>
                  </table>
                )}

                {reportTab === 'day_wise' && (
                  <table className="w-full text-left text-[11px] border-collapse border border-black">
                    <thead>
                      <tr className="bg-slate-200 text-black font-extrabold uppercase text-[10px] border-b-2 border-black">
                        {dayColumns.sl && <th className="p-2 w-8 text-center border-r border-black">#</th>}
                        {dayColumns.date && <th className="p-2 w-24 border-r border-black">Date</th>}
                        {dayColumns.billCount && <th className="p-2 w-20 text-center border-r border-black">Bills</th>}
                        {dayColumns.totalCoils && <th className="p-2 w-24 text-center border-r border-black">Coils Sold</th>}
                        {dayColumns.parties && <th className="p-2 border-r border-black">Parties Served</th>}
                        {dayColumns.salesmen && <th className="p-2 w-24 border-r border-black">Salesman</th>}
                        {dayColumns.revenue && <th className="p-2 w-28 text-right">Revenue (৳)</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      {filteredDayReport.map((row, idx) => (
                        <tr key={`${row.date}-${idx}`} className="border-b border-slate-200">
                          {dayColumns.sl && <td className="p-1.5 text-center font-mono border-r border-slate-300">{idx + 1}</td>}
                          {dayColumns.date && <td className="p-1.5 font-mono font-bold border-r border-slate-300">{formatDateDDMMYY(row.date)}</td>}
                          {dayColumns.billCount && <td className="p-1.5 text-center border-r border-slate-300">{row.billCount || 0} Bills</td>}
                          {dayColumns.totalCoils && <td className="p-1.5 text-center font-bold border-r border-slate-300">{(row.totalCoils || 0).toLocaleString('en-IN')} Coils</td>}
                          {dayColumns.parties && <td className="p-1.5 border-r border-slate-300">{row.partiesList || 'General Customer'}</td>}
                          {dayColumns.salesmen && <td className="p-1.5 font-mono border-r border-slate-300">{row.salesmenList || '-'}</td>}
                          {dayColumns.revenue && <td className="p-1.5 text-right font-mono font-bold">৳{(row.totalRevenue || 0).toLocaleString('en-IN')}</td>}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-200 text-black font-black border-t-2 border-black text-[11px]">
                        {((dayColumns.sl ? 1 : 0) + (dayColumns.date ? 1 : 0)) > 0 ? (
                          <td colSpan={(dayColumns.sl ? 1 : 0) + (dayColumns.date ? 1 : 0)} className="p-2 text-right uppercase">Total:</td>
                        ) : null}
                        {dayColumns.billCount && <td className="p-2 text-center border-r border-black">{filteredDayReport.reduce((a, b) => a + (b.billCount || 0), 0)} Bills</td>}
                        {dayColumns.totalCoils && <td className="p-2 text-center border-r border-black">{filteredDayReport.reduce((a, b) => a + (b.totalCoils || 0), 0).toLocaleString('en-IN')} Coils</td>}
                        {dayColumns.parties && <td className="p-2 border-r border-black">-</td>}
                        {dayColumns.salesmen && <td className="p-2 border-r border-black">-</td>}
                        {dayColumns.revenue && <td className="p-2 text-right font-mono font-black">৳{filteredDayReport.reduce((a, b) => a + (b.totalRevenue || 0), 0).toLocaleString('en-IN')}</td>}
                      </tr>
                    </tfoot>
                  </table>
                )}

                {reportTab === 'party_wise' && (
                  <table className="w-full text-left text-[11px] border-collapse border border-black">
                    <thead>
                      <tr className="bg-slate-200 text-black font-extrabold uppercase text-[10px] border-b-2 border-black">
                        {partyColumns.sl && <th className="p-2 w-8 text-center border-r border-black">#</th>}
                        {partyColumns.partyName && <th className="p-2 border-r border-black">Party Name</th>}
                        {partyColumns.address && <th className="p-2 border-r border-black">Address</th>}
                        {partyColumns.salesmanCode && <th className="p-2 w-20 text-center border-r border-black">Salesman</th>}
                        {partyColumns.billCount && <th className="p-2 w-16 text-center border-r border-black">Bills</th>}
                        {partyColumns.coils && <th className="p-2 w-24 text-center border-r border-black">Coils Bought</th>}
                        {partyColumns.revenue && <th className="p-2 w-28 text-right">Purchases (৳)</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      {filteredPartyReport.map((row, idx) => (
                        <tr key={`${row.partyName}-${idx}`} className="border-b border-slate-200">
                          {partyColumns.sl && <td className="p-1.5 text-center font-mono border-r border-slate-300">{idx + 1}</td>}
                          {partyColumns.partyName && <td className="p-1.5 font-bold border-r border-slate-300">{row.partyName}</td>}
                          {partyColumns.address && <td className="p-1.5 text-slate-700 border-r border-slate-300">{row.address || '-'}</td>}
                          {partyColumns.salesmanCode && <td className="p-1.5 text-center font-mono border-r border-slate-300">{row.salesmanCode || '-'}</td>}
                          {partyColumns.billCount && <td className="p-1.5 text-center border-r border-slate-300">{row.billCount || 0}</td>}
                          {partyColumns.coils && <td className="p-1.5 text-center font-bold border-r border-slate-300">{(row.totalCoils || 0).toLocaleString('en-IN')} Coils</td>}
                          {partyColumns.revenue && <td className="p-1.5 text-right font-mono font-bold">৳{(row.totalRevenue || 0).toLocaleString('en-IN')}</td>}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-200 text-black font-black border-t-2 border-black text-[11px]">
                        {((partyColumns.sl ? 1 : 0) + (partyColumns.partyName ? 1 : 0) + (partyColumns.address ? 1 : 0) + (partyColumns.salesmanCode ? 1 : 0)) > 0 ? (
                          <td colSpan={(partyColumns.sl ? 1 : 0) + (partyColumns.partyName ? 1 : 0) + (partyColumns.address ? 1 : 0) + (partyColumns.salesmanCode ? 1 : 0)} className="p-2 text-right uppercase">Total:</td>
                        ) : null}
                        {partyColumns.billCount && <td className="p-2 text-center border-r border-black">{filteredPartyReport.reduce((a, b) => a + (b.billCount || 0), 0)}</td>}
                        {partyColumns.coils && <td className="p-2 text-center border-r border-black">{filteredPartyReport.reduce((a, b) => a + (b.totalCoils || 0), 0).toLocaleString('en-IN')} Coils</td>}
                        {partyColumns.revenue && <td className="p-2 text-right font-mono font-black">৳{filteredPartyReport.reduce((a, b) => a + (b.totalRevenue || 0), 0).toLocaleString('en-IN')}</td>}
                      </tr>
                    </tfoot>
                  </table>
                )}

                {reportTab === 'salesman_wise' && (
                  <table className="w-full text-left text-[11px] border-collapse border border-black">
                    <thead>
                      <tr className="bg-slate-200 text-black font-extrabold uppercase text-[10px] border-b-2 border-black">
                        {salesmanColumns.sl && <th className="p-2 w-8 text-center border-r border-black">#</th>}
                        {salesmanColumns.code && <th className="p-2 w-16 text-center border-r border-black">Code</th>}
                        {salesmanColumns.name && <th className="p-2 border-r border-black">Salesman Name</th>}
                        {salesmanColumns.area && <th className="p-2 border-r border-black">Area / Group</th>}
                        {salesmanColumns.billCount && <th className="p-2 w-16 text-center border-r border-black">Bills</th>}
                        {salesmanColumns.totalCoils && <th className="p-2 w-24 text-center border-r border-black">Coils Sold</th>}
                        {salesmanColumns.revenue && <th className="p-2 w-28 text-right">Revenue (৳)</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      {filteredSalesmanReport.map((row, idx) => (
                        <tr key={row.code} className="border-b border-slate-200">
                          {salesmanColumns.sl && <td className="p-1.5 text-center font-mono border-r border-slate-300">{idx + 1}</td>}
                          {salesmanColumns.code && <td className="p-1.5 font-mono font-bold text-center border-r border-slate-300">{row.code}</td>}
                          {salesmanColumns.name && <td className="p-1.5 font-bold border-r border-slate-300">{row.name}</td>}
                          {salesmanColumns.area && <td className="p-1.5 text-slate-700 border-r border-slate-300">{row.areaGroup}</td>}
                          {salesmanColumns.billCount && <td className="p-1.5 text-center border-r border-slate-300">{row.billCount || 0}</td>}
                          {salesmanColumns.totalCoils && <td className="p-1.5 text-center font-bold border-r border-slate-300">{(row.totalCoils || 0).toLocaleString('en-IN')} Coils</td>}
                          {salesmanColumns.revenue && <td className="p-1.5 text-right font-mono font-bold">৳{(row.totalRevenue || 0).toLocaleString('en-IN')}</td>}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-200 text-black font-black border-t-2 border-black text-[11px]">
                        {((salesmanColumns.sl ? 1 : 0) + (salesmanColumns.code ? 1 : 0) + (salesmanColumns.name ? 1 : 0) + (salesmanColumns.area ? 1 : 0)) > 0 ? (
                          <td colSpan={(salesmanColumns.sl ? 1 : 0) + (salesmanColumns.code ? 1 : 0) + (salesmanColumns.name ? 1 : 0) + (salesmanColumns.area ? 1 : 0)} className="p-2 text-right uppercase">Total:</td>
                        ) : null}
                        {salesmanColumns.billCount && <td className="p-2 text-center border-r border-black">{filteredSalesmanReport.reduce((a, b) => a + (b.billCount || 0), 0)}</td>}
                        {salesmanColumns.totalCoils && <td className="p-2 text-center border-r border-black">{filteredSalesmanReport.reduce((a, b) => a + (b.totalCoils || 0), 0).toLocaleString('en-IN')} Coils</td>}
                        {salesmanColumns.revenue && <td className="p-2 text-right font-mono font-black">৳{filteredSalesmanReport.reduce((a, b) => a + (b.totalRevenue || 0), 0).toLocaleString('en-IN')}</td>}
                      </tr>
                    </tfoot>
                  </table>
                )}

                {/* Signatures Block */}
                <div className="grid grid-cols-3 gap-8 pt-16 text-center text-xs font-bold text-black">
                  <div>
                    <div className="border-t border-black pt-1 mx-4">Prepared By (Operator)</div>
                  </div>
                  <div>
                    <div className="border-t border-black pt-1 mx-4">Checked & Verified By</div>
                  </div>
                  <div>
                    <div className="border-t border-black pt-1 mx-4">Store In-Charge / Manager</div>
                  </div>
                </div>
              </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EMAIL REPORT MODAL */}
      {showReportEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#030d14]/85 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-white">
            {/* Header */}
            <div className="cyber-glass-header text-white p-4 px-6 flex items-center justify-between border-b border-cyan-500/25">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-cyan-500/20 text-cyan-300 border border-cyan-400/35 rounded-xl shadow-xs">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Send Sales & Stock Statement via Email</h3>
                  <p className="text-xs text-slate-300">
                    Period: <span className="font-semibold text-cyan-300">{getPeriodLabel()}</span> | {displaySalesCenterTitle}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowReportEmailModal(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            {reportMailSuccessInfo ? (
              <div className="p-8 text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-500/20 text-emerald-300 border border-emerald-400/35 rounded-full flex items-center justify-center mx-auto shadow-inner">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-white">Email Dispatched Successfully!</h4>
                  <p className="text-sm text-slate-300 mt-1">
                    The Sales & Stock statement has been formatted and queued for delivery.
                  </p>
                </div>

                <div className="bg-[#061520] border border-cyan-500/30 rounded-xl p-4 text-left text-xs font-mono space-y-2 max-w-lg mx-auto text-slate-300">
                  <div>
                    <span className="font-bold text-cyan-200 font-sans">To: </span>
                    {reportMailSuccessInfo.to.join(', ')}
                  </div>
                  {reportMailSuccessInfo.cc.length > 0 && (
                    <div>
                      <span className="font-bold text-cyan-200 font-sans">CC: </span>
                      {reportMailSuccessInfo.cc.join(', ')}
                    </div>
                  )}
                  <div>
                    <span className="font-bold text-cyan-200 font-sans">Subject: </span>
                    {reportMailSuccessInfo.subject}
                  </div>
                  <div>
                    <span className="font-bold text-cyan-200 font-sans">Sent At: </span>
                    {reportMailSuccessInfo.sentAt}
                  </div>
                  {reportMailSuccessInfo.attachmentName && (
                    <div className="flex items-center space-x-1.5 text-emerald-300 font-medium pt-1 border-t border-cyan-500/20">
                      <Paperclip className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="font-bold text-cyan-200 font-sans">Attachment: </span>
                      <span className="truncate">{reportMailSuccessInfo.attachmentName}</span>
                    </div>
                  )}
                </div>

                <div className="pt-2 flex justify-center space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setReportMailSuccessInfo(null);
                      setShowReportEmailModal(false);
                    }}
                    className="px-6 py-2.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenReportInGmail}
                    className="px-5 py-2.5 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 font-bold rounded-xl border border-cyan-500/25 transition-colors flex items-center space-x-2 cursor-pointer"
                  >
                    <ExternalLink className="w-4 h-4 text-cyan-300" />
                    <span>Open in Gmail</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
                {/* Recipients (TO) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-cyan-200 uppercase tracking-wider">
                      To Recipients <span className="text-rose-400">*</span>
                    </label>
                    <span className="text-[11px] text-slate-400">Press Enter or comma to add email</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 p-2 bg-[#061520] border border-cyan-500/30 rounded-xl focus-within:border-cyan-400 transition-all">
                    {reportEmailToList.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-cyan-500/15 text-cyan-200 text-xs font-semibold rounded-lg border border-cyan-400/35"
                      >
                        <span>{email}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveReportTo(email)}
                          className="text-cyan-300 hover:text-rose-400 p-0.5 rounded-full"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    <input
                      type="email"
                      value={newReportToInput}
                      onChange={(e) => setNewReportToInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          handleAddReportTo(newReportToInput);
                        }
                      }}
                      placeholder={reportEmailToList.length === 0 ? 'Type email address & press Enter...' : 'Add another...'}
                      className="flex-1 min-w-[140px] sm:min-w-[200px] bg-transparent text-xs text-white placeholder-slate-400 outline-hidden py-1 px-1"
                    />
                  </div>

                  {/* Quick Add presets */}
                  <div className="flex items-center space-x-2 mt-2">
                    <span className="text-[11px] text-slate-400 font-medium">Quick add:</span>
                    {['pcildomestic@gmail.com', '290suvro.pcil@gmail.com', 'polycables@gmail.com'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleAddReportTo(preset)}
                        disabled={reportEmailToList.includes(preset)}
                        className={`text-[11px] px-2 py-0.5 rounded-md border transition-colors ${
                          reportEmailToList.includes(preset)
                            ? 'bg-[#081b28] text-slate-500 border-cyan-500/15 cursor-not-allowed'
                            : 'bg-cyan-500/15 text-cyan-200 border-cyan-400/35 hover:bg-cyan-500/25 cursor-pointer'
                        }`}
                      >
                        + {preset.split('@')[0]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* CC Recipients */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-cyan-200 uppercase tracking-wider">
                      CC (Carbon Copy)
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 p-2 bg-[#061520] border border-cyan-500/30 rounded-xl focus-within:border-cyan-400 transition-all">
                    {reportEmailCcList.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-[#0c2638] text-slate-200 text-xs font-semibold rounded-lg border border-cyan-500/30"
                      >
                        <span>{email}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveReportCc(email)}
                          className="text-slate-400 hover:text-rose-400 p-0.5 rounded-full"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    <input
                      type="email"
                      value={newReportCcInput}
                      onChange={(e) => setNewReportCcInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          handleAddReportCc(newReportCcInput);
                        }
                      }}
                      placeholder={reportEmailCcList.length === 0 ? 'Type CC email & press Enter...' : 'Add CC...'}
                      className="flex-1 min-w-[140px] sm:min-w-[200px] bg-transparent text-xs text-white placeholder-slate-400 outline-hidden py-1 px-1"
                    />
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label className="text-xs font-bold text-cyan-200 uppercase tracking-wider block mb-1.5">
                    Email Subject
                  </label>
                  <input
                    type="text"
                    value={customReportSubject}
                    onChange={(e) => setCustomReportSubject(e.target.value)}
                    className="w-full text-xs font-semibold text-white bg-[#061520] border border-cyan-500/30 rounded-xl p-2.5 focus:border-cyan-400 outline-hidden"
                  />
                </div>

                {/* Email Body Preview */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-cyan-200 uppercase tracking-wider">
                      Report Content & Summary
                    </label>
                    <button
                      type="button"
                      onClick={handleCopyReportEmail}
                      className="text-[11px] font-bold text-slate-300 hover:text-cyan-300 flex items-center space-x-1 cursor-pointer"
                    >
                      {reportEmailCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-300">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Text</span>
                        </>
                      )}
                    </button>
                  </div>
                  <textarea
                    rows={8}
                    value={customReportBody}
                    onChange={(e) => setCustomReportBody(e.target.value)}
                    className="w-full text-xs font-mono text-white bg-[#061520] border border-cyan-500/30 rounded-xl p-3 focus:border-cyan-400 outline-hidden leading-relaxed"
                  />
                </div>

                {/* Attached Excel File Card */}
                <div className="cyber-glass-subcard border border-cyan-500/25 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/35 flex items-center justify-center shrink-0 shadow-xs">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap">
                        <span className="text-xs font-bold text-white truncate">
                          {getReportExcelFilename()}
                        </span>
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                          <Paperclip className="w-3 h-3 text-emerald-300" />
                          <span>Attached</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (reportTab === 'item_wise') {
                        exportSalesReportToXLSX(
                          itemReportData.map((r) => ({
                            code: r.code,
                            name: r.name,
                            unit: r.unit,
                            rate: r.rate,
                            openingStock: r.openingStock,
                            soldCoils: r.soldCoils,
                            closingStock: r.closingStock,
                            totalAmount: r.totalSalesAmount
                          })),
                          getPeriodLabel()
                        );
                      } else {
                        exportCategoryWiseStockReportToXLSX(categoryStockData, getPeriodLabel());
                      }
                    }}
                    className="shrink-0 px-3 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-emerald-300 text-xs font-bold rounded-lg border border-cyan-500/25 shadow-2xs transition-colors flex items-center space-x-1.5 cursor-pointer"
                    title="Download a local copy of this Excel workbook"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Download .xlsx</span>
                  </button>
                </div>

                {/* Modal Footer Actions */}
                <div className="pt-3 border-t border-cyan-500/25 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center space-x-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={handleCopyReportEmail}
                      className="flex-1 sm:flex-none px-3.5 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 text-xs font-bold rounded-xl border border-cyan-500/25 transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5 text-cyan-300" />
                      <span>{reportEmailCopied ? 'Copied to Clipboard' : 'Copy Email Text'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenReportInGmail}
                      className="flex-1 sm:flex-none px-3.5 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-300 text-xs font-bold rounded-xl border border-cyan-500/25 transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                      title="Open filled compose tab directly in Gmail"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Gmail Web</span>
                    </button>
                  </div>

                  <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={() => setShowReportEmailModal(false)}
                      className="px-4 py-2 text-xs font-bold text-slate-300 hover:text-white rounded-xl bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/25 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSendReportEmail}
                      disabled={isSendingReportMail || reportEmailToList.length === 0}
                      className="px-5 py-2 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 text-slate-950 text-xs font-black rounded-xl shadow-xs transition-colors flex items-center space-x-2 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {isSendingReportMail ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                          <span>Dispatching...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 text-slate-950" />
                          <span>Send Report</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ITEM DAY REPORT MODAL */}
      {itemDayReportModal && (
        <ItemDayReportModal
          item={itemDayReportModal}
          storedBills={storedBills.filter(isBillBranchMatch)}
          factoryImports={factoryImports.filter(isChallanBranchMatch)}
          stockReturns={stockReturns.filter(isReturnBranchMatch)}
          period={period}
          startDate={startDate}
          endDate={endDate}
          billTypeFilter={billTypeFilter}
          getPeriodLabel={getPeriodLabel}
          onClose={() => setItemDayReportModal(null)}
        />
      )}

      {/* STOCK COLOR BREAKDOWN MODAL FOR STOCK SERIAL REPORT */}
      {stockColorModalState && stockColorModalState.isOpen && (
        <StockColorBreakdownModal
          isOpen={stockColorModalState.isOpen}
          item={stockColorModalState.item}
          initialCategory={stockColorModalState.initialCategory || 'closing'}
          storedBills={storedBills.filter(isBillBranchMatch)}
          factoryImports={factoryImports.filter(isChallanBranchMatch)}
          stockReturns={stockReturns.filter(isReturnBranchMatch)}
          startDate={startDate}
          endDate={endDate}
          onClose={() => setStockColorModalState(null)}
        />
      )}
    </div>
  );
};

// ==============================================================
// ITEM DAY REPORT MODAL COMPONENT (Daily Stock Ledger for Item)
// ==============================================================
interface ItemDayReportModalProps {
  item: Partial<Item> & { name?: string; code?: string; category?: string; openingStock?: number };
  storedBills: StoredBill[];
  factoryImports: FactoryImportChallan[];
  stockReturns: StockReturnChallan[];
  period: PeriodType;
  startDate: string;
  endDate: string;
  billTypeFilter: 'all' | 'showroom' | 'office';
  getPeriodLabel: () => string;
  onClose: () => void;
}

function ItemDayReportModal({
  item,
  storedBills,
  factoryImports,
  stockReturns,
  period,
  startDate,
  endDate,
  billTypeFilter,
  getPeriodLabel,
  onClose,
}: ItemDayReportModalProps) {
  const [selectedSalesDate, setSelectedSalesDate] = useState<string | null>(null);
  const [selectedBill, setSelectedBill] = useState<StoredBill | null>(null);

  const ledgerData = useMemo(() => {
    let startIso = startDate ? (parseDateToISO(startDate) || startDate) : '';
    let endIso = endDate ? (parseDateToISO(endDate) || endDate) : '';
    const now = new Date();
    const runningMm = String(now.getMonth() + 1).padStart(2, '0');
    const runningYyyy = now.getFullYear();

    if (period === 'last_month') {
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevYyyy = prevDate.getFullYear();
      const prevMm = String(prevDate.getMonth() + 1).padStart(2, '0');
      const prevLastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
      startIso = `${prevYyyy}-${prevMm}-01`;
      endIso = `${prevYyyy}-${prevMm}-${String(prevLastDay).padStart(2, '0')}`;
    } else if (period === 'this_year') {
      startIso = `${runningYyyy}-01-01`;
      endIso = `${runningYyyy}-12-31`;
    } else if (period === 'last_year') {
      startIso = `${runningYyyy - 1}-01-01`;
      endIso = `${runningYyyy - 1}-12-31`;
    } else if (period === 'all') {
      startIso = `${runningYyyy}-${runningMm}-01`;
      const lastDay = new Date(runningYyyy, now.getMonth() + 1, 0).getDate();
      endIso = `${runningYyyy}-${runningMm}-${String(lastDay).padStart(2, '0')}`;
    }

    const dates: string[] = [];
    const cur = new Date(startIso || `${runningYyyy}-${runningMm}-01`);
    const end = new Date(endIso || `${runningYyyy}-${runningMm}-15`);
    while (cur <= end) {
      const yyyy = cur.getFullYear();
      const mm = String(cur.getMonth() + 1).padStart(2, '0');
      const dd = String(cur.getDate()).padStart(2, '0');
      dates.push(`${yyyy}-${mm}-${dd}`);
      cur.setDate(cur.getDate() + 1);
    }

    const itemNameKey = (item.name || '').trim().toLowerCase();
    const itemCodeKey = (item.code || '').trim().toLowerCase();

    const prevImp = factoryImports.reduce((sum, ch) => {
      const chIso = parseDateToISO(ch.date);
      if (chIso && chIso < startIso) {
        const lineQty = ch.lines.reduce((lSum, l) => {
          if (l.itemName.trim().toLowerCase() === itemNameKey || (itemCodeKey && (l.itemCode || '').trim().toLowerCase() === itemCodeKey)) {
            return lSum + (l.quantity || 0);
          }
          return lSum;
        }, 0);
        return sum + lineQty;
      }
      return sum;
    }, 0);

    const prevPartyRet = stockReturns.filter(r => r.returnType === 'party_return').reduce((sum, ch) => {
      const chIso = parseDateToISO(ch.date);
      if (chIso && chIso < startIso) {
        const lineQty = ch.lines.reduce((lSum, l) => {
          if (l.itemName.trim().toLowerCase() === itemNameKey || (itemCodeKey && (l.itemCode || '').trim().toLowerCase() === itemCodeKey)) {
            return lSum + (l.quantity || 0);
          }
          return lSum;
        }, 0);
        return sum + lineQty;
      }
      return sum;
    }, 0);

    const prevSold = storedBills.filter(b => {
      const isOffice = Boolean(b.isOfficeBill || b.header?.isOfficeBill);
      if (billTypeFilter === 'showroom' && isOffice) return false;
      if (billTypeFilter === 'office' && !isOffice) return false;
      return true;
    }).reduce((sum, b) => {
      const bDateStr = b.header?.date || b.savedAt || '';
      const bIso = parseDateToISO(bDateStr);
      if (bIso && bIso < startIso) {
        const lineQty = b.lines.reduce((lSum, l) => {
          if (l.itemDescription.trim().toLowerCase().includes(itemNameKey)) {
            return lSum + (l.coilQty || 0);
          }
          return lSum;
        }, 0);
        return sum + lineQty;
      }
      return sum;
    }, 0);

    const prevFactRet = stockReturns.filter(r => r.returnType === 'factory_return').reduce((sum, ch) => {
      const chIso = parseDateToISO(ch.date);
      if (chIso && chIso < startIso) {
        const lineQty = ch.lines.reduce((lSum, l) => {
          if (l.itemName.trim().toLowerCase() === itemNameKey || (itemCodeKey && (l.itemCode || '').trim().toLowerCase() === itemCodeKey)) {
            return lSum + (l.quantity || 0);
          }
          return lSum;
        }, 0);
        return sum + lineQty;
      }
      return sum;
    }, 0);

    const baseOpening = item.openingStock || 0;
    const initialOpening = Math.max(0, baseOpening + prevImp + prevPartyRet - prevSold - prevFactRet);

    let runningStock = initialOpening;
    const rows: Array<{
      date: string;
      formattedDate: string;
      opening: number;
      factoryImport: number;
      partyReturn: number;
      sales: number;
      factoryReturn: number;
      closing: number;
    }> = [];

    let totalImport = 0;
    let totalPartyRet = 0;
    let totalSales = 0;
    let totalFactRet = 0;

    dates.forEach((dIso) => {
      const currentOpening = runningStock;

      const factoryImport = factoryImports.reduce((sum, ch) => {
        const chIso = parseDateToISO(ch.date);
        if (chIso === dIso) {
          const lineQty = ch.lines.reduce((lSum, l) => {
            if (l.itemName.trim().toLowerCase() === itemNameKey || (itemCodeKey && (l.itemCode || '').trim().toLowerCase() === itemCodeKey)) {
              return lSum + (l.quantity || 0);
            }
            return lSum;
          }, 0);
          return sum + lineQty;
        }
        return sum;
      }, 0);

      const partyReturn = stockReturns.filter(r => r.returnType === 'party_return').reduce((sum, ch) => {
        const chIso = parseDateToISO(ch.date);
        if (chIso === dIso) {
          const lineQty = ch.lines.reduce((lSum, l) => {
            if (l.itemName.trim().toLowerCase() === itemNameKey || (itemCodeKey && (l.itemCode || '').trim().toLowerCase() === itemCodeKey)) {
              return lSum + (l.quantity || 0);
            }
            return lSum;
          }, 0);
          return sum + lineQty;
        }
        return sum;
      }, 0);

      const sales = storedBills.filter(b => {
        const isOffice = Boolean(b.isOfficeBill || b.header?.isOfficeBill);
        if (billTypeFilter === 'showroom' && isOffice) return false;
        if (billTypeFilter === 'office' && !isOffice) return false;
        return true;
      }).reduce((sum, b) => {
        const bDateStr = b.header?.date || b.savedAt || '';
        const bIso = parseDateToISO(bDateStr);
        if (bIso === dIso) {
          const lineQty = b.lines.reduce((lSum, l) => {
            if (l.itemDescription.trim().toLowerCase().includes(itemNameKey)) {
              return lSum + (l.coilQty || 0);
            }
            return lSum;
          }, 0);
          return sum + lineQty;
        }
        return sum;
      }, 0);

      const factoryReturn = stockReturns.filter(r => r.returnType === 'factory_return').reduce((sum, ch) => {
        const chIso = parseDateToISO(ch.date);
        if (chIso === dIso) {
          const lineQty = ch.lines.reduce((lSum, l) => {
            if (l.itemName.trim().toLowerCase() === itemNameKey || (itemCodeKey && (l.itemCode || '').trim().toLowerCase() === itemCodeKey)) {
              return lSum + (l.quantity || 0);
            }
            return lSum;
          }, 0);
          return sum + lineQty;
        }
        return sum;
      }, 0);

      const closing = currentOpening + factoryImport + partyReturn - sales - factoryReturn;
      runningStock = closing;

      totalImport += factoryImport;
      totalPartyRet += partyReturn;
      totalSales += sales;
      totalFactRet += factoryReturn;

      const [y, m, d] = dIso.split('-');
      rows.push({
        date: dIso,
        formattedDate: `${d}.${m}.${y.slice(2)}`,
        opening: currentOpening,
        factoryImport,
        partyReturn,
        sales,
        factoryReturn,
        closing,
      });
    });

    return { rows, initialOpening, finalClosing: runningStock, totalImport, totalPartyRet, totalSales, totalFactRet };
  }, [item, storedBills, factoryImports, stockReturns, period, startDate, endDate, billTypeFilter]);

  const itemNameKey = (item.name || '').trim().toLowerCase();

  // Compute matching bills for selectedSalesDate
  const billsOnSelectedDate = useMemo(() => {
    if (!selectedSalesDate) return [];
    return storedBills.filter(b => {
      const isOffice = Boolean(b.isOfficeBill || b.header?.isOfficeBill);
      if (billTypeFilter === 'showroom' && isOffice) return false;
      if (billTypeFilter === 'office' && !isOffice) return false;
      const bDateStr = b.header?.date || b.savedAt || '';
      const bIso = parseDateToISO(bDateStr);
      if (bIso !== selectedSalesDate) return false;
      return b.lines.some(l => l.itemDescription.trim().toLowerCase().includes(itemNameKey));
    }).map(b => {
      const matchLines = b.lines.filter(l => l.itemDescription.trim().toLowerCase().includes(itemNameKey));
      const lineQty = matchLines.reduce((s, l) => s + (Number(l.coilQty) || 0), 0);
      const lineAmount = matchLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
      return { bill: b, lineQty, lineAmount, matchLines };
    });
  }, [selectedSalesDate, storedBills, billTypeFilter, itemNameKey]);

  return (
    <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 w-full max-w-5xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150 relative text-white">
        {/* Modal Header */}
        <div className="cyber-glass-header text-white p-4 px-6 flex items-center justify-between border-b border-cyan-500/25">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-300 rounded-xl border border-emerald-400/35">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm uppercase tracking-wide flex items-center space-x-2">
                <span>Item Day Report (Daily Stock Ledger)</span>
              </h3>
              <p className="text-xs text-slate-300 font-mono mt-0.5">
                Item: <span className="font-bold text-emerald-300">{item.name}</span> | Period: <span className="text-cyan-300">{getPeriodLabel()}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => window.print()}
              className="p-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 rounded-lg border border-cyan-500/30 transition-colors flex items-center space-x-1.5 text-xs font-bold cursor-pointer"
            >
              <Printer className="w-4 h-4 text-emerald-400" />
              <span>Print</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg border border-rose-400/40 transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Table Content */}
        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-4">
          <div className="flex items-center justify-between text-xs text-emerald-200 bg-emerald-500/15 border border-emerald-400/30 rounded-xl p-3 px-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-emerald-300 shrink-0" />
              <span>
                <strong>Tip:</strong> Click on any day's <span className="font-bold text-rose-300">Sales Quantity</span> to inspect all linked customer bills and invoices for that date.
              </span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-cyan-500/25 shadow-xs bg-[#071824]/70">
            <table className="w-full text-left text-xs border-collapse text-slate-200">
              <thead className="bg-[#0c2638] text-cyan-200 font-extrabold text-[11px] border-b border-cyan-500/30">
                <tr>
                  <th className="p-2.5 px-3 border-r border-cyan-500/20 text-center w-12">#</th>
                  <th className="p-2.5 px-3 border-r border-cyan-500/20 text-center w-24">Date</th>
                  <th className="p-2.5 px-3 border-r border-cyan-500/20 text-right bg-[#081b28] text-amber-300">Opening Stock</th>
                  <th className="p-2.5 px-3 border-r border-cyan-500/20 text-right text-emerald-300 bg-emerald-950/40">Factory Import (+)</th>
                  <th className="p-2.5 px-3 border-r border-cyan-500/20 text-right text-cyan-300 bg-cyan-950/40">Party Return (+)</th>
                  <th className="p-2.5 px-3 border-r border-cyan-500/20 text-right text-rose-300 bg-rose-950/40">Sales (-)</th>
                  <th className="p-2.5 px-3 border-r border-cyan-500/20 text-right text-amber-300 bg-amber-950/40">Factory Return (-)</th>
                  <th className="p-2.5 px-3 text-right bg-[#061520] text-emerald-300 font-black">Closing Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/15 font-medium bg-[#071824]/60">
                {ledgerData.rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400 italic">
                      No daily stock movements found for this item in the selected period.
                    </td>
                  </tr>
                ) : (
                  ledgerData.rows.map((row, idx) => (
                    <tr key={`${row.date}-${idx}`} className="hover:bg-cyan-500/[0.06] transition-colors">
                      <td className="p-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                      <td className="p-2.5 px-3 text-center font-mono font-bold text-slate-200 bg-[#081b28]/40">{row.formattedDate}</td>
                      <td className="p-2.5 px-3 text-right font-mono font-bold text-amber-200 bg-amber-500/[0.05]">{row.opening.toLocaleString()}</td>
                      <td className="p-2.5 px-3 text-right font-mono font-black text-emerald-300 bg-emerald-500/[0.05]">
                        {row.factoryImport > 0 ? `+${row.factoryImport.toLocaleString()}` : '-'}
                      </td>
                      <td className="p-2.5 px-3 text-right font-mono font-bold text-cyan-300 bg-cyan-500/[0.05]">
                        {row.partyReturn > 0 ? `+${row.partyReturn.toLocaleString()}` : '-'}
                      </td>
                      <td className="p-2.5 px-3 text-right font-mono font-bold text-rose-300 bg-rose-500/[0.05]">
                        {row.sales > 0 ? (
                          <button
                            type="button"
                            onClick={() => setSelectedSalesDate(row.date)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 font-black rounded-lg border border-rose-400/40 shadow-2xs hover:scale-105 transition-all cursor-pointer"
                            title={`Click to view bills linked with ${row.sales} coils sold on ${row.formattedDate}`}
                          >
                            <span>-{row.sales.toLocaleString()}</span>
                            <ExternalLink className="w-3 h-3 text-rose-300 ml-1" />
                          </button>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="p-2.5 px-3 text-right font-mono font-bold text-amber-300 bg-amber-500/[0.05]">
                        {row.factoryReturn > 0 ? `-${row.factoryReturn.toLocaleString()}` : '-'}
                      </td>
                      <td className="p-2.5 px-3 text-right font-mono font-black text-emerald-300 text-sm bg-emerald-500/10">
                        {row.closing.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-[#0c2638] text-white font-mono text-xs border-t border-cyan-500/30">
                <tr>
                  <td colSpan={2} className="p-3 font-bold text-emerald-300 uppercase text-center font-sans">PERIOD TOTALS</td>
                  <td className="p-3 text-right font-extrabold text-amber-300">{ledgerData.initialOpening.toLocaleString()}</td>
                  <td className="p-3 text-right font-black text-emerald-300">+{ledgerData.totalImport.toLocaleString()}</td>
                  <td className="p-3 text-right font-bold text-cyan-300">+{ledgerData.totalPartyRet.toLocaleString()}</td>
                  <td className="p-3 text-right font-bold text-rose-300">-{ledgerData.totalSales.toLocaleString()}</td>
                  <td className="p-3 text-right font-bold text-amber-300">-{ledgerData.totalFactRet.toLocaleString()}</td>
                  <td className="p-3 text-right font-black text-emerald-300 text-sm">{ledgerData.finalClosing.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-[#081b28] p-3 px-6 border-t border-cyan-500/25 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-1.5 bg-[#0e2a3d] hover:bg-[#133852] text-cyan-200 border border-cyan-500/35 font-bold rounded-lg text-xs transition-colors cursor-pointer"
          >
            Close Report
          </button>
        </div>

        {/* ============================================================== */}
        {/* SUB-MODAL: MATCHING BILLS FOR SELECTED DATE */}
        {/* ============================================================== */}
        {selectedSalesDate && (
          <div className="fixed inset-0 z-60 bg-[#030d14]/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-rose-400/35 w-full max-w-3xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150 text-white">
              {/* Header */}
              <div className="bg-rose-950/90 text-white p-4 px-6 flex items-center justify-between border-b border-rose-500/30">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-rose-500/20 text-rose-300 rounded-xl border border-rose-400/35">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm uppercase tracking-wide">
                      Linked Sales Bills & Invoices
                    </h3>
                    <p className="text-xs text-rose-200 font-mono mt-0.5">
                      Date: <span className="font-bold text-white">{selectedSalesDate}</span> | Item: <span className="font-bold text-amber-300">{item.name}</span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedSalesDate(null)}
                  className="p-2 bg-rose-700 hover:bg-rose-600 text-white rounded-lg border border-rose-400/30 transition-colors cursor-pointer"
                  title="Close and return to Day Report"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                {billsOnSelectedDate.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 italic">
                    No matching bills found on this date.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-300">
                      Found <strong className="text-white">{billsOnSelectedDate.length}</strong> bill(s) containing <strong className="text-cyan-200">{item.name}</strong> on {selectedSalesDate}. Click <strong className="text-emerald-300">View Bill Invoice</strong> to see the complete document.
                    </p>
                    <div className="divide-y divide-cyan-500/20 border border-cyan-500/25 rounded-xl overflow-hidden shadow-xs bg-[#071824]/70">
                      {billsOnSelectedDate.map(({ bill, lineQty, lineAmount }, bIdx) => (
                        <div key={bill.id || bIdx} className="p-4 hover:bg-cyan-500/[0.06] transition-colors flex flex-wrap items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className="font-mono font-black text-sm text-cyan-200 bg-[#061520] px-2 py-0.5 rounded border border-cyan-500/30">
                                Bill #{bill.header?.billNo || bill.id}
                              </span>
                              {bill.isOfficeBill || bill.header?.isOfficeBill ? (
                                <span className="text-[10px] font-bold uppercase bg-amber-500/20 text-amber-200 px-2 py-0.5 rounded-full border border-amber-400/35">
                                  Office Bill
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-200 px-2 py-0.5 rounded-full border border-emerald-400/35">
                                  Sales Center Bill
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-bold text-slate-200">
                              Party: <span className="text-white">{bill.header?.partyName || 'Cash Party'}</span>
                              {bill.header?.address && <span className="text-slate-400 font-normal"> ({bill.header.address})</span>}
                            </p>
                            <p className="text-xs text-slate-400 font-mono">
                              Salesperson: <span className="font-bold text-slate-200">{bill.header?.salespersonName || bill.header?.salesmanCode || 'Sales Center'}</span>
                            </p>
                          </div>

                          <div className="flex items-center space-x-4">
                            <div className="text-right font-mono">
                              <span className="text-[10px] text-slate-400 block uppercase font-sans font-semibold">Item Qty Sold</span>
                              <span className="text-base font-black text-rose-300">{lineQty.toLocaleString()} Coils</span>
                              <span className="text-xs text-slate-300 block font-bold">৳{lineAmount.toLocaleString()}</span>
                            </div>

                            <button
                              type="button"
                              onClick={() => setSelectedBill(bill)}
                              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black rounded-xl shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>View Bill Invoice</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="bg-[#081b28] p-3 px-6 border-t border-cyan-500/25 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedSalesDate(null)}
                  className="px-5 py-1.5 bg-[#0e2a3d] hover:bg-[#133852] text-cyan-200 border border-cyan-500/35 font-bold rounded-lg text-xs transition-colors cursor-pointer"
                >
                  Back to Day Report
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* SUB-MODAL: FULL BILL INVOICE PREVIEW VIEWER */}
        {/* ============================================================== */}
        {selectedBill && (
          <div className="fixed inset-0 z-70 bg-slate-950/90 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-4xl overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
              {/* Toolbar */}
              <div className="bg-slate-900 text-white p-3 px-6 flex items-center justify-between border-b border-slate-800 no-print">
                <div className="flex items-center space-x-2">
                  <span className="font-extrabold text-sm uppercase tracking-wide">
                    Bill Invoice #{selectedBill.header?.billNo || selectedBill.id}
                  </span>
                  {selectedBill.isOfficeBill || selectedBill.header?.isOfficeBill ? (
                    <span className="text-[10px] font-bold uppercase bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full">
                      Office Sale
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase bg-emerald-500 text-slate-950 px-2 py-0.5 rounded-full">
                      Sales Center Sale
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="p-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center space-x-1 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Invoice</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedBill(null)}
                    className="p-1.5 px-3 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center space-x-1 cursor-pointer"
                    title="Close Bill and return to Day Report"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Close Bill</span>
                  </button>
                </div>
              </div>

              {/* Bill Invoice Document Content */}
              <div className="p-8 max-h-[75vh] overflow-y-auto space-y-6 text-slate-900 bg-white font-sans text-xs">
                {/* Header Banner */}
                <div className="text-center border-b-2 border-slate-900 pb-4">
                  <h1 className="text-2xl font-black uppercase tracking-wider text-slate-900">POLY CABLES</h1>
                  <p className="text-xs font-semibold text-slate-600">Manufacturer of Quality Electrical Cables & Wires</p>
                  <p className="text-[11px] text-slate-500 font-mono">Sales Center: 125, Nawabpur Road, Dhaka | Phone: 01711-000000</p>
                  <div className="inline-block mt-2 px-4 py-0.5 bg-slate-900 text-white font-bold text-xs uppercase tracking-widest rounded-full">
                    {selectedBill.isOfficeBill || selectedBill.header?.isOfficeBill ? 'OFFICE SALES INVOICE' : 'BILL / CASH MEMO'}
                  </div>
                </div>

                {/* Bill Meta Details Grid */}
                <div className="grid grid-cols-2 gap-4 border border-slate-300 rounded-xl p-4 bg-slate-50/50">
                  <div className="space-y-1.5">
                    <p><strong>Customer / Party:</strong> <span className="font-bold text-sm text-slate-900">{selectedBill.header?.partyName || 'Cash Party'}</span></p>
                    <p><strong>Address:</strong> <span>{selectedBill.header?.address || 'Local'}</span></p>
                    {selectedBill.header?.phone && <p><strong>Phone:</strong> <span>{selectedBill.header.phone}</span></p>}
                  </div>

                  <div className="space-y-1.5 text-right font-mono">
                    <p><strong>Bill No:</strong> <span className="font-bold text-slate-900">{selectedBill.header?.billNo || selectedBill.id}</span></p>
                    <p><strong>Date:</strong> <span>{selectedBill.header?.date || selectedBill.savedAt}</span></p>
                    {selectedBill.header?.challanNo && <p><strong>Challan No:</strong> <span>{selectedBill.header.challanNo}</span></p>}
                    {selectedBill.header?.orderNumber && <p><strong>Order No:</strong> <span>{selectedBill.header.orderNumber}</span></p>}
                    <p><strong>Salesperson:</strong> <span>{selectedBill.header?.salespersonName || selectedBill.header?.salesmanCode || '-'}</span></p>
                  </div>
                </div>

                {/* Items Table */}
                <div className="border border-slate-300 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-900 text-white font-bold text-[11px]">
                      <tr>
                        <th className="p-2.5 text-center w-10 border-r border-slate-800">#</th>
                        <th className="p-2.5 border-r border-slate-800">Description of Goods</th>
                        <th className="p-2.5 text-center w-24 border-r border-slate-800">Quantity</th>
                        <th className="p-2.5 text-center w-16 border-r border-slate-800">Unit</th>
                        <th className="p-2.5 text-right w-24 border-r border-slate-800">Rate (Tk)</th>
                        <th className="p-2.5 text-right w-28">Amount (Tk)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-medium">
                      {(selectedBill.lines || []).map((line, lIdx) => {
                        const isHighlight = line.itemDescription.trim().toLowerCase().includes(itemNameKey);
                        return (
                          <tr key={line.id || lIdx} className={isHighlight ? 'bg-amber-50 font-bold' : 'hover:bg-slate-50'}>
                            <td className="p-2.5 text-center font-mono text-slate-400 border-r border-slate-200">{lIdx + 1}</td>
                            <td className="p-2.5 text-slate-900 border-r border-slate-200">
                              <div className="flex items-center space-x-1.5">
                                <span>{line.itemDescription}</span>
                                {isHighlight && (
                                  <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded font-bold">Selected Item</span>
                                )}
                              </div>
                            </td>
                            <td className="p-2.5 text-center font-mono font-bold text-slate-900 border-r border-slate-200">{line.coilQty}</td>
                            <td className="p-2.5 text-center text-slate-600 border-r border-slate-200">{line.unit || 'Coils'}</td>
                            <td className="p-2.5 text-right font-mono text-slate-800 border-r border-slate-200">৳{Number(line.rate || 0).toLocaleString()}</td>
                            <td className="p-2.5 text-right font-mono font-black text-slate-900">৳{Number(line.amount || 0).toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 font-mono text-xs">
                      <tr>
                        <td colSpan={2} className="p-2.5 text-right font-sans uppercase">Subtotal:</td>
                        <td className="p-2.5 text-center font-black">{selectedBill.totalCoils || selectedBill.lines?.reduce((s, l) => s + (Number(l.coilQty) || 0), 0)}</td>
                        <td className="p-2.5 text-center">Coils</td>
                        <td className="p-2.5"></td>
                        <td className="p-2.5 text-right font-black">৳{Number(selectedBill.subtotal || 0).toLocaleString()}</td>
                      </tr>
                      {Boolean(selectedBill.discountAmount && selectedBill.discountAmount > 0) && (
                        <tr>
                          <td colSpan={5} className="p-2 text-right font-sans text-slate-600">
                            Discount ({selectedBill.header?.discountPercent || 0}%):
                          </td>
                          <td className="p-2 text-right text-rose-700">-৳{Number(selectedBill.discountAmount).toLocaleString()}</td>
                        </tr>
                      )}
                      <tr className="bg-slate-900 text-white text-sm">
                        <td colSpan={5} className="p-3 text-right font-sans font-black uppercase text-emerald-400">Grand Total (Net Amount):</td>
                        <td className="p-3 text-right font-black text-emerald-400">৳{Number(selectedBill.grandTotal || selectedBill.subtotal || 0).toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Amount in words */}
                {selectedBill.inWords && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 font-mono text-xs">
                    <strong>In Words:</strong> <span className="italic text-slate-700">{selectedBill.inWords}</span>
                  </div>
                )}

                {/* Signatures */}
                <div className="grid grid-cols-3 gap-4 pt-12 text-center text-xs text-slate-600">
                  <div className="border-t border-slate-400 pt-1">
                    <p className="font-bold">Customer's Signature</p>
                  </div>
                  <div className="border-t border-slate-400 pt-1">
                    <p className="font-bold">Prepared By</p>
                  </div>
                  <div className="border-t border-slate-400 pt-1">
                    <p className="font-bold">For Poly Cables</p>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="bg-slate-100 p-3 px-6 border-t border-slate-200 flex justify-between items-center no-print">
                <span className="text-xs text-slate-500">
                  Viewing Bill details for date <strong>{selectedSalesDate}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedBill(null)}
                  className="px-5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer"
                >
                  Back to Day Report
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
