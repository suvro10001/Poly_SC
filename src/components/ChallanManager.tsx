import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  DeliveryChallan,
  ChallanLineItem,
  Item,
  Party,
  Salesperson,
  CompanyDetails,
  BillHeader,
  BillLineItem,
  FactoryImportChallan,
  StoredBill,
  BranchLocation,
  AuthUser
} from '../types';
import { formatDateDDMMYY, parseDateToISO, getTodayISO, getTodayDDMMYY } from '../utils/dateUtils';
import { formatDisplayUnit, getItemLiveStock, calculateItemColorStockLedger, formatChallanLineColors } from '../utils/stockHelper';
import { readFileAsDataUrl, compressImageIfNeeded, downloadDataUrl } from '../utils/fileUploadHelper';
import { convertToTakaWords } from '../utils/numberToWords';
import {
  getUserBranch,
  isSuperAdminOrAgm,
  getBranchAddressDetails,
  getUserLoginFilters,
  cleanBranchName,
  filterBranchesForUser,
  filterSalespersonsByBranch,
  isStrictSuperAdmin,
  isAccountsAdmin,
  isAnyAdmin,
  partyMatchesBranch
} from '../utils/branchAccess';
import {
  getSalesCenterPrefix,
  findHeadOfficeBranch,
  withHeadOfficeForAdmin
} from '../utils/salesCenterHelper';
import { defaultBranches } from '../data/defaultData';
import { PolyCablesLogo, PolyCablesEmblem } from './PolyCablesLogo';
import { SlipPadChallanView } from './SlipPadChallanView';
import { SlipPadDocument } from './SlipPadDocument';
import { SlipPadPrintPreviewSettings } from './SlipPadPrintPreviewSettings';
import { PrinterAutoConfigModal } from './PrinterAutoConfigModal';
import { QuickAddItemModal } from './QuickAddItemModal';
import { ColorQuantityModal, ColorBreakdownData } from './ColorQuantityModal';
import { isColorApplicableCable, getCategoryBadgeStyle, getAllCategories } from '../utils/categoryHelper';
import { groupItemsByCategoryOrder } from '../utils/searchHelper';
import { triggerAutoConfiguredPrint, getSavedPrinterConfig } from '../utils/printerAutoConfig';
import { PolyCablesBanner } from './PolyCablesBanner';
import { MnemonicLabel } from './MnemonicLabel';
import { SalesCenterSearchFilter } from './SalesCenterSearchFilter';
import { checkCanTakeEntry } from '../utils/cloudConnection';
import { recordDeletedEntityId, recordDeletedEntityIds, getGlobalDeletedIds } from '../utils/deletedTracker';
import { StandardPeriodFilterBar } from './StandardPeriodFilterBar';
import { StandardPeriodPreset, calculatePeriodDates } from '../utils/standardPeriodHelper';

export interface ChallanHistoryItem {
  id: string;
  timestamp: string;
  challanId?: string;
  challanNo: string;
  partyName: string;
  action: 'created' | 'updated' | 'deleted' | 'billed' | 'proof_uploaded' | 'printed';
  actionTitle: string;
  description: string;
  salesperson?: string;
  totalQuantity?: number;
  totalAmount?: number;
}
import {
  Truck,
  Plus,
  Trash2,
  Edit2,
  Printer,
  Download,
  Calendar,
  Check,
  RotateCcw,
  ArrowLeft,
  ArrowRight,
  Search,
  CheckCircle2,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  X,
  FileCheck,
  Building2,
  Boxes,
  AlertCircle,
  Eye,
  Upload,
  RefreshCw,
  FolderOpen,
  DollarSign,
  FileText,
  FileSpreadsheet,
  Percent,
  History,
  Filter,
  FilterX,
  User,
  Sparkles,
  Sliders,
  Lock,
  Save,
  FileEdit,
  GripVertical,
  UserCheck
} from 'lucide-react';
import { matchesFlexibleSearch, sortItemsCategorySerialWise } from '../utils/searchHelper';

// DPI conversion constant for 5.5" x 8.5" Slip Pad: 96 CSS pixels = 1 inch
const DPI = 96;
const PAD_WIDTH_INCH = 5.5;
const PAD_HEIGHT_INCH = 8.5;
const PAD_WIDTH_PX = PAD_WIDTH_INCH * DPI; // 528px
const PAD_HEIGHT_PX = PAD_HEIGHT_INCH * DPI; // 816px

function splitInWords(wordsText: string, maxLine1Chars: number = 38): { line1: string; line2: string } {
  if (!wordsText) return { line1: '', line2: '' };
  if (wordsText.length <= maxLine1Chars) return { line1: wordsText, line2: '' };

  const parts = wordsText.split(' ');
  let line1 = '';
  let line2 = '';

  for (const part of parts) {
    if ((line1 + (line1 ? ' ' : '') + part).length <= maxLine1Chars && !line2) {
      line1 += (line1 ? ' ' : '') + part;
    } else {
      line2 += (line2 ? ' ' : '') + part;
    }
  }

  return { line1, line2 };
}

// Helper for dynamic font size auto-adjustment so Party Name & Address fit on one line
const getDynamicPartyFontSize = (partyName: string | undefined, baseNum: number = 12) => {
  const name = (partyName || '').trim();
  if (!name) return `${baseNum}px`;
  const len = name.length;
  if (len <= 20) return `${baseNum}px`;
  if (len <= 28) return `${Math.max(10, baseNum - 1)}px`;
  if (len <= 36) return `${Math.max(9.5, baseNum - 2)}px`;
  if (len <= 45) return `${Math.max(8.5, baseNum - 3)}px`;
  return `${Math.max(8, baseNum - 4)}px`;
};

const getDynamicAddressFontSize = (address: string | undefined, baseNum: number = 12) => {
  const addr = (address || '').trim();
  if (!addr) return `${baseNum}px`;
  const len = addr.length;
  if (len <= 26) return `${baseNum}px`;
  if (len <= 38) return `${Math.max(10, baseNum - 1)}px`;
  if (len <= 50) return `${Math.max(9, baseNum - 2)}px`;
  return `${Math.max(8, baseNum - 3)}px`;
};

// Helper to compute next Challan No sequence branch-wise (e.g. HO-C-001, MP-C-001, GP-C-001)
export function computeNextChallanNo(
  list: { challanNo?: string; branchId?: string; branchName?: string }[] = [],
  branch?: BranchLocation | string | null
): string {
  const rawPrefix = branch ? getSalesCenterPrefix(branch).toUpperCase() : '';
  const branchPrefix = rawPrefix && rawPrefix !== 'SC' ? `${rawPrefix}-C` : 'C';
  const branchId = typeof branch === 'object' && branch ? (branch.id || '').trim().toLowerCase() : '';
  const branchName = typeof branch === 'object' && branch ? cleanBranchName(branch.name).toLowerCase() : '';

  let maxNum = 0;
  let countForBranch = 0;
  (list || []).forEach((item) => {
    const val = (item?.challanNo || '').trim().toUpperCase();
    if (branch && branchPrefix !== 'C') {
      const iBranchId = (item?.branchId || '').trim().toLowerCase();
      const iBranchName = cleanBranchName(item?.branchName || '').toLowerCase();
      const matchesPref = val.startsWith(`${rawPrefix}-`);
      const matchesBranch = (branchId && iBranchId === branchId) || (branchName && iBranchName === branchName);
      if (!matchesPref && !matchesBranch) return;
    }
    countForBranch++;
    const match = val.match(/(\d+)\s*$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (!isNaN(n) && n > maxNum) {
        maxNum = n;
      }
    }
  });
  const next = maxNum > 0 ? maxNum + 1 : countForBranch + 1;
  return `${branchPrefix}-${String(next).padStart(3, '0')}`;
}

interface ChallanManagerProps {
  challans: DeliveryChallan[];
  setChallans: React.Dispatch<React.SetStateAction<DeliveryChallan[]>>;
  items: Item[];
  setItems?: React.Dispatch<React.SetStateAction<Item[]>>;
  onAddItem?: (item: Item) => void;
  parties: Party[];
  salespersons?: Salesperson[];
  company: CompanyDetails;
  factoryImports?: FactoryImportChallan[];
  storedBills?: StoredBill[];
  stockReturns?: any[];
  onOpenInvoicerWithBill?: (header: BillHeader, lines: BillLineItem[], challanIdsToUpdate?: string[]) => void;
  currentUser?: AuthUser | null;
  branches?: BranchLocation[];
  onSyncCloud?: (slice: any, immediate?: boolean) => void;
  onBack?: () => void;
  onClose?: () => void;
}

type ChallanSubTab = 'create_challan' | 'challan_list' | 'convert_to_bill' | 'due_register';
type FilterStatus = 'all' | 'unbilled' | 'partial' | 'billed' | 'with_copy' | 'pending_copy';
type SortField = 'date' | 'partyName' | 'address' | 'challanNo' | 'receivedCopy' | 'totalQuantity' | 'dueQuantity' | 'totalAmount' | 'status';

