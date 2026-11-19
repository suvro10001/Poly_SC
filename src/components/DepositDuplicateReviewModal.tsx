import React, { useState, useMemo } from 'react';
import { BankDeposit, CollectionMR } from '../types';
import { findDuplicateDepositGroups, DuplicateDepositGroup } from '../utils/bankDepositDuplicateChecker';
import { formatDateDDMMYY } from '../utils/dateUtils';
import { X, Trash2, CheckCircle, AlertTriangle, Layers } from 'lucide-react';

interface DepositDuplicateReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  bankDeposits: BankDeposit[];
  collections?: CollectionMR[];
  onDeleteDuplicates: (ids: string[]) => void;
}

export const DepositDuplicateReviewModal: React.FC<DepositDuplicateReviewModalProps> = ({
  isOpen,
  onClose,
  bankDeposits,
  collections = [],
  onDeleteDuplicates
}) => {
  const groups: DuplicateDepositGroup[] = useMemo(() => {
    return findDuplicateDepositGroups(bankDeposits, collections);
  }, [bankDeposits, collections]);

  const [selectedIdsToDelete, setSelectedIdsToDelete] = useState<string[]>(() => {
    // By default, select all but the first entry in each group
    const initialToDelete: string[] = [];
    groups.forEach((g) => {
      if (g.deposits.length > 1) {
        // Keep index 0, mark the rest for deletion
        g.deposits.slice(1).forEach((d) => initialToDelete.push(d.id));
      }
    });
    return initialToDelete;
  });

  // Sync selected IDs when groups update
  React.useEffect(() => {
    const initialToDelete: string[] = [];
    groups.forEach((g) => {
      if (g.deposits.length > 1) {
        g.deposits.slice(1).forEach((d) => initialToDelete.push(d.id));
      }
    });
    setSelectedIdsToDelete(initialToDelete);
  }, [groups]);

  if (!isOpen) return null;

  const handleToggle = (id: string) => {
    setSelectedIdsToDelete((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleConfirmDelete = () => {
    if (selectedIdsToDelete.length === 0) {
      onClose();
      return;
    }
    onDeleteDuplicates(selectedIdsToDelete);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-white">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">
                Review Duplicate Bank Deposits
              </h2>
              <p className="text-xs text-slate-400">
                {groups.length} duplicate group{groups.length === 1 ? '' : 's'} found with identical date, bank, account & amount
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {groups.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2 opacity-80" />
              <p className="font-bold text-white text-sm">No duplicate bank deposits found!</p>
              <p className="text-xs text-slate-400 mt-1">All bank deposit records are unique.</p>
            </div>
          ) : (
            groups.map((group, gIdx) => (
              <div
                key={group.groupId || gIdx}
                className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2.5"
              >
                <div className="flex items-center justify-between text-xs font-bold text-amber-400 border-b border-slate-800/80 pb-2">
                  <span>Group #{gIdx + 1}: {group.deposits.length} identical deposit records</span>
                  <span className="font-mono text-emerald-300">
                    Amount: ৳{group.deposits[0]?.amount?.toLocaleString() || 0}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {group.deposits.map((dep, dIdx) => {
                    const isSelected = selectedIdsToDelete.includes(dep.id);
                    return (
                      <div
                        key={dep.id}
                        onClick={() => handleToggle(dep.id)}
                        className={`p-2.5 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-rose-950/40 border-rose-700/60 text-rose-200'
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggle(dep.id)}
                            className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 accent-rose-600 cursor-pointer"
                          />
                          <div>
                            <span className="font-bold text-white">
                              {((dep.partyName || dep.customerName || '').trim().toLowerCase() !== 'customer' ? (dep.partyName || dep.customerName) : '') || dep.entityName || '-'}
                            </span>
                            <div className="text-[11px] text-slate-400 flex items-center space-x-2 mt-0.5">
                              <span>Date: {formatDateDDMMYY(dep.depositDate || dep.date)}</span>
                              <span>•</span>
                              <span>{dep.bankName} ({dep.accountName})</span>
                              {dIdx === 0 && (
                                <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded text-[9px] font-bold">
                                  Primary (Keep)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <span className="font-mono font-bold text-white">
                          ৳{dep.amount?.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/50">
          <span className="text-xs text-slate-400">
            Selected for deletion: <strong className="text-rose-400">{selectedIdsToDelete.length}</strong> record(s)
          </span>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={selectedIdsToDelete.length === 0}
              className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white rounded-xl transition-colors flex items-center space-x-1.5 cursor-pointer shadow-md"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete {selectedIdsToDelete.length} Duplicates</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
