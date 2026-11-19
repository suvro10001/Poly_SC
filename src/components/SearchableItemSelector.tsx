import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, Check, XCircle } from 'lucide-react';
import { matchesFlexibleSearch, groupItemsByCategoryOrder } from '../utils/searchHelper';
import { getAllCategories } from '../utils/categoryHelper';

export interface SelectableCatalogOption {
  id: string;
  code?: string;
  name: string;
  category?: string;
  unit?: string;
  rate?: number;
  sourceLabel?: string;
}

interface SearchableItemSelectorProps {
  options: SelectableCatalogOption[];
  value: string; // '' = unset, '__SKIP__' = skipped, otherwise option.id
  onChange: (value: string, option?: SelectableCatalogOption) => void;
  placeholder?: string;
  skipLabel?: string;
  theme?: 'light' | 'dark';
  emptyOptionsMessage?: string;
}

export const SearchableItemSelector: React.FC<SearchableItemSelectorProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select matching item...',
  skipLabel = 'Skip / Ignore',
  theme = 'light',
  emptyOptionsMessage = 'No existing items available'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; openUpward: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = useMemo(
    () => (value && value !== '__SKIP__' ? options.find((o) => o.id === value) : undefined),
    [options, value]
  );

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

  const filteredOptions = useMemo(() => {
    const q = query.trim();
    const matched = !q
      ? options
      : options.filter((o) =>
          matchesFlexibleSearch(`${o.name || ''} ${o.code || ''} ${o.category || ''}`, q)
        );
    return groupItemsByCategoryOrder(matched, categoryOrder).orderedItems.slice(0, 120);
  }, [options, query, categoryOrder]);

  const groupedFilteredOptions = useMemo(
    () => groupItemsByCategoryOrder(filteredOptions, categoryOrder).groups,
    [filteredOptions, categoryOrder]
  );

  useEffect(() => {
    setHighlightIdx(0);
  }, [query, filteredOptions.length, isOpen]);

  useEffect(() => {
    if (isOpen && listContainerRef.current) {
      const el = listContainerRef.current.querySelector('[data-highlighted="true"]') as HTMLElement | null;
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIdx, isOpen]);

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const dropdownHeight = 290;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const openUpward = spaceBelow < dropdownHeight && rect.top > spaceBelow;
    const width = Math.max(rect.width, 300);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const top = openUpward ? rect.top - 4 : rect.bottom + 4;
    setCoords({ top, left, width, openUpward });
  };

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 20);

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    const handleScrollOrResize = (e: Event) => {
      if (dropdownRef.current && e.target instanceof Node && dropdownRef.current.contains(e.target)) {
        return;
      }
      updatePosition();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen]);

  const isDark = theme === 'dark';

  const triggerClasses = isDark
    ? value === '__SKIP__'
      ? 'bg-slate-800/80 border-slate-600 text-slate-300'
      : selectedOption
        ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200'
        : 'bg-[#061520] border-amber-400/50 text-amber-200'
    : value === '__SKIP__'
      ? 'bg-slate-100 border-slate-300 text-slate-600'
      : selectedOption
        ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
        : 'bg-white border-amber-400 text-slate-700';

  return (
    <div className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!isOpen) setQuery('');
          setIsOpen((prev) => !prev);
        }}
        className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center justify-between gap-2 transition-colors cursor-pointer text-left ${triggerClasses}`}
      >
        <span className="truncate">
          {value === '__SKIP__' ? (
            <span className="inline-flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5 shrink-0 opacity-75" />
              <span>{skipLabel}</span>
            </span>
          ) : selectedOption ? (
            <span className="inline-flex items-center gap-1.5 truncate">
              <Check className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
              <span className="truncate font-bold">{selectedOption.name}</span>
              {selectedOption.code && (
                <span className="text-[10px] font-mono opacity-75 shrink-0">({selectedOption.code})</span>
              )}
            </span>
          ) : (
            <span className="opacity-80">{placeholder}</span>
          )}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen &&
        coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: coords.width,
              maxWidth: 'calc(100vw - 16px)',
              transform: coords.openUpward ? 'translateY(-100%)' : undefined,
              zIndex: 10050
            }}
            className={`rounded-xl border shadow-2xl overflow-hidden text-xs ${
              isDark
                ? 'bg-[#091e2c] border-cyan-400/40 text-white'
                : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            {/* Search Input */}
            <div className={`p-2 border-b ${isDark ? 'border-cyan-500/25 bg-[#061520]' : 'border-slate-200 bg-slate-50'}`}>
              <div className="relative">
                <Search className={`w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 ${isDark ? 'text-cyan-400' : 'text-slate-400'}`} />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      if (filteredOptions.length > 0) {
                        setHighlightIdx((prev) => Math.min(prev + 1, filteredOptions.length - 1));
                      }
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      if (filteredOptions.length > 0) {
                        setHighlightIdx((prev) => Math.max(prev - 1, 0));
                      }
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      const chosen = filteredOptions[highlightIdx] || filteredOptions[0];
                      if (chosen) {
                        onChange(chosen.id, chosen);
                        setIsOpen(false);
                      }
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsOpen(false);
                      triggerRef.current?.focus();
                    }
                  }}
                  placeholder="Search item name, code, category..."
                  className={`w-full pl-8 pr-7 py-1.5 rounded-lg border text-xs focus:outline-none ${
                    isDark
                      ? 'bg-[#091e2c] border-cyan-500/35 text-white placeholder-slate-400 focus:border-cyan-400'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-500'
                  }`}
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold cursor-pointer ${
                      isDark ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Skip / Ignore Option */}
            <div className={`p-1 border-b ${isDark ? 'border-cyan-500/20' : 'border-slate-100'}`}>
              <button
                type="button"
                onClick={() => {
                  onChange('__SKIP__');
                  setIsOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-left transition-colors cursor-pointer ${
                  value === '__SKIP__'
                    ? isDark
                      ? 'bg-slate-700/80 text-white font-bold'
                      : 'bg-slate-200 text-slate-900 font-bold'
                    : isDark
                      ? 'text-slate-300 hover:bg-white/10'
                      : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  <span>{skipLabel}</span>
                </span>
                {value === '__SKIP__' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
              </button>
            </div>

            {/* Scrollable Options List Grouped by Category List Order */}
            <div ref={listContainerRef} className="max-h-56 overflow-y-auto p-1 space-y-1">
              {filteredOptions.length === 0 ? (
                <div className={`py-4 px-3 text-center text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {options.length === 0 ? emptyOptionsMessage : `No matching item for "${query}"`}
                </div>
              ) : (
                groupedFilteredOptions.map((grp) => (
                  <div key={grp.category} className="space-y-0.5">
                    <div
                      className={`px-2 py-1 text-[10px] font-black uppercase tracking-wider sticky top-0 z-10 rounded ${
                        isDark
                          ? 'bg-[#061826] text-cyan-300 border-b border-cyan-500/20'
                          : 'bg-slate-100 text-slate-700 border-b border-slate-200'
                      }`}
                    >
                      {grp.category} ({grp.items.length})
                    </div>
                    {grp.items.map(({ item: opt, flatIndex }) => {
                      const isSelected = value === opt.id;
                      const isHighlighted = highlightIdx === flatIndex;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          data-highlighted={isHighlighted}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            onChange(opt.id, opt);
                            setIsOpen(false);
                          }}
                          onMouseEnter={() => setHighlightIdx(flatIndex)}
                          className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
                            isHighlighted
                              ? isDark
                                ? 'bg-cyan-500/25 text-white ring-1 ring-cyan-400'
                                : 'bg-indigo-100 text-indigo-950 ring-1 ring-indigo-400'
                              : isSelected
                                ? isDark
                                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                                  : 'bg-indigo-50 text-indigo-900 border border-indigo-200'
                                : isDark
                                  ? 'hover:bg-cyan-500/15 text-slate-100'
                                  : 'hover:bg-slate-100 text-slate-800'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-bold truncate">{opt.name}</div>
                            <div className={`text-[10px] flex items-center gap-2 truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              {opt.code && <span className="font-mono">{opt.code}</span>}
                              {opt.category && <span>• {opt.category}</span>}
                              {opt.sourceLabel && <span className="opacity-80">• {opt.sourceLabel}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {typeof opt.rate === 'number' && opt.rate > 0 && (
                              <span className={`font-mono text-[10px] font-bold ${isDark ? 'text-cyan-300' : 'text-slate-600'}`}>
                                ৳{opt.rate.toLocaleString('en-IN')}
                              </span>
                            )}
                            {isSelected && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default SearchableItemSelector;
