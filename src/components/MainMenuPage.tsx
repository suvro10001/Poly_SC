import React, { useState, useMemo, useEffect } from 'react';
import { PolyCablesLogo, PolyCablesEmblem } from './PolyCablesLogo';
import {
  ViewTab,
  StoredBill,
  CollectionMR,
  BankDeposit,
  Party,
  Salesperson,
  Item,
  DeliveryChallan,
  Requisition,
  CompanyDetails,
  AuthUser,
  BranchLocation
} from '../types';
import { defaultBranches } from '../data/defaultData';
import {
  FileText,
  Layers,
  BarChart3,
  Truck,
  History,
  Users,
  FolderOpen,
  HelpCircle,
  PlusCircle,
  TrendingUp,
  Building2,
  Wallet,
  ArrowRight,
  Target,
  Sliders,
  CheckCircle2,
  Save,
  X,
  UserCheck,
  Calendar,
  DollarSign,
  Flame,
  Award,
  Boxes,
  Percent,
  ListOrdered,
  Calculator,
  ChevronDown,
  RotateCcw,
  Sparkles,
  Coins,
  Activity,
  Crown,
  Bell
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell
} from 'recharts';
import { parseDateToISO } from '../utils/dateUtils';
import {
  isStrictSuperAdmin,
  isSuperAdminOrAgm,
  isInCharge,
  isAccountsOrStaff,
  isFactoryUser,
  isAnyAdmin,
  getAllAdmins,
  getAdminBranches,
  filterBranchesForUser,
  billMatchesBranch,
  collectionMatchesBranch,
  cleanBranchName,
  isUnwantedSalesCenter,
  isMarketingOfficer
} from '../utils/branchAccess';
import { AISalesForecastModal } from './AISalesForecastModal';
import { getActivePriceCircularInfo } from '../utils/priceCircularHelper';
import { InfographicPieDonutGraph, InfographicSliceData } from './CyberDonutChart';

interface MainMenuPageProps {
  storedBills: StoredBill[];
  collections: CollectionMR[];
  bankDeposits: BankDeposit[];
  parties: Party[];
  salespersons: Salesperson[];
  items: Item[];
  deliveryChallans?: DeliveryChallan[];
  requisitions?: Requisition[];
  company: CompanyDetails;
  currentUser?: AuthUser | null;
  branches?: BranchLocation[];
  allBranches?: BranchLocation[];
  allStoredBills?: StoredBill[];
  allCollections?: CollectionMR[];
  onSyncCloud?: (slice: Record<string, any>, immediate?: boolean) => void;
  onNavigate: (tab: ViewTab, itemSub?: any, repSub?: any, expSub?: any, setSub?: any, reqSub?: any) => void;
  onNewBill: () => void;
  onOpenShortcuts: () => void;
  unreadCommCount?: number;
  onOpenNotifications?: () => void;
}

interface CustomYearlyTargetMap {
  [salespersonCode: string]: {
    targetSales: number;
    targetCollection: number;
  };
}

export const formatTkAmount = (amount: number): string => {
  const rounded = Math.round(amount || 0);
  return `৳${rounded.toLocaleString('en-IN')}`;
};

