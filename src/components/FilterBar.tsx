import React from 'react';
import { FilterCategory, QuickSaveItem } from '../types';
import { Pin, Link, Code2, CheckSquare, FileText, LayoutGrid, ArrowUpDown } from 'lucide-react';

interface FilterBarProps {
  activeCategory: FilterCategory;
  onSelectCategory: (category: FilterCategory) => void;
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  allTags: { name: string; count: number }[];
  itemCounts: {
    all: number;
    pinned: number;
    links: number;
    code: number;
    todos: number;
    notes: number;
  };
  sortOrder: 'newest' | 'oldest';
  onToggleSort: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  activeCategory,
  onSelectCategory,
  selectedTag,
  onSelectTag,
  allTags,
  itemCounts,
  sortOrder,
  onToggleSort,
}) => {
  const categories: { id: FilterCategory; label: string; icon: React.ReactNode; count: number }[] = [
    { id: 'all', label: 'All Items', icon: <LayoutGrid className="w-3.5 h-3.5" />, count: itemCounts.all },
    { id: 'pinned', label: 'Pinned', icon: <Pin className="w-3.5 h-3.5" />, count: itemCounts.pinned },
    { id: 'links', label: 'Links', icon: <Link className="w-3.5 h-3.5" />, count: itemCounts.links },
    { id: 'code', label: 'Code', icon: <Code2 className="w-3.5 h-3.5" />, count: itemCounts.code },
    { id: 'todos', label: 'Tasks', icon: <CheckSquare className="w-3.5 h-3.5" />, count: itemCounts.todos },
    { id: 'notes', label: 'Notes', icon: <FileText className="w-3.5 h-3.5" />, count: itemCounts.notes },
  ];

  return (
    <div className="space-y-2.5">
      {/* Primary Category Pills & Sort Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          {categories.map((cat) => {
            const isActive = activeCategory === cat.id && !selectedTag;
            return (
              <button
                key={cat.id}
                id={`filter-${cat.id}`}
                onClick={() => {
                  onSelectCategory(cat.id);
                  onSelectTag(null);
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50 hover:text-stone-900'
                }`}
              >
                {cat.icon}
                <span>{cat.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive ? 'bg-stone-800 text-stone-300' : 'bg-stone-100 text-stone-500'
                  }`}
                >
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Sort toggle */}
        <button
          id="sort-toggle-button"
          onClick={onToggleSort}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-stone-600 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 hover:text-stone-900 transition-colors"
          title="Toggle sort order"
        >
          <ArrowUpDown className="w-3.5 h-3.5 text-stone-400" />
          <span>{sortOrder === 'newest' ? 'Newest first' : 'Oldest first'}</span>
        </button>
      </div>

      {/* Tag pills (if tags exist) */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mr-1">
            Tags:
          </span>
          {allTags.map(({ name, count }) => {
            const isTagActive = selectedTag === name;
            return (
              <button
                key={name}
                id={`tag-filter-${name}`}
                onClick={() => onSelectTag(isTagActive ? null : name)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors ${
                  isTagActive
                    ? 'bg-amber-600 text-white font-medium shadow-xs'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200/80 border border-stone-200/60'
                }`}
              >
                <span>#{name}</span>
                <span
                  className={`text-[10px] ${isTagActive ? 'text-amber-200' : 'text-stone-400'}`}
                >
                  {count}
                </span>
              </button>
            );
          })}
          {selectedTag && (
            <button
              onClick={() => onSelectTag(null)}
              className="text-xs text-amber-700 hover:underline font-medium ml-1"
            >
              Clear tag filter
            </button>
          )}
        </div>
      )}
    </div>
  );
};
