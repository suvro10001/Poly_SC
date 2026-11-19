import express from "express";
import fs from "fs";
import path from "path";

// Application State File Path
const DATA_DIR = path.resolve(process.cwd(), "data");
const APP_STATE_FILE = path.join(DATA_DIR, "app_state.json");
const APP_STATE_TEMP = path.join(DATA_DIR, "app_state.tmp.json");
const APP_STATE_BACKUP = path.join(DATA_DIR, "app_state.backup.json");
const APP_STATE_BACKUP_TEMP = path.join(DATA_DIR, "app_state.backup.tmp.json");
const AUTO_BACKUP_DIR = path.join(DATA_DIR, "automated_backups");

// Ensure data and backup directories exist
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error("[ServerSync] Failed to create data dir:", err);
  }
}
if (!fs.existsSync(AUTO_BACKUP_DIR)) {
  try {
    fs.mkdirSync(AUTO_BACKUP_DIR, { recursive: true });
  } catch (err) {
    console.error("[ServerSync] Failed to create automated_backups dir:", err);
  }
}

// In-Memory Master Application State
let serverAppState: Record<string, any> = {};
let appStateVersion = Date.now();
const sseClients = new Set<express.Response>();
let saveDebounceTimer: NodeJS.Timeout | null = null;
let hasPendingDiskWrite = false;
let allowBackupShrinkOverwrite = false;

function tryReadValidStateFile(filePath: string): Record<string, any> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    if (!raw || !raw.trim()) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, any>;
  } catch (err) {
    console.warn(`[ServerSync] Invalid or unreadable JSON in ${path.basename(filePath)}:`, err);
    return null;
  }
}

function hasMeaningfulStateKeys(state: Record<string, any> | null | undefined): boolean {
  if (!state || typeof state !== "object") return false;
  return Object.keys(state).some((k) => {
    if (k.startsWith("_")) return false;
    const v = state[k];
    if (Array.isArray(v)) return v.length > 0;
    if (v && typeof v === "object") return Object.keys(v).length > 0;
    return Boolean(v);
  });
}

function atomicWriteJsonFileSync(targetPath: string, tempPath: string, dataStr: string): boolean {
  if (!dataStr || dataStr.trim().length < 2) return false;
  let fd: number | null = null;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fd = fs.openSync(tempPath, "w");
    fs.writeSync(fd, dataStr, undefined, "utf-8");
    try {
      fs.fsyncSync(fd);
    } catch {}
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tempPath, targetPath);
    return true;
  } catch (err) {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {}
    console.error(`[ServerSync] Sync atomic write failed for ${path.basename(targetPath)}:`, err);
    return false;
  }
}

async function atomicWriteJsonFileAsync(targetPath: string, tempPath: string, dataStr: string): Promise<boolean> {
  if (!dataStr || dataStr.trim().length < 2) return false;
  let handle: fs.promises.FileHandle | null = null;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      await fs.promises.mkdir(DATA_DIR, { recursive: true });
    }
    handle = await fs.promises.open(tempPath, "w");
    await handle.writeFile(dataStr, "utf-8");
    try {
      await handle.sync();
    } catch {}
    await handle.close();
    handle = null;
    await fs.promises.rename(tempPath, targetPath);
    return true;
  } catch (err) {
    if (handle !== null) {
      try {
        await handle.close();
      } catch {}
    }
    try {
      if (fs.existsSync(tempPath)) await fs.promises.unlink(tempPath);
    } catch {}
    console.error(`[ServerSync] Async atomic write failed for ${path.basename(targetPath)}:`, err);
    return false;
  }
}

function sanitizeBranchRecordOnServer(b: any): any {
  if (!b || typeof b !== 'object') return b;
  const copy = { ...b };
  const adminIdLower = String(copy.adminId || '').toLowerCase().trim();
  const assignedAdminIdLower = String(copy.assignedAdminId || '').toLowerCase().trim();
  const adminUserLower = String(copy.adminUsername || '').toLowerCase().trim();
  const adminNameLower = String(copy.adminName || '').toLowerCase().trim();

  const isUnassignedFakeAdmin =
    adminIdLower === 'adm-mahmudul' ||
    adminIdLower === 'adm-subrata' ||
    adminIdLower === 'adm-rashidul' ||
    adminIdLower === 'sp-1791978445459' ||
    adminIdLower === '111' ||
    assignedAdminIdLower === 'adm-mahmudul' ||
    assignedAdminIdLower === 'adm-subrata' ||
    assignedAdminIdLower === 'adm-rashidul' ||
    assignedAdminIdLower === 'sp-1791978445459' ||
    adminUserLower === 'admin1' ||
    adminUserLower === 'admin2' ||
    adminUserLower === 'admin3' ||
    adminUserLower === '111' ||
    adminNameLower === 'admin' ||
    adminNameLower.includes('mahmudul hasan') ||
    adminNameLower.includes('rashidul islam') ||
    adminNameLower.includes('subrata sutradhar');

  if (isUnassignedFakeAdmin) {
    delete copy.adminId;
    delete copy.adminName;
    delete copy.adminUsername;
    delete copy.assignedAdminId;
  }

  const inChargeIdLower = String(copy.inChargeId || '').toLowerCase().trim();
  const inChargeNameLower = String(copy.inChargeName || '').toLowerCase().trim();
  if (
    inChargeIdLower === 'adm-mahmudul' ||
    inChargeIdLower === 'adm-subrata' ||
    inChargeIdLower === 'adm-rashidul' ||
    inChargeNameLower.includes('rashidul islam') ||
    inChargeNameLower.includes('mahmudul hasan')
  ) {
    delete copy.inChargeId;
    delete copy.inChargeName;
    delete copy.inChargePhone;
  }

  const approverLower = String(copy.approverName || '').toLowerCase().trim();
  if (approverLower.includes('mahmudul hasan')) {
    copy.approverName = '';
  }

  return copy;
}

function sanitizeSalespersonRecordOnServer(s: any): boolean {
  if (!s || typeof s !== 'object') return false;
  const idLower = String(s.id || '').toLowerCase().trim();
  const codeLower = String(s.code || '').toLowerCase().trim();
  const userLower = String(s.username || '').toLowerCase().trim();
  const nameLower = String(s.name || '').toLowerCase().trim();
  if (
    idLower === 'adm-mahmudul' ||
    idLower === 'adm-subrata' ||
    idLower === 'adm-rashidul' ||
    idLower === 'sp-1791978445459' ||
    idLower === '111' ||
    userLower === 'admin1' ||
    userLower === 'admin2' ||
    userLower === 'admin3' ||
    userLower === '111' ||
    codeLower === 'adm-01' ||
    codeLower === 'adm-02' ||
    codeLower === 'adm-03' ||
    codeLower === 'adm-111' ||
    codeLower === '111' ||
    nameLower === 'admin'
  ) {
    return false;
  }
  return true;
}

