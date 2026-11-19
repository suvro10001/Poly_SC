import React, { useState, useMemo, useEffect } from 'react';
import { Item, PriceHistoryEntry, PriceListSnapshot, BranchLocation, CompanyDetails } from '../types';
import { Save, X, Search, Filter, ArrowLeft, Upload, CheckCircle2, AlertCircle, RefreshCw, DollarSign, Printer, Calendar, Eye, Layers } from 'lucide-react';
import { formatDateDDMMYY } from '../utils/dateUtils';
import { DateInputWithPicker } from './DateInputWithPicker';
import { ItemPricePrintPreviewModal } from './ItemPricePrintPreviewModal';
import { syncSpecialItemRatesWithBaseItems } from '../utils/stockHelper';
import { getNextMonotonicSnapshotIso, getPriceListSnapshots, savePriceListSnapshots, toCompactSnapshotItems } from '../utils/priceCircularHelper';
import { safeSetStorageItem } from '../utils/indexedDbStorage';
import { matchesFlexibleSearch, groupItemsByCategoryOrder, getCategorySerialRank } from '../utils/searchHelper';
import { getAllCategories } from '../utils/categoryHelper';

interface ManualPriceUpdateViewProps {
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  snapshots?: PriceListSnapshot[];
  setSnapshots?: (updater: any) => void;
  activeEffectiveDate: string;
  onOpenExcelImport?: () => void;
  onSuccessNotification?: (msg: string) => void;
  onCancel?: () => void;
  branches?: BranchLocation[];
  company?: CompanyDetails;
  onSyncCloud?: (slice: any, immediate?: boolean) => void;
}

