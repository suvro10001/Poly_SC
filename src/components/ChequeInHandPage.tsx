import React, { useState } from 'react';
import { ChequeRecord, DepositRecord } from '../types';
import { PageHeaderWithActions } from './PageHeaderWithActions';
import { DateInputWithPicker } from './DateInputWithPicker';
import { formatDateDDMMYY } from '../utils/dateUtils';
import { isGloballyDeletedId } from '../utils/deletedTracker';
import { BankLogoBadge } from './BankAndAccountDirectory';
import { 
  CreditCard, 
  Plus, 
  Search, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Building2, 
  Calendar,
  Landmark,
  ArrowRight
} from 'lucide-react';

interface ChequeInHandPageProps {
  cheques: ChequeRecord[];
  onAddCheque: (chq: ChequeRecord) => void;
  onUpdateStatus: (id: string, newStatus: ChequeRecord['status'], depositBank?: string) => void;
  onAddDeposit?: (deposit: DepositRecord) => void;
  onBack: () => void;
  onClose: () => void;
}

export const ChequeInHandPage: React.FC<ChequeInHandPageProps> = ({
  cheques,
  onAddCheque,
  onUpdateStatus,
  onAddDeposit,
  onBack,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form states
  const [chequeNo, setChequeNo] = useState('');
  const [bankName, setBankName] = useState('Eastern Bank PLC');
  const [branch, setBranch] = useState('Principal Branch');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [maturityDate, setMaturityDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState<number>(0);
  const [payerName, setPayerName] = useState('');
  const [payeeName, setPayeeName] = useState('Poly Packaging Industries Ltd.');
  const [notes, setNotes] = useState('');

  // Status update modal
  const [statusModalCheque, setStatusModalCheque] = useState<ChequeRecord | null>(null);
  const [newStatus, setNewStatus] = useState<ChequeRecord['status']>('Deposited');
  const [depositBank, setDepositBank] = useState('City Bank Ltd. A/C 1102938481');

  const handleSaveCheque = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chequeNo || !amount || !payerName) {
      alert('Please fill in Cheque #, Amount, and Payer Name.');
      return;
    }

    const newCheque: ChequeRecord = {
      id: `chq-${Date.now()}`,
      chequeNo,
      bankName,
      branch,
      issueDate,
      maturityDate,
      amount,
      payerName,
      payeeName,
      status: 'In Hand',
      notes
    };

    onAddCheque(newCheque);
    setIsModalOpen(false);
    // Reset
    setChequeNo('');
    setAmount(0);
    setPayerName('');
    setNotes('');
  };

  const handleApplyStatusChange = () => {
    if (!statusModalCheque) return;
    onUpdateStatus(statusModalCheque.id, newStatus, depositBank);

    if (newStatus === 'Deposited' || newStatus === 'Cleared') {
      const targetBankStr = (depositBank || statusModalCheque.depositBank || statusModalCheque.bankName || 'Pubali Bank PLC').trim();
      const [parsedBankPart, parsedAccPart] = targetBankStr.split(/\s+A\/C\s+/i);
      const bankTitle = (parsedBankPart || targetBankStr || 'Pubali Bank PLC').trim();
      const accountTitle = (parsedAccPart || 'Padma Enterprise').trim();
      const depDateStr = formatDateDDMMYY(new Date());
      const nowIso = new Date().toISOString();
      const depositId = `chq-dep-${statusModalCheque.id}`;

      const chequeDepositRecord: any = {
        id: depositId,
        slipNo: `CHQ-${statusModalCheque.chequeNo || statusModalCheque.id.slice(-5)}`,
        voucherNo: statusModalCheque.chequeNo || undefined,
        chequeNo: statusModalCheque.chequeNo || undefined,
        date: depDateStr,
        depositDate: depDateStr,
        bankName: bankTitle,
        targetBankName: bankTitle,
        accountNumber: parsedAccPart || '1102938481001',
        accountName: accountTitle,
        accountTitle: accountTitle,
        displayTag: targetBankStr,
        depositType: 'Cheque Deposit',
        customerName: statusModalCheque.payerName,
        partyName: statusModalCheque.payerName,
        entityName: statusModalCheque.branch || 'Madhupur Sales Center',
        branchName: statusModalCheque.branch || 'Madhupur Sales Center',
        amount: Number(statusModalCheque.amount) || 0,
        referenceCode: statusModalCheque.chequeNo || depositId,
        depositedBy: 'Accounts Officer',
        status: newStatus === 'Cleared' ? 'Confirmed' : 'Pending Clearing',
        notes: statusModalCheque.notes || `Cheque #${statusModalCheque.chequeNo} (${newStatus})`,
        remarks: `Cheque #${statusModalCheque.chequeNo} (${statusModalCheque.payerName}) — ${newStatus}`,
        savedAt: nowIso,
        updatedAt: nowIso
      };

      const mergeAndSaveDeposits = (): any[] => {
        const mergedMap = new Map<string, any>();
        mergedMap.set(depositId, chequeDepositRecord);

        const collectFromKey = (storageKey: string) => {
          try {
            const raw = localStorage.getItem(storageKey);
            if (!raw) return;
            const existing = JSON.parse(raw);
            if (!Array.isArray(existing)) return;
            existing.forEach((item: any) => {
              if (
                !item ||
                typeof item !== 'object' ||
                !item.id ||
                item.isAutoDeposit ||
                String(item.id).startsWith('auto-ho-') ||
                isGloballyDeletedId(item.id)
              ) {
                return;
              }
              if (!mergedMap.has(item.id)) {
                mergedMap.set(item.id, item);
              }
            });
          } catch {}
        };

        collectFromKey('polycables_bank_deposits');
        collectFromKey('depositHistory');

        const next = Array.from(mergedMap.values());
        try {
          localStorage.setItem('polycables_bank_deposits', JSON.stringify(next));
          localStorage.setItem('depositHistory', JSON.stringify(next));
        } catch {}
        return next;
      };

      const syncedBankDeposits = mergeAndSaveDeposits();

      if (onAddDeposit) {
        onAddDeposit(chequeDepositRecord);
      }

      window.dispatchEvent(
        new CustomEvent('polycables_deposits_updated', {
          detail: { deposit: chequeDepositRecord, deposits: syncedBankDeposits }
        })
      );

      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch: { bankDeposits: syncedBankDeposits } })
      }).catch(() => {});
    }

    setStatusModalCheque(null);
  };

  const filtered = cheques.filter(chq => {
    const matchesStatus = statusFilter === 'ALL' || chq.status === statusFilter;
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      chq.chequeNo.toLowerCase().includes(searchLower) ||
      chq.payerName.toLowerCase().includes(searchLower) ||
      chq.bankName.toLowerCase().includes(searchLower) ||
      chq.branch.toLowerCase().includes(searchLower);
    return matchesStatus && matchesSearch;
  });

  const totalInHandAmount = cheques.filter(c => c.status === 'In Hand').reduce((acc, c) => acc + c.amount, 0);
  const totalDepositedAmount = cheques.filter(c => c.status === 'Deposited').reduce((acc, c) => acc + c.amount, 0);
  const totalClearedAmount = cheques.filter(c => c.status === 'Cleared').reduce((acc, c) => acc + c.amount, 0);

  return (
    <div id="cheque-in-hand-page-wrapper" className="space-y-6">
      {/* Required: Right side Back and Close buttons */}
      <PageHeaderWithActions
        idPrefix="cheque-in-hand-page"
        title="Cheque In Hand & Clearing Register"
        subtitle="Manage received customer post-dated cheques, transit tracking, deposit slips & clearance status"
        badge={`${cheques.filter(c => c.status === 'In Hand').length} Cheques In Hand`}
        badgeColor="bg-indigo-500/20 text-indigo-200 border-indigo-400/35"
        icon={CreditCard}
        onBack={onBack}
        onClose={onClose}
        extraActions={
          <button
            type="button"
            id="btn-open-cheque-modal"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-black text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg shadow-[0_0_18px_rgba(34,211,238,0.28)] transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Receive Cheque</span>
          </button>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="cyber-glass-subcard p-5 rounded-xl border border-indigo-400/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Cheques In Hand (Undeposited)</span>
            <div className="p-2 bg-indigo-500/15 border border-indigo-400/30 rounded-lg text-indigo-300">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-white mt-2">৳{totalInHandAmount.toLocaleString()}</div>
          <p className="text-xs text-indigo-300 font-medium mt-1">
            {cheques.filter(c => c.status === 'In Hand').length} physical cheques in safe
          </p>
        </div>

        <div className="cyber-glass-subcard p-5 rounded-xl border border-amber-400/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Deposited (Awaiting BEFTN)</span>
            <div className="p-2 bg-amber-500/15 border border-amber-400/30 rounded-lg text-amber-300">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-300 mt-2">৳{totalDepositedAmount.toLocaleString()}</div>
          <p className="text-xs text-slate-400 mt-1">
            {cheques.filter(c => c.status === 'Deposited').length} cheques in clearing house
          </p>
        </div>

        <div className="cyber-glass-subcard p-5 rounded-xl border border-emerald-400/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Cleared & Realized</span>
            <div className="p-2 bg-emerald-500/15 border border-emerald-400/30 rounded-lg text-emerald-300">
              <CheckCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-300 mt-2">৳{totalClearedAmount.toLocaleString()}</div>
          <p className="text-xs text-slate-400 mt-1">Credited to business account</p>
        </div>
      </div>

      {/* Cheques Table */}
      <div className="cyber-glass-card rounded-2xl overflow-hidden text-white">
        <div className="p-4 border-b border-cyan-500/20 bg-[#0b2334]/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-cyan-400/80 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                id="input-cheque-search"
                placeholder="Search cheque #, client, bank..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="py-1.5 px-3 text-xs border border-cyan-500/30 rounded-lg bg-[#061520] font-medium text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="In Hand">In Hand</option>
              <option value="Deposited">Deposited</option>
              <option value="Cleared">Cleared</option>
              <option value="Bounced">Bounced</option>
            </select>
          </div>

          <span className="text-xs text-cyan-200/80 font-medium">
            Showing {filtered.length} of {cheques.length} cheque entries
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-200">
            <thead className="bg-[#0c2638] text-xs font-semibold text-cyan-200 uppercase tracking-wider border-b border-cyan-500/30">
              <tr>
                <th className="py-3 px-4">Cheque # & Bank Logo</th>
                <th className="py-3 px-4">Payer / Customer</th>
                <th className="py-3 px-4">Maturity Date</th>
                <th className="py-3 px-4 text-right">Cheque Amount</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 text-sm">
                    No cheques found matching criteria.
                  </td>
                </tr>
              ) : (
                filtered.map(chq => (
                  <tr key={chq.id} className="hover:bg-cyan-500/[0.06] transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-cyan-200 font-mono text-xs">{chq.chequeNo}</div>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <BankLogoBadge bankName={chq.bankName} size="sm" />
                        <span>{chq.branch}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">{chq.payerName}</div>
                      <div className="text-[11px] text-slate-400">Payable to: {chq.payeeName}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-200 text-xs">{chq.maturityDate}</div>
                      <div className="text-[11px] text-slate-400">Issued: {chq.issueDate}</div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="font-bold text-white font-mono">৳{chq.amount.toLocaleString()}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        chq.status === 'In Hand' ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/35' :
                        chq.status === 'Deposited' ? 'bg-amber-500/20 text-amber-200 border border-amber-400/35' :
                        chq.status === 'Cleared' ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/35' :
                        'bg-rose-500/20 text-rose-200 border border-rose-400/35'
                      }`}>
                        {chq.status}
                      </span>
                      {chq.depositBank && (
                        <div className="text-[10px] text-slate-400 mt-0.5">Dep: {chq.depositBank}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setStatusModalCheque(chq);
                          setNewStatus(chq.status === 'In Hand' ? 'Deposited' : 'Cleared');
                        }}
                        className="px-2.5 py-1 text-xs font-semibold text-cyan-200 hover:text-white bg-[#081b28] hover:bg-cyan-500/20 border border-cyan-500/30 rounded-md transition-colors shadow-2xs cursor-pointer"
                      >
                        Update Status
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Cheque Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030d14]/80 p-4 backdrop-blur-sm">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl max-w-md w-full p-6 shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 text-white animate-in fade-in zoom-in-95">
            <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-cyan-400" />
              Receive Customer Cheque
            </h2>
            <p className="text-xs text-slate-300 mb-4">
              Enter cheque details to store safely in the Cheque In Hand vault register.
            </p>

            <form onSubmit={handleSaveCheque} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-cyan-200 mb-1">Cheque Number *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CHQ-8829104"
                  value={chequeNo}
                  onChange={e => setChequeNo(e.target.value)}
                  className="w-full text-sm font-mono px-3 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-cyan-200 mb-1">Payer (Customer Name) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Textile & Garments Ltd."
                  value={payerName}
                  onChange={e => setPayerName(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-cyan-200 mb-1">Drawee Bank Name</label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={e => setBankName(e.target.value)}
                    className="w-full text-xs px-2.5 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-cyan-200 mb-1">Branch</label>
                  <input
                    type="text"
                    value={branch}
                    onChange={e => setBranch(e.target.value)}
                    className="w-full text-xs px-2.5 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-cyan-200 mb-1">Maturity / Due Date (dd.mm.yy)</label>
                  <DateInputWithPicker
                    value={maturityDate}
                    onChange={setMaturityDate}
                    valueFormat="iso"
                    theme="dark"
                    inputClassName="py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-cyan-200 mb-1">Cheque Amount (৳) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="any"
                    value={amount || ''}
                    onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                    className="w-full text-sm font-bold px-2.5 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-cyan-200 mb-1">Notes / Invoice Reference</label>
                <input
                  type="text"
                  placeholder="e.g. Against Invoice INV-2026-0841"
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
                  Save In Hand
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update Status Modal */}
      {statusModalCheque && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030d14]/80 p-4 backdrop-blur-sm">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl max-w-sm w-full p-5 shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 text-white animate-in fade-in zoom-in-95">
            <h3 className="text-base font-bold text-white mb-2">Update Cheque #{statusModalCheque.chequeNo}</h3>
            <p className="text-xs text-slate-300 mb-4">
              Amount: <strong className="text-cyan-300">৳{statusModalCheque.amount.toLocaleString()}</strong> from {statusModalCheque.payerName}
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-cyan-200 mb-1">New Cheque Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as any)}
                  className="w-full text-xs px-2.5 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                >
                  <option value="In Hand">In Hand (Vault)</option>
                  <option value="Deposited">Deposited (Awaiting BEFTN Clearing)</option>
                  <option value="Cleared">Cleared (Funds Realized)</option>
                  <option value="Bounced">Bounced / Dishonored</option>
                  <option value="Returned">Returned to Customer</option>
                </select>
              </div>

              {(newStatus === 'Deposited' || newStatus === 'Cleared') && (
                <div>
                  <label className="block text-xs font-semibold text-cyan-200 mb-1">Deposit Target Bank Account</label>
                  <input
                    type="text"
                    value={depositBank}
                    onChange={(e) => setDepositBank(e.target.value)}
                    className="w-full text-xs px-2.5 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-cyan-500/20">
                <button
                  type="button"
                  onClick={() => setStatusModalCheque(null)}
                  className="px-3 py-1.5 text-xs text-slate-200 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 rounded-md cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyStatusChange}
                  className="px-3.5 py-1.5 text-xs font-black text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-md shadow-xs cursor-pointer"
                >
                  Confirm Update
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
