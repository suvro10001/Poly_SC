import React, { useState, useRef } from 'react';
import { X, Copy, Check, Download } from 'lucide-react';
import { Snippet } from '../types';
import { getLanguageMeta } from '../data/languages';
import { Prism } from '../utils/prismSetup';

interface CarbonExportModalProps {
  snippet: Snippet;
  isOpen: boolean;
  onClose: () => void;
}

const GRADIENTS = [
  { id: 'indigo', name: 'Cosmic Indigo', class: 'from-indigo-600 via-purple-600 to-pink-600' },
  { id: 'emerald', name: 'Aurora Emerald', class: 'from-emerald-500 via-teal-600 to-cyan-700' },
  { id: 'sunset', name: 'Sunset Amber', class: 'from-amber-500 via-rose-500 to-purple-600' },
  { id: 'slate', name: 'Minimal Slate', class: 'from-slate-800 via-slate-900 to-black' },
  { id: 'carbon', name: 'Carbon Pure', class: 'from-neutral-900 via-neutral-950 to-black' },
];

export const CarbonExportModal: React.FC<CarbonExportModalProps> = ({
  snippet,
  isOpen,
  onClose,
}) => {
  const [selectedGradient, setSelectedGradient] = useState(GRADIENTS[0]);
  const [padding, setPadding] = useState<'16' | '32' | '48'>('32');
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const meta = getLanguageMeta(snippet.language);

  const highlightedCode = React.useMemo(() => {
    try {
      const grammar =
        Prism.languages[meta.prismGrammar] ||
        Prism.languages.clike ||
        Prism.languages.javascript;
      return Prism.highlight(snippet.code || '', grammar, meta.prismGrammar);
    } catch {
      return snippet.code;
    }
  }, [snippet.code, meta.prismGrammar]);

  if (!isOpen) return null;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(snippet.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadHtml = () => {
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${snippet.title}</title>
<style>
  body { margin: 0; background: #0b0f19; display: grid; place-items: center; min-height: 100vh; font-family: sans-serif; }
  .card-wrap { padding: ${padding}px; border-radius: 20px; background: linear-gradient(135deg, #4f46e5, #9333ea, #db2777); }
  .window { background: #0f172a; border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7); overflow: hidden; max-width: 800px; }
  .titlebar { display: flex; align-items: center; padding: 12px 16px; background: #1e293b; gap: 8px; }
  .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
  .dot-red { background: #ff5f56; }
  .dot-yellow { background: #ffbd2e; }
  .dot-green { background: #27c93f; }
  .title { color: #94a3b8; font-size: 12px; margin-left: 8px; font-family: monospace; }
  pre { padding: 20px; margin: 0; color: #f8fafc; font-family: monospace; font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
</style>
</head>
<body>
  <div class="card-wrap">
    <div class="window">
      <div class="titlebar">
        <span class="dot dot-red"></span>
        <span class="dot dot-yellow"></span>
        <span class="dot dot-green"></span>
        <span class="title">${snippet.title || 'snippet'}${meta.extension}</span>
      </div>
      <pre><code>${snippet.code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${snippet.title || 'snippet'}-card.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-[#0f172a] border border-slate-800 rounded-xl max-w-3xl w-full flex flex-col shadow-2xl max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white">Shareable Code Card</h3>
            <p className="text-xs text-slate-400">Ray.so / Carbon inspired visual export</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Customization Toolbar */}
        <div className="p-3 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between gap-4 flex-wrap text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Theme:</span>
            <div className="flex items-center gap-1.5">
              {GRADIENTS.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setSelectedGradient(g)}
                  className={`w-5 h-5 rounded-full bg-gradient-to-tr ${g.class} border-2 cursor-pointer transition-all ${
                    selectedGradient.id === g.id
                      ? 'border-white scale-110 shadow-sm'
                      : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                  title={g.name}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">Padding:</span>
            {(['16', '32', '48'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPadding(p)}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  padding === p
                    ? 'bg-slate-700 text-white font-medium'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {p}px
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded cursor-pointer transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Code'}</span>
            </button>
            <button
              onClick={handleDownloadHtml}
              className="flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Card</span>
            </button>
          </div>
        </div>

        {/* Live Card Preview Area */}
        <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center bg-[#070b13]">
          <div
            ref={cardRef}
            className={`rounded-2xl bg-gradient-to-br ${selectedGradient.class} transition-all max-w-full shadow-2xl`}
            style={{ padding: `${padding}px` }}
          >
            {/* Window Container */}
            <div className="bg-[#0f172a] rounded-xl overflow-hidden shadow-2xl border border-white/10 min-w-[320px] max-w-[620px]">
              {/* Traffic Light Bar */}
              <div className="flex items-center px-4 py-3 bg-[#1e293b]/80 border-b border-white/5 gap-2">
                <span className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                <span className="w-3 h-3 rounded-full bg-[#27c93f]" />
                <span className="ml-2 text-xs font-mono text-slate-400 truncate">
                  {snippet.title || 'snippet'}{meta.extension}
                </span>
              </div>

              {/* Code Pre Area */}
              <div className="p-4 overflow-x-auto max-h-[380px]">
                <pre className="!bg-transparent !p-0 !m-0 font-mono text-xs leading-5">
                  <code
                    className={`language-${meta.prismGrammar}`}
                    dangerouslySetInnerHTML={{ __html: highlightedCode }}
                  />
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
