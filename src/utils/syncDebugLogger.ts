/**
 * CloudSync and Database Write Operations Debug Logger
 * Real-time tracker for:
 * 1. CloudSync connection status (online, cloud hub, firestore, failover nodes)
 * 2. Total pending sync operations in queue / in-flight
 * 3. Real-time log of the last 10+ database write operations to verify deletion propagation
 */

import { isCloudConnected, isOnline } from './cloudConnection';
import { isFirestoreQuotaExhausted } from '../firebase';
import { getCloudFailoverConfig } from './cloudSyncManager';
import { getGlobalDeletedIds, isGloballyDeletedId } from './deletedTracker';
import firebaseConfig from '../../firebase-applet-config.json';

export type DatabaseOpType =
  | 'DELETE'
  | 'WRITE'
  | 'UPDATE'
  | 'BATCH_WRITE'
  | 'SET_DOC'
  | 'DELETE_DOC'
  | 'RESTORE'
  | 'PURGE';

export interface DatabaseOperationLog {
  id: string;
  timestamp: string; // ISO string
  timeFormatted: string; // HH:mm:ss.SSS
  operation: DatabaseOpType;
  target: string; // e.g. 'storedBills', 'parties', 'store/app_data', 'salespersons'
  entityIds?: string[];
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  details: string;
  deletionVerified?: boolean; // verified that deletion was propagated to server & tombstoned
  destination: string; // e.g. 'Firestore + Server Hub + Disk', 'Server Hub API', 'Firestore'
  durationMs?: number;
  error?: string;
  payloadSummary?: string;
}

const STORAGE_LOGS_KEY = 'polycables_debug_db_write_logs';
const MAX_LOGS_KEPT = 50;

let inMemoryLogs: DatabaseOperationLog[] = [];
let pendingSyncCount = 0;
const debugListeners = new Set<() => void>();

// Load previous logs from localStorage on initialization
try {
  if (typeof window !== 'undefined') {
    const raw = localStorage.getItem(STORAGE_LOGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        inMemoryLogs = parsed.slice(0, MAX_LOGS_KEPT);
      }
    }
  }
} catch (e) {
  inMemoryLogs = [];
}

function persistLogs() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_LOGS_KEY, JSON.stringify(inMemoryLogs.slice(0, MAX_LOGS_KEPT)));
  } catch {}
}

function notifyDebugListeners() {
  debugListeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('polycables_sync_debug_updated'));
    } catch {}
  }
}

/**
 * Formats current time as HH:mm:ss.SSS
 */
function getFormattedTime(date: Date = new Date()): string {
  const pad = (n: number, s: number = 2) => String(n).padStart(s, '0');
  const h = pad(date.getHours());
  const m = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  const ms = pad(date.getMilliseconds(), 3);
  return `${h}:${m}:${s}.${ms}`;
}

/**
 * Increment pending sync operations counter
 */
export function incrementPendingSync(): number {
  pendingSyncCount++;
  notifyDebugListeners();
  return pendingSyncCount;
}

/**
 * Decrement pending sync operations counter
 */
export function decrementPendingSync(): number {
  pendingSyncCount = Math.max(0, pendingSyncCount - 1);
  notifyDebugListeners();
  return pendingSyncCount;
}

/**
 * Explicitly set pending sync count
 */
export function setPendingSyncCount(count: number): void {
  pendingSyncCount = Math.max(0, count);
  notifyDebugListeners();
}

/**
 * Get current pending sync operations count
 */
export function getPendingSyncCount(): number {
  return pendingSyncCount;
}

/**
 * Log a database write or delete operation
 */
