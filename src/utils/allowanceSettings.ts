import { DesignationAllowanceSetting } from '../types';

export const DEFAULT_DESIGNATION_ALLOWANCES: DesignationAllowanceSetting[] = [
  {
    id: 'desig-incharge',
    designation: 'Showroom In-Charge',
    breakfast: 60,
    lunch: 150,
    dinner: 150,
    meal1Day: 360,
    hotelBill: 800,
    description: 'Branch & showroom in-charge officers'
  },
  {
    id: 'desig-sr-marketing',
    designation: 'Senior Marketing Officer',
    breakfast: 60,
    lunch: 150,
    dinner: 150,
    meal1Day: 360,
    hotelBill: 700,
    description: 'Senior sales and marketing field executives'
  },
  {
    id: 'desig-marketing',
    designation: 'Marketing Officer',
    breakfast: 50,
    lunch: 130,
    dinner: 130,
    meal1Day: 310,
    hotelBill: 600,
    description: 'Marketing officers and field representatives'
  },
  {
    id: 'desig-delivery',
    designation: 'Delivery / Driver / Assistant',
    breakfast: 40,
    lunch: 100,
    dinner: 100,
    meal1Day: 240,
    hotelBill: 500,
    description: 'Factory delivery drivers and logistics staff'
  },
  {
    id: 'desig-area-manager',
    designation: 'Area Manager / Admin',
    breakfast: 80,
    lunch: 200,
    dinner: 200,
    meal1Day: 480,
    hotelBill: 1200,
    description: 'Regional area managers and head office admins'
  }
];

export const ALLOWANCE_SETTINGS_STORAGE_KEY = 'polycables_designation_allowance_settings';
export const DEFAULT_DESIGNATION_ALLOWANCE_SETTINGS = DEFAULT_DESIGNATION_ALLOWANCES;
export const getAllowanceSettings = getDesignationAllowanceSettings;
export const saveAllowanceSettings = saveDesignationAllowanceSettings;

export function getDesignationAllowanceSettings(): DesignationAllowanceSetting[] {
  try {
    const raw = localStorage.getItem(ALLOWANCE_SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load designation allowance settings:', e);
  }
  return DEFAULT_DESIGNATION_ALLOWANCES;
}

export function saveDesignationAllowanceSettings(
  settings: DesignationAllowanceSetting[],
  onSyncCloud?: (patch: Record<string, any>, immediate?: boolean) => void
): DesignationAllowanceSetting[] {
  try {
    localStorage.setItem(ALLOWANCE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    if (onSyncCloud) {
      onSyncCloud({ designationAllowanceSettings: settings }, true);
    }
  } catch (e) {
    console.error('Failed to save designation allowance settings:', e);
  }
  return settings;
}

export function getAllowanceForDesignation(
  designationOrRole?: string,
  settings?: DesignationAllowanceSetting[]
): DesignationAllowanceSetting {
  const list = settings && settings.length > 0 ? settings : getDesignationAllowanceSettings();
  if (!designationOrRole) return list[0] || DEFAULT_DESIGNATION_ALLOWANCES[0];

  const target = designationOrRole.trim().toLowerCase();

  // Try exact match
  const exact = list.find((s) => s.designation.trim().toLowerCase() === target);
  if (exact) return exact;

  // Try keyword matching
  if (target.includes('in-charge') || target.includes('incharge') || target.includes('manager')) {
    const found = list.find((s) => s.designation.toLowerCase().includes('in-charge'));
    if (found) return found;
  }
  if (target.includes('sr') || target.includes('senior')) {
    const found = list.find((s) => s.designation.toLowerCase().includes('senior'));
    if (found) return found;
  }
  if (target.includes('marketing') || target.includes('sales')) {
    const found = list.find((s) => s.designation.toLowerCase().includes('marketing'));
    if (found) return found;
  }
  if (target.includes('delivery') || target.includes('driver') || target.includes('staff')) {
    const found = list.find((s) => s.designation.toLowerCase().includes('delivery'));
    if (found) return found;
  }

  return list[0] || DEFAULT_DESIGNATION_ALLOWANCES[0];
}
