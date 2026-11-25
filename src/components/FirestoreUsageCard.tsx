import React, { useCallback, useEffect, useState } from 'react';
import { Battery, Cloud, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  FirestoreUsageEstimate,
  getFirestoreUsageEstimate,
  subscribeFirestoreUsageEstimate
} from '../utils/firestoreUsage';

interface ProjectFirestoreUsage {
  reads: number;
  writes: number;
  deletes: number;
  readLimit: number | null;
  writeLimit: number | null;
  deleteLimit: number | null;
  dataThroughUtc: string;
}

const SPARK_DAILY_LIMITS = {
  reads: 50_000,
  writes: 20_000,
  deletes: 20_000
};

function isProjectFirestoreUsage(value: unknown): value is ProjectFirestoreUsage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'reads' in value &&
    'writes' in value &&
    'deletes' in value &&
    'readLimit' in value &&
    'writeLimit' in value &&
    'deleteLimit' in value &&
    'dataThroughUtc' in value &&
    typeof value.reads === 'number' &&
    typeof value.writes === 'number' &&
    typeof value.deletes === 'number' &&
    (typeof value.readLimit === 'number' || value.readLimit === null) &&
    (typeof value.writeLimit === 'number' || value.writeLimit === null) &&
    (typeof value.deleteLimit === 'number' || value.deleteLimit === null) &&
    typeof value.dataThroughUtc === 'string'
  );
}

function formatCount(value: number): string {
  return Math.max(0, Math.floor(value || 0)).toLocaleString('en-IN');
}

function UsageValue({ label, value, limit }: { label: string; value: number; limit: number | null }) {
  const percentage = limit !== null && limit > 0 ? (value / limit) * 100 : null;
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/15 px-3 py-2">
      <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300">
        <Battery className="h-4 w-4 text-cyan-300" />
        {label}
      </span>
      <span className="flex items-baseline gap-2 text-right">
        <span className="font-mono text-sm font-black text-white">{formatCount(value)}</span>
        <span className="min-w-[4rem] font-mono text-[11px] font-bold text-cyan-200">
          {percentage === null ? 'No limit' : `${percentage.toFixed(1)}%`}
        </span>
      </span>
    </div>
  );
}

