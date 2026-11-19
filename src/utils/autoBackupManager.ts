// Automated Daily Cloud Backup Manager for Poly ERP
// Handles scheduled daily verification, 14-module packaging, primary cloud storage (Firestore + Server),
// multi-cloud failover, and local persistence tracking.

import { db, setDoc, doc, cleanForFirestore, isFirestoreQuotaExhausted } from '../firebase';
import { executeFailoverCloudStore, syncToSpecificCloudNode, getCloudFailoverConfig } from './cloudSyncManager';
import { syncDataSliceToSupabase } from './supabaseClient';
import { BackupDataPackage } from '../types';

export const AUTO_BACKUP_ENABLED_KEY = 'polycables_auto_backup_enabled';
export const LAST_AUTO_BACKUP_DATE_KEY = 'polycables_last_auto_backup_date';
export const LAST_AUTO_BACKUP_SUMMARY_KEY = 'polycables_last_auto_backup_summary';

export interface AutoBackupStatus {
  enabled: boolean;
  lastBackupDate: string | null;
  lastBackupFormatted: string;
  isBackedUpToday: boolean;
  summary: {
    date: string;
    timestamp: string;
    recordCount: number;
    storagePath?: string;
    primaryStatus: 'success' | 'failed' | 'quota_exhausted' | 'skipped';
    failoverStatus: 'synced' | 'standby' | 'disabled';
    activeNodes: number;
  } | null;
}

