import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ItemMatchResult } from '../utils/itemMatcher';
import { Item, BillLineItem } from '../types';
import { QuickAddItemModal } from './QuickAddItemModal';
import { matchesFlexibleSearch, sortItemsCategorySerialWise, groupItemsByCategoryOrder } from '../utils/searchHelper';
import { getAllCategories } from '../utils/categoryHelper';
import {
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Sparkles,
  X,
  Check,
  RotateCcw,
  Plus,
  Trash2,
  Search,
  Zap,
  ArrowRight,
  DollarSign,
  Tag,
  Boxes,
  Layers,
  ChevronDown
} from 'lucide-react';

interface ImportConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  matchResults: ItemMatchResult[];
  onApplyDecisions: (updatedLines: BillLineItem[]) => void;
  availableItems: Item[];
  onAddItemToMaster?: (item: Item) => void;
  initialPartyName?: string;
  initialChallanNo?: string;
}

interface ResolutionLine {
  id: string;
  originalIdx: number;
  itemDescription: string;
  itemId?: string;
  sizeSpec: string;
  coilQty: number;
  unit: string;
  rate: number;
  amount: number;
  status: 'auto_matched' | 'missing_price' | 'rate_mismatch' | 'unmatched';
  suggestedRate: number;
  suggestedItem: Item | null;
  similarityScore: number;
  candidates: { item: Item; similarity: number; rateMatches: boolean }[];
}

