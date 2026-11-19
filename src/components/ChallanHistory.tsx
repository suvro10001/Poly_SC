import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { DeliveryChallan, CompanyDetails } from '../types';
import { formatDateDDMMYY, parseDateToISO } from '../utils/dateUtils';
import { StandardPeriodFilterBar } from './StandardPeriodFilterBar';
import { StandardPeriodPreset, calculatePeriodDates } from '../utils/standardPeriodHelper';
import {
  History,
  Search,
  Calendar,
  Filter,
  FilterX,
  FileText,
  Download,
  Printer,
  Eye,
  CheckCircle2,
  Clock,
  Layers,
  ArrowRight,
  Plus,
  Edit2,
  Trash2,
  Upload,
  User,
  DollarSign,
  Boxes,
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  FileCheck,
  Tag
} from 'lucide-react';

export interface ChallanHistoryItem {
  id: string;
  timestamp: string; // ISO string
  challanId: string;
  challanNo: string;
  partyName: string;
  action: 'created' | 'updated' | 'billed' | 'converted' | 'copy_uploaded' | 'printed' | 'deleted';
  actionTitle: string;
  description: string;
  user?: string;
  salesperson?: string;
  totalQuantity?: number;
  totalAmount?: number;
  linkedBillNo?: string;
  details?: string;
}

interface ChallanHistoryProps {
  challans: DeliveryChallan[];
  company: CompanyDetails;
  onViewChallan?: (challan: DeliveryChallan) => void;
  onPrintChallan?: (challan: DeliveryChallan) => void;
  onEditChallan?: (challan: DeliveryChallan) => void;
}

