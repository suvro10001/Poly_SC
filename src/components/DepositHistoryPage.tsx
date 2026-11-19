import React, { useState, useEffect } from 'react';
import { DepositRecord } from '../types';
import { PageHeaderWithActions } from './PageHeaderWithActions';
import { 
  Landmark, 
  Plus, 
  Search, 
  CheckCircle2, 
  Clock, 
  ArrowUpRight, 
  FileText, 
  Building 
} from 'lucide-react';
import { getBankAndAccountShortTag, BankAndAccountDirectory, resolveFullBankName, resolveFullAccountName } from './BankAndAccountDirectory';
import { defaultBanks, defaultAccounts } from '../data/defaultData';
import { formatDateDDMMYY, parseDateToISO } from '../utils/dateUtils';
import { isGloballyDeletedId } from '../utils/deletedTracker';

interface DepositHistoryPageProps {
  deposits: DepositRecord[];
  onAddDeposit: (deposit: DepositRecord) => void;
  onBack: () => void;
  onClose: () => void;
}

export const DepositHistoryPage: React.FC<DepositHistoryPageProps> = ({
  deposits,
  onAddDeposit,
  onBack,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showBankDirectoryModal, setShowBankDirectoryModal] = useState(false);
  const [expandedBankTagIds, setExpandedBankTagIds] = useState<Record<string, boolean>>({});
  const [, setShortTagVersion] = useState(0);
  const [storageVersion, setStorageVersion] = useState(0);

  useEffect(() => {
    const onShortTagsUpdated = () => setShortTagVersion((v) => v + 1);
    const onDepositsUpdated = () => setStorageVersion((v) => v + 1);
    window.addEventListener('polycables_short_tags_updated', onShortTagsUpdated);
    window.addEventListener('polycables_deposits_updated', onDepositsUpdated);
    window.addEventListener('storage', onDepositsUpdated);
    return () => {
      window.removeEventListener('polycables_short_tags_updated', onShortTagsUpdated);
      window.removeEventListener('polycables_deposits_updated', onDepositsUpdated);
      window.removeEventListener('storage', onDepositsUpdated);
    };
  }, []);

  const mergedDeposits = React.useMemo<DepositRecord[]>(() => {
    const map = new Map<string, any>();
    const addItems = (list: any[]) => {
      if (!Array.isArray(list)) return;
      list.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const id = String(item.id || '').trim();
        if (!id || item.isAutoDeposit || id.startsWith('auto-ho-') || isGloballyDeletedId(id)) return;
        const existing = map.get(id);
        if (!existing) {
          map.set(id, item);
        } else {
          const existingTs = Date.parse(String(existing.updatedAt || existing.savedAt || '')) || 0;
          const incomingTs = Date.parse(String(item.updatedAt || item.savedAt || '')) || 0;
          if (incomingTs > existingTs) {
            map.set(id, item);
          }
        }
      });
    };

    addItems(deposits as any[]);
    try {
      const savedPrimary = localStorage.getItem('polycables_bank_deposits');
      if (savedPrimary) addItems(JSON.parse(savedPrimary));
    } catch {}
    try {
      const savedHistory = localStorage.getItem('depositHistory');
      if (savedHistory) addItems(JSON.parse(savedHistory));
    } catch {}

    return Array.from(map.values()).sort((a: any, b: any) => {
      const aDate = parseDateToISO(a.date || a.depositDate) || '';
      const bDate = parseDateToISO(b.date || b.depositDate) || '';
      if (aDate !== bDate) return bDate.localeCompare(aDate);
      const aTs = Date.parse(String(a.updatedAt || a.savedAt || '')) || 0;
      const bTs = Date.parse(String(b.updatedAt || b.savedAt || '')) || 0;
      return bTs - aTs;
    }) as DepositRecord[];
  }, [deposits, storageVersion]);

  const toggleBankTagExpand = (id: string) => {
    setExpandedBankTagIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Bank & Account List from directory
  const [bankList, setBankList] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('polycables_bank_list');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return defaultBanks;
  });

  const [accountList, setAccountList] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('polycables_account_list');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return defaultAccounts;
  });

  // Form State
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('1102938481001');
  const [accountTitle, setAccountTitle] = useState('');
  const [depositType, setDepositType] = useState<DepositRecord['depositType']>('Cash Deposit');
  const [amount, setAmount] = useState<number>(0);
  const [referenceCode, setReferenceCode] = useState('');
  const [depositedBy, setDepositedBy] = useState('Accounts Officer');
  const [notes, setNotes] = useState('');

  const resolveDepositType = (d: any): string => {
    if (d?.depositType) return String(d.depositType);
    if (d?.chequeNo || /cheque/i.test(String(d?.remarks || d?.notes || ''))) return 'Cheque Deposit';
    return 'Cash Deposit';
  };

  const totalDeposited = mergedDeposits.reduce((acc, d) => acc + (Number(d.amount) || 0), 0);
  const cashDepositsTotal = mergedDeposits
    .filter((d) => resolveDepositType(d) === 'Cash Deposit')
    .reduce((acc, d) => acc + (Number(d.amount) || 0), 0);
  const chequeDepositsTotal = mergedDeposits
    .filter((d) => resolveDepositType(d) === 'Cheque Deposit')
    .reduce((acc, d) => acc + (Number(d.amount) || 0), 0);

  const handleSaveDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0) {
      alert('Please enter a valid deposit amount.');
      return;
    }

    const resolvedBank = bankName || bankList[0] || 'Pubali Bank PLC';
    const resolvedAccount = accountTitle || accountList[0] || 'Padma Enterprise';
    const dateDDMMYY = formatDateDDMMYY(new Date());
    const nowIso = new Date().toISOString();

    const resolvedRef = referenceCode.trim() || `SLIP-${Date.now().toString().slice(-5)}`;
    const newDep: any = {
      id: `dep-${Date.now()}`,
      slipNo: `DEP-2026-${Math.floor(100 + Math.random() * 900)}`,
      date: dateDDMMYY,
      depositDate: dateDDMMYY,
      bankName: resolvedBank,
      targetBankName: resolvedBank,
      accountNumber,
      accountTitle: resolvedAccount,
      accountName: resolvedAccount,
      displayTag: `${resolvedBank} (${resolvedAccount})`,
      entityName: 'Madhupur Sales Center',
      branchName: 'Madhupur Sales Center',
      depositType,
      chequeNo: depositType === 'Cheque Deposit' ? resolvedRef : undefined,
      amount,
      referenceCode: resolvedRef,
      depositedBy,
      status: 'Confirmed',
      notes,
      remarks: notes,
      savedAt: nowIso,
      updatedAt: nowIso
    };

    let synced: any[] = [newDep];
    try {
      const mergedMap = new Map<string, any>();
      mergedMap.set(newDep.id, newDep);
      const collect = (list: any[]) => {
        if (!Array.isArray(list)) return;
        list.forEach((x: any) => {
          if (
            !x ||
            typeof x !== 'object' ||
            !x.id ||
            x.isAutoDeposit ||
            String(x.id).startsWith('auto-ho-') ||
            isGloballyDeletedId(x.id)
          ) {
            return;
          }
          if (!mergedMap.has(x.id)) {
            mergedMap.set(x.id, x);
          }
        });
      };
      collect(deposits as any[]);
      const rawPrimary = localStorage.getItem('polycables_bank_deposits');
      if (rawPrimary) collect(JSON.parse(rawPrimary));
      const rawHistory = localStorage.getItem('depositHistory');
      if (rawHistory) collect(JSON.parse(rawHistory));

      synced = Array.from(mergedMap.values());
      localStorage.setItem('polycables_bank_deposits', JSON.stringify(synced));
      localStorage.setItem('depositHistory', JSON.stringify(synced));
      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch: { bankDeposits: synced } })
      }).catch(() => {});
    } catch {}

    onAddDeposit(newDep);
    window.dispatchEvent(new CustomEvent('polycables_deposits_updated', { detail: { deposit: newDep, deposits: synced } }));
    setStorageVersion((v) => v + 1);
    setIsModalOpen(false);
    // Reset
    setAmount(0);
    setReferenceCode('');
    setNotes('');
  };

  const qLower = searchTerm.toLowerCase().trim();
  const filtered = mergedDeposits.filter((d: any) => {
    if (!qLower) return true;
    const searchable = [
      d.slipNo,
      d.voucherNo,
      d.chequeNo,
      d.bankName,
      d.targetBankName,
      d.accountName,
      d.accountTitle,
      d.displayTag,
      d.referenceCode,
      d.depositedBy,
      d.marketingPerson,
      d.entityName,
      d.customerName,
      d.partyName,
      d.notes,
      d.remarks
    ]
      .map((v) => String(v || '').toLowerCase())
      .join(' ');
    return searchable.includes(qLower);
  });

  return (
    <div id="deposit-history-page-wrapper" className="space-y-6">
      {/* Required: Right side Back and Close buttons */}
      <PageHeaderWithActions
        idPrefix="deposit-history-page"
        title="Bank Deposit History & Slip Register"
        subtitle="Track institutional bank deposits, cheque clearing batches, and teller counter receipts"
        badge={`${mergedDeposits.length} Bank Deposits`}
        badgeColor="bg-cyan-500/20 text-cyan-200 border-cyan-400/35"
        icon={Landmark}
        onBack={onBack}
        onClose={onClose}
        extraActions={
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              id="btn-open-bank-directory"
              onClick={() => setShowBankDirectoryModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-purple-200 bg-purple-500/20 hover:bg-purple-500/30 rounded-lg shadow-xs transition-colors cursor-pointer border border-purple-400/35"
              title="Open Bank & Account Directory directly without exiting"
            >
              <Landmark className="w-4 h-4 text-purple-300" />
              <span>Bank & Account Directory</span>
            </button>
            <button
              type="button"
              id="btn-open-deposit-modal"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-black text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg shadow-[0_0_18px_rgba(34,211,238,0.28)] transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Record Bank Deposit</span>
            </button>
          </div>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="cyber-glass-subcard p-5 rounded-xl border border-cyan-400/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Total Bank Deposits</span>
            <div className="p-2 bg-cyan-500/15 border border-cyan-400/30 rounded-lg text-cyan-300">
              <Landmark className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-white mt-2">৳{totalDeposited.toLocaleString()}</div>
          <p className="text-xs text-slate-400 mt-1">Across all operating corporate bank accounts</p>
        </div>

        <div className="cyber-glass-subcard p-5 rounded-xl border border-emerald-400/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Cash Teller Deposits</span>
            <div className="p-2 bg-emerald-500/15 border border-emerald-400/30 rounded-lg text-emerald-300">
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-300 mt-2">৳{cashDepositsTotal.toLocaleString()}</div>
          <p className="text-xs text-slate-400 mt-1">Direct cash drawer deposits</p>
        </div>

        <div className="cyber-glass-subcard p-5 rounded-xl border border-indigo-400/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Cheque Clearing Batches</span>
            <div className="p-2 bg-indigo-500/15 border border-indigo-400/30 rounded-lg text-indigo-300">
              <Building className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-indigo-300 mt-2">৳{chequeDepositsTotal.toLocaleString()}</div>
          <p className="text-xs text-slate-400 mt-1">Processed through clearing house</p>
        </div>
      </div>

      {/* Table */}
      <div className="cyber-glass-card rounded-2xl overflow-hidden text-white">
        <div className="p-4 border-b border-cyan-500/20 bg-[#0b2334]/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-cyan-400/80 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              id="input-deposit-search"
              placeholder="Search slip #, bank, ref code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
            />
          </div>

          <span className="text-xs text-cyan-200/80 font-medium">
            Showing {filtered.length} of {mergedDeposits.length} deposit records
          </span>
        </div>

        {/* Responsive Mobile Cards View */}
        <div className="block sm:hidden divide-y divide-cyan-500/15 bg-[#071824]/60">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-sm">
              No bank deposits found matching criteria.
            </div>
          ) : (
            filtered.map((dep) => {
              const rawBank = dep.bankName || (dep as any).targetBankName || (dep as any).bank || (dep as any).displayTag || 'Pubali Bank PLC';
              const rawAccount = (dep as any).accountName || dep.accountTitle || (dep as any).depositBankTag || (dep as any).accountShortTag || (dep as any).displayTag || 'Padma Enterprise';
              const displayBank = resolveFullBankName(rawBank, bankList) || 'Pubali Bank PLC';
              const displayAccount = resolveFullAccountName(rawAccount, accountList) || 'Padma Enterprise';
              const shortTag = getBankAndAccountShortTag(
                displayBank,
                displayAccount,
                (dep as any).displayTag
              );
              const isExpanded = Boolean(expandedBankTagIds[dep.id]);
              const formattedDate = formatDateDDMMYY(dep.date || (dep as any).depositDate || (dep as any).createdDate || (dep as any).voucherDate) || dep.date || (dep as any).depositDate || '-';
              const depType = resolveDepositType(dep);
              const depSlip = dep.slipNo || (dep as any).voucherNo || (dep as any).chequeNo || dep.id;
              const depBy = dep.depositedBy || (dep as any).marketingPerson || (dep as any).entityName || 'Accounts Officer';
              const depRef = dep.referenceCode || (dep as any).chequeNo || (dep as any).remarks || '';
              const depStatus = dep.status || 'Confirmed';
              const depNote = dep.notes || (dep as any).remarks || (dep as any).partyName || (dep as any).customerName;
              return (
                <div key={dep.id} className="p-4 space-y-2.5 hover:bg-cyan-500/[0.06] transition-colors">
                  {/* Card Header */}
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-cyan-200 font-mono text-xs">{depSlip}</div>
                      <div className="text-[11px] text-slate-400 font-medium">{formattedDate}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-white font-mono text-sm">৳{(Number(dep.amount) || 0).toLocaleString()}</div>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                        depStatus === 'Confirmed' ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/35' : 'bg-amber-500/20 text-amber-200 border border-amber-400/35'
                      }`}>
                        {depStatus}
                      </span>
                    </div>
                  </div>

                  {/* Short Tag Only by Default; Click to Toggle Full Bank & Account Name */}
                  <div className="flex flex-col items-start gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleBankTagExpand(dep.id)}
                      className="px-2.5 py-1 rounded font-mono font-black text-xs bg-[#061520] hover:bg-[#0c2638] text-amber-300 border border-cyan-500/35 shadow-2xs cursor-pointer transition-colors"
                      title={isExpanded ? 'Click to hide Bank & Account name' : 'Click to view full Bank & Account name'}
                    >
                      {shortTag}
                    </button>
                    {isExpanded && (
                      <div
                        onClick={() => toggleBankTagExpand(dep.id)}
                        className="w-full p-2 bg-[#0c2638]/90 rounded-lg border border-cyan-500/30 cursor-pointer"
                        title="Click to hide"
                      >
                        <div className="text-xs font-semibold text-white">
                          {displayBank}
                        </div>
                        <div className="text-[11px] text-cyan-200 font-mono">
                          A/C: {displayAccount}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer details: Type, Deposited By & Ref */}
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-300 pt-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                      depType === 'Cash Deposit' ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30' :
                      depType === 'Cheque Deposit' ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/30' :
                      'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30'
                    }`}>
                      {depType}
                    </span>
                    <div className="text-right text-[11px] text-slate-400">
                      <span className="text-slate-200 font-medium">{depBy}</span>
                      {depRef && <span className="ml-1.5 font-mono">({depRef})</span>}
                    </div>
                  </div>
                  {depNote && (
                    <div className="text-[11px] text-slate-400 italic border-t border-cyan-500/15 pt-1">
                      {depNote}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-200">
            <thead className="bg-[#0c2638] text-xs font-semibold text-cyan-200 uppercase tracking-wider border-b border-cyan-500/30">
              <tr>
                <th className="py-3 px-4">Slip # & Date</th>
                <th className="py-3 px-4">Target Bank Account</th>
                <th className="py-3 px-4">Deposit Type</th>
                <th className="py-3 px-4">Deposited By & Ref</th>
                <th className="py-3 px-4 text-right">Amount (৳)</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 text-sm">
                    No bank deposits found matching criteria.
                  </td>
                </tr>
              ) : (
                filtered.map(dep => {
                  const depType = resolveDepositType(dep);
                  const depSlip = dep.slipNo || (dep as any).voucherNo || (dep as any).chequeNo || dep.id;
                  const depBy = dep.depositedBy || (dep as any).marketingPerson || (dep as any).entityName || 'Accounts Officer';
                  const depRef = dep.referenceCode || (dep as any).chequeNo || (dep as any).remarks || '-';
                  const depStatus = dep.status || 'Confirmed';
                  return (
                  <tr key={dep.id} className="hover:bg-cyan-500/[0.06] transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-cyan-200 font-mono text-xs">{depSlip}</div>
                      <div className="text-xs text-slate-400 font-medium">
                        {formatDateDDMMYY(dep.date || (dep as any).depositDate || (dep as any).createdDate || (dep as any).voucherDate) || dep.date || (dep as any).depositDate || '-'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {(() => {
                        const rawBank = dep.bankName || (dep as any).targetBankName || (dep as any).bank || (dep as any).displayTag || 'Pubali Bank PLC';
                        const rawAccount = (dep as any).accountName || dep.accountTitle || (dep as any).depositBankTag || (dep as any).accountShortTag || (dep as any).displayTag || 'Padma Enterprise';
                        const displayBank = resolveFullBankName(rawBank, bankList) || 'Pubali Bank PLC';
                        const displayAccount = resolveFullAccountName(rawAccount, accountList) || 'Padma Enterprise';
                        const shortTag = getBankAndAccountShortTag(displayBank, displayAccount, (dep as any).displayTag);
                        const isExpanded = Boolean(expandedBankTagIds[dep.id]);
                        return (
                          <div className="flex flex-col items-start gap-1">
                            <button
                              type="button"
                              onClick={() => toggleBankTagExpand(dep.id)}
                              className="px-2 py-0.5 rounded font-mono font-black text-[11px] bg-[#061520] hover:bg-[#0c2638] text-amber-300 border border-cyan-500/35 shadow-2xs cursor-pointer transition-colors"
                              title={isExpanded ? 'Click to hide Bank & Account name' : 'Click to view full Bank & Account name'}
                            >
                              {shortTag}
                            </button>
                            {isExpanded && (
                              <div
                                onClick={() => toggleBankTagExpand(dep.id)}
                                className="flex flex-col bg-[#0c2638]/90 border border-cyan-500/30 rounded-md px-2 py-1 cursor-pointer"
                                title="Click to hide"
                              >
                                <span className="font-semibold text-white text-xs">{displayBank}</span>
                                <span className="text-[11px] text-cyan-200 font-mono">
                                  A/C: {displayAccount}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                        depType === 'Cash Deposit' ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30' :
                        depType === 'Cheque Deposit' ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/30' :
                        'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30'
                      }`}>
                        {depType}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-xs font-medium text-white">{depBy}</div>
                      <div className="text-[11px] text-slate-400">Ref: {depRef}</div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="font-black text-white font-mono">৳{(Number(dep.amount) || 0).toLocaleString()}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        depStatus === 'Confirmed' ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/35' : 'bg-amber-500/20 text-amber-200 border border-amber-400/35'
                      }`}>
                        {depStatus}
                      </span>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Deposit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030d14]/80 p-4 backdrop-blur-sm">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl max-w-md w-full p-6 shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 text-white animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Landmark className="w-5 h-5 text-cyan-400" />
                Record Bank Deposit Slip
              </h2>
              <button
                type="button"
                onClick={() => setShowBankDirectoryModal(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-purple-200 hover:text-white bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/35 rounded-lg shadow-2xs transition-colors cursor-pointer"
                title="Directly access Bank & Account Directory without leaving or exiting"
              >
                <Landmark className="w-3.5 h-3.5 text-purple-300" />
                <span>Bank Directory</span>
              </button>
            </div>
            <p className="text-xs text-slate-300 mb-4">
              Record cash/cheque deposited into business bank account.
            </p>

            <form onSubmit={handleSaveDeposit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-cyan-200 mb-1">Deposit Type</label>
                <select
                  value={depositType}
                  onChange={(e) => setDepositType(e.target.value as any)}
                  className="w-full text-xs px-2.5 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                >
                  <option value="Cash Deposit">Cash Deposit (Physical Teller Counter)</option>
                  <option value="Cheque Deposit">Cheque Clearing Deposit</option>
                  <option value="Online Transfer">Online / RTGS / EFT Transfer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-cyan-200 mb-1">Deposit Amount (৳) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="any"
                  value={amount || ''}
                  onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                  className="w-full text-base font-bold px-3 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-cyan-200">Target Bank Name</label>
                    <button
                      type="button"
                      onClick={() => setShowBankDirectoryModal(true)}
                      className="text-[10px] text-purple-300 font-bold hover:underline cursor-pointer"
                    >
                      + Manage
                    </button>
                  </div>
                  <select
                    value={bankName}
                    onChange={e => setBankName(e.target.value)}
                    className="w-full text-xs px-2.5 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] font-bold text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                    required
                  >
                    <option value="">-- Select Target Bank --</option>
                    {bankName && !bankList.includes(bankName) && (
                      <option value={bankName}>{bankName}</option>
                    )}
                    {bankList.map((b, bIdx) => (
                      <option key={`${b}-${bIdx}`} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-cyan-200">Target Account Name</label>
                    <button
                      type="button"
                      onClick={() => setShowBankDirectoryModal(true)}
                      className="text-[10px] text-purple-300 font-bold hover:underline cursor-pointer"
                    >
                      + Manage
                    </button>
                  </div>
                  <select
                    value={accountTitle || accountList[0] || 'Padma Enterprise'}
                    onChange={e => setAccountTitle(e.target.value)}
                    className="w-full text-xs px-2.5 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] font-bold text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  >
                    {accountTitle && !accountList.includes(accountTitle) && (
                      <option value={accountTitle}>{accountTitle}</option>
                    )}
                    {accountList.map((a, aIdx) => (
                      <option key={`${a}-${aIdx}`} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-cyan-200 mb-1">Bank Slip / Ref Code</label>
                  <input
                    type="text"
                    placeholder="e.g. SLIP-CBL-99120"
                    value={referenceCode}
                    onChange={e => setReferenceCode(e.target.value)}
                    className="w-full text-xs px-2.5 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-cyan-200 mb-1">Deposited By</label>
                  <input
                    type="text"
                    value={depositedBy}
                    onChange={e => setDepositedBy(e.target.value)}
                    className="w-full text-xs px-2.5 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-cyan-200 mb-1">Notes</label>
                <input
                  type="text"
                  placeholder="Drawer clearance, end-of-day surplus..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full text-xs px-2.5 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-cyan-500/20">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-200 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-black text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg shadow-xs cursor-pointer"
                >
                  Save Deposit Slip
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Direct Bank & Account Directory Access Modal */}
      {showBankDirectoryModal && (
        <BankAndAccountDirectory
          isModal={true}
          bankList={bankList}
          accountList={accountList}
          onAddBank={(name) => {
            setBankList(prev => [...prev, name]);
            try { localStorage.setItem('polycables_bank_list', JSON.stringify([...bankList, name])); } catch {}
          }}
          onDeleteBank={(name) => {
            setBankList(prev => prev.filter(b => b !== name));
            try { localStorage.setItem('polycables_bank_list', JSON.stringify(bankList.filter(b => b !== name))); } catch {}
          }}
          onEditBank={(oldName, newName) => {
            setBankList(prev => prev.map(b => b === oldName ? newName : b));
            try { localStorage.setItem('polycables_bank_list', JSON.stringify(bankList.map(b => b === oldName ? newName : b))); } catch {}
          }}
          onAddAccount={(name) => {
            setAccountList(prev => [...prev, name]);
            try { localStorage.setItem('polycables_account_list', JSON.stringify([...accountList, name])); } catch {}
          }}
          onDeleteAccount={(name) => {
            setAccountList(prev => prev.filter(a => a !== name));
            try { localStorage.setItem('polycables_account_list', JSON.stringify(accountList.filter(a => a !== name))); } catch {}
          }}
          onEditAccount={(oldName, newName) => {
            setAccountList(prev => prev.map(a => a === oldName ? newName : a));
            try { localStorage.setItem('polycables_account_list', JSON.stringify(accountList.map(a => a === oldName ? newName : a))); } catch {}
          }}
          onClose={() => setShowBankDirectoryModal(false)}
        />
      )}
    </div>
  );
};
