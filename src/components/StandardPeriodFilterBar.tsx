import React, { useRef } from 'react';
import { Calendar, Clock } from 'lucide-react';
import { StandardPeriodPreset } from '../utils/standardPeriodHelper';
import { parseDateToISO, formatDateDDMMYY } from '../utils/dateUtils';

interface StandardPeriodFilterBarProps {
  period: StandardPeriodPreset;
  onSelectPeriod: (preset: StandardPeriodPreset) => void;
  customStartDate?: string;
  customEndDate?: string;
  onCustomStartDateChange?: (val: string) => void;
  onCustomEndDateChange?: (val: string) => void;
  theme?: 'dark' | 'light';
  showLabel?: boolean;
}

export const StandardPeriodFilterBar: React.FC<StandardPeriodFilterBarProps> = ({
  period,
  onSelectPeriod,
  customStartDate = '',
  customEndDate = '',
  onCustomStartDateChange,
  onCustomEndDateChange,
  theme = 'dark',
  showLabel = true
}) => {
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);

  const now = new Date();
  const currentYyyy = now.getFullYear();
  const currentMm = String(now.getMonth() + 1).padStart(2, '0');
  const runningYy = String(currentYyyy).slice(-2);
  const runningLastDay = new Date(currentYyyy, now.getMonth() + 1, 0).getDate();

  const prevMonthDate = new Date(currentYyyy, now.getMonth() - 1, 1);
  const prevYyyy = prevMonthDate.getFullYear();
  const prevMm = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
  const prevYy = String(prevYyyy).slice(-2);
  const prevLastDay = new Date(prevYyyy, prevMonthDate.getMonth() + 1, 0).getDate();

  const isDark = theme === 'dark';

  const activeBtnClass = isDark
    ? 'bg-emerald-500/90 text-white border-emerald-300/90 shadow-[0_0_12px_rgba(16,185,129,0.40)] font-black'
    : 'bg-emerald-600 text-white border-emerald-700 shadow-xs font-black';
  const inactiveBtnClass = isDark
    ? 'bg-[#061520]/90 hover:bg-cyan-500/15 text-slate-200 border-cyan-500/30 font-bold'
    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 font-bold';

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {showLabel && (
        <div className={`flex items-center space-x-1 mr-0.5 font-bold shrink-0 ${isDark ? 'text-cyan-200/80' : 'text-slate-700'}`}>
          <Clock className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
          <span>Period:</span>
        </div>
      )}

      {/* This Month */}
      <button
        type="button"
        onClick={() => onSelectPeriod('this_month')}
        className={`px-2.5 py-1 h-[34px] rounded-xl text-xs transition-all cursor-pointer border whitespace-nowrap ${
          period === 'this_month' ? activeBtnClass : inactiveBtnClass
        }`}
        title={`This Month (01.${currentMm}.${runningYy} - ${runningLastDay}.${currentMm}.${runningYy})`}
      >
        This Month
      </button>

      {/* Last Month */}
      <button
        type="button"
        onClick={() => onSelectPeriod('last_month')}
        className={`px-2.5 py-1 h-[34px] rounded-xl text-xs transition-all cursor-pointer border whitespace-nowrap ${
          period === 'last_month' ? activeBtnClass : inactiveBtnClass
        }`}
        title={`Last Month (01.${prevMm}.${prevYy} - ${prevLastDay}.${prevMm}.${prevYy})`}
      >
        Last Month
      </button>

      {/* This Year */}
      <button
        type="button"
        onClick={() => onSelectPeriod('this_year')}
        className={`px-2.5 py-1 h-[34px] rounded-xl text-xs transition-all cursor-pointer border whitespace-nowrap ${
          period === 'this_year' ? activeBtnClass : inactiveBtnClass
        }`}
        title={`This Year (${currentYyyy})`}
      >
        This Year
      </button>

      {/* Last Year */}
      <button
        type="button"
        onClick={() => onSelectPeriod('last_year')}
        className={`px-2.5 py-1 h-[34px] rounded-xl text-xs transition-all cursor-pointer border whitespace-nowrap ${
          period === 'last_year' ? activeBtnClass : inactiveBtnClass
        }`}
        title={`Last Year (${currentYyyy - 1})`}
      >
        Last Year
      </button>

      {/* All */}
      <button
        type="button"
        onClick={() => onSelectPeriod('all')}
        className={`px-2.5 py-1 h-[34px] rounded-xl text-xs transition-all cursor-pointer border whitespace-nowrap ${
          period === 'all' ? activeBtnClass : inactiveBtnClass
        }`}
        title="All Records"
      >
        All
      </button>

      {/* Custom Range */}
      <button
        type="button"
        onClick={() => onSelectPeriod('custom')}
        className={`px-2.5 py-1 h-[34px] rounded-xl text-xs transition-all cursor-pointer border whitespace-nowrap ${
          period === 'custom' ? activeBtnClass : inactiveBtnClass
        }`}
        title="Custom date range"
      >
        Custom Range
      </button>

      {/* Inline Custom Date Inputs if Custom is selected */}
      {period === 'custom' && onCustomStartDateChange && onCustomEndDateChange && (
        <div
          className={`flex flex-wrap items-center gap-1.5 px-2.5 py-1 h-[34px] rounded-xl border text-[11px] ${
            isDark ? 'bg-[#061520]/90 border-cyan-500/30' : 'bg-slate-50 border-slate-300'
          }`}
        >
          <span className={`font-bold whitespace-nowrap ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>From:</span>
          <div className="flex items-center space-x-1">
            <input
              ref={startInputRef}
              type="text"
              value={customStartDate}
              onChange={(e) => onCustomStartDateChange(e.target.value)}
              placeholder="dd.mm.yy"
              className={`font-mono font-bold py-0.5 px-1.5 border rounded w-16 text-center text-xs focus:ring-1 focus:outline-none ${
                isDark
                  ? 'bg-white/[0.06] text-emerald-300 border-white/[0.14] focus:ring-emerald-400'
                  : 'bg-white text-emerald-700 border-slate-300 focus:ring-emerald-500'
              }`}
            />
            <div className="relative flex items-center">
              <input
                type="date"
                value={parseDateToISO(customStartDate)}
                onChange={(e) => {
                  if (e.target.value) {
                    onCustomStartDateChange(formatDateDDMMYY(e.target.value));
                  }
                }}
                className="opacity-0 absolute inset-0 w-6 h-6 cursor-pointer z-10"
                title="Select From Date"
              />
              <Calendar className={`w-3.5 h-3.5 cursor-pointer ${isDark ? 'text-slate-400 hover:text-emerald-400' : 'text-slate-500 hover:text-emerald-600'}`} />
            </div>
          </div>
          <span className={`font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>-</span>
          <span className={`font-bold whitespace-nowrap ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>To:</span>
          <div className="flex items-center space-x-1">
            <input
              ref={endInputRef}
              type="text"
              value={customEndDate}
              onChange={(e) => onCustomEndDateChange(e.target.value)}
              placeholder="dd.mm.yy"
              className={`font-mono font-bold py-0.5 px-1.5 border rounded w-16 text-center text-xs focus:ring-1 focus:outline-none ${
                isDark
                  ? 'bg-white/[0.06] text-emerald-300 border-white/[0.14] focus:ring-emerald-400'
                  : 'bg-white text-emerald-700 border-slate-300 focus:ring-emerald-500'
              }`}
            />
            <div className="relative flex items-center">
              <input
                type="date"
                value={parseDateToISO(customEndDate)}
                onChange={(e) => {
                  if (e.target.value) {
                    onCustomEndDateChange(formatDateDDMMYY(e.target.value));
                  }
                }}
                className="opacity-0 absolute inset-0 w-6 h-6 cursor-pointer z-10"
                title="Select To Date"
              />
              <Calendar className={`w-3.5 h-3.5 cursor-pointer ${isDark ? 'text-slate-400 hover:text-emerald-400' : 'text-slate-500 hover:text-emerald-600'}`} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
