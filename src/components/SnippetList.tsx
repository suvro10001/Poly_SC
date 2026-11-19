import React from 'react';
import { Search, Star, ArrowUpDown, Code2, Plus } from 'lucide-react';
import { Snippet } from '../types';
import { getLanguageMeta } from '../data/languages';

interface SnippetListProps {
  snippets: Snippet[];
  selectedSnippetId: string | null;
  onSelectSnippet: (id: string) => void;
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sortBy: 'updated' | 'created' | 'title';
  setSortBy: (sort: 'updated' | 'created' | 'title') => void;
  onNewSnippet: () => void;
}

export const SnippetList: React.FC<SnippetListProps> = ({
  snippets,
  selectedSnippetId,
  onSelectSnippet,
  onToggleFavorite,
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
  onNewSnippet,
}) => {
  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="w-80 border-r border-slate-800 bg-[#0b0f19] flex flex-col shrink-0 h-[calc(100vh-57px)] select-none">
      {/* Search Header */}
      <div className="p-3 border-b border-slate-800/80 space-y-2.5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search code, tags, language..."
            className="w-full bg-slate-900/90 border border-slate-800 rounded-md pl-8 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs cursor-pointer"
            >
              ×
            </button>
          )}
        </div>

        {/* Sort & Count row */}
        <div className="flex items-center justify-between text-xs text-slate-400 px-0.5">
          <span className="font-mono tabular-nums text-[11px] text-slate-500">
            {snippets.length} {snippets.length === 1 ? 'snippet' : 'snippets'}
          </span>
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-3 h-3 text-slate-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'updated' | 'created' | 'title')}
              className="bg-transparent text-[11px] text-slate-400 hover:text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="updated" className="bg-slate-900 text-slate-200">
                Recently Updated
              </option>
              <option value="created" className="bg-slate-900 text-slate-200">
                Date Created
              </option>
              <option value="title" className="bg-slate-900 text-slate-200">
                Alphabetical
              </option>
            </select>
          </div>
        </div>
      </div>

      {/* Snippets List View */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
        {snippets.length === 0 ? (
          <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center h-full">
            <Code2 className="w-8 h-8 mb-3 opacity-30 text-indigo-400" />
            <p className="text-xs font-medium text-slate-400 mb-1">No snippets found</p>
            <p className="text-[11px] text-slate-500 mb-4 max-w-[200px]">
              {searchQuery ? 'Try clearing your search filters' : 'Save your first code snippet into the vault'}
            </p>
            <button
              onClick={onNewSnippet}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Snippet</span>
            </button>
          </div>
        ) : (
          snippets.map((snip) => {
            const isSelected = selectedSnippetId === snip.id;
            const meta = getLanguageMeta(snip.language);

            return (
              <div
                key={snip.id}
                onClick={() => onSelectSnippet(snip.id)}
                className={`p-3 text-left transition-colors cursor-pointer group relative ${
                  isSelected
                    ? 'bg-slate-800/90 text-white'
                    : 'text-slate-300 hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4
                    className={`text-xs font-semibold leading-snug line-clamp-1 ${
                      isSelected ? 'text-white' : 'text-slate-200 group-hover:text-white'
                    }`}
                  >
                    {snip.title || 'Untitled Snippet'}
                  </h4>
                  <button
                    onClick={(e) => onToggleFavorite(snip.id, e)}
                    className={`shrink-0 p-0.5 rounded transition-colors ${
                      snip.isFavorite
                        ? 'text-amber-400 hover:text-amber-300'
                        : 'text-slate-600 hover:text-slate-400 opacity-0 group-hover:opacity-100'
                    }`}
                    title={snip.isFavorite ? 'Remove from favorites' : 'Mark as favorite'}
                  >
                    <Star className="w-3.5 h-3.5 fill-current" />
                  </button>
                </div>

                {snip.description && (
                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mb-2">
                    {snip.description}
                  </p>
                )}

                {/* Zero-Pill Rule Compliant Metadata: clean unboxed text with typographic separators */}
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono tabular-nums">
                  <span className="font-sans font-medium text-indigo-400/90">{meta.label}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatDate(snip.updatedAt || snip.createdAt)}</span>
                  {snip.tags && snip.tags.length > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="truncate max-w-[100px] text-slate-400">
                        #{snip.tags[0]}
                        {snip.tags.length > 1 ? ` +${snip.tags.length - 1}` : ''}
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
