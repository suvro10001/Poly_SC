import React, { useState, useMemo, useEffect, useRef } from 'react';
import { StoredBill, Item, Party, Salesperson, BranchLocation, CompanyDetails, AuthUser } from '../types';
import { isSuperAdminOrAgm, isStrictSuperAdmin, isAccountsAdmin, isAnyAdmin, filterBranchesForUser, filterSalespersonsByBranch, billMatchesBranch, cleanBranchName, getUserLoginFilters } from '../utils/branchAccess';
import { parseDateToISO, formatDateDDMMYY, getTodayISO } from '../utils/dateUtils';
import { categorizeCableItem, getAllCategories } from '../utils/categoryHelper';
import { matchesFlexibleSearch, getCategorySerialRank } from '../utils/searchHelper';
import { SalesCenterSearchFilter } from './SalesCenterSearchFilter';
import { StandardPeriodFilterBar } from './StandardPeriodFilterBar';
import { StandardPeriodPreset, calculatePeriodDates } from '../utils/standardPeriodHelper';
import * as XLSX from 'xlsx';
import {
  PackageCheck,
  Search,
  Download,
  Printer,
  Calendar,
  Clock,
  Layers,
  Building2,
  UserCheck,
  RotateCcw,
  ArrowLeft,
  DollarSign,
  Boxes,
  FileSpreadsheet,
  FileText
} from 'lucide-react';

interface SalesReportItemViewProps {
  storedBills: StoredBill[];
  items?: Item[];
  parties?: Party[];
  salespersons?: Salesperson[];
  branches?: BranchLocation[];
  company?: CompanyDetails;
  currentUser?: AuthUser | null;
  onBack?: () => void;
}

