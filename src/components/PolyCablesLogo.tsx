import React, { useState } from 'react';

export interface PolyCablesEmblemProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  className?: string;
  useImg?: boolean;
}

export const PolyCablesEmblem: React.FC<PolyCablesEmblemProps> = ({
  size = 'md',
  className = '',
  useImg = true
}) => {
  const sizeMap = {
    xs: 'w-6 h-6',
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
    '2xl': 'w-20 h-20',
    '3xl': 'w-28 h-28'
  };

  const [hasError, setHasError] = useState(false);

  return (
    <div className={`relative flex items-center justify-center shrink-0 ${sizeMap[size] || ''} ${className}`}>
      {useImg && !hasError ? (
        <img
          src="/poly-cables-emblem.svg"
          alt="Poly Cables Emblem"
          className="w-full h-full object-contain select-none pointer-events-none"
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
        />
      ) : (
        <svg
          viewBox="0 0 210 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full select-none"
        >
          <defs>
            <clipPath id="pc-inline-cyan-clip">
              <circle cx="105" cy="100" r="65" />
            </clipPath>
          </defs>
          {/* Central Sky Blue Disc */}
          <circle cx="105" cy="100" r="65" fill="#46b4eb" />

          {/* Top: Golden Yellow */}
          <circle cx="105" cy="34" r="31" fill="#eab318" />
          <g clipPath="url(#pc-inline-cyan-clip)">
            <circle cx="105" cy="34" r="31" fill="#c9ae3b" />
          </g>

          {/* Left: Leaf Green */}
          <circle cx="38" cy="100" r="31" fill="#47ae4c" />
          <g clipPath="url(#pc-inline-cyan-clip)">
            <circle cx="38" cy="100" r="31" fill="#53b36b" />
          </g>

          {/* Right: Deep Navy Blue */}
          <circle cx="172" cy="100" r="31" fill="#1d2b78" />
          <g clipPath="url(#pc-inline-cyan-clip)">
            <circle cx="172" cy="100" r="31" fill="#253b8e" />
          </g>

          {/* Bottom: Crimson Red */}
          <circle cx="105" cy="166" r="31" fill="#c8151d" />
          <g clipPath="url(#pc-inline-cyan-clip)">
            <circle cx="105" cy="166" r="31" fill="#bd5654" />
          </g>
        </svg>
      )}
    </div>
  );
};

export interface PolyCablesLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  variant?: 'light' | 'dark' | 'color';
  showSubtitle?: boolean;
  subtitleText?: string;
  height?: string | number;
  showEmblem?: boolean;
}

export const PolyCablesLogo: React.FC<PolyCablesLogoProps> = ({
  size = 'md',
  className = '',
  variant = 'color',
  showSubtitle = false,
  subtitleText = '',
  height,
  showEmblem = true
}) => {
  const isDark = variant === 'dark';
  const textColor = isDark ? '#ffffff' : '#1b287c';
  const subtextColor = isDark ? 'text-blue-200' : 'text-slate-600';

  const sizeStyles = {
    xs: { emblem: 'xs' as const, font: 'text-sm', sub: 'text-[7px]', space: 'space-x-1.5' },
    sm: { emblem: 'sm' as const, font: 'text-base', sub: 'text-[9px]', space: 'space-x-2' },
    md: { emblem: 'md' as const, font: 'text-xl', sub: 'text-[10px]', space: 'space-x-2.5' },
    lg: { emblem: 'lg' as const, font: 'text-2xl', sub: 'text-xs', space: 'space-x-3' },
    xl: { emblem: 'xl' as const, font: 'text-3xl', sub: 'text-sm', space: 'space-x-3.5' },
    '2xl': { emblem: '2xl' as const, font: 'text-4xl', sub: 'text-base', space: 'space-x-4' }
  };

  const currentSize = sizeStyles[size] || sizeStyles.md;

  // Filter out any "IND. LTD." or "INDUSTRIES LTD." from subtitleText as requested
  const cleanSubtitle = (subtitleText || '')
    .replace(/\s*(?:ind\.?\s*ltd\.?|industries\s*ltd\.?)\s*/gi, ' ')
    .replace(/^[•\s\-_]+|[•\s\-_]+$/g, '')
    .trim();

  return (
    <div
      style={height ? { height } : undefined}
      className={`inline-flex items-center ${showEmblem ? currentSize.space : ''} ${className} select-none`}
    >
      {/* 1. Official 4-Color Circular Wire Emblem */}
      {showEmblem && <PolyCablesEmblem size={currentSize.emblem} />}

      {/* 2. Official Brand Typography: P [Red Brush Spiral O] LY CABLES */}
      <div className="flex flex-col justify-center leading-none">
        <div className={`flex items-center font-black tracking-tight ${currentSize.font}`}>
          {/* Letter P */}
          <span style={{ color: textColor }} className="font-extrabold mr-[1px]">
            P
          </span>

          {/* Stylized Red Brush-Stroke Spiral "O" matching user's uploaded image */}
          <span className="relative inline-flex items-center justify-center shrink-0 mx-[1px] align-middle" style={{ width: '0.92em', height: '0.92em' }}>
            <svg viewBox="-55 -55 110 110" className="w-full h-full">
              <path
                d="M 38 -25 C 22 -48, -14 -54, -36 -34 C -56 -16, -56 20, -34 39 C -14 56, 22 54, 41 32 C 48 23, 50 11, 47 2 C 45 12, 40 22, 31 29 C 14 43, -14 43, -29 27 C -42 13, -41 -12, -26 -25 C -12 -37, 12 -35, 25 -16 Z"
                fill="#c32126"
              />
              <path
                d="M -32 36 C -12 52, 22 50, 39 30 C 45 22, 48 11, 46 1"
                fill="none"
                stroke="#c32126"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <path
                d="M 16 -14 C 6 -27, -14 -28, -24 -16 C -33 -5, -31 13, -19 22 C -7 31, 12 29, 22 17 C 28 9, 29 -2, 25 -10 C 24 -2, 20 7, 13 13 C 4 20, -9 20, -16 12 C -23 4, -22 -7, -14 -14 C -7 -20, 4 -19, 10 -10 Z"
                fill="#c32126"
              />
              <path
                d="M -16 20 C -4 28, 13 26, 21 14 C 26 6, 26 -5, 21 -12"
                fill="none"
                stroke="#c32126"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <path
                d="M -11 -11 A 15 15 0 1 1 -3 14 L -7 6 A 7 7 0 1 0 -12 2 L -19 5 A 15 15 0 0 1 -11 -11 Z"
                fill="#c32126"
              />
            </svg>
          </span>

          {/* Letters LY */}
          <span style={{ color: textColor }} className="font-extrabold tracking-tight ml-[1px]">
            LY
          </span>

          {/* Gap between POLY and CABLES */}
          <span className="inline-block w-[0.32em]" />

          {/* Letters CABLES */}
          <span style={{ color: textColor }} className="font-extrabold tracking-wide">
            CABLES
          </span>
        </div>

        {/* Optional Subtitle */}
        {showSubtitle && Boolean(cleanSubtitle) && (
          <span className={`font-bold tracking-widest uppercase mt-0.5 ${subtextColor} ${currentSize.sub}`}>
            {cleanSubtitle}
          </span>
        )}
      </div>
    </div>
  );
};
