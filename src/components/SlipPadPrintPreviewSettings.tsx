import React, { useState, useRef } from 'react';
import {
  Sliders,
  RotateCcw,
  X,
  Type,
  Maximize2,
  Printer,
  Sparkles,
  Save,
  Check,
  Image as ImageIcon,
  Upload,
  Eye,
  EyeOff,
  Move,
  Layers,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  Trash2
} from 'lucide-react';

export interface SlipPadPrintPreviewSettingsProps {
  padHeaderMode?: 'plain' | 'hide_logo' | 'hide_all' | 'slip_pad';
  onChangePadHeaderMode?: (mode: 'plain' | 'hide_logo' | 'hide_all' | 'slip_pad' | any) => void;
  topOffset?: number;
  onChangeTopOffset?: (val: number) => void;
  leftOffset?: number;
  onChangeLeftOffset?: (val: number) => void;
  fontScale?: number;
  onChangeFontScale?: (val: number) => void;
  rowHeight?: number;
  onChangeRowHeight?: (val: number) => void;
  showTableHeader?: boolean;
  onToggleTableHeader?: (val: boolean) => void;
  totalRows?: number;
  onChangeTotalRows?: (val: number) => void;
  showGuides?: boolean;
  onToggleGuides?: (val: boolean) => void;
  onResetDefaults?: () => void;
  onOpenAutoConfig?: () => void;
  onClose?: () => void;

  // Picture & Visibility
  showBgImage?: boolean;
  onToggleShowBgImage?: (val: boolean) => void;
  printBgImage?: boolean;
  onTogglePrintBgImage?: (val: boolean) => void;
  bgOpacity?: number;
  onChangeBgOpacity?: (val: number) => void;
  customBgUrl?: string | null;
  onUploadCustomBg?: (file: File) => void;
  onClearCustomBg?: () => void;

  // Individual Shifts (X, Y)
  dateShiftX?: number;
  dateShiftY?: number;
  onChangeDateShift?: (x: number, y: number) => void;
  partyNameShiftX?: number;
  partyNameShiftY?: number;
  onChangePartyNameShift?: (x: number, y: number) => void;
  phoneShiftX?: number;
  phoneShiftY?: number;
  onChangePhoneShift?: (x: number, y: number) => void;
  addressShiftX?: number;
  addressShiftY?: number;
  onChangeAddressShift?: (x: number, y: number) => void;
  colSlShiftX?: number;
  colSlShiftY?: number;
  onChangeColSlShift?: (x: number, y: number) => void;
  colDescShiftX?: number;
  colDescShiftY?: number;
  onChangeColDescShift?: (x: number, y: number) => void;
  colQtyShiftX?: number;
  colQtyShiftY?: number;
  onChangeColQtyShift?: (x: number, y: number) => void;
  colRateShiftX?: number;
  colRateShiftY?: number;
  onChangeColRateShift?: (x: number, y: number) => void;
  colAmountShiftX?: number;
  colAmountShiftY?: number;
  onChangeColAmountShift?: (x: number, y: number) => void;
  totalBoxShiftX?: number;
  totalBoxShiftY?: number;
  onChangeTotalBoxShift?: (x: number, y: number) => void;
  inWordsShiftX?: number;
  inWordsShiftY?: number;
  onChangeInWordsShift?: (x: number, y: number) => void;

  // Section offsets
  metaTopOffsetPx?: number;
  onChangeMetaTopOffsetPx?: (val: number) => void;
  tableTopOffsetPx?: number;
  onChangeTableTopOffsetPx?: (val: number) => void;
  footerTopOffsetPx?: number;
  onChangeFooterTopOffsetPx?: (val: number) => void;

  // Individual font sizes
  partyNameFontSize?: number;
  onChangePartyNameFontSize?: (val: number) => void;
  dateFontSize?: number;
  onChangeDateFontSize?: (val: number) => void;
  phoneFontSize?: number;
  onChangePhoneFontSize?: (val: number) => void;
  addressFontSize?: number;
  onChangeAddressFontSize?: (val: number) => void;
  tableHeaderFontSize?: number;
  onChangeTableHeaderFontSize?: (val: number) => void;
  tableRowFontSize?: number;
  onChangeTableRowFontSize?: (val: number) => void;
  totalRowFontSize?: number;
  onChangeTotalRowFontSize?: (val: number) => void;
  inWordsFontSize?: number;
  onChangeInWordsFontSize?: (val: number) => void;

