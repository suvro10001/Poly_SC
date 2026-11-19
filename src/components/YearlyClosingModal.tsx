import React, { useState, useMemo, useEffect } from 'react';
import {
  StoredBill,
  CollectionMR,
  DeliveryChallan,
  Party,
  Salesperson,
  CompanyDetails,
  FinancialYearClosing,
  AuthUser,
  YearlyDiscountTierSetting,
  SpecialDiscountItem,
  CustomerClosingBalance
} from '../types';
import { formatDateDDMMYY, parseDateToISO, getTodayDDMMYY } from '../utils/dateUtils';
import { DateInputWithPicker } from './DateInputWithPicker';
import * as XLSX from 'xlsx';
import {
  Lock,
  Unlock,
  CheckCircle2,
  Calendar,
  DollarSign,
  Building2,
  Users,
  Award,
  Sparkles,
  Printer,
  Download,
  AlertTriangle,
  RotateCcw,
  X,
  Plus,
  Trash2,
  FileSpreadsheet,
  Check,
  Search,
  Sliders,
  TrendingUp,
  Percent,
  Receipt,
  FileText,
  ShieldCheck,
  ChevronRight,
  Eye,
  BadgeCheck,
  Package,
  Layers,
  ArrowRight,
  CheckSquare,
  Square,
  CreditCard,
  CheckCheck,
  Edit3,
  Save,
  HelpCircle,
  Clock
} from 'lucide-react';

interface YearlyClosingModalProps {
  isOpen: boolean;
  defaultTab?: 'single_party' | 'history';
  selectedParty?: Party | null;
  storedBills: StoredBill[];
  collections: CollectionMR[];
  deliveryChallans?: DeliveryChallan[];
  parties: Party[];
  salespersons: Salesperson[];
  company: CompanyDetails;
  currentUser?: AuthUser | null;
  financialYearClosings?: FinancialYearClosing[];
  onSaveClosing: (closing: FinancialYearClosing, updatedParties: Party[]) => void;
  onReopenClosing?: (closingId: string) => void;
  onDeleteClosing?: (closingId: string) => void;
  onUpdateClosing?: (updatedClosing: FinancialYearClosing) => void;
  onClose: () => void;
}

