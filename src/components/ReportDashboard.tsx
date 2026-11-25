import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { StoredBill, CollectionMR, BankDeposit, Party, Salesperson, CompanyDetails, Item, FactoryImportChallan, StockReturnChallan, DeliveryChallan, FinancialYearClosing, AuthUser, BranchLocation } from '../types';
import { defaultItems, defaultBranches } from '../data/defaultData';
import {
  filterBillsForUser,
  filterChallansForUser,
  filterSalespersonsForUser,
  filterCollectionsForUser,
  filterBranchesForUser,
  filterSalespersonsByBranch,
  isStrictSuperAdmin,
  isAccountsAdmin,
  isSuperAdminOrAgm,
  isAnyAdmin,
  isInCharge,
  hasBranchWideAccess,
  getUserBranch,
  getUserLoginFilters,
  cleanBranchName,
  findPartyForBill,
  isMarketingOfficer
} from '../utils/branchAccess';
import { Printer, Search, Calendar, Building2, Users, Landmark, Wallet, DollarSign, BarChart3, Filter, FileSpreadsheet, Download, RefreshCw, ChevronDown, ChevronRight, ChevronLeft, ArrowLeft, X, Package, ArrowUpRight, TrendingUp, Coins, Receipt, Building, PieChart, Award, Plus, Trash2, Eye, Truck, Lock, CheckCircle2, ShieldCheck, Sparkles, Check, UserCheck, RotateCcw, Clock, Layers, Edit3 } from 'lucide-react';
import { formatDateDDMMYY, parseDateToISO, getLastDateOfYearFromDate } from '../utils/dateUtils';
import { matchesFlexibleSearch, groupItemsByCategoryOrder } from '../utils/searchHelper';
import { getAllCategories } from '../utils/categoryHelper';
import { YearlyClosingModal } from './YearlyClosingModal';
import { BillPrintPreviewModal } from './BillPrintPreviewModal';
import { EditCollectionMrModalDialog } from './ExpenseManager';
import { PolyCablesLogo } from './PolyCablesLogo';
import { SalesCenterSearchFilter } from './SalesCenterSearchFilter';
import { BankLogoBadge, getBankAndAccountShortTag, resolveFullBankName, resolveFullAccountName } from './BankAndAccountDirectory';

import { recordDeletedEntityId, getGlobalDeletedIds, getClientSyncId } from '../utils/deletedTracker';
import { isSameSalesCenterForDepositMatch, matchesMrTokenExact } from '../utils/mrNumberHelper';
import { useAutoPrintOnOpen } from '../hooks/useAutoPrintOnOpen';
import { StandardPeriodFilterBar } from './StandardPeriodFilterBar';
import { StandardPeriodPreset, calculatePeriodDates } from '../utils/standardPeriodHelper';

// Helper to check if a collection is cash
export const isCashCollectionRecord = (c: CollectionMR | undefined | null): boolean => {
  if (!c) return false;
  if (c.paymentType === 'cash') return true;
  if (c.paymentType === 'cheque') return false;
  if (c.chequeNo && c.chequeNo.trim()) return false;
  if (c.bankName && c.bankName.trim() && !c.bankName.toLowerCase().includes('cash')) return false;
  return true;
};

// Helper to identify Year-End Settlement Payment collection records
export const isYearEndSettlementCollection = (c: CollectionMR | undefined | null): boolean => {
  if (!c) return false;
  if (c.isYearClosingCollection) return true;
  const rem = (c.remarks || '').toLowerCase();
  if (
    rem.includes('year-end settlement') ||
    rem.includes('year-end closing') ||
    rem.includes('closing settlement') ||
    rem.includes('settlement payment') ||
    rem.includes('fy 2026 year-end') ||
    rem.includes('fy 2025 year-end') ||
    rem.includes('fy 2027 year-end') ||
    rem.includes('fy 2026') ||
    rem.includes('fy 2025') ||
    rem.includes('fy 2027') ||
    rem.startsWith('fy ') ||
    rem.startsWith('fy-')
  ) {
    return true;
  }
  const mr = (c.mrNo || '').toLowerCase();
  if (mr.startsWith('mr-close') || mr.startsWith('ye-close') || mr.includes('close-')) {
    return true;
  }
  return false;
};

export type ReportTabType = 'customer_wise_sales_collection' | 'office_report' | 'party_bank_details' | 'special_bank_cash' | 'bill_wise_sales' | 'executive_dashboard';

interface ReportDashboardProps {
  storedBills: StoredBill[];
  collections: CollectionMR[];
  bankDeposits: BankDeposit[];
  parties: Party[];
  salespersons: Salesperson[];
  company: CompanyDetails;
  items?: Item[];
  deliveryChallans?: DeliveryChallan[];
  branches?: BranchLocation[];
  factoryImports?: FactoryImportChallan[];
  stockReturns?: StockReturnChallan[];
  selectedPartyId?: string;
  reportSubTab?: ReportTabType;
  initialStatementViewMode?: 'unified' | 'grouped';
  currentUser?: AuthUser | null;
  financialYearClosings?: FinancialYearClosing[];
  onSaveClosing?: (closing: FinancialYearClosing, updatedParties: Party[]) => void;
  onReopenClosing?: (closingId: string) => void;
  onDeleteClosing?: (closingId: string) => void;
  onUpdateClosing?: (updatedClosing: FinancialYearClosing) => void;
  onBack?: () => void;
  onClose?: () => void;
  onLoadBill?: (bill: StoredBill) => void;
  setCollections?: React.Dispatch<React.SetStateAction<CollectionMR[]>>;
  bankList?: string[];
  onSyncCloud?: (dataSlice: Record<string, any>, immediate?: boolean) => void;
}

