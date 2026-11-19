import React, { useState, useEffect, useRef, useMemo } from 'react';

interface SearchableDropdownProps {
  value: string;
  onChange: (val: string) => void;
  onSelect?: (val: string) => void;
  options: string[];
  customerData?: any[];
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  inputRef?: React.RefObject<HTMLInputElement>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

const SearchableDropdown: React.FC<SearchableDropdownProps> = ({ 
  value, onChange, onSelect, options, customerData, placeholder, className = '', inputClassName = '', inputRef, onKeyDown
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => { 
    if (value !== search) {
      setSearch(value); 
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => 
    options.filter(opt => opt.toLowerCase().includes((search || '').toLowerCase())),
    [options, search]
  );

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [search, isOpen]);

  const selectOption = (opt: string) => {
    onChange(opt); 
    setSearch(opt); 
    setIsOpen(false); 
    if (onSelect) onSelect(opt);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIsOpen(true);
      setHighlightedIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        e.preventDefault();
        selectOption(filteredOptions[highlightedIndex]);
      } else {
        setIsOpen(false);
        if (onKeyDown) onKeyDown(e);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    } else {
      if (onKeyDown) onKeyDown(e);
    }
  };

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <input
        ref={inputRef} type="text" value={search} onFocus={() => setIsOpen(true)}
        onChange={(e) => { 
          const val = e.target.value; 
          setSearch(val); 
          onChange(val); 
          setIsOpen(true); 
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`w-full outline-none transition-all ${inputClassName}`}
      />
      {isOpen && filteredOptions.length > 0 && (
        <ul 
          ref={listRef}
          className="absolute z-[200] w-full mt-1 bg-white border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] max-h-60 overflow-auto"
        >
          {filteredOptions.map((opt, idx) => (
            <li 
              key={idx} 
              onClick={() => selectOption(opt)}
              className={`py-3 px-4 cursor-pointer border-b border-slate-100 last:border-0 ${highlightedIndex === idx ? 'bg-blue-600 text-white' : 'hover:bg-blue-50 text-slate-800'}`}
            >
              {opt.includes(' | ') ? (
                <div className="flex flex-col gap-0.5">
                  <span className={`text-lg font-bold uppercase tracking-tight leading-tight ${highlightedIndex === idx ? 'text-white' : 'text-slate-900'}`}>
                    {opt.split(' | ')[0]}
                  </span>
                  {opt.split(' | ')[1] && (
                    <span className={`text-[11px] font-normal uppercase ${highlightedIndex === idx ? 'text-white/80' : 'text-slate-600'}`}>
                      {opt.split(' | ')[1]}
                    </span>
                  )}
                  {opt.split(' | ')[2] && (
                    <span className={`text-[9px] font-medium uppercase tracking-wider ${highlightedIndex === idx ? 'text-white/60' : 'text-slate-400'}`}>
                      {opt.split(' | ')[2]}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-[11px] font-black uppercase">{opt}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SearchableDropdown;
