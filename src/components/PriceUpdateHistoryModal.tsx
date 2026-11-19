import React, { useState } from 'react';
import { Item, PriceListRevision } from '../types';
import {
  X,
  Calendar,
  CheckCircle2,
  Download,
  Check,
  Plus,
  History,
  AlertCircle,
  FileSpreadsheet,
  Clock,
  Sparkles
} from 'lucide-react';
import {
  getPriceListRevisions,
  savePriceListRevisions,
  activatePriceListRevision,
  addPriceListRevision,
  exportPriceUpdateByEffectiveDate
} from '../utils/xlsxItemHelper';
import { formatDateDDMMYY } from '../utils/dateUtils';
import { DateInputWithPicker } from './DateInputWithPicker';

interface PriceUpdateHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  onActiveRevisionChanged?: (revision: PriceListRevision) => void;
}

export const PriceUpdateHistoryModal: React.FC<PriceUpdateHistoryModalProps> = ({
  isOpen,
  onClose,
  items,
  setItems,
  onActiveRevisionChanged
}) => {
  const [revisions, setRevisions] = useState<PriceListRevision[]>(() => getPriceListRevisions(items));
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newEffectiveDate, setNewEffectiveDate] = useState('01.02.26');
  const [newLabel, setNewLabel] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [notification, setNotification] = useState<{ type: 'success' | 'info'; message: string } | null>(null);

  if (!isOpen) return null;

  const handleSetActive = (rev: PriceListRevision) => {
    const result = activatePriceListRevision(rev.id, items);
    setRevisions(result.updatedRevisions);
    setItems(result.updatedItems);
    setNotification({
      type: 'success',
      message: `Price List with Effective Date "${rev.effectiveDate}" is now ACTIVE. Existing bills and challans retain their recorded historical prices.`
    });
    if (onActiveRevisionChanged) {
      onActiveRevisionChanged(rev);
    }
  };

  const handleCreateNewRevision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEffectiveDate.trim()) return;

    const normalizedDate = formatDateDDMMYY(newEffectiveDate.trim()) || newEffectiveDate.trim();
    const updated = addPriceListRevision(
      normalizedDate,
      items,
      newLabel.trim() || `Price List (${normalizedDate})`,
      newNotes.trim() || `Registered on ${new Date().toLocaleDateString()}`
    );

    setRevisions(updated);
    setIsAddingNew(false);
    setNewEffectiveDate('');
    setNewLabel('');
    setNewNotes('');
    setNotification({
      type: 'success',
      message: `New Price List Revision for Effective Date "${normalizedDate}" created and activated successfully.`
    });
  };

  const handleExportRevision = (rev: PriceListRevision) => {
    const exportTargetItems = rev.snapshotItems && rev.snapshotItems.length > 0 ? rev.snapshotItems : items;
    exportPriceUpdateByEffectiveDate(exportTargetItems, rev.effectiveDate);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-[#030d14]/80 backdrop-blur-sm overflow-y-auto no-print">
      <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-white">
        {/* Header */}
        <div className="bg-[#0c2638]/90 text-white px-5 py-4 flex items-center justify-between border-b border-cyan-500/25">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/35 flex items-center justify-center text-amber-300">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-white tracking-tight">Price Update History & Effective Dates</h3>
                <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-400/35">
                  Master Directory
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Manage effective date price lists. Activating a price list does not alter previous bills, challans, or ledger reports.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-cyan-500/15 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notification Toast */}
        {notification && (
          <div className="bg-emerald-500/15 border-b border-emerald-400/30 px-5 py-2.5 flex items-center justify-between text-xs text-emerald-200 font-medium">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{notification.message}</span>
            </div>
            <button onClick={() => setNotification(null)} className="text-emerald-300 hover:text-white cursor-pointer font-bold">
              ×
            </button>
          </div>
        )}

        {/* Body Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* Action Toolbar */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="text-xs font-bold text-cyan-200">Effective Date Revision List</span>
              <span className="text-xs text-slate-400 ml-2">({revisions.length} recorded revisions)</span>
            </div>
            <button
              onClick={() => setIsAddingNew(!isAddingNew)}
              className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black flex items-center space-x-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isAddingNew ? 'Cancel' : 'Register New Effective Date'}</span>
            </button>
          </div>

          {/* New Revision Form */}
          {isAddingNew && (
            <form onSubmit={handleCreateNewRevision} className="p-4 bg-amber-500/10 border border-amber-400/30 rounded-xl space-y-3">
              <div className="flex items-center space-x-2 text-xs font-bold text-amber-200">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Add New Price List Effective Date</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-cyan-200 mb-1">
                    Effective Date * (dd.mm.yy)
                  </label>
                  <DateInputWithPicker
                    value={newEffectiveDate}
                    onChange={setNewEffectiveDate}
                    valueFormat="ddmmyy"
                    theme="dark"
                    required
                    inputClassName="px-3 py-1.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-cyan-200 mb-1">
                    Revision Label
                  </label>
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="e.g. Revised Price List (Feb 2026)"
                    className="w-full bg-[#061520] border border-cyan-500/30 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-cyan-200 mb-1">
                    Notes / Remarks
                  </label>
                  <input
                    type="text"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="e.g. Company price circular revision"
                    className="w-full bg-[#061520] border border-cyan-500/30 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-hidden"
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingNew(false)}
                  className="px-3 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 text-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-black flex items-center space-x-1 shadow-xs cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save & Activate</span>
                </button>
              </div>
            </form>
          )}

          {/* Revisions Table */}
          <div className="border border-cyan-500/25 bg-[#071824]/70 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0c2638] border-b border-cyan-500/30 text-cyan-200 font-bold">
                <tr>
                  <th className="p-3">Effective Date</th>
                  <th className="p-3">Revision Label</th>
                  <th className="p-3 text-center">Items Count</th>
                  <th className="p-3">Created / Registered</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 font-medium text-slate-200">
                {revisions.map((rev) => (
                  <tr
                    key={rev.id}
                    className={`hover:bg-cyan-500/[0.06] transition-colors ${
                      rev.isActive ? 'bg-amber-500/10 font-semibold' : ''
                    }`}
                  >
                    <td className="p-3 font-mono font-bold text-white flex items-center space-x-1.5">
                      <Calendar className="w-3.5 h-3.5 text-amber-400" />
                      <span>{rev.effectiveDate}</span>
                    </td>
                    <td className="p-3 text-white">
                      <div>{rev.label}</div>
                      {rev.notes && <div className="text-[11px] text-slate-400">{rev.notes}</div>}
                    </td>
                    <td className="p-3 text-center font-mono text-cyan-200">{rev.itemCount || items.length} Items</td>
                    <td className="p-3 text-slate-400 text-[11px]">
                      {new Date(rev.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-center">
                      {rev.isActive ? (
                        <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          ACTIVE
                        </span>
                      ) : (
                        <span className="bg-[#0b2334] text-slate-300 border border-cyan-500/25 text-[10px] font-medium px-2 py-0.5 rounded-full">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right space-x-1.5">
                      {!rev.isActive && (
                        <button
                          onClick={() => handleSetActive(rev)}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-[11px] font-black shadow-xs cursor-pointer inline-flex items-center gap-1"
                          title="Activate this price list"
                        >
                          <Check className="w-3 h-3" />
                          <span>Set Active</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleExportRevision(rev)}
                        className="px-2.5 py-1 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/30 rounded-lg text-[11px] font-semibold cursor-pointer inline-flex items-center gap-1"
                        title="Download price sheet (.xlsx)"
                      >
                        <Download className="w-3 h-3 text-cyan-300" />
                        <span>Export .xlsx</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-[#0b2334]/80 border border-cyan-500/25 rounded-xl p-3 text-slate-300 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
            <span>
              <strong className="text-cyan-200">Note on Historical Integrity:</strong> Changing or activating an effective date price list updates the current pricing catalogue for newly created bills and requisitions. Stored invoices, past challans, and customer ledgers maintain their own recorded historical line prices and are completely untouched.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#071824]/90 px-5 py-3 border-t border-cyan-500/20 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
