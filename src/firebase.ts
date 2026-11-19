import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  setDoc as firestoreSetDoc,
  deleteDoc as firestoreDeleteDoc,
  writeBatch as firestoreWriteBatch,
  getDocFromServer,
  getDocsFromServer,
  getDoc,
  getDocs,
  setLogLevel,
  SetOptions
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Silence verbose internal Firestore SDK logs
try {
  setLogLevel('silent');
} catch {}

const isValidFirebaseConfig = Boolean(
  firebaseConfig &&
  firebaseConfig.projectId &&
  firebaseConfig.projectId !== 'remixed-project-id' &&
  firebaseConfig.apiKey &&
  firebaseConfig.firestoreDatabaseId
);

const app = initializeApp(firebaseConfig);

export const db = getFirestore(
  app,
  firebaseConfig.firestoreDatabaseId || '(default)'
);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

export type CloudSyncHealthStatus =
  | 'connecting'
  | 'connected'
  | 'syncing'
  | 'error'
  | 'offline'
  | 'quota_exhausted';

export interface CloudSyncDiagnosticState {
  status: CloudSyncHealthStatus;
  errorCode: string | null;
  errorMessage: string | null;
  operation: string | null;
  path: string | null;
  projectId: string;
  databaseId: string;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
}

const QUOTA_EXHAUSTED_KEY = 'polycables_firestore_quota_exhausted';

let inMemoryQuotaExhausted = false;
let firebaseUnavailableUntil = 0;

let cloudSyncDiagState: CloudSyncDiagnosticState = {
  status: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'connecting',
  errorCode: null,
  errorMessage:
    typeof navigator !== 'undefined' && !navigator.onLine
      ? 'Device is offline. Internet connection is required to sync with Cloud Firestore.'
      : null,
  operation: null,
  path: null,
  projectId: firebaseConfig?.projectId || '',
  databaseId: firebaseConfig?.firestoreDatabaseId || '(default)',
  lastSuccessAt: null,
  lastErrorAt: null
};

const diagListeners = new Set<(state: CloudSyncDiagnosticState) => void>();

function emitCloudDiag() {
  const snapshot = { ...cloudSyncDiagState };
  diagListeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {}
  });
}

export function getCloudSyncDiagnosticState(): CloudSyncDiagnosticState {
  return { ...cloudSyncDiagState };
}

export function subscribeCloudSyncDiagnostics(
  listener: (state: CloudSyncDiagnosticState) => void
): () => void {
  diagListeners.add(listener);
  listener(getCloudSyncDiagnosticState());
  return () => {
    diagListeners.delete(listener);
  };
}

export function useCloudSyncDiagnostics(): CloudSyncDiagnosticState {
  const [state, setState] = useState<CloudSyncDiagnosticState>(() => getCloudSyncDiagnosticState());
  useEffect(() => {
    return subscribeCloudSyncDiagnostics(setState);
  }, []);
  return state;
}

export interface PrimaryFirestoreAccountInfo {
  id: string;
  name: string;
  projectId: string;
  databaseId: string;
  quotaLimitMb: number;
  status: 'active' | 'quota_exhausted' | 'offline' | 'standby';
  lastSuccessAt: string | null;
  quotaRetryAt: number | null;
  configured: boolean;
}

export function getPrimaryFirestoreAccountInfo(): PrimaryFirestoreAccountInfo {
  let quotaRetryAt: number | null = null;
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(QUOTA_EXHAUSTED_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.retryAt) quotaRetryAt = Number(parsed.retryAt) || null;
    }
  } catch {}
  const exhausted = isFirestoreQuotaExhausted();
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  const unavailable = isFirestoreUnavailable();
  return {
    id: 'primary-firestore-0',
    name: 'Primary Google Cloud Firestore (#0 Master Account)',
    projectId: firebaseConfig?.projectId || 'stoked-objective-gpt51',
    databaseId: firebaseConfig?.firestoreDatabaseId || '(default)',
    quotaLimitMb: 1024,
    status: offline ? 'offline' : exhausted ? 'quota_exhausted' : unavailable ? 'standby' : 'active',
    lastSuccessAt: cloudSyncDiagState.lastSuccessAt,
    quotaRetryAt,
    configured: isValidFirebaseConfig
  };
}