export const ChallanManager: React.FC<ChallanManagerProps> = ({
  challans,
  setChallans,
  items,
  setItems,
  onAddItem,
  parties,
  salespersons = [],
  company,
  factoryImports = [],
  storedBills = [],
  stockReturns = [],
  onOpenInvoicerWithBill,
  currentUser,
  branches = [],
  onSyncCloud,
  onBack,
  onClose
}) => {
  const rawBranchesList = useMemo(() => (branches && branches.length > 0 ? branches : defaultBranches), [branches]);
  const effectiveBranches = useMemo(
    () => withHeadOfficeForAdmin(filterBranchesForUser(rawBranchesList, currentUser, salespersons), currentUser),
    [rawBranchesList, currentUser, salespersons]
  );
  const userBranchInfo = useMemo(() => getUserBranch(currentUser, salespersons, effectiveBranches), [currentUser, salespersons, effectiveBranches]);
  const userLoginFilters = useMemo(() => getUserLoginFilters(currentUser, salespersons, effectiveBranches), [currentUser, salespersons, effectiveBranches]);
  const canViewAllCenters = useMemo(
    () => isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser) || isAnyAdmin(currentUser) || effectiveBranches.length > 1,
    [currentUser, effectiveBranches.length]
  );
  const isBranchLocked = useMemo(
    () => (userLoginFilters.isRestricted || !canViewAllCenters) && effectiveBranches.length <= 1,
    [userLoginFilters.isRestricted, canViewAllCenters, effectiveBranches.length]
  );

  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    const isSuperOrAcc = isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser) || isAnyAdmin(currentUser);
    const allowed = withHeadOfficeForAdmin(
      filterBranchesForUser(branches && branches.length > 0 ? branches : defaultBranches, currentUser, salespersons),
      currentUser
    );
    if (isSuperOrAcc) {
      return 'ALL';
    }
    const init = getUserLoginFilters(currentUser, salespersons, allowed);
    const hasSpecificCenter = Boolean(init.branchId && init.branchId !== 'ALL' && init.branchId.toLowerCase() !== 'all');
    if (hasSpecificCenter && allowed.some((b) => b.id === init.branchId)) {
      return init.branchId!;
    }
    if (init.isRestricted) {
      if (init.branchName && init.branchName !== 'All Sales Centers') {
        const found = allowed.find((b) => b.name.toLowerCase().trim() === init.branchName?.toLowerCase().trim());
        if (found) return found.id;
      }
      if (allowed.length === 1) return allowed[0].id;
      return 'ALL';
    }
    if (currentUser?.branchId && currentUser.branchId !== 'ALL' && allowed.some((b) => b.id === currentUser.branchId)) {
      return currentUser.branchId;
    }
    return allowed[0]?.id || 'ALL';
  });

  const lastChallanUserKeyRef = useRef<string>('');
  useEffect(() => {
    if (effectiveBranches.length === 0) return;
    const userKey = `${currentUser?.username || ''}::${currentUser?.salespersonCode || ''}::${currentUser?.branchId || ''}::${currentUser?.role || ''}`;
    const userChanged = lastChallanUserKeyRef.current !== '' && lastChallanUserKeyRef.current !== userKey;
    const isInitialUser = lastChallanUserKeyRef.current === '';
    lastChallanUserKeyRef.current = userKey;

    const isAdminLike = isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser) || isAnyAdmin(currentUser);
    const hasSpecificCenter = Boolean(
      !isAdminLike &&
        userLoginFilters.branchId &&
        userLoginFilters.branchId !== 'ALL' &&
        userLoginFilters.branchId.toLowerCase() !== 'all' &&
        effectiveBranches.some((b) => b.id === userLoginFilters.branchId)
    );

    if (isBranchLocked) {
      if (hasSpecificCenter) {
        setSelectedBranchId(userLoginFilters.branchId!);
      } else if (userBranchInfo?.branchId && effectiveBranches.some((b) => b.id === userBranchInfo.branchId)) {
        setSelectedBranchId(userBranchInfo.branchId);
      } else if (effectiveBranches.length === 1) {
        setSelectedBranchId(effectiveBranches[0].id);
      }
    } else if (userChanged || (isInitialUser && !selectedBranchId)) {
      if (isAdminLike) {
        setSelectedBranchId('ALL');
      } else if (hasSpecificCenter) {
        setSelectedBranchId(userLoginFilters.branchId!);
      } else if (userBranchInfo?.branchId && effectiveBranches.some((b) => b.id === userBranchInfo.branchId)) {
        setSelectedBranchId(userBranchInfo.branchId);
      }
    } else if (selectedBranchId !== 'ALL' && !effectiveBranches.some((b) => b.id === selectedBranchId)) {
      setSelectedBranchId(
        hasSpecificCenter
          ? userLoginFilters.branchId!
          : isAdminLike
            ? 'ALL'
            : effectiveBranches[0]?.id || 'ALL'
      );
    }
  }, [isBranchLocked, userLoginFilters.branchId, userBranchInfo?.branchId, effectiveBranches, selectedBranchId, currentUser]);

  const [activeSubTab, setActiveSubTab] = useState<ChallanSubTab>('create_challan');

  const handleSubTabChange = (newTab: ChallanSubTab) => {
    const prevScroll = window.scrollY;
    setActiveSubTab(newTab);
    requestAnimationFrame(() => {
      window.scrollTo({ top: prevScroll, behavior: 'instant' as any });
    });
  };
  const [challanFormViewMode, setChallanFormViewMode] = useState<'slip_pad' | 'poly_pad' | 'plain'>('poly_pad');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [partyFilter, setPartyFilter] = useState('all');
  const [partyFilterSearch, setPartyFilterSearch] = useState('');
  const [isPartyFilterOpen, setIsPartyFilterOpen] = useState(false);
  const [partyFilterHighlightIdx, setPartyFilterHighlightIdx] = useState(0);
  const [isShowingAllFilterParties, setIsShowingAllFilterParties] = useState(false);
  const [salespersonFilter, setSalespersonFilter] = useState('all');

  // Expanded Challan Filters
  const [quantityFilter, setQuantityFilter] = useState<'all' | 'has_due' | 'zero_due' | 'high_volume'>('all');
  const [filterItemName, setFilterItemName] = useState('');
  const [minAmountFilter, setMinAmountFilter] = useState('');
  const [maxAmountFilter, setMaxAmountFilter] = useState('');
  const [orderRefFilter, setOrderRefFilter] = useState('');

  // Multi-Selection State for Deletion
  const [selectedChallanIds, setSelectedChallanIds] = useState<string[]>([]);
  const [isBatchDeleteConfirmOpen, setIsBatchDeleteConfirmOpen] = useState(false);

  // Sorting State
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Date Filtering State (Sticky across edits, deletes, and view switches)
  const [datePreset, setDatePreset] = useState<StandardPeriodPreset>(() => {
    try { return (sessionStorage.getItem('polycables_challan_date_preset') as StandardPeriodPreset) || 'this_month'; } catch { return 'this_month'; }
  });
  const [startDate, setStartDate] = useState(() => {
    try {
      const saved = sessionStorage.getItem('polycables_challan_start_date');
      if (saved !== null) return saved;
    } catch {}
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    try {
      const saved = sessionStorage.getItem('polycables_challan_end_date');
      if (saved !== null) return saved;
    } catch {}
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  });
  const [fromDateText, setFromDateText] = useState(() => {
    try {
      const saved = sessionStorage.getItem('polycables_challan_from_text');
      if (saved !== null) return saved;
    } catch {}
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    return formatDateDDMMYY(firstDay);
  });
  const [toDateText, setToDateText] = useState(() => {
    try {
      const saved = sessionStorage.getItem('polycables_challan_to_text');
      if (saved !== null) return saved;
    } catch {}
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    return formatDateDDMMYY(lastDay);
  });
  useEffect(() => {
    try {
      sessionStorage.setItem('polycables_challan_date_preset', datePreset);
      sessionStorage.setItem('polycables_challan_start_date', startDate);
      sessionStorage.setItem('polycables_challan_end_date', endDate);
      sessionStorage.setItem('polycables_challan_from_text', fromDateText);
      sessionStorage.setItem('polycables_challan_to_text', toDateText);
    } catch {}
  }, [datePreset, startDate, endDate, fromDateText, toDateText]);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  // Dedicated In-App Delete Confirmation Modal State
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    id: string;
    challanNo: string;
    partyName: string;
    totalAmount?: number;
    totalCoils?: number;
    isBilled?: boolean;
  } | null>(null);
  const confirmDeleteBtnRef = useRef<HTMLButtonElement>(null);

  // Auto-focus confirm delete button when delete modal opens
  useEffect(() => {
    if (deleteConfirmTarget || isBatchDeleteConfirmOpen) {
      const timer = setTimeout(() => {
        confirmDeleteBtnRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [deleteConfirmTarget, isBatchDeleteConfirmOpen]);

  // Selected Challan for Full Document Modal Preview (Matching Bill Directory)
  const [selectedChallan, setSelectedChallan] = useState<DeliveryChallan | null>(null);

  // Challan Print Preview Modal & Mode State (Plain Paper, Pad Hide Logo, Pad Hide All, Slip Pad)
  const [previewingChallan, setPreviewingChallan] = useState<DeliveryChallan | null>(null);

  const challanBranch = useMemo(() => {
    // 1. If currently previewing or selected challan, respect its exact branch (and return null if 'ALL' or unspecified)
    const activeDoc = previewingChallan || selectedChallan;
    if (activeDoc) {
      const targetBranchId = activeDoc.branchId;
      const targetBranchName = activeDoc.branchName;
      if (
        targetBranchId === 'ALL' ||
        targetBranchId?.toLowerCase() === 'all' ||
        targetBranchName?.toLowerCase().includes('all sales center') ||
        targetBranchName?.toLowerCase().includes('all assigned')
      ) {
        return null;
      }
      if (targetBranchId) {
        const b = effectiveBranches.find((br) => br.id === targetBranchId);
        if (b) return b;
      }
      if (targetBranchName) {
        const b = effectiveBranches.find(
          (br) => cleanBranchName(br.name).toLowerCase() === cleanBranchName(targetBranchName).toLowerCase()
        );
        if (b) return b;
      }
      if (selectedBranchId && selectedBranchId !== 'ALL') {
        return effectiveBranches.find((br) => br.id === selectedBranchId) || null;
      }
      return null;
    }

    // 2. If All Sales Centers is selected in filter/selector, return null so NO address is displayed
    if (!selectedBranchId || selectedBranchId === 'ALL' || selectedBranchId.toLowerCase() === 'all') {
      return null;
    }

    // 3. Selected specific sales center
    const selected = effectiveBranches.find((br) => br.id === selectedBranchId);
    if (selected) return selected;

    return null;
  }, [previewingChallan, selectedChallan, selectedBranchId, effectiveBranches]);

  const challanBranchAddress = useMemo(() => {
    return getBranchAddressDetails(challanBranch, company.phone, company.email);
  }, [challanBranch, company.phone, company.email]);
  const [quickPrintMenuChallanId, setQuickPrintMenuChallanId] = useState<string | null>(null);
  const [challanPadHeaderMode, setChallanPadHeaderMode] = useState<'plain' | 'hide_logo' | 'hide_all' | 'slip_pad'>(() => {
    const saved = (localStorage.getItem('polycables_challan_pad_header_mode') as 'plain' | 'hide_logo' | 'hide_all' | 'slip_pad') ||
      (localStorage.getItem('polycables_pad_header_mode') as 'plain' | 'hide_logo' | 'hide_all' | 'slip_pad') ||
      'plain';
    return (saved === 'plain' || saved === 'hide_logo' || saved === 'hide_all' || saved === 'slip_pad') ? saved : 'plain';
  });
  const [challanPreviewZoom, setChallanPreviewZoom] = useState<'80%' | '100%' | '115%'>('100%');
  const [showPrinterAutoConfigModal, setShowPrinterAutoConfigModal] = useState(false);
  const [showSlipPadSettingsInPreview, setShowSlipPadSettingsInPreview] = useState<boolean>(false);

  // Color Quantity Input Modal State
  const [colorModalState, setColorModalState] = useState<{
    isOpen: boolean;
    lineIndex: number;
    item: Item;
    unit: string;
    initialColors?: Partial<ColorBreakdownData>;
    initialTotalQty?: number;
    stockColors?: Partial<ColorBreakdownData>;
  } | null>(null);

  // Slip Pad Alignment & Precision States for Challan Print Preview
  const [slipPadTopOffset, setSlipPadTopOffset] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('polycables_slip_pad_top_offset');
      return saved !== null ? parseFloat(saved) : 0.5;
    } catch { return 0.5; }
  });
  const [slipPadLeftOffset, setSlipPadLeftOffset] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('polycables_slip_pad_left_offset');
      return saved !== null ? parseFloat(saved) : 0.0;
    } catch { return 0.0; }
  });
  const [slipPadFontScale, setSlipPadFontScale] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('polycables_slip_pad_font_scale');
      return saved !== null ? parseInt(saved, 10) : 100;
    } catch { return 100; }
  });
  const [slipPadRowHeight, setSlipPadRowHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('polycables_slip_pad_row_height');
      return saved !== null ? parseInt(saved, 10) : 18;
    } catch { return 18; }
  });
  const [slipPadShowTableHeader, setSlipPadShowTableHeader] = useState<boolean>(() => {
    try {
      return localStorage.getItem('polycables_slip_pad_show_th') === 'true';
    } catch { return false; }
  });
  const [slipPadTotalRows, setSlipPadTotalRows] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('polycables_slip_pad_total_rows');
      return saved !== null ? parseInt(saved, 10) : 15;
    } catch { return 15; }
  });
  const [slipPadShowBgImage, setSlipPadShowBgImage] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('polycables_slip_pad_show_bg');
      return saved !== null ? saved === 'true' : true;
    } catch { return true; }
  });
  const [slipPadBgOpacity, setSlipPadBgOpacity] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('polycables_slip_pad_bg_opacity');
      return saved !== null ? parseFloat(saved) : 0.35;
    } catch { return 0.35; }
  });
  const [slipPadCustomBgUrl, setSlipPadCustomBgUrl] = useState<string | null>(() => {
    try {
      return localStorage.getItem('polycables_slip_pad_custom_bg_challan') || localStorage.getItem('polycables_slip_pad_custom_bg') || null;
    } catch { return null; }
  });
  const [slipPadShowGuides, setSlipPadShowGuides] = useState<boolean>(false);

  // Individual Element Shifts (Synchronized with BillInvoiceView and SlipPadDocument)
  const [dateShiftX, setDateShiftX] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_shift_date_x'); return s !== null ? parseFloat(s) : 0; } catch { return 0; }
  });
  const [dateShiftY, setDateShiftY] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_shift_date_y'); return s !== null ? parseFloat(s) : 0; } catch { return 0; }
  });
  const [partyNameShiftX, setPartyNameShiftX] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_shift_name_x'); return s !== null ? parseFloat(s) : 0; } catch { return 0; }
  });
  const [partyNameShiftY, setPartyNameShiftY] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_shift_name_y'); return s !== null ? parseFloat(s) : 0; } catch { return 0; }
  });
  const [phoneShiftX, setPhoneShiftX] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_shift_phone_x'); return s !== null ? parseFloat(s) : 0; } catch { return 0; }
  });
  const [phoneShiftY, setPhoneShiftY] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_shift_phone_y'); return s !== null ? parseFloat(s) : 0; } catch { return 0; }
  });
  const [addressShiftX, setAddressShiftX] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_shift_address_x'); return s !== null ? parseFloat(s) : 0; } catch { return 0; }
  });
  const [addressShiftY, setAddressShiftY] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_shift_address_y'); return s !== null ? parseFloat(s) : 0; } catch { return 0; }
  });
  const [colSlShiftX, setColSlShiftX] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_shift_col_sl_x'); return s !== null ? parseFloat(s) : 0; } catch { return 0; }
  });
  const [colSlShiftY, setColSlShiftY] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_shift_col_sl_y'); return s !== null ? parseFloat(s) : 0; } catch { return 0; }
  });
  const [colDescShiftX, setColDescShiftX] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_shift_col_desc_x'); return s !== null ? parseFloat(s) : 0; } catch { return 0; }
  });
  const [colDescShiftY, setColDescShiftY] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_shift_col_desc_y'); return s !== null ? parseFloat(s) : 0; } catch { return 0; }
  });
  const [colQtyShiftX, setColQtyShiftX] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_shift_col_qty_x'); return s !== null ? parseFloat(s) : 0; } catch { return 0; }
  });
  const [colQtyShiftY, setColQtyShiftY] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_shift_col_qty_y'); return s !== null ? parseFloat(s) : 0; } catch { return 0; }
  });
  const [colRateShiftX, setColRateShiftX] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_shift_col_rate_x'); return s !== null ? parseFloat(s) : 0; } catch { return 0; }
  });
  const [colRateShiftY, setColRateShiftY] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_shift_col_rate_y'); return s !== null ? parseFloat(s) : 0; } catch { return 0; }
  });
  const [colAmountShiftX, setColAmountShiftX] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_shift_col_amount_x'); return s !== null ? parseFloat(s) : 0; } catch { return 0; }
  });
  const [colAmountShiftY, setColAmountShiftY] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_shift_col_amount_y'); return s !== null ? parseFloat(s) : 0; } catch { return 0; }
  });
  const [inWordsShiftX, setInWordsShiftX] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_shift_in_words_x'); return s !== null ? parseFloat(s) : 0; } catch { return 0; }
  });
  const [inWordsShiftY, setInWordsShiftY] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_shift_in_words_y'); return s !== null ? parseFloat(s) : 0; } catch { return 0; }
  });

  // Section Offsets
  const [metaTopOffsetPx, setMetaTopOffsetPx] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_meta_top_offset') || localStorage.getItem('polycables_offset_meta_top'); return s !== null ? parseFloat(s) : 0; } catch { return 0; }
  });
  const [tableTopOffsetPx, setTableTopOffsetPx] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_table_top_offset') || localStorage.getItem('polycables_offset_table_top'); return s !== null ? parseFloat(s) : 0; } catch { return 0; }
  });
  const [footerTopOffsetPx, setFooterTopOffsetPx] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_footer_top_offset') || localStorage.getItem('polycables_offset_footer_top'); return s !== null ? parseFloat(s) : 0; } catch { return 0; }
  });

  // Individual Font Sizes
  const [partyNameFontSize, setPartyNameFontSize] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_font_party_name'); return s !== null ? parseFloat(s) : 12; } catch { return 12; }
  });
  const [dateFontSize, setDateFontSize] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_font_date'); return s !== null ? parseFloat(s) : 11; } catch { return 11; }
  });
  const [phoneFontSize, setPhoneFontSize] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_font_phone'); return s !== null ? parseFloat(s) : 11; } catch { return 11; }
  });
  const [addressFontSize, setAddressFontSize] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_font_address'); return s !== null ? parseFloat(s) : 11; } catch { return 11; }
  });
  const [inWordsFontSize, setInWordsFontSize] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_font_in_words'); return s !== null ? parseFloat(s) : 10; } catch { return 10; }
  });

  // Column Widths
  const [colWidthSl, setColWidthSl] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_col_sl') || localStorage.getItem('polycables_col_w_sl'); return s !== null ? parseFloat(s) : 38; } catch { return 38; }
  });
  const [colWidthQty, setColWidthQty] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_col_qty') || localStorage.getItem('polycables_col_w_qty'); return s !== null ? parseFloat(s) : 42; } catch { return 42; }
  });
  const [colWidthRate, setColWidthRate] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_col_rate') || localStorage.getItem('polycables_col_w_rate'); return s !== null ? parseFloat(s) : 54; } catch { return 54; }
  });
  const [colWidthAmount, setColWidthAmount] = useState<number>(() => {
    try { const s = localStorage.getItem('polycables_col_amount') || localStorage.getItem('polycables_col_w_amt'); return s !== null ? parseFloat(s) : 76; } catch { return 76; }
  });

  const updateSlipPadTopOffset = (val: number) => {
    const clamped = Math.max(-0.5, Math.min(3.5, Number(val.toFixed(2))));
    setSlipPadTopOffset(clamped);
    try { localStorage.setItem('polycables_slip_pad_top_offset', String(clamped)); } catch {}
  };
  const updateSlipPadLeftOffset = (val: number) => {
    const clamped = Math.max(-1.5, Math.min(1.5, Number(val.toFixed(2))));
    setSlipPadLeftOffset(clamped);
    try { localStorage.setItem('polycables_slip_pad_left_offset', String(clamped)); } catch {}
  };
  const updateSlipPadFontScale = (val: number) => {
    const clamped = Math.max(70, Math.min(140, Math.round(val)));
    setSlipPadFontScale(clamped);
    try { localStorage.setItem('polycables_slip_pad_font_scale', String(clamped)); } catch {}
  };
  const updateSlipPadRowHeight = (val: number) => {
    const clamped = Math.max(14, Math.min(32, Math.round(val)));
    setSlipPadRowHeight(clamped);
    try { localStorage.setItem('polycables_slip_pad_row_height', String(clamped)); } catch {}
  };
  const updateTotalRows = (val: number) => {
    setSlipPadTotalRows(val);
    try { localStorage.setItem('polycables_slip_pad_total_rows', String(val)); } catch {}
  };
  const handleUploadSlipPadCustomBg = async (file: File) => {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setSlipPadCustomBgUrl(dataUrl);
      try {
        localStorage.setItem('polycables_slip_pad_custom_bg_challan', dataUrl);
      } catch {}
      showToast('Custom Slip Pad background image uploaded!', 'success');
    } catch (err) {
      showToast('Could not load image file.', 'error');
    }
  };
  const handleResetSlipPadCalibration = () => {
    updateSlipPadTopOffset(0.5);
    updateSlipPadLeftOffset(0.0);
    updateSlipPadFontScale(100);
    updateSlipPadRowHeight(18);
    updateTotalRows(15);
    showToast('Slip Pad settings reset to default', 'success');
  };
  const [quickAddModalOpen, setQuickAddModalOpen] = useState(false);
  const [quickAddInitialData, setQuickAddInitialData] = useState<{
    name?: string;
    rate?: number;
    unit?: string;
    rowIndex?: number;
  }>({});

  // Handle keyboard shortcuts when Print Preview Modal is active (Enter -> Print Now, Alt+A -> Auto-Config, Esc -> Close)
  useEffect(() => {
    if (!previewingChallan) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setShowPrinterAutoConfigModal(true);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        triggerAutoConfiguredPrint(challanPadHeaderMode === 'slip_pad' ? 'slip_pad' : 'challan');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setPreviewingChallan(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewingChallan, challanPadHeaderMode]);

  // Close quick print menu when clicking/touching outside or pressing Escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest('.quick-print-menu-container')) {
        setQuickPrintMenuChallanId(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setQuickPrintMenuChallanId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const previewTotalCoils = previewingChallan
    ? (previewingChallan.lines && previewingChallan.lines.length > 0
        ? previewingChallan.lines.reduce((s, l) => s + (Number(l.coilQty) || 0), 0)
        : (Number(previewingChallan.totalQuantity) || 0))
    : 0;

  const previewSubtotal = previewingChallan
    ? (Number(previewingChallan.totalAmount) || (previewingChallan.lines && previewingChallan.lines.length > 0 ? previewingChallan.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0) : 0))
    : 0;

  useEffect(() => {
    try {
      localStorage.setItem('polycables_challan_pad_header_mode', challanPadHeaderMode);
    } catch (e) {
      // ignore
    }
  }, [challanPadHeaderMode]);

  // Received Copy Zoom Modal Viewer
  const [viewingReceivedCopyChallan, setViewingReceivedCopyChallan] = useState<DeliveryChallan | null>(null);
  const [receivedCopyZoom, setReceivedCopyZoom] = useState<'fit' | '100%' | '150%'>('fit');
  const [isProcessingCopyForId, setIsProcessingCopyForId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetUploadChallanIdRef = useRef<string | null>(null);

  const [toastMessage, setToastMessage] = useState<{ text: string; type?: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Helper to log audit events into persistent storage for Challan History
  const logChallanAudit = (entry: Omit<ChallanHistoryItem, 'id' | 'timestamp'>) => {
    try {
      const raw = localStorage.getItem('polycables_challan_history_logs');
      const list: ChallanHistoryItem[] = raw ? JSON.parse(raw) : [];
      const newEntry: ChallanHistoryItem = {
        ...entry,
        id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString()
      };
      list.unshift(newEntry);
      localStorage.setItem('polycables_challan_history_logs', JSON.stringify(list.slice(0, 500)));
    } catch (e) {
      console.error('Failed to log challan audit event', e);
    }
  };

  // Helper to create an empty line item
  const createEmptyChallanLine = (slNo: number): ChallanLineItem => ({
    id: `cline-${Date.now()}-${slNo}-${Math.random().toString(36).substr(2, 4)}`,
    slNo,
    itemDescription: '',
    sizeSpec: '',
    coilQty: 0,
    billedQty: 0,
    dueQty: 0,
    unit: '',
    rate: 0,
    amount: 0
  });

  const createInitialChallanLines = (count: number = 5): ChallanLineItem[] => {
    return Array.from({ length: Math.max(1, count) }, (_, i) => createEmptyChallanLine(i + 1));
  };

  // ----------------------------------------------------
  // FORM STATE FOR CREATE / EDIT CHALLAN
  // ----------------------------------------------------
  const [editingChallanId, setEditingChallanId] = useState<string | null>(null);
  const [challanNo, setChallanNo] = useState<string>(() => {
    const isAdminLike = isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser) || isAnyAdmin(currentUser);
    const allowed = withHeadOfficeForAdmin(
      filterBranchesForUser(branches && branches.length > 0 ? branches : defaultBranches, currentUser, salespersons),
      currentUser
    );
    const initBranch = isAdminLike
      ? null
      : (allowed.find((b) => b.id === currentUser?.branchId) || allowed[0] || null);
    return computeNextChallanNo(challans, initBranch);
  });
  const [challanDate, setChallanDate] = useState<string>(() => formatDateDDMMYY(new Date().toISOString()));
  const [orderNumber, setOrderNumber] = useState<string>('');
  const [orderDate, setOrderDate] = useState<string>('');
  const [refNo, setRefNo] = useState<string>('');
  const [salesmanCode, setSalesmanCode] = useState<string>('');
  const [salespersonName, setSalespersonName] = useState<string>('');
  const [partyName, setPartyName] = useState<string>('');
  const [partyAddress, setPartyAddress] = useState<string>('');
  const [partyPhone, setPartyPhone] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [challanDiscountPercent, setChallanDiscountPercent] = useState<number>(0);
  const [challanDiscountAmount, setChallanDiscountAmount] = useState<number>(0);
  const [challanAdvanceAmount, setChallanAdvanceAmount] = useState<number>(0);
  const [formLines, setFormLines] = useState<ChallanLineItem[]>(() => createInitialChallanLines(5));

  const [activeItemDropdownIdx, setActiveItemDropdownIdx] = useState<number | null>(null);
  const [itemHighlightIdx, setItemHighlightIdx] = useState<number>(0);
  const [showPartyDropdown, setShowPartyDropdown] = useState(false);
  const [partySearchQuery, setPartySearchQuery] = useState('');
  const [partyHighlightIdx, setPartyHighlightIdx] = useState<number>(0);
  const [isShowingAllFormParties, setIsShowingAllFormParties] = useState(false);

  // Input refs for keyboard navigation (Enter key workflow)
  const orderDateInputRef = useRef<HTMLInputElement>(null);
  const challanDateInputRef = useRef<HTMLInputElement>(null);
  const partyNameInputRef = useRef<HTMLInputElement>(null);
  const discountPercentInputRef = useRef<HTMLInputElement>(null);
  const discountAmountInputRef = useRef<HTMLInputElement>(null);
  const advanceAmountInputRef = useRef<HTMLInputElement>(null);
  const remarksInputRef = useRef<HTMLInputElement>(null);
  const saveChallanBtnRef = useRef<HTMLButtonElement>(null);
  const saveAndNewBtnRef = useRef<HTMLButtonElement>(null);
  const partyDropdownRef = useRef<HTMLDivElement>(null);
  const itemDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPartyDropdown || !partyDropdownRef.current) return;
    const el = partyDropdownRef.current.querySelector('[data-challan-party-highlighted="true"]') as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [partyHighlightIdx, showPartyDropdown]);

  useEffect(() => {
    if (activeItemDropdownIdx === null || !itemDropdownRef.current) return;
    const el = itemDropdownRef.current.querySelector('[data-challan-item-highlighted="true"]') as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [itemHighlightIdx, activeItemDropdownIdx]);

  // Auto-focus first date in order line when opening Create Delivery Challan
  useEffect(() => {
    if (activeSubTab === 'create_challan') {
      const timer = setTimeout(() => {
        if (orderDateInputRef.current) {
          orderDateInputRef.current.focus();
          orderDateInputRef.current.select();
        } else {
          const el = document.getElementById('challan-order-date-input') as HTMLInputElement | null;
          if (el) {
            el.focus();
            el.select();
          }
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeSubTab]);

  // Global click outside listener to auto-close dynamic search dropdowns
  useEffect(() => {
    const handleChallanOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (!target.closest('.challan-filter-party-container')) {
        setIsPartyFilterOpen(false);
      }
      if (!target.closest('.challan-party-container')) {
        setShowPartyDropdown(false);
      }
      if (!target.closest('.challan-item-container') && !target.closest('.challan-item-cell-container')) {
        setActiveItemDropdownIdx(null);
      }
    };

    const handleChallanKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPartyFilterOpen(false);
        setShowPartyDropdown(false);
        setActiveItemDropdownIdx(null);
      }
    };

    document.addEventListener('mousedown', handleChallanOutsideClick, true);
    document.addEventListener('touchstart', handleChallanOutsideClick, true);
    document.addEventListener('keydown', handleChallanKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleChallanOutsideClick, true);
      document.removeEventListener('touchstart', handleChallanOutsideClick, true);
      document.removeEventListener('keydown', handleChallanKeyDown);
    };
  }, []);

  // ----------------------------------------------------
  // CONVERT CHALLAN TO BILL STATE
  // ----------------------------------------------------
  const [selectedConvertParty, setSelectedConvertParty] = useState<string>('');
  const [billQuantities, setBillQuantities] = useState<Record<string, number>>({});

  // Reset Challan Form
  const resetChallanForm = () => {
    setEditingChallanId(null);
    setChallanNo(computeNextChallanNo(challans, challanBranch));
    setChallanDate(formatDateDDMMYY(new Date().toISOString()));
    setOrderNumber('');
    setOrderDate('');
    setRefNo('');
    setSalesmanCode('');
    setSalespersonName('');
    setPartyName('');
    setPartyAddress('');
    setPartyPhone('');
    setRemarks('');
    setChallanDiscountPercent(0);
    setChallanDiscountAmount(0);
    setChallanAdvanceAmount(0);
    setFormLines(createInitialChallanLines(5));
    setShowPartyDropdown(false);
    setActiveItemDropdownIdx(null);
  };

  // Load existing challan for editing
  const handleEditChallan = (c: DeliveryChallan) => {
    const dueQ = c.dueQuantity ?? Math.max(0, c.totalQuantity - (c.billedQuantity || 0));
    if (c.status === 'billed' || dueQ === 0) {
      showToast(`⚠️ Locked Read-Only Mode: Challan #${c.challanNo} is fully billed and locked in read-only mode. It is not editable.`, 'error');
      return;
    }
    setEditingChallanId(c.id);
    setChallanNo(c.challanNo);
    setChallanDate(c.date);
    setOrderNumber(c.orderNumber || '');
    setOrderDate(c.orderDate || '');
    setRefNo(c.refNo || '');
    setSalesmanCode(c.salesmanCode || '');
    setSalespersonName(c.salespersonName || '');
    setPartyName(c.partyName);
    setPartyAddress(c.address || '');
    setPartyPhone(c.phone || '');
    setRemarks(c.remarks || '');
    setChallanDiscountPercent(c.discountPercent || 0);
    setChallanDiscountAmount(c.discountAmount || 0);
    setChallanAdvanceAmount(c.advanceAmount || 0);

    const loadedLines: ChallanLineItem[] = c.lines.map((l, idx) => ({
      ...l,
      slNo: idx + 1,
      dueQty: l.coilQty - (l.billedQty || 0)
    }));
    if (loadedLines.length === 0) {
      loadedLines.push(createEmptyChallanLine(1));
    }
    setFormLines(loadedLines);
    if (selectedChallan) setSelectedChallan(null);
    setActiveSubTab('create_challan');
  };

  // Bidirectional Discount Handlers
  const handleDiscountPercentChange = (percent: number) => {
    const gross = formLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const p = Math.max(0, Math.min(100, percent));
    setChallanDiscountPercent(p);
    setChallanDiscountAmount(Math.round((gross * p) / 100));
  };

  const handleDiscountAmountChange = (amt: number) => {
    const gross = formLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const a = Math.max(0, amt);
    setChallanDiscountAmount(a);
    if (gross > 0) {
      const calcPct = Number(((a / gross) * 100).toFixed(2));
      setChallanDiscountPercent(calcPct);
    } else {
      setChallanDiscountPercent(0);
    }
  };

  // Party Selection Handler
  const handleSelectParty = (p: Party) => {
    setPartyName(p.name);
    setPartyAddress(p.address || '');
    setPartyPhone(p.phone || '');
    if (p.salesmanCode) {
      setSalesmanCode(p.salesmanCode);
      const sp = salespersons.find((s) => s.code.toLowerCase() === p.salesmanCode?.toLowerCase());
      if (sp) setSalespersonName(sp.name);
    }
    setPartySearchQuery('');
    setIsShowingAllFormParties(false);
    setShowPartyDropdown(false);

    setTimeout(() => {
      const firstItemInput = document.getElementById('challan-item-desc-0') as HTMLInputElement | null;
      if (firstItemInput) {
        firstItemInput.focus();
        firstItemInput.select();
      }
    }, 50);
  };

  // Reliable challan line item focus & selection helper with retry
  const focusChallanLineItemInput = (targetIdx: number) => {
    let attempts = 0;
    const maxAttempts = 10;
    const tryFocus = () => {
      attempts++;
      const nextItemInput = document.getElementById(`challan-item-desc-${targetIdx}`) as HTMLInputElement | null;
      if (nextItemInput) {
        nextItemInput.focus();
        if (typeof nextItemInput.select === 'function') {
          nextItemInput.select();
        }
        return true;
      }
      if (attempts < maxAttempts) {
        setTimeout(tryFocus, attempts * 30);
      }
      return false;
    };

    if (!tryFocus()) {
      setTimeout(tryFocus, 25);
    }
  };

  // Confirm colors & quantity from ColorQuantityModal for Challan Line
  const handleConfirmColorModal = (totalQty: number, colors: ColorBreakdownData) => {
    if (!colorModalState) return;
    const { lineIndex, item, unit } = colorModalState;

    const colorParts: string[] = [];
    if (colors.red && Number(colors.red) > 0) colorParts.push(`R:${colors.red}`);
    if (colors.blk && Number(colors.blk) > 0) colorParts.push(`B:${colors.blk}`);
    if (colors.yel && Number(colors.yel) > 0) colorParts.push(`Y:${colors.yel}`);
    if (colors.grn && Number(colors.grn) > 0) colorParts.push(`G:${colors.grn}`);
    if (colors.blu && Number(colors.blu) > 0) colorParts.push(`BL:${colors.blu}`);
    if (colors.others && Number(colors.others) > 0) colorParts.push(`Other:${colors.others}`);
    const colorRemarksStr = colorParts.join(', ');

    setFormLines((prev) => {
      const updated = [...prev];
      const currentLine = updated[lineIndex] || createEmptyChallanLine(lineIndex + 1);
      const rate = item.rate || 0;

      updated[lineIndex] = {
        ...currentLine,
        itemId: item.id,
        itemDescription: item.name,
        sizeSpec: colorRemarksStr || item.sizeSpec || '',
        unit: unit,
        rate: rate,
        coilQty: totalQty,
        billedQty: currentLine.billedQty || 0,
        dueQty: Math.max(0, totalQty - (currentLine.billedQty || 0)),
        amount: Math.round(totalQty * rate),
        colors: {
          red: Number(colors.red) || 0,
          blk: Number(colors.blk) || 0,
          yel: Number(colors.yel) || 0,
          grn: Number(colors.grn) || 0,
          blu: Number(colors.blu) || 0,
          others: Number(colors.others) || 0,
        },
        isSpecialItem: item.isSpecialItem,
        baseItemId: item.baseItemId,
        stockMultiplier: item.stockMultiplier
      };

      if (lineIndex >= updated.length - 1) {
        updated.push(createEmptyChallanLine(updated.length + 1));
      }
      return updated;
    });

    setColorModalState(null);

    // Auto focus and select next item line input
    focusChallanLineItemInput(lineIndex + 1);
  };

  // Item Selection Handler (Opens Color Quantity Modal strictly for BYA and Aluminium, without RE items)
  const handleSelectItem = (idx: number, item: Item) => {
    let unit = formatDisplayUnit(item.unit || 'Coils', 1);
    if (item.isSpecialItem || item.unit === 'Bobin') {
      unit = 'Bobin';
    }

    setFormLines((prev) => {
      const updated = [...prev];
      const currentLine = updated[idx] || createEmptyChallanLine(idx + 1);
      let qty = currentLine.coilQty > 0 ? currentLine.coilQty : 0;
      const rate = item.rate || 0;

      updated[idx] = {
        ...currentLine,
        itemId: item.id,
        itemDescription: item.name,
        sizeSpec: item.sizeSpec || '',
        unit: unit,
        rate: rate,
        coilQty: qty,
        billedQty: currentLine.billedQty || 0,
        dueQty: Math.max(0, qty - (currentLine.billedQty || 0)),
        amount: Math.round(qty * rate),
        isSpecialItem: item.isSpecialItem,
        baseItemId: item.baseItemId,
        stockMultiplier: item.stockMultiplier
      };

      if (idx === updated.length - 1) {
        updated.push(createEmptyChallanLine(updated.length + 1));
      }
      return updated;
    });

    setActiveItemDropdownIdx(null);
    setItemHighlightIdx(0);

    const isColorReq = isColorApplicableCable(item);
    if (isColorReq) {
      const stockLedger = calculateItemColorStockLedger(item, factoryImports, storedBills, stockReturns);
      // Open Color Quantity Modal only for BYA and Aluminium items
      setColorModalState({
        isOpen: true,
        lineIndex: idx,
        item,
        unit,
        initialColors: formLines[idx]?.colors,
        initialTotalQty: formLines[idx]?.coilQty || 0,
        stockColors: stockLedger.closing
      });
    } else {
      setTimeout(() => {
        const qtyEl = (document.getElementById(`challan-item-qty-${idx}`) || document.getElementById(`challan-line-qty-${idx}`)) as HTMLInputElement | null;
        if (qtyEl) {
          qtyEl.focus();
          qtyEl.select();
        }
      }, 30);
    }
  };

  const handleLineQtyChange = (idx: number, newQty: number) => {
    setFormLines((prev) => {
      const updated = [...prev];
      const qty = Math.max(0, newQty);
      const billed = updated[idx]?.billedQty || 0;
      const rate = updated[idx]?.rate || 0;
      if (updated[idx]) {
        updated[idx] = {
          ...updated[idx],
          coilQty: qty,
          dueQty: Math.max(0, qty - billed),
          amount: Math.round(qty * rate)
        };
      }
      return updated;
    });
  };

  const handleLineRateChange = (idx: number, newRate: number) => {
    setFormLines((prev) => {
      const updated = [...prev];
      const rate = Math.max(0, newRate);
      const qty = updated[idx]?.coilQty || 0;
      if (updated[idx]) {
        updated[idx] = {
          ...updated[idx],
          rate: rate,
          amount: Math.round(qty * rate)
        };
      }
      return updated;
    });
  };

  const handleAddLine = () => {
    setFormLines((prev) => [...prev, createEmptyChallanLine(prev.length + 1)]);
  };

  const handleDeleteLine = (idx: number) => {
    setFormLines((prev) => {
      const updated = prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, slNo: i + 1 }));
      if (updated.length === 0) {
        return [createEmptyChallanLine(1)];
      }
      return updated;
    });
  };

  const handleMoveLine = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= formLines.length) return;
    setFormLines((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated.map((l, i) => ({ ...l, slNo: i + 1 }));
    });
  };

  const getCurrentFormChallan = (): DeliveryChallan => {
    const gross = formLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const validLines = formLines.filter((l) => l.itemDescription.trim() || (Number(l.coilQty) || 0) > 0 || (Number(l.amount) || 0) > 0);
    const discAmt = Math.round((gross * (challanDiscountPercent || 0)) / 100);
    const net = Math.max(0, Math.round(gross - discAmt));
    return {
      id: editingChallanId || `temp-form-${Date.now()}`,
      challanNo: challanNo || computeNextChallanNo(challans, challanBranch),
      date: challanDate || formatDateDDMMYY(new Date().toISOString()),
      branchId: challanBranch?.id,
      branchName: challanBranch?.name,
      orderNumber: orderNumber || '',
      orderDate: orderDate || '',
      salesmanCode: salesmanCode || '',
      salespersonName: salespersonName || '',
      partyName: partyName || 'Cash / Customer',
      address: partyAddress || '',
      phone: partyPhone || '',
      remarks: remarks || '',
      lines: validLines.length > 0 ? validLines.map((l, i) => ({ ...l, slNo: i + 1 })) : formLines.slice(0, 12),
      totalQuantity: formLines.reduce((s, l) => s + (Number(l.coilQty) || 0), 0),
      totalAmount: gross,
      discountPercent: challanDiscountPercent || 0,
      discountAmount: discAmt,
      netAmount: net,
      advanceAmount: challanAdvanceAmount || 0,
      dueAmount: Math.max(0, net - (challanAdvanceAmount || 0)),
      dueBalance: Math.max(0, net - (challanAdvanceAmount || 0)),
      inWords: convertToTakaWords(net),
      status: 'unbilled',
      savedAt: new Date().toISOString()
    };
  };

  // Save Delivery Challan (with auto-preview for print support)
  const handleSaveChallan = (e?: React.FormEvent, autoPreviewForPrint: boolean = false, keepInCreateMode: boolean = false) => {
    if (e) e.preventDefault();
    if (!checkCanTakeEntry('Challan', showToast)) {
      return;
    }
    if (!partyName.trim()) {
      showToast('Please specify a party / customer name', 'error');
      const pInput = document.getElementById('challan-party-name-input');
      if (pInput) pInput.focus();
      return;
    }

    const validLines = formLines.filter((l) => l.itemDescription.trim() && (Number(l.coilQty) || 0) > 0);
    if (validLines.length === 0) {
      showToast('Please add at least one item with valid quantity', 'error');
      const firstQty = document.getElementById('challan-item-qty-0');
      if (firstQty) firstQty.focus();
      return;
    }

    const totalQty = validLines.reduce((s, l) => s + (Number(l.coilQty) || 0), 0);
    const billedQty = validLines.reduce((s, l) => s + (Number(l.billedQty) || 0), 0);
    const dueQty = Math.max(0, totalQty - billedQty);
    const totalAmt = validLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const billedAmt = validLines.reduce((s, l) => s + (Number(l.billedQty) || 0) * (Number(l.rate) || 0), 0);
    const dueAmt = Math.max(0, totalAmt - billedAmt);

    const discountAmt = challanDiscountAmount > 0
      ? challanDiscountAmount
      : Math.round((totalAmt * challanDiscountPercent) / 100);
    const netAmt = Math.max(0, Math.round(totalAmt - discountAmt));
    const finalDueBal = Math.max(0, Math.round(netAmt - challanAdvanceAmount));
    const words = convertToTakaWords(netAmt);

    let status: 'unbilled' | 'partial' | 'billed' = 'unbilled';
    if (billedQty >= totalQty && totalQty > 0) {
      status = 'billed';
    } else if (billedQty > 0) {
      status = 'partial';
    }

    const existing = editingChallanId ? challans.find((c) => c.id === editingChallanId) : null;
    const selectedBranchObj = selectedBranchId !== 'ALL' ? effectiveBranches.find((b) => b.id === selectedBranchId) : null;
    const matchedSp = salespersons.find(
      (s) => (s.code || '').toLowerCase() === salesmanCode.trim().toLowerCase() || (s.name || '').toLowerCase() === salespersonName.trim().toLowerCase()
    );
    const matchedParty = parties.find(
      (p) => (p.name || '').trim().toLowerCase() === partyName.trim().toLowerCase()
    );

    const resolvedBranchId = existing?.branchId || selectedBranchObj?.id || challanBranch?.id || userBranchInfo?.branchId || matchedSp?.branchId || matchedParty?.branchId;
    const resolvedBranchName = existing?.branchName || selectedBranchObj?.name || challanBranch?.name || userBranchInfo?.branchName || matchedSp?.branchName;

    const newChallanRecord: DeliveryChallan = {
      id: editingChallanId || `challan-${Date.now()}`,
      challanNo: challanNo.trim() || computeNextChallanNo(challans, selectedBranchObj || challanBranch),
      date: challanDate.trim() || formatDateDDMMYY(new Date().toISOString()),
      branchId: resolvedBranchId,
      branchName: resolvedBranchName,
      orderNumber: orderNumber.trim(),
      orderDate: orderDate.trim(),
      refNo: refNo.trim(),
      salesmanCode: salesmanCode.trim(),
      salespersonName: salespersonName.trim(),
      partyName: partyName.trim(),
      address: partyAddress.trim(),
      phone: partyPhone.trim(),
      lines: validLines.map((l, i) => ({
        ...l,
        slNo: i + 1,
        dueQty: Math.max(0, l.coilQty - (l.billedQty || 0))
      })),
      totalQuantity: totalQty,
      billedQuantity: billedQty,
      dueQuantity: dueQty,
      totalAmount: totalAmt,
      discountPercent: challanDiscountPercent,
      discountAmount: discountAmt,
      netAmount: netAmt,
      advanceAmount: challanAdvanceAmount,
      dueBalance: finalDueBal,
      inWords: words,
      billedAmount: billedAmt,
      dueAmount: dueAmt,
      status: status,
      remarks: remarks.trim(),
      savedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (editingChallanId) {
      setChallans((prev) => {
        const next = prev.map((c) => (c.id === editingChallanId ? newChallanRecord : c));
        try { localStorage.setItem('polycables_delivery_challans', JSON.stringify(next)); } catch {}
        onSyncCloud?.({ deliveryChallans: next }, true);
        return next;
      });
      logChallanAudit({
        challanId: newChallanRecord.id,
        challanNo: newChallanRecord.challanNo,
        partyName: newChallanRecord.partyName,
        action: 'updated',
        actionTitle: 'Challan Modified',
        description: `Updated Delivery Challan #${newChallanRecord.challanNo} for ${newChallanRecord.partyName} with ${newChallanRecord.totalQuantity} coils.`,
        salesperson: newChallanRecord.salespersonName || newChallanRecord.salesmanCode,
        totalQuantity: newChallanRecord.totalQuantity,
        totalAmount: newChallanRecord.totalAmount
      });
      showToast(`Challan ${newChallanRecord.challanNo} updated successfully!`);
    } else {
      setChallans((prev) => {
        const next = [newChallanRecord, ...prev];
        try { localStorage.setItem('polycables_delivery_challans', JSON.stringify(next)); } catch {}
        onSyncCloud?.({ deliveryChallans: next }, true);
        return next;
      });
      logChallanAudit({
        challanId: newChallanRecord.id,
        challanNo: newChallanRecord.challanNo,
        partyName: newChallanRecord.partyName,
        action: 'created',
        actionTitle: 'Challan Issued',
        description: `Created new Delivery Challan #${newChallanRecord.challanNo} for ${newChallanRecord.partyName} (${newChallanRecord.totalQuantity} coils).`,
        salesperson: newChallanRecord.salespersonName || newChallanRecord.salesmanCode,
        totalQuantity: newChallanRecord.totalQuantity,
        totalAmount: newChallanRecord.totalAmount
      });
      showToast(`Challan ${newChallanRecord.challanNo} saved successfully! New challan ready.`, 'success');
    }

    try {
      window.dispatchEvent(
        new CustomEvent('polycables_giant_success', {
          detail: {
            message: editingChallanId ? 'Challan Updated Successfully!' : 'Challan Saved Successfully!'
          }
        })
      );
    } catch {}

    resetChallanForm();

    if (autoPreviewForPrint) {
      setPreviewingChallan(newChallanRecord);
      showToast(`Challan ${newChallanRecord.challanNo} saved! Opening print preview...`, 'success');
      setTimeout(() => {
        triggerAutoConfiguredPrint(challanPadHeaderMode === 'slip_pad' ? 'slip_pad' : 'challan');
      }, 400);
    } else if (keepInCreateMode) {
      setActiveSubTab('create_challan');
      setTimeout(() => {
        const orderDateInput = document.getElementById('challan-order-date-input') as HTMLInputElement | null;
        if (orderDateInput) {
          orderDateInput.focus();
          orderDateInput.select();
        } else {
          const partyInput = document.getElementById('challan-party-name-input') as HTMLInputElement | null;
          if (partyInput) {
            partyInput.focus();
            partyInput.select();
          }
        }
      }, 60);
    } else {
      setActiveSubTab('challan_list');
    }
  };

  // Delete Challan Trigger
  const handleDeleteChallan = (id: string) => {
    const target = challans.find((c) => c.id === id);
    if (!target) return;
    const dueQ = target.dueQuantity ?? Math.max(0, target.totalQuantity - (target.billedQuantity || 0));
    const isBilled = target.status === 'billed' || dueQ === 0;
    const totalCoils = target.lines && target.lines.length > 0
      ? target.lines.reduce((s, l) => s + (Number(l.coilQty) || 0), 0)
      : (Number(target.totalQuantity) || 0);
    const totalAmount = Number(target.totalAmount) || (target.lines && target.lines.length > 0 ? target.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0) : 0);
    setDeleteConfirmTarget({
      id: target.id,
      challanNo: target.challanNo,
      partyName: target.partyName,
      totalAmount,
      totalCoils,
      isBilled
    });
  };

  // Execute Confirmed Delete
  const executeConfirmDelete = () => {
    if (!deleteConfirmTarget) return;
    if (!checkCanTakeEntry('Delete Challan', showToast)) {
      return;
    }
    const target = challans.find((c) => c.id === deleteConfirmTarget.id);
    const targetId = deleteConfirmTarget.id;
    recordDeletedEntityId(targetId);
    if (deleteConfirmTarget?.challanNo) {
      recordDeletedEntityId(deleteConfirmTarget.challanNo);
    }
    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ ids: [targetId, deleteConfirmTarget?.challanNo].filter(Boolean), type: 'challan' })
    }).catch(() => {});

    if (target) {
      try {
        const savedTrashed = localStorage.getItem('polycables_trashed_challans');
        const list = savedTrashed ? JSON.parse(savedTrashed) : [];
        list.push(target);
        localStorage.setItem('polycables_trashed_challans', JSON.stringify(list));
      } catch (err) {
        console.error('Failed to save trashed challan', err);
      }
      logChallanAudit({
        challanId: target.id,
        challanNo: target.challanNo,
        partyName: target.partyName,
        action: 'deleted',
        actionTitle: 'Challan Trashed',
        description: `Moved Delivery Challan #${target.challanNo} for ${target.partyName} to trash.`,
        salesperson: target.salespersonName || target.salesmanCode,
        totalQuantity: target.totalQuantity,
        totalAmount: target.totalAmount
      });
    }
    setChallans((prev) => {
      const next = prev.filter((c) => c.id !== targetId);
      try { localStorage.setItem('polycables_delivery_challans', JSON.stringify(next)); } catch {}
      onSyncCloud?.({ deliveryChallans: next, deletedEntityIds: getGlobalDeletedIds() }, true);
      return next;
    });
    setSelectedChallanIds((prev) => prev.filter((id) => id !== targetId));
    if (selectedChallan && selectedChallan.id === targetId) setSelectedChallan(null);
    showToast(`Challan ${deleteConfirmTarget.challanNo} moved to trash.`);
    setDeleteConfirmTarget(null);
  };

  // Toggle Single Row Selection
  const handleToggleSelectChallan = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedChallanIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Toggle Select All Rows
  const handleToggleSelectAll = () => {
    if (selectedChallanIds.length > 0 && selectedChallanIds.length === filteredChallans.length) {
      setSelectedChallanIds([]);
    } else {
      setSelectedChallanIds(filteredChallans.map((c) => c.id));
    }
  };

  // Clear Selection
  const handleClearSelection = () => {
    setSelectedChallanIds([]);
  };

  // Trigger Batch Delete Selected Challans
  const handleDeleteSelectedChallans = () => {
    if (selectedChallanIds.length === 0) return;
    setIsBatchDeleteConfirmOpen(true);
  };

  // Execute Confirmed Batch Delete
  const executeConfirmBatchDelete = () => {
    if (selectedChallanIds.length === 0) {
      setIsBatchDeleteConfirmOpen(false);
      return;
    }
    if (!checkCanTakeEntry('Batch Delete Challans', showToast)) {
      setIsBatchDeleteConfirmOpen(false);
      return;
    }
    const toTrash = challans.filter((c) => selectedChallanIds.includes(c.id));
    if (toTrash.length === 0) {
      setIsBatchDeleteConfirmOpen(false);
      return;
    }

    const trashedIds = toTrash.map((c) => c.id);
    recordDeletedEntityIds(trashedIds);
    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ ids: trashedIds, type: 'challan' })
    }).catch(() => {});

    try {
      const savedTrashed = localStorage.getItem('polycables_trashed_challans');
      const list = savedTrashed ? JSON.parse(savedTrashed) : [];
      const merged = [...list, ...toTrash];
      localStorage.setItem('polycables_trashed_challans', JSON.stringify(merged));
    } catch (err) {
      console.error('Failed to trash selected challans', err);
    }
    toTrash.forEach((c) => {
      logChallanAudit({
        challanId: c.id,
        challanNo: c.challanNo,
        partyName: c.partyName,
        action: 'deleted',
        actionTitle: 'Batch Trashed',
        description: `Challan #${c.challanNo} deleted in multi-selection batch.`,
        totalQuantity: c.totalQuantity,
        totalAmount: c.totalAmount
      });
    });
    setChallans((prev) => {
      const next = prev.filter((c) => !trashedIds.includes(c.id));
      try { localStorage.setItem('polycables_delivery_challans', JSON.stringify(next)); } catch {}
      onSyncCloud?.({ deliveryChallans: next, deletedEntityIds: getGlobalDeletedIds() }, true);
      return next;
    });
    if (selectedChallan && trashedIds.includes(selectedChallan.id)) {
      setSelectedChallan(null);
    }
    showToast(`Deleted ${toTrash.length} delivery challan(s) successfully.`);
    setSelectedChallanIds([]);
    setIsBatchDeleteConfirmOpen(false);
  };

  // Deduplicate Challans
  const handleDeduplicateChallans = () => {
    const seen = new Set<string>();
    const uniqueList: DeliveryChallan[] = [];
    let dupsRemoved = 0;

    for (const c of challans) {
      const key = `${(c.challanNo || '').trim().toLowerCase()}::${(c.partyName || '').trim().toLowerCase()}::${c.totalAmount}::${c.date}`;
      if (seen.has(key)) {
        dupsRemoved++;
      } else {
        seen.add(key);
        uniqueList.push(c);
      }
    }

    if (dupsRemoved > 0) {
      setChallans(uniqueList);
      showToast(`Removed ${dupsRemoved} duplicate delivery challan(s).`);
    } else {
      showToast('No duplicate challans detected.');
    }
  };

  // ----------------------------------------------------
  // RECEIVED COPY ATTACHMENT LOGIC
  // ----------------------------------------------------
  const handleTriggerUpload = (challanId: string) => {
    targetUploadChallanIdRef.current = challanId;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const challanId = targetUploadChallanIdRef.current;
    if (!file || !challanId) return;

    try {
      setIsProcessingCopyForId(challanId);
      const rawDataUrl = await readFileAsDataUrl(file);
      const optimizedDataUrl = await compressImageIfNeeded(rawDataUrl, 1600, 1600, 0.85);
      const nowIso = new Date().toISOString();

      let targetChallan: DeliveryChallan | undefined;

      setChallans((prev) =>
        prev.map((c) => {
          if (c.id === challanId) {
            targetChallan = c;
            return {
              ...c,
              receivedCopy: optimizedDataUrl,
              receivedCopyName: file.name,
              receivedCopyDate: nowIso
            };
          }
          return c;
        })
      );

      if (targetChallan) {
        logChallanAudit({
          challanId: targetChallan.id,
          challanNo: targetChallan.challanNo,
          partyName: targetChallan.partyName,
          action: 'proof_uploaded',
          actionTitle: 'Proof of Delivery Attached',
          description: `Uploaded customer signed received copy (${file.name}) for Challan #${targetChallan.challanNo}.`,
          salesperson: targetChallan.salespersonName || targetChallan.salesmanCode
        });
      }

      if (selectedChallan && selectedChallan.id === challanId) {
        setSelectedChallan({
          ...selectedChallan,
          receivedCopy: optimizedDataUrl,
          receivedCopyName: file.name,
          receivedCopyDate: nowIso
        });
      }

      if (viewingReceivedCopyChallan && viewingReceivedCopyChallan.id === challanId) {
        setViewingReceivedCopyChallan({
          ...viewingReceivedCopyChallan,
          receivedCopy: optimizedDataUrl,
          receivedCopyName: file.name,
          receivedCopyDate: nowIso
        });
      }

      showToast('Received copy attached successfully!');
    } catch (err: any) {
      console.error('Error attaching received copy:', err);
      showToast(`Upload failed: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setIsProcessingCopyForId(null);
      targetUploadChallanIdRef.current = null;
      if (e.target) e.target.value = '';
    }
  };

  const handleRemoveReceivedCopy = (challanId: string) => {
    const target = challans.find((c) => c.id === challanId);
    setChallans((prev) =>
      prev.map((c) =>
        c.id === challanId
          ? {
              ...c,
              receivedCopy: undefined,
              receivedCopyName: undefined,
              receivedCopyDate: undefined
            }
          : c
      )
    );

    if (target) {
      logChallanAudit({
        challanId: target.id,
        challanNo: target.challanNo,
        partyName: target.partyName,
        action: 'updated',
        actionTitle: 'Proof Removed',
        description: `Removed received copy attachment from Challan #${target.challanNo}.`,
        salesperson: target.salespersonName || target.salesmanCode
      });
    }

    if (selectedChallan && selectedChallan.id === challanId) {
      setSelectedChallan({
        ...selectedChallan,
        receivedCopy: undefined,
        receivedCopyName: undefined,
        receivedCopyDate: undefined
      });
    }

    if (viewingReceivedCopyChallan && viewingReceivedCopyChallan.id === challanId) {
      setViewingReceivedCopyChallan(null);
    }

    showToast('Received copy removed.');
  };

  // Metrics
  const countWithCopy = challans.filter((c) => Boolean(c.receivedCopy)).length;
  const countPendingCopy = challans.length - countWithCopy;

  const summaryMetrics = useMemo(() => {
    let totalChallans = challans.length;
    let totalDelivered = 0;
    let totalBilled = 0;
    let totalDue = 0;
    let totalValue = 0;
    let unbilledCount = 0;
    let partialCount = 0;
    let billedCount = 0;

    challans.forEach((c) => {
      totalDelivered += c.totalQuantity || 0;
      totalBilled += c.billedQuantity || 0;
      totalDue += c.dueQuantity || Math.max(0, c.totalQuantity - (c.billedQuantity || 0));
      totalValue += c.totalAmount || 0;
      if (c.status === 'unbilled') unbilledCount++;
      else if (c.status === 'partial') partialCount++;
      else if (c.status === 'billed') billedCount++;
    });

    return {
      totalChallans,
      totalDelivered,
      totalBilled,
      totalDue,
      totalValue,
      unbilledCount,
      partialCount,
      billedCount
    };
  }, [challans]);

  // Unique Parties for Dropdown Filter
  const uniqueParties = useMemo(() => {
    const map = new Map<string, number>();
    challans.forEach((c) => {
      const p = (c.partyName || '').trim();
      if (p) map.set(p, (map.get(p) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [challans]);

  // Filtered Parties for the Dynamic Party Filter in Directory
  const filteredFilterParties = useMemo(() => {
    if (isShowingAllFilterParties || !partyFilterSearch.trim()) {
      return uniqueParties;
    }
    const q = partyFilterSearch.toLowerCase().trim();
    return uniqueParties.filter((p) => p.name.toLowerCase().includes(q));
  }, [uniqueParties, partyFilterSearch, isShowingAllFilterParties]);

  // Unique Salespersons for Dropdown Filter (scoped to selected / allowed Sales Center)
  const branchFilteredSalespersons = useMemo(
    () => filterSalespersonsByBranch(salespersons, selectedBranchId, effectiveBranches, currentUser),
    [salespersons, selectedBranchId, effectiveBranches, currentUser]
  );

  const branchFilteredParties = useMemo(() => {
    if (selectedBranchId && selectedBranchId !== 'ALL') {
      return parties.filter((p) => partyMatchesBranch(p, selectedBranchId, effectiveBranches, salespersons));
    }
    if (!isStrictSuperAdmin(currentUser) && !isAccountsAdmin(currentUser) && effectiveBranches.length > 0) {
      return parties.filter((p) =>
        effectiveBranches.some((ab) => partyMatchesBranch(p, ab.id, effectiveBranches, salespersons))
      );
    }
    return parties;
  }, [parties, selectedBranchId, effectiveBranches, salespersons, currentUser]);

  const uniqueSalespersons = useMemo(() => {
    const map = new Map<string, number>();
    const allowedSpNames = new Set(branchFilteredSalespersons.map((s) => s.name.trim().toLowerCase()));
    const allowedSpCodes = new Set(branchFilteredSalespersons.map((s) => (s.code || '').trim().toLowerCase()).filter(Boolean));
    const branchChallans = (selectedBranchId && selectedBranchId !== 'ALL')
      ? challans.filter((c) => c.branchId === selectedBranchId)
      : challans;

    branchFilteredSalespersons.forEach((s) => {
      if (s.name) map.set(s.name, 0);
    });

    branchChallans.forEach((c) => {
      const spName = (c.salespersonName || '').trim();
      const spCode = (c.salesmanCode || '').trim();
      const matched = branchFilteredSalespersons.find(
        (s) =>
          (spCode && (s.code || '').trim().toLowerCase() === spCode.toLowerCase()) ||
          (spName && s.name.trim().toLowerCase() === spName.toLowerCase())
      );
      if (matched) {
        map.set(matched.name, (map.get(matched.name) || 0) + 1);
      } else if ((isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser)) && selectedBranchId === 'ALL') {
        const sp = spName || spCode;
        if (sp && (allowedSpNames.size === 0 || allowedSpNames.has(sp.toLowerCase()) || allowedSpCodes.has(sp.toLowerCase()))) {
          map.set(sp, (map.get(sp) || 0) + 1);
        }
      }
    });

    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [challans, selectedBranchId, branchFilteredSalespersons, currentUser]);

  // Handle Sort Toggle
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Handle Quick Date Preset Click
  const handleDatePresetChange = (preset: StandardPeriodPreset) => {
    setDatePreset(preset);
    if (preset === 'all') {
      setFromDateText('');
      setToDateText('');
      setStartDate('');
      setEndDate('');
      return;
    }
    if (preset === 'custom') {
      return;
    }
    const range = calculatePeriodDates(preset);
    setFromDateText(range.startDate);
    setToDateText(range.endDate);
    setStartDate(parseDateToISO(range.startDate) || '');
    setEndDate(parseDateToISO(range.endDate) || '');
  };

  const handleFromDateInputChange = (val: string) => {
    setFromDateText(val);
    setDatePreset('custom');
    const trimmed = val.trim();
    if (!trimmed) {
      setStartDate('');
      return;
    }
    const iso = parseDateToISO(trimmed);
    if (iso && iso.length === 10) {
      setStartDate(iso);
    }
    // "any where from date if i input, to date by default today set"
    if (!toDateText || !endDate) {
      setToDateText(getTodayDDMMYY());
      setEndDate(getTodayISO());
    }
  };

  const handleToDateInputChange = (val: string) => {
    setToDateText(val);
    setDatePreset('custom');
    const trimmed = val.trim();
    if (!trimmed) {
      setEndDate('');
      return;
    }
    const iso = parseDateToISO(trimmed);
    if (iso && iso.length === 10) {
      setEndDate(iso);
    }
  };

  // Unique Items present across all Challans for quick filter
  const uniqueChallanItems = useMemo(() => {
    const map = new Map<string, number>();
    challans.forEach((c) => {
      (c.lines || []).forEach((l) => {
        const desc = (l.itemDescription || '').trim();
        if (desc) map.set(desc, (map.get(desc) || 0) + 1);
      });
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [challans]);

  // Reset all search and filters (reverts to all-time / clean)
  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setPartyFilter('all');
    setPartyFilterSearch('');
    setIsPartyFilterOpen(false);
    setIsShowingAllFilterParties(false);
    setSalespersonFilter('all');
    setDatePreset('all');
    setFromDateText('');
    setToDateText('');
    setStartDate('');
    setEndDate('');
    setQuantityFilter('all');
    setFilterItemName('');
    setMinAmountFilter('');
    setMaxAmountFilter('');
    setOrderRefFilter('');
  };

  const hasActiveFilters = Boolean(
    search.trim() ||
    statusFilter !== 'all' ||
    partyFilter !== 'all' ||
    salespersonFilter !== 'all' ||
    datePreset !== 'all' ||
    fromDateText ||
    toDateText ||
    startDate ||
    endDate ||
    quantityFilter !== 'all' ||
    filterItemName.trim() ||
    minAmountFilter.trim() ||
    maxAmountFilter.trim() ||
    orderRefFilter.trim()
  );

  const activeFiltersCount = [
    Boolean(search.trim()),
    statusFilter !== 'all',
    partyFilter !== 'all',
    salespersonFilter !== 'all',
    datePreset !== 'all' || Boolean(fromDateText || toDateText || startDate || endDate),
    quantityFilter !== 'all',
    Boolean(filterItemName.trim()),
    Boolean(minAmountFilter.trim() || maxAmountFilter.trim()),
    Boolean(orderRefFilter.trim())
  ].filter(Boolean).length;

  // Pending / Unbilled Challans Count (excludes fully billed challans)
  const pendingChallansCount = useMemo(() => {
    return challans.filter((c) => {
      if (selectedBranchId !== 'ALL') {
        const targetBranch = effectiveBranches.find((b) => b.id === selectedBranchId);
        const branchMatch = (c.branchId && c.branchId === selectedBranchId) ||
          (targetBranch && c.branchName && (
            c.branchName.toLowerCase().includes(targetBranch.name.toLowerCase()) ||
            targetBranch.name.toLowerCase().includes(c.branchName.toLowerCase())
          ));
        if (!branchMatch) return false;
      }
      const dueCoils = c.dueQuantity ?? Math.max(0, c.totalQuantity - (c.billedQuantity || 0));
      return c.status !== 'billed' && dueCoils > 0;
    }).length;
  }, [challans, selectedBranchId, effectiveBranches]);

  // Parties with Pending / Unbilled Challans
  const partiesWithUnbilledChallans = useMemo(() => {
    const map = new Map<
      string,
      { partyName: string; unbilledChallanCount: number; totalDueCoils: number; totalDueAmount: number; challans: DeliveryChallan[] }
    >();

    (challans || []).forEach((c) => {
      if (!c) return;
      if (selectedBranchId !== 'ALL') {
        const targetBranch = effectiveBranches.find((b) => b.id === selectedBranchId);
        const branchMatch = (c.branchId && c.branchId === selectedBranchId) ||
          (targetBranch && c.branchName && (
            c.branchName.toLowerCase().includes(targetBranch.name.toLowerCase()) ||
            targetBranch.name.toLowerCase().includes(c.branchName.toLowerCase())
          ));
        if (!branchMatch) return false;
      }
      const pName = (c.partyName || 'Unknown Party').trim();
      const dueCoils = Number(c.dueQuantity ?? Math.max(0, (c.totalQuantity || 0) - (c.billedQuantity || 0))) || 0;
      if (dueCoils > 0 && c.status !== 'billed') {
        const existing = map.get(pName) || {
          partyName: pName,
          unbilledChallanCount: 0,
          totalDueCoils: 0,
          totalDueAmount: 0,
          challans: []
        };
        existing.unbilledChallanCount += 1;
        existing.totalDueCoils += dueCoils;
        existing.totalDueAmount += Number(c.dueAmount ?? ((c.totalAmount || 0) - (c.billedAmount || 0))) || 0;
        existing.challans.push(c);
        map.set(pName, existing);
      }
    });

    return Array.from(map.values());
  }, [challans, selectedBranchId, effectiveBranches]);

  // Filtered & Sorted Challans List (Matching StoredBillsDirectory pattern)
  const filteredChallans = useMemo(() => {
    const result = challans.filter((c) => {
      // Branch / Sales Center filter
      if (selectedBranchId !== 'ALL') {
        const targetBranch = effectiveBranches.find((b) => b.id === selectedBranchId);
        const branchMatch = (c.branchId && c.branchId === selectedBranchId) ||
          (targetBranch && c.branchName && (
            c.branchName.toLowerCase().includes(targetBranch.name.toLowerCase()) ||
            targetBranch.name.toLowerCase().includes(c.branchName.toLowerCase())
          ));
        if (!branchMatch) return false;
      }

      const hasCopy = Boolean(c.receivedCopy);
      if (statusFilter === 'unbilled' && c.status !== 'unbilled') return false;
      if (statusFilter === 'partial' && c.status !== 'partial') return false;
      if (statusFilter === 'billed' && c.status !== 'billed') return false;
      if (statusFilter === 'with_copy' && !hasCopy) return false;
      if (statusFilter === 'pending_copy' && hasCopy) return false;

      // Party filter
      if (partyFilter !== 'all' && (c.partyName || '').trim().toLowerCase() !== partyFilter.toLowerCase()) {
        return false;
      }

      // Salesperson filter
      if (salespersonFilter !== 'all') {
        const sp = (c.salespersonName || c.salesmanCode || '').trim().toLowerCase();
        if (sp !== salespersonFilter.toLowerCase()) return false;
      }

      // Quantity / Volume / Due status filter
      const totalQty = c.totalQuantity || 0;
      const dueCoils = c.dueQuantity ?? Math.max(0, totalQty - (c.billedQuantity || 0));
      if (quantityFilter === 'has_due' && dueCoils <= 0) return false;
      if (quantityFilter === 'zero_due' && dueCoils > 0) return false;
      if (quantityFilter === 'high_volume' && totalQty < 50) return false;

      // Specific Item filter
      if (filterItemName.trim()) {
        const qItem = filterItemName.trim();
        const hasItem = (c.lines || []).some((l) =>
          matchesFlexibleSearch(`${l.itemDescription || ''} ${l.sizeSpec || ''}`, qItem)
        );
        if (!hasItem) return false;
      }

      // Order / Ref No filter
      if (orderRefFilter.trim()) {
        const qRef = orderRefFilter.toLowerCase().trim();
        const ord = (c.orderNumber || '').toLowerCase();
        const ref = (c.refNo || '').toLowerCase();
        if (!ord.includes(qRef) && !ref.includes(qRef)) return false;
      }

      // Amount Range filter
      const totalAmt = c.totalAmount || 0;
      if (minAmountFilter.trim()) {
        const minVal = parseFloat(minAmountFilter);
        if (!isNaN(minVal) && totalAmt < minVal) return false;
      }
      if (maxAmountFilter.trim()) {
        const maxVal = parseFloat(maxAmountFilter);
        if (!isNaN(maxVal) && totalAmt > maxVal) return false;
      }

      // Date Range filter
      if (startDate || endDate) {
        const chDateIso = parseDateToISO(c.date) || (c.savedAt ? c.savedAt.slice(0, 10) : '');
        if (chDateIso) {
          if (startDate && chDateIso < startDate) return false;
          if (endDate && chDateIso > endDate) return false;
        }
      }

      // Search query (searching party, challan no, date, address, phone, salesman, proof name, line items, remarks)
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const pName = (c.partyName || '').toLowerCase();
        const chNo = (c.challanNo || '').toLowerCase();
        const dt = (c.date || '').toLowerCase();
        const addr = (c.address || '').toLowerCase();
        const ph = (c.phone || '').toLowerCase();
        const spName = (c.salespersonName || '').toLowerCase();
        const spCode = (c.salesmanCode || '').toLowerCase();
        const oNo = (c.orderNumber || '').toLowerCase();
        const rNo = (c.refNo || '').toLowerCase();
        const rem = (c.remarks || '').toLowerCase();
        const cName = (c.receivedCopyName || '').toLowerCase();
        const hasItemMatch = (c.lines || []).some((l) =>
          matchesFlexibleSearch(`${l.itemDescription || ''} ${l.sizeSpec || ''}`, q)
        );

        const matches =
          pName.includes(q) ||
          chNo.includes(q) ||
          dt.includes(q) ||
          addr.includes(q) ||
          ph.includes(q) ||
          spName.includes(q) ||
          spCode.includes(q) ||
          oNo.includes(q) ||
          rNo.includes(q) ||
          rem.includes(q) ||
          cName.includes(q) ||
          hasItemMatch;

        if (!matches) return false;
      }

      return true;
    });

    // Sort the result
    return result.sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      switch (sortField) {
        case 'date':
          valA = parseDateToISO(a.date) || a.savedAt || '';
          valB = parseDateToISO(b.date) || b.savedAt || '';
          break;
        case 'partyName':
          valA = (a.partyName || '').toLowerCase();
          valB = (b.partyName || '').toLowerCase();
          break;
        case 'address':
          valA = (a.address || '').toLowerCase();
          valB = (b.address || '').toLowerCase();
          break;
        case 'challanNo':
          valA = (a.challanNo || '').toLowerCase();
          valB = (b.challanNo || '').toLowerCase();
          break;
        case 'receivedCopy':
          valA = a.receivedCopy ? 1 : 0;
          valB = b.receivedCopy ? 1 : 0;
          break;
        case 'totalQuantity':
          valA = a.totalQuantity || 0;
          valB = b.totalQuantity || 0;
          break;
        case 'dueQuantity':
          valA = a.dueQuantity ?? Math.max(0, a.totalQuantity - (a.billedQuantity || 0));
          valB = b.dueQuantity ?? Math.max(0, b.totalQuantity - (b.billedQuantity || 0));
          break;
        case 'totalAmount':
          valA = a.totalAmount || 0;
          valB = b.totalAmount || 0;
          break;
        case 'status':
          valA = a.status || '';
          valB = b.status || '';
          break;
        default:
          valA = parseDateToISO(a.date) || '';
          valB = parseDateToISO(b.date) || '';
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [challans, selectedBranchId, effectiveBranches, statusFilter, partyFilter, salespersonFilter, startDate, endDate, search, sortField, sortDirection]);

  // Filtered KPIs for Directory Cards (Matching StoredBillsDirectory 4-Card Pattern)
  const filteredKPIs = useMemo(() => {
    const count = filteredChallans.length;
    const withCopyCount = filteredChallans.filter((c) => Boolean(c.receivedCopy)).length;
    const totalVolume = filteredChallans.reduce((s, c) => s + (c.totalAmount || 0), 0);
    const deliveredCoils = filteredChallans.reduce((s, c) => s + (c.totalQuantity || 0), 0);
    const dueCoils = filteredChallans.reduce(
      (s, c) => s + (c.dueQuantity ?? Math.max(0, c.totalQuantity - (c.billedQuantity || 0))),
      0
    );

    let latestDate = '-';
    if (filteredChallans.length > 0) {
      latestDate = formatDateDDMMYY(filteredChallans[0].date);
    }

    return {
      count,
      withCopyCount,
      totalVolume,
      deliveredCoils,
      dueCoils,
      latestDate
    };
  }, [filteredChallans]);

  // ----------------------------------------------------
  // CONVERT CHALLAN TO BILL LOGIC
  // ----------------------------------------------------
  const aggregatedPartyChallanGoods = useMemo(() => {
    if (!selectedConvertParty) return { items: [], partyChallans: [] };
    const targetPartyLower = selectedConvertParty.trim().toLowerCase();

    const partyChallans = (challans || []).filter(
      (c) => (c.partyName || '').trim().toLowerCase() === targetPartyLower && (c.status === 'unbilled' || c.status === 'partial')
    );

    const itemMap = new Map<
      string,
      {
        key: string;
        itemId?: string;
        itemDescription: string;
        sizeSpec?: string;
        unit: string;
        rate: number;
        totalDeliveredQty: number;
        totalBilledQty: number;
        totalDueQty: number;
        challanRefs: string[];
        isSpecialItem?: boolean;
        baseItemId?: string;
        stockMultiplier?: number;
      }
    >();

    partyChallans.forEach((ch) => {
      (ch.lines || []).forEach((line) => {
        const itemDesc = (line.itemDescription || '').trim();
        const sizeSpec = (line.sizeSpec || '').trim();
        const unit = (line.unit || 'Coils').trim();
        const key = `${itemDesc}__${sizeSpec}__${unit}`.toLowerCase();
        const delivered = Number(line.coilQty) || 0;
        const billed = Number(line.billedQty) || 0;
        const due = Math.max(0, delivered - billed);

        if (due > 0 || billed === 0) {
          if (!itemMap.has(key)) {
            itemMap.set(key, {
              key,
              itemId: line.itemId,
              itemDescription: itemDesc || 'Item',
              sizeSpec: line.sizeSpec,
              unit: line.unit || 'Coils',
              rate: Number(line.rate) || 0,
              totalDeliveredQty: delivered,
              totalBilledQty: billed,
              totalDueQty: due,
              challanRefs: [ch.challanNo],
              isSpecialItem: line.isSpecialItem,
              baseItemId: line.baseItemId,
              stockMultiplier: line.stockMultiplier
            });
          } else {
            const cur = itemMap.get(key)!;
            cur.totalDeliveredQty += delivered;
            cur.totalBilledQty += billed;
            cur.totalDueQty += due;
            if (!cur.challanRefs.includes(ch.challanNo)) {
              cur.challanRefs.push(ch.challanNo);
            }
            if (!cur.rate && line.rate) cur.rate = Number(line.rate) || 0;
          }
        }
      });
    });

    return {
      items: Array.from(itemMap.values()),
      partyChallans
    };
  }, [challans, selectedConvertParty]);

  const handleSelectConvertParty = (party: string) => {
    setSelectedConvertParty(party);
    const partyLower = (party || '').trim().toLowerCase();
    const partyChallans = (challans || []).filter(
      (c) => (c.partyName || '').trim().toLowerCase() === partyLower && (c.status === 'unbilled' || c.status === 'partial')
    );

    const initialQtyMap: Record<string, number> = {};
    partyChallans.forEach((ch) => {
      (ch.lines || []).forEach((l) => {
        const itemDesc = (l.itemDescription || '').trim();
        const sizeSpec = (l.sizeSpec || '').trim();
        const unit = (l.unit || 'Coils').trim();
        const key = `${itemDesc}__${sizeSpec}__${unit}`.toLowerCase();
        const due = Math.max(0, (Number(l.coilQty) || 0) - (Number(l.billedQty) || 0));
        initialQtyMap[key] = (initialQtyMap[key] || 0) + due;
      });
    });
    setBillQuantities(initialQtyMap);
  };

  const handleGenerateBillFromChallans = () => {
    if (!selectedConvertParty) {
      showToast('Please select a customer first', 'error');
      return;
    }

    const { items: aggItems, partyChallans } = aggregatedPartyChallanGoods;
    if (aggItems.length === 0) {
      showToast('No pending challan goods found for this customer.', 'error');
      return;
    }

    const billLinesToCreate: BillLineItem[] = [];
    let sl = 1;

    aggItems.forEach((item) => {
      const qtyToBill = billQuantities[item.key] || 0;
      if (qtyToBill > 0) {
        billLinesToCreate.push({
          id: `bline-${Date.now()}-${sl}`,
          slNo: sl++,
          itemId: item.itemId,
          itemDescription: item.itemDescription,
          sizeSpec: item.sizeSpec || '',
          coilQty: qtyToBill,
          unit: item.unit,
          rate: item.rate,
          amount: Math.round(qtyToBill * item.rate),
          isSpecialItem: item.isSpecialItem,
          baseItemId: item.baseItemId,
          stockMultiplier: item.stockMultiplier
        });
      }
    });

    if (billLinesToCreate.length === 0) {
      showToast('Please set a bill quantity greater than 0 for at least one item', 'error');
      return;
    }

    const targetPartyLower = selectedConvertParty.trim().toLowerCase();
    const matchedParty = (parties || []).find((p) => (p.name || '').trim().toLowerCase() === targetPartyLower);
    const refChallanNos = partyChallans.map((c) => c.challanNo).join(', ');

    const newBillHeader: BillHeader = {
      partyName: selectedConvertParty,
      address: matchedParty?.address || partyChallans[0]?.address || '',
      phone: matchedParty?.phone || partyChallans[0]?.phone || '',
      orderNumber: partyChallans[0]?.orderNumber || '',
      billNo: `INV-${Date.now().toString().slice(-4)}`,
      challanNo: refChallanNos || '',
      refNo: `Challan Bill: ${partyChallans.length} Challan(s)`,
      salesmanCode: matchedParty?.salesmanCode || partyChallans[0]?.salesmanCode || '',
      date: formatDateDDMMYY(new Date().toISOString()),
      challanDate: partyChallans[0]?.date || formatDateDDMMYY(new Date().toISOString()),
      discountPercent: 0
    };

    // Update Challans FIFO
    const updatedChallans = (challans || []).map((ch) => {
      if ((ch.partyName || '').trim().toLowerCase() !== targetPartyLower || ch.status === 'billed') {
        return ch;
      }

      let modified = false;
      const updatedLines = (ch.lines || []).map((cLine) => {
        const itemDesc = (cLine.itemDescription || '').trim();
        const sizeSpec = (cLine.sizeSpec || '').trim();
        const unit = (cLine.unit || 'Coils').trim();
        const itemKey = `${itemDesc}__${sizeSpec}__${unit}`.toLowerCase();
        const remainingToBillTotal = billQuantities[itemKey] || 0;
        const lineDue = Math.max(0, (Number(cLine.coilQty) || 0) - (Number(cLine.billedQty) || 0));

        if (remainingToBillTotal > 0 && lineDue > 0) {
          const qtyToApplyToThisChallan = Math.min(lineDue, remainingToBillTotal);
          billQuantities[itemKey] -= qtyToApplyToThisChallan;
          modified = true;
          const newBilled = (Number(cLine.billedQty) || 0) + qtyToApplyToThisChallan;
          return {
            ...cLine,
            billedQty: newBilled,
            dueQty: Math.max(0, (Number(cLine.coilQty) || 0) - newBilled)
          };
        }
        return cLine;
      });

      if (modified) {
        const totalQ = updatedLines.reduce((s, l) => s + (Number(l.coilQty) || 0), 0);
        const billedQ = updatedLines.reduce((s, l) => s + (Number(l.billedQty) || 0), 0);
        const dueQ = Math.max(0, totalQ - billedQ);
        const totalA = updatedLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
        const billedA = updatedLines.reduce((s, l) => s + (Number(l.billedQty) || 0) * (Number(l.rate) || 0), 0);
        const dueA = Math.max(0, totalA - billedA);

        let newStatus: 'unbilled' | 'partial' | 'billed' = 'unbilled';
        if (billedQ >= totalQ && totalQ > 0) newStatus = 'billed';
        else if (billedQ > 0) newStatus = 'partial';

        return {
          ...ch,
          lines: updatedLines,
          totalQuantity: totalQ,
          billedQuantity: billedQ,
          dueQuantity: dueQ,
          totalAmount: totalA,
          billedAmount: billedA,
          dueAmount: dueA,
          status: newStatus,
          updatedAt: new Date().toISOString()
        };
      }
      return ch;
    });

    setChallans(updatedChallans);

    if (onOpenInvoicerWithBill) {
      onOpenInvoicerWithBill(newBillHeader, billLinesToCreate, partyChallans.map((c) => c.id));
    }
  };

  // Export XLSX
  const handleExportXLSX = () => {
    if (challans.length === 0) {
      showToast('No challans to export', 'error');
      return;
    }

    const exportRows: any[] = [];
    challans.forEach((c) => {
      c.lines.forEach((l) => {
        exportRows.push({
          'Challan No': c.challanNo,
          'Challan Date': c.date,
          'Customer / Party': c.partyName,
          Address: c.address || '',
          Salesman: c.salespersonName || c.salesmanCode || '',
          'Order No': c.orderNumber || '',
          'Ref No': c.refNo || '',
          'Item Description': l.itemDescription,
          'Size / Spec': l.sizeSpec || '',
          Unit: l.unit,
          'Delivered Qty': l.coilQty,
          'Billed Qty': l.billedQty || 0,
          'Due Qty': l.dueQty || Math.max(0, l.coilQty - (l.billedQty || 0)),
          'Rate (৳)': l.rate,
          'Total Amount (৳)': l.amount,
          Status: c.status.toUpperCase(),
          'Received Copy': c.receivedCopy ? 'ATTACHED' : 'PENDING',
          Remarks: c.remarks || ''
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Delivery_Challans');
    XLSX.writeFile(wb, `Delivery_Challans_${formatDateDDMMYY(new Date().toISOString())}.xlsx`);
    showToast('Exported Delivery Challans to Excel (.xlsx)');
  };

  return (
    <div className="space-y-6 font-sans">
      <div className={previewingChallan ? 'no-print space-y-6' : 'space-y-6'}>
      {/* Hidden Global File Input for Received Copy Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-2 rounded-xl shadow-2xl font-bold text-xs flex items-center space-x-2 border animate-in fade-in slide-in-from-top-3 ${
            toastMessage.type === 'error'
              ? 'bg-rose-900 text-rose-100 border-rose-700'
              : 'bg-emerald-700 text-white border-emerald-500'
          }`}
        >
          {toastMessage.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-300" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-200" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* TOP CYBER TEAL BAR (SalesCenterSearchFilter + View Switcher, ZERO top action buttons) */}
      <div className="cyber-glass-card relative z-40 border border-cyan-500/25 text-white rounded-2xl p-2.5 shadow-2xl mb-4 no-print">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <SalesCenterSearchFilter
              value={selectedBranchId}
              onChange={(newBranchId) => {
                if (!isBranchLocked) {
                  setSelectedBranchId(newBranchId);
                  const nextBranch =
                    newBranchId === 'ALL'
                      ? (isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser) || isAnyAdmin(currentUser)
                          ? findHeadOfficeBranch(effectiveBranches)
                          : null)
                      : effectiveBranches.find((b) => b.id === newBranchId) || null;
                  if (!editingChallanId) {
                    setChallanNo(computeNextChallanNo(challans, nextBranch));
                  }
                  const nextSps = filterSalespersonsByBranch(salespersons, newBranchId, effectiveBranches, currentUser);
                  if (newBranchId !== 'ALL' && salespersonFilter !== 'all') {
                    const spValid = nextSps.some((s) => s.name.toLowerCase() === salespersonFilter.toLowerCase());
                    if (!spValid) setSalespersonFilter('all');
                  }
                  if (newBranchId !== 'ALL' && salesmanCode) {
                    const padSpValid = nextSps.some(
                      (s) =>
                        (s.code || '').toLowerCase() === salesmanCode.toLowerCase() ||
                        (s.name || '').toLowerCase() === salespersonName.toLowerCase()
                    );
                    if (!padSpValid) {
                      setSalesmanCode('');
                      setSalespersonName('');
                    }
                  }
                }
              }}
              branches={effectiveBranches}
              isLocked={isBranchLocked}
              lockedReason={`Locked to assigned sales center: ${effectiveBranches.find(b => b.id === selectedBranchId)?.name || selectedBranchId}`}
              includeAllOption={canViewAllCenters && !isBranchLocked}
              allOptionLabel={
                isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser)
                  ? `All Sales Centers (${effectiveBranches.length})`
                  : `All Assigned Centers (${effectiveBranches.length})`
              }
              allOptionValue="ALL"
              label="Sales Center:"
              theme="dark"
              size="sm"
              widthClass="min-w-[165px] max-w-[220px]"
            />

            {challanBranch && (
              <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-[#061520] border border-cyan-500/25 text-[10.5px] max-w-full sm:max-w-[380px] shrink-0">
                <Building2 className="w-3 h-3 text-cyan-400 shrink-0" />
                <span className="truncate font-semibold text-cyan-200">
                  {cleanBranchName(challanBranch.name)}
                  {challanBranchAddress.fullAddress ? ` • ${challanBranchAddress.fullAddress}` : ''}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label className="text-[11px] font-bold text-cyan-200/80 uppercase tracking-wider">View:</label>
            <select
              value={activeSubTab}
              onChange={(e) => {
                const nextTab = e.target.value as any;
                if (nextTab === 'create_challan') {
                  resetChallanForm();
                  handleSubTabChange('create_challan');
                  setChallanFormViewMode('poly_pad');
                } else {
                  handleSubTabChange(nextTab);
                }
              }}
              className="bg-[#061520] border border-cyan-500/35 text-cyan-100 rounded-lg px-2.5 py-1 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-cyan-400 cursor-pointer"
            >
              <option value="create_challan">
                {editingChallanId ? 'Edit Delivery Challan' : 'Delivery Challan Entry'}
              </option>
              <option value="challan_list">Challan Directory ({pendingChallansCount})</option>
              <option value="convert_to_bill">
                Convert to Bill{partiesWithUnbilledChallans.length > 0 ? ` (${partiesWithUnbilledChallans.length})` : ''}
              </option>
              <option value="due_register">Customer Due Goods Register</option>
            </select>
          </div>
        </div>
      </div>

      {/* Subtab View Panels Container (Stable minimum height to eliminate vertical jump/movement) */}
      <div className="min-h-[720px]" style={{ overflowAnchor: 'none' }}>

      {/* ========================================================================= */}
      {/* SUBTAB 1: CHALLAN DIRECTORY LIST */}
      {/* ========================================================================= */}
      {activeSubTab === 'challan_list' && (
        <div className="space-y-4 font-sans">
          {/* GLOBAL CONTROLS & FILTER BAR (SALES & STOCK REPORT FILTER BAR STYLE) */}
          <div className="bg-[#0b2334]/85 backdrop-blur-xl p-2.5 px-4 rounded-2xl border border-cyan-500/25 flex flex-col space-y-2 text-xs text-white shadow-lg no-print">
            {/* Row 1: Core Dimensions (Status, Salesperson, Party, Date Range) */}
            <div className="flex items-center gap-2 flex-nowrap overflow-x-auto no-scrollbar py-0.5">
              {/* Challan Status Filter */}
              <div className="flex items-center space-x-1 bg-[#061520] text-white p-1 px-2 rounded-lg border border-cyan-500/30 shrink-0">
                <span className="text-slate-300 font-bold text-[11px] flex items-center space-x-1 whitespace-nowrap">
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <span>Status:</span>
                </span>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as any);
                  }}
                  className="bg-[#081b28] text-amber-300 border border-cyan-500/30 rounded px-1.5 py-0.5 text-xs font-bold focus:outline-none cursor-pointer"
                >
                  <option value="all">All ({challans.length})</option>
                  <option value="unbilled">Unbilled ({summaryMetrics.unbilledCount})</option>
                  <option value="partial">Partial ({summaryMetrics.partialCount})</option>
                  <option value="billed">Billed ({summaryMetrics.billedCount})</option>
                  <option value="with_copy">With Copy ({countWithCopy})</option>
                  <option value="pending_copy">Pending Copy ({countPendingCopy})</option>
                </select>
              </div>

              {/* Salesperson Filter */}
              <div className="flex items-center space-x-1 bg-[#061520] text-white p-1 px-2 rounded-lg border border-cyan-500/30 shrink-0">
                <span className="font-bold text-slate-300 text-[11px] flex items-center space-x-1 whitespace-nowrap">
                  <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Salesman:</span>
                </span>
                <select
                  value={salespersonFilter}
                  onChange={(e) => {
                    const newSalesman = e.target.value;
                    setSalespersonFilter(newSalesman);
                    if (newSalesman !== 'all') {
                      const spObj = salespersons.find((s) => s.name.toLowerCase() === newSalesman.toLowerCase());
                      if (spObj && spObj.branchId) {
                        setSelectedBranchId(spObj.branchId);
                      } else {
                        const matchC = challans.find((c) => (c.salespersonName || c.salesmanCode || '').trim().toLowerCase() === newSalesman.toLowerCase());
                        if (matchC && matchC.branchId) {
                          setSelectedBranchId(matchC.branchId);
                        }
                      }
                    }
                  }}
                  className="py-0.5 px-1.5 text-xs bg-[#081b28] text-white border border-cyan-500/30 rounded font-semibold max-w-[130px] sm:max-w-[170px] truncate cursor-pointer"
                >
                  <option value="all">All Salesmen</option>
                  {uniqueSalespersons.map((sp, spIdx) => (
                    <option key={`${sp.name}-${spIdx}`} value={sp.name}>
                      {sp.name} ({sp.count})
                    </option>
                  ))}
                </select>
              </div>

              {/* Customer / Party Filter */}
              <div className="flex items-center space-x-1 bg-[#061520] text-white p-1 px-2 rounded-lg border border-cyan-500/30 shrink-0">
                <span className="font-bold text-slate-300 text-[11px] flex items-center space-x-1 whitespace-nowrap">
                  <Building2 className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Party:</span>
                </span>
                <select
                  value={partyFilter}
                  onChange={(e) => {
                    setPartyFilter(e.target.value);
                    setPartyFilterSearch(e.target.value === 'all' ? '' : e.target.value);
                  }}
                  className="py-0.5 px-1.5 text-xs bg-[#081b28] text-white border border-cyan-500/30 rounded font-semibold max-w-[140px] sm:max-w-[200px] truncate cursor-pointer"
                >
                  <option value="all">All Parties ({uniqueParties.length})</option>
                  {uniqueParties.map((p, pIdx) => (
                    <option key={`${p.name}-${pIdx}`} value={p.name}>
                      {p.name} ({p.count})
                    </option>
                  ))}
                </select>
              </div>

              <StandardPeriodFilterBar
                period={datePreset}
                onSelectPeriod={handleDatePresetChange}
                customStartDate={fromDateText}
                customEndDate={toDateText}
                onCustomStartDateChange={handleFromDateInputChange}
                onCustomEndDateChange={handleToDateInputChange}
                theme="dark"
              />
            </div>

            {/* Row 2: Search, More Filters & Action Buttons */}
            <div className="pt-1.5 border-t border-cyan-500/20 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                {/* Search Box with Clear Button */}
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                    }}
                    placeholder="Search by Date, Party, Challan #, Salesman, or Item..."
                    className="w-full pl-8 pr-7 py-1 text-xs bg-[#061520] text-white placeholder-slate-400 border border-cyan-500/30 rounded-lg focus:outline-none font-medium"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('');
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 text-xs font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* More Filters Toggle */}
                <button
                  type="button"
                  onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
                    isFilterPanelOpen
                      ? 'bg-[#0e2d42] text-cyan-200 border border-cyan-400/60 shadow-xs'
                      : 'bg-[#081b28] text-slate-300 hover:bg-[#0e2a3d] border border-cyan-500/25'
                  }`}
                  title="More filter options"
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span>More Filters</span>
                  {activeFiltersCount > 0 && (
                    <span className="bg-cyan-400 text-slate-950 text-[10px] font-extrabold px-1.5 py-0.2 rounded-full">
                      {activeFiltersCount}
                    </span>
                  )}
                </button>

                {/* Reset Filters Button */}
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="px-2.5 py-1 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 rounded-lg text-xs font-bold flex items-center space-x-1 transition-colors cursor-pointer"
                    title="Reset all filters to default"
                  >
                    <FilterX className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>
                )}
              </div>

              {/* Status counter indicator */}
              <div className="flex items-center space-x-2 text-[11px] text-slate-300">
                <span>Showing <strong className="text-cyan-300 font-bold font-mono">{filteredChallans.length}</strong> of <span className="font-mono">{challans.length}</span> challans</span>
              </div>
            </div>

            {/* Collapsible Advanced Filters Drawer */}
            {isFilterPanelOpen && (
              <div className="pt-2 border-t border-cyan-500/20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs animate-in fade-in">
                {/* Delivery & Due Quantity Filter */}
                <div className="cyber-glass-subcard p-2 rounded-lg border border-cyan-500/25">
                  <label className="block text-[10px] font-bold text-cyan-200/80 mb-1">
                    Delivery & Due Coils
                  </label>
                  <select
                    value={quantityFilter}
                    onChange={(e) => setQuantityFilter(e.target.value as any)}
                    className="w-full text-xs font-semibold bg-[#061520] border border-cyan-500/30 rounded px-2 py-1 text-white focus:outline-none"
                  >
                    <option value="all">All Delivery Volumes</option>
                    <option value="has_due">Has Due Coils (Pending)</option>
                    <option value="zero_due">Zero Due Coils (Fully Delivered)</option>
                    <option value="high_volume">High Volume (≥ 50 Coils)</option>
                  </select>
                </div>

                {/* Product / Item Search Filter */}
                <div className="cyber-glass-subcard p-2 rounded-lg border border-cyan-500/25">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold text-cyan-200/80">Filter by Item</label>
                    {filterItemName && (
                      <button
                        type="button"
                        onClick={() => setFilterItemName('')}
                        className="text-[10px] text-rose-400 hover:text-rose-300 font-bold"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    list="challan-item-filter-datalist"
                    value={filterItemName}
                    onChange={(e) => setFilterItemName(e.target.value)}
                    placeholder="e.g. 1.3 rm, 3/29, BYA..."
                    className="w-full text-xs font-semibold bg-[#061520] border border-cyan-500/30 rounded px-2 py-1 text-white focus:outline-none placeholder:text-slate-400"
                  />
                  <datalist id="challan-item-filter-datalist">
                    {uniqueChallanItems.slice(0, 50).map((it) => (
                      <option key={it.name} value={it.name}>
                        {it.name} ({it.count} challans)
                      </option>
                    ))}
                  </datalist>
                </div>

                {/* Amount Range Filter */}
                <div className="cyber-glass-subcard p-2 rounded-lg border border-cyan-500/25">
                  <label className="block text-[10px] font-bold text-cyan-200/80 mb-1">
                    Total Amount Range (৳)
                  </label>
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="number"
                      value={minAmountFilter}
                      onChange={(e) => setMinAmountFilter(e.target.value)}
                      placeholder="Min ৳"
                      className="w-1/2 text-xs font-mono font-semibold bg-[#061520] border border-cyan-500/30 rounded px-1.5 py-1 text-white focus:outline-none placeholder:text-slate-400"
                    />
                    <span className="text-slate-500 font-bold">-</span>
                    <input
                      type="number"
                      value={maxAmountFilter}
                      onChange={(e) => setMaxAmountFilter(e.target.value)}
                      placeholder="Max ৳"
                      className="w-1/2 text-xs font-mono font-semibold bg-[#061520] border border-cyan-500/30 rounded px-1.5 py-1 text-white focus:outline-none placeholder:text-slate-400"
                    />
                  </div>
                </div>

                {/* Order / Ref Number Filter */}
                <div className="cyber-glass-subcard p-2 rounded-lg border border-cyan-500/25">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold text-cyan-200/80">Order No / Ref No</label>
                    {orderRefFilter && (
                      <button
                        type="button"
                        onClick={() => setOrderRefFilter('')}
                        className="text-[10px] text-rose-400 hover:text-rose-300 font-bold"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={orderRefFilter}
                    onChange={(e) => setOrderRefFilter(e.target.value)}
                    placeholder="Filter by Order / Ref #"
                    className="w-full text-xs font-semibold bg-[#061520] border border-cyan-500/30 rounded px-2 py-1 text-white focus:outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Batch Actions Bar */}
          {selectedChallanIds.length > 0 && (
            <div className="bg-rose-500/15 border border-rose-500/40 p-3 rounded-xl flex items-center justify-between gap-2 animate-in fade-in backdrop-blur-md">
              <div className="flex items-center space-x-2 text-xs font-bold text-rose-200">
                <span className="bg-rose-600 text-white px-2 py-0.5 rounded-full text-[11px]">
                  {selectedChallanIds.length}
                </span>
                <span>Challan(s) selected</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="px-3 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 text-xs font-bold rounded-lg border border-cyan-500/25 transition-colors cursor-pointer"
                >
                  Clear Selection
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelectedChallans}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow-sm transition-colors cursor-pointer flex items-center space-x-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Selected ({selectedChallanIds.length})</span>
                </button>
              </div>
            </div>
          )}

          {/* Challans Table List View */}
          {filteredChallans.length === 0 ? (
            <div className="cyber-glass-card rounded-2xl border border-cyan-500/25 p-12 text-center text-slate-300 space-y-3">
              <FolderOpen className="w-12 h-12 mx-auto text-cyan-400/50" />
              <h3 className="text-sm font-bold text-white">No Delivery Challans Found</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {hasActiveFilters
                  ? 'No delivery challans match your search or active filters.'
                  : 'Click "Create Delivery Challan" to issue and store your first delivery challan record.'}
              </p>
            </div>
          ) : (
            <div className="cyber-glass-card rounded-2xl border border-cyan-500/25 shadow-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 font-bold uppercase tracking-wider text-[11px] select-none">
                      {/* Checkbox Select All */}
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={filteredChallans.length > 0 && selectedChallanIds.length === filteredChallans.length}
                          onChange={handleToggleSelectAll}
                          className="w-4 h-4 rounded text-cyan-400 border-cyan-500/40 bg-[#061520] cursor-pointer"
                          title="Select / Deselect all"
                        />
                      </th>

                      {/* Date */}
                      <th
                        className="p-3 w-28 cursor-pointer hover:bg-[#11334a] transition-colors"
                        onClick={() => handleSort('date')}
                      >
                        <div className="flex items-center space-x-1.5">
                          <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Date</span>
                          {sortField === 'date' ? (
                            sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-cyan-400/60" />
                          )}
                        </div>
                      </th>

                      {/* Party Name */}
                      <th
                        className="p-3 cursor-pointer hover:bg-[#11334a] transition-colors"
                        onClick={() => handleSort('partyName')}
                      >
                        <div className="flex items-center space-x-1.5">
                          <User className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Party Name</span>
                          {sortField === 'partyName' ? (
                            sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-cyan-400/60" />
                          )}
                        </div>
                      </th>

                      {/* Address */}
                      <th
                        className="p-3 cursor-pointer hover:bg-[#11334a] transition-colors"
                        onClick={() => handleSort('address')}
                      >
                        <div className="flex items-center space-x-1.5">
                          <span>Address</span>
                          {sortField === 'address' ? (
                            sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-cyan-400/60" />
                          )}
                        </div>
                      </th>

                      {/* Challan No */}
                      <th
                        className="p-3 w-28 text-center cursor-pointer hover:bg-[#11334a] transition-colors"
                        onClick={() => handleSort('challanNo')}
                      >
                        <div className="flex items-center justify-center space-x-1.5">
                          <span>Challan No</span>
                          {sortField === 'challanNo' ? (
                            sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-cyan-400/60" />
                          )}
                        </div>
                      </th>

                      {/* Received Copy */}
                      <th
                        className="p-3 w-36 text-center cursor-pointer hover:bg-[#11334a] transition-colors"
                        onClick={() => handleSort('receivedCopy')}
                      >
                        <div className="flex items-center justify-center space-x-1.5">
                          <FileCheck className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Received Copy</span>
                          {sortField === 'receivedCopy' ? (
                            sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-cyan-400/60" />
                          )}
                        </div>
                      </th>

                      {/* Delivered / Due Quantities */}
                      <th
                        className="p-3 w-32 text-right cursor-pointer hover:bg-[#11334a] transition-colors"
                        onClick={() => handleSort('totalQuantity')}
                      >
                        <div className="flex items-center justify-end space-x-1.5">
                          <span>Delivered / Due</span>
                          {sortField === 'totalQuantity' || sortField === 'dueQuantity' ? (
                            sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-cyan-400/60" />
                          )}
                        </div>
                      </th>

                      {/* Amount */}
                      <th
                        className="p-3 w-32 text-right cursor-pointer hover:bg-[#11334a] transition-colors"
                        onClick={() => handleSort('totalAmount')}
                      >
                        <div className="flex items-center justify-end space-x-1.5">
                          <span>Amount</span>
                          {sortField === 'totalAmount' ? (
                            sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-cyan-400/60" />
                          )}
                        </div>
                      </th>

                      {/* Status */}
                      <th
                        className="p-3 w-28 text-center cursor-pointer hover:bg-[#11334a] transition-colors"
                        onClick={() => handleSort('status')}
                      >
                        <div className="flex items-center justify-center space-x-1.5">
                          <span>Status</span>
                          {sortField === 'status' ? (
                            sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-cyan-400/60" />
                          )}
                        </div>
                      </th>

                      {/* Actions */}
                      <th className="p-3 w-40 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200 font-sans">
                    {filteredChallans.map((ch) => {
                      const dueQ = ch.dueQuantity ?? Math.max(0, ch.totalQuantity - (ch.billedQuantity || 0));
                      const isFullyBilled = ch.status === 'billed' || dueQ === 0;
                      const isSelected = selectedChallanIds.includes(ch.id);

                      return (
                        <tr
                          key={ch.id}
                          onClick={() => setSelectedChallan(ch)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-rose-500/15'
                              : isFullyBilled
                              ? 'bg-[#081d2b]/70 hover:bg-cyan-500/[0.08]'
                              : 'hover:bg-cyan-500/[0.06]'
                          }`}
                        >
                          {/* Row Selection Checkbox */}
                          <td
                            className="p-3 text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => handleToggleSelectChallan(ch.id, e as any)}
                              className="w-4 h-4 rounded text-cyan-400 border-cyan-500/40 bg-[#061520] cursor-pointer"
                              title="Select row"
                            />
                          </td>

                          {/* Date */}
                          <td className="p-3 font-mono font-medium text-cyan-100">
                            {formatDateDDMMYY(ch.date)}
                          </td>

                          {/* Party Name */}
                          <td className="p-3 font-bold text-white">
                            <div className="flex items-center space-x-1.5">
                              <span>{ch.partyName}</span>
                              {isFullyBilled && (
                                <span title="Locked Read-Only">
                                  <Lock className="w-3 h-3 text-cyan-400/70 inline shrink-0" />
                                </span>
                              )}
                            </div>
                            {ch.salespersonName && (
                              <div className="text-[10px] font-normal text-slate-400">
                                Mkt: {ch.salespersonName}
                              </div>
                            )}
                          </td>

                          {/* Address */}
                          <td className="p-3 text-slate-300 max-w-xs truncate">
                            {ch.address || '-'}
                          </td>

                          {/* Challan No */}
                          <td className="p-3 text-center">
                            <span className="bg-[#0d283a] text-cyan-200 px-2 py-0.5 rounded font-mono font-bold text-xs border border-cyan-500/30">
                              {ch.challanNo}
                            </span>
                          </td>

                          {/* Received Copy Attachment */}
                          <td
                            className="p-3 text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {ch.receivedCopy ? (
                              <div className="inline-flex items-center space-x-1 bg-teal-500/15 border border-teal-400/35 rounded-lg p-1 pr-2">
                                <img
                                  src={ch.receivedCopy}
                                  alt="Proof thumbnail"
                                  className="w-6 h-6 object-cover rounded border border-teal-400/50"
                                />
                                <button
                                  type="button"
                                  onClick={() => setViewingReceivedCopyChallan(ch)}
                                  className="text-teal-300 hover:text-teal-200 text-[11px] font-bold underline cursor-pointer"
                                  title="View full-size proof"
                                >
                                  View Proof
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleTriggerUpload(ch.id)}
                                className="inline-flex items-center space-x-1 bg-[#081b28] hover:bg-teal-500/15 text-slate-300 hover:text-teal-300 border border-dashed border-cyan-500/35 hover:border-teal-400/60 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer"
                                title="Upload signed received copy for this delivery"
                              >
                                <Upload className="w-3 h-3" />
                                <span>+ Upload Copy</span>
                              </button>
                            )}
                          </td>

                          {/* Delivered / Due Quantities */}
                          <td className="p-3 text-right font-mono">
                            <div className="font-bold text-white">{ch.totalQuantity.toLocaleString()} Coils</div>
                            <div className={`text-[10px] font-bold ${dueQ > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                              {dueQ > 0 ? `${dueQ.toLocaleString()} Due` : 'Fully Billed'}
                            </div>
                          </td>

                          {/* Total Amount */}
                          <td className="p-3 text-right font-mono font-bold text-emerald-300 text-sm">
                            ৳{ch.totalAmount ? ch.totalAmount.toLocaleString('en-IN') : '0'}
                          </td>

                          {/* Status Badge */}
                          <td className="p-3 text-center">
                            {isFullyBilled ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 inline-flex items-center space-x-1">
                                <Lock className="w-2.5 h-2.5 text-emerald-300" />
                                <span>Fully Billed</span>
                              </span>
                            ) : ch.status === 'partial' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-200 border border-cyan-400/40">
                                Partial
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/40">
                                Unbilled
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td
                            className="p-3 text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-center space-x-1">
                              <button
                                onClick={() => setSelectedChallan(ch)}
                                className="bg-[#0d283a] hover:bg-[#133850] text-cyan-200 border border-cyan-500/30 p-1.5 rounded-lg transition-colors cursor-pointer"
                                title="View Challan Details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              {/* Print with Mode Options Dropdown */}
                              <div className="relative inline-flex items-center rounded-lg shadow-xs quick-print-menu-container">
                                <button
                                  type="button"
                                  onClick={() => setPreviewingChallan(ch)}
                                  className="bg-[#0d283a] hover:bg-[#133850] text-white border border-cyan-500/30 pl-2 pr-1.5 py-1.5 rounded-l-lg transition-colors cursor-pointer text-xs font-bold flex items-center space-x-1"
                                  title="Open Challan Print Preview with Pad Logo, Without Logo & Slip Pad options"
                                >
                                  <Printer className="w-3.5 h-3.5 text-cyan-300" />
                                  <span className="hidden sm:inline">Print</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuickPrintMenuChallanId(quickPrintMenuChallanId === ch.id ? null : ch.id);
                                  }}
                                  className="bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 hover:text-white px-1.5 py-1.5 rounded-r-lg border border-l-0 border-cyan-500/30 transition-colors cursor-pointer"
                                  title="Choose print mode directly: Pad Logo / Without Logo / Slip Pad"
                                >
                                  <ChevronDown className="w-3 h-3" />
                                </button>

                                {/* Dropdown Options Popup */}
                                {quickPrintMenuChallanId === ch.id && (
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    className="absolute right-0 top-full mt-1 w-64 max-w-[calc(100vw-2rem)] bg-[#091e2c]/95 backdrop-blur-xl border border-cyan-400/40 rounded-xl shadow-2xl z-50 p-1.5 space-y-1 text-left animate-in fade-in zoom-in-95 duration-100"
                                  >
                                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-cyan-500/20 flex items-center justify-between">
                                      <span>Choose Print Mode</span>
                                      <span className="text-cyan-300">Challan #{ch.challanNo}</span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setQuickPrintMenuChallanId(null);
                                        setChallanPadHeaderMode('plain');
                                        setPreviewingChallan(ch);
                                        setTimeout(() => triggerAutoConfiguredPrint('challan'), 150);
                                      }}
                                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-cyan-500/10 transition-colors flex items-start space-x-2 text-white group cursor-pointer"
                                    >
                                      <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                                      <div>
                                        <div className="text-xs font-bold text-emerald-300 group-hover:text-emerald-200">Pad Logo (Full Header)</div>
                                        <div className="text-[10px] text-slate-400 leading-tight">Prints full company logo, title & address (A4 / 10-inch)</div>
                                      </div>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setQuickPrintMenuChallanId(null);
                                        setChallanPadHeaderMode('hide_logo');
                                        setPreviewingChallan(ch);
                                        setTimeout(() => triggerAutoConfiguredPrint('challan'), 150);
                                      }}
                                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-cyan-500/10 transition-colors flex items-start space-x-2 text-white group cursor-pointer"
                                    >
                                      <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                                      <div>
                                        <div className="text-xs font-bold text-amber-300 group-hover:text-amber-200">Without Logo (Pad Hide Logo)</div>
                                        <div className="text-[10px] text-slate-400 leading-tight">Hides logo & title (for printed pad), keeps address</div>
                                      </div>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setQuickPrintMenuChallanId(null);
                                        setChallanPadHeaderMode('hide_all');
                                        setPreviewingChallan(ch);
                                        setTimeout(() => triggerAutoConfiguredPrint('challan'), 150);
                                      }}
                                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-cyan-500/10 transition-colors flex items-start space-x-2 text-white group cursor-pointer"
                                    >
                                      <div className="w-2 h-2 rounded-full bg-rose-400 mt-1.5 flex-shrink-0" />
                                      <div>
                                        <div className="text-xs font-bold text-rose-300 group-hover:text-rose-200">Pad (Hide All)</div>
                                        <div className="text-[10px] text-slate-400 leading-tight">Hides company name & logo completely</div>
                                      </div>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setQuickPrintMenuChallanId(null);
                                        setChallanPadHeaderMode('slip_pad');
                                        setPreviewingChallan(ch);
                                      }}
                                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-cyan-500/10 transition-colors flex items-start space-x-2 text-white group cursor-pointer"
                                    >
                                      <div className="w-2 h-2 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                                      <div>
                                        <div className="text-xs font-bold text-indigo-300 group-hover:text-indigo-200">Slip Pad (5.5&quot; × 8.5&quot;) Mode</div>
                                        <div className="text-[10px] text-slate-400 leading-tight">Compact half-sheet slip pad format without logo</div>
                                      </div>
                                    </button>
                                    <div className="border-t border-cyan-500/20 pt-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setQuickPrintMenuChallanId(null);
                                          setPreviewingChallan(ch);
                                        }}
                                        className="w-full text-center py-1.5 rounded-md bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 text-xs font-bold flex items-center justify-center space-x-1 cursor-pointer transition-colors"
                                      >
                                        <Eye className="w-3 h-3" />
                                        <span>Open Interactive Preview</span>
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>

                              <button
                                onClick={() => {
                                  setChallanPadHeaderMode('slip_pad');
                                  setPreviewingChallan(ch);
                                }}
                                className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 p-1.5 rounded-lg transition-colors cursor-pointer border border-amber-400/40"
                                title="Print Preview in Slip Pad (5.5&quot; × 8.5&quot;) Format"
                              >
                                <FileSpreadsheet className="w-3.5 h-3.5 text-amber-300" />
                              </button>

                              {isFullyBilled ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedChallan(ch);
                                    showToast(`Challan #${ch.challanNo} is fully billed and locked in read-only mode.`);
                                  }}
                                  className="bg-[#081b28] hover:bg-[#0e2a3d] text-slate-400 p-1.5 rounded-lg transition-colors cursor-pointer border border-cyan-500/25"
                                  title="Locked Read-Only: This challan is fully billed and cannot be edited"
                                >
                                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleEditChallan(ch)}
                                  className="bg-cyan-400 hover:bg-cyan-300 text-slate-950 p-1.5 rounded-lg transition-colors cursor-pointer"
                                  title="Edit Challan"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {!isFullyBilled && dueQ > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleSelectConvertParty(ch.partyName);
                                    setActiveSubTab('convert_to_bill');
                                  }}
                                  className="bg-indigo-600 hover:bg-indigo-500 text-white p-1.5 rounded-lg transition-colors cursor-pointer"
                                  title="Convert to Bill"
                                >
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleDeleteChallan(ch.id)}
                                className="bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 p-1.5 rounded-lg transition-colors cursor-pointer border border-rose-500/40"
                                title="Delete Challan"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
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
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 2: CREATE / EDIT CHALLAN ON DOCUMENT PAD (LIKE BILL PAGE) */}
      {/* ========================================================================= */}
      {activeSubTab === 'create_challan' && (
        <div className="space-y-4">
          {/* ========================================================================= */}
          {/* THE DOCUMENT PAPER / PAD CANVAS (Matching Bill page 1-to-1) */}
          {/* ========================================================================= */}
          <div className="bill-paper-dimensions max-w-[7.2in] w-full mx-auto bg-white text-black pt-0 px-3 pb-4 sm:px-[0.28in] sm:pb-[0.28in] shadow-2xl rounded-2xl border border-slate-300 min-h-[10in] font-sans transition-all relative print:rounded-none print:border-none print:shadow-none print:w-[7.2in] print:max-w-[7.2in] print:min-h-[10in] print:pt-0 print:px-[0.28in] print:pb-[0.28in]">
            {/* Top 1.5" strictly reserved for Company Logo */}
            <div className="text-center pb-0 space-y-0 text-black font-sans leading-tight pt-0">
              <div
                style={{ height: '1.5in', minHeight: '1.5in' }}
                className={`flex items-center justify-center ${
                  challanPadHeaderMode !== 'plain' ? 'hide-on-preprinted-pad invisible opacity-0' : ''
                }`}
              >
                <PolyCablesLogo size="xl" showSubtitle={false} subtitleText="" />
              </div>

              {/* Address, Title & Challan Metadata start immediately after 1.5" mark */}
              {challanBranchAddress.line1 ? (
                <div className={`space-y-0.5 pt-0 mt-0 pb-0 mb-0 ${challanPadHeaderMode === 'hide_all' ? 'hide-on-preprinted-pad invisible opacity-0' : ''}`}>
                  {challanBranch?.name && (
                    <p className="text-[12px] font-black text-[#1e295b] uppercase tracking-wide">
                      {cleanBranchName(challanBranch.name)}
                    </p>
                  )}
                  <div className="font-extrabold text-slate-900 text-[14px] leading-tight madhupur-address-line">{challanBranchAddress.line1}</div>
                  {challanBranchAddress.line2 && <div className="text-slate-800 font-bold text-[14px] leading-tight madhupur-address-line">{challanBranchAddress.line2}</div>}
                  {challanBranchAddress.line3 && <div className="text-slate-800 font-semibold text-[14px] leading-tight madhupur-address-line">{challanBranchAddress.line3}</div>}
                </div>
              ) : challanBranchAddress.fullAddress ? (
                <div className={`mt-0.5 space-y-0.5 text-center mx-auto ${challanPadHeaderMode === 'hide_all' ? 'hide-on-preprinted-pad invisible opacity-0' : ''}`}>
                  <p className="text-[14px] font-extrabold text-black leading-tight madhupur-address-line">
                    {challanBranchAddress.fullAddress}
                  </p>
                  <p className="text-[12px] font-semibold text-slate-800 leading-tight">
                    Mob: {challanBranchAddress.phone || company.phone || '01713-434290'} • E-mail: {challanBranchAddress.email || company.email || 'info@polycables.com.bd'}
                  </p>
                </div>
              ) : null}

              <div className="pt-1.5 pb-1">
                <span className="inline-block bg-slate-950 text-white text-xs sm:text-sm font-black uppercase tracking-widest px-4 py-0.5 rounded-full shadow-xs">
                  DELIVERY CHALLAN
                </span>
              </div>
            </div>

            {/* 2-Column Metadata Grid (Matching Bill Invoice layout with dotted lines) */}
            <div className="flex flex-col md:flex-row items-stretch md:items-start justify-between w-full text-black font-sans mt-1 mb-1 gap-y-2 md:gap-x-3 text-xs flex-none">
              {/* Left Side: Party Name, Address, Phone */}
              <div className="flex-1 min-w-0 space-y-1">
                {/* Row 1: Party Name */}
                <div className="flex items-center w-full min-h-[22px] relative challan-party-container">
                  <span className="w-[78px] flex-none font-semibold text-black whitespace-nowrap text-left text-xs">
                    Party Name
                  </span>
                  <span className="w-2 flex-none text-center font-semibold text-black text-xs">:</span>

                  <div className="flex-1 min-w-0 relative">
                    <input
                      id="challan-party-name-input"
                      ref={partyNameInputRef}
                      type="text"
                      value={partyName}
                      onChange={(e) => {
                        setPartyName(e.target.value);
                        setPartySearchQuery(e.target.value);
                        setIsShowingAllFormParties(false);
                        setShowPartyDropdown(true);
                        setPartyHighlightIdx(0);
                      }}
                      onFocus={() => {
                        setShowPartyDropdown(true);
                        setIsShowingAllFormParties(true);
                        setPartySearchQuery('');
                        setPartyHighlightIdx(0);
                      }}
                      onKeyDown={(e) => {
                        const filtered = (isShowingAllFormParties || !partySearchQuery.trim())
                          ? branchFilteredParties
                          : branchFilteredParties.filter((p) => {
                              const q = partySearchQuery.toLowerCase().trim();
                              const target = `${p.name} ${p.address || ''} ${p.phone || ''} ${p.salesmanCode || ''}`.toLowerCase();
                              return target.includes(q);
                            });
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!showPartyDropdown) {
                            setShowPartyDropdown(true);
                            setPartyHighlightIdx(0);
                          } else if (filtered.length > 0) {
                            setPartyHighlightIdx((prev) => (prev + 1) % filtered.length);
                          }
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!showPartyDropdown) {
                            setShowPartyDropdown(true);
                            setPartyHighlightIdx(0);
                          } else if (filtered.length > 0) {
                            setPartyHighlightIdx((prev) => (prev - 1 + filtered.length) % filtered.length);
                          }
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (showPartyDropdown && filtered.length > 0) {
                            const chosen = filtered[partyHighlightIdx] || filtered[0];
                            handleSelectParty(chosen);
                          } else {
                            setShowPartyDropdown(false);
                            const firstItem = document.getElementById('challan-item-desc-0') as HTMLInputElement | null;
                            if (firstItem) {
                              firstItem.focus();
                              firstItem.select();
                            }
                          }
                        } else if (e.key === 'Escape') {
                          setShowPartyDropdown(false);
                        }
                      }}
                      placeholder="Search or enter party name..."
                      style={{ fontSize: getDynamicPartyFontSize(partyName, 12), lineHeight: '1.2' }}
                      className="w-full font-bold border-b border-dotted border-black pb-0.5 bg-transparent focus:bg-white focus:outline-none text-left text-xs"
                    />

                    {/* Party Autocomplete Dropdown */}
                    {showPartyDropdown && (
                      <div
                        ref={partyDropdownRef}
                        className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-slate-300 rounded-xl shadow-2xl divide-y divide-slate-100 no-print"
                      >
                        <div className="p-1.5 bg-slate-100 text-[10px] font-bold text-slate-600 uppercase flex justify-between items-center sticky top-0 z-10">
                          <span>Select Customer / Party ({branchFilteredParties.length})</span>
                          <button
                            type="button"
                            onClick={() => setShowPartyDropdown(false)}
                            className="text-slate-400 hover:text-rose-600 px-1 text-xs font-bold cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                        {(() => {
                          const filtered = (isShowingAllFormParties || !partySearchQuery.trim())
                            ? branchFilteredParties
                            : branchFilteredParties.filter((p) => {
                                const q = partySearchQuery.toLowerCase().trim();
                                const target = `${p.name} ${p.address || ''} ${p.phone || ''} ${p.salesmanCode || ''}`.toLowerCase();
                                return target.includes(q);
                              });
                          if (filtered.length === 0) {
                            return <div className="p-3 text-xs text-slate-400 text-center italic">No matching party found. Type custom party name above.</div>;
                          }
                          return filtered.map((p, pIdx) => (
                            <div
                              key={p.id ? `${p.id}-${pIdx}` : `party-${pIdx}`}
                              data-challan-party-highlighted={pIdx === partyHighlightIdx ? 'true' : 'false'}
                              onClick={() => handleSelectParty(p)}
                              onMouseEnter={() => setPartyHighlightIdx(pIdx)}
                              className={`p-2 cursor-pointer transition-colors flex items-center justify-between ${
                                pIdx === partyHighlightIdx ? 'bg-emerald-50 text-emerald-950 font-bold border-l-4 border-emerald-600' : 'hover:bg-slate-50'
                              }`}
                            >
                              <div>
                                <div className="font-bold text-xs text-slate-900">{p.name}</div>
                                {p.address && <div className="text-[10px] text-slate-500 truncate">{p.address}</div>}
                              </div>
                              {p.salesmanCode && (
                                <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold flex-none">
                                  {p.salesmanCode}
                                </span>
                              )}
                            </div>
                          ));
                        })()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Row 2: Address */}
                <div className="flex items-center w-full min-h-[22px]">
                  <span className="w-[78px] flex-none font-semibold text-black whitespace-nowrap text-left text-xs">Address</span>
                  <span className="w-2 flex-none text-center font-semibold text-black text-xs">:</span>
                  <input
                    type="text"
                    value={partyAddress}
                    onChange={(e) => setPartyAddress(e.target.value)}
                    placeholder="Customer address..."
                    style={{ fontSize: getDynamicAddressFontSize(partyAddress, 12), lineHeight: '1.2' }}
                    className="flex-1 min-w-0 font-semibold border-b border-dotted border-black pb-0.5 bg-transparent focus:bg-white focus:outline-none text-left text-xs"
                  />
                </div>

                {/* Row 3: Phone */}
                <div className="flex items-center w-full min-h-[22px]">
                  <span className="w-[78px] flex-none font-semibold text-black whitespace-nowrap text-left text-xs">Phone</span>
                  <span className="w-2 flex-none text-center font-semibold text-black text-xs">:</span>
                  <input
                    type="text"
                    value={partyPhone}
                    onChange={(e) => setPartyPhone(e.target.value)}
                    placeholder="Customer phone / mobile..."
                    className="flex-1 min-w-0 font-semibold border-b border-dotted border-black pb-0.5 bg-transparent focus:bg-white focus:outline-none text-left text-xs"
                  />
                </div>
              </div>

              {/* Right Side: Challan No, Date, Order No & Date, Ref No, Salesman */}
              <div className="w-full md:w-[240px] flex-none space-y-1">
                {/* Row 1: Order No & Date */}
                <div className="flex items-center justify-start min-h-[22px] w-full text-xs">
                  <span className="w-[74px] flex-none font-semibold text-black whitespace-nowrap text-left">Order No.</span>
                  <span className="w-2 flex-none text-center font-semibold text-black">:</span>
                  <input
                    type="text"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="Order #"
                    className="font-semibold w-[58px] flex-none text-center border-b border-dotted border-black pb-0 bg-transparent focus:bg-white focus:outline-none text-xs"
                  />
                  <span className="w-[34px] flex-none font-semibold text-black whitespace-nowrap text-right pr-0.5">Date:</span>
                  <div className="relative flex-1 flex items-center">
                    <input
                      id="challan-order-date-input"
                      ref={orderDateInputRef}
                      type="text"
                      value={orderDate || formatDateDDMMYY(challanDate)}
                      onChange={(e) => setOrderDate(e.target.value)}
                      onBlur={() => {
                        if (orderDate.trim()) {
                          setOrderDate(formatDateDDMMYY(orderDate) || orderDate);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (orderDate.trim()) {
                            setOrderDate(formatDateDDMMYY(orderDate) || orderDate);
                          }
                          if (challanDateInputRef.current) {
                            challanDateInputRef.current.focus();
                            challanDateInputRef.current.select();
                          } else {
                            const chDate = document.getElementById('challan-date-input') as HTMLInputElement | null;
                            if (chDate) {
                              chDate.focus();
                              chDate.select();
                            }
                          }
                        }
                      }}
                      placeholder="dd.mm.yy"
                      className="font-semibold border-b border-dotted border-black w-full text-center pb-0 pr-4 bg-transparent focus:bg-white focus:outline-none text-xs font-mono"
                    />
                    <div className="absolute right-0 top-0 bottom-0 flex items-center justify-center no-print">
                      <input
                        type="date"
                        tabIndex={-1}
                        value={parseDateToISO(orderDate || challanDate)}
                        onChange={(e) => {
                          if (e.target.value) {
                            setOrderDate(formatDateDDMMYY(e.target.value));
                          }
                        }}
                        className="opacity-0 absolute inset-0 w-4 h-full cursor-pointer z-10"
                        title="Pick Order Date (dd.mm.yy)"
                      />
                      <Calendar className="w-3 h-3 text-slate-500 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Row 2: Challan No. & Date */}
                <div className="flex items-center justify-start min-h-[22px] w-full text-xs">
                  <span className="w-[74px] flex-none font-semibold text-black whitespace-nowrap text-left">Challan No.</span>
                  <span className="w-2 flex-none text-center font-semibold text-black">:</span>
                  <input
                    type="text"
                    value={challanNo}
                    onChange={(e) => setChallanNo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (challanDateInputRef.current) {
                          challanDateInputRef.current.focus();
                          challanDateInputRef.current.select();
                        }
                      }
                    }}
                    placeholder="C-001"
                    className="font-bold w-[64px] flex-none text-center border-b border-dotted border-black pb-0 bg-transparent focus:bg-white focus:outline-none text-xs font-mono"
                  />
                  <span className="w-[34px] flex-none font-semibold text-black whitespace-nowrap text-right pr-0.5">Date:</span>
                  <div className="relative flex-1 flex items-center">
                    <input
                      id="challan-date-input"
                      ref={challanDateInputRef}
                      type="text"
                      value={challanDate}
                      onChange={(e) => setChallanDate(e.target.value)}
                      onBlur={() => {
                        if (challanDate.trim()) {
                          setChallanDate(formatDateDDMMYY(challanDate) || challanDate);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (challanDate.trim()) {
                            setChallanDate(formatDateDDMMYY(challanDate) || challanDate);
                          }
                          if (partyNameInputRef.current) {
                            partyNameInputRef.current.focus();
                            partyNameInputRef.current.select();
                          } else {
                            const pInput = document.getElementById('challan-party-name-input') as HTMLInputElement | null;
                            if (pInput) {
                              pInput.focus();
                              pInput.select();
                            }
                          }
                        }
                      }}
                      placeholder="dd.mm.yy"
                      className="font-semibold border-b border-dotted border-black w-full text-center pb-0 pr-4 bg-transparent focus:bg-white focus:outline-none text-xs font-mono"
                    />
                    <div className="absolute right-0 top-0 bottom-0 flex items-center justify-center no-print">
                      <input
                        type="date"
                        tabIndex={-1}
                        value={parseDateToISO(challanDate)}
                        onChange={(e) => {
                          if (e.target.value) {
                            setChallanDate(formatDateDDMMYY(e.target.value));
                          }
                        }}
                        className="opacity-0 absolute inset-0 w-4 h-full cursor-pointer z-10"
                        title="Pick Challan Date (dd.mm.yy)"
                      />
                      <Calendar className="w-3 h-3 text-slate-500 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Row 3: Ref No. & Salesman Code */}
                <div className="flex items-center justify-start min-h-[22px] w-full text-xs">
                  <span className="w-[74px] flex-none font-semibold text-black whitespace-nowrap text-left">Ref. No.</span>
                  <span className="w-2 flex-none text-center font-semibold text-black">:</span>
                  <input
                    type="text"
                    value={refNo}
                    onChange={(e) => setRefNo(e.target.value)}
                    placeholder="Ref #"
                    className="font-semibold w-[58px] flex-none text-left border-b border-dotted border-black pb-0 bg-transparent focus:bg-white focus:outline-none text-xs"
                  />
                  <span className="w-[34px] flex-none font-semibold text-black whitespace-nowrap text-right pr-0.5">Code:</span>
                  <select
                    value={salesmanCode}
                    onChange={(e) => {
                      const code = e.target.value;
                      setSalesmanCode(code);
                      const sp = branchFilteredSalespersons.find((s) => s.code.toLowerCase() === code.toLowerCase())
                        || salespersons.find((s) => s.code.toLowerCase() === code.toLowerCase());
                      setSalespersonName(sp ? sp.name : code);
                    }}
                    className="font-semibold border-b border-dotted border-black w-full text-left pb-0 bg-transparent focus:bg-white focus:outline-none text-xs cursor-pointer"
                  >
                    <option value="">--</option>
                    {branchFilteredSalespersons.map((s) => (
                      <option key={s.id} value={s.code}>
                        {s.code} ({s.name})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* THE SPREADSHEET TABLE ON PAD (Matching Bill Invoice Table) */}
            {/* ========================================================================= */}
            <div className="mt-2 border-2 border-black overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-xs">
                <thead>
                  <tr className="border-b-2 border-black text-black font-bold text-center bg-slate-50/50">
                    <th className="py-1 px-1 w-8 border-r border-black">SL</th>
                    <th className="py-1 px-2 border-r border-black text-left">
                      Description / Product Item
                    </th>
                    <th className="py-1 px-1 w-16 border-r border-black text-right">Quantity</th>
                    <th className="py-1 px-1 w-14 border-r border-black text-center">Unit</th>
                    <th className="py-1 px-1 w-20 border-r border-black text-right">Rate (৳)</th>
                    <th className="py-1 px-1 w-24 border-r border-black text-right">Amount (৳)</th>
                    <th className="py-1 px-1 w-12 text-center no-print"></th>
                  </tr>
                </thead>
                <tbody>
                  {formLines.map((line, idx) => {
                    const categoryOrderList = getAllCategories();
                    const qDesc = (line.itemDescription || '').trim();

                    const matchedRaw = items.filter((i) => {
                      if (!qDesc) return true;
                      const fullText = `${i.name} ${i.category || ''} ${i.sizeSpec || ''} ${i.unit || ''}`.trim();
                      return matchesFlexibleSearch(fullText, qDesc);
                    });
                    const groupedFiltered = groupItemsByCategoryOrder(matchedRaw, categoryOrderList);
                    const filteredItems = groupedFiltered.orderedItems;

                    const hasItem = Boolean(line.itemDescription && line.itemDescription.trim());

                    // Check if line has colors defined
                    const hasColors = line.colors && (
                      (line.colors.red || 0) > 0 ||
                      (line.colors.blk || 0) > 0 ||
                      (line.colors.yel || 0) > 0 ||
                      (line.colors.grn || 0) > 0 ||
                      (line.colors.blu || 0) > 0 ||
                      (line.colors.others || 0) > 0
                    );

                    return (
                      <tr key={line.id || idx} className="border-b border-black hover:bg-slate-50/50 group">
                        {/* SL */}
                        <td className="py-1 px-1 text-center font-bold text-black border-r border-black align-middle text-xs">
                          {hasItem ? `${String(idx + 1).padStart(2, '0')}.` : ''}
                        </td>

                        {/* Product Item / Description with Search Combobox & Color Tags */}
                        <td className="py-1 px-1.5 border-r border-black align-middle relative challan-item-cell-container challan-item-container">
                          <div className="relative flex items-center">
                            <input
                              id={`challan-item-desc-${idx}`}
                              type="text"
                              value={line.itemDescription}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFormLines((prev) => {
                                  const updated = [...prev];
                                  if (updated[idx]) {
                                    updated[idx] = { ...updated[idx], itemDescription: val };
                                  }
                                  return updated;
                                });
                                setActiveItemDropdownIdx(idx);
                                setItemHighlightIdx(0);
                              }}
                              onFocus={() => {
                                setActiveItemDropdownIdx(idx);
                                setItemHighlightIdx(0);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (activeItemDropdownIdx !== idx) {
                                    setActiveItemDropdownIdx(idx);
                                    setItemHighlightIdx(0);
                                  } else if (filteredItems.length > 0) {
                                    setItemHighlightIdx((prev) => (prev + 1) % filteredItems.length);
                                  }
                                } else if (e.key === 'ArrowUp') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (activeItemDropdownIdx !== idx) {
                                    setActiveItemDropdownIdx(idx);
                                    setItemHighlightIdx(0);
                                  } else if (filteredItems.length > 0) {
                                    setItemHighlightIdx((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
                                  }
                                } else if (e.key === 'Enter') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (activeItemDropdownIdx === idx && filteredItems.length > 0) {
                                    const selected = filteredItems[itemHighlightIdx] || filteredItems[0];
                                    handleSelectItem(idx, selected);
                                  } else {
                                    const qtyInput = document.getElementById(`challan-item-qty-${idx}`) as HTMLInputElement | null;
                                    if (qtyInput && (!line.coilQty || Number(line.coilQty) <= 0)) {
                                      qtyInput.focus();
                                      qtyInput.select();
                                    } else {
                                      if (discountPercentInputRef.current) {
                                        discountPercentInputRef.current.focus();
                                        discountPercentInputRef.current.select();
                                      }
                                    }
                                  }
                                } else if (e.key === 'Escape') {
                                  setActiveItemDropdownIdx(null);
                                }
                              }}
                              placeholder={idx === 0 ? "Search or select cable/item..." : ""}
                              className="w-full font-bold text-black bg-transparent p-0 focus:bg-white focus:outline-none border-none shadow-none text-xs truncate"
                            />

                            {/* Close / Clear button on right side of item name */}
                            {line.itemDescription ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setFormLines((prev) => {
                                    const updated = [...prev];
                                    if (updated[idx]) {
                                      updated[idx] = {
                                        ...updated[idx],
                                        itemDescription: '',
                                        sizeSpec: '',
                                        rate: 0,
                                        coilQty: 0,
                                        amount: 0,
                                        colors: undefined
                                      };
                                    }
                                    return updated;
                                  });
                                  setActiveItemDropdownIdx(null);
                                  const input = document.getElementById(`challan-item-desc-${idx}`) as HTMLInputElement | null;
                                  input?.focus();
                                }}
                                className="p-0.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded no-print transition-colors cursor-pointer flex-none"
                                title="Clear Item Name (✕)"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            ) : null}

                            {(hasItem || idx === 0 || activeItemDropdownIdx === idx) && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (activeItemDropdownIdx === idx) {
                                    setActiveItemDropdownIdx(null);
                                  } else {
                                    setActiveItemDropdownIdx(idx);
                                    setItemHighlightIdx(0);
                                  }
                                }}
                                className="p-0.5 text-slate-400 hover:text-slate-800 no-print transition-colors cursor-pointer flex-none"
                                title="Open Item List"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Color Breakdown Tags Display underneath item name or Total Stock badge if not using color form */}
                          {hasColors ? (
                            <div className="mt-1 flex items-center flex-wrap gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  const matchedItem = items.find((it) => it.id === line.itemId || it.name === line.itemDescription);
                                  const itemObj = matchedItem || {
                                    id: line.itemId || `temp-${idx}`,
                                    name: line.itemDescription,
                                    unit: line.unit,
                                    rate: line.rate
                                  };
                                  const stockLedger = calculateItemColorStockLedger(itemObj as Item, factoryImports, storedBills, stockReturns);
                                  setColorModalState({
                                    isOpen: true,
                                    lineIndex: idx,
                                    item: itemObj as Item,
                                    unit: line.unit || 'Coils',
                                    initialColors: line.colors,
                                    initialTotalQty: line.coilQty,
                                    stockColors: stockLedger.closing
                                  });
                                }}
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 transition-colors cursor-pointer flex items-center space-x-1"
                                title="Click to edit color breakdown"
                              >
                                <span className="opacity-75">🎨</span>
                                {line.colors?.red ? <span className="text-rose-700 font-bold">R:{line.colors.red}</span> : null}
                                {line.colors?.blk ? <span className="text-slate-900 font-bold">B:{line.colors.blk}</span> : null}
                                {line.colors?.yel ? <span className="text-amber-700 font-bold">Y:{line.colors.yel}</span> : null}
                                {line.colors?.grn ? <span className="text-emerald-700 font-bold">G:{line.colors.grn}</span> : null}
                                {line.colors?.blu ? <span className="text-blue-700 font-bold">BL:{line.colors.blu}</span> : null}
                                {line.colors?.others ? <span className="text-purple-700 font-bold">O:{line.colors.others}</span> : null}
                              </button>
                            </div>
                          ) : (
                            hasItem && (() => {
                              const matchedItem = items.find((it) => it.id === line.itemId || it.name === line.itemDescription);
                              if (!matchedItem) return null;
                              const liveStock = getItemLiveStock(matchedItem, factoryImports);
                              const stockUnit = matchedItem.unit || line.unit || 'Coils';
                              const isColorReq = isColorApplicableCable(matchedItem);
                              const itemLedger = isColorReq ? calculateItemColorStockLedger(matchedItem, factoryImports, storedBills, stockReturns) : null;
                              const itemStock = itemLedger?.closing;

                              return (
                                <div className="mt-1 flex items-center flex-wrap gap-1">
                                  <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border ${
                                    liveStock > 0 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
                                  }`}>
                                    📦 Total Stock: {liveStock.toLocaleString('en-IN')} {stockUnit}
                                  </span>
                                  {isColorReq && itemStock && (
                                    <div className="flex items-center space-x-1 text-[9.5px] font-mono font-bold">
                                      {itemStock.red > 0 && (
                                        <span className="px-1.5 py-0.2 bg-red-50 text-red-700 border border-red-200 rounded">
                                          R:{itemStock.red}
                                        </span>
                                      )}
                                      {itemStock.blk > 0 && (
                                        <span className="px-1.5 py-0.2 bg-slate-100 text-slate-800 border border-slate-300 rounded">
                                          B:{itemStock.blk}
                                        </span>
                                      )}
                                      {itemStock.yel > 0 && (
                                        <span className="px-1.5 py-0.2 bg-amber-50 text-amber-800 border border-amber-200 rounded">
                                          Y:{itemStock.yel}
                                        </span>
                                      )}
                                      {itemStock.grn > 0 && (
                                        <span className="px-1.5 py-0.2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded">
                                          G:{itemStock.grn}
                                        </span>
                                      )}
                                      {itemStock.blu > 0 && (
                                        <span className="px-1.5 py-0.2 bg-blue-50 text-blue-800 border border-blue-200 rounded">
                                          BL:{itemStock.blu}
                                        </span>
                                      )}
                                      {itemStock.others > 0 && (
                                        <span className="px-1.5 py-0.2 bg-purple-50 text-purple-800 border border-purple-200 rounded">
                                          O:{itemStock.others}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })()
                          )}

                          {/* Autocomplete Dropdown */}
                          {activeItemDropdownIdx === idx && (
                            <div
                              ref={itemDropdownRef}
                              className="absolute left-0 top-full mt-1 w-full min-w-[250px] max-w-[calc(100vw-2.5rem)] sm:min-w-[540px] md:min-w-[620px] sm:max-w-none max-h-64 overflow-y-auto bg-white border border-slate-300 rounded-xl shadow-2xl z-50 text-left font-sans text-xs divide-y divide-slate-100 no-print"
                            >
                              <div className="py-1 px-2.5 bg-slate-100 font-bold text-[10px] text-slate-600 uppercase flex justify-between items-center border-b border-slate-200 sticky top-0 z-10">
                                <div className="flex items-center gap-1.5">
                                  <span>Select Product Item ({filteredItems.length} found)</span>
                                  {line.itemDescription && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setFormLines((prev) => {
                                          const updated = [...prev];
                                          if (updated[idx]) {
                                            updated[idx] = { ...updated[idx], itemDescription: '' };
                                          }
                                          return updated;
                                        });
                                        const input = document.getElementById(`challan-item-desc-${idx}`) as HTMLInputElement | null;
                                        input?.focus();
                                      }}
                                      className="px-1.5 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[9px] font-bold cursor-pointer transition-colors"
                                      title="Reset search query"
                                    >
                                      Reset List
                                    </button>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setActiveItemDropdownIdx(null)}
                                  className="text-slate-400 hover:text-rose-600 text-xs px-1 font-bold cursor-pointer"
                                >
                                  ✕
                                </button>
                              </div>

                              {filteredItems.length === 0 ? (
                                <div className="py-3 px-3 text-slate-400 text-center italic text-xs">
                                  No items match "{line.itemDescription}".
                                </div>
                              ) : (
                                groupedFiltered.groups.map((grp) => (
                                  <div key={grp.category} className="divide-y divide-slate-100">
                                    <div className="px-2.5 py-1 bg-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-700 border-y border-slate-200">
                                      {grp.category} ({grp.items.length})
                                    </div>
                                    {grp.items.map(({ item, flatIndex: itemIdx }) => {
                                      const isHighlighted = itemHighlightIdx === itemIdx;
                                      const itemLedger = calculateItemColorStockLedger(item, factoryImports, storedBills, stockReturns);
                                      const itemStock = itemLedger.closing;
                                      const liveStock = itemStock.total || getItemLiveStock(item, factoryImports);
                                      const stockUnit = item.unit || 'Coils';
                                      const isColorReq = isColorApplicableCable(item);

                                      return (
                                        <div
                                          key={item.id || itemIdx}
                                          data-challan-item-highlighted={isHighlighted ? 'true' : 'false'}
                                          onMouseDown={(e) => {
                                            e.preventDefault();
                                            handleSelectItem(idx, item);
                                          }}
                                          onMouseEnter={() => setItemHighlightIdx(itemIdx)}
                                          className={`w-full text-left py-1.5 px-2.5 transition-colors flex items-center justify-between gap-2 cursor-pointer whitespace-nowrap overflow-hidden ${
                                            isHighlighted
                                              ? 'bg-emerald-100 text-slate-900 border-l-4 border-emerald-600 font-bold'
                                              : 'hover:bg-slate-50 text-slate-800'
                                          }`}
                                        >
                                          {/* Single line: Item Name & category & unit */}
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="font-bold text-slate-900 text-xs truncate">{item.name}</span>
                                            {item.category && (
                                              <span className="text-[10px] text-slate-400 font-medium shrink-0">
                                                ({item.category} • {stockUnit})
                                              </span>
                                            )}
                                          </div>

                                          {/* Stock Colours Visible on the Single Line */}
                                          {isColorReq ? (
                                            <div className="flex items-center space-x-1 shrink-0 text-[9.5px] font-mono font-bold">
                                              {itemStock.red > 0 && (
                                                <span className="px-1.5 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded" title="Red Stock">
                                                  R:{itemStock.red}
                                                </span>
                                              )}
                                              {itemStock.blk > 0 && (
                                                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-800 border border-slate-300 rounded" title="Black Stock">
                                                  B:{itemStock.blk}
                                                </span>
                                              )}
                                              {itemStock.yel > 0 && (
                                                <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded" title="Yellow Stock">
                                                  Y:{itemStock.yel}
                                                </span>
                                              )}
                                              {itemStock.grn > 0 && (
                                                <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded" title="Green Stock">
                                                  G:{itemStock.grn}
                                                </span>
                                              )}
                                              {itemStock.blu > 0 && (
                                                <span className="px-1.5 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded" title="Blue Stock">
                                                  BL:{itemStock.blu}
                                                </span>
                                              )}
                                              {itemStock.others > 0 && (
                                                <span className="px-1.5 py-0.5 bg-purple-50 text-purple-800 border border-purple-200 rounded" title="Others Stock">
                                                  O:{itemStock.others}
                                                </span>
                                              )}
                                              <span className={`px-1.5 py-0.5 rounded font-sans text-[10px] ${
                                                liveStock > 0 ? 'bg-emerald-700 text-white' : 'bg-rose-600 text-white'
                                              }`} title="Total Showroom Stock">
                                                Stk:{liveStock}
                                              </span>
                                            </div>
                                          ) : (
                                            <div className="flex items-center flex-none">
                                              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                                liveStock > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                              }`}>
                                                Stock: {liveStock.toLocaleString('en-IN')} {stockUnit}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ))
                              )}

                              <div className="p-1.5 bg-emerald-50 border-t border-emerald-200 sticky bottom-0 z-10">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuickAddInitialData({
                                      name: line.itemDescription,
                                      rate: line.rate,
                                      unit: line.unit,
                                      rowIndex: idx
                                    });
                                    setQuickAddModalOpen(true);
                                    setActiveItemDropdownIdx(null);
                                  }}
                                  className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-all cursor-pointer"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span className="truncate">+ Add "{line.itemDescription.trim() || 'New Item'}" to Master Catalog</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Quantity */}
                        <td className="py-1 px-1 border-r border-black text-right align-middle">
                          <input
                            id={`challan-item-qty-${idx}`}
                            type="number"
                            min="0"
                            value={line.coilQty === 0 ? '' : line.coilQty}
                            onChange={(e) => handleLineQtyChange(idx, parseFloat(e.target.value) || 0)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const currentQty = Number(line.coilQty) || 0;
                                const hasItemName = Boolean(line.itemDescription && line.itemDescription.trim().length > 0);

                                if (currentQty <= 0) {
                                  // User rule: item select but quantity 0 and press enter focus goes to discount then remove 0 quantity row and check blank row but sl no have then remove that
                                  setFormLines((prev) => {
                                    const valid = prev.filter((l, i) => {
                                      if (i === idx) return false;
                                      const hasDesc = Boolean(l.itemDescription && l.itemDescription.trim().length > 0);
                                      const q = Number(l.coilQty) || 0;
                                      if (!hasDesc || q <= 0) return false;
                                      return true;
                                    });
                                    if (valid.length > 0) {
                                      return valid.map((l, i) => ({ ...l, slNo: i + 1 }));
                                    }
                                    return [createEmptyChallanLine(1)];
                                  });
                                  setTimeout(() => {
                                    if (discountPercentInputRef.current) {
                                      discountPercentInputRef.current.focus();
                                      discountPercentInputRef.current.select();
                                    }
                                  }, 50);
                                } else {
                                  // Quantity is valid (> 0), move to next item line
                                  if (idx < formLines.length - 1) {
                                    const nextItemInput = document.getElementById(`challan-item-desc-${idx + 1}`) as HTMLInputElement | null;
                                    if (nextItemInput) {
                                      nextItemInput.focus();
                                      nextItemInput.select();
                                    }
                                  } else {
                                    const nextLine = createEmptyChallanLine(formLines.length + 1);
                                    setFormLines((prev) => [...prev, nextLine]);
                                    setTimeout(() => {
                                      const nextItemInput = document.getElementById(`challan-item-desc-${idx + 1}`) as HTMLInputElement | null;
                                      if (nextItemInput) {
                                        nextItemInput.focus();
                                        nextItemInput.select();
                                      }
                                    }, 50);
                                  }
                                }
                              }
                            }}
                            placeholder=""
                            className="w-full text-right font-bold text-black bg-transparent p-0 focus:bg-white focus:outline-none border-none shadow-none text-xs"
                          />
                        </td>

                        {/* Unit */}
                        <td className="py-1 px-1 border-r border-black text-center align-middle">
                          <input
                            type="text"
                            value={hasItem ? (line.unit || 'Coils') : (line.unit && line.unit !== 'Coils' ? line.unit : '')}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormLines((prev) => {
                                const updated = [...prev];
                                if (updated[idx]) {
                                  updated[idx] = { ...updated[idx], unit: val };
                                }
                                return updated;
                              });
                            }}
                            className="w-full text-center font-semibold text-black bg-transparent p-0 focus:bg-white focus:outline-none border-none shadow-none text-xs"
                          />
                        </td>

                        {/* Rate */}
                        <td className="py-1 px-1 border-r border-black text-right align-middle">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={line.rate === 0 ? '' : line.rate}
                            onChange={(e) => handleLineRateChange(idx, parseFloat(e.target.value) || 0)}
                            placeholder=""
                            className="w-full text-right font-mono font-semibold text-black bg-transparent p-0 focus:bg-white focus:outline-none border-none shadow-none text-xs"
                          />
                        </td>

                        {/* Amount */}
                        <td className="py-1 px-1 border-r border-black text-right font-mono font-bold text-black align-middle text-xs">
                          {line.amount && line.amount > 0 ? `${(line.amount).toLocaleString('en-IN')}/-` : ''}
                        </td>

                        {/* Actions (Move & Delete) */}
                        <td className="py-1 px-0.5 text-center align-middle no-print whitespace-nowrap">
                          <div className="flex items-center justify-center space-x-0.5">
                            <button
                              type="button"
                              onClick={() => handleMoveLine(idx, idx - 1)}
                              disabled={idx === 0}
                              className="text-slate-300 hover:text-emerald-700 disabled:opacity-20 disabled:hover:text-slate-300 p-0.5 cursor-pointer disabled:cursor-not-allowed transition-colors"
                              title="Move line up"
                            >
                              <ChevronUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveLine(idx, idx + 1)}
                              disabled={idx === formLines.length - 1}
                              className="text-slate-300 hover:text-emerald-700 disabled:opacity-20 disabled:hover:text-slate-300 p-0.5 cursor-pointer disabled:cursor-not-allowed transition-colors"
                              title="Move line down"
                            >
                              <ChevronDown className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLine(idx)}
                              className="text-slate-300 hover:text-rose-600 p-0.5 cursor-pointer transition-colors"
                              title="Delete line"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                <tfoot>
                  {/* Total Coils & Subtotal Row */}
                  <tr className="border-t-2 border-black font-semibold bg-slate-50/50">
                    <td colSpan={2} className="py-1 px-2 text-right border-r border-black font-semibold whitespace-nowrap">
                      Total Coils =
                    </td>
                    <td className="py-1 px-1 text-right border-r border-black font-semibold text-black font-mono">
                      {formLines.reduce((s, l) => s + (Number(l.coilQty) || 0), 0)}
                    </td>
                    <td className="border-r border-black text-center font-semibold text-slate-700">
                      Coils
                    </td>
                    <td className="py-1 px-1 text-right border-r border-black font-semibold whitespace-nowrap">
                      Subtotal =
                    </td>
                    <td className="py-1 px-1 text-right font-semibold text-black whitespace-nowrap font-mono">
                      {formLines.reduce((s, l) => s + (Number(l.amount) || 0), 0)
                        ? `${formLines.reduce((s, l) => s + (Number(l.amount) || 0), 0).toLocaleString('en-IN')}/-`
                        : '0/-'}
                    </td>
                    <td className="no-print"></td>
                  </tr>

                  {/* Sales Discount Row matching Bill page */}
                  <tr className="border-t border-black font-semibold">
                    <td colSpan={5} className="py-1 px-2 text-right border-r border-black font-semibold whitespace-nowrap">
                      <span className="whitespace-nowrap inline-flex items-center justify-end space-x-1">
                        <span>Sales Discount </span>
                        <input
                          ref={discountPercentInputRef}
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={challanDiscountPercent === 0 ? '' : challanDiscountPercent}
                          onChange={(e) => handleDiscountPercentChange(parseFloat(e.target.value) || 0)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (discountAmountInputRef.current) {
                                discountAmountInputRef.current.focus();
                                discountAmountInputRef.current.select();
                              } else if (saveChallanBtnRef.current) {
                                saveChallanBtnRef.current.focus();
                              }
                            }
                          }}
                          placeholder="0"
                          className="w-12 text-center border border-slate-300 rounded px-1 py-0.5 font-semibold text-emerald-800 bg-white"
                        />
                        <span>% =</span>
                      </span>
                    </td>
                    <td className="py-1 px-1 text-right font-semibold text-black whitespace-nowrap font-mono">
                      <input
                        ref={discountAmountInputRef}
                        type="number"
                        min="0"
                        value={
                          challanDiscountAmount > 0
                            ? challanDiscountAmount
                            : (challanDiscountPercent > 0
                              ? Math.round((formLines.reduce((s, l) => s + (Number(l.amount) || 0), 0) * challanDiscountPercent) / 100)
                              : '')
                        }
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setChallanDiscountAmount(val);
                          const sub = formLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
                          if (sub > 0) {
                            setChallanDiscountPercent(Number(((val / sub) * 100).toFixed(2)));
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (remarksInputRef.current) {
                              remarksInputRef.current.focus();
                              remarksInputRef.current.select();
                            } else {
                              const rInput = document.getElementById('challan-remarks-input') as HTMLInputElement | null;
                              if (rInput) {
                                rInput.focus();
                                rInput.select();
                              }
                            }
                          }
                        }}
                        placeholder="0"
                        className="w-full text-right border border-emerald-300 focus:border-emerald-600 rounded px-1 py-0.5 font-semibold text-emerald-900 bg-emerald-50/50 focus:bg-white focus:outline-none"
                      />
                    </td>
                    <td className="no-print"></td>
                  </tr>

                  {/* Grand Total */}
                  <tr className="border-t border-black font-extrabold">
                    <td colSpan={5} className="py-1 px-2 text-right border-r border-black font-black whitespace-nowrap">
                      Total =
                    </td>
                    <td className="py-1 px-1 text-right text-black font-black whitespace-nowrap font-mono">
                      ৳{Math.max(0, Math.round(
                        formLines.reduce((s, l) => s + (Number(l.amount) || 0), 0) -
                        (challanDiscountAmount > 0
                          ? challanDiscountAmount
                          : ((formLines.reduce((s, l) => s + (Number(l.amount) || 0), 0) * (challanDiscountPercent || 0)) / 100))
                      )).toLocaleString('en-IN')}/-
                    </td>
                    <td className="no-print"></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* In Word & Remarks row below table matching Bill Page */}
            <div className="pt-2 text-black flex items-center space-x-2 flex-none text-xs">
              <span className="font-semibold text-black">In Word:</span>
              <span className="font-bold text-black italic">
                {convertToTakaWords(
                  Math.max(0, Math.round(
                    formLines.reduce((s, l) => s + (Number(l.amount) || 0), 0) -
                    (challanDiscountAmount > 0
                      ? challanDiscountAmount
                      : ((formLines.reduce((s, l) => s + (Number(l.amount) || 0), 0) * (challanDiscountPercent || 0)) / 100))
                  ))
                )}
              </span>
            </div>

            {/* Remarks row */}
            <div className="pt-1 text-black flex items-center space-x-2 flex-none text-xs">
              <span className="font-semibold text-black">Remarks:</span>
              <input
                id="challan-remarks-input"
                ref={remarksInputRef}
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (saveAndNewBtnRef.current) {
                      saveAndNewBtnRef.current.focus();
                    } else if (saveChallanBtnRef.current) {
                      saveChallanBtnRef.current.focus();
                    }
                  }
                }}
                placeholder="Vehicle number, driver, delivery instructions..."
                className="flex-1 font-medium text-black border-b border-dotted border-black pb-0.5 bg-transparent focus:bg-white focus:outline-none text-xs"
              />
            </div>

            {/* Clearance space after Challan table & In Word: min 5 lines normally, 3 lines when many items */}
            <div
              className={`${
                formLines.filter((l) => l.itemDescription?.trim() || (Number(l.coilQty) || 0) > 0).length >= 10
                  ? 'min-h-[42px] h-[42px]'
                  : 'min-h-[75px] h-[75px]'
              } flex-none w-full`}
              aria-hidden="true"
            ></div>

            {/* Footer Signatures (4 standard signatures) */}
            <div className="w-full pb-0 flex-none grid grid-cols-4 gap-4 sm:gap-8 text-center text-black font-semibold text-xs">
              <div>
                <div className="border-t border-black pt-1">
                  Receiver's Signature
                </div>
              </div>
              <div>
                <div className="border-t border-black pt-1">
                  Prepared By
                </div>
              </div>
              <div>
                <div className="border-t border-black pt-1">
                  Check By
                </div>
              </div>
              <div>
                <div className="border-t border-black pt-1">
                  Approved By
                </div>
              </div>
            </div>

            {/* Bottom Registered Office Footer for Plain Paper Mode */}
            <div className={`w-full pt-3 text-center text-[#0284c7] font-semibold text-[10.5px] leading-tight flex-none border-t border-sky-200/50 mt-2 ${challanPadHeaderMode !== 'plain' ? 'hide-on-preprinted-pad invisible opacity-0 h-0 overflow-hidden' : ''}`}>
              House-16, Block-C, Main Road, Aftabnagar, Dhaka-1212. Tel : (+88) 02-226602861-8, Web : www.polycables.com.bd
            </div>
          </div>

          {/* BOTTOM ACTION BAR: Utilities on left, Cancel & Save on right */}
          <div className="w-full max-w-4xl mx-auto mt-4 mb-6 flex flex-wrap items-center justify-between gap-3 no-print px-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg p-0.5 bg-[#061520] border border-cyan-500/25 shrink-0">
                <button
                  type="button"
                  onClick={() => setChallanPadHeaderMode('plain')}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    challanPadHeaderMode === 'plain'
                      ? 'bg-cyan-400 text-slate-950 font-black shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="Full Banner & Company Header (Plain Paper)"
                >
                  Plain Paper
                </button>
                <button
                  type="button"
                  onClick={() => setChallanPadHeaderMode('hide_logo')}
                  className={`px-2.5 py-1 text-[11px] font-black rounded-md transition-all cursor-pointer whitespace-nowrap ${
                    challanPadHeaderMode === 'hide_logo'
                      ? 'bg-amber-400 text-slate-950 shadow-md'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="Pre-Printed Pad Stationery (Hides Banner Logo)"
                >
                  Pad (Hide Logo)
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setPreviewingChallan(getCurrentFormChallan());
                  setChallanPadHeaderMode('hide_logo');
                }}
                className="bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/30 rounded-lg px-2.5 py-1.5 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="Print Pad Challan"
              >
                <Printer className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Printed Pad</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPreviewingChallan(getCurrentFormChallan());
                  setChallanPadHeaderMode('slip_pad');
                }}
                className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-400/40 rounded-lg px-2.5 py-1.5 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="Print 5.5 x 8.5 Slip Pad"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                <span>Print Slip Pad</span>
              </button>

              {toastMessage && (
                <span className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all shadow-xs animate-in fade-in ${
                  toastMessage.type === 'error' ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
                }`}>
                  ✓ {toastMessage.text}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 ml-auto">
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
                  title="Close Challan View"
                >
                  <X className="w-4 h-4 text-slate-300" />
                  <span>Close</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  resetChallanForm();
                  showToast('Challan inputs reset.');
                }}
                className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
                title="Cancel current challan (Alt+C)"
              >
                <RotateCcw className="w-4 h-4" />
                <MnemonicLabel label="Cancel" mnemonic="C" />
              </button>

              <button
                ref={(el) => {
                  (saveChallanBtnRef as any).current = el;
                  (saveAndNewBtnRef as any).current = el;
                }}
                type="button"
                onClick={(e) => handleSaveChallan(e, false, !editingChallanId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveChallan(e, false, !editingChallanId);
                  }
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-xl font-extrabold text-sm flex items-center space-x-2 shadow-md transition-all cursor-pointer hover:scale-[1.02] focus:ring-4 focus:ring-emerald-400 focus:outline-none"
                title="Save & New Challan (Alt+S / Enter)"
              >
                <Save className="w-4 h-4" />
                <MnemonicLabel label={editingChallanId ? 'Update Challan' : 'Save & New'} mnemonic="S" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 3: CONVERT CHALLAN TO BILL */}
      {/* ========================================================================= */}
      {activeSubTab === 'convert_to_bill' && (
        <div className="cyber-glass-card rounded-2xl p-5 border border-cyan-500/25 space-y-5 text-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-cyan-500/20 gap-2">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                <span>Convert Challan to Bill</span>
                <span className="bg-indigo-500/20 text-indigo-200 text-[11px] font-bold px-2 py-0.5 rounded-md border border-indigo-400/40">
                  Challan Invoicing
                </span>
              </h2>
            </div>

            {selectedConvertParty && (
              <button
                onClick={handleGenerateBillFromChallans}
                className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs rounded-lg shadow-sm flex items-center space-x-2 cursor-pointer transition-all"
              >
                <FileCheck className="w-4 h-4" />
                <span>Generate Bill & Open Invoicer</span>
              </button>
            )}
          </div>

          {/* Party Selector */}
          <div className="cyber-glass-subcard p-4 rounded-xl border border-cyan-500/25 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex-1 w-full sm:w-auto sm:min-w-[260px]">
              <label className="block text-xs font-bold uppercase text-cyan-200 mb-1.5">
                Select Customer / Party To Bill:
              </label>
              <select
                value={selectedConvertParty}
                onChange={(e) => handleSelectConvertParty(e.target.value)}
                className="w-full p-2.5 bg-[#061520] border border-cyan-500/30 rounded-lg text-xs font-bold text-white cursor-pointer shadow-xs"
              >
                <option value="">-- Choose Party with Pending Challan Goods --</option>
                {partiesWithUnbilledChallans.map((p, pIdx) => (
                  <option key={`${p.partyName}-${pIdx}`} value={p.partyName}>
                    {p.partyName} ({p.unbilledChallanCount} Challans, {p.totalDueCoils} Due Coils - ৳{p.totalDueAmount.toLocaleString('en-IN')})
                  </option>
                ))}
              </select>
            </div>

            {selectedConvertParty && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const { items: agg } = aggregatedPartyChallanGoods;
                    const fullMap: Record<string, number> = {};
                    agg.forEach((it) => {
                      fullMap[it.key] = it.totalDueQty;
                    });
                    setBillQuantities(fullMap);
                    showToast('Set all items to 100% of pending due quantity');
                  }}
                  className="px-3 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs rounded-lg shadow-xs cursor-pointer"
                >
                  Bill Full (100%)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBillQuantities({});
                    showToast('Cleared billing quantities');
                  }}
                  className="px-3 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 font-bold text-xs rounded-lg cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            )}
          </div>

          {/* Aggregated Goods Display */}
          {selectedConvertParty ? (
            <div className="space-y-4">
              <div className="overflow-x-auto border border-cyan-500/25 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 font-bold uppercase text-[11px]">
                      <th className="p-3 w-12 text-center">SL#</th>
                      <th className="p-3 min-w-[220px]">Item Description</th>
                      <th className="p-3 w-24">Size/Spec</th>
                      <th className="p-3 w-20 text-center">Unit</th>
                      <th className="p-3 text-right w-24">Delivered</th>
                      <th className="p-3 text-right w-24">Already Billed</th>
                      <th className="p-3 text-right w-28 bg-amber-500/15 text-amber-200">Pending Due</th>
                      <th className="p-3 text-right w-36 bg-indigo-500/20 text-indigo-200">Bill Qty (Now) *</th>
                      <th className="p-3 text-right w-28 bg-rose-500/15 text-rose-200">Next Month Due</th>
                      <th className="p-3 text-right w-24">Rate (৳)</th>
                      <th className="p-3 text-right w-28 bg-emerald-500/15 text-emerald-200">Bill Amount (৳)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                    {aggregatedPartyChallanGoods.items.map((item, idx) => {
                      const qtyToBill = billQuantities[item.key] ?? 0;
                      const remainingDue = Math.max(0, item.totalDueQty - qtyToBill);
                      const lineBillAmount = Math.round(qtyToBill * item.rate);

                      return (
                        <tr key={item.key} className="hover:bg-cyan-500/[0.06]">
                          <td className="p-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                          <td className="p-3 font-bold text-white">
                            <div>{item.itemDescription}</div>
                            <div className="text-[10px] font-normal text-slate-400">
                              Challans: {item.challanRefs.join(', ')}
                            </div>
                          </td>
                          <td className="p-3 text-slate-300">{item.sizeSpec || '-'}</td>
                          <td className="p-3 text-center font-bold text-cyan-200">{formatDisplayUnit(item.unit, item.totalDueQty)}</td>
                          <td className="p-3 text-right font-mono font-bold text-white">{item.totalDeliveredQty}</td>
                          <td className="p-3 text-right font-mono font-bold text-emerald-300">{item.totalBilledQty}</td>
                          <td className="p-3 text-right font-mono font-bold text-amber-300 bg-amber-500/10">
                            {item.totalDueQty} {formatDisplayUnit(item.unit, item.totalDueQty)}
                          </td>
                          <td className="p-2 bg-indigo-500/10">
                            <input
                              type="number"
                              min="0"
                              max={item.totalDueQty}
                              step="any"
                              value={qtyToBill || ''}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setBillQuantities((prev) => ({
                                  ...prev,
                                  [item.key]: val
                                }));
                              }}
                              className="w-full p-1.5 border border-cyan-500/35 rounded text-xs font-mono font-bold text-right text-white bg-[#061520]"
                              placeholder="0"
                            />
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-rose-300 bg-rose-500/10">
                            {remainingDue > 0 ? `${remainingDue} Due` : '0 (Settled)'}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-200">৳{item.rate}</td>
                          <td className="p-3 text-right font-mono font-bold text-emerald-300 bg-emerald-500/10">
                            ৳{lineBillAmount.toLocaleString('en-IN')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#0c2638] text-white border-t border-cyan-500/30 font-bold text-xs">
                      <td colSpan={7} className="p-3 text-right uppercase">
                        Current Bill Total:
                      </td>
                      <td className="p-3 text-right font-mono text-indigo-300 text-sm">
                        {Object.values(billQuantities).reduce((s: number, v: unknown) => s + (Number(v) || 0), 0).toLocaleString()} Coils
                      </td>
                      <td className="p-3 text-right font-mono text-rose-300 text-xs">
                        {aggregatedPartyChallanGoods.items
                          .reduce((s, it) => s + Math.max(0, it.totalDueQty - (billQuantities[it.key] || 0)), 0)
                          .toLocaleString()}{' '}
                        Due
                      </td>
                      <td></td>
                      <td className="p-3 text-right font-mono text-emerald-300 text-sm bg-emerald-500/15">
                        ৳
                        {aggregatedPartyChallanGoods.items
                          .reduce((s, it) => s + (billQuantities[it.key] || 0) * it.rate, 0)
                          .toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleGenerateBillFromChallans}
                  className="px-6 py-2.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs rounded-lg shadow-sm flex items-center space-x-2 cursor-pointer transition-all"
                >
                  <FileCheck className="w-4 h-4" />
                  <span>Generate Bill & Open Invoicer</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 cyber-glass-subcard rounded-xl border border-dashed border-cyan-500/30">
              <Truck className="w-10 h-10 mx-auto text-cyan-400/50 mb-2" />
              <p className="font-bold text-slate-200">No customer selected.</p>
              <p className="text-xs text-slate-400 mt-1">
                Please select a customer from the dropdown above to view their unbilled challan goods.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 4: CUSTOMER DUE GOODS REGISTER */}
      {/* ========================================================================= */}
      {activeSubTab === 'due_register' && (
        <div className="cyber-glass-card rounded-2xl p-5 border border-cyan-500/25 space-y-4 text-white">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <span>Customer Challan Due Goods Register</span>
              <span className="bg-rose-500/20 text-rose-200 text-[11px] font-bold px-2 py-0.5 rounded-md border border-rose-400/40">
                Pending Billing Tracker
              </span>
            </h2>
          </div>

          <div className="overflow-x-auto border border-cyan-500/25 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 font-bold uppercase text-[11px]">
                  <th className="p-3 w-12 text-center">SL#</th>
                  <th className="p-3 min-w-[200px]">Customer / Party</th>
                  <th className="p-3 text-center w-28">Active Challans</th>
                  <th className="p-3 text-right w-32">Total Delivered</th>
                  <th className="p-3 text-right w-32">Already Billed</th>
                  <th className="p-3 text-right w-36 bg-rose-500/15 text-rose-200">Pending Due Coils</th>
                  <th className="p-3 text-right w-36 bg-amber-500/15 text-amber-200">Est. Due Value (৳)</th>
                  <th className="p-3 text-center w-36">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                {partiesWithUnbilledChallans.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400 italic">
                      All delivery challan goods are fully billed! No due items pending.
                    </td>
                  </tr>
                ) : (
                  partiesWithUnbilledChallans.map((p, idx) => (
                    <tr key={`${p.partyName}-${idx}`} className="hover:bg-cyan-500/[0.06]">
                      <td className="p-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                      <td className="p-3 font-bold text-white">{p.partyName}</td>
                      <td className="p-3 text-center font-mono font-bold text-cyan-300">
                        {p.unbilledChallanCount} Challan(s)
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-white">
                        {p.challans.reduce((s, c) => s + (c.totalQuantity || 0), 0).toLocaleString()} Coils
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-300">
                        {p.challans.reduce((s, c) => s + (c.billedQuantity || 0), 0).toLocaleString()} Coils
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-rose-300 bg-rose-500/10 text-sm">
                        {p.totalDueCoils.toLocaleString()} Coils Due
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-amber-200 bg-amber-500/10">
                        ৳{p.totalDueAmount.toLocaleString('en-IN')}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => {
                            handleSelectConvertParty(p.partyName);
                            setActiveSubTab('convert_to_bill');
                          }}
                          className="px-3 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs rounded-lg shadow-xs flex items-center justify-center space-x-1 cursor-pointer transition-all mx-auto"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                          <span>Bill Now</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>

      {/* ========================================================================= */}
      {/* CHALLAN DETAILS POPUP MODAL WINDOW (MATCHING StoredBillsDirectory) */}
      {/* ========================================================================= */}
      {selectedChallan && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto font-sans">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl max-w-4xl w-full p-6 shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 text-white space-y-4 my-8 animate-in fade-in zoom-in duration-200">
            {/* Modal Header Bar */}
            <div className="flex items-center justify-between border-b border-cyan-500/25 pb-3">
              <div className="flex items-center space-x-2">
                <span className="bg-amber-500/20 text-amber-200 border border-amber-400/40 text-xs px-2.5 py-0.5 rounded font-mono font-bold">
                  Challan Details
                </span>
                <h3 className="text-lg font-bold text-white">
                  Challan #{selectedChallan.challanNo || 'N/A'}
                </h3>
              </div>
              <button
                onClick={() => setSelectedChallan(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Document Preview */}
            <div className="bg-white p-4 border-2 border-black rounded-lg text-slate-800 space-y-4 text-xs font-sans">
              {/* Company Header */}
              <div className="text-center space-y-0.5 border-b border-slate-300 pb-3">
                <h2 className="text-xl font-black italic tracking-wider text-[#1e295b]">
                  {company.name || 'POLY CABLES'}
                </h2>
                <p className="font-bold text-xs text-black">
                  {company.address} • Mob: {company.phone}
                </p>
                <div className="inline-block mt-1 px-3 py-0.5 bg-white text-black border-2 border-black font-black text-xs uppercase tracking-widest rounded print:bg-transparent print:text-black print:border-black delivery-challan-badge">
                  DELIVERY CHALLAN
                </div>
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b border-slate-200 pb-3 text-xs">
                <div className="space-y-1">
                  <div>
                    <span className="font-semibold text-slate-500">Party Name:</span>{' '}
                    <span className="font-bold text-slate-900">{selectedChallan.partyName || '-'}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">Address:</span>{' '}
                    <span className="text-slate-800">{selectedChallan.address || '-'}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">Salesman:</span>{' '}
                    <span className="text-slate-800">
                      {selectedChallan.salespersonName || selectedChallan.salesmanCode || '-'}
                    </span>
                  </div>
                </div>

                <div className="space-y-1 sm:text-right">
                  <div>
                    <span className="font-semibold text-slate-500">Challan No:</span>{' '}
                    <span className="font-mono font-bold text-amber-800">#{selectedChallan.challanNo}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">Date:</span>{' '}
                    <span className="font-mono text-slate-800">{formatDateDDMMYY(selectedChallan.date)}</span>
                  </div>
                  {selectedChallan.orderNumber && (
                    <div>
                      <span className="font-semibold text-slate-500">Order No:</span>{' '}
                      <span className="text-slate-800">{selectedChallan.orderNumber}</span>
                    </div>
                  )}
                  {selectedChallan.refNo && (
                    <div>
                      <span className="font-semibold text-slate-500">Ref No:</span>{' '}
                      <span className="text-slate-800">{selectedChallan.refNo}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-black overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-black border-b border-black font-bold">
                      <th className="py-1.5 px-2 border-r border-black text-center w-10">Sl</th>
                      <th className="py-1.5 px-3 border-r border-black">Name Of Items</th>
                      <th className="py-1.5 px-2 border-r border-black text-right w-24">Delivered</th>
                      <th className="py-1.5 px-2 border-r border-black text-right w-24">Billed</th>
                      <th className="py-1.5 px-2 border-r border-black text-right w-24">Due</th>
                      <th className="py-1.5 px-2 border-r border-black text-center w-16">Unit</th>
                      <th className="py-1.5 px-2 border-r border-black text-right w-24">Rate</th>
                      <th className="py-1.5 px-3 text-right w-28">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300">
                    {selectedChallan.lines.map((line, idx) => (
                      <tr key={idx} className="text-black">
                        <td className="py-1 px-2 border-r border-black text-center font-mono">
                          {String(idx + 1).padStart(2, '0')}.
                        </td>
                        <td className="py-1 px-3 border-r border-black font-bold">
                          {line.itemDescription}
                        </td>
                        <td className="py-1 px-2 border-r border-black text-right font-mono font-bold">
                          {line.coilQty}
                        </td>
                        <td className="py-1 px-2 border-r border-black text-right font-mono text-emerald-800">
                          {line.billedQty || 0}
                        </td>
                        <td className="py-1 px-2 border-r border-black text-right font-mono text-rose-800">
                          {line.dueQty || Math.max(0, line.coilQty - (line.billedQty || 0))}
                        </td>
                        <td className="py-1 px-2 border-r border-black text-center">
                          {formatDisplayUnit(line.unit, line.coilQty)}
                        </td>
                        <td className="py-1 px-2 border-r border-black text-right font-mono">
                          ৳{line.rate ? line.rate.toLocaleString('en-IN') : '0'}
                        </td>
                        <td className="py-1 px-3 text-right font-mono font-bold">
                          ৳{line.amount ? line.amount.toLocaleString('en-IN') : '0'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold border-t-2 border-black">
                      <td colSpan={2} className="py-1.5 px-3 text-right uppercase">
                        Total:
                      </td>
                      <td className="py-1.5 px-2 border-r border-black text-right font-mono">
                        {selectedChallan.totalQuantity}
                      </td>
                      <td className="py-1.5 px-2 border-r border-black text-right font-mono text-emerald-800">
                        {selectedChallan.billedQuantity || 0}
                      </td>
                      <td className="py-1.5 px-2 border-r border-black text-right font-mono text-rose-800">
                        {selectedChallan.dueQuantity || 0}
                      </td>
                      <td colSpan={2} className="border-r border-black"></td>
                      <td className="py-1.5 px-3 text-right font-mono text-emerald-800">
                        ৳{selectedChallan.totalAmount.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {selectedChallan.remarks && (
                <div className="text-xs text-slate-700 pt-1">
                  <span className="font-bold">Remarks:</span> {selectedChallan.remarks}
                </div>
              )}
            </div>

            {/* Received Copy Section in Details Modal */}
            <div className="cyber-glass-subcard border border-cyan-500/25 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className={`p-2.5 rounded-lg ${selectedChallan.receivedCopy ? 'bg-teal-500/20 text-teal-300 border border-teal-400/30' : 'bg-[#081b28] text-slate-400 border border-cyan-500/25'}`}>
                  <FileCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center space-x-2">
                    <span>Received Copy Proof</span>
                    {selectedChallan.receivedCopy && (
                      <span className="bg-teal-500/20 text-teal-200 border border-teal-400/40 text-[10px] font-bold px-2 py-0.2 rounded-full">
                        Attached
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {selectedChallan.receivedCopy ? (
                      <span>
                        File: <strong className="text-cyan-200">{selectedChallan.receivedCopyName || 'received_copy'}</strong>
                        {selectedChallan.receivedCopyDate && (
                          <span className="ml-1 text-slate-400">
                            ({new Date(selectedChallan.receivedCopyDate).toLocaleDateString('en-GB')})
                          </span>
                        )}
                      </span>
                    ) : (
                      <span>No customer/party signed received copy attached to this challan yet.</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                {selectedChallan.receivedCopy ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setViewingReceivedCopyChallan(selectedChallan)}
                      className="bg-teal-600 hover:bg-teal-500 text-white text-xs px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View Copy</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTriggerUpload(selectedChallan.id)}
                      className="bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1 transition-colors cursor-pointer"
                      title="Replace file"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Replace</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleTriggerUpload(selectedChallan.id)}
                    className="bg-teal-600 hover:bg-teal-500 text-white text-xs px-3.5 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Received Copy</span>
                  </button>
                )}
              </div>
            </div>

            {/* Modal Action Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-cyan-500/20">
              <div className="flex items-center space-x-1.5 text-xs text-amber-200 bg-amber-500/15 px-2.5 py-1 rounded-md border border-amber-400/35 font-semibold">
                <Truck className="w-3.5 h-3.5" />
                <span>Delivery Challan Record</span>
              </div>

              <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                <button
                  onClick={() => {
                    handleEditChallan(selectedChallan);
                    setSelectedChallan(null);
                  }}
                  className="bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs px-4 py-2 rounded-lg font-black flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <Edit2 className="w-4 h-4" />
                  <span>Edit Challan</span>
                </button>
                <button
                  onClick={() => {
                    handleDeleteChallan(selectedChallan.id);
                    setSelectedChallan(null);
                  }}
                  className="bg-rose-600 hover:bg-rose-500 text-white text-xs px-3.5 py-2 rounded-lg font-bold flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Challan</span>
                </button>
                <button
                  onClick={() => {
                    setPreviewingChallan(selectedChallan);
                    setSelectedChallan(null);
                  }}
                  className="bg-[#0d283a] hover:bg-[#133850] text-cyan-200 border border-cyan-500/35 text-xs px-4 py-2 rounded-lg font-bold flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
                  title="Open Print Preview with Pad (Hide Logo) & Slip Pad modes"
                >
                  <Printer className="w-4 h-4 text-cyan-300" />
                  <span>Print Preview</span>
                </button>
                <button
                  onClick={() => setShowPrinterAutoConfigModal(true)}
                  className="bg-purple-700 hover:bg-purple-600 text-white text-xs px-3.5 py-2 rounded-lg font-bold flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer border border-purple-500/50"
                  title="Auto-configure printer paper size (5.5x8.5, 7.2x10, A4), print drivers & margins"
                >
                  <Sliders className="w-4 h-4 text-purple-200" />
                  <span>Auto-Config Printer</span>
                </button>
                <button
                  onClick={() => setSelectedChallan(null)}
                  className="bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 text-xs px-4 py-2 rounded-lg font-semibold transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DELETE CONFIRMATION DIALOG MODAL */}
      {/* ========================================================================= */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl border border-cyan-400/35 shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-150 font-sans text-white">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-300 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Delivery Challan?</h3>
                <p className="text-xs text-slate-400">
                  This challan will be moved to the trash archive.
                </p>
              </div>
            </div>

            <div className="cyber-glass-subcard border border-cyan-500/25 rounded-xl p-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400 font-medium">Challan No:</span>
                <span className="font-mono font-bold text-cyan-200">#{deleteConfirmTarget.challanNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-medium">Party Name:</span>
                <span className="font-bold text-white truncate max-w-[200px]">{deleteConfirmTarget.partyName}</span>
              </div>
              {deleteConfirmTarget.totalCoils !== undefined && (
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Delivered Coils:</span>
                  <span className="font-mono font-bold text-slate-200">{deleteConfirmTarget.totalCoils} Coils</span>
                </div>
              )}
              {deleteConfirmTarget.totalAmount !== undefined && (
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Total Amount:</span>
                  <span className="font-mono font-bold text-emerald-300">৳{Number(deleteConfirmTarget.totalAmount).toLocaleString('en-IN')}</span>
                </div>
              )}
              {deleteConfirmTarget.isBilled && (
                <div className="bg-amber-500/15 border border-amber-400/40 text-amber-200 p-2 rounded-lg text-[11px] font-semibold mt-2">
                  ⚠️ Note: This delivery challan is already marked as billed. Deleting will move it to the trash archive.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                ref={confirmDeleteBtnRef}
                type="button"
                onClick={executeConfirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs flex items-center space-x-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Yes, Delete Challan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* RECEIVED COPY ZOOM MODAL VIEWER */}
      {/* ========================================================================= */}
      {viewingReceivedCopyChallan && viewingReceivedCopyChallan.receivedCopy && (
        <div className="fixed inset-0 z-50 bg-[#030d14]/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl border border-cyan-400/35 shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-4xl w-full flex flex-col max-h-[95vh] overflow-hidden text-white">
            {/* Modal Header */}
            <div className="p-4 cyber-glass-header border-b border-cyan-500/25 flex items-center justify-between text-white">
              <div className="flex items-center space-x-2 min-w-0">
                <FileCheck className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                <div className="min-w-0">
                  <h4 className="text-sm font-bold truncate">
                    Signed Received Copy — Challan #{viewingReceivedCopyChallan.challanNo}
                  </h4>
                  <p className="text-[11px] text-slate-400 truncate">
                    Party: {viewingReceivedCopyChallan.partyName}
                    {viewingReceivedCopyChallan.receivedCopyName && ` • File: ${viewingReceivedCopyChallan.receivedCopyName}`}
                  </p>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center space-x-2">
                <div className="bg-[#061520] rounded-lg p-0.5 border border-cyan-500/30 hidden sm:flex">
                  {(['fit', '100%', '150%'] as const).map((z) => (
                    <button
                      key={z}
                      type="button"
                      onClick={() => setReceivedCopyZoom(z)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                        receivedCopyZoom === z ? 'bg-cyan-400 text-slate-950 font-black' : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {z === 'fit' ? 'Fit Window' : z}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (viewingReceivedCopyChallan.receivedCopy) {
                      downloadDataUrl(
                        viewingReceivedCopyChallan.receivedCopy,
                        viewingReceivedCopyChallan.receivedCopyName || `Received_Copy_Challan_${viewingReceivedCopyChallan.challanNo}.jpg`
                      );
                    }
                  }}
                  className="bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/30 p-2 rounded-lg text-xs font-semibold flex items-center space-x-1 cursor-pointer transition-colors"
                  title="Download copy"
                >
                  <Download className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setViewingReceivedCopyChallan(null)}
                  className="bg-[#081b28] hover:bg-[#0e2a3d] text-slate-300 hover:text-white border border-cyan-500/25 p-2 rounded-lg cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Image Preview Canvas */}
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-[#061520]/80 min-h-[320px]">
              <img
                src={viewingReceivedCopyChallan.receivedCopy}
                alt={`Received Copy for Challan ${viewingReceivedCopyChallan.challanNo}`}
                className={`transition-all duration-200 rounded-lg shadow-2xl ${
                  receivedCopyZoom === 'fit'
                    ? 'max-h-[70vh] max-w-full object-contain'
                    : receivedCopyZoom === '100%'
                    ? 'w-auto max-w-none'
                    : 'w-[150%] max-w-none'
                }`}
              />
            </div>

            {/* Modal Bottom Actions */}
            <div className="p-3 bg-[#071824]/90 border-t border-cyan-500/20 flex items-center justify-between text-xs">
              <div className="text-slate-400">
                Uploaded: {viewingReceivedCopyChallan.receivedCopyDate ? new Date(viewingReceivedCopyChallan.receivedCopyDate).toLocaleString() : 'N/A'}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    const id = viewingReceivedCopyChallan.id;
                    handleRemoveReceivedCopy(id);
                  }}
                  className="text-rose-300 hover:text-rose-200 hover:bg-rose-500/15 px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer"
                >
                  Remove Copy
                </button>
                <button
                  type="button"
                  onClick={() => handleTriggerUpload(viewingReceivedCopyChallan.id)}
                  className="bg-cyan-400 hover:bg-cyan-300 text-slate-950 px-3.5 py-1.5 rounded-lg font-black transition-colors cursor-pointer"
                >
                  Replace Copy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* ========================================================================= */}
      {/* DELIVERY CHALLAN PRINT PREVIEW MODAL (WITH PLAIN / PAD HIDE LOGO / SLIP PAD) */}
      {/* ========================================================================= */}
      {previewingChallan && (
        <div className="print-preview-modal-backdrop fixed inset-0 bg-[#030d14]/85 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
          <div className="print-preview-modal-dialog bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden text-white">
            {/* Modal Header Toolbar */}
            <div className="cyber-glass-header px-4 py-2.5 border-b border-cyan-500/25 flex flex-wrap items-center justify-between gap-2 no-print">
              <div className="flex items-center space-x-2">
                <Printer className="w-5 h-5 text-cyan-400" />
                <span className="font-bold text-sm text-white">
                  Print Preview — Delivery Challan #{previewingChallan.challanNo}
                </span>
              </div>

              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                {/* Mode Selector */}
                <div className="inline-flex rounded-lg border border-cyan-500/30 p-0.5 bg-[#061520] text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setChallanPadHeaderMode('plain')}
                    className={`px-2.5 py-1 rounded-md cursor-pointer transition-all ${
                      challanPadHeaderMode === 'plain'
                        ? 'bg-cyan-400 text-slate-950 font-black shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Plain Paper
                  </button>
                  <button
                    type="button"
                    onClick={() => setChallanPadHeaderMode('hide_logo')}
                    className={`px-2.5 py-1 rounded-md cursor-pointer transition-all ${
                      challanPadHeaderMode === 'hide_logo'
                        ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Pad (Hide Logo)
                  </button>
                </div>

                {/* 📜 Slip Pad Settings Toggle */}
                <button
                  type="button"
                  onClick={() => setShowSlipPadSettingsInPreview(!showSlipPadSettingsInPreview)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer border ${
                    showSlipPadSettingsInPreview
                      ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md font-black'
                      : 'bg-[#081b28] hover:bg-[#0e2a3d] text-amber-300 border-amber-500/40 hover:border-amber-400'
                  }`}
                  title="Toggle 📜 Slip Pad Settings"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>📜 Slip Pad Settings</span>
                </button>

                {/* Edit this Challan */}
                <button
                  type="button"
                  onClick={() => {
                    const chToEdit = previewingChallan;
                    if (!chToEdit) return;
                    const dueQ = chToEdit.dueQuantity ?? Math.max(0, chToEdit.totalQuantity - (chToEdit.billedQuantity || 0));
                    if (chToEdit.status === 'billed' || dueQ === 0) {
                      showToast(`Challan #${chToEdit.challanNo} is fully billed and locked in read-only mode. Editing is disabled.`, 'error');
                      return;
                    }
                    setPreviewingChallan(null);
                    handleEditChallan(chToEdit);
                  }}
                  className="bg-[#0d283a] hover:bg-[#133850] text-cyan-200 hover:text-white border border-cyan-500/30 px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer"
                  title="Edit this Challan"
                >
                  <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Edit Challan</span>
                </button>

                {/* Auto-Config / Fix Printer Button */}
                <button
                  type="button"
                  onClick={() => setShowPrinterAutoConfigModal(true)}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-3 py-1.5 rounded-md text-xs flex items-center space-x-1 shadow-md transition-all cursor-pointer border border-purple-400/40"
                  title="Auto-configure paper presets (7.2x10, A4), force exact margins, and calibrate printer drivers (Alt+A)"
                >
                  <Sliders className="w-3.5 h-3.5 text-purple-200" />
                  <span>Auto-Fix Printer (Alt+A)</span>
                </button>

                {/* Print Now Button */}
                <button
                  type="button"
                  onClick={() => triggerAutoConfiguredPrint('challan')}
                  className="bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black px-4 py-1.5 rounded-md text-xs flex items-center space-x-1.5 shadow-md transition-all cursor-pointer hover:scale-105"
                  title="Trigger system print dialog (Enter / Ctrl+P)"
                >
                  <Printer className="w-4 h-4 text-slate-950" />
                  <span>Print Now (Ctrl+P)</span>
                </button>

                {/* Close Sign Button */}
                <button
                  type="button"
                  onClick={() => setPreviewingChallan(null)}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-3 py-1.5 rounded-md text-xs flex items-center space-x-1 shadow-md transition-all cursor-pointer hover:scale-105 border border-rose-400/50 ml-1"
                  title="Close Print Preview (Esc)"
                >
                  <X className="w-4 h-4 text-white" />
                  <span>Close (Esc)</span>
                </button>
              </div>
            </div>

            {/* Slip Pad Print Preview Settings Drawer (Only shown when clicked) */}
            {showSlipPadSettingsInPreview && (
              <SlipPadPrintPreviewSettings
                padHeaderMode={challanPadHeaderMode}
                onChangePadHeaderMode={setChallanPadHeaderMode}
                topOffset={slipPadTopOffset}
                onChangeTopOffset={setSlipPadTopOffset}
                leftOffset={slipPadLeftOffset}
                onChangeLeftOffset={setSlipPadLeftOffset}
                fontScale={slipPadFontScale}
                onChangeFontScale={setSlipPadFontScale}
                rowHeight={slipPadRowHeight}
                onChangeRowHeight={setSlipPadRowHeight}
                showTableHeader={slipPadShowTableHeader}
                onToggleTableHeader={setSlipPadShowTableHeader}
                totalRows={slipPadTotalRows}
                onChangeTotalRows={setSlipPadTotalRows}
                showBgImage={slipPadShowBgImage}
                onToggleShowBgImage={setSlipPadShowBgImage}
                printBgImage={false}
                onTogglePrintBgImage={() => {}}
                bgOpacity={slipPadBgOpacity}
                onChangeBgOpacity={setSlipPadBgOpacity}
                showGuides={slipPadShowGuides}
                onToggleGuides={setSlipPadShowGuides}
                onResetDefaults={() => {
                  setSlipPadTopOffset(0.5);
                  setSlipPadLeftOffset(0.0);
                  setSlipPadFontScale(100);
                  setSlipPadRowHeight(18);
                  setSlipPadShowTableHeader(false);
                  setSlipPadTotalRows(15);
                  setSlipPadShowBgImage(true);
                  setSlipPadBgOpacity(0.35);
                }}
                onOpenAutoConfig={() => setShowPrinterAutoConfigModal(true)}
                onClose={() => setShowSlipPadSettingsInPreview(false)}
                customBgUrl={slipPadCustomBgUrl}
                onUploadCustomBg={(file) => {
                  const reader = new FileReader();
                  reader.onload = (e) => {
                    const dataUrl = e.target?.result as string;
                    setSlipPadCustomBgUrl(dataUrl);
                    try { localStorage.setItem('polycables_slip_pad_custom_bg_challan', dataUrl); } catch {}
                  };
                  reader.readAsDataURL(file);
                }}
                onClearCustomBg={() => {
                  setSlipPadCustomBgUrl(null);
                  try { localStorage.removeItem('polycables_slip_pad_custom_bg_challan'); } catch {}
                }}
              />
            )}

            {/* Modal Body / Paper Canvas */}
            <div className="print-preview-canvas-container p-4 sm:p-8 overflow-auto bg-[#061520] flex-1 flex justify-start sm:justify-center items-start">
              {/* ========================================================= */}
              {/* STANDARD A4 / LETTER DELIVERY CHALLAN (PLAIN / HIDE LOGO / HIDE ALL) */}
              {/* ========================================================= */}
              <div
                className="print-paper-sheet challan-print-sheet bill-paper-dimensions bg-white text-black shadow-2xl border-2 border-slate-300 rounded-sm font-sans transition-all duration-200 origin-top overflow-hidden print:border-none print:shadow-none print:overflow-visible print:max-h-none"
                style={{
                  width: '7.2in',
                  maxWidth: '7.2in',
                  minHeight: '10in',
                  padding: '0 0.28in 0.28in 0.28in',
                  boxSizing: 'border-box'
                }}
              >
                  <div className="relative flex flex-col justify-between h-full overflow-hidden">
                    <div className="relative z-10 space-y-1.5">
                      {/* Header: Top 1.5" strictly reserved for Company Logo */}
                      <div className="text-center pb-0 space-y-0 text-black font-sans leading-tight pt-0">
                        <div
                          style={{ height: '1.5in', minHeight: '1.5in' }}
                          className={`flex items-center justify-center ${
                            challanPadHeaderMode !== 'plain' ? 'hide-on-preprinted-pad invisible opacity-0' : ''
                          }`}
                        >
                          <PolyCablesLogo size="xl" showSubtitle={false} subtitleText="" />
                        </div>

                        {/* Company Address & Title start immediately after the 1.5" mark */}
                        {challanBranchAddress.line1 ? (
                          <div className={`space-y-0.5 pt-0 mt-0 pb-0 mb-0 ${challanPadHeaderMode === 'hide_all' ? 'hide-on-preprinted-pad invisible opacity-0' : ''}`}>
                            <p style={{ fontSize: '14px' }} className="font-bold text-[14px] leading-tight text-black madhupur-address-line">
                              {challanBranchAddress.line1?.replace(/\s*Ind\.?\s*Ltd\.?/gi, '')}
                            </p>
                            {challanBranchAddress.line2 ? (
                              <p style={{ fontSize: '14px' }} className="font-semibold text-[14px] leading-tight text-black madhupur-address-line">
                                {challanBranchAddress.line2?.replace(/\s*Ind\.?\s*Ltd\.?/gi, '')}
                              </p>
                            ) : null}
                            {challanBranchAddress.line3 ? (
                              <p style={{ fontSize: '14px' }} className="font-semibold text-[14px] leading-tight text-black madhupur-address-line">
                                {challanBranchAddress.line3?.replace(/\s*Ind\.?\s*Ltd\.?/gi, '')}
                              </p>
                            ) : null}
                          </div>
                        ) : null}

                        {/* Delivery Challan Badge */}
                        <div className="pt-1 pb-0.5">
                          <span className="inline-block bg-white text-black border-2 border-black px-4 py-0.5 rounded text-xs font-black tracking-widest uppercase print:bg-transparent print:text-black print:border-black delivery-challan-badge">
                            DELIVERY CHALLAN
                          </span>
                        </div>
                      </div>

                      {/* 2-Column Metadata */}
                      <div className="flex items-start justify-between w-full text-black font-sans mt-1 mb-0.5 gap-x-2.5 text-xs">
                        {/* Left Side */}
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center w-full min-h-[19px]">
                            <span className="w-[74px] flex-none font-semibold text-black whitespace-nowrap text-left text-xs">Party Name</span>
                            <span className="w-2 flex-none text-center font-semibold text-black text-xs">:</span>
                            <span style={{ fontSize: getDynamicPartyFontSize(previewingChallan.partyName, 12), lineHeight: '1.2' }} className="font-bold border-b border-dotted border-black flex-1 min-w-0 pb-0.5 whitespace-nowrap overflow-hidden text-ellipsis block text-left text-xs">
                              {previewingChallan.partyName || '\u00A0'}
                            </span>
                          </div>
                          <div className="flex items-center w-full min-h-[19px]">
                            <span className="w-[74px] flex-none font-semibold text-black whitespace-nowrap text-left text-xs">Address</span>
                            <span className="w-2 flex-none text-center font-semibold text-black text-xs">:</span>
                            <span style={{ fontSize: getDynamicAddressFontSize(previewingChallan.address, 12), lineHeight: '1.2' }} className="font-semibold border-b border-dotted border-black flex-1 min-w-0 pb-0.5 whitespace-nowrap overflow-hidden text-ellipsis block text-left text-xs">
                              {previewingChallan.address || '\u00A0'}
                            </span>
                          </div>
                          <div className="flex items-center w-full min-h-[19px]">
                            <span className="w-[74px] flex-none font-semibold text-black whitespace-nowrap text-left text-xs">Phone</span>
                            <span className="w-2 flex-none text-center font-semibold text-black text-xs">:</span>
                            <span className="font-mono font-semibold border-b border-dotted border-black flex-1 min-w-0 pb-0.5 whitespace-nowrap overflow-hidden text-ellipsis block text-left text-xs">
                              {previewingChallan.phone || '\u00A0'}
                            </span>
                          </div>
                        </div>

                        {/* Right Side */}
                        <div className="w-[220px] flex-none space-y-0.5">
                          <div className="flex items-center justify-start min-h-[19px] w-full text-xs">
                            <span className="w-[74px] flex-none font-semibold text-black whitespace-nowrap text-left">Challan No.</span>
                            <span className="w-2 flex-none text-center font-semibold text-black">:</span>
                            <span className="font-mono font-bold w-[48px] flex-none truncate text-center border-b border-dotted border-black pb-0">
                              {previewingChallan.challanNo || '\u00A0'}
                            </span>
                            <span className="w-[32px] flex-none font-semibold text-black whitespace-nowrap text-right pr-0.5">Date:</span>
                            <span className="font-mono font-semibold border-b border-dotted border-black w-[56px] flex-none text-center pb-0">
                              {formatDateDDMMYY(previewingChallan.date) || '\u00A0'}
                            </span>
                          </div>

                          <div className="flex items-center justify-start min-h-[19px] w-full text-xs">
                            <span className="w-[74px] flex-none font-semibold text-black whitespace-nowrap text-left">Order No.</span>
                            <span className="w-2 flex-none text-center font-semibold text-black">:</span>
                            <span className="font-semibold w-[48px] flex-none truncate text-center border-b border-dotted border-black pb-0">
                              {previewingChallan.orderNumber || '\u00A0'}
                            </span>
                            <span className="w-[32px] flex-none font-semibold text-black whitespace-nowrap text-right pr-0.5">Date:</span>
                            <span className="font-mono font-semibold border-b border-dotted border-black w-[56px] flex-none text-center pb-0">
                              {formatDateDDMMYY(previewingChallan.orderDate || previewingChallan.date) || '\u00A0'}
                            </span>
                          </div>

                          <div className="flex items-center justify-start min-h-[19px] w-full text-xs">
                            <span className="w-[74px] flex-none font-semibold text-black whitespace-nowrap text-left">Salesman</span>
                            <span className="w-2 flex-none text-center font-semibold text-black">:</span>
                            <span className="font-semibold border-b border-dotted border-black w-[48px] flex-none text-center pb-0 truncate">
                              {previewingChallan.salespersonName || previewingChallan.salesmanCode || '\u00A0'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Items Table: Removed Rate & Price, Showing Colour Column */}
                      <div className="border-2 border-black overflow-visible font-sans flex-1 flex flex-col justify-between mt-1 mb-1 min-h-[300px]">
                        <table className="w-full border-collapse text-left text-xs">
                          <thead>
                            <tr className="bg-white text-black font-bold uppercase tracking-wider text-[11px] border-b-2 border-black">
                              <th className="p-1.5 border-r border-black w-10 text-center">SL</th>
                              <th className="p-1.5 border-r border-black">Item Description</th>
                              <th className="p-1.5 border-r border-black w-24 text-center">Quantity</th>
                              <th className="p-1.5 border-r border-black w-20 text-center">Unit</th>
                              <th className="p-1.5 w-36 text-center">Colour</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-300">
                            {previewingChallan.lines && previewingChallan.lines.length > 0 ? (
                              previewingChallan.lines.map((line, idx) => (
                                <tr key={line.id || idx} className="border-b border-slate-300">
                                  <td className="p-1.5 border-r border-black font-mono text-center">{idx + 1}</td>
                                  <td className="p-1.5 border-r border-black font-medium">{line.itemDescription}</td>
                                  <td className="p-1.5 border-r border-black font-mono font-bold text-center">{line.coilQty || 0}</td>
                                  <td className="p-1.5 border-r border-black text-center font-medium">{formatDisplayUnit(line.unit, line.coilQty)}</td>
                                  <td className="p-1.5 text-center font-semibold text-slate-800 text-[11px]">
                                    {formatChallanLineColors(line)}
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={5} className="p-3 text-center text-slate-500 italic">No line items in this delivery challan.</td>
                              </tr>
                            )}
                          </tbody>
                          <tfoot className="border-t-2 border-black font-semibold text-xs bg-slate-50">
                            <tr className="border-b border-black">
                              <td colSpan={2} className="p-1.5 text-right border-r border-black font-bold uppercase tracking-wider whitespace-nowrap">
                                Total Coils =
                              </td>
                              <td className="p-1.5 text-center border-r border-black font-mono font-black text-black">
                                {previewTotalCoils}
                              </td>
                              <td className="p-1.5 text-center border-r border-black font-semibold text-slate-700">
                                Coils
                              </td>
                              <td className="p-1.5"></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {/* Challan Summary (No Rate / Price) */}
                      <div className="border border-black p-2 flex items-start justify-between text-xs bg-slate-50">
                        {/* Remarks */}
                        <div className="flex-1 space-y-1 pr-4">
                          <div className="text-[11px] text-slate-700">
                            <span className="font-bold">Dispatch Note:</span> Goods received in sound condition. Please verify coil count before signing.
                          </div>
                          {previewingChallan.remarks && (
                            <div className="text-[11px] text-slate-600">
                              <span className="font-bold">Remarks:</span> {previewingChallan.remarks}
                            </div>
                          )}
                        </div>

                        {/* Total Coils Box */}
                        <div className="w-52 space-y-1 font-mono text-xs border-l border-slate-300 pl-3">
                          <div className="flex justify-between font-bold text-black text-sm">
                            <span className="font-sans font-bold text-slate-800">Total Coils:</span>
                            <span className="font-black font-mono">{previewTotalCoils}</span>
                          </div>
                          <div className="flex justify-between text-slate-600 text-[11px]">
                            <span className="font-sans">Status:</span>
                            <span className="font-bold text-emerald-700">Goods Delivered</span>
                          </div>
                        </div>
                      </div>

                      {/* Signatures: min 5 lines normally, 3 lines when many items */}
                      <div
                        className={`${
                          (previewingChallan.lines?.length || 0) >= 10
                            ? 'min-h-[42px] h-[42px]'
                            : 'min-h-[75px] h-[75px]'
                        } flex-none w-full`}
                        aria-hidden="true"
                      />
                      <div className="grid grid-cols-4 gap-4 text-center text-[11px] font-sans">
                        <div>
                          <div className="border-t border-black pt-1 font-bold">Receiver's Signature</div>
                        </div>
                        <div>
                          <div className="border-t border-black pt-1 font-semibold">Prepared By</div>
                        </div>
                        <div>
                          <div className="border-t border-black pt-1 font-semibold">Check By</div>
                        </div>
                        <div>
                          <div className="border-t border-black pt-1 font-semibold">Approved By</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {isBatchDeleteConfirmOpen && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 max-w-md w-full p-5 space-y-4 text-white">
            <div className="flex items-center space-x-3 text-rose-300">
              <div className="p-3 bg-rose-500/20 rounded-xl border border-rose-400/40">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Selected Challans?</h3>
                <p className="text-xs text-slate-400">You are about to delete {selectedChallanIds.length} delivery challan(s).</p>
              </div>
            </div>
            <p className="text-xs text-slate-300">
              Are you sure you want to permanently delete these <span className="font-bold text-white">{selectedChallanIds.length}</span> selected delivery challans?
            </p>
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setIsBatchDeleteConfirmOpen(false)}
                className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeConfirmBatchDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-md transition-colors cursor-pointer flex items-center space-x-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete All {selectedChallanIds.length} Selected</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Color Quantity Selection Modal */}
      {colorModalState && colorModalState.isOpen && (
        <ColorQuantityModal
          isOpen={colorModalState.isOpen}
          item={colorModalState.item}
          unit={colorModalState.unit}
          initialColors={colorModalState.initialColors}
          initialTotalQty={colorModalState.initialTotalQty}
          stockColors={colorModalState.stockColors}
          onConfirm={handleConfirmColorModal}
          onClose={() => {
            const nextIdx = (colorModalState?.lineIndex ?? 0) + 1;
            setColorModalState(null);
            focusChallanLineItemInput(nextIdx);
          }}
        />
      )}

      {/* Auto-Config Printer & Paper Alignment Modal */}
      <PrinterAutoConfigModal
        isOpen={showPrinterAutoConfigModal}
        onClose={() => setShowPrinterAutoConfigModal(false)}
        documentType={challanPadHeaderMode === 'slip_pad' ? 'slip_pad' : 'challan'}
        title="Delivery Challan Printer Auto-Configuration & Paper Alignment"
        defaultOrientation={challanPadHeaderMode === 'slip_pad' ? 'portrait' : 'portrait'}
      />

      {/* Quick Add Master Item Modal */}
      {quickAddModalOpen && (
        <QuickAddItemModal
          isOpen={quickAddModalOpen}
          onClose={() => setQuickAddModalOpen(false)}
          initialData={quickAddInitialData}
          existingItems={items}
          onItemCreated={(createdItem) => {
            if (onAddItem) {
              onAddItem(createdItem);
            } else if (setItems) {
              setItems((prev) => [createdItem, ...prev]);
            }
            if (quickAddInitialData.rowIndex !== undefined) {
              handleSelectItem(quickAddInitialData.rowIndex, createdItem);
            }
            setQuickAddModalOpen(false);
            showToast(`Added "${createdItem.name}" to Master Items Catalog.`);
          }}
          title="Add New Item to Master Catalog"
        />
      )}
    </div>
  );
};
