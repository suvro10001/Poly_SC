import React, { useState } from 'react';
import { X, FolderPlus } from 'lucide-react';
import { Folder } from '../types';

interface FolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateFolder: (folder: Folder) => void;
}

const COLORS = [
  '#6366f1', // Indigo
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#8b5cf6', // Purple
  '#f97316', // Orange
  '#64748b', // Slate
];

export const FolderModal: React.FC<FolderModalProps> = ({
  isOpen,
  onClose,
  onCreateFolder,
}) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onCreateFolder({
      id: 'folder_' + Date.now(),
      name: name.trim(),
      color,
    });
    setName('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-[#0f172a] border border-slate-800 rounded-xl max-w-sm w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderPlus className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white">New Folder</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Folder Name
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Microservices, CSS Tricks, React Hooks..."
              className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Accent Color
            </label>
            <div className="flex items-center gap-2">
              {COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                    color === c ? 'border-white scale-110' : 'border-transparent opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded text-xs font-semibold transition-colors cursor-pointer"
            >
              Create Folder
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
