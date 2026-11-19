import React, { useState } from 'react';
import { Salesperson } from '../types';
import { Shield, Check, Users, Save } from 'lucide-react';

interface UserRoleMenuPermissionsSettingProps {
  salespersons: Salesperson[];
  setSalespersons?: React.Dispatch<React.SetStateAction<Salesperson[]>>;
  onUpdateSalesperson?: (updated: Salesperson) => void;
}

export const ALL_MENUS = [
  { id: 'bill', label: 'Create Bill / Invoice (Sales)' },
  { id: 'challan', label: 'Delivery Challan & Slip Pad' },
  { id: 'requisition', label: 'Requisition (Create & History)' },
  { id: 'color_exchange', label: 'Color / Unit Exchange' },
  { id: 'stored_bills', label: 'Stored Bills Archive' },
  { id: 'returns', label: 'Stock Returns' },
  { id: 'collection', label: 'Collection & Cash (Entry, List, Cash/Cheque in Hand, Deposit History)' },
  { id: 'customer_ledger', label: 'Statement (Customer Ledger Statement)' },
  { id: 'party_directory', label: 'Customer / Party Directory' },
  { id: 'item_directory', label: 'Import from Factory & Item Directory' },
  { id: 'expense', label: 'Expense Manager (Entry & Log, Quick Entry, Report)' },
  { id: 'report', label: 'Customer Sales & Collection, Office Statement, Party Bank, Cash Summary, Bill-Wise' },
  { id: 'sales_report', label: 'Stock Report' },
  { id: 'admin_sales_collection_report', label: 'Sales & Collection Matrix (Admin)' },
  { id: 'settings', label: 'System Settings & Backup' }
];

export const MARKETING_OFFICER_DEFAULT_MENUS = [
  'bill',
  'challan',
  'requisition',
  'stored_bills',
  'returns',
  'collection',
  'party_directory',
  'customer_ledger',
  'expense',
  'report',
  'sales_report'
];

export const INCHARGE_STAFF_ACCOUNTS_DEFAULT_MENUS = [
  'bill',
  'challan',
  'requisition',
  'color_exchange',
  'stored_bills',
  'returns',
  'collection',
  'item_directory',
  'party_directory',
  'customer_ledger',
  'expense',
  'report',
  'sales_report'
];

function getDefaultMenusForSp(sp?: Salesperson | null): string[] {
  if (!sp) return ALL_MENUS.map(m => m.id);
  const role = (sp.role || '').toLowerCase();
  const desig = (sp.designation || '').toLowerCase();
  const userType = (sp.userType || '').toLowerCase();

  const isOfficer = userType === 'marketing' || role.includes('marketing') || role.includes('officer') || desig.includes('marketing') || desig.includes('officer');
  if (isOfficer) {
    return MARKETING_OFFICER_DEFAULT_MENUS;
  }

  const isInChargeOrStaff = sp.isInCharge || role.includes('in-charge') || role.includes('incharge') || role.includes('account') || role.includes('staff') || desig.includes('in-charge') || desig.includes('incharge') || desig.includes('account') || desig.includes('staff');
  if (isInChargeOrStaff) {
    return INCHARGE_STAFF_ACCOUNTS_DEFAULT_MENUS;
  }

  return ALL_MENUS.map(m => m.id);
}

