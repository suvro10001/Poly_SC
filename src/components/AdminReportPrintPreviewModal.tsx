import React, { useState, useMemo } from 'react';
import {
  Printer,
  X,
  Building2,
  Calendar,
  Filter,
  FileText,
  Layers,
  Award,
  TrendingUp,
  Package,
  DollarSign,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { CompanyDetails, Party } from '../types';
import { formatDateDDMMYY } from '../utils/dateUtils';
import { cleanBranchName } from '../utils/branchAccess';
import { PolyCablesLogo } from './PolyCablesLogo';

export interface AdminReportPrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'sales_collection_list' | 'incharge_summary' | 'item_wise_sales' | 'target_achievement' | 'date_wise' | 'itemized_ledger' | 'party_statement';
  company?: CompanyDetails;
  startDate?: string;
  endDate?: string;
  selectedBranchName?: string;
  selectedInChargeName?: string;
  selectedOfficerName?: string;
  selectedPartyName?: string;
  // Tab 1: Sales & Collection List
  salesAndCollectionList?: Array<{
    id: string;
    date: string;
    type: 'sale' | 'collection';
    refNo: string;
    partyName: string;
    branchName: string;
    inChargeName: string;
    officerName: string;
    salesAmount: number;
    collectionAmount: number;
    paymentMethod: string;
    remarks: string;
  }>;
  totalSalesAmount?: number;
  totalCollectionAmount?: number;
  netSalesDiff?: number;
  // Tab 2: In-Charge Summary
  inChargeSummaries?: Array<{
    branchId: string;
    branchName: string;
    inChargeName: string;
    inChargeCode: string;
    inChargePhone: string;
    inChargeMonthlyTarget: number;
    grossSales: number;
    discountTotal: number;
    netSales: number;
    directCashSales: number;
    partyCreditSales: number;
    totalCollection: number;
    cashCollection: number;
    bankCollection: number;
    salesNetCashDiff: number;
    targetPercent: number;
    officersCount: number;
    invoicesCount: number;
    collectionsCount: number;
    officers: Array<{
      id: string;
      code: string;
      name: string;
      role: string;
      isIc: boolean;
      monthlyTargetSales: number;
      monthlyTargetCollection: number;
      netSales: number;
      collection: number;
      targetPercent: number;
    }>;
  }>;
  inChargeGrandTotals?: {
    grossSales: number;
    discountTotal: number;
    netSales: number;
    totalCollection: number;
    directCashSales: number;
    partyCreditSales: number;
    cashCollection: number;
    bankCollection: number;
    salesNetCashDiff: number;
    invoicesCount: number;
    collectionsCount: number;
    totalTarget: number;
    overallTargetPercent: number;
  };
  // Tab 3: Item-Wise Sales
  itemWiseSalesList?: Array<{
    key: string;
    itemKey: string;
    itemId: string;
    itemDescription: string;
    sizeSpec: string;
    category: string;
    unit: string;
    totalQty: number;
    grossSales: number;
    discountAmount: number;
    netSales: number;
    invoicesCount: number;
    avgRate: number;
    percentOfTotalSales: number;
  }>;
  itemWiseTotals?: {
    totalQty: number;
    totalGross: number;
    totalDiscount: number;
    totalNet: number;
    itemCount: number;
  };
  // Tab 4: Target vs Achievement
  personWiseTargets?: Array<{
    person: {
      id: string;
      code: string;
      name: string;
      role: string;
      branchName?: string;
      isInCharge?: boolean;
    };
    targetSales: number;
    targetCollection: number;
    achievedSales: number;
    achievedCollection: number;
    salesPercent: number;
    collectionPercent: number;
    statusText: string;
  }>;
  // Tab 5: Date-Wise Cash Flow
  dateWiseList?: Array<{
    date: string;
    netSales: number;
    cashSales: number;
    creditSales: number;
    totalCollection: number;
    cashCollection: number;
    bankCollection: number;
  }>;
  // Tab 6: Invoices / Bills
  filteredBills?: any[];
  // Tab 7: Party Statement
  partyStatementData?: {
    party: Party;
    openingBalance: number;
    ledger: Array<{
      date: string;
      type: 'sale' | 'collection';
      refNo: string;
      description: string;
      debit: number;
      credit: number;
      balance: number;
    }>;
    totalDebit: number;
    totalCredit: number;
    closingBalance: number;
  } | null;
}

