import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  StoredBill,
  BillLineItem,
  CollectionMR,
  Salesperson,
  BranchLocation,
  Party,
  Item,
  StockReturnChallan,
  CompanyDetails,
  AuthUser
} from '../types';
import {
  ArrowLeft,
  Search,
  Calendar,
  FileSpreadsheet,
  Building2,
  TrendingUp,
  Users,
  DollarSign,
  Award,
  Crown,
  RotateCcw,
  Clock,
  Boxes,
  Layers,
  ChevronDown,
  CheckCircle2,
  Target,
  Sparkles,
  Edit2,
  Printer,
  Lock,
  ShieldCheck,
  ChevronUp,
  ChevronRight,
  Bell
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatDateDDMMYY, parseDateToISO } from '../utils/dateUtils';
import { SetAllTargetsModal } from './SetAllTargetsModal';
import {
  cleanBranchName,
  billMatchesBranch,
  collectionMatchesBranch,
  getUserLoginFilters,
  isSuperAdminOrAgm,
  isStrictSuperAdmin,
  isAnyAdmin,
  isAccountsAdmin,
  isDefaultAdmin,
  filterBranchesForUser,
  filterSalespersonsByBranch,
  getAllAdmins,
  getUserBranch,
  isUnwantedSalesCenter,
  AdminClusterInfo
} from '../utils/branchAccess';
import { sortItemsCategorySerialWise } from '../utils/searchHelper';
import { SalesCenterSearchFilter } from './SalesCenterSearchFilter';
import { InfographicPieDonutGraph, InfographicSliceData } from './CyberDonutChart';
import { categorizeCableItem } from '../utils/categoryHelper';

interface AdminSalesCollectionReportPageProps {
  storedBills: StoredBill[];
  collections: CollectionMR[];
  salespersons: Salesperson[];
  branches: BranchLocation[];
  parties: Party[];
  items: Item[];
  stockReturns?: StockReturnChallan[];
  company?: CompanyDetails;
  currentUser?: AuthUser | null;
  allBranches?: BranchLocation[];
  allStoredBills?: StoredBill[];
  allCollections?: CollectionMR[];
  onUpdateSalesperson?: (updated: Salesperson) => void;
  onSyncCloud?: (slice: Record<string, any>, immediate?: boolean) => void;
  onBack?: () => void;
  onNavigateToParty?: (partyId: string) => void;
  unreadCommCount?: number;
  onOpenNotifications?: () => void;
}

type PeriodPreset = 'this_month' | 'last_month' | 'this_year' | 'last_year' | 'all' | 'custom';
type ReportViewTab = 'admin_wise' | 'marketing_officer' | 'sales_center' | 'party_wise' | 'item_wise';

