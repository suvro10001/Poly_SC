import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { RotateCcw, Home, Sparkles, Trophy } from 'lucide-react';
import { PlayerStats } from '../types/game';

interface GameOverModalProps {
  stats: PlayerStats;
  isNewHighScore: boolean;
  onRestart: () => void;
  onBackToMenu: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  stats,
  isNewHighScore,
  onRestart,
  onBackToMenu,
}) => {
  useEffect(() => {
    if (isNewHighScore) {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#06b6d4', '#f59e0b', '#ec4899', '#10b981'],
      });
    }
  }, [isNewHighScore]);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md pointer-events-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200">
        {/* Header Badge */}
        {isNewHighScore ? (
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold uppercase tracking-wider mb-3">
            <Trophy className="w-4 h-4" />
            <span>New High Score!</span>
          </div>
        ) : (
          <div className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-2">
            Run Concluded
          </div>
        )}

        <h2 className="text-3xl font-black text-white font-mono tracking-tight mb-1">
          {stats.score.toLocaleString()}
        </h2>
        <div className="text-xs text-slate-400 mb-6">Final Score</div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 w-full mb-6">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 text-left">
            <div className="text-[11px] font-medium text-slate-400 uppercase">Distance</div>
            <div className="text-xl font-bold text-white font-mono tabular-nums">
              {stats.distance} <span className="text-xs text-slate-400 font-normal">m</span>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 text-left">
            <div className="text-[11px] font-medium text-slate-400 uppercase">Shards Collected</div>
            <div className="text-xl font-bold text-amber-300 font-mono tabular-nums flex items-center gap-1.5">
              <span>+{stats.crystals}</span>
              <div className="w-2.5 h-2.5 rotate-45 bg-amber-400 rounded-2xs inline-block" />
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 text-left">
            <div className="text-[11px] font-medium text-slate-400 uppercase">Max Velocity</div>
            <div className="text-xl font-bold text-cyan-400 font-mono tabular-nums">
              {stats.speedKmh} <span className="text-xs text-cyan-500/80 font-normal">km/h</span>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 text-left">
            <div className="text-[11px] font-medium text-slate-400 uppercase">Near Misses</div>
            <div className="text-xl font-bold text-emerald-400 font-mono tabular-nums">
              {stats.nearMisses}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 w-full">
          <button
            onClick={onRestart}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            <RotateCcw className="w-5 h-5" />
            <span>RUN AGAIN</span>
          </button>

          <button
            onClick={onBackToMenu}
            className="w-full py-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-200 font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>Main Menu</span>
          </button>
        </div>

        <div className="text-[11px] text-slate-500 mt-4 font-mono">
          Press Space to Run Again
        </div>
      </div>
    </div>
  );
};
