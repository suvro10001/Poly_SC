import React, { useState, useMemo } from 'react';
import {
  Requisition,
  Item,
  Party,
  Salesperson,
  CompanyDetails,
  StoredBill,
  BranchLocation,
  AuthUser,
  DeliveryChallan,
  ChallanLineItem
} from '../types';
import {
  Factory,
  Search,
  Filter,
  CheckCircle2,
  Truck,
  Package,
  Calendar,
  Building2,
  User,
  Printer,
  Download,
  AlertTriangle,
  ArrowRight,
  Eye,
  X,
  RefreshCw,
  Clock,
  Sparkles,
  ArrowLeft,
  Layers,
  ChevronDown,
  Check,
  FileText,
  Save
} from 'lucide-react';
import { formatDateDDMMYY } from '../utils/dateUtils';
import { getBranchAddressDetails, isAdminMarketingLabel } from '../utils/branchAccess';
import { PolyCablesLogo } from './PolyCablesLogo';
import { formatChallanLineColors, formatDisplayUnit } from '../utils/stockHelper';
import { matchesFlexibleSearch } from '../utils/searchHelper';
import * as XLSX from 'xlsx';

export const isRequisitionFullyDelivered = (req: Requisition): boolean => {
  if (!req) return false;
  if (req.stage === 'converted_to_bill' || req.stage === 'goods_received' || req.isLocked) return true;
  if (typeof req.percentage === 'number' && req.percentage >= 100) return true;
  if (
    req.totalRequestedQty > 0 &&
    req.totalDeliveredQty !== undefined &&
    req.totalDeliveredQty >= req.totalRequestedQty
  ) {
    return true;
  }
  return false;
};

export const isRequisitionApprovedForFactory = (req: Requisition): boolean => {
  if (!req) return false;
  return Boolean(
    req.isApproved ||
    req.stage === 'sent_to_factory' ||
    req.stage === 'factory_dispatched' ||
    req.stage === 'factory_received' ||
    req.stage === 'goods_received' ||
    req.stage === 'converted_to_bill'
  );
};

interface FactoryPageProps {
  factorySubTab: 'approved_history' | 'delivered';
  setFactorySubTab: (tab: 'approved_history' | 'delivered') => void;
  requisitions: Requisition[];
  setRequisitions: React.Dispatch<React.SetStateAction<Requisition[]>>;
  items: Item[];
  parties: Party[];
  salespersons: Salesperson[];
  company: CompanyDetails;
  storedBills?: StoredBill[];
  setStoredBills?: React.Dispatch<React.SetStateAction<StoredBill[]>>;
  currentUser?: AuthUser | null;
  branches?: BranchLocation[];
  onSyncCloud?: (patch: Record<string, any>, immediate?: boolean) => void;
  onBack?: () => void;
  onClose?: () => void;
}

