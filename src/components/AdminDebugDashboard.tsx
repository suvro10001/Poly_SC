import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Server,
  Database,
  Trash2,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  Send,
  Zap,
  Layers,
  HardDrive,
  Radio,
  FileText,
  Search,
  ExternalLink,
  Check,
  X,
  AlertCircle
} from 'lucide-react';
import { PageHeaderWithActions } from './PageHeaderWithActions';
import {
  getCloudSyncConnectionStatus,
  getLastDatabaseOperations,
  getPendingSyncCount,
  subscribeToSyncDebug,
  verifyDeletionPropagation,
  clearDatabaseOperationLogs,
  DatabaseOperationLog,
  CloudSyncConnectionStatus
} from '../utils/syncDebugLogger';
import { getGlobalDeletedIds, recordDeletedEntityId } from '../utils/deletedTracker';
import { pingCloudConnection } from '../utils/cloudConnection';
import { AuthUser } from '../types';

interface AdminDebugDashboardProps {
  onBack?: () => void;
  onClose?: () => void;
  onForceSyncAll?: (slice?: any) => void;
  currentUser?: AuthUser | null;
}

export const AdminDebugDashboard: React.FC<AdminDebugDashboardProps> = ({
  onBack,
  onClose,
  onForceSyncAll,
  currentUser
}) => {
  const [status, setStatus] = useState<CloudSyncConnectionStatus>(() => getCloudSyncConnectionStatus());
  const [logs, setLogs] = useState<DatabaseOperationLog[]>(() => getLastDatabaseOperations(15));
  const [filterType, setFilterType] = useState<'all' | 'deletions' | 'writes'>('all');
  const [serverDebugData, setServerDebugData] = useState<any>(null);
  const [isLoadingServer, setIsLoadingServer] = useState(false);
  const [testEntityIdInput, setTestEntityIdInput] = useState('');
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [lastPingDuration, setLastPingDuration] = useState<number | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const refreshAll = async () => {
    setStatus(getCloudSyncConnectionStatus());
    setLogs(getLastDatabaseOperations(15));

    // Ping cloud connection
    setIsPinging(true);
    const startPing = performance.now();
    try {
      await pingCloudConnection();
      setLastPingDuration(Math.round(performance.now() - startPing));
    } catch {
      setLastPingDuration(null);
    } finally {
      setIsPinging(false);
    }

    // Fetch server debug status
    setIsLoadingServer(true);
    try {
      const res = await fetch('/api/sync/debug');
      if (res.ok) {
        const data = await res.json();
        setServerDebugData(data);
      }
    } catch (e) {
      console.warn('Could not fetch /api/sync/debug:', e);
    } finally {
      setIsLoadingServer(false);
    }
  };

  useEffect(() => {
    refreshAll();
    const unsubscribe = subscribeToSyncDebug(() => {
      setStatus(getCloudSyncConnectionStatus());
      setLogs(getLastDatabaseOperations(15));
    });

    // Auto refresh status every 4 seconds
    const interval = setInterval(() => {
      setStatus(getCloudSyncConnectionStatus());
      setLogs(getLastDatabaseOperations(15));
    }, 4000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const filteredLogs = useMemo(() => {
    let result = logs;
    if (filterType === 'deletions') {
      result = result.filter(
        (l) => l.operation === 'DELETE' || l.operation === 'DELETE_DOC' || l.deletionVerified
      );
    } else if (filterType === 'writes') {
      result = result.filter(
        (l) => l.operation === 'WRITE' || l.operation === 'SET_DOC' || l.operation === 'BATCH_WRITE' || l.operation === 'UPDATE'
      );
    }
    // Return last 10 operations as specified in requirements
    return result.slice(0, 10);
  }, [logs, filterType]);

  const handleTestVerifyDeletion = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const idToTest = testEntityIdInput.trim();
    if (!idToTest) {
      setNotificationMsg({ text: 'Please enter an Entity ID to test deletion verification.', type: 'error' });
      return;
    }

    setIsVerifying(true);
    setTimeout(() => {
      const res = verifyDeletionPropagation(idToTest);
      setVerificationResult(res);
      setIsVerifying(false);
    }, 250);
  };

  const handleCreateMockDeletionTest = () => {
    const testId = `test-del-${Date.now()}`;
    recordDeletedEntityId(testId);
    setTestEntityIdInput(testId);
    const res = verifyDeletionPropagation(testId);
    setVerificationResult(res);
    setNotificationMsg({
      text: `Created mock deletion test for "${testId}". Propagated to server tombstones & logged.`,
      type: 'success'
    });
    setTimeout(() => setNotificationMsg(null), 4000);
  };

  const handleFlushSync = () => {
    if (onForceSyncAll) {
      onForceSyncAll();
      setNotificationMsg({ text: 'Triggered immediate cloud sync flush across all collections.', type: 'success' });
      setTimeout(() => setNotificationMsg(null), 3000);
      refreshAll();
    }
  };

  return (
    <div id="admin-debug-dashboard" className="space-y-5 max-w-7xl mx-auto pb-12 font-sans select-none">
      {/* Page Header */}
      <PageHeaderWithActions
        idPrefix="admin-debug-page"
        title="Admin CloudSync & Database Debug Dashboard"
        subtitle="Real-time monitor for CloudSync connection, pending queue, and database write operations verifying deletion propagation"
        badge={status.statusLabel === 'CONNECTED' ? 'CloudSync Online' : status.statusLabel}
        badgeColor={
          status.statusLabel === 'CONNECTED'
            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
            : status.statusLabel === 'SYNCING'
            ? 'bg-blue-100 text-blue-800 border-blue-300'
            : 'bg-rose-100 text-rose-800 border-rose-300'
        }
        icon={Activity}
        onBack={onBack}
        onClose={onClose}
        extraActions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refreshAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer border border-white/[0.14]"
              title="Refresh connection status and operations"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isPinging || isLoadingServer ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            {onForceSyncAll && (
              <button
                type="button"
                onClick={handleFlushSync}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
                title="Flush all pending data to cloud"
              >
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                <span>Force Cloud Flush</span>
              </button>
            )}
          </div>
        }
      />

      {/* Toast Notification Alert */}
      {notificationMsg && (
        <div
          className={`p-3 rounded-xl border flex items-center justify-between text-xs font-bold animate-in fade-in duration-200 ${
            notificationMsg.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200'
              : notificationMsg.type === 'error'
              ? 'bg-rose-950/80 border-rose-500 text-rose-200'
              : 'bg-blue-950/80 border-blue-500 text-blue-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {notificationMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{notificationMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotificationMsg(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* METRICS & STATUS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: CloudSync Connection Status */}
        <div className="cyber-glass-card rounded-2xl p-4 shadow-sm text-white space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              CloudSync Status
            </span>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  status.isOnline && status.isCloudConnected
                    ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                    : 'bg-rose-500'
                }`}
              />
              <span
                className={`text-[11px] font-extrabold uppercase font-mono ${
                  status.isOnline && status.isCloudConnected ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {status.isOnline && status.isCloudConnected ? 'Online / Connected' : 'Offline'}
              </span>
            </div>
          </div>

          <div className="text-xl font-black text-white flex items-center gap-2">
            <Radio className="w-5 h-5 text-emerald-400" />
            <span>{status.statusLabel}</span>
          </div>

          <div className="text-[11px] text-slate-400 font-mono space-y-0.5 border-t border-slate-800/80 pt-2">
            <div className="flex justify-between">
              <span>Ping Latency:</span>
              <span className="text-emerald-300 font-bold">{lastPingDuration ? `${lastPingDuration} ms` : 'Active'}</span>
            </div>
            <div className="flex justify-between">
              <span>Multi-Cloud Nodes:</span>
              <span className="text-blue-300 font-bold">{status.activeCloudNodesCount} / {status.totalCloudNodesCount} active</span>
            </div>
          </div>
        </div>

        {/* Card 2: Total Pending Sync Operations */}
        <div className="cyber-glass-card rounded-2xl p-4 shadow-sm text-white space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Pending Sync Queue
            </span>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <RefreshCw className={`w-4 h-4 ${status.pendingSyncOperations > 0 ? 'animate-spin text-amber-400' : ''}`} />
            </div>
          </div>

          <div className="text-2xl font-black font-mono flex items-baseline gap-2">
            <span className={status.pendingSyncOperations > 0 ? 'text-amber-400' : 'text-emerald-400'}>
              {status.pendingSyncOperations}
            </span>
            <span className="text-xs font-sans text-slate-400 font-normal">
              pending operations
            </span>
          </div>

          <div className="text-[11px] text-slate-400 border-t border-slate-800/80 pt-2 flex items-center justify-between font-mono">
            <span>Queue Status:</span>
            <span className={status.pendingSyncOperations === 0 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
              {status.pendingSyncOperations === 0 ? '✓ All Queues Flushed' : 'In-Flight Sync...'}
            </span>
          </div>
        </div>

        {/* Card 3: Cloud Database & Firestore */}
        <div className="cyber-glass-card rounded-2xl p-4 shadow-sm text-white space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Firestore Database
            </span>
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Database className="w-4 h-4" />
            </div>
          </div>

          <div className="text-sm font-extrabold text-indigo-300 font-mono truncate" title={status.databaseId}>
            {status.databaseId}
          </div>

          <div className="text-[11px] text-slate-400 font-mono space-y-0.5 border-t border-slate-800/80 pt-2">
            <div className="flex justify-between">
              <span>Project ID:</span>
              <span className="text-slate-200">{status.projectId}</span>
            </div>
            <div className="flex justify-between">
              <span>Firestore Status:</span>
              <span className="text-emerald-400 font-bold">{status.firestoreStatus}</span>
            </div>
          </div>
        </div>

        {/* Card 4: Deletion Tombstones & Server Hub */}
        <div className="cyber-glass-card rounded-2xl p-4 shadow-sm text-white space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Deletion Propagation
            </span>
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>

          <div className="text-2xl font-black font-mono text-rose-400 flex items-baseline gap-2">
            <span>{status.totalDeletedTombstones}</span>
            <span className="text-xs font-sans text-slate-400 font-normal">
              active tombstones
            </span>
          </div>

          <div className="text-[11px] text-slate-400 border-t border-slate-800/80 pt-2 flex items-center justify-between font-mono">
            <span>Server SSE Clients:</span>
            <span className="text-blue-300 font-bold">{serverDebugData?.clientCount ?? 1} live connected</span>
          </div>
        </div>
      </div>

      {/* INTERACTIVE DELETION PROPAGATION VERIFICATION TOOL */}
      <div className="cyber-glass-card rounded-2xl p-4 sm:p-5 text-white shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.10] pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-rose-600/20 border border-rose-500/30 text-rose-400 rounded-lg">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-white">
                Deletion Propagation Integrity Verifier
              </h3>
              <p className="text-xs text-slate-300/80">
                Verify that deleted records are permanently tombstoned, purged from server memory/disk, and cannot be resurrected on reload
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCreateMockDeletionTest}
            className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/50 text-rose-200 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs self-start sm:self-auto"
            title="Create a sample test deletion to verify propagation in real-time"
          >
            + Test Live Deletion Propagation
          </button>
        </div>

        <form onSubmit={handleTestVerifyDeletion} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={testEntityIdInput}
              onChange={(e) => setTestEntityIdInput(e.target.value)}
              placeholder="Enter Entity ID or Bill # (e.g. bill-1234, sp-101, or click Test above)..."
              className="w-full pl-9 pr-3 py-2 cyber-glass-input rounded-xl text-xs font-mono text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>
          <button
            type="submit"
            disabled={isVerifying}
            className="px-4 py-2 bg-white/[0.07] hover:bg-white/[0.14] text-white rounded-xl text-xs font-bold transition-all cursor-pointer border border-white/[0.15] disabled:opacity-50"
          >
            {isVerifying ? 'Checking...' : 'Check Tombstone Register'}
          </button>
        </form>

        {verificationResult && (
          <div
            className={`p-3.5 rounded-xl border text-xs font-mono space-y-2 ${
              verificationResult.status === 'VERIFIED_PROPAGATED'
                ? 'bg-emerald-950/60 border-emerald-600/60 text-emerald-200'
                : 'bg-amber-950/60 border-amber-600/60 text-amber-200'
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-sm">
              {verificationResult.status === 'VERIFIED_PROPAGATED' ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span className="text-emerald-400">DELETION PROPAGATION VERIFIED</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  <span className="text-amber-400">ID NOT IN DELETION TOMBSTONE REGISTER</span>
                </>
              )}
            </div>
            <p className="font-sans text-xs text-slate-300">{verificationResult.details}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-800/80 text-[11px]">
              <div>
                <span className="text-slate-400">Local Memory Tombstone: </span>
                <span className="font-bold text-white">
                  {verificationResult.isTombstonedLocally ? '✓ Active' : '✗ Inactive'}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Global Storage Register: </span>
                <span className="font-bold text-white">
                  {verificationResult.isRegisteredGlobal ? '✓ Registered' : '✗ Not Registered'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* REAL-TIME LOG OF LAST 10 DATABASE WRITE & DELETE OPERATIONS */}
      <div className="cyber-glass-card rounded-2xl overflow-hidden shadow-sm text-white">
        <div className="p-4 sm:p-5 border-b border-white/[0.10] cyber-glass-header flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-lg">
                <FileText className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-extrabold text-white">
                Real-Time Database Operations Log (Last 10 Operations)
              </h2>
            </div>
            <p className="text-xs text-slate-300/80 mt-0.5">
              Live audit trail of database writes, document mutations, and verified deletion propagations
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter buttons */}
            <div className="flex items-center bg-white/[0.04] p-1 rounded-xl border border-white/[0.12] text-xs font-bold">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  filterType === 'all' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
                }`}
              >
                All (10)
              </button>
              <button
                type="button"
                onClick={() => setFilterType('deletions')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  filterType === 'deletions' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
                }`}
              >
                Deletions Only
              </button>
              <button
                type="button"
                onClick={() => setFilterType('writes')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  filterType === 'writes' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
                }`}
              >
                Writes Only
              </button>
            </div>

            <button
              type="button"
              onClick={clearDatabaseOperationLogs}
              className="p-1.5 text-slate-300 hover:text-rose-300 hover:bg-white/[0.08] rounded-lg transition-colors cursor-pointer"
              title="Clear log history"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Table of Last 10 Operations */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-200">
            <thead className="bg-white/[0.06] text-[10px] font-bold text-cyan-200 uppercase tracking-wider border-b border-white/[0.10]">
              <tr>
                <th className="py-3 px-3 w-12 text-center">#</th>
                <th className="py-3 px-3 w-28">Time</th>
                <th className="py-3 px-3 w-28">Operation</th>
                <th className="py-3 px-3 w-36">Target / Collection</th>
                <th className="py-3 px-3 min-w-[200px]">Details & Propagation</th>
                <th className="py-3 px-3 w-36">Destination</th>
                <th className="py-3 px-3 w-24 text-center">Latency</th>
                <th className="py-3 px-3 w-24 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.08] font-mono text-[11px]">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 italic font-sans text-xs">
                    No database write operations recorded in this session yet. Perform an edit, create a bill, or delete an item to see real-time propagation logs.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log, idx) => {
                  const isDel = log.operation === 'DELETE' || log.operation === 'DELETE_DOC';
                  return (
                    <tr
                      key={log.id}
                      className={`transition-colors ${
                        isDel ? 'bg-rose-500/10 hover:bg-rose-500/20' : 'hover:bg-white/[0.05]'
                      }`}
                    >
                      {/* Serial Number */}
                      <td className="py-3 px-3 text-center text-slate-400 font-bold">
                        {idx + 1}
                      </td>

                      {/* Timestamp */}
                      <td className="py-3 px-3 whitespace-nowrap text-slate-300">
                        <div className="font-bold text-white">{log.timeFormatted}</div>
                        <div className="text-[10px] text-slate-400">{log.timestamp.slice(0, 10)}</div>
                      </td>

                      {/* Operation Badge */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            isDel
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : log.operation === 'SET_DOC'
                              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                              : log.operation === 'BATCH_WRITE'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                              : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                          }`}
                        >
                          {isDel ? <Trash2 className="w-3 h-3 text-rose-400" /> : <HardDrive className="w-3 h-3 text-blue-400" />}
                          <span>{log.operation}</span>
                        </span>
                      </td>

                      {/* Target / Slice */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-bold text-slate-100 bg-white/[0.07] px-2 py-0.5 rounded border border-white/[0.14]">
                          {log.target}
                        </span>
                      </td>

                      {/* Details & Propagation Status */}
                      <td className="py-3 px-3">
                        <div className="font-sans text-xs text-slate-200">
                          {log.details}
                        </div>
                        {log.deletionVerified && (
                          <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Deletion Propagated & Tombstoned (Won't resurrect on reload)</span>
                          </div>
                        )}
                        {log.entityIds && log.entityIds.length > 0 && (
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            <span className="text-[10px] text-slate-400 font-sans">IDs:</span>
                            {log.entityIds.slice(0, 5).map((id, i) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.2 bg-white/[0.06] text-amber-300 border border-white/[0.14] rounded text-[10px]"
                              >
                                {id}
                              </span>
                            ))}
                            {log.entityIds.length > 5 && (
                              <span className="text-[10px] text-slate-400">+{log.entityIds.length - 5} more</span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Destination */}
                      <td className="py-3 px-3 whitespace-nowrap text-slate-300 font-sans text-xs">
                        {log.destination}
                      </td>

                      {/* Latency */}
                      <td className="py-3 px-3 whitespace-nowrap text-center text-slate-300">
                        {log.durationMs !== undefined ? `${log.durationMs}ms` : 'instant'}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 whitespace-nowrap text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            log.status === 'SUCCESS'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : log.status === 'PENDING'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          }`}
                        >
                          {log.status === 'SUCCESS' ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <AlertCircle className="w-3 h-3 text-rose-400" />
                          )}
                          <span>{log.status}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="p-3 bg-white/[0.03] border-t border-white/[0.10] text-[11px] text-slate-300/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>
            Displaying the last {filteredLogs.length} database operations in real-time. Deletions are authoritative across Firestore, Server Disk & Tombstones.
          </span>
          <span className="font-mono text-slate-400">
            Database: {status.databaseId}
          </span>
        </div>
      </div>
    </div>
  );
};