export const ReportDashboard: React.FC<ReportDashboardProps> = ({
  storedBills: rawStoredBills,
  collections: rawCollections,
  bankDeposits,
  parties,
  salespersons,
  company,
  items = [],
  deliveryChallans = [],
  branches = defaultBranches,
  factoryImports = [],
  stockReturns = [],
  selectedPartyId,
  reportSubTab,
  initialStatementViewMode,
  currentUser,
  financialYearClosings = [],
  onSaveClosing,
  onReopenClosing,
  onDeleteClosing,
  onUpdateClosing,
  onBack,
  onClose,
  onLoadBill,
  setCollections,
  bankList = [],
  onSyncCloud
}) => {
  const rawBranchesList = branches && branches.length > 0 ? branches : defaultBranches;
  const effectiveBranches = useMemo(
    () => filterBranchesForUser(rawBranchesList, currentUser, salespersons),
    [rawBranchesList, currentUser, salespersons]
  );
  const isSuperOrAccounts = isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser);

  // 1. Strictly isolate bills for the current user and sales center (Exclude draft bills and cross-branch data)
  const storedBills = useMemo(() => {
    const nonDraftBills = (rawStoredBills || []).filter((b) => !b.isDraft && !b.header?.isDraft && b.status !== 'draft');
    return filterBillsForUser(nonDraftBills, currentUser, salespersons, effectiveBranches, parties);
  }, [rawStoredBills, currentUser, salespersons, effectiveBranches, parties]);

  // 2. Strictly isolate delivery challans for the current user and sales center
  const effectiveDeliveryChallans = useMemo(() => {
    return filterChallansForUser(deliveryChallans, currentUser, salespersons, effectiveBranches, parties);
  }, [deliveryChallans, currentUser, salespersons, effectiveBranches, parties]);

  // 3. Strictly isolate salespersons list for the current user and sales center
  const visibleSalespersons = useMemo(() => {
    return filterSalespersonsForUser(salespersons, currentUser, effectiveBranches);
  }, [salespersons, currentUser, effectiveBranches]);
  const visibleMarketingOfficers = useMemo(
    () => visibleSalespersons.filter(isMarketingOfficer),
    [visibleSalespersons]
  );

  // 4. Strictly isolate collections for the current user and sales center
  const collections = useMemo(() => {
    return filterCollectionsForUser(rawCollections || [], currentUser, salespersons, effectiveBranches, parties);
  }, [rawCollections, currentUser, salespersons, effectiveBranches, parties]);

  const isSuvroAdmin = currentUser?.username?.toLowerCase() === 'suvroadmin';
  const isAdmin =
    currentUser?.role === 'admin' ||
    currentUser?.username?.toLowerCase().includes('admin') ||
    currentUser?.username?.toLowerCase() === 'suvroadmin';

  const [showClosingModal, setShowClosingModal] = useState(false);
  const [closingModalDefaultTab, setClosingModalDefaultTab] = useState<'single_party' | 'history'>('history');
  const [activeClosingParty, setActiveClosingParty] = useState<Party | null>(null);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<string>(() => {
    try {
      return sessionStorage.getItem('polycables_report_fy') || 'current';
    } catch {
      return 'current';
    }
  });

  const [activeReportTab, setActiveReportTab] = useState<ReportTabType>(
    reportSubTab || 'customer_wise_sales_collection'
  );

  useEffect(() => {
    if (reportSubTab) {
      setActiveReportTab(reportSubTab);
      if (reportSubTab !== 'customer_wise_sales_collection') {
        setSelectedCustomer('All');
      }
    }
  }, [reportSubTab]);
  const [statementViewMode, setStatementViewMode] = useState<'unified' | 'grouped'>(() => {
    if (initialStatementViewMode) return initialStatementViewMode;
    return selectedPartyId ? 'grouped' : 'unified';
  });

  useEffect(() => {
    if (initialStatementViewMode) {
      setStatementViewMode(initialStatementViewMode);
    }
  }, [initialStatementViewMode]);

  // Office Report Month & Filter States
  const [selectedOfficeMonth, setSelectedOfficeMonth] = useState<string>(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mm}`;
  });
  const [officeSearchTerm, setOfficeSearchTerm] = useState<string>('');
  const [officeMarketingFilter, setOfficeMarketingFilter] = useState<string>('All');
  const [officePartyViewFilter, setOfficePartyViewFilter] = useState<'all' | 'active_only' | 'sales_only' | 'collection_only'>('all');

  // Month date range calculations for Office Report
  const {
    officeMonthStartIso,
    officeMonthEndIso,
    officeMonthStartDateDDMMYY,
    officeMonthEndDateDDMMYY,
    officeMonthLabel,
    prevMonthEndDateIso,
    prevMonthLabel,
    firstDateOfThisMonthDDMMYY
  } = useMemo(() => {
    const [yStr, mStr] = (selectedOfficeMonth || '2026-08').split('-');
    const year = parseInt(yStr, 10) || new Date().getFullYear();
    const month = parseInt(mStr, 10) || (new Date().getMonth() + 1); // 1-indexed

    const startDateObj = new Date(year, month - 1, 1);
    const endDateObj = new Date(year, month, 0); // last day of month
    const prevMonthEndObj = new Date(year, month - 1, 0); // last day of previous month

    const startIso = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDayNum = endDateObj.getDate();
    const endIso = `${year}-${String(month).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;

    const prevM = prevMonthEndObj.getMonth() + 1;
    const prevY = prevMonthEndObj.getFullYear();
    const prevLastDay = prevMonthEndObj.getDate();
    const prevStartIso = `${prevY}-${String(prevM).padStart(2, '0')}-01`;
    const prevEndIso = `${prevY}-${String(prevM).padStart(2, '0')}-${String(prevLastDay).padStart(2, '0')}`;

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const officeMonthLabel = `${monthNames[month - 1]} ${year}`;
    const prevMonthLabel = `${monthNames[prevM - 1]} ${prevY}`;

    const officeMonthStartDateDDMMYY = formatDateDDMMYY(startDateObj);
    const officeMonthEndDateDDMMYY = formatDateDDMMYY(endDateObj);
    const firstDateOfThisMonthDDMMYY = formatDateDDMMYY(startDateObj);

    return {
      officeMonthStartIso: startIso,
      officeMonthEndIso: endIso,
      officeMonthStartDateDDMMYY,
      officeMonthEndDateDDMMYY,
      officeMonthLabel,
      prevMonthStartIso: prevStartIso,
      prevMonthEndDateIso: prevEndIso,
      prevMonthLabel,
      firstDateOfThisMonthDDMMYY
    };
  }, [selectedOfficeMonth]);

  const [statementSortBy, setStatementSortBy] = useState<'marketing' | 'date' | 'party' | 'address' | 'billNo' | 'billAmount' | 'lessDiscount' | 'netAmount' | 'amount' | 'collection' | 'remarks' | 'coils'>(() => {
    try {
      const saved = localStorage.getItem('polycables_report_statement_sort');
      if (saved && ['marketing', 'date', 'party', 'address', 'billNo', 'billAmount', 'lessDiscount', 'netAmount', 'amount', 'collection', 'remarks', 'coils'].includes(saved)) {
        return saved as any;
      }
    } catch {}
    return 'date';
  });
  const [statementSortDir, setStatementSortDir] = useState<'asc' | 'desc'>(() => {
    try {
      const saved = localStorage.getItem('polycables_report_statement_sort_dir');
      if (saved === 'asc' || saved === 'desc') return saved;
    } catch {}
    return 'asc';
  });

  const toggleStatementSort = (field: 'marketing' | 'date' | 'party' | 'address' | 'billNo' | 'billAmount' | 'lessDiscount' | 'netAmount' | 'amount' | 'collection' | 'remarks' | 'coils') => {
    if (statementSortBy === field) {
      setStatementSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setStatementSortBy(field);
      setStatementSortDir('asc');
    }
  };

  const [customerSummarySortBy, setCustomerSummarySortBy] = useState<'name' | 'salesperson' | 'openingBalance' | 'totalSales' | 'totalCollections' | 'closingBalance'>('name');
  const [customerSummarySortDir, setCustomerSummarySortDir] = useState<'asc' | 'desc'>('asc');

  const toggleCustomerSummarySort = (field: 'name' | 'salesperson' | 'openingBalance' | 'totalSales' | 'totalCollections' | 'closingBalance') => {
    if (customerSummarySortBy === field) {
      setCustomerSummarySortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setCustomerSummarySortBy(field);
      setCustomerSummarySortDir('asc');
    }
  };

  const [officeSortBy, setOfficeSortBy] = useState<'name' | 'openingBalance' | 'totalSales' | 'totalCollection' | 'balance'>('name');
  const [officeSortDir, setOfficeSortDir] = useState<'asc' | 'desc'>('asc');

  const toggleOfficeSort = (field: 'name' | 'openingBalance' | 'totalSales' | 'totalCollection' | 'balance') => {
    if (officeSortBy === field) {
      setOfficeSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setOfficeSortBy(field);
      setOfficeSortDir('asc');
    }
  };

  const [bankDetailSortBy, setBankDetailSortBy] = useState<'date' | 'bankName' | 'partyName' | 'address' | 'amount'>('date');
  const [bankDetailSortDir, setBankDetailSortDir] = useState<'asc' | 'desc'>('asc');
  const [bankSummaryDateSortDir, setBankSummaryDateSortDir] = useState<'asc' | 'desc'>('asc');
  const [cashReceivedDateSortDir, setCashReceivedDateSortDir] = useState<'asc' | 'desc'>('asc');

  const toggleBankSummaryDateSort = () => {
    setBankSummaryDateSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  const toggleCashReceivedDateSort = () => {
    setCashReceivedDateSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  const toggleBankDetailSort = (field: 'date' | 'bankName' | 'partyName' | 'address' | 'amount') => {
    if (bankDetailSortBy === field) {
      setBankDetailSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setBankDetailSortBy(field);
      setBankDetailSortDir('asc');
    }
  };

  const [itemSortBy, setItemSortBy] = useState<'name' | 'sizeSpec' | 'rate' | 'stock'>('name');
  const [itemSortDir, setItemSortDir] = useState<'asc' | 'desc'>('asc');

  const toggleItemSort = (field: 'name' | 'sizeSpec' | 'rate' | 'stock') => {
    if (itemSortBy === field) {
      setItemSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setItemSortBy(field);
      setItemSortDir('asc');
    }
  };

  const [feedSortBy, setFeedSortBy] = useState<'date' | 'type' | 'refNo' | 'partyName' | 'saleAmount' | 'collectionAmount'>('date');
  const [feedSortDir, setFeedSortDir] = useState<'asc' | 'desc'>('asc');

  const toggleFeedSort = (field: 'date' | 'type' | 'refNo' | 'partyName' | 'saleAmount' | 'collectionAmount') => {
    if (feedSortBy === field) {
      setFeedSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setFeedSortBy(field);
      setFeedSortDir('asc');
    }
  };

  const [billWiseSortBy, setBillWiseSortBy] = useState<'date' | 'billNo' | 'partyName' | 'address' | 'salesperson' | 'billAmount'>('date');
  const [billWiseSortDir, setBillWiseSortDir] = useState<'asc' | 'desc'>('asc');

  const toggleBillWiseSort = (field: 'date' | 'billNo' | 'partyName' | 'address' | 'salesperson' | 'billAmount') => {
    if (billWiseSortBy === field) {
      setBillWiseSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setBillWiseSortBy(field);
      setBillWiseSortDir('asc');
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem('polycables_report_statement_sort', statementSortBy);
    } catch {}
  }, [statementSortBy]);

  useEffect(() => {
    try {
      localStorage.setItem('polycables_report_statement_sort_dir', statementSortDir);
    } catch {}
  }, [statementSortDir]);

  // Filter States
  // Active Items filter (inactive items are hidden from reports)
  const activeItems = (items || []).filter(i => i.isActive !== false);

  const userBranchInfo = useMemo(() => getUserBranch(currentUser, salespersons, effectiveBranches), [currentUser, salespersons, effectiveBranches]);
  const userLoginFilters = useMemo(() => getUserLoginFilters(currentUser, salespersons, effectiveBranches), [currentUser, salespersons, effectiveBranches]);
  const defaultCenterName = effectiveBranches[0]?.name || 'All';

  const [selectedMarketingPerson, setSelectedMarketingPerson] = useState<string>(() => {
    if (selectedPartyId) return 'All';
    const init = getUserLoginFilters(currentUser, salespersons, effectiveBranches);
    if (init.salesmanName) return init.salesmanName;
    if (visibleMarketingOfficers.length === 1 && !isSuperAdminOrAgm(currentUser) && !hasBranchWideAccess(currentUser, salespersons, effectiveBranches)) {
      return visibleMarketingOfficers[0].name;
    }
    try {
      const saved = localStorage.getItem('polycables_report_marketing_person');
      if (saved) return saved;
    } catch {}
    return 'All';
  });

  useEffect(() => {
    try {
      localStorage.setItem('polycables_report_marketing_person', selectedMarketingPerson);
    } catch {}
  }, [selectedMarketingPerson]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>(() => {
    if (selectedPartyId) {
      const p = parties.find((item) => item.id === selectedPartyId);
      if (p) return p.name;
    }
    return 'All';
  });
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'All' | 'Showroom' | 'Office' | 'Collection'>('All');
  const isAdminUserRole =
    isStrictSuperAdmin(currentUser) ||
    isAccountsAdmin(currentUser) ||
    isSuperAdminOrAgm(currentUser) ||
    isAnyAdmin(currentUser);

  const [selectedEntity, setSelectedEntity] = useState<string>(() => {
    if (isAdminUserRole) return 'All';
    const init = getUserLoginFilters(currentUser, salespersons, effectiveBranches);
    if (init.branchName) return init.branchName;
    return 'All';
  });

  useEffect(() => {
    if (isAdminUserRole) {
      setSelectedEntity('All');
    } else if (userLoginFilters.branchName) {
      setSelectedEntity(userLoginFilters.branchName);
    } else if (userBranchInfo?.branchName) {
      setSelectedEntity(userBranchInfo.branchName);
    }
    if (userLoginFilters.salesmanName) {
      setSelectedMarketingPerson(userLoginFilters.salesmanName);
    } else if (isAdminUserRole) {
      setSelectedMarketingPerson('All');
    }
  }, [currentUser, isAdminUserRole]);

  // Cascading Filter: Filter marketing officers strictly by selected Sales Center (selectedEntity)
  const centerFilteredSalespersons = useMemo(() => {
    return filterSalespersonsByBranch(visibleMarketingOfficers, selectedEntity, effectiveBranches, currentUser);
  }, [visibleMarketingOfficers, selectedEntity, effectiveBranches, currentUser]);

  // Helper to check if a party belongs to the currently selected Sales Center (selectedEntity)
  const doesPartyBelongToSelectedCenter = useCallback((p: Party, targetCenter: string): boolean => {
    if (!targetCenter || targetCenter === 'All') return true;
    const target = cleanBranchName(targetCenter).toLowerCase().trim();
    const targetBranchObj = effectiveBranches.find(
      (b) => cleanBranchName(b.name).toLowerCase().trim() === target || b.id.toLowerCase() === target
    );
    const targetBranchId = targetBranchObj?.id.toLowerCase();
    const centerSpCodes = new Set(
      centerFilteredSalespersons.map((s) => (s.code || '').trim().toLowerCase()).filter(Boolean)
    );
    const centerSpNames = new Set(
      centerFilteredSalespersons.map((s) => (s.name || '').trim().toLowerCase()).filter(Boolean)
    );

    const pBranchId = (p.branchId || '').trim().toLowerCase();
    const pBranch = cleanBranchName((p as any).branchName || (p as any).branch || '').toLowerCase().trim();

    if (targetBranchId && pBranchId) {
      return pBranchId === targetBranchId;
    }
    if (pBranch && ((p as any).branchName || (p as any).branch)) {
      if (target && (pBranch.includes(target) || target.includes(pBranch))) return true;
      return false;
    }
    if (p.salesmanCode && centerSpCodes.has(p.salesmanCode.trim().toLowerCase())) return true;
    if (p.salespersonName && centerSpNames.has(p.salespersonName.trim().toLowerCase())) return true;

    // Check if the party has any explicit bill, collection, or challan under this sales center
    const pNameLower = (p.name || '').trim().toLowerCase();
    if (pNameLower) {
      const hasBillInCenter = (storedBills || []).some((b) => {
        if ((b.header?.partyName || '').trim().toLowerCase() !== pNameLower) return false;
        const bBrId = (b.header?.branchId || b.branchId || '').trim().toLowerCase();
        const bBrName = cleanBranchName(b.header?.branchName || (b as any).branchName || '').toLowerCase().trim();
        if (targetBranchId && bBrId === targetBranchId) return true;
        if ((b.header?.branchName || (b as any).branchName) && target && (bBrName.includes(target) || target.includes(bBrName))) return true;
        return false;
      });
      if (hasBillInCenter) return true;

      const hasColInCenter = (collections || []).some((c) => {
        if ((c.partyName || '').trim().toLowerCase() !== pNameLower) return false;
        const cBrName = cleanBranchName(c.branchName || c.entityName || '').toLowerCase().trim();
        if ((c.branchName || c.entityName) && target && (cBrName.includes(target) || target.includes(cBrName))) return true;
        return false;
      });
      if (hasColInCenter) return true;
    }

    if (target.includes('madhupur') && !pBranchId && !(p as any).branchName && !(p as any).branch && !p.salesmanCode) {
      return true;
    }
    return false;
  }, [effectiveBranches, centerFilteredSalespersons, storedBills, collections]);

  // Cascading Filter: Filter parties strictly by selected Sales Center AND selected Marketing Officer
  const filteredPartiesForDropdown = useMemo(() => {
    let list = parties;
    if (selectedEntity && selectedEntity !== 'All') {
      list = list.filter((p) => doesPartyBelongToSelectedCenter(p, selectedEntity));
    }
    if (selectedMarketingPerson && selectedMarketingPerson !== 'All') {
      const spLower = selectedMarketingPerson.trim().toLowerCase();
      const spObj = visibleMarketingOfficers.find(
        (s) => s.name.trim().toLowerCase() === spLower || (s.code && s.code.toLowerCase() === spLower)
      );
      const spCodeLower = (spObj?.code || '').toLowerCase();

      list = list.filter((p) => {
        const pSpName = (p.salespersonName || '').trim().toLowerCase();
        const pSpCode = (p.salesmanCode || '').trim().toLowerCase();
        return (
          pSpName === spLower ||
          (spCodeLower && pSpCode === spCodeLower) ||
          pSpCode === spLower
        );
      });
    }
    return list;
  }, [parties, selectedMarketingPerson, selectedEntity, visibleMarketingOfficers, doesPartyBelongToSelectedCenter]);

  // Auto-reset selectedMarketingPerson if not in centerFilteredSalespersons
  useEffect(() => {
    if (selectedMarketingPerson !== 'All') {
      const stillValid = centerFilteredSalespersons.some(
        (sp) => sp.name.trim().toLowerCase() === selectedMarketingPerson.trim().toLowerCase()
      );
      if (!stillValid) {
        setSelectedMarketingPerson('All');
      }
    }
  }, [centerFilteredSalespersons, selectedMarketingPerson]);

  // Auto-reset selectedCustomer if not in filteredPartiesForDropdown (only when not viewing a specifically requested party)
  useEffect(() => {
    if (selectedPartyId) return;
    if (selectedCustomer !== 'All') {
      const stillValid = filteredPartiesForDropdown.some(
        (p) => p.name.trim().toLowerCase() === selectedCustomer.trim().toLowerCase()
      );
      if (!stillValid) {
        setSelectedCustomer('All');
      }
    }
  }, [filteredPartiesForDropdown, selectedCustomer, selectedPartyId]);

  // Pre-calculate party name counts to disambiguate duplicate party names with address
  const partyNameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    (parties || []).forEach((p) => {
      const lower = (p.name || '').trim().toLowerCase();
      if (lower) counts.set(lower, (counts.get(lower) || 0) + 1);
    });
    return counts;
  }, [parties]);

  const getPartyDisplayWithAddress = (name: string, fallbackAddress?: string): string => {
    if (!name) return '';
    const key = name.trim().toLowerCase();
    const isDup = (partyNameCounts.get(key) || 0) > 1;
    if (isDup) {
      if (fallbackAddress && fallbackAddress.trim()) {
        return `${name}, ${fallbackAddress.trim()}`;
      }
      const matched = (parties || []).find((p) => (p.name || '').trim().toLowerCase() === key && p.address?.trim());
      if (matched?.address) {
        return `${name}, ${matched.address.trim()}`;
      }
    }
    return name;
  };

  const effectiveBankCashCenterName = useMemo(() => {
    if (selectedEntity && selectedEntity !== 'All' && selectedEntity.toLowerCase() !== 'all') {
      return selectedEntity;
    }
    return 'All Sales Centers';
  }, [selectedEntity]);

  // Current selected branch object for dynamic address, phone, and title
  const currentSelectedBranch = useMemo(() => {
    if (!selectedEntity || selectedEntity === 'All' || selectedEntity.toLowerCase() === 'all') return null;
    const cleanTarget = cleanBranchName(selectedEntity).toLowerCase().trim();
    return (
      effectiveBranches.find(
        (b) =>
          b.name.toLowerCase().trim() === selectedEntity.toLowerCase().trim() ||
          cleanBranchName(b.name).toLowerCase().trim() === cleanTarget ||
          b.id.toLowerCase() === selectedEntity.toLowerCase()
      ) || null
    );
  }, [selectedEntity, effectiveBranches]);

  const reportHeaderCenterName = useMemo(() => {
    if (!selectedEntity || selectedEntity === 'All' || selectedEntity.toLowerCase() === 'all') {
      return 'All Sales Centers';
    }
    return currentSelectedBranch?.name || selectedEntity;
  }, [selectedEntity, currentSelectedBranch]);

  const reportHeaderAddress = useMemo(() => {
    if (!selectedEntity || selectedEntity === 'All' || selectedEntity.toLowerCase() === 'all') {
      return '';
    }
    return currentSelectedBranch?.address || company?.address || 'Holding No. 392, Shop No. 3, Sanjoy Smrity Market, Raypara, Madhupur, Tangail.';
  }, [selectedEntity, currentSelectedBranch, company?.address]);

  const reportHeaderPhone = useMemo(() => {
    if (!selectedEntity || selectedEntity === 'All' || selectedEntity.toLowerCase() === 'all') {
      return '';
    }
    return currentSelectedBranch?.phone || currentSelectedBranch?.inChargePhone || company?.phone || '01713-434290';
  }, [selectedEntity, currentSelectedBranch, company?.phone]);

  const matchesEntity = useCallback(
    (
      recordEntity?: string,
      recordBranch?: string,
      targetEntity?: string,
      salesmanCode?: string,
      partyName?: string
    ) => {
      if (!targetEntity || targetEntity === 'All' || targetEntity.toLowerCase() === 'all') return true;
      const target = targetEntity.toLowerCase().trim();
      const cleanTarget = cleanBranchName(targetEntity).toLowerCase().trim();
      const recEnt = (recordEntity || '').toLowerCase().trim();
      const recBr = (recordBranch || '').toLowerCase().trim();
      const cleanRecEnt = cleanBranchName(recordEntity).toLowerCase().trim();
      const cleanRecBr = cleanBranchName(recordBranch).toLowerCase().trim();

      // Direct name or ID equality (raw and cleaned)
      if (
        recEnt === target ||
        recBr === target ||
        cleanRecEnt === cleanTarget ||
        cleanRecBr === cleanTarget ||
        (cleanRecEnt && (cleanRecEnt.includes(cleanTarget) || cleanTarget.includes(cleanRecEnt))) ||
        (cleanRecBr && (cleanRecBr.includes(cleanTarget) || cleanTarget.includes(cleanRecBr))) ||
        (recEnt && (recEnt.includes(target) || target.includes(recEnt))) ||
        (recBr && (recBr.includes(target) || target.includes(recBr)))
      ) {
        return true;
      }

      // Match target against effective branches
      const targetBranchObj = effectiveBranches.find(
        (b) =>
          b.name.toLowerCase().trim() === target ||
          b.id.toLowerCase().trim() === target ||
          cleanBranchName(b.name).toLowerCase().trim() === cleanTarget ||
          b.id.toLowerCase().trim() === cleanTarget
      );
      if (targetBranchObj) {
        const targetId = targetBranchObj.id.toLowerCase();
        const targetName = targetBranchObj.name.toLowerCase().trim();
        const cleanName = cleanBranchName(targetBranchObj.name).toLowerCase().trim();
        if (recBr === targetId || recEnt === targetId) return true;
        if (recBr === targetName || recEnt === targetName) return true;
        if (cleanRecBr === cleanName || cleanRecEnt === cleanName) return true;
      }

      // Match salesperson's branch
      if (salesmanCode) {
        const sp = salespersons.find(
          (s) =>
            (s.code || '').toLowerCase() === salesmanCode.toLowerCase() ||
            (s.name || '').toLowerCase() === salesmanCode.toLowerCase()
        );
        if (sp) {
          const spBranch = cleanBranchName(sp.branchName || sp.branch || '').toLowerCase();
          const spBranchId = (sp.branchId || '').toLowerCase();
          if (spBranch && (spBranch.includes(cleanTarget) || cleanTarget.includes(spBranch))) return true;
          if (targetBranchObj && spBranchId === targetBranchObj.id.toLowerCase()) return true;
        }
      }

      // Match party's branch
      if (partyName) {
        const p = parties.find((item) => item.name?.toLowerCase() === partyName.toLowerCase());
        if (p) {
          const pBranch = cleanBranchName(p.branchName || (p as any).branch || '').toLowerCase();
          const pBranchId = (p.branchId || '').toLowerCase();
          if (pBranch && (pBranch.includes(cleanTarget) || cleanTarget.includes(pBranch))) return true;
          if (targetBranchObj && pBranchId === targetBranchObj.id.toLowerCase()) return true;
          if (p.salesmanCode) {
            const pSp = salespersons.find(
              (s) =>
                (s.code || '').toLowerCase() === p.salesmanCode?.toLowerCase() ||
                (s.name || '').toLowerCase() === p.salesmanCode?.toLowerCase()
            );
            if (pSp) {
              const spBranch = cleanBranchName(pSp.branchName || pSp.branch || '').toLowerCase();
              if (spBranch && (spBranch.includes(cleanTarget) || cleanTarget.includes(spBranch))) return true;
              if (targetBranchObj && (pSp.branchId || '').toLowerCase() === targetBranchObj.id.toLowerCase()) return true;
            }
          }
        }
      }

      // Keyword token fallback (e.g. madhupur, tangail, ghatail, nawabpur, dhaka)
      const getCityToken = (s: string) => {
        if (s.includes('madhupur')) return 'madhupur';
        if (s.includes('tangail')) return 'tangail';
        if (s.includes('ghatail')) return 'ghatail';
        if (s.includes('nawabpur')) return 'nawabpur';
        if (s.includes('dhaka')) return 'dhaka';
        return '';
      };
      const targetCity = getCityToken(cleanTarget || target);
      if (targetCity) {
        if (recEnt.includes(targetCity) || recBr.includes(targetCity) || cleanRecEnt.includes(targetCity) || cleanRecBr.includes(targetCity)) return true;
        if (targetCity === 'madhupur' && !recEnt && !recBr) return true;
      }

      return false;
    },
    [effectiveBranches, salespersons, parties]
  );

  const [selectedCategory, setSelectedCategory] = useState<'All' | 'Marketing' | 'Showroom' | 'Office'>('All');
  const [challanFilter, setChallanFilter] = useState<'without_challan' | 'with_challan' | 'challan_only'>('without_challan');
  
  // Default dates: sticky within session, defaulting to running year 1st date to today date
  const [periodPreset, setPeriodPreset] = useState<StandardPeriodPreset>(() => {
    try {
      const saved = sessionStorage.getItem('polycables_report_period_preset');
      if (saved) return saved as StandardPeriodPreset;
    } catch {}
    return 'this_year';
  });
  const [startDate, setStartDate] = useState<string>(() => {
    try {
      const savedPreset = sessionStorage.getItem('polycables_report_period_preset');
      const savedStart = sessionStorage.getItem('polycables_report_start_date');
      if (savedPreset === 'all') return '';
      if (savedStart !== null) return savedStart;
    } catch {}
    const now = new Date();
    return formatDateDDMMYY(new Date(now.getFullYear(), 0, 1));
  });
  const [endDate, setEndDate] = useState<string>(() => {
    try {
      const savedPreset = sessionStorage.getItem('polycables_report_period_preset');
      const savedEnd = sessionStorage.getItem('polycables_report_end_date');
      if (savedPreset === 'all') return '';
      if (savedEnd !== null) return savedEnd;
    } catch {}
    return formatDateDDMMYY(new Date());
  });

  useEffect(() => {
    try {
      sessionStorage.setItem('polycables_report_period_preset', periodPreset);
      sessionStorage.setItem('polycables_report_start_date', startDate);
      sessionStorage.setItem('polycables_report_end_date', endDate);
      sessionStorage.setItem('polycables_report_fy', selectedFiscalYear);
    } catch {}
  }, [periodPreset, startDate, endDate, selectedFiscalYear]);

  const handleSelectFiscalYear = (fyId: string) => {
    setSelectedFiscalYear(fyId);
    if (fyId === 'current') {
      const d = new Date();
      setStartDate(formatDateDDMMYY(new Date(d.getFullYear(), 0, 1)));
      setEndDate(formatDateDDMMYY(d));
      setPeriodPreset('this_year');
    } else if (fyId === 'all') {
      setStartDate('');
      setEndDate('');
      setPeriodPreset('all');
    } else {
      const matched = financialYearClosings.find((c) => c.id === fyId);
      if (matched) {
        setStartDate(formatDateDDMMYY(matched.startDate));
        setEndDate(formatDateDDMMYY(matched.endDate));
        setPeriodPreset('custom');
      }
    }
  };

  const activeClosingRecord = useMemo(() => {
    if (selectedFiscalYear === 'current' || selectedFiscalYear === 'all') return null;
    return financialYearClosings.find((c) => c.id === selectedFiscalYear) || null;
  }, [selectedFiscalYear, financialYearClosings]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [itemSearchTerm, setItemSearchTerm] = useState<string>('');
  const [previewBill, setPreviewBill] = useState<StoredBill | null>(null);
  const [editingCollection, setEditingCollection] = useState<CollectionMR | null>(null);

  const handleEditBill = (bill: StoredBill) => {
    if (onLoadBill) {
      onLoadBill(bill);
    } else {
      setPreviewBill(bill);
    }
  };

  const handleSaveEditedCollection = (updated: CollectionMR) => {
    const stampedUpdated: CollectionMR = {
      ...updated,
      updatedAt: new Date().toISOString()
    } as any;
    let nextList: CollectionMR[] = [];
    if (setCollections) {
      setCollections((prev) => {
        const next = prev.map((c) => (c.id === stampedUpdated.id ? stampedUpdated : c));
        nextList = next;
        try {
          localStorage.setItem('polycables_collections', JSON.stringify(next));
        } catch (err) {}
        return next;
      });
    } else {
      try {
        const stored = localStorage.getItem('polycables_collections');
        if (stored) {
          const arr: CollectionMR[] = JSON.parse(stored);
          const next = arr.map((c) => (c.id === stampedUpdated.id ? stampedUpdated : c));
          nextList = next;
          localStorage.setItem('polycables_collections', JSON.stringify(next));
          window.dispatchEvent(new Event('storage'));
        }
      } catch (e) {}
    }
    if (onSyncCloud && nextList.length > 0) {
      onSyncCloud({ collections: nextList }, true);
    }
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: getClientSyncId(), patch: { collections: nextList } })
    }).catch(() => {});
    setEditingCollection(null);
  };

  const handleDeleteEditedCollection = (collectionId: string) => {
    recordDeletedEntityId(collectionId);
    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: getClientSyncId(), ids: [collectionId], type: 'collection' })
    }).catch(() => {});

    let nextList: CollectionMR[] = [];
    if (setCollections) {
      setCollections((prev) => {
        const next = prev.filter((c) => c.id !== collectionId);
        nextList = next;
        try {
          localStorage.setItem('polycables_collections', JSON.stringify(next));
        } catch (err) {}
        return next;
      });
    } else {
      try {
        const stored = localStorage.getItem('polycables_collections');
        if (stored) {
          const arr: CollectionMR[] = JSON.parse(stored);
          const next = arr.filter((c) => c.id !== collectionId);
          nextList = next;
          localStorage.setItem('polycables_collections', JSON.stringify(next));
          window.dispatchEvent(new Event('storage'));
        }
      } catch (e) {}
    }
    try {
      const storedDeposits = localStorage.getItem('polycables_bank_deposits');
      if (storedDeposits) {
        const arr = JSON.parse(storedDeposits);
        if (Array.isArray(arr)) {
          const next = arr.filter((d: any) => d.collectionMrId !== collectionId);
          localStorage.setItem('polycables_bank_deposits', JSON.stringify(next));
        }
      }
    } catch (e) {}
    if (onSyncCloud) {
      onSyncCloud({ collections: nextList, deletedEntityIds: getGlobalDeletedIds() }, true);
    }
    setEditingCollection(null);
  };
  const [dashboardTheme, setDashboardTheme] = useState<'monochrome' | 'obsidian' | 'light'>('monochrome');
  const [feedTypeFilter, setFeedTypeFilter] = useState<'All' | 'Sale' | 'Collection' | 'BankDeposit'>('All');
  const [selectedItemMonth, setSelectedItemMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Live Editable Mode for Print Report
  const isLiveEditable = false;

  // Field & Font Size Customization for Print Reports
  const [reportFontSize, setReportFontSize] = useState<'9px' | '10px' | '11px' | '12px' | '14px' | '16px'>('11px');
  const [reportHeaderFontSize, setReportHeaderFontSize] = useState<'14px' | '18px' | '22px' | '26px'>('18px');
  const [reportRowPadding, setReportRowPadding] = useState<'tight' | 'medium' | 'spacious'>('medium');
  const [showFieldSizeControlBar, setShowFieldSizeControlBar] = useState<boolean>(false);

  // Column width customizations for unified table
  const [partyColWidth, setPartyColWidth] = useState<'auto' | '150px' | '200px' | '250px' | '300px'>('auto');
  const [addressColWidth, setAddressColWidth] = useState<'80px' | '100px' | '120px' | '160px' | '200px'>('100px');
  const [amountColWidth, setAmountColWidth] = useState<'80px' | '100px' | '120px' | '140px'>('100px');

  // Custom extra rows for live print customization
  const [extraUnifiedRows, setExtraUnifiedRows] = useState<Array<{
    id: string;
    date: string;
    partyName: string;
    address: string;
    billNo: string;
    billAmount: string;
    lessDiscount: string;
    netAmount: string;
    collection: string;
    remarks: string;
    coils: string;
  }>>([]);

  const [extraBankRows, setExtraBankRows] = useState<Array<{
    id: string;
    date: string;
    bankName: string;
    partyName: string;
    address: string;
    amount: string;
  }>>([]);

  const [extraCashRows, setExtraCashRows] = useState<Array<{
    id: string;
    date: string;
    partyName: string;
    address: string;
    amount: string;
  }>>([]);

  // Sync selectedPartyId only when selectedPartyId actually transitions to a different party
  const lastAppliedPartyIdRef = useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (!selectedPartyId) {
      lastAppliedPartyIdRef.current = undefined;
      return;
    }
    if (lastAppliedPartyIdRef.current === selectedPartyId) return;
    const p = parties.find((item) => item.id === selectedPartyId);
    if (p) {
      lastAppliedPartyIdRef.current = selectedPartyId;
      setSelectedCustomer(p.name);
      setStatementViewMode('grouped');
      setActiveReportTab('customer_wise_sales_collection');
      setSelectedMarketingPerson('All');
      if (isSuperAdminOrAgm(currentUser)) {
        setSelectedEntity('All');
      }
      // On initial party transition only, set default running year range
      const now = new Date();
      setStartDate(formatDateDDMMYY(new Date(now.getFullYear(), 0, 1)));
      setEndDate(formatDateDDMMYY(now));
      setPeriodPreset('this_year');
    }
  }, [selectedPartyId, parties, currentUser]);

  const printRef = useRef<HTMLDivElement>(null);

  // Quick Period Preset Handlers
  const setPeriodAll = () => {
    setPeriodPreset('all');
    setStartDate('');
    setEndDate('');
  };

  const handleSelectPeriodPreset = (preset: StandardPeriodPreset) => {
    setPeriodPreset(preset);
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
      return;
    }
    if (preset === 'custom') {
      return;
    }
    if (preset === 'this_year') {
      const now = new Date();
      setStartDate(formatDateDDMMYY(new Date(now.getFullYear(), 0, 1)));
      setEndDate(formatDateDDMMYY(now));
      return;
    }
    const range = calculatePeriodDates(preset);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  const isPresetActive = (type: StandardPeriodPreset) => {
    return periodPreset === type;
  };

  const formattedDateRange = `Date: ${formatDateDDMMYY(startDate)} to ${formatDateDDMMYY(endDate)}`;

  // Lookup helper for party address
  const getPartyAddress = (partyName?: string): string => {
    if (!partyName) return '-';
    const found = parties.find((p) => p.name.trim().toLowerCase() === partyName.trim().toLowerCase());
    return found?.address || 'Madhupur';
  };

  // Helper to format currency
  const formatAmount = (num: number) => num.toLocaleString('en-IN');

  // Identify latest closed financial year
  const latestClosedYear = useMemo(() => {
    const closed = (financialYearClosings || []).filter((c) => c.status === 'closed');
    if (closed.length === 0) return null;
    return [...closed].sort((a, b) => (parseDateToISO(b.endDate) || b.endDate).localeCompare(parseDateToISO(a.endDate) || a.endDate))[0];
  }, [financialYearClosings]);

  // Cutoff ISO date for non-admins or current active view (records on or before this date are closed)
  const closedCutoffIso = useMemo(() => {
    if (!latestClosedYear) return null;
    if (!isAdmin) return parseDateToISO(latestClosedYear.endDate);
    if (selectedFiscalYear === 'current') return parseDateToISO(latestClosedYear.endDate);
    return null;
  }, [latestClosedYear, isAdmin, selectedFiscalYear]);

  // Track specific closed transaction IDs from financialYearClosings
  const { closedBillIdSet, closedChallanIdSet, closedCollectionIdSet } = useMemo(() => {
    const bSet = new Set<string>();
    const chSet = new Set<string>();
    const cSet = new Set<string>();
    (financialYearClosings || []).forEach((c) => {
      if (c.status === 'closed') {
        (c.closedBillIds || []).forEach((id) => bSet.add(id));
        (c.closedChallanIds || []).forEach((id) => chSet.add(id));
        (c.closedCollectionIds || []).forEach((id) => cSet.add(id));
      }
    });
    return { closedBillIdSet: bSet, closedChallanIdSet: chSet, closedCollectionIdSet: cSet };
  }, [financialYearClosings]);

  // Helper to check if a bill is closed by any party's financial year closing
  const isPartyBillClosed = useCallback((bill: StoredBill): boolean => {
    if (!bill) return false;
    if (closedBillIdSet.has(bill.id)) {
      if (bill.header?.billNo?.includes('7') || bill.id?.includes('7')) {
        console.log(`[isPartyBillClosed] Bill #${bill.header?.billNo} (ID: ${bill.id}) closed via closedBillIdSet`);
      }
      return true;
    }

    const bPartyLower = (bill.header?.partyName || '').trim().toLowerCase();
    const rawDate = bill.header?.date || bill.savedAt?.substring(0, 10) || (bill as any).createdAt?.substring(0, 10) || '';
    const bDateIso = parseDateToISO(rawDate);

    for (const c of (financialYearClosings || [])) {
      if (c.status !== 'closed') continue;

      // If closing explicitly records closedBillIds array, respect the specific ID list
      if (Array.isArray(c.closedBillIds)) {
        if (c.closedBillIds.includes(bill.id)) {
          if (bill.header?.billNo?.includes('7') || bill.id?.includes('7')) {
            console.log(`[isPartyBillClosed] Bill #${bill.header?.billNo} (ID: ${bill.id}) in closing ${c.id} closedBillIds`);
          }
          return true;
        }
        // Bill was NOT in this closing's explicit closed list, so do not mark as closed by this closing
        continue;
      }

      // Legacy fallback when closedBillIds array is not recorded: strictly match party name & date <= endDate
      const cParty = (c.partyName || c.partyId || '').trim().toLowerCase();
      if (cParty && cParty === bPartyLower) {
        const cEndIso = parseDateToISO(c.endDate);
        if (cEndIso && bDateIso && bDateIso <= cEndIso) {
          if (bill.header?.billNo?.includes('7') || bill.id?.includes('7')) {
            console.log(`[isPartyBillClosed] Bill #${bill.header?.billNo} (ID: ${bill.id}) matched legacy closing ${c.id} date range`);
          }
          return true;
        }
      }
    }
    return false;
  }, [closedBillIdSet, financialYearClosings]);

  // Helper to check if a collection is closed by any party's financial year closing
  const isPartyCollectionClosed = useCallback((col: CollectionMR): boolean => {
    if (!col) return false;
    if (isYearEndSettlementCollection(col)) return true;
    if (closedCollectionIdSet.has(col.id)) return true;

    const colPartyLower = (col.partyName || col.entityName || '').trim().toLowerCase();
    const colDateIso = parseDateToISO(col.date);

    for (const c of (financialYearClosings || [])) {
      if (c.status !== 'closed') continue;

      if (Array.isArray(c.closedCollectionIds)) {
        if (c.closedCollectionIds.includes(col.id)) return true;
        continue;
      }

      const cParty = (c.partyName || c.partyId || '').trim().toLowerCase();
      if (cParty && cParty === colPartyLower) {
        const cEndIso = parseDateToISO(c.endDate);
        if (cEndIso && colDateIso && colDateIso <= cEndIso) {
          return true;
        }
      }
    }
    return false;
  }, [closedCollectionIdSet, financialYearClosings]);

  // 1. Total Cash Collections received prior to this month (up to prevMonthEndDateIso)
  const lastMonthClosingCash = useMemo(() => {
    let totalPriorCashIn = 0;
    collections.forEach((c) => {
      if (isYearEndSettlementCollection(c) && !isCashCollectionRecord(c)) return;
      const cIso = parseDateToISO(c.date);
      if (cIso && cIso <= prevMonthEndDateIso) {
        if (!c.paymentType || c.paymentType === 'cash') {
          totalPriorCashIn += Number(c.amount || 0);
        }
      }
    });

    let totalPriorCashOut = 0;
    bankDeposits.forEach((d) => {
      const dIso = parseDateToISO(d.date);
      if (dIso && dIso <= prevMonthEndDateIso) {
        totalPriorCashOut += Number(d.amount || 0);
      }
    });

    const netCash = totalPriorCashIn - totalPriorCashOut;
    return netCash > 0 ? netCash : 0;
  }, [collections, bankDeposits, prevMonthEndDateIso]);

  // Auto Deposit to H/O record on 1st date of this month
  const autoHODepositRecord = useMemo(() => {
    return {
      id: `auto-ho-deposit-${selectedOfficeMonth}`,
      date: firstDateOfThisMonthDDMMYY,
      bankName: 'H/O',
      accountName: '',
      displayTag: 'H/O',
      particulars: `Auto Cash Deposit to Head Office (H/O) [Closing cash of ${prevMonthLabel}]`,
      amount: lastMonthClosingCash,
      status: 'Auto Deposited',
      depositDate: firstDateOfThisMonthDDMMYY,
      paymentType: 'cash'
    };
  }, [lastMonthClosingCash, selectedOfficeMonth, firstDateOfThisMonthDDMMYY, prevMonthLabel]);

  // Helper to check if a collection MR has been deposited into the bank
  const isCollectionDeposited = useCallback((col: CollectionMR, depositBeforeIso?: string): boolean => {
    if (!col) return false;
    if (col.isDeposited === true) {
      if (depositBeforeIso && col.depositDate) {
        const depIso = parseDateToISO(col.depositDate);
        if (depIso && depIso >= depositBeforeIso) return false;
      }
      return true;
    }
    if (col.bankDepositId) {
      const match = bankDeposits.find((d) => d.id === col.bankDepositId);
      if (match) {
        if (depositBeforeIso) {
          const depIso = parseDateToISO(match.date);
          if (depIso && depIso >= depositBeforeIso) return false;
        }
        return true;
      }
    }
    const matchByColId = bankDeposits.find((d) => d.collectionMrId === col.id);
    if (matchByColId) {
      if (depositBeforeIso) {
        const depIso = parseDateToISO(matchByColId.date);
        if (depIso && depIso >= depositBeforeIso) return false;
      }
      return true;
    }
    if (col.depositDate || col.depositBankTag) {
      if (depositBeforeIso && col.depositDate) {
        const depIso = parseDateToISO(col.depositDate);
        if (depIso && depIso >= depositBeforeIso) return false;
      }
      return true;
    }
    const colMrNo = (col.mrNo || '').trim().toLowerCase();
    if (colMrNo && colMrNo !== '-' && colMrNo !== 'n/a' && colMrNo.length >= 3) {
      const matchByMr = bankDeposits.find((d) => {
        if (!isSameSalesCenterForDepositMatch(col, d, effectiveBranches, parties, salespersons)) {
          return false;
        }
        return matchesMrTokenExact(d.remarks, col.mrNo) || matchesMrTokenExact(d.voucherNo, col.mrNo);
      });
      if (matchByMr) {
        if (depositBeforeIso) {
          const depIso = parseDateToISO(matchByMr.date);
          if (depIso && depIso >= depositBeforeIso) return false;
        }
        return true;
      }
    }
    const colParty = (col.partyName || '').trim().toLowerCase();
    if (colParty && col.amount) {
      const matchByPartyAndAmount = bankDeposits.find((d) => {
        if (!isSameSalesCenterForDepositMatch(col, d, effectiveBranches, parties, salespersons)) {
          return false;
        }
        const dParty = ((d.customerName || d.partyName) || '').trim().toLowerCase();
        if ((dParty === colParty || dParty.includes(colParty) || colParty.includes(dParty)) && Number(d.amount) === Number(col.amount)) {
          if (d.date === col.date || (d.remarks && d.remarks.toLowerCase().includes('cash'))) {
            return true;
          }
        }
        return false;
      });
      if (matchByPartyAndAmount) {
        if (depositBeforeIso) {
          const depIso = parseDateToISO(matchByPartyAndAmount.date);
          if (depIso && depIso >= depositBeforeIso) return false;
        }
        return true;
      }
    }
    return false;
  }, [bankDeposits, effectiveBranches, parties, salespersons]);

  // Office Party-wise Sales and Collections based on global and page filters
  const officePartyReportData = useMemo(() => {
    let targetParties = [...parties];

    if (selectedEntity && selectedEntity !== 'All') {
      targetParties = targetParties.filter((p) => doesPartyBelongToSelectedCenter(p, selectedEntity));
    }

    const activeMarketing = selectedMarketingPerson !== 'All' ? selectedMarketingPerson : officeMarketingFilter;
    if (activeMarketing !== 'All') {
      targetParties = targetParties.filter((p) => {
        const spName = p.salespersonName || '';
        const spCode = p.salesmanCode || '';
        return (
          spName.trim().toLowerCase() === activeMarketing.trim().toLowerCase() ||
          spCode.trim().toLowerCase() === activeMarketing.trim().toLowerCase()
        );
      });
    }

    if (selectedCustomer !== 'All') {
      targetParties = targetParties.filter((p) => {
        return p.name.trim().toLowerCase() === selectedCustomer.trim().toLowerCase();
      });
    }

    const effectiveStartIso = parseDateToISO(startDate) || officeMonthStartIso;
    const effectiveEndIso = parseDateToISO(endDate) || officeMonthEndIso;
    
    // Derive previous month boundary (1st of prev month to end of prev month)
    const dtForPrev = new Date(effectiveStartIso || new Date().toISOString().substring(0, 10));
    const prevYear = dtForPrev.getMonth() === 0 ? dtForPrev.getFullYear() - 1 : dtForPrev.getFullYear();
    const prevMonth = dtForPrev.getMonth() === 0 ? 12 : dtForPrev.getMonth();
    const prevMonthStartIso = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
    const lastDayPrevMonth = new Date(prevYear, prevMonth, 0).getDate();
    const prevMonthEndIso = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDayPrevMonth).padStart(2, '0')}`;

    const rows = targetParties.map((party) => {
      const pNameLower = party.name.trim().toLowerCase();

      // 1. Prior sales before effectiveStartIso (unclosed)
      let priorSales = 0;
      storedBills.forEach((b) => {
        if (isPartyBillClosed(b)) return;
        const bParty = (b.header?.partyName || '').trim().toLowerCase();
        if (bParty !== pNameLower) return;
        if (selectedEntity && selectedEntity !== 'All') {
          if (!matchesEntity(b.header?.branchName || (b as any).branchName, b.header?.branchId || b.branchId, selectedEntity, b.header?.salesmanCode || party.salesmanCode, b.header?.partyName)) return;
        }
        const isOffice = Boolean(b.isOfficeBill || b.header?.isOfficeBill);
        if (selectedTypeFilter === 'Office' && !isOffice) return;
        if (selectedTypeFilter === 'Showroom' && isOffice) return;
        if (selectedTypeFilter === 'Collection') return;
        const bDateIso = parseDateToISO(b.header?.date || b.savedAt.substring(0, 10));
        if (bDateIso && bDateIso < effectiveStartIso) {
          priorSales += Number(b.grandTotal || 0);
        }
      });

      // 2. Prior Collections before effectiveStartIso (unclosed)
      let priorBankCol = 0;
      let priorCashColBeforePrev = 0;
      let prevMonthUndepositedCashCol = 0;
      let priorPrevMonthDepositedCashCol = 0;

      if (selectedTypeFilter !== 'Office' && selectedTypeFilter !== 'Showroom') {
        collections.forEach((c) => {
          if (isPartyCollectionClosed(c) || isYearEndSettlementCollection(c)) return;
          const cParty = (c.partyName || '').trim().toLowerCase();
          if (cParty !== pNameLower) return;
          if (selectedEntity && selectedEntity !== 'All') {
            const colSp = (c as any).salesmanCode || party.salesmanCode;
            if (!matchesEntity(c.entityName, c.branchName, selectedEntity, colSp, c.partyName)) return;
          }
          const cDateIso = parseDateToISO(c.date);
          if (!cDateIso) return;

          const isCheque = c.paymentType === 'cheque' || (c.paymentType !== 'cash' && Boolean((c.chequeNo && c.chequeNo.trim()) || (c.bankName && c.bankName.trim() && !c.bankName.toLowerCase().includes('cash'))));
          const amt = Number(c.amount || 0);

          if (cDateIso < effectiveStartIso) {
            if (isCheque) {
              priorBankCol += amt;
            } else {
              if (cDateIso >= prevMonthStartIso && cDateIso <= prevMonthEndIso) {
                const isDepInPrev = isCollectionDeposited(c, effectiveStartIso);
                if (isDepInPrev) {
                  priorPrevMonthDepositedCashCol += amt;
                } else {
                  // Undeposited cash collection of last month -> deposited 1st date of this month to H/O!
                  // Shown on this month's collection on office statement
                  prevMonthUndepositedCashCol += amt;
                }
              } else {
                priorCashColBeforePrev += amt;
              }
            }
          }
        });
      }

      // Opening Balance: includes party opening balance + all sales before this period minus accounted collections before this period
      const initialPartyBal = Number(party.openingBalance || (party as any).initialBalance || 0);
      const openingBalance = initialPartyBal + priorSales - (priorBankCol + priorCashColBeforePrev + priorPrevMonthDepositedCashCol);

      // Period Bills for this party
      const monthlyBills = selectedTypeFilter === 'Collection' ? [] : storedBills.filter((b) => {
        if (isPartyBillClosed(b)) return false;
        const bParty = (b.header?.partyName || '').trim().toLowerCase();
        if (bParty !== pNameLower) return false;
        if (selectedEntity && selectedEntity !== 'All') {
          if (!matchesEntity(b.header?.branchName || (b as any).branchName, b.header?.branchId || b.branchId, selectedEntity, b.header?.salesmanCode || party.salesmanCode, b.header?.partyName)) return false;
        }
        const isOffice = Boolean(b.isOfficeBill || b.header?.isOfficeBill);
        if (selectedTypeFilter === 'Office' && !isOffice) return false;
        if (selectedTypeFilter === 'Showroom' && isOffice) return false;
        const bDateIso = parseDateToISO(b.header?.date || b.savedAt.substring(0, 10));
        return bDateIso && bDateIso >= effectiveStartIso && bDateIso <= effectiveEndIso;
      });

      const totalSales = monthlyBills.reduce((sum, b) => sum + Number(b.grandTotal || 0), 0);
      const billsCount = monthlyBills.length;

      // Period Collections for this party in this month
      const monthlyPartyCollections = (selectedTypeFilter === 'Office' || selectedTypeFilter === 'Showroom') ? [] : collections.filter((c) => {
        if (isPartyCollectionClosed(c) || isYearEndSettlementCollection(c)) return false;
        const cParty = (c.partyName || '').trim().toLowerCase();
        if (cParty !== pNameLower) return false;
        if (selectedEntity && selectedEntity !== 'All') {
          const colSp = (c as any).salesmanCode || party.salesmanCode;
          if (!matchesEntity(c.entityName, c.branchName, selectedEntity, colSp, c.partyName)) return false;
        }
        const cDateIso = parseDateToISO(c.date);
        return cDateIso && cDateIso >= effectiveStartIso && cDateIso <= effectiveEndIso;
      });

      let currentMonthDepositedCashCol = 0;
      let currentMonthUndepositedCashCol = 0;
      let bankCollection = 0;

      monthlyPartyCollections.forEach((c) => {
        const isCheque = c.paymentType === 'cheque' || (c.paymentType !== 'cash' && Boolean((c.chequeNo && c.chequeNo.trim()) || (c.bankName && c.bankName.trim() && !c.bankName.toLowerCase().includes('cash'))));
        const amt = Number(c.amount || 0);
        if (isCheque) {
          bankCollection += amt;
        } else {
          // Office Statement: deposited cash in this month
          const isDep = isCollectionDeposited(c);
          if (isDep) {
            currentMonthDepositedCashCol += amt;
          } else {
            currentMonthUndepositedCashCol += amt;
          }
        }
      });

      // Also include any direct bank deposits assigned to this party
      bankDeposits.forEach((d) => {
        const dParty = ((d.customerName || d.partyName) || '').trim().toLowerCase();
        if (dParty && (dParty === pNameLower || dParty.includes(pNameLower) || pNameLower.includes(dParty))) {
          const isAlreadyLinked = monthlyPartyCollections.some((c) => c.bankDepositId === d.id || d.collectionMrId === c.id);
          if (!isAlreadyLinked) {
            const dIso = parseDateToISO(d.date);
            if (dIso && dIso >= effectiveStartIso && dIso <= effectiveEndIso) {
              bankCollection += Number(d.amount || 0);
            }
          }
        }
      });

      // Total cash collection for this month includes:
      // 1) Previous month's undeposited cash collection (deposited on 1st date of this month to H/O)
      // 2) This month's deposited cash collections
      const cashCollection = currentMonthDepositedCashCol + prevMonthUndepositedCashCol;
      const totalCollection = cashCollection + bankCollection;
      const balance = openingBalance + totalSales - totalCollection;
      const netMonthlyDifference = totalSales - totalCollection;

      return {
        party,
        openingBalance,
        billsCount,
        totalSales,
        cashCollection,
        bankCollection,
        prevMonthUndisputedCashCol: prevMonthUndepositedCashCol,
        currentMonthCashCol: currentMonthDepositedCashCol,
        currentMonthUndepositedCashCol,
        totalCollection,
        balance,
        netMonthlyDifference
      };
    });

    const activeSearch = (searchTerm || officeSearchTerm).trim().toLowerCase();
    const filteredRows = rows.filter((r) => {
      const matchesSearch =
        !activeSearch ||
        r.party.name.toLowerCase().includes(activeSearch) ||
        (r.party.address || '').toLowerCase().includes(activeSearch) ||
        (r.party.salespersonName || '').toLowerCase().includes(activeSearch) ||
        (r.party.salesmanCode || '').toLowerCase().includes(activeSearch);

      if (!matchesSearch) return false;

      if (officePartyViewFilter === 'active_only') {
        return r.totalSales > 0 || r.totalCollection > 0 || r.openingBalance !== 0 || r.balance !== 0;
      }
      if (officePartyViewFilter === 'sales_only') {
        return r.totalSales > 0;
      }
      if (officePartyViewFilter === 'collection_only') {
        return r.totalCollection > 0;
      }
      return true;
    });

    filteredRows.sort((a, b) => {
      let cmp = 0;
      if (officeSortBy === 'openingBalance') {
        cmp = (a.openingBalance || 0) - (b.openingBalance || 0);
      } else if (officeSortBy === 'totalSales') {
        cmp = (a.totalSales || 0) - (b.totalSales || 0);
      } else if (officeSortBy === 'totalCollection') {
        cmp = (a.totalCollection || 0) - (b.totalCollection || 0);
      } else if (officeSortBy === 'balance') {
        cmp = (a.balance || 0) - (b.balance || 0);
      } else {
        cmp = a.party.name.localeCompare(b.party.name);
      }
      return officeSortDir === 'asc' ? cmp : -cmp;
    });

    return filteredRows;
  }, [
    parties,
    officeMarketingFilter,
    selectedMarketingPerson,
    selectedCustomer,
    selectedTypeFilter,
    startDate,
    endDate,
    searchTerm,
    storedBills,
    closedBillIdSet,
    collections,
    closedCollectionIdSet,
    officeMonthStartIso,
    officeMonthEndIso,
    prevMonthEndDateIso,
    selectedOfficeMonth,
    officeSearchTerm,
    officePartyViewFilter,
    officeSortBy,
    officeSortDir,
    selectedEntity,
    doesPartyBelongToSelectedCenter
  ]);

  // Office Grand Totals and Cash Reconciliation
  const officeGrandTotals = useMemo(() => {
    const totalPartiesWithActivity = officePartyReportData.filter((r) => r.totalSales > 0 || r.totalCollection > 0 || r.openingBalance !== 0 || r.balance !== 0).length;
    const totalOpeningBalance = officePartyReportData.reduce((s, r) => s + r.openingBalance, 0);
    const totalSales = officePartyReportData.reduce((s, r) => s + r.totalSales, 0);
    const totalBills = officePartyReportData.reduce((s, r) => s + r.billsCount, 0);
    const totalCash = officePartyReportData.reduce((s, r) => s + r.cashCollection, 0);
    const totalBank = officePartyReportData.reduce((s, r) => s + r.bankCollection, 0);
    const totalCollection = totalCash + totalBank;
    const totalEndingBalance = officePartyReportData.reduce((s, r) => s + r.balance, 0);
    const netDifference = totalSales - totalCollection;

    let currentMonthCashIn = 0;
    collections.forEach((c) => {
      if (isPartyCollectionClosed(c)) return;
      if (isYearEndSettlementCollection(c) && !isCashCollectionRecord(c)) return;
      const cIso = parseDateToISO(c.date);
      if (cIso && cIso >= officeMonthStartIso && cIso <= officeMonthEndIso) {
        if (!c.paymentType || c.paymentType === 'cash') {
          currentMonthCashIn += Number(c.amount || 0);
        }
      }
    });

    let currentMonthBankDeposited = 0;
    bankDeposits.forEach((d) => {
      const dIso = parseDateToISO(d.date);
      if (dIso && dIso >= officeMonthStartIso && dIso <= officeMonthEndIso) {
        currentMonthBankDeposited += Number(d.amount || 0);
      }
    });

    const currentMonthEndingCash = Math.max(0, currentMonthCashIn - currentMonthBankDeposited);

    return {
      totalPartiesCount: officePartyReportData.length,
      totalPartiesWithActivity,
      totalOpeningBalance,
      totalSales,
      totalBills,
      totalCash,
      totalBank,
      totalCollection,
      totalEndingBalance,
      netDifference,
      currentMonthCashIn,
      currentMonthBankDeposited,
      currentMonthEndingCash
    };
  }, [
    officePartyReportData,
    collections,
    closedCollectionIdSet,
    bankDeposits,
    officeMonthStartIso,
    officeMonthEndIso
  ]);

  // Format number for Excel statement matching statement.png layout: (600,000) for negative, 218,889 for positive, - for 0
  const formatExcelStatementAmount = (val: number | undefined | null): string => {
    if (val === undefined || val === null || Math.abs(val) < 0.001) return '-';
    const rounded = Math.round(val);
    if (rounded < 0) {
      return `(${Math.abs(rounded).toLocaleString('en-US')})`;
    }
    return rounded.toLocaleString('en-US');
  };

  // Export Office Report to XLSX matching statement.png format exactly
  const handleExportOfficeReportExcel = () => {
    try {
      const data: any[][] = [];
      data.push(['POLY CABLES']);
      data.push(['OFFICE MONTHLY SALES & COLLECTION REPORT']);
      data.push([`Period: ${startDate || officeMonthStartDateDDMMYY} to ${endDate || officeMonthEndDateDDMMYY}`]);
      data.push([`Branch / Sales Center: ${selectedEntity === 'All' ? 'Madhupur Sales Center' : selectedEntity}`]);
      data.push([`Marketing Person: ${selectedMarketingPerson !== 'All' ? selectedMarketingPerson : (officeMarketingFilter !== 'All' ? officeMarketingFilter : 'All Marketing Persons')}`]);
      data.push([]);

      // Section: Party-Wise Breakdown Header
      data.push(['--- PARTY-WISE SALES & COLLECTIONS BREAKDOWN ---']);
      data.push([
        'SL',
        'Party Name',
        'Address',
        'Opening Balance',
        'Sales',
        'Collections',
        'Closing Balance'
      ]);

      officePartyReportData.forEach((row, idx) => {
        data.push([
          idx + 1,
          row.party.name,
          row.party.address || 'Madhupur',
          formatExcelStatementAmount(row.openingBalance),
          formatExcelStatementAmount(row.totalSales),
          formatExcelStatementAmount(row.totalCollection),
          formatExcelStatementAmount(row.balance)
        ]);
      });

      // Total Row matching statement.png: Col 2 is 'Total=', followed by formatted values
      data.push([
        '',
        '',
        'Total=',
        formatExcelStatementAmount(officeGrandTotals.totalOpeningBalance),
        formatExcelStatementAmount(officeGrandTotals.totalSales),
        formatExcelStatementAmount(officeGrandTotals.totalCollection),
        formatExcelStatementAmount(officeGrandTotals.totalEndingBalance)
      ]);

      const ws = XLSX.utils.aoa_to_sheet(data);

      // Set clean column widths
      ws['!cols'] = [
        { wch: 6 },  // SL
        { wch: 42 }, // Party Name
        { wch: 22 }, // Address
        { wch: 18 }, // Opening Balance
        { wch: 16 }, // Sales
        { wch: 16 }, // Collections
        { wch: 18 }  // Closing Balance
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Monthly_Statement');
      XLSX.writeFile(wb, `Party_Wise_Monthly_Statement_${selectedOfficeMonth.replace('-', '_')}.xlsx`);
    } catch (e: any) {
      console.error('Failed to export Office Report XLSX:', e);
      alert('Error exporting Excel report: ' + (e?.message || 'Unknown error'));
    }
  };

  // Filtered collections by date, selectedEntity, selectedMarketingPerson, selectedCustomer, and selectedTypeFilter
  const filteredCollections = collections.filter((c) => {
    if (selectedTypeFilter === 'Showroom') {
      const isShowroom = (c.entityName || c.branchName || '').toLowerCase().includes('showroom') ||
        (c.remarks || '').toLowerCase().includes('showroom');
      if (!isShowroom) return false;
    } else if (selectedTypeFilter === 'Office') {
      const isOffice = (c.entityName || c.branchName || '').toLowerCase().includes('office') ||
        (c.remarks || '').toLowerCase().includes('office');
      if (!isOffice) return false;
    }
    if (isPartyCollectionClosed(c) || isYearEndSettlementCollection(c)) return false;
    const cIso = parseDateToISO(c.date);
    const startIso = parseDateToISO(startDate);
    const endIso = parseDateToISO(endDate);
    const matchesDate = !startIso || !endIso || (cIso >= startIso && cIso <= endIso);

    // Salesman Filter
    if (selectedMarketingPerson && selectedMarketingPerson !== 'All') {
      const selSp = selectedMarketingPerson.trim().toLowerCase();
      const colSpName = ((c as any).salespersonName || (c as any).marketingPerson || '').trim().toLowerCase();
      const colSpCode = ((c as any).salesmanCode || '').trim().toLowerCase();
      
      const spObj = salespersons.find(
        (s) => s.name.trim().toLowerCase() === selSp || (s.code && s.code.toLowerCase() === selSp)
      );
      const spCode = (spObj?.code || '').toLowerCase();
      const spName = (spObj?.name || selSp).toLowerCase();

      const p = parties.find((item) => item.name?.toLowerCase() === (c.partyName || '').toLowerCase());
      const pSpName = (p?.salespersonName || '').toLowerCase();
      const pSpCode = (p?.salesmanCode || '').toLowerCase();

      const matchesSp =
        colSpName === spName ||
        (colSpCode && colSpCode === spCode) ||
        pSpName === spName ||
        (pSpCode && pSpCode === spCode) ||
        (colSpName && colSpName.includes(spName)) ||
        (pSpName && pSpName.includes(spName));
      if (!matchesSp) return false;
    }

    // Party Filter
    if (selectedCustomer && selectedCustomer !== 'All') {
      if ((c.partyName || '').trim().toLowerCase() !== selectedCustomer.trim().toLowerCase()) {
        return false;
      }
    }

    const colSpCode = (c as any).salesmanCode || parties.find((item) => item.name?.toLowerCase() === (c.partyName || '').toLowerCase())?.salesmanCode;
    const matchesEntityChoice = matchesEntity(c.entityName, c.branchName, selectedEntity, colSpCode, c.partyName);
    const matchesSearch =
      !searchTerm ||
      matchesFlexibleSearch(c.partyName || '', searchTerm) ||
      matchesFlexibleSearch(c.bankName || '', searchTerm) ||
      matchesFlexibleSearch(c.mrNo || '', searchTerm) ||
      matchesFlexibleSearch(c.remarks || '', searchTerm);
    return matchesDate && matchesEntityChoice && matchesSearch;
  });

  // Filtered bank deposits by date, selectedEntity, selectedMarketingPerson, and selectedCustomer
  const filteredBankDeposits = bankDeposits.filter((d) => {
    const dIso = parseDateToISO(d.date);
    const startIso = parseDateToISO(startDate);
    const endIso = parseDateToISO(endDate);
    const matchesDate = !startIso || !endIso || (dIso >= startIso && dIso <= endIso);

    // Salesman Filter
    if (selectedMarketingPerson && selectedMarketingPerson !== 'All') {
      const selSp = selectedMarketingPerson.trim().toLowerCase();
      const spObj = salespersons.find(
        (s) => s.name.trim().toLowerCase() === selSp || (s.code && s.code.toLowerCase() === selSp)
      );
      const spCode = (spObj?.code || '').toLowerCase();
      const spName = (spObj?.name || selSp).toLowerCase();

      const depSpName = ((d as any).salespersonName || (d as any).marketingPerson || '').trim().toLowerCase();
      const depSpCode = ((d as any).salesmanCode || '').trim().toLowerCase();

      const partyName = d.customerName || (d as any).partyName || '';
      const p = parties.find((item) => item.name?.toLowerCase() === partyName.toLowerCase());
      const pSpName = (p?.salespersonName || '').toLowerCase();
      const pSpCode = (p?.salesmanCode || '').toLowerCase();

      const matchesSp =
        depSpName === spName ||
        (depSpCode && depSpCode === spCode) ||
        pSpName === spName ||
        (pSpCode && pSpCode === spCode) ||
        (depSpName && depSpName.includes(spName)) ||
        (pSpName && pSpName.includes(spName));
      if (!matchesSp) return false;
    }

    // Party Filter
    if (selectedCustomer && selectedCustomer !== 'All') {
      const partyName = (d.customerName || (d as any).partyName || '').trim().toLowerCase();
      if (partyName !== selectedCustomer.trim().toLowerCase()) {
        return false;
      }
    }

    const depPartyName = d.customerName || (d as any).partyName;
    const depSpCode = (d as any).salesmanCode || parties.find((item) => item.name?.toLowerCase() === (depPartyName || '').toLowerCase())?.salesmanCode;
    const matchesEntityChoice = matchesEntity(d.entityName, (d as any).branchName, selectedEntity, depSpCode, depPartyName);
    const matchesSearch =
      !searchTerm ||
      matchesFlexibleSearch(d.bankName || '', searchTerm) ||
      matchesFlexibleSearch(d.displayTag || '', searchTerm) ||
      matchesFlexibleSearch(d.accountName || '', searchTerm) ||
      matchesFlexibleSearch(d.customerName || '', searchTerm) ||
      matchesFlexibleSearch(d.remarks || '', searchTerm);
    return matchesDate && matchesEntityChoice && matchesSearch;
  });

  // Split Collections into Undeposited Cash Received and Bank Collections (Cheque + Deposited Cash)
  const cashReceivedList = filteredCollections.filter(
    (c) => (!c.paymentType || c.paymentType === 'cash') && (!isCollectionDeposited(c) || c.isMonthlyExpenseAdjusted || Boolean(c.remarks && c.remarks.includes('Monthly Expense Adjustment')))
  );
  const bankCollectionList = filteredCollections.filter(
    (c) => c.paymentType === 'cheque' || ((!c.paymentType || c.paymentType === 'cash') && isCollectionDeposited(c))
  );

  // Detailed Bank Collections (Individual Items for Page 2 - Party-Wise Bank Details)
  const detailedBankCollectionList = React.useMemo(() => {
    const list: Array<{
      id: string;
      date: string;
      bankName: string;
      shortTag: string;
      accountName: string;
      partyName: string;
      address: string;
      amount: number;
    }> = [];

    const processedDepositIds = new Set<string>();

    // 1. Process all bank collections (cheques + deposited cash)
    bankCollectionList.forEach((col) => {
      // Find matched bank deposit across all bankDeposits as well as filteredBankDeposits
      const matchedDep = (bankDeposits || []).find(
        (d) => (col.bankDepositId && d.id === col.bankDepositId) || d.collectionMrId === col.id
      ) || filteredBankDeposits.find(
        (d) => (col.bankDepositId && d.id === col.bankDepositId) || d.collectionMrId === col.id
      );
      if (matchedDep) {
        processedDepositIds.add(matchedDep.id);
      }

      const rawTag = matchedDep?.displayTag || col.depositBankTag || (col as any).displayTag || (col as any).depositTag || '';
      const rawBank = matchedDep?.bankName || col.bankName || (rawTag ? resolveFullBankName(rawTag) : 'Pubali Bank PLC');
      const rawAcc = matchedDep?.accountName || col.accountName || (col as any).accountName || (rawTag ? resolveFullAccountName(rawTag) : (rawBank.toLowerCase().includes('brac') ? 'Sonjoy Enterprise' : 'Padma Enterprise'));
      const isHO = (matchedDep && (matchedDep.bankName === 'H/O' || matchedDep.displayTag === 'H/O')) ||
        (col.bankName && (col.bankName.toUpperCase() === 'H/O' || col.bankName.toLowerCase().includes('head office'))) ||
        (rawTag && (rawTag.toUpperCase() === 'H/O' || rawTag.toLowerCase().includes('head office'))) ||
        (rawBank && (rawBank.toUpperCase() === 'H/O' || rawBank.toLowerCase().includes('head office')));
      const shortTag = isHO ? 'H/O' : getBankAndAccountShortTag(rawBank, rawAcc, rawTag);
      const fullBank = isHO ? 'Head Office' : resolveFullBankName(rawBank);
      const fullAcc = isHO ? 'Head Office' : resolveFullAccountName(rawAcc);

      const rawParty = (col.partyName || matchedDep?.partyName || matchedDep?.customerName || '').trim();
      const pName = rawParty && rawParty.toLowerCase() !== 'customer' && rawParty.toLowerCase() !== 'general customer' ? rawParty : '-';
      const matchedPartyObj = parties.find((p) => p.name && p.name.trim().toLowerCase() === pName.toLowerCase());
      const pAddr = matchedDep?.customerAddress || (col as any).address || matchedPartyObj?.address || getPartyAddress(pName) || 'Madhupur';

      list.push({
        id: col.id,
        date: col.date,
        bankName: fullBank,
        shortTag: shortTag,
        accountName: fullAcc,
        partyName: pName,
        address: pAddr,
        amount: col.amount,
      });
    });

    // 2. Process any standalone bank deposits in filteredBankDeposits not linked to a collection MR in bankCollectionList
    filteredBankDeposits.forEach((dep) => {
      if (!processedDepositIds.has(dep.id)) {
        const matchedCol = bankCollectionList.find(
          (c) => c.id === dep.collectionMrId || (c.bankDepositId && c.bankDepositId === dep.id)
        );
        if (!matchedCol) {
          const isHO = dep.bankName === 'H/O' || dep.displayTag === 'H/O' || (dep.bankName && dep.bankName.toLowerCase().includes('head office'));
          const rawAcc = dep.accountName || (dep.displayTag ? resolveFullAccountName(dep.displayTag) : (dep.bankName && dep.bankName.toLowerCase().includes('brac') ? 'Sonjoy Enterprise' : 'Padma Enterprise'));
          const shortTag = isHO ? 'H/O' : getBankAndAccountShortTag(dep.bankName, rawAcc, dep.displayTag);
          const fullBank = isHO ? 'Head Office' : resolveFullBankName(dep.bankName);
          const fullAcc = isHO ? 'Head Office' : resolveFullAccountName(rawAcc);

          const rawParty = (dep.partyName || dep.customerName || '').trim();
          const pName = rawParty && rawParty.toLowerCase() !== 'customer' && rawParty.toLowerCase() !== 'general customer'
            ? rawParty
            : (dep.remarks || 'Cash Deposit');
          const matchedPartyObj = parties.find((p) => p.name && p.name.trim().toLowerCase() === pName.toLowerCase());
          const pAddr = dep.customerAddress || matchedPartyObj?.address || getPartyAddress(pName) || 'Madhupur';

          list.push({
            id: dep.id,
            date: dep.date,
            bankName: fullBank,
            shortTag: shortTag,
            accountName: fullAcc,
            partyName: pName,
            address: pAddr,
            amount: dep.amount,
          });
        }
      }
    });

    list.sort((a, b) => {
      let cmp = 0;
      if (bankDetailSortBy === 'date') {
        const dateA = parseDateToISO(a.date) || a.date;
        const dateB = parseDateToISO(b.date) || b.date;
        cmp = dateA.localeCompare(dateB);
      } else if (bankDetailSortBy === 'bankName') {
        cmp = a.shortTag.localeCompare(b.shortTag);
      } else if (bankDetailSortBy === 'partyName') {
        cmp = a.partyName.localeCompare(b.partyName);
      } else if (bankDetailSortBy === 'address') {
        cmp = a.address.localeCompare(b.address);
      } else if (bankDetailSortBy === 'amount') {
        cmp = a.amount - b.amount;
      }
      return bankDetailSortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [bankCollectionList, filteredBankDeposits, parties, collections, bankDeposits, startDate, bankDetailSortBy, bankDetailSortDir]);

  // Group Party-Wise Bank Collection Details by Date & Bank Short Tag for Table A (Page 3 - Bank & Cash Summary)
  const bankSummaryList = React.useMemo(() => {
    const map = new Map<string, { id: string; date: string; bankName: string; shortTag: string; accountName: string; amount: number; remarks: string }>();

    detailedBankCollectionList.forEach((item) => {
      const tagKey = (item.shortTag ? item.shortTag.trim() : item.bankName.trim()).replace(/\s*\(/g, '(');
      const key = `${item.date}___${tagKey}`;
      const existing = map.get(key);

      if (existing) {
        existing.amount += item.amount;
        if (item.partyName && item.partyName !== '-' && !existing.remarks.includes(item.partyName)) {
          existing.remarks += `, ${item.partyName}`;
        }
      } else {
        map.set(key, {
          id: `bsum_${item.id}`,
          date: item.date,
          bankName: item.bankName,
          shortTag: item.shortTag,
          accountName: item.accountName,
          amount: item.amount,
          remarks: item.partyName ? `Collection (${item.partyName})` : 'Deposit Summary',
        });
      }
    });

    const list = Array.from(map.values());
    list.sort((a, b) => {
      const aIso = parseDateToISO(a.date) || a.date;
      const bIso = parseDateToISO(b.date) || b.date;
      const cmp = aIso.localeCompare(bIso);
      return bankSummaryDateSortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [detailedBankCollectionList, bankSummaryDateSortDir]);

  const sortedCashReceivedList = React.useMemo(() => {
    return [...cashReceivedList].sort((a, b) => {
      const aIso = parseDateToISO(a.date) || a.date;
      const bIso = parseDateToISO(b.date) || b.date;
      const cmp = aIso.localeCompare(bIso);
      return cashReceivedDateSortDir === 'asc' ? cmp : -cmp;
    });
  }, [cashReceivedList, cashReceivedDateSortDir]);

  // Totals
  const totalDetailedBankSum = detailedBankCollectionList.reduce((sum, item) => sum + item.amount, 0);
  const totalBankSummarySum = bankSummaryList.reduce((sum, item) => sum + item.amount, 0);
  const totalBankDepositsSum = filteredBankDeposits.reduce((sum, d) => sum + d.amount, 0);
  const totalCashReceivedSum = cashReceivedList.reduce((sum, c) => sum + c.amount, 0);
  const totalBankCollectionsSum = bankCollectionList.reduce((sum, c) => sum + c.amount, 0);
  const grandTotalBankCash = totalBankSummarySum + totalCashReceivedSum;

  // Filtered Delivery Challans
  const filteredChallans = (challanFilter === 'without_challan' ? [] : effectiveDeliveryChallans).filter((ch) => {
    if (closedChallanIdSet.has(ch.id)) return false;
    const chDateIso = parseDateToISO(ch.date || '');
    const startIso = parseDateToISO(startDate);
    const endIso = parseDateToISO(endDate);
    const matchesDate = !startIso || !endIso || (chDateIso >= startIso && chDateIso <= endIso);
    const party = parties.find((p) => p.name?.trim().toLowerCase() === (ch.partyName || '').trim().toLowerCase());
    const salesmanName = ch.salespersonName || party?.salespersonName || party?.salesmanCode || '';
    const isMarketing = !!salesmanName;
    const isShowroom = !salesmanName || ch.partyName?.includes('Sales Center');

    let matchesCategory = true;
    if (selectedCategory === 'Marketing') matchesCategory = isMarketing;
    if (selectedCategory === 'Showroom') matchesCategory = isShowroom;
    if (selectedCategory === 'Office') matchesCategory = !salesmanName;

    // Filter by Marketing Person dropdown
    let matchesMarketingPerson = true;
    if (selectedMarketingPerson !== 'All') {
      const spNameLower = (salesmanName || '').trim().toLowerCase();
      const selMarketingLower = selectedMarketingPerson.trim().toLowerCase();
      const partySpName = (party?.salespersonName || '').trim().toLowerCase();
      const partySpCode = (party?.salesmanCode || '').trim().toLowerCase();
      matchesMarketingPerson =
        spNameLower === selMarketingLower ||
        partySpName === selMarketingLower ||
        partySpCode === selMarketingLower;
    }

    // Filter by Customer dropdown
    let matchesCustomer = true;
    if (selectedCustomer !== 'All') {
      matchesCustomer = (ch.partyName || '').trim().toLowerCase() === selectedCustomer.trim().toLowerCase();
    }

    const matchesItemSearch = (ch.lines || []).some((l) => matchesFlexibleSearch(`${l.itemName || ''} ${l.sizeSpec || ''}`, searchTerm, `${l.itemCode || ''}`));
    const matchesSearch =
      !searchTerm ||
      matchesFlexibleSearch(ch.challanNo || '', searchTerm) ||
      matchesFlexibleSearch(ch.partyName || '', searchTerm) ||
      matchesFlexibleSearch(salesmanName || '', searchTerm) ||
      matchesItemSearch;

    let matchesSalesCenter = true;
    if (selectedEntity && selectedEntity !== 'All') {
      matchesSalesCenter = matchesEntity(
        (ch as any).branchName,
        (ch as any).branchId,
        selectedEntity,
        salesmanName || party?.salesmanCode,
        ch.partyName
      );
    }

    return matchesDate && matchesCategory && matchesMarketingPerson && matchesCustomer && matchesSearch && matchesSalesCenter;
  });

  // Filtered Stored Bills for Bill-Wise Sales Report
  const filteredBills = (selectedTypeFilter === 'Collection' || challanFilter === 'challan_only' ? [] : storedBills).filter((bill) => {
    const isClosed = isPartyBillClosed(bill);
    const isTargetBill7 = (bill.header?.billNo || '').trim() === '7' || (bill.header?.billNo || '').trim() === '00007' || (bill.header?.billNo || '').trim() === '007' || bill.id?.includes('7');
    if (isClosed) {
      if (isTargetBill7) console.log(`[Report:filteredBills] Bill #${bill.header?.billNo} (ID: ${bill.id}) excluded: isPartyBillClosed=true`);
      return false;
    }
    const rawDate = bill.header?.date || bill.savedAt?.substring(0, 10) || (bill as any).createdAt?.substring(0, 10) || '';
    const billDateIso = parseDateToISO(rawDate);
    const startIso = parseDateToISO(startDate);
    const endIso = parseDateToISO(endDate);
    const matchesDate = !startIso || !endIso || !billDateIso || (billDateIso >= startIso && billDateIso <= endIso);
    if (isTargetBill7 && !matchesDate) {
      console.log(`[Report:filteredBills] Bill #${bill.header?.billNo} (ID: ${bill.id}) excluded by Date range: rawDate="${rawDate}", billDateIso="${billDateIso}", range=[${startIso}..${endIso}]`);
    }

    const party = findPartyForBill(bill, parties, salespersons, effectiveBranches);
    const salesmanName = bill.header?.salespersonName || party?.salespersonName || party?.salesmanCode || bill.header?.salesmanCode || '';
    
    const isOffice = Boolean(bill.isOfficeBill || bill.header?.isOfficeBill);
    const isShowroom = !isOffice;
    const isMarketing = Boolean(salesmanName);
    
    let matchesCategory = true;
    if (selectedCategory === 'Marketing') matchesCategory = isMarketing;
    if (selectedCategory === 'Showroom') matchesCategory = isShowroom;
    if (selectedCategory === 'Office') matchesCategory = isOffice;

    let matchesType = true;
    if (selectedTypeFilter === 'Showroom') matchesType = isShowroom;
    if (selectedTypeFilter === 'Office') matchesType = isOffice;

    // Filter by Marketing Person dropdown
    let matchesMarketingPerson = true;
    if (selectedMarketingPerson !== 'All') {
      const spNameLower = (salesmanName || '').trim().toLowerCase();
      const selMarketingLower = selectedMarketingPerson.trim().toLowerCase();
      const partySpName = (party?.salespersonName || '').trim().toLowerCase();
      const partySpCode = (party?.salesmanCode || '').trim().toLowerCase();
      const billSpName = (bill.header?.salespersonName || '').trim().toLowerCase();
      const billSpCode = (bill.header?.salesmanCode || '').trim().toLowerCase();
      matchesMarketingPerson =
        spNameLower === selMarketingLower ||
        partySpName === selMarketingLower ||
        partySpCode === selMarketingLower ||
        billSpName === selMarketingLower ||
        billSpCode === selMarketingLower;
      if (isTargetBill7 && !matchesMarketingPerson) {
        console.log(`[Report:filteredBills] Bill #${bill.header?.billNo} (ID: ${bill.id}) excluded by Marketing Person: selected="${selectedMarketingPerson}", billSP="${salesmanName}"`);
      }
    }

    // Filter by Customer dropdown
    let matchesCustomer = true;
    if (selectedCustomer !== 'All') {
      matchesCustomer = (bill.header?.partyName || '').trim().toLowerCase() === selectedCustomer.trim().toLowerCase();
      if (isTargetBill7 && !matchesCustomer) {
        console.log(`[Report:filteredBills] Bill #${bill.header?.billNo} (ID: ${bill.id}) excluded by Customer: selected="${selectedCustomer}", billParty="${bill.header?.partyName}"`);
      }
    }

    const matchesItemSearch = (bill.lines || []).some((l) => matchesFlexibleSearch(`${(l as any).itemDescription || l.itemName || ''} ${(l as any).sizeSpec || ''}`, searchTerm, `${l.itemCode || ''}`));
    const matchesSearch =
      !searchTerm ||
      matchesFlexibleSearch(bill.header?.billNo || '', searchTerm) ||
      matchesFlexibleSearch(bill.header?.partyName || '', searchTerm) ||
      matchesFlexibleSearch(salesmanName || '', searchTerm) ||
      matchesItemSearch;

    let matchesSalesCenter = true;
    if (selectedEntity && selectedEntity !== 'All') {
      matchesSalesCenter = matchesEntity(
        bill.header?.branchName || (bill as any).branchName,
        bill.header?.branchId || bill.branchId,
        selectedEntity,
        bill.header?.salesmanCode,
        bill.header?.partyName
      );
    }

    const isMatch = matchesDate && matchesCategory && matchesType && matchesMarketingPerson && matchesCustomer && matchesSearch && matchesSalesCenter;
    if (isTargetBill7) {
      console.log(`[Report:filteredBills] Bill #${bill.header?.billNo} (ID: ${bill.id}) -> PASS: ${isMatch}`);
    }
    return isMatch;
  });

  // Bill-wise sales totals
  const totalSalesVal = filteredBills.reduce((sum, b) => sum + (b.grandTotal || 0), 0);

  // Customer-wise sales and collections data calculator
  const customerWiseData = React.useMemo(() => {
    // Build comprehensive party list keyed by party ID / (name + marketing person + branch)
    // so distinct marketing persons' same-named parties are never merged or hidden.
    const partyMap = new Map<string, Party>();
    const partyByNameFallback = new Map<string, Party[]>();
    const getPartyMktKey = (spCode?: string, spName?: string) =>
      (spCode || spName || '').trim().toLowerCase();

    (parties || []).forEach((p) => {
      if (p.name && p.name.trim()) {
        const nameKey = p.name.trim().toLowerCase();
        const mktKey = getPartyMktKey(p.salesmanCode, p.salespersonName);
        const mapKey = p.id || `${nameKey}::${mktKey}::${(p.branchId || p.branchName || '').trim().toLowerCase()}`;
        partyMap.set(mapKey, p);
        const arr = partyByNameFallback.get(nameKey) || [];
        arr.push(p);
        partyByNameFallback.set(nameKey, arr);
      }
    });

    (storedBills || []).forEach((b) => {
      if (isPartyBillClosed(b)) return;
      if (selectedEntity && selectedEntity !== 'All') {
        if (!matchesEntity(b.header?.branchName || (b as any).branchName, b.header?.branchId || b.branchId, selectedEntity, b.header?.salesmanCode, b.header?.partyName)) {
          return;
        }
      }
      const pName = (b.header?.partyName || '').trim();
      const nameLow = pName.toLowerCase();
      if (pName && !partyByNameFallback.has(nameLow)) {
        const synthetic: Party = {
          id: `party-bill-${nameLow.replace(/\s+/g, '-')}`,
          name: pName,
          address: b.header?.address || 'Madhupur',
          phone: b.header?.phone || '',
          salespersonName: b.header?.salespersonName || '',
          salesmanCode: b.header?.salesmanCode || '',
          branchId: b.header?.branchId || b.branchId,
          branchName: b.header?.branchName || (b as any).branchName,
          openingBalance: 0
        } as any;
        partyMap.set(synthetic.id, synthetic);
        partyByNameFallback.set(nameLow, [synthetic]);
      }
    });

    (collections || []).forEach((c) => {
      if (isPartyCollectionClosed(c) || isYearEndSettlementCollection(c)) return;
      if (selectedEntity && selectedEntity !== 'All') {
        const colSpCode = (c as any).salesmanCode || parties.find((item) => item.name?.toLowerCase() === (c.partyName || '').toLowerCase())?.salesmanCode;
        if (!matchesEntity(c.entityName, c.branchName, selectedEntity, colSpCode, c.partyName)) {
          return;
        }
      }
      const pName = (c.partyName || '').trim();
      const nameLow = pName.toLowerCase();
      if (pName && !partyByNameFallback.has(nameLow)) {
        const synthetic: Party = {
          id: `party-col-${nameLow.replace(/\s+/g, '-')}`,
          name: pName,
          address: 'Madhupur',
          phone: '',
          salespersonName: '',
          salesmanCode: '',
          branchName: c.branchName || c.entityName,
          openingBalance: 0
        } as any;
        partyMap.set(synthetic.id, synthetic);
        partyByNameFallback.set(nameLow, [synthetic]);
      }
    });

    (effectiveDeliveryChallans || []).forEach((ch) => {
      if (closedChallanIdSet.has(ch.id)) return;
      if (selectedEntity && selectedEntity !== 'All') {
        if (!matchesEntity((ch as any).branchName, (ch as any).branchId, selectedEntity, ch.salespersonName, ch.partyName)) {
          return;
        }
      }
      const pName = (ch.partyName || '').trim();
      const nameLow = pName.toLowerCase();
      if (pName && !partyByNameFallback.has(nameLow)) {
        const synthetic: Party = {
          id: `party-ch-${nameLow.replace(/\s+/g, '-')}`,
          name: pName,
          address: ch.address || 'Madhupur',
          phone: '',
          salespersonName: ch.salespersonName || '',
          salesmanCode: '',
          branchId: (ch as any).branchId,
          branchName: (ch as any).branchName,
          openingBalance: 0
        } as any;
        partyMap.set(synthetic.id, synthetic);
        partyByNameFallback.set(nameLow, [synthetic]);
      }
    });

    let targetParties = Array.from(partyMap.values());

    if (selectedPartyId) {
      const exactIdMatch = targetParties.find((p) => p.id === selectedPartyId);
      if (exactIdMatch) {
        targetParties = [exactIdMatch];
      }
    } else if (selectedCustomer !== 'All') {
      const cLower = selectedCustomer.trim().toLowerCase();
      targetParties = targetParties.filter((p) => p.name.trim().toLowerCase() === cLower);
      if (selectedEntity && selectedEntity !== 'All') {
        targetParties = targetParties.filter((p) => doesPartyBelongToSelectedCenter(p, selectedEntity));
      }
      if (selectedMarketingPerson !== 'All') {
        const spLower = selectedMarketingPerson.trim().toLowerCase();
        targetParties = targetParties.filter((p) => {
          const spName = (p.salespersonName || '').trim().toLowerCase();
          const spCode = (p.salesmanCode || '').trim().toLowerCase();
          return spName === spLower || spCode === spLower;
        });
      }
    } else {
      if (selectedEntity && selectedEntity !== 'All') {
        targetParties = targetParties.filter((p) => doesPartyBelongToSelectedCenter(p, selectedEntity));
      }

      if (selectedMarketingPerson !== 'All') {
        targetParties = targetParties.filter((p) => {
          const spName = p.salespersonName || '';
          const spCode = p.salesmanCode || '';
          return (
            spName.trim().toLowerCase() === selectedMarketingPerson.trim().toLowerCase() ||
            spCode.trim().toLowerCase() === selectedMarketingPerson.trim().toLowerCase()
          );
        });
      }
    }

    const startIso = parseDateToISO(startDate);
    const endIso = parseDateToISO(endDate);

    const items = targetParties.map((party) => {
      const pNameLow = party.name.trim().toLowerCase();
      const sameNameCount = (partyByNameFallback.get(pNameLow) || []).length;
      const pSpCodeLow = (party.salesmanCode || '').trim().toLowerCase();
      const pSpNameLow = (party.salespersonName || '').trim().toLowerCase();

      // Get all sales for this party based on selectedTypeFilter & selectedEntity
      const partyBills = (selectedTypeFilter === 'Collection' ? [] : storedBills).filter((b) => {
        if (isPartyBillClosed(b)) return false;
        const bPartyId = (b as any).partyId || (b.header as any)?.partyId;
        if (bPartyId && party.id && bPartyId !== party.id && sameNameCount > 1) return false;
        const matchParty = (b.header?.partyName || '').trim().toLowerCase() === pNameLow;
        if (!matchParty) return false;
        if (sameNameCount > 1 && !bPartyId) {
          const matchedOwner = findPartyForBill(b, parties, salespersons, effectiveBranches);
          if (matchedOwner && matchedOwner.id !== party.id) return false;
          const bSpCode = (b.header?.salesmanCode || '').trim().toLowerCase();
          const bSpName = (b.header?.salespersonName || '').trim().toLowerCase();
          if ((bSpCode || bSpName) && (pSpCodeLow || pSpNameLow)) {
            if (bSpCode !== pSpCodeLow && bSpName !== pSpNameLow) return false;
          }
        }
        if (selectedEntity && selectedEntity !== 'All') {
          if (!matchesEntity(b.header?.branchName || (b as any).branchName, b.header?.branchId || b.branchId, selectedEntity, b.header?.salesmanCode || party.salesmanCode, b.header?.partyName)) {
            return false;
          }
        }
        const rawDate = b.header?.date || b.savedAt?.substring(0, 10) || (b as any).createdAt?.substring(0, 10) || '';
        const bDateIso = parseDateToISO(rawDate);
        const matchDate = (!startIso || !bDateIso || bDateIso >= startIso) && (!endIso || !bDateIso || bDateIso <= endIso);

        const isOffice = Boolean(b.isOfficeBill || b.header?.isOfficeBill);
        let matchType = true;
        if (selectedTypeFilter === 'Showroom') matchType = !isOffice;
        if (selectedTypeFilter === 'Office') matchType = isOffice;

        const matchSearch =
          !searchTerm ||
          matchesFlexibleSearch(party.name, searchTerm) ||
          matchesFlexibleSearch(b.header?.billNo || '', searchTerm) ||
          (b.lines || []).some((l) => matchesFlexibleSearch(`${(l as any).itemDescription || l.itemName || ''} ${(l as any).sizeSpec || ''}`, searchTerm, `${l.itemCode || ''}`));
        return matchParty && matchDate && matchType && matchSearch;
      });

      // Get all collections for this party
      const partyCollections = (selectedTypeFilter === 'Showroom' || selectedTypeFilter === 'Office') ? [] : collections.filter((c) => {
        if (isPartyCollectionClosed(c) || isYearEndSettlementCollection(c)) return false;
        const cPartyId = (c as any).partyId;
        if (cPartyId && party.id && cPartyId !== party.id && sameNameCount > 1) return false;
        const matchParty = (c.partyName || '').trim().toLowerCase() === pNameLow;
        if (!matchParty) return false;
        if (sameNameCount > 1 && !cPartyId) {
          const cSpCode = ((c as any).salesmanCode || '').trim().toLowerCase();
          const cEntity = (c.entityName || '').trim().toLowerCase();
          if ((cSpCode || cEntity) && (pSpCodeLow || pSpNameLow)) {
            if (cSpCode && pSpCodeLow && cSpCode !== pSpCodeLow) return false;
            if (!cSpCode && cEntity && pSpNameLow && cEntity !== pSpNameLow && !cEntity.includes('madhupur') && !cEntity.includes('ashulia')) {
              return false;
            }
          }
        }
        if (selectedEntity && selectedEntity !== 'All') {
          const colSpCode = (c as any).salesmanCode || party.salesmanCode;
          if (!matchesEntity(c.entityName, c.branchName, selectedEntity, colSpCode, c.partyName)) {
            return false;
          }
        }
        const cDateIso = parseDateToISO(c.date);
        const matchDate = (!startIso || cDateIso >= startIso) && (!endIso || cDateIso <= endIso);
        const matchSearch =
          !searchTerm ||
          matchesFlexibleSearch(party.name, searchTerm) ||
          matchesFlexibleSearch(c.mrNo || '', searchTerm) ||
          matchesFlexibleSearch(c.bankName || '', searchTerm) ||
          matchesFlexibleSearch(c.remarks || '', searchTerm);
        return matchParty && matchDate && matchSearch;
      });

      // Get all challans for this party if enabled
      const partyChallans = (selectedTypeFilter === 'Collection' || challanFilter === 'without_challan') ? [] : effectiveDeliveryChallans.filter((ch) => {
        if (closedChallanIdSet.has(ch.id)) return false;
        const chPartyId = (ch as any).partyId;
        if (chPartyId && party.id && chPartyId !== party.id && sameNameCount > 1) return false;
        const matchParty = (ch.partyName || '').trim().toLowerCase() === pNameLow;
        if (!matchParty) return false;
        if (sameNameCount > 1 && !chPartyId) {
          const chSp = (ch.salespersonName || '').trim().toLowerCase();
          if (chSp && pSpNameLow && chSp !== pSpNameLow) return false;
        }
        if (selectedEntity && selectedEntity !== 'All') {
          if (!matchesEntity((ch as any).branchName, (ch as any).branchId, selectedEntity, ch.salespersonName || party.salesmanCode, ch.partyName)) {
            return false;
          }
        }
        const chDateIso = parseDateToISO(ch.date || '');
        const matchDate = (!startIso || chDateIso >= startIso) && (!endIso || chDateIso <= endIso);
        const matchSearch =
          !searchTerm ||
          matchesFlexibleSearch(party.name, searchTerm) ||
          matchesFlexibleSearch(ch.challanNo || '', searchTerm) ||
          (ch.lines || []).some((l) => matchesFlexibleSearch(`${l.itemName || ''} ${l.sizeSpec || ''}`, searchTerm, `${l.itemCode || ''}`));
        return matchParty && matchDate && matchSearch;
      });

      interface TxRow {
        id: string;
        date: string;
        type: 'sale' | 'collection';
        refNo: string;
        particulars: string;
        discountPercent?: number;
        saleAmount: number;
        collectionAmount: number;
      }

      const txs: TxRow[] = [];

      if (challanFilter !== 'challan_only') {
        partyBills.forEach((b) => {
          const bNo = (b.header?.billNo || '').trim();
          const hasNo = bNo !== '' && bNo !== '-' && bNo !== 'N/A';
          txs.push({
            id: b.id,
            date: b.header?.date || b.savedAt.substring(0, 10),
            type: 'sale',
            refNo: hasNo ? bNo : 'Cash',
            particulars: b.header?.isOfficeBill ? 'Sales Invoice (Office)' : 'Sales Invoice (Showroom)',
            discountPercent: b.header?.discountPercent || 0,
            saleAmount: b.grandTotal || 0,
            collectionAmount: 0,
          });
        });
      }

      partyChallans.forEach((ch) => {
        const chAmount = ch.totalAmount || (ch.lines ? ch.lines.reduce((s, l) => s + (Number(l.amount) || Number(l.coilQty || 0) * Number(l.rate || 0)), 0) : 0);
        txs.push({
          id: ch.id,
          date: ch.date || '',
          type: 'sale',
          refNo: `Challan #${ch.challanNo}`,
          particulars: `Delivery Challan (${ch.status === 'billed' ? 'Billed' : ch.status === 'partial' ? 'Partial' : 'Pending'})`,
          discountPercent: 0,
          saleAmount: chAmount,
          collectionAmount: 0,
        });
      });

      partyCollections.forEach((c) => {
        const isCheque = c.paymentType === 'cheque' || (c.paymentType !== 'cash' && Boolean((c.chequeNo && c.chequeNo.trim()) || (c.bankName && c.bankName.trim() && !c.bankName.toLowerCase().includes('cash'))));
        txs.push({
          id: c.id,
          date: c.date,
          type: 'collection',
          refNo: isCheque ? 'Cheque' : 'Cash',
          particulars: isCheque ? `Cheque Collection (${c.bankName || 'Bank'})` : 'Cash Collection',
          saleAmount: 0,
          collectionAmount: c.amount || 0,
        });
      });

      txs.sort((a, b) => {
        const isoA = parseDateToISO(a.date) || a.date;
        const isoB = parseDateToISO(b.date) || b.date;
        return isoA.localeCompare(isoB);
      });

      // Calculate prior Opening Balance before startIso (incorporating unclosed prior transactions)
      let priorSales = 0;
      storedBills.forEach((b) => {
        if (isPartyBillClosed(b)) return;
        const matchParty = (b.header?.partyName || '').trim().toLowerCase() === party.name.trim().toLowerCase();
        if (!matchParty) return;
        const bDateIso = parseDateToISO(b.header?.date || b.savedAt || '');
        if (startIso && bDateIso < startIso) {
          priorSales += (b.grandTotal || 0);
        }
      });

      if (challanFilter !== 'without_challan') {
        effectiveDeliveryChallans.forEach((ch) => {
          if (closedChallanIdSet.has(ch.id)) return;
          const matchParty = (ch.partyName || '').trim().toLowerCase() === party.name.trim().toLowerCase();
          if (!matchParty) return;
          const chDateIso = parseDateToISO(ch.date || '');
          if (startIso && chDateIso < startIso) {
            const chAmount = ch.totalAmount || (ch.lines ? ch.lines.reduce((s, l) => s + (Number(l.amount) || Number(l.coilQty || 0) * Number(l.rate || 0)), 0) : 0);
            priorSales += chAmount;
          }
        });
      }

      let priorCollections = 0;
      collections.forEach((c) => {
        if (isPartyCollectionClosed(c) || isYearEndSettlementCollection(c)) return;
        const matchParty = (c.partyName || '').trim().toLowerCase() === party.name.trim().toLowerCase();
        if (!matchParty) return;
        const cDateIso = parseDateToISO(c.date || '');
        if (startIso && cDateIso < startIso) {
          priorCollections += (c.amount || 0);
        }
      });

      const basePartyOpening = activeClosingRecord
        ? (activeClosingRecord.customerBalances?.find((cb) => cb.partyId === party.id)?.openingBalance ?? (party.openingBalance || 0))
        : (latestClosedYear && (closedCutoffIso || !isAdmin)
            ? (latestClosedYear.customerBalances?.find((cb) => cb.partyId === party.id)?.newOpeningBalance ?? latestClosedYear.customerBalances?.find((cb) => cb.partyId === party.id)?.netClosingBalance ?? (party.openingBalance || 0))
            : (party.openingBalance || 0));

      const openingBalance = basePartyOpening + priorSales - priorCollections;

      let runBal = openingBalance;
      const rowsWithBal = txs.map((t) => {
        runBal += t.saleAmount - t.collectionAmount;
        return { ...t, runningBalance: runBal };
      });

      const totalSales = txs.reduce((sum, t) => sum + t.saleAmount, 0);
      const totalCollections = txs.reduce((sum, t) => sum + t.collectionAmount, 0);
      const closingBalance = openingBalance + totalSales - totalCollections;

      return {
        party,
        openingBalance,
        transactions: rowsWithBal,
        totalSales,
        totalCollections,
        closingBalance,
      };
    });

    // Always filter out customers who have no sales, no collection, and 0 opening balance
    // unless a specific individual customer is chosen in the dropdown filter
    const filtered = items.filter((i) => {
      const q = searchTerm.trim();
      if (!q) {
        return i.transactions.length > 0 || i.openingBalance !== 0 || selectedCustomer !== 'All';
      }
      const partyMatches =
        matchesFlexibleSearch(i.party.name, q) ||
        matchesFlexibleSearch(i.party.address || '', q) ||
        matchesFlexibleSearch(i.party.phone || '', q) ||
        matchesFlexibleSearch(i.party.salespersonName || '', q) ||
        matchesFlexibleSearch(i.party.salesmanCode || '', q);

      const hasMatchingItemBill = (storedBills || []).some(
        (b) => (b.header?.partyName || '').trim().toLowerCase() === i.party.name.trim().toLowerCase() &&
          (b.lines || []).some((l) => matchesFlexibleSearch(`${(l as any).itemDescription || l.itemName || ''} ${(l as any).sizeSpec || ''}`, q, `${l.itemCode || ''}`))
      );

      const hasMatchingTx = i.transactions.some((tx) =>
        matchesFlexibleSearch(tx.refNo || '', q) ||
        matchesFlexibleSearch(tx.particulars || '', q)
      );

      const hasTransactions = i.transactions.length > 0;
      return (partyMatches && (i.transactions.length > 0 || i.openingBalance !== 0 || selectedCustomer !== 'All')) || hasMatchingTx || hasMatchingItemBill;
    });

    // Sort customer ledger list: by customerSummarySortBy and customerSummarySortDir
    filtered.sort((a, b) => {
      let cmp = 0;
      if (customerSummarySortBy === 'salesperson') {
        const spA = a.party.salespersonName || a.party.salesmanCode || 'Showroom Direct';
        const spB = b.party.salespersonName || b.party.salesmanCode || 'Showroom Direct';
        cmp = spA.localeCompare(spB);
        if (cmp === 0) cmp = a.party.name.localeCompare(b.party.name);
      } else if (customerSummarySortBy === 'openingBalance') {
        cmp = (a.openingBalance || 0) - (b.openingBalance || 0);
      } else if (customerSummarySortBy === 'totalSales') {
        cmp = (a.totalSales || 0) - (b.totalSales || 0);
      } else if (customerSummarySortBy === 'totalCollections') {
        cmp = (a.totalCollections || 0) - (b.totalCollections || 0);
      } else if (customerSummarySortBy === 'closingBalance') {
        cmp = (a.closingBalance || 0) - (b.closingBalance || 0);
      } else {
        cmp = a.party.name.localeCompare(b.party.name);
      }
      return customerSummarySortDir === 'asc' ? cmp : -cmp;
    });

    return filtered;
  }, [parties, storedBills, effectiveDeliveryChallans, collections, selectedEntity, doesPartyBelongToSelectedCenter, matchesEntity, selectedCustomer, selectedMarketingPerson, selectedTypeFilter, challanFilter, startDate, endDate, searchTerm, closedBillIdSet, closedChallanIdSet, closedCollectionIdSet, customerSummarySortBy, customerSummarySortDir]);

  // Discount-wise Total Sales Breakdown Calculator (Grouped by Discount %)
  const discountWiseSummary = React.useMemo(() => {
    const discMap = new Map<number, {
      discountPercent: number;
      billCount: number;
      grossAmount: number;
      discountAmount: number;
      netAmount: number;
      coils: number;
    }>();

    // 1. Process filtered stored bills
    filteredBills.forEach((bill) => {
      if (selectedCustomer !== 'All' && (bill.header?.partyName || '').trim().toLowerCase() !== selectedCustomer.trim().toLowerCase()) {
        return;
      }
      if (selectedMarketingPerson !== 'All') {
        const party = parties.find((p) => (p.name || '').trim().toLowerCase() === (bill.header?.partyName || '').trim().toLowerCase());
        const salesRep = (party?.salespersonName || party?.salesmanCode || bill.header?.salespersonName || '').trim().toLowerCase();
        if (salesRep !== selectedMarketingPerson.trim().toLowerCase()) return;
      }

      const discPct = Number(bill.header?.discountPercent || 0);
      const gross = Number(bill.subtotal || (bill.grandTotal + (bill.discountAmount || 0)) || 0);
      const discAmt = Number(bill.discountAmount || 0);
      const net = Number(bill.grandTotal || (gross - discAmt));
      const coils = bill.lines ? bill.lines.reduce((s, l) => s + (Number(l.coilQty) || 0), 0) : 0;

      const existing = discMap.get(discPct) || {
        discountPercent: discPct,
        billCount: 0,
        grossAmount: 0,
        discountAmount: 0,
        netAmount: 0,
        coils: 0,
      };

      existing.billCount += 1;
      existing.grossAmount += gross;
      existing.discountAmount += discAmt;
      existing.netAmount += net;
      existing.coils += coils;

      discMap.set(discPct, existing);
    });

    // 2. Process filtered challans if included
    if (challanFilter !== 'without_challan') {
      filteredChallans.forEach((ch) => {
        if (selectedCustomer !== 'All' && (ch.partyName || '').trim().toLowerCase() !== selectedCustomer.trim().toLowerCase()) {
          return;
        }
        if (selectedMarketingPerson !== 'All') {
          const party = parties.find((p) => (p.name || '').trim().toLowerCase() === (ch.partyName || '').trim().toLowerCase());
          const salesRep = (party?.salespersonName || party?.salesmanCode || ch.salespersonName || '').trim().toLowerCase();
          if (salesRep !== selectedMarketingPerson.trim().toLowerCase()) return;
        }

        const discPct = 0; // Challans are flat / 0% discount
        const gross = Number(ch.totalAmount || (ch.lines ? ch.lines.reduce((s, l) => s + (Number(l.amount) || (Number(l.coilQty || 0) * Number(l.rate || 0))), 0) : 0));
        const discAmt = 0;
        const net = gross;
        const coils = ch.lines ? ch.lines.reduce((s, l) => s + (Number(l.coilQty) || 0), 0) : 0;

        const existing = discMap.get(discPct) || {
          discountPercent: discPct,
          billCount: 0,
          grossAmount: 0,
          discountAmount: 0,
          netAmount: 0,
          coils: 0,
        };

        existing.billCount += 1;
        existing.grossAmount += gross;
        existing.discountAmount += discAmt;
        existing.netAmount += net;
        existing.coils += coils;

        discMap.set(discPct, existing);
      });
    }

    // Sort ascending by discount percentage (0%, 5%, 8%, 10%, 12%, etc.)
    const list = Array.from(discMap.values()).sort((a, b) => a.discountPercent - b.discountPercent);

    const totalBills = list.reduce((s, d) => s + d.billCount, 0);
    const totalGross = list.reduce((s, d) => s + d.grossAmount, 0);
    const totalDiscAmt = list.reduce((s, d) => s + d.discountAmount, 0);
    const totalNet = list.reduce((s, d) => s + d.netAmount, 0);
    const totalCoils = list.reduce((s, d) => s + d.coils, 0);

    return {
      list,
      totalBills,
      totalGross,
      totalDiscAmt,
      totalNet,
      totalCoils,
    };
  }, [filteredBills, filteredChallans, selectedCustomer, selectedMarketingPerson, parties, challanFilter]);

  // Unified chronological sales & collection list matching uploaded image structure
  const unifiedStatementList = React.useMemo(() => {
    const items: Array<{
      id: string;
      date: string;
      partyName: string;
      address: string;
      salespersonName: string;
      billNo: string;
      billAmount: number;
      lessDiscount: number;
      netAmount: number;
      collection: number;
      remarks: string;
      coils: number;
    }> = [];

    // Filtered bills
    filteredBills.forEach((bill) => {
      const party = parties.find((p) => p.name?.trim().toLowerCase() === (bill.header?.partyName || '').trim().toLowerCase());
      const sp = bill.header?.salespersonName || bill.header?.salesmanCode || party?.salespersonName || party?.salesmanCode || 'Showroom Direct';

      const gross = bill.subtotal || bill.grandTotal;
      const disc = bill.discountAmount || 0;
      const net = bill.grandTotal;
      const totalCoils = bill.lines ? bill.lines.reduce((s, l) => s + Number(l.coilQty || 0), 0) : 0;
      const discRemarks = bill.header?.discountPercent ? `${bill.header.discountPercent}%` : '';
      const bNo = (bill.header?.billNo || '').trim();
      const hasBillNo = bNo !== '' && bNo !== '-' && bNo !== 'N/A';
      const billNoDisplay = hasBillNo ? bNo : 'Cash';

      items.push({
        id: bill.id,
        date: bill.header?.date || (bill.savedAt ? bill.savedAt.substring(0, 10) : ''),
        partyName: bill.header?.partyName || '-',
        address: bill.header?.address || party?.address || getPartyAddress(bill.header?.partyName) || '-',
        salespersonName: sp,
        billNo: billNoDisplay,
        billAmount: gross,
        lessDiscount: disc,
        netAmount: net,
        collection: 0,
        remarks: discRemarks,
        coils: totalCoils,
      });
    });

    // Filtered delivery challans
    if (challanFilter !== 'without_challan') {
      filteredChallans.forEach((ch) => {
        const party = parties.find((p) => p.name?.trim().toLowerCase() === (ch.partyName || '').trim().toLowerCase());
        const sp = ch.salespersonName || party?.salespersonName || party?.salesmanCode || 'Showroom Direct';
        
        if (selectedMarketingPerson !== 'All') {
          const selMarketingLower = selectedMarketingPerson.trim().toLowerCase();
          const spLower = sp.trim().toLowerCase();
          const partySp = (party?.salespersonName || '').trim().toLowerCase();
          const partyCode = (party?.salesmanCode || '').trim().toLowerCase();
          if (spLower !== selMarketingLower && partySp !== selMarketingLower && partyCode !== selMarketingLower) return;
        }
        if (selectedCustomer !== 'All' && (ch.partyName || '').trim().toLowerCase() !== selectedCustomer.trim().toLowerCase()) {
          return;
        }

        const totalCoils = ch.lines ? ch.lines.reduce((s, l) => s + Number(l.coilQty || 0), 0) : 0;
        const totalAmount = ch.totalAmount || (ch.lines ? ch.lines.reduce((s, l) => s + (Number(l.amount) || Number(l.coilQty || 0) * Number(l.rate || 0)), 0) : 0);

        items.push({
          id: ch.id,
          date: ch.date || '',
          partyName: ch.partyName || '-',
          address: ch.address || party?.address || getPartyAddress(ch.partyName) || '-',
          salespersonName: sp,
          billNo: `Challan #${ch.challanNo || 'N/A'}`,
          billAmount: totalAmount,
          lessDiscount: 0,
          netAmount: totalAmount,
          collection: 0,
          remarks: `Delivery Challan (${ch.status === 'billed' ? 'Billed' : ch.status === 'partial' ? 'Partial' : 'Pending'})`,
          coils: totalCoils,
        });
      });
    }

    // Filtered collections
    filteredCollections.forEach((col) => {
      const party = parties.find((p) => p.name?.trim().toLowerCase() === (col.partyName || '').trim().toLowerCase());
      const sp = party?.salespersonName || party?.salesmanCode || 'Showroom Direct';
      
      if (selectedMarketingPerson !== 'All') {
        const selMarketingLower = selectedMarketingPerson.trim().toLowerCase();
        const spLower = sp.trim().toLowerCase();
        const partySp = (party?.salespersonName || '').trim().toLowerCase();
        const partyCode = (party?.salesmanCode || '').trim().toLowerCase();
        if (spLower !== selMarketingLower && partySp !== selMarketingLower && partyCode !== selMarketingLower) return;
      }
      if (selectedCustomer !== 'All' && (col.partyName || '').trim().toLowerCase() !== selectedCustomer.trim().toLowerCase()) {
        return;
      }

      const isCheque = col.paymentType === 'cheque' || (col.paymentType !== 'cash' && Boolean((col.chequeNo && col.chequeNo.trim()) || (col.bankName && col.bankName.trim() && !col.bankName.toLowerCase().includes('cash'))));

      let rem = '';
      if (isCheque) {
        rem = col.bankName || 'PBL(PE)';
      } else if (isYearEndSettlementCollection(col)) {
        let cleaned = (col.remarks || '').trim();
        if (cleaned) {
          // If remarks contains "FY 2026 Year-End Settlement Payment" or similar, transform to "FY 2026"
          cleaned = cleaned
            .replace(/Year-End\s*Settlement\s*Payment/gi, '')
            .replace(/Year-End\s*Settlement/gi, '')
            .replace(/Year-End\s*Closing/gi, '')
            .replace(/Settlement\s*Payment/gi, '')
            .replace(/Settlement\s*Cash/gi, '')
            .replace(/Closing\s*Settlement\s*for\s*[^,]*/gi, '')
            .trim();
        }
        rem = cleaned || 'FY 2026';
      } else {
        // Cash collection: Do not show numeric MR numbers (e.g. 002, 001), 'MR# ...', or 'Cash' in remarks
        if (col.remarks && col.remarks.trim()) {
          const cleaned = col.remarks
            .replace(/FY\s*2026\s*Year-End\s*Settlement\s*Payment/gi, '')
            .replace(/Year-End\s*Settlement\s*Payment/gi, '')
            .replace(/MR\s*#?\s*-?\s*\d+/gi, '')
            .replace(/\b(MR|Mr|MR#|Mr\.)\b/gi, '')
            .replace(/^[#\s:-]+/, '')
            .trim();
          // If cleaned is purely digits (like 002, 001), empty, or literally 'cash', keep remarks empty
          if (!cleaned || /^\d+$/.test(cleaned) || cleaned.toLowerCase() === 'cash') {
            rem = '';
          } else {
            rem = cleaned;
          }
        } else {
          rem = '';
        }
      }

      const collectionBillNoDisplay = 'Cash';

      items.push({
        id: col.id,
        date: col.date,
        partyName: col.partyName || col.entityName || '-',
        address: party?.address || getPartyAddress(col.partyName) || '-',
        salespersonName: sp,
        billNo: collectionBillNoDisplay,
        billAmount: 0,
        lessDiscount: 0,
        netAmount: 0,
        collection: col.amount,
        remarks: rem,
        coils: 0,
      });
    });

    // Flexible Sorting based on user selection
    items.sort((a, b) => {
      let cmp = 0;
      if (statementSortBy === 'marketing') {
        cmp = (a.salespersonName || '').localeCompare(b.salespersonName || '');
        if (cmp === 0) {
          const dateA = parseDateToISO(a.date) || a.date;
          const dateB = parseDateToISO(b.date) || b.date;
          cmp = dateA.localeCompare(dateB);
        }
        if (cmp === 0) {
          const numA = parseInt(a.billNo.replace(/\D/g, ''), 10) || 0;
          const numB = parseInt(b.billNo.replace(/\D/g, ''), 10) || 0;
          cmp = numA - numB;
        }
      } else if (statementSortBy === 'date') {
        const dateA = parseDateToISO(a.date) || a.date;
        const dateB = parseDateToISO(b.date) || b.date;
        cmp = dateA.localeCompare(dateB);
        if (cmp === 0) {
          const numA = parseInt(a.billNo.replace(/\D/g, ''), 10) || 0;
          const numB = parseInt(b.billNo.replace(/\D/g, ''), 10) || 0;
          cmp = numA - numB;
        }
      } else if (statementSortBy === 'billNo') {
        const numA = parseInt(a.billNo.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.billNo.replace(/\D/g, ''), 10) || 0;
        cmp = numA - numB;
        if (cmp === 0) {
          cmp = (a.billNo || '').localeCompare(b.billNo || '');
        }
      } else if (statementSortBy === 'party') {
        cmp = (a.partyName || '').localeCompare(b.partyName || '');
        if (cmp === 0) {
          const dateA = parseDateToISO(a.date) || a.date;
          const dateB = parseDateToISO(b.date) || b.date;
          cmp = dateA.localeCompare(dateB);
        }
      } else if (statementSortBy === 'address') {
        cmp = (a.address || '').localeCompare(b.address || '');
      } else if (statementSortBy === 'billAmount') {
        cmp = (a.billAmount || 0) - (b.billAmount || 0);
      } else if (statementSortBy === 'lessDiscount') {
        cmp = (a.lessDiscount || 0) - (b.lessDiscount || 0);
      } else if (statementSortBy === 'netAmount' || statementSortBy === 'amount') {
        const amtA = a.netAmount > 0 ? a.netAmount : a.collection;
        const amtB = b.netAmount > 0 ? b.netAmount : b.collection;
        cmp = amtA - amtB;
      } else if (statementSortBy === 'collection') {
        cmp = (a.collection || 0) - (b.collection || 0);
      } else if (statementSortBy === 'remarks') {
        cmp = (a.remarks || '').localeCompare(b.remarks || '');
      } else if (statementSortBy === 'coils') {
        cmp = (a.coils || 0) - (b.coils || 0);
      }
      return statementSortDir === 'asc' ? cmp : -cmp;
    });

    return items;
  }, [filteredBills, filteredChallans, filteredCollections, parties, selectedMarketingPerson, selectedCustomer, challanFilter, statementSortBy, statementSortDir]);

  const unifiedTotalNetAmount = unifiedStatementList.reduce((s, i) => s + i.netAmount, 0);
  const unifiedTotalCollection = unifiedStatementList.reduce((s, i) => s + i.collection, 0);
  const unifiedTotalCoils = unifiedStatementList.reduce((s, i) => s + i.coils, 0);

  const grandTotalCustomerOpeningBalance = customerWiseData.reduce((s, c) => s + (c.openingBalance || 0), 0);
  const grandTotalCustomerSales = customerWiseData.reduce((s, c) => s + c.totalSales, 0);
  const grandTotalCustomerCollections = customerWiseData.reduce((s, c) => s + c.totalCollections, 0);
  const grandTotalCustomerNetBalance = grandTotalCustomerOpeningBalance + grandTotalCustomerSales - grandTotalCustomerCollections;

  // Print Preview Modal State
  const [showPrintPreviewModal, setShowPrintPreviewModal] = useState(false);
  const [previewZoom, setPreviewZoom] = useState<'80%' | '100%' | '115%'>('100%');

  const handlePrint = () => {
    setShowPrintPreviewModal(true);
  };
  useAutoPrintOnOpen(
    showPrintPreviewModal,
    () => window.print(),
    () => setShowPrintPreviewModal(false)
  );

  // Single Selected Party for Year-End Closing
  const singleSelectedParty = useMemo(() => {
    if (statementViewMode !== 'grouped') return null;
    if (customerWiseData.length === 1) {
      return customerWiseData[0].party;
    }
    if (selectedCustomer !== 'All') {
      const found = parties.find(
        (p) =>
          p.name?.trim().toLowerCase() === selectedCustomer.trim().toLowerCase() ||
          p.id === selectedCustomer
      );
      if (found) return found;
    }
    return null;
  }, [statementViewMode, customerWiseData, selectedCustomer, parties]);

  // Render Discount-Wise Total Sales Summary Helper (Plain statement lines format, no table)
  const renderDiscountWiseSummaryTable = (isPrint: boolean = false) => {
    if (discountWiseSummary.list.length === 0) return null;

    return (
      <div className={`mt-5 p-3.5 rounded-lg font-mono text-xs ${
        isPrint 
          ? 'bg-white border border-black text-black break-inside-avoid page-break-inside-avoid shadow-none' 
          : 'bg-slate-50 border border-slate-300 text-slate-900 shadow-xs'
      }`}>
        <div className="flex items-center space-x-2 border-b border-black pb-1.5 mb-2 font-sans">
          <Receipt className="w-4 h-4 text-black no-print" />
          <span className="text-xs font-black uppercase tracking-wider text-black">
            Discount-Wise Total Sales Summary
          </span>
        </div>

        <div className="space-y-1">
          {discountWiseSummary.list.map((group, gIdx) => {
            const label = group.discountPercent === 0 ? '0% (Flat) Sales' : `${group.discountPercent}% Sales`;
            const billText = `${group.billCount} ${group.billCount === 1 ? 'Bill' : 'Bills'}`;
            const coilText = `${group.coils} coils`;

            return (
              <div key={`disc-${group.discountPercent}-${gIdx}`} className="flex flex-wrap items-center justify-between gap-x-4 py-0.5 text-xs">
                <span className="font-bold">
                  <span className="inline-block min-w-[110px]">{label}=</span> <span>৳{formatAmount(group.netAmount)}/-</span>
                </span>
                <span className="font-semibold text-slate-800 print:text-black">
                  {billText}, {coilText}
                </span>
              </div>
            );
          })}

          <div className="border-t border-black my-1.5 border-dashed"></div>

          <div className="flex flex-wrap items-center justify-between gap-x-4 pt-0.5 font-black text-xs sm:text-sm">
            <span>
              <span className="inline-block min-w-[110px] uppercase">Total Sales=</span> <span>৳{formatAmount(discountWiseSummary.totalNet)}/-</span>
            </span>
            <span className="font-black text-xs sm:text-sm">
              {discountWiseSummary.totalBills} {discountWiseSummary.totalBills === 1 ? 'Bill' : 'Bills'}, {discountWiseSummary.totalCoils} coils
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-12 font-sans">
      <div className={showPrintPreviewModal ? 'no-print space-y-6' : 'space-y-6'}>
      {/* HEADER BAR */}
      <div className="cyber-glass-card text-white p-4 rounded-2xl border border-cyan-500/25 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <BarChart3 className="w-5 h-5 text-cyan-300" />
          <h2 className="text-lg font-extrabold tracking-tight text-white">Reports & Analytical Dashboard</h2>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-cyan-200/80 uppercase tracking-wider">Statement View:</span>
          <select
            value={activeReportTab}
            onChange={(e) => setActiveReportTab(e.target.value as any)}
            className="bg-[#061520] text-cyan-200 border border-cyan-500/30 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-cyan-400 cursor-pointer"
          >
            <option value="customer_wise_sales_collection">Customer Sales & Collection</option>
            <option value="office_report">Office Statement</option>
            <option value="party_bank_details">Party-Wise Bank Details</option>
            <option value="special_bank_cash">Bank & Cash Summary</option>
            <option value="bill_wise_sales">Bill-Wise Invoices</option>
          </select>
        </div>
      </div>

      {/* GLOBAL CONTROLS & FILTER BAR (CYBER TEAL GLASS BAR STYLE) */}
      <div className="bg-[#081e2d]/85 backdrop-blur-xl p-2.5 px-3.5 rounded-2xl border border-cyan-500/25 flex flex-col space-y-2 text-xs text-white shadow-lg no-print relative z-30">
        {/* Row 1: Core Dimensions (Sales Center, Salesman, Customer / Party, Bill Type) */}
        <div className="flex items-center gap-2 flex-wrap py-0.5 relative z-20 overflow-visible">
          {/* Sales Center / Showroom Filter */}
          <SalesCenterSearchFilter
            value={selectedEntity}
            onChange={(newVal) => {
              setSelectedEntity(newVal);
              if (selectedMarketingPerson !== 'All') {
                const nextSps = filterSalespersonsByBranch(visibleSalespersons, newVal, effectiveBranches, currentUser);
                if (!nextSps.some((s) => s.name.toLowerCase() === selectedMarketingPerson.toLowerCase())) {
                  setSelectedMarketingPerson('All');
                }
              }
            }}
            options={effectiveBranches.map((b) => ({ id: b.name, name: b.name, label: b.name, address: b.address }))}
            isLocked={!isSuperOrAccounts && effectiveBranches.length <= 1}
            lockedReason="Locked to assigned sales center"
            includeAllOption={isSuperOrAccounts || effectiveBranches.length > 1}
            allOptionLabel={
              isSuperOrAccounts
                ? `All Sales Centers (${effectiveBranches.length})`
                : `All Assigned Centers (${effectiveBranches.length})`
            }
            allOptionValue="All"
            label="Sales Center:"
            theme="dark"
            size="sm"
            widthClass="min-w-0 w-full sm:w-auto sm:min-w-[170px] sm:max-w-[240px]"
          />

          {/* Marketing Person / Salesman Filter */}
          <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 h-[34px] shrink-0">
            <span className="font-bold text-cyan-200/80 text-[11px] flex items-center space-x-1 whitespace-nowrap">
              <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Salesman:</span>
            </span>
            <select
              value={selectedMarketingPerson}
              onChange={(e) => setSelectedMarketingPerson(e.target.value)}
              className="bg-transparent text-cyan-100 font-bold text-xs outline-none cursor-pointer max-w-[130px] sm:max-w-[170px] truncate [&>option]:bg-[#061520] [&>option]:text-white"
            >
              <option value="All">All Salesmen ({centerFilteredSalespersons.length})</option>
              {centerFilteredSalespersons.map((sp) => (
                <option key={sp.id} value={sp.name}>
                  {sp.code ? `${sp.code} - ${sp.name}` : sp.name}
                </option>
              ))}
            </select>
          </div>

          {/* Customer / Party Filter */}
          <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 h-[34px] shrink-0">
            <span className="font-bold text-cyan-200/80 text-[11px] flex items-center space-x-1 whitespace-nowrap">
              <Building2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Party:</span>
            </span>
            <select
              value={selectedCustomer}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedCustomer(val);
                if (val && val !== 'All') {
                  const now = new Date();
                  setStartDate(formatDateDDMMYY(new Date(now.getFullYear(), 0, 1)));
                  setEndDate(formatDateDDMMYY(now));
                }
              }}
              className="bg-transparent text-cyan-100 font-bold text-xs outline-none cursor-pointer max-w-[140px] sm:max-w-[190px] truncate [&>option]:bg-[#061520] [&>option]:text-white"
            >
              <option value="All">All Parties ({filteredPartiesForDropdown.length})</option>
              {filteredPartiesForDropdown.map((p, pIdx) => (
                <option key={p.id ? `${p.id}-${pIdx}` : `party-${pIdx}`} value={p.name}>
                  {getPartyDisplayWithAddress(p.name, p.address)}
                </option>
              ))}
            </select>
          </div>

          {/* Bill / Transaction Type Filter */}
          <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 h-[34px] shrink-0">
            <span className="font-bold text-cyan-200/80 text-[11px] flex items-center space-x-1 whitespace-nowrap">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>Bill Type:</span>
            </span>
            <select
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value as any)}
              className="bg-transparent text-cyan-100 font-bold text-xs outline-none cursor-pointer [&>option]:bg-[#061520] [&>option]:text-white"
            >
              <option value="All">All Bills & Collections</option>
              <option value="Showroom">Sales Center Bills Only</option>
              <option value="Office">Office Bills Only</option>
              <option value="Collection">Collections Only</option>
            </select>
          </div>
        </div>

        {/* Row 2: Search, Period Selection, Custom Range & Action Buttons (All in One Line) */}
        <div className="pt-1.5 border-t border-cyan-500/20 flex items-center justify-between gap-2 flex-wrap py-0.5 relative z-10 overflow-visible">
          {/* Left: Search Box with Close / Clear sign */}
          <div className="flex items-center space-x-1.5 w-full sm:w-auto">
            <div className="relative w-full sm:w-52">
              <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search party, bank, bill #..."
                className="w-full h-[34px] pl-8 pr-7 py-1 text-xs bg-[#061520]/90 text-white placeholder-slate-400 border border-cyan-500/30 rounded-xl font-medium focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-all"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs p-0.5 cursor-pointer font-bold transition-colors"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Middle: Period Selection */}
          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto min-w-0">
            <StandardPeriodFilterBar
              period={periodPreset}
              onSelectPeriod={handleSelectPeriodPreset}
              customStartDate={startDate}
              customEndDate={endDate}
              onCustomStartDateChange={(val) => {
                setStartDate(val);
                setPeriodPreset('custom');
              }}
              onCustomEndDateChange={(val) => {
                setEndDate(val);
                setPeriodPreset('custom');
              }}
              theme="dark"
            />
          </div>

        </div>
      </div>

      {/* ========================================================= */}
      {/* TAB 0: EXECUTIVE TRANSACTION FEED & STOCK DASHBOARD */}
      {/* ========================================================= */}
      {false && (
        <div className="space-y-6">
          {/* VISUAL ANALYTICS WIDGETS ROW */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 no-print">
            {/* Widget A: Payment Method Breakdown */}
            <div className="bg-white p-5 rounded-2xl shadow-md border border-slate-300 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="text-sm font-black text-slate-950 flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-slate-900" />
                  <span>Collection Mode Split</span>
                </h3>
                <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                  Cash vs. Cheque vs. Bank
                </span>
              </div>

              {(() => {
                const totalColls = totalCashReceivedSum + totalBankCollectionsSum + totalBankDepositsSum || 1;
                const cashPct = Math.round((totalCashReceivedSum / totalColls) * 100);
                const chequePct = Math.round((totalBankCollectionsSum / totalColls) * 100);
                const depPct = Math.min(100, 100 - cashPct - chequePct);

                return (
                  <div className="space-y-3.5 text-xs">
                    <div>
                      <div className="flex justify-between font-bold mb-1 text-slate-900">
                        <span className="flex items-center gap-1">
                          <Coins className="w-3.5 h-3.5 text-teal-600" /> Cash Received
                        </span>
                        <span className="font-mono">৳{formatAmount(totalCashReceivedSum)} ({cashPct}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200">
                        <div className="bg-slate-900 h-2.5 rounded-full transition-all" style={{ width: `${cashPct}%` }}></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between font-bold mb-1 text-slate-900">
                        <span className="flex items-center gap-1">
                          <Receipt className="w-3.5 h-3.5 text-purple-600" /> Cheque Collections
                        </span>
                        <span className="font-mono">৳{formatAmount(totalBankCollectionsSum)} ({chequePct}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200">
                        <div className="bg-slate-700 h-2.5 rounded-full transition-all" style={{ width: `${chequePct}%` }}></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between font-bold mb-1 text-slate-900">
                        <span className="flex items-center gap-1">
                          <Landmark className="w-3.5 h-3.5 text-indigo-600" /> Direct Bank Deposits
                        </span>
                        <span className="font-mono">৳{formatAmount(totalBankDepositsSum)} ({depPct}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200">
                        <div className="bg-slate-500 h-2.5 rounded-full transition-all" style={{ width: `${depPct}%` }}></div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Widget B: Top Customer Accounts Leaderboard */}
            <div className="bg-white p-5 rounded-2xl shadow-md border border-slate-300 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="text-sm font-black text-slate-950 flex items-center gap-2">
                  <Award className="w-4 h-4 text-slate-900" />
                  <span>Top Customer Accounts (Sales)</span>
                </h3>
                <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                  Top Drivers
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                {(() => {
                  const partySalesMap = new Map<string, number>();
                  storedBills.forEach(b => {
                    const bd = b.header?.date || b.savedAt.substring(0, 10);
                    if (startDate && endDate && (bd < startDate || bd > endDate)) return;
                    const pName = b.header?.partyName || 'Cash Customer';
                    partySalesMap.set(pName, (partySalesMap.get(pName) || 0) + (b.grandTotal || 0));
                  });

                  const sortedTop = Array.from(partySalesMap.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 4);

                  if (sortedTop.length === 0) {
                    return <p className="text-slate-400 italic text-center py-4">No sales recorded in this period.</p>;
                  }

                  const maxSales = sortedTop[0][1] || 1;

                  return sortedTop.map(([pName, amt], idx) => {
                    const pct = Math.round((amt / maxSales) * 100);
                    return (
                      <div key={pName} className="space-y-1">
                        <div className="flex justify-between font-bold">
                          <span className="text-slate-900 truncate max-w-[180px]">
                            {idx + 1}. {pName}
                          </span>
                          <span className="font-mono text-slate-950 font-black">৳{formatAmount(amt)}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                          <div className="bg-slate-900 h-2 rounded-full" style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Widget C: Stock Health & Variety Status */}
            <div className="bg-white p-5 rounded-2xl shadow-md border border-slate-300 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="text-sm font-black text-slate-950 flex items-center gap-2">
                  <Package className="w-4 h-4 text-slate-900" />
                  <span>Stock Status Breakdown</span>
                </h3>
                <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                  Inventory Health
                </span>
              </div>

              {(() => {
                const inStockCount = activeItems.filter(i => (i.openingStock || 0) > 10).length;
                const lowStockCount = activeItems.filter(i => (i.openingStock || 0) > 0 && (i.openingStock || 0) <= 10).length;
                const outOfStockCount = activeItems.filter(i => (i.openingStock || 0) <= 0).length;

                return (
                  <div className="grid grid-cols-3 gap-2 text-center pt-1">
                    <div className="bg-slate-900 text-white p-3 rounded-xl border border-slate-800">
                      <div className="text-xs font-bold text-slate-300">In Stock</div>
                      <div className="text-xl font-black mt-1">{inStockCount}</div>
                      <div className="text-[10px] text-slate-400 font-semibold mt-0.5">&gt; 10 Coils</div>
                    </div>

                    <div className="bg-amber-50 text-amber-950 p-3 rounded-xl border border-amber-300">
                      <div className="text-xs font-bold text-amber-900">Low Stock</div>
                      <div className="text-xl font-black mt-1">{lowStockCount}</div>
                      <div className="text-[10px] text-amber-800 font-semibold mt-0.5">1 - 10 Coils</div>
                    </div>

                    <div className="bg-rose-50 text-rose-950 p-3 rounded-xl border border-rose-300">
                      <div className="text-xs font-bold text-rose-900">Out of Stock</div>
                      <div className="text-xl font-black mt-1">{outOfStockCount}</div>
                      <div className="text-[10px] text-rose-800 font-semibold mt-0.5">0 Coils</div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* DYNAMIC SEARCHABLE ITEM STOCK DIRECTORY */}
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Package className="w-5 h-5 text-emerald-600" />
                  <span>Item Name & Current Stock Directory</span>
                </h3>
                <p className="text-xs text-slate-500">Live search item names, size specs, rates, and current sales center stock levels.</p>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={itemSearchTerm}
                  onChange={(e) => setItemSearchTerm(e.target.value)}
                  placeholder="Search item name, spec..."
                  className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                />
              </div>
            </div>

            <div className="overflow-x-auto max-h-80 border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-900 text-white font-extrabold z-10">
                  <tr>
                    <th className="py-2.5 px-3 border-r border-slate-700 text-center w-12">#</th>
                    <th className="py-2.5 px-3 border-r border-slate-700">Item Name</th>
                    <th className="py-2.5 px-3 border-r border-slate-700">Size Spec</th>
                    <th className="py-2.5 px-3 border-r border-slate-700 text-right">Unit Rate (৳)</th>
                    <th className="py-2.5 px-3 border-r border-slate-700 text-right">Current Stock</th>
                    <th className="py-2.5 px-3 text-center">Stock Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-800">
                  {(() => {
                    const displayItemList = activeItems && activeItems.length > 0 ? activeItems : defaultItems.filter(i => i.isActive !== false);
                    const q = itemSearchTerm.toLowerCase().trim();
                    const filteredItems = displayItemList.filter(i => {
                      if (!q) return true;
                      return matchesFlexibleSearch(`${i.name} ${i.sizeSpec || ''} ${i.category || ''}`, q, `${i.category || ''} ${i.code || ''}`);
                    });

                    if (filteredItems.length === 0) {
                      return (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-slate-400 italic font-medium">
                            No matching items found. Try a different search term.
                          </td>
                        </tr>
                      );
                    }

                    const grouped = groupItemsByCategoryOrder(filteredItems, getAllCategories());

                    return grouped.groups.map((grp) => (
                      <React.Fragment key={grp.category}>
                        <tr className="bg-slate-100 border-y border-slate-300">
                          <td colSpan={6} className="py-1.5 px-3 text-[10px] font-black uppercase tracking-wider text-slate-700">
                            {grp.category} ({grp.items.length})
                          </td>
                        </tr>
                        {grp.items.map(({ item, flatIndex: idx }) => {
                          const itemNameKey = item.name.trim().toLowerCase();
                          const itemCodeKey = (item.code || '').trim().toLowerCase();

                          // Factory imports for this item
                          const factoryImpQty = factoryImports.reduce((sum, ch) => {
                            const lineQty = ch.lines.reduce((lSum, l) => {
                              const lName = l.itemName.trim().toLowerCase();
                              const lCode = (l.itemCode || '').trim().toLowerCase();
                              if (lName === itemNameKey || (itemCodeKey && lCode === itemCodeKey)) {
                                return lSum + (l.quantity || 0);
                              }
                              return lSum;
                            }, 0);
                            return sum + lineQty;
                          }, 0);

                          // Party returns for this item
                          const partyRetQty = stockReturns
                            .filter(r => r.returnType === 'party_return')
                            .reduce((sum, ch) => {
                              const lineQty = ch.lines.reduce((lSum, l) => {
                                const lName = l.itemName.trim().toLowerCase();
                                const lCode = (l.itemCode || '').trim().toLowerCase();
                                if (lName === itemNameKey || (itemCodeKey && lCode === itemCodeKey)) {
                                  return lSum + (l.quantity || 0);
                                }
                                return lSum;
                              }, 0);
                              return sum + lineQty;
                            }, 0);

                          // Showroom sales for this item
                          const showroomSoldQty = storedBills
                            .filter(b => !b.isOfficeBill && !b.header?.isOfficeBill)
                            .reduce((sum, b) => {
                              const lineQty = b.lines.reduce((lSum, l) => {
                                const lName = l.itemDescription.trim().toLowerCase();
                                if (lName === itemNameKey || lName.includes(itemNameKey)) {
                                  return lSum + (l.coilQty || 0);
                                }
                                return lSum;
                              }, 0);
                              return sum + lineQty;
                            }, 0);

                          // Factory returns for this item
                          const factoryRetQty = stockReturns
                            .filter(r => r.returnType === 'factory_return')
                            .reduce((sum, ch) => {
                              const lineQty = ch.lines.reduce((lSum, l) => {
                                const lName = l.itemName.trim().toLowerCase();
                                const lCode = (l.itemCode || '').trim().toLowerCase();
                                if (lName === itemNameKey || (itemCodeKey && lCode === itemCodeKey)) {
                                  return lSum + (l.quantity || 0);
                                }
                                return lSum;
                              }, 0);
                              return sum + lineQty;
                            }, 0);

                          const opening = item.openingStock || 0;
                          const added = Math.max(Number(item.addedStock) || 0, factoryImpQty);
                          const currentStock = opening + added + partyRetQty - showroomSoldQty - factoryRetQty;

                          return (
                            <tr key={item.id || idx} className="hover:bg-slate-50 transition-colors">
                              <td className="py-2 px-3 text-center font-mono font-bold text-slate-500">{idx + 1}</td>
                              <td className="py-2 px-3 font-bold text-slate-900">{item.name}</td>
                              <td className="py-2 px-3 font-medium text-slate-600">{item.sizeSpec || '-'}</td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">৳{(item.rate || 0).toLocaleString()}</td>
                              <td className="py-2 px-3 text-right font-mono font-black text-emerald-800 text-sm">
                                {currentStock.toLocaleString()} <span className="text-[10px] font-normal text-slate-500">{item.unit || 'Coils'}</span>
                              </td>
                              <td className="py-2 px-3 text-center">
                                {currentStock > 10 ? (
                                  <span className="inline-block bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md text-[10px] font-extrabold">In Stock</span>
                                ) : currentStock > 0 ? (
                                  <span className="inline-block bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md text-[10px] font-extrabold">Low Stock</span>
                                ) : (
                                  <span className="inline-block bg-rose-100 text-rose-800 px-2 py-0.5 rounded-md text-[10px] font-extrabold">Out of Stock</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* DYNAMIC ALL TRANSACTIONS SALES & COLLECTION FEED TABLE */}
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-amber-600" />
                  <span>Executive Transaction Feed</span>
                </h3>
                <p className="text-xs text-slate-500">Live stream of recorded sales bills, collections, and bank deposits.</p>
              </div>

              {/* Feed Type Filter Pills & Search */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setFeedTypeFilter('All')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      feedTypeFilter === 'All' ? 'bg-slate-900 text-white font-black' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All Feed
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedTypeFilter('Sale')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      feedTypeFilter === 'Sale' ? 'bg-emerald-600 text-white font-black' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Sales Invoices
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedTypeFilter('Collection')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      feedTypeFilter === 'Collection' ? 'bg-amber-600 text-white font-black' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Collections
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedTypeFilter('BankDeposit')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      feedTypeFilter === 'BankDeposit' ? 'bg-indigo-600 text-white font-black' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Bank Deposits
                  </button>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filter by party, ref #..."
                    className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 bg-slate-50"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[500px] border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-900 text-white font-extrabold z-10">
                  <tr>
                    <th className="py-2.5 px-3 border-r border-slate-700 text-center w-12">#</th>
                    <th className="py-2.5 px-3 border-r border-slate-700 w-24">Date</th>
                    <th className="py-2.5 px-3 border-r border-slate-700 w-28">Type</th>
                    <th className="py-2.5 px-3 border-r border-slate-700">Ref / Invoice / MR #</th>
                    <th className="py-2.5 px-3 border-r border-slate-700">Party / Customer / Bank</th>
                    <th className="py-2.5 px-3 border-r border-slate-700 text-right">Sale Amount (৳)</th>
                    <th className="py-2.5 px-3 text-right">Collection / Deposit (৳)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-800">
                  {(() => {
                    // Combine sales bills, collections, and bank deposits
                    const allTxs: Array<{
                      id: string;
                      date: string;
                      type: 'Sale' | 'Collection' | 'BankDeposit';
                      refNo: string;
                      partyName: string;
                      saleAmount: number;
                      collectionAmount: number;
                    }> = [];

                    if (feedTypeFilter === 'All' || feedTypeFilter === 'Sale') {
                      storedBills.forEach((b) => {
                        if (isPartyBillClosed(b)) return;
                        const bDate = b.header?.date || b.savedAt.substring(0, 10);
                        if (startDate && endDate && (bDate < startDate || bDate > endDate)) return;
                        allTxs.push({
                          id: b.id,
                          date: bDate,
                          type: 'Sale',
                          refNo: b.header?.billNo || 'Bill Invoice',
                          partyName: b.header?.partyName || 'Cash Customer',
                          saleAmount: b.grandTotal || 0,
                          collectionAmount: 0
                        });
                      });
                    }

                    if (feedTypeFilter === 'All' || feedTypeFilter === 'Collection') {
                      collections.forEach((c) => {
                        if (isPartyCollectionClosed(c) || isYearEndSettlementCollection(c)) return;
                        const cDate = c.date || (c as any).createdAt?.substring(0, 10) || '';
                        if (startDate && endDate && (cDate < startDate || cDate > endDate)) return;
                        allTxs.push({
                          id: c.id,
                          date: cDate,
                          type: 'Collection',
                          refNo: '', // Blank MR# on report page
                          partyName: c.partyName || 'Customer Collection',
                          saleAmount: 0,
                          collectionAmount: c.amount || 0
                        });
                      });
                    }

                    if (feedTypeFilter === 'All' || feedTypeFilter === 'BankDeposit') {
                      bankDeposits.forEach((d) => {
                        if (startDate && endDate && (d.date < startDate || d.date > endDate)) return;
                        allTxs.push({
                          id: d.id,
                          date: d.date,
                          type: 'BankDeposit',
                          refNo: d.displayTag ? `Deposit (${d.displayTag})` : 'Bank Deposit',
                          partyName: (d.bankName === 'H/O' || d.displayTag === 'H/O') ? 'H/O' : `${d.bankName} - ${d.accountName}`,
                          saleAmount: 0,
                          collectionAmount: d.amount || 0
                        });
                      });
                    }

                    // Sort chronologically descending
                    allTxs.sort((a, b) => b.date.localeCompare(a.date));

                    const q = searchTerm.toLowerCase().trim();
                    const filteredTxs = allTxs.filter((t) => {
                      if (!q) return true;
                      return `${t.partyName} ${t.refNo} ${t.date} ${t.type}`.toLowerCase().includes(q);
                    });

                    if (filteredTxs.length === 0) {
                      return (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400 italic font-medium">
                            No transactions found matching criteria.
                          </td>
                        </tr>
                      );
                    }

                    return filteredTxs.map((tx, idx) => (
                      <tr key={tx.id || idx} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-500">{idx + 1}</td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-700 whitespace-nowrap">{formatDateDDMMYY(tx.date)}</td>
                        <td className="py-2 px-3">
                          {tx.type === 'Sale' ? (
                            <span className="inline-block bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded font-extrabold text-[10px]">
                              Sales Bill
                            </span>
                          ) : tx.type === 'Collection' ? (
                            <span className="inline-block bg-amber-100 text-amber-900 px-2 py-0.5 rounded font-extrabold text-[10px]">
                              Collection
                            </span>
                          ) : (
                            <span className="inline-block bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded font-extrabold text-[10px]">
                              Bank Deposit
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono font-extrabold text-slate-900">{tx.refNo}</td>
                        <td className="py-2 px-3 font-bold text-slate-900">{tx.partyName}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                          {tx.saleAmount > 0 ? `৳${formatAmount(tx.saleAmount)}` : '-'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-amber-700">
                          {tx.collectionAmount > 0 ? `৳${formatAmount(tx.collectionAmount)}` : '-'}
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 1: CUSTOMER-WISE SALES & COLLECTION REPORT */}
      {/* ========================================================= */}
      {activeReportTab === 'customer_wise_sales_collection' && (
        <div ref={printRef} className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 max-w-6xl mx-auto font-sans print:p-0 print:shadow-none print:border-none print:max-w-full space-y-6">
            
            {/* Mode Switcher - No Print */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-100 p-2.5 rounded-xl border border-slate-300 no-print">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Report Layout:</span>
                <button
                  type="button"
                  onClick={() => setStatementViewMode('unified')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    statementViewMode === 'unified'
                      ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                      : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300'
                  }`}
                >
                  Unified Sales & Collection Table
                </button>
                <button
                  type="button"
                  onClick={() => setStatementViewMode('grouped')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    statementViewMode === 'grouped'
                      ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                      : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300'
                  }`}
                >
                  Customer Ledgers view
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-700">
                {/* Sales Center Filter for Customer Sales & Collection */}
                <SalesCenterSearchFilter
                  value={selectedEntity}
                  onChange={(newVal) => {
                    setSelectedEntity(newVal);
                    if (selectedMarketingPerson !== 'All') {
                      const nextSps = filterSalespersonsByBranch(visibleSalespersons, newVal, effectiveBranches, currentUser);
                      if (!nextSps.some((s) => s.name.toLowerCase() === selectedMarketingPerson.toLowerCase())) {
                        setSelectedMarketingPerson('All');
                      }
                    }
                  }}
                  options={effectiveBranches.map((b) => ({ id: b.name, name: b.name, label: b.name, address: b.address }))}
                  isLocked={!isSuperOrAccounts && effectiveBranches.length <= 1}
                  lockedReason="Locked to assigned sales center"
                  includeAllOption={isSuperOrAccounts || effectiveBranches.length > 1}
                  allOptionLabel={
                    isSuperOrAccounts
                      ? `All Sales Centers (${effectiveBranches.length})`
                      : `All Assigned Centers (${effectiveBranches.length})`
                  }
                  allOptionValue="All"
                  label="Sales Center:"
                  theme="light"
                  size="sm"
                  widthClass="min-w-[170px] max-w-[240px]"
                />

                <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300">
                  Marketing Person: <strong>{selectedMarketingPerson}</strong>
                </span>
                <span className="bg-blue-100 text-blue-900 px-2 py-0.5 rounded border border-blue-300">
                  Customer: <strong>{selectedCustomer}</strong>
                </span>
              </div>
            </div>

            {/* Bill Count & Active Filter Notice */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-amber-50/80 border border-amber-200/90 rounded-xl text-xs text-amber-950 font-medium no-print">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-900">
                  Showing {filteredBills.length} of {storedBills.length} Total Bills
                </span>
                {filteredBills.length < storedBills.length && (
                  <span className="text-amber-800 text-[11px]">
                    (Filter active: {isPresetActive('this_month') ? 'Current Month only' : `${startDate || 'Start'} to ${endDate || 'End'}`}{selectedMarketingPerson !== 'All' ? ` • Rep: ${selectedMarketingPerson}` : ''}{selectedCustomer !== 'All' ? ` • Customer: ${selectedCustomer}` : ''}{selectedTypeFilter !== 'All' ? ` • Type: ${selectedTypeFilter}` : ''})
                  </span>
                )}
              </div>
              {filteredBills.length < storedBills.length && (
                <button
                  type="button"
                  onClick={() => {
                    setPeriodAll();
                    setSelectedMarketingPerson('All');
                    setSelectedCustomer('All');
                    setSelectedTypeFilter('All');
                    setChallanFilter('without_challan');
                    setSearchTerm('');
                  }}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-black cursor-pointer transition-colors shadow-xs"
                  title="Reset date and dropdown filters to show all bills from all dates and marketing persons"
                >
                  Show All {storedBills.length} Bills
                </button>
              )}
            </div>

            {/* UNIFIED STATEMENT TABLE VIEW (MATCHING EXACT UPLOADED IMAGE FORMAT) */}
            {statementViewMode === 'unified' ? (
              <div className="space-y-4">
                {/* Header matching exact uploaded image */}
                <div className="text-center">
                  <h1
                    contentEditable={isLiveEditable}
                    suppressContentEditableWarning={true}
                    style={{ fontSize: reportHeaderFontSize }}
                    className="font-bold text-black font-serif tracking-tight focus:bg-amber-50 rounded px-2 uppercase"
                  >
                    {selectedMarketingPerson !== 'All' 
                      ? selectedMarketingPerson 
                      : reportHeaderCenterName}
                  </h1>
                  {reportHeaderAddress && (
                    <p className="text-xs text-slate-800 font-semibold mt-0.5">
                      {reportHeaderAddress}{reportHeaderPhone ? ` • Ph: ${reportHeaderPhone}` : ''}
                    </p>
                  )}
                  <div
                    contentEditable={isLiveEditable}
                    suppressContentEditableWarning={true}
                    style={{ fontSize: reportFontSize }}
                    className="font-bold text-black font-mono mt-0.5 focus:bg-amber-50 rounded px-2"
                  >
                    Date:{formatDateDDMMYY(startDate)} to {formatDateDDMMYY(endDate)}
                  </div>
                </div>

                {/* Table matching exact image layout */}
                <div className="overflow-x-auto">
                  <table
                    style={{ fontSize: reportFontSize }}
                    className="w-full text-black border-collapse border border-black font-sans"
                  >
                    <thead>
                      <tr className="border-b border-black bg-slate-50 font-bold">
                        <th contentEditable={isLiveEditable} suppressContentEditableWarning={true} className={`${reportRowPadding === 'tight' ? 'p-0.5' : (reportRowPadding === 'spacious' ? 'p-3' : 'p-1.5')} border-r border-black text-center w-8`}>SL</th>
                        <th
                          contentEditable={isLiveEditable}
                          suppressContentEditableWarning={true}
                          onClick={() => toggleStatementSort('date')}
                          className={`${reportRowPadding === 'tight' ? 'p-0.5' : (reportRowPadding === 'spacious' ? 'p-3' : 'p-1.5')} border-r border-black text-center w-20 select-none cursor-pointer hover:bg-amber-100/80 transition-colors`}
                          title="Click to sort by Date Ascending / Descending"
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span>Date</span>
                            {statementSortBy === 'date' && (
                              <span className="text-amber-800 font-black text-xs">{statementSortDir === 'asc' ? '▲' : '▼'}</span>
                            )}
                          </div>
                        </th>
                        <th
                          contentEditable={isLiveEditable}
                          suppressContentEditableWarning={true}
                          onClick={() => toggleStatementSort('party')}
                          style={{ width: partyColWidth !== 'auto' ? partyColWidth : undefined }}
                          className={`${reportRowPadding === 'tight' ? 'p-0.5' : (reportRowPadding === 'spacious' ? 'p-3' : 'p-1.5')} border-r border-black text-left select-none cursor-pointer hover:bg-amber-100/80 transition-colors`}
                          title="Click to sort by Party Name Ascending / Descending"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span>Party Name</span>
                            {statementSortBy === 'party' && (
                              <span className="text-amber-800 font-black text-xs">{statementSortDir === 'asc' ? '▲' : '▼'}</span>
                            )}
                          </div>
                        </th>
                        <th
                          contentEditable={isLiveEditable}
                          suppressContentEditableWarning={true}
                          onClick={() => toggleStatementSort('address')}
                          style={{ width: addressColWidth }}
                          className={`${reportRowPadding === 'tight' ? 'p-0.5' : (reportRowPadding === 'spacious' ? 'p-3' : 'p-1.5')} border-r border-black text-left select-none cursor-pointer hover:bg-amber-100/80 transition-colors`}
                          title="Click to sort by Address Ascending / Descending"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span>Address</span>
                            {statementSortBy === 'address' && (
                              <span className="text-amber-800 font-black text-xs">{statementSortDir === 'asc' ? '▲' : '▼'}</span>
                            )}
                          </div>
                        </th>
                        <th
                          contentEditable={isLiveEditable}
                          suppressContentEditableWarning={true}
                          onClick={() => toggleStatementSort('billNo')}
                          className={`${reportRowPadding === 'tight' ? 'p-0.5' : (reportRowPadding === 'spacious' ? 'p-3' : 'p-1.5')} border-r border-black text-center w-16 select-none cursor-pointer hover:bg-amber-100/80 transition-colors`}
                          title="Click to sort by Bill No. Ascending / Descending"
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span>Bill No.</span>
                            {statementSortBy === 'billNo' && (
                              <span className="text-amber-800 font-black text-xs">{statementSortDir === 'asc' ? '▲' : '▼'}</span>
                            )}
                          </div>
                        </th>
                        <th
                          contentEditable={isLiveEditable}
                          suppressContentEditableWarning={true}
                          onClick={() => toggleStatementSort('billAmount')}
                          style={{ width: amountColWidth }}
                          className={`${reportRowPadding === 'tight' ? 'p-0.5' : (reportRowPadding === 'spacious' ? 'p-3' : 'p-1.5')} border-r border-black text-right select-none cursor-pointer hover:bg-amber-100/80 transition-colors`}
                          title="Click to sort by Bill Amount Ascending / Descending"
                        >
                          <div className="flex items-center justify-end gap-1">
                            <span>Bill Amount</span>
                            {statementSortBy === 'billAmount' && (
                              <span className="text-amber-800 font-black text-xs">{statementSortDir === 'asc' ? '▲' : '▼'}</span>
                            )}
                          </div>
                        </th>
                        <th
                          contentEditable={isLiveEditable}
                          suppressContentEditableWarning={true}
                          onClick={() => toggleStatementSort('lessDiscount')}
                          style={{ width: amountColWidth }}
                          className={`${reportRowPadding === 'tight' ? 'p-0.5' : (reportRowPadding === 'spacious' ? 'p-3' : 'p-1.5')} border-r border-black text-right select-none cursor-pointer hover:bg-amber-100/80 transition-colors`}
                          title="Click to sort by Less Discount Ascending / Descending"
                        >
                          <div className="flex items-center justify-end gap-1">
                            <span>Less Discount</span>
                            {statementSortBy === 'lessDiscount' && (
                              <span className="text-amber-800 font-black text-xs">{statementSortDir === 'asc' ? '▲' : '▼'}</span>
                            )}
                          </div>
                        </th>
                        <th
                          contentEditable={isLiveEditable}
                          suppressContentEditableWarning={true}
                          onClick={() => toggleStatementSort('netAmount')}
                          style={{ width: amountColWidth }}
                          className={`${reportRowPadding === 'tight' ? 'p-0.5' : (reportRowPadding === 'spacious' ? 'p-3' : 'p-1.5')} border-r border-black text-right select-none cursor-pointer hover:bg-amber-100/80 transition-colors`}
                          title="Click to sort by Net Amount Ascending / Descending"
                        >
                          <div className="flex items-center justify-end gap-1">
                            <span>Net Amount</span>
                            {(statementSortBy === 'netAmount' || statementSortBy === 'amount') && (
                              <span className="text-amber-800 font-black text-xs">{statementSortDir === 'asc' ? '▲' : '▼'}</span>
                            )}
                          </div>
                        </th>
                        <th
                          contentEditable={isLiveEditable}
                          suppressContentEditableWarning={true}
                          onClick={() => toggleStatementSort('collection')}
                          style={{ width: amountColWidth }}
                          className={`${reportRowPadding === 'tight' ? 'p-0.5' : (reportRowPadding === 'spacious' ? 'p-3' : 'p-1.5')} border-r border-black text-right select-none cursor-pointer hover:bg-amber-100/80 transition-colors`}
                          title="Click to sort by Collection Ascending / Descending"
                        >
                          <div className="flex items-center justify-end gap-1">
                            <span>Collection</span>
                            {statementSortBy === 'collection' && (
                              <span className="text-amber-800 font-black text-xs">{statementSortDir === 'asc' ? '▲' : '▼'}</span>
                            )}
                          </div>
                        </th>
                        <th
                          contentEditable={isLiveEditable}
                          suppressContentEditableWarning={true}
                          onClick={() => toggleStatementSort('remarks')}
                          className={`${reportRowPadding === 'tight' ? 'p-0.5' : (reportRowPadding === 'spacious' ? 'p-3' : 'p-1.5')} border-r border-black text-center w-28 select-none cursor-pointer hover:bg-amber-100/80 transition-colors`}
                          title="Click to sort by Remarks Ascending / Descending"
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span>Remarks</span>
                            {statementSortBy === 'remarks' && (
                              <span className="text-amber-800 font-black text-xs">{statementSortDir === 'asc' ? '▲' : '▼'}</span>
                            )}
                          </div>
                        </th>
                        <th
                          contentEditable={isLiveEditable}
                          suppressContentEditableWarning={true}
                          onClick={() => toggleStatementSort('coils')}
                          className={`${reportRowPadding === 'tight' ? 'p-0.5' : (reportRowPadding === 'spacious' ? 'p-3' : 'p-1.5')} text-center w-16 select-none cursor-pointer hover:bg-amber-100/80 transition-colors`}
                          title="Click to sort by Coils Ascending / Descending"
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span>Coils</span>
                            {statementSortBy === 'coils' && (
                              <span className="text-amber-800 font-black text-xs">{statementSortDir === 'asc' ? '▲' : '▼'}</span>
                            )}
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {unifiedStatementList.length === 0 && extraUnifiedRows.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="p-4 text-center text-slate-500 italic">
                            No sales or collection statement activity recorded for this selection.
                          </td>
                        </tr>
                      ) : (
                        <>
                          {unifiedStatementList.map((item, idx) => {
                            const matchedStoredBill = storedBills.find(b =>
                              b.id === item.id ||
                              (item.billNo && item.billNo !== '-' && item.billNo !== 'Cash' && !item.billNo.startsWith('Challan') && b.header?.billNo && b.header.billNo.trim().toLowerCase() === item.billNo.trim().toLowerCase())
                            );
                            const matchedCollection = (item.collection > 0 || item.billNo === 'Cash') ? collections.find(c =>
                              c.id === item.id ||
                              (c.partyName?.trim().toLowerCase() === item.partyName.trim().toLowerCase() && Number(c.amount) === Number(item.collection) && c.date === item.date)
                            ) : null;

                            return (
                              <tr key={item.id + idx} className="border-b border-slate-300 hover:bg-slate-50">
                                <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-center font-mono">{idx + 1}</td>
                                <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-center font-mono">{formatDateDDMMYY(item.date)}</td>
                                <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black font-bold text-slate-900">{item.partyName}</td>
                                <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-slate-800">{item.address}</td>
                                <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-center font-mono font-bold">
                                  {matchedStoredBill ? (
                                    <button
                                      type="button"
                                      onClick={() => handleEditBill(matchedStoredBill)}
                                      className="text-blue-700 hover:text-blue-900 font-bold inline-flex items-center gap-1 hover:underline cursor-pointer group"
                                      title={`Click to edit Bill #${item.billNo}`}
                                    >
                                      <span>{item.billNo}</span>
                                      <Edit3 className="w-3 h-3 text-blue-600 opacity-70 group-hover:opacity-100 shrink-0 no-print" />
                                    </button>
                                  ) : matchedCollection ? (
                                    <button
                                      type="button"
                                      onClick={() => setEditingCollection(matchedCollection)}
                                      className="text-emerald-700 hover:text-emerald-900 font-bold inline-flex items-center gap-1 hover:underline cursor-pointer group"
                                      title={`Click to edit Collection MR (${matchedCollection.mrNo || item.billNo})`}
                                    >
                                      <span>{item.billNo || 'Cash'}</span>
                                      <Edit3 className="w-3 h-3 text-emerald-600 opacity-70 group-hover:opacity-100 shrink-0 no-print" />
                                    </button>
                                  ) : (
                                    <span>{item.billNo || ''}</span>
                                  )}
                                </td>
                                <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-right font-mono font-semibold">
                                  {item.billAmount > 0 ? (
                                    matchedStoredBill ? (
                                      <button
                                        type="button"
                                        onClick={() => handleEditBill(matchedStoredBill)}
                                        className="text-slate-900 hover:text-blue-800 hover:underline cursor-pointer"
                                        title={`Click to edit Bill #${item.billNo}`}
                                      >
                                        {formatAmount(item.billAmount)}
                                      </button>
                                    ) : (
                                      formatAmount(item.billAmount)
                                    )
                                  ) : ''}
                                </td>
                                <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-right font-mono text-slate-700">
                                  {item.lessDiscount > 0 ? formatAmount(item.lessDiscount) : ''}
                                </td>
                                <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-right font-mono font-bold text-slate-900">
                                  {item.netAmount > 0 ? (
                                    matchedStoredBill ? (
                                      <button
                                        type="button"
                                        onClick={() => handleEditBill(matchedStoredBill)}
                                        className="text-slate-900 hover:text-blue-800 hover:underline cursor-pointer"
                                        title={`Click to edit Bill #${item.billNo}`}
                                      >
                                        {formatAmount(item.netAmount)}
                                      </button>
                                    ) : (
                                      formatAmount(item.netAmount)
                                    )
                                  ) : ''}
                                </td>
                                <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-right font-mono font-bold text-emerald-900">
                                  {item.collection > 0 ? (
                                    matchedCollection ? (
                                      <button
                                        type="button"
                                        onClick={() => setEditingCollection(matchedCollection)}
                                        className="text-emerald-900 hover:text-emerald-950 font-bold hover:underline cursor-pointer inline-flex items-center gap-1 justify-end"
                                        title={`Click to edit Collection MR (${matchedCollection.mrNo || 'Collection'})`}
                                      >
                                        <span>{formatAmount(item.collection)}</span>
                                        <Edit3 className="w-2.5 h-2.5 text-emerald-600 opacity-60 hover:opacity-100 no-print" />
                                      </button>
                                    ) : (
                                      formatAmount(item.collection)
                                    )
                                  ) : ''}
                                </td>
                                <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-center font-mono text-slate-800">{item.remarks}</td>
                                <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 text-center font-mono font-bold">{item.coils > 0 ? item.coils : ''}</td>
                              </tr>
                            );
                          })}

                          {/* Render extra custom editable rows */}
                          {extraUnifiedRows.map((extItem, idx) => (
                            <tr key={extItem.id} className="border-b border-amber-300 bg-amber-50/20">
                              <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-center font-mono">{unifiedStatementList.length + idx + 1}</td>
                              <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-center font-mono">{extItem.date}</td>
                              <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black font-bold text-slate-900">{extItem.partyName}</td>
                              <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-slate-800">{extItem.address}</td>
                              <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-center font-mono font-bold">{extItem.billNo}</td>
                              <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-right font-mono font-semibold">{extItem.billAmount}</td>
                              <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-right font-mono text-slate-700">{extItem.lessDiscount}</td>
                              <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-right font-mono font-bold text-slate-900">{extItem.netAmount}</td>
                              <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-right font-mono font-bold text-emerald-900">{extItem.collection}</td>
                              <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-center font-mono text-slate-800">{extItem.remarks}</td>
                              <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 text-center font-mono font-bold">{extItem.coils}</td>
                            </tr>
                          ))}
                        </>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-black font-bold bg-slate-100">
                        <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} colSpan={7} className="p-1.5 text-right uppercase text-xs border-r border-black">
                          Total=
                        </td>
                        <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 text-right text-xs font-mono font-black border-r border-black">
                          {formatAmount(unifiedTotalNetAmount)}
                        </td>
                        <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 text-right text-xs font-mono font-black border-r border-black text-emerald-950">
                          {formatAmount(unifiedTotalCollection)}
                        </td>
                        <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black"></td>
                        <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 text-center text-xs font-mono font-black">
                          {unifiedTotalCoils > 0 ? unifiedTotalCoils : 0}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Add Custom Row Button for Unified Table */}
                <div className="flex justify-between items-center no-print pt-2">
                  <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded border border-amber-200">
                    💡 Tip: Click any cell above to edit text or numbers directly before printing!
                  </span>
                  <button
                    type="button"
                    onClick={() => setExtraUnifiedRows([...extraUnifiedRows, {
                      id: `ext_${Date.now()}`,
                      date: formatDateDDMMYY(new Date().toISOString().substring(0, 10)),
                      partyName: 'Sample Customer',
                      address: 'Madhupur',
                      billNo: '01',
                      billAmount: '0',
                      lessDiscount: '0',
                      netAmount: '0',
                      collection: '0',
                      remarks: '',
                      coils: '0'
                    }])}
                    className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center space-x-1.5 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5 text-amber-400" />
                    <span>+ Add Custom Line Item</span>
                  </button>
                </div>
              </div>
            ) : (
              /* GROUPED CUSTOMER LEDGER BREAKDOWN VIEW */
              <div className="space-y-6">
                {/* Header */}
                <div className="text-center border-b border-black pb-4">
                  <h1 className="text-xl font-black text-black tracking-tight font-serif uppercase">
                    {selectedMarketingPerson !== 'All' ? selectedMarketingPerson : reportHeaderCenterName}
                  </h1>
                  {reportHeaderAddress && (
                    <p className="text-xs text-slate-800 font-semibold">{reportHeaderAddress}{reportHeaderPhone ? ` • Ph: ${reportHeaderPhone}` : ''}</p>
                  )}
                  <div className="mt-2 inline-block bg-slate-900 text-white text-xs font-black px-4 py-1 rounded-full uppercase tracking-wider print:bg-white print:text-black print:border print:border-black">
                    Customer-Wise Sales & Collection Statement
                  </div>
                  <div className="text-xs font-bold text-black font-mono mt-1">
                    {formattedDateRange}
                  </div>
                </div>

                {/* Master Summary Table of All Filtered Customers */}
                {customerWiseData.length > 1 && (
                  <div className="border border-black p-4 bg-slate-50/50 rounded-xl space-y-2">
                    <h3 className="text-xs font-black text-black uppercase tracking-wider border-b border-black pb-1">
                      Customer Account Summary Overview
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse border border-black text-black">
                        <thead>
                          <tr className="bg-slate-200 font-bold uppercase text-[10px] border-b border-black">
                            <th className="p-1.5 border-r border-black text-center w-10">SL#</th>
                            <th
                              onClick={() => toggleCustomerSummarySort('name')}
                              className="p-1.5 border-r border-black text-left cursor-pointer hover:bg-slate-300 transition-colors select-none"
                              title="Click to sort by Customer Name"
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span>Customer Name</span>
                                {customerSummarySortBy === 'name' && (
                                  <span className="text-slate-900 font-black text-xs">{customerSummarySortDir === 'asc' ? '▲' : '▼'}</span>
                                )}
                              </div>
                            </th>
                            <th
                              onClick={() => toggleCustomerSummarySort('salesperson')}
                              className="p-1.5 border-r border-black text-left cursor-pointer hover:bg-slate-300 transition-colors select-none"
                              title="Click to sort by Marketing Representative"
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span>Marketing Representative</span>
                                {customerSummarySortBy === 'salesperson' && (
                                  <span className="text-slate-900 font-black text-xs">{customerSummarySortDir === 'asc' ? '▲' : '▼'}</span>
                                )}
                              </div>
                            </th>
                            <th
                              onClick={() => toggleCustomerSummarySort('openingBalance')}
                              className="p-1.5 border-r border-black text-right w-28 cursor-pointer hover:bg-slate-300 transition-colors select-none"
                              title="Click to sort by B/F"
                            >
                              <div className="flex items-center justify-end gap-1">
                                <span>B/F (Tk)</span>
                                {customerSummarySortBy === 'openingBalance' && (
                                  <span className="text-slate-900 font-black text-xs">{customerSummarySortDir === 'asc' ? '▲' : '▼'}</span>
                                )}
                              </div>
                            </th>
                            <th
                              onClick={() => toggleCustomerSummarySort('totalSales')}
                              className="p-1.5 border-r border-black text-right w-28 cursor-pointer hover:bg-slate-300 transition-colors select-none"
                              title="Click to sort by Total Sales"
                            >
                              <div className="flex items-center justify-end gap-1">
                                <span>Total Sales (Tk)</span>
                                {customerSummarySortBy === 'totalSales' && (
                                  <span className="text-slate-900 font-black text-xs">{customerSummarySortDir === 'asc' ? '▲' : '▼'}</span>
                                )}
                              </div>
                            </th>
                            <th
                              onClick={() => toggleCustomerSummarySort('totalCollections')}
                              className="p-1.5 border-r border-black text-right w-28 cursor-pointer hover:bg-slate-300 transition-colors select-none"
                              title="Click to sort by Total Collection"
                            >
                              <div className="flex items-center justify-end gap-1">
                                <span>Total Collection (Tk)</span>
                                {customerSummarySortBy === 'totalCollections' && (
                                  <span className="text-slate-900 font-black text-xs">{customerSummarySortDir === 'asc' ? '▲' : '▼'}</span>
                                )}
                              </div>
                            </th>
                            <th
                              onClick={() => toggleCustomerSummarySort('closingBalance')}
                              className="p-1.5 text-right w-32 cursor-pointer hover:bg-slate-300 transition-colors select-none"
                              title="Click to sort by Closing Balance"
                            >
                              <div className="flex items-center justify-end gap-1">
                                <span>Closing Net Balance (Tk)</span>
                                {customerSummarySortBy === 'closingBalance' && (
                                  <span className="text-slate-900 font-black text-xs">{customerSummarySortDir === 'asc' ? '▲' : '▼'}</span>
                                )}
                              </div>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {customerWiseData.map((item, idx) => (
                            <tr key={item.party?.id ? `${item.party.id}-${idx}` : `party-${idx}`} className="border-b border-slate-300 hover:bg-slate-100">
                              <td className="p-1.5 border-r border-black text-center font-mono">{idx + 1}</td>
                              <td className="p-1.5 border-r border-black font-bold">{item.party.name}</td>
                              <td className="p-1.5 border-r border-black">{item.party.salespersonName || item.party.salesmanCode || 'Direct Showroom'}</td>
                              <td className="p-1.5 border-r border-black text-right font-mono font-semibold text-amber-950">৳{formatAmount(item.openingBalance)}</td>
                              <td className="p-1.5 border-r border-black text-right font-mono font-semibold">৳{formatAmount(item.totalSales)}</td>
                              <td className="p-1.5 border-r border-black text-right font-mono font-semibold text-emerald-800">৳{formatAmount(item.totalCollections)}</td>
                              <td className="p-1.5 text-right font-mono font-bold text-slate-900">৳{formatAmount(item.closingBalance)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-300 font-black border-t-2 border-black">
                            <td colSpan={3} className="p-1.5 text-right uppercase border-r border-black">
                              Grand Total ({customerWiseData.length} Customers):
                            </td>
                            <td className="p-1.5 text-right font-mono border-r border-black text-amber-950">৳{formatAmount(grandTotalCustomerOpeningBalance)}</td>
                            <td className="p-1.5 text-right font-mono border-r border-black">৳{formatAmount(grandTotalCustomerSales)}</td>
                            <td className="p-1.5 text-right font-mono border-r border-black text-emerald-950">৳{formatAmount(grandTotalCustomerCollections)}</td>
                            <td className="p-1.5 text-right font-mono text-slate-950">৳{formatAmount(grandTotalCustomerNetBalance)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* Detailed Statements Customer-wise */}
                {customerWiseData.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 italic border border-dashed border-slate-300 rounded-xl">
                    No customer transactions found matching the selected Marketing Person and Customer filters for this date range.
                  </div>
                ) : (
                  customerWiseData.map((item, idx) => (
                    <div key={item.party?.id ? `${item.party.id}-${idx}` : `party-sec-${idx}`} className="border border-black p-4 bg-white rounded-lg space-y-3 page-break-inside-avoid">
                      {/* Party Banner */}
                      <div className="flex flex-wrap items-center justify-between border-b border-black pb-2 gap-2 bg-slate-50 p-2">
                        <div>
                          <h2 className="text-sm font-black text-black uppercase tracking-tight">
                            {item.party.name}
                          </h2>
                          <p className="text-[11px] text-slate-800 font-medium">
                            Address: {item.party.address || 'Madhupur'} {item.party.phone ? `• Ph: ${item.party.phone}` : ''}
                          </p>
                        </div>
                        <div className="text-right text-[11px] font-bold text-slate-800">
                          <div>Marketing Representative: <span className="font-black text-black">{item.party.salespersonName || item.party.salesmanCode || 'Office/Showroom'}</span></div>
                          <div className="flex items-center justify-end space-x-2 mt-1 font-mono">
                            <span className="text-slate-700 font-bold bg-amber-100/80 px-2 py-0.5 rounded border border-amber-300/80 text-[10px]">
                              B/F: <span className="font-black text-amber-950">৳{formatAmount(item.openingBalance)}</span>
                            </span>
                            <span className="text-emerald-900 font-black bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-300/80 text-[10px]">
                              Closing Balance: ৳{formatAmount(item.closingBalance)}
                            </span>
                            {isSuvroAdmin && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveClosingParty(item.party);
                                  setClosingModalDefaultTab('single_party');
                                  setShowClosingModal(true);
                                }}
                                className="no-print ml-1.5 px-2.5 py-0.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-md text-[10px] shadow-xs cursor-pointer flex items-center space-x-1 border border-amber-600"
                                title={`Open Year-End Closing for ${item.party.name}`}
                              >
                                <Lock className="w-3 h-3 text-slate-950" />
                                <span>Year-End Closing</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Transactions Table */}
                      <table className="w-full text-xs border-collapse border border-black text-black">
                        <thead>
                          <tr className="bg-slate-100 font-bold uppercase text-[10px] border-b border-black">
                            <th className="p-1 border-r border-black text-center w-8">SL</th>
                            <th className="p-1 border-r border-black text-center w-20">Date</th>
                            <th className="p-1 border-r border-black text-center w-24">Bill No.</th>
                            <th className="p-1 border-r border-black text-right w-28">Sales Debit (Tk)</th>
                            <th className="p-1 border-r border-black text-right w-28">Collection Credit (Tk)</th>
                            <th className="p-1 border-r border-black text-right w-28">Balance (Tk)</th>
                            <th className="p-1 text-center w-16">Discount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Opening Balance (Previous Date Closing Balance / B/F) Row */}
                          <tr className="border-b border-slate-300 bg-amber-50/70 font-bold">
                            <td className="p-1 border-r border-black text-center font-mono text-slate-500">-</td>
                            <td className="p-1 border-r border-black text-center font-mono font-bold text-slate-800">
                              {startDate ? formatDateDDMMYY(startDate) : '-'}
                            </td>
                            <td className="p-1 border-r border-black text-center font-mono font-bold text-slate-700">
                              B/F
                            </td>
                            <td className="p-1 border-r border-black text-right font-mono text-slate-400">-</td>
                            <td className="p-1 border-r border-black text-right font-mono text-slate-400">-</td>
                            <td className="p-1 border-r border-black text-right font-mono font-black text-slate-950">
                              ৳{formatAmount(item.openingBalance)}
                            </td>
                            <td className="p-1 text-center font-mono text-slate-400">-</td>
                          </tr>

                          {item.transactions.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="p-2.5 text-center text-slate-500 italic">
                                No sales or collection activity recorded for {item.party.name} in this period.
                              </td>
                            </tr>
                          ) : (
                            item.transactions.map((tx, idx) => {
                              const matchedStoredBill = tx.type === 'sale' ? storedBills.find(b =>
                                b.id === tx.id ||
                                (tx.refNo && tx.refNo !== '-' && tx.refNo !== 'Cash' && !tx.refNo.startsWith('Challan') && b.header?.billNo && b.header.billNo.trim().toLowerCase() === tx.refNo.trim().toLowerCase())
                              ) : null;
                              const matchedCollection = tx.type === 'collection' ? collections.find(c =>
                                c.id === tx.id ||
                                (c.partyName?.trim().toLowerCase() === item.party.name.trim().toLowerCase() && Number(c.amount) === Number(tx.collectionAmount) && c.date === tx.date)
                              ) : null;

                              return (
                                <tr key={tx.id} className="border-b border-slate-300 hover:bg-slate-50">
                                  <td className="p-1 border-r border-black text-center font-mono">{idx + 1}</td>
                                  <td className="p-1 border-r border-black text-center font-mono">{formatDateDDMMYY(tx.date)}</td>
                                  <td className="p-1 border-r border-black text-center font-mono font-bold">
                                    {matchedStoredBill ? (
                                      <button
                                        type="button"
                                        onClick={() => handleEditBill(matchedStoredBill)}
                                        className="text-blue-700 hover:text-blue-900 font-bold inline-flex items-center gap-1 hover:underline cursor-pointer group"
                                        title={`Click to edit Bill #${tx.refNo}`}
                                      >
                                        <span>{tx.refNo}</span>
                                        <Edit3 className="w-3 h-3 text-blue-600 opacity-70 group-hover:opacity-100 shrink-0 no-print" />
                                      </button>
                                    ) : tx.type === 'collection' && matchedCollection ? (
                                      <button
                                        type="button"
                                        onClick={() => setEditingCollection(matchedCollection)}
                                        className="text-emerald-700 hover:text-emerald-900 font-bold inline-flex items-center gap-1 hover:underline cursor-pointer group"
                                        title={`Click to edit Collection MR (${matchedCollection.mrNo || tx.refNo})`}
                                      >
                                        <span>{tx.refNo}</span>
                                        <Edit3 className="w-3 h-3 text-emerald-600 opacity-70 group-hover:opacity-100 shrink-0 no-print" />
                                      </button>
                                    ) : (
                                      <span>{tx.refNo}</span>
                                    )}
                                  </td>
                                  <td className="p-1 border-r border-black text-right font-mono font-bold text-slate-900">
                                    {tx.saleAmount > 0 ? (
                                      matchedStoredBill ? (
                                        <button
                                          type="button"
                                          onClick={() => handleEditBill(matchedStoredBill)}
                                          className="text-slate-900 hover:text-blue-800 hover:underline cursor-pointer"
                                          title={`Click to edit Bill #${tx.refNo}`}
                                        >
                                          {formatAmount(tx.saleAmount)}
                                        </button>
                                      ) : (
                                        formatAmount(tx.saleAmount)
                                      )
                                    ) : '-'}
                                  </td>
                                  <td className="p-1 border-r border-black text-right font-mono font-bold text-emerald-800">
                                    {tx.collectionAmount > 0 ? (
                                      matchedCollection ? (
                                        <button
                                          type="button"
                                          onClick={() => setEditingCollection(matchedCollection)}
                                          className="text-emerald-800 hover:text-emerald-950 font-bold hover:underline cursor-pointer inline-flex items-center gap-1 justify-end"
                                          title={`Click to edit Collection MR (${matchedCollection.mrNo || 'Collection'})`}
                                        >
                                          <span>{formatAmount(tx.collectionAmount)}</span>
                                          <Edit3 className="w-2.5 h-2.5 text-emerald-600 opacity-60 hover:opacity-100 no-print" />
                                        </button>
                                      ) : (
                                        formatAmount(tx.collectionAmount)
                                      )
                                    ) : '-'}
                                  </td>
                                  <td className="p-1 border-r border-black text-right font-mono font-bold">
                                    ৳{formatAmount(tx.runningBalance)}
                                  </td>
                                  <td className="p-1 text-center font-mono font-semibold">
                                    {tx.discountPercent && tx.discountPercent > 0 ? `${tx.discountPercent}%` : '-'}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-100 font-black border-t-2 border-black">
                            <td colSpan={3} className="p-1 text-right uppercase text-xs border-r border-black">
                              Total / Closing for {item.party.name}:
                            </td>
                            <td className="p-1 text-right font-mono border-r border-black">
                              ৳{formatAmount(item.totalSales)}
                            </td>
                            <td className="p-1 text-right font-mono border-r border-black text-emerald-900">
                              ৳{formatAmount(item.totalCollections)}
                            </td>
                            <td className="p-1 text-right font-mono text-black" colSpan={2}>
                              ৳{formatAmount(item.closingBalance)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ))
                )}

                {/* Discount-Wise Total Sales Summary under Customer Ledgers Breakdown */}
                {renderDiscountWiseSummaryTable(false)}
              </div>
            )}

            {/* NEXT PAGE NAVIGATION BAR FOR TAB 1 */}
            <div className="flex flex-wrap items-center justify-between pt-6 border-t border-slate-300 no-print gap-3">
              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                Page 1 of 5: Customer-Wise Sales & Collection Statement
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveReportTab('office_report')}
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-black shadow-md transition-all cursor-pointer flex items-center space-x-1.5"
                >
                  <span>Next Page: Office Report</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB: OFFICE STATEMENT (MONTHLY PARTY TOTAL SALES, COLLECTIONS & AUTO H/O DEPOSIT) */}
      {/* ========================================================= */}
      {activeReportTab === 'office_report' && (
        <div ref={printRef} className="space-y-6">
          <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-200 max-w-6xl mx-auto font-sans print:p-0 print:shadow-none print:border-none print:max-w-full space-y-6">
            
            {/* Official Report Header matching Customer Sales & Collection style */}
            <div className="text-center space-y-1">
              <h1
                contentEditable={isLiveEditable}
                suppressContentEditableWarning={true}
                style={{ fontSize: reportHeaderFontSize }}
                className="font-bold text-black font-serif tracking-tight focus:bg-amber-50 rounded px-2 uppercase"
              >
                {selectedMarketingPerson !== 'All' 
                  ? selectedMarketingPerson 
                  : reportHeaderCenterName}
              </h1>
              {reportHeaderAddress && (
                <p className="text-xs text-slate-800 font-semibold">
                  {reportHeaderAddress}{reportHeaderPhone ? ` • Ph: ${reportHeaderPhone}` : ''}
                </p>
              )}
              <div
                contentEditable={isLiveEditable}
                suppressContentEditableWarning={true}
                style={{ fontSize: reportFontSize }}
                className="font-bold text-black font-mono mt-0.5 focus:bg-amber-50 rounded px-2"
              >
                Date:{startDate || officeMonthStartDateDDMMYY} to {endDate || officeMonthEndDateDDMMYY}
              </div>
            </div>

            {/* PARTY-WISE TOTAL SALES & TOTAL COLLECTION TABLE */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Users className="w-5 h-5 text-slate-800" />
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                    Party-Wise Monthly Sales & Collection Summary ({officePartyReportData.length} Parties)
                  </h3>
                </div>
                <span className="text-xs font-bold text-slate-500 font-mono">
                  Period: {startDate || officeMonthStartDateDDMMYY} to {endDate || officeMonthEndDateDDMMYY}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table
                  style={{ fontSize: reportFontSize }}
                  className="bank-report-table w-full text-black border-collapse border border-black font-sans"
                >
                  <thead>
                    <tr className="border-b border-black bg-slate-50 font-bold uppercase text-[11px]">
                      <th contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-center w-8">SL</th>
                      <th
                        contentEditable={isLiveEditable}
                        suppressContentEditableWarning={true}
                        onClick={() => toggleOfficeSort('name')}
                        className="p-1.5 border-r border-black text-left cursor-pointer hover:bg-slate-200 transition-colors select-none"
                        title="Click to sort by Party Name"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span>Party Name</span>
                          {officeSortBy === 'name' && (
                            <span className="text-slate-900 font-black text-xs">{officeSortDir === 'asc' ? '▲' : '▼'}</span>
                          )}
                        </div>
                      </th>
                      <th
                        contentEditable={isLiveEditable}
                        suppressContentEditableWarning={true}
                        onClick={() => toggleOfficeSort('openingBalance')}
                        className="p-1.5 border-r border-black text-right w-28 sm:w-32 bg-amber-50/60 cursor-pointer hover:bg-amber-100 transition-colors select-none"
                        title="Click to sort by Opening Balance"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Opening Balance</span>
                          {officeSortBy === 'openingBalance' && (
                            <span className="text-slate-900 font-black text-xs">{officeSortDir === 'asc' ? '▲' : '▼'}</span>
                          )}
                        </div>
                      </th>
                      <th
                        contentEditable={isLiveEditable}
                        suppressContentEditableWarning={true}
                        onClick={() => toggleOfficeSort('totalSales')}
                        className="p-1.5 border-r border-black text-right w-28 sm:w-32 bg-blue-50/60 cursor-pointer hover:bg-blue-100 transition-colors select-none"
                        title="Click to sort by this month Total Sale"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>this month Total Sale</span>
                          {officeSortBy === 'totalSales' && (
                            <span className="text-slate-900 font-black text-xs">{officeSortDir === 'asc' ? '▲' : '▼'}</span>
                          )}
                        </div>
                      </th>
                      <th
                        contentEditable={isLiveEditable}
                        suppressContentEditableWarning={true}
                        onClick={() => toggleOfficeSort('totalCollection')}
                        className="p-1.5 border-r border-black text-right w-28 sm:w-32 bg-emerald-100/60 cursor-pointer hover:bg-emerald-200 transition-colors select-none"
                        title="Click to sort by this month Total Collection"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>this month Total Collection</span>
                          {officeSortBy === 'totalCollection' && (
                            <span className="text-slate-900 font-black text-xs">{officeSortDir === 'asc' ? '▲' : '▼'}</span>
                          )}
                        </div>
                      </th>
                      <th
                        contentEditable={isLiveEditable}
                        suppressContentEditableWarning={true}
                        onClick={() => toggleOfficeSort('balance')}
                        className="p-1.5 text-right w-28 sm:w-32 bg-slate-100 cursor-pointer hover:bg-slate-200 transition-colors select-none"
                        title="Click to sort by Balance"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>balance</span>
                          {officeSortBy === 'balance' && (
                            <span className="text-slate-900 font-black text-xs">{officeSortDir === 'asc' ? '▲' : '▼'}</span>
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {officePartyReportData.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-500 italic font-bold">
                          No party transaction records found matching your filters for {officeMonthLabel}.
                        </td>
                      </tr>
                    ) : (
                      officePartyReportData.map((row, idx) => (
                        <tr
                          key={row.party?.id ? `${row.party.id}-${idx}` : `party-row-${idx}`}
                          className="border-b border-slate-300 hover:bg-slate-50 transition-colors"
                        >
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-center font-mono font-bold text-slate-700">
                            {idx + 1}
                          </td>
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black font-bold text-slate-900">
                            <div>{row.party.name}</div>
                            {(row.party.address || row.party.salespersonName || row.party.salesmanCode) && (
                              <div className="text-[10px] text-slate-500 font-normal">
                                {[row.party.address, row.party.salespersonName || row.party.salesmanCode].filter(Boolean).join(' • ')}
                              </div>
                            )}
                          </td>
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-right font-mono font-bold text-amber-950 bg-amber-50/20">
                            {row.openingBalance !== 0 ? formatAmount(row.openingBalance) : '0'}
                          </td>
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-right font-mono font-bold text-blue-950 bg-blue-50/20">
                            {row.totalSales > 0 ? formatAmount(row.totalSales) : '0'}
                          </td>
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-right font-mono font-bold text-emerald-950 bg-emerald-100/30">
                            {row.totalCollection > 0 ? formatAmount(row.totalCollection) : '0'}
                          </td>
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className={`p-1.5 text-right font-mono font-bold ${
                            row.balance > 0 ? 'text-slate-900' : row.balance < 0 ? 'text-rose-700' : 'text-slate-400'
                          }`}>
                            {row.balance !== 0 ? formatAmount(row.balance) : '0'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-black font-bold bg-slate-100">
                      <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} colSpan={2} className="p-1.5 text-right uppercase text-xs border-r border-black">
                        Total=
                      </td>
                      <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 text-right text-xs font-mono font-black border-r border-black text-amber-950 bg-amber-50/60">
                        {formatAmount(officeGrandTotals.totalOpeningBalance)}
                      </td>
                      <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 text-right text-xs font-mono font-black border-r border-black text-blue-950 bg-blue-50/60">
                        {formatAmount(officeGrandTotals.totalSales)}
                      </td>
                      <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 text-right text-xs font-mono font-black border-r border-black text-emerald-950 bg-emerald-100/80">
                        {formatAmount(officeGrandTotals.totalCollection)}
                      </td>
                      <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 text-right text-xs font-mono font-black text-slate-950">
                        {formatAmount(officeGrandTotals.totalEndingBalance)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* MONTHLY CASH & BANK RECONCILIATION SUMMARY BOX */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="border border-black rounded-xl p-4 bg-slate-50 space-y-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-black border-b border-black pb-1 flex items-center justify-between">
                  <span>Branch Cash Flow Reconciliation</span>
                  <Coins className="w-4 h-4 text-amber-600" />
                </h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between items-center text-slate-700">
                    <span>1. Prior Month Ending Cash ({prevMonthLabel}):</span>
                    <span className="font-mono font-bold text-black">৳{formatAmount(lastMonthClosingCash)}</span>
                  </div>
                  <div className="flex justify-between items-center text-emerald-800 font-semibold">
                    <span>2. Add: This Month Cash Collections ({officeMonthLabel}):</span>
                    <span className="font-mono font-bold text-emerald-800">+ ৳{formatAmount(officeGrandTotals.currentMonthCashIn)}</span>
                  </div>
                  <div className="flex justify-between items-center text-blue-800 font-semibold">
                    <span>3. Less: This Month Cash Deposited to Bank:</span>
                    <span className="font-mono font-bold text-blue-800">- ৳{formatAmount(officeGrandTotals.currentMonthBankDeposited)}</span>
                  </div>
                  <div className="border-t border-black pt-1.5 flex justify-between items-center text-xs font-black bg-amber-50 p-2 rounded">
                    <span>Ending Branch Cash in Hand:</span>
                    <span className="font-mono font-black text-amber-950 text-sm">৳{formatAmount(officeGrandTotals.currentMonthEndingCash)}</span>
                  </div>
                </div>
              </div>

              <div className="border border-black rounded-xl p-4 bg-slate-50 space-y-2 flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-black border-b border-black pb-1 flex items-center justify-between">
                    <span>Office Financial Performance Status</span>
                    <Receipt className="w-4 h-4 text-emerald-700" />
                  </h4>
                  <div className="space-y-1.5 text-xs mt-2">
                    <div className="flex justify-between items-center text-slate-700">
                      <span>Total Sales Volume:</span>
                      <span className="font-mono font-bold text-black">৳{formatAmount(officeGrandTotals.totalSales)}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-700">
                      <span>Total Collected Revenue:</span>
                      <span className="font-mono font-bold text-emerald-800">৳{formatAmount(officeGrandTotals.totalCollection)}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-700">
                      <span>Collection Realization Rate:</span>
                      <span className="font-mono font-bold text-blue-900">
                        {officeGrandTotals.totalSales > 0
                          ? `${((officeGrandTotals.totalCollection / officeGrandTotals.totalSales) * 100).toFixed(1)}%`
                          : '100%'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900 text-white p-2.5 rounded-lg flex items-center justify-between text-xs font-bold">
                  <span>Head Office Verification:</span>
                  <span className="text-amber-400 font-mono font-black">All H/O Accounts Reconciled</span>
                </div>
              </div>
            </div>

            {/* Official Signature Lines for Office Statement */}
            <div className="grid grid-cols-4 gap-4 pt-16 text-center text-xs font-bold text-black border-t border-slate-300 mt-8">
              <div className="border-t border-black pt-1">Prepared By</div>
              <div className="border-t border-black pt-1">Accountant</div>
              <div className="border-t border-black pt-1">Branch Manager</div>
              <div className="border-t border-black pt-1">Head Office Approval</div>
            </div>

            {/* Pagination Navigation Bar for Office Statement */}
            <div className="flex flex-wrap items-center justify-between pt-6 border-t border-slate-300 no-print gap-3">
              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                Page 2 of 5: Office Statement
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveReportTab('customer_wise_sales_collection')}
                  className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-100 border border-cyan-500/30 rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center space-x-1.5"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous: Customer Statement</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveReportTab('party_bank_details')}
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-black shadow-md transition-all cursor-pointer flex items-center space-x-1.5"
                >
                  <span>Next Page: Party-Wise Bank Details</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PAGE 3: PARTY-WISE BANK COLLECTION DETAILS (DETAILED LIST MATCHING IMAGE 1) */}
      {/* ========================================================= */}
      {activeReportTab === 'party_bank_details' && (
        <div ref={printRef} className="space-y-6">
          <div className="bg-white p-8 rounded-2xl shadow-xl border-none max-w-4xl mx-auto font-sans print:p-0 print:shadow-none print:border-none print:max-w-full">
            <div className="p-4 bg-white">
              <div className="text-center mb-4">
                <h2
                  contentEditable={isLiveEditable}
                  suppressContentEditableWarning={true}
                  className="text-xl font-black text-black tracking-tight font-serif uppercase focus:bg-amber-50 rounded px-2"
                >
                  {selectedMarketingPerson !== 'All' ? selectedMarketingPerson : reportHeaderCenterName}
                </h2>
                {reportHeaderAddress && (
                  <p className="text-xs text-slate-800 font-semibold mt-0.5">
                    {reportHeaderAddress}{reportHeaderPhone ? ` • Ph: ${reportHeaderPhone}` : ''}
                  </p>
                )}
                <div
                  contentEditable={isLiveEditable}
                  suppressContentEditableWarning={true}
                  className="text-sm font-bold text-black font-mono mt-0.5 focus:bg-amber-50 rounded px-2"
                >
                  {formattedDateRange}
                </div>
              </div>

              <table className="bank-report-table w-full text-xs text-black border-collapse border border-black">
                <thead>
                  <tr className="border-b border-black bg-slate-50 font-bold uppercase text-[11px]">
                    <th contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-center w-10">SL</th>
                    <th
                      contentEditable={isLiveEditable}
                      suppressContentEditableWarning={true}
                      onClick={() => toggleBankDetailSort('date')}
                      className="p-1.5 border-r border-black text-center w-20 cursor-pointer hover:bg-amber-100 transition-colors select-none"
                      title="Click to sort by Date"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Date</span>
                        {bankDetailSortBy === 'date' && (
                          <span className="text-amber-800 font-black text-xs">{bankDetailSortDir === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th
                      contentEditable={isLiveEditable}
                      suppressContentEditableWarning={true}
                      onClick={() => toggleBankDetailSort('bankName')}
                      className="p-1.5 border-r border-black text-left w-24 cursor-pointer hover:bg-amber-100 transition-colors select-none"
                      title="Click to sort by Bank Name"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span>Bank Name</span>
                        {bankDetailSortBy === 'bankName' && (
                          <span className="text-amber-800 font-black text-xs">{bankDetailSortDir === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th
                      contentEditable={isLiveEditable}
                      suppressContentEditableWarning={true}
                      onClick={() => toggleBankDetailSort('partyName')}
                      className="p-1.5 border-r border-black text-left cursor-pointer hover:bg-amber-100 transition-colors select-none"
                      title="Click to sort by Party Name"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span>Party Name</span>
                        {bankDetailSortBy === 'partyName' && (
                          <span className="text-amber-800 font-black text-xs">{bankDetailSortDir === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th
                      contentEditable={isLiveEditable}
                      suppressContentEditableWarning={true}
                      onClick={() => toggleBankDetailSort('address')}
                      className="p-1.5 border-r border-black text-left w-28 cursor-pointer hover:bg-amber-100 transition-colors select-none"
                      title="Click to sort by Address"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span>Address</span>
                        {bankDetailSortBy === 'address' && (
                          <span className="text-amber-800 font-black text-xs">{bankDetailSortDir === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th
                      contentEditable={isLiveEditable}
                      suppressContentEditableWarning={true}
                      onClick={() => toggleBankDetailSort('amount')}
                      className="p-1.5 text-right w-28 cursor-pointer hover:bg-amber-100 transition-colors select-none"
                      title="Click to sort by Amount"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Amount</span>
                        {bankDetailSortBy === 'amount' && (
                          <span className="text-amber-800 font-black text-xs">{bankDetailSortDir === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {detailedBankCollectionList.length === 0 && extraBankRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-500 italic">
                        No detailed bank deposit entries found for this selection.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {detailedBankCollectionList.map((item, idx) => (
                        <tr key={item.id + idx} className="border-b border-slate-300 hover:bg-slate-50">
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-center font-mono">{idx + 1}</td>
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-center font-mono">{formatDateDDMMYY(item.date)}</td>
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black font-bold font-mono text-slate-900">
                            {item.shortTag || getBankAndAccountShortTag(item.bankName, item.accountName)}
                          </td>
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black font-semibold text-slate-900">
                            {item.partyName}
                          </td>
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-slate-800">
                            {item.address}
                          </td>
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 text-right font-bold font-mono">
                            {formatAmount(item.amount)}
                          </td>
                        </tr>
                      ))}

                      {/* Render custom bank deposit rows */}
                      {extraBankRows.map((ext, idx) => (
                        <tr key={ext.id} className="border-b border-amber-300 bg-amber-50/20">
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-center font-mono">{detailedBankCollectionList.length + idx + 1}</td>
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-center font-mono">{ext.date}</td>
                          <td className="p-1.5 border-r border-black font-bold font-mono text-slate-900"><BankLogoBadge bankName={ext.bankName} size="sm" /></td>
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black font-semibold text-slate-900">{ext.partyName}</td>
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-slate-800">{ext.address}</td>
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 text-right font-bold font-mono">{ext.amount}</td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-black font-black bg-slate-100">
                    <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} colSpan={5} className="p-1.5 text-right uppercase text-xs border-r border-black">
                      Total=
                    </td>
                    <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 text-right text-xs font-mono font-black">
                      {formatAmount(totalDetailedBankSum)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* Add Custom Bank Entry Button */}
              <div className="flex justify-between items-center no-print pt-3">
                <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded border border-amber-200">
                  💡 Tip: Click any cell to modify text, bank name, party, address or amount!
                </span>
                <button
                  type="button"
                  onClick={() => setExtraBankRows([...extraBankRows, {
                    id: `bext_${Date.now()}`,
                    date: formatDateDDMMYY(new Date().toISOString().substring(0, 10)),
                    bankName: 'PBL(PE)',
                    partyName: 'Sample Customer',
                    address: 'Madhupur',
                    amount: '0'
                  }])}
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center space-x-1.5 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  <span>+ Add Custom Bank Line</span>
                </button>
              </div>
            </div>
          </div>

          {/* NEXT / PREVIOUS NAVIGATION BAR FOR PAGE 2 */}
          <div className="flex flex-wrap items-center justify-between pt-6 border-t border-cyan-500/20 no-print max-w-4xl mx-auto gap-3">
            <span className="text-xs font-bold text-cyan-200 bg-[#081b28] px-3 py-1.5 rounded-xl border border-cyan-500/25">
              Page 2: Party-Wise Bank Details
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveReportTab('customer_wise_sales_collection')}
                className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center space-x-1.5"
              >
                <ChevronLeft className="w-4 h-4 text-cyan-300" />
                <span>← Previous Page: Sales & Collection</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveReportTab('special_bank_cash')}
                className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-xl text-xs font-black shadow-md transition-all cursor-pointer flex items-center space-x-1.5"
              >
                <span>Next Page: Bank & Cash Summary</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PAGE 3: BANK & CASH SUMMARY REPORT (GROUPED SUM MATCHING IMAGE 2) */}
      {/* ========================================================= */}
      {activeReportTab === 'special_bank_cash' && (
        <div ref={printRef} className="space-y-8">
          <div className="bg-white p-8 rounded-2xl shadow-xl border-none max-w-4xl mx-auto space-y-8 font-sans print:p-0 print:shadow-none print:border-none print:max-w-full">
            {/* TABLE A: BANK DETAILS GROUPED SUMMED TABLE */}
            <div className="p-4 bg-white">
              <div className="text-center mb-3">
                <h2
                  contentEditable={isLiveEditable}
                  suppressContentEditableWarning={true}
                  className="text-lg font-black text-black tracking-tight font-serif uppercase focus:bg-amber-50 rounded px-2"
                >
                  {effectiveBankCashCenterName}
                </h2>
                <div
                  contentEditable={isLiveEditable}
                  suppressContentEditableWarning={true}
                  className="text-xs font-bold text-black font-mono mt-0.5 focus:bg-amber-50 rounded px-2"
                >
                  {formattedDateRange}
                </div>
              </div>

              <table className="bank-report-table w-full text-xs text-black border-collapse border border-black">
                <thead>
                  <tr className="border-b border-black bg-slate-50 font-bold uppercase text-[11px]">
                    <th contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-center w-12">SL</th>
                    <th
                      contentEditable={isLiveEditable}
                      suppressContentEditableWarning={true}
                      onClick={toggleBankSummaryDateSort}
                      className="p-1.5 border-r border-black text-center w-24 cursor-pointer hover:bg-slate-200 transition-colors select-none"
                      title="Click to sort Date ascending or descending"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Date</span>
                        <span className="text-black font-black text-xs font-mono">
                          {bankSummaryDateSortDir === 'asc' ? '▲' : '▼'}
                        </span>
                      </div>
                    </th>
                    <th contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-left">Bank & Account Short Tag</th>
                    <th contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 text-right w-36">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {bankSummaryList.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-3 text-center text-slate-500 italic">
                        No bank details entries recorded for this selection.
                      </td>
                    </tr>
                  ) : (
                    bankSummaryList.map((item, idx) => (
                      <tr key={item.id + idx} className="border-b border-slate-300 hover:bg-slate-50">
                        <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-center font-mono">{idx + 1}</td>
                        <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-center font-mono">{formatDateDDMMYY(item.date)}</td>
                        <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-slate-900 font-mono font-bold">
                          <span className="inline-flex items-center px-2 py-0.5 rounded font-mono font-black text-xs bg-slate-900 text-amber-300 border border-slate-700 shadow-2xs">
                            {item.shortTag || getBankAndAccountShortTag(item.bankName, item.accountName)}
                          </span>
                        </td>
                        <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 text-right font-bold font-mono">
                          {formatAmount(item.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-black font-black bg-slate-100">
                    <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} colSpan={3} className="p-1.5 text-right uppercase text-xs border-r border-black">
                      Total=
                    </td>
                    <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 text-right text-xs font-mono font-black">
                      {formatAmount(totalBankSummarySum)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* TABLE B: CASH RECEIVED TABLE */}
            <div className="p-4 bg-white">
              <div className="text-center mb-3">
                <h2
                  contentEditable={isLiveEditable}
                  suppressContentEditableWarning={true}
                  className="text-lg font-black text-black tracking-tight font-serif uppercase focus:bg-amber-50 rounded px-2"
                >
                  {effectiveBankCashCenterName}
                </h2>
                <div
                  contentEditable={isLiveEditable}
                  suppressContentEditableWarning={true}
                  className="text-xs font-bold text-black font-mono mt-0.5 focus:bg-amber-50 rounded px-2"
                >
                  {formattedDateRange}
                </div>
                <div
                  contentEditable={isLiveEditable}
                  suppressContentEditableWarning={true}
                  className="text-xs font-extrabold text-black uppercase tracking-wider mt-1 border-b border-black inline-block px-3 py-0.5 focus:bg-amber-50 rounded"
                >
                  Cash Received
                </div>
              </div>

              <table className="bank-report-table w-full text-xs text-black border-collapse border border-black">
                <thead>
                  <tr className="border-b border-black bg-slate-50 font-bold uppercase text-[11px]">
                    <th contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-center w-12">SL</th>
                    <th
                      contentEditable={isLiveEditable}
                      suppressContentEditableWarning={true}
                      onClick={toggleCashReceivedDateSort}
                      className="p-1.5 border-r border-black text-center w-24 cursor-pointer hover:bg-slate-200 transition-colors select-none"
                      title="Click to sort Date ascending or descending"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Date</span>
                        <span className="text-black font-black text-xs font-mono">
                          {cashReceivedDateSortDir === 'asc' ? '▲' : '▼'}
                        </span>
                      </div>
                    </th>
                    <th contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-left">Party Name</th>
                    <th contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-left">Address</th>
                    <th contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 text-right w-32">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCashReceivedList.length === 0 && extraCashRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-3 text-center text-slate-500 italic">
                        No cash received collection entries recorded for this selection.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {sortedCashReceivedList.map((item, idx) => (
                        <tr key={item.id + idx} className="border-b border-slate-300 hover:bg-slate-50">
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-center font-mono">{idx + 1}</td>
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-center font-mono">{formatDateDDMMYY(item.date)}</td>
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black font-bold text-slate-900">{item.partyName}</td>
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-slate-800">{(item as any).address || getPartyAddress(item.partyName) || '-'}</td>
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 text-right font-bold font-mono">
                            {formatAmount(item.amount)}
                          </td>
                        </tr>
                      ))}

                      {/* Render extra custom cash rows */}
                      {extraCashRows.map((ext, idx) => (
                        <tr key={ext.id} className="border-b border-amber-300 bg-amber-50/20 group">
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-center font-mono">{cashReceivedList.length + idx + 1}</td>
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-center font-mono">{ext.date}</td>
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black font-bold text-slate-900">{ext.partyName}</td>
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 border-r border-black text-slate-800">{ext.address}</td>
                          <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 text-right font-bold font-mono relative">
                            <span>{ext.amount}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExtraCashRows(extraCashRows.filter((r) => r.id !== ext.id));
                              }}
                              className="no-print ml-2 text-rose-600 hover:text-rose-800 font-bold p-1 hover:bg-rose-100 rounded text-[10px] inline-flex items-center cursor-pointer"
                              title="Delete custom cash line"
                            >
                              <Trash2 className="w-3 h-3 inline" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-black font-black bg-slate-100">
                    <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} colSpan={4} className="p-1.5 text-right uppercase text-xs border-r border-black">
                      Total=
                    </td>
                    <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-1.5 text-right text-xs font-mono font-black">
                      {formatAmount(totalCashReceivedSum)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* Add Custom Cash Line Button */}
              <div className="flex justify-between items-center no-print pt-3">
                <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded border border-amber-200">
                  💡 Tip: Click any row cell above to modify amounts or party names directly!
                </span>
                <button
                  type="button"
                  onClick={() => setExtraCashRows([...extraCashRows, {
                    id: `cext_${Date.now()}`,
                    date: formatDateDDMMYY(new Date().toISOString().substring(0, 10)),
                    partyName: 'Sample Customer',
                    address: 'Madhupur',
                    amount: '0'
                  }])}
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center space-x-1.5 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  <span>+ Add Custom Cash Line</span>
                </button>
              </div>
            </div>
          </div>

          {/* NEXT / PREVIOUS NAVIGATION BAR FOR PAGE 3 */}
          <div className="flex flex-wrap items-center justify-between pt-6 border-t border-cyan-500/20 no-print max-w-4xl mx-auto gap-3">
            <span className="text-xs font-bold text-cyan-200 bg-[#081b28] px-3 py-1.5 rounded-xl border border-cyan-500/25">
              Page 3: Bank & Cash Summary
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveReportTab('party_bank_details')}
                className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center space-x-1.5"
              >
                <ChevronLeft className="w-4 h-4 text-cyan-300" />
                <span>← Previous Page: Party-Wise Bank Details</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveReportTab('bill_wise_sales')}
                className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-xl text-xs font-black shadow-md transition-all cursor-pointer flex items-center space-x-1.5"
              >
                <span>Next Page: Bill-Wise Sales</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: BILL-WISE SALES & COLLECTION REPORT (MARKETING, SHOWROOM, OFFICE) */}
      {/* ========================================================= */}
      {activeReportTab === 'bill_wise_sales' && (
        <div className="cyber-glass-card p-6 rounded-2xl border border-cyan-500/25 space-y-4 text-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/20 pb-4">
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-cyan-300" />
                <span>Bill-Wise Sales & Collection Statement</span>
              </h3>
              <p className="text-xs text-cyan-200/70">
                Detailed invoice breakdown categorizing Marketing, Sales Center counters, and Office direct sales
              </p>
            </div>

            {/* Sub-category Filter */}
            <div className="flex items-center space-x-1 bg-[#081b28] p-1 rounded-xl border border-cyan-500/25">
              {(['All', 'Marketing', 'Showroom', 'Office'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-cyan-400 text-slate-950 shadow-xs font-black'
                      : 'text-slate-300 hover:text-white hover:bg-[#0e2a3d]'
                  }`}
                >
                  {cat === 'All' ? 'All Channels' : cat === 'Showroom' ? 'Sales Center' : cat}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-cyan-500/20">
            <table className="w-full text-left text-xs text-slate-200 border-collapse">
              <thead>
                <tr className="bg-[#0c2638] font-bold uppercase text-[10px] border-b border-cyan-500/30 text-cyan-200">
                  <th contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-3 w-12 text-center">SL#</th>
                  <th
                    contentEditable={isLiveEditable}
                    suppressContentEditableWarning={true}
                    onClick={() => toggleBillWiseSort('date')}
                    className="p-3 w-28 cursor-pointer hover:bg-[#11334a] transition-colors select-none"
                    title="Click to sort by Date"
                  >
                    <div className="flex items-center gap-1">
                      <span>Date</span>
                      {billWiseSortBy === 'date' && (
                        <span className="text-cyan-300 font-black text-xs">{billWiseSortDir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    contentEditable={isLiveEditable}
                    suppressContentEditableWarning={true}
                    onClick={() => toggleBillWiseSort('billNo')}
                    className="p-3 w-24 cursor-pointer hover:bg-[#11334a] transition-colors select-none"
                    title="Click to sort by Bill No"
                  >
                    <div className="flex items-center gap-1">
                      <span>Bill No</span>
                      {billWiseSortBy === 'billNo' && (
                        <span className="text-cyan-300 font-black text-xs">{billWiseSortDir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    contentEditable={isLiveEditable}
                    suppressContentEditableWarning={true}
                    onClick={() => toggleBillWiseSort('partyName')}
                    className="p-3 min-w-[180px] cursor-pointer hover:bg-[#11334a] transition-colors select-none"
                    title="Click to sort by Party Name"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>Party Name</span>
                      {billWiseSortBy === 'partyName' && (
                        <span className="text-cyan-300 font-black text-xs">{billWiseSortDir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    contentEditable={isLiveEditable}
                    suppressContentEditableWarning={true}
                    onClick={() => toggleBillWiseSort('address')}
                    className="p-3 min-w-[120px] cursor-pointer hover:bg-[#11334a] transition-colors select-none"
                    title="Click to sort by Address"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>Address</span>
                      {billWiseSortBy === 'address' && (
                        <span className="text-cyan-300 font-black text-xs">{billWiseSortDir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    contentEditable={isLiveEditable}
                    suppressContentEditableWarning={true}
                    onClick={() => toggleBillWiseSort('salesperson')}
                    className="p-3 min-w-[140px] cursor-pointer hover:bg-[#11334a] transition-colors select-none"
                    title="Click to sort by Salesperson"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>Salesperson / Channel</span>
                      {billWiseSortBy === 'salesperson' && (
                        <span className="text-cyan-300 font-black text-xs">{billWiseSortDir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    contentEditable={isLiveEditable}
                    suppressContentEditableWarning={true}
                    onClick={() => toggleBillWiseSort('billAmount')}
                    className="p-3 w-28 text-right bg-[#103047] text-white cursor-pointer hover:bg-[#143d59] transition-colors select-none"
                    title="Click to sort by Bill Amount"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Bill Amount (Tk)</span>
                      {billWiseSortBy === 'billAmount' && (
                        <span className="text-cyan-300 font-black text-xs">{billWiseSortDir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-3 w-28 text-right bg-emerald-500/15 text-emerald-300">Collection (Tk)</th>
                  <th contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-3 w-28 text-right bg-rose-500/15 text-rose-300">Balance Due (Tk)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60">
                {filteredBills.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-400 italic">
                      No bill entries found for the selected date range and channel filters.
                    </td>
                  </tr>
                ) : (
                  [...filteredBills].sort((a, b) => {
                    let cmp = 0;
                    if (billWiseSortBy === 'date') {
                      const rawDateA = a.header?.date || a.savedAt?.substring(0, 10) || '';
                      const rawDateB = b.header?.date || b.savedAt?.substring(0, 10) || '';
                      const isoA = parseDateToISO(rawDateA) || rawDateA;
                      const isoB = parseDateToISO(rawDateB) || rawDateB;
                      cmp = isoA.localeCompare(isoB);
                    } else if (billWiseSortBy === 'billNo') {
                      const noA = a.header?.billNo || '';
                      const noB = b.header?.billNo || '';
                      cmp = noA.localeCompare(noB, undefined, { numeric: true });
                    } else if (billWiseSortBy === 'partyName') {
                      cmp = (a.header?.partyName || '').localeCompare(b.header?.partyName || '');
                    } else if (billWiseSortBy === 'address') {
                      cmp = (a.header?.address || '').localeCompare(b.header?.address || '');
                    } else if (billWiseSortBy === 'salesperson') {
                      const spA = a.header?.salespersonName || a.header?.salesmanCode || '';
                      const spB = b.header?.salespersonName || b.header?.salesmanCode || '';
                      cmp = spA.localeCompare(spB);
                    } else if (billWiseSortBy === 'billAmount') {
                      cmp = (a.grandTotal || 0) - (b.grandTotal || 0);
                    }
                    return billWiseSortDir === 'asc' ? cmp : -cmp;
                  }).map((bill, idx) => {
                    const billVal = bill.grandTotal || 0;
                    const pName = bill.header?.partyName || '';
                    const party = parties.find((p) => p.name?.trim().toLowerCase() === pName.trim().toLowerCase());
                    const spName = bill.header?.salespersonName || party?.salespersonName || party?.salesmanCode || 'Sales Center / Counter';
                    
                    // Match collections for this party
                    const partyColSum = collections
                      .filter((c) => !isYearEndSettlementCollection(c) && c.partyName?.trim().toLowerCase() === pName.trim().toLowerCase())
                      .reduce((s, c) => s + c.amount, 0);

                    const dueVal = Math.max(0, billVal - partyColSum);

                    return (
                      <tr key={bill.id} className="hover:bg-cyan-500/[0.06] transition-colors">
                        <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                        <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-3 font-mono text-slate-300">{formatDateDDMMYY(bill.header?.date)}</td>
                        <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-3 font-mono font-bold text-cyan-300">{bill.header?.billNo || 'N/A'}</td>
                        <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-3 font-extrabold text-white">{pName}</td>
                        <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-3 text-slate-300">{bill.header?.address || party?.address || getPartyAddress(pName)}</td>
                        <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-3 font-semibold text-slate-200">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                            bill.header?.salespersonName || party?.salespersonName || party?.salesmanCode
                              ? 'bg-purple-500/20 text-purple-200 border-purple-400/30'
                              : 'bg-cyan-500/20 text-cyan-200 border-cyan-400/30'
                          }`}>
                            {spName}
                          </span>
                        </td>
                        <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-3 text-right font-extrabold text-white font-mono bg-white/[0.03]">
                          ৳{formatAmount(billVal)}
                        </td>
                        <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-3 text-right font-extrabold text-emerald-300 font-mono bg-emerald-500/[0.06]">
                          ৳{formatAmount(partyColSum)}
                        </td>
                        <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-3 text-right font-extrabold text-rose-300 font-mono bg-rose-500/[0.06]">
                          ৳{formatAmount(dueVal)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filteredBills.length > 0 && (
                <tfoot>
                  <tr className="bg-[#0c2638] text-white font-extrabold border-t border-cyan-500/30">
                    <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} colSpan={6} className="p-3 text-right uppercase text-xs text-cyan-200">
                      Total Filtered Sales:
                    </td>
                    <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-3 text-right font-mono text-sm text-amber-300">
                      ৳{formatAmount(totalSalesVal)}
                    </td>
                    <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-3 text-right font-mono text-sm text-emerald-300">
                      ৳{formatAmount(totalCashReceivedSum + totalBankCollectionsSum)}
                    </td>
                    <td contentEditable={isLiveEditable} suppressContentEditableWarning={true} className="p-3 text-right font-mono text-sm text-rose-300">
                      ৳{formatAmount(Math.max(0, totalSalesVal - (totalCashReceivedSum + totalBankCollectionsSum)))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* NEXT PAGE NAVIGATION BAR FOR BILL WISE SALES */}
          <div className="flex flex-wrap items-center justify-between pt-6 border-t border-cyan-500/20 no-print gap-3">
            <span className="text-xs font-bold text-cyan-200 bg-[#081b28] px-3 py-1.5 rounded-xl border border-cyan-500/25">
              Page 4: Bill-Wise Sales & Collection Statement
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveReportTab('special_bank_cash')}
                className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center space-x-1.5"
              >
                <ChevronLeft className="w-4 h-4 text-cyan-300" />
                <span>← Previous Page: Bank & Cash Summary</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveReportTab('customer_wise_sales_collection')}
                className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-xl text-xs font-black shadow-md transition-all cursor-pointer flex items-center space-x-1.5"
              >
                <span>Return to Page 1: Customer Statement</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Bottom Action Bar */}
      <div className="no-print cyber-glass-card p-3.5 rounded-2xl border border-cyan-500/25 flex flex-wrap items-center justify-end gap-2">
        {isSuvroAdmin && (
          <button
            type="button"
            onClick={() => {
              setActiveClosingParty(null);
              setClosingModalDefaultTab('history');
              setShowClosingModal(true);
            }}
            className="px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center space-x-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-md border border-amber-300"
            title="Open Annual Financial Year Closing History & Settlements"
          >
            <Award className="w-4 h-4 text-slate-950" />
            <span>FY Close list</span>
          </button>
        )}

        {activeReportTab === 'office_report' && (
          <button
            type="button"
            onClick={handleExportOfficeReportExcel}
            className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs px-3.5 py-2 rounded-xl font-bold flex items-center space-x-1.5 border border-emerald-400/35 cursor-pointer shadow-xs transition-colors"
            title="Export Office Statement to Excel spreadsheet"
          >
            <Download className="w-4 h-4 text-emerald-300" />
            <span>Excel (.xlsx)</span>
          </button>
        )}

        <button
          type="button"
          onClick={handlePrint}
          className="bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs px-4 py-2 rounded-xl font-black flex items-center space-x-1.5 border border-cyan-300 cursor-pointer shadow-xs transition-colors"
          title="Print Report Statement"
        >
          <Printer className="w-4 h-4 text-slate-950" />
          <span>Print Report</span>
        </button>
      </div>
      </div>

      {/* ========================================================= */}
      {/* FULL PRINT PREVIEW MODAL */}
      {/* ========================================================= */}
      {showPrintPreviewModal && (
        <div className="print-preview-modal-backdrop fixed inset-0 z-50 bg-[#030d14]/85 backdrop-blur-sm flex flex-col justify-start items-center overflow-y-auto p-2 sm:p-4">
          <div className="print-preview-modal-dialog bg-[#091e2c]/95 backdrop-blur-2xl border border-cyan-400/35 shadow-[0_24px_64px_rgba(0,0,0,0.65)] rounded-2xl w-full max-w-6xl flex flex-col overflow-hidden text-white my-auto">
            {/* Modal Top Sticky Toolbar */}
            <div className="cyber-glass-header px-5 py-3 border-b border-cyan-500/25 flex flex-wrap items-center justify-between gap-3 no-print">
              <div className="flex items-center space-x-2">
                <Printer className="w-5 h-5 text-cyan-300" />
                <span className="font-extrabold text-sm text-white">
                  Print Preview —{' '}
                  {activeReportTab === 'customer_wise_sales_collection'
                    ? 'Sales & Collection Report Statement'
                    : activeReportTab === 'office_report'
                    ? 'Office Monthly Sales & Collection Report'
                    : activeReportTab === 'special_bank_cash'
                    ? 'Office Report (Special Bank & Cash Statement)'
                    : activeReportTab === 'party_bank_details'
                    ? 'Party Bank Details Statement'
                    : 'Bill-Wise Sales Statement'}
                </span>
                <span className="bg-cyan-500/20 text-cyan-200 text-[10px] font-mono px-2 py-0.5 rounded border border-cyan-400/30">
                  {activeReportTab === 'customer_wise_sales_collection' && statementViewMode === 'unified'
                    ? 'A4 Landscape'
                    : activeReportTab === 'office_report'
                    ? 'A4 Landscape'
                    : 'A4 Portrait'}
                </span>
              </div>

              <div className="flex items-center space-x-2">
                {/* Zoom Selector */}
                <div className="flex items-center bg-[#061520] border border-cyan-500/30 rounded-lg p-0.5 text-xs font-mono">
                  {(['80%', '100%', '115%'] as const).map((z) => (
                    <button
                      key={z}
                      type="button"
                      onClick={() => setPreviewZoom(z)}
                      className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                        previewZoom === z ? 'bg-cyan-400 text-slate-950 font-black' : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {z}
                    </button>
                  ))}
                </div>

                {/* Print Now Button */}
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black px-4 py-1.5 rounded-lg text-xs flex items-center space-x-1.5 shadow-md transition-all cursor-pointer hover:scale-105 active:scale-95"
                  title="Trigger system print dialog"
                >
                  <Printer className="w-4 h-4 text-slate-950" />
                  <span>Print Now (Ctrl+P)</span>
                </button>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setShowPrintPreviewModal(false)}
                  className="bg-[#081b28] hover:bg-rose-600 text-slate-200 hover:text-white border border-cyan-500/25 p-1.5 rounded-lg transition-colors cursor-pointer ml-1"
                  title="Close Print Preview"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Canvas Body */}
            <div className="print-preview-canvas-container p-3 sm:p-8 overflow-auto bg-[#05131c] flex-1 flex justify-start sm:justify-center items-start">
              <div
                className="print-paper-sheet bg-white text-black shadow-2xl border border-slate-300 rounded-sm font-sans transition-all duration-200 origin-top p-4 sm:p-8 max-w-[1050px] w-full print:max-w-full print:p-2 print:border-none print:shadow-none print:mb-0!"
                style={{
                  transform: previewZoom === '80%' ? 'scale(0.8)' : previewZoom === '115%' ? 'scale(1.15)' : 'scale(1)',
                  transformOrigin: 'top center',
                  marginBottom: previewZoom === '115%' ? '120px' : '20px'
                }}
              >
                {/* Official Paper Header */}
                <div className="text-center pb-4 border-b-2 border-black mb-4">
                  {activeReportTab === 'special_bank_cash' ? (
                    <>
                      <h1 className="text-2xl font-black uppercase tracking-wider text-black font-serif">
                        {effectiveBankCashCenterName}
                      </h1>
                      <div className="text-xs font-bold text-black font-mono mt-1">
                        Date: {formatDateDDMMYY(startDate)} to {formatDateDDMMYY(endDate)}
                      </div>
                      <p className="text-xs font-extrabold text-slate-800 uppercase tracking-widest mt-1 border-b border-black inline-block px-4 py-0.5">
                        Bank &amp; Cash Summary Statement
                      </p>
                    </>
                  ) : activeReportTab === 'office_report' ? (
                    <>
                      <div className="flex justify-center mb-1">
                        <PolyCablesLogo size="xl" showSubtitle={false} />
                      </div>
                      <h1 className="text-xl font-black uppercase tracking-wider text-black font-serif mt-1">
                        {selectedMarketingPerson !== 'All' 
                          ? selectedMarketingPerson 
                          : reportHeaderCenterName}
                      </h1>
                      {reportHeaderAddress && (
                        <p className="text-xs text-slate-800 font-semibold mt-0.5">
                          {reportHeaderAddress}{reportHeaderPhone ? ` • Ph: ${reportHeaderPhone}` : ''}
                        </p>
                      )}
                      <div className="mt-2 inline-flex items-center gap-3 bg-slate-100 border border-black px-4 py-1 rounded text-xs font-bold font-mono">
                        <span className="uppercase tracking-wider font-sans font-black text-slate-900">Office Statement</span>
                        <span>•</span>
                        <span>Period: {startDate || officeMonthStartDateDDMMYY} to {endDate || officeMonthEndDateDDMMYY}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-center mb-1">
                        <PolyCablesLogo size="xl" showSubtitle={false} />
                      </div>
                      <p className="text-sm font-black uppercase text-slate-900 mt-1.5 underline underline-offset-4">
                        {activeReportTab === 'customer_wise_sales_collection'
                          ? 'Sales & Collection Report Statement'
                          : activeReportTab === 'party_bank_details'
                          ? 'Party-Wise Bank Collection Statement'
                          : 'Bill-Wise Sales Registry Statement'}
                      </p>
                      <div className="flex justify-center items-center gap-4 text-xs font-bold font-mono mt-1.5 text-black">
                        <span>Date: {formatDateDDMMYY(startDate)} to {formatDateDDMMYY(endDate)}</span>
                        {selectedMarketingPerson !== 'All' && (
                          <span className="border border-black px-2 py-0.5 rounded text-[11px]">
                            Marketing: {selectedMarketingPerson}
                          </span>
                        )}
                        {selectedCustomer !== 'All' && (
                          <span className="border border-black px-2 py-0.5 rounded text-[11px]">
                            Customer: {selectedCustomer}
                          </span>
                        )}
                        {selectedEntity !== 'All' && (
                          <span className="border border-black px-2 py-0.5 rounded text-[11px]">
                            Branch: {selectedEntity}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* 1. SALES & COLLECTION REPORT PREVIEW TABLE */}
                {activeReportTab === 'customer_wise_sales_collection' && (
                  <div>
                    {statementViewMode === 'unified' ? (
                      <div className="space-y-4">
                        <div className="overflow-x-auto">
                          <table style={{ fontSize: reportFontSize }} className="w-full text-black border-collapse border border-black font-sans">
                            <thead>
                              <tr className="border-b border-black bg-slate-50 font-bold">
                                <th className="p-1 border-r border-black text-center w-8">SL</th>
                                <th className="p-1 border-r border-black text-center w-20">Date</th>
                                <th className="p-1 border-r border-black text-left">Party Name</th>
                                <th className="p-1 border-r border-black text-left">Address</th>
                                <th className="p-1 border-r border-black text-center w-16">Bill No.</th>
                                <th className="p-1 border-r border-black text-right">Bill Amount</th>
                                <th className="p-1 border-r border-black text-right">Less Disc</th>
                                <th className="p-1 border-r border-black text-right">Net Amount</th>
                                <th className="p-1 border-r border-black text-right">Collection</th>
                                <th className="p-1 border-r border-black text-center w-24">Remarks</th>
                                <th className="p-1 text-center w-16">Coils</th>
                              </tr>
                            </thead>
                            <tbody>
                              {unifiedStatementList.length === 0 && extraUnifiedRows.length === 0 ? (
                                <tr>
                                  <td colSpan={11} className="p-4 text-center text-slate-500 italic">
                                    No statement records found for this period.
                                  </td>
                                </tr>
                              ) : (
                                <>
                                  {unifiedStatementList.map((item, idx) => {
                                    const matchedStoredBill = storedBills.find(b =>
                                      b.id === item.id ||
                                      (item.billNo && item.billNo !== '-' && item.billNo !== 'Cash' && !item.billNo.startsWith('Challan') && b.header?.billNo && b.header.billNo.trim().toLowerCase() === item.billNo.trim().toLowerCase())
                                    );
                                    const matchedCollection = (item.collection > 0 || item.billNo === 'Cash') ? collections.find(c =>
                                      c.id === item.id ||
                                      (c.partyName?.trim().toLowerCase() === item.partyName.trim().toLowerCase() && Number(c.amount) === Number(item.collection) && c.date === item.date)
                                    ) : null;

                                    return (
                                      <tr key={item.id} className="border-b border-slate-300 hover:bg-amber-50/30 transition-colors">
                                        <td className="p-1 border-r border-black text-center font-mono">{idx + 1}</td>
                                        <td className="p-1 border-r border-black text-center font-mono">{formatDateDDMMYY(item.date)}</td>
                                        <td className="p-1 border-r border-black font-bold">{item.partyName}</td>
                                        <td className="p-1 border-r border-black">{item.address}</td>
                                        <td className="p-1 border-r border-black text-center font-mono font-bold">
                                          {matchedStoredBill ? (
                                            <div className="inline-flex items-center justify-center gap-1">
                                              <button
                                                type="button"
                                                onClick={() => handleEditBill(matchedStoredBill)}
                                                className="text-blue-700 hover:text-blue-900 underline font-bold inline-flex items-center gap-0.5 cursor-pointer transition-colors group"
                                                title={`Click to edit Bill #${item.billNo}`}
                                              >
                                                <span>{item.billNo}</span>
                                                <Edit3 className="w-2.5 h-2.5 text-blue-600 opacity-70 group-hover:opacity-100 no-print" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => setPreviewBill(matchedStoredBill)}
                                                className="text-slate-500 hover:text-blue-600 no-print cursor-pointer"
                                                title="View bill preview"
                                              >
                                                <Eye className="w-3 h-3 inline" />
                                              </button>
                                            </div>
                                          ) : matchedCollection ? (
                                            <button
                                              type="button"
                                              onClick={() => setEditingCollection(matchedCollection)}
                                              className="text-emerald-700 hover:text-emerald-900 underline font-bold inline-flex items-center gap-0.5 cursor-pointer transition-colors group"
                                              title={`Click to edit Collection MR (${matchedCollection.mrNo || item.billNo})`}
                                            >
                                              <span>{item.billNo || 'Cash'}</span>
                                              <Edit3 className="w-2.5 h-2.5 text-emerald-600 opacity-70 group-hover:opacity-100 no-print" />
                                            </button>
                                          ) : (
                                            <span>{item.billNo}</span>
                                          )}
                                        </td>
                                        <td className="p-1 border-r border-black text-right font-mono">
                                          {item.billAmount ? (
                                            matchedStoredBill ? (
                                              <button
                                                type="button"
                                                onClick={() => handleEditBill(matchedStoredBill)}
                                                className="text-slate-900 hover:text-blue-800 hover:underline cursor-pointer"
                                                title={`Click to edit Bill #${item.billNo}`}
                                              >
                                                {formatAmount(item.billAmount)}
                                              </button>
                                            ) : (
                                              formatAmount(item.billAmount)
                                            )
                                          ) : ''}
                                        </td>
                                        <td className="p-1 border-r border-black text-right font-mono">{item.lessDiscount ? formatAmount(item.lessDiscount) : ''}</td>
                                        <td className="p-1 border-r border-black text-right font-mono font-bold">
                                          {item.netAmount ? (
                                            matchedStoredBill ? (
                                              <button
                                                type="button"
                                                onClick={() => handleEditBill(matchedStoredBill)}
                                                className="text-slate-900 hover:text-blue-800 hover:underline cursor-pointer"
                                                title={`Click to edit Bill #${item.billNo}`}
                                              >
                                                {formatAmount(item.netAmount)}
                                              </button>
                                            ) : (
                                              formatAmount(item.netAmount)
                                            )
                                          ) : ''}
                                        </td>
                                        <td className="p-1 border-r border-black text-right font-mono font-bold">
                                          {item.collection ? (
                                            matchedCollection ? (
                                              <button
                                                type="button"
                                                onClick={() => setEditingCollection(matchedCollection)}
                                                className="text-emerald-900 hover:text-emerald-950 font-bold hover:underline cursor-pointer inline-flex items-center gap-1 justify-end"
                                                title={`Click to edit Collection MR (${matchedCollection.mrNo || 'Collection'})`}
                                              >
                                                <span>{formatAmount(item.collection)}</span>
                                                <Edit3 className="w-2.5 h-2.5 text-emerald-600 opacity-60 hover:opacity-100 no-print" />
                                              </button>
                                            ) : (
                                              formatAmount(item.collection)
                                            )
                                          ) : ''}
                                        </td>
                                        <td className="p-1 border-r border-black text-center text-[10px]">{item.remarks}</td>
                                        <td className="p-1 text-center font-mono">{item.coils > 0 ? `${item.coils}` : ''}</td>
                                      </tr>
                                    );
                                  })}
                                  {extraUnifiedRows.map((ext, idx) => (
                                    <tr key={ext.id} className="border-b border-slate-300">
                                      <td className="p-1 border-r border-black text-center font-mono">{unifiedStatementList.length + idx + 1}</td>
                                      <td className="p-1 border-r border-black text-center font-mono">{ext.date}</td>
                                      <td className="p-1 border-r border-black font-bold">{ext.partyName}</td>
                                      <td className="p-1 border-r border-black">{ext.address}</td>
                                      <td className="p-1 border-r border-black text-center font-mono">{ext.billNo}</td>
                                      <td className="p-1 border-r border-black text-right font-mono">{ext.billAmount}</td>
                                      <td className="p-1 border-r border-black text-right font-mono">{ext.lessDiscount}</td>
                                      <td className="p-1 border-r border-black text-right font-mono font-bold">{ext.netAmount}</td>
                                      <td className="p-1 border-r border-black text-right font-mono font-bold">{ext.collection}</td>
                                      <td className="p-1 border-r border-black text-center text-[10px]">{ext.remarks}</td>
                                      <td className="p-1 text-center font-mono">{ext.coils}</td>
                                    </tr>
                                  ))}
                                </>
                              )}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-black font-bold bg-slate-100">
                                <td colSpan={5} className="p-1 text-right uppercase font-mono border-r border-black">Total=</td>
                                <td className="p-1 text-right font-mono border-r border-black">
                                  {formatAmount(unifiedStatementList.reduce((s, i) => s + i.billAmount, 0))}
                                </td>
                                <td className="p-1 text-right font-mono border-r border-black">
                                  {formatAmount(unifiedStatementList.reduce((s, i) => s + i.lessDiscount, 0))}
                                </td>
                                <td className="p-1 text-right font-mono font-bold border-r border-black">
                                  {formatAmount(unifiedTotalNetAmount)}
                                </td>
                                <td className="p-1 text-right font-mono font-bold border-r border-black">
                                  {formatAmount(unifiedTotalCollection)}
                                </td>
                                <td className="p-1 text-center border-r border-black text-[10px] font-mono">Net Due: ৳{formatAmount(unifiedTotalNetAmount - unifiedTotalCollection)}</td>
                                <td className="p-1 text-center font-mono font-bold">{unifiedTotalCoils} Coils</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    ) : (
                      /* GROUPED CUSTOMER LEDGER BREAKDOWN PRINT VIEW */
                      <div className="space-y-5">
                        {customerWiseData.length === 0 ? (
                          <div className="p-8 text-center text-slate-500 italic border border-dashed border-slate-300 rounded-lg">
                            No customer transactions found matching the selected filters.
                          </div>
                        ) : (
                          <>
                            {/* Master Summary Table if multiple customers */}
                            {customerWiseData.length > 1 && (
                              <div className="border border-black p-3 bg-white rounded-sm space-y-1.5 break-inside-avoid page-break-inside-avoid">
                                <h4 className="text-xs font-black uppercase tracking-wider border-b border-black pb-1">
                                  Customer Account Summary Overview
                                </h4>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs text-black border-collapse border border-black font-sans">
                                    <thead>
                                      <tr className="border-b border-black bg-slate-100 font-bold uppercase text-[10px]">
                                        <th className="p-1 border-r border-black text-center w-8">SL</th>
                                        <th className="p-1 border-r border-black text-left">Customer / Party Name</th>
                                        <th className="p-1 border-r border-black text-left">Sales Representative</th>
                                        <th className="p-1 border-r border-black text-right w-24">B/F (Tk)</th>
                                        <th className="p-1 border-r border-black text-right w-24">Total Sales (Tk)</th>
                                        <th className="p-1 border-r border-black text-right w-24">Collection (Tk)</th>
                                        <th className="p-1 text-right w-28">Closing Balance (Tk)</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {customerWiseData.map((c, idx) => (
                                        <tr key={c.party.id || idx} className="border-b border-slate-300">
                                          <td className="p-1 border-r border-black text-center font-mono">{idx + 1}</td>
                                          <td className="p-1 border-r border-black font-bold">{c.party.name}</td>
                                          <td className="p-1 border-r border-black">{c.party.salespersonName || c.party.salesmanCode || 'Direct Showroom'}</td>
                                          <td className="p-1 border-r border-black text-right font-mono font-bold text-slate-800">৳{formatAmount(c.openingBalance)}</td>
                                          <td className="p-1 border-r border-black text-right font-mono font-bold">৳{formatAmount(c.totalSales)}</td>
                                          <td className="p-1 border-r border-black text-right font-mono font-bold text-emerald-900">৳{formatAmount(c.totalCollections)}</td>
                                          <td className="p-1 text-right font-mono font-black">৳{formatAmount(c.closingBalance)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    <tfoot>
                                      <tr className="border-t-2 border-black font-black bg-slate-100 text-xs">
                                        <td colSpan={3} className="p-1 text-right uppercase border-r border-black">Grand Total ({customerWiseData.length} Customers):</td>
                                        <td className="p-1 text-right font-mono font-bold border-r border-black">৳{formatAmount(grandTotalCustomerOpeningBalance)}</td>
                                        <td className="p-1 text-right font-mono font-bold border-r border-black">৳{formatAmount(grandTotalCustomerSales)}</td>
                                        <td className="p-1 text-right font-mono font-bold border-r border-black text-emerald-900">৳{formatAmount(grandTotalCustomerCollections)}</td>
                                        <td className="p-1 text-right font-mono font-black">৳{formatAmount(grandTotalCustomerNetBalance)}</td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* Detailed Individual Customer Ledgers Breakdown */}
                            {customerWiseData.map((item, idx) => (
                              <div key={item.party?.id ? `${item.party.id}-${idx}` : `party-box-${idx}`} className="border border-black p-3 bg-white rounded-sm space-y-2 break-inside-avoid page-break-inside-avoid">
                                {/* Party Banner */}
                                <div className="flex items-center justify-between border-b border-black pb-1.5 bg-slate-50 p-2 text-xs">
                                  <div>
                                    <h3 className="font-black text-sm uppercase text-black">{item.party.name}</h3>
                                    <p className="text-[11px] text-slate-700 font-medium">Address: {item.party.address || 'Madhupur'} {item.party.phone ? `• Ph: ${item.party.phone}` : ''}</p>
                                  </div>
                                  <div className="text-right text-[11px]">
                                    <div>Sales Rep: <span className="font-bold">{item.party.salespersonName || item.party.salesmanCode || 'Office/Showroom'}</span></div>
                                    <div className="flex items-center justify-end space-x-2 mt-0.5 font-mono font-bold">
                                      <span>B/F: ৳{formatAmount(item.openingBalance)}</span>
                                      <span>•</span>
                                      <span className="font-black">Closing: ৳{formatAmount(item.closingBalance)}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Transactions Table */}
                                <table className="w-full text-xs text-black border-collapse border border-black font-sans">
                                  <thead>
                                    <tr className="border-b border-black bg-slate-100 font-bold uppercase text-[10px]">
                                      <th className="p-1 border-r border-black text-center w-8">SL</th>
                                      <th className="p-1 border-r border-black text-center w-20">Date</th>
                                      <th className="p-1 border-r border-black text-center w-20">Type</th>
                                      <th className="p-1 border-r border-black text-center w-24">Bill No.</th>
                                      <th className="p-1 border-r border-black text-right w-24">Sales Debit (Tk)</th>
                                      <th className="p-1 border-r border-black text-right w-24">Collection Credit (Tk)</th>
                                      <th className="p-1 border-r border-black text-right w-24">Balance (Tk)</th>
                                      <th className="p-1 text-center w-16">Discount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {/* Opening Balance (B/F) Row */}
                                    <tr className="border-b border-slate-300 bg-amber-50/50 font-bold">
                                      <td className="p-1 border-r border-black text-center font-mono text-slate-500">-</td>
                                      <td className="p-1 border-r border-black text-center font-mono">{startDate ? formatDateDDMMYY(startDate) : '-'}</td>
                                      <td className="p-1 border-r border-black text-center font-bold">B/F</td>
                                      <td className="p-1 border-r border-black text-center font-mono">B/F</td>
                                      <td className="p-1 border-r border-black text-right font-mono text-slate-400">-</td>
                                      <td className="p-1 border-r border-black text-right font-mono text-slate-400">-</td>
                                      <td className="p-1 border-r border-black text-right font-mono font-black">৳{formatAmount(item.openingBalance)}</td>
                                      <td className="p-1 text-center font-mono text-slate-400">-</td>
                                    </tr>

                                    {item.transactions.length === 0 ? (
                                      <tr>
                                        <td colSpan={8} className="p-2 text-center text-slate-500 italic">
                                          No sales or collection activity recorded for this period.
                                        </td>
                                      </tr>
                                    ) : (
                                      item.transactions.map((tx, idx) => {
                                        const matchedStoredBill = tx.type === 'sale' ? storedBills.find(b =>
                                          b.id === tx.id ||
                                          (tx.refNo && tx.refNo !== '-' && tx.refNo !== 'Cash' && !tx.refNo.startsWith('Challan') && b.header?.billNo && b.header.billNo.trim().toLowerCase() === tx.refNo.trim().toLowerCase())
                                        ) : null;
                                        const matchedCollection = tx.type === 'collection' ? collections.find(c =>
                                          c.id === tx.id ||
                                          (c.partyName?.trim().toLowerCase() === item.party.name.trim().toLowerCase() && Number(c.amount) === Number(tx.collectionAmount) && c.date === tx.date)
                                        ) : null;

                                        return (
                                          <tr key={tx.id} className="border-b border-slate-300 hover:bg-amber-50/30 transition-colors">
                                            <td className="p-1 border-r border-black text-center font-mono">{idx + 1}</td>
                                            <td className="p-1 border-r border-black text-center font-mono">{formatDateDDMMYY(tx.date)}</td>
                                            <td className="p-1 border-r border-black text-center font-bold">
                                              {tx.type === 'sale' ? 'Sale' : 'Collection'}
                                            </td>
                                            <td className="p-1 border-r border-black text-center font-mono font-bold">
                                              {matchedStoredBill ? (
                                                <div className="inline-flex items-center justify-center gap-1">
                                                  <button
                                                    type="button"
                                                    onClick={() => handleEditBill(matchedStoredBill)}
                                                    className="text-blue-700 hover:text-blue-900 underline font-bold inline-flex items-center gap-0.5 cursor-pointer transition-colors group"
                                                    title={`Click to edit Bill #${tx.refNo}`}
                                                  >
                                                    <span>{tx.refNo}</span>
                                                    <Edit3 className="w-2.5 h-2.5 text-blue-600 opacity-70 group-hover:opacity-100 no-print" />
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => setPreviewBill(matchedStoredBill)}
                                                    className="text-slate-500 hover:text-blue-600 no-print cursor-pointer"
                                                    title="View bill preview"
                                                  >
                                                    <Eye className="w-3 h-3 inline" />
                                                  </button>
                                                </div>
                                              ) : tx.type === 'collection' && matchedCollection ? (
                                                <button
                                                  type="button"
                                                  onClick={() => setEditingCollection(matchedCollection)}
                                                  className="text-emerald-700 hover:text-emerald-900 underline font-bold inline-flex items-center gap-0.5 cursor-pointer transition-colors group"
                                                  title={`Click to edit Collection MR (${matchedCollection.mrNo || tx.refNo})`}
                                                >
                                                  <span>{tx.refNo}</span>
                                                  <Edit3 className="w-2.5 h-2.5 text-emerald-600 opacity-70 group-hover:opacity-100 no-print" />
                                                </button>
                                              ) : (
                                                <span>{tx.refNo}</span>
                                              )}
                                            </td>
                                            <td className="p-1 border-r border-black text-right font-mono font-bold">
                                              {tx.saleAmount > 0 ? (
                                                matchedStoredBill ? (
                                                  <button
                                                    type="button"
                                                    onClick={() => handleEditBill(matchedStoredBill)}
                                                    className="text-slate-900 hover:text-blue-800 hover:underline cursor-pointer"
                                                    title={`Click to edit Bill #${tx.refNo}`}
                                                  >
                                                    {formatAmount(tx.saleAmount)}
                                                  </button>
                                                ) : (
                                                  formatAmount(tx.saleAmount)
                                                )
                                              ) : '-'}
                                            </td>
                                            <td className="p-1 border-r border-black text-right font-mono font-bold text-emerald-900">
                                              {tx.collectionAmount > 0 ? (
                                                matchedCollection ? (
                                                  <button
                                                    type="button"
                                                    onClick={() => setEditingCollection(matchedCollection)}
                                                    className="text-emerald-900 hover:text-emerald-950 font-bold hover:underline cursor-pointer inline-flex items-center gap-1 justify-end"
                                                    title={`Click to edit Collection MR (${matchedCollection.mrNo || 'Collection'})`}
                                                  >
                                                    <span>{formatAmount(tx.collectionAmount)}</span>
                                                    <Edit3 className="w-2.5 h-2.5 text-emerald-600 opacity-60 hover:opacity-100 no-print" />
                                                  </button>
                                                ) : (
                                                  formatAmount(tx.collectionAmount)
                                                )
                                              ) : '-'}
                                            </td>
                                            <td className="p-1 border-r border-black text-right font-mono font-bold">
                                              ৳{formatAmount(tx.runningBalance)}
                                            </td>
                                            <td className="p-1 text-center font-mono font-semibold">
                                              {tx.discountPercent && tx.discountPercent > 0 ? `${tx.discountPercent}%` : '-'}
                                            </td>
                                          </tr>
                                        );
                                      })
                                    )}
                                  </tbody>
                                  <tfoot>
                                    <tr className="bg-slate-100 font-black border-t-2 border-black">
                                      <td colSpan={4} className="p-1 text-right uppercase text-xs border-r border-black">
                                        Total / Closing for {item.party.name}:
                                      </td>
                                      <td className="p-1 text-right font-mono border-r border-black">
                                        ৳{formatAmount(item.totalSales)}
                                      </td>
                                      <td className="p-1 text-right font-mono border-r border-black text-emerald-900">
                                        ৳{formatAmount(item.totalCollections)}
                                      </td>
                                      <td className="p-1 text-right font-mono text-black" colSpan={2}>
                                        ৳{formatAmount(item.closingBalance)}
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            ))}

                            {/* Discount-Wise Summary at the last of the statement under the table */}
                            {renderDiscountWiseSummaryTable(true)}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* OFFICE STATEMENT MONTHLY PREVIEW TABLE */}
                {activeReportTab === 'office_report' && (
                  <div className="space-y-4">
                    {/* Sub-header info bar */}
                    <div className="flex items-center justify-between border-b border-black pb-1.5 text-xs font-bold text-black font-mono">
                      <span>Monthly Summary Breakdown: {officePartyReportData.length} Parties</span>
                      <span>Target: {officeMonthLabel}</span>
                    </div>

                    {/* Main Party Breakdown Table */}
                    <div className="overflow-x-auto">
                      <table className="bank-report-table w-full text-xs text-black border-collapse border border-black font-sans">
                        <thead>
                          <tr className="border-b border-black bg-slate-100 font-bold uppercase text-[10px]">
                            <th className="p-1.5 border-r border-black text-center w-8">SL</th>
                            <th className="p-1.5 border-r border-black text-left">Party Name</th>
                            <th className="p-1.5 border-r border-black text-right w-24">Opening Balance</th>
                            <th className="p-1.5 border-r border-black text-right w-24">this month Total Sale</th>
                            <th className="p-1.5 border-r border-black text-right w-24">this month Total Collection</th>
                            <th className="p-1.5 text-right w-24">balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {officePartyReportData.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-4 text-center text-slate-500 italic">
                                No party transactions found for {officeMonthLabel}.
                              </td>
                            </tr>
                          ) : (
                            officePartyReportData.map((row, idx) => (
                              <tr key={row.party.id || idx} className="border-b border-slate-300">
                                <td className="p-1 border-r border-black text-center font-mono">{idx + 1}</td>
                                <td className="p-1 border-r border-black font-bold">
                                  <div>{row.party.name}</div>
                                  {(row.party.address || row.party.salespersonName || row.party.salesmanCode) && (
                                    <div className="text-[9px] text-slate-500 font-normal">
                                      {[row.party.address, row.party.salespersonName || row.party.salesmanCode].filter(Boolean).join(' • ')}
                                    </div>
                                  )}
                                </td>
                                <td className="p-1 border-r border-black text-right font-mono font-bold text-amber-950">
                                  {row.openingBalance !== 0 ? formatAmount(row.openingBalance) : '0'}
                                </td>
                                <td className="p-1 border-r border-black text-right font-mono font-bold text-blue-950">
                                  {row.totalSales > 0 ? formatAmount(row.totalSales) : '0'}
                                </td>
                                <td className="p-1 border-r border-black text-right font-mono font-bold text-emerald-950">
                                  {row.totalCollection > 0 ? formatAmount(row.totalCollection) : '0'}
                                </td>
                                <td className={`p-1 text-right font-mono font-bold ${
                                  row.balance > 0 ? 'text-slate-900' : row.balance < 0 ? 'text-rose-700' : 'text-slate-400'
                                }`}>
                                  {row.balance !== 0 ? formatAmount(row.balance) : '0'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-black font-black bg-slate-100 text-[11px]">
                            <td colSpan={2} className="p-1.5 text-right uppercase border-r border-black">Grand Total=</td>
                            <td className="p-1.5 text-right font-mono border-r border-black text-amber-950">{formatAmount(officeGrandTotals.totalOpeningBalance)}</td>
                            <td className="p-1.5 text-right font-mono border-r border-black text-blue-950">{formatAmount(officeGrandTotals.totalSales)}</td>
                            <td className="p-1.5 text-right font-mono border-r border-black text-emerald-950">{formatAmount(officeGrandTotals.totalCollection)}</td>
                            <td className="p-1.5 text-right font-mono font-black">{formatAmount(officeGrandTotals.totalEndingBalance)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Summary Reconciliation Box */}
                    <div className="grid grid-cols-2 gap-3 text-xs pt-1 break-inside-avoid page-break-inside-avoid">
                      <div className="border border-black p-2.5 bg-white space-y-1">
                        <div className="font-bold border-b border-black pb-0.5 uppercase text-[10px]">Cash Flow Overview</div>
                        <div className="flex justify-between"><span>Prior Month Ending Cash:</span><span className="font-mono font-bold">৳{formatAmount(lastMonthClosingCash)}</span></div>
                        <div className="flex justify-between"><span>This Month Cash In:</span><span className="font-mono font-bold">+ ৳{formatAmount(officeGrandTotals.currentMonthCashIn)}</span></div>
                        <div className="flex justify-between"><span>This Month Bank Deposited:</span><span className="font-mono font-bold">- ৳{formatAmount(officeGrandTotals.currentMonthBankDeposited)}</span></div>
                        <div className="border-t border-black pt-1 flex justify-between font-black"><span>Ending Cash in Hand:</span><span className="font-mono">৳{formatAmount(officeGrandTotals.currentMonthEndingCash)}</span></div>
                      </div>

                      <div className="border border-black p-2.5 bg-white space-y-1">
                        <div className="font-bold border-b border-black pb-0.5 uppercase text-[10px]">Performance Overview</div>
                        <div className="flex justify-between"><span>Total Sales:</span><span className="font-mono font-bold">৳{formatAmount(officeGrandTotals.totalSales)}</span></div>
                        <div className="flex justify-between"><span>Total Collection:</span><span className="font-mono font-bold">৳{formatAmount(officeGrandTotals.totalCollection)}</span></div>
                        <div className="flex justify-between"><span>Net Balance Difference:</span><span className="font-mono font-bold">৳{formatAmount(officeGrandTotals.netDifference)}</span></div>
                      </div>
                    </div>

                    {/* Signatures */}
                    <div className="grid grid-cols-4 gap-4 pt-10 text-center text-xs font-bold text-black border-t border-slate-300 mt-6 break-inside-avoid page-break-inside-avoid">
                      <div className="border-t border-black pt-1">Prepared By</div>
                      <div className="border-t border-black pt-1">Accountant</div>
                      <div className="border-t border-black pt-1">Branch Manager</div>
                      <div className="border-t border-black pt-1">Head Office Approval</div>
                    </div>
                  </div>
                )}

                {/* 2. OFFICE REPORT (SPECIAL BANK & CASH) PREVIEW TABLE */}
                {activeReportTab === 'special_bank_cash' && (
                  <div className="space-y-6">
                    {/* Table A: Bank Details */}
                    <div>
                      <div className="text-center mb-2.5">
                        <h2 className="text-base font-black text-black tracking-tight font-serif uppercase">
                          {effectiveBankCashCenterName}
                        </h2>
                        <div className="text-xs font-bold text-black font-mono mt-0.5">
                          Date: {formatDateDDMMYY(startDate)} to {formatDateDDMMYY(endDate)}
                        </div>
                      </div>
                      <table className="bank-report-table w-full text-xs text-black border-collapse border border-black">
                        <thead>
                          <tr className="border-b border-black bg-slate-50 font-bold uppercase text-[11px]">
                            <th className="p-1.5 border-r border-black text-center w-12">SL</th>
                            <th
                              onClick={toggleBankSummaryDateSort}
                              className="p-1.5 border-r border-black text-center w-24 cursor-pointer select-none hover:bg-slate-200 transition-colors"
                              title="Click to toggle Date ascending or descending"
                            >
                              <div className="flex items-center justify-center gap-1">
                                <span>Date</span>
                                <span className="text-black font-black text-[10px] font-mono">
                                  {bankSummaryDateSortDir === 'asc' ? '▲' : '▼'}
                                </span>
                              </div>
                            </th>
                            <th className="p-1.5 border-r border-black text-left">Bank & Account Short Tag</th>
                            <th className="p-1.5 text-right w-36">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bankSummaryList.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="p-3 text-center text-slate-500 italic">No bank entries recorded.</td>
                            </tr>
                          ) : (
                            bankSummaryList.map((item, idx) => (
                              <tr key={item.id + idx} className="border-b border-slate-300">
                                <td className="p-1.5 border-r border-black text-center font-mono">{idx + 1}</td>
                                <td className="p-1.5 border-r border-black text-center font-mono">{formatDateDDMMYY(item.date)}</td>
                                <td className="p-1.5 border-r border-black font-bold font-mono text-xs">
                                  {item.shortTag || getBankAndAccountShortTag(item.bankName, item.accountName)}
                                </td>
                                <td className="p-1.5 text-right font-mono font-bold">{formatAmount(item.amount)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-black font-black bg-slate-100">
                            <td colSpan={3} className="p-1.5 text-right uppercase border-r border-black">Total=</td>
                            <td className="p-1.5 text-right font-mono font-black">{formatAmount(totalBankSummarySum)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Table B: Cash Received */}
                    <div className="mt-6 pt-4 border-t border-slate-300">
                      <div className="text-center mb-2.5">
                        <h2 className="text-base font-black text-black tracking-tight font-serif uppercase">
                          {effectiveBankCashCenterName}
                        </h2>
                        <div className="text-xs font-bold text-black font-mono mt-0.5">
                          Date: {formatDateDDMMYY(startDate)} to {formatDateDDMMYY(endDate)}
                        </div>
                        <div className="text-xs font-extrabold text-black uppercase tracking-wider mt-1 border-b border-black inline-block px-3 py-0.5">
                          Cash Received
                        </div>
                      </div>
                      <table className="bank-report-table w-full text-xs text-black border-collapse border border-black">
                        <thead>
                          <tr className="border-b border-black bg-slate-50 font-bold uppercase text-[11px]">
                            <th className="p-1.5 border-r border-black text-center w-12">SL</th>
                            <th
                              onClick={toggleCashReceivedDateSort}
                              className="p-1.5 border-r border-black text-center w-24 cursor-pointer select-none hover:bg-slate-200 transition-colors"
                              title="Click to toggle Date ascending or descending"
                            >
                              <div className="flex items-center justify-center gap-1">
                                <span>Date</span>
                                <span className="text-black font-black text-[10px] font-mono">
                                  {cashReceivedDateSortDir === 'asc' ? '▲' : '▼'}
                                </span>
                              </div>
                            </th>
                            <th className="p-1.5 border-r border-black text-left">Party Name</th>
                            <th className="p-1.5 border-r border-black text-left">Address</th>
                            <th className="p-1.5 text-right w-32">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedCashReceivedList.length === 0 && extraCashRows.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-3 text-center text-slate-500 italic">No cash entries recorded.</td>
                            </tr>
                          ) : (
                            <>
                              {sortedCashReceivedList.map((item, idx) => (
                                <tr key={item.id + idx} className="border-b border-slate-300">
                                  <td className="p-1.5 border-r border-black text-center font-mono">{idx + 1}</td>
                                  <td className="p-1.5 border-r border-black text-center font-mono">{formatDateDDMMYY(item.date)}</td>
                                  <td className="p-1.5 border-r border-black font-bold">{item.partyName}</td>
                                  <td className="p-1.5 border-r border-black">{(item as any).address || getPartyAddress(item.partyName) || '-'}</td>
                                  <td className="p-1.5 text-right font-mono font-bold">{formatAmount(item.amount)}</td>
                                </tr>
                              ))}
                              {extraCashRows.map((ext, idx) => (
                                <tr key={ext.id} className="border-b border-slate-300">
                                  <td className="p-1.5 border-r border-black text-center font-mono">{sortedCashReceivedList.length + idx + 1}</td>
                                  <td className="p-1.5 border-r border-black text-center font-mono">{ext.date}</td>
                                  <td className="p-1.5 border-r border-black font-bold">{ext.partyName}</td>
                                  <td className="p-1.5 border-r border-black">{ext.address}</td>
                                  <td className="p-1.5 text-right font-mono font-bold">{ext.amount}</td>
                                </tr>
                              ))}
                            </>
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-black font-black bg-slate-100">
                            <td colSpan={4} className="p-1.5 text-right uppercase border-r border-black">Total=</td>
                            <td className="p-1.5 text-right font-mono font-black">{formatAmount(totalCashReceivedSum)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Grand Office Summary Box */}
                    <div className="border border-black p-3 bg-slate-50 rounded-sm flex justify-between items-center text-xs font-bold">
                      <span>Total Bank Deposits: ৳{formatAmount(totalBankSummarySum)}</span>
                      <span>Total Cash Received: ৳{formatAmount(totalCashReceivedSum)}</span>
                      <span className="font-black text-sm">Combined Collection: ৳{formatAmount(totalBankSummarySum + totalCashReceivedSum)}</span>
                    </div>
                  </div>
                )}

                {/* 3. PARTY BANK DETAILS PREVIEW TABLE */}
                {activeReportTab === 'party_bank_details' && (
                  <div>
                    <table className="bank-report-table w-full text-xs text-black border-collapse border border-black">
                      <thead>
                        <tr className="border-b border-black bg-slate-50 font-bold uppercase text-[11px]">
                          <th className="p-1.5 border-r border-black text-center w-10">SL</th>
                          <th className="p-1.5 border-r border-black text-center w-20">Date</th>
                          <th className="p-1.5 border-r border-black text-left w-28">Bank Name</th>
                          <th className="p-1.5 border-r border-black text-left">Party Name</th>
                          <th className="p-1.5 border-r border-black text-left w-28">Address</th>
                          <th className="p-1.5 text-right w-28">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailedBankCollectionList.length === 0 && extraBankRows.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-4 text-center text-slate-500 italic">No detailed bank deposit entries found.</td>
                          </tr>
                        ) : (
                          <>
                            {detailedBankCollectionList.map((item, idx) => (
                              <tr key={item.id + idx} className="border-b border-slate-300">
                                <td className="p-1.5 border-r border-black text-center font-mono">{idx + 1}</td>
                                <td className="p-1.5 border-r border-black text-center font-mono">{formatDateDDMMYY(item.date)}</td>
                                <td className="p-1.5 border-r border-black font-bold font-mono">{item.shortTag || getBankAndAccountShortTag(item.bankName, item.accountName)}</td>
                                <td className="p-1.5 border-r border-black font-semibold">{item.partyName}</td>
                                <td className="p-1.5 border-r border-black">{item.address}</td>
                                <td className="p-1.5 text-right font-bold font-mono">{formatAmount(item.amount)}</td>
                              </tr>
                            ))}
                            {extraBankRows.map((ext, idx) => (
                              <tr key={ext.id} className="border-b border-slate-300">
                                <td className="p-1.5 border-r border-black text-center font-mono">{detailedBankCollectionList.length + idx + 1}</td>
                                <td className="p-1.5 border-r border-black text-center font-mono">{ext.date}</td>
                                <td className="p-1.5 border-r border-black font-bold font-mono"><BankLogoBadge bankName={ext.bankName} size="sm" /></td>
                                <td className="p-1.5 border-r border-black font-semibold">{ext.partyName}</td>
                                <td className="p-1.5 border-r border-black">{ext.address}</td>
                                <td className="p-1.5 text-right font-bold font-mono">{ext.amount}</td>
                              </tr>
                            ))}
                          </>
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-black font-black bg-slate-100">
                          <td colSpan={5} className="p-1.5 text-right uppercase text-xs border-r border-black">Total=</td>
                          <td className="p-1.5 text-right text-xs font-mono font-black">{formatAmount(totalDetailedBankSum)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {/* 4. BILL-WISE SALES PREVIEW TABLE */}
                {activeReportTab === 'bill_wise_sales' && (
                  <div>
                    <table className="w-full text-xs text-black border-collapse border border-black">
                      <thead>
                        <tr className="border-b border-black bg-slate-50 font-bold uppercase text-[10px]">
                          <th className="p-1.5 border-r border-black text-center w-10">SL</th>
                          <th className="p-1.5 border-r border-black text-center w-20">Date</th>
                          <th className="p-1.5 border-r border-black text-center w-20">Bill No</th>
                          <th className="p-1.5 border-r border-black text-left">Party Name</th>
                          <th className="p-1.5 border-r border-black text-left w-24">Address</th>
                          <th className="p-1.5 border-r border-black text-left w-24">Channel / Rep</th>
                          <th className="p-1.5 border-r border-black text-right w-24">Bill Amount</th>
                          <th className="p-1.5 border-r border-black text-right w-24">Collection</th>
                          <th className="p-1.5 text-right w-24">Balance Due</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBills.map((bill, idx) => {
                          const billVal = bill.grandTotal || 0;
                          const pName = bill.header?.partyName || '';
                          const party = parties.find((p) => p.name?.trim().toLowerCase() === pName.trim().toLowerCase());
                          const spName = bill.header?.salespersonName || party?.salespersonName || party?.salesmanCode || 'Sales Center / Counter';
                          const partyColSum = collections
                            .filter((c) => !isYearEndSettlementCollection(c) && c.partyName?.trim().toLowerCase() === pName.trim().toLowerCase())
                            .reduce((s, c) => s + c.amount, 0);
                          const dueVal = Math.max(0, billVal - partyColSum);
                          const matchedStoredBill = storedBills.find(b => b.id === bill.id || (b.header?.billNo && bill.header?.billNo && b.header.billNo.trim() === bill.header.billNo.trim()));

                          return (
                            <tr key={bill.id} className="border-b border-slate-300 hover:bg-amber-50/40 transition-colors">
                              <td className="p-1.5 border-r border-black text-center font-mono">{idx + 1}</td>
                              <td className="p-1.5 border-r border-black text-center font-mono">{formatDateDDMMYY(bill.header?.date)}</td>
                              <td className="p-1.5 border-r border-black text-center font-mono font-bold">
                                <button
                                  type="button"
                                  onClick={() => setPreviewBill(matchedStoredBill || bill)}
                                  className="text-blue-700 hover:text-blue-900 underline font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                                  title="Click to view stored bill document"
                                >
                                  <span>{bill.header?.billNo || 'N/A'}</span>
                                  <Eye className="w-3 h-3 text-blue-600 inline" />
                                </button>
                              </td>
                              <td className="p-1.5 border-r border-black font-bold">{pName}</td>
                              <td className="p-1.5 border-r border-black">{bill.header?.address || party?.address || getPartyAddress(pName)}</td>
                              <td className="p-1.5 border-r border-black">{spName}</td>
                              <td className="p-1.5 border-r border-black text-right font-mono font-bold">৳{formatAmount(billVal)}</td>
                              <td className="p-1.5 border-r border-black text-right font-mono font-bold">৳{formatAmount(partyColSum)}</td>
                              <td className="p-1.5 text-right font-mono font-black">৳{formatAmount(dueVal)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-black font-black bg-slate-100">
                          <td colSpan={6} className="p-1.5 text-right uppercase border-r border-black">Total=</td>
                          <td className="p-1.5 text-right font-mono font-bold border-r border-black">৳{formatAmount(totalSalesVal)}</td>
                          <td className="p-1.5 text-right font-mono font-bold border-r border-black">৳{formatAmount(totalCashReceivedSum + totalBankCollectionsSum)}</td>
                          <td className="p-1.5 text-right font-mono font-black">৳{formatAmount(Math.max(0, totalSalesVal - (totalCashReceivedSum + totalBankCollectionsSum)))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {/* Signatures Block */}
                <div className="grid grid-cols-3 gap-8 pt-16 text-center text-xs font-bold text-black border-t border-slate-300 mt-8">
                  <div className="border-t border-black pt-1">Prepared By</div>
                  <div className="border-t border-black pt-1">Checked By / Accountant</div>
                  <div className="border-t border-black pt-1">In-Charge / Authorized Signature</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* YEARLY CLOSING MODAL */}
      {showClosingModal && (
        <YearlyClosingModal
          isOpen={showClosingModal}
          defaultTab={closingModalDefaultTab}
          selectedParty={activeClosingParty || singleSelectedParty}
          storedBills={storedBills}
          collections={collections}
          deliveryChallans={effectiveDeliveryChallans}
          parties={parties}
          salespersons={visibleSalespersons}
          company={company}
          currentUser={currentUser}
          financialYearClosings={financialYearClosings}
          onSaveClosing={(closing, updatedParties) => {
            if (onSaveClosing) {
              onSaveClosing(closing, updatedParties);
            }
            setShowClosingModal(false);
            setActiveClosingParty(null);
          }}
          onReopenClosing={(closingId) => {
            if (onReopenClosing) {
              onReopenClosing(closingId);
            }
          }}
          onDeleteClosing={(closingId) => {
            if (onDeleteClosing) {
              onDeleteClosing(closingId);
            }
          }}
          onUpdateClosing={(updated) => {
            if (onUpdateClosing) {
              onUpdateClosing(updated);
            }
          }}
          onClose={() => {
            setShowClosingModal(false);
            setActiveClosingParty(null);
          }}
        />
      )}

      {/* STORED BILL PREVIEW MODAL */}
      {previewBill && (
        <BillPrintPreviewModal
          isOpen={Boolean(previewBill)}
          onClose={() => setPreviewBill(null)}
          branches={branches}
          bill={previewBill}
        />
      )}

      {/* EDIT COLLECTION MODAL */}
      {editingCollection && (
        <EditCollectionMrModalDialog
          collection={editingCollection}
          parties={parties}
          salespersons={salespersons}
          bankList={bankList}
          branches={branches}
          onSave={handleSaveEditedCollection}
          onDelete={handleDeleteEditedCollection}
          onClose={() => setEditingCollection(null)}
        />
      )}
    </div>
  );
};