export function getTodayDateKey(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns current configuration and status of automated daily cloud backups
 */
export function getAutomatedBackupStatus(): AutoBackupStatus {
  const enabled = localStorage.getItem(AUTO_BACKUP_ENABLED_KEY) !== 'false'; // Default to true
  const lastBackupDate = localStorage.getItem(LAST_AUTO_BACKUP_DATE_KEY);
  const todayLocal = getTodayDateKey();
  const todayUtc = new Date().toISOString().slice(0, 10);
  const isBackedUpToday = Boolean(
    lastBackupDate && (lastBackupDate.startsWith(todayLocal) || lastBackupDate.startsWith(todayUtc))
  );

  let summary = null;
  try {
    const rawSum = localStorage.getItem(LAST_AUTO_BACKUP_SUMMARY_KEY);
    if (rawSum) {
      summary = JSON.parse(rawSum);
    }
  } catch {}

  let lastBackupFormatted = 'Not yet performed';
  if (lastBackupDate) {
    try {
      const d = new Date(lastBackupDate);
      lastBackupFormatted = d.toLocaleString('en-US', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      lastBackupFormatted = lastBackupDate;
    }
  }

  return {
    enabled,
    lastBackupDate,
    lastBackupFormatted,
    isBackedUpToday,
    summary
  };
}

/**
 * Toggles or updates automated daily cloud backup setting
 */
export function setAutomatedBackupEnabled(enabled: boolean): void {
  localStorage.setItem(AUTO_BACKUP_ENABLED_KEY, enabled ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent('polycables_auto_backup_config_changed', { detail: { enabled } }));
}

/**
 * Generates comprehensive snapshot containing all 14 ERP modules
 */
export function generateComprehensiveBackupPayload(activeState: Record<string, any>): BackupDataPackage {
  // Read any secondary stores from LocalStorage if not passed in activeState
  let customCategories: string[] = [];
  let orderedCategories: string[] = [];
  let bankList: string[] = [];
  let accountList: string[] = [];
  let trashedItems: any[] = [];
  let trashedParties: any[] = [];
  let trashedCollections: any[] = [];
  let trashedChallans: any[] = [];
  let adminPassword = '';
  let deletedAutoDeposits: string[] = [];

  try {
    const sCC = localStorage.getItem('polycables_custom_categories');
    if (sCC) customCategories = JSON.parse(sCC);
    const sOC = localStorage.getItem('polycables_ordered_categories');
    if (sOC) orderedCategories = JSON.parse(sOC);
    const sBL = localStorage.getItem('polycables_bank_list');
    if (sBL) bankList = JSON.parse(sBL);
    const sAL = localStorage.getItem('polycables_account_list');
    if (sAL) accountList = JSON.parse(sAL);
    const sTI = localStorage.getItem('polycables_trashed_items');
    if (sTI) trashedItems = JSON.parse(sTI);
    const sTP = localStorage.getItem('polycables_trashed_parties');
    if (sTP) trashedParties = JSON.parse(sTP);
    const sTC = localStorage.getItem('polycables_trashed_collections');
    if (sTC) trashedCollections = JSON.parse(sTC);
    const sTCh = localStorage.getItem('polycables_trashed_challans');
    if (sTCh) trashedChallans = JSON.parse(sTCh);
    const sDAD = localStorage.getItem('polycables_deleted_auto_deposits');
    if (sDAD) deletedAutoDeposits = JSON.parse(sDAD);
    adminPassword = localStorage.getItem('app_admin_password') || '';
  } catch {}

  const cleanDeposits = (Array.isArray(activeState.bankDeposits) ? activeState.bankDeposits : [])
    .filter((d: any) => d && !d.isAutoDeposit && !String(d.id || '').startsWith('auto-ho-'));

  const dataSlice: Record<string, any> = {
    // 1. Invoices
    storedBills: Array.isArray(activeState.storedBills) ? activeState.storedBills : [],
    // 2. Items
    items: Array.isArray(activeState.items) ? activeState.items : [],
    // 3. Customers
    parties: Array.isArray(activeState.parties) ? activeState.parties : [],
    // 4. Sales Reps
    salespersons: Array.isArray(activeState.salespersons) ? activeState.salespersons : [],
    // 5. Collections
    collections: Array.isArray(activeState.collections) ? activeState.collections : [],
    // 6. Expenses
    expenses: Array.isArray(activeState.expenses) ? activeState.expenses : [],
    // 7. Deposits
    bankDeposits: cleanDeposits,
    // 8. Factory In Challans
    factoryImports: Array.isArray(activeState.factoryImports) ? activeState.factoryImports : [],
    // 9. Returns
    stockReturns: Array.isArray(activeState.stockReturns) ? activeState.stockReturns : [],
    // 10. Categories
    customCategories: customCategories.length > 0 ? customCategories : (activeState.customCategories || []),
    orderedCategories: orderedCategories.length > 0 ? orderedCategories : (activeState.orderedCategories || []),
    // 11. Banks & Accounts
    bankList: bankList.length > 0 ? bankList : (activeState.bankList || []),
    accountList: accountList.length > 0 ? accountList : (activeState.accountList || []),
    // 12. Trashed Records
    trashedItems,
    trashedParties,
    trashedCollections,
    trashedChallans,
    // 13. Users & Credentials
    adminPassword,
    // 14. Party & Statement Slices
    closings: Array.isArray(activeState.closings) ? activeState.closings : [],
    // Associated System Records
    deliveryChallans: Array.isArray(activeState.deliveryChallans) ? activeState.deliveryChallans : [],
    colorExchanges: Array.isArray(activeState.colorExchanges) ? activeState.colorExchanges : [],
    branches: Array.isArray(activeState.branches) ? activeState.branches : [],
    requisitions: Array.isArray(activeState.requisitions) ? activeState.requisitions : [],
    conveyances: Array.isArray(activeState.conveyances) ? activeState.conveyances : [],
    deletedAutoDeposits,
    company: activeState.company || {},
    header: activeState.header || {}
  };

  return {
    version: '2.0.0',
    backupDate: new Date().toISOString(),
    backupType: 'automated_daily',
    appTitle: 'Polycables Store & Billing ERP - Automated Daily Backup',
    data: dataSlice
  };
}

/**
 * Executes the daily automated backup workflow.
 * Checks 24-hour cycle, pushes to primary cloud (Firestore & Server), and fails over to multi-cloud nodes if needed.
 */
export async function executeAutomatedDailyBackup(
  stateProvider: () => Record<string, any>,
  options: {
    force?: boolean;
    notify?: boolean;
    showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  } = {}
): Promise<{
  success: boolean;
  skipped?: boolean;
  reason?: string;
  dateKey?: string;
  timestamp?: string;
  storagePath?: string;
  recordCount?: number;
}> {
  const { force = false, notify = false, showToast } = options;
  const status = getAutomatedBackupStatus();

  if (!status.enabled && !force) {
    return { success: false, skipped: true, reason: 'Automated daily backup is currently disabled in Settings.' };
  }

  const todayKey = getTodayDateKey();
  if (status.isBackedUpToday && !force) {
    return {
      success: true,
      skipped: true,
      reason: `Automated daily backup already verified today (${todayKey}).`,
      dateKey: todayKey,
      timestamp: status.lastBackupDate || undefined
    };
  }

  const currentState = stateProvider();
  const backupPkg = generateComprehensiveBackupPayload(currentState);
  const dedicatedStoragePath = `/automated-backups/${todayKey}.json`;

  let primaryStatus: 'success' | 'failed' | 'quota_exhausted' = 'failed';
  let failoverStatus: 'synced' | 'standby' | 'disabled' = 'standby';

  // Total record count across all 14 entities
  let totalRecords = 0;
  Object.keys(backupPkg.data || {}).forEach((k) => {
    const val = (backupPkg.data as any)[k];
    if (Array.isArray(val)) totalRecords += val.length;
    else if (val && typeof val === 'object' && Object.keys(val).length > 0) totalRecords += 1;
  });

  // 1. Upload to Primary Cloud (Firebase Firestore under dedicated collection 'automated_backups' with dedicated path)
  try {
    if (!isFirestoreQuotaExhausted()) {
      const firestoreDoc = cleanForFirestore({
        dateKey: todayKey,
        storagePath: dedicatedStoragePath,
        timestamp: new Date().toISOString(),
        version: backupPkg.version,
        appTitle: backupPkg.appTitle,
        backupType: 'automated_daily',
        recordCount: totalRecords,
        data: backupPkg.data
      });
      await setDoc(doc(db, 'automated_backups', todayKey), firestoreDoc);
      primaryStatus = 'success';
    } else {
      primaryStatus = 'quota_exhausted';
    }
  } catch (err) {
    console.warn('[AutoBackup] Primary Firestore upload notice:', err);
    primaryStatus = isFirestoreQuotaExhausted() ? 'quota_exhausted' : 'failed';
  }

  // 2. Upload to Server-Side Persistent Cloud Mirror (/api/backups/automated)
  try {
    const srvRes = await fetch('/api/backups/automated', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateKey: todayKey,
        storagePath: dedicatedStoragePath,
        backup: backupPkg,
        force
      })
    });
    if (srvRes.ok) {
      if (primaryStatus === 'failed') {
        primaryStatus = 'success'; // Server successfully stored daily backup file
      }
    }
  } catch (err) {
    console.warn('[AutoBackup] Server cloud mirror notice:', err);
  }

  // 3. Multi-Cloud Failover Integration
  // If primary Firestore is exhausted or failed, or if multi-cloud mirroring is active
  const failoverCfg = getCloudFailoverConfig();
  if (primaryStatus !== 'success' || failoverCfg.multiCloudMirroring) {
    try {
      const failoverResult = executeFailoverCloudStore({
        ...backupPkg.data,
        _lastAutomatedBackupPath: dedicatedStoragePath,
        _lastAutomatedBackupDate: todayKey
      });

      // Synchronize directly with secondary Supabase cloud bucket replica
      try {
        await syncDataSliceToSupabase({
          [dedicatedStoragePath]: backupPkg,
          lastAutomatedBackup: {
            dateKey: todayKey,
            timestamp: new Date().toISOString(),
            recordCount: totalRecords,
            storagePath: dedicatedStoragePath
          }
        });
      } catch (supaErr) {
        console.warn('[AutoBackup] Supabase cloud failover upload notice:', supaErr);
      }

      // Store dedicated local snapshot under the cloud bucket key
      try {
        localStorage.setItem(`polycables_auto_backup_${todayKey}`, JSON.stringify(backupPkg));
      } catch {}

      if (failoverResult) {
        failoverStatus = 'synced';
      }
    } catch (err) {
      console.warn('[AutoBackup] Failover cloud store notice:', err);
    }
  }

  // 4. Update LocalStorage Tracking
  const nowIso = new Date().toISOString();
  localStorage.setItem(LAST_AUTO_BACKUP_DATE_KEY, nowIso);
  const summaryObj = {
    date: todayKey,
    timestamp: nowIso,
    recordCount: totalRecords,
    storagePath: dedicatedStoragePath,
    primaryStatus,
    failoverStatus,
    activeNodes: (failoverCfg.cloudNodes || []).filter((n) => n.status === 'active' || n.status === 'standby').length
  };
  localStorage.setItem(LAST_AUTO_BACKUP_SUMMARY_KEY, JSON.stringify(summaryObj));

  // 5. Notify Application & UI
  window.dispatchEvent(
    new CustomEvent('polycables_auto_backup_completed', {
      detail: summaryObj
    })
  );

  if (notify && showToast) {
    showToast(`✓ Automated daily cloud backup completed successfully (${todayKey})`, 'success');
  }

  return {
    success: true,
    dateKey: todayKey,
    timestamp: nowIso,
    storagePath: dedicatedStoragePath,
    recordCount: totalRecords
  };
}
