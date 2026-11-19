import React from 'react';
import { X, Check, Lock, Zap, Wind, Magnet, Shield } from 'lucide-react';
import { CraftConfig } from '../types/game';

interface HangarModalProps {
  crafts: CraftConfig[];
  currentCraftId: string;
  totalCrystals: number;
  onEquipCraft: (craftId: string) => void;
  onUnlockCraft: (craftId: string, cost: number) => void;
  onClose: () => void;
}

export const HangarModal: React.FC<HangarModalProps> = ({
  crafts,
  currentCraftId,
  totalCrystals,
  onEquipCraft,
  onUnlockCraft,
  onClose,
}) => {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-4 sm:p-6 bg-slate-950/85 backdrop-blur-md pointer-events-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white font-mono">Poly Hangar</h2>
            <p className="text-xs text-slate-400">Select and unlock advanced geometric craft</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5 flex items-center gap-2">
              <div className="w-3 h-3 rotate-45 bg-amber-400 rounded-2xs" />
              <span className="font-mono font-bold text-amber-300 tabular-nums text-sm">
                {totalCrystals}
              </span>
              <span className="text-[11px] text-slate-400">Shards</span>
            </div>

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Craft Cards List */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
          {crafts.map((craft) => {
            const isEquipped = craft.id === currentCraftId;
            const canAfford = totalCrystals >= craft.cost;

            return (
              <div
                key={craft.id}
                className={`relative rounded-2xl border p-5 flex flex-col justify-between transition-all ${
                  isEquipped
                    ? 'bg-slate-800/80 border-cyan-500/80 shadow-lg shadow-cyan-500/10'
                    : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  {/* Top info */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center border shadow-md rotate-3"
                        style={{
                          backgroundColor: `${craft.color}20`,
                          borderColor: `${craft.accentColor}60`,
                        }}
                      >
                        <div
                          className="w-4 h-4 rotate-45 rounded-xs"
                          style={{ backgroundColor: craft.accentColor }}
                        />
                      </div>
                      <div>
                        <h3 className="font-bold text-white text-base font-mono">{craft.name}</h3>
                        <div className="text-xs text-slate-400">{craft.subtitle}</div>
                      </div>
                    </div>

                    {isEquipped && (
                      <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider bg-cyan-950/80 border border-cyan-800 px-2 py-0.5 rounded-md">
                        Equipped
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed mb-4">
                    {craft.description}
                  </p>

                  {/* Stat Bars */}
                  <div className="space-y-2 mb-5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <Wind className="w-3.5 h-3.5 text-cyan-400" /> Speed
                      </span>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((lvl) => (
                          <div
                            key={lvl}
                            className={`w-4 h-1.5 rounded-full ${
                              lvl <= craft.stats.speed ? 'bg-cyan-400' : 'bg-slate-800'
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <Zap className="w-3.5 h-3.5 text-amber-400" /> Agility
                      </span>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((lvl) => (
                          <div
                            key={lvl}
                            className={`w-4 h-1.5 rounded-full ${
                              lvl <= craft.stats.agility ? 'bg-amber-400' : 'bg-slate-800'
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <Magnet className="w-3.5 h-3.5 text-purple-400" /> Magnet Range
                      </span>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((lvl) => (
                          <div
                            key={lvl}
                            className={`w-4 h-1.5 rounded-full ${
                              lvl <= craft.stats.magnet ? 'bg-purple-400' : 'bg-slate-800'
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <Shield className="w-3.5 h-3.5 text-emerald-400" /> Boost / Shield
                      </span>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((lvl) => (
                          <div
                            key={lvl}
                            className={`w-4 h-1.5 rounded-full ${
                              lvl <= craft.stats.boost ? 'bg-emerald-400' : 'bg-slate-800'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Button */}
                <div>
                  {craft.unlocked ? (
                    <button
                      onClick={() => onEquipCraft(craft.id)}
                      disabled={isEquipped}
                      className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                        isEquipped
                          ? 'bg-slate-800 text-slate-400 cursor-default'
                          : 'bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer'
                      }`}
                    >
                      {isEquipped ? (
                        <>
                          <Check className="w-4 h-4" /> Equipped
                        </>
                      ) : (
                        'Equip Craft'
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => onUnlockCraft(craft.id, craft.cost)}
                      disabled={!canAfford}
                      className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                        canAfford
                          ? 'bg-amber-600 hover:bg-amber-500 text-white cursor-pointer'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <Lock className="w-4 h-4" />
                      <span>Unlock ({craft.cost} Shards)</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