export const AdminReportPrintPreviewModal: React.FC<AdminReportPrintPreviewModalProps> = ({
  isOpen,
  onClose,
  activeTab: initialTab,
  company,
  startDate,
  endDate,
  selectedBranchName = 'All Showrooms',
  selectedInChargeName = 'All In-Charges',
  selectedOfficerName = 'All Marketing Officers',
  selectedPartyName = 'All Customers',
  salesAndCollectionList = [],
  totalSalesAmount = 0,
  totalCollectionAmount = 0,
  netSalesDiff = 0,
  inChargeSummaries = [],
  inChargeGrandTotals,
  itemWiseSalesList = [],
  itemWiseTotals,
  personWiseTargets = [],
  dateWiseList = [],
  filteredBills = [],
  partyStatementData
}) => {
  const [currentTab, setCurrentTab] = useState(initialTab);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('landscape');
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  // Sync current tab if initialTab changes
  React.useEffect(() => {
    setCurrentTab(initialTab);
  }, [initialTab]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const getTabTitle = (tab: typeof currentTab): { main: string; sub: string } => {
    switch (tab) {
      case 'sales_collection_list':
        return {
          main: 'EXECUTIVE SALES & COLLECTION REGISTER',
          sub: 'Comprehensive Chronological Register of Invoices & Collection Money Receipts'
        };
      case 'incharge_summary':
        return {
          main: 'SALES CENTER & IN-CHARGE MASTER SUMMARY',
          sub: 'Showroom-Level Performance, Target vs Sales Achievement & Revenue Reconciliation'
        };
      case 'item_wise_sales':
        return {
          main: 'ITEM-WISE SALES & PRODUCT CONTRIBUTION REPORT',
          sub: 'Product Model Volume Sold, Gross Value, Discounts & Contribution Matrix'
        };
      case 'target_achievement':
        return {
          main: 'MARKETING OFFICER TARGET VS ACHIEVEMENT REPORT',
          sub: 'Personnel Monthly Target vs Actual Net Sales & Collections Evaluation'
        };
      case 'date_wise':
        return {
          main: 'DAILY SALES & COLLECTION CASH FLOW CHRONOLOGY',
          sub: 'Day-by-Day Net Sales, Cash/Bank Collections & Daily Cash Flow Surplus/Deficit'
        };
      case 'itemized_ledger':
        return {
          main: 'INVOICE REGISTRY & STORED BILLS DIRECTORY',
          sub: 'Detailed Audit Trail of Customer Invoices, Paid Advances & Outstanding Receivables'
        };
      case 'party_statement':
        return {
          main: 'CUSTOMER ACCOUNT STATEMENT & LEDGER',
          sub: 'Historical Sales Invoices, Realized Collections & Progressive Balance'
        };
      default:
        return {
          main: 'EXECUTIVE SALES & COLLECTION REPORT',
          sub: 'Internal Audit & Administrative Report'
        };
    }
  };

  const tabTitle = getTabTitle(currentTab);
  const currentDateStr = formatDateDDMMYY(new Date().toISOString().split('T')[0]);
  const dateRangeStr = startDate && endDate ? `${formatDateDDMMYY(startDate)} to ${formatDateDDMMYY(endDate)}` : 'Full Financial Period';

  return (
    <div className="print-preview-modal-backdrop fixed inset-0 z-50 bg-slate-900/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <style>{`
        @media print {
          #printable-admin-report {
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
            padding: 4mm !important;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
            border: none !important;
            overflow: visible !important;
          }
          @page {
            size: ${orientation};
            margin: 8mm;
          }
        }
      `}</style>

      <div className="print-preview-modal-dialog bg-slate-900 text-slate-100 rounded-2xl max-w-6xl w-full max-h-[96vh] flex flex-col shadow-2xl border border-slate-700 overflow-hidden">
        {/* Modal Toolbar Header */}
        <div className="p-3.5 bg-slate-800 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-black text-white">Print Preview • Sales & Collection (Admin)</h2>
                <span className="px-2 py-0.5 bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-full text-[10px] font-bold">
                  {currentTab.replace(/_/g, ' ').toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Formal printable company layout • High-contrast black & white format
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Tab Selector inside Preview */}
            <select
              value={currentTab}
              onChange={(e) => setCurrentTab(e.target.value as any)}
              className="px-2.5 py-1.5 bg-slate-700 border border-slate-600 rounded-xl text-xs font-bold text-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="sales_collection_list">1. Sales & Collection Register</option>
              <option value="incharge_summary">2. In-Charge & Branch Summary</option>
              <option value="item_wise_sales">3. Item-Wise Sales Report</option>
              <option value="target_achievement">4. Target vs Achievement</option>
              <option value="date_wise">5. Date-Wise Cash Flow</option>
              <option value="itemized_ledger">6. Invoice Registry</option>
              <option value="party_statement">7. Customer Statement</option>
            </select>

            {/* Orientation */}
            <div className="flex items-center bg-slate-700 rounded-xl p-0.5 border border-slate-600 text-xs">
              <button
                type="button"
                onClick={() => setOrientation('portrait')}
                className={`px-2 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  orientation === 'portrait' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
                }`}
              >
                Portrait
              </button>
              <button
                type="button"
                onClick={() => setOrientation('landscape')}
                className={`px-2 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  orientation === 'landscape' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
                }`}
              >
                Landscape
              </button>
            </div>

            {/* Print Now Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-lg transition-all flex items-center space-x-1.5 cursor-pointer"
              title="Print this report now (Ctrl+P)"
            >
              <Printer className="w-4 h-4" />
              <span>Print Now</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl transition-all cursor-pointer"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Paper Container */}
        <div className="print-preview-canvas-container flex-1 overflow-auto p-2.5 sm:p-6 bg-slate-950/60 flex justify-start sm:justify-center">
          <div
            id="printable-admin-report"
            className="bg-white text-slate-900 shadow-2xl rounded-sm p-3 sm:p-10 w-full max-w-5xl border border-slate-300 flex flex-col justify-between"
            style={{
              minHeight: orientation === 'landscape' ? '700px' : '980px',
              zoom: `${zoomLevel}%`
            }}
          >
            {/* Report Header */}
            <div className="border-b-2 border-slate-900 pb-4 mb-4">
              <div className="flex flex-col sm:flex-row print:flex-row justify-between items-start gap-2">
                <div>
                  <PolyCablesLogo size="lg" showSubtitle={true} subtitleText="INDUSTRIES LTD." />
                  <p className="text-xs font-semibold text-slate-600 mt-1">
                    {company?.address || 'CORPORATE OFFICE: House-16, Block-C, Main Road, Aftabnagar, Dhaka, Bangladesh'}
                  </p>
                  <p className="text-[11px] font-medium text-slate-500">
                    Mobile: {company?.phone || '01730732000'} | Email: {company?.email || 'info@polycables.com'}
                  </p>
                </div>
                <div className="text-left sm:text-right print:text-right">
                  <span className="inline-block px-2.5 py-1 bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider rounded-sm">
                    Sales & Collection Admin Report
                  </span>
                  <div className="text-[11px] font-mono font-bold text-slate-700 mt-1">
                    Print Date: {currentDateStr}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-500">
                    Authorized Super Admin Copy
                  </div>
                </div>
              </div>

              {/* Title & Subtitle */}
              <div className="mt-3 pt-2.5 border-t border-slate-200 text-center">
                <h2 className="text-base sm:text-lg font-black uppercase tracking-wide text-slate-900">
                  {tabTitle.main}
                </h2>
                <p className="text-[11px] text-slate-600 font-medium">
                  {tabTitle.sub}
                </p>
              </div>

              {/* Filter Parameters Strip */}
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-slate-50 p-2.5 rounded-sm border border-slate-200 font-medium">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Reporting Period:</span>
                  <strong className="text-slate-900">{dateRangeStr}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Sales Center:</span>
                  <strong className="text-slate-900">{selectedBranchName}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">In-Charge / Officer:</span>
                  <strong className="text-slate-900 truncate block">
                    {selectedInChargeName !== 'All In-Charges' ? selectedInChargeName : selectedOfficerName}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Customer / Scope:</span>
                  <strong className="text-slate-900 truncate block">{selectedPartyName}</strong>
                </div>
              </div>
            </div>

            {/* TAB-SPECIFIC REPORT CONTENT */}
            <div className="flex-1 space-y-4 my-2">
              {/* TAB 1: SALES & COLLECTION LIST */}
              {currentTab === 'sales_collection_list' && (
                <div className="overflow-x-auto print:overflow-visible">
                  <table className="w-full min-w-[680px] text-left text-xs border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                        <th className="p-2 border-r border-slate-300 w-10 text-center">SL</th>
                        <th className="p-2 border-r border-slate-300 w-20">Date</th>
                        <th className="p-2 border-r border-slate-300 w-16 text-center">Type</th>
                        <th className="p-2 border-r border-slate-300 w-24">Ref / Memo #</th>
                        <th className="p-2 border-r border-slate-300">Customer / Party Name</th>
                        <th className="p-2 border-r border-slate-300">Showroom / Officer</th>
                        <th className="p-2 border-r border-slate-300 text-right w-28">Sales (৳)</th>
                        <th className="p-2 border-r border-slate-300 text-right w-28">Collection (৳)</th>
                        <th className="p-2 text-right w-28">Net Diff (৳)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {salesAndCollectionList.slice(0, 300).map((row, idx) => {
                        const diff = row.collectionAmount - row.salesAmount;
                        return (
                          <tr key={row.id || idx} className="hover:bg-slate-50">
                            <td className="p-1.5 border-r border-slate-200 text-center font-mono text-slate-500">{idx + 1}</td>
                            <td className="p-1.5 border-r border-slate-200 font-mono text-slate-700">{formatDateDDMMYY(row.date)}</td>
                            <td className="p-1.5 border-r border-slate-200 text-center font-bold">
                              {row.type === 'sale' ? (
                                <span className="text-blue-800">SALE</span>
                              ) : (
                                <span className="text-emerald-800">COLL</span>
                              )}
                            </td>
                            <td className="p-1.5 border-r border-slate-200 font-mono font-bold text-slate-900">{row.refNo}</td>
                            <td className="p-1.5 border-r border-slate-200 font-bold text-slate-800">{row.partyName}</td>
                            <td className="p-1.5 border-r border-slate-200 text-slate-600 text-[11px]">
                              {cleanBranchName(row.branchName)} • {row.officerName}
                            </td>
                            <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-blue-900">
                              {row.salesAmount > 0 ? `৳${row.salesAmount.toLocaleString()}` : '-'}
                            </td>
                            <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-emerald-900">
                              {row.collectionAmount > 0 ? `৳${row.collectionAmount.toLocaleString()}` : '-'}
                            </td>
                            <td className="p-1.5 text-right font-mono font-bold">
                              <span className={diff >= 0 ? 'text-emerald-700' : 'text-amber-700'}>
                                {diff > 0 ? `+৳${diff.toLocaleString()}` : diff < 0 ? `-৳${Math.abs(diff).toLocaleString()}` : '৳0'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 font-bold border-t-2 border-slate-900 text-slate-900">
                        <td colSpan={6} className="p-2 border-r border-slate-300 text-right uppercase">
                          Grand Totals ({salesAndCollectionList.length} Transactions):
                        </td>
                        <td className="p-2 border-r border-slate-300 text-right font-mono font-black text-blue-900">
                          ৳{totalSalesAmount.toLocaleString()}
                        </td>
                        <td className="p-2 border-r border-slate-300 text-right font-mono font-black text-emerald-900">
                          ৳{totalCollectionAmount.toLocaleString()}
                        </td>
                        <td className="p-2 text-right font-mono font-black">
                          ৳{netSalesDiff.toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* TAB 2: IN-CHARGE SUMMARY */}
              {currentTab === 'incharge_summary' && (
                <div className="overflow-x-auto print:overflow-visible">
                  <table className="w-full min-w-[680px] text-left text-xs border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                        <th className="p-2 border-r border-slate-300">Showroom / In-Charge</th>
                        <th className="p-2 border-r border-slate-300 text-right">Target Sales (৳)</th>
                        <th className="p-2 border-r border-slate-300 text-right">Gross Sales (৳)</th>
                        <th className="p-2 border-r border-slate-300 text-right">Discount (৳)</th>
                        <th className="p-2 border-r border-slate-300 text-right">Net Sales (৳)</th>
                        <th className="p-2 border-r border-slate-300 text-right">Collections (৳)</th>
                        <th className="p-2 border-r border-slate-300 text-right">Net Cash Diff (৳)</th>
                        <th className="p-2 text-center w-20">Achieve %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {inChargeSummaries.map((summary, idx) => (
                        <tr key={summary.branchId || idx} className="hover:bg-slate-50">
                          <td className="p-2 border-r border-slate-200">
                            <div className="font-bold text-slate-900">{cleanBranchName(summary.branchName)}</div>
                            <div className="text-[11px] text-slate-500 font-medium">
                              In-Charge: {summary.inChargeName} ({summary.inChargeCode}) • Staff: {summary.officersCount}
                            </div>
                          </td>
                          <td className="p-2 border-r border-slate-200 text-right font-mono text-slate-700">
                            ৳{summary.inChargeMonthlyTarget.toLocaleString()}
                          </td>
                          <td className="p-2 border-r border-slate-200 text-right font-mono text-slate-700">
                            ৳{summary.grossSales.toLocaleString()}
                          </td>
                          <td className="p-2 border-r border-slate-200 text-right font-mono text-slate-600">
                            ৳{summary.discountTotal.toLocaleString()}
                          </td>
                          <td className="p-2 border-r border-slate-200 text-right font-mono font-bold text-blue-900">
                            ৳{summary.netSales.toLocaleString()}
                          </td>
                          <td className="p-2 border-r border-slate-200 text-right font-mono font-bold text-emerald-900">
                            ৳{summary.totalCollection.toLocaleString()}
                          </td>
                          <td className="p-2 border-r border-slate-200 text-right font-mono font-bold">
                            <span className={summary.salesNetCashDiff >= 0 ? 'text-emerald-700' : 'text-amber-700'}>
                              ৳{summary.salesNetCashDiff.toLocaleString()}
                            </span>
                          </td>
                          <td className="p-2 text-center font-bold">
                            <span className={summary.targetPercent >= 100 ? 'text-emerald-700' : summary.targetPercent >= 70 ? 'text-blue-700' : 'text-amber-700'}>
                              {summary.targetPercent}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {inChargeGrandTotals && (
                      <tfoot>
                        <tr className="bg-slate-100 font-bold border-t-2 border-slate-900 text-slate-900">
                          <td className="p-2 border-r border-slate-300 uppercase">
                            Grand Totals ({inChargeSummaries.length} Showrooms):
                          </td>
                          <td className="p-2 border-r border-slate-300 text-right font-mono font-black">
                            ৳{inChargeGrandTotals.totalTarget.toLocaleString()}
                          </td>
                          <td className="p-2 border-r border-slate-300 text-right font-mono font-black">
                            ৳{inChargeGrandTotals.grossSales.toLocaleString()}
                          </td>
                          <td className="p-2 border-r border-slate-300 text-right font-mono font-black">
                            ৳{inChargeGrandTotals.discountTotal.toLocaleString()}
                          </td>
                          <td className="p-2 border-r border-slate-300 text-right font-mono font-black text-blue-900">
                            ৳{inChargeGrandTotals.netSales.toLocaleString()}
                          </td>
                          <td className="p-2 border-r border-slate-300 text-right font-mono font-black text-emerald-900">
                            ৳{inChargeGrandTotals.totalCollection.toLocaleString()}
                          </td>
                          <td className="p-2 border-r border-slate-300 text-right font-mono font-black">
                            ৳{inChargeGrandTotals.salesNetCashDiff.toLocaleString()}
                          </td>
                          <td className="p-2 text-center font-black">
                            {inChargeGrandTotals.overallTargetPercent}%
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}

              {/* TAB 3: ITEM-WISE SALES */}
              {currentTab === 'item_wise_sales' && (
                <div className="overflow-x-auto print:overflow-visible">
                  <table className="w-full min-w-[680px] text-left text-xs border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                        <th className="p-2 border-r border-slate-300 w-10 text-center">SL</th>
                        <th className="p-2 border-r border-slate-300">Item Description (Latest Model)</th>
                        <th className="p-2 border-r border-slate-300 w-28">Specification</th>
                        <th className="p-2 border-r border-slate-300 w-20">Category</th>
                        <th className="p-2 border-r border-slate-300 w-16 text-center">Unit</th>
                        <th className="p-2 border-r border-slate-300 text-right w-20">Qty Sold</th>
                        <th className="p-2 border-r border-slate-300 text-right w-24">Gross (৳)</th>
                        <th className="p-2 border-r border-slate-300 text-right w-20">Discount (৳)</th>
                        <th className="p-2 border-r border-slate-300 text-right w-28">Net Sales (৳)</th>
                        <th className="p-2 text-center w-16">Share %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {itemWiseSalesList.map((item, idx) => (
                        <tr key={item.key || idx} className="hover:bg-slate-50">
                          <td className="p-1.5 border-r border-slate-200 text-center font-mono text-slate-500">{idx + 1}</td>
                          <td className="p-1.5 border-r border-slate-200 font-bold text-slate-900">{item.itemDescription}</td>
                          <td className="p-1.5 border-r border-slate-200 font-mono text-slate-700">{item.sizeSpec || '-'}</td>
                          <td className="p-1.5 border-r border-slate-200 text-slate-600">{item.category}</td>
                          <td className="p-1.5 border-r border-slate-200 text-center font-medium text-slate-600">{item.unit}</td>
                          <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-purple-900">
                            {item.totalQty.toLocaleString()}
                          </td>
                          <td className="p-1.5 border-r border-slate-200 text-right font-mono text-slate-700">
                            ৳{Math.round(item.grossSales).toLocaleString()}
                          </td>
                          <td className="p-1.5 border-r border-slate-200 text-right font-mono text-slate-500">
                            ৳{Math.round(item.discountAmount).toLocaleString()}
                          </td>
                          <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-slate-900">
                            ৳{Math.round(item.netSales).toLocaleString()}
                          </td>
                          <td className="p-1.5 text-center font-bold text-purple-700">
                            {item.percentOfTotalSales.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {itemWiseTotals && (
                      <tfoot>
                        <tr className="bg-slate-100 font-bold border-t-2 border-slate-900 text-slate-900">
                          <td colSpan={5} className="p-2 border-r border-slate-300 text-right uppercase">
                            Grand Totals ({itemWiseTotals.itemCount} Items):
                          </td>
                          <td className="p-2 border-r border-slate-300 text-right font-mono font-black text-purple-900">
                            {itemWiseTotals.totalQty.toLocaleString()}
                          </td>
                          <td className="p-2 border-r border-slate-300 text-right font-mono font-black">
                            ৳{Math.round(itemWiseTotals.totalGross).toLocaleString()}
                          </td>
                          <td className="p-2 border-r border-slate-300 text-right font-mono font-black">
                            ৳{Math.round(itemWiseTotals.totalDiscount).toLocaleString()}
                          </td>
                          <td className="p-2 border-r border-slate-300 text-right font-mono font-black text-blue-900">
                            ৳{Math.round(itemWiseTotals.totalNet).toLocaleString()}
                          </td>
                          <td className="p-2 text-center font-black">100.0%</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}

              {/* TAB 4: TARGET VS ACHIEVEMENT */}
              {currentTab === 'target_achievement' && (
                <div className="overflow-x-auto print:overflow-visible">
                  <table className="w-full min-w-[680px] text-left text-xs border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                        <th className="p-2 border-r border-slate-300 w-10 text-center">SL</th>
                        <th className="p-2 border-r border-slate-300">Personnel Name & Code</th>
                        <th className="p-2 border-r border-slate-300">Designation / Showroom</th>
                        <th className="p-2 border-r border-slate-300 text-right">Target Sales (৳)</th>
                        <th className="p-2 border-r border-slate-300 text-right">Actual Sales (৳)</th>
                        <th className="p-2 border-r border-slate-300 text-center w-20">Sales %</th>
                        <th className="p-2 border-r border-slate-300 text-right">Target Coll (৳)</th>
                        <th className="p-2 border-r border-slate-300 text-right">Actual Coll (৳)</th>
                        <th className="p-2 text-center w-24">Evaluation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {personWiseTargets.map((row, idx) => (
                        <tr key={row.person.id || idx} className="hover:bg-slate-50">
                          <td className="p-2 border-r border-slate-200 text-center font-mono text-slate-500">{idx + 1}</td>
                          <td className="p-2 border-r border-slate-200">
                            <div className="font-bold text-slate-900">{row.person.name}</div>
                            <div className="text-[11px] font-mono text-slate-500">Code: {row.person.code}</div>
                          </td>
                          <td className="p-2 border-r border-slate-200 text-slate-700">
                            <div>{row.person.role}</div>
                            <div className="text-[11px] text-slate-500">{cleanBranchName(row.person.branchName) || 'Not Set'}</div>
                          </td>
                          <td className="p-2 border-r border-slate-200 text-right font-mono text-slate-700">
                            ৳{row.targetSales.toLocaleString()}
                          </td>
                          <td className="p-2 border-r border-slate-200 text-right font-mono font-bold text-blue-900">
                            ৳{row.achievedSales.toLocaleString()}
                          </td>
                          <td className="p-2 border-r border-slate-200 text-center font-bold">
                            <span className={row.salesPercent >= 100 ? 'text-emerald-700' : row.salesPercent >= 70 ? 'text-blue-700' : 'text-amber-700'}>
                              {row.salesPercent}%
                            </span>
                          </td>
                          <td className="p-2 border-r border-slate-200 text-right font-mono text-slate-700">
                            ৳{row.targetCollection.toLocaleString()}
                          </td>
                          <td className="p-2 border-r border-slate-200 text-right font-mono font-bold text-emerald-900">
                            ৳{row.achievedCollection.toLocaleString()}
                          </td>
                          <td className="p-2 text-center font-bold text-xs">
                            <span className={row.salesPercent >= 100 ? 'text-emerald-700' : 'text-slate-700'}>
                              {row.statusText}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 5: DATE-WISE CASH FLOW */}
              {currentTab === 'date_wise' && (
                <div className="overflow-x-auto print:overflow-visible">
                  <table className="w-full min-w-[640px] text-left text-xs border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                        <th className="p-2 border-r border-slate-300 w-24">Date</th>
                        <th className="p-2 border-r border-slate-300 text-right">Net Sales (৳)</th>
                        <th className="p-2 border-r border-slate-300 text-right">Cash Sales (৳)</th>
                        <th className="p-2 border-r border-slate-300 text-right">Credit Sales (৳)</th>
                        <th className="p-2 border-r border-slate-300 text-right">Total Collection (৳)</th>
                        <th className="p-2 border-r border-slate-300 text-right">Cash Coll (৳)</th>
                        <th className="p-2 border-r border-slate-300 text-right">Bank Coll (৳)</th>
                        <th className="p-2 text-right">Net Daily Cash Flow (৳)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {dateWiseList.map((day, idx) => {
                        const netDaily = day.totalCollection - day.netSales;
                        return (
                          <tr key={day.date || idx} className="hover:bg-slate-50">
                            <td className="p-2 border-r border-slate-200 font-mono font-bold text-slate-800">
                              {formatDateDDMMYY(day.date)}
                            </td>
                            <td className="p-2 border-r border-slate-200 text-right font-mono font-bold text-blue-900">
                              ৳{day.netSales.toLocaleString()}
                            </td>
                            <td className="p-2 border-r border-slate-200 text-right font-mono text-slate-600">
                              ৳{day.cashSales.toLocaleString()}
                            </td>
                            <td className="p-2 border-r border-slate-200 text-right font-mono text-slate-600">
                              ৳{day.creditSales.toLocaleString()}
                            </td>
                            <td className="p-2 border-r border-slate-200 text-right font-mono font-bold text-emerald-900">
                              ৳{day.totalCollection.toLocaleString()}
                            </td>
                            <td className="p-2 border-r border-slate-200 text-right font-mono text-slate-600">
                              ৳{day.cashCollection.toLocaleString()}
                            </td>
                            <td className="p-2 border-r border-slate-200 text-right font-mono text-slate-600">
                              ৳{day.bankCollection.toLocaleString()}
                            </td>
                            <td className="p-2 text-right font-mono font-bold">
                              <span className={netDaily >= 0 ? 'text-emerald-700' : 'text-amber-700'}>
                                {netDaily >= 0 ? `+৳${netDaily.toLocaleString()}` : `-৳${Math.abs(netDaily).toLocaleString()}`}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 6: INVOICES / BILLS */}
              {currentTab === 'itemized_ledger' && (
                <div className="overflow-x-auto print:overflow-visible">
                  <table className="w-full min-w-[700px] text-left text-xs border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                        <th className="p-2 border-r border-slate-300 w-10 text-center">SL</th>
                        <th className="p-2 border-r border-slate-300 w-24">Bill / Invoice #</th>
                        <th className="p-2 border-r border-slate-300 w-20">Date</th>
                        <th className="p-2 border-r border-slate-300">Customer / Party</th>
                        <th className="p-2 border-r border-slate-300">Sales Center / Officer</th>
                        <th className="p-2 border-r border-slate-300 text-right w-24">Gross (৳)</th>
                        <th className="p-2 border-r border-slate-300 text-right w-20">Discount (৳)</th>
                        <th className="p-2 border-r border-slate-300 text-right w-24">Net Total (৳)</th>
                        <th className="p-2 border-r border-slate-300 text-right w-24">Paid (৳)</th>
                        <th className="p-2 text-right w-24">Due / Balance (৳)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredBills.slice(0, 200).map((bill, idx) => {
                        const billPartyName = bill.partyName || bill.header?.partyName || 'Unknown Party';
                        const net = Number(bill.header?.netAmount ?? bill.netAmount ?? bill.total ?? 0) || 0;
                        const paid = Number(bill.header?.advancePaid ?? bill.paidAmount ?? 0) || 0;
                        const due = Math.max(0, net - paid);
                        const gross = Number(bill.header?.grossAmount ?? bill.grossAmount ?? net) || net;
                        const discount = Math.max(0, gross - net);

                        return (
                          <tr key={bill.id || idx} className="hover:bg-slate-50">
                            <td className="p-1.5 border-r border-slate-200 text-center font-mono text-slate-500">{idx + 1}</td>
                            <td className="p-1.5 border-r border-slate-200 font-mono font-bold text-indigo-900">
                              {bill.billNumber || bill.header?.billNumber || 'Bill'}
                            </td>
                            <td className="p-1.5 border-r border-slate-200 font-mono text-slate-700">
                              {formatDateDDMMYY(bill.date || bill.header?.date)}
                            </td>
                            <td className="p-1.5 border-r border-slate-200 font-bold text-slate-800">{billPartyName}</td>
                            <td className="p-1.5 border-r border-slate-200 text-slate-600 text-[11px]">
                              {cleanBranchName(bill.branchName || bill.header?.branchName) || 'Central'} • {bill.marketingPerson || bill.header?.marketingPerson || '-'}
                            </td>
                            <td className="p-1.5 border-r border-slate-200 text-right font-mono text-slate-700">
                              ৳{gross.toLocaleString()}
                            </td>
                            <td className="p-1.5 border-r border-slate-200 text-right font-mono text-slate-500">
                              ৳{discount.toLocaleString()}
                            </td>
                            <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-blue-900">
                              ৳{net.toLocaleString()}
                            </td>
                            <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-emerald-900">
                              ৳{paid.toLocaleString()}
                            </td>
                            <td className="p-1.5 text-right font-mono font-bold">
                              <span className={due > 0 ? 'text-rose-700' : 'text-slate-500'}>
                                {due > 0 ? `৳${due.toLocaleString()}` : 'PAID'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 7: PARTY STATEMENT */}
              {currentTab === 'party_statement' && (
                <div>
                  {partyStatementData ? (
                    <div>
                      <div className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded-sm text-xs">
                        <div className="font-bold text-slate-900 text-sm">{partyStatementData.party.name}</div>
                        <div className="text-slate-600">Address: {partyStatementData.party.address || 'N/A'} • Phone: {partyStatementData.party.phone || 'N/A'}</div>
                        <div className="mt-1 font-mono font-bold">
                          Opening Balance: ৳{partyStatementData.openingBalance.toLocaleString()} | Closing Balance: ৳{partyStatementData.closingBalance.toLocaleString()}
                        </div>
                      </div>
                      <div className="overflow-x-auto print:overflow-visible">
                      <table className="w-full min-w-[620px] text-left text-xs border-collapse border border-slate-300">
                        <thead>
                          <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                            <th className="p-2 border-r border-slate-300 w-24">Date</th>
                            <th className="p-2 border-r border-slate-300 w-16 text-center">Type</th>
                            <th className="p-2 border-r border-slate-300 w-28">Ref #</th>
                            <th className="p-2 border-r border-slate-300">Description</th>
                            <th className="p-2 border-r border-slate-300 text-right w-24">Debit (Sale ৳)</th>
                            <th className="p-2 border-r border-slate-300 text-right w-24">Credit (Coll ৳)</th>
                            <th className="p-2 text-right w-28">Running Balance (৳)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {partyStatementData.ledger.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="p-1.5 border-r border-slate-200 font-mono text-slate-700">{formatDateDDMMYY(item.date)}</td>
                              <td className="p-1.5 border-r border-slate-200 text-center font-bold">
                                {item.type === 'sale' ? <span className="text-blue-800">SALE</span> : <span className="text-emerald-800">COLL</span>}
                              </td>
                              <td className="p-1.5 border-r border-slate-200 font-mono font-bold text-slate-800">{item.refNo}</td>
                              <td className="p-1.5 border-r border-slate-200 text-slate-700">{item.description}</td>
                              <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-blue-900">
                                {item.debit > 0 ? `৳${item.debit.toLocaleString()}` : '-'}
                              </td>
                              <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-emerald-900">
                                {item.credit > 0 ? `৳${item.credit.toLocaleString()}` : '-'}
                              </td>
                              <td className="p-1.5 text-right font-mono font-bold">
                                ৳{item.balance.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-100 font-bold border-t-2 border-slate-900 text-slate-900">
                            <td colSpan={4} className="p-2 border-r border-slate-300 text-right uppercase">Total Debit / Credit:</td>
                            <td className="p-2 border-r border-slate-300 text-right font-mono font-black text-blue-900">
                              ৳{partyStatementData.totalDebit.toLocaleString()}
                            </td>
                            <td className="p-2 border-r border-slate-300 text-right font-mono font-black text-emerald-900">
                              ৳{partyStatementData.totalCredit.toLocaleString()}
                            </td>
                            <td className="p-2 text-right font-mono font-black">
                              ৳{partyStatementData.closingBalance.toLocaleString()}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-500 font-medium italic">
                      Please select a customer/party from the report to view customer statement.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Official Report Signatures Block */}
            <div className="mt-8 pt-8 border-t border-slate-300 grid grid-cols-2 sm:grid-cols-4 print:grid-cols-4 gap-4 text-center text-xs">
              <div>
                <div className="border-t border-slate-800 w-36 max-w-full mx-auto mb-1"></div>
                <div className="font-bold text-slate-900">Prepared By</div>
                <div className="text-[10px] text-slate-500 font-medium">System Operator / Super Admin</div>
              </div>
              <div>
                <div className="border-t border-slate-800 w-36 max-w-full mx-auto mb-1"></div>
                <div className="font-bold text-slate-900">Verified By</div>
                <div className="text-[10px] text-slate-500 font-medium">Head of Internal Audit</div>
              </div>
              <div>
                <div className="border-t border-slate-800 w-36 max-w-full mx-auto mb-1"></div>
                <div className="font-bold text-slate-900">Showroom In-Charge</div>
                <div className="text-[10px] text-slate-500 font-medium">Assistant General Manager (AGM)</div>
              </div>
              <div>
                <div className="border-t border-slate-800 w-36 max-w-full mx-auto mb-1"></div>
                <div className="font-bold text-slate-900">Approved By</div>
                <div className="text-[10px] text-slate-500 font-medium">Managing Director / Board</div>
              </div>
            </div>

            {/* Report Disclaimer Footer */}
            <div className="mt-4 pt-2 border-t border-slate-100 flex flex-wrap justify-between gap-1 text-[10px] text-slate-400 font-mono">
              <div>Poly Cables ERP • Executive Financial System</div>
              <div>Generated: {new Date().toLocaleString()} • Confidential Company Record</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