  // Column widths
  colWidthSl?: number;
  onChangeColWidthSl?: (val: number) => void;
  colWidthQty?: number;
  onChangeColWidthQty?: (val: number) => void;
  colWidthRate?: number;
  onChangeColWidthRate?: (val: number) => void;
  colWidthAmount?: number;
  onChangeColWidthAmount?: (val: number) => void;
}

export const SlipPadPrintPreviewSettings: React.FC<SlipPadPrintPreviewSettingsProps> = ({
  padHeaderMode = 'hide_logo',
  onChangePadHeaderMode,
  topOffset = 0.5,
  onChangeTopOffset,
  leftOffset = 0,
  onChangeLeftOffset,
  fontScale = 100,
  onChangeFontScale,
  rowHeight = 26,
  onChangeRowHeight,
  showTableHeader = false,
  onToggleTableHeader,
  totalRows = 15,
  onChangeTotalRows,
  showGuides = false,
  onToggleGuides,
  onResetDefaults,
  onOpenAutoConfig,
  onClose,

  // Picture & Visibility
  showBgImage = true,
  onToggleShowBgImage,
  printBgImage = false,
  onTogglePrintBgImage,
  bgOpacity = 0.35,
  onChangeBgOpacity,
  customBgUrl = null,
  onUploadCustomBg,
  onClearCustomBg,

  // Individual Element Shifts
  dateShiftX = 30,
  dateShiftY = -110,
  onChangeDateShift,
  partyNameShiftX = 50,
  partyNameShiftY = -105,
  onChangePartyNameShift,
  phoneShiftX = 0,
  phoneShiftY = 0,
  onChangePhoneShift,
  addressShiftX = 50,
  addressShiftY = -105,
  onChangeAddressShift,
  colSlShiftX = 0,
  colSlShiftY = 0,
  onChangeColSlShift,
  colDescShiftX = 0,
  colDescShiftY = 0,
  onChangeColDescShift,
  colQtyShiftX = 0,
  colQtyShiftY = 0,
  onChangeColQtyShift,
  colRateShiftX = 0,
  colRateShiftY = 0,
  onChangeColRateShift,
  colAmountShiftX = 0,
  colAmountShiftY = 0,
  onChangeColAmountShift,
  totalBoxShiftX = 0,
  totalBoxShiftY = 0,
  onChangeTotalBoxShift,
  inWordsShiftX = 0,
  inWordsShiftY = 0,
  onChangeInWordsShift,

  // Section offsets
  metaTopOffsetPx = 0,
  onChangeMetaTopOffsetPx,
  tableTopOffsetPx = -142,
  onChangeTableTopOffsetPx,
  footerTopOffsetPx = 65,
  onChangeFooterTopOffsetPx,

  // Individual Font sizes
  partyNameFontSize = 14,
  onChangePartyNameFontSize,
  dateFontSize = 12,
  onChangeDateFontSize,
  phoneFontSize = 11,
  onChangePhoneFontSize,
  addressFontSize = 12.5,
  onChangeAddressFontSize,
  tableHeaderFontSize = 10.5,
  onChangeTableHeaderFontSize,
  tableRowFontSize = 12,
  onChangeTableRowFontSize,
  totalRowFontSize = 12,
  onChangeTotalRowFontSize,
  inWordsFontSize = 11,
  onChangeInWordsFontSize,

  // Column widths
  colWidthSl = 38,
  onChangeColWidthSl,
  colWidthQty = 42,
  onChangeColWidthQty,
  colWidthRate = 67,
  onChangeColWidthRate,
  colWidthAmount = 83,
  onChangeColWidthAmount
}) => {
  const [activeTab, setActiveTab] = useState<'picture_visibility' | 'shifts' | 'fonts_cols'>('picture_visibility');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [nudgeStep, setNudgeStep] = useState<number>(2); // 1, 2, or 5 px
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadCustomBg?.(e.target.files[0]);
    }
  };

  const handleSaveSettings = () => {
    try {
      localStorage.setItem('polycables_slip_pad_top_offset', String(topOffset));
      localStorage.setItem('polycables_slip_pad_left_offset', String(leftOffset));
      localStorage.setItem('polycables_slip_pad_font_scale', String(fontScale));
      localStorage.setItem('polycables_slip_pad_row_height', String(rowHeight));
      localStorage.setItem('polycables_slip_pad_show_table_header', String(showTableHeader));
      localStorage.setItem('polycables_slip_pad_show_bg', String(showBgImage));
      localStorage.setItem('polycables_slip_pad_print_bg', String(printBgImage));
      localStorage.setItem('polycables_slip_pad_bg_opacity', String(bgOpacity));

      // Column widths
      localStorage.setItem('polycables_col_sl', String(colWidthSl));
      localStorage.setItem('polycables_col_qty', String(colWidthQty));
      localStorage.setItem('polycables_col_rate', String(colWidthRate));
      localStorage.setItem('polycables_col_amount', String(colWidthAmount));

      // Shifts
      localStorage.setItem('polycables_shift_date_x', String(dateShiftX));
      localStorage.setItem('polycables_shift_date_y', String(dateShiftY));
      localStorage.setItem('polycables_shift_name_x', String(partyNameShiftX));
      localStorage.setItem('polycables_shift_name_y', String(partyNameShiftY));
      localStorage.setItem('polycables_shift_phone_x', String(phoneShiftX));
      localStorage.setItem('polycables_shift_phone_y', String(phoneShiftY));
      localStorage.setItem('polycables_shift_address_x', String(addressShiftX));
      localStorage.setItem('polycables_shift_address_y', String(addressShiftY));
      localStorage.setItem('polycables_shift_col_sl_x', String(colSlShiftX));
      localStorage.setItem('polycables_shift_col_sl_y', String(colSlShiftY));
      localStorage.setItem('polycables_shift_col_desc_x', String(colDescShiftX));
      localStorage.setItem('polycables_shift_col_desc_y', String(colDescShiftY));
      localStorage.setItem('polycables_shift_col_qty_x', String(colQtyShiftX));
      localStorage.setItem('polycables_shift_col_qty_y', String(colQtyShiftY));
      localStorage.setItem('polycables_shift_col_rate_x', String(colRateShiftX));
      localStorage.setItem('polycables_shift_col_rate_y', String(colRateShiftY));
      localStorage.setItem('polycables_shift_col_amount_x', String(colAmountShiftX));
      localStorage.setItem('polycables_shift_col_amount_y', String(colAmountShiftY));
      localStorage.setItem('polycables_shift_total_box_x', String(totalBoxShiftX));
      localStorage.setItem('polycables_shift_total_box_y', String(totalBoxShiftY));
      localStorage.setItem('polycables_shift_in_words_x', String(inWordsShiftX));
      localStorage.setItem('polycables_shift_in_words_y', String(inWordsShiftY));

      // Section offsets
      localStorage.setItem('polycables_meta_top_offset', String(metaTopOffsetPx));
      localStorage.setItem('polycables_table_top_offset', String(tableTopOffsetPx));
      localStorage.setItem('polycables_footer_top_offset', String(footerTopOffsetPx));

      // Fonts
      localStorage.setItem('polycables_font_party_name', String(partyNameFontSize));
      localStorage.setItem('polycables_font_date', String(dateFontSize));
      localStorage.setItem('polycables_font_phone', String(phoneFontSize));
      localStorage.setItem('polycables_font_address', String(addressFontSize));
      localStorage.setItem('polycables_font_table_header', String(tableHeaderFontSize));
      localStorage.setItem('polycables_font_table_row', String(tableRowFontSize));
      localStorage.setItem('polycables_font_total_row', String(totalRowFontSize));
      localStorage.setItem('polycables_font_in_words', String(inWordsFontSize));

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (e) {
      console.error('Error saving slip pad settings to storage:', e);
    }
  };

  // Helper for step nudging
  const renderNudgeControl = (
    label: string,
    x: number,
    y: number,
    onChange: ((newX: number, newY: number) => void) | undefined,
    storageKeyX: string,
    storageKeyY: string
  ) => {
    return (
      <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800 space-y-1.5 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="font-bold text-[11px] text-amber-300 truncate">{label}</span>
          {(x !== 0 || y !== 0) && (
            <button
              type="button"
              onClick={() => {
                onChange?.(0, 0);
                try {
                  localStorage.setItem(storageKeyX, '0');
                  localStorage.setItem(storageKeyY, '0');
                } catch {}
              }}
              className="text-[9px] text-slate-500 hover:text-rose-400 cursor-pointer"
              title="Reset position"
            >
              Reset
            </button>
          )}
        </div>

        {/* X Axis */}
        <div className="flex items-center space-x-1">
          <span className="text-[10px] font-bold text-slate-400 w-4">X:</span>
          <button
            type="button"
            onClick={() => {
              const nx = x - nudgeStep;
              onChange?.(nx, y);
              try { localStorage.setItem(storageKeyX, String(nx)); } catch {}
            }}
            className="w-5 h-5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 rounded flex items-center justify-center text-xs font-mono cursor-pointer"
          >
            -
          </button>
          <input
            type="number"
            value={x}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10) || 0;
              onChange?.(val, y);
              try { localStorage.setItem(storageKeyX, String(val)); } catch {}
            }}
            className="w-12 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-xs text-white text-center font-mono"
          />
          <button
            type="button"
            onClick={() => {
              const nx = x + nudgeStep;
              onChange?.(nx, y);
              try { localStorage.setItem(storageKeyX, String(nx)); } catch {}
            }}
            className="w-5 h-5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 rounded flex items-center justify-center text-xs font-mono cursor-pointer"
          >
            +
          </button>

          {/* Y Axis */}
          <span className="text-[10px] font-bold text-slate-400 w-4 pl-1">Y:</span>
          <button
            type="button"
            onClick={() => {
              const ny = y - nudgeStep;
              onChange?.(x, ny);
              try { localStorage.setItem(storageKeyY, String(ny)); } catch {}
            }}
            className="w-5 h-5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 rounded flex items-center justify-center text-xs font-mono cursor-pointer"
          >
            -
          </button>
          <input
            type="number"
            value={y}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10) || 0;
              onChange?.(x, val);
              try { localStorage.setItem(storageKeyY, String(val)); } catch {}
            }}
            className="w-12 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-xs text-white text-center font-mono"
          />
          <button
            type="button"
            onClick={() => {
              const ny = y + nudgeStep;
              onChange?.(x, ny);
              try { localStorage.setItem(storageKeyY, String(ny)); } catch {}
            }}
            className="w-5 h-5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 rounded flex items-center justify-center text-xs font-mono cursor-pointer"
          >
            +
          </button>
        </div>
      </div>
    );
  };

  // Helper for font size slider & number
  const renderFontSizeControl = (
    label: string,
    val: number,
    min: number,
    max: number,
    onChange: ((newVal: number) => void) | undefined,
    storageKey: string,
    colorClass: string = 'accent-purple-500 text-purple-300'
  ) => {
    return (
      <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800 space-y-1 shadow-xs">
        <div className="flex justify-between items-center text-[10px] font-bold text-slate-300">
          <span className="truncate">{label}:</span>
          <span className={`font-mono ${colorClass.split(' ')[1]}`}>{val}px</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <button
            type="button"
            onClick={() => {
              const nv = Math.max(min, Number((val - 0.5).toFixed(1)));
              onChange?.(nv);
              try { localStorage.setItem(storageKey, String(nv)); } catch {}
            }}
            className="w-4 h-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex items-center justify-center text-[10px] cursor-pointer"
          >
            -
          </button>
          <input
            type="range"
            min={min}
            max={max}
            step="0.5"
            value={val}
            onChange={(e) => {
              const nv = parseFloat(e.target.value);
              onChange?.(nv);
              try { localStorage.setItem(storageKey, String(nv)); } catch {}
            }}
            className={`flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer ${colorClass.split(' ')[0]}`}
          />
          <button
            type="button"
            onClick={() => {
              const nv = Math.min(max, Number((val + 0.5).toFixed(1)));
              onChange?.(nv);
              try { localStorage.setItem(storageKey, String(nv)); } catch {}
            }}
            className="w-4 h-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex items-center justify-center text-[10px] cursor-pointer"
          >
            +
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-slate-900 border-b border-slate-800 text-slate-100 p-3 sm:p-4 text-xs font-sans shadow-2xl no-print animate-in slide-in-from-top-2 duration-150">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30 shadow-xs">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-extrabold text-white flex items-center space-x-2">
              <span>📜 Slip Pad (5.5" × 8.5") Settings & Calibration Studio</span>
              <span className="bg-amber-500/20 text-amber-300 font-mono text-[10px] px-1.5 py-0.5 rounded border border-amber-500/30">
                5.5" × 8.5"
              </span>
            </h3>
            <p className="text-[10px] text-slate-400">
              Upload scanned pad image, set screen & print visibility, adjust positions (X/Y) and font sizes permanently.
            </p>
          </div>
        </div>

        {/* Tab Switcher & Master Action Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="bg-slate-950 p-0.5 rounded-lg border border-slate-800 flex space-x-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('picture_visibility')}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'picture_visibility'
                  ? 'bg-purple-600 text-white shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Image & Visibility</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('shifts')}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'shifts'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Move className="w-3.5 h-3.5" />
              <span>Positions (X/Y)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('fonts_cols')}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'fonts_cols'
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              <span>Fonts & Columns</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleSaveSettings}
            className={`px-3 py-1 text-xs font-bold rounded-lg flex items-center space-x-1.5 shadow-md transition-all cursor-pointer ${
              savedSuccess
                ? 'bg-emerald-600 text-white animate-pulse'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black hover:scale-[1.02]'
            }`}
            title="Save all settings permanently"
          >
            {savedSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            <span>{savedSuccess ? 'Saved ✓' : 'Save Settings'}</span>
          </button>

          {onOpenAutoConfig && (
            <button
              type="button"
              onClick={onOpenAutoConfig}
              className="px-2.5 py-1 bg-purple-700 hover:bg-purple-600 text-white rounded-lg text-xs font-bold transition-colors flex items-center space-x-1 cursor-pointer border border-purple-500/40"
              title="Auto-fix 5.5x8.5 paper size and zero margin"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-200" />
              <span>Auto-Fix Printer</span>
            </button>
          )}

          {onResetDefaults && (
            <button
              type="button"
              onClick={onResetDefaults}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center space-x-1 border border-slate-700 cursor-pointer"
              title="Reset to default settings"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              title="Close Settings Panel"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: PICTURE UPLOAD & VISIBILITY */}
      {activeTab === 'picture_visibility' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-3">
          {/* Box 1: Picture Upload & Clear */}
          <div className="bg-slate-950 p-2.5 rounded-xl border border-purple-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-purple-300 flex items-center space-x-1">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Scanned Pad:</span>
              </span>
              {customBgUrl && (
                <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.5 rounded border border-emerald-500/30">
                  Attached
                </span>
              )}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{customBgUrl ? 'Change Scanned Pad' : 'Select Scanned Pad'}</span>
              </button>

              {customBgUrl && (
                <button
                  type="button"
                  onClick={onClearCustomBg}
                  className="p-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white rounded-lg text-xs font-bold cursor-pointer transition-colors border border-rose-500/30"
                  title="Remove uploaded image"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <p className="text-[9px] text-slate-400 leading-tight">
              Upload your physical scanned memo pad image to preview and align fields precisely on screen.
            </p>
          </div>

          {/* Box 2: Visibility Toggles (Screen & Print) */}
          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-2">
            <span className="text-[11px] font-bold text-slate-300 flex items-center space-x-1">
              <Eye className="w-3.5 h-3.5 text-cyan-400" />
              <span>Image & Print Visibility:</span>
            </span>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onToggleShowBgImage?.(!showBgImage)}
                className={`px-2 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center space-x-1 cursor-pointer transition-all ${
                  showBgImage
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                title="Toggle pad image visibility on screen"
              >
                {showBgImage ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                <span>{showBgImage ? 'Screen: ON' : 'Screen: OFF'}</span>
              </button>

              <button
                type="button"
                onClick={() => onTogglePrintBgImage?.(!printBgImage)}
                className={`px-2 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center space-x-1 cursor-pointer transition-all ${
                  printBgImage
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                title="Print background pad image to printer"
              >
                <Printer className="w-3 h-3" />
                <span>{printBgImage ? 'Print: ON' : 'Print: OFF'}</span>
              </button>
            </div>

            {/* Opacity Slider */}
            <div className="space-y-0.5 pt-1">
              <div className="flex justify-between text-[10px] font-bold text-slate-400">
                <span>Opacity:</span>
                <span className="font-mono text-purple-300">{Math.round(bgOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="1.0"
                step="0.05"
                value={bgOpacity}
                onChange={(e) => onChangeBgOpacity?.(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>
          </div>

          {/* Box 3: Header Mode Visibility */}
          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
            <span className="text-[11px] font-bold text-slate-300 flex items-center space-x-1">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>Pad Header Mode:</span>
            </span>

            <div className="grid grid-cols-2 gap-1 pt-1">
              <button
                type="button"
                onClick={() => onChangePadHeaderMode?.('hide_logo')}
                className={`px-1.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer text-center ${
                  padHeaderMode === 'hide_logo'
                    ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
                title="Hide top company logo for pre-printed memo slip pad"
              >
                📜 Pad (Hide Logo)
              </button>
              <button
                type="button"
                onClick={() => onChangePadHeaderMode?.('plain')}
                className={`px-1.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer text-center ${
                  padHeaderMode === 'plain'
                    ? 'bg-emerald-500 text-slate-950 font-black shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
                title="Print full header and branding on plain paper"
              >
                📄 Plain Paper
              </button>
            </div>

            <p className="text-[9px] text-slate-400 leading-tight pt-1">
              Select 'Pad (Hide Logo)' when using pre-printed pads.
            </p>
          </div>

          {/* Box 4: Table Bar & Alignment Guides */}
          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex flex-col justify-between space-y-2">
            <span className="text-[11px] font-bold text-slate-300">Guides & Table Header:</span>

            <div className="space-y-1.5">
              <label className="flex items-center space-x-2 cursor-pointer select-none bg-slate-900 p-1.5 rounded-lg border border-slate-800">
                <input
                  type="checkbox"
                  checked={showTableHeader}
                  onChange={(e) => onToggleTableHeader?.(e.target.checked)}
                  className="rounded text-amber-500 focus:ring-0 cursor-pointer"
                />
                <span className="text-[11px] text-slate-200 font-semibold">
                  Table Header Bar (SL, Desc, Qty...)
                </span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer select-none bg-slate-900 p-1.5 rounded-lg border border-slate-800">
                <input
                  type="checkbox"
                  checked={showGuides}
                  onChange={(e) => onToggleGuides?.(e.target.checked)}
                  className="rounded text-amber-500 focus:ring-0 cursor-pointer"
                />
                <span className="text-[11px] text-slate-200 font-semibold">
                  Alignment Grid & Guides
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ELEMENT MOVES & POSITION SHIFTS */}
      {activeTab === 'shifts' && (
        <div className="space-y-3 pt-3">
          {/* Top Row: Overall Margin & Step Size */}
          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              {/* Top Offset */}
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] font-bold text-slate-400">Top Margin (inch):</span>
                <input
                  type="number"
                  step="0.05"
                  value={topOffset}
                  onChange={(e) => onChangeTopOffset?.(parseFloat(e.target.value) || 0)}
                  className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-amber-300 text-center font-mono"
                />
              </div>

              {/* Left Offset */}
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] font-bold text-slate-400">Left Margin (inch):</span>
                <input
                  type="number"
                  step="0.05"
                  value={leftOffset}
                  onChange={(e) => onChangeLeftOffset?.(parseFloat(e.target.value) || 0)}
                  className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-amber-300 text-center font-mono"
                />
              </div>

              {/* Section Top Offsets */}
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] font-bold text-slate-400">Meta Section (px):</span>
                <input
                  type="number"
                  value={metaTopOffsetPx}
                  onChange={(e) => onChangeMetaTopOffsetPx?.(parseInt(e.target.value, 10) || 0)}
                  className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white text-center font-mono"
                />
              </div>

              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] font-bold text-slate-400">Table Section (px):</span>
                <input
                  type="number"
                  value={tableTopOffsetPx}
                  onChange={(e) => onChangeTableTopOffsetPx?.(parseInt(e.target.value, 10) || 0)}
                  className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white text-center font-mono"
                />
              </div>

              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] font-bold text-slate-400">Footer (px):</span>
                <input
                  type="number"
                  value={footerTopOffsetPx}
                  onChange={(e) => onChangeFooterTopOffsetPx?.(parseInt(e.target.value, 10) || 0)}
                  className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white text-center font-mono"
                />
              </div>
            </div>

            {/* Nudge Step Selector */}
            <div className="flex items-center space-x-1 bg-slate-900 p-0.5 rounded-lg border border-slate-700">
              <span className="text-[10px] text-slate-400 font-bold px-1.5">Step:</span>
              {[1, 2, 5].map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setNudgeStep(step)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                    nudgeStep === step
                      ? 'bg-amber-500 text-slate-950 font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  ±{step}px
                </button>
              ))}
            </div>
          </div>

          {/* Grid of All Elements Position Shifts */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
            {/* 1. Date */}
            {renderNudgeControl('Date', dateShiftX, dateShiftY, onChangeDateShift, 'polycables_shift_date_x', 'polycables_shift_date_y')}

            {/* 2. Party Name */}
            {renderNudgeControl('Party Name', partyNameShiftX, partyNameShiftY, onChangePartyNameShift, 'polycables_shift_name_x', 'polycables_shift_name_y')}

            {/* 3. Phone */}
            {renderNudgeControl('Phone No', phoneShiftX, phoneShiftY, onChangePhoneShift, 'polycables_shift_phone_x', 'polycables_shift_phone_y')}

            {/* 4. Address */}
            {renderNudgeControl('Address', addressShiftX, addressShiftY, onChangeAddressShift, 'polycables_shift_address_x', 'polycables_shift_address_y')}

            {/* 5. SL No Column */}
            {renderNudgeControl('Column: SL No', colSlShiftX, colSlShiftY, onChangeColSlShift, 'polycables_shift_col_sl_x', 'polycables_shift_col_sl_y')}

            {/* 6. Product Description Column */}
            {renderNudgeControl('Column: Item Desc', colDescShiftX, colDescShiftY, onChangeColDescShift, 'polycables_shift_col_desc_x', 'polycables_shift_col_desc_y')}

            {/* 7. Quantity Column */}
            {renderNudgeControl('Column: Quantity', colQtyShiftX, colQtyShiftY, onChangeColQtyShift, 'polycables_shift_col_qty_x', 'polycables_shift_col_qty_y')}

            {/* 8. Rate Column */}
            {renderNudgeControl('Column: Rate', colRateShiftX, colRateShiftY, onChangeColRateShift, 'polycables_shift_col_rate_x', 'polycables_shift_col_rate_y')}

            {/* 9. Amount Column */}
            {renderNudgeControl('Column: Amount', colAmountShiftX, colAmountShiftY, onChangeColAmountShift, 'polycables_shift_col_amount_x', 'polycables_shift_col_amount_y')}

            {/* 10. Total / Summary Box */}
            {renderNudgeControl('Total Box', totalBoxShiftX, totalBoxShiftY, onChangeTotalBoxShift, 'polycables_shift_total_box_x', 'polycables_shift_total_box_y')}

            {/* 11. In Words Line */}
            {renderNudgeControl('In Words', inWordsShiftX, inWordsShiftY, onChangeInWordsShift, 'polycables_shift_in_words_x', 'polycables_shift_in_words_y')}
          </div>
        </div>
      )}

      {/* TAB 3: FONTS & COLUMN WIDTHS */}
      {activeTab === 'fonts_cols' && (
        <div className="space-y-3 pt-3">
          {/* Row 1: Global Font Scale & Row Heights & Column Widths */}
          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[11px] font-bold text-cyan-300 block pb-2">Column Widths & Row Height:</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
              {/* Global Font Scale */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold text-slate-400">
                  <span>Font Scale:</span>
                  <span className="font-mono text-amber-300">{fontScale}%</span>
                </div>
                <input
                  type="range"
                  min="70"
                  max="140"
                  value={fontScale}
                  onChange={(e) => onChangeFontScale?.(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>

              {/* Row Height */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold text-slate-400">
                  <span>Row Height:</span>
                  <span className="font-mono text-amber-300">{rowHeight}px</span>
                </div>
                <input
                  type="range"
                  min="14"
                  max="36"
                  value={rowHeight}
                  onChange={(e) => onChangeRowHeight?.(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>

              {/* Col SL */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold text-slate-400">
                  <span>SL No:</span>
                  <span className="font-mono text-cyan-300">{colWidthSl}px</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="80"
                  value={colWidthSl}
                  onChange={(e) => onChangeColWidthSl?.(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>

              {/* Col Qty */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold text-slate-400">
                  <span>Quantity (Qty):</span>
                  <span className="font-mono text-cyan-300">{colWidthQty}px</span>
                </div>
                <input
                  type="range"
                  min="25"
                  max="90"
                  value={colWidthQty}
                  onChange={(e) => onChangeColWidthQty?.(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>

              {/* Col Rate */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold text-slate-400">
                  <span>Unit Rate:</span>
                  <span className="font-mono text-cyan-300">{colWidthRate}px</span>
                </div>
                <input
                  type="range"
                  min="35"
                  max="110"
                  value={colWidthRate}
                  onChange={(e) => onChangeColWidthRate?.(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>

              {/* Col Amount */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold text-slate-400">
                  <span>Amount:</span>
                  <span className="font-mono text-cyan-300">{colWidthAmount}px</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="150"
                  value={colWidthAmount}
                  onChange={(e) => onChangeColWidthAmount?.(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Row 2: Granular Individual Font Sizes for EVERY element */}
          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-2">
            <span className="text-[11px] font-bold text-purple-300 block">Individual Element Font Sizes:</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {/* Party Name */}
              {renderFontSizeControl('Party Name', partyNameFontSize, 8, 24, onChangePartyNameFontSize, 'polycables_font_party_name')}

              {/* Date */}
              {renderFontSizeControl('Date', dateFontSize, 8, 20, onChangeDateFontSize, 'polycables_font_date')}

              {/* Phone */}
              {renderFontSizeControl('Phone No', phoneFontSize, 8, 20, onChangePhoneFontSize, 'polycables_font_phone')}

              {/* Address */}
              {renderFontSizeControl('Address', addressFontSize, 8, 20, onChangeAddressFontSize, 'polycables_font_address')}

              {/* Table Header */}
              {renderFontSizeControl('Table Header', tableHeaderFontSize, 8, 18, onChangeTableHeaderFontSize, 'polycables_font_table_header', 'accent-cyan-500 text-cyan-300')}

              {/* Table Item Rows */}
              {renderFontSizeControl('Item Rows', tableRowFontSize, 8, 20, onChangeTableRowFontSize, 'polycables_font_table_row', 'accent-emerald-500 text-emerald-300')}

              {/* Total & Discount Rows */}
              {renderFontSizeControl('Total Row', totalRowFontSize, 8, 22, onChangeTotalRowFontSize, 'polycables_font_total_row', 'accent-amber-500 text-amber-300')}

              {/* In Words */}
              {renderFontSizeControl('In Words', inWordsFontSize, 8, 20, onChangeInWordsFontSize, 'polycables_font_in_words')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
