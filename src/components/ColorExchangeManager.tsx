import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Party,
  Item,
  CompanyDetails,
  ColorExchangeChallan,
  ColorExchangeLine,
  ColorBreakdown,
  FactoryImportChallan,
  StoredBill
} from '../types';
import { DateInputWithPicker } from './DateInputWithPicker';
import {
  ArrowLeftRight,
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Printer,
  X,
  Building2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  RotateCcw,
  Search,
  Check,
  ChevronDown
} from 'lucide-react';
import { formatDateDDMMYY } from '../utils/dateUtils';
import { isColorApplicableCable, getAllCategories } from '../utils/categoryHelper';
import { calculateItemColorStockLedger, isBobinItem } from '../utils/stockHelper';
import { matchesFlexibleSearch, groupItemsByCategoryOrder } from '../utils/searchHelper';

/**
 * Strips special length, coil tags, and bobin labels to extract the core cable signature.
 */
export function getCoreCableSignature(name?: string | null): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\s*\(\s*500\s*m\s*length\s*\)[^)]*/gi, '')
    .replace(/\s*\(\s*500\s*m\s*\)/gi, '')
    .replace(/\s*-\s*\d+\s*coils?/gi, '')
    .replace(/\s*\(mtr\.?\)/gi, '')
    .replace(/\s*\(meters?\.?\)/gi, '')
    .replace(/\bbobin\b/gi, '')
    .replace(/[^a-z0-9.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if two items represent:
 * 1. The exact same item (colour exchange or unit exchange)
 * 2. That item and that item's Bobin variant (e.g. 500m length Bobin <-> Standard coil item)
 */
export function checkItemExchangeValidity(
  inItemId: string | undefined,
  inItemName: string | undefined,
  outItemId: string | undefined,
  outItemName: string | undefined,
  allItems: Item[] = []
): { isValid: boolean; isBobinExchange: boolean; isSameItem: boolean; reason?: string } {
  const inName = (inItemName || '').trim();
  const outName = (outItemName || '').trim();
  const inId = (inItemId || '').trim();
  const outId = (outItemId || '').trim();

  if (!inName || !outName) {
    return { isValid: false, isBobinExchange: false, isSameItem: false, reason: 'Please select both Input and Output items' };
  }

  // 1. Exact same item (by ID or exact name)
  if ((inId && outId && inId === outId) || inName.toLowerCase() === outName.toLowerCase()) {
    return { isValid: true, isBobinExchange: false, isSameItem: true };
  }

  // Resolve item objects from catalog
  const inItemObj = allItems.find((i) => (inId && i.id === inId) || i.name.toLowerCase() === inName.toLowerCase());
  const outItemObj = allItems.find((i) => (outId && i.id === outId) || i.name.toLowerCase() === outName.toLowerCase());

  // 2. Direct baseItemId link (one is base of the other, or both share baseItemId)
  if (inItemObj && outItemObj) {
    if (outItemObj.baseItemId && (outItemObj.baseItemId === inItemObj.id || outItemObj.baseItemId === inItemObj.baseItemId)) {
      return { isValid: true, isBobinExchange: true, isSameItem: false };
    }
    if (inItemObj.baseItemId && (inItemObj.baseItemId === outItemObj.id || inItemObj.baseItemId === outItemObj.baseItemId)) {
      return { isValid: true, isBobinExchange: true, isSameItem: false };
    }
    if (outItemObj.baseItemCode && inItemObj.code && outItemObj.baseItemCode.toLowerCase() === inItemObj.code.toLowerCase()) {
      return { isValid: true, isBobinExchange: true, isSameItem: false };
    }
    if (inItemObj.baseItemCode && outItemObj.code && inItemObj.baseItemCode.toLowerCase() === outItemObj.code.toLowerCase()) {
      return { isValid: true, isBobinExchange: true, isSameItem: false };
    }
  } else {
    if (outItemObj?.baseItemId && inId && outItemObj.baseItemId === inId) {
      return { isValid: true, isBobinExchange: true, isSameItem: false };
    }
    if (inItemObj?.baseItemId && outId && inItemObj.baseItemId === outId) {
      return { isValid: true, isBobinExchange: true, isSameItem: false };
    }
  }

  // 3. One is Bobin / 500m length and the other is that item
  const isOneBobin =
    isBobinItem(inItemObj || inName) ||
    isBobinItem(outItemObj || outName) ||
    /bobin/i.test(inName) ||
    /bobin/i.test(outName) ||
    /500\s*m/i.test(inName) ||
    /500\s*m/i.test(outName);

  if (isOneBobin) {
    const sigIn = getCoreCableSignature(inName);
    const sigOut = getCoreCableSignature(outName);
    if (sigIn && sigOut && (sigIn === sigOut || sigIn.includes(sigOut) || sigOut.includes(sigIn))) {
      return { isValid: true, isBobinExchange: true, isSameItem: false };
    }

    // Check matching conductor size specs (e.g. '1.5 rm' or '1.0 rm') and category
    const extractConductor = (str: string) => {
      const match = str.toLowerCase().match(/\b\d+(\.\d+)?\s*(rm|re)\b/i);
      return match ? match[0].replace(/\s+/g, '') : '';
    };
    const cIn = extractConductor(inName);
    const cOut = extractConductor(outName);
    if (cIn && cOut && cIn === cOut) {
      const catIn = (inItemObj?.category || (inName.toLowerCase().includes('bya') ? 'bya' : inName.toLowerCase().includes('byfy') ? 'byfy' : '')).toLowerCase();
      const catOut = (outItemObj?.category || (outName.toLowerCase().includes('bya') ? 'bya' : outName.toLowerCase().includes('byfy') ? 'byfy' : '')).toLowerCase();
      if (!catIn || !catOut || catIn === catOut) {
        return { isValid: true, isBobinExchange: true, isSameItem: false };
      }
    }
  }

  return {
    isValid: false,
    isBobinExchange: false,
    isSameItem: false,
    reason: `Input item ("${inName}") and Output item ("${outName}") are different cable types. Exchange is only allowed between the same item or that item and its Bobin.`
  };
}

/**
 * Finds the counterpart Bobin (if item is coil) or base coil item (if item is bobin).
 */
export function getBobinOrCoilCounterpart(item: Item | undefined | null, allItems: Item[]): Item | undefined {
  if (!item) return undefined;
  const isBobin = isBobinItem(item);
  if (isBobin) {
    // Find base coil item
    if (item.baseItemId) {
      const found = allItems.find((i) => i.id === item.baseItemId);
      if (found) return found;
    }
    const sig = getCoreCableSignature(item.name);
    return allItems.find((i) => !isBobinItem(i) && getCoreCableSignature(i.name) === sig);
  } else {
    // Find bobin item
    const found = allItems.find(
      (i) =>
        (i.baseItemId && i.baseItemId === item.id) ||
        (isBobinItem(i) && getCoreCableSignature(i.name) === getCoreCableSignature(item.name))
    );
    if (found) return found;
  }
  return undefined;
}

interface ColorExchangeManagerProps {
  parties: Party[];
  items: Item[];
  company?: CompanyDetails;
  colorExchanges: ColorExchangeChallan[];
  factoryImports?: FactoryImportChallan[];
  storedBills?: StoredBill[];
  stockReturns?: any[];
  onSaveColorExchange: (exchange: ColorExchangeChallan) => void;
  onDeleteColorExchange?: (id: string) => void;
  onBack?: () => void;
  onClose?: () => void;
}

const emptyColors = (): ColorBreakdown => ({
  red: 0,
  blk: 0,
  yel: 0,
  grn: 0,
  blu: 0,
  others: 0
});

const createBlankExchangeLine = (index: number): ColorExchangeLine => ({
  id: `ex-line-${Date.now()}-${index}`,
  inItemId: '',
  inItemCode: '',
  inItemName: '',
  inUnit: 'Coils',
  inQty: 0,
  inColors: emptyColors(),
  inCoilEquivalent: 0,
  outItemId: '',
  outItemCode: '',
  outItemName: '',
  outUnit: 'Coils',
  outQty: 0,
  outColors: emptyColors(),
  outCoilEquivalent: 0,
  remarks: ''
});

export const ColorExchangeManager: React.FC<ColorExchangeManagerProps> = ({
  parties = [],
  items = [],
  company,
  colorExchanges = [],
  factoryImports = [],
  storedBills = [],
  stockReturns = [],
  onSaveColorExchange,
  onDeleteColorExchange,
  onBack,
  onClose
}) => {
  const [exchangeSubTab, setExchangeSubTab] = useState<'create' | 'history'>('create');
  const [exchangeMode, setExchangeMode] = useState<'color_only' | 'bobin_to_coils' | 'coils_to_bobin'>('color_only');
  const [date, setDate] = useState<string>(() => formatDateDDMMYY(new Date()));
  const [exchangeNo, setExchangeNo] = useState<string>(() => {
    const nextSeq = colorExchanges.length + 1;
    return `EX-${String(nextSeq).padStart(3, '0')}`;
  });
  const [partyName, setPartyName] = useState('');
  const [partyAddress, setPartyAddress] = useState('');
  const [partyPhone, setPartyPhone] = useState('');
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<ColorExchangeLine[]>(() => [
    createBlankExchangeLine(1)
  ]);

  // Selected Challan for print modal
  const [selectedReceipt, setSelectedReceipt] = useState<ColorExchangeChallan | null>(null);

  // Party search dropdown state
  const [partySearchOpen, setPartySearchOpen] = useState(false);
  const [partySearchQuery, setPartySearchQuery] = useState('');
  const [partyHighlightIdx, setPartyHighlightIdx] = useState(0);
  const partyDropdownRef = useRef<HTMLDivElement>(null);

  // Auto-detect exchange mode from line units and item types (1 Bobin = 5 Coils, 5 Coils = 1 Bobin)
  useEffect(() => {
    const isBobinLine = (unit: string, itId?: string, itNm?: string) => {
      if (/bobin/i.test(unit)) return true;
      const it = items.find((i) => (itId && i.id === itId) || (itNm && i.name.toLowerCase() === itNm.toLowerCase()));
      return isBobinItem(it || itNm) && !/coil/i.test(unit);
    };

    const hasBobinIn = lines.some((l) => isBobinLine(l.inUnit, l.inItemId, l.inItemName));
    const hasCoilOut = lines.some((l) => !isBobinLine(l.outUnit, l.outItemId, l.outItemName));
    const hasCoilIn = lines.some((l) => !isBobinLine(l.inUnit, l.inItemId, l.inItemName));
    const hasBobinOut = lines.some((l) => isBobinLine(l.outUnit, l.outItemId, l.outItemName));

    if (hasBobinIn && hasCoilOut) {
      setExchangeMode('bobin_to_coils');
    } else if (hasCoilIn && hasBobinOut) {
      setExchangeMode('coils_to_bobin');
    } else {
      setExchangeMode('color_only');
    }
  }, [lines, items]);

  // Item dynamic search state
  const [activeInSearchIdx, setActiveInSearchIdx] = useState<number | null>(null);
  const [activeOutSearchIdx, setActiveOutSearchIdx] = useState<number | null>(null);
  const [inHighlightedIdx, setInHighlightedIdx] = useState<number>(0);
  const [outHighlightedIdx, setOutHighlightedIdx] = useState<number>(0);
  const inDropdownRef = useRef<HTMLDivElement>(null);
  const outDropdownRef = useRef<HTMLDivElement>(null);
  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => getAllCategories());

  useEffect(() => {
    if (!partySearchOpen || !partyDropdownRef.current) return;
    const el = partyDropdownRef.current.querySelector('[data-ce-party-highlighted="true"]') as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [partyHighlightIdx, partySearchOpen]);

  useEffect(() => {
    if (activeInSearchIdx === null || !inDropdownRef.current) return;
    const el = inDropdownRef.current.querySelector('[data-ce-in-highlighted="true"]') as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [inHighlightedIdx, activeInSearchIdx]);

  useEffect(() => {
    if (activeOutSearchIdx === null || !outDropdownRef.current) return;
    const el = outDropdownRef.current.querySelector('[data-ce-out-highlighted="true"]') as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [outHighlightedIdx, activeOutSearchIdx]);

  useEffect(() => {
    const refresh = () => setCategoryOrder(getAllCategories());
    window.addEventListener('categories-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('categories-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  // References for color inputs and keyboard navigation
  const inRedInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const inBlkInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const inYelInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const inGrnInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const inBluInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const inOthInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

  const outRedInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const outBlkInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const outYelInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const outGrnInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const outBluInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const outOthInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const saveBtnRef = useRef<HTMLButtonElement | null>(null);

  // Filtered parties
  const filteredParties = useMemo(() => {
    if (!partySearchQuery.trim()) return parties;
    const q = partySearchQuery.toLowerCase();
    return parties.filter((p) => p.name.toLowerCase().includes(q) || (p.address && p.address.toLowerCase().includes(q)));
  }, [parties, partySearchQuery]);

  const handleSelectParty = (p: Party) => {
    setPartyName(p.name);
    setPartySearchQuery('');
    setPartyAddress(p.address || '');
    setPartyPhone(p.phone || '');
    setPartySearchOpen(false);
  };

  // Helper to compute equivalent coils
  const computeCoilEquivalent = (qty: number, unit: string, itemId?: string, itemName?: string): number => {
    const q = Number(qty) || 0;
    const it = items.find((i) => (itemId && i.id === itemId) || (itemName && i.name.toLowerCase() === itemName.toLowerCase()));
    const isBobin = /bobin/i.test(unit) || (isBobinItem(it || itemName) && !/coil/i.test(unit));
    if (isBobin) {
      return q * 5; // 1 Bobin = 5 Coils (500m)
    }
    return q;
  };

  // Update In (L.H.S) Line
  const updateInLine = (index: number, updates: Partial<ColorExchangeLine>) => {
    setLines((prev) => {
      const copy = [...prev];
      const current = { ...copy[index], ...updates };
      
      // Calculate color sum
      const colorSum =
        (Number(current.inColors?.red) || 0) +
        (Number(current.inColors?.blk) || 0) +
        (Number(current.inColors?.yel) || 0) +
        (Number(current.inColors?.grn) || 0) +
        (Number(current.inColors?.blu) || 0) +
        (Number(current.inColors?.others) || 0);

      if (colorSum > 0) {
        current.inQty = colorSum;
      }

      current.inCoilEquivalent = computeCoilEquivalent(current.inQty, current.inUnit, current.inItemId, current.inItemName);
      copy[index] = current;
      return copy;
    });
  };

  // Update Out (R.H.S) Line
  const updateOutLine = (index: number, updates: Partial<ColorExchangeLine>) => {
    setLines((prev) => {
      const copy = [...prev];
      const current = { ...copy[index], ...updates };

      // Calculate color sum
      const colorSum =
        (Number(current.outColors?.red) || 0) +
        (Number(current.outColors?.blk) || 0) +
        (Number(current.outColors?.yel) || 0) +
        (Number(current.outColors?.grn) || 0) +
        (Number(current.outColors?.blu) || 0) +
        (Number(current.outColors?.others) || 0);

      if (colorSum > 0) {
        current.outQty = colorSum;
      }

      current.outCoilEquivalent = computeCoilEquivalent(current.outQty, current.outUnit, current.outItemId, current.outItemName);
      copy[index] = current;
      return copy;
    });
  };

  // Handle select item for In (L.H.S) line
  const handleSelectInItem = (index: number, item: Item) => {
    const isBobin = isBobinItem(item) || (item.unit && /bobin/i.test(item.unit));
    const unit = isBobin ? 'Bobin' : 'Coils';
    updateInLine(index, {
      inItemId: item.id,
      inItemCode: item.code || '',
      inItemName: item.name,
      inUnit: unit
    });

    // Default Output item if empty or if previously matching the previous inItem
    const currentOut = lines[index];
    if (
      !currentOut.outItemName ||
      currentOut.outItemId === currentOut.inItemId ||
      currentOut.outItemName === currentOut.inItemName
    ) {
      updateOutLine(index, {
        outItemId: item.id,
        outItemCode: item.code || '',
        outItemName: item.name,
        outUnit: unit
      });
    }

    setActiveInSearchIdx(null);
    setTimeout(() => {
      inRedInputRefs.current[index]?.focus();
      inRedInputRefs.current[index]?.select();
    }, 60);
  };

  // Handle select item for Out (R.H.S) line
  const handleSelectOutItem = (index: number, item: Item) => {
    const isBobin = isBobinItem(item) || (item.unit && /bobin/i.test(item.unit));
    const unit = isBobin ? 'Bobin' : 'Coils';
    updateOutLine(index, {
      outItemId: item.id,
      outItemCode: item.code || '',
      outItemName: item.name,
      outUnit: unit
    });
    setActiveOutSearchIdx(null);
    setTimeout(() => {
      outRedInputRefs.current[index]?.focus();
      outRedInputRefs.current[index]?.select();
    }, 50);
  };

  // Filter & group items helper by configured category list order
  const getGroupedFilteredItems = (query: string) => {
    const matched = !query.trim()
      ? items
      : items.filter((i) =>
          matchesFlexibleSearch(`${i.name} ${i.sizeSpec || ''} ${i.category || ''}`, query, `${i.code || ''}`)
        );
    return groupItemsByCategoryOrder(matched, categoryOrder);
  };

  // Add line
  const handleAddLine = () => {
    setLines((prev) => [...prev, createBlankExchangeLine(prev.length + 1)]);
  };

  // Remove line
  const handleRemoveLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  // Reset form
  const handleResetForm = () => {
    setPartyName('');
    setPartyAddress('');
    setPartyPhone('');
    setRemarks('');
    setDate(formatDateDDMMYY(new Date()));
    setExchangeNo(`EX-${String(colorExchanges.length + 1).padStart(3, '0')}`);
    setLines([createBlankExchangeLine(1)]);
    setActiveInSearchIdx(null);
    setActiveOutSearchIdx(null);
  };

  // Total L.H.S and R.H.S calculations
  const totalInCoils = useMemo(() => {
    return lines.reduce((sum, l) => sum + (Number(l.inCoilEquivalent) || 0), 0);
  }, [lines]);

  const totalOutCoils = useMemo(() => {
    return lines.reduce((sum, l) => sum + (Number(l.outCoilEquivalent) || 0), 0);
  }, [lines]);

  const isBalanced = totalInCoils > 0 && totalInCoils === totalOutCoils;

  // Save handler
  const handleSave = () => {
    if (!partyName.trim()) {
      alert('Please select or enter a party name.');
      return;
    }

    if (totalInCoils === 0 || totalOutCoils === 0) {
      alert('Please enter exchange quantities for Input and Output.');
      return;
    }

    // Validation rule: Input from Party and Output to Party can be the SAME item OR that item and its Bobin!
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if ((l.inQty > 0 || l.outQty > 0 || l.inItemId || l.outItemId || l.inItemName || l.outItemName)) {
        if (!l.inItemName.trim()) {
          alert(`Please select an Input item on Row #${i + 1}.`);
          return;
        }
        if (!l.outItemName.trim()) {
          alert(`Please select an Output item on Row #${i + 1}.`);
          return;
        }
        const validity = checkItemExchangeValidity(l.inItemId, l.inItemName, l.outItemId, l.outItemName, items);
        if (!validity.isValid) {
          alert(
            `Validation Error on Row #${i + 1}:\n` +
            `Input item ("${l.inItemName}") and Output item ("${l.outItemName}") cannot be exchanged.\n\n` +
            `Exchange is only allowed between the same item (Colour exchange) or that item and its Bobin variant!`
          );
          return;
        }
      }
    }

    if (!isBalanced) {
      alert(
        `Validation Error: Input and Output must be strictly equal!\nInput from Party: ${totalInCoils} Coils\nOutput to Party: ${totalOutCoils} Coils`
      );
      return;
    }

    const validLines = lines.filter(
      (l) => (l.inItemName || l.inQty > 0) && (l.outItemName || l.outQty > 0)
    );

    const newChallan: ColorExchangeChallan = {
      id: `cex-${Date.now()}`,
      exchangeNo,
      date,
      partyName,
      partyAddress,
      partyPhone,
      exchangeType: exchangeMode,
      lines: validLines,
      totalInCoils,
      totalOutCoils,
      isBalanced: true,
      remarks,
      savedAt: new Date().toISOString()
    };

    onSaveColorExchange(newChallan);
    setSelectedReceipt(newChallan);
    handleResetForm();
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="cyber-glass-card p-3.5 sm:p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 relative text-white">
        <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
          <ArrowLeftRight className="w-5 h-5 text-cyan-400 inline-block" />
          <span>Colour &amp; Unit Exchange</span>
        </h2>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[11px] font-bold text-cyan-200/80 uppercase tracking-wider">View:</span>
          <select
            value={exchangeSubTab}
            onChange={(e) => setExchangeSubTab(e.target.value as any)}
            className="bg-[#061520] text-cyan-200 border border-cyan-500/30 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-cyan-400 cursor-pointer"
          >
            <option value="create">New Exchange Slip</option>
            <option value="history">Exchange History ({colorExchanges.length})</option>
          </select>
        </div>
      </div>

      {exchangeSubTab === 'create' && (
        <div className={`cyber-glass-card rounded-2xl text-white ${partySearchOpen ? 'relative z-30' : ''}`}>
          {/* Form Header Info */}
          <div className="p-5 cyber-glass-header border-b border-cyan-500/25 space-y-4 rounded-t-2xl">
            {/* Inputs: Party, Date, Exchange No */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              {/* Party Autocomplete */}
              <div className="sm:col-span-2 relative">
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Party Name *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={partyName}
                    onChange={(e) => {
                      setPartyName(e.target.value);
                      setPartySearchQuery(e.target.value);
                      setPartySearchOpen(true);
                      setPartyHighlightIdx(0);
                    }}
                    onFocus={() => {
                      setPartySearchQuery('');
                      setPartySearchOpen(true);
                      setPartyHighlightIdx(0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!partySearchOpen) {
                          setPartySearchOpen(true);
                          setPartyHighlightIdx(0);
                        } else if (filteredParties.length > 0) {
                          setPartyHighlightIdx((prev) => (prev + 1) % filteredParties.length);
                        }
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!partySearchOpen) {
                          setPartySearchOpen(true);
                          setPartyHighlightIdx(0);
                        } else if (filteredParties.length > 0) {
                          setPartyHighlightIdx((prev) => (prev - 1 + filteredParties.length) % filteredParties.length);
                        }
                      } else if (e.key === 'Enter') {
                        if (partySearchOpen && filteredParties.length > 0) {
                          e.preventDefault();
                          e.stopPropagation();
                          const chosen = filteredParties[partyHighlightIdx] || filteredParties[0];
                          if (chosen) handleSelectParty(chosen);
                        }
                      } else if (e.key === 'Escape') {
                        setPartySearchOpen(false);
                      }
                    }}
                    placeholder="Search or enter party name..."
                    className="w-full bg-[#061520] border border-cyan-500/30 rounded-xl px-3.5 py-2 text-xs font-bold text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-cyan-400"
                  />
                  <div className="absolute right-3 top-2.5 flex items-center space-x-1">
                    {partyName && (
                      <button
                        type="button"
                        onClick={() => {
                          setPartyName('');
                          setPartySearchQuery('');
                          setPartySearchOpen(true);
                          setPartyHighlightIdx(0);
                        }}
                        className="text-slate-400 hover:text-white text-xs px-1"
                      >
                        ✕
                      </button>
                    )}
                    <ChevronDown
                      onClick={() => {
                        setPartySearchOpen(!partySearchOpen);
                        setPartyHighlightIdx(0);
                      }}
                      className={`w-4 h-4 text-slate-400 cursor-pointer transition-transform ${partySearchOpen ? 'rotate-180 text-cyan-400' : ''}`}
                    />
                  </div>
                </div>

                {partySearchOpen && (
                  <div
                    ref={partyDropdownRef}
                    className="absolute left-0 right-0 top-full mt-1 bg-[#091e2c] backdrop-blur-xl border border-cyan-400/35 rounded-xl shadow-2xl z-[100] max-h-60 overflow-y-auto divide-y divide-cyan-500/15"
                  >
                    <div className="p-2 bg-[#0c2638] border-b border-cyan-500/25 flex items-center justify-between sticky top-0">
                      <span className="text-[11px] font-bold text-cyan-200">
                        Select Party ({filteredParties.length} available)
                      </span>
                      <button
                        type="button"
                        onClick={() => setPartySearchOpen(false)}
                        className="text-xs font-bold text-slate-300 hover:text-white px-1"
                      >
                        ✕
                      </button>
                    </div>
                    {filteredParties.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400 italic">
                        No customer found matching "{partySearchQuery}". Enter new party name directly.
                      </div>
                    ) : (
                      filteredParties.map((p, idx) => (
                        <button
                          key={p.id ? `${p.id}-${idx}` : `party-${idx}`}
                          type="button"
                          data-ce-party-highlighted={idx === partyHighlightIdx ? 'true' : 'false'}
                          onMouseEnter={() => setPartyHighlightIdx(idx)}
                          onClick={() => handleSelectParty(p)}
                          className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                            idx === partyHighlightIdx
                              ? 'bg-cyan-500/20 border-l-4 border-cyan-400 font-bold'
                              : 'hover:bg-cyan-500/[0.08]'
                          }`}
                        >
                          <div>
                            <span className="font-bold text-white block">{p.name}</span>
                            <span className="text-[10px] text-slate-400">{p.address || 'Showroom Customer'}</span>
                          </div>
                          {partyName === p.name && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Date */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Date (dd.mm.yy)
                </label>
                <DateInputWithPicker
                  value={date}
                  onChange={setDate}
                  valueFormat="ddmmyy"
                  theme="dark"
                  inputClassName="!rounded-xl px-3 py-2 text-white"
                />
              </div>

              {/* Exchange No */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Exchange No #
                </label>
                <input
                  type="text"
                  value={exchangeNo}
                  onChange={(e) => setExchangeNo(e.target.value)}
                  className="w-full bg-[#061520] border border-cyan-500/30 rounded-xl px-3 py-2 text-xs font-mono font-bold text-cyan-300"
                />
              </div>
            </div>
          </div>

          {/* L.H.S vs R.H.S Exchange Grid Table */}
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* L.H.S (Input from Party) */}
              <div className="cyber-glass-subcard border border-rose-500/35 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-rose-500/25">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block"></span>
                    <h3 className="font-black text-sm text-rose-200">
                      Input from Party
                    </h3>
                  </div>
                  <span className="text-xs font-black text-rose-200 font-mono bg-rose-500/20 border border-rose-500/30 px-2.5 py-1 rounded-lg">
                    Total: {totalInCoils} Coils
                  </span>
                </div>

                {lines.map((l, idx) => {
                  const groupedInItems = getGroupedFilteredItems(l.inItemName);
                  const filteredInItems = groupedInItems.orderedItems;
                  const isDropdownOpen = activeInSearchIdx === idx;

                  return (
                    <div key={`in-line-${idx}`} className="p-3 bg-[#071824]/80 rounded-xl border border-cyan-500/20 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between gap-2 relative">
                        <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>
                        
                        {/* Dynamic Item Search Autocomplete */}
                        <div className="flex-1 relative">
                          <div className="relative flex items-center">
                            <input
                              type="text"
                              value={l.inItemName}
                              onChange={(e) => {
                                updateInLine(idx, { inItemName: e.target.value });
                                setActiveInSearchIdx(idx);
                                setInHighlightedIdx(0);
                              }}
                              onFocus={() => {
                                setActiveInSearchIdx(idx);
                                setInHighlightedIdx(0);
                              }}
                              onKeyDown={(e) => {
                                if (!isDropdownOpen) {
                                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setActiveInSearchIdx(idx);
                                    setInHighlightedIdx(0);
                                  }
                                  return;
                                }
                                if (e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (filteredInItems.length > 0) {
                                    setInHighlightedIdx((prev) => (prev + 1) % filteredInItems.length);
                                  }
                                } else if (e.key === 'ArrowUp') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (filteredInItems.length > 0) {
                                    setInHighlightedIdx((prev) => (prev - 1 + filteredInItems.length) % filteredInItems.length);
                                  }
                                } else if (e.key === 'Enter') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const chosen = filteredInItems[inHighlightedIdx] || filteredInItems[0];
                                  if (chosen) {
                                    handleSelectInItem(idx, chosen);
                                  } else {
                                    setActiveInSearchIdx(null);
                                    inRedInputRefs.current[idx]?.focus();
                                  }
                                } else if (e.key === 'Escape') {
                                  e.preventDefault();
                                  setActiveInSearchIdx(null);
                                }
                              }}
                              placeholder="Type to search cable item (e.g. 1.5 RM BYA)..."
                              className="w-full bg-[#061520] border border-cyan-500/30 rounded-lg pl-2.5 pr-14 py-1 text-xs font-bold text-white placeholder-slate-400 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                            />
                            <div className="absolute right-1.5 flex items-center space-x-1">
                              {l.inItemName && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateInLine(idx, { inItemName: '', inItemId: '', inItemCode: '' });
                                    setActiveInSearchIdx(idx);
                                    setInHighlightedIdx(0);
                                  }}
                                  className="text-slate-400 hover:text-white text-xs px-1"
                                >
                                  ✕
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveInSearchIdx(isDropdownOpen ? null : idx);
                                  setInHighlightedIdx(0);
                                }}
                                className="p-0.5 text-slate-400 hover:text-white rounded cursor-pointer"
                                title="Toggle item dropdown"
                              >
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isDropdownOpen ? 'rotate-180 text-rose-400' : ''}`} />
                              </button>
                            </div>
                          </div>

                          {isDropdownOpen && (
                            <div
                              ref={inDropdownRef}
                              className="absolute left-0 right-0 top-full mt-1 bg-[#091e2c]/98 backdrop-blur-xl border border-cyan-400/35 rounded-xl shadow-xl z-50 max-h-56 overflow-y-auto divide-y divide-cyan-500/15"
                            >
                              <div className="p-1.5 bg-[#0c2638] text-[10px] font-bold text-cyan-200 flex justify-between items-center sticky top-0">
                                <span>Select Cable Item ({filteredInItems.length} found)</span>
                                <button
                                  type="button"
                                  onClick={() => setActiveInSearchIdx(null)}
                                  className="text-slate-300 hover:text-white"
                                >
                                  ✕
                                </button>
                              </div>
                              {filteredInItems.length === 0 ? (
                                <div className="p-3 text-center text-slate-400 text-xs italic">
                                  No items matched "{l.inItemName}"
                                </div>
                              ) : (
                                groupedInItems.groups.map((grp) => (
                                  <div key={grp.category} className="divide-y divide-cyan-500/15">
                                    <div className="px-2.5 py-1 bg-[#061826] text-[10px] font-black uppercase tracking-wider text-cyan-300 border-b border-cyan-500/20">
                                      {grp.category} ({grp.items.length})
                                    </div>
                                    {grp.items.map(({ item: it, flatIndex: itemIdx }) => (
                                      <button
                                        key={it.id}
                                        type="button"
                                        data-ce-in-highlighted={itemIdx === inHighlightedIdx ? 'true' : 'false'}
                                        onMouseEnter={() => setInHighlightedIdx(itemIdx)}
                                        onClick={() => handleSelectInItem(idx, it)}
                                        className={`w-full text-left p-2 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                                          itemIdx === inHighlightedIdx ? 'bg-rose-500/20 border-l-4 border-rose-400 font-bold' : 'hover:bg-cyan-500/[0.08]'
                                        }`}
                                      >
                                        <div>
                                          <div className="font-bold text-white">{it.name}</div>
                                          <div className="text-[10px] text-slate-400">
                                            {it.category || 'General'} • {it.unit || 'Coils'}
                                          </div>
                                        </div>
                                        <div className="flex items-center space-x-1 text-[9px] font-bold text-slate-300">
                                          <span className="px-1 bg-red-500/20 text-red-300 border border-red-500/30 rounded">R</span>
                                          <span className="px-1 bg-slate-700/60 text-slate-200 border border-slate-500/30 rounded">B</span>
                                          <span className="px-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded">Y</span>
                                          <span className="px-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded">G</span>
                                          <span className="px-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded">BL</span>
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                          {l.inItemName && (
                            <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px]">
                              {(() => {
                                const inItemObj = items.find((i) => (l.inItemId && i.id === l.inItemId) || i.name.toLowerCase() === l.inItemName.toLowerCase());
                                const isCurrentBobin = isBobinItem(inItemObj || l.inItemName) || /bobin/i.test(l.inUnit);
                                const counterpart = getBobinOrCoilCounterpart(inItemObj, items);

                                return (
                                  <>
                                    <span className={`px-1.5 py-0.5 rounded font-bold border ${isCurrentBobin ? 'bg-purple-500/15 text-purple-200 border-purple-400/30' : 'bg-[#0c2638] text-slate-200 border-cyan-500/25'}`}>
                                      {isCurrentBobin ? 'Bobin Item (1 Bobin = 5 Coils)' : 'Standard Coil Item'}
                                    </span>
                                    {counterpart && (
                                      <button
                                        type="button"
                                        onClick={() => handleSelectOutItem(idx, counterpart)}
                                        className="px-2 py-0.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-400/35 rounded font-bold cursor-pointer transition-colors flex items-center gap-1"
                                        title={`Quick switch Output to ${counterpart.name}`}
                                      >
                                        <ArrowLeftRight className="w-2.5 h-2.5 text-purple-300" />
                                        <span>Exchange with {isBobinItem(counterpart) ? "That Item's Bobin" : "That Item's Coils"}: <strong className="font-extrabold">{counterpart.name}</strong></span>
                                      </button>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </div>

                        <select
                          value={l.inUnit}
                          onChange={(e) => updateInLine(idx, { inUnit: e.target.value })}
                          className="bg-[#061520] border border-cyan-500/30 rounded-lg px-2 py-1 text-xs font-bold text-white"
                        >
                          <option value="Coils">Coils</option>
                          <option value="Bobin">Bobin (500m)</option>
                        </select>
                      </div>

                      {/* Color Input Boxes with Visible Breakdown (Black Theme - 6 Colours in One Line) */}
                      <div className="grid grid-cols-6 gap-1 text-center bg-neutral-950 p-1.5 rounded-lg border border-neutral-800">
                        <div className="flex flex-col items-center">
                          <span className="text-[9px] font-black text-red-400 block mb-0.5">Red</span>
                          <input
                            ref={(el) => { inRedInputRefs.current[idx] = el; }}
                            type="number"
                            value={l.inColors.red || ''}
                            onChange={(e) =>
                              updateInLine(idx, {
                                inColors: { ...l.inColors, red: Number(e.target.value) || 0 }
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                inBlkInputRefs.current[idx]?.focus();
                                inBlkInputRefs.current[idx]?.select();
                              }
                            }}
                            className="w-full text-center bg-black border border-neutral-800 focus:border-red-500 rounded p-1 text-xs font-black font-mono text-white focus:outline-none focus:ring-1 focus:ring-red-500"
                            placeholder="0"
                          />
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-[9px] font-black text-neutral-300 block mb-0.5">Black</span>
                          <input
                            ref={(el) => { inBlkInputRefs.current[idx] = el; }}
                            type="number"
                            value={l.inColors.blk || ''}
                            onChange={(e) =>
                              updateInLine(idx, {
                                inColors: { ...l.inColors, blk: Number(e.target.value) || 0 }
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                inYelInputRefs.current[idx]?.focus();
                                inYelInputRefs.current[idx]?.select();
                              }
                            }}
                            className="w-full text-center bg-black border border-neutral-800 focus:border-neutral-400 rounded p-1 text-xs font-black font-mono text-white focus:outline-none focus:ring-1 focus:ring-neutral-400"
                            placeholder="0"
                          />
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-[9px] font-black text-amber-400 block mb-0.5">Yellow</span>
                          <input
                            ref={(el) => { inYelInputRefs.current[idx] = el; }}
                            type="number"
                            value={l.inColors.yel || ''}
                            onChange={(e) =>
                              updateInLine(idx, {
                                inColors: { ...l.inColors, yel: Number(e.target.value) || 0 }
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                inGrnInputRefs.current[idx]?.focus();
                                inGrnInputRefs.current[idx]?.select();
                              }
                            }}
                            className="w-full text-center bg-black border border-neutral-800 focus:border-amber-400 rounded p-1 text-xs font-black font-mono text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                            placeholder="0"
                          />
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-[9px] font-black text-emerald-400 block mb-0.5">Green</span>
                          <input
                            ref={(el) => { inGrnInputRefs.current[idx] = el; }}
                            type="number"
                            value={l.inColors.grn || ''}
                            onChange={(e) =>
                              updateInLine(idx, {
                                inColors: { ...l.inColors, grn: Number(e.target.value) || 0 }
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                inBluInputRefs.current[idx]?.focus();
                                inBluInputRefs.current[idx]?.select();
                              }
                            }}
                            className="w-full text-center bg-black border border-neutral-800 focus:border-emerald-500 rounded p-1 text-xs font-black font-mono text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            placeholder="0"
                          />
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-[9px] font-black text-blue-400 block mb-0.5">Blue</span>
                          <input
                            ref={(el) => { inBluInputRefs.current[idx] = el; }}
                            type="number"
                            value={l.inColors.blu || ''}
                            onChange={(e) =>
                              updateInLine(idx, {
                                inColors: { ...l.inColors, blu: Number(e.target.value) || 0 }
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                inOthInputRefs.current[idx]?.focus();
                                inOthInputRefs.current[idx]?.select();
                              }
                            }}
                            className="w-full text-center bg-black border border-neutral-800 focus:border-blue-500 rounded p-1 text-xs font-black font-mono text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="0"
                          />
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-[9px] font-black text-purple-300 block mb-0.5">Others</span>
                          <input
                            ref={(el) => { inOthInputRefs.current[idx] = el; }}
                            type="number"
                            value={l.inColors.others || ''}
                            onChange={(e) =>
                              updateInLine(idx, {
                                inColors: { ...l.inColors, others: Number(e.target.value) || 0 }
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                outRedInputRefs.current[idx]?.focus();
                                outRedInputRefs.current[idx]?.select();
                              }
                            }}
                            className="w-full text-center bg-black border border-neutral-800 focus:border-purple-400 rounded p-1 text-xs font-black font-mono text-white focus:outline-none focus:ring-1 focus:ring-purple-400"
                            placeholder="0"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-bold pt-1 border-t border-cyan-500/15">
                        <span className="text-slate-300">
                          Total: {l.inQty} {l.inUnit}
                        </span>
                        <span className="text-rose-300 font-mono">
                          = {l.inCoilEquivalent} Coils
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* R.H.S (Output to Party) */}
              <div className="cyber-glass-subcard border border-emerald-500/35 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-emerald-500/25">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block"></span>
                    <h3 className="font-black text-sm text-emerald-200">
                      Output to Party
                    </h3>
                  </div>
                  <span className="text-xs font-black text-emerald-200 font-mono bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
                    Total: {totalOutCoils} Coils
                  </span>
                </div>

                {lines.map((l, idx) => {
                  const groupedOutItems = getGroupedFilteredItems(l.outItemName);
                  const filteredOutItems = groupedOutItems.orderedItems;
                  const isDropdownOpen = activeOutSearchIdx === idx;

                  return (
                    <div key={`out-line-${idx}`} className="p-3 bg-[#071824]/80 rounded-xl border border-cyan-500/20 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between gap-2 relative">
                        <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>

                        {/* Dynamic Item Search Autocomplete */}
                        <div className="flex-1 relative">
                          <div className="relative flex items-center">
                            <input
                              type="text"
                              value={l.outItemName}
                              onChange={(e) => {
                                updateOutLine(idx, { outItemName: e.target.value });
                                setActiveOutSearchIdx(idx);
                                setOutHighlightedIdx(0);
                              }}
                              onFocus={() => {
                                setActiveOutSearchIdx(idx);
                                setOutHighlightedIdx(0);
                              }}
                              onKeyDown={(e) => {
                                if (!isDropdownOpen) {
                                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setActiveOutSearchIdx(idx);
                                    setOutHighlightedIdx(0);
                                  }
                                  return;
                                }
                                if (e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (filteredOutItems.length > 0) {
                                    setOutHighlightedIdx((prev) => (prev + 1) % filteredOutItems.length);
                                  }
                                } else if (e.key === 'ArrowUp') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (filteredOutItems.length > 0) {
                                    setOutHighlightedIdx((prev) => (prev - 1 + filteredOutItems.length) % filteredOutItems.length);
                                  }
                                } else if (e.key === 'Enter') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const chosen = filteredOutItems[outHighlightedIdx] || filteredOutItems[0];
                                  if (chosen) {
                                    handleSelectOutItem(idx, chosen);
                                  } else {
                                    setActiveOutSearchIdx(null);
                                    outRedInputRefs.current[idx]?.focus();
                                  }
                                } else if (e.key === 'Escape') {
                                  e.preventDefault();
                                  setActiveOutSearchIdx(null);
                                }
                              }}
                              placeholder="Type to search cable item (e.g. 1.5 RM BYA)..."
                              className="w-full bg-[#061520] border border-cyan-500/30 rounded-lg pl-2.5 pr-14 py-1 text-xs font-bold text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-400 focus:outline-none"
                            />
                            <div className="absolute right-1.5 flex items-center space-x-1">
                              {l.outItemName && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateOutLine(idx, { outItemName: '', outItemId: '', outItemCode: '' });
                                    setActiveOutSearchIdx(idx);
                                    setOutHighlightedIdx(0);
                                  }}
                                  className="text-slate-400 hover:text-white text-xs px-1"
                                >
                                  ✕
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveOutSearchIdx(isDropdownOpen ? null : idx);
                                  setOutHighlightedIdx(0);
                                }}
                                className="p-0.5 text-slate-400 hover:text-white rounded cursor-pointer"
                                title="Toggle item dropdown"
                              >
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isDropdownOpen ? 'rotate-180 text-emerald-400' : ''}`} />
                              </button>
                            </div>
                          </div>

                          {isDropdownOpen && (
                            <div
                              ref={outDropdownRef}
                              className="absolute left-0 right-0 top-full mt-1 bg-[#091e2c]/98 backdrop-blur-xl border border-cyan-400/35 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto divide-y divide-cyan-500/15 min-w-[580px] sm:min-w-[640px]"
                            >
                              <div className="p-1.5 bg-[#0c2638] text-[10px] font-bold text-cyan-200 flex justify-between items-center sticky top-0 z-10">
                                <span>Select Cable Item ({filteredOutItems.length} found)</span>
                                <button
                                  type="button"
                                  onClick={() => setActiveOutSearchIdx(null)}
                                  className="text-slate-300 hover:text-white"
                                >
                                  ✕
                                </button>
                              </div>

                              {/* Fast Recommended Exchange Picks for the Input Item */}
                              {(() => {
                                const inItemObj = items.find((i) => (l.inItemId && i.id === l.inItemId) || i.name.toLowerCase() === (l.inItemName || '').toLowerCase());
                                const counterpart = getBobinOrCoilCounterpart(inItemObj, items);
                                if (!inItemObj && !counterpart) return null;

                                return (
                                  <div className="p-2 bg-[#0b2334] border-b border-cyan-500/20 flex flex-wrap items-center gap-2 text-[10px]">
                                    <span className="font-black text-cyan-200 uppercase tracking-wider text-[9px]">
                                      Allowed Exchanges:
                                    </span>
                                    {inItemObj && (
                                      <button
                                        type="button"
                                        onClick={() => handleSelectOutItem(idx, inItemObj)}
                                        className="px-2.5 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-400/35 rounded-lg font-bold cursor-pointer transition-colors shadow-2xs flex items-center gap-1"
                                      >
                                        <Check className="w-3 h-3 text-emerald-400" />
                                        <span>Same Item: <strong>{inItemObj.name}</strong></span>
                                      </button>
                                    )}
                                    {counterpart && (
                                      <button
                                        type="button"
                                        onClick={() => handleSelectOutItem(idx, counterpart)}
                                        className="px-2.5 py-1 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-lg font-black cursor-pointer transition-colors shadow-2xs flex items-center gap-1"
                                      >
                                        <ArrowLeftRight className="w-3 h-3" />
                                        <span>{isBobinItem(counterpart) ? "That Item's Bobin" : "That Item's Coils"}: <strong>{counterpart.name}</strong></span>
                                      </button>
                                    )}
                                  </div>
                                );
                              })()}

                              {filteredOutItems.length === 0 ? (
                                <div className="p-3 text-center text-slate-400 text-xs italic">
                                  No items matched "{l.outItemName}"
                                </div>
                              ) : (
                                groupedOutItems.groups.map((grp) => (
                                  <div key={grp.category} className="divide-y divide-cyan-500/15">
                                    <div className="px-2.5 py-1 bg-[#061826] text-[10px] font-black uppercase tracking-wider text-cyan-300 border-b border-cyan-500/20">
                                      {grp.category} ({grp.items.length})
                                    </div>
                                    {grp.items.map(({ item: it, flatIndex: itemIdx }) => {
                                      const itemLedger = calculateItemColorStockLedger(it, factoryImports, storedBills, stockReturns);
                                      const itemStock = itemLedger.closing;
                                      const totalStk = itemStock.total || (Number(it.openingStock) || 0);
                                      const validity = checkItemExchangeValidity(l.inItemId, l.inItemName, it.id, it.name, items);

                                      return (
                                        <button
                                          key={it.id}
                                          type="button"
                                          data-ce-out-highlighted={itemIdx === outHighlightedIdx ? 'true' : 'false'}
                                          onMouseEnter={() => setOutHighlightedIdx(itemIdx)}
                                          onClick={() => handleSelectOutItem(idx, it)}
                                          className={`w-full text-left px-2.5 py-2 text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                                            itemIdx === outHighlightedIdx
                                              ? 'bg-emerald-500/20 border-l-4 border-emerald-400 font-bold'
                                              : validity.isBobinExchange
                                              ? 'bg-purple-500/10 hover:bg-purple-500/20'
                                              : 'hover:bg-cyan-500/[0.08]'
                                          }`}
                                        >
                                          {/* Single line: Item Name & category & unit */}
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="font-bold text-white text-xs truncate">{it.name}</span>
                                            <span className="text-[10px] text-slate-400 font-medium shrink-0">
                                              ({it.category || 'General'} • {it.unit || 'Coils'})
                                            </span>
                                            {validity.isValid && (
                                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider shrink-0 ${
                                                validity.isSameItem
                                                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/35'
                                                  : 'bg-purple-500/20 text-purple-200 border border-purple-400/35'
                                              }`}>
                                                {validity.isSameItem ? 'Same Item' : "That Item's Bobin"}
                                              </span>
                                            )}
                                          </div>

                                          {/* Stock Colours Visible on the Single Line */}
                                          <div className="flex items-center space-x-1 shrink-0 text-[9.5px] font-mono font-bold">
                                            <span className="px-1.5 py-0.5 bg-red-500/15 text-red-300 border border-red-500/30 rounded" title="Red Stock">
                                              R:{itemStock.red}
                                            </span>
                                            <span className="px-1.5 py-0.5 bg-slate-700/60 text-slate-200 border border-slate-500/30 rounded" title="Black Stock">
                                              B:{itemStock.blk}
                                            </span>
                                            <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded" title="Yellow Stock">
                                              Y:{itemStock.yel}
                                            </span>
                                            <span className="px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded" title="Green Stock">
                                              G:{itemStock.grn}
                                            </span>
                                            <span className="px-1.5 py-0.5 bg-blue-500/15 text-blue-300 border border-blue-500/30 rounded" title="Blue Stock">
                                              BL:{itemStock.blu}
                                            </span>
                                            {itemStock.others > 0 && (
                                              <span className="px-1.5 py-0.5 bg-purple-500/15 text-purple-300 border border-purple-500/30 rounded" title="Others Stock">
                                                O:{itemStock.others}
                                              </span>
                                            )}
                                            <span className="px-1.5 py-0.5 bg-cyan-400 text-slate-950 rounded font-sans font-black text-[10px]" title="Total Stock">
                                              Stk:{totalStk}
                                            </span>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                ))
                              )}
                            </div>
                          )}

                          {l.inItemName && (
                            <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px]">
                              {(() => {
                                const validity = checkItemExchangeValidity(l.inItemId, l.inItemName, l.outItemId, l.outItemName, items);
                                const inItemObj = items.find((i) => (l.inItemId && i.id === l.inItemId) || i.name.toLowerCase() === (l.inItemName || '').toLowerCase());
                                const counterpart = getBobinOrCoilCounterpart(inItemObj, items);

                                if (!l.outItemName) {
                                  return (
                                    <span className="text-amber-200 bg-amber-500/15 border border-amber-400/30 px-2 py-0.5 rounded font-bold">
                                      Select Output Item (Same item or that item's Bobin)
                                    </span>
                                  );
                                }

                                if (validity.isValid) {
                                  if (validity.isSameItem) {
                                    return (
                                      <span className="text-emerald-200 bg-emerald-500/15 border border-emerald-400/30 px-2 py-0.5 rounded font-bold flex items-center gap-1">
                                        <Check className="w-3 h-3 text-emerald-400" />
                                        <span>Same Item as Input: <span className="font-extrabold">{l.inItemName}</span></span>
                                        {l.inUnit !== l.outUnit && (
                                          <span className="ml-1 px-1.5 py-0.2 bg-emerald-500/25 text-emerald-100 rounded font-black text-[9px]">
                                            Unit Exchange: {l.inUnit} ↔ {l.outUnit}
                                          </span>
                                        )}
                                      </span>
                                    );
                                  } else {
                                    return (
                                      <span className="text-purple-200 bg-purple-500/15 border border-purple-400/30 px-2 py-0.5 rounded font-bold flex items-center gap-1">
                                        <Check className="w-3 h-3 text-purple-300" />
                                        <span>Valid Exchange: <span className="font-extrabold">Item & That Item's Bobin</span> ({l.outItemName})</span>
                                      </span>
                                    );
                                  }
                                }

                                return (
                                  <span className="text-rose-200 bg-rose-500/15 border border-rose-400/35 px-2 py-0.5 rounded font-bold flex flex-wrap items-center gap-1">
                                    <span>⚠️ Must be Same Item or That Item's Bobin:</span>
                                    {inItemObj && (
                                      <button
                                        type="button"
                                        onClick={() => handleSelectOutItem(idx, inItemObj)}
                                        className="ml-1 underline text-rose-200 hover:text-white font-bold cursor-pointer"
                                      >
                                        (Use Same Item)
                                      </button>
                                    )}
                                    {counterpart && (
                                      <button
                                        type="button"
                                        onClick={() => handleSelectOutItem(idx, counterpart)}
                                        className="ml-1 px-1.5 py-0.5 bg-purple-500/25 hover:bg-purple-500/35 text-purple-100 rounded font-black cursor-pointer"
                                      >
                                        (Use {isBobinItem(counterpart) ? "That Item's Bobin" : "That Item's Coils"})
                                      </button>
                                    )}
                                  </span>
                                );
                              })()}
                            </div>
                          )}
                        </div>

                        <select
                          value={l.outUnit}
                          onChange={(e) => updateOutLine(idx, { outUnit: e.target.value })}
                          className="bg-[#061520] border border-cyan-500/30 rounded-lg px-2 py-1 text-xs font-bold text-white"
                        >
                          <option value="Coils">Coils</option>
                          <option value="Bobin">Bobin (500m)</option>
                        </select>
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Color Input Boxes with Visible Breakdown & Showroom Stock */}
                      {(() => {
                        const matchedOutItem = items.find(
                          (it) => it.id === l.outItemId || it.name.trim().toLowerCase() === l.outItemName.trim().toLowerCase()
                        );
                        const outStock = matchedOutItem
                          ? calculateItemColorStockLedger(matchedOutItem, factoryImports, storedBills, stockReturns).closing
                          : { red: 0, blk: 0, yel: 0, grn: 0, blu: 0, others: 0, total: 0 };

                        return (
                          <div className="bg-neutral-950 p-2 rounded-lg border border-neutral-800">
                            {/* Showroom Stock summary bar */}
                            <div className="flex items-center justify-between text-[10px] mb-1.5 px-0.5 font-bold">
                              <span className="text-neutral-300">
                                Showroom Stock: <strong className="text-emerald-400 font-mono">{outStock.total}</strong> {l.outUnit || 'Coils'}
                              </span>
                              <div className="flex items-center space-x-1.5 text-[9px] font-mono">
                                <span className="text-red-400">R:<b>{outStock.red}</b></span>
                                <span className="text-neutral-500">•</span>
                                <span className="text-neutral-300">B:<b>{outStock.blk}</b></span>
                                <span className="text-neutral-500">•</span>
                                <span className="text-amber-400">Y:<b>{outStock.yel}</b></span>
                                <span className="text-neutral-500">•</span>
                                <span className="text-emerald-400">G:<b>{outStock.grn}</b></span>
                                <span className="text-neutral-500">•</span>
                                <span className="text-blue-400">BL:<b>{outStock.blu}</b></span>
                                {outStock.others > 0 && (
                                  <>
                                    <span className="text-neutral-500">•</span>
                                    <span className="text-purple-400">O:<b>{outStock.others}</b></span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="grid grid-cols-6 gap-1 text-center">
                            <div className="flex flex-col items-center">
                              <span className="text-[9px] font-black text-red-400 block">Red</span>
                              <span className="text-[8px] font-bold font-mono text-red-300 bg-red-950/80 border border-red-900/60 px-1 rounded my-0.5">
                                Stk:{outStock.red}
                              </span>
                              <input
                                ref={(el) => { outRedInputRefs.current[idx] = el; }}
                                type="number"
                                value={l.outColors.red || ''}
                                onChange={(e) =>
                                  updateOutLine(idx, {
                                    outColors: { ...l.outColors, red: Number(e.target.value) || 0 }
                                  })
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    outBlkInputRefs.current[idx]?.focus();
                                    outBlkInputRefs.current[idx]?.select();
                                  }
                                }}
                                className="w-full text-center bg-black border border-neutral-800 focus:border-red-500 rounded p-1 text-xs font-black font-mono text-white focus:outline-none focus:ring-1 focus:ring-red-500"
                                placeholder="0"
                              />
                            </div>
                            <div className="flex flex-col items-center">
                              <span className="text-[9px] font-black text-neutral-300 block">Black</span>
                              <span className="text-[8px] font-bold font-mono text-neutral-300 bg-neutral-900 border border-neutral-700 px-1 rounded my-0.5">
                                Stk:{outStock.blk}
                              </span>
                              <input
                                ref={(el) => { outBlkInputRefs.current[idx] = el; }}
                                type="number"
                                value={l.outColors.blk || ''}
                                onChange={(e) =>
                                  updateOutLine(idx, {
                                    outColors: { ...l.outColors, blk: Number(e.target.value) || 0 }
                                  })
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    outYelInputRefs.current[idx]?.focus();
                                    outYelInputRefs.current[idx]?.select();
                                  }
                                }}
                                className="w-full text-center bg-black border border-neutral-800 focus:border-neutral-400 rounded p-1 text-xs font-black font-mono text-white focus:outline-none focus:ring-1 focus:ring-neutral-400"
                                placeholder="0"
                              />
                            </div>
                            <div className="flex flex-col items-center">
                              <span className="text-[9px] font-black text-amber-400 block">Yellow</span>
                              <span className="text-[8px] font-bold font-mono text-amber-300 bg-amber-950/80 border border-amber-900/60 px-1 rounded my-0.5">
                                Stk:{outStock.yel}
                              </span>
                              <input
                                ref={(el) => { outYelInputRefs.current[idx] = el; }}
                                type="number"
                                value={l.outColors.yel || ''}
                                onChange={(e) =>
                                  updateOutLine(idx, {
                                    outColors: { ...l.outColors, yel: Number(e.target.value) || 0 }
                                  })
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    outGrnInputRefs.current[idx]?.focus();
                                    outGrnInputRefs.current[idx]?.select();
                                  }
                                }}
                                className="w-full text-center bg-black border border-neutral-800 focus:border-amber-400 rounded p-1 text-xs font-black font-mono text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                                placeholder="0"
                              />
                            </div>
                            <div className="flex flex-col items-center">
                              <span className="text-[9px] font-black text-emerald-400 block">Green</span>
                              <span className="text-[8px] font-bold font-mono text-emerald-300 bg-emerald-950/80 border border-emerald-900/60 px-1 rounded my-0.5">
                                Stk:{outStock.grn}
                              </span>
                              <input
                                ref={(el) => { outGrnInputRefs.current[idx] = el; }}
                                type="number"
                                value={l.outColors.grn || ''}
                                onChange={(e) =>
                                  updateOutLine(idx, {
                                    outColors: { ...l.outColors, grn: Number(e.target.value) || 0 }
                                  })
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    outBluInputRefs.current[idx]?.focus();
                                    outBluInputRefs.current[idx]?.select();
                                  }
                                }}
                                className="w-full text-center bg-black border border-neutral-800 focus:border-emerald-500 rounded p-1 text-xs font-black font-mono text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                placeholder="0"
                              />
                            </div>
                            <div className="flex flex-col items-center">
                              <span className="text-[9px] font-black text-blue-400 block">Blue</span>
                              <span className="text-[8px] font-bold font-mono text-blue-300 bg-blue-950/80 border border-blue-900/60 px-1 rounded my-0.5">
                                Stk:{outStock.blu}
                              </span>
                              <input
                                ref={(el) => { outBluInputRefs.current[idx] = el; }}
                                type="number"
                                value={l.outColors.blu || ''}
                                onChange={(e) =>
                                  updateOutLine(idx, {
                                    outColors: { ...l.outColors, blu: Number(e.target.value) || 0 }
                                  })
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    outOthInputRefs.current[idx]?.focus();
                                    outOthInputRefs.current[idx]?.select();
                                  }
                                }}
                                className="w-full text-center bg-black border border-neutral-800 focus:border-blue-500 rounded p-1 text-xs font-black font-mono text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="0"
                              />
                            </div>
                            <div className="flex flex-col items-center">
                              <span className="text-[9px] font-black text-purple-300 block">Others</span>
                              <span className="text-[8px] font-bold font-mono text-purple-300 bg-purple-950/80 border border-purple-900/60 px-1 rounded my-0.5">
                                Stk:{outStock.others}
                              </span>
                              <input
                                ref={(el) => { outOthInputRefs.current[idx] = el; }}
                                type="number"
                                value={l.outColors.others || ''}
                                onChange={(e) =>
                                  updateOutLine(idx, {
                                    outColors: { ...l.outColors, others: Number(e.target.value) || 0 }
                                  })
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (idx + 1 < lines.length) {
                                      inRedInputRefs.current[idx + 1]?.focus();
                                      inRedInputRefs.current[idx + 1]?.select();
                                    } else {
                                      saveBtnRef.current?.focus();
                                    }
                                  }
                                }}
                                className="w-full text-center bg-black border border-neutral-800 focus:border-purple-400 rounded p-1 text-xs font-black font-mono text-white focus:outline-none focus:ring-1 focus:ring-purple-400"
                                placeholder="0"
                              />
                            </div>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="flex items-center justify-between text-[11px] font-bold pt-1 border-t border-cyan-500/15">
                        <span className="text-slate-300">
                          Total: {l.outQty} {l.outUnit}
                        </span>
                        <span className="text-emerald-300 font-mono">
                          = {l.outCoilEquivalent} Coils
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Strict Validation Rule Status (Input = Output) */}
            <div className="pt-3">
              {isBalanced ? (
                <div className="p-4 bg-emerald-500/20 border border-emerald-400/40 text-white rounded-2xl shadow-sm flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-emerald-200">
                        ✓ Balanced: Input = Output ({totalInCoils} Coils)
                      </h4>
                      <p className="text-[11px] text-emerald-100/80">
                        Input Quantity and Output Quantity are equal. Ready to save exchange challan.
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-emerald-500/25 border border-emerald-400/40 text-emerald-100 rounded-lg text-xs font-mono font-black">
                    Input ({totalInCoils}) = Output ({totalOutCoils})
                  </span>
                </div>
              ) : (
                <div className="p-4 bg-rose-500/15 border border-rose-400/40 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <AlertTriangle className="w-5 h-5 text-rose-400" />
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-rose-200">
                        ⚠️ Validation Error: Input ≠ Output (Input must equal Output)
                      </h4>
                      <p className="text-[11px] text-rose-200/80">
                        Input is {totalInCoils} Coils, but Output is {totalOutCoils} Coils.
                        Exchange cannot be saved until both sides are strictly equal.
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-rose-500/25 border border-rose-400/40 text-rose-100 rounded-lg text-xs font-mono font-black">
                    Diff: {Math.abs(totalInCoils - totalOutCoils)} Coils
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Form Actions Footer */}
          <div className="p-5 bg-[#071824]/90 border-t border-cyan-500/20 flex flex-wrap items-center justify-between gap-3 rounded-b-2xl">
            <button
              type="button"
              onClick={handleResetForm}
              className="px-4 py-2 bg-[#081b28] border border-cyan-500/25 hover:bg-[#0e2a3d] text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Form</span>
            </button>

            <button
              ref={saveBtnRef}
              type="button"
              onClick={handleSave}
              disabled={!isBalanced}
              className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center space-x-2 ${
                isBalanced
                  ? 'bg-cyan-400 hover:bg-cyan-300 text-slate-950 shadow-lg'
                  : 'bg-slate-700/60 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Save className="w-4 h-4" />
              <span>Save & Issue Exchange Challan</span>
            </button>
          </div>
        </div>
      )}

      {/* History Sub-tab */}
      {exchangeSubTab === 'history' && (
        <div className="cyber-glass-card rounded-2xl overflow-hidden text-white">
          <div className="p-5 border-b border-cyan-500/25 cyber-glass-header flex items-center justify-between">
            <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">
              Color & Unit Exchange Challans Directory
            </h3>
            <span className="text-xs font-bold text-cyan-200">{colorExchanges.length} Records</span>
          </div>

          {colorExchanges.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <ArrowLeftRight className="w-10 h-10 mx-auto text-cyan-400/50" />
              <p className="font-bold text-slate-200">No color exchange records found.</p>
              <p className="text-xs">Click "+ New Exchange Slip" to record a color or unit exchange.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-[#0c2638] text-cyan-200 font-bold border-b border-cyan-500/30 uppercase text-[10px]">
                    <th className="p-3">Date</th>
                    <th className="p-3">Exchange No</th>
                    <th className="p-3">Party Name</th>
                    <th className="p-3">Type</th>
                    <th className="p-3 text-center text-rose-300">Input from Party (Coils)</th>
                    <th className="p-3 text-center text-emerald-300">Output to Party (Coils)</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                  {colorExchanges.map((ex) => (
                    <tr key={ex.id} className="hover:bg-cyan-500/[0.06] transition-colors">
                      <td className="p-3 font-mono text-slate-300">{formatDateDDMMYY(ex.date)}</td>
                      <td className="p-3 font-mono font-black text-cyan-300">{ex.exchangeNo}</td>
                      <td className="p-3 font-bold text-white">{ex.partyName}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#0c2638] text-slate-200 border border-cyan-500/25">
                          {ex.exchangeType === 'color_only'
                            ? 'Color Only'
                            : ex.exchangeType === 'bobin_to_coils'
                            ? 'Bobin → Coils'
                            : 'Coils → Bobin'}
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-rose-300">{ex.totalInCoils} Coils</td>
                      <td className="p-3 text-center font-mono font-bold text-emerald-300">{ex.totalOutCoils} Coils</td>
                      <td className="p-3 text-center">
                        <span className="bg-emerald-500/20 text-emerald-200 border border-emerald-400/35 px-2 py-0.5 rounded text-[10px] font-bold">
                          ✓ Balanced (In = Out)
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedReceipt(ex)}
                            className="p-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/25 rounded-md transition-colors cursor-pointer"
                            title="Print Exchange Challan"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {onDeleteColorExchange && (
                            <button
                              type="button"
                              onClick={() => onDeleteColorExchange(ex.id)}
                              className="p-1.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 rounded-md transition-colors cursor-pointer"
                              title="Delete Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Printable Receipt Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-3xl w-full border border-cyan-400/35 overflow-hidden my-8">
            <div className="cyber-glass-header border-b border-cyan-500/25 text-white p-4 flex items-center justify-between no-print">
              <div className="flex items-center space-x-2">
                <ArrowLeftRight className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold uppercase">Color Exchange Challan #{selectedReceipt.exchangeNo}</h3>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center space-x-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Challan</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedReceipt(null)}
                  className="p-1.5 hover:bg-[#0e2a3d] text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-8 space-y-6 bg-white text-slate-800 font-sans print:p-0">
              <div className="text-center border-b-2 border-slate-800 pb-4">
                <h1 className="text-2xl font-black text-slate-900 uppercase tracking-wider">{company?.name || 'POLY CABLES'}</h1>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-widest mt-0.5">
                  GOODS COLOUR & UNIT EXCHANGE CHALLAN (INPUT = OUTPUT)
                </p>
                <p className="text-xs text-slate-500 mt-1">{company?.address} • Ph: {company?.phone}</p>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-300 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 font-semibold block uppercase text-[10px]">Exchange No</span>
                  <span className="font-mono font-bold text-purple-700">{selectedReceipt.exchangeNo}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block uppercase text-[10px]">Date</span>
                  <span className="font-mono font-bold">{formatDateDDMMYY(selectedReceipt.date)}</span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-500 font-semibold block uppercase text-[10px]">Party Name</span>
                  <span className="font-bold text-slate-900">{selectedReceipt.partyName}</span>
                </div>
              </div>

              {/* Items Side by Side Table */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                {/* Input from Party */}
                <div className="border border-slate-300 rounded-xl p-3 bg-slate-50/50">
                  <h4 className="font-bold text-rose-900 uppercase text-[11px] mb-2 pb-1 border-b border-slate-200">
                    Input from Party
                  </h4>
                  {selectedReceipt.lines.map((l, idx) => (
                    <div key={`rec-in-${idx}`} className="mb-2 pb-2 border-b border-slate-200 last:border-b-0">
                      <div className="font-bold">{l.inItemName}</div>
                      <div className="text-slate-600 font-mono text-[11px]">
                        Qty: {l.inQty} {l.inUnit} ({l.inCoilEquivalent} Coils)
                      </div>
                      <div className="text-[10px] text-slate-500">
                        R:{l.inColors.red} B:{l.inColors.blk} Y:{l.inColors.yel} G:{l.inColors.grn} BL:{l.inColors.blu} O:{l.inColors.others}
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 font-black text-rose-900 border-t border-slate-300 flex justify-between">
                    <span>Total Input:</span>
                    <span>{selectedReceipt.totalInCoils} Coils</span>
                  </div>
                </div>

                {/* Output to Party */}
                <div className="border border-slate-300 rounded-xl p-3 bg-slate-50/50">
                  <h4 className="font-bold text-emerald-900 uppercase text-[11px] mb-2 pb-1 border-b border-slate-200">
                    Output to Party
                  </h4>
                  {selectedReceipt.lines.map((l, idx) => (
                    <div key={`rec-out-${idx}`} className="mb-2 pb-2 border-b border-slate-200 last:border-b-0">
                      <div className="font-bold">{l.outItemName}</div>
                      <div className="text-slate-600 font-mono text-[11px]">
                        Qty: {l.outQty} {l.outUnit} ({l.outCoilEquivalent} Coils)
                      </div>
                      <div className="text-[10px] text-slate-500">
                        R:{l.outColors.red} B:{l.outColors.blk} Y:{l.outColors.yel} G:{l.outColors.grn} BL:{l.outColors.blu} O:{l.outColors.others}
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 font-black text-emerald-900 border-t border-slate-300 flex justify-between">
                    <span>Total Output:</span>
                    <span>{selectedReceipt.totalOutCoils} Coils</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-emerald-100 border border-emerald-300 text-emerald-950 rounded-xl text-center font-bold text-xs">
                ✓ Exchange Verified & Balanced (Input: {selectedReceipt.totalInCoils} Coils = Output: {selectedReceipt.totalOutCoils} Coils)
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
