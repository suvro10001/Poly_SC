import React, { useMemo, useState } from 'react';
import {
  AuthUser,
  Requisition,
  ConveyanceEntry,
  Salesperson,
  BranchLocation,
  Party,
  CompanyDetails,
  ExpenseEntry
} from '../types';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Building2,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  X
} from 'lucide-react';
import { formatDateDDMMYY, parseDateToISO } from '../utils/dateUtils';
import {
  isStrictSuperAdmin,
  isAnyAdmin,
  isInCharge,
  getAdminBranches,
  getUserBranch,
  cleanBranchName
} from '../utils/branchAccess';

interface ApprovedHubPageProps {
  currentUser?: AuthUser | null;
  requisitions?: Requisition[];
  setRequisitions?: React.Dispatch<React.SetStateAction<Requisition[]>>;
  conveyances?: ConveyanceEntry[];
  setConveyances?: React.Dispatch<React.SetStateAction<ConveyanceEntry[]>>;
  expenses?: ExpenseEntry[];
  setExpenses?: React.Dispatch<React.SetStateAction<ExpenseEntry[]>>;
  salespersons: Salesperson[];
  branches: BranchLocation[];
  allBranches?: BranchLocation[];
  allSalespersons?: Salesperson[];
  parties?: Party[];
  company: CompanyDetails;
  onSyncCloud?: (patch: Record<string, any>, immediate?: boolean) => void;
  onNavigateToRequisition?: (subTab: 'approved_history' | 'delivered' | 'list') => void;
  onNavigateToConveyance?: () => void;
  onBack?: () => void;
  onClose?: () => void;
}

interface DateGroup {
  dateKey: string;
  dateLabel: string;
  vouchers: ExpenseEntry[];
  totalAmount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
}

interface SalesCenterGroup {
  centerKey: string;
  centerName: string;
  branchId?: string;
  vouchers: ExpenseEntry[];
  dateGroups: DateGroup[];
  totalAmount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
}

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

