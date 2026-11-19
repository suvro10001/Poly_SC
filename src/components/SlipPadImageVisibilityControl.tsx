import React, { useRef } from 'react';
import {
  Image as ImageIcon,
  Upload,
  Eye,
  EyeOff,
  Printer,
  RotateCcw,
  X,
  Sliders,
  ZoomIn,
  Move
} from 'lucide-react';

interface SlipPadImageVisibilityControlProps {
  customBgUrl: string | null;
  onUploadImage: (file: File) => void;
  onSetCustomBgUrl: (url: string | null) => void;
  showBgImage: boolean;
  onToggleShowBgImage: (show: boolean) => void;
  printBgImage: boolean;
  onTogglePrintBgImage: (print: boolean) => void;
  bgOpacity: number;
  onChangeOpacity: (opacity: number) => void;
  bgScale: number;
  onChangeScale: (scale: number) => void;
  bgOffsetX: number;
  onChangeOffsetX: (x: number) => void;
  bgOffsetY: number;
  onChangeOffsetY: (y: number) => void;
  onResetImageAdjustments: () => void;
  onClose: () => void;
}

export const SlipPadImageVisibilityControl: React.FC<SlipPadImageVisibilityControlProps> = ({
  customBgUrl,
  onUploadImage,
  onSetCustomBgUrl,
  showBgImage,
  onToggleShowBgImage,
  printBgImage,
  onTogglePrintBgImage,
  bgOpacity,
  onChangeOpacity,
  bgScale,
  onChangeScale,
  bgOffsetX,
  onChangeOffsetX,
  bgOffsetY,
  onChangeOffsetY,
  onResetImageAdjustments,
  onClose
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadImage(e.target.files[0]);
    }
  };

  return (
    <div className="bg-slate-950 border-2 border-purple-500/50 rounded-xl p-3 shadow-xl space-y-3 font-sans text-slate-100 no-print animate-in fade-in slide-in-from-top-2">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-purple-500/20 text-purple-400 rounded-lg border border-purple-500/30">
            <ImageIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white flex items-center space-x-1.5">
              <span>🖼️ প্যাড ব্যাকগ্রাউন্ড ছবি ও দৃশ্যমানতা নিয়ন্ত্রণ</span>
            </h3>
            <p className="text-[10px] text-slate-400">
              প্রি-প্রিন্টেড প্যাডের স্ক্যান কপি যুক্ত করে স্ক্রিন বা প্রিন্টে এলাইনমেন্ট সমন্বয় করুন
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={onResetImageAdjustments}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg flex items-center space-x-1 border border-slate-700 cursor-pointer"
            title="ছবি সেটিংস রিসেট করুন"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>রিসেট</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-center">
        {/* Upload Custom Image */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            প্যাডের স্ক্যান ছবি:
          </label>
          <div className="flex items-center space-x-1.5">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{customBgUrl ? 'ছবি পরিবর্তন' : 'প্যাড ছবি আপলোড'}</span>
            </button>
            {customBgUrl && (
              <button
                type="button"
                onClick={() => onSetCustomBgUrl(null)}
                className="px-2 py-1.5 bg-rose-600/20 text-rose-400 hover:bg-rose-600 hover:text-white rounded-lg text-xs font-bold cursor-pointer"
                title="কাস্টম ছবি মুছুন"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Screen & Print Visibility Toggles */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            দৃশ্যমানতা মোড:
          </label>
          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              onClick={() => onToggleShowBgImage(!showBgImage)}
              className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center space-x-1 cursor-pointer transition-colors ${
                showBgImage
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {showBgImage ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>{showBgImage ? 'স্ক্রিন: দৃশ্যমান' : 'স্ক্রিন: লুকানো'}</span>
            </button>

            <button
              type="button"
              onClick={() => onTogglePrintBgImage(!printBgImage)}
              className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center space-x-1 cursor-pointer transition-colors ${
                printBgImage
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{printBgImage ? 'প্রিন্টে যাবে' : 'প্রিন্ট হবে না'}</span>
            </button>
          </div>
        </div>

        {/* Opacity Slider */}
        <div className="space-y-1 bg-slate-900 p-2 rounded-lg border border-slate-800">
          <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
            <span>স্বচ্ছতা (Opacity):</span>
            <span className="font-mono text-purple-300">{Math.round(bgOpacity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="1.0"
            step="0.05"
            value={bgOpacity}
            onChange={(e) => onChangeOpacity(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
          />
        </div>

        {/* Scale & Shift Adjustments */}
        <div className="flex items-center space-x-2 bg-slate-900 p-1.5 rounded-lg border border-slate-800">
          <div className="flex-1 text-center">
            <span className="text-[9px] font-bold text-slate-400 block">স্কেল (Scale)</span>
            <div className="flex items-center justify-center space-x-1 mt-0.5">
              <button
                type="button"
                onClick={() => onChangeScale(Math.max(0.7, parseFloat((bgScale - 0.05).toFixed(2))))}
                className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded"
              >
                -
              </button>
              <span className="font-mono text-[10px] text-purple-300 w-8">{Math.round(bgScale * 100)}%</span>
              <button
                type="button"
                onClick={() => onChangeScale(Math.min(1.4, parseFloat((bgScale + 0.05).toFixed(2))))}
                className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex-1 text-center">
            <span className="text-[9px] font-bold text-slate-400 block">পজিশন Y</span>
            <div className="flex items-center justify-center space-x-1 mt-0.5">
              <button
                type="button"
                onClick={() => onChangeOffsetY(bgOffsetY - 2)}
                className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded"
              >
                ▲
              </button>
              <span className="font-mono text-[10px] text-purple-300 w-8">{bgOffsetY}px</span>
              <button
                type="button"
                onClick={() => onChangeOffsetY(bgOffsetY + 2)}
                className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded"
              >
                ▼
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
