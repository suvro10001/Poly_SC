import React from 'react';
import { AuthUser } from '../types';

interface DesignationAllowanceSettingsProps {
  currentUser?: AuthUser | null;
  onBack?: () => void;
  onClose?: () => void;
}

export const DesignationAllowanceSettings: React.FC<DesignationAllowanceSettingsProps> = ({ onBack, onClose }) => {
  return (
    <div className="cyber-glass-card rounded-2xl p-6 text-white">
      <div className="flex items-center justify-between pb-4 border-b border-cyan-500/20">
        <h2 className="text-lg font-bold text-white">Designation Allowance Settings</h2>
        <div className="flex items-center space-x-2">
          {onBack && (
            <button
              onClick={onBack}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 cursor-pointer"
            >
              Back
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/35 cursor-pointer"
            >
              Close
            </button>
          )}
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-400">Designation allowance configuration.</p>
    </div>
  );
};