export const ManualPriceUpdateView: React.FC<ManualPriceUpdateViewProps> = ({
  items,
  setItems,
  snapshots,
  setSnapshots,
  activeEffectiveDate,
  onOpenExcelImport,
  onSuccessNotification,
  onCancel,
  branches,
  company,
  onSyncCloud
}) => {
  // Read all snapshots from props or localStorage
  const effectiveSnapshots: PriceListSnapshot[] = useMemo(() => {
    if (snapshots && snapshots.length > 0) return snapshots;
    try {
      const raw = localStorage.getItem('polycables_price_snapshots');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  }, [snapshots]);

  // Collect all unique available effective dates across snapshots and items
  const availableEffectiveDates = useMemo(() => {
    const datesSet = new Set<string>();
    if (activeEffectiveDate) datesSet.add(activeEffectiveDate.trim());

    effectiveSnapshots.forEach((snap) => {
      if (snap.effectiveDate) datesSet.add(snap.effectiveDate.trim());
    });

    items.forEach((item) => {
      if (item.effectiveDate) datesSet.add(item.effectiveDate.trim());
      if (Array.isArray(item.priceHistory)) {
        item.priceHistory.forEach((h) => {
          if (h.effectiveDate) datesSet.add(h.effectiveDate.trim());
        });
      }
    });

    return Array.from(datesSet).filter(Boolean);
  }, [effectiveSnapshots, items, activeEffectiveDate]);

  // Selected date to VIEW
  const initialViewDate = activeEffectiveDate || (availableEffectiveDates[0] || formatDateDDMMYY(new Date()));
  const [selectedViewDate, setSelectedViewDate] = useState<string>(initialViewDate);

  // The effective date under which changes will be saved
  const [effectiveDate, setEffectiveDate] = useState<string>(initialViewDate);

  // When selectedViewDate changes, update effectiveDate to match unless user manually changed it
  const handleSelectViewDate = (dateVal: string) => {
    setSelectedViewDate(dateVal);
    setEffectiveDate(dateVal);
    // Clear in-progress edits when switching to a different effective date view
    setUpdatedRates({});
    setUpdatedNames({});
    setUpdatedUnits({});
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [updatedRates, setUpdatedRates] = useState<Record<string, number>>({});
  const [updatedNames, setUpdatedNames] = useState<Record<string, string>>({});
  const [updatedUnits, setUpdatedUnits] = useState<Record<string, string>>({});
  const [changeNotes, setChangeNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
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

  // Find snapshot for the currently selected view date
  const matchedSnapshot = useMemo(() => {
    if (!selectedViewDate) return null;
    return effectiveSnapshots.find((s) => s.effectiveDate === selectedViewDate) || null;
  }, [effectiveSnapshots, selectedViewDate]);

  // Build baseline name, unit, and rate maps for the selected effective date
  const { baselineNamesMap, baselineUnitsMap, baselineRatesMap } = useMemo(() => {
    const namesMap: Record<string, string> = {};
    const unitsMap: Record<string, string> = {};
    const ratesMap: Record<string, number> = {};

    // 1. If we have a snapshot for this date, use its items
    if (matchedSnapshot && Array.isArray(matchedSnapshot.items)) {
      matchedSnapshot.items.forEach((si) => {
        if (si.id) {
          if (si.name) namesMap[si.id] = si.name;
          if (si.unit) unitsMap[si.id] = si.unit;
          if (si.rate !== undefined) ratesMap[si.id] = Number(si.rate) || 0;
        }
        if (si.code) {
          const matchedMaster = items.find((m) => m.code === si.code);
          if (matchedMaster) {
            if (si.name) namesMap[matchedMaster.id] = si.name;
            if (si.unit) unitsMap[matchedMaster.id] = si.unit;
            if (si.rate !== undefined) ratesMap[matchedMaster.id] = Number(si.rate) || 0;
          }
        }
      });
    }

    // 2. Fill in from item.priceHistory or current item properties
    items.forEach((item) => {
      if (namesMap[item.id] === undefined) {
        namesMap[item.id] = item.name || '';
      }
      if (unitsMap[item.id] === undefined) {
        unitsMap[item.id] = item.unit || 'Coils';
      }
      if (ratesMap[item.id] === undefined) {
        if (Array.isArray(item.priceHistory) && item.priceHistory.length > 0) {
          const directMatch = item.priceHistory.find((h) => h.effectiveDate === selectedViewDate);
          if (directMatch) {
            ratesMap[item.id] = Number(directMatch.rate) || 0;
          } else {
            ratesMap[item.id] = Number(item.rate) || 0;
          }
        } else {
          ratesMap[item.id] = Number(item.rate) || 0;
        }
      }
    });

    return { baselineNamesMap: namesMap, baselineUnitsMap: unitsMap, baselineRatesMap: ratesMap };
  }, [matchedSnapshot, items, selectedViewDate]);

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

  const groupedFilteredItems = useMemo(() => {
    const matched = items.filter((item) => {
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const curName = updatedNames[item.id] ?? baselineNamesMap[item.id] ?? item.name ?? '';
        const target = `${curName} ${item.sizeSpec || ''} ${item.category || ''}`;
        return matchesFlexibleSearch(target, searchQuery.trim(), item.code || '');
      }
      return true;
    });
    return groupItemsByCategoryOrder(matched, categoryOrder);
  }, [items, selectedCategory, searchQuery, updatedNames, baselineNamesMap, categoryOrder]);

  const filteredItems = groupedFilteredItems.orderedItems;

  const handleRateChange = (itemId: string, val: string) => {
    const num = parseFloat(val);
    const baseline = baselineRatesMap[itemId] ?? items.find((i) => i.id === itemId)?.rate ?? 0;
    if (isNaN(num) || num === baseline) {
      const next = { ...updatedRates };
      delete next[itemId];
      setUpdatedRates(next);
    } else {
      setUpdatedRates((prev) => ({ ...prev, [itemId]: num }));
    }
  };

  const handleNameChange = (itemId: string, val: string) => {
    const baseline = baselineNamesMap[itemId] ?? items.find((i) => i.id === itemId)?.name ?? '';
    if (val === baseline) {
      const next = { ...updatedNames };
      delete next[itemId];
      setUpdatedNames(next);
    } else {
      setUpdatedNames((prev) => ({ ...prev, [itemId]: val }));
    }
  };

  const handleUnitChange = (itemId: string, val: string) => {
    const baseline = baselineUnitsMap[itemId] ?? items.find((i) => i.id === itemId)?.unit ?? 'Coils';
    if (val === baseline) {
      const next = { ...updatedUnits };
      delete next[itemId];
      setUpdatedUnits(next);
    } else {
      setUpdatedUnits((prev) => ({ ...prev, [itemId]: val }));
    }
  };

  const changedItemIds = useMemo(() => {
    const ids = new Set<string>();
    Object.keys(updatedRates).forEach((id) => ids.add(id));
    Object.keys(updatedNames).forEach((id) => ids.add(id));
    Object.keys(updatedUnits).forEach((id) => ids.add(id));
    return ids;
  }, [updatedRates, updatedNames, updatedUnits]);

  const changedCount = changedItemIds.size;

  const handleSaveAll = () => {
    if (changedCount === 0) {
      onSuccessNotification?.('No item changes entered. Modify rate, unit, or item name before saving.');
      return;
    }

    setIsSaving(true);
    const finalEffectiveDate = effectiveDate.trim() || formatDateDDMMYY(new Date());

    const updatedItems = items.map((item) => {
      const isRateChanged = updatedRates[item.id] !== undefined;
      const isNameChanged = updatedNames[item.id] !== undefined;
      const isUnitChanged = updatedUnits[item.id] !== undefined;

      if (isRateChanged || isNameChanged || isUnitChanged) {
        const newRate = isRateChanged ? updatedRates[item.id] : (baselineRatesMap[item.id] ?? item.rate);
        const newName = isNameChanged ? (updatedNames[item.id].trim() || item.name) : (baselineNamesMap[item.id] ?? item.name);
        const newUnit = isUnitChanged ? updatedUnits[item.id] : (baselineUnitsMap[item.id] ?? item.unit);

        const currentHistory = Array.isArray(item.priceHistory) ? item.priceHistory : [];
        const newHistory: PriceHistoryEntry[] = [
          ...currentHistory.filter((h) => h.effectiveDate !== finalEffectiveDate),
          {
            effectiveDate: finalEffectiveDate,
            rate: newRate,
            updatedAt: new Date().toISOString(),
            notes: changeNotes || `Price & circular update effective ${finalEffectiveDate}`
          }
        ];

        return {
          ...item,
          name: newName,
          unit: newUnit,
          rate: newRate,
          isActive: true,
          effectiveDate: finalEffectiveDate,
          priceHistory: newHistory
        };
      }
      return item;
    });

    const finalUpdatedItems = syncSpecialItemRatesWithBaseItems(updatedItems);

    setItems(finalUpdatedItems);

    const specialList = finalUpdatedItems.filter((i) => i.isSpecialItem);

    try {
      localStorage.removeItem('polycables_items_cleared');
      safeSetStorageItem('polycables_items', JSON.stringify(finalUpdatedItems), finalUpdatedItems);
      safeSetStorageItem('polycables_special_items', JSON.stringify(specialList), specialList);
    } catch {}

    // Save/update snapshot safely so active effective date items sync cleanly while preserving all previous lists
    try {
      const prevSnapshots: PriceListSnapshot[] = effectiveSnapshots.length > 0 ? effectiveSnapshots : getPriceListSnapshots();
      const nowIso = getNextMonotonicSnapshotIso(prevSnapshots);
      const compactSnapItems = toCompactSnapshotItems(finalUpdatedItems.filter((i) => !i.isSpecialItem));
      const existingSameDate = prevSnapshots.find((s) => s.effectiveDate === finalEffectiveDate);

      let nextSnapshotList: PriceListSnapshot[];
      let activeTitle: string;
      if (existingSameDate) {
        activeTitle = changeNotes || existingSameDate.title || `Price Circular Revision (${finalEffectiveDate})`;
        nextSnapshotList = prevSnapshots.map((s) =>
          s.id === existingSameDate.id
            ? {
                ...s,
                title: activeTitle,
                updatedAt: nowIso,
                activatedAt: nowIso,
                itemCount: compactSnapItems.length,
                items: compactSnapItems,
                isActive: true,
                notes: changeNotes || `Updated ${changedCount} items (rates/names/units) for effective date ${finalEffectiveDate}`
              }
            : { ...s, isActive: false }
        );
      } else {
        activeTitle = changeNotes || `Price Circular Revision (${finalEffectiveDate})`;
        const newSnapshot: PriceListSnapshot = {
          id: `snap_${Date.now()}`,
          title: activeTitle,
          effectiveDate: finalEffectiveDate,
          createdAt: nowIso,
          updatedAt: nowIso,
          activatedAt: nowIso,
          itemCount: compactSnapItems.length,
          items: compactSnapItems,
          isActive: true,
          notes: changeNotes || `Updated ${changedCount} items (rates/names/units) for effective date ${finalEffectiveDate}`
        };
        nextSnapshotList = [newSnapshot, ...prevSnapshots.map((s) => ({ ...s, isActive: false }))];
      }

      const finalSnapshots = savePriceListSnapshots(nextSnapshotList, {
        effectiveDate: finalEffectiveDate,
        circularTitle: activeTitle
      });
      setSnapshots?.(finalSnapshots);

      const syncPatch = {
        items: finalUpdatedItems,
        specialItems: specialList,
        itemsVersion: Date.now(),
        _itemsCleared: false,
        _replaceItems: true,
        priceSnapshots: finalSnapshots,
        price_snapshots: finalSnapshots,
        _replacePriceSnapshots: true,
        activeEffectiveDate: finalEffectiveDate
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
    } catch (e) {
      const syncPatch = { items: finalUpdatedItems, specialItems: specialList, itemsVersion: Date.now(), _itemsCleared: false, _replaceItems: true };
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
    }

    try {
      window.dispatchEvent(new CustomEvent('polycables_items_updated', {
        detail: { items: finalUpdatedItems }
      }));
    } catch {}

    setIsSaving(false);
    setUpdatedRates({});
    setUpdatedNames({});
    setUpdatedUnits({});
    setSelectedViewDate(finalEffectiveDate);

    if (onSuccessNotification) {
      onSuccessNotification(
        `✓ Successfully saved prices, units & item names for ${changedCount} item(s) effective ${finalEffectiveDate}.`
      );
    }
  };

  return (
    <div className="cyber-glass-card rounded-2xl p-5 sm:p-6 space-y-6 text-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-cyan-500/25 pb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-white flex items-center space-x-2">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            <span>Price Update & Circular Editor</span>
          </h2>
          <p className="text-xs text-slate-300">
            View any historical price circular, edit item names, units, and rates, and apply new effective dates.
          </p>
        </div>

        <div className="flex items-center space-x-2 flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setIsPrintPreviewOpen(true)}
            className="px-3.5 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-amber-200 border border-amber-500/35 font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer"
            title="Print Preview this Price Circular"
          >
            <Printer className="w-4 h-4" />
            <span>Print Preview</span>
          </button>
          {onOpenExcelImport && (
            <button
              type="button"
              onClick={onOpenExcelImport}
              className="px-3.5 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 font-bold text-xs rounded-xl border border-cyan-500/35 transition-colors flex items-center space-x-1.5 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Import Excel Rates</span>
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-3.5 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Back
            </button>
          )}
        </div>
      </div>

      {/* EFFECTIVE DATE SELECTOR BAR: VIEW ANY CIRCULAR */}
      <div className="cyber-glass-subcard p-4 rounded-xl border border-cyan-500/30 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2 text-cyan-200">
            <Eye className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="font-extrabold text-xs">View Circular by Effective Date:</span>
          </div>

          <div className="flex items-center space-x-2 flex-1 sm:max-w-md">
            <select
              value={selectedViewDate}
              onChange={(e) => handleSelectViewDate(e.target.value)}
              className="flex-1 p-2 bg-[#061520] border border-cyan-500/35 rounded-lg font-bold text-white text-xs focus:ring-2 focus:ring-cyan-400 cursor-pointer"
            >
              {availableEffectiveDates.map((dt) => {
                const isAct = dt === activeEffectiveDate;
                const isSnap = effectiveSnapshots.some((s) => s.effectiveDate === dt);
                return (
                  <option key={dt} value={dt}>
                    {dt} {isAct ? '★ (Active Catalog Circular)' : isSnap ? '(Saved Circular)' : ''}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Info Strip */}
        <div className="text-[11px] text-cyan-200/80 flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-cyan-500/20">
          <span>
            Viewing prices & details effective: <strong className="font-mono text-amber-300 font-bold">{selectedViewDate}</strong>
            {matchedSnapshot && <span className="ml-1 text-cyan-300 italic">({matchedSnapshot.title || 'Saved Circular'})</span>}
          </span>
          <span className="text-slate-400 text-[11px]">
            To save changes under this date or a new date, review effective date below.
          </span>
        </div>
      </div>

      {/* Date and Global Note Settings for Saving */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-[#0b2334]/80 p-4 rounded-xl border border-cyan-500/25 text-xs">
        <div>
          <label className="block font-bold text-cyan-200 mb-1">
            Apply Under Effective Date (DD.MM.YY):
          </label>
          <DateInputWithPicker
            value={effectiveDate}
            onChange={setEffectiveDate}
            valueFormat="ddmmyy"
            theme="dark"
            inputClassName="p-2 text-white"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block font-bold text-cyan-200 mb-1">Circular / Price Update Note:</label>
          <input
            type="text"
            placeholder="e.g. Master Circular Price & Item Adjustment"
            value={changeNotes}
            onChange={(e) => setChangeNotes(e.target.value)}
            className="w-full p-2 bg-[#061520] border border-cyan-500/30 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400"
          />
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0 w-full sm:w-auto">
          <div className="relative flex-1 min-w-0 w-full sm:w-auto sm:max-w-sm">
            <Search className="w-3.5 h-3.5 text-cyan-400/70 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by item code or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-[#061520] border border-cyan-500/30 rounded-xl text-white placeholder-slate-400 text-xs focus:ring-2 focus:ring-cyan-400"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full sm:w-auto p-1.5 bg-[#061520] border border-cyan-500/30 rounded-xl text-white text-xs cursor-pointer"
          >
            <option value="ALL">All Categories ({categories.length})</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs font-bold text-slate-300">
          <span>
            {changedCount > 0 ? (
              <span className="text-emerald-300 font-extrabold bg-emerald-500/20 px-2.5 py-1 rounded-lg border border-emerald-500/35">
                {changedCount} items modified
              </span>
            ) : (
              'Edit Name, Unit or Rate below'
            )}
          </span>
        </div>
      </div>

      {/* Item Table with Editable Name, Unit, and Rate */}
      <div className="border border-cyan-500/25 bg-[#071824]/70 rounded-xl overflow-hidden shadow-2xs">
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 sticky top-0 z-10 text-[11px] font-bold">
              <tr>
                <th className="p-2.5 text-center w-10">#</th>
                <th className="p-2.5 w-24">Item Code</th>
                <th className="p-2.5 min-w-[220px]">Item Name / Description (Editable)</th>
                <th className="p-2.5 w-28">Category</th>
                <th className="p-2.5 w-24 text-center">Unit</th>
                <th className="p-2.5 w-28 text-right">View Rate (৳)</th>
                <th className="p-2.5 w-32 text-right">New Rate (৳)</th>
                <th className="p-2.5 w-24 text-right">Difference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200 font-medium">
              {groupedFilteredItems.groups.map((grp) => (
                <React.Fragment key={grp.category}>
                  <tr className="bg-[#0c2638]/90 border-y border-cyan-500/25">
                    <td colSpan={8} className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-cyan-300">
                      {grp.category} ({grp.items.length})
                    </td>
                  </tr>
                  {grp.items.map(({ item, flatIndex: idx }) => {
                    const isRateModified = updatedRates[item.id] !== undefined;
                    const isNameModified = updatedNames[item.id] !== undefined;
                    const isUnitModified = updatedUnits[item.id] !== undefined;
                    const isRowModified = isRateModified || isNameModified || isUnitModified;

                    const baselineName = baselineNamesMap[item.id] ?? item.name ?? '';
                    const baselineUnit = baselineUnitsMap[item.id] ?? item.unit ?? 'Coils';
                    const baselineRate = baselineRatesMap[item.id] ?? item.rate ?? 0;

                    const currentName = updatedNames[item.id] ?? baselineName;
                    const currentUnit = updatedUnits[item.id] ?? baselineUnit;
                    const newRate = updatedRates[item.id] ?? baselineRate;
                    const diff = newRate - baselineRate;

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-cyan-500/[0.06] transition-colors ${
                          isRowModified ? 'bg-amber-500/15' : ''
                        }`}
                      >
                        <td className="p-2.5 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="p-2.5 font-mono font-bold text-cyan-300 whitespace-nowrap">{item.code}</td>
                        <td className="p-2 min-w-[220px]">
                          <input
                            type="text"
                            value={currentName}
                            onChange={(e) => handleNameChange(item.id, e.target.value)}
                            className={`w-full p-1.5 border rounded-lg text-xs font-semibold focus:ring-2 focus:ring-cyan-400 ${
                              isNameModified
                                ? 'border-amber-400/60 bg-amber-500/15 text-amber-100'
                                : 'border-cyan-500/30 bg-[#061520] text-white'
                            }`}
                            title="Edit Item Description"
                          />
                        </td>
                        <td className="p-2.5 text-slate-300 whitespace-nowrap">
                          <span className="bg-[#0e2a3d] text-cyan-200 px-2 py-0.5 rounded text-[11px] font-bold border border-cyan-500/25">
                            {item.category || '-'}
                          </span>
                        </td>
                        <td className="p-2 text-center">
                          <select
                            value={currentUnit}
                            onChange={(e) => handleUnitChange(item.id, e.target.value)}
                            className={`p-1.5 border rounded-lg text-xs font-semibold focus:ring-2 focus:ring-cyan-400 cursor-pointer ${
                              isUnitModified
                                ? 'border-amber-400/60 bg-amber-500/15 text-amber-100'
                                : 'border-cyan-500/30 bg-[#061520] text-white'
                            }`}
                          >
                            <option value="Coils">Coils</option>
                            <option value="Meters">Meters</option>
                            <option value="Bobin">Bobin</option>
                            <option value="Pcs">Pcs</option>
                            <option value="Packet">Packet</option>
                            <option value="Drum">Drum</option>
                          </select>
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-300 whitespace-nowrap">
                          ৳{Number(baselineRate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            placeholder={String(baselineRate)}
                            value={updatedRates[item.id] !== undefined ? updatedRates[item.id] : ''}
                            onChange={(e) => handleRateChange(item.id, e.target.value)}
                            className={`w-28 text-right p-1.5 rounded-lg border font-mono font-bold text-xs focus:ring-2 focus:ring-cyan-400 ${
                              isRateModified
                                ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200'
                                : 'border-cyan-500/30 bg-[#061520] text-white'
                            }`}
                          />
                        </td>
                        <td className="p-2.5 text-right font-mono text-xs whitespace-nowrap">
                          {isRateModified && diff !== 0 ? (
                            <span
                              className={`font-bold ${
                                diff > 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {diff > 0 ? `+৳${diff.toFixed(2)}` : `-৳${Math.abs(diff).toFixed(2)}`}
                            </span>
                          ) : isRowModified ? (
                            <span className="text-amber-300 text-[10px] font-bold">Edited</span>
                          ) : (
                            <span className="text-slate-500">-</span>
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
      </div>

      {/* Footer Action Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-cyan-500/20">
        <div className="text-xs text-slate-300">
          Showing {filteredItems.length} of {items.length} items for circular <strong className="font-mono text-cyan-200">{selectedViewDate}</strong>.
        </div>

        <div className="flex items-center space-x-2">
          {changedCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setUpdatedRates({});
                setUpdatedNames({});
                setUpdatedUnits({});
              }}
              className="px-3 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Reset Changes
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={changedCount === 0 || isSaving}
            className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-black text-xs rounded-xl shadow-lg transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Save & Apply Price Circular ({changedCount})</span>
          </button>
        </div>
      </div>

      {/* Print Preview Modal for Manual Price Update & Circular Editor */}
      {isPrintPreviewOpen && (
        <ItemPricePrintPreviewModal
          isOpen={isPrintPreviewOpen}
          onClose={() => setIsPrintPreviewOpen(false)}
          items={items.map((i) => ({
            ...i,
            name: updatedNames[i.id] ?? baselineNamesMap[i.id] ?? i.name,
            unit: updatedUnits[i.id] ?? baselineUnitsMap[i.id] ?? i.unit,
            rate: updatedRates[i.id] !== undefined ? updatedRates[i.id] : (baselineRatesMap[i.id] ?? i.rate)
          }))}
          effectiveDate={effectiveDate}
          company={company}
          branches={branches}
          title={changeNotes ? `Price Circular: ${changeNotes}` : `Price Circular Preview (${effectiveDate})`}
          initialCategory={selectedCategory}
        />
      )}
    </div>
  );
};

export default ManualPriceUpdateView;