export const MainMenuPage: React.FC<MainMenuPageProps> = ({
  storedBills,
  collections,
  bankDeposits,
  parties,
  salespersons,
  items,
  deliveryChallans = [],
  requisitions = [],
  company,
  currentUser,
  branches = [],
  allBranches,
  allStoredBills,
  allCollections,
  onSyncCloud,
  onNavigate,
  onNewBill,
  onOpenShortcuts,
  unreadCommCount = 0,
  onOpenNotifications
}) => {
  // Lifetime Overview Totals
  const totalSales = useMemo(
    () => storedBills.reduce((sum, b) => sum + (b.grandTotal || 0), 0),
    [storedBills]
  );
  const totalCollections = useMemo(
    () => collections.reduce((sum, c) => sum + (c.amount || 0), 0),
    [collections]
  );
  const totalDeposits = useMemo(
    () => bankDeposits.reduce((sum, d) => sum + (d.amount || 0), 0),
    [bankDeposits]
  );

  const overallCollectionRatio = totalSales > 0 ? Math.round((totalCollections / totalSales) * 100) : 0;

  // Detect available years from stored bills and collections
  const availableYears = useMemo(() => {
    const currentYr = new Date().getFullYear();
    const yearSet = new Set<number>([2026, currentYr, currentYr - 1]);

    storedBills.forEach((b) => {
      const iso = parseDateToISO(b.header?.date || b.savedAt);
      if (iso && iso.length >= 4) {
        const y = parseInt(iso.substring(0, 4), 10);
        if (!isNaN(y) && y >= 2000 && y <= 2100) yearSet.add(y);
      }
    });

    collections.forEach((c) => {
      const iso = parseDateToISO(c.date || c.savedAt);
      if (iso && iso.length >= 4) {
        const y = parseInt(iso.substring(0, 4), 10);
        if (!isNaN(y) && y >= 2000 && y <= 2100) yearSet.add(y);
      }
    });

    return Array.from(yearSet).sort((a, b) => b - a);
  }, [storedBills, collections]);

  const [selectedYear, setSelectedYear] = useState<number>(() => {
    return 2026;
  });

  // Effective branches / sales centers (strictly isolated for Regional Admins)
  const effectiveBranches = useMemo(() => {
    let list = branches && branches.length > 0 ? branches : defaultBranches;
    if (!branches || branches.length === 0) {
      try {
        const saved = localStorage.getItem('polycables_branches');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) list = parsed;
        }
      } catch {}
    }
    return filterBranchesForUser(list, currentUser, salespersons);
  }, [branches, currentUser, salespersons]);

  // Helper: strictly validate real Sales Centers (excluding Marketing Officers, staff, Head Office, Factory, Portal, and inactive entries)
  const spNameLowerSet = useMemo(() => {
    const set = new Set<string>();
    (salespersons || []).forEach((sp) => {
      const n = (sp?.name || '').trim().toLowerCase();
      if (n) set.add(n);
    });
    return set;
  }, [salespersons]);

  const filterValidSalesCentersList = (branchArr: BranchLocation[]) => {
    const seen = new Set<string>();
    return (branchArr || []).filter((b) => {
      if (!b || !b.name) return false;
      if (isUnwantedSalesCenter(b)) return false;

      const idLower = String(b.id || '').trim().toLowerCase();
      const rawNameLower = String(b.name || '').trim().toLowerCase();
      const cleanLower = cleanBranchName(b.name).trim().toLowerCase();
      const typeLower = String(b.type || '').trim().toLowerCase();

      if (!rawNameLower) return false;
      if (idLower.startsWith('sp-')) return false;
      if (
        typeLower === 'factory' ||
        typeLower === 'marketing' ||
        typeLower === 'officer' ||
        typeLower === 'staff' ||
        typeLower === 'person' ||
        typeLower === 'salesperson'
      ) {
        return false;
      }
      if (
        rawNameLower.includes('billing portal') ||
        rawNameLower.includes('all sales center') ||
        rawNameLower === 'all' ||
        rawNameLower === 'factory'
      ) {
        return false;
      }

      const isKnownBranchType =
        typeLower === 'showroom' ||
        typeLower === 'head_office' ||
        typeLower === 'power_market' ||
        typeLower === 'office';

      const looksExplicitlyBranch =
        isKnownBranchType ||
        rawNameLower.includes('sales center') ||
        rawNameLower.includes('sales centre') ||
        rawNameLower.includes('showroom') ||
        rawNameLower.includes('branch') ||
        rawNameLower.includes('corporate') ||
        rawNameLower.includes('head office');

      if (!looksExplicitlyBranch && spNameLowerSet.has(cleanLower)) {
        return false;
      }
      if (
        !looksExplicitlyBranch &&
        (rawNameLower.includes('marketing') ||
          rawNameLower.includes('officer') ||
          rawNameLower.includes('accountant') ||
          rawNameLower.includes('manager'))
      ) {
        return false;
      }

      const dedupKey = idLower || rawNameLower;
      if (seen.has(dedupKey)) return false;
      seen.add(dedupKey);
      return true;
    });
  };

  // Filter Marketing Officers strictly (excluding Admins, Managers, In-Charges, Accountants, Staff, Factory, and inactive users)
  const marketingPersons = useMemo(() => {
    const allowedIds = new Set(effectiveBranches.map((b) => String(b.id || '').toLowerCase()));
    const allowedNames = new Set(effectiveBranches.map((b) => cleanBranchName(b.name).toLowerCase()));
    const scopeToCenters = !isStrictSuperAdmin(currentUser) && effectiveBranches.length > 0;
    const seenCodes = new Set<string>();
    const seenNames = new Set<string>();

    return (salespersons || []).filter((sp) => {
      if (!isMarketingOfficer(sp)) return false;
      const nameLower = (sp.name || '').trim().toLowerCase();
      const codeLower = (sp.code || '').trim().toLowerCase();
      if (!nameLower || !codeLower) return false;

      if (scopeToCenters) {
        const spBranchId = String(sp.branchId || '').toLowerCase();
        const spBranchName = cleanBranchName(sp.branchName || '').toLowerCase();
        const spAssignedBranchIds = Array.isArray((sp as any).assignedBranchIds)
          ? (sp as any).assignedBranchIds.map((id: any) => String(id || '').toLowerCase())
          : [];
        const spBranchIds = Array.isArray((sp as any).branchIds)
          ? (sp as any).branchIds.map((id: any) => String(id || '').toLowerCase())
          : [];
        const matchesCenter =
          (spBranchId && allowedIds.has(spBranchId)) ||
          spAssignedBranchIds.some((id: string) => allowedIds.has(id)) ||
          spBranchIds.some((id: string) => allowedIds.has(id)) ||
          (spBranchName && Array.from(allowedNames).some((n) => spBranchName.includes(n) || n.includes(spBranchName)));
        if (!matchesCenter) return false;
      }

      if (seenCodes.has(codeLower) || seenNames.has(nameLower)) return false;
      seenCodes.add(codeLower);
      seenNames.add(nameLower);
      return true;
    });
  }, [salespersons, effectiveBranches, currentUser]);

  // Target storage with localStorage
  const [customTargets, setCustomTargets] = useState<CustomYearlyTargetMap>(() => {
    try {
      const saved = localStorage.getItem('polycables_salesperson_yearly_targets');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // fallback
    }
    const init: CustomYearlyTargetMap = {};
    marketingPersons.forEach((sp) => {
      init[sp.code] = {
        targetSales: sp.monthlyTargetSales ? sp.monthlyTargetSales * 12 : 24000000,
        targetCollection: sp.monthlyTargetCollection ? sp.monthlyTargetCollection * 12 : 20000000
      };
    });
    return init;
  });

  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [isAIForecastModalOpen, setIsAIForecastModalOpen] = useState(false);
  const [targetEditForm, setTargetEditForm] = useState<CustomYearlyTargetMap>({});
  const [targetSaveSuccess, setTargetSaveSuccess] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(1);
  const [targetViewMode, setTargetViewMode] = useState<'all' | 'monthly' | 'yearly'>('all');

  const userRole = (currentUser?.role || '').toLowerCase();
  const isSuperAdminUser = Boolean(currentUser?.isSuperAdmin || currentUser?.username?.toLowerCase() === 'suvroadmin');
  const canViewTargets = isSuperAdminUser || 
    userRole.includes('admin') || 
    userRole.includes('approver') || 
    userRole.includes('in-charge') || 
    userRole.includes('incharge');

  // Sync targets if marketing persons change
  useEffect(() => {
    setCustomTargets((prev) => {
      const next = { ...prev };
      let changed = false;
      marketingPersons.forEach((sp) => {
        if (!next[sp.code]) {
          next[sp.code] = {
            targetSales: sp.monthlyTargetSales ? sp.monthlyTargetSales * 12 : 24000000,
            targetCollection: sp.monthlyTargetCollection ? sp.monthlyTargetCollection * 12 : 20000000
          };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [marketingPersons]);

  const handleOpenTargetModal = () => {
    const copy: CustomYearlyTargetMap = {};
    marketingPersons.forEach((sp) => {
      const existing = customTargets[sp.code];
      copy[sp.code] = {
        targetSales: existing?.targetSales ?? (sp.monthlyTargetSales ? sp.monthlyTargetSales * 12 : 24000000),
        targetCollection: existing?.targetCollection ?? (sp.monthlyTargetCollection ? sp.monthlyTargetCollection * 12 : 20000000)
      };
    });
    setTargetEditForm(copy);
    setIsTargetModalOpen(true);
  };

  const handleSaveTargets = () => {
    setCustomTargets(targetEditForm);
    try {
      localStorage.setItem('polycables_salesperson_yearly_targets', JSON.stringify(targetEditForm));
    } catch (e) {
      console.error('Failed to save targets to localStorage:', e);
    }

    // Sync to salespersons list in localStorage
    try {
      const existingSp = localStorage.getItem('polycables_salespersons');
      if (existingSp) {
        const parsed: Salesperson[] = JSON.parse(existingSp);
        const updated = parsed.map((sp) => {
          const t = targetEditForm[sp.code];
          if (!t) return sp;
          return {
            ...sp,
            yearlyTargetSales: t.targetSales,
            monthlyTargetSales: Math.round(t.targetSales / 12),
            yearlyTargetCollection: t.targetCollection,
            monthlyTargetCollection: Math.round(t.targetCollection / 12)
          };
        });
        localStorage.setItem('polycables_salespersons', JSON.stringify(updated));
        onSyncCloud?.({ salespersons: updated, salespersonTargets: targetEditForm }, true);
      } else {
        onSyncCloud?.({ salespersonTargets: targetEditForm }, true);
      }
    } catch (e) {}

    setTargetSaveSuccess(true);
    setTimeout(() => {
      setTargetSaveSuccess(false);
      setIsTargetModalOpen(false);
    }, 700);
  };

  // Sales Center Yearly Targets State
  const [customScTargets, setCustomScTargets] = useState<Record<string, { targetSales: number; targetCollection: number }>>(() => {
    try {
      const saved = localStorage.getItem('polycables_salescenter_yearly_targets');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });
  const [isScTargetModalOpen, setIsScTargetModalOpen] = useState(false);
  const [scTargetEditForm, setScTargetEditForm] = useState<Record<string, { targetSales: number; targetCollection: number }>>({});
  const [scTargetSaveSuccess, setScTargetSaveSuccess] = useState(false);

  // Yearly Bills and Collections
  const yearPrefix = `${selectedYear}-`;
  const yearBills = useMemo(() => {
    return storedBills.filter((b) => {
      if (b.isDraft || b.header?.isDraft || b.status === 'draft') return false;
      const iso = parseDateToISO(b.header?.date || b.savedAt);
      return iso && iso.startsWith(yearPrefix);
    });
  }, [storedBills, yearPrefix]);

  const yearCollections = useMemo(() => {
    return collections.filter((c) => {
      const isSettlement =
        c.isYearClosingCollection ||
        (c.remarks && (c.remarks.includes('Year-End Settlement') || c.remarks.includes('Closing Settlement'))) ||
        (c.mrNo && (c.mrNo.startsWith('MR-CLOSE') || c.mrNo.startsWith('YE-Close')));
      if (isSettlement) return false;
      const iso = parseDateToISO(c.date || c.savedAt);
      return iso && iso.startsWith(yearPrefix);
    });
  }, [collections, yearPrefix]);

  // Selected Year Summary Metrics
  const yearTotalSales = useMemo(
    () => yearBills.reduce((sum, b) => sum + (b.grandTotal || 0), 0),
    [yearBills]
  );
  const yearTotalCollections = useMemo(
    () => yearCollections.reduce((sum, c) => sum + (c.amount || 0), 0),
    [yearCollections]
  );
  const yearCollectionRatio = yearTotalSales > 0 ? Math.round((yearTotalCollections / yearTotalSales) * 100) : 0;
  const yearNetGap = yearTotalSales - yearTotalCollections;

  // Monthly Breakdown Data for the Graph (Jan - Dec)
  const monthlyGraphData = useMemo(() => {
    const months = [
      { name: 'Jan', monthIdx: 0, prefix: `${selectedYear}-01` },
      { name: 'Feb', monthIdx: 1, prefix: `${selectedYear}-02` },
      { name: 'Mar', monthIdx: 2, prefix: `${selectedYear}-03` },
      { name: 'Apr', monthIdx: 3, prefix: `${selectedYear}-04` },
      { name: 'May', monthIdx: 4, prefix: `${selectedYear}-05` },
      { name: 'Jun', monthIdx: 5, prefix: `${selectedYear}-06` },
      { name: 'Jul', monthIdx: 6, prefix: `${selectedYear}-07` },
      { name: 'Aug', monthIdx: 7, prefix: `${selectedYear}-08` },
      { name: 'Sep', monthIdx: 8, prefix: `${selectedYear}-09` },
      { name: 'Oct', monthIdx: 9, prefix: `${selectedYear}-10` },
      { name: 'Nov', monthIdx: 10, prefix: `${selectedYear}-11` },
      { name: 'Dec', monthIdx: 11, prefix: `${selectedYear}-12` }
    ];

    return months.map((m) => {
      const monthBills = yearBills.filter((b) => {
        const iso = parseDateToISO(b.header?.date || b.savedAt);
        return iso && iso.startsWith(m.prefix);
      });
      const monthColls = yearCollections.filter((c) => {
        const iso = parseDateToISO(c.date || c.savedAt);
        return iso && iso.startsWith(m.prefix);
      });

      const mSales = monthBills.reduce((sum, b) => sum + (b.grandTotal || 0), 0);
      const mColl = monthColls.reduce((sum, c) => sum + (c.amount || 0), 0);
      const mRatio = mSales > 0 ? Math.round((mColl / mSales) * 100) : 0;

      return {
        month: m.name,
        Sales: mSales,
        Collection: mColl,
        ratio: mRatio
      };
    });
  }, [yearBills, yearCollections, selectedYear]);

  // Multi-Year Yearly Comparison Graph Data (for non-admin, non-factory Monthly & Yearly view)
  const yearlyComparisonGraphData = useMemo(() => {
    const yearsAsc = [...availableYears].sort((a, b) => a - b);
    return yearsAsc.map((yr) => {
      const prefix = `${yr}-`;
      const yBills = storedBills.filter((b) => {
        if (b.isDraft || b.header?.isDraft || b.status === 'draft') return false;
        const iso = parseDateToISO(b.header?.date || b.savedAt);
        return iso && iso.startsWith(prefix);
      });
      const yCols = collections.filter((c) => {
        const isSettlement =
          c.isYearClosingCollection ||
          (c.remarks && (c.remarks.includes('Year-End Settlement') || c.remarks.includes('Closing Settlement'))) ||
          (c.mrNo && (c.mrNo.startsWith('MR-CLOSE') || c.mrNo.startsWith('YE-Close')));
        if (isSettlement) return false;
        const iso = parseDateToISO(c.date || c.savedAt);
        return iso && iso.startsWith(prefix);
      });

      const ySales = yBills.reduce((sum, b) => sum + (b.grandTotal || 0), 0);
      const yColl = yCols.reduce((sum, c) => sum + (c.amount || 0), 0);
      return {
        year: `${yr}`,
        Sales: ySales,
        Collection: yColl,
        ratio: ySales > 0 ? Math.round((yColl / ySales) * 100) : 0
      };
    });
  }, [availableYears, storedBills, collections]);

  // Month helper names
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentMonthName = typeof selectedMonth === 'number' ? monthNames[selectedMonth - 1] : 'Full Year Avg';

  // Marketing Person Wise Performance Calculations (Monthly & Yearly)
  const marketingPerformanceList = useMemo(() => {
    return marketingPersons.map((sp) => {
      const spCode = sp.code.trim().toUpperCase();
      const spNameLower = sp.name.trim().toLowerCase();

      // Assigned parties
      const spParties = parties.filter(
        (p) => (p.salesmanCode || '').trim().toUpperCase() === spCode
      );
      const spPartyNames = new Set(spParties.map((p) => p.name.trim().toLowerCase()));

      // Bills in selected year
      const spBills = yearBills.filter((b) => {
        const headerCode = (b.header?.salesmanCode || b.salesmanCode || '').trim().toUpperCase();
        if (headerCode === spCode) return true;
        const bParty = (b.partyName || b.header?.partyName || '').trim().toLowerCase();
        if (bParty && spPartyNames.has(bParty)) return true;
        const bSalesName = (b.salesmanName || '').trim().toLowerCase();
        if (bSalesName && bSalesName.includes(spNameLower)) return true;
        return false;
      });

      // Collections in selected year
      const spColls = yearCollections.filter((c) => {
        const cCode = (c.salesmanCode || '').trim().toUpperCase();
        if (cCode === spCode) return true;
        const cMkt = (c.marketingPerson || '').trim().toLowerCase();
        if (cMkt && (cMkt === spNameLower || cMkt.includes(spNameLower))) return true;
        const cParty = (c.partyName || '').trim().toLowerCase();
        if (cParty && spPartyNames.has(cParty)) return true;
        const cCollector = (c.collectedBy || '').trim().toLowerCase();
        if (cCollector && cCollector.includes(spNameLower)) return true;
        return false;
      });

      // Selected Month filter
      const spMonthBills = spBills.filter((b) => {
        if (selectedMonth === 'all') return true;
        const iso = parseDateToISO(b.header?.date || b.savedAt);
        if (!iso || iso.length < 7) return false;
        const m = parseInt(iso.substring(5, 7), 10);
        return m === selectedMonth;
      });

      const spMonthColls = spColls.filter((c) => {
        if (selectedMonth === 'all') return true;
        const iso = parseDateToISO(c.date || c.savedAt);
        if (!iso || iso.length < 7) return false;
        const m = parseInt(iso.substring(5, 7), 10);
        return m === selectedMonth;
      });

      // Yearly Achieved
      const achievedSalesYearly = spBills.reduce((sum, b) => sum + (b.grandTotal || b.netAmount || 0), 0);
      const achievedCollectionYearly = spColls.reduce((sum, c) => sum + (c.amount || 0), 0);

      // Monthly Achieved (actual for selected month, or monthly average if 'all')
      const achievedSalesMonthly = selectedMonth === 'all'
        ? Math.round(achievedSalesYearly / 12)
        : spMonthBills.reduce((sum, b) => sum + (b.grandTotal || b.netAmount || 0), 0);

      const achievedCollectionMonthly = selectedMonth === 'all'
        ? Math.round(achievedCollectionYearly / 12)
        : spMonthColls.reduce((sum, c) => sum + (c.amount || 0), 0);

      // Yearly Targets configured by user
      const targetConfig = customTargets[sp.code] || {
        targetSales: sp.monthlyTargetSales ? sp.monthlyTargetSales * 12 : 24000000,
        targetCollection: sp.monthlyTargetCollection ? sp.monthlyTargetCollection * 12 : 20000000
      };

      const targetSalesYearly = targetConfig.targetSales || 1;
      const targetCollectionYearly = targetConfig.targetCollection || 1;

      // Automatically calculated Monthly Targets (Yearly / 12)
      const targetSalesMonthly = Math.round(targetSalesYearly / 12) || 1;
      const targetCollectionMonthly = Math.round(targetCollectionYearly / 12) || 1;

      // Percentage Met - Monthly
      const salesPctMonthly = Math.round((achievedSalesMonthly / targetSalesMonthly) * 100);
      const collPctMonthly = Math.round((achievedCollectionMonthly / targetCollectionMonthly) * 100);

      // Percentage Met - Yearly
      const salesPctYearly = Math.round((achievedSalesYearly / targetSalesYearly) * 100);
      const collPctYearly = Math.round((achievedCollectionYearly / targetCollectionYearly) * 100);

      // Ratios
      const collectionToSalesRatioYearly = achievedSalesYearly > 0 ? Math.round((achievedCollectionYearly / achievedSalesYearly) * 100) : 0;
      const collectionToSalesRatioMonthly = achievedSalesMonthly > 0 ? Math.round((achievedCollectionMonthly / achievedSalesMonthly) * 100) : 0;

      // Overall Score
      const overallScore = Math.round((salesPctYearly * 0.55) + (collPctYearly * 0.45));

      return {
        salesperson: sp,
        targetSalesYearly,
        targetCollectionYearly,
        targetSalesMonthly,
        targetCollectionMonthly,
        achievedSalesYearly,
        achievedCollectionYearly,
        achievedSalesMonthly,
        achievedCollectionMonthly,
        salesPctMonthly,
        collPctMonthly,
        salesPctYearly,
        collPctYearly,
        collectionToSalesRatioYearly,
        collectionToSalesRatioMonthly,
        overallScore,
        billsCountYearly: spBills.length,
        collsCountYearly: spColls.length,
        billsCountMonthly: spMonthBills.length,
        collsCountMonthly: spMonthColls.length,
        assignedPartiesCount: spParties.length
      };
    }).sort((a, b) => b.overallScore - a.overallScore);
  }, [marketingPersons, yearBills, yearCollections, parties, customTargets, selectedMonth]);

  // Team Aggregate Totals (Both Monthly & Yearly)
  const teamTotals = useMemo(() => {
    let totTargetSalesYearly = 0;
    let totAchievedSalesYearly = 0;
    let totTargetCollsYearly = 0;
    let totAchievedCollsYearly = 0;

    let totTargetSalesMonthly = 0;
    let totAchievedSalesMonthly = 0;
    let totTargetCollsMonthly = 0;
    let totAchievedCollsMonthly = 0;

    let totBills = 0;
    let totColls = 0;

    marketingPerformanceList.forEach((p) => {
      totTargetSalesYearly += p.targetSalesYearly;
      totAchievedSalesYearly += p.achievedSalesYearly;
      totTargetCollsYearly += p.targetCollectionYearly;
      totAchievedCollsYearly += p.achievedCollectionYearly;

      totTargetSalesMonthly += p.targetSalesMonthly;
      totAchievedSalesMonthly += p.achievedSalesMonthly;
      totTargetCollsMonthly += p.targetCollectionMonthly;
      totAchievedCollsMonthly += p.achievedCollectionMonthly;

      totBills += p.billsCountYearly;
      totColls += p.collsCountYearly;
    });

    const salesAchPctYearly = totTargetSalesYearly > 0 ? Math.round((totAchievedSalesYearly / totTargetSalesYearly) * 100) : 0;
    const collAchPctYearly = totTargetCollsYearly > 0 ? Math.round((totAchievedCollsYearly / totTargetCollsYearly) * 100) : 0;
    const salesAchPctMonthly = totTargetSalesMonthly > 0 ? Math.round((totAchievedSalesMonthly / totTargetSalesMonthly) * 100) : 0;
    const collAchPctMonthly = totTargetCollsMonthly > 0 ? Math.round((totAchievedCollsMonthly / totTargetCollsMonthly) * 100) : 0;

    return {
      totTargetSalesYearly,
      totAchievedSalesYearly,
      salesAchPctYearly,
      totTargetCollsYearly,
      totAchievedCollsYearly,
      collAchPctYearly,

      totTargetSalesMonthly,
      totAchievedSalesMonthly,
      salesAchPctMonthly,
      totTargetCollsMonthly,
      totAchievedCollsMonthly,
      collAchPctMonthly,

      totBills,
      totColls
    };
  }, [marketingPerformanceList]);

  const allSalesCenterAnalytics = useMemo(() => {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1'];
    return filterValidSalesCentersList(effectiveBranches)
      .map((b, idx) => {
        const bClean = cleanBranchName(b.name);
        const rawArea = String((b as any).area || (b as any).territory || b.location || b.district || (b as any).address || '').trim();
        const area = rawArea || bClean.replace(/\s*Sales Center$/i, '').trim() || bClean;
        const bBills = storedBills.filter((bill) => {
          if (bill.isDraft || bill.header?.isDraft || bill.status === 'draft') return false;
          return billMatchesBranch(bill, b.id, effectiveBranches, salespersons, parties);
        });
        const bColls = collections.filter((c) =>
          collectionMatchesBranch(c, b.id, effectiveBranches, salespersons, parties)
        );

        const totalSales = bBills.reduce((sum, bill) => sum + (bill.grandTotal || 0), 0);
        const totalCollection = bColls.reduce((sum, c) => sum + (c.amount || 0), 0);
        const ratio = totalSales > 0 ? Math.round((totalCollection / totalSales) * 100) : 0;

        return {
          id: b.id,
          name: bClean,
          area,
          inCharge: b.inChargeName || (b as any).inCharge || 'Branch In-Charge',
          billCount: bBills.length,
          totalSales,
          totalCollection,
          ratio,
          color: colors[idx % colors.length]
        };
      });
  }, [effectiveBranches, storedBills, collections, salespersons, parties]);

  const hisSalesCenterAnalytics = useMemo(() => {
    if (!currentUser || isStrictSuperAdmin(currentUser) || currentUser.isSuperAdmin || currentUser.username?.toLowerCase() === 'suvroadmin') {
      return allSalesCenterAnalytics;
    }
    if (isAnyAdmin(currentUser)) {
      const adminBranches = getAdminBranches(currentUser, effectiveBranches, salespersons);
      if (adminBranches.length > 0) {
        const adminIds = new Set(adminBranches.map((ab) => ab.id));
        const adminNames = new Set(adminBranches.map((ab) => cleanBranchName(ab.name).toLowerCase()));
        return allSalesCenterAnalytics.filter(
          (sc) => adminIds.has(sc.id) || adminNames.has(sc.name.toLowerCase())
        );
      }
      return allSalesCenterAnalytics;
    }
    const filtered = allSalesCenterAnalytics.filter((sc) => {
      if ((currentUser as any).assignedBranchIds?.includes(sc.id)) return true;
      if ((currentUser as any).branchIds?.includes(sc.id)) return true;
      if (currentUser.branchId && currentUser.branchId === sc.id) return true;
      if (currentUser.branchName && cleanBranchName(currentUser.branchName) === sc.name) return true;
      return false;
    });
    return filtered;
  }, [allSalesCenterAnalytics, currentUser, effectiveBranches, salespersons]);

  const isStrictSuperAdminUser = isStrictSuperAdmin(currentUser);
  const isSuperAdmin = isSuperAdminOrAgm(currentUser);
  const isAdminUser = isSuperAdmin || 
    isAnyAdmin(currentUser) ||
    (currentUser?.role || '').toLowerCase().includes('admin') || 
    (currentUser?.userRole || '').toLowerCase().includes('admin') ||
    (currentUser?.username || '').toLowerCase().includes('admin');
  const isRegionalAdminOnly = isAdminUser && !isStrictSuperAdminUser;
  const isFactoryRole = isFactoryUser(currentUser);
  const isOtherNonAdminRole = !isAdminUser && !isStrictSuperAdminUser && !isFactoryRole;
  const inCharge = isInCharge(currentUser, salespersons);
  const isStaffOrAccounts = isAccountsOrStaff(currentUser) || Boolean(
    currentUser?.role === 'accounts' ||
    currentUser?.role === 'staff' ||
    (currentUser?.userRole || '').toLowerCase().includes('account') ||
    (currentUser?.userRole || '').toLowerCase().includes('staff')
  );
  const isInChargeOrStaff = inCharge || isStaffOrAccounts;
  const isMarketingUser = !isAdminUser && !isInChargeOrStaff;

  // Admin-Wise Sales & Collection Slices (Super Admin View) + Sales-Center-Wise Slices (Admin View)
  const { adminWiseSalesSlices, adminWiseCollectionSlices, adminWiseGrandSales, adminWiseGrandCollection } = useMemo(() => {
    const palette = [
      { color: '#e83e8c', hoverColor: '#d62274' },
      { color: '#f97316', hoverColor: '#ea580c' },
      { color: '#f59e0b', hoverColor: '#d97706' },
      { color: '#06b6d4', hoverColor: '#0891b2' },
      { color: '#6366f1', hoverColor: '#4f46e5' },
      { color: '#10b981', hoverColor: '#059669' },
      { color: '#8b5cf6', hoverColor: '#7c3aed' },
      { color: '#14b8a6', hoverColor: '#0d9488' }
    ];
    const icons: Array<InfographicSliceData['icon']> = ['globe', 'trophy', 'target', 'lightbulb', 'gear'];

    const clusters = getAllAdmins(salespersons, effectiveBranches).filter((c) => {
      const u = (c.adminUsername || '').toLowerCase().trim();
      const n = (c.adminName || '').toLowerCase().trim();
      const id = (c.adminId || '').toLowerCase().trim();
      return u !== '111' && id !== '111' && n !== 'admin' && u !== 'admin' && id !== 'adm-111';
    });

    const clusterTotals = clusters.map((cluster) => {
      let cSales = 0;
      let cColl = 0;
      cluster.branches.forEach((b) => {
        const bBills = storedBills.filter((bill) => {
          if (bill.isDraft || bill.header?.isDraft || bill.status === 'draft') return false;
          return billMatchesBranch(bill, b.id, effectiveBranches, salespersons, parties);
        });
        const bCols = collections.filter((col) =>
          collectionMatchesBranch(col, b.id, effectiveBranches, salespersons, parties)
        );
        cSales += bBills.reduce((s, bill) => s + (bill.grandTotal || 0), 0);
        cColl += bCols.reduce((s, col) => s + (col.amount || 0), 0);
      });
      return {
        id: cluster.adminId,
        name: cluster.adminName,
        branchCount: cluster.branches.length,
        sales: cSales,
        collection: cColl
      };
    });

    const list = clusterTotals.length > 0
      ? clusterTotals
      : [{ id: 'adm-default', name: 'All Admins', branchCount: effectiveBranches.length, sales: totalSales, collection: totalCollections }];

    const grandSales = list.reduce((s, x) => s + x.sales, 0);
    const grandColl = list.reduce((s, x) => s + x.collection, 0);

    const build = (mode: 'sales' | 'collection'): InfographicSliceData[] => {
      const sorted = [...list].sort((a, b) => (mode === 'sales' ? b.sales - a.sales : b.collection - a.collection));
      const denom = mode === 'sales' ? grandSales : grandColl;
      const steppedRadii = [200, 170, 188, 168, 156, 178, 162, 152];
      return sorted.map((a, idx) => {
        const val = mode === 'sales' ? a.sales : a.collection;
        const pct = denom > 0 ? Math.max(val > 0 ? 1 : 0, Math.round((val / denom) * 100)) : Math.round(100 / sorted.length);
        const pal = palette[idx % palette.length];
        const radius = steppedRadii[idx % steppedRadii.length];
        return {
          id: `mm-adm-${mode}-${a.id}-${idx}`,
          label: a.name,
          percentage: pct,
          amount: val,
          color: pal.color,
          hoverColor: pal.hoverColor,
          outerRadius: radius,
          icon: icons[idx % icons.length],
          description: `${a.name} (${a.branchCount} Centers)`
        };
      });
    };

    return {
      adminWiseSalesSlices: build('sales'),
      adminWiseCollectionSlices: build('collection'),
      adminWiseGrandSales: grandSales,
      adminWiseGrandCollection: grandColl
    };
  }, [salespersons, effectiveBranches, storedBills, collections, parties, totalSales, totalCollections]);

  // Comparative All Sales Centers Round Graph Slices (all centers + areas)
  const { salesCenterSalesSlices, salesCenterCollectionSlices, scGrandSales, scGrandCollection } = useMemo(() => {
    const palette = [
      { color: '#e83e8c', hoverColor: '#d62274' },
      { color: '#06b6d4', hoverColor: '#0891b2' },
      { color: '#f59e0b', hoverColor: '#d97706' },
      { color: '#10b981', hoverColor: '#059669' },
      { color: '#6366f1', hoverColor: '#4f46e5' },
      { color: '#f97316', hoverColor: '#ea580c' },
      { color: '#8b5cf6', hoverColor: '#7c3aed' },
      { color: '#14b8a6', hoverColor: '#0d9488' }
    ];
    const icons: Array<InfographicSliceData['icon']> = ['globe', 'trophy', 'target', 'lightbulb', 'gear'];

    const rawBranchPool = allBranches && allBranches.length > 0 ? allBranches : effectiveBranches;
    const validAll = filterValidSalesCentersList(rawBranchPool);
    const sourceBranches = validAll.length > 0 ? validAll : filterValidSalesCentersList(effectiveBranches);
    const sourceBills = (allStoredBills && allStoredBills.length > 0 ? allStoredBills : storedBills).filter(
      (bill) => !(bill.isDraft || bill.header?.isDraft || bill.status === 'draft')
    );
    const sourceColls = allCollections && allCollections.length > 0 ? allCollections : collections;

    const list = sourceBranches.map((b) => {
      const bClean = cleanBranchName(b.name);
      const rawArea = String((b as any).area || (b as any).territory || (b as any).location || (b as any).district || (b as any).address || '').trim();
      const area = rawArea || bClean.replace(/\s*Sales Center$/i, '').trim() || bClean;
      const bBills = sourceBills.filter((bill) => billMatchesBranch(bill, b.id, sourceBranches, salespersons, parties));
      const bColls = sourceColls.filter((c) => collectionMatchesBranch(c, b.id, sourceBranches, salespersons, parties));
      return {
        id: b.id,
        name: bClean,
        area,
        totalSales: bBills.reduce((s, bill) => s + (bill.grandTotal || 0), 0),
        totalCollection: bColls.reduce((s, c) => s + (c.amount || 0), 0)
      };
    });

    const grandSales = list.reduce((s, x) => s + (x.totalSales || 0), 0);
    const grandColl = list.reduce((s, x) => s + (x.totalCollection || 0), 0);

    const build = (mode: 'sales' | 'collection'): InfographicSliceData[] => {
      const sorted = [...list].sort((a, b) => (mode === 'sales' ? b.totalSales - a.totalSales : b.totalCollection - a.totalCollection));
      const denom = mode === 'sales' ? grandSales : grandColl;
      const steppedRadii = [200, 170, 188, 168, 156, 178, 162, 152];
      return sorted.map((sc, idx) => {
        const val = mode === 'sales' ? sc.totalSales : sc.totalCollection;
        const pct = denom > 0 ? Math.max(val > 0 ? 1 : 0, Math.round((val / denom) * 100)) : Math.round(100 / sorted.length);
        const pal = palette[idx % palette.length];
        const radius = steppedRadii[idx % steppedRadii.length];
        return {
          id: `mm-sc-${mode}-${sc.id}-${idx}`,
          label: sc.name,
          percentage: pct,
          amount: val,
          color: pal.color,
          hoverColor: pal.hoverColor,
          outerRadius: radius,
          icon: icons[idx % icons.length],
          description: `Area: ${sc.area}`
        };
      });
    };

    return {
      salesCenterSalesSlices: build('sales'),
      salesCenterCollectionSlices: build('collection'),
      scGrandSales: grandSales,
      scGrandCollection: grandColl
    };
  }, [allBranches, allStoredBills, allCollections, effectiveBranches, storedBills, collections, salespersons, parties]);

  // Sales Center-Wise Monthly & Yearly Performance (Strictly scoped to Admin's own Sales Centers)
  const salesCenterPerformanceList = useMemo(() => {
    const sourceBranches = filterValidSalesCentersList(effectiveBranches);

    return sourceBranches.map((sc, idx) => {
      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1'];
      const bClean = cleanBranchName(sc.name);
      const rawArea = String((sc as any).area || (sc as any).territory || sc.location || sc.district || (sc as any).address || '').trim();
      const area = rawArea || bClean.replace(/\s*Sales Center$/i, '').trim() || bClean;

      const scBills = yearBills.filter((b) => billMatchesBranch(b, sc.id, effectiveBranches, salespersons, parties));
      const scColls = yearCollections.filter((c) => collectionMatchesBranch(c, sc.id, effectiveBranches, salespersons, parties));

      const scMonthBills = scBills.filter((b) => {
        if (selectedMonth === 'all') return true;
        const iso = parseDateToISO(b.header?.date || b.savedAt);
        if (!iso || iso.length < 7) return false;
        return parseInt(iso.substring(5, 7), 10) === selectedMonth;
      });
      const scMonthColls = scColls.filter((c) => {
        if (selectedMonth === 'all') return true;
        const iso = parseDateToISO(c.date || c.savedAt);
        if (!iso || iso.length < 7) return false;
        return parseInt(iso.substring(5, 7), 10) === selectedMonth;
      });

      const achievedSalesYearly = scBills.reduce((s, b) => s + (b.grandTotal || b.netAmount || 0), 0);
      const achievedCollectionYearly = scColls.reduce((s, c) => s + (c.amount || 0), 0);
      const achievedSalesMonthly = selectedMonth === 'all'
        ? Math.round(achievedSalesYearly / 12)
        : scMonthBills.reduce((s, b) => s + (b.grandTotal || b.netAmount || 0), 0);
      const achievedCollectionMonthly = selectedMonth === 'all'
        ? Math.round(achievedCollectionYearly / 12)
        : scMonthColls.reduce((s, c) => s + (c.amount || 0), 0);

      const branchOfficers = marketingPersons.filter(
        (sp) => sp.branchId === sc.id || (sp.branchName && cleanBranchName(sp.branchName).toLowerCase() === bClean.toLowerCase())
      );
      const officerSumSales = branchOfficers.reduce((sum, sp) => sum + (customTargets[sp.code]?.targetSales || (sp.monthlyTargetSales ? sp.monthlyTargetSales * 12 : 24000000)), 0);
      const officerSumColl = branchOfficers.reduce((sum, sp) => sum + (customTargets[sp.code]?.targetCollection || (sp.monthlyTargetCollection ? sp.monthlyTargetCollection * 12 : 20000000)), 0);

      const targetConfig = customScTargets[sc.id] || {
        targetSales: officerSumSales > 0 ? officerSumSales : 24000000,
        targetCollection: officerSumColl > 0 ? officerSumColl : 20000000
      };

      const targetSalesYearly = targetConfig.targetSales || 1;
      const targetCollectionYearly = targetConfig.targetCollection || 1;
      const targetSalesMonthly = Math.round(targetSalesYearly / 12) || 1;
      const targetCollectionMonthly = Math.round(targetCollectionYearly / 12) || 1;

      const salesPctMonthly = Math.round((achievedSalesMonthly / targetSalesMonthly) * 100);
      const collPctMonthly = Math.round((achievedCollectionMonthly / targetCollectionMonthly) * 100);
      const salesPctYearly = Math.round((achievedSalesYearly / targetSalesYearly) * 100);
      const collPctYearly = Math.round((achievedCollectionYearly / targetCollectionYearly) * 100);
      const collectionToSalesRatioYearly = achievedSalesYearly > 0 ? Math.round((achievedCollectionYearly / achievedSalesYearly) * 100) : 0;
      const overallScore = Math.round((salesPctYearly * 0.55) + (collPctYearly * 0.45));

      return {
        id: sc.id,
        name: bClean,
        area,
        inCharge: sc.inChargeName || (sc as any).inCharge || 'Branch In-Charge',
        officersCount: branchOfficers.length,
        color: colors[idx % colors.length],
        targetSalesYearly,
        targetCollectionYearly,
        targetSalesMonthly,
        targetCollectionMonthly,
        achievedSalesYearly,
        achievedCollectionYearly,
        achievedSalesMonthly,
        achievedCollectionMonthly,
        salesPctMonthly,
        collPctMonthly,
        salesPctYearly,
        collPctYearly,
        collectionToSalesRatioYearly,
        overallScore,
        billCount: scBills.length
      };
    }).sort((a, b) => b.overallScore - a.overallScore);
  }, [effectiveBranches, yearBills, yearCollections, selectedMonth, salespersons, parties, marketingPersons, customTargets, customScTargets]);

  const scTeamTotals = useMemo(() => {
    let totTargetSalesYearly = 0;
    let totAchievedSalesYearly = 0;
    let totTargetCollsYearly = 0;
    let totAchievedCollsYearly = 0;
    let totTargetSalesMonthly = 0;
    let totAchievedSalesMonthly = 0;
    let totTargetCollsMonthly = 0;
    let totAchievedCollsMonthly = 0;

    salesCenterPerformanceList.forEach((sc) => {
      totTargetSalesYearly += sc.targetSalesYearly;
      totAchievedSalesYearly += sc.achievedSalesYearly;
      totTargetCollsYearly += sc.targetCollectionYearly;
      totAchievedCollsYearly += sc.achievedCollectionYearly;
      totTargetSalesMonthly += sc.targetSalesMonthly;
      totAchievedSalesMonthly += sc.achievedSalesMonthly;
      totTargetCollsMonthly += sc.targetCollectionMonthly;
      totAchievedCollsMonthly += sc.achievedCollectionMonthly;
    });

    return {
      totTargetSalesYearly,
      totAchievedSalesYearly,
      salesAchPctYearly: totTargetSalesYearly > 0 ? Math.round((totAchievedSalesYearly / totTargetSalesYearly) * 100) : 0,
      totTargetCollsYearly,
      totAchievedCollsYearly,
      collAchPctYearly: totTargetCollsYearly > 0 ? Math.round((totAchievedCollsYearly / totTargetCollsYearly) * 100) : 0,
      totTargetSalesMonthly,
      totAchievedSalesMonthly,
      salesAchPctMonthly: totTargetSalesMonthly > 0 ? Math.round((totAchievedSalesMonthly / totTargetSalesMonthly) * 100) : 0,
      totTargetCollsMonthly,
      totAchievedCollsMonthly,
      collAchPctMonthly: totTargetCollsMonthly > 0 ? Math.round((totAchievedCollsMonthly / totTargetCollsMonthly) * 100) : 0
    };
  }, [salesCenterPerformanceList]);

  const handleOpenScTargetModal = () => {
    const copy: Record<string, { targetSales: number; targetCollection: number }> = {};
    salesCenterPerformanceList.forEach((sc) => {
      const existing = customScTargets[sc.id];
      copy[sc.id] = {
        targetSales: existing?.targetSales ?? sc.targetSalesYearly,
        targetCollection: existing?.targetCollection ?? sc.targetCollectionYearly
      };
    });
    setScTargetEditForm(copy);
    setIsScTargetModalOpen(true);
  };

  const handleSaveScTargets = () => {
    setCustomScTargets(scTargetEditForm);
    try {
      localStorage.setItem('polycables_salescenter_yearly_targets', JSON.stringify(scTargetEditForm));
    } catch {}
    onSyncCloud?.({ salesCenterTargets: scTargetEditForm }, true);
    setScTargetSaveSuccess(true);
    setTimeout(() => {
      setScTargetSaveSuccess(false);
      setIsScTargetModalOpen(false);
    }, 700);
  };

  const activeCircular = useMemo(() => getActivePriceCircularInfo(), []);

  return (
    <div className="space-y-4">
      {/* Top Banner with Quick Actions - Aurora Glassmorphism */}
      <div className="bg-[#081d2c]/55 backdrop-blur-2xl rounded-2xl px-4 py-3 sm:py-3.5 text-white shadow-[0_14px_38px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.08)] border border-white/[0.14] relative overflow-hidden">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="min-w-0">
            <PolyCablesLogo size="md" variant="dark" showSubtitle={true} subtitleText="ENTERPRISE SYSTEM" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Active Price Circular Badge */}
            <button
              type="button"
              onClick={() => onNavigate('price_history')}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.11] text-amber-300 font-bold rounded-lg shadow-xs border border-amber-400/50 text-xs cursor-pointer transition-all backdrop-blur-md"
              title="Active Price Circular: Click to view or update prices"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-slate-300">Active Rate:</span>
              <span className="font-mono text-amber-300">{activeCircular.displayDate}</span>
              <ArrowRight className="w-3 h-3 text-amber-400" />
            </button>

            {/* Right-Side Notifications & Team Chat / Video Call Button */}
            <button
              type="button"
              onClick={() => {
                if (onOpenNotifications) {
                  onOpenNotifications();
                } else {
                  window.dispatchEvent(new CustomEvent('polycables_open_comm_hub'));
                }
              }}
              className="relative inline-flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-100 font-bold rounded-lg shadow-xs border border-cyan-400/50 text-xs cursor-pointer transition-all backdrop-blur-md"
              title="Notifications, Messages, Video Call & Screen Share"
            >
              <Bell className={`w-3.5 h-3.5 text-cyan-300 ${unreadCommCount > 0 ? 'animate-bounce' : ''}`} />
              <span>Notifications</span>
              {unreadCommCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-md bg-rose-500 text-white text-[10px] font-black leading-tight">
                  {unreadCommCount > 99 ? '99+' : unreadCommCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Quick Stats Strip - Compact */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2.5 pt-2.5 border-t border-white/[0.10]">
          <div className="bg-white/[0.05] rounded-xl px-2.5 py-1.5 border border-white/[0.12]">
            <div className="text-[10px] sm:text-[11px] font-medium text-slate-300/80 uppercase tracking-wider">Total Stored Bills</div>
            <div className="text-sm sm:text-base font-bold text-white mt-0.5">{storedBills.length} Bills</div>
          </div>
          <div className="bg-white/[0.05] rounded-xl px-2.5 py-1.5 border border-white/[0.12]">
            <div className="text-[10px] sm:text-[11px] font-medium text-slate-300/80 uppercase tracking-wider">Total Sales</div>
            <div className="text-sm sm:text-base font-bold text-emerald-300 mt-0.5">{formatTkAmount(totalSales)}</div>
          </div>
          <div className="bg-white/[0.05] rounded-xl px-2.5 py-1.5 border border-white/[0.12]">
            <div className="text-[10px] sm:text-[11px] font-medium text-slate-300/80 uppercase tracking-wider">Total Collections</div>
            <div className="text-sm sm:text-base font-bold text-cyan-300 mt-0.5">{formatTkAmount(totalCollections)}</div>
          </div>
          <div className="bg-white/[0.05] rounded-xl px-2.5 py-1.5 border border-white/[0.12]">
            <div className="text-[10px] sm:text-[11px] font-medium text-slate-300/80 uppercase tracking-wider">Collection Ratio</div>
            <div className="text-sm sm:text-base font-bold text-amber-300 mt-0.5">{overallCollectionRatio}%</div>
          </div>
          <div className="bg-white/[0.05] rounded-xl px-2.5 py-1.5 border border-white/[0.12] col-span-2 sm:col-span-1">
            <div className="text-[10px] sm:text-[11px] font-medium text-slate-300/80 uppercase tracking-wider">Active Customers</div>
            <div className="text-sm sm:text-base font-bold text-purple-300 mt-0.5">{parties.length} Parties</div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ROLE-BASED ROUND INFOGRAPHIC GRAPHS (SUPER ADMIN: ADMIN WISE | ADMIN: SALES CENTER WISE) */}
      {/* ========================================================================= */}
      {(isStrictSuperAdminUser || isRegionalAdminOnly) && (
        <div className="bg-[#081d2c]/55 backdrop-blur-2xl border border-white/[0.14] p-4 sm:p-6 rounded-3xl shadow-[0_14px_38px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.08)] space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.10] pb-4">
            <div className="space-y-1">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-400/35 text-cyan-300 text-xs font-bold">
                {isStrictSuperAdminUser ? <Crown className="w-3.5 h-3.5 text-amber-400" /> : <Building2 className="w-3.5 h-3.5 text-cyan-400" />}
                <span>{isStrictSuperAdminUser ? 'Admin Wise Performance Infographic' : 'Sales Center Wise Performance Infographic'}</span>
              </div>
              <h3 className="text-xl font-black text-white tracking-tight">
                {isStrictSuperAdminUser ? 'Sales & Collections — Admin Wise' : 'Sales & Collections — Sales Center Wise'}
              </h3>
              <p className="text-xs text-slate-300/80">
                {isStrictSuperAdminUser
                  ? 'Admin wise net billed sales and collection realization share.'
                  : 'Sales Center wise net billed sales and collection realization share.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4" />
                  <span>{isStrictSuperAdminUser ? 'Admin Wise Sales' : 'Sales Center Wise Sales'}</span>
                </span>
                <span className="text-xs font-mono font-bold text-slate-200">
                  {formatTkAmount(isStrictSuperAdminUser ? adminWiseGrandSales : scGrandSales)}
                </span>
              </div>
              <InfographicPieDonutGraph
                title="SALES"
                subtitle={isStrictSuperAdminUser ? 'ADMIN WISE' : 'SALES CENTER'}
                centerMetric={
                  (isStrictSuperAdminUser ? adminWiseGrandSales : scGrandSales) >= 100000
                    ? `৳${((isStrictSuperAdminUser ? adminWiseGrandSales : scGrandSales) / 100000).toFixed(2)}L`
                    : `৳${((isStrictSuperAdminUser ? adminWiseGrandSales : scGrandSales) / 1000).toFixed(1)}k`
                }
                slices={isStrictSuperAdminUser ? adminWiseSalesSlices : salesCenterSalesSlices}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4" />
                  <span>{isStrictSuperAdminUser ? 'Admin Wise Collections' : 'Sales Center Wise Collections'}</span>
                </span>
                <span className="text-xs font-mono font-bold text-slate-200">
                  {formatTkAmount(isStrictSuperAdminUser ? adminWiseGrandCollection : scGrandCollection)}
                </span>
              </div>
              <InfographicPieDonutGraph
                title="COLLECT"
                subtitle={isStrictSuperAdminUser ? 'ADMIN WISE' : 'SALES CENTER'}
                centerMetric={
                  (isStrictSuperAdminUser ? adminWiseGrandCollection : scGrandCollection) >= 100000
                    ? `৳${((isStrictSuperAdminUser ? adminWiseGrandCollection : scGrandCollection) / 100000).toFixed(2)}L`
                    : `৳${((isStrictSuperAdminUser ? adminWiseGrandCollection : scGrandCollection) / 1000).toFixed(1)}k`
                }
                slices={isStrictSuperAdminUser ? adminWiseCollectionSlices : salesCenterCollectionSlices}
              />
            </div>
          </div>

          {isRegionalAdminOnly && (
            <div className="space-y-4">
              {/* Sales Center Wise Sales & Collection Comparative Bar Chart */}
              <div className="bg-white/[0.04] backdrop-blur-md rounded-2xl border border-white/[0.12] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-black text-white flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-emerald-400" />
                    <span>Sales Center Wise Sales vs Collection Chart ({hisSalesCenterAnalytics.length} Centers)</span>
                  </h4>
                  <div className="flex items-center gap-3 text-[11px] font-bold">
                    <span className="inline-flex items-center gap-1.5 text-emerald-300">
                      <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />
                      Sales (৳)
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-cyan-300">
                      <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400 inline-block" />
                      Collection (৳)
                    </span>
                  </div>
                </div>
                <div className="w-full h-64 sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={hisSalesCenterAnalytics.map((sc) => ({
                        name: sc.name.replace(/\s*Sales Center$/i, '').trim() || sc.name,
                        fullName: sc.name,
                        Sales: Math.round(sc.totalSales || 0),
                        Collection: Math.round(sc.totalCollection || 0)
                      }))}
                      margin={{ top: 10, right: 16, left: 8, bottom: 18 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(34,211,238,0.12)" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: '#cbd5e1', fontSize: 11, fontWeight: 700 }}
                        axisLine={{ stroke: 'rgba(34,211,238,0.25)' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) =>
                          v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`
                        }
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(34,211,238,0.08)' }}
                        contentStyle={{
                          backgroundColor: 'rgba(6, 21, 32, 0.96)',
                          border: '1px solid rgba(34, 211, 238, 0.45)',
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: 700
                        }}
                        formatter={(value: any, name: any) => [
                          `৳${Number(value || 0).toLocaleString('en-IN')}`,
                          name
                        ]}
                        labelFormatter={(_label: any, payload: any) =>
                          payload?.[0]?.payload?.fullName || _label
                        }
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 700, paddingTop: '6px' }} />
                      <Bar dataKey="Sales" name="Total Sales (৳)" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={42} />
                      <Bar dataKey="Collection" name="Total Collection (৳)" fill="#22d3ee" radius={[6, 6, 0, 0]} maxBarSize={42} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Sales Center-Wise Sales & Collection Target System (Only His Assigned Centers) */}
              <div className="bg-white/[0.04] backdrop-blur-md rounded-2xl border border-white/[0.12] p-4 space-y-4 text-white">
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 border-b border-cyan-500/20 pb-3">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 bg-cyan-500/15 text-cyan-300 rounded-xl border border-cyan-400/35">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm sm:text-base font-black text-white flex items-center space-x-2">
                        <span>Sales Center-Wise Sales &amp; Collection</span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-200 border border-cyan-400/35">
                          My Centers Only ({salesCenterPerformanceList.length})
                        </span>
                      </h4>
                      <p className="text-xs text-slate-300/80">
                        Monthly &amp; yearly sales/collection targets and achievement strictly for your assigned sales centers.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handleOpenScTargetModal}
                      className="px-3 py-1.5 bg-[#0c2638] hover:bg-[#11344c] text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 border border-cyan-400/40 cursor-pointer transition-all"
                    >
                      <Sliders className="w-3.5 h-3.5 text-amber-400" />
                      <span>Set Center Targets</span>
                    </button>
                  </div>
                </div>

                {/* Aggregate KPI Overview Cards for Assigned Sales Centers */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-400/30 space-y-1">
                    <div className="flex items-center justify-between text-slate-300 font-bold">
                      <span>Monthly Sales ({currentMonthName})</span>
                      <span className="text-[11px] font-mono font-bold text-emerald-200 bg-emerald-500/20 px-1.5 py-0.5 rounded">
                        {scTeamTotals.salesAchPctMonthly}% Met
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between font-mono">
                      <span className="text-sm font-black text-emerald-300">{formatTkAmount(scTeamTotals.totAchievedSalesMonthly)}</span>
                      <span className="text-[11px] text-slate-400">/ {formatTkAmount(scTeamTotals.totTargetSalesMonthly)}</span>
                    </div>
                  </div>
                  <div className="p-3 bg-cyan-500/10 rounded-xl border border-cyan-400/30 space-y-1">
                    <div className="flex items-center justify-between text-slate-300 font-bold">
                      <span>Monthly Collection ({currentMonthName})</span>
                      <span className="text-[11px] font-mono font-bold text-cyan-200 bg-cyan-500/20 px-1.5 py-0.5 rounded">
                        {scTeamTotals.collAchPctMonthly}% Met
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between font-mono">
                      <span className="text-sm font-black text-cyan-300">{formatTkAmount(scTeamTotals.totAchievedCollsMonthly)}</span>
                      <span className="text-[11px] text-slate-400">/ {formatTkAmount(scTeamTotals.totTargetCollsMonthly)}</span>
                    </div>
                  </div>
                  <div className="p-3 bg-purple-500/10 rounded-xl border border-purple-400/30 space-y-1">
                    <div className="flex items-center justify-between text-slate-300 font-bold">
                      <span>Yearly Sales ({selectedYear})</span>
                      <span className="text-[11px] font-mono font-bold text-purple-200 bg-purple-500/20 px-1.5 py-0.5 rounded">
                        {scTeamTotals.salesAchPctYearly}% Met
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between font-mono">
                      <span className="text-sm font-black text-purple-300">{formatTkAmount(scTeamTotals.totAchievedSalesYearly)}</span>
                      <span className="text-[11px] text-slate-400">/ {formatTkAmount(scTeamTotals.totTargetSalesYearly)}</span>
                    </div>
                  </div>
                  <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-400/30 space-y-1">
                    <div className="flex items-center justify-between text-slate-300 font-bold">
                      <span>Yearly Collection ({selectedYear})</span>
                      <span className="text-[11px] font-mono font-bold text-indigo-200 bg-indigo-500/20 px-1.5 py-0.5 rounded">
                        {scTeamTotals.collAchPctYearly}% Met
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between font-mono">
                      <span className="text-sm font-black text-indigo-300">{formatTkAmount(scTeamTotals.totAchievedCollsYearly)}</span>
                      <span className="text-[11px] text-slate-400">/ {formatTkAmount(scTeamTotals.totTargetCollsYearly)}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-cyan-500/25 bg-[#071824]/70 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#0c2638] text-cyan-200 text-[11px] font-bold uppercase tracking-wider divide-x divide-cyan-500/20 border-b border-cyan-500/30">
                          <th className="p-2.5 text-center w-10">#</th>
                          <th className="p-2.5 min-w-[180px]">Sales Center &amp; Area</th>
                          {(targetViewMode === 'all' || targetViewMode === 'monthly') && (
                            <>
                              <th className="p-2.5 min-w-[150px] bg-emerald-950/60 text-emerald-300">Monthly Target Sales ({currentMonthName})</th>
                              <th className="p-2.5 min-w-[150px] bg-teal-950/60 text-teal-300">Monthly Target Col. ({currentMonthName})</th>
                            </>
                          )}
                          {(targetViewMode === 'all' || targetViewMode === 'yearly') && (
                            <>
                              <th className="p-2.5 min-w-[150px] bg-purple-950/60 text-purple-300">Yearly Target Sales ({selectedYear})</th>
                              <th className="p-2.5 min-w-[150px] bg-indigo-950/60 text-indigo-300">Yearly Target Col. ({selectedYear})</th>
                            </>
                          )}
                          <th className="p-2.5 text-center min-w-[95px]">Col/Sales %</th>
                          <th className="p-2.5 text-center min-w-[90px]">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cyan-500/15 font-medium text-slate-200 bg-[#071824]/60">
                        {salesCenterPerformanceList.map((sc, idx) => {
                          const isStar = sc.overallScore >= 90;
                          const isOnTrack = sc.overallScore >= 70;
                          return (
                            <tr key={sc.id} className="hover:bg-cyan-500/[0.06] transition-colors divide-x divide-cyan-500/15">
                              <td className="p-2.5 text-center font-mono font-bold text-slate-400 bg-[#081b28]/60">{idx + 1}</td>
                              <td className="p-2.5">
                                <div className="flex items-center space-x-2">
                                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: sc.color }} />
                                  <div>
                                    <div className="font-bold text-white text-xs">{sc.name}</div>
                                    <div className="text-[10px] text-cyan-300/80">Area: {sc.area} • {sc.inCharge}</div>
                                  </div>
                                </div>
                              </td>
                              {(targetViewMode === 'all' || targetViewMode === 'monthly') && (
                                <>
                                  <td className="p-2.5 bg-emerald-500/[0.04]">
                                    <div className="flex items-baseline justify-between font-mono text-xs">
                                      <span className="font-bold text-emerald-300">{formatTkAmount(sc.achievedSalesMonthly)}</span>
                                      <span className="text-[10px] text-slate-400">/ {formatTkAmount(sc.targetSalesMonthly)}</span>
                                    </div>
                                    <div className="flex items-center space-x-1.5 mt-1">
                                      <div className="flex-1 bg-[#061520] rounded-full h-1.5 overflow-hidden border border-cyan-500/20">
                                        <div className={'h-full rounded-full ' + (sc.salesPctMonthly >= 100 ? 'bg-emerald-400' : sc.salesPctMonthly >= 70 ? 'bg-teal-400' : 'bg-amber-400')} style={{ width: Math.min(100, sc.salesPctMonthly) + '%' }} />
                                      </div>
                                      <span className="text-[10px] font-mono font-bold text-slate-300">{sc.salesPctMonthly}%</span>
                                    </div>
                                  </td>
                                  <td className="p-2.5 bg-teal-500/[0.04]">
                                    <div className="flex items-baseline justify-between font-mono text-xs">
                                      <span className="font-bold text-cyan-300">{formatTkAmount(sc.achievedCollectionMonthly)}</span>
                                      <span className="text-[10px] text-slate-400">/ {formatTkAmount(sc.targetCollectionMonthly)}</span>
                                    </div>
                                    <div className="flex items-center space-x-1.5 mt-1">
                                      <div className="flex-1 bg-[#061520] rounded-full h-1.5 overflow-hidden border border-cyan-500/20">
                                        <div className={'h-full rounded-full ' + (sc.collPctMonthly >= 100 ? 'bg-teal-400' : sc.collPctMonthly >= 70 ? 'bg-cyan-400' : 'bg-amber-400')} style={{ width: Math.min(100, sc.collPctMonthly) + '%' }} />
                                      </div>
                                      <span className="text-[10px] font-mono font-bold text-slate-300">{sc.collPctMonthly}%</span>
                                    </div>
                                  </td>
                                </>
                              )}
                              {(targetViewMode === 'all' || targetViewMode === 'yearly') && (
                                <>
                                  <td className="p-2.5 bg-purple-500/[0.04]">
                                    <div className="flex items-baseline justify-between font-mono text-xs">
                                      <span className="font-bold text-purple-300">{formatTkAmount(sc.achievedSalesYearly)}</span>
                                      <span className="text-[10px] text-slate-400">/ {formatTkAmount(sc.targetSalesYearly)}</span>
                                    </div>
                                    <div className="flex items-center space-x-1.5 mt-1">
                                      <div className="flex-1 bg-[#061520] rounded-full h-1.5 overflow-hidden border border-cyan-500/20">
                                        <div className={'h-full rounded-full ' + (sc.salesPctYearly >= 100 ? 'bg-purple-400' : sc.salesPctYearly >= 70 ? 'bg-indigo-400' : 'bg-amber-400')} style={{ width: Math.min(100, sc.salesPctYearly) + '%' }} />
                                      </div>
                                      <span className="text-[10px] font-mono font-bold text-slate-300">{sc.salesPctYearly}%</span>
                                    </div>
                                  </td>
                                  <td className="p-2.5 bg-indigo-500/[0.04]">
                                    <div className="flex items-baseline justify-between font-mono text-xs">
                                      <span className="font-bold text-indigo-300">{formatTkAmount(sc.achievedCollectionYearly)}</span>
                                      <span className="text-[10px] text-slate-400">/ {formatTkAmount(sc.targetCollectionYearly)}</span>
                                    </div>
                                    <div className="flex items-center space-x-1.5 mt-1">
                                      <div className="flex-1 bg-[#061520] rounded-full h-1.5 overflow-hidden border border-cyan-500/20">
                                        <div className={'h-full rounded-full ' + (sc.collPctYearly >= 100 ? 'bg-indigo-400' : sc.collPctYearly >= 70 ? 'bg-blue-400' : 'bg-amber-400')} style={{ width: Math.min(100, sc.collPctYearly) + '%' }} />
                                      </div>
                                      <span className="text-[10px] font-mono font-bold text-slate-300">{sc.collPctYearly}%</span>
                                    </div>
                                  </td>
                                </>
                              )}
                              <td className="p-2.5 text-center font-mono font-bold text-xs">
                                <span className={'px-2 py-0.5 rounded-full border ' + (sc.collectionToSalesRatioYearly >= 90 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/35' : sc.collectionToSalesRatioYearly >= 75 ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/35' : 'bg-amber-500/20 text-amber-300 border-amber-400/35')}>
                                  {sc.collectionToSalesRatioYearly}%
                                </span>
                              </td>
                              <td className="p-2.5 text-center">
                                <span className={'text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ' + (isStar ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40' : isOnTrack ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/40' : 'bg-amber-500/20 text-amber-300 border-amber-400/40')}>
                                  {isStar ? '⭐ Star' : isOnTrack ? '⚡ On Track' : '⚠️ Behind'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-[#0c2638] text-white font-bold text-xs divide-x divide-cyan-500/20 border-t-2 border-cyan-500/35">
                          <td colSpan={2} className="p-3 text-right uppercase tracking-wider text-cyan-200">
                            Total Assigned Centers:
                          </td>
                          {(targetViewMode === 'all' || targetViewMode === 'monthly') && (
                            <>
                              <td className="p-3 bg-emerald-950/60 font-mono">
                                <div className="flex items-baseline justify-between">
                                  <span className="text-emerald-300 font-extrabold">{formatTkAmount(scTeamTotals.totAchievedSalesMonthly)}</span>
                                  <span className="text-[10px] text-slate-400">/ {formatTkAmount(scTeamTotals.totTargetSalesMonthly)}</span>
                                </div>
                                <div className="text-[10px] text-emerald-400 font-mono mt-0.5">{scTeamTotals.salesAchPctMonthly}% Achieved</div>
                              </td>
                              <td className="p-3 bg-teal-950/60 font-mono">
                                <div className="flex items-baseline justify-between">
                                  <span className="text-teal-300 font-extrabold">{formatTkAmount(scTeamTotals.totAchievedCollsMonthly)}</span>
                                  <span className="text-[10px] text-slate-400">/ {formatTkAmount(scTeamTotals.totTargetCollsMonthly)}</span>
                                </div>
                                <div className="text-[10px] text-teal-400 font-mono mt-0.5">{scTeamTotals.collAchPctMonthly}% Achieved</div>
                              </td>
                            </>
                          )}
                          {(targetViewMode === 'all' || targetViewMode === 'yearly') && (
                            <>
                              <td className="p-3 bg-purple-950/60 font-mono">
                                <div className="flex items-baseline justify-between">
                                  <span className="text-purple-300 font-extrabold">{formatTkAmount(scTeamTotals.totAchievedSalesYearly)}</span>
                                  <span className="text-[10px] text-slate-400">/ {formatTkAmount(scTeamTotals.totTargetSalesYearly)}</span>
                                </div>
                                <div className="text-[10px] text-purple-400 font-mono mt-0.5">{scTeamTotals.salesAchPctYearly}% Achieved</div>
                              </td>
                              <td className="p-3 bg-indigo-950/60 font-mono">
                                <div className="flex items-baseline justify-between">
                                  <span className="text-indigo-300 font-extrabold">{formatTkAmount(scTeamTotals.totAchievedCollsYearly)}</span>
                                  <span className="text-[10px] text-slate-400">/ {formatTkAmount(scTeamTotals.totTargetCollsYearly)}</span>
                                </div>
                                <div className="text-[10px] text-indigo-400 font-mono mt-0.5">{scTeamTotals.collAchPctYearly}% Achieved</div>
                              </td>
                            </>
                          )}
                          <td colSpan={2} className="p-3 text-center font-mono text-cyan-300">
                            {salesCenterPerformanceList.length} Assigned Centers
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MONTHLY & YEARLY SALES & COLLECTION GRAPHS (ALL ROLES WITHOUT FACTORY)   */}
      {/* ========================================================================= */}
      {!isFactoryRole && (
        <div className={`grid grid-cols-1 ${isOtherNonAdminRole ? 'xl:grid-cols-12' : ''} gap-4`}>
          {/* Monthly Sales & Collection Analytical Graph (Jan - Dec for Selected Year) */}
          <div className={`${isOtherNonAdminRole ? 'xl:col-span-7' : ''} bg-[#081d2c]/55 backdrop-blur-2xl rounded-2xl border border-white/[0.14] p-4 sm:p-5 shadow-[0_14px_38px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.08)] space-y-4 text-white`}>
            {/* Header & Year Selector */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/[0.10] pb-3.5">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-cyan-500/20 text-cyan-300 rounded-xl border border-cyan-400/35">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                    Monthly Sales &amp; Collection Graph ({selectedYear})
                  </h2>
                  <p className="text-xs text-slate-300/80">
                    Month-by-month performance comparison of Sales (৳) vs Collections (৳)
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-300 flex items-center space-x-1">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Year:</span>
                </span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="bg-[#061622]/85 text-white font-bold text-xs px-3 py-1.5 rounded-xl border border-white/[0.14] focus:outline-none focus:ring-2 focus:ring-cyan-400 cursor-pointer shadow-2xs"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      Year {yr}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Selected Year Quick Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-emerald-500/10 border border-emerald-400/30 rounded-xl p-2.5">
                <div className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">Year {selectedYear} Sales</div>
                <div className="text-sm sm:text-base font-black text-emerald-300 mt-0.5 font-mono">
                  {formatTkAmount(yearTotalSales)}
                </div>
                <div className="text-[10px] text-emerald-200/70">{yearBills.length} Invoices</div>
              </div>

              <div className="bg-cyan-500/10 border border-cyan-400/30 rounded-xl p-2.5">
                <div className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider">Year {selectedYear} Collection</div>
                <div className="text-sm sm:text-base font-black text-cyan-300 mt-0.5 font-mono">
                  {formatTkAmount(yearTotalCollections)}
                </div>
                <div className="text-[10px] text-cyan-200/70">{yearCollections.length} MRs</div>
              </div>

              <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-2.5">
                <div className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">Recovery Ratio</div>
                <div className="text-sm sm:text-base font-black text-amber-300 mt-0.5 font-mono">
                  {yearCollectionRatio}%
                </div>
                <div className="text-[10px] text-amber-200/70">Collection Share</div>
              </div>

              <div className="bg-pink-500/10 border border-pink-400/30 rounded-xl p-2.5">
                <div className="text-[10px] font-bold text-pink-300 uppercase tracking-wider">Net Variance</div>
                <div className={`text-sm sm:text-base font-black mt-0.5 font-mono ${yearNetGap <= 0 ? 'text-emerald-300' : 'text-pink-300'}`}>
                  {formatTkAmount(yearNetGap)}
                </div>
                <div className="text-[10px] text-slate-300/70">
                  {yearNetGap <= 0 ? 'Surplus' : 'Balance'}
                </div>
              </div>
            </div>

            {/* Recharts Monthly Bar Chart */}
            <div className="h-72 w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthlyGraphData}
                  margin={{ top: 10, right: 12, left: 6, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(56,189,248,0.14)" vertical={false} />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickFormatter={(val) => `৳${(val / 100000).toFixed(1)}L`}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(val: any, name: string) => [
                      `৳${Number(val).toLocaleString('en-IN')}`,
                      name === 'Sales' ? 'Total Sales (৳)' : 'Total Collections (৳)'
                    ]}
                    labelFormatter={(label) => `Month: ${label} ${selectedYear}`}
                    contentStyle={{
                      backgroundColor: '#071824',
                      border: '1px solid rgba(34,211,238,0.45)',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px',
                      padding: '8px 12px'
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    wrapperStyle={{ paddingBottom: '10px', fontSize: '12px', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="Sales" fill="#10b981" radius={[5, 5, 0, 0]} name="Sales" />
                  <Bar dataKey="Collection" fill="#06b6d4" radius={[5, 5, 0, 0]} name="Collection" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Yearly Multi-Year Sales & Collection Comparison Graph */}
          <div className={`${isOtherNonAdminRole ? 'xl:col-span-5' : ''} bg-[#081d2c]/55 backdrop-blur-2xl rounded-2xl border border-pink-400/35 p-4 sm:p-5 shadow-[0_14px_38px_rgba(236,72,153,0.16),inset_0_1px_0_rgba(255,255,255,0.08)] space-y-4 text-white flex flex-col justify-between`}>
            <div className="flex items-start justify-between gap-3 border-b border-pink-500/20 pb-3.5">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-pink-500/20 text-pink-300 rounded-xl border border-pink-400/35">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                    Yearly Sales &amp; Collection Graph
                  </h2>
                  <p className="text-xs text-slate-300/80">
                    Year-over-year performance overview ({yearlyComparisonGraphData.map((y) => y.year).join(' • ')})
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-[#0c2638]/75 border border-emerald-400/25 rounded-xl p-2.5">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cumulative Sales</div>
                <div className="text-sm sm:text-base font-black text-emerald-300 font-mono mt-0.5">{formatTkAmount(totalSales)}</div>
              </div>
              <div className="bg-[#0c2638]/75 border border-cyan-400/25 rounded-xl p-2.5">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cumulative Collection</div>
                <div className="text-sm sm:text-base font-black text-cyan-300 font-mono mt-0.5">{formatTkAmount(totalCollections)}</div>
              </div>
            </div>

            <div className="h-72 w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={yearlyComparisonGraphData}
                  margin={{ top: 10, right: 12, left: 6, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(236,72,153,0.14)" vertical={false} />
                  <XAxis dataKey="year" stroke="#94a3b8" fontSize={12} tickLine={false} />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickFormatter={(val) => `৳${(val / 100000).toFixed(1)}L`}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(val: any, name: string) => [
                      `৳${Number(val).toLocaleString('en-IN')}`,
                      name === 'Sales' ? 'Yearly Sales (৳)' : 'Yearly Collections (৳)'
                    ]}
                    labelFormatter={(label) => `Financial Year: ${label}`}
                    contentStyle={{
                      backgroundColor: '#071824',
                      border: '1px solid rgba(236,72,153,0.45)',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px',
                      padding: '8px 12px'
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    wrapperStyle={{ paddingBottom: '10px', fontSize: '12px', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="Sales" fill="#ec4899" radius={[6, 6, 0, 0]} name="Sales" />
                  <Bar dataKey="Collection" fill="#14b8a6" radius={[6, 6, 0, 0]} name="Collection" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

            {/* ========================================================================= */}
      {/* TARGET SYSTEM: MARKETING PERSON WISE PERFORMANCE & AUTO-CALCULATIONS (LIST VIEW) */}
      {/* ========================================================================= */}
      {canViewTargets && (
        <div className="cyber-glass-card rounded-2xl p-4 sm:p-6 space-y-4 text-white">
        {/* Header Bar */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 border-b border-cyan-500/20 pb-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-amber-500/15 text-amber-300 rounded-xl border border-amber-400/35 shadow-2xs">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center space-x-2">
                <span>Marketing Person-Wise Sales &amp; Collection Target System</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/35 hidden sm:inline-flex">
                  Monthly &amp; Yearly List View
                </span>
              </h2>
              <p className="text-xs text-slate-300/80">
                Set yearly targets and auto-calculate monthly targets (৳ Tk/mo = Yearly / 12) with real-time sales &amp; collection performance.
              </p>
            </div>
          </div>

          {/* Right Action Bar: Filters & Set Targets */}
          <div className="flex items-center space-x-2 flex-wrap gap-y-2 w-full lg:w-auto justify-start lg:justify-end">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-[#061520] p-1 rounded-xl border border-cyan-500/25 text-xs font-bold">
              <button
                type="button"
                onClick={() => setTargetViewMode('all')}
                className={'px-2.5 py-1 rounded-lg transition-all cursor-pointer ' + (targetViewMode === 'all' ? 'bg-cyan-500 text-slate-950 font-black shadow-xs' : 'text-slate-300 hover:text-white')}
              >
                All (Monthly &amp; Yearly)
              </button>
              <button
                type="button"
                onClick={() => setTargetViewMode('monthly')}
                className={'px-2.5 py-1 rounded-lg transition-all cursor-pointer ' + (targetViewMode === 'monthly' ? 'bg-emerald-500 text-slate-950 font-black shadow-xs' : 'text-slate-300 hover:text-white')}
              >
                Monthly View
              </button>
              <button
                type="button"
                onClick={() => setTargetViewMode('yearly')}
                className={'px-2.5 py-1 rounded-lg transition-all cursor-pointer ' + (targetViewMode === 'yearly' ? 'bg-purple-500 text-white shadow-xs' : 'text-slate-300 hover:text-white')}
              >
                Yearly View
              </button>
            </div>

            {/* Year Selector */}
            <div className="flex items-center space-x-1.5 bg-[#061520] px-2.5 py-1.5 rounded-xl border border-cyan-500/30 text-xs">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
              <label className="font-bold text-slate-300">Year:</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="font-bold text-white bg-transparent focus:outline-none cursor-pointer"
              >
                {availableYears.map((yr) => (
                  <option key={yr} value={yr} className="bg-[#081b28] text-white">
                    {yr}
                  </option>
                ))}
              </select>
            </div>

            {/* Set Targets Button (Super Admin Only) */}
            {isSuperAdminUser && (
              <button
                type="button"
                onClick={handleOpenTargetModal}
                className="px-3.5 py-1.5 bg-[#0c2638] hover:bg-[#11344c] text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 border border-cyan-400/40 shadow-sm cursor-pointer transition-all shrink-0"
                title="Configure yearly sales and collection targets"
              >
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                <span>Set Yearly Targets</span>
              </button>
            )}
          </div>
        </div>

        {/* Month Selector Pills Row */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-300 font-bold text-xs shrink-0 flex items-center space-x-1 mr-1">
            <Calendar className="w-3.5 h-3.5 text-emerald-400" />
            <span>Target Month:</span>
          </span>
          <button
            type="button"
            onClick={() => setSelectedMonth('all')}
            className={'px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer shrink-0 border ' + (selectedMonth === 'all' ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-2xs font-black' : 'bg-[#081b28] text-slate-300 border-cyan-500/25 hover:bg-[#0e2a3d] hover:text-white')}
          >
            Full Year / Monthly Avg
          </button>
          {monthNames.map((mName, idx) => {
            const mIdx = idx + 1;
            const isSelected = selectedMonth === mIdx;
            const isCurrent = new Date().getMonth() + 1 === mIdx && selectedYear === new Date().getFullYear();
            return (
              <button
                key={mName}
                type="button"
                onClick={() => setSelectedMonth(mIdx)}
                className={'px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer shrink-0 border ' + (isSelected ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-2xs font-black' : isCurrent ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/50 font-extrabold hover:bg-emerald-500/25' : 'bg-[#081b28] text-slate-300 border-cyan-500/25 hover:bg-[#0e2a3d] hover:text-white')}
              >
                {mName}
                {isCurrent && <span className="ml-1 text-[10px] text-emerald-300">•</span>}
              </button>
            );
          })}
        </div>

        {/* Aggregate KPI Overview Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Monthly Sales KPI */}
          <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-400/30 space-y-1">
            <div className="flex items-center justify-between text-slate-300 font-bold">
              <span className="flex items-center space-x-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                <span>Monthly Sales ({currentMonthName})</span>
              </span>
              <span className="text-[11px] font-mono font-bold text-emerald-200 bg-emerald-500/20 border border-emerald-400/30 px-1.5 py-0.5 rounded">
                {teamTotals.salesAchPctMonthly}% Met
              </span>
            </div>
            <div className="flex items-baseline justify-between font-mono">
              <span className="text-sm sm:text-base font-black text-emerald-300">
                {formatTkAmount(teamTotals.totAchievedSalesMonthly)}
              </span>
              <span className="text-[11px] text-slate-400">
                / {formatTkAmount(teamTotals.totTargetSalesMonthly)}
              </span>
            </div>
            <div className="w-full bg-[#061520] rounded-full h-1.5 overflow-hidden border border-emerald-500/20">
              <div
                className="bg-emerald-400 h-full rounded-full transition-all"
                style={{ width: Math.min(100, teamTotals.salesAchPctMonthly) + '%' }}
              />
            </div>
          </div>

          {/* Monthly Collection KPI */}
          <div className="p-3 bg-cyan-500/10 rounded-xl border border-cyan-400/30 space-y-1">
            <div className="flex items-center justify-between text-slate-300 font-bold">
              <span className="flex items-center space-x-1">
                <Wallet className="w-3.5 h-3.5 text-cyan-400" />
                <span>Monthly Collection ({currentMonthName})</span>
              </span>
              <span className="text-[11px] font-mono font-bold text-cyan-200 bg-cyan-500/20 border border-cyan-400/30 px-1.5 py-0.5 rounded">
                {teamTotals.collAchPctMonthly}% Met
              </span>
            </div>
            <div className="flex items-baseline justify-between font-mono">
              <span className="text-sm sm:text-base font-black text-cyan-300">
                {formatTkAmount(teamTotals.totAchievedCollsMonthly)}
              </span>
              <span className="text-[11px] text-slate-400">
                / {formatTkAmount(teamTotals.totTargetCollsMonthly)}
              </span>
            </div>
            <div className="w-full bg-[#061520] rounded-full h-1.5 overflow-hidden border border-cyan-500/20">
              <div
                className="bg-cyan-400 h-full rounded-full transition-all"
                style={{ width: Math.min(100, teamTotals.collAchPctMonthly) + '%' }}
              />
            </div>
          </div>

          {/* Yearly Sales KPI */}
          <div className="p-3 bg-purple-500/10 rounded-xl border border-purple-400/30 space-y-1">
            <div className="flex items-center justify-between text-slate-300 font-bold">
              <span className="flex items-center space-x-1">
                <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
                <span>Yearly Sales ({selectedYear})</span>
              </span>
              <span className="text-[11px] font-mono font-bold text-purple-200 bg-purple-500/20 border border-purple-400/30 px-1.5 py-0.5 rounded">
                {teamTotals.salesAchPctYearly}% Met
              </span>
            </div>
            <div className="flex items-baseline justify-between font-mono">
              <span className="text-sm sm:text-base font-black text-purple-300">
                {formatTkAmount(teamTotals.totAchievedSalesYearly)}
              </span>
              <span className="text-[11px] text-slate-400">
                / {formatTkAmount(teamTotals.totTargetSalesYearly)}
              </span>
            </div>
            <div className="w-full bg-[#061520] rounded-full h-1.5 overflow-hidden border border-purple-500/20">
              <div
                className="bg-purple-400 h-full rounded-full transition-all"
                style={{ width: Math.min(100, teamTotals.salesAchPctYearly) + '%' }}
              />
            </div>
          </div>

          {/* Yearly Collection KPI */}
          <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-400/30 space-y-1">
            <div className="flex items-center justify-between text-slate-300 font-bold">
              <span className="flex items-center space-x-1">
                <Award className="w-3.5 h-3.5 text-indigo-400" />
                <span>Yearly Collection ({selectedYear})</span>
              </span>
              <span className="text-[11px] font-mono font-bold text-indigo-200 bg-indigo-500/20 border border-indigo-400/30 px-1.5 py-0.5 rounded">
                {teamTotals.collAchPctYearly}% Met
              </span>
            </div>
            <div className="flex items-baseline justify-between font-mono">
              <span className="text-sm sm:text-base font-black text-indigo-300">
                {formatTkAmount(teamTotals.totAchievedCollsYearly)}
              </span>
              <span className="text-[11px] text-slate-400">
                / {formatTkAmount(teamTotals.totTargetCollsYearly)}
              </span>
            </div>
            <div className="w-full bg-[#061520] rounded-full h-1.5 overflow-hidden border border-indigo-500/20">
              <div
                className="bg-indigo-400 h-full rounded-full transition-all"
                style={{ width: Math.min(100, teamTotals.collAchPctYearly) + '%' }}
              />
            </div>
          </div>
        </div>

        {/* LIST VIEW TABLE: MARKETING PERSON-WISE PERFORMANCE */}
        <div className="rounded-xl border border-cyan-500/25 bg-[#071824]/70 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#0c2638] text-cyan-200 text-[11px] font-bold uppercase tracking-wider divide-x divide-cyan-500/20 border-b border-cyan-500/30">
                  <th className="p-2.5 sm:p-3 text-center w-10">#</th>
                  <th className="p-2.5 sm:p-3 min-w-[160px]">Marketing Person</th>
                  
                  {(targetViewMode === 'all' || targetViewMode === 'monthly') && (
                    <>
                      <th className="p-2.5 sm:p-3 min-w-[150px] bg-emerald-950/60 text-emerald-300">
                        Monthly Target Sales ({currentMonthName})
                      </th>
                      <th className="p-2.5 sm:p-3 min-w-[150px] bg-teal-950/60 text-teal-300">
                        Monthly Target Col. ({currentMonthName})
                      </th>
                    </>
                  )}

                  {(targetViewMode === 'all' || targetViewMode === 'yearly') && (
                    <>
                      <th className="p-2.5 sm:p-3 min-w-[150px] bg-purple-950/60 text-purple-300">
                        Yearly Target Sales ({selectedYear})
                      </th>
                      <th className="p-2.5 sm:p-3 min-w-[150px] bg-indigo-950/60 text-indigo-300">
                        Yearly Target Col. ({selectedYear})
                      </th>
                    </>
                  )}

                  <th className="p-2.5 sm:p-3 text-center min-w-[100px]">Col/Sales %</th>
                  <th className="p-2.5 sm:p-3 text-center min-w-[90px]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/15 font-medium text-slate-200 bg-[#071824]/60">
                {marketingPerformanceList.map((item, idx) => {
                  const sp = item.salesperson;
                  const isStar = item.overallScore >= 90;
                  const isOnTrack = item.overallScore >= 70;

                  return (
                    <tr key={sp.code ? `${sp.code}-${idx}` : `perf-${idx}`} className="hover:bg-cyan-500/[0.06] transition-colors divide-x divide-cyan-500/15">
                      {/* Serial Number */}
                      <td className="p-2.5 text-center font-mono font-bold text-slate-400 bg-[#081b28]/60">
                        {idx + 1}
                      </td>

                      {/* Marketing Person Info */}
                      <td className="p-2.5">
                        <div className="flex items-center space-x-2">
                          <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-400/30 font-mono font-bold text-[10px]">
                            #{sp.code}
                          </span>
                          <div>
                            <div className="font-bold text-white text-xs">{sp.name}</div>
                            <div className="text-[10px] text-slate-400">
                              {sp.role || sp.areaGroup || 'Marketing Officer'} • {item.assignedPartiesCount} Parties
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Monthly Target Sales */}
                      {(targetViewMode === 'all' || targetViewMode === 'monthly') && (
                        <td className="p-2.5 bg-emerald-500/[0.04]">
                          <div className="flex items-baseline justify-between font-mono text-xs">
                            <span className="font-bold text-emerald-300">
                              {formatTkAmount(item.achievedSalesMonthly)}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              / {formatTkAmount(item.targetSalesMonthly)}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1.5 mt-1">
                            <div className="flex-1 bg-[#061520] rounded-full h-1.5 overflow-hidden border border-cyan-500/20">
                              <div
                                className={'h-full rounded-full ' + (item.salesPctMonthly >= 100 ? 'bg-emerald-400' : item.salesPctMonthly >= 70 ? 'bg-teal-400' : 'bg-amber-400')}
                                style={{ width: Math.min(100, item.salesPctMonthly) + '%' }}
                              />
                            </div>
                            <span className={'text-[10px] font-mono font-bold ' + (item.salesPctMonthly >= 100 ? 'text-emerald-300' : 'text-slate-300')}>
                              {item.salesPctMonthly}%
                            </span>
                          </div>
                        </td>
                      )}

                      {/* Monthly Target Collection */}
                      {(targetViewMode === 'all' || targetViewMode === 'monthly') && (
                        <td className="p-2.5 bg-teal-500/[0.04]">
                          <div className="flex items-baseline justify-between font-mono text-xs">
                            <span className="font-bold text-cyan-300">
                              {formatTkAmount(item.achievedCollectionMonthly)}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              / {formatTkAmount(item.targetCollectionMonthly)}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1.5 mt-1">
                            <div className="flex-1 bg-[#061520] rounded-full h-1.5 overflow-hidden border border-cyan-500/20">
                              <div
                                className={'h-full rounded-full ' + (item.collPctMonthly >= 100 ? 'bg-teal-400' : item.collPctMonthly >= 70 ? 'bg-cyan-400' : 'bg-amber-400')}
                                style={{ width: Math.min(100, item.collPctMonthly) + '%' }}
                              />
                            </div>
                            <span className={'text-[10px] font-mono font-bold ' + (item.collPctMonthly >= 100 ? 'text-teal-300' : 'text-slate-300')}>
                              {item.collPctMonthly}%
                            </span>
                          </div>
                        </td>
                      )}

                      {/* Yearly Target Sales */}
                      {(targetViewMode === 'all' || targetViewMode === 'yearly') && (
                        <td className="p-2.5 bg-purple-500/[0.04]">
                          <div className="flex items-baseline justify-between font-mono text-xs">
                            <span className="font-bold text-purple-300">
                              {formatTkAmount(item.achievedSalesYearly)}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              / {formatTkAmount(item.targetSalesYearly)}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1.5 mt-1">
                            <div className="flex-1 bg-[#061520] rounded-full h-1.5 overflow-hidden border border-cyan-500/20">
                              <div
                                className={'h-full rounded-full ' + (item.salesPctYearly >= 100 ? 'bg-purple-400' : item.salesPctYearly >= 70 ? 'bg-indigo-400' : 'bg-amber-400')}
                                style={{ width: Math.min(100, item.salesPctYearly) + '%' }}
                              />
                            </div>
                            <span className={'text-[10px] font-mono font-bold ' + (item.salesPctYearly >= 100 ? 'text-purple-300' : 'text-slate-300')}>
                              {item.salesPctYearly}%
                            </span>
                          </div>
                        </td>
                      )}

                      {/* Yearly Target Collection */}
                      {(targetViewMode === 'all' || targetViewMode === 'yearly') && (
                        <td className="p-2.5 bg-indigo-500/[0.04]">
                          <div className="flex items-baseline justify-between font-mono text-xs">
                            <span className="font-bold text-indigo-300">
                              {formatTkAmount(item.achievedCollectionYearly)}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              / {formatTkAmount(item.targetCollectionYearly)}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1.5 mt-1">
                            <div className="flex-1 bg-[#061520] rounded-full h-1.5 overflow-hidden border border-cyan-500/20">
                              <div
                                className={'h-full rounded-full ' + (item.collPctYearly >= 100 ? 'bg-indigo-400' : item.collPctYearly >= 70 ? 'bg-blue-400' : 'bg-amber-400')}
                                style={{ width: Math.min(100, item.collPctYearly) + '%' }}
                              />
                            </div>
                            <span className={'text-[10px] font-mono font-bold ' + (item.collPctYearly >= 100 ? 'text-indigo-300' : 'text-slate-300')}>
                              {item.collPctYearly}%
                            </span>
                          </div>
                        </td>
                      )}

                      {/* Collection vs Sales Ratio */}
                      <td className="p-2.5 text-center font-mono font-bold text-xs">
                        <span className={'px-2 py-0.5 rounded-full border ' + (item.collectionToSalesRatioYearly >= 90 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/35' : item.collectionToSalesRatioYearly >= 75 ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/35' : 'bg-amber-500/20 text-amber-300 border-amber-400/35')}>
                          {item.collectionToSalesRatioYearly}%
                        </span>
                      </td>

                      {/* Performance Status */}
                      <td className="p-2.5 text-center">
                        <span
                          className={'text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ' + (isStar ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40' : isOnTrack ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/40' : 'bg-amber-500/20 text-amber-300 border-amber-400/40')}
                        >
                          {isStar ? '⭐ Star' : isOnTrack ? '⚡ On Track' : '⚠️ Behind'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Grand Total Summary Row */}
              <tfoot>
                <tr className="bg-[#0c2638] text-white font-bold text-xs divide-x divide-cyan-500/20 border-t-2 border-cyan-500/35">
                  <td colSpan={2} className="p-3 text-right uppercase tracking-wider text-cyan-200">
                    Total Target &amp; Performance:
                  </td>

                  {(targetViewMode === 'all' || targetViewMode === 'monthly') && (
                    <>
                      <td className="p-3 bg-emerald-950/60 font-mono">
                        <div className="flex items-baseline justify-between">
                          <span className="text-emerald-300 font-extrabold">
                            {formatTkAmount(teamTotals.totAchievedSalesMonthly)}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            / {formatTkAmount(teamTotals.totTargetSalesMonthly)}
                          </span>
                        </div>
                        <div className="text-[10px] text-emerald-400 font-mono mt-0.5">
                          {teamTotals.salesAchPctMonthly}% Achieved
                        </div>
                      </td>
                      <td className="p-3 bg-teal-950/60 font-mono">
                        <div className="flex items-baseline justify-between">
                          <span className="text-teal-300 font-extrabold">
                            {formatTkAmount(teamTotals.totAchievedCollsMonthly)}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            / {formatTkAmount(teamTotals.totTargetCollsMonthly)}
                          </span>
                        </div>
                        <div className="text-[10px] text-teal-400 font-mono mt-0.5">
                          {teamTotals.collAchPctMonthly}% Achieved
                        </div>
                      </td>
                    </>
                  )}

                  {(targetViewMode === 'all' || targetViewMode === 'yearly') && (
                    <>
                      <td className="p-3 bg-purple-950/60 font-mono">
                        <div className="flex items-baseline justify-between">
                          <span className="text-purple-300 font-extrabold">
                            {formatTkAmount(teamTotals.totAchievedSalesYearly)}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            / {formatTkAmount(teamTotals.totTargetSalesYearly)}
                          </span>
                        </div>
                        <div className="text-[10px] text-purple-400 font-mono mt-0.5">
                          {teamTotals.salesAchPctYearly}% Achieved
                        </div>
                      </td>
                      <td className="p-3 bg-indigo-950/60 font-mono">
                        <div className="flex items-baseline justify-between">
                          <span className="text-indigo-300 font-extrabold">
                            {formatTkAmount(teamTotals.totAchievedCollsYearly)}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            / {formatTkAmount(teamTotals.totTargetCollsYearly)}
                          </span>
                        </div>
                        <div className="text-[10px] text-indigo-400 font-mono mt-0.5">
                          {teamTotals.collAchPctYearly}% Achieved
                        </div>
                      </td>
                    </>
                  )}

                  <td colSpan={2} className="p-3 text-center font-mono text-amber-300">
                    {marketingPerformanceList.length} Active Officers
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
      )}

      {/* Target Setting Modal - With Live Auto-Calculated Monthly Target Breakdown */}
      {isTargetModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl border border-cyan-400/35 rounded-2xl max-w-3xl w-full p-5 sm:p-6 shadow-[0_24px_64px_rgba(0,0,0,0.65)] space-y-4 max-h-[90vh] overflow-y-auto text-white">
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
              <div className="flex items-center space-x-2.5">
                <Sliders className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-base font-black text-white">
                    Set Marketing Targets (Year {selectedYear})
                  </h3>
                  <p className="text-xs text-slate-300">
                    Set yearly target for each marketing person. The system automatically calculates monthly sales and collection targets (Yearly / 12).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTargetModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {targetSaveSuccess && (
              <div className="p-3 bg-emerald-500/15 border border-emerald-400/40 rounded-xl text-emerald-300 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Yearly and monthly marketing targets saved successfully!</span>
              </div>
            )}

            {/* Quick Bulk Presets Bar */}
            <div className="bg-[#0b2334]/80 p-3 rounded-xl border border-cyan-500/25 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
              <span className="font-bold text-amber-300 flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Quick Apply Standard Target To All:</span>
              </span>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <button
                  type="button"
                  onClick={() => {
                    const copy: CustomYearlyTargetMap = {};
                    marketingPersons.forEach((sp) => {
                      copy[sp.code] = { targetSales: 24000000, targetCollection: 20000000 };
                    });
                    setTargetEditForm(copy);
                  }}
                  className="px-2.5 py-1 bg-[#081b28] hover:bg-[#0e2a3d] text-white rounded-lg font-mono text-[11px] border border-cyan-500/30 cursor-pointer"
                >
                  ৳2.4 Cr Sales / ৳2.0 Cr Col
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const copy: CustomYearlyTargetMap = {};
                    marketingPersons.forEach((sp) => {
                      copy[sp.code] = { targetSales: 30000000, targetCollection: 25000000 };
                    });
                    setTargetEditForm(copy);
                  }}
                  className="px-2.5 py-1 bg-[#081b28] hover:bg-[#0e2a3d] text-white rounded-lg font-mono text-[11px] border border-cyan-500/30 cursor-pointer"
                >
                  ৳3.0 Cr Sales / ৳2.5 Cr Col
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const copy: CustomYearlyTargetMap = {};
                    marketingPersons.forEach((sp) => {
                      copy[sp.code] = { targetSales: 12000000, targetCollection: 10000000 };
                    });
                    setTargetEditForm(copy);
                  }}
                  className="px-2.5 py-1 bg-[#081b28] hover:bg-[#0e2a3d] text-white rounded-lg font-mono text-[11px] border border-cyan-500/30 cursor-pointer"
                >
                  ৳1.2 Cr Sales / ৳1.0 Cr Col
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {marketingPersons.map((sp, idx) => {
                const formVal = targetEditForm[sp.code] || {
                  targetSales: 24000000,
                  targetCollection: 20000000
                };
                const calculatedMonthSales = Math.round((formVal.targetSales || 0) / 12);
                const calculatedMonthColls = Math.round((formVal.targetCollection || 0) / 12);

                return (
                  <div
                    key={sp.code ? `${sp.code}-${idx}` : `target-${idx}`}
                    className="p-4 cyber-glass-subcard rounded-xl space-y-3"
                  >
                    <div className="flex items-center justify-between font-bold text-slate-100 text-xs border-b border-cyan-500/20 pb-2">
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-400/35 rounded font-mono">
                          #{sp.code}
                        </span>
                        <span className="text-sm font-black text-white">{sp.name}</span>
                        <span className="text-slate-400 font-normal">({sp.role || sp.areaGroup || 'Marketing'})</span>
                      </div>
                      <span className="text-[11px] text-amber-300 font-mono">Marketing Person</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Sales Target: Monthly <-> Yearly Two-Way */}
                      <div className="space-y-2 bg-[#071824]/80 p-3 rounded-xl border border-cyan-500/25">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-cyan-300 flex items-center space-x-1">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span>Sales Target (Sales ৳)</span>
                          </label>
                          <span className="text-[10px] text-cyan-200 font-mono font-bold bg-cyan-500/15 px-2 py-0.5 rounded border border-cyan-400/30">
                            Auto-sync Monthly ↔ Yearly
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <span className="block text-[10px] font-semibold text-slate-300 mb-0.5">Monthly (৳ / Mo)</span>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-cyan-400 font-bold text-xs">৳</span>
                              <input
                                type="number"
                                value={formVal.targetSales ? Math.round(formVal.targetSales / 12) : ''}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 0;
                                  setTargetEditForm((prev) => ({
                                    ...prev,
                                    [sp.code]: { ...formVal, targetSales: val * 12 }
                                  }));
                                }}
                                className="w-full pl-6 pr-2 py-1.5 bg-[#061520] border border-cyan-500/35 rounded-lg text-emerald-300 font-mono text-xs font-bold focus:border-cyan-400 focus:outline-none"
                                placeholder="Monthly ৳"
                              />
                            </div>
                          </div>
                          <div>
                            <span className="block text-[10px] font-semibold text-slate-300 mb-0.5">Yearly (৳ / Yr)</span>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">৳</span>
                              <input
                                type="number"
                                value={formVal.targetSales || ''}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 0;
                                  setTargetEditForm((prev) => ({
                                    ...prev,
                                    [sp.code]: { ...formVal, targetSales: val }
                                  }));
                                }}
                                className="w-full pl-6 pr-2 py-1.5 bg-[#061520] border border-cyan-500/30 rounded-lg text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                                placeholder="Yearly ৳"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="p-2 bg-[#0b2334]/75 rounded-lg border border-cyan-500/20 text-[11px] font-mono space-y-0.5">
                          <div className="text-slate-300">
                            Yearly: <span className="text-cyan-300 font-bold">{formatTkAmount(formVal.targetSales)}</span>
                          </div>
                          <div className="text-amber-300 font-bold flex items-center space-x-1">
                            <Calculator className="w-3 h-3 text-amber-400" />
                            <span>Calculated Monthly: ৳{calculatedMonthSales.toLocaleString('en-IN')} / mo</span>
                          </div>
                        </div>
                      </div>

                      {/* Collection Target: Monthly <-> Yearly Two-Way */}
                      <div className="space-y-2 bg-[#071824]/80 p-3 rounded-xl border border-emerald-500/25">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-emerald-300 flex items-center space-x-1">
                            <DollarSign className="w-3.5 h-3.5" />
                            <span>Collection Target (Collection ৳)</span>
                          </label>
                          <span className="text-[10px] text-emerald-200 font-mono font-bold bg-emerald-500/15 px-2 py-0.5 rounded border border-emerald-400/30">
                            Auto-sync Monthly ↔ Yearly
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <span className="block text-[10px] font-semibold text-slate-300 mb-0.5">Monthly (৳ / Mo)</span>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-emerald-400 font-bold text-xs">৳</span>
                              <input
                                type="number"
                                value={formVal.targetCollection ? Math.round(formVal.targetCollection / 12) : ''}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 0;
                                  setTargetEditForm((prev) => ({
                                    ...prev,
                                    [sp.code]: { ...formVal, targetCollection: val * 12 }
                                  }));
                                }}
                                className="w-full pl-6 pr-2 py-1.5 bg-[#061520] border border-emerald-500/35 rounded-lg text-cyan-300 font-mono text-xs font-bold focus:border-emerald-400 focus:outline-none"
                                placeholder="Monthly ৳"
                              />
                            </div>
                          </div>
                          <div>
                            <span className="block text-[10px] font-semibold text-slate-300 mb-0.5">Yearly (৳ / Yr)</span>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">৳</span>
                              <input
                                type="number"
                                value={formVal.targetCollection || ''}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 0;
                                  setTargetEditForm((prev) => ({
                                    ...prev,
                                    [sp.code]: { ...formVal, targetCollection: val }
                                  }));
                                }}
                                className="w-full pl-6 pr-2 py-1.5 bg-[#061520] border border-cyan-500/30 rounded-lg text-white font-mono text-xs focus:border-emerald-400 focus:outline-none"
                                placeholder="Yearly ৳"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="p-2 bg-[#0b2334]/75 rounded-lg border border-emerald-500/20 text-[11px] font-mono space-y-0.5">
                          <div className="text-slate-300">
                            Yearly: <span className="text-emerald-300 font-bold">{formatTkAmount(formVal.targetCollection)}</span>
                          </div>
                          <div className="text-amber-300 font-bold flex items-center space-x-1">
                            <Calculator className="w-3 h-3 text-amber-400" />
                            <span>Calculated Monthly: ৳{calculatedMonthColls.toLocaleString('en-IN')} / mo</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setIsTargetModalOpen(false)}
                className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTargets}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black flex items-center space-x-1.5 shadow-lg shadow-emerald-500/25 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Save Targets</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sales Center Target Setting Modal */}
      {isScTargetModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl border border-cyan-400/35 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-[0_24px_64px_rgba(0,0,0,0.65)] space-y-4 max-h-[85vh] overflow-y-auto text-white">
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
              <div className="flex items-center space-x-2.5">
                <Building2 className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-base font-black text-white">Set Sales Center Targets (Year {selectedYear})</h3>
                  <p className="text-xs text-slate-300">Configure yearly targets per assigned sales center. Monthly = Yearly / 12.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsScTargetModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {scTargetSaveSuccess && (
              <div className="p-3 bg-emerald-500/15 border border-emerald-400/40 rounded-xl text-emerald-300 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Sales Center yearly and monthly targets saved!</span>
              </div>
            )}
            <div className="space-y-3">
              {salesCenterPerformanceList.map((sc) => {
                const formVal = scTargetEditForm[sc.id] || { targetSales: 24000000, targetCollection: 20000000 };
                return (
                  <div key={sc.id} className="p-4 cyber-glass-subcard rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold border-b border-cyan-500/20 pb-2">
                      <span className="text-white">{sc.name}</span>
                      <span className="text-cyan-300">Area: {sc.area}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="block text-[10px] text-slate-300 mb-1">Yearly Target Sales (৳)</span>
                        <input
                          type="number"
                          value={formVal.targetSales || ''}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setScTargetEditForm((prev) => ({
                              ...prev,
                              [sc.id]: { ...formVal, targetSales: val }
                            }));
                          }}
                          className="w-full px-2.5 py-1.5 bg-[#061520] border border-cyan-500/35 rounded-lg text-emerald-300 font-mono font-bold focus:outline-none"
                        />
                        <div className="text-[10px] text-slate-400 mt-1 font-mono">
                          Monthly: ৳{Math.round((formVal.targetSales || 0) / 12).toLocaleString('en-IN')}
                        </div>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-300 mb-1">Yearly Target Collection (৳)</span>
                        <input
                          type="number"
                          value={formVal.targetCollection || ''}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setScTargetEditForm((prev) => ({
                              ...prev,
                              [sc.id]: { ...formVal, targetCollection: val }
                            }));
                          }}
                          className="w-full px-2.5 py-1.5 bg-[#061520] border border-emerald-500/35 rounded-lg text-cyan-300 font-mono font-bold focus:outline-none"
                        />
                        <div className="text-[10px] text-slate-400 mt-1 font-mono">
                          Monthly: ৳{Math.round((formVal.targetCollection || 0) / 12).toLocaleString('en-IN')}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setIsScTargetModalOpen(false)}
                className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveScTargets}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black flex items-center space-x-1.5 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Save Targets</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* AI SALES & DEMAND FORECASTING MODAL */}
      {/* ========================================================================= */}
      {isAIForecastModalOpen && (
        <AISalesForecastModal
          isOpen={isAIForecastModalOpen}
          onClose={() => setIsAIForecastModalOpen(false)}
          currentUser={currentUser}
          storedBills={storedBills}
          collections={collections}
          bankDeposits={bankDeposits}
          items={items}
          parties={parties}
          salespersons={salespersons}
          company={company}
          requisitions={requisitions}
          onNavigateToRequisitions={() => {
            setIsAIForecastModalOpen(false);
            onNavigate('requisition');
          }}
        />
      )}
    </div>
  );
};
