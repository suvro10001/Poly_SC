import React from 'react';
import { useChallan } from '../context/ChallanContext';
import { PolyCablesEmblem } from './PolyCablesLogo';
import {
  FileText,
  Receipt,
  Package,
  Plus,
  RotateCcw,
  ShieldCheck,
  Lock,
  Layers,
} from 'lucide-react';

interface HeaderProps {
  activeTab: 'challans' | 'invoices' | 'catalog';
  setActiveTab: (tab: 'challans' | 'invoices' | 'catalog') => void;
  onOpenCreateChallan: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenCreateChallan,
}) => {
  const {
    unbilledChallansCount,
    totalChallansCount,
    fullyBilledCount,
    invoices,
    catalogItems,
    resetAllToDemo,
  } = useChallan();

  return (
    <header id="main-app-header" className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      {/* Top Banner / Brand */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3.5 gap-3">
          
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center justify-center p-1 overflow-hidden shrink-0">
              <PolyCablesEmblem size="sm" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                  Poly Cables
                </h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  Challan & Billing Directory
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Delivery Challans, Real-time Invoicing & Multi-Showroom Portal
              </p>
            </div>
          </div>

          {/* Top Actions & Quick Stats */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Quick Lock Indicator */}
            {fullyBilledCount > 0 && (
              <div
                id="header-locked-indicator"
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-medium"
                title={`${fullyBilledCount} Challan(s) are Fully Billed & Locked in Read-Only Mode`}
              >
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                <span>{fullyBilledCount} Fully Billed (Locked)</span>
              </div>
            )}

            {/* Reset to Demo */}
            <button
              id="reset-demo-btn"
              onClick={resetAllToDemo}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              title="Reset sample challans to test 1 pending -> 0 pending locked flow"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Demo State</span>
            </button>

            {/* Create Challan Button */}
            <button
              id="header-create-challan-btn"
              onClick={onOpenCreateChallan}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4 text-white" />
              <span>+ New Challan</span>
            </button>
          </div>
        </div>

        {/* Primary Tabs */}
        <div className="flex items-center gap-2 border-t border-slate-100 pt-2 pb-0 overflow-x-auto no-scrollbar">
          {/* Tab 1: Challan Directory - Shows dynamic unbilled count! */}
          <button
            id="tab-challan-directory"
            onClick={() => setActiveTab('challans')}
            className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'challans'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-t-lg'
            }`}
          >
            <FileText className={`w-4 h-4 ${activeTab === 'challans' ? 'text-indigo-600' : 'text-slate-400'}`} />
            <span>Challan Directory</span>
            {/* The Badge: if complete full billed in chalan directory's any challan, then shows (0) instead of (1)! */}
            <span
              id="challan-directory-counter-badge"
              className={`inline-flex items-center justify-center min-w-[20px] px-1.5 py-0.5 text-xs font-bold rounded-full ${
                unbilledChallansCount > 0
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
              }`}
            >
              ({unbilledChallansCount})
            </span>
          </button>

          {/* Tab 2: Invoices / Bills */}
          <button
            id="tab-invoices-directory"
            onClick={() => setActiveTab('invoices')}
            className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'invoices'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-t-lg'
            }`}
          >
            <Receipt className={`w-4 h-4 ${activeTab === 'invoices' ? 'text-indigo-600' : 'text-slate-400'}`} />
            <span>Invoices & Bills</span>
            <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-700">
              ({invoices.length})
            </span>
          </button>

          {/* Tab 3: Poly Item Catalog */}
          <button
            id="tab-catalog-directory"
            onClick={() => setActiveTab('catalog')}
            className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'catalog'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-t-lg'
            }`}
          >
            <Package className={`w-4 h-4 ${activeTab === 'catalog' ? 'text-indigo-600' : 'text-slate-400'}`} />
            <span>Poly Item Catalog</span>
            <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-700">
              ({catalogItems.length})
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
