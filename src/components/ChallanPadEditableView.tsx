import React, { useState, useRef, useEffect } from 'react';
import { DeliveryChallan, CompanyDetails, Item, Party, Salesperson, ChallanLineItem, BranchLocation } from '../types';
import { formatDateDDMMYY, parseDateToISO } from '../utils/dateUtils';
import { convertToTakaWords } from '../utils/numberToWords';
import { getBranchAddressDetails, isMarketingOfficer } from '../utils/branchAccess';
import { Printer, RotateCcw, Check, Plus, Trash2, Calendar, ChevronDown, Layers, FileSpreadsheet } from 'lucide-react';

interface ChallanPadEditableViewProps {
  // Challan Header State & Setters
  challanNo: string;
  setChallanNo: (v: string) => void;
  challanDate: string;
  setChallanDate: (v: string) => void;
  orderNumber: string;
  setOrderNumber: (v: string) => void;
  orderDate: string;
  setOrderDate: (v: string) => void;
  refNo: string;
  setRefNo: (v: string) => void;
  salesmanCode: string;
  setSalesmanCode: (v: string) => void;
  salespersonName: string;
  setSalespersonName: (v: string) => void;
  partyName: string;
  setPartyName: (v: string) => void;
  partyAddress: string;
  setPartyAddress: (v: string) => void;
  partyPhone: string;
  setPartyPhone: (v: string) => void;
  remarks: string;
  setRemarks: (v: string) => void;

  // Lines
  formLines: ChallanLineItem[];
  setFormLines: React.Dispatch<React.SetStateAction<ChallanLineItem[]>>;

  // Financials
  challanDiscountPercent: number;
  setChallanDiscountPercent: (v: number) => void;
  challanDiscountAmount: number;
  setChallanDiscountAmount: (v: number) => void;
  challanAdvanceAmount: number;
  setChallanAdvanceAmount: (v: number) => void;

  // Master Data
  company: CompanyDetails;
  selectedBranch?: BranchLocation | null;
  parties: Party[];
  items: Item[];
  salespersons: Salesperson[];

  // Header Mode Switcher
  padHeaderMode: 'plain' | 'hide_logo' | 'hide_all';
  setPadHeaderMode: (mode: 'plain' | 'hide_logo' | 'hide_all') => void;

  // Form Actions
  onSave: (e?: React.FormEvent, autoPrint?: boolean) => void;
  onClear: () => void;
  isEditing?: boolean;
  onOpenSlipPad?: () => void;
}

