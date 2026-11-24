import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Item, FactoryImportChallan, FactoryImportLine, CompanyDetails, BranchLocation, Requisition, AuditLogEntry } from '../types';
import { formatDateDDMMYY, parseDateToISO, getTodayDDMMYY } from '../utils/dateUtils';
import {
  Truck,
  User,
  Phone,
  Calendar,
  Hash,
  Plus,
  Trash2,
  Save,
  Printer,
  Search,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Eye,
  X,
  Boxes,
  Building2,
  Tag,
  Download,
  RotateCcw,
  Upload,
  Loader2,
  Edit3,
  Pencil,
  Clock,
  Sparkles,
  FilterX,
  History,
  Zap,
  Palette,
  ChevronUp,
  ChevronDown,
  ArrowUpDown
} from 'lucide-react';
import { defaultCompany, defaultBranches, defaultRequisitions } from '../data/defaultData';
import { getItemFactoryImportQty, getItemLiveStock } from '../utils/stockHelper';
import { matchesFlexibleSearch, groupItemsByCategoryOrder } from '../utils/searchHelper';
import { convertToTakaWords } from '../utils/numberToWords';
import { matchImportedItemWithStored, ItemMatchResult } from '../utils/itemMatcher';
import { isColorApplicableCable, getAllCategories } from '../utils/categoryHelper';
import { parseDocumentWithAI } from '../utils/aiDocumentImport';
import { ColorQuantityModal, ColorBreakdownData } from './ColorQuantityModal';
import { ImportConflictModal } from './ImportConflictModal';
import { cleanBranchName, getUserBranch, isSuperAdminOrAgm, isStrictSuperAdmin, isAccountsAdmin, isAnyAdmin, isFactoryUser } from '../utils/branchAccess';
import { identifyColors, buildPlusFormula, formatColorText } from '../utils/colorParser';
import { checkCanTakeEntry } from '../utils/cloudConnection';
import { recordDeletedEntityId } from '../utils/deletedTracker';
import { AuthUser } from '../types';

interface FactoryImportManagerProps {
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  factoryImports: FactoryImportChallan[];
  setFactoryImports: React.Dispatch<React.SetStateAction<FactoryImportChallan[]>>;
  company?: CompanyDetails;
  branches?: BranchLocation[];
  initialSubTab?: 'new_challan' | 'history';
  onBack?: () => void;
  onClose?: () => void;
  hideInternalTabs?: boolean;
  requisitions?: Requisition[];
  setRequisitions?: React.Dispatch<React.SetStateAction<Requisition[]>>;
  currentUser?: AuthUser | null;
}

function generateNextChallanNo(existing: FactoryImportChallan[]): string {
  let maxNum = existing.length;
  existing.forEach((c) => {
    const match = c.challanNo.match(/\d+/);
    if (match) {
      const val = parseInt(match[0], 10);
      if (val > maxNum) maxNum = val;
    }
  });
  return `FC-${String(maxNum + 1).padStart(3, '0')}`;
}

// Helper to check if a requisition was created on a sales center named
export const isSalesCenterNamedRequisition = (
  req: Requisition,
  branchesList: BranchLocation[] = []
): boolean => {
  // If explicitly flagged as sales center requisition
  if (req.isSalesCenterRequisition) return true;

  const pName = (req.partyName || '').trim().toLowerCase();
  if (!pName) return false;

  // Check if party name contains 'sales center' or 'showroom'
  if (pName.includes('sales center') || pName.includes('showroom')) {
    return true;
  }

  // Check if party name matches any branch/sales center name
  const allBranches = branchesList.length > 0 ? branchesList : defaultBranches;
  const isBranchName = allBranches.some((b) => {
    const bName = b.name.trim().toLowerCase();
    const cleanB = cleanBranchName(b.name).toLowerCase();
    const cleanP = cleanBranchName(req.partyName || '').toLowerCase();
    return (
      bName === pName ||
      (cleanB.length > 2 && cleanB === cleanP) ||
      (cleanB.length > 3 && pName.includes(cleanB)) ||
      (cleanP.length > 3 && bName.includes(cleanP))
    );
  });

  return isBranchName;
};

