import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Copy,
  Check,
  Download,
  Share2,
  Trash2,
  History,
  Sparkles,
  Save,
  Maximize2,
  Minimize2,
  Folder as FolderIcon,
  Tag,
  Eye,
  Code as CodeIcon,
  Columns,
} from 'lucide-react';
import { Folder, Snippet, SupportedLanguage, EditorTheme } from '../types';
import { LANGUAGES, getLanguageMeta } from '../data/languages';
import { Prism } from '../utils/prismSetup';
import { formatCodeSnippet, downloadSnippetCode } from '../utils/storage';

interface CodeEditorProps {
  snippet: Snippet;
  folders: Folder[];
  onUpdateSnippet: (updated: Snippet) => void;
  onDeleteSnippet: (id: string) => void;
  onRunCode: () => void;
  onOpenExportModal: () => void;
  onOpenHistoryModal: () => void;
  theme: EditorTheme;
  setTheme: (theme: EditorTheme) => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  snippet,
  folders,
  onUpdateSnippet,
  onDeleteSnippet,
  onRunCode,
  onOpenExportModal,
  onOpenHistoryModal,
  theme,
  setTheme,
}) => {
  const [copied, setCopied] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [editorMode, setEditorMode] = useState<'split' | 'edit' | 'preview'>('edit');
  const [tagInput, setTagInput] = useState('');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const meta = getLanguageMeta(snippet.language);

  // Line numbers calculation
  const lines = snippet.code.split('\n');
  const lineCount = lines.length;

  const handleCopy = () => {
    navigator.clipboard.writeText(snippet.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    // Record history snapshot if code changed
    const newHistory = [...(snippet.history || [])];
    if (newHistory.length === 0 || newHistory[newHistory.length - 1].code !== snippet.code) {
      newHistory.push({
        id: 'hist_' + Date.now(),
        timestamp: Date.now(),
        code: snippet.code,
        note: `Saved revision (${snippet.code.length} chars)`,
      });
    }

    onUpdateSnippet({
      ...snippet,
      updatedAt: Date.now(),
      history: newHistory,
    });

    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const handleFormat = () => {
    const formatted = formatCodeSnippet(snippet.code, snippet.language);
    onUpdateSnippet({
      ...snippet,
      code: formatted,
      updatedAt: Date.now(),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl + S to save
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
      return;
    }

    // Cmd/Ctrl + Enter to run
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
      onRunCode();
      return;
    }

    // Tab key indent handling
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const code = snippet.code;

      const updatedCode = code.substring(0, start) + '  ' + code.substring(end);
      onUpdateSnippet({ ...snippet, code: updatedCode });

      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const clean = tagInput.trim().replace(/^#/, '').toLowerCase();
      if (clean && !snippet.tags.includes(clean)) {
        onUpdateSnippet({
          ...snippet,
          tags: [...snippet.tags, clean],
          updatedAt: Date.now(),
        });
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onUpdateSnippet({
      ...snippet,
      tags: snippet.tags.filter((t) => t !== tagToRemove),
      updatedAt: Date.now(),
    });
  };

  // Safe syntax highlight rendering
  const highlightedCode = React.useMemo(() => {
    try {
      const grammar =
        Prism.languages[meta.prismGrammar] ||
        Prism.languages.clike ||
        Prism.languages.javascript;
      return Prism.highlight(snippet.code || '', grammar, meta.prismGrammar);
    } catch (err) {
      return snippet.code;
    }
  }, [snippet.code, meta.prismGrammar]);

  return (
    <div
      className={`flex-1 flex flex-col bg-[#0b0f19] h-[calc(100vh-57px)] overflow-hidden ${
        isFullScreen ? 'fixed inset-0 z-50 h-screen' : ''
      }`}
    >
      {/* Snippet Header Meta Controls */}
      <div className="p-4 border-b border-slate-800 bg-[#0d121f] shrink-0 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Title input */}
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={snippet.title}
              onChange={(e) =>
                onUpdateSnippet({ ...snippet, title: e.target.value, updatedAt: Date.now() })
              }
              placeholder="Snippet title (e.g. useDebounce Hook, Safe Bash Header)..."
              className="w-full bg-transparent text-base font-bold text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded px-1.5 py-0.5"
            />
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            <button
              onClick={handleSave}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer ${
                justSaved
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
              }`}
              title="Save changes (Ctrl/Cmd + S)"
            >
              {justSaved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              <span>{justSaved ? 'Saved' : 'Save Code'}</span>
            </button>

            <button
              onClick={onRunCode}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-700/40 transition-colors cursor-pointer"
              title="Run or preview this code (Ctrl/Cmd + Enter)"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Run</span>
            </button>

            <button
              onClick={handleFormat}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 transition-colors cursor-pointer"
              title="Format & clean code"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden lg:inline">Format</span>
            </button>

            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 transition-colors cursor-pointer"
              title="Copy code to clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              onClick={() => downloadSnippetCode(snippet, meta.extension)}
              className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title={`Download file (${meta.extension})`}
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onOpenExportModal}
              className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Export beautiful code image card (Ray.so / Carbon style)"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onOpenHistoryModal}
              className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Revision history"
            >
              <History className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title={isFullScreen ? 'Exit fullscreen' : 'Fullscreen editor'}
            >
              {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={() => onDeleteSnippet(snippet.id)}
              className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer ml-1"
              title="Delete snippet"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Description input */}
        <input
          type="text"
          value={snippet.description}
          onChange={(e) =>
            onUpdateSnippet({ ...snippet, description: e.target.value, updatedAt: Date.now() })
          }
          placeholder="Brief description or purpose of this code..."
          className="w-full bg-transparent text-xs text-slate-400 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 rounded px-1.5 py-0.5"
        />

        {/* Language, Folder & Tags metadata row */}
        <div className="flex items-center gap-3 flex-wrap text-xs text-slate-400 pt-1">
          {/* Language selector */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded px-2 py-1">
            <CodeIcon className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={snippet.language}
              onChange={(e) =>
                onUpdateSnippet({
                  ...snippet,
                  language: e.target.value as SupportedLanguage,
                  updatedAt: Date.now(),
                })
              }
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer font-medium"
            >
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id} className="bg-slate-900 text-slate-200">
                  {l.label} ({l.extension})
                </option>
              ))}
            </select>
          </div>

          {/* Folder selector */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded px-2 py-1">
            <FolderIcon className="w-3.5 h-3.5 text-amber-400" />
            <select
              value={snippet.folderId}
              onChange={(e) =>
                onUpdateSnippet({
                  ...snippet,
                  folderId: e.target.value,
                  updatedAt: Date.now(),
                })
              }
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="" className="bg-slate-900 text-slate-200">
                (Uncategorized)
              </option>
              {folders.map((f) => (
                <option key={f.id} value={f.id} className="bg-slate-900 text-slate-200">
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Editor Theme selector */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded px-2 py-1">
            <span className="text-[11px] text-slate-500">Theme:</span>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as EditorTheme)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="tokyo-night" className="bg-slate-900 text-slate-200">Tokyo Night</option>
              <option value="dracula" className="bg-slate-900 text-slate-200">Dracula</option>
              <option value="one-dark" className="bg-slate-900 text-slate-200">One Dark</option>
              <option value="nord" className="bg-slate-900 text-slate-200">Nord Slate</option>
              <option value="github-dark" className="bg-slate-900 text-slate-200">GitHub Dark</option>
              <option value="emerald" className="bg-slate-900 text-slate-200">Emerald</option>
            </select>
          </div>

          {/* View mode toggle: Edit, Highlighted Preview, Split */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5">
            <button
              onClick={() => setEditorMode('edit')}
              className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                editorMode === 'edit' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Editor mode"
            >
              <CodeIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setEditorMode('split')}
              className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                editorMode === 'split' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Split edit & syntax preview"
            >
              <Columns className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setEditorMode('preview')}
              className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                editorMode === 'preview' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Syntax highlighted view"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Tags list & Tag input */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Tag className="w-3.5 h-3.5 text-slate-500" />
            {snippet.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 text-[11px] text-slate-300 bg-slate-800/80 rounded px-1.5 py-0.5"
              >
                #{tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="hover:text-rose-400 cursor-pointer ml-0.5 text-slate-500"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              placeholder="+ add tag"
              className="bg-transparent text-[11px] text-slate-300 placeholder-slate-600 focus:outline-none w-20 px-1"
            />
          </div>
        </div>
      </div>

      {/* Editor Main Canvas with Line Numbers & Theme Styling */}
      <div className={`flex-1 flex overflow-hidden theme-${theme}`}>
        {/* EDIT ONLY or SPLIT VIEW */}
        {(editorMode === 'edit' || editorMode === 'split') && (
          <div
            className={`flex-1 flex relative overflow-hidden bg-[var(--editor-bg)] text-[var(--editor-text)] ${
              editorMode === 'split' ? 'border-r border-slate-800' : ''
            }`}
          >
            {/* Gutter / Line Numbers */}
            <div className="w-12 bg-[var(--editor-gutter)] text-slate-600 text-right pr-3 pt-3 select-none font-mono text-xs tabular-nums border-r border-slate-800/50 shrink-0">
              {Array.from({ length: Math.max(lineCount, 1) }, (_, i) => (
                <div key={i} className="leading-6 h-6">
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Editable Textarea */}
            <textarea
              ref={textareaRef}
              value={snippet.code}
              onChange={(e) =>
                onUpdateSnippet({
                  ...snippet,
                  code: e.target.value,
                  updatedAt: Date.now(),
                })
              }
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              placeholder="Paste or write your code here..."
              className="flex-1 bg-transparent text-[var(--editor-text)] font-mono text-xs leading-6 p-3 resize-none focus:outline-none selection:bg-indigo-500/30 overflow-y-auto whitespace-pre tab-4"
              style={{
                fontFamily: `'JetBrains Mono', monospace`,
                lineHeight: '1.5rem',
              }}
            />
          </div>
        )}

        {/* PREVIEW ONLY or SPLIT SYNTAX HIGHLIGHT VIEW */}
        {(editorMode === 'preview' || editorMode === 'split') && (
          <div className="flex-1 flex overflow-hidden bg-[var(--editor-bg)] relative">
            {/* Gutter / Line numbers for preview */}
            <div className="w-12 bg-[var(--editor-gutter)] text-slate-600 text-right pr-3 pt-3 select-none font-mono text-xs tabular-nums border-r border-slate-800/50 shrink-0">
              {Array.from({ length: Math.max(lineCount, 1) }, (_, i) => (
                <div key={i} className="leading-6 h-6">
                  {i + 1}
                </div>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-6">
              <pre className="!bg-transparent !p-0 !m-0 !font-mono text-xs leading-6 overflow-x-auto">
                <code
                  className={`language-${meta.prismGrammar}`}
                  dangerouslySetInnerHTML={{ __html: highlightedCode }}
                  style={{
                    fontFamily: `'JetBrains Mono', monospace`,
                    lineHeight: '1.5rem',
                  }}
                />
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Footer Status Bar */}
      <div className="px-4 py-2 bg-[#090d16] border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-mono tabular-nums select-none shrink-0">
        <div className="flex items-center gap-3">
          <span>{meta.label}</span>
          <span>·</span>
          <span>{lineCount} lines</span>
          <span>·</span>
          <span>{snippet.code.length} characters</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Shortcuts: ⌘S Save · ⌘Enter Run · Tab Indent</span>
        </div>
      </div>
    </div>
  );
};
