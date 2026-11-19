import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Party, StoredBill, CollectionMR, StockReturnChallan, CompanyDetails, BankDeposit, BranchLocation } from '../types';
import { defaultBranches } from '../data/defaultData';
import { cleanBranchName, partyMatchesBranch, billMatchesBranch, normalizeBranchId } from '../utils/branchAccess';
import { Building2, Search, Calendar, Printer, DollarSign, Wallet, FileText, ArrowUpRight, ArrowDownLeft, RotateCcw, User, Phone, MapPin, BadgeCheck, ChevronDown, Check, X, Mail, ArrowLeft, ExternalLink } from 'lucide-react';
import { formatDateDDMMYY, parseDateToISO, getTodayISO, getLastDateOfYearFromDate } from '../utils/dateUtils';
import { EmailSenderModal } from './EmailSenderModal';
import { BillPrintPreviewModal } from './BillPrintPreviewModal';
import { PolyCablesLogo } from './PolyCablesLogo';
import { SalesCenterSearchFilter } from './SalesCenterSearchFilter';
import { DateInputWithPicker } from './DateInputWithPicker';

interface CustomerLedgerProps {
  parties: Party[];
  storedBills: StoredBill[];
  collections: CollectionMR[];
  bankDeposits?: BankDeposit[];
  stockReturns?: StockReturnChallan[];
  company: CompanyDetails;
  branches?: BranchLocation[];
  selectedPartyId?: string;
  onBack?: () => void;
  onClose?: () => void;
}