export const ApprovedHubPage: React.FC<ApprovedHubPageProps> = ({
  currentUser,
  expenses = [],
  setExpenses,
  salespersons = [],
  branches = [],
  allBranches = [],
  allSalespersons = [],
  parties = [],
  onSyncCloud,
  onBack,
  onClose
}) => {
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [expandedCenters, setExpandedCenters] = useState<Set<string>>(() => new Set());
  const [rejectionTarget, setRejectionTarget] = useState<{ ids: string[]; label: string } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const isSuperAdminUser = isStrictSuperAdmin(currentUser);
  const isAdminRole = isAnyAdmin(currentUser) || currentUser?.role === 'super_admin' || currentUser?.role === 'admin' || currentUser?.role === 'accounts';

  const effectiveBranches = useMemo(
    () => (allBranches && allBranches.length > 0 ? allBranches : branches),
    [allBranches, branches]
  );

  const effectiveSalespersons = useMemo(
    () => (allSalespersons && allSalespersons.length > 0 ? allSalespersons : salespersons),
    [allSalespersons, salespersons]
  );

  const userInCharge = useMemo(
    () => !isSuperAdminUser && !isAdminRole && isInCharge(currentUser, effectiveSalespersons, effectiveBranches),
    [isSuperAdminUser, isAdminRole, currentUser, effectiveSalespersons, effectiveBranches]
  );

  // Determine strictly mapped Sales Centers this user/admin is authorized to view & approve
  const authorizedBranches = useMemo(() => {
    if (!currentUser) return [];
    if (isSuperAdminUser) return effectiveBranches;

    if (isAdminRole) {
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
      const ub = getUserBranch(currentUser, effectiveSalespersons, effectiveBranches);
      const matched = effectiveBranches.filter(
        (b) =>
          (ub.branchId && b.id.toLowerCase() === ub.branchId.toLowerCase()) ||
          (ub.branchName && cleanBranchName(b.name).toLowerCase() === cleanBranchName(ub.branchName).toLowerCase())
      );
      return matched;
    }

    return [];
  }, [currentUser, isSuperAdminUser, isAdminRole, userInCharge, effectiveBranches, effectiveSalespersons]);

  const authorizedCenterKeys = useMemo(
    () => new Set(authorizedBranches.map((b) => b.id.toLowerCase().trim())),
    [authorizedBranches]
  );

  const authorizedCenterNames = useMemo(
    () => new Set(authorizedBranches.map((b) => cleanBranchName(b.name).toLowerCase().trim()).filter(Boolean)),
    [authorizedBranches]
  );

  const authorizedCenterCoreKeys = useMemo(
    () => new Set(authorizedBranches.map((b) => normalizeSalesCenterCoreKey(b.name)).filter(Boolean)),
    [authorizedBranches]
  );

  const isCenterAuthorizedForCurrentUser = (centerKey: string, centerName: string, branchId?: string): boolean => {
    if (isSuperAdminUser) return true;
    const keyLow = centerKey.toLowerCase().trim();
    const cleanLow = cleanBranchName(centerName).toLowerCase().trim();
    const coreLow = normalizeSalesCenterCoreKey(centerName);
    const branchIdLow = String(branchId || '').toLowerCase().trim();
    if (!keyLow && !cleanLow && !coreLow && !branchIdLow) return false;
    return (
      (branchIdLow ? authorizedCenterKeys.has(branchIdLow) : false) ||
      authorizedCenterKeys.has(keyLow) ||
      authorizedCenterNames.has(cleanLow) ||
      authorizedCenterCoreKeys.has(coreLow)
    );
  };

  const canApproveCenter = (centerKey: string, centerName: string, branchId?: string): boolean => {
    if (isSuperAdminUser) return true;
    if (!isAdminRole && !userInCharge) return false;
    return isCenterAuthorizedForCurrentUser(centerKey, centerName, branchId);
  };

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

  const resolveExpenseSalesCenter = (exp: ExpenseEntry): { centerKey: string; centerName: string; branchId?: string } => {
    const spMatch =
      exp.createdById || exp.entityName || (exp as any).marketingPerson
        ? effectiveSalespersons.find(
            (s) =>
              (exp.createdById && (s.id === exp.createdById || s.code === exp.createdById)) ||
              (exp.entityName && s.name?.trim().toLowerCase() === exp.entityName.trim().toLowerCase()) ||
              ((exp as any).marketingPerson && s.name?.trim().toLowerCase() === String((exp as any).marketingPerson).trim().toLowerCase())
          )
        : undefined;

    const partyMatch =
      exp.fundingPartyName
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
    const canonicalMatch =
      canonicalById ||
      (rawBranchCore ? canonicalBranchLookup.byCore.get(rawBranchCore) : undefined) ||
      (rawBranchCore.length >= 4
        ? canonicalBranchLookup.list.find(
            (b) => b.coreKey.length >= 4 && (b.coreKey.includes(rawBranchCore) || rawBranchCore.includes(b.coreKey))
          )
        : undefined);

    if (canonicalMatch) {
      return {
        centerKey: canonicalMatch.centerKey,
        centerName: canonicalMatch.centerName,
        branchId: canonicalMatch.branchId || branchIdCandidate || undefined
      };
    }

    const centerName = !isAllSalesCentersLabel(rawBranchClean) && rawBranchClean ? rawBranchClean : 'Unassigned Center';
    const centerKey = `center:${normalizeSalesCenterCoreKey(centerName) || 'unassigned'}`;
    return { centerKey, centerName, branchId: branchIdCandidate || undefined };
  };

  // Group authorized expenses by Individual Sales Center -> Date-Wise (dd.mm.yy) -> Individual Vouchers
  // Never includes an "All Sales Centers" bucket, excludes Conveyance/Lunch/Tiffin, and deduplicates Sales Center names
  const salesCenterGroups = useMemo<SalesCenterGroup[]>(() => {
    const centerMap = new Map<
      string,
      {
        centerKey: string;
        centerName: string;
        branchId?: string;
        vouchers: ExpenseEntry[];
        totalAmount: number;
        pendingCount: number;
        approvedCount: number;
        rejectedCount: number;
      }
    >();
    const branchIdToCenterKey = new Map<string, string>();

    expenses.forEach((exp) => {
      if (!exp || isExcludedConveyanceOrLunchExpense(exp)) return;
      const { centerKey: resolvedKey, centerName, branchId } = resolveExpenseSalesCenter(exp);
      if (isAllSalesCentersLabel(centerName)) return;
      if (!isCenterAuthorizedForCurrentUser(resolvedKey, centerName, branchId)) return;

      const bIdLow = String(branchId || exp.branchId || '').trim().toLowerCase();
      const targetKey = (bIdLow && branchIdToCenterKey.get(bIdLow)) || resolvedKey;

      let group = centerMap.get(targetKey);
      if (!group) {
        group = {
          centerKey: targetKey,
          centerName,
          branchId: branchId || exp.branchId,
          vouchers: [],
          totalAmount: 0,
          pendingCount: 0,
          approvedCount: 0,
          rejectedCount: 0
        };
        centerMap.set(targetKey, group);
      } else {
        if (!group.branchId && (branchId || exp.branchId)) group.branchId = branchId || exp.branchId;
        if (centerName.length > group.centerName.length && /sales cent/i.test(centerName)) {
          group.centerName = centerName;
        }
      }
      if (bIdLow) branchIdToCenterKey.set(bIdLow, targetKey);

      const amt = Number(exp.amount) || 0;
      const isApproved = Boolean(exp.isApproved || exp.approvalStatus === 'approved');
      const isRejected = exp.approvalStatus === 'rejected';

      group.vouchers.push(exp);
      group.totalAmount += amt;
      if (isRejected) group.rejectedCount += 1;
      else if (isApproved) group.approvedCount += 1;
      else group.pendingCount += 1;
    });

    const groups: SalesCenterGroup[] = Array.from(centerMap.values())
      .filter((center) => center.vouchers.length > 0)
      .map((center) => {
        const dateMap = new Map<string, DateGroup>();

        center.vouchers.forEach((exp) => {
          const dateKey = parseDateToISO(exp.date) || String(exp.date || '').trim() || 'unknown';
          const dateLabel = formatDateDDMMYY(exp.date) || String(exp.date || 'Unknown Date');
          let dg = dateMap.get(dateKey);
          if (!dg) {
            dg = {
              dateKey,
              dateLabel,
              vouchers: [],
              totalAmount: 0,
              pendingCount: 0,
              approvedCount: 0,
              rejectedCount: 0
            };
            dateMap.set(dateKey, dg);
          }

          const amt = Number(exp.amount) || 0;
          const isApproved = Boolean(exp.isApproved || exp.approvalStatus === 'approved');
          const isRejected = exp.approvalStatus === 'rejected';

          dg.vouchers.push(exp);
          dg.totalAmount += amt;
          if (isRejected) dg.rejectedCount += 1;
          else if (isApproved) dg.approvedCount += 1;
          else dg.pendingCount += 1;
        });

        const sortedVouchers = [...center.vouchers].sort((a, b) => {
          const isoA = parseDateToISO(a.date) || String(a.date || '').trim() || '';
          const isoB = parseDateToISO(b.date) || String(b.date || '').trim() || '';
          if (isoA !== isoB) return isoA.localeCompare(isoB);
          return String(a.id || '').localeCompare(String(b.id || ''));
        });

        const dateGroups = Array.from(dateMap.values())
          .map((dg) => ({
            ...dg,
            vouchers: [...dg.vouchers].sort((a, b) => {
              const isoA = parseDateToISO(a.date) || String(a.date || '').trim() || '';
              const isoB = parseDateToISO(b.date) || String(b.date || '').trim() || '';
              if (isoA !== isoB) return isoA.localeCompare(isoB);
              return String(a.id || '').localeCompare(String(b.id || ''));
            })
          }))
          .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

        return {
          ...center,
          vouchers: sortedVouchers,
          dateGroups
        };
      });

    return groups.sort((a, b) => {
      if (b.pendingCount !== a.pendingCount) return b.pendingCount - a.pendingCount;
      if (b.totalAmount !== a.totalAmount) return b.totalAmount - a.totalAmount;
      return a.centerName.localeCompare(b.centerName);
    });
  }, [expenses, effectiveBranches, effectiveSalespersons, parties, authorizedCenterKeys, authorizedCenterNames, authorizedCenterCoreKeys, isSuperAdminUser]);

  const toggleCenter = (centerKey: string) => {
    setExpandedCenters((prev) => {
      const next = new Set(prev);
      if (next.has(centerKey)) next.delete(centerKey);
      else next.add(centerKey);
      return next;
    });
  };

  const showNotice = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleApproveExpense = (exp: ExpenseEntry) => {
    if (isExcludedConveyanceOrLunchExpense(exp)) return;
    const { centerKey, centerName, branchId } = resolveExpenseSalesCenter(exp);
    if (!canApproveCenter(centerKey, centerName, branchId)) {
      showNotice(`Permission denied: you are not the authorized admin for ${centerName}.`, 'error');
      return;
    }
    const approver = currentUser?.name || currentUser?.username || 'Admin';
    const hasFundingParty = Boolean(exp.fundingPartyName && exp.fundingPartyName.trim());
    const hoDepId =
      exp.hoDepositId ||
      (hasFundingParty ? `dep-ho-${Date.now()}-${Math.random().toString(36).substring(2, 6)}` : undefined);

    const updated = expenses.map((item) => {
      if (item.id !== exp.id) return item;
      return {
        ...item,
        isApproved: true,
        approvalStatus: 'approved' as const,
        approvedBy: approver,
        approvedAt: new Date().toISOString(),
        hoDepositId: hasFundingParty ? hoDepId : item.hoDepositId,
        updatedAt: new Date().toISOString()
      };
    });

    if (setExpenses) setExpenses(updated);
    try {
      localStorage.setItem('polycables_expenses', JSON.stringify(updated));
    } catch {}
    onSyncCloud?.({ expenses: updated }, true);
    showNotice(`Approved expense (${exp.expenseHead}) — ৳${(Number(exp.amount) || 0).toLocaleString('en-IN')}`);
  };

  const handleApproveCenter = (center: SalesCenterGroup) => {
    if (!canApproveCenter(center.centerKey, center.centerName, center.branchId)) {
      showNotice(`Permission denied: you are not the authorized admin for ${center.centerName}.`, 'error');
      return;
    }
    const targetIds = new Set(
      center.vouchers
        .filter((v) => !isExcludedConveyanceOrLunchExpense(v) && !v.isApproved && v.approvalStatus !== 'approved' && v.approvalStatus !== 'rejected')
        .map((v) => v.id)
    );
    if (targetIds.size === 0) return;

    const approver = currentUser?.name || currentUser?.username || 'Admin';
    const nowIso = new Date().toISOString();

    const updated = expenses.map((item) => {
      if (!targetIds.has(item.id)) return item;
      const hasFundingParty = Boolean(item.fundingPartyName && item.fundingPartyName.trim());
      const hoDepId =
        item.hoDepositId ||
        (hasFundingParty ? `dep-ho-${Date.now()}-${Math.random().toString(36).substring(2, 6)}` : undefined);
      return {
        ...item,
        isApproved: true,
        approvalStatus: 'approved' as const,
        approvedBy: approver,
        approvedAt: nowIso,
        hoDepositId: hasFundingParty ? hoDepId : item.hoDepositId,
        updatedAt: nowIso
      };
    });

    if (setExpenses) setExpenses(updated);
    try {
      localStorage.setItem('polycables_expenses', JSON.stringify(updated));
    } catch {}
    onSyncCloud?.({ expenses: updated }, true);
    showNotice(`Approved ${targetIds.size} voucher(s) for ${center.centerName}`);
  };

  const handleRejectExpense = (exp: ExpenseEntry) => {
    if (isExcludedConveyanceOrLunchExpense(exp)) return;
    const { centerKey, centerName, branchId } = resolveExpenseSalesCenter(exp);
    if (!canApproveCenter(centerKey, centerName, branchId)) {
      showNotice(`Permission denied: you are not the authorized admin for ${centerName}.`, 'error');
      return;
    }
    setRejectionTarget({
      ids: [exp.id],
      label: `${exp.expenseHead || 'Expense'} — ৳${(Number(exp.amount) || 0).toLocaleString('en-IN')}`
    });
    setRejectionReason('');
  };

  const handleRejectCenter = (center: SalesCenterGroup) => {
    if (!canApproveCenter(center.centerKey, center.centerName, center.branchId)) {
      showNotice(`Permission denied: you are not the authorized admin for ${center.centerName}.`, 'error');
      return;
    }
    const targetIds = center.vouchers
      .filter((v) => !isExcludedConveyanceOrLunchExpense(v) && v.approvalStatus !== 'rejected')
      .map((v) => v.id);
    if (targetIds.length === 0) return;

    setRejectionTarget({
      ids: targetIds,
      label: `${center.centerName} (${targetIds.length} Voucher${targetIds.length === 1 ? '' : 's'} • ৳${center.totalAmount.toLocaleString('en-IN')})`
    });
    setRejectionReason('');
  };

  const handleConfirmReject = () => {
    if (!rejectionTarget || rejectionTarget.ids.length === 0) return;
    const targetSet = new Set(rejectionTarget.ids);
    const reasonText = rejectionReason.trim() || 'Rejected by Admin';
    const rejector = currentUser?.name || currentUser?.username || 'Admin';
    const nowIso = new Date().toISOString();

    const updated = expenses.map((item) => {
      if (!targetSet.has(item.id)) return item;
      return {
        ...item,
        isApproved: false,
        approvalStatus: 'rejected' as const,
        rejectionReason: reasonText,
        rejectedBy: rejector,
        rejectedAt: nowIso,
        updatedAt: nowIso
      };
    });

    if (setExpenses) setExpenses(updated);
    try {
      localStorage.setItem('polycables_expenses', JSON.stringify(updated));
    } catch {}
    onSyncCloud?.({ expenses: updated }, true);
    showNotice(`Rejected ${targetSet.size} expense${targetSet.size === 1 ? '' : 's'} (${rejectionTarget.label})`, 'error');
    setRejectionTarget(null);
    setRejectionReason('');
  };

  return (
    <div className="w-full space-y-3 text-white font-sans">
      {toast && (
        <div
          className={`fixed top-16 right-4 z-50 px-4 py-2.5 rounded-xl shadow-xl flex items-center space-x-2 text-xs font-bold border ${
            toast.type === 'success'
              ? 'bg-emerald-600/95 border-emerald-400/50 text-white'
              : 'bg-rose-600/95 border-rose-400/50 text-white'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="cyber-glass-card rounded-2xl px-4 py-3 grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="hidden sm:block" />
        <div className="text-center">
          <h2 className="text-base sm:text-lg font-black text-white tracking-tight">Approve Expense</h2>
          <p className="text-[11px] text-cyan-200/80 font-medium">
            {salesCenterGroups.length} Sales {salesCenterGroups.length === 1 ? 'Center' : 'Centers'} • Click any Sales Center to view date-wise expenses
          </p>
        </div>
        <div className="flex items-center justify-center sm:justify-end gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-xl text-cyan-200 bg-[#081b28] hover:bg-[#0e2a3d] hover:text-white border border-cyan-500/30 transition-all cursor-pointer"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-rose-300 bg-rose-500/20 hover:bg-rose-500/30 hover:text-white border border-rose-400/40 transition-all cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Level 1: Sales Center-Wise Grouping (Default View) */}
      {salesCenterGroups.length === 0 ? (
        <div className="cyber-glass-card rounded-2xl p-8 text-center text-xs text-slate-400">
          No expense entries found for approval
        </div>
      ) : (
        <div className="space-y-2.5">
          {salesCenterGroups.map((center) => {
            const isCenterExpanded = expandedCenters.has(center.centerKey);
            const isAuthorized = canApproveCenter(center.centerKey, center.centerName, center.branchId);
            const pendingCenterCount = center.vouchers.filter(
              (v) => !v.isApproved && v.approvalStatus !== 'approved' && v.approvalStatus !== 'rejected'
            ).length;
            const rejectableCenterCount = center.vouchers.filter(
              (v) => v.approvalStatus !== 'rejected'
            ).length;

            return (
              <div
                key={center.centerKey}
                className="cyber-glass-card rounded-2xl overflow-hidden border border-cyan-500/25 shadow-xl"
              >
                {/* Sales Center Summary Card / Row */}
                <div
                  onClick={() => toggleCenter(center.centerKey)}
                  className="px-4 py-3 bg-[#0c2638]/90 hover:bg-[#10324a] transition-colors cursor-pointer select-none flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-cyan-300 shrink-0">
                      {isCenterExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </span>
                    <div className="p-1.5 rounded-lg bg-cyan-500/15 border border-cyan-400/30 shrink-0">
                      <Building2 className="w-4 h-4 text-cyan-300" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-sm text-white truncate">{center.centerName}</div>
                      <div className="text-[11px] text-slate-300 font-medium">
                        Total Vouchers: <span className="font-bold text-cyan-200">{center.vouchers.length}</span> •{' '}
                        {center.dateGroups.length} {center.dateGroups.length === 1 ? 'Date' : 'Dates'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    <span className="bg-cyan-500/15 text-cyan-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-cyan-400/30">
                      {center.vouchers.length} {center.vouchers.length === 1 ? 'Voucher' : 'Vouchers'}
                    </span>

                    {center.pendingCount > 0 ? (
                      <span className="bg-amber-500/20 text-amber-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-amber-400/35">
                        {center.pendingCount} Pending
                      </span>
                    ) : center.approvedCount > 0 ? (
                      <span className="bg-emerald-500/20 text-emerald-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-400/35">
                        All Approved ({center.approvedCount})
                      </span>
                    ) : null}

                    {center.rejectedCount > 0 && (
                      <span className="bg-rose-500/20 text-rose-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-rose-400/35">
                        {center.rejectedCount} Rejected
                      </span>
                    )}

                    <div className="text-right font-mono font-black text-emerald-300 text-sm whitespace-nowrap">
                      ৳{center.totalAmount.toLocaleString('en-IN')}
                    </div>

                    {isAuthorized && (pendingCenterCount > 0 || rejectableCenterCount > 0) && (
                      <div
                        className="flex items-center gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {pendingCenterCount > 0 && (
                          <button
                            type="button"
                            onClick={() => handleApproveCenter(center)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-[11px] font-black transition-colors cursor-pointer"
                            title={`Approve all ${pendingCenterCount} pending vouchers in ${center.centerName}`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve ({pendingCenterCount})</span>
                          </button>
                        )}
                        {rejectableCenterCount > 0 && (
                          <button
                            type="button"
                            onClick={() => handleRejectCenter(center)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-600/90 hover:bg-rose-500 text-white rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                            title={`Reject vouchers in ${center.centerName}`}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject ({rejectableCenterCount})</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded Sales Center: All Expenses Listed Directly in Ascending Date Order */}
                {isCenterExpanded && (
                  <div className="border-t border-cyan-500/20 bg-[#071824]/85">
                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-x-auto w-full">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-[#0c2638] text-cyan-200 font-bold uppercase text-[10px] border-b border-cyan-500/30 select-none">
                            <th className="py-2 px-2 w-10 text-center">SL</th>
                            <th className="py-2 px-2 w-24">Date ↑</th>
                            <th className="py-2 px-2">Center / Person</th>
                            <th className="py-2 px-2">Expense Head</th>
                            <th className="py-2 px-2">Funding Party</th>
                            <th className="py-2 px-2">Remarks</th>
                            <th className="py-2 px-2 w-28 text-right font-black text-white">Amount</th>
                            <th className="py-2 px-2 w-24 text-center">Status</th>
                            <th className="py-2 px-2 w-40 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                          {center.vouchers.map((exp, idx) => {
                            const isApproved = Boolean(exp.isApproved || exp.approvalStatus === 'approved');
                            const isRejected = exp.approvalStatus === 'rejected';

                            return (
                              <tr key={exp.id || idx} className="hover:bg-cyan-500/[0.06] transition-colors">
                                <td className="py-2 px-2 text-center font-mono text-slate-400">{idx + 1}</td>
                                <td className="py-2 px-2 font-mono font-bold text-cyan-200 whitespace-nowrap">
                                  {formatDateDDMMYY(exp.date) || exp.date}
                                </td>
                                <td className="py-2 px-2 font-bold text-white">
                                  <div>{exp.entityName || exp.branchName || exp.staffName || '-'}</div>
                                  {exp.branchName && exp.branchName !== exp.entityName && (
                                    <div className="text-[10px] text-slate-400 font-normal">
                                      {exp.branchName}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2 px-2 font-semibold text-amber-200">
                                  {exp.expenseHead || '-'}
                                </td>
                                <td className="py-2 px-2 text-slate-300">{exp.fundingPartyName || '-'}</td>
                                <td className="py-2 px-2 text-slate-400 max-w-[220px] truncate">
                                  {exp.remarks || '-'}
                                </td>
                                <td className="py-2 px-2 text-right font-mono font-black text-emerald-300 whitespace-nowrap">
                                  ৳{(Number(exp.amount) || 0).toLocaleString('en-IN')}
                                </td>
                                <td className="py-2 px-2 text-center">
                                  {isApproved ? (
                                    <span className="bg-emerald-500/20 text-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-400/35">
                                      Approved
                                    </span>
                                  ) : isRejected ? (
                                    <span className="bg-rose-500/20 text-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-400/35">
                                      Rejected
                                    </span>
                                  ) : (
                                    <span className="bg-amber-500/20 text-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-400/35">
                                      Pending
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-2 text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                    {isAuthorized && !isApproved && !isRejected && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleApproveExpense(exp)}
                                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded text-[10px] font-black transition-colors cursor-pointer"
                                          title="Approve Expense"
                                        >
                                          <CheckCircle2 className="w-3 h-3" />
                                          <span>Approve</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleRejectExpense(exp)}
                                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-600/90 hover:bg-rose-500 text-white rounded text-[10px] font-bold transition-colors cursor-pointer"
                                          title="Reject Expense"
                                        >
                                          <XCircle className="w-3 h-3" />
                                          <span>Reject</span>
                                        </button>
                                      </>
                                    )}
                                    {(isApproved || isRejected) && (
                                      <span className="text-[10px] text-slate-400 font-medium">
                                        {exp.approvedBy || (isRejected ? 'Rejected' : 'Approved')}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Cards (Ascending Date Order) */}
                    <div className="block md:hidden p-2.5 space-y-2">
                      {center.vouchers.map((exp, idx) => {
                        const isApproved = Boolean(exp.isApproved || exp.approvalStatus === 'approved');
                        const isRejected = exp.approvalStatus === 'rejected';

                        return (
                          <div
                            key={exp.id || idx}
                            className="p-3 rounded-xl border border-cyan-500/25 cyber-glass-subcard space-y-1.5 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono font-bold text-cyan-300">
                                {idx + 1}. {formatDateDDMMYY(exp.date) || exp.date}
                              </span>
                              <span className="font-mono font-black text-emerald-300">
                                ৳{(Number(exp.amount) || 0).toLocaleString('en-IN')}
                              </span>
                            </div>
                            <div className="font-bold text-white">
                              {exp.entityName || exp.branchName || '-'}
                            </div>
                            <div className="text-amber-200 font-semibold">{exp.expenseHead}</div>
                            {exp.fundingPartyName && (
                              <div className="text-[11px] text-slate-300">Party: {exp.fundingPartyName}</div>
                            )}
                            {exp.remarks && (
                              <div className="text-[11px] text-slate-400">{exp.remarks}</div>
                            )}
                            <div className="flex items-center justify-between pt-1.5 border-t border-cyan-500/20">
                              <span className="text-[10px] font-bold text-slate-300 uppercase">
                                {isApproved ? 'Approved' : isRejected ? 'Rejected' : 'Pending'}
                              </span>
                              {isAuthorized && !isApproved && !isRejected && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleApproveExpense(exp)}
                                    className="px-2.5 py-1 bg-emerald-500 text-slate-950 rounded text-[10px] font-black cursor-pointer"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRejectExpense(exp)}
                                    className="px-2.5 py-1 bg-rose-600/90 text-white rounded text-[10px] font-bold cursor-pointer"
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Rejection Reason Modal */}
      {rejectionTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#081b28] border border-rose-500/40 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-300 font-black text-sm">
                <XCircle className="w-5 h-5" />
                <span>Reject Expense Voucher{rejectionTarget.ids.length > 1 ? 's' : ''}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRejectionTarget(null);
                  setRejectionReason('');
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-200 bg-[#0b2333] border border-cyan-500/20 rounded-xl p-3 font-semibold">
              {rejectionTarget.label}
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1.5">
                Rejection Reason (Optional)
              </label>
              <textarea
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter reason for rejecting..."
                className="w-full px-3 py-2 bg-[#061520] border border-cyan-500/30 rounded-xl text-xs text-white focus:outline-none focus:border-rose-400"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setRejectionTarget(null);
                  setRejectionReason('');
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black cursor-pointer"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

