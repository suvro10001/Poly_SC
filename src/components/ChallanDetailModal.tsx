import React, { useState } from 'react';
import { Challan } from '../types';
import { useChallan } from '../context/ChallanContext';
import {
  Lock,
  Unlock,
  FileText,
  Printer,
  Receipt,
  X,
  CheckCircle2,
  AlertCircle,
  Truck,
  Building,
  Calendar,
  Sparkles,
  Layers,
} from 'lucide-react';

interface ChallanDetailModalProps {
  challan: Challan | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenInvoiceView: (invoiceId: string) => void;
  onPrintChallan: (challan: Challan) => void;
}

export const ChallanDetailModal: React.FC<ChallanDetailModalProps> = ({
  challan,
  isOpen,
  onClose,
  onOpenInvoiceView,
  onPrintChallan,
}) => {
  const { generateBillFromChallan, unlockChallan } = useChallan();
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false);

  if (!isOpen || !challan) return null;

  const isLocked = challan.status === 'Fully Billed' || challan.isLocked;
  const totalDispatchedAmount = challan.items.reduce(
    (acc, it) => acc + it.dispatchedQty * it.unitPrice,
    0
  );

  const handleFullBillAction = () => {
    try {
      generateBillFromChallan(challan.id);
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUnlockAction = () => {
    unlockChallan(challan.id);
    setShowUnlockConfirm(false);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-150">
      <div
        id="challan-detail-modal-container"
        className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] w-full max-w-4xl overflow-hidden border border-cyan-400/35 flex flex-col max-h-[90vh] text-white"
      >
        {/* Header */}
        <div className="px-6 py-4 cyber-glass-header border-b border-cyan-500/25 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/20 border border-cyan-400/35 flex items-center justify-center">
              {isLocked ? (
                <Lock className="w-5 h-5 text-emerald-300" />
              ) : (
                <FileText className="w-5 h-5 text-cyan-300" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight text-white">
                  Challan {challan.challanNo}
                </h3>
                {isLocked ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                    <Lock className="w-3 h-3" /> Fully Billed (Locked)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-400/40">
                    {challan.status}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Created: {challan.date} • Dispatched value: ₹{totalDispatchedAmount.toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          <button
            id="close-challan-modal-btn"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/25 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Locked Mode Banner */}
        {isLocked && (
          <div
            id="locked-mode-banner"
            className="bg-emerald-500/15 border-b border-emerald-400/35 px-6 py-3 text-emerald-200 flex items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-center gap-2 font-medium">
              <Lock className="w-4 h-4 text-emerald-300 shrink-0" />
              <span>
                <strong className="text-white">LOCKED READ-ONLY MODE:</strong> This Delivery Challan is completely billed with invoice generated. Modifications are locked to maintain audit integrity.
              </span>
            </div>
            <button
              onClick={() => setShowUnlockConfirm(true)}
              className="text-emerald-300 hover:text-emerald-200 text-xs font-semibold underline shrink-0 cursor-pointer"
            >
              Admin Unlock
            </button>
          </div>
        )}

        {/* Unlock Confirmation Banner */}
        {showUnlockConfirm && (
          <div className="bg-amber-500/15 border-b border-amber-400/35 px-6 py-3 text-amber-200 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-300 shrink-0" />
              <span>Are you sure you want to unlock this challan? It will re-appear in the unbilled directory count.</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleUnlockAction}
                className="px-2.5 py-1 text-xs font-black text-slate-950 bg-amber-400 hover:bg-amber-300 rounded cursor-pointer"
              >
                Confirm Unlock
              </button>
              <button
                onClick={() => setShowUnlockConfirm(false)}
                className="px-2.5 py-1 text-xs font-medium text-slate-200 bg-[#081b28] border border-cyan-500/25 rounded cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs text-slate-200">
          
          {/* Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 cyber-glass-subcard p-4 rounded-xl border border-cyan-500/25">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Client / Consignee
              </span>
              <p className="text-sm font-bold text-white mt-0.5">{challan.clientName}</p>
              <p className="text-[11px] text-slate-400">{challan.clientContact}</p>
              {challan.clientGstOrTaxId && (
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                  GST/Tax: {challan.clientGstOrTaxId}
                </p>
              )}
            </div>

            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Delivery Location & Vehicle
              </span>
              <p className="text-xs font-medium text-slate-200 mt-0.5">{challan.deliveryAddress}</p>
              <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                <Truck className="w-3.5 h-3.5 text-cyan-300" />
                <span>Vehicle: <strong className="text-white">{challan.vehicleNo || 'Direct Dispatch'}</strong></span>
                {challan.driverName && <span>({challan.driverName})</span>}
              </p>
            </div>

            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Order & Challan Ref
              </span>
              <p className="text-xs font-medium text-slate-200 mt-0.5">
                Challan: <strong className="font-mono text-cyan-200">{challan.challanNo}</strong>
              </p>
              <p className="text-[11px] text-slate-400">
                PO Ref: {challan.purchaseOrderNo || 'N/A'}
              </p>
              <p className="text-[11px] text-slate-400">
                Date: {challan.date}
              </p>
            </div>
          </div>

          {/* Poly Items Table (NO ITEM CODES SHOWN!) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-cyan-200 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-cyan-300" />
                <span>Dispatched Poly & Packaging Items ({challan.items.length})</span>
              </h4>
              <span className="text-[11px] text-slate-400">
                * Item specifications and quantities
              </span>
            </div>

            <div className="border border-cyan-500/25 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#0c2638] border-b border-cyan-500/30 text-[11px] font-bold text-cyan-200 uppercase">
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Item Name & Specifications</th>
                    <th className="py-2.5 px-3 text-right">Dispatched Qty</th>
                    <th className="py-2.5 px-3 text-right">Billed Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit Rate</th>
                    <th className="py-2.5 px-3 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-xs">
                  {challan.items.map((item, idx) => {
                    const isItemFullyBilled = item.billedQty >= item.dispatchedQty;
                    const lineTotal = item.dispatchedQty * item.unitPrice;

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-cyan-500/[0.06] transition-colors"
                      >
                        <td className="py-3 px-3 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-3 px-3">
                          <div className="space-y-0.5">
                            <span className="font-bold text-white block">
                              {item.name}
                            </span>
                            <span className="text-[11px] text-slate-400 block">
                              {item.specifications}
                            </span>
                            {item.notes && (
                              <span className="text-[10px] text-cyan-300 block italic">
                                Note: {item.notes}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-slate-200">
                          {item.dispatchedQty} {item.unit}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                              isItemFullyBilled
                                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/35'
                                : item.billedQty > 0
                                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/35'
                                : 'bg-slate-700/60 text-slate-300 border border-cyan-500/20'
                            }`}
                          >
                            {item.billedQty} / {item.dispatchedQty} {item.unit}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right text-slate-300 font-mono">
                          ₹{item.unitPrice.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-emerald-300 font-mono">
                          ₹{lineTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[#0c2638] border-t border-cyan-500/30 font-bold text-white">
                    <td colSpan={5} className="py-3 px-3 text-right uppercase text-xs text-cyan-200">
                      Total Dispatched Value:
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-sm text-emerald-300">
                      ₹{totalDispatchedAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Linked Billing / Invoices History */}
          {challan.billingHistory && challan.billingHistory.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-emerald-300" />
                <span>Generated Invoices for this Challan ({challan.billingHistory.length})</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {challan.billingHistory.map((rec, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-xl border border-emerald-400/35 bg-emerald-500/15 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                        <span className="font-bold text-white">{rec.invoiceNo}</span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-0.5">
                        Billed: {new Date(rec.billedAt).toLocaleDateString()} • Amount: ₹{rec.billedAmount.toLocaleString('en-IN')}
                      </p>
                    </div>

                    <button
                      onClick={() => onOpenInvoiceView(rec.invoiceId)}
                      className="px-3 py-1.5 text-xs font-bold text-emerald-200 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 rounded-lg transition-colors cursor-pointer"
                    >
                      View Invoice
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {challan.notes && (
            <div className="p-3 cyber-glass-subcard rounded-xl border border-cyan-500/25">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Dispatch / Gate Notes:
              </span>
              <p className="text-xs text-slate-200 mt-0.5">{challan.notes}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-[#071824]/90 border-t border-cyan-500/20 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            {isLocked ? (
              <span className="flex items-center gap-1 text-emerald-300 font-medium">
                <Lock className="w-3.5 h-3.5 text-emerald-300" /> Locked & Invoiced
              </span>
            ) : (
              <span className="text-amber-300 font-medium">
                • Pending Full Billing
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              id="print-challan-modal-btn"
              onClick={() => onPrintChallan(challan)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-cyan-200 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/25 rounded-lg transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Challan Slip</span>
            </button>

            {!isLocked && (
              <button
                id="modal-generate-full-bill-btn"
                onClick={handleFullBillAction}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-black text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Generate Full Bill & Lock (Count becomes 0)</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-200 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/25 rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
