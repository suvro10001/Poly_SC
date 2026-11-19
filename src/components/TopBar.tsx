import React from 'react';
import { Bookmark, Plus, Terminal } from 'lucide-react';

interface TopBarProps {
  activeTab: 'vault' | 'starred' | 'sandbox' | 'docs';
  setActiveTab: (tab: 'vault' | 'starred' | 'sandbox' | 'docs') => void;
  onNewSnippet: () => void;
  snippetCount: number;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  setActiveTab,
  onNewSnippet,
  snippetCount,
}) => {
  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800 bg-[#0d121f]/95 backdrop-blur-md sticky top-0 z-30">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('vault');
          }}
          className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 hover:text-indigo-400 transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Terminal className="w-4 h-4" />
          </div>
          <span>PolyCode</span>
        </a>
        <span className="text-xs text-slate-500 hidden sm:inline-block tabular-nums font-mono">
          · {snippetCount} snippets
        </span>
      </div>

      {/* Zone 2: 4 clean single-line text navigation links */}
      <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
        <button
          onClick={() => setActiveTab('vault')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'vault' ? 'text-indigo-400 font-semibold' : ''
          }`}
        >
          Snippet Vault
        </button>
        <button
          onClick={() => setActiveTab('starred')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'starred' ? 'text-indigo-400 font-semibold' : ''
          }`}
        >
          Favorites
        </button>
        <button
          onClick={() => setActiveTab('sandbox')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'sandbox' ? 'text-indigo-400 font-semibold' : ''
          }`}
        >
          Live Sandbox
        </button>
        <button
          onClick={() => setActiveTab('docs')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'docs' ? 'text-indigo-400 font-semibold' : ''
          }`}
        >
          Cheatsheets
        </button>
      </nav>

      {/* Zone 3: 1 primary action */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onNewSnippet}
          className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0 shadow-sm cursor-pointer"
          title="Save new code snippet (Ctrl/Cmd + N)"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Save Code</span>
        </button>
      </div>
    </header>
  );
};
