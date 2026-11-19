import React, { useState, useEffect } from 'react';
import {
  Check,
  Plus,
  RotateCcw,
  Save,
  ShieldAlert,
  Trash2,
  Utensils,
  Hotel
} from 'lucide-react';
import { AuthUser, DesignationAllowanceSetting } from '../types';
import { isAnyAdmin, isStrictSuperAdmin } from '../utils/branchAccess';
import {
  DEFAULT_DESIGNATION_ALLOWANCE_SETTINGS,
  getAllowanceSettings,
  saveAllowanceSettings
} from '../utils/allowanceSettings';

interface AllowanceSettingsPanelProps {
  currentUser?: AuthUser | null;
  onSyncCloud?: (partial?: Record<string, any>, immediate?: boolean) => void;
  onSaved?: (updated: DesignationAllowanceSetting[]) => void;
  onClose?: () => void;
}

export const AllowanceSettingsPanel: React.FC<AllowanceSettingsPanelProps> = ({
  currentUser,
  onSyncCloud,
  onSaved,
  onClose
}) => {
  const canManage = isStrictSuperAdmin(currentUser) || isAnyAdmin(currentUser);
  const [rows, setRows] = useState<DesignationAllowanceSetting[]>(() => getAllowanceSettings());
  const [newDesignation, setNewDesignation] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const handleStorageUpdate = (e: Event) => {
      const custom = e as CustomEvent;
      if (custom.detail?.allowanceSettings) {
        setRows(custom.detail.allowanceSettings);
      } else {
        setRows(getAllowanceSettings());
      }
    };
    window.addEventListener('polycables_allowance_settings_updated', handleStorageUpdate);
    return () => window.removeEventListener('polycables_allowance_settings_updated', handleStorageUpdate);
  }, []);

  if (!canManage) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-center max-w-lg mx-auto my-6">
        <ShieldAlert className="w-8 h-8 text-rose-600 mx-auto mb-2" />
        <h3 className="text-sm font-bold text-slate-900">Admin & Super Admin Access Only</h3>
        <p className="text-xs text-slate-600 mt-1">
          Lunch Bill & Hotel Bill Settings are restricted to authorized Admin and Super Admin accounts.
        </p>
      </div>
    );
  }

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleFieldChange = (
    idx: number,
    field: 'breakfast' | 'lunch' | 'dinner' | 'meal1Day' | 'hotelBill',
    rawVal: string
  ) => {
    const num = Math.max(0, Number(rawVal) || 0);
    setRows((prev) => {
      const next = [...prev];
      const updatedRow = { ...next[idx], [field]: num };
      // If breakfast, lunch, or dinner changes and meal1Day matched their previous sum, keep meal1Day convenient or editable
      next[idx] = updatedRow;
      return next;
    });
  };

  const handleAddDesignation = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newDesignation.trim();
    if (!trimmed) return;
    if (rows.some((r) => r.designation.trim().toLowerCase() === trimmed.toLowerCase())) {
      showToast('error', `Designation "${trimmed}" already exists in the table.`);
      return;
    }
    setRows((prev) => [
      ...prev,
      {
        id: `desig-custom-${Date.now()}`,
        designation: trimmed,
        breakfast: 0,
        lunch: 0,
        dinner: 0,
        meal1Day: 0,
        hotelBill: 0
      }
    ]);
    setNewDesignation('');
  };

  const handleDeleteCustomRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveAll = () => {
    const saved = saveAllowanceSettings(rows);
    setRows(saved);
    onSyncCloud?.({ allowanceSettings: saved }, true);
    onSaved?.(saved);
    showToast('success', 'Designation-wise Lunch Bill & Hotel Bill settings saved.');
  };

  const handleConfirmResetDefaults = () => {
    const defaults = DEFAULT_DESIGNATION_ALLOWANCE_SETTINGS.map((d) => ({ ...d }));
    const saved = saveAllowanceSettings(defaults);
    setRows(saved);
    setConfirmReset(false);
    onSyncCloud?.({ allowanceSettings: saved }, true);
    onSaved?.(saved);
    showToast('success', 'Default designation rates restored.');
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden text-slate-900">
      {/* Header */}
      <div className="px-4 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-100 text-amber-800 rounded-lg border border-amber-200">
            <Utensils className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Lunch Bill & Hotel Bill Setting (Designation Wise)
            </h2>
            <p className="text-xs text-slate-500">
              Configure designation-wise Breakfast, Lunch, Dinner, Meal 1 Day, and Hotel Bill limits (Admin & Super Admin only)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {confirmReset ? (
            <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg text-xs">
              <span className="font-semibold text-rose-800">Reset all rates?</span>
              <button
                type="button"
                onClick={handleConfirmResetDefaults}
                className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded cursor-pointer"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="px-2 py-0.5 bg-white border border-slate-300 text-slate-700 font-semibold rounded cursor-pointer"
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Reset Default</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSaveAll}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Settings</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`mx-4 mt-3 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <Check className="w-4 h-4 shrink-0" />
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Designation Rates Table */}
      <div className="p-4 overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-700 border-y border-slate-200 font-bold">
              <th className="py-2.5 px-3 w-12 text-center">SL</th>
              <th className="py-2.5 px-3">Designation</th>
              <th className="py-2.5 px-3 text-right">Breakfast (৳)</th>
              <th className="py-2.5 px-3 text-right">Lunch (৳)</th>
              <th className="py-2.5 px-3 text-right">Dinner (৳)</th>
              <th className="py-2.5 px-3 text-right">Meal 1 Day (৳)</th>
              <th className="py-2.5 px-3 text-right">
                <span className="inline-flex items-center justify-end gap-1">
                  <Hotel className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Hotel Bill (৳)</span>
                </span>
              </th>
              <th className="py-2.5 px-2 w-12 text-center">Del</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((row, idx) => {
              const isStandard = DEFAULT_DESIGNATION_ALLOWANCE_SETTINGS.some(
                (d) => d.designation.toLowerCase() === row.designation.toLowerCase()
              );
              return (
                <tr key={row.id || row.designation} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2 px-3 text-center font-mono text-slate-500">{idx + 1}</td>
                  <td className="py-2 px-3 font-bold text-slate-900 whitespace-nowrap">
                    {row.designation}
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    <input
                      type="number"
                      min={0}
                      value={row.breakfast}
                      onChange={(e) => handleFieldChange(idx, 'breakfast', e.target.value)}
                      className="w-24 text-right font-mono font-semibold px-2 py-1 border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums"
                    />
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    <input
                      type="number"
                      min={0}
                      value={row.lunch}
                      onChange={(e) => handleFieldChange(idx, 'lunch', e.target.value)}
                      className="w-24 text-right font-mono font-semibold px-2 py-1 border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums"
                    />
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    <input
                      type="number"
                      min={0}
                      value={row.dinner}
                      onChange={(e) => handleFieldChange(idx, 'dinner', e.target.value)}
                      className="w-24 text-right font-mono font-semibold px-2 py-1 border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums"
                    />
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    <input
                      type="number"
                      min={0}
                      value={row.meal1Day}
                      onChange={(e) => handleFieldChange(idx, 'meal1Day', e.target.value)}
                      className="w-24 text-right font-mono font-bold px-2 py-1 border border-amber-300 rounded-md bg-amber-50/40 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 tabular-nums"
                    />
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    <input
                      type="number"
                      min={0}
                      value={row.hotelBill}
                      onChange={(e) => handleFieldChange(idx, 'hotelBill', e.target.value)}
                      className="w-28 text-right font-mono font-bold px-2 py-1 border border-indigo-300 rounded-md bg-indigo-50/40 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums"
                    />
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    {!isStandard ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomRow(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                        title="Remove custom designation"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="text-slate-300 text-[10px]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Add Custom Designation */}
        <form onSubmit={handleAddDesignation} className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newDesignation}
              onChange={(e) => setNewDesignation(e.target.value)}
              placeholder="Add custom designation (optional)..."
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-64"
            />
            <button
              type="submit"
              disabled={!newDesignation.trim()}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Designation</span>
            </button>
          </div>
          <span className="text-[11px] text-slate-500">
            Changes apply automatically when selecting Designation / Allowance on the Conveyance page.
          </span>
        </form>
      </div>
    </div>
  );
};
