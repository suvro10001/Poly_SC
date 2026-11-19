
import { Requisition, MarketingStats, AppSettings, User, Customer, MarketingPerson, ItemMaster, Showroom, DeliveryLog, UserPermissions, CloudConfig, Conveyance, ConveyanceItem, ConveyanceStatus, Collection, Bank, BankDeposit } from '../src/types';

const REQ_KEY = 'corpo_requisitions';
const STATS_KEY = 'corpo_marketing_stats';
const SETTINGS_KEY = 'corpo_app_settings';
const USERS_KEY = 'corpo_users';
const CUSTOMERS_KEY = 'corpo_customers';
const MARKETING_DIR_KEY = 'corpo_marketing_directory';
const ITEMS_DIR_KEY = 'corpo_items_directory';
const SHOWROOMS_DIR_KEY = 'corpo_showrooms_directory';
const DELIVERY_LOGS_KEY = 'corpo_delivery_logs';
const STOCK_DIR_KEY = 'corpo_stock_directory';
const BACKUP_SIG_KEY = 'corpo_system_signature';
const DRAFT_KEY = 'corpo_requisition_draft';
const ATTENDANCE_KEY = 'corpo_attendance';
const CONVEYANCE_KEY = 'corpo_conveyance';
const COLLECTIONS_KEY = 'corpo_collections';
const BANKS_KEY = 'corpo_banks';
const BANK_DEPOSITS_KEY = 'corpo_bank_deposits';

const DEFAULT_CLOUD_CONFIG: CloudConfig = {
  enabled: true,
  url: 'https://wqylkynsvmgaoeqbzesy.supabase.co',
  apiKey: 'sb_publishable_mwjLYA5h9IZSbHmsCDRQDA_LDqFSF_V'
};

// Internal helper to get config synchronously for the fetch calls
const getCloudConfigSync = () => {
  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    if (data) {
      const settings = JSON.parse(data) as AppSettings;
      // If cloud config is explicitly set (even if enabled=false), use it.
      if (settings.cloud) return settings.cloud;
    }
  } catch (e) {}
  // Default to auto-connected database if no local settings exist
  return DEFAULT_CLOUD_CONFIG;
};

// Generic Supabase Fetch Wrapper
const supabaseFetch = async (table: string, method: string = 'GET', body?: any) => {
  const config = getCloudConfigSync();
  if (!config || !config.enabled || !config.url || !config.apiKey) {
    return null; // Treat as not configured
  }

  // Map local keys to simplified table names for Supabase
  const tableMap: Record<string, string> = {
    [REQ_KEY]: 'requisitions',
    [STATS_KEY]: 'marketing_stats',
    [SETTINGS_KEY]: 'app_settings',
    [USERS_KEY]: 'users',
    [CUSTOMERS_KEY]: 'customers',
    [MARKETING_DIR_KEY]: 'marketing_people',
    [ITEMS_DIR_KEY]: 'items',
    [SHOWROOMS_DIR_KEY]: 'showrooms',
    [DELIVERY_LOGS_KEY]: 'delivery_logs',
    [ATTENDANCE_KEY]: 'attendance',
    [CONVEYANCE_KEY]: 'conveyance',
    [COLLECTIONS_KEY]: 'collections',
    [BANKS_KEY]: 'banks',
    [BANK_DEPOSITS_KEY]: 'bank_deposits'
  };

  const tableName = tableMap[table] || table;
  const url = `${config.url}/rest/v1/${tableName}`;
  
  const headers = {
    'apikey': config.apiKey,
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  try {
    if (method === 'GET') {
      const response = await fetch(`${url}?id=eq.master_data&select=*`, { 
        headers,
        cache: 'no-store'
      });
      if (!response.ok) {
        if (response.status !== 404) {
          console.warn(`Cloud GET ${tableName} failed: ${response.status}`);
        }
        return null; 
      }
      const json = await response.json();
      if (json.length > 0) return json[0].json_content;
      return [];
    } else if (method === 'POST') {
      // Upsert (Insert or Update)
      // We send the entire array as one record
      const payload = {
        id: 'master_data',
        json_content: body
      };
      const response = await fetch(`${url}`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' }, // Upsert behavior
        body: JSON.stringify(payload),
        cache: 'no-store'
      });
      if (!response.ok) {
        console.warn(`Cloud POST ${tableName} failed: ${response.status}`);
        return null;
      }
      return body;
    }
  } catch (error) {
    // console.warn("Cloud connection exception:", error);
    return null;
  }
};

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (e) {}
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

