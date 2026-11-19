import React, { useState, useMemo, useEffect } from 'react';
import { Item, CompanyDetails, BranchLocation, FactoryImportChallan } from '../types';
import { defaultBranches } from '../data/defaultData';
import { X, Printer, Search, Building2, Filter, Eye, EyeOff } from 'lucide-react';
import { formatDateDDMMYY } from '../utils/dateUtils';
import { matchesFlexibleSearch, groupItemsByCategoryOrder, getCategorySerialRank } from '../utils/searchHelper';
import { getAllCategories } from '../utils/categoryHelper';
import { getActivePriceCircularInfo } from '../utils/priceCircularHelper';
import { getItemOpeningStock, getItemFactoryImportQty } from '../utils/stockHelper';

interface ItemPricePrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: Item[];
  effectiveDate?: string;
  company?: CompanyDetails;
  title?: string;
  initialCategory?: string;
  initialSearch?: string;
  initialOnlyActive?: boolean;
  branches?: BranchLocation[];
  initialBranchId?: string;
  factoryImports?: FactoryImportChallan[];
  showOpeningStock?: boolean;
  onToggleOpeningStock?: (show: boolean) => void;
  isSpecialItemDirectory?: boolean;
}

export const ItemPricePrintPreviewModal: React.FC<ItemPricePrintPreviewModalProps> = ({
  isOpen,
  onClose,
  items,
  effectiveDate,
  company,
  title = 'Master Item Directory & Price Circular',
  initialCategory = 'ALL',
  initialSearch = '',
  initialOnlyActive = false,
  branches = defaultBranches,
  initialBranchId = 'ALL',
  factoryImports = [],
  showOpeningStock: propShowOpeningStock = false,
  onToggleOpeningStock,
  isSpecialItemDirectory = false
}) => {
  const activeCircular = useMemo(() => getActivePriceCircularInfo(), []);
  const normalizedInitialCategory = useMemo(() => {
    if (!initialCategory || initialCategory.toUpperCase() === 'ALL') return 'ALL';
    return initialCategory;
  }, [initialCategory]);

  const effectiveBranches = useMemo(() => {
    return branches && branches.length > 0 ? branches : defaultBranches;
  }, [branches]);

  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedCategory, setSelectedCategory] = useState<string>(normalizedInitialCategory);
  const [showOnlyActive, setShowOnlyActive] = useState(initialOnlyActive);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(initialBranchId || 'ALL');
  const [localShowOpeningStock, setLocalShowOpeningStock] = useState<boolean>(propShowOpeningStock);
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

  // Sync state whenever the modal is opened or initial filter props change
  useEffect(() => {
    if (isOpen) {
      setSearchQuery(initialSearch || '');
      setSelectedCategory(normalizedInitialCategory);
      setShowOnlyActive(Boolean(initialOnlyActive));
      if (initialBranchId) {
        setSelectedBranchId(initialBranchId);
      }
      setLocalShowOpeningStock(propShowOpeningStock);
    }
  }, [isOpen, initialSearch, normalizedInitialCategory, initialOnlyActive, initialBranchId, propShowOpeningStock]);

  const handleToggleOpening = (val: boolean) => {
    setLocalShowOpeningStock(val);
    if (onToggleOpeningStock) {
      onToggleOpeningStock(val);
    }
  };

  const isAllCategory = (cat?: string) => !cat || cat.toUpperCase() === 'ALL';

  const selectedBranchObj = useMemo(() => {
    if (selectedBranchId === 'ALL') return null;
    return effectiveBranches.find((b) => b.id === selectedBranchId) || null;
  }, [effectiveBranches, selectedBranchId]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set).sort((a, b) => {
      const ra = getCategorySerialRank(a, categoryOrder);
      const rb = getCategorySerialRank(b, categoryOrder);
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b);
    });
  }, [items, categoryOrder]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (showOnlyActive && item.isActive === false) return false;
      if (!isAllCategory(selectedCategory) && (item.category || '').trim().toLowerCase() !== selectedCategory.trim().toLowerCase()) {
        return false;
      }
      if (searchQuery.trim()) {
        const targetStr = `${item.name} ${item.code || ''} ${item.sizeSpec || ''} ${item.category || ''} ${item.unit || ''} ${item.remarks || ''}`;
        return matchesFlexibleSearch(targetStr, searchQuery);
      }
      return true;
    });
  }, [items, selectedCategory, searchQuery, showOnlyActive]);

  // Group by configured category list order
  const groupedItems = useMemo(() => {
    return groupItemsByCategoryOrder(filteredItems, categoryOrder).groups.map(
      (grp) => [grp.category, grp.items.map((entry) => entry.item)] as [string, Item[]]
    );
  }, [filteredItems, categoryOrder]);

  // Overall totals
  const overallTotals = useMemo(() => {
    let totalOpening = 0;
    let totalStock = 0;
    let totalAmount = 0;

    filteredItems.forEach((item) => {
      const op = getItemOpeningStock(item, selectedBranchId);
      const imp = getItemFactoryImportQty(item, factoryImports, selectedBranchId);
      const cur = op + imp + (item.returnParty || 0) - (item.totalSales || 0) - (item.returnFactory || 0);
      const rate = Number(item.rate) || 0;
      totalOpening += op;
      totalStock += cur;
      totalAmount += cur * rate;
    });

    return { totalOpening, totalStock, totalAmount, totalItems: filteredItems.length };
  }, [filteredItems, selectedBranchId, factoryImports]);

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  // Derive Effective Date based on Price Update History List ACTIVE
  const displayDate = effectiveDate || activeCircular.displayDate || activeCircular.effectiveDate || formatDateDDMMYY(new Date().toISOString().split('T')[0]);

  return (
    <div className="print-preview-modal-backdrop fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in print:p-0 print:bg-white">
      {/* Explicit Print White Background Styles */}
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
        {/* Modal Header */}
        <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 flex-none print:hidden">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900">{title}</h2>
              <p className="text-xs text-slate-600 font-medium">
                Print Preview • {filteredItems.length} items shown • Effective: <strong className="text-emerald-700">{displayDate}</strong> ({activeCircular.circularTitle})
                {selectedBranchObj ? ` • ${selectedBranchObj.name}` : ' • All Sales Centers'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Price Circular</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar & Filters (Light Background, Black Font) */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs flex-none print:hidden">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[200px]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search items by name, code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-xs font-medium shadow-2xs"
              />
            </div>

            {/* Category Filter */}
            <div className="flex items-center space-x-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-300 shadow-2xs">
              <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-transparent text-slate-900 font-bold focus:outline-none text-xs cursor-pointer"
              >
                <option value="ALL">All Categories ({categories.length})</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Sales Center Filter */}
            <div className="flex items-center space-x-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-300 shadow-2xs">
              <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="text-[11px] font-bold text-slate-700 whitespace-nowrap">Sales Center:</span>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="bg-transparent text-slate-900 font-bold focus:outline-none text-xs cursor-pointer"
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

          <div className="flex items-center space-x-3">
            {/* Opening Stock Toggle */}
            <button
              type="button"
              onClick={() => handleToggleOpening(!localShowOpeningStock)}
              className={`px-2.5 py-1.5 rounded-xl font-bold text-xs border transition-all flex items-center space-x-1.5 cursor-pointer shadow-2xs ${
                localShowOpeningStock
                  ? 'bg-blue-600 text-white border-blue-700'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
              title="Toggle Opening Stock column on print document"
            >
              {localShowOpeningStock ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{localShowOpeningStock ? 'Hide Opening Stock' : 'Show Opening Stock'}</span>
            </button>

            <label className="flex items-center space-x-1.5 cursor-pointer text-slate-800 font-bold text-xs select-none">
              <input
                type="checkbox"
                checked={showOnlyActive}
                onChange={(e) => setShowOnlyActive(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-0 cursor-pointer"
              />
              <span>Active Only</span>
            </label>
          </div>
        </div>

        {/* Printable Document Paper Area (White & Light Gray Background, Crisp Black Font) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 flex justify-center print:p-0 print:bg-white print:overflow-visible">
          <div className="print-clean-paper bg-white text-black w-full max-w-4xl p-6 sm:p-8 rounded-xl shadow-md border border-slate-200 space-y-6 print:border-none print:shadow-none print:max-w-none print:p-0">
            {/* Header */}
            <div className="text-center border-b-2 border-slate-900 pb-4 space-y-1.5">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-black uppercase">
                {company?.name || 'POLY CABLES INDUSTRIES LTD.'}
              </h1>
              <p className="text-xs text-black font-semibold">
                {company?.address || 'Madhupur, Tangail • Phone: 01711-000000'}
              </p>
              <div className="pt-2 flex flex-wrap items-center justify-between text-xs font-bold text-black border-t border-slate-300 mt-2 gap-2">
                <span className="bg-slate-100 px-2.5 py-1 rounded border border-slate-300 text-black font-black uppercase">
                  {title}
                </span>
                {selectedBranchObj && (
                  <span className="bg-blue-50 text-black px-2.5 py-1 rounded border border-blue-200 font-bold flex items-center space-x-1">
                    <Building2 className="w-3.5 h-3.5 text-blue-700 inline mr-1" />
                    <span>Sales Center: <strong>{selectedBranchObj.name}</strong></span>
                  </span>
                )}
                <span className="font-mono text-black font-bold">
                  Effective Date: <strong className="underline">{displayDate}</strong>
                  <span className="text-[10px] text-slate-600 block sm:inline sm:ml-1 font-sans">
                    ({activeCircular.circularTitle})
                  </span>
                </span>
              </div>
            </div>

            {/* Item Table Grouped by Category */}
            <div className="space-y-6">
              {groupedItems.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-black">
                  <p className="text-sm font-black text-black">No items found matching the selected filters</p>
                  <p className="text-xs text-slate-600 mt-1">Please adjust your search term, category, or sales center selection.</p>
                </div>
              ) : (
                groupedItems.map(([category, catItems]) => {
                  let catOpening = 0;
                  let catStock = 0;
                  let catAmount = 0;

                  return (
                    <div key={category} className="space-y-1">
                      {/* Category Header */}
                      <div className="bg-slate-100 text-black border border-slate-300 px-3 py-1.5 rounded-t-lg font-black text-xs uppercase tracking-wider flex items-center justify-between">
                        <span className="text-black font-black">Category: {category}</span>
                        <span className="text-[11px] font-bold text-slate-700 font-mono">
                          {catItems.length} items
                        </span>
                      </div>

                      <div className="border border-slate-300 rounded-b-lg overflow-hidden bg-white">
                        <table className="w-full text-left text-xs border-collapse text-black bg-white">
                          <thead>
                            <tr className="bg-slate-100 text-black text-[11px] font-black border-b border-slate-300">
                              <th className="p-2 text-center w-10 border-r border-slate-300 text-black font-black">#</th>
                              <th className="p-2 border-r border-slate-300 text-black font-black">Item Description</th>
                              <th className="p-2 w-16 text-center border-r border-slate-300 text-black font-black">Unit</th>
                              {localShowOpeningStock && (
                                <th className="p-2 w-24 text-center border-r border-slate-300 text-blue-900 bg-blue-50/50 font-black">
                                  Opening Stock
                                </th>
                              )}
                              <th className="p-2 w-24 text-center border-r border-slate-300 text-emerald-950 bg-emerald-50/50 font-black">
                                Current Stock
                              </th>
                              <th className="p-2 w-24 text-right border-r border-slate-300 text-black font-black">Rate (৳)</th>
                              <th className="p-2 w-28 text-right border-r border-slate-300 text-emerald-950 bg-emerald-50/40 font-black">Amount (৳)</th>
                              <th className="p-2 w-20 text-center text-black font-black">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 font-medium">
                            {catItems.map((item, idx) => {
                              const op = getItemOpeningStock(item, selectedBranchId);
                              const imp = getItemFactoryImportQty(item, factoryImports, selectedBranchId);
                              const cur = op + imp + (item.returnParty || 0) - (item.totalSales || 0) - (item.returnFactory || 0);
                              const rate = Number(item.rate) || 0;
                              const amt = cur * rate;

                              catOpening += op;
                              catStock += cur;
                              catAmount += amt;

                              return (
                                <tr key={item.id || idx} className="hover:bg-slate-50">
                                  <td className="p-2 text-center text-slate-700 font-mono font-bold border-r border-slate-200">
                                    {idx + 1}
                                  </td>
                                  <td className="p-2 font-bold text-black border-r border-slate-200">
                                    {item.name}
                                    {isSpecialItemDirectory && item.unit && (
                                      <span className="ml-1.5 text-[10px] text-amber-800 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                        Special Item
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-2 text-center text-black font-semibold border-r border-slate-200">
                                    {item.unit || 'Coil'}
                                  </td>
                                  {localShowOpeningStock && (
                                    <td className="p-2 text-center font-mono font-bold text-blue-900 border-r border-slate-200 bg-blue-50/20">
                                      {op.toLocaleString('en-IN')}
                                    </td>
                                  )}
                                  <td className="p-2 text-center font-mono font-black text-emerald-900 border-r border-slate-200 bg-emerald-50/20">
                                    {cur.toLocaleString('en-IN')}
                                  </td>
                                  <td className="p-2 text-right font-mono font-bold text-black border-r border-slate-200">
                                    ৳{rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="p-2 text-right font-mono font-black text-emerald-900 border-r border-slate-200 bg-emerald-50/10">
                                    ৳{amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="p-2 text-center">
                                    <span
                                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        item.isActive !== false
                                          ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                                          : 'bg-slate-100 text-slate-700 border border-slate-300'
                                      }`}
                                    >
                                      {item.isActive !== false ? 'Active' : 'Inactive'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="bg-slate-100 text-black font-bold text-[11px] border-t-2 border-slate-300">
                              <td colSpan={3} className="p-2 text-right uppercase tracking-wider text-slate-800 border-r border-slate-300">
                                Subtotal ({category}):
                              </td>
                              {localShowOpeningStock && (
                                <td className="p-2 text-center font-mono font-black text-blue-900 border-r border-slate-300">
                                  {catOpening.toLocaleString('en-IN')}
                                </td>
                              )}
                              <td className="p-2 text-center font-mono font-black text-emerald-900 border-r border-slate-300">
                                {catStock.toLocaleString('en-IN')}
                              </td>
                              <td className="p-2 text-right text-slate-600 border-r border-slate-300">-</td>
                              <td className="p-2 text-right font-mono font-black text-emerald-950 border-r border-slate-300">
                                ৳{catAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-2 text-center text-slate-500 font-normal text-[10px]">
                                {catItems.length} items
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Grand Total Summary Card */}
            {groupedItems.length > 0 && (
              <div className="p-3 bg-slate-100 border-2 border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs text-black font-bold">
                <div>
                  <span className="uppercase text-[11px] font-black tracking-wider text-slate-700">Total Products Listed:</span>{' '}
                  <span className="font-mono font-black text-base">{overallTotals.totalItems} Items</span>
                </div>
                {localShowOpeningStock && (
                  <div>
                    <span className="uppercase text-[11px] font-black tracking-wider text-blue-900">Total Opening Stock:</span>{' '}
                    <span className="font-mono font-black text-base text-blue-900">{overallTotals.totalOpening.toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div>
                  <span className="uppercase text-[11px] font-black tracking-wider text-emerald-900">Total Current Stock:</span>{' '}
                  <span className="font-mono font-black text-base text-emerald-900">{overallTotals.totalStock.toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <span className="uppercase text-[11px] font-black tracking-wider text-slate-900">Total Valuation Amount:</span>{' '}
                  <span className="font-mono font-black text-base text-emerald-950">৳{overallTotals.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            )}

            {/* Footer / Signatures */}
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

export default ItemPricePrintPreviewModal;
