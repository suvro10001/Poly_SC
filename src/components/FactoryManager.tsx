import React, { useState, useMemo } from 'react';
import {
  Requisition,
  StoredBill,
  Salesperson,
  Party,
  BranchLocation,
  Item,
  CompanyDetails,
  AuthUser,
  RequisitionStage
} from '../types';
import { extractBillNoFromReqNo, extractReqLineColors } from './RequisitionPage';
import { cleanBranchName, isStrictSuperAdmin, isAnyAdmin, isMarketingOfficer, isAdminMarketingLabel } from '../utils/branchAccess';
import { getTodayISO, formatDateDDMMYY } from '../utils/dateUtils';
import { convertToTakaWords } from '../utils/numberToWords';
import { isColorApplicableCable } from '../utils/categoryHelper';
import { matchesFlexibleSearch } from '../utils/searchHelper';
import {
  Factory,
  PackageCheck,
  History,
  Search,
  Building2,
  User,
  Calendar,
  Truck,
  CheckCircle2,
  Clock,
  Boxes,
  FileText,
  X,
  ExternalLink,
  Receipt,
  Layers
} from 'lucide-react';

interface FactoryManagerProps {
  requisitions: Requisition[];
  setRequisitions: React.Dispatch<React.SetStateAction<Requisition[]>>;
  storedBills: StoredBill[];
  setStoredBills: React.Dispatch<React.SetStateAction<StoredBill[]>>;
  salespersons: Salesperson[];
  parties: Party[];
  branches: BranchLocation[];
  items: Item[];
  company: CompanyDetails;
  currentUser?: AuthUser | null;
  subTab?: 'approved_history' | 'delivered';
  setSubTab?: (tab: 'approved_history' | 'delivered') => void;
  onNavigateToStoredBills?: (billId?: string) => void;
  onBack?: () => void;
}

