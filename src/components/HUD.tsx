import React from 'react';
import { Pause, Volume2, VolumeX, Zap, Shield, Magnet, Clock, Sparkles } from 'lucide-react';
import { PlayerStats, PowerupTimers } from '../types/game';

interface HUDProps {
  stats: PlayerStats;
  powerups: PowerupTimers;
  isMuted: boolean;
  onToggleMute: () => void;
  onPause: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onJump: () => void;
  onSlide: () => void;
  onBoost: () => void;
}

export const HUD: React.FC<HUDProps> = ({
  stats,
  powerups,
  isMuted,
  onToggleMute,
  onPause,
  onMoveLeft,
  onMoveRight,
  onJump,
  onSlide,
  onBoost,
}) => {
  return (
    <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-4 sm:p-6 select-none font-sans">
      {/* Top Bar Stats */}
      <div className="flex items-start justify-between gap-4">
        {/* Score & Multiplier */}
        <div className="bg-slate-950/70 backdrop-blur-md border border-slate-800/80 rounded-xl px-4 py-2.5 shadow-xl flex items-center gap-4 pointer-events-auto">
          <div>
            <div className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Score</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono tabular-nums tracking-tight">
              {stats.score.toLocaleString()}
            </div>
          </div>
          {stats.multiplier > 1 && (
            <div className="px-2.5 py-1 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono text-sm font-bold animate-pulse">
              {stats.multiplier}X
            </div>
          )}
        </div>

        {/* Center: Distance & Speed */}
        <div className="hidden sm:flex items-center gap-3 bg-slate-950/70 backdrop-blur-md border border-slate-800/80 rounded-xl px-4 py-2.5 shadow-xl">
          <div className="text-center px-2">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Distance</div>
            <div className="text-xl font-bold text-slate-100 font-mono tabular-nums">
              {stats.distance} <span className="text-xs text-slate-400 font-normal">m</span>
            </div>
          </div>
          <div className="w-px h-7 bg-slate-800" />
          <div className="text-center px-2">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Speed</div>
            <div className="text-xl font-bold text-cyan-400 font-mono tabular-nums">
              {stats.speedKmh} <span className="text-xs text-cyan-500/80 font-normal">km/h</span>
            </div>
          </div>
        </div>

        {/* Right: Crystals & Controls */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Crystals */}
          <div className="bg-slate-950/70 backdrop-blur-md border border-slate-800/80 rounded-xl px-3.5 py-2 shadow-xl flex items-center gap-2">
            <div className="w-3.5 h-3.5 rotate-45 bg-gradient-to-tr from-amber-400 to-yellow-200 rounded-xs shadow-sm shadow-amber-400/50" />
            <span className="font-mono font-bold text-lg text-amber-300 tabular-nums">
              {stats.crystals}
            </span>
          </div>

          {/* Mute button */}
          <button
            onClick={onToggleMute}
            className="w-10 h-10 rounded-xl bg-slate-950/70 backdrop-blur-md border border-slate-800/80 hover:border-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Pause button */}
          <button
            onClick={onPause}
            className="w-10 h-10 rounded-xl bg-slate-950/70 backdrop-blur-md border border-slate-800/80 hover:border-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
            title="Pause (Esc)"
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Active Powerups Shelf */}
      <div className="flex flex-col gap-2 max-w-xs">
        {powerups.shield > 0 && (
          <div className="bg-sky-950/80 backdrop-blur-md border border-sky-500/40 rounded-lg p-2 flex items-center gap-2.5 shadow-lg">
            <Shield className="w-4 h-4 text-sky-400 shrink-0" />
            <div className="flex-1">
              <div className="flex justify-between text-xs font-semibold text-sky-200">
                <span>Poly Shield</span>
                <span className="font-mono tabular-nums">{powerups.shield.toFixed(1)}s</span>
              </div>
              <div className="w-full h-1.5 bg-sky-950 rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full bg-sky-400 rounded-full transition-all duration-100"
                  style={{ width: `${Math.min(100, (powerups.shield / 8) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {powerups.boost > 0 && (
          <div className="bg-orange-950/80 backdrop-blur-md border border-orange-500/40 rounded-lg p-2 flex items-center gap-2.5 shadow-lg">
            <Zap className="w-4 h-4 text-orange-400 shrink-0" />
            <div className="flex-1">
              <div className="flex justify-between text-xs font-semibold text-orange-200">
                <span>Overdrive Boost</span>
                <span className="font-mono tabular-nums">{powerups.boost.toFixed(1)}s</span>
              </div>
              <div className="w-full h-1.5 bg-orange-950 rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full bg-orange-400 rounded-full transition-all duration-100"
                  style={{ width: `${Math.min(100, (powerups.boost / 5) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {powerups.magnet > 0 && (
          <div className="bg-purple-950/80 backdrop-blur-md border border-purple-500/40 rounded-lg p-2 flex items-center gap-2.5 shadow-lg">
            <Magnet className="w-4 h-4 text-purple-400 shrink-0" />
            <div className="flex-1">
              <div className="flex justify-between text-xs font-semibold text-purple-200">
                <span>Crystal Magnet</span>
                <span className="font-mono tabular-nums">{powerups.magnet.toFixed(1)}s</span>
              </div>
              <div className="w-full h-1.5 bg-purple-950 rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full bg-purple-400 rounded-full transition-all duration-100"
                  style={{ width: `${Math.min(100, (powerups.magnet / 8) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {powerups.multiplier2x > 0 && (
          <div className="bg-amber-950/80 backdrop-blur-md border border-amber-500/40 rounded-lg p-2 flex items-center gap-2.5 shadow-lg">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="flex-1">
              <div className="flex justify-between text-xs font-semibold text-amber-200">
                <span>2X Score Prism</span>
                <span className="font-mono tabular-nums">{powerups.multiplier2x.toFixed(1)}s</span>
              </div>
              <div className="w-full h-1.5 bg-amber-950 rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded-full transition-all duration-100"
                  style={{ width: `${Math.min(100, (powerups.multiplier2x / 8) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {powerups.chrono > 0 && (
          <div className="bg-emerald-950/80 backdrop-blur-md border border-emerald-500/40 rounded-lg p-2 flex items-center gap-2.5 shadow-lg">
            <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="flex-1">
              <div className="flex justify-between text-xs font-semibold text-emerald-200">
                <span>Chrono Dilation</span>
                <span className="font-mono tabular-nums">{powerups.chrono.toFixed(1)}s</span>
              </div>
              <div className="w-full h-1.5 bg-emerald-950 rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full bg-emerald-400 rounded-full transition-all duration-100"
                  style={{ width: `${Math.min(100, (powerups.chrono / 8) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Area: Controls Helper & Mobile Touch Controls */}
      <div className="flex flex-col items-center gap-3">
        {/* Mobile On-Screen Action Buttons (visible on touch devices) */}
        <div className="w-full flex items-center justify-between sm:hidden pointer-events-auto px-2 pb-2">
          {/* Left / Right */}
          <div className="flex gap-2">
            <button
              onClick={onMoveLeft}
              className="w-14 h-14 rounded-2xl bg-slate-900/80 active:bg-slate-800 border border-slate-700/80 text-white font-bold text-xl flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            >
              ←
            </button>
            <button
              onClick={onMoveRight}
              className="w-14 h-14 rounded-2xl bg-slate-900/80 active:bg-slate-800 border border-slate-700/80 text-white font-bold text-xl flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            >
              →
            </button>
          </div>

          {/* Jump / Slide / Boost */}
          <div className="flex gap-2">
            <button
              onClick={onJump}
              className="w-14 h-14 rounded-2xl bg-cyan-600/80 active:bg-cyan-500 border border-cyan-400/60 text-white font-bold text-sm flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            >
              JUMP
            </button>
            <button
              onClick={onSlide}
              className="w-14 h-14 rounded-2xl bg-amber-600/80 active:bg-amber-500 border border-amber-400/60 text-white font-bold text-sm flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            >
              SLIDE
            </button>
            <button
              onClick={onBoost}
              className="w-14 h-14 rounded-2xl bg-rose-600/80 active:bg-rose-500 border border-rose-400/60 text-white font-bold text-sm flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            >
              <Zap className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Desktop Keyboard Controls Keycaps */}
        <div className="hidden sm:flex items-center gap-3 bg-slate-950/70 backdrop-blur-md border border-slate-800/80 rounded-full px-5 py-2 text-xs text-slate-300">
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-[11px] font-mono border border-slate-700 text-slate-200">A / D</kbd>
            <span>or</span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-[11px] font-mono border border-slate-700 text-slate-200">← →</kbd>
            <span>Steer</span>
          </span>
          <span className="text-slate-600">·</span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-[11px] font-mono border border-slate-700 text-slate-200">W</kbd>
            <span>or</span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-[11px] font-mono border border-slate-700 text-slate-200">Space</kbd>
            <span>Jump</span>
          </span>
          <span className="text-slate-600">·</span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-[11px] font-mono border border-slate-700 text-slate-200">S</kbd>
            <span>or</span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-[11px] font-mono border border-slate-700 text-slate-200">↓</kbd>
            <span>Slide Under</span>
          </span>
          <span className="text-slate-600">·</span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-[11px] font-mono border border-slate-700 text-slate-200">Shift</kbd>
            <span>Overdrive Boost</span>
          </span>
        </div>
      </div>
    </div>
  );
};
