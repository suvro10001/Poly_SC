import React, { useState, useEffect, useRef } from 'react';
import { Item } from '../types';
import { X, Check, Layers, RotateCcw } from 'lucide-react';

export interface ColorBreakdownData {
  red?: number;
  blk?: number;
  yel?: number;
  grn?: number;
  blu?: number;
  others?: number;
}

interface ColorQuantityModalProps {
  isOpen: boolean;
  item: Partial<Item> & { name?: string; itemName?: string; itemDescription?: string; code?: string; colorStock?: any };
  unit?: string;
  initialColors?: ColorBreakdownData;
  initialTotalQty?: number;
  stockColors?: Partial<ColorBreakdownData>;
  onConfirm: (totalQty: number, colors: ColorBreakdownData) => void;
  onClose: () => void;
}

export const ColorQuantityModal: React.FC<ColorQuantityModalProps> = ({
  isOpen,
  item,
  unit = 'Coil',
  initialColors,
  initialTotalQty,
  stockColors,
  onConfirm,
  onClose
}) => {
  const [red, setRed] = useState<number>(0);
  const [blk, setBlk] = useState<number>(0);
  const [yel, setYel] = useState<number>(0);
  const [grn, setGrn] = useState<number>(0);
  const [blu, setBlu] = useState<number>(0);
  const [others, setOthers] = useState<number>(0);

  const itemStock = stockColors || (item as any)?.colorStock || (item as any)?.closingStockColors || {};
  const stockRed = Number(itemStock.red) || 0;
  const stockBlk = Number(itemStock.blk || itemStock.black) || 0;
  const stockYel = Number(itemStock.yel || itemStock.yellow) || 0;
  const stockGrn = Number(itemStock.grn || itemStock.green) || 0;
  const stockBlu = Number(itemStock.blu || itemStock.blue) || 0;
  const stockOthers = Number(itemStock.others) || 0;
  const totalStock = stockRed + stockBlk + stockYel + stockGrn + stockBlu + stockOthers;

  const redInputRef = useRef<HTMLInputElement>(null);
  const blkInputRef = useRef<HTMLInputElement>(null);
  const yelInputRef = useRef<HTMLInputElement>(null);
  const grnInputRef = useRef<HTMLInputElement>(null);
  const bluInputRef = useRef<HTMLInputElement>(null);
  const othersInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    if (initialColors && (initialColors.red || initialColors.blk || initialColors.yel || initialColors.grn || initialColors.blu || initialColors.others)) {
      setRed(Number(initialColors.red) || 0);
      setBlk(Number(initialColors.blk) || 0);
      setYel(Number(initialColors.yel) || 0);
      setGrn(Number(initialColors.grn) || 0);
      setBlu(Number(initialColors.blu) || 0);
      setOthers(Number(initialColors.others) || 0);
    } else if (initialTotalQty && initialTotalQty > 0) {
      setRed(initialTotalQty);
      setBlk(0);
      setYel(0);
      setGrn(0);
      setBlu(0);
      setOthers(0);
    } else {
      setRed(0);
      setBlk(0);
      setYel(0);
      setGrn(0);
      setBlu(0);
      setOthers(0);
    }

    setTimeout(() => {
      redInputRef.current?.focus();
      redInputRef.current?.select();
    }, 50);
  }, [initialColors, initialTotalQty, isOpen]);

  if (!isOpen) return null;

  const totalCalculated = Number(red || 0) + Number(blk || 0) + Number(yel || 0) + Number(grn || 0) + Number(blu || 0) + Number(others || 0);

  const applyColors = () => {
    const colors: ColorBreakdownData = {
      red: Number(red) || 0,
      blk: Number(blk) || 0,
      yel: Number(yel) || 0,
      grn: Number(grn) || 0,
      blu: Number(blu) || 0,
      others: Number(others) || 0
    };
    onConfirm(totalCalculated, colors);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyColors();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, nextRef?: React.RefObject<HTMLInputElement | null>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        applyColors();
        return;
      }
      if (nextRef && nextRef.current) {
        nextRef.current.focus();
        nextRef.current.select();
      } else {
        // Last input (others) -> Submit immediately
        applyColors();
      }
    }
  };

  const handleClear = () => {
    setRed(0);
    setBlk(0);
    setYel(0);
    setGrn(0);
    setBlu(0);
    setOthers(0);
    redInputRef.current?.focus();
  };

  const displayName = item?.name || item?.itemName || item?.itemDescription || 'Cable Item';
  const displayCode = item?.code || '';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-neutral-950 text-white rounded-2xl max-w-2xl w-full shadow-2xl border border-neutral-800 overflow-hidden">
        {/* Header (Black Theme - Compact) */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 bg-black/90 border-b border-neutral-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-neutral-900 border border-neutral-700 rounded-lg text-emerald-400 shadow-inner">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-black text-sm tracking-tight text-white">Colour Quantity Distribution</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 font-mono">
                  Showroom Stock: {totalStock} {unit}
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 truncate max-w-[280px] sm:max-w-md mt-0.5">
                <span className="font-semibold text-neutral-200">{displayName}</span>
                {displayCode ? <span className="ml-1.5 text-neutral-400 font-mono">({displayCode})</span> : null}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer border border-transparent hover:border-neutral-700"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Form (Black Theme - Small Box Sizes) */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-3.5 bg-neutral-950">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-neutral-400 uppercase tracking-wider text-[10px]">
              Quantity per Colour (Press Enter to move next):
            </span>
            <button
              type="button"
              onClick={handleClear}
              className="text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/50 px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>

          {/* 6 Colours In One Line (Small compact boxes with Stock badges) */}
          <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
            {/* 1. Red */}
            <div className="bg-neutral-900/90 border border-red-900/40 hover:border-red-500/60 focus-within:border-red-500 rounded-lg p-1.5 sm:p-2 flex flex-col items-center gap-1 transition-all">
              <div className="flex flex-col items-center">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)] inline-block mb-0.5"></span>
                <span className="text-[11px] sm:text-xs font-black text-red-400 tracking-wide leading-tight">Red</span>
                <span className={`text-[9.5px] font-bold font-mono px-1 rounded mt-0.5 ${stockRed > 0 ? 'bg-red-950/90 text-red-300 border border-red-800/60' : 'text-neutral-500'}`}>
                  Stk: {stockRed}
                </span>
              </div>
              <input
                ref={redInputRef}
                type="number"
                min="0"
                value={red || ''}
                onChange={(e) => setRed(parseInt(e.target.value, 10) || 0)}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => handleKeyDown(e, blkInputRef)}
                placeholder="0"
                className="w-full text-center bg-black border border-neutral-800 focus:border-red-500 rounded py-1 px-1 h-8 sm:h-8.5 text-sm sm:text-base font-black font-mono text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-red-500 transition-all"
              />
            </div>

            {/* 2. Black */}
            <div className="bg-neutral-900/90 border border-neutral-700/50 hover:border-neutral-400/80 focus-within:border-neutral-300 rounded-lg p-1.5 sm:p-2 flex flex-col items-center gap-1 transition-all">
              <div className="flex flex-col items-center">
                <span className="w-2.5 h-2.5 rounded-full bg-neutral-950 border border-neutral-300 shadow-[0_0_4px_rgba(255,255,255,0.3)] inline-block mb-0.5"></span>
                <span className="text-[11px] sm:text-xs font-black text-neutral-200 tracking-wide leading-tight">Black</span>
                <span className={`text-[9.5px] font-bold font-mono px-1 rounded mt-0.5 ${stockBlk > 0 ? 'bg-neutral-800 text-neutral-200 border border-neutral-600' : 'text-neutral-500'}`}>
                  Stk: {stockBlk}
                </span>
              </div>
              <input
                ref={blkInputRef}
                type="number"
                min="0"
                value={blk || ''}
                onChange={(e) => setBlk(parseInt(e.target.value, 10) || 0)}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => handleKeyDown(e, yelInputRef)}
                placeholder="0"
                className="w-full text-center bg-black border border-neutral-800 focus:border-neutral-400 rounded py-1 px-1 h-8 sm:h-8.5 text-sm sm:text-base font-black font-mono text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-400 transition-all"
              />
            </div>

            {/* 3. Yellow */}
            <div className="bg-neutral-900/90 border border-amber-900/40 hover:border-amber-500/60 focus-within:border-amber-400 rounded-lg p-1.5 sm:p-2 flex flex-col items-center gap-1 transition-all">
              <div className="flex flex-col items-center">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.7)] inline-block mb-0.5"></span>
                <span className="text-[11px] sm:text-xs font-black text-amber-400 tracking-wide leading-tight">Yellow</span>
                <span className={`text-[9.5px] font-bold font-mono px-1 rounded mt-0.5 ${stockYel > 0 ? 'bg-amber-950/90 text-amber-300 border border-amber-800/60' : 'text-neutral-500'}`}>
                  Stk: {stockYel}
                </span>
              </div>
              <input
                ref={yelInputRef}
                type="number"
                min="0"
                value={yel || ''}
                onChange={(e) => setYel(parseInt(e.target.value, 10) || 0)}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => handleKeyDown(e, grnInputRef)}
                placeholder="0"
                className="w-full text-center bg-black border border-neutral-800 focus:border-amber-400 rounded py-1 px-1 h-8 sm:h-8.5 text-sm sm:text-base font-black font-mono text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-amber-400 transition-all"
              />
            </div>

            {/* 4. Green */}
            <div className="bg-neutral-900/90 border border-emerald-900/40 hover:border-emerald-500/60 focus-within:border-emerald-500 rounded-lg p-1.5 sm:p-2 flex flex-col items-center gap-1 transition-all">
              <div className="flex flex-col items-center">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)] inline-block mb-0.5"></span>
                <span className="text-[11px] sm:text-xs font-black text-emerald-400 tracking-wide leading-tight">Green</span>
                <span className={`text-[9.5px] font-bold font-mono px-1 rounded mt-0.5 ${stockGrn > 0 ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-800/60' : 'text-neutral-500'}`}>
                  Stk: {stockGrn}
                </span>
              </div>
              <input
                ref={grnInputRef}
                type="number"
                min="0"
                value={grn || ''}
                onChange={(e) => setGrn(parseInt(e.target.value, 10) || 0)}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => handleKeyDown(e, bluInputRef)}
                placeholder="0"
                className="w-full text-center bg-black border border-neutral-800 focus:border-emerald-500 rounded py-1 px-1 h-8 sm:h-8.5 text-sm sm:text-base font-black font-mono text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
              />
            </div>

            {/* 5. Blue */}
            <div className="bg-neutral-900/90 border border-blue-900/40 hover:border-blue-500/60 focus-within:border-blue-500 rounded-lg p-1.5 sm:p-2 flex flex-col items-center gap-1 transition-all">
              <div className="flex flex-col items-center">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.7)] inline-block mb-0.5"></span>
                <span className="text-[11px] sm:text-xs font-black text-blue-400 tracking-wide leading-tight">Blue</span>
                <span className={`text-[9.5px] font-bold font-mono px-1 rounded mt-0.5 ${stockBlu > 0 ? 'bg-blue-950/90 text-blue-300 border border-blue-800/60' : 'text-neutral-500'}`}>
                  Stk: {stockBlu}
                </span>
              </div>
              <input
                ref={bluInputRef}
                type="number"
                min="0"
                value={blu || ''}
                onChange={(e) => setBlu(parseInt(e.target.value, 10) || 0)}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => handleKeyDown(e, othersInputRef)}
                placeholder="0"
                className="w-full text-center bg-black border border-neutral-800 focus:border-blue-500 rounded py-1 px-1 h-8 sm:h-8.5 text-sm sm:text-base font-black font-mono text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>

            {/* 6. Others */}
            <div className="bg-neutral-900/90 border border-purple-900/40 hover:border-purple-500/60 focus-within:border-purple-500 rounded-lg p-1.5 sm:p-2 flex flex-col items-center gap-1 transition-all">
              <div className="flex flex-col items-center">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shadow-[0_0_6px_rgba(168,85,247,0.7)] inline-block mb-0.5"></span>
                <span className="text-[11px] sm:text-xs font-black text-purple-300 tracking-wide leading-tight">Others</span>
                <span className={`text-[9.5px] font-bold font-mono px-1 rounded mt-0.5 ${stockOthers > 0 ? 'bg-purple-950/90 text-purple-300 border border-purple-800/60' : 'text-neutral-500'}`}>
                  Stk: {stockOthers}
                </span>
              </div>
              <input
                ref={othersInputRef}
                type="number"
                min="0"
                value={others || ''}
                onChange={(e) => setOthers(parseInt(e.target.value, 10) || 0)}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => handleKeyDown(e)}
                placeholder="0"
                className="w-full text-center bg-black border border-neutral-800 focus:border-purple-400 rounded py-1 px-1 h-8 sm:h-8.5 text-sm sm:text-base font-black font-mono text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-purple-400 transition-all"
              />
            </div>
          </div>

          {/* Total Calculated Quantity Bar (Black Theme - Compact) */}
          <div className="flex items-center justify-between py-2 px-3.5 bg-black border border-neutral-800 rounded-xl shadow-inner">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Total Calculated Quantity:
            </span>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-xl font-black font-mono text-emerald-400">
                {totalCalculated}
              </span>
              <span className="text-xs font-semibold text-neutral-400">
                {unit}
              </span>
            </div>
          </div>

          {/* Action Buttons (Compact) */}
          <div className="flex items-center justify-end space-x-2.5 pt-0.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-semibold text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center space-x-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl shadow-md hover:shadow-emerald-600/30 transition-all cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>Apply Quantity ({totalCalculated})</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


