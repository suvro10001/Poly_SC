import React, { useState, useMemo, useEffect } from 'react';
import { StoredBill, Item } from '../types';
import { X, Printer, Download, Search, Layers, Calendar, Boxes } from 'lucide-react';
import { formatDateDDMMYY, parseDateToISO } from '../utils/dateUtils';
import { DateInputWithPicker } from './DateInputWithPicker';
import * as XLSX from 'xlsx';
import { triggerAutoConfiguredPrint } from '../utils/printerAutoConfig';
import { matchesFlexibleSearch, getCategorySerialRank } from '../utils/searchHelper';
import { getAllCategories, categorizeCableItem } from '../utils/categoryHelper';

interface ItemWiseQuantityReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  allStoredBills: StoredBill[];
  currentFilteredBills: StoredBill[];
  items?: Item[];
  initialScope?: 'draft' | 'regular' | 'office' | 'current_filter' | 'all';
}

export const ItemWiseQuantityReportModal: React.FC<ItemWiseQuantityReportModalProps> = ({
  isOpen,
  onClose,
  allStoredBills,
  currentFilteredBills,
  items = [],
  initialScope = 'all'
}) => {
  const [scope, setScope] = useState<'all' | 'current_filter' | 'regular' | 'office' | 'draft'>(
    initialScope || 'current_filter'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState<'qty_desc' | 'amount_desc' | 'name_asc'>('qty_desc');
  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => getAllCategories());
  useEffect(() => {
    const refresh = () => setCategoryOrder(getAllCategories());
    window.addEventListener('categories-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('categories-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  // Sync scope whenever the modal opens or initialScope changes
  useEffect(() => {
    if (isOpen) {
      setScope(initialScope || 'current_filter');
    }
  }, [isOpen, initialScope]);

  // Filter bills according to selected scope and date range
  const scopedBills = useMemo(() => {
    let list: StoredBill[] = [];
    if (scope === 'all') {
      list = allStoredBills;
    } else if (scope === 'current_filter') {
      list = currentFilteredBills;
    } else if (scope === 'regular') {
      list = allStoredBills.filter((b) => {
        const isDraft = Boolean(b.isDraft || b.status === 'draft' || b.copyStatus === 'draft');
        const isOffice = Boolean(b.isOfficeBill || b.header?.isOfficeBill || b.copyStatus === 'office');
        return !isDraft && !isOffice;
      });
    } else if (scope === 'office') {
      list = allStoredBills.filter((b) =>
        Boolean(b.isOfficeBill || b.header?.isOfficeBill || b.copyStatus === 'office')
      );
    } else if (scope === 'draft') {
      list = allStoredBills.filter((b) =>
        Boolean(b.isDraft || b.status === 'draft' || b.copyStatus === 'draft')
      );
    }

    const startIso = startDate ? parseDateToISO(startDate) : '';
    const endIso = endDate ? parseDateToISO(endDate) : '';

    if (startIso) {
      list = list.filter((b) => {
        const iso = parseDateToISO(b.header?.date || b.savedAt);
        return !iso || iso >= startIso;
      });
    }
    if (endIso) {
      list = list.filter((b) => {
        const iso = parseDateToISO(b.header?.date || b.savedAt);
        return !iso || iso <= endIso;
      });
    }

    return list;
  }, [allStoredBills, currentFilteredBills, scope, startDate, endDate]);

  // Aggregate item-wise quantities and amounts (StoredBill stores rows in `bill.lines`)
  const aggregatedItems = useMemo(() => {
    const map = new Map<
      string,
      {
        itemCode: string;
        itemName: string;
        category: string;
        sizeSpec: string;
        unit: string;
        totalQty: number;
        totalAmount: number;
        invoiceCount: number;
      }
    >();

    scopedBills.forEach((bill) => {
      const billLines: any[] = Array.isArray(bill.lines)
        ? bill.lines
        : Array.isArray((bill as any).items)
        ? (bill as any).items
        : [];

      const billSeenKeys = new Set<string>();

      billLines.forEach((line: any) => {
        const desc = String(line.itemDescription || line.itemName || '').trim();
        const code = String(line.itemCode || '').trim();
        if (!desc && !code) return;

        const key = (code || desc).toLowerCase();
        const rawQty = Number(line.coilQty ?? line.totalCoil ?? line.quantity ?? 0) || 0;
        const rawUnit = String(line.unit || '').trim();
        const rawUnitLow = rawUnit.toLowerCase();
        const isMeterUnit =
          rawUnitLow === 'm' ||
          rawUnitLow === 'mtr' ||
          rawUnitLow === 'mtrs' ||
          rawUnitLow.includes('meter') ||
          rawUnitLow.includes('metre');

        // Convert Meter sales to Coils (1 Coil = 100 Meters)
        const qtyInCoils = isMeterUnit ? rawQty / 100 : rawQty;
        const displayUnit = isMeterUnit || !rawUnit || rawUnitLow.includes('coil') ? 'Coils' : rawUnit;
        const amount = Number(line.amount ?? line.totalAmount ?? 0) || 0;

        if (!map.has(key)) {
          const masterMatch = items.find(
            (m) =>
              (code && m.code && m.code.trim().toLowerCase() === code.toLowerCase()) ||
              (desc && m.name && m.name.trim().toLowerCase() === desc.toLowerCase())
          );
          const rawCat = String(line.category || masterMatch?.category || '').trim();
          const resolvedCategory = rawCat || categorizeCableItem(desc || 'Unknown Item', line.sizeSpec || line.spec || masterMatch?.sizeSpec);
          map.set(key, {
            itemCode: code || '-',
            itemName: desc || 'Unknown Item',
            category: resolvedCategory,
            sizeSpec: line.sizeSpec || line.spec || '-',
            unit: displayUnit,
            totalQty: 0,
            totalAmount: 0,
            invoiceCount: 0
          });
        }

        const entry = map.get(key)!;
        if (isMeterUnit) {
          entry.unit = 'Coils';
        }
        entry.totalQty += qtyInCoils;
        entry.totalAmount += amount;
        if (!billSeenKeys.has(key)) {
          entry.invoiceCount += 1;
          billSeenKeys.add(key);
        }
      });
    });

    let result = Array.from(map.values());

    if (searchQuery.trim()) {
      result = result.filter((r) =>
        matchesFlexibleSearch(`${r.itemName} ${r.sizeSpec || ''} ${r.category || ''}`, searchQuery, `${r.itemCode || ''}`)
      );
    }

    const isSearching = Boolean(searchQuery.trim());
    result.sort((a, b) => {
      if (isSearching) {
        const rankA = getCategorySerialRank(a.category, categoryOrder);
        const rankB = getCategorySerialRank(b.category, categoryOrder);
        if (rankA !== rankB) return rankA - rankB;
        const catCmp = (a.category || '').localeCompare(b.category || '', undefined, { numeric: true, sensitivity: 'base' });
        if (rankA >= 9000 && catCmp !== 0) return catCmp;
      }
      if (sortBy === 'qty_desc') return b.totalQty - a.totalQty;
      if (sortBy === 'amount_desc') return b.totalAmount - a.totalAmount;
      return a.itemName.localeCompare(b.itemName);
    });

    return result;
  }, [scopedBills, items, searchQuery, sortBy, categoryOrder]);

  const totalQuantitySum = useMemo(
    () => aggregatedItems.reduce((sum, item) => sum + item.totalQty, 0),
    [aggregatedItems]
  );
  const totalAmountSum = useMemo(
    () => aggregatedItems.reduce((sum, item) => sum + item.totalAmount, 0),
    [aggregatedItems]
  );

  const handleExportExcel = async () => {
    const periodLabel =
      startDate || endDate
        ? `${formatDateDDMMYY(startDate) || 'Start'} to ${formatDateDDMMYY(endDate) || 'End'}`
        : `Scope: ${scope.replace('_', ' ').toUpperCase()} (${scopedBills.length} Bills)`;

    const headers = ['SL #', 'Item Code', 'Item Description', 'Unit', 'Total Qty Sold', 'Total Sales (৳)', 'Bills Count'];
    const dataRows = aggregatedItems.map((item, idx) => [
      idx + 1,
      item.itemCode,
      item.itemName,
      item.unit,
      Number(item.totalQty.toFixed(2)),
      Math.round(item.totalAmount),
      item.invoiceCount
    ]);
    const totalsRow = ['', '', 'GRAND TOTAL', 'Coils', Number(totalQuantitySum.toFixed(2)), Math.round(totalAmountSum), scopedBills.length];
    const ws = XLSX.utils.aoa_to_sheet([
      ['ITEM-WISE TOTAL QUANTITY & SALES ANALYSIS'],
      [`Period: ${periodLabel} | Scope: ${scope.toUpperCase()}`],
      [],
      headers,
      ...dataRows,
      totalsRow
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Item_Wise_Quantity');
    XLSX.writeFile(wb, `Item_Wise_Quantity_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handlePrint = () => {
    triggerAutoConfiguredPrint('report');
  };

  if (!isOpen) return null;

  return (
    <div
      id="item-wise-qty-report-modal"
      className="fixed inset-0 z-[95] bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in"
    >
      <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[95vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden print-paper-sheet">
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 flex-none no-print">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight">
                Item-Wise Total Quantity &amp; Sales Analysis
              </h2>
              <p className="text-xs text-slate-400">
                Summary of all products sold across {scopedBills.length} invoices
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center space-x-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export Excel</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center space-x-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Report</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Print Header (Visible when printing) */}
        <div className="hidden print:block p-3 border-b-2 border-black text-center text-black">
          <h1 className="text-lg font-black uppercase">POLY CABLES IND. LTD.</h1>
          <h2 className="text-xs font-bold underline mt-0.5">ITEM-WISE TOTAL QUANTITY &amp; SALES ANALYSIS</h2>
          <p className="text-[11px] mt-1">
            Bills Analyzed: {scopedBills.length} | Total Qty: {Number(totalQuantitySum.toFixed(2)).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Coils | Total Value: ৳{Math.round(totalAmountSum).toLocaleString('en-IN')}
          </p>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs flex-none no-print">
          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            {/* Scope select */}
            <div className="flex items-center space-x-1 bg-white px-2.5 py-1.5 rounded-xl border border-slate-300">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span className="font-bold text-slate-600">Scope:</span>
              <select
                value={scope}
                onChange={(e: any) => setScope(e.target.value)}
                className="font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer text-xs"
              >
                <option value="current_filter">Current Filter View ({currentFilteredBills.length})</option>
                <option value="all">All Stored Bills ({allStoredBills.length})</option>
                <option value="regular">Showroom Bills Only</option>
                <option value="office">Office Bills Only</option>
                <option value="draft">Drafts Only</option>
              </select>
            </div>

            {/* Date Range */}
            <div className="flex items-center space-x-1.5 bg-white px-2 py-1 rounded-xl border border-slate-300">
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <div className="w-28">
                <DateInputWithPicker
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="dd.mm.yy"
                  inputClassName="!py-0.5 !border-0 !text-xs"
                  title="From Date (dd.mm.yy)"
                />
              </div>
              <span className="text-slate-400 font-bold">to</span>
              <div className="w-28">
                <DateInputWithPicker
                  value={endDate}
                  onChange={setEndDate}
                  placeholder="dd.mm.yy"
                  inputClassName="!py-0.5 !border-0 !text-xs"
                  title="To Date (dd.mm.yy)"
                />
              </div>
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="text-rose-500 hover:text-rose-700 font-bold px-1 cursor-pointer"
                  title="Clear Dates"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500 w-44"
              />
            </div>
          </div>

          {/* Sort By */}
          <div className="flex items-center space-x-1 bg-white px-2.5 py-1.5 rounded-xl border border-slate-300">
            <span className="text-slate-500 font-bold">Sort:</span>
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer text-xs"
            >
              <option value="qty_desc">Highest Qty First</option>
              <option value="amount_desc">Highest Sales Amount</option>
              <option value="name_asc">Item Name (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Aggregate KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-100/70 border-b border-slate-200 text-xs flex-none no-print">
          <div className="bg-white p-3 rounded-xl border border-slate-200">
            <div className="text-[11px] font-bold text-slate-500 uppercase">Total Items Types</div>
            <div className="text-lg font-black text-slate-900 font-mono mt-0.5">
              {aggregatedItems.length} Products
            </div>
          </div>
          <div className="bg-white p-3 rounded-xl border border-slate-200">
            <div className="text-[11px] font-bold text-slate-500 uppercase">Total Sold Quantity</div>
            <div className="text-lg font-black text-emerald-700 font-mono mt-0.5">
              {Number(totalQuantitySum.toFixed(2)).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Coils
            </div>
          </div>
          <div className="bg-white p-3 rounded-xl border border-slate-200">
            <div className="text-[11px] font-bold text-slate-500 uppercase">Total Sales Value</div>
            <div className="text-lg font-black text-indigo-700 font-mono mt-0.5">
              ৳{Math.round(totalAmountSum).toLocaleString('en-IN')}
            </div>
          </div>
          <div className="bg-white p-3 rounded-xl border border-slate-200">
            <div className="text-[11px] font-bold text-slate-500 uppercase">Invoices Analyzed</div>
            <div className="text-lg font-black text-purple-700 font-mono mt-0.5">
              {scopedBills.length} Bills
            </div>
          </div>
        </div>

        {/* Scrollable Item-wise Table */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-white sticky top-0 text-[11px] font-bold">
                <tr>
                  <th className="p-2.5 text-center w-12">#</th>
                  <th className="p-2.5 w-28">Item Code</th>
                  <th className="p-2.5">Item Description</th>
                  <th className="p-2.5 w-20 text-center">Unit</th>
                  <th className="p-2.5 w-28 text-right bg-emerald-950/80 text-emerald-300">
                    Total Qty Sold
                  </th>
                  <th className="p-2.5 w-32 text-right bg-indigo-950/80 text-indigo-300">
                    Total Sales (৳)
                  </th>
                  <th className="p-2.5 w-24 text-center">Bills Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium">
                {aggregatedItems.map((item, idx) => {
                  const isSearching = Boolean(searchQuery.trim());
                  const prevCat = idx > 0 ? (aggregatedItems[idx - 1].category || 'Uncategorized') : '';
                  const curCat = item.category || 'Uncategorized';
                  const showCatHeader = isSearching && (idx === 0 || curCat.toLowerCase() !== prevCat.toLowerCase());
                  const catCount = showCatHeader
                    ? aggregatedItems.filter((x) => (x.category || 'Uncategorized').toLowerCase() === curCat.toLowerCase()).length
                    : 0;
                  return (
                    <React.Fragment key={`${item.itemCode}-${idx}`}>
                      {showCatHeader && (
                        <tr className="bg-slate-100 border-y border-slate-300">
                          <td colSpan={7} className="px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-700">
                            {curCat} ({catCount})
                          </td>
                        </tr>
                      )}
                      <tr className="hover:bg-slate-50">
                        <td className="p-2.5 text-center text-slate-500 font-mono">{idx + 1}</td>
                        <td className="p-2.5 font-mono font-bold text-slate-900">{item.itemCode}</td>
                        <td className="p-2.5 font-bold text-slate-800">{item.itemName}</td>
                        <td className="p-2.5 text-center text-slate-600">{item.unit}</td>
                        <td className="p-2.5 text-right font-mono font-extrabold text-emerald-800 text-sm">
                          {Number(item.totalQty.toFixed(2)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                          ৳{Number(item.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2.5 text-center font-mono text-slate-600">
                          {item.invoiceCount}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
                {aggregatedItems.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 font-medium">
                      No item sales found for the selected scope and criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 flex-none no-print">
          <span>
            Showing {aggregatedItems.length} items from {scopedBills.length} invoices.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ItemWiseQuantityReportModal;