export const FactoryPage: React.FC<FactoryPageProps> = ({
  factorySubTab,
  setFactorySubTab,
  requisitions,
  setRequisitions,
  company,
  branches = [],
  salespersons = [],
  onSyncCloud,
  onBack,
  onClose
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedMarketing, setSelectedMarketing] = useState<string>('all');
  const [selectedUrgency, setSelectedUrgency] = useState<string>('all');
  const [viewingReq, setViewingReq] = useState<Requisition | null>(null);
  const [previewingChallan, setPreviewingChallan] = useState<DeliveryChallan | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 3500);
  };

  const getMarketingPersonName = (req: Requisition): string => {
    return [req.marketingPersonName, req.createdByName]
      .map((name) => (name || '').trim())
      .find((name) => name && !isAdminMarketingLabel(name, salespersons)) || '';
  };

  const factoryBranchAddress = useMemo(() => {
    const targetBranch = branches.find((b) => b.id === previewingChallan?.branchId) || branches[0];
    return getBranchAddressDetails(targetBranch, company.phone, company.email);
  }, [branches, previewingChallan?.branchId, company.phone, company.email]);

  const handleCreateChallanFromFactory = (req: Requisition) => {
    const rawDigits = (req.reqNo || '').replace(/[^0-9]/g, '');
    const challanNo = `FAC-${rawDigits || Math.floor(1000 + Math.random() * 9000)}`;

    const targetBranch = branches.find((b) => b.id === req.branchId || b.name === req.branchName) || branches[0];
    const branchAddressDetails = getBranchAddressDetails(targetBranch, company.phone, company.email);

    const generatedLines: ChallanLineItem[] = (req.lines || []).map((l, idx) => ({
      id: `chl-fac-${Date.now()}-${idx}`,
      slNo: idx + 1,
      itemId: l.itemId,
      itemCode: l.itemCode,
      itemName: l.itemName,
      itemDescription: l.itemName || l.itemCode || 'Coil Item',
      sizeSpec: l.sizeSpec || '',
      coilQty: l.requestedQty || 0,
      billedQty: 0,
      dueQty: l.requestedQty || 0,
      unit: l.unit || 'Coils',
      rate: 0,
      amount: 0,
      colors: l.colors ? {
        red: Number(l.colors.red) || 0,
        blk: Number(l.colors.black ?? l.colors.blk) || 0,
        yel: Number(l.colors.yellow ?? l.colors.yel) || 0,
        grn: Number(l.colors.green ?? l.colors.grn) || 0,
        blu: Number(l.colors.blue ?? l.colors.blu) || 0,
        others: 0
      } : undefined
    }));

    const newChallan: DeliveryChallan = {
      id: `ch-fac-${req.id || Date.now()}`,
      challanNo,
      date: new Date().toISOString().split('T')[0],
      partyName: req.partyName || req.branchName || 'Factory Consignment Handover',
      address: req.deliverySite || req.toDestination || branchAddressDetails.line1,
      phone: company.phone || '01713-434290',
      orderNumber: req.reqNo,
      orderDate: req.date || req.reqDateStr,
      salespersonName: getMarketingPersonName(req) || 'Factory Store In-Charge',
      branchId: req.branchId || targetBranch?.id,
      branchName: req.branchName || targetBranch?.name || req.toDestination,
      lines: generatedLines,
      totalQuantity: req.totalRequestedQty || generatedLines.reduce((s, l) => s + (l.coilQty || 0), 0),
      totalAmount: 0,
      status: 'unbilled',
      savedAt: new Date().toISOString(),
      remarks: `Official Factory Dispatch Gate Pass (Generated from Req #${req.reqNo})`
    };

    setPreviewingChallan(newChallan);
    showNotification(`Delivery Challan #${challanNo} generated from factory order!`);
  };

  const handleSaveFactoryChallan = (challanToSave: DeliveryChallan) => {
    try {
      const existingRaw = localStorage.getItem('polycables_delivery_challans');
      const existingList: DeliveryChallan[] = existingRaw ? JSON.parse(existingRaw) : [];
      const updated = [challanToSave, ...existingList.filter((c) => c.id !== challanToSave.id && c.challanNo !== challanToSave.challanNo)];
      localStorage.setItem('polycables_delivery_challans', JSON.stringify(updated));
      if (onSyncCloud) {
        onSyncCloud({ deliveryChallans: updated }, true);
      }
      showNotification(`Challan #${challanToSave.challanNo} saved to Delivery Challans register!`);
    } catch {
      showNotification(`Challan #${challanToSave.challanNo} ready for print.`);
    }
  };

  // Base Approved List
  const allApproved = useMemo(() => {
    return requisitions.filter(isRequisitionApprovedForFactory);
  }, [requisitions]);

  // "if Fully Delivered then hide from factory-Approved History page"
  const pendingSupplyRequisitions = useMemo(() => {
    return allApproved.filter((req) => !isRequisitionFullyDelivered(req));
  }, [allApproved]);

  const deliveredRequisitions = useMemo(() => {
    return allApproved.filter((req) => isRequisitionFullyDelivered(req));
  }, [allApproved]);

  // Active dataset based on subtab
  const activeDataset = factorySubTab === 'delivered' ? deliveredRequisitions : pendingSupplyRequisitions;

  // Filtered dataset
  const filteredRequisitions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeDataset.filter((req) => {
      if (selectedBranch !== 'all' && (req.branchName || req.toDestination || '') !== selectedBranch) {
        return false;
      }
      if (selectedMarketing !== 'all' && getMarketingPersonName(req) !== selectedMarketing) {
        return false;
      }
      if (selectedUrgency !== 'all' && req.urgency !== selectedUrgency) {
        return false;
      }
      if (!q) return true;

      const reqNo = (req.reqNo || '').toLowerCase();
      const party = (req.partyName || '').toLowerCase();
      const dest = (req.toDestination || req.branchName || '').toLowerCase();
      const site = (req.deliverySite || '').toLowerCase();
      const mkt = getMarketingPersonName(req).toLowerCase();
      const hasLine = (req.lines || []).some((l) =>
        matchesFlexibleSearch(`${l.itemName || ''} ${l.description || ''}`, searchQuery, `${l.itemCode || ''}`)
      );

      return (
        reqNo.includes(q) ||
        party.includes(q) ||
        dest.includes(q) ||
        site.includes(q) ||
        mkt.includes(q) ||
        hasLine
      );
    });
  }, [activeDataset, searchQuery, selectedBranch, selectedMarketing, selectedUrgency, salespersons]);

  // Fast Summary Metrics
  const metrics = useMemo(() => {
    const totalPendingOrders = pendingSupplyRequisitions.length;
    const totalPendingCoils = pendingSupplyRequisitions.reduce((sum, r) => sum + (Number(r.totalRequestedQty) || 0), 0);
    const totalPendingAmount = pendingSupplyRequisitions.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
    const dispatchedInTransit = pendingSupplyRequisitions.filter((r) => r.stage === 'factory_dispatched').length;
    const deliveredCount = deliveredRequisitions.length;

    return {
      totalPendingOrders,
      totalPendingCoils,
      totalPendingAmount,
      dispatchedInTransit,
      deliveredCount
    };
  }, [pendingSupplyRequisitions, deliveredRequisitions]);

  // Unique Filter Options
  const uniqueBranches = useMemo(() => {
    const set = new Set<string>();
    requisitions.forEach((r) => {
      const b = r.branchName || r.toDestination;
      if (b) set.add(b);
    });
    return Array.from(set).sort();
  }, [requisitions]);

  const uniqueMarketing = useMemo(() => {
    const set = new Set<string>();
    requisitions.forEach((r) => {
      const m = getMarketingPersonName(r);
      if (m) set.add(m);
    });
    return Array.from(set).sort();
  }, [requisitions, salespersons]);

  // Dispatch Action: Mark Order as Dispatched from Factory
  const handleMarkDispatched = (reqId: string) => {
    const updated = requisitions.map((r) => {
      if (r.id === reqId) {
        return {
          ...r,
          stage: 'factory_dispatched' as const,
          factoryStatus: 'dispatched' as const,
          factoryDispatchDate: new Date().toISOString()
        };
      }
      return r;
    });

    setRequisitions(updated);
    try {
      localStorage.setItem('polycables_requisitions', JSON.stringify(updated));
    } catch {}

    if (onSyncCloud) {
      onSyncCloud({ requisitions: updated }, true);
    }
    showNotification('Order marked as Factory Dispatched! Goods are in transit.');
  };

  // Deliver Action: Mark Order as Received / Fully Delivered
  const handleMarkDelivered = (reqId: string) => {
    const updated = requisitions.map((r) => {
      if (r.id === reqId) {
        return {
          ...r,
          stage: 'goods_received' as const,
          percentage: 100,
          isLocked: true,
          totalDeliveredQty: r.totalRequestedQty,
          updatedAt: new Date().toISOString()
        };
      }
      return r;
    });

    setRequisitions(updated);
    try {
      localStorage.setItem('polycables_requisitions', JSON.stringify(updated));
    } catch {}

    if (onSyncCloud) {
      onSyncCloud({ requisitions: updated }, true);
    }
    showNotification('Order marked as Fully Delivered! Moved to Delivered History.');
  };

  // Export to Excel
  const handleExportExcel = () => {
    try {
      const exportRows = filteredRequisitions.map((r, idx) => ({
        'SL': idx + 1,
        'Req #': r.reqNo,
        'Date': r.reqDateStr || formatDateDDMMYY(r.date),
        'Customer / Destination': r.partyName || r.branchName || 'Sales Center',
        'Sales Center': r.branchName || r.toDestination || 'Madhupur',
        'Delivery Site': r.deliverySite || '-',
        'Marketing Person': getMarketingPersonName(r) || '-',
        'Total Coils': r.totalRequestedQty || 0,
        'Amount (৳)': r.totalAmount || 0,
        'Stage': r.stage,
        'Urgency': r.urgency || 'normal',
        'Status': isRequisitionFullyDelivered(r) ? 'Fully Delivered' : 'Pending Factory Supply'
      }));

      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, factorySubTab === 'delivered' ? 'Delivered Orders' : 'Approved Supply');
      XLSX.writeFile(wb, `Factory_${factorySubTab === 'delivered' ? 'Delivered' : 'Approved_Supply'}_${Date.now()}.xlsx`);
      showNotification('Excel Report exported successfully!');
    } catch (err) {
      console.error('Failed to export factory excel:', err);
    }
  };

  return (
    <div className="w-full min-h-screen text-white font-sans p-3 sm:p-5 space-y-4">
      {/* Toast Notification */}
      {actionSuccessMsg && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500/95 backdrop-blur-md text-slate-950 px-4 py-3 rounded-xl shadow-2xl flex items-center space-x-2 border border-emerald-300/60 font-bold text-xs animate-in slide-in-from-top duration-200">
          <CheckCircle2 className="w-4 h-4 text-slate-950" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* Top Header & Tab Switcher */}
      <div className="cyber-glass-card rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl flex items-center justify-center shadow-lg border border-amber-300/40">
            <Factory className="w-6 h-6 text-slate-950 font-black" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">Factory Supply Control</h1>
              <span className="bg-amber-500/20 text-amber-300 border border-amber-400/40 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                Production & Dispatch
              </span>
            </div>
            <p className="text-xs text-cyan-200/75 mt-0.5">
              Live tracking of approved requisitions, coil packaging, dispatch schedules, and delivered archives
            </p>
          </div>
        </div>

        {/* Clean View Selector (No top buttons) */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-cyan-200/80 uppercase">View:</span>
          <select
            value={factorySubTab}
            onChange={(e) => setFactorySubTab(e.target.value as 'approved_history' | 'delivered')}
            className="bg-[#061520] border border-cyan-500/35 text-cyan-100 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-cyan-400 cursor-pointer"
          >
            <option value="approved_history">Approved Supply History ({metrics.totalPendingOrders})</option>
            <option value="delivered">Delivered Orders ({metrics.deliveredCount})</option>
          </select>
        </div>
      </div>

      {/* KPI Metrics Dashboard Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="cyber-glass-subcard border border-amber-500/35 p-3.5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/10 rounded-full blur-xl pointer-events-none" />
          <div className="text-[11px] font-extrabold text-amber-300 uppercase tracking-wider flex items-center space-x-1.5">
            <Package className="w-3.5 h-3.5 text-amber-400" />
            <span>Pending Supply Orders</span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-300 font-mono mt-1">
            {metrics.totalPendingOrders}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Active requisitions awaiting supply</p>
        </div>

        <div className="cyber-glass-subcard border border-emerald-500/35 p-3.5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />
          <div className="text-[11px] font-extrabold text-emerald-300 uppercase tracking-wider flex items-center space-x-1.5">
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>Total Coils to Dispatch</span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-300 font-mono mt-1">
            {metrics.totalPendingCoils.toLocaleString('en-IN')}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Physical coil quantity approved</p>
        </div>

        <div className="cyber-glass-subcard border border-cyan-500/35 p-3.5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-cyan-500/10 rounded-full blur-xl pointer-events-none" />
          <div className="text-[11px] font-extrabold text-cyan-300 uppercase tracking-wider flex items-center space-x-1.5">
            <Truck className="w-3.5 h-3.5 text-cyan-400" />
            <span>In-Transit / Dispatched</span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-cyan-300 font-mono mt-1">
            {metrics.dispatchedInTransit}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Goods loaded and sent to showroom</p>
        </div>

        <div className="cyber-glass-subcard border border-purple-500/35 p-3.5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/10 rounded-full blur-xl pointer-events-none" />
          <div className="text-[11px] font-extrabold text-purple-300 uppercase tracking-wider flex items-center space-x-1.5">
            <FileText className="w-3.5 h-3.5 text-purple-400" />
            <span>Pending Value (৳)</span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-purple-300 font-mono mt-1">
            ৳{metrics.totalPendingAmount.toLocaleString('en-IN')}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Total pending factory dispatch valuation</p>
        </div>
      </div>

      {/* Rearranged Filter & Search Toolbar */}
      <div className="bg-[#0b2334]/80 border border-cyan-500/25 rounded-2xl p-4 shadow-lg space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
          {/* Quick Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-cyan-400/70 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search req #, party, destination, coil..."
              className="w-full bg-[#061520] border border-cyan-500/30 rounded-xl pl-9 pr-8 py-2.5 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 p-0.5 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Branch / Sales Center Filter */}
          <div>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full bg-[#061520] border border-cyan-500/30 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 font-medium cursor-pointer"
            >
              <option value="all">🏢 All Sales Centers & Outlets</option>
              {uniqueBranches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Marketing Person Filter */}
          <div>
            <select
              value={selectedMarketing}
              onChange={(e) => setSelectedMarketing(e.target.value)}
              className="w-full bg-[#061520] border border-cyan-500/30 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 font-medium cursor-pointer"
            >
              <option value="all">👤 All Marketing Personnel</option>
              {uniqueMarketing.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Urgency Filter */}
          <div>
            <select
              value={selectedUrgency}
              onChange={(e) => setSelectedUrgency(e.target.value)}
              className="w-full bg-[#061520] border border-cyan-500/30 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 font-medium cursor-pointer"
            >
              <option value="all">⚡ All Priority Levels</option>
              <option value="normal">🟢 Normal Delivery</option>
              <option value="urgent">🟠 Urgent Dispatch</option>
              <option value="emergency">🔴 Emergency Supply</option>
            </select>
          </div>
        </div>

        {/* Status notice banner */}
        <div className="flex items-center justify-between text-[11px] text-slate-300 pt-1 border-t border-cyan-500/20">
          <span>
            Showing <strong className="text-white font-mono">{filteredRequisitions.length}</strong> orders{' '}
            {factorySubTab === 'approved_history' ? '(Awaiting factory dispatch/supply)' : '(Archived & Fully Delivered)'}
          </span>
          {factorySubTab === 'approved_history' && (
            <span className="text-emerald-300 font-semibold flex items-center space-x-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Fully Delivered requisitions are automatically hidden from this view</span>
            </span>
          )}
        </div>
      </div>

      {/* Main Order Cards / Table */}
      <div className="cyber-glass-card rounded-2xl overflow-hidden">
        {filteredRequisitions.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-14 h-14 bg-[#081b28] rounded-2xl mx-auto flex items-center justify-center text-slate-400 border border-cyan-500/25">
              <Package className="w-7 h-7 text-amber-400/70" />
            </div>
            <h3 className="text-base font-bold text-white">No Orders Found</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {factorySubTab === 'approved_history'
                ? 'All approved requisitions are either fully delivered or there are no pending orders awaiting factory supply.'
                : 'No delivered requisitions match the current search filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#0c2638] text-cyan-200 font-extrabold uppercase tracking-wider border-b border-cyan-500/30 text-[11px]">
                  <th className="py-3 px-3.5">Req # & Date</th>
                  <th className="py-3 px-3.5">Destination & Site</th>
                  <th className="py-3 px-3.5">Customer / Party</th>
                  <th className="py-3 px-3.5">Marketing Officer</th>
                  <th className="py-3 px-3.5">Item & Coil Breakdown</th>
                  <th className="py-3 px-3.5 text-center">Total Coils</th>
                  <th className="py-3 px-3.5">Factory Stage</th>
                  <th className="py-3 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200 font-medium">
                {filteredRequisitions.map((req) => {
                  const isFullyDelivered = isRequisitionFullyDelivered(req);
                  const isDispatched = req.stage === 'factory_dispatched';

                  return (
                    <tr
                      key={req.id}
                      className={`hover:bg-cyan-500/[0.06] transition-colors ${
                        isFullyDelivered
                          ? 'border-l-4 border-l-cyan-400'
                          : isDispatched
                          ? 'border-l-4 border-l-sky-400 bg-sky-500/[0.05]'
                          : 'border-l-4 border-l-amber-400 bg-amber-500/[0.04]'
                      }`}
                    >
                      {/* Req # & Date */}
                      <td className="py-3.5 px-3.5">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono font-black text-amber-400 text-sm">
                            {req.reqNo}
                          </span>
                          {req.urgency === 'urgent' && (
                            <span className="bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[9px] font-black px-1.5 py-0.2 rounded uppercase">
                              Urgent
                            </span>
                          )}
                          {req.urgency === 'emergency' && (
                            <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[9px] font-black px-1.5 py-0.2 rounded uppercase animate-pulse">
                              Emergency
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          📅 {req.reqDateStr || formatDateDDMMYY(req.date)}
                        </div>
                      </td>

                      {/* Destination & Site */}
                      <td className="py-3.5 px-3.5">
                        <div className="font-bold text-slate-100 flex items-center space-x-1">
                          <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="truncate max-w-[150px]">{req.branchName || req.toDestination || 'Sales Center'}</span>
                        </div>
                        {req.deliverySite && (
                          <div className="text-[10px] text-slate-400 truncate max-w-[150px] mt-0.5">
                            📍 {req.deliverySite}
                          </div>
                        )}
                      </td>

                      {/* Customer / Party */}
                      <td className="py-3.5 px-3.5">
                        <div className="font-bold text-slate-200 truncate max-w-[170px]">
                          {req.partyName || '-'}
                        </div>
                        {req.partyAddress && (
                          <div className="text-[10px] text-slate-500 truncate max-w-[170px]">
                            {req.partyAddress}
                          </div>
                        )}
                      </td>

                      {/* Marketing Officer */}
                      <td className="py-3.5 px-3.5">
                        <div className="text-slate-300 font-semibold flex items-center space-x-1">
                          <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="truncate max-w-[130px]">{getMarketingPersonName(req) || '-'}</span>
                        </div>
                      </td>

                      {/* Item & Coil Breakdown */}
                      <td className="py-3.5 px-3.5 max-w-[260px]">
                        <div className="space-y-1">
                          {(req.lines || []).slice(0, 3).map((line, idx) => (
                            <div key={idx} className="flex items-center justify-between text-[11px] bg-[#061520]/80 px-2 py-0.5 rounded border border-cyan-500/20">
                              <span className="text-slate-200 truncate max-w-[160px] font-medium">
                                {line.itemName || line.itemCode || 'Coil Item'}
                              </span>
                              <span className="font-mono font-bold text-amber-300 shrink-0 ml-1">
                                {line.requestedQty || 0} {line.unit || 'Coils'}
                              </span>
                            </div>
                          ))}
                          {(req.lines || []).length > 3 && (
                            <div className="text-[10px] text-slate-500 italic pl-1">
                              + {(req.lines || []).length - 3} more items...
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Total Coils */}
                      <td className="py-3.5 px-3.5 text-center">
                        <div className="text-base font-black text-amber-400 font-mono">
                          {req.totalRequestedQty || 0}
                        </div>
                        <div className="text-[10px] text-slate-500 uppercase font-bold">Coils</div>
                      </td>

                      {/* Factory Stage */}
                      <td className="py-3.5 px-3.5">
                        {isFullyDelivered ? (
                          <span className="inline-flex items-center space-x-1 bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 text-[10px] font-black px-2.5 py-1 rounded-full uppercase">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>Fully Delivered</span>
                          </span>
                        ) : isDispatched ? (
                          <span className="inline-flex items-center space-x-1 bg-sky-950/80 text-sky-300 border border-sky-500/40 text-[10px] font-black px-2.5 py-1 rounded-full uppercase">
                            <Truck className="w-3 h-3 text-sky-400 animate-pulse" />
                            <span>Dispatched</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 bg-amber-950/80 text-amber-300 border border-amber-500/40 text-[10px] font-black px-2.5 py-1 rounded-full uppercase">
                            <Clock className="w-3 h-3 text-amber-400" />
                            <span>Pending Supply</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-3.5 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            type="button"
                            onClick={() => setViewingReq(req)}
                            className="p-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/30 rounded-lg transition-colors cursor-pointer"
                            title="View Full Requisition Slip & Color Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCreateChallanFromFactory(req)}
                            className="px-2.5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-lg text-[11px] shadow-sm flex items-center space-x-1 transition-all cursor-pointer"
                            title="Create Delivery Challan from Factory (Same as Challan Print Preview)"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Create Challan</span>
                          </button>

                          {!isFullyDelivered && (
                            <>
                              {!isDispatched ? (
                                <button
                                  type="button"
                                  onClick={() => handleMarkDispatched(req.id)}
                                  className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold text-[11px] shadow-sm flex items-center space-x-1 transition-colors cursor-pointer"
                                  title="Mark order as dispatched from factory"
                                >
                                  <Truck className="w-3.5 h-3.5" />
                                  <span>Dispatch</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleMarkDelivered(req.id)}
                                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-[11px] shadow-sm flex items-center space-x-1 transition-colors cursor-pointer"
                                  title="Confirm receipt and mark as fully delivered"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Deliver</span>
                                </button>
                              )}
                            </>
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
      </div>

      {/* Bottom Export Action Bar */}
      <div className="flex items-center justify-end gap-2 no-print">
        <button
          type="button"
          onClick={handleExportExcel}
          className="flex items-center space-x-1.5 px-3.5 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          title="Export filtered list to Excel"
        >
          <Download className="w-3.5 h-3.5 text-emerald-400" />
          <span>Export Excel</span>
        </button>
      </div>

      {/* Modal: View Full Requisition Details & Loading Slip */}
      {viewingReq && (
        <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl border border-cyan-400/35 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5 text-white shadow-[0_24px_64px_rgba(0,0,0,0.65)] space-y-4">
            <div className="flex items-center justify-between border-b border-cyan-500/25 pb-3">
              <div className="flex items-center space-x-2">
                <Factory className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-black text-white">
                  Factory Loading & Dispatch Slip: {viewingReq.reqNo}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingReq(null)}
                className="text-slate-300 hover:text-white hover:bg-cyan-500/15 p-1 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Meta */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs bg-[#071824]/80 p-3.5 rounded-xl border border-cyan-500/25">
              <div>
                <span className="text-cyan-300/70 block text-[10px] uppercase font-bold">Req Date</span>
                <span className="font-mono text-white font-bold">{viewingReq.reqDateStr || formatDateDDMMYY(viewingReq.date)}</span>
              </div>
              <div>
                <span className="text-cyan-300/70 block text-[10px] uppercase font-bold">Destination</span>
                <span className="text-amber-300 font-bold">{viewingReq.branchName || viewingReq.toDestination}</span>
              </div>
              <div>
                <span className="text-cyan-300/70 block text-[10px] uppercase font-bold">Party / Customer</span>
                <span className="text-white font-bold">{viewingReq.partyName || '-'}</span>
              </div>
              <div>
                <span className="text-cyan-300/70 block text-[10px] uppercase font-bold">Delivery Site</span>
                <span className="text-slate-200 font-medium">{viewingReq.deliverySite || '-'}</span>
              </div>
              <div>
                <span className="text-cyan-300/70 block text-[10px] uppercase font-bold">Marketing Person</span>
                <span className="text-slate-200 font-medium">{getMarketingPersonName(viewingReq) || '-'}</span>
              </div>
              <div>
                <span className="text-cyan-300/70 block text-[10px] uppercase font-bold">Urgency</span>
                <span className="text-orange-300 font-bold uppercase">{viewingReq.urgency || 'normal'}</span>
              </div>
            </div>

            {/* Items Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-cyan-200 uppercase tracking-wider">Item & Color Specifications</h4>
              <div className="border border-cyan-500/25 rounded-xl overflow-hidden bg-[#071824]/70">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#0c2638] text-cyan-200 text-[10px] font-bold uppercase border-b border-cyan-500/30">
                    <tr>
                      <th className="p-2.5">Item Description</th>
                      <th className="p-2.5 text-center">Quantity</th>
                      <th className="p-2.5">Color Breakdown</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-500/15 font-medium text-slate-200">
                    {(viewingReq.lines || []).map((line, idx) => (
                      <tr key={idx} className="hover:bg-cyan-500/[0.06]">
                        <td className="p-2.5 text-white">
                          <div className="font-bold">{line.itemName || line.itemCode}</div>
                          {line.sizeSpec && <div className="text-[10px] text-slate-400">{line.sizeSpec}</div>}
                        </td>
                        <td className="p-2.5 text-center font-mono font-bold text-amber-300">
                          {line.requestedQty || 0} {line.unit || 'Coils'}
                        </td>
                        <td className="p-2.5 text-[11px] text-slate-300">
                          {line.colors ? (
                            <div className="flex flex-wrap gap-1">
                              {Number(line.colors.red) > 0 && <span className="bg-rose-950/90 text-rose-300 px-1.5 py-0.2 rounded border border-rose-500/40 text-[10px]">R: {line.colors.red}</span>}
                              {Number(line.colors.black || line.colors.blk) > 0 && <span className="bg-[#081b28] text-slate-200 px-1.5 py-0.2 rounded border border-cyan-500/30 text-[10px]">B: {line.colors.black || line.colors.blk}</span>}
                              {Number(line.colors.yellow || line.colors.yel) > 0 && <span className="bg-amber-950/90 text-amber-300 px-1.5 py-0.2 rounded border border-amber-500/40 text-[10px]">Y: {line.colors.yellow || line.colors.yel}</span>}
                              {Number(line.colors.green || line.colors.grn) > 0 && <span className="bg-emerald-950/90 text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-500/40 text-[10px]">G: {line.colors.green || line.colors.grn}</span>}
                              {Number(line.colors.blue || line.colors.blu) > 0 && <span className="bg-sky-950/90 text-sky-300 px-1.5 py-0.2 rounded border border-sky-500/40 text-[10px]">Bl: {line.colors.blue || line.colors.blu}</span>}
                            </div>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-cyan-500/20">
              <div className="text-xs text-slate-300">
                Total Coils: <strong className="text-amber-300 font-mono">{viewingReq.totalRequestedQty || 0}</strong>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    const r = viewingReq;
                    setViewingReq(null);
                    handleCreateChallanFromFactory(r);
                  }}
                  className="px-3.5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-xl text-xs flex items-center space-x-1.5 cursor-pointer shadow-md"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Create Delivery Challan</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 rounded-xl font-bold text-xs flex items-center space-x-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Print Slip</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingReq(null)}
                  className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-white border border-cyan-500/30 font-bold rounded-xl text-xs cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delivery Challan Print Preview Modal (Exact 7.2x10 pad layout, No Ind. Ltd., Colour field shown) */}
      {previewingChallan && (
        <div className="fixed inset-0 bg-[#030d14]/85 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden text-white">
            {/* Toolbar */}
            <div className="cyber-glass-header px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 no-print">
              <div className="flex items-center space-x-2">
                <Printer className="w-5 h-5 text-cyan-300" />
                <span className="font-bold text-sm text-white">
                  Print Preview — Delivery Challan #{previewingChallan.challanNo}
                </span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/35 px-2 py-0.5 rounded-full font-bold">
                  Factory Gate Pass
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleSaveFactoryChallan(previewingChallan)}
                  className="bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/35 font-bold px-3 py-1.5 rounded-md text-xs flex items-center space-x-1 shadow-md transition-all cursor-pointer"
                  title="Save this Challan to Delivery Challan Register"
                >
                  <Save className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Save Challan</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black px-4 py-1.5 rounded-md text-xs flex items-center space-x-1.5 shadow-md transition-all cursor-pointer"
                  title="Trigger Print"
                >
                  <Printer className="w-4 h-4 text-slate-950" />
                  <span>Print Now (Ctrl+P)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewingChallan(null)}
                  className="bg-rose-600/90 hover:bg-rose-500 text-white font-bold px-3 py-1.5 rounded-md text-xs flex items-center space-x-1 shadow-md transition-all cursor-pointer"
                >
                  <X className="w-4 h-4 text-white" />
                  <span>Close</span>
                </button>
              </div>
            </div>

            {/* Document Body */}
            <div className="print-preview-canvas-container overflow-auto p-3 sm:p-4 flex justify-start sm:justify-center bg-[#041018]/80">
              <div
                className="bg-white text-black shadow-2xl border-2 border-slate-300 rounded-sm font-sans origin-top overflow-hidden"
                style={{
                  width: '7.2in',
                  maxWidth: '7.2in',
                  minHeight: '10in',
                  maxHeight: '10in',
                  height: '10in',
                  padding: '0 0.5in 0.5in 0.5in',
                  boxSizing: 'border-box'
                }}
              >
                <div className="relative flex flex-col justify-between h-full space-y-1.5 overflow-hidden">
                  <div className="relative z-10 space-y-2">
                    {/* Header: Company Logo (without IND. LTD.) */}
                    <div className="text-center pb-0 space-y-0 text-black font-sans leading-tight pt-0">
                      <div style={{ height: '2.25cm' }} className="flex items-center justify-center">
                        <PolyCablesLogo size="xl" showSubtitle={false} subtitleText="" />
                      </div>

                      {/* 3 Address Lines without Ind. Ltd. */}
                      <div className="space-y-0.5 pt-0 mt-0 pb-0 mb-0">
                        <p style={{ fontSize: '14px' }} className="font-bold text-[14px] leading-tight text-black">
                          {factoryBranchAddress.line1?.replace(/\s*Ind\.?\s*Ltd\.?/gi, '')}
                        </p>
                        <p style={{ fontSize: '14px' }} className="font-semibold text-[14px] leading-tight text-black">
                          {factoryBranchAddress.line2?.replace(/\s*Ind\.?\s*Ltd\.?/gi, '')}
                        </p>
                        <p style={{ fontSize: '14px' }} className="font-semibold text-[14px] leading-tight text-black">
                          {factoryBranchAddress.line3?.replace(/\s*Ind\.?\s*Ltd\.?/gi, '')}
                        </p>
                      </div>

                      {/* Delivery Challan Badge */}
                      <div className="pt-1.5 pb-0">
                        <span className="delivery-challan-badge challan-badge inline-block bg-slate-950 text-white border-2 border-slate-950 px-4 py-0.5 rounded text-xs font-black tracking-widest uppercase">
                          DELIVERY CHALLAN
                        </span>
                      </div>
                    </div>

                    {/* Metadata Grid */}
                    <div className="flex items-start justify-between w-full text-black font-sans mt-1.5 mb-0.5 gap-x-2.5 text-xs">
                      {/* Left */}
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center w-full min-h-[19px]">
                          <span className="w-[74px] flex-none font-semibold text-black text-xs">Party Name</span>
                          <span className="w-2 flex-none text-center font-semibold text-black text-xs">:</span>
                          <span className="font-bold border-b border-dotted border-black flex-1 min-w-0 pb-0.5 truncate text-left text-xs">
                            {previewingChallan.partyName || '\u00A0'}
                          </span>
                        </div>
                        <div className="flex items-center w-full min-h-[19px]">
                          <span className="w-[74px] flex-none font-semibold text-black text-xs">Address</span>
                          <span className="w-2 flex-none text-center font-semibold text-black text-xs">:</span>
                          <span className="font-semibold border-b border-dotted border-black flex-1 min-w-0 pb-0.5 truncate text-left text-xs">
                            {previewingChallan.address || '\u00A0'}
                          </span>
                        </div>
                        <div className="flex items-center w-full min-h-[19px]">
                          <span className="w-[74px] flex-none font-semibold text-black text-xs">Phone</span>
                          <span className="w-2 flex-none text-center font-semibold text-black text-xs">:</span>
                          <span className="font-mono font-semibold border-b border-dotted border-black flex-1 min-w-0 pb-0.5 truncate text-left text-xs">
                            {previewingChallan.phone || '\u00A0'}
                          </span>
                        </div>
                      </div>

                      {/* Right */}
                      <div className="w-[220px] flex-none space-y-0.5">
                        <div className="flex items-center justify-start min-h-[19px] w-full text-xs">
                          <span className="w-[74px] flex-none font-semibold text-black">Challan No.</span>
                          <span className="w-2 flex-none text-center font-semibold text-black">:</span>
                          <span className="font-mono font-bold w-[48px] flex-none truncate text-center border-b border-dotted border-black pb-0">
                            {previewingChallan.challanNo || '\u00A0'}
                          </span>
                          <span className="w-[32px] flex-none font-semibold text-black text-right pr-0.5">Date:</span>
                          <span className="font-mono font-semibold border-b border-dotted border-black w-[56px] flex-none text-center pb-0">
                            {formatDateDDMMYY(previewingChallan.date) || '\u00A0'}
                          </span>
                        </div>

                        <div className="flex items-center justify-start min-h-[19px] w-full text-xs">
                          <span className="w-[74px] flex-none font-semibold text-black">Order No.</span>
                          <span className="w-2 flex-none text-center font-semibold text-black">:</span>
                          <span className="font-semibold w-[48px] flex-none truncate text-center border-b border-dotted border-black pb-0">
                            {previewingChallan.orderNumber || '\u00A0'}
                          </span>
                          <span className="w-[32px] flex-none font-semibold text-black text-right pr-0.5">Date:</span>
                          <span className="font-mono font-semibold border-b border-dotted border-black w-[56px] flex-none text-center pb-0">
                            {formatDateDDMMYY(previewingChallan.orderDate || previewingChallan.date) || '\u00A0'}
                          </span>
                        </div>

                        <div className="flex items-center justify-start min-h-[19px] w-full text-xs">
                          <span className="w-[74px] flex-none font-semibold text-black">Salesman</span>
                          <span className="w-2 flex-none text-center font-semibold text-black">:</span>
                          <span className="font-semibold border-b border-dotted border-black w-[48px] flex-none text-center pb-0 truncate">
                            {previewingChallan.salespersonName || '\u00A0'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Table: SL | Item Description | Quantity | Unit | Colour (No Rate/Price) */}
                    <div className="border-2 border-black overflow-visible font-sans flex-1 flex flex-col justify-between mt-1 mb-1 min-h-[300px]">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="bg-slate-100 text-black font-bold uppercase tracking-wider text-[11px] border-b-2 border-black">
                            <th className="p-1.5 border-r border-black w-10 text-center">SL</th>
                            <th className="p-1.5 border-r border-black">Item Description</th>
                            <th className="p-1.5 border-r border-black w-24 text-center">Quantity</th>
                            <th className="p-1.5 border-r border-black w-20 text-center">Unit</th>
                            <th className="p-1.5 w-36 text-center">Colour</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-300">
                          {previewingChallan.lines && previewingChallan.lines.length > 0 ? (
                            previewingChallan.lines.map((line, idx) => (
                              <tr key={line.id || idx} className="border-b border-slate-300">
                                <td className="p-1.5 border-r border-black font-mono text-center">{idx + 1}</td>
                                <td className="p-1.5 border-r border-black font-medium">{line.itemDescription}</td>
                                <td className="p-1.5 border-r border-black font-mono font-bold text-center">{line.coilQty || 0}</td>
                                <td className="p-1.5 border-r border-black text-center font-medium">{formatDisplayUnit(line.unit, line.coilQty)}</td>
                                <td className="p-1.5 text-center font-semibold text-slate-800 text-[11px]">
                                  {formatChallanLineColors(line)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={5} className="p-3 text-center text-slate-500 italic">No line items.</td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot className="border-t-2 border-black font-semibold text-xs bg-slate-50">
                          <tr className="border-b border-black">
                            <td colSpan={2} className="p-1.5 text-right border-r border-black font-bold uppercase tracking-wider whitespace-nowrap">
                              Total Coils =
                            </td>
                            <td className="p-1.5 text-center border-r border-black font-mono font-black text-black">
                              {previewingChallan.totalQuantity || 0}
                            </td>
                            <td className="p-1.5 text-center border-r border-black font-semibold text-slate-700">
                              Coils
                            </td>
                            <td className="p-1.5"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Summary */}
                    <div className="border border-black p-2 flex items-start justify-between text-xs bg-slate-50">
                      <div className="flex-1 space-y-1 pr-4">
                        <div className="text-[11px] text-slate-700">
                          <span className="font-bold">Dispatch Note:</span> Delivered directly from Factory Dispatch Gate. Please verify count before signing.
                        </div>
                        {previewingChallan.remarks && (
                          <div className="text-[11px] text-slate-600">
                            <span className="font-bold">Remarks:</span> {previewingChallan.remarks}
                          </div>
                        )}
                      </div>
                      <div className="w-52 space-y-1 font-mono text-xs border-l border-slate-300 pl-3">
                        <div className="flex justify-between font-bold text-black text-sm">
                          <span className="font-sans font-bold text-slate-800">Total Coils:</span>
                          <span className="font-black font-mono">{previewingChallan.totalQuantity || 0}</span>
                        </div>
                        <div className="flex justify-between text-slate-600 text-[11px]">
                          <span className="font-sans">Status:</span>
                          <span className="font-bold text-emerald-700">Delivered</span>
                        </div>
                      </div>
                    </div>

                    {/* Signatures: min 5 lines normally, 3 lines when many items */}
                    <div
                      className={`${
                        (previewingChallan.lines?.length || 0) >= 10
                          ? 'min-h-[42px] h-[42px]'
                          : 'min-h-[75px] h-[75px]'
                      } flex-none w-full`}
                      aria-hidden="true"
                    />
                    <div className="grid grid-cols-4 gap-4 text-center text-[11px] font-sans">
                      <div>
                        <div className="border-t border-black pt-1 font-bold">Receiver's Signature</div>
                      </div>
                      <div>
                        <div className="border-t border-black pt-1 font-semibold">Prepared By</div>
                      </div>
                      <div>
                        <div className="border-t border-black pt-1 font-semibold">Check By</div>
                      </div>
                      <div>
                        <div className="border-t border-black pt-1 font-semibold">Approved By</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