export const SalesReportItemView: React.FC<SalesReportItemViewProps> = ({
  storedBills,
  items = [],
  parties = [],
  salespersons = [],
  branches = [],
  company,
  currentUser,
  onBack
}) => {
  const isSuperAdmin = isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser) || isSuperAdminOrAgm(currentUser) || isAnyAdmin(currentUser);
  const userInit = useMemo(() => getUserLoginFilters(currentUser, salespersons, branches), [currentUser, salespersons, branches]);

  const allowedBranches = useMemo(
    () => filterBranchesForUser(branches || [], currentUser, salespersons),
    [branches, currentUser, salespersons]
  );
  const canViewAllCenters = isSuperAdmin || allowedBranches.length > 1;
  const isBranchLocked = !isSuperAdmin && allowedBranches.length <= 1;

  // Filters State
  const [billTypeFilter, setBillTypeFilter] = useState<'all' | 'regular' | 'office'>('all');
  const [selectedBranch, setSelectedBranch] = useState<string>(() => {
    if (isSuperAdmin) return 'all';
    if (!canViewAllCenters && allowedBranches.length > 0) return allowedBranches[0].id;
    return userInit.branchId || 'all';
  });
  const lastItemReportUserKeyRef = useRef<string>('');
  useEffect(() => {
    const userKey = `${currentUser?.username || ''}::${currentUser?.salespersonCode || ''}::${currentUser?.branchId || ''}::${currentUser?.role || ''}`;
    const userChanged = lastItemReportUserKeyRef.current !== '' && lastItemReportUserKeyRef.current !== userKey;
    lastItemReportUserKeyRef.current = userKey;

    if (isSuperAdmin) {
      if (userChanged) setSelectedBranch('all');
      return;
    }

    if (!canViewAllCenters && allowedBranches.length > 0) {
      setSelectedBranch(allowedBranches[0].id);
    } else if (userChanged) {
      setSelectedBranch(userInit.branchId || 'all');
    } else if (!canViewAllCenters && userInit.branchId) {
      setSelectedBranch(userInit.branchId);
    }
  }, [currentUser, isSuperAdmin, canViewAllCenters, allowedBranches, userInit.branchId]);

  const [selectedSalesperson, setSelectedSalesperson] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [datePreset, setDatePreset] = useState<StandardPeriodPreset>(() => {
    try { return (sessionStorage.getItem('polycables_sales_item_date_preset') as StandardPeriodPreset) || 'all'; } catch { return 'all'; }
  });
  const [startDate, setStartDate] = useState<string>(() => {
    try { return sessionStorage.getItem('polycables_sales_item_start_date') || ''; } catch { return ''; }
  });
  const [endDate, setEndDate] = useState<string>(() => {
    try { return sessionStorage.getItem('polycables_sales_item_end_date') || ''; } catch { return ''; }
  });
  const [fromDateText, setFromDateText] = useState<string>(() => {
    try { return sessionStorage.getItem('polycables_sales_item_from_text') || ''; } catch { return ''; }
  });
  const [toDateText, setToDateText] = useState<string>(() => {
    try { return sessionStorage.getItem('polycables_sales_item_to_text') || ''; } catch { return ''; }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem('polycables_sales_item_date_preset', datePreset);
      sessionStorage.setItem('polycables_sales_item_start_date', startDate);
      sessionStorage.setItem('polycables_sales_item_end_date', endDate);
      sessionStorage.setItem('polycables_sales_item_from_text', fromDateText);
      sessionStorage.setItem('polycables_sales_item_to_text', toDateText);
    } catch {}
  }, [datePreset, startDate, endDate, fromDateText, toDateText]);
  const [sortBy, setSortBy] = useState<'qty_desc' | 'amount_desc' | 'name_asc'>('qty_desc');
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

  // Branch Options scoped to user/admin
  const branchOptions = useMemo(() => {
    return allowedBranches.map(b => ({
      id: b.id,
      name: b.name,
      label: b.name
    }));
  }, [allowedBranches]);

  const branchFilteredSalespersons = useMemo(
    () => filterSalespersonsByBranch(salespersons || [], selectedBranch === 'all' ? 'ALL' : selectedBranch, allowedBranches, currentUser),
    [salespersons, selectedBranch, allowedBranches, currentUser]
  );

  // Date Preset Handler
  const handleDatePresetChange = (preset: StandardPeriodPreset) => {
    setDatePreset(preset);
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
      setFromDateText('');
      setToDateText('');
      return;
    }
    if (preset === 'custom') {
      return;
    }
    const range = calculatePeriodDates(preset);
    setFromDateText(range.startDate);
    setToDateText(range.endDate);
    setStartDate(parseDateToISO(range.startDate) || '');
    setEndDate(parseDateToISO(range.endDate) || '');
  };

  const handleResetFilters = () => {
    setBillTypeFilter('all');
    if (canViewAllCenters) {
      setSelectedBranch('all');
    } else if (allowedBranches.length > 0) {
      setSelectedBranch(allowedBranches[0].id);
    }
    setSelectedSalesperson('all');
    setSearchQuery('');
    handleDatePresetChange('all');
    setSortBy('qty_desc');
  };

  // Filter Stored Bills by criteria
  const filteredBills = useMemo(() => {
    return (storedBills || []).filter((bill) => {
      // 1. Bill Type
      const isOffice = Boolean(bill.isOfficeBill || bill.header?.isOfficeBill || bill.copyStatus === 'office');
      if (billTypeFilter === 'regular' && isOffice) return false;
      if (billTypeFilter === 'office' && !isOffice) return false;

      // 2. Sales Center (Branch)
      if (selectedBranch && selectedBranch !== 'all') {
        if (!billMatchesBranch(bill, selectedBranch, branches, salespersons, parties)) {
          return false;
        }
      } else if (!isSuperAdmin && allowedBranches.length > 0) {
        if (!allowedBranches.some((ab) => billMatchesBranch(bill, ab.id, allowedBranches, salespersons, parties))) {
          return false;
        }
      }

      // 3. Salesperson
      if (selectedSalesperson && selectedSalesperson !== 'all') {
        const smName = (bill.header?.salesmanName || (bill as any).salespersonName || '').trim().toLowerCase();
        if (smName !== selectedSalesperson.trim().toLowerCase()) {
          return false;
        }
      }

      // 4. Date Range
      const billDateStr = bill.header?.date || bill.savedAt || bill.date;
      const billIso = parseDateToISO(billDateStr);
      if (startDate && billIso && billIso < startDate) return false;
      if (endDate && billIso && billIso > endDate) return false;

      return true;
    });
  }, [storedBills, billTypeFilter, selectedBranch, selectedSalesperson, startDate, endDate, branches, salespersons, parties]);

  // Aggregate items from filtered bills (STRICTLY NO SIZE / SPEC)
  const aggregatedItems = useMemo(() => {
    const map = new Map<
      string,
      {
        itemName: string;
        category: string;
        unit: string;
        totalQty: number;
        totalAmount: number;
        invoiceCount: number;
        avgRate: number;
      }
    >();

    filteredBills.forEach((bill) => {
      const rawLines: any[] = (bill.lines && Array.isArray(bill.lines) && bill.lines.length > 0)
        ? bill.lines
        : ((bill as any).items && Array.isArray((bill as any).items))
        ? (bill as any).items
        : [];

      rawLines.forEach((line) => {
        const rawCode = (line.itemCode || line.code || '').trim();
        const rawName = (line.itemDescription || line.itemName || line.name || 'Unknown Item').trim();

        // Lookup master item for clean name/category/unit if needed
        const masterItem = items.find(
          (m) =>
            (m.name && m.name.toLowerCase() === rawName.toLowerCase()) ||
            (rawCode && m.code && m.code.toLowerCase() === rawCode.toLowerCase())
        );

        // Active items only requirement: Inactive items do not show in sales items report
        if (masterItem && masterItem.isActive === false) {
          return;
        }

        const itemName = (masterItem?.name || rawName).trim();
        const key = itemName.toLowerCase();
        if (!key) return;

        const masterUnit = (masterItem?.unit || '').trim();
        const rawUnit = (line.unit || masterUnit || '').trim();
        const rawDesc = (line.itemDescription || line.itemName || rawName).toLowerCase();
        const catLower = (line.category || masterItem?.category || '').toLowerCase();
        const isMeter = /^(meter|meters|mtr|mtrs|m)$/i.test(rawUnit) ||
                        /\b(meter|meters|mtr|mtrs)\b/i.test(rawUnit) ||
                        /^(meter|meters|mtr|mtrs|m)$/i.test(masterUnit) ||
                        /\b(meter|meters|mtr|mtrs)\b/i.test(masterUnit) ||
                        /\b(meter|meters|mtr|mtrs)\b/i.test(rawDesc) ||
                        catLower.includes('arial') || catLower.includes('aerial') ||
                        rawDesc.includes('arial') || rawDesc.includes('aerial') ||
                        /\bd-\s*1[12]\b/i.test(rawDesc) ||
                        /\b\d+\s*m(?:eter)?\b/i.test(rawDesc);

        const rawQty = Number(line.coilQty ?? line.quantity ?? line.totalCoil ?? 0);
        // If line or item is in meters, convert to equivalent coils (1 coil = 100 meters)
        const qty = isMeter ? (rawQty / 100) : rawQty;
        const amount = Number(line.amount ?? line.totalAmount ?? (rawQty * Number(line.rate || 0)));

        const rawCat = (line.category || masterItem?.category || '').trim();
        const rawCatLow = rawCat.toLowerCase();
        const isGeneralRaw = !rawCat || rawCatLow === 'general' || rawCatLow === 'general wire' || rawCatLow === 'general cables';
        const category = !isGeneralRaw
          ? rawCat
          : categorizeCableItem(itemName, (masterItem as any)?.sizeSpec || (masterItem as any)?.spec);
        const unit = isMeter ? 'Coils' : (rawUnit || 'Coils');

        if (!map.has(key)) {
          map.set(key, {
            itemName: itemName,
            category: category,
            unit: unit,
            totalQty: 0,
            totalAmount: 0,
            invoiceCount: 0,
            avgRate: 0
          });
        }

        const entry = map.get(key)!;
        entry.totalQty += qty;
        entry.totalAmount += amount;
        entry.invoiceCount += 1;
        if (isMeter || entry.unit.toLowerCase().includes('meter') || entry.unit.toLowerCase().includes('mtr')) {
          entry.unit = 'Coils';
        }
      });
    });

    let list = Array.from(map.values()).map((entry) => ({
      ...entry,
      avgRate: entry.totalQty > 0 ? entry.totalAmount / entry.totalQty : 0
    }));

    // Search query filter
    if (searchQuery.trim()) {
      list = list.filter((i) =>
        matchesFlexibleSearch(`${i.itemName} ${i.category || ''}`, searchQuery)
      );
    }

    // Sort (when searching items, group/order strictly by user's configured category list order first)
    const isSearching = Boolean(searchQuery.trim());
    list.sort((a, b) => {
      if (isSearching) {
        const rankA = getCategorySerialRank(a.category, categoryOrder);
        const rankB = getCategorySerialRank(b.category, categoryOrder);
        if (rankA !== rankB) return rankA - rankB;
        const catCmp = (a.category || '').localeCompare(b.category || '', undefined, { numeric: true, sensitivity: 'base' });
        if (rankA >= 9000 && catCmp !== 0) return catCmp;
      }
      if (sortBy === 'qty_desc') return b.totalQty - a.totalQty;
      if (sortBy === 'amount_desc') return b.totalAmount - a.totalAmount;
      return a.itemName.localeCompare(b.itemName);
    });

    return list;
  }, [filteredBills, items, searchQuery, sortBy, categoryOrder]);

  // Overall Totals
  const totalQtySold = useMemo(() => aggregatedItems.reduce((acc, curr) => acc + curr.totalQty, 0), [aggregatedItems]);
  const totalSalesRevenue = useMemo(() => aggregatedItems.reduce((acc, curr) => acc + curr.totalAmount, 0), [aggregatedItems]);
  const totalBillsCount = filteredBills.length;

  // Export to Excel (NO Item Code & NO Size / Spec)
  const handleExportExcel = () => {
    const rows = aggregatedItems.map((item, idx) => ({
      'SL#': idx + 1,
      'Items Name': item.itemName,
      'Category': item.category,
      'Unit': item.unit,
      'Price / Unit (Tk)': Math.round(item.avgRate * 100) / 100,
      'Sold Coils / Qty': item.totalQty,
      'Total Sales (Tk)': Math.round(item.totalAmount * 100) / 100,
      'Bills Count': item.invoiceCount
    }));

    // Summary footer row
    rows.push({
      'SL#': 'TOTAL' as any,
      'Items Name': `Total ${aggregatedItems.length} Distinct Items`,
      'Category': '',
      'Unit': '',
      'Price / Unit (Tk)': '' as any,
      'Sold Coils / Qty': totalQtySold,
      'Total Sales (Tk)': Math.round(totalSalesRevenue * 100) / 100,
      'Bills Count': totalBillsCount
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Items Report');
    const filename = `Sales_Items_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const handlePrint = () => {
    window.print();
  };

  const hasActiveFilters = billTypeFilter !== 'all' || selectedBranch !== 'all' || selectedSalesperson !== 'all' || searchQuery || datePreset !== 'this_month';

  return (
    <div className="space-y-4">
      {/* Top Banner / Navigation */}
      <div className="cyber-glass-header text-white p-4 rounded-2xl shadow-lg border border-cyan-500/25 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-cyan-500/15 border border-cyan-400/30 rounded-xl">
            <PackageCheck className="w-6 h-6 text-cyan-300" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
              <span>Sales Items Report</span>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-cyan-500/15 text-cyan-300 border border-cyan-400/30 px-2 py-0.5 rounded-full">
                Item Performance
              </span>
            </h1>
            <p className="text-xs text-cyan-100/80 font-medium">
              Item-by-item sales performance across Showroom & Office bills
            </p>
          </div>
        </div>

        {/* Action Buttons & Right Side Back Sign Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black rounded-xl border border-emerald-400/50 shadow-sm flex items-center space-x-1.5 transition-colors cursor-pointer"
            title="Export Report to Excel"
          >
            <Download className="w-4 h-4" />
            <span>Export (.xlsx)</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-black rounded-xl shadow-sm flex items-center space-x-1.5 transition-colors cursor-pointer"
            title="Print Report"
          >
            <Printer className="w-4 h-4" />
            <span>Print</span>
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 hover:text-white rounded-xl border border-cyan-500/25 transition-colors cursor-pointer shadow-xs ml-1"
              title="Go Back"
            >
              <ArrowLeft className="w-4 h-4 text-cyan-300" />
            </button>
          )}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="cyber-glass-subcard p-3.5 rounded-xl border border-cyan-500/25 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase flex items-center justify-between">
            <span>Distinct Items</span>
            <Boxes className="w-4 h-4 text-cyan-300" />
          </div>
          <div className="text-2xl font-black text-white font-mono mt-1">
            {aggregatedItems.length}
          </div>
          <div className="text-[10px] text-slate-400 font-medium mt-0.5">Sold Products</div>
        </div>

        <div className="cyber-glass-subcard p-3.5 rounded-xl border border-cyan-500/25 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase flex items-center justify-between">
            <span>Total Qty Sold</span>
            <PackageCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-300 font-mono mt-1">
            {totalQtySold.toLocaleString('en-IN')}
          </div>
          <div className="text-[10px] text-slate-400 font-medium mt-0.5">Coils / Units</div>
        </div>

        <div className="cyber-glass-subcard p-3.5 rounded-xl border border-cyan-500/25 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase flex items-center justify-between">
            <span>Total Sales</span>
            <DollarSign className="w-4 h-4 text-cyan-300" />
          </div>
          <div className="text-2xl font-black text-cyan-300 font-mono mt-1">
            ৳{Math.round(totalSalesRevenue).toLocaleString('en-IN')}
          </div>
          <div className="text-[10px] text-slate-400 font-medium mt-0.5">Net BDT Amount</div>
        </div>

        <div className="cyber-glass-subcard p-3.5 rounded-xl border border-cyan-500/25 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase flex items-center justify-between">
            <span>Invoices Count</span>
            <FileText className="w-4 h-4 text-purple-300" />
          </div>
          <div className="text-2xl font-black text-purple-300 font-mono mt-1">
            {totalBillsCount}
          </div>
          <div className="text-[10px] text-slate-400 font-medium mt-0.5">Bills Analyzed</div>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="bg-[#081e2d]/85 backdrop-blur-xl p-2.5 px-3.5 rounded-2xl border border-cyan-500/25 shadow-lg text-white text-xs space-y-2">
        {/* Row 1: Primary Dimensions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Bill Type Filter */}
          <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
            <Layers className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
            <span className="font-bold text-cyan-200/80 text-[11px] whitespace-nowrap">Bill Type:</span>
            <select
              value={billTypeFilter}
              onChange={(e) => setBillTypeFilter(e.target.value as any)}
              className="bg-transparent text-cyan-100 font-bold text-xs focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-[#091e2c] text-white">Both (Office & Showroom)</option>
              <option value="regular" className="bg-[#091e2c] text-white">Showroom Bills Only</option>
              <option value="office" className="bg-[#091e2c] text-white">Office Bills Only</option>
            </select>
          </div>

          {/* Sales Center (Branch) Filter */}
          <SalesCenterSearchFilter
            value={selectedBranch}
            onChange={(newBranch) => {
              setSelectedBranch(newBranch);
              if (selectedSalesperson !== 'all') {
                const validInNew = filterSalespersonsByBranch(
                  salespersons || [],
                  newBranch === 'all' ? 'ALL' : newBranch,
                  allowedBranches,
                  currentUser
                );
                if (!validInNew.some((sp) => sp.name.trim().toLowerCase() === selectedSalesperson.trim().toLowerCase())) {
                  setSelectedSalesperson('all');
                }
              }
            }}
            options={branchOptions}
            isLocked={isBranchLocked}
            includeAllOption={canViewAllCenters}
            allOptionLabel={isSuperAdmin ? 'All Sales Centers' : `All My Centers (${branchOptions.length})`}
            allOptionValue="all"
            label="Sales Center:"
            theme="dark"
            size="xs"
            widthClass="min-w-[170px] max-w-[220px]"
          />

          {/* Salesperson Filter */}
          <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
            <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-bold text-cyan-200/80 text-[11px] whitespace-nowrap">Salesman:</span>
            <select
              value={selectedSalesperson}
              onChange={(e) => setSelectedSalesperson(e.target.value)}
              className="bg-transparent text-cyan-100 font-bold text-xs max-w-[160px] truncate focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-[#091e2c] text-white">All Salesmen ({branchFilteredSalespersons.length})</option>
              {branchFilteredSalespersons.map((sp) => (
                <option key={sp.id} value={sp.name} className="bg-[#091e2c] text-white">
                  {sp.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
            <span className="font-bold text-cyan-200/80 text-[11px] whitespace-nowrap">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-cyan-100 font-bold text-xs focus:outline-none cursor-pointer"
            >
              <option value="qty_desc" className="bg-[#091e2c] text-white">Highest Quantity</option>
              <option value="amount_desc" className="bg-[#091e2c] text-white">Highest Revenue (Tk)</option>
              <option value="name_asc" className="bg-[#091e2c] text-white">Item Name (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Row 2: Date Filters & Search */}
        <div className="pt-2 border-t border-cyan-500/20 flex flex-wrap items-center justify-between gap-2">
          {/* Standard Period Filter Bar */}
          <StandardPeriodFilterBar
            period={datePreset}
            onSelectPeriod={handleDatePresetChange}
            customStartDate={fromDateText}
            customEndDate={toDateText}
            onCustomStartDateChange={(val) => {
              setFromDateText(val);
              setDatePreset('custom');
              setStartDate(val.trim() ? (parseDateToISO(val) || '') : '');
            }}
            onCustomEndDateChange={(val) => {
              setToDateText(val);
              setDatePreset('custom');
              setEndDate(val.trim() ? (parseDateToISO(val) || '') : '');
            }}
            theme="dark"
          />

          {/* Search Box & Reset */}
          <div className="flex items-center gap-2 flex-1 max-w-md justify-end">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search items by name, category..."
                className="w-full pl-8 pr-7 py-1.5 h-[34px] text-xs bg-[#061520]/90 text-white placeholder-slate-400 border border-cyan-500/30 rounded-xl font-medium focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1 h-[34px] text-xs font-bold text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/35 rounded-xl transition-colors cursor-pointer shrink-0"
                title="Reset Filters"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-300" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Table (STRICTLY NO ITEM CODE & NO SIZE / SPEC COLUMN) */}
      <div className="cyber-glass-card rounded-2xl border border-cyan-500/25 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#0c2638] text-cyan-200 sticky top-0 text-[11px] font-bold tracking-wider uppercase">
              <tr>
                <th className="p-3 text-center w-12 border-b border-cyan-500/30"># (SL)</th>
                <th className="p-3 border-b border-cyan-500/30">Items Name</th>
                <th className="p-3 w-36 border-b border-cyan-500/30">Category</th>
                <th className="p-3 w-20 text-center border-b border-cyan-500/30">Unit</th>
                <th className="p-3 w-28 text-right border-b border-cyan-500/30">Price / Unit (Tk)</th>
                <th className="p-3 w-32 text-right bg-emerald-950/70 text-emerald-300 border-b border-cyan-500/30">
                  Sold Coils / Qty
                </th>
                <th className="p-3 w-36 text-right bg-cyan-950/70 text-cyan-300 border-b border-cyan-500/30">
                  Total Sales (Tk)
                </th>
                <th className="p-3 w-24 text-center border-b border-cyan-500/30">Bills Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200 font-medium">
              {aggregatedItems.map((item, idx) => {
                const isSearching = Boolean(searchQuery.trim());
                const prevCat = idx > 0 ? (aggregatedItems[idx - 1].category || 'Uncategorized') : '';
                const curCat = item.category || 'Uncategorized';
                const showCatHeader = isSearching && (idx === 0 || curCat.toLowerCase() !== prevCat.toLowerCase());
                const catCount = showCatHeader
                  ? aggregatedItems.filter((x) => (x.category || 'Uncategorized').toLowerCase() === curCat.toLowerCase()).length
                  : 0;
                return (
                  <React.Fragment key={`${item.itemName}-${idx}`}>
                    {showCatHeader && (
                      <tr className="bg-[#0c2638] border-y border-cyan-500/30">
                        <td colSpan={8} className="px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-cyan-300">
                          {curCat} ({catCount})
                        </td>
                      </tr>
                    )}
                    <tr className="hover:bg-cyan-500/[0.06] transition-colors">
                      <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                      <td className="p-3 font-bold text-white">{item.itemName}</td>
                      <td className="p-3 text-slate-300">{item.category}</td>
                      <td className="p-3 text-center text-slate-300 font-semibold">{item.unit}</td>
                      <td className="p-3 text-right font-mono font-semibold text-slate-200">
                        ৳{item.avgRate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right font-mono font-black text-emerald-300 text-sm bg-emerald-500/[0.05]">
                        {Number.isInteger(item.totalQty) ? item.totalQty.toLocaleString('en-IN') : item.totalQty.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-cyan-300 bg-cyan-500/[0.05]">
                        ৳{Number(item.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-center font-mono text-slate-300 font-semibold">
                        {item.invoiceCount}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}

              {aggregatedItems.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-400 font-medium">
                    <Boxes className="w-10 h-10 mx-auto text-cyan-400/50 mb-2" />
                    <p className="text-sm font-bold text-slate-300">No sold items found matching the selected criteria.</p>
                    <p className="text-xs text-slate-400 mt-1">Try adjusting the date range or sales center filters.</p>
                  </td>
                </tr>
              )}
            </tbody>
            {aggregatedItems.length > 0 && (
              <tfoot className="bg-[#0c2638] text-white font-bold text-xs border-t-2 border-cyan-500/30">
                <tr>
                  <td colSpan={5} className="p-3 text-right uppercase tracking-wider text-cyan-200">
                    Total ({aggregatedItems.length} Distinct Products):
                  </td>
                  <td className="p-3 text-right font-mono font-black text-emerald-300 text-sm">
                    {totalQtySold.toLocaleString('en-IN')}
                  </td>
                  <td className="p-3 text-right font-mono font-black text-cyan-300 text-sm">
                    ৳{Math.round(totalSalesRevenue).toLocaleString('en-IN')}
                  </td>
                  <td className="p-3 text-center font-mono text-slate-300">
                    {totalBillsCount}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