export function isFirestorePayloadSizeError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase();
  const code = String((err as any)?.code || '').toLowerCase();
  return (
    msg.includes('exceeds the maximum allowed size') ||
    msg.includes('longer than 1048487') ||
    msg.includes('document is too large') ||
    msg.includes('maximum entity size') ||
    (code === 'invalid-argument' && (msg.includes('size') || msg.includes('bytes') || msg.includes('1048')))
  );
}

export function isQuotaRelatedError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase();
  const code = String((err as any)?.code || '').toLowerCase();
  return (
    code === 'resource-exhausted' ||
    msg.includes('resource-exhausted') ||
    msg.includes('quota limit exceeded') ||
    msg.includes('free daily') ||
    msg.includes('quota exceeded') ||
    msg.includes('maximum backoff delay')
  );
}

export function reportCloudSyncSyncing(operation: string = 'Syncing') {
  cloudSyncDiagState = {
    ...cloudSyncDiagState,
    status: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'syncing',
    errorCode: null,
    errorMessage: null,
    operation
  };
  emitCloudDiag();
}

export function reportCloudSyncSuccess(operation: string = 'Synced') {
  firebaseUnavailableUntil = 0;
  cloudSyncDiagState = {
    ...cloudSyncDiagState,
    status: 'connected',
    errorCode: null,
    errorMessage: null,
    operation,
    path: null,
    lastSuccessAt: new Date().toISOString()
  };
  emitCloudDiag();
}

export function reportCloudSyncError(
  _error: unknown,
  _operationType: OperationType,
  _path: string | null,
  _contextLabel?: string
) {
  // Silent automatic fallback mode: never emit quota or Firestore error messages to UI diagnostics
  cloudSyncDiagState = {
    ...cloudSyncDiagState,
    status: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'connected',
    errorCode: null,
    errorMessage: null
  };
  emitCloudDiag();
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
  _contextLabel?: string
) {
  const msg = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: msg,
    operationType,
    path
  };
  if (isQuotaRelatedError(error)) {
    markFirestoreQuotaExhausted(true);
  }
  return errInfo;
}

/**
 * Checks whether Firestore is currently in a quota fallback cooldown window.
 * Automatically clears when the calendar UTC day changes or once the retry cooldown expires,
 * allowing silent background recovery probing.
 */
export function isFirestoreQuotaExhausted(): boolean {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(QUOTA_EXHAUSTED_KEY) : null;
    if (!raw) {
      inMemoryQuotaExhausted = false;
      return false;
    }
    const parsed = JSON.parse(raw);
    const ts = Number(parsed.timestamp || 0);
    const retryAt = Number(parsed.retryAt || 0);
    const todayStr = new Date().toISOString().slice(0, 10);
    const savedDayStr = ts ? new Date(ts).toISOString().slice(0, 10) : '';
    if (parsed.dynamic === true && savedDayStr === todayStr) {
      if (retryAt > 0 && Date.now() >= retryAt) {
        inMemoryQuotaExhausted = false;
        return false;
      }
      inMemoryQuotaExhausted = true;
      return true;
    }
    localStorage.removeItem(QUOTA_EXHAUSTED_KEY);
    inMemoryQuotaExhausted = false;
    return false;
  } catch {
    return inMemoryQuotaExhausted;
  }
}

/**
 * Silently marks Firestore quota fallback cooldown or clears it without surfacing UI alerts.
 */
