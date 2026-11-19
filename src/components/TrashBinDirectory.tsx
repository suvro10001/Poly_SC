import React, { useState, useEffect } from 'react';
import { Item, Party } from '../types';
import { unrecordDeletedEntityId, recordDeletedEntityId } from '../utils/deletedTracker';
import { Trash2, AlertTriangle, Database, Building2, CheckCircle2, ArrowLeft, X } from 'lucide-react';

interface TrashBinDirectoryProps {
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  parties: Party[];
  setParties: React.Dispatch<React.SetStateAction<Party[]>>;
  onSyncCloud?: (dataSlice: Record<string, any>, immediate?: boolean) => void;
  onBack?: () => void;
  onClose?: () => void;
}

export const TrashBinDirectory: React.FC<TrashBinDirectoryProps> = ({
  items,
  setItems,
  parties,
  setParties,
  onSyncCloud,
  onBack,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'items' | 'parties'>('items');

  // Trashed Items State
  const [trashedItems, setTrashedItems] = useState<Item[]>(() => {
    try {
      const saved = localStorage.getItem('polycables_trashed_items');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Trashed Parties State
  const [trashedParties, setTrashedParties] = useState<Party[]>(() => {
    try {
      const saved = localStorage.getItem('polycables_trashed_parties');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'empty_items' | 'empty_parties' | 'delete_item' | 'delete_party';
    targetId?: string;
    targetName?: string;
    count?: number;
  } | null>(null);

  // Reload trash from localStorage on mount & tab change & window focus
  useEffect(() => {
    const reloadTrash = () => {
      try {
        const savedI = localStorage.getItem('polycables_trashed_items');
        if (savedI) setTrashedItems(JSON.parse(savedI));
        const savedP = localStorage.getItem('polycables_trashed_parties');
        if (savedP) setTrashedParties(JSON.parse(savedP));
      } catch (e) {
        console.error(e);
      }
    };
    reloadTrash();
    window.addEventListener('storage', reloadTrash);
    window.addEventListener('focus', reloadTrash);
    return () => {
      window.removeEventListener('storage', reloadTrash);
      window.removeEventListener('focus', reloadTrash);
    };
  }, [activeTab]);

  // Persist trash to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('polycables_trashed_items', JSON.stringify(trashedItems));
    } catch (e) {
      console.error(e);
    }
  }, [trashedItems]);

  useEffect(() => {
    try {
      localStorage.setItem('polycables_trashed_parties', JSON.stringify(trashedParties));
    } catch (e) {
      console.error(e);
    }
  }, [trashedParties]);

  // Toast notification
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  // --- ITEM HANDLERS ---
  const handleRestoreItem = (id: string) => {
    const itemToRestore = trashedItems.find((i) => i.id === id);
    if (itemToRestore) {
      const restoredRecord: Item = { ...itemToRestore, updatedAt: new Date().toISOString() } as Item;
      unrecordDeletedEntityId(id);
      try {
        localStorage.removeItem('polycables_items_cleared');
        const savedDel = localStorage.getItem('polycables_deleted_item_ids');
        if (savedDel) {
          const arr = JSON.parse(savedDel);
          if (Array.isArray(arr)) {
            localStorage.setItem('polycables_deleted_item_ids', JSON.stringify(arr.filter((x: string) => x !== id)));
          }
        }
      } catch {}

      const nextItems = [restoredRecord, ...items.filter((i) => i.id !== id)];
      const specialList = nextItems.filter((it) => it.isSpecialItem);
      setItems(nextItems);
      try {
        localStorage.setItem('polycables_items', JSON.stringify(nextItems));
        localStorage.setItem('polycables_special_items', JSON.stringify(specialList));
        window.dispatchEvent(new CustomEvent('polycables_items_updated', { detail: { items: nextItems } }));
        window.dispatchEvent(new CustomEvent('polycables_entity_restored', { detail: { ids: [id] } }));
      } catch {}

      fetch('/api/sync/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: (window as any).__polycablesClientSyncId,
          ids: [id],
          restoredItems: { items: [restoredRecord] }
        })
      }).catch(() => {});

      onSyncCloud?.({
        items: nextItems,
        specialItems: specialList,
        restoredEntityIds: [id],
        _itemsCleared: false,
        _isRestore: true
      }, true);

      setTrashedItems((prev) => prev.filter((i) => i.id !== id));
      showToast(`Restored item "${itemToRestore.name}" back to Item List!`);
    }
  };

  // --- PARTY HANDLERS ---
  const handleRestoreParty = (id: string) => {
    const partyToRestore = trashedParties.find((p) => p.id === id);
    if (partyToRestore) {
      const restoredParty: Party = { ...partyToRestore, updatedAt: new Date().toISOString() } as Party;
      unrecordDeletedEntityId(id);
      const nextParties = [restoredParty, ...parties.filter((p) => p.id !== id)];
      setParties(nextParties);
      try {
        localStorage.setItem('polycables_parties', JSON.stringify(nextParties));
        window.dispatchEvent(new CustomEvent('polycables_entity_restored', { detail: { ids: [id] } }));
      } catch {}

      fetch('/api/sync/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: (window as any).__polycablesClientSyncId,
          ids: [id],
          restoredItems: { parties: [restoredParty] }
        })
      }).catch(() => {});

      onSyncCloud?.({
        parties: nextParties,
        restoredEntityIds: [id],
        _isRestore: true
      }, true);

      setTrashedParties((prev) => prev.filter((p) => p.id !== id));
      showToast(`Restored customer "${partyToRestore.name}" back to Party Directory!`);
    }
  };

  const handleExecuteConfirmedDelete = () => {
    if (!confirmModal) return;
    const { type, targetId } = confirmModal;
    const deletedIds: string[] = [];

    if (type === 'empty_items') {
      trashedItems.forEach((it) => {
        recordDeletedEntityId(it.id);
        deletedIds.push(it.id);
      });
      setTrashedItems([]);
      try {
        localStorage.setItem('polycables_trashed_items', JSON.stringify([]));
      } catch (e) {}
      showToast('All trashed items permanently deleted.');
    } else if (type === 'empty_parties') {
      trashedParties.forEach((p) => {
        recordDeletedEntityId(p.id);
        deletedIds.push(p.id);
      });
      setTrashedParties([]);
      try {
        localStorage.setItem('polycables_trashed_parties', JSON.stringify([]));
      } catch (e) {}
      showToast('All trashed customers permanently deleted.');
    } else if (type === 'delete_item' && targetId) {
      recordDeletedEntityId(targetId);
      deletedIds.push(targetId);
      setTrashedItems((prev) => {
        const next = prev.filter((i) => i.id !== targetId);
        try { localStorage.setItem('polycables_trashed_items', JSON.stringify(next)); } catch (e) {}
        return next;
      });
      showToast('Item permanently deleted.');
    } else if (type === 'delete_party' && targetId) {
      recordDeletedEntityId(targetId);
      deletedIds.push(targetId);
      setTrashedParties((prev) => {
        const next = prev.filter((p) => p.id !== targetId);
        try { localStorage.setItem('polycables_trashed_parties', JSON.stringify(next)); } catch (e) {}
        return next;
      });
      showToast('Customer permanently deleted.');
    }

    if (deletedIds.length > 0) {
      try {
        window.dispatchEvent(new CustomEvent('polycables_entity_deleted', { detail: { ids: deletedIds } }));
      } catch {}
      fetch('/api/sync/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: (window as any).__polycablesClientSyncId,
          ids: deletedIds,
          type: type.includes('party') ? 'party' : 'item'
        })
      }).catch(() => {});
      onSyncCloud?.({
        deletedEntityIds: deletedIds,
        _isDeleteOperation: true
      }, true);
    }

    setConfirmModal(null);
  };

  const totalTrashCount = trashedItems.length + trashedParties.length;

  return (
    <div className="cyber-glass-card rounded-2xl overflow-hidden font-sans space-y-0 relative text-white">
      {/* Toast Banner */}
      {toast && (
        <div className="bg-emerald-950/90 text-emerald-200 p-3 px-4 text-xs font-bold flex items-center justify-between border-b border-emerald-400/35 animate-in fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            <span>{toast}</span>
          </div>
        </div>
      )}

      {/* Main Header */}
      <div className="cyber-glass-header text-white p-4 flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/25">
        <div className="flex items-center space-x-3">
          <div className="bg-rose-500/20 border border-rose-400/35 p-2 rounded-lg">
            <Trash2 className="w-5 h-5 text-rose-300" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Trash ({totalTrashCount})</h2>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Tab Switcher */}
          <div className="flex items-center space-x-2 bg-[#071824] p-1 rounded-lg border border-cyan-500/25">
            <button
              onClick={() => setActiveTab('items')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'items'
                  ? 'bg-cyan-400 text-slate-950 font-black shadow-xs'
                  : 'text-slate-200 hover:bg-[#0e2a3d]'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Deleted Items</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                activeTab === 'items'
                  ? 'bg-slate-950/20 text-slate-950'
                  : 'bg-[#061520] text-cyan-300 border border-cyan-500/30'
              }`}>
                {trashedItems.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('parties')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'parties'
                  ? 'bg-cyan-400 text-slate-950 font-black shadow-xs'
                  : 'text-slate-200 hover:bg-[#0e2a3d]'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Deleted Customers</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                activeTab === 'parties'
                  ? 'bg-slate-950/20 text-slate-950'
                  : 'bg-[#061520] text-cyan-300 border border-cyan-500/30'
              }`}>
                {trashedParties.length}
              </span>
            </button>
          </div>

          {onBack && (
            <button
              onClick={onBack}
              className="p-2 bg-[#081b28] hover:bg-[#0e2a3d] text-white rounded-lg border border-cyan-500/25 transition-colors cursor-pointer"
              title="Go Back"
            >
              <ArrowLeft className="w-4 h-4 text-slate-200" />
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg border border-rose-500 transition-colors cursor-pointer"
              title="Close View"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          )}
        </div>
      </div>

      {/* Tab 1: Trashed Items */}
      {activeTab === 'items' && (
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-bold text-cyan-200">
              Items in Trash Bin ({trashedItems.length})
            </div>
            {trashedItems.length > 0 && (
              <button
                onClick={() =>
                  setConfirmModal({
                    isOpen: true,
                    type: 'empty_items',
                    count: trashedItems.length
                  })
                }
                className="bg-rose-600 hover:bg-rose-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center space-x-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Empty Item Trash</span>
              </button>
            )}
          </div>

          {trashedItems.length === 0 ? (
            <div className="text-center py-16 text-slate-400 cyber-glass-subcard rounded-xl border border-dashed border-cyan-500/25">
              <Trash2 className="w-12 h-12 mx-auto text-cyan-500/40 mb-2" />
              <p className="font-bold text-slate-200">No Items in Trash</p>
              <p className="text-xs text-slate-400 mt-1">Deleted items will appear here where you can restore them or permanently delete them.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-cyan-500/25 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#0c2638] text-cyan-200 font-bold border-b border-cyan-500/30 uppercase text-[10px]">
                    <th className="p-3 w-12 text-center">SL #</th>
                    <th className="p-3">Item Name</th>
                    <th className="p-3">Size/Spec</th>
                    <th className="p-3">Category</th>
                    <th className="p-3 text-right">Rate</th>
                    <th className="p-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                  {trashedItems.map((item, index) => (
                    <tr key={item.id} className="hover:bg-cyan-500/[0.06]">
                      <td className="p-3 text-center font-mono text-slate-400">{index + 1}</td>
                      <td className="p-3 font-bold text-white">{item.name}</td>
                      <td className="p-3 text-slate-300">{item.sizeSpec || '-'}</td>
                      <td className="p-3 text-slate-300">{item.category || '-'}</td>
                      <td className="p-3 text-right font-mono text-emerald-300">৳{item.rate}</td>
                      <td className="p-3 text-center space-x-2">
                        <button
                          onClick={() => handleRestoreItem(item.id)}
                          className="bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black px-2.5 py-1 rounded text-xs cursor-pointer"
                        >
                          Restore
                        </button>
                        <button
                          onClick={() =>
                            setConfirmModal({
                              isOpen: true,
                              type: 'delete_item',
                              targetId: item.id,
                              targetName: item.name
                            })
                          }
                          className="bg-rose-600 hover:bg-rose-500 text-white px-2.5 py-1 rounded text-xs font-bold cursor-pointer"
                        >
                          Delete Permanently
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Trashed Parties */}
      {activeTab === 'parties' && (
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-bold text-cyan-200">
              Customers in Trash Bin ({trashedParties.length})
            </div>
            {trashedParties.length > 0 && (
              <button
                onClick={() =>
                  setConfirmModal({
                    isOpen: true,
                    type: 'empty_parties',
                    count: trashedParties.length
                  })
                }
                className="bg-rose-600 hover:bg-rose-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center space-x-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Empty Customer Trash</span>
              </button>
            )}
          </div>

          {trashedParties.length === 0 ? (
            <div className="text-center py-16 text-slate-400 cyber-glass-subcard rounded-xl border border-dashed border-cyan-500/25">
              <Building2 className="w-12 h-12 mx-auto text-cyan-500/40 mb-2" />
              <p className="font-bold text-slate-200">No Customers in Trash</p>
              <p className="text-xs text-slate-400 mt-1">Deleted customers will appear here where you can restore them or permanently remove them.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-cyan-500/25 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#0c2638] text-cyan-200 font-bold border-b border-cyan-500/30 uppercase text-[10px]">
                    <th className="p-3 w-12 text-center">SL #</th>
                    <th className="p-3">Customer Name</th>
                    <th className="p-3">Address</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                  {trashedParties.map((party, index) => (
                    <tr key={party.id ? `${party.id}-${index}` : `party-${index}`} className="hover:bg-cyan-500/[0.06]">
                      <td className="p-3 text-center font-mono text-slate-400">{index + 1}</td>
                      <td className="p-3 font-bold text-white">{party.name}</td>
                      <td className="p-3 text-slate-300">{party.address || '-'}</td>
                      <td className="p-3 text-slate-300">{party.phone || '-'}</td>
                      <td className="p-3 text-center space-x-2">
                        <button
                          onClick={() => handleRestoreParty(party.id)}
                          className="bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black px-2.5 py-1 rounded text-xs cursor-pointer"
                        >
                          Restore
                        </button>
                        <button
                          onClick={() =>
                            setConfirmModal({
                              isOpen: true,
                              type: 'delete_party',
                              targetId: party.id,
                              targetName: party.name
                            })
                          }
                          className="bg-rose-600 hover:bg-rose-500 text-white px-2.5 py-1 rounded text-xs font-bold cursor-pointer"
                        >
                          Delete Permanently
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl border border-cyan-400/35 shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-md w-full p-6 space-y-4 font-sans text-white">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-400/35 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {confirmModal.type === 'empty_items'
                    ? 'Empty Item Trash?'
                    : confirmModal.type === 'empty_parties'
                    ? 'Empty Customer Trash?'
                    : 'Permanently Delete Record?'}
                </h3>
                <p className="text-xs text-slate-300">
                  This action is permanent and cannot be undone.
                </p>
              </div>
            </div>

            <div className="bg-rose-950/50 border border-rose-400/35 rounded-xl p-3.5 space-y-1.5 text-xs text-rose-200">
              {confirmModal.type.startsWith('empty_') ? (
                <p>
                  Are you sure you want to permanently delete all <strong>{confirmModal.count}</strong> record(s)?
                </p>
              ) : (
                <p>
                  Are you sure you want to permanently delete: <strong>{confirmModal.targetName || 'this record'}</strong>?
                </p>
              )}
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteConfirmedDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs flex items-center space-x-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Yes, Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