// Helper to handle Cloud vs Local switch
const getData = async <T>(key: string): Promise<T[]> => {
  // Try cloud first
  const cloudData = await supabaseFetch(key, 'GET');
  if (cloudData !== null) {
    return cloudData;
  }
  
  // Fallback to local
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
};

const saveData = async <T>(key: string, data: T[]): Promise<T[]> => {
  // Always save to local for cache/backup
  localStorage.setItem(key, JSON.stringify(data));
  
  // Try cloud
  const cloudResult = await supabaseFetch(key, 'POST', data);
  
  // If cloud is enabled but fetch failed, we should know about it
  const config = getCloudConfigSync();
  if (config.enabled && cloudResult === null) {
    console.warn(`Cloud sync failed for ${key}. Data is saved locally and will sync when cloud is available.`);
  }
  
  return data;
};

const ensureIds = (items: any[]) => {
  return items.map(item => {
    if (!item.id || String(item.id).trim() === '') {
      return { ...item, id: generateId() };
    }
    return item;
  });
};

const ADMIN_PERMISSIONS: UserPermissions = {
  canCreate: true, canViewList: true, canApprove: true, canDispatch: true, canViewHistory: true, canManageDirectories: true, canAdmin: true,
  canCreateConveyance: true, canApproveConveyance: true, canViewConveyanceList: true
};

