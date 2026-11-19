import React, { useState, useEffect, useMemo } from 'react';
import { Item, SpecialItem } from '../types';
import { PageHeaderWithActions } from './PageHeaderWithActions';
import { matchesFlexibleSearch, groupItemsByCategoryOrder } from '../utils/searchHelper';
import { getAllCategories } from '../utils/categoryHelper';
import { 
  Trash2, 
  RotateCcw, 
  Search, 
  AlertTriangle, 
  Package, 
  Sparkles, 
  Layers 
} from 'lucide-react';

interface ItemTrashPageProps {
  trashItems: (Item | (SpecialItem & { parentItemName?: string }))[];
  onRestoreItem: (item: any) => void;
  onPermanentDelete: (id: string) => void;
  onEmptyTrash: () => void;
  onBack: () => void;
  onClose: () => void;
}

export const ItemTrashPage: React.FC<ItemTrashPageProps> = ({
  trashItems,
  onRestoreItem,
  onPermanentDelete,
  onEmptyTrash,
  onBack,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showEmptyConfirm, setShowEmptyConfirm] = useState(false);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ id: string; name: string } | null>(null);

  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => getAllCategories());
  useEffect(() => {
    const refresh = () => setCategoryOrder(getAllCategories());
    window.addEventListener('categories-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('categories-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const filtered = useMemo(() => {
    const raw = trashItems.filter(item => {
      if (!item) return false;
      return matchesFlexibleSearch(
        `${item.name || ''} ${(item as any).sizeSpec || ''} ${(item as any).category || ''}`,
        searchTerm,
        `${(item as any).code || ''}`
      );
    });
    return groupItemsByCategoryOrder(raw as any[], categoryOrder).orderedItems as typeof raw;
  }, [trashItems, searchTerm, categoryOrder]);

  return (
    <div id="item-trash-page-wrapper" className="space-y-6">
      {/* Required: Right side Back and Close buttons */}
      <PageHeaderWithActions
        idPrefix="item-trash-page"
        title="Item Trash & Archive Bin"
        subtitle="Recover deleted main products and special variations, or purge permanently"
        badge={`${trashItems.length} Archived Items`}
        badgeColor="bg-rose-500/20 text-rose-200 border-rose-500/35"
        icon={Trash2}
        onBack={onBack}
        onClose={onClose}
        extraActions={
          trashItems.length > 0 ? (
            <button
              type="button"
              id="btn-empty-trash"
              onClick={() => setShowEmptyConfirm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/35 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Empty Trash Bin</span>
            </button>
          ) : undefined
        }
      />

      {/* Trash Table */}
      <div className="cyber-glass-card rounded-2xl overflow-hidden text-white">
        <div className="p-4 border-b border-cyan-500/25 bg-[#0b2334]/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-cyan-400/70 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              id="input-trash-search"
              placeholder="Search deleted item name or code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400"
            />
          </div>

          <span className="text-xs text-slate-300">
            {trashItems.length} items currently in recycle queue
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-200">
            <thead className="bg-[#0c2638] text-xs font-semibold text-cyan-200 uppercase tracking-wider border-b border-cyan-500/30">
              <tr>
                <th className="py-3 px-4">Item Type & Code</th>
                <th className="py-3 px-4">Name & Specifications</th>
                <th className="py-3 px-4">Deleted Timestamp</th>
                <th className="py-3 px-4 text-right">Last Recorded Rate</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <Trash2 className="w-10 h-10 text-cyan-400/40 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-200">Trash Bin is Empty</p>
                    <p className="text-xs text-slate-400 mt-0.5">No deleted main items or special variations found.</p>
                  </td>
                </tr>
              ) : (
                filtered.map(item => {
                  const isSpecial = 'mainItemId' in item;
                  return (
                    <tr key={item.id} className="hover:bg-cyan-500/[0.06] transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          {isSpecial ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/35">
                              <Sparkles className="w-3 h-3" /> Special Item
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-500/20 text-cyan-200 border border-cyan-500/35">
                              <Package className="w-3 h-3" /> Main Item
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-xs text-slate-400 font-bold mt-1">{item.code}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white">{item.name}</div>
                        {isSpecial && (item as any).parentItemName && (
                          <div className="text-xs text-slate-400">
                            Parent Main Item: <strong className="text-cyan-200">{(item as any).parentItemName}</strong>
                          </div>
                        )}
                        {isSpecial && (item as any).specification && (
                          <div className="text-[11px] text-amber-300 font-mono mt-0.5">
                            Spec: {(item as any).specification}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-400">
                        {(item as any).deletedAt || 'Recently Deleted'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-300">
                        ৳{Number(('baseRate' in item ? item.baseRate : (item as any).rate) || 0).toFixed(2)} / {item.unit || 'Coils'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => onRestoreItem(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-emerald-200 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/35 rounded-md transition-colors shadow-2xs cursor-pointer"
                            title="Restore item back to inventory directory"
                          >
                            <RotateCcw className="w-3 h-3" /> Restore
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmTarget({ id: item.id, name: item.name })}
                            className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 rounded transition-colors cursor-pointer"
                            title="Permanently Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* In-app Single Item Permanent Delete Confirmation Modal */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-md w-full p-6 space-y-4 border border-rose-500/35 text-white animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-3 bg-rose-500/15 rounded-xl border border-rose-500/30">
                <Trash2 className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">Permanently Delete Item?</h3>
                <p className="text-xs text-slate-300">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed">
              Are you sure you want to permanently destroy item <strong className="text-white">"{deleteConfirmTarget.name}"</strong>? It will be removed completely from inventory records and trash.
            </p>
            <div className="flex justify-end space-x-2 pt-3 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-200 bg-[#081b28] border border-cyan-500/30 hover:bg-[#0e2a3d] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onPermanentDelete(deleteConfirmTarget.id);
                  setDeleteConfirmTarget(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-app Empty Trash Confirmation Modal */}
      {showEmptyConfirm && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-md w-full p-6 space-y-4 border border-rose-500/35 text-white animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-3 bg-rose-500/15 rounded-xl border border-rose-500/30">
                <AlertTriangle className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">Empty Item Trash Bin?</h3>
                <p className="text-xs text-slate-300">Purge all archived items</p>
              </div>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed">
              Are you sure you want to permanently delete all <strong className="text-white">{trashItems.length}</strong> archived item(s)? This will permanently clear all trashed items and cannot be recovered.
            </p>
            <div className="flex justify-end space-x-2 pt-3 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setShowEmptyConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-200 bg-[#081b28] border border-cyan-500/30 hover:bg-[#0e2a3d] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onEmptyTrash();
                  setShowEmptyConfirm(false);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                Empty Entire Trash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
