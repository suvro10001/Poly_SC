import React, { useState, useMemo, useEffect } from 'react';
import {
  StoredBill,
  Item,
  Party,
  Salesperson,
  CompanyDetails,
  Requisition,
  CollectionMR,
  BankDeposit,
  BranchLocation
} from '../types';
import { defaultBranches } from '../data/defaultData';
import {
  X,
  Sparkles,
  TrendingUp,
  BarChart3,
  Calendar,
  Layers,
  ArrowRight,
  Printer,
  Download,
  AlertCircle,
  CheckCircle2,
  Boxes,
  Truck,
  Search,
  Filter,
  ArrowLeft,
  RefreshCw,
  Sliders,
  DollarSign,
  ShieldCheck,
  PackageCheck,
  TrendingDown,
  Wallet,
  ChevronDown,
  ChevronUp,
  Activity,
  FileText,
  Building2
} from 'lucide-react';
import { SalesCenterSearchFilter } from './SalesCenterSearchFilter';
import { parseDateToISO, formatDateDDMMYY } from '../utils/dateUtils';
import { useAutoPrintOnOpen } from '../hooks/useAutoPrintOnOpen';
import { sortItemsCategorySerialWise, matchesFlexibleSearch, getCategorySerialRank } from '../utils/searchHelper';
import { getAllCategories, isColorApplicableCable } from '../utils/categoryHelper';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import * as XLSX from 'xlsx';

// Helper: Convert line items to coils (100m = 1 coil for duplex/meter-based items)
const getLineCoilQty = (line: any): number => {
  const rawQty = Number(line.coilQty ?? line.quantity ?? line.qty ?? 0) || 0;
  const unit = (line.unit || '').trim().toLowerCase();
  const desc = (line.itemDescription || line.description || line.name || line.itemName || '').trim().toLowerCase();
  const isMeter =
    unit === 'meter' ||
    unit === 'mtr' ||
    unit === 'm' ||
    desc.includes('duplex') ||
    desc.includes('aerial cable') ||
    desc.includes('service drop');
  if (isMeter && rawQty > 0) {
    return Math.round((rawQty / 100) * 100) / 100;
  }
  return rawQty;
};

export type ForecastHorizonType = 'next_month' | 'rest_of_year' | 'this_year' | 'next_year' | 'custom_range';

export interface MonthlyAuditRecord {
  month: string; // YYYY-MM
  displayMonth: string; // e.g. "Jun 2026"
  billsCount: number;
  salesAmount: number;
  coilsSold: number;
  collectionAmount: number;
  collectionEfficiency: number; // %
  variance: number; // sales - collection
}

interface AISalesForecastModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: any;
  storedBills: StoredBill[];
  collections?: CollectionMR[];
  bankDeposits?: BankDeposit[];
  items: Item[];
  parties: Party[];
  salespersons: Salesperson[];
  company: CompanyDetails;
  requisitions?: Requisition[];
  onNavigateToRequisitions?: () => void;
  branches?: BranchLocation[];
}

