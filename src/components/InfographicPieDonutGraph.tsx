import React, { useId, useState } from 'react';
import {
  ClipboardList,
  Lightbulb,
  Settings,
  PieChart as PieChartIcon,
  Target
} from 'lucide-react';

export interface InfographicSliceData {
  id: string;
  label: string;
  percentage: number;
  amount?: number;
  quantity?: number;
  color: string;
  hoverColor: string;
  outerRadius: number;
  icon: 'globe' | 'trophy' | 'target' | 'lightbulb' | 'gear';
  description?: string;
}

interface InfographicPieDonutGraphProps {
  title?: string;
  subtitle?: string;
  centerMetric?: string;
  centerMetricLabel?: string;
  slices?: InfographicSliceData[];
  className?: string;
  variant?: 'dark' | 'light';
}

interface PetalTheme {
  step: string;
  light: string;
  dark: string;
  text: string;
}

// Exact 5-step radial color palette matching reference chart image_f3ea1017.png
const PETAL_THEMES: PetalTheme[] = [
  { step: '01', light: '#ff5c39', dark: '#dc3618', text: '#e54224' }, // Coral Red
  { step: '02', light: '#ffb319', dark: '#e67e00', text: '#e07b00' }, // Amber Orange
  { step: '03', light: '#99d13b', dark: '#6aa318', text: '#659e15' }, // Lime Green
  { step: '04', light: '#28c7a2', dark: '#0d9478', text: '#0f9478' }, // Emerald Teal
  { step: '05', light: '#00b4d8', dark: '#0081a7', text: '#0284a8' }  // Sky Cyan
];

const EXTRA_COLORS = [
  { light: '#8b5cf6', dark: '#6d28d9' },
  { light: '#ec4899', dark: '#be185d' },
  { light: '#3b82f6', dark: '#1d4ed8' }
];

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad)
  };
}

function describeRoundedSector(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startAngle: number,
  endAngle: number,
  cornerRadius: number
) {
  const safeSpan = Math.max(8, endAngle - startAngle);
  const effectiveEnd = startAngle + safeSpan;
  const cr = Math.min(cornerRadius, (rOuter - rInner) * 0.36, safeSpan * 0.65);
  const angOuter = (cr / rOuter) * (180 / Math.PI);
  const angInner = (cr / rInner) * (180 / Math.PI);

  const pOuterStartInset = polarToCartesian(cx, cy, rOuter - cr, startAngle);
  const pOuterStartCorner = polarToCartesian(cx, cy, rOuter, startAngle);
  const pOuterArcStart = polarToCartesian(cx, cy, rOuter, startAngle + angOuter);
  const pOuterArcEnd = polarToCartesian(cx, cy, rOuter, effectiveEnd - angOuter);
  const pOuterEndCorner = polarToCartesian(cx, cy, rOuter, effectiveEnd);
  const pOuterEndInset = polarToCartesian(cx, cy, rOuter - cr, effectiveEnd);

  const pInnerEndInset = polarToCartesian(cx, cy, rInner + cr, effectiveEnd);
  const pInnerEndCorner = polarToCartesian(cx, cy, rInner, effectiveEnd);
  const pInnerArcEnd = polarToCartesian(cx, cy, rInner, effectiveEnd - angInner);
  const pInnerArcStart = polarToCartesian(cx, cy, rInner, startAngle + angInner);
  const pInnerStartCorner = polarToCartesian(cx, cy, rInner, startAngle);
  const pInnerStartInset = polarToCartesian(cx, cy, rInner + cr, startAngle);

  const largeArc = safeSpan > 180 ? 1 : 0;

  return [
    `M ${pOuterStartInset.x.toFixed(2)} ${pOuterStartInset.y.toFixed(2)}`,
    `Q ${pOuterStartCorner.x.toFixed(2)} ${pOuterStartCorner.y.toFixed(2)} ${pOuterArcStart.x.toFixed(2)} ${pOuterArcStart.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${pOuterArcEnd.x.toFixed(2)} ${pOuterArcEnd.y.toFixed(2)}`,
    `Q ${pOuterEndCorner.x.toFixed(2)} ${pOuterEndCorner.y.toFixed(2)} ${pOuterEndInset.x.toFixed(2)} ${pOuterEndInset.y.toFixed(2)}`,
    `L ${pInnerEndInset.x.toFixed(2)} ${pInnerEndInset.y.toFixed(2)}`,
    `Q ${pInnerEndCorner.x.toFixed(2)} ${pInnerEndCorner.y.toFixed(2)} ${pInnerArcEnd.x.toFixed(2)} ${pInnerArcEnd.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${pInnerArcStart.x.toFixed(2)} ${pInnerArcStart.y.toFixed(2)}`,
    `Q ${pInnerStartCorner.x.toFixed(2)} ${pInnerStartCorner.y.toFixed(2)} ${pInnerStartInset.x.toFixed(2)} ${pInnerStartInset.y.toFixed(2)}`,
    'Z'
  ].join(' ');
}