export const YearlyClosingModal: React.FC<YearlyClosingModalProps> = ({
  isOpen,
  defaultTab,
  selectedParty,
  storedBills,
  collections,
  deliveryChallans = [],
  parties,
  salespersons,
  company,
  currentUser,
  financialYearClosings = [],
  onSaveClosing,
  onReopenClosing,
  onDeleteClosing,
  onUpdateClosing,
  onClose
}) => {
  const [fiscalYear, setFiscalYear] = useState<string>('FY 2026');
  const [closingTitle, setClosingTitle] = useState<string>('FY 2026 Annual Closing & Incentive Settlement');

  // Dates formatted like dd.mm.yy
  const [startDateStr, setStartDateStr] = useState<string>('01.01.26');
  const [endDateStr, setEndDateStr] = useState<string>('31.12.26');

  // Convert dd.mm.yy to ISO for strict comparison
  const startDate = useMemo(() => parseDateToISO(startDateStr) || '2026-01-01', [startDateStr]);
  const endDate = useMemo(() => parseDateToISO(endDateStr) || '2026-12-31', [endDateStr]);

  // Selected Target Party (defaults to selectedParty if provided, or first party)
  const [targetPartyId, setTargetPartyId] = useState<string>(() => {
    if (selectedParty?.id) return selectedParty.id;
    return parties.length > 0 ? parties[0].id : '';
  });

  const [activeTab, setActiveTab] = useState<'single_party' | 'history'>('single_party');
  const [selectedHistoryFY, setSelectedHistoryFY] = useState<string | null>(null);

  // Available FY years list (e.g. FY-2025, FY-2026, FY-2027)
  const availableFYYears = useMemo(() => {
    const defaultYears = ['FY-2025', 'FY-2026', 'FY-2027'];
    const fromClosings = (financialYearClosings || []).map((c) => {
      const raw = (c.financialYear || '').trim();
      if (!raw) return 'FY-2026';
      if (raw.toLowerCase().startsWith('fy')) {
        return raw.replace(/fy\s*[-_]?\s*/i, 'FY-');
      }
      return `FY-${raw}`;
    });
    const merged = Array.from(new Set([...defaultYears, ...fromClosings]));
    return merged.sort();
  }, [financialYearClosings]);

  useEffect(() => {
    if (isOpen) {
      if (defaultTab) {
        setActiveTab(defaultTab);
      } else if (selectedParty) {
        setActiveTab('single_party');
      } else {
        setActiveTab('history');
      }
    }
  }, [isOpen, defaultTab, selectedParty]);

  // Track closed transaction IDs from previous closings to exclude them
  const { closedBillIdsSet, closedCollectionIdsSet, closedChallanIdsSet } = useMemo(() => {
    const bSet = new Set<string>();
    const cSet = new Set<string>();
    const chSet = new Set<string>();

    (financialYearClosings || []).forEach((c) => {
      if (c.status === 'closed') {
        (c.closedBillIds || []).forEach((id) => bSet.add(id));
        (c.closedCollectionIds || []).forEach((id) => cSet.add(id));
        (c.closedChallanIds || []).forEach((id) => chSet.add(id));
      }
    });
    return { closedBillIdsSet: bSet, closedCollectionIdsSet: cSet, closedChallanIdsSet: chSet };
  }, [financialYearClosings]);

  // Current Party Object
  const currentParty = useMemo(() => {
    return parties.find((p) => p.id === targetPartyId) || selectedParty || parties[0];
  }, [parties, targetPartyId, selectedParty]);

  // Check if this party has a previous closing record
  const pastPartyClosings = useMemo(() => {
    if (!currentParty) return [];
    const pNameLower = (currentParty.name || '').trim().toLowerCase();
    return (financialYearClosings || []).filter(
      (c) =>
        c.status === 'closed' &&
        ((c.partyId && c.partyId === currentParty.id) ||
          (c.partyName && c.partyName.trim().toLowerCase() === pNameLower) ||
          (!c.partyId && !c.partyName))
    );
  }, [financialYearClosings, currentParty]);

  // Latest closing date for this party
  const latestPartyClosing = useMemo(() => {
    if (pastPartyClosings.length === 0) return null;
    return [...pastPartyClosings].sort((a, b) => (parseDateToISO(b.endDate) || b.endDate).localeCompare(parseDateToISO(a.endDate) || a.endDate))[0];
  }, [pastPartyClosings]);

  // Unclosed Bills for current party (including any unclosed bills from prior closing periods)
  const partyAvailableBills = useMemo(() => {
    if (!currentParty) return [];
    const pNameLower = (currentParty.name || '').trim().toLowerCase();
    const endIso = endDate;

    return storedBills.filter((b) => {
      const bPartyLower = (b.header?.partyName || '').trim().toLowerCase();
      if (bPartyLower !== pNameLower) return false;

      if (closedBillIdsSet.has(b.id)) return false;

      const bDateIso = parseDateToISO(b.header?.date || b.savedAt || '');
      const matchDate = !endIso || !bDateIso || bDateIso <= endIso;
      return matchDate;
    });
  }, [storedBills, currentParty, endDate, closedBillIdsSet]);

  // Unclosed Collections for current party (including any unclosed collections from prior closing periods)
  const partyAvailableCollections = useMemo(() => {
    if (!currentParty) return [];
    const pNameLower = (currentParty.name || '').trim().toLowerCase();
    const endIso = endDate;

    return collections.filter((c) => {
      if (c.isYearClosingCollection) return false;
      const cPartyLower = (c.partyName || c.entityName || '').trim().toLowerCase();
      if (cPartyLower !== pNameLower) return false;

      if (closedCollectionIdsSet.has(c.id)) return false;

      const cDateIso = parseDateToISO(c.date || '');
      const matchDate = !endIso || !cDateIso || cDateIso <= endIso;
      return matchDate;
    });
  }, [collections, currentParty, endDate, closedCollectionIdsSet]);

  // Checkbox Selection States for Bills and Collections
  const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<Set<string>>(new Set());

  // Auto-select all available unclosed items whenever target party or date range changes
  useEffect(() => {
    const allBillIds = new Set(partyAvailableBills.map((b) => b.id));
    const allColIds = new Set(partyAvailableCollections.map((c) => c.id));
    setSelectedBillIds(allBillIds);
    setSelectedCollectionIds(allColIds);
  }, [partyAvailableBills, partyAvailableCollections, targetPartyId]);

  // Toggle Single Bill Selection
  const toggleBillSelection = (billId: string) => {
    setSelectedBillIds((prev) => {
      const next = new Set(prev);
      if (next.has(billId)) {
        next.delete(billId);
      } else {
        next.add(billId);
      }
      return next;
    });
  };

  // Toggle All Bills
  const toggleAllBills = () => {
    if (selectedBillIds.size === partyAvailableBills.length) {
      setSelectedBillIds(new Set());
    } else {
      setSelectedBillIds(new Set(partyAvailableBills.map((b) => b.id)));
    }
  };

  // Toggle Single Collection Selection
  const toggleCollectionSelection = (colId: string) => {
    setSelectedCollectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(colId)) {
        next.delete(colId);
      } else {
        next.add(colId);
      }
      return next;
    });
  };

  // Toggle All Collections
  const toggleAllCollections = () => {
    if (selectedCollectionIds.size === partyAvailableCollections.length) {
      setSelectedCollectionIds(new Set());
    } else {
      setSelectedCollectionIds(new Set(partyAvailableCollections.map((c) => c.id)));
    }
  };

  // Selected Bills Array
  const selectedBills = useMemo(() => {
    return partyAvailableBills.filter((b) => selectedBillIds.has(b.id));
  }, [partyAvailableBills, selectedBillIds]);

  // Selected Collections Array
  const selectedCollections = useMemo(() => {
    return partyAvailableCollections.filter((c) => selectedCollectionIds.has(c.id));
  }, [partyAvailableCollections, selectedCollectionIds]);

  // Base Opening Balance for Party (B/F from previous closing or initial balance)
  const openingBalance = useMemo(() => {
    if (!currentParty) return 0;
    if (latestPartyClosing) {
      const matched = latestPartyClosing.customerBalances?.find(
        (cb) => cb.partyId === currentParty.id || cb.partyName.trim().toLowerCase() === currentParty.name.trim().toLowerCase()
      );
      if (matched) {
        return matched.newOpeningBalance ?? matched.netClosingBalance ?? 0;
      }
    }
    return currentParty.openingBalance || 0;
  }, [currentParty, latestPartyClosing]);

  // Merged Chronological Statement of All Available Items with Live Selection State
  const statementItems = useMemo(() => {
    const items: Array<{
      id: string;
      date: string;
      rawDate: string;
      type: 'bill' | 'collection';
      billNo: string;
      grossAmount: number;
      discountPercent?: number;
      discountAmount: number;
      sales: number; // Net Sales amount
      collection: number; // Collection amount
      remark: string;
      coils: number;
      isSelected: boolean;
      runningBalance?: number;
    }> = [];

    // Bills
    partyAvailableBills.forEach((b) => {
      const gross = Number(b.subtotal || b.grandTotal + (b.discountAmount || 0) || 0);
      const discAmt = Number(b.discountAmount || 0);
      const net = Number(b.grandTotal || gross - discAmt);
      const coils = b.lines ? b.lines.reduce((s, l) => s + (Number(l.coilQty) || 0), 0) : 0;
      const bDate = b.header?.date || (b.savedAt ? b.savedAt.substring(0, 10) : '');
      const isSelected = selectedBillIds.has(b.id);
      const discRemark = b.header?.discountPercent ? `${b.header.discountPercent}%` : (b.header?.notes || 'Net Bill');

      items.push({
        id: b.id,
        date: formatDateDDMMYY(bDate),
        rawDate: parseDateToISO(bDate) || bDate,
        type: 'bill',
        billNo: b.header?.billNo || 'Cash Bill',
        grossAmount: gross,
        discountPercent: b.header?.discountPercent,
        discountAmount: discAmt,
        sales: net,
        collection: 0,
        remark: discRemark,
        coils,
        isSelected
      });
    });

    // Collections
    partyAvailableCollections.forEach((c) => {
      const cDate = c.date || '';
      const isSelected = selectedCollectionIds.has(c.id);
      const isCheque = c.paymentType === 'cheque' || (c.paymentType !== 'cash' && Boolean((c.chequeNo && c.chequeNo.trim() !== '') || (c.bankName && c.bankName.trim() !== '' && !c.bankName.toLowerCase().includes('cash'))));
      const billNoDisplay = isCheque ? 'Cheque' : 'Cash';
      const colRemark = c.mrNo ? `MR: ${c.mrNo}` : (c.bankName ? `Bank: ${c.bankName}` : (c.remarks || (isCheque ? 'Cheque Received' : 'Cash Received')));

      items.push({
        id: c.id,
        date: formatDateDDMMYY(cDate),
        rawDate: parseDateToISO(cDate) || cDate,
        type: 'collection',
        billNo: billNoDisplay,
        grossAmount: 0,
        discountAmount: 0,
        sales: 0,
        collection: Number(c.amount || 0),
        remark: colRemark,
        coils: 0,
        isSelected
      });
    });

    // Sort chronologically ascending
    items.sort((a, b) => a.rawDate.localeCompare(b.rawDate));

    // Calculate running balance for selected items
    let running = openingBalance;
    return items.map((item) => {
      if (item.isSelected) {
        running += item.sales - item.collection;
        return {
          ...item,
          runningBalance: running
        };
      }
      return {
        ...item,
        runningBalance: undefined
      };
    });
  }, [partyAvailableBills, partyAvailableCollections, selectedBillIds, selectedCollectionIds, openingBalance]);

  // Master Select State for all Statement items
  const isAllItemsSelected = useMemo(() => {
    const totalAvailable = partyAvailableBills.length + partyAvailableCollections.length;
    if (totalAvailable === 0) return false;
    return selectedBillIds.size === partyAvailableBills.length && selectedCollectionIds.size === partyAvailableCollections.length;
  }, [partyAvailableBills, partyAvailableCollections, selectedBillIds, selectedCollectionIds]);

  const toggleAllStatementItems = () => {
    if (isAllItemsSelected) {
      setSelectedBillIds(new Set());
      setSelectedCollectionIds(new Set());
    } else {
      setSelectedBillIds(new Set(partyAvailableBills.map((b) => b.id)));
      setSelectedCollectionIds(new Set(partyAvailableCollections.map((c) => c.id)));
    }
  };

  const handleToggleStatementItem = (item: { id: string; type: 'bill' | 'collection' }) => {
    if (item.type === 'bill') {
      toggleBillSelection(item.id);
    } else {
      toggleCollectionSelection(item.id);
    }
  };

  // Selected totals
  const totalSelectedGrossSales = useMemo(() => {
    return selectedBills.reduce((s, b) => s + Number(b.subtotal || b.grandTotal + (b.discountAmount || 0) || 0), 0);
  }, [selectedBills]);

  const totalSelectedNetSales = useMemo(() => {
    return selectedBills.reduce((s, b) => s + Number(b.grandTotal || 0), 0);
  }, [selectedBills]);

  const totalSelectedInvoiceDiscounts = useMemo(() => {
    return selectedBills.reduce((s, b) => s + Number(b.discountAmount || 0), 0);
  }, [selectedBills]);

  const totalSelectedCollections = useMemo(() => {
    return selectedCollections.reduce((s, c) => s + Number(c.amount || 0), 0);
  }, [selectedCollections]);

  const totalSelectedCoils = useMemo(() => {
    return selectedBills.reduce((sum, b) => sum + (b.lines?.reduce((ls, l) => ls + (Number(l.coilQty) || 0), 0) || 0), 0);
  }, [selectedBills]);

  // Balance before yearly discount
  const balanceBeforeYearlyDiscount = useMemo(() => {
    return openingBalance + totalSelectedNetSales - totalSelectedCollections;
  }, [openingBalance, totalSelectedNetSales, totalSelectedCollections]);

  // Discount-Wise Total Sales Breakdown View Basis ('net' | 'gross')
  const [salesSummaryViewBasis, setSalesSummaryViewBasis] = useState<'net' | 'gross'>('net');

  const discountWiseGroups = useMemo(() => {
    const map = new Map<number, { discountPercent: number; billCount: number; grossAmount: number; discountAmount: number; netAmount: number; coils: number }>();

    selectedBills.forEach((b) => {
      const discPct = Number(b.header?.discountPercent || 0);
      const gross = Number(b.subtotal || b.grandTotal + (b.discountAmount || 0) || 0);
      const discAmt = Number(b.discountAmount || 0);
      const net = Number(b.grandTotal || gross - discAmt);
      const coils = b.lines ? b.lines.reduce((s, l) => s + (Number(l.coilQty) || 0), 0) : 0;

      const existing = map.get(discPct) || {
        discountPercent: discPct,
        billCount: 0,
        grossAmount: 0,
        discountAmount: 0,
        netAmount: 0,
        coils: 0
      };

      existing.billCount += 1;
      existing.grossAmount += gross;
      existing.discountAmount += discAmt;
      existing.netAmount += net;
      existing.coils += coils;
      map.set(discPct, existing);
    });

    return Array.from(map.values()).sort((a, b) => a.discountPercent - b.discountPercent);
  }, [selectedBills]);

  // Yearly Discount % (directly depends on Display Sale As: Net Sale or Gross Sale)
  const [yearlyDiscountPercent, setYearlyDiscountPercent] = useState<number>(2.0);

  // Yearly Discount Amount calculation (strictly uses salesSummaryViewBasis)
  const yearlyDiscountAmount = useMemo(() => {
    const baseSale = salesSummaryViewBasis === 'gross' ? totalSelectedGrossSales : totalSelectedNetSales;
    return Math.round((baseSale * (Number(yearlyDiscountPercent) || 0)) / 100);
  }, [totalSelectedGrossSales, totalSelectedNetSales, yearlyDiscountPercent, salesSummaryViewBasis]);

  // Net Pay = (Balance before discount - Yearly Discount Amount)
  const netPayAmount = useMemo(() => {
    return Math.max(0, balanceBeforeYearlyDiscount - yearlyDiscountAmount);
  }, [balanceBeforeYearlyDiscount, yearlyDiscountAmount]);

  // Special Discount Purpose & Amount Box (only one line)
  const [specialDiscountPurpose, setSpecialDiscountPurpose] = useState<string>('Target Clearance Incentive Rebate');
  const [specialDiscountAmount, setSpecialDiscountAmount] = useState<number>(0);

  // Rest Amount = Net Pay - Special Discount Amount
  const restAmount = useMemo(() => {
    return Math.max(0, netPayAmount - (Number(specialDiscountAmount) || 0));
  }, [netPayAmount, specialDiscountAmount]);

  // Next Line: Rest Amount Received (Settlement Collection) Box
  const [restAmountReceived, setRestAmountReceived] = useState<number>(0);
  const [settlementBank, setSettlementBank] = useState<string>('Cash in Hand / Showroom Counter');
  const [settlementMrNo, setSettlementMrNo] = useState<string>(() => `MR-CLOSE-${Math.floor(1000 + Math.random() * 9000)}`);
  const [settlementDateStr, setSettlementDateStr] = useState<string>(() => getTodayDDMMYY());
  const settlementDate = useMemo(() => parseDateToISO(settlementDateStr) || new Date().toISOString().split('T')[0], [settlementDateStr]);
  const [settlementRemarks, setSettlementRemarks] = useState<string>(() => fiscalYear ? fiscalYear : 'FY 2026');

  // Final Last Balance = Rest Amount - Rest Amount Received
  const finalLastBalance = useMemo(() => {
    return restAmount - (Number(restAmountReceived) || 0);
  }, [restAmount, restAmountReceived]);

  // Is Final Balance Exactly 0?
  const isBalanceZero = useMemo(() => {
    return Math.abs(finalLastBalance) < 0.01;
  }, [finalLastBalance]);

  // Quick Action to Full Settle Rest Amount
  const handleAutoFillRestAmount = () => {
    setRestAmountReceived(restAmount);
  };

  // State for Confirmation Dialog
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [showPrintPreview, setShowPrintPreview] = useState<boolean>(false);

  // Preset Special Discount Options
  const SPECIAL_DISCOUNT_OPTIONS = [
    'Target Clearance Incentive Rebate',
    'Special Yearly Incentive Rebate',
    'Festival Rebate / Eid Bonus',
    'Damaged Coil / Handling Allowance',
    'Cash Clearance Settlement Rebate',
    'Special Showroom Rebate',
    'Custom Rebate Purpose...'
  ];

  // State for History Tab Delete / Edit / View
  const [closingToDelete, setClosingToDelete] = useState<FinancialYearClosing | null>(null);
  const [editingClosing, setEditingClosing] = useState<FinancialYearClosing | null>(null);
  const [viewingClosingStatement, setViewingClosingStatement] = useState<FinancialYearClosing | null>(null);
  const [showHistoryPrintPreview, setShowHistoryPrintPreview] = useState<boolean>(false);

  // History Statement Reconstructed Items
  const historyStatementItems = useMemo(() => {
    if (!viewingClosingStatement) return [];

    const closedBillIdSet = new Set(viewingClosingStatement.closedBillIds || []);
    const closedColIdSet = new Set(viewingClosingStatement.closedCollectionIds || []);
    const pNameLower = (viewingClosingStatement.partyName || '').trim().toLowerCase();

    let partyBills = storedBills.filter((b) => closedBillIdSet.has(b.id));
    if (partyBills.length === 0 && viewingClosingStatement.closedBillIds?.length) {
      const startIso = parseDateToISO(viewingClosingStatement.startDate) || viewingClosingStatement.startDate;
      const endIso = parseDateToISO(viewingClosingStatement.endDate) || viewingClosingStatement.endDate;
      partyBills = storedBills.filter((b) => {
        const bPartyLower = (b.header?.partyName || '').trim().toLowerCase();
        if (bPartyLower !== pNameLower) return false;
        const bDateIso = parseDateToISO(b.header?.date || b.savedAt || '');
        return (!startIso || bDateIso >= startIso) && (!endIso || bDateIso <= endIso);
      });
    }

    let partyCols = collections.filter((c) => closedColIdSet.has(c.id));
    if (partyCols.length === 0 && viewingClosingStatement.closedCollectionIds?.length) {
      const startIso = parseDateToISO(viewingClosingStatement.startDate) || viewingClosingStatement.startDate;
      const endIso = parseDateToISO(viewingClosingStatement.endDate) || viewingClosingStatement.endDate;
      partyCols = collections.filter((c) => {
        if (c.isYearClosingCollection) return false;
        const cPartyLower = (c.partyName || c.entityName || '').trim().toLowerCase();
        if (cPartyLower !== pNameLower) return false;
        const cDateIso = parseDateToISO(c.date || '');
        return (!startIso || cDateIso >= startIso) && (!endIso || cDateIso <= endIso);
      });
    }

    const items: Array<{
      id: string;
      date: string;
      rawDate: string;
      type: 'bill' | 'collection';
      billNo: string;
      grossAmount: number;
      discountPercent?: number;
      discountAmount: number;
      sales: number;
      collection: number;
      remark: string;
      coils: number;
      runningBalance?: number;
    }> = [];

    partyBills.forEach((b) => {
      const gross = Number(b.subtotal || b.grandTotal + (b.discountAmount || 0) || 0);
      const discAmt = Number(b.discountAmount || 0);
      const net = Number(b.grandTotal || gross - discAmt);
      const coils = b.lines ? b.lines.reduce((s, l) => s + (Number(l.coilQty) || 0), 0) : 0;
      const bDate = b.header?.date || (b.savedAt ? b.savedAt.substring(0, 10) : '');
      const discRemark = b.header?.discountPercent ? `${b.header.discountPercent}%` : (b.header?.notes || 'Net Bill');

      items.push({
        id: b.id,
        date: formatDateDDMMYY(bDate),
        rawDate: parseDateToISO(bDate) || bDate,
        type: 'bill',
        billNo: b.header?.billNo || 'Cash Bill',
        grossAmount: gross,
        discountPercent: b.header?.discountPercent,
        discountAmount: discAmt,
        sales: net,
        collection: 0,
        remark: discRemark,
        coils
      });
    });

    partyCols.forEach((c) => {
      const cDate = c.date || '';
      const isCheque = c.paymentType === 'cheque' || (c.paymentType !== 'cash' && Boolean((c.chequeNo && c.chequeNo.trim() !== '') || (c.bankName && c.bankName.trim() !== '' && !c.bankName.toLowerCase().includes('cash'))));
      const billNoDisplay = isCheque ? 'Cheque' : 'Cash';
      const colRemark = c.mrNo ? `MR: ${c.mrNo}` : (c.bankName ? `Bank: ${c.bankName}` : (c.remarks || (isCheque ? 'Cheque Received' : 'Cash Received')));

      items.push({
        id: c.id,
        date: formatDateDDMMYY(cDate),
        rawDate: parseDateToISO(cDate) || cDate,
        type: 'collection',
        billNo: billNoDisplay,
        grossAmount: 0,
        discountAmount: 0,
        sales: 0,
        collection: Number(c.amount || 0),
        remark: colRemark,
        coils: 0
      });
    });

    items.sort((a, b) => a.rawDate.localeCompare(b.rawDate));

    let running = viewingClosingStatement.totalOpeningBalance || 0;
    return items.map((item) => {
      running += item.sales - item.collection;
      return {
        ...item,
        runningBalance: running
      };
    });
  }, [viewingClosingStatement, storedBills, collections]);

  const handleExportHistoryExcel = () => {
    if (!viewingClosingStatement) return;
    try {
      const rows: any[] = [];
      const opBal = viewingClosingStatement.totalOpeningBalance || 0;
      if (opBal > 0) {
        rows.push({
          'SL': '#',
          'Date': formatDateDDMMYY(viewingClosingStatement.startDate),
          'Bill No.': 'B/F',
          'Sales (৳)': '',
          'Collection (৳)': '',
          'Balance (৳)': opBal,
          'Remark': 'Previous Closing Balance / B/F'
        });
      }

      historyStatementItems.forEach((item, idx) => {
        rows.push({
          'SL': idx + 1,
          'Date': item.date,
          'Bill No.': item.billNo,
          'Sales (৳)': item.sales > 0 ? item.sales : '',
          'Collection (৳)': item.collection > 0 ? item.collection : '',
          'Balance (৳)': item.runningBalance !== undefined ? item.runningBalance : '',
          'Remark': item.remark
        });
      });

      rows.push({});
      rows.push({
        'Date': 'Total Net Sales',
        'Sales (৳)': viewingClosingStatement.totalNetSales
      });
      rows.push({
        'Date': 'Total Collections',
        'Collection (৳)': viewingClosingStatement.totalCollections
      });
      rows.push({
        'Date': 'Balance Before Incentive',
        'Balance (৳)': viewingClosingStatement.balanceBeforeDiscounts
      });
      rows.push({
        'Date': 'Annual Incentive',
        'Balance (৳)': viewingClosingStatement.totalYearlyDiscount
      });
      rows.push({
        'Date': 'Net Pay',
        'Balance (৳)': viewingClosingStatement.netPayAmount
      });
      if (viewingClosingStatement.totalSpecialDiscount) {
        rows.push({
          'Date': 'Special Discount',
          'Balance (৳)': viewingClosingStatement.totalSpecialDiscount
        });
      }
      if (viewingClosingStatement.settlementCollectionAmount || viewingClosingStatement.settlementCollection?.amount) {
        rows.push({
          'Date': `Settlement Received (${viewingClosingStatement.settlementCollection?.mrNo || 'MR'})`,
          'Balance (৳)': viewingClosingStatement.settlementCollectionAmount || viewingClosingStatement.settlementCollection?.amount
        });
      }
      rows.push({
        'Date': 'Final Closing Balance',
        'Balance (৳)': viewingClosingStatement.totalNetClosingBalance || 0
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Closing_Statement');
      XLSX.writeFile(workbook, `${viewingClosingStatement.partyName || 'Party'}_${viewingClosingStatement.financialYear}_Closing_Statement.xlsx`);
    } catch (err) {
      console.error('Failed to export history statement:', err);
    }
  };

  // Edit Closing Form Fields
  const [editFinancialYear, setEditFinancialYear] = useState<string>('');
  const [editTitle, setEditTitle] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [editMrNo, setEditMrNo] = useState<string>('');
  const [editBank, setEditBank] = useState<string>('');

  const handleStartEditClosing = (closing: FinancialYearClosing) => {
    setEditingClosing(closing);
    setEditFinancialYear(closing.financialYear || 'FY 2026');
    setEditTitle(closing.title || '');
    setEditNotes(closing.notes || '');
    setEditMrNo(closing.settlementCollection?.mrNo || '');
    setEditBank(closing.settlementCollection?.bankName || '');
  };

  const handleSaveEditClosing = () => {
    if (!editingClosing || !onUpdateClosing) return;
    const updated: FinancialYearClosing = {
      ...editingClosing,
      financialYear: editFinancialYear.trim() || editingClosing.financialYear,
      title: editTitle,
      notes: editNotes,
      settlementCollection: editingClosing.settlementCollection
        ? {
            ...editingClosing.settlementCollection,
            mrNo: editMrNo,
            bankName: editBank
          }
        : undefined
    };
    onUpdateClosing(updated);
    setEditingClosing(null);
  };

  const handleConfirmDeleteClosing = () => {
    if (!closingToDelete || !onDeleteClosing) return;
    onDeleteClosing(closingToDelete.id);
    setClosingToDelete(null);
  };

  // Execute FY-Closing
  const handleConfirmClosing = () => {
    if (!currentParty) return;

    const discountTiers: YearlyDiscountTierSetting[] = [
      {
        discountPercent: 0,
        billsCount: selectedBills.length,
        coils: totalSelectedCoils,
        grossSales: totalSelectedGrossSales,
        netSales: totalSelectedNetSales,
        yearlyDiscountPercent,
        yearlyDiscountBasis: salesSummaryViewBasis,
        calculatedDiscount: yearlyDiscountAmount
      }
    ];

    const specialDiscounts: SpecialDiscountItem[] = specialDiscountAmount > 0 ? [
      {
        id: `sd-${Date.now()}`,
        partyId: currentParty.id,
        partyName: currentParty.name,
        amount: specialDiscountAmount,
        purpose: specialDiscountPurpose || 'Target Clearance Rebate',
        date: settlementDate
      }
    ] : [];

    const customerBalances: CustomerClosingBalance[] = [
      {
        partyId: currentParty.id,
        partyName: currentParty.name,
        salespersonName: currentParty.salespersonName || currentParty.salesmanCode,
        openingBalance,
        totalSales: totalSelectedNetSales,
        totalCollections: totalSelectedCollections,
        yearlyDiscount: yearlyDiscountAmount,
        specialDiscount: specialDiscountAmount,
        netClosingBalance: finalLastBalance,
        newOpeningBalance: finalLastBalance
      }
    ];

    const closingRecord: FinancialYearClosing = {
      id: `closing-${Date.now()}`,
      financialYear: fiscalYear,
      title: closingTitle || `${fiscalYear} Annual Closing (${currentParty.name})`,
      startDate,
      endDate,
      closingTimestamp: new Date().toISOString(),
      closedBy: currentUser?.username || 'suvroadmin',
      status: 'closed',
      partyId: currentParty.id,
      partyName: currentParty.name,
      closedBillIds: Array.from(selectedBillIds),
      closedCollectionIds: Array.from(selectedCollectionIds),
      balanceBeforeDiscounts: balanceBeforeYearlyDiscount,
      totalYearlyDiscount: yearlyDiscountAmount,
      totalSpecialDiscount: specialDiscountAmount,
      netPayAmount,
      remainingDue: finalLastBalance,
      discountTiers,
      totalGrossSales: totalSelectedGrossSales,
      totalNetSales: totalSelectedNetSales,
      specialDiscounts,
      totalBills: selectedBills.length,
      totalCoils: totalSelectedCoils,
      totalOpeningBalance: openingBalance,
      totalCollections: totalSelectedCollections,
      totalNetClosingBalance: finalLastBalance,
      customerBalances,
      notes: `Closed with ${selectedBills.length} bills, ${selectedCollections.length} collections. Rest settled: ৳${restAmountReceived}`,
      settlementCollectionAmount: restAmountReceived > 0 ? restAmountReceived : undefined,
      settlementCollection: restAmountReceived > 0
        ? {
            date: settlementDate,
            amount: restAmountReceived,
            bankName: settlementBank,
            mrNo: settlementMrNo,
            remarks: settlementRemarks || fiscalYear || 'FY 2026'
          }
        : undefined
    };

    // Update Party opening balance in master list
    const updatedParties = parties.map((p) => {
      if (p.id === currentParty.id) {
        return {
          ...p,
          openingBalance: finalLastBalance
        };
      }
      return p;
    });

    onSaveClosing(closingRecord, updatedParties);
    setShowConfirmModal(false);
  };

  // Print Statement Helper
  const handlePrint = () => {
    window.print();
  };

  // Export Excel Statement
  const handleExportExcel = () => {
    try {
      const rows: any[] = [];

      if (openingBalance > 0) {
        rows.push({
          'SL': '#',
          'Date': startDateStr,
          'Bill No.': 'B/F',
          'Sales (৳)': '',
          'Collection (৳)': '',
          'Balance (৳)': openingBalance,
          'Remark': 'Previous Closing Balance / B/F'
        });
      }

      statementItems.forEach((item, idx) => {
        rows.push({
          'SL': idx + 1,
          'Date': item.date,
          'Bill No.': item.billNo,
          'Sales (৳)': item.sales > 0 ? item.sales : '',
          'Collection (৳)': item.collection > 0 ? item.collection : '',
          'Balance (৳)': item.isSelected && item.runningBalance !== undefined ? item.runningBalance : 'Excluded',
          'Remark': item.remark
        });
      });

      rows.push({});
      rows.push({
        'Date': 'Total Selected Sales',
        'Sales (৳)': totalSelectedNetSales
      });
      rows.push({
        'Date': 'Total Selected Collections',
        'Collection (৳)': totalSelectedCollections
      });
      rows.push({
        'Date': 'Balance Before Discounts',
        'Balance (৳)': balanceBeforeYearlyDiscount
      });
      rows.push({
        'Date': `Yearly Discount (${yearlyDiscountPercent}% on ${salesSummaryViewBasis.toUpperCase()} sales)`,
        'Balance (৳)': yearlyDiscountAmount
      });
      rows.push({
        'Date': `Net Pay = (${balanceBeforeYearlyDiscount} - ${yearlyDiscountAmount})`,
        'Balance (৳)': netPayAmount
      });
      rows.push({
        'Date': `Special Discount (${specialDiscountPurpose})`,
        'Balance (৳)': specialDiscountAmount
      });
      rows.push({
        'Date': 'Rest Amount',
        'Balance (৳)': restAmount
      });
      rows.push({
        'Date': `Rest Amount Received (${settlementMrNo})`,
        'Balance (৳)': restAmountReceived
      });
      rows.push({
        'Date': 'Final Last Balance',
        'Balance (৳)': finalLastBalance
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Closing_Statement');
      XLSX.writeFile(workbook, `${currentParty?.name || 'Party'}_YearEnd_Closing_Statement.xlsx`);
    } catch (err) {
      console.error('Failed to export closing statement:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto font-sans animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-6xl w-full flex flex-col max-h-[96vh] overflow-hidden text-slate-900">
        
        {/* ========================================================= */}
        {/* MODAL HEADER BAR */}
        {/* ========================================================= */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-50 via-white to-amber-50/50 border-b border-amber-200/80 flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-xl shadow-md font-black ring-2 ring-amber-400/40">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  Year-End Closing & Incentive Settlement
                </h2>
                <span className="bg-amber-100 text-amber-900 font-mono text-xs px-2.5 py-0.5 rounded-full border border-amber-300 font-black">
                  {currentParty?.name || 'Customer Statement'}
                </span>
              </div>
              <p className="text-xs text-slate-600 font-medium">
                Live Selection Statement • Discount-Wise Sales • Net Pay Formula • Special Rebates • Settlement MR • Zero Balance Closing
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <div className="bg-slate-100 p-1 rounded-xl border border-slate-300 flex text-xs font-bold shadow-xs">
              <button
                type="button"
                onClick={() => setActiveTab('single_party')}
                className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center space-x-1.5 ${
                  activeTab === 'single_party'
                    ? 'bg-amber-500 text-slate-950 shadow-sm font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Closing Workspace</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center space-x-1.5 ${
                  activeTab === 'history'
                    ? 'bg-amber-500 text-slate-950 shadow-sm font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>FY Close list ({financialYearClosings.length})</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* MODAL BODY */}
        {/* ========================================================= */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6 text-xs bg-slate-50/50 print:p-0 print:bg-white print:text-black">
          {activeTab === 'single_party' ? (
            <>
              {/* 1. FILTER & TARGET SELECTION BAR (NO-PRINT) */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3 no-print">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
                  <div className="flex items-center space-x-2 text-amber-800 font-bold text-xs uppercase tracking-wider">
                    <Users className="w-4 h-4 text-amber-600" />
                    <span>Target Party & Fiscal Period Scope</span>
                  </div>

                  {latestPartyClosing && (
                    <div className="bg-emerald-50 text-emerald-800 text-[11px] font-bold px-3 py-1 rounded-lg border border-emerald-300 flex items-center space-x-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Last Closed on: {formatDateDDMMYY(latestPartyClosing.endDate)} ({latestPartyClosing.financialYear})</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Select Target Party */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-600 uppercase">Target Party Name:</label>
                    <select
                      value={targetPartyId}
                      onChange={(e) => setTargetPartyId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-bold text-xs focus:ring-2 focus:ring-amber-500 focus:bg-white"
                    >
                      {parties.map((p, pIdx) => (
                        <option key={p.id ? `${p.id}-${pIdx}` : `party-${pIdx}`} value={p.id}>
                          {p.name} {p.salesmanCode ? `[${p.salesmanCode}]` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Fiscal Year Label */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-600 uppercase">Fiscal Year Title:</label>
                    <input
                      type="text"
                      value={fiscalYear}
                      onChange={(e) => setFiscalYear(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-amber-900 font-bold text-xs focus:bg-white"
                      placeholder="e.g. FY 2026"
                    />
                  </div>

                  {/* Period Start Date (like dd.mm.yy) */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-slate-600 uppercase">Period Start Date:</label>
                      <span className="text-[9px] text-slate-400 font-mono">dd.mm.yy</span>
                    </div>
                    <DateInputWithPicker
                      value={startDateStr}
                      onChange={setStartDateStr}
                      valueFormat="ddmmyy"
                      theme="light"
                      placeholder="01.01.26"
                      inputClassName="!bg-slate-50 !rounded-xl px-3 py-2 text-slate-900"
                    />
                  </div>

                  {/* Closing Cutoff Date (like dd.mm.yy) */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-slate-600 uppercase">Closing Cutoff Date:</label>
                      <span className="text-[9px] text-slate-400 font-mono">dd.mm.yy</span>
                    </div>
                    <DateInputWithPicker
                      value={endDateStr}
                      onChange={setEndDateStr}
                      valueFormat="ddmmyy"
                      theme="light"
                      placeholder="31.12.26"
                      inputClassName="!bg-slate-50 !rounded-xl px-3 py-2 !text-amber-900"
                    />
                  </div>
                </div>
              </div>

              {/* ========================================================= */}
              {/* TOP SECTION: LIVE STATEMENT OF SELECTED ITEMS (CENTERED) */}
              {/* ========================================================= */}
              <div className="max-w-5xl mx-auto w-full space-y-6">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 print:border-none print:p-0">
                  {/* Statement Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 print:border-black">
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-tight print:text-black">
                          {currentParty?.name} — Statement of Selected Items
                        </h3>
                        <span className="bg-amber-100 text-amber-900 text-[10px] font-mono px-2 py-0.5 rounded border border-amber-300 font-bold print:hidden">
                          Live Preview
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 font-medium print:text-black">
                        Address: {currentParty?.address || 'Madhupur'} • Representative: {currentParty?.salespersonName || currentParty?.salesmanCode || 'Showroom Counter'} • Date: {startDateStr} to {endDateStr}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2 no-print">
                      <button
                        type="button"
                        onClick={() => setShowPrintPreview(true)}
                        className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-black flex items-center space-x-1.5 border border-amber-600 cursor-pointer text-xs transition-colors shadow-xs"
                      >
                        <Printer className="w-3.5 h-3.5 text-slate-950" />
                        <span>Print Statement</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleExportExcel}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center space-x-1.5 cursor-pointer text-xs transition-colors shadow-xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export Excel</span>
                      </button>
                    </div>
                  </div>

                  {/* Statement Table of Items with Interactive Row & Master Selection */}
                  <div className="overflow-x-auto border border-slate-200 rounded-xl print:border-black">
                    <table className="w-full text-xs text-left border-collapse text-slate-800 print:text-black">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-300 font-bold uppercase text-[10px] text-slate-700 print:bg-slate-100 print:text-black print:border-black">
                          <th className="p-2 text-center w-14 border-r border-slate-200 print:border-black">
                            <div className="flex items-center justify-center space-x-1.5">
                              <input
                                type="checkbox"
                                checked={isAllItemsSelected}
                                onChange={toggleAllStatementItems}
                                title="Select / Deselect All Items"
                                className="rounded text-amber-600 focus:ring-amber-500 w-3.5 h-3.5 cursor-pointer no-print"
                              />
                              <span>SL</span>
                            </div>
                          </th>
                          <th className="p-2 text-center w-24 border-r border-slate-200 print:border-black">Date</th>
                          <th className="p-2 text-center w-28 border-r border-slate-200 print:border-black">Bill No.</th>
                          <th className="p-2 text-center w-32 border-r border-slate-200 print:border-black">Sales</th>
                          <th className="p-2 text-center w-32 border-r border-slate-200 print:border-black">Collection</th>
                          <th className="p-2 text-center w-36 border-r border-slate-200 print:border-black">Balance</th>
                          <th className="p-2 text-center print:border-black">Remark</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Opening Balance Row: Only shown if opening balance is greater than 0 */}
                        {openingBalance > 0 && (
                          <tr className="bg-slate-50 border-b border-slate-200 font-bold print:border-black">
                            <td className="p-2 text-center text-slate-400 border-r border-slate-200 print:border-black">-</td>
                            <td className="p-2 text-center font-mono text-slate-600 border-r border-slate-200 print:border-black">{startDateStr}</td>
                            <td className="p-2 text-center font-bold text-amber-800 border-r border-slate-200 print:border-black">B/F</td>
                            <td className="p-2 text-right border-r border-slate-200 print:border-black text-slate-400">-</td>
                            <td className="p-2 text-right border-r border-slate-200 print:border-black text-slate-400">-</td>
                            <td className="p-2 text-right font-mono font-black text-amber-900 border-r border-slate-200 print:border-black">
                              ৳{openingBalance.toLocaleString('en-IN')}
                            </td>
                            <td className="p-2 text-center text-slate-600 font-medium text-[11px]">Previous Closing Balance / B/F</td>
                          </tr>
                        )}

                        {statementItems.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-6 text-center text-slate-400 italic">
                              No bills or collections found for {currentParty?.name} in the selected period ({startDateStr} to {endDateStr}).
                            </td>
                          </tr>
                        ) : (
                          statementItems.map((item, idx) => (
                            <tr
                              key={item.id}
                              onClick={() => handleToggleStatementItem(item)}
                              className={`border-b border-slate-200 transition-colors cursor-pointer select-none print:border-black ${
                                !item.isSelected
                                  ? 'bg-slate-100/60 text-slate-400 opacity-60 hover:opacity-100 hover:bg-slate-100'
                                  : item.type === 'bill'
                                  ? 'bg-white hover:bg-amber-50/40 text-slate-800'
                                  : 'bg-emerald-50/40 hover:bg-emerald-50 text-slate-800'
                              }`}
                            >
                              {/* SL + Checkbox */}
                              <td className="p-2 text-center border-r border-slate-200 print:border-black">
                                <div className="flex items-center justify-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={item.isSelected}
                                    onChange={() => handleToggleStatementItem(item)}
                                    className="rounded text-amber-600 focus:ring-amber-500 w-3.5 h-3.5 cursor-pointer no-print"
                                  />
                                  <span className="font-mono text-slate-500 font-bold">{idx + 1}</span>
                                </div>
                              </td>

                              {/* Date */}
                              <td className="p-2 text-center font-mono border-r border-slate-200 print:border-black">
                                {item.date}
                              </td>

                              {/* Bill No. / MR No. */}
                              <td className="p-2 text-center font-mono font-bold border-r border-slate-200 print:border-black">
                                <span className={item.type === 'bill' ? 'text-slate-900' : 'text-emerald-700'}>
                                  {item.billNo}
                                </span>
                              </td>

                              {/* Sales (Net Sales amount for bills) */}
                              <td className="p-2 text-right font-mono font-bold border-r border-slate-200 print:border-black text-slate-900">
                                {item.sales > 0 ? `৳${item.sales.toLocaleString('en-IN')}` : '-'}
                              </td>

                              {/* Collection */}
                              <td className="p-2 text-right font-mono font-bold border-r border-slate-200 print:border-black text-emerald-700">
                                {item.collection > 0 ? `৳${item.collection.toLocaleString('en-IN')}` : '-'}
                              </td>

                              {/* Running Balance */}
                              <td className="p-2 text-right font-mono font-black border-r border-slate-200 print:border-black text-slate-900">
                                {item.isSelected && item.runningBalance !== undefined ? (
                                  `৳${item.runningBalance.toLocaleString('en-IN')}`
                                ) : (
                                  <span className="text-slate-400 font-normal italic text-[10px]">Excluded</span>
                                )}
                              </td>

                              {/* Remark (e.g. '10%', '8%', etc.) */}
                              <td className="p-2 text-center">
                                {item.discountPercent ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                    {item.discountPercent}%
                                  </span>
                                ) : item.type === 'bill' ? (
                                  <span className="text-slate-600 text-[11px] font-medium">{item.remark || 'Net Bill'}</span>
                                ) : (
                                  <span className="text-emerald-800 text-[11px] font-medium">{item.remark || 'Cash Received'}</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100 border-t-2 border-slate-300 font-black text-xs text-slate-900 print:bg-slate-200 print:text-black print:border-black">
                          <td colSpan={3} className="p-2.5 text-right uppercase border-r border-slate-200 print:border-black">
                            Total of Selected Items:
                          </td>
                          <td className="p-2.5 text-right font-mono border-r border-slate-200 print:border-black text-slate-950 font-black">
                            ৳{totalSelectedNetSales.toLocaleString('en-IN')}
                          </td>
                          <td className="p-2.5 text-right font-mono border-r border-slate-200 print:border-black text-emerald-700 font-black">
                            ৳{totalSelectedCollections.toLocaleString('en-IN')}
                          </td>
                          <td className="p-2.5 text-right font-mono text-amber-900 font-black border-r border-slate-200 print:border-black">
                            ৳{balanceBeforeYearlyDiscount.toLocaleString('en-IN')}
                          </td>
                          <td className="p-2.5 text-center text-[11px] text-slate-600 font-bold">
                            {selectedBills.length} Bills, {selectedCollections.length} MRs Selected
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* ========================================================= */}
                {/* 2. SALES SUMMARY & YEARLY INCENTIVE % */}
                {/* ========================================================= */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    {/* Toggle: Display Sale As on Left Side */}
                    <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-xl border border-slate-300 text-xs">
                      <span className="text-[10px] text-slate-600 uppercase font-bold pl-2">Display Sale As:</span>
                      <button
                        type="button"
                        onClick={() => setSalesSummaryViewBasis('net')}
                        className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          salesSummaryViewBasis === 'net'
                            ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Net Sale (After Disc)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSalesSummaryViewBasis('gross')}
                        className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          salesSummaryViewBasis === 'gross'
                            ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Gross Sale (Before Disc)
                      </button>
                    </div>
                  </div>

                  {/* Discount Summary Rows: Left Side = Bills & Coils, Right Side = Amount Box */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 font-mono space-y-2.5">
                    {discountWiseGroups.length === 0 ? (
                      <div className="text-slate-400 italic text-xs">No bills selected for discount breakdown.</div>
                    ) : (
                      discountWiseGroups.map((group, gIdx) => {
                        const amount = salesSummaryViewBasis === 'net' ? group.netAmount : group.grossAmount;
                        const label = group.discountPercent === 0 ? '0% Sales' : `${group.discountPercent}% Sales`;
                        return (
                          <div key={`closing-disc-${group.discountPercent}-${gIdx}`} className="flex flex-wrap items-center justify-between text-xs py-1 border-b border-slate-200/80">
                            {/* Left Side: bills count and coils */}
                            <span className="text-slate-600 text-xs font-mono font-medium">
                              {group.billCount} {group.billCount === 1 ? 'bill' : 'bills'}, {group.coils} coils
                            </span>
                            
                            {/* Middle to Right Side / Under Balance Column: Amount Box */}
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-slate-800 text-xs sm:text-sm">
                                {label}=
                              </span>
                              <span className="font-black font-mono text-slate-950 text-xs sm:text-sm bg-white px-2.5 py-0.5 rounded-lg border border-slate-300 shadow-2xs">
                                ৳{amount.toLocaleString('en-IN')}/-
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}

                    <div className="border-t border-slate-300 my-1 pt-2 flex flex-wrap items-center justify-between font-black text-xs sm:text-sm text-amber-950">
                      {/* Left Side: total bills count and coils */}
                      <span className="text-xs text-slate-700 font-bold font-mono">
                        {selectedBills.length} bills, {totalSelectedCoils} coils
                      </span>

                      {/* Middle to Right Side: Total Amount Box */}
                      <div className="flex items-center space-x-2">
                        <span className="uppercase text-amber-900 font-bold text-xs sm:text-sm">
                          Total {salesSummaryViewBasis === 'net' ? 'Net' : 'Gross'} Sales=
                        </span>
                        <span className="font-black font-mono text-amber-950 text-sm sm:text-base bg-amber-100/90 px-3 py-1 rounded-lg border border-amber-300 shadow-2xs">
                          ৳{(salesSummaryViewBasis === 'net' ? totalSelectedNetSales : totalSelectedGrossSales).toLocaleString('en-IN')}/-
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Yearly Discount Percentage Input (arrows removed & no wheel effect) */}
                  <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200/80 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center space-x-3">
                      <label className="text-xs font-bold text-slate-800 uppercase">
                        Annual Incentive / Yearly Discount %:
                      </label>
                      <div className="relative w-28">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={yearlyDiscountPercent}
                          onChange={(e) => setYearlyDiscountPercent(parseFloat(e.target.value) || 0)}
                          onWheel={(e) => (e.target as HTMLElement).blur()}
                          className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 pr-7 text-amber-950 font-black text-sm font-mono focus:ring-2 focus:ring-amber-500 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="absolute right-3 top-2 text-amber-700 font-black text-sm">%</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[11px] font-bold text-slate-600 block">
                        Calculated on {salesSummaryViewBasis === 'net' ? 'Net Sales' : 'Gross Sales'}:
                      </span>
                      <span className="text-base font-black font-mono text-amber-900">
                        ৳{yearlyDiscountAmount.toLocaleString('en-IN')}/-
                      </span>
                    </div>
                  </div>
                </div>

                {/* ========================================================= */}
                {/* 3. NET PAY FORMULA DISPLAY (CENTERED, NO COLORED BOX) */}
                {/* ========================================================= */}
                <div className="py-2 text-center">
                  <div className="text-base sm:text-lg font-black font-mono tracking-tight text-slate-900">
                    Net Pay = (৳{balanceBeforeYearlyDiscount.toLocaleString('en-IN')} - ৳{yearlyDiscountAmount.toLocaleString('en-IN')}) = ৳{netPayAmount.toLocaleString('en-IN')}
                  </div>
                </div>

                {/* ========================================================= */}
                {/* 4. ONLY ONE LINE: SPECIAL DISCOUNT DROPDOWN & AMOUNT */}
                {/* ========================================================= */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
                    {/* Left Label */}
                    <div className="flex items-center space-x-2 min-w-[130px] font-bold text-slate-800">
                      <Award className="w-4 h-4 text-amber-600" />
                      <span>Special Discount:</span>
                    </div>

                    {/* Purpose Dropdown List & Custom Input */}
                    <div className="flex-1 w-full flex flex-col sm:flex-row gap-2">
                      <select
                        value={SPECIAL_DISCOUNT_OPTIONS.includes(specialDiscountPurpose) ? specialDiscountPurpose : 'Custom Rebate Purpose...'}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'Custom Rebate Purpose...') {
                            setSpecialDiscountPurpose('');
                          } else {
                            setSpecialDiscountPurpose(val);
                          }
                        }}
                        className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold text-xs focus:bg-white cursor-pointer"
                      >
                        {SPECIAL_DISCOUNT_OPTIONS.map((opt, optIdx) => (
                          <option key={`${opt}-${optIdx}`} value={opt}>{opt}</option>
                        ))}
                      </select>

                      {(!SPECIAL_DISCOUNT_OPTIONS.includes(specialDiscountPurpose) || specialDiscountPurpose === '') && (
                        <input
                          type="text"
                          value={specialDiscountPurpose}
                          onChange={(e) => setSpecialDiscountPurpose(e.target.value)}
                          placeholder="Type custom rebate purpose..."
                          className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold text-xs focus:bg-white"
                        />
                      )}
                    </div>

                    {/* Amount Input (arrows removed & no wheel effect) */}
                    <div className="w-full md:w-44 flex items-center space-x-1.5">
                      <span className="text-slate-500 font-bold text-xs">৳</span>
                      <input
                        type="number"
                        min="0"
                        value={specialDiscountAmount || ''}
                        onChange={(e) => setSpecialDiscountAmount(parseFloat(e.target.value) || 0)}
                        onWheel={(e) => (e.target as HTMLElement).blur()}
                        placeholder="Amount ৳"
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-rose-800 font-black text-xs font-mono focus:bg-white text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>

                    {/* Resulting Rest Amount */}
                    <div className="bg-amber-50 px-3.5 py-1.5 rounded-xl border border-amber-200 font-mono font-black text-amber-950 whitespace-nowrap">
                      <span className="text-[10px] text-amber-800 uppercase mr-1.5 font-sans">Rest Amount:</span>
                      <span className="text-sm text-amber-950">৳{restAmount.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>

                {/* ========================================================= */}
                {/* 5. REST AMOUNT RECEIVED (SETTLEMENT COLLECTION) */}
                {/* ========================================================= */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* 1. Payment Date (Left side of the page) */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-700 uppercase">Payment Date (dd.mm.yy):</label>
                      <DateInputWithPicker
                        value={settlementDateStr}
                        onChange={setSettlementDateStr}
                        valueFormat="ddmmyy"
                        theme="light"
                        inputClassName="!bg-slate-50 !rounded-xl px-3 py-2 text-slate-900"
                      />
                    </div>

                    {/* 2. Bank / Account */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-700 uppercase">Payment Bank / Counter:</label>
                      <input
                        type="text"
                        value={settlementBank}
                        onChange={(e) => setSettlementBank(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold text-xs focus:bg-white"
                        placeholder="Cash in Hand / Bank Name"
                      />
                    </div>

                    {/* 3. MR Receipt No. */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-700 uppercase">Settlement MR No.:</label>
                      <input
                        type="text"
                        value={settlementMrNo}
                        onChange={(e) => setSettlementMrNo(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-bold text-xs font-mono focus:bg-white"
                        placeholder="MR-CLOSE-XXXX"
                      />
                    </div>

                    {/* 4. Rest Amount Received Input (Right side of the page) */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-700 uppercase">Rest Amount Received (৳):</label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          value={restAmountReceived || ''}
                          onChange={(e) => setRestAmountReceived(parseFloat(e.target.value) || 0)}
                          onWheel={(e) => (e.target as HTMLElement).blur()}
                          className="w-full bg-emerald-50/50 border border-emerald-300 rounded-xl px-3 py-2 text-emerald-950 font-black text-sm font-mono focus:bg-white text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          placeholder="0"
                        />
                        <span className="absolute left-3 top-2.5 text-emerald-700 font-bold text-xs">৳</span>
                      </div>
                    </div>
                  </div>

                  {/* Final Closing Balance Metric & Guidance */}
                  <div className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                    isBalanceZero
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      : 'bg-rose-50 border-rose-300 text-rose-950'
                  }`}>
                    <div>
                      {isBalanceZero ? (
                        <div className="flex items-center space-x-2">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                          <span className="bg-emerald-200 text-emerald-900 px-3 py-1 rounded-lg text-xs font-black border border-emerald-400">
                            ✓ Balance is ৳ 0 — Ready to Close Financial Year
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <AlertTriangle className="w-5 h-5 text-rose-600" />
                          <span className="bg-rose-200 text-rose-900 px-3 py-1 rounded-lg text-xs font-bold border border-rose-400">
                            ⚠ Settle remaining ৳{finalLastBalance.toLocaleString('en-IN')} to enable Closing Button
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Final Last Balance on the right side */}
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-700 block">
                        Final Last Balance (Remaining Due):
                      </span>
                      <span className={`text-base sm:text-lg font-black font-mono ${isBalanceZero ? 'text-emerald-900' : 'text-rose-900'}`}>
                        ৳{finalLastBalance.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ========================================================= */}
              {/* 7. BOTTOM ACTION FOOTER (CONDITIONAL CLOSE BUTTON) */}
              {/* ========================================================= */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-md flex flex-wrap items-center justify-between gap-4 no-print">
                <div className="text-xs text-slate-600">
                  <span className="font-bold text-slate-900 block">
                    Closing Target: <span className="text-amber-900 font-black">{currentParty?.name}</span> ({fiscalYear})
                  </span>
                  <span>
                    Selected: {selectedBills.length} Bills (৳{totalSelectedNetSales.toLocaleString('en-IN')}) & {selectedCollections.length} MRs (৳{totalSelectedCollections.toLocaleString('en-IN')})
                  </span>
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs cursor-pointer border border-slate-300 transition-colors"
                  >
                    Cancel / Exit
                  </button>

                  {isBalanceZero ? (
                    <button
                      type="button"
                      onClick={() => setShowConfirmModal(true)}
                      className="px-6 py-2.5 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-xl text-sm shadow-md cursor-pointer flex items-center space-x-2 ring-2 ring-amber-400/50 transition-all transform active:scale-98"
                    >
                      <Lock className="w-4 h-4 text-slate-950" />
                      <span>Confirm & Close {fiscalYear} (Final Balance ৳0)</span>
                    </button>
                  ) : (
                    <div className="bg-slate-100 text-slate-400 px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 cursor-not-allowed flex items-center space-x-1.5">
                      <Lock className="w-4 h-4" />
                      <span>Close FY (Disabled: Final Balance is ৳{finalLastBalance.toLocaleString('en-IN')})</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* ========================================================= */
            /* CLOSING HISTORY TAB (PARTY LIST & FY-YEAR VIEW) */
            /* ========================================================= */
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              {viewingClosingStatement === null ? (
                selectedHistoryFY === null ? (
                  /* ----------------------------------------------------- */
                  /* TIER 1: FY-YEAR LIST (FY-2025, FY-2026, FY-2027...) */
                  /* ----------------------------------------------------- */
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                      <div>
                        <h3 className="text-base font-black text-slate-900 uppercase">
                          FY Close List
                        </h3>
                        <p className="text-xs text-slate-500">
                          Select a Financial Year to view all parties who have closed their account and settled annual incentives.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('single_party');
                        }}
                        className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-black text-xs flex items-center space-x-1.5 cursor-pointer shadow-xs transition-colors"
                      >
                        <Sliders className="w-3.5 h-3.5 text-slate-950" />
                        <span>Open Closing Workspace</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                      {availableFYYears.map((fy, idx) => {
                        const normTarget = fy.replace(/[^0-9]/g, '');
                        const fyClosings = (financialYearClosings || []).filter((c) => {
                          const normClosing = (c.financialYear || '').replace(/[^0-9]/g, '');
                          if (normTarget && normClosing && normTarget === normClosing) return true;
                          const rawTarget = fy.toLowerCase().replace(/[\s-_]/g, '');
                          const rawClosing = (c.financialYear || '').toLowerCase().replace(/[\s-_]/g, '');
                          return rawTarget === rawClosing;
                        });

                        const closedPartyCount = fyClosings.length;
                        const totalSettledTurnover = fyClosings.reduce((sum, c) => {
                          const salesVal = c.yearlyDiscountBasis === 'gross'
                            ? (c.totalGrossSales || c.totalNetSales || 0)
                            : (c.totalNetSales || 0);
                          return sum + salesVal;
                        }, 0);

                        return (
                          <div
                            key={`fy-${fy}-${idx}`}
                            onClick={() => setSelectedHistoryFY(fy)}
                            className="bg-gradient-to-br from-slate-50 to-amber-50/30 hover:from-amber-50 hover:to-amber-100/50 p-5 rounded-2xl border border-slate-200 hover:border-amber-400 transition-all cursor-pointer shadow-xs hover:shadow-md group flex flex-col justify-between space-y-4"
                          >
                            <div className="flex items-start justify-between">
                              <div className="p-3 bg-amber-100 text-amber-900 group-hover:bg-amber-500 group-hover:text-slate-950 rounded-xl font-black transition-colors shadow-xs">
                                <Calendar className="w-6 h-6" />
                              </div>
                              <span className="bg-white text-slate-900 font-mono text-xs px-2.5 py-1 rounded-full font-black border border-slate-300 shadow-2xs group-hover:border-amber-300">
                                {fy}
                              </span>
                            </div>

                            <div>
                              <h4 className="text-lg font-black text-slate-900 group-hover:text-amber-950">
                                {fy}
                              </h4>
                              <p className="text-xs text-slate-600 font-medium mt-1">
                                {closedPartyCount === 0
                                  ? 'No parties closed yet'
                                  : `${closedPartyCount} ${closedPartyCount === 1 ? 'Party account closed' : 'Parties accounts closed'}`}
                              </p>
                            </div>

                            <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs">
                              <span className="text-slate-500 font-mono font-bold">
                                {closedPartyCount > 0 ? `৳${totalSettledTurnover.toLocaleString('en-IN')}` : 'Ready to Close'}
                              </span>
                              <span className="text-amber-900 font-black flex items-center space-x-1 group-hover:translate-x-0.5 transition-transform">
                                <span>Open Party List</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* ----------------------------------------------------- */
                  /* TIER 2: PARTY LIST FOR SELECTED FY */
                  /* ----------------------------------------------------- */
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                      <div className="flex items-center space-x-3">
                        <button
                          type="button"
                          onClick={() => setSelectedHistoryFY(null)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs flex items-center space-x-1 border border-slate-300 cursor-pointer transition-colors"
                        >
                          <span>← Back to FY Close List</span>
                        </button>

                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="text-base font-black text-slate-900 uppercase">
                              FY Close List — {selectedHistoryFY}
                            </h3>
                            <span className="bg-amber-100 text-amber-900 font-mono text-xs px-2.5 py-0.5 rounded-full font-black border border-amber-300">
                              {selectedHistoryFY}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">
                            List of parties who closed their account for {selectedHistoryFY}. Click any party to view closing history.
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setFiscalYear(selectedHistoryFY);
                          setActiveTab('single_party');
                        }}
                        className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-black text-xs flex items-center space-x-1.5 cursor-pointer shadow-xs transition-colors"
                      >
                        <Sliders className="w-3.5 h-3.5 text-slate-950" />
                        <span>Close New Party in {selectedHistoryFY}</span>
                      </button>
                    </div>

                    {(() => {
                      const normTarget = selectedHistoryFY.replace(/[^0-9]/g, '');
                      const fyClosings = (financialYearClosings || []).filter((c) => {
                        const normClosing = (c.financialYear || '').replace(/[^0-9]/g, '');
                        if (normTarget && normClosing && normTarget === normClosing) return true;
                        const rawTarget = selectedHistoryFY.toLowerCase().replace(/[\s-_]/g, '');
                        const rawClosing = (c.financialYear || '').toLowerCase().replace(/[\s-_]/g, '');
                        return rawTarget === rawClosing;
                      });

                      if (fyClosings.length === 0) {
                        return (
                          <div className="p-12 text-center text-slate-400 space-y-3 bg-slate-50 rounded-2xl border border-slate-200">
                            <Lock className="w-10 h-10 mx-auto text-slate-300" />
                            <p className="font-bold text-slate-700">No parties have closed their account for {selectedHistoryFY} yet.</p>
                            <p className="text-xs text-slate-500">You can complete a party settlement from the Closing Workspace for this fiscal year.</p>
                            <div>
                              <button
                                type="button"
                                onClick={() => {
                                  setFiscalYear(selectedHistoryFY);
                                  setActiveTab('single_party');
                                }}
                                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-black text-xs inline-flex items-center space-x-1.5 cursor-pointer shadow-xs"
                              >
                                <Sliders className="w-3.5 h-3.5" />
                                <span>Go to Closing Workspace ({selectedHistoryFY})</span>
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                          {fyClosings.map((closing) => {
                            const isClosed = closing.status === 'closed';
                            const displaySales = closing.yearlyDiscountBasis === 'gross'
                              ? (closing.totalGrossSales || closing.totalNetSales || 0)
                              : (closing.totalNetSales || 0);

                            return (
                              <div
                                key={closing.id}
                                onClick={() => setViewingClosingStatement(closing)}
                                className="bg-white hover:bg-amber-50/50 p-4 transition-all flex flex-wrap items-center justify-between gap-3 cursor-pointer group select-none"
                              >
                                <div className="flex items-center space-x-3">
                                  <div className="p-2.5 bg-amber-100 text-amber-900 group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors rounded-xl font-black">
                                    <Award className="w-5 h-5" />
                                  </div>
                                  <div>
                                    <div className="flex items-center space-x-2">
                                      <span className="font-black text-slate-900 text-sm group-hover:text-amber-950">
                                        {closing.partyName || 'Customer Party'}
                                      </span>
                                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                                        isClosed
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                          : 'bg-amber-50 text-amber-700 border-amber-300'
                                      }`}>
                                        {isClosed ? 'CLOSED (৳ 0)' : 'DRAFT'}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 font-medium">
                                      Period: {formatDateDDMMYY(closing.startDate)} - {formatDateDDMMYY(closing.endDate)} • Closed by: {closing.closedBy || 'Admin'}
                                    </p>
                                    <p className="text-[11px] text-slate-600 font-mono font-semibold">
                                      Sales: ৳{displaySales.toLocaleString('en-IN')} ({closing.yearlyDiscountBasis === 'gross' ? 'Gross' : 'Net'}) • Collection: ৳{(closing.totalCollections || 0).toLocaleString('en-IN')} • Incentive: ৳{(closing.totalYearlyDiscount || 0).toLocaleString('en-IN')}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center space-x-2 text-xs" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={() => setViewingClosingStatement(closing)}
                                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg font-black flex items-center space-x-1.5 cursor-pointer shadow-xs transition-colors"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-slate-950" />
                                    <span>Party Closing History View</span>
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-950" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleStartEditClosing(closing)}
                                    className="p-1.5 bg-white hover:bg-slate-100 text-slate-600 rounded-lg border border-slate-300 cursor-pointer transition-colors shadow-xs"
                                    title="Edit Closing Details"
                                  >
                                    <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                                  </button>

                                  {onReopenClosing && isClosed && (
                                    <button
                                      type="button"
                                      onClick={() => onReopenClosing(closing.id)}
                                      className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg border border-amber-300 cursor-pointer transition-colors shadow-xs"
                                      title="Reopen FY"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                                    </button>
                                  )}

                                  {onDeleteClosing && (
                                    <button
                                      type="button"
                                      onClick={() => setClosingToDelete(closing)}
                                      className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg border border-rose-300 cursor-pointer transition-colors shadow-xs"
                                      title="Delete Closing Record"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )
              ) : (
                /* ========================================================= */
                /* TIER 3: PARTY CLOSING HISTORY VIEW */
                /* ========================================================= */
                <div className="space-y-5">
                  {/* Top Bar with Back Button & Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    <div className="flex items-center space-x-3">
                      <button
                        type="button"
                        onClick={() => setViewingClosingStatement(null)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs flex items-center space-x-1 border border-slate-300 cursor-pointer transition-colors"
                      >
                        <span>← Back to {selectedHistoryFY ? `${selectedHistoryFY} Party List` : 'FY Close List'}</span>
                      </button>

                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="text-base font-black text-slate-900 uppercase">
                            {viewingClosingStatement.partyName}
                          </h3>
                          <span className="bg-amber-100 text-amber-900 font-mono text-xs px-2 py-0.5 rounded-full font-black border border-amber-300">
                            {viewingClosingStatement.financialYear}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Closed Period: {formatDateDDMMYY(viewingClosingStatement.startDate)} to {formatDateDDMMYY(viewingClosingStatement.endDate)} • Final Balance: ৳{(viewingClosingStatement.totalNetClosingBalance || 0).toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => setShowHistoryPrintPreview(true)}
                        className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-black flex items-center space-x-1.5 border border-amber-600 cursor-pointer text-xs transition-colors shadow-xs"
                      >
                        <Printer className="w-3.5 h-3.5 text-slate-950" />
                        <span>Print Statement</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleExportHistoryExcel}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center space-x-1.5 cursor-pointer text-xs transition-colors shadow-xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export Excel</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStartEditClosing(viewingClosingStatement)}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl font-bold border border-slate-300 flex items-center space-x-1 text-xs cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                        <span>Edit</span>
                      </button>

                      {onReopenClosing && viewingClosingStatement.status === 'closed' && (
                        <button
                          type="button"
                          onClick={() => {
                            onReopenClosing(viewingClosingStatement.id);
                            setViewingClosingStatement(null);
                          }}
                          className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-xl font-bold border border-amber-300 flex items-center space-x-1 text-xs cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                          <span>Reopen FY</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 1. RECONSTRUCTED STATEMENT TABLE */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-slate-800 text-xs uppercase tracking-wider flex items-center space-x-1.5">
                        <FileText className="w-4 h-4 text-amber-600" />
                        <span>Closed Statement of Items</span>
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {historyStatementItems.length} transactions settled
                      </span>
                    </div>

                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-xs text-left border-collapse text-slate-800">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-300 font-bold uppercase text-[10px] text-slate-700">
                            <th className="p-2 text-center w-12 border-r border-slate-200">SL</th>
                            <th className="p-2 text-center w-24 border-r border-slate-200">Date</th>
                            <th className="p-2 text-center w-28 border-r border-slate-200">Bill No. / MR</th>
                            <th className="p-2 text-center w-32 border-r border-slate-200">Sales (৳)</th>
                            <th className="p-2 text-center w-32 border-r border-slate-200">Collection (৳)</th>
                            <th className="p-2 text-center w-36 border-r border-slate-200">Balance (৳)</th>
                            <th className="p-2 text-center">Remark</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Opening Balance Row */}
                          {(viewingClosingStatement.totalOpeningBalance || 0) > 0 && (
                            <tr className="bg-slate-50 border-b border-slate-200 font-bold">
                              <td className="p-2 text-center text-slate-400 border-r border-slate-200">-</td>
                              <td className="p-2 text-center font-mono text-slate-600 border-r border-slate-200">
                                {formatDateDDMMYY(viewingClosingStatement.startDate)}
                              </td>
                              <td className="p-2 text-center font-bold text-amber-800 border-r border-slate-200">B/F</td>
                              <td className="p-2 text-right border-r border-slate-200 text-slate-400">-</td>
                              <td className="p-2 text-right border-r border-slate-200 text-slate-400">-</td>
                              <td className="p-2 text-right font-mono font-black text-amber-900 border-r border-slate-200">
                                ৳{(viewingClosingStatement.totalOpeningBalance || 0).toLocaleString('en-IN')}
                              </td>
                              <td className="p-2 text-center text-slate-600 font-medium text-[11px]">Previous Closing Balance / B/F</td>
                            </tr>
                          )}

                          {historyStatementItems.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="p-6 text-center text-slate-400 italic">
                                Historical transaction details recorded in summary audit ledger.
                              </td>
                            </tr>
                          ) : (
                            historyStatementItems.map((item, idx) => (
                              <tr
                                key={item.id}
                                className={`border-b border-slate-200 ${
                                  item.type === 'bill' ? 'bg-white hover:bg-amber-50/40' : 'bg-emerald-50/30 hover:bg-emerald-50/60'
                                }`}
                              >
                                <td className="p-2 text-center border-r border-slate-200 font-mono text-slate-500 font-bold">
                                  {idx + 1}
                                </td>
                                <td className="p-2 text-center font-mono border-r border-slate-200">
                                  {item.date}
                                </td>
                                <td className="p-2 text-center font-mono font-bold border-r border-slate-200">
                                  <span className={item.type === 'bill' ? 'text-slate-900' : 'text-emerald-700'}>
                                    {item.billNo}
                                  </span>
                                </td>
                                <td className="p-2 text-right font-mono font-bold border-r border-slate-200 text-slate-900">
                                  {item.sales > 0 ? `৳${item.sales.toLocaleString('en-IN')}` : '-'}
                                </td>
                                <td className="p-2 text-right font-mono font-bold border-r border-slate-200 text-emerald-700">
                                  {item.collection > 0 ? `৳${item.collection.toLocaleString('en-IN')}` : '-'}
                                </td>
                                <td className="p-2 text-right font-mono font-black border-r border-slate-200 text-slate-900">
                                  {item.runningBalance !== undefined ? `৳${item.runningBalance.toLocaleString('en-IN')}` : '-'}
                                </td>
                                <td className="p-2 text-center text-slate-700 font-medium text-[11px]">
                                  {item.discountPercent ? `${item.discountPercent}%` : item.remark}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-100 border-t-2 border-slate-300 font-black text-xs text-slate-900">
                            <td colSpan={3} className="p-2.5 text-right uppercase border-r border-slate-300">
                              Total:
                            </td>
                            <td className="p-2.5 text-right font-mono border-r border-slate-300 text-slate-950">
                              ৳{(viewingClosingStatement.totalNetSales || 0).toLocaleString('en-IN')}
                            </td>
                            <td className="p-2.5 text-right font-mono border-r border-slate-300 text-emerald-800">
                              ৳{(viewingClosingStatement.totalCollections || 0).toLocaleString('en-IN')}
                            </td>
                            <td className="p-2.5 text-right font-mono border-r border-slate-300 text-amber-950">
                              ৳{(viewingClosingStatement.balanceBeforeDiscounts || 0).toLocaleString('en-IN')}
                            </td>
                            <td className="p-2.5 text-center text-[11px] text-slate-600">
                              {viewingClosingStatement.totalBills || historyStatementItems.filter(i => i.type === 'bill').length} Bills, {historyStatementItems.filter(i => i.type === 'collection').length} MRs
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* 2. CLOSING DETAILS & SETTLEMENT SUMMARY */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Sales Breakdown Card */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 font-mono text-xs space-y-2">
                      <div className="font-bold font-sans text-slate-800 text-[11px] uppercase border-b border-slate-200 pb-1.5 flex justify-between">
                        <span>Sales Breakdown</span>
                        <span>Amount</span>
                      </div>
                      {viewingClosingStatement.yearlyDiscountBasis === 'gross' ? (
                        <div className="flex justify-between py-0.5 border-b border-slate-200/60">
                          <span className="text-slate-600">Total Gross Sales:</span>
                          <span className="font-bold text-slate-900">৳{(viewingClosingStatement.totalGrossSales || viewingClosingStatement.totalNetSales || 0).toLocaleString('en-IN')}</span>
                        </div>
                      ) : (
                        <div className="flex justify-between py-0.5 border-b border-slate-200/60">
                          <span className="text-slate-600">Total Net Sales:</span>
                          <span className="font-bold text-slate-900">৳{(viewingClosingStatement.totalNetSales || 0).toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      <div className="flex justify-between py-0.5 border-b border-slate-200/60">
                        <span className="text-slate-600">Total Collections Received:</span>
                        <span className="font-bold text-emerald-800">৳{(viewingClosingStatement.totalCollections || 0).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="border-t border-slate-300 pt-1.5 flex justify-between font-black text-slate-950">
                        <span>Balance Before Incentive:</span>
                        <span>৳{(viewingClosingStatement.balanceBeforeDiscounts || 0).toLocaleString('en-IN')}</span>
                      </div>
                    </div>

                    {/* Settlement & Incentive Summary Card */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2">
                      <div className="font-bold font-sans text-slate-800 text-[11px] uppercase border-b border-slate-200 pb-1.5 flex justify-between">
                        <span className="text-left">Settlement & Incentive Summary</span>
                        <span className="text-right">Amount</span>
                      </div>
                      <table className="w-full text-xs border-collapse">
                        <tbody>
                          <tr className="border-b border-slate-200/60 text-amber-900 font-bold">
                            <td className="py-1 text-left">
                              Annual Incentive{viewingClosingStatement.yearlyDiscountPercent !== undefined && viewingClosingStatement.yearlyDiscountPercent > 0 ? ` (${viewingClosingStatement.yearlyDiscountPercent}%)` : (viewingClosingStatement.discountTiers?.[0]?.yearlyDiscountPercent ? ` (${viewingClosingStatement.discountTiers[0].yearlyDiscountPercent}%)` : '')}:
                            </td>
                            <td className="py-1 text-right font-mono font-bold whitespace-nowrap">
                              - ৳{(viewingClosingStatement.totalYearlyDiscount || 0).toLocaleString('en-IN')}
                            </td>
                          </tr>
                          <tr className="bg-amber-100/80 text-amber-950 font-black">
                            <td className="py-1.5 px-2 text-left rounded-l border-y border-l border-amber-200">Net Pay Amount:</td>
                            <td className="py-1.5 px-2 text-right font-mono font-black rounded-r border-y border-r border-amber-200 whitespace-nowrap">
                              ৳{(viewingClosingStatement.netPayAmount || 0).toLocaleString('en-IN')}
                            </td>
                          </tr>
                          {(viewingClosingStatement.totalSpecialDiscount || 0) > 0 && (
                            <tr className="border-b border-slate-200/60 text-rose-800 font-bold">
                              <td className="py-1 text-left">Special Discount:</td>
                              <td className="py-1 text-right font-mono font-bold whitespace-nowrap">
                                - ৳{(viewingClosingStatement.totalSpecialDiscount || 0).toLocaleString('en-IN')}
                              </td>
                            </tr>
                          )}
                          {(viewingClosingStatement.settlementCollectionAmount || viewingClosingStatement.settlementCollection?.amount || 0) > 0 && (
                            <tr className="border-b border-slate-200/60 text-emerald-800 font-bold">
                              <td className="py-1 text-left">
                                Settled Amount ({viewingClosingStatement.settlementCollection?.mrNo || 'MR-CLOSE'}{viewingClosingStatement.settlementCollection?.bankName ? ` - ${viewingClosingStatement.settlementCollection.bankName}` : ''}):
                              </td>
                              <td className="py-1 text-right font-mono font-bold whitespace-nowrap">
                                - ৳{(viewingClosingStatement.settlementCollectionAmount || viewingClosingStatement.settlementCollection?.amount || 0).toLocaleString('en-IN')}
                              </td>
                            </tr>
                          )}
                          <tr className="border-t-2 border-slate-900 font-black text-slate-950 text-sm">
                            <td className="pt-2 text-left">Final Closing Balance:</td>
                            <td className="pt-2 text-right font-mono font-black text-emerald-700 whitespace-nowrap">
                              ৳{(viewingClosingStatement.totalNetClosingBalance || 0).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Audit Trail Info */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-slate-800">Closed By:</span> {viewingClosingStatement.closedBy || 'Admin'} • <span className="font-bold text-slate-800">Timestamp:</span> {viewingClosingStatement.closingTimestamp ? new Date(viewingClosingStatement.closingTimestamp).toLocaleString() : 'Recorded'}
                    </div>
                    {viewingClosingStatement.notes && (
                      <div>
                        <span className="font-bold text-slate-800">Remarks:</span> {viewingClosingStatement.notes}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* EDIT CLOSING MODAL DIALOG */}
      {/* ========================================================= */}
      {editingClosing && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-2xl shadow-2xl max-w-lg w-full p-5 space-y-4 text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2">
                <Edit3 className="w-5 h-5 text-amber-600" />
                <h4 className="font-black text-sm uppercase">Edit Closing Record</h4>
              </div>
              <button
                type="button"
                onClick={() => setEditingClosing(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Fiscal Year Title:</label>
                  <input
                    type="text"
                    value={editFinancialYear}
                    onChange={(e) => setEditFinancialYear(e.target.value)}
                    placeholder="e.g. FY 2026"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-amber-900 font-bold focus:bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Closing Title:</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="e.g. Annual Closing"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-bold focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Settlement MR No.:</label>
                  <input
                    type="text"
                    value={editMrNo}
                    onChange={(e) => setEditMrNo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono font-bold focus:bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Settlement Bank/Counter:</label>
                  <input
                    type="text"
                    value={editBank}
                    onChange={(e) => setEditBank(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold focus:bg-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600 uppercase">Notes & Remarks:</label>
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-medium focus:bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingClosing(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEditClosing}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs cursor-pointer flex items-center space-x-1.5 shadow-xs"
              >
                <Save className="w-3.5 h-3.5 text-slate-950" />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* DELETE CONFIRMATION DIALOG */}
      {/* ========================================================= */}
      {closingToDelete && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-rose-300 rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4 text-slate-900">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="p-2.5 bg-rose-100 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-black text-sm uppercase">Delete Closing Record?</h4>
                <p className="text-xs text-slate-500">Restore closed transactions to active state</p>
              </div>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed">
              Are you sure you want to delete <span className="font-bold text-slate-900">{closingToDelete.title || closingToDelete.financialYear}</span> for <span className="font-bold text-amber-900">{closingToDelete.partyName}</span>?
              <br /><br />
              <span className="text-rose-700 font-bold">This will remove this closing record and release all associated bills and collections back to unclosed status.</span>
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setClosingToDelete(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteClosing}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs cursor-pointer flex items-center space-x-1.5 shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Closing</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* FINAL CONFIRM CLOSING MODAL DIALOG */}
      {/* ========================================================= */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-2xl shadow-2xl max-w-lg w-full p-5 space-y-4 text-slate-900">
            <div className="flex items-center space-x-3 text-amber-600">
              <div className="p-3 bg-amber-100 rounded-xl">
                <Lock className="w-6 h-6 text-amber-700" />
              </div>
              <div>
                <h4 className="font-black text-base uppercase text-slate-900">Confirm Year-End Closing</h4>
                <p className="text-xs text-slate-500">Seal FY records and zero-out closing balance</p>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-600">Party:</span>
                <span className="font-bold text-slate-900">{currentParty?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Fiscal Period:</span>
                <span className="font-bold text-slate-900">{startDateStr} - {endDateStr}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Selected Bills Closed:</span>
                <span className="font-bold text-slate-900">{selectedBills.length} bills (৳{totalSelectedNetSales.toLocaleString('en-IN')})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Selected Collections Closed:</span>
                <span className="font-bold text-slate-900">{selectedCollections.length} MRs (৳{totalSelectedCollections.toLocaleString('en-IN')})</span>
              </div>
              <div className="flex justify-between text-amber-900 font-bold">
                <span>Yearly Incentive ({yearlyDiscountPercent}%):</span>
                <span>৳{yearlyDiscountAmount.toLocaleString('en-IN')}</span>
              </div>
              {specialDiscountAmount > 0 && (
                <div className="flex justify-between text-rose-800 font-bold">
                  <span>Special Discount:</span>
                  <span>৳{specialDiscountAmount.toLocaleString('en-IN')}</span>
                </div>
              )}
              {restAmountReceived > 0 && (
                <div className="flex justify-between text-emerald-800 font-bold">
                  <span>Rest Settled ({settlementMrNo}):</span>
                  <span>৳{restAmountReceived.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="border-t border-slate-300 pt-1.5 flex justify-between font-black text-sm text-emerald-700">
                <span>Final Closing Balance:</span>
                <span>৳{finalLastBalance.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClosing}
                className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-xl text-xs cursor-pointer flex items-center space-x-1.5 shadow-md"
              >
                <CheckCircle2 className="w-4 h-4 text-slate-950" />
                <span>Confirm & Lock Financial Year</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* STATEMENT PRINT PREVIEW MODAL */}
      {/* ========================================================= */}
      {showPrintPreview && (
        <div className="fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-start p-2 sm:p-4 md:p-6 overflow-y-auto font-sans">
          {/* Top Control Bar (Hidden on Print) */}
          <div className="w-full max-w-4xl bg-slate-900 text-white px-5 py-3 rounded-2xl mb-4 flex flex-wrap items-center justify-between gap-3 shadow-2xl border border-slate-700 sticky top-2 z-10 no-print">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-amber-500 text-slate-950 rounded-xl font-bold">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black tracking-tight text-white">Statement Print Preview</h3>
                <p className="text-[11px] text-slate-400 font-medium">
                  {currentParty?.name} — {startDateStr} to {endDateStr}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleExportExcel}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Excel</span>
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="px-5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 rounded-xl text-xs font-black flex items-center space-x-1.5 cursor-pointer shadow-md transition-transform active:scale-95"
              >
                <Printer className="w-4 h-4" />
                <span>Print Document Now</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPrintPreview(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 cursor-pointer transition-colors"
                title="Close Preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Printable Sheet (Standard A4 Letterhead Format) */}
          <div className="w-full max-w-4xl bg-white text-slate-900 p-6 sm:p-8 md:p-10 rounded-2xl shadow-2xl border border-slate-200 print:border-none print:shadow-none print:p-0 print:m-0 space-y-6">
            
            {/* Header / Company Branding */}
            <div className="border-b-2 border-slate-900 pb-4 text-center space-y-1">
              <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-slate-950">
                NEW SONCHITA ENTERPRISE
              </h1>
              <p className="text-xs font-bold text-slate-700 tracking-wide">
                Specialized Hardware, Rod, Sheet & Coil Trading • Madhupur, Tangail
              </p>
              <div className="inline-block bg-slate-900 text-white text-[11px] font-black uppercase px-3 py-0.5 rounded-full tracking-widest mt-1">
                Statement of Selected Items & Settlement
              </div>
            </div>

            {/* Customer & Period Info Header */}
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-300 text-xs font-sans">
              <div className="space-y-1">
                <div>
                  <span className="font-bold text-slate-500 uppercase text-[10px] block">Customer Name:</span>
                  <span className="font-black text-slate-900 text-sm">{currentParty?.name}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 uppercase text-[10px] block">Address:</span>
                  <span className="font-medium text-slate-800">{currentParty?.address || 'Madhupur'}</span>
                </div>
              </div>
              <div className="space-y-1 text-right">
                <div>
                  <span className="font-bold text-slate-500 uppercase text-[10px] block">Statement Period:</span>
                  <span className="font-mono font-bold text-slate-900">{startDateStr} to {endDateStr}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 uppercase text-[10px] block">Representative:</span>
                  <span className="font-medium text-slate-800">{currentParty?.salespersonName || currentParty?.salesmanCode || 'Showroom Counter'}</span>
                </div>
              </div>
            </div>

            {/* Statement Table */}
            <div className="overflow-x-auto border border-slate-300 rounded-lg">
              <table className="w-full text-xs text-left border-collapse text-slate-900 font-sans">
                <thead>
                  <tr className="bg-slate-100 border-b-2 border-slate-300 font-bold uppercase text-[10px] text-slate-800">
                    <th className="p-2 text-center w-12 border-r border-slate-300">SL</th>
                    <th className="p-2 text-center w-24 border-r border-slate-300">Date</th>
                    <th className="p-2 text-center w-28 border-r border-slate-300">Bill No.</th>
                    <th className="p-2 text-center w-32 border-r border-slate-300">Sales (৳)</th>
                    <th className="p-2 text-center w-32 border-r border-slate-300">Collection (৳)</th>
                    <th className="p-2 text-center w-36 border-r border-slate-300">Balance (৳)</th>
                    <th className="p-2 text-center">Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Opening Balance Row: Only shown if opening balance is greater than 0 */}
                  {openingBalance > 0 && (
                    <tr className="bg-slate-50 border-b border-slate-200 font-bold">
                      <td className="p-2 text-center text-slate-400 border-r border-slate-300">-</td>
                      <td className="p-2 text-center font-mono text-slate-700 border-r border-slate-300">{startDateStr}</td>
                      <td className="p-2 text-center font-bold text-amber-900 border-r border-slate-300">B/F</td>
                      <td className="p-2 text-right border-r border-slate-300 text-slate-400">-</td>
                      <td className="p-2 text-right border-r border-slate-300 text-slate-400">-</td>
                      <td className="p-2 text-right font-mono font-black text-amber-950 border-r border-slate-300">
                        ৳{openingBalance.toLocaleString('en-IN')}
                      </td>
                      <td className="p-2 text-center text-slate-600 font-medium text-[11px]">Previous Closing Balance / B/F</td>
                    </tr>
                  )}

                  {statementItems.filter(i => i.isSelected).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400 italic">
                        No selected items in the statement.
                      </td>
                    </tr>
                  ) : (
                    statementItems.filter(i => i.isSelected).map((item, idx) => (
                      <tr key={item.id} className="border-b border-slate-200">
                        <td className="p-2 text-center font-mono font-bold border-r border-slate-300 text-slate-600">
                          {idx + 1}
                        </td>
                        <td className="p-2 text-center font-mono border-r border-slate-300">
                          {item.date}
                        </td>
                        <td className="p-2 text-center font-mono font-bold border-r border-slate-300">
                          {item.billNo}
                        </td>
                        <td className="p-2 text-right font-mono font-bold border-r border-slate-300">
                          {item.sales > 0 ? `৳${item.sales.toLocaleString('en-IN')}` : '-'}
                        </td>
                        <td className="p-2 text-right font-mono font-bold border-r border-slate-300 text-emerald-800">
                          {item.collection > 0 ? `৳${item.collection.toLocaleString('en-IN')}` : '-'}
                        </td>
                        <td className="p-2 text-right font-mono font-black border-r border-slate-300">
                          {item.runningBalance !== undefined ? `৳${item.runningBalance.toLocaleString('en-IN')}` : '-'}
                        </td>
                        <td className="p-2 text-center font-bold text-[11px]">
                          {item.discountPercent ? `${item.discountPercent}%` : item.remark}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-300 font-black text-xs text-slate-950">
                    <td colSpan={3} className="p-2.5 text-right uppercase border-r border-slate-300">
                      Total:
                    </td>
                    <td className="p-2.5 text-right font-mono border-r border-slate-300">
                      ৳{totalSelectedNetSales.toLocaleString('en-IN')}
                    </td>
                    <td className="p-2.5 text-right font-mono border-r border-slate-300 text-emerald-800">
                      ৳{totalSelectedCollections.toLocaleString('en-IN')}
                    </td>
                    <td className="p-2.5 text-right font-mono border-r border-slate-300 text-amber-950">
                      ৳{balanceBeforeYearlyDiscount.toLocaleString('en-IN')}
                    </td>
                    <td className="p-2.5 text-center text-[11px] text-slate-600">
                      {selectedBills.length} Bills, {selectedCollections.length} MRs
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Discount Summary & Final Settlement Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Discount-Wise Sales Breakdown */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-300 font-mono text-xs space-y-1.5">
                <div className="font-bold font-sans text-slate-800 text-[11px] uppercase border-b border-slate-300 pb-1 flex justify-between">
                  <span>Sales Breakdown ({salesSummaryViewBasis === 'net' ? 'Net' : 'Gross'} Basis)</span>
                  <span>Qty / Amount</span>
                </div>
                {discountWiseGroups.map((group, gIdx) => {
                  const amount = salesSummaryViewBasis === 'net' ? group.netAmount : group.grossAmount;
                  const label = group.discountPercent === 0 ? '0% Sales' : `${group.discountPercent}% Sales`;
                  return (
                    <div key={`preview-disc-${group.discountPercent}-${gIdx}`} className="flex justify-between py-0.5 border-b border-slate-200">
                      <span className="text-slate-600 font-medium">
                        {group.billCount} {group.billCount === 1 ? 'bill' : 'bills'}, {group.coils} coils
                      </span>
                      <span className="font-bold text-slate-900">
                        {label}= ৳{amount.toLocaleString('en-IN')}/-
                      </span>
                    </div>
                  );
                })}
                <div className="border-t border-slate-300 pt-1 flex justify-between font-black text-slate-950">
                  <span>{selectedBills.length} bills, {totalSelectedCoils} coils</span>
                  <span>Total {salesSummaryViewBasis === 'net' ? 'Net' : 'Gross'} Sales= ৳{(salesSummaryViewBasis === 'net' ? totalSelectedNetSales : totalSelectedGrossSales).toLocaleString('en-IN')}/-</span>
                </div>
              </div>

              {/* Settlement Balance Summary */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-300 font-mono text-xs space-y-1.5">
                <div className="font-bold font-sans text-slate-800 text-[11px] uppercase border-b border-slate-300 pb-1">
                  Settlement & Incentive Summary
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Balance Before Incentive:</span>
                  <span className="font-bold text-slate-900">৳{balanceBeforeYearlyDiscount.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-amber-900 font-bold">
                  <span>Annual Incentive ({yearlyDiscountPercent}%):</span>
                  <span>- ৳{yearlyDiscountAmount.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between font-black bg-amber-100/80 px-2 py-0.5 rounded border border-amber-200 text-amber-950">
                  <span>Net Pay Amount:</span>
                  <span>৳{netPayAmount.toLocaleString('en-IN')}</span>
                </div>
                {specialDiscountAmount > 0 && (
                  <div className="flex justify-between text-rose-800 font-bold">
                    <span>Special Discount ({specialDiscountPurpose}):</span>
                    <span>- ৳{specialDiscountAmount.toLocaleString('en-IN')}</span>
                  </div>
                )}
                {restAmountReceived > 0 && (
                  <div className="flex justify-between text-emerald-800 font-bold">
                    <span>Settled Amount ({settlementMrNo}):</span>
                    <span>- ৳{restAmountReceived.toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div className="border-t-2 border-slate-900 pt-1 flex justify-between font-black text-slate-950 text-sm">
                  <span>Closing Balance:</span>
                  <span>৳{finalLastBalance.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            {/* Signature Block */}
            <div className="grid grid-cols-2 gap-8 pt-10 text-xs">
              <div className="text-center">
                <div className="border-t border-slate-800 pt-1.5 font-bold text-slate-800">
                  Customer Signature
                </div>
                <span className="text-[10px] text-slate-500">{currentParty?.name}</span>
              </div>
              <div className="text-center">
                <div className="border-t border-slate-800 pt-1.5 font-bold text-slate-800">
                  Authorized Signatory
                </div>
                <span className="text-[10px] text-slate-500">NEW SONCHITA ENTERPRISE</span>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* HISTORICAL STATEMENT PRINT PREVIEW MODAL */}
      {/* ========================================================= */}
      {showHistoryPrintPreview && viewingClosingStatement && (
        <div className="fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-start p-2 sm:p-4 md:p-6 overflow-y-auto font-sans">
          {/* Top Control Bar (Hidden on Print) */}
          <div className="w-full max-w-4xl bg-slate-900 text-white px-5 py-3 rounded-2xl mb-4 flex flex-wrap items-center justify-between gap-3 shadow-2xl border border-slate-700 sticky top-2 z-10 no-print">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-amber-500 text-slate-950 rounded-xl font-bold">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black tracking-tight text-white">Historical Statement Print Preview</h3>
                <p className="text-[11px] text-slate-400 font-medium">
                  {viewingClosingStatement.partyName} — {viewingClosingStatement.financialYear} ({formatDateDDMMYY(viewingClosingStatement.startDate)} to {formatDateDDMMYY(viewingClosingStatement.endDate)})
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleExportHistoryExcel}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Excel</span>
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="px-5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 rounded-xl text-xs font-black flex items-center space-x-1.5 cursor-pointer shadow-md transition-transform active:scale-95"
              >
                <Printer className="w-4 h-4" />
                <span>Print Document Now</span>
              </button>
              <button
                type="button"
                onClick={() => setShowHistoryPrintPreview(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 cursor-pointer transition-colors"
                title="Close Preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Printable Sheet (Standard A4 Letterhead Format) */}
          <div className="w-full max-w-4xl bg-white text-slate-900 p-6 sm:p-8 md:p-10 rounded-2xl shadow-2xl border border-slate-200 print:border-none print:shadow-none print:p-0 print:m-0 space-y-6">
            {/* Header / Company Branding */}
            <div className="border-b-2 border-slate-900 pb-4 text-center space-y-1">
              <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-slate-950">
                NEW SONCHITA ENTERPRISE
              </h1>
              <p className="text-xs font-bold text-slate-700 tracking-wide">
                Hardware, Sanitary & Pipe Fittings Merchant & General Order Suppliers
              </p>
              <p className="text-[11px] text-slate-500">
                Proprietor: Sri Dulal Chandra Saha • Station Road, Netrakona • Mobile: 01712-293626, 01914-807770
              </p>
              <div className="pt-2">
                <span className="inline-block bg-slate-900 text-white text-xs font-black px-4 py-1 rounded-full uppercase tracking-wider">
                  Annual Financial Statement & Closing Settlement ({viewingClosingStatement.financialYear})
                </span>
              </div>
            </div>

            {/* Party & Date Info */}
            <div className="grid grid-cols-2 gap-4 text-xs border border-slate-300 rounded-xl p-3.5 bg-slate-50/50">
              <div>
                <span className="text-slate-500 font-bold">Party Name:</span>
                <span className="font-black text-slate-900 text-sm ml-2">{viewingClosingStatement.partyName}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 font-bold">Financial Year:</span>
                <span className="font-mono font-black text-slate-900 text-sm ml-2">{viewingClosingStatement.financialYear}</span>
              </div>
              <div>
                <span className="text-slate-500 font-bold">Period:</span>
                <span className="font-mono font-bold text-slate-800 ml-2">
                  {formatDateDDMMYY(viewingClosingStatement.startDate)} to {formatDateDDMMYY(viewingClosingStatement.endDate)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 font-bold">Status:</span>
                <span className="font-bold text-emerald-800 uppercase ml-2">
                  {viewingClosingStatement.status ? viewingClosingStatement.status.toUpperCase() : 'CLOSED'} (৳0.00)
                </span>
              </div>
            </div>

            {/* Table of Statement Items */}
            <div className="overflow-hidden border border-slate-300 rounded-lg">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-200 border-b border-slate-300 font-bold uppercase text-[10px] text-slate-800">
                    <th className="p-2 text-center w-10 border-r border-slate-300">SL</th>
                    <th className="p-2 text-center w-24 border-r border-slate-300">Date</th>
                    <th className="p-2 text-center w-28 border-r border-slate-300">Bill No. / MR</th>
                    <th className="p-2 text-right w-28 border-r border-slate-300">Sales (৳)</th>
                    <th className="p-2 text-right w-28 border-r border-slate-300">Collection (৳)</th>
                    <th className="p-2 text-right w-32 border-r border-slate-300">Balance (৳)</th>
                    <th className="p-2 text-center">Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewingClosingStatement.totalOpeningBalance || 0) > 0 && (
                    <tr className="bg-slate-50 border-b border-slate-200 font-bold">
                      <td className="p-2 text-center text-slate-400 border-r border-slate-200">-</td>
                      <td className="p-2 text-center font-mono border-r border-slate-200">
                        {formatDateDDMMYY(viewingClosingStatement.startDate)}
                      </td>
                      <td className="p-2 text-center font-bold text-amber-900 border-r border-slate-200">B/F</td>
                      <td className="p-2 text-right border-r border-slate-200 text-slate-400">-</td>
                      <td className="p-2 text-right border-r border-slate-200 text-slate-400">-</td>
                      <td className="p-2 text-right font-mono font-black text-slate-900 border-r border-slate-200">
                        ৳{(viewingClosingStatement.totalOpeningBalance || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="p-2 text-center text-slate-600 text-[11px]">Previous Closing Balance</td>
                    </tr>
                  )}

                  {historyStatementItems.map((item, idx) => (
                    <tr key={item.id} className="border-b border-slate-200">
                      <td className="p-2 text-center border-r border-slate-200 font-mono text-slate-500 font-bold">
                        {idx + 1}
                      </td>
                      <td className="p-2 text-center font-mono border-r border-slate-200">{item.date}</td>
                      <td className="p-2 text-center font-mono font-bold border-r border-slate-200">
                        {item.billNo}
                      </td>
                      <td className="p-2 text-right font-mono border-r border-slate-200 font-bold text-slate-900">
                        {item.sales > 0 ? `৳${item.sales.toLocaleString('en-IN')}` : '-'}
                      </td>
                      <td className="p-2 text-right font-mono border-r border-slate-200 font-bold text-emerald-800">
                        {item.collection > 0 ? `৳${item.collection.toLocaleString('en-IN')}` : '-'}
                      </td>
                      <td className="p-2 text-right font-mono border-r border-slate-200 font-black text-slate-950">
                        {item.runningBalance !== undefined ? `৳${item.runningBalance.toLocaleString('en-IN')}` : '-'}
                      </td>
                      <td className="p-2 text-center text-slate-600 text-[11px]">
                        {item.discountPercent ? `${item.discountPercent}%` : item.remark}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-900 font-black text-xs">
                    <td colSpan={3} className="p-2 text-right uppercase border-r border-slate-300">
                      Total:
                    </td>
                    <td className="p-2 text-right font-mono border-r border-slate-300 text-slate-950">
                      ৳{(viewingClosingStatement.totalNetSales || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="p-2 text-right font-mono border-r border-slate-300 text-emerald-800">
                      ৳{(viewingClosingStatement.totalCollections || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="p-2 text-right font-mono border-r border-slate-300 text-slate-950">
                      ৳{(viewingClosingStatement.balanceBeforeDiscounts || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="p-2 text-center text-[10px] text-slate-500">Statement Net Total</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Bottom Settlement Breakdown */}
            <div className="grid grid-cols-2 gap-6 pt-2">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-300 font-mono text-xs space-y-1.5">
                <div className="font-bold font-sans text-slate-800 text-[11px] uppercase border-b border-slate-200 pb-1">
                  Sales Summary
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Total Net Sales:</span>
                  <span className="font-bold text-slate-900">৳{(viewingClosingStatement.totalNetSales || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Total Collections:</span>
                  <span className="font-bold text-emerald-800">৳{(viewingClosingStatement.totalCollections || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1 font-bold">
                  <span className="text-slate-700">Balance Before Incentive:</span>
                  <span className="text-slate-950">৳{(viewingClosingStatement.balanceBeforeDiscounts || 0).toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-300 text-xs space-y-1.5">
                <div className="font-bold font-sans text-slate-800 text-[11px] uppercase border-b border-slate-200 pb-1 flex justify-between">
                  <span className="text-left">Settlement & Incentive Summary</span>
                  <span className="text-right">Amount</span>
                </div>
                <table className="w-full text-xs border-collapse">
                  <tbody>
                    <tr className="text-amber-900 font-bold border-b border-slate-200/50">
                      <td className="py-0.5 text-left">Annual Incentive:</td>
                      <td className="py-0.5 text-right font-mono font-bold whitespace-nowrap">
                        - ৳{(viewingClosingStatement.totalYearlyDiscount || 0).toLocaleString('en-IN')}
                      </td>
                    </tr>
                    <tr className="bg-amber-100/80 text-amber-950 font-black">
                      <td className="py-1 px-1.5 text-left rounded-l">Net Pay Amount:</td>
                      <td className="py-1 px-1.5 text-right font-mono font-black rounded-r whitespace-nowrap">
                        ৳{(viewingClosingStatement.netPayAmount || 0).toLocaleString('en-IN')}
                      </td>
                    </tr>
                    {(viewingClosingStatement.totalSpecialDiscount || 0) > 0 && (
                      <tr className="text-rose-800 font-bold border-b border-slate-200/50">
                        <td className="py-0.5 text-left">Special Discount:</td>
                        <td className="py-0.5 text-right font-mono font-bold whitespace-nowrap">
                          - ৳{(viewingClosingStatement.totalSpecialDiscount || 0).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    )}
                    {(viewingClosingStatement.settlementCollectionAmount || viewingClosingStatement.settlementCollection?.amount || 0) > 0 && (
                      <tr className="text-emerald-800 font-bold border-b border-slate-200/50">
                        <td className="py-0.5 text-left">
                          Settled Amount ({viewingClosingStatement.settlementCollection?.mrNo || 'MR-CLOSE'}{viewingClosingStatement.settlementCollection?.bankName ? ` - ${viewingClosingStatement.settlementCollection.bankName}` : ''}):
                        </td>
                        <td className="py-0.5 text-right font-mono font-bold whitespace-nowrap">
                          - ৳{(viewingClosingStatement.settlementCollectionAmount || viewingClosingStatement.settlementCollection?.amount || 0).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    )}
                    <tr className="border-t-2 border-slate-900 font-black text-slate-950 text-sm">
                      <td className="pt-1.5 text-left">Closing Balance:</td>
                      <td className="pt-1.5 text-right font-mono font-black text-emerald-700 whitespace-nowrap">
                        ৳{(viewingClosingStatement.totalNetClosingBalance || 0).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Signature Block */}
            <div className="grid grid-cols-2 gap-8 pt-10 text-xs">
              <div className="text-center">
                <div className="border-t border-slate-800 pt-1.5 font-bold text-slate-800">
                  Customer Signature
                </div>
                <span className="text-[10px] text-slate-500">{viewingClosingStatement.partyName}</span>
              </div>
              <div className="text-center">
                <div className="border-t border-slate-800 pt-1.5 font-bold text-slate-800">
                  Authorized Signatory
                </div>
                <span className="text-[10px] text-slate-500">NEW SONCHITA ENTERPRISE</span>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
