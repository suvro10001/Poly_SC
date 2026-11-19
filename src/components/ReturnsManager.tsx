import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Item,
  Party,
  StockReturnChallan,
  StockReturnLine,
  ReturnType,
  CompanyDetails,
  StoredBill,
  DeliveryChallan,
  FactoryImportChallan,
  ColorExchangeChallan
} from '../types';
import { defaultCompany, defaultBranches } from '../data/defaultData';
import {
  getUserBranch,
  isSuperAdminOrAgm,
  getBranchAddressDetails,
  getUserLoginFilters,
  cleanBranchName,
  filterBranchesForUser,
  isStrictSuperAdmin,
  isAccountsAdmin,
  isAnyAdmin
} from '../utils/branchAccess';
import { SalesCenterSearchFilter } from './SalesCenterSearchFilter';
import { formatDateDDMMYY, parseDateToISO, getTodayISO, getTodayDDMMYY } from '../utils/dateUtils';
import { convertToTakaWords } from '../utils/numberToWords';
import { formatDisplayUnit, getItemLiveStock } from '../utils/stockHelper';
import { triggerAutoConfiguredPrint } from '../utils/printerAutoConfig';
import { QuickAddItemModal } from './QuickAddItemModal';
import { ColorQuantityModal, ColorBreakdownData } from './ColorQuantityModal';
import { PolyCablesBanner } from './PolyCablesBanner';
import { PrinterAutoConfigModal } from './PrinterAutoConfigModal';
import { MnemonicLabel } from './MnemonicLabel';
import { ColorExchangeManager } from './ColorExchangeManager';
import { matchesFlexibleSearch, groupItemsByCategoryOrder } from '../utils/searchHelper';
import { getAllCategories } from '../utils/categoryHelper';
import { checkCanTakeEntry } from '../utils/cloudConnection';
import { recordDeletedEntityId, getGlobalDeletedIds } from '../utils/deletedTracker';
import {
  RotateCcw,
  Truck,
  Plus,
  Trash2,
  Save,
  Printer,
  Search,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Building2,
  X,
  Boxes,
  Calendar,
  ArrowLeft,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Sparkles,
  Download,
  Eye,
  FileSpreadsheet,
  Edit2,
  ZoomIn,
  ZoomOut,
  Sliders,
  Check,
  CheckSquare,
  Square,
  Filter,
  FilterX,
  Layers,
  ArrowUpDown,
  Tag,
  History
} from 'lucide-react';

export interface SearchableDocItem {
  key: string;
  sourceType: 'bill' | 'challan' | 'factory';
  docId: string;
  docNo: string;
  docDate: string;
  partyName: string;
  address?: string;
  salesmanCode?: string;
  salespersonName?: string;
  itemId?: string;
  itemCode?: string;
  itemName: string;
  sizeSpec?: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  remarks?: string;
}

interface ReturnsManagerProps {
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  parties: Party[];
  salespersons?: any[];
  branches?: any[];
  currentUser?: any;
  stockReturns: StockReturnChallan[];
  setStockReturns: React.Dispatch<React.SetStateAction<StockReturnChallan[]>>;
  storedBills?: StoredBill[];
  deliveryChallans?: DeliveryChallan[];
  factoryImports?: FactoryImportChallan[];
  colorExchanges?: ColorExchangeChallan[];
  onSaveColorExchange?: (exchange: ColorExchangeChallan) => void;
  onDeleteColorExchange?: (id: string) => void;
  onSyncCloud?: (slice: any, immediate?: boolean) => void;
  company?: CompanyDetails;
  onBack?: () => void;
  onClose?: () => void;
}

// Helper for dynamic font size auto-adjustment so Party Name fits cleanly on one line
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

function generateNextReturnNo(existing: StockReturnChallan[], type: ReturnType): string {
  const prefix = type === 'party_return' ? 'PR' : 'FR';
  let maxNum = 0;
  existing
    .filter((r) => r.returnType === type)
    .forEach((r) => {
      const match = r.returnNo.match(/\d+/);
      if (match) {
        const val = parseInt(match[0], 10);
        if (val > maxNum) maxNum = val;
      }
    });
  return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
}

