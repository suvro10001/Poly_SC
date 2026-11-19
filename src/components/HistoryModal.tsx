import React from 'react';
import { X, RotateCcw, Clock, Check } from 'lucide-react';
import { Snippet, SnippetHistoryItem } from '../types';

interface HistoryModalProps {
  snippet: Snippet;
  isOpen: boolean;
  onClose: () => void;
  onRestoreRevision: (code: string) => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  snippet,
  isOpen,
  onClose,
  onRestoreRevision,
}) => {
  const [selectedItem, setSelectedItem] = React.useState<SnippetHistoryItem | null>(null);

  const history = snippet.history || [];

  React.useEffect(() => {
    if (history.length > 0) {
      setSelectedItem(history[history.length - 1]);
    }
  }, [snippet.id, history.length]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-[#0f172a] border border-slate-800 rounded-xl max-w-2xl w-full flex flex-col shadow-2xl max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white">Revision History</h3>
            <p className="text-xs text-slate-400">
              Browse previous snapshots of &ldquo;{snippet.title}&rdquo; and restore code
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden min-h-[350px]">
          {/* List of revisions */}
          <div className="w-64 border-r border-slate-800 bg-[#090d16] overflow-y-auto p-2 space-y-1">
            {history.length === 0 ? (
              <p className="text-xs text-slate-500 p-3 italic">
                No previous revisions recorded yet. Save changes to create revision checkpoints.
              </p>
            ) : (
              history.slice().reverse().map((item, idx) => {
                const isSelected = selectedItem?.id === item.id;
                const d = new Date(item.timestamp);
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={`w-full text-left p-2.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600/20 border border-indigo-500/40 text-white'
                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-slate-300 font-medium mb-1">
                      <Clock className="w-3 h-3 text-indigo-400 shrink-0" />
                      <span className="truncate">
                        {item.note || `Revision #${history.length - idx}`}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                      {d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Code preview & restore */}
          <div className="flex-1 flex flex-col bg-[#0b0f19] overflow-hidden">
            {selectedItem ? (
              <>
                <div className="p-3 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-mono tabular-nums">
                    {selectedItem.code.length} characters · {selectedItem.code.split('\n').length} lines
                  </span>
                  <button
                    onClick={() => {
                      onRestoreRevision(selectedItem.code);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restore This Code</span>
                  </button>
                </div>
                <div className="flex-1 p-3 overflow-y-auto font-mono text-xs text-slate-300 bg-[#05080f] whitespace-pre tab-4">
                  {selectedItem.code}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
                Select a revision to preview code
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
