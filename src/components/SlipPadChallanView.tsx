import React, { useState, useMemo, useRef, useEffect } from 'react';
import { DeliveryChallan, CompanyDetails, Party, Item, Salesperson, ChallanLineItem, AuthUser, BranchLocation } from '../types';
import { formatDateDDMMYY } from '../utils/dateUtils';
import { convertToTakaWords } from '../utils/numberToWords';
import { getUserBranch } from '../utils/branchAccess';
import { matchesFlexibleSearch, groupItemsByCategoryOrder } from '../utils/searchHelper';
import { getAllCategories } from '../utils/categoryHelper';
import {
  Printer,
  RotateCcw,
  Check,
  Plus,
  Trash2,
  Calendar,
  Layers,
  ZoomIn,
  ZoomOut,
  FileSpreadsheet,
  Image as ImageIcon,
  Eye,
  EyeOff,
  Upload,
  ArrowLeft,
  Search,
  X,
  ChevronDown,
  Sparkles,
  Sliders,
  Type,
  Move,
  MapPin
} from 'lucide-react';
import { PrinterAutoConfigModal } from './PrinterAutoConfigModal';
import { MnemonicLabel } from './MnemonicLabel';
import { triggerAutoConfiguredPrint, getSavedPrinterConfig } from '../utils/printerAutoConfig';
import {
  DPI,
  PAD_WIDTH_INCH,
  PAD_HEIGHT_INCH,
  PAD_WIDTH_PX,
  PAD_HEIGHT_PX,
  SlipPadLayoutConfig,
  DEFAULT_SLIP_PAD_LAYOUT,
  loadSavedSlipPadLayout,
  saveSlipPadLayout,
  resetSlipPadLayout
} from '../utils/slipPadLayout';
import { SlipPadMovingStudio, MovingTarget } from './SlipPadMovingStudio';
import { SlipPadImageVisibilityControl } from './SlipPadImageVisibilityControl';

