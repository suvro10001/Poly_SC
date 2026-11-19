import React, { useState, useMemo, useEffect } from 'react';
import { Item, PriceListSnapshot } from '../types';
import {
  X,
  TrendingUp,
  Percent,
  DollarSign,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Search,
  Filter,
  Save,
  Check
} from 'lucide-react';
import { getAllCategories } from '../utils/categoryHelper';
import { getTodayDDMMYY } from '../utils/dateUtils';
import { matchesFlexibleSearch, groupItemsByCategoryOrder } from '../utils/searchHelper';
import { syncSpecialItemRatesWithBaseItems } from '../utils/stockHelper';
import { getNextMonotonicSnapshotIso, getPriceListSnapshots, savePriceListSnapshots, toCompactSnapshotItems } from '../utils/priceCircularHelper';
import { safeSetStorageItem } from '../utils/indexedDbStorage';
import { DateInputWithPicker } from './DateInputWithPicker';

interface BulkPriceUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  onSuccess?: (count: number, effectiveDate: string) => void;
  onSyncCloud?: (slice: any, immediate?: boolean) => void;
}

export const BulkPriceUpdateModal: React.FC<BulkPriceUpdateModalProps> = ({
  isOpen,
  onClose,
  items,
  setItems,
  onSuccess,
  onSyncCloud
}) => {
  const [effectiveDate, setEffectiveDate] = useState<string>(() => getTodayDDMMYY());
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [updateMode, setUpdateMode] = useState<'percent' | 'fixed' | 'manual'>('percent');
  const [adjustmentType, setAdjustmentType] = useState<'increase' | 'decrease'>('increase');
  const [adjustmentValue, setAdjustmentValue] = useState<number | ''>('');
  const [roundToNearest, setRoundToNearest] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [manualRates, setManualRates] = useState<{ [itemId: string]: number }>({});
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() => new Set(items.map((i) => i.id)));
  const [notes, setNotes] = useState<string>('');

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

  const categories = useMemo(() => {
    return ['All', ...categoryOrder];
  }, [categoryOrder]);

  // Filtered items based on category and search, grouped by configured category list order
  const groupedFilteredItems = useMemo(() => {
    const matched = items.filter((item) => {
      if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const matches = matchesFlexibleSearch(
          `${item.name} ${item.sizeSpec || ''} ${item.category || ''}`,
          searchQuery.trim(),
          `${item.category || ''} ${item.code || ''}`
        );
        if (!matches) return false;
      }
      return true;
    });
    return groupItemsByCategoryOrder(matched, categoryOrder);
  }, [items, selectedCategory, searchQuery, categoryOrder]);

  const filteredItems = groupedFilteredItems.orderedItems;

  // Calculate new rate for an item
  const calculateNewRate = (item: Item): number => {
    if (updateMode === 'manual') {
      return manualRates[item.id] !== undefined ? manualRates[item.id] : item.rate;
    }
    const val = typeof adjustmentValue === 'number' ? adjustmentValue : 0;
    if (val === 0) return item.rate;

    let newRate = item.rate;
    if (updateMode === 'percent') {
      const delta = (item.rate * val) / 100;
      newRate = adjustmentType === 'increase' ? item.rate + delta : item.rate - delta;
    } else if (updateMode === 'fixed') {
      newRate = adjustmentType === 'increase' ? item.rate + val : item.rate - val;
    }

    if (roundToNearest > 1) {
      newRate = Math.round(newRate / roundToNearest) * roundToNearest;
    } else {
      newRate = Math.round(newRate);
    }
    return Math.max(0, newRate);
  };

  const toggleSelectAll = () => {
    if (selectedItemIds.size === filteredItems.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const toggleSelectItem = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleApplyUpdate = () => {
    const targetItems = items.filter((item) => selectedItemIds.has(item.id));
    if (targetItems.length === 0) {
      return;
    }

    const updatedMapped = items.map((item) => {
      if (!selectedItemIds.has(item.id)) return item;
      const updatedRate = calculateNewRate(item);
      const historyEntry = {
        effectiveDate: effectiveDate,
        rate: updatedRate,
        updatedAt: new Date().toISOString(),
        notes: `Bulk revision: ৳${item.rate} -> ৳${updatedRate} (${effectiveDate})`
      };
      const currentHistory = Array.isArray(item.priceHistory) ? item.priceHistory : [];
      return {
        ...item,
        rate: updatedRate,
        isActive: true,
        effectiveDate: effectiveDate,
        priceHistory: [historyEntry, ...currentHistory.filter((h) => h.effectiveDate !== effectiveDate)]
      };
    });

    const updatedAllItems = syncSpecialItemRatesWithBaseItems(updatedMapped);

    setItems(updatedAllItems);
    try {
      localStorage.removeItem('polycables_items_cleared');
      safeSetStorageItem('polycables_items', JSON.stringify(updatedAllItems), updatedAllItems);
      const specialList = updatedAllItems.filter((i) => i.isSpecialItem);
      safeSetStorageItem('polycables_special_items', JSON.stringify(specialList), specialList);
    } catch {}

    let finalSnapshots: PriceListSnapshot[] = [];
    // Save as active snapshot safely
    try {
      const prevSnapshots: PriceListSnapshot[] = getPriceListSnapshots();
      const nowIso = getNextMonotonicSnapshotIso(prevSnapshots);
      const updatedPrev = prevSnapshots.map((s) => ({ ...s, isActive: false }));
      const compactSnapItems = toCompactSnapshotItems(updatedAllItems.filter((i) => !i.isSpecialItem));
      const newSnapshot: PriceListSnapshot = {
        id: `snap_${Date.now()}`,
        title: `Price Circular Revision (${effectiveDate})`,
        effectiveDate: effectiveDate,
        createdAt: nowIso,
        updatedAt: nowIso,
        activatedAt: nowIso,
        itemCount: compactSnapItems.length,
        items: compactSnapItems,
        isActive: true,
        notes: `Bulk update applied on ${targetItems.length} products with effective date ${effectiveDate}`
      };
      finalSnapshots = savePriceListSnapshots([newSnapshot, ...updatedPrev], { effectiveDate });
    } catch {}

    const specialList = updatedAllItems.filter((i) => i.isSpecialItem);

    const syncPatch = {
      items: updatedAllItems,
      specialItems: specialList,
      itemsVersion: Date.now(),
      _itemsCleared: false,
      _replaceItems: true,
      priceSnapshots: finalSnapshots,
      price_snapshots: finalSnapshots,
      _replacePriceSnapshots: true,
      activeEffectiveDate: effectiveDate
    };
    if (onSyncCloud) {
      onSyncCloud(syncPatch, true);
    } else {
      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: (typeof window !== 'undefined' ? (window as any).__polycablesClientSyncId : undefined),
          patch: syncPatch
        })
      }).catch(() => {});
    }

    try {
      window.dispatchEvent(new CustomEvent('polycables_items_updated', {
        detail: { items: updatedAllItems }
      }));
    } catch {}

    if (onSuccess) {
      onSuccess(targetItems.length, effectiveDate);
    }
    onClose();
  };

  if (!isOpen) return null;

  const targetItemsCount = items.filter((i) => selectedItemIds.has(i.id)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030d14]/80 backdrop-blur-sm p-4 overflow-y-auto font-sans">
      <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh] text-white">
        {/* Header */}
        <div className="bg-[#0c2638]/90 text-white p-5 flex items-center justify-between border-b border-cyan-500/25">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-cyan-500/15 border border-cyan-400/30 rounded-xl">
              <TrendingUp className="w-6 h-6 text-cyan-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>Bulk Price Revision Manager</span>
                <span className="bg-cyan-500/20 text-cyan-200 border border-cyan-400/35 text-xs px-2.5 py-0.5 rounded-full font-mono">
                  Safe Historical Pricing
                </span>
              </h2>
              <p className="text-xs text-slate-300">
                Update master rate list effective from a specified date. Past stored bills remain completely untouched.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-cyan-500/15 rounded-xl transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls Section */}
        <div className="p-5 bg-[#0b2334]/80 border-b border-cyan-500/25 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          {/* Effective Date */}
          <div className="space-y-1.5">
            <label className="font-bold text-cyan-200 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
              <span>Effective Date (dd.mm.yy)</span>
            </label>
            <DateInputWithPicker
              value={effectiveDate}
              onChange={setEffectiveDate}
              valueFormat="ddmmyy"
              theme="dark"
              inputClassName="p-2 text-white"
            />
          </div>

          {/* Category Filter */}
          <div className="space-y-1.5">
            <label className="font-bold text-cyan-200 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-cyan-400" />
              <span>Target Category</span>
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full p-2 bg-[#061520] border border-cyan-500/30 rounded-lg font-bold text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Adjustment Mode */}
          <div className="space-y-1.5">
            <label className="font-bold text-cyan-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Adjustment Mode</span>
            </label>
            <div className="flex gap-1 bg-[#061520] border border-cyan-500/25 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => setUpdateMode('percent')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                  updateMode === 'percent' ? 'bg-cyan-500 text-slate-950 font-black shadow-xs' : 'text-slate-300 hover:text-white'
                }`}
              >
                % Percent
              </button>
              <button
                type="button"
                onClick={() => setUpdateMode('fixed')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                  updateMode === 'fixed' ? 'bg-cyan-500 text-slate-950 font-black shadow-xs' : 'text-slate-300 hover:text-white'
                }`}
              >
                ৳ Fixed Tk
              </button>
              <button
                type="button"
                onClick={() => setUpdateMode('manual')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                  updateMode === 'manual' ? 'bg-cyan-500 text-slate-950 font-black shadow-xs' : 'text-slate-300 hover:text-white'
                }`}
              >
                Manual
              </button>
            </div>
          </div>

          {/* Value and Increase/Decrease */}
          {updateMode !== 'manual' ? (
            <div className="space-y-1.5">
              <label className="font-bold text-cyan-200 flex items-center gap-1.5">
                {adjustmentType === 'increase' ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <TrendingUp className="w-3.5 h-3.5 text-rose-400 rotate-180" />
                )}
                <span>{adjustmentType === 'increase' ? 'Increase Value' : 'Decrease Value'}</span>
              </label>
              <div className="flex gap-1.5">
                <select
                  value={adjustmentType}
                  onChange={(e) => setAdjustmentType(e.target.value as 'increase' | 'decrease')}
                  className="p-2 bg-[#061520] border border-cyan-500/30 rounded-lg font-bold text-white text-xs focus:outline-none"
                >
                  <option value="increase">+ Incr</option>
                  <option value="decrease">- Decr</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={adjustmentValue}
                  onChange={(e) => setAdjustmentValue(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder={updateMode === 'percent' ? 'e.g. 5%' : 'e.g. 150 Tk'}
                  className="flex-1 p-2 bg-[#061520] border border-cyan-500/30 rounded-lg font-mono font-bold text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="font-bold text-cyan-200">Price Update Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Price revision effective today"
                className="w-full p-2 bg-[#061520] border border-cyan-500/30 rounded-lg text-white placeholder-slate-400 text-xs focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Search and Selection Summary */}
        <div className="p-3 bg-[#091f2e] border-b border-cyan-500/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-72">
              <Search className="w-3.5 h-3.5 text-cyan-400/70 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search items by name or size..."
                className="w-full pl-8 pr-3 py-1.5 bg-[#061520] border border-cyan-500/30 rounded-lg text-xs font-semibold text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={toggleSelectAll}
              className="text-xs font-bold text-cyan-200 hover:text-white px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 transition-colors whitespace-nowrap cursor-pointer"
            >
              {selectedItemIds.size === filteredItems.length ? 'Deselect All' : 'Select All Shown'}
            </button>
          </div>

          <div className="text-slate-300 font-medium text-xs">
            Selected: <span className="font-bold text-cyan-300">{targetItemsCount}</span> of {items.length} items
          </div>
        </div>

        {/* Table Preview */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#071824]/60">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#0c2638] text-cyan-200 font-bold border-b border-cyan-500/30 uppercase text-[10px] sticky top-0 z-10">
                <th className="p-2.5 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedItemIds.size === filteredItems.length && filteredItems.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-cyan-500/40 text-cyan-500 focus:ring-cyan-400 cursor-pointer"
                  />
                </th>
                <th className="p-2.5 w-12 text-center">SL</th>
                <th className="p-2.5 min-w-[200px]">Item Description</th>
                <th className="p-2.5 w-24">Category</th>
                <th className="p-2.5 w-24 text-right">Current Rate</th>
                <th className="p-2.5 w-32 text-right">New Rate (৳)</th>
                <th className="p-2.5 w-24 text-right">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/15 text-slate-200">
              {groupedFilteredItems.groups.map((grp) => (
                <React.Fragment key={grp.category}>
                  <tr className="bg-[#0c2638]/90 border-y border-cyan-500/25">
                    <td colSpan={7} className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-cyan-300">
                      {grp.category} ({grp.items.length})
                    </td>
                  </tr>
                  {grp.items.map(({ item, flatIndex: idx }) => {
                    const isSelected = selectedItemIds.has(item.id);
                    const newRate = calculateNewRate(item);
                    const diff = newRate - item.rate;
                    const diffPct = item.rate > 0 ? (diff / item.rate) * 100 : 0;

                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors ${isSelected ? 'bg-cyan-500/10 hover:bg-cyan-500/15' : 'hover:bg-cyan-500/[0.06]'}`}
                      >
                        <td className="p-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectItem(item.id)}
                            className="rounded border-cyan-500/40 text-cyan-500 focus:ring-cyan-400 cursor-pointer"
                          />
                        </td>
                        <td className="p-2.5 text-center font-mono text-slate-400">{idx + 1}</td>
                        <td className="p-2.5">
                          <div className="font-bold text-white">{item.name}</div>
                          {item.sizeSpec && <div className="text-[11px] text-slate-400">{item.sizeSpec}</div>}
                        </td>
                        <td className="p-2.5">
                          <span className="bg-[#0e2a3d] text-cyan-200 px-2 py-0.5 rounded text-[10px] font-semibold border border-cyan-500/25">
                            {item.category}
                          </span>
                        </td>
                        <td className="p-2.5 text-right font-mono font-semibold text-slate-300">
                          ৳{(item.rate ?? 0).toLocaleString('en-IN')}
                        </td>
                        <td className="p-2.5 text-right">
                          {updateMode === 'manual' ? (
                            <input
                              type="number"
                              value={manualRates[item.id] !== undefined ? manualRates[item.id] : item.rate}
                              onChange={(e) =>
                                setManualRates({
                                  ...manualRates,
                                  [item.id]: Number(e.target.value)
                                })
                              }
                              className="w-24 p-1 text-right font-mono font-bold bg-[#061520] text-white border border-cyan-500/35 rounded focus:ring-1 focus:ring-cyan-400"
                            />
                          ) : (
                            <span
                              className={`font-mono font-extrabold ${
                                diff > 0 ? 'text-emerald-300' : diff < 0 ? 'text-rose-300' : 'text-white'
                              }`}
                            >
                              ৳{newRate.toLocaleString('en-IN')}
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-right font-mono text-[11px] font-bold">
                          {diff > 0 ? (
                            <span className="text-emerald-400">+{diffPct.toFixed(1)}%</span>
                          ) : diff < 0 ? (
                            <span className="text-rose-400">{diffPct.toFixed(1)}%</span>
                          ) : (
                            <span className="text-slate-400">0%</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#071824]/90 border-t border-cyan-500/20 flex items-center justify-between">
          <div className="text-xs text-slate-300">
            <span className="font-semibold text-cyan-200">Note:</span> Applying this update will adjust current master rates for new bills.
          </div>
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyUpdate}
              className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-black shadow-md flex items-center space-x-2 transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Apply Price Update ({targetItemsCount})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
