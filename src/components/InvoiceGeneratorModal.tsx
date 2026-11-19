import React, { useState } from 'react';
import { useChallan } from '../context/ChallanContext';
import { Challan, Invoice } from '../types';
import {
  X,
  Receipt,
  CheckCircle2,
  Sparkles,
  Lock,
  Calendar,
  AlertCircle,
  Building,
  CreditCard,
} from 'lucide-react';

interface InvoiceGeneratorModalProps {
  challan: Challan | null;
  isOpen: boolean;
  onClose: () => void;
  onInvoiceCreated: (invoice: Invoice) => void;
}

export const InvoiceGeneratorModal: React.FC<InvoiceGeneratorModalProps> = ({
  challan,
  isOpen,
  onClose,
  onInvoiceCreated,
}) => {
  const { generateBillFromChallan } = useChallan();

  const [billingMode, setBillingMode] = useState<'FULL' | 'PARTIAL'>('FULL');
  const [customQtys, setCustomQtys] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<Invoice['paymentMethod']>('Bank Transfer');

  if (!isOpen || !challan) return null;

  // Initialize or calculate quantities to bill
  const itemsToBill = challan.items.map(item => {
    const unbilledQty = Math.max(0, item.dispatchedQty - item.billedQty);
    const qtyToBill = billingMode === 'FULL'
      ? unbilledQty
      : (customQtys[item.id] !== undefined ? customQtys[item.id] : unbilledQty);

    const amount = qtyToBill * item.unitPrice;
    const taxRate = 18;
    const taxAmount = (amount * taxRate) / 100;
    const total = amount + taxAmount;

    return {
      ...item,
      unbilledQty,
      qtyToBill,
      amount,
      taxRate,
      taxAmount,
      total,
    };
  });

  const subtotal = itemsToBill.reduce((acc, it) => acc + it.amount, 0);
  const taxTotal = itemsToBill.reduce((acc, it) => acc + it.taxAmount, 0);
  const grandTotal = subtotal + taxTotal;

  const handleQtyChange = (itemId: string, maxQty: number, val: number) => {
    const clamped = Math.min(maxQty, Math.max(0, val));
    setCustomQtys(prev => ({
      ...prev,
      [itemId]: clamped,
    }));
  };

  const handleConfirmBilling = () => {
    try {
      const billedMap: Record<string, number> = {};
      itemsToBill.forEach(it => {
        billedMap[it.id] = it.qtyToBill;
      });

      const newInv = generateBillFromChallan(challan.id, billedMap, paymentMethod);
      onInvoiceCreated(newInv);
      onClose();
    } catch (err: any) {
      alert(err.message || 'Error generating invoice');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
      <div
        id="invoice-generator-modal"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight">
                Generate Invoice for {challan.challanNo}
              </h3>
              <p className="text-xs text-slate-400">
                Consignee: {challan.clientName} • Dispatch Date: {challan.date}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Informational Callout */}
        <div className="bg-emerald-50 px-6 py-3 border-b border-emerald-200 text-emerald-900 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>
              Generating a <strong>Full Bill</strong> will update this Challan's status to <strong>Fully Billed</strong>, lock it in <strong>Read-Only Mode</strong>, and decrement the directory counter to <strong>Challan Directory (0)</strong>.
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs text-slate-700">
          
          {/* Mode Selector */}
          <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="font-bold text-slate-800 uppercase text-[11px]">Billing Option:</span>
            <div className="flex items-center gap-2">
              <button
                id="billing-mode-full-btn"
                onClick={() => setBillingMode('FULL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  billingMode === 'FULL'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                ✓ Complete 100% Full Bill (Locks Challan)
              </button>

              <button
                id="billing-mode-partial-btn"
                onClick={() => setBillingMode('PARTIAL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  billingMode === 'PARTIAL'
                    ? 'bg-indigo-700 text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                Partial Quantity Billing
              </button>
            </div>
          </div>

          {/* Items to Bill Table (Strictly NO Item Codes Shown) */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                  <th className="py-2.5 px-3">Item Name & Specs</th>
                  <th className="py-2.5 px-3 text-right">Dispatched</th>
                  <th className="py-2.5 px-3 text-right">Already Billed</th>
                  <th className="py-2.5 px-3 text-right w-32">Qty to Bill Now</th>
                  <th className="py-2.5 px-3 text-right">Rate</th>
                  <th className="py-2.5 px-3 text-right">Tax (18%)</th>
                  <th className="py-2.5 px-3 text-right">Total (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {itemsToBill.map((it, idx) => (
                  <tr key={it.id} className="bg-white hover:bg-slate-50">
                    <td className="py-3 px-3">
                      <span className="font-bold text-slate-900 block">
                        {it.name}
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        {it.specifications}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-slate-600">
                      {it.dispatchedQty} {it.unit}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-500">
                      {it.billedQty} {it.unit}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {billingMode === 'FULL' ? (
                        <span className="font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {it.unbilledQty} {it.unit}
                        </span>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min={0}
                            max={it.unbilledQty}
                            value={it.qtyToBill}
                            onChange={e =>
                              handleQtyChange(
                                it.id,
                                it.unbilledQty,
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-20 text-right px-2 py-1 bg-slate-50 border border-slate-200 rounded font-semibold text-slate-900"
                          />
                          <span className="text-slate-500">{it.unit}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-600 font-mono">
                      ₹{it.unitPrice.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-500 font-mono">
                      ₹{it.taxAmount.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-slate-900 font-mono">
                      ₹{it.total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Payment & Terms */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <label className="block text-[11px] font-bold text-slate-700 uppercase">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as any)}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 font-medium"
              >
                <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                <option value="UPI">UPI / QR Code</option>
                <option value="Cheque">Cheque Deposit</option>
                <option value="Cash">Cash on Delivery</option>
              </select>
            </div>

            {/* Financial Summary */}
            <div className="bg-slate-900 text-white p-4 rounded-xl space-y-2">
              <div className="flex justify-between text-slate-400">
                <span>Taxable Subtotal:</span>
                <span className="font-mono text-white">₹{subtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>GST Tax (18%):</span>
                <span className="font-mono text-white">₹{taxTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="border-t border-slate-800 pt-2 flex justify-between font-bold text-sm">
                <span className="text-emerald-400">Grand Total Invoice:</span>
                <span className="font-mono text-emerald-400 text-base">
                  ₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-700" />
            <span>Full billing will lock this challan in read-only mode automatically.</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>

            <button
              id="confirm-generate-invoice-btn"
              onClick={handleConfirmBilling}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm & Issue Tax Invoice</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
