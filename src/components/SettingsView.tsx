import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Settings,
  Download,
  Upload,
  Database,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  FileJson,
  ShieldCheck,
  Building2,
  Users,
  Layers,
  Wallet,
  DollarSign,
  ArrowLeft,
  X,
  HardDrive,
  Check,
  Landmark,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Search,
  Package,
  FileText,
  Info,
  ListChecks,
  Keyboard,
  Mail,
  Key,
  Eye,
  EyeOff,
  ExternalLink,
  Send,
  AlertCircle,
  Phone,
  RotateCcw,
  Plus,
  Edit3,
  Cloud,
  Server,
  Globe,
  Clock,
  CloudUpload,
  Sparkles,
  Activity,
  Car,
  Coffee,
  Utensils,
  Palette,
  Zap
} from 'lucide-react';
import {
  Item,
  Party,
  Salesperson,
  StoredBill,
  FactoryImportChallan,
  StockReturnChallan,
  DeliveryChallan,
  ExpenseEntry,
  CollectionMR,
  BankDeposit,
  CompanyDetails,
  BillHeader,
  BackupDataPackage,
  AuthUser,
  BranchLocation,
  Requisition,
  ColorExchangeChallan,
  ConveyanceEntry,
  DesignationAllowanceSetting
} from '../types';
import {
  getDesignationAllowanceSettings,
  saveDesignationAllowanceSettings,
  DEFAULT_DESIGNATION_ALLOWANCES
} from '../utils/allowanceSettings';
import { Trash } from './Trash';
import { getBankAndAccountShortTag } from './BankAndAccountDirectory';
import { BankAndAccountDirectory } from './BankAndAccountDirectory';
import { KeyboardShortcutsTable } from './KeyboardShortcutsTable';
import { UserRoleMenuPermissionsSetting } from './UserRoleMenuPermissionsSetting';
import { isAnyAdmin } from '../utils/branchAccess';
import { getAllCategories } from '../utils/categoryHelper';
import { defaultBanks, defaultAccounts } from '../data/defaultData';
import { unrecordDeletedEntityIds, unrecordDeletedIdsLocally, resetGlobalDeletedIds, removeIdsFromAllTrashStorages, getClientSyncId } from '../utils/deletedTracker';
import { safeSetStorageItem, idbSaveFailoverData, idbGetFailoverData } from '../utils/indexedDbStorage';
import { syncSpecialItemRatesWithBaseItems } from '../utils/stockHelper';
import { syncActiveSnapshotWithCatalogItems } from '../utils/priceCircularHelper';
import { THEME_OPTIONS, AppTheme, applyTheme, getStoredTheme } from '../utils/themeManager';
import {
  getPrimaryFirestoreAccountInfo,
  subscribeCloudSyncDiagnostics,
  PrimaryFirestoreAccountInfo,
  CloudSyncDiagnosticState,
  getCloudSyncDiagnosticState
} from '../firebase';
import {
  getCloudFailoverConfig,
  saveCloudFailoverConfig,
  executeFailoverCloudStore,
  executeFailoverCloudStoreAsync,
  addCloudStorageNode,
  updateCloudStorageNode,
  deleteCloudStorageNode,
  syncToSpecificCloudNode,
  syncToSpecificCloudNodeAsync,
  getCloudNodeBackupData,
  activateAllCloudNodes,
  inactivateAllCloudNodes,
  addAllFreeCloudNodes,
  resetCloudNodeQuota,
  failoverFromExhaustedNodeToNext,
  publishCloudFailoverStateToServer,
  fetchCloudFailoverStateFromServer,
  clearInMemoryFailoverQueue,
  CloudFailoverConfig,
  CloudStorageNode,
  CloudProviderType
} from '../utils/cloudSyncManager';
import {
  getAutomatedBackupStatus,
  setAutomatedBackupEnabled,
  executeAutomatedDailyBackup,
  AutoBackupStatus
} from '../utils/autoBackupManager';

export type { BackupDataPackage };

export interface RestoreConflictDiff {
  totalIncoming: number;
  totalNew: number;
  totalConflicts: number;
  newCounts: {
    items: number;
    parties: number;
    bills: number;
    salespersons: number;
    collections: number;
    expenses: number;
    deposits: number;
    imports: number;
    returns: number;
    challans: number;
    closings?: number;
    conveyances?: number;
    branches?: number;
    requisitions?: number;
  };
  conflictCounts: {
    items: number;
    parties: number;
    bills: number;
    salespersons: number;
    collections: number;
    expenses: number;
    deposits: number;
    imports: number;
    returns: number;
    challans: number;
    closings?: number;
    conveyances?: number;
    branches?: number;
    requisitions?: number;
  };
  conflictDetails: Array<{
    type: string;
    key: string;
    currentLabel: string;
    incomingLabel: string;
  }>;
}

