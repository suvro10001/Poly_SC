import React, { useState } from 'react';
import { Category } from '../types';
import { PageHeaderWithActions } from './PageHeaderWithActions';
import { 
  Tags, 
  Plus, 
  Search, 
  Package, 
  Layers, 
  Edit3, 
  Trash2 
} from 'lucide-react';

interface CategoryListPageProps {
  categories: Category[];
  onAddCategory: (cat: Category) => void;
  onUpdateCategory: (cat: Category) => void;
  onDeleteCategory: (id: string) => void;
  onBack: () => void;
  onClose: () => void;
}

export const CategoryListPage: React.FC<CategoryListPageProps> = ({
  categories,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onBack,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<{ id: string; name: string } | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [colorTag, setColorTag] = useState('#0284c7');

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !code) return;

    const newCat: Category = {
      id: `cat-${Date.now()}`,
      name,
      code: code.toUpperCase(),
      description,
      itemCount: 0,
      colorTag
    };

    onAddCategory(newCat);
    setIsModalOpen(false);
    // Reset
    setName('');
    setCode('');
    setDescription('');
  };

  const filtered = categories.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div id="category-list-page-wrapper" className="space-y-6">
      {/* Required: Right side Back and Close buttons */}
      <PageHeaderWithActions
        idPrefix="category-list-page"
        title="Category Directory & Classification"
        subtitle="Manage product packaging classifications, polymer material types, and catalog groupings"
        badge={`${categories.length} Categories`}
        badgeColor="bg-sky-100 text-sky-900 border-sky-300"
        icon={Tags}
        onBack={onBack}
        onClose={onClose}
        extraActions={
          <button
            type="button"
            id="btn-open-category-modal"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Category</span>
          </button>
        }
      />

      {/* Grid of Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(cat => (
          <div 
            key={cat.id} 
            className="cyber-glass-subcard rounded-xl p-5 hover:border-cyan-400/50 transition-all flex flex-col justify-between text-white"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span 
                  className="px-2.5 py-1 rounded-md text-xs font-bold font-mono text-white shadow-2xs"
                  style={{ backgroundColor: cat.colorTag }}
                >
                  {cat.code}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-200 border border-cyan-400/30">
                  {cat.itemCount} Items
                </span>
              </div>

              <h3 className="text-base font-bold text-white mb-1">{cat.name}</h3>
              <p className="text-xs text-slate-300 line-clamp-2">{cat.description}</p>
            </div>

            <div className="mt-4 pt-3 border-t border-cyan-500/20 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Polymer Classification</span>
              <button
                type="button"
                onClick={() => setCategoryToDelete({ id: cat.id, name: cat.name })}
                className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors cursor-pointer"
                title="Delete Category"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030d14]/80 p-4 backdrop-blur-sm">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl max-w-md w-full p-6 shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 text-white animate-in fade-in zoom-in-95">
            <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Tags className="w-5 h-5 text-cyan-300" />
              Add Polymer Category
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Create a new category to group packaging products and special variations.
            </p>

            <form onSubmit={handleSaveCategory} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-cyan-200/90 mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Biodegradable Cornstarch Bags"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full text-sm px-3 py-2 bg-[#061520] text-white placeholder-slate-400 border border-cyan-500/30 rounded-lg focus:ring-2 focus:ring-cyan-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-cyan-200/90 mb-1">Category Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CAT-BIO"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    className="w-full text-sm font-mono px-3 py-2 bg-[#061520] text-white placeholder-slate-400 border border-cyan-500/30 rounded-lg focus:ring-2 focus:ring-cyan-400 uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-cyan-200/90 mb-1">Badge Color</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      value={colorTag}
                      onChange={e => setColorTag(e.target.value)}
                      className="w-8 h-8 rounded border border-cyan-500/30 cursor-pointer bg-[#061520]"
                    />
                    <span className="text-xs font-mono text-cyan-200">{colorTag}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-cyan-200/90 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Polymer specs, resin grade, typical industry uses..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-[#061520] text-white placeholder-slate-400 border border-cyan-500/30 rounded-lg focus:ring-2 focus:ring-cyan-400 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-cyan-500/20">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-black text-slate-950 bg-cyan-500 hover:bg-cyan-400 rounded-lg shadow-xs cursor-pointer"
                >
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Delete Confirmation Modal */}
      {categoryToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030d14]/80 p-4 backdrop-blur-sm">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl max-w-sm w-full p-5 shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-rose-400/35 text-white">
            <div className="flex items-center space-x-3 text-rose-400 mb-3">
              <div className="p-2 bg-rose-500/15 border border-rose-400/30 rounded-lg">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <h3 className="text-base font-bold text-white">Delete Category</h3>
            </div>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Are you sure you want to delete category <span className="font-bold text-white">"{categoryToDelete.name}"</span>?
            </p>
            <div className="flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setCategoryToDelete(null)}
                className="px-3 py-1.5 text-xs font-semibold bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteCategory(categoryToDelete.id);
                  setCategoryToDelete(null);
                }}
                className="px-4 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors cursor-pointer shadow-xs"
              >
                Delete Category
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
