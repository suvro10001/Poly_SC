import React from 'react';
import { PolyCablesLogo } from './PolyCablesLogo';

export const PolyCablesBanner: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`no-print bg-white rounded-2xl shadow-sm border border-slate-200/90 p-3 sm:p-4 mb-4 flex items-center justify-between flex-wrap gap-4 transition-all ${className}`}>
      {/* POLY CABLES OFFICIAL LOGO & NAME */}
      <div className="flex items-center space-x-3">
        <PolyCablesLogo size="lg" subtitleText="QUALITY WIRES & CABLES" />
      </div>

      <div className="hidden md:flex items-center space-x-2 text-xs bg-slate-50 text-slate-700 px-3 py-1.5 rounded-xl border border-slate-200 font-mono">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span className="font-semibold">Official Store & Billing System</span>
      </div>
    </div>
  );
};