function formatCompactAmount(val?: number): string {
  if (typeof val !== 'number') return '';
  if (val >= 10000000) return `৳${(val / 10000000).toFixed(2)}Cr`;
  if (val >= 100000) return `৳${(val / 100000).toFixed(2)}L`;
  if (val >= 1000) return `৳${(val / 1000).toFixed(1)}k`;
  return `৳${Math.round(val).toLocaleString('en-IN')}`;
}

function renderStepIcon(stepIdx: number, color: string, size = 16) {
  const props = { size, strokeWidth: 2, color };
  if (stepIdx === 0) return <ClipboardList {...props} />;
  if (stepIdx === 1) return <Lightbulb {...props} />;
  if (stepIdx === 2) return <Settings {...props} />;
  if (stepIdx === 3) return <PieChartIcon {...props} />;
  return <Target {...props} />;
}

export const InfographicPieDonutGraph: React.FC<InfographicPieDonutGraphProps> = ({
  title = 'INFOGRAPHIC',
  subtitle = 'DATA CIRCLE',
  centerMetric,
  slices,
  className = '',
  variant = 'dark'
}) => {
  const [hoveredSliceId, setHoveredSliceId] = useState<string | null>(null);
  const uid = useId().replace(/:/g, '');

  const defaultSlices: InfographicSliceData[] = [
    { id: 'slice-1', label: 'Cluster 01', percentage: 30, amount: 0, color: '#ff5c39', hoverColor: '#dc3618', outerRadius: 200, icon: 'globe' },
    { id: 'slice-2', label: 'Cluster 02', percentage: 25, amount: 0, color: '#ffb319', hoverColor: '#e67e00', outerRadius: 190, icon: 'lightbulb' },
    { id: 'slice-3', label: 'Cluster 03', percentage: 20, amount: 0, color: '#99d13b', hoverColor: '#6aa318', outerRadius: 188, icon: 'gear' },
    { id: 'slice-4', label: 'Cluster 04', percentage: 15, amount: 0, color: '#28c7a2', hoverColor: '#0d9478', outerRadius: 180, icon: 'trophy' },
    { id: 'slice-5', label: 'Cluster 05', percentage: 10, amount: 0, color: '#00b4d8', hoverColor: '#0081a7', outerRadius: 175, icon: 'target' }
  ];

  const activeSlices = slices && slices.length > 0 ? slices : defaultSlices;
  const activeSliceInfo = activeSlices.find((s) => s.id === hoveredSliceId);
  const isDark = variant === 'dark';

  const CX = 230;
  const CY = 230;

  // Dynamic Sales & Collection wise petal area computation (angular sweep + outer radius scale proportionally)
  const slotRawValues = PETAL_THEMES.map((_, idx) => {
    const s = activeSlices[idx];
    if (!s) return 0;
    if (typeof s.amount === 'number' && s.amount > 0) return s.amount;
    return Math.max(0, s.percentage || 0);
  });

  const totalSlotValue = slotRawValues.reduce((acc, v) => acc + v, 0);
  const maxSlotValue = Math.max(...slotRawValues, 0);

  // Compute proportional weights with readable floor (min sector 48 deg, gap 6 deg -> min 42 deg petal)
  const rawWeights = PETAL_THEMES.map((_, idx) => {
    const s = activeSlices[idx];
    if (!s) return 0.08; // Empty slot stays compact
    if (totalSlotValue > 0) {
      const share = slotRawValues[idx] / totalSlotValue;
      // Blend actual share with uniform baseline so area clearly expands/contracts while remaining legible
      return 0.62 * share + 0.38 * 0.2;
    }
    return 0.2;
  });

  const weightSum = rawWeights.reduce((acc, w) => acc + w, 0) || 1;
  // Enforce a 48deg floor per sector so even 0% petals stay legible, then distribute remaining degrees proportionally
  const MIN_SECTOR_DEG = 48;
  const remainingDeg = 360 - MIN_SECTOR_DEG * PETAL_THEMES.length; // 120 deg distributed proportionally by sales/collection
  const sectorAngles = rawWeights.map((w) => MIN_SECTOR_DEG + (w / weightSum) * remainingDeg);

  let runningAngle = 0;
  const computedPetals = PETAL_THEMES.map((theme, idx) => {
    const slice = activeSlices[idx];
    const sectorSweep = sectorAngles[idx];
    const startSector = runningAngle;
    const endSector = runningAngle + sectorSweep;
    runningAngle += sectorSweep;

    const centerAngle = (startSector + endSector) / 2;
    const halfPetal = Math.max(18, (sectorSweep - 6) / 2);
    const halfRim = Math.max(16, (sectorSweep - 11) / 2);
    const halfNeck = Math.min(22, Math.max(10, (sectorSweep - 24) / 2));

    // Scale outer radius proportionally with sales/collection ratio (146..196 white card, 157..207 colored rim)
    const ratioToMax =
      maxSlotValue > 0
        ? slotRawValues[idx] / maxSlotValue
        : slice
        ? 0.65
        : 0.1;
    const baseWhiteOuter = slice
      ? Math.round(148 + Math.pow(ratioToMax, 0.85) * 48) // 148..196
      : 144;
    const baseRimOuter = baseWhiteOuter + 11; // 159..207

    return {
      theme,
      idx,
      slice,
      centerAngle,
      halfPetal,
      halfRim,
      halfNeck,
      baseWhiteOuter,
      baseRimOuter
    };
  });

  return (
    <div
      className={`relative flex flex-col items-center justify-center p-4 sm:p-5 rounded-3xl select-none transition-all ${
        isDark
          ? 'bg-[#081b27]/78 backdrop-blur-xl border border-cyan-400/30 shadow-[0_0_28px_rgba(6,182,212,0.16)] text-white'
          : 'bg-white border border-slate-200 shadow-lg text-slate-900'
      } ${className}`}
    >
      {/* Cool Silver Stage matching image_f3ea1017.png background with dynamic area petals */}
      <div className="relative w-full max-w-[440px] aspect-square rounded-2xl overflow-hidden bg-[radial-gradient(circle_at_50%_46%,#f1f5f9_0%,#d8e0e8_68%,#c0cad5_100%)] shadow-inner border border-white/40 flex items-center justify-center">
        <svg viewBox="0 0 460 460" className="w-full h-full">
          <defs>
            <filter id={`petal-shadow-${uid}`} x="-20%" y="-20%" width="145%" height="145%">
              <feDropShadow dx="1" dy="4" stdDeviation="5" floodColor="#1e293b" floodOpacity="0.24" />
            </filter>
            <filter id={`rim-shadow-${uid}`} x="-20%" y="-20%" width="145%" height="145%">
              <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#0f172a" floodOpacity="0.18" />
            </filter>
            <filter id={`center-shadow-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#0f172a" floodOpacity="0.28" />
            </filter>
            <linearGradient id={`white-petal-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#f1f5f9" />
            </linearGradient>
            {PETAL_THEMES.map((theme, idx) => (
              <linearGradient
                key={`petal-grad-${idx}`}
                id={`petal-grad-${uid}-${idx}`}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor={theme.light} />
                <stop offset="100%" stopColor={theme.dark} />
              </linearGradient>
            ))}
          </defs>

          {/* Dynamic Area Radial Petals (Larger Sales/Collection = Larger Petal Area) */}
          {computedPetals.map(({
            theme,
            idx,
            slice,
            centerAngle,
            halfPetal,
            halfRim,
            halfNeck,
            baseWhiteOuter,
            baseRimOuter
          }) => {
            const isHovered = slice ? hoveredSliceId === slice.id : false;
            const expand = isHovered ? 4 : 0;
            const whiteInner = 73;
            const whiteOuter = baseWhiteOuter + expand;
            const rimOuter = baseRimOuter + expand;

            const innerNeckPath = describeRoundedSector(
              CX,
              CY,
              54,
              96,
              centerAngle - halfNeck,
              centerAngle + halfNeck,
              4
            );

            const outerRimPath = describeRoundedSector(
              CX,
              CY,
              Math.max(whiteInner + 24, whiteOuter - 34),
              rimOuter,
              centerAngle - halfRim,
              centerAngle + halfRim,
              11
            );

            const whitePetalPath = describeRoundedSector(
              CX,
              CY,
              whiteInner,
              whiteOuter,
              centerAngle - halfPetal,
              centerAngle + halfPetal,
              12
            );

            const radialDepth = whiteOuter - whiteInner;
            const rContent = whiteInner + radialDepth * 0.52;
            const contentCenter = polarToCartesian(CX, CY, rContent, centerAngle);
            const chordAtContent = 2 * rContent * Math.sin(((Math.min(halfPetal, 42) * 0.85) * Math.PI) / 180);
            const boxWidth = Math.max(66, Math.min(112, chordAtContent));
            const boxHeight = Math.max(58, Math.min(78, radialDepth * 0.72));
            const formattedAmt = slice ? formatCompactAmount(slice.amount) : '';
            const isCompactPetal = radialDepth < 88 || boxWidth < 78;

            return (
              <g
                key={theme.step}
                className={`${slice ? 'cursor-pointer' : 'opacity-75'} transition-all duration-300`}
                onMouseEnter={() => slice && setHoveredSliceId(slice.id)}
                onMouseLeave={() => setHoveredSliceId(null)}
                opacity={hoveredSliceId && !isHovered ? 0.85 : 1}
              >
                {/* Colored Inner Neck & Outer Rim Band */}
                <g filter={`url(#rim-shadow-${uid})`}>
                  <path d={innerNeckPath} fill={`url(#petal-grad-${uid}-${idx})`} />
                  <path d={outerRimPath} fill={`url(#petal-grad-${uid}-${idx})`} />
                </g>

                {/* Elevated White Curved Card */}
                <path
                  d={whitePetalPath}
                  fill={`url(#white-petal-${uid})`}
                  stroke={isHovered ? theme.light : '#e2e8f0'}
                  strokeWidth={isHovered ? 1.8 : 0.9}
                  filter={`url(#petal-shadow-${uid})`}
                />

                {/* Step Content Inside White Petal */}
                <foreignObject
                  x={contentCenter.x - boxWidth / 2}
                  y={contentCenter.y - boxHeight / 2}
                  width={boxWidth}
                  height={boxHeight}
                  className="pointer-events-none"
                >
                  <div className="w-full h-full flex flex-col items-center justify-center text-center leading-tight px-0.5">
                    <span className={`${isCompactPetal ? 'text-[10.5px]' : 'text-[12.5px]'} font-bold tabular-nums text-slate-500 leading-none`}>
                      {theme.step}
                    </span>
                    <span
                      className={`${isCompactPetal ? 'text-[8px]' : 'text-[9.5px]'} font-extrabold uppercase tracking-tight text-slate-700 truncate w-full mt-0.5 leading-none`}
                      title={slice?.label || 'Empty'}
                    >
                      {slice ? slice.label : '—'}
                    </span>
                    {slice ? (
                      <div
                        className={`mt-0.5 flex flex-wrap items-center justify-center gap-x-1 font-mono font-black ${isCompactPetal ? 'text-[8.5px]' : 'text-[10px]'} leading-tight`}
                        style={{ color: theme.text }}
                      >
                        <span>{slice.percentage}%</span>
                        {formattedAmt && <span className="text-slate-600 text-[8.5px]">{formattedAmt}</span>}
                      </div>
                    ) : (
                      <span className="mt-0.5 text-[8.5px] font-mono text-slate-400">0%</span>
                    )}
                    <div className="mt-1 flex items-center justify-center">
                      {renderStepIcon(idx, theme.text, isCompactPetal ? 13 : 16)}
                    </div>
                  </div>
                </foreignObject>
              </g>
            );
          })}

          {/* Center White Data Circle Hub */}
          <g filter={`url(#center-shadow-${uid})`} className="pointer-events-none">
            <circle cx={CX} cy={CY} r="64" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1.2" />
            <circle cx={CX} cy={CY} r="60" fill="none" stroke="#f1f5f9" strokeWidth="1" />
          </g>

          {/* Subtle World Map Silhouette Accent at Top of Center Circle */}
          <g transform={`translate(${CX - 22}, ${CY - 45}) scale(0.44)`} opacity="0.28" className="pointer-events-none">
            <path
              fill="#64748b"
              d="M12 18c4-5 12-7 18-3 4 2 2 9-3 11-3 2-1 8 3 10 3 2 3 8-2 9-5 1-10-4-11-9-1-6-9-12-5-18zm42-6c7-3 18-2 26 3 6 4 12 2 15 7 3 5-3 11-9 11-5 0-5 6-2 10 2 3-2 9-7 9-5 0-9-5-11-10-2-5-11-4-14-9-3-5-4-8 2-11z"
            />
          </g>

          {/* Center Title, Subtitle & Orange Metric */}
          <text
            x={CX}
            y={CY - 8}
            fill="#334155"
            fontSize="13.5"
            fontWeight="900"
            letterSpacing="0.8"
            fontFamily="sans-serif"
            textAnchor="middle"
            dominantBaseline="central"
          >
            {title}
          </text>
          <text
            x={CX}
            y={CY + 7}
            fill="#64748b"
            fontSize="7.5"
            fontWeight="700"
            letterSpacing="1.6"
            fontFamily="sans-serif"
            textAnchor="middle"
            dominantBaseline="central"
          >
            {subtitle}
          </text>
          {centerMetric ? (
            <>
              <text
                x={CX}
                y={CY + 27}
                fill="#f59e0b"
                fontSize="14.5"
                fontWeight="900"
                fontFamily="monospace"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {centerMetric}
              </text>
              <text
                x={CX}
                y={CY + 42}
                fill="#64748b"
                fontSize="6.5"
                fontWeight="800"
                letterSpacing="1"
                fontFamily="sans-serif"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {activeSlices.length} STEPS
              </text>
            </>
          ) : (
            <text
              x={CX}
              y={CY + 28}
              fill="#f59e0b"
              fontSize="24"
              fontWeight="700"
              fontFamily="sans-serif"
              textAnchor="middle"
              dominantBaseline="central"
            >
              {activeSlices.length}
            </text>
          )}
        </svg>

        {/* Active Hover Tooltip Pill */}
        {activeSliceInfo && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 px-3 py-1 rounded-full bg-slate-950/95 border border-cyan-400/50 text-white text-[11px] font-bold shadow-xl whitespace-nowrap pointer-events-none flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: activeSliceInfo.color }} />
            <span>{activeSliceInfo.label}</span>
            <span className="text-cyan-300 font-mono">{activeSliceInfo.percentage}%</span>
            {typeof activeSliceInfo.amount === 'number' && (
              <span className="text-emerald-300 font-mono">৳{Math.round(activeSliceInfo.amount).toLocaleString('en-IN')}</span>
            )}
          </div>
        )}
      </div>

      {/* Legend Cards Below */}
      <div className={`w-full mt-4 pt-3 border-t ${isDark ? 'border-cyan-500/20' : 'border-slate-100'}`}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {activeSlices.map((s, idx) => {
            const isHov = hoveredSliceId === s.id;
            const grad =
              idx < PETAL_THEMES.length
                ? { light: PETAL_THEMES[idx].light, dark: PETAL_THEMES[idx].dark }
                : EXTRA_COLORS[(idx - PETAL_THEMES.length) % EXTRA_COLORS.length];
            const formattedAmt = formatCompactAmount(s.amount);
            return (
              <div
                key={s.id}
                onMouseEnter={() => setHoveredSliceId(s.id)}
                onMouseLeave={() => setHoveredSliceId(null)}
                className={`p-2 rounded-xl transition-all cursor-pointer border ${
                  isDark
                    ? isHov
                      ? 'bg-cyan-950/80 text-white border-cyan-400/70 shadow-[0_0_14px_rgba(34,211,238,0.28)] scale-[1.02]'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-100 border-white/[0.09]'
                    : isHov
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md scale-[1.02]'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200/80'
                }`}
              >
                <div className="flex items-center space-x-1.5">
                  <span
                    className="w-4 h-4 rounded-full shrink-0 text-[9px] font-black text-white flex items-center justify-center shadow-2xs"
                    style={{ background: `linear-gradient(135deg, ${grad.light}, ${grad.dark})` }}
                  >
                    {idx + 1}
                  </span>
                  <span className="text-[11px] font-black truncate">{s.label}</span>
                </div>
                <div className="flex items-baseline justify-between mt-1 text-xs">
                  <span className="font-extrabold text-[12px] font-mono tabular-nums" style={{ color: isHov ? '#ffffff' : grad.light }}>
                    {s.percentage}%
                  </span>
                  {formattedAmt && (
                    <span className={`text-[10px] font-bold font-mono tabular-nums ${isHov ? 'text-cyan-200' : isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {formattedAmt}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
