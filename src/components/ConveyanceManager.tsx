import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ConveyanceEntry,
  ConveyanceJourneyLeg,
  ConveyanceStatus,
  DailyAllowanceType,
  Salesperson,
  BranchLocation,
  CompanyDetails,
  AuthUser
} from '../types';
import { convertToTakaWords } from '../utils/numberToWords';
import { isSuperAdminOrAgm, isInCharge, isAnyAdmin, cleanBranchName, filterConveyancesForUser } from '../utils/branchAccess';
import { recordDeletedEntityId, getGlobalDeletedIds } from '../utils/deletedTracker';
import { parseDateToISO, formatDateDDMMYY } from '../utils/dateUtils';
import { DateInputWithPicker } from './DateInputWithPicker';
import {
  Car,
  Calendar,
  User,
  Building2,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  Printer,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Search,
  Check,
  Utensils,
  Hotel,
  ArrowRight,
  ArrowLeft,
  X,
  AlertCircle,
  ShieldCheck,
  BadgeCheck
} from 'lucide-react';

interface ConveyanceManagerProps {
  conveyances?: ConveyanceEntry[];
  setConveyances?: React.Dispatch<React.SetStateAction<ConveyanceEntry[]>>;
  salespersons?: Salesperson[];
  allSalespersons?: Salesperson[];
  branches?: BranchLocation[];
  allBranches?: BranchLocation[];
  company?: CompanyDetails;
  currentUser?: AuthUser | null;
  initialMode?: 'entry' | 'history' | 'approval';
  onSyncCloud?: (dataSlice?: any, immediate?: boolean, options?: any) => void;
  onBack?: () => void;
  onClose?: () => void;
}

export const STANDARD_DAILY_ALLOWANCE_RATES: Record<DailyAllowanceType, number> = {
  None: 0,
  Breakfast: 50,
  Lunch: 120,
  Dinner: 120,
  'Breakfast & Lunch': 170,
  'Lunch & Dinner': 240,
  'Full Day': 300
};

export const TRANSPORT_MODES = [
  'Bus',
  'Rickshaw',
  'CNG',
  'Auto',
  'Easy Bike',
  'Motorcycle',
  'Bike',
  'Train',
  'Leguna',
  'Tempo',
  'Car',
  'Taxi',
  'Walking',
  'Local'
];

export function isConveyanceLockedByApproval(entry: ConveyanceEntry | null | undefined): boolean {
  if (!entry) return false;
  return (
    entry.status === 'approved' ||
    Boolean(entry.inChargeApprovedBy) ||
    Boolean(entry.adminApprovedBy)
  );
}

