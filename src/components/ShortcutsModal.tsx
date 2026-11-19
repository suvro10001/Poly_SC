import React from 'react';
import { X, Keyboard, Command } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'âŒ˜ / Ctrl + S', action: 'Save current snippet changes' },
    { key: 'âŒ˜ / Ctrl + N', action: 'Open new snippet creator' },
    { key: 'Tab', action: 'Insert 2-space soft indentation in editor' },
    { key: '/', action: 'Focus quick search bar' },
    { key: 'Esc', action: 'Close active modal / popup' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md flex flex-col shadow-2xl animate-in zoom-in-95 duration-150 overflow-hidden">
        <div className="p-4 sm:px-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">
                Keyboard Shortcuts
              </h2>
              <p className="text-[11px] text-slate-400">
                Speed up your developer workflow
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-2.5">
          {shortcuts.map((s, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs"
            >
              <span className="text-slate-300 font-medium">{s.action}</span>
              <kbd className="px-2 py-1 rounded bg-slate-800 text-indigo-300 font-mono text-[11px] border border-slate-750 font-semibold">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