function splitInWords(wordsText: string, maxLine1Chars: number = 36): { line1: string; line2: string } {
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

export interface SlipPadChallanViewProps {
  challan?: DeliveryChallan | null;

  // Header State & Setters (when controlled)
  challanNo?: string;
  setChallanNo?: (v: string) => void;
  challanDate?: string;
  setChallanDate?: (v: string) => void;
  orderNumber?: string;
  setOrderNumber?: (v: string) => void;
  orderDate?: string;
  setOrderDate?: (v: string) => void;
  refNo?: string;
  setRefNo?: (v: string) => void;
  salesmanCode?: string;
  setSalesmanCode?: (v: string) => void;
  salespersonName?: string;
  setSalespersonName?: (v: string) => void;
  partyName?: string;
  setPartyName?: (v: string) => void;
  partyAddress?: string;
  setPartyAddress?: (v: string) => void;
  partyPhone?: string;
  setPartyPhone?: (v: string) => void;
  remarks?: string;
  setRemarks?: (v: string) => void;

  // Lines
  formLines?: ChallanLineItem[];
  setFormLines?: React.Dispatch<React.SetStateAction<ChallanLineItem[]>>;

  // Financials
  challanDiscountPercent?: number;
  setChallanDiscountPercent?: (v: number) => void;
  challanDiscountAmount?: number;
  setChallanDiscountAmount?: (v: number) => void;
  challanAdvanceAmount?: number;
  setChallanAdvanceAmount?: (v: number) => void;

  // Master Data
  parties?: Party[];
  items?: Item[];
  salespersons?: Salesperson[];
  deliveryChallans?: DeliveryChallan[];
  setDeliveryChallans?: React.Dispatch<React.SetStateAction<DeliveryChallan[]>>;
  company: CompanyDetails;

  // Header Mode Switcher
  initialPadMode?: 'plain' | 'hide_logo' | 'hide_all';
  padHeaderMode?: 'plain' | 'hide_logo' | 'hide_all';
  setPadHeaderMode?: (mode: 'plain' | 'hide_logo' | 'hide_all') => void;

  // Form Actions
  onSave?: (e?: React.FormEvent, autoPrint?: boolean) => void;
  onSaveChallan?: (saved: DeliveryChallan) => void;
  onClear?: () => void;
  currentUser?: AuthUser | null;
  branches?: BranchLocation[];
  isEditing?: boolean;
  onBack?: () => void;
  onClose?: () => void;
  onSwitchToPolyPad?: () => void;
}

export const SlipPadChallanView: React.FC<SlipPadChallanViewProps> = ({
  challan,
  challanNo: propChallanNo,
  setChallanNo: propSetChallanNo,
  challanDate: propChallanDate,
  setChallanDate: propSetChallanDate,
  orderNumber: propOrderNumber,
  setOrderNumber: propSetOrderNumber,
  orderDate: propOrderDate,
  setOrderDate: propSetOrderDate,
  refNo: propRefNo,
  setRefNo: propSetRefNo,
  salesmanCode: propSalesmanCode,
  setSalesmanCode: propSetSalesmanCode,
  salespersonName: propSalespersonName,
  setSalespersonName: propSetSalespersonName,
  partyName: propPartyName,
  setPartyName: propSetPartyName,
  partyAddress: propPartyAddress,
  setPartyAddress: propSetPartyAddress,
  partyPhone: propPartyPhone,
  setPartyPhone: propSetPartyPhone,
  remarks: propRemarks,
  setRemarks: propSetRemarks,
  formLines: propFormLines,
  setFormLines: propSetFormLines,
  challanDiscountPercent: propChallanDiscountPercent,
  setChallanDiscountPercent: propSetChallanDiscountPercent,
  challanDiscountAmount: propChallanDiscountAmount,
  setChallanDiscountAmount: propSetChallanDiscountAmount,
  challanAdvanceAmount: propChallanAdvanceAmount,
  setChallanAdvanceAmount: propSetChallanAdvanceAmount,
  parties = [],
  items = [],
  salespersons = [],
  deliveryChallans = [],
  setDeliveryChallans,
  company,
  initialPadMode = 'hide_logo',
  padHeaderMode: controlledPadHeaderMode,
  setPadHeaderMode: controlledSetPadHeaderMode,
  onSave,
  onSaveChallan,
  onClear,
  currentUser,
  branches = [],
  isEditing = false,
  onBack,
  onClose,
  onSwitchToPolyPad
}) => {
  // Local fallback states if uncontrolled
  const [localPadHeaderMode, setLocalPadHeaderMode] = useState<'plain' | 'hide_logo' | 'hide_all'>(initialPadMode);
  const padHeaderMode = controlledPadHeaderMode || localPadHeaderMode;
  const setPadHeaderMode = controlledSetPadHeaderMode || setLocalPadHeaderMode;

  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
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

  // =========================================================================
  // UNIVERSAL LAYOUT & POSITION COORDINATES STATE (with localStorage persistence)
  // =========================================================================
  const [layout, setLayout] = useState<SlipPadLayoutConfig>(() => loadSavedSlipPadLayout());
  const [showMovingStudio, setShowMovingStudio] = useState<boolean>(false);
  const [selectedMovingTarget, setSelectedMovingTarget] = useState<MovingTarget>('partyName');

  const handleUpdateLayout = (newLayout: SlipPadLayoutConfig) => {
    setLayout(newLayout);
    saveSlipPadLayout(newLayout);
  };

  const handleResetLayout = () => {
    const res = resetSlipPadLayout();
    setLayout(res);
  };

  // =========================================================================
  // BACKGROUND IMAGE & VISIBILITY CONTROLS STATE (with localStorage persistence)
  // =========================================================================
  const [showImageControls, setShowImageControls] = useState<boolean>(false);

  const [showBgImage, setShowBgImage] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('polycables_slip_pad_show_bg');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const [printBgImage, setPrintBgImage] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('polycables_slip_pad_print_bg');
      return saved !== null ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const [bgOpacity, setBgOpacity] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('polycables_slip_pad_bg_opacity');
      return saved ? parseFloat(saved) : 0.6;
    } catch {
      return 0.6;
    }
  });

  const [bgScale, setBgScale] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('polycables_slip_pad_bg_scale');
      return saved ? parseFloat(saved) : 1.0;
    } catch {
      return 1.0;
    }
  });

  const [bgOffsetX, setBgOffsetX] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('polycables_slip_pad_bg_offset_x');
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });

  const [bgOffsetY, setBgOffsetY] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('polycables_slip_pad_bg_offset_y');
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });

  const [customBgUrl, setCustomBgUrl] = useState<string | null>(() => {
    try {
      return localStorage.getItem('polycables_slip_pad_custom_bg_url') || null;
    } catch {
      return null;
    }
  });

  // Persist Image adjustments
  useEffect(() => {
    try {
      localStorage.setItem('polycables_slip_pad_show_bg', JSON.stringify(showBgImage));
      localStorage.setItem('polycables_slip_pad_print_bg', JSON.stringify(printBgImage));
      localStorage.setItem('polycables_slip_pad_bg_opacity', bgOpacity.toString());
      localStorage.setItem('polycables_slip_pad_bg_scale', bgScale.toString());
      localStorage.setItem('polycables_slip_pad_bg_offset_x', bgOffsetX.toString());
      localStorage.setItem('polycables_slip_pad_bg_offset_y', bgOffsetY.toString());
      if (customBgUrl) {
        localStorage.setItem('polycables_slip_pad_custom_bg_url', customBgUrl);
      } else {
        localStorage.removeItem('polycables_slip_pad_custom_bg_url');
      }
    } catch {}
  }, [showBgImage, printBgImage, bgOpacity, bgScale, bgOffsetX, bgOffsetY, customBgUrl]);

  const handleUploadBgFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const url = e.target.result as string;
        setCustomBgUrl(url);
        setShowBgImage(true);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetImageAdjustments = () => {
    setBgScale(1.0);
    setBgOffsetX(0);
    setBgOffsetY(0);
    setBgOpacity(0.6);
  };

  // Font Size quick toolbar
  const [showFontSizeToolbar, setShowFontSizeToolbar] = useState(false);

  // Totals position quick toolbar
  const [showTotalsPositionToolbar, setShowTotalsPositionToolbar] = useState(false);

  const [showPrinterAutoConfigModal, setShowPrinterAutoConfigModal] = useState(false);
  const saveSlipChallanBtnRef = useRef<HTMLButtonElement>(null);
  const slipDiscountAmountInputRef = useRef<HTMLInputElement>(null);

  // Local form state if uncontrolled
  const [localChallanNo, setLocalChallanNo] = useState(challan?.challanNo || 'C-001');
  const [localChallanDate, setLocalChallanDate] = useState(challan?.date || formatDateDDMMYY(new Date().toISOString()));
  const [localOrderNumber, setLocalOrderNumber] = useState(challan?.orderNumber || '');
  const [localOrderDate, setLocalOrderDate] = useState(challan?.orderDate || '');
  const [localRefNo, setLocalRefNo] = useState(challan?.refNo || '');
  const [localRemarks, setLocalRemarks] = useState(challan?.remarks || '');
  const [localSalesmanCode, setLocalSalesmanCode] = useState(challan?.salesmanCode || '');
  const [localSalespersonName, setLocalSalespersonName] = useState(challan?.salespersonName || '');
  const [localPartyName, setLocalPartyName] = useState(challan?.partyName || '');
  const [localPartyAddress, setLocalPartyAddress] = useState(challan?.address || '');
  const [localPartyPhone, setLocalPartyPhone] = useState(challan?.phone || '');
  const [localDiscountPercent, setLocalDiscountPercent] = useState(challan?.discountPercent || 0);
  const [localDiscountAmount, setLocalDiscountAmount] = useState(challan?.discountAmount || 0);
  const [localAdvanceAmount, setLocalAdvanceAmount] = useState(challan?.advanceAmount || 0);

  const [localFormLines, setLocalFormLines] = useState<ChallanLineItem[]>(() => {
    if (challan?.lines && challan.lines.length > 0) {
      return challan.lines;
    }
    return [
      { id: '1', slNo: 1, itemDescription: '', sizeSpec: '', coilQty: 0, billedQty: 0, dueQty: 0, unit: 'Coils', rate: 0, amount: 0 },
      { id: '2', slNo: 2, itemDescription: '', sizeSpec: '', coilQty: 0, billedQty: 0, dueQty: 0, unit: 'Coils', rate: 0, amount: 0 },
      { id: '3', slNo: 3, itemDescription: '', sizeSpec: '', coilQty: 0, billedQty: 0, dueQty: 0, unit: 'Coils', rate: 0, amount: 0 },
      { id: '4', slNo: 4, itemDescription: '', sizeSpec: '', coilQty: 0, billedQty: 0, dueQty: 0, unit: 'Coils', rate: 0, amount: 0 }
    ];
  });

  // Effective state bindings
  const challanNo = propChallanNo !== undefined ? propChallanNo : localChallanNo;
  const setChallanNo = propSetChallanNo || setLocalChallanNo;

  const challanDate = propChallanDate !== undefined ? propChallanDate : localChallanDate;
  const setChallanDate = propSetChallanDate || setLocalChallanDate;

  const orderNumber = propOrderNumber !== undefined ? propOrderNumber : localOrderNumber;
  const setOrderNumber = propSetOrderNumber || setLocalOrderNumber;

  const orderDate = propOrderDate !== undefined ? propOrderDate : localOrderDate;
  const setOrderDate = propSetOrderDate || setLocalOrderDate;

  const refNo = propRefNo !== undefined ? propRefNo : localRefNo;
  const setRefNo = propSetRefNo || setLocalRefNo;

  const remarks = propRemarks !== undefined ? propRemarks : localRemarks;
  const setRemarks = propSetRemarks || setLocalRemarks;

  const salesmanCode = propSalesmanCode !== undefined ? propSalesmanCode : localSalesmanCode;
  const setSalesmanCode = propSetSalesmanCode || setLocalSalesmanCode;

  const salespersonName = propSalespersonName !== undefined ? propSalespersonName : localSalespersonName;
  const setSalespersonName = propSetSalespersonName || setLocalSalespersonName;

  const partyName = propPartyName !== undefined ? propPartyName : localPartyName;
  const setPartyName = propSetPartyName || setLocalPartyName;

  const partyAddress = propPartyAddress !== undefined ? propPartyAddress : localPartyAddress;
  const setPartyAddress = propSetPartyAddress || setLocalPartyAddress;

  const partyPhone = propPartyPhone !== undefined ? propPartyPhone : localPartyPhone;
  const setPartyPhone = propSetPartyPhone || setLocalPartyPhone;

  const formLines = propFormLines !== undefined ? propFormLines : localFormLines;
  const setFormLines = propSetFormLines || setLocalFormLines;

  const discountPercent = propChallanDiscountPercent !== undefined ? propChallanDiscountPercent : localDiscountPercent;
  const setDiscountPercent = propSetChallanDiscountPercent || setLocalDiscountPercent;

  const discountAmount = propChallanDiscountAmount !== undefined ? propChallanDiscountAmount : localDiscountAmount;
  const setDiscountAmount = propSetChallanDiscountAmount || setLocalDiscountAmount;

  const advanceAmount = propChallanAdvanceAmount !== undefined ? propChallanAdvanceAmount : localAdvanceAmount;
  const setAdvanceAmount = propSetChallanAdvanceAmount || setLocalAdvanceAmount;

  // Party Dropdown & Dynamic Search States
  const [showPartyDropdown, setShowPartyDropdown] = useState(false);
  const [partySearchQuery, setPartySearchQuery] = useState('');
  const [partyHighlightIdx, setPartyHighlightIdx] = useState(0);
  const partyContainerRef = useRef<HTMLDivElement>(null);
  const partyDropdownRef = useRef<HTMLDivElement>(null);

  const [activeItemDropdownIdx, setActiveItemDropdownIdx] = useState<number | null>(null);
  const [itemHighlightIdx, setItemHighlightIdx] = useState(0);
  const itemDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPartyDropdown || !partyDropdownRef.current) return;
    const el = partyDropdownRef.current.querySelector('[data-slip-party-highlighted="true"]') as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [partyHighlightIdx, showPartyDropdown]);

  useEffect(() => {
    if (activeItemDropdownIdx === null || !itemDropdownRef.current) return;
    const el = itemDropdownRef.current.querySelector('[data-slip-item-highlighted="true"]') as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [itemHighlightIdx, activeItemDropdownIdx]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (partyContainerRef.current && !partyContainerRef.current.contains(target)) {
        setShowPartyDropdown(false);
      }
      if (!target.closest('.slip-item-row-container')) {
        setActiveItemDropdownIdx(null);
      }
    };

    document.addEventListener('mousedown', handleGlobalClick);
    return () => {
      document.removeEventListener('mousedown', handleGlobalClick);
    };
  }, []);

  // Filtered Parties using multi-token search
  const filteredParties = useMemo(() => {
    const query = partySearchQuery.trim().toLowerCase();
    if (!query) return parties;

    const tokens = query.split(/\s+/).filter(Boolean);
    return parties.filter((p) => {
      const searchTarget = `${p.name || ''} ${p.address || ''} ${p.phone || ''} ${p.salesmanCode || ''} ${p.salespersonName || ''}`.toLowerCase();
      return tokens.every((token) => searchTarget.includes(token));
    });
  }, [parties, partySearchQuery]);

  // Calculations
  const grossAmount = formLines.reduce((sum, line) => sum + (line.amount || 0), 0);
  const totalCoilQty = formLines.reduce((sum, line) => sum + (Number(line.coilQty) || 0), 0);
  const effectiveDiscountAmount = discountAmount || Math.round((grossAmount * discountPercent) / 100);
  const netAmount = Math.max(0, grossAmount - effectiveDiscountAmount);
  const dueBalance = Math.max(0, netAmount - advanceAmount);
  const inWords = convertToTakaWords(netAmount);
  const { line1: inWordsLine1, line2: inWordsLine2 } = useMemo(() => splitInWords(inWords), [inWords]);

  // Handlers
  const handleSelectParty = (p: Party) => {
    setPartyName(p.name);
    setPartyAddress(p.address || '');
    if (p.phone) setPartyPhone(p.phone);
    if (p.salesmanCode) {
      setSalesmanCode(p.salesmanCode);
      const sp = salespersons.find((s) => s.code.toLowerCase() === (p.salesmanCode || '').toLowerCase());
      setSalespersonName(sp ? sp.name : p.salesmanCode);
    }
    setPartySearchQuery('');
    setShowPartyDropdown(false);
  };

  const handleSelectItem = (idx: number, item: Item) => {
    setFormLines((prev) => {
      const updated = [...prev];
      const currentQty = updated[idx]?.coilQty || 1;
      const rate = item.rate || 0;
      const amt = currentQty * rate;
      let finalUnit = item.unit || 'Coils';
      if (/^coils?$/i.test(finalUnit)) {
        finalUnit = currentQty === 1 ? 'Coil' : 'Coils';
      } else if (/^(meters?|mtrs?)$/i.test(finalUnit)) {
        finalUnit = currentQty === 1 ? 'Meter' : 'Meters';
      }
      updated[idx] = {
        ...updated[idx],
        itemDescription: item.name,
        sizeSpec: item.sizeSpec || '',
        unit: finalUnit,
        rate: rate,
        amount: amt
      };
      return updated;
    });
    setActiveItemDropdownIdx(null);
    const nextQtyInput = document.getElementById(`slip-challan-qty-${idx}`) as HTMLInputElement | null;
    if (nextQtyInput) {
      setTimeout(() => {
        nextQtyInput.focus();
        nextQtyInput.select();
      }, 50);
    }
  };

  const handleLineChange = (index: number, field: keyof ChallanLineItem, value: any) => {
    setFormLines((prev) => {
      const updated = [...prev];
      let val = value;
      if (field === 'coilQty') {
        val = value === '' ? 0 : Number(value);
        if (isNaN(val)) val = 0;
      } else if (field === 'rate') {
        val = value === '' ? 0 : Number(value);
        if (isNaN(val)) val = 0;
      }
      const current = { ...updated[index], [field]: val };

      if (field === 'coilQty' || field === 'rate') {
        const q = Number(current.coilQty) || 0;
        const r = Number(current.rate) || 0;
        current.amount = Math.round(q * r);
        current.dueQty = Math.max(0, q - (current.billedQty || 0));

        if (field === 'coilQty') {
          if (!current.unit || /^coils?$/i.test(current.unit)) {
            current.unit = q === 1 ? 'Coil' : 'Coils';
          } else if (/^(meters?|mtrs?)$/i.test(current.unit)) {
            current.unit = q === 1 ? 'Meter' : 'Meters';
          }
        }
      }

      updated[index] = current;
      return updated;
    });
  };

  const handleSaveOnlyAction = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (onSave) {
      onSave(e, false);
      return;
    }

    if (onSaveChallan) {
      const activeLines = formLines.filter(
        (l) => (l.itemDescription && l.itemDescription.trim() !== '') || (Number(l.coilQty) || 0) > 0
      );
      const userBranch = currentUser && branches && branches.length > 0 ? getUserBranch(currentUser, salespersons, branches) : null;
      const matchedSp = salespersons.find(
        (s) => (s.code || '').toLowerCase() === (salesmanCode || '').trim().toLowerCase() || (s.name || '').toLowerCase() === (salespersonName || '').trim().toLowerCase()
      );
      const matchedParty = parties.find(
        (p) => (p.name || '').trim().toLowerCase() === (partyName || '').trim().toLowerCase()
      );

      const resolvedBranchId = challan?.branchId || userBranch?.branchId || matchedSp?.branchId || matchedParty?.branchId;
      const resolvedBranchName = challan?.branchName || userBranch?.branchName || matchedSp?.branchName;

      const newChallan: DeliveryChallan = {
        id: challan?.id || `challan-${Date.now()}`,
        challanNo: (challanNo || 'C-001').trim(),
        date: challanDate || formatDateDDMMYY(new Date().toISOString()),
        branchId: resolvedBranchId,
        branchName: resolvedBranchName,
        partyName: (partyName || '').trim(),
        address: (partyAddress || '').trim(),
        phone: (partyPhone || '').trim(),
        orderNumber: (orderNumber || '').trim(),
        orderDate: (orderDate || '').trim(),
        salesmanCode: (salesmanCode || '').trim(),
        salespersonName: (salespersonName || '').trim(),
        refNo: (refNo || '').trim(),
        remarks: (remarks || '').trim(),
        lines: activeLines,
        totalQuantity: totalCoilQty,
        totalAmount: grossAmount,
        discountPercent,
        discountAmount: effectiveDiscountAmount,
        netAmount,
        advanceAmount,
        dueBalance,
        inWords,
        status: challan?.status || 'unbilled',
        savedAt: challan?.savedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (setDeliveryChallans) {
        setDeliveryChallans((prev) => {
          const exists = prev.some((c) => c.id === newChallan.id);
          if (exists) {
            return prev.map((c) => (c.id === newChallan.id ? newChallan : c));
          }
          return [newChallan, ...prev];
        });
      }

      onSaveChallan(newChallan);
    }
  };

  const handlePrintAction = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();

    // 1. Save challan first
    handleSaveOnlyAction();

    // 2. Trigger auto-configured print with 5.5" x 8.5" slip pad settings & zero margin
    const config = getSavedPrinterConfig('slip_pad');
    triggerAutoConfiguredPrint('slip_pad', {
      paperPreset: 'pad_5.5x8.5',
      orientation: 'portrait',
      marginsMm: config.marginsMm ?? 0,
      offsetXmm: config.offsetXmm ?? 0,
      offsetYmm: config.offsetYmm ?? 0,
      scale: config.scale ?? 1.0,
      exactColors: true
    });
  };

  // Keyboard shortcut listener (Alt+A, Alt+P, Alt+S, Alt+C, Alt+M, Alt+I)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

      // Alt+M: Toggle Universal Moving Studio
      if (e.altKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        setShowMovingStudio((prev) => !prev);
        setShowImageControls(false);
        return;
      }

      // Alt+I: Toggle Image & Visibility Controls
      if (e.altKey && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        setShowImageControls((prev) => !prev);
        setShowMovingStudio(false);
        return;
      }

      // Alt+A: Open Printer Auto-Configuration
      if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setShowPrinterAutoConfigModal(true);
        return;
      }

      // Alt+P or Ctrl+P: Save & Print
      if ((e.altKey && (e.key === 'p' || e.key === 'P')) || (e.ctrlKey && (e.key === 'p' || e.key === 'P'))) {
        e.preventDefault();
        handlePrintAction();
        return;
      }

      // Alt+S or Ctrl+S: Save
      if ((e.altKey && (e.key === 's' || e.key === 'S')) || (e.ctrlKey && (e.key === 's' || e.key === 'S'))) {
        e.preventDefault();
        handleSaveOnlyAction();
        return;
      }

      // Alt+C: Clear
      if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        if (onClear) onClear();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    challan,
    challanNo,
    challanDate,
    partyName,
    partyAddress,
    partyPhone,
    orderNumber,
    orderDate,
    salesmanCode,
    salespersonName,
    refNo,
    remarks,
    formLines,
    totalCoilQty,
    grossAmount,
    discountPercent,
    effectiveDiscountAmount,
    netAmount,
    advanceAmount,
    dueBalance,
    inWords,
    onSave,
    onSaveChallan,
    onClear
  ]);

  return (
    <div className="flex flex-col cyber-glass-card text-white rounded-2xl overflow-hidden border border-cyan-500/25 space-y-3 p-3 font-sans">
      {/* Print Specific CSS for 5.5" x 8.5" Half-Letter Pre-printed Paper */}
      <style>{`
        @page {
          size: 5.5in 8.5in;
          margin: 0mm !important;
          margin-top: 0 !important;
          margin-bottom: 0 !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        @media print {
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: 100% !important;
            max-height: 100% !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: flex-start !important;
          }
          .no-print {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
          }
          .hide-in-print {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
          }
          .printable-slip-pad {
            position: relative !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            margin: 0 auto !important;
            margin-top: 0 !important;
            margin-bottom: 0 !important;
            margin-left: auto !important;
            margin-right: auto !important;
            width: 5.5in !important;
            height: 8.5in !important;
            max-width: 5.5in !important;
            max-height: 8.5in !important;
            min-width: 5.5in !important;
            min-height: 8.5in !important;
            box-shadow: none !important;
            border: none !important;
            transform: scale(1) !important;
            transform-origin: top center !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: hidden !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            break-after: avoid !important;
            break-inside: avoid !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      {/* TOP HEADER CONTROLS TOOLBAR (Editing, Format Switch, Image Check, Zoom & Print) */}
      <div className="cyber-glass-header border border-cyan-500/25 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 no-print">
        {/* Left: Title & Mode Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-2 mr-1">
            <div className="bg-cyan-500/15 p-2 rounded-lg border border-cyan-400/30">
              <FileSpreadsheet className="w-4 h-4 text-cyan-300" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">
                Slip Pad (5.5" × 8.5") Mode
              </span>
              <span className="text-[10px] text-emerald-400 font-semibold flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Pre-Printed Pad Editor & Alignment Checker</span>
              </span>
            </div>
          </div>

          {/* Header Mode Switcher (Hide Logo / Plain Paper) */}
          <div className="flex items-center bg-[#061520] rounded-lg p-0.5 border border-cyan-500/25 space-x-1 text-xs">
            <button
              type="button"
              onClick={() => setPadHeaderMode('hide_logo')}
              className={`px-2.5 py-1 rounded font-bold transition-all cursor-pointer ${
                padHeaderMode === 'hide_logo'
                  ? 'bg-cyan-400 text-slate-950 shadow-xs font-black'
                  : 'text-slate-300 hover:text-white hover:bg-[#0e2a3d]'
              }`}
              title="Pad (Hide Logo): Hide top company title & logo for pre-printed memo slip pad"
            >
              Pad (Hide Logo)
            </button>
            <button
              type="button"
              onClick={() => setPadHeaderMode('plain')}
              className={`px-2.5 py-1 rounded font-bold transition-all cursor-pointer ${
                padHeaderMode === 'plain'
                  ? 'bg-emerald-500 text-slate-950 shadow-xs font-black'
                  : 'text-slate-300 hover:text-white hover:bg-[#0e2a3d]'
              }`}
              title="Plain Paper: Print full company branding, logo & address on plain paper"
            >
              Plain Paper
            </button>
          </div>
        </div>

        {/* Center/Right: Moving System, Image Controls, Zoom, Print */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Universal Mover & Calibration Studio Button */}
          <button
            type="button"
            onClick={() => {
              setShowMovingStudio((prev) => !prev);
              if (!showMovingStudio) {
                setShowImageControls(false);
                setShowFontSizeToolbar(false);
                setShowTotalsPositionToolbar(false);
              }
            }}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center space-x-1.5 cursor-pointer transition-all border ${
              showMovingStudio
                ? 'bg-cyan-400 text-slate-950 border-cyan-300 font-black shadow-md'
                : 'bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-300 hover:text-cyan-200 border-cyan-500/25'
            }`}
            title="Slip Pad Settings & Calibration Studio (Alt+M)"
          >
            <Move className="w-3.5 h-3.5" />
            <span>Pad Settings & Mover</span>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
          </button>

          {/* Background Image & Visibility Controls Button & Quick Toggles */}
          <div className="flex items-center bg-[#061520] rounded-lg p-0.5 border border-cyan-500/25 space-x-1">
            <button
              type="button"
              onClick={() => {
                setShowImageControls((prev) => !prev);
                if (!showImageControls) {
                  setShowMovingStudio(false);
                  setShowFontSizeToolbar(false);
                  setShowTotalsPositionToolbar(false);
                }
              }}
              className={`px-2.5 py-1 rounded-md font-bold text-xs flex items-center space-x-1.5 cursor-pointer transition-all ${
                showImageControls
                  ? 'bg-purple-500 text-white font-extrabold shadow-md'
                  : 'hover:bg-[#0e2a3d] text-purple-300 hover:text-purple-200'
              }`}
              title="Scanned Pad Image Controls (Alt+I)"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Scanned Pad</span>
            </button>

            {/* Quick Screen Visibility Toggle */}
            <button
              type="button"
              onClick={() => setShowBgImage((prev) => !prev)}
              className={`px-1.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-all flex items-center space-x-1 ${
                showBgImage
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-[#081b28] text-slate-400 hover:text-slate-200'
              }`}
              title={`Screen pad visibility: ${showBgImage ? 'ON' : 'OFF'}`}
            >
              <span>{showBgImage ? 'View Pad' : 'Hide Pad'}</span>
            </button>

            {/* Quick Print Visibility Toggle */}
            <button
              type="button"
              onClick={() => setPrintBgImage((prev) => !prev)}
              className={`px-1.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-all flex items-center space-x-1 ${
                printBgImage
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                  : 'bg-[#081b28] text-slate-400 hover:text-slate-200'
              }`}
              title={`Print background pad image: ${printBgImage ? 'Print ON' : 'Print OFF'}`}
            >
              <span>{printBgImage ? 'Print ON' : 'Print OFF'}</span>
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center bg-[#061520] rounded-lg p-1 border border-cyan-500/25 space-x-1 text-xs">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(0.7, parseFloat((z - 0.1).toFixed(1))))}
              className="p-1 bg-[#081b28] hover:bg-[#0e2a3d] rounded text-cyan-200 cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono font-bold text-slate-200 text-xs w-10 text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(1.4, parseFloat((z + 0.1).toFixed(1))))}
              className="p-1 bg-[#081b28] hover:bg-[#0e2a3d] rounded text-cyan-200 cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(1.0)}
              className="px-2 py-0.5 bg-[#081b28] hover:bg-[#0e2a3d] rounded text-cyan-200 cursor-pointer text-[10px]"
            >
              100%
            </button>
          </div>

          {/* Auto-Config Printer Button */}
          <button
            type="button"
            onClick={() => setShowPrinterAutoConfigModal(true)}
            className="px-3 py-1.5 bg-purple-600/80 hover:bg-purple-500 text-white font-extrabold text-xs rounded-lg flex items-center space-x-1.5 shadow-md transition-all cursor-pointer border border-purple-400/40"
            title="Auto-configure 5.5 x 8.5 Paper Size, Zero Browser Margins, and exact print drivers (Alt+A)"
          >
            <Sliders className="w-3.5 h-3.5 text-purple-200" />
            <MnemonicLabel label="Auto-Fix Printer" mnemonic="A" />
          </button>

          {/* Print / Save & Print Button */}
          <button
            type="button"
            onClick={handlePrintAction}
            className="px-4 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs rounded-lg flex items-center space-x-1.5 shadow-md transition-all cursor-pointer"
            title="Print 5.5 x 8.5 Slip Pad (Ctrl+P / Alt+P)"
          >
            <Printer className="w-4 h-4" />
            <MnemonicLabel label="Save & Print" mnemonic="P" />
          </button>

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-200 bg-[#081b28] hover:bg-[#0e2a3d] hover:text-white border border-cyan-500/25 rounded-lg transition-all shadow-md active:scale-95 cursor-pointer"
              title="Back to Previous View"
            >
              <ArrowLeft className="w-4 h-4 text-cyan-300" />
              <span>Back</span>
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-200 bg-rose-950/70 hover:bg-rose-900 hover:text-white border border-rose-500/40 rounded-lg transition-all shadow-md active:scale-95 cursor-pointer"
              title="Close View"
            >
              <X className="w-4 h-4 text-rose-300" />
              <span>Close</span>
            </button>
          )}
        </div>
      </div>

      {/* 🎯 UNIVERSAL MOVING & CALIBRATION STUDIO PANEL */}
      {showMovingStudio && (
        <SlipPadMovingStudio
          layout={layout}
          onChangeLayout={handleUpdateLayout}
          onResetLayout={handleResetLayout}
          selectedTarget={selectedMovingTarget}
          onSelectTarget={setSelectedMovingTarget}
          onClose={() => setShowMovingStudio(false)}
          showBgImage={showBgImage}
          onToggleShowBgImage={setShowBgImage}
          bgOpacity={bgOpacity}
          onChangeBgOpacity={setBgOpacity}
          customBgUrl={customBgUrl}
          onUploadCustomBg={handleUploadBgFile}
          onClearCustomBg={() => {
            setCustomBgUrl(null);
            localStorage.removeItem('polycables_slip_pad_custom_bg');
          }}
        />
      )}

      {/* 🖼️ IMAGE UPLOAD & VISIBILITY CONTROLS PANEL */}
      {showImageControls && (
        <SlipPadImageVisibilityControl
          customBgUrl={customBgUrl}
          onUploadImage={handleUploadBgFile}
          onSetCustomBgUrl={setCustomBgUrl}
          showBgImage={showBgImage}
          onToggleShowBgImage={setShowBgImage}
          printBgImage={printBgImage}
          onTogglePrintBgImage={setPrintBgImage}
          bgOpacity={bgOpacity}
          onChangeOpacity={setBgOpacity}
          bgScale={bgScale}
          onChangeScale={setBgScale}
          bgOffsetX={bgOffsetX}
          onChangeOffsetX={setBgOffsetX}
          bgOffsetY={bgOffsetY}
          onChangeOffsetY={setBgOffsetY}
          onResetImageAdjustments={handleResetImageAdjustments}
          onClose={() => setShowImageControls(false)}
        />
      )}

      {/* INTERACTIVE 5.5" x 8.5" SLIP PAD CANVAS */}
      <div className="p-4 sm:p-8 bg-[#05121b]/80 rounded-xl border border-cyan-500/15 flex flex-col items-center justify-start overflow-auto">
        <div
          className={`printable-slip-pad slip-pad-page slip-pad-portrait print-page-break bg-white text-black shadow-2xl border border-slate-300 relative select-none origin-top transition-transform duration-100 flex-shrink-0 font-sans ${
            padHeaderMode === 'hide_all' ? 'print-preprinted-mode' : ''
          }`}
          style={{
            width: `${PAD_WIDTH_PX}px`,
            height: `${PAD_HEIGHT_PX}px`,
            minWidth: `${PAD_WIDTH_PX}px`,
            minHeight: `${PAD_HEIGHT_PX}px`,
            maxWidth: `${PAD_WIDTH_PX}px`,
            maxHeight: `${PAD_HEIGHT_PX}px`,
            transform: `scale(${zoomLevel})`
          }}
        >
          {/* ========================================================================= */}
          {/* BACKGROUND TEMPLATE ARTWORK / ALIGNMENT OVERLAY */}
          {/* ========================================================================= */}
          {showBgImage && (
            <div
              className={`slip-pad-bg-image-check absolute inset-0 pointer-events-none z-0 overflow-hidden ${
                printBgImage || padHeaderMode === 'plain' ? '' : 'hide-in-print no-print'
              }`}
              style={{
                opacity: padHeaderMode === 'plain' ? 1.0 : bgOpacity,
                transform: `translate(${bgOffsetX}px, ${bgOffsetY}px) scale(${bgScale})`,
                transformOrigin: 'top center'
              }}
            >
              {customBgUrl ? (
                <img
                  src={customBgUrl}
                  alt="Custom Pre-printed Slip Pad Template"
                  className="w-full h-full object-fill select-none"
                />
              ) : (
                /* Authentic Built-in Pre-Printed Slip Pad Vector Artwork matching Pad.jpeg */
                <div className="w-full h-full bg-white relative flex flex-col justify-between font-sans overflow-hidden">
                  {/* Top Navy Banner */}
                  <div
                    className={`relative w-full h-[1.10in] bg-[#142058] overflow-hidden flex items-center justify-between px-4 ${
                      padHeaderMode !== 'plain' ? 'invisible opacity-0' : 'visible opacity-100'
                    }`}
                  >
                    {/* 4-Circle Logo on Left */}
                    <div className="relative z-10 flex items-center space-x-2">
                      <div className="relative w-12 h-12 flex-shrink-0">
                        <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
                          <circle cx="50" cy="50" r="26" fill="#38bdf8" opacity="0.75" />
                          <circle cx="50" cy="22" r="16" fill="#facc15" />
                          <circle cx="22" cy="50" r="16" fill="#0284c7" />
                          <circle cx="50" cy="78" r="16" fill="#ef4444" />
                          <circle cx="78" cy="50" r="16" fill="#22c55e" />
                        </svg>
                      </div>
                    </div>

                    {/* Brand Name & Slogan on Right */}
                    <div className="relative z-10 text-right text-white pr-2">
                      <h1 className="text-2xl font-black italic tracking-wide font-sans drop-shadow-sm leading-none text-white">
                        POLY CABLES
                      </h1>
                      <p className="text-xs font-semibold tracking-wider text-white/95 mt-1 font-sans">
                        Safety in Every Connection
                      </p>
                    </div>

                    {/* Golden swoosh decoration */}
                    <svg
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      viewBox="0 0 500 110"
                      preserveAspectRatio="none"
                    >
                      <path
                        d="M 0,105 Q 90,110 160,80 T 500,75 L 500,110 L 0,110 Z"
                        fill="#f59e0b"
                        opacity="0.45"
                      />
                      <path
                        d="M 0,100 Q 70,105 125,75 T 220,110 L 0,110 Z"
                        fill="#d97706"
                        opacity="0.65"
                      />
                    </svg>
                  </div>

                  {/* Top Metadata Field English Labels & Dotted Guides */}
                  <div className="relative w-full px-4 pt-2 text-slate-900 text-xs font-medium">
                    {/* Top Row: Date: (Right) */}
                    <div className="flex justify-end items-center h-6">
                      <div className="flex items-center space-x-1">
                        <span className="font-bold text-slate-900 text-xs whitespace-nowrap preprinted-static-label">Date:</span>
                        <span className="inline-block w-28 border-b border-dotted border-slate-600"></span>
                      </div>
                    </div>

                    {/* Middle Row: Name: (Left) & Phone: (Right) */}
                    <div className="flex justify-between items-center h-6 mt-0.5">
                      <div className="flex items-center space-x-1 flex-1 mr-3">
                        <span className="font-bold text-slate-900 text-xs whitespace-nowrap preprinted-static-label">Name:</span>
                        <span className="inline-block flex-1 border-b border-dotted border-slate-600"></span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span className="font-bold text-slate-900 text-xs whitespace-nowrap preprinted-static-label">Phone:</span>
                        <span className="inline-block w-28 border-b border-dotted border-slate-600"></span>
                      </div>
                    </div>

                    {/* Bottom Row: Address: (Full Width) */}
                    <div className="flex items-center space-x-1 h-6 mt-0.5">
                      <span className="font-bold text-slate-900 text-xs whitespace-nowrap preprinted-static-label">Address:</span>
                      <span className="inline-block flex-1 border-b border-dotted border-slate-600"></span>
                    </div>
                  </div>

                  {/* Pre-printed Table Grid Header & 14 Ruled Rows */}
                  <div className="relative mx-4 mt-2 border border-[#142058]">
                    {/* Table Header Bar */}
                    <div className="grid grid-cols-[42px_1fr_44px_58px_86px] bg-[#142058] text-white text-[11px] font-bold text-center border-b border-[#142058]">
                      <div className="py-1 border-r border-white/40">SL</div>
                      <div className="py-1 border-r border-white/40">Item Description</div>
                      <div className="py-1 border-r border-white/40">Qty</div>
                      <div className="py-1 border-r border-white/40">Rate</div>
                      <div className="py-1">Amount</div>
                    </div>

                    {/* 14 Ruled Rows */}
                    {Array.from({ length: 14 }).map((_, idx) => (
                      <div
                        key={`pad-grid-row-${idx}`}
                        className="grid grid-cols-[42px_1fr_44px_58px_86px] h-[24.5px] border-b border-slate-400 last:border-b-0"
                      >
                        <div className="border-r border-slate-400"></div>
                        <div className="border-r border-slate-400"></div>
                        <div className="border-r border-slate-400"></div>
                        <div className="border-r border-slate-400"></div>
                        <div></div>
                      </div>
                    ))}
                  </div>

                  {/* Bottom Area: In Words: with dotted baseline rows */}
                  <div className="relative mx-4 mt-2 flex justify-between items-start">
                    <div className="flex-1 pr-3 space-y-2 pt-1">
                      <div className="flex items-center space-x-1">
                        <span className="font-bold text-slate-900 text-[11px] whitespace-nowrap preprinted-static-label">In Words:</span>
                        <span className="inline-block flex-1 border-b border-dotted border-slate-600"></span>
                      </div>
                      <div className="flex items-center pl-4">
                        <span className="inline-block w-full border-b border-dotted border-slate-600"></span>
                      </div>
                    </div>
                  </div>

                  {/* Watermark in plain mode */}
                  {padHeaderMode === 'plain' && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-[0.04] pointer-events-none">
                      <svg viewBox="0 0 100 100" className="w-80 h-80">
                        <circle cx="50" cy="50" r="26" fill="#38bdf8" />
                        <circle cx="50" cy="22" r="16" fill="#facc15" />
                        <circle cx="22" cy="50" r="16" fill="#0284c7" />
                        <circle cx="50" cy="78" r="16" fill="#ef4444" />
                        <circle cx="78" cy="50" r="16" fill="#22c55e" />
                      </svg>
                    </div>
                  )}

                  {/* Bottom spacer (No colored accent decor) */}
                  <div className="w-full mt-auto h-2 pointer-events-none" />
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TOP METADATA TYPED DATA (Date, Party Name, Phone, Address) */}
          {/* ========================================================================= */}

          {/* Date */}
          <div
            onClick={() => {
              if (showMovingStudio) setSelectedMovingTarget('date');
            }}
            className={`absolute z-20 font-mono font-bold text-slate-900 flex items-center print-font-value transition-all ${
              showMovingStudio && selectedMovingTarget === 'date'
                ? 'ring-2 ring-blue-500 bg-blue-50/50 rounded'
                : ''
            }`}
            style={{
              left: `${layout.date.left * DPI}px`,
              top: `${layout.date.top * DPI}px`,
              width: `${layout.date.width * DPI}px`,
              fontSize: `${layout.date.fontSize}px`
            }}
          >
            <input
              type="text"
              value={formatDateDDMMYY(challanDate) || challanDate}
              onChange={(e) => setChallanDate(e.target.value)}
              placeholder="dd.mm.yy"
              style={{ fontSize: `${layout.date.fontSize}px` }}
              className="w-full bg-transparent font-mono font-bold text-slate-900 focus:outline-none no-print pl-1"
            />
            <input
              type="date"
              onChange={(e) => {
                if (e.target.value) {
                  setChallanDate(formatDateDDMMYY(e.target.value));
                }
              }}
              className="w-3.5 h-3.5 opacity-0 cursor-pointer no-print ml-1"
              title="Pick Date"
            />
            <Calendar className="w-3.5 h-3.5 text-slate-500 pointer-events-none no-print -ml-3.5" />
            <div
              style={{ fontSize: `${layout.date.fontSize}px` }}
              className="hidden print:block font-mono font-bold text-slate-900 pl-1"
            >
              {formatDateDDMMYY(challanDate) || '\u00A0'}
            </div>
          </div>

          {/* Party Name with Dynamic Search Box & Autocomplete */}
          <div
            ref={partyContainerRef}
            onClick={() => {
              if (showMovingStudio) setSelectedMovingTarget('partyName');
            }}
            className={`absolute z-30 font-bold text-slate-950 print-font-value transition-all ${
              showMovingStudio && selectedMovingTarget === 'partyName'
                ? 'ring-2 ring-amber-400 bg-amber-50/50 rounded'
                : ''
            }`}
            style={{
              left: `${layout.partyName.left * DPI}px`,
              top: `${layout.partyName.top * DPI}px`,
              width: `${layout.partyName.width * DPI}px`,
              fontSize: `${layout.partyName.fontSize}px`
            }}
          >
            <div className="relative flex items-center">
              <input
                id="slip-pad-party-input"
                type="text"
                value={partyName}
                onFocus={() => {
                  setShowPartyDropdown(true);
                  setPartySearchQuery('');
                  setPartyHighlightIdx(0);
                }}
                onChange={(e) => {
                  const val = e.target.value;
                  setPartyName(val);
                  if (!val.trim()) {
                    setPartyAddress('');
                    setPartyPhone('');
                    setSalesmanCode('');
                    setSalespersonName('');
                  }
                  setPartySearchQuery('');
                  setShowPartyDropdown(true);
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
                      if (chosen) handleSelectParty(chosen);
                    } else {
                      setShowPartyDropdown(false);
                      const addrInput = document.getElementById('slip-pad-address-input') as HTMLInputElement | null;
                      if (addrInput) addrInput.focus();
                    }
                  } else if (e.key === 'Escape') {
                    setShowPartyDropdown(false);
                  }
                }}
                placeholder="Search or enter party name..."
                style={{ fontSize: `${layout.partyName.fontSize}px` }}
                className="w-full bg-transparent font-bold text-black focus:outline-none focus:bg-amber-100/60 rounded px-1 -ml-1 truncate no-print"
              />

              {/* Action Buttons inside Party Box */}
              <div className="flex items-center space-x-0.5 no-print flex-none">
                {partyName && (
                  <button
                    type="button"
                    onClick={() => {
                      setPartyName('');
                      setPartyAddress('');
                      setPartyPhone('');
                      setPartySearchQuery('');
                      setShowPartyDropdown(true);
                    }}
                    className="p-0.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                    title="Clear party"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowPartyDropdown(!showPartyDropdown);
                    setPartySearchQuery('');
                  }}
                  className="p-0.5 text-slate-500 hover:text-slate-900 rounded cursor-pointer"
                  title="Show all parties"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>

              {/* Printable Display */}
              <div
                style={{ fontSize: `${layout.partyName.fontSize}px` }}
                className="hidden print:block font-bold text-black truncate"
              >
                {partyName || '\u00A0'}
              </div>

              {/* Party Search Dropdown */}
              {showPartyDropdown && (
                <div
                  ref={partyDropdownRef}
                  className="absolute left-0 top-full mt-1 w-80 max-h-60 overflow-y-auto bg-white border-2 border-indigo-600 rounded-xl shadow-2xl z-50 text-left font-sans text-xs divide-y divide-slate-100 no-print animate-in fade-in slide-in-from-top-2"
                >
                  <div className="p-2 bg-slate-900 text-white font-bold text-[10px] flex justify-between items-center sticky top-0 z-10">
                    <div className="flex items-center space-x-1">
                      <Search className="w-3 h-3 text-amber-400" />
                      <span>Select Party ({filteredParties.length} found)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPartyDropdown(false)}
                      className="text-slate-400 hover:text-white font-bold text-xs"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Search Filter Input in Dropdown Header */}
                  <div className="p-1.5 bg-slate-50 border-b border-slate-200 sticky top-[29px] z-10">
                    <div className="relative">
                      <Search className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
                      <input
                        type="text"
                        value={partySearchQuery}
                        onChange={(e) => {
                          setPartySearchQuery(e.target.value);
                          setPartyHighlightIdx(0);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (filteredParties.length > 0) {
                              setPartyHighlightIdx((prev) => (prev + 1) % filteredParties.length);
                            }
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (filteredParties.length > 0) {
                              setPartyHighlightIdx((prev) => (prev - 1 + filteredParties.length) % filteredParties.length);
                            }
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (filteredParties.length > 0) {
                              const chosen = filteredParties[partyHighlightIdx] || filteredParties[0];
                              if (chosen) handleSelectParty(chosen);
                            }
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setShowPartyDropdown(false);
                            (document.getElementById('slip-pad-party-input') as HTMLInputElement | null)?.focus();
                          }
                        }}
                        placeholder="Type to filter parties by name, address, phone..."
                        className="w-full pl-7 pr-6 py-1 text-[10px] bg-white border border-slate-300 rounded font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        autoFocus
                      />
                      {partySearchQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setPartySearchQuery('');
                            setPartyHighlightIdx(0);
                          }}
                          className="absolute right-1.5 top-1.5 text-slate-400 hover:text-slate-700 text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {filteredParties.length === 0 ? (
                    <div className="p-3 text-slate-500 text-center italic text-xs">
                      No matching party found. You can continue typing custom party name.
                    </div>
                  ) : (
                    filteredParties.map((p, idx) => (
                      <div
                        key={p.id ? `${p.id}-${idx}` : `party-${idx}`}
                        data-slip-party-highlighted={partyHighlightIdx === idx ? 'true' : 'false'}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectParty(p);
                        }}
                        onMouseEnter={() => setPartyHighlightIdx(idx)}
                        className={`p-2 transition-colors cursor-pointer flex justify-between items-center text-xs ${
                          partyHighlightIdx === idx
                            ? 'bg-amber-100 text-slate-950 font-bold'
                            : 'hover:bg-amber-50 text-slate-800'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-bold text-slate-900 text-xs truncate">{p.name}</div>
                          {p.address && <div className="text-[10px] text-slate-500 truncate">{p.address}</div>}
                          {p.phone && <div className="text-[9px] text-slate-400 font-mono font-medium">📞 {p.phone}</div>}
                        </div>
                        {p.salesmanCode && (
                          <div className="text-[9px] bg-slate-100 text-slate-700 border border-slate-300 px-1.5 py-0.5 rounded font-mono font-bold shrink-0">
                            [{p.salesmanCode}]
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Phone */}
          <div
            onClick={() => {
              if (showMovingStudio) setSelectedMovingTarget('phone');
            }}
            className={`absolute z-20 font-bold text-slate-950 print-font-value transition-all ${
              showMovingStudio && selectedMovingTarget === 'phone'
                ? 'ring-2 ring-emerald-400 bg-emerald-50/50 rounded'
                : ''
            }`}
            style={{
              left: `${layout.phone.left * DPI}px`,
              top: `${layout.phone.top * DPI}px`,
              width: `${layout.phone.width * DPI}px`,
              fontSize: `${layout.phone.fontSize}px`
            }}
          >
            <input
              type="text"
              value={partyPhone}
              onChange={(e) => setPartyPhone(e.target.value)}
              placeholder="01713..."
              style={{ fontSize: `${layout.phone.fontSize}px` }}
              className="w-full bg-transparent font-mono font-bold text-slate-950 focus:outline-none focus:bg-amber-100/60 rounded px-1 -ml-1 no-print"
            />
            <div
              style={{ fontSize: `${layout.phone.fontSize}px` }}
              className="hidden print:block font-mono font-bold text-slate-950 truncate pl-1"
            >
              {partyPhone || '\u00A0'}
            </div>
          </div>

          {/* Address */}
          <div
            onClick={() => {
              if (showMovingStudio) setSelectedMovingTarget('address');
            }}
            className={`absolute z-20 font-bold text-slate-900 print-font-value transition-all ${
              showMovingStudio && selectedMovingTarget === 'address'
                ? 'ring-2 ring-purple-400 bg-purple-50/50 rounded'
                : ''
            }`}
            style={{
              left: `${layout.address.left * DPI}px`,
              top: `${layout.address.top * DPI}px`,
              width: `${layout.address.width * DPI}px`,
              fontSize: `${layout.address.fontSize}px`
            }}
          >
            <input
              id="slip-pad-address-input"
              type="text"
              value={partyAddress}
              onChange={(e) => setPartyAddress(e.target.value)}
              placeholder="Address (e.g. Madhupur)"
              style={{ fontSize: `${layout.address.fontSize}px` }}
              className="w-full bg-transparent font-medium text-slate-900 focus:outline-none focus:bg-amber-100/60 rounded px-1 -ml-1 truncate no-print"
            />
            <div
              style={{ fontSize: `${layout.address.fontSize}px` }}
              className="hidden print:block font-medium text-slate-900 truncate"
            >
              {partyAddress || '\u00A0'}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* TABLE ROWS (Rows 1-12: Line Items, Row 13: Total Coils & Subtotal, Row 14: Sales Discount, Row 15: Total) */}
          {/* ========================================================================= */}
          {Array.from({ length: 15 }, (_, rIdx) => {
            const row = formLines[rIdx] || { itemDescription: '', coilQty: 0, rate: 0, amount: 0 };
            const rowTopY = layout.table.startY + rIdx * layout.table.rowHeight + (layout.rowYOffsets[rIdx] || 0);
            const isRow13 = rIdx === 12; // Row number 13
            const isRow14 = rIdx === 13; // Row number 14
            const isRow15 = rIdx === 14; // Row number 15
            const hasContent =
              (row.itemDescription && row.itemDescription.trim() !== '') ||
              (Number(row.coilQty) || 0) > 0 ||
              (Number(row.amount) || 0) > 0;

            const queryDesc = (row.itemDescription || '').trim();
            const matchedRawItems = items.filter((i) => {
              if (i.isActive === false) return false;
              if (!queryDesc) return true;
              const fullText = `${i.name} ${i.category || ''} ${i.sizeSpec || ''} ${i.brand || ''}`.trim();
              return matchesFlexibleSearch(fullText, queryDesc, i.code || '');
            });
            const orderedMatched = groupItemsByCategoryOrder(matchedRawItems, categoryOrder).orderedItems.slice(0, 80);
            const groupedFilteredItems = groupItemsByCategoryOrder(orderedMatched, categoryOrder);
            const filteredItems = groupedFilteredItems.orderedItems;

            return (
              <div
                key={rIdx}
                className={`slip-item-row-container absolute w-full flex items-center z-20 text-[12px] group ${
                  showMovingStudio && selectedMovingTarget === 'table_grid'
                    ? 'hover:bg-cyan-500/10'
                    : ''
                }`}
                style={{
                  top: `${rowTopY * DPI}px`,
                  height: `${layout.table.rowHeight * DPI}px`
                }}
              >
                {isRow13 ? (
                  <>
                    {/* Row 13 - SL */}
                    <div
                      className="absolute flex items-center justify-center font-mono text-slate-700 px-1 text-[12px]"
                      style={{
                        left: `${layout.columns.sl.left * DPI}px`,
                        width: `${layout.columns.sl.width * DPI}px`,
                        height: `${layout.table.rowHeight * DPI}px`
                      }}
                    ></div>

                    {/* Row 13 - Description Column: Total Coils = */}
                    <div
                      onClick={() => {
                        if (showMovingStudio) setSelectedMovingTarget('col_desc');
                      }}
                      className="absolute flex items-center justify-end font-bold text-slate-950 px-1 text-[12px] print-font-value"
                      style={{
                        left: `${layout.columns.description.left * DPI}px`,
                        width: `${layout.columns.description.width * DPI}px`,
                        height: `${layout.table.rowHeight * DPI}px`,
                        fontSize: `${layout.table.fontSize}px`
                      }}
                    >
                      Total Coils =
                    </div>

                    {/* Row 13 - Qty Column: Total Coils Value */}
                    <div
                      onClick={() => {
                        if (showMovingStudio) setSelectedMovingTarget('col_qty');
                      }}
                      className="absolute flex items-center justify-center font-mono font-bold text-slate-950 px-1 text-[12px] print-font-value"
                      style={{
                        left: `${layout.columns.qty.left * DPI}px`,
                        width: `${layout.columns.qty.width * DPI}px`,
                        height: `${layout.table.rowHeight * DPI}px`,
                        fontSize: `${layout.table.fontSize}px`
                      }}
                    >
                      {totalCoilQty > 0 ? Number(totalCoilQty) : '0'}
                    </div>

                    {/* Row 13 - Rate Column: Subtotal = */}
                    <div
                      onClick={() => {
                        if (showMovingStudio) setSelectedMovingTarget('col_rate');
                      }}
                      className="absolute flex items-center justify-end font-bold text-slate-900 px-1 text-[12px] whitespace-nowrap print-font-value"
                      style={{
                        left: `${layout.columns.rate.left * DPI}px`,
                        width: `${layout.columns.rate.width * DPI}px`,
                        height: `${layout.table.rowHeight * DPI}px`,
                        fontSize: `${layout.table.fontSize}px`
                      }}
                    >
                      Subtotal =
                    </div>

                    {/* Row 13 - Price/Amount Column: Subtotal Value Right Aligned */}
                    <div
                      onClick={() => {
                        if (showMovingStudio) setSelectedMovingTarget('col_amt');
                      }}
                      className="absolute flex items-center justify-end font-mono font-bold text-slate-950 px-1 text-[12px] print-font-value"
                      style={{
                        left: `${layout.columns.amount.left * DPI}px`,
                        width: `${layout.columns.amount.width * DPI}px`,
                        height: `${layout.table.rowHeight * DPI}px`,
                        fontSize: `${layout.table.fontSize}px`
                      }}
                    >
                      {grossAmount > 0 ? Number(grossAmount).toLocaleString() : '0'}
                    </div>
                  </>
                ) : isRow14 ? (
                  <>
                    {/* Row 14 - SL, Description, Qty empty */}
                    <div
                      className="absolute"
                      style={{
                        left: `${layout.columns.sl.left * DPI}px`,
                        width: `${(layout.columns.qty.left + layout.columns.qty.width - layout.columns.sl.left) * DPI}px`,
                        height: `${layout.table.rowHeight * DPI}px`
                      }}
                    ></div>

                    {/* Row 14 - Rate Column: Sales Discount _% = */}
                    <div
                      onClick={() => {
                        if (showMovingStudio) setSelectedMovingTarget('col_rate');
                      }}
                      className="absolute flex items-center justify-end font-bold text-slate-900 px-1 text-[11px] whitespace-nowrap print-font-value"
                      style={{
                        left: `${(layout.columns.rate.left - 0.35) * DPI}px`,
                        width: `${(layout.columns.rate.width + 0.35) * DPI}px`,
                        height: `${layout.table.rowHeight * DPI}px`,
                        fontSize: `${layout.table.fontSize - 1}px`
                      }}
                    >
                      <span>Sales Discount</span>
                      <div className="inline-flex items-center ml-0.5">
                        <input
                          id="slip-challan-discount-percent"
                          type="number"
                          min="0"
                          max="100"
                          step="any"
                          value={discountPercent === 0 ? '' : discountPercent}
                          onChange={(e) => {
                            const p = Number(e.target.value) || 0;
                            setDiscountPercent(p);
                            setDiscountAmount(Math.round((grossAmount * p) / 100));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (slipDiscountAmountInputRef.current) {
                                slipDiscountAmountInputRef.current.focus();
                                slipDiscountAmountInputRef.current.select();
                              } else if (saveSlipChallanBtnRef.current) {
                                saveSlipChallanBtnRef.current.focus();
                              }
                            }
                          }}
                          placeholder="0"
                          className="w-7 px-0.5 border border-slate-300 rounded text-center text-[10px] font-bold text-slate-800 bg-white no-print"
                          title="Discount % - Press Enter for Discount Amount"
                        />
                        <span className="font-bold text-slate-800 ml-0.5">
                          {discountPercent > 0 ? `${discountPercent}%` : '_%'} =
                        </span>
                      </div>
                    </div>

                    {/* Row 14 - Price/Amount Column: Discount Amount Right Aligned */}
                    <div
                      onClick={() => {
                        if (showMovingStudio) setSelectedMovingTarget('col_amt');
                      }}
                      className="absolute flex items-center justify-end font-mono font-semibold text-slate-900 px-1 text-[12px] print-font-value"
                      style={{
                        left: `${layout.columns.amount.left * DPI}px`,
                        width: `${layout.columns.amount.width * DPI}px`,
                        height: `${layout.table.rowHeight * DPI}px`,
                        fontSize: `${layout.table.fontSize}px`
                      }}
                    >
                      <input
                        ref={slipDiscountAmountInputRef}
                        type="number"
                        min="0"
                        value={effectiveDiscountAmount > 0 ? effectiveDiscountAmount : ''}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0;
                          setDiscountAmount(val);
                          if (grossAmount > 0) {
                            setDiscountPercent(Number(((val / grossAmount) * 100).toFixed(2)));
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (saveSlipChallanBtnRef.current) {
                              saveSlipChallanBtnRef.current.focus();
                            }
                          }
                        }}
                        placeholder="0"
                        className="w-14 text-right bg-white border border-slate-300 rounded px-0.5 text-[10px] font-mono font-bold text-slate-900 focus:outline-none no-print"
                        title="Discount Amount - Press Enter for Save Challan"
                      />
                      <span className="hidden print:inline">
                        {effectiveDiscountAmount > 0 ? `-${Number(effectiveDiscountAmount).toLocaleString()}` : '0'}
                      </span>
                    </div>
                  </>
                ) : isRow15 ? (
                  <>
                    {/* Row 15 - SL, Description, Qty empty */}
                    <div
                      className="absolute"
                      style={{
                        left: `${layout.columns.sl.left * DPI}px`,
                        width: `${(layout.columns.qty.left + layout.columns.qty.width - layout.columns.sl.left) * DPI}px`,
                        height: `${layout.table.rowHeight * DPI}px`
                      }}
                    ></div>

                    {/* Row 15 - Rate Column: Total = */}
                    <div
                      onClick={() => {
                        if (showMovingStudio) setSelectedMovingTarget('col_rate');
                      }}
                      className="absolute flex items-center justify-end font-black text-slate-950 px-1 text-[12.5px] whitespace-nowrap print-font-value"
                      style={{
                        left: `${layout.columns.rate.left * DPI}px`,
                        width: `${layout.columns.rate.width * DPI}px`,
                        height: `${layout.table.rowHeight * DPI}px`,
                        fontSize: `${layout.table.fontSize}px`
                      }}
                    >
                      <span className="font-black text-slate-950">Total =</span>
                    </div>

                    {/* Row 15 - Price/Amount Column: Total Amount Right Aligned (Clean, No Highlight Box) */}
                    <div
                      onClick={() => {
                        if (showMovingStudio) setSelectedMovingTarget('col_amt');
                      }}
                      className="absolute flex items-center justify-end text-right font-mono font-black text-slate-950 px-1 text-[12.5px] print-font-value"
                      style={{
                        left: `${layout.columns.amount.left * DPI}px`,
                        width: `${layout.columns.amount.width * DPI}px`,
                        height: `${layout.table.rowHeight * DPI}px`,
                        fontSize: `${layout.table.fontSize}px`
                      }}
                    >
                      <span className="font-mono font-black text-slate-950 text-right">
                        {netAmount > 0 ? Number(netAmount).toLocaleString() : '0'}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    {/* SL Column */}
                    <div
                      onClick={() => {
                        if (showMovingStudio) setSelectedMovingTarget('col_sl');
                      }}
                      className="absolute flex items-center justify-center font-mono font-bold text-slate-950 px-1 text-[12px] print-font-value"
                      style={{
                        left: `${layout.columns.sl.left * DPI}px`,
                        width: `${layout.columns.sl.width * DPI}px`,
                        height: `${layout.table.rowHeight * DPI}px`,
                        fontSize: `${layout.table.fontSize}px`
                      }}
                    >
                      {hasContent ? rIdx + 1 : ''}
                    </div>

                    {/* Description Column */}
                    <div
                      onClick={() => {
                        if (showMovingStudio) setSelectedMovingTarget('col_desc');
                      }}
                      className="absolute flex items-center font-bold text-slate-950 px-1 relative print-font-value"
                      style={{
                        left: `${layout.columns.description.left * DPI}px`,
                        width: `${layout.columns.description.width * DPI}px`,
                        height: `${layout.table.rowHeight * DPI}px`,
                        fontSize: `${layout.table.fontSize}px`
                      }}
                    >
                      <div className="relative flex items-center justify-between w-full h-full no-print">
                        <input
                          id={`slip-challan-desc-${rIdx}`}
                          type="text"
                          value={row.itemDescription || ''}
                          onFocus={() => {
                            setActiveItemDropdownIdx(rIdx);
                            setItemHighlightIdx(0);
                          }}
                          onChange={(e) => {
                            handleLineChange(rIdx, 'itemDescription', e.target.value);
                            setActiveItemDropdownIdx(rIdx);
                            setItemHighlightIdx(0);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              e.stopPropagation();
                              if (activeItemDropdownIdx !== rIdx) {
                                setActiveItemDropdownIdx(rIdx);
                                setItemHighlightIdx(0);
                              } else if (filteredItems.length > 0) {
                                setItemHighlightIdx((prev) => (prev + 1) % filteredItems.length);
                              }
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              e.stopPropagation();
                              if (activeItemDropdownIdx !== rIdx) {
                                setActiveItemDropdownIdx(rIdx);
                                setItemHighlightIdx(0);
                              } else if (filteredItems.length > 0) {
                                setItemHighlightIdx((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
                              }
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              e.stopPropagation();
                              if (activeItemDropdownIdx === rIdx && filteredItems.length > 0) {
                                const chosen = filteredItems[itemHighlightIdx] || filteredItems[0];
                                handleSelectItem(rIdx, chosen);
                              } else {
                                const qtyInput = document.getElementById(`slip-challan-qty-${rIdx}`) as HTMLInputElement | null;
                                if (qtyInput) {
                                  qtyInput.focus();
                                  qtyInput.select();
                                }
                              }
                            } else if (e.key === 'Escape') {
                              setActiveItemDropdownIdx(null);
                            }
                          }}
                          placeholder={rIdx === 0 ? 'Type item name...' : ''}
                          style={{ fontSize: `${layout.table.fontSize}px` }}
                          className="flex-1 min-w-0 bg-transparent font-bold text-slate-950 text-[12px] focus:outline-none truncate"
                        />
                        {row.itemDescription ? (
                          <button
                            type="button"
                            onClick={() => {
                              handleLineChange(rIdx, 'itemDescription', '');
                              handleLineChange(rIdx, 'rate', 0);
                              handleLineChange(rIdx, 'amount', 0);
                              setActiveItemDropdownIdx(null);
                              const input = document.getElementById(`slip-challan-desc-${rIdx}`) as HTMLInputElement | null;
                              input?.focus();
                            }}
                            className="p-0.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded no-print transition-colors cursor-pointer flex-none ml-0.5"
                            title="Clear Item Name (✕)"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        ) : null}
                      </div>
                      <div
                        style={{ fontSize: `${layout.table.fontSize}px` }}
                        className="hidden print:block font-bold text-slate-950 text-[12px] truncate"
                      >
                        {row.itemDescription || ''}
                      </div>

                      {/* Autocomplete Dropdown */}
                      {activeItemDropdownIdx === rIdx && (
                        <div
                          ref={itemDropdownRef}
                          className="absolute left-0 top-full mt-0.5 w-64 max-h-48 overflow-y-auto bg-white border border-slate-300 rounded-lg shadow-2xl z-50 text-left font-sans text-xs divide-y divide-slate-100 no-print"
                        >
                          <div className="p-1 bg-slate-900 text-white font-bold text-[9px] flex justify-between items-center sticky top-0 z-10">
                            <span>Items ({filteredItems.length})</span>
                            <button
                              type="button"
                              onClick={() => setActiveItemDropdownIdx(null)}
                              className="text-slate-300 hover:text-white text-[10px]"
                            >
                              ✕
                            </button>
                          </div>
                          {filteredItems.length === 0 ? (
                            <div className="p-2 text-slate-400 text-center italic text-[10px]">No item found.</div>
                          ) : (
                            groupedFilteredItems.groups.map((grp) => (
                              <div key={grp.category} className="divide-y divide-slate-100">
                                <div className="px-2 py-0.5 bg-slate-100 text-[9px] font-black uppercase tracking-wider text-slate-700 border-y border-slate-200">
                                  {grp.category} ({grp.items.length})
                                </div>
                                {grp.items.map(({ item, flatIndex: itIdx }) => (
                                  <div
                                    key={item.id}
                                    data-slip-item-highlighted={itemHighlightIdx === itIdx ? 'true' : 'false'}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      handleSelectItem(rIdx, item);
                                    }}
                                    onMouseEnter={() => setItemHighlightIdx(itIdx)}
                                    className={`p-1.5 cursor-pointer flex justify-between items-center text-[10px] ${
                                      itemHighlightIdx === itIdx ? 'bg-amber-100 text-slate-950 font-bold' : 'hover:bg-slate-50'
                                    }`}
                                  >
                                    <div className="truncate pr-1">
                                      <div className="font-bold text-slate-900 truncate">{item.name}</div>
                                      <div className="text-[9px] text-slate-500">{item.category || ''}</div>
                                    </div>
                                    <div className="text-right flex-none">
                                      <div className="font-mono font-bold text-emerald-800">
                                        Tk. {Number(item.rate || 0).toLocaleString()}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {/* Qty / Coil Column */}
                    <div
                      onClick={() => {
                        if (showMovingStudio) setSelectedMovingTarget('col_qty');
                      }}
                      className="absolute flex items-center justify-center font-mono font-bold text-slate-950 px-1 print-font-value"
                      style={{
                        left: `${layout.columns.qty.left * DPI}px`,
                        width: `${layout.columns.qty.width * DPI}px`,
                        height: `${layout.table.rowHeight * DPI}px`,
                        fontSize: `${layout.table.fontSize}px`
                      }}
                    >
                      <input
                        id={`slip-challan-qty-${rIdx}`}
                        type="number"
                        min="0"
                        step="any"
                        value={row.coilQty === 0 || !row.coilQty ? '' : Number(row.coilQty)}
                        onChange={(e) => handleLineChange(rIdx, 'coilQty', e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const currentQty = Number(row.coilQty) || 0;
                            const hasItemName = Boolean(row.itemDescription && row.itemDescription.trim().length > 0);

                            if (hasItemName && currentQty === 0) {
                              handleLineChange(rIdx, 'itemDescription', '');
                              handleLineChange(rIdx, 'rate', 0);
                              handleLineChange(rIdx, 'amount', 0);
                              setTimeout(() => {
                                const discInput = document.getElementById('slip-challan-discount-percent') as HTMLInputElement | null;
                                if (discInput) {
                                  discInput.focus();
                                  discInput.select();
                                }
                              }, 50);
                            } else {
                              const nextDesc = document.getElementById(`slip-challan-desc-${rIdx + 1}`) as HTMLInputElement | null;
                              if (nextDesc) {
                                nextDesc.focus();
                                nextDesc.select();
                              } else {
                                const discInput = document.getElementById('slip-challan-discount-percent') as HTMLInputElement | null;
                                if (discInput) {
                                  discInput.focus();
                                  discInput.select();
                                }
                              }
                            }
                          }
                        }}
                        placeholder=""
                        style={{ fontSize: `${layout.table.fontSize}px` }}
                        className="w-full bg-transparent font-mono font-bold text-center text-slate-950 text-[12px] focus:outline-none no-print"
                      />
                      <div
                        style={{ fontSize: `${layout.table.fontSize}px` }}
                        className="hidden print:block font-mono font-bold text-center text-slate-950 text-[12px]"
                      >
                        {row.coilQty && Number(row.coilQty) > 0 ? Number(row.coilQty) : ''}
                      </div>
                    </div>

                    {/* Rate Column */}
                    <div
                      onClick={() => {
                        if (showMovingStudio) setSelectedMovingTarget('col_rate');
                      }}
                      className="absolute flex items-center justify-end text-right font-mono font-bold text-slate-950 px-1 print-font-value"
                      style={{
                        left: `${layout.columns.rate.left * DPI}px`,
                        width: `${layout.columns.rate.width * DPI}px`,
                        height: `${layout.table.rowHeight * DPI}px`,
                        fontSize: `${layout.table.fontSize}px`
                      }}
                    >
                      <input
                        id={`slip-challan-rate-${rIdx}`}
                        type="number"
                        min="0"
                        step="any"
                        value={row.rate === 0 || !row.rate ? '' : Number(row.rate)}
                        onChange={(e) => handleLineChange(rIdx, 'rate', e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (rIdx < 11) {
                              const nextDesc = document.getElementById(`slip-challan-desc-${rIdx + 1}`) as HTMLInputElement | null;
                              if (nextDesc) {
                                nextDesc.focus();
                              }
                            }
                          }
                        }}
                        placeholder=""
                        style={{ fontSize: `${layout.table.fontSize}px` }}
                        className="w-full bg-transparent font-mono font-bold text-right text-slate-950 text-[12px] focus:outline-none no-print"
                      />
                      <div
                        style={{ fontSize: `${layout.table.fontSize}px` }}
                        className="hidden print:block font-mono font-bold text-right text-slate-950 text-[12px]"
                      >
                        {row.rate && Number(row.rate) > 0 ? Number(row.rate).toFixed(2) : ''}
                      </div>
                    </div>

                    {/* Total Amount */}
                    <div
                      onClick={() => {
                        if (showMovingStudio) setSelectedMovingTarget('col_amt');
                      }}
                      className="absolute flex items-center justify-end text-right font-mono font-bold text-slate-950 px-1 text-[12px] print-font-value"
                      style={{
                        left: `${layout.columns.amount.left * DPI}px`,
                        width: `${layout.columns.amount.width * DPI}px`,
                        height: `${layout.table.rowHeight * DPI}px`,
                        fontSize: `${layout.table.fontSize}px`
                      }}
                    >
                      {row.amount && Number(row.amount) > 0 ? Number(row.amount).toLocaleString() : ''}
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {/* Taka in Words (Single Line) */}
          {inWords && (
            <div
              onClick={() => {
                if (showMovingStudio) setSelectedMovingTarget('inWordsLine1');
              }}
              className={`absolute z-20 font-serif italic font-bold text-slate-950 truncate whitespace-nowrap print-font-value transition-all ${
                showMovingStudio && selectedMovingTarget === 'inWordsLine1'
                  ? 'ring-2 ring-pink-400 bg-pink-50/50 rounded'
                  : ''
              }`}
              style={{
                left: `${layout.inWordsLine1.left * DPI}px`,
                top: `${layout.inWordsLine1.top * DPI}px`,
                width: `${(layout.inWordsLine1.width || 4.2) * DPI}px`,
                fontSize: `${layout.inWordsLine1.fontSize}px`
              }}
            >
              {inWords}
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM ACTION BAR: Cancel on left side, Save on right side */}
      <div className="w-full max-w-[550px] mx-auto mt-4 mb-6 flex flex-wrap items-center justify-end gap-3 no-print px-1">
        <div className="flex items-center gap-3">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/25 text-slate-200 px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
              title="Close Slip Pad View"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-cyan-300" />
              <span>Back</span>
            </button>
          )}

          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="bg-rose-600/90 hover:bg-rose-500 text-white px-4 py-1.5 rounded-xl font-bold text-xs flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
              title="Cancel / Clear current slip challan (Alt+C)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <MnemonicLabel label="Cancel" mnemonic="C" />
            </button>
          )}

          {(onSave || onSaveChallan) && (
            <button
              ref={saveSlipChallanBtnRef}
              type="button"
              onClick={handleSaveOnlyAction}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveOnlyAction();
                }
              }}
              className="bg-cyan-400 hover:bg-cyan-300 text-slate-950 px-5 py-2 rounded-xl font-black text-sm flex items-center space-x-2 shadow-md transition-all cursor-pointer hover:scale-[1.02] focus:ring-4 focus:ring-cyan-300 focus:outline-none"
              title="Save Challan (Enter / Ctrl+S)"
            >
              <Check className="w-4 h-4" />
              <MnemonicLabel label={isEditing ? 'Update Challan' : 'Save Challan'} mnemonic="S" />
            </button>
          )}
        </div>
      </div>

      {/* Printer Auto-Configuration Engine Modal */}
      <PrinterAutoConfigModal
        isOpen={showPrinterAutoConfigModal}
        onClose={() => setShowPrinterAutoConfigModal(false)}
        documentType="slip_pad"
        billNo={challanNo || '01'}
      />
    </div>
  );
};
