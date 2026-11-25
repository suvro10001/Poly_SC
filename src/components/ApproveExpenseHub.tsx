import React, { useState, useMemo, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  Building2,
  Search,
  ArrowLeft,
  X,
  Printer,
  Download,
  ShieldCheck,
  Users,
  Calendar,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  RotateCcw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { ExpenseEntry, AuthUser, BranchLocation, Salesperson, CompanyDetails, Party } from '../types';
import { formatDateDDMMYY, parseDateToISO, getRunningMonthRange } from '../utils/dateUtils';
import {
  isStrictSuperAdmin,
  isSuperAdminOrAgm,
  isInCharge,
  isAnyAdmin,
  isAdminSalesperson,
  isAdminMarketingLabel,
  isMarketingOfficer,
  getAdminBranches,
  getUserBranch,
  cleanBranchName
} from '../utils/branchAccess';
import { triggerAutoConfiguredPrint } from '../utils/printerAutoConfig';

const isAllSalesCentersLabel = (val?: string | null): boolean => {
  const cleaned = cleanBranchName(String(val || '')).trim().toLowerCase();
  if (!cleaned) return true;
  return (
    cleaned === 'all' ||
    cleaned === 'all branches' ||
    cleaned === 'all sales center' ||
    cleaned === 'all sales centers' ||
    cleaned.startsWith('all sales center')
  );
};

const isExcludedConveyanceOrLunchExpense = (exp?: ExpenseEntry | null): boolean => {
  if (!exp) return true;
  const anyExp = exp as any;
  if (Boolean(anyExp.isConveyance || anyExp.isLunchBill || anyExp.conveyanceId)) {
    return true;
  }
  const entTypeLow = String(anyExp.entityType || '').trim().toLowerCase();
  if (entTypeLow === 'conveyance' || entTypeLow === 'tiffin' || entTypeLow === 'lunch') {
    return true;
  }

  const typeFields = [
    anyExp.sourceType,
    anyExp.voucherType,
    anyExp.category,
    anyExp.expenseCategory,
    anyExp.subCategory,
    anyExp.voucherCategory,
    anyExp.entryCategory,
    anyExp.expenseType,
    anyExp.billType,
    anyExp.module,
    anyExp.headCategory,
    anyExp.type,
    anyExp.entryType
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' ');

  if (
    /conveyance|convayance|conveyence|tiffin|tiffen|tifin|lunch|daily[\s_-]*allowance|day[\s_-]*allowance|tour[\s_-]*voucher|hotel[\s_-]*bill|\bta[\s\/_-]*da\b/i.test(
      typeFields
    )
  ) {
    return true;
  }

  const headFields = [
    exp.expenseHead,
    anyExp.head,
    anyExp.title,
    anyExp.itemName,
    anyExp.expenseName,
    anyExp.voucherTitle,
    anyExp.purpose,
    anyExp.subHead
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' ');

  if (
    /conveyance|convayance|conveyence|tiffin|tiffen|tifin|lunch|day[\s_-]*allowance|daily[\s_-]*allowance|hotel[\s_-]*bill|tour[\s_-]*voucher|\bconv\.?\s*(?:bill|exp|expense|voucher|allowance)?\b|\bta[\s\/_-]*da\b|\bda\s*bill\b/i.test(
      headFields
    )
  ) {
    return true;
  }

  const descFields = [
    anyExp.description,
    exp.remarks,
    anyExp.notes,
    anyExp.note,
    anyExp.particulars,
    anyExp.details,
    anyExp.narration,
    anyExp.memo,
    anyExp.reason
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' ');

  if (
    /\b(conveyance|convayance|conveyence|daily\s+conveyance|conv\.?\s*(?:bill|exp|expense|voucher|allowance)|tiffin|tiffen|tifin|lunch|lunch\s*bill|lunch\s*expense|lunch\s*allowance|staff\s*lunch|office\s*lunch|day\s*allowance|daily\s*allowance|auto\s*conveyance|conveyance\s*voucher|ta\s*\/?\s*da|da\s*bill)\b/i.test(
      descFields
    )
  ) {
    return true;
  }

  const idLow = String(exp.id || '').trim().toLowerCase();
  const voucherNoLow = String(anyExp.voucherNo || '').trim().toLowerCase();
  if (
    idLow.startsWith('conv-') ||
    idLow.startsWith('conveyance') ||
    voucherNoLow.startsWith('conv-') ||
    voucherNoLow.startsWith('conveyance')
  ) {
    return true;
  }

  return false;
};

const normalizeSalesCenterCoreKey = (val?: string | null): string => {
  const cleaned = cleanBranchName(String(val || ''))
    .replace(/\s+/g, ' ')
    .replace(/^(?:branch|sales\s*cent(?:er|re)|showroom|store|outlet|depot|office|zone|sc)\s*[:\-–—.]+\s*/i, '')
    .replace(/\((?:sales\s*cent(?:er|re)|showroom|branch|store|outlet|sc|main)\)/gi, ' ')
    .trim();
  const core = cleaned
    .replace(/\b(sales\s*cent(?:er|re)|showroom|branch|store|outlet|depot|office|cent(?:er|re)|sc)\b/gi, '')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return core || cleaned.toLowerCase();
};

interface ApproveExpenseHubProps {
  expenses: ExpenseEntry[];
  setExpenses: React.Dispatch<React.SetStateAction<ExpenseEntry[]>>;
  currentUser?: AuthUser | null;
  branches?: BranchLocation[];
  allBranches?: BranchLocation[];
  salespersons?: Salesperson[];
  allSalespersons?: Salesperson[];
  parties?: Party[];
  company?: CompanyDetails;
  onSyncCloud?: (dataSlice: Record<string, any>, immediate?: boolean) => void;
  onBack?: () => void;
  onClose?: () => void;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

function formatMonthLabel(monthISO: string): string {
  if (!monthISO || monthISO === 'all') return 'All Months';
  const [yr, mo] = monthISO.split('-');
  const mIdx = parseInt(mo, 10) - 1;
  if (!yr || isNaN(mIdx) || mIdx < 0 || mIdx > 11) return monthISO;
  return `${MONTH_NAMES[mIdx]} ${yr}`;
}

export const ApproveExpenseHub: React.FC<ApproveExpenseHubProps> = ({
  expenses = [],
  setExpenses,
  currentUser,
  branches = [],
  allBranches = [],
  salespersons = [],
  allSalespersons = [],
  parties = [],
  company,
  onSyncCloud,
  onBack,
  onClose
}) => {
  const isSuper = isStrictSuperAdmin(currentUser) || isSuperAdminOrAgm(currentUser);
  const isAdminUser = isSuper || isAnyAdmin(currentUser);

  const effectiveBranches = allBranches.length > 0 ? allBranches : branches;
  const effectiveSalespersons = allSalespersons.length > 0 ? allSalespersons : salespersons;

  const userInCharge = !isAdminUser && isInCharge(currentUser, effectiveSalespersons, effectiveBranches);
  const userBranchInfo = getUserBranch(currentUser, effectiveSalespersons, effectiveBranches);

  // Strictly resolve Sales Centers authorized for this user/admin
  const authorizedBranches = useMemo(() => {
    if (!currentUser) return [];
    if (isSuper) return effectiveBranches;

    if (isAdminUser) {
      const mapped = getAdminBranches(currentUser, effectiveBranches, effectiveSalespersons);
      const mappedIds = new Set(mapped.map((b) => b.id.toLowerCase().trim()));
      const userIdLow = (currentUser.id || '').trim().toLowerCase();
      const userNameLow = (currentUser.username || '').trim().toLowerCase();
      const fullNameLow = (currentUser.name || '').trim().toLowerCase();
      const spCodeLow = ((currentUser as any).salespersonCode || '').trim().toLowerCase();
      const assignedNames = new Set(
        ((currentUser as any).assignedBranchNames || []).map((n: string) => cleanBranchName(n).toLowerCase().trim()).filter(Boolean)
      );

      return effectiveBranches.filter((b) => {
        if (mappedIds.has(b.id.toLowerCase().trim())) return true;
        const bAdminId = (b.adminId || '').trim().toLowerCase();
        const bAssignedAdminId = (b.assignedAdminId || '').trim().toLowerCase();
        const bApproverId = (b.approverId || '').trim().toLowerCase();
        const bAdminUser = (b.adminUsername || '').trim().toLowerCase();
        const bAdminName = (b.adminName || '').trim().toLowerCase();
        const bApproverName = (b.approverName || '').trim().toLowerCase();
        const bClean = cleanBranchName(b.name).toLowerCase().trim();

        if (bAdminId && ((userIdLow && bAdminId === userIdLow) || (userNameLow && bAdminId === userNameLow) || (spCodeLow && bAdminId === spCodeLow))) return true;
        if (bAssignedAdminId && ((userIdLow && bAssignedAdminId === userIdLow) || (userNameLow && bAssignedAdminId === userNameLow) || (spCodeLow && bAssignedAdminId === spCodeLow))) return true;
        if (bApproverId && ((userIdLow && bApproverId === userIdLow) || (userNameLow && bApproverId === userNameLow) || (spCodeLow && bApproverId === spCodeLow))) return true;
        if (bAdminUser && ((userNameLow && bAdminUser === userNameLow) || (spCodeLow && bAdminUser === spCodeLow))) return true;
        if (bAdminName && fullNameLow && (bAdminName === fullNameLow || bAdminName.includes(fullNameLow) || fullNameLow.includes(bAdminName))) return true;
        if (bApproverName && fullNameLow && (bApproverName === fullNameLow || bApproverName.includes(fullNameLow))) return true;
        if (bClean && assignedNames.has(bClean)) return true;
        return false;
      });
    }

    if (userInCharge) {
      return effectiveBranches.filter(
        (b) =>
          (userBranchInfo.branchId && b.id.toLowerCase() === userBranchInfo.branchId.toLowerCase()) ||
          (userBranchInfo.branchName && cleanBranchName(b.name).toLowerCase() === cleanBranchName(userBranchInfo.branchName).toLowerCase())
      );
    }

    return [];
  }, [currentUser, isSuper, isAdminUser, userInCharge, userBranchInfo, effectiveBranches, effectiveSalespersons]);

  const authorizedBranchIds = useMemo(
    () => new Set(authorizedBranches.map((b) => b.id.toLowerCase().trim())),
    [authorizedBranches]
  );
  const authorizedBranchNames = useMemo(
    () => new Set(authorizedBranches.map((b) => cleanBranchName(b.name).toLowerCase().trim()).filter(Boolean)),
    [authorizedBranches]
  );
  const authorizedBranchCoreKeys = useMemo(
    () => new Set(authorizedBranches.map((b) => normalizeSalesCenterCoreKey(b.name)).filter(Boolean)),
    [authorizedBranches]
  );

  const visibleBranchCatalog = useMemo(() => {
    const byCore = new Map<string, BranchLocation>();
    authorizedBranches.forEach((b) => {
      if (!b || isAllSalesCentersLabel(b.name)) return;
      const core = normalizeSalesCenterCoreKey(b.name) || b.id.toLowerCase().trim();
      const existing = byCore.get(core);
      const cleanName = cleanBranchName(b.name).replace(/\s+/g, ' ').trim();
      if (!existing) {
        byCore.set(core, { ...b, name: cleanName || b.name });
      } else if (/sales\s*cent/i.test(cleanName) && !/sales\s*cent/i.test(existing.name)) {
        byCore.set(core, { ...b, name: cleanName });
      }
    });
    return Array.from(byCore.values());
  }, [authorizedBranches]);
  const visibleSalespersonCatalog = useMemo(() => {
    if (isSuper) return effectiveSalespersons;
    return effectiveSalespersons.filter((sp) => {
      const spBId = (sp.branchId || '').toLowerCase().trim();
      const spBName = cleanBranchName(sp.branchName || (sp as any).branch || '').toLowerCase().trim();
      return (spBId && authorizedBranchIds.has(spBId)) || (spBName && authorizedBranchNames.has(spBName));
    });
  }, [isSuper, effectiveSalespersons, authorizedBranchIds, authorizedBranchNames]);

  const runningMonth = useMemo(() => getRunningMonthRange(), []);

  // Optional single-center filter; empty ('') shows each authorized Sales Center individually (never an "All Sales Centers" group)
  const [selectedCenter, setSelectedCenter] = useState<string>(() => {
    if (!isAdminUser && userBranchInfo?.branchName) return userBranchInfo.branchName;
    if (authorizedBranches.length === 1) return authorizedBranches[0].name;
    return '';
  });

  useEffect(() => {
    if (isAdminUser) {
      if (authorizedBranches.length === 1) {
        setSelectedCenter(authorizedBranches[0].name);
      } else {
        setSelectedCenter('');
      }
    } else if (userBranchInfo?.branchName) {
      setSelectedCenter(userBranchInfo.branchName);
    }
  }, [currentUser?.username, currentUser?.role, isAdminUser, userBranchInfo?.branchName, authorizedBranches.length]);

  // Month filter defaults to current running month for Sales Center Monthly Expense expansion
  const [selectedMonth, setSelectedMonth] = useState<string>(() => runningMonth.monthISO);
  // Marketing Person section defaults to showing ALL expenses of his ('all_time'), or optionally current month
  const [personScope, setPersonScope] = useState<'all_time' | 'selected_month'>('all_time');

  const [activeSubTab, setActiveSubTab] = useState<'all' | 'pending' | 'history'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [rejectionModalExp, setRejectionModalExp] = useState<ExpenseEntry | null>(null);
  const [rejectionModalBatch, setRejectionModalBatch] = useState<{
    title: string;
    ids: string[];
  } | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [expandedCenters, setExpandedCenters] = useState<Set<string>>(() => new Set());
  const [expandedCenterDates, setExpandedCenterDates] = useState<Set<string>>(() => new Set());
  const [expandedPersons, setExpandedPersons] = useState<Set<string>>(() => new Set());

  const toggleCenterExpanded = (centerKey: string) => {
    setExpandedCenters((prev) => {
      const next = new Set(prev);
      if (next.has(centerKey)) next.delete(centerKey);
      else next.add(centerKey);
      return next;
    });
  };

  const toggleCenterDateExpanded = (centerDateKey: string) => {
    setExpandedCenterDates((prev) => {
      const next = new Set(prev);
      if (next.has(centerDateKey)) next.delete(centerDateKey);
      else next.add(centerDateKey);
      return next;
    });
  };

  const togglePersonExpanded = (personKey: string) => {
    setExpandedPersons((prev) => {
      const next = new Set(prev);
      if (next.has(personKey)) next.delete(personKey);
      else next.add(personKey);
      return next;
    });
  };

  // Available months dropdown choices (running month + any month appearing in expenses)
  const availableMonths = useMemo(() => {
    const set = new Set<string>([runningMonth.monthISO]);
    expenses.forEach((exp) => {
      if (isExcludedConveyanceOrLunchExpense(exp)) return;
      const iso = parseDateToISO(exp.date);
      if (iso && iso.length >= 7) {
        set.add(iso.slice(0, 7));
      }
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [expenses, runningMonth.monthISO]);

  // Helper to resolve Marketing Person metadata for an expense
  const resolveExpenseMarketingPerson = (
    exp: ExpenseEntry
  ): { personKey: string; personName: string; personCode: string; branchName: string } | null => {
    const rawPersonId = String(exp.createdById || '').trim();
    const rawPersonName = String(
      (exp as any).marketingPerson ||
        (exp as any).personName ||
        (exp as any).staffName ||
        (exp as any).salespersonName ||
        (exp.entityType === 'marketing' ? exp.entityName : '') ||
        exp.createdBy ||
        ''
    ).trim();

    let spMatch = visibleSalespersonCatalog.find(
      (s) =>
        (rawPersonId && (s.id === rawPersonId || (s.code && s.code.toLowerCase() === rawPersonId.toLowerCase()))) ||
        (rawPersonName && s.name.trim().toLowerCase() === rawPersonName.toLowerCase())
    );
    if (spMatch && isAdminSalesperson(spMatch)) return null;
    if (isAdminMarketingLabel(rawPersonName, visibleSalespersonCatalog)) return null;

    // Fallback: try matching against party's assigned salesperson if no explicit person was set and funding party is tagged
    if (!spMatch && !rawPersonName && exp.fundingPartyName) {
      const pMatch = parties.find(
        (p) => p.name.trim().toLowerCase() === String(exp.fundingPartyName).trim().toLowerCase()
      );
      const spName = pMatch?.salespersonName;
      const spCode = (pMatch as any)?.salesmanCode || (pMatch as any)?.salespersonId;
      if (spName || spCode) {
        spMatch = visibleSalespersonCatalog.find(
          (s) =>
            (spCode && (s.code?.toLowerCase() === String(spCode).toLowerCase() || s.id === spCode)) ||
            (spName && s.name.trim().toLowerCase() === spName.trim().toLowerCase())
        );
      }
    }

    if (spMatch) {
      return {
        personKey: (spMatch.id || spMatch.code || spMatch.name).toLowerCase(),
        personName: spMatch.name,
        personCode: spMatch.code || '',
        branchName: cleanBranchName(spMatch.branchName || '')
      };
    }

    if (rawPersonName) {
      return {
        personKey: `name:${rawPersonName.toLowerCase()}`,
        personName: rawPersonName,
        personCode: '',
        branchName: cleanBranchName(exp.branchName || exp.salesCenter || '')
      };
    }

    return null;
  };

  const isCenterAuthorized = (centerKey: string, centerName: string, branchId?: string): boolean => {
    if (isSuper) return true;
    const keyLow = centerKey.toLowerCase().trim();
    const cleanLow = cleanBranchName(centerName).toLowerCase().trim();
    const coreLow = normalizeSalesCenterCoreKey(centerName);
    const branchIdLow = String(branchId || '').toLowerCase().trim();
    if (!keyLow && !cleanLow && !coreLow && !branchIdLow) return false;
    return (
      (branchIdLow ? authorizedBranchIds.has(branchIdLow) : false) ||
      authorizedBranchIds.has(keyLow) ||
      authorizedBranchNames.has(cleanLow) ||
      authorizedBranchCoreKeys.has(coreLow)
    );
  };

  // Canonical branch index merging duplicates sharing the same branchId or normalized core name
  const canonicalBranchLookup = useMemo(() => {
    const byId = new Map<string, { centerKey: string; centerName: string; branchId: string; coreKey: string }>();
    const byCore = new Map<string, { centerKey: string; centerName: string; branchId: string; coreKey: string }>();

    effectiveBranches.forEach((b) => {
      if (!b || isAllSalesCentersLabel(b.name)) return;
      const bIdLow = String(b.id || '').trim().toLowerCase();
      const cleanName = cleanBranchName(b.name).replace(/\s+/g, ' ').trim();
      const coreKey = normalizeSalesCenterCoreKey(cleanName) || bIdLow;
      if (!coreKey) return;

      const existing = byCore.get(coreKey);
      const entry = existing
        ? {
            centerKey: existing.centerKey,
            centerName:
              (/sales\s*cent/i.test(cleanName) && !/sales\s*cent/i.test(existing.centerName)) ||
              cleanName.length > existing.centerName.length
                ? cleanName
                : existing.centerName,
            branchId: existing.branchId || b.id,
            coreKey
          }
        : {
            centerKey: `center:${coreKey}`,
            centerName: cleanName || b.name,
            branchId: b.id,
            coreKey
          };

      byCore.set(coreKey, entry);
      if (bIdLow) byId.set(bIdLow, entry);
    });

    return { byId, byCore, list: Array.from(byCore.values()) };
  }, [effectiveBranches]);

  // Helper to resolve Sales Center for an expense cleanly without creating duplicate keys
  const resolveExpenseSalesCenter = (exp: ExpenseEntry): { centerKey: string; centerName: string; branchId?: string } => {
    const spMatch = exp.createdById || exp.entityName || (exp as any).marketingPerson
      ? effectiveSalespersons.find(
          (s) =>
            (exp.createdById && (s.id === exp.createdById || s.code?.toLowerCase() === String(exp.createdById).toLowerCase())) ||
            (exp.entityName && s.name?.trim().toLowerCase() === String(exp.entityName).trim().toLowerCase()) ||
            ((exp as any).marketingPerson && s.name?.trim().toLowerCase() === String((exp as any).marketingPerson).trim().toLowerCase())
        )
      : undefined;
    const partyMatch = exp.fundingPartyName
      ? parties.find((p) => p.name.trim().toLowerCase() === String(exp.fundingPartyName).trim().toLowerCase())
      : undefined;

    const candidateFields = [
      exp.branchName,
      exp.salesCenter,
      exp.entityType === 'center' ? exp.entityName : '',
      exp.areaName,
      exp.area,
      spMatch?.branchName,
      (spMatch as any)?.branch,
      partyMatch?.branchName,
      exp.assignedEntity
    ];
    const rawBranch = candidateFields.find((val) => val && !isAllSalesCentersLabel(val)) || '';
    const rawBranchClean = cleanBranchName(rawBranch).replace(/\s+/g, ' ').trim();
    const rawBranchCore = normalizeSalesCenterCoreKey(rawBranchClean);

    const branchIdCandidate =
      exp.branchId && String(exp.branchId).trim().toLowerCase() !== 'all'
        ? String(exp.branchId).trim()
        : spMatch?.branchId || partyMatch?.branchId || '';

    const canonicalById = branchIdCandidate
      ? canonicalBranchLookup.byId.get(branchIdCandidate.toLowerCase())
      : undefined;
    const canonicalByCore =
      canonicalById ||
      (rawBranchCore ? canonicalBranchLookup.byCore.get(rawBranchCore) : undefined) ||
      (rawBranchCore.length >= 4
        ? canonicalBranchLookup.list.find(
            (b) => b.coreKey.length >= 4 && (b.coreKey.includes(rawBranchCore) || rawBranchCore.includes(b.coreKey))
          )
        : undefined);

    if (canonicalByCore) {
      return {
        centerKey: canonicalByCore.centerKey,
        centerName: canonicalByCore.centerName,
        branchId: canonicalByCore.branchId || branchIdCandidate || undefined
      };
    }

    const centerName = !isAllSalesCentersLabel(rawBranchClean) && rawBranchClean ? rawBranchClean : 'Unassigned Center';
    const centerKey = `center:${normalizeSalesCenterCoreKey(centerName) || 'unassigned'}`;
    return { centerKey, centerName, branchId: branchIdCandidate || undefined };
  };

  // Filter strictly by excluding Conveyance/Lunch/Tiffin, mapped authorized centers, and optional single-center selection
  const centerFilteredExpenses = useMemo(() => {
    return expenses.filter((exp) => {
      if (!exp || isExcludedConveyanceOrLunchExpense(exp)) return false;
      const resolved = resolveExpenseSalesCenter(exp);
      if (isAllSalesCentersLabel(resolved.centerName)) return false;
      if (!isCenterAuthorized(resolved.centerKey, resolved.centerName, resolved.branchId)) return false;

      if (!selectedCenter || selectedCenter === 'all') return true;
      const selCore = normalizeSalesCenterCoreKey(selectedCenter);
      const resCore = normalizeSalesCenterCoreKey(resolved.centerName);
      return (
        (selCore && resCore && selCore === resCore) ||
        resolved.centerName.toLowerCase().includes(selectedCenter.toLowerCase()) ||
        cleanBranchName(resolved.centerName).toLowerCase() === cleanBranchName(selectedCenter).toLowerCase()
      );
    });
  }, [expenses, selectedCenter, effectiveBranches, effectiveSalespersons, parties, isSuper, authorizedBranchIds, authorizedBranchNames, authorizedBranchCoreKeys]);

  // Sub-tab filtering helper
  const matchesSubTab = (exp: ExpenseEntry) => {
    if (activeSubTab === 'pending') {
      if (exp.approvalStatus === 'rejected') return false;
      return !exp.adminApproved && exp.approvalStatus !== 'approved';
    }
    if (activeSubTab === 'history') {
      return Boolean(exp.adminApproved || exp.approvalStatus === 'approved' || exp.approvalStatus === 'rejected');
    }
    return true;
  };

  // Search matching helper
  const matchesSearch = (exp: ExpenseEntry) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const personInfo = resolveExpenseMarketingPerson(exp);
    return (
      (exp.id && exp.id.toLowerCase().includes(q)) ||
      (exp.expenseHead && exp.expenseHead.toLowerCase().includes(q)) ||
      (exp.entityName && exp.entityName.toLowerCase().includes(q)) ||
      (exp.assignedEntity && exp.assignedEntity.toLowerCase().includes(q)) ||
      (exp.branchName && exp.branchName.toLowerCase().includes(q)) ||
      (exp.remarks && exp.remarks.toLowerCase().includes(q)) ||
      (exp.fundingPartyName && exp.fundingPartyName.toLowerCase().includes(q)) ||
      (personInfo && personInfo.personName.toLowerCase().includes(q)) ||
      String(exp.amount).includes(q)
    );
  };

  // Counts for sub-tab buttons (month-aware for summary KPIs)
  const monthScopedAll = useMemo(() => {
    return centerFilteredExpenses.filter((exp) => {
      if (selectedMonth === 'all') return true;
      const iso = parseDateToISO(exp.date);
      return iso.startsWith(selectedMonth);
    });
  }, [centerFilteredExpenses, selectedMonth]);

  const pendingExpensesCount = useMemo(
    () => monthScopedAll.filter((e) => e.approvalStatus !== 'rejected' && !e.adminApproved && e.approvalStatus !== 'approved').length,
    [monthScopedAll]
  );
  const historyExpensesCount = useMemo(
    () => monthScopedAll.filter((e) => e.adminApproved || e.approvalStatus === 'approved' || e.approvalStatus === 'rejected').length,
    [monthScopedAll]
  );

  // 1. INDIVIDUAL SALES CENTERS GROUPED LIST (only lists centers that have expenses; no "All Sales Centers" bucket)
  const salesCenterGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        centerKey: string;
        centerName: string;
        branchId?: string;
        totalAmount: number;
        vouchers: ExpenseEntry[];
        pendingInChargeCount: number;
        pendingAdminCount: number;
        approvedCount: number;
        rejectedCount: number;
      }
    >();

    const q = searchQuery.toLowerCase().trim();

    const branchIdToGroupKey = new Map<string, string>();

    centerFilteredExpenses.forEach((exp) => {
      if (selectedMonth !== 'all') {
        const iso = parseDateToISO(exp.date);
        if (!iso.startsWith(selectedMonth)) return;
      }
      if (!matchesSubTab(exp)) return;

      const { centerKey: resolvedKey, centerName, branchId } = resolveExpenseSalesCenter(exp);
      if (isAllSalesCentersLabel(centerName)) return;
      if (!isCenterAuthorized(resolvedKey, centerName, branchId)) return;

      const centerMatchesSearch = !q || centerName.toLowerCase().includes(q) || matchesSearch(exp);
      if (!centerMatchesSearch) return;

      const bIdLow = String(branchId || exp.branchId || '').trim().toLowerCase();
      const targetKey = (bIdLow && branchIdToGroupKey.get(bIdLow)) || resolvedKey;

      let group = map.get(targetKey);
      if (!group) {
        group = {
          centerKey: targetKey,
          centerName,
          branchId: branchId || exp.branchId,
          totalAmount: 0,
          vouchers: [],
          pendingInChargeCount: 0,
          pendingAdminCount: 0,
          approvedCount: 0,
          rejectedCount: 0
        };
        map.set(targetKey, group);
      } else {
        if (!group.branchId && (branchId || exp.branchId)) group.branchId = branchId || exp.branchId;
        if (centerName.length > group.centerName.length && /sales cent/i.test(centerName)) {
          group.centerName = centerName;
        }
      }
      if (bIdLow) branchIdToGroupKey.set(bIdLow, targetKey);

      group.vouchers.push(exp);
      group.totalAmount += Number(exp.amount) || 0;

      if (exp.approvalStatus === 'rejected') {
        group.rejectedCount++;
      } else if (exp.adminApproved || exp.approvalStatus === 'approved') {
        group.approvedCount++;
      } else if (exp.inChargeApproved) {
        group.pendingAdminCount++;
      } else {
        group.pendingInChargeCount++;
      }
    });

    // List only Sales Centers that actually have expenses
    const groups = Array.from(map.values()).filter((g) => g.vouchers.length > 0);

    // Sort vouchers chronologically ascending Date Serial Wise inside each Sales Center
    groups.forEach((group) => {
      group.vouchers.sort((a, b) => {
        const isoA = parseDateToISO(a.date) || a.date || '';
        const isoB = parseDateToISO(b.date) || b.date || '';
        const cmp = isoA.localeCompare(isoB);
        if (cmp !== 0) return cmp;
        return String(a.id || '').localeCompare(String(b.id || ''));
      });
    });

    return groups.sort((a, b) => {
      if (b.totalAmount !== a.totalAmount) return b.totalAmount - a.totalAmount;
      if (b.vouchers.length !== a.vouchers.length) return b.vouchers.length - a.vouchers.length;
      return a.centerName.localeCompare(b.centerName);
    });
  }, [
    visibleBranchCatalog,
    canonicalBranchLookup,
    centerFilteredExpenses,
    selectedCenter,
    selectedMonth,
    activeSubTab,
    searchQuery,
    effectiveBranches,
    effectiveSalespersons
  ]);

  // 2. ALL MARKETING PERSONS GROUPED LIST (click any marketing person -> shows ALL expenses of his)
  const marketingPersonGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        personKey: string;
        personName: string;
        personCode: string;
        branchName: string;
        totalAmount: number;
        vouchers: ExpenseEntry[];
        pendingInChargeCount: number;
        pendingAdminCount: number;
        approvedCount: number;
        rejectedCount: number;
      }
    >();

    // Seed all Marketing Persons from catalog
    visibleSalespersonCatalog.forEach((sp) => {
      if (!isMarketingOfficer(sp)) return;
      const spBranch = cleanBranchName(sp.branchName || '');
      const spCore = normalizeSalesCenterCoreKey(spBranch);
      const selCore = normalizeSalesCenterCoreKey(selectedCenter);
      if (
        selectedCenter &&
        selectedCenter !== 'all' &&
        (!selCore || spCore !== selCore) &&
        !spBranch.toLowerCase().includes(selectedCenter.toLowerCase())
      ) {
        return;
      }
      const pKey = (sp.id || sp.code || sp.name).toLowerCase();
      if (!map.has(pKey)) {
        map.set(pKey, {
          personKey: pKey,
          personName: sp.name,
          personCode: sp.code || '',
          branchName: spBranch,
          totalAmount: 0,
          vouchers: [],
          pendingInChargeCount: 0,
          pendingAdminCount: 0,
          approvedCount: 0,
          rejectedCount: 0
        });
      }
    });

    const q = searchQuery.toLowerCase().trim();

    centerFilteredExpenses.forEach((exp) => {
      if (personScope === 'selected_month' && selectedMonth !== 'all') {
        const iso = parseDateToISO(exp.date);
        if (!iso.startsWith(selectedMonth)) return;
      }
      if (!matchesSubTab(exp)) return;

      const resolvedPerson = resolveExpenseMarketingPerson(exp);
      if (!resolvedPerson) return;

      const matchesPersonQuery =
        !q ||
        resolvedPerson.personName.toLowerCase().includes(q) ||
        resolvedPerson.personCode.toLowerCase().includes(q) ||
        matchesSearch(exp);
      if (!matchesPersonQuery) return;

      let group = map.get(resolvedPerson.personKey);
      if (!group) {
        group = {
          personKey: resolvedPerson.personKey,
          personName: resolvedPerson.personName,
          personCode: resolvedPerson.personCode,
          branchName: resolvedPerson.branchName,
          totalAmount: 0,
          vouchers: [],
          pendingInChargeCount: 0,
          pendingAdminCount: 0,
          approvedCount: 0,
          rejectedCount: 0
        };
        map.set(resolvedPerson.personKey, group);
      }

      group.vouchers.push(exp);
      group.totalAmount += Number(exp.amount) || 0;

      if (exp.approvalStatus === 'rejected') {
        group.rejectedCount++;
      } else if (exp.adminApproved || exp.approvalStatus === 'approved') {
        group.approvedCount++;
      } else if (exp.inChargeApproved) {
        group.pendingAdminCount++;
      } else {
        group.pendingInChargeCount++;
      }
    });

    const groups = Array.from(map.values()).filter((g) => {
      if (!q) return true;
      return (
        g.personName.toLowerCase().includes(q) ||
        g.personCode.toLowerCase().includes(q) ||
        g.branchName.toLowerCase().includes(q) ||
        g.vouchers.length > 0
      );
    });

    // Sort each person's vouchers chronologically ascending by date
    groups.forEach((group) => {
      group.vouchers.sort((a, b) => {
        const isoA = parseDateToISO(a.date) || a.date || '';
        const isoB = parseDateToISO(b.date) || b.date || '';
        const cmp = isoA.localeCompare(isoB);
        if (cmp !== 0) return cmp;
        return String(a.id || '').localeCompare(String(b.id || ''));
      });
    });

    return groups.sort((a, b) => {
      if (b.totalAmount !== a.totalAmount) return b.totalAmount - a.totalAmount;
      if (b.vouchers.length !== a.vouchers.length) return b.vouchers.length - a.vouchers.length;
      return a.personName.localeCompare(b.personName);
    });
  }, [
    visibleSalespersonCatalog,
    centerFilteredExpenses,
    selectedCenter,
    personScope,
    selectedMonth,
    activeSubTab,
    searchQuery,
    parties
  ]);

  // Stage 1: In-Charge Approval Action
  const handleInChargeApprove = (expId: string) => {
    const targetExp = expenses.find((e) => e.id === expId);
    if (!targetExp || isExcludedConveyanceOrLunchExpense(targetExp)) return;
    const resolved = resolveExpenseSalesCenter(targetExp);
    if (!isCenterAuthorized(resolved.centerKey, resolved.centerName, resolved.branchId)) return;
    const approverName = currentUser?.name || currentUser?.username || 'In-Charge';
    const nowIso = new Date().toISOString();

    const updated = expenses.map((exp) => {
      if (exp.id === expId) {
        return {
          ...exp,
          inChargeApproved: true,
          inChargeApprovedBy: approverName,
          inChargeApprovedAt: nowIso,
          approvalStatus: 'pending_admin' as const
        };
      }
      return exp;
    });

    setExpenses(updated);
    try {
      localStorage.setItem('polycables_expenses', JSON.stringify(updated));
    } catch {}
    if (onSyncCloud) onSyncCloud({ expenses: updated }, true);

    window.dispatchEvent(
      new CustomEvent('polycables_giant_success', {
        detail: {
          message: 'In-Charge Approved!',
          subMessage: 'Forwarded to Regional/Accounts Admin for Final Approval'
        }
      })
    );
  };

  // Stage 2: Admin Final Approval Action
  const handleAdminApprove = (expId: string) => {
    const targetExp = expenses.find((e) => e.id === expId);
    if (!targetExp || isExcludedConveyanceOrLunchExpense(targetExp)) return;
    const resolved = resolveExpenseSalesCenter(targetExp);
    if (!isCenterAuthorized(resolved.centerKey, resolved.centerName, resolved.branchId)) return;
    const approverName = currentUser?.name || currentUser?.username || 'Admin';
    const nowIso = new Date().toISOString();

    const updated = expenses.map((exp) => {
      if (exp.id === expId) {
        return {
          ...exp,
          inChargeApproved: exp.inChargeApproved ?? true,
          inChargeApprovedBy: exp.inChargeApprovedBy || approverName,
          inChargeApprovedAt: exp.inChargeApprovedAt || nowIso,
          adminApproved: true,
          adminApprovedBy: approverName,
          adminApprovedAt: nowIso,
          isApproved: true,
          approvalStatus: 'approved' as const
        };
      }
      return exp;
    });

    setExpenses(updated);
    try {
      localStorage.setItem('polycables_expenses', JSON.stringify(updated));
    } catch {}
    if (onSyncCloud) onSyncCloud({ expenses: updated }, true);

    window.dispatchEvent(
      new CustomEvent('polycables_giant_success', {
        detail: {
          message: 'Admin Final Approved!',
          subMessage: 'Voucher Posted & Reconciled'
        }
      })
    );
  };

  // Batch In-Charge Approve All for a Sales Center (respecting selectedMonth)
  const handleInChargeApproveAllForCenter = (centerKey: string, centerName: string) => {
    if (!isCenterAuthorized(centerKey, centerName)) return;
    const approverName = currentUser?.name || currentUser?.username || 'In-Charge';
    const nowIso = new Date().toISOString();
    let count = 0;

    const updated = expenses.map((exp) => {
      if (isExcludedConveyanceOrLunchExpense(exp)) return exp;
      if (selectedMonth !== 'all') {
        const iso = parseDateToISO(exp.date);
        if (!iso.startsWith(selectedMonth)) return exp;
      }
      const resolved = resolveExpenseSalesCenter(exp);
      if (
        isCenterAuthorized(resolved.centerKey, resolved.centerName, resolved.branchId) &&
        (resolved.centerKey === centerKey || normalizeSalesCenterCoreKey(resolved.centerName) === normalizeSalesCenterCoreKey(centerName)) &&
        !exp.inChargeApproved &&
        exp.approvalStatus !== 'rejected' &&
        !exp.adminApproved
      ) {
        count++;
        return {
          ...exp,
          inChargeApproved: true,
          inChargeApprovedBy: approverName,
          inChargeApprovedAt: nowIso,
          approvalStatus: 'pending_admin' as const
        };
      }
      return exp;
    });

    if (count === 0) return;
    setExpenses(updated);
    try {
      localStorage.setItem('polycables_expenses', JSON.stringify(updated));
    } catch {}
    if (onSyncCloud) onSyncCloud({ expenses: updated }, true);

    window.dispatchEvent(
      new CustomEvent('polycables_giant_success', {
        detail: {
          message: `In-Charge Approved (${count})!`,
          subMessage: `All pending expenses for ${centerName} forwarded to Admin`
        }
      })
    );
  };

  // Batch Admin Final Approve All for a Sales Center (respecting selectedMonth)
  const handleAdminApproveAllForCenter = (centerKey: string, centerName: string) => {
    if (!isCenterAuthorized(centerKey, centerName)) return;
    const approverName = currentUser?.name || currentUser?.username || 'Admin';
    const nowIso = new Date().toISOString();
    let count = 0;

    const updated = expenses.map((exp) => {
      if (isExcludedConveyanceOrLunchExpense(exp)) return exp;
      if (selectedMonth !== 'all') {
        const iso = parseDateToISO(exp.date);
        if (!iso.startsWith(selectedMonth)) return exp;
      }
      const resolved = resolveExpenseSalesCenter(exp);
      if (
        isCenterAuthorized(resolved.centerKey, resolved.centerName, resolved.branchId) &&
        (resolved.centerKey === centerKey || normalizeSalesCenterCoreKey(resolved.centerName) === normalizeSalesCenterCoreKey(centerName)) &&
        exp.inChargeApproved &&
        !exp.adminApproved &&
        exp.approvalStatus !== 'rejected'
      ) {
        count++;
        return {
          ...exp,
          adminApproved: true,
          adminApprovedBy: approverName,
          adminApprovedAt: nowIso,
          isApproved: true,
          approvalStatus: 'approved' as const
        };
      }
      return exp;
    });

    if (count === 0) return;
    setExpenses(updated);
    try {
      localStorage.setItem('polycables_expenses', JSON.stringify(updated));
    } catch {}
    if (onSyncCloud) onSyncCloud({ expenses: updated }, true);

    window.dispatchEvent(
      new CustomEvent('polycables_giant_success', {
        detail: {
          message: `Admin Final Approved (${count})!`,
          subMessage: `All stage-2 expenses for ${centerName} reconciled`
        }
      })
    );
  };

  // Batch Approve for a specific Date inside a Sales Center
  const handleApproveAllForCenterDate = (
    centerKey: string,
    centerName: string,
    dateKey: string,
    dateLabel: string,
    stage: 'ic' | 'admin'
  ) => {
    if (!isCenterAuthorized(centerKey, centerName)) return;
    const approverName = currentUser?.name || currentUser?.username || (stage === 'ic' ? 'In-Charge' : 'Admin');
    const nowIso = new Date().toISOString();
    let count = 0;

    const updated = expenses.map((exp) => {
      if (isExcludedConveyanceOrLunchExpense(exp)) return exp;
      const resolved = resolveExpenseSalesCenter(exp);
      if (!isCenterAuthorized(resolved.centerKey, resolved.centerName, resolved.branchId)) return exp;
      const matchesCenter =
        resolved.centerKey === centerKey || normalizeSalesCenterCoreKey(resolved.centerName) === normalizeSalesCenterCoreKey(centerName);
      if (!matchesCenter) return exp;

      const expDateKey = parseDateToISO(exp.date) || String(exp.date || '').trim() || 'unknown';
      if (expDateKey !== dateKey) return exp;
      if (exp.approvalStatus === 'rejected') return exp;

      if (stage === 'ic' && !exp.inChargeApproved && !exp.adminApproved) {
        count++;
        return {
          ...exp,
          inChargeApproved: true,
          inChargeApprovedBy: approverName,
          inChargeApprovedAt: nowIso,
          approvalStatus: 'pending_admin' as const
        };
      }
      if (stage === 'admin' && exp.inChargeApproved && !exp.adminApproved) {
        count++;
        return {
          ...exp,
          adminApproved: true,
          adminApprovedBy: approverName,
          adminApprovedAt: nowIso,
          isApproved: true,
          approvalStatus: 'approved' as const
        };
      }
      return exp;
    });

    if (count === 0) return;
    setExpenses(updated);
    try {
      localStorage.setItem('polycables_expenses', JSON.stringify(updated));
    } catch {}
    if (onSyncCloud) onSyncCloud({ expenses: updated }, true);

    window.dispatchEvent(
      new CustomEvent('polycables_giant_success', {
        detail: {
          message: stage === 'ic' ? `In-Charge Approved (${count})!` : `Admin Final Approved (${count})!`,
          subMessage: `${centerName} — ${dateLabel}`
        }
      })
    );
  };

  // Batch Approve for a specific Marketing Person
  const handleApproveAllForPerson = (personKey: string, personName: string, stage: 'ic' | 'admin') => {
    const approverName = currentUser?.name || currentUser?.username || (stage === 'ic' ? 'In-Charge' : 'Admin');
    const nowIso = new Date().toISOString();
    let count = 0;

    const updated = expenses.map((exp) => {
      if (isExcludedConveyanceOrLunchExpense(exp)) return exp;
      const resolved = resolveExpenseSalesCenter(exp);
      if (!isCenterAuthorized(resolved.centerKey, resolved.centerName, resolved.branchId)) return exp;
      const pInfo = resolveExpenseMarketingPerson(exp);
      if (!pInfo || (pInfo.personKey !== personKey && pInfo.personName.toLowerCase() !== personName.toLowerCase())) {
        return exp;
      }
      if (exp.approvalStatus === 'rejected') return exp;

      if (stage === 'ic' && !exp.inChargeApproved && !exp.adminApproved) {
        count++;
        return {
          ...exp,
          inChargeApproved: true,
          inChargeApprovedBy: approverName,
          inChargeApprovedAt: nowIso,
          approvalStatus: 'pending_admin' as const
        };
      }
      if (stage === 'admin' && exp.inChargeApproved && !exp.adminApproved) {
        count++;
        return {
          ...exp,
          adminApproved: true,
          adminApprovedBy: approverName,
          adminApprovedAt: nowIso,
          isApproved: true,
          approvalStatus: 'approved' as const
        };
      }
      return exp;
    });

    if (count === 0) return;
    setExpenses(updated);
    try {
      localStorage.setItem('polycables_expenses', JSON.stringify(updated));
    } catch {}
    if (onSyncCloud) onSyncCloud({ expenses: updated }, true);

    window.dispatchEvent(
      new CustomEvent('polycables_giant_success', {
        detail: {
          message: `${stage === 'ic' ? 'In-Charge' : 'Admin'} Approved (${count})!`,
          subMessage: `All ${personName} expenses updated`
        }
      })
    );
  };

  // Rejection Action (Single or Batch)
  const handleRejectConfirm = () => {
    const rejector = currentUser?.name || currentUser?.username || 'Approver';
    const targetIds = new Set<string>(
      rejectionModalBatch
        ? rejectionModalBatch.ids
        : rejectionModalExp
          ? [rejectionModalExp.id]
          : []
    );
    if (targetIds.size === 0) return;

    let rejectedCount = 0;
    const updated = expenses.map((exp) => {
      if (!targetIds.has(exp.id) || isExcludedConveyanceOrLunchExpense(exp)) return exp;
      const resolved = resolveExpenseSalesCenter(exp);
      if (!isCenterAuthorized(resolved.centerKey, resolved.centerName, resolved.branchId)) return exp;
      if (exp.adminApproved || exp.approvalStatus === 'approved' || exp.approvalStatus === 'rejected') return exp;
      rejectedCount++;
      return {
        ...exp,
        isApproved: false,
        approvalStatus: 'rejected' as const,
        remarks: `${exp.remarks || ''} [Rejected by ${rejector}: ${rejectionReason || 'Declined'}]`.trim()
      };
    });

    if (rejectedCount > 0) {
      setExpenses(updated);
      try {
        localStorage.setItem('polycables_expenses', JSON.stringify(updated));
      } catch {}
      if (onSyncCloud) onSyncCloud({ expenses: updated }, true);
      window.dispatchEvent(
        new CustomEvent('polycables_giant_success', {
          detail: {
            message: `Rejected ${rejectedCount} Voucher${rejectedCount > 1 ? 's' : ''}`,
            subMessage: rejectionModalBatch
              ? `${rejectionModalBatch.title}`
              : `${rejectionModalExp?.expenseHead || 'Expense voucher'}`
          }
        })
      );
    }

    setRejectionModalExp(null);
    setRejectionModalBatch(null);
    setRejectionReason('');
  };

  // Export to Excel
  const handleExportExcel = () => {
    const listToExport = salesCenterGroups.flatMap((g) => g.vouchers);
    const rows = listToExport.map((exp, idx) => {
      const pInfo = resolveExpenseMarketingPerson(exp);
      return {
        'SL #': idx + 1,
        'Voucher ID': exp.id,
        'Date': formatDateDDMMYY(exp.date),
        'Sales Center': resolveExpenseSalesCenter(exp).centerName,
        'Marketing Person': pInfo?.personName || '-',
        'Expense Head': exp.expenseHead,
        'Amount (৳)': exp.amount,
        'Party Cash Funding': exp.fundingPartyName || '-',
        'Remarks': exp.remarks || '-',
        'In-Charge Status': exp.inChargeApproved ? `Approved by ${exp.inChargeApprovedBy}` : 'Pending',
        'Admin Status': exp.adminApproved
          ? `Approved by ${exp.adminApprovedBy}`
          : exp.inChargeApproved
            ? 'Pending Admin'
            : 'Awaiting In-Charge',
        'Final Status': exp.approvalStatus || 'pending'
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expense_Approvals');
    XLSX.writeFile(wb, `Expense_Approvals_${selectedCenter}_${selectedMonth}_${activeSubTab}.xlsx`);
  };

  const handlePrintApprovals = () => {
    triggerAutoConfiguredPrint('report');
  };

  // Shared voucher detail rows renderer
  const renderVoucherTable = (
    vouchers: ExpenseEntry[],
    contextType: 'center' | 'person',
    groupLabel: string,
    totalAmount: number
  ) => {
    if (vouchers.length === 0) {
      return (
        <div className="p-4 text-center text-xs text-slate-400 italic bg-[#061520]/80 rounded-xl border border-cyan-500/20">
          No expense vouchers found for {groupLabel}
          {contextType === 'center' && selectedMonth !== 'all' ? ` in ${formatMonthLabel(selectedMonth)}` : ''}.
        </div>
      );
    }

    return (
      <div className="bg-[#071824]/95 rounded-xl border border-cyan-500/25 overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#071622] text-cyan-300 border-b border-cyan-900/60 font-bold uppercase text-[10px] tracking-wider select-none">
              <th className="py-2 px-2.5 w-10 text-center">SL</th>
              <th className="py-2 px-2.5 w-24">Date</th>
              <th className="py-2 px-2.5">
                {contextType === 'center' ? 'Marketing Person / Staff' : 'Sales Center'}
              </th>
              <th className="py-2 px-2.5">Expense Head / Details</th>
              <th className="py-2 px-2.5 text-right w-28">Amount (৳)</th>
              <th className="py-2 px-2.5">Funding Party</th>
              <th className="py-2 px-2.5">In-Charge Verification</th>
              <th className="py-2 px-2.5">Admin Final Approval</th>
              <th className="py-2 px-2.5 w-36 text-center no-print">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cyan-950/60 text-slate-200">
            {vouchers.map((exp, idx) => {
              const pInfo = resolveExpenseMarketingPerson(exp);
              const cInfo = resolveExpenseSalesCenter(exp);
              const rowAuthorized = isCenterAuthorized(cInfo.centerKey, cInfo.centerName);
              const canInChargeApprove =
                rowAuthorized && (userInCharge || isAdminUser) && !exp.inChargeApproved && exp.approvalStatus !== 'rejected';
              const canAdminApprove =
                rowAuthorized && isAdminUser && !exp.adminApproved && exp.approvalStatus !== 'rejected' && Boolean(exp.inChargeApproved);

              return (
                <tr key={exp.id || idx} className="hover:bg-cyan-950/40 transition-colors bg-[#061520]/80">
                  <td className="py-2 px-2.5 text-center font-mono text-slate-400 text-[11px]">{idx + 1}</td>
                  <td className="py-2 px-2.5 font-mono text-cyan-200 whitespace-nowrap font-bold text-[11px]">
                    {formatDateDDMMYY(exp.date)}
                  </td>
                  <td className="py-2 px-2.5 whitespace-nowrap">
                    {contextType === 'center' ? (
                      pInfo ? (
                        <span className="font-bold text-white">{pInfo.personName}</span>
                      ) : (
                        <span className="text-slate-400 italic">Office / Staff</span>
                      )
                    ) : (
                      <span className="font-bold text-cyan-200">{cInfo.centerName}</span>
                    )}
                  </td>
                  <td className="py-2 px-2.5">
                    <div className="font-bold text-cyan-300">{exp.expenseHead}</div>
                    {exp.remarks && (
                      <div className="text-[10px] text-slate-400 truncate max-w-[240px]" title={exp.remarks}>
                        {exp.remarks}
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-2.5 text-right font-mono font-black text-emerald-400 whitespace-nowrap">
                    ৳{(Number(exp.amount) || 0).toLocaleString('en-IN')}
                  </td>
                  <td className="py-2 px-2.5 text-slate-300 max-w-[150px] truncate">
                    {exp.fundingPartyName ? (
                      <span className="text-amber-300 font-bold">{exp.fundingPartyName}</span>
                    ) : (
                      <span className="text-slate-500 italic">Petty Cash</span>
                    )}
                  </td>
                  <td className="py-2 px-2.5 whitespace-nowrap">
                    {exp.inChargeApproved ? (
                      <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 font-bold text-[10px]">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>{exp.inChargeApprovedBy || 'Approved'}</span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-amber-950/80 text-amber-300 border border-amber-500/40 font-bold text-[10px]">
                        <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                        <span>Pending In-Charge</span>
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-2.5 whitespace-nowrap">
                    {exp.approvalStatus === 'rejected' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-rose-950/80 text-rose-300 border border-rose-500/40 font-bold text-[10px]">
                        Rejected
                      </span>
                    ) : exp.adminApproved ? (
                      <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 font-bold text-[10px]">
                        <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>{exp.adminApprovedBy || 'Approved'}</span>
                      </div>
                    ) : exp.inChargeApproved ? (
                      <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 font-bold text-[10px]">
                        <Clock className="w-3 h-3 text-cyan-400 shrink-0" />
                        <span>Pending Admin</span>
                      </div>
                    ) : (
                      <span className="text-slate-500 text-[10px] italic">Awaiting Stage 1</span>
                    )}
                  </td>
                  <td className="py-2 px-2.5 text-center whitespace-nowrap no-print">
                    <div className="flex items-center justify-center space-x-1.5">
                      {canInChargeApprove && (
                        <button
                          type="button"
                          onClick={() => handleInChargeApprove(exp.id)}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] rounded-lg shadow-xs transition-all cursor-pointer border border-amber-400/40 active:scale-95"
                          title="Verify and Approve as In-Charge"
                        >
                          <CheckCircle2 className="w-3 h-3 text-white" />
                          <span>In-Charge Approve</span>
                        </button>
                      )}

                      {canAdminApprove && (
                        <button
                          type="button"
                          onClick={() => handleAdminApprove(exp.id)}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] rounded-lg shadow-xs transition-all cursor-pointer border border-emerald-400/40 active:scale-95"
                          title="Final Admin Approval"
                        >
                          <ShieldCheck className="w-3 h-3 text-white" />
                          <span>Admin Approve</span>
                        </button>
                      )}

                      {rowAuthorized && exp.approvalStatus !== 'approved' && exp.approvalStatus !== 'rejected' && !exp.adminApproved && (
                        <button
                          type="button"
                          onClick={() => {
                            setRejectionModalBatch(null);
                            setRejectionReason('');
                            setRejectionModalExp(exp);
                          }}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 bg-rose-600/90 hover:bg-rose-500 text-white font-bold text-[11px] rounded-lg shadow-xs transition-all cursor-pointer border border-rose-400/40 active:scale-95"
                          title="Reject Voucher"
                        >
                          <X className="w-3 h-3" />
                          <span>Reject</span>
                        </button>
                      )}

                      {exp.adminApproved && (
                        <span className="text-emerald-400 font-bold text-[11px] flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Completed</span>
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[#071622] border-t border-cyan-500/30 font-black text-xs">
              <td colSpan={4} className="py-2 px-3 text-right text-cyan-200 uppercase tracking-wide">
                {groupLabel} Total ({vouchers.length} Vouchers):
              </td>
              <td className="py-2 px-2.5 text-right font-mono text-emerald-300 whitespace-nowrap">
                ৳{totalAmount.toLocaleString('en-IN')}
              </td>
              <td colSpan={4} className="py-2 px-2.5" />
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-4 text-slate-100">
      {/* Formal Print-Only Report Header */}
      <div className="hidden print:block text-black bg-white p-4 border-b-2 border-black mb-3">
        <div className="text-center">
          <div className="text-lg font-black uppercase">{company?.name || 'POLY CABLES'}</div>
          {company?.address && <div className="text-xs text-slate-700">{company.address}</div>}
          <div className="text-sm font-bold uppercase mt-1 tracking-wide">
            Approve Expense — {selectedCenter ? cleanBranchName(selectedCenter) : 'Individual Sales Centers'} ({formatMonthLabel(selectedMonth)})
          </div>
        </div>
      </div>

      {/* Top Centered Header with Print & Back/Close Sign Buttons */}
      <div className="cyber-glass-card rounded-2xl px-4 py-3.5 grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3 no-print">
        <div className="hidden sm:block" />

        <h1 className="text-lg sm:text-xl font-black text-white tracking-tight text-center">
          Approve Expense
        </h1>

        <div className="flex items-center justify-center sm:justify-end space-x-2">
          <button
            type="button"
            onClick={handlePrintApprovals}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-cyan-200 bg-[#081b28] hover:bg-[#0e2a3d] hover:text-white border border-cyan-500/30 transition-all cursor-pointer shadow-xs active:scale-95"
            title="Print Expense Approval Sheet"
          >
            <Printer className="w-3.5 h-3.5 text-amber-300" />
            <span>Print</span>
          </button>

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-xl text-cyan-200 bg-[#081b28] hover:bg-[#0e2a3d] hover:text-white border border-cyan-500/30 transition-all cursor-pointer shadow-xs active:scale-95"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-rose-300 bg-rose-500/20 hover:bg-rose-500/30 hover:text-white border border-rose-400/40 transition-all cursor-pointer shadow-xs active:scale-95"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="cyber-glass-card rounded-2xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto min-w-0">
          {/* Sales Center Dropdown (Individual Authorized Centers Only) */}
          <div className="flex items-center space-x-1.5 w-full sm:w-auto">
            <span className="text-[11px] font-bold text-cyan-300 uppercase tracking-wide flex items-center gap-1 shrink-0">
              <Building2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Sales Center:</span>
            </span>
            <select
              value={selectedCenter}
              onChange={(e) => setSelectedCenter(e.target.value)}
              className="flex-1 sm:flex-initial min-w-0 bg-[#071622] border border-cyan-800/70 text-cyan-100 font-bold text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 cursor-pointer shadow-inner"
            >
              {visibleBranchCatalog.length !== 1 && (
                <option value="">-- Individual Sales Centers --</option>
              )}
              {visibleBranchCatalog.map((b) => (
                <option key={b.id} value={b.name}>
                  {cleanBranchName(b.name)}
                </option>
              ))}
            </select>
          </div>

          {/* Month Filter (Defaults to current running month for Sales Center Monthly Expenses) */}
          <div className="flex items-center space-x-1.5 w-full sm:w-auto">
            <span className="text-[11px] font-bold text-cyan-300 uppercase tracking-wide flex items-center gap-1 shrink-0">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
              <span>Month:</span>
            </span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="flex-1 sm:flex-initial min-w-0 bg-[#071622] border border-cyan-800/70 text-cyan-100 font-bold text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 cursor-pointer shadow-inner"
            >
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {formatMonthLabel(m)}{m === runningMonth.monthISO ? ' (This Month)' : ''}
                </option>
              ))}
              <option value="all">All Months</option>
            </select>
          </div>

          {/* Subtab Switcher */}
          <div className="flex flex-wrap items-center gap-1 bg-[#071622] p-1 rounded-xl border border-cyan-900/60 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setActiveSubTab('all')}
              className={`flex-1 sm:flex-initial justify-center px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeSubTab === 'all'
                  ? 'bg-cyan-500 text-slate-950 font-black shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <span>All ({monthScopedAll.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('pending')}
              className={`flex-1 sm:flex-initial justify-center px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeSubTab === 'pending'
                  ? 'bg-cyan-500 text-slate-950 font-black shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>Pending ({pendingExpensesCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('history')}
              className={`flex-1 sm:flex-initial justify-center px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeSubTab === 'history'
                  ? 'bg-cyan-500 text-slate-950 font-black shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>History ({historyExpensesCount})</span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative min-w-0 w-full sm:w-auto sm:min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search center, person, head..."
              className="w-full pl-9 pr-3 py-1.5 bg-[#071622] border border-cyan-800/60 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
            />
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2">
          {(searchQuery.trim() !== '' || selectedMonth !== runningMonth.monthISO || (isAdminUser && selectedCenter !== '' && visibleBranchCatalog.length !== 1)) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedMonth(runningMonth.monthISO);
                if (isAdminUser && visibleBranchCatalog.length !== 1) setSelectedCenter('');
              }}
              className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/35 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95"
              title="Reset Filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-500/20 cursor-pointer border border-emerald-400/40 active:scale-95"
            title="Export list to Excel"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 no-print">
        <div className="cyber-glass-subcard rounded-xl p-3.5 border border-cyan-500/35">
          <div className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider">
            Pending Vouchers ({formatMonthLabel(selectedMonth)})
          </div>
          <div className="text-xl font-mono font-black text-white mt-1">
            {pendingExpensesCount} Records
          </div>
          <div className="text-[11px] text-cyan-200/70 mt-0.5">
            Total Value:{' '}
            <span className="font-mono font-bold text-cyan-300">
              ৳
              {monthScopedAll
                .filter((e) => e.approvalStatus !== 'rejected' && !e.adminApproved && e.approvalStatus !== 'approved')
                .reduce((s, e) => s + (e.amount || 0), 0)
                .toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        <div className="cyber-glass-subcard rounded-xl p-3.5 border border-amber-500/35">
          <div className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
            Stage 1: Awaiting In-Charge
          </div>
          <div className="text-xl font-mono font-black text-amber-300 mt-1">
            {monthScopedAll.filter((e) => !e.inChargeApproved && e.approvalStatus !== 'rejected').length} Records
          </div>
          <div className="text-[11px] text-amber-200/70 mt-0.5">
            Requires showroom in-charge verification
          </div>
        </div>

        <div className="cyber-glass-subcard rounded-xl p-3.5 border border-emerald-500/35">
          <div className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">
            Stage 2: Awaiting Admin
          </div>
          <div className="text-xl font-mono font-black text-emerald-300 mt-1">
            {monthScopedAll.filter((e) => e.inChargeApproved && !e.adminApproved && e.approvalStatus !== 'rejected').length} Records
          </div>
          <div className="text-[11px] text-emerald-200/70 mt-0.5">
            Verified by In-Charge, ready for Admin
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SECTION 1: ALL SALES CENTERS (Click -> Expands All Expense of Month)  */}
      {/* ===================================================================== */}
      <div className="cyber-glass-card rounded-2xl overflow-hidden print:bg-white print:text-black print:border print:border-black print:shadow-none">
        <div className="px-4 py-2.5 border-b border-cyan-500/25 bg-[#081b28]/90 flex flex-wrap items-center justify-between gap-2 no-print">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-cyan-300" />
            <span className="text-xs font-extrabold text-cyan-200 uppercase tracking-wider">
              Sales Center List ({salesCenterGroups.length} Centers) — {formatMonthLabel(selectedMonth)}
            </span>
          </div>
          <span className="text-[11px] text-slate-300 font-semibold">
            Click any Sales Center to expand expenses grouped date-wise
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#071622] text-cyan-300 border-b border-cyan-900/60 font-bold uppercase text-[10px] tracking-wider select-none">
                <th className="py-2.5 px-3 w-12 text-center">SL</th>
                <th className="py-2.5 px-3">Sales Center Name</th>
                <th className="py-2.5 px-3 text-center w-36">Total Vouchers</th>
                <th className="py-2.5 px-3 text-right w-40">Total Amount (৳)</th>
                <th className="py-2.5 px-3 w-96 text-right no-print">Status / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-950/60 bg-[#0c2333]/50 text-slate-200">
              {salesCenterGroups.map((group, gIdx) => {
                const isExpanded = expandedCenters.has(group.centerKey);
                const centerAuthorized = isCenterAuthorized(group.centerKey, group.centerName, group.branchId);
                const canICApproveCenter = centerAuthorized && (userInCharge || isAdminUser) && group.pendingInChargeCount > 0;
                const canAdminApproveCenter = centerAuthorized && isAdminUser && group.pendingAdminCount > 0;
                const rejectableCenterIds = group.vouchers
                  .filter((v) => !v.adminApproved && v.approvalStatus !== 'approved' && v.approvalStatus !== 'rejected')
                  .map((v) => v.id);
                const canRejectCenter = centerAuthorized && (userInCharge || isAdminUser) && rejectableCenterIds.length > 0;

                return (
                  <React.Fragment key={group.centerKey}>
                    <tr
                      onClick={() => toggleCenterExpanded(group.centerKey)}
                      className="hover:bg-cyan-950/50 transition-colors cursor-pointer select-none"
                    >
                      <td className="py-3 px-3 text-center font-mono text-slate-400">{gIdx + 1}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="text-cyan-300 no-print">
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </span>
                          <div>
                            <div className="font-black text-sm text-white">{group.centerName}</div>
                            <div className="text-[10px] text-slate-400 font-medium">
                              {formatMonthLabel(selectedMonth)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#081b28] border border-cyan-500/30 text-cyan-200 font-mono font-black text-xs">
                          {group.vouchers.length} {group.vouchers.length === 1 ? 'Voucher' : 'Vouchers'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-emerald-400 text-sm whitespace-nowrap">
                        ৳{group.totalAmount.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-3 text-right no-print" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {group.pendingInChargeCount > 0 && (
                            <span className="bg-amber-950/80 text-amber-300 border border-amber-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              {group.pendingInChargeCount} Pending IC
                            </span>
                          )}
                          {group.pendingAdminCount > 0 && (
                            <span className="bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              {group.pendingAdminCount} Pending Admin
                            </span>
                          )}
                          {group.pendingInChargeCount === 0 && group.pendingAdminCount === 0 && group.approvedCount > 0 && (
                            <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              All Approved ({group.approvedCount})
                            </span>
                          )}
                          {group.rejectedCount > 0 && (
                            <span className="bg-rose-950/80 text-rose-300 border border-rose-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              {group.rejectedCount} Rejected
                            </span>
                          )}

                          {canICApproveCenter && (
                            <button
                              type="button"
                              onClick={() => handleInChargeApproveAllForCenter(group.centerKey, group.centerName)}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold text-[10px] rounded-lg transition-all cursor-pointer border border-amber-400/40"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Approve ({group.pendingInChargeCount})</span>
                            </button>
                          )}

                          {canAdminApproveCenter && (
                            <button
                              type="button"
                              onClick={() => handleAdminApproveAllForCenter(group.centerKey, group.centerName)}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] rounded-lg transition-all cursor-pointer border border-emerald-400/40"
                            >
                              <ShieldCheck className="w-3 h-3" />
                              <span>Admin Approve ({group.pendingAdminCount})</span>
                            </button>
                          )}

                          {canRejectCenter && (
                            <button
                              type="button"
                              onClick={() => {
                                setRejectionModalExp(null);
                                setRejectionReason('');
                                setRejectionModalBatch({
                                  title: `${group.centerName} (${rejectableCenterIds.length} Vouchers)`,
                                  ids: rejectableCenterIds
                                });
                              }}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 bg-rose-600/90 hover:bg-rose-500 text-white font-bold text-[10px] rounded-lg transition-all cursor-pointer border border-rose-400/40"
                            >
                              <X className="w-3 h-3" />
                              <span>Reject ({rejectableCenterIds.length})</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => toggleCenterExpanded(group.centerKey)}
                            className="px-2.5 py-1 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/30 rounded-lg text-[10px] font-bold cursor-pointer"
                          >
                            {isExpanded ? 'Hide Expenses' : 'View Expenses'}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr>
                        <td colSpan={5} className="p-3 bg-[#041018]/85 border-t border-cyan-500/20">
                          {renderVoucherTable(group.vouchers, 'center', group.centerName, group.totalAmount)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {salesCenterGroups.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                    No Sales Centers found for this filter.
                  </td>
                </tr>
              )}
            </tbody>
            {salesCenterGroups.length > 0 && (
              <tfoot>
                <tr className="bg-[#071622] border-t-2 border-cyan-500/40 font-black text-sm">
                  <td colSpan={2} className="py-3 px-3 text-right text-cyan-200 uppercase tracking-wider">
                    Grand Total ({salesCenterGroups.length} Sales Centers):
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-amber-300">
                    {salesCenterGroups.reduce((s, g) => s + g.vouchers.length, 0)} Vouchers
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-black text-emerald-300 text-base whitespace-nowrap">
                    ৳{salesCenterGroups.reduce((s, g) => s + g.totalAmount, 0).toLocaleString('en-IN')}
                  </td>
                  <td className="py-3 px-3 no-print" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SECTION 2: ALL MARKETING PERSONS LIST (Click -> All Expenses of His)  */}
      {/* ===================================================================== */}
      <div className="cyber-glass-card rounded-2xl overflow-hidden print:bg-white print:text-black print:border print:border-black print:shadow-none">
        <div className="px-4 py-2.5 border-b border-cyan-500/25 bg-[#081b28]/90 flex flex-wrap items-center justify-between gap-2 no-print">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-300" />
            <span className="text-xs font-extrabold text-amber-200 uppercase tracking-wider">
              Marketing Person List ({marketingPersonGroups.length} Officers)
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-slate-300 font-semibold">
              Click any Marketing Person to show all expenses of his
            </span>
            <div className="flex items-center bg-[#071622] p-0.5 rounded-lg border border-cyan-900/60 text-[10px]">
              <button
                type="button"
                onClick={() => setPersonScope('all_time')}
                className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-all ${
                  personScope === 'all_time' ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-300 hover:text-white'
                }`}
              >
                All Expenses
              </button>
              <button
                type="button"
                onClick={() => setPersonScope('selected_month')}
                className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-all ${
                  personScope === 'selected_month'
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {formatMonthLabel(selectedMonth)} Only
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#071622] text-amber-300 border-b border-cyan-900/60 font-bold uppercase text-[10px] tracking-wider select-none">
                <th className="py-2.5 px-3 w-12 text-center">SL</th>
                <th className="py-2.5 px-3">Marketing Person Name</th>
                <th className="py-2.5 px-3">Sales Center</th>
                <th className="py-2.5 px-3 text-right w-40">Total Expense (৳)</th>
                <th className="py-2.5 px-3 w-80 text-right no-print">Status / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-950/60 bg-[#0c2333]/50 text-slate-200">
              {marketingPersonGroups.map((person, pIdx) => {
                const isExpanded = expandedPersons.has(person.personKey);
                const canICApprovePerson = (userInCharge || isAdminUser) && person.pendingInChargeCount > 0;
                const canAdminApprovePerson = isAdminUser && person.pendingAdminCount > 0;

                return (
                  <React.Fragment key={person.personKey}>
                    <tr
                      onClick={() => togglePersonExpanded(person.personKey)}
                      className="hover:bg-amber-950/25 transition-colors cursor-pointer select-none"
                    >
                      <td className="py-3 px-3 text-center font-mono text-slate-400">{pIdx + 1}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="text-amber-300 no-print">
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </span>
                          <div>
                            <div className="font-black text-sm text-white">
                              {person.personName}
                              {person.personCode ? (
                                <span className="ml-2 text-[10px] font-mono text-amber-300/90">({person.personCode})</span>
                              ) : null}
                            </div>
                            <div className="text-[10px] text-slate-400 font-medium">
                              {person.vouchers.length} Voucher(s)
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-cyan-200 font-semibold text-xs">
                        {person.branchName || '-'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-emerald-400 text-sm whitespace-nowrap">
                        ৳{person.totalAmount.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-3 text-right no-print" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {person.pendingInChargeCount > 0 && (
                            <span className="bg-amber-950/80 text-amber-300 border border-amber-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              {person.pendingInChargeCount} Pending IC
                            </span>
                          )}
                          {person.pendingAdminCount > 0 && (
                            <span className="bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              {person.pendingAdminCount} Pending Admin
                            </span>
                          )}
                          {person.pendingInChargeCount === 0 && person.pendingAdminCount === 0 && person.approvedCount > 0 && (
                            <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              All Approved ({person.approvedCount})
                            </span>
                          )}
                          {person.rejectedCount > 0 && (
                            <span className="bg-rose-950/80 text-rose-300 border border-rose-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              {person.rejectedCount} Rejected
                            </span>
                          )}

                          {canICApprovePerson && (
                            <button
                              type="button"
                              onClick={() => handleApproveAllForPerson(person.personKey, person.personName, 'ic')}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold text-[10px] rounded-lg transition-all cursor-pointer border border-amber-400/40"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>IC Approve All</span>
                            </button>
                          )}

                          {canAdminApprovePerson && (
                            <button
                              type="button"
                              onClick={() => handleApproveAllForPerson(person.personKey, person.personName, 'admin')}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] rounded-lg transition-all cursor-pointer border border-emerald-400/40"
                            >
                              <ShieldCheck className="w-3 h-3" />
                              <span>Admin Approve All</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => togglePersonExpanded(person.personKey)}
                            className="px-2.5 py-1 bg-[#081b28] hover:bg-[#0e2a3d] text-amber-200 border border-amber-500/30 rounded-lg text-[10px] font-bold cursor-pointer"
                          >
                            {isExpanded ? 'Hide Expenses' : 'View Expenses'}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr>
                        <td colSpan={5} className="p-3 bg-[#041018]/85 border-t border-amber-500/20">
                          {renderVoucherTable(person.vouchers, 'person', person.personName, person.totalAmount)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {marketingPersonGroups.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                    No Marketing Persons found for this filter.
                  </td>
                </tr>
              )}
            </tbody>
            {marketingPersonGroups.length > 0 && (
              <tfoot>
                <tr className="bg-[#071622] border-t-2 border-amber-500/40 font-black text-sm">
                  <td colSpan={3} className="py-3 px-3 text-right text-amber-200 uppercase tracking-wider">
                    Grand Total ({marketingPersonGroups.length} Officers /{' '}
                    {marketingPersonGroups.reduce((s, p) => s + p.vouchers.length, 0)} Vouchers):
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-black text-emerald-300 text-base whitespace-nowrap">
                    ৳{marketingPersonGroups.reduce((s, p) => s + p.totalAmount, 0).toLocaleString('en-IN')}
                  </td>
                  <td className="py-3 px-3 no-print" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Rejection Modal */}
      {(rejectionModalExp || rejectionModalBatch) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0c2333] border border-rose-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-rose-400" />
                <span>
                  {rejectionModalBatch ? 'Reject Sales Center Vouchers' : 'Reject Expense Voucher'}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setRejectionModalExp(null);
                  setRejectionModalBatch(null);
                }}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              {rejectionModalBatch ? (
                <>
                  Rejecting all pending vouchers for{' '}
                  <span className="font-bold text-white">{rejectionModalBatch.title}</span>.
                </>
              ) : rejectionModalExp ? (
                <>
                  Rejecting voucher #{rejectionModalExp.id} for {rejectionModalExp.expenseHead} (৳
                  {rejectionModalExp.amount.toLocaleString('en-IN')}).
                </>
              ) : null}
            </p>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">Reason for Rejection:</label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter explanation for rejection..."
                rows={3}
                className="w-full p-2 bg-[#071622] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setRejectionModalExp(null);
                  setRejectionModalBatch(null);
                }}
                className="px-4 py-2 text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRejectConfirm}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl cursor-pointer shadow-md"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
