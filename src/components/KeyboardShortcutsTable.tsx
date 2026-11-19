import React, { useState, useMemo } from 'react';
import { KEYBOARD_SHORTCUTS, ShortcutItem } from '../data/shortcutsData';
import { Search, Keyboard, Sparkles, Filter, CheckCircle2, Command } from 'lucide-react';

interface KeyboardShortcutsTableProps {
  embedded?: boolean;
}

export const KeyboardShortcutsTable: React.FC<KeyboardShortcutsTableProps> = ({ embedded = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const isMac = useMemo(() => {
    if (typeof navigator !== 'undefined') {
      return /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    }
    return false;
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    KEYBOARD_SHORTCUTS.forEach((s) => set.add(s.category));
    return ['all', ...Array.from(set)];
  }, []);

  const filteredShortcuts = useMemo(() => {
    return KEYBOARD_SHORTCUTS.filter((item) => {
      const matchCat = selectedCategory === 'all' || item.category === selectedCategory;
      const q = searchTerm.trim().toLowerCase();
      if (!q) return matchCat;
      const matchText =
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.keys.some((k) => k.toLowerCase().includes(q)) ||
        (item.macKeys && item.macKeys.some((k) => k.toLowerCase().includes(q)));
      return matchCat && matchText;
    });
  }, [searchTerm, selectedCategory]);

  return (
    <div className={`space-y-4 ${embedded ? '' : 'p-4 bg-white'}`}>
      {/* Featured / Core Note */}
      <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 flex items-start space-x-3 shadow-xs">
        <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 mt-0.5 font-bold shadow-xs">
          <Command className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-900">
              Multi-Tab & Navigation Workflow
            </h3>
            <span className="px-2 py-0.5 bg-amber-500 text-slate-950 font-black text-[10px] rounded-full uppercase">
              Tip
            </span>
          </div>
          <p className="text-xs text-slate-700 mt-0.5 leading-relaxed">
            Clicking any menu opens in the <strong>SAME active tab</strong>. Hold <kbd className="px-1.5 py-0.5 bg-white text-slate-900 font-mono text-xs rounded border border-slate-300 font-bold shadow-xs">Ctrl</kbd> (or <kbd className="px-1.5 py-0.5 bg-white text-slate-900 font-mono text-xs rounded border border-slate-300 font-bold shadow-xs">⌘ Cmd</kbd> on Mac) while clicking any menu to open it in a <strong>NEW tab</strong>!
          </p>
        </div>
      </div>

      {/* Controls Bar: Search & Category Pills */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search shortcut by name, key, or action..."
            className="w-full bg-white border border-slate-300 text-slate-900 pl-9 pr-8 py-1.5 rounded-lg text-xs placeholder:text-slate-400 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-medium"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs p-0.5 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none text-xs">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {cat === 'all' ? 'All Shortcuts' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Shortcuts List / Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {filteredShortcuts.map((item) => {
          const keysToDisplay = isMac && item.macKeys ? item.macKeys : item.keys;

          return (
            <div
              key={item.id}
              className="bg-white hover:bg-slate-50/80 border border-slate-200 hover:border-slate-300 rounded-xl p-3 flex items-center justify-between gap-3 transition-all shadow-xs group"
            >
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {item.category}
                  </span>
                  {item.badge && (
                    <span className="px-1.5 py-0.2 bg-amber-100 text-amber-900 border border-amber-300 rounded text-[9px] font-bold uppercase">
                      {item.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold text-slate-800 mt-0.5 leading-snug group-hover:text-slate-950 transition-colors">
                  {item.description}
                </p>
              </div>

              {/* Key badges */}
              <div className="flex items-center space-x-1 shrink-0">
                {keysToDisplay.map((k, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && <span className="text-slate-400 font-mono text-xs">+</span>}
                    <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 text-slate-800 group-hover:border-amber-400 rounded text-xs font-bold font-mono shadow-xs whitespace-nowrap">
                      {k}
                    </kbd>
                  </React.Fragment>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {filteredShortcuts.length === 0 && (
        <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 text-slate-500 text-xs font-medium">
          No keyboard shortcuts found matching &ldquo;{searchTerm}&rdquo;.
        </div>
      )}
    </div>
  );
};
