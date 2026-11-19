import React, { useState, useEffect } from 'react';
import { Copy, Download, Check, Trash2 } from 'lucide-react';
import { soundManager } from '../utils/audio';

export const Scratchpad: React.FC = () => {
  const [scratchContent, setScratchContent] = useState(() => {
    return localStorage.getItem('one_scratchpad_content') || '';
  });
  const [dailyOneSentence, setDailyOneSentence] = useState(() => {
    return localStorage.getItem('one_sentence_journal') || '';
  });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    localStorage.setItem('one_scratchpad_content', scratchContent);
  }, [scratchContent]);

  useEffect(() => {
    localStorage.setItem('one_sentence_journal', dailyOneSentence);
  }, [dailyOneSentence]);

  const handleCopy = () => {
    soundManager.playClick();
    navigator.clipboard.writeText(scratchContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    soundManager.playClick();
    const blob = new Blob([scratchContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `one-scratchpad-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    if (window.confirm('Clear all scratchpad text?')) {
      setScratchContent('');
    }
  };

  const wordCount = scratchContent.trim() ? scratchContent.trim().split(/\s+/).length : 0;
  const charCount = scratchContent.length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-200/60 pb-4 dark:border-neutral-800/60">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Daily Scratchpad & Micro-Journal
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Offload intrusive thoughts immediately so your working memory stays 100% focused.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <span>Continuous Autosave</span>
          <span aria-hidden="true">·</span>
          <span>Local Storage Only</span>
        </div>
      </div>

      {/* 1-Sentence Daily Reflection */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            The 1-Sentence Journal
          </span>
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            Daily Reflection
          </span>
        </div>
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          What is the single most important lesson or win from today?
        </p>
        <input
          type="text"
          value={dailyOneSentence}
          onChange={(e) => setDailyOneSentence(e.target.value)}
          placeholder="Today I realized that finishing one hard thing beats starting five easy ones..."
          className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:bg-white focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-neutral-100"
        />
      </div>

      {/* Main Distraction Dump Pad */}
      <div className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 overflow-hidden flex flex-col">
        {/* Editor Toolbar */}
        <div className="flex items-center justify-between border-b border-neutral-200/80 px-4 py-2.5 bg-neutral-50/50 dark:border-neutral-800/80 dark:bg-neutral-900/50">
          <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <span className="tabular-nums font-mono">{wordCount} words</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums font-mono">{charCount} chars</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              title="Copy all notes"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              title="Download Markdown"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export .md</span>
            </button>
            <button
              onClick={handleClear}
              className="p-1 text-neutral-400 hover:text-rose-600 dark:text-neutral-500 dark:hover:text-rose-400 rounded-md transition-colors"
              title="Clear scratchpad"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Textarea */}
        <textarea
          value={scratchContent}
          onChange={(e) => setScratchContent(e.target.value)}
          placeholder="Dump thoughts, URLs, snippets, or fleeting ideas here. Don't let them derail your #1 active task..."
          rows={14}
          className="w-full resize-y bg-transparent p-4 text-sm leading-relaxed text-neutral-900 placeholder:text-neutral-400 focus:outline-hidden dark:text-neutral-100 dark:placeholder:text-neutral-500 font-mono"
        />
      </div>
    </div>
  );
};
