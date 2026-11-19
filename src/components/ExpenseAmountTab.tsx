import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { 
  Building2, 
  Calendar, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  Printer, 
  Download, 
  Search, 
  FileText, 
  Wallet, 
  Banknote, 
  ArrowUpRight, 
  ShieldCheck, 
  Send,
  Filter,
  Receipt,
  Landmark,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Plus,
  User,
  Users,
  AlertCircle,
  X,
  Trash2,
  TrendingDown,
  Layers,
  ChevronDown,
  ChevronRight,
  Zap,
  Wifi,
  Home
} from 'lucide-react';
import { ExpenseEntry, CollectionMR, BankDeposit, BranchLocation, CompanyDetails, AuthUser, Party, Salesperson } from '../types';
import { formatDateDDMMYY, parseDateToISO } from '../utils/dateUtils';
import { triggerAutoConfiguredPrint } from '../utils/printerAutoConfig';
import { isSuperAdminOrAgm, isStrictSuperAdmin, isAccountsAdmin, isAnyAdmin, filterBranchesForUser, getUserBranch } from '../utils/branchAccess';
import { recordDeletedEntityId, getGlobalDeletedIds } from '../utils/deletedTracker';
import { SalesCenterSearchFilter } from './SalesCenterSearchFilter';
import { DateInputWithPicker } from './DateInputWithPicker';
import { computeNextSalesCenterMrNo } from '../utils/mrNumberHelper';

interface ExpenseAmountTabProps {
  expenses: ExpenseEntry[];
  collections: CollectionMR[];
  bankDeposits: BankDeposit[];
  branches?: BranchLocation[];
  company?: CompanyDetails;
  currentUser?: AuthUser | null;
  parties?: Party[];
  setParties?: React.Dispatch<React.SetStateAction<Party[]>>;
  setCollections?: React.Dispatch<React.SetStateAction<CollectionMR[]>>;
  setBankDeposits?: React.Dispatch<React.SetStateAction<BankDeposit[]>>;
  allSalespersons?: Salesperson[];
  onNavigateEntry?: () => void;
  onBack?: () => void;
  onSyncCloud?: (patch: any, broadcast?: boolean) => any;
}

export interface MonthlyAdjustmentRecord {
  monthKey: string;
  partyName: string;
  collectionDate: string;
  collectionAmount: number;
  mrNo?: string;
  remarks?: string;
  salesCenter?: string;
  marketingPerson?: string;
  depositId?: string;
  collectionId?: string;
}

interface MonthSummary {
  monthKey: string; // YYYY-MM
  monthDisplay: string; // Month Year e.g. "November 2026"
  nextMonth01: string; // DD.MM.YYYY e.g. "01.12.2026"
  isMonthEnded: boolean;
  totalExpenses: number;
  staffExpenses: number;
  utilityExpenses: number;
  isAdjusted: boolean;
  adjustedPartyName?: string;
  adjustedCollectionDate?: string;
  adjustedCollectionAmount: number;
  netRemaining: number;
  hoAutoDepositAmount: number;
  hoAutoDepositDate: string;
  hoDepositStatus: 'deposited' | 'scheduled';
  expenseItems: ExpenseEntry[];
}