export const FactoryManager: React.FC<FactoryManagerProps> = ({
  requisitions,
  setRequisitions,
  storedBills,
  setStoredBills,
  salespersons,
  parties,
  branches,
  items,
  company,
  currentUser,
  subTab: propSubTab,
  setSubTab: propSetSubTab,
  onNavigateToStoredBills,
  onBack
}) => {
  const marketingPersonLabel = (name?: string | null) =>
    name && !isAdminMarketingLabel(name, salespersons) ? name : 'Marketing Officer';

  const [localSubTab, setLocalSubTab] = useState<'approved_history' | 'delivered'>('approved_history');
  const activeSubTab = propSubTab || localSubTab;
  const setActiveSubTab = propSetSubTab || setLocalSubTab;

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('All');
  const [deliveryFilter, setDeliveryFilter] = useState<'all' | 'pending_rest' | 'partial' | 'full'>('all');

  // Delivery Modal State
  const [deliveringReq, setDeliveringReq] = useState<Requisition | null>(null);
  const [deliveryQuantities, setDeliveryQuantities] = useState<Record<string, number>>({});
  const [deliveryColorInputs, setDeliveryColorInputs] = useState<Record<string, { red?: number; black?: number; yellow?: number; green?: number; blue?: number; others?: number }>>({});
  const [deliverySuccessToast, setDeliverySuccessToast] = useState<string | null>(null);

  // Filter ONLY approved requisitions - without approval, requisitions NEVER go to Factory
  const approvedRequisitions = useMemo(() => {
    return requisitions.filter((r) => {
      return Boolean(
        r.isApproved ||
        r.stage === 'sent_to_factory' ||
        r.stage === 'factory_dispatched' ||
        r.stage === 'factory_received' ||
        r.stage === 'goods_received' ||
        r.stage === 'converted_to_bill'
      );
    });
  }, [requisitions]);

  // Approved Requisitions with Remaining / Rest Goods calculation
  const approvedListWithRest = useMemo(() => {
    return approvedRequisitions.map((req) => {
      let totalReqQty = 0;
      let totalDeliveredQty = 0;
      let totalRestQty = 0;

      const linesWithRest = (req.lines || []).map((line) => {
        const approvedQty = Number(line.requestedQty || line.quantity || 0);
        const deliveredQty = Number(line.deliveredQty || 0);
        const restQty = Math.max(0, approvedQty - deliveredQty);

        totalReqQty += approvedQty;
        totalDeliveredQty += deliveredQty;
        totalRestQty += restQty;

        return {
          ...line,
          approvedQty,
          deliveredQty,
          restQty
        };
      });

      const isFullyDelivered = totalReqQty > 0 && totalRestQty === 0;
      const isPartiallyDelivered = totalDeliveredQty > 0 && totalRestQty > 0;
      const isNotDeliveredYet = totalDeliveredQty === 0;

      return {
        ...req,
        linesWithRest,
        totalReqQty,
        totalDeliveredQty,
        totalRestQty,
        isFullyDelivered,
        isPartiallyDelivered,
        isNotDeliveredYet
      };
    });
  }, [approvedRequisitions]);

  // Filtered Approved History list (shows requisitions that still have remaining goods, or matching search)
  const filteredApprovedHistory = useMemo(() => {
    return approvedListWithRest.filter((req) => {
      // Branch filter
      if (selectedBranchFilter !== 'All') {
        const targetClean = cleanBranchName(selectedBranchFilter).toLowerCase();
        const rBranchClean = cleanBranchName(req.branchName || req.toDestination || '').toLowerCase();
        if (req.branchId !== selectedBranchFilter && !rBranchClean.includes(targetClean)) {
          return false;
        }
      }

      // Delivery Status Filter
      if (deliveryFilter === 'pending_rest' && req.isFullyDelivered) return false;
      if (deliveryFilter === 'partial' && !req.isPartiallyDelivered) return false;
      if (deliveryFilter === 'full' && !req.isFullyDelivered) return false;

      // In Approved History, default to prioritizing requisitions that still have rest goods to deliver
      if (activeSubTab === 'approved_history' && deliveryFilter === 'all' && req.isFullyDelivered && !searchQuery.trim()) {
        // If all goods are already delivered and user hasn't searched, they belong primarily in Delivered sub-menu
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchReqNo = (req.reqNo || '').toLowerCase().includes(q);
        const matchParty = (req.partyName || '').toLowerCase().includes(q);
        const matchBranch = (req.branchName || '').toLowerCase().includes(q);
        const matchPerson = (req.marketingPersonName || '').toLowerCase().includes(q);
        const matchItems = (req.lines || []).some((l) =>
          matchesFlexibleSearch(`${l.itemName || ''} ${l.description || ''}`, searchQuery, `${l.itemCode || ''}`)
        );
        return matchReqNo || matchParty || matchBranch || matchPerson || matchItems;
      }

      return true;
    });
  }, [approvedListWithRest, selectedBranchFilter, deliveryFilter, searchQuery, activeSubTab]);

  // Delivered History list: Requisitions that have had deliveries (full or partial)
  const deliveredHistoryList = useMemo(() => {
    return approvedListWithRest
      .filter((req) => req.totalDeliveredQty > 0)
      .filter((req) => {
        if (selectedBranchFilter !== 'All') {
          const targetClean = cleanBranchName(selectedBranchFilter).toLowerCase();
          const rBranchClean = cleanBranchName(req.branchName || req.toDestination || '').toLowerCase();
          if (req.branchId !== selectedBranchFilter && !rBranchClean.includes(targetClean)) {
            return false;
          }
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchReqNo = (req.reqNo || '').toLowerCase().includes(q);
          const matchParty = (req.partyName || '').toLowerCase().includes(q);
          const matchBranch = (req.branchName || '').toLowerCase().includes(q);
          const matchBills = (req.deliveredBillNumbers || []).some((b) => b.toLowerCase().includes(q));
          return matchReqNo || matchParty || matchBranch || matchBills;
        }
        return true;
      });
  }, [approvedListWithRest, selectedBranchFilter, searchQuery]);

  // Open Delivery Modal for a requisition
  const handleOpenDeliveryModal = (req: typeof approvedListWithRest[0]) => {
    setDeliveringReq(req);
    // Initialize delivery quantities & colours from requisition required values
    const initialQtys: Record<string, number> = {};
    const initialCols: Record<string, { red?: number; black?: number; yellow?: number; green?: number; blue?: number; others?: number }> = {};
    req.linesWithRest.forEach((l) => {
      initialQtys[l.id] = l.restQty > 0 ? l.restQty : 0;
      const col = extractReqLineColors(l);
      const prevDelCol = (l as any).deliveredColors || {};
      initialCols[l.id] = {
        red: Math.max(0, (col.red || 0) - (Number(prevDelCol.red) || 0)),
        black: Math.max(0, (col.black || 0) - (Number(prevDelCol.black ?? prevDelCol.blk) || 0)),
        yellow: Math.max(0, (col.yellow || 0) - (Number(prevDelCol.yellow ?? prevDelCol.yel) || 0)),
        green: Math.max(0, (col.green || 0) - (Number(prevDelCol.green ?? prevDelCol.grn) || 0)),
        blue: Math.max(0, (col.blue || 0) - (Number(prevDelCol.blue ?? prevDelCol.blu) || 0)),
        others: Math.max(0, (col.others || 0) - (Number(prevDelCol.others) || 0))
      };
    });
    setDeliveryQuantities(initialQtys);
    setDeliveryColorInputs(initialCols);
  };

  // Calculate the next generated Bill No based on delivery count
  // "if any requisition delivered two times then Bill no will be Like 20, 20-A, 20-B."
  const getNextBillNo = (req: Requisition): string => {
    const baseBillNo = extractBillNoFromReqNo(req.reqNo, req.seqNumber);
    const prevDeliveryCount = (req.deliveryCount || (req.partialDeliveries?.length || 0));
    if (prevDeliveryCount === 0) {
      return baseBillNo;
    }
    // 2nd delivery: 20-A (char code 65)
    // 3rd delivery: 20-B (char code 66)
    // 4th delivery: 20-C (char code 67)
    const letter = String.fromCharCode(64 + prevDeliveryCount);
    return `${baseBillNo}-${letter}`;
  };

  // Confirm delivery, generate bill, and store in Stored Bills
  const handleConfirmDeliveryAndBill = () => {
    if (!deliveringReq) return;

    // Validate that at least one item has delivery quantity > 0
    let totalBatchQty = 0;
    const linesToDeliver: Array<{
      id: string;
      itemId?: string;
      itemName?: string;
      description: string;
      sizeSpec?: string;
      deliveringQty: number;
      unit: string;
      rate: number;
      amount: number;
      remarks?: string;
    }> = [];

    deliveringReq.linesWithRest.forEach((l) => {
      const deliveringQty = Number(deliveryQuantities[l.id] || 0);
      if (deliveringQty > 0) {
        totalBatchQty += deliveringQty;
        let matchedRate = Number(l.rate) || 0;
        if (!matchedRate && items.length > 0) {
          const mItem = items.find(
            (it) => it.id === l.itemId || it.name.toLowerCase().trim() === (l.itemName || l.description || '').toLowerCase().trim()
          );
          if (mItem) matchedRate = mItem.rate || 0;
        }
        linesToDeliver.push({
          id: l.id,
          itemId: l.itemId,
          itemName: l.itemName,
          description: l.itemName || l.description || 'Cable Item',
          sizeSpec: l.sizeSpec || l.remarks || '',
          deliveringQty,
          unit: l.unit || 'Coils',
          rate: matchedRate,
          amount: Math.round(deliveringQty * matchedRate),
          remarks: l.remarks
        });
      }
    });

    if (totalBatchQty <= 0) {
      alert('Please enter at least 1 coil to deliver.');
      return;
    }

    const generatedBillNo = getNextBillNo(deliveringReq);
    const newBillId = `bill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const deliveryTimestamp = new Date().toISOString();

    // Salesperson info
    const spMatch = salespersons.find(
      (s) =>
        isMarketingOfficer(s) &&
        (s.code === deliveringReq.marketingPersonName ||
          (s.name && s.name.toLowerCase().includes((deliveringReq.marketingPersonName || '').toLowerCase())) ||
          (deliveringReq.marketingPersonName && deliveringReq.marketingPersonName.toLowerCase().includes((s.name || '').toLowerCase())))
    );
    const spCode = spMatch?.code || '134';
    const spName = spMatch?.name || 'Subrata Sutradhar';

    // Calculate Bill Amounts
    const subtotal = linesToDeliver.reduce((sum, l) => sum + l.amount, 0);
    const discountPercent = deliveringReq.discountPercent !== undefined ? deliveringReq.discountPercent : 10;
    const discountAmount = Math.round((subtotal * discountPercent) / 100);
    const grandTotal = Math.max(0, subtotal - discountAmount);

    // 1. Create StoredBill and save directly to Stored Bills
    const newBill: StoredBill = {
      id: newBillId,
      savedAt: deliveryTimestamp,
      date: getTodayISO(),
      billNo: generatedBillNo,
      company: company,
      header: {
        partyName: deliveringReq.partyName || 'Customer',
        customerName: deliveringReq.partyName,
        address: deliveringReq.partyAddress || 'Madhupur',
        customerAddress: deliveringReq.partyAddress,
        orderNumber: generatedBillNo,
        billNo: generatedBillNo,
        challanNo: '',
        refNo: generatedBillNo,
        salesmanCode: spCode,
        salespersonName: spName,
        salesmanName: spName,
        date: getTodayISO(),
        orderDate: getTodayISO(),
        challanDate: getTodayISO(),
        discountPercent: discountPercent,
        discountAmount: discountAmount,
        isOfficeBill: true,
        branchId: deliveringReq.branchId,
        branchName: deliveringReq.branchName,
        notes: `Generated by Factory for Requisition #${deliveringReq.reqNo} (Bill #${generatedBillNo})`
      },
      lines: linesToDeliver.map((l, idx) => {
        const lineCols = deliveryColorInputs[l.id] || {};
        const colSum =
          (Number(lineCols.red) || 0) +
          (Number(lineCols.black) || 0) +
          (Number(lineCols.yellow) || 0) +
          (Number(lineCols.green) || 0) +
          (Number(lineCols.blue) || 0) +
          (Number(lineCols.others) || 0);
        return {
          id: `bline-${Date.now()}-${idx}`,
          slNo: idx + 1,
          itemId: l.itemId,
          itemDescription: l.description,
          sizeSpec: l.sizeSpec,
          coilQty: l.deliveringQty,
          unit: l.unit,
          rate: l.rate,
          amount: l.amount,
          remarks: l.remarks,
          ...(colSum > 0
            ? {
                colorBreakdown: {
                  red: Number(lineCols.red) || 0,
                  black: Number(lineCols.black) || 0,
                  yellow: Number(lineCols.yellow) || 0,
                  green: Number(lineCols.green) || 0,
                  blue: Number(lineCols.blue) || 0,
                  others: Number(lineCols.others) || 0
                }
              }
            : {})
        };
      }),
      subtotal: subtotal,
      discountAmount: discountAmount,
      grandTotal: grandTotal,
      netTotal: grandTotal,
      inWords: convertToTakaWords(grandTotal) + ' Taka Only',
      totalCoils: totalBatchQty,
      status: 'saved',
      isOfficeBill: true,
      branchId: deliveringReq.branchId,
      branchName: deliveringReq.branchName,
      partyName: deliveringReq.partyName
    };

    // Store in Stored Bills
    setStoredBills((prev) => {
      const next = [newBill, ...prev.filter((b) => b.id !== newBill.id && b.billNo !== generatedBillNo)];
      try {
        localStorage.setItem('polycables_stored_bills', JSON.stringify(next));
      } catch {}
      return next;
    });

    // 2. Update Requisition: increment deliveredQty on each line, record partial delivery, check if fully delivered
    setRequisitions((prev) => {
      const updated = prev.map((r) => {
        if (r.id === deliveringReq.id) {
          const updatedLines = (r.lines || []).map((l) => {
            const deliveredInThisShipment = Number(deliveryQuantities[l.id] || 0);
            return {
              ...l,
              deliveredQty: Number(l.deliveredQty || 0) + deliveredInThisShipment
            };
          });

          const totalReqCoils = updatedLines.reduce((sum, l) => sum + Number(l.requestedQty || l.quantity || 0), 0);
          const totalDeliveredSoFar = updatedLines.reduce((sum, l) => sum + Number(l.deliveredQty || 0), 0);
          const allDelivered = totalReqCoils > 0 && totalDeliveredSoFar >= totalReqCoils;

          const prevDeliveries = (r as any).partialDeliveries || [];
          const newDeliveryRecord = {
            billId: newBillId,
            billNo: generatedBillNo,
            deliveredAt: deliveryTimestamp,
            deliveredQty: totalBatchQty,
            lines: linesToDeliver
          };

          const prevBillNumbers = (r as any).deliveredBillNumbers || [];
          const nextBillNumbers = Array.from(new Set([...prevBillNumbers, generatedBillNo]));
          const nextDeliveryCount = (r.deliveryCount || prevDeliveries.length) + 1;

          const nextStage: RequisitionStage = allDelivered ? 'converted_to_bill' : 'sent_to_factory';

          return {
            ...r,
            lines: updatedLines,
            deliveryCount: nextDeliveryCount,
            deliveredBillNumbers: nextBillNumbers,
            partialDeliveries: [...prevDeliveries, newDeliveryRecord],
            stage: nextStage,
            percentage: totalReqCoils > 0 ? Math.min(100, Math.round((totalDeliveredSoFar / totalReqCoils) * 100)) : 100,
            isLocked: allDelivered ? true : r.isLocked,
            convertedBillNo: allDelivered ? generatedBillNo : r.convertedBillNo,
            convertedBillId: allDelivered ? newBillId : r.convertedBillId,
            convertedAt: allDelivered ? deliveryTimestamp : r.convertedAt,
            updatedAt: deliveryTimestamp
          };
        }
        return r;
      });

      try {
        localStorage.setItem('polycables_requisitions', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    setDeliveringReq(null);
    setDeliverySuccessToast(
      `✓ Delivery completed! Bill #${generatedBillNo} for ${deliveringReq.partyName || 'Customer'} (${totalBatchQty} coils) has been saved to Stored Bills.`
    );
    setTimeout(() => setDeliverySuccessToast(null), 5000);
  };

  return (
    <div className="w-full space-y-4 text-white">
      {/* Top Banner */}
      <div className="cyber-glass-card rounded-2xl p-4 sm:p-5 text-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-amber-500/20 border border-amber-400/35 rounded-xl text-amber-300">
            <Factory className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-wide text-white flex items-center gap-2">
              <span>FACTORY OPERATIONS &amp; DISPATCH</span>
              <span className="text-[10px] font-bold bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full uppercase">
                Orders Hub
              </span>
            </h1>
            <p className="text-xs text-slate-300 mt-0.5">
              Approved requisition delivery tracking, rest goods list, and multi-batch bill generation.
            </p>
          </div>
        </div>

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="px-3 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            ← Back
          </button>
        )}
      </div>

      {/* Success Notification Toast */}
      {deliverySuccessToast && (
        <div className="p-3 bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 rounded-xl text-xs font-bold flex items-center justify-between shadow-lg animate-in fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
            <span>{deliverySuccessToast}</span>
          </div>
          <button
            onClick={() => setDeliverySuccessToast(null)}
            className="text-emerald-300 hover:text-white p-1 text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Navigation Sub-Tabs: Approved History vs Delivered */}
      <div className="flex items-center space-x-2 border-b border-cyan-500/25 pb-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('approved_history')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
            activeSubTab === 'approved_history'
              ? 'bg-[#0e2d42] text-amber-300 border-amber-400/60 shadow-md'
              : 'bg-[#081b28] text-slate-300 hover:text-white hover:bg-[#0e2a3d] border-cyan-500/25'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Approved History ({approvedListWithRest.filter((r) => !r.isFullyDelivered).length} Pending/Rest Goods)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('delivered')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
            activeSubTab === 'delivered'
              ? 'bg-[#0e2d42] text-emerald-300 border-emerald-400/60 shadow-md'
              : 'bg-[#081b28] text-slate-300 hover:text-white hover:bg-[#0e2a3d] border-cyan-500/25'
          }`}
        >
          <PackageCheck className="w-4 h-4" />
          <span>Delivered Sub Menu ({deliveredHistoryList.length})</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-[#0b2334]/80 border border-cyan-500/25 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative flex-1 min-w-0 w-full sm:w-auto sm:min-w-[220px] sm:max-w-md">
          <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search req no, party name, items..."
            className="w-full bg-[#061520] border border-cyan-500/30 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Sales Center Filter */}
        <div className="flex items-center space-x-1.5">
          <Building2 className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-cyan-200 font-bold text-[11px]">Sales Center:</span>
          <select
            value={selectedBranchFilter}
            onChange={(e) => setSelectedBranchFilter(e.target.value)}
            className="bg-[#061520] text-cyan-200 border border-cyan-500/30 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none"
          >
            <option value="All">All Sales Centers</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Delivery State Filter */}
        {activeSubTab === 'approved_history' && (
          <div className="flex items-center space-x-1.5">
            <span className="text-cyan-200 font-bold text-[11px]">Status:</span>
            <select
              value={deliveryFilter}
              onChange={(e) => setDeliveryFilter(e.target.value as any)}
              className="bg-[#061520] text-amber-300 border border-cyan-500/30 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none"
            >
              <option value="all">All Rest Goods</option>
              <option value="partial">Partially Delivered Only</option>
              <option value="pending_rest">Pending First Delivery</option>
              <option value="full">Fully Delivered</option>
            </select>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 1. APPROVED HISTORY TAB: SHOWS REQUISITIONS & REST GOODS */}
      {/* ======================================================== */}
      {activeSubTab === 'approved_history' && (
        <div className="space-y-3">
          {filteredApprovedHistory.length === 0 ? (
            <div className="cyber-glass-card rounded-xl p-8 text-center text-slate-300 space-y-2">
              <Boxes className="w-10 h-10 mx-auto text-cyan-400/60 mb-1" />
              <p className="font-bold text-white text-sm">No Approved Requisitions Pending Delivery</p>
              <p className="text-xs text-slate-400">
                Without admin approval, requisitions do not appear here. Once the sales center admin approves a requisition, it will appear with its rest goods list.
              </p>
            </div>
          ) : (
            filteredApprovedHistory.map((req) => (
              <div
                key={req.id}
                className="cyber-glass-subcard rounded-xl overflow-hidden shadow-md transition-all hover:border-cyan-400/45"
              >
                {/* Requisition Card Header */}
                <div className="bg-[#0c2638]/90 px-4 py-3 border-b border-cyan-500/25 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-amber-300 text-sm font-mono tracking-wide">
                      #{req.reqNo}
                    </span>
                    <span className="text-white font-bold text-xs">
                      {req.partyName || 'Customer'}
                    </span>
                    <span className="text-slate-400 text-xs">•</span>
                    <span className="text-cyan-300 font-semibold text-xs flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      {req.branchName || 'Sales Center'}
                    </span>
                    <span className="text-slate-400 text-xs">•</span>
                    <span className="text-emerald-300 font-semibold text-xs flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {marketingPersonLabel(req.marketingPersonName)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Delivery Status Badge */}
                    {req.isFullyDelivered ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Fully Delivered (100%)
                      </span>
                    ) : req.isPartiallyDelivered ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-400/40 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Partially Delivered ({req.totalDeliveredQty} / {req.totalReqQty} Coils Delivered)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-400/40 flex items-center gap-1">
                        Pending Delivery (0 / {req.totalReqQty} Coils)
                      </span>
                    )}

                    {/* Make Delivery Button */}
                    {!req.isFullyDelivered && (
                      <button
                        type="button"
                        onClick={() => handleOpenDeliveryModal(req)}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-black flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
                        title="Deliver goods & generate bill (e.g. 20, 20-A, 20-B)"
                      >
                        <Truck className="w-3.5 h-3.5" />
                        <span>Deliver Goods (Bill)</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Rest Goods List Table */}
                <div className="p-3 overflow-x-auto">
                  <div className="text-[11px] font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                    <span className="text-amber-300 font-extrabold uppercase tracking-wider text-[10px]">
                      Rest Goods List (Remaining to Deliver: {req.totalRestQty} Coils)
                    </span>
                    <span className="text-slate-300 text-[10px]">
                      Approved: {formatDateDDMMYY(req.date)} • Approved By: {req.approvedBy || req.approverName || 'Admin'}
                    </span>
                  </div>

                  <div className="border border-cyan-500/25 bg-[#071824]/70 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#0c2638] text-cyan-200 font-bold border-b border-cyan-500/30 text-[10px] uppercase">
                          <th className="p-2 w-10 text-center">SL</th>
                          <th className="p-2">Item Name / Cable Spec</th>
                          <th className="p-2 text-center w-16">Unit</th>
                          <th className="p-2 text-right w-20">Rate</th>
                          <th className="p-2 text-center w-24">Approved Qty</th>
                          <th className="p-2 text-center w-24">Delivered Qty</th>
                          <th className="p-2 text-center w-28 bg-amber-500/15 text-amber-300">Rest Goods Qty</th>
                          <th className="p-2 text-center w-28">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60">
                        {req.linesWithRest.map((line, idx) => (
                          <tr
                            key={line.id}
                            className={`hover:bg-cyan-500/[0.06] ${
                              line.restQty > 0 ? 'bg-amber-500/[0.06]' : 'opacity-70'
                            }`}
                          >
                            <td className="p-2 text-center text-slate-400 font-mono">{idx + 1}</td>
                            <td className="p-2 font-bold text-white">
                              <div>{line.itemName || line.description}</div>
                              {line.remarks && (
                                <div className="text-[10px] text-slate-400 font-normal">{line.remarks}</div>
                              )}
                            </td>
                            <td className="p-2 text-center text-slate-300">{line.unit || 'Coils'}</td>
                            <td className="p-2 text-right font-mono text-slate-200">৳{line.rate || 0}</td>
                            <td className="p-2 text-center font-mono font-bold text-slate-200">
                              {line.approvedQty}
                            </td>
                            <td className="p-2 text-center font-mono text-emerald-300 font-bold">
                              {line.deliveredQty}
                            </td>
                            <td className="p-2 text-center font-mono font-black text-amber-300 bg-amber-500/10">
                              {line.restQty > 0 ? (
                                <span className="text-amber-300 font-extrabold">{line.restQty} Rest</span>
                              ) : (
                                <span className="text-emerald-300 font-bold">0 (Complete)</span>
                              )}
                            </td>
                            <td className="p-2 text-center">
                              {line.restQty === 0 ? (
                                <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-400/30 px-1.5 py-0.5 rounded">
                                  Complete ✓
                                </span>
                              ) : line.deliveredQty > 0 ? (
                                <span className="text-[10px] font-bold text-amber-300 bg-amber-500/20 border border-amber-400/30 px-1.5 py-0.5 rounded">
                                  Partial
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-slate-300 bg-[#0b2334] border border-cyan-500/25 px-1.5 py-0.5 rounded">
                                  Pending
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Previous Deliveries / Generated Bills summary */}
                  {req.deliveredBillNumbers && req.deliveredBillNumbers.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-cyan-500/20 text-xs flex flex-wrap items-center gap-2">
                      <span className="text-cyan-200 font-bold text-[11px]">Generated Bills:</span>
                      {req.deliveredBillNumbers.map((billNo) => (
                        <span
                          key={billNo}
                          className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-emerald-500/20 text-emerald-200 border border-emerald-400/35 flex items-center gap-1"
                        >
                          <Receipt className="w-3 h-3 text-emerald-300" />
                          Bill #{billNo}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. DELIVERED SUB MENU: SHOWS ALL COMPLETED DELIVERIES    */}
      {/* ======================================================== */}
      {activeSubTab === 'delivered' && (
        <div className="space-y-3">
          {deliveredHistoryList.length === 0 ? (
            <div className="cyber-glass-card rounded-xl p-8 text-center text-slate-300 space-y-2">
              <PackageCheck className="w-10 h-10 mx-auto text-cyan-400/60 mb-1" />
              <p className="font-bold text-white text-sm">No Deliveries Recorded Yet</p>
              <p className="text-xs text-slate-400">
                When you dispatch/deliver goods from the Approved History page, the delivery records and bills will appear here.
              </p>
            </div>
          ) : (
            deliveredHistoryList.map((req) => (
              <div
                key={req.id}
                className="cyber-glass-subcard rounded-xl overflow-hidden shadow-md"
              >
                <div className="bg-[#0c2638]/90 px-4 py-3 border-b border-cyan-500/25 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-emerald-300 text-sm font-mono tracking-wide">
                      Requisition #{req.reqNo}
                    </span>
                    <span className="text-white font-bold text-xs">
                      {req.partyName || 'Customer'}
                    </span>
                    <span className="text-slate-400 text-xs">•</span>
                    <span className="text-cyan-300 font-semibold text-xs flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      {req.branchName || 'Sales Center'}
                    </span>
                    <span className="text-slate-400 text-xs">•</span>
                    <span className="text-amber-300 font-semibold text-xs flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {marketingPersonLabel(req.marketingPersonName)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {req.isFullyDelivered ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                        ✓ All Goods Delivered
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-400/40">
                        ⚡ Partial Delivery (Remaining: {req.totalRestQty} Coils)
                      </span>
                    )}

                    {onNavigateToStoredBills && (
                      <button
                        type="button"
                        onClick={() => onNavigateToStoredBills()}
                        className="px-2.5 py-1 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer"
                        title="View in Stored Bills"
                      >
                        <ExternalLink className="w-3 h-3 text-cyan-300" />
                        <span>Stored Bills</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-3 space-y-3">
                  {/* Generated Bills & Shipment Batches */}
                  <div>
                    <div className="text-[11px] font-bold text-cyan-200 uppercase tracking-wider mb-1.5">
                      Shipment Batches &amp; Stored Bills Generated:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(req.deliveredBillNumbers || [extractBillNoFromReqNo(req.reqNo, req.seqNumber)]).map((bNo) => {
                        const matchedStoredBill = storedBills.find(
                          (sb) => sb.billNo === bNo || (sb.header && sb.header.billNo === bNo)
                        );
                        return (
                          <div
                            key={bNo}
                            className="bg-[#071824] border border-cyan-500/25 p-2.5 rounded-xl text-xs space-y-1 min-w-[200px]"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono font-black text-emerald-300 text-sm">
                                Bill #{bNo}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400">
                                {matchedStoredBill ? formatDateDDMMYY(matchedStoredBill.date) : formatDateDDMMYY(req.date)}
                              </span>
                            </div>
                            <div className="text-slate-300 text-xs">
                              Amount: <strong className="font-mono text-white">৳{(matchedStoredBill?.grandTotal || req.totalAmount || 0).toLocaleString()}</strong>
                            </div>
                            {onNavigateToStoredBills && matchedStoredBill && (
                              <button
                                type="button"
                                onClick={() => onNavigateToStoredBills(matchedStoredBill.id)}
                                className="text-[11px] text-cyan-300 hover:text-cyan-200 font-bold flex items-center space-x-1 cursor-pointer"
                              >
                                <span>Open Bill Details</span>
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Summary of Items Delivered */}
                  <div className="overflow-x-auto border border-cyan-500/25 bg-[#071824]/70 rounded-xl">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#0c2638] text-cyan-200 font-bold border-b border-cyan-500/30 text-[10px] uppercase">
                          <th className="p-2 w-10 text-center">SL</th>
                          <th className="p-2">Item Name / Cable Spec</th>
                          <th className="p-2 text-center w-16">Unit</th>
                          <th className="p-2 text-center w-24">Approved Qty</th>
                          <th className="p-2 text-center w-24 text-emerald-300">Delivered Qty</th>
                          <th className="p-2 text-center w-24 text-amber-300">Remaining Rest</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60">
                        {req.linesWithRest.map((line, idx) => (
                          <tr key={line.id} className="hover:bg-cyan-500/[0.06]">
                            <td className="p-2 text-center text-slate-400 font-mono">{idx + 1}</td>
                            <td className="p-2 font-bold text-white">{line.itemName || line.description}</td>
                            <td className="p-2 text-center text-slate-300">{line.unit || 'Coils'}</td>
                            <td className="p-2 text-center font-mono text-slate-200">{line.approvedQty}</td>
                            <td className="p-2 text-center font-mono font-bold text-emerald-300">{line.deliveredQty}</td>
                            <td className="p-2 text-center font-mono text-amber-300 font-bold">
                              {line.restQty > 0 ? `${line.restQty} Rest` : '0 (Complete)'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: DELIVER GOODS & GENERATE BILL (20, 20-A, 20-B)    */}
      {/* ======================================================== */}
      {deliveringReq && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-3 z-50 animate-in fade-in">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl border border-amber-400/45 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-[0_24px_64px_rgba(0,0,0,0.65)] text-white">
            {/* Modal Header */}
            <div className="p-4 bg-[#0c2638]/90 border-b border-cyan-500/25 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Truck className="w-5 h-5 text-amber-300" />
                <div>
                  <h3 className="font-extrabold text-white text-sm flex items-center gap-2">
                    <span>Deliver Goods for Requisition #{deliveringReq.reqNo}</span>
                  </h3>
                  <p className="text-xs text-slate-300">
                    Customer: <span className="text-cyan-200 font-bold">{deliveringReq.partyName || 'Customer'}</span> • Sales Center: {deliveringReq.branchName}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDeliveringReq(null)}
                className="p-1 text-slate-300 hover:text-white hover:bg-cyan-500/15 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Item Quantities Input & Bill No Preview */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {/* Bill No Calculation Banner */}
              <div className="bg-amber-500/10 border border-amber-400/35 p-3 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                    Generated Bill No (Auto Sequence Rule):
                  </div>
                  <div className="text-xl font-black font-mono text-white mt-0.5">
                    Bill #{getNextBillNo(deliveringReq)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-300 font-semibold">Delivery Batch:</div>
                  <div className="text-xs font-bold text-amber-300">
                    Delivery {(deliveringReq.deliveryCount || (deliveringReq.partialDeliveries?.length || 0)) + 1}
                  </div>
                  <div className="text-[9px] text-slate-400">
                    Rule: 20 → 20-A → 20-B
                  </div>
                </div>
              </div>

              {/* Items to deliver table */}
              <div>
                <label className="block text-xs font-bold text-cyan-200 mb-1.5">
                  Specify Quantity Delivering in this Shipment (Rest Goods):
                </label>
                <div className="border border-cyan-500/25 bg-[#071824]/70 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#0c2638] text-cyan-200 font-bold border-b border-cyan-500/30 text-[10px] uppercase">
                        <th className="p-2.5">Item Name</th>
                        <th className="p-2.5 text-center w-20">Rest Qty</th>
                        <th className="p-2.5 text-center w-28 bg-amber-500/15 text-amber-300">Delivering Now</th>
                        <th className="p-2.5 text-right w-20">Rate</th>
                        <th className="p-2.5 text-right w-24">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60">
                      {deliveringReq.linesWithRest.map((line) => {
                        const curQty = deliveryQuantities[line.id] !== undefined ? deliveryQuantities[line.id] : line.restQty;
                        const sub = Math.round(curQty * (line.rate || 0));
                        const colInfo = extractReqLineColors(line);
                        const matchedCatItem = items.find(
                          (it) => it.id === line.itemId || it.name.toLowerCase().trim() === (line.itemName || line.description || '').toLowerCase().trim()
                        );
                        const needsColorBox =
                          colInfo.badges.length > 0 ||
                          isColorApplicableCable(
                            matchedCatItem || {
                              name: line.itemName || line.description || '',
                              category: (line as any).category || ''
                            }
                          );
                        const curCol = deliveryColorInputs[line.id] || {};
                        const colorFields: Array<{ key: 'red' | 'black' | 'yellow' | 'green' | 'blue' | 'others'; label: string; cls: string }> = [
                          { key: 'red', label: 'Red', cls: 'border-rose-400/50 text-rose-300' },
                          { key: 'black', label: 'Blk', cls: 'border-slate-400/50 text-slate-200' },
                          { key: 'yellow', label: 'Yel', cls: 'border-amber-400/50 text-amber-300' },
                          { key: 'green', label: 'Grn', cls: 'border-emerald-400/50 text-emerald-300' },
                          { key: 'blue', label: 'Blu', cls: 'border-sky-400/50 text-sky-300' },
                          { key: 'others', label: 'Oth', cls: 'border-purple-400/50 text-purple-300' }
                        ];
                        return (
                          <tr key={line.id} className="hover:bg-cyan-500/[0.06]">
                            <td className="p-2.5 font-bold text-white">
                              <div>{line.itemName || line.description}</div>
                              {colInfo.badges.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  <span className="text-[9px] text-cyan-300 font-bold">Req:</span>
                                  {colInfo.badges.map((b) => (
                                    <span key={b.key} className={`px-1 py-0.2 rounded border text-[9px] font-mono ${b.darkClass}`}>
                                      {b.label}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {needsColorBox && (
                                <div className="mt-1.5 grid grid-cols-3 sm:grid-cols-6 gap-1">
                                  {colorFields.map((cf) => {
                                    const cv = Number(curCol[cf.key] || 0);
                                    return (
                                      <div key={cf.key} className="flex flex-col">
                                        <span className={`text-[8.5px] font-bold text-center ${cf.cls}`}>{cf.label}</span>
                                        <input
                                          type="number"
                                          min={0}
                                          max={line.restQty}
                                          value={cv === 0 ? '' : cv}
                                          onChange={(e) => {
                                            const nv = Math.max(0, parseInt(e.target.value, 10) || 0);
                                            const nextCol = { ...curCol, [cf.key]: nv };
                                            const sumCol =
                                              (Number(nextCol.red) || 0) +
                                              (Number(nextCol.black) || 0) +
                                              (Number(nextCol.yellow) || 0) +
                                              (Number(nextCol.green) || 0) +
                                              (Number(nextCol.blue) || 0) +
                                              (Number(nextCol.others) || 0);
                                            setDeliveryColorInputs((prev) => ({ ...prev, [line.id]: nextCol }));
                                            setDeliveryQuantities((prev) => ({
                                              ...prev,
                                              [line.id]: Math.min(line.restQty, sumCol)
                                            }));
                                          }}
                                          placeholder="0"
                                          className={`w-full p-0.5 text-center font-mono font-bold text-[10px] bg-[#061520] border rounded ${cf.cls}`}
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                            <td className="p-2.5 text-center font-mono text-amber-300 font-bold align-top">
                              {line.restQty} {line.unit || 'Coils'}
                            </td>
                            <td className="p-2.5 text-center bg-amber-500/10 align-top">
                              <input
                                type="number"
                                min={0}
                                max={line.restQty}
                                value={curQty}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  const safeVal = isNaN(val) ? 0 : Math.min(line.restQty, Math.max(0, val));
                                  setDeliveryQuantities((prev) => ({
                                    ...prev,
                                    [line.id]: safeVal
                                  }));
                                }}
                                className="w-20 p-1 bg-[#061520] border border-amber-400/50 rounded text-center font-mono font-black text-amber-300 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                              />
                            </td>
                            <td className="p-2.5 text-right font-mono text-slate-300 align-top">
                              ৳{line.rate || 0}
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold text-white align-top">
                              ৳{sub.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-[#071824]/90 border-t border-cyan-500/20 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setDeliveringReq(null)}
                className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmDeliveryAndBill}
                className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-black flex items-center space-x-2 shadow-lg transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm Delivery &amp; Store Bill #{getNextBillNo(deliveringReq)}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
