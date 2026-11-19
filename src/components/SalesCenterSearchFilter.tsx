import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Building2, Search, ChevronDown, Check, Lock, X } from 'lucide-react';
import { BranchLocation } from '../types';
import { isUnwantedSalesCenter } from '../utils/branchAccess';

export interface SalesCenterOption {
  id: string;
  name?: string;
  label?: string;
  address?: string;
  phone?: string;
  [key: string]: any;
}

export interface SalesCenterSearchFilterProps {
  value: string;
  onChange: (val: string) => void;
  options?: SalesCenterOption[];
  branches?: BranchLocation[];
  isLocked?: boolean;
  lockedReason?: string;
  includeAllOption?: boolean;
  allOptionLabel?: string;
  allOptionValue?: string;
  label?: string;
  placeholder?: string;
  theme?: 'dark' | 'light';
  size?: 'xs' | 'sm' | 'md';
  widthClass?: string;
  title?: string;
  disabled?: boolean;
  className?: string;
  hideClearButton?: boolean;
}

export const SalesCenterSearchFilter: React.FC<SalesCenterSearchFilterProps> = ({
  value,
  onChange,
  options,
  branches,
  isLocked = false,
  lockedReason,
  includeAllOption = true,
  allOptionLabel,
  allOptionValue = 'all',
  label = 'Sales Center:',
  placeholder = 'Search sales center...',
  theme = 'dark',
  size = 'sm',
  widthClass = 'min-w-0 w-full sm:w-auto sm:min-w-[180px] sm:max-w-[240px]',
  title,
  disabled = false,
  className = '',
  hideClearButton = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const [dropdownRect, setDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    placement: 'bottom' | 'top';
  } | null>(null);

  const updateDropdownPosition = useCallback(() => {
    const el = containerRef.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const shouldFlipTop = spaceBelow < 210 && spaceAbove > spaceBelow;
    const availableSpace = shouldFlipTop ? spaceAbove : spaceBelow;
    const maxListHeight = Math.max(150, Math.min(270, availableSpace - 52));
    const width = Math.min(Math.max(rect.width, 240), Math.min(340, window.innerWidth - 16));
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    setDropdownRect({
      top: shouldFlipTop ? Math.max(8, rect.top - 4) : Math.min(window.innerHeight - 8, rect.bottom + 4),
      left,
      width,
      maxHeight: maxListHeight,
      placement: shouldFlipTop ? 'top' : 'bottom'
    });
  }, []);

  // Normalize options from either options array or branches array, sorted alphabetically A-Z
  const normalizedOptions: SalesCenterOption[] = useMemo(() => {
    let list: SalesCenterOption[] = [];
    if (options && options.length > 0) {
      list = options.map((opt) => ({
        id: opt.id || opt.name || opt.label || '',
        name: opt.name || opt.label || opt.id || '',
        label: opt.label || opt.name || opt.id || '',
        address: opt.address,
        phone: opt.phone
      }));
    } else if (branches && branches.length > 0) {
      list = branches.map((b) => ({
        id: b.id,
        name: b.name,
        label: b.name,
        address: b.address,
        phone: b.phone
      }));
    }

    return list
      .filter((opt) => !isUnwantedSalesCenter(opt))
      .sort((a, b) => (a.name || a.label || '').localeCompare(b.name || b.label || ''));
  }, [options, branches]);

  // Click / touch outside, Escape, and viewport scroll/resize positioning listener
  useEffect(() => {
    if (!isOpen) {
      setDropdownRect(null);
      return;
    }
    updateDropdownPosition();
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(target))
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDownGlobal = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDownGlobal);
    window.addEventListener('scroll', updateDropdownPosition, true);
    window.addEventListener('resize', updateDropdownPosition);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDownGlobal);
      window.removeEventListener('scroll', updateDropdownPosition, true);
      window.removeEventListener('resize', updateDropdownPosition);
    };
  }, [isOpen, updateDropdownPosition]);

  // Focus input when opened and reset highlight
  useEffect(() => {
    if (isOpen) {
      setHighlightIndex(0);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 40);
    } else {
      setSearchQuery('');
      setHighlightIndex(0);
    }
  }, [isOpen]);

  // Find currently selected option display name
  const currentSelectedLabel = useMemo(() => {
    if (!value) return includeAllOption ? (allOptionLabel || 'All Sales Centers') : 'Select Sales Center';
    const valLower = value.toLowerCase().trim();
    const allValLower = (allOptionValue || 'all').toLowerCase().trim();

    if (valLower === allValLower || valLower === 'all' || valLower === 'all sales centers' || valLower.startsWith('all sales center') || valLower === 'all branches') {
      return allOptionLabel || 'All Sales Centers';
    }

    const matched = normalizedOptions.find(
      (opt) =>
        opt.id.toLowerCase().trim() === valLower ||
        (opt.name && opt.name.toLowerCase().trim() === valLower) ||
        (opt.label && opt.label.toLowerCase().trim() === valLower) ||
        (opt.name && (opt.name.toLowerCase().includes(valLower) || valLower.includes(opt.name.toLowerCase()))) ||
        (opt.label && (opt.label.toLowerCase().includes(valLower) || valLower.includes(opt.label.toLowerCase())))
    );

    if (matched) return matched.label || matched.name;
    return value;
  }, [value, normalizedOptions, includeAllOption, allOptionLabel, allOptionValue]);

  // Filter options by search query dynamically
  const filteredList = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return normalizedOptions;
    const tokens = q.split(/\s+/).filter(Boolean);
    return normalizedOptions.filter((opt) => {
      const optStr = `${opt.name || ''} ${opt.label || ''} ${opt.address || ''} ${opt.id || ''}`.toLowerCase();
      return tokens.every((token) => optStr.includes(token));
    });
  }, [normalizedOptions, searchQuery]);

  // Reset highlight index when filtered list changes
  useEffect(() => {
    setHighlightIndex(0);
  }, [filteredList]);

  // Auto-scroll highlighted element into view
  useEffect(() => {
    if (isOpen && listContainerRef.current) {
      const activeEl = listContainerRef.current.querySelector('[data-highlighted="true"]') as HTMLElement | null;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightIndex, isOpen]);

  const isDark = theme === 'dark';
  const sizeClasses =
    size === 'xs'
      ? 'text-[11px] py-1 px-2.5 h-[28px]'
      : size === 'md'
      ? 'text-sm py-2 px-3 h-[40px]'
      : 'text-xs py-1.5 px-3 h-[34px]';

  // If locked to a single branch, render locked indicator badge
  if (isLocked) {
    return (
      <div
        className={`flex items-center space-x-1.5 bg-[#061520]/90 border border-cyan-500/30 text-white px-2.5 py-1 h-[34px] rounded-xl text-xs font-bold select-none shrink-0 ${widthClass} ${className}`}
        title={lockedReason || `Locked to ${currentSelectedLabel}`}
      >
        <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        {label && <span className="text-cyan-200/80 font-bold text-[11px] whitespace-nowrap">{label}</span>}
        <span className="truncate text-cyan-100 font-bold" title={currentSelectedLabel}>
          {currentSelectedLabel}
        </span>
      </div>
    );
  }

  const handleSelect = (selectedVal: string) => {
    onChange(selectedVal);
    setIsOpen(false);
  };

  const showAllOption = includeAllOption && (!searchQuery || searchQuery.toLowerCase().trim() === 'all' || 'all sales centers'.includes(searchQuery.toLowerCase().trim()));
  const totalSelectableCount = (showAllOption ? 1 : 0) + filteredList.length;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev + 1 < totalSelectableCount ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (showAllOption && highlightIndex === 0) {
        handleSelect(allOptionValue);
      } else {
        const targetListIdx = showAllOption ? highlightIndex - 1 : highlightIndex;
        if (targetListIdx >= 0 && targetListIdx < filteredList.length) {
          const item = filteredList[targetListIdx];
          handleSelect(item.id || item.name || item.label || '');
        } else if (filteredList.length > 0) {
          const item = filteredList[0];
          handleSelect(item.id || item.name || item.label || '');
        } else if (searchQuery.trim()) {
          handleSelect(searchQuery.trim());
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center gap-1.5 max-w-full ${
        isDark
          ? 'bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 h-[34px] shrink-0'
          : ''
      } ${widthClass} ${className}`}
      title={title}
    >
      {label && (
        <span
          className={`shrink-0 font-bold whitespace-nowrap ${isDark ? 'text-cyan-200/80 text-[11px]' : `text-slate-300 ${size === 'xs' ? 'text-[11px]' : 'text-xs'}`}`}
        >
          {label}
        </span>
      )}

      {/* Button Trigger */}
      <div className="relative flex-1 min-w-0 flex items-center">
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setIsOpen((prev) => !prev)}
          className={`w-full flex items-center justify-between gap-1.5 font-bold transition-all cursor-pointer ${
            isDark
              ? 'bg-transparent border-0 text-cyan-100 text-xs py-0.5 px-0.5 hover:text-white focus:outline-none'
              : `rounded-lg border backdrop-blur-md ${sizeClasses} bg-[#061824]/75 border-white/[0.14] text-white hover:border-cyan-400/65 focus:border-cyan-400`
          } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-center gap-1.5 truncate">
            <Building2
              className={`shrink-0 ${size === 'xs' && !isDark ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-cyan-400`}
            />
            <span className="truncate">{currentSelectedLabel}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {value && value !== allOptionValue && value.toLowerCase() !== 'all' && !hideClearButton && !disabled && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(allOptionValue);
                  setIsOpen(false);
                }}
                className="p-0.5 rounded-full hover:bg-cyan-500/20 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Reset to All Sales Centers"
              >
                <X className="w-3 h-3" />
              </span>
            )}
            <ChevronDown
              className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
                isOpen ? 'rotate-180' : ''
              } text-cyan-300`}
            />
          </div>
        </button>
      </div>

      {/* Portaled Fixed Dropdown Menu (escapes parent backdrop-filter / overflow clipping) */}
      {isOpen &&
        dropdownRect &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: dropdownRect.top,
              left: dropdownRect.left,
              width: dropdownRect.width,
              transform: dropdownRect.placement === 'top' ? 'translateY(-100%)' : undefined,
              zIndex: 9999
            }}
            className="rounded-xl shadow-[0_20px_56px_rgba(0,0,0,0.82)] border border-cyan-400/45 bg-[#071a27]/98 backdrop-blur-2xl text-slate-100 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-100"
          >
            {/* Search Box */}
            <div className="p-1.5 border-b border-cyan-500/20 bg-[#05121c] flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-cyan-400/80 shrink-0 ml-1" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className="w-full bg-transparent text-xs py-1 px-1 rounded-md focus:outline-none font-medium text-white placeholder-slate-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setSearchQuery('')}
                  className="p-1 hover:bg-white/10 rounded-md text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Options List */}
            <div
              ref={listContainerRef}
              style={{ maxHeight: `${dropdownRect.maxHeight}px` }}
              className="overflow-y-auto p-1 divide-y divide-cyan-500/10 text-xs overscroll-contain"
            >
              {/* All Sales Centers Option */}
              {showAllOption && (
                <button
                  type="button"
                  data-highlighted={highlightIndex === 0}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlightIndex(0)}
                  onClick={() => handleSelect(allOptionValue)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between transition-colors font-bold cursor-pointer ${
                    highlightIndex === 0 ? 'ring-1 ring-cyan-400 bg-[#0e2d42]' : ''
                  } ${
                    value === allOptionValue || value.toLowerCase() === 'all'
                      ? 'bg-cyan-500/20 text-cyan-200 font-extrabold'
                      : 'hover:bg-cyan-500/10 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                    <span>{allOptionLabel || `All Sales Centers (${normalizedOptions.length})`}</span>
                  </div>
                  {(value === allOptionValue || value.toLowerCase() === 'all') && (
                    <Check className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                  )}
                </button>
              )}

              {filteredList.length === 0 ? (
                <div className="p-3 text-center text-slate-400 text-xs font-medium">
                  No matching sales centers
                </div>
              ) : (
                filteredList.map((opt, optIdx) => {
                  const itemHighlightIdx = showAllOption ? optIdx + 1 : optIdx;
                  const isHighlighted = highlightIndex === itemHighlightIdx;
                  const optVal = opt.id || opt.name || opt.label || '';
                  const isSelected =
                    value === optVal ||
                    value === opt.name ||
                    (value && opt.id && value.toLowerCase() === opt.id.toLowerCase()) ||
                    (value && opt.name && value.toLowerCase() === opt.name.toLowerCase());

                  return (
                    <button
                      key={opt.id || opt.name || optIdx}
                      type="button"
                      data-highlighted={isHighlighted}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setHighlightIndex(itemHighlightIdx)}
                      onClick={() => handleSelect(optVal)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
                        isHighlighted ? 'ring-1 ring-cyan-400 bg-[#0e2d42]' : ''
                      } ${
                        isSelected
                          ? 'bg-cyan-500/20 text-cyan-200 font-bold'
                          : 'hover:bg-cyan-500/10 text-slate-200'
                      }`}
                    >
                      <div className="truncate pr-2">
                        <div className="font-bold truncate">{opt.label || opt.name}</div>
                        {opt.address && (
                          <div className="text-[10px] truncate text-slate-400">
                            {opt.address}
                          </div>
                        )}
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-cyan-300" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
export default SalesCenterSearchFilter;