export const FirestoreUsageCard: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [compactOpen, setCompactOpen] = useState(false);
  const [appUsage, setAppUsage] = useState<FirestoreUsageEstimate>(() => getFirestoreUsageEstimate());
  const [connected, setConnected] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [projectUsage, setProjectUsage] = useState<ProjectFirestoreUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadProjectUsage = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await fetch('/api/firestore-usage', {
        cache: 'no-store',
        credentials: 'same-origin'
      });
      if (response.status === 401) {
        setConnected(false);
        setProjectUsage(null);
        setError('');
        return;
      }
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'string'
            ? result.error
            : `Metrics request failed (${response.status}).`;
        throw new Error(message);
      }
      if (!isProjectFirestoreUsage(result)) {
        throw new Error('The metrics server returned an invalid response.');
      }
      setProjectUsage(result);
      setConnected(true);
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load project-wide metrics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => subscribeFirestoreUsageEstimate(setAppUsage), []);

  useEffect(() => {
    void loadProjectUsage();
  }, [loadProjectUsage]);

  useEffect(() => {
    if (!connected) return;
    const timer = window.setInterval(() => void loadProjectUsage(), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [connected, loadProjectUsage]);

  const connectProjectUsage = async (event: React.FormEvent) => {
    event.preventDefault();
    const token = tokenInput.trim();
    if (!token) return;
    setTokenInput('');
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/firestore-usage/session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'same-origin'
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || `Metrics access failed (${response.status}).`);
      }
      setConnected(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to connect to project-wide metrics.');
    } finally {
      setLoading(false);
    }
  };

  const disconnectProjectUsage = async () => {
    try {
      const response = await fetch('/api/firestore-usage/session/close', {
        method: 'POST',
        credentials: 'same-origin'
      });
      if (!response.ok) throw new Error(`Disconnect failed (${response.status}).`);
      setConnected(false);
      setProjectUsage(null);
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to disconnect metrics access.');
    }
  };

  const usageCard = (
    <section className="rounded-2xl border border-cyan-400/25 bg-[#081d2c]/65 p-4 text-white shadow-[0_12px_30px_rgba(0,0,0,0.22)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/15 p-2 text-cyan-300">
            <Battery className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-black">Firestore Read &amp; Write Counts</h3>
            <p className="text-[11px] text-slate-400">Today (UTC) · percentage of configured daily limits</p>
          </div>
        </div>
        {connected && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadProjectUsage()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-bold text-slate-200 hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void disconnectProjectUsage()}
              disabled={loading}
              className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:bg-white/10 disabled:opacity-50"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-amber-400/20 bg-amber-500/[0.05] p-3">
          <div className="flex items-center gap-2 text-xs font-black text-amber-200">
            <ShieldCheck className="h-4 w-4" />
            App estimate · this browser
          </div>
          <UsageValue label="Reads" value={appUsage.reads} limit={projectUsage?.readLimit ?? SPARK_DAILY_LIMITS.reads} />
          <UsageValue label="Writes" value={appUsage.writes} limit={projectUsage?.writeLimit ?? SPARK_DAILY_LIMITS.writes} />
          <UsageValue label="Deletes" value={appUsage.deletes} limit={projectUsage?.deleteLimit ?? SPARK_DAILY_LIMITS.deletes} />
          {!appUsage.persistent && (
            <p className="text-[10px] text-amber-100/70">Browser storage is unavailable; this estimate lasts for this page session.</p>
          )}
        </div>

        <div className="space-y-2 rounded-xl border border-cyan-400/20 bg-cyan-500/[0.05] p-3">
          <div className="flex items-center justify-between gap-2 text-xs font-black text-cyan-200">
            <span className="inline-flex items-center gap-2">
              <Cloud className="h-4 w-4" />
              Project-wide actual
            </span>
            {projectUsage && <span className="font-normal text-cyan-100/60">Cloud Monitoring</span>}
          </div>
          {projectUsage ? (
            <>
              <UsageValue label="Reads" value={projectUsage.reads} limit={projectUsage.readLimit} />
              <UsageValue label="Writes" value={projectUsage.writes} limit={projectUsage.writeLimit} />
              <UsageValue label="Deletes" value={projectUsage.deletes} limit={projectUsage.deleteLimit} />
              <p className="text-[10px] text-slate-400">
                Data through {new Date(projectUsage.dataThroughUtc).toLocaleTimeString()} · metrics can lag by about 4 minutes.
              </p>
            </>
          ) : (
            <>
              <p className="text-[11px] text-slate-300">
                Connect with the server-configured metrics access token to load project-wide counts.
              </p>
              <form onSubmit={connectProjectUsage} className="flex gap-2">
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(event) => setTokenInput(event.target.value)}
                  autoComplete="off"
                  aria-label="Cloud Monitoring access token"
                  placeholder="Metrics access token"
                  className="min-w-0 flex-1 rounded-lg border border-white/15 bg-slate-950/70 px-2.5 py-2 text-xs text-white outline-none focus:border-cyan-400"
                />
                <button
                  type="submit"
                  disabled={!tokenInput.trim() || loading}
                  className="rounded-lg bg-cyan-400 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-50"
                >
                  {loading ? 'Loading...' : 'Connect'}
                </button>
              </form>
            </>
          )}
          {error && <p role="alert" className="text-[11px] font-semibold text-rose-300">{error}</p>}
        </div>
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
        The app estimate counts operations observed on this browser and may differ from billed usage. Spark limits are used unless overridden on the server; project-wide values come from sampled Cloud Monitoring metrics.
      </p>
    </section>
  );

  const readPercentage =
    `${((projectUsage?.reads ?? appUsage.reads) / (projectUsage?.readLimit ?? SPARK_DAILY_LIMITS.reads) * 100).toFixed(1)}%`;
  const writePercentage =
    `${((projectUsage?.writes ?? appUsage.writes) / (projectUsage?.writeLimit ?? SPARK_DAILY_LIMITS.writes) * 100).toFixed(1)}%`;

  if (!compact) return usageCard;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setCompactOpen((open) => !open)}
        aria-label={`Firestore usage. Reads ${readPercentage}, writes ${writePercentage}`}
        aria-expanded={compactOpen}
        title="Firestore read/write usage"
        className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/40 bg-[#0a2333]/95 px-1.5 py-1 text-[9px] font-black leading-tight text-cyan-100 shadow-lg hover:bg-cyan-950"
      >
        <Battery className="h-4 w-4 shrink-0 text-cyan-300" />
        <span className="flex flex-col items-start">
          <span>R {readPercentage}</span>
          <span>W {writePercentage}</span>
        </span>
      </button>
      {compactOpen && (
        <div
          role="dialog"
          aria-label="Firestore usage details"
          className="absolute right-0 top-full z-[70] mt-2 max-h-[calc(100vh-4rem)] w-[min(36rem,calc(100vw-1rem))] overflow-y-auto"
        >
          {usageCard}
        </div>
      )}
    </div>
  );
};
