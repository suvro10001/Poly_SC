import React, { useState, useMemo, useEffect } from 'react';
import {
  Salesperson,
  StoredBill,
  CollectionMR,
  Party,
  ViewTab
} from '../types';
import {
  Target,
  Award,
  TrendingUp,
  DollarSign,
  Sliders,
  CheckCircle2,
  Save,
  X,
  User,
  Users,
  ChevronRight,
  Flame,
  Calendar
} from 'lucide-react';
import { parseDateToISO } from '../utils/dateUtils';

interface MarketingTargetSectionProps {
  salespersons: Salesperson[];
  storedBills: StoredBill[];
  collections: CollectionMR[];
  parties: Party[];
  selectedYear: number;
  onNavigate: (tab: ViewTab) => void;
}

interface CustomYearlyTargetMap {
  [salespersonCode: string]: {
    targetSales: number;
    targetCollection: number;
  };
}

// Format amount as #,##/- e.g. 24,00,000/-
export const formatTkAmountWithSlash = (amount: number): string => {
  const rounded = Math.round(amount || 0);
  return `${rounded.toLocaleString('en-IN')}/-`;
};

export const MarketingTargetSection: React.FC<MarketingTargetSectionProps> = ({
  salespersons,
  storedBills,
  collections,
  parties,
  selectedYear,
  onNavigate
}) => {
  // Filter ONLY actual marketing persons (exclude accountants, managers, admins, showroom in-charge/staff, general users)
  const marketingPersons = useMemo(() => {
    return salespersons.filter((sp) => {
      if (sp.userType === 'marketing') return true;
      if (sp.userType === 'user') return false;

      const roleLower = (sp.role || '').toLowerCase();
      const designationLower = ((sp as any).designation || '').toLowerCase();
      const isExcluded = [
        'accountant',
        'manager',
        'admin',
        'office staff',
        'showroom in-charge',
        'in-charge',
        'approver',
        'auditor',
        'staff',
        'user'
      ].some((r) => roleLower.includes(r) || designationLower.includes(r));

      return !isExcluded;
    });
  }, [salespersons]);

  // Local yearly targets store with localStorage sync
  const [customTargets, setCustomTargets] = useState<CustomYearlyTargetMap>(() => {
    try {
      const saved = localStorage.getItem('polycables_salesperson_yearly_targets');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // fallback
    }
    const init: CustomYearlyTargetMap = {};
    marketingPersons.forEach((sp) => {
      init[sp.code] = {
        targetSales: sp.monthlyTargetSales ? sp.monthlyTargetSales * 12 : 24000000,
        targetCollection: sp.monthlyTargetCollection ? sp.monthlyTargetCollection * 12 : 20000000
      };
    });
    return init;
  });

  const [isEditingModalOpen, setIsEditingModalOpen] = useState(false);
  const [editingTargetForm, setEditingTargetForm] = useState<CustomYearlyTargetMap>({});
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  // Sync state if marketingPersons list changes
  useEffect(() => {
    setCustomTargets((prev) => {
      const next = { ...prev };
      let changed = false;
      marketingPersons.forEach((sp) => {
        if (!next[sp.code]) {
          next[sp.code] = {
            targetSales: sp.monthlyTargetSales ? sp.monthlyTargetSales * 12 : 24000000,
            targetCollection: sp.monthlyTargetCollection ? sp.monthlyTargetCollection * 12 : 20000000
          };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [marketingPersons]);

  // Open modal handler
  const handleOpenEditModal = () => {
    const copy: CustomYearlyTargetMap = {};
    marketingPersons.forEach((sp) => {
      const existing = customTargets[sp.code];
      copy[sp.code] = {
        targetSales: existing?.targetSales ?? (sp.monthlyTargetSales ? sp.monthlyTargetSales * 12 : 24000000),
        targetCollection: existing?.targetCollection ?? (sp.monthlyTargetCollection ? sp.monthlyTargetCollection * 12 : 20000000)
      };
    });
    setEditingTargetForm(copy);
    setIsEditingModalOpen(true);
  };

  const handleSaveTargets = () => {
    setCustomTargets(editingTargetForm);
    try {
      localStorage.setItem('polycables_salesperson_yearly_targets', JSON.stringify(editingTargetForm));
    } catch (e) {
      console.error('Failed to save yearly targets to localStorage:', e);
    }

    try {
      const existingSp = localStorage.getItem('polycables_salespersons');
      if (existingSp) {
        const parsed: Salesperson[] = JSON.parse(existingSp);
        const updated = parsed.map((sp) => {
          const t = editingTargetForm[sp.code];
          if (!t) return sp;
          return {
            ...sp,
            yearlyTargetSales: t.targetSales,
            monthlyTargetSales: Math.round(t.targetSales / 12),
            yearlyTargetCollection: t.targetCollection,
            monthlyTargetCollection: Math.round(t.targetCollection / 12)
          };
        });
        localStorage.setItem('polycables_salespersons', JSON.stringify(updated));
      }
    } catch (e) {}

    setSaveSuccessMsg(true);
    setTimeout(() => {
      setSaveSuccessMsg(false);
      setIsEditingModalOpen(false);
    }, 700);
  };

  // Yearly Bills and Collections
  const yearPrefix = `${selectedYear}-`;

  const yearBills = useMemo(() => {
    return storedBills.filter((b) => {
      const iso = parseDateToISO(b.header?.date || b.savedAt);
      return iso && iso.startsWith(yearPrefix);
    });
  }, [storedBills, yearPrefix]);

  const yearCollections = useMemo(() => {
    return collections.filter((c) => {
      const isSettlement =
        c.isYearClosingCollection ||
        (c.remarks && (c.remarks.includes('Year-End Settlement') || c.remarks.includes('Closing Settlement'))) ||
        (c.mrNo && (c.mrNo.startsWith('MR-CLOSE') || c.mrNo.startsWith('YE-Close')));
      if (isSettlement) return false;

      const iso = parseDateToISO(c.date || c.savedAt);
      return iso && iso.startsWith(yearPrefix);
    });
  }, [collections, yearPrefix]);

  // Performance calculations for each marketing person for the YEAR
  const salespersonPerformanceList = useMemo(() => {
    return marketingPersons.map((sp) => {
      const spCode = sp.code.trim().toUpperCase();
      const spNameLower = sp.name.trim().toLowerCase();

      // Find parties belonging to this salesperson
      const spParties = parties.filter(
        (p) => (p.salesmanCode || '').trim().toUpperCase() === spCode
      );
      const spPartyNames = new Set(spParties.map((p) => p.name.trim().toLowerCase()));

      // Bills in selected year matching this salesperson
      const spBills = yearBills.filter((b) => {
        const headerCode = (b.header?.salesmanCode || b.salesmanCode || '').trim().toUpperCase();
        if (headerCode === spCode) return true;
        const bParty = (b.partyName || b.header?.partyName || '').trim().toLowerCase();
        if (bParty && spPartyNames.has(bParty)) return true;
        const bSalesName = (b.salesmanName || '').trim().toLowerCase();
        if (bSalesName && bSalesName.includes(spNameLower)) return true;
        return false;
      });

      // Collections in selected year matching this salesperson
      const spColls = yearCollections.filter((c) => {
        const cCode = (c.salesmanCode || '').trim().toUpperCase();
        if (cCode === spCode) return true;
        const cParty = (c.partyName || '').trim().toLowerCase();
        if (cParty && spPartyNames.has(cParty)) return true;
        const cCollector = (c.collectedBy || '').trim().toLowerCase();
        if (cCollector && cCollector.includes(spNameLower)) return true;
        return false;
      });

      const achievedSales = spBills.reduce((sum, b) => sum + (b.grandTotal || b.netAmount || 0), 0);
      const achievedCollection = spColls.reduce((sum, c) => sum + (c.amount || 0), 0);

      const targetConfig = customTargets[sp.code] || {
        targetSales: sp.monthlyTargetSales ? sp.monthlyTargetSales * 12 : 24000000,
        targetCollection: sp.monthlyTargetCollection ? sp.monthlyTargetCollection * 12 : 20000000
      };

      const targetSales = targetConfig.targetSales || 1;
      const targetCollection = targetConfig.targetCollection || 1;

      const salesPct = Math.round((achievedSales / targetSales) * 100);
      const collPct = Math.round((achievedCollection / targetCollection) * 100);

      // Composite achievement score
      const overallScore = Math.round((salesPct * 0.55) + (collPct * 0.45));

      return {
        salesperson: sp,
        targetSales,
        achievedSales,
        salesPct,
        targetCollection,
        achievedCollection,
        collPct,
        overallScore,
        billsCount: spBills.length,
        collsCount: spColls.length,
        assignedPartiesCount: spParties.length
      };
    }).sort((a, b) => b.overallScore - a.overallScore);
  }, [marketingPersons, yearBills, yearCollections, parties, customTargets]);

  // Overall Marketing Team Yearly totals
  const teamTotals = useMemo(() => {
    let totTargetSales = 0;
    let totAchievedSales = 0;
    let totTargetColls = 0;
    let totAchievedColls = 0;

    salespersonPerformanceList.forEach((p) => {
      totTargetSales += p.targetSales;
      totAchievedSales += p.achievedSales;
      totTargetColls += p.targetCollection;
      totAchievedColls += p.achievedCollection;
    });

    const overallSalesPct = totTargetSales > 0 ? Math.round((totAchievedSales / totTargetSales) * 100) : 0;
    const overallCollsPct = totTargetColls > 0 ? Math.round((totAchievedColls / totTargetColls) * 100) : 0;

    return {
      totTargetSales,
      totAchievedSales,
      overallSalesPct,
      totTargetColls,
      totAchievedColls,
      overallCollsPct
    };
  }, [salespersonPerformanceList]);

  return (
    <div className="cyber-glass-card rounded-2xl p-4 sm:p-6 shadow-2xl space-y-5">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.10] pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded-xl">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base sm:text-lg font-black text-white">
                Marketing Target & Yearly Achievement
              </h2>
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-black px-2.5 py-0.5 rounded-full tracking-wider font-mono">
                Year {selectedYear}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Annual performance tracking for Sales Target and Collection Target across marketing personnel
            </p>
          </div>
        </div>

        {/* Action button to adjust yearly targets */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleOpenEditModal}
            className="px-3.5 py-2 bg-[#172554] hover:bg-[#1e3a8a] border border-sky-500/40 hover:border-sky-400 text-sky-200 text-xs font-bold rounded-xl flex items-center space-x-2 transition-all shadow cursor-pointer hover:scale-105"
          >
            <Sliders className="w-3.5 h-3.5 text-sky-400" />
            <span>Set Marketing Targets (Yearly)</span>
          </button>
        </div>
      </div>

      {/* Team Aggregated Achievement Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Team Sales Target (Yearly) */}
        <div className="cyber-glass-subcard border border-sky-400/25 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-sky-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4" />
              Team Sales Target (Yearly)
            </span>
            <span className="font-mono font-black text-sky-300 text-xs">
              {teamTotals.overallSalesPct}% Achieved
            </span>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-1">
            <div className="text-lg sm:text-xl font-black font-mono text-white">
              ৳ {formatTkAmountWithSlash(teamTotals.totAchievedSales)}
            </div>
            <div className="text-xs text-slate-400 font-mono">
              / ৳ {formatTkAmountWithSlash(teamTotals.totTargetSales)}
            </div>
          </div>
          <div className="w-full bg-white/[0.08] rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                teamTotals.overallSalesPct >= 100
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                  : teamTotals.overallSalesPct >= 70
                  ? 'bg-sky-400'
                  : 'bg-amber-400'
              }`}
              style={{ width: `${Math.min(100, teamTotals.overallSalesPct)}%` }}
            ></div>
          </div>
        </div>

        {/* Team Collection Target (Yearly) */}
        <div className="cyber-glass-subcard border border-emerald-400/25 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-emerald-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <DollarSign className="w-4 h-4" />
              Team Collection Target (Yearly)
            </span>
            <span className="font-mono font-black text-emerald-300 text-xs">
              {teamTotals.overallCollsPct}% Achieved
            </span>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-1">
            <div className="text-lg sm:text-xl font-black font-mono text-emerald-400">
              ৳ {formatTkAmountWithSlash(teamTotals.totAchievedColls)}
            </div>
            <div className="text-xs text-slate-400 font-mono">
              / ৳ {formatTkAmountWithSlash(teamTotals.totTargetColls)}
            </div>
          </div>
          <div className="w-full bg-slate-800/90 rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                teamTotals.overallCollsPct >= 100
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                  : teamTotals.overallCollsPct >= 70
                  ? 'bg-teal-400'
                  : 'bg-amber-400'
              }`}
              style={{ width: `${Math.min(100, teamTotals.overallCollsPct)}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Individual Marketing Persons Cards Grid (Only Marketing Persons Shown) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {salespersonPerformanceList.map((item, index) => {
          const { salesperson: sp, targetSales, achievedSales, salesPct, targetCollection, achievedCollection, collPct, overallScore } = item;
          const isTopPerformer = index === 0 && overallScore > 0;

          return (
            <div
              key={sp.id || sp.code}
              className={`cyber-glass-subcard rounded-2xl p-4 sm:p-4.5 space-y-3.5 transition-all relative overflow-hidden group hover:scale-[1.01] ${
                isTopPerformer
                  ? 'border-amber-400/60 shadow-[0_0_24px_rgba(245,158,11,0.18)]'
                  : 'border-white/[0.14] hover:border-cyan-400/40'
              }`}
            >
              {isTopPerformer && (
                <div className="absolute top-0 right-0 bg-gradient-to-l from-amber-500 to-amber-600 text-slate-950 text-[10px] font-black px-3 py-0.5 rounded-bl-xl flex items-center space-x-1 shadow-sm">
                  <Award className="w-3 h-3 fill-slate-950" />
                  <span>TOP PERFORMER</span>
                </div>
              )}

              {/* Marketing Person Identity */}
              <div className="flex items-center space-x-3 pt-1">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${
                    isTopPerformer
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                      : 'bg-sky-600/20 text-sky-400 border border-sky-500/30'
                  }`}
                >
                  {sp.code || 'M'}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-black text-white text-sm group-hover:text-amber-400 transition-colors">
                      {sp.name}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 font-mono">
                      #{sp.code}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {sp.role || sp.areaGroup || 'Marketing Executive'} • {item.assignedPartiesCount} Parties
                  </div>
                </div>
              </div>

              {/* 1. Sales Target (৳ Tk) Row */}
              <div className="space-y-1.5 bg-white/[0.04] p-3 rounded-xl border border-white/[0.10]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                    Sales Target:
                  </span>
                  <div className="text-right">
                    <span
                      className={`font-black text-xs font-mono ${
                        salesPct >= 100 ? 'text-emerald-400' : salesPct >= 70 ? 'text-sky-300' : 'text-amber-400'
                      }`}
                    >
                      {salesPct}%
                    </span>
                  </div>
                </div>
                <div className="flex items-baseline justify-between text-xs font-mono">
                  <span className="text-sky-400 font-bold">
                    {formatTkAmountWithSlash(achievedSales)}
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    / {formatTkAmountWithSlash(targetSales)}
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      salesPct >= 100 ? 'bg-emerald-400' : salesPct >= 70 ? 'bg-sky-400' : 'bg-amber-400'
                    }`}
                    style={{ width: `${Math.min(100, salesPct)}%` }}
                  ></div>
                </div>
              </div>

              {/* 2. Collection Target (৳ Tk) Row */}
              <div className="space-y-1.5 bg-white/[0.04] p-3 rounded-xl border border-white/[0.10]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    Collection Target:
                  </span>
                  <div className="text-right">
                    <span
                      className={`font-black text-xs font-mono ${
                        collPct >= 100 ? 'text-emerald-400' : collPct >= 70 ? 'text-teal-300' : 'text-amber-400'
                      }`}
                    >
                      {collPct}%
                    </span>
                  </div>
                </div>
                <div className="flex items-baseline justify-between text-xs font-mono">
                  <span className="text-emerald-400 font-bold">
                    {formatTkAmountWithSlash(achievedCollection)}
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    / {formatTkAmountWithSlash(targetCollection)}
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      collPct >= 100 ? 'bg-emerald-400' : collPct >= 70 ? 'bg-teal-400' : 'bg-amber-400'
                    }`}
                    style={{ width: `${Math.min(100, collPct)}%` }}
                  ></div>
                </div>
              </div>

              {/* Activity Counts Row */}
              <div className="flex items-center justify-between text-xs pt-1 text-slate-400 border-t border-slate-800/80">
                <div className="flex items-center space-x-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    Score: <strong className="text-slate-200 font-mono">{overallScore}%</strong>
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-[11px]">
                  <span className="text-slate-300">{item.billsCount} Bills</span>
                  <span>•</span>
                  <span className="text-slate-300">{item.collsCount} Collections</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Target Setting Modal (Only Marketing Persons Shown) */}
      {isEditingModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="cyber-glass-card rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/[0.10] pb-3">
              <div className="flex items-center space-x-2.5">
                <Sliders className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-base font-black text-white">
                    Set Marketing Targets (Yearly)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Define yearly Sales Target (৳ Tk) and Collection Target (৳ Tk) for marketing personnel (Year {selectedYear})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {saveSuccessMsg && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-emerald-300 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Yearly marketing targets saved successfully!</span>
              </div>
            )}

            <div className="space-y-4">
              {marketingPersons.map((sp) => {
                const formVal = editingTargetForm[sp.code] || {
                  targetSales: 24000000,
                  targetCollection: 20000000
                };

                return (
                  <div
                    key={sp.code}
                    className="p-4 bg-[#121c3b] border border-slate-800 rounded-xl space-y-3"
                  >
                    <div className="flex items-center justify-between font-bold text-slate-100 text-xs border-b border-slate-800/80 pb-2">
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded font-mono">
                          #{sp.code}
                        </span>
                        <span className="text-sm font-black text-white">{sp.name}</span>
                        <span className="text-slate-400 font-normal">({sp.role || sp.areaGroup || 'Marketing'})</span>
                      </div>
                      <span className="text-[11px] text-amber-400 font-mono">Marketing Person</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Sales Target (Monthly <-> Yearly) */}
                      <div className="space-y-2 cyber-glass-subcard p-3 rounded-xl">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-sky-400">
                            Sales Target (৳ Tk)
                          </label>
                          <span className="text-[10px] text-sky-300 font-mono">Monthly ↔ Yearly</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="block text-[10px] text-slate-400 font-semibold mb-0.5">Monthly (৳ / Mo)</span>
                            <input
                              type="number"
                              value={formVal.targetSales ? Math.round(formVal.targetSales / 12) : ''}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                setEditingTargetForm((prev) => ({
                                  ...prev,
                                  [sp.code]: { ...formVal, targetSales: val * 12 }
                                }));
                              }}
                              className="w-full px-2.5 py-1.5 cyber-glass-input rounded-lg text-emerald-300 font-mono text-xs font-bold focus:border-sky-400 focus:outline-none"
                              placeholder="Monthly ৳"
                            />
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-400 font-semibold mb-0.5">Yearly (৳ / Yr)</span>
                            <input
                              type="number"
                              value={formVal.targetSales || ''}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                setEditingTargetForm((prev) => ({
                                  ...prev,
                                  [sp.code]: { ...formVal, targetSales: val }
                                }));
                              }}
                              className="w-full px-2.5 py-1.5 cyber-glass-input rounded-lg text-white font-mono text-xs focus:border-sky-400 focus:outline-none"
                              placeholder="Yearly ৳"
                            />
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between pt-1 border-t border-slate-800">
                          <span>Yearly: <strong className="text-sky-300">{formatTkAmountWithSlash(formVal.targetSales)}</strong></span>
                          <span>Monthly: <strong className="text-amber-300">{formatTkAmountWithSlash(Math.round((formVal.targetSales || 0) / 12))}</strong></span>
                        </div>
                      </div>

                      {/* Collection Target (Monthly <-> Yearly) */}
                      <div className="space-y-2 cyber-glass-subcard p-3 rounded-xl">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-emerald-400">
                            Collection Target (৳ Tk)
                          </label>
                          <span className="text-[10px] text-emerald-300 font-mono">Monthly ↔ Yearly</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="block text-[10px] text-slate-400 font-semibold mb-0.5">Monthly (৳ / Mo)</span>
                            <input
                              type="number"
                              value={formVal.targetCollection ? Math.round(formVal.targetCollection / 12) : ''}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                setEditingTargetForm((prev) => ({
                                  ...prev,
                                  [sp.code]: { ...formVal, targetCollection: val * 12 }
                                }));
                              }}
                              className="w-full px-2.5 py-1.5 cyber-glass-input rounded-lg text-blue-300 font-mono text-xs font-bold focus:border-emerald-400 focus:outline-none"
                              placeholder="Monthly ৳"
                            />
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-400 font-semibold mb-0.5">Yearly (৳ / Yr)</span>
                            <input
                              type="number"
                              value={formVal.targetCollection || ''}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                setEditingTargetForm((prev) => ({
                                  ...prev,
                                  [sp.code]: { ...formVal, targetCollection: val }
                                }));
                              }}
                              className="w-full px-2.5 py-1.5 cyber-glass-input rounded-lg text-white font-mono text-xs focus:border-emerald-400 focus:outline-none"
                              placeholder="Yearly ৳"
                            />
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between pt-1 border-t border-slate-800">
                          <span>Yearly: <strong className="text-emerald-300">{formatTkAmountWithSlash(formVal.targetCollection)}</strong></span>
                          <span>Monthly: <strong className="text-amber-300">{formatTkAmountWithSlash(Math.round((formVal.targetCollection || 0) / 12))}</strong></span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsEditingModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTargets}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center space-x-1.5 shadow-lg shadow-emerald-600/30 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Save Targets</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