export const storage = {
  // Now returns Promise
  getRequisitions: async (): Promise<Requisition[]> => {
    const parsed = await getData<Requisition>(REQ_KEY);
    return ensureIds(parsed);
  },
  saveRequisition: async (req: Requisition) => {
    const all = await storage.getRequisitions();
    const toSave = { ...req, id: req.id || generateId() };
    const updated = [toSave, ...all];
    return await saveData(REQ_KEY, updated);
  },
  updateRequisition: async (updated: Requisition) => {
    const all = await storage.getRequisitions();
    const index = all.findIndex(r => String(r.id) === String(updated.id));
    if (index > -1) {
      all[index] = updated;
      return await saveData(REQ_KEY, all);
    }
    return all;
  },
  deleteRequisition: async (id: string) => {
    const all = await storage.getRequisitions();
    const filtered = all.filter(r => String(r.id) !== String(id));
    return await saveData(REQ_KEY, filtered);
  },
  overwriteRequisitions: async (requisitions: Requisition[]) => {
    return await saveData(REQ_KEY, requisitions);
  },
  getDeliveryLogs: async (): Promise<DeliveryLog[]> => {
    return await getData<DeliveryLog>(DELIVERY_LOGS_KEY);
  },
  saveDeliveryLog: async (log: DeliveryLog) => {
    const all = await storage.getDeliveryLogs();
    const updated = [log, ...all];
    return await saveData(DELIVERY_LOGS_KEY, updated);
  },
  updateDeliveryLog: async (updatedLog: DeliveryLog) => {
    const all = await storage.getDeliveryLogs();
    const index = all.findIndex(l => l.id === updatedLog.id);
    if (index > -1) {
      all[index] = updatedLog;
      return await saveData(DELIVERY_LOGS_KEY, all);
    }
    return all;
  },
  getMarketingStats: async (): Promise<MarketingStats[]> => {
    return await getData<MarketingStats>(STATS_KEY);
  },
  updateMarketingStats: async (person: string, number: number, isConveyance: boolean = false) => {
    const stats = await storage.getMarketingStats();
    const index = stats.findIndex(s => s.marketingPerson === person);
    if (index > -1) {
      if (isConveyance) {
        stats[index].lastUsedConveyanceNumber = number;
      } else {
        stats[index].lastUsedNumber = number;
      }
    } else {
      if (isConveyance) {
        stats.push({ marketingPerson: person, lastUsedNumber: 0, lastUsedConveyanceNumber: number });
      } else {
        stats.push({ marketingPerson: person, lastUsedNumber: number, lastUsedConveyanceNumber: 0 });
      }
    }
    return await saveData(STATS_KEY, stats);
  },
  overwriteMarketingStats: async (stats: MarketingStats[]) => {
    return await saveData(STATS_KEY, stats);
  },
  getSettings: async (): Promise<AppSettings> => {
    // Settings is special because we need it for Cloud Config itself.
    // 1. Get Local
    let localSettings: AppSettings;
    try {
      const ls = localStorage.getItem(SETTINGS_KEY);
      localSettings = ls ? JSON.parse(ls) : {
        defaultEmailRecipient: 'requisition@poly.corp',
        approvers: [{ name: 'Director', designation: 'Director' }],
        categoryOrder: [],
        cloud: DEFAULT_CLOUD_CONFIG
      };
      
      // Inject default cloud config if missing from local storage
      if (!localSettings.cloud) {
        localSettings.cloud = DEFAULT_CLOUD_CONFIG;
      }
    } catch {
       localSettings = { defaultEmailRecipient: '', approvers: [], categoryOrder: [], cloud: DEFAULT_CLOUD_CONFIG };
    }

    // 2. If cloud enabled, try to fetch "shared" settings (approvers list, etc)
    if (localSettings.cloud?.enabled) {
      const cloudSettingsArr = await supabaseFetch(SETTINGS_KEY, 'GET');
      if (cloudSettingsArr && !Array.isArray(cloudSettingsArr)) { 
          const cloudSettings = cloudSettingsArr as AppSettings;
          // Merge: Keep local cloud config (keys), take shared lists from cloud
          return {
            ...cloudSettings,
            cloud: localSettings.cloud 
          };
      }
    }
    
    return localSettings;
  },
  saveSettings: async (settings: AppSettings) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    if (settings.cloud?.enabled) {
      await supabaseFetch(SETTINGS_KEY, 'POST', settings);
    }
  },
  getUsers: async (): Promise<User[]> => {
    const users = await getData<User>(USERS_KEY);
    if (!users.find(u => u.username === 'admin')) {
      users.push({
        username: 'admin',
        fullName: 'Administrator',
        email: 'admin@poly.corp',
        password: 'admin',
        role: 'Admin',
        status: 'Approved',
        permissions: ADMIN_PERMISSIONS
      });
    }
    if (!users.find(u => u.username === 'dev_admin')) {
      users.push({
        username: 'dev_admin',
        fullName: 'Developer (Admin)',
        email: 'dev@poly.corp',
        password: 'admin',
        role: 'Admin',
        status: 'Approved',
        permissions: ADMIN_PERMISSIONS
      });
    }
    return users;
  },
  saveUser: async (user: User) => {
    const all = await storage.getUsers();
    if (all.some(u => u.username === user.username)) {
      throw new Error("Username already exists.");
    }
    const updated = [...all, user];
    return await saveData(USERS_KEY, updated);
  },
  updateUser: async (updated: User) => {
    const all = await storage.getUsers();
    const index = all.findIndex(u => u.username === updated.username);
    if (index > -1) {
      all[index] = updated;
      return await saveData(USERS_KEY, all);
    }
    return all;
  },
  deleteUser: async (username: string) => {
    // Get all users including hardcoded ones
    const all = await storage.getUsers();
    // Filter out the user to delete
    const filtered = all.filter(u => u.username !== username);
    // Save the filtered list back to storage
    await saveData(USERS_KEY, filtered);
    // Return the fresh list from storage to ensure consistency
    return await storage.getUsers();
  },
  overwriteUsers: async (users: User[]) => {
    return await saveData(USERS_KEY, users);
  },
  getCustomers: async (): Promise<Customer[]> => {
    const parsed = await getData<Customer>(CUSTOMERS_KEY);
    return ensureIds(parsed);
  },
  saveCustomer: async (customer: Customer) => {
    const all = await storage.getCustomers();
    const updated = [...all, customer];
    return await saveData(CUSTOMERS_KEY, updated);
  },
  updateCustomer: async (updated: Customer) => {
    const all = await storage.getCustomers();
    const index = all.findIndex(c => String(c.id) === String(updated.id));
    if (index > -1) {
      all[index] = updated;
      return await saveData(CUSTOMERS_KEY, all);
    }
    return all;
  },
  deleteCustomer: async (id: string) => {
    const all = await storage.getCustomers();
    const filtered = all.filter(c => String(c.id) !== String(id));
    return await saveData(CUSTOMERS_KEY, filtered);
  },
  overwriteCustomers: async (customers: Customer[]) => {
    return await saveData(CUSTOMERS_KEY, customers);
  },
  getMarketingPeople: async (): Promise<MarketingPerson[]> => {
    const parsed = await getData<MarketingPerson>(MARKETING_DIR_KEY);
    return ensureIds(parsed);
  },
  saveMarketingPerson: async (person: MarketingPerson) => {
    const all = await storage.getMarketingPeople();
    const updated = [...all, person];
    return await saveData(MARKETING_DIR_KEY, updated);
  },
  updateMarketingPerson: async (updated: MarketingPerson) => {
    const all = await storage.getMarketingPeople();
    const index = all.findIndex(p => String(p.id) === String(updated.id));
    if (index > -1) {
      all[index] = updated;
      return await saveData(MARKETING_DIR_KEY, all);
    }
    return all;
  },
  deleteMarketingPerson: async (id: string) => {
    const all = await storage.getMarketingPeople();
    const filtered = all.filter(p => String(p.id) !== String(id));
    return await saveData(MARKETING_DIR_KEY, filtered);
  },
  overwriteMarketingPeople: async (people: MarketingPerson[]) => {
    return await saveData(MARKETING_DIR_KEY, people);
  },
  getItems: async (): Promise<ItemMaster[]> => {
    const parsed = await getData<ItemMaster>(ITEMS_DIR_KEY);
    return ensureIds(parsed);
  },
  saveItem: async (item: ItemMaster) => {
    const all = await storage.getItems();
    const updated = [...all, item];
    return await saveData(ITEMS_DIR_KEY, updated);
  },
  updateItem: async (updated: ItemMaster) => {
    const all = await storage.getItems();
    const index = all.findIndex(i => String(i.id) === String(updated.id));
    if (index > -1) {
      all[index] = updated;
      return await saveData(ITEMS_DIR_KEY, all);
    }
    return all;
  },
  deleteItem: async (id: string) => {
    const all = await storage.getItems();
    const filtered = all.filter(i => String(i.id) !== String(id));
    return await saveData(ITEMS_DIR_KEY, filtered);
  },
  overwriteItems: async (items: ItemMaster[]) => {
    return await saveData(ITEMS_DIR_KEY, items);
  },
  getShowrooms: async (): Promise<Showroom[]> => {
    const parsed = await getData<Showroom>(SHOWROOMS_DIR_KEY);
    return ensureIds(parsed);
  },
  saveShowroom: async (showroom: Showroom) => {
    const all = await storage.getShowrooms();
    const updated = [...all, showroom];
    return await saveData(SHOWROOMS_DIR_KEY, updated);
  },
  updateShowroom: async (updated: Showroom) => {
    const all = await storage.getShowrooms();
    const index = all.findIndex(s => String(s.id) === String(updated.id));
    if (index > -1) {
      all[index] = updated;
      return await saveData(SHOWROOMS_DIR_KEY, all);
    }
    return all;
  },
  deleteShowroom: async (id: string) => {
    const all = await storage.getShowrooms();
    const filtered = all.filter(s => String(s.id) !== String(id));
    return await saveData(SHOWROOMS_DIR_KEY, filtered);
  },
  overwriteShowrooms: async (showrooms: Showroom[]) => {
    return await saveData(SHOWROOMS_DIR_KEY, showrooms);
  },
  getAttendance: async (): Promise<any[]> => {
    return await getData<any>(ATTENDANCE_KEY);
  },
  saveAttendance: async (entry: any) => {
    const all = await storage.getAttendance();
    const updated = [entry, ...all];
    return await saveData(ATTENDANCE_KEY, updated);
  },
  getConveyances: async (): Promise<Conveyance[]> => {
    const parsed = await getData<Conveyance>(CONVEYANCE_KEY);
    return ensureIds(parsed);
  },
  saveConveyance: async (conv: Conveyance) => {
    const all = await storage.getConveyances();
    const toSave = { ...conv, id: conv.id || generateId() };
    const updated = [toSave, ...all];
    return await saveData(CONVEYANCE_KEY, updated);
  },
  updateConveyance: async (updated: Conveyance) => {
    const all = await storage.getConveyances();
    const index = all.findIndex(c => String(c.id) === String(updated.id));
    if (index > -1) {
      all[index] = updated;
      return await saveData(CONVEYANCE_KEY, all);
    }
    return all;
  },
  deleteConveyance: async (id: string) => {
    const all = await storage.getConveyances();
    const filtered = all.filter(c => String(c.id) !== String(id));
    return await saveData(CONVEYANCE_KEY, filtered);
  },
  overwriteConveyances: async (conveyances: Conveyance[]) => {
    return await saveData(CONVEYANCE_KEY, conveyances);
  },
  getCollections: async (): Promise<Collection[]> => {
    const parsed = await getData<Collection>(COLLECTIONS_KEY);
    return ensureIds(parsed);
  },
  saveCollection: async (collection: Collection) => {
    const all = await storage.getCollections();
    const toSave = { ...collection, id: collection.id || generateId() };
    const updated = [toSave, ...all];
    return await saveData(COLLECTIONS_KEY, updated);
  },
  updateCollection: async (updated: Collection) => {
    const all = await storage.getCollections();
    const index = all.findIndex(c => String(c.id) === String(updated.id));
    if (index > -1) {
      all[index] = updated;
      return await saveData(COLLECTIONS_KEY, all);
    }
    return all;
  },
  getBanks: async (): Promise<Bank[]> => {
    const parsed = await getData<Bank>(BANKS_KEY);
    return ensureIds(parsed);
  },
  saveBank: async (bank: Bank) => {
    const all = await storage.getBanks();
    const toSave = { ...bank, id: bank.id || generateId() };
    const updated = [toSave, ...all];
    return await saveData(BANKS_KEY, updated);
  },
  getBankDeposits: async (): Promise<BankDeposit[]> => {
    const parsed = await getData<BankDeposit>(BANK_DEPOSITS_KEY);
    return ensureIds(parsed);
  },
  saveBankDeposit: async (deposit: BankDeposit) => {
    const all = await storage.getBankDeposits();
    const toSave = { ...deposit, id: deposit.id || generateId() };
    const updated = [toSave, ...all];
    return await saveData(BANK_DEPOSITS_KEY, updated);
  },
  saveDraft: (data: any) => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  },
  getDraft: () => {
    const data = localStorage.getItem(DRAFT_KEY);
    return data ? JSON.parse(data) : null;
  },
  clearDraft: () => {
    localStorage.removeItem(DRAFT_KEY);
  },
  exportFullBackup: (): string => {
    const backup: Record<string, string> = {};
    backup[BACKUP_SIG_KEY] = 'ASSETREQ_V1';
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('corpo_')) {
        backup[key] = localStorage.getItem(key) || '';
      }
    }
    return JSON.stringify(backup);
  },
  importFullBackup: (json: string): boolean => {
    try {
      if (!json || json.trim() === '') return false;
      const backup: Record<string, any> = JSON.parse(json);
      const backupKeys = Object.keys(backup);
      if (!backupKeys.some(k => k.startsWith('corpo_'))) return false;
      Object.keys(localStorage).filter(k => k.startsWith('corpo_')).forEach(k => localStorage.removeItem(k));
      Object.entries(backup).forEach(([key, value]) => {
        if (key.startsWith('corpo_') && typeof value === 'string') {
          localStorage.setItem(key, value);
        }
      });
      return true;
    } catch (e) {
      return false;
    }
  }
};
