import React from 'react';
import { Play, Shield, Crosshair, Award, Settings as SettingsIcon, Zap } from 'lucide-react';
import { CraftConfig, PlayerStats } from '../types/game';

interface MenuProps {
  stats: PlayerStats;
  currentCraft: CraftConfig;
  onStartGame: () => void;
  onOpenHangar: () => void;
  onOpenMissions: () => void;
  onOpenSettings: () => void;
}

export const Menu: React.FC<MenuProps> = ({
  stats,
  currentCraft,
  onStartGame,
  onOpenHangar,
  onOpenMissions,
  onOpenSettings,
}) => {
  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-between p-6 sm:p-10 pointer-events-auto bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-slate-950/80 backdrop-blur-xs">
      {/* Top Bar Contract (3 zones) */}
      <header className="flex items-center justify-between gap-8 max-w-6xl mx-auto w-full">
        {/* Zone 1: Wordmark */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center rotate-6">
            <div className="w-4 h-4 bg-cyan-400 rotate-45 rounded-xs" />
          </div>
          <span className="text-xl sm:text-2xl font-black tracking-wider text-white font-mono uppercase">
            PolyRun
          </span>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
          <button
            onClick={onOpenHangar}
            className="hover:text-cyan-400 transition-colors whitespace-nowrap"
          >
            Craft Hangar
          </button>
          <button
            onClick={onOpenMissions}
            className="hover:text-cyan-400 transition-colors whitespace-nowrap"
          >
            Missions & Rewards
          </button>
          <button
            onClick={onOpenSettings}
            className="hover:text-cyan-400 transition-colors whitespace-nowrap"
          >
            Settings
          </button>
        </nav>

        {/* Zone 3: Wallet Shards */}
        <div className="flex items-center gap-3">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-2 flex items-center gap-2">
            <div className="w-3.5 h-3.5 rotate-45 bg-amber-400 rounded-xs shadow-sm shadow-amber-400/50" />
            <span className="font-mono font-bold text-amber-300 tabular-nums">
              {stats.totalCrystals}
            </span>
            <span className="text-xs text-slate-400">Shards</span>
          </div>
        </div>
      </header>

      {/* Hero Center Section */}
      <div className="max-w-2xl mx-auto text-center flex flex-col items-center my-auto py-8">
        <div className="text-xs font-semibold tracking-widest text-cyan-400 uppercase mb-3">
          Procedural 3D Low-Poly Odyssey
        </div>
        <h1 className="text-5xl sm:text-7xl font-black text-white tracking-tight leading-none mb-6 font-mono">
          POLYRUN
        </h1>
        <p className="text-slate-300 text-sm sm:text-base max-w-lg mb-8 leading-relaxed">
          Navigate infinite faceted canyons, outrun collapsing geometric sentinels, and harness polyrhythmic resonance in high-speed flight.
        </p>

        {/* Primary Start CTA */}
        <button
          onClick={onStartGame}
          className="group relative inline-flex items-center justify-center gap-3 px-10 py-4.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-extrabold text-lg sm:text-xl shadow-2xl shadow-cyan-500/30 transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
        >
          <Play className="w-6 h-6 fill-white" />
          <span>RUN NOW</span>
        </button>
        <span className="text-xs text-slate-400 mt-2 font-mono">Press Space or Click to Launch</span>

        {/* Equipped Craft Snapshot Card */}
        <div className="mt-8 bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl p-4 sm:p-5 max-w-md w-full flex items-center justify-between gap-4">
          <div className="text-left">
            <div className="text-xs font-medium text-slate-400">Equipped Craft</div>
            <div className="text-base font-bold text-white flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full inline-block"
                style={{ backgroundColor: currentCraft.color }}
              />
              {currentCraft.name}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">{currentCraft.subtitle}</div>
          </div>
          <button
            onClick={onOpenHangar}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-cyan-300 transition-colors"
          >
            Change Craft
          </button>
        </div>
      </div>

      {/* Lifetime Stats & Quick Bar Footer */}
      <footer className="max-w-4xl mx-auto w-full pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-6">
          <div>
            <span className="text-slate-500">High Score: </span>
            <span className="font-mono font-bold text-white tabular-nums">{stats.highScore.toLocaleString()}</span>
          </div>
          <span className="text-slate-700">·</span>
          <div>
            <span className="text-slate-500">Best Distance: </span>
            <span className="font-mono font-bold text-white tabular-nums">{stats.bestDistance} m</span>
          </div>
        </div>

        {/* Mobile Nav Links */}
        <div className="flex md:hidden items-center gap-4 text-xs">
          <button onClick={onOpenHangar} className="text-cyan-400 font-medium">Hangar</button>
          <span>·</span>
          <button onClick={onOpenMissions} className="text-cyan-400 font-medium">Missions</button>
          <span>·</span>
          <button onClick={onOpenSettings} className="text-cyan-400 font-medium">Settings</button>
        </div>

        <div className="text-slate-500">
          Keyboard: <kbd className="px-1 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300">A/D</kbd> Steer · <kbd className="px-1 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300">W</kbd> Jump · <kbd className="px-1 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300">S</kbd> Slide
        </div>
      </footer>
    </div>
  );
};