interface SettingsViewProps {
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  parties: Party[];
  setParties: React.Dispatch<React.SetStateAction<Party[]>>;
  salespersons: Salesperson[];
  setSalespersons: React.Dispatch<React.SetStateAction<Salesperson[]>>;
  storedBills: StoredBill[];
  setStoredBills: React.Dispatch<React.SetStateAction<StoredBill[]>>;
  factoryImports: FactoryImportChallan[];
  setFactoryImports: React.Dispatch<React.SetStateAction<FactoryImportChallan[]>>;
  stockReturns: StockReturnChallan[];
  setStockReturns: React.Dispatch<React.SetStateAction<StockReturnChallan[]>>;
  deliveryChallans?: DeliveryChallan[];
  setDeliveryChallans?: React.Dispatch<React.SetStateAction<DeliveryChallan[]>>;
  expenses: ExpenseEntry[];
  setExpenses: React.Dispatch<React.SetStateAction<ExpenseEntry[]>>;
  collections: CollectionMR[];
  setCollections: React.Dispatch<React.SetStateAction<CollectionMR[]>>;
  bankDeposits: BankDeposit[];
  setBankDeposits: React.Dispatch<React.SetStateAction<BankDeposit[]>>;
  closings?: any[];
  setClosings?: React.Dispatch<React.SetStateAction<any[]>>;
  company: CompanyDetails;
  setCompany: React.Dispatch<React.SetStateAction<CompanyDetails>>;
  header: BillHeader;
  setHeader: React.Dispatch<React.SetStateAction<BillHeader>>;
  bankList?: string[];
  setBankList?: React.Dispatch<React.SetStateAction<string[]>>;
  onAddBank?: (name: string) => void;
  onDeleteBank?: (name: string) => void;
  onEditBank?: (oldName: string, newName: string) => void;
  onResetBanks?: () => void;
  accountList?: string[];
  setAccountList?: React.Dispatch<React.SetStateAction<string[]>>;
  onAddAccount?: (name: string) => void;
  onDeleteAccount?: (name: string) => void;
  onEditAccount?: (oldName: string, newName: string) => void;
  onResetAccounts?: () => void;
  branches?: BranchLocation[];
  setBranches?: React.Dispatch<React.SetStateAction<BranchLocation[]>>;
  requisitions?: Requisition[];
  setRequisitions?: React.Dispatch<React.SetStateAction<Requisition[]>>;
  colorExchanges?: ColorExchangeChallan[];
  setColorExchanges?: React.Dispatch<React.SetStateAction<ColorExchangeChallan[]>>;
  conveyances?: ConveyanceEntry[];
  setConveyances?: React.Dispatch<React.SetStateAction<ConveyanceEntry[]>>;
  onRestoreAllData: (dataPkg: BackupDataPackage) => void;
  scheduleCloudSync?: (slice: Record<string, any>, immediate?: boolean) => void;
  initialTab?: 'backup' | 'banks_accounts' | 'email_smtp' | 'trash' | 'system' | 'shortcuts' | 'user_roles_menus' | 'allowance_settings' | 'theme_appearance';
  currentUser?: AuthUser | null;
  onUpdateSalesperson?: (sp: Salesperson) => void;
  currentTheme?: any;
  setCurrentTheme?: (theme: any) => void;
  onThemeChange?: (theme: any) => void;
  onBack?: () => void;
  onClose?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  items,
  setItems,
  parties,
  setParties,
  salespersons,
  setSalespersons,
  storedBills,
  setStoredBills,
  factoryImports,
  setFactoryImports,
  stockReturns,
  setStockReturns,
  deliveryChallans = [],
  setDeliveryChallans,
  expenses,
  setExpenses,
  collections,
  setCollections,
  bankDeposits,
  setBankDeposits,
  conveyances: propsConveyances = [],
  setConveyances: propsSetConveyances,
  closings = [],
  setClosings: propsSetClosings,
  company,
  setCompany,
  header,
  setHeader,
  bankList: propsBankList,
  setBankList: propsSetBankList,
  onAddBank: propsOnAddBank,
  onDeleteBank: propsOnDeleteBank,
  onEditBank: propsOnEditBank,
  onResetBanks: propsOnResetBanks,
  accountList: propsAccountList,
  setAccountList: propsSetAccountList,
  onAddAccount: propsOnAddAccount,
  onDeleteAccount: propsOnDeleteAccount,
  onEditAccount: propsOnEditAccount,
  onResetAccounts: propsOnResetAccounts,
  branches = [],
  setBranches,
  requisitions = [],
  setRequisitions,
  colorExchanges = [],
  setColorExchanges,
  onRestoreAllData,
  scheduleCloudSync,
  initialTab,
  currentUser,
  onUpdateSalesperson,
  currentTheme,
  setCurrentTheme,
  onThemeChange,
  onBack,
  onClose
}) => {
  const isSuperAdmin = currentUser?.role === 'admin' ||
    currentUser?.isSuperAdmin === true ||
    currentUser?.username === 'suvroadmin' ||
    (currentUser?.userRole || '').toLowerCase().includes('super admin') ||
    (currentUser?.designation || '').toLowerCase().includes('managing director');

  const effectiveConveyances = useMemo(() => {
    if (Array.isArray(propsConveyances) && propsConveyances.length > 0) return propsConveyances;
    try {
      const saved = localStorage.getItem('polycables_conveyances');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return propsConveyances || [];
  }, [propsConveyances]);

  const effectiveBranches = useMemo(() => {
    if (Array.isArray(branches) && branches.length > 0) return branches;
    try {
      const saved = localStorage.getItem('polycables_branches');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return branches || [];
  }, [branches]);

  const effectiveRequisitions = useMemo(() => {
    if (Array.isArray(requisitions) && requisitions.length > 0) return requisitions;
    try {
      const saved = localStorage.getItem('polycables_requisitions');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return requisitions || [];
  }, [requisitions]);

  const [activeTab, setActiveTab] = useState<'backup' | 'banks_accounts' | 'email_smtp' | 'trash' | 'system' | 'shortcuts' | 'user_roles_menus' | 'allowance_settings' | 'theme_appearance'>(() => {
    return initialTab || 'backup';
  });
  const [selectedThemeId, setSelectedThemeId] = useState<AppTheme>(() => (currentTheme as AppTheme) || getStoredTheme());
  useEffect(() => {
    if (currentTheme) {
      setSelectedThemeId(currentTheme as AppTheme);
    }
  }, [currentTheme]);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Designation-wise Lunch & Hotel Bill Allowance Settings State
  const [allowanceList, setAllowanceList] = useState<DesignationAllowanceSetting[]>(() => getDesignationAllowanceSettings());
  const salesListDesignations = useMemo(() => {
    const uniqueMap = new Map<string, string>();
    (salespersons || []).forEach((sp) => {
      const raw = String(sp.designation || sp.role || '').trim();
      if (!raw) return;
      const key = raw.toLowerCase();
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, raw);
      }
    });
    return Array.from(uniqueMap.values()).sort((a, b) => a.localeCompare(b));
  }, [salespersons]);

  useEffect(() => {
    if (!salesListDesignations.length) return;
    setAllowanceList((prev) => {
      const existingNorm = new Set(prev.map((a) => a.designation.trim().toLowerCase()));
      const additions: DesignationAllowanceSetting[] = [];
      salesListDesignations.forEach((desig, idx) => {
        const norm = desig.trim().toLowerCase();
        if (!existingNorm.has(norm)) {
          existingNorm.add(norm);
          const fallbackMatch = DEFAULT_DESIGNATION_ALLOWANCES.find(
            (d) =>
              d.designation.toLowerCase().includes(norm) ||
              norm.includes(d.designation.toLowerCase()) ||
              (norm.includes('in-charge') && d.id === 'desig-incharge') ||
              (norm.includes('incharge') && d.id === 'desig-incharge') ||
              (norm.includes('marketing') && d.id === 'desig-marketing') ||
              (norm.includes('manager') && d.id === 'desig-manager') ||
              (norm.includes('driver') && d.id === 'desig-driver')
          );
          additions.push({
            id: `desig-sync-${Date.now()}-${idx}-${norm.replace(/[^a-z0-9]/g, '')}`,
            designation: desig,
            breakfast: fallbackMatch?.breakfast ?? 60,
            lunch: fallbackMatch?.lunch ?? 150,
            dinner: fallbackMatch?.dinner ?? 150,
            meal1Day: fallbackMatch?.meal1Day ?? 360,
            hotelBill: fallbackMatch?.hotelBill ?? 800,
            description: 'Synced from Sales Center & User List'
          });
        }
      });
      if (additions.length === 0) return prev;
      const next = [...prev, ...additions];
      saveDesignationAllowanceSettings(next, scheduleCloudSync);
      return next;
    });
  }, [salesListDesignations, scheduleCloudSync]);

  const resolveAllowanceForUser = (sp: Salesperson): DesignationAllowanceSetting => {
    const raw = String(sp.designation || sp.role || '').trim();
    const norm = raw.toLowerCase();
    const exact = allowanceList.find((a) => a.designation.trim().toLowerCase() === norm);
    if (exact) return exact;
    const partial = allowanceList.find(
      (a) =>
        norm &&
        (a.designation.trim().toLowerCase().includes(norm) ||
          norm.includes(a.designation.trim().toLowerCase()))
    );
    if (partial) return partial;
    if (norm.includes('in-charge') || norm.includes('incharge')) {
      return allowanceList.find((a) => a.id === 'desig-incharge') || allowanceList[0] || DEFAULT_DESIGNATION_ALLOWANCES[0];
    }
    if (norm.includes('marketing') || norm.includes('executive') || norm.includes('sales')) {
      return allowanceList.find((a) => a.id === 'desig-marketing') || allowanceList[0] || DEFAULT_DESIGNATION_ALLOWANCES[0];
    }
    if (norm.includes('manager') || norm.includes('agm')) {
      return allowanceList.find((a) => a.id === 'desig-manager') || allowanceList[0] || DEFAULT_DESIGNATION_ALLOWANCES[0];
    }
    return allowanceList[0] || DEFAULT_DESIGNATION_ALLOWANCES[0];
  };

  const [editingAllowanceId, setEditingAllowanceId] = useState<string | null>(null);
  const [editingAllowanceForm, setEditingAllowanceForm] = useState<Partial<DesignationAllowanceSetting>>({});
  const [isAddingAllowance, setIsAddingAllowance] = useState(false);
  const [newAllowanceForm, setNewAllowanceForm] = useState<Omit<DesignationAllowanceSetting, 'id'>>({
    designation: '',
    breakfast: 60,
    lunch: 150,
    dinner: 150,
    meal1Day: 360,
    hotelBill: 800,
    description: ''
  });

  const handleSaveAllowanceRow = (id: string) => {
    const updated = allowanceList.map((item) => {
      if (item.id === id) {
        const breakfast = Number(editingAllowanceForm.breakfast ?? item.breakfast) || 0;
        const lunch = Number(editingAllowanceForm.lunch ?? item.lunch) || 0;
        const dinner = Number(editingAllowanceForm.dinner ?? item.dinner) || 0;
        const meal1Day = Number(editingAllowanceForm.meal1Day ?? (breakfast + lunch + dinner)) || (breakfast + lunch + dinner);
        const hotelBill = Number(editingAllowanceForm.hotelBill ?? item.hotelBill) || 0;
        return {
          ...item,
          ...editingAllowanceForm,
          breakfast,
          lunch,
          dinner,
          meal1Day,
          hotelBill,
          description: editingAllowanceForm.description !== undefined ? editingAllowanceForm.description : item.description
        };
      }
      return item;
    });
    setAllowanceList(updated);
    saveDesignationAllowanceSettings(updated, scheduleCloudSync);
    setEditingAllowanceId(null);
    setEditingAllowanceForm({});
    setToastMsg({ text: 'Designation allowance updated successfully.', type: 'success' });
  };

  const handleAddNewAllowance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAllowanceForm.designation.trim()) {
      setToastMsg({ text: 'Please enter a valid designation name.', type: 'error' });
      return;
    }
    const newEntry: DesignationAllowanceSetting = {
      id: `desig-${Date.now()}`,
      designation: newAllowanceForm.designation.trim(),
      breakfast: Number(newAllowanceForm.breakfast) || 0,
      lunch: Number(newAllowanceForm.lunch) || 0,
      dinner: Number(newAllowanceForm.dinner) || 0,
      meal1Day: Number(newAllowanceForm.meal1Day) || (Number(newAllowanceForm.breakfast) + Number(newAllowanceForm.lunch) + Number(newAllowanceForm.dinner)),
      hotelBill: Number(newAllowanceForm.hotelBill) || 0,
      description: newAllowanceForm.description?.trim() || ''
    };
    const updated = [...allowanceList, newEntry];
    setAllowanceList(updated);
    saveDesignationAllowanceSettings(updated, scheduleCloudSync);
    setIsAddingAllowance(false);
    setNewAllowanceForm({
      designation: '',
      breakfast: 60,
      lunch: 150,
      dinner: 150,
      meal1Day: 360,
      hotelBill: 800,
      description: ''
    });
    setToastMsg({ text: `Added allowance settings for "${newEntry.designation}".`, type: 'success' });
  };

  const handleDeleteAllowance = (id: string, name: string) => {
    const updated = allowanceList.filter((item) => item.id !== id);
    setAllowanceList(updated);
    saveDesignationAllowanceSettings(updated, scheduleCloudSync);
    setToastMsg({ text: `Allowance setting for "${name}" removed.`, type: 'info' });
  };

  const handleResetAllowanceDefaults = () => {
    setAllowanceList(DEFAULT_DESIGNATION_ALLOWANCES);
    saveDesignationAllowanceSettings(DEFAULT_DESIGNATION_ALLOWANCES, scheduleCloudSync);
    setToastMsg({ text: 'Reset to Poly Cables official standard allowance rates.', type: 'success' });
  };

  useEffect(() => {
    if (initialTab) {
      if (initialTab === 'user_roles_menus' && !isSuperAdmin) {
        setActiveTab('backup');
      } else {
        setActiveTab(initialTab);
      }
    }
  }, [initialTab, isSuperAdmin]);

  // Email & SMTP Configuration State
  const [smtpConfig, setSmtpConfig] = useState<{
    host: string;
    port: string;
    user: string;
    pass: string;
    from: string;
    secure: boolean;
  }>(() => {
    const saved = localStorage.getItem('polycables_smtp_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return {
      host: 'smtp.gmail.com',
      port: '465',
      user: 'madhupursc2026@gmail.com',
      pass: 'xcfqpgacrfpzraxe',
      from: 'Madhupur Sales Center <madhupursc2026@gmail.com>',
      secure: true
    };
  });

  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isTestingSmtp, setIsTestingSmtp] = useState<boolean>(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ ok: boolean; message: string; advice?: string } | null>(null);

  // Cloud Failover & Multi-Cloud Node Configuration
  const [cloudConfig, setCloudConfig] = useState<CloudFailoverConfig>(() => getCloudFailoverConfig());
  const [primaryFirestoreInfo, setPrimaryFirestoreInfo] = useState<PrimaryFirestoreAccountInfo>(() => getPrimaryFirestoreAccountInfo());
  const [cloudDiagnostics, setCloudDiagnostics] = useState<CloudSyncDiagnosticState>(() => getCloudSyncDiagnosticState());
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(false);
  const [syncingNodeId, setSyncingNodeId] = useState<string | null>(null);
  const [showAddCloudModal, setShowAddCloudModal] = useState<boolean>(false);
  const [editingCloudNodeId, setEditingCloudNodeId] = useState<string | null>(null);
  const [cloudNodeForm, setCloudNodeForm] = useState<{
    name: string;
    accountEmail: string;
    provider: CloudProviderType;
    projectId: string;
    databaseUrl: string;
    apiKey: string;
    region: string;
    priority: number;
    quotaLimitMb: number;
    autoFailover: boolean;
  }>({
    name: '',
    accountEmail: '',
    provider: 'firebase',
    projectId: '',
    databaseUrl: '',
    apiKey: '',
    region: 'asia-southeast1',
    priority: (getCloudFailoverConfig().cloudNodes?.length || 2) + 1,
    quotaLimitMb: 1024,
    autoFailover: true
  });

  useEffect(() => {
    const handleConfigUpdate = (e: any) => {
      if (e.detail) setCloudConfig(e.detail);
      setPrimaryFirestoreInfo(getPrimaryFirestoreAccountInfo());
    };
    const handleStorageUpdate = () => {
      setCloudConfig(getCloudFailoverConfig());
      setPrimaryFirestoreInfo(getPrimaryFirestoreAccountInfo());
    };
    const unsubDiag = subscribeCloudSyncDiagnostics((diag) => {
      setCloudDiagnostics(diag);
      setPrimaryFirestoreInfo(getPrimaryFirestoreAccountInfo());
    });
    window.addEventListener('polycables_cloud_config_updated', handleConfigUpdate);
    window.addEventListener('storage', handleStorageUpdate);
    fetchCloudFailoverStateFromServer().then((remoteCfg) => {
      if (remoteCfg) setCloudConfig(remoteCfg);
    }).catch(() => {});
    return () => {
      unsubDiag();
      window.removeEventListener('polycables_cloud_config_updated', handleConfigUpdate);
      window.removeEventListener('storage', handleStorageUpdate);
    };
  }, []);

  const handleUpdateCloudConfig = (partial: Partial<CloudFailoverConfig>) => {
    const updated = saveCloudFailoverConfig(partial);
    setCloudConfig(updated);
    publishCloudFailoverStateToServer(updated, getClientSyncId());
    setToastMsg({ text: 'Cloud Storage & Failover Settings Updated.', type: 'success' });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const buildCurrentCloudPayload = () => ({
    items,
    parties,
    salespersons,
    storedBills,
    factoryImports,
    stockReturns,
    deliveryChallans,
    expenses,
    conveyances: effectiveConveyances,
    collections,
    bankDeposits,
    closings,
    branches: effectiveBranches,
    requisitions: effectiveRequisitions,
    company,
    header,
    timestamp: new Date().toISOString()
  });

  const handleTriggerManualCloudFailoverSync = async () => {
    setIsCloudSyncing(true);
    try {
      const payload = buildCurrentCloudPayload();
      const result = await executeFailoverCloudStoreAsync(payload, getClientSyncId());
      const updatedCfg = getCloudFailoverConfig();
      setCloudConfig(updatedCfg);
      setPrimaryFirestoreInfo(getPrimaryFirestoreAccountInfo());
      if (result.ok) {
        setToastMsg({
          text: `✓ Synchronized across Multi-Cloud Pool! Active target: ${result.node?.name || 'Connected Node'} (${updatedCfg.cloudNodes?.filter(n => n.status !== 'disabled' && n.status !== 'quota_exhausted').length || 1} ready nodes).`,
          type: 'success'
        });
      } else {
        setToastMsg({ text: 'Sync queued in failover buffer — checking next available free cloud node.', type: 'info' });
      }
    } catch (err: any) {
      setToastMsg({ text: `Sync error: ${err.message}`, type: 'error' });
    } finally {
      setIsCloudSyncing(false);
      setTimeout(() => setToastMsg(null), 4000);
    }
  };

  const handleAddAllFreeClouds = () => {
    try {
      const updated = addAllFreeCloudNodes();
      setCloudConfig(updated);
      publishCloudFailoverStateToServer(updated, getClientSyncId());
      setToastMsg({
        text: `✓ Added & Connected all ${updated.cloudNodes?.length || 10} Zero-Cost Free Cloud Providers (Firebase, Supabase, Backblaze B2, Cloudflare R2, Google Cloud, AWS S3, Appwrite, Neon, Server Hub)!`,
        type: 'success'
      });
    } catch (err: any) {
      setToastMsg({ text: `Failed to add all free clouds: ${err?.message || err}`, type: 'error' });
    }
    setTimeout(() => setToastMsg(null), 4500);
  };

  const handleActivateAllNodes = () => {
    try {
      const updated = activateAllCloudNodes();
      setCloudConfig(updated);
      publishCloudFailoverStateToServer(updated, getClientSyncId());
      setToastMsg({
        text: `✓ All ${updated.cloudNodes?.length || 0} Free Cloud Storage Nodes are now ACTIVE and armed for automatic failover!`,
        type: 'success'
      });
    } catch (err: any) {
      setToastMsg({ text: `Activation error: ${err.message}`, type: 'error' });
    }
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handleInactivateAllNodes = () => {
    try {
      const updated = inactivateAllCloudNodes();
      setCloudConfig(updated);
      publishCloudFailoverStateToServer(updated, getClientSyncId());
      setToastMsg({
        text: 'Secondary cloud storage nodes placed on standby.',
        type: 'info'
      });
    } catch (err: any) {
      setToastMsg({ text: `Inactivation error: ${err.message}`, type: 'error' });
    }
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handleSyncSingleCloudNode = async (node: CloudStorageNode) => {
    setSyncingNodeId(node.id);
    try {
      const payload = buildCurrentCloudPayload();
      const res = await syncToSpecificCloudNodeAsync(node.id, payload, getClientSyncId());
      setCloudConfig(getCloudFailoverConfig());
      if (res.ok) {
        setToastMsg({
          text: `✓ Synced full ERP snapshot to "${res.node?.name || node.name}" (${res.node?.accountEmail || node.accountEmail})!`,
          type: 'success'
        });
      } else {
        setToastMsg({ text: `Node "${node.name}" quota/connection failover triggered. Active failover node updated.`, type: 'info' });
      }
    } catch (err: any) {
      setToastMsg({ text: `Node sync error: ${err.message}`, type: 'error' });
    } finally {
      setSyncingNodeId(null);
      setTimeout(() => setToastMsg(null), 3500);
    }
  };

  const handleResetNodeQuota = (node: CloudStorageNode) => {
    const updated = resetCloudNodeQuota(node.id, getClientSyncId());
    setCloudConfig(updated);
    setToastMsg({
      text: `✓ Quota & health status reset for "${node.name}" (${node.accountEmail}).`,
      type: 'success'
    });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleTestSequentialFailover = async () => {
    setIsCloudSyncing(true);
    try {
      const sorted = [...(cloudConfig.cloudNodes || [])].sort((a, b) => a.priority - b.priority);
      const currentTarget =
        sorted.find((n) => n.id === cloudConfig.activeFailoverNodeId && n.status !== 'quota_exhausted' && n.status !== 'disabled') ||
        sorted.find((n) => n.status !== 'quota_exhausted' && n.status !== 'disabled');

      if (!currentTarget) {
        setToastMsg({ text: 'All secondary nodes are currently disabled or exhausted. Reset a node quota first.', type: 'error' });
        return;
      }

      const { config: updatedCfg, nextNode } = failoverFromExhaustedNodeToNext(
        currentTarget.id,
        `Quota limit reached on #${currentTarget.priority} (${currentTarget.accountEmail}) — auto-failed over to next free cloud account`,
        getClientSyncId()
      );
      setCloudConfig(updatedCfg);
      const payload = buildCurrentCloudPayload();
      await executeFailoverCloudStoreAsync(payload, getClientSyncId());
      setCloudConfig(getCloudFailoverConfig());
      setToastMsg({
        text: nextNode
          ? `✓ Failover verified! #${currentTarget.priority} (${currentTarget.accountEmail}) full -> Auto-switched to #${nextNode.priority} (${nextNode.accountEmail}) across all devices.`
          : `✓ #${currentTarget.priority} marked full -> Auto-routed to Multi-Device Server Sync Hub.`,
        type: 'success'
      });
    } catch (err: any) {
      setToastMsg({ text: `Failover check error: ${err?.message || err}`, type: 'error' });
    } finally {
      setIsCloudSyncing(false);
      setTimeout(() => setToastMsg(null), 4500);
    }
  };

  const handleRestoreFromCloudNode = (node: CloudStorageNode) => {
    const snap = getCloudNodeBackupData(node.id);
    if (!snap || (!snap.items && !snap.storedBills && !snap.parties)) {
      setToastMsg({
        text: `No stored snapshot found in "${node.name}" yet. Click "Sync Node" first to push a backup.`,
        type: 'error'
      });
      setTimeout(() => setToastMsg(null), 4000);
      return;
    }
    if (onRestoreAllData) {
      onRestoreAllData({
        version: '2.0',
        backupDate: snap.timestamp || new Date().toISOString(),
        exportedAt: snap.timestamp || new Date().toISOString(),
        appName: 'Poly Cables Multi-Cloud Restore',
        data: {
          _presentModules: {
            items: Array.isArray(snap.items),
            parties: Array.isArray(snap.parties),
            salespersons: Array.isArray(snap.salespersons),
            storedBills: Array.isArray(snap.storedBills),
            factoryImports: Array.isArray(snap.factoryImports),
            stockReturns: Array.isArray(snap.stockReturns),
            deliveryChallans: Array.isArray(snap.deliveryChallans),
            colorExchanges: Array.isArray(snap.colorExchanges),
            expenses: Array.isArray(snap.expenses),
            collections: Array.isArray(snap.collections),
            bankDeposits: Array.isArray(snap.bankDeposits),
            branches: Array.isArray(snap.branches),
            requisitions: Array.isArray(snap.requisitions),
            closings: Array.isArray(snap.closings)
          },
          items: snap.items || items,
          parties: snap.parties || parties,
          salespersons: snap.salespersons || salespersons,
          storedBills: snap.storedBills || storedBills,
          factoryImports: snap.factoryImports || factoryImports,
          stockReturns: snap.stockReturns || stockReturns,
          deliveryChallans: snap.deliveryChallans || deliveryChallans,
          colorExchanges: snap.colorExchanges || colorExchanges,
          expenses: snap.expenses || expenses,
          collections: snap.collections || collections,
          bankDeposits: snap.bankDeposits || bankDeposits,
          branches: snap.branches || branches,
          requisitions: snap.requisitions || requisitions,
          bankList: snap.bankList || effectiveBankList,
          accountList: snap.accountList || effectiveAccountList,
          orderedCategories: snap.orderedCategories,
          customCategories: snap.customCategories,
          closings: snap.closings || closings,
          company: snap.company || company,
          header: snap.header || header
        } as any
      });
      setToastMsg({
        text: `✓ Successfully restored application data from cloud node "${node.name}" (${node.accountEmail})!`,
        type: 'success'
      });
      setTimeout(() => setToastMsg(null), 4500);
    }
  };

  const handleOpenAddCloudModal = () => {
    setEditingCloudNodeId(null);
    setCloudNodeForm({
      name: '',
      accountEmail: '',
      provider: 'firebase',
      projectId: '',
      databaseUrl: '',
      apiKey: '',
      region: 'asia-southeast1',
      priority: (cloudConfig.cloudNodes?.length || 0) + 1,
      quotaLimitMb: 1024,
      autoFailover: true
    });
    setShowAddCloudModal(true);
  };

  const handleOpenEditCloudNode = (node: CloudStorageNode) => {
    setEditingCloudNodeId(node.id);
    setCloudNodeForm({
      name: node.name,
      accountEmail: node.accountEmail,
      provider: node.provider,
      projectId: node.projectId || '',
      databaseUrl: node.databaseUrl || '',
      apiKey: node.apiKey || '',
      region: node.region || 'asia-southeast1',
      priority: node.priority || 1,
      quotaLimitMb: node.quotaLimitMb || 1024,
      autoFailover: node.autoFailover !== false
    });
    setShowAddCloudModal(true);
  };

  const handleSaveCloudNodeForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloudNodeForm.name.trim() || !cloudNodeForm.accountEmail.trim()) {
      setToastMsg({ text: 'Please enter a Cloud Node Name and Account Email.', type: 'error' });
      setTimeout(() => setToastMsg(null), 3500);
      return;
    }
    const cleanProjectId = cloudNodeForm.projectId.trim() || `${cloudNodeForm.accountEmail.split('@')[0]}-cloud-erp`;
    const cleanDbUrl = cloudNodeForm.databaseUrl.trim() || (
      cloudNodeForm.provider === 'firebase'
        ? `https://${cleanProjectId}.firebaseio.com`
        : cloudNodeForm.provider === 'supabase'
        ? `https://${cleanProjectId}.supabase.co`
        : cloudNodeForm.provider === 'appwrite'
        ? 'https://cloud.appwrite.io/v1'
        : cloudNodeForm.provider === 'neon'
        ? `https://${cleanProjectId}.ap-southeast-1.aws.neon.tech`
        : cloudNodeForm.provider === 'server_sync'
        ? '/api/sync'
        : `https://storage.googleapis.com/${cleanProjectId}`
    );

    if (editingCloudNodeId) {
      const updated = updateCloudStorageNode(editingCloudNodeId, {
        name: cloudNodeForm.name.trim(),
        accountEmail: cloudNodeForm.accountEmail.trim(),
        provider: cloudNodeForm.provider,
        projectId: cleanProjectId,
        databaseUrl: cleanDbUrl,
        apiKey: cloudNodeForm.apiKey.trim(),
        region: cloudNodeForm.region.trim() || 'asia-southeast1',
        priority: Number(cloudNodeForm.priority) || 1,
        quotaLimitMb: Number(cloudNodeForm.quotaLimitMb) || 1024,
        autoFailover: cloudNodeForm.autoFailover
      });
      setCloudConfig(updated);
      setToastMsg({ text: `✓ Cloud node "${cloudNodeForm.name.trim()}" updated.`, type: 'success' });
    } else {
      const updated = addCloudStorageNode({
        name: cloudNodeForm.name.trim(),
        accountEmail: cloudNodeForm.accountEmail.trim(),
        provider: cloudNodeForm.provider,
        projectId: cleanProjectId,
        databaseUrl: cleanDbUrl,
        apiKey: cloudNodeForm.apiKey.trim(),
        region: cloudNodeForm.region.trim() || 'asia-southeast1',
        priority: Number(cloudNodeForm.priority) || ((cloudConfig.cloudNodes?.length || 0) + 1),
        status: 'standby',
        quotaLimitMb: Number(cloudNodeForm.quotaLimitMb) || 1024,
        autoFailover: cloudNodeForm.autoFailover
      });
      setCloudConfig(updated);
      setToastMsg({ text: `✓ New cloud storage node "${cloudNodeForm.name.trim()}" added to multi-cloud pool!`, type: 'success' });
    }
    setShowAddCloudModal(false);
    setEditingCloudNodeId(null);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handleDeleteCloudNode = (node: CloudStorageNode) => {
    const updated = deleteCloudStorageNode(node.id);
    setCloudConfig(updated);
    setToastMsg({ text: `Removed cloud node "${node.name}".`, type: 'success' });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Fixed Phone & WhatsApp Configuration
  const [fixedPhone, setFixedPhone] = useState<string>(() => {
    return localStorage.getItem('polycables_my_whatsapp_number') || localStorage.getItem('polycables_fixed_phone') || '+8801713434290';
  });

  const handleSaveFixedPhone = () => {
    const trimmed = fixedPhone.trim() || '+8801713434290';
    localStorage.setItem('polycables_my_whatsapp_number', trimmed);
    localStorage.setItem('polycables_fixed_phone', trimmed);
    setToastMsg({ text: `✓ Fixed phone number saved: ${trimmed}`, type: 'success' });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleResetToDefaultSmtp = () => {
    const defaultCfg = {
      host: 'smtp.gmail.com',
      port: '465',
      user: 'madhupursc2026@gmail.com',
      pass: 'xcfqpgacrfpzraxe',
      from: 'Madhupur Sales Center <madhupursc2026@gmail.com>',
      secure: true
    };
    setSmtpConfig(defaultCfg);
    localStorage.setItem('polycables_smtp_config', JSON.stringify(defaultCfg));
    setSmtpTestResult({
      ok: true,
      message: '✓ Reset to official Poly Cables verified sender (madhupursc2026@gmail.com)!'
    });
    setToastMsg({ text: '✓ Reset to official Poly Cables sender!', type: 'success' });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleSaveSmtp = () => {
    localStorage.setItem('polycables_smtp_config', JSON.stringify(smtpConfig));
    setToastMsg({ text: '✓ Email & SMTP configuration saved successfully!', type: 'success' });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleTestSmtp = async () => {
    if (!smtpConfig.user || !smtpConfig.pass) {
      setSmtpTestResult({
        ok: false,
        message: 'Please enter your Gmail address and 16-character Google App Password first.'
      });
      return;
    }
    setIsTestingSmtp(true);
    setSmtpTestResult(null);
    try {
      const res = await fetch('/api/test-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smtpConfig })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSmtpTestResult({ ok: true, message: data.message || 'SMTP Connection Verified! Ready to dispatch emails.' });
        localStorage.setItem('polycables_smtp_config', JSON.stringify(smtpConfig));
        setToastMsg({ text: '✓ SMTP connection verified successfully!', type: 'success' });
        setTimeout(() => setToastMsg(null), 3500);
      } else {
        setSmtpTestResult({
          ok: false,
          message: data.error || 'Authentication failed with SMTP server',
          advice: data.advice
        });
      }
    } catch (err: any) {
      setSmtpTestResult({ ok: false, message: err.message || 'Network error testing SMTP server' });
    } finally {
      setIsTestingSmtp(false);
    }
  };

  // Local fallback states if not passed via props
  const [localBankList, setLocalBankList] = useState<string[]>(() => {
    const saved = localStorage.getItem('polycables_bank_list');
    return saved ? JSON.parse(saved) : defaultBanks;
  });
  const [localAccountList, setLocalAccountList] = useState<string[]>(() => {
    const saved = localStorage.getItem('polycables_account_list');
    return saved ? JSON.parse(saved) : defaultAccounts;
  });

  const effectiveBankList = (propsBankList && propsBankList.length > 0) ? propsBankList : ((localBankList && localBankList.length > 0) ? localBankList : defaultBanks);
  const effectiveAccountList = (propsAccountList && propsAccountList.length > 0) ? propsAccountList : ((localAccountList && localAccountList.length > 0) ? localAccountList : defaultAccounts);

  const toSafeStr = (v: any) => (typeof v === 'string' ? v : (v?.name || v?.bankName || v?.accountName || String(v || ''))).trim();

  const handleAddBank = (name: string) => {
    const clean = toSafeStr(name);
    if (!clean) return;
    if (propsOnAddBank) {
      propsOnAddBank(clean);
    } else {
      setLocalBankList((prev) => {
        const safePrev = (prev || []).map(toSafeStr).filter(Boolean);
        if (safePrev.some((b) => b.toLowerCase() === clean.toLowerCase())) return safePrev;
        const next = [clean, ...safePrev];
        localStorage.setItem('polycables_bank_list', JSON.stringify(next));
        return next;
      });
    }
  };

  const handleDeleteBank = (name: string) => {
    const target = toSafeStr(name).toLowerCase();
    if (propsOnDeleteBank) {
      propsOnDeleteBank(name);
    }
    setLocalBankList((prev) => {
      const next = (prev || []).map(toSafeStr).filter((b) => b && b.toLowerCase() !== target);
      localStorage.setItem('polycables_bank_list', JSON.stringify(next));
      return next;
    });
  };

  const handleEditBank = (oldName: string, newName: string) => {
    const clean = toSafeStr(newName);
    if (!clean) return;
    const oldTarget = toSafeStr(oldName).toLowerCase();
    if (propsOnEditBank) {
      propsOnEditBank(oldName, clean);
    }
    setLocalBankList((prev) => {
      const next = (prev || []).map(toSafeStr).filter(Boolean).map((b) => (b.toLowerCase() === oldTarget ? clean : b));
      localStorage.setItem('polycables_bank_list', JSON.stringify(next));
      return next;
    });
  };

  const handleResetBanks = () => {
    if (propsOnResetBanks) {
      propsOnResetBanks();
    }
    setLocalBankList(defaultBanks);
    localStorage.setItem('polycables_bank_list', JSON.stringify(defaultBanks));
  };

  const handleAddAccount = (name: string) => {
    const clean = toSafeStr(name);
    if (!clean) return;
    if (propsOnAddAccount) {
      propsOnAddAccount(clean);
    }
    setLocalAccountList((prev) => {
      const safePrev = (prev || []).map(toSafeStr).filter(Boolean);
      if (safePrev.some((a) => a.toLowerCase() === clean.toLowerCase())) return safePrev;
      const next = [clean, ...safePrev];
      localStorage.setItem('polycables_account_list', JSON.stringify(next));
      return next;
    });
  };

  const handleDeleteAccount = (name: string) => {
    const target = toSafeStr(name).toLowerCase();
    if (propsOnDeleteAccount) {
      propsOnDeleteAccount(name);
    }
    setLocalAccountList((prev) => {
      const next = (prev || []).map(toSafeStr).filter((a) => a && a.toLowerCase() !== target);
      localStorage.setItem('polycables_account_list', JSON.stringify(next));
      return next;
    });
  };

  const handleEditAccount = (oldName: string, newName: string) => {
    const clean = toSafeStr(newName);
    if (!clean) return;
    const oldTarget = toSafeStr(oldName).toLowerCase();
    if (propsOnEditAccount) {
      propsOnEditAccount(oldName, clean);
    }
    setLocalAccountList((prev) => {
      const next = (prev || []).map(toSafeStr).filter(Boolean).map((a) => (a.toLowerCase() === oldTarget ? clean : a));
      localStorage.setItem('polycables_account_list', JSON.stringify(next));
      return next;
    });
  };

  const handleResetAccounts = () => {
    if (propsOnResetAccounts) {
      propsOnResetAccounts();
    }
    setLocalAccountList(defaultAccounts);
    localStorage.setItem('polycables_account_list', JSON.stringify(defaultAccounts));
  };


  // Restore file state
  const [uploadedFileContent, setUploadedFileContent] = useState<BackupDataPackage | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [showConfirmRestoreModal, setShowConfirmRestoreModal] = useState(false);
  const [restoreConflictDiff, setRestoreConflictDiff] = useState<RestoreConflictDiff | null>(null);
  const [restoreConflictStrategy, setRestoreConflictStrategy] = useState<'keep_existing' | 'overwrite_existing' | 'keep_both'>('overwrite_existing');
  const [showConflictDetails, setShowConflictDetails] = useState<boolean>(false);
  const [selectedRestoreModules, setSelectedRestoreModules] = useState<{
    depositHistory: boolean;
    cashInHand: boolean;
    collectionList: boolean;
    factoryImports: boolean;
    monthlyExpense: boolean;
    expenseEntryLog: boolean;
    storedBills: boolean;
    masterItems: boolean;
    parties: boolean;
    challansAndReturns: boolean;
    salespersons: boolean;
    conveyances: boolean;
    branches?: boolean;
    requisitions?: boolean;
  }>({
    depositHistory: true,
    cashInHand: true,
    collectionList: true,
    factoryImports: true,
    monthlyExpense: true,
    expenseEntryLog: true,
    storedBills: true,
    masterItems: true,
    parties: true,
    challansAndReturns: true,
    salespersons: true,
    conveyances: true,
    branches: true,
    requisitions: true
  });
  const [restoreSuccessSummary, setRestoreSuccessSummary] = useState<{
    itemCount: number;
    partyCount: number;
    billCount: number;
    collectionCount: number;
    depositCount: number;
    expenseCount: number;
    newStoredCount: number;
    existingResolvedCount: number;
    backupDate?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!restoreSuccessSummary) return;
    const timer = window.setTimeout(() => {
      setRestoreSuccessSummary(null);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [restoreSuccessSummary]);

  // Single Item Backup & Restore States ("when backup and restore, can single item do it")
  const [singleBackupEntityType, setSingleBackupEntityType] = useState<'item' | 'bill' | 'party' | 'module'>('item');
  const [selectedSingleItemId, setSelectedSingleItemId] = useState<string>('');
  const [selectedSingleBillId, setSelectedSingleBillId] = useState<string>('');
  const [selectedSinglePartyId, setSelectedSinglePartyId] = useState<string>('');
  const [singleBackupSearch, setSingleBackupSearch] = useState<string>('');

  // Uploaded Single Item / Record to Restore directly
  const [uploadedSingleItem, setUploadedSingleItem] = useState<Item | null>(null);
  const [uploadedSingleBill, setUploadedSingleBill] = useState<StoredBill | null>(null);
  const [uploadedSingleParty, setUploadedSingleParty] = useState<Party | null>(null);

  // Restore Modal Mode ('full' vs 'single')
  const [restoreModalMode, setRestoreModalMode] = useState<'full' | 'single'>('full');
  // Live System Database Record Counts & Statistics
  const cleanBankDeposits = useMemo(() => {
    return bankDeposits.filter((d) => !d.isAutoDeposit && !d.id.startsWith('auto-ho-'));
  }, [bankDeposits]);

  const currentBanksList = propsBankList || defaultBanks;

  const [catSyncTick, setCatSyncTick] = useState(0);

  useEffect(() => {
    const bumpCategories = () => setCatSyncTick((t) => t + 1);
    window.addEventListener('categories-updated', bumpCategories);
    window.addEventListener('storage', bumpCategories);
    return () => {
      window.removeEventListener('categories-updated', bumpCategories);
      window.removeEventListener('storage', bumpCategories);
    };
  }, []);

  const categoriesCount = useMemo(() => {
    const catSet = new Set<string>();
    try {
      getAllCategories().forEach((c) => {
        const trimmed = String(c || '').trim();
        if (trimmed) catSet.add(trimmed.toLowerCase());
      });
      items.forEach((it) => {
        const cat = String(it?.category || '').trim();
        if (cat && cat.toLowerCase() !== 'general') {
          catSet.add(cat.toLowerCase());
        }
      });
      const savedDel = localStorage.getItem('polycables_deleted_categories');
      if (savedDel) {
        const parsed = JSON.parse(savedDel);
        if (Array.isArray(parsed)) {
          parsed.forEach((d: any) => catSet.delete(String(d || '').toLowerCase().trim()));
        }
      }
    } catch {}
    return catSet.size;
  }, [items, catSyncTick]);

  const trashedCount = useMemo(() => {
    try {
      const savedTI = localStorage.getItem('polycables_trashed_items');
      const savedTP = localStorage.getItem('polycables_trashed_parties');
      const savedTC = localStorage.getItem('polycables_trashed_collections');
      const savedTCh = localStorage.getItem('polycables_trashed_challans');
      const ti = savedTI ? JSON.parse(savedTI) : [];
      const tp = savedTP ? JSON.parse(savedTP) : [];
      const tc = savedTC ? JSON.parse(savedTC) : [];
      const tch = savedTCh ? JSON.parse(savedTCh) : [];
      return (ti.length || 0) + (tp.length || 0) + (tc.length || 0) + (tch.length || 0);
    } catch {}
    return 0;
  }, [catSyncTick]);

  const uploadedStats = useMemo(() => {
    if (!uploadedFileContent || !uploadedFileContent.data) return null;
    const d = uploadedFileContent.data as any;
    const invCount = (d.storedBills?.length ?? 0) || (d.stored_bills?.length ?? 0);
    const itCount = d.items?.length ?? 0;
    const custCount = d.parties?.length ?? 0;
    const spCount = d.salespersons?.length ?? 0;
    const colCount = d.collections?.length ?? 0;
    const expCount = d.expenses?.length ?? 0;
    const depCount = (d.bankDeposits?.length ?? 0) || (d.bank_deposits?.length ?? 0);
    const factCount = (d.factoryImports?.length ?? 0) || (d.factory_imports?.length ?? 0);
    const retCount = (d.stockReturns?.length ?? 0) || (d.stock_returns?.length ?? 0);
    const catSet = new Set<string>();
    (Array.isArray(d.customCategories) ? d.customCategories : []).forEach((c: any) => {
      const s = String(c || '').trim();
      if (s) catSet.add(s.toLowerCase());
    });
    (Array.isArray(d.orderedCategories) ? d.orderedCategories : []).forEach((c: any) => {
      const s = String(c || '').trim();
      if (s) catSet.add(s.toLowerCase());
    });
    if (catSet.size === 0 && Array.isArray(d.items)) {
      d.items.forEach((it: any) => {
        const s = String(it?.category || '').trim();
        if (s && s.toLowerCase() !== 'general') catSet.add(s.toLowerCase());
      });
    }
    const catCount = catSet.size;
    const bankCount = (d.bankList?.length ?? 0) || (d.bank_list?.length ?? 0);
    const trCount = (d.trashedItems?.length ?? 0) + (d.trashedParties?.length ?? 0) + (d.trashedCollections?.length ?? 0) + (d.trashedChallans?.length ?? 0);
    const userCount = d.salespersons?.length ?? 0;
    const convCount = (d.conveyances?.length ?? 0) || (d.conveyanceBills?.length ?? 0);
    const branchCount = (d.branches?.length ?? 0) || (d.salesCenters?.length ?? 0) || (d.sales_centers?.length ?? 0) || (d.outlets?.length ?? 0) || (d.showrooms?.length ?? 0);
    const reqCount = (d.requisitions?.length ?? 0) || (d.branchRequisitions?.length ?? 0);
    const partyStmtCount = custCount;
    return {
      invCount,
      itCount,
      custCount,
      spCount,
      colCount,
      expCount,
      depCount,
      factCount,
      retCount,
      catCount,
      bankCount,
      trCount,
      userCount,
      convCount,
      branchCount,
      reqCount,
      partyStmtCount
    };
  }, [uploadedFileContent]);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMsg({ text, type: type === 'info' ? 'success' : type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Automated Daily Cloud Backup States
  const [autoBackupStatus, setAutoBackupStatus] = useState<AutoBackupStatus>(() => getAutomatedBackupStatus());
  const [isTriggeringAutoBackup, setIsTriggeringAutoBackup] = useState<boolean>(false);

  useEffect(() => {
    const handleUpdate = () => {
      setAutoBackupStatus(getAutomatedBackupStatus());
    };
    window.addEventListener('polycables_auto_backup_completed', handleUpdate);
    window.addEventListener('polycables_auto_backup_config_changed', handleUpdate);
    return () => {
      window.removeEventListener('polycables_auto_backup_completed', handleUpdate);
      window.removeEventListener('polycables_auto_backup_config_changed', handleUpdate);
    };
  }, []);

  const handleToggleAutoBackup = (enabled: boolean) => {
    setAutomatedBackupEnabled(enabled);
    setAutoBackupStatus(getAutomatedBackupStatus());
    showToast(
      enabled
        ? '✓ Automated Daily Cloud Backups enabled. Snapshots will upload automatically every 24 hours.'
        : 'Automated Daily Cloud Backups disabled.',
      'info'
    );
  };

  const handleManualDailyBackupTrigger = async () => {
    setIsTriggeringAutoBackup(true);
    try {
      const res = await executeAutomatedDailyBackup(() => ({
        storedBills,
        items,
        parties,
        salespersons,
        collections,
        expenses,
        bankDeposits: cleanBankDeposits,
        factoryImports,
        stockReturns,
        closings,
        deliveryChallans,
        colorExchanges,
        conveyances: effectiveConveyances,
        branches: effectiveBranches,
        requisitions: effectiveRequisitions,
        customCategories: (window as any)._customCategories || [],
        orderedCategories: (window as any)._orderedCategories || [],
        bankList: effectiveBankList,
        accountList: effectiveAccountList,
        company,
        header
      }), {
        force: true,
        notify: true,
        showToast: (msg, type) => showToast(msg, type === 'error' ? 'error' : 'success')
      });
      setAutoBackupStatus(getAutomatedBackupStatus());
    } catch (err: any) {
      showToast('Manual daily backup failed: ' + (err?.message || err), 'error');
    } finally {
      setIsTriggeringAutoBackup(false);
    }
  };

  // Helper to compute conflict & new records diff
  const computeRestoreDiff = (pkg: BackupDataPackage): RestoreConflictDiff => {
    const d = pkg.data || {};
    const rawD: any = d;
    const inItems = (Array.isArray(d.items) ? d.items : []).filter((x) => x && typeof x === 'object');
    const inParties = (Array.isArray(d.parties) ? d.parties : []).filter((x) => x && typeof x === 'object');
    const inBills = (Array.isArray(d.storedBills) ? d.storedBills : (Array.isArray(rawD.stored_bills) ? rawD.stored_bills : [])).filter((x) => x && typeof x === 'object');
    const inSalespersons = (Array.isArray(d.salespersons) ? d.salespersons : []).filter((x) => x && typeof x === 'object');
    const inCollections = (Array.isArray(d.collections) ? d.collections : []).filter((x) => x && typeof x === 'object');
    const inExpenses = (Array.isArray(d.expenses) ? d.expenses : []).filter((x) => x && typeof x === 'object');
    const inDeposits = (Array.isArray(d.bankDeposits) ? d.bankDeposits : (Array.isArray(rawD.bank_deposits) ? rawD.bank_deposits : [])).filter((x) => x && typeof x === 'object');
    const inImports = (Array.isArray(d.factoryImports) ? d.factoryImports : (Array.isArray(rawD.factory_imports) ? rawD.factory_imports : [])).filter((x) => x && typeof x === 'object');
    const inReturns = (Array.isArray(d.stockReturns) ? d.stockReturns : (Array.isArray(rawD.stock_returns) ? rawD.stock_returns : [])).filter((x) => x && typeof x === 'object');
    const inChallans = (Array.isArray(d.deliveryChallans) ? d.deliveryChallans : (Array.isArray(rawD.delivery_challans) ? rawD.delivery_challans : [])).filter((x) => x && typeof x === 'object');

    const currentItemIds = new Set(items.map((i) => i.id));
    const currentItemNames = new Set(items.map((i) => (i.name || '').trim().toLowerCase()));
    let newItems = 0, conflictItems = 0;
    const conflictDetails: Array<{ type: string; key: string; currentLabel: string; incomingLabel: string }> = [];

    inItems.forEach((it) => {
      const isConflict = currentItemIds.has(it.id) || currentItemNames.has((it.name || '').trim().toLowerCase());
      if (isConflict) {
        conflictItems++;
        if (conflictDetails.length < 15) {
          conflictDetails.push({
            type: 'Product / Item',
            key: it.name,
            currentLabel: `Existing: ${it.name} (Rate: ৳${it.rate || 0})`,
            incomingLabel: `Backup: ${it.name} (Rate: ৳${it.rate || 0})`
          });
        }
      } else {
        newItems++;
      }
    });

    const currentPartyIds = new Set(parties.map((p) => p.id));
    const currentPartyNames = new Set(parties.map((p) => (p.name || '').trim().toLowerCase()));
    let newParties = 0, conflictParties = 0;
    inParties.forEach((p) => {
      const isConflict = currentPartyIds.has(p.id) || currentPartyNames.has((p.name || '').trim().toLowerCase());
      if (isConflict) {
        conflictParties++;
        if (conflictDetails.length < 15) {
          conflictDetails.push({
            type: 'Customer / Party',
            key: p.name,
            currentLabel: `Existing: ${p.name} (${p.phone || 'No phone'})`,
            incomingLabel: `Backup: ${p.name} (${p.phone || 'No phone'})`
          });
        }
      } else {
        newParties++;
      }
    });

    const currentBillIds = new Set(storedBills.map((b) => b.id));
    const currentBillKeys = new Set(storedBills.map((b) => {
      const isOff = Boolean(b.isOfficeBill || b.header?.isOfficeBill);
      const sp = (b.header?.salespersonName || b.header?.salesmanCode || '').trim().toLowerCase();
      return `${isOff ? `off::${sp}` : 'show'}::${(b.header?.billNo || '').trim().toLowerCase()}::${(b.header?.partyName || '').trim().toLowerCase()}`;
    }));
    let newBills = 0, conflictBills = 0;
    inBills.forEach((b) => {
      const isOff = Boolean(b.isOfficeBill || b.header?.isOfficeBill);
      const sp = (b.header?.salespersonName || b.header?.salesmanCode || '').trim().toLowerCase();
      const key = `${isOff ? `off::${sp}` : 'show'}::${(b.header?.billNo || '').trim().toLowerCase()}::${(b.header?.partyName || '').trim().toLowerCase()}`;
      const isConflict = currentBillIds.has(b.id) || (b.header?.billNo && currentBillKeys.has(key));
      if (isConflict) {
        conflictBills++;
        if (conflictDetails.length < 15) {
          conflictDetails.push({
            type: 'Bill Invoice',
            key: `Bill #${b.header?.billNo || ''}`,
            currentLabel: `Existing: Invoice #${b.header?.billNo || ''} - ${b.header?.partyName || ''} (৳${b.grandTotal?.toLocaleString('en-IN') || 0})`,
            incomingLabel: `Backup: Invoice #${b.header?.billNo || ''} - ${b.header?.partyName || ''} (৳${b.grandTotal?.toLocaleString('en-IN') || 0})`
          });
        }
      } else {
        newBills++;
      }
    });

    const currentSpCodes = new Set(salespersons.map((s) => (s.code || '').trim().toLowerCase()));
    let newSalespersons = 0, conflictSalespersons = 0;
    inSalespersons.forEach((s) => {
      if (s.code && currentSpCodes.has(s.code.trim().toLowerCase())) {
        conflictSalespersons++;
      } else {
        newSalespersons++;
      }
    });

    const currentCollIds = new Set(collections.map((c) => c.id));
    const currentCollMr = new Set(collections.map((c) => (c.mrNo || '').trim().toLowerCase()).filter(Boolean));
    let newCollections = 0, conflictCollections = 0;
    inCollections.forEach((c) => {
      if (currentCollIds.has(c.id) || (c.mrNo && currentCollMr.has(c.mrNo.trim().toLowerCase()))) {
        conflictCollections++;
      } else {
        newCollections++;
      }
    });

    const currentExpIds = new Set(expenses.map((e) => e.id));
    const currentExpKeys = new Set(expenses.map((e) => `${e.date}::${(e.entityName || '').trim().toLowerCase()}::${(e.expenseHead || '').trim().toLowerCase()}::${e.amount}`));
    let newExpenses = 0, conflictExpenses = 0;
    inExpenses.forEach((e) => {
      const expKey = `${e.date}::${(e.entityName || '').trim().toLowerCase()}::${(e.expenseHead || '').trim().toLowerCase()}::${e.amount}`;
      if (currentExpIds.has(e.id) || currentExpKeys.has(expKey)) {
        conflictExpenses++;
      } else {
        newExpenses++;
      }
    });

    const currentDepIds = new Set(bankDeposits.map((d) => d.id));
    let newDeposits = 0, conflictDeposits = 0;
    inDeposits.forEach((d) => {
      if (currentDepIds.has(d.id)) {
        conflictDeposits++;
      } else {
        newDeposits++;
      }
    });

    const currentImpIds = new Set(factoryImports.map((i) => i.id));
    const currentImpChallanNos = new Set(factoryImports.map((i) => i.challanNo).filter(Boolean));
    let newImports = 0, conflictImports = 0;
    inImports.forEach((i) => {
      if (currentImpIds.has(i.id) || (i.challanNo && currentImpChallanNos.has(i.challanNo))) {
        conflictImports++;
      } else {
        newImports++;
      }
    });

    const currentRetIds = new Set(stockReturns.map((r) => r.id));
    let newReturns = 0, conflictReturns = 0;
    inReturns.forEach((r) => {
      if (currentRetIds.has(r.id)) {
        conflictReturns++;
      } else {
        newReturns++;
      }
    });

    const currentChallanIds = new Set(deliveryChallans.map((c) => c.id));
    const currentChallanNos = new Set(deliveryChallans.map((c) => c.challanNo).filter(Boolean));
    let newChallans = 0, conflictChallans = 0;
    inChallans.forEach((c) => {
      if (currentChallanIds.has(c.id) || (c.challanNo && currentChallanNos.has(c.challanNo))) {
        conflictChallans++;
      } else {
        newChallans++;
      }
    });

    const inClosings = Array.isArray(d.closings) ? d.closings : [];
    const currentClosings = closings || [];
    const currentClosingIds = new Set(currentClosings.map((c: any) => c.id || c.date));
    const currentClosingDateKeys = new Set(currentClosings.filter((c: any) => c?.date).map((c: any) => `${c.date}::${c.branchId || ''}`));
    let newClosings = 0, conflictClosings = 0;
    inClosings.forEach((cl: any) => {
      if (currentClosingIds.has(cl.id) || (cl.date && currentClosingDateKeys.has(`${cl.date}::${cl.branchId || ''}`))) {
        conflictClosings++;
      } else {
        newClosings++;
      }
    });

    const inConveyances = (Array.isArray(d.conveyances) ? d.conveyances : (Array.isArray(rawD.conveyanceBills) ? rawD.conveyanceBills : [])).filter((x) => x && typeof x === 'object');
    const currentConvIds = new Set(effectiveConveyances.map((c: any) => c.id).filter(Boolean));
    let newConveyances = 0, conflictConveyances = 0;
    inConveyances.forEach((c: any) => {
      if (c.id && currentConvIds.has(c.id)) {
        conflictConveyances++;
      } else {
        newConveyances++;
      }
    });

    const inBranches = (Array.isArray(d.branches) ? d.branches : (Array.isArray(rawD.salesCenters) ? rawD.salesCenters : (Array.isArray(rawD.sales_centers) ? rawD.sales_centers : (Array.isArray(rawD.outlets) ? rawD.outlets : (Array.isArray(rawD.showrooms) ? rawD.showrooms : []))))).filter((x) => x && typeof x === 'object');
    const currentBranchIds = new Set(effectiveBranches.map((b: any) => b.id).filter(Boolean));
    const currentBranchNames = new Set(effectiveBranches.map((b: any) => String(b.name || b.branchName || '').trim().toLowerCase()).filter(Boolean));
    let newBranches = 0, conflictBranches = 0;
    inBranches.forEach((b: any) => {
      const bName = String(b.name || b.branchName || '').trim().toLowerCase();
      if ((b.id && currentBranchIds.has(b.id)) || (bName && currentBranchNames.has(bName))) {
        conflictBranches++;
      } else {
        newBranches++;
      }
    });

    const inRequisitions = (Array.isArray(d.requisitions) ? d.requisitions : (Array.isArray(rawD.branchRequisitions) ? rawD.branchRequisitions : [])).filter((x) => x && typeof x === 'object');
    const currentReqIds = new Set(effectiveRequisitions.map((r: any) => r.id).filter(Boolean));
    let newRequisitions = 0, conflictRequisitions = 0;
    inRequisitions.forEach((r: any) => {
      if (r.id && currentReqIds.has(r.id)) {
        conflictRequisitions++;
      } else {
        newRequisitions++;
      }
    });

    const totalNew = newItems + newParties + newBills + newSalespersons + newCollections + newExpenses + newDeposits + newImports + newReturns + newChallans + newClosings + newConveyances + newBranches + newRequisitions;
    const totalConflicts = conflictItems + conflictParties + conflictBills + conflictSalespersons + conflictCollections + conflictExpenses + conflictDeposits + conflictImports + conflictReturns + conflictChallans + conflictClosings + conflictConveyances + conflictBranches + conflictRequisitions;
    const totalIncoming = inItems.length + inParties.length + inBills.length + inSalespersons.length + inCollections.length + inExpenses.length + inDeposits.length + inImports.length + inReturns.length + inChallans.length + inClosings.length + inConveyances.length + inBranches.length + inRequisitions.length;

    return {
      totalIncoming,
      totalNew,
      totalConflicts,
      newCounts: { items: newItems, parties: newParties, bills: newBills, salespersons: newSalespersons, collections: newCollections, expenses: newExpenses, deposits: newDeposits, imports: newImports, returns: newReturns, challans: newChallans, closings: newClosings, conveyances: newConveyances, branches: newBranches, requisitions: newRequisitions },
      conflictCounts: { items: conflictItems, parties: conflictParties, bills: conflictBills, salespersons: conflictSalespersons, collections: conflictCollections, expenses: conflictExpenses, deposits: conflictDeposits, imports: conflictImports, returns: conflictReturns, challans: conflictChallans, closings: conflictClosings, conveyances: conflictConveyances, branches: conflictBranches, requisitions: conflictRequisitions },
      conflictDetails
    };
  };

  // Helper to merge dataset based on chosen strategy, present keys in backup, and selected modules
  const mergeWithResolution = (
    pkg: BackupDataPackage,
    strategy: 'keep_existing' | 'overwrite_existing' | 'keep_both',
    modulesToRestore = selectedRestoreModules
  ): BackupDataPackage => {
    const d = pkg.data || {};
    const rawD: any = d;
    const present: Record<string, boolean> | undefined = rawD._presentModules;
    const isSingleRecord = Boolean(rawD._isSingleRecord);
    const effectiveStrategy = isSingleRecord && strategy === 'overwrite_existing' ? 'single_upsert' : strategy;

    const hasModInBackup = (modKey: string, parsedArr: any[]): boolean => {
      if (present && typeof present === 'object') {
        return Boolean(present[modKey]);
      }
      return parsedArr.length > 0;
    };

    const inItems = (Array.isArray(d.items) ? d.items : (Array.isArray(rawD.products) ? rawD.products : (Array.isArray(rawD.masterItems) ? rawD.masterItems : []))).filter((x) => x && typeof x === 'object');
    const inParties = (Array.isArray(d.parties) ? d.parties : (Array.isArray(rawD.customers) ? rawD.customers : (Array.isArray(rawD.clients) ? rawD.clients : []))).filter((x) => x && typeof x === 'object');
    const inBills = (Array.isArray(d.storedBills) ? d.storedBills : (Array.isArray(rawD.stored_bills) ? rawD.stored_bills : (Array.isArray(rawD.bills) ? rawD.bills : (Array.isArray(rawD.invoices) ? rawD.invoices : [])))).filter((x) => x && typeof x === 'object');
    const inSalespersons = (Array.isArray(d.salespersons) ? d.salespersons : (Array.isArray(rawD.users) ? rawD.users : (Array.isArray(rawD.salesmen) ? rawD.salesmen : []))).filter((x) => x && typeof x === 'object');
    const inCollections = (Array.isArray(d.collections) ? d.collections : (Array.isArray(rawD.moneyReceipts) ? rawD.moneyReceipts : (Array.isArray(rawD.mrs) ? rawD.mrs : []))).filter((x) => x && typeof x === 'object');
    const inExpenses = (Array.isArray(d.expenses) ? d.expenses : (Array.isArray(rawD.monthlyExpenses) ? rawD.monthlyExpenses : [])).filter((x) => x && typeof x === 'object');
    const inDeposits = (Array.isArray(d.bankDeposits) ? d.bankDeposits : (Array.isArray(rawD.bank_deposits) ? rawD.bank_deposits : (Array.isArray(rawD.deposits) ? rawD.deposits : []))).filter((x) => x && typeof x === 'object');
    const inImports = (Array.isArray(d.factoryImports) ? d.factoryImports : (Array.isArray(rawD.factory_imports) ? rawD.factory_imports : (Array.isArray(rawD.imports) ? rawD.imports : []))).filter((x) => x && typeof x === 'object');
    const inReturns = (Array.isArray(d.stockReturns) ? d.stockReturns : (Array.isArray(rawD.stock_returns) ? rawD.stock_returns : (Array.isArray(rawD.returns) ? rawD.returns : []))).filter((x) => x && typeof x === 'object');
    const inChallans = (Array.isArray(d.deliveryChallans) ? d.deliveryChallans : (Array.isArray(rawD.delivery_challans) ? rawD.delivery_challans : (Array.isArray(rawD.challans) ? rawD.challans : []))).filter((x) => x && typeof x === 'object');
    const inClosings = (Array.isArray(d.closings) ? d.closings : (Array.isArray(rawD.cashInHand) ? rawD.cashInHand : [])).filter((x) => x && typeof x === 'object');
    const inBranches = (Array.isArray(d.branches) ? d.branches : (Array.isArray(rawD.salesCenters) ? rawD.salesCenters : (Array.isArray(rawD.sales_centers) ? rawD.sales_centers : (Array.isArray(rawD.outlets) ? rawD.outlets : (Array.isArray(rawD.showrooms) ? rawD.showrooms : []))))).filter((x) => x && typeof x === 'object');
    const inRequisitions = (Array.isArray(d.requisitions) ? d.requisitions : (Array.isArray(rawD.branchRequisitions) ? rawD.branchRequisitions : [])).filter((x) => x && typeof x === 'object');
    const inColorExchanges = (Array.isArray(d.colorExchanges) ? d.colorExchanges : (Array.isArray(rawD.color_exchanges) ? rawD.color_exchanges : [])).filter((x) => x && typeof x === 'object');
    const inConveyances = (Array.isArray(d.conveyances) ? d.conveyances : (Array.isArray(rawD.conveyanceBills) ? rawD.conveyanceBills : [])).filter((x) => x && typeof x === 'object');

    // 1. Items
    let mergedItems: Item[] = [...items];
    const applyItems = modulesToRestore.masterItems && hasModInBackup('items', inItems);
    if (applyItems) {
      if (effectiveStrategy === 'overwrite_existing' && (inItems.length > 0 || Boolean(present?.items))) {
        mergedItems = inItems;
      } else {
        const res = [...items];
        const byId = new Map<string, number>();
        const byName = new Map<string, number>();
        res.forEach((x, idx) => {
          if (x.id) byId.set(x.id, idx);
          const nm = (x.name || '').trim().toLowerCase();
          if (nm && !byName.has(nm)) byName.set(nm, idx);
        });
        inItems.forEach((it) => {
          const nm = (it.name || '').trim().toLowerCase();
          const existingIdx = (it.id && byId.has(it.id)) ? byId.get(it.id)! : (nm && byName.has(nm) ? byName.get(nm)! : -1);
          if (existingIdx >= 0) {
            if (effectiveStrategy === 'single_upsert') {
              res[existingIdx] = { ...res[existingIdx], ...it };
            } else if (effectiveStrategy === 'keep_both') {
              res.push({ ...it, id: `item-restored-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: `${it.name} (Backup)` });
            }
          } else {
            const newIdx = res.length;
            res.push(it);
            if (it.id) byId.set(it.id, newIdx);
            if (nm) byName.set(nm, newIdx);
          }
        });
        mergedItems = res;
      }
    }

    // 2. Parties (Customer Directory)
    let mergedParties: Party[] = [...parties];
    const applyParties = modulesToRestore.parties && hasModInBackup('parties', inParties);
    if (applyParties) {
      if (effectiveStrategy === 'overwrite_existing') {
        mergedParties = inParties;
      } else {
        const res = [...parties];
        const byId = new Map<string, number>();
        const byName = new Map<string, number>();
        res.forEach((x, idx) => {
          if (x.id) byId.set(x.id, idx);
          const nm = (x.name || '').trim().toLowerCase();
          if (nm && !byName.has(nm)) byName.set(nm, idx);
        });
        inParties.forEach((p) => {
          const nm = (p.name || '').trim().toLowerCase();
          const existingIdx = (p.id && byId.has(p.id)) ? byId.get(p.id)! : (nm && byName.has(nm) ? byName.get(nm)! : -1);
          if (existingIdx >= 0) {
            if (effectiveStrategy === 'single_upsert') {
              res[existingIdx] = { ...res[existingIdx], ...p };
            } else if (effectiveStrategy === 'keep_both') {
              res.push({ ...p, id: `party-restored-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: `${p.name} (Backup)` });
            }
          } else {
            const newIdx = res.length;
            res.push(p);
            if (p.id) byId.set(p.id, newIdx);
            if (nm) byName.set(nm, newIdx);
          }
        });
        mergedParties = res;
      }
    }

    // 3. Stored Bills
    let mergedBills: StoredBill[] = [...storedBills];
    const applyBills = modulesToRestore.storedBills && hasModInBackup('storedBills', inBills);
    if (applyBills) {
      if (effectiveStrategy === 'overwrite_existing') {
        mergedBills = inBills;
      } else {
        const res = [...storedBills];
        const getBillKey = (x: StoredBill) => {
          const xOff = Boolean(x.isOfficeBill || x.header?.isOfficeBill);
          const xSp = (x.header?.salespersonName || x.header?.salesmanCode || '').trim().toLowerCase();
          return `${xOff ? `off::${xSp}` : 'show'}::${(x.header?.billNo || '').trim().toLowerCase()}::${(x.header?.partyName || '').trim().toLowerCase()}`;
        };
        const byId = new Map<string, number>();
        const byKey = new Map<string, number>();
        res.forEach((x, idx) => {
          if (x.id) byId.set(x.id, idx);
          if (x.header?.billNo) {
            const k = getBillKey(x);
            if (!byKey.has(k)) byKey.set(k, idx);
          }
        });
        inBills.forEach((b) => {
          const bKey = b.header?.billNo ? getBillKey(b) : '';
          const existingIdx = (b.id && byId.has(b.id)) ? byId.get(b.id)! : (bKey && byKey.has(bKey) ? byKey.get(bKey)! : -1);
          if (existingIdx >= 0) {
            if (effectiveStrategy === 'single_upsert') {
              res[existingIdx] = b;
            } else if (effectiveStrategy === 'keep_both') {
              res.push({ ...b, id: `bill-restored-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });
            }
          } else {
            const newIdx = res.length;
            res.push(b);
            if (b.id) byId.set(b.id, newIdx);
            if (bKey) byKey.set(bKey, newIdx);
          }
        });
        mergedBills = res;
      }
    }

    // 4. Salespersons
    let mergedSp: Salesperson[] = [...salespersons];
    const applySp = modulesToRestore.salespersons && hasModInBackup('salespersons', inSalespersons);
    if (applySp) {
      if (effectiveStrategy === 'overwrite_existing') {
        mergedSp = inSalespersons;
      } else {
        const res = [...salespersons];
        const byId = new Map<string, number>();
        const byCode = new Map<string, number>();
        res.forEach((x, idx) => {
          if (x.id) byId.set(x.id, idx);
          const cd = (x.code || '').trim().toLowerCase();
          if (cd && !byCode.has(cd)) byCode.set(cd, idx);
        });
        inSalespersons.forEach((s) => {
          const cd = (s.code || '').trim().toLowerCase();
          const existingIdx = (s.id && byId.has(s.id)) ? byId.get(s.id)! : (cd && byCode.has(cd) ? byCode.get(cd)! : -1);
          if (existingIdx >= 0) {
            if (effectiveStrategy === 'single_upsert') {
              res[existingIdx] = { ...res[existingIdx], ...s };
            } else if (effectiveStrategy === 'keep_both') {
              res.push({ ...s, id: `sp-restored-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });
            }
          } else {
            const newIdx = res.length;
            res.push(s);
            if (s.id) byId.set(s.id, newIdx);
            if (cd) byCode.set(cd, newIdx);
          }
        });
        mergedSp = res;
      }
    }

    // 5. Collections (Collection List)
    let mergedColl: CollectionMR[] = [...collections];
    const applyColl = modulesToRestore.collectionList && hasModInBackup('collections', inCollections);
    if (applyColl) {
      if (effectiveStrategy === 'overwrite_existing') {
        mergedColl = inCollections;
      } else {
        const res = [...collections];
        const byId = new Map<string, number>();
        const byMr = new Map<string, number>();
        res.forEach((x, idx) => {
          if (x.id) byId.set(x.id, idx);
          const mr = (x.mrNo || '').trim().toLowerCase();
          if (mr && !byMr.has(mr)) byMr.set(mr, idx);
        });
        inCollections.forEach((c) => {
          const mr = (c.mrNo || '').trim().toLowerCase();
          const existingIdx = (c.id && byId.has(c.id)) ? byId.get(c.id)! : (mr && byMr.has(mr) ? byMr.get(mr)! : -1);
          if (existingIdx >= 0) {
            if (effectiveStrategy === 'single_upsert') {
              res[existingIdx] = { ...res[existingIdx], ...c };
            } else if (effectiveStrategy === 'keep_both') {
              res.push({ ...c, id: `mr-restored-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });
            }
          } else {
            const newIdx = res.length;
            res.push(c);
            if (c.id) byId.set(c.id, newIdx);
            if (mr) byMr.set(mr, newIdx);
          }
        });
        mergedColl = res;
      }
    }

    // 6. Expenses (Monthly Expense, Expense Entry & Log)
    let mergedExp: ExpenseEntry[] = [...expenses];
    const applyExp = (modulesToRestore.monthlyExpense || modulesToRestore.expenseEntryLog) && hasModInBackup('expenses', inExpenses);
    if (applyExp) {
      if (effectiveStrategy === 'overwrite_existing') {
        mergedExp = inExpenses;
      } else {
        const res = [...expenses];
        const getExpKey = (x: ExpenseEntry) => `${x.date}::${(x.entityName || '').trim().toLowerCase()}::${(x.expenseHead || '').trim().toLowerCase()}::${x.amount}`;
        const byId = new Map<string, number>();
        const byKey = new Map<string, number>();
        res.forEach((x, idx) => {
          if (x.id) byId.set(x.id, idx);
          const k = getExpKey(x);
          if (!byKey.has(k)) byKey.set(k, idx);
        });
        inExpenses.forEach((e) => {
          const expKey = getExpKey(e);
          const existingIdx = (e.id && byId.has(e.id)) ? byId.get(e.id)! : (byKey.has(expKey) ? byKey.get(expKey)! : -1);
          if (existingIdx >= 0) {
            if (effectiveStrategy === 'single_upsert') {
              res[existingIdx] = { ...res[existingIdx], ...e };
            } else if (effectiveStrategy === 'keep_both') {
              res.push({ ...e, id: `exp-restored-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });
            }
          } else {
            const newIdx = res.length;
            res.push(e);
            if (e.id) byId.set(e.id, newIdx);
            byKey.set(expKey, newIdx);
          }
        });
        mergedExp = res;
      }
    }

    // 7. Bank Deposits (Deposit History)
    const cleanInDeposits = inDeposits.filter((dp) => !dp.isAutoDeposit && !String(dp.id || '').startsWith('auto-ho-'));
    let mergedDep: BankDeposit[] = [...bankDeposits.filter((dp) => !dp.isAutoDeposit && !String(dp.id || '').startsWith('auto-ho-'))];
    const applyDep = modulesToRestore.depositHistory && hasModInBackup('bankDeposits', inDeposits);
    if (applyDep) {
      if (effectiveStrategy === 'overwrite_existing') {
        mergedDep = cleanInDeposits;
      } else {
        const res = [...mergedDep];
        const byId = new Map<string, number>();
        res.forEach((x, idx) => {
          if (x.id) byId.set(x.id, idx);
        });
        cleanInDeposits.forEach((dp) => {
          const existingIdx = (dp.id && byId.has(dp.id)) ? byId.get(dp.id)! : -1;
          if (existingIdx >= 0) {
            if (effectiveStrategy === 'single_upsert') {
              res[existingIdx] = { ...res[existingIdx], ...dp };
            } else if (effectiveStrategy === 'keep_both') {
              res.push({ ...dp, id: `dep-restored-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });
            }
          } else {
            const newIdx = res.length;
            res.push(dp);
            if (dp.id) byId.set(dp.id, newIdx);
          }
        });
        mergedDep = res;
      }
    }

    // 8. Factory Imports (Import from Factory List)
    let mergedImp: FactoryImportChallan[] = [...factoryImports];
    const applyImp = modulesToRestore.factoryImports && hasModInBackup('factoryImports', inImports);
    if (applyImp) {
      if (effectiveStrategy === 'overwrite_existing') {
        mergedImp = inImports;
      } else {
        const res = [...factoryImports];
        const byId = new Map<string, number>();
        const byCh = new Map<string, number>();
        res.forEach((x, idx) => {
          if (x.id) byId.set(x.id, idx);
          if (x.challanNo && !byCh.has(x.challanNo)) byCh.set(x.challanNo, idx);
        });
        inImports.forEach((imp) => {
          const existingIdx = (imp.id && byId.has(imp.id)) ? byId.get(imp.id)! : (imp.challanNo && byCh.has(imp.challanNo) ? byCh.get(imp.challanNo)! : -1);
          if (existingIdx >= 0) {
            if (effectiveStrategy === 'single_upsert') {
              res[existingIdx] = { ...res[existingIdx], ...imp };
            } else if (effectiveStrategy === 'keep_both') {
              res.push({ ...imp, id: `imp-restored-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });
            }
          } else {
            const newIdx = res.length;
            res.push(imp);
            if (imp.id) byId.set(imp.id, newIdx);
            if (imp.challanNo) byCh.set(imp.challanNo, newIdx);
          }
        });
        mergedImp = res;
      }
    }

    // 9. Stock Returns & Delivery Challans
    let mergedRet: StockReturnChallan[] = [...stockReturns];
    let mergedChallans: DeliveryChallan[] = [...deliveryChallans];
    const applyRet = modulesToRestore.challansAndReturns && hasModInBackup('stockReturns', inReturns);
    const applyCh = modulesToRestore.challansAndReturns && hasModInBackup('deliveryChallans', inChallans);
    if (applyRet) {
      if (effectiveStrategy === 'overwrite_existing') {
        mergedRet = inReturns;
      } else {
        const resRet = [...stockReturns];
        const byId = new Map<string, number>();
        resRet.forEach((x, idx) => {
          if (x.id) byId.set(x.id, idx);
        });
        inReturns.forEach((ret) => {
          const existingIdx = (ret.id && byId.has(ret.id)) ? byId.get(ret.id)! : -1;
          if (existingIdx >= 0) {
            if (effectiveStrategy === 'single_upsert') {
              resRet[existingIdx] = { ...resRet[existingIdx], ...ret };
            } else if (effectiveStrategy === 'keep_both') {
              resRet.push({ ...ret, id: `ret-restored-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });
            }
          } else {
            const newIdx = resRet.length;
            resRet.push(ret);
            if (ret.id) byId.set(ret.id, newIdx);
          }
        });
        mergedRet = resRet;
      }
    }
    if (applyCh) {
      if (effectiveStrategy === 'overwrite_existing') {
        mergedChallans = inChallans;
      } else {
        const resCh = [...deliveryChallans];
        const byId = new Map<string, number>();
        const byNo = new Map<string, number>();
        resCh.forEach((x, idx) => {
          if (x.id) byId.set(x.id, idx);
          if (x.challanNo && !byNo.has(x.challanNo)) byNo.set(x.challanNo, idx);
        });
        inChallans.forEach((ch) => {
          const existingIdx = (ch.id && byId.has(ch.id)) ? byId.get(ch.id)! : (ch.challanNo && byNo.has(ch.challanNo) ? byNo.get(ch.challanNo)! : -1);
          if (existingIdx >= 0) {
            if (effectiveStrategy === 'single_upsert') {
              resCh[existingIdx] = { ...resCh[existingIdx], ...ch };
            } else if (effectiveStrategy === 'keep_both') {
              resCh.push({ ...ch, id: `ch-restored-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });
            }
          } else {
            const newIdx = resCh.length;
            resCh.push(ch);
            if (ch.id) byId.set(ch.id, newIdx);
            if (ch.challanNo) byNo.set(ch.challanNo, newIdx);
          }
        });
        mergedChallans = resCh;
      }
    }

    // 10. Cash In Hand (closings / cash register records)
    const currentClosings = closings || [];
    let mergedClosings: any[] = [...currentClosings];
    const applyClosings = modulesToRestore.cashInHand && hasModInBackup('closings', inClosings);
    if (applyClosings) {
      if (effectiveStrategy === 'overwrite_existing') {
        mergedClosings = inClosings;
      } else {
        const resCl = [...currentClosings];
        const byId = new Map<string, number>();
        const byDate = new Map<string, number>();
        resCl.forEach((x: any, idx: number) => {
          if (x?.id) byId.set(x.id, idx);
          if (x?.date) {
            const k = `${x.date}::${x.branchId || ''}`;
            if (!byDate.has(k)) byDate.set(k, idx);
          }
        });
        inClosings.forEach((cl: any) => {
          const dk = cl?.date ? `${cl.date}::${cl.branchId || ''}` : '';
          const existingIdx = (cl?.id && byId.has(cl.id)) ? byId.get(cl.id)! : (dk && byDate.has(dk) ? byDate.get(dk)! : -1);
          if (existingIdx >= 0) {
            if (effectiveStrategy === 'single_upsert') {
              resCl[existingIdx] = { ...resCl[existingIdx], ...cl };
            } else if (effectiveStrategy === 'keep_both') {
              resCl.push({ ...cl, id: `closing-restored-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });
            }
          } else {
            const newIdx = resCl.length;
            resCl.push(cl);
            if (cl?.id) byId.set(cl.id, newIdx);
            if (dk) byDate.set(dk, newIdx);
          }
        });
        mergedClosings = resCl;
      }
    }

    const cleanListStrings = (arr: any[]) => Array.from(new Set(arr.map(toSafeStr).filter((s) => s && s !== '[object Object]' && !s.startsWith('[object '))));
    const incomingBanks = cleanListStrings(d.bankList || rawD.bank_list || []);
    const incomingAccounts = cleanListStrings(d.accountList || rawD.account_list || []);
    const mergedBankList = (effectiveStrategy === 'overwrite_existing' && incomingBanks.length > 0)
      ? incomingBanks
      : cleanListStrings([...effectiveBankList, ...incomingBanks]);
    const mergedAccountList = (effectiveStrategy === 'overwrite_existing' && incomingAccounts.length > 0)
      ? incomingAccounts
      : cleanListStrings([...effectiveAccountList, ...incomingAccounts]);
    const mergedCustomCategories = Array.from(new Set([...(d.customCategories || [])]));
    const mergedOrderedCategories = Array.from(new Set([...(d.orderedCategories || [])]));

    const upsertById = <T extends { id?: string }>(existingArr: T[], incomingArr: T[]): T[] => {
      if (effectiveStrategy === 'overwrite_existing') return incomingArr;
      const map = new Map<string, T>();
      existingArr.forEach((item) => {
        if (item?.id) map.set(item.id, item);
      });
      incomingArr.forEach((item) => {
        if (!item?.id) return;
        if (!map.has(item.id)) {
          map.set(item.id, item);
        } else if (effectiveStrategy === 'single_upsert') {
          map.set(item.id, { ...map.get(item.id)!, ...item });
        } else if (effectiveStrategy === 'keep_both') {
          const dupId = `${item.id}-restored-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
          map.set(dupId, { ...item, id: dupId });
        }
      });
      return Array.from(map.values());
    };

    const reconciledColl = mergedColl;
    const applyBranches = (modulesToRestore.branches ?? true) && hasModInBackup('branches', inBranches) && inBranches.length > 0;
    const applyRequisitions = (modulesToRestore.requisitions ?? true) && (inRequisitions.length > 0 || hasModInBackup('requisitions', inRequisitions));
    const applyColorExchanges = hasModInBackup('colorExchanges', inColorExchanges);
    const applyConveyances = (modulesToRestore.conveyances ?? true) && (inConveyances.length > 0 || hasModInBackup('conveyances', inConveyances));
    const mergedConveyances = inConveyances.length > 0
      ? upsertById(effectiveConveyances, inConveyances)
      : effectiveConveyances;

    return {
      version: pkg.version || '1.0.0',
      backupDate: pkg.backupDate || new Date().toISOString(),
      appTitle: pkg.appTitle || 'Polycables Store & Billing System',
      data: {
        ...d,
        _presentModules: {
          items: applyItems,
          parties: applyParties,
          storedBills: applyBills,
          salespersons: applySp,
          collections: applyColl,
          expenses: applyExp,
          bankDeposits: applyDep,
          factoryImports: applyImp,
          stockReturns: applyRet,
          deliveryChallans: applyCh,
          closings: applyClosings,
          branches: applyBranches,
          requisitions: applyRequisitions,
          colorExchanges: applyColorExchanges,
          conveyances: applyConveyances,
          trashedItems: Boolean(present?.trashedItems),
          trashedParties: Boolean(present?.trashedParties),
          trashedCollections: Boolean(present?.trashedCollections),
          trashedChallans: Boolean(present?.trashedChallans)
        },
        items: applyItems ? mergedItems : items,
        parties: applyParties ? mergedParties : parties,
        storedBills: applyBills ? mergedBills : storedBills,
        salespersons: applySp ? mergedSp : salespersons,
        collections: applyColl ? reconciledColl : collections,
        expenses: applyExp ? mergedExp : expenses,
        conveyances: applyConveyances ? mergedConveyances : effectiveConveyances,
        bankDeposits: applyDep ? mergedDep : bankDeposits,
        factoryImports: applyImp ? mergedImp : factoryImports,
        stockReturns: applyRet ? mergedRet : stockReturns,
        deliveryChallans: applyCh ? mergedChallans : deliveryChallans,
        closings: applyClosings ? mergedClosings : currentClosings,
        branches: applyBranches ? upsertById(effectiveBranches, inBranches) : effectiveBranches,
        requisitions: applyRequisitions ? upsertById(effectiveRequisitions, inRequisitions) : effectiveRequisitions,
        colorExchanges: applyColorExchanges ? upsertById(colorExchanges, inColorExchanges) : colorExchanges,
        bankList: mergedBankList,
        accountList: mergedAccountList,
        customCategories: mergedCustomCategories,
        orderedCategories: mergedOrderedCategories
      } as any
    };
  };

  // 1. Export Data Backup Function
  const handleExportBackup = async () => {
    try {
      let trashedItems: Item[] = [];
      let trashedParties: Party[] = [];
      let trashedCollections: CollectionMR[] = [];
      let trashedChallans: DeliveryChallan[] = [];
      let orderedCategories: string[] = [];
      let customCategories: string[] = [];
      let exportedBankList: string[] = propsBankList || defaultBanks;
      let exportedAccountList: string[] = propsAccountList || defaultAccounts;
      let deletedAutoDeposits: string[] = [];
      let exportedClosings: any[] = closings || [];
      let exportedRequisitions: any[] = requisitions || [];
      let exportedBranches: any[] = branches || [];
      let adminPassword = '';

      try {
        const savedTI = localStorage.getItem('polycables_trashed_items');
        if (savedTI) trashedItems = JSON.parse(savedTI);
        const savedTP = localStorage.getItem('polycables_trashed_parties');
        if (savedTP) trashedParties = JSON.parse(savedTP);
        const savedTC = localStorage.getItem('polycables_trashed_collections');
        if (savedTC) trashedCollections = JSON.parse(savedTC);
        const savedTCh = localStorage.getItem('polycables_trashed_challans');
        if (savedTCh) trashedChallans = JSON.parse(savedTCh);
        const savedOC = localStorage.getItem('polycables_ordered_categories');
        if (savedOC) orderedCategories = JSON.parse(savedOC);
        const savedCC = localStorage.getItem('polycables_custom_categories');
        if (savedCC) customCategories = JSON.parse(savedCC);
        if (!Array.isArray(orderedCategories) || orderedCategories.length === 0) {
          orderedCategories = getAllCategories();
        }
        items.forEach((it) => {
          const cat = String(it?.category || '').trim();
          if (cat && cat.toLowerCase() !== 'general' && !orderedCategories.some((c) => c.toLowerCase() === cat.toLowerCase())) {
            orderedCategories.push(cat);
          }
        });
        const savedBL = localStorage.getItem('polycables_bank_list');
        if (savedBL && (!exportedBankList || exportedBankList.length === 0)) exportedBankList = JSON.parse(savedBL);
        const savedAL = localStorage.getItem('polycables_account_list');
        if (savedAL && (!exportedAccountList || exportedAccountList.length === 0)) exportedAccountList = JSON.parse(savedAL);
        const savedDAD = localStorage.getItem('polycables_deleted_auto_deposits');
        if (savedDAD) deletedAutoDeposits = JSON.parse(savedDAD);
        const savedClosings = localStorage.getItem('polycables_closings');
        if (savedClosings && exportedClosings.length === 0) exportedClosings = JSON.parse(savedClosings);
        const savedReq = localStorage.getItem('polycables_requisitions');
        if (savedReq && exportedRequisitions.length === 0) exportedRequisitions = JSON.parse(savedReq);
        const savedBr = localStorage.getItem('polycables_branches');
        if (savedBr && exportedBranches.length === 0) exportedBranches = JSON.parse(savedBr);
        adminPassword = localStorage.getItem('app_admin_password') || '';
      } catch (e) {
        // ignore local parse errors
      }

      let exportedConveyances: ConveyanceEntry[] = propsConveyances || [];
      try {
        const savedConv = localStorage.getItem('polycables_conveyances');
        if (savedConv && exportedConveyances.length === 0) {
          exportedConveyances = JSON.parse(savedConv);
        }
      } catch (e) {}

      // Hydrate full stored bills with uploaded receivedCopy files from IndexedDB
      let fullStoredBills = storedBills;
      try {
        const idbBills = await idbGetFailoverData('polycables_stored_bills');
        if (Array.isArray(idbBills) && idbBills.length > 0) {
          const idbMap = new Map(idbBills.map((b: any) => [b.id, b]));
          fullStoredBills = storedBills.map((b) => {
            const match = idbMap.get(b.id);
            if (match && match.receivedCopy && !b.receivedCopy) {
              return { ...b, receivedCopy: match.receivedCopy };
            }
            return b;
          });
        }
      } catch (_) {}

      // Hydrate bank deposits with uploaded deposit slips from IndexedDB
      let cleanBankDeposits = bankDeposits.filter((d) => !d.isAutoDeposit && !d.id.startsWith('auto-ho-'));
      try {
        const idbDeposits = await idbGetFailoverData('polycables_bank_deposits');
        if (Array.isArray(idbDeposits) && idbDeposits.length > 0) {
          const idbMap = new Map(idbDeposits.map((d: any) => [d.id, d]));
          cleanBankDeposits = cleanBankDeposits.map((d) => {
            const match = idbMap.get(d.id);
            if (match && (match.slipUrl || match.slipImage) && !d.slipUrl && !d.slipImage) {
              return { ...d, slipUrl: match.slipUrl || d.slipUrl, slipImage: match.slipImage || d.slipImage };
            }
            return d;
          });
        }
      } catch (_) {}

      const totalCollectionAmount = collections.reduce((s, c) => s + (c.amount || 0), 0);
      const totalExpenseAmount = expenses.reduce((s, e) => s + (e.amount || 0), 0);
      const totalDepositAmount = cleanBankDeposits.reduce((s, d) => s + (d.amount || 0), 0);
      const totalSalesAmount = fullStoredBills.reduce((s, b) => s + (b.grandTotal || 0), 0);

      let exportedPriceSnapshots: any = undefined;
      let exportedCategoryNumbers: any = undefined;
      let exportedExpenseCategories: any = undefined;
      try {
        const rawSnaps = localStorage.getItem('polycables_price_snapshots');
        if (rawSnaps) exportedPriceSnapshots = JSON.parse(rawSnaps);
        const rawCatNums = localStorage.getItem('polycables_category_numbers');
        if (rawCatNums) exportedCategoryNumbers = JSON.parse(rawCatNums);
        const rawExpCats = localStorage.getItem('polycables_expense_categories_v2');
        if (rawExpCats) exportedExpenseCategories = JSON.parse(rawExpCats);
      } catch {}

      const backupPkg: BackupDataPackage = {
        version: '2.0.0',
        backupDate: new Date().toISOString(),
        appTitle: 'Polycables Store & Billing System',
        stats: {
          totalStoredBills: fullStoredBills.length,
          totalDeliveryChallans: deliveryChallans.length,
          totalMasterItems: items.length,
          totalParties: parties.length,
          totalSalespersons: salespersons.length,
          totalFactoryImports: factoryImports.length,
          totalStockReturns: stockReturns.length,
          totalExpenses: expenses.length,
          totalCollections: collections.length,
          totalBankDeposits: cleanBankDeposits.length,
          totalCollectionAmount,
          totalExpenseAmount,
          totalDepositAmount,
          totalSalesAmount
        },
        data: {
          items,
          parties,
          salespersons,
          storedBills: fullStoredBills,
          deliveryChallans,
          colorExchanges,
          factoryImports,
          stockReturns,
          expenses,
          conveyances: exportedConveyances,
          collections,
          bankDeposits: cleanBankDeposits,
          requisitions: exportedRequisitions,
          branches: exportedBranches,
          company,
          header,
          trashedItems,
          trashedParties,
          trashedCollections,
          trashedChallans,
          orderedCategories,
          customCategories,
          bankList: exportedBankList,
          accountList: exportedAccountList,
          deletedAutoDeposits,
          closings: exportedClosings,
          ...(exportedPriceSnapshots ? { priceSnapshots: exportedPriceSnapshots } : {}),
          ...(exportedCategoryNumbers ? { categoryNumbers: exportedCategoryNumbers } : {}),
          ...(exportedExpenseCategories ? { expenseCategories: exportedExpenseCategories } : {}),
          adminPassword
        }
      };

      const jsonStr = JSON.stringify(backupPkg, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const now = new Date().toISOString().slice(0, 10);
      const link = document.createElement('a');
      link.href = url;
      link.download = `polycables_all_data_backup_${now}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast('Comprehensive Backup Package exported! All items, bills, cheques & records included.', 'success');
    } catch (err: any) {
      showToast('Export failed: ' + (err?.message || err), 'error');
    }
  };

  // 1B. Export Single Item / Record Backup ("when backup and restore, can single item do it")
  const handleExportSingleItemRecord = (targetItem: Item) => {
    try {
      const pkg = {
        version: '2.0.0',
        backupType: 'single_item',
        entityType: 'item',
        backupDate: new Date().toISOString(),
        item: targetItem
      };
      const jsonStr = JSON.stringify(pkg, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const safeName = (targetItem.name || 'item').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      const link = document.createElement('a');
      link.href = url;
      link.download = `single_item_backup_${safeName}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`✓ Single Item "${targetItem.name}" backup downloaded!`, 'success');
    } catch (err: any) {
      showToast('Export single item failed: ' + err?.message, 'error');
    }
  };

  const handleExportSingleBillRecord = (targetBill: StoredBill) => {
    try {
      const pkg = {
        version: '2.0.0',
        backupType: 'single_item',
        entityType: 'bill',
        backupDate: new Date().toISOString(),
        bill: targetBill
      };
      const jsonStr = JSON.stringify(pkg, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const bNo = (targetBill.header?.billNo || targetBill.id).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      const link = document.createElement('a');
      link.href = url;
      link.download = `single_bill_backup_${bNo}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`✓ Single Bill #${targetBill.header?.billNo || ''} backup downloaded!`, 'success');
    } catch (err: any) {
      showToast('Export single bill failed: ' + err?.message, 'error');
    }
  };

  const handleExportSinglePartyRecord = (targetParty: Party) => {
    try {
      const pkg = {
        version: '2.0.0',
        backupType: 'single_item',
        entityType: 'party',
        backupDate: new Date().toISOString(),
        party: targetParty
      };
      const jsonStr = JSON.stringify(pkg, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const pName = (targetParty.name || 'party').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      const link = document.createElement('a');
      link.href = url;
      link.download = `single_party_backup_${pName}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`✓ Single Customer "${targetParty.name}" backup downloaded!`, 'success');
    } catch (err: any) {
      showToast('Export single party failed: ' + err?.message, 'error');
    }
  };

  const handleExportSingleModule = (modKey: string) => {
    try {
      const now = new Date().toISOString().slice(0, 10);
      let dataSlice: any = {};
      let title = '';
      let filename = '';

      if (modKey === 'invoices') {
        dataSlice = { storedBills };
        title = 'Invoices';
        filename = `invoices_backup_${storedBills.length}_records_${now}.json`;
      } else if (modKey === 'items') {
        dataSlice = { items };
        title = 'Master Items';
        filename = `items_backup_${items.length}_records_${now}.json`;
      } else if (modKey === 'customers') {
        dataSlice = { parties };
        title = 'Customers';
        filename = `customers_backup_${parties.length}_records_${now}.json`;
      } else if (modKey === 'salespersons') {
        dataSlice = { salespersons };
        title = 'Sales Representatives';
        filename = `sales_reps_backup_${salespersons.length}_records_${now}.json`;
      } else if (modKey === 'collections') {
        dataSlice = { collections };
        title = 'Collections';
        filename = `collections_backup_${collections.length}_records_${now}.json`;
      } else if (modKey === 'expenses') {
        dataSlice = { expenses };
        title = 'Expenses';
        filename = `expenses_backup_${expenses.length}_records_${now}.json`;
      } else if (modKey === 'deposits') {
        const cleanDeposits = bankDeposits.filter((d) => !d.isAutoDeposit && !d.id.startsWith('auto-ho-'));
        dataSlice = { bankDeposits: cleanDeposits };
        title = 'Bank Deposits';
        filename = `bank_deposits_backup_${cleanDeposits.length}_records_${now}.json`;
      } else if (modKey === 'factory_in') {
        dataSlice = { factoryImports };
        title = 'Factory Import Challans';
        filename = `factory_in_backup_${factoryImports.length}_records_${now}.json`;
      } else if (modKey === 'returns') {
        dataSlice = { stockReturns };
        title = 'Stock Returns';
        filename = `stock_returns_backup_${stockReturns.length}_records_${now}.json`;
      } else if (modKey === 'categories') {
        let customCategories: any[] = [];
        let orderedCategories: any[] = [];
        try {
          const savedCC = localStorage.getItem('polycables_custom_categories');
          if (savedCC) customCategories = JSON.parse(savedCC);
          const savedOC = localStorage.getItem('polycables_ordered_categories');
          if (savedOC) orderedCategories = JSON.parse(savedOC);
        } catch {}
        if (!Array.isArray(orderedCategories) || orderedCategories.length === 0) {
          orderedCategories = getAllCategories();
        }
        items.forEach((it) => {
          const cat = String(it?.category || '').trim();
          if (cat && cat.toLowerCase() !== 'general' && !orderedCategories.some((c: string) => String(c).toLowerCase() === cat.toLowerCase())) {
            orderedCategories.push(cat);
          }
        });
        dataSlice = { customCategories, orderedCategories };
        title = 'Categories';
        filename = `categories_backup_${now}.json`;
      } else if (modKey === 'banks') {
        const currentBanks = propsBankList || defaultBanks;
        const currentAccounts = propsAccountList || defaultAccounts;
        dataSlice = { bankList: currentBanks, accountList: currentAccounts };
        title = 'Banks and Accounts';
        filename = `banks_backup_${currentBanks.length}_records_${now}.json`;
      } else if (modKey === 'trashed') {
        let trashedItems: any[] = [];
        let trashedParties: any[] = [];
        let trashedCollections: any[] = [];
        let trashedChallans: any[] = [];
        try {
          const savedTI = localStorage.getItem('polycables_trashed_items');
          if (savedTI) trashedItems = JSON.parse(savedTI);
          const savedTP = localStorage.getItem('polycables_trashed_parties');
          if (savedTP) trashedParties = JSON.parse(savedTP);
          const savedTC = localStorage.getItem('polycables_trashed_collections');
          if (savedTC) trashedCollections = JSON.parse(savedTC);
          const savedTCh = localStorage.getItem('polycables_trashed_challans');
          if (savedTCh) trashedChallans = JSON.parse(savedTCh);
        } catch {}
        dataSlice = { trashedItems, trashedParties, trashedCollections, trashedChallans };
        title = 'Trashed Data';
        filename = `trashed_records_backup_${now}.json`;
      } else if (modKey === 'users') {
        const adminPass = localStorage.getItem('app_admin_password') || '';
        dataSlice = { salespersons, adminPassword: adminPass };
        title = 'Users and Credentials';
        filename = `users_backup_${salespersons.length}_records_${now}.json`;
      } else if (modKey === 'conveyances') {
        dataSlice = { conveyances: effectiveConveyances };
        title = 'Conveyances';
        filename = `conveyances_backup_${effectiveConveyances.length}_records_${now}.json`;
      } else if (modKey === 'branches') {
        dataSlice = { branches: effectiveBranches };
        title = 'Sales Centers';
        filename = `sales_centers_backup_${effectiveBranches.length}_records_${now}.json`;
      } else if (modKey === 'requisitions') {
        dataSlice = { requisitions: effectiveRequisitions };
        title = 'Requisitions';
        filename = `requisitions_backup_${effectiveRequisitions.length}_records_${now}.json`;
      } else if (modKey === 'party_statement') {
        dataSlice = { parties, storedBills, collections, closings };
        title = 'Party and Statement';
        filename = `party_and_statement_backup_${parties.length}_customers_${now}.json`;
      }

      const pkg: BackupDataPackage = {
        version: '2.0.0',
        backupDate: new Date().toISOString(),
        appTitle: `Polycables ${title} Backup`,
        data: dataSlice
      };
      const jsonStr = JSON.stringify(pkg, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`✓ Single backup package "${title}" downloaded successfully!`, 'success');
    } catch (err: any) {
      showToast('Export module failed: ' + (err?.message || err), 'error');
    }
  };

  const handleExportModuleRecord = (mod: string) => {
    handleExportSingleModule(mod === 'items' ? 'items' : mod === 'storedBills' ? 'invoices' : mod === 'parties' ? 'customers' : 'collections');
  };

  const isUnassignedAdminRecord = (sp: any): boolean => {
    if (!sp || typeof sp !== 'object') return true;
    const c = String(sp.code || '').trim().toLowerCase();
    const n = String(sp.name || '').trim().toLowerCase();
    const u = String(sp.username || '').trim().toLowerCase();
    const id = String(sp.id || '').trim().toLowerCase();
    const r = String(sp.role || '').trim().toLowerCase();
    return (
      c === '111' ||
      u === '111' ||
      id === '111' ||
      id === 'sp-1791978445459' ||
      c === 'adm-111' ||
      n === 'admin' ||
      u === 'admin' ||
      c === 'admin' ||
      id === 'adm-mahmudul' ||
      id === 'adm-subrata' ||
      id === 'adm-rashidul' ||
      u === 'admin1' ||
      u === 'admin2' ||
      u === 'admin3' ||
      c === 'adm-01' ||
      c === 'adm-02' ||
      c === 'adm-03' ||
      (r.includes('admin') &&
        Boolean(n) &&
        (n.includes('mahmudul hasan') ||
          n.includes('rashidul islam') ||
          n.includes('subrata sutradhar') ||
          n.includes('admin 1') ||
          n.includes('admin 2') ||
          n.includes('admin 3'))) ||
      (Boolean(n) && n.includes('admin') && (n.includes('mahmudul') || n.includes('subrata') || n.includes('rashidul')))
    );
  };

  const toLightBillsForLocalStorage = (bills: StoredBill[]): any[] =>
    bills.map((b: any) =>
      b?.receivedCopy && typeof b.receivedCopy === 'string' && b.receivedCopy.length > 1500
        ? { ...b, receivedCopy: '' }
        : b
    );

  const handleRestoreSingleModule = (modKey: string) => {
    if (!uploadedFileContent) {
      showToast('Please select a backup file first.', 'error');
      return;
    }
    const d = uploadedFileContent.data || (uploadedFileContent as any) || {};
    const extractIds = (arr: any[]): string[] =>
      (arr || []).flatMap((x: any) => [x?.id, x?._id].filter(Boolean).map(String));

    const markIdsRestoredAndSync = (ids: string[], patch: Record<string, any>) => {
      clearInMemoryFailoverQueue();
      if (ids.length > 0) {
        unrecordDeletedIdsLocally(ids);
        unrecordDeletedEntityIds(ids);
        removeIdsFromAllTrashStorages(ids);
      }
      if (typeof fetch !== 'undefined' && navigator.onLine) {
        fetch('/api/sync/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({ clientId: getClientSyncId(), ids, type: modKey, restoredItems: patch })
        }).catch(() => {});
      }
      scheduleCloudSync?.(patch, true);
    };

    try {
      try {
        localStorage.setItem('polycables_last_restore_time', String(Date.now()));
      } catch {}
      if (modKey === 'invoices') {
        const rawBills = (Array.isArray(d.storedBills) ? d.storedBills : (Array.isArray(d.stored_bills) ? d.stored_bills : []))
          .filter((b: any) => b && typeof b === 'object' && b.id);
        if (rawBills.length === 0) {
          showToast('No valid invoices found in this backup file.', 'error');
          return;
        }
        const ids = extractIds(rawBills);
        unrecordDeletedIdsLocally(ids);
        removeIdsFromAllTrashStorages(ids);
        try { localStorage.removeItem('polycables_trashed_bills'); } catch {}
        setStoredBills(rawBills);
        const lightBills = toLightBillsForLocalStorage(rawBills);
        safeSetStorageItem('polycables_stored_bills', JSON.stringify(lightBills), rawBills);
        idbSaveFailoverData('polycables_stored_bills', rawBills).catch(() => {});
        markIdsRestoredAndSync(ids, {
          _isRestore: true,
          _forceEmpty: false,
          _replaceStoredBills: true,
          restoredEntityIds: ids,
          storedBills: rawBills
        });
        showToast(`✓ Successfully restored ${rawBills.length} Invoices!`, 'success');
      } else if (modKey === 'items') {
        const rawItems = (Array.isArray(d.items) ? d.items : [])
          .filter((it: any) => it && typeof it === 'object' && it.id);
        if (rawItems.length === 0) {
          showToast('No valid items found in this backup file.', 'error');
          return;
        }
        const syncedItems = syncSpecialItemRatesWithBaseItems(rawItems);
        const ids = extractIds(syncedItems);
        try {
          localStorage.removeItem('polycables_items_cleared');
          localStorage.removeItem('polycables_deleted_item_ids');
        } catch {}
        setItems(syncedItems);
        const specialItems = syncedItems.filter((it: any) => it?.isSpecialItem);
        safeSetStorageItem('polycables_items', JSON.stringify(syncedItems), syncedItems);
        safeSetStorageItem('polycables_special_items', JSON.stringify(specialItems), specialItems);
        safeSetStorageItem('polycables_permanent_special_items', JSON.stringify(specialItems), specialItems);
        idbSaveFailoverData('polycables_items', syncedItems).catch(() => {});
        idbSaveFailoverData('polycables_special_items', specialItems).catch(() => {});
        idbSaveFailoverData('polycables_permanent_special_items', specialItems).catch(() => {});
        const syncedSnaps = syncActiveSnapshotWithCatalogItems(syncedItems, { forceReplaceAll: true });
        markIdsRestoredAndSync(ids, {
          _isRestore: true,
          _forceEmpty: false,
          _replaceItems: true,
          _itemsCleared: false,
          itemsVersion: Date.now(),
          restoredEntityIds: ids,
          items: syncedItems,
          specialItems,
          ...(syncedSnaps ? { priceSnapshots: syncedSnaps, price_snapshots: syncedSnaps, _replacePriceSnapshots: true } : {})
        });
        showToast(`✓ Successfully restored ${syncedItems.length} Master Items!`, 'success');
      } else if (modKey === 'customers') {
        const rawParties = (Array.isArray(d.parties) ? d.parties : [])
          .filter((p: any) => p && typeof p === 'object' && p.id);
        if (rawParties.length === 0) {
          showToast('No valid customers found in this backup file.', 'error');
          return;
        }
        const ids = extractIds(rawParties);
        setParties(rawParties);
        safeSetStorageItem('polycables_parties', JSON.stringify(rawParties), rawParties);
        idbSaveFailoverData('polycables_parties', rawParties).catch(() => {});
        markIdsRestoredAndSync(ids, { _isRestore: true, _forceEmpty: false, restoredEntityIds: ids, parties: rawParties });
        showToast(`✓ Successfully restored ${rawParties.length} Customers!`, 'success');
      } else if (modKey === 'salespersons') {
        const rawSp = (Array.isArray(d.salespersons) ? d.salespersons : [])
          .filter((s: any) => s && typeof s === 'object' && s.id && !isUnassignedAdminRecord(s));
        if (rawSp.length === 0) {
          showToast('No valid sales reps found in this backup file.', 'error');
          return;
        }
        const ids = extractIds(rawSp);
        try {
          localStorage.removeItem('polycables_deleted_salespersons');
          localStorage.removeItem('polycables_trashed_users');
        } catch {}
        setSalespersons(rawSp);
        safeSetStorageItem('polycables_salespersons', JSON.stringify(rawSp), rawSp);
        markIdsRestoredAndSync(ids, { _isRestore: true, _forceEmpty: false, restoredEntityIds: ids, salespersons: rawSp });
        showToast(`✓ Successfully restored ${rawSp.length} Sales Representatives!`, 'success');
      } else if (modKey === 'collections') {
        const rawColl = (Array.isArray(d.collections) ? d.collections : [])
          .filter((c: any) => c && typeof c === 'object' && c.id);
        if (rawColl.length === 0) {
          showToast('No valid collections found in this backup file.', 'error');
          return;
        }
        const ids = extractIds(rawColl);
        setCollections(rawColl);
        safeSetStorageItem('polycables_collections', JSON.stringify(rawColl), rawColl);
        markIdsRestoredAndSync(ids, { _isRestore: true, _forceEmpty: false, restoredEntityIds: ids, collections: rawColl });
        showToast(`✓ Successfully restored ${rawColl.length} Collections!`, 'success');
      } else if (modKey === 'expenses') {
        const rawExp = (Array.isArray(d.expenses) ? d.expenses : [])
          .filter((e: any) => e && typeof e === 'object' && e.id);
        if (rawExp.length === 0) {
          showToast('No valid expenses found in this backup file.', 'error');
          return;
        }
        const ids = extractIds(rawExp);
        setExpenses(rawExp);
        safeSetStorageItem('polycables_expenses', JSON.stringify(rawExp), rawExp);
        markIdsRestoredAndSync(ids, { _isRestore: true, _forceEmpty: false, restoredEntityIds: ids, expenses: rawExp });
        showToast(`✓ Successfully restored ${rawExp.length} Expenses!`, 'success');
      } else if (modKey === 'deposits') {
        const rawDep = (Array.isArray(d.bankDeposits) ? d.bankDeposits : (Array.isArray(d.bank_deposits) ? d.bank_deposits : []))
          .filter((dp: any) => dp && typeof dp === 'object' && dp.id && !dp.isAutoDeposit && !String(dp.id).startsWith('auto-ho-'));
        if (rawDep.length === 0) {
          showToast('No valid manual bank deposits found in this backup file.', 'error');
          return;
        }
        const ids = extractIds(rawDep);
        setBankDeposits(rawDep);
        safeSetStorageItem('polycables_bank_deposits', JSON.stringify(rawDep), rawDep);
        idbSaveFailoverData('polycables_bank_deposits', rawDep).catch(() => {});
        markIdsRestoredAndSync(ids, { _isRestore: true, _forceEmpty: false, restoredEntityIds: ids, bankDeposits: rawDep });
        showToast(`✓ Successfully restored ${rawDep.length} Bank Deposits!`, 'success');
      } else if (modKey === 'factory_in') {
        const rawImports = (Array.isArray(d.factoryImports) ? d.factoryImports : (Array.isArray(d.factory_imports) ? d.factory_imports : []))
          .filter((imp: any) => imp && typeof imp === 'object' && imp.id);
        if (rawImports.length === 0) {
          showToast('No valid factory import challans found in this backup file.', 'error');
          return;
        }
        const ids = extractIds(rawImports);
        setFactoryImports(rawImports);
        safeSetStorageItem('polycables_factory_imports', JSON.stringify(rawImports), rawImports);
        markIdsRestoredAndSync(ids, { _isRestore: true, _forceEmpty: false, restoredEntityIds: ids, factoryImports: rawImports });
        showToast(`✓ Successfully restored ${rawImports.length} Factory In Challans!`, 'success');
      } else if (modKey === 'returns') {
        const rawReturns = (Array.isArray(d.stockReturns) ? d.stockReturns : (Array.isArray(d.stock_returns) ? d.stock_returns : []))
          .filter((r: any) => r && typeof r === 'object');
        if (rawReturns.length === 0 && !Array.isArray(d.stockReturns) && !Array.isArray(d.stock_returns)) {
          showToast('No stock returns found in this backup file.', 'error');
          return;
        }
        const ids = extractIds(rawReturns);
        setStockReturns(rawReturns);
        safeSetStorageItem('polycables_stock_returns', JSON.stringify(rawReturns), rawReturns);
        markIdsRestoredAndSync(ids, { _isRestore: true, _forceEmpty: false, restoredEntityIds: ids, stockReturns: rawReturns });
        showToast(`✓ Successfully restored ${rawReturns.length} Stock Returns!`, 'success');
      } else if (modKey === 'categories') {
        const customCat = (Array.isArray(d.customCategories) ? d.customCategories : []).filter((c: any) => typeof c === 'string' && c.trim());
        const orderedCat = (Array.isArray(d.orderedCategories) ? d.orderedCategories : []).filter((c: any) => typeof c === 'string' && c.trim());
        if (customCat.length === 0 && orderedCat.length === 0) {
          showToast('No custom or ordered categories found in this backup file.', 'error');
          return;
        }
        if (customCat.length > 0) {
          safeSetStorageItem('polycables_custom_categories', JSON.stringify(customCat), customCat);
        }
        if (orderedCat.length > 0) {
          safeSetStorageItem('polycables_ordered_categories', JSON.stringify(orderedCat), orderedCat);
          window.dispatchEvent(new CustomEvent('categories-updated', { detail: orderedCat }));
        }
        setCatSyncTick((t) => t + 1);
        scheduleCloudSync?.({ _isRestore: true, _forceEmpty: false, customCategories: customCat, orderedCategories: orderedCat }, true);
        showToast(`✓ Successfully restored Categories (${customCat.length} custom, ${orderedCat.length} ordered)!`, 'success');
      } else if (modKey === 'banks') {
        const rawBanks = (Array.isArray(d.bankList) ? d.bankList : (Array.isArray(d.bank_list) ? d.bank_list : []))
          .map(toSafeStr)
          .filter((b: string) => b && b !== '[object Object]' && !b.startsWith('[object '));
        const rawAccounts = (Array.isArray(d.accountList) ? d.accountList : (Array.isArray(d.account_list) ? d.account_list : []))
          .map(toSafeStr)
          .filter((a: string) => a && a !== '[object Object]' && !a.startsWith('[object '));
        if (rawBanks.length === 0 && rawAccounts.length === 0) {
          showToast('No banks or accounts found in this backup file.', 'error');
          return;
        }
        if (rawBanks.length > 0) {
          setLocalBankList(rawBanks);
          propsSetBankList?.(rawBanks);
          safeSetStorageItem('polycables_bank_list', JSON.stringify(rawBanks), rawBanks);
        }
        if (rawAccounts.length > 0) {
          setLocalAccountList(rawAccounts);
          propsSetAccountList?.(rawAccounts);
          safeSetStorageItem('polycables_account_list', JSON.stringify(rawAccounts), rawAccounts);
        }
        scheduleCloudSync?.({ _isRestore: true, _forceEmpty: false, bankList: rawBanks, accountList: rawAccounts }, true);
        showToast(`✓ Successfully restored ${rawBanks.length} Banks and ${rawAccounts.length} Accounts!`, 'success');
      } else if (modKey === 'trashed') {
        const tItems = Array.isArray(d.trashedItems) ? d.trashedItems.filter(Boolean) : [];
        const tParties = Array.isArray(d.trashedParties) ? d.trashedParties.filter(Boolean) : [];
        const tCollections = Array.isArray(d.trashedCollections) ? d.trashedCollections.filter(Boolean) : [];
        const tChallans = Array.isArray(d.trashedChallans) ? d.trashedChallans.filter(Boolean) : [];
        const totalTrash = tItems.length + tParties.length + tCollections.length + tChallans.length;
        if (totalTrash === 0 && !Array.isArray(d.trashedItems)) {
          showToast('No trashed records found in this backup file.', 'error');
          return;
        }
        if (Array.isArray(d.trashedItems)) safeSetStorageItem('polycables_trashed_items', JSON.stringify(tItems), tItems);
        if (Array.isArray(d.trashedParties)) safeSetStorageItem('polycables_trashed_parties', JSON.stringify(tParties), tParties);
        if (Array.isArray(d.trashedCollections)) safeSetStorageItem('polycables_trashed_collections', JSON.stringify(tCollections), tCollections);
        if (Array.isArray(d.trashedChallans)) safeSetStorageItem('polycables_trashed_challans', JSON.stringify(tChallans), tChallans);
        setCatSyncTick((t) => t + 1);
        showToast(`✓ Successfully restored Trashed Records (${totalTrash} records)!`, 'success');
      } else if (modKey === 'users') {
        const rawSp = (Array.isArray(d.salespersons) ? d.salespersons : [])
          .filter((s: any) => s && typeof s === 'object' && s.id && !isUnassignedAdminRecord(s));
        const hasAdminPass = typeof d.adminPassword === 'string' && d.adminPassword.length > 0;
        if (rawSp.length === 0 && !hasAdminPass) {
          showToast('No users or credentials found in this backup file.', 'error');
          return;
        }
        if (rawSp.length > 0) {
          const ids = extractIds(rawSp);
          try {
            localStorage.removeItem('polycables_deleted_salespersons');
            localStorage.removeItem('polycables_trashed_users');
          } catch {}
          setSalespersons(rawSp);
          safeSetStorageItem('polycables_salespersons', JSON.stringify(rawSp), rawSp);
          markIdsRestoredAndSync(ids, { _isRestore: true, _forceEmpty: false, restoredEntityIds: ids, salespersons: rawSp });
        }
        if (hasAdminPass) {
          safeSetStorageItem('app_admin_password', d.adminPassword);
        }
        showToast(`✓ Successfully restored Users & Access Credentials (${rawSp.length} sales reps)!`, 'success');
      } else if (modKey === 'party_statement') {
        const rawParties = (Array.isArray(d.parties) ? d.parties : []).filter((p: any) => p && typeof p === 'object' && p.id);
        const rawBills = (Array.isArray(d.storedBills) ? d.storedBills : (Array.isArray(d.stored_bills) ? d.stored_bills : []))
          .filter((b: any) => b && typeof b === 'object' && b.id);
        const rawCollections = (Array.isArray(d.collections) ? d.collections : []).filter((c: any) => c && typeof c === 'object' && c.id);
        const rawClosings = (Array.isArray(d.closings) ? d.closings : []).filter((cl: any) => cl && typeof cl === 'object');

        if (rawParties.length === 0 && rawBills.length === 0 && rawCollections.length === 0) {
          showToast('No customer party or statement records found in this backup file.', 'error');
          return;
        }
        const ids = [...extractIds(rawParties), ...extractIds(rawBills), ...extractIds(rawCollections), ...extractIds(rawClosings)];
        unrecordDeletedIdsLocally(ids);
        removeIdsFromAllTrashStorages(ids);
        const syncPatch: Record<string, any> = {
          _isRestore: true,
          _forceEmpty: false,
          restoredEntityIds: ids
        };
        if (rawParties.length > 0) {
          setParties(rawParties);
          safeSetStorageItem('polycables_parties', JSON.stringify(rawParties), rawParties);
          idbSaveFailoverData('polycables_parties', rawParties).catch(() => {});
          syncPatch.parties = rawParties;
        }
        if (rawBills.length > 0) {
          setStoredBills(rawBills);
          const lightBills = toLightBillsForLocalStorage(rawBills);
          safeSetStorageItem('polycables_stored_bills', JSON.stringify(lightBills), rawBills);
          idbSaveFailoverData('polycables_stored_bills', rawBills).catch(() => {});
          syncPatch.storedBills = rawBills;
          syncPatch._replaceStoredBills = true;
        }
        if (rawCollections.length > 0) {
          setCollections(rawCollections);
          safeSetStorageItem('polycables_collections', JSON.stringify(rawCollections), rawCollections);
          syncPatch.collections = rawCollections;
        }
        if (rawClosings.length > 0 && propsSetClosings) {
          propsSetClosings(rawClosings);
          safeSetStorageItem('polycables_closings', JSON.stringify(rawClosings), rawClosings);
          syncPatch.closings = rawClosings;
        }
        markIdsRestoredAndSync(ids, syncPatch);
        showToast(`✓ Successfully restored Party & Statement records (${rawParties.length} customers, ${rawBills.length} invoices)!`, 'success');
      } else if (modKey === 'conveyances') {
        const rawConv = (Array.isArray(d.conveyances) ? d.conveyances : (Array.isArray((d as any).conveyanceBills) ? (d as any).conveyanceBills : [])).filter((c: any) => c && typeof c === 'object' && c.id);
        if (rawConv.length === 0) {
          showToast('No conveyance records found in this backup file.', 'error');
          return;
        }
        const ids = extractIds(rawConv);
        if (propsSetConveyances) propsSetConveyances(rawConv);
        safeSetStorageItem('polycables_conveyances', JSON.stringify(rawConv), rawConv);
        idbSaveFailoverData('polycables_conveyances', rawConv).catch(() => {});
        markIdsRestoredAndSync(ids, { _isRestore: true, _forceEmpty: false, restoredEntityIds: ids, conveyances: rawConv });
        showToast(`✓ Successfully restored Conveyance Bills (${rawConv.length} records)!`, 'success');
      } else if (modKey === 'branches') {
        const rawBr = (Array.isArray(d.branches) ? d.branches : (Array.isArray((d as any).salesCenters) ? (d as any).salesCenters : (Array.isArray((d as any).sales_centers) ? (d as any).sales_centers : (Array.isArray((d as any).outlets) ? (d as any).outlets : (Array.isArray((d as any).showrooms) ? (d as any).showrooms : [])))))
          .filter((b: any) => b && typeof b === 'object' && b.id);
        if (rawBr.length === 0) {
          showToast('No Sales Center records found in this backup file.', 'error');
          return;
        }
        const ids = extractIds(rawBr);
        if (setBranches) setBranches(rawBr);
        safeSetStorageItem('polycables_branches', JSON.stringify(rawBr), rawBr);
        markIdsRestoredAndSync(ids, { _isRestore: true, _forceEmpty: false, restoredEntityIds: ids, branches: rawBr });
        showToast(`✓ Successfully restored ${rawBr.length} Sales Centers!`, 'success');
      } else if (modKey === 'requisitions') {
        const rawReq = (Array.isArray(d.requisitions) ? d.requisitions : (Array.isArray((d as any).branchRequisitions) ? (d as any).branchRequisitions : [])).filter((r: any) => r && typeof r === 'object');
        if (rawReq.length === 0) {
          showToast('No requisitions found in this backup file.', 'error');
          return;
        }
        const ids = extractIds(rawReq);
        if (setRequisitions) setRequisitions(rawReq);
        safeSetStorageItem('polycables_requisitions', JSON.stringify(rawReq), rawReq);
        markIdsRestoredAndSync(ids, { _isRestore: true, _forceEmpty: false, restoredEntityIds: ids, requisitions: rawReq });
        showToast(`✓ Successfully restored ${rawReq.length} Requisitions!`, 'success');
      }
      setShowConfirmRestoreModal(false);
    } catch (err: any) {
      showToast('Restore single module failed: ' + (err?.message || err), 'error');
    }
  };

  // 1C. Direct Single Record Restore Handlers
  const handleRestoreSingleItemRecord = (targetItem: Item) => {
    try {
      localStorage.setItem('polycables_last_restore_time', String(Date.now()));
      localStorage.removeItem('polycables_items_cleared');
      if (targetItem.id) {
        unrecordDeletedEntityIds([targetItem.id]);
        removeIdsFromAllTrashStorages([targetItem.id]);
      }
      setItems((prev) => {
        const idx = prev.findIndex(
          (i) => i.id === targetItem.id || (i.name && targetItem.name && i.name.trim().toLowerCase() === targetItem.name.trim().toLowerCase())
        );
        let next: Item[];
        if (idx !== -1) {
          next = [...prev];
          next[idx] = { ...prev[idx], ...targetItem };
        } else {
          next = [...prev, targetItem];
        }
        safeSetStorageItem('polycables_items', JSON.stringify(next), next);
        scheduleCloudSync?.({ _isRestore: true, _itemsCleared: false, restoredEntityIds: targetItem.id ? [targetItem.id] : [], items: next }, true);
        return next;
      });
      setUploadedSingleItem(null);
      setUploadedFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      showToast(`✓ Single Item "${targetItem.name}" restored successfully into Master Items!`, 'success');
    } catch (err: any) {
      showToast('Restore single item failed: ' + err?.message, 'error');
    }
  };

  const handleRestoreSingleBillRecord = (targetBill: StoredBill) => {
    try {
      localStorage.setItem('polycables_last_restore_time', String(Date.now()));
      if (targetBill.id) {
        unrecordDeletedEntityIds([targetBill.id]);
        removeIdsFromAllTrashStorages([targetBill.id]);
      }
      setStoredBills((prev) => {
        const idx = prev.findIndex((b) => b.id === targetBill.id);
        let next: StoredBill[];
        if (idx !== -1) {
          next = [...prev];
          next[idx] = targetBill;
        } else {
          next = [targetBill, ...prev];
        }
        setTimeout(() => {
          const lightBills = toLightBillsForLocalStorage(next);
          safeSetStorageItem('polycables_stored_bills', JSON.stringify(lightBills), next);
          idbSaveFailoverData('polycables_stored_bills', next).catch(() => {});
          scheduleCloudSync?.({ _isRestore: true, restoredEntityIds: targetBill.id ? [targetBill.id] : [], storedBills: next }, true);
        }, 15);
        return next;
      });
      setUploadedSingleBill(null);
      setUploadedFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      showToast(`✓ Single Bill #${targetBill.header?.billNo || ''} restored successfully into Stored Bills!`, 'success');
    } catch (err: any) {
      showToast('Restore single bill failed: ' + err?.message, 'error');
    }
  };

  const handleRestoreSinglePartyRecord = (targetParty: Party) => {
    try {
      localStorage.setItem('polycables_last_restore_time', String(Date.now()));
      if (targetParty.id) {
        unrecordDeletedEntityIds([targetParty.id]);
        removeIdsFromAllTrashStorages([targetParty.id]);
      }
      setParties((prev) => {
        const idx = prev.findIndex(
          (p) => p.id === targetParty.id || p.name.trim().toLowerCase() === targetParty.name.trim().toLowerCase()
        );
        let next: Party[];
        if (idx !== -1) {
          next = [...prev];
          next[idx] = { ...prev[idx], ...targetParty };
        } else {
          next = [...prev, targetParty];
        }
        safeSetStorageItem('polycables_parties', JSON.stringify(next), next);
        scheduleCloudSync?.({ _isRestore: true, restoredEntityIds: targetParty.id ? [targetParty.id] : [], parties: next }, true);
        return next;
      });
      setUploadedSingleParty(null);
      setUploadedFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      showToast(`✓ Customer "${targetParty.name}" restored successfully into Directory!`, 'success');
    } catch (err: any) {
      showToast('Restore party failed: ' + err?.message, 'error');
    }
  };

  // 2. Handle File Selection for Restore (Full Packages, Module Backups & Single Items)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    setRestoreError(null);
    setUploadedSingleItem(null);
    setUploadedSingleBill(null);
    setUploadedSingleParty(null);
    setUploadedFileContent(null);
    setRestoreConflictDiff(null);

    const reader = new FileReader();
    reader.onerror = () => {
      setUploadedFileContent(null);
      setRestoreConflictDiff(null);
      setRestoreError('Failed to read the file from disk.');
      showToast('Error reading backup file from disk.', 'error');
    };
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        let parsed: any;
        try {
          parsed = JSON.parse(content);
        } catch (jsonErr: any) {
          throw new Error(`Malformed JSON syntax: ${jsonErr?.message || 'Unable to parse file contents.'}`);
        }

        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid file structure. The uploaded backup must be a valid JSON object.');
        }

        // Check if uploaded file is a raw array or wrapped in common keys
        let rawData: any = parsed;
        if (Array.isArray(parsed)) {
          const firstValid = parsed.find((x: any) => x && typeof x === 'object') || {};
          if (firstValid.header || firstValid.lines || firstValid.grandTotal !== undefined || firstValid.billNo) {
            rawData = { storedBills: parsed };
          } else if (firstValid.rate !== undefined || firstValid.sizeSpec !== undefined || (firstValid.name && firstValid.unit)) {
            rawData = { items: parsed };
          } else if (firstValid.address !== undefined || (firstValid.name && (firstValid.phone || firstValid.mobile))) {
            rawData = { parties: parsed };
          } else if (firstValid.branchName !== undefined || firstValid.adminId !== undefined) {
            rawData = { branches: parsed };
          } else if (firstValid.amount !== undefined && (firstValid.mrNo !== undefined || firstValid.paymentType !== undefined)) {
            rawData = { collections: parsed };
          } else if (firstValid.amount !== undefined && (firstValid.expenseType !== undefined || firstValid.category !== undefined)) {
            rawData = { expenses: parsed };
          } else if (firstValid.depositDate !== undefined || firstValid.bankName !== undefined) {
            rawData = { bankDeposits: parsed };
          } else {
            rawData = { storedBills: parsed };
          }
        } else if (parsed && typeof parsed === 'object') {
          if (parsed.appState && typeof parsed.appState === 'object') {
            rawData = parsed.appState;
          } else if (parsed.state && typeof parsed.state === 'object') {
            rawData = parsed.state;
          } else if (parsed.backup && typeof parsed.backup === 'object') {
            rawData = parsed.backup;
          } else if (parsed.snapshot && typeof parsed.snapshot === 'object') {
            rawData = parsed.snapshot;
          } else if (parsed.payload && typeof parsed.payload === 'object' && !Array.isArray(parsed.payload)) {
            rawData = parsed.payload;
          } else if (parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)) {
            rawData = parsed.data;
          }
        }

        const hasAnyArrayKey = (keys: string[]): boolean => keys.some((k) => Array.isArray(rawData?.[k]));
        const getArray = (keys: string[]): any[] => {
          for (const k of keys) {
            if (Array.isArray(rawData?.[k])) return rawData[k];
          }
          return [];
        };

        const presentModules = {
          items: hasAnyArrayKey(['items', 'products', 'masterItems', 'stockItems']),
          parties: hasAnyArrayKey(['parties', 'customers', 'clients', 'partyList']),
          storedBills: hasAnyArrayKey(['storedBills', 'stored_bills', 'bills', 'invoices', 'billList']),
          salespersons: hasAnyArrayKey(['salespersons', 'salesPersons', 'sales_persons', 'sales_team', 'users']),
          collections: hasAnyArrayKey(['collections', 'moneyReceipts', 'payments']),
          expenses: hasAnyArrayKey(['expenses', 'monthlyExpenses', 'expenseList']),
          bankDeposits: hasAnyArrayKey(['bankDeposits', 'bank_deposits', 'deposits']),
          factoryImports: hasAnyArrayKey(['factoryImports', 'factory_imports', 'imports']),
          stockReturns: hasAnyArrayKey(['stockReturns', 'stock_returns', 'returns']),
          deliveryChallans: hasAnyArrayKey(['deliveryChallans', 'delivery_challans', 'challans']),
          colorExchanges: hasAnyArrayKey(['colorExchanges', 'color_exchanges']),
          conveyances: hasAnyArrayKey(['conveyances', 'conveyanceBills']),
          branches: hasAnyArrayKey(['branches', 'salesCenters', 'sales_centers', 'outlets', 'showrooms']),
          requisitions: hasAnyArrayKey(['requisitions', 'branchRequisitions']),
          closings: hasAnyArrayKey(['closings', 'dailyClosings', 'yearEndClosings', 'cashInHand']),
          customCategories: hasAnyArrayKey(['customCategories', 'custom_categories']),
          orderedCategories: hasAnyArrayKey(['orderedCategories', 'ordered_categories']),
          bankList: hasAnyArrayKey(['bankList', 'bank_list']),
          accountList: hasAnyArrayKey(['accountList', 'account_list']),
          trashedItems: hasAnyArrayKey(['trashedItems', 'trashed_items']),
          trashedParties: hasAnyArrayKey(['trashedParties', 'trashed_parties']),
          trashedCollections: hasAnyArrayKey(['trashedCollections', 'trashed_collections']),
          trashedChallans: hasAnyArrayKey(['trashedChallans', 'trashed_challans'])
        };

        const hasAnyPresentModule = Object.values(presentModules).some(Boolean);

        // Only detect Single Item / Single Bill / Single Customer backups when the file does NOT contain module arrays
        // (prevents full ERP backups or app_state.json snapshots with active draft `header` + `lines` from being misclassified as a single bill)
        if (!Array.isArray(parsed) && !hasAnyPresentModule) {
          const singleItem: Item | null = (parsed?.item || rawData?.item || (rawData?.name && rawData?.rate !== undefined ? rawData : null)) || null;
          const singleBill: StoredBill | null = (parsed?.bill || rawData?.bill || (rawData?.header && rawData?.lines ? rawData : null)) || null;
          const singleParty: Party | null = (parsed?.party || rawData?.party || (rawData?.name && rawData?.address !== undefined && rawData?.rate === undefined ? rawData : null)) || null;

          if (singleItem && singleItem.name) {
            const pkg: BackupDataPackage = {
              version: '2.0.0',
              backupDate: new Date().toISOString(),
              appTitle: `Polycables Single Item (${singleItem.name}) Backup`,
              data: {
                items: [singleItem],
                _isSingleRecord: true,
                _presentModules: { items: true }
              } as any
            };
            setUploadedFileContent(pkg);
            setRestoreConflictDiff(computeRestoreDiff(pkg));
            showToast(`✓ Single Item backup detected: "${singleItem.name}". Ready to restore.`, 'success');
            return;
          }

          if (singleBill && singleBill.header?.billNo) {
            const pkg: BackupDataPackage = {
              version: '2.0.0',
              backupDate: new Date().toISOString(),
              appTitle: `Polycables Single Bill (#${singleBill.header.billNo}) Backup`,
              data: {
                storedBills: [singleBill],
                _isSingleRecord: true,
                _presentModules: { storedBills: true }
              } as any
            };
            setUploadedFileContent(pkg);
            setRestoreConflictDiff(computeRestoreDiff(pkg));
            showToast(`✓ Single Bill backup detected: #${singleBill.header.billNo}. Ready to restore.`, 'success');
            return;
          }

          if (singleParty && singleParty.name) {
            const pkg: BackupDataPackage = {
              version: '2.0.0',
              backupDate: new Date().toISOString(),
              appTitle: `Polycables Single Customer (${singleParty.name}) Backup`,
              data: {
                parties: [singleParty],
                _isSingleRecord: true,
                _presentModules: { parties: true }
              } as any
            };
            setUploadedFileContent(pkg);
            setRestoreConflictDiff(computeRestoreDiff(pkg));
            showToast(`✓ Single Customer backup detected: "${singleParty.name}". Ready to restore.`, 'success');
            return;
          }
        }

        // Explicit validation and safe fallback to empty arrays [] and objects {} for all entities
        const sanitizedData: any = {
          _presentModules: presentModules,
          items: getArray(['items', 'products', 'masterItems', 'stockItems']).filter((x: any) => x && typeof x === 'object'),
          parties: getArray(['parties', 'customers', 'clients', 'partyList']).filter((x: any) => x && typeof x === 'object'),
          storedBills: getArray(['storedBills', 'stored_bills', 'bills', 'invoices', 'billList']).filter((x: any) => x && typeof x === 'object'),
          salespersons: getArray(['salespersons', 'salesPersons', 'sales_persons', 'sales_team', 'users']).filter(
            (x: any) => x && typeof x === 'object' && !isUnassignedAdminRecord(x)
          ),
          collections: getArray(['collections', 'moneyReceipts', 'payments']).filter((x: any) => x && typeof x === 'object'),
          expenses: getArray(['expenses', 'monthlyExpenses', 'expenseList']).filter((x: any) => x && typeof x === 'object'),
          bankDeposits: getArray(['bankDeposits', 'bank_deposits', 'deposits']).filter((x: any) => x && typeof x === 'object'),
          factoryImports: getArray(['factoryImports', 'factory_imports', 'imports']).filter((x: any) => x && typeof x === 'object'),
          stockReturns: getArray(['stockReturns', 'stock_returns', 'returns']).filter((x: any) => x && typeof x === 'object'),
          deliveryChallans: getArray(['deliveryChallans', 'delivery_challans', 'challans']).filter((x: any) => x && typeof x === 'object'),
          colorExchanges: getArray(['colorExchanges', 'color_exchanges']).filter((x: any) => x && typeof x === 'object'),
          conveyances: getArray(['conveyances', 'conveyanceBills']).filter((x: any) => x && typeof x === 'object'),
          branches: getArray(['branches', 'salesCenters', 'sales_centers', 'outlets', 'showrooms']).filter((x: any) => x && typeof x === 'object'),
          requisitions: getArray(['requisitions', 'branchRequisitions']).filter((x: any) => x && typeof x === 'object'),
          closings: getArray(['closings', 'dailyClosings', 'yearEndClosings', 'cashInHand']).filter((x: any) => x && typeof x === 'object'),
          customCategories: getArray(['customCategories', 'custom_categories']).filter(Boolean),
          orderedCategories: getArray(['orderedCategories', 'ordered_categories']).filter(Boolean),
          bankList: getArray(['bankList', 'bank_list'])
            .map(toSafeStr)
            .filter((s: string) => s && s !== '[object Object]' && !s.startsWith('[object ')),
          accountList: getArray(['accountList', 'account_list'])
            .map(toSafeStr)
            .filter((s: string) => s && s !== '[object Object]' && !s.startsWith('[object ')),
          trashedItems: getArray(['trashedItems', 'trashed_items']).filter(Boolean),
          trashedParties: getArray(['trashedParties', 'trashed_parties']).filter(Boolean),
          trashedCollections: getArray(['trashedCollections', 'trashed_collections']).filter(Boolean),
          trashedChallans: getArray(['trashedChallans', 'trashed_challans']).filter(Boolean),
          company: (rawData.company && typeof rawData.company === 'object') ? rawData.company : {},
          header: (rawData.header && typeof rawData.header === 'object') ? rawData.header : {},
          ...(Array.isArray(rawData.priceSnapshots || rawData.price_snapshots) ? { priceSnapshots: rawData.priceSnapshots || rawData.price_snapshots } : {}),
          ...(rawData.categoryNumbers && typeof rawData.categoryNumbers === 'object' ? { categoryNumbers: rawData.categoryNumbers } : {}),
          ...(Array.isArray(rawData.expenseCategories || rawData.expense_categories) ? { expenseCategories: rawData.expenseCategories || rawData.expense_categories } : {}),
          adminPassword: typeof rawData.adminPassword === 'string' ? rawData.adminPassword : ''
        };

        const hasAnyEntity =
          hasAnyPresentModule ||
          sanitizedData.items.length > 0 ||
          sanitizedData.parties.length > 0 ||
          sanitizedData.storedBills.length > 0 ||
          sanitizedData.salespersons.length > 0 ||
          sanitizedData.collections.length > 0 ||
          sanitizedData.expenses.length > 0 ||
          sanitizedData.bankDeposits.length > 0 ||
          sanitizedData.factoryImports.length > 0 ||
          sanitizedData.stockReturns.length > 0 ||
          sanitizedData.deliveryChallans.length > 0 ||
          sanitizedData.colorExchanges.length > 0 ||
          sanitizedData.conveyances.length > 0 ||
          sanitizedData.branches.length > 0 ||
          sanitizedData.requisitions.length > 0 ||
          sanitizedData.closings.length > 0 ||
          sanitizedData.customCategories.length > 0 ||
          sanitizedData.orderedCategories.length > 0 ||
          sanitizedData.bankList.length > 0 ||
          sanitizedData.accountList.length > 0 ||
          sanitizedData.trashedItems.length > 0 ||
          sanitizedData.trashedParties.length > 0 ||
          sanitizedData.trashedCollections.length > 0 ||
          sanitizedData.trashedChallans.length > 0 ||
          Boolean(sanitizedData.adminPassword) ||
          Boolean(rawData?.company?.name);

        if (!hasAnyEntity) {
          throw new Error('Unrecognized backup JSON structure. No valid records or modules were found.');
        }

        const pkg: BackupDataPackage = {
          version: parsed.version || '2.0.0',
          backupDate: parsed.backupDate || new Date().toISOString(),
          appTitle: parsed.appTitle || 'Polycables Store & Billing System Backup',
          data: sanitizedData
        };

        const diff = computeRestoreDiff(pkg);
        setRestoreConflictDiff(diff);
        setUploadedFileContent(pkg);

        if (diff.totalConflicts > 0) {
          showToast(`✓ Backup verified: ${diff.totalNew} new records, ${diff.totalConflicts} existing matching records found.`, 'success');
        } else {
          showToast(`✓ Backup verified! All ${diff.totalNew} records are ready to restore.`, 'success');
        }
      } catch (err: any) {
        setUploadedFileContent(null);
        setRestoreConflictDiff(null);
        setUploadedSingleItem(null);
        setUploadedSingleBill(null);
        setUploadedSingleParty(null);
        const errMsg = err?.message || 'Failed to parse JSON backup file.';
        setRestoreError(errMsg);
        showToast('Backup File Error: ' + errMsg, 'error');
      }
    };
    reader.readAsText(file);
  };

  // 3. Confirm & Execute Restore
  const handleExecuteRestore = () => {
    if (!uploadedFileContent) return;

    try {
      // Clear deleted entity tombstones BEFORE merging and restoring so restored records are never dropped
      resetGlobalDeletedIds();
      try {
        localStorage.setItem('polycables_last_restore_time', String(Date.now()));
        localStorage.removeItem('polycables_global_deleted_ids');
        localStorage.removeItem('polycables_deleted_entity_ids');
        localStorage.removeItem('polycables_deleted_item_ids');
        localStorage.removeItem('polycables_deleted_salespersons');
        localStorage.removeItem('polycables_trashed_users');
        localStorage.removeItem('polycables_trashed_bills');
      } catch (_) {}

      const resolvedPkg = mergeWithResolution(uploadedFileContent, restoreConflictStrategy);
      if (Array.isArray(resolvedPkg?.data?.items) && resolvedPkg.data.items.length > 0) {
        resolvedPkg.data.items = syncSpecialItemRatesWithBaseItems(resolvedPkg.data.items);
      }

      // Execute centralized restore (updates App refs & React state immediately and persists asynchronously to localStorage, IndexedDB, /api/sync, and Firestore without blocking UI)
      onRestoreAllData(resolvedPkg);

      // Sync SettingsView local fallback bank/account lists & admin password without re-serializing large slices synchronously
      if (Array.isArray(resolvedPkg.data?.bankList) && resolvedPkg.data.bankList.length > 0) {
        const safeBanks = resolvedPkg.data.bankList
          .map(toSafeStr)
          .filter((s: string) => s && s !== '[object Object]' && !s.startsWith('[object '));
        if (safeBanks.length > 0) setLocalBankList(safeBanks);
      }
      if (Array.isArray(resolvedPkg.data?.accountList) && resolvedPkg.data.accountList.length > 0) {
        const safeAccs = resolvedPkg.data.accountList
          .map(toSafeStr)
          .filter((s: string) => s && s !== '[object Object]' && !s.startsWith('[object '));
        if (safeAccs.length > 0) setLocalAccountList(safeAccs);
      }
      if (resolvedPkg.data?.adminPassword) {
        safeSetStorageItem('app_admin_password', resolvedPkg.data.adminPassword);
      }

      const restoredDataSnapshot = resolvedPkg.data;
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('polycables_backup_restored', { detail: restoredDataSnapshot }));
      }, 30);

      const summaryInfo = {
        itemCount: resolvedPkg.data?.items?.length || 0,
        partyCount: resolvedPkg.data?.parties?.length || 0,
        billCount: resolvedPkg.data?.storedBills?.length || 0,
        collectionCount: resolvedPkg.data?.collections?.length || 0,
        depositCount: resolvedPkg.data?.bankDeposits?.length || 0,
        expenseCount: resolvedPkg.data?.expenses?.length || 0,
        newStoredCount: restoreConflictDiff?.totalNew || 0,
        existingResolvedCount: restoreConflictDiff?.totalConflicts || 0,
        backupDate: uploadedFileContent.backupDate
      };

      setRestoreSuccessSummary(summaryInfo);
      setShowConfirmRestoreModal(false);
      setUploadedFileContent(null);
      setRestoreConflictDiff(null);
      setUploadedFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';

      showToast('All System Data restored and synchronized successfully!', 'success');
    } catch (err: any) {
      showToast('Restore Error: ' + (err?.message || err), 'error');
    }
  };

  return (
    <div className="cyber-glass-card rounded-2xl shadow-xl border border-cyan-500/25 overflow-hidden font-sans space-y-0 text-white">
      {/* Toast Notification */}
      {toastMsg && (
        <div
          className={`p-3 px-4 text-xs font-bold flex items-center justify-between border-b ${
            toastMsg.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/30'
              : 'bg-rose-950/90 text-rose-200 border-rose-500/30'
          } animate-in fade-in duration-200`}
        >
          <div className="flex items-center space-x-2">
            {toastMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            )}
            <span>{toastMsg.text}</span>
          </div>
        </div>
      )}

      {/* Main Header */}
      <div className="cyber-glass-header text-white p-4 flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/25">
        <div className="flex items-center space-x-3">
          <div className="bg-cyan-400 p-2.5 rounded-xl shadow-md">
            <Settings className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-white">System Settings Directory</h1>
            <p className="text-[11px] text-cyan-200/80">
              Manage Backup & Restore, System Data Synchronization & Trash Directory
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-bold text-cyan-200/80 uppercase tracking-wider">Section:</span>
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as any)}
            className="bg-[#061520] text-cyan-200 border border-cyan-500/30 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-cyan-400 cursor-pointer"
          >
            {isSuperAdmin && (
              <>
                <option value="backup">Backup &amp; Restore</option>
                <option value="banks_accounts">Bank &amp; Accounts ({effectiveBankList.length}/{effectiveAccountList.length})</option>
                <option value="email_smtp">Email &amp; SMTP</option>
                <option value="trash">Trash</option>
                <option value="system">Data Summary</option>
              </>
            )}
            <option value="allowance_settings">Lunch &amp; Hotel Setting</option>
            <option value="shortcuts">Keyboard Shortcuts</option>
            <option value="theme_appearance">Theme &amp; Appearance</option>
            {isSuperAdmin && (
              <option value="user_roles_menus">User Roles &amp; Menus</option>
            )}
          </select>
        </div>
      </div>

      {/* TAB 1: BACKUP AND RESTORE */}
      {activeTab === 'backup' && (
        <div className="p-5 space-y-6">
          {/* Top Info Banner */}
          <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-4 flex items-start space-x-3">
            <ShieldCheck className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wide">
                Database Backup & Disaster Recovery System
              </h3>
              <p className="text-xs text-slate-200 mt-0.5">
                Export all sales invoices, item directory records, customers, expenses, collections, deposits,
                and trash data to a secure JSON backup package. You can restore this backup package anytime.
              </p>
            </div>
          </div>

          {/* Automated Daily Cloud Backups Card */}
          <div className="cyber-glass-subcard border border-cyan-500/25 hover:border-emerald-400/50 rounded-2xl p-5 shadow-md transition-all">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-cyan-500/20">
              <div className="flex items-start space-x-3.5">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/15 text-emerald-300 flex items-center justify-center shrink-0 border border-emerald-400/30">
                  <Cloud className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-extrabold text-white tracking-tight">
                      Automated Daily Cloud Backups
                    </h3>
                    {autoBackupStatus.enabled ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
                        Enabled (24-Hour Cycle)
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#081b28] text-slate-300 border border-cyan-500/25">
                        Disabled
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Packages all 17 core ERP modules and synchronizes a daily snapshot to primary Google Cloud Firestore and secondary multi-cloud failover nodes.
                  </p>
                </div>
              </div>

              {/* Action Controls: Toggle & Trigger Button */}
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={handleManualDailyBackupTrigger}
                  disabled={isTriggeringAutoBackup}
                  className="px-3.5 py-2 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 text-slate-950 rounded-xl text-xs font-black flex items-center space-x-2 cursor-pointer shadow-xs transition-colors"
                  title="Run backup snapshot now without waiting for 24-hour cycle"
                >
                  {isTriggeringAutoBackup ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-950" />
                      <span>Uploading Snapshot...</span>
                    </>
                  ) : (
                    <>
                      <CloudUpload className="w-3.5 h-3.5 text-slate-950" />
                      <span>Run Daily Backup Now</span>
                    </>
                  )}
                </button>

                {/* Toggle labeled "Enable Automated Daily Cloud Backups" */}
                <label className="flex items-center space-x-2.5 cursor-pointer select-none bg-[#061520] hover:bg-[#081b28] px-3 py-2 rounded-xl border border-cyan-500/30 transition-colors">
                  <span className="text-xs font-bold text-slate-200">
                    Enable Automated Daily Cloud Backups
                  </span>
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoBackupStatus.enabled}
                      onChange={(e) => handleToggleAutoBackup(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                  </div>
                </label>
              </div>
            </div>

            {/* Status Information Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-4 text-xs">
              <div className="bg-[#061520]/80 border border-cyan-500/20 rounded-xl p-3">
                <div className="text-[10px] font-extrabold text-cyan-300/80 uppercase tracking-wider mb-1 flex items-center space-x-1">
                  <Clock className="w-3 h-3 text-cyan-400" />
                  <span>Last Successful Cloud Backup</span>
                </div>
                <div className="font-bold text-white text-xs">
                  {autoBackupStatus.lastBackupFormatted}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Stored in local verification register
                </div>
              </div>

              <div className="bg-[#061520]/80 border border-cyan-500/20 rounded-xl p-3">
                <div className="text-[10px] font-extrabold text-cyan-300/80 uppercase tracking-wider mb-1 flex items-center space-x-1">
                  <ShieldCheck className="w-3 h-3 text-cyan-400" />
                  <span>Current Schedule Status</span>
                </div>
                <div>
                  {autoBackupStatus.isBackedUpToday ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                      ✓ Backed Up Today
                    </span>
                  ) : autoBackupStatus.enabled ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-400/30">
                      ⏱ Scheduled (Pending 24-hr Sync)
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-[#081b28] text-slate-300">
                      Paused
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  17 core ERP modules included
                </div>
              </div>

              <div className="bg-[#061520]/80 border border-cyan-500/20 rounded-xl p-3">
                <div className="text-[10px] font-extrabold text-cyan-300/80 uppercase tracking-wider mb-1 flex items-center space-x-1">
                  <HardDrive className="w-3 h-3 text-cyan-400" />
                  <span>Dedicated Storage Path</span>
                </div>
                <div className="font-mono font-bold text-slate-200 text-[11px] truncate" title={(autoBackupStatus.summary as any)?.storagePath || `/automated-backups/${new Date().toISOString().slice(0, 10)}.json`}>
                  {(autoBackupStatus.summary as any)?.storagePath || `/automated-backups/${new Date().toISOString().slice(0, 10)}.json`}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {(autoBackupStatus.summary as any)?.recordCount ? `${(autoBackupStatus.summary as any).recordCount} total records` : 'Full database snapshot'}
                </div>
              </div>

              <div className="bg-[#061520]/80 border border-cyan-500/20 rounded-xl p-3">
                <div className="text-[10px] font-extrabold text-cyan-300/80 uppercase tracking-wider mb-1 flex items-center space-x-1">
                  <Server className="w-3 h-3 text-cyan-400" />
                  <span>Cloud Nodes & Failover</span>
                </div>
                <div className="font-bold text-white text-xs flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span>Primary + {(cloudConfig.cloudNodes?.length || 2)} Secondary Nodes</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Auto failover to Supabase/Firebase active
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* BOX 1: EXPORT SYSTEM BACKUP */}
            <div className="cyber-glass-subcard border border-cyan-500/25 rounded-2xl p-5 flex flex-col justify-between hover:border-cyan-400/50 transition-all shadow-md">
              <div>
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-10 h-10 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 rounded-xl flex items-center justify-center font-bold">
                    <Download className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-white">Export All-Inclusive Backup Package</h3>
                    <p className="text-[11px] text-slate-300">Exhaustive JSON snapshot of 100% database records & settings</p>
                  </div>
                </div>

                <div className="bg-[#061520]/80 p-3.5 rounded-xl border border-cyan-500/25 space-y-2 my-4 text-xs text-slate-200">
                  <div className="flex items-center justify-between border-b border-cyan-500/20 pb-1.5">
                    <span className="font-extrabold text-[11px] uppercase tracking-wider text-cyan-200">
                      System Database Records (Live Snapshot):
                    </span>
                    <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-400/30 px-2 py-0.5 rounded-full">
                      Live Cloud Synchronized
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-[11px] font-mono">
                    <div>• Invoices: <strong className="text-white">{storedBills.length}</strong></div>
                    <div>• Items: <strong className="text-white">{items.length}</strong></div>
                    <div>• Customers: <strong className="text-white">{parties.length}</strong></div>
                    <div>• Sales Reps: <strong className="text-white">{salespersons.length}</strong></div>
                    <div>• Collections: <strong className="text-white">{collections.length}</strong></div>
                    <div>• Expenses: <strong className="text-white">{expenses.length}</strong></div>
                    <div>• Deposits: <strong className="text-white">{cleanBankDeposits.length}</strong></div>
                    <div>• Factory In: <strong className="text-white">{factoryImports.length}</strong></div>
                    <div>• Returns: <strong className="text-white">{stockReturns.length}</strong></div>
                    <div>• Categories: <strong className="text-white">{categoriesCount}</strong></div>
                    <div>• Banks: <strong className="text-white">{currentBanksList.length}</strong></div>
                    <div>• Trashed: <strong className="text-white">{trashedCount}</strong></div>
                    <div>• User: <strong className="text-white">{salespersons.length}</strong></div>
                    <div>• Conveyances: <strong className="text-white">{effectiveConveyances.length}</strong></div>
                    <div>• Sales Centers: <strong className="text-white">{effectiveBranches.length}</strong></div>
                    <div>• Requisitions: <strong className="text-white">{effectiveRequisitions.length}</strong></div>
                    <div>• Party & Statement: <strong className="text-white">{parties.length}</strong></div>
                  </div>
                </div>

                {/* Single Entity / Module Backup (One-Click Download - Not Items Name Wise) */}
                <div className="bg-[#061520]/80 border border-emerald-400/30 rounded-xl p-3 my-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between border-b border-cyan-500/20 pb-1">
                    <span className="font-extrabold text-emerald-300 flex items-center space-x-1.5 text-[11px] uppercase tracking-wider">
                      <Package className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Single Module Backup (One-Click Download)</span>
                    </span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-bold px-2 py-0.5 rounded-full">
                      Entity Wise (Not Item Name Wise)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleExportSingleModule('invoices')}
                      className="p-1.5 bg-[#081b28] hover:bg-emerald-500/15 hover:border-emerald-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                      title="Download Invoices only"
                    >
                      <span className="truncate">• Invoices ({storedBills.length})</span>
                      <Download className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSingleModule('items')}
                      className="p-1.5 bg-[#081b28] hover:bg-emerald-500/15 hover:border-emerald-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                      title="Download Items only"
                    >
                      <span className="truncate">• Items ({items.length})</span>
                      <Download className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSingleModule('customers')}
                      className="p-1.5 bg-[#081b28] hover:bg-emerald-500/15 hover:border-emerald-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                      title="Download Customers only"
                    >
                      <span className="truncate">• Customers ({parties.length})</span>
                      <Download className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSingleModule('salespersons')}
                      className="p-1.5 bg-[#081b28] hover:bg-emerald-500/15 hover:border-emerald-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                      title="Download Sales Reps only"
                    >
                      <span className="truncate">• Sales Reps ({salespersons.length})</span>
                      <Download className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSingleModule('collections')}
                      className="p-1.5 bg-[#081b28] hover:bg-emerald-500/15 hover:border-emerald-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                      title="Download Collections only"
                    >
                      <span className="truncate">• Collections ({collections.length})</span>
                      <Download className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSingleModule('expenses')}
                      className="p-1.5 bg-[#081b28] hover:bg-emerald-500/15 hover:border-emerald-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                      title="Download Expenses only"
                    >
                      <span className="truncate">• Expenses ({expenses.length})</span>
                      <Download className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSingleModule('deposits')}
                      className="p-1.5 bg-[#081b28] hover:bg-emerald-500/15 hover:border-emerald-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                      title="Download Deposits only"
                    >
                      <span className="truncate">• Deposits ({cleanBankDeposits.length})</span>
                      <Download className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSingleModule('factory_in')}
                      className="p-1.5 bg-[#081b28] hover:bg-emerald-500/15 hover:border-emerald-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                      title="Download Factory In only"
                    >
                      <span className="truncate">• Factory In ({factoryImports.length})</span>
                      <Download className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSingleModule('returns')}
                      className="p-1.5 bg-[#081b28] hover:bg-emerald-500/15 hover:border-emerald-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                      title="Download Returns only"
                    >
                      <span className="truncate">• Returns ({stockReturns.length})</span>
                      <Download className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSingleModule('categories')}
                      className="p-1.5 bg-[#081b28] hover:bg-emerald-500/15 hover:border-emerald-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                      title="Download Categories only"
                    >
                      <span className="truncate">• Categories ({categoriesCount})</span>
                      <Download className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSingleModule('banks')}
                      className="p-1.5 bg-[#081b28] hover:bg-emerald-500/15 hover:border-emerald-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                      title="Download Banks only"
                    >
                      <span className="truncate">• Banks ({currentBanksList.length})</span>
                      <Download className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSingleModule('trashed')}
                      className="p-1.5 bg-[#081b28] hover:bg-emerald-500/15 hover:border-emerald-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                      title="Download Trashed only"
                    >
                      <span className="truncate">• Trashed ({trashedCount})</span>
                      <Download className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSingleModule('users')}
                      className="p-1.5 bg-[#081b28] hover:bg-emerald-500/15 hover:border-emerald-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                      title="Download Users only"
                    >
                      <span className="truncate">• User ({salespersons.length})</span>
                      <Download className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSingleModule('conveyances')}
                      className="p-1.5 bg-[#081b28] hover:bg-emerald-500/15 hover:border-emerald-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                      title="Download Conveyances only"
                    >
                      <span className="truncate">• Conveyances ({effectiveConveyances.length})</span>
                      <Download className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSingleModule('branches')}
                      className="p-1.5 bg-[#081b28] hover:bg-emerald-500/15 hover:border-emerald-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                      title="Download Sales Centers only"
                    >
                      <span className="truncate">• Sales Centers ({effectiveBranches.length})</span>
                      <Download className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSingleModule('requisitions')}
                      className="p-1.5 bg-[#081b28] hover:bg-emerald-500/15 hover:border-emerald-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                      title="Download Requisitions only"
                    >
                      <span className="truncate">• Requisitions ({effectiveRequisitions.length})</span>
                      <Download className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSingleModule('party_statement')}
                      className="p-1.5 bg-amber-500/15 hover:bg-amber-500/25 hover:border-amber-400/50 border border-amber-400/35 rounded-lg text-[11px] font-black text-amber-200 text-left cursor-pointer flex items-center justify-between transition-colors col-span-2 sm:col-span-2"
                      title="Download Party & Statement ledger records"
                    >
                      <span className="truncate">• Party & Statement ({parties.length} Customers)</span>
                      <Download className="w-3 h-3 text-amber-300 shrink-0 ml-1" />
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={handleExportBackup}
                className="w-full bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs py-2.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 cursor-pointer active:scale-98"
              >
                <Download className="w-4 h-4" />
                <span>Export All Data at a Time (Complete All-in-One Backup)</span>
              </button>
            </div>

            {/* BOX 2: RESTORE SYSTEM BACKUP */}
            <div className="cyber-glass-subcard text-slate-200 border border-cyan-500/25 rounded-2xl p-5 flex flex-col justify-between hover:border-cyan-400/50 transition-all shadow-md">
              <div>
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-10 h-10 bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 rounded-xl flex items-center justify-center font-bold">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-white">Restore System Backup</h3>
                    <p className="text-[11px] text-slate-300">Upload a JSON backup package or single item to restore system data</p>
                  </div>
                </div>

                <div className="bg-[#061520]/80 text-slate-200 p-3.5 rounded-xl border border-cyan-500/25 space-y-3 my-4">
                  <label className="block text-xs font-bold text-cyan-200">Select Backup File (.json):</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileChange}
                    className="block w-full text-xs text-slate-200 bg-[#081b28] border border-cyan-500/25 rounded-lg p-1.5 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-cyan-400 file:text-slate-950 hover:file:bg-cyan-300 cursor-pointer"
                  />

                  {restoreError && (
                    <div className="p-2 bg-rose-500/15 border border-rose-400/40 text-rose-200 text-xs rounded-lg flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                      <span>{restoreError}</span>
                    </div>
                  )}

                  {uploadedFileContent && uploadedStats && (
                    <div className="space-y-3 text-slate-200">
                      <div className="p-3 bg-cyan-500/10 text-slate-200 border border-cyan-400/30 rounded-xl text-xs space-y-2">
                        <div className="flex items-center justify-between border-b pb-1.5 border-cyan-500/25">
                          <span className="font-extrabold text-cyan-200 flex items-center space-x-1.5">
                            <FileJson className="w-4 h-4 text-cyan-400" />
                            <span className="truncate">Backup Package: {uploadedFileName}</span>
                          </span>
                          <span className="text-[10px] font-bold text-cyan-200 bg-cyan-500/20 border border-cyan-400/30 px-2 py-0.5 rounded-full shrink-0">
                            Ready to Restore
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-[11px] font-mono bg-[#061520] text-slate-300 p-2.5 rounded-lg border border-cyan-500/20">
                          <div>• Invoices: <strong className="text-white">{uploadedStats.invCount}</strong></div>
                          <div>• Items: <strong className="text-white">{uploadedStats.itCount}</strong></div>
                          <div>• Customers: <strong className="text-white">{uploadedStats.custCount}</strong></div>
                          <div>• Sales Reps: <strong className="text-white">{uploadedStats.spCount}</strong></div>
                          <div>• Collections: <strong className="text-white">{uploadedStats.colCount}</strong></div>
                          <div>• Expenses: <strong className="text-white">{uploadedStats.expCount}</strong></div>
                          <div>• Deposits: <strong className="text-white">{uploadedStats.depCount}</strong></div>
                          <div>• Factory In: <strong className="text-white">{uploadedStats.factCount}</strong></div>
                          <div>• Returns: <strong className="text-white">{uploadedStats.retCount}</strong></div>
                          <div>• Categories: <strong className="text-white">{uploadedStats.catCount}</strong></div>
                          <div>• Banks: <strong className="text-white">{uploadedStats.bankCount}</strong></div>
                          <div>• Trashed: <strong className="text-white">{uploadedStats.trCount}</strong></div>
                          <div>• User: <strong className="text-white">{uploadedStats.userCount}</strong></div>
                          <div>• Conveyances: <strong className="text-white">{uploadedStats.convCount}</strong></div>
                          <div>• Sales Centers: <strong className="text-white">{uploadedStats.branchCount}</strong></div>
                          <div>• Requisitions: <strong className="text-white">{uploadedStats.reqCount}</strong></div>
                          <div>• Party & Statement: <strong className="text-white">{uploadedStats.partyStmtCount}</strong></div>
                        </div>
                      </div>

                      {/* Single Entity / Module Restore Buttons (One-Click Restore - Not Items Name Wise) */}
                      <div className="bg-[#081b28] text-slate-200 border border-cyan-500/25 rounded-xl p-3 space-y-2 text-xs">
                        <div className="flex items-center justify-between border-b pb-1 border-cyan-500/20">
                          <span className="font-extrabold text-cyan-200 flex items-center space-x-1.5 text-[11px] uppercase tracking-wider">
                            <Package className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Single Module Restore (One-Click Restore)</span>
                          </span>
                          <span className="text-[10px] bg-cyan-500/20 text-cyan-200 border border-cyan-400/30 font-bold px-2 py-0.5 rounded-full">
                            Entity Wise (Not Item Name Wise)
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => handleRestoreSingleModule('invoices')}
                            className="p-1.5 bg-[#061520] hover:bg-cyan-500/15 hover:border-cyan-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                            title="Restore Invoices only"
                          >
                            <span className="truncate">• Invoices ({uploadedStats.invCount})</span>
                            <RefreshCw className="w-3 h-3 text-cyan-400 shrink-0 ml-1" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestoreSingleModule('items')}
                            className="p-1.5 bg-[#061520] hover:bg-cyan-500/15 hover:border-cyan-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                            title="Restore Items only"
                          >
                            <span className="truncate">• Items ({uploadedStats.itCount})</span>
                            <RefreshCw className="w-3 h-3 text-cyan-400 shrink-0 ml-1" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestoreSingleModule('customers')}
                            className="p-1.5 bg-[#061520] hover:bg-cyan-500/15 hover:border-cyan-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                            title="Restore Customers only"
                          >
                            <span className="truncate">• Customers ({uploadedStats.custCount})</span>
                            <RefreshCw className="w-3 h-3 text-cyan-400 shrink-0 ml-1" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestoreSingleModule('salespersons')}
                            className="p-1.5 bg-[#061520] hover:bg-cyan-500/15 hover:border-cyan-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                            title="Restore Sales Reps only"
                          >
                            <span className="truncate">• Sales Reps ({uploadedStats.spCount})</span>
                            <RefreshCw className="w-3 h-3 text-cyan-400 shrink-0 ml-1" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestoreSingleModule('collections')}
                            className="p-1.5 bg-[#061520] hover:bg-cyan-500/15 hover:border-cyan-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                            title="Restore Collections only"
                          >
                            <span className="truncate">• Collections ({uploadedStats.colCount})</span>
                            <RefreshCw className="w-3 h-3 text-cyan-400 shrink-0 ml-1" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestoreSingleModule('expenses')}
                            className="p-1.5 bg-[#061520] hover:bg-cyan-500/15 hover:border-cyan-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                            title="Restore Expenses only"
                          >
                            <span className="truncate">• Expenses ({uploadedStats.expCount})</span>
                            <RefreshCw className="w-3 h-3 text-cyan-400 shrink-0 ml-1" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestoreSingleModule('deposits')}
                            className="p-1.5 bg-[#061520] hover:bg-cyan-500/15 hover:border-cyan-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                            title="Restore Deposits only"
                          >
                            <span className="truncate">• Deposits ({uploadedStats.depCount})</span>
                            <RefreshCw className="w-3 h-3 text-cyan-400 shrink-0 ml-1" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestoreSingleModule('factory_in')}
                            className="p-1.5 bg-[#061520] hover:bg-cyan-500/15 hover:border-cyan-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                            title="Restore Factory In only"
                          >
                            <span className="truncate">• Factory In ({uploadedStats.factCount})</span>
                            <RefreshCw className="w-3 h-3 text-cyan-400 shrink-0 ml-1" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestoreSingleModule('returns')}
                            className="p-1.5 bg-[#061520] hover:bg-cyan-500/15 hover:border-cyan-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                            title="Restore Returns only"
                          >
                            <span className="truncate">• Returns ({uploadedStats.retCount})</span>
                            <RefreshCw className="w-3 h-3 text-cyan-400 shrink-0 ml-1" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestoreSingleModule('categories')}
                            className="p-1.5 bg-[#061520] hover:bg-cyan-500/15 hover:border-cyan-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                            title="Restore Categories only"
                          >
                            <span className="truncate">• Categories ({uploadedStats.catCount})</span>
                            <RefreshCw className="w-3 h-3 text-cyan-400 shrink-0 ml-1" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestoreSingleModule('banks')}
                            className="p-1.5 bg-[#061520] hover:bg-cyan-500/15 hover:border-cyan-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                            title="Restore Banks only"
                          >
                            <span className="truncate">• Banks ({uploadedStats.bankCount})</span>
                            <RefreshCw className="w-3 h-3 text-cyan-400 shrink-0 ml-1" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestoreSingleModule('trashed')}
                            className="p-1.5 bg-[#061520] hover:bg-cyan-500/15 hover:border-cyan-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                            title="Restore Trashed only"
                          >
                            <span className="truncate">• Trashed ({uploadedStats.trCount})</span>
                            <RefreshCw className="w-3 h-3 text-cyan-400 shrink-0 ml-1" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestoreSingleModule('users')}
                            className="p-1.5 bg-[#061520] hover:bg-cyan-500/15 hover:border-cyan-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                            title="Restore Users only"
                          >
                            <span className="truncate">• User ({uploadedStats.userCount})</span>
                            <RefreshCw className="w-3 h-3 text-cyan-400 shrink-0 ml-1" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestoreSingleModule('conveyances')}
                            className="p-1.5 bg-[#061520] hover:bg-cyan-500/15 hover:border-cyan-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                            title="Restore Conveyances only"
                          >
                            <span className="truncate">• Conveyances ({uploadedStats.convCount})</span>
                            <RefreshCw className="w-3 h-3 text-cyan-400 shrink-0 ml-1" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestoreSingleModule('branches')}
                            className="p-1.5 bg-[#061520] hover:bg-cyan-500/15 hover:border-cyan-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                            title="Restore Sales Centers only"
                          >
                            <span className="truncate">• Sales Centers ({uploadedStats.branchCount})</span>
                            <RefreshCw className="w-3 h-3 text-cyan-400 shrink-0 ml-1" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestoreSingleModule('requisitions')}
                            className="p-1.5 bg-[#061520] hover:bg-cyan-500/15 hover:border-cyan-400/40 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-200 text-left cursor-pointer flex items-center justify-between transition-colors"
                            title="Restore Requisitions only"
                          >
                            <span className="truncate">• Requisitions ({uploadedStats.reqCount})</span>
                            <RefreshCw className="w-3 h-3 text-cyan-400 shrink-0 ml-1" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestoreSingleModule('party_statement')}
                            className="p-1.5 bg-amber-500/15 hover:bg-amber-500/25 hover:border-amber-400/50 border border-amber-400/35 rounded-lg text-[11px] font-black text-amber-200 text-left cursor-pointer flex items-center justify-between transition-colors col-span-2 sm:col-span-2"
                            title="Restore Party & Statement records"
                          >
                            <span className="truncate">• Party & Statement ({uploadedStats.partyStmtCount} Customers)</span>
                            <RefreshCw className="w-3 h-3 text-amber-300 shrink-0 ml-1" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <button
                disabled={!uploadedFileContent}
                onClick={() => setShowConfirmRestoreModal(true)}
                className={`w-full font-extrabold text-xs py-2.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 ${
                  uploadedFileContent
                    ? 'bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black cursor-pointer active:scale-98'
                    : 'bg-[#081b28] text-slate-500 border border-cyan-500/15 cursor-not-allowed'
                }`}
              >
                <RefreshCw className="w-4 h-4" />
                <span>Restore All Data at a Time (Complete All-in-One Restore)</span>
              </button>
            </div>
          </div>

          {/* BOX 3: MULTI-CLOUD ADDING SYSTEM & AUTOMATIC FAILOVER POOL */}
          <div className="cyber-glass-subcard border border-cyan-500/25 rounded-2xl p-5 shadow-md space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-cyan-500/20 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 rounded-xl flex items-center justify-center font-bold">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white flex flex-wrap items-center gap-2">
                    <span>Multi-Cloud Storage Pool & Automatic Failover System</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                      ● {(cloudConfig.cloudNodes?.length || 0) + 1} Cloud Nodes Connected
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Add unlimited secondary cloud accounts (Firebase Spark, Supabase, Backblaze B2, Cloudflare R2, Google Cloud, AWS S3, Appwrite, Neon, Server Hub) for real-time mirroring and automatic quota failover.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddAllFreeClouds}
                  className="px-3.5 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-black rounded-xl shadow-[0_0_18px_rgba(34,211,238,0.28)] flex items-center space-x-1.5 transition-all cursor-pointer"
                  title="Add & connect all 10 free zero-cost cloud storage providers (Firebase Spark, Supabase, Backblaze B2, Cloudflare R2, Google Cloud Always-Free, AWS S3, Appwrite, Neon, Server Hub)"
                >
                  <Sparkles className="w-4 h-4 text-slate-950 animate-pulse" />
                  <span>+ Add All Free Cloud</span>
                </button>

                <button
                  type="button"
                  onClick={handleActivateAllNodes}
                  className="px-3.5 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 text-xs font-extrabold rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer"
                  title="Activate and synchronize all free cloud storage nodes"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  <span>Activate All Nodes</span>
                </button>

                <button
                  type="button"
                  onClick={handleInactivateAllNodes}
                  className="px-3.5 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 text-xs font-bold rounded-xl border border-cyan-500/25 flex items-center space-x-1.5 transition-colors cursor-pointer"
                  title="Pause secondary cloud nodes into standby"
                >
                  <span>Inactivate All</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenAddCloudModal}
                  className="px-3.5 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/40 text-xs font-extrabold rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Add New Cloud Storage</span>
                </button>

                <button
                  type="button"
                  onClick={handleTriggerManualCloudFailoverSync}
                  disabled={isCloudSyncing}
                  className="px-3.5 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 text-xs font-bold rounded-xl border border-cyan-500/30 flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCloudSyncing ? 'animate-spin' : ''}`} />
                  <span>{isCloudSyncing ? 'Syncing All Clouds...' : 'Sync All Clouds Now'}</span>
                </button>
              </div>
            </div>

            {/* Failover Chain Status Banner */}
            <div className="p-3.5 rounded-xl bg-[#061520]/85 border border-cyan-500/25 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
              <div className="space-y-1">
                <div className="text-[11px] font-black uppercase tracking-wider text-cyan-300 flex items-center gap-2">
                  <span>Sequential Quota Failover Chain</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/35 text-[10px]">
                    #0 Primary → #1 → #2 → #3 → Next
                  </span>
                </div>
                <div className="text-[11px] text-slate-300">
                  Active Target:{' '}
                  <strong className="text-white">
                    {primaryFirestoreInfo.status === 'active'
                      ? '#0 Primary Google Cloud Firestore'
                      : (() => {
                          const sorted = [...(cloudConfig.cloudNodes || [])].sort((a, b) => a.priority - b.priority);
                          const active = sorted.find((n) => n.id === cloudConfig.activeFailoverNodeId && n.status !== 'disabled' && n.status !== 'quota_exhausted') ||
                            sorted.find((n) => n.status !== 'disabled' && n.status !== 'quota_exhausted');
                          return active ? `#${active.priority} ${active.name} (${active.accountEmail})` : 'Multi-Device Server Sync Hub';
                        })()}
                  </strong>
                  {cloudConfig.lastFailoverReason && (
                    <span className="block text-[10px] text-amber-300 mt-0.5">
                      Last Failover Event: {cloudConfig.lastFailoverReason}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleTestSequentialFailover}
                disabled={isCloudSyncing}
                className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/40 font-bold rounded-lg text-[11px] flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50 shrink-0"
                title="Simulate quota exhaustion on the current cloud node to verify automatic failover to the next configured free cloud account"
              >
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                <span>Test Quota Failover (#1 → #2 → #3)</span>
              </button>
            </div>

            {/* Top Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {/* Primary Status */}
              <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                primaryFirestoreInfo.status === 'quota_exhausted'
                  ? 'bg-rose-500/10 border-rose-400/35'
                  : primaryFirestoreInfo.status === 'offline'
                  ? 'bg-amber-500/10 border-amber-400/35'
                  : 'bg-[#071824]/75 border-cyan-500/25'
              }`}>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-cyan-200/80 uppercase tracking-wider">
                      Primary Cloud Engine (#0)
                    </span>
                    <span className={`px-2 py-0.5 rounded font-bold text-[10px] border ${
                      primaryFirestoreInfo.status === 'quota_exhausted'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-400/40'
                        : primaryFirestoreInfo.status === 'offline'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                    }`}>
                      {primaryFirestoreInfo.status === 'quota_exhausted'
                        ? 'Quota Exhausted'
                        : primaryFirestoreInfo.status === 'offline'
                        ? 'Standby / Offline'
                        : 'Primary Active'}
                    </span>
                  </div>
                  <div className="text-sm font-black text-white flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-emerald-400" />
                    <span>Google Cloud Firestore</span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1 font-mono truncate" title={`${primaryFirestoreInfo.projectId} / ${primaryFirestoreInfo.databaseId}`}>
                    {primaryFirestoreInfo.projectId}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {cloudDiagnostics.lastSuccessAt
                      ? `Last live sync: ${new Date(cloudDiagnostics.lastSuccessAt).toLocaleTimeString()}`
                      : 'Instant live delta sync across all branches, bills, collections, and ledgers.'}
                  </p>
                </div>
                <div className={`mt-3 pt-2 border-t text-[10px] font-semibold flex items-center gap-1 ${
                  primaryFirestoreInfo.status === 'quota_exhausted'
                    ? 'border-rose-400/25 text-rose-300'
                    : 'border-cyan-500/20 text-emerald-300'
                }`}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {primaryFirestoreInfo.status === 'quota_exhausted'
                      ? 'Auto-failover engaged — writing to secondary free cloud node'
                      : 'Real-Time Listener: Active & Armed'}
                  </span>
                </div>
              </div>

              {/* Multi-Cloud Mirroring & Auto-Switch */}
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-400/30 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                    Failover & Mirroring Policy
                  </div>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cloudConfig.autoFailoverEnabled}
                      onChange={(e) => handleUpdateCloudConfig({ autoFailoverEnabled: e.target.checked })}
                      className="w-4 h-4 rounded text-cyan-400 focus:ring-cyan-400 border-cyan-500/40 bg-[#061520]"
                    />
                    <span className="font-bold text-white text-xs">
                      Auto-Switch to Next Cloud on Full Quota
                    </span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cloudConfig.multiCloudMirroring !== false}
                      onChange={(e) => handleUpdateCloudConfig({ multiCloudMirroring: e.target.checked })}
                      className="w-4 h-4 rounded text-cyan-400 focus:ring-cyan-400 border-cyan-500/40 bg-[#061520]"
                    />
                    <span className="font-bold text-white text-xs">
                      Simultaneous Multi-Cloud Mirroring
                    </span>
                  </label>
                </div>
                <div className="mt-3 pt-2 border-t border-amber-400/25 text-[10px] text-amber-200 font-medium flex justify-between">
                  <span>Ready Nodes: <strong>{(cloudConfig.cloudNodes || []).filter(n => n.status !== 'disabled' && n.status !== 'quota_exhausted').length}</strong> / {(cloudConfig.cloudNodes || []).length}</span>
                  <span>Total Syncs: <strong>{cloudConfig.totalFailoverSyncs || 0}</strong></span>
                </div>
              </div>

              {/* Quick Add Cloud Card */}
              <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-400/30 flex flex-col justify-between">
                <div>
                  <div className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider mb-1">
                    Expand Cloud Capacity
                  </div>
                  <div className="text-xs font-extrabold text-white">
                    Connect Additional Cloud Accounts
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1">
                    Chain multiple free Firebase, Supabase, Google Cloud, or S3 buckets so storage never runs out.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenAddCloudModal}
                  className="mt-3 w-full py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Cloud Account / Node</span>
                </button>
              </div>
            </div>

            {/* Connected Secondary Cloud Nodes List */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-cyan-200 flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Connected Secondary & Failover Cloud Nodes ({cloudConfig.cloudNodes?.length || 0})</span>
                </h4>
                <span className="text-[11px] text-slate-300">
                  Ordered by Failover Priority (1 = First Backup, 2 = Second Backup, 3 = Third, etc.)
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[...(cloudConfig.cloudNodes || [])].sort((a, b) => (a.priority || 99) - (b.priority || 99)).map((node, idx) => {
                  const providerLabel =
                    node.provider === 'firebase'
                      ? 'Firebase Cloud (1 GB Free Spark)'
                      : node.provider === 'supabase'
                      ? 'Supabase Cloud (500 MB Free DB)'
                      : node.provider === 'backblaze_b2'
                      ? 'Backblaze B2 (10 GB Zero-Cost)'
                      : node.provider === 'cloudflare_r2'
                      ? 'Cloudflare R2 (10 GB Zero-Egress)'
                      : node.provider === 'google_cloud'
                      ? 'Google Cloud (5 GB Always-Free)'
                      : node.provider === 'aws_s3'
                      ? 'AWS S3 (5 GB Free Tier)'
                      : node.provider === 'appwrite'
                      ? 'Appwrite Cloud (2 GB Free)'
                      : node.provider === 'neon'
                      ? 'Neon Serverless (500 MB Free)'
                      : node.provider === 'server_sync'
                      ? 'Multi-Device Server Sync Hub'
                      : 'Custom Cloud API';

                  const isNodeSyncing = syncingNodeId === node.id;
                  const isActiveTarget = cloudConfig.activeFailoverNodeId === node.id && node.status !== 'quota_exhausted' && node.status !== 'disabled';
                  const quotaMb = Math.max(1, Number(node.quotaLimitMb) || 1024);
                  const usedMb = (Number(node.storageUsedKb) || 0) / 1024;
                  const usagePct = Math.min(100, Math.round((usedMb / quotaMb) * 100));

                  return (
                    <div
                      key={node.id}
                      className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                        node.status === 'quota_exhausted'
                          ? 'bg-rose-500/10 border-rose-400/45'
                          : node.status === 'disabled'
                          ? 'bg-[#061520]/60 border-cyan-500/15 opacity-70'
                          : isActiveTarget
                          ? 'bg-emerald-500/15 border-emerald-400/60 shadow-[0_0_16px_rgba(16,185,129,0.18)]'
                          : node.status === 'active'
                          ? 'bg-emerald-500/10 border-emerald-400/35'
                          : 'bg-[#071824]/80 border-cyan-500/25 hover:border-cyan-400/45'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-[#061520] border border-cyan-500/30 text-amber-300 font-mono text-[11px] font-black flex items-center justify-center shrink-0">
                              #{node.priority || idx + 1}
                            </span>
                            <div>
                              <div className="text-xs font-extrabold text-white flex items-center gap-1.5">
                                <span>{node.name}</span>
                              </div>
                              <div className="text-[11px] font-mono text-cyan-300 font-semibold">
                                {node.accountEmail}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                node.status === 'quota_exhausted'
                                  ? 'bg-rose-500/25 text-rose-200 border-rose-400/50'
                                  : isActiveTarget
                                  ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50'
                                  : node.status === 'active'
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/35'
                                  : node.status === 'disabled'
                                  ? 'bg-slate-800/80 text-slate-300 border-slate-600/40'
                                  : 'bg-amber-500/20 text-amber-300 border-amber-400/35'
                              }`}
                            >
                              {node.status === 'quota_exhausted'
                                ? '● Quota Full (Skipped)'
                                : isActiveTarget
                                ? '★ Failover Active'
                                : node.status === 'active'
                                ? '● Synced & Active'
                                : node.status === 'disabled'
                                ? 'Disabled'
                                : '● Standby Ready'}
                            </span>
                          </div>
                        </div>

                        <div className="mt-2.5 grid grid-cols-2 gap-2 p-2 rounded-lg bg-[#061520]/90 border border-cyan-500/20 text-[11px]">
                          <div>
                            <span className="text-slate-400 font-semibold block text-[10px] uppercase">Provider</span>
                            <span className="font-bold text-slate-100">{providerLabel}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-semibold block text-[10px] uppercase">Project / Bucket ID</span>
                            <span className="font-mono font-bold text-cyan-200 truncate block" title={node.projectId}>
                              {node.projectId || '-'}
                            </span>
                          </div>
                          <div className="col-span-2">
                            <div className="flex items-center justify-between text-[10px] text-slate-300 mb-1">
                              <span>Storage Usage ({usedMb.toFixed(2)} MB / {quotaMb} MB Free Tier)</span>
                              <span className={`font-mono font-bold ${usagePct >= 95 ? 'text-rose-300' : 'text-cyan-300'}`}>{usagePct}%</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                              <div
                                className={`h-full transition-all ${
                                  usagePct >= 95 || node.status === 'quota_exhausted'
                                    ? 'bg-rose-500'
                                    : usagePct >= 75
                                    ? 'bg-amber-400'
                                    : 'bg-emerald-400'
                                }`}
                                style={{ width: `${Math.max(usagePct, node.lastSyncTimestamp ? 3 : 0)}%` }}
                              />
                            </div>
                          </div>
                          {node.databaseUrl && (
                            <div className="col-span-2">
                              <span className="text-slate-400 font-semibold block text-[10px] uppercase">Endpoint URL</span>
                              <span className="font-mono text-[10px] text-slate-300 truncate block" title={node.databaseUrl}>
                                {node.databaseUrl}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-cyan-500/20 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                        <div className="text-slate-300 font-medium">
                          {node.lastSyncTimestamp ? (
                            <span>
                              Last sync: <strong className="text-white">{new Date(node.lastSyncTimestamp).toLocaleString()}</strong>
                              {node.storageUsedKb ? ` (${node.storageUsedKb} KB / ${quotaMb} MB)` : ''}
                            </span>
                          ) : (
                            <span>Ready for instant sync</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          {(node.status === 'quota_exhausted' || (node.storageUsedKb || 0) > 0) && (
                            <button
                              type="button"
                              onClick={() => handleResetNodeQuota(node)}
                              className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/35 font-bold rounded-md flex items-center gap-1 cursor-pointer transition-colors"
                              title="Reset quota usage & re-enable this cloud account"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Reset Quota</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleSyncSingleCloudNode(node)}
                            disabled={isNodeSyncing}
                            className="px-2 py-1 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black rounded-md flex items-center gap-1 cursor-pointer transition-colors"
                            title="Sync all current data to this cloud node now"
                          >
                            <RefreshCw className={`w-3 h-3 ${isNodeSyncing ? 'animate-spin' : ''}`} />
                            <span>Sync Node</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRestoreFromCloudNode(node)}
                            className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/35 font-bold rounded-md flex items-center gap-1 cursor-pointer transition-colors"
                            title="Restore application state from this cloud node's snapshot"
                          >
                            <Download className="w-3 h-3" />
                            <span>Restore</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEditCloudNode(node)}
                            className="p-1 text-slate-300 hover:text-cyan-300 hover:bg-[#0e2a3d] rounded-md cursor-pointer transition-colors"
                            title="Edit cloud node settings"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteCloudNode(node)}
                            className="p-1 text-slate-300 hover:text-rose-300 hover:bg-rose-500/20 rounded-md cursor-pointer transition-colors"
                            title="Remove cloud node"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Add / Edit Cloud Storage Node Modal */}
            {showAddCloudModal && (
              <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-[#091e2c]/95 backdrop-blur-2xl border border-cyan-400/35 rounded-2xl text-white shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                  <div className="cyber-glass-header border-b border-cyan-500/25 px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="p-2 bg-cyan-500/20 text-cyan-300 rounded-xl border border-cyan-400/30">
                        <Cloud className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-extrabold text-white">
                          {editingCloudNodeId ? 'Edit Cloud Storage Node' : 'Add New Cloud Storage Account'}
                        </h3>
                        <p className="text-[11px] text-slate-300">
                          Configure a secondary cloud database or bucket for automatic failover & mirroring
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddCloudModal(false)}
                      className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-[#0e2a3d] cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <form onSubmit={handleSaveCloudNodeForm} className="p-5 space-y-3.5 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block font-bold text-cyan-200 mb-1">
                          Cloud Node Label / Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={cloudNodeForm.name}
                          onChange={(e) => setCloudNodeForm({ ...cloudNodeForm, name: e.target.value })}
                          placeholder="e.g., Tangail Branch Backup Cloud or Head Office Replica"
                          className="w-full px-3 py-2 bg-[#061520] border border-cyan-500/30 rounded-xl font-semibold text-white placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-cyan-200 mb-1">
                          Cloud Account Email *
                        </label>
                        <input
                          type="email"
                          required
                          value={cloudNodeForm.accountEmail}
                          onChange={(e) => setCloudNodeForm({ ...cloudNodeForm, accountEmail: e.target.value })}
                          placeholder="e.g., backup2026@gmail.com"
                          className="w-full px-3 py-2 bg-[#061520] border border-cyan-500/30 rounded-xl font-mono font-semibold text-white placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-cyan-200 mb-1">
                          Cloud Provider Engine *
                        </label>
                        <select
                          value={cloudNodeForm.provider}
                          onChange={(e) => setCloudNodeForm({ ...cloudNodeForm, provider: e.target.value as CloudProviderType })}
                          className="w-full px-3 py-2 bg-[#061520] border border-cyan-500/30 rounded-xl font-bold text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                        >
                          <option value="firebase">Google Firebase (Firestore / RTDB - 1 GB Free Spark)</option>
                          <option value="supabase">Supabase Cloud (PostgreSQL / Storage - 500 MB Free)</option>
                          <option value="backblaze_b2">Backblaze B2 (10 GB Zero-Cost Free Bucket)</option>
                          <option value="cloudflare_r2">Cloudflare R2 Object Storage (10 GB Free / Zero Egress)</option>
                          <option value="google_cloud">Google Cloud Storage (5 GB Always-Free Regional)</option>
                          <option value="aws_s3">Amazon AWS S3 Bucket (5 GB Free Tier)</option>
                          <option value="appwrite">Appwrite Cloud (2 GB Free Database & Storage)</option>
                          <option value="neon">Neon Serverless Cloud DB (500 MB Free Postgres)</option>
                          <option value="server_sync">Multi-Device Server Sync Hub (Zero-Cost Local/Remote)</option>
                          <option value="custom_api">Custom Cloud Webhook / REST API</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-bold text-cyan-200 mb-1">
                          Project ID / Bucket Name
                        </label>
                        <input
                          type="text"
                          value={cloudNodeForm.projectId}
                          onChange={(e) => setCloudNodeForm({ ...cloudNodeForm, projectId: e.target.value })}
                          placeholder="e.g., polycables-backup-03"
                          className="w-full px-3 py-2 bg-[#061520] border border-cyan-500/30 rounded-xl font-mono text-white placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-cyan-200 mb-1">
                          Region / Zone
                        </label>
                        <input
                          type="text"
                          value={cloudNodeForm.region}
                          onChange={(e) => setCloudNodeForm({ ...cloudNodeForm, region: e.target.value })}
                          placeholder="e.g., asia-southeast1"
                          className="w-full px-3 py-2 bg-[#061520] border border-cyan-500/30 rounded-xl font-mono text-white placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block font-bold text-cyan-200 mb-1">
                          Database / Endpoint URL (Optional)
                        </label>
                        <input
                          type="text"
                          value={cloudNodeForm.databaseUrl}
                          onChange={(e) => setCloudNodeForm({ ...cloudNodeForm, databaseUrl: e.target.value })}
                          placeholder="https://your-project-id.firebaseio.com or https://xyz.supabase.co"
                          className="w-full px-3 py-2 bg-[#061520] border border-cyan-500/30 rounded-xl font-mono text-white placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block font-bold text-cyan-200 mb-1">
                          API Key / Service Token (Optional)
                        </label>
                        <input
                          type="password"
                          value={cloudNodeForm.apiKey}
                          onChange={(e) => setCloudNodeForm({ ...cloudNodeForm, apiKey: e.target.value })}
                          placeholder="AIzaSy... or eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                          className="w-full px-3 py-2 bg-[#061520] border border-cyan-500/30 rounded-xl font-mono text-white placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-cyan-200 mb-1">
                          Failover Priority Order
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={cloudNodeForm.priority}
                          onChange={(e) => setCloudNodeForm({ ...cloudNodeForm, priority: Number(e.target.value) || 1 })}
                          className="w-full px-3 py-2 bg-[#061520] border border-cyan-500/30 rounded-xl font-mono font-bold text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-cyan-200 mb-1">
                          Quota Capacity (MB)
                        </label>
                        <input
                          type="number"
                          min={100}
                          max={100000}
                          value={cloudNodeForm.quotaLimitMb}
                          onChange={(e) => setCloudNodeForm({ ...cloudNodeForm, quotaLimitMb: Number(e.target.value) || 1024 })}
                          className="w-full px-3 py-2 bg-[#061520] border border-cyan-500/30 rounded-xl font-mono font-bold text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="pt-1">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={cloudNodeForm.autoFailover}
                          onChange={(e) => setCloudNodeForm({ ...cloudNodeForm, autoFailover: e.target.checked })}
                          className="w-4 h-4 rounded text-cyan-400 focus:ring-cyan-400 border-cyan-500/40 bg-[#061520]"
                        />
                        <span className="font-bold text-slate-200">
                          Enable automatic real-time mirroring & quota failover for this cloud node
                        </span>
                      </label>
                    </div>

                    <div className="pt-3 border-t border-cyan-500/20 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAddCloudModal(false)}
                        className="px-4 py-2 rounded-xl border border-cyan-500/25 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 font-bold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black shadow-md flex items-center gap-1.5 cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        <span>{editingCloudNodeId ? 'Save Cloud Changes' : 'Add Cloud to Pool'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Trash policy callout */}
            <div className="mt-4 p-3 bg-cyan-500/10 border border-cyan-400/30 rounded-xl flex items-center justify-between text-xs text-cyan-100">
              <div className="flex items-center space-x-2">
                <Trash2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <span>
                  <strong>Universal Trash System Enabled:</strong> Every deleted bill, item, party, expense, collection, or deposit across all pages is safely archived in Trash before cloud sync.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('trash')}
                className="px-2.5 py-1 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-lg text-[11px] font-black whitespace-nowrap ml-3 cursor-pointer"
              >
                Open Trash Bin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BANK & ACCOUNT DIRECTORY */}
      {activeTab === 'banks_accounts' && isSuperAdmin && (
        <div className="p-0">
          <BankAndAccountDirectory
            bankList={effectiveBankList}
            onAddBank={handleAddBank}
            onDeleteBank={handleDeleteBank}
            onEditBank={handleEditBank}
            onResetBanks={handleResetBanks}
            accountList={effectiveAccountList}
            onAddAccount={handleAddAccount}
            onDeleteAccount={handleDeleteAccount}
            onEditAccount={handleEditAccount}
            onResetAccounts={handleResetAccounts}
            isModal={false}
          />
        </div>
      )}

      {/* TAB: EMAIL & SMTP CONFIGURATION */}
      {activeTab === 'email_smtp' && (
        <div className="p-6 max-w-4xl space-y-6">
          <div className="cyber-glass-subcard border border-cyan-500/25 rounded-2xl p-6 space-y-5 text-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/20 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-emerald-500/20 border border-emerald-400/30 rounded-xl text-emerald-300">
                  <Mail className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-white">Email &amp; SMTP Dispatch Settings</h2>
                  <p className="text-xs text-slate-300">
                    Configure Google SMTP sender credentials for automated direct delivery of Bank Deposit Slips &amp; Invoices
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center space-x-1.5 border ${
                  smtpConfig.pass
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/35'
                    : 'bg-amber-500/20 text-amber-300 border-amber-400/35'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${smtpConfig.pass ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  <span>{smtpConfig.pass ? 'SMTP Ready' : 'Password Needed'}</span>
                </span>
              </div>
            </div>

            {/* Google App Password Guide Card */}
            <div className="bg-cyan-500/10 border border-cyan-400/30 rounded-xl p-4 space-y-2 text-xs text-cyan-100">
              <div className="flex items-center space-x-2 font-bold text-cyan-200">
                <Key className="w-4 h-4 text-cyan-400" />
                <span>How Google SMTP Delivery Works:</span>
              </div>
              <p className="leading-relaxed text-slate-200">
                Gmail accounts with 2-Step Verification require a dedicated <strong>16-character Google App Password</strong> (e.g. <code>abcd efgh ijkl mnop</code>) rather than your personal password.
              </p>
              <div className="flex items-center space-x-2 pt-1">
                <a
                  href="https://myaccount.google.com/apppasswords"
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-lg font-black inline-flex items-center space-x-1 transition-colors"
                >
                  <span>Generate Google App Password</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <span className="text-[11px] text-slate-300">Takes only 10 seconds in Google Account security settings</span>
              </div>
            </div>

            {/* Input Form Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-cyan-200 mb-1">
                  Sender Gmail Address (From):
                </label>
                <input
                  type="email"
                  value={smtpConfig.user}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, user: e.target.value, from: `Madhupur Sales Center <${e.target.value}>` })}
                  placeholder="madhupursc2026@gmail.com"
                  className="w-full p-2.5 border border-cyan-500/30 rounded-xl text-xs font-mono bg-[#061520] text-white placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-cyan-200 mb-1 flex items-center justify-between">
                  <span>Google App Password (16 chars):</span>
                  <span className="text-[10px] text-slate-400 font-normal">Stored safely in browser</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={smtpConfig.pass}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, pass: e.target.value })}
                    placeholder="abcd efgh ijkl mnop"
                    className="w-full p-2.5 pr-9 border border-cyan-500/30 rounded-xl text-xs font-mono bg-[#061520] text-white placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-3 text-slate-400 hover:text-cyan-300 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-cyan-200 mb-1">
                  SMTP Host:
                </label>
                <input
                  type="text"
                  value={smtpConfig.host}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, host: e.target.value })}
                  placeholder="smtp.gmail.com"
                  className="w-full p-2.5 border border-cyan-500/30 rounded-xl text-xs font-mono bg-[#061520] text-white placeholder:text-slate-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-cyan-200 mb-1">
                    Port:
                  </label>
                  <input
                    type="text"
                    value={smtpConfig.port}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, port: e.target.value })}
                    placeholder="465"
                    className="w-full p-2.5 border border-cyan-500/30 rounded-xl text-xs font-mono bg-[#061520] text-white placeholder:text-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-cyan-200 mb-1">
                    SSL / TLS:
                  </label>
                  <select
                    value={smtpConfig.secure ? 'true' : 'false'}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, secure: e.target.value === 'true' })}
                    className="w-full p-2.5 border border-cyan-500/30 rounded-xl text-xs bg-[#061520] text-white font-bold"
                  >
                    <option value="true">SSL (Port 465)</option>
                    <option value="false">TLS / STARTTLS (Port 587)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Diagnostic Test Result */}
            {smtpTestResult && (
              <div className={`p-3.5 rounded-xl text-xs flex items-start space-x-3 border ${
                smtpTestResult.ok
                  ? 'bg-emerald-500/15 text-emerald-100 border-emerald-400/40'
                  : 'bg-rose-500/15 text-rose-100 border-rose-400/40'
              }`}>
                {smtpTestResult.ok ? (
                  <Check className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <strong className="block font-bold text-sm">{smtpTestResult.message}</strong>
                  {smtpTestResult.advice && (
                    <p className="text-slate-200 mt-1 leading-relaxed">{smtpTestResult.advice}</p>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-cyan-500/20">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isTestingSmtp}
                  onClick={handleTestSmtp}
                  className="px-4 py-2.5 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/30 rounded-xl text-xs font-bold flex items-center space-x-2 transition-colors cursor-pointer"
                >
                  {isTestingSmtp ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                      <span>Verifying SMTP Connection...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>Test SMTP Connection</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleResetToDefaultSmtp}
                  className="px-3.5 py-2.5 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors cursor-pointer border border-cyan-500/25"
                  title="Reset to verified official Poly Cables sender (madhupursc2026@gmail.com)"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Reset to Official Poly Cables Sender</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleSaveSmtp}
                className="px-6 py-2.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-xl text-xs font-black flex items-center space-x-2 transition-all cursor-pointer shadow-md active:scale-95"
              >
                <Check className="w-4 h-4" />
                <span>Save Email Settings</span>
              </button>
            </div>
          </div>

          {/* Fixed Phone & WhatsApp Configuration Card */}
          <div className="cyber-glass-subcard border border-cyan-500/25 rounded-2xl p-6 space-y-4 text-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/20 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-emerald-500/20 border border-emerald-400/30 rounded-xl text-emerald-300">
                  <Phone className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-white">Fixed Phone &amp; WhatsApp Number</h2>
                  <p className="text-xs text-slate-300">
                    Configure your primary fixed phone number for direct WhatsApp dispatches and communications
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div>
                <label className="block text-xs font-bold text-cyan-200 mb-1">
                  My Fixed Phone / WhatsApp Number:
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-emerald-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={fixedPhone}
                    onChange={(e) => setFixedPhone(e.target.value)}
                    placeholder="+8801713434290 or 01713-434290"
                    className="w-full pl-9 pr-3 py-2.5 border border-cyan-500/30 rounded-xl text-xs font-bold font-mono bg-[#061520] text-white placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  />
                </div>
                <p className="text-[11px] text-slate-300 mt-1">
                  This number is used as the default receiver when sending WhatsApp messages and requisition files.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleSaveFixedPhone}
                  className="px-5 py-2.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-xl text-xs font-black flex items-center space-x-2 transition-all cursor-pointer shadow-md active:scale-95"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Fixed Phone</span>
                </button>
              </div>
            </div>
          </div>

          {/* Default Head Office Routing Info */}
          <div className="cyber-glass-subcard border border-cyan-500/25 rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-black uppercase text-cyan-200 tracking-wider">Default Destination Inboxes</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-[#061520] p-3 rounded-xl border border-cyan-500/25">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Primary Head Office (To):</span>
                <span className="font-mono font-bold text-white">pcildomestic@gmail.com</span>
              </div>
              <div className="bg-[#061520] p-3 rounded-xl border border-cyan-500/25">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Supervisor / CC Email:</span>
                <span className="font-mono font-bold text-white">290suvro.pcil@gmail.com</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TRASH */}
      {activeTab === 'trash' && (
        <div className="p-0">
          <Trash
            items={items}
            setItems={setItems}
            parties={parties}
            setParties={setParties}
            collections={collections}
            setCollections={setCollections}
          />
        </div>
      )}

      {/* TAB 3: SYSTEM SUMMARY */}
      {activeTab === 'system' && (
        <div className="p-5 space-y-4">
          <h3 className="text-xs font-extrabold text-cyan-200 uppercase tracking-wider">
            Current Database Record Metrics
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="cyber-glass-subcard p-4 rounded-xl border border-cyan-500/25">
              <div className="flex items-center space-x-2 text-cyan-200/80 text-xs font-bold mb-1">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>Stored Bills</span>
              </div>
              <div className="text-2xl font-black text-white font-mono">{storedBills.length}</div>
            </div>

            <div className="cyber-glass-subcard p-4 rounded-xl border border-cyan-500/25">
              <div className="flex items-center space-x-2 text-cyan-200/80 text-xs font-bold mb-1">
                <Database className="w-4 h-4 text-cyan-400" />
                <span>Master Items</span>
              </div>
              <div className="text-2xl font-black text-white font-mono">{items.length}</div>
            </div>

            <div className="cyber-glass-subcard p-4 rounded-xl border border-cyan-500/25">
              <div className="flex items-center space-x-2 text-cyan-200/80 text-xs font-bold mb-1">
                <Building2 className="w-4 h-4 text-purple-400" />
                <span>Customers</span>
              </div>
              <div className="text-2xl font-black text-white font-mono">{parties.length}</div>
            </div>

            <div className="cyber-glass-subcard p-4 rounded-xl border border-cyan-500/25">
              <div className="flex items-center space-x-2 text-cyan-200/80 text-xs font-bold mb-1">
                <Users className="w-4 h-4 text-amber-400" />
                <span>Sales Reps</span>
              </div>
              <div className="text-2xl font-black text-white font-mono">{salespersons.length}</div>
            </div>

            <div className="cyber-glass-subcard p-4 rounded-xl border border-cyan-500/25">
              <div className="flex items-center space-x-2 text-cyan-200/80 text-xs font-bold mb-1">
                <Wallet className="w-4 h-4 text-rose-400" />
                <span>Expense Entries</span>
              </div>
              <div className="text-2xl font-black text-white font-mono">{expenses.length}</div>
            </div>

            <div className="cyber-glass-subcard p-4 rounded-xl border border-cyan-500/25">
              <div className="flex items-center space-x-2 text-cyan-200/80 text-xs font-bold mb-1">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span>Money Collections</span>
              </div>
              <div className="text-2xl font-black text-white font-mono">{collections.length}</div>
            </div>

            <div className="cyber-glass-subcard p-4 rounded-xl border border-cyan-500/25">
              <div className="flex items-center space-x-2 text-cyan-200/80 text-xs font-bold mb-1">
                <HardDrive className="w-4 h-4 text-indigo-400" />
                <span>Bank Deposits</span>
              </div>
              <div className="text-2xl font-black text-white font-mono">{bankDeposits.length}</div>
            </div>

            <div className="cyber-glass-subcard p-4 rounded-xl border border-cyan-500/25">
              <div className="flex items-center space-x-2 text-cyan-200/80 text-xs font-bold mb-1">
                <RefreshCw className="w-4 h-4 text-amber-400" />
                <span>Factory Imports</span>
              </div>
              <div className="text-2xl font-black text-white font-mono">{factoryImports.length}</div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: LUNCH & HOTEL BILL ALLOWANCE SETTINGS */}
      {activeTab === 'allowance_settings' && (
        <div className="p-5 space-y-5 animate-in fade-in duration-200">
          {/* Header Card */}
          <div className="cyber-glass-header p-5 rounded-2xl border border-cyan-500/25 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center space-x-3.5">
              <div className="p-3 bg-cyan-500/15 text-cyan-300 rounded-xl border border-cyan-400/30 shadow-inner">
                <Coffee className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-black text-white tracking-wide flex items-center space-x-2">
                  <span>Lunch &amp; Hotel Bill Allowance Settings</span>
                  <span className="text-[10px] bg-cyan-400 text-slate-950 font-black px-2 py-0.5 rounded-full uppercase">
                    Official Rates
                  </span>
                </h2>
                <p className="text-xs text-cyan-100/80 mt-0.5">
                  Configure designation-wise official daily allowances (Breakfast, Lunch, Dinner, 1-Day Full Meal, Hotel Lodging) across showrooms and field marketing.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setIsAddingAllowance(!isAddingAllowance)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black rounded-lg text-xs shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Designation</span>
              </button>
              <button
                type="button"
                onClick={handleResetAllowanceDefaults}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 hover:text-white font-bold rounded-lg text-xs border border-cyan-500/25 transition-all cursor-pointer"
                title="Reset all allowances to Poly Cables official standards"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Standards</span>
              </button>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="cyber-glass-subcard border border-cyan-500/25 p-3.5 rounded-xl">
              <div className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider">User List Designations</div>
              <div className="text-xl font-black text-white font-mono mt-0.5">{salesListDesignations.length}</div>
              <div className="text-[10px] text-slate-400 truncate mt-0.5" title={salesListDesignations.join(', ')}>
                From Sales Center &amp; User List ({salespersons.length} users)
              </div>
            </div>
            <div className="cyber-glass-subcard border border-cyan-500/25 p-3.5 rounded-xl">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Configured Roles</div>
              <div className="text-xl font-black text-white font-mono mt-0.5">{allowanceList.length}</div>
            </div>
            <div className="cyber-glass-subcard border border-cyan-500/25 p-3.5 rounded-xl">
              <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">In-Charge 1-Day Meal</div>
              <div className="text-xl font-black text-amber-300 font-mono mt-0.5">
                ৳{allowanceList.find(a => a.id === 'desig-incharge')?.meal1Day || 360}
              </div>
            </div>
            <div className="cyber-glass-subcard border border-cyan-500/25 p-3.5 rounded-xl">
              <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Marketing 1-Day Meal</div>
              <div className="text-xl font-black text-emerald-300 font-mono mt-0.5">
                ৳{allowanceList.find(a => a.id === 'desig-marketing')?.meal1Day || 310}
              </div>
            </div>
            <div className="cyber-glass-subcard border border-cyan-500/25 p-3.5 rounded-xl">
              <div className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">In-Charge Hotel/Night</div>
              <div className="text-xl font-black text-cyan-300 font-mono mt-0.5">
                ৳{allowanceList.find(a => a.id === 'desig-incharge')?.hotelBill || 800}
              </div>
            </div>
          </div>

          {/* Add New Designation Form Drawer */}
          {isAddingAllowance && (
            <form onSubmit={handleAddNewAllowance} className="cyber-glass-card border border-cyan-400/35 rounded-xl p-4 space-y-3 shadow-lg">
              <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
                <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center space-x-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add New Designation Allowance</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAddingAllowance(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Designation Title *</label>
                  <input
                    type="text"
                    value={newAllowanceForm.designation}
                    onChange={(e) => setNewAllowanceForm({ ...newAllowanceForm, designation: e.target.value })}
                    placeholder="e.g. Sales Executive"
                    className="w-full bg-[#061520] border border-cyan-500/30 rounded-lg p-2 text-white font-bold focus:border-cyan-400 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Breakfast (৳)</label>
                  <input
                    type="number"
                    min="0"
                    value={newAllowanceForm.breakfast}
                    onChange={(e) => {
                      const bf = Number(e.target.value) || 0;
                      const lc = Number(newAllowanceForm.lunch) || 0;
                      const dn = Number(newAllowanceForm.dinner) || 0;
                      setNewAllowanceForm({
                        ...newAllowanceForm,
                        breakfast: bf,
                        meal1Day: bf + lc + dn
                      });
                    }}
                    className="w-full bg-[#061520] border border-cyan-500/30 rounded-lg p-2 text-white font-bold font-mono focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Lunch (৳)</label>
                  <input
                    type="number"
                    min="0"
                    value={newAllowanceForm.lunch}
                    onChange={(e) => {
                      const lc = Number(e.target.value) || 0;
                      const bf = Number(newAllowanceForm.breakfast) || 0;
                      const dn = Number(newAllowanceForm.dinner) || 0;
                      setNewAllowanceForm({
                        ...newAllowanceForm,
                        lunch: lc,
                        meal1Day: bf + lc + dn
                      });
                    }}
                    className="w-full bg-[#061520] border border-cyan-500/30 rounded-lg p-2 text-white font-bold font-mono focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Dinner (৳)</label>
                  <input
                    type="number"
                    min="0"
                    value={newAllowanceForm.dinner}
                    onChange={(e) => {
                      const dn = Number(e.target.value) || 0;
                      const bf = Number(newAllowanceForm.breakfast) || 0;
                      const lc = Number(newAllowanceForm.lunch) || 0;
                      setNewAllowanceForm({
                        ...newAllowanceForm,
                        dinner: dn,
                        meal1Day: bf + lc + dn
                      });
                    }}
                    className="w-full bg-[#061520] border border-cyan-500/30 rounded-lg p-2 text-white font-bold font-mono focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">1 Day Full Meal (৳)</label>
                  <input
                    type="number"
                    min="0"
                    value={newAllowanceForm.meal1Day}
                    onChange={(e) => setNewAllowanceForm({ ...newAllowanceForm, meal1Day: Number(e.target.value) || 0 })}
                    className="w-full bg-[#061520] border border-cyan-500/30 rounded-lg p-2 text-white font-bold font-mono focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Hotel Lodging Bill (৳)</label>
                  <input
                    type="number"
                    min="0"
                    value={newAllowanceForm.hotelBill}
                    onChange={(e) => setNewAllowanceForm({ ...newAllowanceForm, hotelBill: Number(e.target.value) || 0 })}
                    className="w-full bg-[#061520] border border-cyan-500/30 rounded-lg p-2 text-white font-bold font-mono focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-slate-400 font-bold mb-1">Description / Staff Scope</label>
                  <input
                    type="text"
                    value={newAllowanceForm.description}
                    onChange={(e) => setNewAllowanceForm({ ...newAllowanceForm, description: e.target.value })}
                    placeholder="e.g. Applicable for field representatives..."
                    className="w-full bg-[#061520] border border-cyan-500/30 rounded-lg p-2 text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-cyan-500/20">
                <button
                  type="button"
                  onClick={() => setIsAddingAllowance(false)}
                  className="px-3 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/25 text-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-lg text-xs font-black cursor-pointer shadow-xs"
                >
                  Save Allowance
                </button>
              </div>
            </form>
          )}

          {/* Designations Allowance Table */}
          <div className="cyber-glass-card border border-cyan-500/25 rounded-xl overflow-hidden shadow-lg">
            <div className="p-3.5 cyber-glass-header border-b border-cyan-500/25 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Utensils className="w-4 h-4 text-cyan-300" />
                <span className="text-xs font-extrabold text-white tracking-wide uppercase">
                  Designation-Wise Meal &amp; Lodging Allowance Schedule
                </span>
              </div>
              <span className="text-[11px] text-cyan-200/70">
                Auto-applies to Daily Conveyance &amp; Expense Logs
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#0c2638] text-cyan-200 font-bold uppercase text-[10px] border-b border-cyan-500/30 select-none">
                    <th className="py-2.5 px-3 min-w-[160px]">Designation</th>
                    <th className="py-2.5 px-2 text-center w-24">Breakfast (৳)</th>
                    <th className="py-2.5 px-2 text-center w-24">Lunch (৳)</th>
                    <th className="py-2.5 px-2 text-center w-24">Dinner (৳)</th>
                    <th className="py-2.5 px-2 text-center w-28 bg-amber-950/30 text-amber-300">1 Day Meal (৳)</th>
                    <th className="py-2.5 px-2 text-center w-28 bg-cyan-950/30 text-cyan-300">Hotel Bill (৳)</th>
                    <th className="py-2.5 px-3 min-w-[200px]">Description</th>
                    <th className="py-2.5 px-3 text-center w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                  {allowanceList.map((item) => {
                    const isEditing = editingAllowanceId === item.id;

                    if (isEditing) {
                      return (
                        <tr key={item.id} className="bg-amber-950/20">
                          <td className="py-2 px-3 font-bold text-white">
                            <input
                              type="text"
                              value={editingAllowanceForm.designation ?? item.designation}
                              onChange={(e) => setEditingAllowanceForm({ ...editingAllowanceForm, designation: e.target.value })}
                              className="w-full bg-[#061520] border border-cyan-400 rounded px-2 py-1 text-xs text-white font-bold"
                            />
                          </td>
                          <td className="py-2 px-2 text-center">
                            <input
                              type="number"
                              min="0"
                              value={editingAllowanceForm.breakfast ?? item.breakfast}
                              onChange={(e) => {
                                const bf = Number(e.target.value) || 0;
                                const lc = Number(editingAllowanceForm.lunch ?? item.lunch) || 0;
                                const dn = Number(editingAllowanceForm.dinner ?? item.dinner) || 0;
                                setEditingAllowanceForm({
                                  ...editingAllowanceForm,
                                  breakfast: bf,
                                  meal1Day: bf + lc + dn
                                });
                              }}
                              className="w-20 bg-[#061520] border border-cyan-400 rounded px-1.5 py-1 text-xs text-center font-mono text-white"
                            />
                          </td>
                          <td className="py-2 px-2 text-center">
                            <input
                              type="number"
                              min="0"
                              value={editingAllowanceForm.lunch ?? item.lunch}
                              onChange={(e) => {
                                const lc = Number(e.target.value) || 0;
                                const bf = Number(editingAllowanceForm.breakfast ?? item.breakfast) || 0;
                                const dn = Number(editingAllowanceForm.dinner ?? item.dinner) || 0;
                                setEditingAllowanceForm({
                                  ...editingAllowanceForm,
                                  lunch: lc,
                                  meal1Day: bf + lc + dn
                                });
                              }}
                              className="w-20 bg-[#061520] border border-cyan-400 rounded px-1.5 py-1 text-xs text-center font-mono text-white"
                            />
                          </td>
                          <td className="py-2 px-2 text-center">
                            <input
                              type="number"
                              min="0"
                              value={editingAllowanceForm.dinner ?? item.dinner}
                              onChange={(e) => {
                                const dn = Number(e.target.value) || 0;
                                const bf = Number(editingAllowanceForm.breakfast ?? item.breakfast) || 0;
                                const lc = Number(editingAllowanceForm.lunch ?? item.lunch) || 0;
                                setEditingAllowanceForm({
                                  ...editingAllowanceForm,
                                  dinner: dn,
                                  meal1Day: bf + lc + dn
                                });
                              }}
                              className="w-20 bg-[#061520] border border-cyan-400 rounded px-1.5 py-1 text-xs text-center font-mono text-white"
                            />
                          </td>
                          <td className="py-2 px-2 text-center bg-amber-950/40">
                            <input
                              type="number"
                              min="0"
                              value={editingAllowanceForm.meal1Day ?? item.meal1Day}
                              onChange={(e) => setEditingAllowanceForm({ ...editingAllowanceForm, meal1Day: Number(e.target.value) || 0 })}
                              className="w-24 bg-[#061520] border border-amber-500 rounded px-1.5 py-1 text-xs text-center font-mono text-amber-300 font-bold"
                            />
                          </td>
                          <td className="py-2 px-2 text-center bg-cyan-950/40">
                            <input
                              type="number"
                              min="0"
                              value={editingAllowanceForm.hotelBill ?? item.hotelBill}
                              onChange={(e) => setEditingAllowanceForm({ ...editingAllowanceForm, hotelBill: Number(e.target.value) || 0 })}
                              className="w-24 bg-[#061520] border border-cyan-400 rounded px-1.5 py-1 text-xs text-center font-mono text-cyan-300 font-bold"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={editingAllowanceForm.description ?? (item.description || '')}
                              onChange={(e) => setEditingAllowanceForm({ ...editingAllowanceForm, description: e.target.value })}
                              className="w-full bg-[#061520] border border-cyan-500/30 rounded px-2 py-1 text-xs text-slate-200"
                            />
                          </td>
                          <td className="py-2 px-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center space-x-1.5">
                              <button
                                type="button"
                                onClick={() => handleSaveAllowanceRow(item.id)}
                                className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer"
                                title="Save changes"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingAllowanceId(null);
                                  setEditingAllowanceForm({});
                                }}
                                className="p-1 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-300 hover:text-white rounded border border-cyan-500/25 cursor-pointer"
                                title="Cancel editing"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={item.id} className="hover:bg-cyan-500/[0.06] transition-colors">
                        <td className="py-2.5 px-3 font-bold text-white">
                          <span className="inline-flex items-center space-x-1.5">
                            <span className="w-2 h-2 rounded-full bg-cyan-400" />
                            <span>{item.designation}</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono text-slate-300">৳{item.breakfast}</td>
                        <td className="py-2.5 px-2 text-center font-mono text-slate-300">৳{item.lunch}</td>
                        <td className="py-2.5 px-2 text-center font-mono text-slate-300">৳{item.dinner}</td>
                        <td className="py-2.5 px-2 text-center font-mono font-bold text-amber-300 bg-amber-950/20">
                          ৳{item.meal1Day}
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono font-bold text-cyan-300 bg-cyan-950/20">
                          ৳{item.hotelBill}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-[11px] truncate max-w-xs" title={item.description}>
                          {item.description || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingAllowanceId(item.id);
                                setEditingAllowanceForm({
                                  designation: item.designation,
                                  breakfast: item.breakfast,
                                  lunch: item.lunch,
                                  dinner: item.dinner,
                                  meal1Day: item.meal1Day,
                                  hotelBill: item.hotelBill,
                                  description: item.description
                                });
                              }}
                              className="p-1 text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/15 rounded transition-colors cursor-pointer"
                              title="Edit designation allowance"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            {item.id.startsWith('desig-') && !DEFAULT_DESIGNATION_ALLOWANCES.some(d => d.id === item.id) && (
                              <button
                                type="button"
                                onClick={() => handleDeleteAllowance(item.id, item.designation)}
                                className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors cursor-pointer"
                                title="Delete designation"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* User Designation-Wise Lunch & All Bills Directory */}
          <div className="cyber-glass-card border border-cyan-500/25 rounded-xl overflow-hidden shadow-lg">
            <div className="p-3.5 cyber-glass-header border-b border-cyan-500/25 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-emerald-300" />
                <span className="text-xs font-extrabold text-white tracking-wide uppercase">
                  User Designation-Wise Lunch &amp; All Bills ({salespersons.length} Users • {salesListDesignations.length} Designations)
                </span>
              </div>
              <span className="text-[11px] text-cyan-200/80">
                Linked to Sales Center &amp; User List Designations
              </span>
            </div>

            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#0c2638] text-cyan-200 font-bold uppercase text-[10px] border-b border-cyan-500/30 select-none">
                    <th className="py-2.5 px-3 min-w-[170px]">User / Staff</th>
                    <th className="py-2.5 px-3 min-w-[140px]">Sales Center</th>
                    <th className="py-2.5 px-3 min-w-[140px]">Designation / Role</th>
                    <th className="py-2.5 px-2 text-center w-24">Breakfast (৳)</th>
                    <th className="py-2.5 px-2 text-center w-24 bg-emerald-950/35 text-emerald-300">Lunch Bill (৳)</th>
                    <th className="py-2.5 px-2 text-center w-24">Dinner (৳)</th>
                    <th className="py-2.5 px-2 text-center w-28 bg-amber-950/30 text-amber-300">1 Day Meal (৳)</th>
                    <th className="py-2.5 px-2 text-center w-28 bg-cyan-950/30 text-cyan-300">Hotel Bill (৳)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                  {salespersons.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-slate-400">
                        No users found in Sales Center &amp; User List.
                      </td>
                    </tr>
                  ) : (
                    [...salespersons]
                      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                      .map((sp) => {
                        const rate = resolveAllowanceForUser(sp);
                        const desigLabel = (sp.designation || sp.role || 'Staff').trim();
                        return (
                          <tr key={sp.id} className="hover:bg-cyan-500/[0.06] transition-colors">
                            <td className="py-2 px-3 font-bold text-white">
                              <div>{sp.name}</div>
                              <div className="text-[10px] font-mono text-cyan-300/80">Code: {sp.code}</div>
                            </td>
                            <td className="py-2 px-3 text-slate-300 text-[11px]">
                              {sp.branchName || sp.areaGroup || 'Head Office / All'}
                            </td>
                            <td className="py-2 px-3">
                              <span className="inline-flex items-center px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-400/30 text-cyan-200 font-bold text-[11px]">
                                {desigLabel}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-center font-mono text-slate-300">৳{rate.breakfast}</td>
                            <td className="py-2 px-2 text-center font-mono font-black text-emerald-300 bg-emerald-950/20">৳{rate.lunch}</td>
                            <td className="py-2 px-2 text-center font-mono text-slate-300">৳{rate.dinner}</td>
                            <td className="py-2 px-2 text-center font-mono font-bold text-amber-300 bg-amber-950/20">৳{rate.meal1Day}</td>
                            <td className="py-2 px-2 text-center font-mono font-bold text-cyan-300 bg-cyan-950/20">৳{rate.hotelBill}</td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: KEYBOARD SHORTCUTS */}
      {activeTab === 'shortcuts' && (
        <div className="p-5">
          <KeyboardShortcutsTable embedded />
        </div>
      )}

      {/* TAB: THEME & APPEARANCE */}
      {activeTab === 'theme_appearance' && (
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-500/20 pb-3">
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Palette className="w-4 h-4 text-cyan-400" />
                <span>Theme & Visual Appearance</span>
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Select your preferred visual palette across navigation menus, cards, and workspaces.
              </p>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-cyan-500/15 text-cyan-200 border border-cyan-400/30">
              Active: {THEME_OPTIONS.find((t) => t.id === selectedThemeId)?.name || 'Cyber Teal'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {THEME_OPTIONS.map((opt) => {
              const isSelected = selectedThemeId === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setSelectedThemeId(opt.id);
                    applyTheme(opt.id);
                    onThemeChange?.(opt.id);
                    setCurrentTheme?.(opt.id);
                    showToast(`✓ Theme applied: ${opt.name}`, 'success');
                  }}
                  className={`text-left p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                    isSelected
                      ? 'bg-cyan-500/15 border-cyan-400 ring-1 ring-cyan-400/50 shadow-lg'
                      : 'bg-[#071824]/80 border-cyan-500/20 hover:border-cyan-400/50 hover:bg-[#0b2334]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-black text-white">{opt.name}</div>
                      <p className="text-[11px] text-slate-300 mt-1">{opt.description}</p>
                    </div>
                    {isSelected && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-400 text-slate-950 shrink-0">
                        <Check className="w-3 h-3" /> Active
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <span className={`w-6 h-6 rounded-lg border ${opt.previewBorder} ${opt.previewBg} flex items-center justify-center text-[10px] font-black ${opt.previewText}`}>
                      Aa
                    </span>
                    <span className="text-[10px] font-mono text-cyan-300">
                      {opt.badge}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB: USER ROLES & MENUS (SUPER ADMIN ONLY) */}
      {activeTab === 'user_roles_menus' && isSuperAdmin && (
        <UserRoleMenuPermissionsSetting
          salespersons={salespersons}
          setSalespersons={setSalespersons}
          onUpdateSalesperson={onUpdateSalesperson}
        />
      )}

      {/* CONFIRMATION RESTORE MODAL WITH CONFLICT NOTIFICATION */}
      {showConfirmRestoreModal && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl text-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 max-w-lg w-full p-6 space-y-4 my-8">
            <div className="flex items-center space-x-3 text-amber-300">
              <div className="p-3 bg-amber-500/20 border border-amber-400/30 rounded-full">
                <AlertTriangle className="w-6 h-6 text-amber-300" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">Restore System Data</h3>
                <p className="text-xs text-slate-300">File: <span className="font-mono font-bold text-cyan-300">{uploadedFileName}</span></p>
              </div>
            </div>
            {/* Mode selection: Full restore vs Single Module restore */}
            <div className="flex items-center p-1 bg-[#061520] border border-cyan-500/25 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setRestoreModalMode('full')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  restoreModalMode === 'full' ? 'bg-cyan-400 text-slate-950 font-black shadow-xs' : 'text-slate-300 hover:text-white'
                }`}
              >
                Restore All in at a Time (Entire Backup)
              </button>
              <button
                type="button"
                onClick={() => setRestoreModalMode('single')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  restoreModalMode === 'single' ? 'bg-emerald-500 text-slate-950 font-black shadow-xs' : 'text-slate-300 hover:text-white'
                }`}
              >
                Restore Single Module / Entity
              </button>
            </div>

            {restoreModalMode === 'single' ? (
              <div className="space-y-3">
                <div className="cyber-glass-subcard border border-emerald-400/35 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between border-b pb-1.5 border-cyan-500/20">
                    <span className="font-extrabold text-white text-xs flex items-center space-x-1.5">
                      <Package className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Single Module Restore (Not Items Name Wise)</span>
                    </span>
                    <span className="text-[10px] text-emerald-200 bg-emerald-500/20 border border-emerald-400/30 font-bold px-2 py-0.5 rounded-full">
                      One-Click Restore
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Click any module below to restore only that dataset from this backup into your database:
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => { handleRestoreSingleModule('invoices'); setShowConfirmRestoreModal(false); }}
                      className="p-1.5 bg-[#061520] hover:bg-emerald-500/20 hover:border-emerald-400/50 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-100 text-left cursor-pointer flex items-center justify-between transition-colors shadow-2xs"
                      title="Restore Invoices only"
                    >
                      <span className="truncate">• Invoices ({uploadedStats?.invCount ?? 0})</span>
                      <RefreshCw className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { handleRestoreSingleModule('items'); setShowConfirmRestoreModal(false); }}
                      className="p-1.5 bg-[#061520] hover:bg-emerald-500/20 hover:border-emerald-400/50 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-100 text-left cursor-pointer flex items-center justify-between transition-colors shadow-2xs"
                      title="Restore Items only"
                    >
                      <span className="truncate">• Items ({uploadedStats?.itCount ?? 0})</span>
                      <RefreshCw className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { handleRestoreSingleModule('customers'); setShowConfirmRestoreModal(false); }}
                      className="p-1.5 bg-[#061520] hover:bg-emerald-500/20 hover:border-emerald-400/50 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-100 text-left cursor-pointer flex items-center justify-between transition-colors shadow-2xs"
                      title="Restore Customers only"
                    >
                      <span className="truncate">• Customers ({uploadedStats?.custCount ?? 0})</span>
                      <RefreshCw className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { handleRestoreSingleModule('salespersons'); setShowConfirmRestoreModal(false); }}
                      className="p-1.5 bg-[#061520] hover:bg-emerald-500/20 hover:border-emerald-400/50 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-100 text-left cursor-pointer flex items-center justify-between transition-colors shadow-2xs"
                      title="Restore Sales Reps only"
                    >
                      <span className="truncate">• Sales Reps ({uploadedStats?.spCount ?? 0})</span>
                      <RefreshCw className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { handleRestoreSingleModule('collections'); setShowConfirmRestoreModal(false); }}
                      className="p-1.5 bg-[#061520] hover:bg-emerald-500/20 hover:border-emerald-400/50 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-100 text-left cursor-pointer flex items-center justify-between transition-colors shadow-2xs"
                      title="Restore Collections only"
                    >
                      <span className="truncate">• Collections ({uploadedStats?.colCount ?? 0})</span>
                      <RefreshCw className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { handleRestoreSingleModule('expenses'); setShowConfirmRestoreModal(false); }}
                      className="p-1.5 bg-[#061520] hover:bg-emerald-500/20 hover:border-emerald-400/50 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-100 text-left cursor-pointer flex items-center justify-between transition-colors shadow-2xs"
                      title="Restore Expenses only"
                    >
                      <span className="truncate">• Expenses ({uploadedStats?.expCount ?? 0})</span>
                      <RefreshCw className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { handleRestoreSingleModule('deposits'); setShowConfirmRestoreModal(false); }}
                      className="p-1.5 bg-[#061520] hover:bg-emerald-500/20 hover:border-emerald-400/50 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-100 text-left cursor-pointer flex items-center justify-between transition-colors shadow-2xs"
                      title="Restore Deposits only"
                    >
                      <span className="truncate">• Deposits ({uploadedStats?.depCount ?? 0})</span>
                      <RefreshCw className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { handleRestoreSingleModule('factory_in'); setShowConfirmRestoreModal(false); }}
                      className="p-1.5 bg-[#061520] hover:bg-emerald-500/20 hover:border-emerald-400/50 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-100 text-left cursor-pointer flex items-center justify-between transition-colors shadow-2xs"
                      title="Restore Factory In only"
                    >
                      <span className="truncate">• Factory In ({uploadedStats?.factCount ?? 0})</span>
                      <RefreshCw className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { handleRestoreSingleModule('returns'); setShowConfirmRestoreModal(false); }}
                      className="p-1.5 bg-[#061520] hover:bg-emerald-500/20 hover:border-emerald-400/50 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-100 text-left cursor-pointer flex items-center justify-between transition-colors shadow-2xs"
                      title="Restore Returns only"
                    >
                      <span className="truncate">• Returns ({uploadedStats?.retCount ?? 0})</span>
                      <RefreshCw className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { handleRestoreSingleModule('categories'); setShowConfirmRestoreModal(false); }}
                      className="p-1.5 bg-[#061520] hover:bg-emerald-500/20 hover:border-emerald-400/50 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-100 text-left cursor-pointer flex items-center justify-between transition-colors shadow-2xs"
                      title="Restore Categories only"
                    >
                      <span className="truncate">• Categories ({uploadedStats?.catCount ?? 0})</span>
                      <RefreshCw className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { handleRestoreSingleModule('banks'); setShowConfirmRestoreModal(false); }}
                      className="p-1.5 bg-[#061520] hover:bg-emerald-500/20 hover:border-emerald-400/50 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-100 text-left cursor-pointer flex items-center justify-between transition-colors shadow-2xs"
                      title="Restore Banks only"
                    >
                      <span className="truncate">• Banks ({uploadedStats?.bankCount ?? 0})</span>
                      <RefreshCw className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { handleRestoreSingleModule('trashed'); setShowConfirmRestoreModal(false); }}
                      className="p-1.5 bg-[#061520] hover:bg-emerald-500/20 hover:border-emerald-400/50 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-100 text-left cursor-pointer flex items-center justify-between transition-colors shadow-2xs"
                      title="Restore Trashed only"
                    >
                      <span className="truncate">• Trashed ({uploadedStats?.trCount ?? 0})</span>
                      <RefreshCw className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { handleRestoreSingleModule('users'); setShowConfirmRestoreModal(false); }}
                      className="p-1.5 bg-[#061520] hover:bg-emerald-500/20 hover:border-emerald-400/50 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-100 text-left cursor-pointer flex items-center justify-between transition-colors shadow-2xs"
                      title="Restore Users only"
                    >
                      <span className="truncate">• User ({uploadedStats?.userCount ?? 0})</span>
                      <RefreshCw className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { handleRestoreSingleModule('conveyances'); setShowConfirmRestoreModal(false); }}
                      className="p-1.5 bg-[#061520] hover:bg-emerald-500/20 hover:border-emerald-400/50 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-100 text-left cursor-pointer flex items-center justify-between transition-colors shadow-2xs"
                      title="Restore Conveyances only"
                    >
                      <span className="truncate">• Conveyances ({uploadedStats?.convCount ?? 0})</span>
                      <RefreshCw className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { handleRestoreSingleModule('branches'); setShowConfirmRestoreModal(false); }}
                      className="p-1.5 bg-[#061520] hover:bg-emerald-500/20 hover:border-emerald-400/50 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-100 text-left cursor-pointer flex items-center justify-between transition-colors shadow-2xs"
                      title="Restore Sales Centers only"
                    >
                      <span className="truncate">• Sales Centers ({uploadedStats?.branchCount ?? 0})</span>
                      <RefreshCw className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { handleRestoreSingleModule('requisitions'); setShowConfirmRestoreModal(false); }}
                      className="p-1.5 bg-[#061520] hover:bg-emerald-500/20 hover:border-emerald-400/50 border border-cyan-500/25 rounded-lg text-[11px] font-bold text-slate-100 text-left cursor-pointer flex items-center justify-between transition-colors shadow-2xs"
                      title="Restore Requisitions only"
                    >
                      <span className="truncate">• Requisitions ({uploadedStats?.reqCount ?? 0})</span>
                      <RefreshCw className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { handleRestoreSingleModule('party_statement'); setShowConfirmRestoreModal(false); }}
                      className="p-1.5 bg-amber-500/15 hover:bg-amber-500/25 hover:border-amber-400/50 border border-amber-400/35 rounded-lg text-[11px] font-black text-amber-200 text-left cursor-pointer flex items-center justify-between transition-colors shadow-2xs col-span-2 sm:col-span-2"
                      title="Restore Party & Statement records"
                    >
                      <span className="truncate">• Party & Statement ({uploadedStats?.partyStmtCount ?? 0} Customers)</span>
                      <RefreshCw className="w-3 h-3 text-amber-300 shrink-0 ml-1" />
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Conflict Notification Banner (Full Restore Mode) */}
            {restoreModalMode === 'full' && restoreConflictDiff && restoreConflictDiff.totalConflicts > 0 ? (
              <div className="space-y-3">
                <div className="p-3.5 bg-amber-500/15 rounded-xl border border-amber-400/35 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-amber-200 flex items-center space-x-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-300" />
                      <span>Existing Overlapping Data Detected</span>
                    </span>
                    <span className="text-[10px] font-extrabold bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full">
                      {restoreConflictDiff.totalConflicts} Conflicts Found
                    </span>
                  </div>
                  <p className="text-xs text-amber-100/90 leading-relaxed">
                    This backup contains <strong>{restoreConflictDiff.totalNew} brand new records</strong> and{' '}
                    <strong>{restoreConflictDiff.totalConflicts} records that already exist</strong> in your current database.
                  </p>
                </div>

                {/* Choose Resolution Strategy */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-cyan-200 uppercase tracking-wider block">
                    Choose What To Keep / Overwrite:
                  </label>

                  {/* Strategy 1: Keep Existing & Store New */}
                  <label
                    className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      restoreConflictStrategy === 'keep_existing'
                        ? 'bg-cyan-500/15 border-cyan-400 shadow-xs'
                        : 'bg-[#061520] border-cyan-500/25 hover:bg-[#0c2638]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="restore_strategy"
                      value="keep_existing"
                      checked={restoreConflictStrategy === 'keep_existing'}
                      onChange={() => setRestoreConflictStrategy('keep_existing')}
                      className="mt-0.5 text-cyan-400 focus:ring-cyan-400"
                    />
                    <div className="space-y-0.5">
                      <div className="text-xs font-black text-white flex items-center space-x-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-cyan-300" />
                        <span>Keep Existing Data & Store All New (Safe / Recommended)</span>
                      </div>
                      <p className="text-[11px] text-slate-300">
                        Keeps all your current system records intact without modifying them. Automatically stores all {restoreConflictDiff.totalNew} new items, bills, and customers from the backup.
                      </p>
                    </div>
                  </label>

                  {/* Strategy 2: Overwrite Existing with Backup */}
                  <label
                    className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      restoreConflictStrategy === 'overwrite_existing'
                        ? 'bg-amber-500/15 border-amber-400 shadow-xs'
                        : 'bg-[#061520] border-cyan-500/25 hover:bg-[#0c2638]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="restore_strategy"
                      value="overwrite_existing"
                      checked={restoreConflictStrategy === 'overwrite_existing'}
                      onChange={() => setRestoreConflictStrategy('overwrite_existing')}
                      className="mt-0.5 text-amber-400 focus:ring-amber-400"
                    />
                    <div className="space-y-0.5">
                      <div className="text-xs font-black text-white flex items-center space-x-1.5">
                        <RefreshCw className="w-3.5 h-3.5 text-amber-300" />
                        <span>Overwrite Existing with Backup Version & Store All New</span>
                      </div>
                      <p className="text-[11px] text-slate-300">
                        Updates existing matching records with the backup file data, plus stores all {restoreConflictDiff.totalNew} new records.
                      </p>
                    </div>
                  </label>

                  {/* Strategy 3: Keep Both */}
                  <label
                    className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      restoreConflictStrategy === 'keep_both'
                        ? 'bg-purple-500/15 border-purple-400 shadow-xs'
                        : 'bg-[#061520] border-cyan-500/25 hover:bg-[#0c2638]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="restore_strategy"
                      value="keep_both"
                      checked={restoreConflictStrategy === 'keep_both'}
                      onChange={() => setRestoreConflictStrategy('keep_both')}
                      className="mt-0.5 text-purple-400 focus:ring-purple-400"
                    />
                    <div className="space-y-0.5">
                      <div className="text-xs font-black text-white flex items-center space-x-1.5">
                        <Layers className="w-3.5 h-3.5 text-purple-300" />
                        <span>Store Everything (Keep Both Copies with New IDs)</span>
                      </div>
                      <p className="text-[11px] text-slate-300">
                        Imports duplicate items as separate copies tagged with "(Backup)" so nothing gets replaced or lost.
                      </p>
                    </div>
                  </label>
                </div>

                {/* Expandable Overlapping Records Details */}
                {restoreConflictDiff.conflictDetails.length > 0 && (
                  <div className="border border-cyan-500/25 rounded-xl overflow-hidden text-xs">
                    <button
                      type="button"
                      onClick={() => setShowConflictDetails((prev) => !prev)}
                      className="w-full px-3 py-2 bg-[#0c2638] hover:bg-[#103046] font-bold text-cyan-200 flex items-center justify-between cursor-pointer transition-colors"
                    >
                      <span className="flex items-center space-x-1.5">
                        <ListChecks className="w-3.5 h-3.5 text-cyan-300" />
                        <span>View Overlapping Records ({restoreConflictDiff.conflictDetails.length})</span>
                      </span>
                      {showConflictDetails ? (
                        <ChevronUp className="w-4 h-4 text-cyan-300" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-cyan-300" />
                      )}
                    </button>
                    {showConflictDetails && (
                      <div className="p-2.5 max-h-36 overflow-y-auto space-y-1 bg-[#061520] divide-y divide-cyan-500/15">
                        {restoreConflictDiff.conflictDetails.map((c, i) => (
                          <div key={i} className="pt-1 first:pt-0 text-[11px]">
                            <div className="font-bold text-white flex items-center justify-between">
                              <span>{c.type}: {c.key}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 flex justify-between">
                              <span>{c.currentLabel}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3.5 bg-emerald-500/15 rounded-xl border border-emerald-400/35 space-y-1.5">
                <div className="flex items-center space-x-1.5 text-emerald-200 font-black text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>No Overlapping Conflicts Found!</span>
                </div>
                <p className="text-xs text-emerald-100/85 leading-relaxed">
                  All <strong>{restoreConflictDiff?.totalNew || 'incoming'} records</strong> in this backup file are brand new and will be safely stored in your system without altering your current records.
                </p>
              </div>
            )}

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => {
                  setShowConfirmRestoreModal(false);
                  setUploadedFileContent(null);
                  setRestoreConflictDiff(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-200 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/25 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteRestore}
                className="px-4 py-2 rounded-xl text-xs font-black text-slate-950 bg-cyan-400 hover:bg-cyan-300 shadow-md transition-all cursor-pointer flex items-center space-x-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Confirm & Restore</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* RESTORE SUCCESS MESSAGE MODAL */}
      {restoreSuccessSummary && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl text-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-emerald-400/35 max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center space-x-3.5 text-emerald-300">
              <div className="p-3 bg-emerald-500/20 border border-emerald-400/30 rounded-2xl">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-400/30">
                  Restore Success Notification
                </span>
                <h3 className="text-lg font-black text-white mt-0.5">
                  Data Restored Successfully!
                </h3>
              </div>
            </div>

            <div className="p-4 bg-emerald-500/15 rounded-xl border border-emerald-400/30 space-y-2 text-xs text-slate-200">
              <p className="font-extrabold text-emerald-200">
                All database records, directories, and files have been successfully loaded and synchronized to your system!
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {restoreSuccessSummary.newStoredCount > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-200 border border-emerald-400/40">
                    🟢 {restoreSuccessSummary.newStoredCount} New Records Stored
                  </span>
                )}
                {restoreSuccessSummary.existingResolvedCount > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-cyan-500/20 text-cyan-200 border border-cyan-400/40">
                    🛡️ {restoreSuccessSummary.existingResolvedCount} Overlapping Records Handled
                  </span>
                )}
              </div>
              {restoreSuccessSummary.backupDate && (
                <p className="text-[11px] text-slate-300 font-mono">
                  Backup Timestamp: {new Date(restoreSuccessSummary.backupDate).toLocaleString()}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-2.5 cyber-glass-subcard rounded-xl border border-cyan-500/25">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Items</div>
                <div className="text-base font-black text-white font-mono">{restoreSuccessSummary.itemCount}</div>
              </div>
              <div className="p-2.5 cyber-glass-subcard rounded-xl border border-cyan-500/25">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Parties</div>
                <div className="text-base font-black text-white font-mono">{restoreSuccessSummary.partyCount}</div>
              </div>
              <div className="p-2.5 cyber-glass-subcard rounded-xl border border-cyan-500/25">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Invoices</div>
                <div className="text-base font-black text-white font-mono">{restoreSuccessSummary.billCount}</div>
              </div>
              <div className="p-2.5 cyber-glass-subcard rounded-xl border border-cyan-500/25">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Collections</div>
                <div className="text-base font-black text-white font-mono">{restoreSuccessSummary.collectionCount}</div>
              </div>
              <div className="p-2.5 cyber-glass-subcard rounded-xl border border-cyan-500/25">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Deposits</div>
                <div className="text-base font-black text-white font-mono">{restoreSuccessSummary.depositCount}</div>
              </div>
              <div className="p-2.5 cyber-glass-subcard rounded-xl border border-cyan-500/25">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Expenses</div>
                <div className="text-base font-black text-white font-mono">{restoreSuccessSummary.expenseCount}</div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setRestoreSuccessSummary(null)}
                className="w-full sm:w-auto px-6 py-2.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs rounded-xl shadow-md cursor-pointer transition-colors"
              >
                Done / Continue to System
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