export const ExpenseAmountTab: React.FC<ExpenseAmountTabProps> = ({
  expenses = [],
  collections = [],
  bankDeposits = [],
  branches = [],
  company,
  currentUser,
  parties = [],
  setParties,
  setCollections,
  setBankDeposits,
  allSalespersons = [],
  onNavigateEntry,
  onBack,
  onSyncCloud
}) => {
  const isSuper = isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser) || isSuperAdminOrAgm(currentUser) || isAnyAdmin(currentUser);
  const allowedBranches = useMemo(
    () => filterBranchesForUser(branches, currentUser, allSalespersons),
    [branches, currentUser, allSalespersons]
  );
  const canViewAllCenters = isSuper || allowedBranches.length > 1;
  const userBranchInfo = getUserBranch(currentUser, allSalespersons, branches);
  
  const [selectedEntity, setSelectedEntity] = useState<string>(() => {
    if (canViewAllCenters) return 'all';
    return allowedBranches[0]?.name || userBranchInfo?.branchName || 'Madhupur Sales Center';
  });
  
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'all' | 'sales_centers' | 'categories' | 'settlement'>('all');

  // Monthly Expense Adjustments with Party Collection state
  const [monthlyAdjustments, setMonthlyAdjustments] = useState<Record<string, MonthlyAdjustmentRecord>>(() => {
    try {
      const raw = localStorage.getItem('polycables_monthly_expense_adjustments');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Modal State for adjusting party collection
  const [isPartyEntryModalOpen, setIsPartyEntryModalOpen] = useState<boolean>(false);
  const [targetMonthForAdjustment, setTargetMonthForAdjustment] = useState<string | null>(null);
  const [targetMonthExpenseTotal, setTargetMonthExpenseTotal] = useState<number>(0);
  const [entryPartyName, setEntryPartyName] = useState<string>('');
  const [partySearchQuery, setPartySearchQuery] = useState<string>('');
  const [isPartySearchOpen, setIsPartySearchOpen] = useState<boolean>(false);
  const [entryCollectionDate, setEntryCollectionDate] = useState<string>(() => formatDateDDMMYY(new Date()));
  const [entryAmount, setEntryAmount] = useState<string>('');
  const [entrySalesCenter, setEntrySalesCenter] = useState<string>(() => allowedBranches[0]?.name || userBranchInfo?.branchName || 'Madhupur Sales Center');
  const [entryMarketingPerson, setEntryMarketingPerson] = useState<string>(() => currentUser?.name || allSalespersons[0]?.name || '');
  const [entryAddress, setEntryAddress] = useState<string>('Madhupur');
  const [entryMrNo, setEntryMrNo] = useState<string>('');
  const [entryRemarks, setEntryRemarks] = useState<string>('');

  const lastExpenseTabUserKeyRef = useRef<string>('');
  useEffect(() => {
    const userKey = `${currentUser?.username || ''}::${currentUser?.salespersonCode || ''}::${currentUser?.branchId || ''}::${currentUser?.role || ''}`;
    const userChanged = lastExpenseTabUserKeyRef.current !== '' && lastExpenseTabUserKeyRef.current !== userKey;
    lastExpenseTabUserKeyRef.current = userKey;

    const preferredCenter = allowedBranches[0]?.name || userBranchInfo?.branchName || '';
    if (!canViewAllCenters && preferredCenter) {
      setSelectedEntity(preferredCenter);
      setEntrySalesCenter(preferredCenter);
    } else if (userChanged) {
      setSelectedEntity(isSuper ? 'all' : (userBranchInfo?.branchName && userBranchInfo.branchId !== 'all' ? userBranchInfo.branchName : 'all'));
      if (preferredCenter) setEntrySalesCenter(preferredCenter);
    }
  }, [currentUser, isSuper, canViewAllCenters, allowedBranches, userBranchInfo?.branchName, userBranchInfo?.branchId]);
  const [partyEntryError, setPartyEntryError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Date Range filter states
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [appliedFromDate, setAppliedFromDate] = useState<string>('');
  const [appliedToDate, setAppliedToDate] = useState<string>('');

  const fromDateInputRef = useRef<HTMLInputElement | null>(null);
  const toDateInputRef = useRef<HTMLInputElement | null>(null);

  // Keyboard navigation: Backspace goes back
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Backspace') {
        const active = document.activeElement;
        const isInput =
          active &&
          (active.tagName === 'INPUT' ||
            active.tagName === 'TEXTAREA' ||
            active.tagName === 'SELECT' ||
            (active as HTMLElement).isContentEditable);

        if (!isInput) {
          e.preventDefault();
          if (onBack) {
            onBack();
          } else if (onNavigateEntry) {
            onNavigateEntry();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack, onNavigateEntry]);

  const handleApplyDateFilter = () => {
    setAppliedFromDate(fromDate);
    setAppliedToDate(toDate);
  };

  const handleResetDateFilter = () => {
    setFromDate('');
    setToDate('');
    setAppliedFromDate('');
    setAppliedToDate('');
    if (fromDateInputRef.current) {
      fromDateInputRef.current.focus();
    }
  };

  // Helper to extract utility month name from input date if rent/internet/electricity
  const getAutoMonthName = (dateStr?: string, existingMonth?: string) => {
    if (existingMonth && existingMonth.trim()) return existingMonth.trim();
    if (!dateStr) return '';
    try {
      const iso = parseDateToISO(dateStr) || dateStr;
      const d = new Date(iso);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      }
    } catch {}
    return '';
  };

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (selectedEntity !== 'all') {
        const entity = (e.entityName || e.salesCenter || '').toLowerCase();
        if (!entity.includes(selectedEntity.toLowerCase())) return false;
      }
      if (appliedFromDate || appliedToDate) {
        const iso = parseDateToISO(e.date) || e.date;
        if (appliedFromDate && iso < appliedFromDate) return false;
        if (appliedToDate && iso > appliedToDate) return false;
      }
      return true;
    });
  }, [expenses, selectedEntity, appliedFromDate, appliedToDate]);

  // Month Summaries
  const monthSummaries = useMemo<MonthSummary[]>(() => {
    const today = new Date();
    const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    const monthsSet = new Set<string>();
    filteredExpenses.forEach((e) => {
      if (e.date) {
        const iso = parseDateToISO(e.date) || e.date;
        if (iso && iso.length >= 7) monthsSet.add(iso.substring(0, 7));
      }
    });
    Object.keys(monthlyAdjustments).forEach((mKey) => {
      if (mKey && mKey.length >= 7) monthsSet.add(mKey.substring(0, 7));
    });

    if (monthsSet.size === 0) {
      monthsSet.add(currentMonthStr);
    }

    const sortedMonths = Array.from(monthsSet).sort().reverse();

    return sortedMonths.map((monthKey) => {
      const [yStr, mStr] = monthKey.split('-');
      const y = parseInt(yStr, 10);
      const m = parseInt(mStr, 10);

      const monthDateObj = new Date(y, m - 1, 1);
      const monthDisplay = monthDateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' });

      let nextYear = y;
      let nextMonth = m + 1;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
      }
      const nextMonth01 = `01.${String(nextMonth).padStart(2, '0')}.${String(nextYear).slice(-2)}`;
      const isMonthEnded = monthKey < currentMonthStr;

      const monthExps = filteredExpenses.filter((e) => {
        const iso = parseDateToISO(e.date) || e.date;
        return iso && iso.startsWith(monthKey);
      });

      const totalExpenses = monthExps.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      
      // Staff expenses: salary, conveyance, lunch/food
      const staffExpenses = monthExps.filter(e => {
        const h = (e.expenseHead || '').toLowerCase();
        return h.includes('staff') || h.includes('salary') || h.includes('conveyance') || h.includes('lunch') || h.includes('hotel') || Boolean(e.staffName);
      }).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

      // Utility expenses: rent, internet, electricity
      const utilityExpenses = monthExps.filter(e => {
        const h = (e.expenseHead || '').toLowerCase();
        return h.includes('rent') || h.includes('internet') || h.includes('wifi') || h.includes('electric') || h.includes('bill');
      }).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

      const savedAdj = monthlyAdjustments[monthKey];
      let isAdjusted = false;
      let adjustedPartyName: string | undefined;
      let adjustedCollectionDate: string | undefined;
      let adjustedCollectionAmount = 0;

      if (savedAdj && savedAdj.partyName && savedAdj.partyName.trim()) {
        isAdjusted = true;
        adjustedPartyName = savedAdj.partyName.trim();
        adjustedCollectionDate = savedAdj.collectionDate;
        adjustedCollectionAmount = Number(savedAdj.collectionAmount) || 0;
      }

      const hasExpenseLevelParty = monthExps.some(
        (e) =>
          e.fundingPartyName &&
          e.fundingPartyName.trim() !== '' &&
          e.fundingPartyName.trim() !== 'Head Office (Sales Center Monthly Expenses)'
      );
      const hasPartyEntered = Boolean((isAdjusted && adjustedPartyName) || hasExpenseLevelParty);

      const netRemaining = adjustedCollectionAmount - totalExpenses;
      const hoAutoDepositAmount = hasPartyEntered ? totalExpenses : 0;
      const hoDepositStatus = hasPartyEntered ? (isMonthEnded ? 'deposited' : 'scheduled') : 'scheduled';

      return {
        monthKey,
        monthDisplay,
        nextMonth01,
        isMonthEnded,
        totalExpenses,
        staffExpenses,
        utilityExpenses,
        isAdjusted,
        adjustedPartyName,
        adjustedCollectionDate,
        adjustedCollectionAmount,
        netRemaining,
        hoAutoDepositAmount,
        hoAutoDepositDate: hasPartyEntered ? nextMonth01 : '-',
        hoDepositStatus,
        expenseItems: monthExps
      };
    });
  }, [filteredExpenses, monthlyAdjustments]);

  // Active month summaries based on month selector
  const activeMonthSummaries = useMemo(() => {
    if (selectedMonth === 'all') return monthSummaries;
    return monthSummaries.filter((m) => m.monthKey === selectedMonth);
  }, [monthSummaries, selectedMonth]);

  // Aggregate totals
  const aggregateTotals = useMemo(() => {
    const totalExp = activeMonthSummaries.reduce((sum, m) => sum + m.totalExpenses, 0);
    const totalStaff = activeMonthSummaries.reduce((sum, m) => sum + m.staffExpenses, 0);
    const totalUtility = activeMonthSummaries.reduce((sum, m) => sum + m.utilityExpenses, 0);
    const totalPartyCol = activeMonthSummaries.reduce((sum, m) => sum + (m.isAdjusted ? m.adjustedCollectionAmount : 0), 0);
    const totalNet = totalPartyCol - totalExp;
    const totalAutoHo = activeMonthSummaries.reduce((sum, m) => sum + m.hoAutoDepositAmount, 0);
    return { totalExp, totalStaff, totalUtility, totalPartyCol, totalNet, totalAutoHo };
  }, [activeMonthSummaries]);

  // Detailed expense items
  const visibleExpenseRows = useMemo(() => {
    const allItems: { item: ExpenseEntry; monthDisplay: string; nextMonth01: string }[] = [];
    activeMonthSummaries.forEach((m) => {
      m.expenseItems.forEach((exp) => {
        allItems.push({
          item: exp,
          monthDisplay: m.monthDisplay,
          nextMonth01: m.nextMonth01
        });
      });
    });

    if (!searchTerm.trim()) return allItems;
    const lower = searchTerm.toLowerCase();
    return allItems.filter(({ item }) => {
      return (
        (item.expenseHead || '').toLowerCase().includes(lower) ||
        (item.remarks || '').toLowerCase().includes(lower) ||
        (item.entityName || '').toLowerCase().includes(lower) ||
        (item.salesCenter || '').toLowerCase().includes(lower) ||
        (item.area || '').toLowerCase().includes(lower) ||
        (item.staffName || '').toLowerCase().includes(lower) ||
        (item.marketingPerson || '').toLowerCase().includes(lower) ||
        (item.date || '').includes(lower)
      );
    });
  }, [activeMonthSummaries, searchTerm]);

  // Grouped by Sales Center
  const salesCenterGroups = useMemo(() => {
    const map = new Map<string, { total: number; staffTotal: number; utilityTotal: number; items: ExpenseEntry[] }>();
    
    visibleExpenseRows.forEach(({ item }) => {
      const center = (item.salesCenter || item.entityName || 'General Sales Center').trim();
      if (!map.has(center)) {
        map.set(center, { total: 0, staffTotal: 0, utilityTotal: 0, items: [] });
      }
      const g = map.get(center)!;
      const amt = Number(item.amount) || 0;
      g.total += amt;
      const h = (item.expenseHead || '').toLowerCase();
      if (h.includes('staff') || h.includes('salary') || h.includes('conveyance') || h.includes('lunch') || h.includes('hotel') || Boolean(item.staffName)) {
        g.staffTotal += amt;
      }
      if (h.includes('rent') || h.includes('internet') || h.includes('wifi') || h.includes('electric') || h.includes('bill')) {
        g.utilityTotal += amt;
      }
      g.items.push(item);
    });

    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [visibleExpenseRows]);

  // Grouped by Category Head
  const categoryGroups = useMemo(() => {
    const map = new Map<string, { total: number; count: number; items: ExpenseEntry[] }>();
    visibleExpenseRows.forEach(({ item }) => {
      const cat = (item.expenseHead || 'Other Expenses').trim();
      if (!map.has(cat)) {
        map.set(cat, { total: 0, count: 0, items: [] });
      }
      const g = map.get(cat)!;
      g.total += (Number(item.amount) || 0);
      g.count += 1;
      g.items.push(item);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [visibleExpenseRows]);

  // Parties search
  const filteredPartiesForSearch = useMemo(() => {
    if (!partySearchQuery.trim()) return parties.slice(0, 30);
    const q = partySearchQuery.toLowerCase().trim();
    return parties
      .filter((p) => {
        return (
          (p.name || '').toLowerCase().includes(q) ||
          (p.address || '').toLowerCase().includes(q) ||
          (p.salespersonName || '').toLowerCase().includes(q) ||
          (p.salesmanCode || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 30);
  }, [parties, partySearchQuery]);

  // Open adjustment modal
  const handleOpenPartyEntryModal = (
    targetMonth?: string,
    monthExp?: number,
    existing?: { partyName: string; collectionDate: string; collectionAmount: number; remarks?: string }
  ) => {
    setPartyEntryError(null);
    setIsPartySearchOpen(false);
    const effectiveMonth = targetMonth || (activeMonthSummaries[0]?.monthKey || new Date().toISOString().slice(0, 7));
    setTargetMonthForAdjustment(effectiveMonth);
    const expTotal = monthExp !== undefined ? monthExp : (activeMonthSummaries.find((m) => m.monthKey === effectiveMonth)?.totalExpenses || 0);
    setTargetMonthExpenseTotal(expTotal);

    const [y, m] = effectiveMonth.split('-');
    const mObj = new Date(parseInt(y), parseInt(m) - 1, 1);
    const mDisp = mObj.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    if (existing) {
      setEntryPartyName(existing.partyName || '');
      setPartySearchQuery(existing.partyName || '');
      setEntryCollectionDate(formatDateDDMMYY(existing.collectionDate) || formatDateDDMMYY(new Date()));
      setEntryAmount(String(existing.collectionAmount || expTotal || ''));
      setEntryRemarks(existing.remarks || `Monthly expense adjustment for ${mDisp}`);
    } else {
      let initialDateIso = new Date().toISOString().slice(0, 10);
      if (/^\d{4}-\d{2}$/.test(effectiveMonth)) {
        const todayIso = new Date().toISOString().slice(0, 10);
        if (todayIso.startsWith(effectiveMonth)) {
          initialDateIso = todayIso;
        } else {
          initialDateIso = `${effectiveMonth}-15`;
        }
      }
      setEntryCollectionDate(formatDateDDMMYY(initialDateIso));
      setEntryPartyName('');
      setPartySearchQuery('');
      setEntryAmount(expTotal > 0 ? String(expTotal) : '');
      setEntryRemarks(`Monthly expense adjustment for ${mDisp}`);
    }

    const initialPartyName = existing?.partyName || monthlyAdjustments[effectiveMonth]?.partyName || '';
    const matchedParty = initialPartyName ? parties.find((p) => p.name.trim().toLowerCase() === initialPartyName.trim().toLowerCase()) : undefined;
    const initialMarketingPerson = monthlyAdjustments[effectiveMonth]?.marketingPerson || matchedParty?.salespersonName || (matchedParty?.salesmanCode ? allSalespersons.find((s) => s.code.toLowerCase() === matchedParty.salesmanCode?.toLowerCase())?.name : undefined) || allSalespersons[0]?.name || 'Sonjoy Chowhan';
    const initialAddress = matchedParty?.address || 'Madhupur';
    const initialSalesCenter = monthlyAdjustments[effectiveMonth]?.salesCenter || matchedParty?.branchName || (selectedEntity !== 'all' ? selectedEntity : (branches[0]?.name || 'Madhupur Sales Center'));

    setEntryAddress(initialAddress);
    setEntryMarketingPerson(initialMarketingPerson);
    setEntrySalesCenter(initialSalesCenter);
    const nextAutoMr = computeNextSalesCenterMrNo(
      collections,
      initialSalesCenter,
      branches,
      parties,
      allSalespersons
    );
    setEntryMrNo(monthlyAdjustments[effectiveMonth]?.mrNo || nextAutoMr);
    setIsPartyEntryModalOpen(true);
  };

  const handlePartySelectChange = (pName: string) => {
    setEntryPartyName(pName);
    setPartySearchQuery(pName);
    const matched = parties.find((p) => p.name.trim().toLowerCase() === pName.trim().toLowerCase());
    if (matched) {
      if (matched.address) setEntryAddress(matched.address);
      if (matched.salespersonName) {
        setEntryMarketingPerson(matched.salespersonName);
      } else if (matched.salesmanCode) {
        const sp = allSalespersons.find((s) => s.code.toLowerCase() === matched.salesmanCode?.toLowerCase());
        if (sp) setEntryMarketingPerson(sp.name);
      }
      if (matched.branchName) {
        setEntrySalesCenter(matched.branchName);
        setEntryMrNo(
          computeNextSalesCenterMrNo(
            collections,
            matched.branchName,
            branches,
            parties,
            allSalespersons
          )
        );
      }
    }
  };

  const handleSavePartyEntry = (e: React.FormEvent) => {
    e.preventDefault();
    setPartyEntryError(null);

    const pName = entryPartyName.trim();
    if (!pName) {
      setPartyEntryError('Please select or enter a party name.');
      return;
    }
    const numAmt = parseFloat(entryAmount);
    if (isNaN(numAmt) || numAmt <= 0) {
      setPartyEntryError('Please enter a valid collection amount in ৳.');
      return;
    }
    const trimmedColDate = entryCollectionDate.trim();
    if (!trimmedColDate) {
      setPartyEntryError('Please provide a valid collection date in dd.mm.yy format.');
      return;
    }
    const parsedColIso = parseDateToISO(trimmedColDate) || trimmedColDate;
    const formattedColDate = formatDateDDMMYY(trimmedColDate);

    const targetMonth = targetMonthForAdjustment || (parsedColIso && parsedColIso.length >= 7 ? parsedColIso.slice(0, 7) : new Date().toISOString().slice(0, 7));

    const [tY, tM] = targetMonth.split('-').map((v) => parseInt(v, 10));
    let nextYear = tY || new Date().getFullYear();
    let nextMonth = (tM || (new Date().getMonth() + 1)) + 1;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    const nextMonthStr = String(nextMonth).padStart(2, '0');
    const nextMonth01Iso = `${nextYear}-${nextMonthStr}-01`;
    const nextMonth01Ddmmyy = `01.${nextMonthStr}.${String(nextYear).slice(-2)}`;

    const matchedParty = parties.find((p) => p.name.trim().toLowerCase() === pName.toLowerCase());
    const resolvedSpName = entryMarketingPerson.trim() || matchedParty?.salespersonName || (matchedParty?.salesmanCode ? allSalespersons.find((s) => s.code.toLowerCase() === matchedParty.salesmanCode?.toLowerCase())?.name : '') || allSalespersons[0]?.name || 'Sonjoy Chowhan';
    const resolvedSpCode = matchedParty?.salesmanCode || allSalespersons.find((s) => s.name.toLowerCase() === resolvedSpName.toLowerCase())?.code || '';

    const prevAdj = monthlyAdjustments[targetMonth];
    const newColId = prevAdj?.collectionId || `col-adj-${targetMonth}`;
    const newDepId = prevAdj?.depositId || `dep-adj-${targetMonth}`;

    const resolvedMrNo =
      entryMrNo.trim() ||
      computeNextSalesCenterMrNo(
        collections,
        entrySalesCenter.trim(),
        branches,
        parties,
        allSalespersons
      );

    const updatedAdjustment: MonthlyAdjustmentRecord = {
      monthKey: targetMonth,
      partyName: pName,
      collectionDate: formattedColDate,
      collectionAmount: numAmt,
      mrNo: resolvedMrNo,
      remarks: entryRemarks.trim() || `Monthly expense adjustment for ${targetMonth}`,
      salesCenter: entrySalesCenter.trim(),
      marketingPerson: resolvedSpName,
      depositId: newDepId,
      collectionId: newColId
    };

    const nextAdjustments = {
      ...monthlyAdjustments,
      [targetMonth]: updatedAdjustment
    };
    setMonthlyAdjustments(nextAdjustments);
    try {
      localStorage.setItem('polycables_monthly_expense_adjustments', JSON.stringify(nextAdjustments));
    } catch {}

    const newCollection: CollectionMR = {
      id: newColId,
      mrNo: resolvedMrNo,
      date: nextMonth01Iso,
      partyName: pName,
      customerAddress: entryAddress.trim() || matchedParty?.address || 'Madhupur',
      salespersonName: resolvedSpName,
      marketingPerson: resolvedSpName,
      salesmanCode: resolvedSpCode,
      salesCenter: entrySalesCenter.trim(),
      entityName: resolvedSpName || entrySalesCenter.trim(),
      amount: numAmt,
      paymentType: 'cash',
      isDeposited: true,
      depositDate: nextMonth01Ddmmyy,
      depositBankTag: 'H/O',
      bankName: 'H/O',
      accountName: 'Head Office',
      isMonthlyExpenseAdjusted: true,
      bankDepositId: newDepId,
      remarks: entryRemarks.trim() || `Monthly Expense Adjustment (Transferred to next month cash deposit)`,
      type: 'money_receipt'
    };

    const newDeposit: BankDeposit = {
      id: newDepId,
      date: nextMonth01Iso,
      depositDate: nextMonth01Iso,
      customerName: pName,
      partyName: pName,
      amount: numAmt,
      bankName: 'H/O',
      accountName: 'Head Office',
      displayTag: 'H/O',
      marketingPerson: resolvedSpName,
      entityName: entrySalesCenter.trim() || resolvedSpName,
      branchName: entrySalesCenter.trim(),
      collectionMrId: newColId,
      depositType: 'Cash Deposit',
      remarks: entryRemarks.trim() || `Adjusted Monthly Expense with Party Collection (${targetMonth})`,
      isHoDeposit: true
    };

    let updatedCollectionsList: CollectionMR[] = [];
    if (setCollections) {
      setCollections((prev) => {
        const next = [newCollection, ...prev.filter((c) => c.id !== newColId)];
        updatedCollectionsList = next;
        return next;
      });
    }
    try {
      const existingRaw = localStorage.getItem('polycables_collections');
      const existingList = existingRaw ? JSON.parse(existingRaw) : [];
      const mergedCols = [newCollection, ...existingList.filter((c: any) => c.id !== newColId)];
      localStorage.setItem('polycables_collections', JSON.stringify(mergedCols));
      if (!updatedCollectionsList.length) updatedCollectionsList = mergedCols;
    } catch {}

    let updatedDepositsList: BankDeposit[] = [];
    if (setBankDeposits) {
      setBankDeposits((prev) => {
        const next = [newDeposit, ...prev.filter((d) => d.id !== newDepId)];
        updatedDepositsList = next;
        return next;
      });
    }
    try {
      const existingDepRaw = localStorage.getItem('polycables_bank_deposits');
      const existingDepList = existingDepRaw ? JSON.parse(existingDepRaw) : [];
      const mergedDeps = [newDeposit, ...existingDepList.filter((d: any) => d.id !== newDepId)];
      localStorage.setItem('polycables_bank_deposits', JSON.stringify(mergedDeps));
      if (!updatedDepositsList.length) updatedDepositsList = mergedDeps;
    } catch {}

    if (onSyncCloud) {
      try {
        onSyncCloud({ collections: updatedCollectionsList, bankDeposits: updatedDepositsList }, true);
      } catch {}
    }

    setSuccessToast(`Monthly expense for ${targetMonth} adjusted with "${pName}" collection of ৳${numAmt.toLocaleString('en-IN')}! Scheduled as H/O deposit on ${nextMonth01Ddmmyy}.`);
    setTimeout(() => setSuccessToast(null), 5000);
    setIsPartyEntryModalOpen(false);
  };

  const handleRemoveAdjustment = (monthKey: string) => {
    const removedAdj = monthlyAdjustments[monthKey];
    setMonthlyAdjustments((prev) => {
      const nextAdj = { ...prev };
      delete nextAdj[monthKey];
      try {
        localStorage.setItem('polycables_monthly_expense_adjustments', JSON.stringify(nextAdj));
      } catch {}
      return nextAdj;
    });

    const targetColId = removedAdj?.collectionId || `col-adj-${monthKey}`;
    const targetDepId = removedAdj?.depositId || `dep-adj-${monthKey}`;

    recordDeletedEntityId(targetColId);
    recordDeletedEntityId(targetDepId);
    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [targetColId, targetDepId], type: 'adjustment' })
    }).catch(() => {});

    let nextColsList: CollectionMR[] | undefined;
    if (setCollections) {
      setCollections((prev) => {
        const filtered = prev.filter(
          (c) =>
            c.id !== targetColId &&
            !(c.isMonthlyExpenseAdjusted && c.partyName === removedAdj?.partyName && (c.remarks || '').includes(monthKey))
        );
        nextColsList = filtered;
        try {
          localStorage.setItem('polycables_collections', JSON.stringify(filtered));
        } catch {}
        return filtered;
      });
    }

    let nextDepsList: BankDeposit[] | undefined;
    if (setBankDeposits) {
      setBankDeposits((prev) => {
        const filtered = prev.filter(
          (d) =>
            d.id !== targetDepId &&
            !(d.id.startsWith('dep-adj-') && (d.remarks || '').includes(`(${monthKey})`))
        );
        nextDepsList = filtered;
        try {
          localStorage.setItem('polycables_bank_deposits', JSON.stringify(filtered));
        } catch {}
        return filtered;
      });
    }

    if (onSyncCloud && (nextColsList || nextDepsList)) {
      try {
        onSyncCloud(
          {
            ...(nextColsList ? { collections: nextColsList } : {}),
            ...(nextDepsList ? { bankDeposits: nextDepsList } : {}),
            deletedEntityIds: getGlobalDeletedIds()
          },
          true
        );
      } catch {}
    }

    setSuccessToast(`Adjustment removed for ${monthKey}.`);
    setTimeout(() => setSuccessToast(null), 3500);
  };

  const handleExportExcel = () => {
    const dataRows = visibleExpenseRows.map(({ item, monthDisplay, nextMonth01 }, idx) => {
      const autoMonth = getAutoMonthName(item.date, item.billingMonth);
      return {
        'SL #': idx + 1,
        'Date': formatDateDDMMYY(item.date),
        'Month Period': monthDisplay,
        'Sales Center': item.salesCenter || item.entityName || 'N/A',
        'Expense Head': item.expenseHead || 'N/A',
        'Staff / Person': item.staffName || item.marketingPerson || item.personName || '-',
        'Bill Month': autoMonth || '-',
        'Area': item.area || '-',
        'Amount (Tk)': item.amount,
        'Remarks': item.remarks || ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(dataRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Expenses');
    XLSX.writeFile(wb, `Monthly_Expenses_${selectedMonth || 'All'}.xlsx`);
  };

  const handlePrint = () => {
    triggerAutoConfiguredPrint();
  };

  const isDateFiltered = Boolean(appliedFromDate || appliedToDate);

  return (
    <div id="monthly-expense-redesign-container" className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 cyber-glass-card p-3 sm:p-4 rounded-2xl text-white">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-rose-500/20 text-rose-300 border border-rose-400/30 rounded-xl shadow-xs">
            <Receipt className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-black text-white leading-tight">Monthly Expense Overview</h1>
            <p className="text-[11px] font-semibold text-slate-400">Sales center staff expenses, utility billing, & H/O auto-settlements</p>
          </div>
        </div>
      </div>

      {/* 4 Modern High-Contrast KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Monthly Expenses */}
        <div className="cyber-glass-subcard p-4.5 rounded-2xl border border-rose-400/30 hover:border-rose-400/50 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-rose-200 uppercase tracking-wider">
              1. Total Monthly Expenses
            </span>
            <div className="p-2 bg-rose-500/20 text-rose-300 rounded-xl border border-rose-400/30">
              <Banknote className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white font-mono tracking-tight">
              ৳{aggregateTotals.totalExp.toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] font-bold text-slate-400 mt-1">
              {visibleExpenseRows.length} vouchers recorded across all centers
            </p>
          </div>
        </div>

        {/* Card 2: Sales Center Staff Expenses */}
        <div className="cyber-glass-subcard p-4.5 rounded-2xl border border-cyan-400/30 hover:border-cyan-400/50 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-cyan-200 uppercase tracking-wider">
              2. Staff Salaries & Bills
            </span>
            <div className="p-2 bg-cyan-500/20 text-cyan-300 rounded-xl border border-cyan-400/30">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white font-mono tracking-tight">
              ৳{aggregateTotals.totalStaff.toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] font-bold text-slate-400 mt-1">
              Grouped under individual sales center teams
            </p>
          </div>
        </div>

        {/* Card 3: Utilities & Rent */}
        <div className="cyber-glass-subcard p-4.5 rounded-2xl border border-amber-400/30 hover:border-amber-400/50 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-amber-200 uppercase tracking-wider">
              3. Rent & Utilities
            </span>
            <div className="p-2 bg-amber-500/20 text-amber-300 rounded-xl border border-amber-400/30">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white font-mono tracking-tight">
              ৳{aggregateTotals.totalUtility.toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] font-bold text-slate-400 mt-1">
              Electricity, internet & office rental
            </p>
          </div>
        </div>

        {/* Card 4: Head Office Settlements */}
        <div className="cyber-glass-subcard p-4.5 rounded-2xl border border-emerald-400/40 bg-emerald-950/35 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-emerald-300 uppercase tracking-wider">
              4. H/O Auto-Deposit (01st)
            </span>
            <div className="p-2 bg-emerald-500/20 text-emerald-300 rounded-xl border border-emerald-400/30">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-emerald-300 font-mono tracking-tight">
              ৳{aggregateTotals.totalAutoHo.toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] font-bold text-slate-300 mt-1">
              Adjusted party collections auto-transferred
            </p>
          </div>
        </div>
      </div>

      {/* Filter and View Switcher Toolbar */}
      <div className="cyber-glass-card p-4 rounded-2xl space-y-3 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Navigation View Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#061520] rounded-xl border border-cyan-500/25">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-[#0e2d42] text-cyan-200 border border-cyan-400/60 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All Expenses ({visibleExpenseRows.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sales_centers')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                activeTab === 'sales_centers'
                  ? 'bg-[#0e2d42] text-cyan-200 border border-cyan-400/60 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sales Center Breakdown ({salesCenterGroups.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('categories')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                activeTab === 'categories'
                  ? 'bg-[#0e2d42] text-cyan-200 border border-cyan-400/60 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Category Heads ({categoryGroups.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settlement')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                activeTab === 'settlement'
                  ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/60 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Party Settlements ({monthSummaries.length})
            </button>
          </div>

          {/* Quick Month Selector */}
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-slate-300">Month:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-xs font-bold text-white bg-[#061520] border border-cyan-500/30 rounded-xl px-2.5 py-1.5 focus:ring-2 focus:ring-cyan-400"
            >
              <option value="all">All Available Months</option>
              {monthSummaries.map((m) => (
                <option key={m.monthKey} value={m.monthKey}>
                  {m.monthDisplay} {m.isMonthEnded ? '(Closed)' : '(Active)'}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Secondary Filter Line: Dates, Sales Center, Search */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-cyan-500/20">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center space-x-1.5">
              <label htmlFor="input-exp-from" className="text-xs font-bold text-slate-300">From:</label>
              <DateInputWithPicker
                id="input-exp-from"
                inputRef={fromDateInputRef}
                value={fromDate}
                valueFormat="iso"
                onChange={(val) => setFromDate(val)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (toDateInputRef.current) toDateInputRef.current.focus();
                    if (toDate) handleApplyDateFilter();
                  }
                }}
                className="w-[116px]"
                inputClassName="text-xs font-bold border border-cyan-500/30 rounded-xl px-2 py-1"
                title="Pick From Date (dd.mm.yy)"
              />
            </div>

            <div className="flex items-center space-x-1.5">
              <label htmlFor="input-exp-to" className="text-xs font-bold text-slate-300">To:</label>
              <DateInputWithPicker
                id="input-exp-to"
                inputRef={toDateInputRef}
                value={toDate}
                valueFormat="iso"
                onChange={(val) => setToDate(val)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleApplyDateFilter();
                  }
                }}
                className="w-[116px]"
                inputClassName="text-xs font-bold border border-cyan-500/30 rounded-xl px-2 py-1"
                title="Pick To Date (dd.mm.yy)"
              />
            </div>

            <button
              type="button"
              onClick={handleApplyDateFilter}
              className="px-3 py-1 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-xl text-xs font-black cursor-pointer"
            >
              Go
            </button>

            {(fromDate || toDate || isDateFiltered) && (
              <button
                type="button"
                onClick={handleResetDateFilter}
                className="px-2.5 py-1 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 rounded-xl text-xs font-bold cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SalesCenterSearchFilter
              value={selectedEntity}
              onChange={(val) => setSelectedEntity(val)}
              branches={allowedBranches}
              isLocked={!canViewAllCenters}
              lockedReason={`Locked to assigned sales center: ${selectedEntity}`}
              includeAllOption={canViewAllCenters}
              allOptionLabel={isSuper ? 'All Sales Centers' : `All My Centers (${allowedBranches.length})`}
              allOptionValue="all"
              label="Sales Center:"
              theme="dark"
              size="sm"
              widthClass="min-w-[170px] max-w-[220px]"
            />

            <div className="relative w-52">
              <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search head, remarks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-1.5 border border-cyan-500/30 rounded-xl bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Success Toast */}
      {successToast && (
        <div className="p-3 bg-emerald-950/70 border border-emerald-400/40 rounded-xl text-emerald-200 text-xs font-bold flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessToast(null)}
            className="text-emerald-300 hover:text-white p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* TAB CONTENT 1: ALL EXPENSES TABLE */}
      {activeTab === 'all' && (
        <div className="cyber-glass-card rounded-2xl overflow-hidden text-white">
          <div className="p-3 sm:p-4 bg-[#0c2638]/90 border-b border-cyan-500/25 flex items-center justify-between">
            <span className="text-xs font-black text-white uppercase tracking-wide">
              Detailed Expense Vouchers ({visibleExpenseRows.length})
            </span>
            <span className="text-xs font-mono font-black text-cyan-200 bg-[#061520] border border-cyan-500/30 px-2.5 py-0.5 rounded-lg">
              Total: ৳{aggregateTotals.totalExp.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-200 border-collapse">
              <thead>
                <tr className="bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 font-bold uppercase text-[10px]">
                  <th className="py-2.5 px-3 text-center w-12">SL</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Sales Center</th>
                  <th className="py-2.5 px-3">Expense Head</th>
                  <th className="py-2.5 px-3">Staff / Person</th>
                  <th className="py-2.5 px-3">Billing Month</th>
                  <th className="py-2.5 px-3 text-right">Amount (Tk)</th>
                  <th className="py-2.5 px-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60">
                {visibleExpenseRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                      No expense records matching the selected filters.
                    </td>
                  </tr>
                ) : (
                  visibleExpenseRows.map(({ item, monthDisplay }, idx) => {
                    const autoMonth = getAutoMonthName(item.date, item.billingMonth);
                    return (
                      <tr key={item.id || idx} className="hover:bg-cyan-500/[0.06] transition-colors">
                        <td className="py-2 px-3 text-center font-mono text-slate-400 font-bold">{idx + 1}</td>
                        <td className="py-2 px-3 font-mono font-semibold text-white whitespace-nowrap">
                          {formatDateDDMMYY(item.date)}
                        </td>
                        <td className="py-2 px-3 font-bold text-white">
                          {item.salesCenter || item.entityName || '-'}
                        </td>
                        <td className="py-2 px-3 font-bold text-cyan-200">
                          <span className="px-2 py-0.5 bg-[#0b2334] rounded border border-cyan-500/30 font-semibold text-[11px]">
                            {item.expenseHead || 'General Expense'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-200 font-medium">
                          {item.staffName || item.marketingPerson || item.personName || '-'}
                        </td>
                        <td className="py-2 px-3">
                          {autoMonth ? (
                            <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-200 border border-cyan-400/30 rounded font-bold text-[10px]">
                              {autoMonth}
                            </span>
                          ) : (
                            <span className="text-slate-500 font-mono text-[11px]">-</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-black text-sm text-rose-300 bg-cyan-500/[0.04] whitespace-nowrap">
                          ৳{Number(item.amount || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="py-2 px-3 text-slate-400 text-[11px] max-w-xs truncate" title={item.remarks || ''}>
                          {item.remarks || '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: SALES CENTER GROUP BREAKDOWN */}
      {activeTab === 'sales_centers' && (
        <div className="space-y-4">
          {salesCenterGroups.length === 0 ? (
            <div className="cyber-glass-card p-8 rounded-2xl text-center text-slate-400 italic">
              No sales center expenses recorded.
            </div>
          ) : (
            salesCenterGroups.map(([centerName, group]) => (
              <div key={centerName} className="cyber-glass-card rounded-2xl overflow-hidden text-white">
                <div className="p-3.5 bg-[#0c2638]/90 border-b border-cyan-500/25 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <Building2 className="w-4 h-4 text-cyan-300" />
                    <h3 className="text-sm font-black text-white uppercase tracking-wide">
                      {centerName}
                    </h3>
                    <span className="text-[11px] font-bold text-cyan-200 bg-[#061520] px-2 py-0.5 rounded border border-cyan-500/30">
                      {group.items.length} vouchers
                    </span>
                  </div>

                  <div className="flex items-center space-x-3 text-xs">
                    <span className="font-semibold text-slate-300">
                      Staff: <strong className="font-mono text-white">৳{group.staffTotal.toLocaleString('en-IN')}</strong>
                    </span>
                    <span className="font-semibold text-slate-300">
                      Utilities: <strong className="font-mono text-white">৳{group.utilityTotal.toLocaleString('en-IN')}</strong>
                    </span>
                    <span className="font-black text-cyan-200 bg-[#061520] px-3 py-1 rounded-lg border border-cyan-500/30 font-mono text-sm">
                      Total: ৳{group.total.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-200 border-collapse">
                    <thead>
                      <tr className="bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 font-bold uppercase text-[10px]">
                        <th className="py-2 px-3 w-10 text-center">#</th>
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Expense Head</th>
                        <th className="py-2 px-3">Staff / Marketing Person</th>
                        <th className="py-2 px-3">Billing Month</th>
                        <th className="py-2 px-3 text-right">Amount (Tk)</th>
                        <th className="py-2 px-3">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60">
                      {group.items.map((item, idx) => {
                        const autoMonth = getAutoMonthName(item.date, item.billingMonth);
                        return (
                          <tr key={item.id || idx} className="hover:bg-cyan-500/[0.06]">
                            <td className="py-1.5 px-3 text-center font-mono text-slate-400">{idx + 1}</td>
                            <td className="py-1.5 px-3 font-mono font-medium text-white">{formatDateDDMMYY(item.date)}</td>
                            <td className="py-1.5 px-3 font-bold text-cyan-200">{item.expenseHead || '-'}</td>
                            <td className="py-1.5 px-3 text-slate-200 font-semibold">{item.staffName || item.marketingPerson || item.personName || '-'}</td>
                            <td className="py-1.5 px-3">
                              {autoMonth ? (
                                <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-200 border border-cyan-400/30 rounded font-bold text-[10px]">
                                  {autoMonth}
                                </span>
                              ) : '-'}
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono font-black text-rose-300 bg-cyan-500/[0.04]">
                              ৳{Number(item.amount || 0).toLocaleString('en-IN')}
                            </td>
                            <td className="py-1.5 px-3 text-slate-400 text-[11px] truncate max-w-xs">{item.remarks || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB CONTENT 3: CATEGORY HEAD BREAKDOWN */}
      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categoryGroups.map(([catName, group]) => (
            <div key={catName} className="cyber-glass-subcard p-4 rounded-2xl border border-cyan-500/25 hover:border-cyan-400/50 transition-colors flex flex-col justify-between text-white">
              <div>
                <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
                  <h4 className="font-black text-white text-sm">{catName}</h4>
                  <span className="text-[11px] font-bold text-cyan-200 bg-[#061520] border border-cyan-500/25 px-2 py-0.5 rounded">
                    {group.count} entries
                  </span>
                </div>
                <div className="mt-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Total Expenditure</span>
                  <div className="text-xl font-black text-rose-300 font-mono mt-0.5">
                    ৳{group.total.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-cyan-500/20 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Avg: ৳{Math.round(group.total / (group.count || 1)).toLocaleString('en-IN')} / entry</span>
                <span className="font-semibold text-cyan-300">{((group.total / (aggregateTotals.totalExp || 1)) * 100).toFixed(1)}% of total</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB CONTENT 4: MONTHLY SETTLEMENTS & PARTY ADJUSTMENT */}
      {activeTab === 'settlement' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 cyber-glass-card p-4 rounded-2xl text-white">
            <div>
              <h3 className="text-sm font-black text-white uppercase">Monthly Party Collection Settlement</h3>
              <p className="text-xs text-slate-400">Adjust monthly expenses with customer collections and schedule auto-deposits to Head Office on the 1st</p>
            </div>
            <button
              type="button"
              onClick={() => handleOpenPartyEntryModal()}
              className="px-4 py-2 bg-emerald-500/25 hover:bg-emerald-500/35 text-emerald-200 border border-emerald-400/40 rounded-xl text-xs font-black cursor-pointer shadow-xs"
            >
              + Adjust Party Collection
            </button>
          </div>

          <div className="cyber-glass-card rounded-2xl overflow-hidden text-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-200 border-collapse">
                <thead>
                  <tr className="bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-3 text-center w-12">#</th>
                    <th className="py-2.5 px-3">Month</th>
                    <th className="py-2.5 px-3 text-right">Total Expense</th>
                    <th className="py-2.5 px-3">Adjusted Party</th>
                    <th className="py-2.5 px-3">Collection Date</th>
                    <th className="py-2.5 px-3 text-right">Party Collection</th>
                    <th className="py-2.5 px-3 text-right">Net Remaining</th>
                    <th className="py-2.5 px-3 text-center">H/O Auto-Deposit</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60">
                  {activeMonthSummaries.map((m, idx) => (
                    <tr key={m.monthKey} className="hover:bg-cyan-500/[0.06] transition-colors">
                      <td className="py-2 px-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                      <td className="py-2 px-3 font-bold text-white whitespace-nowrap">
                        {m.monthDisplay}
                        <span className="block text-[10px] text-slate-400 font-mono">{m.monthKey}</span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-black text-rose-300">
                        ৳{m.totalExpenses.toLocaleString('en-IN')}
                      </td>
                      <td className="py-2 px-3 font-bold text-white">
                        {m.isAdjusted && m.adjustedPartyName ? (
                          <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 rounded font-bold text-xs">
                            {m.adjustedPartyName}
                          </span>
                        ) : (
                          <span className="text-slate-500 font-semibold italic text-xs">Pending</span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono font-semibold text-slate-200">
                        {m.isAdjusted && m.adjustedCollectionDate ? formatDateDDMMYY(m.adjustedCollectionDate) : '-'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-black text-emerald-300">
                        {m.isAdjusted ? `৳${m.adjustedCollectionAmount.toLocaleString('en-IN')}` : '-'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-black">
                        {m.isAdjusted ? (
                          <span className={m.netRemaining >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                            ৳{m.netRemaining.toLocaleString('en-IN')}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#061520] text-cyan-200 border border-cyan-500/30 font-mono">
                          {m.nextMonth01}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        {m.isAdjusted ? (
                          <div className="flex items-center justify-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenPartyEntryModal(m.monthKey, m.totalExpenses, {
                                partyName: m.adjustedPartyName || '',
                                collectionDate: m.adjustedCollectionDate || '',
                                collectionAmount: m.adjustedCollectionAmount,
                                remarks: monthlyAdjustments[m.monthKey]?.remarks
                              })}
                              className="px-2 py-1 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/30 rounded font-bold text-xs cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveAdjustment(m.monthKey)}
                              className="p-1 hover:bg-rose-500/20 text-rose-300 rounded cursor-pointer"
                              title="Clear adjustment"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenPartyEntryModal(m.monthKey, m.totalExpenses)}
                            className="px-2.5 py-1 bg-emerald-500/25 hover:bg-emerald-500/35 text-emerald-200 border border-emerald-400/40 rounded font-bold text-xs cursor-pointer shadow-2xs"
                          >
                            Adjust
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ADJUST PARTY MODAL */}
      {isPartyEntryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#030d14]/80 backdrop-blur-sm">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-3xl border border-cyan-400/35 shadow-[0_24px_64px_rgba(0,0,0,0.65)] w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto text-white">
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
              <div>
                <h3 className="text-base font-black text-white">
                  Adjust Monthly Expense with Party Collection
                </h3>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">
                  Target Month: <strong className="text-cyan-200">{targetMonthForAdjustment}</strong> (Expense: ৳{targetMonthExpenseTotal.toLocaleString('en-IN')})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPartyEntryModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {partyEntryError && (
              <div className="p-3 bg-rose-500/15 border border-rose-400/40 rounded-xl text-rose-200 text-xs font-bold">
                {partyEntryError}
              </div>
            )}

            <form onSubmit={handleSavePartyEntry} className="space-y-3.5">
              {/* Party Name Autocomplete */}
              <div className="space-y-1">
                <label className="text-xs font-black text-slate-300">Customer Party Name *</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="Search and select party name..."
                    value={partySearchQuery}
                    onChange={(e) => {
                      setPartySearchQuery(e.target.value);
                      setEntryPartyName(e.target.value);
                      setIsPartySearchOpen(true);
                    }}
                    onFocus={() => setIsPartySearchOpen(true)}
                    className="w-full text-xs font-bold text-white bg-[#061520] border border-cyan-500/30 rounded-xl px-3 py-2 placeholder-slate-400 focus:ring-2 focus:ring-cyan-400"
                  />
                  {isPartySearchOpen && filteredPartiesForSearch.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-[#081c29] border border-cyan-500/35 rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto divide-y divide-cyan-500/15">
                      {filteredPartiesForSearch.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => {
                            handlePartySelectChange(p.name);
                            setIsPartySearchOpen(false);
                          }}
                          className="p-2 hover:bg-cyan-500/15 cursor-pointer text-xs"
                        >
                          <div className="font-black text-white">{p.name}</div>
                          <div className="text-[11px] text-slate-400">{p.address || 'No address'} • {p.salespersonName || 'No officer'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Collection Date and Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-300">Collection Date (dd.mm.yy) *</label>
                  <DateInputWithPicker
                    value={entryCollectionDate}
                    onChange={setEntryCollectionDate}
                    valueFormat="ddmmyy"
                    theme="dark"
                    required
                    inputClassName="!rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-300">Collection Amount (৳) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={entryAmount}
                    onChange={(e) => setEntryAmount(e.target.value)}
                    placeholder="Amount in Tk"
                    className="w-full text-xs font-black text-white bg-[#061520] border border-cyan-500/30 rounded-xl px-3 py-2 font-mono placeholder-slate-400"
                  />
                </div>
              </div>

              {/* Marketing Person & Sales Center */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-300">Marketing Officer</label>
                  <input
                    type="text"
                    value={entryMarketingPerson}
                    onChange={(e) => setEntryMarketingPerson(e.target.value)}
                    className="w-full text-xs font-bold text-white bg-[#061520] border border-cyan-500/30 rounded-xl px-3 py-2"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-300">Sales Center</label>
                  <input
                    type="text"
                    value={entrySalesCenter}
                    onChange={(e) => {
                      const nextCenter = e.target.value;
                      setEntrySalesCenter(nextCenter);
                      if (nextCenter.trim()) {
                        setEntryMrNo(
                          computeNextSalesCenterMrNo(
                            collections,
                            nextCenter.trim(),
                            branches,
                            parties,
                            allSalespersons
                          )
                        );
                      }
                    }}
                    className="w-full text-xs font-bold text-white bg-[#061520] border border-cyan-500/30 rounded-xl px-3 py-2"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div className="space-y-1">
                <label className="text-xs font-black text-slate-300">Remarks / Note</label>
                <input
                  type="text"
                  value={entryRemarks}
                  onChange={(e) => setEntryRemarks(e.target.value)}
                  placeholder="Optional notes"
                  className="w-full text-xs font-bold text-white bg-[#061520] border border-cyan-500/30 rounded-xl px-3 py-2 placeholder-slate-400"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-cyan-500/20">
                <button
                  type="button"
                  onClick={() => setIsPartyEntryModalOpen(false)}
                  className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 rounded-xl text-xs font-black cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-xl text-xs font-black cursor-pointer shadow-md"
                >
                  Save & Schedule H/O Deposit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bottom Action Footer Bar */}
      <div className="flex flex-wrap items-center justify-end gap-2 cyber-glass-card p-3 rounded-2xl text-white no-print">
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#081b28] text-slate-200 hover:bg-[#0e2a3d] border border-cyan-500/30 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs"
        >
          <Printer className="w-3.5 h-3.5 text-cyan-300" />
          <span>Print</span>
        </button>
        <button
          type="button"
          onClick={handleExportExcel}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Excel</span>
        </button>
        {onNavigateEntry && (
          <button
            type="button"
            onClick={onNavigateEntry}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-xl text-xs font-black transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Quick Entry</span>
          </button>
        )}
      </div>
    </div>
  );
};
export default ExpenseAmountTab;
