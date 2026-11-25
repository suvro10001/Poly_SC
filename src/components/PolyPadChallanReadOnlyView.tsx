import React, { useState, useMemo } from 'react';
import { DeliveryChallan, CompanyDetails, BranchLocation } from '../types';
import { formatDateDDMMYY } from '../utils/dateUtils';
import { convertToTakaWords } from '../utils/numberToWords';
import { Printer, ZoomIn, ZoomOut, ArrowLeft, Layers, FileText } from 'lucide-react';
import { formatChallanLineColors } from '../utils/stockHelper';
import { getBranchAddressDetails, cleanBranchName } from '../utils/branchAccess';

interface PolyPadChallanReadOnlyViewProps {
  challan: DeliveryChallan;
  company: CompanyDetails;
  branches?: BranchLocation[];
  initialPadMode?: 'plain' | 'hide_logo' | 'hide_all';
  onClose?: () => void;
}

export const PolyPadChallanReadOnlyView: React.FC<PolyPadChallanReadOnlyViewProps> = ({
  challan,
  company,
  branches = [],
  initialPadMode = 'hide_logo',
  onClose
}) => {
  const [padHeaderMode, setPadHeaderMode] = useState<'plain' | 'hide_logo' | 'hide_all'>(initialPadMode);
  const [zoomLevel, setZoomLevel] = useState<'80%' | '100%' | '115%'>('100%');

  const branchAddress = useMemo(() => {
    const bId = challan.branchId;
    const bName = challan.branchName;
    if (!bId || bId.toLowerCase() === 'all' || bName?.toLowerCase().includes('all sales center')) {
      return { line1: '', line2: '', line3: '', fullAddress: '', phone: '', email: '' };
    }
    const matched = branches.find(
      (b) => b.id === bId || (bName && cleanBranchName(b.name).toLowerCase() === cleanBranchName(bName).toLowerCase())
    );
    return getBranchAddressDetails(matched || (bName ? { id: bId, name: bName, type: 'showroom', address: '' } : null), company.phone, company.email);
  }, [challan.branchId, challan.branchName, branches, company.phone, company.email]);

  const validLines = (challan.lines || []).filter(
    (l) => (l.itemDescription && l.itemDescription.trim() !== '') || (l.coilQty && l.coilQty > 0) || (l.amount && l.amount > 0)
  );

  const displayLines = validLines.length > 0 ? validLines : [];
  const spacerCount = Math.max(0, 10 - displayLines.length);

  const grossAmount = challan.totalAmount || displayLines.reduce((s, l) => s + (l.amount || 0), 0);
  const totalCoilQty = challan.totalQuantity || displayLines.reduce((s, l) => s + (l.coilQty || 0), 0);
  const discountPercent = challan.discountPercent || 0;
  const discountAmount = challan.discountAmount || Math.round((grossAmount * discountPercent) / 100);
  const netAmount = challan.netAmount || Math.max(0, grossAmount - discountAmount);
  const advanceAmount = challan.advanceAmount || 0;
  const dueBalance = challan.dueBalance || challan.dueAmount || Math.max(0, netAmount - advanceAmount);
  const inWords = challan.inWords || convertToTakaWords(netAmount);

  return (
    <div className="flex flex-col bg-slate-900 text-slate-100 rounded-xl overflow-hidden border border-slate-800">
      {/* Print Specific CSS */}
      <style>{`
        @media print {
          @page {
            size: 7.2in 10in;
            margin: 0;
          }
          body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .hide-on-preprinted-pad {
            visibility: hidden !important;
            opacity: 0 !important;
          }
          .bill-paper-dimensions {
            width: 7.2in !important;
            max-width: 7.2in !important;
            min-height: 10in !important;
            padding: 0 0.28in 0.28in 0.28in !important;
            box-shadow: none !important;
            border: none !important;
            transform: none !important;
            margin: 0 auto !important;
            background: white !important;
          }
        }
      `}</style>

      {/* READ-ONLY PAD CANVAS (MATCHING BILL PAGE PAD EXACTLY) */}
      <div className="print-preview-canvas-container p-2.5 sm:p-8 bg-slate-950 flex justify-start sm:justify-center items-start overflow-auto">
        <div
          className="bill-paper-dimensions bg-white text-black shadow-2xl border border-slate-300 relative select-none origin-top transition-transform duration-100 flex flex-col justify-between overflow-visible flex-shrink-0 font-sans"
          style={{
            width: '7.2in',
            maxWidth: '7.2in',
            minHeight: '10in',
            padding: '0 0.28in 0.28in 0.28in',
            transform: `scale(${zoomLevel === '80%' ? 0.8 : (zoomLevel === '115%' ? 1.15 : 1.0)})`
          }}
        >
          <div className="relative z-10 space-y-1">
            {/* Keep only 0.5" for the company name and logo so the challan starts higher. */}
            <div className="text-center pb-0 space-y-0 text-black font-sans leading-tight pt-0">
              <div
                style={{ height: '0.5in', minHeight: '0.5in' }}
                className={`flex items-center justify-center space-x-2 ${
                  padHeaderMode !== 'plain' ? 'hide-on-preprinted-pad invisible opacity-0' : ''
                }`}
              >
                <div className="relative w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0">
                  <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-xs">
                    <circle cx="50" cy="50" r="26" fill="#38bdf8" opacity="0.8" />
                    <circle cx="50" cy="20" r="14" fill="#facc15" />
                    <circle cx="50" cy="80" r="14" fill="#ef4444" />
                    <circle cx="20" cy="50" r="14" fill="#2563eb" />
                    <circle cx="80" cy="50" r="14" fill="#22c55e" />
                  </svg>
                </div>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-black italic tracking-wider text-[#1e295b] font-sans uppercase">
                  {(company.name || 'POLY CABLES').replace(/\s*IND\.?\s*LTD\.?/gi, '')}
                </h1>
              </div>

              {/* Address, Title & Metadata start immediately after 1.5" mark */}
              {branchAddress.line1 ? (
                <div
                  className={`space-y-0.5 pt-0 mt-0 pb-0 mb-0 print:pb-0 print:mb-0 ${
                    padHeaderMode === 'hide_all' ? 'hide-on-preprinted-pad invisible opacity-0' : ''
                  }`}
                >
                  <p style={{ fontSize: '14px' }} className="font-extrabold text-[14px] leading-tight text-black print:text-[14px] print:font-extrabold madhupur-address-line">
                    {branchAddress.line1}
                  </p>
                  {branchAddress.line2 ? (
                    <p style={{ fontSize: '14px' }} className="font-bold text-[14px] leading-tight text-black print:text-[14px] print:font-bold madhupur-address-line">
                      {branchAddress.line2}
                    </p>
                  ) : null}
                  {branchAddress.line3 ? (
                    <p style={{ fontSize: '14px' }} className="font-semibold text-[14px] leading-tight text-black print:text-[14px] madhupur-address-line">
                      {branchAddress.line3}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* Delivery Challan Badge */}
              <div className="pt-1 pb-0.5">
                <span className="delivery-challan-badge challan-badge inline-block bg-slate-900 text-white border border-black px-4 py-0.5 rounded text-xs font-black tracking-widest uppercase">
                  DELIVERY CHALLAN
                </span>
              </div>
            </div>

            {/* Metadata Grid starts immediately after header */}
            <div className="flex items-start justify-between w-full text-black font-sans mt-1 mb-0.5 gap-x-3 text-[13px]">
              {/* Left Side: Party Name (Row 1), Address (Row 2), Phone (Row 3) */}
              <div className="flex-1 min-w-0 space-y-0.5">
                {/* Row 1: Party Name */}
                <div className="flex items-center w-full min-h-[18px]">
                  <span className="w-[88px] flex-none font-semibold text-black whitespace-nowrap text-left">
                    Party Name
                  </span>
                  <span className="w-3 flex-none text-center font-semibold text-black">:</span>
                  <div className="flex-1 min-w-0 border-b border-dotted border-black pb-0.5 font-bold text-black truncate">
                    {challan.partyName || 'Cash / Customer'}
                  </div>
                </div>

                {/* Row 2: Address */}
                <div className="flex items-center w-full min-h-[18px]">
                  <span className="w-[88px] flex-none font-semibold text-black whitespace-nowrap text-left">
                    Address
                  </span>
                  <span className="w-3 flex-none text-center font-semibold text-black">:</span>
                  <div className="flex-1 min-w-0 border-b border-dotted border-black pb-0.5 font-semibold text-black truncate">
                    {challan.address || '\u00A0'}
                  </div>
                </div>

                {/* Row 3: Phone */}
                <div className="flex items-center w-full min-h-[18px]">
                  <span className="w-[88px] flex-none font-semibold text-black whitespace-nowrap text-left">
                    Phone
                  </span>
                  <span className="w-3 flex-none text-center font-semibold text-black">:</span>
                  <div className="flex-1 min-w-0 border-b border-dotted border-black pb-0.5 font-mono font-semibold text-black truncate">
                    {challan.phone || '\u00A0'}
                  </div>
                </div>
              </div>

              {/* Right Side: Challan No & Date (Row 1), Order No & Date (Row 2), Salesman Code/Name (Row 3) */}
              <div className="w-[280px] flex-none space-y-0.5">
                {/* Row 1: Challan No & Date */}
                <div className="flex items-center justify-start min-h-[18px] w-full">
                  <span className="w-[88px] flex-none font-semibold text-black whitespace-nowrap text-left">
                    Challan No.
                  </span>
                  <span className="w-3 flex-none text-center font-semibold text-black">:</span>
                  <div className="border-b border-dotted border-black w-[68px] flex-none pb-0.5 font-mono font-bold text-center text-black">
                    {challan.challanNo || '\u00A0'}
                  </div>
                  <span className="w-[40px] flex-none font-semibold text-black whitespace-nowrap text-right pr-1">
                    Date:
                  </span>
                  <div className="w-[71px] flex-none border-b border-dotted border-black pb-0.5 font-mono font-semibold text-center text-black">
                    {formatDateDDMMYY(challan.date) || '\u00A0'}
                  </div>
                </div>

                {/* Row 2: Order No & Date */}
                <div className="flex items-center justify-start min-h-[18px] w-full">
                  <span className="w-[88px] flex-none font-semibold text-black whitespace-nowrap text-left">
                    Order No.
                  </span>
                  <span className="w-3 flex-none text-center font-semibold text-black">:</span>
                  <div className="border-b border-dotted border-black w-[68px] flex-none pb-0.5 font-mono font-semibold text-center text-black truncate">
                    {challan.orderNumber || '\u00A0'}
                  </div>
                  <span className="w-[40px] flex-none font-semibold text-black whitespace-nowrap text-right pr-1">
                    Date:
                  </span>
                  <div className="w-[71px] flex-none border-b border-dotted border-black pb-0.5 font-mono font-semibold text-center text-black">
                    {formatDateDDMMYY(challan.orderDate || challan.date) || '\u00A0'}
                  </div>
                </div>

                {/* Row 3: Salesman Code / Name */}
                <div className="flex items-center justify-start min-h-[18px] w-full">
                  <span className="w-[88px] flex-none font-semibold text-black whitespace-nowrap text-left">
                    Salesman
                  </span>
                  <span className="w-3 flex-none text-center font-semibold text-black">:</span>
                  <div className="border-b border-dotted border-black flex-1 pb-0.5 font-semibold text-black truncate">
                    {challan.salespersonName || challan.salesmanCode || '\u00A0'}
                  </div>
                </div>
              </div>
            </div>

            {/* Bill / Challan Table matching BillInvoiceView style */}
            <div className="border-2 border-black overflow-visible font-sans flex-1 flex flex-col justify-between mt-1 mb-1 min-h-[360px]">
              <table className="w-full text-left border-collapse flex-1 text-[13px]">
                <thead>
                  <tr className="bg-white text-black border-b-2 border-black font-bold text-center">
                    <th className="py-1 px-1.5 border-r border-black text-center w-10 font-bold whitespace-nowrap">
                      Sl No.
                    </th>
                    <th className="py-1 px-2 border-r border-black text-center font-bold whitespace-nowrap min-w-[240px]">
                      Item Description
                    </th>
                    <th className="py-1 px-1.5 border-r border-black text-center w-16 font-bold whitespace-nowrap">
                      Quantity
                    </th>
                    <th className="py-1 px-1.5 border-r border-black text-center w-16 font-bold whitespace-nowrap">
                      Unit
                    </th>
                    <th className="py-1 px-2 text-center w-32 font-bold whitespace-nowrap">
                      Colour
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-transparent">
                  {displayLines.map((line, idx) => (
                    <tr key={line.id || idx} className="font-semibold text-black min-h-[24px]">
                      <td className="py-0.5 px-1.5 border-r border-black text-center font-sans font-semibold">
                        {String(idx + 1).padStart(2, '0')}.
                      </td>
                      <td className="py-0.5 px-2 border-r border-black font-semibold whitespace-normal break-words leading-tight">
                        {line.itemDescription || ''}
                      </td>
                      <td className="py-0.5 px-1.5 border-r border-black text-center font-semibold">
                        {line.coilQty > 0 ? line.coilQty : ''}
                      </td>
                      <td className="py-0.5 px-1.5 border-r border-black text-center font-semibold">
                        {line.coilQty > 0 ? (line.unit || 'Coils') : ''}
                      </td>
                      <td className="py-0.5 px-2 text-center font-semibold text-[11px] whitespace-normal">
                        {formatChallanLineColors(line)}
                      </td>
                    </tr>
                  ))}

                  {/* Spacer rows so printed document matches fixed pad height */}
                  {Array.from({ length: spacerCount }).map((_, emptyIdx) => (
                    <tr key={`empty-spacer-${emptyIdx}`} className="h-6">
                      <td className="border-r border-black"></td>
                      <td className="border-r border-black"></td>
                      <td className="border-r border-black"></td>
                      <td className="border-r border-black"></td>
                      <td></td>
                    </tr>
                  ))}
                </tbody>

                <tfoot>
                  {/* Total Coils Row */}
                  <tr className="border-t-2 border-black font-semibold bg-slate-50/50">
                    <td colSpan={2} className="py-1 px-2 text-right border-r border-black font-semibold uppercase tracking-wider whitespace-nowrap">
                      Total Coils =
                    </td>
                    <td className="py-1 px-1.5 text-center border-r border-black font-bold text-black font-mono">
                      {totalCoilQty}
                    </td>
                    <td className="py-1 px-1.5 text-center border-r border-black font-semibold text-slate-700">
                      Coils
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* In Word Row */}
            <div className="pt-2 text-black flex items-center space-x-2 flex-none text-[13px]">
              <span className="font-semibold text-black">In Word:</span>
              <span className="font-bold text-black">{inWords}</span>
            </div>

            {/* Clearance space before Signatures: min 5 lines normally, 3 lines when many items */}
            <div
              className={`${displayLines.length >= 10 ? 'min-h-[42px] h-[42px]' : 'min-h-[75px] h-[75px]'} flex-none w-full`}
              aria-hidden="true"
            />

            {/* 4 Footer Signatures */}
            <div className="grid grid-cols-4 gap-4 pb-1 text-center text-xs font-semibold text-black">
              <div className="border-t border-dotted border-black pt-1">
                Receiver's Signature
              </div>
              <div className="border-t border-dotted border-black pt-1">
                Prepared By
              </div>
              <div className="border-t border-dotted border-black pt-1">
                Check By
              </div>
              <div className="border-t border-dotted border-black pt-1">
                Approved By
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM CONTROLS TOOLBAR */}
      <div className="bg-slate-950 border-t border-slate-800 p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700 space-x-1 text-xs">
            <button
              type="button"
              onClick={() => setPadHeaderMode('hide_logo')}
              className={`px-2.5 py-1 rounded font-bold transition-all cursor-pointer ${
                padHeaderMode === 'hide_logo'
                  ? 'bg-amber-400 text-slate-950 shadow-xs font-black'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
              title="Hide top 2.25cm logo header to print on pre-printed stationery"
            >
              📜 Pad (Hide Logo)
            </button>
            <button
              type="button"
              onClick={() => setPadHeaderMode('hide_all')}
              className={`px-2.5 py-1 rounded font-bold transition-all cursor-pointer ${
                padHeaderMode === 'hide_all'
                  ? 'bg-amber-400 text-slate-950 shadow-xs font-black'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
              title="Hide logo and address for fully pre-printed pad"
            >
              📑 Pad (Hide All)
            </button>
            <button
              type="button"
              onClick={() => setPadHeaderMode('plain')}
              className={`px-2.5 py-1 rounded font-bold transition-all cursor-pointer ${
                padHeaderMode === 'plain'
                  ? 'bg-emerald-500 text-slate-950 shadow-xs font-black'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
              title="Print full logo, address and branding on plain A4/Letter paper"
            >
              📄 Plain Paper
            </button>
          </div>

          <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700 space-x-1 text-xs">
            {(['80%', '100%', '115%'] as const).map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setZoomLevel(z)}
                className={`px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                  zoomLevel === z ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {z}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-lg flex items-center space-x-1 transition-colors cursor-pointer border border-slate-700"
              title="Return to Form Entry"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Form</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg flex items-center space-x-1.5 shadow-md transition-all cursor-pointer"
            title="Print Challan Pad (Ctrl+P)"
          >
            <Printer className="w-4 h-4" />
            <span>Print Now (Ctrl+P)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
