import React, { useState, useEffect } from 'react';
import {
  Play,
  RotateCcw,
  X,
  AlertCircle,
  CheckCircle2,
  Table as TableIcon,
  Globe,
  Terminal,
} from 'lucide-react';
import { Snippet } from '../types';
import {
  executeJavaScriptSnippet,
  executeSqlSnippet,
  validateJsonCode,
  RunnerResult,
  SqlQueryResult,
} from '../utils/codeRunner';

interface CodeRunnerPanelProps {
  snippet: Snippet;
  isOpen: boolean;
  onClose: () => void;
}

export const CodeRunnerPanel: React.FC<CodeRunnerPanelProps> = ({
  snippet,
  isOpen,
  onClose,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [jsResult, setJsResult] = useState<RunnerResult | null>(null);
  const [sqlResult, setSqlResult] = useState<SqlQueryResult | null>(null);
  const [jsonResult, setJsonResult] = useState<{ valid: boolean; formatted?: string; error?: string } | null>(null);
  const [htmlSrcDoc, setHtmlSrcDoc] = useState('');

  // Handle execution based on language
  const handleExecute = async () => {
    setIsRunning(true);
    try {
      if (snippet.language === 'javascript' || snippet.language === 'typescript') {
        const res = await executeJavaScriptSnippet(
          snippet.code,
          snippet.language === 'typescript'
        );
        setJsResult(res);
      } else if (snippet.language === 'sql') {
        const res = executeSqlSnippet(snippet.code);
        setSqlResult(res);
      } else if (snippet.language === 'json') {
        const res = validateJsonCode(snippet.code);
        setJsonResult(res);
      } else if (snippet.language === 'html') {
        setHtmlSrcDoc(snippet.code);
      }
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      handleExecute();
    }
  }, [isOpen, snippet.id]);

  if (!isOpen) return null;

  return (
    <div className="w-96 border-l border-slate-800 bg-[#090d16] flex flex-col shrink-0 h-[calc(100vh-57px)] select-none">
      {/* Drawer Header */}
      <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-[#0d121f]">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-bold text-white">Interactive Sandbox</h3>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleExecute}
            disabled={isRunning}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors cursor-pointer"
            title="Re-run code"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>{isRunning ? 'Running...' : 'Run'}</span>
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close runner panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Execution Results View */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* JAVASCRIPT / TYPESCRIPT RUNNER */}
        {(snippet.language === 'javascript' || snippet.language === 'typescript') && (
          <div className="space-y-3">
            {jsResult && (
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums pb-2 border-b border-slate-800/80">
                <span className="flex items-center gap-1.5">
                  {jsResult.error ? (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span>{jsResult.error ? 'Runtime Error' : 'Execution Finished'}</span>
                </span>
                <span>{jsResult.executionTimeMs} ms</span>
              </div>
            )}

            {/* Logs console */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Console Output
              </span>
              <div className="bg-[#05080f] border border-slate-800 rounded-lg p-3 font-mono text-xs space-y-2 min-h-[140px] max-h-[360px] overflow-y-auto">
                {(!jsResult || jsResult.logs.length === 0) && (
                  <p className="text-slate-600 italic">No output logged to console.</p>
                )}
                {jsResult?.logs.map((log, idx) => (
                  <div
                    key={idx}
                    className={`leading-relaxed whitespace-pre-wrap ${
                      log.type === 'error'
                        ? 'text-rose-400'
                        : log.type === 'warn'
                        ? 'text-amber-400'
                        : log.type === 'info'
                        ? 'text-sky-400'
                        : 'text-slate-300'
                    }`}
                  >
                    <span className="text-slate-600 select-none mr-2">[{log.timestamp}]</span>
                    {log.messages.join(' ')}
                  </div>
                ))}
              </div>
            </div>

            {/* Return value if any */}
            {jsResult?.returnValue !== undefined && (
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Return Value
                </span>
                <div className="bg-[#05080f] border border-slate-800 rounded-lg p-2.5 font-mono text-xs text-indigo-300 overflow-x-auto">
                  {jsResult.returnValue}
                </div>
              </div>
            )}
          </div>
        )}

        {/* HTML / WEB SANDBOX PREVIEW */}
        {snippet.language === 'html' && (
          <div className="space-y-3 h-full flex flex-col">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-indigo-400" />
                <span>Live Web Sandbox</span>
              </span>
              <button
                onClick={() => setHtmlSrcDoc(snippet.code)}
                className="text-xs text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" /> Reload
              </button>
            </div>
            <div className="flex-1 bg-white rounded-lg overflow-hidden border border-slate-800 min-h-[360px]">
              <iframe
                title="PolyCode Preview"
                srcDoc={htmlSrcDoc || snippet.code}
                sandbox="allow-scripts"
                className="w-full h-full border-none min-h-[360px]"
              />
            </div>
          </div>
        )}

        {/* SQL QUERY EXECUTOR */}
        {snippet.language === 'sql' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800/80">
              <span className="flex items-center gap-1.5">
                <TableIcon className="w-3.5 h-3.5 text-indigo-400" />
                <span>In-Memory SQL Result</span>
              </span>
              <span className="font-mono tabular-nums">{sqlResult?.rowCount || 0} rows</span>
            </div>

            {sqlResult?.message && (
              <p className="text-[11px] text-slate-400 leading-normal">{sqlResult.message}</p>
            )}

            {sqlResult && (
              <div className="border border-slate-800 rounded-lg overflow-hidden overflow-x-auto bg-[#05080f]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/90 text-slate-300 font-semibold border-b border-slate-800">
                    <tr>
                      {sqlResult.columns.map((col) => (
                        <th key={col} className="px-3 py-2 text-[11px] font-mono whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px] tabular-nums">
                    {sqlResult.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-800/40">
                        {sqlResult.columns.map((col) => (
                          <td key={col} className="px-3 py-1.5 text-slate-300 whitespace-nowrap">
                            {String(row[col] ?? 'NULL')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* JSON VALIDATOR */}
        {snippet.language === 'json' && (
          <div className="space-y-3">
            {jsonResult && (
              <div
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium ${
                  jsonResult.valid
                    ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-800/50 text-rose-300'
                }`}
              >
                {jsonResult.valid ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Valid JSON payload format</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{jsonResult.error}</span>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* OTHER LANGUAGES (Python, Rust, Go, Bash, CSS, Markdown) */}
        {!['javascript', 'typescript', 'html', 'sql', 'json'].includes(snippet.language) && (
          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-lg text-xs space-y-2">
            <p className="text-slate-300 font-medium">Syntax Inspection & Diagnostics</p>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              This snippet is formatted in {snippet.language.toUpperCase()}. You can edit, save, version, copy, download as <code className="text-indigo-300">.{snippet.language}</code>, or export as a visual card.
            </p>
            <div className="pt-2 text-[11px] text-slate-500 font-mono">
              Tokens validated via PolyCode Prism engine.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
