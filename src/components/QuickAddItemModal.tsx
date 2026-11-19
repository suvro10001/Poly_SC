import React, { useState, useEffect } from 'react';
import { Item } from '../types';
import { isBobinItem, generateSpecialItemDisplayName, calculateSpecialItemRate } from '../utils/stockHelper';
import { Plus, X, Tag, Boxes, Sparkles, Check, DollarSign, Layers, Hash } from 'lucide-react';

interface QuickAddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: {
    name?: string;
    rate?: number;
    unit?: string;
    sizeSpec?: string;
    category?: string;
    isSpecialItem?: boolean;
  };
  existingItems?: Item[];
  onItemCreated?: (createdItem: Item) => void;
  onSave?: (createdItem: Item) => void;
  title?: string;
  contextHint?: string;
}

const standardCategories = [
  'Single Core Wires',
  'Multi Core Flexible Wires',
  'Flat Cables',
  'Power Cables',
  'Drop Wire / Telecom',
  'Special Products',
  'Others'
];

export const QuickAddItemModal: React.FC<QuickAddItemModalProps> = ({
  isOpen,
  onClose,
  initialData,
  existingItems = [],
  onItemCreated,
  onSave,
  title = 'Add New Item to Master Catalog',
  contextHint
}) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [sizeSpec, setSizeSpec] = useState('');
  const [unit, setUnit] = useState('Coils');
  const [rate, setRate] = useState<number>(0);
  const [category, setCategory] = useState('Single Core Wires');
  const [openingStock, setOpeningStock] = useState<number>(100);
  const [isSpecialItem, setIsSpecialItem] = useState(false);
  const [selectedBaseItemId, setSelectedBaseItemId] = useState<string>('');
  const [stockMultiplier, setStockMultiplier] = useState<number>(5);
  const [errorMsg, setErrorMsg] = useState('');

  // Auto populate on open
  useEffect(() => {
    if (!isOpen) return;

    const initialName = initialData?.name || '';
    const initialRate = initialData?.rate || 0;
    const isSpecialDetected = initialData?.isSpecialItem || isBobinItem(initialName);
    const initialUnit = initialData?.unit || (isSpecialDetected ? 'Bobin' : 'Coils');

    setName(initialName);
    setRate(initialRate);
    setUnit(initialUnit);
    setSizeSpec(initialData?.sizeSpec || '');
    setCategory(initialData?.category || 'Single Core Wires');
    setIsSpecialItem(Boolean(isSpecialDetected));
    setStockMultiplier(5);
    setOpeningStock(100);
    setErrorMsg('');

    // Generate unique item code
    const nextCodeNum = existingItems.length + 101;
    setCode(`PC-${nextCodeNum}`);

    // Auto-detect base item if special item
    if (isSpecialDetected) {
      const matchedBase = existingItems.find(
        (it) => !it.isSpecialItem && (
          (initialName && it.name.toLowerCase().includes(initialName.toLowerCase().slice(0, 8))) ||
          it.name.includes('1.5') || it.name.includes('1 X 1.5') || it.name.includes('1.0') || it.name.includes('1 X 1.0')
        )
      );
      if (matchedBase) {
        setSelectedBaseItemId(matchedBase.id);
        const generatedName = generateSpecialItemDisplayName(matchedBase.name, matchedBase.category);
        if (!initialName || initialName === matchedBase.name) {
          setName(generatedName);
        }
        if (!initialRate) {
          setRate(calculateSpecialItemRate(matchedBase.rate, 5));
        }
      }
    }
  }, [isOpen, initialData, existingItems]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Item name is required');
      return;
    }

    // Check duplicate name or code
    const duplicate = existingItems.find(
      (it) => it.name.trim().toLowerCase() === name.trim().toLowerCase()
    );
    if (duplicate) {
      setErrorMsg(`Item with this name already exists in catalog (Code: ${duplicate.code}, Rate: ৳${duplicate.rate}).`);
      return;
    }

    let baseItem: Item | undefined;
    if (isSpecialItem && selectedBaseItemId) {
      baseItem = existingItems.find((i) => i.id === selectedBaseItemId);
    }

    const newItem: Item = {
      id: `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      code: code.trim() || `PC-${existingItems.length + 101}`,
      name: name.trim(),
      sizeSpec: sizeSpec.trim() || undefined,
      unit: isSpecialItem ? (unit || 'Bobin') : (unit || 'Coils'),
      rate: Math.round(Number(rate) || 0),
      category: category || 'Single Core Wires',
      openingStock: Number(openingStock) || 0,
      isSpecialItem: Boolean(isSpecialItem),
      baseItemId: baseItem ? baseItem.id : undefined,
      baseItemCode: baseItem ? baseItem.code : undefined,
      stockMultiplier: isSpecialItem ? (stockMultiplier || 5) : undefined,
      isActive: true
    };

    (onSave || onItemCreated)?.(newItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#030d14]/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh] text-white">
        {/* Modal Header */}
        <div className="bg-[#0c2638]/90 border-b border-cyan-500/25 text-white p-4.5 px-6 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-cyan-500/15 border border-cyan-400/30 rounded-xl">
              <Plus className="w-5 h-5 text-cyan-300" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight text-white">{title}</h3>
              <p className="text-xs text-cyan-200/80 font-medium">
                {contextHint || 'Save new item to catalog & seamlessly resume your current work where you left off'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-cyan-500/15 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-500/15 border border-rose-400/35 rounded-xl text-rose-200 text-xs font-semibold flex items-center space-x-2">
              <span className="font-bold">Error:</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Item Name */}
          <div>
            <label className="block text-xs font-bold text-cyan-200 mb-1">
              Items Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrorMsg('');
                if (isBobinItem(e.target.value)) {
                  setIsSpecialItem(true);
                  if (unit === 'Coils') setUnit('Bobin');
                }
              }}
              placeholder="e.g. 1 X 1.0 Rm 3-w (3/0.65) or 1.5 Rm (7/0.53)"
              className="w-full px-3.5 py-2 text-sm bg-[#061520] border border-cyan-500/30 rounded-xl font-semibold text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 transition-all"
            />
          </div>

          {/* Category Selector */}
          <div>
            <label className="block text-xs font-bold text-cyan-200 mb-1">Category</label>
            <div className="relative">
              <Tag className="w-4 h-4 absolute left-3 top-2.5 text-cyan-400" />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 text-xs font-semibold bg-[#061520] border border-cyan-500/30 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 cursor-pointer"
              >
                {standardCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Rate, Unit & Opening Stock Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-cyan-200 mb-1">
                Rate (৳ / Price) <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-bold text-cyan-300">৳</span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  required
                  value={rate || ''}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setRate(isNaN(val) ? 0 : Math.round(val));
                  }}
                  placeholder="0"
                  className="w-full pl-7 pr-3 py-2 text-xs font-bold font-mono bg-[#061520] border border-cyan-500/30 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-cyan-200 mb-1">Unit</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold bg-[#061520] border border-cyan-500/30 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 cursor-pointer"
              >
                <option value="Coils">Coils (Standard)</option>
                <option value="Bobin">Bobin (500m / Special)</option>
                <option value="Meter">Meter (Mtr)</option>
                <option value="Pc">Piece (Pc)</option>
                <option value="Pkt">Packet (Pkt)</option>
                <option value="Box">Box</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-cyan-200 mb-1">Opening Stock</label>
              <input
                type="number"
                value={openingStock}
                onChange={(e) => setOpeningStock(parseFloat(e.target.value) || 0)}
                placeholder="100"
                className="w-full px-3 py-2 text-xs font-bold font-mono bg-[#061520] border border-cyan-500/30 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              />
            </div>
          </div>

          {/* Size Specification */}
          <div>
            <label className="block text-xs font-bold text-cyan-200 mb-1">Size Specification (Optional)</label>
            <input
              type="text"
              value={sizeSpec}
              onChange={(e) => setSizeSpec(e.target.value)}
              placeholder="e.g. 3/0.65 mm, 7/0.53 mm, 500m Length"
              className="w-full px-3.5 py-2 text-xs bg-[#061520] border border-cyan-500/30 rounded-xl font-medium text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
          </div>

          {/* Special Bobin / Multiplier Option */}
          <div className="p-3.5 bg-amber-500/10 border border-amber-400/30 rounded-xl space-y-3">
            <label className="flex items-center space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isSpecialItem}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIsSpecialItem(checked);
                  if (checked) {
                    if (unit === 'Coils') setUnit('Bobin');
                    // If no base item selected, pick default base item
                    if (!selectedBaseItemId) {
                      const firstBase = existingItems.find((i) => !i.isSpecialItem && (i.name.includes('1.5') || i.name.includes('1.0'))) || existingItems.find((i) => !i.isSpecialItem);
                      if (firstBase) {
                        setSelectedBaseItemId(firstBase.id);
                        setName(generateSpecialItemDisplayName(firstBase.name, firstBase.category));
                        setRate(calculateSpecialItemRate(firstBase.rate, stockMultiplier || 5));
                        setCategory(firstBase.category);
                      }
                    } else {
                      const bItem = existingItems.find((i) => i.id === selectedBaseItemId);
                      if (bItem) {
                        setName(generateSpecialItemDisplayName(bItem.name, bItem.category));
                        setRate(calculateSpecialItemRate(bItem.rate, stockMultiplier || 5));
                      }
                    }
                  }
                }}
                className="w-4 h-4 text-amber-400 rounded border-amber-400/50 focus:ring-amber-400"
              />
              <span className="text-xs font-bold text-amber-200">
                Special Variant Item (e.g. 500m Bobin / Meter Length Item)
              </span>
            </label>

            {isSpecialItem && (
              <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs border-t border-amber-400/20">
                <div>
                  <label className="block font-bold text-amber-200 mb-1">Linked Base Item (Stock Deducted)</label>
                  <select
                    value={selectedBaseItemId}
                    onChange={(e) => {
                      const newId = e.target.value;
                      setSelectedBaseItemId(newId);
                      const bItem = existingItems.find((i) => i.id === newId);
                      if (bItem) {
                        setName(generateSpecialItemDisplayName(bItem.name, bItem.category));
                        setRate(calculateSpecialItemRate(bItem.rate, stockMultiplier || 5));
                        setCategory(bItem.category);
                        setSizeSpec(`${bItem.sizeSpec || bItem.name} (500 m)`);
                      }
                    }}
                    className="w-full p-1.5 bg-[#061520] border border-amber-400/35 rounded-lg text-xs font-semibold text-white"
                  >
                    <option value="">-- No Base Item Linked --</option>
                    {Array.from(new Set(existingItems.filter((i) => !i.isSpecialItem).map((i) => i.category || 'Standard Wires'))).map((catName) => {
                      const catItems = existingItems.filter((i) => !i.isSpecialItem && (i.category || 'Standard Wires') === catName);
                      if (catItems.length === 0) return null;
                      return (
                        <optgroup key={catName} label={`📂 ${catName}`}>
                          {catItems.map((bi) => (
                            <option key={bi.id} value={bi.id}>
                              {bi.name} ({bi.code}) - ৳{bi.rate}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-amber-200 mb-1">Stock Multiplier (Coils per Bobin)</label>
                  <input
                    type="number"
                    value={stockMultiplier}
                    onChange={(e) => {
                      const mult = parseInt(e.target.value, 10) || 5;
                      setStockMultiplier(mult);
                      const bItem = existingItems.find((i) => i.id === selectedBaseItemId);
                      if (bItem) {
                        setRate(calculateSpecialItemRate(bItem.rate, mult));
                      }
                    }}
                    placeholder="5"
                    className="w-full p-1.5 bg-[#061520] border border-amber-400/35 rounded-lg text-xs font-bold font-mono text-white"
                  />
                  <span className="text-[10px] text-amber-300 font-medium">1 Bobin = 500m = 5 Coils (Auto Calculated)</span>
                </div>
              </div>
            )}
          </div>

          {/* Modal Actions */}
          <div className="pt-3 border-t border-cyan-500/20 flex items-center justify-end space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-200 hover:text-white bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-black text-slate-950 bg-cyan-500 hover:bg-cyan-400 rounded-xl shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Save & Resume Work</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
