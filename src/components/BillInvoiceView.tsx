import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  BillHeader,
  BillLineItem,
  CompanyDetails,
  Item,
  Party,
  Salesperson,
  BranchLocation,
  AuthUser,
  FactoryImportChallan,
  StoredBill,
  StockReturnChallan,
  ColorBreakdown
} from '../types';
import { formatDateDDMMYY, parseDateToISO, getTodayDDMMYY } from '../utils/dateUtils';
import { convertToTakaWords } from '../utils/numberToWords';
import { exportBillToExcel } from '../utils/excelExporter';
import {
  getBranchAddressDetails,
  getUserBranch,
  filterBranchesForUser,
  filterSalespersonsByBranch,
  isStrictSuperAdmin,
  isAccountsAdmin,
  isAnyAdmin,
  partyMatchesBranch,
  cleanBranchName
} from '../utils/branchAccess';
import {
  computeBranchRunningBillNo,
  getSalesCenterPrefix,
  findHeadOfficeBranch,
  withHeadOfficeForAdmin,
  DEFAULT_HEAD_OFFICE_BRANCH
} from '../utils/salesCenterHelper';
import { matchesFlexibleSearch, sortItemsCategorySerialWise, groupItemsByCategoryOrder } from '../utils/searchHelper';
import { getAllCategories } from '../utils/categoryHelper';
import { parseDocumentWithAI } from '../utils/aiDocumentImport';
import { matchImportedItemWithStored } from '../utils/itemMatcher';
import { BillPrintPreviewModal } from './BillPrintPreviewModal';
import { QuickAddItemModal } from './QuickAddItemModal';
import { AddPartyModal } from './AddPartyModal';
import { SalesCenterSearchFilter } from './SalesCenterSearchFilter';
import {
  Printer,
  FileSpreadsheet,
  Upload,
  Save,
  Plus,
  Trash2,
  Calendar,
  Building2,
  User,
  MapPin,
  Phone,
  FileText,
  Search,
  Check,
  X,
  RotateCcw,
  Tag,
  Palette,
  ArrowLeft,
  ChevronDown,
  Layers,
  Sparkles,
  AlertCircle,
  Mail,
  Send,
  Sliders,
  Paperclip,
  CheckCircle2,
  FileUp,
  Truck,
  Loader2
} from 'lucide-react';

export interface BillInvoiceViewProps {
  company: CompanyDetails;
  setCompany?: React.Dispatch<React.SetStateAction<CompanyDetails>>;
  header: BillHeader;
  setHeader: React.Dispatch<React.SetStateAction<BillHeader>>;
  lines: BillLineItem[];
  setLines: React.Dispatch<React.SetStateAction<BillLineItem[]>>;
  items: Item[];
  setItems?: React.Dispatch<React.SetStateAction<Item[]>>;
  onAddItem?: (item: Item) => void;
  parties: Party[];
  setParties?: React.Dispatch<React.SetStateAction<Party[]>>;
  onAddParty?: (newParty: Party) => void;
  salespersons: Salesperson[];
  branches: BranchLocation[];
  currentUser?: AuthUser | null;
  factoryImports?: FactoryImportChallan[];
  storedBills?: StoredBill[];
  allStoredBills?: StoredBill[];
  stockReturns?: StockReturnChallan[];
  editingBillId?: string | null;
  setEditingBillId?: (id: string | null) => void;
  onSaveBill?: (bill?: any) => void;
  onStoreImportedBill?: (importedHeader: BillHeader, importedLines: BillLineItem[]) => void;
  onNewBill?: () => void;
  onResetSample?: () => void;
  onBack?: () => void;
  onClose?: () => void;
  onCancel?: () => void;
}

/**
 * Checks if an item qualifies for the mandatory color input form in Sales Center Bill Entry:
 * "colour input open for only BYA (without re), BAYA, flexible- 01 core"
 */
export function isColorApplicableBillItem(itemName: string, category?: string): boolean {
  const name = (itemName || '').trim().toLowerCase();
  const cat = (category || '').trim().toLowerCase();
  const combined = `${name} ${cat}`;

  // 1. RE (Round Solid / single strand e.g. 1.0re, 1.3re, 1.5re, 2.0re, 2.5re, 1-w) - Strictly NO color form
  if (
    /\bre\b/i.test(name) ||
    name.includes('(re)') ||
    name.includes('1-w') ||
    combined.includes('round solid')
  ) {
    return false;
  }

  // 2. BAYA (contains 'baya') - Color form applies
  if (combined.includes('baya')) {
    return true;
  }

  // 3. Flexible - 01 core - Color form applies
  if (
    combined.includes('flexible') &&
    (combined.includes('01 core') || combined.includes('1 core') || combined.includes('single core') || /\b1\s*x\b/i.test(name))
  ) {
    return true;
  }

  // 4. BYA (without RE) - Color form applies
  if (combined.includes('bya')) {
    return true;
  }

  return false;
}

/**
 * Normalizes unit singular and plural:
 * "if quantity 1 then coil, if more then 1 then coils same like 1 meter else more the 1 meter then meters"
 */
export function normalizeUnit(unit: string | undefined, qty: number): string {
  const u = (unit || '').trim().toLowerCase();
  if (u.includes('meter') || u === 'm' || u.includes('mtr')) {
    return qty === 1 ? 'Meter' : 'Meters';
  }
  if (u.includes('bobin')) {
    return qty === 1 ? 'Bobin' : 'Bobins';
  }
  return qty === 1 ? 'Coil' : 'Coils';
}

