import React, { useState } from 'react';
import { DeliveryChallan, SlipPadSettings } from '../types';
import { PageHeaderWithActions } from './PageHeaderWithActions';
import { SlipPadSettingsPanel } from './SlipPadSettingsPanel';
import { 
  Printer, 
  Truck, 
  Sliders, 
  Building, 
  Calendar, 
  MapPin,
  CheckCircle2,
  FileCheck2
} from 'lucide-react';
import { defaultSlipPadSettings } from '../data/mockData';
import { formatDisplayUnit } from '../utils/stockHelper';

interface PrintPreviewDeliveryChallanProps {
  challan: DeliveryChallan;
  slipPadSettings: SlipPadSettings;
  onUpdateSlipPadSettings: (settings: SlipPadSettings) => void;
  onBack: () => void;
  onClose: () => void;
}

export const PrintPreviewDeliveryChallan: React.FC<PrintPreviewDeliveryChallanProps> = ({
  challan,
  slipPadSettings,
  onUpdateSlipPadSettings,
  onBack,
  onClose
}) => {
  // Requirement: if clicked 📜 Slip Pad Settings then show all option else hide all time
  // Note: 80%, 100%, 115% options have been completely removed as explicitly instructed
  const [showSlipPadSettings, setShowSlipPadSettings] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const totalQuantitySum = challan.items.reduce((acc, it) => acc + it.dispatchedQty, 0);

  return (
    <div id="print-preview-delivery-challan-wrapper" className="space-y-6">
      {/* Required: Right side Back and Close buttons */}
      <PageHeaderWithActions
        idPrefix="print-challan-page"
        title="Print Preview — Delivery Challan"
        subtitle={`Dispatch slip & factory gate pass preview for Challan #${challan.challanNo}`}
        badge="Official Gate Pass"
        badgeColor="bg-sky-100 text-sky-900 border-sky-300"
        icon={Truck}
        onBack={onBack}
        onClose={onClose}
      />

      {/* Slip Pad Settings: ONLY visible when clicked */}
      {showSlipPadSettings && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
          <SlipPadSettingsPanel
            settings={slipPadSettings}
            onChange={onUpdateSlipPadSettings}
            onReset={() => onUpdateSlipPadSettings(defaultSlipPadSettings)}
            documentTypeLabel="Delivery Challan & Gate Pass"
            defaultExpanded={true}
          />
        </div>
      )}

      {/* Printable Challan Document */}
      <div className="print-preview-canvas-container flex justify-start sm:justify-center bg-slate-200/60 p-2.5 sm:p-8 rounded-2xl border border-slate-300/80 overflow-x-auto print:p-0 print:bg-white print:border-none">
        <div 
          id="printable-delivery-challan-document"
          className="print-paper-sheet bill-paper-dimensions bg-white text-slate-900 shadow-2xl border border-slate-300 w-[7.2in] min-h-[10in] pt-0 px-[0.28in] pb-[0.28in] relative flex flex-col justify-between print:w-[7.2in] print:min-h-[10in] print:pt-0 print:px-[0.28in] print:pb-[0.28in] print:border-none print:shadow-none print:mx-auto"
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
                {(slipPadSettings.companyTitle || 'POLY PACKAGING').replace(/\s*IND\.?\s*LTD\.?/gi, '').replace(/\s*INDUSTRIES\s*LTD\.?/gi, '')}
              </h1>
            </div>

            {/* Company address, title, and challan metadata follow the compact logo area. */}
            <div className="border-b-2 border-slate-800 pb-3 mb-4 text-center">
              <div className="flex flex-col items-center justify-center text-center">
                {slipPadSettings.companySubtitle && (
                  <p className="text-xs text-slate-700 font-bold max-w-lg mx-auto">
                    {slipPadSettings.companySubtitle}
                  </p>
                )}
                <p className="text-xs text-slate-800 mt-0.5 max-w-lg font-semibold mx-auto madhupur-address-line">
                  {slipPadSettings.companyAddress}
                </p>
                <div className="flex items-center justify-center gap-4 text-xs text-slate-600 mt-1 font-medium">
                  <span>Tel: {slipPadSettings.companyPhone}</span>
                  <span>•</span>
                  <span>Dispatch Gate 2</span>
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 text-left">
                <div className="delivery-challan-badge challan-badge inline-block bg-sky-900 text-white font-black px-4 py-1 text-xs tracking-wider uppercase rounded-xs">
                  DELIVERY CHALLAN & GATE PASS
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <span className="font-mono font-bold text-slate-800">
                    CHALLAN #: <span className="text-slate-950 font-black">{challan.challanNo}</span>
                  </span>
                  <span className="text-slate-600">
                    DISPATCH DATE: {challan.date}
                  </span>
                  <span className="text-slate-600">
                    ORDER / INV: {challan.invoiceNo || 'DIRECT DISPATCH'}
                  </span>
                </div>
              </div>
            </div>

            {/* Recipient & Transport Details */}
            <div className="grid grid-cols-2 gap-6 p-4 rounded-lg bg-slate-50 border border-slate-200 mb-6 text-xs">
              <div>
                <span className="font-bold text-slate-500 uppercase tracking-wider block mb-1">Delivered / Consigned To:</span>
                <div className="text-sm font-bold text-slate-950">{challan.customerName}</div>
                <div className="text-slate-600 mt-0.5">{challan.deliveryAddress}</div>
                <div className="text-slate-600 mt-0.5">Phone: {challan.customerPhone}</div>
              </div>

              <div className="text-right">
                <span className="font-bold text-slate-500 uppercase tracking-wider block mb-1">Transport & Logistics:</span>
                <div className="font-semibold text-slate-800">
                  Vehicle No: <span className="font-mono font-bold text-slate-950">{challan.vehicleNo || 'Covered Van (Standard)'}</span>
                </div>
                <div className="text-slate-600 mt-0.5">Driver / Handover: {challan.driverName || 'Depot Carrier'}</div>
                <div className="text-slate-600">Driver Phone: {challan.driverPhone || 'N/A'}</div>
                <div className="text-slate-600">Packages: {challan.totalPackages}</div>
              </div>
            </div>

            {/* Goods Dispatched Table */}
            <table className="w-full text-left text-xs border-collapse border border-slate-300 mb-6">
              <thead>
                <tr className="bg-slate-900 text-white font-bold uppercase tracking-wider">
                  <th className="border border-slate-400 p-2.5 w-12 text-center">SL</th>
                  <th className="border border-slate-400 p-2.5">Item Description & Poly Specification</th>
                  <th className="border border-slate-400 p-2.5 w-28 text-center">Package Type</th>
                  <th className="border border-slate-400 p-2.5 w-24 text-center">Unit</th>
                  <th className="border border-slate-400 p-2.5 w-32 text-right">Dispatched Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300">
                {challan.items.map((item, idx) => (
                  <tr key={item.id} className={item.isSpecialItem ? "bg-amber-50/40" : "hover:bg-slate-50"}>
                    <td className="border border-slate-300 p-3 text-center font-mono text-slate-500">{idx + 1}</td>
                    <td className="border border-slate-300 p-3">
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
                    <td className="border border-slate-300 p-3 text-center text-xs text-slate-700">
                      {item.packagesCount || 'Bundle'}
                    </td>
                    <td className="border border-slate-300 p-3 text-center font-semibold text-slate-800">
                      {formatDisplayUnit(item.unit, item.dispatchedQty)}
                    </td>
                    <td className="border border-slate-300 p-3 text-right font-mono font-black text-slate-950 text-sm">
                      {item.dispatchedQty.toLocaleString()} {formatDisplayUnit(item.unit, item.dispatchedQty)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold border-t-2 border-slate-900">
                  <td colSpan={4} className="p-3 text-right text-slate-800 uppercase text-xs">
                    Total Dispatched Units:
                  </td>
                  <td className="p-3 text-right font-mono font-black text-slate-950 text-base">
                    {totalQuantitySum.toLocaleString()} Units
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Remarks */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs mb-8">
              <span className="font-bold text-slate-800 block mb-1">Dispatch Notice & Terms:</span>
              <p className="text-slate-600 leading-relaxed">
                All polybags were packed, counted, and inspected at factory dispatch gate. Please verify bundle count before signing. Any discrepancy must be reported within 24 hours of delivery.
              </p>
              {challan.notes && (
                <p className="text-slate-800 font-medium mt-2 pt-2 border-t border-slate-200">
                  Notes: {challan.notes}
                </p>
              )}
            </div>
          </div>

          {/* Signatures */}
          {slipPadSettings.showSignatureSection && (
            <div className={`border-t border-slate-300 ${challan.items.length >= 10 ? 'pt-[42px]' : 'pt-[75px]'}`}>
              <div className="grid grid-cols-4 gap-4 text-center text-xs">
                <div>
                  <div className="border-t border-slate-600 pt-1 text-slate-900 font-bold">Receiver's Signature</div>
                </div>
                <div>
                  <div className="border-t border-slate-600 pt-1 text-slate-700 font-semibold">Prepared By</div>
                </div>
                <div>
                  <div className="border-t border-slate-600 pt-1 text-slate-700 font-semibold">Check By</div>
                </div>
                <div>
                  <div className="border-t border-slate-600 pt-1 text-slate-700 font-semibold">Approved By</div>
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
          id="btn-toggle-slip-pad-settings-challan"
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
          id="btn-print-delivery-challan"
          onClick={handlePrint}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Print Challan</span>
        </button>
      </div>
    </div>
  );
};