export const ImportConflictModal: React.FC<ImportConflictModalProps> = ({
  isOpen,
  onClose,
  matchResults,
  onApplyDecisions,
  availableItems,
  onAddItemToMaster,
  initialPartyName,
  initialChallanNo
}) => {
  // Quick Add Item Modal state
  const [quickAddLineId, setQuickAddLineId] = useState<string | null>(null);
  const [quickAddInitialData, setQuickAddInitialData] = useState<{
    name?: string;
    rate?: number;
    unit?: string;
    sizeSpec?: string;
    category?: string;
    isSpecialItem?: boolean;
  } | null>(null);

  // Active Catalog Search Dropdown per row
  const [activeSearchLineId, setActiveSearchLineId] = useState<string | null>(null);
  const [activeInlineSuggestLineId, setActiveInlineSuggestLineId] = useState<string | null>(null);
  const [catalogSearchText, setCatalogSearchText] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'missing_price' | 'conflicts'>('all');
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

  // Editable rows state in the resolution window
  const [lines, setLines] = useState<ResolutionLine[]>([]);
  const prevIsOpenRef = useRef(false);

  // Initialize lines ONLY when modal opens or when matchResults are first loaded
  useEffect(() => {
    if (!isOpen) {
      prevIsOpenRef.current = false;
      return;
    }

    // Only re-initialize if the modal just opened or lines are currently empty
    if (!prevIsOpenRef.current || lines.length === 0) {
      prevIsOpenRef.current = true;
      if (matchResults.length === 0) return;

      const initialized: ResolutionLine[] = matchResults.map((res, idx) => {
        const isMissingPrice = res.isChallanWithoutPrice || (res.importedRate <= 0 && (!res.importedAmount || res.importedAmount <= 0));
        const storedItem = res.matchedStoredItem || res.suggestedStoredItem;
        const suggestedRate = res.suggestedStoredRate || storedItem?.rate || 0;

        // Status determination
        let status: 'auto_matched' | 'missing_price' | 'rate_mismatch' | 'unmatched' = 'unmatched';
        if (isMissingPrice) {
          status = 'missing_price';
        } else if (res.shouldUseStoredName) {
          status = 'auto_matched';
        } else if (res.hasConflict && res.conflictReason === 'rate_mismatch') {
          status = 'rate_mismatch';
        }

        // Default rate: if imported is 0 and stored is available, prefill suggested rate
        const effectiveRate = res.importedRate > 0 ? res.importedRate : (suggestedRate > 0 ? suggestedRate : 0);
        const qty = res.importedQty > 0 ? res.importedQty : 1;
        const initialName = (res.shouldUseStoredName && storedItem?.name)
          ? storedItem.name
          : (isMissingPrice && storedItem?.name ? storedItem.name : res.importedDescription);

        const unit = res.finalUnit || storedItem?.unit || res.importedUnit || 'Coils';
        const sizeSpec = res.finalSizeSpec || storedItem?.sizeSpec || '';

        return {
          id: `res-line-${idx + 1}`,
          originalIdx: idx,
          itemDescription: initialName,
          itemId: storedItem?.id,
          sizeSpec,
          coilQty: qty,
          unit,
          rate: effectiveRate,
          amount: Math.round(qty * effectiveRate),
          status,
          suggestedRate,
          suggestedItem: storedItem || null,
          similarityScore: res.similarityScore,
          candidates: res.alternativeCandidates || (storedItem ? [{ item: storedItem, similarity: res.similarityScore, rateMatches: !isMissingPrice }] : [])
        };
      });

      setLines(initialized);
      setActiveSearchLineId(null);
      setActiveInlineSuggestLineId(null);
      setCatalogSearchText('');
    }
  }, [isOpen, matchResults]);

  // Close catalog search when clicking outside
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.catalog-picker-dropdown') && !target.closest('.inline-suggest-dropdown')) {
        setActiveSearchLineId(null);
        setActiveInlineSuggestLineId(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Keyboard shortcut: Ctrl+Enter to apply
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleApplyToBill();
      } else if (e.key === 'Escape' && activeSearchLineId === null && activeInlineSuggestLineId === null && quickAddLineId === null) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, lines, activeSearchLineId, activeInlineSuggestLineId, quickAddLineId]);

  // Metrics
  const missingPriceLines = lines.filter((l) => l.rate <= 0);
  const autoMatchedCount = lines.filter((l) => l.status === 'auto_matched').length;
  const conflictCount = lines.filter((l) => l.status === 'rate_mismatch' || l.status === 'missing_price').length;
  const totalCoils = lines.reduce((s, l) => s + (Number(l.coilQty) || 0), 0);
  const totalAmount = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  // Filtered lines for display
  const displayedLines = useMemo(() => {
    if (filterMode === 'missing_price') {
      return lines.filter((l) => l.rate <= 0 || l.status === 'missing_price');
    }
    if (filterMode === 'conflicts') {
      return lines.filter((l) => l.status === 'rate_mismatch' || l.status === 'missing_price' || l.rate <= 0);
    }
    return lines;
  }, [lines, filterMode]);

  // Master sorted items list
  const sortedCatalogItems = useMemo(() => {
    return sortItemsCategorySerialWise(availableItems, categoryOrder);
  }, [availableItems, categoryOrder]);

  // Filtered available items for catalog search dropdown modal, grouped by configured category list order
  const groupedCatalogItems = useMemo(() => {
    const q = catalogSearchText.trim();
    const matched = !q
      ? sortedCatalogItems
      : sortedCatalogItems.filter((it) =>
          matchesFlexibleSearch(it.name, q, `${it.sizeSpec || ''} ${it.code || ''} ${it.category || ''}`)
        );
    const orderedSlice = groupItemsByCategoryOrder(matched, categoryOrder).orderedItems.slice(0, 60);
    return groupItemsByCategoryOrder(orderedSlice, categoryOrder);
  }, [sortedCatalogItems, catalogSearchText, categoryOrder]);
  const filteredCatalogItems = groupedCatalogItems.orderedItems;

  // Handlers for Row Edits (by stable line ID)
  const handleUpdateLineById = (lineId: string, updates: Partial<ResolutionLine>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id === lineId) {
          const merged = { ...l, ...updates };
          const qty = Number(merged.coilQty) || 0;
          const rate = Number(merged.rate) || 0;
          merged.amount = Math.round(qty * rate);
          if (merged.rate > 0 && merged.status === 'missing_price') {
            merged.status = 'auto_matched';
          }
          return merged;
        }
        return l;
      })
    );
  };

  const handleSelectCatalogItemForLine = (lineId: string, item: Item) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id === lineId) {
          const qty = Number(l.coilQty) || 1;
          const rate = item.rate || l.rate || 0;
          return {
            ...l,
            itemId: item.id,
            itemDescription: item.name,
            sizeSpec: item.sizeSpec || l.sizeSpec || '',
            unit: item.unit || l.unit || 'Coils',
            rate,
            amount: Math.round(qty * rate),
            status: 'auto_matched',
            suggestedRate: item.rate || 0,
            suggestedItem: item
          };
        }
        return l;
      })
    );
    setActiveSearchLineId(null);
    setActiveInlineSuggestLineId(null);
    setCatalogSearchText('');
  };

  const handleAutoFillAllStoredRates = () => {
    setLines((prev) =>
      prev.map((l) => {
        const rateToUse = l.rate > 0 ? l.rate : (l.suggestedRate > 0 ? l.suggestedRate : (l.suggestedItem?.rate || 0));
        const itemName = l.suggestedItem?.name || l.itemDescription;
        const qty = Number(l.coilQty) || 1;
        return {
          ...l,
          itemDescription: itemName,
          itemId: l.suggestedItem?.id || l.itemId,
          rate: rateToUse,
          amount: Math.round(qty * rateToUse),
          status: rateToUse > 0 ? 'auto_matched' : l.status
        };
      })
    );
  };

  const handleAutoStandardizeAllNames = () => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.suggestedItem) {
          return {
            ...l,
            itemDescription: l.suggestedItem.name,
            itemId: l.suggestedItem.id,
            sizeSpec: l.suggestedItem.sizeSpec || l.sizeSpec,
            unit: l.suggestedItem.unit || l.unit
          };
        }
        return l;
      })
    );
  };

  const handleAddNewLine = () => {
    const newId = `res-line-new-${Date.now()}`;
    setLines((prev) => [
      ...prev,
      {
        id: newId,
        originalIdx: prev.length,
        itemDescription: '',
        itemId: undefined,
        sizeSpec: '',
        coilQty: 1,
        unit: 'Coils',
        rate: 0,
        amount: 0,
        status: 'unmatched',
        suggestedRate: 0,
        suggestedItem: null,
        similarityScore: 0,
        candidates: []
      }
    ]);
    setActiveInlineSuggestLineId(newId);
  };

  const handleDeleteLine = (lineId: string) => {
    setLines((prev) => prev.filter((l) => l.id !== lineId));
    if (activeSearchLineId === lineId) setActiveSearchLineId(null);
    if (activeInlineSuggestLineId === lineId) setActiveInlineSuggestLineId(null);
  };

  const handleOpenQuickAdd = (lineId: string) => {
    const l = lines.find((item) => item.id === lineId);
    if (!l) return;
    setQuickAddLineId(lineId);
    setQuickAddInitialData({
      name: l.itemDescription,
      rate: l.rate,
      unit: l.unit || 'Coils',
      sizeSpec: l.sizeSpec,
      isSpecialItem: l.unit === 'Bobin' || /\bbobin\b|\b500\s*m\s*length\b/i.test(l.itemDescription)
    });
  };

  const handleItemCreated = (newItem: Item) => {
    if (onAddItemToMaster) {
      onAddItemToMaster(newItem);
    }
    if (quickAddLineId !== null) {
      handleSelectCatalogItemForLine(quickAddLineId, newItem);
    }
    setQuickAddLineId(null);
    setQuickAddInitialData(null);
  };

  const handleApplyToBill = () => {
    const updatedBillLines: BillLineItem[] = lines
      .filter((l) => (l.itemDescription && l.itemDescription.trim()) || l.coilQty > 0)
      .map((l, idx) => {
        const qty = Number(l.coilQty) || 1;
        const rate = Number(l.rate) || 0;
        return {
          id: `line-import-${Date.now()}-${idx + 1}`,
          slNo: idx + 1,
          itemId: l.itemId,
          itemDescription: l.itemDescription.trim(),
          sizeSpec: l.sizeSpec || '',
          coilQty: qty,
          unit: l.unit || 'Coils',
          rate: rate,
          amount: Math.round(qty * rate)
        };
      });

    onApplyDecisions(updatedBillLines);
    onClose();
  };

  // Helper function to get inline search matches for a line, grouped by configured category list order
  const getGroupedInlineMatchesForText = (queryText: string) => {
    const cleanQ = (queryText || '').trim();
    const matched = !cleanQ
      ? sortedCatalogItems
      : sortedCatalogItems.filter((it) =>
          matchesFlexibleSearch(it.name, cleanQ, `${it.sizeSpec || ''} ${it.code || ''} ${it.category || ''}`)
        );
    const orderedSlice = groupItemsByCategoryOrder(matched, categoryOrder).orderedItems.slice(0, cleanQ ? 25 : 15);
    return groupItemsByCategoryOrder(orderedSlice, categoryOrder);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-[#030d14]/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-white">
        {/* Modal Header */}
        <div className="px-5 py-3.5 cyber-glass-header text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                  Challan / Bill Item & Price Manager
                </h2>
                {missingPriceLines.length > 0 && (
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-400/40 text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-300" />
                    {missingPriceLines.length} Missing Price{missingPriceLines.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-xs text-cyan-200/75">
                Identify & change item names, assign catalog prices, or auto-fill stored rates instantly.
                {initialChallanNo ? ` (Challan #${initialChallanNo})` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-cyan-500/15 transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action & Metric Toolbar */}
        <div className="px-5 py-2.5 bg-[#0b2334]/85 border-b border-cyan-500/25 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Quick Filter Buttons */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-cyan-200/80 uppercase tracking-wider mr-1">Filter:</span>
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-[#0e2d42] text-cyan-200 border border-cyan-400/60 shadow-xs'
                  : 'bg-[#081b28] border border-cyan-500/25 text-slate-300 hover:text-white hover:bg-[#0e2a3d]'
              }`}
            >
              All Items ({lines.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('missing_price')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                filterMode === 'missing_price'
                  ? 'bg-amber-500/30 text-amber-200 border border-amber-400/70 shadow-xs'
                  : 'bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
              }`}
            >
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              Missing Price ({missingPriceLines.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('conflicts')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                filterMode === 'conflicts'
                  ? 'bg-indigo-500/30 text-indigo-200 border border-indigo-400/70 shadow-xs'
                  : 'bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20'
              }`}
            >
              Needs Review ({conflictCount})
            </button>
          </div>

          {/* Quick Batch Tools */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAutoFillAllStoredRates}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-3 py-1.5 rounded-lg shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer"
              title="Auto-fill rates from Master Catalog for all items without prices"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>⚡ Auto-Fill Stored Prices</span>
            </button>

            <button
              type="button"
              onClick={handleAutoStandardizeAllNames}
              className="bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/35 font-bold px-3 py-1.5 rounded-lg shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer"
              title="Replace messy document item names with exact Master Catalog item names"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
              <span>Standardize Names (≥70%)</span>
            </button>

            <button
              type="button"
              onClick={handleAddNewLine}
              className="bg-[#081b28] border border-cyan-500/35 hover:bg-[#0e2a3d] text-white font-bold px-2.5 py-1.5 rounded-lg transition-all flex items-center space-x-1 cursor-pointer"
              title="Add a new line item"
            >
              <Plus className="w-3.5 h-3.5 text-cyan-300" />
              <span>+ Add Row</span>
            </button>
          </div>
        </div>

        {/* Scrollable Resolution Table */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {displayedLines.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Boxes className="w-10 h-10 mx-auto text-cyan-500/40 mb-2" />
              <p className="font-semibold text-sm text-slate-300">No items found matching the selected filter.</p>
            </div>
          ) : (
            displayedLines.map((line, displayIdx) => {
              const isMissingPrice = line.rate <= 0;
              const hasCandidate = line.suggestedItem !== null;
              const isSearchActive = activeSearchLineId === line.id;
              const isInlineSuggestActive = activeInlineSuggestLineId === line.id;
              const groupedInlineMatches = isInlineSuggestActive
                ? getGroupedInlineMatchesForText(line.itemDescription)
                : { groups: [], orderedItems: [] };
              const inlineMatches = groupedInlineMatches.orderedItems;

              return (
                <div
                  key={line.id}
                  className={`p-3 rounded-xl border transition-all relative ${
                    isMissingPrice
                      ? 'bg-amber-500/10 border-amber-400/40 shadow-xs'
                      : line.status === 'rate_mismatch'
                      ? 'bg-orange-500/10 border-orange-400/40'
                      : line.status === 'auto_matched'
                      ? 'bg-emerald-500/10 border-emerald-400/35'
                      : 'cyber-glass-subcard border-cyan-500/25'
                  }`}
                >
                  {/* Top Line Meta Badge Bar */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="w-6 h-6 rounded-full bg-cyan-500/25 border border-cyan-400/50 text-cyan-200 font-mono font-bold text-xs flex items-center justify-center shadow-xs">
                        {displayIdx + 1}
                      </span>

                      {isMissingPrice ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-500/25 text-amber-200 border border-amber-400/50 px-2 py-0.5 rounded-full shadow-xs">
                          <AlertTriangle className="w-3 h-3" />
                          Challan Item (Without Price)
                        </span>
                      ) : line.status === 'auto_matched' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-400/40">
                          <CheckCircle2 className="w-3 h-3 text-emerald-300" />
                          Master Catalog Matched ({Math.round((line.similarityScore || 1) * 100)}%)
                        </span>
                      ) : line.status === 'rate_mismatch' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full border border-orange-400/40">
                          <AlertTriangle className="w-3 h-3 text-orange-300" />
                          Rate Conflict
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-[#081b28] text-slate-300 px-2 py-0.5 rounded-full border border-cyan-500/30">
                          Custom / Unmatched Text
                        </span>
                      )}

                      {/* Quick Item Match Suggestion Pill */}
                      {hasCandidate && line.suggestedItem && line.suggestedItem.name !== line.itemDescription && (
                        <button
                          type="button"
                          onClick={() => handleSelectCatalogItemForLine(line.id, line.suggestedItem!)}
                          className="text-[11px] bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/40 px-2 py-0.5 rounded-md font-medium flex items-center gap-1 transition-colors cursor-pointer"
                          title="Click to map to this suggested catalog item"
                        >
                          <Sparkles className="w-3 h-3 text-cyan-300" />
                          <span>Map to: <strong>{line.suggestedItem.name}</strong></span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenQuickAdd(line.id)}
                        className="text-[11px] font-bold text-teal-200 hover:text-white bg-teal-500/20 hover:bg-teal-500/35 border border-teal-400/40 px-2 py-0.5 rounded-md flex items-center gap-1 transition-colors cursor-pointer"
                        title="Create this item in Master Catalog"
                      >
                        <Plus className="w-3 h-3" />
                        <span>+ Master Item</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteLine(line.id)}
                        className="text-slate-400 hover:text-rose-300 p-1 rounded-md hover:bg-rose-500/15 transition-colors cursor-pointer"
                        title="Delete line"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Main Inputs Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
                    {/* Item Description & Search Picker (Col 5) */}
                    <div className="md:col-span-5 relative">
                      <label className="block text-[10px] font-bold text-cyan-300/80 uppercase tracking-wider mb-0.5">
                        Item Description / Goods
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          value={line.itemDescription}
                          onFocus={() => {
                            setActiveInlineSuggestLineId(line.id);
                          }}
                          onChange={(e) => {
                            handleUpdateLineById(line.id, { itemDescription: e.target.value });
                            setActiveInlineSuggestLineId(line.id);
                          }}
                          placeholder="Type or search item name (e.g. 1.3 bya, 12 tt)..."
                          className="w-full bg-[#061520] border border-cyan-500/30 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 pr-24"
                        />
                        {line.itemDescription ? (
                          <button
                            type="button"
                            onClick={() => {
                              handleUpdateLineById(line.id, { itemDescription: '' });
                              setActiveInlineSuggestLineId(line.id);
                            }}
                            className="absolute right-18 p-1 text-slate-400 hover:text-rose-300 hover:bg-rose-500/15 rounded transition-colors cursor-pointer"
                            title="Clear Item Name (✕)"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            if (activeSearchLineId === line.id) {
                              setActiveSearchLineId(null);
                            } else {
                              setActiveSearchLineId(line.id);
                              setActiveInlineSuggestLineId(null);
                              setCatalogSearchText('');
                            }
                          }}
                          className="absolute right-1 px-1.5 py-1 bg-[#0c2638] hover:bg-[#12354d] text-cyan-200 rounded text-[10px] font-bold flex items-center gap-1 border border-cyan-500/35 cursor-pointer"
                          title="Search & Pick from Master Item Catalog"
                        >
                          <Search className="w-2.5 h-2.5" />
                          <span>Catalog</span>
                          <ChevronDown className="w-2.5 h-2.5" />
                        </button>
                      </div>

                      {/* 1. Live Inline Autocomplete Dropdown (As user types or focuses) */}
                      {isInlineSuggestActive && !isSearchActive && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="inline-suggest-dropdown absolute left-0 top-full mt-1 w-full bg-[#091e2c]/98 backdrop-blur-xl border border-cyan-400/40 rounded-xl shadow-2xl z-50 p-2 text-left animate-in fade-in zoom-in-95 duration-100 max-h-60 overflow-y-auto"
                        >
                          <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-cyan-500/20 text-[10px] font-bold text-cyan-200/80 uppercase">
                            <span>Catalog Suggestions</span>
                            <span className="text-cyan-300">{inlineMatches.length} items</span>
                          </div>
                          {inlineMatches.length === 0 ? (
                            <div className="py-2 text-center text-xs text-slate-300">
                              No matching item found.{' '}
                              <button
                                type="button"
                                onClick={() => handleOpenQuickAdd(line.id)}
                                className="text-cyan-300 font-bold hover:underline ml-1"
                              >
                                + Add to Master
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {groupedInlineMatches.groups.map((grp) => (
                                <div key={grp.category} className="space-y-0.5">
                                  <div className="px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider text-cyan-300 bg-[#061520] border border-cyan-500/25 rounded">
                                    {grp.category} ({grp.items.length})
                                  </div>
                                  {grp.items.map(({ item }) => (
                                    <button
                                      key={item.id}
                                      type="button"
                                      onClick={() => handleSelectCatalogItemForLine(line.id, item)}
                                      className="w-full text-left p-1.5 rounded-lg hover:bg-cyan-500/15 border border-transparent hover:border-cyan-400/30 transition-colors flex items-center justify-between text-xs cursor-pointer group"
                                    >
                                      <div>
                                        <div className="font-bold text-white group-hover:text-cyan-200">
                                          {item.name}
                                        </div>
                                        <div className="text-[10px] text-slate-400 flex items-center gap-2">
                                          {item.sizeSpec && <span>Size: {item.sizeSpec}</span>}
                                          <span>Unit: {item.unit || 'Coils'}</span>
                                          {item.category && <span className="bg-[#081b28] border border-cyan-500/20 px-1 rounded text-cyan-200">{item.category}</span>}
                                        </div>
                                      </div>
                                      <div className="text-right whitespace-nowrap pl-2">
                                        <div className="font-extrabold text-emerald-300 text-xs">
                                          ৳{item.rate ? item.rate.toLocaleString() : 0}
                                        </div>
                                        <span className="text-[10px] text-cyan-300 font-semibold group-hover:underline">
                                          Select →
                                        </span>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* 2. Dropdown Catalog Search Modal Popup (When clicking Catalog button) */}
                      {isSearchActive && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="catalog-picker-dropdown absolute left-0 top-full mt-1 w-full sm:w-96 bg-[#091e2c]/98 backdrop-blur-xl border border-cyan-400/40 rounded-xl shadow-2xl z-50 p-2 text-left animate-in fade-in zoom-in-95 duration-100"
                        >
                          <div className="flex items-center gap-1.5 pb-2 border-b border-cyan-500/20">
                            <Search className="w-3.5 h-3.5 text-cyan-300" />
                            <input
                              type="text"
                              autoFocus
                              value={catalogSearchText}
                              onChange={(e) => setCatalogSearchText(e.target.value)}
                              placeholder="Search by size, name, code (e.g. 1.3 bya, 12 tt)..."
                              className="w-full text-xs font-semibold bg-[#061520] text-white placeholder-slate-400 border border-cyan-500/30 rounded px-2 py-1 focus:outline-hidden"
                            />
                            {catalogSearchText && (
                              <button
                                type="button"
                                onClick={() => setCatalogSearchText('')}
                                className="text-slate-400 hover:text-white p-0.5"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <div className="max-h-56 overflow-y-auto mt-1 space-y-1 divide-y divide-cyan-500/15">
                            {filteredCatalogItems.length === 0 ? (
                              <div className="py-4 text-center text-xs text-slate-300">
                                No matching catalog item found.
                                <button
                                  type="button"
                                  onClick={() => handleOpenQuickAdd(line.id)}
                                  className="block mx-auto mt-2 text-xs font-bold text-cyan-200 bg-cyan-500/20 border border-cyan-400/40 px-2 py-1 rounded"
                                >
                                  + Create New Master Item
                                </button>
                              </div>
                            ) : (
                              groupedCatalogItems.groups.map((grp) => (
                                <div key={grp.category} className="pt-1">
                                  <div className="px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider text-cyan-300 bg-[#061520] border border-cyan-500/25 rounded mb-0.5">
                                    {grp.category} ({grp.items.length})
                                  </div>
                                  {grp.items.map(({ item }) => (
                                    <button
                                      key={item.id}
                                      type="button"
                                      onClick={() => handleSelectCatalogItemForLine(line.id, item)}
                                      className="w-full text-left p-1.5 rounded-lg hover:bg-cyan-500/15 transition-colors flex items-center justify-between text-xs cursor-pointer group"
                                    >
                                      <div>
                                        <div className="font-bold text-white group-hover:text-cyan-200">
                                          {item.name}
                                        </div>
                                        <div className="text-[10px] text-slate-400 flex items-center gap-2">
                                          {item.sizeSpec && <span>Size: {item.sizeSpec}</span>}
                                          <span>Unit: {item.unit || 'Coils'}</span>
                                          {item.category && <span className="bg-[#081b28] border border-cyan-500/20 px-1 rounded text-cyan-200">{item.category}</span>}
                                        </div>
                                      </div>
                                      <div className="text-right whitespace-nowrap pl-2">
                                        <div className="font-bold text-emerald-300 text-xs">
                                          ৳{item.rate ? item.rate.toLocaleString() : 0}
                                        </div>
                                        <span className="text-[10px] text-cyan-300 font-semibold group-hover:underline">
                                          Select →
                                        </span>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Quantity (Col 2) */}
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-cyan-300/80 uppercase tracking-wider mb-0.5">
                        Quantity
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={line.coilQty === 0 ? '' : line.coilQty}
                        onChange={(e) => {
                          const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                          handleUpdateLineById(line.id, { coilQty: isNaN(val) ? 0 : val });
                        }}
                        placeholder="1"
                        className="w-full bg-[#061520] border border-cyan-500/30 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white text-center focus:ring-2 focus:ring-cyan-400"
                      />
                    </div>

                    {/* Unit (Col 2) */}
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-cyan-300/80 uppercase tracking-wider mb-0.5">
                        Unit
                      </label>
                      <select
                        value={line.unit}
                        onChange={(e) => handleUpdateLineById(line.id, { unit: e.target.value })}
                        className="w-full bg-[#061520] border border-cyan-500/30 rounded-lg px-2 py-1.5 text-xs font-semibold text-white focus:ring-2 focus:ring-cyan-400"
                      >
                        <option value="Coils">Coils</option>
                        <option value="Coil">Coil</option>
                        <option value="Bobin">Bobin</option>
                        <option value="Pcs">Pcs</option>
                        <option value="Mtr">Mtr</option>
                        <option value="Box">Box</option>
                        <option value="Drum">Drum</option>
                        <option value="Yards">Yards</option>
                      </select>
                    </div>

                    {/* Unit Price / Rate (Col 2) */}
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-cyan-300/80 uppercase tracking-wider mb-0.5 flex items-center justify-between">
                        <span>Unit Rate (৳)</span>
                        {isMissingPrice && <span className="text-amber-300 font-extrabold animate-pulse">Required</span>}
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={line.rate === 0 ? '' : line.rate}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                            handleUpdateLineById(line.id, { rate: isNaN(val) ? 0 : val });
                          }}
                          placeholder="0.00"
                          className={`w-full rounded-lg px-2.5 py-1.5 text-xs font-extrabold text-right focus:ring-2 ${
                            isMissingPrice
                              ? 'bg-amber-950/70 border-2 border-amber-400 text-amber-200 focus:ring-amber-400'
                              : 'bg-[#061520] border border-cyan-500/30 text-white focus:ring-cyan-400'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Total Amount (Col 1) */}
                    <div className="md:col-span-1 text-right">
                      <label className="block text-[10px] font-bold text-cyan-300/80 uppercase tracking-wider mb-0.5">
                        Amount
                      </label>
                      <div className="text-xs font-extrabold text-cyan-200 py-1.5">
                        ৳{line.amount ? line.amount.toLocaleString() : 0}
                      </div>
                    </div>
                  </div>

                  {/* Suggestion Price Quick Bar (If missing or mismatch) */}
                  {(isMissingPrice || (line.suggestedRate > 0 && line.suggestedRate !== line.rate)) && (
                    <div className="mt-2 pt-2 border-t border-cyan-500/20 flex items-center justify-between text-xs flex-wrap gap-2">
                      <div className="text-slate-300 text-[11px] flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                        <span>
                          Catalog Price: <strong className="text-white">৳{line.suggestedRate.toLocaleString()}</strong>
                          {line.suggestedItem ? ` (${line.suggestedItem.name})` : ''}
                        </span>
                      </div>
                      {line.suggestedRate > 0 && (
                        <button
                          type="button"
                          onClick={() => handleUpdateLineById(line.id, { rate: line.suggestedRate })}
                          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-2.5 py-1 rounded-md text-xs transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
                        >
                          <Check className="w-3 h-3" />
                          <span>Apply ৳{line.suggestedRate.toLocaleString()}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal Sticky Summary & Action Footer */}
        <div className="px-5 py-3 bg-[#071824]/90 border-t border-cyan-500/25 flex flex-wrap items-center justify-between gap-3">
          {/* Summary Totals */}
          <div className="flex items-center gap-4 text-xs">
            <div className="bg-[#081b28] px-3 py-1.5 rounded-lg border border-cyan-500/30 shadow-xs flex items-center gap-2">
              <span className="text-slate-300 font-semibold">Total Items:</span>
              <strong className="text-white font-bold">{lines.length}</strong>
            </div>
            <div className="bg-[#081b28] px-3 py-1.5 rounded-lg border border-cyan-500/30 shadow-xs flex items-center gap-2">
              <span className="text-slate-300 font-semibold">Total Coils:</span>
              <strong className="text-cyan-300 font-extrabold">{totalCoils}</strong>
            </div>
            <div className="bg-[#081b28] px-3 py-1.5 rounded-lg border border-cyan-500/30 shadow-xs flex items-center gap-2">
              <span className="text-slate-300 font-semibold">Total Value:</span>
              <strong className="text-emerald-300 font-extrabold text-sm">৳{totalAmount.toLocaleString()}</strong>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#081b28] text-slate-200 border border-cyan-500/30 hover:bg-[#0e2a3d] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyToBill}
              className="px-5 py-2 rounded-xl text-xs font-black bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md shadow-cyan-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Apply to Bill & Start Transaction</span>
              <span className="text-[10px] opacity-75 font-mono">(Ctrl+Enter)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Add Item to Master Catalog Modal */}
      {quickAddLineId !== null && (
        <QuickAddItemModal
          isOpen={quickAddLineId !== null}
          onClose={() => {
            setQuickAddLineId(null);
            setQuickAddInitialData(null);
          }}
          initialData={quickAddInitialData || undefined}
          existingItems={availableItems}
          onItemCreated={handleItemCreated}
          title="Create Master Catalog Item"
          contextHint="Creating master item. Once saved, it will be automatically selected and priced for this row."
        />
      )}
    </div>
  );
};