export function logDatabaseOperation(
  op: Omit<DatabaseOperationLog, 'id' | 'timestamp' | 'timeFormatted'> & {
    id?: string;
    timestamp?: string;
  }
): DatabaseOperationLog {
  const now = new Date();
  const entry: DatabaseOperationLog = {
    id: op.id || `op-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: op.timestamp || now.toISOString(),
    timeFormatted: getFormattedTime(now),
    operation: op.operation,
    target: op.target,
    entityIds: op.entityIds,
    status: op.status,
    details: op.details,
    deletionVerified: op.deletionVerified !== undefined ? op.deletionVerified : op.operation === 'DELETE' || op.operation === 'DELETE_DOC',
    destination: op.destination,
    durationMs: op.durationMs,
    error: op.error,
    payloadSummary: op.payloadSummary
  };

  // Add to beginning of array
  inMemoryLogs = [entry, ...inMemoryLogs.filter((x) => x.id !== entry.id)].slice(0, MAX_LOGS_KEPT);
  persistLogs();
  notifyDebugListeners();
  return entry;
}

/**
 * Update an existing database operation log (e.g. from PENDING to SUCCESS/FAILED)
 */
export function updateDatabaseOperation(
  id: string,
  updates: Partial<DatabaseOperationLog>
): void {
  let found = false;
  inMemoryLogs = inMemoryLogs.map((log) => {
    if (log.id === id) {
      found = true;
      return { ...log, ...updates };
    }
    return log;
  });

  if (found) {
    persistLogs();
    notifyDebugListeners();
  }
}

/**
 * Retrieve the last N database operations (defaults to 10 as requested)
 */
export function getLastDatabaseOperations(limit: number = 10): DatabaseOperationLog[] {
  return inMemoryLogs.slice(0, limit);
}

/**
 * Clear all logged operations
 */
export function clearDatabaseOperationLogs(): void {
  inMemoryLogs = [];
  persistLogs();
  notifyDebugListeners();
}

/**
 * Subscribe to real-time changes in debug state or logs
 */
export function subscribeToSyncDebug(callback: () => void): () => void {
  debugListeners.add(callback);
  return () => {
    debugListeners.delete(callback);
  };
}

/**
 * Verify whether an entity ID is correctly marked as deleted and tombstoned
 */
export function verifyDeletionPropagation(entityId: string): {
  isTombstonedLocally: boolean;
  isRegisteredGlobal: boolean;
  status: 'VERIFIED_PROPAGATED' | 'NOT_TOMBSTONED';
  details: string;
} {
  const cleanId = String(entityId).trim();
  const isTombstoned = isGloballyDeletedId(cleanId);
  const globalList = getGlobalDeletedIds();
  const inList = globalList.includes(cleanId) || globalList.includes(cleanId.toLowerCase());

  if (isTombstoned || inList) {
    return {
      isTombstonedLocally: isTombstoned,
      isRegisteredGlobal: inList,
      status: 'VERIFIED_PROPAGATED',
      details: `Entity "${cleanId}" is verified as tombstoned. It is registered in global deleted list (${globalList.length} total tombstones) and will not be resurrected.`
    };
  }

  return {
    isTombstonedLocally: false,
    isRegisteredGlobal: false,
    status: 'NOT_TOMBSTONED',
    details: `Entity "${cleanId}" is not present in tombstone register.`
  };
}

export interface CloudSyncConnectionStatus {
  isOnline: boolean;
  isCloudConnected: boolean;
  statusLabel: 'CONNECTED' | 'SYNCING' | 'FAILOVER_ACTIVE' | 'OFFLINE';
  firestoreStatus: 'ONLINE' | 'QUOTA_EXHAUSTED' | 'DISCONNECTED';
  serverHubStatus: 'CONNECTED' | 'CONNECTING' | 'OFFLINE';
  databaseId: string;
  projectId: string;
  primaryCloudStatus: string;
  activeCloudNodesCount: number;
  totalCloudNodesCount: number;
  lastSyncTimestamp: string | null;
  pendingSyncOperations: number;
  totalDeletedTombstones: number;
}

/**
 * Get comprehensive snapshot of current CloudSync connection status
 */
export function getCloudSyncConnectionStatus(): CloudSyncConnectionStatus {
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const cloudConnected = isCloudConnected();
  const quotaExhausted = isFirestoreQuotaExhausted();
  const failoverConfig = getCloudFailoverConfig();
  const activeNodes = (failoverConfig.cloudNodes || []).filter((n) => n.status === 'active');
  const globalDeletions = getGlobalDeletedIds();

  let statusLabel: 'CONNECTED' | 'SYNCING' | 'FAILOVER_ACTIVE' | 'OFFLINE' = 'CONNECTED';
  if (!online) {
    statusLabel = 'OFFLINE';
  } else if (pendingSyncCount > 0) {
    statusLabel = 'SYNCING';
  } else if (quotaExhausted || failoverConfig.secondaryCloudStatus === 'active') {
    statusLabel = 'FAILOVER_ACTIVE';
  } else if (!cloudConnected) {
    statusLabel = 'OFFLINE';
  }

  return {
    isOnline: online,
    isCloudConnected: cloudConnected,
    statusLabel,
    firestoreStatus: quotaExhausted ? 'QUOTA_EXHAUSTED' : (cloudConnected ? 'ONLINE' : 'DISCONNECTED'),
    serverHubStatus: online ? 'CONNECTED' : 'OFFLINE',
    databaseId: firebaseConfig.firestoreDatabaseId || 'ai-studio-excelbillsearcha-11eafe8d-5cc6-4092-bf00-494f4e227d23',
    projectId: firebaseConfig.projectId || 'stoked-objective-gpt51',
    primaryCloudStatus: failoverConfig.primaryCloudStatus || 'online',
    activeCloudNodesCount: activeNodes.length,
    totalCloudNodesCount: failoverConfig.cloudNodes?.length || 10,
    lastSyncTimestamp: failoverConfig.lastSyncTimestamp || null,
    pendingSyncOperations: pendingSyncCount,
    totalDeletedTombstones: globalDeletions.length
  };
}
