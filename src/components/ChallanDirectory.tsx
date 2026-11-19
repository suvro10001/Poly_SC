import React, { useState, useMemo } from 'react';
import { useChallan } from '../context/ChallanContext';
import { Challan } from '../types';
import {
  Search,
  RotateCcw,
  Lock,
  Unlock,
  CheckCircle2,
  Clock,
  FileText,
  Printer,
  ChevronRight,
  Plus,
  Eye,
  AlertCircle,
  Truck,
  Building,
  Calendar,
  Sparkles,
} from 'lucide-react';

interface ChallanDirectoryProps {
  onOpenCreate: () => void;
  onViewChallan: (challan: Challan) => void;
  onGenerateBill: (challan: Challan) => void;
  onPrintChallan: (challan: Challan) => void;
}

export const ChallanDirectory: React.FC<ChallanDirectoryProps> = ({
  onOpenCreate,
  onViewChallan,
  onGenerateBill,
  onPrintChallan,
}) => {
  const {
    challans,
    unbilledChallansCount,
    totalChallansCount,
    pendingCount,
    partialCount,
    fullyBilledCount,
    generateBillFromChallan,
    unlockChallan,
    deleteChallan,
  } = useChallan();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'PARTIAL' | 'BILLED'>('ALL');
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Search Reset Functionality (as requested)
  const handleResetSearch = () => {
    setSearchQuery('');
    setStatusFilter('ALL');
  };

  // Filtered challans
  const filteredChallans = useMemo(() => {
    return challans.filter(c => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        c.challanNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.deliveryAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.vehicleNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.items.some(it => it.name.toLowerCase().includes(searchQuery.toLowerCase()) || it.specifications.toLowerCase().includes(searchQuery.toLowerCase()));

      let matchesStatus = true;
      if (statusFilter === 'PENDING') matchesStatus = c.status === 'Pending';
      if (statusFilter === 'PARTIAL') matchesStatus = c.status === 'Partially Billed';
      if (statusFilter === 'BILLED') matchesStatus = c.status === 'Fully Billed';

      return matchesSearch && matchesStatus;
    });
  }, [challans, searchQuery, statusFilter]);

  // Quick 1-click full bill handler to test requirement
  const handleQuickFullBill = (challan: Challan) => {
    try {
      const inv = generateBillFromChallan(challan.id);
      setActionSuccessMsg(
        `✓ Challan ${challan.challanNo} is now FULLY BILLED (Invoice ${inv.invoiceNo}). Directory count updated and list locked in read-only mode!`
      );
      setTimeout(() => setActionSuccessMsg(null), 6000);
    } catch (e: any) {
      console.error(e);
    }
  };

  return (
    <div id="challan-directory-section" className="space-y-6 text-white">
      {/* Top Banner */}
      <div className="cyber-glass-card rounded-2xl p-5 border border-cyan-500/25">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-400/35 text-xs font-semibold uppercase tracking-wider">
                Automated Directory Lifecycle
              </span>
              <span className="text-xs text-slate-300">
                Active Unbilled Count: <strong className="text-white">({unbilledChallansCount})</strong>
              </span>
            </div>
            <h2 className="text-lg font-bold text-white">
              Challan Directory & Invoicing Status
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              When any challan is <strong>Fully Billed</strong>, it is excluded from the active count{' '}
              <span className="bg-[#061520] border border-cyan-500/30 px-1.5 py-0.5 rounded text-amber-200 font-mono">
                Challan Directory ({unbilledChallansCount})
              </span>{' '}
              and its record switches to <strong>Locked Read-Only Mode</strong> to prevent post-billing changes.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="cyber-glass-subcard rounded-xl px-4 py-2 text-center border border-cyan-500/25">
              <p className="text-xs text-slate-300">Unbilled Count</p>
              <p className="text-2xl font-black text-cyan-200">{unbilledChallansCount}</p>
            </div>
            <div className="cyber-glass-subcard rounded-xl px-4 py-2 text-center border border-emerald-400/30">
              <p className="text-xs text-slate-300">Locked / Billed</p>
              <p className="text-2xl font-black text-emerald-300">{fullyBilledCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Success Notification Alert */}
      {actionSuccessMsg && (
        <div
          id="action-success-banner"
          className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-400/35 text-emerald-200 flex items-start justify-between gap-3 shadow-xs animate-in fade-in duration-200"
        >
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0 mt-0.5" />
            <div className="text-xs font-medium leading-relaxed">{actionSuccessMsg}</div>
          </div>
          <button
            onClick={() => setActionSuccessMsg(null)}
            className="text-emerald-200 hover:text-white text-xs font-semibold px-2 py-0.5 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter & Search Bar with RESET button */}
      <div className="bg-[#0b2334]/85 backdrop-blur-xl rounded-2xl border border-cyan-500/25 p-4 shadow-lg space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search Input with Clear Button */}
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-cyan-400/70 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="challan-search-input"
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search challan no, client, item name, vehicle..."
              className="w-full pl-9 pr-8 py-2 text-sm bg-[#061520] border border-cyan-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400/30 focus:border-cyan-400 transition-all text-white placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                id="challan-search-clear-btn"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 text-xs font-bold cursor-pointer"
                title="Clear Search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto no-scrollbar">
            <button
              id="filter-all-btn"
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all border cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-[#0e2d42] text-cyan-200 border-cyan-400/60'
                  : 'bg-[#081b28] text-slate-300 border-cyan-500/25 hover:bg-[#0e2a3d]'
              }`}
            >
              All ({totalChallansCount})
            </button>

            <button
              id="filter-pending-btn"
              onClick={() => setStatusFilter('PENDING')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all border cursor-pointer ${
                statusFilter === 'PENDING'
                  ? 'bg-amber-500/25 text-amber-200 border-amber-400/60'
                  : 'bg-[#081b28] text-amber-200/80 border-cyan-500/25 hover:bg-[#0e2a3d]'
              }`}
            >
              Pending / Unbilled ({pendingCount})
            </button>

            <button
              id="filter-partial-btn"
              onClick={() => setStatusFilter('PARTIAL')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all border cursor-pointer ${
                statusFilter === 'PARTIAL'
                  ? 'bg-[#0e2d42] text-cyan-200 border-cyan-400/60'
                  : 'bg-[#081b28] text-cyan-200/80 border-cyan-500/25 hover:bg-[#0e2a3d]'
              }`}
            >
              Partially Billed ({partialCount})
            </button>

            <button
              id="filter-billed-btn"
              onClick={() => setStatusFilter('BILLED')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all border flex items-center gap-1 cursor-pointer ${
                statusFilter === 'BILLED'
                  ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/60'
                  : 'bg-[#081b28] text-emerald-200/80 border-cyan-500/25 hover:bg-[#0e2a3d]'
              }`}
            >
              <Lock className="w-3 h-3" />
              <span>Fully Billed [Locked] ({fullyBilledCount})</span>
            </button>

            {/* Reset Filter Button */}
            {(searchQuery || statusFilter !== 'ALL') && (
              <button
                id="reset-filter-all-btn"
                onClick={handleResetSearch}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 rounded-lg transition-colors cursor-pointer"
                title="Reset search and filters"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Challans Table & List */}
      <div className="cyber-glass-card rounded-2xl overflow-hidden">
        {/* Table Header / Subtitle */}
        <div className="px-5 py-3.5 border-b border-cyan-500/25 cyber-glass-header flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white">
              Delivery Challans Register
            </h3>
            <span className="text-xs text-slate-400">
              ({filteredChallans.length} of {totalChallansCount} records)
            </span>
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-3">
            <span className="flex items-center gap-1 text-emerald-300 font-medium">
              <Lock className="w-3 h-3 text-emerald-400" /> Locked = Read-Only Mode
            </span>
          </div>
        </div>

        {/* Empty State */}
        {filteredChallans.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 flex items-center justify-center mx-auto">
              <FileText className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-white">No Challans Found</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No delivery challans match your search query or filter. Click reset to view all items or create a new delivery challan.
            </p>
            <div className="pt-2 flex items-center justify-center gap-2">
              <button
                onClick={handleResetSearch}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-200 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 rounded-lg cursor-pointer"
              >
                Reset Search Filters
              </button>
              <button
                onClick={onOpenCreate}
                className="px-3.5 py-1.5 text-xs font-black text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg cursor-pointer"
              >
                + Create Challan
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table id="challan-directory-table" className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-cyan-500/30 bg-[#0c2638] text-[11px] font-bold text-cyan-200 uppercase tracking-wider">
                  <th className="py-3 px-4">Challan No & Date</th>
                  <th className="py-3 px-4">Client & Destination</th>
                  <th className="py-3 px-4">Poly Items Summary</th>
                  <th className="py-3 px-4">Dispatched Value</th>
                  <th className="py-3 px-4 text-center">Status & Lock Mode</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-xs text-slate-200">
                {filteredChallans.map(challan => {
                  const isLocked = challan.status === 'Fully Billed';
                  const totalDispatchedValue = challan.items.reduce(
                    (acc, it) => acc + it.dispatchedQty * it.unitPrice,
                    0
                  );
                  const totalDispatchedQty = challan.items.reduce((acc, it) => acc + it.dispatchedQty, 0);
                  const totalBilledQty = challan.items.reduce((acc, it) => acc + it.billedQty, 0);
                  const billingPercentage = totalDispatchedQty > 0
                    ? Math.round((totalBilledQty / totalDispatchedQty) * 100)
                    : 0;

                  return (
                    <tr
                      key={challan.id}
                      id={`challan-row-${challan.id}`}
                      className={`transition-colors ${
                        isLocked
                          ? 'bg-[#081b28]/60 hover:bg-cyan-500/[0.06]'
                          : 'hover:bg-cyan-500/[0.06]'
                      }`}
                    >
                      {/* Column 1: Challan No & Date */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          {isLocked ? (
                            <span
                              className="p-1 rounded bg-slate-500/20 text-slate-300 border border-slate-400/30"
                              title="Locked in Read-Only Mode (Fully Billed)"
                            >
                              <Lock className="w-3.5 h-3.5 text-slate-300" />
                            </span>
                          ) : (
                            <span className="p-1 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                              <FileText className="w-3.5 h-3.5" />
                            </span>
                          )}
                          <div>
                            <span className="font-bold text-white text-sm block">
                              {challan.challanNo}
                            </span>
                            <span className="text-[11px] text-slate-400 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {challan.date}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Column 2: Client & Destination */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="space-y-0.5">
                          <p className="font-semibold text-white truncate">
                            {challan.clientName}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                            <Truck className="w-3 h-3 text-cyan-400/70 shrink-0" />
                            <span>{challan.vehicleNo || 'Self Pickup'}</span>
                          </p>
                        </div>
                      </td>

                      {/* Column 3: Poly Items Summary */}
                      <td className="py-3.5 px-4 max-w-sm">
                        <div className="space-y-1">
                          {challan.items.slice(0, 2).map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="font-medium text-slate-200 truncate" title={item.name}>
                                • {item.name}
                              </span>
                              <span className="font-semibold text-cyan-200 shrink-0">
                                {item.dispatchedQty} {item.unit}
                              </span>
                            </div>
                          ))}
                          {challan.items.length > 2 && (
                            <p className="text-[10px] text-cyan-300 font-medium">
                              +{challan.items.length - 2} more item(s)
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Column 4: Dispatched Value */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <p className="font-bold text-white">
                            ₹{totalDispatchedValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </p>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                            <div className="w-16 h-1.5 bg-[#061520] border border-cyan-500/25 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  isLocked ? 'bg-emerald-400' : 'bg-cyan-400'
                                }`}
                                style={{ width: `${billingPercentage}%` }}
                              />
                            </div>
                            <span>{billingPercentage}% Billed</span>
                          </div>
                        </div>
                      </td>

                      {/* Column 5: Status & Lock Mode */}
                      <td className="py-3.5 px-4 text-center">
                        {isLocked ? (
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-200 border border-emerald-400/35">
                              <Lock className="w-3 h-3 text-emerald-300" />
                              <span>Fully Billed</span>
                            </span>
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-tight">
                              🔒 Read-Only Locked
                            </span>
                          </div>
                        ) : challan.status === 'Partially Billed' ? (
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-200 border border-cyan-400/35">
                              <Clock className="w-3 h-3 text-cyan-300" />
                              <span>Partially Billed</span>
                            </span>
                            <span className="text-[10px] text-slate-400">
                              Remaining to bill
                            </span>
                          </div>
                        ) : (
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-200 border border-amber-400/35">
                              <AlertCircle className="w-3 h-3 text-amber-300" />
                              <span>Unbilled</span>
                            </span>
                            <span className="text-[10px] text-amber-300 font-medium">
                              Active in Directory
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Column 6: Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            id={`view-challan-btn-${challan.id}`}
                            onClick={() => onViewChallan(challan)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-200 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 rounded-md transition-colors cursor-pointer"
                            title={isLocked ? 'View Locked Challan in Read-Only Mode' : 'View / Edit Challan'}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{isLocked ? 'View (Locked)' : 'View'}</span>
                          </button>

                          {!isLocked ? (
                            <button
                              id={`generate-bill-btn-${challan.id}`}
                              onClick={() => handleQuickFullBill(challan)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-black text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-md shadow-2xs transition-colors cursor-pointer"
                              title="Generate Full Bill immediately and lock this challan (Updates directory count to 0)"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Full Bill</span>
                            </button>
                          ) : (
                            <button
                              id={`print-challan-btn-${challan.id}`}
                              onClick={() => onPrintChallan(challan)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-200 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 rounded-md transition-colors cursor-pointer"
                              title="Print Delivery Challan"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>Print</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer info bar */}
        <div className="px-5 py-3 border-t border-cyan-500/20 bg-[#071824]/90 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2">
          <p>
            * When a challan is fully billed, it automatically enters <strong>Locked Read-Only Mode</strong> and is decremented from the directory counter.
          </p>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            <span>Fully Billed = Directory (0) contribution</span>
          </div>
        </div>
      </div>
    </div>
  );
};
