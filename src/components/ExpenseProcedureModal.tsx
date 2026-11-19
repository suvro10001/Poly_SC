import React from 'react';
import {
  X,
  Building2,
  Wallet,
  Landmark,
  FileText,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  BookOpen
} from 'lucide-react';

interface ExpenseProcedureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExpenseProcedureModal: React.FC<ExpenseProcedureModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-2xl w-full border border-cyan-400/35 overflow-hidden flex flex-col max-h-[92vh] text-white">
        {/* Header */}
        <div className="bg-[#0c2638]/95 border-b border-cyan-500/25 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-500/20 border border-amber-400/40 rounded-xl">
              <BookOpen className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-wide text-white">
                Branch Expense Funding & Procedure Guide
              </h2>
              <p className="text-xs text-amber-200/90 font-medium">
                Complete workflow of where money comes from, Head Office settlement, and Cash In Hand reversal
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-cyan-500/15 cursor-pointer transition-colors"
            title="Close Guide"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-slate-300 text-xs sm:text-sm leading-relaxed">
          {/* Section 1: Where Expense Money Comes From */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-white font-extrabold text-sm sm:text-base border-b border-cyan-500/20 pb-2">
              <span className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center text-xs font-black">1</span>
              <span>Where Expense Money Comes From (Funding Sources)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Source A */}
              <div className="p-3.5 bg-amber-500/10 rounded-xl border border-amber-400/30 space-y-1.5">
                <div className="flex items-center space-x-1.5 text-amber-200 font-black text-xs">
                  <Building2 className="w-4 h-4 text-amber-300" />
                  <span>Party Cash Collection</span>
                </div>
                <p className="text-xs text-amber-100/80 leading-normal">
                  Cash collected from a customer against sales dues. Instead of banking the cash, the branch uses it locally to pay showroom expenses.
                </p>
                <div className="text-[10px] font-bold text-amber-200 bg-amber-500/20 border border-amber-400/30 px-2 py-0.5 rounded inline-block">
                  Auto-creates H/O Deposit
                </div>
              </div>

              {/* Source B */}
              <div className="p-3.5 bg-emerald-500/10 rounded-xl border border-emerald-400/30 space-y-1.5">
                <div className="flex items-center space-x-1.5 text-emerald-200 font-black text-xs">
                  <Wallet className="w-4 h-4 text-emerald-300" />
                  <span>Branch Cash In Hand</span>
                </div>
                <p className="text-xs text-emerald-100/80 leading-normal">
                  Paid directly from the branch showroom's daily cash drawer/collection balance for general operational expenses.
                </p>
                <div className="text-[10px] font-bold text-emerald-200 bg-emerald-500/20 border border-emerald-400/30 px-2 py-0.5 rounded inline-block">
                  Direct Cash Disbursement
                </div>
              </div>

              {/* Source C */}
              <div className="p-3.5 bg-indigo-500/10 rounded-xl border border-indigo-400/30 space-y-1.5">
                <div className="flex items-center space-x-1.5 text-indigo-200 font-black text-xs">
                  <Landmark className="w-4 h-4 text-indigo-300" />
                  <span>H/O Imprest / Remittance</span>
                </div>
                <p className="text-xs text-indigo-100/80 leading-normal">
                  Operational petty cash funds transferred or remitted directly by Head Office to support branch activities.
                </p>
                <div className="text-[10px] font-bold text-indigo-200 bg-indigo-500/20 border border-indigo-400/30 px-2 py-0.5 rounded inline-block">
                  Head Office Advance
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Step-by-Step Procedure Flow */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-white font-extrabold text-sm sm:text-base border-b border-cyan-500/20 pb-2">
              <span className="w-6 h-6 rounded-full bg-cyan-400 text-slate-950 flex items-center justify-center text-xs font-black">2</span>
              <span>Step-by-Step Accounting & Operational Procedure</span>
            </div>

            <div className="space-y-3">
              {/* Step 1 */}
              <div className="flex items-start space-x-3 p-3 bg-[#0b2334]/70 rounded-xl border border-cyan-500/20">
                <div className="p-2 bg-cyan-500/20 text-cyan-200 border border-cyan-400/30 rounded-lg shrink-0 font-black text-xs">
                  Step 1
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-white text-xs sm:text-sm">
                    Cash Received & Recorded in Cash In Hand
                  </h4>
                  <p className="text-xs text-slate-300">
                    Customer makes cash payment. Money Receipt (MR) is generated. The amount is recorded under <strong className="text-white">Cash In Hand</strong> (Pending Bank Deposit).
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-start space-x-3 p-3 bg-[#0b2334]/70 rounded-xl border border-cyan-500/20">
                <div className="p-2 bg-amber-500/20 text-amber-200 border border-amber-400/30 rounded-lg shrink-0 font-black text-xs">
                  Step 2
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-white text-xs sm:text-sm">
                    Expense Incurred & Funding Party Tagged
                  </h4>
                  <p className="text-xs text-slate-300">
                    Branch pays for electricity, rent, fuel, transport, salary, or repairs. When entering the voucher, select the customer in <strong className="text-white">"Funding Party"</strong> and check <strong className="text-white">"Auto-Approve & Generate H/O Deposit"</strong>.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex items-start space-x-3 p-3 bg-[#0b2334]/70 rounded-xl border border-cyan-500/20">
                <div className="p-2 bg-purple-500/20 text-purple-200 border border-purple-400/30 rounded-lg shrink-0 font-black text-xs">
                  Step 3
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-white text-xs sm:text-sm">
                    Head Office Approval & Automatic Deposit Entry
                  </h4>
                  <p className="text-xs text-slate-300">
                    The expense is approved as a Head Office settlement. The system automatically creates a deposit entry with Bank Tag <strong className="text-white">"H/O"</strong> in <strong className="text-white">Deposit History</strong>, and credits the customer's ledger!
                  </p>
                </div>
              </div>

              {/* Step 4: Deletion & Reversal */}
              <div className="flex items-start space-x-3 p-3 bg-emerald-500/10 rounded-xl border border-emerald-400/30">
                <div className="p-2 bg-emerald-500/25 text-emerald-200 border border-emerald-400/40 rounded-lg shrink-0 font-black text-xs">
                  Step 4
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-emerald-200 text-xs sm:text-sm flex items-center space-x-1.5">
                    <RotateCcw className="w-4 h-4 text-emerald-300" />
                    <span>H/O Deposit Tab & Cash In Hand Reversal</span>
                  </h4>
                  <p className="text-xs text-emerald-100/90 leading-normal">
                    In <strong className="text-white">Deposit History</strong>, click the dedicated <strong className="text-white">"H/O Deposited"</strong> tab. You can <strong className="text-white">Edit</strong> the customer name, date, or amount anytime. 
                    <br />
                    <strong className="text-white">Important:</strong> If you <strong className="text-white">Delete</strong> an H/O Deposit, the system immediately reverts that collection and restores the exact amount into the <strong className="text-white">Cash In Hand</strong> page!
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Reversal Guarantee Callout */}
          <div className="p-3.5 bg-amber-500/10 rounded-xl border border-amber-400/35 flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-amber-100">
              <span className="font-black text-amber-200">Reversal Guarantee:</span>
              <p>
                Deleting any H/O Deposit clears its deposit tags and returns the funds to <strong className="text-white">Cash In Hand</strong> as pending cash. No manual reconciliation is needed.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 bg-[#071824]/90 border-t border-cyan-500/20 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs rounded-xl shadow-xs cursor-pointer transition-colors"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
