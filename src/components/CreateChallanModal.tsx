import React, { useState, useMemo, useEffect } from 'react';
import { useChallan } from '../context/ChallanContext';
import { CatalogItem, ChallanItem } from '../types';
import { matchesFlexibleSearch, groupItemsByCategoryOrder } from '../utils/searchHelper';
import { getAllCategories } from '../utils/categoryHelper';
import { DateInputWithPicker } from './DateInputWithPicker';
import {
  X,
  Plus,
  Trash2,
  Search,
  RotateCcw,
  Package,
  Layers,
  Sparkles,
  Truck,
  Building,
  Calendar,
  CheckCircle2,
} from 'lucide-react';

interface CreateChallanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateChallanModal: React.FC<CreateChallanModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { catalogItems, createChallan, generateBillFromChallan } = useChallan();

  const today = new Date().toISOString().split('T')[0];
  const [challanNo, setChallanNo] = useState(`CH-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
  const [date, setDate] = useState(today);
  const [clientName, setClientName] = useState('');
  const [clientContact, setClientContact] = useState('');
  const [clientGstOrTaxId, setClientGstOrTaxId] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [driverName, setDriverName] = useState('');
  const [purchaseOrderNo, setPurchaseOrderNo] = useState('');
  const [notes, setNotes] = useState('');

  // Items added to this challan
  const [selectedItems, setSelectedItems] = useState<ChallanItem[]>([]);

  // Item Picker Search & Category state
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Reset Item Search (as strictly requested: "reset every item search list and on list not show item code.")
  const handleResetItemSearch = () => {
    setItemSearchQuery('');
    setSelectedCategory('ALL');
  };

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

  // Filtered Catalog Items (NO ITEM CODES SHOWN!), ordered by configured category list order
  const filteredCatalog = useMemo(() => {
    const matched = catalogItems.filter(item => {
      const matchesCategory = selectedCategory === 'ALL' || item.category === selectedCategory;
      const matchesSearch =
        itemSearchQuery.trim() === '' ||
        matchesFlexibleSearch(`${item.name} ${item.specifications || ''} ${item.category || ''}`, itemSearchQuery);

      return matchesCategory && matchesSearch;
    });
    return groupItemsByCategoryOrder(matched, categoryOrder).orderedItems;
  }, [catalogItems, itemSearchQuery, selectedCategory, categoryOrder]);

  const handleAddItemFromCatalog = (catItem: CatalogItem) => {
    // Check if already in list
    const existingIndex = selectedItems.findIndex(i => i.name === catItem.name);
    if (existingIndex >= 0) {
      // Increment qty
      setSelectedItems(prev =>
        prev.map((item, idx) =>
          idx === existingIndex
            ? { ...item, dispatchedQty: item.dispatchedQty + 10 }
            : item
        )
      );
    } else {
      const newItem: ChallanItem = {
        id: 'ci-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 5),
        itemId: catItem.id,
        name: catItem.name,
        specifications: catItem.specifications,
        unit: catItem.unit,
        dispatchedQty: catItem.unit === 'Kg' ? 50 : 1000,
        billedQty: 0,
        unitPrice: catItem.unitPrice,
        notes: '',
      };
      setSelectedItems(prev => [...prev, newItem]);
    }
  };

  const handleRemoveItem = (id: string) => {
    setSelectedItems(prev => prev.filter(i => i.id !== id));
  };

  const handleUpdateItem = (id: string, field: keyof ChallanItem, value: any) => {
    setSelectedItems(prev =>
      prev.map(item => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const totalCalculatedValue = selectedItems.reduce(
    (acc, it) => acc + (it.dispatchedQty || 0) * (it.unitPrice || 0),
    0
  );

  const handleSaveChallan = (andGenerateBill: boolean = false) => {
    if (!clientName.trim()) {
      alert('Please enter the client / consignee name.');
      return;
    }
    if (selectedItems.length === 0) {
      alert('Please add at least one poly item to the delivery challan.');
      return;
    }

    const created = createChallan({
      challanNo,
      date,
      clientName: clientName.trim(),
      clientContact: clientContact.trim(),
      clientGstOrTaxId: clientGstOrTaxId.trim() || undefined,
      deliveryAddress: deliveryAddress.trim() || 'Factory Dispatch / Consignee Location',
      vehicleNo: vehicleNo.trim() || 'Factory Van / Direct',
      driverName: driverName.trim() || undefined,
      purchaseOrderNo: purchaseOrderNo.trim() || undefined,
      notes: notes.trim() || undefined,
      items: selectedItems,
    });

    if (andGenerateBill) {
      // Instantly generate full bill -> locks challan and keeps/updates count to (0)
      generateBillFromChallan(created.id);
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
      <div
        id="create-challan-modal"
        className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] w-full max-w-5xl overflow-hidden border border-cyan-400/35 flex flex-col max-h-[92vh] text-white"
      >
        {/* Header */}
        <div className="px-6 py-4 cyber-glass-header border-b border-cyan-500/25 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/20 border border-cyan-400/35 text-cyan-300 flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight text-white">Create Delivery Challan</h3>
              <p className="text-xs text-slate-400">
                Issue packaging dispatch note and manage subsequent billing lifecycle
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/25 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs text-slate-200">
          
          {/* Section 1: Basic Dispatch Information */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 cyber-glass-subcard p-4 rounded-xl border border-cyan-500/25">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                Challan Number *
              </label>
              <input
                type="text"
                value={challanNo}
                onChange={e => setChallanNo(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#061520] border border-cyan-500/30 rounded-lg font-mono font-semibold text-white focus:ring-2 focus:ring-cyan-400/30 focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                Dispatch Date (dd.mm.yy) *
              </label>
              <DateInputWithPicker
                value={date}
                onChange={setDate}
                valueFormat="iso"
                theme="dark"
                required
                inputClassName="px-3 py-1.5 text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                Vehicle / Transport No
              </label>
              <input
                type="text"
                placeholder="e.g. KA-04-E-8821"
                value={vehicleNo}
                onChange={e => setVehicleNo(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#061520] border border-cyan-500/30 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400/30 focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                Purchase Order (PO) Ref
              </label>
              <input
                type="text"
                placeholder="e.g. PO-88910"
                value={purchaseOrderNo}
                onChange={e => setPurchaseOrderNo(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#061520] border border-cyan-500/30 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400/30 focus:border-cyan-400"
              />
            </div>
          </div>

          {/* Section 2: Consignee / Client Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 cyber-glass-subcard p-4 rounded-xl border border-cyan-500/25">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                Client / Company Name *
              </label>
              <input
                type="text"
                placeholder="e.g. Sunrise Packaging & Exports"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#061520] border border-cyan-500/30 rounded-lg font-semibold text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400/30 focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                Contact Person & Phone
              </label>
              <input
                type="text"
                placeholder="+91 98450 00000"
                value={clientContact}
                onChange={e => setClientContact(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#061520] border border-cyan-500/30 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400/30 focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                Delivery Destination / Address
              </label>
              <input
                type="text"
                placeholder="Factory address / Warehouse bay"
                value={deliveryAddress}
                onChange={e => setDeliveryAddress(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#061520] border border-cyan-500/30 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400/30 focus:border-cyan-400"
              />
            </div>
          </div>

          {/* Section 3: Poly Item Catalog Picker with Search & Instant Reset (NO ITEM CODES SHOWN) */}
          <div className="border border-cyan-500/25 rounded-xl p-4 cyber-glass-subcard space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-cyan-300" />
                <h4 className="text-xs font-bold text-cyan-200 uppercase tracking-wider">
                  Select Poly / Packaging Items from Catalog
                </h4>
              </div>

              {/* Item Search Bar with RESET BUTTON */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-72">
                  <Search className="w-3.5 h-3.5 text-cyan-300/70 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="catalog-item-search-input"
                    type="text"
                    value={itemSearchQuery}
                    onChange={e => setItemSearchQuery(e.target.value)}
                    placeholder="Search poly items, specs, material..."
                    className="w-full pl-8 pr-7 py-1 text-xs bg-[#061520] border border-cyan-500/30 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/30 focus:border-cyan-400"
                  />
                  {itemSearchQuery && (
                    <button
                      onClick={() => setItemSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Reset Search Button */}
                {(itemSearchQuery || selectedCategory !== 'ALL') && (
                  <button
                    id="reset-item-search-btn"
                    onClick={handleResetItemSearch}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 rounded-lg transition-colors shrink-0 cursor-pointer"
                    title="Reset item search & filters"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {['ALL', 'HDPE', 'LDPE', 'BOPP', 'PP', 'Biodegradable', 'Stretch & Shrink'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-[#0e2d42] text-cyan-200 border border-cyan-400/60'
                      : 'bg-[#081b28] text-slate-300 border border-cyan-500/25 hover:bg-[#0e2a3d]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Catalog Items Grid / List (strictly NO item codes shown) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto p-1">
              {filteredCatalog.map(item => (
                <div
                  key={item.id}
                  className="bg-[#061520]/90 p-3 rounded-lg border border-cyan-500/25 hover:border-cyan-400/60 hover:shadow-2xs transition-all flex flex-col justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="flex items-start justify-between gap-1.5">
                      {/* Strictly Product Name - No Item Code */}
                      <span className="font-bold text-white leading-tight">
                        {item.name}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-200 border border-cyan-400/30 shrink-0">
                        {item.category}
                      </span>
                    </div>
                    {/* Specifications */}
                    <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                      {item.specifications}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-cyan-500/15">
                    <span className="font-mono font-bold text-emerald-300 text-xs">
                      ₹{item.unitPrice} / {item.unit}
                    </span>
                    <button
                      onClick={() => handleAddItemFromCatalog(item)}
                      className="px-2.5 py-1 text-[11px] font-black text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Selected Line Items in Challan (strictly NO item codes) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-cyan-200 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-cyan-300" />
                <span>Line Items to Dispatch ({selectedItems.length})</span>
              </h4>
              <span className="text-[11px] text-slate-400">
                Edit dispatched quantities and rates
              </span>
            </div>

            {selectedItems.length === 0 ? (
              <div className="p-8 border-2 border-dashed border-cyan-500/25 rounded-xl text-center text-slate-400 space-y-1 bg-[#061520]/50">
                <p className="text-xs font-medium text-slate-300">No items added yet.</p>
                <p className="text-[11px]">Click "+ Add" on items from the catalog above to populate this challan.</p>
              </div>
            ) : (
              <div className="border border-cyan-500/25 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#0c2638] border-b border-cyan-500/30 text-[11px] font-bold text-cyan-200 uppercase">
                      <th className="py-2.5 px-3">Item Name & Specs</th>
                      <th className="py-2.5 px-3 w-28 text-right">Dispatched Qty</th>
                      <th className="py-2.5 px-3 w-20">Unit</th>
                      <th className="py-2.5 px-3 w-28 text-right">Rate (₹)</th>
                      <th className="py-2.5 px-3 w-28 text-right">Line Total</th>
                      <th className="py-2.5 px-3 w-12 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-xs">
                    {selectedItems.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-cyan-500/[0.06]">
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-white block">
                            {item.name}
                          </span>
                          <span className="text-[11px] text-slate-400 block">
                            {item.specifications}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            min={1}
                            value={item.dispatchedQty}
                            onChange={e =>
                              handleUpdateItem(
                                item.id,
                                'dispatchedQty',
                                Math.max(1, parseFloat(e.target.value) || 0)
                              )
                            }
                            className="w-full text-right px-2 py-1 bg-[#061520] border border-cyan-500/30 rounded font-semibold text-white"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 font-medium">
                          {item.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            step="0.1"
                            min={0}
                            value={item.unitPrice}
                            onChange={e =>
                              handleUpdateItem(
                                item.id,
                                'unitPrice',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-full text-right px-2 py-1 bg-[#061520] border border-cyan-500/30 rounded font-mono text-white"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-300 font-mono">
                          ₹{(item.dispatchedQty * item.unitPrice).toLocaleString('en-IN', {
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => handleRemoveItem(item.id)}
                            className="p-1 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Remove item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#0c2638] border-t border-cyan-500/30 font-bold text-white">
                      <td colSpan={4} className="py-3 px-3 text-right uppercase text-xs text-cyan-200">
                        Total Value:
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-sm text-emerald-300">
                        ₹{totalCalculatedValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Section 5: Gate Notes */}
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
              Dispatch Instructions / Gate Pass Notes
            </label>
            <input
              type="text"
              placeholder="e.g. Fragile poly rolls, keep away from direct heat, check seal intact on receipt."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-[#061520] border border-cyan-500/30 rounded-lg text-white placeholder-slate-400"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-[#071824]/90 border-t border-cyan-500/20 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            * Items will be recorded in the Delivery Challan and can be billed at any time.
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-200 bg-[#081b28] border border-cyan-500/25 hover:bg-[#0e2a3d] rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>

            {/* Save as Pending Challan (Badge shows +1) */}
            <button
              id="save-pending-challan-btn"
              onClick={() => handleSaveChallan(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-cyan-200 bg-[#0e2d42] border border-cyan-400/50 hover:bg-[#143d59] rounded-lg transition-colors cursor-pointer"
            >
              Save as Unbilled Challan
            </button>

            {/* Save & Generate Full Bill Directly (Badge count stays (0), challan is locked) */}
            <button
              id="save-and-full-bill-btn"
              onClick={() => handleSaveChallan(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-black text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Save & Full Bill (Locked)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
