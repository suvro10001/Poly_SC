import React, { useState } from 'react';
import { 
  Sparkles, 
  Wrench, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldCheck, 
  X, 
  RefreshCw, 
  RotateCcw, 
  ArrowRight, 
  Database, 
  Trash2,
  Lock,
  Cpu
} from 'lucide-react';
import { StoredBill, ExpenseEntry, CollectionMR, BankDeposit, Party, Salesperson, AuthUser } from '../types';

interface SuperAdminAiAutoFixModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser | null;
  storedBills: StoredBill[];
  setStoredBills: React.Dispatch<React.SetStateAction<StoredBill[]>>;
  expenses: ExpenseEntry[];
  setExpenses: React.Dispatch<React.SetStateAction<ExpenseEntry[]>>;
  collections: CollectionMR[];
  setCollections: React.Dispatch<React.SetStateAction<CollectionMR[]>>;
  bankDeposits: BankDeposit[];
  setBankDeposits: React.Dispatch<React.SetStateAction<BankDeposit[]>>;
  parties: Party[];
  setParties: React.Dispatch<React.SetStateAction<Party[]>>;
  salespersons: Salesperson[];
  setSalespersons: React.Dispatch<React.SetStateAction<Salesperson[]>>;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const SuperAdminAiAutoFixModal: React.FC<SuperAdminAiAutoFixModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  storedBills,
  setStoredBills,
  expenses,
  setExpenses,
  collections,
  setCollections,
  bankDeposits,
  setBankDeposits,
  parties,
  setParties,
  salespersons,
  setSalespersons,
  showToast
}) => {
  const [instruction, setInstruction] = useState('auto fix any error');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    summary?: string;
    detectedErrors?: string[];
    fixedActions?: string[];
    fixedData?: {
      salespersons?: Salesperson[];
      expenses?: ExpenseEntry[];
      storedBills?: StoredBill[];
      parties?: Party[];
      collections?: CollectionMR[];
    };
  } | null>(null);
  const [hasApplied, setHasApplied] = useState(false);
  const [canRollback, setCanRollback] = useState(() => {
    return Boolean(localStorage.getItem('polycables_autofix_backup'));
  });

  const isSuperAdmin = Boolean(
    currentUser?.isSuperAdmin === true ||
    currentUser?.username?.toLowerCase() === 'suvroadmin' ||
    currentUser?.role === 'super_admin' ||
    currentUser?.role === 'Super Admin'
  );

  if (!isOpen) return null;

  if (!isSuperAdmin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-slate-900 border border-rose-500/50 rounded-2xl max-w-md w-full p-6 text-center text-white shadow-2xl space-y-4">
          <div className="w-14 h-14 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/30">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-black tracking-wide text-rose-300">Access Restricted</h2>
          <p className="text-xs text-slate-300">
            The AI Error Auto-Fixer is strictly available only for the <span className="text-white font-bold">Super Admin</span> account.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const handleRunAiFix = async (customText?: string) => {
    const textToRun = (customText !== undefined ? customText : instruction).trim();
    if (!textToRun) return;

    setLoading(true);
    setResult(null);
    setHasApplied(false);

    try {
      const response = await fetch('/api/ai-autofix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: textToRun,
          user: {
            username: currentUser?.username,
            role: currentUser?.role,
            isSuperAdmin: currentUser?.isSuperAdmin
          },
          appData: {
            salespersons,
            expenses,
            storedBills,
            parties,
            collections,
            bankDeposits
          }
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to execute AI Auto-Fix.');
      }

      setResult(data);
      if (showToast) {
        showToast('AI diagnostics & automated fix plan generated!', 'info');
      }
    } catch (err: any) {
      console.error('Error running AI Auto-Fix:', err);
      if (showToast) {
        showToast(`AI Auto-Fix failed: ${err.message}`, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFixes = () => {
    if (!result?.fixedData) return;

    try {
      // 1. Save rollback snapshot
      const backupSnapshot = {
        salespersons,
        expenses,
        storedBills,
        parties,
        collections,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem('polycables_autofix_backup', JSON.stringify(backupSnapshot));
      setCanRollback(true);

      // 2. Apply cleaned state
      if (Array.isArray(result.fixedData.salespersons)) {
        setSalespersons(result.fixedData.salespersons);
        localStorage.setItem('polycables_salespersons', JSON.stringify(result.fixedData.salespersons));
      }

      if (Array.isArray(result.fixedData.expenses)) {
        setExpenses(result.fixedData.expenses);
        localStorage.setItem('polycables_expenses', JSON.stringify(result.fixedData.expenses));
      }

      if (Array.isArray(result.fixedData.storedBills)) {
        setStoredBills(result.fixedData.storedBills);
        localStorage.setItem('polycables_stored_bills', JSON.stringify(result.fixedData.storedBills));
      }

      if (Array.isArray(result.fixedData.parties)) {
        setParties(result.fixedData.parties);
        localStorage.setItem('polycables_parties', JSON.stringify(result.fixedData.parties));
      }

      if (Array.isArray(result.fixedData.collections)) {
        setCollections(result.fixedData.collections);
        localStorage.setItem('polycables_collections', JSON.stringify(result.fixedData.collections));
      }

      setHasApplied(true);
      if (showToast) {
        showToast('All AI fixes applied directly to live system and saved!', 'success');
      }
    } catch (err: any) {
      console.error('Failed to apply fixes:', err);
      if (showToast) {
        showToast(`Failed to apply fixes: ${err.message}`, 'error');
      }
    }
  };

  const handleRollback = () => {
    try {
      const savedBackup = localStorage.getItem('polycables_autofix_backup');
      if (!savedBackup) return;

      const parsed = JSON.parse(savedBackup);
      if (parsed.salespersons) {
        setSalespersons(parsed.salespersons);
        localStorage.setItem('polycables_salespersons', JSON.stringify(parsed.salespersons));
      }
      if (parsed.expenses) {
        setExpenses(parsed.expenses);
        localStorage.setItem('polycables_expenses', JSON.stringify(parsed.expenses));
      }
      if (parsed.storedBills) {
        setStoredBills(parsed.storedBills);
        localStorage.setItem('polycables_stored_bills', JSON.stringify(parsed.storedBills));
      }
      if (parsed.parties) {
        setParties(parsed.parties);
        localStorage.setItem('polycables_parties', JSON.stringify(parsed.parties));
      }
      if (parsed.collections) {
        setCollections(parsed.collections);
        localStorage.setItem('polycables_collections', JSON.stringify(parsed.collections));
      }

      localStorage.removeItem('polycables_autofix_backup');
      setCanRollback(false);
      setHasApplied(false);
      setResult(null);

      if (showToast) {
        showToast('System reverted to previous snapshot state successfully.', 'info');
      }
    } catch (err: any) {
      console.error('Rollback failed:', err);
    }
  };

  const quickPrompts = [
    { label: '⚡ Auto Fix All System Errors', text: 'auto fix any error' },
    { label: '🧹 Remove All Extra Users from Staff & Expenses', text: 'remove all extra user from Users & Staff list and from Expense Entry & Log' },
    { label: '🚫 Purge Extra Parties, Bills & Challans', text: 'never add extra party name, bill, challan, user name, expense and purge any phantom entries' },
    { label: '🧾 Fix Duplicate Bills & Line Quantities', text: 'check and fix all duplicate bills, recalculate line sums, and repair corrupted quantities' },
    { label: '💰 Reconcile Expenses & Collection Balances', text: 'audit all sales centers and marketing officers expense totals and synchronize balances' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-slate-900 border border-purple-500/40 rounded-2xl max-w-2xl w-full text-white shadow-2xl flex flex-col overflow-hidden my-auto max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 p-4 border-b border-purple-500/30 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-300 shadow-inner">
              <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm sm:text-base font-black tracking-wide text-white">
                  Super Admin AI Error Auto-Fixer
                </h2>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-300 border border-purple-400/30">
                  Gemini 3.8 Flash
                </span>
              </div>
              <p className="text-xs text-purple-200/80">
                Automated error diagnosis, phantom data purge, and system integrity repair
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Super Admin Prompt Box */}
          <div className="space-y-2">
            <label className="font-bold text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-purple-400" />
                Tell AI What to Fix:
              </span>
              <span className="text-[11px] text-emerald-400 font-normal">
                Natural Language Command
              </span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleRunAiFix();
                  }
                }}
                placeholder="e.g., auto fix any error, remove extra users, fix bill dates..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 font-medium"
              />
              <button
                type="button"
                onClick={() => handleRunAiFix()}
                disabled={loading || !instruction.trim()}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer shrink-0 active:scale-95"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <Wrench className="w-3.5 h-3.5 text-amber-300" />
                    <span>Run AI Fix</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick Action Chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {quickPrompts.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setInstruction(p.text);
                    handleRunAiFix(p.text);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-purple-900/40 text-slate-300 hover:text-purple-200 border border-slate-700 hover:border-purple-500/50 transition-all text-[11px] font-semibold cursor-pointer active:scale-95"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Database Overview Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            <div className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-xl text-center">
              <span className="text-[10px] text-slate-400 font-bold block uppercase">Users & Staff</span>
              <span className="text-sm font-black font-mono text-purple-300">{salespersons.length}</span>
            </div>
            <div className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-xl text-center">
              <span className="text-[10px] text-slate-400 font-bold block uppercase">Expense Vouchers</span>
              <span className="text-sm font-black font-mono text-rose-300">{expenses.length}</span>
            </div>
            <div className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-xl text-center">
              <span className="text-[10px] text-slate-400 font-bold block uppercase">Stored Bills</span>
              <span className="text-sm font-black font-mono text-blue-300">{storedBills.length}</span>
            </div>
            <div className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-xl text-center">
              <span className="text-[10px] text-slate-400 font-bold block uppercase">Parties / Clients</span>
              <span className="text-sm font-black font-mono text-emerald-300">{parties.length}</span>
            </div>
          </div>

          {/* Diagnosis & Fix Results */}
          {result && (
            <div className="space-y-3 pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
              {/* Executive Summary */}
              <div className="p-3 bg-purple-950/40 border border-purple-500/40 rounded-xl space-y-1">
                <div className="flex items-center gap-1.5 text-purple-300 font-bold">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>AI Executive Diagnostic Confirmation</span>
                </div>
                <p className="text-slate-200 text-xs leading-relaxed font-medium">
                  {result.summary}
                </p>
              </div>

              {/* Errors Detected */}
              {result.detectedErrors && result.detectedErrors.length > 0 && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1.5">
                  <span className="font-bold text-amber-400 flex items-center gap-1.5 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Detected Issues & Anomalies ({result.detectedErrors.length})
                  </span>
                  <ul className="space-y-1">
                    {result.detectedErrors.map((err, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-slate-300 text-xs">
                        <span className="text-amber-400 font-bold">•</span>
                        <span>{err}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Fixes Prepared / Applied */}
              {result.fixedActions && result.fixedActions.length > 0 && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1.5">
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Automated Actions & Repairs ({result.fixedActions.length})
                  </span>
                  <ul className="space-y-1">
                    {result.fixedActions.map((act, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-slate-300 text-xs">
                        <span className="text-emerald-400 font-bold">✓</span>
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleApplyFixes}
                    disabled={hasApplied}
                    className={`px-4 py-2 rounded-xl font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer ${
                      hasApplied
                        ? 'bg-emerald-800/60 text-emerald-200 border border-emerald-600/50 cursor-default'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                    <span>{hasApplied ? 'Fixes Applied to Live ERP' : 'Apply Fixes to Live ERP'}</span>
                  </button>

                  {canRollback && (
                    <button
                      type="button"
                      onClick={handleRollback}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-bold flex items-center gap-1.5 cursor-pointer active:scale-95"
                      title="Undo the last applied AI fix and restore previous backup snapshot"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Undo / Rollback</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold cursor-pointer"
                >
                  Done & Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