export const ReturnsManager: React.FC<ReturnsManagerProps> = ({
  items,
  setItems,
  parties,
  salespersons = [],
  branches = [],
  currentUser,
  stockReturns,
  setStockReturns,
  storedBills = [],
  deliveryChallans = [],
  factoryImports = [],
  colorExchanges: propsColorExchanges,
  onSaveColorExchange: propsOnSaveColorExchange,
  onDeleteColorExchange: propsOnDeleteColorExchange,
  onSyncCloud,
  company = defaultCompany,
  onBack,
  onClose
}) => {
  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => getAllCategories());
  useEffect(() => {
    const refresh = () => setCategoryOrder(getAllCategories());
    window.addEventListener('categories-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('categories-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const rawBranchesList = useMemo(
    () => (branches && branches.length > 0 ? branches : defaultBranches),
    [branches]
  );

  const effectiveBranches = useMemo(
    () => filterBranchesForUser(rawBranchesList, currentUser, salespersons),
    [rawBranchesList, currentUser, salespersons]
  );

  const userBranchInfo = useMemo(
    () => getUserBranch(currentUser, salespersons, effectiveBranches),
    [currentUser, salespersons, effectiveBranches]
  );

  const userLoginFilters = useMemo(
    () => getUserLoginFilters(currentUser, salespersons, effectiveBranches),
    [currentUser, salespersons, effectiveBranches]
  );

  const canViewAllCenters = useMemo(
    () => isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser) || isAnyAdmin(currentUser) || effectiveBranches.length > 1,
    [currentUser, effectiveBranches.length]
  );

  const isBranchLocked = useMemo(
    () => (!canViewAllCenters || userLoginFilters.isRestricted) && effectiveBranches.length <= 1,
    [canViewAllCenters, userLoginFilters.isRestricted, effectiveBranches.length]
  );

  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    const isSuperOrAcc = isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser) || isAnyAdmin(currentUser);
    if (isSuperOrAcc) return 'ALL';
    const allowed = filterBranchesForUser(branches && branches.length > 0 ? branches : defaultBranches, currentUser, salespersons);
    const init = getUserLoginFilters(currentUser, salespersons, allowed);
    if (!isSuperOrAcc || init.isRestricted) {
      if (init.branchId && init.branchId !== 'ALL' && allowed.some((b) => b.id === init.branchId)) return init.branchId;
      if (init.branchName && init.branchName !== 'All Sales Centers') {
        const found = allowed.find(
          (b) => b.name.toLowerCase().trim() === init.branchName?.toLowerCase().trim()
        );
        if (found) return found.id;
      }
      if (allowed.length === 1) return allowed[0].id;
      return 'ALL';
    } else if (currentUser?.branchId && currentUser.branchId !== 'ALL' && allowed.some((b) => b.id === currentUser.branchId)) {
      return currentUser.branchId;
    }
    return 'ALL';
  });

  const lastReturnsUserKeyRef = useRef<string>('');
  useEffect(() => {
    if (effectiveBranches.length === 0) return;
    const userKey = `${currentUser?.username || ''}::${currentUser?.salespersonCode || ''}::${currentUser?.branchId || ''}::${currentUser?.role || ''}`;
    const userChanged = lastReturnsUserKeyRef.current !== '' && lastReturnsUserKeyRef.current !== userKey;
    lastReturnsUserKeyRef.current = userKey;

    const isAdminLike = isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser) || isAnyAdmin(currentUser);
    if (isAdminLike) {
      if (userChanged) setSelectedBranchId('ALL');
      return;
    }

    if (isBranchLocked) {
      if (userLoginFilters.branchId && effectiveBranches.some((b) => b.id === userLoginFilters.branchId)) {
        setSelectedBranchId(userLoginFilters.branchId);
      } else if (userBranchInfo?.branchId && effectiveBranches.some((b) => b.id === userBranchInfo.branchId)) {
        setSelectedBranchId(userBranchInfo.branchId);
      } else if (effectiveBranches.length === 1) {
        setSelectedBranchId(effectiveBranches[0].id);
      }
    } else if (userChanged) {
      setSelectedBranchId(userLoginFilters.branchId || 'ALL');
    } else if (selectedBranchId !== 'ALL' && !effectiveBranches.some((b) => b.id === selectedBranchId)) {
      setSelectedBranchId(effectiveBranches.length === 1 ? effectiveBranches[0].id : 'ALL');
    }
  }, [isBranchLocked, userLoginFilters.branchId, userBranchInfo?.branchId, effectiveBranches, selectedBranchId, currentUser]);

  const [returnType, setReturnType] = useState<ReturnType>('party_return');
  const [activeSubTab, setActiveSubTab] = useState<'create_return' | 'return_directory' | 'color_exchange'>('create_return');
  const [editingReturnId, setEditingReturnId] = useState<string | null>(null);

  // Persistent Color Exchanges State
  const [localColorExchanges, setLocalColorExchanges] = useState<ColorExchangeChallan[]>(() => {
    try {
      const saved = localStorage.getItem('polycables_color_exchanges');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });

  const colorExchanges = propsColorExchanges !== undefined ? propsColorExchanges : localColorExchanges;

  const handleSaveColorExchange = (exchange: ColorExchangeChallan) => {
    if (propsOnSaveColorExchange) {
      propsOnSaveColorExchange(exchange);
    }
    setLocalColorExchanges((prev) => {
      const updated = [exchange, ...prev.filter((e) => e.id !== exchange.id)];
      try {
        localStorage.setItem('polycables_color_exchanges', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const handleDeleteColorExchange = (id: string) => {
    if (propsOnDeleteColorExchange) {
      propsOnDeleteColorExchange(id);
    }
    setLocalColorExchanges((prev) => {
      const updated = prev.filter((e) => e.id !== id);
      try {
        localStorage.setItem('polycables_color_exchanges', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  // Pad View Mode (like Bill page)
  const [padHeaderMode, setPadHeaderMode] = useState<'plain' | 'hide_logo' | 'hide_all'>(() => {
    try {
      const saved = localStorage.getItem('polycables_returns_pad_header_mode');
      if (saved === 'plain' || saved === 'hide_logo' || saved === 'hide_all') {
        return saved;
      }
    } catch (e) {}
    return 'hide_logo';
  });

  useEffect(() => {
    try {
      localStorage.setItem('polycables_returns_pad_header_mode', padHeaderMode);
    } catch (e) {}
  }, [padHeaderMode]);

  // Form State
  const [returnNo, setReturnNo] = useState<string>(() => generateNextReturnNo(stockReturns, 'party_return'));
  const [date, setDate] = useState<string>(() => formatDateDDMMYY(new Date()));
  const [partyName, setPartyName] = useState<string>('');
  const [partyAddress, setPartyAddress] = useState<string>('');
  const [partyPhone, setPartyPhone] = useState<string>('');
  const [challanNo, setChallanNo] = useState<string>('');
  const [challanDate, setChallanDate] = useState<string>(() => formatDateDDMMYY(new Date()));
  const [reqNo, setReqNo] = useState<string>('');
  const [carNumber, setCarNumber] = useState<string>('');
  const [driverName, setDriverName] = useState<string>('');
  const [driverPhone, setDriverPhone] = useState<string>('');
  const [salesmanCode, setSalesmanCode] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');

  // Helper for generating empty return line item
  const createEmptyReturnLine = (index: number): StockReturnLine => ({
    id: `rline-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`,
    itemId: '',
    itemCode: '',
    itemName: '',
    sizeSpec: '',
    unit: '',
    category: '',
    quantity: 0,
    rate: 0,
    amount: 0,
    remarks: ''
  });

  // Lines State (default 5 blank rows)
  const [lines, setLines] = useState<StockReturnLine[]>(() => [
    createEmptyReturnLine(1),
    createEmptyReturnLine(2),
    createEmptyReturnLine(3),
    createEmptyReturnLine(4),
    createEmptyReturnLine(5)
  ]);

  // Discount & Total States
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [isDiscountFocused, setIsDiscountFocused] = useState<boolean>(false);
  const discountPercentInputRef = useRef<HTMLInputElement | null>(null);
  const discountInputRef = useRef<HTMLInputElement | null>(null);
  const saveReturnBtnRef = useRef<HTMLButtonElement | null>(null);

  // Party Dropdown Search State
  const [showPartyDropdown, setShowPartyDropdown] = useState(false);
  const [partySearchQuery, setPartySearchQuery] = useState('');
  const [partyHighlightIdx, setPartyHighlightIdx] = useState(0);
  const [isShowingAllParties, setIsShowingAllParties] = useState(false);

  // Ref Challan Dropdown Search State
  const [showRefChallanDropdown, setShowRefChallanDropdown] = useState(false);
  const [refChallanHighlightIdx, setRefChallanHighlightIdx] = useState(0);

  // Item Search Dropdown State in Table
  const [activeItemDropdownIdx, setActiveItemDropdownIdx] = useState<number | null>(null);
  const [itemHighlightIdx, setItemHighlightIdx] = useState<number>(0);
  const qtyInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const partyDropdownRef = useRef<HTMLDivElement>(null);
  const refChallanDropdownRef = useRef<HTMLDivElement>(null);
  const itemDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPartyDropdown || !partyDropdownRef.current) return;
    const el = partyDropdownRef.current.querySelector('[data-return-party-highlighted="true"]') as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [partyHighlightIdx, showPartyDropdown]);

  useEffect(() => {
    if (!showRefChallanDropdown || !refChallanDropdownRef.current) return;
    const el = refChallanDropdownRef.current.querySelector('[data-ref-challan-highlighted="true"]') as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [refChallanHighlightIdx, showRefChallanDropdown]);

  useEffect(() => {
    if (activeItemDropdownIdx === null || !itemDropdownRef.current) return;
    const el = itemDropdownRef.current.querySelector('[data-return-item-highlighted="true"]') as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [itemHighlightIdx, activeItemDropdownIdx]);

  // Bill & Challan Item Search Modal State
  const [showBillChallanSearchModal, setShowBillChallanSearchModal] = useState(false);
  const [searchDocQuery, setSearchDocQuery] = useState('');
  const [searchDocType, setSearchDocType] = useState<'all' | 'bills' | 'challans' | 'factory'>('all');
  const [searchDocPartyFilter, setSearchDocPartyFilter] = useState<boolean>(true);
  const [selectedSearchItemKeys, setSelectedSearchItemKeys] = useState<{ [key: string]: boolean }>({});

  // Quick Add Item Modal State
  const [quickAddModalOpen, setQuickAddModalOpen] = useState(false);
  const [quickAddInitialData, setQuickAddInitialData] = useState<{
    name?: string;
    rate?: number;
    unit?: string;
    sizeSpec?: string;
    category?: string;
    rowIndex?: number;
  }>({});

  // Notification Toast State
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Print Preview Modal State
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printPreviewReturn, setPrintPreviewReturn] = useState<StockReturnChallan | null>(null);
  const [printZoom, setPrintZoom] = useState<'80%' | '100%' | '115%'>('100%');
  const [printFormat, setPrintFormat] = useState<'pad' | 'slip_pad'>('pad');
  const [showPrinterConfigModal, setShowPrinterConfigModal] = useState(false);

  const activeReturnBranch = useMemo(() => {
    const targetBranchId = printPreviewReturn?.branchId;
    if (targetBranchId && targetBranchId !== 'ALL') {
      const b = effectiveBranches.find((br) => br.id === targetBranchId);
      if (b) return b;
    }
    if (selectedBranchId && selectedBranchId !== 'ALL') {
      const b = effectiveBranches.find((br) => br.id === selectedBranchId);
      if (b) return b;
    }
    if (userBranchInfo?.branchId && userBranchInfo.branchId !== 'ALL') {
      const b = effectiveBranches.find((br) => br.id === userBranchInfo.branchId);
      if (b) return b;
    }
    return effectiveBranches.find((br) => br.id === 'branch-1') || effectiveBranches[0] || null;
  }, [printPreviewReturn, selectedBranchId, userBranchInfo, effectiveBranches]);

  const returnBranchAddress = useMemo(
    () => getBranchAddressDetails(activeReturnBranch, company.phone, company.email),
    [activeReturnBranch, company.phone, company.email]
  );

  // Color Quantity Input Modal State
  const [colorModalState, setColorModalState] = useState<{
    isOpen: boolean;
    lineIndex: number;
    item: Item;
    unit: string;
    initialColors?: Partial<ColorBreakdownData>;
    initialTotalQty?: number;
  } | null>(null);

  // History / Directory State
  const [historySearch, setHistorySearch] = useState<string>('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'party_return' | 'factory_return'>('all');
  const [deleteConfirmReturn, setDeleteConfirmReturn] = useState<StockReturnChallan | null>(null);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4000);
  };

  // Extract all searchable items across Stored Bills, Delivery Challans, and Factory Imports
  const allSearchableDocItems = useMemo<SearchableDocItem[]>(() => {
    const list: SearchableDocItem[] = [];

    // 1. From Stored Bills
    (storedBills || []).forEach((bill) => {
      const bHeader = bill.header;
      (bill.lines || []).forEach((line, idx) => {
        if (!line.itemDescription && !line.itemId) return;
        list.push({
          key: `bill-${bill.id}-${line.id || idx}`,
          sourceType: 'bill',
          docId: bill.id,
          docNo: bHeader.billNo || '01',
          docDate: bHeader.date || '',
          partyName: bHeader.partyName || '',
          address: bHeader.address || '',
          salesmanCode: bHeader.salesmanCode || '',
          salespersonName: bHeader.salespersonName || '',
          itemId: line.itemId || '',
          itemCode: line.itemDescription || '',
          itemName: line.itemDescription || '',
          sizeSpec: line.sizeSpec || '',
          unit: line.unit || 'Coils',
          quantity: line.coilQty || line.totalCoil || 0,
          rate: line.rate || 0,
          amount: line.amount || 0,
          remarks: `Bill #${bHeader.billNo || ''} (${formatDateDDMMYY(bHeader.date)})`
        });
      });
    });

    // 2. From Delivery Challans
    (deliveryChallans || []).forEach((dc) => {
      (dc.lines || []).forEach((line, idx) => {
        if (!line.itemDescription && !line.itemId) return;
        list.push({
          key: `challan-${dc.id}-${line.id || idx}`,
          sourceType: 'challan',
          docId: dc.id,
          docNo: dc.challanNo || 'CH-01',
          docDate: dc.date || '',
          partyName: dc.partyName || '',
          address: dc.address || '',
          salesmanCode: dc.salesmanCode || '',
          salespersonName: dc.salespersonName || '',
          itemId: line.itemId || '',
          itemCode: line.itemDescription || '',
          itemName: line.itemDescription || '',
          sizeSpec: line.sizeSpec || '',
          unit: line.unit || 'Coils',
          quantity: line.coilQty || 0,
          rate: line.rate || 0,
          amount: (line.coilQty || 0) * (line.rate || 0),
          remarks: `Challan #${dc.challanNo || ''} (${formatDateDDMMYY(dc.date)})`
        });
      });
    });

    // 3. From Factory Imports
    (factoryImports || []).forEach((fc) => {
      (fc.lines || []).forEach((line, idx) => {
        if (!line.itemName && !line.itemId) return;
        list.push({
          key: `factory-${fc.id}-${line.id || idx}`,
          sourceType: 'factory',
          docId: fc.id,
          docNo: fc.challanNo || 'FC-01',
          docDate: fc.date || '',
          partyName: 'POLY CABLES (Factory Warehouse)',
          address: 'Kashimpur, Gazipur',
          itemId: line.itemId || '',
          itemCode: line.itemCode || line.itemName || '',
          itemName: line.itemName || '',
          sizeSpec: line.sizeSpec || '',
          unit: line.unit || 'Coils',
          quantity: line.quantity || 0,
          rate: line.rate || 0,
          amount: line.amount || 0,
          remarks: `Factory Import #${fc.challanNo || ''} (${formatDateDDMMYY(fc.date)})`
        });
      });
    });

    return list;
  }, [storedBills, deliveryChallans, factoryImports]);

  // Filtered searchable items for the Search Modal
  const modalFilteredDocItems = useMemo(() => {
    let result = allSearchableDocItems;

    // 1. Source type filter
    if (searchDocType === 'bills') {
      result = result.filter((i) => i.sourceType === 'bill');
    } else if (searchDocType === 'challans') {
      result = result.filter((i) => i.sourceType === 'challan');
    } else if (searchDocType === 'factory') {
      result = result.filter((i) => i.sourceType === 'factory');
    }

    // 2. Filter by current party if toggled on and party name exists
    if (searchDocPartyFilter && partyName.trim() && returnType === 'party_return') {
      const pLower = partyName.toLowerCase().trim();
      result = result.filter((i) => i.partyName.toLowerCase().includes(pLower));
    }

    // 3. Search query filter (matches docNo, partyName, itemName, sizeSpec, date, salesman)
    if (searchDocQuery.trim()) {
      const q = searchDocQuery.trim();
      result = result.filter((item) => {
        const extraText = `${item.docNo} ${item.partyName} ${item.docDate} ${formatDateDDMMYY(item.docDate)} ${item.salesmanCode || ''} ${item.salespersonName || ''}`;
        return matchesFlexibleSearch(`${item.itemName} ${item.sizeSpec || ''}`, q, extraText);
      });
    }

    return result;
  }, [allSearchableDocItems, searchDocType, searchDocPartyFilter, partyName, returnType, searchDocQuery]);

  // Searchable recent documents for Ref. Challan dropdown
  const recentDocuments = useMemo(() => {
    const docs: {
      type: 'bill' | 'challan';
      id: string;
      docNo: string;
      date: string;
      partyName: string;
      address: string;
      salesmanCode?: string;
      itemCount: number;
      totalAmount: number;
    }[] = [];

    (storedBills || []).forEach((b) => {
      docs.push({
        type: 'bill',
        id: b.id,
        docNo: b.header.billNo || '01',
        date: b.header.date || '',
        partyName: b.header.partyName || '',
        address: b.header.address || '',
        salesmanCode: b.header.salesmanCode,
        itemCount: (b.lines || []).length,
        totalAmount: b.totalAmount || 0
      });
    });

    (deliveryChallans || []).forEach((dc) => {
      docs.push({
        type: 'challan',
        id: dc.id,
        docNo: dc.challanNo || 'CH-01',
        date: dc.date || '',
        partyName: dc.partyName || '',
        address: dc.address || '',
        salesmanCode: dc.salesmanCode,
        itemCount: (dc.lines || []).length,
        totalAmount: dc.totalAmount || 0
      });
    });

    return docs;
  }, [storedBills, deliveryChallans]);

  const filteredRefDocs = useMemo(() => {
    const q = (challanNo || '').toLowerCase().trim();
    const p = (partyName || '').toLowerCase().trim();

    return recentDocuments.filter((d) => {
      const matchDocNo = d.docNo.toLowerCase().includes(q);
      const matchParty = p ? d.partyName.toLowerCase().includes(p) : true;
      return (q ? matchDocNo : true) && matchParty;
    }).slice(0, 15);
  }, [recentDocuments, challanNo, partyName]);

  // Close dropdowns on outside click/touch or Escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest('.return-party-container')) {
        setShowPartyDropdown(false);
      }
      if (!target.closest('.ref-challan-container')) {
        setShowRefChallanDropdown(false);
      }
      if (!target.closest('.return-item-cell-container')) {
        setActiveItemDropdownIdx(null);
      }
    };
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPartyDropdown(false);
        setShowRefChallanDropdown(false);
        setActiveItemDropdownIdx(null);
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

  // Filter parties for combobox
  const filteredParties = useMemo(() => {
    if (isShowingAllParties || !partySearchQuery.trim()) {
      return parties;
    }
    const q = partySearchQuery.toLowerCase().trim();
    return parties.filter((p) => {
      const matchName = p.name.toLowerCase().includes(q);
      const matchAddr = (p.address || '').toLowerCase().includes(q);
      const matchPhone = (p.phone || '').toLowerCase().includes(q);
      const matchSalesman = (p.salesmanCode || '').toLowerCase().includes(q);
      return matchName || matchAddr || matchPhone || matchSalesman;
    });
  }, [parties, partySearchQuery, isShowingAllParties]);

  // Filter items for active table row
  const activeLineQuery = useMemo(() => {
    if (activeItemDropdownIdx === null) return '';
    const line = lines[activeItemDropdownIdx];
    return (line?.itemName || '').trim().toLowerCase();
  }, [lines, activeItemDropdownIdx]);

  const filteredItemsList = useMemo(() => {
    if (activeItemDropdownIdx === null) return [];
    if (!activeLineQuery) {
      return items.filter((i) => i.isActive !== false).slice(0, 50);
    }
    return items
      .filter((i) => {
        if (i.isActive === false) return false;
        return matchesFlexibleSearch(`${i.name} ${i.sizeSpec || ''} ${i.category || ''}`, activeLineQuery, `${i.category || ''} ${i.code || ''}`);
      })
      .slice(0, 50);
  }, [items, activeItemDropdownIdx, activeLineQuery]);

  // Handle Switch Return Type
  const handleSwitchType = (type: ReturnType) => {
    setReturnType(type);
    if (!editingReturnId) {
      setReturnNo(generateNextReturnNo(stockReturns, type));
      if (type === 'factory_return') {
        setPartyName('POLY CABLES (Factory Warehouse)');
        setPartyAddress('Kashimpur, Gazipur, Bangladesh');
        setPartyPhone('01700-000000');
      } else {
        setPartyName('');
        setPartyAddress('');
        setPartyPhone('');
      }
    }
  };

  // Reset / New Return Form
  const handleResetForm = () => {
    setEditingReturnId(null);
    setReturnNo(generateNextReturnNo(stockReturns, returnType));
    setDate(formatDateDDMMYY(new Date()));
    if (returnType === 'factory_return') {
      setPartyName('POLY CABLES (Factory Warehouse)');
      setPartyAddress('Kashimpur, Gazipur, Bangladesh');
      setPartyPhone('01700-000000');
    } else {
      setPartyName('');
      setPartyAddress('');
      setPartyPhone('');
    }
    setChallanNo('');
    setChallanDate(formatDateDDMMYY(new Date()));
    setReqNo('');
    setCarNumber('');
    setDriverName('');
    setDriverPhone('');
    setSalesmanCode('');
    setRemarks('');
    setDiscountPercent(0);
    setDiscountAmount(0);
    setLines([
      createEmptyReturnLine(1),
      createEmptyReturnLine(2),
      createEmptyReturnLine(3),
      createEmptyReturnLine(4),
      createEmptyReturnLine(5)
    ]);
    setActiveSubTab('create_return');
    showToast('info', 'New Return Voucher form initialized.');
  };

  // Edit existing return voucher
  const handleEditReturn = (record: StockReturnChallan) => {
    setEditingReturnId(record.id);
    setReturnType(record.returnType);
    setReturnNo(record.returnNo);
    setDate(formatDateDDMMYY(record.date));
    setPartyName(record.partyName || '');
    setChallanNo(record.challanNo || '');
    setReqNo(record.reqNo || '');
    setCarNumber(record.carNumber || '');
    setDriverName(record.driverName || '');
    setDriverPhone(record.driverPhone || '');
    setRemarks(record.remarks || '');
    setDiscountPercent(record.discountPercent || 0);
    setDiscountAmount(record.discountAmount || 0);
    setLines(
      record.lines.length > 0
        ? record.lines.map((l, i) => ({
            ...l,
            id: l.id || `rline-edit-${Date.now()}-${i}`
          }))
        : [
            createEmptyReturnLine(1),
            createEmptyReturnLine(2),
            createEmptyReturnLine(3),
            createEmptyReturnLine(4),
            createEmptyReturnLine(5)
          ]
    );
    setActiveSubTab('create_return');
    showToast('info', `Editing Return Voucher #${record.returnNo}`);
  };

  // Line item manipulations
  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      createEmptyReturnLine(prev.length + 1)
    ]);
  };

  const handleRemoveLine = (idx: number) => {
    if (lines.length <= 1) {
      setLines([createEmptyReturnLine(1)]);
      return;
    }
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleMoveLine = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= lines.length) return;
    setLines((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  };

  // Handle selecting a recent document from Ref. Challan dropdown
  const handleSelectRefDoc = (doc: {
    type: 'bill' | 'challan';
    id: string;
    docNo: string;
    date: string;
    partyName: string;
    address: string;
    salesmanCode?: string;
  }) => {
    setChallanNo(doc.docNo);
    if (doc.date) setChallanDate(formatDateDDMMYY(doc.date) || doc.date);
    if (doc.partyName) setPartyName(doc.partyName);
    if (doc.address) setPartyAddress(doc.address);
    if (doc.salesmanCode) setSalesmanCode(doc.salesmanCode);
    setShowRefChallanDropdown(false);
    showToast('info', `Selected ${doc.type === 'bill' ? 'Bill' : 'Challan'} #${doc.docNo}. Click "Search Bill/Challan Items" to import line items.`);
  };

  // Add a single item from Bill/Challan search to Return Lines
  const handleAddSearchItemToReturn = (docItem: SearchableDocItem, targetIdx?: number) => {
    // If party info is empty in return header, auto-fill it from the selected doc item
    if (returnType === 'party_return') {
      if (!partyName && docItem.partyName && docItem.partyName !== 'POLY CABLES (Factory Warehouse)') {
        setPartyName(docItem.partyName);
      }
      if (!partyAddress && docItem.address) {
        setPartyAddress(docItem.address);
      }
      if (!salesmanCode && docItem.salesmanCode) {
        setSalesmanCode(docItem.salesmanCode);
      }
      if (!challanNo && docItem.docNo) {
        setChallanNo(docItem.docNo);
      }
      if (!challanDate && docItem.docDate) {
        setChallanDate(formatDateDDMMYY(docItem.docDate) || docItem.docDate);
      }
    }

    setLines((prev) => {
      const updated = [...prev];
      const newItemLine: StockReturnLine = {
        id: `rline-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        itemId: docItem.itemId || '',
        itemCode: docItem.itemCode || docItem.itemName,
        itemName: docItem.itemName,
        sizeSpec: docItem.sizeSpec || '',
        unit: docItem.unit || 'Coils',
        category: '',
        quantity: docItem.quantity > 0 ? docItem.quantity : 0,
        rate: docItem.rate || 0,
        amount: (docItem.quantity > 0 ? docItem.quantity : 0) * (docItem.rate || 0),
        remarks: docItem.remarks || `${docItem.sourceType === 'bill' ? 'Bill' : 'Challan'} #${docItem.docNo}`
      };

      if (targetIdx !== undefined && targetIdx >= 0 && targetIdx < updated.length) {
        updated[targetIdx] = newItemLine;
      } else {
        // If there is a single blank row, replace it
        if (updated.length === 1 && !updated[0].itemName.trim() && (updated[0].quantity || 0) === 0) {
          updated[0] = newItemLine;
        } else {
          updated.push(newItemLine);
        }
      }

      return updated;
    });

    showToast('success', `Added "${docItem.itemName}" to return items.`);
  };

  // Add all selected items from Search Modal to Return Lines
  const handleAddSelectedSearchItems = () => {
    const selectedKeys = Object.keys(selectedSearchItemKeys).filter((k) => selectedSearchItemKeys[k]);
    if (selectedKeys.length === 0) {
      showToast('error', 'Please select at least one item from the search list.');
      return;
    }

    const itemsToAdd = allSearchableDocItems.filter((i) => selectedKeys.includes(i.key));
    if (itemsToAdd.length === 0) return;

    // Auto-fill header if empty from the first item
    const first = itemsToAdd[0];
    if (returnType === 'party_return') {
      if (!partyName && first.partyName && first.partyName !== 'POLY CABLES (Factory Warehouse)') {
        setPartyName(first.partyName);
      }
      if (!partyAddress && first.address) {
        setPartyAddress(first.address);
      }
      if (!salesmanCode && first.salesmanCode) {
        setSalesmanCode(first.salesmanCode);
      }
      if (!challanNo && first.docNo) {
        setChallanNo(first.docNo);
      }
      if (!challanDate && first.docDate) {
        setChallanDate(formatDateDDMMYY(first.docDate) || first.docDate);
      }
    }

    setLines((prev) => {
      // Remove trailing blank rows if existing
      const existing = prev.filter((l) => (l.itemName || '').trim() !== '' || (l.quantity || 0) > 0);
      const newLines: StockReturnLine[] = itemsToAdd.map((docItem, idx) => ({
        id: `rline-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
        itemId: docItem.itemId || '',
        itemCode: docItem.itemCode || docItem.itemName,
        itemName: docItem.itemName,
        sizeSpec: docItem.sizeSpec || '',
        unit: docItem.unit || 'Coils',
        category: '',
        quantity: docItem.quantity > 0 ? docItem.quantity : 0,
        rate: docItem.rate || 0,
        amount: (docItem.quantity > 0 ? docItem.quantity : 0) * (docItem.rate || 0),
        remarks: docItem.remarks || `${docItem.sourceType === 'bill' ? 'Bill' : 'Challan'} #${docItem.docNo}`
      }));

      return [...existing, ...newLines];
    });

    setSelectedSearchItemKeys({});
    setShowBillChallanSearchModal(false);
    showToast('success', `Imported ${itemsToAdd.length} item(s) from selected bill/challan records.`);
  };

  // Import entire document (all lines)
  const handleImportEntireDocument = (sourceType: 'bill' | 'challan' | 'factory', docId: string) => {
    if (sourceType === 'bill') {
      const bill = (storedBills || []).find((b) => b.id === docId);
      if (!bill) return;
      if (returnType === 'party_return') {
        setPartyName(bill.header.partyName || '');
        setPartyAddress(bill.header.address || '');
        setSalesmanCode(bill.header.salesmanCode || '');
        setChallanNo(bill.header.billNo || '');
        if (bill.header.date) setChallanDate(formatDateDDMMYY(bill.header.date) || bill.header.date);
      }

      const importedLines: StockReturnLine[] = (bill.lines || [])
        .filter((l) => (l.itemDescription || '').trim())
        .map((line, idx) => ({
          id: `rline-${Date.now()}-${idx}`,
          itemId: line.itemId || '',
          itemCode: line.itemDescription || '',
          itemName: line.itemDescription || '',
          sizeSpec: line.sizeSpec || '',
          unit: line.unit || 'Coils',
          category: '',
          quantity: line.coilQty || line.totalCoil || 0,
          rate: line.rate || 0,
          amount: (line.coilQty || line.totalCoil || 0) * (line.rate || 0),
          remarks: `From Bill #${bill.header.billNo || ''}`
        }));

      if (importedLines.length > 0) {
        setLines(importedLines);
        setShowBillChallanSearchModal(false);
        showToast('success', `Imported all ${importedLines.length} item(s) from Bill #${bill.header.billNo}.`);
      }
    } else if (sourceType === 'challan') {
      const challan = (deliveryChallans || []).find((c) => c.id === docId);
      if (!challan) return;
      if (returnType === 'party_return') {
        setPartyName(challan.partyName || '');
        setPartyAddress(challan.address || '');
        setSalesmanCode(challan.salesmanCode || '');
        setChallanNo(challan.challanNo || '');
        if (challan.date) setChallanDate(formatDateDDMMYY(challan.date) || challan.date);
      }

      const importedLines: StockReturnLine[] = (challan.lines || [])
        .filter((l) => (l.itemDescription || '').trim())
        .map((line, idx) => ({
          id: `rline-${Date.now()}-${idx}`,
          itemId: line.itemId || '',
          itemCode: line.itemDescription || '',
          itemName: line.itemDescription || '',
          sizeSpec: line.sizeSpec || '',
          unit: line.unit || 'Coils',
          category: '',
          quantity: line.coilQty || 0,
          rate: line.rate || 0,
          amount: (line.coilQty || 0) * (line.rate || 0),
          remarks: `From Challan #${challan.challanNo || ''}`
        }));

      if (importedLines.length > 0) {
        setLines(importedLines);
        setShowBillChallanSearchModal(false);
        showToast('success', `Imported all ${importedLines.length} item(s) from Delivery Challan #${challan.challanNo}.`);
      }
    } else if (sourceType === 'factory') {
      const fc = (factoryImports || []).find((f) => f.id === docId);
      if (!fc) return;
      setReturnType('factory_return');
      setPartyName('POLY CABLES (Factory Warehouse)');
      setPartyAddress('Kashimpur, Gazipur, Bangladesh');
      setChallanNo(fc.challanNo || '');
      if (fc.date) setChallanDate(formatDateDDMMYY(fc.date) || fc.date);

      const importedLines: StockReturnLine[] = (fc.lines || [])
        .filter((l) => (l.itemName || '').trim())
        .map((line, idx) => ({
          id: `rline-${Date.now()}-${idx}`,
          itemId: line.itemId || '',
          itemCode: line.itemCode || line.itemName || '',
          itemName: line.itemName || '',
          sizeSpec: line.sizeSpec || '',
          unit: line.unit || 'Coils',
          category: '',
          quantity: line.quantity || 0,
          rate: line.rate || 0,
          amount: (line.quantity || 0) * (line.rate || 0),
          remarks: `From Factory Challan #${fc.challanNo || ''}`
        }));

      if (importedLines.length > 0) {
        setLines(importedLines);
        setShowBillChallanSearchModal(false);
        showToast('success', `Imported all ${importedLines.length} item(s) from Factory Import #${fc.challanNo}.`);
      }
    }
  };

  // Reliable return line item focus & selection helper with retry
  const focusReturnLineItemInput = (targetIdx: number) => {
    let attempts = 0;
    const maxAttempts = 10;
    const tryFocus = () => {
      attempts++;
      const nextItemInput = document.getElementById(`return-item-input-${targetIdx}`) as HTMLInputElement | null;
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

  // Confirm colors & quantity from ColorQuantityModal for Return Line
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

    setLines((prev) => {
      const updated = [...prev];
      const current = updated[lineIndex] || {
        id: `rline-${Date.now()}-${lineIndex}`,
        quantity: 0
      };
      const rate = item.rate || 0;

      updated[lineIndex] = {
        ...current,
        itemId: item.id,
        itemCode: item.code,
        itemName: item.name,
        sizeSpec: colorRemarksStr || item.sizeSpec || '',
        unit: unit,
        category: item.category || '',
        rate: rate,
        quantity: totalQty,
        amount: totalQty * rate,
        colors: {
          red: Number(colors.red) || 0,
          blk: Number(colors.blk) || 0,
          yel: Number(colors.yel) || 0,
          grn: Number(colors.grn) || 0,
          blu: Number(colors.blu) || 0,
          others: Number(colors.others) || 0,
        }
      };

      if (lineIndex >= updated.length - 1) {
        updated.push({
          id: `rline-${Date.now()}-${updated.length + 1}`,
          itemId: '',
          itemCode: '',
          itemName: '',
          sizeSpec: '',
          unit: 'Coils',
          category: '',
          quantity: 0,
          rate: 0,
          amount: 0,
          remarks: ''
        });
      }

      return updated;
    });

    setColorModalState(null);

    // Auto focus and select next item line input
    focusReturnLineItemInput(lineIndex + 1);
  };

  const handleSelectItemForLine = (index: number, item: Item) => {
    const unit = item.unit || 'Coils';

    setLines((prev) => {
      const updated = [...prev];
      const current = updated[index] || {
        id: `rline-${Date.now()}-${index}`,
        quantity: 0
      };
      const qty = current.quantity && current.quantity > 0 ? current.quantity : 0;
      const rate = item.rate || 0;

      updated[index] = {
        ...current,
        itemId: item.id,
        itemCode: item.code,
        itemName: item.name,
        sizeSpec: item.sizeSpec || '',
        unit: unit,
        category: item.category || '',
        rate: rate,
        quantity: qty,
        amount: qty * rate
      };

      // If last line, auto append new blank row
      if (index === updated.length - 1) {
        updated.push(createEmptyReturnLine(updated.length + 1));
      }

      return updated;
    });

    setActiveItemDropdownIdx(null);

    // Open Color Quantity Modal
    setColorModalState({
      isOpen: true,
      lineIndex: index,
      item,
      unit,
      initialColors: lines[index]?.colors,
      initialTotalQty: lines[index]?.quantity || 0
    });
  };

  const handleOpenColorModal = (index: number) => {
    const line = lines[index];
    if (!line) return;
    const matchedItem = items.find((i) => (line.itemCode && i.code === line.itemCode) || (line.itemName && i.name === line.itemName)) || {
      id: line.itemId || `temp-${index}`,
      code: line.itemCode || 'TEMP',
      name: line.itemName || 'Custom Item',
      rate: line.rate || 0,
      unit: line.unit || 'Coils',
      openingStock: 0,
      sizeSpec: line.sizeSpec || '',
      category: 'General'
    };
    setColorModalState({
      isOpen: true,
      lineIndex: index,
      item: matchedItem,
      unit: line.unit || 'Coils',
      initialColors: line.colors,
      initialTotalQty: line.quantity || 0
    });
  };

  const handleLineChange = (index: number, field: keyof StockReturnLine, val: any) => {
    setLines((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };
      if (field === 'quantity') {
        const qty = parseFloat(val) || 0;
        item.quantity = qty;
        item.amount = qty * (item.rate || 0);
      } else if (field === 'rate') {
        const rate = parseFloat(val) || 0;
        item.rate = rate;
        item.amount = (item.quantity || 0) * rate;
      } else {
        (item as any)[field] = val;
      }
      updated[index] = item;
      return updated;
    });
  };

  // Calculations
  const totalQuantity = useMemo(() => {
    return lines.reduce((acc, cur) => acc + (Number(cur.quantity) || 0), 0);
  }, [lines]);

  const subtotal = useMemo(() => {
    return lines.reduce((acc, cur) => acc + (Number(cur.amount) || 0), 0);
  }, [lines]);

  const calculatedDiscountAmount = useMemo(() => {
    if (discountAmount > 0) return discountAmount;
    if (discountPercent > 0) return Math.round((subtotal * discountPercent) / 100);
    return 0;
  }, [subtotal, discountAmount, discountPercent]);

  const grandTotal = useMemo(() => {
    return Math.max(0, subtotal - calculatedDiscountAmount);
  }, [subtotal, calculatedDiscountAmount]);

  const inWords = useMemo(() => {
    return convertToTakaWords(grandTotal);
  }, [grandTotal]);

  const handleDiscountPercentChange = (val: number) => {
    const p = isNaN(val) ? 0 : Math.max(0, Math.min(100, val));
    setDiscountPercent(p);
    if (subtotal > 0) {
      setDiscountAmount(Math.round((subtotal * p) / 100));
    } else {
      setDiscountAmount(0);
    }
  };

  const handleDiscountAmountChange = (val: number) => {
    const a = isNaN(val) ? 0 : Math.max(0, val);
    setDiscountAmount(a);
    if (subtotal > 0) {
      setDiscountPercent(Number(((a / subtotal) * 100).toFixed(2)));
    } else {
      setDiscountPercent(0);
    }
  };

  // Handle Save Return Voucher
  const handleSaveReturn = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!checkCanTakeEntry('Stock Return', (msg) => showToast('error', msg))) {
      return;
    }

    const validLines = lines.filter((l) => (l.itemName && l.itemName.trim() !== '') && (l.quantity || 0) > 0);
    if (validLines.length === 0) {
      showToast('error', 'Please select at least one item with valid return quantity > 0.');
      return;
    }

    if (returnType === 'party_return' && !partyName.trim()) {
      showToast('error', 'Please enter or select Party / Customer Name for Return from Party.');
      return;
    }

    const newVoucher: StockReturnChallan = {
      id: editingReturnId || `return-${Date.now()}`,
      returnType,
      returnNo: returnNo.trim(),
      date: parseDateToISO(date) || new Date().toISOString().split('T')[0],
      branchId: activeReturnBranch?.id,
      branchName: activeReturnBranch?.name,
      partyName: partyName.trim(),
      challanNo: challanNo.trim(),
      reqNo: reqNo.trim(),
      carNumber: carNumber.trim(),
      driverName: driverName.trim(),
      driverPhone: driverPhone.trim(),
      remarks: remarks.trim(),
      lines: validLines,
      totalQuantity,
      subtotalAmount: subtotal,
      discountPercent,
      discountAmount,
      totalAmount: grandTotal,
      savedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Update Master Items Inventory
    setItems((prevItems) => {
      const updatedMap = new Map<string, Item>();
      prevItems.forEach((item) => updatedMap.set(item.code, { ...item }));

      // If we are editing, first revert previous return quantities if needed
      if (editingReturnId) {
        const previousRecord = stockReturns.find((r) => r.id === editingReturnId);
        if (previousRecord) {
          previousRecord.lines.forEach((pLine) => {
            const item = updatedMap.get(pLine.itemCode);
            if (item) {
              if (previousRecord.returnType === 'party_return') {
                const curRP = item.returnParty || 0;
                updatedMap.set(pLine.itemCode, {
                  ...item,
                  returnParty: Math.max(0, curRP - pLine.quantity)
                });
              } else {
                const curRF = item.returnFactory || 0;
                updatedMap.set(pLine.itemCode, {
                  ...item,
                  returnFactory: Math.max(0, curRF - pLine.quantity)
                });
              }
            }
          });
        }
      }

      // Apply new lines
      validLines.forEach((rLine) => {
        const item = updatedMap.get(rLine.itemCode);
        if (item) {
          if (returnType === 'party_return') {
            const curRP = item.returnParty || 0;
            updatedMap.set(rLine.itemCode, {
              ...item,
              returnParty: curRP + rLine.quantity
            });
          } else {
            const curRF = item.returnFactory || 0;
            updatedMap.set(rLine.itemCode, {
              ...item,
              returnFactory: curRF + rLine.quantity
            });
          }
        }
      });

      const nextItems = Array.from(updatedMap.values());
      try {
        localStorage.setItem('polycables_items', JSON.stringify(nextItems));
        window.dispatchEvent(new CustomEvent('polycables_items_updated', { detail: { items: nextItems } }));
      } catch {}
      return nextItems;
    });

    // Save to Stock Returns list
    if (editingReturnId) {
      setStockReturns((prev) => {
        const next = prev.map((r) => (r.id === editingReturnId ? newVoucher : r));
        try { localStorage.setItem('polycables_stock_returns', JSON.stringify(next)); } catch {}
        onSyncCloud?.({ stockReturns: next }, true);
        return next;
      });
      showToast('success', `Return Voucher #${newVoucher.returnNo} updated successfully!`);
    } else {
      setStockReturns((prev) => {
        const next = [newVoucher, ...prev];
        try { localStorage.setItem('polycables_stock_returns', JSON.stringify(next)); } catch {}
        onSyncCloud?.({ stockReturns: next }, true);
        return next;
      });
      showToast('success', `Return Voucher #${newVoucher.returnNo} saved successfully! ${totalQuantity} Coils updated.`);
    }

    // Reset Form for next voucher
    handleResetForm();
  };

  // Delete Return Handler
  const handleDeleteReturn = (id: string, rNum: string) => {
    if (!checkCanTakeEntry('Delete Return', (msg) => showToast('error', msg))) return;
    recordDeletedEntityId(id);
    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id], type: 'stock_return' })
    }).catch(() => {});

    const target = stockReturns.find((r) => r.id === id);
    if (!target) return;

    // Revert inventory
    setItems((prevItems) => {
      const updatedMap = new Map<string, Item>();
      prevItems.forEach((item) => updatedMap.set(item.code, { ...item }));

      target.lines.forEach((pLine) => {
        const item = updatedMap.get(pLine.itemCode);
        if (item) {
          if (target.returnType === 'party_return') {
            const curRP = item.returnParty || 0;
            updatedMap.set(pLine.itemCode, {
              ...item,
              returnParty: Math.max(0, curRP - pLine.quantity)
            });
          } else {
            const curRF = item.returnFactory || 0;
            updatedMap.set(pLine.itemCode, {
              ...item,
              returnFactory: Math.max(0, curRF - pLine.quantity)
            });
          }
        }
      });

      return Array.from(updatedMap.values());
    });

    setStockReturns((prev) => {
      const next = prev.filter((r) => r.id !== id);
      try { localStorage.setItem('polycables_stock_returns', JSON.stringify(next)); } catch {}
      onSyncCloud?.({ stockReturns: next, deletedEntityIds: getGlobalDeletedIds() }, true);
      return next;
    });
    setDeleteConfirmReturn(null);
    showToast('info', `Return Voucher #${rNum} deleted.`);
  };

  // Filtered History
  const filteredHistory = useMemo(() => {
    return stockReturns.filter((r) => {
      if (selectedBranchId && selectedBranchId !== 'ALL') {
        if (r.branchId && r.branchId !== selectedBranchId) return false;
      }
      if (historyTypeFilter !== 'all' && r.returnType !== historyTypeFilter) return false;
      if (!historySearch.trim()) return true;
      const term = historySearch.toLowerCase().trim();
      const matchItems = (r.lines || []).some((l) => matchesFlexibleSearch(l.itemName || '', term));
      return (
        r.returnNo.toLowerCase().includes(term) ||
        (r.partyName && r.partyName.toLowerCase().includes(term)) ||
        (r.challanNo && r.challanNo.toLowerCase().includes(term)) ||
        (r.reqNo && r.reqNo.toLowerCase().includes(term)) ||
        r.date.includes(term) ||
        matchItems
      );
    });
  }, [stockReturns, selectedBranchId, historyTypeFilter, historySearch]);

  // Export to Excel
  const handleExportExcel = () => {
    if (filteredHistory.length === 0) {
      showToast('error', 'No return records to export.');
      return;
    }
    const dataRows = filteredHistory.map((r, i) => ({
      'SL #': i + 1,
      'Return Type': r.returnType === 'party_return' ? 'Return from Party' : 'Return to Factory',
      'Return No': r.returnNo,
      'Date': formatDateDDMMYY(r.date),
      'Party / Consignee': r.partyName || '-',
      'Ref Challan': r.challanNo || '-',
      'Ref Requisition': r.reqNo || '-',
      'Car Number': r.carNumber || '-',
      'Driver Name': r.driverName || '-',
      'Total Qty (Coils)': r.totalQuantity,
      'Total Amount (Tk)': r.totalAmount,
      'Remarks': r.remarks || ''
    }));

    const ws = XLSX.utils.json_to_sheet(dataRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Returns');
    XLSX.writeFile(wb, `Stock_Returns_Report_${getTodayDDMMYY()}.xlsx`);
    showToast('success', 'Excel export downloaded successfully.');
  };

  // Open Current Return for Print
  const handleOpenCurrentPrint = (format: 'pad' | 'slip_pad') => {
    const validLines = lines.filter((l) => (l.itemName && l.itemName.trim() !== '') || (l.quantity || 0) > 0);
    const mockVoucher: StockReturnChallan = {
      id: editingReturnId || 'current-print',
      returnType,
      returnNo,
      date: parseDateToISO(date) || new Date().toISOString().split('T')[0],
      branchId: activeReturnBranch?.id,
      branchName: activeReturnBranch?.name,
      partyName,
      challanNo,
      reqNo,
      carNumber,
      driverName,
      driverPhone,
      remarks,
      lines: validLines.length > 0 ? validLines : lines,
      totalQuantity,
      subtotalAmount: subtotal,
      discountPercent,
      discountAmount,
      totalAmount: grandTotal,
      savedAt: new Date().toISOString()
    };
    setPrintFormat(format);
    setPrintPreviewReturn(mockVoucher);
    setShowPrintModal(true);
  };

  return (
    <div className="space-y-4 font-sans max-w-6xl mx-auto pb-12">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl shadow-lg border flex items-center justify-between text-xs font-bold transition-all no-print ${
            notification.type === 'success'
              ? 'bg-emerald-950 text-emerald-100 border-emerald-700'
              : notification.type === 'error'
              ? 'bg-rose-950 text-rose-100 border-rose-700'
              : 'bg-slate-900 text-slate-100 border-slate-700'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            {notification.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
            {notification.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-400" />}
            {notification.type === 'info' && <Boxes className="w-5 h-5 text-indigo-400" />}
            <span>{notification.text}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-white cursor-pointer ml-4">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TOP CYBER TEAL NAVIGATION BAR */}
      <div className="cyber-glass-card border border-cyan-500/25 text-white rounded-2xl p-2.5 shadow-2xl mb-4 no-print">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <SalesCenterSearchFilter
              value={selectedBranchId}
              onChange={(newBranchId) => {
                if (!isBranchLocked) setSelectedBranchId(newBranchId);
              }}
              branches={effectiveBranches}
              isLocked={isBranchLocked}
              lockedReason={`Locked to assigned sales center: ${effectiveBranches.find((b) => b.id === selectedBranchId)?.name || selectedBranchId}`}
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

            {activeReturnBranch && (
              <div className="hidden xl:flex items-center space-x-1 px-2 py-1 rounded-lg bg-[#061520] border border-cyan-500/25 text-[10.5px] max-w-[260px] shrink-0">
                <Building2 className="w-3 h-3 text-cyan-400 shrink-0" />
                <span className="truncate font-semibold text-cyan-200">
                  {cleanBranchName(activeReturnBranch.name)}
                  {returnBranchAddress.fullAddress ? ` • ${returnBranchAddress.fullAddress}` : ''}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-bold text-cyan-200/80 uppercase tracking-wider">View:</span>
            <select
              value={activeSubTab === 'create_return' ? returnType : activeSubTab}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'party_return' || v === 'factory_return') {
                  setActiveSubTab('create_return');
                  handleSwitchType(v);
                } else {
                  setActiveSubTab(v as any);
                }
              }}
              className="bg-[#061520] text-cyan-200 border border-cyan-500/30 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-cyan-400 cursor-pointer"
            >
              <option value="party_return">Return from Party</option>
              <option value="factory_return">Return to Factory</option>
              <option value="return_directory">Returns Directory ({stockReturns.length})</option>
              <option value="color_exchange">Exchange ({colorExchanges.length})</option>
            </select>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUBTAB 1: CREATE / EDIT RETURN VOUCHER (PAD & SLIP PAD MODEL) */}
      {/* ========================================================================= */}
      {activeSubTab === 'create_return' && (
        <div className="space-y-4">

          {/* ========================================================================= */}
          {/* THE DOCUMENT PAPER / PAD CANVAS (Matching Bill page 1-to-1) */}
          {/* ========================================================================= */}
          <div className="max-w-4xl mx-auto bg-white text-black p-3 sm:p-8 md:p-12 shadow-2xl rounded-2xl border border-slate-300 min-h-[700px] sm:min-h-[960px] font-sans transition-all relative">
            {/* Plain Paper Company Header (Banner) */}
            {padHeaderMode === 'plain' ? (
              <div className="border-b-2 border-slate-900 pb-3 mb-3 text-center">
                <h1 className="text-xl sm:text-2xl font-black italic tracking-wider text-[#1e295b]">
                  {company.name || 'POLY CABLES'}
                </h1>
                {activeReturnBranch?.name && (
                  <p className="text-xs font-black text-slate-900 uppercase tracking-wide mt-0.5">
                    {cleanBranchName(activeReturnBranch.name)}
                  </p>
                )}
                <p className="text-[11px] font-semibold text-slate-700">
                  {returnBranchAddress.fullAddress || company.address} • Phone: {returnBranchAddress.phone || company.phone}
                </p>
                <div className="mt-2 inline-block bg-slate-900 text-white text-[11px] font-bold uppercase tracking-widest px-4 py-0.5 rounded-full">
                  {returnType === 'party_return' ? 'STOCK RETURN VOUCHER (FROM CUSTOMER)' : 'STOCK RETURN VOUCHER (TO FACTORY)'}
                </div>
              </div>
            ) : (
              /* Pre-Printed Pad Space */
              <div style={{ height: '30px', minHeight: '30px' }} className="w-full flex-none" aria-hidden="true" />
            )}

            {/* 2-Column Metadata Grid (Exact layout with dotted lines) */}
            <div className="flex flex-col md:flex-row items-stretch md:items-start justify-between w-full text-black font-sans mt-1 mb-1 gap-y-2 md:gap-x-3 text-xs flex-none">
              {/* Left Side: Party Name / Factory, Address, Phone */}
              <div className="flex-1 min-w-0 space-y-1">
                {/* Row 1: Party Name / Consignee */}
                <div className="flex items-center w-full min-h-[22px] relative return-party-container">
                  <span className="w-[78px] flex-none font-semibold text-black whitespace-nowrap text-left text-xs">
                    {returnType === 'party_return' ? 'Party Name' : 'To Factory'}
                  </span>
                  <span className="w-2 flex-none text-center font-semibold text-black text-xs">:</span>
                  
                  <div className="flex-1 min-w-0 relative sm:pl-[20px]">
                    <input
                      type="text"
                      value={partyName}
                      onChange={(e) => {
                        setPartyName(e.target.value);
                        setPartySearchQuery(e.target.value);
                        setIsShowingAllParties(false);
                        setShowPartyDropdown(true);
                        setPartyHighlightIdx(0);
                      }}
                      onFocus={() => {
                        setShowPartyDropdown(true);
                        setIsShowingAllParties(true);
                        setPartySearchQuery('');
                        setPartyHighlightIdx(0);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!showPartyDropdown) {
                            setShowPartyDropdown(true);
                            setPartyHighlightIdx(0);
                          } else if (filteredParties.length > 0) {
                            setPartyHighlightIdx((prev) => (prev + 1) % filteredParties.length);
                          }
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!showPartyDropdown) {
                            setShowPartyDropdown(true);
                            setPartyHighlightIdx(0);
                          } else if (filteredParties.length > 0) {
                            setPartyHighlightIdx((prev) => (prev - 1 + filteredParties.length) % filteredParties.length);
                          }
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (showPartyDropdown && filteredParties.length > 0) {
                            const chosen = filteredParties[partyHighlightIdx] || filteredParties[0];
                            setPartyName(chosen.name);
                            if (chosen.address) setPartyAddress(chosen.address);
                            if (chosen.phone) setPartyPhone(chosen.phone);
                            if (chosen.salesmanCode) setSalesmanCode(chosen.salesmanCode);
                            setShowPartyDropdown(false);
                          }
                        } else if (e.key === 'Escape') {
                          setShowPartyDropdown(false);
                        }
                      }}
                      placeholder={returnType === 'party_return' ? 'Search or enter customer party name...' : 'Consignee / Factory name...'}
                      style={{ fontSize: getDynamicPartyFontSize(partyName, 12), lineHeight: '1.2' }}
                      className="w-full font-bold border-b border-dotted border-black pb-0.5 bg-transparent focus:bg-white focus:outline-none text-left text-xs"
                    />

                    {/* Party Autocomplete Dropdown */}
                    {showPartyDropdown && returnType === 'party_return' && (
                      <div
                        ref={partyDropdownRef}
                        className="absolute z-50 left-5 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-slate-300 rounded-xl shadow-2xl divide-y divide-slate-100 no-print"
                      >
                        <div className="p-1.5 bg-slate-100 text-[10px] font-bold text-slate-600 uppercase flex justify-between items-center sticky top-0 z-10">
                          <span>Select Customer / Party ({filteredParties.length})</span>
                          <button
                            type="button"
                            onClick={() => setShowPartyDropdown(false)}
                            className="text-slate-400 hover:text-rose-600 px-1 text-xs"
                          >
                            ✕
                          </button>
                        </div>
                        {filteredParties.length === 0 ? (
                          <div className="p-3 text-center text-xs text-slate-400 italic">
                            No parties match "{partySearchQuery}". Type custom party name above.
                          </div>
                        ) : (
                          filteredParties.map((p, pIdx) => (
                            <div
                              key={p.id ? `${p.id}-${pIdx}` : `party-${pIdx}`}
                              data-return-party-highlighted={pIdx === partyHighlightIdx ? 'true' : 'false'}
                              onMouseEnter={() => setPartyHighlightIdx(pIdx)}
                              onClick={() => {
                                setPartyName(p.name);
                                if (p.address) setPartyAddress(p.address);
                                if (p.phone) setPartyPhone(p.phone);
                                if (p.salesmanCode) setSalesmanCode(p.salesmanCode);
                                setShowPartyDropdown(false);
                              }}
                              className={`p-2 cursor-pointer transition-colors ${
                                pIdx === partyHighlightIdx ? 'bg-indigo-50 text-indigo-950 font-bold' : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className="font-bold text-xs text-slate-900">{p.name}</div>
                              {p.address && <div className="text-[10px] text-slate-500 truncate">{p.address}</div>}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Row 2: Address */}
                <div className="flex items-center w-full min-h-[22px]">
                  <span className="w-[78px] flex-none font-semibold text-black whitespace-nowrap text-left text-xs">Address</span>
                  <span className="w-2 flex-none text-center font-semibold text-black text-xs">:</span>
                  <div className="flex-1 min-w-0 sm:pl-[20px]">
                    <input
                      type="text"
                      value={partyAddress}
                      onChange={(e) => setPartyAddress(e.target.value)}
                      placeholder="Customer or destination address..."
                      style={{ fontSize: getDynamicAddressFontSize(partyAddress, 12), lineHeight: '1.2' }}
                      className="w-full font-semibold border-b border-dotted border-black pb-0.5 bg-transparent focus:bg-white focus:outline-none text-left text-xs"
                    />
                  </div>
                </div>

                {/* Row 3: Phone / Driver Contact */}
                <div className="flex items-center w-full min-h-[22px]">
                  <span className="w-[78px] flex-none font-semibold text-black whitespace-nowrap text-left text-xs">Phone / Contact</span>
                  <span className="w-2 flex-none text-center font-semibold text-black text-xs">:</span>
                  <div className="flex-1 min-w-0 sm:pl-[20px]">
                    <input
                      type="text"
                      value={partyPhone}
                      onChange={(e) => setPartyPhone(e.target.value)}
                      placeholder="Contact telephone / mobile..."
                      className="w-full font-semibold border-b border-dotted border-black pb-0.5 bg-transparent focus:bg-white focus:outline-none text-left text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Right Side: Return No, Date, Ref Challan, Req/Car */}
              <div className="w-full md:w-[250px] flex-none space-y-1">
                {/* Row 1: Return No. & Date */}
                <div className="flex items-center justify-start min-h-[22px] w-full text-xs">
                  <span className="w-[74px] flex-none font-semibold text-black whitespace-nowrap text-left">Return No.</span>
                  <span className="w-2 flex-none text-center font-semibold text-black">:</span>
                  <input
                    type="text"
                    value={returnNo}
                    onChange={(e) => setReturnNo(e.target.value)}
                    placeholder="PR-001"
                    className="font-bold w-[48px] flex-none text-center border-b border-dotted border-black pb-0 bg-transparent focus:bg-white focus:outline-none text-xs font-mono"
                  />
                  <span className="w-[32px] flex-none font-semibold text-black whitespace-nowrap text-right pr-0.5">Date:</span>
                  <div className="relative flex items-center w-[72px] flex-none border-b border-dotted border-black pb-0.5">
                    <input
                      type="text"
                      value={date || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDate(val);
                        setChallanDate(val);
                      }}
                      onBlur={() => {
                        if (date.trim()) {
                          const formatted = formatDateDDMMYY(date) || date;
                          setDate(formatted);
                          setChallanDate(formatted);
                        }
                      }}
                      placeholder="dd.mm.yy"
                      className="w-full bg-transparent pl-0.5 pr-4 text-black font-mono font-semibold text-center focus:outline-none no-print text-xs"
                    />
                    <span className="hidden print:inline-block font-semibold w-full text-center text-black pb-0 text-xs font-mono">
                      {formatDateDDMMYY(date) || date || '\u00A0'}
                    </span>
                    <div className="absolute right-0 top-0 bottom-0 flex items-center justify-center pointer-events-auto">
                      <input
                        type="date"
                        tabIndex={-1}
                        value={parseDateToISO(date)}
                        onChange={(e) => {
                          if (e.target.value) {
                            const formatted = formatDateDDMMYY(e.target.value);
                            setDate(formatted);
                            setChallanDate(formatted);
                          }
                        }}
                        className="w-4 h-4 opacity-0 absolute inset-0 cursor-pointer no-print z-10"
                        title="Pick Return Date"
                      />
                      <Calendar className="w-3 h-3 text-slate-500 hover:text-slate-800 pointer-events-none no-print" />
                    </div>
                  </div>
                </div>

                {/* Row 2: Ref Challan / Bill No & Date */}
                <div className="flex items-center justify-start min-h-[22px] w-full text-xs">
                  <span className="w-[74px] flex-none font-semibold text-black whitespace-nowrap text-left">Ref. Challan</span>
                  <span className="w-2 flex-none text-center font-semibold text-black">:</span>
                  <div className="relative w-[48px] flex-none ref-challan-container">
                    <input
                      type="text"
                      value={challanNo}
                      onChange={(e) => {
                        setChallanNo(e.target.value);
                        setShowRefChallanDropdown(true);
                        setRefChallanHighlightIdx(0);
                      }}
                      onFocus={() => {
                        setShowRefChallanDropdown(true);
                        setRefChallanHighlightIdx(0);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!showRefChallanDropdown) {
                            setShowRefChallanDropdown(true);
                            setRefChallanHighlightIdx(0);
                          } else if (filteredRefDocs.length > 0) {
                            setRefChallanHighlightIdx((prev) => (prev + 1) % filteredRefDocs.length);
                          }
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!showRefChallanDropdown) {
                            setShowRefChallanDropdown(true);
                            setRefChallanHighlightIdx(0);
                          } else if (filteredRefDocs.length > 0) {
                            setRefChallanHighlightIdx((prev) => (prev - 1 + filteredRefDocs.length) % filteredRefDocs.length);
                          }
                        } else if (e.key === 'Enter') {
                          if (showRefChallanDropdown && filteredRefDocs.length > 0) {
                            e.preventDefault();
                            e.stopPropagation();
                            const chosen = filteredRefDocs[refChallanHighlightIdx] || filteredRefDocs[0];
                            if (chosen) handleSelectRefDoc(chosen);
                          }
                        } else if (e.key === 'Escape') {
                          setShowRefChallanDropdown(false);
                        }
                      }}
                      placeholder="Doc #"
                      className="font-semibold w-full text-center border-b border-dotted border-black pb-0 bg-transparent focus:bg-white focus:outline-none text-xs"
                    />
                    {showRefChallanDropdown && filteredRefDocs.length > 0 && (
                      <div
                        ref={refChallanDropdownRef}
                        className="absolute left-0 top-full mt-1 w-64 max-h-52 overflow-y-auto bg-white border border-slate-300 rounded-xl shadow-xl z-50 text-left font-sans text-xs divide-y divide-slate-100 no-print"
                      >
                        <div className="p-1.5 bg-slate-100 font-bold text-[10px] text-slate-600 uppercase flex justify-between items-center sticky top-0 z-10">
                          <span>Past Bills &amp; Challans</span>
                          <button
                            type="button"
                            onClick={() => setShowRefChallanDropdown(false)}
                            className="text-slate-400 hover:text-rose-600 text-xs px-1"
                          >
                            ✕
                          </button>
                        </div>
                        {filteredRefDocs.map((doc, rIdx) => {
                          const isHighlighted = rIdx === refChallanHighlightIdx;
                          return (
                            <div
                              key={`${doc.type}-${doc.id}`}
                              data-ref-challan-highlighted={isHighlighted ? 'true' : 'false'}
                              onMouseEnter={() => setRefChallanHighlightIdx(rIdx)}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectRefDoc(doc);
                              }}
                              className={`p-1.5 cursor-pointer transition-colors ${
                                isHighlighted
                                  ? 'bg-indigo-100 text-indigo-950 font-bold border-l-4 border-indigo-600'
                                  : 'hover:bg-indigo-50'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-900">
                                  {doc.type === 'bill' ? 'Bill #' : 'Challan #'}{doc.docNo}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {formatDateDDMMYY(doc.date)}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-600 truncate">{doc.partyName}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <span className="w-[32px] flex-none font-semibold text-black whitespace-nowrap text-right pr-0.5">Date:</span>
                  <div className="relative flex items-center w-[72px] flex-none border-b border-dotted border-black pb-0.5">
                    <input
                      type="text"
                      value={challanDate || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setChallanDate(val);
                        setDate(val);
                      }}
                      onBlur={() => {
                        if (challanDate.trim()) {
                          const formatted = formatDateDDMMYY(challanDate) || challanDate;
                          setChallanDate(formatted);
                          setDate(formatted);
                        }
                      }}
                      placeholder="dd.mm.yy"
                      className="w-full bg-transparent pl-0.5 pr-4 text-black font-mono font-semibold text-center focus:outline-none no-print text-xs"
                    />
                    <span className="hidden print:inline-block font-semibold w-full text-center text-black pb-0 text-xs font-mono">
                      {formatDateDDMMYY(challanDate) || challanDate || '\u00A0'}
                    </span>
                    <div className="absolute right-0 top-0 bottom-0 flex items-center justify-center pointer-events-auto">
                      <input
                        type="date"
                        tabIndex={-1}
                        value={parseDateToISO(challanDate)}
                        onChange={(e) => {
                          if (e.target.value) {
                            const formatted = formatDateDDMMYY(e.target.value);
                            setChallanDate(formatted);
                            setDate(formatted);
                          }
                        }}
                        className="w-4 h-4 opacity-0 absolute inset-0 cursor-pointer no-print z-10"
                        title="Pick Challan Date"
                      />
                      <Calendar className="w-3 h-3 text-slate-500 hover:text-slate-800 pointer-events-none no-print" />
                    </div>
                  </div>
                </div>

                {/* Row 3: Req No / Remarks / Ref */}
                <div className="flex items-center justify-start min-h-[22px] w-full text-xs">
                  <span className="w-[74px] flex-none font-semibold text-black whitespace-nowrap text-left">
                    {returnType === 'party_return' ? 'Salesman / Ref' : 'Remarks / Ref'}
                  </span>
                  <span className="w-2 flex-none text-center font-semibold text-black">:</span>
                  <input
                    type="text"
                    value={returnType === 'party_return' ? salesmanCode : remarks}
                    onChange={(e) => {
                      if (returnType === 'party_return') setSalesmanCode(e.target.value);
                      else setRemarks(e.target.value);
                    }}
                    placeholder={returnType === 'party_return' ? 'Code' : 'Ref / Remarks'}
                    className="font-semibold border-b border-dotted border-black flex-1 text-left pb-0 bg-transparent focus:bg-white focus:outline-none text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Quick Action bar above spreadsheet table */}
            <div className="flex items-center justify-between mt-3 mb-1 no-print">
              <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                <Boxes className="w-3.5 h-3.5 text-indigo-600" />
                <span>Return Line Items ({lines.filter((l) => (l.itemName || '').trim()).length} Items)</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowBillChallanSearchModal(true);
                  setSearchDocQuery('');
                  setSelectedSearchItemKeys({});
                }}
                className="text-[11px] px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
              >
                <Search className="w-3 h-3 text-indigo-600" />
                <span>+ Search & Import Items from Bill / Challan</span>
              </button>
            </div>

            {/* ========================================================================= */}
            {/* THE SPREADSHEET TABLE ON PAD (Interactive Searchable Autocomplete) */}
            {/* ========================================================================= */}
            <div className="border-2 border-black overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse text-xs">
                <thead>
                  <tr className="border-b-2 border-black text-black font-bold text-center bg-white">
                    <th className="py-1 px-1 w-12 border-r border-black">Sl No.</th>
                    <th className="py-1 px-2 border-r border-black text-left">
                      Name Of Items
                    </th>
                    <th className="py-1 px-1 w-20 border-r border-black text-right">Quantity</th>
                    <th className="py-1 px-1 w-16 border-r border-black text-center">Unit</th>
                    <th className="py-1 px-1 w-24 border-r border-black text-right">Price/Unit</th>
                    <th className="py-1 px-1 w-28 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => {
                    const rawQuery = (line.itemName || '').trim();
                    const hasItem = Boolean((line.itemName && line.itemName.trim()) || (line.itemCode && line.itemCode.trim()) || (line.quantity && line.quantity > 0));

                    const rawFilteredItems = items.filter((i) => {
                      if (i.isActive === false) return false;
                      if (!rawQuery) return true;
                      return matchesFlexibleSearch(`${i.name} ${i.sizeSpec || ''} ${i.category || ''}`, rawQuery, `${i.category || ''} ${i.code || ''}`);
                    });
                    const groupedFilteredItems = groupItemsByCategoryOrder(rawFilteredItems, categoryOrder);
                    const filteredItems = groupedFilteredItems.orderedItems;

                    return (
                      <tr key={line.id || idx} className="border-b border-black hover:bg-slate-50/50 group">
                        {/* SL No. */}
                        <td className="py-1 px-1 text-center font-bold text-black border-r border-black align-middle text-xs select-none whitespace-nowrap">
                          {hasItem ? (
                            <div className="flex items-center justify-center space-x-0.5">
                              <span className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700 opacity-60 group-hover:opacity-100 no-print flex-none">
                                <GripVertical className="w-3 h-3 inline" />
                              </span>
                              <span>{String(idx + 1).padStart(2, '0')}.</span>
                            </div>
                          ) : null}
                        </td>

                        {/* Name Of Items with Autocomplete Combobox */}
                        <td className="py-1 px-1.5 border-r border-black align-middle relative return-item-cell-container">
                          <div className="relative flex items-center">
                            <input
                              id={`return-item-input-${idx}`}
                              type="text"
                              value={line.itemName}
                              onChange={(e) => {
                                handleLineChange(idx, 'itemName', e.target.value);
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
                                    handleSelectItemForLine(idx, selected);
                                  } else {
                                    const qtyInput = qtyInputRefs.current[idx];
                                    if (qtyInput) {
                                      qtyInput.focus();
                                      qtyInput.select();
                                    }
                                  }
                                } else if (e.key === 'Escape') {
                                  setActiveItemDropdownIdx(null);
                                }
                              }}
                              placeholder={idx === 0 ? "Search or select item (e.g. 1x1.5)..." : ""}
                              className="w-full font-bold text-black bg-transparent p-0 focus:bg-white focus:outline-none border-none shadow-none text-xs truncate"
                            />
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
                          </div>

                          {/* Color breakdown badges if any */}
                          {line.colors && Object.keys(line.colors).length > 0 && (
                            <div
                              onClick={() => handleOpenColorModal(idx)}
                              className="mt-0.5 flex flex-wrap gap-1 cursor-pointer no-print"
                              title="Click to edit color quantities"
                            >
                              {Object.entries(line.colors).map(([color, qty]) => (
                                <span
                                  key={color}
                                  className="text-[9px] px-1 py-0.2 rounded bg-slate-100 text-slate-700 font-mono font-semibold border border-slate-300"
                                >
                                  {color}: {qty}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Searchable Autocomplete Dropdown */}
                          {activeItemDropdownIdx === idx && (
                            <div
                              ref={itemDropdownRef}
                              className="absolute left-0 top-full mt-1 w-72 sm:w-96 max-w-[calc(100vw-2.5rem)] max-h-64 overflow-y-auto bg-white border border-slate-300 rounded-xl shadow-2xl z-50 text-left font-sans text-xs divide-y divide-slate-100 no-print"
                            >
                              <div className="py-1 px-2.5 bg-slate-100 font-bold text-[10px] text-slate-600 uppercase flex justify-between items-center border-b border-slate-200 sticky top-0 z-10">
                                <span>Select Product Item ({filteredItems.length} found)</span>
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
                                  No matching item found for "{line.itemName}".
                                </div>
                              ) : (
                                groupedFilteredItems.groups.map((grp) => (
                                  <div key={grp.category} className="divide-y divide-slate-100">
                                    <div className="px-2.5 py-1 bg-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-700 border-y border-slate-200 sticky top-7 z-[5]">
                                      {grp.category} ({grp.items.length})
                                    </div>
                                    {grp.items.map(({ item, flatIndex: itemIdx }) => {
                                      const isHighlighted = itemHighlightIdx === itemIdx;
                                      const liveStock = getItemLiveStock(item, []);
                                      const stockUnit = item.unit || 'Coils';

                                      return (
                                        <div
                                          key={item.id || itemIdx}
                                          data-return-item-highlighted={isHighlighted ? 'true' : 'false'}
                                          onMouseDown={(e) => {
                                            e.preventDefault();
                                            handleSelectItemForLine(idx, item);
                                          }}
                                          onMouseEnter={() => setItemHighlightIdx(itemIdx)}
                                          className={`w-full text-left py-1.5 px-2.5 transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                                            isHighlighted
                                              ? 'bg-indigo-100 text-slate-900 border-l-4 border-indigo-600 font-bold'
                                              : 'hover:bg-slate-50 text-slate-800'
                                          }`}
                                        >
                                          <div className="flex-1 min-w-0">
                                            <div className="font-bold text-slate-900 truncate text-xs">
                                              {item.name}
                                            </div>
                                            {item.category && (
                                              <div className="text-[10px] text-slate-500 truncate">
                                                {item.category}
                                              </div>
                                            )}
                                          </div>
                                          <div className="flex flex-col items-end flex-none">
                                            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                                              liveStock > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                            }`}>
                                              Stock: {liveStock} {stockUnit}
                                            </span>
                                            <span className="text-xs font-mono font-bold text-slate-800 mt-0.5">
                                              ৳{(item.rate ?? 0).toLocaleString()}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ))
                              )}

                              <div className="p-1.5 bg-indigo-50 border-t border-indigo-200 sticky bottom-0 z-10">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuickAddInitialData({
                                      name: line.itemName,
                                      rate: line.rate,
                                      unit: line.unit,
                                      rowIndex: idx
                                    });
                                    setQuickAddModalOpen(true);
                                    setActiveItemDropdownIdx(null);
                                  }}
                                  className="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-all cursor-pointer"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span className="truncate">+ Add "{line.itemName.trim() || 'New Item'}" to Master Catalog</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Quantity */}
                        <td className="py-1 px-1 border-r border-black text-right align-middle font-bold text-black">
                          <input
                            ref={(el) => { qtyInputRefs.current[idx] = el; }}
                            type="number"
                            min="0"
                            value={line.quantity === 0 ? '' : line.quantity}
                            onChange={(e) => handleLineChange(idx, 'quantity', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                if (idx === lines.length - 1) {
                                  handleAddLine();
                                }
                              }
                            }}
                            placeholder=""
                            className="w-full text-right font-bold text-black bg-transparent p-0 focus:bg-white focus:outline-none border-none shadow-none text-xs"
                          />
                        </td>

                        {/* Unit */}
                        <td className="py-1 px-1 border-r border-black text-center align-middle font-semibold text-black">
                          <input
                            type="text"
                            value={hasItem ? (line.unit || 'Coils') : (line.unit && line.unit !== 'Coils' ? line.unit : '')}
                            onChange={(e) => handleLineChange(idx, 'unit', e.target.value)}
                            placeholder=""
                            className="w-full text-center font-semibold text-black bg-transparent p-0 focus:bg-white focus:outline-none border-none shadow-none text-xs"
                          />
                        </td>

                        {/* Price / Unit */}
                        <td className="py-1 px-1 border-r border-black text-right align-middle font-semibold font-mono text-black">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.rate === 0 ? '' : line.rate}
                            onChange={(e) => handleLineChange(idx, 'rate', e.target.value)}
                            placeholder=""
                            className="w-full text-right font-mono font-semibold text-black bg-transparent p-0 focus:bg-white focus:outline-none border-none shadow-none text-xs"
                          />
                        </td>

                        {/* Amount */}
                        <td className="py-1 px-1 text-right font-mono font-bold text-black align-middle text-xs relative">
                          <div className="flex items-center justify-end space-x-1">
                            <span>{hasItem && line.amount && line.amount > 0 ? `${(line.amount).toLocaleString('en-IN')}/-` : ''}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(idx)}
                              className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-600 p-0.5 rounded cursor-pointer transition-opacity no-print"
                              title="Delete row"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Table Footer with Total Coils, Subtotal, Sales Discount, Grand Total */}
                <tfoot>
                  {/* Row 1: Total Coils & Subtotal */}
                  <tr className="border-t-2 border-black font-semibold bg-white">
                    <td colSpan={2} className="py-1 px-2 text-right border-r border-black font-semibold whitespace-nowrap">
                      Total Coils =
                    </td>
                    <td className="py-1 px-1 text-right border-r border-black font-bold font-mono text-black">
                      {totalQuantity}
                    </td>
                    <td className="py-1 px-1 border-r border-black text-center font-semibold text-slate-700">
                      Coils
                    </td>
                    <td className="py-1 px-2 text-right border-r border-black font-semibold whitespace-nowrap">
                      Subtotal =
                    </td>
                    <td className="py-1 px-2 text-right font-bold text-black whitespace-nowrap font-mono">
                      {subtotal ? `${subtotal.toLocaleString('en-IN')}/-` : '0/-'}
                    </td>
                  </tr>

                  {/* Row 2: Sales Discount */}
                  <tr className="border-t border-black font-semibold bg-white">
                    <td colSpan={5} className="py-1 px-2 text-right border-r border-black font-semibold whitespace-nowrap">
                      <div className="flex items-center justify-end space-x-1">
                        <span>Sales Discount</span>
                        <input
                          ref={discountPercentInputRef}
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={discountPercent === 0 ? '' : discountPercent}
                          onChange={(e) => handleDiscountPercentChange(parseFloat(e.target.value) || 0)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (discountInputRef.current) {
                                discountInputRef.current.focus();
                                discountInputRef.current.select();
                              }
                            }
                          }}
                          placeholder="0"
                          className="w-12 text-center border border-slate-300 rounded px-1 py-0.5 font-semibold text-emerald-800 bg-white"
                        />
                        <span>% =</span>
                      </div>
                    </td>
                    <td className="py-1 px-1 text-right font-semibold text-black whitespace-nowrap font-mono">
                      <input
                        ref={discountInputRef}
                        type="number"
                        min="0"
                        value={
                          isDiscountFocused
                            ? (discountAmount || '')
                            : (discountAmount > 0 ? discountAmount : '')
                        }
                        onFocus={() => setIsDiscountFocused(true)}
                        onBlur={() => setIsDiscountFocused(false)}
                        onChange={(e) => handleDiscountAmountChange(parseFloat(e.target.value) || 0)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (saveReturnBtnRef.current) {
                              saveReturnBtnRef.current.focus();
                            }
                          }
                        }}
                        placeholder="0"
                        className="w-full text-right border border-emerald-300 focus:border-emerald-600 rounded px-1.5 py-0.5 font-semibold text-emerald-900 bg-emerald-50/50 focus:bg-white focus:outline-none"
                      />
                    </td>
                  </tr>

                  {/* Row 3: Grand Total */}
                  <tr className="border-t border-black font-bold bg-white">
                    <td colSpan={5} className="py-1 px-2 text-right border-r border-black font-bold whitespace-nowrap text-xs">
                      Total =
                    </td>
                    <td className="py-1 px-1 text-right font-bold text-black whitespace-nowrap font-mono text-xs">
                      <div className="border border-slate-300 rounded px-1.5 py-0.5 bg-slate-50 text-right font-bold font-mono text-black">
                        {grandTotal ? `${grandTotal.toLocaleString('en-IN')}/-` : '0/-'}
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* In Words bar below table */}
            <div className="pt-2 text-black flex items-center space-x-1.5 flex-none text-xs">
              <span className="font-semibold text-black whitespace-nowrap">In Word:</span>
              <span className="font-bold text-black italic flex-1 border-b border-dotted border-black pb-0.5">
                {inWords}
              </span>
            </div>

            {/* Add Row Button and Quick Actions */}
            <div className="no-print pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={handleAddLine}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold flex items-center space-x-1.5 border border-slate-300 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Blank Row</span>
              </button>
            </div>

            {/* ========================================================================= */}
            {/* BOTTOM SUMMARY & SIGNATURES */}
            {/* ========================================================================= */}
            <div className="mt-3 pt-2 border-t border-dotted border-black space-y-2">
              <div className="flex items-center text-xs">
                <span className="font-semibold text-black whitespace-nowrap mr-1">Remarks:</span>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Reason for return, factory consignment notes, condition..."
                  className="font-medium text-black border-b border-dotted border-black flex-1 pb-0.5 bg-transparent focus:bg-white focus:outline-none text-xs"
                />
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-8 sm:pt-10 text-center text-[10px] font-bold text-black print:grid-cols-4">
                <div className="border-t border-black pt-1">Prepared By</div>
                <div className="border-t border-black pt-1">Checked By</div>
                <div className="border-t border-black pt-1">Received By</div>
                <div className="border-t border-black pt-1">Authorized Signature</div>
              </div>
            </div>
          </div>

          {/* Bottom Document Actions Bar */}
          <div className="no-print cyber-glass-card border border-cyan-500/25 rounded-2xl p-3 mt-4 max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2 text-white">
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="inline-flex rounded-lg p-0.5 bg-[#061520] border border-cyan-500/25">
                <button
                  type="button"
                  onClick={() => setPadHeaderMode('plain')}
                  className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    padHeaderMode === 'plain'
                      ? 'bg-cyan-400 text-slate-950 font-black shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Plain Paper
                </button>
                <button
                  type="button"
                  onClick={() => setPadHeaderMode('hide_logo')}
                  className={`px-2 py-1 text-[11px] font-black rounded-md transition-all cursor-pointer whitespace-nowrap ${
                    padHeaderMode === 'hide_logo'
                      ? 'bg-amber-400 text-slate-950 shadow-md'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Pad (Hide Logo)
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowBillChallanSearchModal(true);
                  setSearchDocQuery('');
                  setSelectedSearchItemKeys({});
                }}
                className="bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/30 rounded-lg px-2.5 py-1.5 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Search className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Search Bill / Challan Items</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setQuickAddInitialData({
                    unit: 'Coils',
                    category: 'Single Core Wires'
                  });
                  setQuickAddModalOpen(true);
                }}
                className="bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/30 rounded-lg px-2.5 py-1.5 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>+ Master Item</span>
              </button>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={handleResetForm}
                className="bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 rounded-lg px-2.5 py-1.5 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>New Voucher</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenCurrentPrint('pad')}
                className="bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-400/35 rounded-lg px-2.5 py-1.5 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Print Pad</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenCurrentPrint('slip_pad')}
                className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-400/35 rounded-lg px-2.5 py-1.5 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                <span>Print Slip Pad</span>
              </button>
              <button
                type="button"
                onClick={() => handleSaveReturn()}
                className="bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-lg px-3 py-1.5 text-[11px] font-black flex items-center gap-1 transition-colors cursor-pointer shadow-[0_0_16px_rgba(34,211,238,0.28)] whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5 shrink-0" />
                <span>{editingReturnId ? 'Update Voucher' : returnType === 'factory_return' ? 'Save & Stock Out' : 'Save & Stock In'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 2: RETURNS DIRECTORY & HISTORY */}
      {/* ========================================================================= */}
      {activeSubTab === 'return_directory' && (
        <div className="space-y-3">
          {/* GLOBAL CONTROLS & FILTER BAR (SALES & STOCK REPORT FILTER BAR STYLE) */}
          <div className="bg-[#0b2334]/85 backdrop-blur-xl p-2.5 px-4 rounded-xl border border-cyan-500/25 flex flex-col space-y-2 text-xs text-white shadow-lg no-print">
            {/* Row 1: Core Dimensions */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap flex-1">
                {/* Type Filter */}
                <div className="flex items-center space-x-1 bg-[#061520] text-white p-1 px-2 rounded-lg border border-cyan-500/30 shrink-0">
                  <span className="text-slate-300 font-bold text-[11px] flex items-center space-x-1 whitespace-nowrap">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Return Type:</span>
                  </span>
                  <select
                    value={historyTypeFilter}
                    onChange={(e) => setHistoryTypeFilter(e.target.value as any)}
                    className="bg-[#081b28] text-cyan-200 border border-cyan-500/30 rounded px-1.5 py-0.5 text-xs font-bold focus:ring-1 focus:ring-cyan-400 focus:outline-none cursor-pointer"
                  >
                    <option value="all">All Types ({stockReturns.length})</option>
                    <option value="party_return">Customer Returns ({stockReturns.filter((r) => r.returnType === 'party_return').length})</option>
                    <option value="factory_return">Factory Returns ({stockReturns.filter((r) => r.returnType === 'factory_return').length})</option>
                  </select>
                </div>

                {/* Search Box with Clear Button */}
                <div className="relative flex-1 min-w-0 w-full sm:w-auto sm:min-w-[200px] max-w-md">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Search return voucher #, party name, challan #, date..."
                    className="w-full pl-8 pr-7 py-1 text-xs bg-[#061520] text-white placeholder-slate-400 border border-cyan-500/30 rounded-lg focus:ring-1 focus:ring-cyan-400 focus:outline-none font-medium"
                  />
                  {historySearch && (
                    <button
                      type="button"
                      onClick={() => setHistorySearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 text-xs font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {historySearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setHistorySearch('');
                      setHistoryTypeFilter('all');
                    }}
                    className="px-2.5 py-1 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/35 rounded-lg text-xs font-bold flex items-center space-x-1 transition-colors cursor-pointer"
                    title="Reset all filters"
                  >
                    <FilterX className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-[11px] text-slate-300">Showing <strong className="text-cyan-300 font-bold font-mono">{filteredHistory.length}</strong> vouchers</span>
              </div>
            </div>
          </div>

          <div className="cyber-glass-card rounded-2xl overflow-hidden text-white">

          {/* Directory Table */}
          {filteredHistory.length === 0 ? (
            <div className="text-center py-16 text-slate-300">
              <RotateCcw className="w-12 h-12 mx-auto text-cyan-400/50 mb-2" />
              <p className="font-bold text-sm text-white">No Return Records Found</p>
              <p className="text-xs text-slate-400 mt-1">
                Saved stock return vouchers will be listed here with quick view, print &amp; edit options.
              </p>
            </div>
          ) : (
            <div className="w-full overflow-hidden">
              <table className="w-full table-fixed text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#0c2638] text-cyan-200 font-bold border-b border-cyan-500/30 uppercase text-[10px] select-none">
                    <th className="p-2.5 w-[4%] text-center">SL</th>
                    <th className="p-2.5 w-[12%]">Type</th>
                    <th className="p-2.5 w-[12%]">Return No</th>
                    <th className="p-2.5 w-[9%]">Date</th>
                    <th className="p-2.5 w-[25%]">Party / Customer</th>
                    <th className="p-2.5 w-[10%]">Ref Challan</th>
                    <th className="p-2.5 w-[8%] text-center">Qty</th>
                    <th className="p-2.5 w-[11%] text-right">Total Amount</th>
                    <th className="p-2.5 w-[9%] text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                  {filteredHistory.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-cyan-500/[0.06] transition-colors">
                      <td className="p-2.5 text-center font-mono text-slate-400">{idx + 1}</td>
                      <td className="p-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight whitespace-nowrap border ${
                          item.returnType === 'party_return' ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/35' : 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35'
                        }`}>
                          {item.returnType === 'party_return' ? 'Party Return' : 'Factory Return'}
                        </span>
                      </td>
                      <td className="p-2.5 font-mono font-bold text-cyan-300 truncate">{item.returnNo}</td>
                      <td className="p-2.5 text-slate-300 font-mono whitespace-nowrap text-[11px]">{formatDateDDMMYY(item.date)}</td>
                      <td className="p-2.5 font-bold text-white truncate" title={item.returnType === 'party_return' ? item.partyName : item.driverName || item.partyName || ''}>
                        {item.returnType === 'party_return' ? item.partyName : item.driverName || item.partyName || '-'}
                      </td>
                      <td className="p-2.5 text-slate-300 font-mono truncate">{item.challanNo || '-'}</td>
                      <td className="p-2.5 text-center font-bold font-mono text-white whitespace-nowrap">
                        {item.totalQuantity} Coils
                      </td>
                      <td className="p-2.5 text-right font-bold font-mono text-emerald-300 whitespace-nowrap">
                        ৳{(item.totalAmount || 0).toLocaleString()}
                      </td>
                      <td className="p-2.5 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            type="button"
                            onClick={() => {
                              setPrintFormat('pad');
                              setPrintPreviewReturn(item);
                              setShowPrintModal(true);
                            }}
                            className="bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-200 border border-cyan-400/35 p-1 rounded-md text-xs font-bold cursor-pointer transition-colors"
                            title="Print Voucher"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditReturn(item)}
                            className="bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 p-1 rounded-md text-xs font-bold cursor-pointer transition-colors"
                            title="Edit Voucher in Editor"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmReturn(item)}
                            className="bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 p-1 rounded-md text-xs font-bold cursor-pointer transition-colors"
                            title="Delete Return Record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </div>

          <div className="cyber-glass-card rounded-2xl p-3 flex flex-wrap items-center justify-end gap-2 no-print">
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3.5 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-lg font-black text-xs flex items-center space-x-1.5 shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 3: COLOUR & UNIT EXCHANGE (L.H.S = R.H.S) */}
      {/* ========================================================================= */}
      {activeSubTab === 'color_exchange' && (
        <ColorExchangeManager
          parties={parties}
          items={items}
          company={company}
          colorExchanges={colorExchanges}
          onSaveColorExchange={handleSaveColorExchange}
          onDeleteColorExchange={handleDeleteColorExchange}
        />
      )}

      {/* ========================================================================= */}
      {/* PRINT PREVIEW MODAL (Supporting Pad & Slip Pad) */}
      {/* ========================================================================= */}
      {showPrintModal && printPreviewReturn && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 max-w-4xl w-full max-h-[95vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="cyber-glass-header text-white p-3.5 flex items-center justify-between border-b border-cyan-500/25">
              <div className="flex items-center space-x-2">
                <Printer className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-sm">
                  Print Voucher: #{printPreviewReturn.returnNo} ({printFormat === 'slip_pad' ? '5.5" x 8.5" Slip Pad' : 'Full Pad Document'})
                </h3>
              </div>

              {/* Controls */}
              <div className="flex items-center space-x-2">
                <div className="flex items-center bg-[#071824] rounded-lg p-0.5 border border-cyan-500/25 text-xs">
                  <button
                    type="button"
                    onClick={() => setPrintFormat('pad')}
                    className={`px-2.5 py-1 rounded-md font-bold cursor-pointer ${
                      printFormat === 'pad' ? 'bg-cyan-400 text-slate-950 font-black' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Full Pad
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintFormat('slip_pad')}
                    className={`px-2.5 py-1 rounded-md font-bold cursor-pointer ${
                      printFormat === 'slip_pad' ? 'bg-cyan-400 text-slate-950 font-black' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    5.5" x 8.5" Slip Pad
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    triggerAutoConfiguredPrint(printFormat === 'slip_pad' ? 'slip_pad' : 'bill');
                  }}
                  className="bg-cyan-400 hover:bg-cyan-300 text-slate-950 px-3.5 py-1.5 rounded-lg text-xs font-black flex items-center space-x-1.5 shadow-sm cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Now</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="text-slate-300 hover:text-white p-1 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Document Preview Canvas */}
            <div className="p-6 overflow-y-auto bg-[#041018]/85 flex-1 flex justify-center">
              <div
                id="printable-return-voucher"
                style={{
                  width: printFormat === 'slip_pad' ? '5.5in' : '7.2in',
                  minHeight: printFormat === 'slip_pad' ? '8.5in' : '9.8in',
                  transform: printZoom === '80%' ? 'scale(0.8)' : printZoom === '115%' ? 'scale(1.15)' : 'scale(1)',
                  transformOrigin: 'top center'
                }}
                className="bg-white shadow-xl border border-slate-300 rounded-lg p-5 text-black font-sans text-xs flex flex-col justify-between"
              >
                <div>
                  {/* Company Header */}
                  <div className="text-center border-b-2 border-black pb-2 mb-2">
                    <h2 className="text-lg font-black italic tracking-wider text-[#1e295b]">
                      {company.name || 'POLY CABLES'}
                    </h2>
                    {activeReturnBranch?.name && (
                      <p className="text-[11px] font-black text-slate-900 uppercase tracking-wide">
                        {cleanBranchName(activeReturnBranch.name)}
                      </p>
                    )}
                    <p className="text-[10px] font-semibold text-slate-700">
                      {returnBranchAddress.fullAddress || company.address} • Phone: {returnBranchAddress.phone || company.phone}
                    </p>
                    <div className="mt-1 inline-block bg-slate-900 text-white font-bold px-3 py-0.5 rounded-full text-[10px] uppercase">
                      {printPreviewReturn.returnType === 'party_return' ? 'Customer Return Voucher' : 'Factory Return Voucher'}
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="flex items-start justify-between text-xs mb-2">
                    <div className="space-y-0.5 flex-1 pr-2">
                      <p><span className="font-semibold">Party/Factory:</span> <strong className="border-b border-dotted border-black">{printPreviewReturn.partyName || '-'}</strong></p>
                      {printPreviewReturn.driverName && <p><span className="font-semibold">Driver:</span> {printPreviewReturn.driverName} ({printPreviewReturn.driverPhone || '-'})</p>}
                    </div>
                    <div className="space-y-0.5 text-right w-48">
                      <p><span className="font-semibold">Voucher #:</span> <strong className="font-mono">{printPreviewReturn.returnNo}</strong></p>
                      <p><span className="font-semibold">Date:</span> <span className="font-mono">{formatDateDDMMYY(printPreviewReturn.date)}</span></p>
                      {printPreviewReturn.challanNo && <p><span className="font-semibold">Ref Challan:</span> {printPreviewReturn.challanNo}</p>}
                    </div>
                  </div>

                  {/* Items Table */}
                  <table className="w-full border-collapse text-xs border border-black mb-2">
                    <thead>
                      <tr className="bg-slate-100 border-b border-black font-bold text-center">
                        <th className="p-1 w-10 border-r border-black">Sl No.</th>
                        <th className="p-1 border-r border-black text-left">Name Of Items</th>
                        <th className="p-1 w-16 border-r border-black text-right">Quantity</th>
                        <th className="p-1 w-12 border-r border-black text-center">Unit</th>
                        <th className="p-1 w-20 border-r border-black text-right">Price/Unit</th>
                        <th className="p-1 w-24 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printPreviewReturn.lines.map((l, i) => (
                        <tr key={i} className="border-b border-slate-300">
                          <td className="p-1 text-center font-bold border-r border-black">{String(i + 1).padStart(2, '0')}.</td>
                          <td className="p-1 border-r border-black font-semibold text-left">{l.itemName}</td>
                          <td className="p-1 border-r border-black text-right font-bold">{l.quantity}</td>
                          <td className="p-1 border-r border-black text-center">{l.unit || 'Coils'}</td>
                          <td className="p-1 border-r border-black text-right font-mono">{l.rate ? `৳${l.rate}` : '-'}</td>
                          <td className="p-1 text-right font-mono font-bold">{l.amount ? `৳${(l.amount || 0).toLocaleString()}` : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-black font-semibold bg-slate-50">
                        <td colSpan={2} className="p-1 text-right border-r border-black font-semibold">Total Coils =</td>
                        <td className="p-1 text-right font-mono border-r border-black font-bold">{printPreviewReturn.totalQuantity}</td>
                        <td className="p-1 text-center border-r border-black">Coils</td>
                        <td className="p-1 text-right border-r border-black font-semibold">Subtotal =</td>
                        <td className="p-1 text-right font-mono font-bold">{((printPreviewReturn.subtotalAmount ?? printPreviewReturn.totalAmount) || 0).toLocaleString()}/-</td>
                      </tr>
                      {(printPreviewReturn.discountAmount || 0) > 0 && (
                        <tr className="border-t border-black font-semibold">
                          <td colSpan={5} className="p-1 text-right border-r border-black">
                            Sales Discount {printPreviewReturn.discountPercent ? `${printPreviewReturn.discountPercent}% ` : ''}=
                          </td>
                          <td className="p-1 text-right font-mono font-semibold text-emerald-800">
                            {(printPreviewReturn.discountAmount || 0).toLocaleString()}/-
                          </td>
                        </tr>
                      )}
                      <tr className="border-t border-black font-bold bg-slate-100">
                        <td colSpan={5} className="p-1 text-right border-r border-black uppercase font-bold">Total =</td>
                        <td className="p-1 text-right font-mono font-bold text-slate-900">৳{(printPreviewReturn.totalAmount || 0).toLocaleString()}/-</td>
                      </tr>
                    </tfoot>
                  </table>

                  {/* In Words & Remarks */}
                  <div className="text-[11px] space-y-1">
                    <p><span className="font-semibold">In Word:</span> <em>{convertToTakaWords(printPreviewReturn.totalAmount || 0)}</em></p>
                    {printPreviewReturn.remarks && <p><span className="font-semibold">Remarks:</span> {printPreviewReturn.remarks}</p>}
                  </div>
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-4 gap-2 pt-8 text-center text-[9px] font-bold text-black border-t border-slate-300 mt-4">
                  <div className="border-t border-black pt-1">Prepared By</div>
                  <div className="border-t border-black pt-1">Checked By</div>
                  <div className="border-t border-black pt-1">Received By</div>
                  <div className="border-t border-black pt-1">Authorized Signature</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search Bill / Challan / Factory Items Modal */}
      {showBillChallanSearchModal && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-5 no-print">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-white">
            {/* Modal Header */}
            <div className="px-5 py-4 cyber-glass-header border-b border-cyan-500/25 text-white flex items-center justify-between flex-none">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-cyan-500/15 border border-cyan-400/30 rounded-xl">
                  <Search className="w-5 h-5 text-cyan-300" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white tracking-wide">
                    Search Items from Bills &amp; Challans
                  </h3>
                  <p className="text-xs text-slate-300">
                    Find and import sold or delivered items directly into this Return Voucher
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBillChallanSearchModal(false)}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-[#0e2a3d] rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="p-4 bg-[#071824]/90 border-b border-cyan-500/20 flex flex-wrap items-center justify-between gap-3 flex-none">
              {/* Type Filter Tabs */}
              <div className="flex items-center bg-[#061520] border border-cyan-500/25 p-1 rounded-xl gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => setSearchDocType('all')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    searchDocType === 'all'
                      ? 'bg-cyan-400 text-slate-950 font-black shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  All ({allSearchableDocItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSearchDocType('bills')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    searchDocType === 'bills'
                      ? 'bg-cyan-400 text-slate-950 font-black shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Bills ({allSearchableDocItems.filter((i) => i.sourceType === 'bill').length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSearchDocType('challans')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    searchDocType === 'challans'
                      ? 'bg-cyan-400 text-slate-950 font-black shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>Delivery Challans ({allSearchableDocItems.filter((i) => i.sourceType === 'challan').length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSearchDocType('factory')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    searchDocType === 'factory'
                      ? 'bg-emerald-500 text-slate-950 font-black shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Factory Imports ({allSearchableDocItems.filter((i) => i.sourceType === 'factory').length})</span>
                </button>
              </div>

              {/* Search Query Input */}
              <div className="relative flex-1 min-w-0 w-full sm:w-auto sm:min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchDocQuery}
                  onChange={(e) => setSearchDocQuery(e.target.value)}
                  placeholder="Search item name, size, bill#, challan#, party, date..."
                  className="w-full pl-9 pr-8 py-2 bg-[#061520] border border-cyan-500/30 rounded-xl text-xs font-semibold text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 shadow-2xs"
                  autoFocus
                />
                {searchDocQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchDocQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Party filter toggle if party is specified in return */}
              {partyName && partyName.trim() !== '' && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-400 font-medium">Party Filter:</span>
                  <span className="font-bold text-cyan-200 bg-[#061520] border border-cyan-500/30 px-2 py-1 rounded-lg truncate max-w-[160px]" title={partyName}>
                    {partyName}
                  </span>
                </div>
              )}
            </div>

            {/* Results Table */}
            <div className="flex-1 overflow-y-auto min-h-[300px]">
              {modalFilteredDocItems.length === 0 ? (
                <div className="py-16 text-center text-slate-400 space-y-2">
                  <Search className="w-10 h-10 mx-auto text-cyan-400/50" />
                  <p className="font-bold text-sm text-white">No items match your search criteria</p>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Try searching for another product name, size (e.g. 1x1.5), or clearing the search query.
                  </p>
                </div>
              ) : (
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-[#0c2638] text-cyan-200 font-bold border-b border-cyan-500/30 sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={
                            modalFilteredDocItems.length > 0 &&
                            modalFilteredDocItems.every((i) => selectedSearchItemKeys[i.key])
                          }
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            setSelectedSearchItemKeys((prev) => {
                              const updated = { ...prev };
                              modalFilteredDocItems.forEach((i) => {
                                updated[i.key] = isChecked;
                              });
                              return updated;
                            });
                          }}
                          className="rounded text-cyan-400 focus:ring-cyan-400 cursor-pointer"
                          title="Select / Deselect all visible items"
                        />
                      </th>
                      <th className="py-2.5 px-2 text-left w-24">Doc Type</th>
                      <th className="py-2.5 px-2 text-left w-28">Doc # &amp; Date</th>
                      <th className="py-2.5 px-3 text-left">Party / Source</th>
                      <th className="py-2.5 px-3 text-left">Product Item &amp; Size</th>
                      <th className="py-2.5 px-2 text-right w-20">Qty</th>
                      <th className="py-2.5 px-2 text-right w-20">Rate</th>
                      <th className="py-2.5 px-3 text-right w-24">Total</th>
                      <th className="py-2.5 px-3 text-center w-36">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200 font-sans">
                    {modalFilteredDocItems.map((item) => {
                      const isSelected = !!selectedSearchItemKeys[item.key];
                      return (
                        <tr
                          key={item.key}
                          className={`hover:bg-cyan-500/[0.06] transition-colors ${
                            isSelected ? 'bg-cyan-500/15 font-medium' : ''
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="py-2 px-3 text-center align-middle">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                const isChecked = e.target.checked;
                                setSelectedSearchItemKeys((prev) => ({
                                  ...prev,
                                  [item.key]: isChecked
                                }));
                              }}
                              className="rounded text-cyan-400 focus:ring-cyan-400 cursor-pointer"
                            />
                          </td>

                          {/* Doc Type Badge */}
                          <td className="py-2 px-2 align-middle">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider inline-block border ${
                                item.sourceType === 'bill'
                                  ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/30'
                                  : item.sourceType === 'challan'
                                  ? 'bg-indigo-500/20 text-indigo-200 border-indigo-400/30'
                                  : 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30'
                              }`}
                            >
                              {item.sourceType === 'bill'
                                ? 'Bill'
                                : item.sourceType === 'challan'
                                ? 'Challan'
                                : 'Factory'}
                            </span>
                          </td>

                          {/* Doc # & Date */}
                          <td className="py-2 px-2 align-middle font-mono">
                            <div className="font-bold text-cyan-300">#{item.docNo}</div>
                            <div className="text-[10px] text-slate-400">{formatDateDDMMYY(item.docDate)}</div>
                          </td>

                          {/* Party / Consignee */}
                          <td className="py-2 px-3 align-middle">
                            <div className="font-bold text-white truncate max-w-[200px]" title={item.partyName}>
                              {item.partyName || '-'}
                            </div>
                            {item.address && (
                              <div className="text-[10px] text-slate-400 truncate max-w-[200px]">
                                {item.address}
                              </div>
                            )}
                          </td>

                          {/* Product Item & Size */}
                          <td className="py-2 px-3 align-middle">
                            <div className="font-bold text-white">{item.itemName}</div>
                            {item.sizeSpec && (
                              <div className="text-[10px] text-slate-400">{item.sizeSpec}</div>
                            )}
                          </td>

                          {/* Quantity */}
                          <td className="py-2 px-2 text-right align-middle font-mono font-bold text-white">
                            {item.quantity} {item.unit || 'Coils'}
                          </td>

                          {/* Rate */}
                          <td className="py-2 px-2 text-right align-middle font-mono text-slate-300">
                            ৳{item.rate ? item.rate.toLocaleString() : '0'}
                          </td>

                          {/* Total */}
                          <td className="py-2 px-3 text-right align-middle font-mono font-bold text-emerald-300">
                            ৳{(item.amount || (item.quantity * (item.rate || 0))).toLocaleString()}
                          </td>

                          {/* Actions */}
                          <td className="py-2 px-3 text-center align-middle">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleAddSearchItemToReturn(item)}
                                className="px-2 py-1 bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-200 border border-cyan-400/35 rounded-md font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                                title="Add single item to Return Lines"
                              >
                                <Plus className="w-3 h-3" />
                                <span>+ Add</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleImportEntireDocument(item.sourceType, item.docId)}
                                className="px-2 py-1 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 rounded-md font-semibold text-[10px] cursor-pointer transition-colors"
                                title="Import all items from this document"
                              >
                                All Doc
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-[#071824]/90 border-t border-cyan-500/20 flex items-center justify-between gap-3 flex-none">
              <div className="text-xs font-semibold text-slate-300">
                {Object.keys(selectedSearchItemKeys).filter((k) => selectedSearchItemKeys[k]).length > 0 ? (
                  <span className="text-cyan-300 font-bold">
                    {Object.keys(selectedSearchItemKeys).filter((k) => selectedSearchItemKeys[k]).length} item(s) selected
                  </span>
                ) : (
                  <span>Select items above to batch import, or click "+ Add" on any row</span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowBillChallanSearchModal(false)}
                  className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 rounded-xl font-bold text-xs cursor-pointer transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleAddSelectedSearchItems}
                  disabled={Object.keys(selectedSearchItemKeys).filter((k) => selectedSearchItemKeys[k]).length === 0}
                  className={`px-5 py-2 rounded-xl font-black text-xs flex items-center space-x-1.5 transition-all shadow-sm ${
                    Object.keys(selectedSearchItemKeys).filter((k) => selectedSearchItemKeys[k]).length > 0
                      ? 'bg-cyan-400 hover:bg-cyan-300 text-slate-950 cursor-pointer hover:scale-[1.02]'
                      : 'bg-slate-700/60 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    Import Selected (
                    {Object.keys(selectedSearchItemKeys).filter((k) => selectedSearchItemKeys[k]).length}
                    ) Items
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmReturn && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 max-w-md w-full p-6 space-y-4 text-white">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-3 bg-rose-500/20 border border-rose-400/30 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Delete Return Voucher?</h3>
                <p className="text-xs text-slate-300">
                  Voucher #{deleteConfirmReturn.returnNo} ({deleteConfirmReturn.totalQuantity} Coils)
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-300">
              Are you sure you want to permanently delete this return voucher? The returned stock quantities will be reversed in store inventory.
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmReturn(null)}
                className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 rounded-xl font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteReturn(deleteConfirmReturn.id, deleteConfirmReturn.returnNo)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-xs cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Master Item Modal */}
      {quickAddModalOpen && (
        <QuickAddItemModal
          isOpen={quickAddModalOpen}
          onClose={() => setQuickAddModalOpen(false)}
          initialData={quickAddInitialData}
          existingItems={items}
          onItemCreated={(createdItem) => {
            setItems((prev) => [createdItem, ...prev]);
            if (quickAddInitialData.rowIndex !== undefined) {
              handleSelectItemForLine(quickAddInitialData.rowIndex, createdItem);
            }
            setQuickAddModalOpen(false);
            showToast('success', `Added "${createdItem.name}" to Master Items Catalog.`);
          }}
          title="Add New Item to Master Catalog"
        />
      )}

      {/* Color Quantity Selection Modal */}
      {colorModalState && colorModalState.isOpen && (
        <ColorQuantityModal
          isOpen={colorModalState.isOpen}
          item={colorModalState.item}
          unit={colorModalState.unit}
          initialColors={colorModalState.initialColors}
          initialTotalQty={colorModalState.initialTotalQty}
          onConfirm={handleConfirmColorModal}
          onClose={() => {
            const nextIdx = (colorModalState?.lineIndex ?? 0) + 1;
            setColorModalState(null);
            focusReturnLineItemInput(nextIdx);
          }}
        />
      )}

      {/* Printer Auto Configuration Modal */}
      {showPrinterConfigModal && (
        <PrinterAutoConfigModal
          isOpen={showPrinterConfigModal}
          onClose={() => setShowPrinterConfigModal(false)}
          documentType={printFormat === 'slip_pad' ? 'slip_pad' : 'bill'}
        />
      )}
    </div>
  );
};