export const ChallanHistory: React.FC<ChallanHistoryProps> = ({
  challans,
  company,
  onViewChallan,
  onPrintChallan,
  onEditChallan
}) => {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<'all' | 'created' | 'updated' | 'billed' | 'copy_uploaded' | 'printed' | 'deleted'>('all');
  const [datePreset, setDatePreset] = useState<StandardPeriodPreset>(() => {
    try { return (sessionStorage.getItem('polycables_challan_hist_preset') as StandardPeriodPreset) || 'all'; } catch { return 'all'; }
  });
  const [startDate, setStartDate] = useState(() => {
    try { return sessionStorage.getItem('polycables_challan_hist_start') || ''; } catch { return ''; }
  });
  const [endDate, setEndDate] = useState(() => {
    try { return sessionStorage.getItem('polycables_challan_hist_end') || ''; } catch { return ''; }
  });
  const [fromDateText, setFromDateText] = useState(() => {
    try { return sessionStorage.getItem('polycables_challan_hist_from_text') || ''; } catch { return ''; }
  });
  const [toDateText, setToDateText] = useState(() => {
    try { return sessionStorage.getItem('polycables_challan_hist_to_text') || ''; } catch { return ''; }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem('polycables_challan_hist_preset', datePreset);
      sessionStorage.setItem('polycables_challan_hist_start', startDate);
      sessionStorage.setItem('polycables_challan_hist_end', endDate);
      sessionStorage.setItem('polycables_challan_hist_from_text', fromDateText);
      sessionStorage.setItem('polycables_challan_hist_to_text', toDateText);
    } catch {}
  }, [datePreset, startDate, endDate, fromDateText, toDateText]);
  const [selectedParty, setSelectedParty] = useState('all');
  const [viewMode, setViewMode] = useState<'timeline' | 'table'>('timeline');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Compile history from persistent audit logs + synthesized milestones from existing & trashed challans
  const allHistoryLogs = useMemo<ChallanHistoryItem[]>(() => {
    let savedLogs: ChallanHistoryItem[] = [];
    try {
      const raw = localStorage.getItem('polycables_challan_history_logs');
      if (raw) {
        savedLogs = JSON.parse(raw);
      }
    } catch (e) {
      console.error('Failed to parse challan history logs', e);
    }

    // Synthesize history milestones for existing challans so history is never empty
    const synthesized: ChallanHistoryItem[] = [];

    challans.forEach((ch) => {
      // 1. Creation milestone
      const createTime = ch.savedAt || parseDateToISO(ch.date) || new Date().toISOString();
      synthesized.push({
        id: `hist-create-${ch.id}`,
        timestamp: createTime,
        challanId: ch.id,
        challanNo: ch.challanNo,
        partyName: ch.partyName,
        action: 'created',
        actionTitle: 'Challan Issued',
        description: `Issued Delivery Challan #${ch.challanNo} for ${ch.partyName} with ${ch.totalQuantity || 0} coils.`,
        salesperson: ch.salespersonName || ch.salesmanCode,
        totalQuantity: ch.totalQuantity,
        totalAmount: ch.totalAmount,
        details: `${ch.lines.length} item line(s) recorded.`
      });

      // 2. Updated milestone (if distinct from creation)
      if (ch.updatedAt && ch.updatedAt !== ch.savedAt) {
        synthesized.push({
          id: `hist-update-${ch.id}`,
          timestamp: ch.updatedAt,
          challanId: ch.id,
          challanNo: ch.challanNo,
          partyName: ch.partyName,
          action: 'updated',
          actionTitle: 'Challan Modified',
          description: `Updated items or terms on Challan #${ch.challanNo} for ${ch.partyName}.`,
          salesperson: ch.salespersonName || ch.salesmanCode,
          totalQuantity: ch.totalQuantity,
          totalAmount: ch.totalAmount
        });
      }

      // 3. Received Copy Attached milestone
      if (ch.receivedCopyDate || ch.receivedCopy) {
        synthesized.push({
          id: `hist-copy-${ch.id}`,
          timestamp: ch.receivedCopyDate || ch.updatedAt || createTime,
          challanId: ch.id,
          challanNo: ch.challanNo,
          partyName: ch.partyName,
          action: 'copy_uploaded',
          actionTitle: 'Proof of Delivery Attached',
          description: `Uploaded signed customer delivery receipt copy (${ch.receivedCopyName || 'Proof of Delivery'}).`,
          salesperson: ch.salespersonName || ch.salesmanCode
        });
      }

      // 4. Billed / Converted milestone
      if (ch.status === 'billed' || (ch.billedQuantity && ch.billedQuantity > 0)) {
        synthesized.push({
          id: `hist-billed-${ch.id}`,
          timestamp: ch.updatedAt || createTime,
          challanId: ch.id,
          challanNo: ch.challanNo,
          partyName: ch.partyName,
          action: 'billed',
          actionTitle: ch.status === 'billed' ? 'Fully Converted to Bill' : 'Partially Converted to Bill',
          description: `Billed ${ch.billedQuantity || ch.totalQuantity} of ${ch.totalQuantity} coils for ${ch.partyName}.`,
          salesperson: ch.salespersonName || ch.salesmanCode,
          totalQuantity: ch.billedQuantity || ch.totalQuantity,
          totalAmount: ch.billedAmount || ch.totalAmount,
          linkedBillNo: ch.linkedBillIds?.join(', ')
        });
      }
    });

    // Merge savedLogs and synthesized (deduplicating by id)
    const logMap = new Map<string, ChallanHistoryItem>();
    [...savedLogs, ...synthesized].forEach((item) => {
      logMap.set(item.id, item);
    });

    return Array.from(logMap.values()).sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime() || 0;
      const timeB = new Date(b.timestamp).getTime() || 0;
      return timeB - timeA;
    });
  }, [challans]);

  // Unique Parties for dropdown
  const uniqueParties = useMemo(() => {
    const map = new Map<string, number>();
    allHistoryLogs.forEach((l) => {
      const p = (l.partyName || '').trim();
      if (p) map.set(p, (map.get(p) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allHistoryLogs]);

  // Date Preset Handler
  const handleDatePresetChange = (preset: StandardPeriodPreset) => {
    setDatePreset(preset);
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
      setFromDateText('');
      setToDateText('');
      return;
    }
    if (preset === 'custom') {
      return;
    }
    const range = calculatePeriodDates(preset);
    setFromDateText(range.startDate);
    setToDateText(range.endDate);
    setStartDate(parseDateToISO(range.startDate) || '');
    setEndDate(parseDateToISO(range.endDate) || '');
  };

  const handleResetFilters = () => {
    setSearch('');
    setActionFilter('all');
    setDatePreset('all');
    setStartDate('');
    setEndDate('');
    setFromDateText('');
    setToDateText('');
    setSelectedParty('all');
  };

  const hasActiveFilters = Boolean(
    search.trim() ||
    actionFilter !== 'all' ||
    datePreset !== 'all' ||
    startDate ||
    endDate ||
    selectedParty !== 'all'
  );

  const activeFiltersCount = [
    Boolean(search.trim()),
    actionFilter !== 'all',
    datePreset !== 'all' || Boolean(startDate || endDate),
    selectedParty !== 'all'
  ].filter(Boolean).length;

  // Filtered History
  const filteredLogs = useMemo(() => {
    return allHistoryLogs.filter((l) => {
      // Action filter
      if (actionFilter !== 'all') {
        if (actionFilter === 'created' && l.action !== 'created') return false;
        if (actionFilter === 'updated' && l.action !== 'updated') return false;
        if (actionFilter === 'billed' && l.action !== 'billed' && l.action !== 'converted') return false;
        if (actionFilter === 'copy_uploaded' && l.action !== 'copy_uploaded') return false;
        if (actionFilter === 'printed' && l.action !== 'printed') return false;
        if (actionFilter === 'deleted' && l.action !== 'deleted') return false;
      }

      // Party filter
      if (selectedParty !== 'all' && (l.partyName || '').trim().toLowerCase() !== selectedParty.toLowerCase()) {
        return false;
      }

      // Date Range filter
      if (startDate || endDate) {
        const itemDateIso = l.timestamp ? l.timestamp.slice(0, 10) : '';
        if (itemDateIso) {
          if (startDate && itemDateIso < startDate) return false;
          if (endDate && itemDateIso > endDate) return false;
        }
      }

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const pName = (l.partyName || '').toLowerCase();
        const chNo = (l.challanNo || '').toLowerCase();
        const desc = (l.description || '').toLowerCase();
        const act = (l.actionTitle || '').toLowerCase();
        const sp = (l.salesperson || '').toLowerCase();
        const bNo = (l.linkedBillNo || '').toLowerCase();

        const matches =
          pName.includes(q) ||
          chNo.includes(q) ||
          desc.includes(q) ||
          act.includes(q) ||
          sp.includes(q) ||
          bNo.includes(q);

        if (!matches) return false;
      }

      return true;
    });
  }, [allHistoryLogs, actionFilter, selectedParty, startDate, endDate, search]);

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    const totalEvents = allHistoryLogs.length;
    const totalChallansIssued = challans.length;
    const totalCoilsDispatched = challans.reduce((s, c) => s + (c.totalQuantity || 0), 0);
    const totalBilledCoils = challans.reduce((s, c) => s + (c.billedQuantity || 0), 0);
    const totalValue = challans.reduce((s, c) => s + (c.totalAmount || 0), 0);
    const conversionRate = totalCoilsDispatched > 0 ? Math.round((totalBilledCoils / totalCoilsDispatched) * 100) : 0;

    return {
      totalEvents,
      totalChallansIssued,
      totalCoilsDispatched,
      totalBilledCoils,
      totalValue,
      conversionRate
    };
  }, [allHistoryLogs, challans]);

  // Export History to Excel
  const handleExportHistoryXLSX = () => {
    if (filteredLogs.length === 0) {
      showToast('No history records to export.');
      return;
    }

    const exportRows = filteredLogs.map((l, idx) => ({
      'SL#': idx + 1,
      'Timestamp': new Date(l.timestamp).toLocaleString('en-GB'),
      'Action': l.actionTitle,
      'Challan No': l.challanNo,
      'Customer / Party': l.partyName,
      'Salesperson': l.salesperson || '-',
      'Quantity (Coils)': l.totalQuantity || 0,
      'Amount (৳)': l.totalAmount || 0,
      'Description / Notes': l.description,
      'Linked Bill': l.linkedBillNo || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Challan_History');
    XLSX.writeFile(wb, `Challan_History_Audit_${formatDateDDMMYY(new Date().toISOString())}.xlsx`);
    showToast('Exported Challan History to Excel (.xlsx)');
  };

  const handleClearHistory = () => {
    if (confirm('Clear audit history logs? (Challans will remain safe in directory)')) {
      try {
        localStorage.removeItem('polycables_challan_history_logs');
        showToast('Challan history logs cleared.');
      } catch (e) {
        console.error(e);
      }
    }
  };

  const getActionBadge = (action: ChallanHistoryItem['action']) => {
    switch (action) {
      case 'created':
        return {
          icon: <Plus className="w-3.5 h-3.5" />,
          label: 'Created',
          color: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
        };
      case 'updated':
        return {
          icon: <Edit2 className="w-3.5 h-3.5" />,
          label: 'Updated',
          color: 'bg-amber-500/20 text-amber-200 border-amber-400/40'
        };
      case 'billed':
      case 'converted':
        return {
          icon: <CheckCircle2 className="w-3.5 h-3.5" />,
          label: 'Billed',
          color: 'bg-cyan-500/20 text-cyan-200 border-cyan-400/40'
        };
      case 'copy_uploaded':
        return {
          icon: <Upload className="w-3.5 h-3.5" />,
          label: 'Proof Attached',
          color: 'bg-teal-500/20 text-teal-200 border-teal-400/40'
        };
      case 'printed':
        return {
          icon: <Printer className="w-3.5 h-3.5" />,
          label: 'Printed',
          color: 'bg-slate-700/60 text-slate-200 border-cyan-500/30'
        };
      case 'deleted':
        return {
          icon: <Trash2 className="w-3.5 h-3.5" />,
          label: 'Trashed',
          color: 'bg-rose-500/20 text-rose-200 border-rose-400/40'
        };
      default:
        return {
          icon: <History className="w-3.5 h-3.5" />,
          label: 'Activity',
          color: 'bg-slate-700/60 text-slate-200 border-cyan-500/30'
        };
    }
  };

  return (
    <div className="space-y-4 font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl shadow-2xl border border-emerald-500 flex items-center space-x-2 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-200" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="cyber-glass-card text-white p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="bg-[#081b28] border border-cyan-500/25 text-cyan-200 text-xs px-2.5 py-0.5 rounded font-medium">
              {allHistoryLogs.length} Historical Events
            </span>
            <span className="bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 text-xs px-2.5 py-0.5 rounded font-medium flex items-center space-x-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>{summaryMetrics.conversionRate}% Invoiced Conversion</span>
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mt-1 flex items-center space-x-2">
            <History className="w-6 h-6 text-cyan-300" />
            <span>Delivery Challan History & Audit Trail</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Complete lifecycle timeline of all delivery challans, dispatches, revisions, and invoice conversions
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Switcher */}
          <div className="flex items-center bg-[#061520] rounded-lg p-1 border border-cyan-500/25 space-x-1 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('timeline')}
              className={`px-3 py-1.5 rounded font-bold transition-all cursor-pointer ${
                viewMode === 'timeline'
                  ? 'bg-[#0e2d42] text-cyan-200 border border-cyan-400/50 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Timeline
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded font-bold transition-all cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-[#0e2d42] text-cyan-200 border border-cyan-400/50 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Table
            </button>
          </div>

          <button
            onClick={handleExportHistoryXLSX}
            className="bg-cyan-400 hover:bg-cyan-300 text-slate-950 px-3.5 py-2 rounded-lg text-xs font-black flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
            title="Export full history to Excel"
          >
            <Download className="w-4 h-4" />
            <span>Export (.xlsx)</span>
          </button>

          <button
            onClick={handleClearHistory}
            className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/40 px-3 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
            title="Clear history logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Logs</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="cyber-glass-subcard p-3.5 rounded-xl border border-cyan-500/25 flex items-center space-x-3 text-white">
          <div className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/35 p-2.5 rounded-lg">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Challans Issued</div>
            <div className="text-base font-bold text-white">
              {summaryMetrics.totalChallansIssued}{' '}
              <span className="text-xs font-normal text-slate-400">Challans</span>
            </div>
          </div>
        </div>

        <div className="cyber-glass-subcard p-3.5 rounded-xl border border-cyan-500/25 flex items-center space-x-3 text-white">
          <div className="bg-cyan-500/20 text-cyan-300 border border-cyan-400/35 p-2.5 rounded-lg">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Total Goods Dispatched</div>
            <div className="text-base font-bold text-cyan-200">
              {summaryMetrics.totalCoilsDispatched.toLocaleString()}{' '}
              <span className="text-xs font-normal text-slate-400">Coils</span>
            </div>
          </div>
        </div>

        <div className="cyber-glass-subcard p-3.5 rounded-xl border border-cyan-500/25 flex items-center space-x-3 text-white">
          <div className="bg-indigo-500/20 text-indigo-300 border border-indigo-400/35 p-2.5 rounded-lg">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Billed / Invoiced Volume</div>
            <div className="text-base font-bold text-indigo-200">
              {summaryMetrics.totalBilledCoils.toLocaleString()}{' '}
              <span className="text-xs font-normal text-slate-400">
                ({summaryMetrics.conversionRate}%)
              </span>
            </div>
          </div>
        </div>

        <div className="cyber-glass-subcard p-3.5 rounded-xl border border-cyan-500/25 flex items-center space-x-3 text-white">
          <div className="bg-amber-500/20 text-amber-300 border border-amber-400/35 p-2.5 rounded-lg">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Total Challan Value</div>
            <div className="text-base font-bold text-emerald-300">
              ৳{summaryMetrics.totalValue.toLocaleString('en-IN')}
            </div>
          </div>
        </div>
      </div>

      {/* SEARCH AND FILTER BAR (CYBER TEAL GLASS) */}
      <div className="bg-[#081e2d]/85 backdrop-blur-xl text-white rounded-2xl shadow-lg border border-cyan-500/25 p-2.5 px-3.5 space-y-2.5 text-xs">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search challan history by party, challan no, salesman, bill no..."
              className="w-full pl-8 pr-7 py-1.5 h-[34px] text-xs bg-[#061520]/90 border border-cyan-500/30 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-400 text-white placeholder-slate-400 font-medium"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Standard Period Filter Presets & Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <StandardPeriodFilterBar
              period={datePreset}
              onSelectPeriod={handleDatePresetChange}
              customStartDate={fromDateText}
              customEndDate={toDateText}
              onCustomStartDateChange={(val) => {
                setFromDateText(val);
                setDatePreset('custom');
                setStartDate(val.trim() ? (parseDateToISO(val) || '') : '');
              }}
              onCustomEndDateChange={(val) => {
                setToDateText(val);
                setDatePreset('custom');
                setEndDate(val.trim() ? (parseDateToISO(val) || '') : '');
              }}
              theme="dark"
            />

            {/* Expand Filters Button */}
            <button
              type="button"
              onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
              className={`px-2.5 py-1 h-[34px] rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow-2xs shrink-0 ${
                isFilterPanelOpen
                  ? 'bg-[#0e2d42] text-cyan-200 border border-cyan-400/60'
                  : 'bg-[#061520]/90 text-cyan-100 hover:bg-cyan-500/15 border border-cyan-500/30'
              }`}
              title="More filter options"
            >
              <Filter className="w-3.5 h-3.5 text-cyan-300" />
              <span>More Filters</span>
              {activeFiltersCount > 0 && (
                <span className="bg-cyan-400 text-slate-950 text-[10px] font-extrabold px-1.5 py-0.2 rounded-full">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1 h-[34px] text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/35 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
                title="Reset all filters"
              >
                <FilterX className="w-3.5 h-3.5 text-rose-300" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Advanced Filters */}
        {isFilterPanelOpen && (
          <div className="pt-3 border-t border-cyan-500/20 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Party Dropdown */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Filter by Party ({uniqueParties.length})
                </label>
                <select
                  value={selectedParty}
                  onChange={(e) => setSelectedParty(e.target.value)}
                  className="w-full text-xs font-semibold bg-[#061520] border border-cyan-500/30 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:ring-1 focus:ring-cyan-400"
                >
                  <option value="all">All Parties</option>
                  {uniqueParties.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} ({p.count})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Action Filter Chips */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-cyan-500/15">
              <div className="flex items-center space-x-1.5 overflow-x-auto">
                <span className="text-[11px] font-bold text-slate-300 mr-1">Event Type:</span>
                {(
                  [
                    { key: 'all', label: 'All Events' },
                    { key: 'created', label: 'Created' },
                    { key: 'updated', label: 'Modified' },
                    { key: 'billed', label: 'Billed' },
                    { key: 'copy_uploaded', label: 'Proof Attached' },
                    { key: 'printed', label: 'Printed' },
                    { key: 'deleted', label: 'Trashed' }
                  ] as const
                ).map((act) => (
                  <button
                    key={act.key}
                    type="button"
                    onClick={() => setActionFilter(act.key)}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      actionFilter === act.key
                        ? 'bg-[#0e2d42] text-cyan-200 border border-cyan-400/60 font-bold shadow-xs'
                        : 'bg-[#081b28] text-slate-300 border border-cyan-500/20 hover:bg-[#0e2a3d]'
                    }`}
                  >
                    {act.label}
                  </button>
                ))}
              </div>

              {hasActiveFilters && (
                <div className="text-xs text-cyan-200 font-semibold flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Showing {filteredLogs.length} matched event(s)</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* HISTORY CONTENT VIEW */}
      {filteredLogs.length === 0 ? (
        <div className="cyber-glass-card rounded-2xl p-12 text-center text-slate-400 space-y-3">
          <History className="w-12 h-12 mx-auto text-cyan-300/40" />
          <h3 className="text-sm font-bold text-white">No Challan History Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {hasActiveFilters
              ? 'No historical logs match your search and filter criteria.'
              : 'Issue new delivery challans to populate the audit trail.'}
          </p>
        </div>
      ) : viewMode === 'timeline' ? (
        /* TIMELINE VIEW */
        <div className="cyber-glass-card rounded-2xl p-5">
          <div className="relative border-l-2 border-cyan-500/30 ml-4 pl-6 space-y-6">
            {filteredLogs.map((item) => {
              const badge = getActionBadge(item.action);
              const matchedChallan = challans.find((c) => c.id === item.challanId || c.challanNo === item.challanNo);

              return (
                <div key={item.id} className="relative group">
                  {/* Timeline dot */}
                  <div
                    className={`absolute -left-[35px] top-1 w-6 h-6 rounded-full border-2 border-[#071824] shadow-xs flex items-center justify-center text-xs ${
                      badge.color
                    }`}
                  >
                    {badge.icon}
                  </div>

                  {/* Card */}
                  <div className="cyber-glass-subcard hover:border-cyan-400/50 border border-cyan-500/25 rounded-xl p-4 transition-all space-y-2 text-white">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badge.color}`}>
                          {badge.label}
                        </span>
                        <span className="font-bold text-white text-xs">
                          {item.actionTitle}
                        </span>
                        <span className="font-mono font-bold text-emerald-200 bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-400/35 text-xs">
                          #{item.challanNo}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1.5 text-[11px] text-slate-400 font-mono">
                        <Clock className="w-3.5 h-3.5 text-cyan-300/70" />
                        <span>{new Date(item.timestamp).toLocaleString('en-GB')}</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-200 font-medium">
                      {item.description}
                    </p>

                    {/* Metadata Sub-row */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-cyan-500/20 text-xs text-slate-300">
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-1">
                          <User className="w-3.5 h-3.5 text-cyan-300/70" />
                          <span className="font-bold text-white">{item.partyName}</span>
                        </div>
                        {item.salesperson && (
                          <div className="text-[11px] text-slate-400">
                            Salesman: <span className="font-medium text-slate-200">{item.salesperson}</span>
                          </div>
                        )}
                        {item.totalQuantity !== undefined && item.totalQuantity > 0 && (
                          <div className="text-[11px] font-mono font-bold text-cyan-200 bg-cyan-500/20 border border-cyan-400/30 px-2 py-0.5 rounded">
                            {item.totalQuantity} Coils
                          </div>
                        )}
                        {item.totalAmount !== undefined && item.totalAmount > 0 && (
                          <div className="text-[11px] font-mono font-bold text-emerald-200 bg-emerald-500/20 border border-emerald-400/30 px-2 py-0.5 rounded">
                            ৳{item.totalAmount.toLocaleString('en-IN')}
                          </div>
                        )}
                      </div>

                      {/* Action links */}
                      {matchedChallan && (
                        <div className="flex items-center space-x-2">
                          {onViewChallan && (
                            <button
                              type="button"
                              onClick={() => onViewChallan(matchedChallan)}
                              className="text-xs text-cyan-300 hover:text-cyan-200 font-bold flex items-center space-x-1 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Challan</span>
                            </button>
                          )}
                          {onPrintChallan && (
                            <button
                              type="button"
                              onClick={() => onPrintChallan(matchedChallan)}
                              className="text-xs text-amber-300 hover:text-amber-200 font-bold flex items-center space-x-1 cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>Print</span>
                            </button>
                          )}
                          {onEditChallan && (
                            <button
                              type="button"
                              onClick={() => onEditChallan(matchedChallan)}
                              className="text-xs text-emerald-300 hover:text-emerald-200 font-bold flex items-center space-x-1 cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="cyber-glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 font-bold uppercase tracking-wider text-[11px]">
                  <th className="p-3 w-40">Date & Time</th>
                  <th className="p-3 w-32">Event Type</th>
                  <th className="p-3 w-28 text-center">Challan No</th>
                  <th className="p-3">Customer / Party</th>
                  <th className="p-3 min-w-[240px]">Description</th>
                  <th className="p-3 w-28 text-right">Quantity</th>
                  <th className="p-3 w-32 text-right">Amount</th>
                  <th className="p-3 w-28 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200 font-sans">
                {filteredLogs.map((item) => {
                  const badge = getActionBadge(item.action);
                  const matchedChallan = challans.find((c) => c.id === item.challanId || c.challanNo === item.challanNo);

                  return (
                    <tr key={item.id} className="hover:bg-cyan-500/[0.06] transition-colors">
                      <td className="p-3 font-mono text-slate-300 whitespace-nowrap">
                        {new Date(item.timestamp).toLocaleString('en-GB')}
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold border ${badge.color}`}>
                          {badge.icon}
                          <span>{badge.label}</span>
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-emerald-300">
                        #{item.challanNo}
                      </td>
                      <td className="p-3 font-bold text-white">
                        <div>{item.partyName}</div>
                        {item.salesperson && (
                          <div className="text-[10px] font-normal text-slate-400">
                            Mkt: {item.salesperson}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-slate-200 font-medium">
                        {item.description}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-cyan-200">
                        {item.totalQuantity ? `${item.totalQuantity} Coils` : '-'}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-300">
                        {item.totalAmount ? `৳${item.totalAmount.toLocaleString('en-IN')}` : '-'}
                      </td>
                      <td className="p-3 text-center">
                        {matchedChallan ? (
                          <div className="flex items-center justify-center space-x-1">
                            {onViewChallan && (
                              <button
                                onClick={() => onViewChallan(matchedChallan)}
                                className="p-1 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/25 rounded transition-colors cursor-pointer"
                                title="View Challan Details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {onPrintChallan && (
                              <button
                                onClick={() => onPrintChallan(matchedChallan)}
                                className="p-1 bg-cyan-400/20 hover:bg-cyan-400/30 text-amber-300 border border-cyan-400/40 rounded transition-colors cursor-pointer"
                                title="Print Pad Format"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[10px] italic">Archived</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
