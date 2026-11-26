import React, { useState, useMemo } from 'react';
import { FactoryImportChallan, CompanyDetails, BranchLocation } from '../types';
import { defaultBranches } from '../data/defaultData';
import { X, Printer, Search, Building2, Lock } from 'lucide-react';
import { formatDateDDMMYY } from '../utils/dateUtils';
import { getBranchHeaderAddress } from '../utils/branchAddressHelper';
import { useAutoPrintOnOpen } from '../hooks/useAutoPrintOnOpen';

interface FactoryImportHistoryPrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  challans: FactoryImportChallan[];
  company?: CompanyDetails;
  branches?: BranchLocation[];
  initialBranchId?: string;
  initialSearch?: string;
  onSelectChallanForPrint?: (challan: FactoryImportChallan) => void;
}

export const FactoryImportHistoryPrintPreviewModal: React.FC<FactoryImportHistoryPrintPreviewModalProps> = ({
  isOpen,
  onClose,
  challans,
  company,
  branches = defaultBranches,
  initialBranchId = 'ALL',
  initialSearch = '',
  onSelectChallanForPrint
}) => {
  const effectiveBranches = useMemo(() => {
    return branches && branches.length > 0 ? branches : defaultBranches;
  }, [branches]);

  const isBranchLocked = effectiveBranches.length === 1 || (Boolean(initialBranchId) && initialBranchId !== 'ALL');

  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    if (initialBranchId && initialBranchId !== 'ALL') return initialBranchId;
    if (effectiveBranches.length === 1) return effectiveBranches[0].id;
    return 'ALL';
  });

  const selectedBranchObj = useMemo(() => {
    if (selectedBranchId === 'ALL') return null;
    return effectiveBranches.find((b) => b.id === selectedBranchId) || null;
  }, [effectiveBranches, selectedBranchId]);

  const branchHeaderInfo = useMemo(() => {
    return getBranchHeaderAddress(selectedBranchId, effectiveBranches, company);
  }, [selectedBranchId, effectiveBranches, company]);

  const filteredChallans = useMemo(() => {
    return challans.filter((c) => {
      // Branch filter
      if (selectedBranchId !== 'ALL') {
        const isMatch =
          c.branchId === selectedBranchId ||
          (!c.branchId && (selectedBranchId === 'branch-1' || selectedBranchId === 'branch-main'));
        if (!isMatch) return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNo = (c.challanNo || '').toLowerCase().includes(q);
        const matchReq = (c.reqNo || '').toLowerCase().includes(q);
        const matchDriver = (c.driverName || '').toLowerCase().includes(q);
        const matchCar = (c.carNumber || '').toLowerCase().includes(q);
        const matchBranch = (c.branchName || '').toLowerCase().includes(q);
        const matchNotes = (c.remarks || '').toLowerCase().includes(q);
        if (!matchNo && !matchReq && !matchDriver && !matchCar && !matchBranch && !matchNotes) {
          return false;
        }
      }
      return true;
    });
  }, [challans, selectedBranchId, searchQuery]);

  const { totalShipments, totalQuantity, totalAmount } = useMemo(() => {
    let qty = 0;
    let amt = 0;
    filteredChallans.forEach((c) => {
      qty += Number(c.totalQuantity) || 0;
      amt += Number(c.totalAmount) || 0;
    });
    return {
      totalShipments: filteredChallans.length,
      totalQuantity: qty,
      totalAmount: amt
    };
  }, [filteredChallans]);

  const currentDateFormatted = formatDateDDMMYY(new Date().toISOString().split('T')[0]);

  useAutoPrintOnOpen(isOpen, () => window.print());

  if (!isOpen) return null;

  return (
    <div className="print-preview-modal-backdrop fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in print:p-0 print:bg-white">
      {/* Print Stylesheet */}
      <style>{`
        @media print {
          body, html {
            background-color: #ffffff !important;
            color: #000000 !important;
          }
          .print-preview-modal-root {
            background-color: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .print-clean-paper {
            box-shadow: none !important;
            border: none !important;
            max-width: 100% !important;
            width: 100% !important;
            padding: 4mm !important;
            color: #000000 !important;
            background-color: #ffffff !important;
          }
          .print-clean-paper * {
            color: #000000 !important;
          }
        }
      `}</style>

      <div className="print-preview-modal-dialog print-preview-modal-root bg-white text-slate-900 rounded-2xl max-w-5xl w-full max-h-[95vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden print:border-none print:shadow-none print:w-full print:max-w-none print:h-auto print:max-h-none">
        {/* Modal Toolbar (Hidden during print) */}
        <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 flex-none print:hidden">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-50 text-amber-700 rounded-xl border border-amber-200">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900">Factory Import History Register</h2>
              <p className="text-xs text-slate-600 font-medium">
                Print Preview • {filteredChallans.length} shipments shown
                {selectedBranchObj ? ` • ${selectedBranchObj.name}` : ` • All Sales Centers (${effectiveBranches.length})`}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Import Register</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Controls Bar (Hidden during print) */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs flex-none print:hidden">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search challan, req, driver, car..."
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-900"
              />
            </div>

            {/* Sales Center Filter */}
            <div className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl border shadow-2xs ${
              isBranchLocked ? 'bg-amber-50/80 border-amber-300' : 'bg-white border-slate-300'
            }`}>
              {isBranchLocked ? (
                <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              ) : (
                <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              )}
              <span className="text-[11px] font-bold text-slate-700 whitespace-nowrap">Sales Center:</span>
              <select
                value={selectedBranchId}
                onChange={(e) => {
                  if (!isBranchLocked) {
                    setSelectedBranchId(e.target.value);
                  }
                }}
                disabled={isBranchLocked}
                className={`bg-transparent font-bold focus:outline-none text-xs ${
                  isBranchLocked ? 'text-amber-900 cursor-not-allowed' : 'text-slate-900 cursor-pointer'
                }`}
              >
                {!isBranchLocked && (
                  <option value="ALL">All Sales Centers ({effectiveBranches.length})</option>
                )}
                {effectiveBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              {isBranchLocked && (
                <span className="text-[10px] bg-amber-200/80 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded font-semibold tracking-wide">
                  Locked
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Printable Document Paper Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 flex justify-center print:p-0 print:bg-white print:overflow-visible">
          <div className="print-clean-paper bg-white text-black w-full max-w-4xl p-6 sm:p-8 rounded-xl shadow-md border border-slate-200 space-y-6 print:border-none print:shadow-none print:max-w-none print:p-0">
            {/* Header */}
            <div className="text-center border-b-2 border-slate-900 pb-4 space-y-1">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-black uppercase">
                {selectedBranchId === 'ALL' ? 'POLY CABLES' : (branchHeaderInfo.companyName || company?.name || 'POLY CABLES')}
              </h1>
              {selectedBranchId === 'ALL' ? (
                <p className="text-xs font-bold text-slate-800 mt-1 max-w-3xl mx-auto leading-relaxed">
                  {effectiveBranches.map((b) => b.name).join(', ')}
                </p>
              ) : (
                <>
                  <p className="text-xs font-bold text-slate-800 mt-0.5">
                    {branchHeaderInfo.addressLine1}
                  </p>
                  {branchHeaderInfo.addressLine2 && (
                    <p className="text-xs font-bold text-slate-700">
                      {branchHeaderInfo.addressLine2}{branchHeaderInfo.phone ? ` Mob: ${branchHeaderInfo.phone}` : ''}
                    </p>
                  )}
                </>
              )}
              <div className="pt-2 flex flex-wrap items-center justify-between text-xs font-bold text-black border-t border-slate-300 mt-2 gap-2">
                <span className="bg-slate-100 px-2.5 py-1 rounded border border-slate-300 text-black font-black uppercase">
                  Factory Goods Import & Receiving Register
                </span>
                <span className="bg-blue-50 text-black px-2.5 py-1 rounded border border-blue-200 font-bold flex items-center space-x-1">
                  <Building2 className="w-3.5 h-3.5 text-blue-700 inline mr-1" />
                  <span>Sales Center: <strong>{selectedBranchObj ? selectedBranchObj.name : `All Sales Centers (${effectiveBranches.length})`}</strong></span>
                </span>
                <span className="font-mono text-black font-bold">
                  Print Date: <strong>{currentDateFormatted}</strong>
                </span>
              </div>
            </div>

            {/* History Table */}
            <div className="border border-slate-300 rounded-lg overflow-hidden bg-white">
              <table className="w-full text-left text-xs border-collapse text-black bg-white">
                <thead>
                  <tr className="bg-slate-100 text-black text-[11px] font-black border-b border-slate-300">
                    <th className="p-2 text-center w-10 border-r border-slate-300 text-black font-black">#</th>
                    <th className="p-2 w-24 border-r border-slate-300 text-black font-black">Date</th>
                    <th className="p-2 w-28 border-r border-slate-300 text-black font-black">Challan No.</th>
                    <th className="p-2 w-24 border-r border-slate-300 text-black font-black">Req. No.</th>
                    <th className="p-2 border-r border-slate-300 text-black font-black">Destination Center</th>
                    <th className="p-2 w-28 border-r border-slate-300 text-black font-black">Driver & Car</th>
                    <th className="p-2 w-16 text-center border-r border-slate-300 text-black font-black">Items</th>
                    <th className="p-2 w-24 text-center border-r border-slate-300 text-black font-black">Quantity</th>
                    <th className="p-2 w-28 text-right border-r border-slate-300 text-black font-black">Total Amount (৳)</th>
                    {onSelectChallanForPrint && (
                      <th className="p-2 w-20 text-center text-black font-black print:hidden">Action</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-medium">
                  {filteredChallans.length === 0 ? (
                    <tr>
                      <td colSpan={onSelectChallanForPrint ? 10 : 9} className="text-center py-8 text-slate-500 italic">
                        No factory import records found matching the filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredChallans.map((c, idx) => (
                      <tr key={c.id || idx} className="hover:bg-slate-50">
                        <td className="p-2 text-center text-slate-700 font-mono font-bold border-r border-slate-200">
                          {idx + 1}
                        </td>
                        <td className="p-2 font-mono text-black border-r border-slate-200 whitespace-nowrap">
                          {formatDateDDMMYY(c.date)}
                        </td>
                        <td className="p-2 font-mono font-black text-black border-r border-slate-200 whitespace-nowrap">
                          {c.challanNo}
                        </td>
                        <td className="p-2 font-mono text-slate-700 border-r border-slate-200 whitespace-nowrap">
                          {c.reqNo || '-'}
                        </td>
                        <td className="p-2 font-bold text-black border-r border-slate-200 text-xs">
                          {c.branchName || 'Madhupur Sales Center'}
                        </td>
                        <td className="p-2 text-slate-800 text-[11px] border-r border-slate-200">
                          <div className="font-semibold">{c.driverName || '-'}</div>
                          {c.carNumber && <div className="text-[10px] text-slate-500 font-mono">Car: {c.carNumber}</div>}
                        </td>
                        <td className="p-2 text-center font-mono font-bold text-black border-r border-slate-200">
                          {c.lines?.length || 0}
                        </td>
                        <td className="p-2 text-center font-mono font-black text-black border-r border-slate-200 bg-slate-50/50">
                          {Number(c.totalQuantity || 0).toLocaleString('en-IN')} Coils
                        </td>
                        <td className="p-2 text-right font-mono font-black text-black border-r border-slate-200 bg-slate-50/50">
                          ৳{Number(c.totalAmount || 0).toLocaleString('en-IN')}
                        </td>
                        {onSelectChallanForPrint && (
                          <td className="p-2 text-center print:hidden">
                            <button
                              type="button"
                              onClick={() => onSelectChallanForPrint(c)}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 rounded text-[10px] font-bold cursor-pointer"
                              title="Print detailed goods receiving challan"
                            >
                              Voucher
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Grand Total Summary Box */}
            <div className="bg-slate-50 border-2 border-slate-900 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs font-black text-black">
              <div className="flex items-center space-x-2">
                <span className="uppercase tracking-wider">Grand Total Summary:</span>
                <span className="bg-white px-2.5 py-0.5 rounded border border-slate-300 font-mono font-bold">
                  {totalShipments} Total Shipments
                </span>
              </div>
              <div className="flex items-center space-x-6 font-mono">
                <div>
                  Total Received: <strong className="text-black font-black text-sm">{totalQuantity.toLocaleString('en-IN')} Coils</strong>
                </div>
                <div>
                  Total Valuation: <strong className="text-black font-black text-sm">৳{totalAmount.toLocaleString('en-IN')}</strong>
                </div>
              </div>
            </div>

            {/* Signatures */}
            <div className="pt-8 border-t border-slate-300 grid grid-cols-3 gap-4 text-center text-xs font-bold text-black">
              <div>
                <div className="border-t border-slate-400 pt-1 mt-6 text-black font-bold">Received & Entered By</div>
              </div>
              <div>
                <div className="border-t border-slate-400 pt-1 mt-6 text-black font-bold">Store In-Charge</div>
              </div>
              <div>
                <div className="border-t border-slate-400 pt-1 mt-6 text-black font-bold">Authorized Signature</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