export const UserRoleMenuPermissionsSetting: React.FC<UserRoleMenuPermissionsSettingProps> = ({
  salespersons,
  setSalespersons,
  onUpdateSalesperson
}) => {
  const [selectedSpId, setSelectedSpId] = useState<string>(salespersons[0]?.id || '');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const currentSp = salespersons.find((s) => s.id === selectedSpId) || salespersons[0];
  const [allowedMenus, setAllowedMenus] = useState<string[]>(() => {
    if (currentSp?.allowedMenus && currentSp.allowedMenus.length > 0) {
      return currentSp.allowedMenus;
    }
    try {
      const permsMap = JSON.parse(localStorage.getItem('polycables_user_menu_permissions') || '{}');
      const userPerm = permsMap[currentSp?.code || ''] || permsMap[currentSp?.id || ''];
      if (userPerm && Array.isArray(userPerm.allowedMenus)) {
        return userPerm.allowedMenus;
      }
    } catch (e) {}
    return getDefaultMenusForSp(currentSp);
  });

  const handleSelectSp = (id: string) => {
    setSelectedSpId(id);
    const sp = salespersons.find((s) => s.id === id);
    if (sp?.allowedMenus && sp.allowedMenus.length > 0) {
      setAllowedMenus(sp.allowedMenus);
    } else {
      try {
        const permsMap = JSON.parse(localStorage.getItem('polycables_user_menu_permissions') || '{}');
        const userPerm = permsMap[sp?.code || ''] || permsMap[sp?.id || ''];
        if (userPerm && Array.isArray(userPerm.allowedMenus)) {
          setAllowedMenus(userPerm.allowedMenus);
          setSavedSuccess(false);
          return;
        }
      } catch (e) {}
      setAllowedMenus(getDefaultMenusForSp(sp));
    }
    setSavedSuccess(false);
  };

  const handleToggleMenu = (menuId: string) => {
    setAllowedMenus((prev) =>
      prev.includes(menuId) ? prev.filter((id) => id !== menuId) : [...prev, menuId]
    );
    setSavedSuccess(false);
  };

  const handleSave = () => {
    if (!currentSp) return;
    const updated: Salesperson = {
      ...currentSp,
      allowedMenus
    };
    if (onUpdateSalesperson) {
      onUpdateSalesperson(updated);
    }
    if (setSalespersons) {
      setSalespersons((prev) => prev.map((s) => (s.id === currentSp.id ? updated : s)));
    }
    // Persist to localStorage
    try {
      const permsMap = JSON.parse(localStorage.getItem('polycables_user_menu_permissions') || '{}');
      if (currentSp.code) permsMap[currentSp.code] = { allowedMenus };
      if (currentSp.id) permsMap[currentSp.id] = { allowedMenus };
      localStorage.setItem('polycables_user_menu_permissions', JSON.stringify(permsMap));
    } catch (e) {
      console.error('Failed to persist user menu permissions', e);
    }
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  if (salespersons.length === 0) {
    return (
      <div className="p-8 text-center text-slate-300 cyber-glass-card rounded-2xl">
        No salespersons found in directory.
      </div>
    );
  }

  return (
    <div className="cyber-glass-card rounded-2xl p-6 space-y-6 text-white">
      <div className="flex items-center justify-between pb-4 border-b border-cyan-500/25">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-cyan-500/15 text-cyan-300 border border-cyan-400/35 rounded-xl">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">User Role & Menu Permissions</h3>
            <p className="text-xs text-slate-300">Control accessible menus and features for each staff or sales role.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-black rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>Save Permissions</span>
        </button>
      </div>

      {savedSuccess && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-400/40 text-emerald-200 text-xs font-semibold rounded-xl flex items-center space-x-2">
          <Check className="w-4 h-4 text-emerald-300" />
          <span>Menu permissions saved successfully for {currentSp?.name}!</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* User list */}
        <div className="cyber-glass-subcard border border-cyan-500/25 rounded-xl p-3 space-y-1 max-h-[500px] overflow-y-auto">
          <div className="text-xs font-bold text-cyan-200 uppercase tracking-wider px-2 py-1 flex items-center space-x-1.5">
            <Users className="w-3.5 h-3.5" />
            <span>Select Staff / Salesperson</span>
          </div>
          {salespersons.map((sp) => (
            <button
              key={sp.id}
              type="button"
              onClick={() => handleSelectSp(sp.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-between ${
                sp.id === currentSp?.id
                  ? 'bg-cyan-400 text-slate-950 font-black shadow-xs'
                  : 'text-slate-200 hover:bg-[#0e2a3d]'
              }`}
            >
              <div>
                <div className="font-bold">{sp.name}</div>
                <div className={`text-[10px] ${sp.id === currentSp?.id ? 'text-slate-900/80' : 'text-slate-400'}`}>
                  Code: {sp.code} • {sp.designation ? `${sp.designation} (${sp.role || 'Staff'})` : (sp.role || 'Staff')}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Menu permissions checklist */}
        <div className="md:col-span-2 cyber-glass-subcard border border-cyan-500/25 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-cyan-500/20 pb-3">
            <div>
              <h4 className="text-sm font-bold text-white">Allowed Menu Tabs for: {currentSp?.name}</h4>
              <p className="text-xs text-slate-300">Unchecked items will be hidden from navigation for this user.</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setAllowedMenus(MARKETING_OFFICER_DEFAULT_MENUS);
                  setSavedSuccess(false);
                }}
                className="px-2.5 py-1 text-[11px] font-semibold bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/30 rounded-lg cursor-pointer"
              >
                Marketing Officer Preset
              </button>
              <button
                type="button"
                onClick={() => {
                  setAllowedMenus(INCHARGE_STAFF_ACCOUNTS_DEFAULT_MENUS);
                  setSavedSuccess(false);
                }}
                className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-400/35 rounded-lg cursor-pointer"
              >
                In-charge / Staff Preset
              </button>
              <button
                type="button"
                onClick={() => {
                  setAllowedMenus(ALL_MENUS.map(m => m.id));
                  setSavedSuccess(false);
                }}
                className="px-2.5 py-1 text-[11px] font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-400/35 rounded-lg cursor-pointer"
              >
                All Menus (Admin)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {ALL_MENUS.map((menu) => {
              const isChecked = allowedMenus.includes(menu.id);
              return (
                <label
                  key={menu.id}
                  className={`flex items-center space-x-3 p-3 rounded-xl border transition-colors cursor-pointer ${
                    isChecked
                      ? 'bg-[#0e2d42] border-cyan-400/55 text-white font-bold'
                      : 'bg-[#071824]/70 border-cyan-500/20 text-slate-300 hover:border-cyan-500/35'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggleMenu(menu.id)}
                    className="w-4 h-4 rounded text-cyan-400 bg-[#061520] border-cyan-500/40"
                  />
                  <span className="text-xs">{menu.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
