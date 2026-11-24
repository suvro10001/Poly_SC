import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Building2,
  Calendar,
  CheckCircle2,
  Printer,
  Download,
  Search,
  Banknote,
  RotateCcw,
  Plus,
  Users,
  X,
  Trash2,
  Zap,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  Receipt
} from 'lucide-react';
import {
  ExpenseEntry,
  CollectionMR,
  BankDeposit,
  BranchLocation,
  CompanyDetails,
  AuthUser,
  Party,
  Salesperson
} from '../types';
import { formatDateDDMMYY, parseDateToISO } from '../utils/dateUtils';
import { triggerAutoConfiguredPrint } from '../utils/printerAutoConfig';
import {
  isSuperAdminOrAgm,
  isStrictSuperAdmin,
  isAccountsAdmin,
  isAnyAdmin,
  filterBranchesForUser,
  getUserBranch,
  cleanBranchName
} from '../utils/branchAccess';
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
  adjustmentKey?: string;
  monthKey: string;
  partyName: string;
  collectionDate: string;
  collectionAmount: number;
  mrNo?: string;
  remarks?: string;
  salesCenter?: string;
  salesCenterKey?: string;
  marketingPerson?: string;
  depositId?: string;
  collectionId?: string;
}

interface ResolvedCenterInfo {
  key: string;
  name: string;
  branchId: string;
  branchCode: string;
}