export const AISalesForecastModal: React.FC<AISalesForecastModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  storedBills = [],
  collections = [],
  bankDeposits = [],
  items = [],
  parties = [],
  salespersons = [],
  company,
  requisitions = [],
  onNavigateToRequisitions,
  branches = defaultBranches
}) => {
  const effectiveCurrentUser = useMemo(() => {
    if (currentUser) return currentUser;
    try {
      const saved = localStorage.getItem('app_current_user');
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  }, [currentUser]);

  const isSuperAdminUser = useMemo(() => {
    if (!effectiveCurrentUser) return false;
    const username = String(effectiveCurrentUser.username || effectiveCurrentUser.code || '').toLowerCase().trim();
    if (username === 'suvroadmin') return true;
    if (effectiveCurrentUser.isSuperAdmin === true) return true;
    const role = String(effectiveCurrentUser.role || effectiveCurrentUser.userRole || '').toLowerCase().trim();
    if (role === 'super_admin' || role === 'super admin' || role.includes('super')) return true;
    return false;
  }, [effectiveCurrentUser]);

  const isAdminUser = useMemo(() => {
    if (!effectiveCurrentUser) return false;
    const role = String(effectiveCurrentUser.role || effectiveCurrentUser.userRole || effectiveCurrentUser.designation || '').toLowerCase();
    return role.includes('admin') || role.includes('director') || role.includes('agm') || role.includes('dgm');
  }, [effectiveCurrentUser]);

  // Allowed branches for this user: If Admin and not Super Admin, strictly isolate to their assigned branches
  const allowedBranches = useMemo(() => {
    const rawList = (branches && branches.length > 0) ? branches : defaultBranches;
    if (isSuperAdminUser || !isAdminUser) {
      return rawList;
    }

    const userAdminId = String(effectiveCurrentUser.id || effectiveCurrentUser.code || '').toLowerCase().trim();
    const userAdminUsername = String(effectiveCurrentUser.username || '').toLowerCase().trim();
    const userAdminName = String(effectiveCurrentUser.name || '').toLowerCase().trim();

    const spProfile = salespersons.find(
      (s) =>
        (s.id && String(s.id).toLowerCase() === userAdminId) ||
        (s.code && String(s.code).toLowerCase() === userAdminId) ||
        (s.username && String(s.username).toLowerCase() === userAdminUsername)
    );

    const assignedIds = new Set<string>();
    if (Array.isArray(effectiveCurrentUser.assignedBranchIds)) {
      effectiveCurrentUser.assignedBranchIds.forEach((id: string) => assignedIds.add(String(id).toLowerCase().trim()));
    }
    if (spProfile && Array.isArray(spProfile.assignedBranchIds)) {
      spProfile.assignedBranchIds.forEach((id: string) => assignedIds.add(String(id).toLowerCase().trim()));
    }

    const filtered = rawList.filter((b) => {
      const bId = String(b.id || '').toLowerCase().trim();
      if (assignedIds.has(bId)) return true;
      if (b.adminId && String(b.adminId).toLowerCase().trim() === userAdminId) return true;
      if (b.assignedAdminId && String(b.assignedAdminId).toLowerCase().trim() === userAdminId) return true;
      if (b.adminUsername && String(b.adminUsername).toLowerCase().trim() === userAdminUsername) return true;
      if (b.adminName && userAdminName && String(b.adminName).toLowerCase().includes(userAdminName)) return true;
      return false;
    });

    return filtered.length > 0 ? filtered : rawList;
  }, [branches, effectiveCurrentUser, isSuperAdminUser, isAdminUser, salespersons]);

  const branchList = allowedBranches;

  const [selectedBranchId, setSelectedBranchId] = useState<string>('ALL');
  const [expandedQtyItemId, setExpandedQtyItemId] = useState<string | null>(null);

  const getBillBranchId = (b: any): string => {
    if (b.header?.branchId) return b.header.branchId;
    if (b.branchId) return b.branchId;
    if (b.header?.salesmanCode) {
      const sp = salespersons.find((s) => s.code === b.header.salesmanCode);
      if (sp?.branchId) return sp.branchId;
    }
    return 'branch-1';
  };

  const [forecastHorizon, setForecastHorizon] = useState<ForecastHorizonType>('next_month');
  const [growthFactor, setGrowthFactor] = useState<number>(10); // +10% expected growth
  const [searchItem, setSearchItem] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<'all' | 'reorder_only' | 'sufficient_only'>('all');
  const [sortMode, setSortMode] = useState<'master_order' | 'highest_demand' | 'highest_revenue' | 'highest_shortfall' | 'name_asc'>('master_order');
  const [showMonthlyHistoryTable, setShowMonthlyHistoryTable] = useState<boolean>(false);
  const [showGrowthChart, setShowGrowthChart] = useState<boolean>(false);

  // Exact Rest Day of the Year Calculation
  const remainingDaysInYear = useMemo(() => {
    const today = new Date();
    const endOfYear = new Date(today.getFullYear(), 11, 31, 23, 59, 59);
    const diffMs = endOfYear.getTime() - today.getTime();
    return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }, []);

  const remainingMonthsInYear = useMemo(() => {
    return Math.max(0.1, Math.round((remainingDaysInYear / 30.44) * 10) / 10);
  }, [remainingDaysInYear]);

  // Custom Range Parameters (Dates and Days)
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().substring(0, 10);
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().substring(0, 10);
  });
  const [customStartMonth, setCustomStartMonth] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().substring(0, 7);
  });
  const [customEndMonth, setCustomEndMonth] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().substring(0, 7);
  });
  const [customMonthsCount, setCustomMonthsCount] = useState<number>(3);

  const customRangeDays = useMemo(() => {
    if (customStartDate && customEndDate) {
      const s = new Date(customStartDate);
      const e = new Date(customEndDate);
      const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (diff > 0) return diff;
    }
    return Math.max(1, Math.round(customMonthsCount * 30.44));
  }, [customStartDate, customEndDate, customMonthsCount]);

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

  // Categories
  const categories = useMemo(() => ['All', ...categoryOrder], [categoryOrder]);

  // Compute horizon months dynamically
  const horizonMonths = useMemo(() => {
    switch (forecastHorizon) {
      case 'next_month':
        return 1;
      case 'rest_of_year':
      case 'this_year':
        return remainingMonthsInYear;
      case 'next_year':
        return 12;
      case 'custom_range': {
        const mo = Math.round((customRangeDays / 30.44) * 10) / 10;
        return Math.max(0.1, mo);
      }
      default:
        return 1;
    }
  }, [forecastHorizon, remainingMonthsInYear, customRangeDays]);

  const horizonLabel = useMemo(() => {
    const currentYear = new Date().getFullYear();
    switch (forecastHorizon) {
      case 'next_month':
        return 'Next Month Sales Idea (1 Month)';
      case 'rest_of_year':
      case 'this_year':
        return `Rest Day of the Year ${currentYear} (${remainingDaysInYear} Days / ~${remainingMonthsInYear} Mo)`;
      case 'next_year':
        return `Next Year ${currentYear + 1} (Full 12 Months)`;
      case 'custom_range':
        return `Custom Range: ${formatDateDDMMYY(customStartDate)} to ${formatDateDDMMYY(customEndDate)} (${customRangeDays} Days / ~${horizonMonths} Mo)`;
      default:
        return `${horizonMonths} Month`;
    }
  }, [forecastHorizon, remainingDaysInYear, remainingMonthsInYear, customStartDate, customEndDate, customRangeDays, horizonMonths]);

  const growthMultiplier = 1 + growthFactor / 100;

  // Master Item Directory Order Map (Exact Price List Sequence SL 1, 2, 3...)
  const masterOrderedItems = useMemo(() => {
    return sortItemsCategorySerialWise(items, categoryOrder);
  }, [items, categoryOrder]);

  const masterSerialMap = useMemo(() => {
    const map = new Map<string, number>();
    masterOrderedItems.forEach((it, idx) => {
      map.set(it.id, idx + 1);
      if (it.code) map.set(it.code, idx + 1);
    });
    return map;
  }, [masterOrderedItems]);

  // Comprehensive Monthly Historical Audit: Analyzes previous every month sales AND collections
  const historicalMonthlyAudit = useMemo((): MonthlyAuditRecord[] => {
    const monthMap = new Map<
      string,
      { billsCount: number; salesAmount: number; coilsSold: number; collectionAmount: number }
    >();

    // 1. Process stored bills for sales & coils
    storedBills.forEach((b) => {
      const iso = parseDateToISO(b.header?.date || b.savedAt);
      if (!iso || iso.length < 7) return;
      const yrMonth = iso.substring(0, 7); // YYYY-MM
      const amount = Number(b.grandTotal || b.subtotal || 0);

      let coils = 0;
      const billLines = Array.isArray(b.lines) ? b.lines : Array.isArray((b as any).items) ? (b as any).items : [];
      billLines.forEach((line: any) => {
        coils += getLineCoilQty(line);
      });

      if (!monthMap.has(yrMonth)) {
        monthMap.set(yrMonth, { billsCount: 0, salesAmount: 0, coilsSold: 0, collectionAmount: 0 });
      }
      const cur = monthMap.get(yrMonth)!;
      cur.billsCount += 1;
      cur.salesAmount += amount;
      cur.coilsSold += coils;
    });

    // 2. Process collections MR for monthly collection cash flow
    collections.forEach((c) => {
      const iso = parseDateToISO(c.date);
      if (!iso || iso.length < 7) return;
      const yrMonth = iso.substring(0, 7);
      const amt = Number(c.amount || 0);

      if (!monthMap.has(yrMonth)) {
        monthMap.set(yrMonth, { billsCount: 0, salesAmount: 0, coilsSold: 0, collectionAmount: 0 });
      }
      const cur = monthMap.get(yrMonth)!;
      cur.collectionAmount += amt;
    });

    // If no data exists, provide a sensible 3-month realistic Poly Cables baseline
    const sortedKeys = Array.from(monthMap.keys()).sort();
    if (sortedKeys.length === 0) {
      const curYear = new Date().getFullYear();
      return [
        {
          month: `${curYear}-06`,
          displayMonth: `Jun ${curYear}`,
          billsCount: 18,
          salesAmount: 1850000,
          coilsSold: 1450,
          collectionAmount: 1620000,
          collectionEfficiency: 87.6,
          variance: 230000
        },
        {
          month: `${curYear}-07`,
          displayMonth: `Jul ${curYear}`,
          billsCount: 22,
          salesAmount: 2100000,
          coilsSold: 1680,
          collectionAmount: 1910000,
          collectionEfficiency: 91.0,
          variance: 190000
        },
        {
          month: `${curYear}-08`,
          displayMonth: `Aug ${curYear}`,
          billsCount: 26,
          salesAmount: 2450000,
          coilsSold: 1920,
          collectionAmount: 2280000,
          collectionEfficiency: 93.1,
          variance: 170000
        }
      ];
    }

    return sortedKeys.map((k) => {
      const rec = monthMap.get(k)!;
      const [yrStr, moStr] = k.split('-');
      const y = parseInt(yrStr, 10);
      const m = parseInt(moStr, 10);
      const dt = new Date(y, m - 1, 1);
      const displayMonth = dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const collectionEfficiency =
        rec.salesAmount > 0
          ? Math.round((rec.collectionAmount / rec.salesAmount) * 1000) / 10
          : rec.collectionAmount > 0
          ? 100
          : 0;
      const variance = rec.salesAmount - rec.collectionAmount;

      return {
        month: k,
        displayMonth,
        billsCount: rec.billsCount,
        salesAmount: rec.salesAmount,
        coilsSold: Math.round(rec.coilsSold * 10) / 10,
        collectionAmount: rec.collectionAmount,
        collectionEfficiency,
        variance
      };
    });
  }, [storedBills, collections]);

  // Aggregate Total Historical Metrics
  const totalHistoricalSales = useMemo(() => {
    return historicalMonthlyAudit.reduce((sum, m) => sum + m.salesAmount, 0);
  }, [historicalMonthlyAudit]);

  const totalHistoricalCollections = useMemo(() => {
    return historicalMonthlyAudit.reduce((sum, m) => sum + m.collectionAmount, 0);
  }, [historicalMonthlyAudit]);

  const totalHistoricalCoils = useMemo(() => {
    return historicalMonthlyAudit.reduce((sum, m) => sum + m.coilsSold, 0);
  }, [historicalMonthlyAudit]);

  const overallCollectionEfficiency = useMemo(() => {
    if (totalHistoricalSales <= 0) return 90.0;
    return Math.round((totalHistoricalCollections / totalHistoricalSales) * 1000) / 10;
  }, [totalHistoricalSales, totalHistoricalCollections]);

  // Weighted Recent Monthly Sales Run-Rate (weighting recent months: 50%, 30%, 20%)
  const recentAvgMonthlySales = useMemo(() => {
    if (historicalMonthlyAudit.length === 0) return 2000000;
    const rev = [...historicalMonthlyAudit].reverse();
    const m1 = rev[0]?.salesAmount || 0;
    const m2 = rev[1]?.salesAmount || m1;
    const m3 = rev[2]?.salesAmount || m2;
    if (rev.length === 1) return m1;
    if (rev.length === 2) return m1 * 0.6 + m2 * 0.4;
    return m1 * 0.5 + m2 * 0.3 + m3 * 0.2;
  }, [historicalMonthlyAudit]);

  const recentAvgMonthlyQty = useMemo(() => {
    if (historicalMonthlyAudit.length === 0) return 1500;
    const rev = [...historicalMonthlyAudit].reverse();
    const m1 = rev[0]?.coilsSold || 0;
    const m2 = rev[1]?.coilsSold || m1;
    const m3 = rev[2]?.coilsSold || m2;
    if (rev.length === 1) return m1;
    if (rev.length === 2) return m1 * 0.6 + m2 * 0.4;
    return m1 * 0.5 + m2 * 0.3 + m3 * 0.2;
  }, [historicalMonthlyAudit]);

  const recentAvgMonthlyCollections = useMemo(() => {
    if (historicalMonthlyAudit.length === 0) return 1800000;
    const rev = [...historicalMonthlyAudit].reverse();
    const m1 = rev[0]?.collectionAmount || 0;
    const m2 = rev[1]?.collectionAmount || m1;
    const m3 = rev[2]?.collectionAmount || m2;
    if (rev.length === 1) return m1;
    if (rev.length === 2) return m1 * 0.6 + m2 * 0.4;
    return m1 * 0.5 + m2 * 0.3 + m3 * 0.2;
  }, [historicalMonthlyAudit]);

  // AI Decided Targets for the Chosen Horizon:
  const decidedMonthlySalesTarget = Math.round(recentAvgMonthlySales * growthMultiplier);
  const decidedHorizonSalesTarget = Math.round(decidedMonthlySalesTarget * horizonMonths);
  const decidedExpectedEfficiency = Math.min(100, Math.max(65, overallCollectionEfficiency > 0 ? overallCollectionEfficiency : 90));
  const decidedMonthlyCollectionTarget = Math.round(decidedMonthlySalesTarget * (decidedExpectedEfficiency / 100));
  const decidedHorizonCollectionTarget = Math.round(decidedMonthlyCollectionTarget * horizonMonths);

  // Sales Center Wise Demand & Sales Intelligence Summary
  const salesCenterWiseSummary = useMemo(() => {
    const activeMonthsCount = Math.max(1, historicalMonthlyAudit.length);

    return branchList.map((branch) => {
      const branchBills = storedBills.filter((b) => {
        const bId = getBillBranchId(b);
        return bId === branch.id || (branch.id === 'branch-1' && !b.header?.branchId && !b.branchId);
      });

      let totalSoldCoils = 0;
      let totalSoldAmount = 0;
      const branchItemSales = new Map<string, number>();

      branchBills.forEach((b) => {
        const billLines = Array.isArray(b.lines) ? b.lines : Array.isArray((b as any).items) ? (b as any).items : [];
        billLines.forEach((line: any) => {
          const qty = getLineCoilQty(line);
          const rate = Number(line.rate || 0);
          const amt = Number(line.amount || line.totalAmount || qty * rate);
          totalSoldCoils += qty;
          totalSoldAmount += amt;

          if (line.itemId) {
            branchItemSales.set(line.itemId, (branchItemSales.get(line.itemId) || 0) + qty);
          }
          if (line.itemCode) {
            branchItemSales.set(String(line.itemCode).trim().toLowerCase(), (branchItemSales.get(String(line.itemCode).trim().toLowerCase()) || 0) + qty);
          }
          const desc = (line.itemDescription || line.description || line.itemName || '').trim().toLowerCase();
          if (desc) {
            branchItemSales.set(`name:${desc}`, (branchItemSales.get(`name:${desc}`) || 0) + qty);
          }
        });
      });

      // Calculate Next Month Idea across catalog items for this sales center
      let nextMonthDemandCoils = 0;
      let nextMonthEstimatedRevenue = 0;

      items.forEach((item) => {
        const idSold = item.id ? (branchItemSales.get(item.id) || 0) : 0;
        const codeSold = item.code ? (branchItemSales.get(item.code.trim().toLowerCase()) || 0) : 0;
        const nameSold = item.name ? (branchItemSales.get(`name:${item.name.trim().toLowerCase()}`) || 0) : 0;
        const pastSold = Math.max(idSold, codeSold, nameSold);

        let monthlyAvg = pastSold > 0 ? pastSold / activeMonthsCount : 0;
        if (monthlyAvg === 0) {
          const brOpening = (item.branchOpeningStock && item.branchOpeningStock[branch.id] !== undefined)
            ? Number(item.branchOpeningStock[branch.id])
            : (branch.id === 'branch-1' ? (Number(item.openingStock) || 0) : 0);
          monthlyAvg = brOpening > 0 ? Math.max(1, Math.round(brOpening * 0.15)) : (item.isSpecialItem ? 1 : 2);
        }

        const demand = Math.max(1, Math.ceil(monthlyAvg * growthMultiplier));
        nextMonthDemandCoils += demand;
        nextMonthEstimatedRevenue += demand * (Number(item.rate) || 0);
      });

      return {
        branchId: branch.id,
        branchName: branch.name,
        branchShortName: branch.name.replace(/Sales Center/i, '').trim(),
        billsCount: branchBills.length,
        totalSoldCoils,
        totalSoldAmount,
        nextMonthDemandCoils,
        nextMonthEstimatedRevenue
      };
    });
  }, [branchList, storedBills, salespersons, items, historicalMonthlyAudit.length, growthMultiplier]);

  // Aggregate item-level sales from storedBills (respecting selectedBranchId if filtered)
  const itemSoldMap = useMemo(() => {
    const map = new Map<string, { totalQty: number; totalAmount: number; billCount: number }>();

    const allowedBranchIds = new Set(allowedBranches.map((b) => b.id));
    const targetBills = selectedBranchId === 'ALL'
      ? storedBills.filter((b) => {
          if (isSuperAdminUser || !isAdminUser) return true;
          const bId = getBillBranchId(b);
          return allowedBranchIds.has(bId);
        })
      : storedBills.filter((b) => {
          const bId = getBillBranchId(b);
          return bId === selectedBranchId || (selectedBranchId === 'branch-1' && !b.header?.branchId && !b.branchId);
        });

    targetBills.forEach((b) => {
      const billLines = Array.isArray(b.lines) ? b.lines : Array.isArray((b as any).items) ? (b as any).items : [];
      billLines.forEach((line: any) => {
        const qty = getLineCoilQty(line);
        const rate = Number(line.rate || 0);
        const amt = Number(line.amount || line.totalAmount || qty * rate);

        // Map by ID
        if (line.itemId) {
          const k = `id:${line.itemId}`;
          const cur = map.get(k) || { totalQty: 0, totalAmount: 0, billCount: 0 };
          cur.totalQty += qty;
          cur.totalAmount += amt;
          cur.billCount += 1;
          map.set(k, cur);
        }

        // Map by itemCode
        if (line.itemCode) {
          const k = `code:${String(line.itemCode).trim().toLowerCase()}`;
          const cur = map.get(k) || { totalQty: 0, totalAmount: 0, billCount: 0 };
          cur.totalQty += qty;
          cur.totalAmount += amt;
          cur.billCount += 1;
          map.set(k, cur);
        }

        // Map by itemDescription / name
        const desc = (line.itemDescription || line.description || line.itemName || '').trim().toLowerCase();
        if (desc) {
          const k = `name:${desc}`;
          const cur = map.get(k) || { totalQty: 0, totalAmount: 0, billCount: 0 };
          cur.totalQty += qty;
          cur.totalAmount += amt;
          cur.billCount += 1;
          map.set(k, cur);
        }
      });
    });

    return map;
  }, [storedBills, selectedBranchId, salespersons]);

  // Item-wise Demand Forecasting & Replenishment Intelligence
  const itemForecasts = useMemo(() => {
    const activeMonthsCount = Math.max(1, historicalMonthlyAudit.length);

    // Process every item in Master Item Directory order
    const list = masterOrderedItems.map((item, idx) => {
      const masterSl = masterSerialMap.get(item.id) || idx + 1;

      // Extract stats from itemSoldMap
      const idStat = item.id ? itemSoldMap.get(`id:${item.id}`) : null;
      const codeStat = item.code ? itemSoldMap.get(`code:${item.code.trim().toLowerCase()}`) : null;
      const nameStat = item.name ? itemSoldMap.get(`name:${item.name.trim().toLowerCase()}`) : null;

      const billQty = (idStat?.totalQty || 0) + (codeStat?.totalQty || 0) + (nameStat?.totalQty || 0);
      const catalogSales = Number(item.totalSales) || 0;
      const pastTotalSold = Math.max(billQty, catalogSales);

      // Monthly sales run-rate velocity
      let monthlyAvgQty = pastTotalSold > 0 ? pastTotalSold / activeMonthsCount : 0;

      // Compute current live inventory stock
      const opening = Number(item.openingStock) || 0;
      const added = Number(item.addedStock) || Number(item.importFactory) || 0;
      const rParty = Number(item.returnParty) || 0;
      const rFactory = Number(item.returnFactory) || 0;
      const sales = Number(item.totalSales) || billQty;
      const currentStock = opening + added + rParty - sales - rFactory;

      // Sales Center Wise breakdown for this specific item
      const branchBreakdown = branchList.map((branch) => {
        const branchBills = storedBills.filter((b) => {
          const bId = getBillBranchId(b);
          return bId === branch.id || (branch.id === 'branch-1' && !b.header?.branchId && !b.branchId);
        });
        let branchSold = 0;
        branchBills.forEach((b) => {
          const lines = Array.isArray(b.lines) ? b.lines : Array.isArray((b as any).items) ? (b as any).items : [];
          lines.forEach((l: any) => {
            if (
              (l.itemId && l.itemId === item.id) ||
              (l.itemCode && l.itemCode === item.code) ||
              (l.name && item.name && l.name.toLowerCase().trim() === item.name.toLowerCase().trim()) ||
              (l.itemName && item.name && l.itemName.toLowerCase().trim() === item.name.toLowerCase().trim())
            ) {
              branchSold += getLineCoilQty(l);
            }
          });
        });

        let bMonthlyAvg = branchSold > 0 ? branchSold / activeMonthsCount : 0;
        if (bMonthlyAvg === 0) {
          const brOpening = (item.branchOpeningStock && item.branchOpeningStock[branch.id] !== undefined)
            ? Number(item.branchOpeningStock[branch.id])
            : (branch.id === 'branch-1' ? (Number(item.openingStock) || 0) : 0);
          bMonthlyAvg = brOpening > 0 ? Math.max(1, Math.round(brOpening * 0.15)) : (item.isSpecialItem ? 1 : 2);
        }

        const demand = Math.max(1, Math.ceil(bMonthlyAvg * horizonMonths * growthMultiplier));
        return {
          branchId: branch.id,
          branchName: branch.name,
          branchShortName: branch.name.replace(/Sales Center/i, '').trim(),
          sold: branchSold,
          demand
        };
      });

      // Predictive AI Demand Estimation:
      if (monthlyAvgQty === 0) {
        if (opening > 0) {
          monthlyAvgQty = Math.max(2, Math.round(opening * 0.18)); // ~18% monthly turnover baseline
        } else {
          monthlyAvgQty = item.isSpecialItem ? 2 : 5;
        }
      }

      let predictedDemandQty = Math.max(1, Math.ceil(monthlyAvgQty * horizonMonths * growthMultiplier));
      if (selectedBranchId !== 'ALL') {
        const brDemand = branchBreakdown.find((b) => b.branchId === selectedBranchId)?.demand;
        if (brDemand !== undefined) predictedDemandQty = brDemand;
      } else if (!isSuperAdminUser && isAdminUser) {
        const adminTotalDemand = branchBreakdown.reduce((sum, b) => sum + (b.demand || 0), 0);
        if (adminTotalDemand > 0) predictedDemandQty = adminTotalDemand;
      }

      const shortfall = Math.max(0, predictedDemandQty - Math.max(0, currentStock));
      const activeRate = Number(item.rate) || 0;
      const estimatedRevenue = predictedDemandQty * activeRate;

      return {
        masterSl,
        item,
        pastTotalSold,
        monthlyAvgQty: Math.round(monthlyAvgQty * 10) / 10,
        predictedDemandQty,
        branchBreakdown,
        currentStock,
        shortfall,
        activeRate,
        estimatedRevenue,
        status: shortfall > 0 ? ('replenish_needed' as const) : ('stock_sufficient' as const)
      };
    });

    // Apply Search & Category Filters (No item code, pure item name & category)
    return list.filter((rec) => {
      if (selectedCategory !== 'All' && rec.item.category !== selectedCategory) {
        return false;
      }
      if (filterStatus === 'reorder_only' && rec.shortfall <= 0) {
        return false;
      }
      if (filterStatus === 'sufficient_only' && rec.shortfall > 0) {
        return false;
      }
      if (!searchItem.trim()) return true;
      return (
        matchesFlexibleSearch(rec.item.name, searchItem, `${rec.item.category || ''}`) ||
        rec.item.name.toLowerCase().includes(searchItem.toLowerCase())
      );
    });
  }, [
    masterOrderedItems,
    masterSerialMap,
    itemSoldMap,
    historicalMonthlyAudit,
    horizonMonths,
    growthMultiplier,
    selectedCategory,
    filterStatus,
    searchItem,
    branchList,
    storedBills,
    selectedBranchId
  ]);

  // Sorted items based on active sort mode (when searching, enforce configured category list order first)
  const sortedForecasts = useMemo(() => {
    const copy = [...itemForecasts];
    const isSearching = Boolean(searchItem.trim());
    return copy.sort((a, b) => {
      if (isSearching) {
        const rankA = getCategorySerialRank(a.item.category, categoryOrder);
        const rankB = getCategorySerialRank(b.item.category, categoryOrder);
        if (rankA !== rankB) return rankA - rankB;
      }
      if (sortMode === 'master_order') return a.masterSl - b.masterSl;
      if (sortMode === 'highest_demand') return b.predictedDemandQty - a.predictedDemandQty;
      if (sortMode === 'highest_revenue') return b.estimatedRevenue - a.estimatedRevenue;
      if (sortMode === 'highest_shortfall') return b.shortfall - a.shortfall;
      if (sortMode === 'name_asc') return a.item.name.localeCompare(b.item.name, undefined, { numeric: true });
      return 0;
    });
  }, [itemForecasts, sortMode, searchItem, categoryOrder]);

  // Aggregate KPI Totals across filtered or full forecasts
  const totalForecastRevenue = useMemo(() => {
    return sortedForecasts.reduce((sum, i) => sum + i.estimatedRevenue, 0);
  }, [sortedForecasts]);

  const totalForecastDemandQty = useMemo(() => {
    return sortedForecasts.reduce((sum, i) => sum + i.predictedDemandQty, 0);
  }, [sortedForecasts]);

  const totalReorderShortfallQty = useMemo(() => {
    return sortedForecasts.reduce((sum, i) => sum + i.shortfall, 0);
  }, [sortedForecasts]);

  const totalCurrentStockQty = useMemo(() => {
    return sortedForecasts.reduce((sum, i) => sum + i.currentStock, 0);
  }, [sortedForecasts]);

  const totalPastSold = useMemo(() => {
    return sortedForecasts.reduce((sum, i) => sum + (i.pastTotalSold || 0), 0);
  }, [sortedForecasts]);

  const itemsNeedingReorderCount = useMemo(() => {
    return sortedForecasts.filter((i) => i.shortfall > 0).length;
  }, [sortedForecasts]);

  // Chart data: Multi-series Historical Sales & Collections alongside AI Projected Sales & Collections
  const forecastChartData = useMemo(() => {
    const points: Array<{
      period: string;
      salesHistorical?: number;
      collectionsHistorical?: number;
      salesForecast?: number;
      collectionsForecast?: number;
      demandQty?: number;
    }> = [];

    // Historical Points (last 6 months)
    historicalMonthlyAudit.slice(-6).forEach((h) => {
      points.push({
        period: h.displayMonth || h.month,
        salesHistorical: h.salesAmount,
        collectionsHistorical: h.collectionAmount,
        demandQty: Math.round(h.coilsSold)
      });
    });

    const lastMonth =
      historicalMonthlyAudit.length > 0
        ? historicalMonthlyAudit[historicalMonthlyAudit.length - 1].month
        : '2026-08';
    const [yrStr, moStr] = lastMonth.split('-');
    let currYr = parseInt(yrStr, 10) || 2026;
    let currMo = parseInt(moStr, 10) || 8;

    for (let i = 1; i <= horizonMonths; i++) {
      currMo++;
      if (currMo > 12) {
        currMo = 1;
        currYr++;
      }
      const dt = new Date(currYr, currMo - 1, 1);
      const label = `${dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })} (Est)`;
      points.push({
        period: label,
        salesForecast: decidedMonthlySalesTarget,
        collectionsForecast: decidedMonthlyCollectionTarget,
        demandQty: Math.round(recentAvgMonthlyQty * growthMultiplier)
      });
    }

    return points;
  }, [
    historicalMonthlyAudit,
    horizonMonths,
    decidedMonthlySalesTarget,
    decidedMonthlyCollectionTarget,
    recentAvgMonthlyQty,
    growthMultiplier
  ]);

  // Export to Excel handler (Formatted identically to Print Preview - "same to same as excel format")
  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const totalPastSold = sortedForecasts.reduce((sum, r) => sum + r.pastTotalSold, 0);
      const selectedBranchName =
        selectedBranchId === 'ALL'
          ? `All Sales Centers (${branchList.length})`
          : branchList.find((b) => b.id === selectedBranchId)?.name || 'Sales Center';

      // Sheet 1: AI Item Demand & Replenishment (Exact Print Preview Mirror)
      const aoaData: any[][] = [
        [company?.name || 'POLY CABLE INDUSTRIES LTD.'],
        [`Factory & Sales: ${company?.address || 'Madhupur, Tangail, Bangladesh'} • Hotline: ${company?.phone || '01711-000000'}`],
        ['AI SALES & DEMAND FORECAST REPORT'],
        [''],
        ['Forecast Horizon:', horizonLabel, '', 'Generated Date:', formatDateDDMMYY(new Date())],
        ['Market Trend Growth:', `${growthFactor >= 0 ? '+' : ''}${growthFactor}%`, '', 'Historical Base:', `${historicalMonthlyAudit.length} Months (${storedBills.length} Bills, ${collections.length} Collections)`],
        ['Sales Center:', selectedBranchName, '', 'Item Directory Order:', `Price List Sequence (SL 1 to ${items.length})`],
        [''],
        ['EXECUTIVE SUMMARY KPIs:'],
        [
          'Projected Demand:', `${Math.round(totalForecastDemandQty).toLocaleString('en-IN')} Coils`,
          'Available Stock:', `${Math.round(totalCurrentStockQty).toLocaleString('en-IN')} Coils`,
          'Re-Order Shortfall:', `${Math.round(totalReorderShortfallQty).toLocaleString('en-IN')} Coils (${itemsNeedingReorderCount} items)`,
          'Decided Sales Target (Tk):', Math.round(decidedHorizonSalesTarget),
          'Decided Collection Target (Tk):', Math.round(decidedHorizonCollectionTarget)
        ],
        [''],
        [
          'SL',
          'Item Name',
          'Category',
          'Past Sold',
          'Sales Idea',
          'Stock',
          'Shortfall',
          'Rate (৳)',
          'Amount (৳)'
        ]
      ];

      sortedForecasts.forEach((row) => {
        aoaData.push([
          row.masterSl,
          row.item.name,
          row.item.category,
          row.pastTotalSold,
          row.predictedDemandQty,
          row.currentStock,
          row.shortfall > 0 ? row.shortfall : '-',
          row.activeRate,
          Math.round(row.estimatedRevenue)
        ]);
      });

      // Grand Totals row matching exact print preview
      aoaData.push([
        'GRAND TOTALS',
        '',
        '',
        totalPastSold,
        Math.round(totalForecastDemandQty),
        Math.round(totalCurrentStockQty),
        Math.round(totalReorderShortfallQty),
        '-',
        Math.round(totalForecastRevenue)
      ]);

      const wsItems = XLSX.utils.aoa_to_sheet(aoaData);
      wsItems['!cols'] = [
        { wch: 6 },
        { wch: 38 },
        { wch: 20 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 18 }
      ];
      XLSX.utils.book_append_sheet(wb, wsItems, 'AI Item Demand Forecast');

      // Sheet 2: Sales Center Next Month Idea
      const exportBranchData = salesCenterWiseSummary.map((sc) => ({
        'Sales Center': sc.branchName,
        'Past Sold (Coils)': sc.totalSoldCoils,
        'Past Sales Revenue (Tk)': sc.totalSoldAmount,
        'Sales Idea Demand (Coils)': sc.nextMonthDemandCoils,
        'Est. Sales Revenue (Tk)': sc.nextMonthEstimatedRevenue,
        'Recorded Bills': sc.billsCount
      }));
      const wsBranches = XLSX.utils.json_to_sheet(exportBranchData);
      XLSX.utils.book_append_sheet(wb, wsBranches, 'Sales Center Distribution');

      // Sheet 3: Monthly History Audit
      const exportMonthlyData = historicalMonthlyAudit.map((row) => ({
        'Month': row.displayMonth,
        'Month Code': row.month,
        'Recorded Bills': row.billsCount,
        'Net Sales (Tk)': row.salesAmount,
        'Coils Sold': row.coilsSold,
        'Realized Collections (Tk)': row.collectionAmount,
        'Collection Efficiency (%)': `${row.collectionEfficiency}%`,
        'Variance (Sales - Collection)': row.variance
      }));
      const wsMonthly = XLSX.utils.json_to_sheet(exportMonthlyData);
      XLSX.utils.book_append_sheet(wb, wsMonthly, 'Monthly Sales & Collections');

      const fileName = `AI_Demand_Sales_Forecast_${forecastHorizon}_${formatDateDDMMYY(new Date()).replace(/\//g, '.')}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (e) {
      console.error(e);
      alert('Error exporting forecast to Excel.');
    }
  };

  const [showPrintPreviewModal, setShowPrintPreviewModal] = useState(false);
  const [printZoomScale, setPrintZoomScale] = useState<number>(100);

  const handleCreateFactoryRequisition = () => {
    // Collect all items that need replenishment (shortfall > 0)
    // If no shortfall items, take top projected demand items
    const shortfallItems = itemForecasts.filter((f) => f.shortfall > 0);
    const targetItems = shortfallItems.length > 0 ? shortfallItems : itemForecasts.slice(0, 10);

    const requisitionLines = targetItems.map((f, idx) => {
      const qty = f.shortfall > 0 ? f.shortfall : Math.max(1, Math.ceil(f.predictedDemandQty || 1));
      const rate = Number(f.item.rate || 0);

      // Auto distribute colors across Red, Black, Yellow, Green, Blue for color-applicable cables
      const isColorItem = isColorApplicableCable(f.item);
      let redVal: number | '' = '';
      let blackVal: number | '' = '';
      let yellowVal: number | '' = '';
      let greenVal: number | '' = '';
      let blueVal: number | '' = '';

      if (isColorItem && qty > 0) {
        const base = Math.floor(qty / 5);
        const rem = qty % 5;
        const r = base + (rem > 0 ? 1 : 0);
        const k = base + (rem > 1 ? 1 : 0);
        const y = base + (rem > 2 ? 1 : 0);
        const g = base + (rem > 3 ? 1 : 0);
        const b = base;
        redVal = r > 0 ? r : '';
        blackVal = k > 0 ? k : '';
        yellowVal = y > 0 ? y : '';
        greenVal = g > 0 ? g : '';
        blueVal = b > 0 ? b : '';
      }

      return {
        id: `line-${idx + 1}`,
        description: f.item.name,
        unit: f.item.unit || 'Coils',
        quantity: qty,
        rate: rate,
        amount: qty * rate,
        remarks: '',
        isSpecialItem: false,
        red: redVal,
        black: blackVal,
        yellow: yellowVal,
        green: greenVal,
        blue: blueVal
      };
    });

    const draftData = {
      partyName: 'Madhupur Sales Center',
      partyAddress: company?.address || 'Madhupur, Tangail',
      toDestination: 'Factory',
      deliverySite: `Factory Dispatch - AI ${horizonMonths}M Replenishment Forecast (+${growthFactor}% Trend)`,
      discountPercent: 10,
      lines: requisitionLines,
      timestamp: Date.now()
    };

    try {
      localStorage.setItem('polycables_ai_forecast_requisition_draft', JSON.stringify(draftData));
    } catch (e) {
      console.error('Failed to save AI forecast requisition draft:', e);
    }

    if (onNavigateToRequisitions) {
      onNavigateToRequisitions();
    }
  };

  const handlePrint = () => {
    setShowPrintPreviewModal(true);
  };
  useAutoPrintOnOpen(
    showPrintPreviewModal,
    () => window.print(),
    () => setShowPrintPreviewModal(false)
  );

  if (!isOpen) return null;

  return (
    <div className="w-full bg-slate-950 text-slate-100 flex flex-col rounded-2xl border border-slate-800 shadow-xl overflow-hidden animate-in fade-in select-none min-h-[calc(100vh-140px)] print:static print:bg-white print:border-none print:shadow-none print:text-black print:overflow-visible print:h-auto print:w-full">
      {/* Main Interactive View (hidden during print when print preview is active) */}
      <div className={`flex flex-col flex-1 overflow-hidden ${showPrintPreviewModal ? 'no-print' : ''}`}>
        {/* ========================================================================= */}
        {/* TOP EXECUTIVE NAVIGATION & CONTROL BAR (TAB HEADER) */}
        {/* ========================================================================= */}
        <header className="bg-slate-900/95 border-b border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3 flex-none shadow-md z-10">
        <div className="flex items-center space-x-3.5">
          <button
            type="button"
            onClick={onClose}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors cursor-pointer border border-slate-700 flex items-center space-x-1.5 text-xs font-bold"
            title="Return to Dashboard / Main Menu"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </button>

          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-tr from-purple-600 via-indigo-600 to-indigo-700 text-white rounded-xl shadow-lg ring-1 ring-purple-400/30">
              <Sparkles className="w-5 h-5 animate-pulse text-amber-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center space-x-2">
                  <span>AI Sales & Demand Forecasting Intelligence</span>
                </h1>
                <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  Tab View
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {company?.name || 'Poly Cable Industries Ltd.'} • Order aligned with Master Item Directory ({items.length} Products)
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center flex-wrap gap-2">
          {onNavigateToRequisitions && (
            <button
              type="button"
              onClick={handleCreateFactoryRequisition}
              className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center space-x-1.5 cursor-pointer border border-emerald-500/30 active:scale-95"
              title="Create Factory Requisition Challan from this forecast"
            >
              <Truck className="w-4 h-4" />
              <span>Create Factory Requisition</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 hover:text-emerald-200 font-bold text-xs rounded-xl border border-slate-700 transition-colors flex items-center space-x-1.5 cursor-pointer"
            title="Download Forecast Data to Excel Spreadsheet"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Export Excel</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-colors flex items-center space-x-1.5 cursor-pointer"
            title="Print AI Forecast Report"
          >
            <Printer className="w-4 h-4 text-indigo-400" />
            <span className="hidden sm:inline">Print Report</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 rounded-xl transition-colors border border-rose-500/30 cursor-pointer"
            title="Close Forecast"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* FORECAST PARAMETER & SCENARIO TUNING CONTROLS */}
      {/* ========================================================================= */}
      <div className="bg-slate-900/70 border-b border-slate-800/80 px-4 py-3 space-y-3 text-xs flex-none">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Horizon Period Selector: Next Month, This Year, Next Year, Custom Range */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-300 flex items-center justify-between">
              <span className="flex items-center space-x-1.5">
                <Calendar className="w-4 h-4 text-purple-400" />
                <span>Sales Idea Horizon:</span>
              </span>
              <span className="text-[11px] font-mono text-purple-300 font-bold bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/50">
                {horizonLabel}
              </span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setForecastHorizon('next_month')}
                className={`py-2 px-3 rounded-lg font-bold text-center text-xs transition-all cursor-pointer flex items-center justify-center space-x-2 ${
                  forecastHorizon === 'next_month'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>📅 Next Month</span>
              </button>
              <button
                type="button"
                onClick={() => setForecastHorizon('this_year')}
                className={`py-2 px-3 rounded-lg font-bold text-center text-xs transition-all cursor-pointer flex items-center justify-center space-x-2 ${
                  forecastHorizon === 'this_year' || forecastHorizon === 'rest_of_year'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>🗓️ Rest Day of the Year</span>
              </button>
              <button
                type="button"
                onClick={() => setForecastHorizon('custom_range')}
                className={`py-2 px-3 rounded-lg font-bold text-center text-xs transition-all cursor-pointer flex items-center justify-center space-x-2 ${
                  forecastHorizon === 'custom_range'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>⚙️ Custom Range</span>
              </button>
            </div>
          </div>

          {/* Expected Market Growth Tuning */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-300 flex items-center space-x-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span>Expected Market Growth Run-Rate:</span>
              </label>
              <span className="font-mono text-emerald-400 font-extrabold bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-md text-xs">
                {growthFactor >= 0 ? `+${growthFactor}%` : `${growthFactor}%`}
              </span>
            </div>
            <div className="pt-1 flex items-center space-x-3">
              <input
                type="range"
                min="-30"
                max="50"
                step="5"
                value={growthFactor}
                onChange={(e) => setGrowthFactor(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>
          </div>

          {/* Catalog Sequence & History Info */}
          <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800/80 rounded-xl px-3.5 py-2">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-200">Historical Sales & Collections Base</div>
                <div className="text-[10px] text-slate-400">
                  {historicalMonthlyAudit.length} Months Analyzed • {storedBills.length} Invoices • {collections.length} Collections
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowMonthlyHistoryTable(!showMonthlyHistoryTable)}
              className="text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-500/30 px-2.5 py-1 rounded-lg flex items-center space-x-1 cursor-pointer transition-colors"
            >
              <span>{showMonthlyHistoryTable ? 'Hide Audit' : 'Show Audit'}</span>
              {showMonthlyHistoryTable ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Custom Range Configuration Bar (Shown when Custom Range is active) */}
        {forecastHorizon === 'custom_range' && (
          <div className="p-3 bg-purple-950/30 border border-purple-600/40 rounded-xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center space-x-2 text-purple-200 font-bold">
              <Sliders className="w-4 h-4 text-purple-400" />
              <span>Select Custom Forecast Month Range:</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-700 px-2.5 py-1 rounded-lg">
                <span className="text-slate-400 text-[11px]">Start:</span>
                <input
                  type="month"
                  value={customStartMonth}
                  onChange={(e) => setCustomStartMonth(e.target.value)}
                  className="bg-transparent text-white font-mono text-xs focus:outline-none cursor-pointer"
                />
              </div>
              <span className="text-slate-500 font-bold">to</span>
              <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-700 px-2.5 py-1 rounded-lg">
                <span className="text-slate-400 text-[11px]">End:</span>
                <input
                  type="month"
                  value={customEndMonth}
                  onChange={(e) => setCustomEndMonth(e.target.value)}
                  className="bg-transparent text-white font-mono text-xs focus:outline-none cursor-pointer"
                />
              </div>
              <div className="flex items-center space-x-1 pl-2 border-l border-slate-700">
                <span className="text-slate-400 text-[11px] mr-1">Presets:</span>
                {[2, 3, 6, 9, 12, 18].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setCustomMonthsCount(m);
                      const s = new Date();
                      s.setMonth(s.getMonth() + 1);
                      const e = new Date();
                      e.setMonth(e.getMonth() + m);
                      setCustomStartMonth(s.toISOString().substring(0, 7));
                      setCustomEndMonth(e.toISOString().substring(0, 7));
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                      horizonMonths === m
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {m}M
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* AI STRATEGIC DECISION ENGINE CARD (EXECUTIVE SUMMARY) */}
      {/* ========================================================================= */}
      <div className="p-4 bg-gradient-to-r from-purple-950/40 via-indigo-950/30 to-slate-900 border-b border-purple-500/20 text-xs flex-none">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center space-x-2">
              <span className="flex items-center space-x-1.5 text-xs font-black uppercase tracking-wider text-purple-300 bg-purple-500/20 px-2.5 py-0.5 rounded-full border border-purple-500/40">
                <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-spin" style={{ animationDuration: '4s' }} />
                <span>AI Decision Engine • {horizonLabel}</span>
              </span>
              <span className="text-[11px] text-slate-400">
                All Previous Sales Data Analyzed
              </span>
            </div>
            <p className="text-slate-200 text-xs leading-relaxed">
              AI has analyzed all previous sales data across <strong>{storedBills.length} invoices</strong> (averaging <strong>৳{Math.round(recentAvgMonthlySales).toLocaleString('en-IN')}</strong> monthly turnover) and <strong>{collections.length} collection records</strong>. For <strong>{horizonLabel}</strong>, projected sales target is <strong>৳{decidedHorizonSalesTarget.toLocaleString('en-IN')}</strong> with demand volume of <strong>{Math.round(totalForecastDemandQty).toLocaleString('en-IN')} Coils</strong>. Immediate factory requisition recommended for <strong>{itemsNeedingReorderCount} shortfall products</strong>.
            </p>
          </div>

          {/* AI Decision Pillars */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full lg:w-auto">
            <div className="bg-slate-950/80 p-2.5 rounded-xl border border-purple-500/40 text-center">
              <div className="text-[10px] uppercase font-bold text-purple-300">Decided Sales Target</div>
              <div className="text-base font-black font-mono text-purple-400 mt-0.5">
                ৳{decidedHorizonSalesTarget.toLocaleString('en-IN')}
              </div>
              <div className="text-[9px] text-slate-400">৳{decidedMonthlySalesTarget.toLocaleString('en-IN')}/mo avg</div>
            </div>

            <div className="bg-slate-950/80 p-2.5 rounded-xl border border-teal-500/40 text-center">
              <div className="text-[10px] uppercase font-bold text-teal-300">Decided Collection Target</div>
              <div className="text-base font-black font-mono text-teal-400 mt-0.5">
                ৳{decidedHorizonCollectionTarget.toLocaleString('en-IN')}
              </div>
              <div className="text-[9px] text-teal-300/80">Target: {decidedExpectedEfficiency}% Realization</div>
            </div>

            <div className="bg-slate-950/80 p-2.5 rounded-xl border border-emerald-500/40 text-center">
              <div className="text-[10px] uppercase font-bold text-emerald-300">Decided Demand Volume</div>
              <div className="text-base font-black font-mono text-emerald-400 mt-0.5">
                {Math.round(totalForecastDemandQty).toLocaleString('en-IN')} Coils
              </div>
              <div className="text-[9px] text-slate-400">{Math.round(totalForecastDemandQty / horizonMonths)} Coils/mo avg</div>
            </div>

            <div className="bg-slate-950/80 p-2.5 rounded-xl border border-amber-500/40 text-center">
              <div className="text-[10px] uppercase font-bold text-amber-300">Reorder Shortfall</div>
              <div className="text-base font-black font-mono text-amber-400 mt-0.5">
                {Math.round(totalReorderShortfallQty).toLocaleString('en-IN')} Coils
              </div>
              <div className="text-[9px] text-amber-300/80">{itemsNeedingReorderCount} items below stock</div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* EXPANDABLE: PREVIOUS MONTHS SALES & COLLECTION AUDIT TABLE */}
      {/* ========================================================================= */}
      {showMonthlyHistoryTable && (
        <div className="bg-slate-950/90 border-b border-slate-800 p-4 space-y-2 text-xs flex-none">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase text-slate-200 tracking-wider flex items-center space-x-2">
              <FileText className="w-4 h-4 text-indigo-400" />
              <span>Previous Months Sales & Collection History Audit ({historicalMonthlyAudit.length} Months Evaluated)</span>
            </h3>
            <span className="text-[11px] text-slate-400">
              Unit rule applied: 100 Meters = 1 Coil for Duplex wire & aerial cables
            </span>
          </div>

          <div className="border border-slate-800 rounded-xl overflow-x-auto shadow-inner">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-slate-300 text-[11px] font-bold border-b border-slate-800 uppercase tracking-wider">
                <tr>
                  <th className="p-2.5">Month</th>
                  <th className="p-2.5 text-center w-24">Bills / Invoices</th>
                  <th className="p-2.5 text-right w-36">Net Sales (৳)</th>
                  <th className="p-2.5 text-right w-28">Coils Sold</th>
                  <th className="p-2.5 text-right w-36 text-emerald-300 bg-emerald-950/40 border-x border-emerald-900/40">
                    Realized Collection (৳)
                  </th>
                  <th className="p-2.5 text-center w-32">Recovery Rate (%)</th>
                  <th className="p-2.5 text-right w-36">Monthly Variance (৳)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {historicalMonthlyAudit.map((m) => (
                  <tr key={m.month} className="hover:bg-slate-900/60 transition-colors">
                    <td className="p-2.5 font-bold text-white flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                      <span>{m.displayMonth}</span>
                    </td>
                    <td className="p-2.5 text-center font-mono text-slate-300">
                      {m.billsCount}
                    </td>
                    <td className="p-2.5 text-right font-mono font-bold text-purple-300">
                      ৳{m.salesAmount.toLocaleString('en-IN')}
                    </td>
                    <td className="p-2.5 text-right font-mono text-slate-300">
                      {m.coilsSold.toLocaleString('en-IN')}
                    </td>
                    <td className="p-2.5 text-right font-mono font-bold text-emerald-400 bg-emerald-950/20 border-x border-emerald-900/30">
                      ৳{m.collectionAmount.toLocaleString('en-IN')}
                    </td>
                    <td className="p-2.5 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                          m.collectionEfficiency >= 90
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : m.collectionEfficiency >= 75
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        }`}
                      >
                        {m.collectionEfficiency}%
                      </span>
                    </td>
                    <td className="p-2.5 text-right font-mono text-slate-400">
                      {m.variance >= 0 ? `+৳${m.variance.toLocaleString('en-IN')}` : `-৳${Math.abs(m.variance).toLocaleString('en-IN')}`}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 text-slate-200 font-bold border-t-2 border-slate-700">
                <tr>
                  <td className="p-2.5 uppercase text-purple-300">Total Historical Base</td>
                  <td className="p-2.5 text-center font-mono">{storedBills.length}</td>
                  <td className="p-2.5 text-right font-mono text-purple-300">
                    ৳{totalHistoricalSales.toLocaleString('en-IN')}
                  </td>
                  <td className="p-2.5 text-right font-mono">
                    {Math.round(totalHistoricalCoils).toLocaleString('en-IN')}
                  </td>
                  <td className="p-2.5 text-right font-mono text-emerald-300 bg-emerald-950/60 border-x border-emerald-900/50">
                    ৳{totalHistoricalCollections.toLocaleString('en-IN')}
                  </td>
                  <td className="p-2.5 text-center font-mono text-emerald-300">
                    {overallCollectionEfficiency}%
                  </td>
                  <td className="p-2.5 text-right font-mono text-slate-300">
                    ৳{(totalHistoricalSales - totalHistoricalCollections).toLocaleString('en-IN')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MAIN BODY: SPLIT VIEW (HISTORICAL VS FORECAST GRAPH + COMPREHENSIVE TABLE) */}
      {/* ========================================================================= */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Visual Revenue & Demand Forecast Chart */}
        <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-xs font-black uppercase text-slate-200 tracking-wider flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-purple-400" />
              <span>Historical Sales & Collections vs AI Projected Growth Curve</span>
            </h3>
            <span className="text-[11px] text-slate-400 font-medium">
              Based on {storedBills.length} bills & {growthFactor >= 0 ? `+${growthFactor}%` : `${growthFactor}%`} growth factor
            </span>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecastChartData} margin={{ top: 10, right: 15, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorSalesHist" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorCollHist" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorSalesForecast" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorCollForecast" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="period" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickFormatter={(val) => `৳${(val / 100000).toFixed(1)}L`}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(val: any, name: string) => {
                    const formatted = `৳${Number(val || 0).toLocaleString('en-IN')}`;
                    switch (name) {
                      case 'salesHistorical':
                        return [formatted, 'Historical Sales'];
                      case 'collectionsHistorical':
                        return [formatted, 'Historical Collections'];
                      case 'salesForecast':
                        return [formatted, 'AI Projected Sales'];
                      case 'collectionsForecast':
                        return [formatted, 'AI Projected Collections'];
                      default:
                        return [formatted, name];
                    }
                  }}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '12px'
                  }}
                />
                <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: '6px' }} />
                <Area
                  type="monotone"
                  dataKey="salesHistorical"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorSalesHist)"
                  name="Historical Sales"
                />
                <Area
                  type="monotone"
                  dataKey="collectionsHistorical"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorCollHist)"
                  name="Historical Collections"
                />
                <Area
                  type="monotone"
                  dataKey="salesForecast"
                  stroke="#a855f7"
                  strokeWidth={2.5}
                  strokeDasharray="4 4"
                  fillOpacity={1}
                  fill="url(#colorSalesForecast)"
                  name="AI Projected Sales"
                />
                <Area
                  type="monotone"
                  dataKey="collectionsForecast"
                  stroke="#14b8a6"
                  strokeWidth={2.5}
                  strokeDasharray="4 4"
                  fillOpacity={1}
                  fill="url(#colorCollForecast)"
                  name="AI Projected Collections"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Filters, Search & Directory Order Toolbar */}
        <div className="bg-slate-900/90 p-3 rounded-2xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
          {/* Search Box */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search item name..."
              value={searchItem}
              onChange={(e) => setSearchItem(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
            />
          </div>

          {/* Sales Center Filter */}
          <SalesCenterSearchFilter
            value={selectedBranchId}
            onChange={(val) => setSelectedBranchId(val)}
            branches={branchList}
            includeAllOption={true}
            allOptionLabel={`All Sales Centers (${branchList.length})`}
            allOptionValue="ALL"
            label="Sales Center:"
            theme="dark"
            size="sm"
            widthClass="min-w-[170px] max-w-[240px]"
          />

          {/* Category Filter */}
          <div className="flex items-center space-x-2 w-full md:w-auto">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-bold focus:outline-none focus:border-purple-500 cursor-pointer"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'All' ? 'All Categories' : cat}
                </option>
              ))}
            </select>
          </div>

          {/* Status Quick Filter */}
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 w-full md:w-auto">
            <button
              type="button"
              onClick={() => setFilterStatus('all')}
              className={`flex-1 md:flex-none px-3 py-1 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                filterStatus === 'all' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
            >
              All Items
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('reorder_only')}
              className={`flex-1 md:flex-none px-3 py-1 rounded-lg font-bold text-xs transition-colors cursor-pointer flex items-center space-x-1 ${
                filterStatus === 'reorder_only' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Shortfall Only</span>
              <span className="text-[10px] px-1 rounded bg-black/30">{itemsNeedingReorderCount}</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('sufficient_only')}
              className={`flex-1 md:flex-none px-3 py-1 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                filterStatus === 'sufficient_only' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
            >
              In Stock
            </button>
          </div>

          {/* Sort Order Toggle */}
          <div className="flex items-center space-x-2 w-full md:w-auto justify-end">
            <span className="text-slate-400 font-bold text-[11px]">Sort:</span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as any)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-purple-300 font-extrabold focus:outline-none focus:border-purple-500 cursor-pointer"
            >
              <option value="master_order">📋 Price List Order</option>
              <option value="highest_demand">🔥 Highest Demand (Coils)</option>
              <option value="highest_revenue">💰 Highest Projected Revenue</option>
              <option value="highest_shortfall">⚠️ Highest Shortfall (Re-Order)</option>
              <option value="name_asc">🔤 Item Name (A-Z)</option>
            </select>
          </div>
        </div>

        {/* COMPREHENSIVE ITEM DEMAND & REPLENISHMENT TABLE */}
        {/* ========================================================================= */}
        <div className="border border-slate-800 rounded-2xl overflow-hidden shadow-2xl bg-slate-900/60">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-slate-300 text-[11px] font-bold border-b border-slate-800 uppercase tracking-wider">
                <tr>
                  <th className="p-3 text-center w-12">SL #</th>
                  <th className="p-3 min-w-[200px]">Item Name</th>
                  <th className="p-3 w-36">Category</th>
                  <th className="p-3 w-20 text-center">Unit</th>
                  <th className="p-3 w-28 text-right">Previous Sales</th>
                  <th className="p-3 w-40 text-right bg-purple-950/80 text-purple-200 border-x border-purple-900/50">
                    {selectedBranchId === 'ALL'
                      ? 'Total Qty (Coils)'
                      : `Qty (${branchList.find((b) => b.id === selectedBranchId)?.name.replace(/Sales Center/i, '').trim() || 'Center'})`}
                  </th>
                  <th className="p-3 w-28 text-right">Live Stock</th>
                  <th className="p-3 w-32 text-right bg-amber-950/80 text-amber-200 border-x border-amber-900/50">
                    Re-Order Need
                  </th>
                  <th className="p-3 w-28 text-right">Rate (৳)</th>
                  <th className="p-3 w-36 text-right">Est. Revenue (৳)</th>
                  <th className="p-3 w-28 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-medium">
                {sortedForecasts.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <PackageCheck className="w-8 h-8 text-slate-600" />
                        <div className="text-sm font-bold text-slate-400">No items match the selected criteria</div>
                        <div className="text-xs text-slate-500">Try changing your search query or category filter.</div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  sortedForecasts.map((row) => (
                    <tr
                      key={row.item.id}
                      className={`hover:bg-slate-800/50 transition-colors ${
                        row.shortfall > 0 ? 'bg-amber-950/10' : ''
                      }`}
                    >
                      <td className="p-3 text-center text-slate-500 font-mono font-bold">
                        {row.masterSl}
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-white text-sm">{row.item.name}</div>
                      </td>
                      <td className="p-3">
                        <span className="bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-md text-[10px] font-bold">
                          {row.item.category}
                        </span>
                      </td>
                      <td className="p-3 text-center text-slate-400">
                        {row.item.unit || 'Coils'}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-300 font-bold">
                        {row.pastTotalSold.toLocaleString('en-IN')}
                      </td>
                      <td
                        onClick={() => {
                          if (selectedBranchId === 'ALL') {
                            setExpandedQtyItemId((prev) => (prev === row.item.id ? null : row.item.id));
                          }
                        }}
                        className={`p-3 text-right font-mono font-black text-purple-300 text-sm bg-purple-950/40 border-x border-purple-900/30 select-none ${
                          selectedBranchId === 'ALL' ? 'cursor-pointer hover:bg-purple-900/60 transition-colors' : ''
                        }`}
                        title={selectedBranchId === 'ALL' ? 'Click to show / hide sales center breakdown' : `${row.predictedDemandQty} Coils`}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span>{row.predictedDemandQty.toLocaleString('en-IN')}</span>
                          {selectedBranchId === 'ALL' && (
                            <span className="text-[10px] text-purple-400 font-sans font-bold">
                              {expandedQtyItemId === row.item.id ? '▲' : '▼'}
                            </span>
                          )}
                        </div>

                        {/* Visible only when user clicks this item's qty field */}
                        {selectedBranchId === 'ALL' && expandedQtyItemId === row.item.id && row.branchBreakdown && (
                          <div className="mt-1.5 p-2 bg-slate-950 border border-purple-800/80 rounded-lg shadow-xl text-left font-sans space-y-1 animate-in fade-in zoom-in-95">
                            <div className="text-[10px] font-black text-purple-300 border-b border-purple-900/50 pb-0.5 flex items-center justify-between">
                              <span>Sales Center Needed Coils</span>
                              <span className="text-[9px] text-slate-400">Click to close</span>
                            </div>
                            <div className="space-y-0.5 max-h-36 overflow-y-auto">
                              {row.branchBreakdown.map((b) => (
                                <div
                                  key={b.branchId}
                                  className="flex items-center justify-between text-[11px] py-0.5 px-1 hover:bg-purple-950/50 rounded"
                                >
                                  <span className="text-slate-300 truncate max-w-[130px] font-medium" title={b.branchName}>
                                    {b.branchShortName}
                                  </span>
                                  <span className="font-mono font-black text-white bg-purple-900/70 px-1.5 py-0.2 rounded text-[10px] border border-purple-700/40">
                                    {b.demand.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-200">
                        {row.currentStock.toLocaleString('en-IN')}
                      </td>
                      <td className="p-3 text-right font-mono font-black text-sm bg-amber-950/40 border-x border-amber-900/30">
                        {row.shortfall > 0 ? (
                          <span className="text-amber-400">+{row.shortfall.toLocaleString('en-IN')}</span>
                        ) : (
                          <span className="text-emerald-400 font-normal text-xs">Sufficient</span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-300">
                        ৳{row.activeRate.toLocaleString('en-IN')}
                      </td>
                      <td className="p-3 text-right font-mono font-black text-white">
                        ৳{Math.round(row.estimatedRevenue).toLocaleString('en-IN')}
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                            row.shortfall > 0
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          }`}
                        >
                          {row.shortfall > 0 ? 'REPLENISH' : 'IN STOCK'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FOOTER BAR */}
      {/* ========================================================================= */}
        <footer className="bg-slate-900/90 border-t border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between text-xs text-slate-400 flex-none">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>
              Displaying {sortedForecasts.length} items • Projected demand calculated from sales run-rate & {growthFactor >= 0 ? `+${growthFactor}%` : `${growthFactor}%`} growth factor
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-slate-300 font-mono font-bold">
              Total Est. Demand: <span className="text-purple-400">{Math.round(totalForecastDemandQty).toLocaleString('en-IN')} Coils</span> (৳{Math.round(totalForecastRevenue).toLocaleString('en-IN')})
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg transition-colors cursor-pointer border border-slate-700"
            >
              Close Full Page
            </button>
          </div>
        </footer>
      </div>

      {/* ========================================================================= */}
      {/* PRINT PREVIEW MODAL */}
      {/* ========================================================================= */}
      {showPrintPreviewModal && (
        <div className="print-preview-modal-backdrop fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex flex-col justify-start items-center overflow-y-auto p-2 sm:p-4 animate-in fade-in">
          <div className="print-preview-modal-dialog bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl w-full max-w-5xl flex flex-col overflow-hidden text-slate-100 my-auto print:bg-transparent print:border-none print:shadow-none print:w-full print:max-w-none print:my-0">
            {/* Modal Top Sticky Toolbar */}
            <div className="bg-slate-800 px-5 py-3 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3 no-print">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg border border-indigo-500/30">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-white flex items-center space-x-2">
                    <span>AI Demand & Sales Replenishment Forecast Report</span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Standard A4 / Ledger Format • Aligned with Master Item Directory ({items.length} items)
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1 bg-slate-950 border border-slate-700 rounded-lg p-0.5 text-xs font-mono">
                  {[80, 100, 115].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setPrintZoomScale(val)}
                      className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                        printZoomScale === val ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {val}%
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-3.5 py-1.5 rounded-lg text-xs flex items-center space-x-1.5 shadow-md transition-all cursor-pointer hover:scale-105 active:scale-95"
                  title="Download identical Excel file (.xlsx)"
                >
                  <Download className="w-4 h-4 text-emerald-200" />
                  <span>Download Excel</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-4 py-1.5 rounded-lg text-xs flex items-center space-x-1.5 shadow-md transition-all cursor-pointer hover:scale-105 active:scale-95"
                  title="Print preview like Excel file print"
                >
                  <Printer className="w-4 h-4 text-slate-950" />
                  <span>Print (Excel Layout)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowPrintPreviewModal(false)}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 cursor-pointer"
                  title="Close Print Preview"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Printable Canvas Container */}
            <div className="print-preview-canvas-container flex-1 overflow-auto bg-slate-950 p-2.5 sm:p-8 flex justify-start sm:justify-center items-start print:bg-white print:p-0 print:m-0 print:overflow-visible">
              <div
                id="ai-forecast-printable-report"
                style={{
                  transform: `scale(${printZoomScale / 100})`,
                  transformOrigin: 'top left',
                  marginBottom: printZoomScale > 100 ? `${(printZoomScale - 100) * 10}px` : '20px'
                }}
                className="print-paper-sheet bg-white text-black shadow-2xl border border-slate-300 rounded-sm font-sans transition-all duration-200 origin-top-left sm:origin-top p-3 sm:p-8 max-w-[210mm] w-full relative text-[11px] space-y-5 print:shadow-none print:border-none print:transform-none print:p-6 print:m-0 print:max-w-none print:w-full print:bg-white print:text-black"
              >
                {/* Print Header */}
                <div>
                  <div className="text-center pb-3 border-b-2 border-black">
                    <h1 className="text-xl font-black text-black tracking-tight uppercase">
                      {company?.name || 'POLY CABLE INDUSTRIES LTD.'}
                    </h1>
                    <p className="text-[10px] text-slate-700 font-medium">
                      {company?.address || 'Madhupur, Tangail, Bangladesh'} • Hotline: {company?.phone || '01711-000000'}
                    </p>
                    <div className="mt-2 inline-block bg-black text-white px-4 py-1 rounded font-black text-xs tracking-wider uppercase">
                      AI SALES & DEMAND FORECAST REPORT
                    </div>
                  </div>

                  {/* Document Meta Row */}
                  <div className="grid grid-cols-2 gap-4 my-3 text-[10px] bg-slate-50 p-2.5 rounded border border-slate-300">
                    <div>
                      <div className="flex space-x-1">
                        <span className="font-bold text-slate-800">Forecast Horizon:</span>
                        <span className="font-bold text-black">
                          {horizonMonths} Month{horizonMonths > 1 ? 's' : ''} ({horizonLabel.toUpperCase()})
                        </span>
                      </div>
                      <div className="flex space-x-1 mt-0.5">
                        <span className="font-bold text-slate-800">Growth Factor Applied:</span>
                        <span className="font-medium text-black">
                          {growthFactor >= 0 ? `+${growthFactor}%` : `${growthFactor}%`} Market Trend
                        </span>
                      </div>
                      <div className="flex space-x-1 mt-0.5">
                        <span className="font-bold text-slate-800">Historical Base:</span>
                        <span className="font-medium text-black">{historicalMonthlyAudit.length} Months ({storedBills.length} Bills, {collections.length} Coll.)</span>
                      </div>
                      <div className="flex space-x-1 mt-0.5">
                        <span className="font-bold text-slate-800">Sales Center:</span>
                        <span className="font-bold text-purple-900">
                          {selectedBranchId === 'ALL'
                            ? `All Sales Centers (${branchList.length})`
                            : branchList.find((b) => b.id === selectedBranchId)?.name || 'Sales Center'}
                        </span>
                      </div>
                      <div className="flex space-x-1 mt-0.5">
                        <span className="font-bold text-slate-800">Aligned Catalog:</span>
                        <span className="font-medium text-black">Master Item Directory Order (SL 1 to {items.length})</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="flex justify-end space-x-1">
                        <span className="font-bold text-slate-800">Generated Date:</span>
                        <span className="font-bold font-mono text-black">{formatDateDDMMYY(new Date())}</span>
                      </div>
                      <div className="flex justify-end space-x-1 mt-0.5">
                        <span className="font-bold text-slate-800">Decided Sales Target:</span>
                        <span className="font-bold font-mono text-purple-900">৳{decidedHorizonSalesTarget.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-end space-x-1 mt-0.5">
                        <span className="font-bold text-slate-800">Decided Coll. Target:</span>
                        <span className="font-bold font-mono text-teal-900">৳{decidedHorizonCollectionTarget.toLocaleString('en-IN')} ({decidedExpectedEfficiency}%)</span>
                      </div>
                      <div className="flex justify-end space-x-1 mt-0.5">
                        <span className="font-bold text-slate-800">Replenish Shortfall Items:</span>
                        <span className="font-bold font-mono text-red-700">{itemsNeedingReorderCount} items</span>
                      </div>
                    </div>
                  </div>

                  {/* Executive Summary Metrics Box */}
                  <div className="grid grid-cols-5 gap-2 mb-4 text-center">
                    <div className="p-2 bg-slate-50 border border-slate-300 rounded">
                      <div className="text-[9px] font-bold uppercase text-slate-700">Projected Demand</div>
                      <div className="text-sm font-black font-mono text-black mt-0.5">
                        {Math.round(totalForecastDemandQty).toLocaleString('en-IN')} <span className="text-[9px]">Coils</span>
                      </div>
                    </div>
                    <div className="p-2 bg-slate-50 border border-slate-300 rounded">
                      <div className="text-[9px] font-bold uppercase text-slate-700">Available Stock</div>
                      <div className="text-sm font-black font-mono text-black mt-0.5">
                        {Math.round(totalCurrentStockQty).toLocaleString('en-IN')} <span className="text-[9px]">Coils</span>
                      </div>
                    </div>
                    <div className="p-2 bg-slate-50 border border-slate-300 rounded">
                      <div className="text-[9px] font-bold uppercase text-slate-700">Re-Order Shortfall</div>
                      <div className="text-sm font-black font-mono text-red-700 mt-0.5">
                        {Math.round(totalReorderShortfallQty).toLocaleString('en-IN')} <span className="text-[9px]">Coils</span>
                      </div>
                    </div>
                    <div className="p-2 bg-slate-50 border border-slate-300 rounded">
                      <div className="text-[9px] font-bold uppercase text-slate-700">Decided Sales Target</div>
                      <div className="text-sm font-black font-mono text-purple-900 mt-0.5">
                        ৳{decidedHorizonSalesTarget.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div className="p-2 bg-slate-50 border border-slate-300 rounded">
                      <div className="text-[9px] font-bold uppercase text-slate-700">Decided Coll. Target</div>
                      <div className="text-sm font-black font-mono text-teal-900 mt-0.5">
                        ৳{decidedHorizonCollectionTarget.toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>

                  {/* Item Breakdown Table */}
                  <div className="border border-black rounded overflow-hidden">
                    <table className="w-full text-left border-collapse text-[10px]">
                      <thead>
                        <tr className="bg-slate-100 text-black border-b border-black font-bold">
                          <th className="p-1.5 text-center w-8 border-r border-black">SL</th>
                          <th className="p-1.5 border-r border-black">Item Name</th>
                          <th className="p-1.5 w-24 border-r border-black">Category</th>
                          <th className="p-1.5 text-right w-14 border-r border-black">Past Sold</th>
                          <th className="p-1.5 text-right w-14 border-r border-black">Sales Idea</th>
                          <th className="p-1.5 text-right w-14 border-r border-black">Stock</th>
                          <th className="p-1.5 text-right w-14 border-r border-black">Shortfall</th>
                          <th className="p-1.5 text-right w-16 border-r border-black">Rate (৳)</th>
                          <th className="p-1.5 text-right w-20">Amount (৳)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {sortedForecasts.map((row) => {
                          const isSpecialItemRange = Boolean(row.item.isSpecialItem);
                          return (
                            <tr
                              key={row.item.id}
                              className="border-b border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                            >
                              <td className="p-1 text-center font-mono font-bold border-r border-slate-200 text-slate-700 bg-white">
                                {row.masterSl}
                              </td>
                              <td className="p-1 font-bold border-r border-slate-200 text-black bg-white">
                                {row.item.name}
                              </td>
                              <td className="p-1 border-r border-slate-200 text-slate-700 bg-white">
                                {row.item.category}
                              </td>
                              <td className="p-1 text-right font-mono border-r border-slate-200 text-slate-700 bg-white">
                                {row.pastTotalSold.toLocaleString('en-IN')}
                              </td>
                              <td className="p-1 text-right font-mono font-bold border-r border-slate-200 text-black bg-white">
                                {row.predictedDemandQty.toLocaleString('en-IN')}
                              </td>
                              <td className="p-1 text-right font-mono font-bold border-r border-slate-200 text-black bg-white">
                                {row.currentStock.toLocaleString('en-IN')}
                              </td>
                              <td className="p-1 text-right font-mono font-bold border-r border-slate-200 bg-white">
                                {row.shortfall > 0 ? (
                                  <span className="text-black font-bold">
                                    +{row.shortfall.toLocaleString('en-IN')}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>
                              <td className="p-1 text-right font-mono border-r border-slate-200 text-slate-800 bg-white">
                                {row.activeRate.toLocaleString('en-IN')}
                              </td>
                              <td className="p-1 text-right font-mono font-bold text-black bg-white">
                                {Math.round(row.estimatedRevenue).toLocaleString('en-IN')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100 text-black font-black text-[10px] border-t-2 border-black">
                          <td colSpan={3} className="p-1.5 text-right uppercase">
                            Grand Totals:
                          </td>
                          <td className="p-1.5 text-right font-mono">
                            {totalPastSold.toLocaleString('en-IN')}
                          </td>
                          <td className="p-1.5 text-right font-mono">
                            {Math.round(totalForecastDemandQty).toLocaleString('en-IN')}
                          </td>
                          <td className="p-1.5 text-right font-mono">
                            {Math.round(totalCurrentStockQty).toLocaleString('en-IN')}
                          </td>
                          <td className="p-1.5 text-right font-mono">
                            {Math.round(totalReorderShortfallQty).toLocaleString('en-IN')}
                          </td>
                          <td className="p-1.5 text-right">-</td>
                          <td className="p-1.5 text-right font-mono text-xs">
                            ৳{Math.round(totalForecastRevenue).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Signatures & Approvals */}
                <div className="pt-6 mt-6 border-t border-black grid grid-cols-3 gap-8 text-center text-[10px]">
                  <div>
                    <div className="border-t border-slate-400 pt-1 font-bold text-slate-900">
                      Prepared By (AI Engine / Store)
                    </div>
                    <div className="text-[9px] text-slate-600">Inventory & Sales Audit</div>
                  </div>
                  <div>
                    <div className="border-t border-slate-400 pt-1 font-bold text-slate-900">
                      Checked By (Sales In-Charge)
                    </div>
                    <div className="text-[9px] text-slate-600">Madhupur Sales Center</div>
                  </div>
                  <div>
                    <div className="border-t border-slate-400 pt-1 font-bold text-slate-900">
                      Approved By (Factory GM)
                    </div>
                    <div className="text-[9px] text-slate-600">Poly Cable Industries Ltd.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AISalesForecastModal;
