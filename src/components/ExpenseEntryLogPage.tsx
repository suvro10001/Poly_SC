import React, { useState } from 'react';
import { ExpenseRecord } from '../types';
import { PageHeaderWithActions } from './PageHeaderWithActions';
import { 
  Receipt, 
  Plus, 
  Search, 
  Filter, 
  Download, 
  Calendar, 
  DollarSign, 
  Zap, 
  Layers, 
  FileText,
  Building2,
  CheckCircle2,
  Clock,
  ArrowRight,
  TrendingUp,
  Coins,
  ShieldCheck,
  AlertCircle,
  Users,
  RotateCcw
} from 'lucide-react';

interface ExpenseEntryLogPageProps {
  expenses: ExpenseRecord[];
  onAddExpense: (exp: ExpenseRecord) => void;
  onNavigateQuickExpense: () => void;
  onNavigateExpenseReport: () => void;
  onBack: () => void;
  onClose: () => void;
}

export const ExpenseEntryLogPage: React.FC<ExpenseEntryLogPageProps> = ({
  expenses,
  onAddExpense,
  onNavigateQuickExpense,
  onNavigateExpenseReport,
  onBack,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'log' | 'expense_amount'>('log');
  const [logGroupMode, setLogGroupMode] = useState<'all' | 'sales_center' | 'marketing_person'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form states
  const [category, setCategory] = useState('Raw Materials & Masterbatch');
  const [amount, setAmount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<ExpenseRecord['paymentMode']>('Cash');
  const [paidTo, setPaidTo] = useState('');
  const [referenceReceiptNo, setReferenceReceiptNo] = useState('');
  const [authorizedBy, setAuthorizedBy] = useState('Factory In-Charge');
  const [description, setDescription] = useState('');
  const [taxDeducted, setTaxDeducted] = useState<number>(0);

  const categories = Array.from(new Set(expenses.map(e => e.category)));

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0 || !paidTo) {
      alert('Please enter a valid amount and recipient name.');
      return;
    }

    const newExp: ExpenseRecord = {
      id: `exp-${Date.now()}`,
      expenseNo: `EXP-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      date: new Date().toISOString().split('T')[0],
      category,
      amount,
      paymentMode,
      paidTo,
      referenceReceiptNo: referenceReceiptNo || undefined,
      authorizedBy,
      description,
      taxDeducted: taxDeducted || undefined
    };

    onAddExpense(newExp);
    setIsModalOpen(false);
    // Reset
    setAmount(0);
    setPaidTo('');
    setDescription('');
    setReferenceReceiptNo('');
  };

  const filtered = expenses.filter(e => {
    const matchesCat = categoryFilter === 'ALL' || e.category === categoryFilter;
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      e.expenseNo.toLowerCase().includes(searchLower) ||
      e.paidTo.toLowerCase().includes(searchLower) ||
      e.description.toLowerCase().includes(searchLower) ||
      e.category.toLowerCase().includes(searchLower);
    return matchesCat && matchesSearch;
  });

  // Compute grouped expenses by Sales Center or Marketing Person
  const groupedExpenses = React.useMemo(() => {
    if (logGroupMode === 'all') return [];

    const map = new Map<string, { key: string; title: string; subtitle: string; totalAmount: number; items: ExpenseRecord[] }>();

    filtered.forEach((exp: any) => {
      let gKey = '';
      let title = '';
      let subtitle = '';

      if (logGroupMode === 'sales_center') {
        const centerName = exp.branchName || (exp.entityType === 'center' ? exp.entityName : '') || exp.area || 'Madhupur Sales Center';
        gKey = centerName;
        title = centerName;
        subtitle = 'Sales Center Branch';
      } else {
        const personName = exp.entityType === 'marketing' ? exp.entityName : (exp.authorizedBy || exp.paidTo || 'Marketing Staff');
        gKey = personName;
        title = personName;
        subtitle = 'Marketing Personnel';
      }

      if (!map.has(gKey)) {
        map.set(gKey, {
          key: gKey,
          title,
          subtitle,
          totalAmount: 0,
          items: []
        });
      }
      const g = map.get(gKey)!;
      g.items.push(exp);
      g.totalAmount += exp.amount || 0;
    });

    return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filtered, logGroupMode]);

  const totalExpense = expenses.reduce((acc, e) => acc + e.amount, 0);

  // Group expenses by month to schedule auto-deposit to Head Office on 1st of following month
  const monthlyExpenseSummaries = React.useMemo(() => {
    const map = new Map<string, { monthKey: string; monthLabel: string; totalAmount: number; count: number; depositDate: string; isPast: boolean }>();
    
    const sorted = [...expenses].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    sorted.forEach((exp) => {
      const d = new Date(exp.date);
      if (isNaN(d.getTime())) return;
      const year = d.getFullYear();
      const month = d.getMonth();
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      const monthLabel = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      
      // Scheduled for the 1st of the following month
      const nextMonthDate = new Date(year, month + 1, 1);
      const depDateStr = `01/${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}/${nextMonthDate.getFullYear()}`;
      const today = new Date();
      const isPast = today >= nextMonthDate;

      if (!map.has(monthKey)) {
        map.set(monthKey, {
          monthKey,
          monthLabel,
          totalAmount: 0,
          count: 0,
          depositDate: depDateStr,
          isPast
        });
      }
      const item = map.get(monthKey)!;
      item.totalAmount += exp.amount;
      item.count += 1;
    });

    return Array.from(map.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [expenses]);

  return (
    <div id="expense-log-page-wrapper" className="space-y-6">
      {/* Required: Right side Back and Close buttons */}
      <PageHeaderWithActions
        idPrefix="expense-entry-log-page"
        title="Expense Entry & Comprehensive Audit Log"
        subtitle="Complete ledger of factory operational costs, polymer raw material purchases, utilities & maintenance"
        badge={`Total ৳${totalExpense.toLocaleString()}`}
        badgeColor="bg-rose-500/20 text-rose-200 border-rose-400/35"
        icon={Receipt}
        onBack={onBack}
        onClose={onClose}
        extraActions={
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              id="btn-nav-quick-expense"
              onClick={onNavigateQuickExpense}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-amber-200 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/35 rounded-lg transition-colors cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Quick Entry Mode</span>
            </button>
            <button
              type="button"
              id="btn-open-expense-modal"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-black text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg shadow-[0_0_18px_rgba(34,211,238,0.28)] transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Record Expense</span>
            </button>
          </div>
        }
      />

      {/* Page Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-cyan-500/20 pb-2">
        <button
          type="button"
          id="tab-expense-log"
          onClick={() => setActiveTab('log')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'log'
              ? 'bg-[#0e2d42] text-cyan-200 border border-cyan-400/60 shadow-xs'
              : 'bg-[#081b28] text-slate-300 hover:text-white border border-cyan-500/25'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Expense Entry & Log</span>
          <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-cyan-500/20 text-cyan-200 border border-cyan-400/30">
            {expenses.length}
          </span>
        </button>

        <button
          type="button"
          id="tab-expense-amount"
          onClick={() => setActiveTab('expense_amount')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'expense_amount'
              ? 'bg-rose-500/25 text-rose-100 border border-rose-400/60 shadow-xs'
              : 'bg-[#081b28] text-slate-300 hover:text-white border border-cyan-500/25'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Expense Amount</span>
          <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-200 border border-rose-400/35 font-bold">
            Auto H/O 1st
          </span>
        </button>
      </div>

      {activeTab === 'log' && (
        <>
          {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="cyber-glass-subcard p-5 rounded-xl border border-rose-400/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Total Recorded Expenses</span>
            <div className="p-2 bg-rose-500/15 border border-rose-400/30 rounded-lg text-rose-300">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-white mt-2">৳{totalExpense.toLocaleString()}</div>
          <p className="text-xs text-slate-400 mt-1">{expenses.length} expenditure entries verified</p>
        </div>

        <div className="cyber-glass-subcard p-5 rounded-xl border border-amber-400/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Cash Disbursements</span>
            <div className="p-2 bg-amber-500/15 border border-amber-400/30 rounded-lg text-amber-300">
              <Receipt className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-300 mt-2">
            ৳{expenses.filter(e => e.paymentMode === 'Cash').reduce((acc, e) => acc + e.amount, 0).toLocaleString()}
          </div>
          <p className="text-xs text-slate-400 mt-1">Paid directly through petty cash drawer</p>
        </div>

        <div className="cyber-glass-subcard p-5 rounded-xl border border-cyan-400/30 flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Expense Statement</span>
            <div className="text-sm font-bold text-white mt-1">Generate Periodic Breakdown Report</div>
          </div>
          <button
            type="button"
            onClick={onNavigateExpenseReport}
            className="w-full mt-2 py-2 px-3 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/30 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-cyan-300" />
            <span>Open Expense Statement Report →</span>
          </button>
        </div>
      </div>

      {/* Expense Table */}
      <div className="cyber-glass-card rounded-2xl overflow-hidden text-white">
        <div className="p-2.5 px-3.5 border-b border-cyan-500/25 bg-[#081e2d]/85 backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                id="input-expense-search"
                placeholder="Search expense #, vendor, description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 h-[34px] text-xs bg-[#061520]/90 text-white placeholder-slate-400 border border-cyan-500/30 rounded-xl focus:ring-1 focus:ring-cyan-400 focus:outline-none font-medium"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 text-xs font-bold cursor-pointer"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
              <Filter className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
              <span className="text-cyan-200/80 font-bold text-[11px] whitespace-nowrap">Category:</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-transparent text-cyan-100 font-bold text-xs focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-[#091e2c] text-white">All Categories</option>
                {categories.map(c => (
                  <option key={c} value={c} className="bg-[#091e2c] text-white">{c}</option>
                ))}
              </select>
            </div>

            {(searchTerm || categoryFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setCategoryFilter('ALL');
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 h-[34px] text-xs font-bold text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/35 rounded-xl transition-colors cursor-pointer shrink-0"
                title="Reset filters"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-300" />
                <span>Reset</span>
              </button>
            )}
          </div>

          {/* Group-Wise View Switcher Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center space-x-1 bg-[#061520]/90 p-0.5 h-[34px] rounded-xl border border-cyan-500/30">
              <button
                type="button"
                onClick={() => setLogGroupMode('all')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  logGroupMode === 'all'
                    ? 'bg-cyan-500 text-slate-950 font-black shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                All Entries
              </button>
              <button
                type="button"
                onClick={() => setLogGroupMode('sales_center')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center space-x-1 ${
                  logGroupMode === 'sales_center'
                    ? 'bg-cyan-500 text-slate-950 font-black shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Sales Center Wise</span>
              </button>
              <button
                type="button"
                onClick={() => setLogGroupMode('marketing_person')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center space-x-1 ${
                  logGroupMode === 'marketing_person'
                    ? 'bg-purple-500 text-white font-black shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Marketing Person Wise</span>
              </button>
            </div>

            <span className="text-xs text-cyan-200/80 font-medium whitespace-nowrap">
              {filtered.length} entries
            </span>
          </div>
        </div>

        {logGroupMode === 'all' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-200">
              <thead className="bg-[#0c2638] text-xs font-semibold text-cyan-200 uppercase tracking-wider border-b border-cyan-500/30">
                <tr>
                  <th className="py-3 px-4">Expense No & Date</th>
                  <th className="py-3 px-4">Category & Payee</th>
                  <th className="py-3 px-4">Description & Ref</th>
                  <th className="py-3 px-4">Mode</th>
                  <th className="py-3 px-4 text-right">Amount (৳)</th>
                  <th className="py-3 px-4">Authorized By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 text-sm">
                      No expense records found.
                    </td>
                  </tr>
                ) : (
                  filtered.map(exp => (
                    <tr key={exp.id} className="hover:bg-cyan-500/[0.06] transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-cyan-200 font-mono text-xs">{exp.expenseNo}</div>
                        <div className="text-xs text-slate-400">{exp.date}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-block px-2 py-0.5 text-xs font-semibold bg-rose-500/15 text-rose-200 rounded mb-0.5 border border-rose-400/30">
                          {exp.category}
                        </span>
                        <div className="font-semibold text-white">{exp.paidTo}</div>
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="text-xs text-slate-300 line-clamp-2">{exp.description}</div>
                        {exp.referenceReceiptNo && (
                          <div className="text-[11px] text-slate-400 font-mono">Receipt: {exp.referenceReceiptNo}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                          exp.paymentMode === 'Cash' ? 'bg-amber-500/20 text-amber-200 border border-amber-400/30' :
                          exp.paymentMode === 'Cheque' ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/30' :
                          'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
                        }`}>
                          {exp.paymentMode}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-black text-rose-300 font-mono">৳{exp.amount.toLocaleString()}</div>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-medium text-slate-300">
                        {exp.authorizedBy}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="divide-y divide-cyan-500/15 bg-[#071824]/60">
            {groupedExpenses.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">
                No grouped expense entries found.
              </div>
            ) : (
              groupedExpenses.map((group) => (
                <div key={group.key} className="p-4 space-y-3">
                  <div className="flex items-center justify-between bg-[#0b2334]/80 p-3 rounded-xl border border-cyan-500/25">
                    <div className="flex items-center space-x-2.5">
                      <div className={`p-2 rounded-lg text-white ${
                        logGroupMode === 'sales_center' ? 'bg-cyan-500/20 border border-cyan-400/35 text-cyan-300' : 'bg-purple-500/20 border border-purple-400/35 text-purple-300'
                      }`}>
                        {logGroupMode === 'sales_center' ? (
                          <Building2 className="w-4 h-4" />
                        ) : (
                          <Users className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="font-black text-sm text-white">{group.title}</div>
                        <div className="text-xs text-slate-400 font-medium">
                          {group.subtitle} • {group.items.length} vouchers
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-bold text-slate-400 uppercase">Subtotal</div>
                      <div className="text-base font-black text-rose-300 font-mono">
                        ৳{group.totalAmount.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-cyan-500/25 rounded-xl bg-[#071824]/70">
                    <table className="w-full text-left text-xs text-slate-200">
                      <thead className="bg-[#0c2638] font-bold uppercase tracking-wider text-cyan-200 border-b border-cyan-500/30">
                        <tr>
                          <th className="py-2.5 px-3">Expense No & Date</th>
                          <th className="py-2.5 px-3">Category & Payee</th>
                          <th className="py-2.5 px-3">Description & Ref</th>
                          <th className="py-2.5 px-3">Mode</th>
                          <th className="py-2.5 px-3 text-right">Amount (৳)</th>
                          <th className="py-2.5 px-3">Authorized By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cyan-500/15">
                        {group.items.map((exp) => (
                          <tr key={exp.id} className="hover:bg-cyan-500/[0.06] transition-colors">
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-cyan-200 font-mono">{exp.expenseNo}</div>
                              <div className="text-slate-400 text-[11px]">{exp.date}</div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold bg-rose-500/15 text-rose-200 rounded border border-rose-400/30 mb-0.5">
                                {exp.category}
                              </span>
                              <div className="font-semibold text-white">{exp.paidTo}</div>
                            </td>
                            <td className="py-2.5 px-3 max-w-xs">
                              <div className="text-slate-300 line-clamp-1">{exp.description}</div>
                              {exp.referenceReceiptNo && (
                                <div className="text-[10px] text-slate-400 font-mono">Ref: {exp.referenceReceiptNo}</div>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                exp.paymentMode === 'Cash' ? 'bg-amber-500/20 text-amber-200 border border-amber-400/30' :
                                exp.paymentMode === 'Cheque' ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/30' :
                                'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
                              }`}>
                                {exp.paymentMode}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-black text-rose-300 font-mono text-sm">
                              ৳{exp.amount.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-slate-300 font-medium">
                              {exp.authorizedBy}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </>
  )}

  {/* EXPENSE AMOUNT TAB */}
  {activeTab === 'expense_amount' && (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Workflow Rule Banner */}
      <div className="cyber-glass-card text-white p-5 rounded-2xl border border-rose-400/35 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="bg-rose-500/20 text-rose-200 border border-rose-400/35 text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full tracking-wider flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-rose-300" />
                Sales Center Expense Settlement
              </span>
              <span className="text-slate-300 text-xs font-medium">Head Office Auto-Deposit Policy</span>
            </div>
            <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
              <span>Collection-Funded Expenses & Monthly Head Office Settlement</span>
            </h3>
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
              &ldquo;I am collecting money from the parties and using it to cover all the expenses of the sales center. The total amount spent on these expenses will be automatically deposited to the Head Office on the 1st of the following month.&rdquo;
            </p>
          </div>

          <div className="bg-[#061520]/80 backdrop-blur-md p-3.5 rounded-xl border border-cyan-500/30 text-center min-w-[180px] shrink-0">
            <div className="text-[11px] font-bold text-rose-200 uppercase tracking-wider">Scheduled H/O Settlement</div>
            <div className="text-xl font-black text-white mt-1">1st of Month</div>
            <div className="text-[10px] text-emerald-300 font-semibold mt-0.5 flex items-center justify-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>Automated System Deposit</span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="cyber-glass-subcard p-4.5 rounded-xl border border-rose-400/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Total Expense Spent</span>
            <div className="p-2 bg-rose-500/15 border border-rose-400/30 text-rose-300 rounded-lg">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white mt-2 font-mono">
            ৳{totalExpense.toLocaleString()}
          </div>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            Across {expenses.length} operating vouchers
          </p>
        </div>

        <div className="cyber-glass-subcard p-4.5 rounded-xl border border-amber-400/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Funding Source</span>
            <div className="p-2 bg-amber-500/15 border border-amber-400/30 text-amber-300 rounded-lg">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="text-base font-black text-amber-200 mt-2">
            Party Cash Collections
          </div>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            Directly collected from sales parties
          </p>
        </div>

        <div className="cyber-glass-subcard p-4.5 rounded-xl border border-indigo-400/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Deposit Destination</span>
            <div className="p-2 bg-indigo-500/15 border border-indigo-400/30 text-indigo-300 rounded-lg">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-base font-black text-indigo-200 mt-2">
            Head Office (H/O)
          </div>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            Monthly aggregate reimbursement
          </p>
        </div>

        <div className="cyber-glass-subcard p-4.5 rounded-xl border border-emerald-400/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Next Auto-Deposit</span>
            <div className="p-2 bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 rounded-lg">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-base font-black text-emerald-300 mt-2 font-mono">
            {monthlyExpenseSummaries.length > 0 ? monthlyExpenseSummaries[0].depositDate : '01st Next Month'}
          </div>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            ৳{(monthlyExpenseSummaries.length > 0 ? monthlyExpenseSummaries[0].totalAmount : 0).toLocaleString()} scheduled
          </p>
        </div>
      </div>

      {/* Monthly Settlement Schedule Table */}
      <div className="cyber-glass-card rounded-2xl overflow-hidden text-white">
        <div className="p-4 border-b border-cyan-500/20 bg-[#0b2334]/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-cyan-300" />
              <span>Monthly Expense Summary & Head Office Auto-Deposit Schedule</span>
            </h4>
            <p className="text-xs text-slate-300 mt-0.5">
              Each month&apos;s total spent amount is queued for auto-deposit on the 1st of the following month.
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-[#061520] text-cyan-200 border border-cyan-500/30 rounded-lg">
            {monthlyExpenseSummaries.length} Monthly Cycle{monthlyExpenseSummaries.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-200">
            <thead className="bg-[#0c2638] text-xs font-bold text-cyan-200 uppercase border-b border-cyan-500/30">
              <tr>
                <th className="py-3 px-4">Operating Month</th>
                <th className="py-3 px-4 text-center">Vouchers Count</th>
                <th className="py-3 px-4 text-right">Total Expense Amount</th>
                <th className="py-3 px-4">Auto-Deposit Date</th>
                <th className="py-3 px-4">Destination</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60">
              {monthlyExpenseSummaries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 text-sm">
                    No expense records available to calculate monthly amounts.
                  </td>
                </tr>
              ) : (
                monthlyExpenseSummaries.map((m) => (
                  <tr key={m.monthKey} className="hover:bg-cyan-500/[0.06] transition-colors">
                    <td className="py-3.5 px-4 font-bold text-white">
                      {m.monthLabel}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="px-2 py-0.5 bg-cyan-500/15 text-cyan-200 border border-cyan-400/30 rounded-full text-xs font-bold font-mono">
                        {m.count}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-black text-rose-300 font-mono text-base">
                      ৳{m.totalAmount.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-200 text-xs flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-rose-300 shrink-0" />
                      <span>{m.depositDate}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-200 border border-indigo-400/35">
                        <Building2 className="w-3 h-3 text-indigo-300" />
                        <span>Head Office (H/O)</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {m.isPast ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-200 border border-emerald-400/35">
                          <CheckCircle2 className="w-3 h-3 text-emerald-300" />
                          <span>Auto-Deposited to H/O</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-200 border border-amber-400/35">
                          <Clock className="w-3 h-3 text-amber-300" />
                          <span>Scheduled for 1st</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Category Breakdown of Expense Amounts */}
      <div className="cyber-glass-card rounded-2xl p-5 text-white">
        <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-300" />
          <span>Expense Amount Breakdown by Category</span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {categories.map((cat) => {
            const catAmount = expenses.filter(e => e.category === cat).reduce((acc, e) => acc + e.amount, 0);
            const percent = totalExpense > 0 ? ((catAmount / totalExpense) * 100).toFixed(1) : '0';
            return (
              <div key={cat} className="p-3 bg-[#071824]/70 rounded-xl border border-cyan-500/25 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-bold text-cyan-200 block truncate" title={cat}>
                    {cat}
                  </span>
                  <div className="text-base font-black text-white mt-1 font-mono">
                    ৳{catAmount.toLocaleString()}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span>{percent}% of total</span>
                  <span className="font-semibold text-rose-300">Covered by Collection</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  )}

      {/* Add Expense Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030d14]/80 p-4 backdrop-blur-sm">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl max-w-lg w-full p-6 shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 text-white animate-in fade-in zoom-in-95">
            <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-cyan-400" />
              Record Factory / Operating Expense
            </h2>
            <p className="text-xs text-slate-300 mb-4">
              Enter full expense details with receipt reference and payment mode.
            </p>

            <form onSubmit={handleSaveExpense} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-cyan-200 mb-1">Expense Category *</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                >
                  <option value="Raw Materials & Masterbatch">Raw Materials & Masterbatch</option>
                  <option value="Factory Utility & Fuel">Factory Utility & Fuel (Electricity/Diesel)</option>
                  <option value="Machinery Maintenance & Parts">Machinery Maintenance & Parts</option>
                  <option value="Transportation & Logistics">Transportation & Logistics / Freight</option>
                  <option value="Staff Wages & Salaries">Staff Wages & Salaries</option>
                  <option value="Printing Inks & Solvents">Printing Inks, Plates & Solvents</option>
                  <option value="Office Administrative & Rent">Office Administrative & Rent</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-cyan-200 mb-1">Amount (৳) *</label>
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
                <div>
                  <label className="block text-xs font-semibold text-cyan-200 mb-1">Payment Mode</label>
                  <select
                    value={paymentMode}
                    onChange={e => setPaymentMode(e.target.value as any)}
                    className="w-full text-xs px-3 py-2.5 border border-cyan-500/30 rounded-lg bg-[#061520] text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  >
                    <option value="Cash">Cash (Petty Drawer)</option>
                    <option value="Bank Transfer">Bank Wire / BEFTN</option>
                    <option value="Cheque">Bank Cheque</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-cyan-200 mb-1">Paid To (Vendor / Staff) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Petrochemical Polymers Ltd."
                    value={paidTo}
                    onChange={e => setPaidTo(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-cyan-200 mb-1">Receipt / Voucher #</label>
                  <input
                    type="text"
                    placeholder="e.g. RCP-8821"
                    value={referenceReceiptNo}
                    onChange={e => setReferenceReceiptNo(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-cyan-200 mb-1">Authorized By</label>
                <input
                  type="text"
                  value={authorizedBy}
                  onChange={e => setAuthorizedBy(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-cyan-200 mb-1">Description / Itemized Breakdown</label>
                <textarea
                  rows={2}
                  placeholder="Detailed purpose, quantities, machine #, fuel liters..."
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
                  className="px-4 py-2 text-xs font-black text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg shadow-xs cursor-pointer"
                >
                  Save Expense Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
