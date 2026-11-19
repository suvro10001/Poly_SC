import React, { useState } from 'react';
import { Item, StoredBill, FactoryImportChallan, StockReturnChallan, ColorExchangeChallan, DeliveryChallan } from '../types';
import { X, Palette, ArrowDownRight, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { calculateItemColorStockLedger } from '../utils/stockHelper';

export type StockCategoryType = 'all' | 'opening' | 'received' | 'sales' | 'returnParty' | 'returnFactory' | 'closing';

interface StockColorBreakdownModalProps {
  isOpen: boolean;
  item: any;
  initialCategory?: StockCategoryType;
  storedBills: StoredBill[];
  factoryImports: FactoryImportChallan[];
  stockReturns: StockReturnChallan[];
  startDate?: string;
  endDate?: string;
  branchId?: string;
  branchName?: string;
  colorExchanges?: ColorExchangeChallan[];
  deliveryChallans?: DeliveryChallan[];
  onClose: () => void;
}

export const StockColorBreakdownModal: React.FC<StockColorBreakdownModalProps> = ({
  isOpen,
  item,
  initialCategory = 'all',
  storedBills = [],
  factoryImports = [],
  stockReturns = [],
  branchId,
  branchName,
  colorExchanges = [],
  deliveryChallans = [],
  onClose
}) => {
  const [selectedCategory, setSelectedCategory] = useState<StockCategoryType>(initialCategory);

  if (!isOpen || !item) return null;

  const ledger = calculateItemColorStockLedger(
    item,
    factoryImports,
    storedBills,
    stockReturns,
    branchId,
    deliveryChallans,
    colorExchanges,
    branchName
  );

  // Active category display
  let currentColors = ledger.closing;
  let categoryLabel = 'Live Closing Stock Colors (বর্তমান মজুত)';
  let categoryBadgeColor = 'bg-emerald-500/20 text-emerald-200 border-emerald-500/35';

  if (selectedCategory === 'opening') {
    currentColors = ledger.opening;
    categoryLabel = 'Opening Stock Colors (প্রারম্ভিক ব্যালেন্স)';
    categoryBadgeColor = 'bg-cyan-500/20 text-cyan-200 border-cyan-500/35';
  } else if (selectedCategory === 'received') {
    currentColors = ledger.imported;
    categoryLabel = 'Factory Import Colors (ফ্যাক্টরি থেকে প্রাপ্ত)';
    categoryBadgeColor = 'bg-indigo-500/20 text-indigo-200 border-indigo-500/35';
  } else if (selectedCategory === 'returnParty') {
    currentColors = ledger.returnParty;
    categoryLabel = 'Return from Party Colors (পার্টি ফেরত)';
    categoryBadgeColor = 'bg-teal-500/20 text-teal-200 border-teal-500/35';
  } else if (selectedCategory === 'sales') {
    currentColors = ledger.sales;
    categoryLabel = 'Sales Sold Colors (বিক্রয় চালান)';
    categoryBadgeColor = 'bg-rose-500/20 text-rose-200 border-rose-500/35';
  } else if (selectedCategory === 'returnFactory') {
    currentColors = ledger.returnFactory;
    categoryLabel = 'Return to Factory Colors (ফ্যাক্টরি ফেরত)';
    categoryBadgeColor = 'bg-amber-500/20 text-amber-200 border-amber-500/35';
  }

  const currentTotal =
    (currentColors.red || 0) +
    (currentColors.blk || 0) +
    (currentColors.yel || 0) +
    (currentColors.grn || 0) +
    (currentColors.blu || 0) +
    (currentColors.others || 0);

  return (
    <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl max-w-2xl w-full shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 overflow-hidden flex flex-col max-h-[90vh] text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#0c2638]/90 border-b border-cyan-500/25 text-white shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-cyan-500/15 border border-cyan-400/35 rounded-xl">
              <Palette className="w-5 h-5 text-cyan-300" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-wide">Color Wise Stock Breakdown</h3>
              <p className="text-xs text-slate-300">
                {item.name} • {item.unit || 'Coils'}{branchName ? ` • ${branchName}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-cyan-500/15 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="bg-[#0b2334]/80 p-2.5 border-b border-cyan-500/25 flex flex-wrap gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-cyan-500 text-slate-950 font-black shadow-xs'
                : 'bg-[#081b28] text-slate-200 hover:bg-[#0e2a3d] border border-cyan-500/25'
            }`}
          >
            📊 Complete Movement
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('closing')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedCategory === 'closing'
                ? 'bg-emerald-500 text-slate-950 font-black shadow-xs'
                : 'bg-[#081b28] text-slate-200 hover:bg-[#0e2a3d] border border-cyan-500/25'
            }`}
          >
            Closing ({ledger.closing.total})
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('received')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedCategory === 'received'
                ? 'bg-indigo-500 text-white shadow-xs'
                : 'bg-[#081b28] text-slate-200 hover:bg-[#0e2a3d] border border-cyan-500/25'
            }`}
          >
            Factory Import ({ledger.imported.total})
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('returnParty')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedCategory === 'returnParty'
                ? 'bg-teal-500 text-slate-950 font-black shadow-xs'
                : 'bg-[#081b28] text-slate-200 hover:bg-[#0e2a3d] border border-cyan-500/25'
            }`}
          >
            R.Party ({ledger.returnParty.total})
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('sales')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedCategory === 'sales'
                ? 'bg-rose-500 text-white shadow-xs'
                : 'bg-[#081b28] text-slate-200 hover:bg-[#0e2a3d] border border-cyan-500/25'
            }`}
          >
            Sales ({ledger.sales.total})
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('opening')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedCategory === 'opening'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'bg-[#081b28] text-slate-200 hover:bg-[#0e2a3d] border border-cyan-500/25'
            }`}
          >
            Opening ({ledger.opening.total})
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-5 overflow-y-auto">
          {/* Active Category Display Cards */}
          {selectedCategory !== 'all' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className={`px-3 py-1 rounded-lg text-xs font-black border ${categoryBadgeColor}`}>
                  {categoryLabel}
                </span>
                <span className="text-xs font-bold font-mono text-cyan-200">
                  Total: {currentTotal} {item.unit || 'Coils'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
                <div className="p-3 bg-red-500/15 rounded-xl border border-red-500/30">
                  <div className="text-xs font-bold text-red-300">🔴 Red (লাল)</div>
                  <div className="text-xl font-black text-white mt-1 font-mono">{currentColors.red || 0}</div>
                </div>
                <div className="p-3 bg-[#0e2a3d]/70 rounded-xl border border-cyan-500/25">
                  <div className="text-xs font-bold text-slate-300">⚫ Black (কালো)</div>
                  <div className="text-xl font-black text-white mt-1 font-mono">{currentColors.blk || 0}</div>
                </div>
                <div className="p-3 bg-amber-500/15 rounded-xl border border-amber-500/30">
                  <div className="text-xs font-bold text-amber-300">🟡 Yellow (হলুদ)</div>
                  <div className="text-xl font-black text-white mt-1 font-mono">{currentColors.yel || 0}</div>
                </div>
                <div className="p-3 bg-emerald-500/15 rounded-xl border border-emerald-500/30">
                  <div className="text-xs font-bold text-emerald-300">🟢 Green (সবুজ)</div>
                  <div className="text-xl font-black text-white mt-1 font-mono">{currentColors.grn || 0}</div>
                </div>
                <div className="p-3 bg-blue-500/15 rounded-xl border border-blue-500/30">
                  <div className="text-xs font-bold text-blue-300">🔵 Blue (নীল)</div>
                  <div className="text-xl font-black text-white mt-1 font-mono">{currentColors.blu || 0}</div>
                </div>
                <div className="p-3 bg-purple-500/15 rounded-xl border border-purple-500/30">
                  <div className="text-xs font-bold text-purple-300">⚪ Others</div>
                  <div className="text-xl font-black text-white mt-1 font-mono">{currentColors.others || 0}</div>
                </div>
              </div>
            </div>
          ) : (
            /* Complete Matrix Ledger */
            <div className="space-y-4">
              <div className="text-xs font-extrabold uppercase tracking-wider text-cyan-200 flex items-center justify-between">
                <span>Color Movement Formula: Opening + Import + R.Party + Exch.In - Sales - Re.Fac - Exch.Out = Closing</span>
              </div>

              <div className="overflow-x-auto border border-cyan-500/25 bg-[#071824]/70 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-[#0c2638] text-cyan-200 font-bold border-b border-cyan-500/30 uppercase text-[10px]">
                      <th className="p-2.5">Flow Stage</th>
                      <th className="p-2.5 text-center text-red-300">🔴 Red</th>
                      <th className="p-2.5 text-center text-slate-200">⚫ Blk</th>
                      <th className="p-2.5 text-center text-amber-300">🟡 Yel</th>
                      <th className="p-2.5 text-center text-emerald-300">🟢 Grn</th>
                      <th className="p-2.5 text-center text-blue-300">🔵 Blu</th>
                      <th className="p-2.5 text-center text-purple-300">⚪ Oth</th>
                      <th className="p-2.5 text-right font-black">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200 font-mono">
                    <tr className="hover:bg-cyan-500/[0.06]">
                      <td className="p-2.5 font-sans font-semibold text-cyan-200">Opening Stock</td>
                      <td className="p-2.5 text-center">{ledger.opening.red}</td>
                      <td className="p-2.5 text-center">{ledger.opening.blk}</td>
                      <td className="p-2.5 text-center">{ledger.opening.yel}</td>
                      <td className="p-2.5 text-center">{ledger.opening.grn}</td>
                      <td className="p-2.5 text-center">{ledger.opening.blu}</td>
                      <td className="p-2.5 text-center">{ledger.opening.others}</td>
                      <td className="p-2.5 text-right font-bold text-cyan-200">{ledger.opening.total}</td>
                    </tr>
                    <tr className="hover:bg-cyan-500/[0.06] bg-indigo-500/10">
                      <td className="p-2.5 font-sans font-semibold text-indigo-300">+ Factory Import</td>
                      <td className="p-2.5 text-center text-indigo-200 font-bold">{ledger.imported.red}</td>
                      <td className="p-2.5 text-center text-indigo-200 font-bold">{ledger.imported.blk}</td>
                      <td className="p-2.5 text-center text-indigo-200 font-bold">{ledger.imported.yel}</td>
                      <td className="p-2.5 text-center text-indigo-200 font-bold">{ledger.imported.grn}</td>
                      <td className="p-2.5 text-center text-indigo-200 font-bold">{ledger.imported.blu}</td>
                      <td className="p-2.5 text-center text-indigo-200 font-bold">{ledger.imported.others}</td>
                      <td className="p-2.5 text-right font-black text-indigo-300">+{ledger.imported.total}</td>
                    </tr>
                    <tr className="hover:bg-cyan-500/[0.06] bg-cyan-500/10">
                      <td className="p-2.5 font-sans font-semibold text-cyan-300">+ Return from Party</td>
                      <td className="p-2.5 text-center">{ledger.returnParty.red}</td>
                      <td className="p-2.5 text-center">{ledger.returnParty.blk}</td>
                      <td className="p-2.5 text-center">{ledger.returnParty.yel}</td>
                      <td className="p-2.5 text-center">{ledger.returnParty.grn}</td>
                      <td className="p-2.5 text-center">{ledger.returnParty.blu}</td>
                      <td className="p-2.5 text-center">{ledger.returnParty.others}</td>
                      <td className="p-2.5 text-right font-bold text-cyan-300">+{ledger.returnParty.total}</td>
                    </tr>
                    {((ledger.exchangeIn?.total || 0) > 0 || (ledger.exchangeOut?.total || 0) > 0) && (
                      <tr className="hover:bg-cyan-500/[0.06] bg-teal-500/10">
                        <td className="p-2.5 font-sans font-semibold text-teal-300">+ Color Exchange In</td>
                        <td className="p-2.5 text-center text-teal-200 font-bold">{ledger.exchangeIn?.red || 0}</td>
                        <td className="p-2.5 text-center text-teal-200 font-bold">{ledger.exchangeIn?.blk || 0}</td>
                        <td className="p-2.5 text-center text-teal-200 font-bold">{ledger.exchangeIn?.yel || 0}</td>
                        <td className="p-2.5 text-center text-teal-200 font-bold">{ledger.exchangeIn?.grn || 0}</td>
                        <td className="p-2.5 text-center text-teal-200 font-bold">{ledger.exchangeIn?.blu || 0}</td>
                        <td className="p-2.5 text-center text-teal-200 font-bold">{ledger.exchangeIn?.others || 0}</td>
                        <td className="p-2.5 text-right font-bold text-teal-300">+{ledger.exchangeIn?.total || 0}</td>
                      </tr>
                    )}
                    <tr className="hover:bg-cyan-500/[0.06] bg-rose-500/10">
                      <td className="p-2.5 font-sans font-semibold text-rose-300">- Showroom Sales</td>
                      <td className="p-2.5 text-center text-rose-200">{ledger.sales.red}</td>
                      <td className="p-2.5 text-center text-rose-200">{ledger.sales.blk}</td>
                      <td className="p-2.5 text-center text-rose-200">{ledger.sales.yel}</td>
                      <td className="p-2.5 text-center text-rose-200">{ledger.sales.grn}</td>
                      <td className="p-2.5 text-center text-rose-200">{ledger.sales.blu}</td>
                      <td className="p-2.5 text-center text-rose-200">{ledger.sales.others}</td>
                      <td className="p-2.5 text-right font-bold text-rose-300">-{ledger.sales.total}</td>
                    </tr>
                    <tr className="hover:bg-cyan-500/[0.06] bg-amber-500/10">
                      <td className="p-2.5 font-sans font-semibold text-amber-300">- Return to Factory</td>
                      <td className="p-2.5 text-center">{ledger.returnFactory.red}</td>
                      <td className="p-2.5 text-center">{ledger.returnFactory.blk}</td>
                      <td className="p-2.5 text-center">{ledger.returnFactory.yel}</td>
                      <td className="p-2.5 text-center">{ledger.returnFactory.grn}</td>
                      <td className="p-2.5 text-center">{ledger.returnFactory.blu}</td>
                      <td className="p-2.5 text-center">{ledger.returnFactory.others}</td>
                      <td className="p-2.5 text-right font-bold text-amber-300">-{ledger.returnFactory.total}</td>
                    </tr>
                    {((ledger.exchangeIn?.total || 0) > 0 || (ledger.exchangeOut?.total || 0) > 0) && (
                      <tr className="hover:bg-cyan-500/[0.06] bg-pink-500/10">
                        <td className="p-2.5 font-sans font-semibold text-pink-300">- Color Exchange Out</td>
                        <td className="p-2.5 text-center text-pink-200 font-bold">{ledger.exchangeOut?.red || 0}</td>
                        <td className="p-2.5 text-center text-pink-200 font-bold">{ledger.exchangeOut?.blk || 0}</td>
                        <td className="p-2.5 text-center text-pink-200 font-bold">{ledger.exchangeOut?.yel || 0}</td>
                        <td className="p-2.5 text-center text-pink-200 font-bold">{ledger.exchangeOut?.grn || 0}</td>
                        <td className="p-2.5 text-center text-pink-200 font-bold">{ledger.exchangeOut?.blu || 0}</td>
                        <td className="p-2.5 text-center text-pink-200 font-bold">{ledger.exchangeOut?.others || 0}</td>
                        <td className="p-2.5 text-right font-bold text-pink-300">-{ledger.exchangeOut?.total || 0}</td>
                      </tr>
                    )}
                    <tr className="bg-emerald-500/20 font-bold border-t-2 border-emerald-400/50 text-emerald-200">
                      <td className="p-3 font-sans font-black text-emerald-200">✓ Closing Stock Balance</td>
                      <td className="p-3 text-center font-black">{ledger.closing.red}</td>
                      <td className="p-3 text-center font-black">{ledger.closing.blk}</td>
                      <td className="p-3 text-center font-black">{ledger.closing.yel}</td>
                      <td className="p-3 text-center font-black">{ledger.closing.grn}</td>
                      <td className="p-3 text-center font-black">{ledger.closing.blu}</td>
                      <td className="p-3 text-center font-black">{ledger.closing.others}</td>
                      <td className="p-3 text-right font-black text-sm text-emerald-300">{ledger.closing.total}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Quick Summary Bar */}
          <div className="flex items-center justify-between p-3.5 bg-[#0c2638] border border-cyan-500/30 text-white rounded-xl">
            <span className="text-xs font-semibold text-cyan-200">Live Closing Balance:</span>
            <span className="text-base font-black text-emerald-300">
              {ledger.closing.total} {item.unit || 'Coils'}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#071824]/90 border-t border-cyan-500/20 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
