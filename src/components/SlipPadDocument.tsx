import React from 'react';
import { BillHeader, BillLineItem } from '../types';
import { formatDateDDMMYY } from '../utils/dateUtils';
import { PolyCablesEmblem, PolyCablesLogo } from './PolyCablesLogo';

export interface SlipPadDocumentProps {
  header: BillHeader;
  lines: BillLineItem[];
  partyPhone?: string;
  padHeaderMode: 'plain' | 'hide_logo' | 'hide_all';
  orientation?: 'portrait' | 'landscape';
  topOffsetInch?: number;
  leftOffsetInch?: number;
  fontSizePercent?: number;
  rowHeightPx?: number;
  // Granular Column Widths (in px)
  colWidthSl?: number;
  colWidthDesc?: number;
  colWidthQty?: number;
  colWidthRate?: number;
  colWidthAmount?: number;
  // Granular Section Offsets (in px)
  metaTopOffsetPx?: number;
  tableTopOffsetPx?: number;
  footerTopOffsetPx?: number;
  // Individual Text Element Position Shifts (in px)
  colDescShiftX?: number;
  colDescShiftY?: number;
  colQtyShiftX?: number;
  colQtyShiftY?: number;
  colRateShiftX?: number;
  colRateShiftY?: number;
  colAmountShiftX?: number;
  colAmountShiftY?: number;
  colSlShiftX?: number;
  colSlShiftY?: number;
  partyNameShiftX?: number;
  partyNameShiftY?: number;
  dateShiftX?: number;
  dateShiftY?: number;
  phoneShiftX?: number;
  phoneShiftY?: number;
  addressShiftX?: number;
  addressShiftY?: number;
  inWordsShiftX?: number;
  inWordsShiftY?: number;
  totalBoxShiftX?: number;
  totalBoxShiftY?: number;
  // Individual Font Sizes (in px)
  partyNameFontSize?: number;
  dateFontSize?: number;
  phoneFontSize?: number;
  addressFontSize?: number;
  tableHeaderFontSize?: number;
  tableRowFontSize?: number;
  totalRowFontSize?: number;
  inWordsFontSize?: number;
  highlightedElement?: string | null;
  totalRowsCount?: number;
  customRowHeights?: Record<number, number>;
  customRowShiftsY?: Record<number, number>;
  highlightedRowIndex?: number | null;
  onRowClick?: (rowIndex: number) => void;
  showTableHeader?: boolean;
  customImageUrl?: string | null;
  slipPadShowBgImage?: boolean;
  printBgImage?: boolean;
  slipPadBgOpacity?: number;
  grandTotal: number;
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  totalCoils?: number;
  inWordsLine1: string;
  inWordsLine2: string;
  showAlignmentGuides?: boolean;
  previewZoom?: '80%' | '100%' | '115%';
}

