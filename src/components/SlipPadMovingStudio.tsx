import React, { useState, useRef } from 'react';
import { SlipPadLayoutConfig, saveSlipPadLayout, ElementPosition } from '../utils/slipPadLayout';
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  X,
  Move,
  Type,
  Maximize2,
  Save,
  Check,
  Upload,
  Image as ImageIcon,
  Trash2,
  Eye,
  EyeOff
} from 'lucide-react';

export type MovingTarget =
  | 'bulk_header'
  | 'partyName'
  | 'address'
  | 'phone'
  | 'date'
  | 'bulk_table'
  | 'table_grid'
  | 'col_sl'
  | 'col_desc'
  | 'col_qty'
  | 'col_rate'
  | 'col_amt'
  | 'bulk_totals'
  | 'bulk_inwords'
  | 'inWordsLine1'
  | 'inWordsLine2'
  | null;

interface SlipPadMovingStudioProps {
  layout: SlipPadLayoutConfig;
  onChangeLayout: (layout: SlipPadLayoutConfig) => void;
  onResetLayout: () => void;
  selectedTarget: MovingTarget;
  onSelectTarget: (target: MovingTarget) => void;
  onClose: () => void;

  // Background Scanned Image controls
  showBgImage?: boolean;
  onToggleShowBgImage?: (show: boolean) => void;
  bgOpacity?: number;
  onChangeBgOpacity?: (opacity: number) => void;
  customBgUrl?: string | null;
  onUploadCustomBg?: (file: File) => void;
  onClearCustomBg?: () => void;
}

const TARGET_OPTIONS: { id: MovingTarget; label: string; group: string }[] = [
  // 1. Header Group
  { id: 'bulk_header', label: 'All Header Info (Bulk: Name, Addr, Phone, Date)', group: 'Header' },
  { id: 'partyName', label: 'Party Name (Separately)', group: 'Header' },
  { id: 'address', label: 'Address (Separately)', group: 'Header' },
  { id: 'phone', label: 'Phone No (Separately)', group: 'Header' },
  { id: 'date', label: 'Date (Separately)', group: 'Header' },

  // 2. Table Group
  { id: 'bulk_table', label: 'All Table Columns & Grid (Bulk: SL, Item, Qty, Rate, Amount)', group: 'Table' },
  { id: 'table_grid', label: 'Table Grid Alignment (Move Grid)', group: 'Table' },
  { id: 'col_sl', label: 'Column: SL No', group: 'Table' },
  { id: 'col_desc', label: 'Column: Item Description', group: 'Table' },
  { id: 'col_qty', label: 'Column: Quantity', group: 'Table' },
  { id: 'col_rate', label: 'Column: Unit Price / Rate', group: 'Table' },
  { id: 'col_amt', label: 'Column: Amount', group: 'Table' },

  // 3. Totals Group
  { id: 'bulk_totals', label: 'Subtotal to Total (Bulk: Subtotal, Discount, Grand Total)', group: 'Totals' },

  // 4. In Words Group
  { id: 'bulk_inwords', label: 'In Words (Bulk: Line 1 & Line 2)', group: 'In Words' },
  { id: 'inWordsLine1', label: 'In Words: Line 1', group: 'In Words' },
  { id: 'inWordsLine2', label: 'In Words: Line 2', group: 'In Words' }
];