export const ConveyanceManager: React.FC<ConveyanceManagerProps> = ({
  conveyances: propsConveyances = [],
  setConveyances: propsSetConveyances,
  salespersons = [],
  allSalespersons = [],
  branches = [],
  allBranches = [],
  company,
  currentUser,
  initialMode = 'entry',
  onSyncCloud,
  onBack,
  onClose
}) => {
  const effectiveBranches = allBranches.length > 0 ? allBranches : branches;
  const effectiveSalespersons = allSalespersons.length > 0 ? allSalespersons : salespersons;

  const isSuperAdmin = isSuperAdminOrAgm(currentUser);
  const isAdmin = isAnyAdmin(currentUser);
  const isAdminUser = isSuperAdmin || isAdmin;
  const isUserInCharge = !isAdminUser && isInCharge(currentUser, effectiveSalespersons, effectiveBranches);

  // Conveyance List State
  const [conveyances, setConveyances] = useState<ConveyanceEntry[]>(() => {
    if (propsConveyances && propsConveyances.length > 0) return propsConveyances;
    try {
      const saved = localStorage.getItem('polycables_conveyances');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  useEffect(() => {
    if (Array.isArray(propsConveyances)) {
      setConveyances(propsConveyances);
    }
  }, [propsConveyances]);

  // Active SubTab: 'create' | 'list'
  const [activeSubTab, setActiveSubTab] = useState<'create' | 'list'>(() => {
    return initialMode === 'history' || initialMode === 'approval' ? 'list' : 'create';
  });

  useEffect(() => {
    setActiveSubTab(initialMode === 'history' || initialMode === 'approval' ? 'list' : 'create');
  }, [initialMode]);

  // User's default branch & salesperson
  const userBranchId = isAdminUser ? 'ALL' : (currentUser?.branchId || effectiveBranches[0]?.id || 'branch-1');
  const userBranchName = currentUser?.branchName || effectiveBranches[0]?.name || 'Madhupur Sales Center';

  const defaultSalesperson = useMemo(() => {
    if (currentUser?.id) {
      const found = effectiveSalespersons.find(
        (s) => s.id === currentUser.id || s.code === (currentUser as any).code || s.name === currentUser.name
      );
      if (found) return found;
    }
    return effectiveSalespersons[0] || null;
  }, [currentUser, effectiveSalespersons]);

  // Form State for New / Edit Conveyance Voucher
  const [editingId, setEditingId] = useState<string | null>(null);
  const [voucherDate, setVoucherDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selectedBranchId, setSelectedBranchId] = useState<string>(userBranchId);
  const [selectedSalespersonId, setSelectedSalespersonId] = useState<string>(defaultSalesperson?.id || '');

  useEffect(() => {
    if (isAdminUser) {
      setSelectedBranchId('ALL');
      setFilterBranchId('ALL');
    } else if (currentUser?.branchId) {
      setSelectedBranchId(currentUser.branchId);
    }
  }, [currentUser?.username, currentUser?.role, currentUser?.branchId, isAdminUser]);

  // Journey Legs (Initialized with exactly 1 line at start)
  const [journeyRows, setJourneyRows] = useState<ConveyanceJourneyLeg[]>([
    { id: 'leg-1', from: '', to: '', by: 'Bus', taka: 0, ps: '' }
  ]);

  // Food / Daily Allowance
  const [dailyAllowanceType, setDailyAllowanceType] = useState<DailyAllowanceType>('Lunch');
  const [dailyAllowanceAmount, setDailyAllowanceAmount] = useState<number>(120);

  // Hotel Bill
  const [hasHotelBill, setHasHotelBill] = useState<boolean>(false);
  const [hotelName, setHotelName] = useState<string>('');
  const [hotelReceiptNo, setHotelReceiptNo] = useState<string>('');
  const [hotelAmount, setHotelAmount] = useState<number>(0);
  const [remarks, setRemarks] = useState<string>('');

  // Notification State
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const showNotify = (type: 'success' | 'error', text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 3500);
  };

  // Directory Filters & Expanded User State
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [filterBranchId, setFilterBranchId] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedUserIds, setExpandedUserIds] = useState<Set<string>>(new Set());
  const [expandedBranchKeys, setExpandedBranchKeys] = useState<Set<string>>(new Set());
  const [expandedCenterUserKeys, setExpandedCenterUserKeys] = useState<Set<string>>(new Set());
  const [rejectModalTarget, setRejectModalTarget] = useState<{
    vouchers: ConveyanceEntry[];
    title: string;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');

  // Modal State for Level 3: Single-day Detailed Slip Preview
  const [previewVoucher, setPreviewVoucher] = useState<ConveyanceEntry | null>(null);

  // Synchronize Daily Allowance Amount when Type Changes
  const handleDailyAllowanceChange = (type: DailyAllowanceType) => {
    setDailyAllowanceType(type);
    setDailyAllowanceAmount(STANDARD_DAILY_ALLOWANCE_RATES[type] || 0);
  };

  // Auto-fill Leg 1 'From' with starting location when user types
  const startingPoint = journeyRows[0]?.from?.trim().toLowerCase() || '';

  // Handle Journey Row Updates & Auto-Add Next Leg
  const handleJourneyLegChange = (
    index: number,
    field: keyof ConveyanceJourneyLeg,
    value: any
  ) => {
    setJourneyRows((prev) => {
      const updated = [...prev];
      const targetRow = { ...updated[index], [field]: value };
      updated[index] = targetRow;

      // Auto-add next leg if 'to' is filled and this is the last leg,
      // UNLESS the destination matches the original starting point (round-trip complete)
      if (field === 'to') {
        const dest = String(value).trim();
        const start = updated[0]?.from?.trim();
        const isReturnToStart = start && dest && dest.toLowerCase() === start.toLowerCase();

        if (dest && index === updated.length - 1 && !isReturnToStart) {
          updated.push({
            id: `leg-${Date.now()}-${updated.length + 1}`,
            from: dest, // Next leg starts from current destination
            to: '',
            by: targetRow.by || 'Bus',
            taka: 0,
            ps: ''
          });
        }
      }

      return updated;
    });
  };

  // Add Manual Leg
  const handleAddLeg = () => {
    const last = journeyRows[journeyRows.length - 1];
    setJourneyRows((prev) => [
      ...prev,
      {
        id: `leg-${Date.now()}-${prev.length + 1}`,
        from: last?.to || '',
        to: '',
        by: last?.by || 'Bus',
        taka: 0,
        ps: ''
      }
    ]);
  };

  // Remove Leg (keeping at least 1)
  const handleRemoveLeg = (index: number) => {
    if (journeyRows.length <= 1) {
      setJourneyRows([{ id: 'leg-1', from: '', to: '', by: 'Bus', taka: 0, ps: '' }]);
      return;
    }
    setJourneyRows((prev) => prev.filter((_, i) => i !== index));
  };

  // Travel Fare Total
  const totalTravelFare = useMemo(() => {
    return journeyRows.reduce((acc, row) => acc + (Number(row.taka) || 0), 0);
  }, [journeyRows]);

  // Grand Total Conveyance
  const grandTotalAmount = useMemo(() => {
    const da = Number(dailyAllowanceAmount) || 0;
    const hotel = hasHotelBill ? Number(hotelAmount) || 0 : 0;
    return totalTravelFare + da + hotel;
  }, [totalTravelFare, dailyAllowanceAmount, hasHotelBill, hotelAmount]);

  // Check if journey returns to starting point
  const isReturnedToStart = useMemo(() => {
    if (journeyRows.length <= 1) return false;
    const start = journeyRows[0]?.from?.trim().toLowerCase();
    const lastTo = journeyRows[journeyRows.length - 1]?.to?.trim().toLowerCase();
    return Boolean(start && lastTo && start === lastTo);
  }, [journeyRows]);

  // Reset Form
  const handleResetForm = () => {
    setEditingId(null);
    setVoucherDate(new Date().toISOString().slice(0, 10));
    setJourneyRows([{ id: 'leg-1', from: '', to: '', by: 'Bus', taka: 0, ps: '' }]);
    setDailyAllowanceType('Lunch');
    setDailyAllowanceAmount(120);
    setHasHotelBill(false);
    setHotelName('');
    setHotelReceiptNo('');
    setHotelAmount(0);
    setRemarks('');
  };

  // Save / Submit Conveyance Voucher
  const handleSubmitConveyance = (e: React.FormEvent) => {
    e.preventDefault();

    const selectedSp = effectiveSalespersons.find((s) => s.id === selectedSalespersonId) || defaultSalesperson;
    const selectedBr =
      selectedBranchId === 'ALL'
        ? (effectiveBranches.find((b) => b.id === selectedSp?.branchId) || undefined)
        : effectiveBranches.find((b) => b.id === selectedBranchId);

    const validRows = journeyRows.filter((r) => r.from.trim() || r.to.trim() || Number(r.taka) > 0);
    if (validRows.length === 0 && grandTotalAmount === 0) {
      showNotify('error', 'Please enter at least one journey leg or allowance amount.');
      return;
    }

    // Determine initial status based on user hierarchy:
    // Regular user -> pending_incharge
    // In-Charge -> pending_admin
    // Super Admin -> approved
    let initialStatus: ConveyanceStatus = 'pending_incharge';
    if (isSuperAdmin) {
      initialStatus = 'approved';
    } else if (isUserInCharge) {
      initialStatus = 'pending_admin';
    }

    const todayVouchers = conveyances.filter((c) => c.date === voucherDate);
    const voucherNo = editingId
      ? conveyances.find((c) => c.id === editingId)?.voucherNo || `CV-${Date.now()}`
      : `CV-${voucherDate.replace(/-/g, '').slice(2)}-${String(todayVouchers.length + 1).padStart(3, '0')}`;

    const newVoucher: ConveyanceEntry = {
      id: editingId || `conv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      voucherNo,
      date: voucherDate,
      salespersonId: selectedSp?.id || 'unknown-sp',
      salespersonName: selectedSp?.name || currentUser?.name || 'Sales Officer',
      salesmanCode: selectedSp?.code || '',
      branchId: selectedBr?.id || userBranchId,
      branchName: selectedBr?.name || userBranchName,
      fromLocation: journeyRows[0]?.from || '',
      toLocation: journeyRows[journeyRows.length - 1]?.to || '',
      transportMode: journeyRows[0]?.by || 'Bus',
      conveyanceAmount: totalTravelFare,
      journeyRows: validRows.length > 0 ? validRows : journeyRows,
      dailyAllowanceType,
      dailyAllowanceAmount: Number(dailyAllowanceAmount) || 0,
      hasHotelBill,
      hotelName: hasHotelBill ? hotelName : '',
      hotelAmount: hasHotelBill ? Number(hotelAmount) || 0 : 0,
      totalAmount: grandTotalAmount,
      remarks: remarks.trim() + (hasHotelBill && hotelReceiptNo ? ` (Hotel Receipt: ${hotelReceiptNo})` : ''),
      status: editingId ? conveyances.find((c) => c.id === editingId)?.status || initialStatus : initialStatus,
      createdAt: editingId ? (conveyances.find((c) => c.id === editingId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const updated = editingId
      ? conveyances.map((c) => (c.id === editingId ? newVoucher : c))
      : [newVoucher, ...conveyances];

    setConveyances(updated);
    propsSetConveyances?.(updated);
    try {
      localStorage.setItem('polycables_conveyances', JSON.stringify(updated));
    } catch {}
    onSyncCloud?.({ conveyances: updated }, true);

    showNotify(
      'success',
      editingId
        ? `✓ Voucher ${voucherNo} updated successfully.`
        : `✓ Conveyance Voucher ${voucherNo} submitted (${
            initialStatus === 'pending_incharge'
              ? 'Submitted to In-Charge for review'
              : initialStatus === 'pending_admin'
              ? 'Forwarded to Admin for approval'
              : 'Approved'
          })!`
    );

    handleResetForm();
    setActiveSubTab('list');
  };

  // Edit Voucher
  const handleEditVoucher = (v: ConveyanceEntry) => {
    setEditingId(v.id);
    setVoucherDate(v.date);
    setSelectedBranchId(v.branchId || userBranchId);
    setSelectedSalespersonId(v.salespersonId);
    setJourneyRows(
      v.journeyRows && v.journeyRows.length > 0
        ? v.journeyRows
        : [{ id: 'leg-1', from: v.fromLocation || '', to: v.toLocation || '', by: v.transportMode || 'Bus', taka: v.conveyanceAmount || 0 }]
    );
    setDailyAllowanceType(v.dailyAllowanceType || 'Lunch');
    setDailyAllowanceAmount(v.dailyAllowanceAmount || 0);
    setHasHotelBill(Boolean(v.hasHotelBill));
    setHotelName(v.hotelName || '');
    setHotelAmount(v.hotelAmount || 0);
    setRemarks(v.remarks || '');
    setActiveSubTab('create');
  };

  // Single Voucher Approval (In-Charge first, then Admin)
  const handleApproveSingle = (v: ConveyanceEntry) => {
    let newStatus: ConveyanceStatus = v.status;
    let notifyMsg = '';

    if (v.status === 'pending_incharge' && isUserInCharge) {
      newStatus = 'pending_admin';
      notifyMsg = `✓ In-Charge approved voucher ${v.voucherNo || v.id}. Forwarded to Admin.`;
    } else if (v.status === 'pending_admin' && isAdminUser) {
      newStatus = 'approved';
      notifyMsg = `✓ Final Admin approved voucher ${v.voucherNo || v.id}!`;
    } else {
      showNotify('error', 'In-Charge approval is required before Admin approval.');
      return;
    }

    const updated = conveyances.map((c) =>
      c.id === v.id
        ? {
            ...c,
            status: newStatus,
            inChargeApprovedBy:
              newStatus === 'pending_admin' || newStatus === 'approved'
                ? c.inChargeApprovedBy || currentUser?.name || 'In-Charge'
                : c.inChargeApprovedBy,
            inChargeApprovedAt:
              newStatus === 'pending_admin' || newStatus === 'approved'
                ? c.inChargeApprovedAt || new Date().toISOString()
                : c.inChargeApprovedAt,
            adminApprovedBy:
              newStatus === 'approved' ? currentUser?.name || 'Admin' : c.adminApprovedBy,
            adminApprovedAt:
              newStatus === 'approved' ? new Date().toISOString() : c.adminApprovedAt,
            updatedAt: new Date().toISOString()
          }
        : c
    );

    setConveyances(updated);
    propsSetConveyances?.(updated);
    try {
      localStorage.setItem('polycables_conveyances', JSON.stringify(updated));
    } catch {}
    onSyncCloud?.({ conveyances: updated }, true);

    if (previewVoucher && previewVoucher.id === v.id) {
      setPreviewVoucher({ ...previewVoucher, status: newStatus });
    }
    showNotify('success', notifyMsg);
  };

  // Single Voucher Rejection (opens modal)
  const handleRejectSingle = (v: ConveyanceEntry) => {
    setRejectReason('');
    setRejectModalTarget({
      vouchers: [v],
      title: `Voucher ${v.voucherNo || v.id} (${v.salespersonName})`
    });
  };

  // Batch Rejection for Officer or Sales Center (opens modal)
  const handleRejectBatch = (vouchers: ConveyanceEntry[], title: string) => {
    const actionable = vouchers.filter((v) => v.status !== 'approved' && v.status !== 'rejected');
    if (actionable.length === 0) {
      showNotify('error', `No pending vouchers to reject for ${title}.`);
      return;
    }
    setRejectReason('');
    setRejectModalTarget({ vouchers: actionable, title });
  };

  const handleConfirmReject = () => {
    if (!rejectModalTarget || rejectModalTarget.vouchers.length === 0) return;
    const idSet = new Set(rejectModalTarget.vouchers.map((v) => v.id));
    const reasonText = rejectReason.trim() || 'Rejected by Approver';
    const rejector = currentUser?.name || currentUser?.username || 'Approver';
    const nowIso = new Date().toISOString();

    const updated = conveyances.map((c) =>
      idSet.has(c.id) && c.status !== 'approved' && c.status !== 'rejected'
        ? {
            ...c,
            status: 'rejected' as ConveyanceStatus,
            rejectedBy: rejector,
            rejectedAt: nowIso,
            rejectionReason: reasonText,
            updatedAt: nowIso
          }
        : c
    );

    setConveyances(updated);
    propsSetConveyances?.(updated);
    try {
      localStorage.setItem('polycables_conveyances', JSON.stringify(updated));
    } catch {}
    onSyncCloud?.({ conveyances: updated }, true);

    if (previewVoucher && idSet.has(previewVoucher.id)) {
      setPreviewVoucher({ ...previewVoucher, status: 'rejected' });
    }
    showNotify(
      'success',
      rejectModalTarget.vouchers.length === 1
        ? `✓ Voucher ${rejectModalTarget.vouchers[0].voucherNo || rejectModalTarget.vouchers[0].id} marked as Rejected.`
        : `✓ Rejected ${rejectModalTarget.vouchers.length} voucher(s) for ${rejectModalTarget.title}.`
    );
    setRejectModalTarget(null);
    setRejectReason('');
  };

  // Normalize Sales Center core key to prevent duplicate center groups
  const normalizeBranchCoreKey = (val?: string | null): string => {
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

  // Resolve standardized branch key & display name for a conveyance entry
  const resolveConveyanceBranch = (c: ConveyanceEntry): { branchKey: string; branchName: string } => {
    const spMatched = effectiveSalespersons.find(
      (s) =>
        (c.salespersonId && s.id === c.salespersonId) ||
        (c.salespersonName && s.name?.trim().toLowerCase() === c.salespersonName.trim().toLowerCase())
    );
    const rawBranch = c.branchName || spMatched?.branchName || 'Madhupur Sales Center';
    const rawCore = normalizeBranchCoreKey(rawBranch);
    const branchIdCandidate = c.branchId || spMatched?.branchId || '';

    const matched = effectiveBranches.find(
      (b) =>
        (branchIdCandidate && b.id.toLowerCase() === branchIdCandidate.toLowerCase()) ||
        (rawCore && normalizeBranchCoreKey(b.name) === rawCore) ||
        (c.branchName && cleanBranchName(b.name).toLowerCase() === cleanBranchName(c.branchName).toLowerCase())
    );
    const branchName = cleanBranchName(matched?.name || rawBranch) || 'Madhupur Sales Center';
    const coreKey = normalizeBranchCoreKey(branchName);
    const branchKey = coreKey ? `center:${coreKey}` : (matched?.id || branchIdCandidate || branchName.toLowerCase());
    return { branchKey, branchName };
  };

  // ONE-CLICK TOTAL APPROVE FOR A USER (optionally scoped to a specific Sales Center):
  const handleApproveAllForUser = (userId: string, userName: string, branchKey?: string) => {
    let approvedCount = 0;

    const updated = conveyances.map((c) => {
      if (c.salespersonId !== userId && c.salespersonName?.trim().toLowerCase() !== userName.trim().toLowerCase()) {
        return c;
      }
      if (branchKey && resolveConveyanceBranch(c).branchKey !== branchKey) {
        return c;
      }

      if (c.status === 'pending_incharge' && isUserInCharge) {
        approvedCount++;
        return {
          ...c,
          status: 'pending_admin' as ConveyanceStatus,
          inChargeApprovedBy: currentUser?.name || 'In-Charge',
          inChargeApprovedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      } else if (c.status === 'pending_admin' && isAdminUser) {
        approvedCount++;
        return {
          ...c,
          status: 'approved' as ConveyanceStatus,
          adminApprovedBy: currentUser?.name || 'Admin',
          adminApprovedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }

      return c;
    });

    if (approvedCount === 0) {
      showNotify('error', `No eligible pending vouchers to approve for ${userName}.`);
      return;
    }

    setConveyances(updated);
    propsSetConveyances?.(updated);
    try {
      localStorage.setItem('polycables_conveyances', JSON.stringify(updated));
    } catch {}
    onSyncCloud?.({ conveyances: updated }, true);

    showNotify(
      'success',
      `✓ One-Click Total Approved: Approved all ${approvedCount} pending voucher(s) for ${userName}!`
    );
  };

  // Delete Voucher
  const handleDeleteVoucher = (v: ConveyanceEntry) => {
    recordDeletedEntityId(v.id);
    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ ids: [v.id], type: 'conveyance' })
    }).catch(() => {});

    const updated = conveyances.filter((c) => c.id !== v.id);
    setConveyances(updated);
    propsSetConveyances?.(updated);
    try {
      localStorage.setItem('polycables_conveyances', JSON.stringify(updated));
    } catch {}
    onSyncCloud?.({ conveyances: updated, deletedEntityIds: getGlobalDeletedIds() }, true);
    showNotify('success', `✓ Voucher ${v.voucherNo || v.id} deleted.`);
  };

  // Toggle Branch Accordion Drill-down
  const toggleBranchExpanded = (branchKey: string) => {
    setExpandedBranchKeys((prev) => {
      const next = new Set(prev);
      if (next.has(branchKey)) next.delete(branchKey);
      else next.add(branchKey);
      return next;
    });
  };

  // Toggle Officer inside Sales Center Accordion Drill-down
  const toggleCenterUserExpanded = (centerUserKey: string) => {
    setExpandedCenterUserKeys((prev) => {
      const next = new Set(prev);
      if (next.has(centerUserKey)) next.delete(centerUserKey);
      else next.add(centerUserKey);
      return next;
    });
  };

  // ONE-CLICK TOTAL APPROVE FOR A SALES CENTER:
  const handleApproveAllForBranch = (branchKey: string, branchName: string) => {
    let approvedCount = 0;

    const updated = conveyances.map((c) => {
      const resolved = resolveConveyanceBranch(c);
      if (resolved.branchKey !== branchKey && resolved.branchName.toLowerCase() !== branchName.toLowerCase()) {
        return c;
      }

      if (c.status === 'pending_incharge' && isUserInCharge) {
        approvedCount++;
        return {
          ...c,
          status: 'pending_admin' as ConveyanceStatus,
          inChargeApprovedBy: currentUser?.name || 'In-Charge',
          inChargeApprovedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      } else if (c.status === 'pending_admin' && isAdminUser) {
        approvedCount++;
        return {
          ...c,
          status: 'approved' as ConveyanceStatus,
          adminApprovedBy: currentUser?.name || 'Admin',
          adminApprovedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }

      return c;
    });

    if (approvedCount === 0) {
      showNotify('error', `No eligible pending vouchers to approve for ${branchName}.`);
      return;
    }

    setConveyances(updated);
    propsSetConveyances?.(updated);
    try {
      localStorage.setItem('polycables_conveyances', JSON.stringify(updated));
    } catch {}
    onSyncCloud?.({ conveyances: updated }, true);

    showNotify(
      'success',
      `✓ Approved all ${approvedCount} pending voucher(s) for ${branchName}!`
    );
  };

  // Toggle User Accordion Drill-down
  const toggleUserExpanded = (userId: string) => {
    setExpandedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  // Filtering Conveyances by Role & Approval Hierarchy:
  // - In-Charge sees all in branch.
  // - Admin only sees vouchers that have passed In-Charge (pending_admin or approved).
  // - If In-Charge has NOT approved, Admin does not see it!
  const filteredConveyances = useMemo(() => {
    const branchScoped = isSuperAdmin
      ? conveyances
      : filterConveyancesForUser(conveyances, currentUser, effectiveSalespersons, effectiveBranches);

    return branchScoped.filter((c) => {
      // Strict hierarchy rule: If In-Charge has NOT approved yet, NO Admin can see anything!
      if (isAdminUser) {
        const isInChargeApproved = Boolean(
          c.inChargeApprovedBy ||
          c.inChargeApprovedAt ||
          c.status === 'pending_admin' ||
          c.status === 'approved'
        );
        if (!isInChargeApproved) {
          return false;
        }
      }

      // Date filter (normalized ISO so DD.MM.YY and YYYY-MM-DD both match cleanly)
      const isoDate = parseDateToISO(c.date) || c.date;
      if (filterStartDate && isoDate < filterStartDate) return false;
      if (filterEndDate && isoDate > filterEndDate) return false;

      // Branch filter
      if (filterBranchId !== 'ALL' && c.branchId !== filterBranchId) return false;

      // Status filter
      if (filterStatus !== 'ALL' && c.status !== filterStatus) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const str = `${c.voucherNo || ''} ${c.salespersonName} ${c.fromLocation} ${c.toLocation} ${c.branchName || ''} ${c.remarks || ''}`.toLowerCase();
        if (!str.includes(q)) return false;
      }

      return true;
    });
  }, [
    conveyances,
    currentUser,
    effectiveSalespersons,
    effectiveBranches,
    filterStartDate,
    filterEndDate,
    filterBranchId,
    filterStatus,
    searchQuery,
    isSuperAdmin,
    isAdminUser
  ]);

  const compareConveyancesDateAsc = (a: ConveyanceEntry, b: ConveyanceEntry) => {
    const isoA = parseDateToISO(a.date) || a.date || '';
    const isoB = parseDateToISO(b.date) || b.date || '';
    const cmp = isoA.localeCompare(isoB);
    if (cmp !== 0) return cmp;
    return String(a.voucherNo || a.id || '').localeCompare(String(b.voucherNo || b.id || ''));
  };

  // Group Filtered Conveyances by User / Marketing Officer (Level 1 User Rollup)
  const userRollups = useMemo(() => {
    const map = new Map<
      string,
      {
        userId: string;
        userName: string;
        userCode: string;
        branchName: string;
        vouchers: ConveyanceEntry[];
        totalDays: number;
        totalTravelFare: number;
        totalDailyAllowance: number;
        totalHotelBill: number;
        grandTotal: number;
        pendingInChargeCount: number;
        pendingAdminCount: number;
        approvedCount: number;
        dateSet: Set<string>;
      }
    >();

    filteredConveyances.forEach((c) => {
      const key = c.salespersonId || c.salespersonName;
      const resolvedBranch = resolveConveyanceBranch(c);
      let record = map.get(key);
      if (!record) {
        record = {
          userId: c.salespersonId || key,
          userName: c.salespersonName || 'Unknown Officer',
          userCode: c.salesmanCode || '',
          branchName: resolvedBranch.branchName,
          vouchers: [],
          totalDays: 0,
          totalTravelFare: 0,
          totalDailyAllowance: 0,
          totalHotelBill: 0,
          grandTotal: 0,
          pendingInChargeCount: 0,
          pendingAdminCount: 0,
          approvedCount: 0,
          dateSet: new Set<string>()
        };
        map.set(key, record);
      }

      record.vouchers.push(c);
      const dayKey = parseDateToISO(c.date) || c.date;
      if (dayKey) record.dateSet.add(dayKey);
      record.totalTravelFare += Number(c.conveyanceAmount) || 0;
      record.totalDailyAllowance += Number(c.dailyAllowanceAmount) || 0;
      record.totalHotelBill += c.hasHotelBill ? Number(c.hotelAmount) || 0 : 0;
      record.grandTotal += Number(c.totalAmount) || 0;

      if (c.status === 'pending_incharge') record.pendingInChargeCount++;
      if (c.status === 'pending_admin') record.pendingAdminCount++;
      if (c.status === 'approved') record.approvedCount++;
    });

    // Sort vouchers inside each user Date Serial Wise (chronological ascending) & finalize distinct day count
    map.forEach((r) => {
      r.vouchers.sort(compareConveyancesDateAsc);
      r.totalDays = r.dateSet.size || r.vouchers.length;
    });

    return Array.from(map.values()).sort((a, b) => b.grandTotal - a.grandTotal);
  }, [filteredConveyances, effectiveBranches, effectiveSalespersons]);

  // Group Filtered Conveyances by Sales Center -> Marketing Person -> Date-Wise Vouchers
  const salesCenterRollups = useMemo(() => {
    type OfficerInCenter = {
      officerKey: string;
      userId: string;
      userName: string;
      userCode: string;
      vouchers: ConveyanceEntry[];
      totalDays: number;
      totalTravelFare: number;
      totalDailyAllowance: number;
      totalHotelBill: number;
      grandTotal: number;
      pendingInChargeCount: number;
      pendingAdminCount: number;
      approvedCount: number;
      rejectedCount: number;
      dateSet: Set<string>;
    };

    const map = new Map<
      string,
      {
        branchKey: string;
        branchName: string;
        vouchers: ConveyanceEntry[];
        officers: OfficerInCenter[];
        officerMap: Map<string, OfficerInCenter>;
        totalDays: number;
        totalTravelFare: number;
        totalDailyAllowance: number;
        totalHotelBill: number;
        grandTotal: number;
        pendingInChargeCount: number;
        pendingAdminCount: number;
        approvedCount: number;
        rejectedCount: number;
        dateSet: Set<string>;
        officerSet: Set<string>;
      }
    >();

    filteredConveyances.forEach((c) => {
      const { branchKey, branchName } = resolveConveyanceBranch(c);
      let record = map.get(branchKey);
      if (!record) {
        record = {
          branchKey,
          branchName,
          vouchers: [],
          officers: [],
          officerMap: new Map<string, OfficerInCenter>(),
          totalDays: 0,
          totalTravelFare: 0,
          totalDailyAllowance: 0,
          totalHotelBill: 0,
          grandTotal: 0,
          pendingInChargeCount: 0,
          pendingAdminCount: 0,
          approvedCount: 0,
          rejectedCount: 0,
          dateSet: new Set<string>(),
          officerSet: new Set<string>()
        };
        map.set(branchKey, record);
      }

      record.vouchers.push(c);
      const dayKey = parseDateToISO(c.date) || c.date;
      if (dayKey) record.dateSet.add(dayKey);
      if (c.salespersonName) record.officerSet.add(c.salespersonName);
      record.totalTravelFare += Number(c.conveyanceAmount) || 0;
      record.totalDailyAllowance += Number(c.dailyAllowanceAmount) || 0;
      record.totalHotelBill += c.hasHotelBill ? Number(c.hotelAmount) || 0 : 0;
      record.grandTotal += Number(c.totalAmount) || 0;

      if (c.status === 'pending_incharge') record.pendingInChargeCount++;
      if (c.status === 'pending_admin') record.pendingAdminCount++;
      if (c.status === 'approved') record.approvedCount++;
      if (c.status === 'rejected') record.rejectedCount++;

      // Nested Marketing Person rollup inside this Sales Center
      const officerKey = (c.salespersonId || c.salespersonName || 'unknown-officer').trim().toLowerCase();
      let officer = record.officerMap.get(officerKey);
      if (!officer) {
        const spInfo = effectiveSalespersons.find(
          (s) =>
            (c.salespersonId && s.id === c.salespersonId) ||
            (c.salespersonName && s.name?.trim().toLowerCase() === c.salespersonName.trim().toLowerCase())
        );
        officer = {
          officerKey,
          userId: c.salespersonId || spInfo?.id || officerKey,
          userName: c.salespersonName || spInfo?.name || 'Unknown Officer',
          userCode: c.salesmanCode || spInfo?.code || '',
          vouchers: [],
          totalDays: 0,
          totalTravelFare: 0,
          totalDailyAllowance: 0,
          totalHotelBill: 0,
          grandTotal: 0,
          pendingInChargeCount: 0,
          pendingAdminCount: 0,
          approvedCount: 0,
          rejectedCount: 0,
          dateSet: new Set<string>()
        };
        record.officerMap.set(officerKey, officer);
      }

      officer.vouchers.push(c);
      if (dayKey) officer.dateSet.add(dayKey);
      officer.totalTravelFare += Number(c.conveyanceAmount) || 0;
      officer.totalDailyAllowance += Number(c.dailyAllowanceAmount) || 0;
      officer.totalHotelBill += c.hasHotelBill ? Number(c.hotelAmount) || 0 : 0;
      officer.grandTotal += Number(c.totalAmount) || 0;
      if (c.status === 'pending_incharge') officer.pendingInChargeCount++;
      if (c.status === 'pending_admin') officer.pendingAdminCount++;
      if (c.status === 'approved') officer.approvedCount++;
      if (c.status === 'rejected') officer.rejectedCount++;
    });

    map.forEach((r) => {
      r.vouchers.sort(compareConveyancesDateAsc);
      r.totalDays = r.dateSet.size || r.vouchers.length;
      r.officerMap.forEach((off) => {
        off.vouchers.sort(compareConveyancesDateAsc);
        off.totalDays = off.dateSet.size || off.vouchers.length;
      });
      r.officers = Array.from(r.officerMap.values()).sort((a, b) => b.grandTotal - a.grandTotal);
    });

    return Array.from(map.values()).sort((a, b) => b.grandTotal - a.grandTotal);
  }, [filteredConveyances, effectiveBranches, effectiveSalespersons]);

  // Total summary metrics
  const summaryTotals = useMemo(() => {
    const totalVouchers = filteredConveyances.length;
    const totalAmount = filteredConveyances.reduce((acc, c) => acc + (Number(c.totalAmount) || 0), 0);
    const pendingInCharge = filteredConveyances.filter((c) => c.status === 'pending_incharge').length;
    const pendingAdmin = filteredConveyances.filter((c) => c.status === 'pending_admin').length;
    const approved = filteredConveyances.filter((c) => c.status === 'approved').length;
    return { totalVouchers, totalAmount, pendingInCharge, pendingAdmin, approved };
  }, [filteredConveyances]);

  return (
    <div id="conveyance-manager-wrapper" className="space-y-4 font-sans text-white">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-xl flex items-center space-x-2 text-xs font-bold text-white transition-all border ${
            notification.type === 'success' ? 'bg-emerald-600/95 border-emerald-400/50' : 'bg-rose-600/95 border-rose-400/50'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-white" />
          ) : (
            <AlertCircle className="w-4 h-4 text-white" />
          )}
          <span>{notification.text}</span>
        </div>
      )}

      {/* Top Main Navigation Bar (Hidden in list-wise approval mode; clean select in normal mode) */}
      {initialMode !== 'approval' && (
        <div className="cyber-glass-card text-white rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-sm sm:text-base font-black tracking-tight text-cyan-200 truncate">
            Daily Conveyance &amp; Tour Voucher
          </h1>

          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold text-cyan-200/80 uppercase tracking-wider">View:</label>
            <select
              value={activeSubTab}
              onChange={(e) => setActiveSubTab(e.target.value as 'create' | 'list')}
              className="bg-[#061520] border border-cyan-500/35 text-cyan-100 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-cyan-400 cursor-pointer"
            >
              <option value="create">Create Voucher</option>
              <option value="list">Directory &amp; Approvals ({userRollups.length})</option>
            </select>
          </div>
        </div>
      )}

      {/* VIEW 1: CREATE DAILY CONVEYANCE VOUCHER */}
      {activeSubTab === 'create' && (
        <div className="cyber-glass-card rounded-2xl p-4 sm:p-6 space-y-5 text-white">
          <div className="flex items-center justify-between pb-3 border-b border-cyan-500/25">
            <div className="flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-cyan-400" />
              <h2 className="text-base font-black text-white">
                {editingId ? 'Edit Conveyance Voucher' : 'Create Daily Conveyance Voucher'}
              </h2>
            </div>
            <span className="text-xs text-slate-300 font-semibold">
              Starts with 1 line · Auto-adds next leg up to return to start point
            </span>
          </div>

          <form onSubmit={handleSubmitConveyance} className="space-y-4">
            {/* Header Selection Fields: Date, Officer, Branch */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#071824]/80 p-3.5 rounded-xl border border-cyan-500/25">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1 flex items-center space-x-1">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Voucher Date (dd.mm.yy) *</span>
                </label>
                <DateInputWithPicker
                  value={voucherDate}
                  onChange={setVoucherDate}
                  valueFormat="iso"
                  theme="dark"
                  required
                  inputClassName="p-2 text-xs font-semibold text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1 flex items-center space-x-1">
                  <User className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Sales Officer / User *</span>
                </label>
                <select
                  value={selectedSalespersonId}
                  onChange={(e) => setSelectedSalespersonId(e.target.value)}
                  disabled={!isSuperAdmin && !isUserInCharge && currentUser?.id !== undefined}
                  className="w-full p-2 border border-cyan-500/30 rounded-lg text-xs font-semibold text-white bg-[#061520] focus:ring-2 focus:ring-cyan-400"
                >
                  {effectiveSalespersons.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.name} {sp.code ? `(${sp.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1 flex items-center space-x-1">
                  <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Sales Center / Showroom *</span>
                </label>
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  disabled={!isAdminUser}
                  className="w-full p-2 border border-cyan-500/30 rounded-lg text-xs font-semibold text-white bg-[#061520] focus:ring-2 focus:ring-cyan-400"
                >
                  {isAdminUser && (
                    <option value="ALL">All Sales Centers</option>
                  )}
                  {effectiveBranches.map((br) => (
                    <option key={br.id} value={br.id}>
                      {br.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Journey Movement Legs Table */}
            <div className="border border-cyan-500/25 rounded-xl overflow-hidden bg-[#071824]/60">
              <div className="bg-[#0c2638] px-4 py-2 border-b border-cyan-500/25 flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-200 uppercase tracking-wider">
                  Movement Legs &amp; Travel Fares
                </span>
                {isReturnedToStart && (
                  <span className="text-[10px] font-bold text-emerald-200 bg-emerald-500/20 border border-emerald-400/35 px-2.5 py-0.5 rounded-full flex items-center space-x-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Returned to Starting Point ({journeyRows[0]?.from})</span>
                  </span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#092030] text-cyan-200 font-bold border-b border-cyan-500/25 uppercase text-[10px]">
                      <th className="p-2.5 w-12 text-center">Leg #</th>
                      <th className="p-2.5 min-w-[160px]">From (Starting Location)</th>
                      <th className="p-2.5 min-w-[160px]">To (Destination)</th>
                      <th className="p-2.5 w-40 min-w-[140px]">By (Transport)</th>
                      <th className="p-2.5 w-32 text-right">Fare / Taka</th>
                      <th className="p-2.5 w-12 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-500/15">
                    {journeyRows.map((leg, idx) => (
                      <tr key={leg.id || idx} className="hover:bg-cyan-500/[0.06]">
                        <td className="p-2.5 text-center font-mono font-bold text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            required
                            placeholder={idx === 0 ? 'e.g. Sales Center / Residence' : 'Starting location'}
                            value={leg.from}
                            onChange={(e) => handleJourneyLegChange(idx, 'from', e.target.value)}
                            className="w-full p-1.5 bg-[#061520] border border-cyan-500/30 rounded-lg text-xs font-semibold text-white placeholder-slate-400 focus:ring-1 focus:ring-cyan-400"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            required
                            placeholder="e.g. Madhupur Bazar / Client Shop"
                            value={leg.to}
                            onChange={(e) => handleJourneyLegChange(idx, 'to', e.target.value)}
                            className="w-full p-1.5 bg-[#061520] border border-cyan-500/30 rounded-lg text-xs font-semibold text-white placeholder-slate-400 focus:ring-1 focus:ring-cyan-400"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={leg.by || 'Bus'}
                            onChange={(e) => handleJourneyLegChange(idx, 'by', e.target.value)}
                            className="w-full p-1.5 border border-cyan-500/30 rounded-lg text-xs font-medium text-white focus:ring-1 focus:ring-cyan-400 bg-[#061520]"
                          >
                            {leg.by && !TRANSPORT_MODES.includes(leg.by) && (
                              <option value={leg.by}>{leg.by}</option>
                            )}
                            {TRANSPORT_MODES.map((mode) => (
                              <option key={mode} value={mode}>
                                {mode}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 text-right">
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={leg.taka || ''}
                            onChange={(e) => handleJourneyLegChange(idx, 'taka', parseFloat(e.target.value) || 0)}
                            className="w-full p-1.5 bg-[#061520] border border-cyan-500/30 rounded-lg text-xs font-mono font-bold text-amber-300 focus:ring-1 focus:ring-cyan-400 text-right"
                          />
                        </td>
                        <td className="p-2 text-center">
                          {journeyRows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveLeg(idx)}
                              className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors cursor-pointer"
                              title="Delete Leg"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-2.5 bg-[#092030] border-t border-cyan-500/20 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleAddLeg}
                  className="px-3 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/30 rounded-lg text-xs font-bold flex items-center space-x-1 transition-colors cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add Travel Leg</span>
                </button>
                <div className="text-xs font-bold text-slate-300">
                  Total Travel Fare: <span className="font-mono text-cyan-300 font-black">৳{totalTravelFare.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            {/* Daily Allowance Line */}
            <div className="bg-[#071824]/80 p-3 rounded-xl border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-2">
                <Utensils className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span className="font-bold text-amber-200">Daily Allowance (Food):</span>
                <select
                  value={dailyAllowanceType}
                  onChange={(e) => handleDailyAllowanceChange(e.target.value as DailyAllowanceType)}
                  className="p-1.5 border border-amber-400/35 rounded-lg text-xs font-bold text-white bg-[#061520] focus:ring-1 focus:ring-amber-400"
                >
                  <option value="None">None (৳0)</option>
                  <option value="Breakfast">Breakfast (৳50)</option>
                  <option value="Lunch">Lunch (৳120)</option>
                  <option value="Dinner">Dinner (৳120)</option>
                  <option value="Breakfast & Lunch">Breakfast &amp; Lunch (৳170)</option>
                  <option value="Lunch & Dinner">Lunch &amp; Dinner (৳240)</option>
                  <option value="Full Day">Full Day (৳300)</option>
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <label className="text-[11px] font-bold text-slate-300 uppercase">DA Amount (Tk):</label>
                <input
                  type="number"
                  min="0"
                  value={dailyAllowanceAmount}
                  onChange={(e) => setDailyAllowanceAmount(parseFloat(e.target.value) || 0)}
                  className="w-28 p-1.5 border border-amber-400/35 rounded-lg font-mono font-bold text-amber-300 text-right bg-[#061520] focus:ring-1 focus:ring-amber-400"
                />
              </div>
            </div>

            {/* Hotel Bill Checkbox & Line */}
            <div className="bg-[#071824]/80 p-3 rounded-xl border border-purple-500/30 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hasHotelBill}
                    onChange={(e) => setHasHotelBill(e.target.checked)}
                    className="w-4 h-4 rounded text-cyan-400 focus:ring-cyan-400 border-cyan-500/40 bg-[#061520] cursor-pointer"
                  />
                  <span className="font-bold text-purple-200 flex items-center space-x-1">
                    <Hotel className="w-4 h-4 text-purple-400" />
                    <span>Include Hotel Bill / Night Stay</span>
                  </span>
                </label>
                {hasHotelBill && (
                  <span className="text-[11px] text-purple-300 font-semibold">
                    Memo / Receipt required for accounts audit
                  </span>
                )}
              </div>

              {hasHotelBill && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 animate-in fade-in">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">Hotel Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Hotel Al-Razzak, Tangail"
                      value={hotelName}
                      onChange={(e) => setHotelName(e.target.value)}
                      className="w-full p-1.5 border border-purple-400/35 rounded-lg text-xs font-semibold bg-[#061520] text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">Receipt / Memo Ref</label>
                    <input
                      type="text"
                      placeholder="e.g. Memo # 4128"
                      value={hotelReceiptNo}
                      onChange={(e) => setHotelReceiptNo(e.target.value)}
                      className="w-full p-1.5 border border-purple-400/35 rounded-lg text-xs font-semibold bg-[#061520] text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1 text-right">Hotel Amount (Tk) *</label>
                    <input
                      type="number"
                      min="0"
                      required={hasHotelBill}
                      placeholder="0"
                      value={hotelAmount || ''}
                      onChange={(e) => setHotelAmount(parseFloat(e.target.value) || 0)}
                      className="w-full p-1.5 border border-purple-400/35 rounded-lg text-xs font-mono font-bold text-right text-purple-300 bg-[#061520]"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Total Conveyance Amount Line */}
            <div className="bg-[#0c2638] text-white p-3.5 rounded-xl border border-cyan-500/30 flex items-center justify-between text-xs">
              <span className="font-bold text-cyan-200 uppercase tracking-wide">
                Total Conveyance Amount (Fare + D.A. + Hotel):
              </span>
              <span className="text-lg font-black font-mono text-emerald-300">
                ৳{grandTotalAmount.toLocaleString('en-IN')}
              </span>
            </div>

            {/* In Word Line */}
            <div className="bg-[#071824]/80 p-3 rounded-xl border border-cyan-500/20 text-xs flex items-center space-x-2">
              <span className="font-extrabold text-cyan-300 uppercase text-[10px]">In Word:</span>
              <span className="font-bold text-white">
                {convertToTakaWords(grandTotalAmount)}
              </span>
            </div>

            {/* Next Line: Reset and Submit */}
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={handleResetForm}
                className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Reset Form
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-xl text-xs font-black shadow-md transition-colors cursor-pointer flex items-center space-x-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{editingId ? 'Update Conveyance Voucher' : 'Submit Conveyance Bill'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* VIEW 2: APPROVAL MODE — SALES CENTER WISE & MARKETING OFFICER WISE WITH DATE SERIAL EXPANSION */}
      {activeSubTab === 'list' && initialMode === 'approval' && (
        <div className="space-y-4">
          {/* Summary Metric KPI Cards */}
          <div className={`grid grid-cols-2 ${isAdminUser ? 'sm:grid-cols-4' : 'sm:grid-cols-5'} gap-3`}>
            <div className="cyber-glass-subcard p-3 rounded-xl border border-cyan-500/25 shadow-2xs">
              <span className="text-[10px] font-bold text-cyan-300 uppercase">Total Vouchers</span>
              <div className="text-lg font-black font-mono text-white">{summaryTotals.totalVouchers}</div>
              <span className="text-[10px] text-slate-400">
                {salesCenterRollups.length} centers · {userRollups.length} officers
              </span>
            </div>
            {!isAdminUser && (
              <div className="cyber-glass-subcard p-3 rounded-xl border border-amber-500/30 shadow-2xs">
                <span className="text-[10px] font-bold text-amber-300 uppercase">Pending In-Charge</span>
                <div className="text-lg font-black font-mono text-amber-200">{summaryTotals.pendingInCharge}</div>
                <span className="text-[10px] text-slate-400">Awaiting In-Charge review</span>
              </div>
            )}
            <div className="cyber-glass-subcard p-3 rounded-xl border border-indigo-400/30 shadow-2xs">
              <span className="text-[10px] font-bold text-indigo-300 uppercase">Pending Admin</span>
              <div className="text-lg font-black font-mono text-indigo-200">{summaryTotals.pendingAdmin}</div>
              <span className="text-[10px] text-slate-400">Ready for Admin approval</span>
            </div>
            <div className="cyber-glass-subcard p-3 rounded-xl border border-emerald-500/30 shadow-2xs">
              <span className="text-[10px] font-bold text-emerald-300 uppercase">Approved</span>
              <div className="text-lg font-black font-mono text-emerald-200">{summaryTotals.approved}</div>
              <span className="text-[10px] text-slate-400">Approved &amp; booked</span>
            </div>
            <div className="cyber-glass-subcard p-3 rounded-xl border border-cyan-400/35 shadow-2xs">
              <span className="text-[10px] font-bold text-cyan-200 uppercase">Grand Total Amount</span>
              <div className="text-lg font-black font-mono text-white">৳{summaryTotals.totalAmount.toLocaleString('en-IN')}</div>
              <span className="text-[10px] text-slate-400">Total conveyance bills</span>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="bg-[#081e2d]/85 backdrop-blur-xl text-white p-2.5 px-3.5 rounded-2xl shadow-lg border border-cyan-500/25 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-2 flex-wrap gap-y-2">
              <div className="flex items-center space-x-1.5 bg-[#061520]/90 px-2.5 py-1 h-[34px] rounded-xl border border-cyan-500/30">
                <span className="text-[11px] font-bold text-cyan-200/80">From:</span>
                <DateInputWithPicker
                  value={filterStartDate}
                  valueFormat="iso"
                  theme="dark"
                  onChange={(val) => setFilterStartDate(val)}
                  className="w-[108px]"
                  inputClassName="text-xs py-0.5 px-1.5"
                  title="Pick From Date (dd.mm.yy)"
                />
                <span className="text-[11px] font-bold text-cyan-200/80">To:</span>
                <DateInputWithPicker
                  value={filterEndDate}
                  valueFormat="iso"
                  theme="dark"
                  onChange={(val) => setFilterEndDate(val)}
                  className="w-[108px]"
                  inputClassName="text-xs py-0.5 px-1.5"
                  title="Pick To Date (dd.mm.yy)"
                />
              </div>

              {isSuperAdmin && (
                <div className="flex items-center space-x-1.5 bg-[#061520]/90 px-2.5 py-1 h-[34px] rounded-xl border border-cyan-500/30">
                  <span className="text-[11px] font-bold text-cyan-200/80 whitespace-nowrap">Sales Center:</span>
                  <select
                    value={filterBranchId}
                    onChange={(e) => setFilterBranchId(e.target.value)}
                    className="bg-transparent text-cyan-100 text-xs font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="ALL" className="bg-[#091e2c] text-white">All Sales Centers</option>
                    {effectiveBranches.map((b) => (
                      <option key={b.id} value={b.id} className="bg-[#091e2c] text-white">
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center space-x-1.5 bg-[#061520]/90 px-2.5 py-1 h-[34px] rounded-xl border border-cyan-500/30">
                <span className="text-[11px] font-bold text-cyan-200/80 whitespace-nowrap">Status:</span>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-transparent text-cyan-100 text-xs font-bold focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-[#091e2c] text-white">All Statuses</option>
                  {!isAdminUser && <option value="pending_incharge" className="bg-[#091e2c] text-white">Pending In-Charge</option>}
                  <option value="pending_admin" className="bg-[#091e2c] text-white">Pending Admin</option>
                  <option value="approved" className="bg-[#091e2c] text-white">Approved</option>
                  <option value="rejected" className="bg-[#091e2c] text-white">Rejected</option>
                </select>
              </div>

              <div className="relative min-w-[170px]">
                <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search officer, sales center..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 h-[34px] bg-[#061520]/90 text-white placeholder-slate-400 rounded-xl border border-cyan-500/30 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-cyan-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 text-xs font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {(filterStartDate || filterEndDate || filterBranchId !== 'ALL' || filterStatus !== 'ALL' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setFilterStartDate('');
                  setFilterEndDate('');
                  setFilterBranchId('ALL');
                  setFilterStatus('ALL');
                  setSearchQuery('');
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 h-[34px] bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/35 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>

          {/* UNIFIED HIERARCHY: SALES CENTER -> MARKETING PERSON -> DATE-WISE BILL DETAILS */}
          <div className="cyber-glass-card rounded-2xl overflow-hidden text-white">
            <div className="cyber-glass-header px-4 py-2.5 border-b border-cyan-500/25 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-cyan-300" />
                <span className="text-xs font-extrabold text-cyan-200 uppercase tracking-wider">
                  Sales Center Wise Approve Conveyance ({salesCenterRollups.length} Centers · {userRollups.length} Officers)
                </span>
              </div>
              <span className="text-[11px] text-slate-300 font-semibold">
                Expand Sales Center → Marketing Person → Date-Wise Individual Bills
              </span>
            </div>

            {salesCenterRollups.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No sales center conveyance vouchers found for approval.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#0c2638] text-cyan-200 font-bold uppercase text-[10px] border-b border-cyan-500/30 select-none">
                      <th className="py-2.5 px-3 w-12 text-center">SL</th>
                      <th className="py-2.5 px-3">Sales Center / Marketing Person</th>
                      <th className="py-2.5 px-3 text-center w-28">Total Day</th>
                      <th className="py-2.5 px-3 text-right w-32">Total Conveyance</th>
                      <th className="py-2.5 px-3 text-right w-32">Total Amount</th>
                      <th className="py-2.5 px-3 text-right w-72">Status / Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                    {salesCenterRollups.map((branchRow, bIdx) => {
                      const isExpanded = expandedBranchKeys.has(branchRow.branchKey);
                      const hasPendingIC = branchRow.pendingInChargeCount > 0;
                      const hasPendingAdmin = branchRow.pendingAdminCount > 0;
                      const canApproveCenter =
                        (hasPendingIC && isUserInCharge) || (hasPendingAdmin && isAdminUser);
                      const canRejectCenter =
                        (isUserInCharge || isAdminUser) &&
                        branchRow.vouchers.some((v) => v.status !== 'approved' && v.status !== 'rejected');

                      return (
                        <React.Fragment key={branchRow.branchKey}>
                          {/* LEVEL 1: SALES CENTER ROW */}
                          <tr
                            onClick={() => toggleBranchExpanded(branchRow.branchKey)}
                            className="hover:bg-cyan-500/[0.08] transition-colors cursor-pointer select-none bg-[#081d2c]/80"
                          >
                            <td className="py-3 px-3 text-center font-mono text-slate-400">{bIdx + 1}</td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <span className="p-0.5 rounded text-cyan-300">
                                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </span>
                                <div>
                                  <div className="font-black text-sm text-white">{branchRow.branchName}</div>
                                  <div className="text-[10px] text-slate-400 font-medium">
                                    {branchRow.officers.length} Marketing {branchRow.officers.length === 1 ? 'Person' : 'Persons'} · {branchRow.vouchers.length} Voucher(s)
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-center font-mono">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#0c2638] border border-cyan-500/25 text-cyan-200 font-bold">
                                {branchRow.totalDays} {branchRow.totalDays === 1 ? 'Day' : 'Days'}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-slate-100">
                              ৳{branchRow.totalTravelFare.toLocaleString('en-IN')}
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-black text-emerald-300 text-sm">
                              ৳{branchRow.grandTotal.toLocaleString('en-IN')}
                            </td>
                            <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                {hasPendingIC && (
                                  <span className="bg-amber-500/20 text-amber-200 text-[10px] font-black px-2 py-0.5 rounded-full border border-amber-400/35">
                                    {branchRow.pendingInChargeCount} Pending IC
                                  </span>
                                )}
                                {hasPendingAdmin && (
                                  <span className="bg-indigo-500/20 text-indigo-200 text-[10px] font-black px-2 py-0.5 rounded-full border border-indigo-400/35">
                                    {branchRow.pendingAdminCount} Pending Admin
                                  </span>
                                )}
                                {!hasPendingIC && !hasPendingAdmin && branchRow.approvedCount > 0 && (
                                  <span className="bg-emerald-500/20 text-emerald-200 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-400/35">
                                    All Approved
                                  </span>
                                )}
                                {branchRow.rejectedCount > 0 && (
                                  <span className="bg-rose-500/20 text-rose-200 text-[10px] font-black px-2 py-0.5 rounded-full border border-rose-400/35">
                                    {branchRow.rejectedCount} Rejected
                                  </span>
                                )}
                                {canApproveCenter && (
                                  <button
                                    type="button"
                                    onClick={() => handleApproveAllForBranch(branchRow.branchKey, branchRow.branchName)}
                                    className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-[10px] font-black transition-colors cursor-pointer"
                                  >
                                    Approve All
                                  </button>
                                )}
                                {canRejectCenter && (
                                  <button
                                    type="button"
                                    onClick={() => handleRejectBatch(branchRow.vouchers, branchRow.branchName)}
                                    className="px-2.5 py-1 bg-rose-600/90 hover:bg-rose-500 text-white rounded-lg text-[10px] font-black transition-colors cursor-pointer"
                                  >
                                    Reject All
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => toggleBranchExpanded(branchRow.branchKey)}
                                  className="px-2 py-1 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/25 rounded-lg text-[10px] font-bold cursor-pointer"
                                >
                                  {isExpanded ? 'Hide Persons' : 'View Persons'}
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* LEVEL 2: MARKETING PERSONS UNDER THIS SALES CENTER */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={6} className="p-3 bg-[#041018]/90 border-t border-cyan-500/20">
                                <div className="space-y-2.5">
                                  {branchRow.officers.map((officer, oIdx) => {
                                    const centerUserKey = `${branchRow.branchKey}::${officer.officerKey}`;
                                    const isOfficerExpanded = expandedCenterUserKeys.has(centerUserKey);
                                    const hasOffPendingIC = officer.pendingInChargeCount > 0;
                                    const hasOffPendingAdmin = officer.pendingAdminCount > 0;
                                    const canApproveOfficer =
                                      (hasOffPendingIC && isUserInCharge) || (hasOffPendingAdmin && isAdminUser);
                                    const canRejectOfficer =
                                      (isUserInCharge || isAdminUser) &&
                                      officer.vouchers.some((v) => v.status !== 'approved' && v.status !== 'rejected');

                                    return (
                                      <div
                                        key={centerUserKey}
                                        className="rounded-xl border border-cyan-500/25 bg-[#071824]/95 overflow-hidden shadow-md"
                                      >
                                        {/* Marketing Person Header Row (matches reference layout) */}
                                        <div
                                          onClick={() => toggleCenterUserExpanded(centerUserKey)}
                                          className="px-3.5 py-2.5 hover:bg-cyan-500/[0.07] transition-colors cursor-pointer select-none flex flex-wrap items-center justify-between gap-3 bg-[#081b28]/95"
                                        >
                                          <div className="flex items-center gap-3 min-w-0">
                                            <span className="font-mono text-xs text-slate-400 w-5 text-center shrink-0">
                                              {oIdx + 1}
                                            </span>
                                            <span className="p-0.5 rounded text-cyan-300 shrink-0">
                                              {isOfficerExpanded ? (
                                                <ChevronDown className="w-4 h-4" />
                                              ) : (
                                                <ChevronRight className="w-4 h-4" />
                                              )}
                                            </span>
                                            <div className="min-w-0">
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-black text-sm text-white">
                                                  {officer.userName}
                                                </span>
                                                {officer.userCode && (
                                                  <span className="font-mono text-[10px] bg-[#0c2638] text-cyan-200 border border-cyan-500/25 px-1.5 py-0.5 rounded font-bold">
                                                    {officer.userCode}
                                                  </span>
                                                )}
                                              </div>
                                              <div className="text-[10px] text-slate-400 font-medium">
                                                {branchRow.branchName} · {officer.vouchers.length} Voucher(s)
                                              </div>
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-4 sm:gap-6 flex-wrap" onClick={(e) => e.stopPropagation()}>
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#0c2638] border border-cyan-500/25 text-cyan-200 font-mono text-xs font-bold">
                                              {officer.totalDays} {officer.totalDays === 1 ? 'Day' : 'Days'}
                                            </span>

                                            <div className="text-right font-mono font-bold text-slate-100 text-xs min-w-[72px]">
                                              ৳{officer.totalTravelFare.toLocaleString('en-IN')}
                                            </div>

                                            <div className="text-right font-mono font-black text-emerald-300 text-sm min-w-[80px]">
                                              ৳{officer.grandTotal.toLocaleString('en-IN')}
                                            </div>

                                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                              {hasOffPendingIC && (
                                                <span className="bg-amber-500/20 text-amber-200 text-[10px] font-black px-2 py-0.5 rounded-full border border-amber-400/35">
                                                  {officer.pendingInChargeCount} Pending IC
                                                </span>
                                              )}
                                              {hasOffPendingAdmin && (
                                                <span className="bg-indigo-500/20 text-indigo-200 text-[10px] font-black px-2 py-0.5 rounded-full border border-indigo-400/35">
                                                  {officer.pendingAdminCount} Pending Admin
                                                </span>
                                              )}
                                              {!hasOffPendingIC && !hasOffPendingAdmin && officer.approvedCount > 0 && (
                                                <span className="bg-emerald-500/20 text-emerald-200 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-400/35">
                                                  All Approved
                                                </span>
                                              )}
                                              {officer.rejectedCount > 0 && (
                                                <span className="bg-rose-500/20 text-rose-200 text-[10px] font-black px-2 py-0.5 rounded-full border border-rose-400/35">
                                                  {officer.rejectedCount} Rejected
                                                </span>
                                              )}
                                              {canApproveOfficer && (
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    handleApproveAllForUser(officer.userId, officer.userName, branchRow.branchKey)
                                                  }
                                                  className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-[10px] font-black transition-colors cursor-pointer"
                                                >
                                                  Approve All
                                                </button>
                                              )}
                                              {canRejectOfficer && (
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    handleRejectBatch(
                                                      officer.vouchers,
                                                      `${officer.userName} (${branchRow.branchName})`
                                                    )
                                                  }
                                                  className="px-2.5 py-1 bg-rose-600/90 hover:bg-rose-500 text-white rounded-lg text-[10px] font-black transition-colors cursor-pointer"
                                                >
                                                  Reject All
                                                </button>
                                              )}
                                              <button
                                                type="button"
                                                onClick={() => toggleCenterUserExpanded(centerUserKey)}
                                                className="px-2.5 py-1 bg-[#061520] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/25 rounded-lg text-[10px] font-bold cursor-pointer"
                                              >
                                                {isOfficerExpanded ? 'Hide Dates' : 'View Dates'}
                                              </button>
                                            </div>
                                          </div>
                                        </div>

                                        {/* LEVEL 3: DATE-WISE INDIVIDUAL BILLS FOR THIS MARKETING PERSON */}
                                        {isOfficerExpanded && (
                                          <div className="p-2.5 bg-[#041018]/90 border-t border-cyan-500/20 overflow-x-auto">
                                            <table className="w-full text-left text-xs border-collapse">
                                              <thead>
                                                <tr className="bg-[#0c2638] text-cyan-200 font-bold border-b border-cyan-500/30 uppercase text-[10px]">
                                                  <th className="p-2 w-10 text-center">SL</th>
                                                  <th className="p-2 w-24">Date</th>
                                                  <th className="p-2 w-28">Voucher #</th>
                                                  <th className="p-2">Sales Center</th>
                                                  <th className="p-2 min-w-[170px]">Route (From → To)</th>
                                                  <th className="p-2 w-24">Mode</th>
                                                  <th className="p-2 w-24 text-right">Conveyance</th>
                                                  <th className="p-2 w-20 text-right">D.A.</th>
                                                  <th className="p-2 w-20 text-right">Hotel</th>
                                                  <th className="p-2 w-24 text-right font-black text-white">Total Amt</th>
                                                  <th className="p-2 w-28 text-center">Status</th>
                                                  <th className="p-2 w-36 text-center">Actions</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-cyan-500/15 text-slate-200">
                                                {officer.vouchers.map((v, vIdx) => {
                                                  const isPendingIncharge = v.status === 'pending_incharge';
                                                  const isPendingAdmin = v.status === 'pending_admin';
                                                  const isApproved = v.status === 'approved';
                                                  const isRejected = v.status === 'rejected';
                                                  const canSingleApprove =
                                                    (isPendingIncharge && isUserInCharge) ||
                                                    (isPendingAdmin && isAdminUser);
                                                  const uniqueModes =
                                                    v.journeyRows && v.journeyRows.length > 0
                                                      ? Array.from(new Set(v.journeyRows.map((l) => l.by).filter(Boolean))).join(', ')
                                                      : v.transportMode || 'Bus';

                                                  return (
                                                    <tr key={v.id} className="hover:bg-cyan-500/[0.06] transition-colors">
                                                      <td className="p-2 text-center font-mono text-slate-400">{vIdx + 1}</td>
                                                      <td className="p-2 font-mono font-bold whitespace-nowrap">
                                                        <button
                                                          type="button"
                                                          onClick={() => setPreviewVoucher(v)}
                                                          className="text-cyan-300 hover:underline cursor-pointer"
                                                        >
                                                          {formatDateDDMMYY(v.date) || v.date}
                                                        </button>
                                                      </td>
                                                      <td className="p-2 font-mono text-amber-300 font-bold">{v.voucherNo || '-'}</td>
                                                      <td className="p-2 text-slate-300">{branchRow.branchName}</td>
                                                      <td className="p-2 text-slate-300">
                                                        <span>{v.fromLocation || 'Start'}</span>
                                                        <span className="mx-1 text-slate-500">→</span>
                                                        <span className="font-semibold text-white">{v.toLocation || 'End'}</span>
                                                      </td>
                                                      <td className="p-2 text-slate-300">{uniqueModes || 'Bus'}</td>
                                                      <td className="p-2 text-right font-mono">
                                                        ৳{(v.conveyanceAmount || 0).toLocaleString('en-IN')}
                                                      </td>
                                                      <td className="p-2 text-right font-mono text-amber-300">
                                                        ৳{(v.dailyAllowanceAmount || 0).toLocaleString('en-IN')}
                                                      </td>
                                                      <td className="p-2 text-right font-mono text-purple-300">
                                                        {v.hasHotelBill ? `৳${(v.hotelAmount || 0).toLocaleString('en-IN')}` : '-'}
                                                      </td>
                                                      <td className="p-2 text-right font-mono font-black text-emerald-300">
                                                        <button
                                                          type="button"
                                                          onClick={() => setPreviewVoucher(v)}
                                                          className="hover:underline cursor-pointer"
                                                        >
                                                          ৳{(v.totalAmount || 0).toLocaleString('en-IN')}
                                                        </button>
                                                      </td>
                                                      <td className="p-2 text-center">
                                                        {isPendingIncharge && (
                                                          <span className="bg-amber-500/20 text-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-400/35">
                                                            Pending IC
                                                          </span>
                                                        )}
                                                        {isPendingAdmin && (
                                                          <span className="bg-indigo-500/20 text-indigo-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-400/35">
                                                            Pending Admin
                                                          </span>
                                                        )}
                                                        {isApproved && (
                                                          <span className="bg-emerald-500/20 text-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-400/35">
                                                            Approved
                                                          </span>
                                                        )}
                                                        {isRejected && (
                                                          <span className="bg-rose-500/20 text-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-400/35">
                                                            Rejected
                                                          </span>
                                                        )}
                                                      </td>
                                                      <td className="p-2 text-center">
                                                        <div className="flex items-center justify-center space-x-1">
                                                          <button
                                                            type="button"
                                                            onClick={() => setPreviewVoucher(v)}
                                                            className="p-1 text-slate-300 hover:text-cyan-300 hover:bg-[#0c2638] rounded transition-colors cursor-pointer"
                                                            title="View / Print Voucher Slip"
                                                          >
                                                            <Printer className="w-3.5 h-3.5" />
                                                          </button>
                                                          {canSingleApprove && (
                                                            <button
                                                              type="button"
                                                              onClick={() => handleApproveSingle(v)}
                                                              className="px-2 py-0.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded text-[10px] font-black transition-colors cursor-pointer"
                                                            >
                                                              {isPendingIncharge ? 'IC Approve' : 'Approve'}
                                                            </button>
                                                          )}
                                                          {!isApproved && !isRejected && (isUserInCharge || isAdmin || isSuperAdmin) && (
                                                            <button
                                                              type="button"
                                                              onClick={() => handleRejectSingle(v)}
                                                              className="px-2 py-0.5 bg-rose-600/90 hover:bg-rose-500 text-white rounded text-[10px] font-bold transition-colors cursor-pointer"
                                                              title="Reject Voucher"
                                                            >
                                                              Reject
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
                                        )}
                                      </div>
                                    );
                                  })}
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
        </div>
      )}

      {activeSubTab === 'list' && initialMode !== 'approval' && (
        <div className="space-y-4">
          {/* Summary Metric KPI Cards */}
          <div className={`grid grid-cols-2 ${isAdminUser ? 'sm:grid-cols-4' : 'sm:grid-cols-5'} gap-3`}>
            <div className="cyber-glass-subcard p-3 rounded-xl border border-cyan-500/25 shadow-2xs">
              <span className="text-[10px] font-bold text-cyan-300 uppercase">Total Vouchers</span>
              <div className="text-lg font-black font-mono text-white">{summaryTotals.totalVouchers}</div>
              <span className="text-[10px] text-slate-400">Across {userRollups.length} users</span>
            </div>
            {!isAdminUser && (
              <div className="cyber-glass-subcard p-3 rounded-xl border border-amber-500/30 shadow-2xs">
                <span className="text-[10px] font-bold text-amber-300 uppercase">Pending In-Charge</span>
                <div className="text-lg font-black font-mono text-amber-200">{summaryTotals.pendingInCharge}</div>
                <span className="text-[10px] text-slate-400">Awaiting In-Charge review</span>
              </div>
            )}
            <div className="cyber-glass-subcard p-3 rounded-xl border border-indigo-400/30 shadow-2xs">
              <span className="text-[10px] font-bold text-indigo-300 uppercase">Pending Admin</span>
              <div className="text-lg font-black font-mono text-indigo-200">{summaryTotals.pendingAdmin}</div>
              <span className="text-[10px] text-slate-400">Ready for Admin approval</span>
            </div>
            <div className="cyber-glass-subcard p-3 rounded-xl border border-emerald-500/30 shadow-2xs">
              <span className="text-[10px] font-bold text-emerald-300 uppercase">Approved</span>
              <div className="text-lg font-black font-mono text-emerald-200">{summaryTotals.approved}</div>
              <span className="text-[10px] text-slate-400">Approved &amp; booked</span>
            </div>
            <div className="cyber-glass-subcard p-3 rounded-xl border border-cyan-400/35 shadow-2xs">
              <span className="text-[10px] font-bold text-cyan-200 uppercase">Grand Total Amount</span>
              <div className="text-lg font-black font-mono text-white">৳{summaryTotals.totalAmount.toLocaleString('en-IN')}</div>
              <span className="text-[10px] text-slate-400">Total conveyance bills</span>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="bg-[#081e2d]/85 backdrop-blur-xl text-white p-2.5 px-3.5 rounded-2xl shadow-lg border border-cyan-500/25 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-2 flex-wrap gap-y-2">
              <div className="flex items-center space-x-1.5 bg-[#061520]/90 px-2.5 py-1 h-[34px] rounded-xl border border-cyan-500/30">
                <span className="text-[11px] font-bold text-cyan-200/80">From:</span>
                <DateInputWithPicker
                  value={filterStartDate}
                  valueFormat="iso"
                  theme="dark"
                  onChange={(val) => setFilterStartDate(val)}
                  className="w-[108px]"
                  inputClassName="text-xs py-0.5 px-1.5"
                  title="Pick From Date (dd.mm.yy)"
                />
                <span className="text-[11px] font-bold text-cyan-200/80">To:</span>
                <DateInputWithPicker
                  value={filterEndDate}
                  valueFormat="iso"
                  theme="dark"
                  onChange={(val) => setFilterEndDate(val)}
                  className="w-[108px]"
                  inputClassName="text-xs py-0.5 px-1.5"
                  title="Pick To Date (dd.mm.yy)"
                />
              </div>

              {isSuperAdmin && (
                <div className="flex items-center space-x-1.5 bg-[#061520]/90 px-2.5 py-1 h-[34px] rounded-xl border border-cyan-500/30">
                  <span className="text-[11px] font-bold text-cyan-200/80 whitespace-nowrap">Branch:</span>
                  <select
                    value={filterBranchId}
                    onChange={(e) => setFilterBranchId(e.target.value)}
                    className="bg-transparent text-cyan-100 text-xs font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="ALL" className="bg-[#091e2c] text-white">All Sales Centers</option>
                    {effectiveBranches.map((b) => (
                      <option key={b.id} value={b.id} className="bg-[#091e2c] text-white">
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center space-x-1.5 bg-[#061520]/90 px-2.5 py-1 h-[34px] rounded-xl border border-cyan-500/30">
                <span className="text-[11px] font-bold text-cyan-200/80 whitespace-nowrap">Status:</span>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-transparent text-cyan-100 text-xs font-bold focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-[#091e2c] text-white">All Statuses</option>
                  {!isAdminUser && <option value="pending_incharge" className="bg-[#091e2c] text-white">Pending In-Charge</option>}
                  <option value="pending_admin" className="bg-[#091e2c] text-white">Pending Admin</option>
                  <option value="approved" className="bg-[#091e2c] text-white">Approved</option>
                  <option value="rejected" className="bg-[#091e2c] text-white">Rejected</option>
                </select>
              </div>

              <div className="relative min-w-[170px]">
                <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search user, route..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 h-[34px] bg-[#061520]/90 text-white placeholder-slate-400 rounded-xl border border-cyan-500/30 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-cyan-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 text-xs font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {(filterStartDate || filterEndDate || filterBranchId !== 'ALL' || filterStatus !== 'ALL' || searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterStartDate('');
                    setFilterEndDate('');
                    setFilterBranchId('ALL');
                    setFilterStatus('ALL');
                    setSearchQuery('');
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 h-[34px] bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/35 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
                >
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>

          {/* Level 1: User Rollup Directory with One-Click Total Approve & Date Drill-Down */}
          <div className="cyber-glass-card rounded-2xl overflow-hidden text-white">
            <div className="cyber-glass-header px-4 py-2.5 border-b border-cyan-500/25 flex items-center justify-between">
              <span className="text-xs font-extrabold text-cyan-200 uppercase tracking-wider">
                User-Wise Conveyance Summary &amp; Total Day Amounts ({userRollups.length} Users)
              </span>
              <span className="text-xs text-slate-300 font-semibold">
                Click user to expand date-wise list · Single approve or total approve in one click
              </span>
            </div>

            {userRollups.length === 0 ? (
              <div className="p-8 text-center text-slate-300 text-xs">
                <Car className="w-8 h-8 text-cyan-400/50 mx-auto mb-2" />
                <p className="font-bold text-sm text-white">No conveyance records found</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Click "Create Voucher" above to submit a new daily conveyance bill.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-cyan-500/15">
                {userRollups.map((userRow, uIdx) => {
                  const isExpanded = expandedUserIds.has(userRow.userId);
                  const hasPendingInCharge = userRow.pendingInChargeCount > 0;
                  const hasPendingAdmin = userRow.pendingAdminCount > 0;
                  const canTotalApprove =
                    (hasPendingInCharge && isUserInCharge) ||
                    (hasPendingAdmin && isAdminUser);

                  return (
                    <div key={userRow.userId} className="transition-colors">
                      {/* USER ROLLUP ROW (Level 1) */}
                      <div className="p-3.5 hover:bg-cyan-500/[0.06] flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-[#071824]/70">
                        <div
                          onClick={() => toggleUserExpanded(userRow.userId)}
                          className="flex items-center space-x-3 cursor-pointer select-none flex-1"
                        >
                          <button
                            type="button"
                            className="p-1 rounded text-slate-400 hover:text-cyan-300 transition-transform"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-cyan-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-black text-sm text-white hover:text-cyan-300 transition-colors">
                                {userRow.userName}
                              </span>
                              {userRow.userCode && (
                                <span className="font-mono text-[10px] bg-[#0c2638] text-cyan-200 border border-cyan-500/25 px-1.5 py-0.5 rounded font-bold">
                                  {userRow.userCode}
                                </span>
                              )}
                              <span className="text-[11px] text-slate-300 font-medium">
                                · {userRow.branchName}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 font-medium mt-0.5">
                              {userRow.totalDays} Total Days / Trips Recorded
                            </div>
                          </div>
                        </div>

                        {/* Breakdown Figures */}
                        <div className="flex items-center space-x-4 text-xs font-mono">
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 uppercase block">Travel Fare</span>
                            <span className="font-bold text-slate-200">৳{userRow.totalTravelFare.toLocaleString('en-IN')}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 uppercase block">D.A. (Food)</span>
                            <span className="font-bold text-amber-300">৳{userRow.totalDailyAllowance.toLocaleString('en-IN')}</span>
                          </div>
                          {userRow.totalHotelBill > 0 && (
                            <div className="text-right">
                              <span className="text-[10px] text-slate-400 uppercase block">Hotel Bill</span>
                              <span className="font-bold text-purple-300">৳{userRow.totalHotelBill.toLocaleString('en-IN')}</span>
                            </div>
                          )}
                          <div className="text-right pl-2 border-l border-cyan-500/25">
                            <span className="text-[10px] text-slate-400 uppercase block">Total Day Total</span>
                            <span className="font-black text-base text-emerald-300">৳{userRow.grandTotal.toLocaleString('en-IN')}</span>
                          </div>
                        </div>

                        {/* Action Buttons: Expand & One-Click Total Approve */}
                        <div className="flex items-center space-x-2">
                          {/* Pending Badges */}
                          {hasPendingInCharge && (
                            <span className="bg-amber-500/20 text-amber-200 text-[10px] font-black px-2 py-0.5 rounded-full border border-amber-400/35">
                              {userRow.pendingInChargeCount} Pending IC
                            </span>
                          )}
                          {hasPendingAdmin && (
                            <span className="bg-indigo-500/20 text-indigo-200 text-[10px] font-black px-2 py-0.5 rounded-full border border-indigo-400/35">
                              {userRow.pendingAdminCount} Pending Admin
                            </span>
                          )}
                          {!hasPendingInCharge && !hasPendingAdmin && (
                            <span className="bg-emerald-500/20 text-emerald-200 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-400/35 flex items-center space-x-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>All Approved</span>
                            </span>
                          )}

                          {/* ONE-CLICK TOTAL APPROVE BUTTON */}
                          {canTotalApprove && (
                            <button
                              type="button"
                              onClick={() => handleApproveAllForUser(userRow.userId, userRow.userName)}
                              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black shadow-xs transition-colors cursor-pointer flex items-center space-x-1"
                              title={`One-click total approve all pending vouchers for ${userRow.userName}`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Approve All</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => toggleUserExpanded(userRow.userId)}
                            className="px-2.5 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/25 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                          >
                            {isExpanded ? 'Hide Dates' : 'View Dates'}
                          </button>
                        </div>
                      </div>

                      {/* LEVEL 2: DATE-WISE LIST FOR EXPANDED USER */}
                      {isExpanded && (
                        <div className="bg-[#041018]/80 p-3 sm:p-4 border-t border-cyan-500/20">
                          <div className="bg-[#071824]/90 rounded-xl border border-cyan-500/25 overflow-hidden shadow-2xs">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-[#0c2638] text-cyan-200 font-bold border-b border-cyan-500/30 uppercase text-[10px]">
                                  <th className="p-2.5 w-10 text-center">SL</th>
                                  <th className="p-2.5 w-28">Voucher Date</th>
                                  <th className="p-2.5 min-w-[200px]">Route (From → To)</th>
                                  <th className="p-2.5 w-24">Mode</th>
                                  <th className="p-2.5 w-24 text-right">Travel Fare</th>
                                  <th className="p-2.5 w-24 text-right">D.A. (Food)</th>
                                  <th className="p-2.5 w-24 text-right">Hotel</th>
                                  <th className="p-2.5 w-28 text-right font-black text-white">Total Day Amt</th>
                                  <th className="p-2.5 w-32 text-center">Status</th>
                                  <th className="p-2.5 w-36 text-center">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-cyan-500/15 text-slate-200">
                                {userRow.vouchers.map((v, vIdx) => {
                                  const isPendingIncharge = v.status === 'pending_incharge';
                                  const isPendingAdmin = v.status === 'pending_admin';
                                  const isApproved = v.status === 'approved';
                                  const isRejected = v.status === 'rejected';

                                  const canSingleApprove =
                                    (isPendingIncharge && isUserInCharge) ||
                                    (isPendingAdmin && isAdminUser);

                                  return (
                                    <tr key={v.id} className="hover:bg-cyan-500/[0.06] transition-colors">
                                      <td className="p-2.5 text-center font-mono text-slate-400">
                                        {vIdx + 1}
                                      </td>

                                      {/* Click date to view slip */}
                                      <td className="p-2.5 font-bold">
                                        <button
                                          type="button"
                                          onClick={() => setPreviewVoucher(v)}
                                          className="text-cyan-300 hover:text-cyan-200 hover:underline cursor-pointer font-bold font-mono text-xs flex items-center space-x-1"
                                          title="Click to view full voucher breakdown slip"
                                        >
                                          <span>{v.date}</span>
                                        </button>
                                      </td>

                                      <td className="p-2.5 text-slate-300">
                                        <div className="flex items-center space-x-1 text-xs">
                                          <span className="font-medium">{v.fromLocation || 'Start'}</span>
                                          <ArrowRight className="w-3 h-3 text-slate-500 flex-shrink-0" />
                                          <span className="font-semibold text-white">{v.toLocation || 'End'}</span>
                                        </div>
                                      </td>

                                      <td className="p-2.5 text-slate-300 font-medium">
                                        {v.transportMode || 'Bus'}
                                      </td>

                                      <td className="p-2.5 text-right font-mono font-bold text-slate-200">
                                        ৳{(v.conveyanceAmount || 0).toLocaleString('en-IN')}
                                      </td>

                                      <td className="p-2.5 text-right font-mono font-bold text-amber-300">
                                        ৳{(v.dailyAllowanceAmount || 0).toLocaleString('en-IN')}
                                      </td>

                                      <td className="p-2.5 text-right font-mono font-bold text-purple-300">
                                        {v.hasHotelBill ? `৳${(v.hotelAmount || 0).toLocaleString('en-IN')}` : '-'}
                                      </td>

                                      {/* Click amount to view slip */}
                                      <td className="p-2.5 text-right font-mono font-black text-white">
                                        <button
                                          type="button"
                                          onClick={() => setPreviewVoucher(v)}
                                          className="text-emerald-300 hover:text-emerald-200 hover:underline cursor-pointer font-black font-mono text-xs"
                                          title="Click to view full voucher slip"
                                        >
                                          ৳{(v.totalAmount || 0).toLocaleString('en-IN')}
                                        </button>
                                      </td>

                                      <td className="p-2.5 text-center">
                                        {isPendingIncharge && (
                                          <span className="bg-amber-500/20 text-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-400/35">
                                            Pending In-Charge
                                          </span>
                                        )}
                                        {isPendingAdmin && (
                                          <span className="bg-indigo-500/20 text-indigo-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-400/35">
                                            Pending Admin
                                          </span>
                                        )}
                                        {isApproved && (
                                          <span className="bg-emerald-500/20 text-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-400/35">
                                            Approved
                                          </span>
                                        )}
                                        {isRejected && (
                                          <span className="bg-rose-500/20 text-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-400/35">
                                            Rejected
                                          </span>
                                        )}
                                      </td>

                                      {/* Actions: View Slip, Single Approve, Reject, Edit, Delete */}
                                      <td className="p-2.5 text-center">
                                        <div className="flex items-center justify-center space-x-1">
                                          <button
                                            type="button"
                                            onClick={() => setPreviewVoucher(v)}
                                            className="p-1 text-slate-300 hover:text-cyan-300 hover:bg-[#0c2638] rounded transition-colors cursor-pointer"
                                            title="View / Print Voucher Slip"
                                          >
                                            <Printer className="w-3.5 h-3.5" />
                                          </button>

                                          {/* Single Approve Button */}
                                          {canSingleApprove && (
                                            <button
                                              type="button"
                                              onClick={() => handleApproveSingle(v)}
                                              className="px-2 py-0.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded text-[10px] font-black transition-colors cursor-pointer"
                                              title={
                                                isPendingIncharge
                                                  ? 'Approve as In-Charge (Forward to Admin)'
                                                  : 'Final Admin Approval'
                                              }
                                            >
                                              {isPendingIncharge ? 'IC Approve' : 'Approve'}
                                            </button>
                                          )}

                                          {/* Reject Button */}
                                          {!isApproved && !isRejected && (isUserInCharge || isAdmin || isSuperAdmin) && (
                                            <button
                                              type="button"
                                              onClick={() => handleRejectSingle(v)}
                                              className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors cursor-pointer"
                                              title="Reject Voucher"
                                            >
                                              <XCircle className="w-3.5 h-3.5" />
                                            </button>
                                          )}

                                          {!isApproved && (
                                            <button
                                              type="button"
                                              onClick={() => handleEditVoucher(v)}
                                              className="p-1 text-slate-400 hover:text-amber-300 rounded transition-colors cursor-pointer"
                                              title="Edit Voucher"
                                            >
                                              <FileText className="w-3.5 h-3.5" />
                                            </button>
                                          )}

                                          {!isApproved && (
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteVoucher(v)}
                                              className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors cursor-pointer"
                                              title="Delete Voucher"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
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
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* LEVEL 3: MODAL PREVIEW & PRINT OFFICIAL CONVEYANCE VOUCHER SLIP */}
      {previewVoucher && (
        <div className="print-preview-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-[#030d14]/80 p-3 sm:p-5 backdrop-blur-sm animate-in fade-in duration-200 print:p-0 print:bg-white">
          <div className="print-preview-modal-dialog bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 max-h-[92vh] overflow-y-auto print:bg-white print:border-none print:shadow-none print:p-0 print:max-w-full print:max-h-none print:overflow-visible">
            {/* Header Toolbar */}
            <div className="flex items-center justify-between pb-3 border-b border-cyan-500/25 no-print">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-black text-white">
                  Conveyance Voucher Slip ({previewVoucher.voucherNo || previewVoucher.id})
                </h3>
              </div>
              <div className="flex items-center space-x-2">
                {((previewVoucher.status === 'pending_incharge' && (isUserInCharge || isSuperAdmin)) ||
                  (previewVoucher.status === 'pending_admin' && (isAdmin || isSuperAdmin))) && (
                  <button
                    type="button"
                    onClick={() => handleApproveSingle(previewVoucher)}
                    className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black shadow-md cursor-pointer flex items-center space-x-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{previewVoucher.status === 'pending_incharge' ? 'IC Approve' : 'Admin Approve'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-xl text-xs font-black shadow-2xs cursor-pointer flex items-center space-x-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Slip</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewVoucher(null)}
                  className="p-1.5 text-slate-300 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Official Slip Content */}
            <div className="print-paper-sheet mt-4 p-5 border-2 border-slate-800 rounded-xl bg-white text-slate-900 font-sans space-y-4 print:mt-0 print:border print:border-black print:rounded-none">
              <div className="text-center pb-3 border-b border-slate-300">
                <h2 className="text-lg font-black uppercase tracking-wider text-slate-950">
                  Poly Cable Industries Limited
                </h2>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-widest mt-0.5">
                  Official Daily Conveyance &amp; Tour Voucher Slip
                </p>
                <div className="flex justify-between items-center text-[11px] font-bold text-slate-700 mt-2">
                  <span>Vr. No: {previewVoucher.voucherNo || previewVoucher.id}</span>
                  <span>Date: {previewVoucher.date}</span>
                </div>
              </div>

              {/* Employee & Branch Details */}
              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Employee Name:</span>
                  <span className="font-bold text-slate-900">{previewVoucher.salespersonName}</span>
                  {previewVoucher.salesmanCode && (
                    <span className="text-slate-500 font-mono text-[11px]"> ({previewVoucher.salesmanCode})</span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Sales Center:</span>
                  <span className="font-bold text-slate-900">{previewVoucher.branchName || 'Sales Center'}</span>
                </div>
              </div>

              {/* Legs Table */}
              <table className="w-full text-left text-xs border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300 uppercase text-[10px]">
                    <th className="border border-slate-300 p-2 text-center w-8">SL</th>
                    <th className="border border-slate-300 p-2">From Location</th>
                    <th className="border border-slate-300 p-2">To Destination</th>
                    <th className="border border-slate-300 p-2 w-24">By</th>
                    <th className="border border-slate-300 p-2 text-right w-24">Fare (Tk)</th>
                  </tr>
                </thead>
                <tbody>
                  {(previewVoucher.journeyRows && previewVoucher.journeyRows.length > 0
                    ? previewVoucher.journeyRows
                    : [
                        {
                          from: previewVoucher.fromLocation,
                          to: previewVoucher.toLocation,
                          by: previewVoucher.transportMode,
                          taka: previewVoucher.conveyanceAmount
                        }
                      ]
                  ).map((leg, lIdx) => (
                    <tr key={lIdx} className="border-b border-slate-200">
                      <td className="border border-slate-300 p-2 text-center font-mono">{lIdx + 1}</td>
                      <td className="border border-slate-300 p-2 font-medium">{leg.from || '-'}</td>
                      <td className="border border-slate-300 p-2 font-medium">{leg.to || '-'}</td>
                      <td className="border border-slate-300 p-2">{leg.by || 'Bus'}</td>
                      <td className="border border-slate-300 p-2 text-right font-mono font-bold">
                        ৳{(Number(leg.taka) || 0).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                  {/* Daily Allowance Row */}
                  {Number(previewVoucher.dailyAllowanceAmount) > 0 && (
                    <tr className="border-b border-slate-300 bg-amber-50/40 font-semibold">
                      <td colSpan={4} className="border border-slate-300 p-2 text-right text-amber-950">
                        Daily Allowance ({previewVoucher.dailyAllowanceType || 'Food'}):
                      </td>
                      <td className="border border-slate-300 p-2 text-right font-mono font-bold text-amber-900">
                        ৳{Number(previewVoucher.dailyAllowanceAmount).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  )}
                  {/* Hotel Bill Row */}
                  {previewVoucher.hasHotelBill && Number(previewVoucher.hotelAmount) > 0 && (
                    <tr className="border-b border-slate-300 bg-purple-50/40 font-semibold">
                      <td colSpan={4} className="border border-slate-300 p-2 text-right text-purple-950">
                        Hotel Bill {previewVoucher.hotelName ? `(${previewVoucher.hotelName})` : ''}:
                      </td>
                      <td className="border border-slate-300 p-2 text-right font-mono font-bold text-purple-900">
                        ৳{Number(previewVoucher.hotelAmount).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  )}
                  {/* Total Row */}
                  <tr className="bg-slate-100 font-black text-slate-950">
                    <td colSpan={4} className="border border-slate-300 p-2 text-right uppercase">
                      Total Conveyance Amount:
                    </td>
                    <td className="border border-slate-300 p-2 text-right font-mono text-sm text-emerald-800">
                      ৳{Number(previewVoucher.totalAmount).toLocaleString('en-IN')}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* In Words */}
              <div className="text-xs bg-slate-50 p-2 rounded border border-slate-200">
                <span className="font-bold text-slate-600">In Words: </span>
                <span className="font-extrabold text-slate-900">
                  {convertToTakaWords(previewVoucher.totalAmount)}
                </span>
              </div>

              {/* Status & Approvals */}
              <div className="text-[11px] text-slate-600 space-y-1 pt-1">
                <div>
                  <span className="font-bold">Status: </span>
                  <span className="uppercase font-extrabold">
                    {previewVoucher.status.replace('_', ' ')}
                  </span>
                </div>
                {previewVoucher.inChargeApprovedBy && (
                  <div>
                    <span className="font-bold">In-Charge Sign: </span>
                    <span>{previewVoucher.inChargeApprovedBy} at {previewVoucher.inChargeApprovedAt?.slice(0, 10)}</span>
                  </div>
                )}
                {previewVoucher.adminApprovedBy && (
                  <div>
                    <span className="font-bold">Approved By: </span>
                    <span>{previewVoucher.adminApprovedBy} at {previewVoucher.adminApprovedAt?.slice(0, 10)}</span>
                  </div>
                )}
              </div>

              {/* Signatures */}
              <div className="pt-8 flex justify-between items-end text-xs text-slate-700 font-bold">
                <div className="text-center">
                  <div className="w-32 border-t border-slate-600 pt-1">Employee Sign</div>
                </div>
                <div className="text-center">
                  <div className="w-32 border-t border-slate-600 pt-1">Sales Center In-Charge</div>
                </div>
                <div className="text-center">
                  <div className="w-32 border-t border-slate-600 pt-1">Approved By</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Rejection Reason Modal */}
      {rejectModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0c2333] border border-rose-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-rose-400" />
                <span>Reject Conveyance Voucher(s)</span>
              </h3>
              <button
                type="button"
                onClick={() => setRejectModalTarget(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-300">
              Rejecting {rejectModalTarget.vouchers.length} voucher(s) for{' '}
              <span className="font-bold text-white">{rejectModalTarget.title}</span>.
            </p>
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">Reason for Rejection:</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter explanation for rejection..."
                rows={3}
                className="w-full p-2 bg-[#071622] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
              />
            </div>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalTarget(null)}
                className="px-4 py-2 text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
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