export const BillInvoiceView: React.FC<BillInvoiceViewProps> = ({
  company,
  setCompany,
  header,
  setHeader,
  lines,
  setLines,
  items,
  setItems,
  onAddItem,
  parties,
  setParties,
  onAddParty,
  salespersons,
  branches,
  currentUser,
  factoryImports = [],
  storedBills = [],
  allStoredBills,
  stockReturns = [],
  editingBillId,
  setEditingBillId,
  onSaveBill,
  onStoreImportedBill,
  onNewBill,
  onResetSample,
  onBack,
  onClose,
  onCancel
}) => {
  // Pad Header Mode: 'plain' or 'hide_logo' (defaults to 'hide_logo')
  const [padHeaderMode, setPadHeaderMode] = useState<'plain' | 'hide_logo'>('hide_logo');

  // Modals state
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [printDocType, setPrintDocType] = useState<'bill' | 'challan'>('bill');
  const [quickAddModalOpen, setQuickAddModalOpen] = useState(false);
  const [quickAddRowIndex, setQuickAddRowIndex] = useState<number | undefined>(undefined);
  const [quickAddInitialData, setQuickAddInitialData] = useState<{ name?: string; rate?: number }>({});
  const [addPartyModalOpen, setAddPartyModalOpen] = useState(false);
  const [isEditHeaderOpen, setIsEditHeaderOpen] = useState(false);
  const [isFontSizeModalOpen, setIsFontSizeModalOpen] = useState(false);
  const [isUploadCopyModalOpen, setIsUploadCopyModalOpen] = useState(false);
  const [isSendEmailModalOpen, setIsSendEmailModalOpen] = useState(false);
  const [salesCenterDropdownOpen, setSalesCenterDropdownOpen] = useState(false);
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isImportingFile, setIsImportingFile] = useState(false);

  // Email form state
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState(`Polycables Invoice ${header.billNo || 'SC-01'}`);
  const [emailSending, setEmailSending] = useState(false);

  // Font and display settings
  const [tableFontSize, setTableFontSize] = useState<'text-[11px]' | 'text-xs' | 'text-sm'>('text-xs');
  const [rowDensity, setRowDensity] = useState<'compact' | 'normal' | 'relaxed'>('normal');

  // Dates state (Date 1: Order Date, Date 2: Bill Date, Date 3: Challan Date) — strictly dd.mm.yy
  const defaultDateStr = useMemo(() => {
    return header.date ? formatDateDDMMYY(header.date) : getTodayDDMMYY();
  }, [header.date]);

  const [orderDateStr, setOrderDateStr] = useState<string>(() =>
    formatDateDDMMYY(header.orderDate || header.date) || getTodayDDMMYY()
  );
  const [billDateStr, setBillDateStr] = useState<string>(() =>
    formatDateDDMMYY(header.date) || getTodayDDMMYY()
  );
  const [challanDateStr, setChallanDateStr] = useState<string>(() =>
    formatDateDDMMYY(header.challanDate || header.date) || getTodayDDMMYY()
  );

  // Sync external header date changes (e.g. New Bill, Load Bill, Sales Center <-> Office Bill switch) into dd.mm.yy
  useEffect(() => {
    if (header.date) {
      const fmtBill = formatDateDDMMYY(header.date);
      if (fmtBill && fmtBill !== billDateStr) {
        setBillDateStr(fmtBill);
      }
      if (!header.orderDate && fmtBill && fmtBill !== orderDateStr) {
        setOrderDateStr(fmtBill);
      }
      if (!header.challanDate && fmtBill && fmtBill !== challanDateStr) {
        setChallanDateStr(fmtBill);
      }
    }
    if (header.orderDate) {
      const fmtOrder = formatDateDDMMYY(header.orderDate);
      if (fmtOrder && fmtOrder !== orderDateStr) {
        setOrderDateStr(fmtOrder);
      }
    }
    if (header.challanDate) {
      const fmtChallan = formatDateDDMMYY(header.challanDate);
      if (fmtChallan && fmtChallan !== challanDateStr) {
        setChallanDateStr(fmtChallan);
      }
    }
  }, [header.date, header.orderDate, header.challanDate]);

  // Header address details customizer
  const [headerAddressLine1, setHeaderAddressLine1] = useState('');
  const [headerAddressLine2, setHeaderAddressLine2] = useState('');
  const [headerAddressLine3, setHeaderAddressLine3] = useState('');

  // Received copy attachment file name
  const [receivedCopyFile, setReceivedCopyFile] = useState<string | null>(null);

  // Interactive Color Modal for instant Enter navigation
  const [colorModalState, setColorModalState] = useState<{
    isOpen: boolean;
    lineIndex: number;
    itemName: string;
    unit: string;
    colors: { red: number; blk: number; yel: number; grn: number; blu: number; others: number };
  } | null>(null);

  // Autocomplete / Search states
  const [partySearchOpen, setPartySearchOpen] = useState(false);
  const [partySearchText, setPartySearchText] = useState('');
  const [partyHighlightIdx, setPartyHighlightIdx] = useState(0);
  const [salespersonSearchOpen, setSalespersonSearchOpen] = useState(false);
  const [salespersonSearchText, setSalespersonSearchText] = useState('');
  const [salespersonHighlightIdx, setSalespersonHighlightIdx] = useState(0);
  const [activeItemSearchRow, setActiveItemSearchRow] = useState<number | null>(null);
  const [itemSearchText, setItemSearchText] = useState('');
  const [itemHighlightIdx, setItemHighlightIdx] = useState(0);

  // Refs for sequential Enter-key workflow
  const partyNameInputRef = useRef<HTMLInputElement>(null);
  const partyDropdownRef = useRef<HTMLDivElement>(null);
  const salespersonInputRef = useRef<HTMLInputElement>(null);
  const salespersonDropdownRef = useRef<HTMLDivElement>(null);
  const itemDropdownRef = useRef<HTMLDivElement>(null);
  const orderDateInputRef = useRef<HTMLInputElement>(null);
  const billDateInputRef = useRef<HTMLInputElement>(null);
  const challanDateInputRef = useRef<HTMLInputElement>(null);
  const orderDatePickerRef = useRef<HTMLInputElement>(null);
  const billDatePickerRef = useRef<HTMLInputElement>(null);
  const challanDatePickerRef = useRef<HTMLInputElement>(null);
  const itemInputRefs = useRef<{ [index: number]: HTMLInputElement | null }>({});
  const qtyInputRefs = useRef<{ [index: number]: HTMLInputElement | null }>({});
  const unitInputRefs = useRef<{ [index: number]: HTMLSelectElement | null }>({});
  const discountPercentInputRef = useRef<HTMLInputElement>(null);
  const discountAmountInputRef = useRef<HTMLInputElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  // Color modal input refs
  const colorRedRef = useRef<HTMLInputElement>(null);
  const colorBlkRef = useRef<HTMLInputElement>(null);
  const colorYelRef = useRef<HTMLInputElement>(null);
  const colorGrnRef = useRef<HTMLInputElement>(null);
  const colorBluRef = useRef<HTMLInputElement>(null);
  const colorOthRef = useRef<HTMLInputElement>(null);
  const colorConfirmRef = useRef<HTMLButtonElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const copyFileInputRef = useRef<HTMLInputElement>(null);

  // 1. "first focus party name" on mount / edit mode switch without opening dropdown if party name exists
  useEffect(() => {
    setPartySearchOpen(false);
    setSalespersonSearchOpen(false);
    setActiveItemSearchRow(null);
    const timer = setTimeout(() => {
      partyNameInputRef.current?.focus();
      partyNameInputRef.current?.select();
    }, 150);
    return () => clearTimeout(timer);
  }, [editingBillId]);

  // Close party, sales center, salesperson & item search lists when clicking/touching outside or pressing Escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest('.bill-party-search-container')) {
        setPartySearchOpen(false);
      }
      if (!target.closest('.bill-salesperson-search-container')) {
        setSalespersonSearchOpen(false);
      }
      if (!target.closest('.bill-item-search-container')) {
        setActiveItemSearchRow(null);
      }
      if (!target.closest('.bill-sales-center-dropdown')) {
        setSalesCenterDropdownOpen(false);
      }
    };
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPartySearchOpen(false);
        setSalespersonSearchOpen(false);
        setActiveItemSearchRow(null);
        setSalesCenterDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick, true);
    document.addEventListener('touchstart', handleOutsideClick, true);
    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick, true);
      document.removeEventListener('touchstart', handleOutsideClick, true);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, []);

  // Helper notification
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // Financial calculations
  const subtotal = useMemo(() => {
    return lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  }, [lines]);

  const discountPercent = header.discountPercent || 0;
  const discountAmount = useMemo(() => {
    if (header.discountAmount !== undefined && header.discountAmount > 0) {
      return header.discountAmount;
    }
    if (discountPercent > 0) {
      return Math.round((subtotal * discountPercent) / 100);
    }
    return 0;
  }, [subtotal, discountPercent, header.discountAmount]);

  const grandTotal = useMemo(() => {
    return Math.max(0, subtotal - discountAmount);
  }, [subtotal, discountAmount]);

  // "on report every meter sale show in coils", 1 coil = 100 meter
  const totalCoils = useMemo(() => {
    return lines.reduce((sum, l) => {
      const q = Number(l.coilQty) || 0;
      const u = (l.unit || '').trim().toLowerCase();
      if (u.includes('meter') || u === 'm' || u.includes('mtr')) {
        return sum + (q / 100);
      }
      return sum + q;
    }, 0);
  }, [lines]);

  const inWords = useMemo(() => {
    if (grandTotal <= 0) return 'Zero Taka Only';
    return convertToTakaWords(grandTotal);
  }, [grandTotal]);

  // Allowed Sales Centers strictly based on user role (Admins always include Head Office)
  const allowedBranches = useMemo(
    () => withHeadOfficeForAdmin(filterBranchesForUser(branches, currentUser, salespersons), currentUser),
    [branches, currentUser, salespersons]
  );

  const canSelectAllCenters = useMemo(
    () => isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser) || isAnyAdmin(currentUser) || allowedBranches.length > 1,
    [currentUser, allowedBranches.length]
  );

  // Marketing officers strictly filtered by the selected Sales Center (or Admin's assigned centers)
  const allowedSalespersonsForBranch = useMemo(
    () => filterSalespersonsByBranch(salespersons, header.branchId, allowedBranches, currentUser),
    [salespersons, header.branchId, allowedBranches, currentUser]
  );

  // Current active sales center name
  const currentBranch = useMemo(() => {
    if (header.branchId === 'ALL' || header.branchId?.toLowerCase() === 'all') {
      return null;
    }
    if (header.branchId) {
      const match =
        allowedBranches.find((b) => b.id === header.branchId) ||
        branches.find((b) => b.id === header.branchId) ||
        (header.branchId === DEFAULT_HEAD_OFFICE_BRANCH.id ? DEFAULT_HEAD_OFFICE_BRANCH : undefined);
      if (match) return match;
    }
    if (header.branchName) {
      const cleanH = cleanBranchName(header.branchName).toLowerCase();
      const matchByName = allowedBranches.find((b) => cleanBranchName(b.name).toLowerCase() === cleanH);
      if (matchByName) return matchByName;
    }
    return null;
  }, [allowedBranches, branches, header.branchId, header.branchName]);

  const billsForSerial = useMemo(
    () => (allStoredBills && allStoredBills.length >= (storedBills?.length || 0) ? allStoredBills : storedBills || []),
    [allStoredBills, storedBills]
  );

  const billNoManuallyEditedRef = useRef<boolean>(false);
  const lastUserKeyRef = useRef<string>('');

  useEffect(() => {
    billNoManuallyEditedRef.current = false;
  }, [editingBillId]);

  // Auto set All Sales Centers for Admin/Super Admin on login/initial mount, enforce user branch isolation, and keep Sales-Center-wise Bill No synced
  useEffect(() => {
    if (!currentUser || allowedBranches.length === 0) return;

    const userKey = `${currentUser.username || ''}::${currentUser.salespersonCode || ''}::${currentUser.branchId || ''}::${currentUser.role || ''}`;
    const userChanged = lastUserKeyRef.current !== '' && lastUserKeyRef.current !== userKey;
    const isInitialUserHydration = lastUserKeyRef.current === '';
    lastUserKeyRef.current = userKey;

    const isSuperOrAcc = isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser) || isAnyAdmin(currentUser);
    const isAllSelected = header.branchId === 'ALL' || header.branchId?.toLowerCase() === 'all';
    const isMissingBranch = !header.branchId || header.branchId.trim() === '';
    const isValidSelection = isAllSelected
      ? canSelectAllCenters
      : allowedBranches.some((b) => b.id === header.branchId);

    const userBr = getUserBranch(currentUser, salespersons, allowedBranches);
    const hasSpecificAssignedCenter = Boolean(
      userBr.branchId && userBr.branchId !== 'all' && userBr.branchId !== 'ALL'
    );
    const userAssignedBranch =
      (hasSpecificAssignedCenter && allowedBranches.find((b) => b.id === userBr.branchId)) ||
      (userBr.branchName &&
        !userBr.branchName.toLowerCase().includes('all') &&
        allowedBranches.find(
          (b) => cleanBranchName(b.name).toLowerCase() === cleanBranchName(userBr.branchName).toLowerCase()
        )) ||
      undefined;

    // Super Admin & Admin default to All Sales Centers ('ALL'); regular roles auto-set to their assigned Sales Center
    if (isSuperOrAcc) {
      const allLabel =
        isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser)
          ? 'All Sales Centers'
          : `All Assigned Centers (${allowedBranches.length})`;
      if (!isValidSelection || (!editingBillId && (isInitialUserHydration || userChanged || isMissingBranch) && !isAllSelected)) {
        billNoManuallyEditedRef.current = false;
        const nextBillNo = !editingBillId
          ? computeBranchRunningBillNo(billsForSerial, null, Boolean(header.isOfficeBill))
          : header.billNo;
        setHeader((prev) => ({
          ...prev,
          branchId: 'ALL',
          branchName: allLabel,
          ...(!editingBillId ? { billNo: nextBillNo } : {})
        }));
        return;
      }
    } else {
      const targetBranch = userAssignedBranch || allowedBranches[0];
      const shouldSwitchToTargetBranch =
        !isValidSelection ||
        (!editingBillId && (isInitialUserHydration || userChanged || isMissingBranch) && targetBranch && header.branchId !== targetBranch.id) ||
        (!editingBillId && !canSelectAllCenters && allowedBranches.length <= 1 && targetBranch && header.branchId !== targetBranch.id);

      if (shouldSwitchToTargetBranch && targetBranch) {
        billNoManuallyEditedRef.current = false;
        const nextBillNo = !editingBillId
          ? computeBranchRunningBillNo(billsForSerial, targetBranch, Boolean(header.isOfficeBill))
          : header.billNo;
        setHeader((prev) => ({
          ...prev,
          branchId: targetBranch.id,
          branchName: targetBranch.name,
          ...(!editingBillId ? { billNo: nextBillNo } : {})
        }));
        return;
      }
    }

    // Keep Sales-Center-wise Bill No aligned when not editing an existing bill or manually overridden
    if (!editingBillId && !billNoManuallyEditedRef.current) {
      const expectedBillNo = computeBranchRunningBillNo(
        billsForSerial,
        currentBranch,
        Boolean(header.isOfficeBill)
      );
      const currentBillNo = (header.billNo || '').trim();
      const branchPrefix = currentBranch ? getSalesCenterPrefix(currentBranch).toUpperCase() : '';
      const expectedPrefix = header.isOfficeBill
        ? (branchPrefix && branchPrefix !== 'SC' ? `${branchPrefix}-OB-` : 'OB-')
        : (branchPrefix ? `${branchPrefix}-` : '');

      const isGenericPlaceholder =
        !currentBillNo ||
        /^sc-\d+$/i.test(currentBillNo) ||
        /^ob-\d+$/i.test(currentBillNo) ||
        /^[A-Z]{2,4}-01$/i.test(currentBillNo) ||
        /^[A-Z]{2,4}-OB-01$/i.test(currentBillNo) ||
        currentBillNo === '01';

      const prefixMismatch = Boolean(expectedPrefix && !currentBillNo.toUpperCase().startsWith(expectedPrefix));

      if (prefixMismatch || (isGenericPlaceholder && expectedBillNo !== currentBillNo)) {
        setHeader((prev) => ({
          ...prev,
          billNo: expectedBillNo
        }));
      }
    }
  }, [currentUser, salespersons, allowedBranches, canSelectAllCenters, header.branchId, header.isOfficeBill, header.billNo, currentBranch, billsForSerial, editingBillId, setHeader]);

  // Update header address when branch changes (All Sales Centers on Bill page shows CORPORATE OFFICE address)
  useEffect(() => {
    if (header.branchId === 'ALL' || header.branchId?.toLowerCase() === 'all' || !currentBranch) {
      const corporateBranch = findHeadOfficeBranch(allowedBranches) || DEFAULT_HEAD_OFFICE_BRANCH;
      const addrDetails = getBranchAddressDetails(corporateBranch, company.phone, company.email);
      setHeaderAddressLine1(addrDetails.line1);
      setHeaderAddressLine2(addrDetails.line2);
      setHeaderAddressLine3(addrDetails.line3);
    } else {
      const addrDetails = getBranchAddressDetails(currentBranch, company.phone, company.email);
      setHeaderAddressLine1(addrDetails.line1);
      setHeaderAddressLine2(addrDetails.line2);
      setHeaderAddressLine3(addrDetails.line3);
    }
  }, [currentBranch, header.branchId, allowedBranches, company.phone, company.email]);

  // "move date if change first date change all date, if need can 2nd or 3rd change Separately"
  const handleOrderDateChange = (val: string) => {
    setOrderDateStr(val);
    setBillDateStr(val);
    setChallanDateStr(val);
    setHeader((prev) => ({
      ...prev,
      orderDate: val,
      date: val,
      challanDate: val
    }));
  };

  const handleOrderDateBlur = () => {
    const formatted = formatDateDDMMYY(orderDateStr.trim());
    if (formatted) {
      handleOrderDateChange(formatted);
    }
  };

  const handleBillDateChange = (val: string) => {
    setBillDateStr(val);
    setHeader((prev) => ({
      ...prev,
      date: val
    }));
  };

  const handleBillDateBlur = () => {
    const formatted = formatDateDDMMYY(billDateStr.trim());
    if (formatted) {
      handleBillDateChange(formatted);
    }
  };

  const handleChallanDateChange = (val: string) => {
    setChallanDateStr(val);
    setHeader((prev) => ({
      ...prev,
      challanDate: val
    }));
  };

  const handleChallanDateBlur = () => {
    const formatted = formatDateDDMMYY(challanDateStr.trim());
    if (formatted) {
      handleChallanDateChange(formatted);
    }
  };

  const openNativeDatePicker = (pickerRef: React.RefObject<HTMLInputElement | null>) => {
    const el = pickerRef.current;
    if (!el) return;
    if (typeof (el as any).showPicker === 'function') {
      try {
        (el as any).showPicker();
      } catch {
        el.click();
      }
    } else {
      el.click();
    }
  };

  // Filtered parties for search dropdown (scoped to selected / allowed Sales Center)
  const filteredParties = useMemo(() => {
    const isAll = !header.branchId || header.branchId === 'ALL' || header.branchId.toLowerCase() === 'all';
    let scopedParties = parties;
    if (!isAll) {
      const matchedByBranch = parties.filter((p) =>
        partyMatchesBranch(p, header.branchId!, allowedBranches, salespersons)
      );
      scopedParties = matchedByBranch;
    } else if (!isStrictSuperAdmin(currentUser) && !isAccountsAdmin(currentUser) && allowedBranches.length > 0) {
      scopedParties = parties.filter((p) =>
        allowedBranches.some((ab) => partyMatchesBranch(p, ab.id, allowedBranches, salespersons))
      );
    }

    if (!partySearchText.trim()) return scopedParties.slice(0, 30);
    const q = partySearchText.toLowerCase().trim();
    return scopedParties
      .filter((p) => p.name.toLowerCase().includes(q) || (p.phone && p.phone.includes(q)) || (p.address && p.address.toLowerCase().includes(q)))
      .slice(0, 30);
  }, [parties, partySearchText, header.branchId, allowedBranches, salespersons, currentUser]);

  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => getAllCategories());

  useEffect(() => {
    const refreshCategories = () => setCategoryOrder(getAllCategories());
    refreshCategories();
    window.addEventListener('categories-updated', refreshCategories);
    window.addEventListener('storage', refreshCategories);
    return () => {
      window.removeEventListener('categories-updated', refreshCategories);
      window.removeEventListener('storage', refreshCategories);
    };
  }, [items]);

  const sortedCatalogItems = useMemo(() => {
    return sortItemsCategorySerialWise(items, categoryOrder);
  }, [items, categoryOrder]);

  // Filtered items for item description autocomplete (all items, grouped & ordered by category list)
  const groupedFilteredItems = useMemo(() => {
    const q = itemSearchText.trim();
    const matched = !q
      ? sortedCatalogItems
      : sortedCatalogItems.filter((it) =>
          matchesFlexibleSearch(
            `${it.name} ${it.sizeSpec || ''} ${it.category || ''} ${it.brand || ''}`,
            q,
            `${it.code || ''} ${it.unit || ''}`
          )
        );
    return groupItemsByCategoryOrder(matched, categoryOrder);
  }, [sortedCatalogItems, itemSearchText, categoryOrder]);

  const filteredItems = groupedFilteredItems.orderedItems;

  const filteredSalespersons = useMemo(() => {
    const q = salespersonSearchText.trim().toLowerCase();
    if (!q) return allowedSalespersonsForBranch;
    return allowedSalespersonsForBranch.filter(
      (sp) =>
        (sp.code || '').toLowerCase().includes(q) ||
        (sp.name || '').toLowerCase().includes(q) ||
        (sp.branchName || '').toLowerCase().includes(q)
    );
  }, [allowedSalespersonsForBranch, salespersonSearchText]);

  const selectedSalespersonDisplay = useMemo(() => {
    if (!header.salesmanCode && !header.salespersonName) return '';
    const sp = allowedSalespersonsForBranch.find(
      (s) =>
        (s.code || '').toLowerCase() === (header.salesmanCode || '').toLowerCase() ||
        (s.name || '').toLowerCase() === (header.salespersonName || '').toLowerCase()
    );
    if (sp) return sp.code ? `${sp.code} - ${sp.name}` : sp.name;
    return `${header.salesmanCode || ''}${header.salespersonName ? ` - ${header.salespersonName}` : ''}`.trim();
  }, [allowedSalespersonsForBranch, header.salesmanCode, header.salespersonName]);

  // Reset highlight indices to 1st result (index 0) whenever search query, filtered list, or dropdown open state changes
  useEffect(() => {
    setPartyHighlightIdx(0);
  }, [partySearchText, filteredParties.length, partySearchOpen]);

  useEffect(() => {
    if (partySearchOpen && partyDropdownRef.current) {
      const el = partyDropdownRef.current.querySelector('[data-party-highlighted="true"]') as HTMLElement | null;
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [partyHighlightIdx, partySearchOpen]);

  useEffect(() => {
    setSalespersonHighlightIdx(0);
  }, [salespersonSearchText, filteredSalespersons.length, salespersonSearchOpen]);

  useEffect(() => {
    if (salespersonSearchOpen && salespersonDropdownRef.current) {
      const el = salespersonDropdownRef.current.querySelector('[data-salesperson-highlighted="true"]') as HTMLElement | null;
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [salespersonHighlightIdx, salespersonSearchOpen]);

  useEffect(() => {
    setItemHighlightIdx(0);
  }, [itemSearchText, filteredItems.length, activeItemSearchRow]);

  useEffect(() => {
    if (activeItemSearchRow !== null && itemDropdownRef.current) {
      const el = itemDropdownRef.current.querySelector('[data-item-highlighted="true"]') as HTMLElement | null;
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [itemHighlightIdx, activeItemSearchRow]);

  const handleSelectSalesperson = (sp: Salesperson | null) => {
    if (!sp) {
      setHeader((prev) => ({ ...prev, salesmanCode: '', salespersonName: '' }));
    } else {
      setHeader((prev) => ({
        ...prev,
        salesmanCode: sp.code || '',
        salespersonName: sp.name || ''
      }));
    }
    setSalespersonSearchOpen(false);
    setSalespersonSearchText('');
    setTimeout(() => {
      itemInputRefs.current[0]?.focus();
      itemInputRefs.current[0]?.select();
    }, 50);
  };

  // Handle party selection
  const handleSelectParty = (p: Party) => {
    setHeader((prev) => ({
      ...prev,
      partyName: p.name,
      address: p.address || prev.address || '',
      phone: p.phone || prev.phone || '',
      salesmanCode: p.salesmanCode || prev.salesmanCode || '',
      salespersonName: p.salespersonName || prev.salespersonName || ''
    }));
    setPartySearchOpen(false);
    setPartySearchText('');
    setTimeout(() => {
      orderDateInputRef.current?.focus();
      orderDateInputRef.current?.select();
    }, 60);
  };

  const isMobileViewport = () => typeof window !== 'undefined' && window.innerWidth < 768;
  const lastQtyFocusAtRef = useRef<{ row: number; ts: number } | null>(null);
  const manualUnitTapRowRef = useRef<number | null>(null);

  // Add line item
  const handleAddLine = () => {
    const defaultItem = items[0];
    const newLine: BillLineItem = {
      id: `line-${Date.now()}-${lines.length}`,
      slNo: lines.length + 1,
      itemId: defaultItem?.id || '',
      itemCode: defaultItem?.code || '',
      itemDescription: '',
      itemName: '',
      coilQty: 0,
      unit: 'Coils',
      rate: defaultItem?.rate || 0,
      amount: 0,
      sizeSpec: defaultItem?.sizeSpec || ''
    };
    setLines((prev) => [...prev, newLine]);
    return lines.length;
  };

  // Auto-advance focus to next row's Name Of Items (appending a row when on the last row)
  const advanceToNextBillRow = (idx: number) => {
    const nextIdx = idx + 1;
    const isLastRow = idx >= lines.length - 1;
    if (isLastRow) {
      handleAddLine();
    }
    setTimeout(() => {
      const nextInput = itemInputRefs.current[nextIdx];
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
        try {
          nextInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch {}
      }
    }, isLastRow ? 70 : 40);
  };

  // Update line item field
  const handleUpdateLine = (index: number, field: keyof BillLineItem, value: any) => {
    setLines((prev) => {
      const updated = [...prev];
      const line = { ...updated[index], [field]: value, manuallyEdited: true };

      if (field === 'itemDescription') {
        line.itemName = value;
      } else if (field === 'itemName') {
        line.itemDescription = value;
      }

      if (field === 'coilQty' || field === 'rate') {
        const qty = field === 'coilQty' ? Number(value) || 0 : Number(line.coilQty) || 0;
        const rate = field === 'rate' ? Number(value) || 0 : Number(line.rate) || 0;
        line.amount = Math.round(qty * rate * 100) / 100;
        line.unit = normalizeUnit(line.unit, qty);
      }
      updated[index] = line;
      return updated;
    });
  };

  // Unit conversion: Coil to Meter (price / 100), Meter to Coil (price * 100)
  const handleUnitChange = (index: number, targetUnit: string) => {
    setLines((prev) => {
      const updated = [...prev];
      const line = { ...updated[index], manuallyEdited: true };
      const oldUnit = (line.unit || '').trim().toLowerCase();
      const newU = targetUnit.trim().toLowerCase();
      let currentRate = Number(line.rate) || 0;
      const currentQty = Number(line.coilQty) || 0;

      const isOldCoil = oldUnit.includes('coil');
      const isNewMeter = newU.includes('meter') || newU === 'm' || newU.includes('mtr');
      const isOldMeter = oldUnit.includes('meter') || oldUnit === 'm' || oldUnit.includes('mtr');
      const isNewCoil = newU.includes('coil');

      // 1 coil = 100 meter calculate it:
      if (isOldCoil && isNewMeter) {
        currentRate = Math.round((currentRate / 100) * 100) / 100;
      } else if (isOldMeter && isNewCoil) {
        currentRate = Math.round(currentRate * 100 * 100) / 100;
      }

      line.unit = normalizeUnit(targetUnit, currentQty);
      line.rate = currentRate;
      line.amount = Math.round(currentQty * currentRate * 100) / 100;
      updated[index] = line;
      return updated;
    });
  };

  // Select item from autocomplete
  const handleSelectItem = (index: number, selectedItem: Item) => {
    const curQty = Number(lines[index]?.coilQty) || 0;
    const rate = Number(selectedItem.rate) || 0;
    const isOffice = Boolean(header.isOfficeBill);
    const initialUnit = normalizeUnit(selectedItem.unit || 'Coils', curQty);

    setLines((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        itemId: selectedItem.id,
        itemCode: selectedItem.code || '',
        itemDescription: selectedItem.name,
        itemName: selectedItem.name,
        unit: initialUnit,
        rate: rate,
        amount: Math.round(curQty * rate * 100) / 100,
        sizeSpec: selectedItem.sizeSpec || '',
        manuallyEdited: true
      };
      return updated;
    });

    setActiveItemSearchRow(null);
    setItemSearchText('');

    // Flow after item selection:
    // Sales Center Bill Entry: "after select item open colour input form Red black yellow green blue others and its total show in quantity. colour input open for only BYA (without re), BAYA, flexible- 01 core"
    // Office Bill Entry: "and Office bill Entry same like Sales Center Bill Entry but here no need colour input form."
    if (!isOffice && isColorApplicableBillItem(selectedItem.name, selectedItem.category)) {
      setColorModalState({
        isOpen: true,
        lineIndex: index,
        itemName: selectedItem.name,
        unit: initialUnit,
        colors: { red: 0, blk: 0, yel: 0, grn: 0, blu: 0, others: 0 }
      });
      setTimeout(() => {
        colorRedRef.current?.focus();
        colorRedRef.current?.select();
      }, 100);
    } else if (isMobileViewport() && curQty > 0) {
      advanceToNextBillRow(index);
    } else {
      setTimeout(() => {
        qtyInputRefs.current[index]?.focus();
        qtyInputRefs.current[index]?.select();
      }, 60);
    }
  };

  // Confirm Color Modal and set total as quantity
  const handleConfirmColorModal = (colors: { red: number; blk: number; yel: number; grn: number; blu: number; others: number }) => {
    if (!colorModalState) return;
    const idx = colorModalState.lineIndex;
    const total = (Number(colors.red) || 0) + (Number(colors.blk) || 0) + (Number(colors.yel) || 0) + (Number(colors.grn) || 0) + (Number(colors.blu) || 0) + (Number(colors.others) || 0);

    if (total === 0) {
      // "if select any item and quantity o ten remove that line and goes to discount persentase , next to amount field"
      if (lines.length > 1) {
        handleDeleteLine(idx);
      }
      setColorModalState(null);
      setTimeout(() => {
        discountPercentInputRef.current?.focus();
        discountPercentInputRef.current?.select();
      }, 60);
      return;
    }

    setLines((prev) => {
      const updated = [...prev];
      if (!updated[idx]) return prev;
      const line = { ...updated[idx] };
      line.coilQty = total;
      line.unit = normalizeUnit(line.unit, total);
      line.colors = colors;
      line.amount = Math.round(total * (Number(line.rate) || 0) * 100) / 100;
      updated[idx] = line;
      return updated;
    });

    setColorModalState(null);
    // Continuous entry: on mobile advance straight to next row's Name Of Items; on desktop focus Unit
    if (isMobileViewport()) {
      advanceToNextBillRow(idx);
    } else {
      setTimeout(() => {
        unitInputRefs.current[idx]?.focus();
      }, 60);
    }
  };

  // Delete line
  const handleDeleteLine = (index: number) => {
    setLines((prev) => {
      if (prev.length <= 1) {
        return [{
          id: `line-${Date.now()}`,
          slNo: 1,
          itemId: '',
          itemCode: '',
          itemDescription: '',
          itemName: '',
          coilQty: 0,
          unit: 'Coils',
          rate: 0,
          amount: 0,
          sizeSpec: ''
        }];
      }
      return prev.filter((_, idx) => idx !== index);
    });
  };

  // "if amount field change +-1 then not change persentage"
  const handleDiscountAmountChange = (newAmount: number) => {
    const currentPct = header.discountPercent || 0;
    const expectedAmount = Math.round((subtotal * currentPct) / 100);

    if (Math.abs(newAmount - expectedAmount) <= 1) {
      // Within +-1: strictly do NOT change percentage
      setHeader((prev) => ({
        ...prev,
        discountAmount: newAmount
      }));
    } else {
      // Change is more than +-1: update discount amount and recalculate percentage
      const newPct = subtotal > 0 ? Math.round(((newAmount / subtotal) * 100) * 10) / 10 : 0;
      setHeader((prev) => ({
        ...prev,
        discountAmount: newAmount,
        discountPercent: newPct
      }));
    }
  };

  // Save Bill Action
  const handleSaveAndToast = () => {
    if (lines.every((l) => !l.itemDescription && (Number(l.coilQty) || 0) <= 0)) {
      showToast('Please add at least one valid item before saving.', 'error');
      return;
    }
    const finalDate = formatDateDDMMYY(billDateStr) || getTodayDDMMYY();
    const finalOrderDate = formatDateDDMMYY(orderDateStr) || finalDate;
    const finalChallanDate = formatDateDDMMYY(challanDateStr) || finalDate;

    const nowIso = new Date().toISOString();
    const finalBillData = {
      updatedAt: nowIso,
      header: {
        ...header,
        updatedAt: nowIso,
        date: finalDate,
        orderDate: finalOrderDate,
        challanDate: finalChallanDate,
        discountAmount: discountAmount,
        discountPercent: discountPercent
      },
      lines: lines.map((l) => ({
        ...l,
        itemDescription: (l.itemDescription || l.itemName || '').trim(),
        itemName: (l.itemDescription || l.itemName || '').trim(),
        manuallyEdited: true
      })),
      totalCoils,
      subtotal,
      grandTotal,
      inWords
    };
    onSaveBill?.(finalBillData);
    showToast('✓ Bill saved successfully!');
  };

  // Clear Bill
  const handleClearBill = () => {
    if (window.confirm('Clear all lines and start a fresh bill?')) {
      onResetSample?.();
      setLines([
        {
          id: `line-${Date.now()}`,
          slNo: 1,
          itemId: '',
          itemCode: '',
          itemDescription: '',
          itemName: '',
          coilQty: 0,
          unit: 'Coils',
          rate: 0,
          amount: 0,
          sizeSpec: ''
        }
      ]);
      setHeader((prev) => ({
        ...prev,
        partyName: '',
        address: '',
        discountPercent: 0,
        discountAmount: 0
      }));
      setTimeout(() => {
        partyNameInputRef.current?.focus();
        partyNameInputRef.current?.select();
      }, 100);
      showToast('Form cleared.');
    }
  };

  // Handle Draft Bill
  const handleDraftBill = () => {
    if (onSaveBill) {
      const nowIso = new Date().toISOString();
      onSaveBill({
        isDraft: true,
        updatedAt: nowIso,
        header: {
          ...header,
          updatedAt: nowIso,
          date: billDateStr,
          orderDate: orderDateStr,
          challanDate: challanDateStr
        },
        lines,
        totalCoils,
        subtotal,
        grandTotal
      });
    }
    showToast('✓ Bill successfully saved as Draft!');
  };

  // Handle Send Email
  const handleSendEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setEmailSending(true);
    const wasOffice = Boolean(header.isOfficeBill);
    setTimeout(() => {
      setEmailSending(false);
      setIsSendEmailModalOpen(false);
      if (wasOffice) {
        setHeader((prev) => ({ ...prev, isOfficeBill: true }));
      }
      showToast(`✓ Invoice successfully sent to ${emailTo}!`);
    }, 1000);
  };

  // Handle AI-Powered Bill Import (Excel, CSV, PDF, JPEG, JPG, PNG)
  const handleImportBillFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsImportingFile(true);
      showToast('Extracting bill items with AI...');

      const aiRes = await parseDocumentWithAI(file, {
        mode: 'bill',
        knownParties: parties,
        knownItems: items
      });

      const parsed = aiRes.data;
      if (!parsed || !Array.isArray(parsed.lines) || parsed.lines.length === 0) {
        showToast(aiRes.error || 'No bill items detected in uploaded file.', 'error');
        return;
      }

      const importedLines: BillLineItem[] = parsed.lines
        .map((ln, idx): BillLineItem | null => {
          const rawDesc = String(ln.itemDescription || ln.itemName || '').trim();
          if (!rawDesc) return null;

          const qtyNum = Number(ln.coilQty || ln.quantity || ln.qty || 0) || 1;
          const rawRate = Number(ln.rate || 0) || 0;
          const rawAmt = Number(ln.amount || 0) || 0;

          const matchRes = matchImportedItemWithStored(
            rawDesc,
            rawRate,
            qtyNum,
            items,
            ln.unit,
            rawAmt
          );
          const matchedItem = matchRes.matchedStoredItem || matchRes.suggestedStoredItem;
          const finalName = matchRes.shouldUseStoredName
            ? matchRes.finalItemDescription
            : rawDesc;
          const finalRate = rawRate > 0 ? rawRate : (matchRes.finalRate || matchedItem?.rate || 0);
          const finalQty = matchRes.importedQty || qtyNum;
          const finalAmount =
            rawAmt > 0 ? rawAmt : Math.round(finalQty * finalRate * 100) / 100;
          const finalUnit = normalizeUnit(ln.unit || matchRes.finalUnit || matchedItem?.unit || 'Coils', finalQty);

          const hasColors =
            (Number(ln.red) || 0) > 0 ||
            (Number(ln.black) || 0) > 0 ||
            (Number(ln.yellow) || 0) > 0 ||
            (Number(ln.green) || 0) > 0 ||
            (Number(ln.blue) || 0) > 0 ||
            (Number(ln.others) || 0) > 0;

          return {
            id: `line-imp-${Date.now()}-${idx}`,
            slNo: idx + 1,
            itemId: matchedItem?.id || '',
            itemCode: matchedItem?.code || ln.itemCode || '',
            itemDescription: finalName,
            itemName: finalName,
            coilQty: finalQty,
            unit: finalUnit,
            rate: finalRate,
            amount: finalAmount,
            sizeSpec: matchRes.finalSizeSpec || matchedItem?.sizeSpec || ln.sizeSpec || '',
            isSpecialItem: matchedItem?.isSpecialItem,
            baseItemId: matchedItem?.baseItemId,
            baseItemCode: matchedItem?.baseItemCode,
            stockMultiplier: matchedItem?.stockMultiplier,
            ...(hasColors
              ? {
                  colors: {
                    red: Number(ln.red) || 0,
                    black: Number(ln.black) || 0,
                    yellow: Number(ln.yellow) || 0,
                    green: Number(ln.green) || 0,
                    blue: Number(ln.blue) || 0,
                    others: Number(ln.others) || 0
                  }
                }
              : {})
          };
        })
        .filter((x): x is BillLineItem => x !== null);

      if (importedLines.length === 0) {
        showToast('No valid line items could be mapped from the file.', 'error');
        return;
      }

      const rawParty = String(parsed.partyName || '').trim();
      const targetSpCode = String(parsed.salesmanCode || header.salesmanCode || '').trim().toLowerCase();
      const matchedParty = rawParty
        ? (() => {
            const candidates = parties.filter((p) => {
              const pName = (p.name || '').trim().toLowerCase();
              const q = rawParty.toLowerCase();
              return pName === q || pName.includes(q) || q.includes(pName);
            });
            if (candidates.length <= 1) return candidates[0];
            if (targetSpCode) {
              const spMatch = candidates.find(
                (p) => (p.salesmanCode || '').trim().toLowerCase() === targetSpCode
              );
              if (spMatch) return spMatch;
            }
            return candidates[0];
          })()
        : undefined;

      const parsedDateFormatted = parsed.date ? (formatDateDDMMYY(parsed.date) || parsed.date) : '';
      const resolvedSalesCode =
        String(parsed.salesmanCode || '').trim() || matchedParty?.salesmanCode || header.salesmanCode || '';
      const matchedSalesperson = salespersons.find(
        (sp) =>
          (resolvedSalesCode && (sp.code || '').trim().toLowerCase() === resolvedSalesCode.toLowerCase()) ||
          (matchedParty?.salespersonName && (sp.name || '').trim().toLowerCase() === matchedParty.salespersonName.trim().toLowerCase()) ||
          (parsed.salespersonName && (sp.name || '').trim().toLowerCase() === String(parsed.salespersonName).trim().toLowerCase())
      );

      setLines(importedLines);
      const updatedHeader: BillHeader = {
        ...header,
        partyName: matchedParty?.name || rawParty || header.partyName,
        address: String(parsed.address || '').trim() || matchedParty?.address || header.address,
        phone: String(parsed.phone || '').trim() || matchedParty?.phone || header.phone,
        billNo: String(parsed.billNo || '').trim() || header.billNo,
        date: parsedDateFormatted || header.date,
        orderDate: parsedDateFormatted || header.orderDate || header.date,
        challanDate: parsedDateFormatted || header.challanDate || header.date,
        salesmanCode: matchedSalesperson?.code || resolvedSalesCode,
        salespersonName:
          matchedSalesperson?.name ||
          String(parsed.salespersonName || '').trim() ||
          matchedParty?.salespersonName ||
          header.salespersonName,
        orderNumber: String(parsed.orderNumber || '').trim() || header.orderNumber,
        challanNo: String(parsed.challanNo || '').trim() || header.challanNo,
        refNo: String(parsed.refNo || '').trim() || header.refNo,
        discountPercent:
          typeof parsed.discountPercent === 'number' && parsed.discountPercent > 0
            ? parsed.discountPercent
            : header.discountPercent,
        discountAmount:
          typeof parsed.discountAmount === 'number' && parsed.discountAmount > 0
            ? parsed.discountAmount
            : header.discountAmount
      };
      setHeader(updatedHeader);

      if (onStoreImportedBill) {
        onStoreImportedBill(updatedHeader, importedLines);
      }
      const methodBadge = aiRes.method === 'gemini_ai' ? 'AI' : 'Parser';
      showToast(`✓ Successfully imported ${importedLines.length} items via ${methodBadge}!`);
    } catch (err: any) {
      console.error('Failed to import bill:', err);
      showToast(err?.message || 'Failed to import bill document', 'error');
    } finally {
      setIsImportingFile(false);
      if (e.target) e.target.value = '';
    }
  };

  // Handle Received Copy Upload
  const handleUploadReceivedCopy = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceivedCopyFile(file.name);
    setIsUploadCopyModalOpen(false);
    showToast(`✓ Received copy "${file.name}" attached!`);
  };

  // If lines are empty, initialize with 1 blank line
  useEffect(() => {
    if (lines.length === 0) {
      handleAddLine();
    }
  }, []);

  return (
    <div className="w-full font-sans text-slate-100 pb-16">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 animate-fadeIn">
          <div className={`px-4 py-2.5 rounded-xl text-xs font-bold shadow-xl flex items-center space-x-2 border ${
            notification.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-400'
              : 'bg-rose-600 text-white border-rose-400'
          }`}>
            <CheckCircle2 className="w-4 h-4" />
            <span>{notification.text}</span>
          </div>
        </div>
      )}

      {/* Hidden File Input for AI Bill Import (Excel, PDF, Image) */}
      <input
        type="file"
        id="bill-file-upload-input"
        ref={fileInputRef}
        onChange={handleImportBillFile}
        accept=".xlsx,.xls,.csv,.pdf,.jpeg,.jpg,.png,.webp,.bmp,.tiff,application/pdf,image/*,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
      />

      {/* Hidden File Input for Received Copy Upload */}
      <input
        type="file"
        id="received-copy-file-upload"
        ref={copyFileInputRef}
        onChange={handleUploadReceivedCopy}
        accept="image/*,.pdf"
        className="hidden"
      />

      {/* CLEAN SEARCHABLE SALES CENTER SELECTOR (ALL TOP BUTTONS HIDDEN) */}
      <div className="cyber-glass-card relative z-40 border border-cyan-500/25 text-white rounded-2xl p-2.5 shadow-xl mb-4 flex flex-wrap items-center justify-between gap-2 no-print">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <SalesCenterSearchFilter
            value={header.branchId || allowedBranches[0]?.id || 'ALL'}
            onChange={(selectedBranchId) => {
              billNoManuallyEditedRef.current = false;
              if (selectedBranchId === 'ALL') {
                setHeader((prev) => ({
                  ...prev,
                  branchId: 'ALL',
                  branchName: isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser)
                    ? 'All Sales Centers'
                    : `All Assigned Centers (${allowedBranches.length})`,
                  billNo: !editingBillId
                    ? computeBranchRunningBillNo(billsForSerial, null, Boolean(prev.isOfficeBill))
                    : prev.billNo
                }));
              } else {
                const matched = allowedBranches.find((b) => b.id === selectedBranchId);
                if (matched) {
                  const nextBranchSps = filterSalespersonsByBranch(salespersons, matched.id, allowedBranches, currentUser);
                  const currentSpValid = !header.salesmanCode || nextBranchSps.some(
                    (sp) =>
                      (sp.code || '').trim().toLowerCase() === (header.salesmanCode || '').trim().toLowerCase() ||
                      (sp.name || '').trim().toLowerCase() === (header.salespersonName || '').trim().toLowerCase()
                  );
                  setHeader((prev) => ({
                    ...prev,
                    branchId: matched.id,
                    branchName: matched.name,
                    billNo: !editingBillId
                      ? computeBranchRunningBillNo(billsForSerial, matched, Boolean(prev.isOfficeBill))
                      : prev.billNo,
                    ...(currentSpValid ? {} : { salesmanCode: '', salespersonName: '' })
                  }));
                }
              }
            }}
            branches={allowedBranches}
            isLocked={!canSelectAllCenters && allowedBranches.length <= 1}
            lockedReason={`Locked to assigned sales center: ${currentBranch?.name || header.branchName || allowedBranches[0]?.name || ''}`}
            includeAllOption={canSelectAllCenters}
            allOptionLabel={
              isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser)
                ? `All Sales Centers (${allowedBranches.length})`
                : `All Assigned Centers (${allowedBranches.length})`
            }
            allOptionValue="ALL"
            label="Sales Center:"
            placeholder="Search sales center..."
            theme="dark"
            size="sm"
            widthClass="min-w-0 w-full sm:w-auto sm:min-w-[240px] sm:max-w-[320px]"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="px-2.5 py-1 rounded-lg bg-[#061520] border border-cyan-500/30 text-[11px] font-bold text-amber-300 whitespace-nowrap">
            {header.isOfficeBill ? 'Office Bill Entry' : 'Sales Center Bill Entry'}
          </span>
        </div>
      </div>

      {/* 7.2" x 10" WHITE SHEET PAD */}
      <div className="bill-paper-dimensions max-w-[7.2in] w-full mx-auto bg-white text-black pt-0 px-3 pb-4 sm:px-[0.28in] sm:pb-[0.28in] shadow-2xl rounded-2xl border border-slate-300 min-h-[10in] relative print:rounded-none print:border-none print:shadow-none print:mx-auto print:w-[7.2in] print:max-w-[7.2in] print:min-h-[10in] print:pt-0 print:px-[0.28in] print:pb-[0.28in]">
        {/* HEADER SECTION: Top 1.5" strictly reserved for Company Logo */}
        <div className="text-center pb-0 space-y-0 text-black font-sans leading-tight pt-0">
          <div
            style={{ height: '1.5in', minHeight: '1.5in' }}
            className={`flex items-center justify-center ${
              padHeaderMode !== 'plain' ? 'hide-on-preprinted-pad invisible opacity-0' : ''
            }`}
          >
            {(company as any)?.logoUrl || (company as any)?.logo ? (
              <img src={(company as any).logoUrl || (company as any).logo} alt="Logo" className="max-h-[1.25in] object-contain" />
            ) : (
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-red-600 text-white font-black text-xl flex items-center justify-center rounded">
                  PC
                </div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">
                  {company.name || 'POLY CABLES INDUSTRIES LTD.'}
                </h1>
              </div>
            )}
          </div>

          {/* Address, Title & Invoice Metadata start immediately after 1.5" mark */}
          {headerAddressLine1 ? (
            <div className="space-y-0.5 pt-0 mt-0 pb-1">
              <div className="font-extrabold text-slate-900 tracking-tight text-[14px] leading-tight madhupur-address-line">
                {headerAddressLine1}
              </div>
              {headerAddressLine2 && (
                <div className="text-slate-800 font-bold text-[14px] leading-tight madhupur-address-line">
                  {headerAddressLine2}
                </div>
              )}
              {headerAddressLine3 && (
                <div className="text-slate-800 font-semibold text-[14px] leading-tight madhupur-address-line">
                  {headerAddressLine3}
                </div>
              )}
            </div>
          ) : null}

          {padHeaderMode === 'plain' && (
            <div className="pt-1 pb-2 text-center border-b-2 border-black mb-2">
              <span className="inline-block px-3 py-0.5 bg-black text-white text-xs font-black uppercase tracking-wider rounded">
                {header.isOfficeBill ? 'Office Bill' : 'Invoice / Bill'}
              </span>
            </div>
          )}
        </div>

        {/* METADATA GRID (LEFT & RIGHT) */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-y-2 gap-x-6 mb-4 text-xs font-semibold">
          {/* LEFT COLUMN: Party Name & Address */}
          <div className="sm:col-span-7 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-24 shrink-0 font-bold text-slate-900">Party Name:</span>
              <div className="flex-1 relative bill-party-search-container">
                <div className="flex items-center border-b border-dotted border-slate-500 pb-0.5">
                  <input
                    ref={partyNameInputRef}
                    type="text"
                    value={header.partyName || ''}
                    onChange={(e) => {
                      setHeader((prev) => ({ ...prev, partyName: e.target.value }));
                      setPartySearchText(e.target.value);
                      setPartySearchOpen(true);
                      setPartyHighlightIdx(0);
                    }}
                    onFocus={() => {
                      setPartyHighlightIdx(0);
                      if (!editingBillId && !(header.partyName || '').trim()) {
                        setPartySearchOpen(true);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!partySearchOpen) {
                          setPartySearchOpen(true);
                          setPartyHighlightIdx(0);
                        } else if (filteredParties.length > 0) {
                          setPartyHighlightIdx((prev) => Math.min(prev + 1, filteredParties.length - 1));
                        }
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!partySearchOpen) {
                          setPartySearchOpen(true);
                          setPartyHighlightIdx(0);
                        } else if (filteredParties.length > 0) {
                          setPartyHighlightIdx((prev) => Math.max(prev - 1, 0));
                        }
                      } else if (e.key === 'Escape') {
                        if (partySearchOpen) {
                          e.preventDefault();
                          e.stopPropagation();
                          setPartySearchOpen(false);
                        }
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        if (partySearchOpen && filteredParties.length > 0) {
                          const targetParty = filteredParties[partyHighlightIdx] || filteredParties[0];
                          if (targetParty) {
                            handleSelectParty(targetParty);
                            return;
                          }
                        }
                        setPartySearchOpen(false);
                        orderDateInputRef.current?.focus();
                        orderDateInputRef.current?.select();
                      }
                    }}
                    placeholder="Search or enter party name..."
                    className="w-full bg-transparent text-xs font-bold text-slate-900 focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
                  />
                  <ChevronDown
                    className="w-3.5 h-3.5 text-slate-500 shrink-0 cursor-pointer"
                    onClick={() => {
                      const nextOpen = !partySearchOpen;
                      if (nextOpen) {
                        setPartySearchText('');
                        setPartyHighlightIdx(0);
                      }
                      setPartySearchOpen(nextOpen);
                    }}
                  />
                </div>

                {/* Autocomplete Party Dropdown */}
                {partySearchOpen && filteredParties.length > 0 && (
                  <div
                    ref={partyDropdownRef}
                    className="absolute z-40 left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-xl max-h-52 overflow-y-auto divide-y divide-slate-100"
                  >
                    {filteredParties.map((p, pIdx) => {
                      const isHighlighted = partyHighlightIdx === pIdx;
                      return (
                        <div
                          key={p.id}
                          data-party-highlighted={isHighlighted}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectParty(p);
                          }}
                          onMouseEnter={() => setPartyHighlightIdx(pIdx)}
                          className={`p-2 cursor-pointer text-xs flex items-center justify-between transition-colors ${
                            isHighlighted
                              ? 'bg-emerald-100 text-emerald-950 font-bold border-l-4 border-emerald-600'
                              : 'hover:bg-slate-100'
                          }`}
                        >
                          <div>
                            <div className="font-bold text-slate-900">{p.name}</div>
                            <div className="text-[10px] text-slate-500">{p.address || 'No address'}</div>
                          </div>
                          {p.salesmanCode && (
                            <span className="text-[10px] font-mono px-1 bg-slate-100 rounded text-slate-600 font-bold">
                              {p.salesmanCode}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    <div
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setAddPartyModalOpen(true);
                        setPartySearchOpen(false);
                      }}
                      className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-center text-xs cursor-pointer"
                    >
                      + Add New Party
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Address Row */}
            <div className="flex items-center gap-2">
              <span className="w-24 shrink-0 font-bold text-slate-900">Address    :</span>
              <div className="flex-1 border-b border-dotted border-slate-500 pb-0.5">
                <input
                  type="text"
                  value={header.address || ''}
                  onChange={(e) => setHeader((prev) => ({ ...prev, address: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      orderDateInputRef.current?.focus();
                      orderDateInputRef.current?.select();
                    }
                  }}
                  placeholder="Address"
                  className="w-full bg-transparent text-xs text-slate-900 focus:outline-none placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Order No, Bill No, Challan No, Ref No, Sales Code, Received Copy */}
          <div className="sm:col-span-5 space-y-1.5">
            {/* Order No & Date (Date 1) */}
            <div className="flex items-center justify-between gap-1 border-b border-dotted border-slate-400 pb-0.5">
              <div className="flex items-center gap-1 flex-1">
                <span className="shrink-0 font-bold text-slate-900">Order No. :</span>
                <input
                  type="text"
                  value={header.orderNumber || ''}
                  onChange={(e) => setHeader((prev) => ({ ...prev, orderNumber: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      orderDateInputRef.current?.focus();
                      orderDateInputRef.current?.select();
                    }
                  }}
                  className="w-full bg-transparent text-xs font-mono focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-1 shrink-0 text-slate-700 relative">
                <span>Date:</span>
                <input
                  ref={orderDateInputRef}
                  type="text"
                  value={orderDateStr}
                  onChange={(e) => handleOrderDateChange(e.target.value)}
                  onBlur={handleOrderDateBlur}
                  placeholder="dd.mm.yy"
                  className="w-20 bg-transparent text-xs font-mono font-bold focus:outline-none text-right"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleOrderDateBlur();
                      billDateInputRef.current?.focus();
                      billDateInputRef.current?.select();
                    }
                  }}
                  title="Format: dd.mm.yy (changing Order Date updates all dates)"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => openNativeDatePicker(orderDatePickerRef)}
                  className="p-0.5 text-slate-500 hover:text-slate-900 rounded cursor-pointer"
                  title="Pick Order Date (dd.mm.yy)"
                >
                  <Calendar className="w-3.5 h-3.5" />
                </button>
                <input
                  ref={orderDatePickerRef}
                  type="date"
                  tabIndex={-1}
                  value={parseDateToISO(orderDateStr)}
                  onChange={(e) => {
                    if (e.target.value) {
                      handleOrderDateChange(formatDateDDMMYY(e.target.value));
                    }
                  }}
                  className="sr-only pointer-events-none"
                />
              </div>
            </div>

            {/* Bill No & Date (Date 2) */}
            <div className="flex items-center justify-between gap-1 border-b border-dotted border-slate-400 pb-0.5">
              <div className="flex items-center gap-1.5 flex-1">
                <span className="shrink-0 font-bold text-slate-900">Bill No.    :</span>
                <input
                  type="text"
                  value={
                    header.billNo ||
                    computeBranchRunningBillNo(billsForSerial, currentBranch, Boolean(header.isOfficeBill))
                  }
                  onChange={(e) => {
                    billNoManuallyEditedRef.current = true;
                    setHeader((prev) => ({ ...prev, billNo: e.target.value }));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      billDateInputRef.current?.focus();
                      billDateInputRef.current?.select();
                    }
                  }}
                  className="w-20 bg-white border border-slate-400 rounded px-1.5 py-0.5 text-xs font-bold font-mono text-center focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>
              <div className="flex items-center gap-1 shrink-0 text-slate-700 relative">
                <span>Date:</span>
                <input
                  ref={billDateInputRef}
                  type="text"
                  value={billDateStr}
                  onChange={(e) => handleBillDateChange(e.target.value)}
                  onBlur={handleBillDateBlur}
                  placeholder="dd.mm.yy"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleBillDateBlur();
                      challanDateInputRef.current?.focus();
                      challanDateInputRef.current?.select();
                    }
                  }}
                  className="w-20 bg-transparent text-xs font-mono font-bold focus:outline-none text-right"
                  title="Format: dd.mm.yy (2nd date can be changed separately)"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => openNativeDatePicker(billDatePickerRef)}
                  className="p-0.5 text-slate-500 hover:text-slate-900 rounded cursor-pointer"
                  title="Pick Bill Date (dd.mm.yy)"
                >
                  <Calendar className="w-3.5 h-3.5" />
                </button>
                <input
                  ref={billDatePickerRef}
                  type="date"
                  tabIndex={-1}
                  value={parseDateToISO(billDateStr)}
                  onChange={(e) => {
                    if (e.target.value) {
                      handleBillDateChange(formatDateDDMMYY(e.target.value));
                    }
                  }}
                  className="sr-only pointer-events-none"
                />
              </div>
            </div>

            {/* Challan No & Date (Date 3) */}
            <div className="flex items-center justify-between gap-1 border-b border-dotted border-slate-400 pb-0.5">
              <div className="flex items-center gap-1 flex-1">
                <span className="shrink-0 font-bold text-slate-900">Challan No.:</span>
                <input
                  type="text"
                  value={header.challanNo || ''}
                  onChange={(e) => setHeader((prev) => ({ ...prev, challanNo: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      challanDateInputRef.current?.focus();
                      challanDateInputRef.current?.select();
                    }
                  }}
                  className="w-full bg-transparent text-xs font-mono focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-1 shrink-0 text-slate-700 relative">
                <span>Date:</span>
                <input
                  ref={challanDateInputRef}
                  type="text"
                  value={challanDateStr}
                  onChange={(e) => handleChallanDateChange(e.target.value)}
                  onBlur={handleChallanDateBlur}
                  placeholder="dd.mm.yy"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleChallanDateBlur();
                      // "date to item select"
                      itemInputRefs.current[0]?.focus();
                      itemInputRefs.current[0]?.select();
                    }
                  }}
                  className="w-20 bg-transparent text-xs font-mono font-bold focus:outline-none text-right"
                  title="Format: dd.mm.yy (3rd date can be changed separately. Press Enter to jump to item selection.)"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => openNativeDatePicker(challanDatePickerRef)}
                  className="p-0.5 text-slate-500 hover:text-slate-900 rounded cursor-pointer"
                  title="Pick Challan Date (dd.mm.yy)"
                >
                  <Calendar className="w-3.5 h-3.5" />
                </button>
                <input
                  ref={challanDatePickerRef}
                  type="date"
                  tabIndex={-1}
                  value={parseDateToISO(challanDateStr)}
                  onChange={(e) => {
                    if (e.target.value) {
                      handleChallanDateChange(formatDateDDMMYY(e.target.value));
                    }
                  }}
                  className="sr-only pointer-events-none"
                />
              </div>
            </div>

            {/* Ref. No */}
            <div className="flex items-center gap-1 border-b border-dotted border-slate-400 pb-0.5">
              <span className="w-24 shrink-0 font-bold text-slate-900">Ref. No.   :</span>
              <input
                type="text"
                value={header.refNo || ''}
                onChange={(e) => setHeader((prev) => ({ ...prev, refNo: e.target.value }))}
                className="w-full bg-transparent text-xs font-mono focus:outline-none"
              />
            </div>

            {/* Sales Code & Filtered Marketing Officer (Searchable Keyboard-Navigable Dropdown) */}
            <div className="flex items-center gap-1 border-b border-dotted border-slate-400 pb-0.5 relative bill-salesperson-search-container">
              <span className="w-24 shrink-0 font-bold text-slate-900">Sales Code:</span>
              <div className="flex-1 flex items-center min-w-0 relative">
                <input
                  ref={salespersonInputRef}
                  type="text"
                  value={salespersonSearchOpen ? salespersonSearchText : selectedSalespersonDisplay}
                  onChange={(e) => {
                    setSalespersonSearchText(e.target.value);
                    setSalespersonSearchOpen(true);
                    setSalespersonHighlightIdx(0);
                  }}
                  onFocus={(e) => {
                    setSalespersonSearchText('');
                    setSalespersonSearchOpen(true);
                    setSalespersonHighlightIdx(0);
                    e.currentTarget.select();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!salespersonSearchOpen) {
                        setSalespersonSearchText('');
                        setSalespersonSearchOpen(true);
                        setSalespersonHighlightIdx(0);
                      } else if (filteredSalespersons.length > 0) {
                        setSalespersonHighlightIdx((prev) => Math.min(prev + 1, filteredSalespersons.length - 1));
                      }
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!salespersonSearchOpen) {
                        setSalespersonSearchText('');
                        setSalespersonSearchOpen(true);
                        setSalespersonHighlightIdx(0);
                      } else if (filteredSalespersons.length > 0) {
                        setSalespersonHighlightIdx((prev) => Math.max(prev - 1, 0));
                      }
                    } else if (e.key === 'Escape') {
                      if (salespersonSearchOpen) {
                        e.preventDefault();
                        e.stopPropagation();
                        setSalespersonSearchOpen(false);
                        setSalespersonSearchText('');
                      }
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      if (salespersonSearchOpen && filteredSalespersons.length > 0) {
                        const targetSp = filteredSalespersons[salespersonHighlightIdx] || filteredSalespersons[0];
                        if (targetSp) {
                          handleSelectSalesperson(targetSp);
                          return;
                        }
                      }
                      setSalespersonSearchOpen(false);
                      setSalespersonSearchText('');
                      itemInputRefs.current[0]?.focus();
                      itemInputRefs.current[0]?.select();
                    }
                  }}
                  placeholder={`Search officer (${allowedSalespersonsForBranch.length})...`}
                  className="w-full bg-transparent text-xs font-semibold text-slate-900 focus:outline-none placeholder:text-slate-400 placeholder:font-normal pr-4"
                  title="Search Marketing Officer by code or name (ArrowUp/ArrowDown + Enter)"
                />
                {header.salesmanCode && !salespersonSearchOpen && (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => handleSelectSalesperson(null)}
                    className="text-slate-400 hover:text-rose-600 p-0.5 shrink-0 cursor-pointer"
                    title="Clear Sales Officer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-500 shrink-0 cursor-pointer transition-transform ${salespersonSearchOpen ? 'rotate-180' : ''}`}
                  onClick={() => {
                    const nextOpen = !salespersonSearchOpen;
                    if (nextOpen) {
                      setSalespersonSearchText('');
                      setSalespersonHighlightIdx(0);
                      salespersonInputRef.current?.focus();
                    }
                    setSalespersonSearchOpen(nextOpen);
                  }}
                />
              </div>

              {salespersonSearchOpen && (
                <div
                  ref={salespersonDropdownRef}
                  className="absolute z-50 left-24 right-0 top-full mt-1 bg-white border border-slate-300 rounded-lg shadow-xl max-h-52 overflow-y-auto divide-y divide-slate-100"
                >
                  {filteredSalespersons.length === 0 ? (
                    <div className="p-2.5 text-[11px] text-slate-500 italic text-center">
                      No matching marketing officer
                    </div>
                  ) : (
                    filteredSalespersons.map((sp, spIdx) => {
                      const isHighlighted = salespersonHighlightIdx === spIdx;
                      const isSelected = (header.salesmanCode || '').toLowerCase() === (sp.code || '').toLowerCase() && Boolean(sp.code);
                      return (
                        <div
                          key={sp.id || `${sp.code}-${spIdx}`}
                          data-salesperson-highlighted={isHighlighted}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectSalesperson(sp);
                          }}
                          onMouseEnter={() => setSalespersonHighlightIdx(spIdx)}
                          className={`p-2 cursor-pointer text-xs flex items-center justify-between transition-colors ${
                            isHighlighted
                              ? 'bg-emerald-100 text-emerald-950 font-bold border-l-4 border-emerald-600'
                              : isSelected
                              ? 'bg-emerald-50 text-emerald-900 font-semibold'
                              : 'hover:bg-slate-100 text-slate-900'
                          }`}
                        >
                          <div className="truncate">
                            <span className="font-bold">{sp.name}</span>
                            {sp.branchName && (
                              <span className="ml-1.5 text-[10px] text-slate-500">({sp.branchName})</span>
                            )}
                          </div>
                          {sp.code && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-bold shrink-0 ml-2">
                              {sp.code}
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Received Copy */}
            <div className="flex items-center gap-2 pt-0.5">
              <span className="w-24 shrink-0 font-bold text-slate-900">Received Copy:</span>
              <button
                type="button"
                onClick={() => copyFileInputRef.current?.click()}
                className="border border-dashed border-slate-400 hover:border-slate-700 text-slate-700 bg-slate-50 hover:bg-slate-100 rounded px-2 py-0.5 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                title="Click to attach copy"
              >
                <Paperclip className="w-3 h-3 text-slate-500" />
                <span>{receivedCopyFile ? receivedCopyFile.slice(0, 15) + '...' : '+ Attach Copy'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* BILL TABLE */}
        <div className="border-2 border-black mb-4 overflow-x-auto">
          <table className={`w-full min-w-[600px] border-collapse text-black ${tableFontSize}`}>
            <thead>
              <tr className="border-b-2 border-black font-extrabold text-slate-900 divide-x-2 divide-black bg-white">
                <th className="py-1 px-1.5 w-12 text-center">Sl No.</th>
                <th className="py-1 px-3 text-left">Name Of Items</th>
                <th className="py-1 px-2 w-20 text-center">Quantity</th>
                <th className="py-1 px-2 w-20 text-center">Unit</th>
                <th className="py-1 px-2 w-24 text-center">Price/Unit</th>
                <th className="py-1 px-3 w-28 text-center">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/20">
              {lines.map((line, idx) => {
                return (
                  <tr
                    key={line.id || idx}
                    className={`divide-x-2 divide-black hover:bg-slate-50/70 group ${
                      rowDensity === 'compact' ? 'h-7' : rowDensity === 'relaxed' ? 'h-10' : 'h-8'
                    }`}
                  >
                    {/* Sl No */}
                    <td className="text-center font-bold font-mono px-1 text-slate-900 select-none">
                      {String(idx + 1).padStart(2, '0')}.
                    </td>

                    {/* Name Of Items */}
                    <td className="px-2 relative bill-item-search-container">
                      <div className="flex items-center justify-between gap-1 w-full">
                        <input
                          ref={(el) => { itemInputRefs.current[idx] = el; }}
                          type="text"
                          value={line.itemDescription || line.itemName || ''}
                          onChange={(e) => {
                            handleUpdateLine(idx, 'itemDescription', e.target.value);
                            handleUpdateLine(idx, 'itemName', e.target.value);
                            setItemSearchText(e.target.value);
                            setActiveItemSearchRow(idx);
                            setItemHighlightIdx(0);
                          }}
                          onFocus={() => {
                            setItemSearchText(line.itemDescription || line.itemName || '');
                            setActiveItemSearchRow(idx);
                            setItemHighlightIdx(0);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              e.stopPropagation();
                              if (activeItemSearchRow !== idx) {
                                setItemSearchText(line.itemDescription || line.itemName || '');
                                setActiveItemSearchRow(idx);
                                setItemHighlightIdx(0);
                              } else if (filteredItems.length > 0) {
                                setItemHighlightIdx((prev) => Math.min(prev + 1, filteredItems.length - 1));
                              }
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              e.stopPropagation();
                              if (activeItemSearchRow !== idx) {
                                setItemSearchText(line.itemDescription || line.itemName || '');
                                setActiveItemSearchRow(idx);
                                setItemHighlightIdx(0);
                              } else if (filteredItems.length > 0) {
                                setItemHighlightIdx((prev) => Math.max(prev - 1, 0));
                              }
                            } else if (e.key === 'Escape') {
                              if (activeItemSearchRow === idx) {
                                e.preventDefault();
                                e.stopPropagation();
                                setActiveItemSearchRow(null);
                              }
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              e.stopPropagation();
                              const matched =
                                activeItemSearchRow === idx && filteredItems.length > 0
                                  ? filteredItems[itemHighlightIdx] || filteredItems[0]
                                  : undefined;
                              if (matched) {
                                handleSelectItem(idx, matched);
                              } else if (Number(line.coilQty) === 0 && !(line.itemDescription || line.itemName || '').trim()) {
                                // "if select any item and quantity o ten remove that line and goes to discount persentase , next to amount field"
                                if (lines.length > 1) {
                                  handleDeleteLine(idx);
                                }
                                discountPercentInputRef.current?.focus();
                                discountPercentInputRef.current?.select();
                              } else if (Number(line.coilQty) === 0 && activeItemSearchRow !== idx) {
                                if (lines.length > 1) {
                                  handleDeleteLine(idx);
                                }
                                discountPercentInputRef.current?.focus();
                                discountPercentInputRef.current?.select();
                              } else {
                                setActiveItemSearchRow(null);
                                qtyInputRefs.current[idx]?.focus();
                                qtyInputRefs.current[idx]?.select();
                              }
                            }
                          }}
                          placeholder="Search or select item (e.g. 1x1.5)..."
                          className="w-full bg-transparent focus:outline-none font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal"
                        />
                        <div className="flex items-center space-x-1 shrink-0">
                          {/* Color Palette Icon for sales center bills */}
                          {!header.isOfficeBill && (line.itemDescription || line.itemName) && isColorApplicableBillItem(line.itemDescription || line.itemName, line.sizeSpec) && (
                            <button
                              type="button"
                              onClick={() => {
                                const initialCols = (line.colors as any) || { red: 0, blk: 0, yel: 0, grn: 0, blu: 0, others: 0 };
                                setColorModalState({
                                  isOpen: true,
                                  lineIndex: idx,
                                  itemName: line.itemDescription || line.itemName,
                                  unit: line.unit || 'Coils',
                                  colors: {
                                    red: Number(initialCols.red) || 0,
                                    blk: Number(initialCols.blk || initialCols.black) || 0,
                                    yel: Number(initialCols.yel || initialCols.yellow) || 0,
                                    grn: Number(initialCols.grn || initialCols.green) || 0,
                                    blu: Number(initialCols.blu || initialCols.blue) || 0,
                                    others: Number(initialCols.others) || 0
                                  }
                                });
                                setTimeout(() => {
                                  colorRedRef.current?.focus();
                                  colorRedRef.current?.select();
                                }, 100);
                              }}
                              className="p-0.5 rounded text-indigo-600 hover:text-indigo-800 cursor-pointer"
                              title="Enter color breakdown"
                            >
                              <Palette className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <ChevronDown
                            className="w-3.5 h-3.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                            onClick={() => {
                              const nextRow = activeItemSearchRow === idx ? null : idx;
                              if (nextRow !== null) {
                                setItemSearchText(line.itemDescription || line.itemName || '');
                                setItemHighlightIdx(0);
                              }
                              setActiveItemSearchRow(nextRow);
                            }}
                          />
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleDeleteLine(idx)}
                              className="text-slate-300 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 cursor-pointer"
                              title="Remove line"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Items Dropdown */}
                      {activeItemSearchRow === idx && (
                        <div
                          ref={itemDropdownRef}
                          className="absolute z-50 left-0 top-full mt-1 w-full min-w-[260px] max-w-[calc(100vw-2.5rem)] sm:max-w-none bg-white border border-slate-300 rounded-lg shadow-2xl max-h-60 overflow-y-auto"
                        >
                          {groupedFilteredItems.groups.map((grp) => (
                            <div key={grp.category} className="divide-y divide-slate-100">
                              <div className="px-2.5 py-1 bg-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-700 sticky top-0 z-10 border-y border-slate-200">
                                {grp.category} ({grp.items.length})
                              </div>
                              {grp.items.map(({ item: it, flatIndex }) => {
                                const isHighlighted = itemHighlightIdx === flatIndex;
                                return (
                                  <div
                                    key={it.id}
                                    data-item-highlighted={isHighlighted}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      handleSelectItem(idx, it);
                                    }}
                                    onMouseEnter={() => setItemHighlightIdx(flatIndex)}
                                    className={`p-2 cursor-pointer text-xs flex items-center justify-between transition-colors ${
                                      isHighlighted
                                        ? 'bg-emerald-100 text-emerald-950 font-bold border-l-4 border-emerald-600'
                                        : 'hover:bg-emerald-50'
                                    }`}
                                  >
                                    <div>
                                      <span className="font-bold text-slate-900">{it.name}</span>
                                      {it.category && (
                                        <span className="ml-2 text-[10px] text-slate-500 font-normal">({it.category})</span>
                                      )}
                                    </div>
                                    <span className="font-mono font-bold text-emerald-700">৳{it.rate}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                          <div
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setQuickAddRowIndex(idx);
                              setQuickAddInitialData({ name: itemSearchText });
                              setQuickAddModalOpen(true);
                              setActiveItemSearchRow(null);
                            }}
                            className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-center text-xs cursor-pointer border-t border-emerald-200 sticky bottom-0"
                          >
                            + Add New Item to Catalog
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Quantity */}
                    <td className="px-1 text-center">
                      <input
                        ref={(el) => { qtyInputRefs.current[idx] = el; }}
                        type="number"
                        inputMode="decimal"
                        enterKeyHint="next"
                        min="0"
                        step="any"
                        value={line.coilQty === 0 ? '' : line.coilQty}
                        onFocus={() => {
                          lastQtyFocusAtRef.current = { row: idx, ts: Date.now() };
                        }}
                        onBlur={() => {
                          lastQtyFocusAtRef.current = { row: idx, ts: Date.now() };
                        }}
                        onChange={(e) => handleUpdateLine(idx, 'coilQty', e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey && isMobileViewport())) {
                            const q = Number(line.coilQty) || 0;
                            const hasSelectedItem = Boolean((line.itemDescription || line.itemName || '').trim());
                            if (q === 0 && e.key === 'Enter') {
                              e.preventDefault();
                              // "if select any item and quantity o ten remove that line and goes to discount persentase , next to amount field"
                              if (lines.length > 1) {
                                handleDeleteLine(idx);
                              }
                              discountPercentInputRef.current?.focus();
                              discountPercentInputRef.current?.select();
                            } else if (isMobileViewport() && q > 0 && hasSelectedItem) {
                              e.preventDefault();
                              lastQtyFocusAtRef.current = null;
                              advanceToNextBillRow(idx);
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              unitInputRefs.current[idx]?.focus();
                            }
                          }
                        }}
                        placeholder="0"
                        className="w-full text-center bg-transparent font-bold font-mono text-slate-900 focus:outline-none"
                      />
                    </td>

                    {/* Unit */}
                    <td className="px-1 text-center font-medium text-slate-700">
                      <select
                        ref={(el) => { unitInputRefs.current[idx] = el; }}
                        value={line.unit || 'Coils'}
                        onPointerDown={() => {
                          manualUnitTapRowRef.current = idx;
                        }}
                        onTouchStart={() => {
                          manualUnitTapRowRef.current = idx;
                        }}
                        onFocus={() => {
                          if (manualUnitTapRowRef.current === idx) {
                            return;
                          }
                          const recentQty = lastQtyFocusAtRef.current;
                          const cameFromQty = Boolean(
                            recentQty &&
                            recentQty.row === idx &&
                            Date.now() - recentQty.ts < 600
                          );
                          const hasSelectedItem = Boolean((line.itemDescription || line.itemName || '').trim());
                          const hasValidQty = (Number(line.coilQty) || 0) > 0;
                          if (isMobileViewport() && cameFromQty && hasSelectedItem && hasValidQty) {
                            lastQtyFocusAtRef.current = null;
                            advanceToNextBillRow(idx);
                          }
                        }}
                        onBlur={() => {
                          if (manualUnitTapRowRef.current === idx) {
                            manualUnitTapRowRef.current = null;
                          }
                        }}
                        onChange={(e) => handleUnitChange(idx, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            // "next unit, unit to again select item, item to colour input form, form to quantity or quantity, it's continious"
                            if (idx === lines.length - 1) {
                              handleAddLine();
                              setTimeout(() => {
                                itemInputRefs.current[idx + 1]?.focus();
                                itemInputRefs.current[idx + 1]?.select();
                              }, 60);
                            } else {
                              itemInputRefs.current[idx + 1]?.focus();
                              itemInputRefs.current[idx + 1]?.select();
                            }
                          }
                        }}
                        className="bg-transparent text-center focus:outline-none cursor-pointer font-bold text-xs"
                      >
                        <option value={Number(line.coilQty) === 1 ? 'Coil' : 'Coils'}>
                          {Number(line.coilQty) === 1 ? 'Coil' : 'Coils'}
                        </option>
                        <option value={Number(line.coilQty) === 1 ? 'Meter' : 'Meters'}>
                          {Number(line.coilQty) === 1 ? 'Meter' : 'Meters'}
                        </option>
                        <option value="Bobin">Bobin</option>
                      </select>
                    </td>

                    {/* Price/Unit */}
                    <td className="px-1 text-center font-mono">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={line.rate === 0 ? '' : line.rate}
                        onChange={(e) => handleUpdateLine(idx, 'rate', e.target.value)}
                        placeholder="0"
                        className="w-full text-center bg-transparent font-mono font-bold text-slate-900 focus:outline-none"
                      />
                    </td>

                    {/* Amount */}
                    <td className="px-2 text-right font-mono font-bold text-slate-900">
                      {line.amount > 0 ? line.amount.toLocaleString('en-IN') : '0/-'}
                    </td>
                  </tr>
                );
              })}

              {/* Pad Empty Filler Lines */}
              {Array.from({ length: Math.max(0, 5 - lines.length) }).map((_, padIdx) => (
                <tr key={`filler-${padIdx}`} className="h-8 divide-x-2 divide-black">
                  <td className="text-center font-mono text-slate-300">
                    {String(lines.length + padIdx + 1).padStart(2, '0')}.
                  </td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              ))}
            </tbody>

            {/* SUMMARY ROWS */}
            <tfoot>
              {/* Row 1: Total Coils & Subtotal */}
              <tr className="border-t-2 border-black font-extrabold text-slate-900 divide-x-2 divide-black bg-white">
                <td colSpan={2} className="py-1 px-3 text-right">
                  Total Coils =
                </td>
                <td className="py-1 px-1 text-center font-mono font-bold">
                  {totalCoils}
                </td>
                <td className="py-1 px-1 text-center font-bold">
                  Coils
                </td>
                <td className="py-1 px-2 text-right font-bold">
                  Subtotal =
                </td>
                <td className="py-1 px-3 text-right font-mono font-bold">
                  {subtotal > 0 ? `${subtotal.toLocaleString('en-IN')}/-` : '0/-'}
                </td>
              </tr>

              {/* Row 2: Sales Discount (Highlighted in green box) */}
              <tr className="border-t border-black font-extrabold text-slate-900 divide-x-2 divide-black bg-white">
                <td colSpan={3} className="py-1 px-3 text-right">
                  Sales Discount
                </td>
                <td colSpan={2} className="py-1 px-2 text-center">
                  <div className="flex items-center justify-center gap-1 font-mono">
                    <input
                      ref={discountPercentInputRef}
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      value={discountPercent === 0 ? '' : discountPercent}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setHeader((prev) => ({
                          ...prev,
                          discountPercent: val,
                          discountAmount: Math.round((subtotal * val) / 100)
                        }));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          // "next to amount field"
                          discountAmountInputRef.current?.focus();
                          discountAmountInputRef.current?.select();
                        }
                      }}
                      placeholder="0"
                      className="w-12 text-center border border-slate-300 rounded bg-slate-50 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <span>% =</span>
                  </div>
                </td>
                {/* Light Green Amount Cell */}
                <td className="py-1 px-2 text-right font-mono font-bold bg-[#e6f4ea] text-emerald-900">
                  <input
                    ref={discountAmountInputRef}
                    type="number"
                    min="0"
                    step="any"
                    value={discountAmount === 0 ? '' : discountAmount}
                    onChange={(e) => handleDiscountAmountChange(parseFloat(e.target.value) || 0)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        // "after discount amount to save button and massege. every move by press enter key"
                        saveButtonRef.current?.focus();
                      }
                    }}
                    placeholder="0"
                    className="w-full text-right bg-transparent font-mono font-bold text-emerald-950 focus:outline-none"
                    title="If changed by ±1 Tk, discount percentage remains unchanged"
                  />
                </td>
              </tr>

              {/* Row 3: Grand Total */}
              <tr className="border-t-2 border-black font-black text-slate-950 divide-x-2 divide-black bg-white">
                <td colSpan={5} className="py-1.5 px-3 text-right text-sm">
                  Total =
                </td>
                <td className="py-1.5 px-3 text-right font-mono font-black text-sm">
                  {grandTotal > 0 ? `${grandTotal.toLocaleString('en-IN')}/-` : '0/-'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Add Row Button */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 no-print">
          <button
            type="button"
            onClick={handleAddLine}
            className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg border border-slate-300 flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Item Row</span>
          </button>
          <span className="text-[11px] text-slate-500 font-medium">
            Continuous Entry: Press Enter on Unit to auto-add and jump to next item!
          </span>
        </div>

        {/* IN WORD */}
        <div className="mt-3 text-xs sm:text-sm font-bold text-slate-900">
          In Word: <span className="font-extrabold">{inWords}</span>
        </div>

        {/* DYNAMIC SIGNATURE SPACER: Min 5 lines normally, 3 lines when many items */}
        <div
          className={`w-full flex-none ${
            lines.filter((l) => (l.itemDescription || '').trim() || (l.coilQty || 0) > 0).length >= 10
              ? 'min-h-[42px] h-[42px]'
              : 'min-h-[75px] h-[75px]'
          }`}
          aria-hidden="true"
        />

        {/* FOUR SIGNATURES */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 text-center text-xs font-bold text-slate-800 print:grid-cols-4">
          <div>
            <div className="border-t-2 border-black w-full mb-1"></div>
            <span>Receiver's Signature</span>
          </div>
          <div>
            <div className="border-t-2 border-black w-full mb-1"></div>
            <span>Prepared By</span>
          </div>
          <div>
            <div className="border-t-2 border-black w-full mb-1"></div>
            <span>Check By</span>
          </div>
          <div>
            <div className="border-t-2 border-black w-full mb-1"></div>
            <span>Approved By</span>
          </div>
        </div>

        {/* BOTTOM BILL TOOLS & SAVE/CANCEL ACTION BAR */}
        <div className="flex flex-wrap items-center justify-between gap-2 mt-8 sm:mt-10 pt-4 border-t border-slate-200 no-print">
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="inline-flex rounded-lg p-0.5 bg-slate-100 border border-slate-300">
              <button
                type="button"
                onClick={() => setPadHeaderMode('plain')}
                className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer ${
                  padHeaderMode === 'plain' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                Plain Paper
              </button>
              <button
                type="button"
                onClick={() => setPadHeaderMode('hide_logo')}
                className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer ${
                  padHeaderMode === 'hide_logo' ? 'bg-amber-500 text-slate-950' : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                Pad (Hide Logo)
              </button>
            </div>
            <button
              type="button"
              onClick={() => setIsEditHeaderOpen(true)}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg border border-slate-300 cursor-pointer flex items-center gap-1"
            >
              <Sliders className="w-3 h-3" />
              <span>Header</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImportingFile}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg border border-slate-300 cursor-pointer flex items-center gap-1 disabled:opacity-50"
              title="Import Bill from Excel, PDF, JPEG, JPG, or PNG using AI"
            >
              {isImportingFile ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3 h-3" />
                  <span>Import</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setIsUploadCopyModalOpen(true)}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg border border-slate-300 cursor-pointer flex items-center gap-1"
            >
              <FileUp className="w-3 h-3" />
              <span>Copy</span>
              {receivedCopyFile && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
            </button>
            <button
              type="button"
              onClick={() => setIsFontSizeModalOpen(true)}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg border border-slate-300 cursor-pointer flex items-center gap-1"
            >
              <Sliders className="w-3 h-3" />
              <span>Fonts</span>
            </button>
            <button
              type="button"
              onClick={() => setIsSendEmailModalOpen(true)}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg border border-slate-300 cursor-pointer flex items-center gap-1"
            >
              <Mail className="w-3 h-3" />
              <span>Email</span>
            </button>
            <button
              type="button"
              onClick={handleDraftBill}
              className="px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 text-[11px] font-bold rounded-lg border border-amber-300 cursor-pointer flex items-center gap-1"
            >
              <FileText className="w-3 h-3" />
              <span>Draft</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPrintDocType('challan');
                setShowPrintPreview(true);
              }}
              className="px-2.5 py-1.5 bg-cyan-50 hover:bg-cyan-100 text-cyan-800 text-[11px] font-bold rounded-lg border border-cyan-300 cursor-pointer flex items-center gap-1"
            >
              <Truck className="w-3 h-3" />
              <span>Print Challan</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPrintDocType('bill');
                setShowPrintPreview(true);
              }}
              className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold rounded-lg cursor-pointer flex items-center gap-1"
            >
              <Printer className="w-3 h-3" />
              <span>Print Invoice</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={handleClearBill}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs border border-slate-300 transition-colors cursor-pointer"
              title="Clear current bill lines"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onCancel || onClose || onBack}
              className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-xs border border-rose-200 transition-colors cursor-pointer"
              title="Cancel and exit"
            >
              Cancel
            </button>
            <button
              ref={saveButtonRef}
              type="button"
              onClick={handleSaveAndToast}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl text-xs shadow-lg transition-all flex items-center space-x-1.5 cursor-pointer focus:ring-4 focus:ring-emerald-400 focus:outline-none"
              title="Save Bill (Focused from Discount Amount via Enter)"
            >
              <Save className="w-4 h-4" />
              <span>Save Bill</span>
            </button>
          </div>
        </div>
      </div>

      {/* CONTINUOUS FAST COLOR INPUT FORM FOR SALES CENTER BILL */}
      {colorModalState && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl p-5 max-w-sm w-full shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 text-white space-y-3.5 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2.5">
              <div>
                <h3 className="font-extrabold text-sm text-white flex items-center gap-1.5">
                  <Palette className="w-4 h-4 text-cyan-400" />
                  <span>Colour Breakdown Input</span>
                </h3>
                <p className="text-[11px] font-bold text-cyan-200 truncate max-w-[240px]">
                  {colorModalState.itemName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setColorModalState(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {/* Red */}
              <div className="flex items-center justify-between bg-rose-500/10 border border-rose-400/35 p-1.5 rounded-lg">
                <span className="font-bold text-rose-300">Red:</span>
                <input
                  ref={colorRedRef}
                  type="number"
                  min="0"
                  value={colorModalState.colors.red === 0 ? '' : colorModalState.colors.red}
                  onChange={(e) => {
                    const val = Number(e.target.value) || 0;
                    setColorModalState((prev) => prev ? { ...prev, colors: { ...prev.colors, red: val } } : null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      colorBlkRef.current?.focus();
                      colorBlkRef.current?.select();
                    }
                  }}
                  placeholder="0"
                  className="w-14 text-center bg-[#061520] border border-rose-400/40 rounded font-mono font-bold text-white focus:outline-none"
                />
              </div>

              {/* Black */}
              <div className="flex items-center justify-between bg-[#081b28] border border-cyan-500/25 p-1.5 rounded-lg">
                <span className="font-bold text-slate-200">Black:</span>
                <input
                  ref={colorBlkRef}
                  type="number"
                  min="0"
                  value={colorModalState.colors.blk === 0 ? '' : colorModalState.colors.blk}
                  onChange={(e) => {
                    const val = Number(e.target.value) || 0;
                    setColorModalState((prev) => prev ? { ...prev, colors: { ...prev.colors, blk: val } } : null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      colorYelRef.current?.focus();
                      colorYelRef.current?.select();
                    }
                  }}
                  placeholder="0"
                  className="w-14 text-center bg-[#061520] border border-cyan-500/35 rounded font-mono font-bold text-white focus:outline-none"
                />
              </div>

              {/* Yellow */}
              <div className="flex items-center justify-between bg-amber-500/10 border border-amber-400/35 p-1.5 rounded-lg">
                <span className="font-bold text-amber-300">Yellow:</span>
                <input
                  ref={colorYelRef}
                  type="number"
                  min="0"
                  value={colorModalState.colors.yel === 0 ? '' : colorModalState.colors.yel}
                  onChange={(e) => {
                    const val = Number(e.target.value) || 0;
                    setColorModalState((prev) => prev ? { ...prev, colors: { ...prev.colors, yel: val } } : null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      colorGrnRef.current?.focus();
                      colorGrnRef.current?.select();
                    }
                  }}
                  placeholder="0"
                  className="w-14 text-center bg-[#061520] border border-amber-400/40 rounded font-mono font-bold text-white focus:outline-none"
                />
              </div>

              {/* Green */}
              <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-400/35 p-1.5 rounded-lg">
                <span className="font-bold text-emerald-300">Green:</span>
                <input
                  ref={colorGrnRef}
                  type="number"
                  min="0"
                  value={colorModalState.colors.grn === 0 ? '' : colorModalState.colors.grn}
                  onChange={(e) => {
                    const val = Number(e.target.value) || 0;
                    setColorModalState((prev) => prev ? { ...prev, colors: { ...prev.colors, grn: val } } : null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      colorBluRef.current?.focus();
                      colorBluRef.current?.select();
                    }
                  }}
                  placeholder="0"
                  className="w-14 text-center bg-[#061520] border border-emerald-400/40 rounded font-mono font-bold text-white focus:outline-none"
                />
              </div>

              {/* Blue */}
              <div className="flex items-center justify-between bg-sky-500/10 border border-sky-400/35 p-1.5 rounded-lg">
                <span className="font-bold text-sky-300">Blue:</span>
                <input
                  ref={colorBluRef}
                  type="number"
                  min="0"
                  value={colorModalState.colors.blu === 0 ? '' : colorModalState.colors.blu}
                  onChange={(e) => {
                    const val = Number(e.target.value) || 0;
                    setColorModalState((prev) => prev ? { ...prev, colors: { ...prev.colors, blu: val } } : null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      colorOthRef.current?.focus();
                      colorOthRef.current?.select();
                    }
                  }}
                  placeholder="0"
                  className="w-14 text-center bg-[#061520] border border-sky-400/40 rounded font-mono font-bold text-white focus:outline-none"
                />
              </div>

              {/* Others */}
              <div className="flex items-center justify-between bg-purple-500/10 border border-purple-400/35 p-1.5 rounded-lg">
                <span className="font-bold text-purple-300">Others:</span>
                <input
                  ref={colorOthRef}
                  type="number"
                  min="0"
                  value={colorModalState.colors.others === 0 ? '' : colorModalState.colors.others}
                  onChange={(e) => {
                    const val = Number(e.target.value) || 0;
                    setColorModalState((prev) => prev ? { ...prev, colors: { ...prev.colors, others: val } } : null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleConfirmColorModal(colorModalState.colors);
                    }
                  }}
                  placeholder="0"
                  className="w-14 text-center bg-[#061520] border border-purple-400/40 rounded font-mono font-bold text-white focus:outline-none"
                />
              </div>
            </div>

            {/* Total Quantity in Coils */}
            <div className="flex items-center justify-between p-2.5 bg-[#061520] border border-cyan-500/25 text-white rounded-xl text-xs font-bold">
              <span>Total Quantity:</span>
              <span className="font-mono text-sm text-cyan-300">
                {(Number(colorModalState.colors.red) || 0) +
                  (Number(colorModalState.colors.blk) || 0) +
                  (Number(colorModalState.colors.yel) || 0) +
                  (Number(colorModalState.colors.grn) || 0) +
                  (Number(colorModalState.colors.blu) || 0) +
                  (Number(colorModalState.colors.others) || 0)}{' '}
                {colorModalState.unit}
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setColorModalState(null)}
                className="px-3 py-1.5 text-xs bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/25 rounded-xl text-slate-200 font-bold cursor-pointer"
              >
                Skip / Cancel
              </button>
              <button
                ref={colorConfirmRef}
                type="button"
                onClick={() => handleConfirmColorModal(colorModalState.colors)}
                className="px-4 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black rounded-xl text-xs cursor-pointer shadow-md focus:ring-2 focus:ring-cyan-300"
              >
                Confirm & Continue (Enter)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: EDIT HEADER INFO */}
      {isEditHeaderOpen && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl p-6 max-w-lg w-full shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 text-white space-y-4">
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-cyan-400" />
                <span>Edit Invoice Header Information</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsEditHeaderOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-cyan-200 mb-1">Address Line 1 (Center & Market)</label>
                <input
                  type="text"
                  value={headerAddressLine1}
                  onChange={(e) => setHeaderAddressLine1(e.target.value)}
                  className="w-full px-3 py-2 bg-[#061520] border border-cyan-500/30 rounded-lg font-semibold text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>
              <div>
                <label className="block font-bold text-cyan-200 mb-1">Address Line 2 (Area, District, Mobile)</label>
                <input
                  type="text"
                  value={headerAddressLine2}
                  onChange={(e) => setHeaderAddressLine2(e.target.value)}
                  className="w-full px-3 py-2 bg-[#061520] border border-cyan-500/30 rounded-lg font-semibold text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>
              <div>
                <label className="block font-bold text-cyan-200 mb-1">Address Line 3 (E-mail / Contact)</label>
                <input
                  type="text"
                  value={headerAddressLine3}
                  onChange={(e) => setHeaderAddressLine3(e.target.value)}
                  className="w-full px-3 py-2 bg-[#061520] border border-cyan-500/30 rounded-lg font-semibold text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setIsEditHeaderOpen(false)}
                className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black rounded-xl text-xs cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: FIELD & TABLE FONT SIZES */}
      {isFontSizeModalOpen && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl p-6 max-w-md w-full shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 text-white space-y-4">
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-cyan-400" />
                <span>Field & Table Font Sizes</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsFontSizeModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-cyan-200 mb-2">Table Font Size</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setTableFontSize('text-[11px]')}
                    className={`py-2 text-center rounded-xl font-bold border transition-all cursor-pointer ${
                      tableFontSize === 'text-[11px]' ? 'bg-cyan-400 text-slate-950 border-cyan-300 font-black' : 'bg-[#081b28] text-slate-200 border-cyan-500/25 hover:bg-[#0e2a3d]'
                    }`}
                  >
                    Small (11px)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableFontSize('text-xs')}
                    className={`py-2 text-center rounded-xl font-bold border transition-all cursor-pointer ${
                      tableFontSize === 'text-xs' ? 'bg-cyan-400 text-slate-950 border-cyan-300 font-black' : 'bg-[#081b28] text-slate-200 border-cyan-500/25 hover:bg-[#0e2a3d]'
                    }`}
                  >
                    Medium (12px)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableFontSize('text-sm')}
                    className={`py-2 text-center rounded-xl font-bold border transition-all cursor-pointer ${
                      tableFontSize === 'text-sm' ? 'bg-cyan-400 text-slate-950 border-cyan-300 font-black' : 'bg-[#081b28] text-slate-200 border-cyan-500/25 hover:bg-[#0e2a3d]'
                    }`}
                  >
                    Large (14px)
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-cyan-200 mb-2">Row Height / Density</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setRowDensity('compact')}
                    className={`py-2 text-center rounded-xl font-bold border transition-all cursor-pointer ${
                      rowDensity === 'compact' ? 'bg-cyan-400 text-slate-950 border-cyan-300 font-black' : 'bg-[#081b28] text-slate-200 border-cyan-500/25 hover:bg-[#0e2a3d]'
                    }`}
                  >
                    Compact
                  </button>
                  <button
                    type="button"
                    onClick={() => setRowDensity('normal')}
                    className={`py-2 text-center rounded-xl font-bold border transition-all cursor-pointer ${
                      rowDensity === 'normal' ? 'bg-cyan-400 text-slate-950 border-cyan-300 font-black' : 'bg-[#081b28] text-slate-200 border-cyan-500/25 hover:bg-[#0e2a3d]'
                    }`}
                  >
                    Normal
                  </button>
                  <button
                    type="button"
                    onClick={() => setRowDensity('relaxed')}
                    className={`py-2 text-center rounded-xl font-bold border transition-all cursor-pointer ${
                      rowDensity === 'relaxed' ? 'bg-cyan-400 text-slate-950 border-cyan-300 font-black' : 'bg-[#081b28] text-slate-200 border-cyan-500/25 hover:bg-[#0e2a3d]'
                    }`}
                  >
                    Relaxed
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-3 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setIsFontSizeModalOpen(false)}
                className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black rounded-xl text-xs cursor-pointer"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: UPLOAD RECEIVED COPY */}
      {isUploadCopyModalOpen && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl p-6 max-w-md w-full shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 text-white space-y-4">
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <FileUp className="w-5 h-5 text-cyan-400" />
                <span>Upload Signed Received Copy</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsUploadCopyModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-xs text-slate-300 space-y-3">
              <p>
                Attach a signed photo or scanned document of the received delivery copy for this bill.
              </p>
              {receivedCopyFile ? (
                <div className="p-3 bg-emerald-500/15 border border-emerald-400/35 rounded-xl flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-emerald-200 truncate max-w-[200px]">{receivedCopyFile}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReceivedCopyFile(null)}
                    className="text-rose-300 hover:text-rose-200 text-[11px] font-bold cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              ) : null}
              <div
                onClick={() => copyFileInputRef.current?.click()}
                className="border-2 border-dashed border-cyan-400/50 hover:border-cyan-300 rounded-2xl p-6 text-center cursor-pointer bg-[#061520]/80 hover:bg-[#0c2638] transition-colors"
              >
                <FileUp className="w-8 h-8 text-cyan-400 mx-auto mb-2" />
                <span className="font-bold text-white block">Click to select photo or PDF file</span>
                <span className="text-[10px] text-slate-400">Supports JPG, PNG, PDF up to 25MB</span>
              </div>
            </div>
            <div className="flex justify-end pt-3 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setIsUploadCopyModalOpen(false)}
                className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black rounded-xl text-xs cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: SEND EMAIL */}
      {isSendEmailModalOpen && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl p-6 max-w-md w-full shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 text-white space-y-4">
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Mail className="w-5 h-5 text-cyan-400" />
                <span>Send Bill via E-mail</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsSendEmailModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSendEmail} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-cyan-200 mb-1">Recipient Email</label>
                <input
                  type="email"
                  required
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="customer@example.com"
                  className="w-full px-3 py-2 bg-[#061520] border border-cyan-500/30 rounded-lg text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 font-semibold"
                />
              </div>
              <div>
                <label className="block font-bold text-cyan-200 mb-1">Subject</label>
                <input
                  type="text"
                  required
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full px-3 py-2 bg-[#061520] border border-cyan-500/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>
              <div className="p-3 bg-cyan-500/10 border border-cyan-400/30 rounded-xl text-cyan-100 space-y-1">
                <div className="font-bold text-cyan-300">Attached Invoice:</div>
                <div className="font-mono text-[11px]">
                  Bill No: {header.billNo || 'SC-01'} • Amount: ৳{grandTotal.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-cyan-500/20">
                <button
                  type="button"
                  onClick={() => setIsSendEmailModalOpen(false)}
                  className="px-3.5 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/25 rounded-xl text-slate-200 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={emailSending}
                  className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{emailSending ? 'Sending...' : 'Send Invoice'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: PRINT PREVIEW MODAL */}
      {showPrintPreview && (
        <BillPrintPreviewModal
          isOpen={showPrintPreview}
          onClose={() => setShowPrintPreview(false)}
          company={company}
          branches={allowedBranches}
          initialDocumentType={printDocType}
          bill={{
            header: {
              ...header,
              date: billDateStr,
              orderDate: orderDateStr,
              challanDate: challanDateStr
            },
            lines,
            company,
            subtotal,
            grandTotal,
            discountAmount,
            discountPercent,
            totalCoils,
            inWords,
            documentType: printDocType
          }}
        />
      )}

      {/* MODAL 6: ADD PARTY MODAL */}
      {addPartyModalOpen && (
        <AddPartyModal
          isOpen={addPartyModalOpen}
          onClose={() => setAddPartyModalOpen(false)}
          onSave={(newParty) => {
            onAddParty?.(newParty);
            handleSelectParty(newParty);
            setAddPartyModalOpen(false);
          }}
          salespersons={salespersons}
        />
      )}

      {/* MODAL 7: QUICK ADD ITEM MODAL */}
      {quickAddModalOpen && (
        <QuickAddItemModal
          isOpen={quickAddModalOpen}
          onClose={() => setQuickAddModalOpen(false)}
          onItemCreated={(newItem) => {
            onAddItem?.(newItem);
            if (quickAddRowIndex !== undefined) {
              handleSelectItem(quickAddRowIndex, newItem);
            }
            setQuickAddModalOpen(false);
          }}
          initialData={quickAddInitialData}
        />
      )}
    </div>
  );
};

export default BillInvoiceView;
