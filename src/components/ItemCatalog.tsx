import React, { useState, useMemo, useEffect } from 'react';
import { useChallan } from '../context/ChallanContext';
import { CatalogItem } from '../types';
import { matchesFlexibleSearch, groupItemsByCategoryOrder } from '../utils/searchHelper';
import { getAllCategories } from '../utils/categoryHelper';
import {
  Package,
  Search,
  RotateCcw,
  Plus,
  Trash2,
  Layers,
  Filter,
  CheckCircle2,
  X,
} from 'lucide-react';

export const ItemCatalog: React.FC = () => {
  const { catalogItems, createCatalogItem, deleteCatalogItem } = useChallan();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // New Item Form State (Strictly NO item code input)
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<CatalogItem['category']>('HDPE');
  const [newItemSpecs, setNewItemSpecs] = useState('');
  const [newItemUnit, setNewItemUnit] = useState<CatalogItem['unit']>('Kg');
  const [newItemPrice, setNewItemPrice] = useState(150);
  const [newItemStock, setNewItemStock] = useState(500);
  const [newItemDescription, setNewItemDescription] = useState('');

  // Reset Every Item Search List (as requested)
  const handleResetSearch = () => {
    setSearchQuery('');
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

  const filteredItems = useMemo(() => {
    const matched = catalogItems.filter(item => {
      const matchesCategory = selectedCategory === 'ALL' || item.category === selectedCategory;
      const matchesSearch =
        searchQuery.trim() === '' ||
        matchesFlexibleSearch(`${item.name} ${item.specifications || ''} ${item.category || ''}`, searchQuery);

      return matchesCategory && matchesSearch;
    });
    return groupItemsByCategoryOrder(matched, categoryOrder).orderedItems;
  }, [catalogItems, searchQuery, selectedCategory, categoryOrder]);

  const handleCreateItemSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    createCatalogItem({
      name: newItemName.trim(),
      category: newItemCategory,
      specifications: newItemSpecs.trim() || 'Standard Industrial Grade',
      unit: newItemUnit,
      unitPrice: Number(newItemPrice) || 0,
      taxRate: 18,
      stockAvailable: Number(newItemStock) || 0,
      description: newItemDescription.trim(),
    });

    // Reset and close
    setNewItemName('');
    setNewItemSpecs('');
    setNewItemDescription('');
    setIsCreateModalOpen(false);
  };

  return (
    <div id="poly-item-catalog-section" className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-xs font-semibold uppercase tracking-wider">
              Packaging & Polythene Materials
            </span>
            <h2 className="text-lg font-bold">Poly Products & Catalog Directory</h2>
            <p className="text-xs text-slate-300">
              Manage standard poly bags, rolls, shrink films, mailers, and custom packaging products.
            </p>
          </div>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add New Product</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar with RESET BUTTON (as strictly requested) */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          
          {/* Search Bar */}
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="poly-catalog-search-input"
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search poly items, specs, material..."
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

          {/* Category Filter Pills & Reset Button */}
          <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto no-scrollbar">
            {['ALL', 'HDPE', 'LDPE', 'BOPP', 'PP', 'Biodegradable', 'Stretch & Shrink'].map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  selectedCategory === cat
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}

            {/* Reset Search List Button */}
            {(searchQuery || selectedCategory !== 'ALL') && (
              <button
                id="reset-catalog-search-btn"
                onClick={handleResetSearch}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
                title="Reset every item search filter"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Search</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Catalog Table (STRICTLY NO ITEM CODES DISPLAYED!) */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">
            Available Packaging Products ({filteredItems.length})
          </h3>
          <span className="text-xs text-slate-500">
            * Item codes hidden as per requirement
          </span>
        </div>

        {filteredItems.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <Package className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">No Poly Items Found</p>
            <button
              onClick={handleResetSearch}
              className="px-3.5 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg"
            >
              Reset Search Filter
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table id="item-catalog-table" className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Product Name & Specifications</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Standard Rate</th>
                  <th className="py-3 px-4 text-center">Unit</th>
                  <th className="py-3 px-4 text-right">Stock in Hand</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredItems.map(item => (
                  <tr key={item.id} className="bg-white hover:bg-slate-50 transition-colors">
                    
                    {/* Strictly Product Name & Specs - NO item code */}
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-900 text-sm block">
                        {item.name}
                      </span>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        {item.specifications}
                      </span>
                      {item.description && (
                        <span className="text-[10px] text-slate-400 block mt-0.5 line-clamp-1">
                          {item.description}
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {item.category}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                      ₹{item.unitPrice.toFixed(2)}
                    </td>

                    <td className="py-3.5 px-4 text-center font-medium text-slate-600">
                      {item.unit}
                    </td>

                    <td className="py-3.5 px-4 text-right font-semibold text-slate-800">
                      {item.stockAvailable.toLocaleString()} {item.unit}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => deleteCatalogItem(item.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors"
                        title="Delete product"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Product Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 animate-in fade-in duration-150">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-base font-bold">Add Poly Product</h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateItemSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Printed LDPE Zip Lock Bags (8x10)"
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Category *
                  </label>
                  <select
                    value={newItemCategory}
                    onChange={e => setNewItemCategory(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900"
                  >
                    <option value="HDPE">HDPE</option>
                    <option value="LDPE">LDPE</option>
                    <option value="BOPP">BOPP</option>
                    <option value="PP">PP</option>
                    <option value="Biodegradable">Biodegradable</option>
                    <option value="Stretch & Shrink">Stretch & Shrink</option>
                    <option value="Custom Packaging">Custom Packaging</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Standard Unit *
                  </label>
                  <select
                    value={newItemUnit}
                    onChange={e => setNewItemUnit(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900"
                  >
                    <option value="Kg">Kg</option>
                    <option value="Pcs">Pcs</option>
                    <option value="Rolls">Rolls</option>
                    <option value="Packets">Packets</option>
                    <option value="Bundles">Bundles</option>
                    <option value="Meters">Meters</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Gauge / Micron / Size Specifications
                </label>
                <input
                  type="text"
                  placeholder="e.g. 50 Micron / 200 Gauge, 2 Color Print"
                  value={newItemSpecs}
                  onChange={e => setNewItemSpecs(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Rate per Unit (₹)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={newItemPrice}
                    onChange={e => setNewItemPrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Initial Stock
                  </label>
                  <input
                    type="number"
                    value={newItemStock}
                    onChange={e => setNewItemStock(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Description / Application
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Moisture barrier for textile export packing"
                  value={newItemDescription}
                  onChange={e => setNewItemDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-xs"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