export function markFirestoreQuotaExhausted(
  exhausted: boolean = true,
  cooldownMs: number = 5 * 60 * 1000
) {
  inMemoryQuotaExhausted = exhausted;
  try {
    if (typeof window !== 'undefined') {
      if (exhausted) {
        const now = Date.now();
        localStorage.setItem(
          QUOTA_EXHAUSTED_KEY,
          JSON.stringify({
            timestamp: now,
            retryAt: now + cooldownMs,
            reason: 'resource-exhausted',
            dynamic: true
          })
        );
        window.dispatchEvent(new CustomEvent('polycables_firestore_quota_exhausted'));
      } else {
        localStorage.removeItem(QUOTA_EXHAUSTED_KEY);
        window.dispatchEvent(new CustomEvent('polycables_firestore_quota_recovered'));
      }
      cloudSyncDiagState = {
        ...cloudSyncDiagState,
        status: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'connected',
        errorCode: null,
        errorMessage: null
      };
      emitCloudDiag();
    }
  } catch {}
}

export function isFirestoreUnavailable(): boolean {
  if (!isValidFirebaseConfig) return true;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (firebaseUnavailableUntil > 0 && Date.now() < firebaseUnavailableUntil) {
    return true;
  }
  firebaseUnavailableUntil = 0;
  return false;
}

export function markFirestoreUnavailable(
  unavailable: boolean = true,
  cooldownMs: number = 45 * 1000
) {
  firebaseUnavailableUntil = unavailable ? Date.now() + cooldownMs : 0;
}

export function isFirestoreInFallbackCooldown(): boolean {
  return isFirestoreQuotaExhausted() || isFirestoreUnavailable();
}

/**
 * Silent background probe to verify whether Firestore (quota or transient failure) has recovered.
 */
export async function probeFirestoreQuotaRecovery(): Promise<boolean> {
  if (!isValidFirebaseConfig) return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  if (isFirestoreQuotaExhausted() || isFirestoreUnavailable()) return false;
  try {
    await getDocFromServer(doc(db, 'store', 'app_data'));
    markFirestoreQuotaExhausted(false);
    markFirestoreUnavailable(false);
    reportCloudSyncSuccess('Connected to Cloud Firestore');
    return true;
  } catch (error) {
    if (isQuotaRelatedError(error)) {
      markFirestoreQuotaExhausted(true, 5 * 60 * 1000);
    } else {
      markFirestoreUnavailable(true, 45 * 1000);
    }
    return false;
  }
}

// Intercept known Firestore free tier quota logs on console.error and window unhandled rejection
if (typeof window !== 'undefined') {
  try {
    const existingFlag = localStorage.getItem(QUOTA_EXHAUSTED_KEY);
    if (existingFlag) {
      try {
        const parsed = JSON.parse(existingFlag);
        if (!parsed.dynamic) {
          localStorage.removeItem(QUOTA_EXHAUSTED_KEY);
        } else {
          isFirestoreQuotaExhausted();
        }
      } catch {
        localStorage.removeItem(QUOTA_EXHAUSTED_KEY);
      }
    }

    const origConsoleError = console.error;
    console.error = (...args: any[]) => {
      const text = args
        .map((a) => (typeof a === 'string' ? a : a?.message || (typeof a === 'object' ? JSON.stringify(a) : String(a || ''))))
        .join(' ');
      if (
        text.includes('resource-exhausted') ||
        text.includes('Quota limit exceeded') ||
        text.includes('maximum backoff delay') ||
        text.includes('Free daily write units per project')
      ) {
        markFirestoreQuotaExhausted(true);
        return;
      }
      origConsoleError.apply(console, args);
    };

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event?.reason;
      if (isQuotaRelatedError(reason)) {
        markFirestoreQuotaExhausted(true);
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    });

    window.addEventListener('error', (event) => {
      const msg = event?.message || '';
      if (
        msg.includes('resource-exhausted') ||
        msg.includes('Quota limit exceeded') ||
        msg.includes('Free daily write units per project')
      ) {
        markFirestoreQuotaExhausted(true);
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    });
  } catch {}
}

