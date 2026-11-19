import React, { useState, useRef, useEffect } from 'react';
import { Search, FileText, User, Package, X } from 'lucide-react';
import { Item, Party, StoredBill } from '../types';
import { matchesFlexibleSearch, groupItemsByCategoryOrder } from '../utils/searchHelper';
import { getAllCategories } from '../utils/categoryHelper';

interface GlobalSearchBarProps {
  items: Item[];
  parties: Party[];
  storedBills: StoredBill[];
  onSelectBill?: (bill: StoredBill) => void;
  onViewInStoredBills?: (bill: StoredBill) => void;
  onSelectParty?: (party: Party) => void;
  onViewPartyLedger?: (party: Party) => void;
  onSelectItem?: (item: Item) => void;
}

export const GlobalSearchBar: React.FC<GlobalSearchBarProps> = ({
  items,
  parties,
  storedBills,
  onSelectBill,
  onViewInStoredBills,
  onSelectParty,
  onViewPartyLedger,
  onSelectItem
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const q = query.trim().toLowerCase();

  const matchingBills = q
    ? storedBills
        .filter(b => (b.billNo || '').toLowerCase().includes(q) || (b.header?.partyName || '').toLowerCase().includes(q))
        .slice(0, 5)
    : [];

  const matchingParties = q
    ? parties
        .filter(p => (p.name || '').toLowerCase().includes(q) || (p.phone || '').toLowerCase().includes(q))
        .slice(0, 5)
    : [];

  const matchedItemsRaw = q
    ? items.filter(i => matchesFlexibleSearch(`${i.name || ''} ${i.sizeSpec || ''} ${i.category || ''}`, query, `${i.code || ''}`))
    : [];

  const groupedMatchingItems = q
    ? groupItemsByCategoryOrder(
        groupItemsByCategoryOrder(matchedItemsRaw, categoryOrder).orderedItems.slice(0, 15),
        categoryOrder
      )
    : { groups: [], orderedItems: [] };

  const matchingItems = groupedMatchingItems.orderedItems;

  const hasResults = matchingBills.length > 0 || matchingParties.length > 0 || matchingItems.length > 0;
  const totalResults = matchingBills.length + matchingParties.length + matchingItems.length;

  useEffect(() => {
    setHighlightIdx(0);
  }, [query, totalResults, isOpen]);

  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const el = dropdownRef.current.querySelector('[data-global-highlighted="true"]') as HTMLElement | null;
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIdx, isOpen]);

  const handleSelectByIndex = (targetIdx: number) => {
    if (totalResults === 0) return;
    const clampedIdx = Math.max(0, Math.min(targetIdx, totalResults - 1));
    if (clampedIdx < matchingBills.length) {
      const b = matchingBills[clampedIdx];
      onSelectBill ? onSelectBill(b) : onViewInStoredBills?.(b);
      setIsOpen(false);
      return;
    }
    const partyIdx = clampedIdx - matchingBills.length;
    if (partyIdx < matchingParties.length) {
      const p = matchingParties[partyIdx];
      onSelectParty ? onSelectParty(p) : onViewPartyLedger?.(p);
      setIsOpen(false);
      return;
    }
    const itemIdx = partyIdx - matchingParties.length;
    const item = matchingItems[itemIdx];
    if (item) {
      onSelectItem?.(item);
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setHighlightIdx(0);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (!isOpen) setIsOpen(true);
              if (totalResults > 0) {
                setHighlightIdx((prev) => Math.min(prev + 1, totalResults - 1));
              }
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              if (!isOpen) setIsOpen(true);
              if (totalResults > 0) {
                setHighlightIdx((prev) => Math.max(prev - 1, 0));
              }
            } else if (e.key === 'Enter') {
              if (isOpen && q && totalResults > 0) {
                e.preventDefault();
                handleSelectByIndex(highlightIdx);
              }
            } else if (e.key === 'Escape') {
              if (isOpen) {
                e.preventDefault();
                setIsOpen(false);
              }
            }
          }}
          placeholder="Global Search (Bills, Parties, Items)..."
          className="w-full pl-8 pr-7 py-1 text-xs bg-slate-900/90 text-white placeholder-slate-400 border border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setIsOpen(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {isOpen && q && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 top-full mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden max-h-72 overflow-y-auto text-xs divide-y divide-slate-800"
        >
          {!hasResults ? (
            <div className="p-3 text-center text-slate-400">No results found for &ldquo;{query}&rdquo;</div>
          ) : (
            <>
              {matchingBills.length > 0 && (
                <div className="p-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-purple-400 px-2 mb-1 flex items-center gap-1">
                    <FileText className="w-3 h-3" /> Invoices / Bills
                  </div>
                  {matchingBills.map((b, bIdx) => {
                    const isHighlighted = highlightIdx === bIdx;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        data-global-highlighted={isHighlighted}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onSelectBill ? onSelectBill(b) : onViewInStoredBills?.(b);
                          setIsOpen(false);
                        }}
                        onMouseEnter={() => setHighlightIdx(bIdx)}
                        className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between text-slate-200 transition-colors cursor-pointer ${
                          isHighlighted ? 'bg-purple-600/35 ring-1 ring-purple-400 text-white' : 'hover:bg-slate-800'
                        }`}
                      >
                        <span className="font-mono font-bold text-white">{b.billNo || b.id}</span>
                        <span className="text-slate-400 truncate max-w-[140px]">{b.header?.partyName || ''}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {matchingParties.length > 0 && (
                <div className="p-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 px-2 mb-1 flex items-center gap-1">
                    <User className="w-3 h-3" /> Parties / Customers
                  </div>
                  {matchingParties.map((p, pIdx) => {
                    const globalIdx = matchingBills.length + pIdx;
                    const isHighlighted = highlightIdx === globalIdx;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        data-global-highlighted={isHighlighted}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onSelectParty ? onSelectParty(p) : onViewPartyLedger?.(p);
                          setIsOpen(false);
                        }}
                        onMouseEnter={() => setHighlightIdx(globalIdx)}
                        className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between text-slate-200 transition-colors cursor-pointer ${
                          isHighlighted ? 'bg-emerald-600/35 ring-1 ring-emerald-400 text-white' : 'hover:bg-slate-800'
                        }`}
                      >
                        <span className="font-bold text-white">{p.name}</span>
                        <span className="text-slate-400 font-mono text-[11px]">{p.phone || p.address}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {matchingItems.length > 0 && (
                <div className="p-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-blue-400 px-2 mb-1 flex items-center gap-1">
                    <Package className="w-3 h-3" /> Catalog Items ({matchingItems.length})
                  </div>
                  <div className="space-y-1">
                    {groupedMatchingItems.groups.map((grp) => (
                      <div key={grp.category}>
                        <div className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-cyan-300 bg-slate-800/80 rounded mb-0.5">
                          {grp.category} ({grp.items.length})
                        </div>
                        {grp.items.map(({ item: i, flatIndex }) => {
                          const globalIdx = matchingBills.length + matchingParties.length + flatIndex;
                          const isHighlighted = highlightIdx === globalIdx;
                          return (
                            <button
                              key={i.id}
                              type="button"
                              data-global-highlighted={isHighlighted}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                onSelectItem?.(i);
                                setIsOpen(false);
                              }}
                              onMouseEnter={() => setHighlightIdx(globalIdx)}
                              className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between text-slate-200 transition-colors cursor-pointer ${
                                isHighlighted ? 'bg-blue-600/35 ring-1 ring-blue-400 text-white' : 'hover:bg-slate-800'
                              }`}
                            >
                              <span className="font-medium text-white truncate">{i.name}</span>
                              <span className="text-slate-400 text-[11px]">{i.sizeSpec || i.category}</span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
