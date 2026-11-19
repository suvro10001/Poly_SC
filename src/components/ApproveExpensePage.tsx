import React, { useState, useMemo } from 'react';
import {
  ExpenseEntry,
  BankDeposit,
  Salesperson,
  BranchLocation,
  Party,
  CompanyDetails,
  AuthUser
} from '../types';
import {
  CheckCircle2,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Search,
  Calendar,
  Building2,
  DollarSign,
  Printer,
  ArrowLeft,
  X,
  Receipt,
  UserCheck,
  Check,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Users
} from 'lucide-react';
import { formatDateDDMMYY, parseDateToISO } from '../utils/dateUtils';
import {
  cleanBranchName,
  isStrictSuperAdmin,
  isAnyAdmin,
  isInCharge,
  getAdminBranches,
  getUserBranch
} from '../utils/branchAccess';
import { BankLogoBadge } from './BankAndAccountDirectory';

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

interface ApproveExpensePageProps {
  expenses: ExpenseEntry[];
  setExpenses: React.Dispatch<React.SetStateAction<ExpenseEntry[]>>;
  bankDeposits?: BankDeposit[];
  setBankDeposits?: React.Dispatch<React.SetStateAction<BankDeposit[]>>;
  salespersons?: Salesperson[];
  branches?: BranchLocation[];
  parties?: Party[];
  company?: CompanyDetails;
  currentUser?: AuthUser | null;
  onSyncCloud?: (patch: Record<string, any>, immediate?: boolean) => void;
  onBack?: () => void;
  onClose?: () => void;
}

interface GroupedApprovalRow {
  groupKey: string;
  displayName: string;
  subtitle?: string;
  vouchers: ExpenseEntry[]; // sorted date ascending
  totalVoucherCount: number;
  totalAmount: number;
  pendingInChargeCount: number;
  pendingAdminCount: number;
  approvedCount: number;
}

