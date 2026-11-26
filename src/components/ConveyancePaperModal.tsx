import React, { useRef, useState } from 'react';
import { ConveyanceEntry, ConveyanceJourneyLeg, CompanyDetails } from '../types';
import { PolyCablesEmblem } from './PolyCablesLogo';
import { formatDateDDMMYY } from '../utils/dateUtils';
import { convertToTakaWords } from '../utils/numberToWords';
import { Printer, X, Download, RotateCcw, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useAutoPrintOnOpen } from '../hooks/useAutoPrintOnOpen';

interface ConveyancePaperModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry?: ConveyanceEntry | null;
  company?: CompanyDetails;
}

export const ConveyancePaperModal: React.FC<ConveyancePaperModalProps> = ({
  isOpen,
  onClose,
  entry,
  company
}) => {
  const [isBlankMode, setIsBlankMode] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useAutoPrintOnOpen(isOpen, () => window.print());

  if (!isOpen) return null;

  // Determine rows to render
  const journeyRows: Array<{ from: string; to: string; by: string; taka: string; ps: string }> = [];

  if (!isBlankMode && entry) {
    if (entry.journeyRows && entry.journeyRows.length > 0) {
      entry.journeyRows.forEach((leg) => {
        const fromLoc = leg.from || (leg as any).fromLocation || '';
        const toLoc = leg.to || (leg as any).toLocation || '';
        const byMode = leg.by || (leg as any).transportMode || '';
        const takaVal = leg.taka !== undefined && leg.taka !== null ? String(leg.taka) : (leg as any).amount ? String((leg as any).amount) : '';
        const psVal = leg.ps !== undefined && leg.ps !== null && leg.ps !== '' ? String(leg.ps) : takaVal ? '00' : '';
        journeyRows.push({
          from: fromLoc,
          to: toLoc,
          by: byMode,
          taka: takaVal,
          ps: psVal
        });
      });
    } else if (entry.fromLocation || entry.toLocation || entry.conveyanceAmount) {
      journeyRows.push({
        from: entry.fromLocation || '',
        to: entry.toLocation || '',
        by: entry.transportMode || '',
        taka: entry.conveyanceAmount ? String(entry.conveyanceAmount) : '',
        ps: entry.conveyanceAmount ? '00' : ''
      });
    }

    // Daily allowance row
    if (entry.dailyAllowanceAmount && entry.dailyAllowanceAmount > 0) {
      journeyRows.push({
        from: 'Daily Allowance',
        to: entry.dailyAllowanceType ? `Food (${entry.dailyAllowanceType})` : 'Day Allowance',
        by: 'Allowance',
        taka: String(entry.dailyAllowanceAmount),
        ps: '00'
      });
    }

    // Hotel bill row
    if (entry.hasHotelBill && entry.hotelAmount && entry.hotelAmount > 0) {
      journeyRows.push({
        from: 'Hotel Accommodation',
        to: entry.hotelName ? entry.hotelName : 'Lodging / Night Stay',
        by: 'Hotel Bill',
        taka: String(entry.hotelAmount),
        ps: '00'
      });
    }
  }

  // Target 8-9 rows to match the physical pad in the uploaded image
  const totalRowsCount = Math.max(8, journeyRows.length + 1);
  const rowsToRender: Array<{ from: string; to: string; by: string; taka: string; ps: string }> = [];

  for (let i = 0; i < totalRowsCount; i++) {
    if (i < journeyRows.length) {
      rowsToRender.push(journeyRows[i]);
    } else {
      rowsToRender.push({ from: '', to: '', by: '', taka: '', ps: '' });
    }
  }

  const grandTotal = isBlankMode || !entry ? 0 : entry.totalAmount || 0;
  const grandTotalWords = grandTotal > 0 ? convertToTakaWords(grandTotal) : '';

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      {/* Container Dialog */}
      <div className="bg-[#091e2c]/95 backdrop-blur-2xl border border-cyan-400/35 rounded-2xl max-w-4xl w-full shadow-[0_24px_64px_rgba(0,0,0,0.65)] overflow-hidden flex flex-col max-h-[95vh]">
        {/* Modal Top Bar (Screen Only) */}
        <div className="no-print p-3.5 cyber-glass-header border-b border-cyan-500/25 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center space-x-2">
            <span className="p-1.5 bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 rounded-lg">
              <Printer className="w-4 h-4" />
            </span>
            <div>
              <h3 className="font-black text-sm text-white">Poly Cables Conveyance Paper</h3>
              <p className="text-[10px] text-slate-300">
                Official printed conveyance bill matching physical pad layout
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setIsBlankMode(!isBlankMode)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer border ${
                isBlankMode
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                  : 'bg-[#081b28] text-slate-200 hover:bg-[#0e2a3d] hover:text-white border-cyan-500/25'
              }`}
              title="Toggle between pre-filled bill and blank paper memo pad"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isBlankMode ? 'Show Data Filled' : 'Show Blank Form'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs rounded-xl shadow-lg transition flex items-center space-x-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Paper Bill</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-[#0e2a3d] rounded-xl transition cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Paper Area */}
        <div className="overflow-y-auto p-4 sm:p-8 flex justify-center bg-[#041018]/85">
          {/* Authentic Paper Container: 
              Strictly styled matching user's uploaded image IMG-20261028-WA0000.jpg
          */}
          <div
            ref={printRef}
            id="conveyance-printable-sheet"
            className="conveyance-paper-sheet bg-white text-slate-900 w-full max-w-[780px] p-6 sm:p-10 rounded-lg shadow-xl border border-slate-300 relative font-sans text-xs select-none"
            style={{
              minHeight: '520px',
              color: '#0f172a'
            }}
          >
            {/* 1. Header Pill: CONVEYANCE BILL */}
            <div className="text-center mb-2">
              <div
                style={{
                  border: '1.5px solid #1e3a8a',
                  borderRadius: '9999px',
                  padding: '3px 28px',
                  fontWeight: 800,
                  fontSize: '13px',
                  letterSpacing: '0.12em',
                  color: '#1e3a8a',
                  display: 'inline-block',
                  lineHeight: '1.2'
                }}
              >
                CONVEYANCE BILL
              </div>
            </div>

            {/* 2. Company Brand & Emblem */}
            <div className="flex items-center justify-center space-x-3 mb-4">
              <PolyCablesEmblem size="sm" />
              <div className="text-center leading-none">
                <div
                  style={{
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    fontWeight: 900,
                    fontSize: '24px',
                    letterSpacing: '0.04em',
                    color: '#1e3a8a'
                  }}
                >
                  POLY CABLES
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: '11px',
                    letterSpacing: '0.05em',
                    color: '#1e293b',
                    marginTop: '2px'
                  }}
                >
                  Connect & Protect
                </div>
              </div>
            </div>

            {/* 3. Voucher No, Date, and Name lines */}
            <div className="mb-3 space-y-2 text-[12px] font-semibold text-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1 flex-1">
                  <span className="font-bold text-slate-900">Vr. No.</span>
                  <span className="border-b border-dotted border-slate-700 flex-1 max-w-[200px] px-2 font-mono font-bold text-slate-900">
                    {!isBlankMode && entry?.voucherNo
                      ? entry.voucherNo
                      : !isBlankMode && entry?.id
                      ? entry.id.replace('conv-', 'CV-').slice(0, 12).toUpperCase()
                      : ''}
                  </span>
                </div>
                <div className="flex items-center space-x-1 flex-1 justify-end">
                  <span className="font-bold text-slate-900">Date :</span>
                  <span className="border-b border-dotted border-slate-700 min-w-[150px] px-2 font-mono font-bold text-slate-900 text-center">
                    {!isBlankMode && entry?.date ? formatDateDDMMYY(entry.date) : ''}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-1 pt-1">
                <span className="font-bold text-slate-900 shrink-0">Name :</span>
                <span className="border-b border-dotted border-slate-700 flex-1 px-2 font-bold text-slate-900">
                  {!isBlankMode && entry?.salespersonName ? entry.salespersonName : ''}
                  {!isBlankMode && entry?.salesmanCode ? ` (${entry.salesmanCode})` : ''}
                  {!isBlankMode && entry?.branchName ? ` - ${entry.branchName}` : ''}
                </span>
              </div>
            </div>

            {/* 4. The Grid Table (FROM, TO, BY, TAKA, Ps.) */}
            <div className="mb-3">
              <table
                className="w-full border-collapse"
                style={{
                  border: '1.5px solid #1e3a8a',
                  fontSize: '11px'
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: '1.5px solid #1e3a8a',
                      backgroundColor: '#f8fafc',
                      color: '#0f172a',
                      fontWeight: 800,
                      textAlign: 'center'
                    }}
                  >
                    <th
                      style={{
                        width: '32%',
                        borderRight: '1.5px solid #1e3a8a',
                        padding: '6px 8px',
                        letterSpacing: '0.05em'
                      }}
                    >
                      FROM
                    </th>
                    <th
                      style={{
                        width: '32%',
                        borderRight: '1.5px solid #1e3a8a',
                        padding: '6px 8px',
                        letterSpacing: '0.05em'
                      }}
                    >
                      TO
                    </th>
                    <th
                      style={{
                        width: '18%',
                        borderRight: '1.5px solid #1e3a8a',
                        padding: '6px 8px',
                        letterSpacing: '0.05em'
                      }}
                    >
                      BY
                    </th>
                    <th
                      style={{
                        width: '12%',
                        borderRight: '1.5px solid #1e3a8a',
                        padding: '6px 8px',
                        letterSpacing: '0.05em'
                      }}
                    >
                      TAKA
                    </th>
                    <th
                      style={{
                        width: '6%',
                        padding: '6px 4px',
                        letterSpacing: '0.05em'
                      }}
                    >
                      Ps.
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rowsToRender.map((row, idx) => (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: '1px solid #1e3a8a',
                        height: '28px',
                        lineHeight: '1.2'
                      }}
                    >
                      <td
                        style={{
                          borderRight: '1.5px solid #1e3a8a',
                          padding: '3px 8px',
                          color: '#1e293b',
                          fontWeight: 600
                        }}
                      >
                        {row.from}
                      </td>
                      <td
                        style={{
                          borderRight: '1.5px solid #1e3a8a',
                          padding: '3px 8px',
                          color: '#1e293b',
                          fontWeight: 600
                        }}
                      >
                        {row.to}
                      </td>
                      <td
                        style={{
                          borderRight: '1.5px solid #1e3a8a',
                          padding: '3px 8px',
                          color: '#334155',
                          textAlign: 'center'
                        }}
                      >
                        {row.by}
                      </td>
                      <td
                        style={{
                          borderRight: '1.5px solid #1e3a8a',
                          padding: '3px 8px',
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          textAlign: 'right'
                        }}
                      >
                        {row.taka}
                      </td>
                      <td
                        style={{
                          padding: '3px 4px',
                          fontFamily: 'monospace',
                          textAlign: 'center',
                          color: '#475569'
                        }}
                      >
                        {row.ps}
                      </td>
                    </tr>
                  ))}

                  {/* Total Row */}
                  <tr
                    style={{
                      borderTop: '1.5px solid #1e3a8a',
                      backgroundColor: '#f8fafc',
                      fontWeight: 800,
                      height: '28px'
                    }}
                  >
                    <td
                      colSpan={3}
                      style={{
                        borderRight: '1.5px solid #1e3a8a',
                        padding: '4px 8px',
                        textAlign: 'right',
                        letterSpacing: '0.05em',
                        color: '#0f172a'
                      }}
                    >
                      TOTAL:
                    </td>
                    <td
                      style={{
                        borderRight: '1.5px solid #1e3a8a',
                        padding: '4px 8px',
                        textAlign: 'right',
                        fontFamily: 'monospace',
                        fontWeight: 900,
                        color: '#1e3a8a',
                        fontSize: '12px'
                      }}
                    >
                      {grandTotal > 0 ? grandTotal.toLocaleString('en-IN') : ''}
                    </td>
                    <td
                      style={{
                        padding: '4px 4px',
                        textAlign: 'center',
                        fontFamily: 'monospace',
                        color: '#475569'
                      }}
                    >
                      {grandTotal > 0 ? '00' : ''}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 5. Taka (In words) */}
            <div className="flex items-center space-x-1 mb-8 text-[11px] font-semibold">
              <span className="font-bold text-slate-900 shrink-0">Taka (In words) :</span>
              <span className="border-b border-dotted border-slate-700 flex-1 px-2 font-bold text-slate-900 capitalize">
                {grandTotalWords ? grandTotalWords : ''}
              </span>
              <span className="font-bold text-slate-900 shrink-0">Only</span>
            </div>

            {/* 6. Signature Footers matching uploaded image */}
            <div className="flex items-end justify-between pt-6 text-[12px] font-bold text-slate-800">
              <div className="text-center w-48">
                <div className="border-t border-slate-800 pt-1.5">
                  <div>Received by</div>
                  {!isBlankMode && entry?.salespersonName && (
                    <div className="text-[10px] text-slate-500 font-normal">
                      {entry.salespersonName}
                    </div>
                  )}
                </div>
              </div>

              <div className="text-center w-48">
                <div className="border-t border-slate-800 pt-1.5">
                  <div className="flex items-center justify-center space-x-1">
                    <span>Approved by</span>
                    {!isBlankMode && entry?.status === 'approved' && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 inline" />
                    )}
                  </div>
                  {!isBlankMode && entry?.adminApprovedBy && (
                    <div className="text-[10px] text-emerald-700 font-bold">
                      Admin: {entry.adminApprovedBy}
                    </div>
                  )}
                  {!isBlankMode && entry?.inChargeApprovedBy && !entry.adminApprovedBy && (
                    <div className="text-[10px] text-blue-700 font-bold">
                      In-Charge: {entry.inChargeApprovedBy}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="no-print p-3 bg-[#071824]/90 border-t border-cyan-500/20 flex items-center justify-between text-xs text-slate-300">
          <div>
            Tip: Press <kbd className="px-1.5 py-0.5 bg-[#0c2638] text-cyan-200 border border-cyan-500/25 rounded">Ctrl+P</kbd> or click Print Paper Bill to print directly to your physical or PDF printer.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 font-bold rounded-xl transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConveyancePaperModal;