export const AdminSalesCollectionReportPage: React.FC<AdminSalesCollectionReportPageProps> = ({
  storedBills = [],
  collections = [],
  salespersons = [],
  branches = [],
  parties = [],
  items = [],
  stockReturns = [],
  company,
  currentUser,
  allBranches,
  allStoredBills,
  allCollections,
  onUpdateSalesperson,
  onSyncCloud,
  onBack,
  onNavigateToParty,
  unreadCommCount = 0,
  onOpenNotifications
}) => {
  // Local state for salespersons to enable instantaneous real-time updates when targets are set
  const [localSalespersons, setLocalSalespersons] = useState<Salesperson[]>(salespersons);
  const [isTargetModalOpen, setIsTargetModalOpen] = useState<boolean>(false);
  const [targetModalSpId, setTargetModalSpId] = useState<string | null>(null);

  React.useEffect(() => {
    setLocalSalespersons(salespersons);
  }, [salespersons]);

  const handleSaveAllTargets = (updatedList: Salesperson[]) => {
    setLocalSalespersons(updatedList);
    try {
      localStorage.setItem('polycables_salespersons', JSON.stringify(updatedList));
    } catch (err) {
      console.error('Failed to save salespersons to localStorage', err);
    }
    if (onUpdateSalesperson) {
      updatedList.forEach((sp) => onUpdateSalesperson(sp));
    }
  };

  const isSuperAdmin = isStrictSuperAdmin(currentUser);
  const isAccountsAdminUser = isAccountsAdmin(currentUser);
  const isAnyAdminUser = isAnyAdmin(currentUser) || isSuperAdmin || (currentUser?.role || '').toLowerCase().includes('admin') || isDefaultAdmin(currentUser);
  const allowedUserBranches = useMemo(
    () => filterBranchesForUser(branches, currentUser, localSalespersons),
    [branches, currentUser, localSalespersons]
  );

  // Navigation tab: Super Admin defaults to Admin-Wise; Regional Admin / others default to Sales Center
  const [activeTab, setActiveTab] = useState<ReportViewTab>(() => (isSuperAdmin ? 'admin_wise' : 'sales_center'));

  useEffect(() => {
    if (!isSuperAdmin && activeTab === 'admin_wise') {
      setActiveTab('sales_center');
    }
  }, [isSuperAdmin, activeTab]);

  // Custom Sales Center Targets (persisted to localStorage + synced to cloud)
  const [scTargets, setScTargets] = useState<Record<string, { targetSales: number; targetCollection: number }>>(() => {
    try {
      const saved = localStorage.getItem('polycables_salescenter_yearly_targets');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });
  const [isScTargetModalOpen, setIsScTargetModalOpen] = useState(false);
  const [scTargetForm, setScTargetForm] = useState<Record<string, { targetSales: number; targetCollection: number }>>({});

  const userLoginFilters = useMemo(() => {
    return getUserLoginFilters(currentUser, localSalespersons, branches);
  }, [currentUser, localSalespersons, branches]);

  const isBranchLocked = !isSuperAdmin && !isAccountsAdminUser && allowedUserBranches.length <= 1;

  const defaultBranchId = useMemo(() => {
    if (isBranchLocked) {
      if (userLoginFilters.branchId) {
        const found = branches.find((b) => b.id === userLoginFilters.branchId);
        if (found) return found.id;
      }
      if (userLoginFilters.branchName) {
        const found = branches.find((b) => b.name.toLowerCase().trim() === userLoginFilters.branchName?.toLowerCase().trim());
        if (found) return found.id;
      }
      const ub = getUserBranch(currentUser, localSalespersons, branches);
      return ub.branchId || branches[0]?.id || 'all';
    }
    return 'all';
  }, [isBranchLocked, userLoginFilters, branches, currentUser, localSalespersons]);

  // Filters
  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    if (!isSuperAdmin && !isAnyAdminUser) {
      const init = getUserLoginFilters(currentUser, salespersons, branches);
      if (init.branchId) return init.branchId;
      if (init.branchName) {
        const found = branches.find((b) => b.name.toLowerCase().trim() === init.branchName?.toLowerCase().trim());
        if (found) return found.id;
      }
      return branches[0]?.id || 'all';
    }
    return 'all';
  });

  const effectiveSelectedBranchId = isBranchLocked && defaultBranchId !== 'all' ? defaultBranchId : selectedBranchId;
  const lastReportUserKeyRef = useRef<string>('');

  // Sync selected branch if locked or when logged-in user switches
  useEffect(() => {
    const userKey = `${currentUser?.username || ''}::${currentUser?.salespersonCode || ''}::${currentUser?.branchId || ''}::${currentUser?.role || ''}`;
    const userChanged = lastReportUserKeyRef.current !== '' && lastReportUserKeyRef.current !== userKey;
    lastReportUserKeyRef.current = userKey;

    if (isBranchLocked && defaultBranchId && defaultBranchId !== 'all') {
      setSelectedBranchId(defaultBranchId);
    } else if (userChanged) {
      setSelectedBranchId(userLoginFilters.branchId || 'all');
    }
  }, [isBranchLocked, defaultBranchId, currentUser, userLoginFilters.branchId]);

  const [selectedSalespersonCode, setSelectedSalespersonCode] = useState<string>('all');
  const [selectedPartyName, setSelectedPartyName] = useState<string>('all');
  const [selectedItemId, setSelectedItemId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedAdminId, setSelectedAdminId] = useState<string>('all');
  const [expandedAdminClusterId, setExpandedAdminClusterId] = useState<string | null>(null);

  // Admin Clusters (Super Admin can see all admin groups)
  const adminClusters = useMemo(() => {
    const list = getAllAdmins(localSalespersons, branches);
    return list.filter((c) => {
      const u = (c.adminUsername || '').toLowerCase().trim();
      const n = (c.adminName || '').toLowerCase().trim();
      const id = (c.adminId || '').toLowerCase().trim();
      return u !== '111' && id !== '111' && n !== 'admin' && u !== 'admin' && id !== 'adm-111';
    });
  }, [localSalespersons, branches]);

  // Date Period State
  const now = new Date();
  const currentYyyy = now.getFullYear();
  const currentMm = String(now.getMonth() + 1).padStart(2, '0');
  const lastDayCurrentMonth = new Date(currentYyyy, now.getMonth() + 1, 0).getDate();

  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYyyy = prevMonthDate.getFullYear();
  const prevMm = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
  const lastDayPrevMonth = new Date(prevYyyy, prevMonthDate.getMonth() + 1, 0).getDate();

  const [period, setPeriod] = useState<PeriodPreset>('all');
  const [customStartDate, setCustomStartDate] = useState<string>(`01.${currentMm}.${String(currentYyyy).slice(-2)}`);
  const [customEndDate, setCustomEndDate] = useState<string>(`${String(lastDayCurrentMonth).padStart(2, '0')}.${currentMm}.${String(currentYyyy).slice(-2)}`);

  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);

  // Master Item Directory sorted Category & Serial Wise
  const sortedItemsDirectory = useMemo(() => {
    return sortItemsCategorySerialWise(items || []);
  }, [items]);

  // Helper to calculate coil equivalent for a bill line (1 Coil = 100 Meters for meter items like D-11 Duplex)
  const getLineCoilQty = (line: BillLineItem | any): number => {
    const rawQty = Number(line?.coilQty ?? line?.quantity ?? line?.qty ?? line?.totalCoils ?? 0) || 0;
    if (rawQty <= 0) return 0;
    const unitLower = (line?.unit || '').trim().toLowerCase();
    const descLower = (line?.itemDescription || line?.description || line?.itemName || line?.name || '').trim().toLowerCase();

    const matchedItem = (items || []).find(
      (it) => it.id === line?.itemId || it.code === line?.itemId || it.name.toLowerCase() === descLower
    );
    const itemUnitLower = (matchedItem?.unit || '').trim().toLowerCase();

    const isMeter =
      unitLower.includes('meter') ||
      unitLower.includes('mtr') ||
      unitLower === 'm' ||
      itemUnitLower.includes('meter') ||
      itemUnitLower.includes('mtr') ||
      itemUnitLower === 'm' ||
      descLower.includes('duplex') ||
      descLower.includes('bare (messenger)') ||
      descLower.includes('insulated wire') ||
      descLower.includes('aerial cable');

    if (isMeter) {
      // 1 Coil = 100 Meters. 2000 meters = 20 coils.
      return rawQty / 100;
    }
    return rawQty;
  };

  // Helper to calculate total coils for a bill
  const getBillTotalCoils = (b: StoredBill): number => {
    if (b.lines && b.lines.length > 0) {
      return b.lines.reduce((sum, l) => sum + getLineCoilQty(l), 0);
    }
    return b.totalCoils || 0;
  };

  // Filter Salespersons based on selected Admin and selected Branch
  // Rule: Do NOT show Admin names in Marketing Officer lists/tab. All Admin names show in Admin-Wise Statement tab.
  const branchFilteredSalespersons = useMemo(() => {
    let pool = localSalespersons.filter((sp) => {
      const roleLower = (sp.role || '').toLowerCase();
      const nameLower = (sp.name || '').toLowerCase();
      const usernameLower = (sp.username || '').toLowerCase();
      const codeLower = (sp.code || '').toLowerCase();
      const isAdminUser = Boolean(
        sp.isSuperAdmin ||
        roleLower.includes('admin') ||
        roleLower === 'agm' ||
        usernameLower.includes('admin') ||
        nameLower.includes('admin') ||
        codeLower === '111' ||
        codeLower === 'suvroadmin' ||
        codeLower.includes('adm-') ||
        (Array.isArray(sp.assignedBranchIds) && sp.assignedBranchIds.length > 0)
      );
      return !isAdminUser;
    });

    if (!isSuperAdmin && !isAccountsAdminUser) {
      pool = filterSalespersonsByBranch(pool, 'ALL', allowedUserBranches, currentUser);
    }

    if (selectedAdminId !== 'all') {
      const cluster = adminClusters.find((c) => c.adminId === selectedAdminId || c.adminUsername === selectedAdminId);
      if (cluster) {
        pool = filterSalespersonsByBranch(pool, 'ALL', cluster.branches, { role: 'Admin' } as AuthUser);
      }
    }

    if (selectedBranchId === 'all') return pool;
    const branchScope = (!isSuperAdmin && !isAccountsAdminUser) ? allowedUserBranches : branches;
    return filterSalespersonsByBranch(pool, selectedBranchId, branchScope, currentUser);
  }, [localSalespersons, branches, allowedUserBranches, selectedBranchId, selectedAdminId, adminClusters, isSuperAdmin, isAccountsAdminUser, currentUser]);

  // Filter Parties based on selected Marketing Officer, or selected Branch if Officer is all
  const filteredPartiesForDropdown = useMemo(() => {
    let list = parties;
    if (selectedSalespersonCode !== 'all') {
      const spObj = localSalespersons.find((s) => s.code === selectedSalespersonCode);
      const spNameClean = spObj ? spObj.name.toLowerCase().trim() : '';
      const spCodeClean = selectedSalespersonCode.toLowerCase().trim();

      list = list.filter((p) => {
        const pCode = (p.salesmanCode || '').toLowerCase().trim();
        const pSpName = (p.salespersonName || '').toLowerCase().trim();
        return pCode === spCodeClean || (spNameClean && pSpName.includes(spNameClean));
      });
    } else if (selectedBranchId !== 'all') {
      const branchObj = branches.find((b) => b.id === selectedBranchId);
      const targetBranchName = cleanBranchName(branchObj?.name).toLowerCase();
      const validSpCodes = new Set(branchFilteredSalespersons.map((s) => s.code.toLowerCase()));

      list = list.filter((p) => {
        if (p.branchId && p.branchId.toLowerCase() === selectedBranchId.toLowerCase()) return true;
        const pClean = cleanBranchName(p.branchName).toLowerCase();
        if (targetBranchName && (pClean.includes(targetBranchName) || targetBranchName.includes(pClean))) return true;
        if (p.salesmanCode && validSpCodes.has(p.salesmanCode.toLowerCase())) return true;
        if (targetBranchName.includes('madhupur') && (!p.branchId || !p.branchName || pClean.includes('madhupur'))) return true;
        return false;
      });
    }
    return list;
  }, [parties, selectedSalespersonCode, selectedBranchId, branches, localSalespersons, branchFilteredSalespersons]);

  // Auto-reset salesperson if not valid in current branch
  useEffect(() => {
    if (selectedSalespersonCode !== 'all') {
      const stillValid = branchFilteredSalespersons.some((sp) => sp.code === selectedSalespersonCode);
      if (!stillValid) {
        setSelectedSalespersonCode('all');
      }
    }
  }, [branchFilteredSalespersons, selectedSalespersonCode]);

  // Auto-reset party if not valid in current branch/officer selection
  useEffect(() => {
    if (selectedPartyName !== 'all') {
      const stillValid = filteredPartiesForDropdown.some(
        (p) => p.name.trim().toLowerCase() === selectedPartyName.trim().toLowerCase()
      );
      if (!stillValid) {
        setSelectedPartyName('all');
      }
    }
  }, [filteredPartiesForDropdown, selectedPartyName]);

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

  // When branch changes, reset salesperson if not in that branch
  const handleBranchChange = (branchId: string) => {
    setSelectedBranchId(branchId);
    if (branchId !== 'all') {
      const branchObj = branches.find((b) => b.id === branchId);
      const targetBranchName = cleanBranchName(branchObj?.name).toLowerCase();
      const stillValid = localSalespersons.some(
        (sp) =>
          sp.code === selectedSalespersonCode &&
          (sp.branchId?.toLowerCase() === branchId.toLowerCase() ||
            (targetBranchName && cleanBranchName(sp.branchName).toLowerCase().includes(targetBranchName)))
      );
      if (!stillValid && selectedSalespersonCode !== 'all') {
        setSelectedSalespersonCode('all');
      }
    }
  };

  // Quick Period Handler
  const handleSelectPeriodPreset = (preset: PeriodPreset) => {
    setPeriod(preset);
    const yy = String(currentYyyy).slice(-2);
    const prevYy = String(prevYyyy).slice(-2);

    if (preset === 'this_month') {
      setCustomStartDate(`01.${currentMm}.${yy}`);
      setCustomEndDate(`${String(lastDayCurrentMonth).padStart(2, '0')}.${currentMm}.${yy}`);
    } else if (preset === 'last_month') {
      setCustomStartDate(`01.${prevMm}.${prevYy}`);
      setCustomEndDate(`${String(lastDayPrevMonth).padStart(2, '0')}.${prevMm}.${prevYy}`);
    } else if (preset === 'this_year') {
      setCustomStartDate(`01.01.${yy}`);
      setCustomEndDate(`31.12.${yy}`);
    } else if (preset === 'last_year') {
      setCustomStartDate(`01.01.${prevYy}`);
      setCustomEndDate(`31.12.${prevYy}`);
    } else if (preset === 'all') {
      setCustomStartDate('01.01.2026');
      setCustomEndDate(`${String(lastDayCurrentMonth).padStart(2, '0')}.${currentMm}.${yy}`);
    }
  };

  // Synchronized date handlers: When one date changes, the other auto-adjusts
  const handleCustomStartDateChange = (newStart: string) => {
    setCustomStartDate(newStart);
    const parts = newStart.trim().split('.');
    if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length >= 2) {
      const mm = parseInt(parts[1], 10);
      const yy = parseInt(parts[2], 10);
      const fullYear = yy < 100 ? 2000 + yy : yy;
      if (!isNaN(mm) && mm >= 1 && mm <= 12) {
        const lastDay = new Date(fullYear, mm, 0).getDate();
        const sIso = parseDateToISO(newStart);
        const eIso = parseDateToISO(customEndDate);
        if (!eIso || sIso > eIso) {
          setCustomEndDate(`${String(lastDay).padStart(2, '0')}.${String(mm).padStart(2, '0')}.${String(yy).slice(-2)}`);
        }
      }
    }
  };

  const handleCustomEndDateChange = (newEnd: string) => {
    setCustomEndDate(newEnd);
    const parts = newEnd.trim().split('.');
    if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length >= 2) {
      const mm = parseInt(parts[1], 10);
      const yy = parseInt(parts[2], 10);
      if (!isNaN(mm) && mm >= 1 && mm <= 12) {
        const sIso = parseDateToISO(customStartDate);
        const eIso = parseDateToISO(newEnd);
        if (!sIso || eIso < sIso) {
          setCustomStartDate(`01.${String(mm).padStart(2, '0')}.${String(yy).slice(-2)}`);
        }
      }
    }
  };

  const handleStartDatePickerChange = (isoDate: string) => {
    if (!isoDate) return;
    const ddmmyy = formatDateDDMMYY(isoDate);
    const parts = ddmmyy.split('.');
    const mm = parseInt(parts[1], 10);
    const yy = parseInt(parts[2], 10);
    const fullYear = 2000 + yy;
    const lastDay = new Date(fullYear, mm, 0).getDate();
    setCustomStartDate(ddmmyy);
    const eIso = parseDateToISO(customEndDate);
    if (!eIso || isoDate > eIso) {
      setCustomEndDate(`${String(lastDay).padStart(2, '0')}.${String(mm).padStart(2, '0')}.${String(yy).slice(-2)}`);
    }
    setPeriod('custom');
  };

  const handleEndDatePickerChange = (isoDate: string) => {
    if (!isoDate) return;
    const ddmmyy = formatDateDDMMYY(isoDate);
    const parts = ddmmyy.split('.');
    const mm = parseInt(parts[1], 10);
    const yy = parseInt(parts[2], 10);
    setCustomEndDate(ddmmyy);
    const sIso = parseDateToISO(customStartDate);
    if (!sIso || isoDate < sIso) {
      setCustomStartDate(`01.${String(mm).padStart(2, '0')}.${String(yy).slice(-2)}`);
    }
    setPeriod('custom');
  };

  // Convert Period to ISO date boundaries for reliable comparison
  const dateRangeISO = useMemo(() => {
    if (period === 'all') return { start: null, end: null };
    const sIso = parseDateToISO(customStartDate);
    const eIso = parseDateToISO(customEndDate);
    return { start: sIso, end: eIso };
  }, [period, customStartDate, customEndDate]);

  // Helper: check if a date string falls in selected period
  const isDateInPeriod = (dateStr?: string) => {
    if (period === 'all' || !dateStr) return true;
    const iso = parseDateToISO(dateStr);
    if (!iso) return true;
    if (dateRangeISO.start && iso < dateRangeISO.start) return false;
    if (dateRangeISO.end && iso > dateRangeISO.end) return false;
    return true;
  };

  // Filter Stored Bills based on all active criteria
  const filteredBills = useMemo(() => {
    const selectedBranchObj = branches.find((b) => b.id === selectedBranchId);
    const selectedBranchName = selectedBranchObj ? selectedBranchObj.name.toLowerCase() : '';

    return (storedBills || []).filter((b) => {
      if (b.isDraft || b.header?.isDraft || b.status === 'draft') return false;

      // Date check
      if (!isDateInPeriod(b.date || b.header?.date)) return false;

      // Branch check
      if (selectedBranchId !== 'all') {
        if (!billMatchesBranch(b, selectedBranchId, branches, localSalespersons, parties)) {
          return false;
        }
      }

      // Admin cluster filter (when Super Admin filters by a specific Admin)
      if (selectedAdminId !== 'all') {
        const cluster = adminClusters.find((c) => c.adminId === selectedAdminId || c.adminUsername === selectedAdminId);
        if (cluster && !cluster.branches.some((branch) => billMatchesBranch(b, branch.id, branches, localSalespersons, parties))) {
          return false;
        }
      }

      // Salesperson check
      if (selectedSalespersonCode !== 'all') {
        const bCode = (b.header?.salesmanCode || '').toLowerCase();
        const bName = (b.header?.salespersonName || '').toLowerCase();
        const spObj = salespersons.find((s) => s.code === selectedSalespersonCode);
        const spName = spObj ? spObj.name.toLowerCase() : '';

        const matchesSp = bCode === selectedSalespersonCode.toLowerCase() || (spName && bName.includes(spName));
        if (!matchesSp) return false;
      }

      // Party check
      if (selectedPartyName !== 'all') {
        const bParty = (b.header?.partyName || '').toLowerCase();
        if (bParty !== selectedPartyName.toLowerCase()) return false;
      }

      // Item check
      if (selectedItemId !== 'all') {
        const itemObj = items.find((it) => it.id === selectedItemId);
        const itemDesc = itemObj ? itemObj.description.toLowerCase() : '';
        const hasItem = (b.lines || []).some(
          (l) => l.itemId === selectedItemId || (itemDesc && (l.itemDescription || '').toLowerCase().includes(itemDesc))
        );
        if (!hasItem) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const bNo = (b.billNo || b.header?.billNo || '').toLowerCase();
        const pName = (b.header?.partyName || '').toLowerCase();
        const spName = (b.header?.salespersonName || '').toLowerCase();
        const spCode = (b.header?.salesmanCode || '').toLowerCase();
        const bBranch = (b.header?.branchName || '').toLowerCase();

        return (
          bNo.includes(q) ||
          pName.includes(q) ||
          spName.includes(q) ||
          spCode.includes(q) ||
          bBranch.includes(q)
        );
      }

      return true;
    });
  }, [
    storedBills,
    selectedBranchId,
    selectedSalespersonCode,
    selectedPartyName,
    selectedItemId,
    searchQuery,
    branches,
    salespersons,
    items,
    period,
    dateRangeISO,
    selectedAdminId,
    adminClusters
  ]);

  // Filter Collections based on all active criteria
  const filteredCollections = useMemo(() => {
    const selectedBranchObj = branches.find((b) => b.id === selectedBranchId);
    const targetBranchName = cleanBranchName(selectedBranchObj?.name).toLowerCase();

    return (collections || []).filter((c) => {
      // Date check
      if (!isDateInPeriod(c.date)) return false;

      // Branch check
      if (selectedBranchId !== 'all') {
        if (!collectionMatchesBranch(c, selectedBranchId, branches, localSalespersons, parties)) {
          return false;
        }
      }

      // Admin cluster filter (when Super Admin filters by a specific Admin)
      if (selectedAdminId !== 'all') {
        const cluster = adminClusters.find((cl) => cl.adminId === selectedAdminId || cl.adminUsername === selectedAdminId);
        if (cluster) {
          const inCluster = cluster.branches.some((branch) =>
            collectionMatchesBranch(c, branch.id, branches, localSalespersons, parties)
          );
          if (!inCluster) return false;
        }
      }

      // Salesperson check
      if (selectedSalespersonCode !== 'all') {
        const matchedParty = parties.find((p) => p.name.trim().toLowerCase() === (c.partyName || '').trim().toLowerCase());
        const spCode = (c.salesmanCode || matchedParty?.salesmanCode || '').toLowerCase();
        const spName = (c.marketingPerson || matchedParty?.salespersonName || '').toLowerCase();
        const targetSp = salespersons.find((s) => s.code === selectedSalespersonCode);
        const targetName = targetSp ? targetSp.name.toLowerCase() : '';

        const matchesSp =
          spCode === selectedSalespersonCode.toLowerCase() ||
          (targetName && spName.includes(targetName));
        if (!matchesSp) return false;
      }

      // Party check
      if (selectedPartyName !== 'all') {
        const colParty = (c.partyName || '').toLowerCase();
        if (colParty !== selectedPartyName.toLowerCase()) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const mrNo = (c.mrNo || '').toLowerCase();
        const pName = (c.partyName || '').toLowerCase();
        const bName = (c.bankName || '').toLowerCase();
        const chq = (c.chequeNo || '').toLowerCase();
        const ent = (c.entityName || '').toLowerCase();
        const mp = (c.marketingPerson || '').toLowerCase();

        return (
          mrNo.includes(q) ||
          pName.includes(q) ||
          bName.includes(q) ||
          chq.includes(q) ||
          ent.includes(q) ||
          mp.includes(q)
        );
      }

      return true;
    });
  }, [
    collections,
    selectedBranchId,
    selectedSalespersonCode,
    selectedPartyName,
    searchQuery,
    branches,
    salespersons,
    parties,
    period,
    dateRangeISO,
    selectedAdminId,
    adminClusters
  ]);

  // Overall Aggregated Totals for KPI Cards
  const kpiMetrics = useMemo(() => {
    // Sales
    let totalNetSales = 0;
    let totalGrossSales = 0;
    let totalCoils = 0;

    filteredBills.forEach((b) => {
      totalNetSales += b.grandTotal || b.netTotal || b.totalAmount || 0;
      totalGrossSales += b.totalGross || b.subTotal || b.grandTotal || 0;
      totalCoils += getBillTotalCoils(b);
    });

    // Collections
    let totalCollections = 0;
    let cashCollection = 0;
    let bankCollection = 0;

    filteredCollections.forEach((c) => {
      const amt = c.amount || 0;
      totalCollections += amt;
      if (c.paymentType === 'cheque') {
        bankCollection += amt;
      } else {
        cashCollection += amt;
      }
    });

    // Targets (accumulate for visible salespersons in this filter)
    const isYearMode = period === 'this_year' || period === 'last_year';
    let totalTargetSales = 0;
    let totalTargetCollection = 0;

    const targetPersonnel = branchFilteredSalespersons.filter((sp) => {
      if (selectedSalespersonCode !== 'all' && sp.code !== selectedSalespersonCode) return false;
      return true;
    });

    targetPersonnel.forEach((sp) => {
      if (isYearMode) {
        totalTargetSales += sp.yearlyTargetSales || (sp.monthlyTargetSales ? sp.monthlyTargetSales * 12 : 0);
        totalTargetCollection += sp.yearlyTargetCollection || (sp.monthlyTargetCollection ? sp.monthlyTargetCollection * 12 : 0);
      } else {
        totalTargetSales += sp.monthlyTargetSales || (sp.yearlyTargetSales ? Math.round(sp.yearlyTargetSales / 12) : 0);
        totalTargetCollection += sp.monthlyTargetCollection || (sp.yearlyTargetCollection ? Math.round(sp.yearlyTargetCollection / 12) : 0);
      }
    });

    const salesAchievedPercent = totalTargetSales > 0 ? ((totalNetSales / totalTargetSales) * 100).toFixed(1) : '0.0';
    const collectionRecoveryPercent = totalTargetCollection > 0 ? ((totalCollections / totalTargetCollection) * 100).toFixed(1) : '0.0';

    return {
      totalNetSales,
      totalGrossSales,
      billsCount: filteredBills.length,
      totalCoils,
      totalCollections,
      cashCollection,
      bankCollection,
      totalTargetSales,
      totalTargetCollection,
      salesAchievedPercent,
      collectionRecoveryPercent,
      netBalance: totalNetSales - totalCollections
    };
  }, [filteredBills, filteredCollections, branchFilteredSalespersons, selectedSalespersonCode, period]);

  // Category slices removed: Dashboard uses Sales Center Wise Sales & Collections graphs below.

  // Per-Salesperson Matrix Breakdown
  const salespersonPerformanceList = useMemo(() => {
    const isYearMode = period === 'this_year' || period === 'last_year';

    return branchFilteredSalespersons.map((sp) => {
      const spCode = (sp.code || '').toLowerCase();
      const spName = sp.name.toLowerCase();

      // Find all bills for this salesperson in filtered set
      const spBills = filteredBills.filter((b) => {
        const bCode = (b.header?.salesmanCode || '').toLowerCase();
        const bName = (b.header?.salespersonName || '').toLowerCase();
        return bCode === spCode || bName.includes(spName);
      });

      const actualSales = spBills.reduce((acc, b) => acc + (b.grandTotal || b.netTotal || b.totalAmount || 0), 0);
      const coilsSold = spBills.reduce((acc, b) => acc + getBillTotalCoils(b), 0);

      // Find all collections for this salesperson in filtered set
      const spCollections = filteredCollections.filter((c) => {
        const matchedParty = parties.find((p) => p.name.trim().toLowerCase() === (c.partyName || '').trim().toLowerCase());
        const colCode = (c.salesmanCode || matchedParty?.salesmanCode || '').toLowerCase();
        const colSp = (c.marketingPerson || matchedParty?.salespersonName || '').toLowerCase();
        return colCode === spCode || colSp.includes(spName);
      });

      const actualCollection = spCollections.reduce((acc, c) => acc + (c.amount || 0), 0);

      // Targets
      const targetSales = isYearMode
        ? sp.yearlyTargetSales || (sp.monthlyTargetSales ? sp.monthlyTargetSales * 12 : 0)
        : sp.monthlyTargetSales || (sp.yearlyTargetSales ? Math.round(sp.yearlyTargetSales / 12) : 0);

      const targetCollection = isYearMode
        ? sp.yearlyTargetCollection || (sp.monthlyTargetCollection ? sp.monthlyTargetCollection * 12 : 0)
        : sp.monthlyTargetCollection || (sp.yearlyTargetCollection ? Math.round(sp.yearlyTargetCollection / 12) : 0);

      const salesAchievement = targetSales > 0 ? Math.round((actualSales / targetSales) * 100) : 0;
      const collectionAchievement = targetCollection > 0 ? Math.round((actualCollection / targetCollection) * 100) : 0;

      // Yearly stats specifically for Top Seller calculation
      const yearlyTargetSales = sp.yearlyTargetSales || (sp.monthlyTargetSales ? sp.monthlyTargetSales * 12 : 0);
      const yearlyActualSales = (storedBills || [])
        .filter((b) => {
          if (b.isDraft || b.status === 'draft') return false;
          const bCode = (b.header?.salesmanCode || '').toLowerCase();
          const bName = (b.header?.salespersonName || '').toLowerCase();
          return bCode === spCode || bName.includes(spName);
        })
        .reduce((acc, b) => acc + (b.grandTotal || b.netTotal || b.totalAmount || 0), 0);

      const yearlySalesAchievement = yearlyTargetSales > 0 ? Math.round((yearlyActualSales / yearlyTargetSales) * 100) : 0;

      return {
        id: sp.id,
        code: sp.code,
        name: sp.name,
        branchName: cleanBranchName(sp.branchName || 'Madhupur Sales Center'),
        branchId: sp.branchId || 'branch-1',
        designation: sp.designation || 'Marketing Officer',
        phone: sp.phone,
        billsCount: spBills.length,
        actualSales,
        coilsSold,
        actualCollection,
        targetSales,
        targetCollection,
        salesAchievement,
        collectionAchievement,
        balance: actualSales - actualCollection,
        // Yearly metrics for top seller ranking
        yearlyTargetSales,
        yearlyActualSales,
        yearlySalesAchievement
      };
    });
  }, [branchFilteredSalespersons, filteredBills, filteredCollections, parties, period, storedBills]);

  // Monthly & Yearly Top Sellers
  const topSellers = useMemo(() => {
    if (salespersonPerformanceList.length === 0) {
      return { monthly: null, yearly: null, top5Yearly: [], topMonthly: [] };
    }

    // Monthly Top Seller (highest salesAchievement or highest actualSales)
    const sortedMonthly = [...salespersonPerformanceList].sort((a, b) => {
      if (b.actualSales !== a.actualSales) {
        return b.actualSales - a.actualSales;
      }
      return b.salesAchievement - a.salesAchievement;
    });

    // Yearly Top Seller (highest yearlyActualSales or yearlySalesAchievement)
    const sortedYearly = [...salespersonPerformanceList].sort((a, b) => {
      if (b.yearlyActualSales !== a.yearlyActualSales) {
        return b.yearlyActualSales - a.yearlyActualSales;
      }
      return b.yearlySalesAchievement - a.yearlySalesAchievement;
    });

    return {
      monthly: sortedMonthly[0]?.actualSales > 0 ? sortedMonthly[0] : sortedMonthly[0],
      yearly: sortedYearly[0]?.yearlyActualSales > 0 ? sortedYearly[0] : sortedYearly[0],
      topMonthly: sortedMonthly.slice(0, 5),
      top5Yearly: sortedYearly.slice(0, 5)
    };
  }, [salespersonPerformanceList]);

  // Per-Sales-Center Breakdown (Strictly scoped to Admin's assigned centers)
  const branchPerformanceList = useMemo(() => {
    const salesCenterBranches = branches.filter((b) => {
      if (!b || !b.name || isUnwantedSalesCenter(b)) return false;
      const idLow = String(b.id || '').trim().toLowerCase();
      const typeLow = String(b.type || '').trim().toLowerCase();
      const nameLow = String(b.name || '').trim().toLowerCase();
      if (idLow.startsWith('sp-')) return false;
      if (['factory', 'marketing', 'officer', 'staff', 'person', 'salesperson'].includes(typeLow)) return false;
      if (nameLow.includes('billing portal') || nameLow.includes('all sales center') || nameLow === 'all' || nameLow === 'factory') return false;
      return true;
    });
    const effectiveList = salesCenterBranches.length > 0
      ? salesCenterBranches
      : [{ id: 'branch-1', name: 'Madhupur Sales Center', type: 'showroom' as const }];

    const isYearMode = period === 'this_year' || period === 'last_year';

    return effectiveList
      .map((b) => {
        const bId = b.id;
        const bCleanName = b.name.toLowerCase().includes('madhupur') ? 'Madhupur Sales Center' : cleanBranchName(b.name);
        const bNameLower = bCleanName.toLowerCase();
        const rawArea = String((b as any).area || (b as any).territory || b.location || b.district || (b as any).address || '').trim();
        const area = rawArea || bCleanName.replace(/\s*Sales Center$/i, '').trim() || bCleanName;

        const bBills = filteredBills.filter((bill) => {
          return billMatchesBranch(bill, bId, branches, localSalespersons, parties);
        });

        const totalSales = bBills.reduce((acc, bill) => acc + (bill.grandTotal || bill.netTotal || bill.totalAmount || 0), 0);
        const totalCoils = bBills.reduce((acc, bill) => acc + getBillTotalCoils(bill), 0);

        const bCollections = filteredCollections.filter((c) => {
          const colBId = c.branchId;
          const colEntity = cleanBranchName(c.entityName || c.branchName || '').toLowerCase();
          if (colBId === bId) return true;
          if (colEntity && colEntity.includes(bNameLower)) return true;
          if (bNameLower.includes('madhupur') && (colEntity.includes('madhupur') || !colBId || colEntity === 'h/o' || colEntity.includes('sales center'))) return true;
          return false;
        });

        const totalCollection = bCollections.reduce((acc, c) => acc + (c.amount || 0), 0);
        const collectionRatio = totalSales > 0 ? Math.round((totalCollection / totalSales) * 1000) / 10 : totalCollection > 0 ? 100 : 0;

        // Top marketing officer & branch officers
        const branchOfficers = salespersonPerformanceList.filter((sp) => sp.branchId === bId || (bNameLower && sp.branchName.toLowerCase().includes(bNameLower)));
        const topOfficer = branchOfficers.length > 0 ? branchOfficers.reduce((prev, curr) => (curr.actualSales > prev.actualSales ? curr : prev), branchOfficers[0]) : null;

        // Sales Center target: explicit custom target or sum of branch marketing officers
        const officersYearlyTargetSales = branchOfficers.reduce((s, sp) => s + (sp.yearlyTargetSales || 0), 0);
        const officersPeriodTargetSales = branchOfficers.reduce((s, sp) => s + (sp.targetSales || 0), 0);
        const officersPeriodTargetColl = branchOfficers.reduce((s, sp) => s + (sp.targetCollection || 0), 0);
        const customSc = scTargets[b.id];
        const targetSales = customSc?.targetSales
          ? (isYearMode ? customSc.targetSales : Math.round(customSc.targetSales / 12))
          : (isYearMode ? officersYearlyTargetSales : officersPeriodTargetSales);
        const targetCollection = customSc?.targetCollection
          ? (isYearMode ? customSc.targetCollection : Math.round(customSc.targetCollection / 12))
          : officersPeriodTargetColl;
        const salesAchievement = targetSales > 0 ? Math.round((totalSales / targetSales) * 100) : 0;
        const collectionAchievement = targetCollection > 0 ? Math.round((totalCollection / targetCollection) * 100) : 0;

        return {
          id: b.id,
          name: bCleanName,
          area,
          type: b.type,
          inChargeName: b.inChargeName || b.approverName || (topOfficer ? topOfficer.name : '-'),
          billsCount: bBills.length,
          totalSales,
          totalCoils,
          totalCollection,
          collectionRatio,
          targetSales,
          targetCollection,
          salesAchievement,
          collectionAchievement,
          balance: totalSales - totalCollection,
          topOfficer: topOfficer ? `${topOfficer.name} (৳${topOfficer.actualSales.toLocaleString('en-IN')})` : '-'
        };
      })
      .sort((a, b) => b.totalSales - a.totalSales);
  }, [branches, filteredBills, filteredCollections, salespersonPerformanceList, localSalespersons, parties, scTargets, period]);

  // All Sales Centers Breakdown for the two Round Shape Graphs (shows all sales centers + area)
  const { salesCenterSalesSlices, salesCenterCollectionSlices, scGraphGrandSales, scGraphGrandCollections } = useMemo(() => {
    const palette = [
      { color: '#cfd9f5', hoverColor: '#dde5fc' },
      { color: '#5c72bd', hoverColor: '#6d83cd' },
      { color: '#788dd1', hoverColor: '#8b9fe0' },
      { color: '#92a4df', hoverColor: '#a4b5eb' },
      { color: '#aab9ea', hoverColor: '#bcc9f3' },
      { color: '#475ca3', hoverColor: '#576db5' },
      { color: '#687dc4', hoverColor: '#7b90d6' },
      { color: '#becaf1', hoverColor: '#ced9f8' }
    ];
    const icons: Array<InfographicSliceData['icon']> = ['globe', 'trophy', 'target', 'lightbulb', 'gear'];

    const sourceBranches = (allBranches && allBranches.length > 0 ? allBranches : branches).filter((b) => {
      if (!b || !b.name || isUnwantedSalesCenter(b)) return false;
      const idLow = String(b.id || '').trim().toLowerCase();
      const typeLow = String(b.type || '').trim().toLowerCase();
      const nameLow = String(b.name || '').trim().toLowerCase();
      if (idLow.startsWith('sp-')) return false;
      if (['factory', 'marketing', 'officer', 'staff', 'person', 'salesperson'].includes(typeLow)) return false;
      if (nameLow.includes('billing portal') || nameLow.includes('all sales center') || nameLow === 'all' || nameLow === 'factory') return false;
      return true;
    });
    const sourceBills = (allStoredBills && allStoredBills.length > 0 ? allStoredBills : storedBills).filter(
      (b) => !(b.isDraft || b.header?.isDraft || b.status === 'draft') && isDateInPeriod(b.date || b.header?.date)
    );
    const sourceColls = (allCollections && allCollections.length > 0 ? allCollections : collections).filter(
      (c) => isDateInPeriod(c.date)
    );

    const normalizedList = (sourceBranches.length > 0 ? sourceBranches : [{ id: 'branch-1', name: 'Madhupur Sales Center', type: 'showroom' as const }]).map((b) => {
      const bId = b.id;
      const bCleanName = b.name.toLowerCase().includes('madhupur') ? 'Madhupur Sales Center' : cleanBranchName(b.name);
      const bNameLower = bCleanName.toLowerCase();
      const rawArea = String((b as any).area || (b as any).territory || (b as any).location || (b as any).district || (b as any).address || '').trim();
      const area = rawArea || bCleanName.replace(/\s*Sales Center$/i, '').trim() || bCleanName;

      const bBills = sourceBills.filter((bill) => billMatchesBranch(bill, bId, sourceBranches, localSalespersons, parties));
      const totalSales = bBills.reduce((acc, bill) => acc + (bill.grandTotal || bill.netTotal || bill.totalAmount || 0), 0);

      const bCols = sourceColls.filter((c) => {
        const colBId = c.branchId;
        const colEntity = cleanBranchName(c.entityName || c.branchName || '').toLowerCase();
        if (colBId === bId) return true;
        if (colEntity && colEntity.includes(bNameLower)) return true;
        if (bNameLower.includes('madhupur') && (colEntity.includes('madhupur') || !colBId || colEntity === 'h/o' || colEntity.includes('sales center'))) return true;
        return false;
      });
      const totalCollection = bCols.reduce((acc, c) => acc + (c.amount || 0), 0);

      return {
        id: b.id,
        name: bCleanName,
        area,
        totalSales: Number(totalSales) || 0,
        totalCollection: Number(totalCollection) || 0
      };
    });

    const grandSales = normalizedList.reduce<number>((sum, b) => sum + b.totalSales, 0);
    const grandCollections = normalizedList.reduce<number>((sum, b) => sum + b.totalCollection, 0);

    const buildSlices = (mode: 'sales' | 'collection'): InfographicSliceData[] => {
      const sorted = [...normalizedList].sort((a, b) =>
        mode === 'sales' ? b.totalSales - a.totalSales : b.totalCollection - a.totalCollection
      );
      const denom = mode === 'sales' ? grandSales : grandCollections;

      const steppedRadii = [200, 170, 188, 168, 156, 178, 162, 152];
      return sorted.map((b, idx) => {
        const val = mode === 'sales' ? b.totalSales : b.totalCollection;
        const pct = denom > 0
          ? Math.max(val > 0 ? 1 : 0, Math.round((val / denom) * 100))
          : Math.round(100 / sorted.length);
        const pal = palette[idx % palette.length];
        const radius = steppedRadii[idx % steppedRadii.length];

        return {
          id: `${mode}-${b.id}-${idx}`,
          label: b.name,
          percentage: pct,
          amount: val,
          color: pal.color,
          hoverColor: pal.hoverColor,
          outerRadius: radius,
          icon: icons[idx % icons.length],
          description: `Area: ${b.area}`
        };
      });
    };

    return {
      salesCenterSalesSlices: buildSlices('sales'),
      salesCenterCollectionSlices: buildSlices('collection'),
      scGraphGrandSales: grandSales,
      scGraphGrandCollections: grandCollections
    };
  }, [allBranches, allStoredBills, allCollections, branches, storedBills, collections, localSalespersons, parties, period, dateRangeISO]);

  // Admin-Wise Multi-Admin Statement Breakdown
  const adminClusterPerformanceList = useMemo(() => {
    const isYearMode = period === 'this_year' || period === 'last_year';

    // If Regional Admin is logged in, show their assigned cluster
    let targetClusters = adminClusters;
    if (!isSuperAdmin) {
      const uId = (currentUser?.id || '').toLowerCase();
      const uName = (currentUser?.username || '').toLowerCase();
      const cName = (currentUser?.name || '').toLowerCase();
      const myCluster = adminClusters.find(
        (c) =>
          c.adminId.toLowerCase() === uId ||
          c.adminUsername.toLowerCase() === uName ||
          (cName.length >= 4 && c.adminName.toLowerCase().includes(cName)) ||
          c.branches.some((b) => b.id === currentUser?.branchId)
      );
      if (myCluster) {
        targetClusters = [myCluster];
      }
    } else if (selectedAdminId !== 'all') {
      const chosen = adminClusters.filter((c) => c.adminId === selectedAdminId || c.adminUsername === selectedAdminId);
      if (chosen.length > 0) {
        targetClusters = chosen;
      }
    }

    return targetClusters.map((cluster) => {
      const clusterBranchIds = new Set(cluster.branches.map((b) => b.id));
      const clusterBranchNames = new Set(cluster.branches.map((b) => cleanBranchName(b.name).toLowerCase()));

      // Marketing personnel stationed under this admin's sales centers
      const clusterOfficers = localSalespersons.filter((sp) => {
        if (sp.role?.toLowerCase() === 'admin' || sp.isSuperAdmin) return false;
        const spBId = (sp.branchId || '').toLowerCase().trim();
        const spClean = cleanBranchName(sp.branchName || '').toLowerCase().trim();
        const spCode = (sp.code || '').trim();

        // 1. Direct branch ID match
        if (spBId && clusterBranchIds.has(spBId)) return true;

        // 2. Direct branch Name match
        if (spClean && Array.from(clusterBranchNames).some((bn) => spClean === bn || spClean.includes(bn) || bn.includes(spClean))) return true;

        // 3. Multi-branch assignment match
        if (sp.assignedBranchIds && sp.assignedBranchIds.some((id) => clusterBranchIds.has(id.toLowerCase().trim()))) return true;

        return false;
      });

      // Detailed sub-breakdown for each of this Admin's assigned sales centers
      const centerBreakdowns = cluster.branches.map((b) => {
        const bCleanName = cleanBranchName(b.name);
        const bNameLower = bCleanName.toLowerCase();
        
        // Accurate bills for this specific sales center
        const bBills = (storedBills || []).filter((bill) => {
          if (bill.isDraft || bill.header?.isDraft || bill.status === 'draft') return false;
          if (!isDateInPeriod(bill.date || bill.header?.date)) return false;
          return billMatchesBranch(bill, b.id, branches, localSalespersons, parties);
        });

        const bSales = bBills.reduce((acc, bill) => acc + (bill.grandTotal || bill.netTotal || bill.totalAmount || 0), 0);
        const bGross = bBills.reduce((acc, bill) => acc + (bill.totalGross || bill.subTotal || bill.grandTotal || 0), 0);
        const bCoils = bBills.reduce((acc, bill) => acc + getBillTotalCoils(bill), 0);

        // Accurate collections for this specific sales center
        const bCols = (collections || []).filter((c) => {
          if (!isDateInPeriod(c.date)) return false;
          return collectionMatchesBranch(c, b.id, branches, localSalespersons, parties);
        });

        const bColl = bCols.reduce((acc, c) => acc + (c.amount || 0), 0);
        const bCash = bCols.filter((c) => c.paymentType === 'cash' || !c.paymentType).reduce((acc, c) => acc + (c.amount || 0), 0);
        const bBank = bCols.filter((c) => c.paymentType === 'cheque').reduce((acc, c) => acc + (c.amount || 0), 0);
        const bRatio = bSales > 0 ? Math.round((bColl / bSales) * 1000) / 10 : (bColl > 0 ? 100 : 0);

        // Targets for this specific sales center
        const branchOfficers = localSalespersons.filter(
          (sp) =>
            (sp.branchId && sp.branchId.toLowerCase() === b.id.toLowerCase()) ||
            (sp.assignedBranchIds && sp.assignedBranchIds.some((id) => id.toLowerCase() === b.id.toLowerCase())) ||
            cleanBranchName(sp.branchName || '').toLowerCase() === bNameLower ||
            (sp.branchName && cleanBranchName(sp.branchName).toLowerCase().includes(bNameLower))
        );
        let centerTargetSales = 0;
        let centerTargetColl = 0;
        branchOfficers.forEach((sp) => {
          if (isYearMode) {
            centerTargetSales += sp.yearlyTargetSales || (sp.monthlyTargetSales ? sp.monthlyTargetSales * 12 : 0);
            centerTargetColl += sp.yearlyTargetCollection || (sp.monthlyTargetCollection ? sp.monthlyTargetCollection * 12 : 0);
          } else {
            centerTargetSales += sp.monthlyTargetSales || (sp.yearlyTargetSales ? Math.round(sp.yearlyTargetSales / 12) : 0);
            centerTargetColl += sp.monthlyTargetCollection || (sp.yearlyTargetCollection ? Math.round(sp.yearlyTargetCollection / 12) : 0);
          }
        });

        // If no officer target set, check if target is defined on branch object
        if (centerTargetSales === 0) {
          centerTargetSales = (b as any).targetSales || (b as any).monthlyTargetSales || 0;
          centerTargetColl = (b as any).targetCollection || (b as any).monthlyTargetCollection || 0;
        }

        // Top performing officer in this sales center
        let topOfficerName = '-';
        if (bBills.length > 0) {
          const spSalesMap = new Map<string, number>();
          bBills.forEach((bill) => {
            const spCode = (bill.header?.salesmanCode || '').trim();
            const spName = (bill.header?.salespersonName || '').trim();
            const key = spName || spCode;
            if (key) {
              spSalesMap.set(key, (spSalesMap.get(key) || 0) + (bill.grandTotal || bill.netTotal || 0));
            }
          });
          let maxSale = 0;
          spSalesMap.forEach((sale, spKey) => {
            if (sale > maxSale) {
              maxSale = sale;
              topOfficerName = spKey;
            }
          });
        }

        return {
          id: b.id,
          name: bCleanName,
          inCharge: b.inChargeName || b.approverName || 'In-Charge',
          billsCount: bBills.length,
          coils: bCoils,
          sales: bSales,
          gross: bGross,
          collection: bColl,
          cash: bCash,
          bank: bBank,
          ratio: bRatio,
          balance: bSales - bColl,
          targetSales: centerTargetSales,
          targetCollection: centerTargetColl,
          salesAchievement: centerTargetSales > 0 ? Math.round((bSales / centerTargetSales) * 100) : 0,
          topOfficer: topOfficerName
        };
      });

      // Cluster totals strictly calculated as the exact sum of its assigned sales centers
      const actualSales = centerBreakdowns.reduce((acc, cb) => acc + cb.sales, 0);
      const grossSales = centerBreakdowns.reduce((acc, cb) => acc + cb.gross, 0);
      const coilsSold = centerBreakdowns.reduce((acc, cb) => acc + cb.coils, 0);
      const billsCount = centerBreakdowns.reduce((acc, cb) => acc + cb.billsCount, 0);
      const actualCollection = centerBreakdowns.reduce((acc, cb) => acc + cb.collection, 0);
      const cashCollection = centerBreakdowns.reduce((acc, cb) => acc + cb.cash, 0);
      const bankCollection = centerBreakdowns.reduce((acc, cb) => acc + cb.bank, 0);
      const targetSales = centerBreakdowns.reduce((acc, cb) => acc + cb.targetSales, 0);
      const targetCollection = centerBreakdowns.reduce((acc, cb) => acc + cb.targetCollection, 0);

      const salesAchievement = targetSales > 0 ? Math.round((actualSales / targetSales) * 100) : 0;
      const collectionAchievement = targetCollection > 0 ? Math.round((actualCollection / targetCollection) * 100) : 0;
      const collectionRatio = actualSales > 0 ? Math.round((actualCollection / actualSales) * 1000) / 10 : (actualCollection > 0 ? 100 : 0);

      return {
        id: cluster.adminId,
        adminId: cluster.adminId,
        adminName: cluster.adminName,
        adminUsername: cluster.adminUsername,
        adminZone: cluster.adminZone || 'Territory Group',
        branchCount: cluster.branches.length,
        branches: cluster.branches,
        branchNames: cluster.branches.map((b) => cleanBranchName(b.name)),
        officersCount: clusterOfficers.length,
        billsCount,
        coilsSold,
        actualSales,
        grossSales,
        actualCollection,
        cashCollection,
        bankCollection,
        targetSales,
        targetCollection,
        salesAchievement,
        collectionAchievement,
        collectionRatio,
        balance: actualSales - actualCollection,
        centerBreakdowns
      };
    });
  }, [adminClusters, storedBills, collections, branches, localSalespersons, parties, period, isSuperAdmin, selectedAdminId, currentUser]);

  // Infographic Pie/Donut Slices — Admin Wise (Sales & Collections for Super Admin)
  const { adminWiseSalesSlices, adminWiseCollectionSlices } = useMemo(() => {
    // 3D Cool Periwinkle / Slate-Indigo Palette matching chart.jpg
    const palette = [
      { color: '#cfd9f5', hoverColor: '#dde5fc' }, // Foreground Exploded Ice-Periwinkle
      { color: '#5c72bd', hoverColor: '#6d83cd' }, // Deep Royal Periwinkle-Indigo
      { color: '#788dd1', hoverColor: '#8b9fe0' }, // Mid Royal Slate Blue
      { color: '#92a4df', hoverColor: '#a4b5eb' }, // Soft Periwinkle Blue
      { color: '#aab9ea', hoverColor: '#bcc9f3' }, // Light Lavender Slate
      { color: '#475ca3', hoverColor: '#576db5' }, // Rich Navy-Indigo
      { color: '#687dc4', hoverColor: '#7b90d6' }, // Cool Cobalt Blue
      { color: '#becaf1', hoverColor: '#ced9f8' }  // Pale Frost Periwinkle
    ];
    const icons: Array<InfographicSliceData['icon']> = ['globe', 'trophy', 'target', 'lightbulb', 'gear'];

    const rawList = adminClusterPerformanceList.length > 0
      ? adminClusterPerformanceList
      : [{ id: 'adm-default', adminName: 'All Admins', actualSales: 0, actualCollection: 0, branchCount: branches.length }];

    const list = rawList.map((a) => ({
      id: a.id,
      adminName: a.adminName,
      actualSales: Number(a.actualSales) || 0,
      actualCollection: Number(a.actualCollection) || 0,
      branchCount: Number(a.branchCount) || 0
    }));

    const grandSales = list.reduce((sum, a) => sum + a.actualSales, 0);
    const grandCollections = list.reduce((sum, a) => sum + a.actualCollection, 0);

    const buildSlices = (mode: 'sales' | 'collection'): InfographicSliceData[] => {
      const sorted = [...list].sort((a, b) =>
        mode === 'sales'
          ? b.actualSales - a.actualSales
          : b.actualCollection - a.actualCollection
      );
      const denom = mode === 'sales' ? grandSales : grandCollections;

      const steppedRadii = [200, 170, 188, 168, 156, 178, 162, 152];
      return sorted.map((adm, idx) => {
        const val = mode === 'sales' ? adm.actualSales : adm.actualCollection;
        const pct = denom > 0
          ? Math.max(val > 0 ? 1 : 0, Math.round((val / denom) * 100))
          : Math.round(100 / sorted.length);
        const pal = palette[idx % palette.length];
        const radius = steppedRadii[idx % steppedRadii.length];

        return {
          id: `adm-${mode}-${adm.id}-${idx}`,
          label: adm.adminName,
          percentage: pct,
          amount: val,
          color: pal.color,
          hoverColor: pal.hoverColor,
          outerRadius: radius,
          icon: icons[idx % icons.length],
          description: `${adm.adminName} (${adm.branchCount || 0} Centers)`
        };
      });
    };

    return {
      adminWiseSalesSlices: buildSlices('sales'),
      adminWiseCollectionSlices: buildSlices('collection')
    };
  }, [adminClusterPerformanceList, branches.length]);

  // Direct Aggregated Totals across all Admin Clusters for the Admin-Wise Statement
  const adminWiseTotals = useMemo(() => {
    let bills = 0;
    let coils = 0;
    let targetSales = 0;
    let actualSales = 0;
    let targetColl = 0;
    let actualColl = 0;
    let balance = 0;

    adminClusterPerformanceList.forEach((row) => {
      bills += row.billsCount;
      coils += row.coilsSold;
      targetSales += row.targetSales;
      actualSales += row.actualSales;
      targetColl += row.targetCollection;
      actualColl += row.actualCollection;
      balance += row.balance;
    });

    const salesAchieved = targetSales > 0 ? ((actualSales / targetSales) * 100).toFixed(1) : '0.0';
    const collRecovery = targetColl > 0 ? ((actualColl / targetColl) * 100).toFixed(1) : '0.0';

    return {
      bills,
      coils,
      targetSales,
      actualSales,
      targetColl,
      actualColl,
      balance,
      salesAchieved,
      collRecovery
    };
  }, [adminClusterPerformanceList]);

  // Party-Wise Breakdown with Sales, Collection, Collection Ratio %, Balance, Marketing Officer & Sales Center
  const partyWiseList = useMemo(() => {
    const partyMap = new Map<
      string,
      {
        partyId?: string;
        partyName: string;
        salespersonName: string;
        branchName: string;
        billsCount: number;
        mrCount: number;
        sales: number;
        coils: number;
        collection: number;
      }
    >();

    const resolvePartyMeta = (rawName: string, hintSpCode?: string, hintSpName?: string, hintBranch?: string) => {
      const lower = rawName.trim().toLowerCase();
      const matchedParty = (parties || []).find((p) => (p.name || '').trim().toLowerCase() === lower);
      const spCode = hintSpCode || matchedParty?.salesmanCode || '';
      const matchedSp = localSalespersons.find((s) => s.code.toLowerCase() === spCode.toLowerCase());
      const spName = hintSpName || matchedParty?.salespersonName || matchedSp?.name || '-';
      const brName = cleanBranchName(hintBranch || matchedParty?.branchName || matchedSp?.branchName || 'Madhupur Sales Center');
      return {
        partyId: matchedParty?.id,
        salespersonName: spName,
        branchName: brName
      };
    };

    filteredBills.forEach((b) => {
      const pName = (b.header?.partyName || 'Cash Customer').trim();
      const meta = resolvePartyMeta(pName, b.header?.salesmanCode, b.header?.salespersonName, b.header?.branchName);
      const existing = partyMap.get(pName) || {
        partyId: meta.partyId,
        partyName: pName,
        salespersonName: meta.salespersonName,
        branchName: meta.branchName,
        billsCount: 0,
        mrCount: 0,
        sales: 0,
        coils: 0,
        collection: 0
      };
      if ((!existing.salespersonName || existing.salespersonName === '-') && meta.salespersonName !== '-') {
        existing.salespersonName = meta.salespersonName;
      }
      existing.billsCount += 1;
      existing.sales += b.grandTotal || b.netTotal || b.totalAmount || 0;
      existing.coils += getBillTotalCoils(b);
      partyMap.set(pName, existing);
    });

    filteredCollections.forEach((c) => {
      const pName = (c.partyName || 'Cash Collection').trim();
      const meta = resolvePartyMeta(pName, c.salesmanCode, c.marketingPerson, c.branchName || c.entityName);
      const existing = partyMap.get(pName) || {
        partyId: meta.partyId,
        partyName: pName,
        salespersonName: meta.salespersonName,
        branchName: meta.branchName,
        billsCount: 0,
        mrCount: 0,
        sales: 0,
        coils: 0,
        collection: 0
      };
      if ((!existing.salespersonName || existing.salespersonName === '-') && meta.salespersonName !== '-') {
        existing.salespersonName = meta.salespersonName;
      }
      existing.mrCount += 1;
      existing.collection += c.amount || 0;
      partyMap.set(pName, existing);
    });

    return Array.from(partyMap.values())
      .map((item) => {
        const collectionRatio =
          item.sales > 0
            ? Math.round((item.collection / item.sales) * 1000) / 10
            : item.collection > 0
            ? 100
            : 0;
        const balance = item.sales - item.collection;
        return {
          ...item,
          collectionRatio,
          balance
        };
      })
      .sort((a, b) => {
        if (b.sales !== a.sales) return b.sales - a.sales;
        return b.collection - a.collection;
      });
  }, [filteredBills, filteredCollections, parties, localSalespersons]);

  // Party-Wise Sorting State
  type PartySortKey = 'sl' | 'partyName' | 'salespersonName' | 'branchName' | 'billsCount' | 'coils' | 'sales' | 'collection' | 'collectionRatio' | 'balance';
  type SortDirection = 'asc' | 'desc';

  const [partySortKey, setPartySortKey] = useState<PartySortKey>('sales');
  const [partySortDir, setPartySortDir] = useState<SortDirection>('desc');

  const handlePartySort = (key: PartySortKey) => {
    if (partySortKey === key) {
      setPartySortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setPartySortKey(key);
      setPartySortDir('desc');
    }
  };

  const renderPartySortIndicator = (key: PartySortKey) => {
    const isSelected = partySortKey === key;
    return (
      <span className="inline-flex items-center gap-0.5 ml-1.5 select-none text-[9px] font-bold px-1 py-0.5 rounded bg-slate-200/90 border border-slate-300">
        <span className={isSelected && partySortDir === 'asc' ? 'text-blue-700 font-black' : 'text-slate-400 opacity-35'}>▲</span>
        <span className={isSelected && partySortDir === 'desc' ? 'text-blue-700 font-black' : 'text-slate-400 opacity-35'}>▼</span>
      </span>
    );
  };

  const sortedPartyWiseList = useMemo(() => {
    const list = [...partyWiseList];
    list.sort((a, b) => {
      let valA: number | string = 0;
      let valB: number | string = 0;

      switch (partySortKey) {
        case 'sl':
          valA = partyWiseList.indexOf(a);
          valB = partyWiseList.indexOf(b);
          break;
        case 'partyName':
          valA = a.partyName.toLowerCase();
          valB = b.partyName.toLowerCase();
          break;
        case 'salespersonName':
          valA = (a.salespersonName || '').toLowerCase();
          valB = (b.salespersonName || '').toLowerCase();
          break;
        case 'branchName':
          valA = (a.branchName || '').toLowerCase();
          valB = (b.branchName || '').toLowerCase();
          break;
        case 'billsCount':
          valA = a.billsCount;
          valB = b.billsCount;
          break;
        case 'coils':
          valA = a.coils;
          valB = b.coils;
          break;
        case 'sales':
          valA = a.sales;
          valB = b.sales;
          break;
        case 'collection':
          valA = a.collection;
          valB = b.collection;
          break;
        case 'collectionRatio':
          valA = a.collectionRatio;
          valB = b.collectionRatio;
          break;
        case 'balance':
          valA = a.balance;
          valB = b.balance;
          break;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return partySortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return partySortDir === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });
    return list;
  }, [partyWiseList, partySortKey, partySortDir]);

  // Top Rankings Summary: 1. Top Marketing Person, 2. Top Sales Center, 3. Top Party
  const topLeaderboards = useMemo(() => {
    const sortedOfficers = [...salespersonPerformanceList].sort((a, b) => {
      if (b.actualSales !== a.actualSales) return b.actualSales - a.actualSales;
      return b.actualCollection - a.actualCollection;
    });
    const sortedCenters = [...branchPerformanceList].sort((a, b) => {
      if (b.totalSales !== a.totalSales) return b.totalSales - a.totalSales;
      return b.totalCollection - a.totalCollection;
    });
    const sortedParties = [...partyWiseList].sort((a, b) => {
      if (b.sales !== a.sales) return b.sales - a.sales;
      return b.collection - a.collection;
    });

    return {
      topOfficer: sortedOfficers[0] || null,
      topOfficersList: sortedOfficers.slice(0, 5),
      topCenter: sortedCenters[0] || null,
      topCentersList: sortedCenters.slice(0, 5),
      topParty: sortedParties[0] || null,
      topPartiesList: sortedParties.slice(0, 5)
    };
  }, [salespersonPerformanceList, branchPerformanceList, partyWiseList]);

  // Item-Wise Sales Breakdown (ordered strictly by Master Item Directory sequence)
  const itemWiseList = useMemo(() => {
    const itemMap = new Map<
      string,
      {
        itemId: string;
        directorySerial: number;
        code: string;
        description: string;
        category: string;
        unit: string;
        rawMeterQty: number;
        coilQty: number;
        revenue: number;
      }
    >();

    // Helper to resolve an incoming bill line to its canonical Master Item in items directory
    const resolveLineToCanonicalItem = (line: any): { item?: Item; serial: number; displayName: string } => {
      const rawDesc = (line?.itemDescription || line?.description || line?.itemName || line?.name || '').trim();
      const lineItemId = (line?.itemId || '').trim().toLowerCase();
      const lineItemCode = (line?.itemCode || '').trim().toLowerCase();
      const cleanDesc = rawDesc.toLowerCase().replace(/[^a-z0-9]/g, '');

      // 1. By explicit itemId
      if (lineItemId) {
        const idx = sortedItemsDirectory.findIndex(it => (it.id && it.id.toLowerCase() === lineItemId) || (it.code && it.code.toLowerCase() === lineItemId));
        if (idx !== -1) {
          return { item: sortedItemsDirectory[idx], serial: idx + 1, displayName: sortedItemsDirectory[idx].name };
        }
      }

      // 2. By explicit itemCode
      if (lineItemCode) {
        const idx = sortedItemsDirectory.findIndex(it => it.code && it.code.toLowerCase() === lineItemCode);
        if (idx !== -1) {
          return { item: sortedItemsDirectory[idx], serial: idx + 1, displayName: sortedItemsDirectory[idx].name };
        }
      }

      // 3. By exact or normalized name match
      if (cleanDesc) {
        const exactIdx = sortedItemsDirectory.findIndex(it => it.name.trim().toLowerCase() === rawDesc.toLowerCase());
        if (exactIdx !== -1) {
          return { item: sortedItemsDirectory[exactIdx], serial: exactIdx + 1, displayName: sortedItemsDirectory[exactIdx].name };
        }

        const cleanIdx = sortedItemsDirectory.findIndex(it => it.name.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanDesc);
        if (cleanIdx !== -1) {
          return { item: sortedItemsDirectory[cleanIdx], serial: cleanIdx + 1, displayName: sortedItemsDirectory[cleanIdx].name };
        }

        // Substring / partial match
        const subIdx = sortedItemsDirectory.findIndex(it => {
          const itClean = it.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          return itClean && (itClean.includes(cleanDesc) || cleanDesc.includes(itClean));
        });
        if (subIdx !== -1) {
          return { item: sortedItemsDirectory[subIdx], serial: subIdx + 1, displayName: sortedItemsDirectory[subIdx].name };
        }
      }

      return { item: undefined, serial: 9999, displayName: rawDesc || 'Standard Wire' };
    };

    filteredBills.forEach((b) => {
      const billLines = Array.isArray(b.lines) ? b.lines : Array.isArray((b as any).items) ? (b as any).items : [];
      billLines.forEach((line: any) => {
        const rawQty = Number(line?.coilQty ?? line?.quantity ?? line?.qty ?? line?.totalCoils ?? 0) || 0;
        const { item: canonicalItem, serial: directorySerial, displayName } = resolveLineToCanonicalItem(line);
        const key = canonicalItem?.id || (canonicalItem ? canonicalItem.name : (line.itemId || displayName));

        const coils = getLineCoilQty(line);
        const isMeter = coils !== rawQty;

        const resolvedCat = (canonicalItem?.category || line?.category || '').trim();
        const safeCategory = resolvedCat && !/^general(?:\s+(?:wire|cables?))?$/i.test(resolvedCat)
          ? resolvedCat
          : categorizeCableItem(canonicalItem?.name || displayName, canonicalItem?.sizeSpec || '');

        const existing = itemMap.get(key) || {
          itemId: key,
          directorySerial,
          code: canonicalItem?.code || line?.itemCode || '',
          description: canonicalItem?.name || displayName,
          category: safeCategory,
          unit: canonicalItem?.unit || line.unit || (isMeter ? 'Meter' : 'Coils'),
          rawMeterQty: 0,
          coilQty: 0,
          revenue: 0
        };

        if (canonicalItem && existing.description !== canonicalItem.name) {
          existing.description = canonicalItem.name;
        }

        if (isMeter) {
          existing.rawMeterQty += rawQty;
        }
        existing.coilQty += coils;
        const lineRate = Number(line?.rate ?? line?.price ?? line?.unitPrice ?? 0) || 0;
        const lineAmount = Number(line?.amount ?? line?.totalAmount ?? (rawQty * lineRate)) || 0;
        existing.revenue += lineAmount;
        itemMap.set(key, existing);
      });
    });

    // Sort strictly by Item Directory Serial
    return Array.from(itemMap.values()).sort((a, b) => {
      if (a.directorySerial !== b.directorySerial) {
        return a.directorySerial - b.directorySerial;
      }
      return a.description.localeCompare(b.description, undefined, { numeric: true });
    });
  }, [filteredBills, sortedItemsDirectory, items]);

  // Reset all filters
  const handleResetFilters = () => {
    setSelectedBranchId(isBranchLocked && defaultBranchId !== 'all' ? defaultBranchId : 'all');
    setSelectedAdminId('all');
    setSelectedSalespersonCode(userLoginFilters.salesmanCode || 'all');
    setSelectedPartyName('all');
    setSelectedItemId('all');
    setSearchQuery('');
    handleSelectPeriodPreset('this_month');
  };

  // Report title generator for print preview & document
  const getPrintReportTitle = (tab: ReportViewTab) => {
    switch (tab) {
      case 'admin_wise':
        return 'ADMIN-WISE SALES & COLLECTION STATEMENT (SUPER ADMIN)';
      case 'marketing_officer':
        return 'MARKETING OFFICER SALES & COLLECTION STATEMENT';
      case 'sales_center':
        return 'ALL SALES CENTERS PERFORMANCE REPORT';
      case 'party_wise':
        return 'PARTY-WISE SALES & COLLECTION STATEMENT';
      case 'item_wise':
        return 'ITEM-WISE SALES BREAKDOWN STATEMENT';
      default:
        return 'SALES & COLLECTION REPORT';
    }
  };

  // Print system handler for every option
  const handlePrintOption = (tabToPrint?: ReportViewTab) => {
    if (tabToPrint && tabToPrint !== activeTab) {
      setActiveTab(tabToPrint);
      setTimeout(() => {
        window.print();
      }, 150);
    } else {
      window.print();
    }
  };

  // Export to Excel across all tabs
  const handleExportExcel = () => {
    if (activeTab === 'admin_wise') {
      const rows = adminClusterPerformanceList.map((r, idx) => ({
        'SL': idx + 1,
        'Admin Name': r.adminName,
        'Zone / Territory': r.adminZone,
        'Admin Username': r.adminUsername,
        'Assigned Sales Centers Count': r.branchCount,
        'Sales Centers': r.branchNames.join(', '),
        'Bills Count': r.billsCount,
        'Total Coils Sold': r.coilsSold,
        'Target Sales (৳)': r.targetSales,
        'Actual Sales (৳)': r.actualSales,
        'Sales Achieved (%)': `${r.salesAchievement}%`,
        'Target Collection (৳)': r.targetCollection,
        'Actual Collection (৳)': r.actualCollection,
        'Collection Recovery (%)': `${r.collectionAchievement}%`,
        'Collection Ratio (%)': `${r.collectionRatio.toFixed(1)}%`,
        'Net Due / Balance (৳)': r.balance
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Admin-Wise Summary');
      XLSX.writeFile(wb, `Admin_Wise_Sales_Collection_${Date.now()}.xlsx`);
      return;
    }

    if (activeTab === 'item_wise') {
      const rows = itemWiseList.map((r, idx) => ({
        'SL': idx + 1,
        'Item Code': r.code,
        'Item Name & Description': r.description,
        'Category': r.category,
        'Coils Sold': r.coilQty,
        'Meters Sold': r.rawMeterQty > 0 ? r.rawMeterQty : '',
        'Total Revenue (৳)': r.revenue,
        'Contribution (%)': `${kpiMetrics.totalNetSales > 0 ? ((r.revenue / kpiMetrics.totalNetSales) * 100).toFixed(1) : 0}%`
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Item-Wise Sales');
      XLSX.writeFile(wb, `Item_Wise_Sales_Report_${Date.now()}.xlsx`);
      return;
    }

    if (activeTab === 'party_wise') {
      const rows = sortedPartyWiseList.map((r, idx) => ({
        'SL': idx + 1,
        'Party / Customer Name': getPartyDisplayWithAddress(r.partyName),
        'Marketing Person': r.salespersonName || '-',
        'Sales Center': r.branchName || '-',
        'Bills Count': r.billsCount,
        'MR Count': r.mrCount,
        'Coils Sold': r.coils,
        'Total Sale (৳)': r.sales,
        'Total Collection (৳)': r.collection,
        'Collection Ratio (%)': `${r.collectionRatio.toFixed(1)}%`,
        'Outstanding Balance (৳)': r.balance
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Party-Wise Summary');
      XLSX.writeFile(wb, `Party_Wise_Summary_${Date.now()}.xlsx`);
      return;
    }

    if (activeTab === 'sales_center') {
      const rows = branchPerformanceList.map((r, idx) => ({
        'SL': idx + 1,
        'Sales Center': r.name,
        'Branch In-Charge': r.inChargeName,
        'Bills Count': r.billsCount,
        'Total Coils Sold': r.totalCoils,
        'Net Sales (৳)': r.totalSales,
        'Collections (৳)': r.totalCollection,
        'Collection Ratio (%)': `${r.collectionRatio.toFixed(1)}%`,
        'Net Balance (৳)': r.balance,
        'Top Performer': r.topOfficer || 'N/A'
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sales Centers Report');
      XLSX.writeFile(wb, `Sales_Centers_Report_${Date.now()}.xlsx`);
      return;
    }

    // Default: Marketing Officer
    const rows = salespersonPerformanceList.map((r, idx) => ({
      'SL': idx + 1,
      'Code': r.code,
      'Marketing Person': r.name,
      'Sales Center': r.branchName,
      'Bills Count': r.billsCount,
      'Total Coils Sold': r.coilsSold,
      'Target Sales (৳)': r.targetSales,
      'Actual Sales (৳)': r.actualSales,
      'Sales Achieved (%)': `${r.salesAchievement}%`,
      'Target Collection (৳)': r.targetCollection,
      'Actual Collection (৳)': r.actualCollection,
      'Collection Achieved (%)': `${r.collectionAchievement}%`,
      'Net Balance (৳)': r.balance
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Marketing Officers');
    XLSX.writeFile(wb, `Marketing_Officers_Report_${Date.now()}.xlsx`);
  };

  return (
    <div className="p-3 sm:p-5 space-y-4 w-full max-w-[1600px] mx-auto font-sans">
      {/* Print Styles */}
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm 6mm 10mm 6mm !important;
          }
          body, html {
            background-color: #ffffff !important;
            color: #000000 !important;
          }
          .no-print {
            display: none !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          th, td {
            border: 1px solid #cbd5e1 !important;
            color: #000000 !important;
          }
        }
      `}</style>

      {/* Printable Company & Report Header (Shown only during window.print) */}
      <div className="hidden print:block mb-4 text-center border-b-2 border-slate-900 pb-3">
        <h1 className="text-2xl font-black uppercase tracking-wider text-slate-950">
          {company?.name || 'POLY CABLE INDUSTRIES LTD.'}
        </h1>
        <p className="text-xs text-slate-700">
          {company?.address || 'Regd. Office: 26, B.C.C. Road, Thatari Bazar, Dhaka-1203'} • Tel: {company?.phone || '01917-703350'}
        </p>
        <h2 className="text-sm font-black uppercase mt-1 text-slate-900 tracking-wide">
          {getPrintReportTitle(activeTab)}
        </h2>
        <div className="text-[11px] text-slate-800 mt-1 flex justify-center gap-6 font-semibold">
          <span>Date Period: {dateRangeISO.start ? formatDateDDMMYY(dateRangeISO.start) : 'All'} to {dateRangeISO.end ? formatDateDDMMYY(dateRangeISO.end) : 'Present'}</span>
          <span>Sales Center: {selectedBranchId !== 'all' ? (branches.find((b) => b.id === selectedBranchId)?.name || 'Selected') : 'All Sales Centers'}</span>
          {selectedSalespersonCode !== 'all' && (
            <span>Officer: {localSalespersons.find((s) => s.code === selectedSalespersonCode)?.name}</span>
          )}
          <span>Generated: {new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>

      {/* Top Header Bar with Right-Side Notifications Hub Button */}
      <div className="no-print flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-white/[0.10]">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Dashboard - Sales &amp; Collection (Admin)</h1>
          <p className="text-xs text-slate-300/85">Executive dashboard of multi-center performance, targets, achievements &amp; live recovery</p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (onOpenNotifications) {
              onOpenNotifications();
            } else {
              window.dispatchEvent(new CustomEvent('polycables_open_comm_hub'));
            }
          }}
          className="relative inline-flex items-center space-x-1.5 px-3.5 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-100 font-bold rounded-xl shadow-sm border border-cyan-400/50 text-xs cursor-pointer transition-all backdrop-blur-md self-end sm:self-auto"
          title="Notifications, Messages, Video Call & Screen Share"
        >
          <Bell className={`w-4 h-4 text-cyan-300 ${unreadCommCount > 0 ? 'animate-bounce' : ''}`} />
          <span>Notifications</span>
          {unreadCommCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-rose-500 text-white text-[10px] font-black leading-none">
              {unreadCommCount > 99 ? '99+' : unreadCommCount}
            </span>
          )}
        </button>
      </div>

      {/* FILTER BAR - STRICTLY 2 LINES ON DESKTOP */}
      <div className="no-print bg-[#081e2d]/85 backdrop-blur-xl border border-cyan-500/25 rounded-2xl shadow-lg text-white p-2.5 px-3.5 space-y-2 text-xs">
        {/* Line 1: Admin, Sales Center, Marketing Officer, Party, Item */}
        <div className="flex flex-wrap lg:flex-nowrap items-center gap-2">
          {/* Super Admin Exclusive: Choose Admin */}
          {isSuperAdmin && (
            <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 h-[34px] min-w-0 w-full sm:w-auto lg:flex-1">
              <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="font-bold text-cyan-200/80 text-[11px] whitespace-nowrap">Admin:</span>
              <select
                value={selectedAdminId}
                onChange={(e) => {
                  setSelectedAdminId(e.target.value);
                  setSelectedBranchId('all');
                }}
                className="bg-transparent text-cyan-100 font-bold text-xs flex-1 min-w-0 max-w-full truncate focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-[#091e2c] text-white">All Admins ({adminClusters.length})</option>
                {adminClusters.map((adm) => (
                  <option key={adm.adminId} value={adm.adminId} className="bg-[#091e2c] text-white">
                    {adm.adminName} ({adm.branchCount} Centers)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sales Center / Branch Filter */}
          <SalesCenterSearchFilter
            value={effectiveSelectedBranchId}
            onChange={(newVal) => {
              if (!isBranchLocked) {
                handleBranchChange(newVal);
              }
            }}
            branches={
              !isSuperAdmin && !isAccountsAdminUser
                ? allowedUserBranches
                : (selectedAdminId !== 'all'
                  ? adminClusters.find((c) => c.adminId === selectedAdminId)?.branches || branches
                  : branches)
            }
            isLocked={isBranchLocked}
            lockedReason={`Locked to assigned sales center: ${branches.find(b => b.id === effectiveSelectedBranchId)?.name || effectiveSelectedBranchId}`}
            includeAllOption={!isBranchLocked}
            allOptionLabel={
              !isSuperAdmin && !isAccountsAdminUser
                ? `All My Centers (${allowedUserBranches.length})`
                : (selectedAdminId !== 'all'
                  ? `Admin Centers (${(adminClusters.find((c) => c.adminId === selectedAdminId)?.branches || []).length})`
                  : `All Centers (${branches.length})`)
            }
            allOptionValue="all"
            label="Center:"
            theme="dark"
            size="sm"
            widthClass="min-w-0 w-full sm:w-auto lg:flex-1 sm:max-w-[230px]"
          />

          {/* Marketing Officer Filter */}
          <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 h-[34px] min-w-0 w-full sm:w-auto lg:flex-1">
            <Users className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
            <span className="font-bold text-cyan-200/80 text-[11px] whitespace-nowrap">Officer:</span>
            <select
              value={selectedSalespersonCode}
              onChange={(e) => setSelectedSalespersonCode(e.target.value)}
              className="bg-transparent text-cyan-100 font-bold text-xs flex-1 min-w-0 max-w-full truncate focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-[#091e2c] text-white">All Officers ({branchFilteredSalespersons.length})</option>
              {branchFilteredSalespersons.map((sp) => (
                <option key={sp.id} value={sp.code} className="bg-[#091e2c] text-white">
                  {sp.code} - {sp.name}
                </option>
              ))}
            </select>
          </div>

          {/* Party Wise Filter */}
          <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 h-[34px] min-w-0 w-full sm:w-auto lg:flex-1">
            <span className="font-bold text-cyan-200/80 text-[11px] whitespace-nowrap">Party:</span>
            <select
              value={selectedPartyName}
              onChange={(e) => setSelectedPartyName(e.target.value)}
              className="bg-transparent text-cyan-100 font-bold text-xs flex-1 min-w-0 max-w-full truncate focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-[#091e2c] text-white">All Parties ({filteredPartiesForDropdown.length})</option>
              {filteredPartiesForDropdown.map((p, pIdx) => (
                <option key={p.id ? `${p.id}-${pIdx}` : `party-${pIdx}`} value={p.name} className="bg-[#091e2c] text-white">
                  {getPartyDisplayWithAddress(p.name, p.address)}
                </option>
              ))}
            </select>
          </div>

          {/* Item Wise Filter */}
          <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 h-[34px] min-w-0 w-full sm:w-auto lg:flex-1">
            <Boxes className="w-3.5 h-3.5 text-purple-300 shrink-0" />
            <span className="font-bold text-cyan-200/80 text-[11px] whitespace-nowrap">Item:</span>
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className="bg-transparent text-cyan-100 font-bold text-xs flex-1 min-w-0 max-w-full truncate focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-[#091e2c] text-white">All Items ({sortedItemsDirectory.length})</option>
              {sortedItemsDirectory.map((it, idx) => (
                <option key={it.id} value={it.id} className="bg-[#091e2c] text-white">
                  {idx + 1}. {it.code ? `${it.code} - ${it.name}` : it.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Line 2: Period Selection, Search Box & Reset All */}
        <div className="pt-2 border-t border-cyan-500/20 flex flex-wrap lg:flex-nowrap items-center gap-1.5 text-xs">
          <div className="flex items-center space-x-1.5 flex-wrap lg:flex-nowrap gap-y-1 flex-1 min-w-0">
            <div className="flex items-center space-x-1 mr-0.5 text-cyan-200/80 font-bold shrink-0">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Period:</span>
            </div>

            <button
              type="button"
              onClick={() => handleSelectPeriodPreset('this_month')}
              className={`px-2.5 py-1 h-[34px] rounded-xl text-xs transition-all cursor-pointer border whitespace-nowrap ${
                period === 'this_month'
                  ? 'bg-emerald-500/90 text-white border-emerald-300/90 shadow-[0_0_12px_rgba(16,185,129,0.40)] font-black'
                  : 'bg-[#061520]/90 hover:bg-cyan-500/15 text-slate-200 border-cyan-500/30 font-bold'
              }`}
            >
              This Month
            </button>

            <button
              type="button"
              onClick={() => handleSelectPeriodPreset('last_month')}
              className={`px-2.5 py-1 h-[34px] rounded-xl text-xs transition-all cursor-pointer border whitespace-nowrap ${
                period === 'last_month'
                  ? 'bg-emerald-500/90 text-white border-emerald-300/90 shadow-[0_0_12px_rgba(16,185,129,0.40)] font-black'
                  : 'bg-[#061520]/90 hover:bg-cyan-500/15 text-slate-200 border-cyan-500/30 font-bold'
              }`}
            >
              Last Month
            </button>

            <button
              type="button"
              onClick={() => handleSelectPeriodPreset('this_year')}
              className={`px-2.5 py-1 h-[34px] rounded-xl text-xs transition-all cursor-pointer border whitespace-nowrap ${
                period === 'this_year'
                  ? 'bg-emerald-500/90 text-white border-emerald-300/90 shadow-[0_0_12px_rgba(16,185,129,0.40)] font-black'
                  : 'bg-[#061520]/90 hover:bg-cyan-500/15 text-slate-200 border-cyan-500/30 font-bold'
              }`}
            >
              This Year
            </button>

            <button
              type="button"
              onClick={() => handleSelectPeriodPreset('last_year')}
              className={`px-2.5 py-1 h-[34px] rounded-xl text-xs transition-all cursor-pointer border whitespace-nowrap ${
                period === 'last_year'
                  ? 'bg-emerald-500/90 text-white border-emerald-300/90 shadow-[0_0_12px_rgba(16,185,129,0.40)] font-black'
                  : 'bg-[#061520]/90 hover:bg-cyan-500/15 text-slate-200 border-cyan-500/30 font-bold'
              }`}
            >
              Last Year
            </button>

            <button
              type="button"
              onClick={() => handleSelectPeriodPreset('all')}
              className={`px-2.5 py-1 h-[34px] rounded-xl text-xs transition-all cursor-pointer border whitespace-nowrap ${
                period === 'all'
                  ? 'bg-emerald-500/90 text-white border-emerald-300/90 shadow-[0_0_12px_rgba(16,185,129,0.40)] font-black'
                  : 'bg-[#061520]/90 hover:bg-cyan-500/15 text-slate-200 border-cyan-500/30 font-bold'
              }`}
            >
              All
            </button>

            <button
              type="button"
              onClick={() => handleSelectPeriodPreset('custom')}
              className={`px-2.5 py-1 h-[34px] rounded-xl text-xs transition-all cursor-pointer border whitespace-nowrap ${
                period === 'custom'
                  ? 'bg-emerald-500/90 text-white border-emerald-300/90 shadow-[0_0_12px_rgba(16,185,129,0.40)] font-black'
                  : 'bg-[#061520]/90 hover:bg-cyan-500/15 text-slate-200 border-cyan-500/30 font-bold'
              }`}
            >
              Custom Range
            </button>

            {/* Inline Custom Date Inputs */}
            {period === 'custom' && (
              <div className="flex flex-wrap items-center gap-1.5 bg-[#061520]/90 px-2.5 py-1 h-[34px] rounded-xl border border-cyan-500/30 text-[11px] w-full sm:w-auto">
                <span className="text-slate-400 font-bold whitespace-nowrap">From:</span>
                <div className="flex items-center space-x-1">
                  <input
                    ref={startInputRef}
                    type="text"
                    value={customStartDate}
                    onChange={(e) => handleCustomStartDateChange(e.target.value)}
                    placeholder="dd.mm.yy"
                    className="bg-white/[0.06] text-emerald-300 font-mono font-bold py-0.5 px-1.5 border border-cyan-500/30 rounded w-16 text-center text-xs focus:ring-1 focus:ring-emerald-400 focus:outline-none"
                  />
                  <div className="relative flex items-center">
                    <input
                      type="date"
                      value={parseDateToISO(customStartDate)}
                      onChange={(e) => handleStartDatePickerChange(e.target.value)}
                      className="opacity-0 absolute inset-0 w-6 h-6 cursor-pointer z-10"
                      title="Select From Date"
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
                    value={customEndDate}
                    onChange={(e) => handleCustomEndDateChange(e.target.value)}
                    placeholder="dd.mm.yy"
                    className="bg-white/[0.06] text-emerald-300 font-mono font-bold py-0.5 px-1.5 border border-cyan-500/30 rounded w-16 text-center text-xs focus:ring-1 focus:ring-emerald-400 focus:outline-none"
                  />
                  <div className="relative flex items-center">
                    <input
                      type="date"
                      value={parseDateToISO(customEndDate)}
                      onChange={(e) => handleEndDatePickerChange(e.target.value)}
                      className="opacity-0 absolute inset-0 w-6 h-6 cursor-pointer z-10"
                      title="Select To Date"
                    />
                    <Calendar className="w-3.5 h-3.5 text-slate-400 hover:text-emerald-400 cursor-pointer" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Search Box & Reset Button on the exact same line */}
          <div className="flex flex-wrap items-center gap-1.5 w-full lg:w-auto lg:shrink-0 lg:ml-auto">
            <div className="relative min-w-0 flex-1 lg:flex-initial lg:w-[175px]">
              <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search bill, party, officer..."
                className="w-full pl-8 pr-7 py-1.5 h-[34px] text-xs bg-[#061520]/90 text-white placeholder-slate-400 border border-cyan-500/30 rounded-xl font-medium focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs p-0.5 cursor-pointer font-bold"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {((!isBranchLocked && selectedBranchId !== 'all') ||
              selectedSalespersonCode !== (userLoginFilters.salesmanCode || 'all') ||
              selectedPartyName !== 'all' ||
              selectedItemId !== 'all' ||
              searchQuery ||
              period !== 'this_month') && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1 h-[34px] text-xs font-bold text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/35 rounded-xl transition-colors cursor-pointer shrink-0"
                title="Reset all filters to default"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-300" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* TOP PERFORMERS SECTION: 1. TOP MARKETING PERSON • 2. TOP SALES CENTER • 3. TOP PARTY */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 1. TOP MARKETING PERSON (AURORA CYAN GLASS HALO WITH EXECUTIVE PORTRAIT FRAME) */}
        <div className="bg-gradient-to-br from-cyan-400/[0.12] via-[#0a2334]/46 to-teal-500/[0.08] backdrop-blur-2xl border-[1.5px] border-cyan-300/85 shadow-[0_0_40px_rgba(34,211,238,0.34),inset_0_1px_0_rgba(255,255,255,0.18)] rounded-2xl p-4 relative overflow-hidden flex flex-col justify-between h-full space-y-3">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              {/* Executive Portrait Frame matching style.jpeg */}
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border border-cyan-300/80 bg-gradient-to-br from-cyan-400/25 via-[#0d2d40]/90 to-teal-500/25 shadow-[0_0_18px_rgba(34,211,238,0.32)] shrink-0 flex items-center justify-center relative">
                {((topLeaderboards.topOfficer as any)?.photoUrl || (topLeaderboards.topOfficer as any)?.avatar) ? (
                  <img
                    src={(topLeaderboards.topOfficer as any)?.photoUrl || (topLeaderboards.topOfficer as any)?.avatar}
                    alt={topLeaderboards.topOfficer?.name || 'Top Marketing Officer'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <svg viewBox="0 0 64 64" className="w-full h-full" aria-hidden="true">
                    <defs>
                      <linearGradient id="execPortraitBg" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#164e63" />
                        <stop offset="100%" stopColor="#0b2233" />
                      </linearGradient>
                      <linearGradient id="execPortraitSilhouette" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#a5f3fc" />
                        <stop offset="100%" stopColor="#22d3ee" />
                      </linearGradient>
                    </defs>
                    <rect width="64" height="64" fill="url(#execPortraitBg)" />
                    <circle cx="32" cy="24" r="11" fill="url(#execPortraitSilhouette)" opacity="0.88" />
                    <path d="M12 60 C12 45, 22 39, 32 39 C42 39, 52 45, 52 60 Z" fill="url(#execPortraitSilhouette)" opacity="0.85" />
                    <path d="M27 39 L32 48 L37 39" fill="#082f49" opacity="0.65" />
                  </svg>
                )}
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-1.5 text-amber-300 font-black text-xs uppercase tracking-wider truncate">
                    <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30 shrink-0" />
                    <span className="truncate">1. Top Marketing</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('marketing_officer')}
                    className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/50 transition-colors cursor-pointer shrink-0"
                  >
                    View All ({salespersonPerformanceList.length})
                  </button>
                </div>

                <div className="text-base sm:text-lg font-black text-white truncate leading-tight">
                  {topLeaderboards.topOfficer?.name || 'No Sales Recorded'}
                </div>
                <div className="text-[11px] text-slate-300 font-medium flex items-center justify-between gap-2">
                  <span className="shrink-0">Code: <strong className="text-amber-300 font-mono">{topLeaderboards.topOfficer?.code || '-'}</strong></span>
                  <span className="truncate text-slate-200 font-bold">{topLeaderboards.topOfficer?.branchName || '-'}</span>
                </div>
              </div>
            </div>

            <div className="aurora-ice-band grid grid-cols-3 gap-2 p-2.5 rounded-xl text-xs">
              <div>
                <span className="text-slate-100/85 text-[10px] block uppercase font-bold">Total Sale</span>
                <strong className="text-emerald-300 font-mono font-black text-xs sm:text-sm">
                  ৳{(topLeaderboards.topOfficer?.actualSales || 0).toLocaleString('en-IN')}
                </strong>
              </div>
              <div className="border-l border-white/[0.22] pl-2">
                <span className="text-slate-100/85 text-[10px] block uppercase font-bold">Collection</span>
                <strong className="text-cyan-200 font-mono font-black text-xs sm:text-sm">
                  ৳{(topLeaderboards.topOfficer?.actualCollection || 0).toLocaleString('en-IN')}
                </strong>
              </div>
              <div className="border-l border-white/[0.22] pl-2">
                <span className="text-slate-100/85 text-[10px] block uppercase font-bold">Achieved</span>
                <span className="bg-emerald-500/25 text-emerald-200 font-black px-1.5 py-0.5 rounded text-[11px] border border-emerald-300/50 inline-block font-mono">
                  {topLeaderboards.topOfficer?.salesAchievement || 0}%
                </span>
              </div>
            </div>
          </div>

          {/* Top Marketing Officers Mini Ranking */}
          <div className="pt-2 border-t border-white/[0.12] mt-auto">
            <div className="flex items-center justify-between text-[10px] font-bold text-amber-300 uppercase tracking-wide mb-1.5">
              <span>Top Marketing Officers</span>
              <span>Sale / Coll.</span>
            </div>
            <div className="space-y-1 text-xs min-h-[148px] flex flex-col justify-start">
              {topLeaderboards.topOfficersList.slice(0, 4).map((sp, idx) => (
                <div
                  key={sp.code || idx}
                  onClick={() => {
                    setSelectedSalespersonCode(sp.code);
                    setActiveTab('marketing_officer');
                  }}
                  className="flex items-center justify-between text-slate-200 py-1.5 px-2.5 rounded-xl bg-[#081c28]/58 backdrop-blur-xs hover:bg-white/[0.11] border border-white/[0.10] transition-colors cursor-pointer shadow-xs"
                  title="Click to filter by this Marketing Officer"
                >
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <span className="text-xs shrink-0">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}</span>
                    <span className="font-bold text-white truncate">{sp.name}</span>
                  </div>
                  <div className="flex items-center space-x-1.5 font-mono text-[11px] shrink-0">
                    <span className="font-extrabold text-emerald-300">৳{sp.actualSales.toLocaleString('en-IN')}</span>
                    <span className="text-slate-400">/</span>
                    <span className="font-bold text-cyan-300">৳{sp.actualCollection.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 2. TOP SALES CENTER (AURORA SKY-CYAN GLASS HALO) */}
        <div className="bg-gradient-to-br from-sky-400/[0.11] via-[#0a2236]/46 to-cyan-500/[0.08] backdrop-blur-2xl border-[1.5px] border-sky-300/80 shadow-[0_0_40px_rgba(56,189,248,0.32),inset_0_1px_0_rgba(255,255,255,0.18)] rounded-2xl p-4 relative overflow-hidden flex flex-col justify-between h-full space-y-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 text-sky-300 font-black text-xs uppercase tracking-wider">
                <Building2 className="w-4 h-4 text-sky-400 shrink-0" />
                <span>2. Top Sales Center</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('sales_center')}
                className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-400/50 transition-colors cursor-pointer"
              >
                View All ({branchPerformanceList.length})
              </button>
            </div>

            <div className="space-y-0.5 min-h-[44px]">
              <div className="text-lg font-black text-white truncate">
                {topLeaderboards.topCenter?.name || 'Madhupur Sales Center'}
              </div>
              <div className="text-[11px] text-slate-300 font-medium flex items-center justify-between">
                <span>In-Charge: <strong className="text-slate-100">{topLeaderboards.topCenter?.inChargeName || '-'}</strong></span>
                <span className="font-mono font-bold text-amber-300">{(topLeaderboards.topCenter?.totalCoils || 0).toLocaleString('en-IN')} Coils</span>
              </div>
            </div>

            <div className="aurora-ice-band grid grid-cols-3 gap-2 p-2.5 rounded-xl text-xs">
              <div>
                <span className="text-slate-100/85 text-[10px] block uppercase font-bold">Total Sale</span>
                <strong className="text-emerald-300 font-mono font-black text-xs sm:text-sm">
                  ৳{(topLeaderboards.topCenter?.totalSales || 0).toLocaleString('en-IN')}
                </strong>
              </div>
              <div className="border-l border-white/[0.22] pl-2">
                <span className="text-slate-100/85 text-[10px] block uppercase font-bold">Collection</span>
                <strong className="text-cyan-200 font-mono font-black text-xs sm:text-sm">
                  ৳{(topLeaderboards.topCenter?.totalCollection || 0).toLocaleString('en-IN')}
                </strong>
              </div>
              <div className="border-l border-white/[0.22] pl-2">
                <span className="text-slate-100/85 text-[10px] block uppercase font-bold">Coll. Ratio</span>
                <span className="bg-sky-500/25 text-sky-100 font-black px-1.5 py-0.5 rounded text-[11px] border border-sky-300/50 inline-block font-mono">
                  {(topLeaderboards.topCenter?.collectionRatio || 0).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Top Sales Centers Mini Ranking */}
          <div className="pt-2 border-t border-white/[0.12] mt-auto">
            <div className="flex items-center justify-between text-[10px] font-bold text-sky-300 uppercase tracking-wide mb-1.5">
              <span>Top Sales Centers</span>
              <span>Sale / Ratio</span>
            </div>
            <div className="space-y-1 text-xs min-h-[148px] flex flex-col justify-start">
              {topLeaderboards.topCentersList.slice(0, 4).map((center, idx) => (
                <div
                  key={center.id || idx}
                  onClick={() => {
                    if (!isBranchLocked) {
                      handleBranchChange(center.id);
                    }
                    setActiveTab('sales_center');
                  }}
                  className="flex items-center justify-between text-slate-200 py-1.5 px-2.5 rounded-xl bg-[#081c28]/58 backdrop-blur-xs hover:bg-white/[0.11] border border-white/[0.10] transition-colors cursor-pointer shadow-xs"
                  title="Click to view Sales Center details"
                >
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <span className="text-xs shrink-0">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}</span>
                    <span className="font-bold text-white truncate">{center.name}</span>
                  </div>
                  <div className="flex items-center space-x-1.5 font-mono text-[11px] shrink-0">
                    <span className="font-extrabold text-emerald-300">৳{center.totalSales.toLocaleString('en-IN')}</span>
                    <span className="text-[10px] px-1.5 py-0.2 bg-sky-500/20 text-sky-200 rounded font-bold border border-sky-400/40">
                      {center.collectionRatio.toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
              {Array.from({ length: Math.max(0, 4 - topLeaderboards.topCentersList.length) }).map((_, pIdx) => (
                <div
                  key={`empty-center-${pIdx}`}
                  className="flex items-center justify-between text-slate-500 py-1.5 px-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] text-xs select-none"
                >
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <span className="text-xs shrink-0 text-slate-600">#{topLeaderboards.topCentersList.length + pIdx + 1}</span>
                    <span className="italic text-[11px] text-slate-500">No additional center</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-600 font-bold">-</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 3. TOP PARTY (AURORA PINK/MAGENTA GLASS HALO) */}
        <div className="bg-gradient-to-br from-emerald-400/[0.06] via-[#131e34]/46 to-pink-500/[0.16] backdrop-blur-2xl border-[1.5px] border-pink-400/85 shadow-[0_0_42px_rgba(236,72,153,0.38),inset_0_1px_0_rgba(255,255,255,0.18)] rounded-2xl p-4 relative overflow-hidden flex flex-col justify-between h-full space-y-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 text-emerald-300 font-black text-xs uppercase tracking-wider">
                <Award className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>3. Top Party (Customer)</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('party_wise')}
                className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/50 transition-colors cursor-pointer"
              >
                View All ({partyWiseList.length})
              </button>
            </div>

            <div className="space-y-0.5 min-h-[44px]">
              <div className="text-lg font-black text-white truncate" title={topLeaderboards.topParty ? getPartyDisplayWithAddress(topLeaderboards.topParty.partyName) : ''}>
                {topLeaderboards.topParty ? getPartyDisplayWithAddress(topLeaderboards.topParty.partyName) : 'No Party Activity'}
              </div>
              <div className="text-[11px] text-slate-300 font-medium flex items-center justify-between">
                <span className="truncate max-w-[165px]">Officer: <strong className="text-slate-100">{topLeaderboards.topParty?.salespersonName || '-'}</strong></span>
                <span className="font-mono font-bold text-amber-300">{(topLeaderboards.topParty?.coils || 0).toLocaleString('en-IN')} Coils</span>
              </div>
            </div>

            <div className="aurora-ice-band grid grid-cols-3 gap-2 p-2.5 rounded-xl text-xs">
              <div>
                <span className="text-slate-100/85 text-[10px] block uppercase font-bold">Total Sale</span>
                <strong className="text-emerald-300 font-mono font-black text-xs sm:text-sm">
                  ৳{(topLeaderboards.topParty?.sales || 0).toLocaleString('en-IN')}
                </strong>
              </div>
              <div className="border-l border-white/[0.22] pl-2">
                <span className="text-slate-100/85 text-[10px] block uppercase font-bold">Collection</span>
                <strong className="text-cyan-200 font-mono font-black text-xs sm:text-sm">
                  ৳{(topLeaderboards.topParty?.collection || 0).toLocaleString('en-IN')}
                </strong>
              </div>
              <div className="border-l border-white/[0.22] pl-2">
                <span className="text-slate-100/85 text-[10px] block uppercase font-bold">Coll. Ratio</span>
                <span className="bg-emerald-500/25 text-emerald-200 font-black px-1.5 py-0.5 rounded text-[11px] border border-emerald-300/50 inline-block font-mono">
                  {(topLeaderboards.topParty?.collectionRatio || 0).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Top Parties Mini Ranking */}
          <div className="pt-2 border-t border-white/[0.12] mt-auto">
            <div className="flex items-center justify-between text-[10px] font-bold text-emerald-300 uppercase tracking-wide mb-1.5">
              <span>Top Customer Parties</span>
              <span>Sale / Ratio</span>
            </div>
            <div className="space-y-1 text-xs min-h-[148px] flex flex-col justify-start">
              {topLeaderboards.topPartiesList.slice(0, 4).map((pt, idx) => (
                <div
                  key={pt.partyName + idx}
                  onClick={() => {
                    setSelectedPartyName(pt.partyName);
                    setActiveTab('party_wise');
                  }}
                  className="flex items-center justify-between text-slate-200 py-1.5 px-2.5 rounded-xl bg-[#081c28]/58 backdrop-blur-xs hover:bg-white/[0.11] border border-white/[0.10] transition-colors cursor-pointer shadow-xs"
                  title="Click to filter by this Party"
                >
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <span className="text-xs shrink-0">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}</span>
                    <span className="font-bold text-white truncate">{getPartyDisplayWithAddress(pt.partyName)}</span>
                  </div>
                  <div className="flex items-center space-x-1.5 font-mono text-[11px] shrink-0">
                    <span className="font-extrabold text-emerald-300">৳{pt.sales.toLocaleString('en-IN')}</span>
                    <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-200 rounded font-bold border border-emerald-400/40">
                      {pt.collectionRatio.toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
              {topLeaderboards.topPartiesList.length === 0 && (
                <div className="text-center text-slate-400 italic py-2">No party records in period</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SUMMARY KPI CARDS (AURORA GLASSMORPHISM WITH GRAPHIC ACCENTS) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Card 1: Total Net Sales */}
        <div className="bg-[#091f2e]/46 backdrop-blur-2xl p-3.5 rounded-2xl border border-white/[0.15] shadow-[0_12px_32px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.12)] text-slate-100 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] font-bold uppercase text-slate-300/80 mb-1">Total Net Sales</div>
              <div className="text-base font-black text-white font-mono">
                ৳{kpiMetrics.totalNetSales.toLocaleString('en-IN')}
              </div>
            </div>
            <svg viewBox="0 0 36 28" className="w-8 h-6 shrink-0 opacity-90" aria-hidden="true">
              <rect x="2" y="18" width="4" height="8" rx="1.5" fill="#2dd4bf" opacity="0.55" />
              <rect x="9" y="13" width="4" height="13" rx="1.5" fill="#38bdf8" opacity="0.7" />
              <rect x="16" y="15" width="4" height="11" rx="1.5" fill="#22d3ee" opacity="0.85" />
              <rect x="23" y="8" width="4" height="18" rx="1.5" fill="#34d399" />
              <rect x="30" y="3" width="4" height="23" rx="1.5" fill="#c084fc" />
            </svg>
          </div>
          <div className="text-[10px] text-slate-300/80 flex items-center justify-between mt-2">
            <span>Gross: ৳{kpiMetrics.totalGrossSales.toLocaleString('en-IN')}</span>
            <span className="font-bold text-slate-200">{kpiMetrics.billsCount} bills</span>
          </div>
        </div>

        {/* Card 2: Total Collections */}
        <div className="bg-[#091f2e]/46 backdrop-blur-2xl p-3.5 rounded-2xl border border-white/[0.15] shadow-[0_12px_32px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.12)] text-slate-100 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] font-bold uppercase text-slate-300/80 mb-1">Total Collections</div>
              <div className="text-base font-black text-cyan-300 font-mono">
                ৳{kpiMetrics.totalCollections.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="w-6 h-6 rounded-full bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center shrink-0">
              <DollarSign className="w-3.5 h-3.5 text-cyan-300" />
            </div>
          </div>
          <div className="text-[10px] text-slate-300/80 flex items-center justify-between mt-2">
            <span>Cash: ৳{kpiMetrics.cashCollection.toLocaleString('en-IN')}</span>
            <span>Bank: ৳{kpiMetrics.bankCollection.toLocaleString('en-IN')}</span>
          </div>
        </div>

        {/* Card 3: Total Coils */}
        <div className="bg-[#091f2e]/46 backdrop-blur-2xl p-3.5 rounded-2xl border border-white/[0.15] shadow-[0_12px_32px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.12)] text-slate-100 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] font-bold uppercase text-slate-300/80 mb-1">Total Coils</div>
              <div className="text-base font-black text-amber-300 font-mono">
                {kpiMetrics.totalCoils.toLocaleString('en-IN')} Coils
              </div>
            </div>
            <svg viewBox="0 0 34 28" className="w-8 h-6 shrink-0 opacity-90" aria-hidden="true">
              <ellipse cx="17" cy="14" rx="11" ry="6" fill="none" stroke="#38bdf8" strokeWidth="1.8" transform="rotate(-24 17 14)" />
              <ellipse cx="17" cy="14" rx="7" ry="3.5" fill="none" stroke="#94a3b8" strokeWidth="1.4" transform="rotate(-24 17 14)" />
              <path d="M5 23 C 10 25, 22 25, 29 20" fill="none" stroke="#fbbf24" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <div className="text-[10px] text-slate-300/80 mt-2">
            Shipped across {kpiMetrics.billsCount} sales vouchers
          </div>
        </div>

        {/* Card 4: Sales Target & Achieved */}
        <div className="bg-[#091f2e]/46 backdrop-blur-2xl p-3.5 rounded-2xl border border-white/[0.15] shadow-[0_12px_32px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.12)] text-slate-100 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] font-bold uppercase text-slate-300/80 mb-1">Sales Target &amp; Achieved</div>
              <div className="text-base font-black text-emerald-300 font-mono flex items-center space-x-1">
                <span>{kpiMetrics.salesAchievedPercent}%</span>
              </div>
            </div>
            <svg viewBox="0 0 40 40" className="w-9 h-9 shrink-0 -rotate-90" aria-hidden="true">
              <circle cx="20" cy="20" r="15" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
              <circle
                cx="20"
                cy="20"
                r="15"
                fill="none"
                stroke="#22d3ee"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray="94.25"
                strokeDashoffset={94.25 - (94.25 * Math.min(100, Math.max(0, Number(kpiMetrics.salesAchievedPercent) || 0))) / 100}
              />
            </svg>
          </div>
          <div className="text-[10px] text-slate-300/80 mt-2 truncate">
            / ৳{kpiMetrics.totalTargetSales.toLocaleString('en-IN')}
          </div>
        </div>

        {/* Card 5: Collection / Recovery % */}
        <div className="bg-[#091f2e]/46 backdrop-blur-2xl p-3.5 rounded-2xl border border-white/[0.15] shadow-[0_12px_32px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.12)] text-slate-100 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] font-bold uppercase text-slate-300/80 mb-1">Collection / Recovery %</div>
              <div className="text-base font-black text-purple-300 font-mono flex items-center space-x-1">
                <span>{kpiMetrics.collectionRecoveryPercent}%</span>
              </div>
            </div>
            <svg viewBox="0 0 40 40" className="w-9 h-9 shrink-0 -rotate-90" aria-hidden="true">
              <circle cx="20" cy="20" r="15" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
              <circle
                cx="20"
                cy="20"
                r="15"
                fill="none"
                stroke="#ec4899"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray="94.25"
                strokeDashoffset={94.25 - (94.25 * Math.min(100, Math.max(0, Number(kpiMetrics.collectionRecoveryPercent) || 0))) / 100}
              />
            </svg>
          </div>
          <div className="text-[10px] text-slate-300/80 mt-2 truncate">
            Target: ৳{kpiMetrics.totalTargetCollection.toLocaleString('en-IN')}
          </div>
        </div>

        {/* Card 6: Net Due / Balance */}
        <div className="bg-[#0e1e2e]/48 backdrop-blur-2xl p-3.5 rounded-2xl border-[1.5px] border-rose-400/75 shadow-[0_0_28px_rgba(244,63,94,0.28),inset_0_1px_0_rgba(255,255,255,0.12)] text-slate-100 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] font-bold uppercase text-slate-300/80 mb-1">Net Due / Balance</div>
              <div className="text-base font-black text-rose-300 font-mono">
                ৳{kpiMetrics.netBalance.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="w-6 h-6 rounded-full bg-rose-500/15 border border-rose-400/45 flex items-center justify-center shrink-0">
              <DollarSign className="w-3.5 h-3.5 text-rose-300" />
            </div>
          </div>
          <div className="text-[10px] text-slate-300/80 mt-2">
            Sales less collected deals
          </div>
        </div>
      </div>

      {/* EXECUTIVE INFOGRAPHIC GRAPHS — SUPER ADMIN: ADMIN WISE | ADMIN: SALES CENTER WISE */}
      <div className="bg-[#081f30]/44 backdrop-blur-2xl border border-white/[0.15] p-4 sm:p-6 rounded-3xl shadow-[0_14px_38px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.10)] space-y-5 no-print">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.10] pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-400/35 text-cyan-200 text-xs font-bold">
              {isSuperAdmin ? <Crown className="w-3.5 h-3.5 text-amber-400" /> : <Building2 className="w-3.5 h-3.5 text-cyan-400" />}
              <span>{isSuperAdmin ? 'Admin Wise Performance Infographic' : 'Sales Center Wise Performance Infographic'}</span>
            </div>
            <h3 className="text-xl font-black text-white tracking-tight">
              {isSuperAdmin ? 'Sales & Collections — Admin Wise' : 'Sales & Collections — Sales Center Wise'}
            </h3>
            <p className="text-xs text-slate-300/80">
              {isSuperAdmin
                ? `Super Admin distribution comparing net billed sales and realized collections across ${adminClusterPerformanceList.length} Admin clusters.`
                : `Live Sales Center wise distribution comparing net billed sales and realized collections across ${branchPerformanceList.length} sales centers.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
            <div className="bg-white/[0.05] px-3 py-1.5 rounded-xl border border-white/[0.12]">
              <span className="text-slate-400">Total Sales:</span>{' '}
              <strong className="text-emerald-300">৳{(isSuperAdmin ? kpiMetrics.totalNetSales : scGraphGrandSales).toLocaleString('en-IN')}</strong>
            </div>
            <div className="bg-white/[0.05] px-3 py-1.5 rounded-xl border border-white/[0.12]">
              <span className="text-slate-400">Total Collections:</span>{' '}
              <strong className="text-cyan-300">৳{(isSuperAdmin ? kpiMetrics.totalCollections : scGraphGrandCollections).toLocaleString('en-IN')}</strong>
            </div>
            <div className="bg-white/[0.05] px-3 py-1.5 rounded-xl border border-white/[0.12]">
              <span className="text-slate-400">Total Volume:</span>{' '}
              <strong className="text-amber-300">{kpiMetrics.totalCoils.toLocaleString('en-IN')} Coils</strong>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Graph 1: Admin Wise Sales (Super Admin) OR Sales Center Wise Sales (Admin) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4" />
                <span>{isSuperAdmin ? 'Admin Wise Sales' : 'All Sales Center Wise Sales'}</span>
              </span>
              <span className="text-xs font-mono font-bold text-slate-300">
                ৳{(isSuperAdmin ? kpiMetrics.totalNetSales : scGraphGrandSales).toLocaleString('en-IN')}
              </span>
            </div>
            <InfographicPieDonutGraph
              title="SALES"
              subtitle={isSuperAdmin ? 'ADMIN WISE' : 'ALL SALES CENTERS'}
              centerMetric={
                (isSuperAdmin ? kpiMetrics.totalNetSales : scGraphGrandSales) >= 100000
                  ? `৳${((isSuperAdmin ? kpiMetrics.totalNetSales : scGraphGrandSales) / 100000).toFixed(2)}L`
                  : `৳${((isSuperAdmin ? kpiMetrics.totalNetSales : scGraphGrandSales) / 1000).toFixed(1)}k`
              }
              slices={isSuperAdmin ? adminWiseSalesSlices : salesCenterSalesSlices}
            />
          </div>

          {/* Graph 2: Admin Wise Collections (Super Admin) OR Sales Center Wise Collections (Admin) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4" />
                <span>{isSuperAdmin ? 'Admin Wise Collections' : 'All Sales Center Wise Collections'}</span>
              </span>
              <span className="text-xs font-mono font-bold text-slate-300">
                ৳{(isSuperAdmin ? kpiMetrics.totalCollections : scGraphGrandCollections).toLocaleString('en-IN')}
              </span>
            </div>
            <InfographicPieDonutGraph
              title="COLLECT"
              subtitle={isSuperAdmin ? 'ADMIN WISE' : 'ALL SALES CENTERS'}
              centerMetric={
                (isSuperAdmin ? kpiMetrics.totalCollections : scGraphGrandCollections) >= 100000
                  ? `৳${((isSuperAdmin ? kpiMetrics.totalCollections : scGraphGrandCollections) / 100000).toFixed(2)}L`
                  : `৳${((isSuperAdmin ? kpiMetrics.totalCollections : scGraphGrandCollections) / 1000).toFixed(1)}k`
              }
              slices={isSuperAdmin ? adminWiseCollectionSlices : salesCenterCollectionSlices}
            />
          </div>
        </div>
      </div>

      {/* VIEW TABS BAR */}
      <div className="no-print flex items-center space-x-2 border-b border-white/[0.10] pb-2 overflow-x-auto text-xs">
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('admin_wise')}
            className={`px-4 py-2 font-bold rounded-xl transition-all cursor-pointer flex items-center space-x-1.5 whitespace-nowrap backdrop-blur-md ${
              activeTab === 'admin_wise'
                ? 'bg-cyan-400 text-slate-950 font-black shadow-[0_0_16px_rgba(34,211,238,0.35)] ring-1 ring-cyan-300'
                : 'text-amber-200 bg-white/[0.05] hover:bg-white/[0.10] hover:text-white border border-amber-400/35'
            }`}
          >
            <Crown className={`w-3.5 h-3.5 ${activeTab === 'admin_wise' ? 'text-slate-950' : 'text-amber-300'}`} />
            <span>Admin-Wise Sales &amp; Collection ({adminClusterPerformanceList.length})</span>
            <span className={`text-[9px] px-1.5 py-0.2 rounded font-black uppercase tracking-wider ${activeTab === 'admin_wise' ? 'bg-slate-950/20 text-slate-950' : 'bg-amber-500/20 text-amber-200'}`}>By Admin</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveTab('marketing_officer')}
          className={`px-4 py-2 font-bold rounded-xl transition-all cursor-pointer flex items-center space-x-1.5 whitespace-nowrap backdrop-blur-md ${
            activeTab === 'marketing_officer'
              ? 'bg-cyan-400 text-slate-950 font-black shadow-[0_0_16px_rgba(34,211,238,0.35)]'
              : 'text-slate-200 bg-white/[0.05] hover:bg-white/[0.10] hover:text-white border border-white/[0.12]'
          }`}
        >
          <Users className={`w-3.5 h-3.5 ${activeTab === 'marketing_officer' ? 'text-slate-950' : 'text-amber-300'}`} />
          <span>By Marketing Officer ({salespersonPerformanceList.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sales_center')}
          className={`px-4 py-2 font-bold rounded-xl transition-all cursor-pointer flex items-center space-x-1.5 whitespace-nowrap backdrop-blur-md ${
            activeTab === 'sales_center'
              ? 'bg-cyan-400 text-slate-950 font-black shadow-[0_0_16px_rgba(34,211,238,0.35)]'
              : 'text-slate-200 bg-white/[0.05] hover:bg-white/[0.10] hover:text-white border border-white/[0.12]'
          }`}
        >
          <Building2 className={`w-3.5 h-3.5 ${activeTab === 'sales_center' ? 'text-slate-950' : 'text-cyan-300'}`} />
          <span>{branchPerformanceList.length === 1 ? (branchPerformanceList[0]?.name || 'Madhupur Sales Center') : `All Sales Centers (${branchPerformanceList.length})`}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('party_wise')}
          className={`px-4 py-2 font-bold rounded-xl transition-all cursor-pointer flex items-center space-x-1.5 whitespace-nowrap backdrop-blur-md ${
            activeTab === 'party_wise'
              ? 'bg-cyan-400 text-slate-950 font-black shadow-[0_0_16px_rgba(34,211,238,0.35)]'
              : 'text-slate-200 bg-white/[0.05] hover:bg-white/[0.10] hover:text-white border border-white/[0.12]'
          }`}
        >
          <Layers className={`w-3.5 h-3.5 ${activeTab === 'party_wise' ? 'text-slate-950' : 'text-emerald-300'}`} />
          <span>By Party ({partyWiseList.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('item_wise')}
          className={`px-4 py-2 font-bold rounded-xl transition-all cursor-pointer flex items-center space-x-1.5 whitespace-nowrap backdrop-blur-md ${
            activeTab === 'item_wise'
              ? 'bg-cyan-400 text-slate-950 font-black shadow-[0_0_16px_rgba(34,211,238,0.35)]'
              : 'text-slate-200 bg-white/[0.05] hover:bg-white/[0.10] hover:text-white border border-white/[0.12]'
          }`}
        >
          <Boxes className={`w-3.5 h-3.5 ${activeTab === 'item_wise' ? 'text-slate-950' : 'text-purple-300'}`} />
          <span>Item-Wise Sales ({itemWiseList.length})</span>
        </button>
      </div>

      {/* VIEW 0: ADMIN-WISE MATRIX TABLE */}
      {activeTab === 'admin_wise' && (
        <div className="space-y-4">
          <div className="cyber-glass-card rounded-2xl border border-cyan-500/25 overflow-hidden text-white print:bg-white print:text-black print:border-black">
            <div className="no-print p-3 sm:p-4 cyber-glass-header border-b border-cyan-500/25 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-500/20 text-amber-300 border border-amber-400/30 rounded-xl shadow-xs">
                  <Crown className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-black text-white">Admin-Wise Sales &amp; Collection Statement</h3>
                    <span className="bg-amber-500/20 text-amber-200 border border-amber-400/35 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">
                      Super Admin Exclusive
                    </span>
                  </div>
                  <p className="text-[11px] text-cyan-200/70">
                    Comparative breakdown across all {adminClusterPerformanceList.length} Regional Admins &amp; {branches.length} Assigned Sales Centers.
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/35 text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Export Excel</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintOption('admin_wise')}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-black rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-950" />
                  <span>Print Admin Statement</span>
                </button>
              </div>
            </div>

            {/* Admin-Wise Comparison Table - Fit on one page without scrollbar */}
            <div className="w-full overflow-hidden print:overflow-visible">
              <table className="w-full text-left text-[10px] md:text-[11px] border-collapse table-fixed leading-tight">
                <thead>
                  <tr className="bg-white/[0.07] text-cyan-200 font-bold uppercase text-[9px] md:text-[10px] border-b border-cyan-500/30 print:bg-slate-100 print:text-black">
                    <th className="w-[3%] py-2 px-1 text-center font-bold">SL</th>
                    <th className="w-[16%] py-2 px-1.5 text-left font-bold">Regional Admin</th>
                    <th className="w-[9%] py-2 px-1 text-left font-bold">Zone / Territory</th>
                    <th className="w-[6%] py-2 px-1 text-center font-bold" title="Number of Assigned Sales Centers">Centers</th>
                    <th className="w-[5%] py-2 px-1 text-center font-bold">Bills</th>
                    <th className="w-[6%] py-2 px-1 text-center font-bold">Coils</th>
                    <th className="w-[9%] py-2 px-1.5 text-right font-bold">Target Sales</th>
                    <th className="w-[9.5%] py-2 px-1.5 text-right font-bold text-emerald-300 bg-emerald-500/10 print:bg-transparent print:text-black">Actual Sales</th>
                    <th className="w-[6%] py-2 px-1 text-center font-bold">Achieved</th>
                    <th className="w-[9%] py-2 px-1.5 text-right font-bold">Target Coll.</th>
                    <th className="w-[9.5%] py-2 px-1.5 text-right font-bold text-cyan-300 bg-cyan-500/10 print:bg-transparent print:text-black">Actual Coll.</th>
                    <th className="w-[6%] py-2 px-1 text-center font-bold">Recovery</th>
                    <th className="w-[9%] py-2 px-1.5 text-right font-bold">Net Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.09] bg-white/[0.015] print:bg-white print:text-black">
                  {adminClusterPerformanceList.map((row, idx) => (
                    <tr key={row.adminId || idx} className="hover:bg-cyan-500/[0.06] transition-colors">
                      <td className="py-2 px-1 text-center text-slate-400 font-medium font-mono">{idx + 1}</td>
                      <td className="py-2 px-1.5 font-extrabold text-white print:text-black truncate">
                        <div className="flex items-center space-x-1 truncate">
                          <span className="text-amber-300 font-black shrink-0">👑</span>
                          <span className="text-white print:text-black truncate">{row.adminName}</span>
                        </div>
                        <div className="text-[9px] text-slate-400 font-normal truncate mt-0.5">
                          ID: <span className="font-mono font-bold text-cyan-300">{row.adminUsername}</span> • {row.officersCount} Officers
                        </div>
                      </td>
                      <td className="py-2 px-1 truncate">
                        <span className="bg-white/[0.07] text-cyan-200 px-1.5 py-0.5 rounded text-[9px] font-semibold border border-cyan-500/25 truncate inline-block max-w-full print:bg-slate-100 print:text-black">
                          {row.adminZone}
                        </span>
                      </td>
                      <td className="py-2 px-1 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAdminId(row.adminId);
                            setActiveTab('sales_center');
                          }}
                          className="inline-flex items-center justify-center font-mono font-black text-xs bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/35 px-2.5 py-0.5 rounded-full transition-colors cursor-pointer"
                          title={`Click to view all ${row.branchCount} Assigned Sales Centers in Sales Center tab`}
                        >
                          {row.branchCount}
                        </button>
                      </td>
                      <td className="py-2 px-1 text-center font-mono font-bold text-slate-200 print:text-black">{row.billsCount}</td>
                      <td className="py-2 px-1 text-center font-mono font-black text-amber-300 print:text-black">
                        {row.coilsSold.toLocaleString('en-IN')}
                      </td>
                      <td className="py-2 px-1.5 text-right text-slate-300 font-mono text-[10px]">
                        {row.targetSales > 0 ? `৳${row.targetSales.toLocaleString('en-IN')}` : '-'}
                      </td>
                      <td className="py-2 px-1.5 text-right font-mono font-black text-emerald-300 bg-emerald-500/[0.06] print:bg-transparent print:text-black">
                        ৳{row.actualSales.toLocaleString('en-IN')}
                      </td>
                      <td className="py-2 px-1 text-center">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-extrabold ${
                            row.salesAchievement >= 100
                              ? 'bg-emerald-500/20 text-emerald-200'
                              : row.salesAchievement >= 80
                              ? 'bg-amber-500/20 text-amber-200'
                              : 'bg-rose-500/20 text-rose-200'
                          }`}
                        >
                          {row.salesAchievement}%
                        </span>
                      </td>
                      <td className="py-2 px-1.5 text-right text-slate-300 font-mono text-[10px]">
                        {row.targetCollection > 0 ? `৳${row.targetCollection.toLocaleString('en-IN')}` : '-'}
                      </td>
                      <td className="py-2 px-1.5 text-right font-mono font-black text-cyan-300 bg-cyan-500/[0.06] print:bg-transparent print:text-black">
                        ৳{row.actualCollection.toLocaleString('en-IN')}
                      </td>
                      <td className="py-2 px-1 text-center">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-extrabold ${
                            row.collectionAchievement >= 90
                              ? 'bg-emerald-500/20 text-emerald-200'
                              : row.collectionAchievement >= 70
                              ? 'bg-amber-500/20 text-amber-200'
                              : 'bg-rose-500/20 text-rose-200'
                          }`}
                        >
                          {row.collectionAchievement}%
                        </span>
                      </td>
                      <td className="py-2 px-1.5 text-right font-mono font-black text-rose-300 print:text-black">
                        ৳{row.balance.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-white/[0.06] text-white font-bold border-t border-cyan-500/30 text-[10px] md:text-[11px] print:bg-slate-100 print:text-black">
                  <tr>
                    <td colSpan={3} className="py-2 px-1.5 uppercase text-cyan-200 font-black text-right text-[9px] md:text-[10px]">
                      Grand Total Across All {adminClusterPerformanceList.length} Admins:
                    </td>
                    <td className="py-2 px-1 text-center font-mono text-cyan-300 font-black text-xs">
                      {branches.length}
                    </td>
                    <td className="py-2 px-1 text-center font-mono text-slate-200 font-black">{adminWiseTotals.bills}</td>
                    <td className="py-2 px-1 text-center font-mono text-amber-300 font-black">
                      {adminWiseTotals.coils.toLocaleString('en-IN')}
                    </td>
                    <td className="py-2 px-1.5 text-right font-mono text-slate-300 text-[10px]">
                      ৳{adminWiseTotals.targetSales.toLocaleString('en-IN')}
                    </td>
                    <td className="py-2 px-1.5 text-right font-mono text-emerald-300 font-black">
                      ৳{adminWiseTotals.actualSales.toLocaleString('en-IN')}
                    </td>
                    <td className="py-2 px-1 text-center font-mono text-emerald-300 font-black">
                      {adminWiseTotals.salesAchieved}%
                    </td>
                    <td className="py-2 px-1.5 text-right font-mono text-slate-300 text-[10px]">
                      ৳{adminWiseTotals.targetColl.toLocaleString('en-IN')}
                    </td>
                    <td className="py-2 px-1.5 text-right font-mono text-cyan-300 font-black">
                      ৳{adminWiseTotals.actualColl.toLocaleString('en-IN')}
                    </td>
                    <td className="py-2 px-1 text-center font-mono text-cyan-300 font-black">
                      {adminWiseTotals.collRecovery}%
                    </td>
                    <td className="py-2 px-1.5 text-right font-mono text-rose-300 font-black">
                      ৳{adminWiseTotals.balance.toLocaleString('en-IN')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 1: BY MARKETING OFFICER MATRIX TABLE */}
      {activeTab === 'marketing_officer' && (
        <div className="cyber-glass-card rounded-2xl border border-cyan-500/25 overflow-hidden text-white print:bg-white print:text-black print:border-black">
          <div className="no-print p-3 sm:p-4 cyber-glass-header border-b border-cyan-500/25 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <Users className="w-5 h-5 text-amber-300" />
              <div>
                <h3 className="text-sm font-extrabold text-white">Marketing Officer Sales & Collection Statement</h3>
                <p className="text-[11px] text-cyan-200/70">
                  Total {salespersonPerformanceList.length} officers with targets & actual collection recovery.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => handlePrintOption('marketing_officer')}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-black rounded-xl shadow-2xs transition-colors cursor-pointer"
                title="Print Marketing Officer Statement"
              >
                <Printer className="w-3.5 h-3.5 text-slate-950" />
                <span>Print Table</span>
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-white/[0.07] text-cyan-200 font-bold uppercase text-[10px] border-b border-cyan-500/30 print:bg-slate-100 print:text-black">
                  <th className="p-3 text-center w-10">SL</th>
                  <th className="p-3 w-16">Code</th>
                  <th className="p-3 min-w-[160px]">Marketing Person</th>
                  <th className="p-3 min-w-[170px]">Sales Center</th>
                  <th className="p-3 text-center">Bills</th>
                  <th className="p-3 text-center">Coils</th>
                  <th className="p-3 text-right">Target Sales</th>
                  <th className="p-3 text-right text-emerald-300 bg-emerald-500/10 print:bg-transparent print:text-black">Actual Sales</th>
                  <th className="p-3 text-center">Achieved</th>
                  <th className="p-3 text-right">Target Coll.</th>
                  <th className="p-3 text-right text-cyan-300 bg-cyan-500/10 print:bg-transparent print:text-black">Actual Coll.</th>
                  <th className="p-3 text-center">Recovery</th>
                  <th className="p-3 text-right">Net Balance</th>
                  <th className="p-3 text-center w-14">Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.09] bg-white/[0.015] print:bg-white print:text-black">
                {salespersonPerformanceList.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-cyan-500/[0.06] transition-colors">
                    <td className="p-3 text-center text-slate-400 font-medium font-mono">{idx + 1}</td>
                    <td className="p-3 font-mono font-black text-cyan-300">{row.code}</td>
                    <td className="p-3 font-extrabold text-white print:text-black">
                      <div>{row.name}</div>
                      <div className="text-[10px] text-slate-400 font-normal">{row.designation}</div>
                    </td>
                    <td className="p-3 text-slate-200 font-medium">
                      <span className="bg-white/[0.07] text-cyan-200 px-2 py-0.5 rounded text-[11px] border border-cyan-500/25 print:bg-slate-100 print:text-black">
                        {row.branchName}
                      </span>
                    </td>
                    <td className="p-3 text-center font-mono font-bold text-slate-200 print:text-black">{row.billsCount}</td>
                    <td className="p-3 text-center font-mono font-black text-amber-300 print:text-black">
                      {row.coilsSold.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-right text-slate-300 font-mono">
                      <button
                        type="button"
                        onClick={() => {
                          setTargetModalSpId(row.id);
                          setIsTargetModalOpen(true);
                        }}
                        className="group inline-flex items-center space-x-1 hover:text-cyan-300 transition-colors cursor-pointer"
                        title="Click to set/adjust target for this user"
                      >
                        <span>৳{row.targetSales.toLocaleString('en-IN')}</span>
                        <Edit2 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-cyan-300 transition-opacity" />
                      </button>
                    </td>
                    <td className="p-3 text-right font-black text-emerald-300 font-mono bg-emerald-500/[0.06] print:bg-transparent print:text-black">
                      ৳{row.actualSales.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded font-black text-[10px] border ${
                          row.salesAchievement >= 100
                            ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35'
                            : row.salesAchievement >= 70
                            ? 'bg-amber-500/20 text-amber-200 border-amber-400/35'
                            : 'bg-white/[0.07] text-slate-300 border-cyan-500/25'
                        }`}
                      >
                        {row.salesAchievement}%
                      </span>
                    </td>
                    <td className="p-3 text-right text-slate-300 font-mono">
                      <button
                        type="button"
                        onClick={() => {
                          setTargetModalSpId(row.id);
                          setIsTargetModalOpen(true);
                        }}
                        className="group inline-flex items-center space-x-1 hover:text-cyan-300 transition-colors cursor-pointer"
                        title="Click to set/adjust target for this user"
                      >
                        <span>৳{row.targetCollection.toLocaleString('en-IN')}</span>
                        <Edit2 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-cyan-300 transition-opacity" />
                      </button>
                    </td>
                    <td className="p-3 text-right font-black text-cyan-300 font-mono bg-cyan-500/[0.06] print:bg-transparent print:text-black">
                      ৳{row.actualCollection.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded font-black text-[10px] border ${
                          row.collectionAchievement >= 100
                            ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/35'
                            : 'bg-white/[0.07] text-slate-300 border-cyan-500/25'
                        }`}
                      >
                        {row.collectionAchievement}%
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono font-extrabold text-white print:text-black">
                      ৳{row.balance.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setTargetModalSpId(row.id);
                          setIsTargetModalOpen(true);
                        }}
                        className="p-1.5 text-cyan-300 hover:text-slate-950 hover:bg-cyan-400 rounded-lg transition-colors cursor-pointer inline-flex items-center justify-center border border-cyan-400/35"
                        title="Set / edit target for this marketing officer"
                      >
                        <Target className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {salespersonPerformanceList.length === 0 && (
                  <tr>
                    <td colSpan={14} className="p-8 text-center text-slate-400 italic">
                      No marketing officers found for the selected branch or filters.
                    </td>
                  </tr>
                )}
              </tbody>
              {salespersonPerformanceList.length > 0 && (
                <tfoot>
                  <tr className="bg-white/[0.06] text-white font-black border-t border-cyan-500/30 text-xs print:bg-slate-100 print:text-black">
                    <td colSpan={4} className="p-3 text-right uppercase tracking-wider text-[11px] text-cyan-300">
                      Totals:
                    </td>
                    <td className="p-3 text-center font-mono">{kpiMetrics.billsCount}</td>
                    <td className="p-3 text-center font-mono text-amber-300">
                      {kpiMetrics.totalCoils.toLocaleString('en-IN')} Coils
                    </td>
                    <td className="p-3 text-right font-mono">
                      ৳{kpiMetrics.totalTargetSales.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-right font-mono text-emerald-300">
                      ৳{kpiMetrics.totalNetSales.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-center font-mono text-emerald-300">
                      {kpiMetrics.salesAchievedPercent}%
                    </td>
                    <td className="p-3 text-right font-mono">
                      ৳{kpiMetrics.totalTargetCollection.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-right font-mono text-cyan-300">
                      ৳{kpiMetrics.totalCollections.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-center font-mono text-cyan-300">
                      {kpiMetrics.collectionRecoveryPercent}%
                    </td>
                    <td className="p-3 text-right font-mono text-rose-300">
                      ৳{kpiMetrics.netBalance.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-center font-mono text-slate-400">-</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: SALES CENTER WISE SALES & COLLECTION (STRICTLY ASSIGNED CENTERS) */}
      {activeTab === 'sales_center' && (
        <div className="cyber-glass-card rounded-2xl border border-cyan-500/25 overflow-hidden text-white print:bg-white print:text-black print:border-black">
          <div className="no-print p-3 sm:p-4 cyber-glass-header border-b border-cyan-500/25 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <Building2 className="w-5 h-5 text-cyan-300" />
              <div>
                <h3 className="text-sm font-extrabold text-white">
                  {isSuperAdmin ? 'All Sales Centers Sales & Collection' : 'Sales Center-Wise Sales & Collection (My Assigned Centers)'}
                </h3>
                <p className="text-[11px] text-cyan-200/70">
                  Target &amp; achievement performance across {branchPerformanceList.length} {isSuperAdmin ? 'showroom / sales center' : 'assigned sales center'} locations.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => {
                  const initForm: Record<string, { targetSales: number; targetCollection: number }> = {};
                  branchPerformanceList.forEach((b) => {
                    const existing = scTargets[b.id];
                    initForm[b.id] = {
                      targetSales: existing?.targetSales ?? (period === 'this_year' || period === 'last_year' ? b.targetSales : b.targetSales * 12) ?? 24000000,
                      targetCollection: existing?.targetCollection ?? (period === 'this_year' || period === 'last_year' ? b.targetCollection : b.targetCollection * 12) ?? 20000000
                    };
                  });
                  setScTargetForm(initForm);
                  setIsScTargetModalOpen(true);
                }}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-500/25 hover:bg-indigo-500/40 text-indigo-200 border border-indigo-400/40 text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer"
                title="Set yearly / monthly targets per Sales Center"
              >
                <Target className="w-3.5 h-3.5 text-amber-300" />
                <span>Set Sales Center Targets</span>
              </button>
              <button
                type="button"
                onClick={() => handlePrintOption('sales_center')}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-black rounded-xl shadow-2xs transition-colors cursor-pointer"
                title="Print Sales Centers Report"
              >
                <Printer className="w-3.5 h-3.5 text-slate-950" />
                <span>Print Table</span>
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-white/[0.07] text-cyan-200 font-bold uppercase text-[10px] border-b border-cyan-500/30 print:bg-slate-100 print:text-black">
                  <th className="p-3 text-center w-10">SL</th>
                  <th className="p-3 min-w-[200px]">Sales Center &amp; Area</th>
                  <th className="p-3">Branch In-Charge</th>
                  <th className="p-3 text-center">Bills</th>
                  <th className="p-3 text-center">Total Coils</th>
                  <th className="p-3 text-right">Target Sales</th>
                  <th className="p-3 text-right text-emerald-300 bg-emerald-500/10 print:bg-transparent print:text-black">Total Sale (Tk)</th>
                  <th className="p-3 text-center">Achieved</th>
                  <th className="p-3 text-right">Target Coll.</th>
                  <th className="p-3 text-right text-cyan-300 bg-cyan-500/10 print:bg-transparent print:text-black">Total Collection (Tk)</th>
                  <th className="p-3 text-center">Coll. Ratio %</th>
                  <th className="p-3 text-right">Net Balance (Tk)</th>
                  <th className="p-3 min-w-[160px]">Top Performer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.09] bg-white/[0.015] print:bg-white print:text-black">
                {branchPerformanceList.map((branch, idx) => (
                  <tr key={branch.id} className="hover:bg-cyan-500/[0.06] transition-colors">
                    <td className="p-3 text-center text-slate-400 font-medium font-mono">{idx + 1}</td>
                    <td className="p-3 font-extrabold text-white print:text-black">
                      <div className="flex items-center space-x-2">
                        <Building2 className="w-4 h-4 text-cyan-300 shrink-0" />
                        <div>
                          <div>{branch.name}</div>
                          <div className="text-[10px] text-cyan-300/80 font-medium">Area: {branch.area}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-slate-200 font-semibold">{branch.inChargeName}</td>
                    <td className="p-3 text-center font-mono font-bold text-slate-200">{branch.billsCount}</td>
                    <td className="p-3 text-center font-mono font-black text-amber-300">
                      {branch.totalCoils.toLocaleString('en-IN')} Coils
                    </td>
                    <td className="p-3 text-right font-mono text-slate-300">
                      {branch.targetSales > 0 ? `৳${branch.targetSales.toLocaleString('en-IN')}` : '-'}
                    </td>
                    <td className="p-3 text-right font-black text-emerald-300 font-mono bg-emerald-500/[0.06] print:bg-transparent print:text-black">
                      ৳{branch.totalSales.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-center font-mono">
                      <span className={`px-2 py-0.5 rounded font-black text-[10px] border ${branch.salesAchievement >= 100 ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35' : branch.salesAchievement >= 70 ? 'bg-amber-500/20 text-amber-200 border-amber-400/35' : 'bg-white/[0.07] text-slate-300 border-cyan-500/25'}`}>
                        {branch.salesAchievement}%
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono text-slate-300">
                      {branch.targetCollection > 0 ? `৳${branch.targetCollection.toLocaleString('en-IN')}` : '-'}
                    </td>
                    <td className="p-3 text-right font-black text-cyan-300 font-mono bg-cyan-500/[0.06] print:bg-transparent print:text-black">
                      ৳{branch.totalCollection.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-center font-mono">
                      <span
                        className={`px-2 py-0.5 rounded font-black text-[10px] border ${
                          branch.collectionRatio >= 80
                            ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35'
                            : branch.collectionRatio >= 50
                            ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/35'
                            : 'bg-amber-500/20 text-amber-200 border-amber-400/35'
                        }`}
                      >
                        {branch.collectionRatio.toFixed(1)}%
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono font-extrabold text-white print:text-black">
                      ৳{branch.balance.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-slate-200 font-medium text-[11px]">{branch.topOfficer}</td>
                  </tr>
                ))}
              </tbody>
              {branchPerformanceList.length > 0 && (
                <tfoot>
                  <tr className="bg-white/[0.06] text-white font-black border-t border-cyan-500/30 text-xs print:bg-slate-100 print:text-black">
                    <td colSpan={3} className="p-3 text-right uppercase tracking-wider text-[11px] text-cyan-300">
                      Grand Total ({branchPerformanceList.length} Centers):
                    </td>
                    <td className="p-3 text-center font-mono">
                      {branchPerformanceList.reduce((acc, b) => acc + b.billsCount, 0)}
                    </td>
                    <td className="p-3 text-center font-mono text-amber-300">
                      {branchPerformanceList.reduce((acc, b) => acc + b.totalCoils, 0).toLocaleString('en-IN')} Coils
                    </td>
                    <td className="p-3 text-right font-mono text-slate-300">
                      ৳{branchPerformanceList.reduce((acc, b) => acc + (b.targetSales || 0), 0).toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-right font-mono text-emerald-300">
                      ৳{branchPerformanceList.reduce((acc, b) => acc + b.totalSales, 0).toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-center font-mono text-emerald-300">
                      {(() => {
                        const s = branchPerformanceList.reduce((acc, b) => acc + b.totalSales, 0);
                        const t = branchPerformanceList.reduce((acc, b) => acc + (b.targetSales || 0), 0);
                        return t > 0 ? `${Math.round((s / t) * 100)}%` : '0%';
                      })()}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-300">
                      ৳{branchPerformanceList.reduce((acc, b) => acc + (b.targetCollection || 0), 0).toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-right font-mono text-cyan-300">
                      ৳{branchPerformanceList.reduce((acc, b) => acc + b.totalCollection, 0).toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-center font-mono text-emerald-300">
                      {(() => {
                        const s = branchPerformanceList.reduce((acc, b) => acc + b.totalSales, 0);
                        const c = branchPerformanceList.reduce((acc, b) => acc + b.totalCollection, 0);
                        return s > 0 ? `${((c / s) * 100).toFixed(1)}%` : '0.0%';
                      })()}
                    </td>
                    <td className="p-3 text-right font-mono text-rose-300">
                      ৳{branchPerformanceList.reduce((acc, b) => acc + b.balance, 0).toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-center text-slate-400">-</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: PARTY-WISE BREAKDOWN */}
      {activeTab === 'party_wise' && (
        <div className="cyber-glass-card rounded-2xl border border-cyan-500/25 overflow-hidden text-white print:bg-white print:text-black print:border-black">
          <div className="no-print p-3 sm:p-4 cyber-glass-header border-b border-cyan-500/25 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <Users className="w-5 h-5 text-cyan-300" />
              <div>
                <h3 className="text-sm font-extrabold text-white">Party-Wise Total Sale, Collection & Collection Ratio Statement</h3>
                <p className="text-[11px] text-cyan-200/70">
                  Total {sortedPartyWiseList.length} parties found with Sale, Collection, Collection Ratio % & Net Due. Click any column header to sort.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => handlePrintOption('party_wise')}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-black rounded-xl shadow-2xs transition-colors cursor-pointer"
                title="Print Party-Wise Report"
              >
                <Printer className="w-3.5 h-3.5 text-slate-950" />
                <span>Print Table</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-white/[0.07] text-cyan-200 font-bold uppercase text-[10px] border-b border-cyan-500/30 print:bg-slate-100 print:text-black">
                  {/* SL */}
                  <th
                    onClick={() => handlePartySort('sl')}
                    className="p-3 text-center w-12 cursor-pointer hover:bg-white/[0.12] transition-colors select-none"
                    title="Click to sort by Serial Number"
                  >
                    <div className="inline-flex items-center justify-center">
                      <span>SL</span>
                      {renderPartySortIndicator('sl')}
                    </div>
                  </th>

                  {/* Party / Customer Name */}
                  <th
                    onClick={() => handlePartySort('partyName')}
                    className="p-3 min-w-[210px] cursor-pointer hover:bg-white/[0.12] transition-colors select-none"
                    title="Click to sort by Party / Customer Name"
                  >
                    <div className="inline-flex items-center">
                      <span>Party / Customer Name</span>
                      {renderPartySortIndicator('partyName')}
                    </div>
                  </th>

                  {/* Marketing Person */}
                  <th
                    onClick={() => handlePartySort('salespersonName')}
                    className="p-3 min-w-[140px] cursor-pointer hover:bg-white/[0.12] transition-colors select-none"
                    title="Click to sort by Marketing Person"
                  >
                    <div className="inline-flex items-center">
                      <span>Marketing Person</span>
                      {renderPartySortIndicator('salespersonName')}
                    </div>
                  </th>

                  {/* Sales Center */}
                  <th
                    onClick={() => handlePartySort('branchName')}
                    className="p-3 min-w-[140px] cursor-pointer hover:bg-white/[0.12] transition-colors select-none"
                    title="Click to sort by Sales Center"
                  >
                    <div className="inline-flex items-center">
                      <span>Sales Center</span>
                      {renderPartySortIndicator('branchName')}
                    </div>
                  </th>

                  {/* Bills Count */}
                  <th
                    onClick={() => handlePartySort('billsCount')}
                    className="p-3 text-center cursor-pointer hover:bg-white/[0.12] transition-colors select-none"
                    title="Click to sort by Bills / MR Count"
                  >
                    <div className="inline-flex items-center justify-center">
                      <span>Bills / MR</span>
                      {renderPartySortIndicator('billsCount')}
                    </div>
                  </th>

                  {/* Coils Bought */}
                  <th
                    onClick={() => handlePartySort('coils')}
                    className="p-3 text-center cursor-pointer hover:bg-white/[0.12] transition-colors select-none"
                    title="Click to sort by Coils Bought"
                  >
                    <div className="inline-flex items-center justify-center">
                      <span>Coils</span>
                      {renderPartySortIndicator('coils')}
                    </div>
                  </th>

                  {/* Total Sale (Tk) */}
                  <th
                    onClick={() => handlePartySort('sales')}
                    className="p-3 text-right cursor-pointer hover:bg-white/[0.12] transition-colors select-none bg-emerald-500/10 text-emerald-300 print:bg-transparent print:text-black"
                    title="Click to sort by Total Sale (Tk)"
                  >
                    <div className="inline-flex items-center justify-end">
                      <span>Total Sale (Tk)</span>
                      {renderPartySortIndicator('sales')}
                    </div>
                  </th>

                  {/* Total Collection (Tk) */}
                  <th
                    onClick={() => handlePartySort('collection')}
                    className="p-3 text-right cursor-pointer hover:bg-white/[0.12] transition-colors select-none bg-cyan-500/10 text-cyan-300 print:bg-transparent print:text-black"
                    title="Click to sort by Total Collection (Tk)"
                  >
                    <div className="inline-flex items-center justify-end">
                      <span>Total Collection (Tk)</span>
                      {renderPartySortIndicator('collection')}
                    </div>
                  </th>

                  {/* Collection Ratio (%) */}
                  <th
                    onClick={() => handlePartySort('collectionRatio')}
                    className="p-3 text-center cursor-pointer hover:bg-white/[0.12] transition-colors select-none"
                    title="Click to sort by Collection Ratio (%)"
                  >
                    <div className="inline-flex items-center justify-center">
                      <span>Collection Ratio</span>
                      {renderPartySortIndicator('collectionRatio')}
                    </div>
                  </th>

                  {/* Outstanding Balance (Tk) */}
                  <th
                    onClick={() => handlePartySort('balance')}
                    className="p-3 text-right cursor-pointer hover:bg-white/[0.12] transition-colors select-none"
                    title="Click to sort by Outstanding Balance (Tk)"
                  >
                    <div className="inline-flex items-center justify-end">
                      <span>Net Balance / Due (Tk)</span>
                      {renderPartySortIndicator('balance')}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.09] bg-white/[0.015] print:bg-white print:text-black">
                {sortedPartyWiseList.map((p, idx) => (
                  <tr key={p.partyName + idx} className="hover:bg-cyan-500/[0.06] transition-colors">
                    <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                    <td className="p-3 font-extrabold text-white print:text-black">
                      {onNavigateToParty && p.partyId ? (
                        <button
                          type="button"
                          onClick={() => onNavigateToParty(p.partyId!)}
                          className="text-left hover:text-cyan-300 hover:underline cursor-pointer"
                        >
                          {getPartyDisplayWithAddress(p.partyName)}
                        </button>
                      ) : (
                        getPartyDisplayWithAddress(p.partyName)
                      )}
                    </td>
                    <td className="p-3 text-slate-200 font-semibold">{p.salespersonName || '-'}</td>
                    <td className="p-3 text-slate-300">
                      <span className="bg-white/[0.07] text-cyan-200 px-2 py-0.5 rounded text-[11px] border border-cyan-500/25 print:bg-slate-100 print:text-black">
                        {p.branchName || '-'}
                      </span>
                    </td>
                    <td className="p-3 text-center font-mono font-bold text-slate-200">
                      <span>{p.billsCount}B</span>
                      {p.mrCount > 0 && <span className="text-cyan-300 ml-1">/ {p.mrCount}MR</span>}
                    </td>
                    <td className="p-3 text-center font-mono font-black text-amber-300">
                      {p.coils.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-right font-black text-emerald-300 font-mono bg-emerald-500/[0.06] print:bg-transparent print:text-black">
                      ৳{p.sales.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-right font-black text-cyan-300 font-mono bg-cyan-500/[0.06] print:bg-transparent print:text-black">
                      ৳{p.collection.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-center font-mono">
                      <span
                        className={`px-2 py-0.5 rounded font-black text-[10px] border ${
                          p.collectionRatio >= 85
                            ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35'
                            : p.collectionRatio >= 50
                            ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/35'
                            : p.collectionRatio > 0
                            ? 'bg-amber-500/20 text-amber-200 border-amber-400/35'
                            : 'bg-white/[0.07] text-slate-400 border-cyan-500/20'
                        }`}
                      >
                        {p.collectionRatio.toFixed(1)}%
                      </span>
                    </td>
                    <td className={`p-3 text-right font-mono font-extrabold ${p.balance > 0 ? 'text-rose-300' : 'text-emerald-300'} print:text-black`}>
                      ৳{p.balance.toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
                {sortedPartyWiseList.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-400 italic">
                      No customer sales or collections found for current criteria.
                    </td>
                  </tr>
                )}
              </tbody>
              {sortedPartyWiseList.length > 0 && (
                <tfoot>
                  <tr className="bg-white/[0.06] text-white font-black border-t border-cyan-500/30 text-xs print:bg-slate-100 print:text-black">
                    <td colSpan={4} className="p-3 text-right uppercase tracking-wider text-[11px] text-cyan-300">
                      Party-Wise Grand Totals ({sortedPartyWiseList.length} Parties):
                    </td>
                    <td className="p-3 text-center font-mono">
                      {sortedPartyWiseList.reduce((acc, p) => acc + p.billsCount, 0)}B / {sortedPartyWiseList.reduce((acc, p) => acc + p.mrCount, 0)}MR
                    </td>
                    <td className="p-3 text-center font-mono text-amber-300">
                      {sortedPartyWiseList.reduce((acc, p) => acc + p.coils, 0).toLocaleString('en-IN')} Coils
                    </td>
                    <td className="p-3 text-right font-mono text-emerald-300">
                      ৳{sortedPartyWiseList.reduce((acc, p) => acc + p.sales, 0).toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-right font-mono text-cyan-300">
                      ৳{sortedPartyWiseList.reduce((acc, p) => acc + p.collection, 0).toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-center font-mono text-emerald-300">
                      {(() => {
                        const totS = sortedPartyWiseList.reduce((acc, p) => acc + p.sales, 0);
                        const totC = sortedPartyWiseList.reduce((acc, p) => acc + p.collection, 0);
                        return totS > 0 ? `${((totC / totS) * 100).toFixed(1)}%` : totC > 0 ? '100.0%' : '0.0%';
                      })()}
                    </td>
                    <td className="p-3 text-right font-mono text-rose-300">
                      ৳{sortedPartyWiseList.reduce((acc, p) => acc + p.balance, 0).toLocaleString('en-IN')}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* VIEW 4: ITEM-WISE BREAKDOWN */}
      {activeTab === 'item_wise' && (
        <div className="cyber-glass-card rounded-2xl border border-cyan-500/25 overflow-hidden text-white print:bg-white print:text-black print:border-black">
          <div className="no-print p-3 sm:p-4 cyber-glass-header border-b border-cyan-500/25 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <Boxes className="w-5 h-5 text-purple-300" />
              <div>
                <h3 className="text-sm font-extrabold text-white">Item-Wise Sales Breakdown Statement</h3>
                <p className="text-[11px] text-cyan-200/70">
                  Total {itemWiseList.length} products sold with coils/meters and revenue contribution.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => handlePrintOption('item_wise')}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-black rounded-xl shadow-2xs transition-colors cursor-pointer"
                title="Print Item-Wise Report"
              >
                <Printer className="w-3.5 h-3.5 text-slate-950" />
                <span>Print Table</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-white/[0.07] text-cyan-200 font-bold uppercase text-[10px] border-b border-cyan-500/30 print:bg-slate-100 print:text-black">
                  <th className="p-3 text-center w-10">SL</th>
                  <th className="p-3 min-w-[240px]">Cable Specification / Description</th>
                  <th className="p-3 text-center">Coils Sold</th>
                  <th className="p-3 text-right">Revenue Generated (Tk)</th>
                  <th className="p-3 text-right">% of Total Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.09] bg-white/[0.015] print:bg-white print:text-black">
                {itemWiseList.map((it, idx) => {
                  const percent = kpiMetrics.totalNetSales > 0 ? ((it.revenue / kpiMetrics.totalNetSales) * 100).toFixed(1) : '0.0';
                  const displaySl = it.directorySerial < 9999 ? it.directorySerial : idx + 1;
                  return (
                    <tr key={it.itemId + idx} className="hover:bg-cyan-500/[0.06] transition-colors">
                      <td className="p-3 text-center text-slate-400 font-mono font-bold">{displaySl}</td>
                      <td className="p-3 font-bold text-white print:text-black">
                        <div className="flex items-center gap-2">
                          {it.code && (
                            <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-white/[0.07] text-cyan-200 rounded border border-cyan-500/25 shrink-0 print:bg-slate-100 print:text-black">
                              {it.code}
                            </span>
                          )}
                          <span>{it.description}</span>
                          {it.category && (
                            <span className="text-[10px] text-slate-400 font-normal">
                              ({it.category})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-center font-mono font-black text-amber-300 print:text-black">
                        <div>{it.coilQty.toLocaleString('en-IN')} Coils</div>
                        {it.rawMeterQty > 0 && (
                          <div className="text-[10px] font-normal text-slate-400 font-sans">
                            ({it.rawMeterQty.toLocaleString('en-IN')} meters)
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right font-black text-emerald-300 font-mono print:text-black">
                        ৳{it.revenue.toLocaleString('en-IN')}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-200 print:text-black">
                        {percent}%
                      </td>
                    </tr>
                  );
                })}
                {itemWiseList.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                      No item sales found for current criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bottom Footer Actions Bar */}
      <div className="no-print flex flex-wrap items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => {
            setTargetModalSpId(null);
            setIsTargetModalOpen(true);
          }}
          className="inline-flex items-center space-x-1.5 px-4 py-1.5 bg-indigo-500/26 hover:bg-indigo-500/38 text-indigo-100 text-xs font-bold rounded-full border border-indigo-400/70 shadow-[0_0_18px_rgba(99,102,241,0.34)] backdrop-blur-xl transition-all cursor-pointer"
          title="Set sales and collection targets for all marketing officers"
        >
          <Target className="w-3.5 h-3.5 text-indigo-300" />
          <span>Set Target for All User</span>
        </button>

        <button
          type="button"
          onClick={handleExportExcel}
          className="inline-flex items-center space-x-1.5 px-4 py-1.5 bg-emerald-500/22 hover:bg-emerald-500/32 text-emerald-100 text-xs font-bold rounded-full border border-emerald-400/65 shadow-[0_0_16px_rgba(16,185,129,0.28)] backdrop-blur-xl transition-all cursor-pointer"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300" />
          <span>Export Excel</span>
        </button>

        <button
          type="button"
          onClick={() => handlePrintOption(activeTab)}
          className="inline-flex items-center space-x-1.5 px-4 py-1.5 bg-[#0a2333]/65 hover:bg-white/[0.12] text-white text-xs font-bold rounded-full shadow-[0_0_14px_rgba(251,191,36,0.16)] transition-all cursor-pointer border border-amber-400/50 backdrop-blur-xl"
          title="Print Current Report Option"
        >
          <Printer className="w-3.5 h-3.5 text-amber-300" />
          <span>Print Report</span>
        </button>
      </div>

      {/* Official Signatures Block (Shown Only During Print) */}
      <div className="hidden print:grid grid-cols-4 gap-6 pt-16 mt-8 border-t border-slate-300 text-center text-xs font-bold text-slate-900">
        <div className="border-t border-dashed border-slate-600 pt-1">Prepared By</div>
        <div className="border-t border-dashed border-slate-600 pt-1">Branch In-Charge</div>
        <div className="border-t border-dashed border-slate-600 pt-1">Audit / Accounts</div>
        <div className="border-t border-dashed border-slate-600 pt-1">Managing Director</div>
      </div>

      {/* SET TARGET FOR ALL USERS MODAL */}
      <SetAllTargetsModal
        isOpen={isTargetModalOpen}
        onClose={() => {
          setIsTargetModalOpen(false);
          setTargetModalSpId(null);
        }}
        salespersons={localSalespersons}
        branches={branches}
        onSaveTargets={handleSaveAllTargets}
        initialSelectedSpId={targetModalSpId}
      />

      {/* SET SALES CENTER YEARLY TARGETS MODAL */}
      {isScTargetModalOpen && (
        <div className="no-print fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl border border-cyan-400/35 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-[0_24px_64px_rgba(0,0,0,0.65)] space-y-4 max-h-[85vh] overflow-y-auto text-white">
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
              <div className="flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-base font-black text-white">Set Sales Center Targets</h3>
                  <p className="text-xs text-slate-300">Configure yearly targets per Sales Center (Monthly auto-calculates Yearly / 12).</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsScTargetModalOpen(false)}
                className="px-2.5 py-1 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              {branchPerformanceList.map((b) => {
                const formVal = scTargetForm[b.id] || { targetSales: 24000000, targetCollection: 20000000 };
                return (
                  <div key={b.id} className="p-3 bg-[#081b28] border border-cyan-500/25 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-white">{b.name}</span>
                      <span className="text-cyan-300">Area: {b.area}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Yearly Target Sales (৳)</label>
                        <input
                          type="number"
                          value={formVal.targetSales || ''}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setScTargetForm((prev) => ({
                              ...prev,
                              [b.id]: { ...formVal, targetSales: val }
                            }));
                          }}
                          className="w-full px-2.5 py-1.5 bg-[#061520] border border-cyan-500/30 rounded-lg text-emerald-300 font-mono font-bold focus:outline-none"
                        />
                        <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                          Monthly: ৳{Math.round((formVal.targetSales || 0) / 12).toLocaleString('en-IN')}
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Yearly Target Collection (৳)</label>
                        <input
                          type="number"
                          value={formVal.targetCollection || ''}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setScTargetForm((prev) => ({
                              ...prev,
                              [b.id]: { ...formVal, targetCollection: val }
                            }));
                          }}
                          className="w-full px-2.5 py-1.5 bg-[#061520] border border-emerald-500/30 rounded-lg text-cyan-300 font-mono font-bold focus:outline-none"
                        />
                        <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                          Monthly: ৳{Math.round((formVal.targetCollection || 0) / 12).toLocaleString('en-IN')}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setIsScTargetModalOpen(false)}
                className="px-4 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setScTargets(scTargetForm);
                  try {
                    localStorage.setItem('polycables_salescenter_yearly_targets', JSON.stringify(scTargetForm));
                  } catch {}
                  onSyncCloud?.({ salesCenterTargets: scTargetForm }, true);
                  setIsScTargetModalOpen(false);
                }}
                className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black cursor-pointer"
              >
                Save Targets
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