export const ApproveExpensePage: React.FC<ApproveExpensePageProps> = ({
  expenses = [],
  setExpenses,
  bankDeposits = [],
  setBankDeposits,
  salespersons = [],
  branches = [],
  parties = [],
  currentUser,
  onSyncCloud,
  onBack,
  onClose
}) => {
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<
    'unapproved' | 'pending_incharge' | 'pending_admin' | 'approved' | 'all'
  >('unapproved');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedCenters, setExpandedCenters] = useState<Record<string, boolean>>({});
  const [expandedPersons, setExpandedPersons] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [rejectionModalTarget, setRejectionModalTarget] = useState<{
    ids: string[];
    label: string;
  } | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const currentUserName = currentUser?.name || currentUser?.username || 'Admin Approver';
  const isSuperAdminUser = isStrictSuperAdmin(currentUser);
  const userIsAdmin = isSuperAdminUser || isAnyAdmin(currentUser);
  const userIsInCharge = !userIsAdmin && isInCharge(currentUser, salespersons, branches);

  const authorizedBranches = useMemo(() => {
    if (!currentUser) return [];
    if (isSuperAdminUser) return branches;

    if (userIsAdmin) {
      const mapped = getAdminBranches(currentUser, branches, salespersons);
      const mappedIds = new Set(mapped.map((b) => b.id.toLowerCase().trim()));
      const userIdLow = (currentUser.id || '').trim().toLowerCase();
      const userNameLow = (currentUser.username || '').trim().toLowerCase();
      const fullNameLow = (currentUser.name || '').trim().toLowerCase();
      const spCodeLow = ((currentUser as any).salespersonCode || '').trim().toLowerCase();
      const assignedNames = new Set(
        ((currentUser as any).assignedBranchNames || []).map((n: string) => cleanBranchName(n).toLowerCase().trim()).filter(Boolean)
      );

      return branches.filter((b) => {
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

    if (userIsInCharge) {
      const ub = getUserBranch(currentUser, salespersons, branches);
      return branches.filter(
        (b) =>
          (ub.branchId && b.id.toLowerCase() === ub.branchId.toLowerCase()) ||
          (ub.branchName && cleanBranchName(b.name).toLowerCase() === cleanBranchName(ub.branchName).toLowerCase())
      );
    }

    return [];
  }, [currentUser, isSuperAdminUser, userIsAdmin, userIsInCharge, branches, salespersons]);

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

  const isExpInChargeApproved = (e: ExpenseEntry): boolean =>
    Boolean(
      e.inChargeApproved ||
      e.inChargeApprovedBy ||
      e.inChargeApprovedAt ||
      e.isApproved ||
      e.adminApproved ||
      e.approvalStatus === 'pending_admin' ||
      e.approvalStatus === 'approved'
    );

  const salespersonLookup = useMemo(() => {
    const byName = new Map<string, Salesperson>();
    salespersons.forEach((sp) => {
      if (sp.name) byName.set(sp.name.trim().toLowerCase(), sp);
    });
    return byName;
  }, [salespersons]);

  const partyToSalespersonMap = useMemo(() => {
    const map = new Map<string, string>();
    parties.forEach((p) => {
      if (p.name && p.salespersonName) {
        map.set(p.name.trim().toLowerCase(), p.salespersonName.trim());
      }
    });
    return map;
  }, [parties]);

  const canonicalBranchLookup = useMemo(() => {
    const byId = new Map<string, { centerKey: string; centerName: string; branchId: string; coreKey: string }>();
    const byCore = new Map<string, { centerKey: string; centerName: string; branchId: string; coreKey: string }>();

    branches.forEach((b) => {
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
  }, [branches]);

  const resolveExpenseSalesCenterInfo = (e: ExpenseEntry): { centerKey: string; centerName: string; branchId?: string; coreKey: string } => {
    const personCandidate = (e.marketingPerson || e.personName || e.entityName || '').trim().toLowerCase();
    const matchedSp = salespersonLookup.get(personCandidate);
    const matchedParty = e.fundingPartyName
      ? parties.find((p) => p.name.trim().toLowerCase() === String(e.fundingPartyName).trim().toLowerCase())
      : undefined;

    const candidates = [
      e.branchName,
      e.salesCenter,
      e.entityType === 'center' ? e.entityName : '',
      e.area,
      e.areaName,
      matchedSp?.branchName,
      matchedSp?.branch,
      matchedParty?.branchName,
      (e as any).assignedEntity
    ];
    const raw = candidates.find((val) => val && !isAllSalesCentersLabel(val)) || '';
    const rawClean = cleanBranchName(raw).replace(/\s+/g, ' ').trim();
    const rawCore = normalizeSalesCenterCoreKey(rawClean);
    const branchIdCandidate =
      e.branchId && String(e.branchId).trim().toLowerCase() !== 'all'
        ? String(e.branchId).trim()
        : matchedSp?.branchId || matchedParty?.branchId || '';

    const canonicalById = branchIdCandidate
      ? canonicalBranchLookup.byId.get(branchIdCandidate.toLowerCase())
      : undefined;
    const canonicalMatch =
      canonicalById ||
      (rawCore ? canonicalBranchLookup.byCore.get(rawCore) : undefined) ||
      (rawCore.length >= 4
        ? canonicalBranchLookup.list.find(
            (b) => b.coreKey.length >= 4 && (b.coreKey.includes(rawCore) || rawCore.includes(b.coreKey))
          )
        : undefined);

    if (canonicalMatch) {
      return {
        centerKey: canonicalMatch.centerKey,
        centerName: canonicalMatch.centerName,
        branchId: canonicalMatch.branchId || branchIdCandidate || undefined,
        coreKey: canonicalMatch.coreKey
      };
    }

    const centerName = rawClean && !isAllSalesCentersLabel(rawClean) ? rawClean : 'Unassigned Center';
    const coreKey = normalizeSalesCenterCoreKey(centerName) || 'unassigned';
    return {
      centerKey: `center:${coreKey}`,
      centerName,
      branchId: branchIdCandidate || undefined,
      coreKey
    };
  };

  const resolveExpenseSalesCenter = (e: ExpenseEntry): string => {
    return resolveExpenseSalesCenterInfo(e).centerName;
  };

  const isExpenseAuthorized = (e: ExpenseEntry): boolean => {
    if (isSuperAdminUser) return true;
    const bid = (e.branchId || '').toLowerCase().trim();
    if (bid && authorizedBranchIds.has(bid)) return true;
    const sc = resolveExpenseSalesCenter(e).toLowerCase().trim();
    const scCore = normalizeSalesCenterCoreKey(sc);
    return Boolean(
      (sc && authorizedBranchNames.has(sc)) ||
      (scCore && authorizedBranchCoreKeys.has(scCore))
    );
  };

  // Strict hierarchy & branch-admin isolation: Admin/In-Charge only sees authorized Sales Centers, excluding Conveyance/Lunch/Tiffin
  const roleVisibleExpenses = useMemo(() => {
    const scoped = expenses.filter((e) => e && !isExcludedConveyanceOrLunchExpense(e) && isExpenseAuthorized(e));
    if (userIsAdmin) {
      return scoped.filter(isExpInChargeApproved);
    }
    return scoped;
  }, [expenses, userIsAdmin, isSuperAdminUser, branches, parties, authorizedBranchIds, authorizedBranchNames, authorizedBranchCoreKeys, salespersonLookup]);

  const resolveExpenseMarketingPerson = (e: ExpenseEntry): string | null => {
    if (e.entityType === 'marketing' && e.entityName?.trim()) {
      return e.entityName.trim();
    }
    const explicit = (e.marketingPerson || e.personName || e.staffName || '').trim();
    if (explicit) return explicit;

    if (e.entityName?.trim() && salespersonLookup.has(e.entityName.trim().toLowerCase())) {
      return salespersonLookup.get(e.entityName.trim().toLowerCase())!.name;
    }
    if (e.fundingPartyName?.trim()) {
      const spName = partyToSalespersonMap.get(e.fundingPartyName.trim().toLowerCase());
      if (spName) return spName;
    }
    return null;
  };

  // Available individual branches (ONLY Sales Centers that have expenses, deduplicated by canonical core key)
  const branchOptions = useMemo(() => {
    const map = new Map<string, string>();
    roleVisibleExpenses.forEach((e) => {
      const info = resolveExpenseSalesCenterInfo(e);
      if (info.centerName && !isAllSalesCentersLabel(info.centerName)) {
        const existing = map.get(info.coreKey);
        if (!existing || (/sales\s*cent/i.test(info.centerName) && !/sales\s*cent/i.test(existing))) {
          map.set(info.coreKey, info.centerName);
        }
      }
    });
    return Array.from(map.values()).sort();
  }, [roleVisibleExpenses, salespersonLookup, canonicalBranchLookup]);

  // Filtered expenses list (sorted date ascending wise)
  const filteredExpenses = useMemo(() => {
    return roleVisibleExpenses
      .filter((e) => {
        const isAppr = Boolean(e.isApproved || e.adminApproved || e.approvalStatus === 'approved');
        const isRej = e.approvalStatus === 'rejected';
        const inChAppr = isExpInChargeApproved(e);

        // 1. Optional individual branch filter (normalized canonical comparison)
        if (selectedBranch && selectedBranch !== 'All') {
          const info = resolveExpenseSalesCenterInfo(e);
          const selCore = normalizeSalesCenterCoreKey(selectedBranch);
          if (info.coreKey !== selCore && info.centerName.toLowerCase() !== selectedBranch.trim().toLowerCase()) {
            return false;
          }
        }

        // 2. Status filter
        if (statusFilter === 'unapproved' && (isAppr || isRej)) return false;
        if (statusFilter === 'approved' && !isAppr) return false;
        if (statusFilter === 'pending_admin' && (isAppr || isRej || !inChAppr)) return false;
        if (statusFilter === 'pending_incharge' && (isAppr || isRej || inChAppr)) return false;

        // 3. Date / Year / Month
        const iso = parseDateToISO(e.date);
        if (iso) {
          const parts = iso.split('-');
          if (parts.length >= 2) {
            if (selectedYear !== 'all' && parts[0] !== selectedYear) return false;
            if (selectedMonth !== 'all' && parts[1] !== selectedMonth) return false;
          }
        }

        // 4. Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const mp = resolveExpenseMarketingPerson(e) || '';
          const sc = resolveExpenseSalesCenter(e);
          const str = `${e.expenseHead || ''} ${e.entityName || ''} ${mp} ${sc} ${e.remarks || ''} ${
            e.fundingPartyName || ''
          } ${e.amount || ''}`.toLowerCase();
          if (!str.includes(q)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const isoA = parseDateToISO(a.date) || a.date || '';
        const isoB = parseDateToISO(b.date) || b.date || '';
        return isoA.localeCompare(isoB);
      });
  }, [
    roleVisibleExpenses,
    selectedBranch,
    statusFilter,
    selectedYear,
    selectedMonth,
    searchQuery,
    salespersonLookup,
    partyToSalespersonMap
  ]);

  // Helper to build grouped rows (always date ascending inside each group)
  const buildGroupedRows = (
    list: ExpenseEntry[],
    getGroupKey: (e: ExpenseEntry) => string | null,
    getSubtitle?: (e: ExpenseEntry) => string,
    getCanonicalKey?: (label: string) => string
  ): GroupedApprovalRow[] => {
    const map = new Map<string, GroupedApprovalRow>();

    list.forEach((e) => {
      const label = getGroupKey(e);
      if (!label) return;
      const trimmedLabel = label.trim().replace(/\s+/g, ' ');
      const key = getCanonicalKey ? getCanonicalKey(trimmedLabel) : trimmedLabel.toLowerCase();

      if (!map.has(key)) {
        map.set(key, {
          groupKey: key,
          displayName: trimmedLabel,
          subtitle: getSubtitle ? getSubtitle(e) : undefined,
          vouchers: [],
          totalVoucherCount: 0,
          totalAmount: 0,
          pendingInChargeCount: 0,
          pendingAdminCount: 0,
          approvedCount: 0
        });
      }

      const grp = map.get(key)!;
      if (trimmedLabel.length > grp.displayName.length && /sales center/i.test(trimmedLabel)) {
        grp.displayName = trimmedLabel;
      }
      grp.vouchers.push(e);
      grp.totalVoucherCount += 1;
      grp.totalAmount += Number(e.amount) || 0;

      const isAppr = Boolean(e.isApproved || e.adminApproved || e.approvalStatus === 'approved');
      const inChAppr = isExpInChargeApproved(e);
      if (isAppr) grp.approvedCount += 1;
      else if (inChAppr) grp.pendingAdminCount += 1;
      else grp.pendingInChargeCount += 1;
    });

    const result = Array.from(map.values());
    result.forEach((grp) => {
      grp.vouchers.sort((a, b) => {
        const isoA = parseDateToISO(a.date) || a.date || '';
        const isoB = parseDateToISO(b.date) || b.date || '';
        return isoA.localeCompare(isoB);
      });
    });

    return result.sort((a, b) => a.displayName.localeCompare(b.displayName));
  };

  // Group 1: Sales Center Wise (always prioritizes unapproved vouchers when on unapproved/pending tabs)
  const salesCenterGroups = useMemo(() => {
    const branchIdToKey = new Map<string, string>();
    return buildGroupedRows(
      filteredExpenses,
      (e) => {
        const info = resolveExpenseSalesCenterInfo(e);
        return info.centerName;
      },
      () => 'Sales Center Expense Vouchers',
      (label) => {
        const core = normalizeSalesCenterCoreKey(label);
        const canonical = canonicalBranchLookup.byCore.get(core);
        const key = canonical ? canonical.centerKey : `center:${core}`;
        if (canonical?.branchId) branchIdToKey.set(canonical.branchId.toLowerCase(), key);
        return key;
      }
    );
  }, [filteredExpenses, canonicalBranchLookup]);

  // Group 2: Marketing Person Wise
  const marketingPersonGroups = useMemo(() => {
    return buildGroupedRows(
      filteredExpenses,
      (e) => resolveExpenseMarketingPerson(e),
      (e) => resolveExpenseSalesCenter(e)
    );
  }, [filteredExpenses, salespersonLookup, partyToSalespersonMap]);

  // Summary Metrics
  const metrics = useMemo(() => {
    let pendingInChargeCount = 0;
    let pendingAdminCount = 0;
    let approvedCount = 0;
    let totalApprovedAmt = 0;
    let totalPendingAmt = 0;

    roleVisibleExpenses.forEach((e) => {
      const isAppr = Boolean(e.isApproved || e.adminApproved || e.approvalStatus === 'approved');
      const isRej = e.approvalStatus === 'rejected';
      const inChAppr = isExpInChargeApproved(e);

      if (isRej) return;
      if (isAppr) {
        approvedCount++;
        totalApprovedAmt += Number(e.amount) || 0;
      } else {
        totalPendingAmt += Number(e.amount) || 0;
        if (!inChAppr) {
          pendingInChargeCount++;
        } else {
          pendingAdminCount++;
        }
      }
    });

    return {
      totalCount: roleVisibleExpenses.length,
      unapprovedCount: pendingInChargeCount + pendingAdminCount,
      pendingInChargeCount,
      pendingAdminCount,
      approvedCount,
      totalApprovedAmt,
      totalPendingAmt
    };
  }, [roleVisibleExpenses]);

  // Core batch In-Charge approve for a list of expense IDs
  const approveInChargeIds = (targetIds: string[], label?: string) => {
    const idSet = new Set(targetIds);
    const nowIso = new Date().toISOString();
    let count = 0;
    const updated = expenses.map((e) => {
      if (idSet.has(e.id) && !isExcludedConveyanceOrLunchExpense(e) && isExpenseAuthorized(e) && !e.inChargeApproved && !e.isApproved && !e.adminApproved) {
        count++;
        return {
          ...e,
          inChargeApproved: true,
          inChargeApprovedBy: currentUserName,
          inChargeApprovedAt: nowIso,
          approvalStatus: 'pending_admin' as const,
          updatedAt: nowIso
        };
      }
      return e;
    });

    if (count === 0) return;
    setExpenses(updated);
    try {
      localStorage.setItem('polycables_expenses', JSON.stringify(updated));
    } catch {}
    onSyncCloud?.({ expenses: updated }, true);
    showToast(
      label
        ? `✓ In-Charge approved ${count} voucher(s) for ${label}`
        : `✓ Expense approved by In-Charge (${currentUserName})`
    );
  };

  // Core batch Admin final approve for a list of expense IDs
  const approveAdminIds = (targetIds: string[], label?: string) => {
    const idSet = new Set(targetIds);
    const nowIso = new Date().toISOString();
    const updatedDeps = [...bankDeposits];
    let createdHoDepsCount = 0;
    let approvedNowCount = 0;

    const updated = expenses.map((e) => {
      if (
        idSet.has(e.id) &&
        !isExcludedConveyanceOrLunchExpense(e) &&
        isExpenseAuthorized(e) &&
        isExpInChargeApproved(e) &&
        !(e.isApproved || e.adminApproved || e.approvalStatus === 'approved')
      ) {
        approvedNowCount++;
        const hoDepId =
          e.hoDepositId ||
          (e.fundingPartyName
            ? `dep-ho-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
            : undefined);

        if (e.fundingPartyName && !e.hoDepositId) {
          updatedDeps.unshift({
            id: hoDepId || `dep-ho-${Date.now()}`,
            date: e.date,
            depositDate: e.date,
            bankName: 'H/O',
            accountName: 'Head Office Settlement',
            amount: Number(e.amount) || 0,
            displayTag: 'H/O(Settlement)',
            entityName: e.entityName || e.branchName || 'Madhupur Sales Center',
            partyName: e.fundingPartyName,
            remarks: `Expense settlement approved: ${e.expenseHead} (৳${e.amount})`,
            updatedAt: nowIso
          });
          createdHoDepsCount++;
        }

        return {
          ...e,
          inChargeApproved: true,
          inChargeApprovedBy: e.inChargeApprovedBy || currentUserName,
          inChargeApprovedAt: e.inChargeApprovedAt || nowIso,
          isApproved: true,
          adminApproved: true,
          adminApprovedBy: currentUserName,
          adminApprovedAt: nowIso,
          approvedBy: currentUserName,
          approvedAt: nowIso,
          approvalStatus: 'approved' as const,
          hoDepositId: hoDepId,
          updatedAt: nowIso
        };
      }
      return e;
    });

    if (approvedNowCount === 0) return;

    setExpenses(updated);
    if (createdHoDepsCount > 0 && setBankDeposits) {
      setBankDeposits(updatedDeps);
      try {
        localStorage.setItem('polycables_bank_deposits', JSON.stringify(updatedDeps));
      } catch {}
      onSyncCloud?.({ expenses: updated, bankDeposits: updatedDeps }, true);
    } else {
      onSyncCloud?.({ expenses: updated }, true);
    }

    try {
      localStorage.setItem('polycables_expenses', JSON.stringify(updated));
    } catch {}

    setSelectedIds((prev) => prev.filter((id) => !idSet.has(id)));
    showToast(
      label
        ? `✓ Admin approved ${approvedNowCount} voucher(s) for ${label}`
        : `✓ Expense sanctioned & approved by Admin (${currentUserName})`
    );
  };

  // Handler: Undo Approval
  const handleUndoApproval = (expId: string) => {
    const nowIso = new Date().toISOString();
    const updated = expenses.map((e) => {
      if (e.id === expId && !isExcludedConveyanceOrLunchExpense(e) && isExpenseAuthorized(e)) {
        return {
          ...e,
          isApproved: false,
          adminApproved: false,
          adminApprovedBy: undefined,
          adminApprovedAt: undefined,
          approvedBy: undefined,
          approvedAt: undefined,
          approvalStatus: e.inChargeApproved ? ('pending_admin' as const) : ('pending_incharge' as const),
          hoDepositId: undefined,
          updatedAt: nowIso
        };
      }
      return e;
    });

    setExpenses(updated);
    try {
      localStorage.setItem('polycables_expenses', JSON.stringify(updated));
    } catch {}
    onSyncCloud?.({ expenses: updated }, true);
    showToast('✓ Expense approval reverted to pending.');
  };

  // Core batch Reject for a list of expense IDs
  const rejectIds = (targetIds: string[], reasonText: string, label?: string) => {
    const idSet = new Set(targetIds);
    const nowIso = new Date().toISOString();
    let count = 0;

    const updated = expenses.map((e) => {
      const isAppr = Boolean(e.isApproved || e.adminApproved || e.approvalStatus === 'approved');
      if (
        idSet.has(e.id) &&
        !isExcludedConveyanceOrLunchExpense(e) &&
        isExpenseAuthorized(e) &&
        !isAppr &&
        e.approvalStatus !== 'rejected'
      ) {
        count++;
        return {
          ...e,
          isApproved: false,
          approvalStatus: 'rejected' as const,
          remarks: `${e.remarks || ''} [Rejected by ${currentUserName}: ${reasonText || 'Declined'}]`.trim(),
          updatedAt: nowIso
        };
      }
      return e;
    });

    if (count === 0) return;
    setExpenses(updated);
    try {
      localStorage.setItem('polycables_expenses', JSON.stringify(updated));
    } catch {}
    onSyncCloud?.({ expenses: updated }, true);
    setSelectedIds((prev) => prev.filter((id) => !idSet.has(id)));
    showToast(
      label
        ? `✗ Rejected ${count} voucher(s) for ${label}`
        : `✗ Expense rejected by ${currentUserName}`
    );
  };

  // Reusable expanded vouchers sub-table (strictly date ascending)
  const renderVoucherSubTable = (vouchers: ExpenseEntry[]) => {
    // Only show unapproved vouchers when opened unless user explicitly switched to Approved/All tab
    const displayVouchers =
      statusFilter === 'approved' || statusFilter === 'all'
        ? vouchers
        : vouchers.filter(
            (v) =>
              !(v.isApproved || v.adminApproved || v.approvalStatus === 'approved') &&
              v.approvalStatus !== 'rejected'
          );

    if (displayVouchers.length === 0) {
      return (
        <div className="p-4 text-center text-xs text-slate-400 italic">
          All vouchers in this group have been approved.
        </div>
      );
    }

    return (
      <div className="overflow-x-auto bg-slate-950/90 border-t border-slate-800">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-900/90 border-b border-slate-800 text-[10px] font-black text-slate-400 uppercase tracking-wider">
              <th className="py-2 px-3 w-8 text-center no-print">
                <input
                  type="checkbox"
                  checked={
                    displayVouchers.length > 0 &&
                    displayVouchers.every((v) => selectedIds.includes(v.id))
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds((prev) =>
                        Array.from(new Set([...prev, ...displayVouchers.map((v) => v.id)]))
                      );
                    } else {
                      const set = new Set(displayVouchers.map((v) => v.id));
                      setSelectedIds((prev) => prev.filter((id) => !set.has(id)));
                    }
                  }}
                  className="rounded border-slate-700 bg-slate-800 text-emerald-500 cursor-pointer"
                />
              </th>
              <th className="py-2 px-3">Date (Asc)</th>
              <th className="py-2 px-3">Center / Person</th>
              <th className="py-2 px-3">Expense Head &amp; Remarks</th>
              <th className="py-2 px-3 text-right">Amount (৳)</th>
              <th className="py-2 px-3">Party Funding</th>
              <th className="py-2 px-3">Verification Stage</th>
              <th className="py-2 px-3 text-center no-print">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {displayVouchers.map((exp) => {
              const isAppr = Boolean(exp.isApproved || exp.adminApproved || exp.approvalStatus === 'approved');
              const isRej = exp.approvalStatus === 'rejected';
              const inChAppr = isExpInChargeApproved(exp);
              const isSelected = selectedIds.includes(exp.id);
              const mpName = resolveExpenseMarketingPerson(exp);

              return (
                <tr
                  key={exp.id}
                  className={`hover:bg-slate-800/40 transition-colors ${
                    isSelected ? 'bg-emerald-950/20' : ''
                  }`}
                >
                  <td className="py-2 px-3 text-center no-print">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds((prev) => [...prev, exp.id]);
                        } else {
                          setSelectedIds((prev) => prev.filter((id) => id !== exp.id));
                        }
                      }}
                      className="rounded border-slate-700 bg-slate-800 text-emerald-500 cursor-pointer"
                    />
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap font-mono font-bold text-slate-200">
                    {formatDateDDMMYY(exp.date)}
                  </td>
                  <td className="py-2 px-3">
                    <div className="font-bold text-white">{mpName || resolveExpenseSalesCenter(exp)}</div>
                    <div className="text-[10px] text-slate-400">{resolveExpenseSalesCenter(exp)}</div>
                  </td>
                  <td className="py-2 px-3 max-w-[260px]">
                    <div className="font-black text-amber-300">{exp.expenseHead}</div>
                    {exp.remarks && (
                      <div className="text-[11px] text-slate-400 truncate" title={exp.remarks}>
                        {exp.remarks}
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right font-black font-mono text-emerald-400 whitespace-nowrap">
                    ৳{Number(exp.amount || 0).toLocaleString('en-IN')}
                  </td>
                  <td className="py-2 px-3">
                    {exp.fundingPartyName ? (
                      <div className="flex items-center space-x-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-blue-950 text-blue-300 border border-blue-600/40 text-[11px] font-bold">
                          {exp.fundingPartyName}
                        </span>
                        {exp.hoDepositId && <BankLogoBadge bankName="H/O" size="sm" />}
                      </div>
                    ) : (
                      <span className="text-slate-500 italic text-[11px]">Direct Petty Cash</span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    {isRej ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-500/40 text-[11px] font-bold">
                        <X className="w-3 h-3" />
                        <span>Rejected</span>
                      </span>
                    ) : (
                      <div className="space-y-0.5 text-[11px]">
                        <div>
                          {inChAppr ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>In-Charge Approved</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-400 font-semibold">
                              <Clock className="w-3 h-3" />
                              <span>In-Charge Pending</span>
                            </span>
                          )}
                        </div>
                        <div>
                          {isAppr ? (
                            <span className="inline-flex items-center gap-1 text-emerald-300 font-black">
                              <ShieldCheck className="w-3 h-3 text-emerald-400" />
                              <span>Admin Approved</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-sky-400">
                              <Clock className="w-3 h-3" />
                              <span>Admin Approve Pending</span>
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center whitespace-nowrap no-print">
                    <div className="flex items-center justify-center space-x-1.5">
                      {!isRej && !inChAppr && (userIsInCharge || userIsAdmin) && (
                        <button
                          type="button"
                          onClick={() => approveInChargeIds([exp.id])}
                          className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-[11px] shadow-xs transition-colors cursor-pointer"
                          title="Approve as Sales Center In-Charge"
                        >
                          In-Charge Approve
                        </button>
                      )}
                      {!isRej && !isAppr && inChAppr && userIsAdmin && (
                        <button
                          type="button"
                          onClick={() => approveAdminIds([exp.id])}
                          className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-[11px] shadow-xs transition-colors cursor-pointer flex items-center space-x-1"
                          title="Next: Final Sanction & Approve as Admin"
                        >
                          <ShieldCheck className="w-3 h-3" />
                          <span>Admin Approve</span>
                        </button>
                      )}
                      {!isRej && !isAppr && (userIsInCharge || userIsAdmin) && (
                        <button
                          type="button"
                          onClick={() => {
                            setRejectionReason('');
                            setRejectionModalTarget({
                              ids: [exp.id],
                              label: `${exp.expenseHead} (৳${Number(exp.amount || 0).toLocaleString('en-IN')})`
                            });
                          }}
                          className="px-2 py-1 bg-rose-600/90 hover:bg-rose-500 text-white rounded-lg font-bold text-[11px] shadow-xs transition-colors cursor-pointer flex items-center space-x-1"
                          title="Reject Expense Voucher"
                        >
                          <X className="w-3 h-3" />
                          <span>Reject</span>
                        </button>
                      )}
                      {isAppr && userIsAdmin && (
                        <button
                          type="button"
                          onClick={() => handleUndoApproval(exp.id)}
                          className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Revert Approval"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // Reusable Grouped Summary Table Renderer
  const renderGroupedSection = (
    title: string,
    icon: React.ReactNode,
    groups: GroupedApprovalRow[],
    expandedMap: Record<string, boolean>,
    setExpandedMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
    entityColumnLabel: string
  ) => (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {icon}
          <h2 className="text-sm font-black text-white uppercase tracking-wide">{title}</h2>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            {groups.length} Groups
          </span>
        </div>
        <span className="text-[11px] text-slate-400">
          Click any row to view unapproved vouchers sorted Date Ascending
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="p-6 text-center text-xs text-slate-500 italic">
          No vouchers found matching current filters.
        </div>
      ) : (
        <div className="divide-y divide-slate-800">
          {/* Column Header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-slate-950 text-[11px] font-black text-slate-400 uppercase tracking-wider">
            <div className="col-span-4">{entityColumnLabel}</div>
            <div className="col-span-2 text-center">Total Voucher</div>
            <div className="col-span-2 text-right">Total Amount</div>
            <div className="col-span-4 text-right no-print">Action (In-Charge / Admin)</div>
          </div>

          {groups.map((grp) => {
            const isExpanded = Boolean(expandedMap[grp.groupKey]);
            const pendingInChargeIds = grp.vouchers
              .filter((v) => !isExpInChargeApproved(v) && !(v.isApproved || v.adminApproved || v.approvalStatus === 'approved') && v.approvalStatus !== 'rejected')
              .map((v) => v.id);
            const pendingAdminIds = grp.vouchers
              .filter((v) => isExpInChargeApproved(v) && !(v.isApproved || v.adminApproved || v.approvalStatus === 'approved') && v.approvalStatus !== 'rejected')
              .map((v) => v.id);
            const unapprovedIds = grp.vouchers
              .filter((v) => !(v.isApproved || v.adminApproved || v.approvalStatus === 'approved') && v.approvalStatus !== 'rejected')
              .map((v) => v.id);

            return (
              <div key={grp.groupKey} className="transition-colors">
                {/* Summary Row */}
                <div
                  onClick={() =>
                    setExpandedMap((prev) => ({
                      ...prev,
                      [grp.groupKey]: !prev[grp.groupKey]
                    }))
                  }
                  className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-slate-800/60 cursor-pointer select-none"
                >
                  <div className="col-span-4 flex items-center space-x-2 min-w-0">
                    <span className="text-emerald-400 shrink-0">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="font-black text-sm text-white truncate">{grp.displayName}</div>
                      {grp.subtitle && (
                        <div className="text-[10px] text-slate-400 truncate">{grp.subtitle}</div>
                      )}
                    </div>
                  </div>

                  <div className="col-span-2 text-center">
                    <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-xs font-black font-mono text-amber-300">
                      {grp.totalVoucherCount} {grp.totalVoucherCount === 1 ? 'Voucher' : 'Vouchers'}
                    </span>
                  </div>

                  <div className="col-span-2 text-right font-black font-mono text-emerald-400 text-sm">
                    ৳{Math.round(grp.totalAmount).toLocaleString('en-IN')}
                  </div>

                  <div
                    className="col-span-4 flex items-center justify-end gap-2 flex-wrap no-print"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {pendingInChargeIds.length > 0 && (userIsInCharge || userIsAdmin) && (
                      <button
                        type="button"
                        onClick={() => approveInChargeIds(pendingInChargeIds, grp.displayName)}
                        className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-[11px] shadow-xs transition-colors cursor-pointer flex items-center space-x-1"
                        title="Step 1: In-Charge Approve all pending vouchers in this group"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>In-Charge Approve ({pendingInChargeIds.length})</span>
                      </button>
                    )}

                    {pendingAdminIds.length > 0 && userIsAdmin && (
                      <button
                        type="button"
                        onClick={() => approveAdminIds(pendingAdminIds, grp.displayName)}
                        className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-[11px] shadow-xs transition-colors cursor-pointer flex items-center space-x-1"
                        title="Step 2: Admin Approve all In-Charge approved vouchers in this group"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Admin Approve ({pendingAdminIds.length})</span>
                      </button>
                    )}

                    {unapprovedIds.length > 0 && (userIsInCharge || userIsAdmin) && (
                      <button
                        type="button"
                        onClick={() => {
                          setRejectionReason('');
                          setRejectionModalTarget({
                            ids: unapprovedIds,
                            label: `${grp.displayName} (${unapprovedIds.length} Vouchers)`
                          });
                        }}
                        className="px-2.5 py-1.5 bg-rose-600/90 hover:bg-rose-500 text-white rounded-lg font-bold text-[11px] shadow-xs transition-colors cursor-pointer flex items-center space-x-1"
                        title="Reject all pending vouchers in this group"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reject ({unapprovedIds.length})</span>
                      </button>
                    )}

                    {unapprovedIds.length === 0 && (
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-950/60 text-emerald-400 border border-emerald-700/50 text-[11px] font-bold flex items-center space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>All Approved</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded Unapproved Vouchers (Date Ascending) */}
                {isExpanded && renderVoucherSubTable(grp.vouchers)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4 max-w-7xl mx-auto w-full px-2 sm:px-4 py-2 text-slate-100 expense-statement-sheet">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white font-bold text-sm px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-2 animate-bounce no-print">
          <CheckCircle2 className="w-5 h-5" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="bg-slate-900 border border-slate-800 p-3.5 sm:p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xl no-print">
        <div className="flex items-center space-x-3">
          <div className="bg-emerald-600 p-2.5 rounded-xl text-white shadow-md shadow-emerald-600/30">
            <Receipt className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
              <span>Approve Expense</span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                Sales Center &amp; Marketing Person Wise
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Click a Sales Center or Marketing Person to expand unapproved vouchers sorted Date Ascending, or approve directly.
            </p>
          </div>
        </div>

        {/* Action Controls: Print, Back, Close */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 border border-slate-700 shadow-sm"
            title="Print Expense Approval Statement"
          >
            <Printer className="w-3.5 h-3.5 text-amber-400" />
            <span>Print</span>
          </button>

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 border border-slate-700 shadow-sm"
              title="Back to Previous Page"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 border border-rose-800/50 shadow-sm"
              title="Close View"
            >
              <X className="w-3.5 h-3.5" />
              <span>Close</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className={`grid grid-cols-2 ${userIsAdmin ? 'md:grid-cols-3' : 'md:grid-cols-4'} gap-3 no-print`}>
        {!userIsAdmin && (
          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl shadow-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pending In-Charge</span>
              <div className="text-xl font-black text-amber-400 mt-0.5">{metrics.pendingInChargeCount}</div>
              <div className="text-[10px] text-slate-500 font-semibold">Requires In-Charge verification</div>
            </div>
            <div className="p-2.5 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        )}

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pending Admin</span>
            <div className="text-xl font-black text-sky-400 mt-0.5">{metrics.pendingAdminCount}</div>
            <div className="text-[10px] text-slate-500 font-semibold">Awaiting final Admin sanction</div>
          </div>
          <div className="p-2.5 bg-sky-500/10 rounded-xl border border-sky-500/20 text-sky-400">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Approved Vouchers</span>
            <div className="text-xl font-black text-emerald-400 mt-0.5">{metrics.approvedCount}</div>
            <div className="text-[10px] text-slate-500 font-semibold">Sanctioned &amp; settled</div>
          </div>
          <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pending Amount</span>
            <div className="text-xl font-black text-white mt-0.5">৳{metrics.totalPendingAmt.toLocaleString('en-IN')}</div>
            <div className="text-[10px] text-slate-500 font-semibold">
              Approved: ৳{metrics.totalApprovedAmt.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="p-2.5 bg-blue-500/10 rounded-xl border border-blue-500/20 text-blue-400">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-[#081e2d]/85 backdrop-blur-xl border border-cyan-500/25 p-2.5 px-3.5 rounded-2xl shadow-lg space-y-2 text-white text-xs no-print">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Status Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1 bg-[#061520]/90 p-0.5 rounded-xl border border-cyan-500/30 text-xs font-bold">
            <button
              type="button"
              onClick={() => setStatusFilter('unapproved')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                statusFilter === 'unapproved'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              All Unapproved ({metrics.unapprovedCount})
            </button>
            {!userIsAdmin && (
              <button
                type="button"
                onClick={() => setStatusFilter('pending_incharge')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  statusFilter === 'pending_incharge'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-amber-400 hover:text-white'
                }`}
              >
                Pending In-Charge ({metrics.pendingInChargeCount})
              </button>
            )}
            <button
              type="button"
              onClick={() => setStatusFilter('pending_admin')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                statusFilter === 'pending_admin'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-sky-400 hover:text-white'
              }`}
            >
              Pending Admin ({metrics.pendingAdminCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('approved')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                statusFilter === 'approved'
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'text-emerald-400 hover:text-white'
              }`}
            >
              Approved ({metrics.approvedCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({roleVisibleExpenses.length})
            </button>
          </div>

          {/* Batch Actions for Selected Checkboxes */}
          {selectedIds.length > 0 && userIsInCharge && (
            <button
              type="button"
              onClick={() => approveInChargeIds(selectedIds)}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 shadow-md shadow-amber-600/30 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>In-Charge Approve Selected ({selectedIds.length})</span>
            </button>
          )}
          {selectedIds.length > 0 && userIsAdmin && (
            <button
              type="button"
              onClick={() => approveAdminIds(selectedIds)}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 shadow-md shadow-emerald-600/30 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Admin Approve Selected ({selectedIds.length})</span>
            </button>
          )}
        </div>

        {/* Secondary Dimension Filters: Branch, Year, Month, Search & Reset */}
        <div className="flex flex-wrap items-center gap-2 text-xs pt-2 border-t border-cyan-500/20">
          {/* Branch Dropdown */}
          <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
            <Building2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="text-cyan-200/80 font-bold text-[11px] whitespace-nowrap">Sales Center:</span>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="bg-transparent text-cyan-100 font-bold text-xs focus:outline-none cursor-pointer"
            >
              <option value="" className="bg-[#091e2c] text-white">-- Individual Sales Centers --</option>
              {branchOptions.map((b) => (
                <option key={b} value={b} className="bg-[#091e2c] text-white">
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Year */}
          <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
            <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="text-cyan-200/80 font-bold text-[11px] whitespace-nowrap">Year:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-transparent text-cyan-100 font-bold text-xs focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-[#091e2c] text-white">All Years</option>
              <option value="2026" className="bg-[#091e2c] text-white">2026</option>
              <option value="2025" className="bg-[#091e2c] text-white">2025</option>
            </select>
          </div>

          {/* Month */}
          <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
            <span className="text-cyan-200/80 font-bold text-[11px] whitespace-nowrap">Month:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-cyan-100 font-bold text-xs focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-[#091e2c] text-white">All Months</option>
              <option value="01" className="bg-[#091e2c] text-white">January</option>
              <option value="02" className="bg-[#091e2c] text-white">February</option>
              <option value="03" className="bg-[#091e2c] text-white">March</option>
              <option value="04" className="bg-[#091e2c] text-white">April</option>
              <option value="05" className="bg-[#091e2c] text-white">May</option>
              <option value="06" className="bg-[#091e2c] text-white">June</option>
              <option value="07" className="bg-[#091e2c] text-white">July</option>
              <option value="08" className="bg-[#091e2c] text-white">August</option>
              <option value="09" className="bg-[#091e2c] text-white">September</option>
              <option value="10" className="bg-[#091e2c] text-white">October</option>
              <option value="11" className="bg-[#091e2c] text-white">November</option>
              <option value="12" className="bg-[#091e2c] text-white">December</option>
            </select>
          </div>

          {/* Search Box */}
          <div className="flex-1 min-w-[200px] relative">
            <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sales center, marketing person, head, party, amount..."
              className="w-full pl-8 pr-7 py-1.5 h-[34px] text-xs bg-[#061520]/90 text-white placeholder-slate-400 border border-cyan-500/30 rounded-xl focus:ring-1 focus:ring-cyan-400 focus:outline-none font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 text-xs font-bold cursor-pointer"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {(selectedBranch !== '' || selectedYear !== 'all' || selectedMonth !== 'all' || searchQuery || statusFilter !== 'unapproved') && (
            <button
              type="button"
              onClick={() => {
                setSelectedBranch('');
                setSelectedYear('all');
                setSelectedMonth('all');
                setSearchQuery('');
                setStatusFilter('unapproved');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 h-[34px] text-xs font-bold text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/35 rounded-xl transition-colors cursor-pointer shrink-0"
              title="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-300" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* SECTION 1: SALES CENTER WISE SUMMARY + EXPANDABLE DATE-ASCENDING VOUCHERS */}
      {renderGroupedSection(
        'Sales Center Wise Expense Approval',
        <Building2 className="w-4 h-4 text-emerald-400" />,
        salesCenterGroups,
        expandedCenters,
        setExpandedCenters,
        'Sales Center Name'
      )}

      {/* SECTION 2: MARKETING PERSON WISE SUMMARY + EXPANDABLE DATE-ASCENDING VOUCHERS */}
      {renderGroupedSection(
        'Marketing Person Wise Expense Approval',
        <Users className="w-4 h-4 text-amber-400" />,
        marketingPersonGroups,
        expandedPersons,
        setExpandedPersons,
        'Marketing Person Name'
      )}
      {/* Rejection Reason Modal */}
      {rejectionModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm no-print">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                <span>Reject Expense Voucher(s)</span>
              </h3>
              <button
                type="button"
                onClick={() => setRejectionModalTarget(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-300">
              Rejecting <span className="font-bold text-white">{rejectionModalTarget.label}</span>.
            </p>
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">Reason for Rejection:</label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter explanation for rejection..."
                rows={3}
                className="w-full p-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
              />
            </div>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectionModalTarget(null)}
                className="px-4 py-2 text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  rejectIds(rejectionModalTarget.ids, rejectionReason, rejectionModalTarget.label);
                  setRejectionModalTarget(null);
                  setRejectionReason('');
                }}
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
