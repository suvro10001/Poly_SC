import React from 'react';
import { X, Volume2, Video, Compass } from 'lucide-react';
import { BiomeType, CameraMode, GameSettings } from '../types/game';

interface SettingsModalProps {
  settings: GameSettings;
  onUpdateSettings: (newSettings: Partial<GameSettings>) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onUpdateSettings,
  onClose,
}) => {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-4 sm:p-6 bg-slate-950/85 backdrop-blur-md pointer-events-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-white font-mono">Flight Settings</h2>
            <p className="text-xs text-slate-400">Audio, visual perspectives, and environment</p>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Settings Body */}
        <div className="p-6 space-y-6">
          {/* Audio Controls */}
          <div>
            <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" /> Audio Engine
            </h3>
            <div className="space-y-4 bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1.5">
                  <span>Synth Music Volume</span>
                  <span className="font-mono">{Math.round(settings.musicVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.musicVolume}
                  onChange={(e) => onUpdateSettings({ musicVolume: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1.5">
                  <span>Sound Effects Volume</span>
                  <span className="font-mono">{Math.round(settings.sfxVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.sfxVolume}
                  onChange={(e) => onUpdateSettings({ sfxVolume: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Camera Perspective */}
          <div>
            <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5" /> Camera Perspective
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'chase', label: 'Third Person' },
                { id: 'cockpit', label: 'Low Cockpit' },
                { id: 'high', label: 'High Aerial' },
              ].map((cam) => (
                <button
                  key={cam.id}
                  onClick={() => onUpdateSettings({ cameraMode: cam.id as CameraMode })}
                  className={`py-2.5 px-2 rounded-xl text-xs font-semibold transition-all border ${
                    settings.cameraMode === cam.id
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-sm'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {cam.label}
                </button>
              ))}
            </div>
          </div>

          {/* Biome World Selection */}
          <div>
            <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5" /> Poly Environment
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'sunset', label: 'Sunset Canyon' },
                { id: 'cyber', label: 'Cyber Grid' },
                { id: 'emerald', label: 'Emerald Glade' },
                { id: 'cosmic', label: 'Cosmic Void' },
              ].map((biome) => (
                <button
                  key={biome.id}
                  onClick={() => onUpdateSettings({ selectedBiome: biome.id as BiomeType })}
                  className={`py-2.5 px-3 rounded-xl text-xs font-semibold text-left transition-all border ${
                    settings.selectedBiome === biome.id
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {biome.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition-colors"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
};
