import React, { useState } from 'react';
import { DuplicateDatePartyAmountGroup } from '../utils/bankDepositDuplicateChecker';
import { formatDateDDMMYY } from '../utils/dateUtils';
import { X, Trash2, CheckCircle2, HelpCircle, AlertTriangle } from 'lucide-react';

interface WhoIsDuplicateModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: DuplicateDatePartyAmountGroup[];
  onDeleteCollection: (id: string, label: string, amount: number) => void;
  onDeleteDeposit: (id: string, label: string, amount: number) => void;
  onAcknowledgeGroup: (groupId: string) => void;
  onRemoveAllDuplicates?: () => void;
}

export const WhoIsDuplicateModal: React.FC<WhoIsDuplicateModalProps> = ({
  isOpen,
  onClose,
  groups,
  onDeleteCollection,
  onDeleteDeposit,
  onAcknowledgeGroup,
  onRemoveAllDuplicates
}) => {
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleRemoveAll = () => {
    if (!onRemoveAllDuplicates) return;
    setIsProcessing(true);
    try {
      onRemoveAllDuplicates();
      setTimeout(() => {
        setIsProcessing(false);
        onClose();
      }, 250);
    } catch (err) {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-white">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">
                Who Is Duplicate? Review Candidate Records
              </h2>
              <p className="text-xs text-slate-400">
                Entries sharing the exact same Date, Party Name & Amount
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {groups.length > 0 && onRemoveAllDuplicates && (
              <button
                type="button"
                onClick={handleRemoveAll}
                disabled={isProcessing}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-black text-xs rounded-lg shadow-sm flex items-center space-x-1.5 cursor-pointer transition-all border border-rose-500"
                title="Automatically remove all duplicate entries"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isProcessing ? 'Removing...' : 'Remove All Duplicates'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Info Banner when duplicates exist */}
        {groups.length > 0 && (
          <div className="px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between text-xs text-amber-300">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Found <strong>{groups.length}</strong> candidate group{groups.length === 1 ? '' : 's'}. You can delete individually, mark both as valid, or remove all duplicates in 1-click.
              </span>
            </div>
            {onRemoveAllDuplicates && (
              <button
                type="button"
                onClick={handleRemoveAll}
                disabled={isProcessing}
                className="text-xs font-bold text-rose-400 hover:text-rose-300 underline cursor-pointer ml-2 shrink-0"
              >
                Remove all duplicates now →
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {groups.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3 opacity-90" />
              <p className="font-extrabold text-white text-base">No duplicate candidate pairs found!</p>
              <p className="text-xs text-slate-400 mt-1">All entries in Deposit History and Cash Collections are clear and unique.</p>
            </div>
          ) : (
            groups.map((group, idx) => (
              <div
                key={group.groupId || idx}
                className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                  <div>
                    <span className="font-extrabold text-amber-300 text-sm">
                      {group.partyName}
                    </span>
                    <div className="text-xs text-slate-400 flex items-center space-x-2 mt-0.5">
                      <span>Date: {formatDateDDMMYY(group.date)}</span>
                      <span>•</span>
                      <span className="font-mono font-bold text-emerald-300">
                        ৳{group.amount.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onAcknowledgeGroup(group.groupId)}
                    className="px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/40 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                    title="Mark this group as legitimate distinct transactions (not duplicates)"
                  >
                    ✓ Both Are Valid (Not Duplicate)
                  </button>
                </div>

                <div className="space-y-2">
                  {/* Cash Collections in this group */}
                  {group.cashItems.map((c) => (
                    <div
                      key={c.id}
                      className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-blue-300">
                          Cash Collection ({c.mrNo || 'MR'})
                        </span>
                        <div className="text-[11px] text-slate-400">
                          {c.remarks || 'Cash Collection Entry'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteCollection(c.id, c.partyName || group.partyName, c.amount)}
                        className="px-2.5 py-1 bg-rose-600/30 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-500/40 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete Collection</span>
                      </button>
                    </div>
                  ))}

                  {/* Bank Deposits in this group */}
                  {group.depositItems.map((d) => (
                    <div
                      key={d.id}
                      className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-purple-300">
                          Bank Deposit ({d.bankName} - {d.accountName})
                        </span>
                        <div className="text-[11px] text-slate-400">
                          Voucher: {d.voucherNo || 'N/A'} • {d.remarks || 'Deposit Entry'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteDeposit(d.id, d.customerName || d.partyName || group.partyName, d.amount)}
                        className="px-2.5 py-1 bg-rose-600/30 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-500/40 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete Deposit</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div>
            {groups.length > 0 && (
              <span className="text-xs text-amber-400 font-semibold">
                {groups.length} duplicate group{groups.length === 1 ? '' : 's'} to resolve
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {groups.length > 0 && onRemoveAllDuplicates && (
              <button
                type="button"
                onClick={handleRemoveAll}
                disabled={isProcessing}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center space-x-1.5 cursor-pointer transition-all border border-rose-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isProcessing ? 'Removing Duplicates...' : `Remove All Duplicates (${groups.length})`}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
