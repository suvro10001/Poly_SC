import React, { useState, useEffect } from 'react';
import { Search, Code2, Plus, Download, Upload, Star, Terminal } from 'lucide-react';
import { Snippet } from '../types';
import { getLanguageMeta } from '../data/languages';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  snippets: Snippet[];
  onSelectSnippet: (id: string) => void;
  onNewSnippet: () => void;
  onExportVault: () => void;
  onImportVault: () => void;
  onOpenSandbox: () => void;
  onShowFavorites: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  snippets,
  onSelectSnippet,
  onNewSnippet,
  onExportVault,
  onImportVault,
  onOpenSandbox,
  onShowFavorites,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      setQuery('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredSnippets = snippets
    .filter(
      (s) =>
        s.title.toLowerCase().includes(query.toLowerCase()) ||
        s.language.toLowerCase().includes(query.toLowerCase()) ||
        s.tags.some((t) => t.toLowerCase().includes(query.toLowerCase())) ||
        s.code.toLowerCase().includes(query.toLowerCase())
    )
    .slice(0, 6);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0f172a] border border-slate-700 rounded-xl max-w-xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
        {/* Search Input */}
        <div className="flex items-center px-4 py-3 border-b border-slate-800 gap-3">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a snippet title, language, or command..."
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          <kbd className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
            ESC
          </kbd>
        </div>

        {/* Action Shortcuts */}
        <div className="p-2 border-b border-slate-800/80 bg-slate-900/40">
          <div className="text-[10px] font-semibold text-slate-500 uppercase px-2 py-1">
            Quick Actions
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => {
                onNewSnippet();
                onClose();
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-slate-300 hover:text-white hover:bg-slate-800 text-left cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-400" />
              <span>Save New Snippet</span>
            </button>
            <button
              onClick={() => {
                onOpenSandbox();
                onClose();
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-slate-300 hover:text-white hover:bg-slate-800 text-left cursor-pointer transition-colors"
            >
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span>Open Live Sandbox</span>
            </button>
            <button
              onClick={() => {
                onShowFavorites();
                onClose();
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-slate-300 hover:text-white hover:bg-slate-800 text-left cursor-pointer transition-colors"
            >
              <Star className="w-3.5 h-3.5 text-amber-400" />
              <span>View Favorites</span>
            </button>
            <button
              onClick={() => {
                onExportVault();
                onClose();
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-slate-300 hover:text-white hover:bg-slate-800 text-left cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>Export Vault Backup</span>
            </button>
          </div>
        </div>

        {/* Snippets Result List */}
        <div className="p-2 max-h-72 overflow-y-auto">
          <div className="text-[10px] font-semibold text-slate-500 uppercase px-2 py-1">
            Snippets ({filteredSnippets.length})
          </div>
          {filteredSnippets.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500">No matching snippets found</div>
          ) : (
            filteredSnippets.map((snip) => {
              const meta = getLanguageMeta(snip.language);
              return (
                <button
                  key={snip.id}
                  onClick={() => {
                    onSelectSnippet(snip.id);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-slate-800 text-left cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Code2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="truncate font-medium">{snip.title}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 font-mono text-[11px] text-slate-500">
                    <span>{meta.label}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