interface MonthSummary {
  monthKey: string; // YYYY-MM
  monthDisplay: string; // e.g. "September 2026"
  nextMonth01: string; // DD.MM.YY e.g. "01.10.26"
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

interface SalesCenterGroupData {
  centerKey: string;
  centerName: string;
  branchId: string;
  total: number;
  staffTotal: number;
  utilityTotal: number;
  items: ExpenseEntry[];
  minDateIso: string;
  maxDateIso: string;
  targetMonthKey: string;
  adjustments: MonthlyAdjustmentRecord[];
  adjustedAmount: number;
  remainingAmount: number;
}

const isAllToken = (val?: string | null): boolean => {
  const low = (val || '').trim().toLowerCase();
  return (
    !low ||
    low === 'all' ||
    low === 'all sales centers' ||
    low === 'all branches' ||
    low === 'all centers' ||
    low.startsWith('all sales center') ||
    low.startsWith('all assigned')
  );
};

const toCenterSlug = (name: string): string => {
  return (cleanBranchName(name) || 'center')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'center';
};

const buildAdjustmentKey = (centerName: string, monthKey: string): string => {
  const cKey = cleanBranchName(centerName || 'General Sales Center').toLowerCase().trim();
  const mKey = (monthKey || 'all').trim();
  return `${cKey}::${mKey}`;
};

const getExpenseSortTimestamp = (e: ExpenseEntry): number => {
  const match = (e.id || '').match(/(\d{10,13})/);
  if (match) {
    const num = Number(match[1]);
    if (!isNaN(num)) return num;
  }
  if (typeof e.updatedAt === 'number') return e.updatedAt;
  if (typeof e.updatedAt === 'string') {
    const parsed = Date.parse(e.updatedAt);
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
};

const sortExpensesDateSerial = (list: ExpenseEntry[], dir: 'asc' | 'desc' = 'asc'): ExpenseEntry[] => {
  return [...list].sort((a, b) => {
    const isoA = parseDateToISO(a.date) || a.date || '';
    const isoB = parseDateToISO(b.date) || b.date || '';
    if (isoA !== isoB) {
      return dir === 'asc' ? isoA.localeCompare(isoB) : isoB.localeCompare(isoA);
    }
    const tsA = getExpenseSortTimestamp(a);
    const tsB = getExpenseSortTimestamp(b);
    if (tsA !== tsB) {
      return dir === 'asc' ? tsA - tsB : tsB - tsA;
    }
    return (a.expenseHead || '').localeCompare(b.expenseHead || '');
  });
};

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
  const isSuper =
    isStrictSuperAdmin(currentUser) ||
    isAccountsAdmin(currentUser) ||
    isSuperAdminOrAgm(currentUser) ||
    isAnyAdmin(currentUser);

  const allowedBranches = useMemo(
    () => filterBranchesForUser(branches, currentUser, allSalespersons),
    [branches, currentUser, allSalespersons]
  );
  const canViewAllCenters = isSuper || allowedBranches.length > 1;
  const userBranchInfo = getUserBranch(currentUser, allSalespersons, branches);

  const [selectedEntity, setSelectedEntity] = useState<string>(() => {
    if (canViewAllCenters) return 'all';
    return (
      allowedBranches[0]?.id ||
      allowedBranches[0]?.name ||
      userBranchInfo?.branchId ||
      userBranchInfo?.branchName ||
      'Madhupur Sales Center'
    );
  });

  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'sales_centers' | 'all' | 'categories' | 'settlement'>('sales_centers');

  // Click-to-expand state for Sales Center Wise view (collapsed by default)
  const [expandedCenters, setExpandedCenters] = useState<Record<string, boolean>>({});
  const [dateSerialSortDir, setDateSerialSortDir] = useState<'asc' | 'desc'>('asc');

  // Date Range filter states
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const fromDateInputRef = useRef<HTMLInputElement | null>(null);
  const toDateInputRef = useRef<HTMLInputElement | null>(null);

  // Monthly Expense Adjustments with Party Collection state (Sales Center + Month aware)
  const [monthlyAdjustments, setMonthlyAdjustments] = useState<Record<string, MonthlyAdjustmentRecord>>(() => {
    try {
      const raw = localStorage.getItem('polycables_monthly_expense_adjustments');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Merge cloud-synced adjustment collections (isMonthlyExpenseAdjusted) so adjustments also survive cross-device reload
  const effectiveAdjustments = useMemo<Record<string, MonthlyAdjustmentRecord>>(() => {
    const merged: Record<string, MonthlyAdjustmentRecord> = {};

    Object.entries(monthlyAdjustments).forEach(([rawKey, rec]) => {
      if (!rec || !rec.partyName) return;
      const centerName = rec.salesCenter ? cleanBranchName(rec.salesCenter) : '';
      const normKey = centerName ? buildAdjustmentKey(centerName, rec.monthKey || 'all') : rawKey;
      merged[normKey] = {
        ...rec,
        adjustmentKey: normKey,
        salesCenter: centerName || rec.salesCenter,
        salesCenterKey: centerName ? centerName.toLowerCase() : rec.salesCenterKey
      };
    });

    (collections || []).forEach((col) => {
      if (!col || !col.isMonthlyExpenseAdjusted || !col.partyName) return;
      const colAny = col as any;
      const centerName = cleanBranchName(col.salesCenter || col.entityName || '');
      let mKey = String(colAny.adjustmentMonthKey || '').trim();
      if (!mKey && col.remarks) {
        const mMatch = col.remarks.match(/\b(20\d{2}-\d{2})\b/);
        if (mMatch) mKey = mMatch[1];
      }
      if (!mKey) {
        // Fallback: deposit date is 01st of following month, so target month is previous month
        const depIso = parseDateToISO(col.date || col.depositDate);
        if (/^\d{4}-\d{2}-\d{2}$/.test(depIso)) {
          const [y, m] = depIso.split('-').map(Number);
          const prevMonth = m === 1 ? 12 : m - 1;
          const prevYear = m === 1 ? y - 1 : y;
          mKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
        } else {
          mKey = 'all';
        }
      }
      const normKey = centerName ? buildAdjustmentKey(centerName, mKey) : mKey;
      if (!merged[normKey]) {
        merged[normKey] = {
          adjustmentKey: normKey,
          monthKey: mKey,
          partyName: col.partyName,
          collectionDate: colAny.adjustmentCollectionDate || formatDateDDMMYY(col.date),
          collectionAmount: Number(col.amount) || 0,
          mrNo: col.mrNo,
          remarks: col.remarks,
          salesCenter: centerName || col.salesCenter,
          salesCenterKey: centerName ? centerName.toLowerCase() : undefined,
          depositId: col.bankDepositId,
          collectionId: col.id,
          marketingPerson: col.marketingPerson || col.salespersonName
        };
      }
    });

    return merged;
  }, [monthlyAdjustments, collections]);

  // Modal State for adjusting party collection
  const [isPartyEntryModalOpen, setIsPartyEntryModalOpen] = useState<boolean>(false);
  const [targetMonthForAdjustment, setTargetMonthForAdjustment] = useState<string | null>(null);
  const [editingAdjustmentKey, setEditingAdjustmentKey] = useState<string | null>(null);
  const [targetMonthExpenseTotal, setTargetMonthExpenseTotal] = useState<number>(0);
  const [entryPartyName, setEntryPartyName] = useState<string>('');
  const [partySearchQuery, setPartySearchQuery] = useState<string>('');
  const [isPartySearchOpen, setIsPartySearchOpen] = useState<boolean>(false);
  const [entryCollectionDate, setEntryCollectionDate] = useState<string>(() => formatDateDDMMYY(new Date()));
  const [entryAmount, setEntryAmount] = useState<string>('');
  const [entrySalesCenter, setEntrySalesCenter] = useState<string>(
    () => allowedBranches[0]?.name || userBranchInfo?.branchName || 'Madhupur Sales Center'
  );
  const [entryMarketingPerson, setEntryMarketingPerson] = useState<string>(
    () => currentUser?.name || allSalespersons[0]?.name || ''
  );
  const [entryAddress, setEntryAddress] = useState<string>('Madhupur');
  const [entryMrNo, setEntryMrNo] = useState<string>('');
  const [entryRemarks, setEntryRemarks] = useState<string>('');
  const [partyEntryError, setPartyEntryError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const lastExpenseTabUserKeyRef = useRef<string>('');
  useEffect(() => {
    const userKey = `${currentUser?.username || ''}::${currentUser?.salespersonCode || ''}::${currentUser?.branchId || ''}::${currentUser?.role || ''}`;
    const userChanged = lastExpenseTabUserKeyRef.current !== '' && lastExpenseTabUserKeyRef.current !== userKey;
    lastExpenseTabUserKeyRef.current = userKey;

    const preferredIdOrName =
      allowedBranches[0]?.id || allowedBranches[0]?.name || userBranchInfo?.branchId || userBranchInfo?.branchName || '';
    const preferredName = allowedBranches[0]?.name || userBranchInfo?.branchName || '';
    if (!canViewAllCenters && preferredIdOrName) {
      setSelectedEntity(preferredIdOrName);
      if (preferredName) setEntrySalesCenter(preferredName);
    } else if (userChanged) {
      setSelectedEntity(
        isSuper
          ? 'all'
          : userBranchInfo?.branchId && userBranchInfo.branchId !== 'all'
          ? userBranchInfo.branchId
          : userBranchInfo?.branchName && !isAllToken(userBranchInfo.branchName)
          ? userBranchInfo.branchName
          : 'all'
      );
      if (preferredName) setEntrySalesCenter(preferredName);
    }
  }, [currentUser, isSuper, canViewAllCenters, allowedBranches, userBranchInfo?.branchName, userBranchInfo?.branchId]);

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

  // Branch & Salesperson fast lookup maps for accurate Sales Center resolution
  const branchLookups = useMemo(() => {
    const byId = new Map<string, BranchLocation>();
    const byCode = new Map<string, BranchLocation>();
    const byCleanName = new Map<string, BranchLocation>();

    (branches || []).forEach((b) => {
      if (!b) return;
      if (b.id) byId.set(b.id.toLowerCase().trim(), b);
      if (b.code) byCode.set(String(b.code).toLowerCase().trim(), b);
      if (b.name) byCleanName.set(cleanBranchName(b.name).toLowerCase().trim(), b);
    });

    return { byId, byCode, byCleanName };
  }, [branches]);

  const salespersonLookups = useMemo(() => {
    const byToken = new Map<string, Salesperson>();
    (allSalespersons || []).forEach((sp) => {
      if (!sp) return;
      if (sp.id) byToken.set(sp.id.toLowerCase().trim(), sp);
      if (sp.code) byToken.set(sp.code.toLowerCase().trim(), sp);
      if (sp.username) byToken.set(sp.username.toLowerCase().trim(), sp);
      if (sp.name) {
        const nameLow = sp.name.toLowerCase().trim();
        byToken.set(nameLow, sp);
        if (sp.code) {
          byToken.set(`${nameLow} (${sp.code.toLowerCase().trim()})`, sp);
        }
      }
    });
    return byToken;
  }, [allSalespersons]);

  const matchBranchByToken = useCallback(
    (token?: string | null): BranchLocation | undefined => {
      if (!token || isAllToken(token)) return undefined;
      const raw = token.trim().toLowerCase();
      const cleaned = cleanBranchName(token).toLowerCase().trim();
      return (
        branchLookups.byId.get(raw) ||
        branchLookups.byCode.get(raw) ||
        branchLookups.byCleanName.get(raw) ||
        branchLookups.byCleanName.get(cleaned) ||
        (branches || []).find((b) => {
          const bClean = cleanBranchName(b.name).toLowerCase();
          return bClean === cleaned || (cleaned.length > 3 && (bClean.includes(cleaned) || cleaned.includes(bClean)));
        })
      );
    },
    [branchLookups, branches]
  );

  const resolveExpenseCenter = useCallback(
    (exp: ExpenseEntry): ResolvedCenterInfo => {
      let matchedBranch: BranchLocation | undefined =
        matchBranchByToken(exp.salesCenter) ||
        matchBranchByToken(exp.branchId) ||
        matchBranchByToken(exp.branchName);

      if (!matchedBranch && exp.entityType === 'center' && !isAllToken(exp.entityName)) {
        matchedBranch = matchBranchByToken(exp.entityName);
      }

      if (!matchedBranch) {
        const spTokens = [
          (exp as any).salespersonId,
          (exp as any).salesmanCode,
          exp.entityName,
          exp.staffName,
          exp.marketingPerson,
          exp.personName
        ];
        for (const tok of spTokens) {
          if (!tok || isAllToken(tok)) continue;
          const cleanTok = String(tok).trim().toLowerCase();
          const baseTok = cleanTok.replace(/\s*\([^)]*\)\s*$/, '').trim();
          const sp = salespersonLookups.get(cleanTok) || salespersonLookups.get(baseTok);
          if (sp) {
            matchedBranch = matchBranchByToken(sp.branchId) || matchBranchByToken(sp.branchName);
            if (matchedBranch) break;
            if (sp.branchName && !isAllToken(sp.branchName)) {
              const spFirstBranch = sp.branchName.split(',')[0].trim();
              matchedBranch = matchBranchByToken(spFirstBranch);
              if (matchedBranch) break;
              const fallbackSpName = cleanBranchName(spFirstBranch);
              return {
                key: fallbackSpName.toLowerCase(),
                name: fallbackSpName,
                branchId: sp.branchId || '',
                branchCode: ''
              };
            }
          }
        }
      }

      if (matchedBranch) {
        const cleanName = cleanBranchName(matchedBranch.name) || matchedBranch.name;
        return {
          key: cleanName.toLowerCase(),
          name: cleanName,
          branchId: matchedBranch.id,
          branchCode: matchedBranch.code ? String(matchedBranch.code) : ''
        };
      }

      const rawCenter =
        (!isAllToken(exp.salesCenter) && exp.salesCenter) ||
        (!isAllToken(exp.branchName) && exp.branchName) ||
        (exp.entityType === 'center' && !isAllToken(exp.entityName) && exp.entityName) ||
        (!isAllToken(exp.entityName) && exp.entityName) ||
        'General Sales Center';

      const cleaned = cleanBranchName(rawCenter) || rawCenter.trim();
      return {
        key: cleaned.toLowerCase(),
        name: cleaned,
        branchId: !isAllToken(exp.branchId) ? String(exp.branchId) : '',
        branchCode: ''
      };
    },
    [matchBranchByToken, salespersonLookups]
  );

  // Selected entity resolution for SalesCenterSearchFilter (handles branch.id, branch.code, or branch.name)
  const selectedEntityTarget = useMemo(() => {
    if (!selectedEntity || isAllToken(selectedEntity)) {
      return { isAll: true, branch: undefined as BranchLocation | undefined, cleanKey: '' };
    }
    const matched = matchBranchByToken(selectedEntity);
    const cleanKey = (matched ? cleanBranchName(matched.name) : cleanBranchName(selectedEntity)).toLowerCase().trim();
    return { isAll: false, branch: matched, cleanKey };
  }, [selectedEntity, matchBranchByToken]);

  const expenseMatchesSelectedEntity = useCallback(
    (exp: ExpenseEntry, resolved: ResolvedCenterInfo): boolean => {
      if (selectedEntityTarget.isAll) return true;
      const selRaw = selectedEntity.trim().toLowerCase();
      const targetBranch = selectedEntityTarget.branch;

      if (targetBranch) {
        if (resolved.branchId && resolved.branchId.toLowerCase() === targetBranch.id.toLowerCase()) return true;
        if (targetBranch.code && resolved.branchCode && resolved.branchCode.toLowerCase() === String(targetBranch.code).toLowerCase()) {
          return true;
        }
        if (targetBranch.code && exp.branchId && exp.branchId.toLowerCase() === String(targetBranch.code).toLowerCase()) {
          return true;
        }
        if (exp.branchId && exp.branchId.toLowerCase() === targetBranch.id.toLowerCase()) return true;
      }

      if (selectedEntityTarget.cleanKey && resolved.key === selectedEntityTarget.cleanKey) return true;
      if (resolved.name.toLowerCase() === selRaw) return true;
      if ((exp.salesCenter || '').trim().toLowerCase() === selRaw) return true;
      if ((exp.entityName || '').trim().toLowerCase() === selRaw) return true;
      return false;
    },
    [selectedEntity, selectedEntityTarget]
  );

  const adjustmentMatchesSelectedEntity = useCallback(
    (adj: MonthlyAdjustmentRecord): boolean => {
      if (selectedEntityTarget.isAll) return true;
      const adjCenter = adj.salesCenter || '';
      if (!adjCenter) return false;
      const adjClean = cleanBranchName(adjCenter).toLowerCase().trim();
      if (selectedEntityTarget.cleanKey && adjClean === selectedEntityTarget.cleanKey) return true;
      const matched = matchBranchByToken(adjCenter);
      if (matched && selectedEntityTarget.branch && matched.id === selectedEntityTarget.branch.id) return true;
      return false;
    },
    [selectedEntityTarget, matchBranchByToken]
  );

  const handleApplyDateFilter = () => {
    if (fromDate && toDate && fromDate > toDate) {
      setFromDate(toDate);
      setToDate(fromDate);
    }
  };

  const handleResetAllFilters = () => {
    setSelectedMonth('all');
    setFromDate('');
    setToDate('');
    setSearchTerm('');
    if (canViewAllCenters) {
      setSelectedEntity('all');
    }
    if (fromDateInputRef.current) {
      fromDateInputRef.current.focus();
    }
  };

  // Helper to extract utility month name
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

  // Available months dropdown options (always derived from base expenses + adjustments so user can freely switch months)
  const availableMonthsList = useMemo(() => {
    const today = new Date();
    const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const monthsSet = new Set<string>();

    (expenses || []).forEach((e) => {
      const iso = parseDateToISO(e.date) || e.date;
      if (iso && iso.length >= 7 && /^\d{4}-\d{2}/.test(iso)) {
        monthsSet.add(iso.substring(0, 7));
      }
    });
    Object.values(effectiveAdjustments).forEach((adj) => {
      if (adj?.monthKey && /^\d{4}-\d{2}$/.test(adj.monthKey)) {
        monthsSet.add(adj.monthKey);
      }
    });
    if (monthsSet.size === 0) {
      monthsSet.add(currentMonthStr);
    }

    return Array.from(monthsSet)
      .sort()
      .reverse()
      .map((monthKey) => {
        const [yStr, mStr] = monthKey.split('-');
        const y = parseInt(yStr, 10);
        const m = parseInt(mStr, 10);
        const monthDateObj = new Date(y, m - 1, 1);
        return {
          monthKey,
          monthDisplay: monthDateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
          isMonthEnded: monthKey < currentMonthStr
        };
      });
  }, [expenses, effectiveAdjustments]);

  // Normalized date range bounds (auto-orders if user picked from > to)
  const effectiveDateBounds = useMemo(() => {
    const f = (fromDate || '').trim();
    const t = (toDate || '').trim();
    if (f && t && f > t) {
      return { from: t, to: f };
    }
    return { from: f, to: t };
  }, [fromDate, toDate]);

  // Pre-resolved & fully filtered expenses (Sales Center + Month + From/To Date + Search all apply together!)
  const filteredExpensesWithCenter = useMemo(() => {
    const lowerSearch = searchTerm.trim().toLowerCase();

    return (expenses || [])
      .map((exp) => ({
        exp,
        resolved: resolveExpenseCenter(exp),
        isoDate: parseDateToISO(exp.date) || exp.date || ''
      }))
      .filter(({ exp, resolved, isoDate }) => {
        // 1. Sales Center Filter
        if (!expenseMatchesSelectedEntity(exp, resolved)) return false;

        // 2. Month Filter
        if (selectedMonth !== 'all') {
          if (!isoDate || !isoDate.startsWith(selectedMonth)) return false;
        }

        // 3. Date Range Filter (live reactive as soon as From/To date is set)
        if (effectiveDateBounds.from && (!isoDate || isoDate < effectiveDateBounds.from)) return false;
        if (effectiveDateBounds.to && (!isoDate || isoDate > effectiveDateBounds.to)) return false;

        // 4. Search Term Filter
        if (lowerSearch) {
          const ddmm = formatDateDDMMYY(exp.date).toLowerCase();
          const autoM = getAutoMonthName(exp.date, exp.billingMonth).toLowerCase();
          const haystack = [
            exp.expenseHead,
            exp.remarks,
            exp.entityName,
            exp.salesCenter,
            exp.branchName,
            resolved.name,
            exp.area,
            exp.staffName,
            exp.marketingPerson,
            exp.personName,
            exp.fundingPartyName,
            exp.date,
            ddmm,
            autoM,
            String(exp.amount || '')
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          if (!haystack.includes(lowerSearch)) return false;
        }

        return true;
      });
  }, [
    expenses,
    resolveExpenseCenter,
    expenseMatchesSelectedEntity,
    selectedMonth,
    effectiveDateBounds,
    searchTerm
  ]);

  // Flat date-serial-sorted detailed expense rows
  const visibleExpenseRows = useMemo(() => {
    const sortedItems = sortExpensesDateSerial(
      filteredExpensesWithCenter.map((r) => r.exp),
      dateSerialSortDir
    );

    const centerLookup = new Map<string, ResolvedCenterInfo>();
    filteredExpensesWithCenter.forEach((r) => {
      centerLookup.set(r.exp.id, r.resolved);
    });

    return sortedItems.map((item) => {
      const iso = parseDateToISO(item.date) || item.date || '';
      const monthKey = iso && /^\d{4}-\d{2}/.test(iso) ? iso.substring(0, 7) : '';
      let monthDisplay = '-';
      let nextMonth01 = '-';
      if (monthKey) {
        const [yStr, mStr] = monthKey.split('-');
        const y = parseInt(yStr, 10);
        const m = parseInt(mStr, 10);
        monthDisplay = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
        const nM = m === 12 ? 1 : m + 1;
        const nY = m === 12 ? y + 1 : y;
        nextMonth01 = `01.${String(nM).padStart(2, '0')}.${String(nY).slice(-2)}`;
      }
      const resolved = centerLookup.get(item.id) || resolveExpenseCenter(item);
      return {
        item,
        resolvedCenter: resolved,
        monthDisplay,
        nextMonth01
      };
    });
  }, [filteredExpensesWithCenter, dateSerialSortDir, resolveExpenseCenter]);

  // Month Summaries (respects active filters & Sales Center wise adjustments)
  const monthSummaries = useMemo<MonthSummary[]>(() => {
    const today = new Date();
    const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    const monthsSet = new Set<string>();
    filteredExpensesWithCenter.forEach(({ isoDate }) => {
      if (isoDate && isoDate.length >= 7 && /^\d{4}-\d{2}/.test(isoDate)) {
        monthsSet.add(isoDate.substring(0, 7));
      }
    });

    if (selectedMonth !== 'all') {
      monthsSet.add(selectedMonth);
    } else if (!searchTerm.trim() && !effectiveDateBounds.from && !effectiveDateBounds.to) {
      Object.values(effectiveAdjustments).forEach((adj) => {
        if (adj?.monthKey && /^\d{4}-\d{2}$/.test(adj.monthKey) && adjustmentMatchesSelectedEntity(adj)) {
          monthsSet.add(adj.monthKey);
        }
      });
    }

    if (monthsSet.size === 0) {
      monthsSet.add(selectedMonth !== 'all' ? selectedMonth : currentMonthStr);
    }

    const sortedMonths = Array.from(monthsSet).sort().reverse();

    return sortedMonths.map((monthKey) => {
      const [yStr, mStr] = monthKey.split('-');
      const y = parseInt(yStr, 10);
      const m = parseInt(mStr, 10);
      const monthDisplay = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

      const nextMonth = m === 12 ? 1 : m + 1;
      const nextYear = m === 12 ? y + 1 : y;
      const nextMonth01 = `01.${String(nextMonth).padStart(2, '0')}.${String(nextYear).slice(-2)}`;
      const isMonthEnded = monthKey < currentMonthStr;

      const monthExps = filteredExpensesWithCenter
        .filter(({ isoDate }) => isoDate && isoDate.startsWith(monthKey))
        .map(({ exp }) => exp);

      const totalExpenses = monthExps.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

      const staffExpenses = monthExps
        .filter((e) => {
          const h = (e.expenseHead || '').toLowerCase();
          return (
            h.includes('staff') ||
            h.includes('salary') ||
            h.includes('conveyance') ||
            h.includes('lunch') ||
            h.includes('hotel') ||
            Boolean(e.staffName)
          );
        })
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

      const utilityExpenses = monthExps
        .filter((e) => {
          const h = (e.expenseHead || '').toLowerCase();
          return (
            h.includes('rent') ||
            h.includes('internet') ||
            h.includes('wifi') ||
            h.includes('electric') ||
            h.includes('bill')
          );
        })
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

      const matchingMonthAdjs = Object.values(effectiveAdjustments).filter(
        (adj) => adj.monthKey === monthKey && adj.partyName && adjustmentMatchesSelectedEntity(adj)
      );

      const isAdjusted = matchingMonthAdjs.length > 0;
      const adjustedPartyName = matchingMonthAdjs.map((a) => a.partyName).join(', ');
      const adjustedCollectionDate = matchingMonthAdjs.map((a) => formatDateDDMMYY(a.collectionDate)).join(', ');
      const adjustedCollectionAmount = matchingMonthAdjs.reduce((s, a) => s + (Number(a.collectionAmount) || 0), 0);

      const hasExpenseLevelParty = monthExps.some(
        (e) =>
          e.fundingPartyName &&
          e.fundingPartyName.trim() !== '' &&
          e.fundingPartyName.trim() !== 'Head Office (Sales Center Monthly Expenses)'
      );
      const hasPartyEntered = Boolean(isAdjusted || hasExpenseLevelParty);

      const netRemaining = adjustedCollectionAmount - totalExpenses;
      const hoAutoDepositAmount = hasPartyEntered ? (adjustedCollectionAmount || totalExpenses) : 0;
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
        adjustedPartyName: isAdjusted ? adjustedPartyName : undefined,
        adjustedCollectionDate: isAdjusted ? adjustedCollectionDate : undefined,
        adjustedCollectionAmount,
        netRemaining,
        hoAutoDepositAmount,
        hoAutoDepositDate: hasPartyEntered ? nextMonth01 : '-',
        hoDepositStatus,
        expenseItems: sortExpensesDateSerial(monthExps, dateSerialSortDir)
      };
    });
  }, [
    filteredExpensesWithCenter,
    selectedMonth,
    searchTerm,
    effectiveDateBounds,
    effectiveAdjustments,
    adjustmentMatchesSelectedEntity,
    dateSerialSortDir
  ]);

  // Grouped by Sales Center (Sorted Date Serial Wise inside each group + matched with Sales Center wise adjustments)
  const salesCenterGroups = useMemo<SalesCenterGroupData[]>(() => {
    const map = new Map<
      string,
      {
        centerKey: string;
        centerName: string;
        branchId: string;
        total: number;
        staffTotal: number;
        utilityTotal: number;
        items: ExpenseEntry[];
        minDateIso: string;
        maxDateIso: string;
      }
    >();

    filteredExpensesWithCenter.forEach(({ exp, resolved, isoDate }) => {
      const key = resolved.key;
      if (!map.has(key)) {
        map.set(key, {
          centerKey: key,
          centerName: resolved.name,
          branchId: resolved.branchId,
          total: 0,
          staffTotal: 0,
          utilityTotal: 0,
          items: [],
          minDateIso: isoDate || '',
          maxDateIso: isoDate || ''
        });
      }
      const g = map.get(key)!;
      const amt = Number(exp.amount) || 0;
      g.total += amt;

      const h = (exp.expenseHead || '').toLowerCase();
      if (
        h.includes('staff') ||
        h.includes('salary') ||
        h.includes('conveyance') ||
        h.includes('lunch') ||
        h.includes('hotel') ||
        Boolean(exp.staffName)
      ) {
        g.staffTotal += amt;
      }
      if (
        h.includes('rent') ||
        h.includes('internet') ||
        h.includes('wifi') ||
        h.includes('electric') ||
        h.includes('bill')
      ) {
        g.utilityTotal += amt;
      }
      if (isoDate) {
        if (!g.minDateIso || isoDate < g.minDateIso) g.minDateIso = isoDate;
        if (!g.maxDateIso || isoDate > g.maxDateIso) g.maxDateIso = isoDate;
      }
      g.items.push(exp);
    });

    const todayMonth = new Date().toISOString().slice(0, 7);

    return Array.from(map.values())
      .map((g) => {
        const sortedItems = sortExpensesDateSerial(g.items, dateSerialSortDir);
        const latestItemMonth =
          g.maxDateIso && /^\d{4}-\d{2}/.test(g.maxDateIso) ? g.maxDateIso.substring(0, 7) : todayMonth;
        const targetMonthKey = selectedMonth !== 'all' ? selectedMonth : latestItemMonth;

        // Match all adjustments belonging to this Sales Center (and selectedMonth if set)
        const matchedAdjustments = Object.values(effectiveAdjustments).filter((adj) => {
          if (!adj || !adj.partyName) return false;
          const adjClean = cleanBranchName(adj.salesCenter || '').toLowerCase().trim();
          const adjBranch = matchBranchByToken(adj.salesCenter);
          const sameCenter =
            adjClean === g.centerKey ||
            (adjBranch && g.branchId && adjBranch.id.toLowerCase() === g.branchId.toLowerCase());
          if (!sameCenter) return false;
          if (selectedMonth !== 'all') {
            return adj.monthKey === selectedMonth || adj.monthKey === 'all';
          }
          return true;
        });

        const adjustedAmount = matchedAdjustments.reduce((sum, a) => sum + (Number(a.collectionAmount) || 0), 0);

        return {
          ...g,
          items: sortedItems,
          targetMonthKey,
          adjustments: matchedAdjustments,
          adjustedAmount,
          remainingAmount: g.total - adjustedAmount
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [filteredExpensesWithCenter, dateSerialSortDir, selectedMonth, effectiveAdjustments, matchBranchByToken]);

  // Settlement rows per (Sales Center + Month) so Sales Center Wise Adjustments work smoothly even in Party Settlements tab
  const settlementRows = useMemo(() => {
    type Row = {
      rowKey: string;
      centerKey: string;
      centerName: string;
      monthKey: string;
      monthDisplay: string;
      nextMonth01: string;
      totalExpenses: number;
      adjustment?: MonthlyAdjustmentRecord;
    };
    const rowMap = new Map<string, Row>();
    const todayMonth = new Date().toISOString().slice(0, 7);

    const getMonthMeta = (mKey: string) => {
      const safeKey = /^\d{4}-\d{2}$/.test(mKey) ? mKey : todayMonth;
      const [yStr, mStr] = safeKey.split('-');
      const y = parseInt(yStr, 10);
      const m = parseInt(mStr, 10);
      const monthDisplay = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
      const nM = m === 12 ? 1 : m + 1;
      const nY = m === 12 ? y + 1 : y;
      const nextMonth01 = `01.${String(nM).padStart(2, '0')}.${String(nY).slice(-2)}`;
      return { monthDisplay, nextMonth01 };
    };

    filteredExpensesWithCenter.forEach(({ exp, resolved, isoDate }) => {
      const mKey = isoDate && /^\d{4}-\d{2}/.test(isoDate) ? isoDate.substring(0, 7) : todayMonth;
      const rKey = `${resolved.key}::${mKey}`;
      if (!rowMap.has(rKey)) {
        const meta = getMonthMeta(mKey);
        rowMap.set(rKey, {
          rowKey: rKey,
          centerKey: resolved.key,
          centerName: resolved.name,
          monthKey: mKey,
          monthDisplay: meta.monthDisplay,
          nextMonth01: meta.nextMonth01,
          totalExpenses: 0
        });
      }
      rowMap.get(rKey)!.totalExpenses += Number(exp.amount) || 0;
    });

    Object.values(effectiveAdjustments).forEach((adj) => {
      if (!adj || !adj.partyName) return;
      if (!adjustmentMatchesSelectedEntity(adj)) return;
      if (selectedMonth !== 'all' && adj.monthKey !== selectedMonth && adj.monthKey !== 'all') return;

      const centerName = cleanBranchName(adj.salesCenter || 'Madhupur Sales Center');
      const centerKey = centerName.toLowerCase();
      const mKey = adj.monthKey || todayMonth;
      const rKey = `${centerKey}::${mKey}`;
      const existing = rowMap.get(rKey);
      if (existing) {
        existing.adjustment = adj;
      } else if (!effectiveDateBounds.from && !effectiveDateBounds.to) {
        const q = searchTerm.trim().toLowerCase();
        const adjMatchesSearch =
          !q ||
          centerName.toLowerCase().includes(q) ||
          adj.partyName.toLowerCase().includes(q) ||
          formatDateDDMMYY(adj.collectionDate).toLowerCase().includes(q) ||
          (adj.remarks || '').toLowerCase().includes(q);
        if (adjMatchesSearch) {
          const meta = getMonthMeta(mKey);
          rowMap.set(rKey, {
            rowKey: rKey,
            centerKey,
            centerName,
            monthKey: mKey,
            monthDisplay: meta.monthDisplay,
            nextMonth01: meta.nextMonth01,
            totalExpenses: 0,
            adjustment: adj
          });
        }
      }
    });

    return Array.from(rowMap.values()).sort((a, b) => {
      if (a.monthKey !== b.monthKey) return b.monthKey.localeCompare(a.monthKey);
      return b.totalExpenses - a.totalExpenses;
    });
  }, [
    filteredExpensesWithCenter,
    effectiveAdjustments,
    adjustmentMatchesSelectedEntity,
    selectedMonth,
    searchTerm,
    effectiveDateBounds
  ]);

  // Aggregate KPI totals strictly matching active filters
  const aggregateTotals = useMemo(() => {
    const totalExp = filteredExpensesWithCenter.reduce((sum, { exp }) => sum + (Number(exp.amount) || 0), 0);
    const totalStaff = filteredExpensesWithCenter
      .filter(({ exp }) => {
        const h = (exp.expenseHead || '').toLowerCase();
        return (
          h.includes('staff') ||
          h.includes('salary') ||
          h.includes('conveyance') ||
          h.includes('lunch') ||
          h.includes('hotel') ||
          Boolean(exp.staffName)
        );
      })
      .reduce((sum, { exp }) => sum + (Number(exp.amount) || 0), 0);

    const totalUtility = filteredExpensesWithCenter
      .filter(({ exp }) => {
        const h = (exp.expenseHead || '').toLowerCase();
        return (
          h.includes('rent') ||
          h.includes('internet') ||
          h.includes('wifi') ||
          h.includes('electric') ||
          h.includes('bill')
        );
      })
      .reduce((sum, { exp }) => sum + (Number(exp.amount) || 0), 0);

    const totalPartyCol = salesCenterGroups.reduce((sum, g) => sum + g.adjustedAmount, 0);
    const totalAutoHo = totalPartyCol;
    return { totalExp, totalStaff, totalUtility, totalPartyCol, totalAutoHo };
  }, [filteredExpensesWithCenter, salesCenterGroups]);

  // Grouped by Category Head
  const categoryGroups = useMemo(() => {
    const map = new Map<string, { total: number; count: number; items: ExpenseEntry[] }>();
    visibleExpenseRows.forEach(({ item }) => {
      const cat = (item.expenseHead || 'Other Expenses').trim();
      if (!map.has(cat)) {
        map.set(cat, { total: 0, count: 0, items: [] });
      }
      const g = map.get(cat)!;
      g.total += Number(item.amount) || 0;
      g.count += 1;
      g.items.push(item);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [visibleExpenseRows]);

  // Parties search (prioritize parties belonging to the selected Sales Center)
  const filteredPartiesForSearch = useMemo(() => {
    const centerClean = cleanBranchName(entrySalesCenter || '').toLowerCase();
    const matchedCenterBranch = matchBranchByToken(entrySalesCenter);

    const sortedParties = [...(parties || [])].sort((a, b) => {
      const aMatch =
        (matchedCenterBranch && a.branchId === matchedCenterBranch.id) ||
        cleanBranchName(a.branchName || '').toLowerCase() === centerClean;
      const bMatch =
        (matchedCenterBranch && b.branchId === matchedCenterBranch.id) ||
        cleanBranchName(b.branchName || '').toLowerCase() === centerClean;
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    if (!partySearchQuery.trim()) return sortedParties.slice(0, 40);
    const q = partySearchQuery.toLowerCase().trim();
    return sortedParties
      .filter((p) => {
        return (
          (p.name || '').toLowerCase().includes(q) ||
          (p.address || '').toLowerCase().includes(q) ||
          (p.salespersonName || '').toLowerCase().includes(q) ||
          (p.salesmanCode || '').toLowerCase().includes(q) ||
          (p.branchName || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 40);
  }, [parties, partySearchQuery, entrySalesCenter, matchBranchByToken]);

  const toggleExpandCenter = (centerKey: string) => {
    setExpandedCenters((prev) => ({
      ...prev,
      [centerKey]: !prev[centerKey]
    }));
  };

  const allCentersExpanded =
    salesCenterGroups.length > 0 && salesCenterGroups.every((g) => Boolean(expandedCenters[g.centerKey]));

  const handleToggleExpandAllCenters = () => {
    if (allCentersExpanded) {
      setExpandedCenters({});
    } else {
      const next: Record<string, boolean> = {};
      salesCenterGroups.forEach((g) => {
        next[g.centerKey] = true;
      });
      setExpandedCenters(next);
    }
  };

  // Open adjustment modal (Sales Center wise + Month aware)
  const handleOpenPartyEntryModal = (
    targetMonth?: string,
    centerTotalAmount?: number,
    existing?: {
      adjustmentKey?: string;
      salesCenter?: string;
      partyName?: string;
      collectionDate?: string;
      collectionAmount?: number;
      remarks?: string;
      mrNo?: string;
      marketingPerson?: string;
    }
  ) => {
    setPartyEntryError(null);
    setIsPartySearchOpen(false);

    const resolvedCenterName =
      cleanBranchName(
        existing?.salesCenter ||
          (!selectedEntityTarget.isAll
            ? selectedEntityTarget.branch?.name || selectedEntity
            : salesCenterGroups[0]?.centerName || allowedBranches[0]?.name || userBranchInfo?.branchName || 'Madhupur Sales Center')
      ) || 'Madhupur Sales Center';

    const effectiveMonth =
      targetMonth ||
      (selectedMonth !== 'all'
        ? selectedMonth
        : monthSummaries[0]?.monthKey || new Date().toISOString().slice(0, 7));

    setTargetMonthForAdjustment(effectiveMonth);

    const centerGroupMatch = salesCenterGroups.find(
      (g) => g.centerKey === resolvedCenterName.toLowerCase()
    );
    const expTotal =
      centerTotalAmount !== undefined
        ? centerTotalAmount
        : centerGroupMatch?.total || monthSummaries.find((m) => m.monthKey === effectiveMonth)?.totalExpenses || 0;
    setTargetMonthExpenseTotal(expTotal);

    const compositeKey = existing?.adjustmentKey || buildAdjustmentKey(resolvedCenterName, effectiveMonth);
    const savedExisting = effectiveAdjustments[compositeKey];
    setEditingAdjustmentKey(existing?.adjustmentKey || (savedExisting ? compositeKey : null));

    const [y, m] = effectiveMonth.split('-');
    const mObj = new Date(parseInt(y, 10) || new Date().getFullYear(), (parseInt(m, 10) || 1) - 1, 1);
    const mDisp = mObj.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    const activeExisting = existing?.partyName
      ? existing
      : savedExisting
      ? {
          partyName: savedExisting.partyName,
          collectionDate: savedExisting.collectionDate,
          collectionAmount: savedExisting.collectionAmount,
          remarks: savedExisting.remarks,
          mrNo: savedExisting.mrNo,
          marketingPerson: savedExisting.marketingPerson
        }
      : undefined;

    if (activeExisting && activeExisting.partyName) {
      setEntryPartyName(activeExisting.partyName || '');
      setPartySearchQuery(activeExisting.partyName || '');
      setEntryCollectionDate(formatDateDDMMYY(activeExisting.collectionDate) || formatDateDDMMYY(new Date()));
      setEntryAmount(String(activeExisting.collectionAmount || expTotal || ''));
      setEntryRemarks(
        activeExisting.remarks || `Monthly expense adjustment (${resolvedCenterName} - ${mDisp})`
      );
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
      setEntryRemarks(`Monthly expense adjustment (${resolvedCenterName} - ${mDisp})`);
    }

    const initialPartyName = activeExisting?.partyName || '';
    const matchedParty = initialPartyName
      ? parties.find((p) => p.name.trim().toLowerCase() === initialPartyName.trim().toLowerCase())
      : undefined;
    const centerSp = allSalespersons.find(
      (s) => cleanBranchName(s.branchName || '').toLowerCase() === resolvedCenterName.toLowerCase()
    );
    const initialMarketingPerson =
      activeExisting?.marketingPerson ||
      matchedParty?.salespersonName ||
      (matchedParty?.salesmanCode
        ? allSalespersons.find((s) => s.code.toLowerCase() === matchedParty.salesmanCode?.toLowerCase())?.name
        : undefined) ||
      centerSp?.name ||
      allSalespersons[0]?.name ||
      '';
    const initialAddress = matchedParty?.address || resolvedCenterName;

    setEntryAddress(initialAddress);
    setEntryMarketingPerson(initialMarketingPerson);
    setEntrySalesCenter(resolvedCenterName);

    const nextAutoMr = computeNextSalesCenterMrNo(
      collections,
      resolvedCenterName,
      branches,
      parties,
      allSalespersons
    );
    setEntryMrNo(activeExisting?.mrNo || nextAutoMr);
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
      if (!entrySalesCenter.trim() && matched.branchName) {
        setEntrySalesCenter(matched.branchName);
        setEntryMrNo(
          computeNextSalesCenterMrNo(collections, matched.branchName, branches, parties, allSalespersons)
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

    const cleanCenter = cleanBranchName(entrySalesCenter.trim() || 'Madhupur Sales Center');
    const centerSlug = toCenterSlug(cleanCenter);

    const targetMonth =
      targetMonthForAdjustment ||
      (parsedColIso && parsedColIso.length >= 7 ? parsedColIso.slice(0, 7) : new Date().toISOString().slice(0, 7));

    const [tY, tM] = targetMonth.split('-').map((v) => parseInt(v, 10));
    let nextYear = tY || new Date().getFullYear();
    let nextMonth = (tM || new Date().getMonth() + 1) + 1;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    const nextMonthStr = String(nextMonth).padStart(2, '0');
    const nextMonth01Iso = `${nextYear}-${nextMonthStr}-01`;
    const nextMonth01Ddmmyy = `01.${nextMonthStr}.${String(nextYear).slice(-2)}`;

    const matchedParty = parties.find((p) => p.name.trim().toLowerCase() === pName.toLowerCase());
    const resolvedSpName =
      entryMarketingPerson.trim() ||
      matchedParty?.salespersonName ||
      (matchedParty?.salesmanCode
        ? allSalespersons.find((s) => s.code.toLowerCase() === matchedParty.salesmanCode?.toLowerCase())?.name
        : '') ||
      allSalespersons[0]?.name ||
      '';
    const resolvedSpCode =
      matchedParty?.salesmanCode ||
      allSalespersons.find((s) => s.name.toLowerCase() === resolvedSpName.toLowerCase())?.code ||
      '';

    const adjustmentKey = buildAdjustmentKey(cleanCenter, targetMonth);
    const prevAdj =
      (editingAdjustmentKey ? effectiveAdjustments[editingAdjustmentKey] : undefined) ||
      effectiveAdjustments[adjustmentKey];

    const newColId = prevAdj?.collectionId || `col-adj-${centerSlug}-${targetMonth}`;
    const newDepId = prevAdj?.depositId || `dep-adj-${centerSlug}-${targetMonth}`;

    const resolvedMrNo =
      entryMrNo.trim() ||
      computeNextSalesCenterMrNo(collections, cleanCenter, branches, parties, allSalespersons);

    const updatedAdjustment: MonthlyAdjustmentRecord = {
      adjustmentKey,
      monthKey: targetMonth,
      partyName: pName,
      collectionDate: formattedColDate,
      collectionAmount: numAmt,
      mrNo: resolvedMrNo,
      remarks: entryRemarks.trim() || `Monthly expense adjustment (${cleanCenter} - ${targetMonth})`,
      salesCenter: cleanCenter,
      salesCenterKey: cleanCenter.toLowerCase(),
      marketingPerson: resolvedSpName,
      depositId: newDepId,
      collectionId: newColId
    };

    const nextAdjustments = { ...monthlyAdjustments };
    if (editingAdjustmentKey && editingAdjustmentKey !== adjustmentKey) {
      delete nextAdjustments[editingAdjustmentKey];
    }
    nextAdjustments[adjustmentKey] = updatedAdjustment;

    setMonthlyAdjustments(nextAdjustments);
    try {
      localStorage.setItem('polycables_monthly_expense_adjustments', JSON.stringify(nextAdjustments));
    } catch {}

    const matchedBranchObj = matchBranchByToken(cleanCenter);

    const newCollection: CollectionMR & {
      adjustmentMonthKey?: string;
      adjustmentCollectionDate?: string;
    } = {
      id: newColId,
      mrNo: resolvedMrNo,
      date: nextMonth01Iso,
      partyName: pName,
      customerAddress: entryAddress.trim() || matchedParty?.address || cleanCenter,
      salespersonName: resolvedSpName,
      marketingPerson: resolvedSpName,
      salesmanCode: resolvedSpCode,
      salesCenter: cleanCenter,
      branchId: matchedBranchObj?.id,
      branchName: matchedBranchObj?.name || cleanCenter,
      entityName: cleanCenter,
      amount: numAmt,
      paymentType: 'cash',
      isDeposited: true,
      depositDate: nextMonth01Ddmmyy,
      depositBankTag: 'H/O',
      bankName: 'H/O',
      accountName: 'Head Office',
      isMonthlyExpenseAdjusted: true,
      bankDepositId: newDepId,
      remarks: entryRemarks.trim() || `Monthly Expense Adjustment (${cleanCenter} - ${targetMonth})`,
      type: 'money_receipt',
      adjustmentMonthKey: targetMonth,
      adjustmentCollectionDate: formattedColDate
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
      entityName: cleanCenter,
      branchId: matchedBranchObj?.id,
      branchName: matchedBranchObj?.name || cleanCenter,
      collectionMrId: newColId,
      depositType: 'Cash Deposit',
      remarks: entryRemarks.trim() || `Adjusted Monthly Expense (${cleanCenter} - ${targetMonth})`,
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

    setSuccessToast(
      `${cleanCenter} (${targetMonth}) adjusted with "${pName}" (${formattedColDate}) of ৳${numAmt.toLocaleString('en-IN')}! Scheduled as H/O deposit on ${nextMonth01Ddmmyy}.`
    );
    setTimeout(() => setSuccessToast(null), 5000);
    setIsPartyEntryModalOpen(false);
    setEditingAdjustmentKey(null);
  };

  const handleRemoveAdjustment = (adjKeyOrMonth: string, explicitAdj?: MonthlyAdjustmentRecord) => {
    const removedAdj = explicitAdj || effectiveAdjustments[adjKeyOrMonth] || monthlyAdjustments[adjKeyOrMonth];
    const centerName = removedAdj?.salesCenter || '';
    const monthKey = removedAdj?.monthKey || adjKeyOrMonth;
    const centerSlug = centerName ? toCenterSlug(centerName) : '';

    setMonthlyAdjustments((prev) => {
      const nextAdj = { ...prev };
      delete nextAdj[adjKeyOrMonth];
      if (removedAdj?.adjustmentKey) delete nextAdj[removedAdj.adjustmentKey];
      if (centerName && monthKey) {
        delete nextAdj[buildAdjustmentKey(centerName, monthKey)];
      }
      try {
        localStorage.setItem('polycables_monthly_expense_adjustments', JSON.stringify(nextAdj));
      } catch {}
      return nextAdj;
    });

    const targetColId =
      removedAdj?.collectionId || (centerSlug ? `col-adj-${centerSlug}-${monthKey}` : `col-adj-${monthKey}`);
    const targetDepId =
      removedAdj?.depositId || (centerSlug ? `dep-adj-${centerSlug}-${monthKey}` : `dep-adj-${monthKey}`);

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
            !(
              c.isMonthlyExpenseAdjusted &&
              c.partyName === removedAdj?.partyName &&
              cleanBranchName(c.salesCenter || '').toLowerCase() === cleanBranchName(centerName).toLowerCase() &&
              (c.remarks || '').includes(monthKey)
            )
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
            !(
              d.id.startsWith('dep-adj-') &&
              d.partyName === removedAdj?.partyName &&
              cleanBranchName(d.branchName || d.entityName || '').toLowerCase() ===
                cleanBranchName(centerName).toLowerCase() &&
              (d.remarks || '').includes(monthKey)
            )
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

    setSuccessToast(`Adjustment removed for ${centerName ? `${centerName} (${monthKey})` : monthKey}.`);
    setTimeout(() => setSuccessToast(null), 3500);
  };

  const handleExportExcel = () => {
    const dataRows = visibleExpenseRows.map(({ item, resolvedCenter, monthDisplay }, idx) => {
      const autoMonth = getAutoMonthName(item.date, item.billingMonth);
      return {
        'SL #': idx + 1,
        'Date': formatDateDDMMYY(item.date),
        'Month Period': monthDisplay,
        'Sales Center': resolvedCenter.name || 'N/A',
        'Expense Head': item.expenseHead || 'N/A',
        'Staff / Person': item.staffName || item.marketingPerson || item.personName || (item.entityType === 'marketing' ? item.entityName : '-') || '-',
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

  const hasAnyActiveFilter = Boolean(
    selectedMonth !== 'all' ||
      fromDate ||
      toDate ||
      searchTerm.trim() ||
      (canViewAllCenters && !selectedEntityTarget.isAll)
  );

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
            <p className="text-[11px] font-semibold text-slate-400">
              Sales center wise totals, date-serial expandable vouchers & party collection adjustments
            </p>
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
              {visibleExpenseRows.length} vouchers across {salesCenterGroups.length} sales center
              {salesCenterGroups.length === 1 ? '' : 's'}
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
              Remaining Unadjusted: ৳{Math.max(0, aggregateTotals.totalExp - aggregateTotals.totalPartyCol).toLocaleString('en-IN')}
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
              onClick={() => setActiveTab('sales_centers')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                activeTab === 'sales_centers'
                  ? 'bg-[#0e2d42] text-cyan-200 border border-cyan-400/60 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sales Center Wise ({salesCenterGroups.length})
            </button>
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
              Party Settlements ({settlementRows.length})
            </button>
          </div>

          {/* Quick Month Selector */}
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-slate-300">Month:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-xs font-bold text-white bg-[#061520] border border-cyan-500/30 rounded-xl px-2.5 py-1.5 focus:ring-2 focus:ring-cyan-400 cursor-pointer"
            >
              <option value="all">All Available Months</option>
              {availableMonthsList.map((m) => (
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
              <label htmlFor="input-exp-from" className="text-xs font-bold text-slate-300">
                From:
              </label>
              <DateInputWithPicker
                id="input-exp-from"
                inputRef={fromDateInputRef}
                value={fromDate}
                valueFormat="iso"
                theme="dark"
                onChange={(val) => setFromDate(val)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (toDateInputRef.current) toDateInputRef.current.focus();
                    handleApplyDateFilter();
                  }
                }}
                className="w-[122px]"
                inputClassName="text-xs font-bold text-white bg-[#061520] border border-cyan-500/30 rounded-xl px-2 py-1"
                title="Pick From Date (dd.mm.yy)"
              />
            </div>

            <div className="flex items-center space-x-1.5">
              <label htmlFor="input-exp-to" className="text-xs font-bold text-slate-300">
                To:
              </label>
              <DateInputWithPicker
                id="input-exp-to"
                inputRef={toDateInputRef}
                value={toDate}
                valueFormat="iso"
                theme="dark"
                onChange={(val) => setToDate(val)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleApplyDateFilter();
                  }
                }}
                className="w-[122px]"
                inputClassName="text-xs font-bold text-white bg-[#061520] border border-cyan-500/30 rounded-xl px-2 py-1"
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

            {hasAnyActiveFilter && (
              <button
                type="button"
                onClick={handleResetAllFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/40 rounded-xl text-xs font-bold cursor-pointer"
                title="Reset all filters"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SalesCenterSearchFilter
              value={selectedEntity}
              onChange={(val) => setSelectedEntity(val)}
              branches={allowedBranches}
              isLocked={!canViewAllCenters}
              lockedReason={`Locked to assigned sales center: ${selectedEntityTarget.branch?.name || selectedEntity}`}
              includeAllOption={canViewAllCenters}
              allOptionLabel={isSuper ? 'All Sales Centers' : `All My Centers (${allowedBranches.length})`}
              allOptionValue="all"
              label="Sales Center:"
              theme="dark"
              size="sm"
              widthClass="min-w-[180px] max-w-[240px]"
            />

            <div className="relative w-56">
              <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search head, center, remarks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-xs pl-8 pr-7 py-1.5 border border-cyan-500/30 rounded-xl bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
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

      {/* TAB CONTENT 1: SALES CENTER WISE SUMMARY (CLICK TO EXPAND DATE SERIAL WISE + ADJUST PARTY) */}
      {activeTab === 'sales_centers' && (
        <div className="cyber-glass-card rounded-2xl overflow-hidden text-white">
          <div className="p-3 sm:p-4 bg-[#0c2638]/90 border-b border-cyan-500/25 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-black text-white uppercase tracking-wide flex items-center gap-2">
                <Building2 className="w-4 h-4 text-cyan-300" />
                <span>Sales Center Wise Total Expense ({salesCenterGroups.length})</span>
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Click any Sales Center row to expand its vouchers in Date Serial Wise order, or adjust its total with Party Name & Collection Date.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDateSerialSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#061520] hover:bg-[#0e2d42] text-cyan-200 border border-cyan-500/30 rounded-lg text-[11px] font-bold cursor-pointer"
                title="Toggle Date Serial sorting order"
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-cyan-400" />
                <span>Date Serial: {dateSerialSortDir === 'asc' ? 'Oldest → Newest' : 'Newest → Oldest'}</span>
              </button>

              {salesCenterGroups.length > 0 && (
                <button
                  type="button"
                  onClick={handleToggleExpandAllCenters}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#061520] hover:bg-[#0e2d42] text-slate-200 border border-cyan-500/30 rounded-lg text-[11px] font-bold cursor-pointer"
                >
                  {allCentersExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  <span>{allCentersExpanded ? 'Collapse All' : 'Expand All'}</span>
                </button>
              )}

              <span className="text-xs font-mono font-black text-cyan-200 bg-[#061520] border border-cyan-500/30 px-2.5 py-1 rounded-lg">
                Grand Total: ৳{aggregateTotals.totalExp.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {salesCenterGroups.length === 0 ? (
            <div className="p-8 text-center text-slate-400 italic text-xs">
              No sales center expenses matching the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-200 border-collapse">
                <thead>
                  <tr className="bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-3 w-10 text-center"></th>
                    <th className="py-2.5 px-2 text-center w-10">SL</th>
                    <th className="py-2.5 px-3">Sales Center</th>
                    <th className="py-2.5 px-3 text-center">Vouchers</th>
                    <th className="py-2.5 px-3 text-right">Staff</th>
                    <th className="py-2.5 px-3 text-right">Utilities</th>
                    <th className="py-2.5 px-3 text-right">Total Expense</th>
                    <th className="py-2.5 px-3">Adjusted Party & Collection Date</th>
                    <th className="py-2.5 px-3 text-right">Adjusted / Remaining</th>
                    <th className="py-2.5 px-3 text-center">Party Adjust</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/20 bg-[#071824]/60">
                  {salesCenterGroups.map((group, gIdx) => {
                    const isExpanded = Boolean(expandedCenters[group.centerKey]);
                    const hasAdj = group.adjustments.length > 0;
                    const primaryAdj = group.adjustments[0];
                    const dateRangeLabel =
                      group.minDateIso && group.maxDateIso
                        ? group.minDateIso === group.maxDateIso
                          ? formatDateDDMMYY(group.minDateIso)
                          : `${formatDateDDMMYY(group.minDateIso)} – ${formatDateDDMMYY(group.maxDateIso)}`
                        : '-';

                    return (
                      <React.Fragment key={group.centerKey}>
                        <tr
                          onClick={() => toggleExpandCenter(group.centerKey)}
                          className={`cursor-pointer transition-colors ${
                            isExpanded
                              ? 'bg-[#0d2c42]/90 border-l-2 border-l-cyan-400'
                              : 'hover:bg-cyan-500/[0.08]'
                          }`}
                          title="Click to expand/collapse Date Serial Wise vouchers"
                        >
                          <td className="py-3 px-3 text-center">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-[#061520] border border-cyan-500/30 text-cyan-300">
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-center font-mono font-bold text-slate-400">{gIdx + 1}</td>
                          <td className="py-3 px-3">
                            <div className="font-black text-white text-sm flex items-center gap-1.5">
                              <span>{group.centerName}</span>
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                              Period: {dateRangeLabel}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className="px-2 py-0.5 bg-[#061520] text-cyan-200 border border-cyan-500/30 rounded-full font-mono font-bold text-[11px]">
                              {group.items.length}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-semibold text-cyan-200 whitespace-nowrap">
                            ৳{group.staffTotal.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-semibold text-amber-200 whitespace-nowrap">
                            ৳{group.utilityTotal.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-black text-base text-rose-300 bg-cyan-500/[0.04] whitespace-nowrap">
                            ৳{group.total.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-3">
                            {hasAdj ? (
                              <div className="space-y-1">
                                {group.adjustments.map((adj, aIdx) => (
                                  <div
                                    key={adj.adjustmentKey || `${adj.monthKey}-${aIdx}`}
                                    className="inline-flex flex-wrap items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/35 text-[11px]"
                                  >
                                    <span className="font-black text-emerald-200">{adj.partyName}</span>
                                    <span className="text-slate-400">•</span>
                                    <span className="font-mono font-bold text-cyan-200">
                                      {formatDateDDMMYY(adj.collectionDate)}
                                    </span>
                                    {group.adjustments.length > 1 && (
                                      <span className="text-[10px] font-mono text-emerald-300">
                                        (৳{Number(adj.collectionAmount || 0).toLocaleString('en-IN')})
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-500 italic text-[11px]">Pending Party Adjustment</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                            {hasAdj ? (
                              <div>
                                <div className="text-xs font-black text-emerald-300">
                                  Adj: ৳{group.adjustedAmount.toLocaleString('en-IN')}
                                </div>
                                <div
                                  className={`text-[10px] font-bold ${
                                    group.remainingAmount <= 0 ? 'text-emerald-400' : 'text-amber-300'
                                  }`}
                                >
                                  {group.remainingAmount <= 0
                                    ? `Settled (+৳${Math.abs(group.remainingAmount).toLocaleString('en-IN')})`
                                    : `Rem: ৳${group.remainingAmount.toLocaleString('en-IN')}`}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                          <td
                            className="py-3 px-3 text-center whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {hasAdj && primaryAdj ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleOpenPartyEntryModal(primaryAdj.monthKey || group.targetMonthKey, group.total, {
                                      adjustmentKey:
                                        primaryAdj.adjustmentKey ||
                                        buildAdjustmentKey(group.centerName, primaryAdj.monthKey || group.targetMonthKey),
                                      salesCenter: group.centerName,
                                      partyName: primaryAdj.partyName,
                                      collectionDate: primaryAdj.collectionDate,
                                      collectionAmount: primaryAdj.collectionAmount,
                                      remarks: primaryAdj.remarks,
                                      mrNo: primaryAdj.mrNo,
                                      marketingPerson: primaryAdj.marketingPerson
                                    })
                                  }
                                  className="px-2.5 py-1 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/35 rounded-lg font-bold text-[11px] cursor-pointer"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemoveAdjustment(
                                      primaryAdj.adjustmentKey ||
                                        buildAdjustmentKey(group.centerName, primaryAdj.monthKey || group.targetMonthKey),
                                      primaryAdj
                                    )
                                  }
                                  className="p-1.5 bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-400/30 rounded-lg cursor-pointer"
                                  title="Remove adjustment"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  handleOpenPartyEntryModal(group.targetMonthKey, group.total, {
                                    salesCenter: group.centerName
                                  })
                                }
                                className="px-3 py-1 bg-emerald-500/25 hover:bg-emerald-500/35 text-emerald-200 border border-emerald-400/40 rounded-lg font-black text-[11px] cursor-pointer shadow-2xs"
                              >
                                Adjust Party
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* EXPANDED DATE SERIAL WISE VOUCHERS */}
                        {isExpanded && (
                          <tr className="bg-[#05121b]/95">
                            <td colSpan={10} className="p-3 sm:p-4 border-b border-cyan-400/30">
                              <div className="rounded-xl border border-cyan-500/30 overflow-hidden bg-[#061520]">
                                <div className="px-3.5 py-2.5 bg-[#0a2233] border-b border-cyan-500/25 flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <Calendar className="w-3.5 h-3.5 text-cyan-300" />
                                    <span className="text-xs font-black text-cyan-100 uppercase tracking-wide">
                                      Date Serial Wise Vouchers — {group.centerName} ({group.items.length})
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3 text-[11px]">
                                    <span className="text-slate-300">
                                      Order: <strong className="text-cyan-300">{dateSerialSortDir === 'asc' ? 'Date Ascending (1 → N)' : 'Date Descending'}</strong>
                                    </span>
                                    <span className="font-mono font-black text-rose-300 bg-[#061520] px-2.5 py-0.5 rounded border border-cyan-500/30">
                                      Center Total: ৳{group.total.toLocaleString('en-IN')}
                                    </span>
                                  </div>
                                </div>

                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-xs text-slate-200 border-collapse">
                                    <thead>
                                      <tr className="bg-[#081b29] text-cyan-200 border-b border-cyan-500/25 font-bold uppercase text-[10px]">
                                        <th className="py-2 px-3 w-12 text-center">SL</th>
                                        <th className="py-2 px-3">Date</th>
                                        <th className="py-2 px-3">Expense Head</th>
                                        <th className="py-2 px-3">Staff / Person</th>
                                        <th className="py-2 px-3">Billing Month</th>
                                        <th className="py-2 px-3">Area</th>
                                        <th className="py-2 px-3">Remarks</th>
                                        <th className="py-2 px-3 text-right">Amount (Tk)</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-cyan-500/15">
                                      {group.items.map((item, idx) => {
                                        const autoMonth = getAutoMonthName(item.date, item.billingMonth);
                                        return (
                                          <tr key={item.id || idx} className="hover:bg-cyan-500/[0.06]">
                                            <td className="py-1.5 px-3 text-center font-mono font-bold text-cyan-300">
                                              {idx + 1}
                                            </td>
                                            <td className="py-1.5 px-3 font-mono font-semibold text-white whitespace-nowrap">
                                              {formatDateDDMMYY(item.date)}
                                            </td>
                                            <td className="py-1.5 px-3 font-bold text-cyan-200">
                                              {item.expenseHead || '-'}
                                            </td>
                                            <td className="py-1.5 px-3 text-slate-200 font-semibold">
                                              {item.staffName ||
                                                item.marketingPerson ||
                                                item.personName ||
                                                (item.entityType === 'marketing' ? item.entityName : '-') ||
                                                '-'}
                                            </td>
                                            <td className="py-1.5 px-3">
                                              {autoMonth ? (
                                                <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-200 border border-cyan-400/30 rounded font-bold text-[10px]">
                                                  {autoMonth}
                                                </span>
                                              ) : (
                                                '-'
                                              )}
                                            </td>
                                            <td className="py-1.5 px-3 text-slate-300 text-[11px]">
                                              {item.area || '-'}
                                            </td>
                                            <td
                                              className="py-1.5 px-3 text-slate-400 text-[11px] truncate max-w-xs"
                                              title={item.remarks || ''}
                                            >
                                              {item.remarks || '-'}
                                            </td>
                                            <td className="py-1.5 px-3 text-right font-mono font-black text-rose-300 bg-cyan-500/[0.04] whitespace-nowrap">
                                              ৳{Number(item.amount || 0).toLocaleString('en-IN')}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                    <tfoot>
                                      <tr className="bg-[#0a2233] border-t border-cyan-500/30 font-black">
                                        <td colSpan={7} className="py-2 px-3 text-right text-cyan-200 uppercase text-[11px]">
                                          {group.centerName} Total ({group.items.length} vouchers):
                                        </td>
                                        <td className="py-2 px-3 text-right font-mono text-sm text-rose-300 whitespace-nowrap">
                                          ৳{group.total.toLocaleString('en-IN')}
                                        </td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT 2: ALL EXPENSES TABLE (DATE SERIAL WISE) */}
      {activeTab === 'all' && (
        <div className="cyber-glass-card rounded-2xl overflow-hidden text-white">
          <div className="p-3 sm:p-4 bg-[#0c2638]/90 border-b border-cyan-500/25 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-black text-white uppercase tracking-wide">
              Detailed Expense Vouchers — Date Serial Wise ({visibleExpenseRows.length})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDateSerialSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#061520] hover:bg-[#0e2d42] text-cyan-200 border border-cyan-500/30 rounded-lg text-[11px] font-bold cursor-pointer"
              >
                <ArrowUpDown className="w-3 h-3" />
                <span>{dateSerialSortDir === 'asc' ? 'Oldest → Newest' : 'Newest → Oldest'}</span>
              </button>
              <span className="text-xs font-mono font-black text-cyan-200 bg-[#061520] border border-cyan-500/30 px-2.5 py-0.5 rounded-lg">
                Total: ৳{aggregateTotals.totalExp.toLocaleString('en-IN')}
              </span>
            </div>
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
                  visibleExpenseRows.map(({ item, resolvedCenter }, idx) => {
                    const autoMonth = getAutoMonthName(item.date, item.billingMonth);
                    return (
                      <tr key={item.id || idx} className="hover:bg-cyan-500/[0.06] transition-colors">
                        <td className="py-2 px-3 text-center font-mono text-slate-400 font-bold">{idx + 1}</td>
                        <td className="py-2 px-3 font-mono font-semibold text-white whitespace-nowrap">
                          {formatDateDDMMYY(item.date)}
                        </td>
                        <td className="py-2 px-3 font-bold text-white">{resolvedCenter.name}</td>
                        <td className="py-2 px-3 font-bold text-cyan-200">
                          <span className="px-2 py-0.5 bg-[#0b2334] rounded border border-cyan-500/30 font-semibold text-[11px]">
                            {item.expenseHead || 'General Expense'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-200 font-medium">
                          {item.staffName ||
                            item.marketingPerson ||
                            item.personName ||
                            (item.entityType === 'marketing' ? item.entityName : '-') ||
                            '-'}
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

      {/* TAB CONTENT 3: CATEGORY HEAD BREAKDOWN */}
      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categoryGroups.length === 0 ? (
            <div className="col-span-full cyber-glass-card p-8 rounded-2xl text-center text-slate-400 italic text-xs">
              No category expenses matching the selected filters.
            </div>
          ) : (
            categoryGroups.map(([catName, group]) => (
              <div
                key={catName}
                className="cyber-glass-subcard p-4 rounded-2xl border border-cyan-500/25 hover:border-cyan-400/50 transition-colors flex flex-col justify-between text-white"
              >
                <div>
                  <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
                    <h4 className="font-black text-white text-sm">{catName}</h4>
                    <span className="text-[11px] font-bold text-cyan-200 bg-[#061520] border border-cyan-500/25 px-2 py-0.5 rounded">
                      {group.count} entries
                    </span>
                  </div>
                  <div className="mt-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">
                      Total Expenditure
                    </span>
                    <div className="text-xl font-black text-rose-300 font-mono mt-0.5">
                      ৳{group.total.toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-cyan-500/20 text-[11px] text-slate-400 flex items-center justify-between">
                  <span>Avg: ৳{Math.round(group.total / (group.count || 1)).toLocaleString('en-IN')} / entry</span>
                  <span className="font-semibold text-cyan-300">
                    {((group.total / (aggregateTotals.totalExp || 1)) * 100).toFixed(1)}% of total
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB CONTENT 4: SALES CENTER WISE PARTY SETTLEMENTS */}
      {activeTab === 'settlement' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 cyber-glass-card p-4 rounded-2xl text-white">
            <div>
              <h3 className="text-sm font-black text-white uppercase">
                Sales Center Wise Party Collection Settlement
              </h3>
              <p className="text-xs text-slate-400">
                Adjust each Sales Center&apos;s monthly total expense with a Party Name & Collection Date (auto-deposits to Head Office on the 1st)
              </p>
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
                    <th className="py-2.5 px-3">Sales Center</th>
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
                  {settlementRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400 italic">
                        No sales center expense settlements matching the selected filters.
                      </td>
                    </tr>
                  ) : (
                    settlementRows.map((row, idx) => {
                      const adj = row.adjustment;
                      const isAdjusted = Boolean(adj && adj.partyName);
                      const colAmt = adj ? Number(adj.collectionAmount) || 0 : 0;
                      const netRemaining = colAmt - row.totalExpenses;

                      return (
                        <tr key={row.rowKey} className="hover:bg-cyan-500/[0.06] transition-colors">
                          <td className="py-2 px-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                          <td className="py-2 px-3 font-black text-white">{row.centerName}</td>
                          <td className="py-2 px-3 font-bold text-white whitespace-nowrap">
                            {row.monthDisplay}
                            <span className="block text-[10px] text-slate-400 font-mono">{row.monthKey}</span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-black text-rose-300">
                            ৳{row.totalExpenses.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2 px-3 font-bold text-white">
                            {isAdjusted && adj ? (
                              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 rounded font-bold text-xs">
                                {adj.partyName}
                              </span>
                            ) : (
                              <span className="text-slate-500 font-semibold italic text-xs">Pending</span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-mono font-semibold text-slate-200">
                            {isAdjusted && adj?.collectionDate ? formatDateDDMMYY(adj.collectionDate) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-black text-emerald-300">
                            {isAdjusted ? `৳${colAmt.toLocaleString('en-IN')}` : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-black">
                            {isAdjusted ? (
                              <span className={netRemaining >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                                ৳{netRemaining.toLocaleString('en-IN')}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#061520] text-cyan-200 border border-cyan-500/30 font-mono">
                              {row.nextMonth01}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center">
                            {isAdjusted && adj ? (
                              <div className="flex items-center justify-center space-x-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleOpenPartyEntryModal(row.monthKey, row.totalExpenses, {
                                      adjustmentKey:
                                        adj.adjustmentKey || buildAdjustmentKey(row.centerName, row.monthKey),
                                      salesCenter: row.centerName,
                                      partyName: adj.partyName,
                                      collectionDate: adj.collectionDate,
                                      collectionAmount: adj.collectionAmount,
                                      remarks: adj.remarks,
                                      mrNo: adj.mrNo,
                                      marketingPerson: adj.marketingPerson
                                    })
                                  }
                                  className="px-2 py-1 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/30 rounded font-bold text-xs cursor-pointer"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemoveAdjustment(
                                      adj.adjustmentKey || buildAdjustmentKey(row.centerName, row.monthKey),
                                      adj
                                    )
                                  }
                                  className="p-1 hover:bg-rose-500/20 text-rose-300 rounded cursor-pointer"
                                  title="Clear adjustment"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  handleOpenPartyEntryModal(row.monthKey, row.totalExpenses, {
                                    salesCenter: row.centerName
                                  })
                                }
                                className="px-2.5 py-1 bg-emerald-500/25 hover:bg-emerald-500/35 text-emerald-200 border border-emerald-400/40 rounded font-bold text-xs cursor-pointer shadow-2xs"
                              >
                                Adjust
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
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
                  Adjust Sales Center Expense with Party Collection
                </h3>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">
                  <strong className="text-cyan-200">{entrySalesCenter}</strong> • Month:{' '}
                  <strong className="text-cyan-200">{targetMonthForAdjustment}</strong> (Expense: ৳
                  {targetMonthExpenseTotal.toLocaleString('en-IN')})
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsPartyEntryModalOpen(false);
                  setEditingAdjustmentKey(null);
                }}
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
                    onBlur={() => setTimeout(() => setIsPartySearchOpen(false), 180)}
                    className="w-full text-xs font-bold text-white bg-[#061520] border border-cyan-500/30 rounded-xl px-3 py-2 placeholder-slate-400 focus:ring-2 focus:ring-cyan-400"
                  />
                  {isPartySearchOpen && filteredPartiesForSearch.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-[#081c29] border border-cyan-500/35 rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto divide-y divide-cyan-500/15">
                      {filteredPartiesForSearch.map((p) => (
                        <div
                          key={p.id}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handlePartySelectChange(p.name);
                            setIsPartySearchOpen(false);
                          }}
                          className="p-2 hover:bg-cyan-500/15 cursor-pointer text-xs"
                        >
                          <div className="font-black text-white">{p.name}</div>
                          <div className="text-[11px] text-slate-400">
                            {p.branchName ? `${p.branchName} • ` : ''}
                            {p.address || 'No address'} • {p.salespersonName || 'No officer'}
                          </div>
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
                  <label className="text-xs font-black text-slate-300">Adjusted Collection Amount (৳) *</label>
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
                  onClick={() => {
                    setIsPartyEntryModalOpen(false);
                    setEditingAdjustmentKey(null);
                  }}
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