export const SlipPadDocument: React.FC<SlipPadDocumentProps> = ({
  header,
  lines,
  partyPhone = '',
  padHeaderMode = 'plain',
  topOffsetInch,
  leftOffsetInch,
  fontSizePercent,
  rowHeightPx,
  colWidthSl,
  colWidthQty,
  colWidthRate,
  colWidthAmount,
  metaTopOffsetPx,
  tableTopOffsetPx,
  footerTopOffsetPx,
  colDescShiftX,
  colDescShiftY,
  colQtyShiftX,
  colQtyShiftY,
  colRateShiftX,
  colRateShiftY,
  colAmountShiftX,
  colAmountShiftY,
  colSlShiftX,
  colSlShiftY,
  partyNameShiftX,
  partyNameShiftY,
  dateShiftX,
  dateShiftY,
  phoneShiftX,
  phoneShiftY,
  addressShiftX,
  addressShiftY,
  inWordsShiftX,
  inWordsShiftY,
  totalBoxShiftX,
  totalBoxShiftY,
  partyNameFontSize,
  dateFontSize,
  phoneFontSize,
  addressFontSize,
  tableHeaderFontSize,
  tableRowFontSize,
  totalRowFontSize,
  inWordsFontSize,
  highlightedElement = null,
  totalRowsCount,
  customRowHeights,
  customRowShiftsY,
  highlightedRowIndex = null,
  onRowClick,
  showTableHeader,
  customImageUrl = null,
  slipPadShowBgImage,
  printBgImage = false,
  slipPadBgOpacity,
  grandTotal = 0,
  subtotal = 0,
  discountAmount = 0,
  discountPercent = 0,
  totalCoils = 0,
  inWordsLine1 = '',
  inWordsLine2 = '',
  showAlignmentGuides = false,
  previewZoom = '100%',
}) => {
  // Read persistent settings with fallback to props / saved localStorage
  const getStoredNum = (key: string, fallback: number): number => {
    try {
      const val = localStorage.getItem(key);
      return val !== null && !isNaN(parseFloat(val)) ? parseFloat(val) : fallback;
    } catch {
      return fallback;
    }
  };

  const isPlain = padHeaderMode === 'plain';
  const hideLogo = padHeaderMode === 'hide_logo' || padHeaderMode === 'hide_all';
  const hideAllTemplate = padHeaderMode === 'hide_all';

  const effTopOffset = topOffsetInch !== undefined ? topOffsetInch : getStoredNum('polycables_slip_pad_top_offset', 0.5);
  const effLeftOffset = leftOffsetInch !== undefined ? leftOffsetInch : getStoredNum('polycables_slip_pad_left_offset', 0.0);
  const effFontSizePercent = fontSizePercent !== undefined ? fontSizePercent : getStoredNum('polycables_slip_pad_font_scale', 100);
  const fontMultiplier = effFontSizePercent / 100;

  // Effective default row height
  const effRowHeight = rowHeightPx !== undefined ? rowHeightPx : getStoredNum('polycables_slip_pad_row_height', 26);
  const rowsCount = 15;

  // Column Widths
  const effColWidthSl = colWidthSl !== undefined ? colWidthSl : getStoredNum('polycables_col_sl', getStoredNum('polycables_col_w_sl', 38));
  const effColWidthQty = colWidthQty !== undefined ? colWidthQty : getStoredNum('polycables_col_qty', getStoredNum('polycables_col_w_qty', 42));
  const effColWidthRate = colWidthRate !== undefined ? colWidthRate : getStoredNum('polycables_col_rate', getStoredNum('polycables_col_w_rate', 67));
  const effColWidthAmount = colWidthAmount !== undefined ? colWidthAmount : getStoredNum('polycables_col_amount', getStoredNum('polycables_col_w_amt', 83));

  // Section Offsets
  const effMetaTopOffset = metaTopOffsetPx !== undefined ? metaTopOffsetPx : getStoredNum('polycables_meta_top_offset', getStoredNum('polycables_offset_meta_top', 0));
  const effTableTopOffset = tableTopOffsetPx !== undefined ? tableTopOffsetPx : getStoredNum('polycables_table_top_offset', getStoredNum('polycables_offset_table_top', -142));
  const effFooterTopOffset = footerTopOffsetPx !== undefined ? footerTopOffsetPx : getStoredNum('polycables_footer_top_offset', getStoredNum('polycables_offset_footer_top', 65));

  // Individual Element Shifts
  const effDateShiftX = dateShiftX !== undefined ? dateShiftX : getStoredNum('polycables_shift_date_x', 30);
  const effDateShiftY = dateShiftY !== undefined ? dateShiftY : getStoredNum('polycables_shift_date_y', -110);
  const effPartyNameShiftX = partyNameShiftX !== undefined ? partyNameShiftX : getStoredNum('polycables_shift_name_x', 50);
  const effPartyNameShiftY = partyNameShiftY !== undefined ? partyNameShiftY : getStoredNum('polycables_shift_name_y', -105);
  const effPhoneShiftX = phoneShiftX !== undefined ? phoneShiftX : getStoredNum('polycables_shift_phone_x', 0);
  const effPhoneShiftY = phoneShiftY !== undefined ? phoneShiftY : getStoredNum('polycables_shift_phone_y', 0);
  const effAddressShiftX = addressShiftX !== undefined ? addressShiftX : getStoredNum('polycables_shift_address_x', 50);
  const effAddressShiftY = addressShiftY !== undefined ? addressShiftY : getStoredNum('polycables_shift_address_y', -105);
  const effColSlShiftX = colSlShiftX !== undefined ? colSlShiftX : getStoredNum('polycables_shift_col_sl_x', 0);
  const effColSlShiftY = colSlShiftY !== undefined ? colSlShiftY : getStoredNum('polycables_shift_col_sl_y', 0);
  const effColDescShiftX = colDescShiftX !== undefined ? colDescShiftX : getStoredNum('polycables_shift_col_desc_x', 0);
  const effColDescShiftY = colDescShiftY !== undefined ? colDescShiftY : getStoredNum('polycables_shift_col_desc_y', 0);
  const effColQtyShiftX = colQtyShiftX !== undefined ? colQtyShiftX : getStoredNum('polycables_shift_col_qty_x', 0);
  const effColQtyShiftY = colQtyShiftY !== undefined ? colQtyShiftY : getStoredNum('polycables_shift_col_qty_y', 0);
  const effColRateShiftX = colRateShiftX !== undefined ? colRateShiftX : getStoredNum('polycables_shift_col_rate_x', 0);
  const effColRateShiftY = colRateShiftY !== undefined ? colRateShiftY : getStoredNum('polycables_shift_col_rate_y', 0);
  const effColAmountShiftX = colAmountShiftX !== undefined ? colAmountShiftX : getStoredNum('polycables_shift_col_amount_x', 0);
  const effColAmountShiftY = colAmountShiftY !== undefined ? colAmountShiftY : getStoredNum('polycables_shift_col_amount_y', 0);
  const effTotalBoxShiftX = totalBoxShiftX !== undefined ? totalBoxShiftX : getStoredNum('polycables_shift_total_box_x', 0);
  const effTotalBoxShiftY = totalBoxShiftY !== undefined ? totalBoxShiftY : getStoredNum('polycables_shift_total_box_y', 0);
  const effInWordsShiftX = inWordsShiftX !== undefined ? inWordsShiftX : getStoredNum('polycables_shift_in_words_x', 0);
  const effInWordsShiftY = inWordsShiftY !== undefined ? inWordsShiftY : getStoredNum('polycables_shift_in_words_y', 0);

  // Individual Font Sizes
  const effPartyNameFontSize = partyNameFontSize !== undefined ? partyNameFontSize : getStoredNum('polycables_font_party_name', 14);
  const effDateFontSize = dateFontSize !== undefined ? dateFontSize : getStoredNum('polycables_font_date', 12);
  const effPhoneFontSize = phoneFontSize !== undefined ? phoneFontSize : getStoredNum('polycables_font_phone', 11);
  const effAddressFontSize = addressFontSize !== undefined ? addressFontSize : getStoredNum('polycables_font_address', 12.5);
  const effTableHeaderFontSize = tableHeaderFontSize !== undefined ? tableHeaderFontSize : getStoredNum('polycables_font_table_header', 10.5);
  const effTableRowFontSize = tableRowFontSize !== undefined ? tableRowFontSize : getStoredNum('polycables_font_table_row', 12);
  const effTotalRowFontSize = totalRowFontSize !== undefined ? totalRowFontSize : getStoredNum('polycables_font_total_row', 12);
  const effInWordsFontSize = inWordsFontSize !== undefined ? inWordsFontSize : getStoredNum('polycables_font_in_words', 11);

  // Custom Row Heights & Shifts Map
  const effCustomRowHeights = customRowHeights || (() => {
    try {
      const raw = localStorage.getItem('polycables_slip_pad_custom_row_heights');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  })();

  const effCustomRowShiftsY = customRowShiftsY || (() => {
    try {
      const raw = localStorage.getItem('polycables_slip_pad_custom_row_shifts_y');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  })();

  // Filter printable lines (non-empty items)
  const printableLines = lines.filter(
    (line) =>
      (line.itemDescription && line.itemDescription.trim() !== '') ||
      (Number(line.coilQty) || 0) > 0 ||
      (Number(line.amount) || 0) > 0
  );

  const zoomScale = previewZoom === '80%' ? 0.8 : previewZoom === '115%' ? 1.15 : 1.0;

  // Computed Financial Totals
  const computedTotalCoils = totalCoils || printableLines.reduce((sum, l) => sum + (Number(l.coilQty) || 0), 0);
  const computedSubtotal = subtotal || printableLines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const computedDiscount = discountAmount || (discountPercent > 0 ? Math.round((computedSubtotal * discountPercent) / 100) : 0);
  const computedGrandTotal = grandTotal || (computedSubtotal - computedDiscount);

  // 5.5" x 8.5" Slip Pad Document (Exact replica of Slip Pad memo)
  return (
    <div
      className="printable-slip-pad slip-pad-page slip-pad-portrait bg-white text-black shadow-2xl border-2 border-slate-300 rounded-sm font-sans transition-all duration-200 origin-top overflow-hidden relative select-none"
      style={{
        width: '5.5in',
        height: '8.5in',
        minWidth: '5.5in',
        minHeight: '8.5in',
        maxWidth: '5.5in',
        maxHeight: '8.5in',
        boxSizing: 'border-box',
        transform: `scale(${zoomScale})`,
      }}
    >
      {/* Alignment Guides */}
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
              5.5" × 8.5" Exact Pad
            </span>
          </div>
        </div>
      )}

      {/* Optional Custom Background Image Overlay */}
      {customImageUrl && slipPadShowBgImage && (
        <img
          src={customImageUrl}
          alt="Pre-printed Slip Pad Background"
          referrerPolicy="no-referrer"
          className={`absolute inset-0 w-full h-full object-fill pointer-events-none select-none z-0 ${
            printBgImage ? '' : 'print:hidden'
          }`}
          style={{ opacity: isPlain ? 1.0 : (slipPadBgOpacity ?? 0.35) }}
        />
      )}

      {/* Unified 5.5" x 8.5" Pad Structure */}
      <div 
        className="relative z-10 w-full h-full flex flex-col justify-between font-sans overflow-hidden bg-transparent box-border"
        style={{
          paddingTop: `${Math.max(0, effTopOffset)}in`,
          paddingLeft: `calc(1rem + ${effLeftOffset}in)`,
          paddingRight: `calc(1rem - ${effLeftOffset}in)`,
          fontSize: `${11 * fontMultiplier}px`
        }}
      >
        
        {/* 1. TOP NAVY BANNER (Height: 1.10in / ~106px) */}
        <div
          className={`relative w-full h-[1.10in] bg-[#142058] overflow-hidden flex items-center justify-between px-4 ${
            hideLogo ? 'invisible opacity-0' : 'visible opacity-100'
          }`}
        >
          {/* 4-Circle Logo on Left */}
          <div className="relative z-10 flex items-center space-x-2">
            <div className="relative w-12 h-12 flex-shrink-0 bg-white/95 rounded-xl p-1 shadow-md">
              <PolyCablesEmblem size="lg" />
            </div>
          </div>

          {/* Brand Name & Slogan on Right */}
          <div className="relative z-10 text-right text-white pr-2">
            <PolyCablesLogo size="lg" variant="dark" showSubtitle={false} />
            <p className="font-semibold tracking-wider text-white/95 mt-1 font-sans" style={{ fontSize: `${11 * fontMultiplier}px` }}>
              Safety in Every Connection
            </p>
          </div>

          {/* Golden swoosh decoration along the bottom banner */}
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

        {/* 2. TOP METADATA FIELDS (Date, Party Name, Phone, Address without labels or dots) */}
        <div 
          className="relative w-full px-4 pt-1.5 text-slate-900 text-[11px] font-medium"
          style={{ transform: `translateY(${effMetaTopOffset}px)` }}
        >
          {/* Row 1: Date (Right) */}
          <div className="flex justify-end items-center h-[22px]">
            <div 
              className={`flex items-center space-x-1 transition-all ${
                highlightedElement === 'date' ? 'ring-2 ring-amber-400 bg-amber-50/50 rounded px-1' : ''
              }`}
              style={{ transform: `translate(${effDateShiftX}px, ${effDateShiftY}px)` }}
            >
              <span 
                className="inline-flex items-center justify-start w-28 pl-1 font-bold text-slate-950 font-sans"
                style={{ fontSize: `${effDateFontSize * fontMultiplier}px` }}
              >
                {formatDateDDMMYY(header.date) || ''}
              </span>
            </div>
          </div>

          {/* Row 2: Party Name (Left) & Phone (Right) */}
          <div className="flex justify-between items-center h-[22px] mt-0.5">
            <div 
              className={`flex items-center space-x-1 flex-1 mr-3 min-w-0 transition-all ${
                highlightedElement === 'name' ? 'ring-2 ring-amber-400 bg-amber-50/50 rounded px-1' : ''
              }`}
              style={{ transform: `translate(${effPartyNameShiftX}px, ${effPartyNameShiftY}px)` }}
            >
              <span 
                className="inline-flex items-center flex-1 pl-1 font-bold text-slate-950 truncate"
                style={{ fontSize: `${effPartyNameFontSize * fontMultiplier}px` }}
              >
                {header.partyName || ''}
              </span>
            </div>
            <div 
              className={`flex items-center space-x-1 flex-shrink-0 transition-all ${
                highlightedElement === 'phone' ? 'ring-2 ring-amber-400 bg-amber-50/50 rounded px-1' : ''
              }`}
              style={{ transform: `translate(${effPhoneShiftX}px, ${effPhoneShiftY}px)` }}
            >
              <span 
                className="inline-flex items-center justify-start w-28 pl-1 font-bold text-slate-950"
                style={{ fontSize: `${effPhoneFontSize * fontMultiplier}px` }}
              >
                {partyPhone || header.phone || header.orderNumber || ''}
              </span>
            </div>
          </div>

          {/* Row 3: Address (Full Width) */}
          <div 
            className={`flex items-center space-x-1 h-[22px] mt-0.5 transition-all ${
              highlightedElement === 'address' ? 'ring-2 ring-amber-400 bg-amber-50/50 rounded px-1' : ''
            }`}
            style={{ transform: `translate(${effAddressShiftX}px, ${effAddressShiftY}px)` }}
          >
            <span 
              className="inline-flex items-center flex-1 pl-1 font-bold text-slate-950 truncate"
              style={{ fontSize: `${effAddressFontSize * fontMultiplier}px` }}
            >
              {header.address || ''}
            </span>
          </div>
        </div>

        {/* 3. TABLE GRID (Header + Ruled Rows + Attached Summary - No Borders) */}
        <div 
          className="relative mx-3.5 mt-1"
          style={{ transform: `translateY(${effTableTopOffset}px)` }}
        >
          {/* Table Header Bar */}
          {showTableHeader && (
            <div
              className={`grid font-bold text-center ${
                hideAllTemplate
                  ? 'text-transparent bg-transparent'
                  : 'bg-[#142058] text-white'
              }`}
              style={{ 
                gridTemplateColumns: `${effColWidthSl}px 1fr ${effColWidthQty}px ${effColWidthRate}px ${effColWidthAmount}px`,
                fontSize: `${effTableHeaderFontSize * fontMultiplier}px` 
              }}
            >
              <div className="py-0.5">SL</div>
              <div className="py-0.5">Item Description</div>
              <div className="py-0.5">Qty</div>
              <div className="py-0.5">Rate</div>
              <div className="py-0.5">Amount</div>
            </div>
          )}

          {/* Ruled Rows (Dynamic Count & Individual Heights - No Borders) */}
          {Array.from({ length: rowsCount }).map((_, idx) => {
            const row = printableLines[idx];
            const isRow13 = idx === 12; // Row number 13 (0-indexed: 12)
            const isRow14 = idx === 13; // Row number 14 (0-indexed: 13)
            const isRow15 = idx === 14; // Row number 15 (0-indexed: 14)
            const isItemRow = idx < 12 && !!row;
            const rHeight = effCustomRowHeights[idx] || effRowHeight;
            const rShiftY = effCustomRowShiftsY[idx] || 0;
            const isHighlighted = highlightedRowIndex === idx;

            return (
              <div
                key={idx}
                onClick={() => onRowClick && onRowClick(idx)}
                className={`grid text-slate-900 relative select-none cursor-pointer transition-colors ${
                  isHighlighted ? 'bg-amber-100/70 ring-1 ring-amber-400 z-10' : ''
                }`}
                style={{
                  gridTemplateColumns: `${effColWidthSl}px 1fr ${effColWidthQty}px ${effColWidthRate}px ${effColWidthAmount}px`,
                  height: `${rHeight}px`,
                  minHeight: `${rHeight}px`,
                  maxHeight: `${rHeight}px`,
                  fontSize: `${effTableRowFontSize * fontMultiplier}px`,
                  transform: `translateY(${rShiftY}px)`,
                }}
              >
                {isRow13 ? (
                  <>
                    {/* Row 13 - Col 1: SL */}
                    <div></div>
                    {/* Row 13 - Col 2: পণ্যের বিবরণ (Item Name) -> Total Coils = */}
                    <div 
                      className={`flex items-center justify-end font-bold text-slate-950 pr-1.5 truncate transition-all ${
                        highlightedElement === 'col_desc' || highlightedElement === 'total_coils' ? 'bg-amber-100/70 ring-1 ring-amber-400' : ''
                      }`}
                      style={{ 
                        transform: `translate(${effColDescShiftX + effTotalBoxShiftX}px, ${effColDescShiftY + effTotalBoxShiftY}px)`,
                        fontSize: `${effTotalRowFontSize * fontMultiplier}px`
                      }}
                    >
                      Total Coils =
                    </div>
                    {/* Row 13 - Col 3: সংখ্যা (Qty) -> value of total coils */}
                    <div 
                      className={`flex items-center justify-center font-bold text-slate-950 font-mono transition-all ${
                        highlightedElement === 'col_qty' ? 'bg-amber-100/70 ring-1 ring-amber-400' : ''
                      }`}
                      style={{ 
                        transform: `translate(${effColQtyShiftX + effTotalBoxShiftX}px, ${effColQtyShiftY + effTotalBoxShiftY}px)`,
                        fontSize: `${effTotalRowFontSize * fontMultiplier}px`
                      }}
                    >
                      {computedTotalCoils > 0 ? Number(computedTotalCoils) : '0'}
                    </div>
                    {/* Row 13 - Col 4: দর (Rate) -> Subtotal = */}
                    <div 
                      className={`flex items-center justify-end font-bold text-slate-950 pr-1.5 whitespace-nowrap transition-all ${
                        highlightedElement === 'col_rate' ? 'bg-amber-100/70 ring-1 ring-amber-400' : ''
                      }`}
                      style={{ 
                        transform: `translate(${effColRateShiftX + effTotalBoxShiftX}px, ${effColRateShiftY + effTotalBoxShiftY}px)`,
                        fontSize: `${effTotalRowFontSize * fontMultiplier}px`
                      }}
                    >
                      Subtotal =
                    </div>
                    {/* Row 13 - Col 5: মূল্য (Price / Amount) -> Subtotal value right aligned */}
                    <div 
                      className={`flex items-center justify-end text-right font-bold text-slate-950 font-mono pr-1 transition-all ${
                        highlightedElement === 'col_amount' ? 'bg-amber-100/70 ring-1 ring-amber-400' : ''
                      }`}
                      style={{ 
                        transform: `translate(${effColAmountShiftX + effTotalBoxShiftX}px, ${effColAmountShiftY + effTotalBoxShiftY}px)`,
                        fontSize: `${effTotalRowFontSize * fontMultiplier}px`
                      }}
                    >
                      {computedSubtotal > 0 ? `${Number(computedSubtotal).toLocaleString('en-IN')}/-` : '0/-'}
                    </div>
                  </>
                ) : isRow14 ? (
                  <>
                    {/* Row 14 - Col 1: SL */}
                    <div></div>
                    {/* Row 14 - Col 2: পণ্যের বিবরণ */}
                    <div></div>
                    {/* Row 14 - Col 3: সংখ্যা */}
                    <div></div>
                    {/* Row 14 - Col 4: দর -> Sales Discount _% = */}
                    <div 
                      className={`flex items-center justify-end font-bold text-slate-950 pr-1.5 whitespace-nowrap transition-all ${
                        highlightedElement === 'col_rate' ? 'bg-amber-100/70 ring-1 ring-amber-400' : ''
                      }`}
                      style={{ 
                        transform: `translate(${effColRateShiftX + effTotalBoxShiftX}px, ${effColRateShiftY + effTotalBoxShiftY}px)`,
                        fontSize: `${effTotalRowFontSize * fontMultiplier}px`
                      }}
                    >
                      Sales Discount {discountPercent > 0 ? `${discountPercent}%` : '_%'} =
                    </div>
                    {/* Row 14 - Col 5: মূল্য -> Discount amount right aligned */}
                    <div 
                      className={`flex items-center justify-end text-right font-bold text-slate-950 font-mono pr-1 transition-all ${
                        highlightedElement === 'col_amount' ? 'bg-amber-100/70 ring-1 ring-amber-400' : ''
                      }`}
                      style={{ 
                        transform: `translate(${effColAmountShiftX + effTotalBoxShiftX}px, ${effColAmountShiftY + effTotalBoxShiftY}px)`,
                        fontSize: `${effTotalRowFontSize * fontMultiplier}px`
                      }}
                    >
                      {computedDiscount > 0 ? `-${Number(computedDiscount).toLocaleString('en-IN')}/-` : '0/-'}
                    </div>
                  </>
                ) : isRow15 ? (
                  <>
                    {/* Row 15 - Col 1: SL */}
                    <div></div>
                    {/* Row 15 - Col 2: পণ্যের বিবরণ */}
                    <div></div>
                    {/* Row 15 - Col 3: সংখ্যা */}
                    <div></div>
                    {/* Row 15 - Col 4: দর -> Total = */}
                    <div 
                      className={`flex items-center justify-end text-right font-black text-slate-950 pr-1.5 whitespace-nowrap transition-all ${
                        highlightedElement === 'col_rate' ? 'bg-amber-100/70 ring-1 ring-amber-400' : ''
                      }`}
                      style={{ 
                        transform: `translate(${effColRateShiftX + effTotalBoxShiftX}px, ${effColRateShiftY + effTotalBoxShiftY}px)`,
                        fontSize: `${effTotalRowFontSize * fontMultiplier}px`
                      }}
                    >
                      <span className="font-black text-slate-950 tracking-tight">Total =</span>
                    </div>
                    {/* Row 15 - Col 5: মূল্য -> Total amount strictly right aligned */}
                    <div 
                      className={`flex items-center justify-end text-right font-black text-slate-950 font-mono pr-0.5 transition-all ${
                        highlightedElement === 'col_amount' ? 'bg-amber-100/70 ring-1 ring-amber-400' : ''
                      }`}
                      style={{ 
                        transform: `translate(${effColAmountShiftX + effTotalBoxShiftX}px, ${effColAmountShiftY + effTotalBoxShiftY}px)`,
                        fontSize: `${effTotalRowFontSize * fontMultiplier}px`
                      }}
                    >
                      <span className="bg-amber-100/80 px-1.5 py-0.5 rounded border border-amber-300 font-black text-slate-950 text-right shadow-xs print:bg-transparent print:border-none print:shadow-none print:text-black">
                        {computedGrandTotal > 0 ? `${Number(computedGrandTotal).toLocaleString('en-IN')}/-` : '0/-'}
                      </span>
                    </div>
                  </>
                ) : isItemRow ? (
                  <>
                    {/* Col 1: SL */}
                    <div 
                      className={`flex items-center justify-center font-bold text-slate-950 font-mono transition-all ${
                        highlightedElement === 'col_sl' ? 'bg-amber-100/70 ring-1 ring-amber-400' : ''
                      }`}
                      style={{ 
                        transform: `translate(${effColSlShiftX}px, ${effColSlShiftY}px)`,
                        fontSize: `${effTableRowFontSize * fontMultiplier}px`
                      }}
                    >
                      {idx + 1}
                    </div>
                    {/* Col 2: পণ্যের বিবরণ (Item Name - matching font size and bold) */}
                    <div 
                      className={`flex items-center font-bold text-slate-950 pl-1.5 truncate transition-all ${
                        highlightedElement === 'col_desc' ? 'bg-amber-100/70 ring-1 ring-amber-400' : ''
                      }`}
                      style={{ 
                        transform: `translate(${effColDescShiftX}px, ${effColDescShiftY}px)`,
                        fontSize: `${effTableRowFontSize * fontMultiplier}px`
                      }}
                    >
                      {row.itemDescription || ''}
                    </div>
                    {/* Col 3: সংখ্যা (Qty - matching font size and bold) */}
                    <div 
                      className={`flex items-center justify-center font-bold text-slate-950 font-mono transition-all ${
                        highlightedElement === 'col_qty' ? 'bg-amber-100/70 ring-1 ring-amber-400' : ''
                      }`}
                      style={{ 
                        transform: `translate(${effColQtyShiftX}px, ${effColQtyShiftY}px)`,
                        fontSize: `${effTableRowFontSize * fontMultiplier}px`
                      }}
                    >
                      {row.coilQty && Number(row.coilQty) > 0 ? Number(row.coilQty) : ''}
                    </div>
                    {/* Col 4: দর (Price / Rate - matching font size and bold) */}
                    <div 
                      className={`flex items-center justify-end text-right font-bold text-slate-950 font-mono pr-1.5 transition-all ${
                        highlightedElement === 'col_rate' ? 'bg-amber-100/70 ring-1 ring-amber-400' : ''
                      }`}
                      style={{ 
                        transform: `translate(${effColRateShiftX}px, ${effColRateShiftY}px)`,
                        fontSize: `${effTableRowFontSize * fontMultiplier}px`
                      }}
                    >
                      {row.rate && Number(row.rate) > 0 ? Number(row.rate).toLocaleString('en-IN') : ''}
                    </div>
                    {/* Col 5: মূল্য (Amount - matching font size and bold, right aligned) */}
                    <div 
                      className={`flex items-center justify-end text-right font-bold text-slate-950 font-mono pr-1 transition-all ${
                        highlightedElement === 'col_amount' ? 'bg-amber-100/70 ring-1 ring-amber-400' : ''
                      }`}
                      style={{ 
                        transform: `translate(${effColAmountShiftX}px, ${effColAmountShiftY}px)`,
                        fontSize: `${effTableRowFontSize * fontMultiplier}px`
                      }}
                    >
                      {row.amount && Number(row.amount) > 0 ? Number(row.amount).toLocaleString('en-IN') : ''}
                    </div>
                  </>
                ) : (
                  <>
                    <div></div>
                    <div></div>
                    <div></div>
                    <div></div>
                    <div></div>
                  </>
                )}
              </div>
            );
          })}

          {/* Attached Bottom Grid: In Words without 'কথায়ঃ' label or dots */}
          <div 
            className="w-full"
            style={{ 
              transform: `translateY(${effFooterTopOffset}px)` 
            }}
          >
            {/* Left Side: In Words on same single line */}
            <div 
              className={`flex items-center p-1.5 transition-all ${
                highlightedElement === 'in_words' ? 'bg-amber-100/70 ring-1 ring-amber-400' : ''
              }`}
              style={{ transform: `translate(${effInWordsShiftX}px, ${effInWordsShiftY}px)` }}
            >
              <div className="flex items-center space-x-1 w-full" style={{ fontSize: `${effInWordsFontSize * fontMultiplier}px` }}>
                <span className="inline-flex items-center flex-1 pl-1 font-bold text-slate-950 truncate whitespace-nowrap">
                  {[inWordsLine1, inWordsLine2].filter(Boolean).join(' ') || header?.inWords || ''}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 5. WATERMARK (Faint circle logo watermark in center) */}
        {isPlain && (
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.05] pointer-events-none">
            <div className="w-80 h-80">
              <PolyCablesEmblem size="3xl" className="w-full h-full" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
