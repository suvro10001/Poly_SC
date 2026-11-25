import React, { useState } from 'react';
import {
  X,
  Calendar,
  Building2,
  User,
  MapPin,
  FileText,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { BankDeposit, Party, Salesperson } from '../types';
import { formatDateDDMMYY, parseDateToISO } from '../utils/dateUtils';
import { isMarketingOfficer } from '../utils/branchAccess';

interface EditHoDepositModalProps {
  deposit: BankDeposit;
  parties: Party[];
  allSalespersons: Salesperson[];
  onSave: (updated: BankDeposit) => void;
  onClose: () => void;
}

export const EditHoDepositModal: React.FC<EditHoDepositModalProps> = ({
  deposit,
  parties = [],
  allSalespersons = [],
  onSave,
  onClose
}) => {
  const [date, setDate] = useState<string>(() => formatDateDDMMYY(deposit.date));
  const [depositDate, setDepositDate] = useState<string>(() =>
    deposit.depositDate ? formatDateDDMMYY(deposit.depositDate) : formatDateDDMMYY(deposit.date)
  );
  const [customerName, setCustomerName] = useState<string>(
    deposit.customerName || deposit.partyName || ''
  );
  const [customerAddress, setCustomerAddress] = useState<string>(
    deposit.customerAddress || 'Madhupur'
  );
  const [marketingPerson, setMarketingPerson] = useState<string>(
    deposit.marketingPerson || 'Sonjoy Chowhan'
  );
  const [amount, setAmount] = useState<string>(String(deposit.amount || ''));
  const [remarks, setRemarks] = useState<string>(deposit.remarks || '');
  const [error, setError] = useState<string | null>(null);

  const handlePartySelect = (name: string) => {
    setCustomerName(name);
    const matched = parties.find((p) => p.name === name);
    if (matched) {
      if (matched.address) setCustomerAddress(matched.address);
      if (matched.salespersonName || (matched as any).salesperson) setMarketingPerson(matched.salespersonName || (matched as any).salesperson);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      setError('Please enter a valid amount.');
      return;
    }
    if (!customerName.trim()) {
      setError('Please provide a party or customer name.');
      return;
    }

    const updated: BankDeposit = {
      ...deposit,
      date: date.trim() || formatDateDDMMYY(new Date().toISOString()),
      depositDate: depositDate.trim() || date.trim(),
      customerName: customerName.trim(),
      partyName: customerName.trim(),
      customerAddress: customerAddress.trim() || 'Madhupur',
      marketingPerson: marketingPerson.trim() || 'Sonjoy Chowhan',
      amount: num,
      remarks: remarks.trim()
    };

    onSave(updated);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-lg w-full border border-cyan-400/35 text-white overflow-hidden">
        {/* Header */}
        <div className="bg-[#0c2638]/90 border-b border-cyan-500/25 text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-amber-500/20 border border-amber-400/35 rounded-xl">
              <Building2 className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black tracking-wide text-white">
                Edit H/O Deposited Entry
              </h3>
              <p className="text-xs text-cyan-200/80 font-medium">
                Head Office Deposit & Party Ledger Settlement
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-cyan-500/15 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs sm:text-sm text-slate-200">
          {error && (
            <div className="p-3 bg-rose-500/15 border border-rose-400/35 text-rose-200 text-xs rounded-xl font-bold flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-cyan-200 block mb-1">Collection Date:</label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  onBlur={() => {
                    if (date.trim()) setDate(formatDateDDMMYY(date));
                  }}
                  placeholder="dd.mm.yy"
                  required
                  className="w-full p-2.5 pr-8 border border-cyan-500/30 rounded-lg text-xs font-mono font-bold bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                />
                <input
                  type="date"
                  value={parseDateToISO(date)}
                  onChange={(e) => {
                    if (e.target.value) setDate(formatDateDDMMYY(e.target.value));
                  }}
                  className="opacity-0 absolute right-1 w-6 h-6 cursor-pointer"
                  title="Pick Date"
                />
                <Calendar className="w-4 h-4 text-cyan-400/80 absolute right-2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-cyan-200 block mb-1">H/O Deposite Date:</label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={depositDate}
                  onChange={(e) => setDepositDate(e.target.value)}
                  onBlur={() => {
                    if (depositDate.trim()) setDepositDate(formatDateDDMMYY(depositDate));
                  }}
                  placeholder="dd.mm.yy"
                  className="w-full p-2.5 pr-8 border border-cyan-500/30 rounded-lg text-xs font-mono font-bold bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                />
                <input
                  type="date"
                  value={parseDateToISO(depositDate)}
                  onChange={(e) => {
                    if (e.target.value) setDepositDate(formatDateDDMMYY(e.target.value));
                  }}
                  className="opacity-0 absolute right-1 w-6 h-6 cursor-pointer"
                  title="Pick Deposit Date"
                />
                <Calendar className="w-4 h-4 text-cyan-400/80 absolute right-2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Party Name */}
          <div>
            <label className="text-xs font-bold text-cyan-200 block mb-1">Party Name:</label>
            <div className="space-y-1.5">
              <select
                value={parties.some((p) => p.name === customerName) ? customerName : ''}
                onChange={(e) => {
                  if (e.target.value) handlePartySelect(e.target.value);
                }}
                className="w-full p-2 border border-cyan-500/30 rounded-lg text-xs font-bold text-white bg-[#061520] focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              >
                <option value="">-- Select from Master Party Directory --</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name} {p.address ? `(${p.address})` : ''}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Or type party name manually..."
                required
                className="w-full p-2.5 border border-cyan-500/30 rounded-lg text-xs font-bold text-white bg-[#061520] placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Address & Marketing Person */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-cyan-200 block mb-1">Party Address:</label>
              <div className="relative">
                <input
                  type="text"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder="Madhupur"
                  className="w-full p-2.5 pl-7 border border-cyan-500/30 rounded-lg text-xs font-medium text-white bg-[#061520] placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                />
                <MapPin className="w-3.5 h-3.5 text-cyan-400/80 absolute left-2 top-3" />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-cyan-200 block mb-1">Marketing Officer:</label>
              <div className="relative">
                <select
                  value={marketingPerson}
                  onChange={(e) => setMarketingPerson(e.target.value)}
                  className="w-full p-2.5 pl-7 border border-cyan-500/30 rounded-lg text-xs font-semibold text-white bg-[#061520] focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                >
                  <option value="Sonjoy Chowhan">Sonjoy Chowhan</option>
                  {allSalespersons.filter(isMarketingOfficer).map((sp) => (
                    <option key={sp.id} value={sp.name}>
                      {sp.name}
                    </option>
                  ))}
                </select>
                <User className="w-3.5 h-3.5 text-cyan-400/80 absolute left-2 top-3 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs font-bold text-cyan-200 block mb-1">Amount (Tk):</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-amber-300 font-extrabold text-sm">৳</span>
              <input
                type="number"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
                className="w-full p-2.5 pl-8 border border-amber-400/40 rounded-lg text-base font-black text-amber-200 bg-[#061520] placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="text-xs font-bold text-cyan-200 block mb-1">Remarks / Note:</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. H/O settlement for showroom rent / transport"
              className="w-full p-2.5 border border-cyan-500/30 rounded-lg text-xs text-white bg-[#061520] placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
            />
          </div>

          {/* Helpful Callout */}
          <div className="p-3 bg-amber-500/15 rounded-xl border border-amber-400/35 text-[11px] text-amber-200 leading-normal flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
            <span>
              Saving changes will synchronize this H/O Deposit, update the linked Cash Collection MR, and update any linked Expense voucher. If you delete this entry instead, the amount will be restored to <strong>Cash In Hand</strong>.
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-2.5 pt-3 border-t border-cyan-500/20">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-200 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-black text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
