import React, { useState } from 'react';
import { CashTransaction } from '../types';
import { PageHeaderWithActions } from './PageHeaderWithActions';
import { 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Plus, 
  Search, 
  Calendar, 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  FileSpreadsheet
} from 'lucide-react';

interface CashInHandPageProps {
  transactions: CashTransaction[];
  onAddTransaction: (tx: CashTransaction) => void;
  onBack: () => void;
  onClose: () => void;
}

export const CashInHandPage: React.FC<CashInHandPageProps> = ({
  transactions,
  onAddTransaction,
  onBack,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [type, setType] = useState<'IN' | 'OUT'>('IN');
  const [amount, setAmount] = useState<number>(0);
  const [category, setCategory] = useState('Sales Receipt');
  const [recipientOrPayer, setRecipientOrPayer] = useState('');
  const [description, setDescription] = useState('');
  const [referenceNo, setReferenceNo] = useState('');

  // Calculate Running Balance
  const totalIn = transactions.filter(t => t.type === 'IN').reduce((acc, t) => acc + t.amount, 0);
  const totalOut = transactions.filter(t => t.type === 'OUT').reduce((acc, t) => acc + t.amount, 0);
  const netCashInHand = totalIn - totalOut;

  const handleSaveTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0 || !recipientOrPayer) {
      alert('Please enter valid amount and payer/recipient details.');
      return;
    }

    const currentBalance = netCashInHand;
    const updatedBalance = type === 'IN' ? currentBalance + amount : currentBalance - amount;

    const newTx: CashTransaction = {
      id: `cash-${Date.now()}`,
      voucherNo: `CSH-${type}-${Math.floor(1000 + Math.random() * 9000)}`,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type,
      category,
      amount,
      description: description || `${type === 'IN' ? 'Received from' : 'Paid to'} ${recipientOrPayer}`,
      recipientOrPayer,
      balanceAfter: updatedBalance,
      referenceNo: referenceNo || undefined
    };

    onAddTransaction(newTx);
    setIsModalOpen(false);
    // Reset
    setAmount(0);
    setRecipientOrPayer('');
    setDescription('');
    setReferenceNo('');
  };

  const filtered = transactions.filter(t => {
    const matchesType = typeFilter === 'ALL' || t.type === typeFilter;
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      t.voucherNo.toLowerCase().includes(searchLower) ||
      t.recipientOrPayer.toLowerCase().includes(searchLower) ||
      t.category.toLowerCase().includes(searchLower) ||
      t.description.toLowerCase().includes(searchLower);
    return matchesType && matchesSearch;
  });

  return (
    <div id="cash-in-hand-page-wrapper" className="space-y-6">
      {/* Required: Right side Back and Close buttons */}
      <PageHeaderWithActions
        idPrefix="cash-in-hand-page"
        title="Cash In Hand & Petty Vault"
        subtitle="Real-time register for counter cash, daily collection, drawer balances & petty disbursements"
        badge="Active Register"
        badgeColor="bg-emerald-500/20 text-emerald-200 border-emerald-400/35"
        icon={Wallet}
        onBack={onBack}
        onClose={onClose}
        extraActions={
          <button
            type="button"
            id="btn-open-cash-modal"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-black text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-[0_0_18px_rgba(16,185,129,0.28)] transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Record Cash Entry</span>
          </button>
        }
      />

      {/* Cash Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="cyber-glass-subcard p-5 rounded-xl border border-emerald-500/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Net Cash in Vault</span>
            <div className="p-2 bg-emerald-500/15 border border-emerald-400/30 rounded-lg text-emerald-300">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-white mt-2">৳{netCashInHand.toLocaleString()}</div>
          <p className="text-xs text-emerald-300 font-medium mt-1">Available for physical drawer operations</p>
        </div>

        <div className="cyber-glass-subcard p-5 rounded-xl border border-cyan-500/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Total Cash In (Receipts)</span>
            <div className="p-2 bg-cyan-500/15 border border-cyan-400/30 rounded-lg text-cyan-300">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-cyan-300 mt-2">৳{totalIn.toLocaleString()}</div>
          <p className="text-xs text-slate-400 mt-1">From invoice collections & advances</p>
        </div>

        <div className="cyber-glass-subcard p-5 rounded-xl border border-rose-500/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Total Cash Out (Payments)</span>
            <div className="p-2 bg-rose-500/15 border border-rose-400/30 rounded-lg text-rose-300">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-rose-300 mt-2">৳{totalOut.toLocaleString()}</div>
          <p className="text-xs text-slate-400 mt-1">For factory wages, fuel & bank deposits</p>
        </div>
      </div>

      {/* Transactions Register */}
      <div className="cyber-glass-card rounded-2xl overflow-hidden text-white">
        <div className="p-4 border-b border-cyan-500/20 bg-[#0b2334]/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-cyan-400/80 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                id="input-cash-search"
                placeholder="Search voucher, party, remarks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              />
            </div>

            <div className="inline-flex rounded-lg border border-cyan-500/30 p-0.5 bg-[#061520]">
              <button
                type="button"
                onClick={() => setTypeFilter('ALL')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${typeFilter === 'ALL' ? 'bg-cyan-500 text-slate-950 font-black' : 'text-slate-300 hover:text-white'}`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('IN')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${typeFilter === 'IN' ? 'bg-emerald-500 text-slate-950 font-black' : 'text-slate-300 hover:text-white'}`}
              >
                Cash In
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('OUT')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${typeFilter === 'OUT' ? 'bg-rose-500 text-white font-black' : 'text-slate-300 hover:text-white'}`}
              >
                Cash Out
              </button>
            </div>
          </div>

          <span className="text-xs text-cyan-200/80 font-medium">
            {filtered.length} entries registered
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-200">
            <thead className="bg-[#0c2638] text-xs font-semibold text-cyan-200 uppercase tracking-wider border-b border-cyan-500/30">
              <tr>
                <th className="py-3 px-4">Voucher No & Date</th>
                <th className="py-3 px-4">Party / Source</th>
                <th className="py-3 px-4">Category & Purpose</th>
                <th className="py-3 px-4 text-right">Cash In (+)</th>
                <th className="py-3 px-4 text-right">Cash Out (-)</th>
                <th className="py-3 px-4 text-right">Balance After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 text-sm">
                    No cash transactions found.
                  </td>
                </tr>
              ) : (
                filtered.map(tx => (
                  <tr key={tx.id} className="hover:bg-cyan-500/[0.06] transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-cyan-200 font-mono text-xs">{tx.voucherNo}</div>
                      <div className="text-xs text-slate-400">{tx.date} • {tx.time}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">{tx.recipientOrPayer}</div>
                      {tx.referenceNo && (
                        <div className="text-[11px] text-slate-400">Ref: {tx.referenceNo}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-block px-2 py-0.5 text-xs font-medium bg-cyan-500/15 text-cyan-200 border border-cyan-500/25 rounded mb-1">
                        {tx.category}
                      </span>
                      <div className="text-xs text-slate-300 line-clamp-1">{tx.description}</div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {tx.type === 'IN' ? (
                        <span className="font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-400/30 px-2 py-0.5 rounded">
                          +৳{tx.amount.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {tx.type === 'OUT' ? (
                        <span className="font-bold text-rose-300 bg-rose-500/15 border border-rose-400/30 px-2 py-0.5 rounded">
                          -৳{tx.amount.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-white">
                      ৳{tx.balanceAfter.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Cash Entry Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030d14]/80 p-4 backdrop-blur-sm">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl max-w-md w-full p-6 shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 text-white animate-in fade-in zoom-in-95">
            <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-400" />
              Record Cash Voucher
            </h2>
            <p className="text-xs text-slate-300 mb-4">
              Enter cash received into drawer or cash disbursed for operations.
            </p>

            <form onSubmit={handleSaveTransaction} className="space-y-3.5">
              <div className="flex rounded-lg border border-cyan-500/30 p-1 bg-[#061520]">
                <button
                  type="button"
                  onClick={() => setType('IN')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${type === 'IN' ? 'bg-emerald-500 text-slate-950 font-black shadow-xs' : 'text-slate-300 hover:text-white'}`}
                >
                  <ArrowDownLeft className="w-3.5 h-3.5" /> Cash IN (Received)
                </button>
                <button
                  type="button"
                  onClick={() => setType('OUT')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${type === 'OUT' ? 'bg-rose-500 text-white font-black shadow-xs' : 'text-slate-300 hover:text-white'}`}
                >
                  <ArrowUpRight className="w-3.5 h-3.5" /> Cash OUT (Paid)
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-cyan-200 mb-1">Cash Amount (৳) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="any"
                  placeholder="0.00"
                  value={amount || ''}
                  onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                  className="w-full text-base font-bold px-3 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-cyan-200 mb-1">
                  {type === 'IN' ? 'Received From (Payer Name) *' : 'Paid To (Recipient / Vendor) *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Garments or Padma Fuel Station"
                  value={recipientOrPayer}
                  onChange={e => setRecipientOrPayer(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-cyan-200 mb-1">Category</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full text-xs px-2.5 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  >
                    {type === 'IN' ? (
                      <>
                        <option value="Sales Invoice Payment">Sales Invoice Payment</option>
                        <option value="Direct Customer Advance">Direct Customer Advance</option>
                        <option value="Bank Cash Withdrawal">Bank Cash Withdrawal</option>
                        <option value="Owner Capital Infusion">Owner Capital Infusion</option>
                        <option value="Miscellaneous Income">Miscellaneous Income</option>
                      </>
                    ) : (
                      <>
                        <option value="Factory Utility & Fuel">Factory Utility & Fuel</option>
                        <option value="Raw Materials & Masterbatch">Raw Materials & Masterbatch</option>
                        <option value="Bank Cash Deposit">Bank Cash Deposit</option>
                        <option value="Staff Daily Wages">Staff Daily Wages</option>
                        <option value="Transportation & Logistics">Transportation & Logistics</option>
                        <option value="Office Refreshment & Tea">Office Refreshment & Tea</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-cyan-200 mb-1">Ref / Invoice No</label>
                  <input
                    type="text"
                    placeholder="INV / EXP ref"
                    value={referenceNo}
                    onChange={e => setReferenceNo(e.target.value)}
                    className="w-full text-xs px-2.5 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-cyan-200 mb-1">Description / Notes</label>
                <textarea
                  rows={2}
                  placeholder="Purpose of cash transaction..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400 resize-none focus:ring-2 focus:ring-cyan-400 focus:outline-none"
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
                  className="px-4 py-2 text-xs font-black text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-xs cursor-pointer"
                >
                  Save Cash Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
