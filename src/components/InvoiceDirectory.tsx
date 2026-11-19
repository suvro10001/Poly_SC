import React, { useState, useMemo } from 'react';
import { useChallan } from '../context/ChallanContext';
import { Invoice } from '../types';
import {
  Receipt,
  Search,
  RotateCcw,
  Printer,
  Eye,
  CheckCircle2,
  Calendar,
  Building,
  CreditCard,
  Layers,
} from 'lucide-react';

interface InvoiceDirectoryProps {
  onViewInvoice: (invoice: Invoice) => void;
  onPrintInvoice: (invoice: Invoice) => void;
}

export const InvoiceDirectory: React.FC<InvoiceDirectoryProps> = ({
  onViewInvoice,
  onPrintInvoice,
}) => {
  const { invoices } = useChallan();
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'Paid' | 'Unpaid'>('ALL');

  const handleResetSearch = () => {
    setSearchQuery('');
    setPaymentFilter('ALL');
  };

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        inv.invoiceNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.challanNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.items.some(it => it.name.toLowerCase().includes(searchQuery.toLowerCase()));

      let matchesPayment = true;
      if (paymentFilter === 'Paid') matchesPayment = inv.paymentStatus === 'Paid';
      if (paymentFilter === 'Unpaid') matchesPayment = inv.paymentStatus === 'Pending' || (inv.paymentStatus as string) === 'Unpaid';

      return matchesSearch && matchesPayment;
    });
  }, [invoices, searchQuery, paymentFilter]);

  const totalInvoicedAmount = invoices.reduce((acc, inv) => acc + inv.grandTotal, 0);

  return (
    <div id="invoice-directory-section" className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-xs font-semibold uppercase tracking-wider">
              Billed Revenue & Tax Invoices
            </span>
            <h2 className="text-lg font-bold">Tax Invoices Directory</h2>
            <p className="text-xs text-slate-300">
              Official tax invoices issued against verified delivery challans.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-xs rounded-xl px-4 py-2 border border-white/10 text-right">
            <p className="text-xs text-slate-300">Total Billed Revenue</p>
            <p className="text-xl font-black text-emerald-400 font-mono">
              ₹{totalInvoicedAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      {/* Filter Bar with RESET */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        
        {/* Search */}
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search invoice no, challan no, client..."
            className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-slate-900"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaymentFilter('ALL')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              paymentFilter === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Invoices ({invoices.length})
          </button>
          <button
            onClick={() => setPaymentFilter('Paid')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              paymentFilter === 'Paid'
                ? 'bg-emerald-700 text-white'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}
          >
            Paid ({invoices.filter(i => i.paymentStatus === 'Paid').length})
          </button>

          {(searchQuery || paymentFilter !== 'ALL') && (
            <button
              onClick={handleResetSearch}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        {filteredInvoices.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <Receipt className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">No Invoices Found</p>
            <p className="text-xs text-slate-400">Generate a bill from the Challan Directory tab to create invoices.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Invoice No & Date</th>
                  <th className="py-3 px-4">Client / Company</th>
                  <th className="py-3 px-4">Linked Challan</th>
                  <th className="py-3 px-4">Billed Poly Items</th>
                  <th className="py-3 px-4 text-right">Grand Total (GST Inc.)</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredInvoices.map(inv => (
                  <tr key={inv.id} className="bg-white hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-900 text-sm block">
                        {inv.invoiceNo}
                      </span>
                      <span className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {inv.date}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-900">{inv.clientName}</p>
                      <p className="text-[11px] text-slate-500">{inv.clientContact}</p>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {inv.challanNo}
                      </span>
                    </td>

                    {/* Poly items (NO ITEM CODES SHOWN) */}
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="space-y-0.5">
                        {inv.items.map((it, idx) => (
                          <p key={idx} className="text-[11px] text-slate-800 truncate">
                            • {it.name} ({it.qty} {it.unit})
                          </p>
                        ))}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 text-sm">
                      ₹{inv.grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>{inv.paymentStatus}</span>
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onViewInvoice(inv)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                        <button
                          onClick={() => onPrintInvoice(inv)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Print</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
