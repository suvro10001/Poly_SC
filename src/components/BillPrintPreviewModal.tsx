import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Printer, Sliders, X } from 'lucide-react';
import { BillHeader, BillLineItem, BranchLocation, CompanyDetails } from '../types';
import { formatDateDDMMYY } from '../utils/dateUtils';
import { formatDisplayUnit } from '../utils/stockHelper';
import { getBranchAddressDetails, cleanBranchName } from '../utils/branchAccess';
import { defaultBranches } from '../data/defaultData';
import { PolyCablesLogo, PolyCablesEmblem } from './PolyCablesLogo';
import { SlipPadDocument } from './SlipPadDocument';
import { SlipPadPrintPreviewSettings } from './SlipPadPrintPreviewSettings';
import { PrinterAutoConfigModal } from './PrinterAutoConfigModal';
import { triggerAutoConfiguredPrint } from '../utils/printerAutoConfig';
import { stripBranchPrefixForPrint, DEFAULT_HEAD_OFFICE_BRANCH, findHeadOfficeBranch } from '../utils/salesCenterHelper';
import { useAutoPrintOnOpen } from '../hooks/useAutoPrintOnOpen';

export interface BillPrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  company?: CompanyDetails;
  branches?: BranchLocation[];
  initialDocumentType?: 'bill' | 'challan';
  autoPrintOnOpen?: boolean;
  initialPadHeaderMode?: 'plain' | 'hide_logo' | 'hide_all';
  bill: {
    id?: string;
    header: BillHeader;
    lines: BillLineItem[];
    company?: CompanyDetails;
    grandTotal?: number;
    subtotal?: number;
    discountAmount?: number;
    discountPercent?: number;
    totalCoils?: number;
    inWords?: string;
    partyPhone?: string;
    documentType?: 'bill' | 'challan';
  } | null;
}

