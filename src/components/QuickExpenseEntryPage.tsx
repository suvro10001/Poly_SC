import React, { useState } from 'react';
import { ExpenseRecord } from '../types';
import { PageHeaderWithActions } from './PageHeaderWithActions';
import { 
  Zap, 
  Plus, 
  CheckCircle2, 
  RotateCcw, 
  Fuel, 
  Wrench, 
  Truck, 
  Coffee, 
  Users, 
  Sparkles,
  Layers
} from 'lucide-react';

interface QuickExpenseEntryPageProps {
  onAddExpense: (exp: ExpenseRecord) => void;
  onBack: () => void;
  onClose: () => void;
}

const PRESET_CATEGORIES = [
  { id: 'fuel', name: 'Factory Generator Diesel', category: 'Factory Utility & Fuel', defaultPaidTo: 'Padma Fuel Station', icon: Fuel, color: 'border-amber-400/35 bg-amber-500/15 text-amber-200', defaultAmount: 4500 },
  { id: 'maintenance', name: 'Machine Teflon / Cutter Spare', category: 'Machinery Maintenance & Parts', defaultPaidTo: 'Delta Engineering', icon: Wrench, color: 'border-cyan-400/35 bg-cyan-500/15 text-cyan-200', defaultAmount: 2800 },
  { id: 'freight', name: 'Delivery Van Toll & Helper', category: 'Transportation & Logistics', defaultPaidTo: 'Highway Toll Counter', icon: Truck, color: 'border-purple-400/35 bg-purple-500/15 text-purple-200', defaultAmount: 1200 },
  { id: 'tea', name: 'Staff Tea & Factory Snacks', category: 'Office Refreshment & Snacks', defaultPaidTo: 'Factory Canteen', icon: Coffee, color: 'border-orange-400/35 bg-orange-500/15 text-orange-200', defaultAmount: 450 },
  { id: 'daily_wage', name: 'Casual Loading Labor Wage', category: 'Staff Daily Wages', defaultPaidTo: 'Labor Sardar', icon: Users, color: 'border-emerald-400/35 bg-emerald-500/15 text-emerald-200', defaultAmount: 1600 }
];

export const QuickExpenseEntryPage: React.FC<QuickExpenseEntryPageProps> = ({
  onAddExpense,
  onBack,
  onClose
}) => {
  const [selectedPreset, setSelectedPreset] = useState<string>(PRESET_CATEGORIES[0].id);
  const [amount, setAmount] = useState<number>(PRESET_CATEGORIES[0].defaultAmount);
  const [paidTo, setPaidTo] = useState<string>(PRESET_CATEGORIES[0].defaultPaidTo);
  const [category, setCategory] = useState<string>(PRESET_CATEGORIES[0].category);
  const [description, setDescription] = useState<string>('Routine factory operational cost');
  const [paymentMode, setPaymentMode] = useState<ExpenseRecord['paymentMode']>('Cash');
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const handleSelectPreset = (preset: typeof PRESET_CATEGORIES[0]) => {
    setSelectedPreset(preset.id);
    setCategory(preset.category);
    setPaidTo(preset.defaultPaidTo);
    setAmount(preset.defaultAmount);
    setDescription(`Quick logged: ${preset.name}`);
  };

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0 || !paidTo) {
      alert('Please enter valid amount and recipient.');
      return;
    }

    const newExp: ExpenseRecord = {
      id: `exp-quick-${Date.now()}`,
      expenseNo: `EXP-QK-${Math.floor(100 + Math.random() * 900)}`,
      date: new Date().toISOString().split('T')[0],
      category,
      amount,
      paymentMode,
      paidTo,
      authorizedBy: 'Petty Cash Desk Officer',
      description
    };

    onAddExpense(newExp);
    setSuccessToast(`Logged ৳${amount.toLocaleString()} for "${paidTo}" successfully!`);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  return (
    <div id="quick-expense-entry-page-wrapper" className="space-y-6">
      {/* Required: Right side Back and Close buttons */}
      <PageHeaderWithActions
        idPrefix="quick-expense-page"
        title="Quick Expense Entry"
        subtitle="1-Click rapid logging for frequent factory petty expenses, fuel, labor & supplies"
        badge="Rapid Dispatch"
        badgeColor="bg-amber-500/20 text-amber-200 border-amber-400/35"
        icon={Zap}
        onBack={onBack}
        onClose={onClose}
      />

      {successToast && (
        <div className="p-4 bg-emerald-500/15 border border-emerald-400/35 text-emerald-200 rounded-xl flex items-center gap-2 shadow-xs animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
          <span className="text-sm font-semibold">{successToast}</span>
        </div>
      )}

      {/* Preset Quick Chips */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-cyan-200 mb-2">
          Select Frequent Preset Shortcut:
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {PRESET_CATEGORIES.map(preset => {
            const Icon = preset.icon;
            const isSelected = selectedPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer backdrop-blur-md ${preset.color} ${
                  isSelected ? 'ring-2 ring-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.2)] scale-102' : 'opacity-85 hover:opacity-100 shadow-2xs'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-bold">৳{preset.defaultAmount}</span>
                </div>
                <div className="mt-3">
                  <div className="text-xs font-bold leading-tight text-white">{preset.name}</div>
                  <div className="text-[10px] opacity-80 mt-0.5">{preset.category}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick Entry Form */}
      <div className="cyber-glass-card p-6 rounded-2xl max-w-2xl mx-auto text-white">
        <form onSubmit={handleQuickSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-cyan-200 mb-1">Expense Category *</label>
              <input
                type="text"
                required
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-cyan-200 mb-1">Amount to Disburse (৳) *</label>
              <input
                type="number"
                required
                min="1"
                step="any"
                value={amount || ''}
                onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                className="w-full text-lg font-black px-3 py-1.5 border border-amber-400/40 rounded-lg text-amber-200 bg-[#061520] focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-cyan-200 mb-1">Paid To (Vendor / Person) *</label>
              <input
                type="text"
                required
                value={paidTo}
                onChange={e => setPaidTo(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-cyan-200 mb-1">Payment Method</label>
              <select
                value={paymentMode}
                onChange={e => setPaymentMode(e.target.value as any)}
                className="w-full text-xs px-3 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              >
                <option value="Cash">Cash (Immediate Petty Drawer)</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-cyan-200 mb-1">Quick Note / Remarks</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
            />
          </div>

          <div className="pt-2 flex justify-end gap-3 border-t border-cyan-500/20">
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2 text-xs font-semibold text-slate-200 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 rounded-lg cursor-pointer"
            >
              Back
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 text-sm font-black text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg shadow-[0_0_18px_rgba(34,211,238,0.28)] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Zap className="w-4 h-4" />
              <span>Save Expense</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