export const CustomerLedger: React.FC<CustomerLedgerProps> = ({
  parties,
  storedBills,
  collections,
  bankDeposits = [],
  stockReturns = [],
  company,
  branches = defaultBranches,
  selectedPartyId,
  onBack,
  onClose
}) => {
  const [chosenPartyId, setChosenPartyId] = useState<string>(selectedPartyId || '');
  const [selectedPartyName, setSelectedPartyName] = useState<string>(() => {
    if (selectedPartyId) {
      const p = parties.find((item) => item.id === selectedPartyId);
      if (p) return p.name;
    }
    return parties[0]?.name || '';
  });

  const [partySearchQuery, setPartySearchQuery] = useState('');
  const [isPartyDropdownOpen, setIsPartyDropdownOpen] = useState(false);
  const [partyHighlightIdx, setPartyHighlightIdx] = useState(0);
  const [isShowingAllParties, setIsShowingAllParties] = useState(false);

  const [startDate, setStartDate] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-01-01`;
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${mm}-${dd}`;
  });
  const [selectedSalesCenter, setSelectedSalesCenter] = useState<string>(() => {
    const initialBranches = branches && branches.length > 0 ? branches : defaultBranches;
    return initialBranches.length === 1 ? initialBranches[0].name : 'All';
  });
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedBillForPreview, setSelectedBillForPreview] = useState<StoredBill | null>(null);

  const printRef = useRef<HTMLDivElement>(null);
  const fromInputRef = useRef<HTMLInputElement>(null);
  const toInputRef = useRef<HTMLInputElement>(null);
  const partyDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPartyDropdownOpen || !partyDropdownRef.current) return;
    const el = partyDropdownRef.current.querySelector('[data-ledger-party-highlighted="true"]') as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [partyHighlightIdx, isPartyDropdownOpen]);

  const effectiveBranches = branches && branches.length > 0 ? branches : defaultBranches;
  const currentBranchObj = useMemo(() => {
    if (!selectedSalesCenter || selectedSalesCenter === 'All') return null;
    const target = cleanBranchName(selectedSalesCenter).toLowerCase().trim();
    return (
      effectiveBranches.find(
        (b) =>
          b.name.toLowerCase().trim() === selectedSalesCenter.toLowerCase().trim() ||
          cleanBranchName(b.name).toLowerCase().trim() === target ||
          b.id.toLowerCase() === selectedSalesCenter.toLowerCase()
      ) || null
    );
  }, [selectedSalesCenter, effectiveBranches]);

  const activeCenterName = useMemo(() => {
    if (!selectedSalesCenter || selectedSalesCenter === 'All') return 'All Sales Centers';
    return currentBranchObj?.name || selectedSalesCenter;
  }, [selectedSalesCenter, currentBranchObj]);

  const activeCenterAddress = useMemo(() => {
    if (!selectedSalesCenter || selectedSalesCenter === 'All') {
      return '';
    }
    return currentBranchObj?.address || company?.address || 'Holding No. 392, Shop No. 3, Sanjoy Smrity Market, Raypara, Madhupur, Tangail.';
  }, [selectedSalesCenter, currentBranchObj, company?.address]);

  const activeCenterPhone = useMemo(() => {
    if (!selectedSalesCenter || selectedSalesCenter === 'All') {
      return '';
    }
    return currentBranchObj?.phone || currentBranchObj?.inChargePhone || company?.phone || '01713-434290';
  }, [selectedSalesCenter, currentBranchObj, company?.phone]);

  // Close party dropdown on click/touch outside or Escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest('.ledger-party-container')) {
        setIsPartyDropdownOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPartyDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const salesCenterParties = useMemo(() => {
    if (!selectedSalesCenter || selectedSalesCenter === 'All') {
      return parties;
    }
    const target = cleanBranchName(selectedSalesCenter).toLowerCase().trim();
    return parties.filter((p) => partyMatchesBranch(p, selectedSalesCenter, branches));
  }, [parties, selectedSalesCenter, branches]);

  const filteredParties = useMemo(() => {
    if (isShowingAllParties || !partySearchQuery.trim()) {
      return salesCenterParties;
    }
    const q = partySearchQuery.toLowerCase().trim();
    return salesCenterParties.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.address && p.address.toLowerCase().includes(q)) ||
        (p.phone && p.phone.toLowerCase().includes(q))
    );
  }, [salesCenterParties, partySearchQuery, isShowingAllParties]);

  useEffect(() => {
    if (selectedSalesCenter && selectedSalesCenter !== 'All') {
      const existsInCenter = salesCenterParties.some(
        (p) => p.name.trim().toLowerCase() === selectedPartyName.trim().toLowerCase()
      );
      if (!existsInCenter) {
        setSelectedPartyName(salesCenterParties[0]?.name || '');
      }
    } else if (!selectedPartyName && salesCenterParties.length > 0) {
      setSelectedPartyName(salesCenterParties[0].name);
    }
  }, [selectedSalesCenter, salesCenterParties, selectedPartyName]);

  useEffect(() => {
    if (selectedPartyId) {
      const p = parties.find((item) => item.id === selectedPartyId);
      if (p) {
        setChosenPartyId(p.id);
        setSelectedPartyName(p.name);
      }
    }
  }, [selectedPartyId, parties]);

  // Active party object (prefer exact selected/chosen party ID when multiple parties share the same name)
  const effectivePartyId = selectedPartyId || chosenPartyId;
  const activeParty =
    (effectivePartyId ? salesCenterParties.find((p) => p.id === effectivePartyId) : undefined) ||
    salesCenterParties.find(
      (p) => p.name.trim().toLowerCase() === selectedPartyName.trim().toLowerCase()
    );

  const partyNameNorm = selectedPartyName.trim().toLowerCase();
  const hasMultiplePartiesWithSameName =
    parties.filter((p) => (p.name || '').trim().toLowerCase() === partyNameNorm).length > 1;
  const activePartySpCode = (activeParty?.salesmanCode || '').trim().toLowerCase();
  const activePartySpName = (activeParty?.salespersonName || '').trim().toLowerCase();
  const activePartyBranchScope =
    selectedSalesCenter && selectedSalesCenter !== 'All'
      ? selectedSalesCenter
      : activeParty?.branchId || activeParty?.branchName || '';

  const matchesRecordSalesCenterScope = (brId?: string, brName?: string, partyId?: string, spCode?: string, spName?: string): boolean => {
    if (partyId && activeParty?.id) {
      return partyId === activeParty.id;
    }
    if (selectedSalesCenter && selectedSalesCenter !== 'All' && (brId || brName)) {
      const targetClean = cleanBranchName(selectedSalesCenter).toLowerCase().trim();
      const targetBid = currentBranchObj?.id ? normalizeBranchId(currentBranchObj.id) : '';
      const recBid = brId ? normalizeBranchId(brId) : '';
      const recBName = brName ? cleanBranchName(brName).toLowerCase().trim() : '';
      if (targetBid && recBid && recBid !== 'all') {
        if (recBid !== targetBid) return false;
      } else if (recBName && targetClean) {
        if (recBName !== targetClean && !recBName.includes(targetClean) && !targetClean.includes(recBName)) {
          return false;
        }
      }
    }
    if (hasMultiplePartiesWithSameName && activeParty) {
      const rSpCode = (spCode || '').trim().toLowerCase();
      const rSpName = (spName || '').trim().toLowerCase();
      if ((rSpCode || rSpName) && (activePartySpCode || activePartySpName)) {
        const spMatched = Boolean(
          (rSpCode && activePartySpCode && rSpCode === activePartySpCode) ||
          (rSpName && activePartySpName && rSpName === activePartySpName)
        );
        if (!spMatched) return false;
      }
    }
    return true;
  };

  // Helper currency formatter
  const formatAmount = (num: number) => num.toLocaleString('en-IN');

  // Gather transactions for this party
  interface LedgerEntry {
    id: string;
    date: string;
    type: 'invoice' | 'collection' | 'return';
    refNo: string;
    description: string;
    discountPercent?: number;
    paymentType?: string;
    debit: number; // Invoice amount
    credit: number; // Collection / Return amount
    storedBill?: StoredBill;
  }

  const rawEntries: LedgerEntry[] = [];

  // 1. Invoices / Bills (strictly scoped to active party's sales center / selected sales center)
  storedBills.forEach((b) => {
    const bPartyId = (b as any).partyId || (b.header as any)?.partyId;
    const pName = b.header?.partyName || '';
    if ((bPartyId && activeParty?.id && bPartyId === activeParty.id) || pName.trim().toLowerCase() === partyNameNorm) {
      if (activePartyBranchScope && !billMatchesBranch(b, activePartyBranchScope, branches, [], parties)) {
        return;
      }
      if (
        !matchesRecordSalesCenterScope(
          b.branchId || b.header?.branchId,
          b.branchName || b.header?.branchName,
          bPartyId,
          b.header?.salesmanCode,
          b.header?.salespersonName
        )
      ) {
        return;
      }
      const bNo = (b.header?.billNo || '').trim();
      const hasBillNo = bNo !== '' && bNo !== '-' && bNo !== 'N/A';
      rawEntries.push({
        id: `bill-${b.id}`,
        date: b.header?.date || '',
        type: 'invoice',
        refNo: hasBillNo ? bNo : 'Cash',
        description: b.header?.isOfficeBill ? 'Sales Invoice (Office Direct)' : 'Sales Invoice (Showroom)',
        discountPercent: b.header?.discountPercent || 0,
        debit: b.grandTotal || 0,
        credit: 0,
        storedBill: b
      });
    }
  });

  // 2. Collections (Money Receipts)
  collections.forEach((c) => {
    const isSettlement = c.isYearClosingCollection ||
      (c.remarks && (c.remarks.includes('Year-End Settlement') || c.remarks.includes('Year-End Closing') || c.remarks.includes('Closing Settlement') || /^FY\s*20\d\d/i.test(c.remarks.trim()))) ||
      (c.mrNo && (c.mrNo.startsWith('MR-CLOSE') || c.mrNo.startsWith('YE-Close')));
    if (isSettlement) return;

    const cPartyId = (c as any).partyId;
    const pName = c.partyName || '';
    if ((cPartyId && activeParty?.id && cPartyId === activeParty.id) || pName.trim().toLowerCase() === partyNameNorm) {
      if (
        !matchesRecordSalesCenterScope(
          c.branchId,
          c.branchName || c.entityName,
          cPartyId,
          (c as any).salesmanCode,
          (c as any).salespersonName
        )
      ) {
        return;
      }
      const isCheque = c.paymentType === 'cheque' || (c.paymentType !== 'cash' && Boolean((c.chequeNo && c.chequeNo.trim()) || (c.bankName && c.bankName.trim() && !c.bankName.toLowerCase().includes('cash'))));
      const payLabel = isCheque ? `Cheque Collection (${c.bankName || 'Bank'})` : 'Cash Collection';
      rawEntries.push({
        id: `col-${c.id}`,
        date: c.date,
        type: 'collection',
        refNo: isCheque ? 'Cheque' : 'Cash',
        description: payLabel,
        paymentType: c.paymentType,
        debit: 0,
        credit: c.amount || 0
      });
    }
  });

  // 3. Stock Returns (Party Returns)
  stockReturns.forEach((r) => {
    const rPartyId = (r as any).partyId;
    const pName = r.partyName || (r as any).entityName || '';
    const isPartyReturn = r.returnType === 'party_return' || (r as any).type === 'party_return';
    if (isPartyReturn && ((rPartyId && activeParty?.id && rPartyId === activeParty.id) || pName.trim().toLowerCase() === partyNameNorm)) {
      if (
        !matchesRecordSalesCenterScope(
          (r as any).branchId,
          (r as any).branchName || (r as any).salesCenter,
          rPartyId,
          (r as any).salesmanCode,
          (r as any).salespersonName
        )
      ) {
        return;
      }
      const returnAmt = r.totalAmount || (r as any).totalRefundAmount || 0;
      rawEntries.push({
        id: `ret-${r.id}`,
        date: r.date,
        type: 'return',
        refNo: r.returnNo || (r.challanNo ? `Return #${r.challanNo}` : 'Return Challan'),
        description: 'Goods Return Credit',
        debit: 0,
        credit: returnAmt
      });
    }
  });

  // 4. Bank Deposits / H/O Deposits linked to this party
  bankDeposits?.forEach((d) => {
    const dPartyId = (d as any).partyId;
    const pName = (d.customerName || d.partyName || '').trim().toLowerCase();
    if ((dPartyId && activeParty?.id && dPartyId === activeParty.id) || pName === partyNameNorm) {
      if (
        !matchesRecordSalesCenterScope(
          (d as any).branchId,
          (d as any).branchName || (d as any).entityName,
          dPartyId,
          (d as any).salesmanCode,
          (d as any).salespersonName
        )
      ) {
        return;
      }
      const alreadyLinked = collections.some(
        (c) => (c.bankDepositId === d.id || d.collectionMrId === c.id) && (c.partyName || '').trim().toLowerCase() === partyNameNorm
      );
      if (!alreadyLinked) {
        rawEntries.push({
          id: `dep-${d.id}`,
          date: d.depositDate || d.date,
          type: 'collection',
          refNo: d.displayTag || d.bankShortCode || 'H/O',
          description: d.remarks || `Deposit (${d.displayTag || d.bankName || 'H/O'})`,
          paymentType: 'cash',
          debit: 0,
          credit: d.amount || 0
        });
      }
    }
  });

  // Filter entries by date range & search keyword
  const startIso = parseDateToISO(startDate);
  const endIso = parseDateToISO(endDate);

  const filteredEntries = rawEntries
    .filter((e) => {
      const eIso = parseDateToISO(e.date);
      const matchesDate = !startIso || !endIso || !eIso || (eIso >= startIso && eIso <= endIso);
      const matchesSearch =
        !searchTerm ||
        e.refNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.description.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesDate && matchesSearch;
    })
    .sort((a, b) => {
      const aIso = parseDateToISO(a.date) || a.date;
      const bIso = parseDateToISO(b.date) || b.date;
      return aIso.localeCompare(bIso);
    });

  // Calculate prior Opening Balance before startDate (previous date closing balance)
  let priorDebits = 0;
  let priorCredits = 0;
  rawEntries.forEach((e) => {
    const eIso = parseDateToISO(e.date);
    if (startIso && eIso && eIso < startIso) {
      priorDebits += e.debit;
      priorCredits += e.credit;
    }
  });

  // Opening Balance as of startDate
  const customerOpeningBalance = Number(activeParty?.openingBalance || 0) + priorDebits - priorCredits;

  // Compute Running Balance & Totals starting with Opening Balance
  let cumulativeBalance = customerOpeningBalance;
  const ledgerWithBalance = filteredEntries.map((e) => {
    cumulativeBalance += e.debit - e.credit;
    return {
      ...e,
      runningBalance: cumulativeBalance
    };
  });

  const totalDebitSum = filteredEntries.reduce((sum, e) => sum + e.debit, 0);
  const totalCreditSum = filteredEntries.reduce((sum, e) => sum + e.credit, 0);
  const closingBalance = customerOpeningBalance + totalDebitSum - totalCreditSum;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* HEADER BAR */}
      <div className="cyber-glass-card text-white p-5 rounded-2xl flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <div className="flex items-center space-x-2">
            <User className="w-6 h-6 text-cyan-400" />
            <h2 className="text-xl font-extrabold tracking-tight">Customer Ledger / Party Statement</h2>
          </div>
          <p className="text-xs text-slate-300 mt-0.5">
            Poly Cables account statement showing Bill Amount, Collections, Running Balance & Discount Remarks
          </p>
        </div>
      </div>

      {/* FILTER & SELECTOR CONTROLS */}
      <div className="cyber-glass-card p-3 sm:p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 no-print text-white">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
          {/* Customer / Party Dynamic Search Box */}
          <div className="relative ledger-party-container min-w-0 w-full sm:w-auto sm:min-w-[240px] sm:flex-1 sm:max-w-md">
            <label className="text-[11px] font-bold text-cyan-200 block mb-1">Select Customer / Party ({salesCenterParties.length}):</label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={isPartyDropdownOpen ? partySearchQuery : selectedPartyName}
                onChange={(e) => {
                  const val = e.target.value;
                  setPartySearchQuery(val);
                  setIsShowingAllParties(false);
                  setIsPartyDropdownOpen(true);
                  setPartyHighlightIdx(0);
                }}
                onFocus={() => {
                  setPartySearchQuery('');
                  setIsShowingAllParties(true);
                  setIsPartyDropdownOpen(true);
                  setPartyHighlightIdx(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isPartyDropdownOpen) {
                      setIsPartyDropdownOpen(true);
                      setPartyHighlightIdx(0);
                    } else if (filteredParties.length > 0) {
                      setPartyHighlightIdx((prev) => (prev + 1) % filteredParties.length);
                    }
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isPartyDropdownOpen) {
                      setIsPartyDropdownOpen(true);
                      setPartyHighlightIdx(0);
                    } else if (filteredParties.length > 0) {
                      setPartyHighlightIdx((prev) => (prev - 1 + filteredParties.length) % filteredParties.length);
                    }
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    const sel = filteredParties[partyHighlightIdx] || filteredParties[0];
                    if (isPartyDropdownOpen && sel) {
                      setChosenPartyId(sel.id);
                      setSelectedPartyName(sel.name);
                      setPartySearchQuery('');
                      setIsPartyDropdownOpen(false);
                      setIsShowingAllParties(false);
                    }
                  } else if (e.key === 'Escape') {
                    setIsPartyDropdownOpen(false);
                  }
                }}
                placeholder="Search party by name, address, phone..."
                className="w-full pl-3 pr-14 py-2 border border-cyan-500/30 rounded-lg text-xs font-extrabold bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 shadow-xs focus:outline-none"
              />
              <div className="absolute right-1.5 flex items-center space-x-0.5">
                {selectedPartyName && (
                  <button
                    type="button"
                    onClick={() => {
                      setPartySearchQuery('');
                      setIsShowingAllParties(true);
                      setIsPartyDropdownOpen(true);
                    }}
                    className="p-1 text-slate-400 hover:text-rose-400 rounded cursor-pointer transition-colors"
                    title="Change party"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsPartyDropdownOpen(!isPartyDropdownOpen);
                    setIsShowingAllParties(true);
                    setPartySearchQuery('');
                    setPartyHighlightIdx(0);
                  }}
                  className="p-1 text-slate-400 hover:text-cyan-300 rounded cursor-pointer transition-colors"
                  title="Show all parties"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Dropdown Options */}
            {isPartyDropdownOpen && (
              <div
                ref={partyDropdownRef}
                className="absolute left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto bg-[#091e2c]/95 backdrop-blur-2xl border border-cyan-400/35 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] z-50 text-xs divide-y divide-cyan-500/15"
              >
                <div className="p-2 bg-[#0c2638] font-bold text-[10px] text-cyan-200 uppercase flex justify-between items-center sticky top-0 z-10 border-b border-cyan-500/25">
                  <span>Customer Search ({filteredParties.length} found)</span>
                  <button
                    type="button"
                    onClick={() => setIsPartyDropdownOpen(false)}
                    className="text-slate-300 hover:text-rose-400 font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                {filteredParties.length === 0 ? (
                  <div className="p-3 text-slate-400 text-center italic">No matching customer found.</div>
                ) : (
                  filteredParties.map((p, idx) => {
                    const isSelected = activeParty ? activeParty.id === p.id : selectedPartyName.toLowerCase() === p.name.toLowerCase();
                    const isHighlighted = partyHighlightIdx === idx;
                    return (
                      <button
                        key={p.id ? `${p.id}-${idx}` : `party-${idx}`}
                        type="button"
                        data-ledger-party-highlighted={isHighlighted ? 'true' : 'false'}
                        onClick={() => {
                          setChosenPartyId(p.id);
                          setSelectedPartyName(p.name);
                          setPartySearchQuery('');
                          setIsPartyDropdownOpen(false);
                          setIsShowingAllParties(false);
                        }}
                        onMouseEnter={() => setPartyHighlightIdx(idx)}
                        className={`w-full text-left p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                          isSelected
                            ? (isHighlighted
                                ? 'bg-emerald-500/30 text-emerald-100 font-extrabold border-l-4 border-cyan-400 ring-1 ring-inset ring-cyan-400/50'
                                : 'bg-emerald-500/20 text-emerald-200 font-extrabold border-l-4 border-emerald-400')
                            : (isHighlighted ? 'bg-cyan-500/20 text-white font-bold border-l-4 border-cyan-400' : 'hover:bg-cyan-500/10 text-slate-200')
                        }`}
                      >
                        <div>
                          <div className="font-bold text-white flex items-center gap-1.5 flex-wrap">
                            <span>{p.name}</span>
                            {p.salespersonName && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-500/30">
                                {p.salespersonName}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {p.address || 'No address'} {p.phone ? `| Ph: ${p.phone}` : ''}
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-emerald-300 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Sales Center / Showroom Filter */}
          <div className="min-w-0 w-full sm:w-auto sm:min-w-[190px]">
            <label className="text-[11px] font-bold text-cyan-200 block mb-1">Sales Center:</label>
            <SalesCenterSearchFilter
              value={selectedSalesCenter}
              onChange={(newVal) => setSelectedSalesCenter(newVal)}
              options={effectiveBranches.map((b) => ({ id: b.name, name: b.name, label: b.name, address: b.address }))}
              isLocked={effectiveBranches.length <= 1}
              includeAllOption={effectiveBranches.length > 1}
              allOptionLabel={`All Sales Centers (${effectiveBranches.length})`}
              allOptionValue="All"
              label=""
              theme="dark"
              size="sm"
              widthClass="w-full"
            />
          </div>

          {/* Date Range Selector */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div>
              <label className="text-[11px] font-bold text-cyan-200 block mb-1">From Date:</label>
              <DateInputWithPicker
                inputRef={fromInputRef}
                value={startDate}
                valueFormat="iso"
                onChange={(val) => {
                  setStartDate(val);
                  if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
                    const yr = val.slice(0, 4);
                    const now = new Date();
                    if (yr === String(now.getFullYear())) {
                      const mm = String(now.getMonth() + 1).padStart(2, '0');
                      const dd = String(now.getDate()).padStart(2, '0');
                      setEndDate(`${yr}-${mm}-${dd}`);
                    } else if (yr && yr.length === 4) {
                      setEndDate(`${yr}-12-31`);
                    }
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    toInputRef.current?.focus();
                  }
                }}
                className="w-[110px] sm:w-[116px]"
                inputClassName="p-1.5 text-xs font-bold"
                title="Pick From Date (dd.mm.yy)"
              />
            </div>
            <span className="text-xs font-extrabold text-cyan-300/70 mt-5">to</span>
            <div>
              <label className="text-[11px] font-bold text-cyan-200 block mb-1">To Date:</label>
              <DateInputWithPicker
                inputRef={toInputRef}
                value={endDate}
                valueFormat="iso"
                onChange={(val) => setEndDate(val)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    fromInputRef.current?.focus();
                  } else if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
                className="w-[110px] sm:w-[116px]"
                inputClassName="p-1.5 text-xs font-bold"
                title="Pick To Date (dd.mm.yy)"
              />
            </div>
            <div className="flex items-center space-x-1 mt-0 sm:mt-5">
              <button
                type="button"
                onClick={() => {
                  setStartDate('2026-07-01');
                  setEndDate('2026-07-31');
                }}
                className="px-2 py-1 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 font-bold text-[10px] rounded border border-cyan-500/30 transition-colors cursor-pointer"
              >
                July 26
              </button>
              <button
                type="button"
                onClick={() => {
                  setStartDate('2026-01-01');
                  setEndDate(getTodayISO());
                }}
                className="px-2 py-1 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 font-bold text-[10px] rounded border border-cyan-500/30 transition-colors cursor-pointer"
              >
                All
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="w-full sm:flex-1 sm:min-w-[180px]">
            <label className="text-[11px] font-bold text-cyan-200 block mb-1">Search Entry / Ref:</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-cyan-400/80" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Bill #, MR #, Description..."
                className="w-full pl-8 pr-3 py-1.5 border border-cyan-500/30 rounded-lg text-xs font-medium bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* SUMMARY STATS TILES */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 no-print">
        <div className="cyber-glass-subcard text-white p-4 rounded-xl border border-amber-400/35">
          <div className="flex items-center justify-between">
            <span className="text-xs text-amber-200 font-bold uppercase">Opening Balance</span>
            <Wallet className="w-5 h-5 text-amber-300" />
          </div>
          <div className="text-xl font-black font-mono mt-2 text-amber-300">৳{formatAmount(customerOpeningBalance)}</div>
          <div className="text-[10px] text-amber-200/80 mt-1">Previous Customer Balance</div>
        </div>

        <div className="cyber-glass-subcard text-white p-4 rounded-xl border border-indigo-400/35">
          <div className="flex items-center justify-between">
            <span className="text-xs text-indigo-200 font-bold uppercase">Total Bill Amount</span>
            <ArrowUpRight className="w-5 h-5 text-indigo-300" />
          </div>
          <div className="text-xl font-black font-mono mt-2 text-white">৳{formatAmount(totalDebitSum)}</div>
          <div className="text-[10px] text-indigo-200/80 mt-1">Total Sales Billed to Party</div>
        </div>

        <div className="cyber-glass-subcard text-white p-4 rounded-xl border border-emerald-400/35">
          <div className="flex items-center justify-between">
            <span className="text-xs text-emerald-200 font-bold uppercase">Total Collection</span>
            <ArrowDownLeft className="w-5 h-5 text-emerald-300" />
          </div>
          <div className="text-xl font-black font-mono mt-2 text-emerald-300">৳{formatAmount(totalCreditSum)}</div>
          <div className="text-[10px] text-emerald-200/80 mt-1">Cash/Cheque Collections + Returns</div>
        </div>

        <div className="cyber-glass-subcard text-white p-4 rounded-xl border border-rose-400/35">
          <div className="flex items-center justify-between">
            <span className="text-xs text-rose-200 font-bold uppercase">Net Closing Balance</span>
            <DollarSign className="w-5 h-5 text-rose-300" />
          </div>
          <div className="text-xl font-black font-mono mt-2 text-amber-300">৳{formatAmount(closingBalance)}</div>
          <div className="text-[10px] text-rose-200/80 mt-1">Outstanding Balance Due</div>
        </div>
      </div>

      {/* PRINTABLE CUSTOMER LEDGER STATEMENT */}
      <div ref={printRef} className="print-paper-sheet bg-white p-3 sm:p-8 rounded-2xl shadow-xl border-none max-w-4xl mx-auto font-sans print:p-2 print:shadow-none print:border-none print:max-w-full print:w-full print:mx-auto">
        <div className="p-2 sm:p-5 bg-white space-y-4">
          {/* Company Header */}
          <div className="text-center border-b border-black pb-3">
            <div className="flex justify-center mb-1">
              <PolyCablesLogo size="xl" showSubtitle={true} subtitleText="IND. LTD." />
            </div>
            <h3 className="text-sm font-black text-black uppercase tracking-wider mt-1">
              {activeCenterName}
            </h3>
            {activeCenterAddress && (
              <p className="text-xs font-bold text-black mt-0.5">
                {activeCenterAddress}
              </p>
            )}
            {activeCenterPhone && (
              <p className="text-[11px] font-semibold text-black">
                Mob: {activeCenterPhone} | Email: {company.email}
              </p>
            )}
            <div className="text-sm font-black text-black uppercase tracking-wider mt-2 border-y border-black inline-block px-4 py-1">
              Customer Ledger / Party Account Statement
            </div>
          </div>

          {/* Customer / Party Information Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-3 sm:gap-4 text-xs text-black border-b border-black pb-3">
            <div className="space-y-1">
              <div className="flex items-center space-x-1 font-bold">
                <span className="w-24 text-slate-600">Party Name:</span>
                <span className="text-black text-sm uppercase">{selectedPartyName}</span>
              </div>
              <div className="flex items-center space-x-1 font-medium">
                <span className="w-24 text-slate-600">Address:</span>
                <span className="text-black">{activeParty?.address || 'Madhupur'}</span>
              </div>
            </div>

            <div className="space-y-1 text-left sm:text-right print:text-right">
              <div className="font-bold text-black">
                <span className="text-slate-600">Statement Period:</span> {formatDateDDMMYY(startDate)} to {formatDateDDMMYY(endDate)}
              </div>
              {customerOpeningBalance > 0 && (
                <div className="font-bold text-black">
                  <span className="text-slate-600">Opening Balance:</span> ৳{formatAmount(customerOpeningBalance)}
                </div>
              )}
              {activeParty?.salesmanCode && (
                <div className="font-semibold text-black">
                  <span className="text-slate-600">Salesman Code:</span> [{activeParty.salesmanCode}]
                </div>
              )}
            </div>
          </div>

          {/* Ledger Table */}
          <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[580px] text-xs text-black border-collapse border border-black">
            <thead>
              <tr className="border-b border-black bg-slate-100 font-extrabold uppercase text-[11px]">
                <th className="p-2 border-r border-black text-center w-10">SL</th>
                <th className="p-2 border-r border-black text-center w-20">Date</th>
                <th className="p-2 border-r border-black text-center w-28">Bill No.</th>
                <th className="p-2 border-r border-black text-right w-28">Bill Amount</th>
                <th className="p-2 border-r border-black text-right w-28">Collection</th>
                <th className="p-2 border-r border-black text-right w-28">Balance</th>
                <th className="p-2 text-center w-28">Remark</th>
              </tr>
            </thead>
            <tbody>
              {customerOpeningBalance > 0 && (
                <tr className="border-b border-slate-300 bg-amber-50/50 font-bold">
                  <td className="p-2 border-r border-black text-center font-mono text-slate-500">0</td>
                  <td className="p-2 border-r border-black text-center font-mono">{formatDateDDMMYY(startDate)}</td>
                  <td className="p-2 border-r border-black text-center font-mono text-slate-700">Opening Bal</td>
                  <td className="p-2 border-r border-black text-right font-mono">-</td>
                  <td className="p-2 border-r border-black text-right font-mono">-</td>
                  <td className="p-2 border-r border-black text-right font-mono font-black text-black">
                    {formatAmount(customerOpeningBalance)}
                  </td>
                  <td className="p-2 text-center text-slate-600 font-normal italic text-[11px]">Op. Balance</td>
                </tr>
              )}
              {ledgerWithBalance.length === 0 && customerOpeningBalance === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-500 italic">
                    No ledger transactions recorded for {selectedPartyName} in the selected date range.
                  </td>
                </tr>
              ) : (
                ledgerWithBalance.map((row, idx) => (
                  <tr key={row.id} className="border-b border-slate-300 hover:bg-slate-50">
                    <td className="p-2 border-r border-black text-center font-mono">{idx + 1}</td>
                    <td className="p-2 border-r border-black text-center font-mono">{formatDateDDMMYY(row.date)}</td>
                    <td className="p-2 border-r border-black text-center font-mono">
                      {row.type === 'invoice' && row.storedBill ? (
                        <button
                          type="button"
                          onClick={() => setSelectedBillForPreview(row.storedBill || null)}
                          className="font-bold text-indigo-700 hover:text-indigo-950 hover:underline cursor-pointer inline-flex items-center justify-center gap-1 group no-print"
                          title="Click to view & print full bill invoice"
                        >
                          <FileText className="w-3 h-3 text-indigo-500 group-hover:text-indigo-800" />
                          <span>{row.refNo}</span>
                        </button>
                      ) : (
                        <span className="font-bold">{row.refNo}</span>
                      )}
                      {/* For print layout, show plain text */}
                      {row.type === 'invoice' && row.storedBill && (
                        <span className="hidden print:inline font-bold">{row.refNo}</span>
                      )}
                    </td>
                    <td className="p-2 border-r border-black text-right font-bold font-mono">
                      {row.debit > 0 ? formatAmount(row.debit) : '-'}
                    </td>
                    <td className="p-2 border-r border-black text-right font-bold font-mono text-emerald-800">
                      {row.credit > 0 ? formatAmount(row.credit) : '-'}
                    </td>
                    <td className="p-2 border-r border-black text-right font-black font-mono text-black">
                      {formatAmount(row.runningBalance)}
                    </td>
                    <td className="p-2 text-center font-semibold text-slate-800 font-mono">
                      {row.type === 'invoice' && row.discountPercent && row.discountPercent > 0
                        ? `${row.discountPercent}%`
                        : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black font-black bg-slate-100 text-xs">
                <td colSpan={3} className="p-2 text-right uppercase border-r border-black">
                  Total Statement Summary=
                </td>
                <td className="p-2 text-right font-mono border-r border-black">
                  ৳{formatAmount(totalDebitSum)}
                </td>
                <td className="p-2 text-right font-mono border-r border-black text-emerald-900">
                  ৳{formatAmount(totalCreditSum)}
                </td>
                <td className="p-2 text-right font-mono border-r border-black text-black text-sm">
                  ৳{formatAmount(closingBalance)}
                </td>
                <td className="p-2 text-center">-</td>
              </tr>
            </tfoot>
          </table>
          </div>

          {/* Signature & Footer */}
          <div className="pt-8 sm:pt-12 flex flex-wrap justify-between items-end gap-4 text-xs font-bold text-black">
            <div className="text-center border-t border-black w-32 sm:w-40 pt-1">
              Customer Signature
            </div>
            <div className="text-center border-t border-black w-32 sm:w-40 pt-1">
              Authorized Signature
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Footer Bar */}
      <div className="cyber-glass-card p-3.5 rounded-2xl flex flex-wrap items-center justify-end gap-2 no-print">
        <button
          type="button"
          onClick={() => setShowEmailModal(true)}
          className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/40 text-xs font-extrabold rounded-xl shadow-md flex items-center space-x-2 cursor-pointer transition-transform active:scale-95"
          title="Send this statement directly via email from browser"
        >
          <Mail className="w-4 h-4 text-cyan-300" />
          <span>Send Email</span>
        </button>

        <button
          type="button"
          onClick={handlePrint}
          className="px-5 py-2 bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-black rounded-xl shadow-[0_0_18px_rgba(16,185,129,0.28)] flex items-center space-x-2 cursor-pointer transition-transform active:scale-95"
        >
          <Printer className="w-4 h-4" />
          <span>Print Customer Ledger</span>
        </button>
      </div>

      {showEmailModal && (
        <EmailSenderModal
          isOpen={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          title={`Email Account Statement: ${selectedPartyName}`}
          defaultRecipient=""
          salesCenterName={activeCenterName !== 'All Sales Centers' ? cleanBranchName(activeCenterName) : cleanBranchName(company?.branchName || 'Madhupur Sales Center')}
          defaultSubject={`Account Statement / Customer Ledger - ${selectedPartyName} (${activeCenterName !== 'All Sales Centers' ? cleanBranchName(activeCenterName) : cleanBranchName(company?.branchName || 'Madhupur Sales Center')})`}
          defaultMessage={`Dear ${selectedPartyName},\n\nPlease find attached the official Customer Ledger / Account Statement for the period ${formatDateDDMMYY(startDate)} to ${formatDateDDMMYY(endDate)}.\n\n• Customer: ${selectedPartyName}\n• Opening Balance: ৳${formatAmount(customerOpeningBalance)}\n• Total Billed: ৳${formatAmount(totalDebitSum)}\n• Total Collections/Returns: ৳${formatAmount(totalCreditSum)}\n• Closing Outstanding Balance: ৳${formatAmount(closingBalance)}\n\nSales Center: ${activeCenterName !== 'All Sales Centers' ? cleanBranchName(activeCenterName) : cleanBranchName(company?.branchName || 'Madhupur Sales Center')}\nAddress: ${activeCenterAddress || company?.address || 'Holding No. 392, Shop No. 3, Sanjoy Smrity Market, Raypara, Madhupur, Tangail.'}\nHelpline: 01713-434290 | info@polycables.com.bd\n\nThank you for choosing ${activeCenterName !== 'All Sales Centers' ? cleanBranchName(activeCenterName) : cleanBranchName(company?.branchName || 'Madhupur Sales Center')}.`}
          parties={parties}
          company={company}
          documentType="ledger"
        />
      )}

      {/* Full Stored Bill Invoice Print & Preview Modal */}
      {selectedBillForPreview && (
        <BillPrintPreviewModal
          isOpen={Boolean(selectedBillForPreview)}
          bill={selectedBillForPreview}
          company={company}
          onClose={() => setSelectedBillForPreview(null)}
        />
      )}
    </div>
  );
};

