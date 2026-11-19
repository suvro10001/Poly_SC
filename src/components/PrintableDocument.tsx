import React from 'react';
import { Challan, Invoice } from '../types';
import { stripBranchPrefixForPrint } from '../utils/salesCenterHelper';
import { Printer, X, ShieldCheck, Lock, CheckCircle2 } from 'lucide-react';

interface PrintableDocumentProps {
  type: 'challan' | 'invoice';
  challan?: Challan | null;
  invoice?: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PrintableDocument: React.FC<PrintableDocumentProps> = ({
  type,
  challan,
  invoice,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="print-preview-modal-backdrop fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="print-preview-modal-dialog bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200 flex flex-col max-h-[95vh]">
        
        {/* Print Toolbar (hidden during actual window.print via media query if needed) */}
        <div className="px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-bold">
              {type === 'challan' ? 'Delivery Challan Print Preview' : 'Tax Invoice Print Preview'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Now</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* The Printable Page Canvas */}
        <div className="print-paper-sheet p-8 overflow-y-auto flex-1 bg-white text-slate-900 text-xs font-sans space-y-6 print:p-4 print:overflow-visible print:max-h-none">
          
          {/* Company Header */}
          <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start">
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">
                POLYPACK INDUSTRIES PVT. LTD.
              </h1>
              <p className="text-xs text-slate-600 font-medium mt-0.5">
                Manufacturers of High-Grade Polyethylene Bags, Rolls, Shrink & Barrier Films
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Industrial Estate, Ring Road, Bengaluru - 560058 | GSTIN: 29AAACP9921D1ZZ
              </p>
            </div>

            <div className="text-right">
              <span className="inline-block px-3 py-1 bg-slate-900 text-white font-bold text-xs uppercase tracking-wider rounded">
                {type === 'challan' ? 'DELIVERY CHALLAN' : 'TAX INVOICE'}
              </span>
              <p className="text-xs font-mono font-bold text-slate-900 mt-2">
                {type === 'challan' ? challan?.challanNo : stripBranchPrefixForPrint(invoice?.invoiceNo)}
              </p>
              <p className="text-[11px] text-slate-500">
                Date: {type === 'challan' ? challan?.date : invoice?.date}
              </p>
            </div>
          </div>

          {/* Delivery Challan Document Content */}
          {type === 'challan' && challan && (
            <div className="space-y-5">
              {/* Status Header */}
              {challan.status === 'Fully Billed' && (
                <div className="bg-emerald-50 border border-emerald-300 p-2.5 rounded text-emerald-900 flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1 font-bold">
                    <Lock className="w-3.5 h-3.5 text-emerald-700" />
                    STATUS: FULLY BILLED & LOCKED
                  </span>
                  <span className="font-mono text-[10px]">
                    Invoice Ref: {challan.billingHistory[0]?.invoiceNo || 'INV-Generated'}
                  </span>
                </div>
              )}

              {/* Consignee & Vehicle Info */}
              <div className="grid grid-cols-2 gap-4 border border-slate-200 p-3 rounded">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Consignee / Deliver To:
                  </span>
                  <p className="font-bold text-slate-900 text-sm mt-0.5">{challan.clientName}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{challan.deliveryAddress}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Contact: {challan.clientContact}</p>
                  {challan.clientGstOrTaxId && (
                    <p className="text-[11px] text-slate-500">GSTIN: {challan.clientGstOrTaxId}</p>
                  )}
                </div>

                <div className="text-right space-y-1">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">
                      Transport / Dispatch Mode:
                    </span>
                    <p className="font-bold text-slate-900">
                      Vehicle: {challan.vehicleNo || 'Self Transport'}
                    </p>
                    {challan.driverName && (
                      <p className="text-slate-600">Driver: {challan.driverName}</p>
                    )}
                  </div>
                  {challan.purchaseOrderNo && (
                    <p className="text-[11px] text-slate-700">
                      PO Reference: <strong>{challan.purchaseOrderNo}</strong>
                    </p>
                  )}
                </div>
              </div>

              {/* Items Table (NO ITEM CODES SHOWN) */}
              <table className="w-full text-left border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase">
                    <th className="p-2 border-r border-slate-200 w-10">S.N.</th>
                    <th className="p-2 border-r border-slate-200">Product Description & Specs</th>
                    <th className="p-2 border-r border-slate-200 text-right w-28">Quantity</th>
                    <th className="p-2 border-r border-slate-200 text-center w-20">Unit</th>
                    <th className="p-2 border-r border-slate-200 text-right w-24">Rate (₹)</th>
                    <th className="p-2 text-right w-28">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {challan.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="p-2 border-r border-slate-200 text-center font-mono">{idx + 1}</td>
                      <td className="p-2 border-r border-slate-200">
                        <span className="font-bold text-slate-900 block">{it.name}</span>
                        <span className="text-[11px] text-slate-500 block">{it.specifications}</span>
                      </td>
                      <td className="p-2 border-r border-slate-200 text-right font-bold text-slate-900">
                        {it.dispatchedQty}
                      </td>
                      <td className="p-2 border-r border-slate-200 text-center text-slate-600 font-medium">
                        {it.unit}
                      </td>
                      <td className="p-2 border-r border-slate-200 text-right font-mono text-slate-700">
                        ₹{it.unitPrice.toFixed(2)}
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-slate-900">
                        ₹{(it.dispatchedQty * it.unitPrice).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200 font-bold">
                    <td colSpan={5} className="p-2 text-right uppercase">
                      Total Dispatched Value:
                    </td>
                    <td className="p-2 text-right font-mono text-slate-900">
                      ₹{challan.items.reduce((a, b) => a + b.dispatchedQty * b.unitPrice, 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* Signatures & Declarations */}
              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-200 text-xs">
                <div className="border border-slate-200 p-3 rounded space-y-8">
                  <p className="text-[11px] text-slate-500">
                    Received the above described goods in sound condition with seal intact.
                  </p>
                  <p className="font-bold text-slate-800 border-t border-slate-300 pt-1">
                    Receiver's Signature & Stamp
                  </p>
                </div>

                <div className="border border-slate-200 p-3 rounded space-y-8 text-right">
                  <p className="text-[11px] text-slate-500">
                    For POLYPACK INDUSTRIES PVT. LTD.
                  </p>
                  <p className="font-bold text-slate-800 border-t border-slate-300 pt-1">
                    Authorized Signatory
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tax Invoice Document Content */}
          {type === 'invoice' && invoice && (
            <div className="space-y-5">
              {/* Billing Info */}
              <div className="grid grid-cols-2 gap-4 border border-slate-200 p-3 rounded">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Billed To:
                  </span>
                  <p className="font-bold text-slate-900 text-sm mt-0.5">{invoice.clientName}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{invoice.billingAddress}</p>
                  <p className="text-[11px] text-slate-500">Phone: {invoice.clientContact}</p>
                  {invoice.clientGstOrTaxId && (
                    <p className="text-[11px] text-slate-700 font-mono">
                      GSTIN: {invoice.clientGstOrTaxId}
                    </p>
                  )}
                </div>

                <div className="text-right space-y-1">
                  <p className="text-slate-700">
                    Challan Ref: <strong className="font-mono">{invoice.challanNo}</strong>
                  </p>
                  <p className="text-slate-700">
                    Payment Terms: <strong>{invoice.paymentMethod || 'Bank Transfer'}</strong>
                  </p>
                  <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    Payment Status: {invoice.paymentStatus}
                  </span>
                </div>
              </div>

              {/* Items Table (NO ITEM CODES SHOWN) */}
              <table className="w-full text-left border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase">
                    <th className="p-2 border-r border-slate-200">Product Item & Specifications</th>
                    <th className="p-2 border-r border-slate-200 text-right w-24">Qty</th>
                    <th className="p-2 border-r border-slate-200 text-right w-24">Rate (₹)</th>
                    <th className="p-2 border-r border-slate-200 text-right w-24">Amount (₹)</th>
                    <th className="p-2 border-r border-slate-200 text-right w-24">GST (18%)</th>
                    <th className="p-2 text-right w-28">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {invoice.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="p-2 border-r border-slate-200">
                        <span className="font-bold text-slate-900 block">{it.name}</span>
                        <span className="text-[11px] text-slate-500 block">{it.specifications}</span>
                      </td>
                      <td className="p-2 border-r border-slate-200 text-right font-semibold text-slate-800">
                        {it.qty} {it.unit}
                      </td>
                      <td className="p-2 border-r border-slate-200 text-right font-mono text-slate-700">
                        ₹{it.rate.toFixed(2)}
                      </td>
                      <td className="p-2 border-r border-slate-200 text-right font-mono text-slate-800">
                        ₹{it.amount.toFixed(2)}
                      </td>
                      <td className="p-2 border-r border-slate-200 text-right font-mono text-slate-500">
                        ₹{it.taxAmount.toFixed(2)}
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-slate-900">
                        ₹{it.total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals Box */}
              <div className="flex justify-end">
                <div className="w-72 bg-slate-50 border border-slate-200 rounded p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Taxable Value:</span>
                    <span className="font-mono font-bold">₹{invoice.subtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Total GST Tax:</span>
                    <span className="font-mono font-bold">₹{invoice.taxTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="border-t border-slate-300 pt-1.5 flex justify-between font-black text-sm text-slate-900">
                    <span>Grand Total:</span>
                    <span className="font-mono text-indigo-900">₹{invoice.grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              {/* Bank & Signature */}
              <div className="grid grid-cols-2 gap-6 pt-6 border-t border-slate-200 text-xs">
                <div className="border border-slate-200 p-3 rounded">
                  <p className="font-bold text-slate-800 uppercase text-[10px]">Bank Account Details:</p>
                  <p className="mt-1 text-slate-700">Bank: HDFC Bank Ltd.</p>
                  <p className="text-slate-700">A/C No: 50200088991122</p>
                  <p className="text-slate-700">IFSC: HDFC0001245</p>
                </div>

                <div className="border border-slate-200 p-3 rounded text-right space-y-8">
                  <p className="text-[11px] text-slate-500">
                    For POLYPACK INDUSTRIES PVT. LTD.
                  </p>
                  <p className="font-bold text-slate-800 border-t border-slate-300 pt-1">
                    Authorized Signatory
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
