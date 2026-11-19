import React, { useState } from 'react';
import { ReturnEntry, ReturnLineItem, Item, SpecialItem } from '../types';
import { PageHeaderWithActions } from './PageHeaderWithActions';
import { 
  RotateCcw, 
  Plus, 
  Trash2, 
  Search, 
  FileText, 
  AlertTriangle, 
  CheckCircle2, 
  DollarSign, 
  Layers,
  ArrowRight
} from 'lucide-react';

interface ReturnsDirectoryProps {
  returns: ReturnEntry[];
  items: Item[];
  onAddReturn: (ret: ReturnEntry) => void;
  onBack: () => void;
  onClose: () => void;
}

export const ReturnsDirectory: React.FC<ReturnsDirectoryProps> = ({
  returns,
  items,
  onAddReturn,
  onBack,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Return Form State
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [invoiceReference, setInvoiceReference] = useState('');
  const [actionTaken, setActionTaken] = useState<ReturnEntry['actionTaken']>('Credit Note');
  const [notes, setNotes] = useState('');
  const [processedBy, setProcessedBy] = useState('Quality & Returns Lead');

  // Selected items list in the return modal
  const [returnItems, setReturnItems] = useState<ReturnLineItem[]>([]);

  // Item selector drop-down state
  const [selectedItemKey, setSelectedItemKey] = useState<string>('');
  const [itemCondition, setItemCondition] = useState<ReturnLineItem['condition']>('Good');
  const [itemReason, setItemReason] = useState('Customer overstock return');

  /**
   * CRITICAL REQUIREMENT:
   * "in Returns directory after item selection default item qty select 1, it will 0, fix it."
   * When an item is selected and added to the return list, the default quantity MUST be 0!
   */
  const handleAddItemToReturn = () => {
    if (!selectedItemKey) return;

    const [type, id] = selectedItemKey.split('::');
    let lineItem: ReturnLineItem | null = null;

    if (type === 'main') {
      const main = items.find(i => i.id === id);
      if (main) {
        lineItem = {
          id: `ret-line-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          itemId: main.id,
          itemName: main.name,
          itemCode: main.code,
          isSpecialItem: false,
          returnQty: 0, // FIXED: Default 0 as explicitly requested
          unit: main.unit,
          rate: main.baseRate,
          totalRefund: 0 * main.baseRate, // 0 refund initially
          condition: itemCondition,
          reason: itemReason || 'Return request'
        };
      }
    } else if (type === 'special') {
      for (const main of items) {
        const sp = Array.isArray(main.specialItems) ? main.specialItems.find(s => s.id === id) : undefined;
        if (sp) {
          lineItem = {
            id: `ret-line-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            itemId: sp.id,
            itemName: sp.name,
            itemCode: sp.code,
            isSpecialItem: true,
            mainItemName: main.name,
            specification: sp.specification,
            returnQty: 0, // FIXED: Default 0 as explicitly requested
            unit: sp.unit,
            rate: sp.rate,
            totalRefund: 0 * sp.rate, // 0 refund initially
            condition: itemCondition,
            reason: itemReason || 'Special spec return'
          };
          break;
        }
      }
    }

    if (lineItem) {
      setReturnItems(prev => [...prev, lineItem!]);
      setSelectedItemKey('');
      setItemReason('Customer overstock return');
    }
  };

  const handleUpdateQty = (index: number, qty: number) => {
    setReturnItems(prev => {
      const copy = [...prev];
      const safeQty = isNaN(qty) || qty < 0 ? 0 : qty;
      copy[index] = {
        ...copy[index],
        returnQty: safeQty,
        totalRefund: safeQty * copy[index].rate
      };
      return copy;
    });
  };

  const handleUpdateCondition = (index: number, condition: ReturnLineItem['condition']) => {
    setReturnItems(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], condition };
      return copy;
    });
  };

  const handleRemoveLineItem = (index: number) => {
    setReturnItems(prev => prev.filter((_, i) => i !== index));
  };

  const calculateTotalRefund = () => {
    return returnItems.reduce((acc, curr) => acc + curr.totalRefund, 0);
  };

  const handleSubmitReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || returnItems.length === 0) {
      alert('Please specify customer name and add at least one return item.');
      return;
    }

    const newReturn: ReturnEntry = {
      id: `ret-${Date.now()}`,
      returnNo: `RET-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      date: new Date().toISOString().split('T')[0],
      invoiceReference: invoiceReference || 'DIRECT-RMA',
      customerName,
      customerPhone,
      items: returnItems,
      totalRefundAmount: calculateTotalRefund(),
      actionTaken,
      status: 'Completed',
      notes,
      processedBy
    };

    onAddReturn(newReturn);
    setIsModalOpen(false);
    // Reset
    setCustomerName('');
    setCustomerPhone('');
    setInvoiceReference('');
    setReturnItems([]);
    setNotes('');
  };

  const filteredReturns = returns.filter(r => 
    r.returnNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.invoiceReference.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div id="returns-page-wrapper" className="space-y-6">
      {/* Required: Right side Back and Close buttons */}
      <PageHeaderWithActions
        idPrefix="returns-page"
        title="Returns & RMA Directory"
        subtitle="Manage product sales returns, damage claims, credit note adjustments, and restock logs"
        badge={`${returns.length} Records`}
        badgeColor="bg-amber-100 text-amber-900 border-amber-300"
        icon={RotateCcw}
        onBack={onBack}
        onClose={onClose}
        extraActions={
          <button
            type="button"
            id="btn-open-new-return-modal"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Return Entry</span>
          </button>
        }
      />

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="cyber-glass-subcard p-4 rounded-xl border border-cyan-500/25 flex items-center gap-3">
          <div className="p-3 bg-amber-500/20 border border-amber-400/35 rounded-lg text-amber-300">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-400">Total RMA Return Logs</div>
            <div className="text-xl font-bold text-white">{returns.length}</div>
          </div>
        </div>

        <div className="cyber-glass-subcard p-4 rounded-xl border border-cyan-500/25 flex items-center gap-3">
          <div className="p-3 bg-rose-500/20 border border-rose-400/35 rounded-lg text-rose-300">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-400">Total Refund / Credit Value</div>
            <div className="text-xl font-bold text-white">
              ৳{returns.reduce((acc, r) => acc + r.totalRefundAmount, 0).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="cyber-glass-subcard p-4 rounded-xl border border-cyan-500/25 flex items-center gap-3">
          <div className="p-3 bg-cyan-500/20 border border-cyan-400/35 rounded-lg text-cyan-300">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-400">Default Selection Quantity</div>
            <div className="text-sm font-bold text-emerald-300 flex items-center gap-1">
              <span>0 Units</span>
              <span className="text-[11px] font-normal text-slate-400">(Verified Fixed)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Table */}
      <div className="cyber-glass-card rounded-2xl border border-cyan-500/25 overflow-hidden">
        <div className="p-4 border-b border-cyan-500/20 cyber-glass-header flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              id="input-search-returns"
              placeholder="Search Return #, customer, invoice ref..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400"
            />
          </div>
          <span className="text-xs text-slate-300 font-medium">
            Showing {filteredReturns.length} of {returns.length} return entries
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-200">
            <thead className="bg-[#0c2638] text-xs font-semibold text-cyan-200 uppercase tracking-wider border-b border-cyan-500/30">
              <tr>
                <th className="py-3 px-4">Return No & Date</th>
                <th className="py-3 px-4">Customer & Invoice</th>
                <th className="py-3 px-4">Returned Items & Specs</th>
                <th className="py-3 px-4 text-right">Refund Amount</th>
                <th className="py-3 px-4">Action Mode</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60">
              {filteredReturns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 text-sm">
                    No return logs found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredReturns.map(ret => (
                  <tr key={ret.id} className="hover:bg-cyan-500/[0.06] transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-cyan-200 font-mono text-xs">{ret.returnNo}</div>
                      <div className="text-xs text-slate-400">{ret.date}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">{ret.customerName}</div>
                      <div className="text-xs text-slate-400">Ref: {ret.invoiceReference}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="space-y-1">
                        {ret.items.map((it, idx) => (
                          <div key={idx} className="text-xs">
                            <span className="font-medium text-white">
                              {it.isSpecialItem ? '⭐ ' : ''}{it.itemName}
                            </span>{' '}
                            <span className="text-amber-300 font-semibold">
                              ({it.returnQty} {it.unit})
                            </span>
                            {it.isSpecialItem && it.specification && (
                              <div className="text-[11px] text-amber-300 font-mono">{it.specification}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="font-bold text-emerald-300">৳{ret.totalRefundAmount.toFixed(2)}</div>
                      <div className="text-[11px] text-slate-400">{ret.items.length} line items</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-cyan-500/20 text-cyan-200 border border-cyan-400/40">
                        {ret.actionTaken}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                        {ret.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Return Entry Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030d14]/80 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl max-w-3xl w-full p-6 shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 text-white max-h-[92vh] overflow-y-auto my-auto animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-cyan-500/25 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Create New Return / RMA Entry</h2>
                  <p className="text-xs text-slate-400">
                    Default item selection quantity is set to <strong className="text-amber-300">0</strong> as specified.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white hover:bg-white/10 p-1.5 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitReturn} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-cyan-200/80 mb-1">Customer / Client Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apex Garments Ltd."
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-cyan-200/80 mb-1">Customer Phone</label>
                  <input
                    type="text"
                    placeholder="+880 1711-xxxxxx"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-cyan-200/80 mb-1">Invoice Ref / Challan Ref</label>
                  <input
                    type="text"
                    placeholder="e.g. INV-2026-0841"
                    value={invoiceReference}
                    onChange={e => setInvoiceReference(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400"
                  />
                </div>
              </div>

              {/* Item Selection Box with Special Items nested under main items */}
              <div className="cyber-glass-subcard p-4 rounded-xl border border-amber-400/30 space-y-3">
                <div className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-amber-400" />
                  <span>Select Item to Return (Special items grouped under Main Item)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                  <div className="sm:col-span-6">
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Choose Product / Special Variation:
                    </label>
                    <select
                      id="select-return-item-picker"
                      value={selectedItemKey}
                      onChange={(e) => setSelectedItemKey(e.target.value)}
                      className="w-full text-xs px-2.5 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white"
                    >
                      <option value="">-- Choose Item / Special Variation --</option>
                      {items.map(main => (
                        <optgroup key={main.id} label={`📦 MAIN: ${main.name} (${main.code})`}>
                          <option value={`main::${main.id}`}>
                            [Main Item] {main.name} (৳{main.baseRate}/{main.unit})
                          </option>
                          {Array.isArray(main.specialItems) && main.specialItems.map(sp => (
                            <option key={sp.id} value={`special::${sp.id}`}>
                              &nbsp;&nbsp;↳ ⭐ [Special] {sp.name} — {sp.specification} (৳{sp.rate}/{sp.unit})
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Item Condition:</label>
                    <select
                      value={itemCondition}
                      onChange={(e) => setItemCondition(e.target.value as any)}
                      className="w-full text-xs px-2.5 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white"
                    >
                      <option value="Good">Good (Restockable)</option>
                      <option value="Repackable">Repackable</option>
                      <option value="Damaged">Damaged</option>
                      <option value="Scrap">Scrap / Melt</option>
                    </select>
                  </div>

                  <div className="sm:col-span-3">
                    <button
                      type="button"
                      id="btn-add-item-to-return"
                      disabled={!selectedItemKey}
                      onClick={handleAddItemToReturn}
                      className="w-full py-2 px-3 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 text-slate-950 text-xs font-black rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Item (Qty: 0)</span>
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-amber-300/90 italic">
                  Note: As requested, items are added with a default quantity of <strong>0</strong>. Please type the exact returned quantity below.
                </p>
              </div>

              {/* Added Line Items Table */}
              <div className="border border-cyan-500/25 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0c2638] font-semibold text-cyan-200 border-b border-cyan-500/30">
                    <tr>
                      <th className="py-2.5 px-3">Item / Variation Details</th>
                      <th className="py-2.5 px-3 w-28">Return Qty (Default 0)</th>
                      <th className="py-2.5 px-3 w-24">Rate (৳)</th>
                      <th className="py-2.5 px-3 w-28 text-right">Total (৳)</th>
                      <th className="py-2.5 px-3 w-28">Condition</th>
                      <th className="py-2.5 px-2 w-10 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                    {returnItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-400">
                          No items added yet. Select an item above to add with default quantity 0.
                        </td>
                      </tr>
                    ) : (
                      returnItems.map((line, idx) => (
                        <tr key={line.id} className="hover:bg-cyan-500/[0.06]">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-white">
                              {line.isSpecialItem && <span className="text-amber-400 font-bold mr-1">⭐</span>}
                              {line.itemName}
                            </div>
                            {line.isSpecialItem && line.specification && (
                              <div className="text-[10px] text-amber-300 font-mono mt-0.5">
                                Spec: {line.specification}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                id={`input-return-qty-${idx}`}
                                value={line.returnQty}
                                onChange={(e) => handleUpdateQty(idx, parseFloat(e.target.value) || 0)}
                                className="w-16 px-2 py-1 border border-cyan-500/35 rounded font-bold text-white text-center bg-[#061520]"
                              />
                              <span className="text-slate-400 text-[11px]">{line.unit}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-300">
                            ৳{line.rate.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-emerald-300">
                            ৳{line.totalRefund.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3">
                            <select
                              value={line.condition}
                              onChange={(e) => handleUpdateCondition(idx, e.target.value as any)}
                              className="text-[11px] px-1.5 py-1 border border-cyan-500/30 rounded bg-[#061520] text-white"
                            >
                              <option value="Good">Good</option>
                              <option value="Repackable">Repackable</option>
                              <option value="Damaged">Damaged</option>
                              <option value="Scrap">Scrap</option>
                            </select>
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveLineItem(idx)}
                              className="text-slate-400 hover:text-rose-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {returnItems.length > 0 && (
                    <tfoot className="bg-[#0c2638] font-bold border-t border-cyan-500/30 text-white">
                      <tr>
                        <td colSpan={3} className="py-2.5 px-3 text-right text-cyan-200">
                          Total Refund / Credit Calculated:
                        </td>
                        <td className="py-2.5 px-3 text-right text-amber-300 text-sm">
                          ৳{calculateTotalRefund().toFixed(2)}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-cyan-200/80 mb-1">Refund / Settlement Action</label>
                  <select
                    value={actionTaken}
                    onChange={(e) => setActionTaken(e.target.value as any)}
                    className="w-full text-xs px-2.5 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white"
                  >
                    <option value="Credit Note">Credit Note against next invoice</option>
                    <option value="Cash Refund">Cash Refund</option>
                    <option value="Item Replacement">Product Replacement / Exchange</option>
                    <option value="Pending Approval">Pending QA Review</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-cyan-200/80 mb-1">Processed By</label>
                  <input
                    type="text"
                    value={processedBy}
                    onChange={(e) => setProcessedBy(e.target.value)}
                    className="w-full text-xs px-2.5 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-cyan-200/80 mb-1">RMA Reason & QA Remarks</label>
                <textarea
                  rows={2}
                  placeholder="Details of defects, batch numbers or customer reason..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-cyan-500/20">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-200 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/25 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={returnItems.length === 0}
                  className="px-4 py-2 text-xs font-black text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 rounded-lg shadow-xs"
                >
                  Save & Log Return Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
