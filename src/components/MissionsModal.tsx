import React from 'react';
import { X, Award, CheckCircle2, Gift } from 'lucide-react';
import { Mission } from '../types/game';

interface MissionsModalProps {
  missions: Mission[];
  onClaimReward: (missionId: string, reward: number) => void;
  onClose: () => void;
}

export const MissionsModal: React.FC<MissionsModalProps> = ({
  missions,
  onClaimReward,
  onClose,
}) => {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-4 sm:p-6 bg-slate-950/85 backdrop-blur-md pointer-events-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white font-mono">Flight Objectives</h2>
            <p className="text-xs text-slate-400">Complete challenges to earn rare Poly Shards</p>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Missions List */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1">
          {missions.map((mission) => {
            const percent = Math.min(100, Math.round((mission.progress / mission.target) * 100));

            return (
              <div
                key={mission.id}
                className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-white text-sm font-mono flex items-center gap-2">
                      {mission.title}
                      {mission.claimed && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 inline" />
                      )}
                    </h3>
                    <p className="text-xs text-slate-300 mt-0.5">{mission.description}</p>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-amber-300 bg-amber-950/40 border border-amber-800/60 px-2.5 py-1 rounded-lg shrink-0">
                    <Gift className="w-3.5 h-3.5 text-amber-400" />
                    <span>+{mission.reward}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                    <span>Progress</span>
                    <span>
                      {mission.progress} / {mission.target} ({percent}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-400 rounded-full transition-all duration-300"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>

                {/* Claim button if completed */}
                {mission.completed && !mission.claimed && (
                  <button
                    onClick={() => onClaimReward(mission.id, mission.reward)}
                    className="w-full py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 transition-transform active:scale-98 cursor-pointer"
                  >
                    <Gift className="w-4 h-4" />
                    <span>Claim {mission.reward} Shards</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
