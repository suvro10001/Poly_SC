import React, { useState } from 'react';
import { Invoice, SlipPadSettings } from '../types';
import { PageHeaderWithActions } from './PageHeaderWithActions';
import { SlipPadSettingsPanel } from './SlipPadSettingsPanel';
import { 
  Printer, 
  Download, 
  Sliders, 
  Building, 
  Phone, 
  FileText, 
  CheckCircle,
  Copy
} from 'lucide-react';
import { defaultSlipPadSettings } from '../data/mockData';
import { stripBranchPrefixForPrint } from '../utils/salesCenterHelper';

interface PrintPreviewBillInvoiceProps {
  invoice: Invoice;
  slipPadSettings: SlipPadSettings;
  onUpdateSlipPadSettings: (settings: SlipPadSettings) => void;
  onBack: () => void;
  onClose: () => void;
}

export const PrintPreviewBillInvoice: React.FC<PrintPreviewBillInvoiceProps> = ({
  invoice,
  slipPadSettings,
  onUpdateSlipPadSettings,
  onBack,
  onClose
}) => {
  // Requirement: if clicked 📜 Slip Pad Settings then show all option else hide all time
  const [showSlipPadSettings, setShowSlipPadSettings] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div id="print-preview-bill-invoice-wrapper" className="space-y-6">
      {/* Required: Right side Back and Close buttons */}
      <PageHeaderWithActions
        idPrefix="print-invoice-page"
        title="Print Preview — Bill Invoice"
        subtitle={`Standard commercial tax bill & payment slip preview for #${invoice.invoiceNo}`}
        badge="Official Invoice"
        badgeColor="bg-emerald-100 text-emerald-900 border-emerald-300"
        icon={Printer}
        onBack={onBack}
        onClose={onClose}
      />

      {/* Slip Pad Settings: ONLY visible when toggled via 📜 Slip Pad Settings button */}
      {showSlipPadSettings && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
          <SlipPadSettingsPanel
            settings={slipPadSettings}
            onChange={onUpdateSlipPadSettings}
            onReset={() => onUpdateSlipPadSettings(defaultSlipPadSettings)}
            documentTypeLabel="Commercial Bill Invoice"
            defaultExpanded={true}
          />
        </div>
      )}

      {/* Actual Printable Invoice Document */}
      <div className="print-preview-canvas-container flex justify-start sm:justify-center bg-slate-200/60 p-2.5 sm:p-8 rounded-2xl border border-slate-300/80 overflow-x-auto">
        <div 
          id="printable-bill-invoice-document"
          className="bill-paper-dimensions print-paper-sheet bg-white text-slate-900 shadow-2xl border border-slate-300 w-[7.2in] min-h-[10in] pt-0 px-[0.28in] pb-[0.28in] relative flex flex-col justify-between print:w-[7.2in] print:min-h-[10in] print:pt-0 print:px-[0.28in] print:pb-[0.28in] print:border-none print:shadow-none print:mx-auto"
          style={{
            width: '7.2in',
            maxWidth: '7.2in',
            minHeight: '10in',
            padding: '0 0.28in 0.28in 0.28in',
            fontSize: slipPadSettings.fontSizeScale === 'compact' ? '0.85rem' : slipPadSettings.fontSizeScale === 'large' ? '1.05rem' : '0.925rem'
          }}
        >
          <div>
            {/* Keep only 0.5" for the company logo so the document starts higher on paper. */}
            <div
              style={{ height: '0.5in', minHeight: '0.5in' }}
              className={`flex items-center justify-center ${
                !slipPadSettings.showCompanyLogo ? 'hide-on-preprinted-pad invisible opacity-0' : ''
              }`}
            >
              <h1 className="text-2xl font-black tracking-tight text-slate-950 uppercase text-center">
                {slipPadSettings.companyTitle || 'POLY PACKAGING INDUSTRIES LTD.'}
              </h1>
            </div>

            {/* Address, title, and invoice metadata follow the compact logo area. */}
            <div className="border-b-2 border-slate-800 pb-3 mb-4">
              <div className="flex justify-between items-start gap-4">
                <div>
                  {slipPadSettings.companySubtitle && (
                    <p className="text-xs text-slate-700 font-bold">
                      {slipPadSettings.companySubtitle}
                    </p>
                  )}
                  <p className="text-xs text-slate-700 font-semibold mt-0.5 max-w-md madhupur-address-line">
                    {slipPadSettings.companyAddress}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-slate-600 mt-1 font-medium">
                    <span>Tel: {slipPadSettings.companyPhone}</span>
                    {slipPadSettings.customHeaderNote && <span>{slipPadSettings.customHeaderNote}</span>}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="inline-block bg-slate-900 text-white font-black px-4 py-1 text-xs tracking-wider uppercase rounded-xs">
                    {slipPadSettings.copyType || 'TAX INVOICE / BILL'}
                  </div>
                  <div className="font-mono text-xs font-bold text-slate-800 mt-1.5">
                    INVOICE #: <span className="text-slate-950 font-black">{stripBranchPrefixForPrint(invoice.invoiceNo)}</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    DATE: {invoice.date}
                  </div>
                  <div className="text-xs text-slate-600">
                    CHALLAN REF: {invoice.challanReference || 'N/A'}
                  </div>
                </div>
              </div>
            </div>

            {/* Bill To Info */}
            <div className="grid grid-cols-2 gap-6 p-4 rounded-lg bg-slate-50 border border-slate-200 mb-6 text-xs">
              <div>
                <span className="font-bold text-slate-500 uppercase tracking-wider block mb-1">Customer / Billed To:</span>
                <div className="text-sm font-bold text-slate-950">{invoice.customerName}</div>
                <div className="text-slate-600 mt-0.5">{invoice.customerAddress || 'Factory Depot / Commercial Address'}</div>
                <div className="text-slate-600 mt-0.5 font-medium">Contact: {invoice.customerPhone || 'N/A'}</div>
                {invoice.customerGstOrVat && (
                  <div className="text-slate-500 mt-0.5 font-mono">VAT/BIN: {invoice.customerGstOrVat}</div>
                )}
              </div>

              <div className="text-right">
                <span className="font-bold text-slate-500 uppercase tracking-wider block mb-1">Payment & Dispatch Terms:</span>
                <div className="font-semibold text-slate-800">
                  Status: <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    invoice.status === 'Paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>{invoice.status}</span>
                </div>
                <div className="text-slate-600 mt-1">Payment Mode: {invoice.paymentMethod}</div>
                <div className="text-slate-600">Challan Ref: {invoice.challanReference || 'Pending'}</div>
              </div>
            </div>

            {/* Items Table */}
            <table className="w-full text-left text-xs border-collapse border border-slate-300 mb-6">
              <thead>
                <tr className="bg-slate-900 text-white font-bold uppercase tracking-wider">
                  <th className="border border-slate-400 p-2.5 w-10 text-center">SL</th>
                  <th className="border border-slate-400 p-2.5">Item Description & Polymer Spec</th>
                  <th className="border border-slate-400 p-2.5 w-20 text-center">Unit</th>
                  <th className="border border-slate-400 p-2.5 w-24 text-right">Quantity</th>
                  <th className="border border-slate-400 p-2.5 w-28 text-right">Rate (৳)</th>
                  <th className="border border-slate-400 p-2.5 w-32 text-right">Amount (৳)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300">
                {invoice.items.map((item, idx) => (
                  <tr key={item.id} className={item.isSpecialItem ? "bg-amber-50/40" : "hover:bg-slate-50"}>
                    <td className="border border-slate-300 p-2.5 text-center font-mono text-slate-500">{idx + 1}</td>
                    <td className="border border-slate-300 p-2.5">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        {item.isSpecialItem && <span className="text-amber-600">↳ ⭐</span>}
                        <span>{item.itemName}</span>
                        {item.isSpecialItem && (
                          <span className="text-[10px] px-1.5 py-0.2 bg-amber-200 text-amber-900 rounded font-mono">Special Custom</span>
                        )}
                      </div>
                      {item.itemCode && <div className="text-[10px] text-slate-500 font-mono">Code: {item.itemCode}</div>}
                      {item.specification && <div className="text-[11px] text-amber-800 font-mono">{item.specification}</div>}
                    </td>
                    <td className="border border-slate-300 p-2.5 text-center font-medium">{item.unit}</td>
                    <td className="border border-slate-300 p-2.5 text-right font-mono font-bold text-slate-900">
                      {item.qty.toLocaleString()}
                    </td>
                    <td className="border border-slate-300 p-2.5 text-right font-mono">
                      ৳{item.rate.toFixed(2)}
                    </td>
                    <td className="border border-slate-300 p-2.5 text-right font-mono font-bold text-slate-950">
                      ৳{item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Calculations & Summary */}
            <div className="flex justify-between items-start text-xs mb-8">
              <div className="w-1/2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="font-bold text-slate-700 block mb-1">Remarks & Bank Information:</span>
                {slipPadSettings.showBankDetails && (
                  <p className="text-slate-600 text-[11px] font-mono leading-relaxed mb-2">
                    {slipPadSettings.bankInfo}
                  </p>
                )}
                {invoice.notes && (
                  <p className="text-slate-800 font-medium pt-2 border-t border-slate-200">
                    Notes: {invoice.notes}
                  </p>
                )}
              </div>

              <div className="w-5/12 space-y-1.5 text-right font-mono text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="font-sans text-slate-600">Subtotal:</span>
                  <span className="font-bold text-slate-900">৳{invoice.subTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                {invoice.taxAmount > 0 && (
                  <div className="flex justify-between py-1 border-b border-slate-200 text-slate-600">
                    <span className="font-sans">VAT / Tax:</span>
                    <span>+৳{invoice.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {invoice.discountAmount > 0 && (
                  <div className="flex justify-between py-1 border-b border-slate-200 text-emerald-700">
                    <span className="font-sans">Special Discount:</span>
                    <span>-৳{invoice.discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 border-b-2 border-slate-900 text-sm font-bold text-slate-950 bg-slate-100 px-2 rounded">
                  <span className="font-sans uppercase">Grand Total:</span>
                  <span className="font-black">৳{invoice.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-600">
                  <span className="font-sans">Paid / Realized:</span>
                  <span className="text-emerald-700 font-bold">৳{invoice.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-900 font-bold border-t border-slate-200">
                  <span className="font-sans text-rose-700">Due Balance:</span>
                  <span className="text-rose-700">৳{invoice.dueAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer & Signatures */}
          {slipPadSettings.showSignatureSection && (
            <div className={`border-t border-slate-300 ${invoice.items.length >= 10 ? 'pt-[42px]' : 'pt-[75px]'}`}>
              <div className="grid grid-cols-4 gap-4 text-center text-xs">
                <div>
                  <div className="border-t border-slate-600 pt-1 text-slate-800 font-semibold">Receiver's Signature</div>
                </div>
                <div>
                  <div className="border-t border-slate-600 pt-1 text-slate-800 font-semibold">Prepared By</div>
                </div>
                <div>
                  <div className="border-t border-slate-600 pt-1 text-slate-800 font-semibold">Check By</div>
                </div>
                <div>
                  <div className="border-t border-slate-600 pt-1 text-slate-900 font-bold">Approved By</div>
                </div>
              </div>

              <div className="text-center text-[10px] text-slate-400 mt-6">
                {slipPadSettings.footerTerms}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-2 no-print">
        <button
          type="button"
          id="btn-toggle-slip-pad-settings-invoice"
          onClick={() => setShowSlipPadSettings(!showSlipPadSettings)}
          className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
            showSlipPadSettings
              ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
              : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>📜 Slip Pad Settings</span>
        </button>

        <button
          type="button"
          id="btn-print-bill-invoice"
          onClick={handlePrint}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Print Invoice</span>
        </button>
      </div>
    </div>
  );
};