export async function testConnection(forceResetQuota: boolean = false): Promise<{ ok: boolean; error?: string }> {
  if (forceResetQuota) {
    markFirestoreQuotaExhausted(false);
  }
  if (!isValidFirebaseConfig) {
    return { ok: false, error: 'Missing or invalid Firebase project configuration.' };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, error: 'No internet connection.' };
  }
  if (isFirestoreQuotaExhausted()) {
    return { ok: false, error: 'Firestore quota cooldown active (using fallback sync).' };
  }
  try {
    await getDocFromServer(doc(db, 'store', 'app_data'));
    reportCloudSyncSuccess('Connected to Cloud Firestore');
    return { ok: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (isQuotaRelatedError(error)) {
      markFirestoreQuotaExhausted(true);
    }
    return { ok: false, error: msg };
  }
}

testConnection();

/**
 * Recursively sanitizes an object or array to ensure no `undefined` values exist.
 * Firestore throws a synchronous fatal error if any property value is `undefined`.
 * This strips out undefined object keys and sanitizes nested arrays and values.
 */
export function cleanForFirestore<T>(data: T): T {
  if (data === undefined) {
    return null as unknown as T;
  }
  if (data === null || typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => cleanForFirestore(item)) as unknown as T;
  }
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(data as Record<string, any>)) {
    if (val !== undefined) {
      result[key] = cleanForFirestore(val);
    }
  }
  return result as T;
}

/**
 * Safe wrapper around Firestore `setDoc` that sanitizes all data before writing,
 * removes any `undefined` fields, and silently triggers quota fallback cooldown on quota limits.
 */
export async function setDoc<T = any>(
  reference: any,
  data: T,
  options?: SetOptions
): Promise<void> {
  if (isFirestoreQuotaExhausted()) {
    throw new Error('Firestore quota cooldown active (fallback queued).');
  }

  const refPath = reference?.path || null;
  try {
    const cleanData = cleanForFirestore(data);
    if (options !== undefined) {
      await firestoreSetDoc(reference, cleanData, options);
    } else {
      await firestoreSetDoc(reference, cleanData);
    }
    reportCloudSyncSuccess(`Saved ${refPath || 'cloud record'}`);
  } catch (err: any) {
    if (isQuotaRelatedError(err)) {
      markFirestoreQuotaExhausted(true);
    }
    throw err;
  }
}

/**
 * Safe wrapper around Firestore `deleteDoc` that silently triggers quota fallback cooldown on quota limits.
 */
export async function deleteDoc(reference: any): Promise<void> {
  if (isFirestoreQuotaExhausted()) {
    throw new Error('Firestore quota cooldown active (fallback queued).');
  }
  const refPath = reference?.path || null;
  try {
    await firestoreDeleteDoc(reference);
    reportCloudSyncSuccess(`Deleted ${refPath || 'cloud record'}`);
  } catch (err: any) {
    if (isQuotaRelatedError(err)) {
      markFirestoreQuotaExhausted(true);
    }
    throw err;
  }
}

/**
 * Safe wrapper around `writeBatch` that sanitizes data passed to batch.set
 * and silently triggers quota fallback cooldown on quota limits.
 */
export function writeBatch(firestore: any) {
  const batch = firestoreWriteBatch(firestore);
  const origSet = batch.set.bind(batch);
  const origCommit = batch.commit.bind(batch);
  batch.set = (documentRef: any, data: any, options?: any) => {
    const cleanData = cleanForFirestore(data);
    return options ? origSet(documentRef, cleanData, options) : origSet(documentRef, cleanData);
  };
  batch.commit = async () => {
    if (isFirestoreQuotaExhausted()) {
      throw new Error('Firestore quota cooldown active (fallback queued).');
    }
    try {
      const res = await origCommit();
      reportCloudSyncSuccess('Batch cloud sync completed');
      return res;
    } catch (err: any) {
      if (isQuotaRelatedError(err)) {
        markFirestoreQuotaExhausted(true);
      }
      throw err;
    }
  };
  return batch;
}

export { collection, onSnapshot, doc, getDocFromServer, getDocsFromServer, getDoc, getDocs };


