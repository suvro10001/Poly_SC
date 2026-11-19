import React, { useMemo, useState } from 'react';
import { Globe, Trophy, Target, Lightbulb, Settings } from 'lucide-react';

export interface InfographicSliceData {
  id: string;
  label: string;
  percentage: number;
  amount: number;
  color: string;
  hoverColor?: string;
  outerRadius?: number;
  icon?: 'globe' | 'trophy' | 'target' | 'lightbulb' | 'gear';
  description?: string;
}

interface InfographicPieDonutGraphProps {
  title: string;
  subtitle?: string;
  centerMetric: string;
  slices: InfographicSliceData[];
}

const SLICE_ICON_MAP = {
  globe: Globe,
  trophy: Trophy,
  target: Target,
  lightbulb: Lightbulb,
  gear: Settings,
} as const;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeRingSlice(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  const safeEnd = Math.min(endAngle, startAngle + 359.8);
  const outerStart = polarToCartesian(cx, cy, outerRadius, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, safeEnd);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, safeEnd);
  const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
  const largeArc = safeEnd - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
    `L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

export const InfographicPieDonutGraph: React.FC<InfographicPieDonutGraphProps> = ({
  title,
  subtitle,
  centerMetric,
  slices,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const computedSlices = useMemo(() => {
    const valid = (slices || []).filter((s) => s && (s.amount > 0 || s.percentage > 0));
    const list = valid.length > 0 ? valid : (slices || []).slice(0, 1);
    if (list.length === 0) return [];

    const totalAmt = list.reduce((sum, s) => sum + Math.max(0, s.amount || 0), 0);
    const totalPct = list.reduce((sum, s) => sum + Math.max(0, s.percentage || 0), 0);

    let currentAngle = 0;
    const count = list.length;
    const gapDeg = count > 1 ? 2.4 : 0;
    const minSweep = count > 1 ? 14 : 359.6;

    const rawAngles = list.map((s) => {
      if (totalAmt > 0) {
        return Math.max(minSweep, ((Math.max(0, s.amount) / totalAmt) * 360));
      }
      if (totalPct > 0) {
        return Math.max(minSweep, ((Math.max(0, s.percentage) / totalPct) * 360));
      }
      return 360 / count;
    });
    const rawSum = rawAngles.reduce((a, b) => a + b, 0) || 360;
    const scale = 360 / rawSum;

    return list.map((s, idx) => {
      const span = Math.max(6, rawAngles[idx] * scale);
      const start = currentAngle + gapDeg / 2;
      const end = currentAngle + span - gapDeg / 2;
      currentAngle += span;

      // Normalize input outerRadius (roughly 140..200) onto SVG viewBox (cx=140, cy=140)
      const normRadius = s.outerRadius
        ? Math.min(126, Math.max(92, (s.outerRadius / 200) * 122))
        : 112 - (idx % 3) * 8;

      return {
        ...s,
        startAngle: start,
        endAngle: Math.max(start + 2, end),
        midAngle: (start + end) / 2,
        svgOuterRadius: normRadius,
      };
    });
  }, [slices]);

  const activeSlice = useMemo(
    () => computedSlices.find((s) => s.id === hoveredId) || computedSlices[0] || null,
    [computedSlices, hoveredId]
  );

  const cx = 140;
  const cy = 140;
  const innerR = 54;

  return (
    <div className="bg-white/[0.04] backdrop-blur-md rounded-2xl border border-white/[0.12] p-4 shadow-lg">
      <div className="grid grid-cols-1 sm:grid-cols-[260px_1fr] gap-4 items-center">
        {/* Stepped Donut SVG */}
        <div className="relative flex items-center justify-center mx-auto w-[240px] h-[240px]">
          <svg viewBox="0 0 280 280" className="w-full h-full overflow-visible drop-shadow-md">
            <circle cx={cx} cy={cy} r={innerR - 4} fill="rgba(6, 21, 32, 0.85)" stroke="rgba(34, 211, 238, 0.25)" strokeWidth="1.5" />
            {computedSlices.length === 0 ? (
              <circle cx={cx} cy={cy} r={96} fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="28" />
            ) : (
              computedSlices.map((s) => {
                const isHovered = hoveredId === s.id;
                const outerR = isHovered ? s.svgOuterRadius + 6 : s.svgOuterRadius;
                const d = describeRingSlice(cx, cy, innerR, outerR, s.startAngle, s.endAngle);
                const labelPos = polarToCartesian(cx, cy, (innerR + outerR) / 2, s.midAngle);
                const sweep = s.endAngle - s.startAngle;

                return (
                  <g
                    key={s.id}
                    onMouseEnter={() => setHoveredId(s.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className="cursor-pointer transition-opacity duration-150"
                    style={{ opacity: hoveredId && !isHovered ? 0.72 : 1 }}
                  >
                    <path
                      d={d}
                      fill={isHovered ? (s.hoverColor || s.color) : s.color}
                      stroke="rgba(8, 24, 34, 0.85)"
                      strokeWidth="1.5"
                    />
                    {sweep >= 22 && (
                      <text
                        x={labelPos.x}
                        y={labelPos.y + 3}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="10"
                        fontWeight="800"
                        fontFamily="ui-monospace, SFMono-Regular, monospace"
                        style={{ pointerEvents: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.75)' }}
                      >
                        {s.percentage}%
                      </text>
                    )}
                  </g>
                );
              })
            )}
          </svg>

          {/* Center Core Metrics */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-4 text-center">
            <span className="text-[9px] font-black uppercase tracking-widest text-cyan-300/90">
              {subtitle || title}
            </span>
            <span className="text-sm font-black text-white font-mono mt-0.5 leading-tight">
              {activeSlice && hoveredId
                ? `৳${Math.round(activeSlice.amount).toLocaleString('en-IN')}`
                : centerMetric}
            </span>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5 max-w-[90px] truncate">
              {activeSlice && hoveredId ? activeSlice.label : title}
            </span>
          </div>
        </div>

        {/* Interactive Legend List */}
        <div className="space-y-1.5 max-h-[245px] overflow-y-auto pr-1">
          {computedSlices.map((s) => {
            const IconComp = s.icon ? SLICE_ICON_MAP[s.icon] : Target;
            const isHovered = hoveredId === s.id;
            return (
              <div
                key={s.id}
                onMouseEnter={() => setHoveredId(s.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer ${
                  isHovered
                    ? 'bg-white/[0.11] border-cyan-400/50 shadow-sm'
                    : 'bg-[#071926]/70 border-white/[0.08] hover:border-white/[0.18]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border border-white/20"
                    style={{ backgroundColor: s.color }}
                  >
                    <IconComp className="w-3.5 h-3.5 text-white" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{s.label}</div>
                    {s.description && (
                      <div className="text-[10px] text-slate-400 truncate">{s.description}</div>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-mono font-black text-white">
                    ৳{Math.round(s.amount || 0).toLocaleString('en-IN')}
                  </div>
                  <div className="text-[10px] font-mono font-bold text-cyan-300">
                    {s.percentage}%
                  </div>
                </div>
              </div>
            );
          })}
          {computedSlices.length === 0 && (
            <div className="text-xs text-slate-400 text-center py-6">
              No analytics data for selected period.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