export const ChallanPadEditableView: React.FC<ChallanPadEditableViewProps> = ({
  challanNo,
  setChallanNo,
  challanDate,
  setChallanDate,
  orderNumber,
  setOrderNumber,
  orderDate,
  setOrderDate,
  refNo,
  setRefNo,
  salesmanCode,
  setSalesmanCode,
  salespersonName,
  setSalespersonName,
  partyName,
  setPartyName,
  partyAddress,
  setPartyAddress,
  partyPhone,
  setPartyPhone,
  remarks,
  setRemarks,
  formLines,
  setFormLines,
  challanDiscountPercent,
  setChallanDiscountPercent,
  challanDiscountAmount,
  setChallanDiscountAmount,
  challanAdvanceAmount,
  setChallanAdvanceAmount,
  company,
  selectedBranch,
  parties,
  items,
  salespersons,
  padHeaderMode,
  setPadHeaderMode,
  onSave,
  onClear,
  isEditing,
  onOpenSlipPad
}) => {
  const [zoomLevel, setZoomLevel] = useState<'80%' | '100%' | '115%'>('100%');

  // Party Search Dropdown State
  const [showPartyDropdown, setShowPartyDropdown] = useState(false);
  const [partyHighlightIdx, setPartyHighlightIdx] = useState(0);

  // Item Search Dropdown State
  const [activeItemDropdownIdx, setActiveItemDropdownIdx] = useState<number | null>(null);
  const [itemHighlightIdx, setItemHighlightIdx] = useState(0);

  // Auto-hide Party & Item dropdowns on outside click/touch or Escape
  useEffect(() => {
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (showPartyDropdown && !target.closest('.challan-pad-party-dropdown')) {
        setShowPartyDropdown(false);
      }
      if (activeItemDropdownIdx !== null && !target.closest('.challan-pad-item-dropdown')) {
        setActiveItemDropdownIdx(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPartyDropdown(false);
        setActiveItemDropdownIdx(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside, { passive: true });
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [showPartyDropdown, activeItemDropdownIdx]);

  // Field Font Size / Compactness State (matching Bill Invoice View)
  const topFieldFontSize = '13px';
  const addressFontSize = '12px';

  // Refs for navigation
  const partyInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const itemInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const discountPercentInputRef = useRef<HTMLInputElement>(null);
  const discountAmountInputRef = useRef<HTMLInputElement>(null);
  const advanceAmountInputRef = useRef<HTMLInputElement>(null);
  const partyDropdownRef = useRef<HTMLDivElement>(null);
  const itemDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPartyDropdown || !partyDropdownRef.current) return;
    const el = partyDropdownRef.current.querySelector('[data-pad-party-highlighted="true"]') as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [partyHighlightIdx, showPartyDropdown]);

  useEffect(() => {
    if (activeItemDropdownIdx === null || !itemDropdownRef.current) return;
    const el = itemDropdownRef.current.querySelector('[data-pad-item-highlighted="true"]') as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [itemHighlightIdx, activeItemDropdownIdx]);

  // Calculations
  const grossAmount = formLines.reduce((sum, line) => sum + (line.amount || 0), 0);
  const totalCoilQty = formLines.reduce((sum, line) => sum + (line.coilQty || 0), 0);
  const calculatedDiscountAmount = challanDiscountAmount || Math.round((grossAmount * challanDiscountPercent) / 100);
  const netAmount = Math.max(0, grossAmount - calculatedDiscountAmount);
  const dueBalance = Math.max(0, netAmount - challanAdvanceAmount);
  const inWords = convertToTakaWords(netAmount);

  // Spacer rows so the printed sheet aligns properly
  const filledLinesCount = formLines.filter(
    (l) => (l.itemDescription && l.itemDescription.trim() !== '') || l.coilQty > 0 || l.amount > 0
  ).length;
  const spacerCount = Math.max(0, 10 - formLines.length);

  // Handlers
  const handleSelectParty = (p: Party) => {
    setPartyName(p.name);
    setPartyAddress(p.address || '');
    if (p.phone) setPartyPhone(p.phone);
    if (p.salesmanCode) {
      setSalesmanCode(p.salesmanCode);
      const sp = salespersons.find((s) => s.code.toLowerCase() === (p.salesmanCode || '').toLowerCase());
      setSalespersonName(sp ? sp.name : p.salesmanCode);
    }
    setShowPartyDropdown(false);
    setTimeout(() => {
      dateInputRef.current?.focus();
      dateInputRef.current?.select();
    }, 50);
  };

  const handleSelectItem = (idx: number, item: Item) => {
    setFormLines((prev) => {
      const updated = [...prev];
      const currentQty = updated[idx]?.coilQty || 1;
      const rate = item.rate || 0;
      const amt = currentQty * rate;
      updated[idx] = {
        ...updated[idx],
        itemDescription: item.name,
        sizeSpec: item.sizeSpec || '',
        unit: item.unit || 'Coils',
        rate: rate,
        amount: amt
      };
      return updated;
    });
    setActiveItemDropdownIdx(null);
    const nextQtyInput = document.getElementById(`pad-challan-qty-${idx}`) as HTMLInputElement | null;
    if (nextQtyInput) {
      setTimeout(() => {
        nextQtyInput.focus();
        nextQtyInput.select();
      }, 50);
    }
  };

  const handleLineChange = (index: number, field: keyof ChallanLineItem, value: any) => {
    setFormLines((prev) => {
      const updated = [...prev];
      const current = { ...updated[index], [field]: value };

      if (field === 'coilQty' || field === 'rate') {
        const q = field === 'coilQty' ? Number(value) || 0 : current.coilQty;
        const r = field === 'rate' ? Number(value) || 0 : current.rate;
        current.amount = Math.round(q * r);
        current.dueQty = Math.max(0, q - (current.billedQty || 0));
      }

      updated[index] = current;
      return updated;
    });
  };

  const handleAddLine = () => {
    setFormLines((prev) => [
      ...prev,
      {
        id: `cline-${Date.now()}-${prev.length + 1}-${Math.random().toString(36).substr(2, 4)}`,
        slNo: prev.length + 1,
        itemDescription: '',
        sizeSpec: '',
        coilQty: 0,
        billedQty: 0,
        dueQty: 0,
        unit: 'Coils',
        rate: 0,
        amount: 0
      }
    ]);
  };

  const handleRemoveLine = (index: number) => {
    if (formLines.length <= 1) {
      setFormLines([
        {
          id: `cline-${Date.now()}-1`,
          slNo: 1,
          itemDescription: '',
          sizeSpec: '',
          coilQty: 0,
          billedQty: 0,
          dueQty: 0,
          unit: 'Coils',
          rate: 0,
          amount: 0
        }
      ]);
      return;
    }
    setFormLines((prev) => prev.filter((_, i) => i !== index).map((l, i) => ({ ...l, slNo: i + 1 })));
  };

  const filteredParties = parties.filter(
    (p) =>
      p.name.toLowerCase().includes(partyName.toLowerCase()) ||
      (p.address && p.address.toLowerCase().includes(partyName.toLowerCase()))
  );

  return (
    <div className="flex flex-col space-y-4">
      {/* Print Specific CSS */}
      <style>{`
        @media print {
          @page {
            size: 7.2in 10in;
            margin: 0;
          }
          body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .hide-on-preprinted-pad {
            visibility: hidden !important;
            opacity: 0 !important;
          }
          .bill-paper-dimensions {
            width: 7.2in !important;
            max-width: 7.2in !important;
            min-height: 10in !important;
            padding: 0 0.28in 0.28in 0.28in !important;
            box-shadow: none !important;
            border: none !important;
            transform: none !important;
            margin: 0 auto !important;
            background: white !important;
          }
        }
      `}</style>

      {/* Interactive Editable Document Pad Paper (Matching Bill Invoice View Exactly) */}
      <div className="print-preview-canvas-container bg-[#040f17]/70 border border-cyan-500/20 p-2.5 sm:p-6 rounded-2xl flex justify-start sm:justify-center items-start overflow-auto">
        <div
          className="bill-paper-dimensions bg-white text-black shadow-2xl border border-slate-300 relative select-none origin-top transition-transform duration-100 flex flex-col justify-between overflow-visible flex-shrink-0 font-sans"
          style={{
            width: '7.2in',
            maxWidth: '7.2in',
            minHeight: '10in',
            padding: '0 0.28in 0.28in 0.28in',
            transform: `scale(${zoomLevel === '80%' ? 0.8 : (zoomLevel === '115%' ? 1.15 : 1.0)})`
          }}
        >
          <div className="relative z-10 space-y-1">
            {/* Keep only 0.5" for the company name and logo so the challan starts higher. */}
            <div className="text-center pb-0 space-y-0 text-black font-sans leading-tight pt-0">
              <div
                style={{ height: '0.5in', minHeight: '0.5in' }}
                className={`flex items-center justify-center space-x-2 ${
                  padHeaderMode !== 'plain' ? 'hide-on-preprinted-pad invisible opacity-0' : ''
                }`}
              >
                <div className="relative w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0">
                  <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-xs">
                    <circle cx="50" cy="50" r="26" fill="#38bdf8" opacity="0.8" />
                    <circle cx="50" cy="20" r="14" fill="#facc15" />
                    <circle cx="50" cy="80" r="14" fill="#ef4444" />
                    <circle cx="20" cy="50" r="14" fill="#2563eb" />
                    <circle cx="80" cy="50" r="14" fill="#22c55e" />
                  </svg>
                </div>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-black italic tracking-wider text-[#1e295b] font-sans uppercase">
                  {company.name || 'POLY CABLES'}
                </h1>
              </div>

              {/* Company Address & Title start immediately after 1.5" mark */}
              {(() => {
                const bAddr = getBranchAddressDetails(selectedBranch || null, company.phone, company.email);
                if (!bAddr.line1) return null;
                return (
                  <div
                    className={`space-y-0.5 pt-0 mt-0 pb-0 mb-0 print:pb-0 print:mb-0 ${
                      padHeaderMode === 'hide_all' ? 'hide-on-preprinted-pad invisible opacity-0' : ''
                    }`}
                  >
                    <p style={{ fontSize: '14px' }} className="font-extrabold text-[14px] leading-tight text-black print:text-[14px] print:font-extrabold madhupur-address-line">
                      {bAddr.line1}
                    </p>
                    {bAddr.line2 ? (
                      <p style={{ fontSize: '14px' }} className="font-bold text-[14px] leading-tight text-black print:text-[14px] print:font-bold madhupur-address-line">
                        {bAddr.line2}
                      </p>
                    ) : null}
                    {bAddr.line3 ? (
                      <p style={{ fontSize: '14px' }} className="font-semibold text-[14px] leading-tight text-black print:text-[14px] madhupur-address-line">
                        {bAddr.line3}
                      </p>
                    ) : null}
                  </div>
                );
              })()}

              {/* Delivery Challan Badge */}
              <div className="pt-1 pb-0.5">
                <span className="delivery-challan-badge challan-badge inline-block bg-slate-900 text-white border border-black px-4 py-0.5 rounded text-xs font-black tracking-widest uppercase">
                  DELIVERY CHALLAN
                </span>
              </div>
            </div>

            {/* Metadata Grid starts immediately after header */}
            <div className="flex items-start justify-between w-full text-black font-sans mt-1 mb-0.5 gap-x-3 text-[13px]">
              {/* Left Side: Party Name (Row 1), Address (Row 2), Phone (Row 3) */}
              <div className="flex-1 min-w-0 space-y-0.5">
                {/* Row 1: Party Name */}
                <div className="flex items-center w-full min-h-[18px]">
                  <span style={{ fontSize: topFieldFontSize }} className="w-[88px] flex-none font-semibold text-black whitespace-nowrap text-left">
                    Party Name
                  </span>
                  <span className="w-3 flex-none text-center font-semibold text-black">:</span>
                  <div className="challan-pad-party-dropdown relative flex-1 min-w-0 border-b border-dotted border-black pb-0.5">
                    <input
                      ref={partyInputRef}
                      type="text"
                      value={partyName}
                      onFocus={() => {
                        setShowPartyDropdown(true);
                        setPartyHighlightIdx(0);
                      }}
                      onChange={(e) => {
                        setPartyName(e.target.value);
                        setShowPartyDropdown(true);
                        setPartyHighlightIdx(0);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!showPartyDropdown) {
                            setShowPartyDropdown(true);
                            setPartyHighlightIdx(0);
                          } else if (filteredParties.length > 0) {
                            setPartyHighlightIdx((prev) => (prev + 1) % filteredParties.length);
                          }
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!showPartyDropdown) {
                            setShowPartyDropdown(true);
                            setPartyHighlightIdx(0);
                          } else if (filteredParties.length > 0) {
                            setPartyHighlightIdx((prev) => (prev - 1 + filteredParties.length) % filteredParties.length);
                          }
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (showPartyDropdown && filteredParties.length > 0) {
                            const chosen = filteredParties[partyHighlightIdx] || filteredParties[0];
                            handleSelectParty(chosen);
                          } else {
                            setShowPartyDropdown(false);
                            setTimeout(() => {
                              dateInputRef.current?.focus();
                              dateInputRef.current?.select();
                            }, 50);
                          }
                        } else if (e.key === 'Escape') {
                          setShowPartyDropdown(false);
                        }
                      }}
                      placeholder="Search or enter party name..."
                      style={{ fontSize: topFieldFontSize }}
                      className="w-full bg-transparent font-bold text-black focus:outline-none truncate no-print"
                    />
                    <div
                      style={{ fontSize: topFieldFontSize, lineHeight: '1.25' }}
                      className="hidden print:block font-bold w-full min-w-0 pb-1 text-black whitespace-normal break-words overflow-visible"
                    >
                      {partyName || '\u00A0'}
                    </div>

                    {showPartyDropdown && (
                      <div
                        ref={partyDropdownRef}
                        className="absolute left-0 top-full mt-1 w-80 sm:w-96 max-w-[calc(100vw-2rem)] max-h-60 overflow-y-auto bg-white border border-slate-300 rounded-lg shadow-2xl z-50 text-left font-sans text-xs divide-y divide-slate-100 no-print"
                      >
                        <div className="p-2 bg-slate-100 font-bold text-[10px] text-slate-600 uppercase flex justify-between items-center sticky top-0 z-10 border-b border-slate-200">
                          <span>Party Search ({filteredParties.length})</span>
                          <button
                            type="button"
                            onClick={() => setShowPartyDropdown(false)}
                            className="text-slate-400 hover:text-red-600 font-bold"
                          >
                            ✕
                          </button>
                        </div>
                        {filteredParties.length === 0 ? (
                          <div className="p-3 text-slate-400 text-center italic">No matching party. Type name.</div>
                        ) : (
                          filteredParties.map((p, idx) => {
                            const isSelected = partyHighlightIdx === idx;
                            return (
                              <button
                                key={p.id}
                                type="button"
                                data-pad-party-highlighted={isSelected ? 'true' : 'false'}
                                onClick={() => handleSelectParty(p)}
                                onMouseEnter={() => setPartyHighlightIdx(idx)}
                                className={`w-full text-left p-2 transition-colors cursor-pointer flex justify-between items-center gap-2 ${
                                  isSelected
                                    ? 'bg-amber-100 text-slate-900 font-bold border-l-4 border-amber-500'
                                    : 'hover:bg-amber-50 text-slate-800'
                                }`}
                              >
                                <div>
                                  <div className="font-bold text-slate-900">{p.name}</div>
                                  <div className="text-[10px] text-slate-500">
                                    {p.address || 'No address'} {p.phone ? `| Ph: ${p.phone}` : ''}
                                  </div>
                                </div>
                                {p.salesmanCode && (
                                  <div className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded font-mono font-bold text-slate-700">
                                    [{p.salesmanCode}]
                                  </div>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Row 2: Address */}
                <div className="flex items-center w-full min-h-[18px]">
                  <span style={{ fontSize: topFieldFontSize }} className="w-[88px] flex-none font-semibold text-black whitespace-nowrap text-left">
                    Address
                  </span>
                  <span className="w-3 flex-none text-center font-semibold text-black">:</span>
                  <div className="relative flex-1 min-w-0 border-b border-dotted border-black pb-0.5">
                    <input
                      type="text"
                      value={partyAddress}
                      onChange={(e) => setPartyAddress(e.target.value)}
                      placeholder="Address"
                      style={{ fontSize: addressFontSize }}
                      className="w-full bg-transparent text-black font-semibold focus:outline-none no-print"
                    />
                    <div
                      style={{ fontSize: addressFontSize, lineHeight: '1.25' }}
                      className="hidden print:block font-semibold w-full min-w-0 pb-1 text-black whitespace-normal break-words overflow-visible"
                    >
                      {partyAddress || '\u00A0'}
                    </div>
                  </div>
                </div>

                {/* Row 3: Phone */}
                <div className="flex items-center w-full min-h-[18px]">
                  <span style={{ fontSize: topFieldFontSize }} className="w-[88px] flex-none font-semibold text-black whitespace-nowrap text-left">
                    Phone
                  </span>
                  <span className="w-3 flex-none text-center font-semibold text-black">:</span>
                  <div className="relative flex-1 min-w-0 border-b border-dotted border-black pb-0.5">
                    <input
                      type="text"
                      value={partyPhone}
                      onChange={(e) => setPartyPhone(e.target.value)}
                      placeholder="Customer Phone"
                      style={{ fontSize: topFieldFontSize }}
                      className="w-full bg-transparent text-black font-mono font-semibold focus:outline-none no-print"
                    />
                    <div
                      style={{ fontSize: topFieldFontSize, lineHeight: '1.25' }}
                      className="hidden print:block font-mono font-semibold w-full min-w-0 pb-1 text-black"
                    >
                      {partyPhone || '\u00A0'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side: Challan No & Date (Row 1), Order No & Date (Row 2), Salesman Code/Name (Row 3) */}
              <div className="w-[280px] flex-none space-y-0.5">
                {/* Row 1: Challan No & Date */}
                <div className="flex items-center justify-start min-h-[18px] w-full">
                  <span style={{ fontSize: topFieldFontSize }} className="w-[88px] flex-none font-semibold text-black whitespace-nowrap text-left">
                    Challan No.
                  </span>
                  <span className="w-3 flex-none text-center font-semibold text-black">:</span>
                  <div className="border-b border-dotted border-black w-[68px] flex-none pb-0.5">
                    <input
                      type="text"
                      value={challanNo}
                      onChange={(e) => setChallanNo(e.target.value)}
                      placeholder="CH-001"
                      style={{ fontSize: topFieldFontSize }}
                      className="w-full bg-transparent px-0.5 font-sans font-bold text-black text-center focus:outline-none no-print"
                    />
                    <span style={{ fontSize: topFieldFontSize }} className="hidden print:inline-block font-bold w-full truncate text-center pb-0 text-black">
                      {challanNo || '\u00A0'}
                    </span>
                  </div>
                  <span style={{ fontSize: topFieldFontSize }} className="w-[40px] flex-none font-semibold text-black whitespace-nowrap text-right pr-1">
                    Date:
                  </span>
                  <div className="relative flex items-center w-[71px] flex-none border-b border-dotted border-black pb-0.5">
                    <input
                      ref={dateInputRef}
                      type="text"
                      value={challanDate || ''}
                      onChange={(e) => setChallanDate(e.target.value)}
                      onBlur={() => {
                        if (challanDate.trim()) {
                          setChallanDate(formatDateDDMMYY(challanDate) || challanDate);
                        }
                      }}
                      placeholder="dd.mm.yy"
                      style={{ fontSize: topFieldFontSize }}
                      className="w-full bg-transparent px-0.5 pr-4 text-black font-sans font-semibold text-center focus:outline-none no-print"
                    />
                    <span style={{ fontSize: topFieldFontSize }} className="hidden print:inline-block font-semibold w-full text-center text-black pb-0">
                      {formatDateDDMMYY(challanDate) || challanDate || '\u00A0'}
                    </span>
                    <input
                      type="date"
                      tabIndex={-1}
                      value={parseDateToISO(challanDate)}
                      onChange={(e) => {
                        if (e.target.value) {
                          setChallanDate(formatDateDDMMYY(e.target.value));
                        }
                      }}
                      className="w-3.5 h-3.5 opacity-0 absolute right-0 cursor-pointer no-print z-10"
                      title="Pick Date (dd.mm.yy)"
                    />
                    <Calendar className="w-3 h-3 text-slate-500 absolute right-0 pointer-events-none no-print" />
                  </div>
                </div>

                {/* Row 2: Order No & Date */}
                <div className="flex items-center justify-start min-h-[18px] w-full">
                  <span style={{ fontSize: topFieldFontSize }} className="w-[88px] flex-none font-semibold text-black whitespace-nowrap text-left">
                    Order No.
                  </span>
                  <span className="w-3 flex-none text-center font-semibold text-black">:</span>
                  <div className="border-b border-dotted border-black w-[68px] flex-none pb-0.5">
                    <input
                      type="text"
                      value={orderNumber}
                      onChange={(e) => setOrderNumber(e.target.value)}
                      placeholder=""
                      style={{ fontSize: topFieldFontSize }}
                      className="w-full bg-transparent px-0.5 font-sans font-semibold text-black text-center focus:outline-none no-print"
                    />
                    <span style={{ fontSize: topFieldFontSize }} className="hidden print:inline-block font-semibold w-full truncate text-center pb-0 text-black">
                      {orderNumber || '\u00A0'}
                    </span>
                  </div>
                  <span style={{ fontSize: topFieldFontSize }} className="w-[40px] flex-none font-semibold text-black whitespace-nowrap text-right pr-1">
                    Date:
                  </span>
                  <div className="relative flex items-center w-[71px] flex-none border-b border-dotted border-black pb-0.5">
                    <input
                      type="text"
                      value={orderDate || ''}
                      onChange={(e) => setOrderDate(e.target.value)}
                      onBlur={() => {
                        if (orderDate.trim()) {
                          setOrderDate(formatDateDDMMYY(orderDate) || orderDate);
                        }
                      }}
                      placeholder="dd.mm.yy"
                      style={{ fontSize: topFieldFontSize }}
                      className="w-full bg-transparent px-0.5 pr-4 text-black font-sans font-semibold text-center focus:outline-none no-print"
                    />
                    <span style={{ fontSize: topFieldFontSize }} className="hidden print:inline-block font-semibold w-full text-center text-black pb-0">
                      {formatDateDDMMYY(orderDate) || formatDateDDMMYY(challanDate) || '\u00A0'}
                    </span>
                    <input
                      type="date"
                      tabIndex={-1}
                      value={parseDateToISO(orderDate || challanDate)}
                      onChange={(e) => {
                        if (e.target.value) {
                          setOrderDate(formatDateDDMMYY(e.target.value));
                        }
                      }}
                      className="w-3.5 h-3.5 opacity-0 absolute right-0 cursor-pointer no-print z-10"
                      title="Pick Order Date (dd.mm.yy)"
                    />
                    <Calendar className="w-3 h-3 text-slate-500 absolute right-0 pointer-events-none no-print" />
                  </div>
                </div>

                {/* Row 3: Salesman Code / Name */}
                <div className="flex items-center justify-start min-h-[18px] w-full">
                  <span style={{ fontSize: topFieldFontSize }} className="w-[88px] flex-none font-semibold text-black whitespace-nowrap text-left">
                    Salesman
                  </span>
                  <span className="w-3 flex-none text-center font-semibold text-black">:</span>
                  <div className="border-b border-dotted border-black flex-1 pb-0.5">
                    <select
                      value={salesmanCode}
                      onChange={(e) => {
                        const code = e.target.value;
                        setSalesmanCode(code);
                        const sp = salespersons.find((s) => s.code.toLowerCase() === code.toLowerCase());
                        setSalespersonName(sp ? sp.name : code);
                      }}
                      style={{ fontSize: topFieldFontSize }}
                      className="w-full bg-transparent text-black font-semibold focus:outline-none no-print cursor-pointer"
                    >
                      <option value="">-- None --</option>
                      {salespersons.filter(isMarketingOfficer).map((s) => (
                        <option key={s.id} value={s.code}>
                          {s.code} - {s.name}
                        </option>
                      ))}
                    </select>
                    <span style={{ fontSize: topFieldFontSize }} className="hidden print:inline-block font-semibold w-full truncate text-black pb-0">
                      {salespersonName || salesmanCode || '\u00A0'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bill / Challan Items Table */}
            <div className="border-2 border-black overflow-visible font-sans flex-1 flex flex-col justify-between mt-1 mb-1 min-h-[360px]">
              <table className="w-full text-left border-collapse flex-1 text-[13px]">
                <thead>
                  <tr className="bg-white text-black border-b-2 border-black font-bold text-center">
                    <th className="py-1 px-1.5 border-r border-black text-center w-10 font-bold whitespace-nowrap">
                      Sl No.
                    </th>
                    <th className="py-1 px-2 border-r border-black text-center font-bold whitespace-nowrap min-w-[240px]">
                      Name Of Items
                    </th>
                    <th className="py-1 px-1.5 border-r border-black text-center w-16 font-bold whitespace-nowrap">
                      Quantity
                    </th>
                    <th className="py-1 px-1.5 border-r border-black text-center w-12 font-bold whitespace-nowrap">
                      Unit
                    </th>
                    <th className="py-1 px-1.5 border-r border-black text-center w-20 font-bold whitespace-nowrap">
                      Price/Unit
                    </th>
                    <th className="py-1 px-2 text-center w-22 font-bold whitespace-nowrap">
                      Amount
                    </th>
                    <th className="py-1 px-1 text-center w-6 no-print"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-transparent">
                  {formLines.map((line, idx) => {
                    const queryTokens = (line.itemDescription || '')
                      .trim()
                      .toLowerCase()
                      .split(/\s+/)
                      .filter(Boolean);

                    const filteredItems = items.filter((i) => {
                      if (i.isActive === false) return false;
                      if (queryTokens.length === 0) return true;
                      const fullText = `${i.name} ${i.category || ''} ${i.sizeSpec || ''} ${i.brand || ''}`.toLowerCase();
                      return queryTokens.every((token) => fullText.includes(token));
                    });
                    const visibleItems = filteredItems.slice(0, 30);

                    return (
                      <tr key={line.id || idx} className="font-semibold text-black min-h-[24px] group">
                        {/* Sl No */}
                        <td className="py-0.5 px-1.5 border-r border-black text-center font-sans font-semibold">
                          {String(idx + 1).padStart(2, '0')}.
                        </td>

                        {/* Name of Items */}
                        <td className="challan-pad-item-dropdown py-0.5 px-2 border-r border-black font-semibold relative">
                          <input
                            ref={(el) => { itemInputRefs.current[idx] = el; }}
                            type="text"
                            value={line.itemDescription}
                            onFocus={() => {
                              setActiveItemDropdownIdx(idx);
                              setItemHighlightIdx(0);
                            }}
                            onChange={(e) => {
                              handleLineChange(idx, 'itemDescription', e.target.value);
                              setActiveItemDropdownIdx(idx);
                              setItemHighlightIdx(0);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                e.stopPropagation();
                                if (activeItemDropdownIdx !== idx) {
                                  setActiveItemDropdownIdx(idx);
                                  setItemHighlightIdx(0);
                                } else if (visibleItems.length > 0) {
                                  setItemHighlightIdx((prev) => (prev + 1) % visibleItems.length);
                                }
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                e.stopPropagation();
                                if (activeItemDropdownIdx !== idx) {
                                  setActiveItemDropdownIdx(idx);
                                  setItemHighlightIdx(0);
                                } else if (visibleItems.length > 0) {
                                  setItemHighlightIdx((prev) => (prev - 1 + visibleItems.length) % visibleItems.length);
                                }
                              } else if (e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();
                                if (activeItemDropdownIdx === idx && visibleItems.length > 0) {
                                  const chosen = visibleItems[itemHighlightIdx] || visibleItems[0];
                                  handleSelectItem(idx, chosen);
                                } else if (!line.itemDescription.trim()) {
                                  if (discountPercentInputRef.current) {
                                    discountPercentInputRef.current.focus();
                                    discountPercentInputRef.current.select();
                                  }
                                } else {
                                  const qtyInput = document.getElementById(`pad-challan-qty-${idx}`) as HTMLInputElement | null;
                                  if (qtyInput) {
                                    qtyInput.focus();
                                    qtyInput.select();
                                  }
                                }
                              } else if (e.key === 'Escape') {
                                setActiveItemDropdownIdx(null);
                              }
                            }}
                            placeholder="Type item name..."
                            className="w-full bg-transparent text-black font-semibold focus:outline-none no-print"
                          />
                          <div className="hidden print:block font-semibold whitespace-normal break-words leading-tight">
                            {line.itemDescription || '\u00A0'}
                          </div>

                          {/* Dynamic Item Autocomplete Dropdown */}
                          {activeItemDropdownIdx === idx && (
                            <div
                              ref={itemDropdownRef}
                              className="absolute left-0 top-full mt-0.5 w-[340px] sm:w-[440px] max-w-[calc(100vw-2rem)] max-h-64 overflow-y-auto bg-white border border-slate-300 rounded-lg shadow-2xl z-50 text-left font-sans text-xs divide-y divide-slate-100 no-print"
                            >
                              <div className="p-1.5 bg-slate-900 text-white font-bold text-[10px] flex justify-between items-center sticky top-0 z-10">
                                <span>Select Item ({visibleItems.length}{filteredItems.length > 30 ? ` of ${filteredItems.length}` : ''})</span>
                                <button
                                  type="button"
                                  onClick={() => setActiveItemDropdownIdx(null)}
                                  className="text-slate-300 hover:text-white"
                                >
                                  ✕
                                </button>
                              </div>
                              {visibleItems.length === 0 ? (
                                <div className="p-2 text-slate-400 text-center italic">No item matched.</div>
                              ) : (
                                visibleItems.map((item, itIdx) => {
                                  const isSel = itemHighlightIdx === itIdx;
                                  return (
                                    <div
                                      key={item.id}
                                      data-pad-item-highlighted={isSel ? 'true' : 'false'}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleSelectItem(idx, item);
                                      }}
                                      onMouseEnter={() => setItemHighlightIdx(itIdx)}
                                      className={`p-2 cursor-pointer flex justify-between items-center ${
                                        isSel ? 'bg-amber-100 text-slate-950 font-bold' : 'hover:bg-slate-50'
                                      }`}
                                    >
                                      <div>
                                        <div className="font-bold text-slate-900">{item.name}</div>
                                        <div className="text-[10px] text-slate-500">
                                          {item.category || 'General'} {item.sizeSpec ? `| ${item.sizeSpec}` : ''}
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <div className="font-mono font-bold text-emerald-800">
                                          ৳{Number(item.rate || 0).toLocaleString('en-IN')}
                                        </div>
                                        <div className="text-[10px] text-slate-500">{item.unit || 'Coils'}</div>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </td>

                        {/* Quantity */}
                        <td className="py-0.5 px-1.5 border-r border-black text-right font-semibold">
                          <input
                            id={`pad-challan-qty-${idx}`}
                            type="number"
                            min="0"
                            step="any"
                            value={line.coilQty === 0 ? '' : line.coilQty}
                            onChange={(e) => handleLineChange(idx, 'coilQty', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const qtyVal = Number(line.coilQty) || 0;
                                if (qtyVal === 0) {
                                  // If quantity is 0, jump directly to discount %
                                  if (discountPercentInputRef.current) {
                                    discountPercentInputRef.current.focus();
                                    discountPercentInputRef.current.select();
                                  }
                                } else {
                                  const rateInput = document.getElementById(`pad-challan-rate-${idx}`) as HTMLInputElement | null;
                                  if (rateInput) {
                                    rateInput.focus();
                                    rateInput.select();
                                  }
                                }
                              }
                            }}
                            placeholder="0"
                            className="w-full bg-transparent text-right font-semibold text-black focus:outline-none no-print"
                          />
                          <span className="hidden print:inline-block font-semibold">
                            {line.coilQty > 0 ? line.coilQty : ''}
                          </span>
                        </td>

                        {/* Unit */}
                        <td className="py-0.5 px-1.5 border-r border-black text-center font-semibold">
                          <input
                            type="text"
                            value={line.unit || 'Coils'}
                            onChange={(e) => handleLineChange(idx, 'unit', e.target.value)}
                            className="w-full bg-transparent text-center font-semibold text-black focus:outline-none no-print"
                          />
                          <span className="hidden print:inline-block font-semibold">
                            {line.coilQty > 0 ? (line.unit || 'Coils') : ''}
                          </span>
                        </td>

                        {/* Rate */}
                        <td className="py-0.5 px-1.5 border-r border-black text-right font-semibold">
                          <input
                            id={`pad-challan-rate-${idx}`}
                            type="number"
                            min="0"
                            step="any"
                            value={line.rate === 0 ? '' : line.rate}
                            onChange={(e) => handleLineChange(idx, 'rate', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                if (idx < formLines.length - 1) {
                                  itemInputRefs.current[idx + 1]?.focus();
                                  itemInputRefs.current[idx + 1]?.select();
                                } else {
                                  handleAddLine();
                                  setTimeout(() => {
                                    itemInputRefs.current[idx + 1]?.focus();
                                  }, 50);
                                }
                              }
                            }}
                            placeholder="0"
                            className="w-full bg-transparent text-right font-semibold text-black focus:outline-none no-print"
                          />
                          <span className="hidden print:inline-block font-semibold">
                            {line.rate > 0 ? Number(line.rate).toLocaleString('en-IN') : ''}
                          </span>
                        </td>

                        {/* Amount */}
                        <td className="py-0.5 px-2 text-right font-semibold">
                          {line.amount > 0 ? `${Number(line.amount).toLocaleString('en-IN')}/-` : ''}
                        </td>

                        {/* Remove Line (Screen Only) */}
                        <td className="py-0.5 px-1 text-center no-print">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            className="text-slate-300 hover:text-red-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove Line"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Empty Spacer Rows to match pre-printed pad standard height */}
                  {Array.from({ length: spacerCount }).map((_, emptyIdx) => (
                    <tr key={`empty-spacer-${emptyIdx}`} className="h-6">
                      <td className="border-r border-black"></td>
                      <td className="border-r border-black"></td>
                      <td className="border-r border-black"></td>
                      <td className="border-r border-black"></td>
                      <td className="border-r border-black"></td>
                      <td></td>
                      <td className="no-print"></td>
                    </tr>
                  ))}
                </tbody>

                <tfoot>
                  {/* Total Coils & Subtotal Row */}
                  <tr className="border-t-2 border-black font-semibold bg-slate-50/50">
                    <td colSpan={2} className="py-1 px-2 text-right border-r border-black font-semibold whitespace-nowrap">
                      Total Coils =
                    </td>
                    <td className="py-1 px-1.5 text-right border-r border-black font-semibold text-black">
                      {totalCoilQty}
                    </td>
                    <td className="border-r border-black text-center font-semibold text-slate-700">
                      Coils
                    </td>
                    <td className="py-1 px-1.5 text-right border-r border-black font-semibold whitespace-nowrap">
                      Subtotal =
                    </td>
                    <td className="py-1 px-2 text-right font-semibold text-black whitespace-nowrap">
                      {grossAmount ? `${Number(grossAmount).toLocaleString('en-IN')}/-` : '0/-'}
                    </td>
                    <td className="no-print"></td>
                  </tr>

                  {/* Sales Discount Row */}
                  <tr className="border-t border-black font-semibold">
                    <td colSpan={5} className="py-1 px-2 text-right border-r border-black font-semibold whitespace-nowrap">
                      <div className="flex items-center justify-end space-x-2">
                        <span>Sales Discount</span>
                        <div className="inline-flex items-center no-print">
                          <input
                            ref={discountPercentInputRef}
                            type="number"
                            min="0"
                            max="100"
                            step="any"
                            value={challanDiscountPercent === 0 ? '' : challanDiscountPercent}
                            onChange={(e) => {
                              const p = Number(e.target.value) || 0;
                              setChallanDiscountPercent(p);
                              setChallanDiscountAmount(Math.round((grossAmount * p) / 100));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                discountAmountInputRef.current?.focus();
                                discountAmountInputRef.current?.select();
                              }
                            }}
                            placeholder="0"
                            className="w-12 px-1 py-0.5 border border-slate-300 rounded text-center text-xs font-bold"
                          />
                          <span className="ml-1 font-bold">%</span>
                          <span className="mx-1 text-slate-400">|</span>
                          <span className="text-[11px] text-slate-500 mr-1">৳</span>
                          <input
                            ref={discountAmountInputRef}
                            type="number"
                            min="0"
                            step="any"
                            value={challanDiscountAmount === 0 ? '' : challanDiscountAmount}
                            onChange={(e) => {
                              const a = Number(e.target.value) || 0;
                              setChallanDiscountAmount(a);
                              if (grossAmount > 0) {
                                setChallanDiscountPercent(Number(((a / grossAmount) * 100).toFixed(2)));
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                // Auto save and print on Enter
                                onSave(undefined, true);
                              }
                            }}
                            placeholder="0"
                            className="w-16 px-1 py-0.5 border border-slate-300 rounded text-right text-xs font-bold"
                          />
                        </div>
                        <span className="hidden print:inline-block font-semibold">
                          {challanDiscountPercent > 0 ? `(${challanDiscountPercent}%)` : ''}
                        </span>
                        <span>=</span>
                      </div>
                    </td>
                    <td className="py-1 px-2 text-right font-semibold text-black whitespace-nowrap">
                      {calculatedDiscountAmount > 0 ? `-${Number(calculatedDiscountAmount).toLocaleString('en-IN')}/-` : '0/-'}
                    </td>
                    <td className="no-print"></td>
                  </tr>

                  {/* Grand Total */}
                  <tr className="border-t border-black font-extrabold bill-grand-total">
                    <td colSpan={5} className="py-1 px-2 text-right border-r border-black font-black whitespace-nowrap">
                      Total =
                    </td>
                    <td className="py-1 px-2 text-right text-black font-black whitespace-nowrap">
                      {netAmount ? `${Number(netAmount).toLocaleString('en-IN')}/-` : '0/-'}
                    </td>
                    <td className="no-print"></td>
                  </tr>

                  {/* Advance Paid (if any or input on screen) */}
                  <tr className={`border-t border-black font-semibold ${challanAdvanceAmount === 0 ? 'no-print' : ''}`}>
                    <td colSpan={5} className="py-0.5 px-2 text-right border-r border-black font-semibold whitespace-nowrap">
                      <div className="flex items-center justify-end space-x-2">
                        <span>Advance Paid =</span>
                        <input
                          ref={advanceAmountInputRef}
                          type="number"
                          min="0"
                          step="any"
                          value={challanAdvanceAmount === 0 ? '' : challanAdvanceAmount}
                          onChange={(e) => setChallanAdvanceAmount(Number(e.target.value) || 0)}
                          placeholder="0"
                          className="w-20 px-1 py-0.5 border border-slate-300 rounded text-right text-xs font-bold no-print"
                        />
                      </div>
                    </td>
                    <td className="py-0.5 px-2 text-right font-semibold text-black whitespace-nowrap">
                      {challanAdvanceAmount > 0 ? `${Number(challanAdvanceAmount).toLocaleString('en-IN')}/-` : '0/-'}
                    </td>
                    <td className="no-print"></td>
                  </tr>

                  {/* Due Balance */}
                  <tr className="border-t border-black font-bold">
                    <td colSpan={5} className="py-0.5 px-2 text-right border-r border-black font-bold text-rose-900 whitespace-nowrap">
                      Due Balance =
                    </td>
                    <td className="py-0.5 px-2 text-right font-bold text-rose-900 whitespace-nowrap">
                      {Number(dueBalance).toLocaleString('en-IN')}/-
                    </td>
                    <td className="no-print"></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* In Word Row */}
            <div className="pt-2 text-black flex items-center space-x-2 flex-none text-[13px]">
              <span className="font-semibold text-black">In Word:</span>
              <span className="font-bold text-black">{inWords}</span>
            </div>

            {/* Remarks (Screen note) */}
            <div className="pt-1 no-print">
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Optional delivery notes / vehicle / gate remarks..."
                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700 font-medium"
              />
            </div>

            {/* Clearance space before Signatures: min 5 lines normally, 3 lines when many items */}
            <div
              className={`${
                formLines.filter((l) => l.itemDescription?.trim() || Number(l.coilQty) > 0).length >= 10
                  ? 'min-h-[42px] h-[42px]'
                  : 'min-h-[75px] h-[75px]'
              } flex-none w-full`}
              aria-hidden="true"
            />

            {/* 4 Footer Signatures */}
            <div className="grid grid-cols-4 gap-4 pb-1 text-center text-xs font-semibold text-black">
              <div className="border-t border-dotted border-black pt-1">
                Receiver's Signature
              </div>
              <div className="border-t border-dotted border-black pt-1">
                Prepared By
              </div>
              <div className="border-t border-dotted border-black pt-1">
                Check By
              </div>
              <div className="border-t border-dotted border-black pt-1">
                Approved By
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-[#0b2334]/85 backdrop-blur-xl rounded-xl border border-cyan-500/25 no-print text-white shadow-lg mt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase text-cyan-200/80 mr-1">Pad Mode:</span>
          <div className="inline-flex rounded-lg border border-cyan-500/25 p-0.5 bg-[#061520] shadow-xs text-xs font-semibold">
            <button
              type="button"
              onClick={() => setPadHeaderMode('plain')}
              className={`px-3 py-1 rounded-md cursor-pointer transition-all ${
                padHeaderMode === 'plain'
                  ? 'bg-cyan-400 text-slate-950 font-black shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-[#0e2a3d]'
              }`}
              title="Print on standard plain blank A4 paper with full company logo and address"
            >
              📄 Plain Paper
            </button>
            <button
              type="button"
              onClick={() => setPadHeaderMode('hide_logo')}
              className={`px-3 py-1 rounded-md cursor-pointer transition-all ${
                padHeaderMode === 'hide_logo'
                  ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-[#0e2a3d]'
              }`}
              title="📜 Pad Mode: Hide top Logo & POLY CABLES title only (keep address lines)"
            >
              📜 Pad (Hide Logo)
            </button>
            <button
              type="button"
              onClick={() => setPadHeaderMode('hide_all')}
              className={`px-3 py-1 rounded-md cursor-pointer transition-all ${
                padHeaderMode === 'hide_all'
                  ? 'bg-rose-500 text-white font-black shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-[#0e2a3d]'
              }`}
              title="📑 Pad Mode: Hide complete company header (Logo + Title + Address) for pre-printed pad"
            >
              📑 Pad (Hide All)
            </button>
          </div>

          {onOpenSlipPad && (
            <button
              type="button"
              onClick={onOpenSlipPad}
              className="px-3 py-1 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/30 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer transition-all"
              title="Switch to 8.5 x 5.5 inch Memo Slip Pad"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-300" />
              <span>📑 Slip Pad (8.5" × 5.5")</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-[#061520] rounded-lg p-0.5 border border-cyan-500/25 space-x-1 text-xs">
            {(['80%', '100%', '115%'] as const).map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setZoomLevel(z)}
                className={`px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                  zoomLevel === z ? 'bg-[#0e2d42] text-cyan-200 border border-cyan-400/50' : 'text-slate-300 hover:bg-[#0e2a3d]'
                }`}
              >
                {z}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onClear}
            className="px-3 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 text-xs font-bold rounded-lg border border-cyan-500/25 flex items-center space-x-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>

          <button
            type="button"
            onClick={(e) => onSave(e)}
            className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black rounded-lg shadow-sm flex items-center space-x-1.5 cursor-pointer transition-all"
          >
            <Check className="w-4 h-4" />
            <span>{isEditing ? 'Update Challan' : 'Save Challan'}</span>
          </button>

          <button
            type="button"
            onClick={() => onSave(undefined, true)}
            className="px-4 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-black rounded-lg shadow-sm flex items-center space-x-1.5 cursor-pointer transition-all"
            title="Save Challan and open print preview"
          >
            <Printer className="w-4 h-4" />
            <span>Save & Print</span>
          </button>
        </div>
      </div>
    </div>
  );
};