// Initial Load & Automatic Self-Healing from Disk
try {
  const mainState = tryReadValidStateFile(APP_STATE_FILE);
  const backupState = tryReadValidStateFile(APP_STATE_BACKUP);
  let needsMainFileRepair = false;
  let needsBackupFileRepair = false;

  if (mainState && (hasMeaningfulStateKeys(mainState) || !hasMeaningfulStateKeys(backupState))) {
    serverAppState = mainState;
    console.log(`[ServerSync] Loaded state from app_state.json with ${Object.keys(serverAppState).length} keys.`);
    if (!backupState || (hasMeaningfulStateKeys(mainState) && !hasMeaningfulStateKeys(backupState))) {
      needsBackupFileRepair = true;
    }
  } else if (backupState) {
    serverAppState = backupState;
    needsMainFileRepair = true;
    console.log(`[ServerSync] Recovered state from app_state.backup.json with ${Object.keys(serverAppState).length} keys (repairing app_state.json).`);
  } else {
    serverAppState = {};
    needsMainFileRepair = true;
    needsBackupFileRepair = true;
    console.log("[ServerSync] No valid app_state found on startup, initializing clean {} state files.");
  }

  let sanitizedOnBoot = false;
  if (Array.isArray(serverAppState.deletedEntityIds)) {
    const prevLen = serverAppState.deletedEntityIds.length;
    serverAppState.deletedEntityIds = serverAppState.deletedEntityIds
      .filter((id: any) => {
        const s = String(id || '').trim();
        return s.length > 1 && !/^\d{1,5}$/.test(s);
      })
      .slice(-10000);
    if (serverAppState.deletedEntityIds.length !== prevLen) sanitizedOnBoot = true;
  }
  if (Array.isArray(serverAppState.salespersons)) {
    const prevLen = serverAppState.salespersons.length;
    serverAppState.salespersons = serverAppState.salespersons.filter(sanitizeSalespersonRecordOnServer);
    if (serverAppState.salespersons.length !== prevLen) sanitizedOnBoot = true;
  }
  if (Array.isArray(serverAppState.branches)) {
    const beforeJson = JSON.stringify(serverAppState.branches);
    serverAppState.branches = serverAppState.branches
      .filter((b: any) => {
        const n = String(b?.name || b?.label || '').toLowerCase().trim();
        return (
          b &&
          b?.id !== 'branch-main' &&
          !n.includes('polycables store') &&
          !n.includes('billing portal')
        );
      })
      .map(sanitizeBranchRecordOnServer)
      .sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || '')));
    if (JSON.stringify(serverAppState.branches) !== beforeJson) sanitizedOnBoot = true;
  }
  // Boot normalization: map legacy branch-main to branch-1 and normalize bills/expenses
  if (Array.isArray(serverAppState.storedBills)) {
    const beforeBills = JSON.stringify(serverAppState.storedBills);
    serverAppState.storedBills = serverAppState.storedBills.map((b: any) => {
      if (!b || typeof b !== 'object') return b;
      let branchId = b.branchId || b.header?.branchId;
      if (branchId === 'branch-main' || !branchId || branchId === 'NONE') {
        const rawBillNo = (b.header?.billNo || b.billNo || '').trim().toUpperCase();
        const targetId = rawBillNo.startsWith('AS') ? 'branch-ashulia' : 'branch-1';
        const targetName = rawBillNo.startsWith('AS') ? 'Ashulia Sales Center' : 'Madhupur Sales Center';
        return {
          ...b,
          branchId: targetId,
          branchName: b.branchName || targetName,
          header: { ...(b.header || {}), branchId: targetId, branchName: b.header?.branchName || targetName }
        };
      }
      return b;
    });
    serverAppState.stored_bills = serverAppState.storedBills;
    if (JSON.stringify(serverAppState.storedBills) !== beforeBills) sanitizedOnBoot = true;
  }
  if (Array.isArray(serverAppState.expenses)) {
    const beforeExp = JSON.stringify(serverAppState.expenses);
    serverAppState.expenses = serverAppState.expenses.map((e: any) => {
      if (!e || typeof e !== 'object') return e;
      if (!e.branchId || e.branchId === 'branch-main') {
        return { ...e, branchId: 'branch-1', branchName: e.branchName || 'Madhupur Sales Center' };
      }
      return e;
    });
    if (JSON.stringify(serverAppState.expenses) !== beforeExp) sanitizedOnBoot = true;
  }
  if (Array.isArray(serverAppState.bankDeposits)) {
    const beforeDep = JSON.stringify(serverAppState.bankDeposits);
    serverAppState.bankDeposits = serverAppState.bankDeposits.map((d: any) => {
      if (!d || typeof d !== 'object') return d;
      if (!d.branchId || d.branchId === 'branch-main') {
        return { ...d, branchId: 'branch-1', branchName: d.branchName || 'Madhupur Sales Center' };
      }
      return d;
    });
    serverAppState.bank_deposits = serverAppState.bankDeposits;
    if (JSON.stringify(serverAppState.bankDeposits) !== beforeDep) sanitizedOnBoot = true;
  }

  if (sanitizedOnBoot || needsMainFileRepair || needsBackupFileRepair) {
    const bootDataStr = JSON.stringify(serverAppState);
    if (sanitizedOnBoot || needsMainFileRepair) {
      atomicWriteJsonFileSync(APP_STATE_FILE, APP_STATE_TEMP, bootDataStr);
    }
    if (sanitizedOnBoot || needsBackupFileRepair) {
      atomicWriteJsonFileSync(APP_STATE_BACKUP, APP_STATE_BACKUP_TEMP, bootDataStr);
    }
  }
} catch (err) {
  console.error("[ServerSync] Error during startup state initialization:", err);
  const recovered = tryReadValidStateFile(APP_STATE_BACKUP) || tryReadValidStateFile(APP_STATE_FILE) || {};
  serverAppState = recovered;
  const fallbackStr = JSON.stringify(serverAppState);
  atomicWriteJsonFileSync(APP_STATE_FILE, APP_STATE_TEMP, fallbackStr);
  atomicWriteJsonFileSync(APP_STATE_BACKUP, APP_STATE_BACKUP_TEMP, fallbackStr);
}

let isDiskWriteInFlight = false;
let isDiskWritePending = false;

function shouldWriteBackupFile(candidateState: Record<string, any>, existingBackup: Record<string, any> | null, allowShrink: boolean): boolean {
  if (!existingBackup) return true;
  if (allowShrink) return true;
  if (hasMeaningfulStateKeys(existingBackup) && !hasMeaningfulStateKeys(candidateState)) {
    return false;
  }
  return true;
}

export function flushStateToDiskSync() {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }
  try {
    const dataStr = JSON.stringify(serverAppState);
    if (!dataStr || dataStr.trim().length < 2) return;
    const wroteMain = atomicWriteJsonFileSync(APP_STATE_FILE, APP_STATE_TEMP, dataStr);
    if (wroteMain) {
      const existingBackup = tryReadValidStateFile(APP_STATE_BACKUP);
      if (shouldWriteBackupFile(serverAppState, existingBackup, allowBackupShrinkOverwrite)) {
        atomicWriteJsonFileSync(APP_STATE_BACKUP, APP_STATE_BACKUP_TEMP, dataStr);
      }
      hasPendingDiskWrite = false;
      allowBackupShrinkOverwrite = false;
    }
  } catch (e) {
    console.error("[ServerSync] Error writing state synchronously to disk:", e);
  }
}

async function flushStateToDiskAsync() {
  if (isDiskWriteInFlight) {
    isDiskWritePending = true;
    return;
  }
  isDiskWriteInFlight = true;
  try {
    do {
      isDiskWritePending = false;
      const snapshotState = serverAppState;
      const allowShrink = allowBackupShrinkOverwrite;
      const dataStr = JSON.stringify(snapshotState);
      if (!dataStr || dataStr.trim().length < 2) continue;

      const wroteMain = await atomicWriteJsonFileAsync(APP_STATE_FILE, APP_STATE_TEMP, dataStr);
      if (wroteMain) {
        const existingBackup = tryReadValidStateFile(APP_STATE_BACKUP);
        if (shouldWriteBackupFile(snapshotState, existingBackup, allowShrink)) {
          await atomicWriteJsonFileAsync(APP_STATE_BACKUP, APP_STATE_BACKUP_TEMP, dataStr);
        }
        hasPendingDiskWrite = false;
        allowBackupShrinkOverwrite = false;
      }
    } while (isDiskWritePending);
  } catch (e) {
    console.error("[ServerSync] Error writing state to disk:", e);
  } finally {
    isDiskWriteInFlight = false;
  }
}

// Guarantee buffered or in-flight state is flushed before Node exits cleanly
process.on("exit", () => {
  if (hasPendingDiskWrite || saveDebounceTimer !== null) {
    flushStateToDiskSync();
  }
});

/**
 * Atomic Disk Persistence
 */
export function persistStateImmediately() {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }
  hasPendingDiskWrite = true;
  void flushStateToDiskAsync();
}

function scheduleStateSave() {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }
  hasPendingDiskWrite = true;
  saveDebounceTimer = setTimeout(() => {
    saveDebounceTimer = null;
    void flushStateToDiskAsync();
  }, 60);
}


/**
 * Smart Deduplicating Array Merger
 */
