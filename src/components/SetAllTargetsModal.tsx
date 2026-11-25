import React, { useState, useMemo } from 'react';
import { Salesperson, BranchLocation } from '../types';
import { cleanBranchName, isUnwantedSalesCenter, isMarketingOfficer } from '../utils/branchAccess';
import {
  X,
  Target,
  Search,
  Building2,
  Users,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  Boxes,
  RotateCcw,
  Sparkles,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SetAllTargetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  salespersons: Salesperson[];
  branches: BranchLocation[];
  onSaveTargets: (updatedSalespersons: Salesperson[]) => void;
  initialSelectedSpId?: string | null;
}

interface TargetDraft {
  monthlyTargetSales: number;
  yearlyTargetSales: number;
  monthlyTargetCollection: number;
  yearlyTargetCollection: number;
  monthlyTargetCoils: number;
}

export const SetAllTargetsModal: React.FC<SetAllTargetsModalProps> = ({
  isOpen,
  onClose,
  salespersons,
  branches,
  onSaveTargets,
  initialSelectedSpId
}) => {
  const cleanSortedBranches = useMemo(() => {
    return branches
      .filter((b) => !isUnwantedSalesCenter(b))
      .sort((a, b) => cleanBranchName(a.name).localeCompare(cleanBranchName(b.name)));
  }, [branches]);

  // Initialize target drafts from incoming salespersons
  const [drafts, setDrafts] = useState<Record<string, TargetDraft>>(() => {
    const initial: Record<string, TargetDraft> = {};
    salespersons.forEach((sp) => {
      const mSales = sp.monthlyTargetSales || (sp.yearlyTargetSales ? Math.round(sp.yearlyTargetSales / 12) : 0);
      const ySales = sp.yearlyTargetSales || mSales * 12;
      const mColl = sp.monthlyTargetCollection || (sp.yearlyTargetCollection ? Math.round(sp.yearlyTargetCollection / 12) : 0);
      const yColl = sp.yearlyTargetCollection || mColl * 12;
      const mCoils = sp.monthlyTargetCoils || 0;

      initial[sp.id] = {
        monthlyTargetSales: mSales,
        yearlyTargetSales: ySales,
        monthlyTargetCollection: mColl,
        yearlyTargetCollection: yColl,
        monthlyTargetCoils: mCoils
      };
    });
    return initial;
  });

  // Re-sync drafts whenever modal opens or salespersons change
  React.useEffect(() => {
    if (isOpen) {
      const updated: Record<string, TargetDraft> = {};
      salespersons.forEach((sp) => {
        const mSales = sp.monthlyTargetSales || (sp.yearlyTargetSales ? Math.round(sp.yearlyTargetSales / 12) : 0);
        const ySales = sp.yearlyTargetSales || mSales * 12;
        const mColl = sp.monthlyTargetCollection || (sp.yearlyTargetCollection ? Math.round(sp.yearlyTargetCollection / 12) : 0);
        const yColl = sp.yearlyTargetCollection || mColl * 12;
        const mCoils = sp.monthlyTargetCoils || 0;

        updated[sp.id] = {
          monthlyTargetSales: mSales,
          yearlyTargetSales: ySales,
          monthlyTargetCollection: mColl,
          yearlyTargetCollection: yColl,
          monthlyTargetCoils: mCoils
        };
      });
      setDrafts(updated);
    }
  }, [isOpen, salespersons]);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState('all');

  // Bulk input fields (with bidirectional monthly <-> yearly sync)
  const [bulkMonthlySales, setBulkMonthlySales] = useState<string>('');
  const [bulkYearlySales, setBulkYearlySales] = useState<string>('');
  const [bulkMonthlyCollection, setBulkMonthlyCollection] = useState<string>('');
  const [bulkYearlyCollection, setBulkYearlyCollection] = useState<string>('');
  const [bulkMonthlyCoils, setBulkMonthlyCoils] = useState<string>('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Filtered salespersons list
  const filteredSalespersons = useMemo(() => {
    return salespersons.filter((sp) => {
      if (!isMarketingOfficer(sp)) return false;

      // Branch filter
      if (selectedBranchId !== 'all') {
        const targetBranch = branches.find((b) => b.id === selectedBranchId);
        const targetName = cleanBranchName(targetBranch?.name).toLowerCase();
        const spBranch = cleanBranchName(sp.branchName).toLowerCase();
        const spBranchId = (sp.branchId || '').toLowerCase();

        const matchId = spBranchId === selectedBranchId.toLowerCase();
        const matchName = targetName && (spBranch.includes(targetName) || targetName.includes(spBranch));
        if (!matchId && !matchName) return false;
      }

      // Search filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const name = (sp.name || '').toLowerCase();
        const code = (sp.code || '').toLowerCase();
        const phone = (sp.phone || '').toLowerCase();
        const branch = (sp.branchName || '').toLowerCase();
        if (!name.includes(term) && !code.includes(term) && !phone.includes(term) && !branch.includes(term)) {
          return false;
        }
      }

      return true;
    });
  }, [salespersons, selectedBranchId, branches, searchTerm]);

  // Handler to update a single draft property with BIDIRECTIONAL monthly <-> yearly calculation
  const handleDraftChange = (spId: string, field: keyof TargetDraft, val: number) => {
    setDrafts((prev) => {
      const current = prev[spId] || {
        monthlyTargetSales: 0,
        yearlyTargetSales: 0,
        monthlyTargetCollection: 0,
        yearlyTargetCollection: 0,
        monthlyTargetCoils: 0
      };

      const updated = { ...current, [field]: val };

      // Two-way calculation:
      // If user inputs monthly -> calculate yearly = monthly * 12
      // If user inputs yearly -> calculate monthly = Math.round(yearly / 12)
      if (field === 'monthlyTargetSales') {
        updated.yearlyTargetSales = val > 0 ? Math.round(val * 12) : 0;
      } else if (field === 'yearlyTargetSales') {
        updated.monthlyTargetSales = val > 0 ? Math.round(val / 12) : 0;
      } else if (field === 'monthlyTargetCollection') {
        updated.yearlyTargetCollection = val > 0 ? Math.round(val * 12) : 0;
      } else if (field === 'yearlyTargetCollection') {
        updated.monthlyTargetCollection = val > 0 ? Math.round(val / 12) : 0;
      }

      return {
        ...prev,
        [spId]: updated
      };
    });
  };

  // Two-way bulk handlers
  const handleBulkMonthlySalesChange = (valStr: string) => {
    setBulkMonthlySales(valStr);
    const num = parseFloat(valStr);
    if (!isNaN(num) && num > 0) {
      setBulkYearlySales(String(Math.round(num * 12)));
    } else if (!valStr) {
      setBulkYearlySales('');
    }
  };

  const handleBulkYearlySalesChange = (valStr: string) => {
    setBulkYearlySales(valStr);
    const num = parseFloat(valStr);
    if (!isNaN(num) && num > 0) {
      setBulkMonthlySales(String(Math.round(num / 12)));
    } else if (!valStr) {
      setBulkMonthlySales('');
    }
  };

  const handleBulkMonthlyCollChange = (valStr: string) => {
    setBulkMonthlyCollection(valStr);
    const num = parseFloat(valStr);
    if (!isNaN(num) && num > 0) {
      setBulkYearlyCollection(String(Math.round(num * 12)));
    } else if (!valStr) {
      setBulkYearlyCollection('');
    }
  };

  const handleBulkYearlyCollChange = (valStr: string) => {
    setBulkYearlyCollection(valStr);
    const num = parseFloat(valStr);
    if (!isNaN(num) && num > 0) {
      setBulkMonthlyCollection(String(Math.round(num / 12)));
    } else if (!valStr) {
      setBulkMonthlyCollection('');
    }
  };

  // Bulk apply to all filtered or all users
  const handleApplyBulk = () => {
    const parsedMonthlySales = parseFloat(bulkMonthlySales) || (parseFloat(bulkYearlySales) ? Math.round(parseFloat(bulkYearlySales) / 12) : 0);
    const parsedYearlySales = parseFloat(bulkYearlySales) || (parseFloat(bulkMonthlySales) ? Math.round(parseFloat(bulkMonthlySales) * 12) : 0);

    const parsedMonthlyColl = parseFloat(bulkMonthlyCollection) || (parseFloat(bulkYearlyCollection) ? Math.round(parseFloat(bulkYearlyCollection) / 12) : 0);
    const parsedYearlyColl = parseFloat(bulkYearlyCollection) || (parseFloat(bulkMonthlyCollection) ? Math.round(parseFloat(bulkMonthlyCollection) * 12) : 0);

    const parsedCoils = parseInt(bulkMonthlyCoils, 10) || 0;

    if (parsedMonthlySales <= 0 && parsedYearlySales <= 0 && parsedMonthlyColl <= 0 && parsedYearlyColl <= 0 && parsedCoils <= 0) {
      alert('Please enter at least one target value (Sales, Collection, or Coils) to apply.');
      return;
    }

    setDrafts((prev) => {
      const next = { ...prev };
      // Apply to all currently visible filtered salespersons (or all if no filter)
      filteredSalespersons.forEach((sp) => {
        const cur = next[sp.id] || {
          monthlyTargetSales: 0,
          yearlyTargetSales: 0,
          monthlyTargetCollection: 0,
          yearlyTargetCollection: 0,
          monthlyTargetCoils: 0
        };

        next[sp.id] = {
          ...cur,
          monthlyTargetSales: parsedMonthlySales > 0 ? parsedMonthlySales : cur.monthlyTargetSales,
          yearlyTargetSales: parsedYearlySales > 0 ? parsedYearlySales : cur.yearlyTargetSales,
          monthlyTargetCollection: parsedMonthlyColl > 0 ? parsedMonthlyColl : cur.monthlyTargetCollection,
          yearlyTargetCollection: parsedYearlyColl > 0 ? parsedYearlyColl : cur.yearlyTargetCollection,
          monthlyTargetCoils: parsedCoils > 0 ? parsedCoils : cur.monthlyTargetCoils
        };
      });
      return next;
    });

    // Reset bulk inputs
    setBulkMonthlySales('');
    setBulkYearlySales('');
    setBulkMonthlyCollection('');
    setBulkYearlyCollection('');
    setBulkMonthlyCoils('');
  };

  // Quick percentage boost
  const handlePercentageBoost = (percent: number) => {
    setDrafts((prev) => {
      const next = { ...prev };
      filteredSalespersons.forEach((sp) => {
        const cur = next[sp.id];
        if (!cur) return;
        const factor = 1 + percent / 100;
        const newMSales = Math.round(cur.monthlyTargetSales * factor);
        const newMColl = Math.round(cur.monthlyTargetCollection * factor);
        const newCoils = Math.round(cur.monthlyTargetCoils * factor);

        next[sp.id] = {
          ...cur,
          monthlyTargetSales: newMSales,
          yearlyTargetSales: newMSales * 12,
          monthlyTargetCollection: newMColl,
          yearlyTargetCollection: newMColl * 12,
          monthlyTargetCoils: newCoils
        };
      });
      return next;
    });
  };

  // Reset row
  const handleResetRow = (spId: string) => {
    setDrafts((prev) => ({
      ...prev,
      [spId]: {
        monthlyTargetSales: 0,
        yearlyTargetSales: 0,
        monthlyTargetCollection: 0,
        yearlyTargetCollection: 0,
        monthlyTargetCoils: 0
      }
    }));
  };

  // Calculate live aggregate totals across all salespersons
  const totals = useMemo(() => {
    let totalMonthlySales = 0;
    let totalYearlySales = 0;
    let totalMonthlyCollection = 0;
    let totalYearlyCollection = 0;
    let totalCoils = 0;

    salespersons.forEach((sp) => {
      const d = drafts[sp.id];
      if (d) {
        totalMonthlySales += d.monthlyTargetSales || 0;
        totalYearlySales += d.yearlyTargetSales || (d.monthlyTargetSales ? d.monthlyTargetSales * 12 : 0);
        totalMonthlyCollection += d.monthlyTargetCollection || 0;
        totalYearlyCollection += d.yearlyTargetCollection || (d.monthlyTargetCollection ? d.monthlyTargetCollection * 12 : 0);
        totalCoils += d.monthlyTargetCoils || 0;
      }
    });

    return {
      totalMonthlySales,
      totalYearlySales,
      totalMonthlyCollection,
      totalYearlyCollection,
      totalCoils
    };
  }, [salespersons, drafts]);

  // Save all targets
  const handleSaveAll = () => {
    const updatedSalespersons = salespersons.map((sp) => {
      const d = drafts[sp.id];
      if (!d) return sp;

      return {
        ...sp,
        monthlyTargetSales: d.monthlyTargetSales,
        yearlyTargetSales: d.yearlyTargetSales,
        monthlyTargetCollection: d.monthlyTargetCollection,
        yearlyTargetCollection: d.yearlyTargetCollection,
        monthlyTargetCoils: d.monthlyTargetCoils
      };
    });

    onSaveTargets(updatedSalespersons);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 900);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* MODAL HEADER */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white p-4 sm:p-5 flex items-center justify-between border-b border-indigo-800/50 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/90 border border-indigo-400/40 flex items-center justify-center shadow-inner">
              <Target className="w-5 h-5 text-indigo-100" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center space-x-2">
                <span>Set Target for All Users</span>
                <span className="text-[10px] uppercase font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 px-2 py-0.5 rounded-full">
                  Admin Setup
                </span>
              </h2>
              <p className="text-xs text-indigo-200 font-medium">
                Assign monthly & yearly sales & collection targets for all marketing officers across sales centers
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BULK TARGET SETTER BAR */}
        <div className="bg-slate-50 p-3 sm:p-4 border-b border-slate-200 shrink-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2 text-slate-800 font-bold text-xs">
              <Zap className="w-4 h-4 text-amber-500" />
              <span>Bulk Set Targets (Apply to {filteredSalespersons.length} selected users):</span>
            </div>

            {/* Quick Boost Presets */}
            <div className="flex items-center space-x-1.5">
              <span className="text-[11px] font-semibold text-slate-500">Quick Boost:</span>
              <button
                type="button"
                onClick={() => handlePercentageBoost(10)}
                className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold rounded border border-indigo-200 transition-colors cursor-pointer"
                title="Increase all targets by 10%"
              >
                +10%
              </button>
              <button
                type="button"
                onClick={() => handlePercentageBoost(20)}
                className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold rounded border border-indigo-200 transition-colors cursor-pointer"
                title="Increase all targets by 20%"
              >
                +20%
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 items-end">
            <div>
              <label className="block text-[10px] font-bold text-emerald-800 mb-0.5">
                Monthly Target Sales (৳):
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-600 font-bold text-xs">৳</span>
                <input
                  type="number"
                  placeholder="e.g. 1000000"
                  value={bulkMonthlySales}
                  onChange={(e) => handleBulkMonthlySalesChange(e.target.value)}
                  className="w-full pl-6 pr-2 py-1.5 text-xs bg-white border border-emerald-300 rounded-lg font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <span className="text-[9px] text-slate-400 block mt-0.5">Auto-calculates Yearly (×12)</span>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                Yearly Target Sales (৳):
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">৳</span>
                <input
                  type="number"
                  placeholder="e.g. 12000000"
                  value={bulkYearlySales}
                  onChange={(e) => handleBulkYearlySalesChange(e.target.value)}
                  className="w-full pl-6 pr-2 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <span className="text-[9px] text-slate-400 block mt-0.5">Auto-calculates Monthly (/12)</span>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-blue-800 mb-0.5">
                Monthly Target Coll. (৳):
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-blue-600 font-bold text-xs">৳</span>
                <input
                  type="number"
                  placeholder="e.g. 900000"
                  value={bulkMonthlyCollection}
                  onChange={(e) => handleBulkMonthlyCollChange(e.target.value)}
                  className="w-full pl-6 pr-2 py-1.5 text-xs bg-white border border-blue-300 rounded-lg font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <span className="text-[9px] text-slate-400 block mt-0.5">Auto-calculates Yearly (×12)</span>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                Yearly Target Coll. (৳):
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">৳</span>
                <input
                  type="number"
                  placeholder="e.g. 10800000"
                  value={bulkYearlyCollection}
                  onChange={(e) => handleBulkYearlyCollChange(e.target.value)}
                  className="w-full pl-6 pr-2 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <span className="text-[9px] text-slate-400 block mt-0.5">Auto-calculates Monthly (/12)</span>
            </div>

            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                  Monthly Coils:
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">📦</span>
                  <input
                    type="number"
                    placeholder="300"
                    value={bulkMonthlyCoils}
                    onChange={(e) => setBulkMonthlyCoils(e.target.value)}
                    className="w-full pl-6 pr-2 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleApplyBulk}
                className="py-1.5 px-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold text-xs rounded-lg shadow-sm flex items-center justify-center space-x-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 h-[32px] mb-[2px]"
                title="Apply target values to all selected users"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Apply to All</span>
              </button>
            </div>
          </div>
        </div>

        {/* SEARCH & FILTER BAR */}
        <div className="p-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center space-x-2 flex-1 min-w-[240px]">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search marketing officer name, code, phone..."
                className="w-full pl-8 pr-7 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center space-x-1 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
              <Building2 className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer max-w-[170px] truncate"
              >
                <option value="all">All Sales Centers ({cleanSortedBranches.length})</option>
                {cleanSortedBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {cleanBranchName(b.name)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Showing <strong className="text-slate-800">{filteredSalespersons.length}</strong> of {salespersons.length} users
          </div>
        </div>

        {/* EDITABLE TARGET TABLE */}
        <div className="flex-1 overflow-y-auto overflow-x-auto min-h-[280px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px]">
              <tr>
                <th className="p-2.5 text-center w-10">SL</th>
                <th className="p-2.5 w-16">Code</th>
                <th className="p-2.5 min-w-[150px]">Marketing Officer</th>
                <th className="p-2.5 min-w-[150px]">Sales Center</th>
                <th className="p-2.5 text-right min-w-[140px] bg-emerald-50/70 text-emerald-950">
                  Monthly Target (Sales ৳)
                </th>
                <th className="p-2.5 text-right min-w-[140px] text-slate-600">
                  Yearly Target (Sales ৳)
                </th>
                <th className="p-2.5 text-right min-w-[140px] bg-blue-50/70 text-blue-950">
                  Monthly Target (Coll. ৳)
                </th>
                <th className="p-2.5 text-right min-w-[140px] text-slate-600">
                  Yearly Target (Coll. ৳)
                </th>
                <th className="p-2.5 text-center w-24">Coils</th>
                <th className="p-2.5 text-center w-12">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSalespersons.map((sp, idx) => {
                const draft = drafts[sp.id] || {
                  monthlyTargetSales: 0,
                  yearlyTargetSales: 0,
                  monthlyTargetCollection: 0,
                  yearlyTargetCollection: 0,
                  monthlyTargetCoils: 0
                };
                const isHighlighted = initialSelectedSpId && initialSelectedSpId === sp.id;

                return (
                  <tr
                    key={sp.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      isHighlighted ? 'bg-amber-50/80 font-bold' : ''
                    }`}
                  >
                    <td className="p-2.5 text-center text-slate-400 font-mono">{idx + 1}</td>
                    <td className="p-2.5 font-mono font-black text-blue-700">{sp.code}</td>
                    <td className="p-2.5 font-extrabold text-slate-900">
                      <div>{sp.name}</div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        {sp.designation || sp.role || 'Officer'}
                      </div>
                    </td>
                    <td className="p-2.5 text-slate-600 font-medium">
                      <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] border border-slate-200">
                        {cleanBranchName(sp.branchName)}
                      </span>
                    </td>

                    {/* Monthly Target Sales */}
                    <td className="p-2 bg-emerald-50/30">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-emerald-700 font-bold text-xs">৳</span>
                        <input
                          type="number"
                          value={draft.monthlyTargetSales || ''}
                          onChange={(e) =>
                            handleDraftChange(sp.id, 'monthlyTargetSales', parseFloat(e.target.value) || 0)
                          }
                          placeholder="0"
                          className="w-full pl-5 pr-2 py-1 text-right font-mono font-bold text-xs bg-white border border-emerald-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                        />
                      </div>
                    </td>

                    {/* Yearly Target Sales */}
                    <td className="p-2">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">৳</span>
                        <input
                          type="number"
                          value={draft.yearlyTargetSales || ''}
                          onChange={(e) =>
                            handleDraftChange(sp.id, 'yearlyTargetSales', parseFloat(e.target.value) || 0)
                          }
                          placeholder="0"
                          className="w-full pl-5 pr-2 py-1 text-right font-mono font-medium text-xs bg-white border border-slate-200 rounded focus:ring-1 focus:ring-slate-400 focus:outline-none"
                        />
                      </div>
                    </td>

                    {/* Monthly Target Collection */}
                    <td className="p-2 bg-blue-50/30">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-blue-700 font-bold text-xs">৳</span>
                        <input
                          type="number"
                          value={draft.monthlyTargetCollection || ''}
                          onChange={(e) =>
                            handleDraftChange(sp.id, 'monthlyTargetCollection', parseFloat(e.target.value) || 0)
                          }
                          placeholder="0"
                          className="w-full pl-5 pr-2 py-1 text-right font-mono font-bold text-xs bg-white border border-blue-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                    </td>

                    {/* Yearly Target Collection */}
                    <td className="p-2">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">৳</span>
                        <input
                          type="number"
                          value={draft.yearlyTargetCollection || ''}
                          onChange={(e) =>
                            handleDraftChange(sp.id, 'yearlyTargetCollection', parseFloat(e.target.value) || 0)
                          }
                          placeholder="0"
                          className="w-full pl-5 pr-2 py-1 text-right font-mono font-medium text-xs bg-white border border-slate-200 rounded focus:ring-1 focus:ring-slate-400 focus:outline-none"
                        />
                      </div>
                    </td>

                    {/* Monthly Target Coils */}
                    <td className="p-2">
                      <input
                        type="number"
                        value={draft.monthlyTargetCoils || ''}
                        onChange={(e) =>
                          handleDraftChange(sp.id, 'monthlyTargetCoils', parseInt(e.target.value, 10) || 0)
                        }
                        placeholder="0"
                        className="w-full px-2 py-1 text-center font-mono font-bold text-xs bg-white border border-slate-200 rounded focus:ring-1 focus:ring-slate-400 focus:outline-none"
                      />
                    </td>

                    {/* Reset Button */}
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleResetRow(sp.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                        title="Clear row targets"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredSalespersons.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400 italic">
                    No marketing officers found matching the filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* LIVE SUMMARY TOTALS FOOTER */}
        <div className="bg-slate-900 text-white p-3 sm:p-4 border-t border-slate-800 shrink-0 flex flex-wrap items-center justify-between gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-400 text-[10px] uppercase font-bold block">Total Monthly Sales</span>
              <span className="font-mono font-extrabold text-emerald-400 text-sm">
                ৳{totals.totalMonthlySales.toLocaleString('en-IN')}
              </span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] uppercase font-bold block">Total Monthly Collection</span>
              <span className="font-mono font-extrabold text-blue-400 text-sm">
                ৳{totals.totalMonthlyCollection.toLocaleString('en-IN')}
              </span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] uppercase font-bold block">Total Yearly Sales</span>
              <span className="font-mono font-extrabold text-slate-300 text-sm">
                ৳{totals.totalYearlySales.toLocaleString('en-IN')}
              </span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] uppercase font-bold block">Total Yearly Collection</span>
              <span className="font-mono font-extrabold text-slate-300 text-sm">
                ৳{totals.totalYearlyCollection.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs rounded-xl border border-slate-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saveSuccess}
              className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{saveSuccess ? 'Saved Successfully!' : 'Save All Targets'}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