export const FactoryImportManager: React.FC<FactoryImportManagerProps> = ({
  items,
  setItems,
  factoryImports,
  setFactoryImports,
  company = defaultCompany,
  branches,
  initialSubTab = 'new_challan',
  onBack,
  onClose,
  hideInternalTabs = false,
  requisitions: propRequisitions,
  setRequisitions: propSetRequisitions,
  currentUser
}) => {
  const effectiveBranches = useMemo(() => {
    if (branches && branches.length > 0) return branches;
    try {
      const saved = localStorage.getItem('polycables_branches');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return defaultBranches;
  }, [branches]);

  const userBranch = useMemo(() => {
    return getUserBranch(currentUser, undefined, effectiveBranches);
  }, [currentUser, effectiveBranches]);

  const isSuperOrAdmin =
    isStrictSuperAdmin(currentUser) ||
    isAccountsAdmin(currentUser) ||
    isSuperAdminOrAgm(currentUser) ||
    isAnyAdmin(currentUser);
  const isBranchLocked = !isSuperOrAdmin && Boolean(userBranch?.branchId);

  // --- REQUISITIONS STATE & CONVERSION ---
  const [localRequisitions, setLocalRequisitions] = useState<Requisition[]>(() => {
    try {
      const saved = localStorage.getItem('polycables_requisitions');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return defaultRequisitions;
  });

  const effectiveRequisitions = propRequisitions || localRequisitions;
  const setEffectiveRequisitions = propSetRequisitions || setLocalRequisitions;

  const isFactoryRole = useMemo(() => isFactoryUser(currentUser), [currentUser]);

  // Showroom / Sales Center Requisitions: strictly requisitions created on a sales center named
  const salesCenterRequisitions = useMemo(() => {
    return effectiveRequisitions.filter((r) => {
      if (isFactoryRole) {
        const isApproved = Boolean(
          r.isApproved ||
          r.stage === 'sent_to_factory' ||
          r.stage === 'factory_dispatched' ||
          r.stage === 'factory_received' ||
          r.stage === 'goods_received' ||
          r.stage === 'converted_to_bill'
        );
        if (!isApproved) return false;
      }
      return isSalesCenterNamedRequisition(r, effectiveBranches);
    });
  }, [effectiveRequisitions, effectiveBranches, isFactoryRole]);

  const [showRequisitionListModal, setShowRequisitionListModal] = useState<boolean>(false);
  const [selectedPreviewRequisition, setSelectedPreviewRequisition] = useState<Requisition | null>(null);
  const [convertedFromReqId, setConvertedFromReqId] = useState<string | null>(null);
  const [requisitionSearch, setRequisitionSearch] = useState<string>('');
  const [requisitionFilterStatus, setRequisitionFilterStatus] = useState<'ALL' | 'PENDING' | 'RECEIVED'>('ALL');

  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    if (isSuperOrAdmin) return 'ALL';
    if (isBranchLocked && userBranch.branchId) {
      return userBranch.branchId;
    }
    return effectiveBranches[0]?.id || 'branch-1';
  });
  const [historyBranchFilter, setHistoryBranchFilter] = useState<string>(() => {
    if (isSuperOrAdmin) return 'ALL';
    if (isBranchLocked && userBranch.branchId) {
      return userBranch.branchId;
    }
    return 'ALL';
  });

  const lastFactoryImportUserRef = useRef<string>('');
  useEffect(() => {
    const userKey = `${currentUser?.username || ''}::${currentUser?.salespersonCode || ''}::${currentUser?.branchId || ''}::${currentUser?.role || ''}`;
    const userChanged = lastFactoryImportUserRef.current !== '' && lastFactoryImportUserRef.current !== userKey;
    lastFactoryImportUserRef.current = userKey;

    if (isSuperOrAdmin) {
      if (userChanged) {
        setSelectedBranchId('ALL');
        setHistoryBranchFilter('ALL');
      }
      return;
    }

    if (isBranchLocked && userBranch.branchId) {
      setSelectedBranchId(userBranch.branchId);
      setHistoryBranchFilter(userBranch.branchId);
    }
  }, [isSuperOrAdmin, isBranchLocked, userBranch.branchId, currentUser]);

  const [subTab, setSubTab] = useState<'new_challan' | 'history'>(initialSubTab);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  // --- NEW CHALLAN FORM STATE ---
  const [editingChallanId, setEditingChallanId] = useState<string | null>(null);
  const isEditing = Boolean(editingChallanId);

  const [reqNo, setReqNo] = useState<string>('');
  const [challanNo, setChallanNo] = useState<string>(() => generateNextChallanNo(factoryImports));
  const [date, setDate] = useState<string>(() => getTodayDDMMYY());
  const [carNumber, setCarNumber] = useState<string>('');
  const [driverName, setDriverName] = useState<string>('');
  const [driverPhone, setDriverPhone] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');

  // Line items state
  const [lines, setLines] = useState<FactoryImportLine[]>([
    {
      id: `line-${Date.now()}-1`,
      itemId: '',
      itemCode: '',
      itemName: '',
      sizeSpec: '',
      unit: 'Coils',
      category: '',
      quantity: 0,
      rate: 0,
      amount: 0
    }
  ]);

  // Search & filter for history view
  const [historySearch, setHistorySearch] = useState<string>('');

  // Dynamic item search & keyboard navigation state per line
  const [lineSearchQueries, setLineSearchQueries] = useState<{ [lineId: string]: string }>({});
  const [openDropdownLineId, setOpenDropdownLineId] = useState<string | null>(null);
  const [highlightedItemIndex, setHighlightedItemIndex] = useState<number>(0);
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

  const itemSearchRefs = useRef<{ [lineId: string]: HTMLInputElement | null }>({});
  const qtyInputRefs = useRef<{ [lineId: string]: HTMLInputElement | null }>({});
  const dropdownOptionRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const addFactoryLineButtonRef = useRef<HTMLButtonElement | null>(null);

  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);

  const discountPercentInputRef = useRef<HTMLInputElement | null>(null);
  const discountAmountInputRef = useRef<HTMLInputElement | null>(null);
  const saveChallanBtnRef = useRef<HTMLButtonElement | null>(null);

  // Sequential Enter-key navigation form refs
  const branchSelectRef = useRef<HTMLSelectElement | null>(null);
  const reqNoInputRef = useRef<HTMLInputElement | null>(null);
  const challanNoInputRef = useRef<HTMLInputElement | null>(null);
  const importDateInputRef = useRef<HTMLInputElement | null>(null);
  const driverNameInputRef = useRef<HTMLInputElement | null>(null);
  const driverPhoneInputRef = useRef<HTMLInputElement | null>(null);
  const remarksInputRef = useRef<HTMLInputElement | null>(null);

  // Role-based initial focus on open: Super Admin / Admin -> Destination Sales Center, others -> Req # No
  useEffect(() => {
    if (subTab === 'new_challan') {
      const timer = setTimeout(() => {
        if ((isStrictSuperAdmin(currentUser) || isAnyAdmin(currentUser)) && !isBranchLocked && branchSelectRef.current) {
          branchSelectRef.current.focus();
        } else {
          reqNoInputRef.current?.focus();
          reqNoInputRef.current?.select();
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [subTab, currentUser, isBranchLocked]);

  useEffect(() => {
    if (openDropdownLineId && dropdownOptionRefs.current[highlightedItemIndex]) {
      dropdownOptionRefs.current[highlightedItemIndex]?.scrollIntoView({
        block: 'nearest'
      });
    }
  }, [highlightedItemIndex, openDropdownLineId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (openDropdownLineId && target && !target.closest('.item-search-container')) {
        setOpenDropdownLineId(null);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openDropdownLineId) {
        setOpenDropdownLineId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [openDropdownLineId]);

  // In-app Delete Confirmation Modal State (replaces window.confirm which is blocked in iframes)
  const [deleteConfirmChallan, setDeleteConfirmChallan] = useState<{ id: string; challanNo: string } | null>(null);

  // Color breakdown modal state for BYA, Aluminium, Flexible cables (without RE)
  const [colorModalState, setColorModalState] = useState<{
    lineId: string;
    item: Item | { id?: string; code?: string; name: string; sizeSpec?: string; unit?: string; category?: string; rate?: number };
    initialQty?: number;
    colors?: Partial<ColorBreakdownData>;
  } | null>(null);

  const handleOpenColorModalForLine = (line: FactoryImportLine) => {
    const matchedItem = items.find((i) => i.id === line.itemId || i.name === line.itemName || i.code === line.itemCode);
    const targetItem = matchedItem || {
      id: line.itemId,
      code: line.itemCode,
      name: line.itemName,
      sizeSpec: line.sizeSpec,
      unit: line.unit,
      category: line.category,
      rate: line.rate
    };

    setColorModalState({
      lineId: line.id,
      item: targetItem,
      initialQty: line.quantity || 0,
      colors: {
        red: Number(line.red) || 0,
        blk: Number(line.black) || 0,
        yel: Number(line.yellow) || 0,
        grn: Number(line.green) || 0,
        blu: Number(line.blue) || 0,
        others: Number(line.others) || 0
      }
    });
  };

  // Reliable factory import line item focus & selection helper with retry
  const focusFactoryLineItemInput = (targetLineId: string) => {
    let attempts = 0;
    const maxAttempts = 10;
    const tryFocus = () => {
      attempts++;
      const el = itemSearchRefs.current[targetLineId] || (document.getElementById(`factory-item-input-${targetLineId}`) as HTMLInputElement | null);
      if (el) {
        el.focus();
        if (typeof el.select === 'function') {
          el.select();
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

  const handleConfirmColorModal = (totalQty: number, colors: ColorBreakdownData) => {
    if (!colorModalState) return;
    const { lineId, item } = colorModalState;
    const effectiveQty = totalQty > 0 ? totalQty : 0;

    if (effectiveQty === 0) {
      // User rule: item selected but Import Qty is 0, enter pressed or confirmed with 0 removes line & jumps to discount
      if (lines.length > 1) {
        setLines((prev) => prev.filter((l) => l.id !== lineId));
      }
      setColorModalState(null);
      setTimeout(() => {
        if (discountPercentInputRef.current) {
          discountPercentInputRef.current.focus();
          discountPercentInputRef.current.select();
        }
      }, 60);
      return;
    }

    const colorParts: string[] = [];
    if (colors.red && Number(colors.red) > 0) colorParts.push(`R:${colors.red}`);
    if (colors.blk && Number(colors.blk) > 0) colorParts.push(`B:${colors.blk}`);
    if (colors.yel && Number(colors.yel) > 0) colorParts.push(`Y:${colors.yel}`);
    if (colors.grn && Number(colors.grn) > 0) colorParts.push(`G:${colors.grn}`);
    if (colors.blu && Number(colors.blu) > 0) colorParts.push(`BU:${colors.blu}`);
    if (colors.others && Number(colors.others) > 0) colorParts.push(`O:${colors.others}`);
    const colorRemarksStr = colorParts.join(' ');

    setLines((prev) => {
      return prev.map((line) => {
        if (line.id === lineId) {
          const rate = line.rate || (item as any)?.rate || 0;
          return {
            ...line,
            quantity: effectiveQty,
            red: colors.red || '',
            black: colors.blk || '',
            yellow: colors.yel || '',
            green: colors.grn || '',
            blue: colors.blu || '',
            others: colors.others || '',
            remarks: colorRemarksStr || line.remarks || '',
            amount: effectiveQty * rate
          };
        }
        return line;
      });
    });

    setColorModalState(null);

    const currentIndex = lines.findIndex((l) => l.id === lineId);
    if (currentIndex >= 0 && currentIndex < lines.length - 1) {
      focusFactoryLineItemInput(lines[currentIndex + 1].id);
    } else {
      addFactoryLineButtonRef.current?.focus();
    }
  };

  const handleSelectFoundItem = (lineId: string, foundItem: Item) => {
    setLines((prev) => {
      return prev.map((line) => {
        if (line.id === lineId) {
          const qty = line.quantity || 0;
          const rate = foundItem.rate || 0;
          return {
            ...line,
            itemId: foundItem.id,
            itemCode: foundItem.code,
            itemName: foundItem.name,
            sizeSpec: foundItem.sizeSpec || '',
            unit: foundItem.unit || 'Coils',
            category: foundItem.category || '',
            rate,
            amount: qty * rate
          };
        }
        return line;
      });
    });

    setLineSearchQueries((prev) => ({ ...prev, [lineId]: foundItem.name }));
    setOpenDropdownLineId(null);

    // Check if item is BYA, Aluminium, or Flexible without RE
    const isColorReq = isColorApplicableCable(foundItem);
    if (isColorReq) {
      const currentLine = lines.find((l) => l.id === lineId);
      setColorModalState({
        lineId,
        item: foundItem,
        initialQty: currentLine?.quantity || 0,
        colors: {
          red: Number(currentLine?.red) || 0,
          blk: Number(currentLine?.black) || 0,
          yel: Number(currentLine?.yellow) || 0,
          grn: Number(currentLine?.green) || 0,
          blu: Number(currentLine?.blue) || 0,
          others: Number(currentLine?.others) || 0
        }
      });
    } else {
      // Auto focus goes to quantity field
      setTimeout(() => {
        if (qtyInputRefs.current[lineId]) {
          qtyInputRefs.current[lineId]?.focus();
          qtyInputRefs.current[lineId]?.select();
        }
      }, 60);
    }
  };

  const handleQtyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, lineId: string, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const currentLine = lines.find((l) => l.id === lineId) || lines[index];
      const currentQty = Number(currentLine?.quantity) || 0;
      const hasItemName = Boolean(currentLine?.itemName && currentLine.itemName.trim().length > 0);

      if (currentQty <= 0) {
        // User rule: item select but quantity 0 and press enter focus goes to discount then remove 0 quantity row and check blank row but sl no have then remove that
        setLines((prev) => {
          const valid = prev.filter((l) => {
            if (l.id === lineId) return false;
            const hasDesc = Boolean(l.itemName && l.itemName.trim().length > 0);
            const q = Number(l.quantity) || 0;
            if (!hasDesc || q <= 0) return false;
            return true;
          });
          if (valid.length > 0) {
            return valid;
          }
          return [
            {
              id: `line-${Date.now()}-1`,
              itemId: '',
              itemCode: '',
              itemName: '',
              sizeSpec: '',
              unit: 'Coils',
              category: '',
              quantity: 0,
              rate: 0,
              amount: 0
            }
          ];
        });
        setTimeout(() => {
          if (discountPercentInputRef.current) {
            discountPercentInputRef.current.focus();
            discountPercentInputRef.current.select();
          }
        }, 60);
        return;
      }

      // Quantity is valid (> 0); continue to the next existing row or add-row button.
      if (index === lines.length - 1) {
        addFactoryLineButtonRef.current?.focus();
      } else {
        const nextLine = lines[index + 1];
        if (nextLine && itemSearchRefs.current[nextLine.id]) {
          itemSearchRefs.current[nextLine.id]?.focus();
        }
      }
    }
  };
  const [selectedChallanForModal, setSelectedChallanForModal] = useState<FactoryImportChallan | null>(null);

  // Notification state
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const [isParsingFile, setIsParsingFile] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Item match results & conflict review modal state (Rule: >=70% name match & 100% rate match)
  const [importConflictData, setImportConflictData] = useState<{
    isOpen: boolean;
    results: ItemMatchResult[];
  } | null>(null);

  const [excelImportDiagOpen, setExcelImportDiagOpen] = useState(false);
  const [excelImportAddedCount, setExcelImportAddedCount] = useState(0);
  const [excelImportProblems, setExcelImportProblems] = useState<Array<{ item: string; problem: string; fix: string }>>([]);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 5000);
  };

  const handlePasteFactoryItemsFromExcel = (targetIdx: number, pastedText: string) => {
    const rawRows = (pastedText || '')
      .split(/\r?\n/)
      .map((r) => r.trim())
      .filter((r) => r.length > 0);
    if (rawRows.length === 0) return;

    const isPureHeaderRow = (cells: string[]): boolean => {
      const nonEmpty = cells.map((c) => c.trim().toLowerCase()).filter(Boolean);
      if (nonEmpty.length === 0) return true;
      const hasCableDigits = nonEmpty.some((c) => /\d+\s*[\/xX.]\s*\d+|\b\d+(?:\.\d+)?\s*(?:rm|sm|re|mm|core)\b/i.test(c));
      if (hasCableDigits) return false;
      const headerLabels = new Set([
        'sl', 'sl.', 'sl no', 'sl. no.', 's/n', '#', 'no',
        'item', 'items', 'item name', 'name of item', 'name of items', 'description', 'description of goods', 'particulars', 'product', 'product name',
        'qty', 'quantity', 'coil', 'coils', 'coil qty', 'unit', 'uom', 'rate', 'price', 'unit price', 'amount', 'total', 'taka', 'size', 'remarks'
      ]);
      const matchedHeaders = nonEmpty.filter((c) => headerLabels.has(c.replace(/[^a-z0-9./#\s]/g, '').trim()));
      return matchedHeaders.length >= 1 && matchedHeaders.length === nonEmpty.length;
    };

    const newImportLines: FactoryImportLine[] = [];
    const problems: Array<{ item: string; problem: string; fix: string }> = [];

    rawRows.forEach((rawLine, rowIdx) => {
      const cells = rawLine.split('\t').map((c) => c.trim());
      if (rowIdx === 0 && isPureHeaderRow(cells)) return;

      let rawName = '';
      let rawQty = 0;
      let rawRate = 0;
      let rawUnit = '';
      let qtyProvided = false;

      if (cells.length === 1) {
        rawName = cells[0];
      } else {
        let startCol = 0;
        if (cells.length >= 2 && /^\d{1,4}[.)]?$/.test(cells[0]) && cells[1] && isNaN(Number(cells[1]))) {
          startCol = 1;
        }
        rawName = cells[startCol] || '';
        const remaining = cells.slice(startCol + 1);
        for (const token of remaining) {
          if (!token) continue;
          const cleanedNum = Number(token.replace(/,/g, '').replace(/\s*(?:tk|taka|৳)\s*/gi, ''));
          if (!isNaN(cleanedNum) && /^[\d,.\s৳tTkKaA]+$/.test(token)) {
            if (!qtyProvided) {
              rawQty = cleanedNum;
              qtyProvided = cleanedNum > 0;
            } else if (rawRate === 0) {
              rawRate = cleanedNum;
            }
          } else if (!rawUnit && /^(?:coils?|bobins?|pcs|nos|mtr|meter|box|roll|set|pkt)$/i.test(token)) {
            rawUnit = token;
          } else if (!rawName) {
            rawName = token;
          }
        }
      }

      if (!rawName) return;
      const lowerName = rawName.toLowerCase();
      if (
        lowerName === 'total' ||
        lowerName.startsWith('total ') ||
        lowerName.includes('grand total') ||
        lowerName.includes('sub total') ||
        lowerName.includes('subtotal') ||
        lowerName.includes('in words')
      ) {
        return;
      }

      const effectiveQty = qtyProvided && rawQty > 0 ? rawQty : 1;
      const matchResult = matchImportedItemWithStored(
        rawName,
        rawRate,
        effectiveQty,
        items,
        rawUnit || undefined,
        rawRate > 0 ? rawRate * effectiveQty : 0
      );

      const matchedStored = matchResult.matchedStoredItem || matchResult.suggestedStoredItem;
      const finalName = matchResult.shouldUseStoredName ? matchResult.finalItemDescription : rawName;
      const isSpecial =
        Boolean(matchedStored?.isSpecialItem) ||
        matchedStored?.unit === 'Bobin' ||
        /^bobins?$/i.test(rawUnit) ||
        /\bbobin\b/i.test(finalName);
      const finalUnit = isSpecial ? (matchedStored?.unit || 'Bobin') : (matchResult.finalUnit || rawUnit || matchedStored?.unit || 'Coils');
      const finalRate = matchResult.finalRate || rawRate || matchedStored?.rate || 0;
      const finalAmt = Math.round(effectiveQty * finalRate);

      const rowIssues: string[] = [];
      const rowFixes: string[] = [];
      if (!qtyProvided) {
        rowIssues.push('Quantity was missing or 0 in Excel (set to 1 temporarily).');
        rowFixes.push('Enter the exact Import Quantity in the Quantity column.');
      }
      if (!matchedStored) {
        rowIssues.push('Item name did not match any stored catalog item.');
        rowFixes.push('Click the item box on this row to select the matching catalog item, or add this item in Item List.');
      } else if (finalRate <= 0) {
        rowIssues.push('Rate is 0 Tk.');
        rowFixes.push('Update the item price in Item List or verify the rate column.');
      }

      if (rowIssues.length > 0) {
        problems.push({
          item: `Row ${rowIdx + 1}: ${rawName}`,
          problem: rowIssues.join(' '),
          fix: rowFixes.join(' ')
        });
      }

      newImportLines.push({
        id: `line-paste-${Date.now()}-${rowIdx}-${Math.random().toString(36).slice(2, 6)}`,
        itemId: matchResult.shouldUseStoredName ? matchResult.finalItemId : (matchedStored?.id || ''),
        itemCode: matchedStored?.code || '',
        itemName: finalName,
        sizeSpec: matchResult.finalSizeSpec || matchedStored?.sizeSpec || '',
        unit: finalUnit,
        category: matchedStored?.category || '',
        quantity: effectiveQty,
        rate: finalRate,
        amount: finalAmt
      });
    });

    if (newImportLines.length === 0) return;

    setLines((prev) => {
      const next = [...prev];
      const targetRow = next[targetIdx];
      const isTargetEmpty = !targetRow || (!targetRow.itemName?.trim() && (Number(targetRow.quantity) || 0) === 0);
      if (isTargetEmpty) {
        next.splice(targetIdx, 1, ...newImportLines);
      } else {
        next.splice(targetIdx + 1, 0, ...newImportLines);
      }
      return next;
    });
    setOpenDropdownLineId(null);
    showToast('success', `${newImportLines.length} item(s) added from Excel.`);

    if (problems.length > 0) {
      setExcelImportAddedCount(newImportLines.length);
      setExcelImportProblems(problems);
      setExcelImportDiagOpen(true);
    }
  };

  // Convert Sales Center Requisition to Factory Import Challan
  const handleConvertRequisitionToImport = (req: Requisition) => {
    // 1. Match Sales Center branch
    let targetBranch = effectiveBranches.find(
      (b) => b.id === req.branchId || b.name.trim().toLowerCase() === (req.branchName || '').trim().toLowerCase()
    );
    if (!targetBranch && req.branchName) {
      targetBranch = effectiveBranches.find(
        (b) => cleanBranchName(b.name).toLowerCase() === cleanBranchName(req.branchName).toLowerCase()
      );
    }
    if (targetBranch) {
      setSelectedBranchId(targetBranch.id);
    }

    // 2. Set Req No
    setReqNo(req.reqNo || '');

    // 3. Set discount if provided
    if (req.discountPercent) {
      setDiscountPercent(req.discountPercent);
    }

    // 4. Map requisition line items to FactoryImportLine with intelligent color identification (e.g. 10+8+2+5 -> 10 Red, 8 Black, 2 Yellow, 5 Green)
    if (Array.isArray(req.lines) && req.lines.length > 0) {
      const newLines: FactoryImportLine[] = req.lines.map((rl, idx) => {
        const identifiedColors = identifyColors(rl);
        let qty = Number(rl.approvedQty !== undefined && rl.approvedQty !== null ? rl.approvedQty : rl.requestedQty) || 0;
        if (qty === 0 && identifiedColors.isIdentified && identifiedColors.total > 0) {
          qty = identifiedColors.total;
        }

        const matchedItem = items.find(
          (i) => (rl.itemId && i.id === rl.itemId) || (rl.itemCode && i.code === rl.itemCode) || (i.name.trim().toLowerCase() === rl.itemName.trim().toLowerCase())
        );

        const rate = Number(rl.rate) || (matchedItem ? matchedItem.rate : 0);
        const amount = Number(rl.amount) || Math.round(qty * rate);

        return {
          id: `line-req-${Date.now()}-${idx}`,
          itemId: matchedItem?.id || rl.itemId || '',
          itemCode: matchedItem?.code || rl.itemCode || '',
          itemName: matchedItem?.name || rl.itemName,
          sizeSpec: matchedItem?.sizeSpec || rl.sizeSpec || '',
          unit: matchedItem?.unit || rl.unit || 'Coils',
          category: matchedItem?.category || rl.category || '',
          quantity: qty,
          rate: rate,
          amount: amount,
          branchId: targetBranch?.id || selectedBranchId,
          branchName: targetBranch?.name || '',
          red: identifiedColors.red > 0 ? identifiedColors.red : (rl.red ? Number(rl.red) : undefined),
          black: identifiedColors.black > 0 ? identifiedColors.black : (rl.black ? Number(rl.black) : undefined),
          yellow: identifiedColors.yellow > 0 ? identifiedColors.yellow : (rl.yellow ? Number(rl.yellow) : undefined),
          green: identifiedColors.green > 0 ? identifiedColors.green : (rl.green ? Number(rl.green) : undefined),
          blue: identifiedColors.blue > 0 ? identifiedColors.blue : (rl.blue ? Number(rl.blue) : undefined),
          others: identifiedColors.others > 0 ? identifiedColors.others : (rl.others ? Number(rl.others) : undefined),
          remarks: rl.remarks || ''
        };
      });

      setLines(newLines.length > 0 ? newLines : [
        {
          id: `line-${Date.now()}-1`,
          itemId: '',
          itemCode: '',
          itemName: '',
          sizeSpec: '',
          unit: 'Coils',
          category: '',
          quantity: 0,
          rate: 0,
          amount: 0
        }
      ]);
    }

    // 5. Remarks & metadata tracking
    const partyInfo = req.partyName ? `Party: ${req.partyName}` : '';
    const spInfo = req.marketingPersonName ? `Marketing: ${req.marketingPersonName}` : '';
    const scInfo = req.branchName ? `Center: ${req.branchName}` : '';
    const metaParts = [scInfo, partyInfo, spInfo].filter(Boolean).join(' | ');
    setRemarks(`Converted from Sales Center Requisition #${req.reqNo}${metaParts ? ` (${metaParts})` : ''}`);
    setConvertedFromReqId(req.id);
    setSelectedPreviewRequisition(null);
    setShowRequisitionListModal(false);
    setSubTab('new_challan');

    showToast('success', `✓ Requisition #${req.reqNo} (${req.branchName || 'Sales Center'}) converted with color identification! Review lines and click Save Challan.`);
  };

  // Quick plus notation color input handler: e.g. "10+8+2+5" -> 10 Red, 8 Black, 2 Yellow, 5 Green
  const handlePlusColorInput = (lineId: string, formulaStr: string) => {
    if (!formulaStr || !formulaStr.trim()) return;
    const identified = identifyColors(formulaStr);
    if (identified.isIdentified && identified.total > 0) {
      setLines((prev) =>
        prev.map((l) => {
          if (l.id === lineId) {
            const qty = identified.total;
            const amt = Math.round(qty * (l.rate || 0));
            return {
              ...l,
              quantity: qty,
              amount: amt,
              red: identified.red > 0 ? identified.red : undefined,
              black: identified.black > 0 ? identified.black : undefined,
              yellow: identified.yellow > 0 ? identified.yellow : undefined,
              green: identified.green > 0 ? identified.green : undefined,
              blue: identified.blue > 0 ? identified.blue : undefined,
              others: identified.others > 0 ? identified.others : undefined
            };
          }
          return l;
        })
      );
      showToast('success', `✓ Identified ${formulaStr}: ${formatColorText(identified)} (Total: ${identified.total} Coils)`);
    }
  };

  const handleFactoryImportFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsParsingFile(true);
      showToast('info', 'Extracting factory import document using AI...');

      const aiRes = await parseDocumentWithAI(file, {
        mode: 'factory',
        knownItems: items
      });

      const parsed = aiRes.data;
      if (!parsed || !Array.isArray(parsed.lines) || parsed.lines.length === 0) {
        showToast('error', aiRes.error || 'No items detected in the uploaded factory document. Please upload an Excel, PDF, or clear JPEG/JPG/PNG image.');
        return;
      }

      if (parsed.orderNumber || parsed.reqNo) setReqNo(parsed.orderNumber || parsed.reqNo);
      if (parsed.challanNo || parsed.billNo) setChallanNo(parsed.challanNo || parsed.billNo);
      if (parsed.date || parsed.challanDate) setDate(formatDateDDMMYY(parsed.date || parsed.challanDate) || parsed.date || parsed.challanDate);
      if (parsed.carNumber || parsed.vehicleNo) setCarNumber(parsed.carNumber || parsed.vehicleNo);
      if (parsed.driverName) setDriverName(parsed.driverName);
      if (parsed.driverPhone) setDriverPhone(parsed.driverPhone);
      if (parsed.discountPercent && Number(parsed.discountPercent) > 0) {
        setDiscountPercent(Number(parsed.discountPercent));
      }
      if (parsed.remarks) setRemarks(parsed.remarks);
      if (parsed.partyName) {
        setRemarks((prev) => (prev ? `${prev} | Party: ${parsed.partyName}` : `Party: ${parsed.partyName}`));
      }
      if (parsed.address) {
        setRemarks((prev) => (prev ? `${prev} | Address: ${parsed.address}` : `Address: ${parsed.address}`));
      }

      if (Array.isArray(parsed.lines) && parsed.lines.length > 0) {
        const filteredRawLines = parsed.lines.filter((item: any) => {
          const rawName = (item.itemDescription || item.itemName || '').trim().toLowerCase();
          if (!rawName) return false;
          if (
            rawName.includes('description of goods') ||
            rawName.includes('particulars') ||
            rawName.includes('sl. no') ||
            rawName.includes('sl no') ||
            rawName.includes('total coils') ||
            rawName.includes('grand total') ||
            rawName.includes('sub total') ||
            rawName.includes('subtotal') ||
            rawName.includes('total amount') ||
            rawName.includes('in words') ||
            rawName.startsWith('total ') ||
            rawName === 'total'
          ) {
            return false;
          }
          return true;
        });

        const parsedLines: FactoryImportLine[] = [];
        const matchResults: ItemMatchResult[] = [];
        const uploadProblems: Array<{ item: string; problem: string; fix: string }> = [];

        filteredRawLines.forEach((item: any, idx: number) => {
          let rawCode = (item.itemCode || '').trim();
          let rawName = (item.itemDescription || item.itemName || '').trim();
          let qty = Number(item.coilQty) || Number(item.quantity) || Number(item.qty) || 0;
          let qtyWasMissing = Boolean(item.missingQty);

          if (qty === 0 && rawName) {
            const matchQty = rawName.match(/(?:-|\s+|,|\()?(?:qty|quantity|coils?|pcs|box|nos)?[:\s]*(\d+)\s*(?:coils?|pcs|box|nos)?\)?$/i);
            if (matchQty && matchQty[1]) {
              const num = parseInt(matchQty[1], 10);
              if (num > 0 && num < 100000) {
                qty = num;
                qtyWasMissing = false;
                rawName = rawName.replace(matchQty[0], '').trim();
              }
            }
          }

          // Keep ALL item names from Excel — if quantity is 0 or missing, default to 1 and notify user
          if (qty <= 0) {
            qtyWasMissing = true;
            qty = 1;
          }

          const rawRate = Number(item.rate) || 0;
          const rawAmt = Number(item.amount) || (rawRate > 0 && qty > 0 ? rawRate * qty : 0);

          // 70% Name Match & 100% Rate Match Engine
          const matchResult = matchImportedItemWithStored(
            rawName,
            rawRate,
            qty,
            items,
            item.unit,
            rawAmt
          );
          matchResults.push(matchResult);

          const matchedStored = matchResult.matchedStoredItem || matchResult.suggestedStoredItem;
          const finalName = matchResult.shouldUseStoredName
            ? matchResult.finalItemDescription
            : rawName;

          let unit = matchResult.finalUnit || item.unit || matchedStored?.unit;
          const isSpecial =
            Boolean(matchedStored?.isSpecialItem) ||
            matchedStored?.unit === 'Bobin' ||
            unit === 'Bobin' ||
            /\bbobin\b|\b500\s*m\s*length\b/i.test(rawName) ||
            /\bbobin\b|\b500\s*m\s*length\b/i.test(finalName);

          let finalQty = matchResult.importedQty || qty;
          if (isSpecial) {
            unit = matchedStored?.unit || 'Bobin';
          } else if (!unit || /^coils?$/i.test(unit)) {
            unit = 'Coils';
          }

          const finalRate = matchResult.finalRate;
          const finalAmt = matchResult.importedAmount || Math.round(finalQty * finalRate);

          const identifiedFileColors = identifyColors(item);
          const aiRed = Number(item.red) || identifiedFileColors.red || 0;
          const aiBlack = Number(item.black) || identifiedFileColors.black || 0;
          const aiYellow = Number(item.yellow) || identifiedFileColors.yellow || 0;
          const aiGreen = Number(item.green) || identifiedFileColors.green || 0;
          const aiBlue = Number(item.blue) || identifiedFileColors.blue || 0;
          const aiOthers = Number(item.others) || identifiedFileColors.others || 0;
          const aiColorSum = aiRed + aiBlack + aiYellow + aiGreen + aiBlue + aiOthers;
          if ((finalQty === 0 || qtyWasMissing) && aiColorSum > 0) {
            finalQty = aiColorSum;
            qtyWasMissing = false;
          }

          const rowIssues: string[] = [];
          const rowFixes: string[] = [];
          if (qtyWasMissing) {
            rowIssues.push('Quantity was missing or 0 in document (set to 1 temporarily).');
            rowFixes.push('Enter the exact Import Quantity in the Quantity column.');
          }
          if (!matchedStored) {
            rowIssues.push('Item name did not match any stored catalog item.');
            rowFixes.push('Click the item box on this row to select the matching catalog item, or add this item in Item List.');
          } else if (finalRate <= 0) {
            rowIssues.push('Rate is 0 Tk.');
            rowFixes.push('Update the item price in Item List.');
          }

          if (rowIssues.length > 0) {
            uploadProblems.push({
              item: `Row ${idx + 1}: ${rawName}`,
              problem: rowIssues.join(' '),
              fix: rowFixes.join(' ')
            });
          }

          parsedLines.push({
            id: `line-import-${Date.now()}-${idx}`,
            itemId: matchResult.shouldUseStoredName ? matchResult.finalItemId : (matchedStored?.id || ''),
            itemCode: matchedStored?.code || rawCode || '',
            itemName: finalName,
            sizeSpec: matchResult.finalSizeSpec || matchedStored?.sizeSpec || item.sizeSpec || '',
            unit: unit,
            category: matchedStored?.category || item.category || '',
            quantity: finalQty,
            rate: finalRate,
            amount: finalAmt > 0 ? finalAmt : Math.round(finalQty * finalRate),
            red: aiRed > 0 ? aiRed : undefined,
            black: aiBlack > 0 ? aiBlack : undefined,
            yellow: aiYellow > 0 ? aiYellow : undefined,
            green: aiGreen > 0 ? aiGreen : undefined,
            blue: aiBlue > 0 ? aiBlue : undefined,
            others: aiOthers > 0 ? aiOthers : undefined
          });
        });

        if (uploadProblems.length > 0) {
          setExcelImportAddedCount(parsedLines.length);
          setExcelImportProblems(uploadProblems);
          setExcelImportDiagOpen(true);
        }

        const autoMatchedCount = matchResults.filter((r) => r.shouldUseStoredName).length;
        const conflictsCount = matchResults.filter((r) => r.hasConflict).length;

        if (parsedLines.length > 0) {
          setLines(parsedLines);
        } else {
          setLines([
            {
              id: `line-${Date.now()}-1`,
              itemId: '',
              itemCode: '',
              itemName: '',
              sizeSpec: '',
              unit: 'Coils',
              category: '',
              quantity: 0,
              rate: 0,
              amount: 0,
            }
          ]);
        }

        if (conflictsCount > 0) {
          setImportConflictData({
            isOpen: true,
            results: matchResults
          });
          showToast('info', `⚠️ Import Notification: ${conflictsCount} item conflict(s) detected (e.g. rate mismatch). Please review.`);
        } else if (autoMatchedCount > 0) {
          showToast('success', `✓ ${autoMatchedCount} item(s) mapped to stored catalog (≥70% name & 100% rate match).`);
        } else {
          showToast('success', 'Factory import document auto-extracted & populated successfully!');
        }
      }
    } catch (err: any) {
      console.warn('Notice importing factory challan file:', err?.message || err);
      showToast('info', err?.message ? `Notice: ${err.message}` : 'Could not parse document. You can upload an Excel (.xlsx) file or enter details manually.');
    } finally {
      setIsParsingFile(false);
      if (e.target) e.target.value = '';
    }
  };

  // --- HANDLERS FOR LINE ITEMS ---
  const handleResetLines = () => {
    setDiscountPercent(0);
    setDiscountAmount(0);
    setLines([
      {
        id: `line-${Date.now()}-1`,
        itemId: '',
        itemCode: '',
        itemName: '',
        sizeSpec: '',
        unit: 'Coils',
        category: '',
        quantity: 0,
        rate: 0,
        amount: 0
      }
    ]);
    showToast('info', 'Imported Goods Breakdown List has been reset.');
  };

  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: `line-${Date.now()}-${prev.length + 1}`,
        itemId: '',
        itemCode: '',
        itemName: '',
        sizeSpec: '',
        unit: 'Coils',
        category: '',
        quantity: 0,
        rate: 0,
        amount: 0
      }
    ]);
  };

  const handleRemoveLine = (id: string) => {
    if (lines.length <= 1) {
      setLines([
        {
          id: `line-${Date.now()}-1`,
          itemId: '',
          itemCode: '',
          itemName: '',
          sizeSpec: '',
          unit: 'Coils',
          category: '',
          quantity: 0,
          rate: 0,
          amount: 0
        }
      ]);
      showToast('info', 'Imported item breakdown cleared.');
      return;
    }
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const handleSelectItemForLine = (lineId: string, itemCode: string) => {
    if (!itemCode) {
      setLines((prev) =>
        prev.map((line) => {
          if (line.id === lineId) {
            return {
              ...line,
              itemId: '',
              itemCode: '',
              itemName: '',
              sizeSpec: '',
              unit: 'Coils',
              category: '',
              rate: 0,
              amount: 0
            };
          }
          return line;
        })
      );
      return;
    }

    const foundItem = items.find((i) => i.code === itemCode);
    if (!foundItem) return;

    setLines((prev) =>
      prev.map((line) => {
        if (line.id === lineId) {
          const qty = line.quantity || 0;
          const rate = foundItem.rate || 0;
          return {
            ...line,
            itemId: foundItem.id,
            itemCode: foundItem.code,
            itemName: foundItem.name,
            sizeSpec: foundItem.sizeSpec || '',
            unit: foundItem.unit || 'Coils',
            category: foundItem.category || '',
            rate,
            amount: qty * rate
          };
        }
        return line;
      })
    );
  };

  const handleQuantityChange = (lineId: string, newQty: number) => {
    const validQty = Math.max(0, newQty);
    setLines((prev) =>
      prev.map((line) => {
        if (line.id === lineId) {
          return {
            ...line,
            quantity: validQty,
            amount: validQty * line.rate
          };
        }
        return line;
      })
    );
  };

  const handleRateChange = (lineId: string, newRate: number) => {
    const validRate = Math.max(0, newRate);
    setLines((prev) =>
      prev.map((line) => {
        if (line.id === lineId) {
          return {
            ...line,
            rate: validRate,
            amount: line.quantity * validRate
          };
        }
        return line;
      })
    );
  };

  // Computations
  const totalQuantity = lines.reduce((acc, cur) => acc + (cur.quantity || 0), 0);
  const totalAmount = lines.reduce((acc, cur) => acc + (cur.amount || 0), 0);
  const effectiveDiscountAmount = discountAmount > 0
    ? discountAmount
    : (discountPercent > 0 ? Math.round((totalAmount * discountPercent) / 100) : 0);
  const netShipmentAmount = Math.max(0, Math.round(totalAmount - effectiveDiscountAmount));

  // --- EDIT CHALLAN IN FORM ---
  const handleEditChallan = (challan: FactoryImportChallan) => {
    setEditingChallanId(challan.id);
    setSelectedBranchId(challan.branchId || effectiveBranches[0]?.id || 'branch-1');
    setReqNo(challan.reqNo || '');
    setChallanNo(challan.challanNo);
    setDate(formatDateDDMMYY(challan.date) || challan.date || getTodayDDMMYY());
    setCarNumber(challan.carNumber || '');
    setDriverName(challan.driverName || '');
    setDriverPhone(challan.driverPhone || '');
    setRemarks(challan.remarks || '');
    setDiscountPercent(challan.discountPercent || 0);
    setDiscountAmount(challan.discountAmount || 0);

    const loadedLines: FactoryImportLine[] = (challan.lines || [])
      .filter((line) => (line.itemName || '').trim() || (Number(line.quantity) || 0) > 0)
      .map((l, idx) => ({
        id: l.id || `line-${Date.now()}-${idx}`,
        itemId: l.itemId || '',
        itemCode: l.itemCode || '',
        itemName: l.itemName || '',
        sizeSpec: l.sizeSpec || '',
        unit: l.unit || 'Coils',
        category: l.category || '',
        quantity: Number(l.quantity) || 0,
        rate: Number(l.rate) || 0,
        amount: Number(l.amount) || (Number(l.quantity) || 0) * (Number(l.rate) || 0),
        red: l.red || '',
        black: l.black || '',
        yellow: l.yellow || '',
        green: l.green || '',
        blue: l.blue || '',
        others: l.others || '',
        remarks: l.remarks || ''
      }));

    if (loadedLines.length === 0) {
      loadedLines.push({
        id: `line-${Date.now()}-1`,
        itemId: '',
        itemCode: '',
        itemName: '',
        sizeSpec: '',
        unit: 'Coils',
        category: '',
        quantity: 0,
        rate: 0,
        amount: 0
      });
    }

    setLines(loadedLines);

    const queries: { [lineId: string]: string } = {};
    loadedLines.forEach((l) => {
      queries[l.id] = l.itemName;
    });
    setLineSearchQueries(queries);

    setSelectedChallanForModal(null);
    setSubTab('new_challan');
    showToast('info', `Editing Factory Import Challan #${challan.challanNo}`);
  };

  const handleCancelEdit = () => {
    setEditingChallanId(null);
    const nextNo = generateNextChallanNo(factoryImports);
    setReqNo('');
    setChallanNo(nextNo);
    setDate(getTodayDDMMYY());
    setCarNumber('');
    setDriverName('');
    setDriverPhone('');
    setRemarks('');
    setDiscountPercent(0);
    setDiscountAmount(0);
    setLines([
      {
        id: `line-${Date.now()}-1`,
        itemId: '',
        itemCode: '',
        itemName: '',
        sizeSpec: '',
        unit: 'Coils',
        category: '',
        quantity: 0,
        rate: 0,
        amount: 0
      }
    ]);
    setLineSearchQueries({});
    showToast('info', 'Edit mode cancelled. Switched to new Challan mode.');
  };

  const exportToExcel = () => {
    try {
      const rows: any[] = [];
      factoryImports.forEach((challan) => {
        (challan.items || []).forEach((item) => {
          rows.push({
            'Challan No': challan.challanNo,
            'Import Date': challan.date,
            'Vehicle No': challan.carNumber || '-',
            'Driver': challan.driverName || '-',
            'Item Code': item.code || '-',
            'Item Name': item.name,
            'Size / Spec': item.sizeSpec || '-',
            'Category': item.category || '-',
            'Quantity (Coils)': item.quantity,
            'Rate (৳)': item.rate,
            'Total Amount (৳)': (Number(item.quantity) || 0) * (Number(item.rate) || 0),
            'Remarks': challan.remarks || ''
          });
        });
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Factory Imports');
      XLSX.writeFile(workbook, `Factory_Imports_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      console.error('Failed to export to excel:', err);
      showToast('error', 'Failed to export to excel. Please try again.');
    }
  };

  // --- SAVE & IMPORT CHALLAN TO STORE ---
  const handleSaveChallan = (shouldPrint = false) => {
    if (!challanNo.trim()) {
      showToast('error', 'Please enter a valid Challan Number.');
      return;
    }
    // Driver name & Driver mobile are optional ("Driver Name & Driver Mobile not must filling box")
    if (lines.length === 0 || totalQuantity <= 0) {
      showToast('error', 'Please add at least one item with a quantity greater than 0.');
      return;
    }

    const cleanLines = lines.filter((l) => l.quantity > 0 && l.itemCode);
    if (cleanLines.length === 0) {
      showToast('error', 'No valid item lines with quantity > 0 found.');
      return;
    }

    if (selectedBranchId === 'ALL') {
      showToast('error', 'Please select a specific Destination Sales Center before saving this challan.');
      return;
    }
    const targetBranch = effectiveBranches.find((b) => b.id === selectedBranchId) || effectiveBranches[0];
    const targetBranchId = targetBranch?.id || selectedBranchId || 'branch-1';
    const targetBranchName = targetBranch?.name || 'Madhupur Sales Center / Showroom';

    const branchAttributedLines = cleanLines.map((l) => ({
      ...l,
      branchId: targetBranchId,
      branchName: targetBranchName
    }));

    const effectiveDate = formatDateDDMMYY(date) || date || getTodayDDMMYY();

    if (isEditing && editingChallanId) {
      // --- UPDATE EXISTING CHALLAN ---
      const existingChallan = factoryImports.find((c) => c.id === editingChallanId);
      const updatedChallan: FactoryImportChallan = {
        id: editingChallanId,
        savedAt: existingChallan?.savedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        reqNo: reqNo.trim(),
        challanNo: challanNo.trim(),
        date: effectiveDate,
        branchId: targetBranchId,
        branchName: targetBranchName,
        carNumber: carNumber.trim(),
        driverName: driverName.trim(),
        driverPhone: driverPhone.trim(),
        remarks: remarks.trim(),
        lines: branchAttributedLines,
        totalQuantity,
        totalAmount,
        discountPercent,
        discountAmount: effectiveDiscountAmount,
        netAmount: netShipmentAmount
      };

      // Sync inventory addedStock delta
      setItems((prevItems) => {
        const updatedMap = new Map<string, Item>();
        prevItems.forEach((item) => updatedMap.set(item.id, { ...item }));

        // Deduct old quantities
        if (existingChallan && Array.isArray(existingChallan.lines)) {
          existingChallan.lines.forEach((oldLine) => {
            const item =
              updatedMap.get(oldLine.itemId || '') ||
              prevItems.find((i) => i.name === oldLine.itemName || i.code === oldLine.itemCode);
            if (item) {
              const cur = item.addedStock || 0;
              updatedMap.set(item.id, {
                ...item,
                addedStock: Math.max(0, cur - oldLine.quantity)
              });
            }
          });
        }

        // Add new quantities
        cleanLines.forEach((newLine) => {
          const item =
            updatedMap.get(newLine.itemId || '') ||
            prevItems.find((i) => i.name === newLine.itemName || i.code === newLine.itemCode);
          if (item) {
            const cur = item.addedStock || 0;
            updatedMap.set(item.id, {
              ...item,
              addedStock: cur + newLine.quantity
            });
          }
        });

        return Array.from(updatedMap.values());
      });

      // Update in history
      setFactoryImports((prev) => prev.map((c) => (c.id === editingChallanId ? updatedChallan : c)));

      showToast(
        'success',
        `Factory Import Challan #${challanNo} updated successfully! Stock recalculated.`
      );

      if (shouldPrint) {
        setSelectedChallanForModal(updatedChallan);
      }

      // Reset form and exit edit mode
      setEditingChallanId(null);
      const nextNo = generateNextChallanNo(factoryImports.map((c) => (c.id === editingChallanId ? updatedChallan : c)));
      setReqNo('');
      setChallanNo(nextNo);
      setDate(getTodayDDMMYY());
      setCarNumber('');
      setDriverName('');
      setDriverPhone('');
      setRemarks('');
      setDiscountPercent(0);
      setDiscountAmount(0);
      setLines([
        {
          id: `line-${Date.now()}-1`,
          itemId: '',
          itemCode: '',
          itemName: '',
          sizeSpec: '',
          unit: 'Coils',
          category: '',
          quantity: 0,
          rate: 0,
          amount: 0
        }
      ]);
      setLineSearchQueries({});
      setSubTab('history');
      return;
    }

    // 1. Create Factory Import Challan Record
    const nowIso = new Date().toISOString();
    const newChallan: FactoryImportChallan = {
      id: `factory-import-${Date.now()}`,
      savedAt: nowIso,
      updatedAt: nowIso,
      reqNo: reqNo.trim(),
      challanNo: challanNo.trim(),
      date: effectiveDate,
      branchId: targetBranchId,
      branchName: targetBranchName,
      carNumber: carNumber.trim(),
      driverName: driverName.trim(),
      driverPhone: driverPhone.trim(),
      remarks: remarks.trim(),
      lines: branchAttributedLines,
      totalQuantity,
      totalAmount,
      discountPercent,
      discountAmount: effectiveDiscountAmount,
      netAmount: netShipmentAmount
    };

    // 2. Add imported stock to items state
    setItems((prevItems) => {
      const updatedMap = new Map<string, Item>();
      prevItems.forEach((item) => updatedMap.set(item.id, { ...item }));

      cleanLines.forEach((impLine) => {
        const item = updatedMap.get(impLine.itemId) || prevItems.find((i) => i.name === impLine.itemName);
        if (item) {
          const currentAdded = item.addedStock || 0;
          updatedMap.set(item.id, {
            ...item,
            addedStock: currentAdded + impLine.quantity
          });
        }
      });

      return Array.from(updatedMap.values());
    });

    // 3. Save to history
    setFactoryImports((prev) => [newChallan, ...prev]);

    // 4. Synchronize matched/converted Requisition to 'factory_received' status
    const matchedReq = effectiveRequisitions.find(
      (r) =>
        (convertedFromReqId && r.id === convertedFromReqId) ||
        (reqNo.trim() && r.reqNo && r.reqNo.trim().toLowerCase() === reqNo.trim().toLowerCase())
    );

    if (matchedReq) {
      const updatedReqs = effectiveRequisitions.map((r) => {
        if (r.id === matchedReq.id) {
          const logEntry: AuditLogEntry = {
            id: `audit-${Date.now()}`,
            timestamp: new Date().toISOString(),
            actorName: 'Store Inward / Factory Import',
            actorRole: 'factory',
            action: 'Imported to Store',
            fromStage: r.stage,
            toStage: 'factory_received',
            comments: `Received & converted into Factory Import Challan #${challanNo.trim()} (${targetBranchName})`
          };
          return {
            ...r,
            stage: 'factory_received' as const,
            factoryStatus: 'received' as const,
            factoryChallanNo: challanNo.trim(),
            factoryDispatchDate: date || new Date().toISOString().split('T')[0],
            updatedAt: new Date().toISOString(),
            auditLogs: [...(r.auditLogs || []), logEntry]
          };
        }
        return r;
      });

      setEffectiveRequisitions(updatedReqs);
      try {
        localStorage.setItem('polycables_requisitions', JSON.stringify(updatedReqs));
      } catch (e) {
        console.error(e);
      }
    }

    setConvertedFromReqId(null);

    showToast(
      'success',
      `Factory Import Challan #${challanNo} saved successfully! ${totalQuantity} Coils added to Store Inventory.`
    );

    // If print requested, open printable modal (does not close page)
    if (shouldPrint) {
      setSelectedChallanForModal(newChallan);
    }

    // Reset Form for next entry
    const nextNo = generateNextChallanNo([newChallan, ...factoryImports]);
    setReqNo('');
    setChallanNo(nextNo);
    setDate(getTodayDDMMYY());
    setCarNumber('');
    setDriverName('');
    setDriverPhone('');
    setRemarks('');
    setDiscountPercent(0);
    setDiscountAmount(0);

    setLines([
      {
        id: `line-${Date.now()}-1`,
        itemId: '',
        itemCode: '',
        itemName: '',
        sizeSpec: '',
        unit: 'Coils',
        category: '',
        quantity: 0,
        rate: 0,
        amount: 0
      }
    ]);
    setLineSearchQueries({});
  };

  // Delete History Record - Trigger Modal
  const handleDeleteChallan = (id: string, challanNum: string) => {
    setDeleteConfirmChallan({ id, challanNo: challanNum });
  };

  const executeConfirmDeleteChallan = () => {
    if (!deleteConfirmChallan) return;
    if (!checkCanTakeEntry('Delete Factory Import', (msg) => showToast('error', msg))) return;
    const { id, challanNo: challanNum } = deleteConfirmChallan;

    recordDeletedEntityId(id);
    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ ids: [id], type: 'factory_import' })
    }).catch(() => {});

    setFactoryImports((prev) => {
      const next = prev.filter((c) => c.id !== id);
      try { localStorage.setItem('polycables_factory_imports', JSON.stringify(next)); } catch {}
      return next;
    });
    if (selectedChallanForModal?.id === id) {
      setSelectedChallanForModal(null);
    }
    showToast('info', `Import Challan #${challanNum} removed from history.`);
    setDeleteConfirmChallan(null);
  };

  // Filtered History List
  const filteredHistory = factoryImports.filter((c) => {
    if (historyBranchFilter !== 'ALL') {
      const isBranchMatch =
        c.branchId === historyBranchFilter ||
        (!c.branchId && (historyBranchFilter === 'branch-1' || historyBranchFilter === 'branch-main'));
      if (!isBranchMatch) return false;
    }
    if (!historySearch.trim()) return true;
    const term = historySearch.toLowerCase().trim();
    const matchItems = (c.lines || []).some((l) => matchesFlexibleSearch(l.itemName || '', term));
    return (
      c.challanNo.toLowerCase().includes(term) ||
      (c.branchName && c.branchName.toLowerCase().includes(term)) ||
      (c.carNumber && c.carNumber.toLowerCase().includes(term)) ||
      (c.driverName && c.driverName.toLowerCase().includes(term)) ||
      (c.driverPhone && c.driverPhone.toLowerCase().includes(term)) ||
      (c.reqNo && c.reqNo.toLowerCase().includes(term)) ||
      c.date.includes(term) ||
      matchItems
    );
  });

  const [historySortField, setHistorySortField] = useState<'date' | 'reqNo' | 'challanNo' | 'branchName' | 'driverName' | 'items' | 'quantity' | 'amount'>('date');
  const [historySortDirection, setHistorySortDirection] = useState<'asc' | 'desc'>('desc');

  const handleHistorySort = (field: 'date' | 'reqNo' | 'challanNo' | 'branchName' | 'driverName' | 'items' | 'quantity' | 'amount') => {
    if (historySortField === field) {
      setHistorySortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setHistorySortField(field);
      setHistorySortDirection(field === 'date' ? 'desc' : 'asc');
    }
  };

  const sortedHistory = useMemo(() => {
    return [...filteredHistory].sort((a, b) => {
      let cmp = 0;
      switch (historySortField) {
        case 'date': {
          const aDate = parseDateToISO(a.date) || a.date;
          const bDate = parseDateToISO(b.date) || b.date;
          cmp = aDate.localeCompare(bDate);
          break;
        }
        case 'reqNo':
          cmp = (a.reqNo || '').localeCompare(b.reqNo || '', undefined, { numeric: true });
          break;
        case 'challanNo':
          cmp = (a.challanNo || '').localeCompare(b.challanNo || '', undefined, { numeric: true });
          break;
        case 'branchName':
          cmp = (a.branchName || '').localeCompare(b.branchName || '');
          break;
        case 'driverName':
          cmp = (a.driverName || '').localeCompare(b.driverName || '');
          break;
        case 'items':
          cmp = (a.lines?.length || 0) - (b.lines?.length || 0);
          break;
        case 'quantity':
          cmp = (a.totalQuantity || 0) - (b.totalQuantity || 0);
          break;
        case 'amount':
          cmp = (a.netAmount ?? a.totalAmount ?? 0) - (b.netAmount ?? b.totalAmount ?? 0);
          break;
        default:
          cmp = 0;
      }
      return historySortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filteredHistory, historySortField, historySortDirection]);

  const renderSortIndicator = (field: typeof historySortField) => {
    if (historySortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 inline ml-1 shrink-0" />;
    }
    return historySortDirection === 'asc' ? (
      <ChevronUp className="w-3.5 h-3.5 text-emerald-700 font-extrabold inline ml-1 shrink-0" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 text-emerald-700 font-extrabold inline ml-1 shrink-0" />
    );
  };

  return (
    <div className={hideInternalTabs ? "cyber-glass-card rounded-2xl overflow-hidden font-sans space-y-0 text-white" : "space-y-4 font-sans text-white"}>
      {/* Toast Notification Banner */}
      {notification && (
        <div
          className={`p-3.5 shadow-md border flex items-center justify-between text-xs font-bold transition-all animate-fade-in ${
            hideInternalTabs ? 'rounded-none border-x-0' : 'rounded-xl'
          } ${
            notification.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40'
              : notification.type === 'error'
              ? 'bg-rose-950/90 text-rose-200 border-rose-500/40'
              : 'bg-[#0c2638]/95 text-cyan-100 border-cyan-500/35'
          }`}
        >
          <div className="flex items-center space-x-2">
            {notification.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            {notification.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-400" />}
            {notification.type === 'info' && <Boxes className="w-4 h-4 text-cyan-400" />}
            <span>{notification.text}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-300 hover:text-white cursor-pointer ml-4"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Unified Title Bar when hideInternalTabs is true (Matches Master Item Directory & other subtabs) */}
      {hideInternalTabs ? (
        <div className="cyber-glass-header text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap lg:flex-nowrap min-h-[52px]">
          <div className="flex items-center space-x-3 shrink-0">
            <div className={subTab === 'new_challan' ? 'bg-cyan-500/20 border border-cyan-400/40 p-2 rounded-lg text-cyan-300' : 'bg-indigo-500/20 border border-indigo-400/40 p-2 rounded-lg text-indigo-300'}>
              {subTab === 'new_challan' ? <Truck className="w-4 h-4" /> : <History className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-white whitespace-nowrap">
                {subTab === 'new_challan'
                  ? isEditing
                    ? `Edit Factory Import Challan #${challanNo}`
                    : 'Import from Factory'
                  : `Factory Import History (${factoryImports.length})`}
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-2 flex-wrap gap-1.5 text-xs">
            {subTab === 'new_challan' ? (
              isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleSaveChallan(false)}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1.5 rounded-lg font-black flex items-center space-x-1 shadow-xs transition-all cursor-pointer whitespace-nowrap"
                    title="Update factory import challan"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Update Challan</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveChallan(true)}
                    className="bg-[#081b28] hover:bg-[#0e2a3d] text-amber-300 border border-amber-400/50 px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1 shadow-xs transition-all cursor-pointer whitespace-nowrap"
                    title="Update & Print Receiving Voucher"
                  >
                    <Printer className="w-3.5 h-3.5 text-amber-300" />
                    <span>Update & Print</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 px-2.5 py-1.5 rounded-lg font-bold flex items-center space-x-1 shadow-xs transition-colors cursor-pointer whitespace-nowrap"
                    title="Cancel edit mode"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel Edit</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setShowRequisitionListModal(true)}
                    className="bg-indigo-600/80 hover:bg-indigo-500 border border-indigo-400/40 text-white px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 shadow-xs transition-all cursor-pointer whitespace-nowrap"
                    title="View Sales Center Requisitions and convert them to Factory Import"
                  >
                    <Boxes className="w-3.5 h-3.5 text-indigo-200" />
                    <span>Requisitions ({salesCenterRequisitions.length})</span>
                    {salesCenterRequisitions.filter((r) => r.stage !== 'factory_received' && r.factoryStatus !== 'received').length > 0 && (
                      <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-1.5 py-0.2 rounded-full ml-0.5">
                        {salesCenterRequisitions.filter((r) => r.stage !== 'factory_received' && r.factoryStatus !== 'received').length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isParsingFile}
                    className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/40 px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    title="Upload Factory Challan/Bill (PDF, Image, or Excel)"
                  >
                    {isParsingFile ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-300" />
                        <span>Extracting...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5 text-cyan-300" />
                        <span>Import Factory Bill</span>
                      </>
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,.pdf,.jpeg,.jpg,.png,image/jpeg,image/png,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={handleFactoryImportFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveChallan(false)}
                    className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-3 py-1.5 rounded-lg font-black flex items-center space-x-1 shadow-xs transition-all cursor-pointer whitespace-nowrap"
                    title="Save factory import challan"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Challan</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveChallan(true)}
                    className="bg-[#081b28] hover:bg-[#0e2a3d] text-emerald-300 border border-emerald-400/40 px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1 shadow-xs transition-all cursor-pointer whitespace-nowrap"
                    title="Save & Print Receiving Voucher"
                  >
                    <Printer className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Save & Print</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResetLines}
                    className="bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 border border-rose-500/40 px-2.5 py-1.5 rounded-lg font-bold flex items-center space-x-1 shadow-xs transition-colors cursor-pointer whitespace-nowrap"
                    title="Reset form and clear inputs"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>
                </>
              )
            ) : (
              <>
                <button
                  type="button"
                  onClick={exportToExcel}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3 py-1.5 rounded-lg font-black flex items-center space-x-1.5 shadow-xs transition-all cursor-pointer whitespace-nowrap"
                  title="Export all import records to Excel (.xlsx)"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export (.xlsx)</span>
                </button>
              </>
            )}

            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/30 rounded-lg transition-colors cursor-pointer"
                title="Go Back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 border border-rose-500/40 rounded-lg transition-colors cursor-pointer"
                title="Close View"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Standalone Top Controls & Navigation Bar */
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 cyber-glass-card p-2.5 sm:p-3 rounded-xl sm:overflow-x-auto no-print">
          {/* Left Side: Tabs */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSubTab('new_challan')}
              className={`px-3 py-1.5 rounded-lg font-extrabold text-xs flex items-center space-x-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                subTab === 'new_challan'
                  ? isEditing
                    ? 'bg-amber-500/25 text-amber-200 border border-amber-400/60 shadow-sm'
                    : 'bg-[#0e2d42] text-cyan-200 border border-cyan-400/60 shadow-sm'
                  : 'bg-[#081b28] text-slate-300 border border-cyan-500/20 hover:bg-[#0e2a3d]'
              }`}
            >
              {isEditing ? (
                <>
                  <Edit3 className="w-3.5 h-3.5 text-amber-300" />
                  <span>Edit Factory Import Challan</span>
                  <span className="bg-amber-500/30 text-amber-200 text-[10px] px-1.5 py-0.5 rounded font-mono">
                    #{challanNo}
                  </span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Create Factory Import Challan</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setSubTab('history')}
              className={`px-3 py-1.5 rounded-lg font-extrabold text-xs flex items-center space-x-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                subTab === 'history'
                  ? 'bg-[#0e2d42] text-cyan-200 border border-cyan-400/60 shadow-sm'
                  : 'bg-[#081b28] text-slate-300 border border-cyan-500/20 hover:bg-[#0e2a3d]'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-amber-300" />
              <span>Import History Log</span>
              <span className="bg-[#061520] text-amber-300 px-1.5 py-0.5 rounded text-[10px] font-mono border border-cyan-500/30">
                {factoryImports.length}
              </span>
            </button>
          </div>

          {/* Right Side: Action Buttons on the same line */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5">
            {subTab === 'new_challan' && (
              <>
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSaveChallan(false)}
                      className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1.5 rounded-lg font-black text-xs flex items-center space-x-1 shadow-sm transition-all cursor-pointer whitespace-nowrap shrink-0"
                      title="Update factory import challan"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Update Challan</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSaveChallan(true)}
                      className="bg-[#081b28] hover:bg-[#0e2a3d] text-amber-300 border border-amber-400/50 px-3 py-1.5 rounded-lg font-bold text-xs flex items-center space-x-1 shadow-sm transition-all cursor-pointer whitespace-nowrap shrink-0"
                      title="Update & Print Receiving Voucher"
                    >
                      <Printer className="w-3.5 h-3.5 text-amber-300" />
                      <span>Update & Print</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 px-2.5 py-1.5 rounded-lg font-bold text-xs flex items-center space-x-1 shadow-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      title="Cancel edit mode and return to new entry"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Cancel Edit</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowRequisitionListModal(true)}
                      className="bg-indigo-600/80 hover:bg-indigo-500 border border-indigo-400/40 text-white px-3 py-1.5 rounded-lg font-bold text-xs flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer whitespace-nowrap shrink-0"
                      title="View Showroom / Sales Center Requisitions and convert them to Factory Import"
                    >
                      <Boxes className="w-3.5 h-3.5 text-indigo-200" />
                      <span>Requisitions ({salesCenterRequisitions.length})</span>
                      {salesCenterRequisitions.filter((r) => r.stage !== 'factory_received' && r.factoryStatus !== 'received').length > 0 && (
                        <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-1.5 py-0.2 rounded-full ml-0.5">
                          {salesCenterRequisitions.filter((r) => r.stage !== 'factory_received' && r.factoryStatus !== 'received').length}
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isParsingFile}
                      className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/40 px-3 py-1.5 rounded-lg font-bold text-xs flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                      title="Upload Factory Challan/Bill (PDF, Image, or Excel) to auto-populate lines"
                    >
                      {isParsingFile ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-300" />
                          <span>Extracting...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-3.5 h-3.5 text-cyan-300" />
                          <span>Import Factory Bill</span>
                        </>
                      )}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv,.pdf,.jpeg,.jpg,.png,image/jpeg,image/png,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                      onChange={handleFactoryImportFileUpload}
                      className="hidden"
                    />

                    <button
                      type="button"
                      onClick={() => handleSaveChallan(false)}
                      className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-3 py-1.5 rounded-lg font-black text-xs flex items-center space-x-1 shadow-sm transition-all cursor-pointer whitespace-nowrap shrink-0"
                      title="Save factory import challan"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Challan</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSaveChallan(true)}
                      className="bg-[#081b28] hover:bg-[#0e2a3d] text-emerald-300 border border-emerald-400/40 px-3 py-1.5 rounded-lg font-bold text-xs flex items-center space-x-1 shadow-sm transition-all cursor-pointer whitespace-nowrap shrink-0"
                      title="Save & Print Receiving Voucher"
                    >
                      <Printer className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Save & Print</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleResetLines}
                      className="bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 border border-rose-500/40 px-2.5 py-1.5 rounded-lg font-bold text-xs flex items-center space-x-1 shadow-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      title="Reset form and clear inputs"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset</span>
                    </button>
                  </>
                )}
              </>
            )}

            {/* Back and Close buttons on the same line */}
            {(onBack || onClose) && (
              <div className="flex items-center space-x-1.5 pl-1.5 border-l border-cyan-500/25 ml-0.5 shrink-0">
                {onBack && (
                  <button
                    type="button"
                    onClick={onBack}
                    className="p-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/30 rounded-lg transition-colors cursor-pointer shrink-0"
                    title="Go Back"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}

                {onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1.5 bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 rounded-lg border border-rose-500/40 transition-colors cursor-pointer shrink-0"
                    title="Close View"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 1: NEW FACTORY IMPORT CHALLAN FORM (DOCUMENT PAD FORMAT) */}
      {subTab === 'new_challan' && (
        <div className={hideInternalTabs ? "p-6 sm:p-8 space-y-6 text-white print:bg-white print:text-black" : "cyber-glass-card rounded-2xl p-6 sm:p-8 space-y-6 text-white print:bg-white print:text-black"}>
          {/* Edit Mode Alert Banner */}
          {isEditing && (
            <div className="bg-amber-500/15 border-2 border-amber-400/50 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-amber-100 shadow-xs">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-amber-200 rounded-lg text-amber-900">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-wide flex items-center space-x-1.5">
                    <span>Editing Factory Import Challan</span>
                    <span className="bg-amber-800 text-white px-2 py-0.5 rounded font-mono text-[11px]">
                      #{challanNo}
                    </span>
                  </div>
                  <div className="text-[11px] text-amber-800 mt-0.5 font-medium">
                    Modify lines, vehicle, driver or challan details below. Saving will update the history record and automatically recalculate inventory stock.
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-3 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] border border-amber-400/50 text-amber-200 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs flex items-center space-x-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel Edit</span>
                </button>
              </div>
            </div>
          )}

          {/* View Heading */}
          <div className="flex items-center justify-between pb-2 border-b border-cyan-500/20">
            <div className="flex items-center space-x-2">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400"></div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                {isEditing ? `Editing Factory Import Voucher #${challanNo}` : 'Factory Import Entry & Receiving Details'}
              </h2>
            </div>
            <div className="text-xs font-mono text-cyan-200/75">
              {new Date().toLocaleDateString('en-GB')}
            </div>
          </div>

          {/* Sales Center Requisitions Section */}
          <div className="bg-[#071824]/85 text-white rounded-xl p-4 shadow-sm border border-cyan-500/25">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-2 border-b border-cyan-500/20">
              <div className="flex items-center space-x-2.5">
                <div className="p-1.5 bg-cyan-500/20 border border-cyan-400/40 rounded-lg text-cyan-300">
                  <Boxes className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-xs font-black uppercase tracking-wider text-cyan-100">
                      Showroom / Sales Center Requisitions
                    </h3>
                    <span className="bg-cyan-500/20 border border-cyan-400/35 text-cyan-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                      {salesCenterRequisitions.length} Total
                    </span>
                    {salesCenterRequisitions.filter((r) => r.stage !== 'factory_received' && r.factoryStatus !== 'received').length > 0 && (
                      <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full">
                        {salesCenterRequisitions.filter((r) => r.stage !== 'factory_received' && r.factoryStatus !== 'received').length} Pending Import
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowRequisitionListModal(true)}
                  className="px-3 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/35 text-cyan-200 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 shadow-xs"
                >
                  <Eye className="w-3.5 h-3.5 text-cyan-300" />
                  <span>View All ({salesCenterRequisitions.length})</span>
                </button>
              </div>
            </div>

            {salesCenterRequisitions.length === 0 ? (
              <div className="py-4 text-center text-xs text-cyan-200/70 italic bg-[#061520]/60 rounded-lg border border-cyan-500/20">
                No showroom requisitions found. Requisitions submitted from Sales Centers will appear here automatically.
              </div>
            ) : (
              /* Requisition List View with Colour */
              <div className="border border-cyan-500/25 rounded-xl overflow-x-auto shadow-xs bg-[#061520]/70">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#0c2638] text-cyan-200 font-bold uppercase text-[10px] border-b border-cyan-500/30">
                      <th className="p-2.5 w-28">Req No</th>
                      <th className="p-2.5 w-24">Date</th>
                      <th className="p-2.5 min-w-[160px]">Sales Center / Showroom</th>
                      <th className="p-2.5 min-w-[200px]">Item(s)</th>
                      <th className="p-2.5 text-center w-24">Total Coils</th>
                      <th className="p-2.5 text-center w-28">Status</th>
                      <th className="p-2.5 text-right w-44">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-500/15">
                    {salesCenterRequisitions.map((req) => {
                      const isReceived = req.stage === 'factory_received' || req.factoryStatus === 'received' || Boolean(req.factoryChallanNo);
                      const totalCoils = (req.lines || []).reduce(
                        (sum, l) => sum + (Number(l.approvedQty !== undefined && l.approvedQty !== null ? l.approvedQty : l.requestedQty) || 0),
                        0
                      );

                      return (
                        <tr key={req.id} className="hover:bg-cyan-500/[0.06] transition-colors">
                          <td className="p-2.5 font-mono font-black text-amber-300">
                            #{req.reqNo}
                          </td>
                          <td className="p-2.5 font-mono text-slate-300 whitespace-nowrap">
                            {formatDateDDMMYY(req.date)}
                          </td>
                          <td className="p-2.5">
                            <div className="font-bold text-white">
                              {req.branchName || 'Sales Center'}
                            </div>
                            {(req.partyName || req.marketingPersonName) && (
                              <div className="text-[10px] text-cyan-200/75 truncate max-w-[200px]">
                                {req.partyName ? `Party: ${req.partyName}` : `Mkt: ${req.marketingPersonName}`}
                              </div>
                            )}
                          </td>
                          <td className="p-2.5">
                            <div className="space-y-1">
                              {(req.lines || []).map((l, lIdx) => (
                                <div key={lIdx} className="text-slate-200 text-[11px] font-medium truncate max-w-[260px]">
                                  {l.itemName}
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-amber-200">
                            {totalCoils} Coils
                          </td>
                          <td className="p-2.5 text-center">
                            <span
                              className={`inline-block text-[10px] font-black px-2 py-0.5 rounded-full ${
                                isReceived
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-amber-900/80 text-amber-200 border border-amber-500/40'
                              }`}
                            >
                              {isReceived ? 'Received' : 'Pending'}
                            </span>
                          </td>
                          <td className="p-2.5 text-right whitespace-nowrap space-x-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedPreviewRequisition(req)}
                              className="px-2.5 py-1 text-cyan-300 hover:text-white hover:bg-cyan-500/15 rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center space-x-1"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Slip</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleConvertRequisitionToImport(req)}
                              className={`px-3 py-1 rounded-lg text-xs font-black inline-flex items-center space-x-1 cursor-pointer transition-all shadow-xs ${
                                isReceived
                                  ? 'bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30'
                                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                              }`}
                              title="Click to identify colours and load this requisition into Factory Import Challan"
                            >
                              <Zap className="w-3 h-3 text-amber-300" />
                              <span>{isReceived ? 'Re-convert' : 'Convert to Import'}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Header Metadata Form - Horizontal Row Layout */}
          <div className="cyber-glass-subcard p-4 rounded-xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {/* Destination Sales Center */}
            <div className="sm:col-span-2 md:col-span-2 lg:col-span-2">
              <label className="block text-xs font-bold text-cyan-200 uppercase mb-1 flex items-center space-x-1 whitespace-nowrap">
                <Building2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Destination Sales Center *</span>
              </label>
              <select
                ref={branchSelectRef}
                value={selectedBranchId}
                disabled={isBranchLocked}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    challanNoInputRef.current?.focus();
                    challanNoInputRef.current?.select();
                  }
                }}
                className={`w-full text-xs p-2 bg-[#061520] border border-cyan-500/30 rounded-lg font-bold text-white focus:ring-2 focus:ring-cyan-400 shadow-2xs ${isBranchLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
              >
                {isSuperOrAdmin && (
                  <option value="ALL">All Sales Centers</option>
                )}
                {effectiveBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Req # No */}
            <div>
              <label className="block text-xs font-bold text-cyan-200 uppercase mb-1 flex items-center space-x-1 whitespace-nowrap">
                <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Req # No</span>
              </label>
              <input
                ref={reqNoInputRef}
                type="text"
                value={reqNo}
                onChange={(e) => setReqNo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    challanNoInputRef.current?.focus();
                    challanNoInputRef.current?.select();
                  }
                }}
                placeholder="e.g. REQ-9901 / 017..."
                className="w-full text-xs p-2 bg-[#061520] border border-cyan-500/30 rounded-lg font-bold font-mono text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 shadow-2xs"
              />
            </div>

            {/* Challan No */}
            <div>
              <label className="block text-xs font-bold text-cyan-200 uppercase mb-1 flex items-center space-x-1 whitespace-nowrap">
                <Hash className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Challan No *</span>
              </label>
              <input
                ref={challanNoInputRef}
                type="text"
                value={challanNo}
                onChange={(e) => setChallanNo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    importDateInputRef.current?.focus();
                    importDateInputRef.current?.select();
                  }
                }}
                placeholder="e.g. FC-2051"
                className="w-full text-xs p-2 bg-[#061520] border border-cyan-500/30 rounded-lg font-bold font-mono text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 shadow-2xs"
              />
            </div>

            {/* Import Date */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-cyan-200 uppercase flex items-center space-x-1 whitespace-nowrap">
                  <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Import Date *</span>
                </label>
                <button
                  type="button"
                  onClick={() => setDate(getTodayDDMMYY())}
                  className="text-[10px] font-bold text-cyan-300 hover:underline cursor-pointer"
                  title="Set today date"
                >
                  Today
                </button>
              </div>
              <div className="relative flex items-center">
                <input
                  ref={importDateInputRef}
                  type="text"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  onBlur={() => {
                    if (date.trim()) {
                      setDate(formatDateDDMMYY(date) || date);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      driverNameInputRef.current?.focus();
                      driverNameInputRef.current?.select();
                    }
                  }}
                  placeholder="dd.mm.yy"
                  className="w-full text-xs p-2 pr-9 bg-[#061520] border border-cyan-500/30 rounded-lg font-bold font-mono text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 shadow-2xs"
                  required
                />
                <div className="absolute right-2 flex items-center">
                  <input
                    type="date"
                    value={parseDateToISO(date)}
                    onChange={(e) => {
                      if (e.target.value) {
                        setDate(formatDateDDMMYY(e.target.value));
                      }
                    }}
                    className="opacity-0 absolute inset-0 w-6 h-6 cursor-pointer z-10"
                    title="Pick Date from Calendar"
                  />
                  <Calendar className="w-4 h-4 text-cyan-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Driver Name */}
            <div>
              <label className="block text-xs font-bold text-cyan-200 uppercase mb-1 flex items-center space-x-1 whitespace-nowrap">
                <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Driver Name</span>
              </label>
              <input
                ref={driverNameInputRef}
                type="text"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    driverPhoneInputRef.current?.focus();
                    driverPhoneInputRef.current?.select();
                  }
                }}
                placeholder="e.g. Md. Rahat Mia (Optional)"
                className="w-full text-xs p-2 bg-[#061520] border border-cyan-500/30 rounded-lg font-semibold text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 shadow-2xs"
              />
            </div>

            {/* Driver Mobile No. */}
            <div>
              <label className="block text-xs font-bold text-cyan-200 uppercase mb-1 flex items-center space-x-1 whitespace-nowrap">
                <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Driver Mobile</span>
              </label>
              <input
                ref={driverPhoneInputRef}
                type="text"
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    remarksInputRef.current?.focus();
                    remarksInputRef.current?.select();
                  }
                }}
                placeholder="e.g. 01712-345678 (Optional)"
                className="w-full text-xs p-2 bg-[#061520] border border-cyan-500/30 rounded-lg font-mono font-semibold text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 shadow-2xs"
              />
            </div>
          </div>

          {/* Shipment Remarks / Notes */}
          <div>
            <label className="block text-xs font-bold text-cyan-200 uppercase mb-1">
              Shipment Remarks / Notes
            </label>
            <input
              ref={remarksInputRef}
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const firstLineId = lines[0]?.id;
                  if (firstLineId && itemSearchRefs.current[firstLineId]) {
                    itemSearchRefs.current[firstLineId]?.focus();
                    setOpenDropdownLineId(firstLineId);
                  }
                }
              }}
              placeholder="e.g. Received at Madhupur Main Store from Factory Line #2"
              className="w-full text-xs p-2 bg-[#061520] border border-cyan-500/30 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400"
            />
          </div>

          {/* Line Items Table Header Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <h4 className="text-xs font-extrabold uppercase text-cyan-200 tracking-wider flex items-center space-x-1.5">
              <Tag className="w-4 h-4 text-cyan-400" />
              <span>Imported Goods Breakdown List ({lines.length} items)</span>
            </h4>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleResetLines}
                className="inline-flex items-center space-x-1 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                title="Reset breakdown list to 1 default item line"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset List</span>
              </button>

              <button
                type="button"
                onClick={handleAddLine}
                ref={addFactoryLineButtonRef}
                className="inline-flex items-center space-x-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-3 py-1.5 rounded-lg text-xs font-black shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Item Line</span>
              </button>
            </div>
          </div>

          {/* Table of Line Items - Formatted like Create New Bill */}
          <div className="overflow-x-auto border border-cyan-500/25 bg-[#071824]/70 rounded-xl shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#0c2638] text-cyan-200 font-bold uppercase text-[11px] tracking-wider border-b border-cyan-500/30">
                  <th className="p-2.5 w-10 text-center">SL</th>
                  <th className="p-2.5 min-w-[220px]">Item Description</th>
                  <th className="p-2.5 w-24">Category</th>
                  <th className="p-2.5 w-20 text-center">Unit</th>
                  <th className="p-2.5 w-32 text-center bg-emerald-600/30 text-emerald-200 font-black">
                    Import Qty (Coils) *
                  </th>
                  <th className="p-2.5 min-w-[200px] text-center bg-[#061520]/80 text-amber-300 border-l border-cyan-500/25 font-extrabold">
                    Colour
                  </th>
                  <th className="p-2.5 w-28 text-right">Unit Price (Tk)</th>
                  <th className="p-2.5 w-32 text-right font-black">Line Value (Tk)</th>
                  <th className="p-2.5 w-12 text-center">Del</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                {lines.map((line, idx) => {
                  const matchedItem = items.find((i) => i.id === line.itemId || i.name === line.itemName || i.code === line.itemCode);
                  const openingStockBalance = matchedItem ? (matchedItem.openingStock || 0) : 0;
                  const currentStockBalance = matchedItem ? getItemLiveStock(matchedItem, factoryImports) : 0;
                  const categoryDisplay = line.category || matchedItem?.category || '-';

                  const queryVal = (lineSearchQueries[line.id] !== undefined ? lineSearchQueries[line.id] : (line.itemName || '')).trim();
                  const filteredItemOptionsRaw = items.filter((i) => {
                    if (!queryVal) return true;
                    return matchesFlexibleSearch(`${i.name} ${i.sizeSpec || ''} ${i.category || ''}`, queryVal, `${i.category || ''} ${i.code || ''}`);
                  });
                  const groupedItemOptions = groupItemsByCategoryOrder(filteredItemOptionsRaw, categoryOrder);
                  const filteredItemOptions = groupedItemOptions.orderedItems;

                  return (
                    <tr key={line.id} className="hover:bg-cyan-500/[0.06] transition-colors">
                      <td className="p-2 text-center font-mono font-bold text-cyan-300 bg-[#081b28]/60">
                        {idx + 1}
                      </td>

                      {/* Item Dynamic Search Combobox with Arrow Key Navigation */}
                      <td className="p-2 relative item-search-container">
                        <div className="relative">
                          <input
                            id={`factory-item-input-${line.id}`}
                            ref={(el) => { itemSearchRefs.current[line.id] = el; }}
                            type="text"
                            value={lineSearchQueries[line.id] !== undefined ? lineSearchQueries[line.id] : (line.itemName || '')}
                            onPaste={(e) => {
                              const text = e.clipboardData.getData('text');
                              if (text && (text.includes('\n') || text.includes('\t'))) {
                                e.preventDefault();
                                handlePasteFactoryItemsFromExcel(idx, text);
                              }
                            }}
                            onChange={(e) => {
                              const val = e.target.value;
                              setLineSearchQueries((prev) => ({ ...prev, [line.id]: val }));
                              setOpenDropdownLineId(line.id);
                              setHighlightedItemIndex(0);
                            }}
                            onFocus={() => {
                              setOpenDropdownLineId(line.id);
                              setHighlightedItemIndex(0);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                e.stopPropagation();
                                if (openDropdownLineId !== line.id) {
                                  setOpenDropdownLineId(line.id);
                                  setHighlightedItemIndex(0);
                                } else if (filteredItemOptions.length > 0) {
                                  setHighlightedItemIndex((prev) => (prev + 1) % filteredItemOptions.length);
                                }
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                e.stopPropagation();
                                if (openDropdownLineId !== line.id) {
                                  setOpenDropdownLineId(line.id);
                                  setHighlightedItemIndex(0);
                                } else if (filteredItemOptions.length > 0) {
                                  setHighlightedItemIndex((prev) => (prev - 1 + filteredItemOptions.length) % filteredItemOptions.length);
                                }
                              } else if (e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();
                                if (openDropdownLineId === line.id && filteredItemOptions.length > 0) {
                                  const selected = filteredItemOptions[highlightedItemIndex] || filteredItemOptions[0];
                                  if (selected) {
                                    handleSelectFoundItem(line.id, selected);
                                  }
                                } else if (filteredItemOptions.length > 0 && queryVal.length > 0) {
                                  handleSelectFoundItem(line.id, filteredItemOptions[0]);
                                } else {
                                  const curMatched = matchedItem || items.find((i) => i.id === line.itemId || i.name.toLowerCase() === (line.itemName || '').toLowerCase());
                                  if (curMatched && isColorApplicableCable(curMatched)) {
                                    handleOpenColorModalForLine(line);
                                  } else {
                                    setTimeout(() => {
                                      if (qtyInputRefs.current[line.id]) {
                                        qtyInputRefs.current[line.id]?.focus();
                                        qtyInputRefs.current[line.id]?.select();
                                      }
                                    }, 50);
                                  }
                                }
                              } else if (e.key === 'Escape') {
                                e.stopPropagation();
                                setOpenDropdownLineId(null);
                              }
                            }}
                            placeholder="Type item name or size..."
                            className="w-full text-xs p-1.5 pl-8 bg-[#061520] border border-cyan-500/30 rounded-lg font-bold text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400"
                          />
                          <Search className="w-3.5 h-3.5 text-cyan-400/70 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>

                        {/* Dynamic Dropdown Results */}
                        {openDropdownLineId === line.id && (
                          <div className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-[#091e2c]/98 backdrop-blur-xl border border-cyan-400/40 rounded-xl shadow-2xl divide-y divide-cyan-500/15">
                            {filteredItemOptions.length === 0 ? (
                              <div className="p-3 text-xs text-slate-400 text-center font-medium">No matching items found</div>
                            ) : (
                              groupedItemOptions.groups.map((grp) => (
                                <div key={grp.category} className="divide-y divide-cyan-500/15">
                                  <div className="px-2.5 py-1 bg-[#0c2638] text-[10px] font-black uppercase tracking-wider text-cyan-300 sticky top-0 z-10 border-b border-cyan-500/20">
                                    {grp.category} ({grp.items.length})
                                  </div>
                                  {grp.items.map(({ item: itemOption, flatIndex: itemIdx }) => {
                                    const isHighlighted = itemIdx === highlightedItemIndex;
                                    return (
                                      <div
                                        key={itemOption.id}
                                        ref={(el) => { dropdownOptionRefs.current[itemIdx] = el; }}
                                        onMouseEnter={() => setHighlightedItemIndex(itemIdx)}
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          handleSelectFoundItem(line.id, itemOption);
                                        }}
                                        className={`p-2 cursor-pointer flex items-center justify-between text-xs transition-colors ${
                                          isHighlighted
                                            ? 'bg-cyan-500/20 text-cyan-200 font-bold border-l-4 border-cyan-400 pl-3'
                                            : 'hover:bg-cyan-500/10 text-slate-200'
                                        }`}
                                      >
                                        <div>
                                          <div className="font-bold text-white">{itemOption.name}</div>
                                          <div className="text-[10px] text-slate-400 font-mono">{itemOption.category || 'General'}</div>
                                        </div>
                                        <div className="text-[10px] font-bold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-400/35">
                                          ৳{itemOption.rate}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </td>

                      {/* Category */}
                      <td className="p-2 font-semibold text-slate-300 text-[11px]">
                        {categoryDisplay}
                      </td>

                      {/* Unit */}
                      <td className="p-2 text-center font-medium text-slate-300">
                        {line.unit}
                      </td>

                      {/* Import Quantity Input */}
                      <td className="p-2 bg-emerald-500/10 border-r border-emerald-500/20 w-32">
                        <input
                          ref={(el) => { qtyInputRefs.current[line.id] = el; }}
                          type="number"
                          min="0"
                          value={line.quantity || ''}
                          onChange={(e) => {
                            handleQuantityChange(line.id, parseInt(e.target.value) || 0);
                          }}
                          onKeyDown={(e) => handleQtyKeyDown(e, line.id, idx)}
                          className="w-full text-center text-xs p-1.5 font-black font-mono bg-[#061520] border border-emerald-400/50 rounded-lg text-emerald-200 focus:ring-2 focus:ring-cyan-400 shadow-2xs"
                          placeholder="0"
                          title="Import Quantity (Coils)"
                        />
                      </td>

                      {/* Colour Column (after Import Qty) */}
                      <td className="p-2 border-l border-cyan-500/20 bg-[#081b28]/50 text-center min-w-[200px]">
                        {isColorApplicableCable(matchedItem || line) ? (
                          (Number(line.red) > 0 || Number(line.black) > 0 || Number(line.yellow) > 0 || Number(line.green) > 0 || Number(line.blue) > 0 || Number(line.others) > 0) ? (
                            <div
                              onClick={() => handleOpenColorModalForLine(line)}
                              className="flex items-center justify-center flex-wrap gap-1 cursor-pointer hover:opacity-85 py-0.5"
                              title="Click to edit colour breakdown"
                            >
                              {Number(line.red) > 0 && (
                                <span className="bg-rose-500/25 text-rose-200 border border-rose-400/40 px-1.5 py-0.5 rounded text-[10px] font-mono font-black shadow-2xs">
                                  R:{line.red}
                                </span>
                              )}
                              {Number(line.black) > 0 && (
                                <span className="bg-[#061520] text-slate-200 border border-slate-500/50 px-1.5 py-0.5 rounded text-[10px] font-mono font-black shadow-2xs">
                                  B:{line.black}
                                </span>
                              )}
                              {Number(line.yellow) > 0 && (
                                <span className="bg-amber-500/25 text-amber-200 border border-amber-400/40 px-1.5 py-0.5 rounded text-[10px] font-mono font-black shadow-2xs">
                                  Y:{line.yellow}
                                </span>
                              )}
                              {Number(line.green) > 0 && (
                                <span className="bg-emerald-500/25 text-emerald-200 border border-emerald-400/40 px-1.5 py-0.5 rounded text-[10px] font-mono font-black shadow-2xs">
                                  G:{line.green}
                                </span>
                              )}
                              {Number(line.blue) > 0 && (
                                <span className="bg-blue-500/25 text-blue-200 border border-blue-400/40 px-1.5 py-0.5 rounded text-[10px] font-mono font-black shadow-2xs">
                                  BU:{line.blue}
                                </span>
                              )}
                              {Number(line.others) > 0 && (
                                <span className="bg-purple-500/25 text-purple-200 border border-purple-400/40 px-1.5 py-0.5 rounded text-[10px] font-mono font-black shadow-2xs">
                                  O:{line.others}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenColorModalForLine(line);
                                }}
                                className="p-1 hover:bg-cyan-500/20 rounded text-cyan-300 transition-colors ml-0.5 cursor-pointer"
                                title="Edit Colour Breakdown"
                              >
                                <Palette className="w-3.5 h-3.5 text-cyan-300" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenColorModalForLine(line)}
                              className="px-2 py-1 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 rounded text-[11px] font-bold border border-cyan-400/40 transition-colors inline-flex items-center space-x-1 cursor-pointer"
                              title="Open Colour Breakdown Form"
                            >
                              <Palette className="w-3.5 h-3.5 text-cyan-300" />
                              <span>Colour Form</span>
                            </button>
                          )
                        ) : (
                          <div className="text-center text-slate-500 text-[11px] font-mono">—</div>
                        )}
                      </td>

                      {/* Unit Rate */}
                      <td className="p-2">
                        <input
                          type="number"
                          min="0"
                          value={line.rate || matchedItem?.rate || ''}
                          onChange={(e) => handleRateChange(line.id, parseFloat(e.target.value) || 0)}
                          className="w-full text-right text-xs p-1.5 font-mono bg-[#061520] border border-cyan-500/30 rounded-lg text-white focus:ring-2 focus:ring-cyan-400"
                        />
                      </td>

                      {/* Line Total Amount */}
                      <td className="p-2 text-right font-black text-cyan-200 font-mono">
                        ৳{((line.quantity || 0) * (line.rate || matchedItem?.rate || 0)).toLocaleString('en-IN')}
                      </td>

                      {/* Remove Action */}
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(line.id)}
                          className="p-1 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                          title="Remove Line"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}

              </tbody>
            </table>
          </div>

          {/* Totals & In Words Section - Formatted like Create New Bill */}
          <div className="cyber-glass-subcard rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            {/* Left side: Coils summary, In Words, Notes */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-extrabold uppercase text-cyan-200 tracking-wide">
                  Total Coils =
                </span>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 px-3 py-1 rounded-lg font-black font-mono text-sm shadow-2xs">
                  {totalQuantity.toLocaleString('en-IN')} Coils
                </span>
              </div>

              <div className="text-xs text-slate-200 font-serif italic bg-[#061520]/80 p-2.5 rounded-lg border border-cyan-500/25">
                <strong className="not-italic font-sans text-cyan-200 font-bold mr-1">In Word:</strong>
                {convertToTakaWords(netShipmentAmount)}
              </div>
            </div>

            {/* Right side: Subtotal, Discount & Total Value */}
            <div className="space-y-2 text-right font-mono border-t md:border-t-0 md:border-l border-cyan-500/20 pt-3 md:pt-0 md:pl-6">
              <div className="flex justify-between items-center text-xs text-slate-300">
                <span>Subtotal =</span>
                <span className="font-bold text-white">৳{totalAmount.toLocaleString('en-IN')}</span>
              </div>

              {/* Discount Row: Percentage to Amount with Keyboard Flow */}
              <div className="flex justify-between items-center text-xs py-1 border-t border-cyan-500/20">
                <div className="flex items-center space-x-1.5 font-sans">
                  <span className="font-bold text-cyan-200">Discount:</span>
                  <div className="relative inline-flex items-center">
                    <input
                      ref={discountPercentInputRef}
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      value={discountPercent === 0 ? '' : discountPercent}
                      onChange={(e) => {
                        const pct = parseFloat(e.target.value) || 0;
                        setDiscountPercent(pct);
                        setDiscountAmount(Math.round((totalAmount * pct) / 100));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (discountAmountInputRef.current) {
                            discountAmountInputRef.current.focus();
                            discountAmountInputRef.current.select();
                          }
                        }
                      }}
                      placeholder="0"
                      className="w-16 text-center border border-cyan-500/30 rounded-md px-1.5 py-1 text-xs font-bold text-emerald-300 bg-[#061520] focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                      title="Discount in Percentage"
                    />
                    <span className="ml-1 text-slate-300 font-bold">%</span>
                  </div>
                </div>

                <div className="flex items-center space-x-1 font-mono">
                  <span className="text-slate-400 text-xs font-sans">৳</span>
                  <input
                    ref={discountAmountInputRef}
                    type="number"
                    min="0"
                    step="any"
                    value={
                      discountAmount > 0
                        ? discountAmount
                        : (discountPercent > 0 ? Math.round((totalAmount * discountPercent) / 100) : '')
                    }
                    onChange={(e) => {
                      const amt = parseFloat(e.target.value) || 0;
                      setDiscountAmount(amt);
                      if (totalAmount > 0) {
                        setDiscountPercent(Number(((amt / totalAmount) * 100).toFixed(2)));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (saveChallanBtnRef.current) {
                          saveChallanBtnRef.current.focus();
                        }
                      }
                    }}
                    placeholder="0"
                    className="w-28 text-right border border-cyan-500/30 rounded-md px-2 py-1 text-xs font-bold font-mono text-emerald-300 bg-[#061520] focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                    title="Discount Amount"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center text-base sm:text-lg font-black text-white pt-2 border-t border-cyan-500/25">
                <span className="text-xs uppercase font-sans tracking-wider text-cyan-200">Total Shipment Value =</span>
                <span className="text-2xl font-black text-emerald-300">৳{netShipmentAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Document Signatures (Physical Receiving Voucher Print Footer) */}
          <div className="pt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center text-xs font-bold text-slate-300 print:text-black border-t border-cyan-500/20">
            <div className="border-t border-cyan-500/35 print:border-slate-400 pt-1.5">
              <p>Driver / Carrier</p>
            </div>
            <div className="border-t border-cyan-500/35 print:border-slate-400 pt-1.5">
              <p>Store Keeper Received</p>
            </div>
            <div className="border-t border-cyan-500/35 print:border-slate-400 pt-1.5">
              <p>Checked By</p>
            </div>
            <div className="border-t border-cyan-500/35 print:border-slate-400 pt-1.5">
              <p>Authorized Officer</p>
            </div>
          </div>

          {/* Bottom Action Footer Bar */}
          <div className="pt-4 border-t border-cyan-500/20 flex flex-wrap items-center justify-between gap-3 no-print">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleResetLines}
                className="px-3.5 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset List</span>
              </button>
            </div>

            <div className="flex items-center space-x-2 flex-wrap gap-y-2">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/30 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
              )}

              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 border border-rose-500/40 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>Close</span>
                </button>
              )}

              {isEditing && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>Cancel Edit</span>
                </button>
              )}

              <button
                ref={saveChallanBtnRef}
                type="button"
                onClick={() => handleSaveChallan(false)}
                className={`px-5 py-2 ${
                  isEditing ? 'bg-amber-500 hover:bg-amber-400 text-slate-950' : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                } rounded-xl text-xs font-black shadow-md transition-all flex items-center space-x-1.5 cursor-pointer focus:ring-2 focus:ring-cyan-300 focus:outline-none`}
              >
                <Save className="w-4 h-4" />
                <span>{isEditing ? 'Update Challan' : 'Save Challan'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSaveChallan(true)}
                className={`px-5 py-2 bg-[#081b28] hover:bg-[#0e2a3d] ${
                  isEditing ? 'text-amber-300 border border-amber-400/50' : 'text-emerald-300 border border-emerald-400/50'
                } rounded-xl text-xs font-extrabold shadow-md transition-all flex items-center space-x-2 cursor-pointer`}
              >
                <Printer className={`w-4 h-4 ${isEditing ? 'text-amber-300' : 'text-emerald-300'}`} />
                <span>{isEditing ? 'Update & Print' : 'Save & Print'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: FACTORY IMPORT HISTORY LOG */}
      {subTab === 'history' && (
        <div className={hideInternalTabs ? "p-4 space-y-3" : "space-y-3"}>
          {/* GLOBAL CONTROLS & FILTER BAR (SALES & STOCK REPORT FILTER BAR STYLE) */}
          <div className="bg-[#0b2334]/80 p-2.5 px-4 rounded-xl border border-cyan-500/25 flex flex-col space-y-2 text-xs text-white shadow-md no-print">
            {/* Row 1: Core Dimensions */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap flex-1">
                {/* Search Box */}
                <div className="relative flex-1 min-w-0 w-full sm:w-auto sm:min-w-[200px] sm:max-w-md">
                  <Search className="w-3.5 h-3.5 text-cyan-400/70 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search Challan No, Car No, Driver..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
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

                {/* Sales Center Filter */}
                <div className="flex items-center space-x-1.5 bg-[#061520] px-2.5 py-1 rounded-lg border border-cyan-500/30 shrink-0">
                  <Building2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="text-[11px] text-cyan-200/80 font-bold whitespace-nowrap">Sales Center:</span>
                  <select
                    value={historyBranchFilter}
                    disabled={isBranchLocked}
                    onChange={(e) => setHistoryBranchFilter(e.target.value)}
                    className={`bg-transparent text-white focus:outline-none text-xs font-bold ${isBranchLocked ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'}`}
                  >
                    {!isBranchLocked && (
                      <option value="ALL" className="bg-[#061520] text-white">All Sales Centers</option>
                    )}
                    {effectiveBranches.map((b) => (
                      <option key={b.id} value={b.id} className="bg-[#061520] text-white">
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                {(historySearch || (!isBranchLocked && historyBranchFilter !== 'ALL')) && (
                  <button
                    type="button"
                    onClick={() => {
                      setHistorySearch('');
                      if (!isBranchLocked) {
                        setHistoryBranchFilter('ALL');
                      }
                    }}
                    className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 border border-rose-500/40 rounded-lg text-xs font-bold flex items-center space-x-1 transition-colors cursor-pointer"
                    title="Reset all filters"
                  >
                    <FilterX className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-[11px] text-slate-300 mr-2">Showing <strong className="text-emerald-300 font-bold font-mono">{filteredHistory.length}</strong> shipments</span>
                <button
                  type="button"
                  onClick={() => {
                    handleCancelEdit();
                    setSubTab('new_challan');
                  }}
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-3 py-1 rounded-lg text-xs font-black flex items-center space-x-1.5 shadow-2xs transition-colors cursor-pointer"
                  title="Create New Factory Import Challan"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ New Import</span>
                </button>
              </div>
            </div>
          </div>

          <div className="cyber-glass-card rounded-2xl overflow-hidden space-y-4 p-5">

          {/* History Records Table */}
          {filteredHistory.length === 0 ? (
            <div className="p-12 text-center bg-[#071824]/60 rounded-xl border border-cyan-500/20 text-slate-400 space-y-2">
              <Truck className="w-10 h-10 mx-auto text-cyan-500/40" />
              <p className="font-bold text-white">No factory import history found.</p>
              <p className="text-xs text-slate-400">
                {historySearch ? 'No records match your search query.' : 'Click "+ Import from Factory" above to create your first shipment entry.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-cyan-500/25 bg-[#071824]/70 rounded-xl shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#0c2638] text-cyan-200 font-bold border-b border-cyan-500/30 uppercase text-[10px]">
                    <th
                      onClick={() => handleHistorySort('date')}
                      className="p-3 w-24 cursor-pointer select-none hover:bg-cyan-500/15 transition-colors"
                      title="Sort by Date (Asc/Desc)"
                    >
                      <div className="flex items-center space-x-1">
                        <span>Date</span>
                        {renderSortIndicator('date')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleHistorySort('reqNo')}
                      className="p-3 w-24 cursor-pointer select-none hover:bg-cyan-500/15 transition-colors"
                      title="Sort by Requisition No (Asc/Desc)"
                    >
                      <div className="flex items-center space-x-1">
                        <span>Req No</span>
                        {renderSortIndicator('reqNo')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleHistorySort('challanNo')}
                      className="p-3 w-28 cursor-pointer select-none hover:bg-cyan-500/15 transition-colors"
                      title="Sort by Challan No (Asc/Desc)"
                    >
                      <div className="flex items-center space-x-1">
                        <span>Challan No</span>
                        {renderSortIndicator('challanNo')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleHistorySort('branchName')}
                      className="p-3 min-w-[160px] cursor-pointer select-none hover:bg-cyan-500/15 transition-colors"
                      title="Sort by Destination Center (Asc/Desc)"
                    >
                      <div className="flex items-center space-x-1">
                        <span>Destination Center</span>
                        {renderSortIndicator('branchName')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleHistorySort('driverName')}
                      className="p-3 cursor-pointer select-none hover:bg-cyan-500/15 transition-colors"
                      title="Sort by Driver Name & Mobile (Asc/Desc)"
                    >
                      <div className="flex items-center space-x-1">
                        <span>Driver Name & Mobile</span>
                        {renderSortIndicator('driverName')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleHistorySort('items')}
                      className="p-3 w-24 text-center cursor-pointer select-none hover:bg-cyan-500/15 transition-colors"
                      title="Sort by Total Items (Asc/Desc)"
                    >
                      <div className="flex items-center justify-center space-x-1">
                        <span>Total Items</span>
                        {renderSortIndicator('items')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleHistorySort('quantity')}
                      className="p-3 w-28 text-center font-extrabold text-emerald-200 bg-emerald-500/20 cursor-pointer select-none hover:bg-emerald-500/30 transition-colors"
                      title="Sort by Imported Coils (Asc/Desc)"
                    >
                      <div className="flex items-center justify-center space-x-1">
                        <span>Imported Coils</span>
                        {renderSortIndicator('quantity')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleHistorySort('amount')}
                      className="p-3 w-32 text-right font-black cursor-pointer select-none hover:bg-cyan-500/15 transition-colors"
                      title="Sort by Shipment Value (Asc/Desc)"
                    >
                      <div className="flex items-center justify-end space-x-1">
                        <span>Shipment Value (Tk)</span>
                        {renderSortIndicator('amount')}
                      </div>
                    </th>
                    <th className="p-3 w-32 text-center whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                  {sortedHistory.map((challan) => (
                    <tr key={challan.id} className="hover:bg-cyan-500/[0.06] transition-colors">
                      <td className="p-3 font-mono text-slate-300 font-medium">{formatDateDDMMYY(challan.date)}</td>
                      <td className="p-3 font-mono font-bold text-slate-200">{challan.reqNo || '-'}</td>
                      <td className="p-3 font-mono font-black text-emerald-300">
                        <div className="flex items-center space-x-1.5">
                          <span>{challan.challanNo}</span>
                          {challan.updatedAt && (
                            <span
                              className="bg-amber-500/20 text-amber-200 text-[9px] px-1.5 py-0.5 rounded font-sans font-bold border border-amber-400/40 inline-flex items-center space-x-0.5"
                              title={`Last modified: ${new Date(challan.updatedAt).toLocaleString()}`}
                            >
                              <Clock className="w-2.5 h-2.5 mr-0.5" />
                              <span>Edited</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center space-x-1.5">
                          <Building2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <span className="font-bold text-white text-xs truncate max-w-[170px]" title={challan.branchName || 'Madhupur Sales Center / Showroom'}>
                            {challan.branchName || 'Madhupur Sales Center / Showroom'}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-slate-300">
                        <div className="font-semibold text-white">{challan.driverName || '-'}</div>
                        {challan.driverPhone && (
                          <div className="text-[10px] text-slate-400 font-mono">{challan.driverPhone}</div>
                        )}
                      </td>
                      <td className="p-3 text-center font-mono text-slate-300">
                        {challan.lines.length} items
                      </td>
                      <td className="p-3 text-center font-black text-emerald-300 bg-emerald-500/10 font-mono">
                        {challan.totalQuantity.toLocaleString('en-IN')} Coils
                      </td>
                      <td className="p-3 text-right font-black text-cyan-200 font-mono">
                        ৳{challan.totalAmount.toLocaleString('en-IN')}
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center space-x-1.5 whitespace-nowrap">
                          {/* Edit History Entry */}
                          <button
                            type="button"
                            onClick={() => handleEditChallan(challan)}
                            className="p-1.5 bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 rounded-md transition-colors cursor-pointer inline-flex items-center justify-center shrink-0 border border-amber-400/40"
                            title="Edit Factory Import Challan"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {/* View / Print Challan Receipt */}
                          <button
                            type="button"
                            onClick={() => setSelectedChallanForModal(challan)}
                            className="p-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 rounded-md transition-colors cursor-pointer inline-flex items-center justify-center shrink-0 border border-cyan-500/30"
                            title="View & Print Received Challan Receipt"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete History Entry */}
                          <button
                            type="button"
                            onClick={() => handleDeleteChallan(challan.id, challan.challanNo)}
                            className="p-1.5 bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 rounded-md transition-colors cursor-pointer inline-flex items-center justify-center shrink-0 border border-rose-500/40"
                            title="Delete Record"
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
        </div>
      )}

      {/* PRINTABLE RECEIVING CHALLAN MODAL */}
      {selectedChallanForModal && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-3xl w-full border border-cyan-400/35 overflow-hidden my-8">
            {/* Modal Bar */}
            <div className="cyber-glass-header text-white p-4 flex flex-wrap items-center justify-between gap-2 no-print">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setSelectedChallanForModal(null)}
                  className="flex items-center space-x-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer border border-cyan-500/30"
                  title="Go Back to History"
                >
                  <ArrowLeft className="w-4 h-4 text-cyan-300" />
                  <span>Back</span>
                </button>
                <div className="flex items-center space-x-2 ml-1">
                  <Truck className="w-5 h-5 text-cyan-300" />
                  <h3 className="text-sm font-bold uppercase tracking-wide">
                    Factory Shipment Gate Pass / Challan #{selectedChallanForModal.challanNo}
                  </h3>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleEditChallan(selectedChallanForModal)}
                  className="flex items-center space-x-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 px-3.5 py-1.5 rounded-lg text-xs font-black transition-colors cursor-pointer shadow-xs"
                  title="Edit this Factory Import Challan"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Edit Challan</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center space-x-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-3.5 py-1.5 rounded-lg text-xs font-black transition-colors cursor-pointer shadow-xs"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Receipt</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedChallanForModal(null)}
                  className="flex items-center space-x-1.5 bg-rose-600/90 hover:bg-rose-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                  title="Close Print Preview"
                >
                  <X className="w-4 h-4" />
                  <span>Close</span>
                </button>
              </div>
            </div>

            {/* Printable Document Body */}
            <div className="p-8 space-y-6 bg-white text-slate-800 font-sans print:p-0">
              {/* Receipt Header */}
              <div className="text-center border-b-2 border-slate-800 pb-4">
                <h1 className="text-2xl font-black text-slate-900 uppercase tracking-wider">{company.name}</h1>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-widest mt-0.5">
                  FACTORY GOODS RECEIVING CHALLAN / GATE PASS
                </p>
                <p className="text-xs text-slate-500 mt-1">{company.address} • Ph: {company.phone}</p>
              </div>

              {/* Transport Metadata Box */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-300 grid grid-cols-2 sm:grid-cols-6 gap-4 text-xs font-sans">
                <div>
                  <span className="text-slate-500 font-semibold block uppercase text-[10px]">Destination Center</span>
                  <strong className="text-blue-800 font-bold text-xs">{selectedChallanForModal.branchName || 'Madhupur Sales Center / Showroom'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block uppercase text-[10px]">Req Number</span>
                  <strong className="text-slate-800 font-mono text-sm">{selectedChallanForModal.reqNo || 'N/A'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block uppercase text-[10px]">Challan Number</span>
                  <strong className="text-emerald-800 font-mono text-sm">{selectedChallanForModal.challanNo}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block uppercase text-[10px]">Import Date</span>
                  <strong className="text-slate-800">{formatDateDDMMYY(selectedChallanForModal.date)}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block uppercase text-[10px]">Driver Details</span>
                  <strong className="text-slate-800">{selectedChallanForModal.driverName || 'N/A'}</strong>
                  {selectedChallanForModal.driverPhone && (
                    <div className="text-[10px] text-slate-500 font-mono">{selectedChallanForModal.driverPhone}</div>
                  )}
                </div>
              </div>

              {selectedChallanForModal.remarks && (
                <div className="text-xs bg-amber-50 p-2.5 rounded-lg border border-amber-200 text-amber-900 italic">
                  <strong>Notes:</strong> {selectedChallanForModal.remarks}
                </div>
              )}

              {/* Items Breakdown Table */}
              <div>
                <h4 className="text-xs font-extrabold text-slate-800 uppercase mb-2">Itemized Receiving List:</h4>
                <table className="w-full text-left text-xs border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-200 text-slate-900 font-bold uppercase text-[10px] border-b border-slate-300">
                      <th className="p-2 border-r border-slate-300 w-10 text-center">SL</th>
                      <th className="p-2 border-r border-slate-300">Item Description</th>
                      <th className="p-2 border-r border-slate-300 w-20 text-center">Unit</th>
                      <th className="p-2 border-r border-slate-300 w-28 text-center font-black">Imported Qty</th>
                      <th className="p-2 border-r border-slate-300 w-28 text-right">Unit Rate</th>
                      <th className="p-2 text-right font-black">Line Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300">
                    {selectedChallanForModal.lines
                      .filter((line) => (line.itemName || '').trim() || (Number(line.quantity) || 0) > 0)
                      .map((l, idx) => {
                      const hasColors =
                        Number(l.red) > 0 ||
                        Number(l.black) > 0 ||
                        Number(l.yellow) > 0 ||
                        Number(l.green) > 0 ||
                        Number(l.blue) > 0 ||
                        Number(l.others) > 0;
                      return (
                        <tr key={l.id}>
                          <td className="p-2 border-r border-slate-300 text-center font-mono font-bold text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="p-2 border-r border-slate-300 font-bold text-slate-900">
                            <div>{l.itemName}</div>
                            {hasColors && (
                              <div className="flex flex-wrap gap-1 items-center mt-0.5">
                                {Number(l.red) > 0 && <span className="bg-red-100 text-red-700 border border-red-200 px-1 rounded text-[9px] font-bold">R:{l.red}</span>}
                                {Number(l.black) > 0 && <span className="bg-slate-800 text-white px-1 rounded text-[9px] font-bold">B:{l.black}</span>}
                                {Number(l.yellow) > 0 && <span className="bg-yellow-100 text-yellow-800 border border-yellow-300 px-1 rounded text-[9px] font-bold">Y:{l.yellow}</span>}
                                {Number(l.green) > 0 && <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-1 rounded text-[9px] font-bold">G:{l.green}</span>}
                                {Number(l.blue) > 0 && <span className="bg-blue-100 text-blue-800 border border-blue-300 px-1 rounded text-[9px] font-bold">BL:{l.blue}</span>}
                                {Number(l.others) > 0 && <span className="bg-purple-100 text-purple-800 border border-purple-300 px-1 rounded text-[9px] font-bold">O:{l.others}</span>}
                              </div>
                            )}
                          </td>
                          <td className="p-2 border-r border-slate-300 text-center text-slate-600">{l.unit}</td>
                          <td className="p-2 border-r border-slate-300 text-center font-black text-emerald-800 bg-emerald-50/50">
                            {l.quantity} {l.unit}
                          </td>
                          <td className="p-2 border-r border-slate-300 text-right font-mono">
                            ৳{(l.rate ?? 0).toLocaleString('en-IN')}
                          </td>
                          <td className="p-2 text-right font-black text-slate-900 font-mono">
                            ৳{(l.amount ?? 0).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Subtotal Footer */}
                    <tr className="bg-slate-100 font-bold border-t-2 border-slate-400">
                      <td colSpan={3} className="p-2 text-right uppercase text-[11px] font-extrabold text-slate-700">
                        Total Shipment Received:
                      </td>
                      <td className="p-2 text-center font-black text-emerald-900 bg-emerald-100 border-r border-slate-300 text-sm font-mono">
                        {selectedChallanForModal.totalQuantity.toLocaleString('en-IN')} Coils
                      </td>
                      <td className="p-2 border-r border-slate-300"></td>
                      <td className="p-2 text-right font-black text-slate-900 text-sm font-mono">
                        ৳{selectedChallanForModal.totalAmount.toLocaleString('en-IN')}
                      </td>
                    </tr>
                    {((selectedChallanForModal.discountAmount || 0) > 0 || (selectedChallanForModal.discountPercent || 0) > 0) && (
                      <>
                        <tr className="bg-slate-50 font-bold border-t border-slate-300">
                          <td colSpan={3} className="p-2 text-right uppercase text-[11px] font-extrabold text-slate-700">
                            Discount ({selectedChallanForModal.discountPercent || 0}%):
                          </td>
                          <td className="p-2 text-center border-r border-slate-300"></td>
                          <td className="p-2 border-r border-slate-300"></td>
                          <td className="p-2 text-right font-black text-rose-700 text-sm font-mono">
                            -৳{(selectedChallanForModal.discountAmount || 0).toLocaleString('en-IN')}
                          </td>
                        </tr>
                        <tr className="bg-emerald-50 font-bold border-t-2 border-emerald-400">
                          <td colSpan={3} className="p-2 text-right uppercase text-[11px] font-black text-emerald-900">
                            Net Shipment Value:
                          </td>
                          <td className="p-2 text-center font-black text-emerald-900 bg-emerald-100 border-r border-slate-300 text-sm font-mono">
                            {selectedChallanForModal.totalQuantity.toLocaleString('en-IN')} Coils
                          </td>
                          <td className="p-2 border-r border-slate-300"></td>
                          <td className="p-2 text-right font-black text-emerald-800 text-sm font-mono">
                            ৳{(selectedChallanForModal.netAmount !== undefined ? selectedChallanForModal.netAmount : Math.max(0, selectedChallanForModal.totalAmount - (selectedChallanForModal.discountAmount || 0))).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Signatures */}
              <div className="pt-12 grid grid-cols-3 gap-8 text-center text-xs font-bold text-slate-700">
                <div className="border-t border-slate-400 pt-2">
                  <p>Driver / Carrier Signature</p>
                </div>
                <div className="border-t border-slate-400 pt-2">
                  <p>Store Keeper Received By</p>
                </div>
                <div className="border-t border-slate-400 pt-2">
                  <p>Authorized Officer</p>
                </div>
              </div>

              {/* Bottom Action Footer */}
              <div className="pt-6 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 no-print">
                <button
                  type="button"
                  onClick={() => setSelectedChallanForModal(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to History</span>
                </button>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleEditChallan(selectedChallanForModal)}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer shadow-md"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>Edit Challan</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-extrabold shadow-md transition-all flex items-center space-x-2 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print Receipt</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedChallanForModal(null)}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    <span>Close</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Requisition List & Convert Modal */}
      {showRequisitionListModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030d14]/80 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in text-white">
            {/* Modal Header */}
            <div className="cyber-glass-header text-white p-4 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-cyan-500/20 border border-cyan-400/40 rounded-lg text-cyan-300">
                  <Boxes className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold flex items-center space-x-2">
                    <span>Showroom / Sales Center Requisitions</span>
                    <span className="bg-cyan-500/20 text-cyan-200 border border-cyan-400/35 text-xs px-2 py-0.5 rounded-full font-mono">
                      {salesCenterRequisitions.length} Total
                    </span>
                  </h3>
                  <p className="text-xs text-cyan-200/75">
                    Select any sales center requisition to convert it directly into a Factory Import Challan.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRequisitionListModal(false)}
                className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-cyan-500/15 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter and Search Bar */}
            <div className="p-3 sm:p-4 bg-[#0b2334]/85 border-b border-cyan-500/25 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="relative flex-1 min-w-0 w-full sm:w-auto sm:min-w-[240px]">
                <Search className="w-4 h-4 text-cyan-400/70 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={requisitionSearch}
                  onChange={(e) => setRequisitionSearch(e.target.value)}
                  placeholder="Search by Req No, Sales Center, Party, Marketing Person..."
                  className="w-full pl-9 pr-3 py-2 bg-[#061520] border border-cyan-500/30 text-white placeholder-slate-400 rounded-xl font-medium focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center space-x-1.5 bg-[#061520] border border-cyan-500/25 p-1 rounded-xl">
                {(['ALL', 'PENDING', 'RECEIVED'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setRequisitionFilterStatus(st)}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                      requisitionFilterStatus === st
                        ? 'bg-[#0e2d42] text-cyan-200 border border-cyan-400/60 shadow-xs'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {st === 'ALL' ? 'All Requisitions' : st === 'PENDING' ? 'Pending Import' : 'Received in Store'}
                  </button>
                ))}
              </div>
            </div>

            {/* Requisitions List Table */}
            <div className="overflow-y-auto flex-1 p-4">
              {salesCenterRequisitions.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">
                  No showroom requisitions found in the system.
                </div>
              ) : (
                <div className="border border-cyan-500/25 bg-[#071824]/70 rounded-xl overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 font-bold uppercase text-[10px]">
                        <th className="p-2.5 w-24">Req No</th>
                        <th className="p-2.5 w-24">Date</th>
                        <th className="p-2.5">Sales Center / Showroom</th>
                        <th className="p-2.5">Party / Marketing</th>
                        <th className="p-2.5 text-center w-28">Coils / Items</th>
                        <th className="p-2.5 text-center w-32">Status</th>
                        <th className="p-2.5 text-right w-44">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                      {salesCenterRequisitions
                        .filter((r) => {
                          if (requisitionFilterStatus === 'PENDING') {
                            if (r.stage === 'factory_received' || r.factoryStatus === 'received' || r.factoryChallanNo) return false;
                          }
                          if (requisitionFilterStatus === 'RECEIVED') {
                            if (r.stage !== 'factory_received' && r.factoryStatus !== 'received' && !r.factoryChallanNo) return false;
                          }
                          if (!requisitionSearch.trim()) return true;
                          const term = requisitionSearch.toLowerCase();
                          return (
                            (r.reqNo && r.reqNo.toLowerCase().includes(term)) ||
                            (r.branchName && r.branchName.toLowerCase().includes(term)) ||
                            (r.partyName && r.partyName.toLowerCase().includes(term)) ||
                            (r.marketingPersonName && r.marketingPersonName.toLowerCase().includes(term)) ||
                            (r.date && r.date.includes(term))
                          );
                        })
                        .map((req) => {
                          const isReceived = req.stage === 'factory_received' || req.factoryStatus === 'received' || Boolean(req.factoryChallanNo);
                          const totalCoils = (req.lines || []).reduce(
                            (sum, l) => sum + (Number(l.approvedQty !== undefined && l.approvedQty !== null ? l.approvedQty : l.requestedQty) || 0),
                            0
                          );

                          return (
                            <tr key={req.id} className="hover:bg-cyan-500/[0.06] transition-colors">
                              <td className="p-2.5 font-mono font-black text-amber-300">
                                #{req.reqNo}
                              </td>
                              <td className="p-2.5 font-mono text-slate-300">
                                {formatDateDDMMYY(req.date)}
                              </td>
                              <td className="p-2.5 font-bold text-white">
                                {req.branchName || 'Sales Center / Showroom'}
                              </td>
                              <td className="p-2.5 text-slate-300">
                                {req.partyName && <div className="font-semibold text-white">{req.partyName}</div>}
                                {req.marketingPersonName && (
                                  <div className="text-[11px] text-slate-400">Mkt: {req.marketingPersonName}</div>
                                )}
                              </td>
                              <td className="p-2.5 text-center font-mono font-bold text-cyan-200">
                                {totalCoils} Coils ({req.lines?.length || 0} items)
                              </td>
                              <td className="p-2.5 text-center">
                                <span
                                  className={`inline-block text-[10px] font-black px-2 py-0.5 rounded-full ${
                                    isReceived
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                                      : 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                                  }`}
                                >
                                  {isReceived ? `Imported (#${req.factoryChallanNo || 'Received'})` : 'Pending Import'}
                                </span>
                              </td>
                              <td className="p-2.5 text-right space-x-1.5 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => setSelectedPreviewRequisition(req)}
                                  className="px-2.5 py-1 text-cyan-200 hover:text-white hover:bg-cyan-500/15 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                                >
                                  View Slip
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleConvertRequisitionToImport(req)}
                                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer shadow-xs inline-flex items-center space-x-1 ${
                                    isReceived
                                      ? 'bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30'
                                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                                  }`}
                                  title="Load this requisition into Import from Factory"
                                >
                                  <Zap className="w-3 h-3 text-amber-300" />
                                  <span>{isReceived ? 'Re-convert' : 'Convert'}</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-[#071824]/90 border-t border-cyan-500/20 flex items-center justify-between text-xs text-slate-300">
              <span>Showing all synced showroom requisitions</span>
              <button
                type="button"
                onClick={() => setShowRequisitionListModal(false)}
                className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 text-white font-bold rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Single Requisition Voucher Preview Modal */}
      {selectedPreviewRequisition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030d14]/80 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] text-white">
            <div className="cyber-glass-header text-white p-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Boxes className="w-5 h-5 text-cyan-300" />
                <h3 className="text-base font-extrabold">
                  Requisition Voucher #{selectedPreviewRequisition.reqNo}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPreviewRequisition(null)}
                className="p-1 text-slate-300 hover:text-white hover:bg-cyan-500/15 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="cyber-glass-subcard p-4 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-cyan-300/75 block">Req No:</span>
                  <span className="font-mono font-bold text-amber-300">#{selectedPreviewRequisition.reqNo}</span>
                </div>
                <div>
                  <span className="text-cyan-300/75 block">Date:</span>
                  <span className="font-mono font-bold text-white">{formatDateDDMMYY(selectedPreviewRequisition.date)}</span>
                </div>
                <div>
                  <span className="text-cyan-300/75 block">Showroom:</span>
                  <span className="font-bold text-white">{selectedPreviewRequisition.branchName || 'Sales Center'}</span>
                </div>
                <div>
                  <span className="text-cyan-300/75 block">Party / Customer:</span>
                  <span className="font-bold text-white">{selectedPreviewRequisition.partyName || '-'}</span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase text-cyan-200 mb-2">Requested Item List:</h4>
                <div className="border border-cyan-500/25 bg-[#071824]/70 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-2 border-r border-cyan-500/20 text-center w-10">SL</th>
                      <th className="p-2 border-r border-cyan-500/20">Item Name</th>
                      <th className="p-2 border-r border-cyan-500/20 text-center w-20">Unit</th>
                      <th className="p-2 border-r border-cyan-500/20 text-center min-w-[140px]">Colour (10+8+2+5)</th>
                      <th className="p-2 border-r border-cyan-500/20 text-center w-24">Req Qty</th>
                      <th className="p-2 border-r border-cyan-500/20 text-right w-24">Rate</th>
                      <th className="p-2 text-right w-28">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                    {(selectedPreviewRequisition.lines || []).map((l, idx) => {
                      const colors = identifyColors(l);
                      const formula = colors.plusFormula || (colors.isIdentified ? buildPlusFormula(colors) : '');

                      return (
                        <tr key={idx} className="hover:bg-cyan-500/[0.06]">
                          <td className="p-2 border-r border-cyan-500/15 text-center font-mono text-cyan-300">{idx + 1}</td>
                          <td className="p-2 border-r border-cyan-500/15 font-bold text-white">{l.itemName}</td>
                          <td className="p-2 border-r border-cyan-500/15 text-center text-slate-300">{l.unit || 'Coils'}</td>
                          <td className="p-2 border-r border-cyan-500/15 text-center bg-[#081b28]/50">
                            {colors.isIdentified && colors.total > 0 ? (
                              <div className="flex flex-wrap items-center justify-center gap-1">
                                {formula && (
                                  <span className="font-mono text-[10px] font-black text-amber-200 bg-amber-500/20 border border-amber-400/40 px-1.5 py-0.2 rounded">
                                    {formula}
                                  </span>
                                )}
                                {colors.red > 0 && <span className="bg-rose-600 text-white px-1.5 py-0.2 rounded text-[9px] font-black">R:{colors.red}</span>}
                                {colors.black > 0 && <span className="bg-slate-900 text-slate-100 border border-slate-600 px-1.5 py-0.2 rounded text-[9px] font-black">B:{colors.black}</span>}
                                {colors.yellow > 0 && <span className="bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded text-[9px] font-black">Y:{colors.yellow}</span>}
                                {colors.green > 0 && <span className="bg-emerald-600 text-white px-1.5 py-0.2 rounded text-[9px] font-black">G:{colors.green}</span>}
                                {colors.blue > 0 && <span className="bg-blue-600 text-white px-1.5 py-0.2 rounded text-[9px] font-black">BL:{colors.blue}</span>}
                                {colors.others > 0 && <span className="bg-purple-600 text-white px-1.5 py-0.2 rounded text-[9px] font-black">O:{colors.others}</span>}
                              </div>
                            ) : (
                              <span className="text-slate-500 font-mono text-[10px]">—</span>
                            )}
                          </td>
                          <td className="p-2 border-r border-cyan-500/15 text-center font-mono font-bold text-emerald-300">
                            {l.approvedQty !== undefined && l.approvedQty !== null ? l.approvedQty : l.requestedQty}
                          </td>
                          <td className="p-2 border-r border-cyan-500/15 text-right font-mono">৳{(l.rate || 0).toLocaleString('en-IN')}</td>
                          <td className="p-2 text-right font-mono font-bold text-cyan-200">৳{(l.amount || 0).toLocaleString('en-IN')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            </div>

            <div className="p-4 bg-[#071824]/90 border-t border-cyan-500/20 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSelectedPreviewRequisition(null)}
                className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 text-slate-200 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Close
              </button>

              <button
                type="button"
                onClick={() => handleConvertRequisitionToImport(selectedPreviewRequisition)}
                className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-xl text-xs transition-all shadow-md flex items-center space-x-1.5 cursor-pointer"
              >
                <Zap className="w-4 h-4" />
                <span>Convert to Import from Factory</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Color Quantity Breakdown Modal */}
      {colorModalState && (
        <ColorQuantityModal
          isOpen={!!colorModalState}
          onClose={() => {
            const lineId = colorModalState?.lineId;
            const currentIdx = lines.findIndex((l) => l.id === lineId);
            let nextLineId = '';
            if (currentIdx >= 0 && currentIdx < lines.length - 1) {
              nextLineId = lines[currentIdx + 1].id;
            } else if (lineId) {
              nextLineId = lineId;
            }
            setColorModalState(null);
            if (nextLineId) {
              focusFactoryLineItemInput(nextLineId);
            }
          }}
          onConfirm={handleConfirmColorModal}
          item={colorModalState.item}
          initialTotalQty={colorModalState.initialQty}
          initialColors={colorModalState.colors}
        />
      )}

      {/* Import Item Matching & Conflict Review Modal */}
      {importConflictData && (
        <ImportConflictModal
          isOpen={importConflictData.isOpen}
          onClose={() => setImportConflictData((prev) => (prev ? { ...prev, isOpen: false } : null))}
          matchResults={importConflictData.results}
          availableItems={items}
          onApplyDecisions={(updatedLines) => {
            const factoryLines: FactoryImportLine[] = updatedLines.map((l, i) => {
              const matched = items.find((it) => it.id === l.itemId) || items.find((it) => it.name.toLowerCase() === l.itemDescription.toLowerCase());
              return {
                id: l.id || `line-import-res-${Date.now()}-${i}`,
                itemId: l.itemId || matched?.id || '',
                itemCode: matched?.code || '',
                itemName: l.itemDescription,
                sizeSpec: l.sizeSpec || matched?.sizeSpec || '',
                unit: l.unit || 'Coils',
                category: matched?.category || '',
                quantity: l.coilQty,
                rate: l.rate,
                amount: l.amount || Math.round(l.coilQty * l.rate)
              };
            });
            setLines(factoryLines);
            showToast('success', 'Item decisions applied to factory challan!');
          }}
        />
      )}

      {/* Delete Factory Import Challan Confirmation Modal */}
      {deleteConfirmChallan && (
        <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl border border-cyan-400/35 shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-md w-full p-6 space-y-4 font-sans animate-in zoom-in-95 duration-150 text-white">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-300 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Factory Import Challan?</h3>
                <p className="text-xs text-slate-300">
                  Are you sure you want to delete Import Challan #{deleteConfirmChallan.challanNo} from history?
                </p>
              </div>
            </div>

            <div className="bg-[#071824]/80 border border-cyan-500/25 rounded-xl p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400 font-medium">Challan Number:</span>
                <span className="font-mono font-bold text-amber-300">#{deleteConfirmChallan.challanNo}</span>
              </div>
              <p className="text-[11px] text-slate-300 pt-1">
                This record will be permanently deleted from the factory import history and synchronized across all devices.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setDeleteConfirmChallan(null)}
                className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 text-slate-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeConfirmDeleteChallan}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs flex items-center space-x-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Yes, Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {excelImportDiagOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030d14]/80 backdrop-blur-sm p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-amber-400/40 max-w-lg w-full overflow-hidden text-white">
            <div className="bg-amber-500/20 border-b border-amber-400/30 text-white px-4 py-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0" />
                <div>
                  <h3 className="text-sm font-extrabold text-white">Excel Item Diagnostics</h3>
                  <p className="text-[11px] text-amber-200">
                    {excelImportAddedCount} item(s) added from Excel • {excelImportProblems.length} issue(s) need attention
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExcelImportDiagOpen(false)}
                className="p-1 text-slate-300 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2.5 text-xs">
              <p className="text-slate-300">
                All item names from Excel were taken into the challan. Here is what needs fixing:
              </p>
              {excelImportProblems.map((prob, pIdx) => (
                <div key={pIdx} className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-3 space-y-1">
                  <div className="font-bold text-white">{prob.item}</div>
                  <div className="text-rose-300">
                    <strong>Problem:</strong> {prob.problem}
                  </div>
                  <div className="text-emerald-300 bg-emerald-500/15 p-1.5 rounded border border-emerald-400/30">
                    <strong>How to Fix:</strong> {prob.fix}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 bg-[#071824]/90 border-t border-cyan-500/20 flex justify-end">
              <button
                type="button"
                onClick={() => setExcelImportDiagOpen(false)}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-xl cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
