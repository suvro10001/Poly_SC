import React, { useState } from 'react';
import { ExpenseRecord } from '../types';
import { PageHeaderWithActions } from './PageHeaderWithActions';
import { 
  FileText, 
  Printer, 
  Download, 
  Calendar, 
  DollarSign, 
  PieChart, 
  Filter,
  Layers,
  ArrowDownToLine
} from 'lucide-react';

interface ExpenseStatementReportPageProps {
  expenses: ExpenseRecord[];
  onBack: () => void;
  onClose: () => void;
}

export const ExpenseStatementReportPage: React.FC<ExpenseStatementReportPageProps> = ({
  expenses,
  onBack,
  onClose
}) => {
  const [dateRange, setDateRange] = useState<'thisMonth' | 'last30' | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = Array.from(new Set(expenses.map(e => e.category)));

  // Calculate category breakdowns
  const categoryTotals: Record<string, number> = {};
  expenses.forEach(e => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
  });

  const totalExpense = expenses.reduce((acc, e) => acc + e.amount, 0);

  const filtered = expenses.filter(e => {
    return selectedCategory === 'all' || e.category === selectedCategory;
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div id="expense-statement-report-page-wrapper" className="space-y-6">
      {/* Required: Right side Back and Close buttons */}
      <PageHeaderWithActions
        idPrefix="expense-statement-page"
        title="Expense Statement & Audit Report"
        subtitle="Itemized expenditure analytics, cost allocation per division, and statement printing"
        badge="Executive Statement"
        badgeColor="bg-cyan-500/20 text-cyan-200 border-cyan-400/35"
        icon={FileText}
        onBack={onBack}
        onClose={onClose}
        extraActions={
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-200 bg-[#081b28] border border-cyan-500/30 rounded-lg hover:bg-[#0e2a3d] transition-colors shadow-2xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-cyan-300" />
            <span>Print Statement</span>
          </button>
        }
      />

      {/* Category Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(categoryTotals).map(([cat, total]) => {
          const percentage = totalExpense > 0 ? ((total / totalExpense) * 100).toFixed(1) : '0';
          return (
            <div key={cat} className="cyber-glass-subcard p-4 rounded-xl border border-cyan-500/25 flex flex-col justify-between text-white">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-1">
                  <span>{cat}</span>
                  <span className="text-cyan-200 font-bold">{percentage}%</span>
                </div>
                <div className="text-lg font-bold text-white">৳{total.toLocaleString()}</div>
              </div>

              <div className="w-full bg-[#061520] h-1.5 rounded-full mt-3 overflow-hidden border border-cyan-500/20">
                <div 
                  className="bg-rose-400 h-full rounded-full" 
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Itemized Table */}
      <div className="cyber-glass-card rounded-2xl overflow-hidden text-white">
        <div className="p-4 border-b border-cyan-500/25 bg-[#0c2638]/90 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <PieChart className="w-4 h-4 text-rose-300" />
            <span>Consolidated Statement Breakdown</span>
          </h3>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs px-3 py-1.5 border border-cyan-500/30 rounded-lg bg-[#061520] text-white"
          >
            <option value="all">All Expense Categories</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="expense-statement-table w-full text-left text-sm text-slate-200">
            <thead className="bg-[#0c2638] text-xs font-semibold text-cyan-200 uppercase tracking-wider border-b border-cyan-500/30">
              <tr>
                <th className="py-3 px-4">Date & Expense #</th>
                <th className="py-3 px-4">Cost Center / Category</th>
                <th className="py-3 px-4">Paid To (Payee)</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Payment Method</th>
                <th className="py-3 px-4 text-right">Debit Amount (৳)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60">
              {filtered.map(exp => (
                <tr key={exp.id} className="hover:bg-cyan-500/[0.06]">
                  <td className="py-3 px-4 font-mono text-xs text-white font-bold">
                    {exp.date} <span className="text-slate-400 font-normal">({exp.expenseNo})</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-xs font-semibold text-cyan-200 bg-[#0b2334] border border-cyan-500/30 px-2 py-0.5 rounded">
                      {exp.category}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-medium text-white text-xs">{exp.paidTo}</td>
                  <td className="py-3 px-4 text-xs text-slate-300 max-w-sm">{exp.description}</td>
                  <td className="py-3 px-4 text-xs text-slate-300">{exp.paymentMode}</td>
                  <td className="py-3 px-4 text-right font-bold text-rose-300 font-mono">
                    ৳{exp.amount.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-[#0c2638] font-bold border-t border-cyan-500/30">
              <tr>
                <td colSpan={5} className="py-3 px-4 text-right text-cyan-200 uppercase text-xs">
                  Grand Total Expenditure:
                </td>
                <td className="py-3 px-4 text-right font-black text-rose-300 font-mono text-base">
                  ৳{totalExpense.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
