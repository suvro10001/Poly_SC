import React from 'react';
import { PolyCablesEmblem, PolyCablesLogo } from './PolyCablesLogo';

interface SlipePadArtworkProps {
  opacity?: number; // 0 to 1, default 1.0 (100%)
  className?: string;
  customImageUrl?: string | null;
  printWithArtwork?: boolean;
  orientation?: 'portrait' | 'landscape';
}

export const SlipePadArtwork: React.FC<SlipePadArtworkProps> = ({
  opacity = 1.0,
  className = '',
  customImageUrl = null,
  printWithArtwork = false,
}) => {
  return (
    <div
      className={`absolute inset-0 pointer-events-none select-none overflow-hidden ${
        printWithArtwork ? '' : 'print:hidden'
      } ${className}`}
      style={{ opacity }}
      aria-hidden="true"
    >
      {customImageUrl ? (
        <img
          src={customImageUrl}
          alt="Pre-printed Slip Pad Background"
          referrerPolicy="no-referrer"
          className="w-full h-full object-fill pointer-events-none select-none"
        />
      ) : (
        <div className="w-full h-full bg-white relative flex flex-col justify-between font-sans overflow-hidden">
          {/* Top Navy Banner matching Pad.jpeg */}
          <div className="relative w-full h-[1.10in] bg-[#142058] overflow-hidden flex items-center justify-between px-4">
            {/* 4-Circle Logo on the left */}
            <div className="relative z-10 flex items-center space-x-2">
              <div className="relative w-12 h-12 flex-shrink-0 bg-white/95 rounded-xl p-1 shadow-md">
                <PolyCablesEmblem size="lg" />
              </div>
            </div>

            {/* Brand Name & Slogan on Right */}
            <div className="relative z-10 text-right text-white pr-2">
              <PolyCablesLogo size="lg" variant="dark" showSubtitle={false} />
              <p className="text-xs font-semibold tracking-wider text-white/95 mt-1 font-bengali">
                প্রতি সংযোগে নিরাপত্তা
              </p>
            </div>

            {/* Golden curved swoosh cut extending from left under logo to the bottom banner edge */}
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

          {/* Top Metadata Field Lines & Bengali Labels matching Pad.jpeg */}
          <div className="relative w-full px-4 pt-2.5 text-slate-900 text-xs font-medium">
            {/* Top Row: তারিখঃ (Right) */}
            <div className="flex justify-end items-center h-6">
              <div className="flex items-center space-x-1">
                <span className="font-bold text-slate-900 text-xs whitespace-nowrap">তারিখঃ</span>
                <span className="inline-block w-28 border-b border-dotted border-slate-600"></span>
              </div>
            </div>

            {/* Middle Row: নামঃ (Left) & ফোনঃ (Right) */}
            <div className="flex justify-between items-center h-6 mt-0.5">
              <div className="flex items-center space-x-1 flex-1 mr-3">
                <span className="font-bold text-slate-900 text-xs whitespace-nowrap">নামঃ</span>
                <span className="inline-block flex-1 border-b border-dotted border-slate-600"></span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="font-bold text-slate-900 text-xs whitespace-nowrap">ফোনঃ</span>
                <span className="inline-block w-28 border-b border-dotted border-slate-600"></span>
              </div>
            </div>

            {/* Bottom Row: ঠিকানাঃ (Full Width) */}
            <div className="flex items-center space-x-1 h-6 mt-0.5">
              <span className="font-bold text-slate-900 text-xs whitespace-nowrap">ঠিকানাঃ</span>
              <span className="inline-block flex-1 border-b border-dotted border-slate-600"></span>
            </div>
          </div>

          {/* Pre-printed Table Grid Header & 14 Table Rows matching Pad.jpeg */}
          <div className="relative mx-4 mt-2 border border-[#142058]">
            {/* Table Header Bar */}
            <div className="grid grid-cols-[42px_1fr_44px_58px_86px] bg-[#142058] text-white text-[11px] font-bold text-center border-b border-[#142058]">
              <div className="py-1 border-r border-white/40">ক্রমিক নং</div>
              <div className="py-1 border-r border-white/40">পণ্যের বিবরণ</div>
              <div className="py-1 border-r border-white/40">সংখ্যা</div>
              <div className="py-1 border-r border-white/40">দর</div>
              <div className="py-1">মূল্য</div>
            </div>

            {/* 14 Ruled Rows */}
            {Array.from({ length: 14 }).map((_, idx) => (
              <div
                key={`pad-grid-row-${idx}`}
                className="grid grid-cols-[42px_1fr_44px_58px_86px] h-[22.5px] border-b border-slate-400 last:border-b-0"
              >
                <div className="border-r border-slate-400"></div>
                <div className="border-r border-slate-400"></div>
                <div className="border-r border-slate-400"></div>
                <div className="border-r border-slate-400"></div>
                <div></div>
              </div>
            ))}
          </div>

          {/* Bottom Area: কথায়ঃ with dotted baseline rows */}
          <div className="relative mx-4 mt-2 flex justify-between items-start">
            {/* Left: কথায়ঃ with 2 dotted baseline rows */}
            <div className="flex-1 pr-3 space-y-2 pt-1">
              <div className="flex items-center space-x-1">
                <span className="font-bold text-slate-900 text-[11px] whitespace-nowrap">কথায়ঃ</span>
                <span className="inline-block flex-1 border-b border-dotted border-slate-600"></span>
              </div>
              <div className="flex items-center pl-4">
                <span className="inline-block w-full border-b border-dotted border-slate-600"></span>
              </div>
            </div>
          </div>

          {/* Faint Center Translucent Watermark (matching Pad.jpeg background circles) */}
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.04] pointer-events-none">
            <svg viewBox="0 0 100 100" className="w-80 h-80">
              <circle cx="50" cy="50" r="26" fill="#38bdf8" />
              <circle cx="50" cy="22" r="16" fill="#facc15" />
              <circle cx="22" cy="50" r="16" fill="#0284c7" />
              <circle cx="50" cy="78" r="16" fill="#ef4444" />
              <circle cx="78" cy="50" r="16" fill="#22c55e" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
};

