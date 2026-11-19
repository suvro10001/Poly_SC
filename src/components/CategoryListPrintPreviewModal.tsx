import React, { useState, useMemo } from 'react';
import { Item, CompanyDetails, BranchLocation, FactoryImportChallan } from '../types';
import { defaultBranches } from '../data/defaultData';
import { X, Printer, Search, Building2, Tag } from 'lucide-react';
import { formatDateDDMMYY } from '../utils/dateUtils';
import { getItemOpeningStock, getItemFactoryImportQty } from '../utils/stockHelper';

interface CategoryListPrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  items: Item[];
  branches?: BranchLocation[];
  company?: CompanyDetails;
  factoryImports?: FactoryImportChallan[];
}

export const CategoryListPrintPreviewModal: React.FC<CategoryListPrintPreviewModalProps> = ({
  isOpen,
  onClose,
  categories,
  items,
  branches,
  company,
  factoryImports = []
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('ALL');

  const effectiveBranches = useMemo(() => {
    return branches && branches.length > 0 ? branches : defaultBranches;
  }, [branches]);

  const selectedBranchObj = useMemo(() => {
    if (selectedBranchId === 'ALL') return null;
    return effectiveBranches.find((b) => b.id === selectedBranchId) || null;
  }, [selectedBranchId, effectiveBranches]);

  const currentDateStr = useMemo(() => {
    return formatDateDDMMYY(new Date().toISOString().split('T')[0]);
  }, []);

  const branchAddressString = useMemo(() => {
    if (selectedBranchId === 'ALL') {
      return effectiveBranches.map((b) => b.name).join(', ');
    }
    const b = selectedBranchObj;
    if (!b) return '';
    return `${b.name}, ${b.address}${b.phone ? ` • Mob: ${b.phone}` : ''}`;
  }, [selectedBranchId, selectedBranchObj, effectiveBranches]);

  // Compute category statistics
  const categoryStats = useMemo(() => {
    return categories
      .filter((cat) => {
        if (!searchQuery.trim()) return true;
        return cat.toLowerCase().includes(searchQuery.toLowerCase().trim());
      })
      .map((cat, idx) => {
        const catItems = items.filter(
          (i) => (i.category || '').trim().toLowerCase() === cat.trim().toLowerCase()
        );
        const activeCount = catItems.filter((i) => i.isActive !== false).length;
        const inactiveCount = catItems.filter((i) => i.isActive === false).length;

        let totalStock = 0;
        let totalValuation = 0;

        catItems.forEach((item) => {
          const q =
            getItemOpeningStock(item, selectedBranchId) +
            getItemFactoryImportQty(item, factoryImports, selectedBranchId) +
            (item.returnParty || 0) -
            (item.totalSales || 0) -
            (item.returnFactory || 0);
          const r = Number(item.rate || 0);
          totalStock += q;
          totalValuation += Math.round(q * r);
        });

        return {
          sl: idx + 1,
          name: cat,
          totalProducts: catItems.length,
          activeCount,
          inactiveCount,
          totalStock,
          totalValuation
        };
      });
  }, [categories, items, searchQuery, selectedBranchId, factoryImports]);

  const summary = useMemo(() => {
    let products = 0;
    let stock = 0;
    let valuation = 0;
    categoryStats.forEach((c) => {
      products += c.totalProducts;
      stock += c.totalStock;
      valuation += c.totalValuation;
    });
    return {
      totalCategories: categoryStats.length,
      totalProducts: products,
      totalStock: stock,
      totalValuation: valuation
    };
  }, [categoryStats]);

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="print-preview-modal-backdrop fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in print:p-0 print:bg-white">
      {/* Print Styles */}
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
        {/* Controls Header */}
        <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 flex-none print:hidden">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-50 text-purple-700 rounded-xl border border-purple-200">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900">Category List • Print Preview</h2>
              <p className="text-xs text-slate-600 font-medium">
                {categoryStats.length} categories • {summary.totalProducts} total products listed
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handlePrint}
              className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-4 py-2 rounded-xl text-xs flex items-center space-x-1.5 shadow-md border border-amber-300 transition-all cursor-pointer active:scale-95"
            >
              <Printer className="w-4 h-4 text-slate-950" />
              <span>Print Category Report</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-slate-100 text-slate-600 rounded-xl transition-colors cursor-pointer"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs flex-none print:hidden">
          <div className="flex items-center space-x-2 flex-1 max-w-xs">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search category name..."
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-700">Filter Stock by Branch:</span>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Sales Centers ({effectiveBranches.length})</option>
              {effectiveBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Paper Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 flex justify-center print:p-0 print:bg-white print:overflow-visible">
          <div className="print-clean-paper bg-white text-black w-full max-w-4xl p-6 sm:p-8 rounded-xl shadow-md border border-slate-200 space-y-6 print:border-none print:shadow-none print:max-w-none print:p-0">
            {/* Header */}
            <div className="text-center border-b-2 border-slate-900 pb-4 space-y-1">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-black uppercase">
                {company?.name || 'POLY CABLES'}
              </h1>
              <p className="text-xs font-bold text-slate-800 mt-1 max-w-2xl mx-auto leading-relaxed">
                {branchAddressString}
              </p>
              <div className="pt-2 flex flex-wrap items-center justify-between text-xs font-bold text-black border-t border-slate-300 mt-2 gap-2">
                <span className="bg-slate-100 px-2.5 py-1 rounded border border-slate-300 text-black font-black uppercase">
                  Category Directory & Item Classification
                </span>
                <span className="bg-purple-50 text-black px-2.5 py-1 rounded border border-purple-200 font-bold flex items-center space-x-1">
                  <Building2 className="w-3.5 h-3.5 text-purple-700 inline mr-1" />
                  <span>Sales Center: <strong>{selectedBranchObj ? selectedBranchObj.name : `All Sales Centers (${effectiveBranches.length})`}</strong></span>
                </span>
                <span className="font-mono text-black font-bold">
                  Date: <strong>{currentDateStr}</strong>
                </span>
              </div>
            </div>

            {/* Table */}
            <div className="border border-slate-300 rounded-lg overflow-hidden bg-white">
              <table className="w-full text-left text-xs border-collapse text-black bg-white">
                <thead>
                  <tr className="bg-slate-100 text-black text-[11px] font-black border-b border-slate-300">
                    <th className="p-2.5 text-center w-12 border-r border-slate-300 text-black font-black">#</th>
                    <th className="p-2.5 border-r border-slate-300 text-black font-black">Category Name</th>
                    <th className="p-2.5 w-28 text-center border-r border-slate-300 text-black font-black">Products Count</th>
                    <th className="p-2.5 w-24 text-center border-r border-slate-300 text-black font-black">Active</th>
                    <th className="p-2.5 w-32 text-center border-r border-slate-300 text-black font-black">Total Stock (Coils)</th>
                    <th className="p-2.5 w-36 text-right text-black font-black">Stock Valuation (৳)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-medium">
                  {categoryStats.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500 font-bold">
                        No categories found.
                      </td>
                    </tr>
                  ) : (
                    categoryStats.map((c, idx) => (
                      <tr key={c.name} className="hover:bg-slate-50">
                        <td className="p-2.5 text-center text-slate-700 font-mono font-bold border-r border-slate-200">
                          {idx + 1}
                        </td>
                        <td className="p-2.5 font-bold text-black border-r border-slate-200 flex items-center space-x-1.5">
                          <Tag className="w-3.5 h-3.5 text-purple-600 print:hidden" />
                          <span>{c.name}</span>
                        </td>
                        <td className="p-2.5 text-center font-mono font-bold text-black border-r border-slate-200">
                          {c.totalProducts} Items
                        </td>
                        <td className="p-2.5 text-center font-mono font-bold text-emerald-700 border-r border-slate-200">
                          {c.activeCount}
                        </td>
                        <td className="p-2.5 text-center font-mono font-bold text-black border-r border-slate-200">
                          {c.totalStock.toLocaleString('en-IN')}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-black bg-slate-50/50">
                          ৳{c.totalValuation.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100/90 font-black border-t-2 border-slate-300 text-black text-xs">
                    <td colSpan={2} className="p-2.5 text-right font-black border-r border-slate-300 uppercase">
                      Total ({summary.totalCategories} Categories):
                    </td>
                    <td className="p-2.5 text-center font-mono font-black border-r border-slate-300 bg-slate-200/50">
                      {summary.totalProducts} Items
                    </td>
                    <td className="p-2.5 text-center font-mono font-black border-r border-slate-300 text-emerald-800">
                      -
                    </td>
                    <td className="p-2.5 text-center font-mono font-black border-r border-slate-300 bg-slate-200/50">
                      {summary.totalStock.toLocaleString('en-IN')}
                    </td>
                    <td className="p-2.5 text-right font-mono font-black border-slate-300 bg-slate-200/50">
                      ৳{summary.totalValuation.toLocaleString('en-IN')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Grand Total Summary Box */}
            <div className="bg-slate-50 border-2 border-slate-900 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs font-black text-black">
              <div className="flex items-center space-x-2">
                <span className="uppercase tracking-wider">Classification Summary:</span>
                <span className="bg-white px-2.5 py-0.5 rounded border border-slate-300 font-mono font-bold">
                  {summary.totalCategories} Categories
                </span>
                <span className="bg-white px-2.5 py-0.5 rounded border border-slate-300 font-mono font-bold">
                  {summary.totalProducts} Total Products
                </span>
              </div>
              <div className="flex items-center space-x-6 font-mono">
                <div>
                  Total Live Stock: <strong className="text-black font-black text-sm">{summary.totalStock.toLocaleString('en-IN')} Coils</strong>
                </div>
                <div>
                  Total Valuation: <strong className="text-black font-black text-sm">৳{summary.totalValuation.toLocaleString('en-IN')}</strong>
                </div>
              </div>
            </div>

            {/* Signatures */}
            <div className="pt-8 border-t border-slate-300 grid grid-cols-3 gap-4 text-center text-xs font-bold text-black">
              <div>
                <div className="border-t border-slate-400 pt-1 mt-6 text-black font-bold">Prepared By</div>
              </div>
              <div>
                <div className="border-t border-slate-400 pt-1 mt-6 text-black font-bold">Verified By / In-Charge</div>
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