function mergeArraysById(existing: any[] = [], incoming: any[] = [], idKey = "id"): any[] {
  if (!Array.isArray(incoming)) return existing;
  if (!Array.isArray(existing) || existing.length === 0) return [...incoming];

  const map = new Map<string, any>();

  // Helper to extract unique identity
  const getEntityId = (item: any): string => {
    if (!item || typeof item !== "object") return String(item);
    if (idKey && item[idKey]) return String(item[idKey]);
    if (item.id) return String(item.id);
    if (item._id) return String(item._id);
    
    // For bills, avoid colliding bills with same serial number across different sales centers
    const billNo = item.header?.billNo || item.billNo;
    if (billNo) {
      const branch = item.branchId || item.header?.branchId || item.branchName || item.header?.branchName || '';
      return `bill::${branch}::${billNo}`;
    }
    
    if (item.mrNo && typeof item.mrNo === 'string' && item.mrNo.trim()) {
      const colBranch = String(item.branchId || item.branchName || item.entityName || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
      return colBranch ? `mr::${colBranch}::${item.mrNo.trim().toLowerCase()}` : `mr::${item.mrNo.trim().toLowerCase()}`;
    }

    return (
      item.challanNo ? `ch::${item.challanNo}` :
      item.code ? `code::${item.code}` :
      item.name ? `name::${item.name}` :
      JSON.stringify(item)
    );
  };

  // Populate map with existing items
  for (const item of existing) {
    if (item !== null && item !== undefined) {
      const id = getEntityId(item);
      map.set(id, item);
    }
  }

  const parseEntityTs = (obj: any): number => {
    if (!obj || typeof obj !== "object") return 0;
    const raw = obj.updatedAt ?? obj.modifiedAt ?? obj.header?.updatedAt ?? obj.savedAt ?? obj.createdAt;
    if (!raw) return 0;
    if (typeof raw === "number") return isFinite(raw) ? raw : 0;
    const ms = Date.parse(String(raw));
    return isNaN(ms) ? 0 : ms;
  };

  // Merge/Overwrite with incoming items (preserving newer edits by updatedAt / modifiedAt / savedAt)
  for (const item of incoming) {
    if (item !== null && item !== undefined) {
      const id = getEntityId(item);
      const prev = map.get(id);
      if (prev && typeof prev === "object" && typeof item === "object") {
        const prevTime = parseEntityTs(prev);
        const itemTime = parseEntityTs(item);
        if (itemTime >= prevTime) {
          map.set(id, {
            ...prev,
            ...item,
            ...(prev.header || item.header ? { header: { ...(prev.header || {}), ...(item.header || {}) } } : {})
          });
        } else {
          map.set(id, {
            ...item,
            ...prev,
            ...(prev.header || item.header ? { header: { ...(item.header || {}), ...(prev.header || {}) } } : {})
          });
        }
      } else {
        map.set(id, item);
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Deduplicate String Array (like bankList, accountList)
 */
function deduplicateStrings(existing: string[] = [], incoming: string[] = []): string[] {
  const combined = [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const str of combined) {
    if (typeof str === "string" && str.trim()) {
      const lower = str.trim().toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        result.push(str.trim());
      }
    }
  }
  return result;
}

function isEntityDeletedOnServer(item: any, currentDeletedSet: Set<string>, currentRestoredSet: Set<string>): boolean {
  if (!item || typeof item !== "object") return false;
  const candidates = [
    item.id,
    item._id
  ];
  for (const c of candidates) {
    if (!c) continue;
    const str = String(c).toLowerCase().trim();
    if (currentRestoredSet.has(str)) return false;
    if (currentDeletedSet.has(str)) return true;
  }
  return false;
}

/**
 * Merge an incoming patch into the server's master state
 */
export function mergePatchIntoServerState(patch: Record<string, any>) {
  if (!patch || typeof patch !== "object") return;

  hasPendingDiskWrite = true;
  // If this is a full backup restore or force clear, wipe stale tombstones completely
  if (patch._forceClear || (patch._isRestore && patch._replaceAll)) {
    allowBackupShrinkOverwrite = true;
    serverAppState.deletedEntityIds = [];
    serverAppState.deletedEntityTimestamps = {};
  }

  if (!serverAppState.deletedEntityTimestamps || typeof serverAppState.deletedEntityTimestamps !== "object") {
    serverAppState.deletedEntityTimestamps = {};
  }

  if (typeof patch._itemsCleared === "boolean") {
    serverAppState._itemsCleared = patch._itemsCleared;
  } else if (patch._forceClear) {
    serverAppState._itemsCleared = Array.isArray(patch.items) ? patch.items.length === 0 : false;
  }
  if (Array.isArray(patch.items) && patch.items.length > 0) {
    serverAppState._itemsCleared = false;
  }
  if (patch.items !== undefined || patch._replaceItems || patch._forceClear || patch._forceEmpty || patch._itemsCleared) {
    const incomingVer = Number(patch.itemsVersion || 0);
    const prevVer = Number(serverAppState.itemsVersion || 0);
    serverAppState.itemsVersion = incomingVer > prevVer ? incomingVer : Math.max(prevVer + 1, Date.now());
  } else if (Number(patch.itemsVersion || 0) > Number(serverAppState.itemsVersion || 0)) {
    serverAppState.itemsVersion = Number(patch.itemsVersion);
  }

  // Sanitize deletedEntityIds to purge false positive short numeric tombstones like "1", "10", etc.
  if (Array.isArray(serverAppState.deletedEntityIds)) {
    serverAppState.deletedEntityIds = serverAppState.deletedEntityIds.filter((id: any) => {
      const s = String(id || '').trim();
      return s.length > 1 && !/^\d{1,5}$/.test(s);
    });
  }

  // 1. Process restoredEntityIds: permanently un-tombstone explicitly restored IDs on the server
  if (Array.isArray(patch.restoredEntityIds) && patch.restoredEntityIds.length > 0) {
    const restoreSet = new Set(patch.restoredEntityIds.map((x: any) => String(x).toLowerCase().trim()));
    const currentDeleted = Array.isArray(serverAppState.deletedEntityIds) ? serverAppState.deletedEntityIds : [];
    serverAppState.deletedEntityIds = currentDeleted.filter(
      (id: string) => !restoreSet.has(String(id).toLowerCase().trim())
    );
    restoreSet.forEach((rid) => {
      delete serverAppState.deletedEntityTimestamps[rid];
    });
  }

  // 2. Deleted tombstones stay strictly deleted across all devices unless explicitly restored
  //    via restoredEntityIds or full backup wipe (_forceClear / _isRestore + _replaceAll).

  const incomingRestoreSet = new Set<string>(
    (Array.isArray(patch.restoredEntityIds) ? patch.restoredEntityIds : []).map((x: any) => String(x).toLowerCase().trim())
  );

  // 3. Process deletedEntityIds if present in patch (excluding full wipe restores and IDs explicitly restored in this patch)
  if (!patch._forceClear && Array.isArray(patch.deletedEntityIds) && patch.deletedEntityIds.length > 0) {
    const nowTs = Date.now();
    const sanitizedIncoming = patch.deletedEntityIds.filter((id: any) => {
      const s = String(id || '').trim();
      if (!(s.length > 1 && !/^\d{1,5}$/.test(s))) return false;
      return !incomingRestoreSet.has(s.toLowerCase());
    });
    const currentDeleted = Array.isArray(serverAppState.deletedEntityIds) ? serverAppState.deletedEntityIds : [];
    const combined = Array.from(new Set([...currentDeleted, ...sanitizedIncoming]));
    serverAppState.deletedEntityIds = combined;
    sanitizedIncoming.forEach((id: any) => {
      const k = String(id).toLowerCase().trim();
      if (k) serverAppState.deletedEntityTimestamps[k] = nowTs;
    });

    const deletedSet = new Set(combined.map((x: any) => String(x).toLowerCase().trim()));

    // Instantly purge deleted entity IDs across all collections stored on the server
    for (const [arrKey, arrVal] of Object.entries(serverAppState)) {
      if (Array.isArray(arrVal) && arrKey !== "deletedEntityIds" && arrKey !== "bankList" && arrKey !== "accountList") {
        serverAppState[arrKey] = arrVal.filter((itm: any) => {
          if (!itm) return false;
          if (typeof itm === "string") return true;
          return !isEntityDeletedOnServer(itm, deletedSet, new Set<string>());
        });
      }
    }
  }

  // Authoritative Set of currently deleted entity IDs (case-insensitive)
  const currentDeletedSet = new Set<string>(
    (serverAppState.deletedEntityIds || []).map((x: any) => String(x).toLowerCase().trim())
  );
  const currentRestoredSet = new Set<string>(
    (Array.isArray(patch.restoredEntityIds) ? patch.restoredEntityIds : []).map((x: any) => String(x).toLowerCase().trim())
  );

  for (const [key, val] of Object.entries(patch)) {
    if (val === undefined || key === "deletedEntityIds" || key === "restoredEntityIds" || key.startsWith('_')) continue;

    if (
      key === "bankList" ||
      key === "accountList" ||
      key === "bank_list" ||
      key === "account_list" ||
      key === "expenseCategories" ||
      key === "orderedCategories" ||
      key === "customCategories" ||
      key === "deletedCategories"
    ) {
      // Authoritative string lists (banks/accounts/categories: reflects additions, reordering, or deletions in exact order)
      if (key === "expenseCategories") {
        serverAppState[key] = Array.isArray(val) ? val : [];
      } else if (key === "orderedCategories" || key === "customCategories" || key === "deletedCategories") {
        if (Array.isArray(val)) {
          const seenCat = new Set<string>();
          const orderedList: string[] = [];
          for (const entry of val) {
            const trimmed = String(entry || '').trim();
            if (!trimmed) continue;
            const low = trimmed.toLowerCase();
            if (!seenCat.has(low)) {
              seenCat.add(low);
              orderedList.push(key === "deletedCategories" ? low : trimmed);
            }
          }
          serverAppState[key] = orderedList;
        } else {
          serverAppState[key] = val;
        }
      } else {
        const cleanList = Array.isArray(val) ? Array.from(new Set(val.map((s: string) => String(s).trim()).filter(Boolean))) : val;
        serverAppState[key] = cleanList;
        if (key === "bankList") serverAppState["bank_list"] = cleanList;
        if (key === "bank_list") serverAppState["bankList"] = cleanList;
        if (key === "accountList") serverAppState["account_list"] = cleanList;
        if (key === "account_list") serverAppState["accountList"] = cleanList;
      }
    } else if (Array.isArray(val)) {
      let filtered = val.filter((itm: any) => itm !== null && itm !== undefined);
      if (key === 'salespersons') {
        filtered = filtered.filter(sanitizeSalespersonRecordOnServer);
      }
      if (key === 'branches') {
        filtered = filtered
          .filter((b: any) => {
            const n = String(b?.name || b?.label || '').toLowerCase().trim();
            return (
              b &&
              b?.id !== 'branch-main' &&
              !n.includes('polycables store') &&
              !n.includes('billing portal')
            );
          })
          .map(sanitizeBranchRecordOnServer)
          .sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || '')));
      }
      if (key === 'storedBills' || key === 'stored_bills') {
        filtered = filtered.map((b: any) => {
          if (!b || typeof b !== 'object') return b;
          let brId = b.branchId || b.header?.branchId;
          if (brId === 'branch-main') {
            return {
              ...b,
              branchId: 'branch-1',
              branchName: b.branchName || 'Madhupur Sales Center',
              header: { ...(b.header || {}), branchId: 'branch-1', branchName: b.header?.branchName || 'Madhupur Sales Center' }
            };
          }
          return b;
        });
      }
      if (key === 'expenses' || key === 'collections' || key === 'bankDeposits' || key === 'bank_deposits') {
        filtered = filtered.map((item: any) => {
          if (!item || typeof item !== 'object') return item;
          if (item.branchId === 'branch-main') {
            return { ...item, branchId: 'branch-1', branchName: item.branchName || 'Madhupur Sales Center' };
          }
          return item;
        });
      }

      // Single Source of Truth: Filter out any items that are globally deleted unless explicitly restored or restoring
      if (key !== "bankList" && key !== "accountList" && !patch._isRestore) {
        filtered = filtered.filter((itm: any) => {
          if (!itm || typeof itm !== "object") return true;
          return !isEntityDeletedOnServer(itm, currentDeletedSet, currentRestoredSet);
        });
      }

      const allowEmptyCollection =
        Boolean(patch._forceEmpty) ||
        Boolean(patch._forceClear) ||
        Boolean(patch._isRestore) ||
        (key === "specialItems" && Boolean(patch._replaceItems)) ||
        ((key === "priceSnapshots" || key === "price_snapshots") && Boolean(patch._replacePriceSnapshots) && Boolean(patch._forceEmpty)) ||
        ((key === "items" || key === "specialItems") && Boolean(patch._itemsCleared || serverAppState._itemsCleared));

      if (filtered.length === 0 && Array.isArray(serverAppState[key]) && serverAppState[key].length > 0 && !allowEmptyCollection) {
        console.warn(`[ServerSync] Protected existing "${key}" (${serverAppState[key].length} records) from accidental empty patch overwrite.`);
        continue;
      }

      // Safe update: Replace entire collection on forced clear/replacement; otherwise merge by unique ID
      if (
        patch._forceClear ||
        patch._forceEmpty ||
        (key === 'storedBills' && patch._replaceStoredBills) ||
        ((key === 'items' || key === 'specialItems') && patch._replaceItems) ||
        ((key === 'priceSnapshots' || key === 'price_snapshots') && patch._replacePriceSnapshots)
      ) {
        serverAppState[key] = filtered;
      } else {
        // Merge incoming records with existing server state so concurrent edits or branch-filtered patches never drop other branches' records,
        // while deleted items are strictly excluded by explicit tombstones (currentDeletedSet).
        const merged = mergeArraysById(serverAppState[key] || [], filtered);
        serverAppState[key] = merged.filter((itm: any) => {
          if (!itm || typeof itm !== 'object') return true;
          return !isEntityDeletedOnServer(itm, currentDeletedSet, currentRestoredSet);
        });
      }

      if (key === "priceSnapshots" || key === "price_snapshots") {
        const snaps = Array.isArray(serverAppState[key]) ? serverAppState[key] : [];
        if (snaps.length > 0) {
          const parseTs = (s: any) => {
            const raw = s?.activatedAt || s?.updatedAt || s?.createdAt;
            const ms = raw ? Date.parse(String(raw)) : 0;
            return isNaN(ms) ? 0 : ms;
          };
          const activeOnes = snaps.filter((s: any) => Boolean(s?.isActive));
          let winnerId = '';
          if (activeOnes.length > 0) {
            activeOnes.sort((a: any, b: any) => parseTs(b) - parseTs(a));
            winnerId = activeOnes[0].id;
          } else {
            const sorted = [...snaps].sort((a: any, b: any) => parseTs(b) - parseTs(a));
            winnerId = sorted[0].id;
          }
          serverAppState[key] = snaps.map((s: any) => ({
            ...s,
            isActive: s?.id === winnerId,
            items: Array.isArray(s?.items)
              ? s.items.map((it: any) => ({
                  id: it.id,
                  code: it.code,
                  name: it.name,
                  category: it.category,
                  unit: it.unit,
                  rate: it.rate,
                  ...(it.sizeSpec ? { sizeSpec: it.sizeSpec } : {}),
                  ...(it.serial !== undefined ? { serial: it.serial } : {})
                }))
              : []
          }));
          const winner = serverAppState[key].find((s: any) => s?.id === winnerId);
          if (winner?.effectiveDate && !patch.activeEffectiveDate) {
            serverAppState.activeEffectiveDate = winner.effectiveDate;
          }
        }
      }

      if (key === "items" && filtered.length === 0 && allowEmptyCollection) {
        serverAppState._itemsCleared = true;
        serverAppState.specialItems = [];
      }

      // Sync dual aliases using the authoritative merged state
      if (key === "storedBills") serverAppState["stored_bills"] = serverAppState[key];
      if (key === "stored_bills") serverAppState["storedBills"] = serverAppState[key];
      if (key === "factoryImports") serverAppState["factory_imports"] = serverAppState[key];
      if (key === "factory_imports") serverAppState["factoryImports"] = serverAppState[key];
      if (key === "stockReturns") serverAppState["stock_returns"] = serverAppState[key];
      if (key === "stock_returns") serverAppState["stockReturns"] = serverAppState[key];
      if (key === "deliveryChallans") serverAppState["delivery_challans"] = serverAppState[key];
      if (key === "delivery_challans") serverAppState["deliveryChallans"] = serverAppState[key];
      if (key === "bankDeposits") serverAppState["bank_deposits"] = serverAppState[key];
      if (key === "bank_deposits") serverAppState["bankDeposits"] = serverAppState[key];
      if (key === "colorExchanges") serverAppState["color_exchanges"] = serverAppState[key];
      if (key === "color_exchanges") serverAppState["colorExchanges"] = serverAppState[key];
      if (key === "conveyances") serverAppState["conveyance_entries"] = serverAppState[key];
      if (key === "conveyance_entries") serverAppState["conveyances"] = serverAppState[key];
      if (key === "deletedAutoDeposits") serverAppState["deleted_auto_deposits"] = serverAppState[key];
      if (key === "deleted_auto_deposits") serverAppState["deletedAutoDeposits"] = serverAppState[key];
      if (key === "priceSnapshots") serverAppState["price_snapshots"] = serverAppState[key];
      if (key === "price_snapshots") serverAppState["priceSnapshots"] = serverAppState[key];
    } else if (typeof val === "object" && val !== null) {
      if (key === "categoryNumbers" || patch._replaceCategoryNumbers) {
        serverAppState[key] = { ...val };
      } else {
        serverAppState[key] = patch._forceClear
          ? { ...val }
          : {
              ...(serverAppState[key] || {}),
              ...val
            };
      }
    } else {
      serverAppState[key] = val;
    }
  }

  serverAppState._syncProtocolVersion = 2;
  serverAppState._updatedAt = new Date().toISOString();
  appStateVersion = Date.now();
  if (patch._forceClear) {
    serverAppState.deletedEntityIds = [];
    serverAppState.deletedEntityTimestamps = {};
  }
  if (patch._forceClear || patch._isRestore || patch._forceEmpty || patch._isDeleteOperation || patch._itemsCleared) {
    persistStateImmediately();
  } else {
    scheduleStateSave();
  }
}

/**
 * Broadcast event to all active SSE client connections
 */
export function broadcastSyncEvent(eventData: Record<string, any>) {
  const payload = `event: sync\ndata: ${JSON.stringify(eventData)}\n\n`;
  for (const client of sseClients) {
    try {
      if ((client as any).writableEnded || (client as any).destroyed) {
        sseClients.delete(client);
        continue;
      }
      client.write(payload);
      (client as any).flush?.();
    } catch {
      sseClients.delete(client);
    }
  }
}

interface ServerOperationRecord {
  id: string;
  timestamp: string;
  type: 'WRITE' | 'DELETE' | 'RESTORE';
  clientId?: string;
  slices?: string[];
  deletedIds?: string[];
  restoredIds?: string[];
  itemsCount?: number;
  details: string;
}

const recentServerOperations: ServerOperationRecord[] = [];

function recordServerOperation(op: Omit<ServerOperationRecord, 'id' | 'timestamp'>) {
  const rec: ServerOperationRecord = {
    id: `srv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...op
  };
  recentServerOperations.unshift(rec);
  if (recentServerOperations.length > 30) {
    recentServerOperations.pop();
  }
}

/**
 * Mount Server-Side Multi-Device Sync Routes to Express app
 */
export function initServerSync(app: express.Express) {
  // 1. Full State Retrieval for Initial Hydration & Manual Refresh
  app.get("/api/sync", (_req, res) => {
    res.json({
      success: true,
      version: appStateVersion,
      timestamp: new Date().toISOString(),
      clientCount: sseClients.size,
      data: serverAppState
    });
  });

  // Admin Debug status and operations endpoint
  app.get("/api/sync/debug", (_req, res) => {
    const deletedList = Array.isArray(serverAppState.deletedEntityIds) ? serverAppState.deletedEntityIds : [];
    const activeCollections = Object.keys(serverAppState)
      .filter((k) => Array.isArray(serverAppState[k]) && k !== 'deletedEntityIds')
      .map((k) => ({ name: k, count: serverAppState[k].length }));

    res.json({
      success: true,
      version: appStateVersion,
      timestamp: new Date().toISOString(),
      clientCount: sseClients.size,
      totalDeletedTombstones: deletedList.length,
      sampleDeletedTombstones: deletedList.slice(-10),
      activeCollections,
      recentOperations: recentServerOperations.slice(0, 10)
    });
  });

  // 2. Patch Push endpoint (Called when ANY device makes ANY update)
  app.post("/api/sync", (req, res) => {
    try {
      let body = req.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {}
      }
      const { clientId, patch } = body || {};
      if (!patch || typeof patch !== "object" || Object.keys(patch).length === 0) {
        return res.json({ success: true, version: appStateVersion, clientCount: sseClients.size });
      }

      // Merge into authoritative state
      mergePatchIntoServerState(patch);
      if (patch._isRestore || patch._forceClear) {
        persistStateImmediately();
      }

      // Record operation for debug tracking
      const patchKeys = Object.keys(patch);
      const isDeleteOperation = Array.isArray(patch.deletedEntityIds) && patch.deletedEntityIds.length > 0;
      recordServerOperation({
        type: isDeleteOperation ? 'DELETE' : 'WRITE',
        clientId: clientId || undefined,
        slices: patchKeys,
        deletedIds: patch.deletedEntityIds,
        itemsCount: patchKeys.reduce((acc, k) => acc + (Array.isArray(patch[k]) ? patch[k].length : 1), 0),
        details: isDeleteOperation
          ? `Tombstoned ${patch.deletedEntityIds.length} deleted entity ID(s) and synced [${patchKeys.join(', ')}]`
          : `Updated [${patchKeys.join(', ')}] across state version ${appStateVersion}`
      });

      // Broadcast update to all other connected devices instantly
      broadcastSyncEvent({
        type: "sync_update",
        version: appStateVersion,
        senderId: clientId || null,
        patch: {
          ...patch,
          ...(serverAppState.itemsVersion ? { itemsVersion: serverAppState.itemsVersion } : {}),
          deletedEntityIds: serverAppState.deletedEntityIds
        }
      });

      return res.json({
        success: true,
        version: appStateVersion,
        timestamp: new Date().toISOString(),
        clientCount: sseClients.size
      });
    } catch (err: any) {
      console.error("[ServerSync Error on POST /api/sync]:", err);
      return res.status(500).json({ success: false, error: err?.message || "Sync error" });
    }
  });

  // Authoritative Items & Category Directory REST API (/api/items) for PC & Android parity
  const getAuthoritativeItemsPayload = () => ({
    success: true,
    version: appStateVersion,
    itemsVersion: Number(serverAppState.itemsVersion || 0),
    itemsCleared: Boolean(serverAppState._itemsCleared),
    items: Array.isArray(serverAppState.items) ? serverAppState.items : [],
    specialItems: Array.isArray(serverAppState.specialItems) ? serverAppState.specialItems : [],
    orderedCategories: Array.isArray(serverAppState.orderedCategories) ? serverAppState.orderedCategories : undefined,
    customCategories: Array.isArray(serverAppState.customCategories) ? serverAppState.customCategories : undefined,
    deletedCategories: Array.isArray(serverAppState.deletedCategories) ? serverAppState.deletedCategories : undefined,
    categoryNumbers: serverAppState.categoryNumbers && typeof serverAppState.categoryNumbers === "object" ? serverAppState.categoryNumbers : undefined,
    deletedEntityIds: Array.isArray(serverAppState.deletedEntityIds) ? serverAppState.deletedEntityIds : [],
    priceSnapshots: Array.isArray(serverAppState.priceSnapshots) ? serverAppState.priceSnapshots : undefined,
    activeEffectiveDate: serverAppState.activeEffectiveDate || undefined,
    timestamp: new Date().toISOString()
  });

  app.get("/api/items", (_req, res) => {
    try {
      return res.json(getAuthoritativeItemsPayload());
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Failed to load items" });
    }
  });

  const handleUpsertItemsApi = (req: express.Request, res: express.Response) => {
    try {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch {}
      }
      const {
        clientId,
        items: incomingItems,
        specialItems: incomingSpecialItems,
        replaceAll = true,
        orderedCategories,
        customCategories,
        deletedCategories,
        categoryNumbers,
        deletedIds,
        restoredIds,
        itemsVersion,
        priceSnapshots,
        activeEffectiveDate
      } = body || {};

      const isReplacing = replaceAll !== false;
      const itemsArr = Array.isArray(incomingItems) ? incomingItems : undefined;
      const isClearing = Boolean(itemsArr && itemsArr.length === 0 && isReplacing);
      const specialsArr = Array.isArray(incomingSpecialItems)
        ? incomingSpecialItems
        : (itemsArr ? itemsArr.filter((i: any) => i && i.isSpecialItem) : undefined);

      const patch: Record<string, any> = {
        ...(itemsArr !== undefined ? { items: itemsArr } : {}),
        ...(specialsArr !== undefined ? { specialItems: specialsArr } : {}),
        ...(Array.isArray(orderedCategories) ? { orderedCategories } : {}),
        ...(Array.isArray(customCategories) ? { customCategories } : {}),
        ...(Array.isArray(deletedCategories) ? { deletedCategories } : {}),
        ...(categoryNumbers && typeof categoryNumbers === "object" ? { categoryNumbers, _replaceCategoryNumbers: true } : {}),
        ...(Array.isArray(deletedIds) && deletedIds.length > 0 ? { deletedEntityIds: deletedIds } : {}),
        ...(Array.isArray(restoredIds) && restoredIds.length > 0 ? { restoredEntityIds: restoredIds } : {}),
        ...(Array.isArray(priceSnapshots) ? { priceSnapshots, price_snapshots: priceSnapshots, _replacePriceSnapshots: true } : {}),
        ...(typeof activeEffectiveDate === "string" && activeEffectiveDate.trim() ? { activeEffectiveDate: activeEffectiveDate.trim() } : {}),
        _replaceItems: isReplacing,
        _itemsCleared: isClearing,
        _forceEmpty: isClearing,
        _isDeleteOperation: isClearing || (Array.isArray(deletedIds) && deletedIds.length > 0),
        itemsVersion: Number(itemsVersion || 0) || Date.now()
      };

      mergePatchIntoServerState(patch);
      persistStateImmediately();

      recordServerOperation({
        type: isClearing ? "DELETE" : "WRITE",
        clientId: clientId || undefined,
        slices: Object.keys(patch).filter((k) => !k.startsWith("_")),
        deletedIds: Array.isArray(deletedIds) ? deletedIds : undefined,
        itemsCount: Array.isArray(serverAppState.items) ? serverAppState.items.length : 0,
        details: isClearing
          ? "Cleared all items cleanly via /api/items"
          : `Synced ${Array.isArray(serverAppState.items) ? serverAppState.items.length : 0} items via /api/items`
      });

      const responsePayload = getAuthoritativeItemsPayload();
      broadcastSyncEvent({
        type: "sync_update",
        version: appStateVersion,
        senderId: clientId || null,
        patch: {
          items: responsePayload.items,
          specialItems: responsePayload.specialItems,
          _replaceItems: true,
          _itemsCleared: responsePayload.itemsCleared,
          _forceEmpty: responsePayload.itemsCleared,
          itemsVersion: responsePayload.itemsVersion,
          ...(responsePayload.orderedCategories ? { orderedCategories: responsePayload.orderedCategories } : {}),
          ...(responsePayload.customCategories ? { customCategories: responsePayload.customCategories } : {}),
          ...(responsePayload.deletedCategories ? { deletedCategories: responsePayload.deletedCategories } : {}),
          ...(responsePayload.categoryNumbers ? { categoryNumbers: responsePayload.categoryNumbers } : {}),
          ...(Array.isArray(priceSnapshots) ? { priceSnapshots, price_snapshots: priceSnapshots, _replacePriceSnapshots: true } : {}),
          deletedEntityIds: responsePayload.deletedEntityIds
        }
      });

      return res.json(responsePayload);
    } catch (err: any) {
      console.error("[ServerSync Error on /api/items]:", err);
      return res.status(500).json({ success: false, error: err?.message || "Items API error" });
    }
  };

  app.post("/api/items", handleUpsertItemsApi);
  app.put("/api/items", handleUpsertItemsApi);

  const handleClearOrDeleteItemsApi = (req: express.Request, res: express.Response) => {
    try {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch {}
      }
      const { clientId, ids, clearAll, clearAllItems } = body || {};
      const idsList: string[] = Array.isArray(ids) ? ids.map((x: any) => String(x || "").trim()).filter(Boolean) : [];
      const shouldClearAll = Boolean(clearAll ?? clearAllItems) || (req.method === "DELETE" && idsList.length === 0);

      if (shouldClearAll) {
        mergePatchIntoServerState({
          items: [],
          specialItems: [],
          deletedEntityIds: idsList,
          _replaceItems: true,
          _forceEmpty: true,
          _itemsCleared: true,
          _isDeleteOperation: true,
          itemsVersion: Date.now()
        });
      } else if (idsList.length > 0) {
        const idSet = new Set(idsList.map((x) => x.toLowerCase()));
        const remaining = (Array.isArray(serverAppState.items) ? serverAppState.items : []).filter(
          (it: any) => it && !idSet.has(String(it.id || "").toLowerCase().trim())
        );
        const remainingSpecials = remaining.filter((it: any) => it && it.isSpecialItem);
        const nowEmpty = remaining.length === 0;
        mergePatchIntoServerState({
          items: remaining,
          specialItems: remainingSpecials,
          deletedEntityIds: idsList,
          _replaceItems: true,
          _forceEmpty: nowEmpty,
          _itemsCleared: nowEmpty,
          _isDeleteOperation: true,
          itemsVersion: Date.now()
        });
      }

      persistStateImmediately();

      const responsePayload = getAuthoritativeItemsPayload();
      broadcastSyncEvent({
        type: "sync_delete",
        version: appStateVersion,
        senderId: clientId || null,
        deletedEntityIds: idsList,
        entityType: "item",
        itemsVersion: responsePayload.itemsVersion,
        itemsCleared: responsePayload.itemsCleared
      });

      return res.json(responsePayload);
    } catch (err: any) {
      console.error("[ServerSync Error on DELETE /api/items]:", err);
      return res.status(500).json({ success: false, error: err?.message || "Failed to delete items" });
    }
  };

  app.post("/api/items/clear", handleClearOrDeleteItemsApi);
  app.delete("/api/items", handleClearOrDeleteItemsApi);

  // Dedicated Authoritative Delete endpoint
  app.post("/api/sync/delete", (req, res) => {
    try {
      const { clientId, id, ids, type, clearAllItems } = req.body || {};
      const toDeleteList: string[] = Array.isArray(ids) ? ids : (id ? [String(id)] : []);
      if (toDeleteList.length === 0 && !clearAllItems) {
        return res.json({ success: true, version: appStateVersion, clientCount: sseClients.size });
      }

      mergePatchIntoServerState({
        deletedEntityIds: toDeleteList,
        ...(clearAllItems
          ? { items: [], specialItems: [], _forceEmpty: true, _itemsCleared: true }
          : {}),
        _isDeleteOperation: true
      });
      // Immediately write state to disk without waiting for debounce
      persistStateImmediately();

      if (type === "item" || clearAllItems) {
        serverAppState.itemsVersion = Date.now();
        if (Array.isArray(serverAppState.items) && serverAppState.items.length === 0) {
          serverAppState._itemsCleared = true;
          serverAppState.specialItems = [];
        }
        persistStateImmediately();
      }

      // Record delete operation for debug tracking
      recordServerOperation({
        type: 'DELETE',
        clientId: clientId || undefined,
        deletedIds: toDeleteList,
        details: `Purged ${toDeleteList.length} entity ID(s) across server disk/memory collections (${type || 'entity'}).`
      });

      broadcastSyncEvent({
        type: "sync_delete",
        version: appStateVersion,
        senderId: clientId || null,
        deletedEntityIds: toDeleteList,
        entityType: type || null,
        ...(type === "item" || clearAllItems ? { itemsVersion: serverAppState.itemsVersion } : {}),
        itemsCleared: type === "item" || clearAllItems ? Boolean(serverAppState._itemsCleared) : undefined
      });

      return res.json({
        success: true,
        version: appStateVersion,
        deletedCount: toDeleteList.length,
        timestamp: new Date().toISOString(),
        clientCount: sseClients.size
      });
    } catch (err: any) {
      console.error("[ServerSync Error on POST /api/sync/delete]:", err);
      return res.status(500).json({ success: false, error: err?.message || "Delete error" });
    }
  });

  // Dedicated Authoritative Restore endpoint
  app.post("/api/sync/restore", (req, res) => {
    try {
      const { clientId, id, ids, type, restoredItems } = req.body || {};
      const toRestoreList: string[] = Array.isArray(ids) ? ids : (id ? [String(id)] : []);
      if (toRestoreList.length === 0 && !restoredItems) {
        return res.json({ success: true, version: appStateVersion, clientCount: sseClients.size });
      }

      const isFullRestore = type === 'all' || Boolean(restoredItems?._forceClear);
      const safeRestoredObj: Record<string, any> =
        restoredItems && typeof restoredItems === 'object' ? { ...restoredItems } : {};
      if (!isFullRestore) {
        delete safeRestoredObj._forceClear;
        delete safeRestoredObj._replaceAll;
        delete safeRestoredObj.deletedEntityIds;
      }
      const extraRestoredIds = Array.isArray(safeRestoredObj.restoredEntityIds) ? safeRestoredObj.restoredEntityIds : [];
      const mergedRestoredIds = Array.from(
        new Set([...toRestoreList, ...extraRestoredIds].map((x) => String(x).trim()).filter(Boolean))
      );
      delete safeRestoredObj.restoredEntityIds;

      mergePatchIntoServerState({
        _isRestore: true,
        ...(isFullRestore ? { _forceClear: true, _replaceAll: true, deletedEntityIds: [] } : {}),
        ...safeRestoredObj,
        restoredEntityIds: mergedRestoredIds
      });
      persistStateImmediately();

      recordServerOperation({
        type: 'RESTORE',
        clientId: clientId || undefined,
        restoredIds: mergedRestoredIds,
        details: isFullRestore
          ? `Full restore cleared tombstones.`
          : `Restored ${mergedRestoredIds.length} entity ID(s) while preserving remaining tombstones.`
      });

      broadcastSyncEvent({
        type: "sync_restore",
        version: appStateVersion,
        senderId: clientId || null,
        restoredEntityIds: mergedRestoredIds,
        entityType: type || null,
        restoredItems: Object.keys(safeRestoredObj).length > 0 ? safeRestoredObj : null
      });

      return res.json({
        success: true,
        version: appStateVersion,
        restoredCount: toRestoreList.length,
        timestamp: new Date().toISOString(),
        clientCount: sseClients.size
      });
    } catch (err: any) {
      console.error("[ServerSync Error on POST /api/sync/restore]:", err);
      return res.status(500).json({ success: false, error: err?.message || "Restore error" });
    }
  });

  // Dedicated Auto-Recovery and Self-Healing Repair endpoint
  app.post("/api/sync/repair", (req, res) => {
    try {
      const { localDeletedIds } = req.body || {};
      const deletedList = Array.isArray(serverAppState.deletedEntityIds) ? [...serverAppState.deletedEntityIds] : [];
      if (Array.isArray(localDeletedIds)) {
        for (const id of localDeletedIds) {
          const s = String(id || '').trim();
          if (s && s.length > 1 && !/^\d{1,5}$/.test(s) && !deletedList.includes(s)) {
            deletedList.push(s);
          }
        }
        serverAppState.deletedEntityIds = deletedList;
      }

      const deletedSet = new Set(deletedList.map((x) => String(x).toLowerCase().trim()));
      let purgedCount = 0;

      // Purge any phantom deleted records lingering in any collection
      for (const [arrKey, arrVal] of Object.entries(serverAppState)) {
        if (Array.isArray(arrVal) && arrKey !== "deletedEntityIds" && arrKey !== "bankList" && arrKey !== "accountList") {
          const beforeLen = arrVal.length;
          serverAppState[arrKey] = arrVal.filter((itm: any) => {
            if (!itm || typeof itm !== 'object') return true;
            const cId = String(itm.id || itm._id || '').toLowerCase().trim();
            if (cId && deletedSet.has(cId)) return false;
            return true;
          });
          const removed = beforeLen - serverAppState[arrKey].length;
          purgedCount += removed;
        }
      }

      // Deduplicate stored bills by unique ID
      if (Array.isArray(serverAppState.storedBills)) {
        const seen = new Set<string>();
        const deduped: any[] = [];
        for (const b of serverAppState.storedBills) {
          if (!b || !b.id) continue;
          const k = String(b.id).trim();
          if (!seen.has(k) && !deletedSet.has(k.toLowerCase())) {
            seen.add(k);
            deduped.push(b);
          }
        }
        serverAppState.storedBills = deduped;
        serverAppState.stored_bills = deduped;
      }

      // Sync dual aliases
      if (serverAppState.factoryImports) serverAppState.factory_imports = serverAppState.factoryImports;
      if (serverAppState.deliveryChallans) serverAppState.delivery_challans = serverAppState.deliveryChallans;
      if (serverAppState.bankDeposits) serverAppState.bank_deposits = serverAppState.bankDeposits;
      if (serverAppState.stockReturns) serverAppState.stock_returns = serverAppState.stockReturns;
      if (serverAppState.conveyances) serverAppState.conveyance_entries = serverAppState.conveyances;

      persistStateImmediately();
      appStateVersion = Date.now();

      broadcastSyncEvent({
        type: "sync_update",
        version: appStateVersion,
        patch: {
          storedBills: serverAppState.storedBills || [],
          deletedEntityIds: serverAppState.deletedEntityIds || []
        }
      });

      return res.json({
        success: true,
        purgedCount,
        totalBills: (serverAppState.storedBills || []).length,
        totalDeletedTombstones: (serverAppState.deletedEntityIds || []).length,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error("[ServerSync Error on POST /api/sync/repair]:", err);
      return res.status(500).json({ success: false, error: err?.message || "Repair error" });
    }
  });

  // 3. Server-Sent Events (SSE) Live Stream for Multi-Device Real-Time Synchronization
  app.get("/api/sync/stream", (req, res) => {
    // Keep-alive headers for SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    (res as any).flushHeaders?.();

    sseClients.add(res);

    // Initial connection event
    res.write(
      `event: connected\ndata: ${JSON.stringify({
        type: "connected",
        version: appStateVersion,
        clientCount: sseClients.size,
        serverTime: new Date().toISOString()
      })}\n\n`
    );
    (res as any).flush?.();

    // Periodic SSE heartbeat keeps mobile carrier NAT & Cloud Run HTTP proxies alive
    const heartbeatTimer = setInterval(() => {
      try {
        if ((res as any).writableEnded || (res as any).destroyed) {
          clearInterval(heartbeatTimer);
          sseClients.delete(res);
          return;
        }
        res.write(`: keepalive ${Date.now()}\n\n`);
        (res as any).flush?.();
      } catch {
        clearInterval(heartbeatTimer);
        sseClients.delete(res);
      }
    }, 20000);

    const cleanupSse = () => {
      clearInterval(heartbeatTimer);
      sseClients.delete(res);
    };

    req.on("close", cleanupSse);
    req.on("error", cleanupSse);
    res.on("close", cleanupSse);
  });

  // 4. Lightweight Version & Status check
  app.get("/api/sync/status", (_req, res) => {
    res.json({
      status: "online",
      version: appStateVersion,
      clientCount: sseClients.size,
      itemsCount: Array.isArray(serverAppState.items) ? serverAppState.items.length : 0,
      partiesCount: Array.isArray(serverAppState.parties) ? serverAppState.parties.length : 0,
      billsCount: Array.isArray(serverAppState.storedBills) ? serverAppState.storedBills.length : 0,
      salespersonsCount: Array.isArray(serverAppState.salespersons) ? serverAppState.salespersons.length : 0,
      collectionsCount: Array.isArray(serverAppState.collections) ? serverAppState.collections.length : 0,
      expensesCount: Array.isArray(serverAppState.expenses) ? serverAppState.expenses.length : 0,
      conveyancesCount: Array.isArray(serverAppState.conveyances) ? serverAppState.conveyances.length : 0,
      branchesCount: Array.isArray(serverAppState.branches) ? serverAppState.branches.length : 0
    });
  });

  // 4b. Secondary Cloud Fallback Proxy: Supabase PostgREST Sync (when configured via env)
  const getServerSupabaseConfig = () => {
    const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim().replace(/\/+$/, "");
    const key = String(
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_ANON_KEY ||
        process.env.VITE_SUPABASE_ANON_KEY ||
        ""
    ).trim();
    const table = String(process.env.SUPABASE_SYNC_TABLE || "app_sync_store").trim() || "app_sync_store";
    return { url, key, table, configured: Boolean(url && key && /^https?:\/\//i.test(url)) };
  };

  app.get("/api/sync/supabase/health", async (_req, res) => {
    const cfg = getServerSupabaseConfig();
    if (!cfg.configured) {
      return res.json({ configured: false, reachable: false, reason: "supabase_not_configured" });
    }
    try {
      const probeRes = await fetch(`${cfg.url}/rest/v1/${encodeURIComponent(cfg.table)}?select=slice_key&limit=1`, {
        method: "GET",
        headers: {
          apikey: cfg.key,
          Authorization: `Bearer ${cfg.key}`,
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(4500)
      });
      if (!probeRes.ok) {
        return res.json({
          configured: true,
          reachable: false,
          status: probeRes.status,
          reason: `supabase_http_${probeRes.status}`
        });
      }
      return res.json({ configured: true, reachable: true });
    } catch (err: any) {
      return res.json({
        configured: true,
        reachable: false,
        reason: err?.message || "supabase_unreachable"
      });
    }
  });

  app.get("/api/sync/supabase", async (_req, res) => {
    const cfg = getServerSupabaseConfig();
    if (!cfg.configured) {
      return res.json({ success: false, configured: false, data: null });
    }
    try {
      const fetchRes = await fetch(
        `${cfg.url}/rest/v1/${encodeURIComponent(cfg.table)}?select=slice_key,value,version,updated_at,sender_id`,
        {
          method: "GET",
          headers: {
            apikey: cfg.key,
            Authorization: `Bearer ${cfg.key}`,
            Accept: "application/json"
          },
          signal: AbortSignal.timeout(8000)
        }
      );
      if (!fetchRes.ok) {
        return res.json({ success: false, configured: true, status: fetchRes.status, data: null });
      }
      const rows = await fetchRes.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.json({ success: true, configured: true, data: null });
      }
      const assembled: Record<string, any> = {};
      let maxVer = 0;
      for (const row of rows) {
        if (!row || !row.slice_key) continue;
        assembled[String(row.slice_key)] = row.value;
        const v = Number(row.version || 0);
        if (v > maxVer) maxVer = v;
      }
      return res.json({
        success: true,
        configured: true,
        version: maxVer || Date.now(),
        data: assembled
      });
    } catch (err: any) {
      return res.json({
        success: false,
        configured: true,
        error: err?.message || "supabase_fetch_failed",
        data: null
      });
    }
  });

  app.post("/api/sync/supabase", async (req, res) => {
    const cfg = getServerSupabaseConfig();
    if (!cfg.configured) {
      return res.json({ success: false, configured: false, reason: "supabase_not_configured" });
    }
    try {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch {}
      }
      const { clientId, patch } = body || {};
      if (!patch || typeof patch !== "object" || Object.keys(patch).length === 0) {
        return res.json({ success: true, configured: true, syncedSlices: 0 });
      }
      const nowVer = Date.now();
      const nowIso = new Date(nowVer).toISOString();
      const rows: Array<{ slice_key: string; value: any; version: number; updated_at: string; sender_id: string }> = [];
      for (const [k, v] of Object.entries(patch)) {
        if (!k || (k.startsWith("_") && k !== "_itemsCleared")) continue;
        if (v === undefined) continue;
        rows.push({
          slice_key: k,
          value: v,
          version: nowVer,
          updated_at: nowIso,
          sender_id: String(clientId || "server")
        });
      }
      if (rows.length === 0) {
        return res.json({ success: true, configured: true, syncedSlices: 0 });
      }
      const upsertRes = await fetch(
        `${cfg.url}/rest/v1/${encodeURIComponent(cfg.table)}?on_conflict=slice_key`,
        {
          method: "POST",
          headers: {
            apikey: cfg.key,
            Authorization: `Bearer ${cfg.key}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=minimal"
          },
          body: JSON.stringify(rows),
          signal: AbortSignal.timeout(8000)
        }
      );
      if (!upsertRes.ok) {
        return res.json({
          success: false,
          configured: true,
          status: upsertRes.status,
          error: `supabase_http_${upsertRes.status}`
        });
      }
      return res.json({
        success: true,
        configured: true,
        version: nowVer,
        syncedSlices: rows.length
      });
    } catch (err: any) {
      return res.json({
        success: false,
        configured: true,
        error: err?.message || "supabase_push_failed"
      });
    }
  });

  // 4c. Multi-Cloud Failover Node Proxy: Dispatches strictly to configured remote secondary cloud nodes
  const resolveCloudNodeEndpoint = (node: Record<string, any> | undefined) => {
    const provider = String(node?.provider || "").toLowerCase();
    const envUrlMap: Record<string, string> = {
      firebase: String(process.env.FIREBASE_SECONDARY_DATABASE_URL || "").trim(),
      backblaze_b2: String(process.env.BACKBLAZE_B2_ENDPOINT || process.env.BACKBLAZE_B2_WEBHOOK_URL || "").trim(),
      cloudflare_r2: String(process.env.CLOUDFLARE_R2_ENDPOINT || process.env.CLOUDFLARE_R2_WEBHOOK_URL || "").trim(),
      google_cloud: String(process.env.GCS_SYNC_URL || "").trim(),
      aws_s3: String(process.env.AWS_S3_ENDPOINT || process.env.AWS_S3_SYNC_URL || "").trim(),
      appwrite: String(process.env.APPWRITE_ENDPOINT || "").trim(),
      neon: String(process.env.NEON_REST_URL || "").trim(),
      custom_api: String(process.env.CUSTOM_CLOUD_SYNC_URL || "").trim()
    };
    const envKeyMap: Record<string, string> = {
      firebase: String(process.env.FIREBASE_SECONDARY_API_KEY || "").trim(),
      backblaze_b2: String(process.env.BACKBLAZE_B2_API_KEY || "").trim(),
      cloudflare_r2: String(process.env.CLOUDFLARE_R2_API_KEY || "").trim(),
      google_cloud: String(process.env.GCS_SYNC_API_KEY || "").trim(),
      aws_s3: String(process.env.AWS_S3_API_KEY || "").trim(),
      appwrite: String(process.env.APPWRITE_API_KEY || "").trim(),
      neon: String(process.env.NEON_API_KEY || "").trim(),
      custom_api: String(process.env.CUSTOM_CLOUD_SYNC_API_KEY || "").trim()
    };
    const nodeUrl = String(node?.databaseUrl || "").trim();
    const nodeKey = String(node?.apiKey || "").trim();
    const url = envUrlMap[provider] || nodeUrl;
    const apiKey = envKeyMap[provider] || nodeKey;
    return { provider, url: url.replace(/\/+$/, ""), apiKey };
  };

  app.post("/api/sync/cloud-node", async (req, res) => {
    try {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch {}
      }
      const { node, clientId, patch } = body || {};
      const resolved = resolveCloudNodeEndpoint(node);
      if (!resolved.url || !/^https?:\/\//i.test(resolved.url)) {
        return res.json({ success: false, configured: false, reason: "node_url_not_configured" });
      }
      if (!patch || typeof patch !== "object" || Object.keys(patch).length === 0) {
        return res.json({ success: true, configured: true });
      }

      if (resolved.provider === "firebase") {
        const authSuffix = resolved.apiKey ? `?auth=${encodeURIComponent(resolved.apiKey)}` : "";
        const rtdbUrl = `${resolved.url}/polycables_sync.json${authSuffix}`;
        const cleanPatch: Record<string, any> = {
          _updatedAt: new Date().toISOString(),
          _senderId: String(clientId || "server")
        };
        for (const [k, v] of Object.entries(patch)) {
          if (!k || (k.startsWith("_") && k !== "_itemsCleared")) continue;
          if (v !== undefined) cleanPatch[k] = v;
        }
        const fbRes = await fetch(rtdbUrl, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cleanPatch),
          signal: AbortSignal.timeout(4500)
        });
        if (!fbRes.ok) {
          return res.json({ success: false, configured: true, status: fbRes.status, reason: `firebase_node_http_${fbRes.status}` });
        }
        return res.json({ success: true, configured: true, provider: "firebase", nodeId: node?.id });
      }

      // Appwrite, B2, R2, GCS, S3, Neon, Custom REST endpoints require an API key or server env endpoint
      const hasEnvOverride = Boolean(
        process.env.BACKBLAZE_B2_ENDPOINT ||
        process.env.BACKBLAZE_B2_WEBHOOK_URL ||
        process.env.CLOUDFLARE_R2_ENDPOINT ||
        process.env.CLOUDFLARE_R2_WEBHOOK_URL ||
        process.env.GCS_SYNC_URL ||
        process.env.AWS_S3_ENDPOINT ||
        process.env.AWS_S3_SYNC_URL ||
        process.env.APPWRITE_ENDPOINT ||
        process.env.NEON_REST_URL ||
        process.env.CUSTOM_CLOUD_SYNC_URL
      );
      if (!resolved.apiKey && !hasEnvOverride) {
        return res.json({ success: false, configured: false, reason: "node_credentials_not_configured" });
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (resolved.apiKey) {
        if (resolved.provider === "appwrite") {
          headers["X-Appwrite-Key"] = resolved.apiKey;
          if (node?.projectId) headers["X-Appwrite-Project"] = String(node.projectId);
        } else {
          headers["Authorization"] = `Bearer ${resolved.apiKey}`;
          headers["x-api-key"] = resolved.apiKey;
        }
      }

      const remoteRes = await fetch(resolved.url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          clientId: String(clientId || "server"),
          nodeId: node?.id,
          provider: resolved.provider,
          updatedAt: new Date().toISOString(),
          patch
        }),
        signal: AbortSignal.timeout(5000)
      });
      if (!remoteRes.ok) {
        return res.json({ success: false, configured: true, status: remoteRes.status, reason: `node_http_${remoteRes.status}` });
      }
      return res.json({ success: true, configured: true, provider: resolved.provider, nodeId: node?.id });
    } catch (err: any) {
      return res.json({ success: false, configured: true, error: err?.message || "cloud_node_unreachable" });
    }
  });

  app.post("/api/sync/cloud-node/pull", async (req, res) => {
    try {
      const { node } = req.body || {};
      const resolved = resolveCloudNodeEndpoint(node);
      if (!resolved.url || !/^https?:\/\//i.test(resolved.url)) {
        return res.json({ success: false, configured: false, data: null });
      }
      if (resolved.provider === "firebase") {
        const authSuffix = resolved.apiKey ? `?auth=${encodeURIComponent(resolved.apiKey)}` : "";
        const fbRes = await fetch(`${resolved.url}/polycables_sync.json${authSuffix}`, {
          method: "GET",
          signal: AbortSignal.timeout(5000)
        });
        if (!fbRes.ok) {
          return res.json({ success: false, configured: true, data: null });
        }
        const data = await fbRes.json().catch(() => null);
        return res.json({ success: true, configured: true, data: data && typeof data === "object" ? data : null });
      }
      if (!resolved.apiKey) {
        return res.json({ success: false, configured: false, data: null });
      }
      const headers: Record<string, string> = { Accept: "application/json" };
      if (resolved.provider === "appwrite") {
        headers["X-Appwrite-Key"] = resolved.apiKey;
        if (node?.projectId) headers["X-Appwrite-Project"] = String(node.projectId);
      } else {
        headers["Authorization"] = `Bearer ${resolved.apiKey}`;
        headers["x-api-key"] = resolved.apiKey;
      }
      const remoteRes = await fetch(resolved.url, { method: "GET", headers, signal: AbortSignal.timeout(5000) });
      if (!remoteRes.ok) {
        return res.json({ success: false, configured: true, data: null });
      }
      const json = await remoteRes.json().catch(() => null);
      const data = json?.data && typeof json.data === "object" ? json.data : (json && typeof json === "object" ? json : null);
      return res.json({ success: true, configured: true, data });
    } catch {
      return res.json({ success: false, configured: true, data: null });
    }
  });

  // 4d. Unified Multi-Account Cloud Failover State across all PC and Mobile devices
  app.get("/api/sync/cloud-failover", (_req, res) => {
    try {
      return res.json({
        success: true,
        config: serverAppState._cloudFailoverState || null,
        updatedAt: serverAppState._cloudFailoverUpdatedAt || null
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Failed to load failover config" });
    }
  });

  app.post("/api/sync/cloud-failover", (req, res) => {
    try {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch {}
      }
      const { clientId, config } = body || {};
      if (!config || typeof config !== "object") {
        return res.status(400).json({ success: false, error: "Invalid cloud failover config" });
      }
      const nowIso = new Date().toISOString();
      serverAppState._cloudFailoverState = config;
      serverAppState._cloudFailoverUpdatedAt = nowIso;
      hasPendingDiskWrite = true;
      scheduleStateSave();

      broadcastSyncEvent({
        type: "cloud_failover_update",
        version: appStateVersion,
        senderId: clientId || null,
        config,
        updatedAt: nowIso
      });

      return res.json({ success: true, updatedAt: nowIso, clientCount: sseClients.size });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Failed to save failover config" });
    }
  });

  // In-memory online user presence tracker
  const activePresenceMap = new Map<string, {
    userId: string;
    username: string;
    name?: string;
    role?: string;
    branchName?: string;
    lastSeen: number;
  }>();

  function getActiveOnlineUsers() {
    const now = Date.now();
    const timeoutMs = 60000; // 60 seconds
    for (const [key, val] of activePresenceMap.entries()) {
      if (now - val.lastSeen > timeoutMs) {
        activePresenceMap.delete(key);
      }
    }
    return Array.from(activePresenceMap.values());
  }

  // Presence Heartbeat endpoint
  app.post("/api/presence/heartbeat", (req, res) => {
    try {
      const { userId, username, name, role, branchName } = req.body || {};
      const key = String(userId || username || 'anonymous').trim().toLowerCase();
      if (key) {
        activePresenceMap.set(key, {
          userId: String(userId || key),
          username: String(username || key),
          name: name ? String(name) : undefined,
          role: role ? String(role) : undefined,
          branchName: branchName ? String(branchName) : undefined,
          lastSeen: Date.now()
        });
      }
      const activeUsers = getActiveOnlineUsers();
      res.json({ success: true, count: activeUsers.length, users: activeUsers });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e?.message || "Presence error" });
    }
  });

  // Get active online users count & details (for Admin / Super Admin)
  app.get("/api/presence", (_req, res) => {
    try {
      const activeUsers = getActiveOnlineUsers();
      res.json({ success: true, count: activeUsers.length, users: activeUsers });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e?.message || "Presence error" });
    }
  });

  // 5. Keepalive ping every 20 seconds so browsers and proxies don't close idle SSE connections
  setInterval(() => {
    for (const client of sseClients) {
      try {
        client.write(": keepalive\n\n");
      } catch {
        sseClients.delete(client);
      }
    }
  }, 20000);

  // 6. Automated Daily Cloud Backup Endpoints
  app.post("/api/backups/automated", (req, res) => {
    try {
      let body = req.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {}
      }
      const { dateKey, backup, force } = body || {};
      const key = dateKey || new Date().toISOString().slice(0, 10);
      const targetFile = path.join(AUTO_BACKUP_DIR, `backup-${key}.json`);

      // If already backed up today and not forced, return existing status
      if (fs.existsSync(targetFile) && !force) {
        const stats = fs.statSync(targetFile);
        return res.json({
          success: true,
          dateKey: key,
          alreadyExisted: true,
          timestamp: stats.mtime.toISOString(),
          sizeBytes: stats.size,
          message: `Backup for ${key} already exists on cloud server.`
        });
      }

      const backupData = backup || {
        version: "2.0.0",
        backupDate: new Date().toISOString(),
        backupType: "automated_daily",
        appTitle: "Polycables Store & Billing ERP - Automated Daily Backup",
        data: serverAppState
      };

      const serialized = JSON.stringify(backupData, null, 2);
      fs.writeFileSync(targetFile, serialized, "utf-8");

      // Update manifest
      const manifestFile = path.join(AUTO_BACKUP_DIR, "manifest.json");
      let manifest: Record<string, any> = { history: [] };
      if (fs.existsSync(manifestFile)) {
        try {
          manifest = JSON.parse(fs.readFileSync(manifestFile, "utf-8"));
        } catch {}
      }
      const history = Array.isArray(manifest.history) ? manifest.history : [];
      const updatedHistory = [
        {
          dateKey: key,
          timestamp: new Date().toISOString(),
          filename: `backup-${key}.json`,
          sizeBytes: Buffer.byteLength(serialized, "utf-8"),
          recordCount: Object.keys(backupData.data || {}).reduce((acc: number, k: string) => {
            const val = backupData.data[k];
            return acc + (Array.isArray(val) ? val.length : 1);
          }, 0)
        },
        ...history.filter((h: any) => h.dateKey !== key)
      ].slice(0, 30); // Keep last 30 daily snapshots

      manifest = {
        lastBackupDate: key,
        lastBackupTimestamp: new Date().toISOString(),
        totalSnapshots: updatedHistory.length,
        history: updatedHistory
      };
      fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), "utf-8");

      return res.json({
        success: true,
        dateKey: key,
        timestamp: manifest.lastBackupTimestamp,
        sizeBytes: Buffer.byteLength(serialized, "utf-8"),
        totalSnapshots: updatedHistory.length
      });
    } catch (err: any) {
      console.error("[ServerSync Error on POST /api/backups/automated]:", err);
      return res.status(500).json({ success: false, error: err?.message || "Automated backup error" });
    }
  });

  app.get("/api/backups/automated", (_req, res) => {
    try {
      const manifestFile = path.join(AUTO_BACKUP_DIR, "manifest.json");
      if (fs.existsSync(manifestFile)) {
        const raw = fs.readFileSync(manifestFile, "utf-8");
        return res.json({ success: true, ...JSON.parse(raw) });
      }
      return res.json({ success: true, history: [], totalSnapshots: 0 });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Failed to read manifest" });
    }
  });

  app.get("/api/backups/automated/:dateKey", (req, res) => {
    try {
      const key = req.params.dateKey;
      const targetFile = path.join(AUTO_BACKUP_DIR, `backup-${key}.json`);
      if (fs.existsSync(targetFile)) {
        res.setHeader("Content-Disposition", `attachment; filename=backup-${key}.json`);
        res.setHeader("Content-Type", "application/json");
        return fs.createReadStream(targetFile).pipe(res);
      }
      return res.status(404).json({ success: false, error: `No backup found for date ${key}` });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Failed to load backup" });
    }
  });

  console.log("[ServerSync] Real-time multi-device sync hub initialized on /api/sync and /api/sync/stream");
}
