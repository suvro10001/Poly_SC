import React, { useState, useEffect, useMemo } from 'react';
import { 
  Building2, 
  Calendar, 
  Check, 
  DollarSign, 
  Landmark, 
  Plus, 
  Users, 
  X, 
  AlertCircle,
  Sparkles,
  Search,
  CheckCircle2
} from 'lucide-react';
import { Party, MonthEndExpenseSettlement } from '../types';
import { formatDateDDMMYY, parseDateToISO } from '../utils/dateUtils';
import { DateInputWithPicker } from './DateInputWithPicker';

interface MonthEndClosingModalProps {
  isOpen: boolean;
  onClose: () => void;
  monthKey: string; // YYYY-MM e.g. "2026-09"
  monthDisplay: string; // e.g. "September 2026"
  totalExpenses: number;
  parties: Party[];
  existingSettlement?: MonthEndExpenseSettlement | null;
  onSaveSettlement: (settlement: MonthEndExpenseSettlement) => void;
}

export const MonthEndClosingModal: React.FC<MonthEndClosingModalProps> = ({
  isOpen,
  onClose,
  monthKey,
  monthDisplay,
  totalExpenses,
  parties = [],
  existingSettlement,
  onSaveSettlement
}) => {
  const [numParties, setNumParties] = useState<1 | 2>(
    existingSettlement?.parties && existingSettlement.parties.length > 1 ? 2 : 1
  );

  // Party 1 state
  const [party1Name, setParty1Name] = useState<string>(
    existingSettlement?.parties?.[0]?.partyName || ''
  );
  const [party1Address, setParty1Address] = useState<string>(
    existingSettlement?.parties?.[0]?.partyAddress || ''
  );
  const [party1Amount, setParty1Amount] = useState<string>(
    existingSettlement?.parties?.[0]
      ? String(existingSettlement.parties[0].amount)
      : String(totalExpenses)
  );

  // Party 2 state
  const [party2Name, setParty2Name] = useState<string>(
    existingSettlement?.parties?.[1]?.partyName || ''
  );
  const [party2Address, setParty2Address] = useState<string>(
    existingSettlement?.parties?.[1]?.partyAddress || ''
  );
  const [party2Amount, setParty2Amount] = useState<string>(
    existingSettlement?.parties?.[1] ? String(existingSettlement.parties[1].amount) : '0'
  );

  // Deposit Date: defaults to 01st of following month
  const defaultDepositDate = useMemo(() => {
    if (existingSettlement?.depositDate) return existingSettlement.depositDate;
    if (!monthKey || !monthKey.includes('-')) return '';
    const [yStr, mStr] = monthKey.split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10) + 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    return `01.${String(m).padStart(2, '0')}.${String(y).slice(-2)}`;
  }, [monthKey, existingSettlement]);

  const [depositDate, setDepositDate] = useState<string>(defaultDepositDate);
  const [party1Search, setParty1Search] = useState<string>('');
  const [party2Search, setParty2Search] = useState<string>('');
  const [showParty1List, setShowParty1List] = useState<boolean>(false);
  const [showParty2List, setShowParty2List] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Sync default values when modal opens or inputs change
  useEffect(() => {
    if (isOpen) {
      if (existingSettlement) {
        setNumParties(existingSettlement.parties.length > 1 ? 2 : 1);
        setParty1Name(existingSettlement.parties[0]?.partyName || '');
        setParty1Address(existingSettlement.parties[0]?.partyAddress || '');
        setParty1Amount(String(existingSettlement.parties[0]?.amount || totalExpenses));
        if (existingSettlement.parties[1]) {
          setParty2Name(existingSettlement.parties[1].partyName || '');
          setParty2Address(existingSettlement.parties[1].partyAddress || '');
          setParty2Amount(String(existingSettlement.parties[1].amount || 0));
        } else {
          setParty2Name('');
          setParty2Address('');
          setParty2Amount('0');
        }
        setDepositDate(existingSettlement.depositDate || defaultDepositDate);
      } else {
        setNumParties(1);
        setParty1Name('');
        setParty1Address('');
        setParty1Amount(String(totalExpenses));
        setParty2Name('');
        setParty2Address('');
        setParty2Amount('0');
        setDepositDate(defaultDepositDate);
      }
      setErrorMessage('');
    }
  }, [isOpen, existingSettlement, totalExpenses, defaultDepositDate]);

  // When switching to 1 party, set party1Amount to totalExpenses
  const handleToggleNumParties = (count: 1 | 2) => {
    setNumParties(count);
    if (count === 1) {
      setParty1Amount(String(totalExpenses));
      setParty2Amount('0');
    } else {
      const p1 = Number(party1Amount) || Math.floor(totalExpenses / 2);
      const safeP1 = p1 >= totalExpenses ? Math.floor(totalExpenses / 2) : p1;
      const p2 = Math.max(0, totalExpenses - safeP1);
      setParty1Amount(String(safeP1));
      setParty2Amount(String(p2));
    }
  };

  // Filtered party list for Party 1
  const filteredParties1 = useMemo(() => {
    if (!party1Search.trim()) return parties.slice(0, 50);
    const q = party1Search.toLowerCase();
    return parties.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.address && p.address.toLowerCase().includes(q))
    );
  }, [parties, party1Search]);

  // Filtered party list for Party 2
  const filteredParties2 = useMemo(() => {
    if (!party2Search.trim()) return parties.slice(0, 50);
    const q = party2Search.toLowerCase();
    return parties.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.address && p.address.toLowerCase().includes(q))
    );
  }, [parties, party2Search]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!party1Name.trim()) {
      setErrorMessage('Please specify or select Party 1 name for H/O deposit.');
      return;
    }

    const p1Amt = Number(party1Amount) || 0;
    if (p1Amt <= 0) {
      setErrorMessage('Party 1 deposit amount must be greater than 0.');
      return;
    }

    const finalParties: { partyName: string; partyAddress?: string; amount: number }[] = [
      {
        partyName: party1Name.trim(),
        partyAddress: party1Address.trim() || undefined,
        amount: p1Amt
      }
    ];

    if (numParties === 2) {
      if (!party2Name.trim()) {
        setErrorMessage('Please specify or select Party 2 name.');
        return;
      }
      const p2Amt = Number(party2Amount) || 0;
      if (p2Amt <= 0) {
        setErrorMessage('Party 2 deposit amount must be greater than 0.');
        return;
      }
      if (Math.abs(p1Amt + p2Amt - totalExpenses) > 1) {
        setErrorMessage(
          `Sum of Party 1 (৳${p1Amt.toLocaleString()}) + Party 2 (৳${p2Amt.toLocaleString()}) must equal total expenses (৳${totalExpenses.toLocaleString()}). Difference: ৳${Math.abs(p1Amt + p2Amt - totalExpenses).toLocaleString()}`
        );
        return;
      }
      finalParties.push({
        partyName: party2Name.trim(),
        partyAddress: party2Address.trim() || undefined,
        amount: p2Amt
      });
    }

    const settlement: MonthEndExpenseSettlement = {
      monthStr: monthKey,
      monthDisplay,
      totalExpenseAmount: totalExpenses,
      depositDate: depositDate.trim() ? formatDateDDMMYY(depositDate) : defaultDepositDate,
      parties: finalParties,
      closedAt: new Date().toISOString(),
      status: 'closed'
    };

    onSaveSettlement(settlement);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl shadow-inner">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full font-mono">
                  Month-End Closing
                </span>
                <span className="text-xs text-slate-300 font-bold font-mono">
                  {monthDisplay}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight mt-0.5">
                Deposit Total Expense Amount to H/O
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Prompt Explanation Banner */}
        <div className="bg-amber-50 border-b border-amber-200 p-3 px-4 sm:px-5 flex items-start space-x-2.5">
          <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-950 leading-relaxed font-medium">
            <span className="font-extrabold text-amber-900">Month-End Policy: </span>
            All monthly expenses (<span className="font-mono font-black text-amber-950">৳{totalExpenses.toLocaleString('en-IN')}</span>) are deposited to Head Office (<span className="font-bold">H/O</span>) under <span className="font-bold underline">one or two party names</span>. Specify which party to deposit, then close the month.
          </div>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="m-4 mb-0 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-2 text-rose-800 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          {/* Summary Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 sm:p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block">
                Total Month Expenses:
              </span>
              <span className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
                ৳{totalExpenses.toLocaleString('en-IN')}/-
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block">
                H/O Deposit Date:
              </span>
              <DateInputWithPicker
                value={depositDate}
                onChange={setDepositDate}
                valueFormat="ddmmyy"
                theme="light"
                className="w-28"
                inputClassName="py-1 text-center text-indigo-700 !rounded"
              />
            </div>
          </div>

          {/* 1 Party or 2 Parties Selector */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5 uppercase tracking-wide">
              How many parties to deposit under?
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleToggleNumParties(1)}
                className={`p-2.5 rounded-xl border text-xs font-extrabold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                  numParties === 1
                    ? 'bg-indigo-50 text-indigo-950 border-indigo-500 shadow-xs ring-1 ring-indigo-500'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <CheckCircle2 className={`w-4 h-4 ${numParties === 1 ? 'text-indigo-600' : 'text-slate-300'}`} />
                <span>1 Party Name (100% of Amount)</span>
              </button>
              <button
                type="button"
                onClick={() => handleToggleNumParties(2)}
                className={`p-2.5 rounded-xl border text-xs font-extrabold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                  numParties === 2
                    ? 'bg-purple-50 text-purple-950 border-purple-500 shadow-xs ring-1 ring-purple-500'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Users className={`w-4 h-4 ${numParties === 2 ? 'text-purple-600' : 'text-slate-300'}`} />
                <span>2 Party Names (Split Amount)</span>
              </button>
            </div>
          </div>

          {/* Party 1 Field */}
          <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-900 uppercase tracking-wide flex items-center space-x-1">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px]">1</span>
                <span>Party 1 Name (Deposit H/O):</span>
              </span>
              <span className="text-[11px] font-bold text-slate-500">
                Amount: <span className="text-slate-900 font-mono font-black">৳{Number(party1Amount || 0).toLocaleString('en-IN')}</span>
              </span>
            </div>

            <div className="relative">
              <input
                type="text"
                value={party1Name}
                onChange={(e) => {
                  setParty1Name(e.target.value);
                  setParty1Search(e.target.value);
                  setShowParty1List(true);
                }}
                onFocus={() => {
                  setParty1Search(party1Name);
                  setShowParty1List(true);
                }}
                placeholder="Search or type Party 1 name..."
                required
                className="w-full p-2 text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />

              {showParty1List && filteredParties1.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                  {filteredParties1.map((p, idx) => (
                    <div
                      key={p.id ? `${p.id}-${idx}` : `party1-${idx}`}
                      onClick={() => {
                        setParty1Name(p.name);
                        setParty1Address(p.address || '');
                        setShowParty1List(false);
                      }}
                      className="p-2 px-3 text-xs hover:bg-indigo-50 cursor-pointer flex items-center justify-between border-b border-slate-100 last:border-0"
                    >
                      <span className="font-extrabold text-slate-900">{p.name}</span>
                      <span className="text-[11px] text-slate-500">{p.address || 'Madhupur'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Split Amount Input for Party 1 */}
            {numParties === 2 && (
              <div className="pt-1 flex items-center space-x-2">
                <label className="text-[11px] font-bold text-slate-600 whitespace-nowrap">
                  Party 1 Deposit Amount (Tk):
                </label>
                <div className="relative flex-1">
                  <span className="absolute left-2.5 top-1.5 text-slate-400 font-bold text-xs">৳</span>
                  <input
                    type="number"
                    step="any"
                    value={party1Amount}
                    onChange={(e) => {
                      const val = e.target.value;
                      setParty1Amount(val);
                      const num = Number(val) || 0;
                      const rem = Math.max(0, totalExpenses - num);
                      setParty2Amount(String(rem));
                    }}
                    className="w-full pl-6 pr-2 py-1 text-xs font-mono font-black text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Party 2 Field (Only if numParties === 2) */}
          {numParties === 2 && (
            <div className="bg-purple-50/50 p-3.5 rounded-xl border border-purple-200 space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-purple-950 uppercase tracking-wide flex items-center space-x-1">
                  <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center text-[11px]">2</span>
                  <span>Party 2 Name (Deposit H/O):</span>
                </span>
                <span className="text-[11px] font-bold text-purple-800">
                  Amount: <span className="text-purple-950 font-mono font-black">৳{Number(party2Amount || 0).toLocaleString('en-IN')}</span>
                </span>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={party2Name}
                  onChange={(e) => {
                    setParty2Name(e.target.value);
                    setParty2Search(e.target.value);
                    setShowParty2List(true);
                  }}
                  onFocus={() => {
                    setParty2Search(party2Name);
                    setShowParty2List(true);
                  }}
                  placeholder="Search or type Party 2 name..."
                  required
                  className="w-full p-2 text-xs font-bold text-slate-900 bg-white border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />

                {showParty2List && filteredParties2.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                    {filteredParties2.map((p, idx) => (
                      <div
                        key={p.id ? `${p.id}-${idx}` : `party2-${idx}`}
                        onClick={() => {
                          setParty2Name(p.name);
                          setParty2Address(p.address || '');
                          setShowParty2List(false);
                        }}
                        className="p-2 px-3 text-xs hover:bg-purple-50 cursor-pointer flex items-center justify-between border-b border-slate-100 last:border-0"
                      >
                        <span className="font-extrabold text-slate-900">{p.name}</span>
                        <span className="text-[11px] text-slate-500">{p.address || 'Madhupur'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-1 flex items-center space-x-2">
                <label className="text-[11px] font-bold text-purple-900 whitespace-nowrap">
                  Party 2 Deposit Amount (Tk):
                </label>
                <div className="relative flex-1">
                  <span className="absolute left-2.5 top-1.5 text-purple-400 font-bold text-xs">৳</span>
                  <input
                    type="number"
                    step="any"
                    value={party2Amount}
                    onChange={(e) => {
                      const val = e.target.value;
                      setParty2Amount(val);
                      const num = Number(val) || 0;
                      const rem = Math.max(0, totalExpenses - num);
                      setParty1Amount(String(rem));
                    }}
                    className="w-full pl-6 pr-2 py-1 text-xs font-mono font-black text-slate-900 bg-white border border-purple-300 rounded-lg focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-md transition-all flex items-center space-x-2 cursor-pointer active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>Deposit to H/O & Close Month</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
