import React from 'react';
import { Play, RotateCcw, Home, Settings as SettingsIcon } from 'lucide-react';

interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onOpenSettings: () => void;
  onExitToMenu: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  onResume,
  onRestart,
  onOpenSettings,
  onExitToMenu,
}) => {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md pointer-events-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-150">
        <h2 className="text-2xl font-bold text-white font-mono mb-1">Paused</h2>
        <p className="text-xs text-slate-400 mb-6">Flight suspended</p>

        <div className="flex flex-col gap-3 w-full">
          <button
            onClick={onResume}
            className="w-full py-3.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Resume</span>
          </button>

          <button
            onClick={onRestart}
            className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Restart Run</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <SettingsIcon className="w-4 h-4" />
            <span>Settings</span>
          </button>

          <button
            onClick={onExitToMenu}
            className="w-full py-3 rounded-xl bg-slate-950/60 hover:bg-slate-800 text-slate-400 hover:text-white font-medium text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>Exit to Menu</span>
          </button>
        </div>
      </div>
    </div>
  );
};
