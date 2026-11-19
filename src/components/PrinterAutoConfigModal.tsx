import React, { useState, useEffect } from 'react';
import { Printer, Check, Sliders, Sparkles, RefreshCw, X, FileText, Layout, HelpCircle, Move } from 'lucide-react';
import { PAPER_PRESETS, triggerAutoConfiguredPrint, PrinterConfigOptions, getSavedPrinterConfig, savePrinterConfig } from '../utils/printerAutoConfig';

interface PrinterAutoConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentType: 'bill' | 'slip_pad' | 'challan' | 'statement' | 'report';
  title?: string;
  defaultOrientation?: 'portrait' | 'landscape';
  billNo?: string;
  currentScale?: number;
}

export const PrinterAutoConfigModal: React.FC<PrinterAutoConfigModalProps> = ({
  isOpen,
  onClose,
  documentType,
  title = 'Printer Auto-Configuration & Paper Alignment',
  defaultOrientation = documentType === 'slip_pad' ? 'portrait' : 'portrait'
}) => {
  const initialConfig = getSavedPrinterConfig(documentType);

  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(initialConfig.orientation || defaultOrientation);
  const [paperPreset, setPaperPreset] = useState<PrinterConfigOptions['paperPreset']>(
    initialConfig.paperPreset || (documentType === 'slip_pad' ? 'pad_5.5x8.5' : (documentType === 'bill' || documentType === 'challan' ? 'bill_7.2x10' : 'a4'))
  );
  const [marginsMm, setMarginsMm] = useState<number>(initialConfig.marginsMm ?? 0);
  const [offsetXmm, setOffsetXmm] = useState<number>(initialConfig.offsetXmm ?? 0);
  const [offsetYmm, setOffsetYmm] = useState<number>(initialConfig.offsetYmm ?? 0);
  const [scalePercent, setScalePercent] = useState<number>(Math.round((initialConfig.scale ?? 1.0) * 100));
  const [exactColors, setExactColors] = useState<boolean>(initialConfig.exactColors ?? true);

  // Sync whenever modal opens
  useEffect(() => {
    if (isOpen) {
      const cfg = getSavedPrinterConfig(documentType);
      setOrientation(cfg.orientation || defaultOrientation);
      setPaperPreset(cfg.paperPreset || (documentType === 'slip_pad' ? 'pad_5.5x8.5' : (documentType === 'bill' || documentType === 'challan' ? 'bill_7.2x10' : 'a4')));
      setMarginsMm(cfg.marginsMm ?? 0);
      setOffsetXmm(cfg.offsetXmm ?? 0);
      setOffsetYmm(cfg.offsetYmm ?? 0);
      setScalePercent(Math.round((cfg.scale ?? 1.0) * 100));
      setExactColors(cfg.exactColors ?? true);
    }
  }, [isOpen, documentType, defaultOrientation]);

  if (!isOpen) return null;

  const currentConfig: PrinterConfigOptions = {
    orientation,
    paperPreset,
    marginsMm,
    offsetXmm,
    offsetYmm,
    scale: scalePercent / 100,
    exactColors
  };

  const handleSaveAndPrint = () => {
    savePrinterConfig(documentType, currentConfig);
    triggerAutoConfiguredPrint(documentType, currentConfig);
    onClose();
  };

  const handleSaveOnly = () => {
    savePrinterConfig(documentType, currentConfig);
    onClose();
  };

  const handleResetDefaults = () => {
    if (documentType === 'slip_pad') {
      setOrientation('portrait');
      setPaperPreset('pad_5.5x8.5');
      setMarginsMm(0);
      setOffsetXmm(0);
      setOffsetYmm(0);
      setScalePercent(100);
    } else if (documentType === 'bill' || documentType === 'challan') {
      setOrientation('portrait');
      setPaperPreset('bill_7.2x10');
      setMarginsMm(0);
      setOffsetXmm(0);
      setOffsetYmm(0);
      setScalePercent(100);
    } else {
      setOrientation('portrait');
      setPaperPreset('a4');
      setMarginsMm(0);
      setOffsetXmm(0);
      setOffsetYmm(0);
      setScalePercent(100);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 text-slate-100 rounded-2xl shadow-2xl max-w-lg w-full flex flex-col overflow-hidden my-auto max-h-[95vh]">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-800/95 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">{title}</h3>
              <p className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Auto Config: Margin 0mm & Exact Paper Size</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-4 sm:p-5 space-y-4 text-xs overflow-y-auto flex-1">
          {/* Status Diagnostic Card */}
          <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-xl p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-emerald-300 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                Physical Paper & Alignment Calibration
              </span>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[9px] font-bold uppercase">
                Active
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Forces exact physical dimensions (<code className="text-amber-300 font-mono font-bold">@page size</code>) and removes browser margin shift (<code className="text-amber-300 font-mono font-bold">0mm</code>) so text prints cleanly on pre-printed pads.
            </p>
          </div>

          {/* Paper Size Presets */}
          <div className="space-y-1.5">
            <label className="block font-bold text-slate-300">
              📄 Paper Size Preset
            </label>
            <div className="grid grid-cols-1 gap-1.5">
              {(Object.keys(PAPER_PRESETS) as Array<keyof typeof PAPER_PRESETS>).map((key) => {
                const preset = PAPER_PRESETS[key];
                const isSelected = paperPreset === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setPaperPreset(key);
                      setOrientation(preset.orientation as 'portrait' | 'landscape');
                    }}
                    className={`text-left p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500/60 text-white font-bold'
                        : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-xs truncate">{preset.name}</span>
                        {isSelected && (
                          <span className="bg-amber-500 text-slate-950 text-[9px] px-1.5 py-0.2 rounded font-black uppercase flex-shrink-0">
                            Selected
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">{preset.description}</p>
                    </div>
                    <span className="font-mono text-[10px] text-amber-300 bg-slate-950 px-2 py-1 rounded border border-slate-800 shrink-0">
                      {preset.width} × {preset.height}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Margins & Shift Offset Calibration */}
          <div className="bg-slate-800/60 border border-slate-700/70 rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-200 flex items-center gap-1.5">
                <Move className="w-3.5 h-3.5 text-amber-400" />
                <span>Printer Margin & Alignment Calibration</span>
              </label>
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => {
                    setMarginsMm(0);
                    setOffsetXmm(0);
                    setOffsetYmm(0);
                  }}
                  className="text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-200 px-2 py-0.5 rounded cursor-pointer font-medium"
                >
                  Remove Margin (0mm)
                </button>
              </div>
            </div>

            {/* Margin Presets & Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              {/* Browser Page Margin */}
              <div className="space-y-1 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-400">Page Margin:</span>
                  <span className="font-mono font-bold text-amber-300">{marginsMm} mm</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="15"
                  step="1"
                  value={marginsMm}
                  onChange={(e) => setMarginsMm(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-400"
                />
              </div>

              {/* Left/Right Offset Shift */}
              <div className="space-y-1 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-400">Left Shift (X):</span>
                  <span className="font-mono font-bold text-cyan-300">{offsetXmm > 0 ? `+${offsetXmm}` : offsetXmm} mm</span>
                </div>
                <input
                  type="range"
                  min="-20"
                  max="20"
                  step="1"
                  value={offsetXmm}
                  onChange={(e) => setOffsetXmm(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>

              {/* Top/Bottom Offset Shift */}
              <div className="space-y-1 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-400">Top Shift (Y):</span>
                  <span className="font-mono font-bold text-purple-300">{offsetYmm > 0 ? `+${offsetYmm}` : offsetYmm} mm</span>
                </div>
                <input
                  type="range"
                  min="-20"
                  max="20"
                  step="1"
                  value={offsetYmm}
                  onChange={(e) => setOffsetYmm(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-400"
                />
              </div>
            </div>
          </div>

          {/* Orientation & Scaling */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-300">🧭 Orientation</label>
              <div className="flex bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                <button
                  type="button"
                  onClick={() => setOrientation('portrait')}
                  className={`flex-1 py-1.5 rounded-md font-bold text-xs transition-colors cursor-pointer ${
                    orientation === 'portrait' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Portrait
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation('landscape')}
                  className={`flex-1 py-1.5 rounded-md font-bold text-xs transition-colors cursor-pointer ${
                    orientation === 'landscape' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Landscape
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block font-bold text-slate-300">📐 Print Scaling</label>
              <div className="flex items-center space-x-1">
                {[90, 95, 100, 105].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setScalePercent(pct)}
                    className={`flex-1 py-1.5 rounded-md font-bold text-[11px] transition-colors cursor-pointer ${
                      scalePercent === pct ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Printer Tips */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400 space-y-1">
            <div className="font-bold text-slate-200 flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
              Browser Print Dialog Checklist:
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-slate-300 text-[10.5px]">
              <li>Paper Size: <strong>{documentType === 'slip_pad' ? '5.5" x 8.5" / Statement / Half-Letter' : '7.2" x 10" / A4 / Letter'}</strong></li>
              <li>Margins: <strong>None (0)</strong> (auto-configured by app)</li>
              <li>Scale: <strong>Default (100%)</strong> or <strong>Custom 100%</strong></li>
              <li>Headers and Footers: <strong>Uncheck</strong> (removes browser URL, timestamp, app name, and 1/1 page numbers)</li>
            </ul>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 bg-slate-800/95 border-t border-slate-700 flex items-center justify-between gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="text-slate-400 hover:text-white font-bold text-xs flex items-center space-x-1 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleSaveOnly}
              className="px-3 py-1.5 text-xs font-bold text-slate-200 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors cursor-pointer border border-slate-600"
            >
              Save Config
            </button>

            <button
              type="button"
              onClick={handleSaveAndPrint}
              className="px-4 py-1.5 text-xs font-black text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-all cursor-pointer shadow-md flex items-center space-x-1.5 hover:scale-105"
            >
              <Printer className="w-4 h-4 text-slate-950" />
              <span>Apply & Print Now</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