export const SlipPadMovingStudio: React.FC<SlipPadMovingStudioProps> = ({
  layout,
  onChangeLayout,
  onResetLayout,
  selectedTarget,
  onSelectTarget,
  onClose,
  showBgImage = true,
  onToggleShowBgImage,
  bgOpacity = 0.5,
  onChangeBgOpacity,
  customBgUrl = null,
  onUploadCustomBg,
  onClearCustomBg
}) => {
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [nudgeStep, setNudgeStep] = useState<number>(0.02); // in inches
  const stepFont = 0.5; // font px step
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live arrow key listener for instant movement
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select') return;
      if (!selectedTarget) return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleNudge(0, -1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleNudge(0, 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleNudge(-1, 0);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNudge(1, 0);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleAdjustFontSize(1);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        handleAdjustFontSize(-1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTarget, layout, nudgeStep]);

  const handleSavePermanently = () => {
    saveSlipPadLayout(layout);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleNudge = (dx: number, dy: number) => {
    if (!selectedTarget) return;
    const next = JSON.parse(JSON.stringify(layout)) as SlipPadLayoutConfig;
    const step = nudgeStep;

    if (selectedTarget === 'bulk_header') {
      // Move all header elements together
      const headerKeys: (keyof Pick<SlipPadLayoutConfig, 'date' | 'partyName' | 'phone' | 'address'>)[] = [
        'partyName',
        'address',
        'phone',
        'date'
      ];
      for (const k of headerKeys) {
        next[k].left = Number((next[k].left + dx * step).toFixed(3));
        next[k].top = Number((next[k].top + dy * step).toFixed(3));
      }
    } else if (
      selectedTarget === 'date' ||
      selectedTarget === 'partyName' ||
      selectedTarget === 'phone' ||
      selectedTarget === 'address'
    ) {
      next[selectedTarget].left = Number((next[selectedTarget].left + dx * step).toFixed(3));
      next[selectedTarget].top = Number((next[selectedTarget].top + dy * step).toFixed(3));
    } else if (selectedTarget === 'bulk_table' || selectedTarget === 'table_grid') {
      // Shift whole table grid vertically and all columns horizontally
      next.table.startY = Number((next.table.startY + dy * step).toFixed(3));
      if (dx !== 0) {
        next.table.startX = Number(((next.table.startX || 0) + dx * step).toFixed(3));
        next.columns.sl.left = Number((next.columns.sl.left + dx * step).toFixed(3));
        next.columns.description.left = Number((next.columns.description.left + dx * step).toFixed(3));
        next.columns.qty.left = Number((next.columns.qty.left + dx * step).toFixed(3));
        next.columns.rate.left = Number((next.columns.rate.left + dx * step).toFixed(3));
        next.columns.amount.left = Number((next.columns.amount.left + dx * step).toFixed(3));
      }
    } else if (selectedTarget === 'col_sl') {
      next.columns.sl.left = Number((next.columns.sl.left + dx * step).toFixed(3));
      if (dy !== 0) next.table.startY = Number((next.table.startY + dy * step).toFixed(3));
    } else if (selectedTarget === 'col_desc') {
      next.columns.description.left = Number((next.columns.description.left + dx * step).toFixed(3));
      if (dy !== 0) next.table.startY = Number((next.table.startY + dy * step).toFixed(3));
    } else if (selectedTarget === 'col_qty') {
      next.columns.qty.left = Number((next.columns.qty.left + dx * step).toFixed(3));
      if (dy !== 0) next.table.startY = Number((next.table.startY + dy * step).toFixed(3));
    } else if (selectedTarget === 'col_rate') {
      next.columns.rate.left = Number((next.columns.rate.left + dx * step).toFixed(3));
      if (dy !== 0) next.table.startY = Number((next.table.startY + dy * step).toFixed(3));
    } else if (selectedTarget === 'col_amt') {
      next.columns.amount.left = Number((next.columns.amount.left + dx * step).toFixed(3));
      if (dy !== 0) next.table.startY = Number((next.table.startY + dy * step).toFixed(3));
    } else if (selectedTarget === 'bulk_totals') {
      if (!next.totals) next.totals = { left: 3.37, top: 5.75, width: 1.95, fontSize: 12 };
      next.totals.left = Number((next.totals.left + dx * step).toFixed(3));
      next.totals.top = Number((next.totals.top + dy * step).toFixed(3));
    } else if (selectedTarget === 'bulk_inwords') {
      next.inWordsLine1.left = Number((next.inWordsLine1.left + dx * step).toFixed(3));
      next.inWordsLine1.top = Number((next.inWordsLine1.top + dy * step).toFixed(3));
      next.inWordsLine2.left = Number((next.inWordsLine2.left + dx * step).toFixed(3));
      next.inWordsLine2.top = Number((next.inWordsLine2.top + dy * step).toFixed(3));
    } else if (selectedTarget === 'inWordsLine1' || selectedTarget === 'inWordsLine2') {
      next[selectedTarget].left = Number((next[selectedTarget].left + dx * step).toFixed(3));
      next[selectedTarget].top = Number((next[selectedTarget].top + dy * step).toFixed(3));
    }

    onChangeLayout(next);
    saveSlipPadLayout(next);
  };

  const handleAdjustFontSize = (delta: number) => {
    if (!selectedTarget) return;
    const next = JSON.parse(JSON.stringify(layout)) as SlipPadLayoutConfig;

    if (selectedTarget === 'bulk_header') {
      const headerKeys: (keyof Pick<SlipPadLayoutConfig, 'date' | 'partyName' | 'phone' | 'address'>)[] = [
        'partyName',
        'address',
        'phone',
        'date'
      ];
      for (const k of headerKeys) {
        next[k].fontSize = Math.max(8, Math.min(26, Number((next[k].fontSize + delta * stepFont).toFixed(1))));
      }
    } else if (
      selectedTarget === 'date' ||
      selectedTarget === 'partyName' ||
      selectedTarget === 'phone' ||
      selectedTarget === 'address'
    ) {
      next[selectedTarget].fontSize = Math.max(8, Math.min(26, Number((next[selectedTarget].fontSize + delta * stepFont).toFixed(1))));
    } else if (selectedTarget === 'bulk_table' || selectedTarget.startsWith('col_')) {
      next.table.fontSize = Math.max(8, Math.min(22, Number((next.table.fontSize + delta * stepFont).toFixed(1))));
    } else if (selectedTarget === 'bulk_totals') {
      if (!next.totals) next.totals = { left: 3.37, top: 5.75, width: 1.95, fontSize: 12 };
      next.totals.fontSize = Math.max(8, Math.min(22, Number((next.totals.fontSize + delta * stepFont).toFixed(1))));
    } else if (selectedTarget === 'bulk_inwords') {
      next.inWordsLine1.fontSize = Math.max(8, Math.min(22, Number((next.inWordsLine1.fontSize + delta * stepFont).toFixed(1))));
      next.inWordsLine2.fontSize = Math.max(8, Math.min(22, Number((next.inWordsLine2.fontSize + delta * stepFont).toFixed(1))));
    } else if (selectedTarget === 'inWordsLine1' || selectedTarget === 'inWordsLine2') {
      next[selectedTarget].fontSize = Math.max(8, Math.min(22, Number((next[selectedTarget].fontSize + delta * stepFont).toFixed(1))));
    }

    onChangeLayout(next);
    saveSlipPadLayout(next);
  };

  const handleAdjustWidth = (delta: number) => {
    if (!selectedTarget) return;
    const next = JSON.parse(JSON.stringify(layout)) as SlipPadLayoutConfig;
    const step = nudgeStep;

    if (
      selectedTarget === 'date' ||
      selectedTarget === 'partyName' ||
      selectedTarget === 'phone' ||
      selectedTarget === 'address'
    ) {
      next[selectedTarget].width = Math.max(0.4, Number((next[selectedTarget].width + delta * step).toFixed(3)));
    } else if (selectedTarget === 'bulk_header') {
      const headerKeys: (keyof Pick<SlipPadLayoutConfig, 'date' | 'partyName' | 'phone' | 'address'>)[] = [
        'partyName',
        'address',
        'phone',
        'date'
      ];
      for (const k of headerKeys) {
        next[k].width = Math.max(0.4, Number((next[k].width + delta * step).toFixed(3)));
      }
    } else if (selectedTarget === 'col_sl') {
      next.columns.sl.width = Math.max(0.2, Number((next.columns.sl.width + delta * step).toFixed(3)));
    } else if (selectedTarget === 'col_desc') {
      next.columns.description.width = Math.max(0.5, Number((next.columns.description.width + delta * step).toFixed(3)));
    } else if (selectedTarget === 'col_qty') {
      next.columns.qty.width = Math.max(0.2, Number((next.columns.qty.width + delta * step).toFixed(3)));
    } else if (selectedTarget === 'col_rate') {
      next.columns.rate.width = Math.max(0.2, Number((next.columns.rate.width + delta * step).toFixed(3)));
    } else if (selectedTarget === 'col_amt') {
      next.columns.amount.width = Math.max(0.3, Number((next.columns.amount.width + delta * step).toFixed(3)));
    } else if (selectedTarget === 'bulk_totals') {
      if (!next.totals) next.totals = { left: 3.37, top: 5.75, width: 1.95, fontSize: 12 };
      next.totals.width = Math.max(0.8, Number((next.totals.width + delta * step).toFixed(3)));
    } else if (selectedTarget === 'bulk_inwords') {
      next.inWordsLine1.width = Math.max(0.8, Number((next.inWordsLine1.width + delta * step).toFixed(3)));
      next.inWordsLine2.width = Math.max(0.8, Number((next.inWordsLine2.width + delta * step).toFixed(3)));
    } else if (selectedTarget === 'inWordsLine1' || selectedTarget === 'inWordsLine2') {
      next[selectedTarget].width = Math.max(0.8, Number((next[selectedTarget].width + delta * step).toFixed(3)));
    }

    onChangeLayout(next);
    saveSlipPadLayout(next);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (onUploadCustomBg) {
      onUploadCustomBg(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        try {
          localStorage.setItem('polycables_slip_pad_custom_bg', base64);
          localStorage.setItem('polycables_slip_pad_show_bg', 'true');
          window.location.reload();
        } catch (err) {
          console.error(err);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const currentLabel = TARGET_OPTIONS.find((t) => t.id === selectedTarget)?.label || 'Select element or click preview below';

  return (
    <div className="bg-slate-950 border-2 border-cyan-500/60 rounded-xl p-3 shadow-2xl space-y-3 font-sans text-slate-100 no-print">
      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-cyan-500/20 text-cyan-400 rounded-lg border border-cyan-500/30">
            <Move className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white flex items-center space-x-1.5">
              <span>Slip Pad Calibration & Layout Studio</span>
              <span className="bg-cyan-500/20 text-cyan-300 text-[10px] px-1.5 py-0.5 rounded font-mono font-normal">
                5.5" × 8.5"
              </span>
            </h3>
            <p className="text-[10px] text-slate-400">
              Bulk or separate element adjustments: Font Size (Small/Big), Position (Up/Down/Left/Right), Width & Scanned Pad Overlay.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleSavePermanently}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center space-x-1.5 shadow-md transition-all cursor-pointer ${
              saveSuccess
                ? 'bg-emerald-600 text-white'
                : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black'
            }`}
            title="Save all layout positions permanently"
          >
            {saveSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            <span>{saveSuccess ? 'Saved ✓' : 'Save Layout'}</span>
          </button>

          <button
            type="button"
            onClick={onResetLayout}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg flex items-center space-x-1 border border-slate-700 cursor-pointer"
            title="Reset positions to default"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
            title="Close calibration studio"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Controls Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 items-center">
        {/* 1. Target Selector (Bulk vs Separate Elements) */}
        <div className="lg:col-span-2 space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Target Element:
          </label>
          <select
            value={selectedTarget || ''}
            onChange={(e) => onSelectTarget((e.target.value as MovingTarget) || null)}
            className="w-full bg-slate-900 border border-slate-700 text-xs font-semibold text-cyan-300 rounded-lg p-2 focus:outline-none focus:border-cyan-400 cursor-pointer"
          >
            <option value="">-- Choose Element / Section --</option>
            <optgroup label="1. Header (Bulk & Separate)">
              <option value="bulk_header">✦ All Header Info (Bulk: Name, Addr, Phone, Date)</option>
              <option value="partyName">Party Name (Separately)</option>
              <option value="address">Address (Separately)</option>
              <option value="phone">Phone No (Separately)</option>
              <option value="date">Date (Separately)</option>
            </optgroup>
            <optgroup label="2. Table (Bulk & Columns)">
              <option value="bulk_table">✦ All Table Columns & Grid (Bulk)</option>
              <option value="col_sl">Column: SL No</option>
              <option value="col_desc">Column: Items Name / Description</option>
              <option value="col_qty">Column: Quantity</option>
              <option value="col_rate">Column: Unit Price / Rate</option>
              <option value="col_amt">Column: Amount</option>
            </optgroup>
            <optgroup label="3. Totals (Bulk)">
              <option value="bulk_totals">✦ Subtotal to Total (Bulk: Subtotal, Discount, Grand Total)</option>
            </optgroup>
            <optgroup label="4. In Words (Bulk & Lines)">
              <option value="bulk_inwords">✦ In Words (Bulk: Line 1 & Line 2)</option>
              <option value="inWordsLine1">In Words: Line 1 (Separately)</option>
              <option value="inWordsLine2">In Words: Line 2 (Separately)</option>
            </optgroup>
          </select>
        </div>

        {/* 2. Step Precision */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Step Size:
          </label>
          <div className="grid grid-cols-4 gap-1">
            {[0.01, 0.02, 0.05, 0.1].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setNudgeStep(st)}
                className={`py-1.5 rounded text-[10px] font-mono font-bold border transition-colors cursor-pointer text-center ${
                  nudgeStep === st
                    ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                {st}"
              </button>
            ))}
          </div>
        </div>

        {/* 3. Position Nudge Pad (Up, Down, Left, Right) */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block text-center">
            Position (Move):
          </label>
          <div className="flex items-center justify-center space-x-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
            <button
              type="button"
              disabled={!selectedTarget}
              onClick={() => handleNudge(-1, 0)}
              className="p-1.5 bg-slate-800 hover:bg-cyan-600 disabled:opacity-30 disabled:hover:bg-slate-800 text-white rounded cursor-pointer transition-colors"
              title="Move Left"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <div className="flex flex-col space-y-1">
              <button
                type="button"
                disabled={!selectedTarget}
                onClick={() => handleNudge(0, -1)}
                className="p-1 bg-slate-800 hover:bg-cyan-600 disabled:opacity-30 disabled:hover:bg-slate-800 text-white rounded cursor-pointer transition-colors"
                title="Move Up"
              >
                <ArrowUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                disabled={!selectedTarget}
                onClick={() => handleNudge(0, 1)}
                className="p-1 bg-slate-800 hover:bg-cyan-600 disabled:opacity-30 disabled:hover:bg-slate-800 text-white rounded cursor-pointer transition-colors"
                title="Move Down"
              >
                <ArrowDown className="w-3 h-3" />
              </button>
            </div>
            <button
              type="button"
              disabled={!selectedTarget}
              onClick={() => handleNudge(1, 0)}
              className="p-1.5 bg-slate-800 hover:bg-cyan-600 disabled:opacity-30 disabled:hover:bg-slate-800 text-white rounded cursor-pointer transition-colors"
              title="Move Right"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 4. Font Size (Small / Big) & Width */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block text-center">
            Size & Width:
          </label>
          <div className="flex items-center space-x-1.5">
            {/* Font Small/Big */}
            <div className="flex-1 bg-slate-900 p-1 rounded-lg border border-slate-800 flex items-center justify-between">
              <button
                type="button"
                disabled={!selectedTarget}
                onClick={() => handleAdjustFontSize(-1)}
                className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white text-xs font-bold rounded cursor-pointer"
                title="Small (Decrease Font Size)"
              >
                -
              </button>
              <span className="text-[9px] font-bold text-slate-300">Font</span>
              <button
                type="button"
                disabled={!selectedTarget}
                onClick={() => handleAdjustFontSize(1)}
                className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white text-xs font-bold rounded cursor-pointer"
                title="Big (Increase Font Size)"
              >
                +
              </button>
            </div>

            {/* Width */}
            <div className="flex-1 bg-slate-900 p-1 rounded-lg border border-slate-800 flex items-center justify-between">
              <button
                type="button"
                disabled={!selectedTarget}
                onClick={() => handleAdjustWidth(-1)}
                className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white text-xs font-bold rounded cursor-pointer"
                title="Narrow Width"
              >
                -
              </button>
              <span className="text-[9px] font-bold text-slate-300">Width</span>
              <button
                type="button"
                disabled={!selectedTarget}
                onClick={() => handleAdjustWidth(1)}
                className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white text-xs font-bold rounded cursor-pointer"
                title="Widen Width"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* 5. Active Target Status */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Selected Target:
          </label>
          <div className="bg-cyan-950/60 p-2 rounded-lg border border-cyan-800/50 text-[11px] text-cyan-300 font-bold truncate">
            {currentLabel}
          </div>
        </div>
      </div>

      {/* Scanned Pad Image Upload & Live Overlay Bar */}
      <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center space-x-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold flex items-center space-x-1.5 cursor-pointer shadow-xs transition-colors"
            title="Upload scanned image copy of physical pad"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{customBgUrl ? 'Change Scanned Pad Image' : 'Upload Scanned Pad Image'}</span>
          </button>

          {customBgUrl && (
            <>
              {onToggleShowBgImage && (
                <button
                  type="button"
                  onClick={() => onToggleShowBgImage(!showBgImage)}
                  className={`px-2 py-1.5 rounded-lg font-semibold flex items-center space-x-1 cursor-pointer border ${
                    showBgImage
                      ? 'bg-slate-800 text-emerald-400 border-slate-700'
                      : 'bg-slate-900 text-slate-400 border-slate-800'
                  }`}
                  title="Toggle background pad visibility"
                >
                  {showBgImage ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>{showBgImage ? 'Pad Visible' : 'Pad Hidden'}</span>
                </button>
              )}

              {onChangeBgOpacity && (
                <div className="flex items-center space-x-1.5 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-bold">Opacity:</span>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={bgOpacity}
                    onChange={(e) => onChangeBgOpacity(parseFloat(e.target.value))}
                    className="w-20 accent-cyan-500 cursor-pointer h-1"
                  />
                  <span className="font-mono text-[10px] text-cyan-300 font-bold">
                    {Math.round(bgOpacity * 100)}%
                  </span>
                </div>
              )}

              {onClearCustomBg && (
                <button
                  type="button"
                  onClick={onClearCustomBg}
                  className="p-1.5 text-rose-400 hover:text-white hover:bg-rose-900/50 rounded-lg border border-rose-900/30 cursor-pointer"
                  title="Remove scanned pad image"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
        </div>

        <div className="text-[10px] text-slate-400 italic">
          Tip: Upload your actual scanned pad image to align all words and table fields on screen.
        </div>
      </div>
    </div>
  );
};