export const BillPrintPreviewModal: React.FC<BillPrintPreviewModalProps> = ({
  isOpen,
  onClose,
  company: propCompany,
  branches: propBranches,
  initialDocumentType = 'bill',
  autoPrintOnOpen = false,
  initialPadHeaderMode = 'plain',
  bill
}) => {
  if (!isOpen || !bill) return null;

  const header = bill.header;
  const lines = (bill.lines || []).filter((line) =>
    Boolean((line.itemDescription || line.itemName || '').trim()) || (Number(line.coilQty) || 0) > 0
  );
  const company = bill.company || propCompany || {
    name: 'POLY CABLES',
    address: 'Holding No. 392, Shop No. 3, Sanjoy Smrity Market, Raypara, Madhupur, Tangail.',
    phone: '01713-434290',
    email: 'info@polycables.com.bd'
  };

  const knownBranches = useMemo<BranchLocation[]>(() => {
    const list: BranchLocation[] = [];
    if (Array.isArray(propBranches) && propBranches.length > 0) {
      list.push(...propBranches);
    } else {
      try {
        const raw = localStorage.getItem('polycables_branches');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) list.push(...parsed);
        }
      } catch {}
    }
    if (!list.some((b) => b.id === DEFAULT_HEAD_OFFICE_BRANCH.id || b.type === 'head_office')) {
      list.push(DEFAULT_HEAD_OFFICE_BRANCH);
    }
    defaultBranches.forEach((db) => {
      if (!list.some((b) => b.id === db.id)) list.push(db);
    });
    return list;
  }, [propBranches]);

  const branchAddress = useMemo(() => {
    const bIdLow = (header.branchId || '').trim().toLowerCase();
    const bNameLow = (header.branchName || '').trim().toLowerCase();
    if (
      !header.branchId ||
      bIdLow === 'all' ||
      bNameLow.includes('all sales center') ||
      bNameLow.includes('all assigned') ||
      bNameLow === 'all'
    ) {
      const corporateBranch = findHeadOfficeBranch(knownBranches) || DEFAULT_HEAD_OFFICE_BRANCH;
      return getBranchAddressDetails(corporateBranch, company.phone, company.email);
    }
    const cleanTarget = cleanBranchName(header.branchName).toLowerCase();
    const matchedBranch =
      knownBranches.find((b) => b.id === header.branchId) ||
      (header.branchName
        ? knownBranches.find(
            (b) =>
              b.name.toLowerCase().trim() === bNameLow ||
              cleanBranchName(b.name).toLowerCase() === cleanTarget
          )
        : undefined) ||
      (header.branchName
        ? {
            id: header.branchId,
            name: header.branchName,
            type: 'showroom' as const,
            address: '',
            phone: '',
            email: company.email
          }
        : null);
    return getBranchAddressDetails(matchedBranch, company.phone, company.email);
  }, [header.branchId, header.branchName, knownBranches, company.phone, company.email]);

  const calculatedSubtotal = bill.subtotal !== undefined
    ? bill.subtotal
    : lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

  const discountPercent = bill.discountPercent !== undefined
    ? bill.discountPercent
    : (header.discountPercent || 0);

  const calculatedDiscountAmount = bill.discountAmount !== undefined
    ? bill.discountAmount
    : (discountPercent > 0 ? Math.round((calculatedSubtotal * discountPercent) / 100) : 0);

  const calculatedGrandTotal = bill.grandTotal !== undefined
    ? bill.grandTotal
    : (calculatedSubtotal - calculatedDiscountAmount);

  const totalCoils = bill.totalCoils !== undefined
    ? bill.totalCoils
    : lines.reduce((sum, l) => sum + (Number(l.coilQty) || 0), 0);

  const inWords = bill.inWords || '';

  // Split inWords into 2 lines if long
  const wordsSplit = inWords.split(' ');
  const midPoint = Math.ceil(wordsSplit.length / 2);
  const inWordsLine1 = wordsSplit.length > 8 ? wordsSplit.slice(0, midPoint).join(' ') : inWords;
  const inWordsLine2 = wordsSplit.length > 8 ? wordsSplit.slice(midPoint).join(' ') : '';

  // Document Type State ('bill' | 'challan')
  const [docType, setDocType] = useState<'bill' | 'challan'>(() => {
    return bill?.documentType || initialDocumentType || 'bill';
  });
  const printDialogOpenRef = useRef(false);
  const ignoreEscapeUntilRef = useRef(0);

  useEffect(() => {
    if (bill?.documentType) {
      setDocType(bill.documentType);
    } else if (initialDocumentType) {
      setDocType(initialDocumentType);
    }
  }, [bill?.documentType, initialDocumentType]);

  const formatChallanLineColors = (line: BillLineItem): string => {
    if (line.colors) {
      const parts: string[] = [];
      if (line.colors.red) parts.push(`R:${line.colors.red}`);
      if (line.colors.blk || line.colors.black) parts.push(`B:${line.colors.blk || line.colors.black}`);
      if (line.colors.yel || line.colors.yellow) parts.push(`Y:${line.colors.yel || line.colors.yellow}`);
      if (line.colors.grn || line.colors.green) parts.push(`G:${line.colors.grn || line.colors.green}`);
      if (line.colors.blu || line.colors.blue) parts.push(`Bl:${line.colors.blu || line.colors.blue}`);
      if (line.colors.others) parts.push(`Oth:${line.colors.others}`);
      if (parts.length > 0) return parts.join(' ');
    }
    return '-';
  };

  // Format & Layout States
  const [printPaperFormat, setPrintPaperFormat] = useState<'bill' | 'slip_pad'>(() => {
    try {
      return (localStorage.getItem('polycables_default_print_format') as 'bill' | 'slip_pad') || 'bill';
    } catch {
      return 'bill';
    }
  });

  const [padHeaderMode, setPadHeaderMode] = useState<'plain' | 'hide_logo' | 'hide_all'>(initialPadHeaderMode);
  const [previewZoom, setPreviewZoom] = useState<'80%' | '100%' | '115%'>('100%');
  const [showSlipPadSettingsInPreview, setShowSlipPadSettingsInPreview] = useState(false);
  const [showPrinterAutoConfigModal, setShowPrinterAutoConfigModal] = useState(false);
  const [showAlignmentGuides, setShowAlignmentGuides] = useState(false);

  // Slip Pad Calibration & Settings
  const [slipPadTopOffset, setSlipPadTopOffset] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('polycables_slip_pad_top_inch');
      return saved ? parseFloat(saved) : 0;
    } catch {
      return 0;
    }
  });

  const [slipPadLeftOffset, setSlipPadLeftOffset] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('polycables_slip_pad_left_inch');
      return saved ? parseFloat(saved) : 0;
    } catch {
      return 0;
    }
  });

  const [slipPadFontScale, setSlipPadFontScale] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('polycables_slip_pad_font_scale');
      return saved ? parseInt(saved, 10) : 100;
    } catch {
      return 100;
    }
  });

  const [slipPadRowHeight, setSlipPadRowHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('polycables_slip_pad_row_height');
      return saved ? parseInt(saved, 10) : 24;
    } catch {
      return 24;
    }
  });

  const [slipPadShowTableHeader, setSlipPadShowTableHeader] = useState<boolean>(() => {
    try {
      return localStorage.getItem('polycables_slip_pad_show_th') !== 'false';
    } catch {
      return true;
    }
  });

  const [totalPadRows, setTotalPadRows] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('polycables_slip_pad_total_rows');
      return saved ? parseInt(saved, 10) : 14;
    } catch {
      return 14;
    }
  });

  const [slipPadShowBgImage, setSlipPadShowBgImage] = useState<boolean>(() => {
    try {
      return localStorage.getItem('polycables_slip_pad_show_bg') !== 'false';
    } catch {
      return true;
    }
  });

  const [slipPadPrintBgImage, setSlipPadPrintBgImage] = useState<boolean>(() => {
    try {
      return localStorage.getItem('polycables_slip_pad_print_bg') === 'true';
    } catch {
      return false;
    }
  });

  const [slipPadBgOpacity, setSlipPadBgOpacity] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('polycables_slip_pad_bg_opacity');
      return saved ? parseInt(saved, 10) : 35;
    } catch {
      return 35;
    }
  });

  const [slipPadCustomBgUrl, setSlipPadCustomBgUrl] = useState<string | null>(() => {
    try {
      return localStorage.getItem('polycables_slip_pad_custom_bg_bill') || null;
    } catch {
      return null;
    }
  });

  // Individual Element Shifts
  const [dateShiftX, setDateShiftX] = useState<number>(() => Number(localStorage.getItem('polycables_shift_date_x') ?? 30));
  const [dateShiftY, setDateShiftY] = useState<number>(() => Number(localStorage.getItem('polycables_shift_date_y') ?? -110));
  const [partyNameShiftX, setPartyNameShiftX] = useState<number>(() => Number(localStorage.getItem('polycables_shift_name_x') ?? 50));
  const [partyNameShiftY, setPartyNameShiftY] = useState<number>(() => Number(localStorage.getItem('polycables_shift_name_y') ?? -105));
  const [phoneShiftX, setPhoneShiftX] = useState<number>(() => Number(localStorage.getItem('polycables_shift_phone_x') ?? 0));
  const [phoneShiftY, setPhoneShiftY] = useState<number>(() => Number(localStorage.getItem('polycables_shift_phone_y') ?? 0));
  const [addressShiftX, setAddressShiftX] = useState<number>(() => Number(localStorage.getItem('polycables_shift_address_x') ?? 50));
  const [addressShiftY, setAddressShiftY] = useState<number>(() => Number(localStorage.getItem('polycables_shift_address_y') ?? -105));
  const [colSlShiftX, setColSlShiftX] = useState<number>(() => Number(localStorage.getItem('polycables_shift_col_sl_x') ?? 0));
  const [colSlShiftY, setColSlShiftY] = useState<number>(() => Number(localStorage.getItem('polycables_shift_col_sl_y') ?? 0));
  const [colDescShiftX, setColDescShiftX] = useState<number>(() => Number(localStorage.getItem('polycables_shift_col_desc_x') ?? 0));
  const [colDescShiftY, setColDescShiftY] = useState<number>(() => Number(localStorage.getItem('polycables_shift_col_desc_y') ?? 0));
  const [colQtyShiftX, setColQtyShiftX] = useState<number>(() => Number(localStorage.getItem('polycables_shift_col_qty_x') ?? 0));
  const [colQtyShiftY, setColQtyShiftY] = useState<number>(() => Number(localStorage.getItem('polycables_shift_col_qty_y') ?? 0));
  const [colRateShiftX, setColRateShiftX] = useState<number>(() => Number(localStorage.getItem('polycables_shift_col_rate_x') ?? 0));
  const [colRateShiftY, setColRateShiftY] = useState<number>(() => Number(localStorage.getItem('polycables_shift_col_rate_y') ?? 0));
  const [colAmountShiftX, setColAmountShiftX] = useState<number>(() => Number(localStorage.getItem('polycables_shift_col_amount_x') ?? 0));
  const [colAmountShiftY, setColAmountShiftY] = useState<number>(() => Number(localStorage.getItem('polycables_shift_col_amount_y') ?? 0));
  const [totalBoxShiftX, setTotalBoxShiftX] = useState<number>(() => Number(localStorage.getItem('polycables_shift_total_box_x') ?? 0));
  const [totalBoxShiftY, setTotalBoxShiftY] = useState<number>(() => Number(localStorage.getItem('polycables_shift_total_box_y') ?? 0));
  const [inWordsShiftX, setInWordsShiftX] = useState<number>(() => Number(localStorage.getItem('polycables_shift_in_words_x') ?? 0));
  const [inWordsShiftY, setInWordsShiftY] = useState<number>(() => Number(localStorage.getItem('polycables_shift_in_words_y') ?? 0));
  const [metaTopOffsetPx, setMetaTopOffsetPx] = useState<number>(() => Number(localStorage.getItem('polycables_meta_top_offset') ?? 0));
  const [tableTopOffsetPx, setTableTopOffsetPx] = useState<number>(() => Number(localStorage.getItem('polycables_table_top_offset') ?? -142));
  const [footerTopOffsetPx, setFooterTopOffsetPx] = useState<number>(() => Number(localStorage.getItem('polycables_footer_top_offset') ?? 65));

  // Individual font sizes
  const [partyNameFontSize, setPartyNameFontSize] = useState<number>(() => Number(localStorage.getItem('polycables_font_party_name') ?? 14));
  const [dateFontSize, setDateFontSize] = useState<number>(() => Number(localStorage.getItem('polycables_font_date') ?? 12));
  const [phoneFontSize, setPhoneFontSize] = useState<number>(() => Number(localStorage.getItem('polycables_font_phone') ?? 11));
  const [addressFontSize, setAddressFontSize] = useState<number>(() => Number(localStorage.getItem('polycables_font_address') ?? 12.5));
  const [tableHeaderFontSize, setTableHeaderFontSize] = useState<number>(() => Number(localStorage.getItem('polycables_font_th') ?? 10.5));
  const [tableRowFontSize, setTableRowFontSize] = useState<number>(() => Number(localStorage.getItem('polycables_font_tr') ?? 12));
  const [totalRowFontSize, setTotalRowFontSize] = useState<number>(() => Number(localStorage.getItem('polycables_font_total') ?? 12));
  const [inWordsFontSize, setInWordsFontSize] = useState<number>(() => Number(localStorage.getItem('polycables_font_in_words') ?? 11));

  // Column Widths
  const [colWidthSl, setColWidthSl] = useState<number>(() => Number(localStorage.getItem('polycables_col_sl') ?? 38));
  const [colWidthQty, setColWidthQty] = useState<number>(() => Number(localStorage.getItem('polycables_col_qty') ?? 42));
  const [colWidthRate, setColWidthRate] = useState<number>(() => Number(localStorage.getItem('polycables_col_rate') ?? 67));
  const [colWidthAmount, setColWidthAmount] = useState<number>(() => Number(localStorage.getItem('polycables_col_amount') ?? 83));

  const [customRowHeights] = useState<Record<number, number>>(() => {
    try {
      const saved = localStorage.getItem('polycables_slip_pad_row_heights_bill');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [customRowShiftsY] = useState<Record<number, number>>(() => {
    try {
      const saved = localStorage.getItem('polycables_slip_pad_row_shifts_y_bill');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const getDynamicPartyFontSize = (name?: string, defaultSize: number = 12): string => {
    if (!name) return `${defaultSize}px`;
    const len = name.length;
    if (len > 35) return `${Math.max(9, defaultSize - 3.5)}px`;
    if (len > 28) return `${Math.max(9.5, defaultSize - 2.5)}px`;
    if (len > 22) return `${Math.max(10, defaultSize - 1.5)}px`;
    return `${defaultSize}px`;
  };

  const getDynamicAddressFontSize = (addr?: string, defaultSize: number = 12): string => {
    if (!addr) return `${defaultSize}px`;
    const len = addr.length;
    if (len > 45) return `${Math.max(8.5, defaultSize - 3.5)}px`;
    if (len > 35) return `${Math.max(9, defaultSize - 2.5)}px`;
    if (len > 25) return `${Math.max(10, defaultSize - 1.5)}px`;
    return `${defaultSize}px`;
  };

  const handlePrint = () => {
    if (printPaperFormat === 'slip_pad') {
      triggerAutoConfiguredPrint('slip_pad', {
        paperPreset: 'pad_5.5x8.5',
        orientation: 'portrait',
        marginsMm: 0,
        scale: slipPadFontScale / 100
      });
    } else {
      triggerAutoConfiguredPrint(docType === 'challan' ? 'challan' : 'bill');
    }
  };

  useAutoPrintOnOpen(isOpen, handlePrint, autoPrintOnOpen);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleBeforePrint = () => {
      printDialogOpenRef.current = true;
    };
    const handleAfterPrint = () => {
      printDialogOpenRef.current = false;
      ignoreEscapeUntilRef.current = Date.now() + 1000;
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        if (printDialogOpenRef.current || Date.now() < ignoreEscapeUntilRef.current) return;
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement | null;
        if (target && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return;
        e.preventDefault();
        handlePrint();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        handlePrint();
      } else if (e.altKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setShowPrinterAutoConfigModal(true);
      }
    };
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, printPaperFormat, slipPadFontScale, docType]);

  return (
    <>
      <div className="print-preview-modal-backdrop fixed inset-0 bg-slate-950/85 backdrop-blur-xs z-[70] flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
        <div className="print-preview-modal-dialog bg-slate-900 rounded-xl shadow-2xl border border-slate-700 w-full max-w-6xl max-h-[96vh] flex flex-col overflow-hidden text-white">
          
          {/* Modal Header Toolbar */}
          <div className="bg-slate-800 px-4 py-2.5 border-b border-slate-700 flex flex-wrap items-center justify-between gap-2 no-print">
            <div className="flex items-center space-x-2">
              <Printer className="w-5 h-5 text-emerald-400" />
              <span className="font-bold text-sm text-white">
                {docType === 'challan'
                  ? `Print Preview — Delivery Challan #${header.challanNo || header.billNo || '01'}`
                  : `Print Preview — Bill Invoice #${header.billNo || '01'}`}
              </span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                docType === 'challan'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
              }`}>
                {docType === 'challan' ? 'Delivery Challan' : 'Bill Invoice'}
              </span>
              <span className="bg-slate-700 text-slate-300 text-[10px] font-mono px-2 py-0.5 rounded-full">
                {printPaperFormat === 'slip_pad' ? '5.5" × 8.5" Slip Pad' : '7.2" × 10" Single Sheet'}
              </span>
            </div>

            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              {/* Document Type Selector (Bill / Challan) */}
              <div className="inline-flex rounded-lg border border-slate-700 p-0.5 bg-slate-950 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setDocType('bill')}
                  className={`px-2.5 py-1 rounded-md cursor-pointer transition-all flex items-center space-x-1 ${
                    docType === 'bill'
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>📋 Invoice (Bill)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDocType('challan')}
                  className={`px-2.5 py-1 rounded-md cursor-pointer transition-all flex items-center space-x-1 ${
                    docType === 'challan'
                      ? 'bg-emerald-600 text-white font-bold shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>🚚 Delivery Challan</span>
                </button>
              </div>

              {/* Paper Format Selector */}
              <div className="inline-flex rounded-lg border border-slate-700 p-0.5 bg-slate-950 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setPrintPaperFormat('slip_pad');
                    try { localStorage.setItem('polycables_default_print_format', 'slip_pad'); } catch {}
                  }}
                  className={`px-2.5 py-1 rounded-md cursor-pointer transition-all flex items-center space-x-1 ${
                    printPaperFormat === 'slip_pad'
                      ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>📜 Slip Pad (5.5" × 8.5")</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPrintPaperFormat('bill');
                    try { localStorage.setItem('polycables_default_print_format', 'bill'); } catch {}
                  }}
                  className={`px-2.5 py-1 rounded-md cursor-pointer transition-all flex items-center space-x-1 ${
                    printPaperFormat === 'bill'
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>📋 Standard Bill (7.2" × 10")</span>
                </button>
              </div>

              {/* Toggle Pad Mode buttons */}
              <div className="inline-flex rounded-lg border border-slate-700 p-0.5 bg-slate-950 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setPadHeaderMode('plain')}
                  className={`px-2.5 py-1 rounded-md cursor-pointer transition-all ${
                    padHeaderMode === 'plain'
                      ? 'bg-emerald-600 text-white font-bold shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Plain Paper
                </button>
                <button
                  type="button"
                  onClick={() => setPadHeaderMode('hide_logo')}
                  className={`px-2.5 py-1 rounded-md cursor-pointer transition-all ${
                    padHeaderMode === 'hide_logo'
                      ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Pad (Hide Logo)
                </button>
              </div>

              {/* Zoom Selector */}
              <div className="flex items-center bg-slate-950 border border-slate-700 rounded-md p-0.5 text-xs font-mono">
                {(['80%', '100%', '115%'] as const).map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setPreviewZoom(z)}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      previewZoom === z ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {z}
                  </button>
                ))}
              </div>

              {/* Slip Pad Settings Toggle Button */}
              {printPaperFormat === 'slip_pad' && (
                <button
                  type="button"
                  onClick={() => setShowSlipPadSettingsInPreview(!showSlipPadSettingsInPreview)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer border ${
                    showSlipPadSettingsInPreview
                      ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md font-black'
                      : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-amber-500/40 hover:border-amber-400'
                  }`}
                  title="Toggle 📜 Slip Pad (5.5&quot; × 8.5&quot;) Alignment & Calibration Controls"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>📜 Slip Pad Settings</span>
                </button>
              )}

              {/* Auto-Config / Fix Printer Button */}
              <button
                type="button"
                onClick={() => setShowPrinterAutoConfigModal(true)}
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-3 py-1.5 rounded-md text-xs flex items-center space-x-1 shadow-md transition-all cursor-pointer border border-purple-400/40"
                title="Auto-configure paper presets (7.2x10, A4, 5.5x8.5), force exact margins, and fix clipping (Alt+A)"
              >
                <Sliders className="w-3.5 h-3.5 text-purple-200" />
                <span>Auto-Fix Printer (Alt+A)</span>
              </button>

              {/* Print Now Button */}
              <button
                type="button"
                onClick={handlePrint}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-4 py-1.5 rounded-md text-xs flex items-center space-x-1.5 shadow-md transition-all cursor-pointer hover:scale-105"
                title="Trigger system print dialog with exact dimensions and centered alignment"
              >
                <Printer className="w-4 h-4 text-slate-950" />
                <span>Print Now (Ctrl+P / Enter)</span>
              </button>

              {/* Close Sign Button */}
              <button
                type="button"
                onClick={onClose}
                className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-3 py-1.5 rounded-md text-xs flex items-center space-x-1 shadow-md transition-all cursor-pointer hover:scale-105 border border-rose-400/50 ml-1"
                title="Close Print Preview (Esc)"
              >
                <X className="w-4 h-4 text-white" />
                <span>Close (Esc)</span>
              </button>
            </div>
          </div>

          {/* Slip Pad Print Preview Settings Drawer */}
          {printPaperFormat === 'slip_pad' && showSlipPadSettingsInPreview && (
            <SlipPadPrintPreviewSettings
              padHeaderMode={padHeaderMode}
              onChangePadHeaderMode={setPadHeaderMode}
              topOffset={slipPadTopOffset}
              onChangeTopOffset={(val) => {
                setSlipPadTopOffset(val);
                try { localStorage.setItem('polycables_slip_pad_top_inch', String(val)); } catch {}
              }}
              leftOffset={slipPadLeftOffset}
              onChangeLeftOffset={(val) => {
                setSlipPadLeftOffset(val);
                try { localStorage.setItem('polycables_slip_pad_left_inch', String(val)); } catch {}
              }}
              fontScale={slipPadFontScale}
              onChangeFontScale={(val) => {
                setSlipPadFontScale(val);
                try { localStorage.setItem('polycables_slip_pad_font_scale', String(val)); } catch {}
              }}
              rowHeight={slipPadRowHeight}
              onChangeRowHeight={(val) => {
                setSlipPadRowHeight(val);
                try { localStorage.setItem('polycables_slip_pad_row_height', String(val)); } catch {}
              }}
              showTableHeader={slipPadShowTableHeader}
              onToggleTableHeader={(val) => {
                setSlipPadShowTableHeader(val);
                try { localStorage.setItem('polycables_slip_pad_show_th', String(val)); } catch {}
              }}
              totalRows={totalPadRows}
              onChangeTotalRows={(val) => {
                setTotalPadRows(val);
                try { localStorage.setItem('polycables_slip_pad_total_rows', String(val)); } catch {}
              }}
              showBgImage={slipPadShowBgImage}
              onToggleShowBgImage={(val) => {
                setSlipPadShowBgImage(val);
                try { localStorage.setItem('polycables_slip_pad_show_bg', String(val)); } catch {}
              }}
              printBgImage={slipPadPrintBgImage}
              onTogglePrintBgImage={(val) => {
                setSlipPadPrintBgImage(val);
                try { localStorage.setItem('polycables_slip_pad_print_bg', String(val)); } catch {}
              }}
              bgOpacity={slipPadBgOpacity}
              onChangeBgOpacity={(val) => {
                setSlipPadBgOpacity(val);
                try { localStorage.setItem('polycables_slip_pad_bg_opacity', String(val)); } catch {}
              }}
              showGuides={showAlignmentGuides}
              onToggleGuides={setShowAlignmentGuides}
              onResetDefaults={() => {
                setSlipPadTopOffset(0);
                setSlipPadLeftOffset(0);
                setSlipPadFontScale(100);
                setSlipPadRowHeight(24);
                setTotalPadRows(14);
                try {
                  localStorage.removeItem('polycables_slip_pad_top_inch');
                  localStorage.removeItem('polycables_slip_pad_left_inch');
                  localStorage.removeItem('polycables_slip_pad_font_scale');
                  localStorage.removeItem('polycables_slip_pad_row_height');
                  localStorage.removeItem('polycables_slip_pad_total_rows');
                } catch {}
              }}
              onOpenAutoConfig={() => setShowPrinterAutoConfigModal(true)}
              onClose={() => setShowSlipPadSettingsInPreview(false)}
              customBgUrl={slipPadCustomBgUrl}
              onUploadCustomBg={(file: File) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                  const url = e.target?.result as string;
                  if (url) {
                    setSlipPadCustomBgUrl(url);
                    try { localStorage.setItem('polycables_slip_pad_custom_bg_bill', url); } catch {}
                  }
                };
                reader.readAsDataURL(file);
              }}
              onClearCustomBg={() => {
                setSlipPadCustomBgUrl(null);
                try { localStorage.removeItem('polycables_slip_pad_custom_bg_bill'); } catch {}
              }}

              // Individual Word & Element Movement
              dateShiftX={dateShiftX}
              dateShiftY={dateShiftY}
              onChangeDateShift={(x, y) => {
                setDateShiftX(x); setDateShiftY(y);
                try { localStorage.setItem('polycables_shift_date_x', String(x)); localStorage.setItem('polycables_shift_date_y', String(y)); } catch {}
              }}
              partyNameShiftX={partyNameShiftX}
              partyNameShiftY={partyNameShiftY}
              onChangePartyNameShift={(x, y) => {
                setPartyNameShiftX(x); setPartyNameShiftY(y);
                try { localStorage.setItem('polycables_shift_name_x', String(x)); localStorage.setItem('polycables_shift_name_y', String(y)); } catch {}
              }}
              phoneShiftX={phoneShiftX}
              phoneShiftY={phoneShiftY}
              onChangePhoneShift={(x, y) => {
                setPhoneShiftX(x); setPhoneShiftY(y);
                try { localStorage.setItem('polycables_shift_phone_x', String(x)); localStorage.setItem('polycables_shift_phone_y', String(y)); } catch {}
              }}
              addressShiftX={addressShiftX}
              addressShiftY={addressShiftY}
              onChangeAddressShift={(x, y) => {
                setAddressShiftX(x); setAddressShiftY(y);
                try { localStorage.setItem('polycables_shift_address_x', String(x)); localStorage.setItem('polycables_shift_address_y', String(y)); } catch {}
              }}
              colSlShiftX={colSlShiftX}
              colSlShiftY={colSlShiftY}
              onChangeColSlShift={(x, y) => {
                setColSlShiftX(x); setColSlShiftY(y);
                try { localStorage.setItem('polycables_shift_col_sl_x', String(x)); localStorage.setItem('polycables_shift_col_sl_y', String(y)); } catch {}
              }}
              colDescShiftX={colDescShiftX}
              colDescShiftY={colDescShiftY}
              onChangeColDescShift={(x, y) => {
                setColDescShiftX(x); setColDescShiftY(y);
                try { localStorage.setItem('polycables_shift_col_desc_x', String(x)); localStorage.setItem('polycables_shift_col_desc_y', String(y)); } catch {}
              }}
              colQtyShiftX={colQtyShiftX}
              colQtyShiftY={colQtyShiftY}
              onChangeColQtyShift={(x, y) => {
                setColQtyShiftX(x); setColQtyShiftY(y);
                try { localStorage.setItem('polycables_shift_col_qty_x', String(x)); localStorage.setItem('polycables_shift_col_qty_y', String(y)); } catch {}
              }}
              colRateShiftX={colRateShiftX}
              colRateShiftY={colRateShiftY}
              onChangeColRateShift={(x, y) => {
                setColRateShiftX(x); setColRateShiftY(y);
                try { localStorage.setItem('polycables_shift_col_rate_x', String(x)); localStorage.setItem('polycables_shift_col_rate_y', String(y)); } catch {}
              }}
              colAmountShiftX={colAmountShiftX}
              colAmountShiftY={colAmountShiftY}
              onChangeColAmountShift={(x, y) => {
                setColAmountShiftX(x); setColAmountShiftY(y);
                try { localStorage.setItem('polycables_shift_col_amount_x', String(x)); localStorage.setItem('polycables_shift_col_amount_y', String(y)); } catch {}
              }}
              totalBoxShiftX={totalBoxShiftX}
              totalBoxShiftY={totalBoxShiftY}
              onChangeTotalBoxShift={(x, y) => {
                setTotalBoxShiftX(x); setTotalBoxShiftY(y);
                try { localStorage.setItem('polycables_shift_total_box_x', String(x)); localStorage.setItem('polycables_shift_total_box_y', String(y)); } catch {}
              }}
              inWordsShiftX={inWordsShiftX}
              inWordsShiftY={inWordsShiftY}
              onChangeInWordsShift={(x, y) => {
                setInWordsShiftX(x); setInWordsShiftY(y);
                try { localStorage.setItem('polycables_shift_in_words_x', String(x)); localStorage.setItem('polycables_shift_in_words_y', String(y)); } catch {}
              }}
              metaTopOffsetPx={metaTopOffsetPx}
              onChangeMetaTopOffsetPx={(val) => {
                setMetaTopOffsetPx(val);
                try { localStorage.setItem('polycables_meta_top_offset', String(val)); } catch {}
              }}
              tableTopOffsetPx={tableTopOffsetPx}
              onChangeTableTopOffsetPx={(val) => {
                setTableTopOffsetPx(val);
                try { localStorage.setItem('polycables_table_top_offset', String(val)); } catch {}
              }}
              footerTopOffsetPx={footerTopOffsetPx}
              onChangeFooterTopOffsetPx={(val) => {
                setFooterTopOffsetPx(val);
                try { localStorage.setItem('polycables_footer_top_offset', String(val)); } catch {}
              }}

              // Individual font sizes
              partyNameFontSize={partyNameFontSize}
              onChangePartyNameFontSize={(val) => {
                setPartyNameFontSize(val);
                try { localStorage.setItem('polycables_font_party_name', String(val)); } catch {}
              }}
              dateFontSize={dateFontSize}
              onChangeDateFontSize={(val) => {
                setDateFontSize(val);
                try { localStorage.setItem('polycables_font_date', String(val)); } catch {}
              }}
              phoneFontSize={phoneFontSize}
              onChangePhoneFontSize={(val) => {
                setPhoneFontSize(val);
                try { localStorage.setItem('polycables_font_phone', String(val)); } catch {}
              }}
              addressFontSize={addressFontSize}
              onChangeAddressFontSize={(val) => {
                setAddressFontSize(val);
                try { localStorage.setItem('polycables_font_address', String(val)); } catch {}
              }}
              tableHeaderFontSize={tableHeaderFontSize}
              onChangeTableHeaderFontSize={(val) => {
                setTableHeaderFontSize(val);
                try { localStorage.setItem('polycables_font_th', String(val)); } catch {}
              }}
              tableRowFontSize={tableRowFontSize}
              onChangeTableRowFontSize={(val) => {
                setTableRowFontSize(val);
                try { localStorage.setItem('polycables_font_tr', String(val)); } catch {}
              }}
              totalRowFontSize={totalRowFontSize}
              onChangeTotalRowFontSize={(val) => {
                setTotalRowFontSize(val);
                try { localStorage.setItem('polycables_font_total', String(val)); } catch {}
              }}
              inWordsFontSize={inWordsFontSize}
              onChangeInWordsFontSize={(val) => {
                setInWordsFontSize(val);
                try { localStorage.setItem('polycables_font_in_words', String(val)); } catch {}
              }}

              colWidthSl={colWidthSl}
              onChangeColWidthSl={(val) => {
                setColWidthSl(val);
                try { localStorage.setItem('polycables_col_sl', String(val)); } catch {}
              }}
              colWidthQty={colWidthQty}
              onChangeColWidthQty={(val) => {
                setColWidthQty(val);
                try { localStorage.setItem('polycables_col_qty', String(val)); } catch {}
              }}
              colWidthRate={colWidthRate}
              onChangeColWidthRate={(val) => {
                setColWidthRate(val);
                try { localStorage.setItem('polycables_col_rate', String(val)); } catch {}
              }}
              colWidthAmount={colWidthAmount}
              onChangeColWidthAmount={(val) => {
                setColWidthAmount(val);
                try { localStorage.setItem('polycables_col_amount', String(val)); } catch {}
              }}
            />
          )}

          {/* Modal Body / Paper Sheet Preview Canvas */}
          <div className="print-preview-canvas-container p-2.5 sm:p-6 overflow-auto bg-slate-950 flex-1 flex flex-col items-start sm:items-center justify-start">
            {printPaperFormat === 'slip_pad' ? (
              <SlipPadDocument
                header={header}
                lines={lines}
                partyPhone={bill.partyPhone || ''}
                padHeaderMode={padHeaderMode}
                orientation="portrait"
                showTableHeader={slipPadShowTableHeader}
                topOffsetInch={slipPadTopOffset}
                leftOffsetInch={slipPadLeftOffset}
                fontSizePercent={slipPadFontScale}
                rowHeightPx={slipPadRowHeight}
                totalRowsCount={totalPadRows}
                customRowHeights={customRowHeights}
                customRowShiftsY={customRowShiftsY}
                highlightedRowIndex={null}
                onRowClick={undefined}
                colWidthSl={colWidthSl}
                colWidthQty={colWidthQty}
                colWidthRate={colWidthRate}
                colWidthAmount={colWidthAmount}
                metaTopOffsetPx={metaTopOffsetPx}
                tableTopOffsetPx={tableTopOffsetPx}
                footerTopOffsetPx={footerTopOffsetPx}
                colDescShiftX={colDescShiftX}
                colDescShiftY={colDescShiftY}
                colQtyShiftX={colQtyShiftX}
                colQtyShiftY={colQtyShiftY}
                colRateShiftX={colRateShiftX}
                colRateShiftY={colRateShiftY}
                colAmountShiftX={colAmountShiftX}
                colAmountShiftY={colAmountShiftY}
                colSlShiftX={colSlShiftX}
                colSlShiftY={colSlShiftY}
                partyNameShiftX={partyNameShiftX}
                partyNameShiftY={partyNameShiftY}
                dateShiftX={dateShiftX}
                dateShiftY={dateShiftY}
                phoneShiftX={phoneShiftX}
                phoneShiftY={phoneShiftY}
                addressShiftX={addressShiftX}
                addressShiftY={addressShiftY}
                inWordsShiftX={inWordsShiftX}
                inWordsShiftY={inWordsShiftY}
                totalBoxShiftX={totalBoxShiftX}
                totalBoxShiftY={totalBoxShiftY}
                partyNameFontSize={partyNameFontSize}
                dateFontSize={dateFontSize}
                phoneFontSize={phoneFontSize}
                addressFontSize={addressFontSize}
                tableHeaderFontSize={tableHeaderFontSize}
                tableRowFontSize={tableRowFontSize}
                totalRowFontSize={totalRowFontSize}
                inWordsFontSize={inWordsFontSize}
                highlightedElement={null}
                customImageUrl={slipPadCustomBgUrl}
                slipPadShowBgImage={slipPadShowBgImage}
                printBgImage={slipPadPrintBgImage}
                slipPadBgOpacity={slipPadBgOpacity}
                grandTotal={calculatedGrandTotal}
                subtotal={calculatedSubtotal}
                discountAmount={calculatedDiscountAmount}
                discountPercent={discountPercent}
                totalCoils={totalCoils}
                inWordsLine1={inWordsLine1}
                inWordsLine2={inWordsLine2}
                showAlignmentGuides={false}
                previewZoom="100%"
              />
            ) : (
              /* Standard Bill 7.2" x 10" Paper Sheet Preview Canvas - Single Page Fit */
              <div 
                className="print-paper-sheet bill-paper-dimensions bg-white text-black shadow-2xl border-2 border-slate-300 rounded-sm font-sans transition-all duration-200 origin-top overflow-hidden relative print:border-none print:shadow-none print:overflow-visible print:max-h-none"
                style={{
                  width: '7.2in',
                  maxWidth: '7.2in',
                  minHeight: '10in',
                  padding: '0 0.28in 0.28in 0.28in',
                  boxSizing: 'border-box',
                  transform: `scale(${previewZoom === '80%' ? 0.8 : (previewZoom === '115%' ? 1.15 : 1.0)})`
                }}
              >
                {/* Visual Centering Crosshair & Margin Guides Overlay for Standard Bill */}
                {showAlignmentGuides && (
                  <div className="absolute inset-0 pointer-events-none z-40 no-print overflow-hidden select-none">
                    <div className="absolute top-0 left-0 right-0 border-t-2 border-emerald-500 flex justify-center">
                      <span className="bg-emerald-600 text-white font-mono text-[9px] font-bold px-1.5 py-0.2 rounded-b shadow-xs">
                        Top: 0.00" (0 mm) • Fixed Top Anchor
                      </span>
                    </div>
                    <div className="absolute top-0 bottom-0 left-1/2 border-l border-dashed border-cyan-500 -translate-x-1/2 flex flex-col justify-between items-center py-2">
                      <span className="bg-cyan-600 text-white font-mono text-[9px] font-bold px-1.5 py-0.2 rounded shadow-xs">
                        Center Axis (50%)
                      </span>
                      <span className="bg-cyan-600 text-white font-mono text-[9px] font-bold px-1.5 py-0.2 rounded shadow-xs">
                        Left = Right Balanced
                      </span>
                    </div>
                    <div className="absolute top-1 left-2 font-mono text-[9px] font-bold text-amber-700 bg-amber-100/90 px-1 rounded border border-amber-300">
                      7.2" × 10.0" (182.9 × 254.0 mm)
                    </div>
                    <div className="absolute bottom-1 right-2 font-mono text-[9px] font-bold text-emerald-700 bg-emerald-100/90 px-1 rounded border border-emerald-300">
                      Tray Centered ✓
                    </div>
                  </div>
                )}

                {/* Paper Content Wrapper */}
                <div className="relative flex flex-col justify-between h-full overflow-hidden">
                  <div className="relative z-10 space-y-1.5">
                    {/* Keep only 0.5" for the company logo so the document starts higher on paper. */}
                    <div className="text-center pb-0 space-y-0 text-black font-sans leading-tight pt-0">
                      <div
                        style={{ height: '0.5in', minHeight: '0.5in' }}
                        className={`flex items-center justify-center ${
                          padHeaderMode !== 'plain' ? 'hide-on-preprinted-pad invisible opacity-0' : ''
                        }`}
                      >
                        <PolyCablesLogo size="xl" showSubtitle={false} subtitleText="" />
                      </div>

                      {/* Address, title, and invoice metadata follow the compact logo area. */}
                      {branchAddress.line1 ? (
                        <div className={`space-y-0.5 pt-0 mt-0 pb-0 mb-0 print:pb-0 print:mb-0 ${padHeaderMode === 'hide_all' ? 'hide-on-preprinted-pad invisible opacity-0' : ''}`}>
                          <p style={{ fontSize: '14px' }} className="font-extrabold text-[14px] leading-tight text-black print:text-[14px] madhupur-address-line">
                            {branchAddress.line1}
                          </p>
                          {branchAddress.line2 ? (
                            <p style={{ fontSize: '14px' }} className="font-bold text-[14px] leading-tight text-black print:text-[14px] madhupur-address-line">
                              {branchAddress.line2}
                            </p>
                          ) : null}
                          {branchAddress.line3 ? (
                            <p style={{ fontSize: '14px' }} className="font-semibold text-[14px] leading-tight text-black print:text-[14px] madhupur-address-line">
                              {branchAddress.line3}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {docType === 'challan' ? (
                        <div className="pt-1 pb-0.5 text-center">
                          <span className="delivery-challan-badge challan-badge inline-block bg-slate-950 text-white border-2 border-slate-950 px-4 py-0.5 rounded text-xs font-black tracking-widest uppercase">
                            DELIVERY CHALLAN
                          </span>
                        </div>
                      ) : header.isOfficeBill ? (
                        <div className="pt-0 pb-1 no-print print:hidden">
                          <span className="inline-block bg-amber-100 text-amber-900 border border-amber-400 px-3 py-0.5 rounded-md text-[10px] font-extrabold tracking-wide uppercase">
                            ★ OFFICE BILL (FACTORY DIRECT SALES)
                          </span>
                        </div>
                      ) : null}
                    </div>

                    {/* Metadata Layout: 2-Column Side-by-Side */}
                    <div className="flex items-start justify-between w-full text-black font-sans mt-1 mb-0.5 gap-x-2.5">
                      {/* Left Side: Party Name (Row 1), Address (Row 2) */}
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center w-full min-h-[19px]">
                          <span className="w-[74px] flex-none font-semibold text-black whitespace-nowrap text-left text-xs">Party Name</span>
                          <span className="w-2 flex-none text-center font-semibold text-black text-xs">:</span>
                          <span style={{ fontSize: getDynamicPartyFontSize(header.partyName, 12), lineHeight: '1.2' }} className="font-bold border-b border-dotted border-black flex-1 min-w-0 pb-0.5 whitespace-nowrap overflow-hidden text-ellipsis block text-left text-xs">
                            {header.partyName || '\u00A0'}
                          </span>
                        </div>

                        <div className="flex items-center w-full min-h-[19px]">
                          <span className="w-[74px] flex-none font-semibold text-black whitespace-nowrap text-left text-xs">Address</span>
                          <span className="w-2 flex-none text-center font-semibold text-black text-xs">:</span>
                          <span style={{ fontSize: getDynamicAddressFontSize(header.address, 12), lineHeight: '1.2' }} className="font-semibold border-b border-dotted border-black flex-1 min-w-0 pb-0.5 whitespace-nowrap overflow-hidden text-ellipsis block text-left text-xs">
                            {header.address || '\u00A0'}
                          </span>
                        </div>
                      </div>

                      {/* Right Side: Order No, Bill No, Challan No, Ref No, Salesman Code */}
                      <div className="w-[265px] flex-none space-y-0.5">
                        <div className="flex items-center justify-start min-h-[19px] w-full text-xs">
                          <span className="w-[70px] flex-none font-semibold text-black whitespace-nowrap text-left">Order No.</span>
                          <span className="w-2 flex-none text-center font-semibold text-black">:</span>
                          <span className="font-semibold w-[82px] flex-none truncate text-center border-b border-dotted border-black pb-0">
                            {header.orderNumber || '\u00A0'}
                          </span>
                          <span className="w-[30px] flex-none font-semibold text-black whitespace-nowrap text-right pr-0.5">Date:</span>
                          <span className="font-semibold border-b border-dotted border-black w-[72px] flex-none text-center pb-0">
                            {formatDateDDMMYY(header.orderDate) || formatDateDDMMYY(header.date) || '\u00A0'}
                          </span>
                        </div>

                        <div className="flex items-center justify-start min-h-[19px] w-full text-xs">
                          <span className="w-[70px] flex-none font-semibold text-black whitespace-nowrap text-left">Bill No.</span>
                          <span className="w-2 flex-none text-center font-semibold text-black">:</span>
                          <span className="font-semibold w-[82px] flex-none truncate text-center border-b border-dotted border-black pb-0 font-bold">
                            {stripBranchPrefixForPrint(header.billNo) || '\u00A0'}
                          </span>
                          <span className="w-[30px] flex-none font-semibold text-black whitespace-nowrap text-right pr-0.5">Date:</span>
                          <span className="font-semibold border-b border-dotted border-black w-[72px] flex-none text-center pb-0">
                            {formatDateDDMMYY(header.date) || '\u00A0'}
                          </span>
                        </div>

                        <div className="flex items-center justify-start min-h-[19px] w-full text-xs">
                          <span className="w-[70px] flex-none font-semibold text-black whitespace-nowrap text-left">Challan No.</span>
                          <span className="w-2 flex-none text-center font-semibold text-black">:</span>
                          <span className="font-semibold w-[82px] flex-none truncate text-center border-b border-dotted border-black pb-0 font-bold">
                            {header.challanNo || '\u00A0'}
                          </span>
                          <span className="w-[30px] flex-none font-semibold text-black whitespace-nowrap text-right pr-0.5">Date:</span>
                          <span className="font-semibold border-b border-dotted border-black w-[72px] flex-none text-center pb-0">
                            {formatDateDDMMYY(header.challanDate) || formatDateDDMMYY(header.date) || '\u00A0'}
                          </span>
                        </div>

                        <div className="flex items-center justify-start min-h-[19px] w-full text-xs">
                          <span className="w-[70px] flex-none font-semibold text-black whitespace-nowrap text-left">Ref. No.</span>
                          <span className="w-2 flex-none text-center font-semibold text-black">:</span>
                          <span className="font-semibold border-b border-dotted border-black w-[184px] flex-none text-left pb-0">
                            {header.refNo || '\u00A0'}
                          </span>
                        </div>

                        <div className="flex items-center justify-start min-h-[19px] w-full text-xs">
                          <span className="w-[70px] flex-none font-semibold text-black whitespace-nowrap text-left">Salesman Code</span>
                          <span className="w-2 flex-none text-center font-semibold text-black">:</span>
                          <span className="font-semibold border-b border-dotted border-black w-[184px] flex-none text-left pb-0 truncate">
                            {header.salesmanCode || '\u00A0'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Items Table: Delivery Challan or Bill */}
                    {docType === 'challan' ? (
                      <div className="border-2 border-black overflow-visible font-sans flex-1 flex flex-col justify-between mt-1 mb-1">
                        <table className="w-full border-collapse text-left flex-1 text-xs">
                          <thead>
                            <tr className="bg-white text-black border-b-2 border-black font-bold text-center">
                              <th className="py-1 px-1 text-center w-10 border-r border-black font-bold whitespace-nowrap">Sl No.</th>
                              <th className="py-1 px-2 text-center border-r border-black font-bold whitespace-nowrap min-w-[240px]">Item Description</th>
                              <th className="py-1 px-1 text-center w-16 sm:w-20 border-r border-black font-bold whitespace-nowrap">Quantity</th>
                              <th className="py-1 px-1 text-center w-16 border-r border-black font-bold whitespace-nowrap">Unit</th>
                              <th className="py-1 px-1 text-center w-28 border-black font-bold whitespace-nowrap">Colour</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-transparent">
                            {lines.map((line, idx) => (
                              <tr key={line.id || idx} className="h-6 font-semibold text-xs text-black">
                                <td className="py-0.5 px-1 text-center border-r border-black font-semibold">{String(idx + 1).padStart(2, '0')}.</td>
                                <td style={{ lineHeight: '1.35' }} className="py-0.5 px-2 border-r border-black font-semibold whitespace-normal break-words leading-normal">{line.itemDescription || ''}</td>
                                <td className="py-0.5 px-1 text-center border-r border-black font-semibold">{line.coilQty}</td>
                                <td className="py-0.5 px-1 text-center border-r border-black font-semibold">{formatDisplayUnit(line.unit, line.coilQty)}</td>
                                <td className="py-0.5 px-1 text-center font-semibold text-[11px]">{formatChallanLineColors(line)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="border-t-2 border-black font-semibold text-xs">
                            <tr className="font-semibold">
                              <td colSpan={2} className="py-1 px-2 text-right border-r border-black font-bold uppercase tracking-wider whitespace-nowrap">Total Coils =</td>
                              <td className="py-1 px-1 text-center border-r border-black font-bold font-mono">{totalCoils || 0}</td>
                              <td className="py-1 px-1 text-center border-r border-black font-semibold">Coils</td>
                              <td className="py-1 px-1"></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : (
                      /* Classic Items Table */
                      <div className="border-2 border-black overflow-visible font-sans flex-1 flex flex-col justify-between mt-1 mb-1">
                        <table className="w-full border-collapse text-left flex-1 text-xs">
                          <thead>
                            <tr className="bg-white text-black border-b-2 border-black font-bold text-center">
                              <th className="py-1 px-1 text-center w-10 border-r border-black font-bold whitespace-nowrap">Sl No.</th>
                              <th className="py-1 px-2 text-center border-r border-black font-bold whitespace-nowrap min-w-[240px]">Name Of Items</th>
                              <th className="py-1 px-1 text-center w-16 sm:w-18 border-r border-black font-bold whitespace-nowrap">Quantity</th>
                              <th className="py-1 px-1 text-center w-12 border-r border-black font-bold whitespace-nowrap">Unit</th>
                              <th className="py-1 px-1 text-center w-20 border-r border-black font-bold whitespace-nowrap">Price/Unit</th>
                              <th className="py-1 px-2 text-center w-24 sm:w-28 font-bold whitespace-nowrap">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-transparent">
                            {lines.map((line, idx) => (
                              <tr key={line.id || idx} className="h-6 font-semibold text-xs text-black">
                                <td className="py-0.5 px-1 text-center border-r border-black font-semibold">{String(idx + 1).padStart(2, '0')}.</td>
                                <td style={{ lineHeight: '1.35' }} className="py-0.5 px-2 border-r border-black font-semibold whitespace-normal break-words leading-normal">{line.itemDescription || ''}</td>
                                <td className="py-0.5 px-1 text-center border-r border-black font-semibold">{line.coilQty}</td>
                                <td className="py-0.5 px-1 text-center border-r border-black font-semibold">{formatDisplayUnit(line.unit, line.coilQty)}</td>
                                <td className="py-0.5 px-1 text-right border-r border-black font-semibold">{line.rate ? line.rate.toLocaleString('en-IN') : '0'}</td>
                                <td className="py-0.5 px-2 text-right font-semibold">{line.amount ? `${line.amount.toLocaleString('en-IN')}/-` : '0/-'}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="border-t-2 border-black font-semibold text-xs">
                            <tr className="border-b border-black font-semibold">
                              <td colSpan={2} className="py-1 px-2 text-right border-r border-black font-semibold whitespace-nowrap">Total Coils =</td>
                              <td className="py-1 px-1 text-center border-r border-black font-semibold">{totalCoils || 0}</td>
                              <td className="py-1 px-1 text-center border-r border-black font-semibold">Coils</td>
                              <td className="py-1 px-1 text-right border-r border-black font-semibold whitespace-nowrap">Subtotal =</td>
                              <td className="py-1 px-2 text-right font-semibold whitespace-nowrap">{calculatedSubtotal ? `${calculatedSubtotal.toLocaleString('en-IN')}/-` : '0/-'}</td>
                            </tr>
                            {calculatedDiscountAmount > 0 && (
                              <tr className="border-b border-black font-semibold">
                                <td colSpan={5} className="py-1 px-2 text-right border-r border-black font-semibold whitespace-nowrap">
                                  Sales Discount <span className="inline-block border border-slate-300 px-1 py-0.5 rounded bg-white font-semibold">{discountPercent || 0}</span> % =
                                </td>
                                <td className="py-1 px-2 text-right font-semibold text-black whitespace-nowrap">
                                  {calculatedDiscountAmount.toLocaleString('en-IN')}/-
                                </td>
                              </tr>
                            )}
                            <tr className="font-semibold">
                              <td colSpan={5} className="py-1 px-2 text-right border-r border-black font-black whitespace-nowrap">Total =</td>
                              <td className="py-1 px-2 text-right font-black whitespace-nowrap">{calculatedGrandTotal ? `${calculatedGrandTotal.toLocaleString('en-IN')}/-` : '0/-'}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}

                    {/* Summary / In Words / Dispatch Note */}
                    {docType === 'challan' ? (
                      <div className="border border-black p-2 flex items-start justify-between text-xs bg-slate-50 mt-1 flex-none">
                        <div className="flex-1 space-y-0.5 pr-2">
                          <div className="text-[11px] text-slate-800">
                            <span className="font-bold">Dispatch Note:</span> Goods received in sound condition. Please verify coil count before signing.
                          </div>
                        </div>
                        <div className="space-y-0.5 font-mono text-xs border-l border-black pl-3 text-right">
                          <div className="flex justify-between gap-2 font-bold text-black text-xs">
                            <span className="font-sans font-bold">Total Coils:</span>
                            <span className="font-black font-mono">{totalCoils || 0}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* In Words */
                      <div className="pt-2 text-black flex items-center space-x-2 text-xs flex-none">
                        <span className="font-semibold text-black">In Word:</span>
                        <span className="font-bold text-black">{inWords}</span>
                      </div>
                    )}

                    {/* Clearance space: minimum 5 lines normally, 3 lines when items are many */}
                    <div
                      className={`${
                        lines.length >= 10 ? 'min-h-[42px]' : 'min-h-[75px]'
                      } flex-1 w-full`}
                      aria-hidden="true"
                    />
                  </div>

                  {/* Signatures */}
                  <div className="w-full pb-0 flex-none grid grid-cols-4 gap-4 text-center text-black font-semibold text-xs mt-1">
                    <div><div className="border-t border-black pt-1">Receiver's Signature</div></div>
                    <div><div className="border-t border-black pt-1">Prepared By</div></div>
                    <div><div className="border-t border-black pt-1">Check By</div></div>
                    <div><div className="border-t border-black pt-1">Approved By</div></div>
                  </div>

                  {/* Bottom Registered Office Footer */}
                  <div className={`w-full pt-1.5 text-center text-[#0284c7] font-semibold text-[10px] leading-tight flex-none border-t border-sky-200/50 mt-1 ${padHeaderMode !== 'plain' ? 'hide-on-preprinted-pad invisible opacity-0 h-0 overflow-hidden' : ''}`}>
                    House-16, Block-C, Main Road, Aftabnagar, Dhaka-1212. Tel : (+88) 02-226602861-8, Web : www.polycables.com.bd
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Printer Auto-Configuration Engine Modal */}
      <PrinterAutoConfigModal
        isOpen={showPrinterAutoConfigModal}
        onClose={() => setShowPrinterAutoConfigModal(false)}
        documentType={printPaperFormat === 'slip_pad' ? 'slip_pad' : 'bill'}
        currentScale={slipPadFontScale}
      />
    </>
  );
};
