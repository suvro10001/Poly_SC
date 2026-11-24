import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Item,
  Party,
  Salesperson,
  CompanyDetails,
  StoredBill,
  BillHeader,
  BillLineItem,
  Requisition,
  RequisitionLineItem,
  RequisitionStage,
  CollectionMR,
  StockReturnChallan,
  AuthUser,
  BranchLocation,
  FactoryImportChallan,
  DeliveryChallan,
  ChallanLineItem
} from '../types';
import { defaultRequisitions, defaultItems } from '../data/defaultData';
import { PolyCablesLogo, PolyCablesEmblem } from './PolyCablesLogo';
import {
  FileText,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Truck,
  ArrowLeft,
  Printer,
  Trash2,
  Save,
  Share2,
  Copy,
  ChevronDown,
  Building2,
  Sparkles,
  Layers,
  ArrowRight,
  Sliders,
  Check,
  Calendar,
  User,
  ShoppingBag,
  ExternalLink,
  FileSpreadsheet,
  Mail,
  Download,
  Send,
  Edit,
  MessageCircle,
  MessageSquare,
  Lock,
  RotateCcw,
  Settings,
  History,
  X,
  Filter,
  ShieldAlert,
  ShieldCheck,
  FileCheck,
  Package,
  AlertTriangle
} from 'lucide-react';
import { formatDateDDMMYY, getTodayISO, getTodayDDMMYY, parseDateToISO } from '../utils/dateUtils';
import { convertToTakaWords } from '../utils/numberToWords';
import { matchesFlexibleSearch, sortItemsCategorySerialWise, groupItemsByCategoryOrder } from '../utils/searchHelper';
import {
  generateRequisitionExcelBase64,
  downloadRequisitionExcel,
  isReCableItem,
  cleanColorBreakdownFromRemarks,
  RequisitionExcelData
} from '../utils/requisitionExcelHelper';
import { isColorApplicableCable, getCategoryBadgeStyle, getAllCategories } from '../utils/categoryHelper';
import {
  cleanBranchName,
  getUserLoginFilters,
  isFactoryUser,
  canApproveSalesCenterRequisition,
  canApproveInChargeRequisition,
  isStrictSuperAdmin,
  isAccountsAdmin,
  isAnyAdmin,
  filterBranchesForUser,
  filterSalespersonsByBranch,
  partyMatchesBranch
} from '../utils/branchAccess';
import { jsPDF } from 'jspdf';
import { EmailSenderModal } from './EmailSenderModal';
import { WhatsAppSenderModal } from './WhatsAppSenderModal';
import { ColorQuantityModal, ColorBreakdownData } from './ColorQuantityModal';
import { StandardPeriodFilterBar } from './StandardPeriodFilterBar';
import { DateInputWithPicker } from './DateInputWithPicker';
import { StandardPeriodPreset, isDateInPeriodRange } from '../utils/standardPeriodHelper';
import { identifyColors, buildPlusFormula } from '../utils/colorParser';
import { SalesCenterSearchFilter } from './SalesCenterSearchFilter';
import { checkCanTakeEntry } from '../utils/cloudConnection';
import { recordDeletedEntityId } from '../utils/deletedTracker';
import { moveToTrash } from '../utils/trashHelper';
import { getItemDisplayName } from '../utils/stockHelper';

interface RequisitionPageProps {
  requisitions?: Requisition[];
  setRequisitions?: React.Dispatch<React.SetStateAction<Requisition[]>>;
  items: Item[];
  parties: Party[];
  salespersons: Salesperson[];
  company: CompanyDetails;
  storedBills: StoredBill[];
  setStoredBills: React.Dispatch<React.SetStateAction<StoredBill[]>>;
  deliveryChallans?: DeliveryChallan[];
  setDeliveryChallans?: React.Dispatch<React.SetStateAction<DeliveryChallan[]>>;
  collections?: CollectionMR[];
  stockReturns?: StockReturnChallan[];
  onOpenBillInEditor?: (bHeader: BillHeader, bLines: BillLineItem[]) => void;
  onOpenForecast?: () => void;
  onBack?: () => void;
  onClose?: () => void;
  currentUser?: AuthUser | null;
  initialSubTab?: 'entry_slip' | 'list' | 'approved_history' | 'delivered';
  subTab?: 'entry_slip' | 'list' | 'approved_history' | 'delivered';
  setSubTab?: (tab: 'entry_slip' | 'list' | 'approved_history' | 'delivered') => void;
  branches?: BranchLocation[];
  factoryImports?: FactoryImportChallan[];
  onSyncCloud?: (patch: Record<string, any>, immediate?: boolean) => void;
  isApprovalPage?: boolean;
}

// Normalize marketing person names across system (e.g. Subrata / subroto -> Subrata Sutradhar)
export function normalizeMarketingPersonName(name: string = ''): string {
  if (!name) return '';
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower.includes('subrata') ||
    lower.includes('subroto')
  ) {
    return 'Subrata Sutradhar';
  }
  return trimmed;
}

export function extractBillNoFromReqNo(rawReqNo?: string, reqSequence?: number | string): string {
  if (reqSequence !== undefined && reqSequence !== null && reqSequence !== '') {
    const num = Number(reqSequence);
    if (!isNaN(num) && num > 0) return String(num);
  }
  if (!rawReqNo) return '67';
  const clean = rawReqNo.replace(/^(req\s*(#|no\.?|no)?\s*)+/i, '').replace(/^#+\s*/, '').trim();
  const beforeDash = clean.split(/[-–—(/]/)[0]?.trim() || clean;
  const digits = beforeDash.match(/\d+/);
  if (digits) {
    const num = parseInt(digits[0], 10);
    return isNaN(num) ? digits[0] : String(num);
  }
  return beforeDash || '67';
}

/**
 * Generate sequential bill numbers for factory deliveries:
 * 1st delivery (or all items at once): "20"
 * 2nd delivery: "20-A"
 * 3rd delivery: "20-B", etc.
 */
export function getDeliveryBillNo(req: Requisition, deliveryIndex: number): string {
  const baseNo = extractBillNoFromReqNo(req.reqNo, req.seqNumber);
  if (!deliveryIndex || deliveryIndex <= 0) {
    return baseNo;
  }
  const letter = String.fromCharCode(65 + ((deliveryIndex - 1) % 26));
  return `${baseNo}-${letter}`;
}

export interface ReqColorBadge {
  key: 'red' | 'black' | 'yellow' | 'green' | 'blue' | 'others';
  label: string;
  qty: number;
  lightClass: string;
  darkClass: string;
}

export function extractReqLineColors(line: any): {
  red: number;
  black: number;
  yellow: number;
  green: number;
  blue: number;
  others: number;
  badges: ReqColorBadge[];
  textSummary: string;
  customRemarks: string;
} {
  let red = Number(line?.red ?? line?.colors?.red ?? 0) || 0;
  let black = Number(line?.black ?? line?.colors?.black ?? line?.colors?.blk ?? 0) || 0;
  let yellow = Number(line?.yellow ?? line?.colors?.yellow ?? line?.colors?.yel ?? 0) || 0;
  let green = Number(line?.green ?? line?.colors?.green ?? line?.colors?.grn ?? 0) || 0;
  let blue = Number(line?.blue ?? line?.colors?.blue ?? line?.colors?.blu ?? 0) || 0;
  let others = Number(line?.others ?? line?.colors?.others ?? 0) || 0;

  const hasExplicitFieldColors = red > 0 || black > 0 || yellow > 0 || green > 0 || blue > 0 || others > 0;
  const remainingRemarks: string[] = [];

  if (line?.remarks && typeof line.remarks === 'string') {
    let raw = line.remarks.trim();
    if (raw && raw.toLowerCase() !== 'remarks' && raw !== '—' && raw !== '-') {
      // Unwrap outer parentheses e.g. "(R:10, B:5)" or "R:10, B:5 (Urgent)"
      let parenExtra = '';
      const dupMatch = raw.match(/^(.*?)\s*\((.*?)\)$/);
      if (dupMatch && dupMatch[1].trim()) {
        const p1 = dupMatch[1].trim();
        const p2 = dupMatch[2].trim();
        const n1 = p1.replace(/[\s,;:_+-]+/g, '').toLowerCase();
        const n2 = p2.replace(/[\s,;:_+-]+/g, '').toLowerCase();
        raw = p1;
        if (n2 && n1 !== n2 && !n1.includes(n2) && !n2.includes(n1)) {
          parenExtra = p2;
        }
      } else if (raw.startsWith('(') && raw.endsWith(')')) {
        raw = raw.slice(1, -1).trim();
      }

      const tokens = raw
        .split(/[,+;]+/)
        .map((t) => t.trim())
        .filter(Boolean);

      for (const tok of tokens) {
        // Check BL / Blue BEFORE B / Black!
        const blM = tok.match(/^(?:bl|blu|blue)\s*[:=-]?\s*(\d+)$/i) || tok.match(/^(\d+)\s*[:=-]?\s*(?:bl|blu|blue)$/i);
        const rM = tok.match(/^(?:r|red)\s*[:=-]?\s*(\d+)$/i) || tok.match(/^(\d+)\s*[:=-]?\s*(?:r|red)$/i);
        const bM = tok.match(/^(?:b|blk|black)\s*[:=-]?\s*(\d+)$/i) || tok.match(/^(\d+)\s*[:=-]?\s*(?:b|blk|black)$/i);
        const yM = tok.match(/^(?:y|yel|yellow)\s*[:=-]?\s*(\d+)$/i) || tok.match(/^(\d+)\s*[:=-]?\s*(?:y|yel|yellow)$/i);
        const gM = tok.match(/^(?:g|grn|green)\s*[:=-]?\s*(\d+)$/i) || tok.match(/^(\d+)\s*[:=-]?\s*(?:g|grn|green)$/i);
        const oM = tok.match(/^(?:oth|other|others)\s*[:=-]?\s*(\d+)$/i) || tok.match(/^(\d+)\s*[:=-]?\s*(?:oth|other|others)$/i);

        if (blM) {
          if (!hasExplicitFieldColors) blue += parseInt(blM[1], 10) || 0;
        } else if (rM) {
          if (!hasExplicitFieldColors) red += parseInt(rM[1], 10) || 0;
        } else if (bM) {
          if (!hasExplicitFieldColors) black += parseInt(bM[1], 10) || 0;
        } else if (yM) {
          if (!hasExplicitFieldColors) yellow += parseInt(yM[1], 10) || 0;
        } else if (gM) {
          if (!hasExplicitFieldColors) green += parseInt(gM[1], 10) || 0;
        } else if (oM) {
          if (!hasExplicitFieldColors) others += parseInt(oM[1], 10) || 0;
        } else {
          remainingRemarks.push(tok);
        }
      }

      if (parenExtra) {
        remainingRemarks.push(parenExtra);
      }
    }
  }

  const badges: ReqColorBadge[] = [];
  if (red > 0) {
    badges.push({
      key: 'red',
      label: `R:${red}`,
      qty: red,
      lightClass: 'bg-rose-100 text-rose-800 border-rose-300',
      darkClass: 'bg-rose-950/90 text-rose-300 border-rose-500/50'
    });
  }
  if (black > 0) {
    badges.push({
      key: 'black',
      label: `B:${black}`,
      qty: black,
      lightClass: 'bg-slate-800 text-white border-slate-700',
      darkClass: 'bg-slate-800 text-slate-100 border-slate-500'
    });
  }
  if (yellow > 0) {
    badges.push({
      key: 'yellow',
      label: `Y:${yellow}`,
      qty: yellow,
      lightClass: 'bg-amber-100 text-amber-900 border-amber-300',
      darkClass: 'bg-amber-950/90 text-amber-300 border-amber-500/50'
    });
  }
  if (green > 0) {
    badges.push({
      key: 'green',
      label: `G:${green}`,
      qty: green,
      lightClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      darkClass: 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50'
    });
  }
  if (blue > 0) {
    badges.push({
      key: 'blue',
      label: `BL:${blue}`,
      qty: blue,
      lightClass: 'bg-blue-100 text-blue-800 border-blue-300',
      darkClass: 'bg-blue-950/90 text-blue-300 border-blue-500/50'
    });
  }
  if (others > 0) {
    badges.push({
      key: 'others',
      label: `Oth:${others}`,
      qty: others,
      lightClass: 'bg-purple-100 text-purple-800 border-purple-300',
      darkClass: 'bg-purple-950/90 text-purple-300 border-purple-500/50'
    });
  }

  return {
    red,
    black,
    yellow,
    green,
    blue,
    others,
    badges,
    textSummary: badges.map((b) => b.label).join(', '),
    customRemarks: remainingRemarks.join(', ')
  };
}

export interface ReqDeliverySummary {
  totalApproved: number;
  totalDelivered: number;
  totalRest: number;
  deliveryCount: number;
  isFullyDelivered: boolean;
  isPartiallyDelivered: boolean;
  nextBillNo: string;
}

export function getReqDeliveryInfo(req: Requisition): ReqDeliverySummary {
  const totalApproved = req.totalRequestedQty || req.totalApprovedQty || (req.lines || []).reduce((s, l) => s + (l.requestedQty || l.approvedQty || 0), 0);
  const totalDelivered = (req.lines || []).reduce((s, l) => s + (Number(l.deliveredQty) || 0), 0);
  const totalRest = Math.max(0, totalApproved - totalDelivered);
  const deliveryCount = req.deliveryHistory?.length || 0;
  const isFullyDelivered = totalApproved > 0 && totalRest === 0 && totalDelivered > 0;
  const isPartiallyDelivered = totalDelivered > 0 && totalRest > 0;
  const nextBillNo = getDeliveryBillNo(req, deliveryCount);

  return {
    totalApproved,
    totalDelivered,
    totalRest,
    deliveryCount,
    isFullyDelivered,
    isPartiallyDelivered,
    nextBillNo
  };
}

// Helper to get storage key per sales center
export function getSalesCenterStorageKey(salesCenterName?: string): string {
  const clean = cleanBranchName(salesCenterName || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `polycables_req_seq_${clean || 'default'}`;
}

// Get next requisition sequence for a specific sales center (starts from 01)
export function getNextSeqForSalesCenter(
  salesCenterName: string,
  allRequisitions: Requisition[],
  branchList: BranchLocation[] = []
): number {
  if (!salesCenterName) return 1;
  const cleanTarget = cleanBranchName(salesCenterName || '').toLowerCase();
  if (cleanTarget === 'all') return 1;
  const storageKey = getSalesCenterStorageKey(salesCenterName);

  let maxSeq = 0;
  let matchingCount = 0;

  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed > 0 && parsed < 1000) {
        maxSeq = parsed;
      }
    }
  } catch {}

  (allRequisitions || []).forEach((r) => {
    const rBranch = cleanBranchName(r.branchName || '').toLowerCase();
    const rDest = cleanBranchName(r.toDestination || '').toLowerCase();
    const rDelv = cleanBranchName(r.deliverySite || '').toLowerCase();
    const rParty = cleanBranchName(r.partyName || '').toLowerCase();
    const rPartyAddr = cleanBranchName(r.partyAddress || '').toLowerCase();

    const matchesCenter =
      (rBranch && (rBranch.includes(cleanTarget) || cleanTarget.includes(rBranch))) ||
      (rDest && (rDest.includes(cleanTarget) || cleanTarget.includes(rDest))) ||
      (rDelv && (rDelv.includes(cleanTarget) || cleanTarget.includes(rDelv))) ||
      (rParty && (rParty.includes(cleanTarget) || cleanTarget.includes(rParty))) ||
      (rPartyAddr && (rPartyAddr.includes(cleanTarget) || cleanTarget.includes(rPartyAddr)));

    if (matchesCenter) {
      matchingCount++;
      let num = r.seqNumber;
      if (!num && r.reqNo) {
        const m = r.reqNo.match(/(\d+)/);
        if (m) num = parseInt(m[1], 10);
      }
      if (num && !isNaN(num) && num > maxSeq && num < 1000) {
        maxSeq = num;
      }
    }
  });

  // Guard against legacy mock sequence numbers (e.g. 70) if there are only a handful of requisitions
  if (maxSeq >= 50 && matchingCount <= 5) {
    maxSeq = matchingCount;
  }

  return maxSeq >= 1 ? maxSeq + 1 : 1;
}

interface RequisitionEntryLine {
  id: string;
  itemId?: string;
  itemCode?: string;
  description: string;
  unit: string;
  red?: number | string;
  black?: number | string;
  yellow?: number | string;
  green?: number | string;
  blue?: number | string;
  others?: number | string;
  quantity: number;
  remarks: string;
  isSpecialItem?: boolean;
  rate: number;
  amount: number;
}

const MARKETING_PERSONS = [
  'Subrata Sutradhar',
  'Rajon',
  'Shaheen Khan',
  'Kabir Hossain',
  'Rafiqul Islam',
  'Al-Amin Rahman',
  'Showroom Associate'
];

// ==========================================
// UTILITY FUNCTIONS FOR REQUISITION SEARCH
// ==========================================

/**
 * Intelligent flexible matcher for cable items.
 * Matches standard queries, category combinations, and shortforms like:
 * '1.3rm', '1.3bya', '1.3 rmbya', '1.3', '1.5rm', '40tt', '12/76tt', '500m', 'pc-103'
 */
export const matchesCableItem = (item: Item, query: string): boolean => {
  if (!query || !query.trim()) return true;
  return matchesFlexibleSearch(item.name || '', query, `${item.sizeSpec || ''} ${item.category || ''}`);
};

/**
 * Comprehensive matcher to check if a requisition belongs to or matches a selected sales center.
 * Safely checks branchId, branchName, party's branch, delivery site, destination, and salesperson.
 */
export const doesRequisitionMatchCenter = (
  req: Requisition,
  selectedCenter: string,
  branchesList: BranchLocation[] = [],
  partiesList: Party[] = [],
  spList: Salesperson[] = []
): boolean => {
  if (!selectedCenter || selectedCenter === 'All') return true;

  const targetClean = cleanBranchName(selectedCenter).toLowerCase().trim();
  const targetBranch = branchesList.find(
    (b) =>
      b.name.toLowerCase() === selectedCenter.toLowerCase() ||
      cleanBranchName(b.name).toLowerCase() === targetClean ||
      b.id.toLowerCase() === selectedCenter.toLowerCase()
  );

  // Extract core keyword from target (e.g. "madhupur", "tangail", "ghatail")
  const targetKeyword = targetClean
    .replace(/sales\s*center|showroom|branch|poly\s*cables|\/|\(|\)/gi, '')
    .trim()
    .toLowerCase();

  // 1. Direct branchId match
  if (targetBranch && req.branchId && req.branchId.toLowerCase() === targetBranch.id.toLowerCase()) {
    return true;
  }

  // 2. Requisition's own branchName
  if (req.branchName && req.branchName.trim()) {
    const rbClean = cleanBranchName(req.branchName).toLowerCase().trim();
    if (rbClean === targetClean || rbClean.includes(targetClean) || targetClean.includes(rbClean)) {
      return true;
    }
    if (targetKeyword && targetKeyword.length >= 3 && rbClean.includes(targetKeyword)) {
      return true;
    }
  }

  // 3. Matched party's branch or address
  const partyMatched = partiesList.find(
    (p) => p.name.trim().toLowerCase() === (req.partyName || '').trim().toLowerCase()
  );
  if (partyMatched) {
    if (targetBranch && partyMatched.branchId && partyMatched.branchId.toLowerCase() === targetBranch.id.toLowerCase()) {
      return true;
    }
    if (partyMatched.branchName && partyMatched.branchName.trim()) {
      const pbClean = cleanBranchName(partyMatched.branchName).toLowerCase().trim();
      if (pbClean === targetClean || pbClean.includes(targetClean) || targetClean.includes(pbClean)) {
        return true;
      }
      if (targetKeyword && targetKeyword.length >= 3 && pbClean.includes(targetKeyword)) {
        return true;
      }
    }
  }

  // 4. Requisition's party address or party name
  if (req.partyAddress && req.partyAddress.trim()) {
    const paLower = req.partyAddress.toLowerCase();
    if (targetKeyword && targetKeyword.length >= 3 && paLower.includes(targetKeyword)) {
      return true;
    }
  }
  if (req.partyName && req.partyName.trim()) {
    const pnLower = req.partyName.toLowerCase();
    if (targetKeyword && targetKeyword.length >= 3 && pnLower.includes(targetKeyword)) {
      return true;
    }
  }

  // 5. Requisition's delivery site
  if (req.deliverySite && req.deliverySite.trim()) {
    const dsLower = req.deliverySite.toLowerCase();
    if (targetKeyword && targetKeyword.length >= 3 && dsLower.includes(targetKeyword)) {
      return true;
    }
  }

  // 6. toDestination (e.g. if toDestination is the sales center itself)
  if (req.toDestination && req.toDestination.trim() && req.toDestination.toLowerCase() !== 'factory') {
    const destClean = cleanBranchName(req.toDestination).toLowerCase().trim();
    if (destClean === targetClean || destClean.includes(targetClean)) {
      return true;
    }
    if (targetKeyword && targetKeyword.length >= 3 && destClean.includes(targetKeyword)) {
      return true;
    }
  }

  // 7. Salesperson associated with requisition
  const spName = req.marketingPersonName || req.createdByName || req.preparedBySignature;
  if (spName && spName.trim()) {
    const spMatched = spList.find((s) => s.name.toLowerCase().trim() === spName.toLowerCase().trim());
    if (spMatched) {
      if (targetBranch && spMatched.branchId && spMatched.branchId.toLowerCase() === targetBranch.id.toLowerCase()) {
        return true;
      }
      if (spMatched.branchName && spMatched.branchName.trim()) {
        const spbClean = cleanBranchName(spMatched.branchName).toLowerCase().trim();
        if (spbClean === targetClean || spbClean.includes(targetClean)) {
          return true;
        }
        if (targetKeyword && targetKeyword.length >= 3 && spbClean.includes(targetKeyword)) {
          return true;
        }
      }
    }
  }

  return false;
};

export const RequisitionPage: React.FC<RequisitionPageProps> = ({
  requisitions: propRequisitions,
  setRequisitions: propSetRequisitions,
  items = defaultItems,
  parties = [],
  salespersons = [],
  company,
  storedBills,
  setStoredBills,
  deliveryChallans = [],
  setDeliveryChallans,
  collections = [],
  stockReturns = [],
  onOpenBillInEditor,
  onOpenForecast,
  onBack,
  onClose,
  currentUser,
  initialSubTab,
  subTab,
  setSubTab,
  branches = [],
  onSyncCloud,
  isApprovalPage = false
}) => {
  const isSuperAdmin = useMemo(() => {
    if (!currentUser) return false;
    const role = (currentUser.role || '').toLowerCase();
    const uname = (currentUser.username || '').toLowerCase();
    const userRole = ((currentUser as any).userRole || '').toLowerCase();
    return (
      currentUser.isSuperAdmin === true ||
      role === 'superadmin' ||
      role === 'super_admin' ||
      role === 'admin' ||
      role === 'agm' ||
      role.includes('admin') ||
      role.includes('director') ||
      userRole.includes('admin') ||
      userRole.includes('super admin') ||
      userRole.includes('director') ||
      uname === 'suvro' ||
      uname === 'admin' ||
      uname === 'suvroadmin' ||
      uname === 'superadmin' ||
      uname === 'director' ||
      uname === 'suvro10008@gmail.com'
    );
  }, [currentUser]);

  const loggedInSalespersonName = useMemo(() => {
    if (!currentUser) return 'Subrata';
    const sp = (salespersons || []).find(
      (s) =>
        s.code?.toLowerCase() === currentUser.username?.toLowerCase() ||
        s.name?.toLowerCase() === (currentUser.name || '').toLowerCase() ||
        (s.name && currentUser.username && s.name.toLowerCase().includes(currentUser.username.toLowerCase()))
    );
    return sp?.name || currentUser.name || currentUser.username || 'Subrata';
  }, [currentUser, salespersons]);
  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => getAllCategories());
  useEffect(() => {
    const refreshCategories = () => setCategoryOrder(getAllCategories());
    window.addEventListener('categories-updated', refreshCategories);
    window.addEventListener('storage', refreshCategories);
    return () => {
      window.removeEventListener('categories-updated', refreshCategories);
      window.removeEventListener('storage', refreshCategories);
    };
  }, []);

  const availableItems = useMemo(() => {
    const rawList = (items && items.length > 0 ? items : defaultItems).filter((i) => i.isActive !== false);
    return sortItemsCategorySerialWise(rawList, categoryOrder);
  }, [items, categoryOrder]);
  // Master persistent state for requisitions
  const [localRequisitions, setLocalRequisitions] = useState<Requisition[]>(() => {
    try {
      const local = localStorage.getItem('polycables_requisitions');
      if (local !== null) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed)) {
          return parsed.map((r: Requisition) => {
            const isReq070 = r.id === 'req-070' || (r.reqNo && r.reqNo.includes('070'));
            let reqNo = r.reqNo;
            let seqNumber = r.seqNumber;
            let inChargeApproved = r.inChargeApproved;
            let inChargeApprovedBy = r.inChargeApprovedBy;

            if (r.id === 'req-070' && (r.reqNo === '# 01-Subrata Sutradhar' || r.seqNumber === 1)) {
              reqNo = '# 03-Subrata Sutradhar';
              seqNumber = 3;
              inChargeApproved = true;
              inChargeApprovedBy = 'Subrata Sutradhar';
            } else if (r.id === 'req-101') {
              reqNo = '# 02-Subrata Sutradhar';
              seqNumber = 2;
              inChargeApproved = true;
              inChargeApprovedBy = 'Subrata Sutradhar';
            } else if (r.id === 'req-102') {
              reqNo = '# 01-Subrata Sutradhar';
              seqNumber = 1;
              inChargeApproved = true;
              inChargeApprovedBy = 'Subrata Sutradhar';
            }

            const cleanedLines = (r.lines || []).map((l) => {
              let rmk = l.remarks || '';
              // Clean duplicate pattern e.g. "R:10, B:10, Y:2 (R:10, B:10, Y:2)" -> "R:10, B:10, Y:2"
              const dupMatch = rmk.match(/^(.*?)\s*\((.*?)\)$/);
              if (dupMatch) {
                const p1 = dupMatch[1].trim();
                const p2 = dupMatch[2].trim();
                const n1 = p1.replace(/[\s,;:_-]+/g, '').toLowerCase();
                const n2 = p2.replace(/[\s,;:_-]+/g, '').toLowerCase();
                if (n1 === n2 || !n2 || n1.includes(n2) || n2.includes(n1)) {
                  rmk = p1 || p2;
                }
              }
              if (isReq070 && (rmk.includes('(R:10, B:10, Y:2)') || rmk === 'R:10, B:10, Y:2 (R:10, B:10, Y:2)')) {
                rmk = 'R:10, B:10, Y:2';
              }
              return {
                ...l,
                remarks: rmk
              };
            });
            return {
              ...r,
              reqNo,
              seqNumber,
              inChargeApproved,
              inChargeApprovedBy,
              lines: cleanedLines
            };
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
    return defaultRequisitions;
  });

  const requisitions = propRequisitions ?? localRequisitions;
  const setRequisitions = propSetRequisitions ?? setLocalRequisitions;

  const isReqInChargeApproved = (r: Requisition): boolean =>
    Boolean(
      r.inChargeApproved ||
      r.inChargeApprovedBy ||
      r.inChargeApprovalDate ||
      r.isApproved ||
      r.stage === 'sent_to_factory' ||
      r.stage === 'factory_dispatched' ||
      r.stage === 'factory_received' ||
      r.stage === 'goods_received' ||
      r.stage === 'converted_to_bill'
    );

  const isAdminRoleUser = useMemo(() => {
    if (!currentUser) return false;
    return isStrictSuperAdmin(currentUser) || isAnyAdmin(currentUser);
  }, [currentUser]);

  // Strict hierarchy rule on Approve Requisition:
  // If Showroom / Sales Center In-Charge has NOT approved yet, Admin cannot see anything!
  const listScopedRequisitions = useMemo(() => {
    if (isApprovalPage && isAdminRoleUser) {
      return requisitions.filter(isReqInChargeApproved);
    }
    return requisitions;
  }, [requisitions, isApprovalPage, isAdminRoleUser]);

  const [activeTab, setActiveTabState] = useState<'entry_slip' | 'list' | 'approved_history' | 'delivered'>(
    (initialSubTab || subTab || 'entry_slip') as any
  );
  const setActiveTab = (tab: 'entry_slip' | 'list' | 'approved_history' | 'delivered') => {
    setActiveTabState(tab);
    if (setSubTab) setSubTab(tab);
  };

  const isFactoryRole = useMemo(() => {
    return isFactoryUser(currentUser);
  }, [currentUser]);

  // If user is a Factory Role user, default to 'approved_history' unless delivered is requested
  useEffect(() => {
    if (isFactoryRole && activeTab !== 'approved_history' && activeTab !== 'delivered') {
      setActiveTabState('approved_history');
      if (setSubTab) setSubTab('approved_history');
    }
  }, [isFactoryRole]);

  useEffect(() => {
    if (initialSubTab) {
      if (isFactoryRole && initialSubTab !== 'delivered' && initialSubTab !== 'approved_history') {
        setActiveTabState('approved_history');
      } else {
        setActiveTabState(initialSubTab);
      }
    }
  }, [initialSubTab, isFactoryRole]);

  useEffect(() => {
    if (subTab) {
      if (isFactoryRole && subTab !== 'delivered' && subTab !== 'approved_history') {
        setActiveTabState('approved_history');
      } else {
        setActiveTabState(subTab);
      }
    }
  }, [subTab, isFactoryRole]);
  const [editingRequisitionId, setEditingRequisitionId] = useState<string | null>(null);
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [saveNotification, setSaveNotification] = useState(false);
  const [selectedRequisitionForView, setSelectedRequisitionForView] = useState<Requisition | null>(null);
  const [expandedApprovedReqIds, setExpandedApprovedReqIds] = useState<Record<string, boolean>>({});

  const userLoginFilters = useMemo(() => {
    return getUserLoginFilters(currentUser, salespersons, branches);
  }, [currentUser, salespersons, branches]);

  // Search & Filter for History list
  const [listSearchQuery, setListSearchQuery] = useState('');
  const [listStageFilter, setListStageFilter] = useState('All');
  const [listApprovalFilter, setListApprovalFilter] = useState<'All' | 'pending' | 'approved'>('All');
  const [listMarketingPersonFilter, setListMarketingPersonFilter] = useState<string>('All');
  const [salesCenterFilter, setSalesCenterFilter] = useState<string>('All');
  const [listDateFilter, setListDateFilter] = useState<StandardPeriodPreset>(() => {
    try { return (sessionStorage.getItem('polycables_req_list_date_filter') as StandardPeriodPreset) || 'all'; } catch { return 'all'; }
  });
  const [customStartDate, setCustomStartDate] = useState(() => {
    try { return sessionStorage.getItem('polycables_req_list_start_date') || ''; } catch { return ''; }
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    try { return sessionStorage.getItem('polycables_req_list_end_date') || ''; } catch { return ''; }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem('polycables_req_list_date_filter', listDateFilter);
      sessionStorage.setItem('polycables_req_list_start_date', customStartDate);
      sessionStorage.setItem('polycables_req_list_end_date', customEndDate);
    } catch {}
  }, [listDateFilter, customStartDate, customEndDate]);
  const [listSortField, setListSortField] = useState<string>('date');
  const [listSortDirection, setListSortDirection] = useState<'asc' | 'desc'>('desc');

  // Approval counts for quick filter pills
  const approvalCounts = useMemo(() => {
    let approved = 0;
    let pending = 0;
    listScopedRequisitions.forEach((r) => {
      const isApp = r.isApproved || r.stage === 'sent_to_factory' || r.stage === 'factory_dispatched' || r.stage === 'factory_received' || r.stage === 'goods_received' || r.stage === 'converted_to_bill';
      if (isApp) {
        approved++;
      } else {
        pending++;
      }
    });
    return { all: listScopedRequisitions.length, approved, pending };
  }, [listScopedRequisitions]);

  // Stage counts for quick filter pills
  const stageCounts = useMemo(() => {
    let pending = 0;
    let received = 0;
    let converted = 0;
    listScopedRequisitions.forEach((r) => {
      if (r.stage === 'converted_to_bill' || r.isLocked) {
        converted++;
      } else if (r.stage === 'goods_received') {
        received++;
      } else {
        pending++;
      }
    });
    return {
      all: listScopedRequisitions.length,
      pending,
      received,
      converted,
    };
  }, [listScopedRequisitions]);

  // In-Charge Requisition Approval: Showroom In-Charge approves before Admin
  const handleInChargeApproveRequisition = (reqId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const targetReq = requisitions.find((r) => r.id === reqId);
    if (!targetReq) return;

    if (!canApproveInChargeRequisition(currentUser, targetReq, branches, salespersons)) {
      alert('Permission Denied: Only the Showroom / Sales Center In-Charge can approve this step.');
      return;
    }

    const inChargeTitle = currentUser?.name || currentUser?.username || 'Showroom In-Charge';
    const isCurrentlyApproved = Boolean(targetReq.inChargeApproved);
    const nextApproved = !isCurrentlyApproved;

    setRequisitions((prev) => {
      const updated = prev.map((r) => {
        if (r.id === reqId) {
          return {
            ...r,
            inChargeApproved: nextApproved,
            inChargeApprovedBy: nextApproved ? inChargeTitle : undefined,
            inChargeApprovedAt: nextApproved ? new Date().toISOString() : undefined,
            inChargeApprovalDate: nextApproved ? new Date().toISOString().slice(0, 10) : undefined,
            stage: nextApproved && (r.stage === 'pending_incharge' || (r.stage as string) === 'draft') ? 'pending_approver' : r.stage,
            updatedAt: new Date().toISOString()
          };
        }
        return r;
      });
      try {
        localStorage.setItem('polycables_requisitions', JSON.stringify(updated));
      } catch {}
      if (onSyncCloud) {
        onSyncCloud({ requisitions: updated }, true);
      }
      return updated;
    });
  };

  // Toggle Requisition Approval: Only that sales center Admin (or Super Admin) can do it
  const handleToggleApproveRequisition = (reqId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const targetReq = requisitions.find((r) => r.id === reqId);
    if (!targetReq) return;

    if (!canApproveSalesCenterRequisition(currentUser, targetReq, branches, salespersons)) {
      alert('Permission Denied: Only the assigned Admin for this Sales Center can approve or revoke this requisition.');
      return;
    }

    const isCurrentlyApproved = Boolean(
      targetReq.isApproved ||
      targetReq.stage === 'sent_to_factory' ||
      targetReq.stage === 'factory_dispatched' ||
      targetReq.stage === 'factory_received' ||
      targetReq.stage === 'goods_received' ||
      targetReq.stage === 'converted_to_bill'
    );

    // Requisition must be approved by In-Charge first before Admin final approval
    if (!isCurrentlyApproved && !isReqInChargeApproved(targetReq)) {
      alert('Requisition is Pending In-Charge. It must be approved by Showroom / Sales Center In-Charge before Admin final approval.');
      return;
    }

    setRequisitions((prev) => {
      const updated = prev.map((r) => {
        if (r.id === reqId) {
          const nextApproved = !isCurrentlyApproved;
          const approverTitle = currentUser?.name || currentUser?.username || 'Sales Center Admin';
          const nextStage: RequisitionStage = nextApproved && (r.stage === 'pending_goods' || (r.stage as string) === 'draft' || r.stage === 'pending_incharge' || r.stage === 'pending_approver')
            ? 'sent_to_factory'
            : (!nextApproved && r.stage === 'sent_to_factory' ? 'pending_goods' : r.stage);

          return {
            ...r,
            isApproved: nextApproved,
            approvedAt: nextApproved ? new Date().toISOString() : undefined,
            approvedBy: nextApproved ? approverTitle : undefined,
            approverName: nextApproved ? approverTitle : r.approverName,
            approvedBySignature: nextApproved ? approverTitle : undefined,
            approverApprovalDate: nextApproved ? new Date().toISOString().slice(0, 10) : r.approverApprovalDate,
            stage: nextStage,
            updatedAt: new Date().toISOString()
          };
        }
        return r;
      });
      try {
        localStorage.setItem('polycables_requisitions', JSON.stringify(updated));
      } catch {}
      if (onSyncCloud) {
        onSyncCloud({ requisitions: updated }, true);
      }
      return updated;
    });
  };

  // Factory Multi-Delivery Modal States
  const [deliveryModalReq, setDeliveryModalReq] = useState<Requisition | null>(null);
  const [deliveryInputs, setDeliveryInputs] = useState<Record<string, number>>({});
  const [deliveryColorInputs, setDeliveryColorInputs] = useState<Record<string, { red?: number; black?: number; yellow?: number; green?: number; blue?: number; others?: number }>>({});
  const [deliveryDate, setDeliveryDate] = useState<string>(() => getTodayDDMMYY());
  const [deliveryChallanNo, setDeliveryChallanNo] = useState<string>('');
  const [deliveryVehicleNo, setDeliveryVehicleNo] = useState<string>('');
  const [deliveryDriverPhone, setDeliveryDriverPhone] = useState<string>('');
  const [deliveryNotes, setDeliveryNotes] = useState<string>('');
  const [deliveryError, setDeliveryError] = useState<string>('');
  const [previewDeliveryChallan, setPreviewDeliveryChallan] = useState<DeliveryChallan | null>(null);
  const [previewReqForChallan, setPreviewReqForChallan] = useState<Requisition | null>(null);
  const deliveryModalContainerRef = useRef<HTMLDivElement>(null);
  const deliveryConfirmBtnRef = useRef<HTMLButtonElement>(null);

  const focusNextDeliveryInput = (currentEl: HTMLElement) => {
    const container = deliveryModalContainerRef.current;
    if (!container) return;
    const focusables = Array.from(
      container.querySelectorAll<HTMLElement>('[data-delivery-focus="true"]:not([disabled]):not([readonly])')
    );
    const currentIdx = focusables.indexOf(currentEl);
    if (currentIdx !== -1 && currentIdx + 1 < focusables.length) {
      const nextEl = focusables[currentIdx + 1];
      nextEl.focus();
      if (nextEl instanceof HTMLInputElement && typeof nextEl.select === 'function') {
        try {
          nextEl.select();
        } catch {}
      }
    } else {
      deliveryConfirmBtnRef.current?.focus();
    }
  };

  const handleOpenDeliveryModal = (req: Requisition) => {
    setDeliveryModalReq(req);
    setDeliveryError('');
    const initialInputs: Record<string, number> = {};
    const initialColorInputs: Record<string, { red?: number; black?: number; yellow?: number; green?: number; blue?: number; others?: number }> = {};

    (req.lines || []).forEach((l) => {
      const approved = Number(l.approvedQty || l.requestedQty || 0);
      const delivered = Number(l.deliveredQty || 0);
      const rest = Math.max(0, approved - delivered);
      initialInputs[l.id] = rest;

      const col = extractReqLineColors(l);
      const prevDelCol = (l as any).deliveredColors || {};
      const remRed = Math.max(0, (col.red || 0) - (Number(prevDelCol.red) || 0));
      const remBlack = Math.max(0, (col.black || 0) - (Number(prevDelCol.black ?? prevDelCol.blk) || 0));
      const remYellow = Math.max(0, (col.yellow || 0) - (Number(prevDelCol.yellow ?? prevDelCol.yel) || 0));
      const remGreen = Math.max(0, (col.green || 0) - (Number(prevDelCol.green ?? prevDelCol.grn) || 0));
      const remBlue = Math.max(0, (col.blue || 0) - (Number(prevDelCol.blue ?? prevDelCol.blu) || 0));
      const remOthers = Math.max(0, (col.others || 0) - (Number(prevDelCol.others) || 0));
      const hasAnyReqCol = col.red > 0 || col.black > 0 || col.yellow > 0 || col.green > 0 || col.blue > 0 || col.others > 0;

      if (hasAnyReqCol) {
        const initCols = {
          red: remRed,
          black: remBlack,
          yellow: remYellow,
          green: remGreen,
          blue: remBlue,
          others: remOthers
        };
        initialColorInputs[l.id] = initCols;
        const initColSum = remRed + remBlack + remYellow + remGreen + remBlue + remOthers;
        if (initColSum > 0) {
          initialInputs[l.id] = Math.min(rest, initColSum);
        }
      } else {
        initialColorInputs[l.id] = { red: 0, black: 0, yellow: 0, green: 0, blue: 0, others: 0 };
      }
    });

    setDeliveryInputs(initialInputs);
    setDeliveryColorInputs(initialColorInputs);
    setDeliveryDate(getTodayDDMMYY());
    const nextBillNo = getDeliveryBillNo(req, req.deliveryHistory?.length || 0);
    setDeliveryChallanNo(`CH-${nextBillNo}`);
    setDeliveryVehicleNo('');
    setDeliveryDriverPhone('');
    setDeliveryNotes('');
  };

  const handleConfirmDelivery = () => {
    if (!deliveryModalReq) return;

    const totalDeliveringNow = Object.values(deliveryInputs).reduce((s, v) => s + (Number(v) || 0), 0);
    if (totalDeliveringNow <= 0) {
      setDeliveryError('Please enter at least 1 coil to deliver in this shipment.');
      return;
    }

    for (const line of (deliveryModalReq.lines || [])) {
      const delivering = Number(deliveryInputs[line.id] || 0);
      const approved = Number(line.approvedQty || line.requestedQty || 0);
      const prevDelivered = Number(line.deliveredQty || 0);
      const maxAllowed = Math.max(0, approved - prevDelivered);
      if (delivering > maxAllowed) {
        setDeliveryError(`Cannot deliver ${delivering} coils for "${line.itemName}". Maximum rest quantity is ${maxAllowed}.`);
        return;
      }
    }
    setDeliveryError('');

    const currentHistory = deliveryModalReq.deliveryHistory || [];
    const nextIndex = currentHistory.length;
    const nextBillNo = getDeliveryBillNo(deliveryModalReq, nextIndex);

    const deliveredBillLines: BillLineItem[] = [];
    const updatedReqLines = (deliveryModalReq.lines || []).map((l, idx) => {
      const qtyNow = Number(deliveryInputs[l.id] || 0);
      const prevDelivered = Number(l.deliveredQty || 0);
      const newDelivered = prevDelivered + qtyNow;
      const lineColorsNow = deliveryColorInputs[l.id] || {};
      const colRed = Number(lineColorsNow.red) || 0;
      const colBlack = Number(lineColorsNow.black) || 0;
      const colYellow = Number(lineColorsNow.yellow) || 0;
      const colGreen = Number(lineColorsNow.green) || 0;
      const colBlue = Number(lineColorsNow.blue) || 0;
      const colOthers = Number(lineColorsNow.others) || 0;
      const hasColorNow = colRed + colBlack + colYellow + colGreen + colBlue + colOthers > 0;

      if (qtyNow > 0) {
        let matchedRate = Number(l.rate) || 0;
        if (!matchedRate && items.length > 0) {
          const mItem = items.find(
            (it) => it.id === l.itemId || it.name.toLowerCase().trim() === (l.itemName || l.itemCode || '').toLowerCase().trim()
          );
          if (mItem) matchedRate = mItem.rate || 0;
        }
        deliveredBillLines.push({
          id: `bline-${Date.now()}-${idx}`,
          slNo: deliveredBillLines.length + 1,
          itemId: l.itemId || `item-${idx}`,
          itemDescription: l.itemName || l.itemCode || 'Cable Item',
          sizeSpec: l.remarks || '',
          coilQty: qtyNow,
          unit: l.unit || 'Coils',
          rate: matchedRate,
          amount: matchedRate * qtyNow,
          ...(hasColorNow
            ? {
                colors: {
                  red: colRed,
                  blk: colBlack,
                  yel: colYellow,
                  grn: colGreen,
                  blu: colBlue,
                  others: colOthers
                }
              }
            : {})
        });
      }

      const prevDeliveredCols = (l as any).deliveredColors || {};
      return {
        ...l,
        deliveredQty: newDelivered,
        ...(hasColorNow
          ? {
              deliveredColors: {
                red: (Number(prevDeliveredCols.red) || 0) + colRed,
                black: (Number(prevDeliveredCols.black) || 0) + colBlack,
                yellow: (Number(prevDeliveredCols.yellow) || 0) + colYellow,
                green: (Number(prevDeliveredCols.green) || 0) + colGreen,
                blue: (Number(prevDeliveredCols.blue) || 0) + colBlue,
                others: (Number(prevDeliveredCols.others) || 0) + colOthers
              }
            }
          : {})
      };
    });

    const deliveryGross = deliveredBillLines.reduce((s, bl) => s + bl.amount, 0);
    const discPct = deliveryModalReq.discountPercent || 0;
    const discAmt = Math.round((deliveryGross * discPct) / 100);
    const netTotal = Math.max(0, deliveryGross - discAmt);

    const spMatch = salespersons.find(
      (s) =>
        s.code === deliveryModalReq.marketingPersonName ||
        (s.name && s.name.toLowerCase().includes((deliveryModalReq.marketingPersonName || '').toLowerCase()))
    );

    const finalChallanNo = deliveryChallanNo.trim() || `CH-${nextBillNo}`;
    const challanLines: ChallanLineItem[] = deliveredBillLines.map((bl, idx) => ({
      id: bl.id,
      slNo: idx + 1,
      itemId: bl.itemId,
      itemCode: bl.itemCode || '',
      itemDescription: bl.itemDescription,
      sizeSpec: bl.sizeSpec,
      coilQty: bl.coilQty,
      unit: bl.unit || 'Coils',
      rate: 0,
      amount: 0,
      billedQty: 0,
      dueQty: bl.coilQty,
      ...(bl.colors
        ? {
            colors: {
              red: bl.colors.red || 0,
              blk: bl.colors.blk || bl.colors.black || 0,
              yel: bl.colors.yel || bl.colors.yellow || 0,
              grn: bl.colors.grn || bl.colors.green || 0,
              blu: bl.colors.blu || bl.colors.blue || 0,
              others: bl.colors.others || 0
            }
          }
        : {})
    }));

    // Factory creates Delivery Challan ONLY (never creates bill or charges amount)
    const newDeliveryChallan: DeliveryChallan = {
      id: `challan-delv-${Date.now()}-${nextIndex}`,
      challanNo: finalChallanNo,
      date: parseDateToISO(deliveryDate) || getTodayISO(),
      branchId: deliveryModalReq.branchId,
      branchName: deliveryModalReq.branchName,
      orderNumber: deliveryModalReq.reqNo || finalChallanNo,
      orderDate: deliveryModalReq.date || getTodayISO(),
      refNo: deliveryModalReq.reqNo || finalChallanNo,
      salesmanCode: spMatch?.code || '134',
      salespersonName: spMatch?.name || deliveryModalReq.marketingPersonName || 'Subrata Sutradhar',
      partyName: deliveryModalReq.partyName || deliveryModalReq.branchName || 'Customer',
      address: deliveryModalReq.partyAddress || '',
      lines: challanLines,
      totalQuantity: totalDeliveringNow,
      billedQuantity: 0,
      dueQuantity: totalDeliveringNow,
      totalAmount: 0,
      status: 'unbilled',
      vehicleNo: deliveryVehicleNo,
      driverPhone: deliveryDriverPhone,
      remarks: deliveryNotes,
      savedAt: new Date().toISOString()
    };

    let existingChallans: DeliveryChallan[] = Array.isArray(deliveryChallans) ? deliveryChallans : [];
    try {
      const saved = localStorage.getItem('polycables_delivery_challans');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > existingChallans.length) {
          existingChallans = parsed;
        }
      }
    } catch {}
    const nextChallans = [
      newDeliveryChallan,
      ...existingChallans.filter((c) => c.id !== newDeliveryChallan.id)
    ];
    if (setDeliveryChallans) {
      setDeliveryChallans(nextChallans);
    }
    try {
      localStorage.setItem('polycables_delivery_challans', JSON.stringify(nextChallans));
    } catch {}
    onSyncCloud?.({ deliveryChallans: nextChallans }, true);

    const newDeliveryRecord = {
      deliveryIndex: nextIndex,
      challanId: newDeliveryChallan.id,
      challanNo: finalChallanNo,
      billNo: finalChallanNo,
      date: deliveryDate,
      deliveredAt: new Date().toISOString(),
      deliveredCoils: totalDeliveringNow,
      totalAmount: 0,
      vehicleNo: deliveryVehicleNo,
      driverPhone: deliveryDriverPhone,
      notes: deliveryNotes,
      lines: deliveredBillLines.map((bl) => ({
        ...bl,
        rate: 0,
        amount: 0
      }))
    };

    const updatedHistory = [...currentHistory, newDeliveryRecord];
    const totalDeliveredAll = updatedReqLines.reduce((s, l) => s + (Number(l.deliveredQty) || 0), 0);
    const totalOrderedAll = deliveryModalReq.totalRequestedQty || deliveryModalReq.totalApprovedQty || 0;
    const isAllDelivered = totalDeliveredAll >= totalOrderedAll;

    const updatedRequisition: Requisition = {
      ...deliveryModalReq,
      lines: updatedReqLines,
      totalDeliveredQty: totalDeliveredAll,
      deliveryStatus: isAllDelivered ? 'fully_delivered' : 'partially_delivered',
      deliveryHistory: updatedHistory,
      stage: isAllDelivered ? 'goods_received' : 'factory_dispatched',
      updatedAt: new Date().toISOString()
    };

    const updatedList = requisitions.map((r) =>
      r.id === deliveryModalReq.id ? updatedRequisition : r
    );
    saveRequisitionsToStorage(updatedList, true);
    setDeliveryModalReq(null);
    setPreviewReqForChallan(updatedRequisition);
    setPreviewDeliveryChallan(newDeliveryChallan);
  };

  // Build or resolve a DeliveryChallan for any delivered requisition / delivery batch
  const buildChallanFromDelivery = (req: Requisition, historyRecord?: any, historyIdx: number = 0): DeliveryChallan => {
    const recordChallanNo = historyRecord?.challanNo || historyRecord?.billNo || `CH-${getDeliveryBillNo(req, historyIdx)}`;
    const recordChallanId = historyRecord?.challanId;

    const matchedExisting = (deliveryChallans || []).find(
      (c) =>
        (recordChallanId && c.id === recordChallanId) ||
        (recordChallanNo && c.challanNo && c.challanNo.toLowerCase().trim() === String(recordChallanNo).toLowerCase().trim()) ||
        (!historyRecord && c.orderNumber && req.reqNo && c.orderNumber.toLowerCase().trim() === req.reqNo.toLowerCase().trim())
    );
    if (matchedExisting) {
      return matchedExisting;
    }

    let localChallans: DeliveryChallan[] = [];
    try {
      const saved = localStorage.getItem('polycables_delivery_challans');
      if (saved) localChallans = JSON.parse(saved);
    } catch {}
    const matchedLocal = localChallans.find(
      (c) =>
        (recordChallanId && c.id === recordChallanId) ||
        (recordChallanNo && c.challanNo && c.challanNo.toLowerCase().trim() === String(recordChallanNo).toLowerCase().trim())
    );
    if (matchedLocal) {
      return matchedLocal;
    }

    const sourceLines = historyRecord?.lines && historyRecord.lines.length > 0
      ? historyRecord.lines
      : (req.lines || []).filter((l) => (Number(l.deliveredQty) || Number(l.approvedQty) || Number(l.requestedQty) || 0) > 0);

    const challanLines: ChallanLineItem[] = sourceLines.map((l: any, idx: number) => {
      const qty = Number(l.coilQty ?? l.deliveredQty ?? l.approvedQty ?? l.requestedQty ?? 0);
      const colObj = l.colors || (l.deliveredColors ? {
        red: Number(l.deliveredColors.red) || 0,
        blk: Number(l.deliveredColors.black ?? l.deliveredColors.blk) || 0,
        yel: Number(l.deliveredColors.yellow ?? l.deliveredColors.yel) || 0,
        grn: Number(l.deliveredColors.green ?? l.deliveredColors.grn) || 0,
        blu: Number(l.deliveredColors.blue ?? l.deliveredColors.blu) || 0,
        others: Number(l.deliveredColors.others) || 0
      } : undefined);
      const fallbackColors = colObj || (() => {
        const parsed = extractReqLineColors(l);
        if (parsed.red + parsed.black + parsed.yellow + parsed.green + parsed.blue + parsed.others > 0) {
          return {
            red: parsed.red,
            blk: parsed.black,
            yel: parsed.yellow,
            grn: parsed.green,
            blu: parsed.blue,
            others: parsed.others
          };
        }
        return undefined;
      })();

      return {
        id: l.id || `ch-line-${idx}`,
        slNo: idx + 1,
        itemId: l.itemId || `item-${idx}`,
        itemCode: l.itemCode || '',
        itemDescription: l.itemDescription || l.itemName || 'Cable Item',
        sizeSpec: l.sizeSpec || l.remarks || '',
        coilQty: qty,
        unit: l.unit || 'Coils',
        rate: 0,
        amount: 0,
        billedQty: 0,
        dueQty: qty,
        ...(fallbackColors ? { colors: fallbackColors } : {})
      };
    });

    const totalQty = historyRecord?.deliveredCoils || challanLines.reduce((s, l) => s + (Number(l.coilQty) || 0), 0);

    return {
      id: recordChallanId || `challan-delv-${req.id}-${historyIdx}`,
      challanNo: String(recordChallanNo),
      date: parseDateToISO(historyRecord?.date || req.delvDateStr || req.date) || getTodayISO(),
      branchId: req.branchId,
      branchName: req.branchName || req.toDestination || 'Sales Center',
      orderNumber: req.reqNo || '',
      orderDate: req.date || getTodayISO(),
      refNo: req.reqNo || '',
      salesmanCode: '',
      salespersonName: normalizeMarketingPersonName(req.marketingPersonName || req.createdByName || 'Subrata Sutradhar'),
      partyName: req.partyName || req.branchName || 'Customer',
      address: req.partyAddress || '',
      lines: challanLines,
      totalQuantity: totalQty,
      billedQuantity: 0,
      dueQuantity: totalQty,
      totalAmount: 0,
      status: 'unbilled',
      vehicleNo: historyRecord?.vehicleNo || '',
      driverPhone: historyRecord?.driverPhone || '',
      remarks: historyRecord?.notes || req.remarks || '',
      savedAt: historyRecord?.deliveredAt || req.updatedAt || new Date().toISOString()
    };
  };

  const formatChallanColorsText = (colors?: any): string => {
    if (!colors) return '-';
    const parts: string[] = [];
    if (Number(colors.red) > 0) parts.push(`Red:${colors.red}`);
    if (Number(colors.blk ?? colors.black) > 0) parts.push(`Blk:${colors.blk ?? colors.black}`);
    if (Number(colors.yel ?? colors.yellow) > 0) parts.push(`Yel:${colors.yel ?? colors.yellow}`);
    if (Number(colors.grn ?? colors.green) > 0) parts.push(`Grn:${colors.grn ?? colors.green}`);
    if (Number(colors.blu ?? colors.blue) > 0) parts.push(`Blu:${colors.blu ?? colors.blue}`);
    if (Number(colors.others) > 0) parts.push(`Oth:${colors.others}`);
    return parts.length > 0 ? parts.join(', ') : '-';
  };

  const handleDownloadDeliveryChallanPdf = (challan: DeliveryChallan) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    let y = 16;

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(company?.name || 'POLY CABLES IND. LTD.', pageW / 2, y, { align: 'center' });
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (company?.address) {
      doc.text(company.address, pageW / 2, y, { align: 'center' });
      y += 4.5;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.rect(pageW / 2 - 26, y, 52, 7);
    doc.text('DELIVERY CHALLAN', pageW / 2, y + 5, { align: 'center' });
    y += 12;

    // Metadata grid
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`Party / Destination:`, 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`${challan.partyName || '-'}`, 52, y);

    doc.setFont('helvetica', 'bold');
    doc.text(`Challan No:`, 132, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`${challan.challanNo || '-'}`, 158, y);
    y += 5.5;

    doc.setFont('helvetica', 'bold');
    doc.text(`Address:`, 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`${challan.address || challan.branchName || '-'}`, 52, y);

    doc.setFont('helvetica', 'bold');
    doc.text(`Date:`, 132, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`${formatDateDDMMYY(challan.date)}`, 158, y);
    y += 5.5;

    doc.setFont('helvetica', 'bold');
    doc.text(`Sales Center:`, 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`${challan.branchName || '-'}`, 52, y);

    doc.setFont('helvetica', 'bold');
    doc.text(`Req / Order #:`, 132, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`${challan.orderNumber || challan.refNo || '-'}`, 158, y);
    y += 5.5;

    doc.setFont('helvetica', 'bold');
    doc.text(`Marketing Officer:`, 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`${challan.salespersonName || '-'}`, 52, y);

    doc.setFont('helvetica', 'bold');
    doc.text(`Vehicle No:`, 132, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`${challan.vehicleNo || '-'}`, 158, y);
    y += 8;

    // Table header: SL | Item Description | Quantity | Unit | Colour
    doc.setFillColor(240, 244, 248);
    doc.rect(14, y, pageW - 28, 7, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('SL', 17, y + 4.8);
    doc.text('Item Description', 28, y + 4.8);
    doc.text('Quantity', 112, y + 4.8, { align: 'right' });
    doc.text('Unit', 128, y + 4.8, { align: 'center' });
    doc.text('Colour', 142, y + 4.8);
    y += 7;

    doc.setFont('helvetica', 'normal');
    const cLines = challan.lines || [];
    cLines.forEach((line, idx) => {
      if (y > 260) {
        doc.addPage();
        y = 18;
      }
      const colStr = formatChallanColorsText((line as any).colors) || line.sizeSpec || '-';
      doc.rect(14, y, pageW - 28, 7.5);
      doc.text(String(idx + 1), 17, y + 5);
      doc.text(String(line.itemDescription || '').slice(0, 34), 28, y + 5);
      doc.setFont('helvetica', 'bold');
      doc.text(String(line.coilQty || 0), 112, y + 5, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.text(String(line.unit || 'Coils'), 128, y + 5, { align: 'center' });
      doc.text(String(colStr).slice(0, 30), 142, y + 5);
      y += 7.5;
    });

    // Total Row
    doc.setFillColor(245, 247, 250);
    doc.rect(14, y, pageW - 28, 8, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.text('Total Delivered Quantity:', 94, y + 5.5, { align: 'right' });
    const totQty = cLines.reduce((s, l) => s + (Number(l.coilQty) || 0), 0) || challan.totalQuantity || 0;
    doc.text(String(totQty), 112, y + 5.5, { align: 'right' });
    doc.text('Coils', 128, y + 5.5, { align: 'center' });
    y += 12;

    if (challan.remarks) {
      doc.setFont('helvetica', 'bold');
      doc.text('Remarks:', 14, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(challan.remarks).slice(0, 95), 32, y);
      y += 10;
    }

    let sigY = y + 36;
    if (sigY + 12 > 282) {
      doc.addPage();
      sigY = 48;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.line(16, sigY, 58, sigY);
    doc.text('Prepared By', 37, sigY + 4.5, { align: 'center' });
    doc.line(84, sigY, 126, sigY);
    doc.text('Factory Store In-Charge', 105, sigY + 4.5, { align: 'center' });
    doc.line(152, sigY, 194, sigY);
    doc.text('Received By', 173, sigY + 4.5, { align: 'center' });

    const safeFileName = `Challan_${(challan.challanNo || 'Delivery').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
    doc.save(safeFileName);
  };

  // Marketing user directory names (default Subrata)
  const userDirectoryNames = useMemo(() => {
    const fromSp = salespersons
      .map((s) => normalizeMarketingPersonName(s.name?.trim()))
      .filter((n): n is string => Boolean(n && n.length > 0));
    const unique = Array.from(new Set(fromSp));
    return unique;
  }, [salespersons]);

  // All distinct marketing person names appearing across user directory, salespersons, and requisitions
  const allMarketingFilterNames = useMemo(() => {
    const set = new Set<string>();
    const addClean = (rawName?: string | null) => {
      if (!rawName || !rawName.trim()) return;
      const clean = normalizeMarketingPersonName(rawName.trim());
      if (clean) set.add(clean);
    };

    userDirectoryNames.forEach(addClean);
    salespersons.forEach((s) => addClean(s.name));
    requisitions.forEach((r) => {
      addClean(r.marketingPersonName);
      addClean(r.createdByName);
      addClean(r.preparedBySignature);
      addClean(r.reqBySignature);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [userDirectoryNames, salespersons, requisitions]);

  const allowedBranches = useMemo(
    () => filterBranchesForUser(branches, currentUser, salespersons),
    [branches, currentUser, salespersons]
  );

  // All distinct sales center names for Center filter dropdown (scoped to Admin's assigned centers)
  const allSalesCenters = useMemo(() => {
    const set = new Set<string>();
    const isSuperOrAcc = isStrictSuperAdmin(currentUser) || isAccountsAdmin(currentUser);
    allowedBranches.forEach((b) => {
      if (b.name && b.name.trim()) set.add(b.name.trim());
    });
    if (isSuperOrAcc) {
      requisitions.forEach((r) => {
        if (r.branchName && r.branchName.trim()) set.add(cleanBranchName(r.branchName));
        if (r.toDestination && r.toDestination.trim() && r.toDestination.toLowerCase() !== 'factory') {
          set.add(cleanBranchName(r.toDestination));
        }
      });
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allowedBranches, requisitions, currentUser]);

  const getFilteredMarketingNamesForCenter = (centerVal: string): string[] => {
    const filteredSps = filterSalespersonsByBranch(salespersons, centerVal, allowedBranches, currentUser);
    const set = new Set<string>();
    filteredSps.forEach((s) => {
      const clean = normalizeMarketingPersonName(s.name?.trim() || '');
      if (clean) set.add(clean);
    });
    if (isStrictSuperAdmin(currentUser) && (!centerVal || centerVal === 'All')) {
      allMarketingFilterNames.forEach((n) => set.add(n));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  };

  // Check if any filter is active
  const hasActiveHistoryFilters = useMemo(() => {
    return (
      listSearchQuery.trim() !== '' ||
      listStageFilter !== 'All' ||
      listApprovalFilter !== 'All' ||
      listMarketingPersonFilter !== 'All' ||
      salesCenterFilter !== 'All' ||
      listDateFilter !== 'all' ||
      customStartDate !== '' ||
      customEndDate !== ''
    );
  }, [listSearchQuery, listStageFilter, listApprovalFilter, listMarketingPersonFilter, salesCenterFilter, listDateFilter, customStartDate, customEndDate]);

  // Reset all filters to show all requisitions
  const handleResetAllHistoryFilters = () => {
    setListSearchQuery('');
    setListStageFilter('All');
    setListApprovalFilter('All');
    setListMarketingPersonFilter('All');
    setSalesCenterFilter('All');
    setListDateFilter('all');
    setCustomStartDate('');
    setCustomEndDate('');
  };

  const handleListSort = (field: string) => {
    if (listSortField === field) {
      setListSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setListSortField(field);
      setListSortDirection('asc');
    }
  };

  const renderSortIndicator = (field: string) => {
    const isActive = listSortField === field;
    return (
      <span className="inline-flex items-center ml-1 text-[11px] select-none font-mono tracking-tighter">
        <span className={isActive && listSortDirection === 'asc' ? 'text-amber-400 font-extrabold scale-110' : 'text-slate-600 opacity-60'}>▲</span>
        <span className={isActive && listSortDirection === 'desc' ? 'text-amber-400 font-extrabold scale-110' : 'text-slate-600 opacity-60'}>▼</span>
      </span>
    );
  };

  // Filtered Requisitions for List View (All Filters Fixed & Fully Synchronized)
  const filteredRequisitions = useMemo(() => {
    const list = listScopedRequisitions.filter((req) => {
      // 1. Stage filter
      if (listStageFilter !== 'All') {
        if (listStageFilter === 'converted_to_bill') {
          if (req.stage !== 'converted_to_bill' && !req.isLocked) return false;
        } else if (listStageFilter === 'goods_received') {
          if (req.stage !== 'goods_received') return false;
        } else if (listStageFilter === 'pending_goods') {
          if (req.stage === 'converted_to_bill' || req.stage === 'goods_received' || req.isLocked) return false;
        } else if (req.stage !== listStageFilter) {
          return false;
        }
      }

      // Party-wise matching
      const partyMatched = parties.find(
        (p) => p.name.trim().toLowerCase() === (req.partyName || req.branchName || '').trim().toLowerCase()
      );

      // 2. Marketing Person filter
      if (listMarketingPersonFilter !== 'All') {
        const targetMp = normalizeMarketingPersonName(listMarketingPersonFilter).trim().toLowerCase();
        const reqMp = normalizeMarketingPersonName(req.marketingPersonName || '').trim().toLowerCase();
        const createdMp = normalizeMarketingPersonName(req.createdByName || '').trim().toLowerCase();
        const prepMp = normalizeMarketingPersonName(req.preparedBySignature || '').trim().toLowerCase();
        const reqByMp = normalizeMarketingPersonName(req.reqBySignature || '').trim().toLowerCase();
        const partyMp = normalizeMarketingPersonName(partyMatched?.salespersonName || '').trim().toLowerCase();
        const reqNoStr = (req.reqNo || '').toLowerCase();

        const targetTokens = targetMp.split(/\s+/).filter((t) => t.length > 2);
        const matchesToken = targetTokens.some(
          (t) =>
            reqMp.includes(t) ||
            createdMp.includes(t) ||
            prepMp.includes(t) ||
            reqByMp.includes(t) ||
            partyMp.includes(t) ||
            reqNoStr.includes(t)
        );

        const matchesMp =
          (reqMp && (reqMp === targetMp || reqMp.includes(targetMp) || targetMp.includes(reqMp))) ||
          (createdMp && (createdMp === targetMp || createdMp.includes(targetMp) || targetMp.includes(createdMp))) ||
          (prepMp && (prepMp === targetMp || prepMp.includes(targetMp) || targetMp.includes(prepMp))) ||
          (reqByMp && (reqByMp === targetMp || reqByMp.includes(targetMp) || targetMp.includes(reqByMp))) ||
          (partyMp && (partyMp === targetMp || partyMp.includes(targetMp) || targetMp.includes(partyMp))) ||
          reqNoStr.includes(targetMp) ||
          matchesToken;

        if (!matchesMp) {
          return false;
        }
      }

      // 3. Sales Center filter
      if (salesCenterFilter !== 'All') {
        const matchesCenter = doesRequisitionMatchCenter(
          req,
          salesCenterFilter,
          branches,
          parties,
          salespersons
        );
        if (!matchesCenter) {
          return false;
        }
      }

      // 4. Date filter
      if (listDateFilter !== 'all') {
        const reqIsoDate =
          parseDateToISO(req.date) ||
          parseDateToISO(req.reqDateStr) ||
          (req.date ? req.date.substring(0, 10) : '');
        if (!isDateInPeriodRange(reqIsoDate, listDateFilter, customStartDate, customEndDate)) {
          return false;
        }
      }

      // 5. Search query filter
      if (listSearchQuery.trim()) {
        const q = listSearchQuery.toLowerCase().trim();
        const no = (req.reqNo || '').toLowerCase();
        const pfx = (req.prefix || '').toLowerCase();
        const pName = (req.partyName || req.branchName || '').toLowerCase();
        const creator = (req.createdByName || req.marketingPersonName || '').toLowerCase();
        const prep = (req.preparedBySignature || '').toLowerCase();
        const dest = (req.toDestination || '').toLowerCase();
        const bName = (req.branchName || '').toLowerCase();
        const addr = (req.partyAddress || '').toLowerCase();
        const site = (req.deliverySite || '').toLowerCase();
        const remarks = (req.remarks || '').toLowerCase();
        const itemsStr = (req.lines || [])
          .map((l) => `${l.itemCode || ''} ${l.itemName || ''} ${l.description || ''} ${l.remarks || ''}`)
          .join(' ')
          .toLowerCase();

        const matchesQuery =
          no.includes(q) ||
          pfx.includes(q) ||
          pName.includes(q) ||
          creator.includes(q) ||
          prep.includes(q) ||
          dest.includes(q) ||
          bName.includes(q) ||
          addr.includes(q) ||
          site.includes(q) ||
          remarks.includes(q) ||
          itemsStr.includes(q);

        if (!matchesQuery) return false;
      }

      // 6. Approval filter
      const isReqApproved = Boolean(
        req.isApproved ||
        req.stage === 'sent_to_factory' ||
        req.stage === 'factory_dispatched' ||
        req.stage === 'factory_received' ||
        req.stage === 'goods_received' ||
        req.stage === 'converted_to_bill'
      );
      if (listApprovalFilter === 'approved' && !isReqApproved) return false;
      if (listApprovalFilter === 'pending' && isReqApproved) return false;

      // 7. Factory Role User restriction:
      // "after approved, requisition goes to Approved History page then Factory Role user can see that, other wise not see Factory Role user."
      if (isFactoryRole && !isReqApproved) return false;

      return true;
    });

    return list.slice().sort((a, b) => {
      let comp = 0;
      if (listSortField === 'reqNo') {
        const aNum = a.seqNumber ?? (parseInt((a.reqNo || '').replace(/\D/g, ''), 10) || 0);
        const bNum = b.seqNumber ?? (parseInt((b.reqNo || '').replace(/\D/g, ''), 10) || 0);
        comp = aNum - bNum;
      } else if (listSortField === 'date') {
        const aDate = parseDateToISO(a.date) || parseDateToISO(a.reqDateStr) || a.date || '';
        const bDate = parseDateToISO(b.date) || parseDateToISO(b.reqDateStr) || b.date || '';
        comp = aDate.localeCompare(bDate);
      } else if (listSortField === 'partyName') {
        comp = (a.partyName || a.branchName || '').localeCompare(b.partyName || b.branchName || '');
      } else if (listSortField === 'marketingPerson') {
        const aMp = (a.marketingPersonName || a.createdByName || '').toLowerCase();
        const bMp = (b.marketingPersonName || b.createdByName || '').toLowerCase();
        comp = aMp.localeCompare(bMp);
      } else if (listSortField === 'items') {
        comp = (a.lines || []).length - (b.lines || []).length;
      } else if (listSortField === 'total') {
        comp = (a.totalRequestedQty || 0) - (b.totalRequestedQty || 0);
      } else if (listSortField === 'amount') {
        comp = (a.totalAmount || 0) - (b.totalAmount || 0);
      } else if (listSortField === 'stage') {
        comp = (a.stage || '').localeCompare(b.stage || '');
      } else if (listSortField === 'percentage') {
        comp = (a.percentage || a.discountPercent || 0) - (b.percentage || b.discountPercent || 0);
      }
      return listSortDirection === 'asc' ? comp : -comp;
    });
  }, [
    listScopedRequisitions,
    listStageFilter,
    listMarketingPersonFilter,
    salesCenterFilter,
    listDateFilter,
    customStartDate,
    customEndDate,
    listSearchQuery,
    listSortField,
    listSortDirection,
    listApprovalFilter,
    isFactoryRole,
    parties,
    branches,
    salespersons
  ]);

  // Dedicated filters and state for Approved History page
  const [approvedSearchQuery, setApprovedSearchQuery] = useState('');
  const [approvedStageFilter, setApprovedStageFilter] = useState('All');
  const [approvedMarketingFilter, setApprovedMarketingFilter] = useState('All');
  const [approvedCenterFilter, setApprovedCenterFilter] = useState('All');
  const [approvedDateFilter, setApprovedDateFilter] = useState<StandardPeriodPreset>(() => {
    try { return (sessionStorage.getItem('polycables_req_approved_date_filter') as StandardPeriodPreset) || 'all'; } catch { return 'all'; }
  });
  const [approvedCustomStartDate, setApprovedCustomStartDate] = useState(() => {
    try { return sessionStorage.getItem('polycables_req_approved_start_date') || ''; } catch { return ''; }
  });
  const [approvedCustomEndDate, setApprovedCustomEndDate] = useState(() => {
    try { return sessionStorage.getItem('polycables_req_approved_end_date') || ''; } catch { return ''; }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem('polycables_req_approved_date_filter', approvedDateFilter);
      sessionStorage.setItem('polycables_req_approved_start_date', approvedCustomStartDate);
      sessionStorage.setItem('polycables_req_approved_end_date', approvedCustomEndDate);
    } catch {}
  }, [approvedDateFilter, approvedCustomStartDate, approvedCustomEndDate]);
  const [approvedSortField, setApprovedSortField] = useState<string>('date');
  const [approvedSortDirection, setApprovedSortDirection] = useState<'asc' | 'desc'>('desc');
  const [isReqPrintOptionOpen, setIsReqPrintOptionOpen] = useState<boolean>(false);
  const [reqPrintCopyType, setReqPrintCopyType] = useState<string>('Factory Copy');

  const handleApprovedSort = (field: string) => {
    if (approvedSortField === field) {
      setApprovedSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setApprovedSortField(field);
      setApprovedSortDirection('asc');
    }
  };

  const renderApprovedSortIndicator = (field: string) => {
    const isActive = approvedSortField === field;
    return (
      <span className="inline-flex items-center ml-1 text-[11px] select-none font-mono tracking-tighter">
        <span className={isActive && approvedSortDirection === 'asc' ? 'text-emerald-400 font-extrabold scale-110' : 'text-slate-600 opacity-60'}>▲</span>
        <span className={isActive && approvedSortDirection === 'desc' ? 'text-emerald-400 font-extrabold scale-110' : 'text-slate-600 opacity-60'}>▼</span>
      </span>
    );
  };

  // Requisitions specifically for Approved History page
  const approvedListRequisitions = useMemo(() => {
    return requisitions.filter((req) => {
      // Must be approved!
      const isReqApproved = Boolean(
        req.isApproved ||
        req.stage === 'sent_to_factory' ||
        req.stage === 'factory_dispatched' ||
        req.stage === 'factory_received' ||
        req.stage === 'goods_received' ||
        req.stage === 'converted_to_bill'
      );
      if (!isReqApproved) return false;

      // In Factory role: Approved History shows only pending/remaining orders to deliver;
      // once delivered (or converted to bill), move to Factory Delivered page.
      if (isFactoryRole) {
        const delvQty = Number(req.totalDeliveredQty || 0);
        const appQty = Number(req.totalApprovedQty || req.totalRequestedQty || 0);
        const isDelvDone = Boolean(
          req.deliveryStatus === 'fully_delivered' ||
          req.stage === 'goods_received' ||
          req.stage === 'factory_dispatched' ||
          req.stage === 'converted_to_bill' ||
          req.isLocked ||
          (appQty > 0 && delvQty >= appQty) ||
          (req.deliveryHistory && req.deliveryHistory.length > 0 && (appQty === 0 || delvQty >= appQty))
        );
        if (isDelvDone) return false;
      }

      // Stage filter
      if (approvedStageFilter !== 'All') {
        if (approvedStageFilter === 'converted_to_bill') {
          if (req.stage !== 'converted_to_bill' && !req.isLocked) return false;
        } else if (approvedStageFilter === 'goods_received') {
          if (req.stage !== 'goods_received') return false;
        } else if (approvedStageFilter === 'sent_to_factory') {
          if (req.stage !== 'sent_to_factory' && req.stage !== 'pending_goods' && (req.stage as string) !== 'draft') return false;
        } else if (req.stage !== approvedStageFilter) {
          return false;
        }
      }

      // Sales Center filter
      if (approvedCenterFilter !== 'All') {
        const matchesCenter = doesRequisitionMatchCenter(
          req,
          approvedCenterFilter,
          branches,
          parties,
          salespersons
        );
        if (!matchesCenter) return false;
      }

      // Marketing Person filter
      if (approvedMarketingFilter !== 'All') {
        const targetMp = normalizeMarketingPersonName(approvedMarketingFilter).trim().toLowerCase();
        const reqMp = normalizeMarketingPersonName(req.marketingPersonName || '').trim().toLowerCase();
        const createdMp = normalizeMarketingPersonName(req.createdByName || '').trim().toLowerCase();
        const prepMp = normalizeMarketingPersonName(req.preparedBySignature || '').trim().toLowerCase();
        const partyMatched = parties.find(
          (p) => p.name.trim().toLowerCase() === (req.partyName || req.branchName || '').trim().toLowerCase()
        );
        const partyMp = normalizeMarketingPersonName(partyMatched?.salespersonName || '').trim().toLowerCase();

        if (
          !reqMp.includes(targetMp) &&
          !createdMp.includes(targetMp) &&
          !prepMp.includes(targetMp) &&
          !partyMp.includes(targetMp) &&
          !targetMp.includes(reqMp)
        ) {
          return false;
        }
      }

      // Date filter
      if (approvedDateFilter !== 'all') {
        const reqIsoDate =
          parseDateToISO(req.date) ||
          parseDateToISO(req.reqDateStr) ||
          (req.date ? req.date.substring(0, 10) : '');
        if (!isDateInPeriodRange(reqIsoDate, approvedDateFilter, approvedCustomStartDate, approvedCustomEndDate)) {
          return false;
        }
      }

      // Search query filter
      if (approvedSearchQuery.trim()) {
        const q = approvedSearchQuery.toLowerCase().trim();
        const no = (req.reqNo || '').toLowerCase();
        const pfx = (req.prefix || '').toLowerCase();
        const pName = (req.partyName || req.branchName || '').toLowerCase();
        const creator = (req.createdByName || req.marketingPersonName || '').toLowerCase();
        const dest = (req.toDestination || '').toLowerCase();
        const bName = (req.branchName || '').toLowerCase();
        const remarks = (req.remarks || '').toLowerCase();
        const itemsStr = (req.lines || [])
          .map((l) => `${l.itemCode || ''} ${l.itemName || ''} ${l.description || ''} ${l.remarks || ''}`)
          .join(' ')
          .toLowerCase();

        const matchesQuery =
          no.includes(q) ||
          pfx.includes(q) ||
          pName.includes(q) ||
          creator.includes(q) ||
          dest.includes(q) ||
          bName.includes(q) ||
          remarks.includes(q) ||
          itemsStr.includes(q);

        if (!matchesQuery) return false;
      }

      return true;
    }).slice().sort((a, b) => {
      let comp = 0;
      if (approvedSortField === 'reqNo') {
        const aNum = a.seqNumber ?? (parseInt((a.reqNo || '').replace(/\D/g, ''), 10) || 0);
        const bNum = b.seqNumber ?? (parseInt((b.reqNo || '').replace(/\D/g, ''), 10) || 0);
        comp = aNum - bNum;
      } else if (approvedSortField === 'partyName') {
        comp = (a.partyName || a.branchName || '').localeCompare(b.partyName || b.branchName || '');
      } else if (approvedSortField === 'total') {
        comp = (a.totalRequestedQty || 0) - (b.totalRequestedQty || 0);
      } else if (approvedSortField === 'amount') {
        comp = (a.totalAmount || 0) - (b.totalAmount || 0);
      } else {
        const aIso = parseDateToISO(a.date) || a.date || '';
        const bIso = parseDateToISO(b.date) || b.date || '';
        comp = aIso.localeCompare(bIso);
      }
      return approvedSortDirection === 'asc' ? comp : -comp;
    });
  }, [
    requisitions,
    approvedStageFilter,
    approvedCenterFilter,
    approvedMarketingFilter,
    approvedDateFilter,
    approvedCustomStartDate,
    approvedCustomEndDate,
    approvedSearchQuery,
    approvedSortField,
    approvedSortDirection,
    branches,
    parties,
    salespersons,
    isFactoryRole
  ]);

  const approvedStats = useMemo(() => {
    const list = approvedListRequisitions;
    const totalCount = list.length;
    const totalQty = list.reduce((sum, r) => sum + (r.totalRequestedQty || 0), 0);
    const totalAmount = list.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
    const sentToFactoryCount = list.filter((r) => r.stage === 'sent_to_factory' || r.stage === 'pending_goods' || (r.stage as string) === 'draft').length;
    const dispatchedCount = list.filter((r) => r.stage === 'factory_dispatched').length;
    const goodsReceivedCount = list.filter((r) => r.stage === 'goods_received' || r.stage === 'converted_to_bill').length;
    return { totalCount, totalQty, totalAmount, sentToFactoryCount, dispatchedCount, goodsReceivedCount };
  }, [approvedListRequisitions]);

  const hasActiveApprovedFilters = useMemo(() => {
    return (
      approvedSearchQuery.trim() !== '' ||
      approvedStageFilter !== 'All' ||
      approvedMarketingFilter !== 'All' ||
      approvedCenterFilter !== 'All' ||
      approvedDateFilter !== 'all' ||
      approvedCustomStartDate !== '' ||
      approvedCustomEndDate !== ''
    );
  }, [
    approvedSearchQuery,
    approvedStageFilter,
    approvedMarketingFilter,
    approvedCenterFilter,
    approvedDateFilter,
    approvedCustomStartDate,
    approvedCustomEndDate
  ]);

  const handleResetApprovedFilters = () => {
    setApprovedSearchQuery('');
    setApprovedStageFilter('All');
    setApprovedMarketingFilter('All');
    setApprovedCenterFilter('All');
    setApprovedDateFilter('all');
    setApprovedCustomStartDate('');
    setApprovedCustomEndDate('');
  };

  // Dedicated filters and state for Delivered page
  const [deliveredSearchQuery, setDeliveredSearchQuery] = useState('');
  const [deliveredCenterFilter, setDeliveredCenterFilter] = useState('All');
  const [deliveredMarketingFilter, setDeliveredMarketingFilter] = useState('All');
  const [deliveredDateFilter, setDeliveredDateFilter] = useState<StandardPeriodPreset>(() => {
    try { return (sessionStorage.getItem('polycables_req_delivered_date_filter') as StandardPeriodPreset) || 'all'; } catch { return 'all'; }
  });
  const [deliveredCustomStartDate, setDeliveredCustomStartDate] = useState(() => {
    try { return sessionStorage.getItem('polycables_req_delivered_start_date') || ''; } catch { return ''; }
  });
  const [deliveredCustomEndDate, setDeliveredCustomEndDate] = useState(() => {
    try { return sessionStorage.getItem('polycables_req_delivered_end_date') || ''; } catch { return ''; }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem('polycables_req_delivered_date_filter', deliveredDateFilter);
      sessionStorage.setItem('polycables_req_delivered_start_date', deliveredCustomStartDate);
      sessionStorage.setItem('polycables_req_delivered_end_date', deliveredCustomEndDate);
    } catch {}
  }, [deliveredDateFilter, deliveredCustomStartDate, deliveredCustomEndDate]);
  const [deliveredSortField, setDeliveredSortField] = useState<string>('date');
  const [deliveredSortDirection, setDeliveredSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleDeliveredSort = (field: string) => {
    if (deliveredSortField === field) {
      setDeliveredSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setDeliveredSortField(field);
      setDeliveredSortDirection('asc');
    }
  };

  const renderDeliveredSortIndicator = (field: string) => {
    const isActive = deliveredSortField === field;
    return (
      <span className="inline-flex items-center ml-1 text-[11px] select-none font-mono tracking-tighter">
        <span className={isActive && deliveredSortDirection === 'asc' ? 'text-blue-400 font-extrabold scale-110' : 'text-slate-600 opacity-60'}>▲</span>
        <span className={isActive && deliveredSortDirection === 'desc' ? 'text-blue-400 font-extrabold scale-110' : 'text-slate-600 opacity-60'}>▼</span>
      </span>
    );
  };

  const deliveredListRequisitions = useMemo(() => {
    const list = requisitions.filter((req) => {
      const hasFactoryDelivery = Boolean(
        req.stage === 'goods_received' ||
        req.stage === 'factory_dispatched' ||
        req.deliveryStatus === 'fully_delivered' ||
        req.deliveryStatus === 'partially_delivered' ||
        (req.totalDeliveredQty && req.totalDeliveredQty > 0) ||
        (req.deliveryHistory && req.deliveryHistory.length > 0)
      );
      const isDelivered = isFactoryRole
        ? hasFactoryDelivery
        : Boolean(
            hasFactoryDelivery ||
            req.stage === 'converted_to_bill' ||
            req.stage === 'factory_received' ||
            req.isLocked ||
            req.convertedBillNo ||
            req.convertedBillId
          );
      if (!isDelivered) return false;

      if (deliveredCenterFilter !== 'All') {
        const matchesCenter = doesRequisitionMatchCenter(
          req,
          deliveredCenterFilter,
          branches,
          parties,
          salespersons
        );
        if (!matchesCenter) return false;
      }

      if (deliveredMarketingFilter !== 'All') {
        const targetMp = normalizeMarketingPersonName(deliveredMarketingFilter).trim().toLowerCase();
        const reqMp = normalizeMarketingPersonName(req.marketingPersonName || '').trim().toLowerCase();
        const createdMp = normalizeMarketingPersonName(req.createdByName || '').trim().toLowerCase();
        const prepMp = normalizeMarketingPersonName(req.preparedBySignature || '').trim().toLowerCase();
        if (!reqMp.includes(targetMp) && !createdMp.includes(targetMp) && !prepMp.includes(targetMp) && !targetMp.includes(reqMp)) {
          return false;
        }
      }

      if (deliveredDateFilter !== 'all') {
        const reqIsoDate =
          parseDateToISO(req.date) ||
          parseDateToISO(req.reqDateStr) ||
          (req.date ? req.date.substring(0, 10) : '');
        if (!isDateInPeriodRange(reqIsoDate, deliveredDateFilter, deliveredCustomStartDate, deliveredCustomEndDate)) {
          return false;
        }
      }

      if (deliveredSearchQuery.trim()) {
        const q = deliveredSearchQuery.toLowerCase().trim();
        const no = (req.reqNo || '').toLowerCase();
        const bNo = (req.convertedBillNo || '').toLowerCase();
        const pfx = (req.prefix || '').toLowerCase();
        const pName = (req.partyName || req.branchName || '').toLowerCase();
        const creator = (req.createdByName || req.marketingPersonName || '').toLowerCase();
        const dest = (req.toDestination || '').toLowerCase();
        const bName = (req.branchName || '').toLowerCase();
        const remarks = (req.remarks || '').toLowerCase();

        return (
          no.includes(q) ||
          bNo.includes(q) ||
          pfx.includes(q) ||
          pName.includes(q) ||
          creator.includes(q) ||
          dest.includes(q) ||
          bName.includes(q) ||
          remarks.includes(q)
        );
      }

      return true;
    });

    return list.sort((a, b) => {
      let valA: any = a[deliveredSortField as keyof Requisition];
      let valB: any = b[deliveredSortField as keyof Requisition];
      if (deliveredSortField === 'total') {
        valA = a.totalDeliveredQty || a.totalRequestedQty || 0;
        valB = b.totalDeliveredQty || b.totalRequestedQty || 0;
      } else if (deliveredSortField === 'amount') {
        valA = a.totalAmount || 0;
        valB = b.totalAmount || 0;
      }
      if (valA < valB) return deliveredSortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return deliveredSortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [
    requisitions,
    deliveredCenterFilter,
    deliveredMarketingFilter,
    deliveredDateFilter,
    deliveredCustomStartDate,
    deliveredCustomEndDate,
    deliveredSearchQuery,
    deliveredSortField,
    deliveredSortDirection,
    branches,
    parties,
    salespersons,
    isFactoryRole
  ]);

  const deliveredStats = useMemo(() => {
    const list = deliveredListRequisitions;
    const totalCount = list.length;
    const totalQty = list.reduce((sum, r) => sum + (r.totalDeliveredQty || r.totalRequestedQty || 0), 0);
    const totalAmount = list.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
    const convertedCount = list.filter((r) => r.stage === 'converted_to_bill' || r.isLocked || r.convertedBillNo).length;
    const receivedCount = list.filter((r) => r.stage === 'goods_received').length;
    return { totalCount, totalQty, totalAmount, convertedCount, receivedCount };
  }, [deliveredListRequisitions]);

  const hasActiveDeliveredFilters = useMemo(() => {
    return (
      deliveredSearchQuery.trim() !== '' ||
      deliveredMarketingFilter !== 'All' ||
      deliveredCenterFilter !== 'All' ||
      deliveredDateFilter !== 'all' ||
      deliveredCustomStartDate !== '' ||
      deliveredCustomEndDate !== ''
    );
  }, [
    deliveredSearchQuery,
    deliveredMarketingFilter,
    deliveredCenterFilter,
    deliveredDateFilter,
    deliveredCustomStartDate,
    deliveredCustomEndDate
  ]);

  const handleResetDeliveredFilters = () => {
    setDeliveredSearchQuery('');
    setDeliveredMarketingFilter('All');
    setDeliveredCenterFilter('All');
    setDeliveredDateFilter('all');
    setDeliveredCustomStartDate('');
    setDeliveredCustomEndDate('');
  };

  // Stage Updater
  const handleUpdateRequisitionStage = (reqId: string, newStage: RequisitionStage) => {
    const isConverted = newStage === 'converted_to_bill';
    const isReceived = newStage === 'goods_received';
    const pct = isConverted || isReceived ? 100 : 0;

    const updated = requisitions.map((r) => {
      if (r.id === reqId) {
        return {
          ...r,
          stage: newStage,
          percentage: pct,
          isLocked: isConverted,
          convertedAt: isConverted ? (r.convertedAt || new Date().toISOString()) : r.convertedAt,
          updatedAt: new Date().toISOString()
        };
      }
      return r;
    });
    saveRequisitionsToStorage(updated);
  };

  // Email Sender Modal States
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [activeEmailRequisitionId, setActiveEmailRequisitionId] = useState<string | null>(null);
  const [emailAttachmentName, setEmailAttachmentName] = useState('');
  const [emailAttachmentData, setEmailAttachmentData] = useState('');
  const [emailDefaultSubject, setEmailDefaultSubject] = useState('');
  const [emailDefaultMessage, setEmailDefaultMessage] = useState('');
  const [emailHtmlBody, setEmailHtmlBody] = useState('');
  const [emailToastMsg, setEmailToastMsg] = useState<string | null>(null);

  // WhatsApp Sender Modal States
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [whatsAppAttachmentName, setWhatsAppAttachmentName] = useState('');
  const [whatsAppAttachmentData, setWhatsAppAttachmentData] = useState('');
  const [whatsAppDefaultPhone, setWhatsAppDefaultPhone] = useState('');
  const [whatsAppDefaultMessage, setWhatsAppDefaultMessage] = useState('');
  const [whatsAppPartyName, setWhatsAppPartyName] = useState('');
  const [whatsAppPartyAddress, setWhatsAppPartyAddress] = useState('');

  // Pre-calculate party name counts to disambiguate duplicate party names across the directory
  const partyNameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    (parties || []).forEach((p) => {
      const lower = (p.name || '').trim().toLowerCase();
      if (lower) counts.set(lower, (counts.get(lower) || 0) + 1);
    });
    (branches || []).forEach((b) => {
      const lower = (b.name || '').trim().toLowerCase();
      if (lower) counts.set(lower, (counts.get(lower) || 0) + 1);
    });
    return counts;
  }, [parties, branches]);

  // Helper to format party display with address if duplicate name exists
  const getPartyDisplayWithAddress = (name: string, fallbackAddress?: string): string => {
    if (!name) return '';
    const key = name.trim().toLowerCase();
    const isDup = (partyNameCounts.get(key) || 0) > 1;
    if (isDup) {
      if (fallbackAddress && fallbackAddress.trim()) {
        return `${name}, ${fallbackAddress.trim()}`;
      }
      const matched = (parties || []).find((p) => (p.name || '').trim().toLowerCase() === key && p.address?.trim());
      if (matched?.address) {
        return `${name}, ${matched.address.trim()}`;
      }
    }
    return name;
  };

  // Active branches strictly excluding "Polycables Store & Billing Portal" or main portal
  const activeBranches = useMemo(() => {
    return (branches || []).filter(
      (b) =>
        b.id !== 'branch-main' &&
        !b.name.toLowerCase().includes('polycables store') &&
        !b.name.toLowerCase().includes('billing portal')
    );
  }, [branches]);

  const requisitionPartyLoginScope = useMemo(
    () => getUserLoginFilters(currentUser, salespersons, activeBranches),
    [currentUser, salespersons, activeBranches]
  );
  const requisitionPartyScopeBranch =
    requisitionPartyLoginScope.isRestricted &&
    requisitionPartyLoginScope.branchId &&
    !['all', 'all sales centers'].includes(requisitionPartyLoginScope.branchId.toLowerCase().trim())
      ? requisitionPartyLoginScope.branchId
      : requisitionPartyLoginScope.isRestricted &&
          requisitionPartyLoginScope.branchName &&
          !['all', 'all sales centers'].includes(requisitionPartyLoginScope.branchName.toLowerCase().trim())
        ? requisitionPartyLoginScope.branchName
        : null;

  const initialSalesCenter = useMemo(() => {
    const init = getUserLoginFilters(currentUser, salespersons, activeBranches);
    if (init.branchName && !init.branchName.toLowerCase().includes('polycables')) {
      const match = activeBranches.find((b) => b.name.toLowerCase().trim() === init.branchName?.toLowerCase().trim() || b.id === init.branchId);
      return match ? match.name : init.branchName;
    }
    if (activeBranches.length > 0) return activeBranches[0].name;
    return 'Madhupur Sales Center';
  }, [currentUser, salespersons, activeBranches]);

  const [selectedSalesCenter, setSelectedSalesCenter] = useState<string>(() => {
    const init = getUserLoginFilters(currentUser, salespersons, branches);
    if (init.branchName && !init.branchName.toLowerCase().includes('polycables')) {
      const match = branches.find((b) => b.name.toLowerCase().trim() === init.branchName?.toLowerCase().trim() || b.id === init.branchId);
      return match ? match.name : init.branchName;
    }
    const cleanList = (branches || []).filter(b => b.id !== 'branch-main' && !b.name.toLowerCase().includes('polycables'));
    if (cleanList.length > 0) return cleanList[0].name;
    return 'Madhupur Sales Center';
  });

  // Initial sequence calculation: each sales center starts from 01
  const initialSequence = useMemo(() => {
    return getNextSeqForSalesCenter(selectedSalesCenter, requisitions, activeBranches);
  }, [selectedSalesCenter, requisitions, activeBranches]);

  // ==========================================
  // FORM STATES (Defaults to logged-in user or Subrata, allows blanking & auto-increment)
  // ==========================================
  const [marketingPerson, setMarketingPerson] = useState<string>(() => {
    return loggedInSalespersonName || 'Subrata';
  });

  useEffect(() => {
    if (loggedInSalespersonName && !isSuperAdmin) {
      setMarketingPerson(loggedInSalespersonName);
    }
  }, [loggedInSalespersonName, isSuperAdmin]);

  const [reqPrefix, setReqPrefix] = useState<string>('');
  const [reqSequence, setReqSequence] = useState<number | string>(() => {
    const initCenter = (() => {
      const init = getUserLoginFilters(currentUser, salespersons, branches);
      if (init.branchName) {
        const match = branches.find((b) => b.name.toLowerCase().trim() === init.branchName?.toLowerCase().trim() || b.id === init.branchId);
        return match ? match.name : init.branchName;
      }
      if (branches.length > 0) return branches[0].name;
      return 'Madhupur Sales Center';
    })();
    const nextSeq = getNextSeqForSalesCenter(initCenter, requisitions, branches);
    return nextSeq < 10 ? String(nextSeq).padStart(2, '0') : String(nextSeq);
  });
  const [toDestination, setToDestination] = useState(() => {
    const init = getUserLoginFilters(currentUser, salespersons, branches);
    if (init.branchName) {
      const match = branches.find((b) => b.name.toLowerCase().trim() === init.branchName?.toLowerCase().trim() || b.id === init.branchId);
      return match ? match.name : init.branchName;
    }
    if (branches.length > 0) return branches[0].name;
    return 'Factory';
  });

  const lastReqUserKeyRef = useRef<string>('');
  useEffect(() => {
    if (editingRequisitionId) return;
    const userKey = `${currentUser?.username || ''}::${currentUser?.salespersonCode || ''}::${currentUser?.branchId || ''}::${currentUser?.role || ''}`;
    const userChanged = lastReqUserKeyRef.current !== '' && lastReqUserKeyRef.current !== userKey;
    const isInitial = lastReqUserKeyRef.current === '';
    lastReqUserKeyRef.current = userKey;

    if (!userChanged && !isInitial) return;

    const init = getUserLoginFilters(currentUser, salespersons, branches);
    if (init.branchName) {
      const match = branches.find(
        (b) =>
          b.name.toLowerCase().trim() === init.branchName?.toLowerCase().trim() ||
          b.id === init.branchId
      );
      const targetDest = match ? match.name : init.branchName;
      if (targetDest) {
        setToDestination(targetDest);
        const nextSeq = getNextSeqForSalesCenter(targetDest, requisitions, branches);
        setReqSequence(nextSeq < 10 ? String(nextSeq).padStart(2, '0') : String(nextSeq));
      }
    } else if (userChanged && branches.length > 0) {
      const fallbackDest = branches[0].name;
      setToDestination(fallbackDest);
      const nextSeq = getNextSeqForSalesCenter(fallbackDest, requisitions, branches);
      setReqSequence(nextSeq < 10 ? String(nextSeq).padStart(2, '0') : String(nextSeq));
    }

    if (userChanged && init.salesmanName) {
      setMarketingPerson(init.salesmanName);
    }
  }, [currentUser, salespersons, branches, requisitions, editingRequisitionId]);
  const [partyName, setPartyName] = useState('');
  const [partyAddress, setPartyAddress] = useState('');
  const [deliverySite, setDeliverySite] = useState('');
  const [reqDate, setReqDate] = useState(() => getTodayDDMMYY());
  const [delvDate, setDelvDate] = useState(() => getTodayDDMMYY());

  // Autocomplete & Dropdown states
  const [partySearchOpen, setPartySearchOpen] = useState(false);
  const [partyHighlightedIndex, setPartyHighlightedIndex] = useState(0);
  const partySearchRef = useRef<HTMLDivElement>(null);
  const partyListContainerRef = useRef<HTMLDivElement>(null);

  // Color Quantity Input Modal State
  const [colorModalState, setColorModalState] = useState<{
    isOpen: boolean;
    lineId: string;
    item: Item;
    unit: string;
    initialColors?: Partial<ColorBreakdownData>;
    initialTotalQty?: number;
  } | null>(null);

  // Table Autocomplete State
  const [activeItemSearchRowId, setActiveItemSearchRowId] = useState<string | null>(null);
  const [itemHighlightedIndex, setItemHighlightedIndex] = useState(0);
  const itemListContainerRef = useRef<{ [rowId: string]: HTMLDivElement | null }>({});

  useEffect(() => {
    if (!partySearchOpen || !partyListContainerRef.current) return;
    const el = partyListContainerRef.current.querySelector('[data-req-party-highlighted="true"]') as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [partyHighlightedIndex, partySearchOpen]);

  useEffect(() => {
    if (!activeItemSearchRowId) return;
    const container = itemListContainerRef.current[activeItemSearchRowId];
    if (!container) return;
    const el = container.querySelector('[data-req-item-highlighted="true"]') as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [itemHighlightedIndex, activeItemSearchRowId]);

  // Helper to create blank requisition lines (default 5 lines: show 5 lines first, next auto add line)
  const createBlankRequisitionLines = (count = 5): RequisitionEntryLine[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `line-${i + 1}`,
      description: '',
      unit: 'Coils',
      red: '',
      black: '',
      yellow: '',
      green: '',
      blue: '',
      quantity: 0,
      remarks: '',
      isSpecialItem: false,
      rate: 0,
      amount: 0
    }));
  };

  // Financial Summary States
  const [discountPercent, setDiscountPercent] = useState<number>(10);
  const [discountEffectiveDate, setDiscountEffectiveDate] = useState<string>(() => {
    try {
      const savedActiveDate = localStorage.getItem('polycables_active_effective_date');
      if (savedActiveDate) return savedActiveDate;
      const savedSnapshots = localStorage.getItem('polycables_price_snapshots');
      if (savedSnapshots) {
        const parsed = JSON.parse(savedSnapshots);
        const active = Array.isArray(parsed) ? parsed.find((s: any) => s.isActive) : null;
        if (active && active.effectiveDate) return active.effectiveDate;
      }
    } catch (e) {}
    return '10.08.26';
  });
  const [customerCurrentDue, setCustomerCurrentDue] = useState<number>(0);
  const [manualGrossAmountOverride, setManualGrossAmountOverride] = useState<number | null>(null);
  const [manualDiscountAmountOverride, setManualDiscountAmountOverride] = useState<number | null>(null);

  // Signatures State (Prepared By editable by Super Admin, Approved By auto-set from Default Approver)
  const DEFAULT_APPROVER_NAME = '';
  const isUnassignedFakeApprover = (val?: string | null) =>
    Boolean(val && val.toLowerCase().includes('mahmudul hasan'));

  const [defaultApprover, setDefaultApprover] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('polycables_default_approver');
      if (saved && saved.trim()) {
        if (isUnassignedFakeApprover(saved)) {
          localStorage.removeItem('polycables_default_approver');
          return DEFAULT_APPROVER_NAME;
        }
        return saved.trim();
      }
    } catch {}
    return DEFAULT_APPROVER_NAME;
  });

  const [reqBySignature, setReqBySignature] = useState('Subrata');
  const [preparedBySignature, setPreparedBySignature] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('polycables_req_prepared_by');
      if (saved && saved.trim()) return saved.trim();
    } catch {}
    return userDirectoryNames[0] || loggedInSalespersonName || '';
  });
  const [checkedBySignature, setCheckedBySignature] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('polycables_req_checked_by');
      if (saved !== null) return saved;
    } catch {}
    return '';
  });
  const [approvedBySignature, setApprovedBySignature] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('polycables_req_approved_by');
      if (saved && saved.trim()) {
        if (isUnassignedFakeApprover(saved)) {
          localStorage.removeItem('polycables_req_approved_by');
        } else {
          return saved.trim();
        }
      }
      const savedDefault = localStorage.getItem('polycables_default_approver');
      if (savedDefault && savedDefault.trim() && !isUnassignedFakeApprover(savedDefault)) {
        return savedDefault.trim();
      }
    } catch {}
    return DEFAULT_APPROVER_NAME;
  });

  const [isApproverModalOpen, setIsApproverModalOpen] = useState(false);
  const [tempApproverInput, setTempApproverInput] = useState(() => defaultApprover || DEFAULT_APPROVER_NAME);

  const handleSaveDefaultApprover = (newName: string) => {
    const clean = newName.trim() || DEFAULT_APPROVER_NAME;
    setDefaultApprover(clean);
    setApprovedBySignature(clean);
    try {
      localStorage.setItem('polycables_default_approver', clean);
      localStorage.setItem('polycables_req_approved_by', clean);
    } catch {}
    setIsApproverModalOpen(false);
  };

  // Focus Navigation Refs
  const reqPrefixInputRef = useRef<HTMLInputElement>(null);
  const reqSeqInputRef = useRef<HTMLInputElement>(null);
  const partyInputRef = useRef<HTMLInputElement>(null);
  const discountInputRef = useRef<HTMLInputElement>(null);
  const discountAmountInputRef = useRef<HTMLInputElement>(null);
  const saveOnlyButtonRef = useRef<HTMLButtonElement>(null);
  const dueInputRef = useRef<HTMLInputElement>(null);

  const itemInputRefs = useRef<{ [id: string]: HTMLInputElement | null }>({});
  const qtyInputRefs = useRef<{ [id: string]: HTMLInputElement | null }>({});
  const unitInputRefs = useRef<{ [id: string]: HTMLSelectElement | null }>({});
  const redInputRefs = useRef<{ [id: string]: HTMLInputElement | null }>({});
  const blackInputRefs = useRef<{ [id: string]: HTMLInputElement | null }>({});
  const yellowInputRefs = useRef<{ [id: string]: HTMLInputElement | null }>({});
  const greenInputRefs = useRef<{ [id: string]: HTMLInputElement | null }>({});
  const blueInputRefs = useRef<{ [id: string]: HTMLInputElement | null }>({});
  const remarksInputRefs = useRef<{ [id: string]: HTMLInputElement | null }>({});

  // Initial Requisition Line items: Starts with 5 lines (show 5 line first, next auto add line)
  const [lines, setLines] = useState<RequisitionEntryLine[]>(() => createBlankRequisitionLines(5));

  // Sync Req # format: e.g. "req # 01-Subrata", with prefix strictly "PREFIX-SEQ" (e.g. "SHN-06"), or blank if explicitly cleared
  const formattedReqNo = useMemo(() => {
    if (reqSequence === '' || reqSequence === undefined || reqSequence === null) {
      return '';
    }
    const num = Number(reqSequence);
    const seqStr = !isNaN(num) && num > 0 ? (num < 10 ? String(num).padStart(2, '0') : String(num)) : String(reqSequence);
    const pfx = (reqPrefix || '').trim();
    if (pfx) {
      // If prefix is used, format strictly as PREFIX-SEQ (e.g. SHN-06), without extra "req #" or marketing person
      const cleanPfx = pfx.replace(/[-/]+$/, '').trim();
      return `${cleanPfx}-${seqStr}`;
    }
    const basePart = marketingPerson ? `${seqStr}-${marketingPerson}` : `${seqStr}`;
    return `req # ${basePart}`;
  }, [reqSequence, marketingPerson, reqPrefix]);

  // Helper to compute party's real-time current due from customer directory (opening balance), bills, collections, and returns
  // Matches the exact calculation logic from Customer Sales & Collection page and Customer Ledgers view (Opening Balance + Bills - Collections - Returns)
  const calculatePartyCurrentDue = (name: string, partyObj?: Party): number => {
    if (!name || !name.trim()) return 0;
    const targetParty = partyObj || parties.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
    
    // 1. Opening Balance from Customer Directory
    const openingDue = Number(targetParty?.openingBalance || 0);

    // 2. Stored Bills Debits (Invoices/Sales)
    const matchingBills = storedBills.filter(
      (b) => (b.partyName || b.header?.partyName || '').trim().toLowerCase() === name.trim().toLowerCase()
    );
    const billsTotal = matchingBills.reduce((sum, b) => sum + (b.grandTotal || b.netAmount || 0), 0);

    // 3. Collections (Money Receipts) Credits
    const matchingCollections = (collections || []).filter((c) => {
      const isSettlement = c.isYearClosingCollection ||
        (c.remarks && (c.remarks.includes('Year-End Settlement') || c.remarks.includes('Year-End Closing') || c.remarks.includes('Closing Settlement') || /^FY\s*20\d\d/i.test(c.remarks.trim()))) ||
        (c.mrNo && (c.mrNo.startsWith('MR-CLOSE') || c.mrNo.startsWith('YE-Close')));
      if (isSettlement) return false;
      return (c.partyName || '').trim().toLowerCase() === name.trim().toLowerCase();
    });
    const collectionsTotal = matchingCollections.reduce((sum, c) => sum + (c.amount || 0), 0);

    // 4. Stock Returns Credits (Party Returns)
    const matchingReturns = (stockReturns || []).filter((r) => {
      const pName = r.partyName || (r as any).entityName || '';
      const isPartyReturn = r.returnType === 'party_return' || (r as any).type === 'party_return';
      return isPartyReturn && pName.trim().toLowerCase() === name.trim().toLowerCase();
    });
    const returnsTotal = matchingReturns.reduce((sum, r) => sum + (r.totalAmount || (r as any).totalRefundAmount || 0), 0);

    // Exact Ledger Closing Balance: Opening Balance + Bills - Collections - Returns (e.g. Sattar Electric: ৳-3,67,956)
    const computedDue = openingDue + billsTotal - collectionsTotal - returnsTotal;
    return computedDue;
  };

  // Auto-calculate customer current due on initial load or when customer directory/party updates
  useEffect(() => {
    if (partyName) {
      const matched = parties.find((p) => p.name.trim().toLowerCase() === partyName.trim().toLowerCase());
      const autoDue = calculatePartyCurrentDue(partyName, matched);
      setCustomerCurrentDue(autoDue);
    }
  }, [partyName, parties, storedBills, collections, stockReturns]);

  // Update signatures when marketing person changes
  useEffect(() => {
    setReqBySignature(marketingPerson);
  }, [marketingPerson]);

  // Initial focus on Req # field on load or tab switch
  useEffect(() => {
    if (activeTab === 'entry_slip') {
      const timer = setTimeout(() => {
        reqSeqInputRef.current?.focus();
        reqSeqInputRef.current?.select();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeTab]);

  // Close party dropdown or item search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Close party search dropdown if click is outside partySearchRef
      if (partySearchRef.current && !partySearchRef.current.contains(target as Node)) {
        setPartySearchOpen(false);
      }

      // Close item search dropdown if click is outside active item's cell or dropdown
      if (activeItemSearchRowId) {
        const activeContainer = itemListContainerRef.current[activeItemSearchRowId];
        const activeInput = itemInputRefs.current[activeItemSearchRowId];
        const isInsideDropdown = activeContainer && activeContainer.contains(target as Node);
        const isInsideInput = activeInput && (activeInput === target || activeInput.contains(target as Node));
        const isInsideActiveCell = Boolean(target.closest(`[data-item-row-id="${activeItemSearchRowId}"]`));

        if (!isInsideDropdown && !isInsideInput && !isInsideActiveCell) {
          setActiveItemSearchRowId(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [activeItemSearchRowId]);

  // Auto-scroll highlighted party item into view in dropdown
  useEffect(() => {
    if (partySearchOpen && partyListContainerRef.current) {
      const activeEl = partyListContainerRef.current.children[partyHighlightedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [partyHighlightedIndex, partySearchOpen]);

  // Listen for AI Forecast Draft Requisitions
  useEffect(() => {
    const checkForecastDraft = () => {
      try {
        const savedDraft = localStorage.getItem('polycables_ai_forecast_requisition_draft');
        if (savedDraft) {
          const parsed = JSON.parse(savedDraft);
          if (parsed && Array.isArray(parsed.lines) && parsed.lines.length > 0) {
            setEditingRequisitionId(null);
            setPartyName(parsed.partyName || 'Madhupur Sales Center');
            setPartyAddress(parsed.partyAddress || 'Madhupur, Tangail');
            if (parsed.toDestination) setToDestination(parsed.toDestination);
            if (parsed.deliverySite) setDeliverySite(parsed.deliverySite);
            if (parsed.discountPercent !== undefined) setDiscountPercent(parsed.discountPercent);
            
            // Map lines to ensure required IDs and empty color columns if absent
            const formattedLines = parsed.lines.map((l: any, idx: number) => ({
              id: l.id || `line-${Date.now()}-${idx}`,
              description: l.description || '',
              unit: l.unit || 'Coils',
              quantity: Number(l.quantity) || 0,
              rate: Number(l.rate) || 0,
              amount: Number(l.amount) || 0,
              remarks: (l.remarks && l.remarks.startsWith('AI ') && l.remarks.includes('Forecast')) ? '' : (l.remarks || ''),
              isSpecialItem: Boolean(l.isSpecialItem),
              red: l.red || '',
              black: l.black || '',
              yellow: l.yellow || '',
              green: l.green || '',
              blue: l.blue || ''
            }));
            
            setLines(formattedLines);
            setActiveTab('entry_slip');
            localStorage.removeItem('polycables_ai_forecast_requisition_draft');
          }
        }
      } catch (e) {
        console.error('Error reading AI forecast draft requisition:', e);
      }
    };

    checkForecastDraft();
    window.addEventListener('focus', checkForecastDraft);
    return () => window.removeEventListener('focus', checkForecastDraft);
  }, []);

  // Delete Requisition State
  const [deletingRequisition, setDeletingRequisition] = useState<Requisition | null>(null);

  // Save requisitions helper
  const saveRequisitionsToStorage = (updated: Requisition[], isBypassGuard = false) => {
    if (!isBypassGuard && !checkCanTakeEntry('Requisition')) return;
    setRequisitions(updated);
    setLocalRequisitions(updated);
    try {
      localStorage.setItem('polycables_requisitions', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
    if (onSyncCloud) {
      onSyncCloud({ requisitions: updated }, true);
    }
  };

  const confirmDeleteRequisition = () => {
    if (!deletingRequisition) return;
    const req = deletingRequisition;
    // Move to unified Trash
    moveToTrash('polycables_trashed_requisitions', req, 'Requisitions');
    const deletedIds: string[] = [];
    if (req.id) {
      recordDeletedEntityId(req.id);
      deletedIds.push(req.id);
    }
    if (req.reqNo) {
      recordDeletedEntityId(req.reqNo);
      deletedIds.push(req.reqNo);
    }
    const updated = requisitions.filter(
      (r) => r.id !== req.id && (!req.reqNo || r.reqNo !== req.reqNo)
    );
    saveRequisitionsToStorage(updated, true);
    if (deletedIds.length > 0) {
      fetch('/api/sync/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: deletedIds, type: 'requisition' })
      }).catch(() => {});
      if (onSyncCloud) {
        onSyncCloud({ requisitions: updated, deletedEntityIds: deletedIds }, true);
      }
    }
    setDeletingRequisition(null);
  };

  // Excel Item Import & Problem Diagnostic State
  const [excelPasteProblems, setExcelPasteProblems] = useState<Array<{ item: string; problem: string; fix: string }>>([]);
  const [showExcelProblemModal, setShowExcelProblemModal] = useState<boolean>(false);
  const [excelPasteSuccessCount, setExcelPasteSuccessCount] = useState<number>(0);
  const [showExcelPasteInputModal, setShowExcelPasteInputModal] = useState<boolean>(false);
  const [excelPasteInputText, setExcelPasteInputText] = useState<string>('');

  // Helper to determine sales center for any party or branch showroom
  const getSalesCenterForParty = (p: Party | (Party & { isSalesCenter?: boolean; inChargeName?: string })): string => {
    // 1. If it's a sales center directly
    if ((p as any).isSalesCenter) {
      return p.name;
    }
    // 2. If party name matches an active branch
    const branchByName = activeBranches.find(
      (b) => cleanBranchName(b.name).toLowerCase() === cleanBranchName(p.name).toLowerCase()
    );
    if (branchByName) return branchByName.name;

    // 3. If party has explicit branchName
    if (p.branchName) {
      const bMatch = activeBranches.find(
        (b) => cleanBranchName(b.name).toLowerCase() === cleanBranchName(p.branchName!).toLowerCase()
      );
      if (bMatch) return bMatch.name;
      return p.branchName;
    }

    // 4. If party has branchId
    if (p.branchId) {
      const bMatch = activeBranches.find((b) => b.id === p.branchId);
      if (bMatch) return bMatch.name;
    }

    // 5. If salesperson is assigned to party, check salesperson's branch
    const sp = (salespersons || []).find(
      (s) =>
        (p.salesmanCode && s.code.toLowerCase() === p.salesmanCode.toLowerCase()) ||
        (p.salespersonName && s.name.toLowerCase() === p.salespersonName.toLowerCase())
    );
    if (sp?.branchName) {
      const bMatch = activeBranches.find(
        (b) => cleanBranchName(b.name).toLowerCase() === cleanBranchName(sp.branchName!).toLowerCase()
      );
      if (bMatch) return bMatch.name;
      return sp.branchName;
    }

    // 6. Check if address mentions any sales center
    if (p.address) {
      const bMatch = activeBranches.find((b) =>
        cleanBranchName(p.address!).toLowerCase().includes(cleanBranchName(b.name).toLowerCase())
      );
      if (bMatch) return bMatch.name;
    }

    // Fallback to currently selected sales center or first active branch
    return selectedSalesCenter || (activeBranches.length > 0 ? activeBranches[0].name : 'Madhupur Sales Center');
  };

  // Party Selection Handler
  const handleSelectParty = (p: Party) => {
    const isDuplicateName = (partyNameCounts.get((p.name || '').trim().toLowerCase()) || 0) > 1;
    const finalPartyName = isDuplicateName && p.address?.trim() ? `${p.name}, ${p.address.trim()}` : p.name;
    setPartyName(finalPartyName);
    setPartyAddress(p.address || '');

    let inChargeOrSp = (p as any).inChargeName || p.salespersonName;
    if (!inChargeOrSp && p.salesmanCode) {
      const matchedSp = salespersons.find(
        (s) => s.code.toLowerCase() === (p.salesmanCode || '').toLowerCase()
      );
      if (matchedSp) inChargeOrSp = matchedSp.name;
    }
    if (inChargeOrSp && inChargeOrSp.trim()) {
      const normalizedSp = normalizeMarketingPersonName(inChargeOrSp.trim());
      setMarketingPerson(normalizedSp);
      setReqBySignature(normalizedSp);
    }

    // Resolve which sales center this party or showroom belongs to
    const center = getSalesCenterForParty(p);
    setSelectedSalesCenter(center);
    setSalesCenterFilter(center);

    if ((p as any).isSalesCenter) {
      setToDestination('Factory');
      setDeliverySite(p.address || `${p.name}, Poly Cables`);
    } else {
      setToDestination(center);
    }

    // Every sales center has its own serial start from 01
    const nextSeq = getNextSeqForSalesCenter(center, requisitions, activeBranches);
    setReqSequence(nextSeq < 10 ? String(nextSeq).padStart(2, '0') : String(nextSeq));

    setPartySearchOpen(false);

    // Auto-fill customer current due directly from customer directory (openingBalance) and ledger history
    const autoDue = calculatePartyCurrentDue(p.name, p);
    setCustomerCurrentDue(autoDue);

    // After selecting party: if total quantity is 0 or user has rows, focus first item name input
    setTimeout(() => {
      const firstLineId = lines[0]?.id;
      if (firstLineId && itemInputRefs.current[firstLineId]) {
        itemInputRefs.current[firstLineId]?.focus();
        itemInputRefs.current[firstLineId]?.select();
        setActiveItemSearchRowId(firstLineId);
      }
    }, 80);
  };

  // Line item handlers
  const handleAddLine = (customId?: string) => {
    const nextLineId = customId || `line-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const nextLine: RequisitionEntryLine = {
      id: nextLineId,
      description: '',
      unit: 'Coils',
      red: '',
      black: '',
      yellow: '',
      green: '',
      blue: '',
      quantity: 0,
      remarks: '',
      isSpecialItem: false,
      rate: 0,
      amount: 0
    };
    setLines((prev) => [...prev, nextLine]);
    return nextLineId;
  };

  const handleAddFiveLines = () => {
    const newFive: RequisitionEntryLine[] = Array.from({ length: 5 }, (_, i) => ({
      id: `line-${Date.now()}-${i + 1}-${Math.random().toString(36).substring(2, 6)}`,
      description: '',
      unit: 'Coils',
      red: '',
      black: '',
      yellow: '',
      green: '',
      blue: '',
      quantity: 0,
      remarks: '',
      isSpecialItem: false,
      rate: 0,
      amount: 0
    }));
    setLines((prev) => [...prev, ...newFive]);
  };

  const handleRemoveLine = (id: string) => {
    setLines((prev) => {
      if (prev.length <= 1) {
        // Keep at least one empty line
        return [
          {
            id: `line-${Date.now()}`,
            description: '',
            unit: 'Coils',
            red: '',
            black: '',
            yellow: '',
            green: '',
            blue: '',
            quantity: 0,
            remarks: '',
            isSpecialItem: false,
            rate: 0,
            amount: 0
          }
        ];
      }
      return prev.filter((l) => l.id !== id);
    });
  };

  const handleUpdateLine = (id: string, field: keyof RequisitionEntryLine, value: any) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;

        const updated: RequisitionEntryLine = { ...line, [field]: value };
        const isRe = isReCableItem(updated.description);

        // Check if item is special (e.g. 500m length variant / bobin)
        if (field === 'description') {
          const descLower = (updated.description || '').toLowerCase();
          if (
            descLower.includes('bobin') ||
            descLower.includes('500 m length') ||
            descLower.includes('500m length')
          ) {
            updated.isSpecialItem = true;
          }
        }

        // Unit conversion: Bobin to Coils (1 Bobin = 5 Coils), Coils to Bobin (5 Coils = 1 Bobin)
        if (field === 'unit') {
          const oldUnit = (line.unit || '').trim().toLowerCase();
          const newUnit = (String(value) || '').trim().toLowerCase();

          if (oldUnit === 'bobin' && (newUnit === 'coils' || newUnit === 'coil')) {
            const curQty = Number(line.quantity) || 0;
            updated.quantity = curQty * 5;
            if (Number(line.red) > 0) updated.red = Number(line.red) * 5;
            if (Number(line.black) > 0) updated.black = Number(line.black) * 5;
            if (Number(line.yellow) > 0) updated.yellow = Number(line.yellow) * 5;
            if (Number(line.green) > 0) updated.green = Number(line.green) * 5;
            if (Number(line.blue) > 0) updated.blue = Number(line.blue) * 5;
          } else if ((oldUnit === 'coils' || oldUnit === 'coil') && newUnit === 'bobin') {
            const curQty = Number(line.quantity) || 0;
            updated.quantity = Math.max(1, Math.round(curQty / 5));
            if (Number(line.red) > 0) updated.red = Math.max(1, Math.round(Number(line.red) / 5));
            if (Number(line.black) > 0) updated.black = Math.max(1, Math.round(Number(line.black) / 5));
            if (Number(line.yellow) > 0) updated.yellow = Math.max(1, Math.round(Number(line.yellow) / 5));
            if (Number(line.green) > 0) updated.green = Math.max(1, Math.round(Number(line.green) / 5));
            if (Number(line.blue) > 0) updated.blue = Math.max(1, Math.round(Number(line.blue) / 5));
          }
        }

        // If item is RE cable: colors do NOT work / are cleared, only quantity is active input
        if (isRe) {
          updated.red = '';
          updated.black = '';
          updated.yellow = '';
          updated.green = '';
          updated.blue = '';
        } else {
          // Auto calculate total quantity from colors if colors are entered for non-RE items
          const redNum = Number(updated.red) || 0;
          const blackNum = Number(updated.black) || 0;
          const yellowNum = Number(updated.yellow) || 0;
          const greenNum = Number(updated.green) || 0;
          const blueNum = Number(updated.blue) || 0;
          const colorSum = redNum + blackNum + yellowNum + greenNum + blueNum;

          if (colorSum > 0 && field !== 'quantity' && field !== 'unit') {
            updated.quantity = colorSum;
          }
        }

        // Recalculate amount
        if (updated.rate > 0) {
          updated.amount = updated.rate * (updated.quantity || 0);
        }

        return updated;
      })
    );
  };

  // Handler: When user enters / pastes item names from Excel, take ALL items
  // and diagnose any problems with clear explanations and actionable fixes.
  const handlePasteItemsFromExcel = (targetLineId: string, pastedText: string) => {
    if (!pastedText || !pastedText.trim()) {
      setExcelPasteSuccessCount(0);
      setExcelPasteProblems([
        {
          item: 'Empty Clipboard / Input',
          problem: 'No item names were found in the pasted Excel content.',
          fix: 'Copy one or more item cells/rows from Excel (Ctrl+C) and paste again (Ctrl+V).'
        }
      ]);
      setShowExcelProblemModal(true);
      return;
    }

    const allRawLines = pastedText.split(/\r?\n/);
    const problems: Array<{ item: string; problem: string; fix: string }> = [];
    const newItemsToAdd: RequisitionEntryLine[] = [];

    // Strict header row check (only skip if cell is literally a column title, NEVER skip real cable/wire items)
    const isPureHeaderRow = (cells: string[]): boolean => {
      const normalized = cells.map((c) => c.trim().toLowerCase());
      const exactHeaderLabels = new Set([
        'sl', 'sl.', 'sl no', 'sl. no.', 's/n', 'serial',
        'item', 'item name', 'items', 'item description', 'description', 'description of goods', 'particulars', 'product name',
        'unit', 'uom', 'qty', 'quantity', 'coils', 'coil', 'rate', 'price', 'amount', 'total',
        'red', 'black', 'yellow', 'green', 'blue', 'remarks'
      ]);
      const matchCount = normalized.filter((c) => exactHeaderLabels.has(c)).length;
      if (normalized.length === 1) {
        return exactHeaderLabels.has(normalized[0]);
      }
      return matchCount >= 2;
    };

    // Fuzzy & clean match helper
    const findItemMatch = (rawStr: string): Item | undefined => {
      if (!rawStr) return undefined;
      const clean = rawStr.trim().toLowerCase();
      // 1. Exact name match
      let found = items.find((it) => it.name.trim().toLowerCase() === clean);
      if (found) return found;
      // 2. Exact code match
      found = items.find((it) => (it.code || '').trim().toLowerCase() === clean);
      if (found) return found;
      // 3. Normalized / alphanumeric match
      const norm = clean.replace(/[^a-z0-9]/g, '');
      if (norm.length >= 2) {
        found = items.find((it) => it.name.toLowerCase().replace(/[^a-z0-9]/g, '') === norm);
        if (found) return found;
      }
      // 4. Token-aware & substring inclusion
      found = items.find((it) => it.name.toLowerCase().includes(clean) || (clean.length >= 4 && clean.includes(it.name.toLowerCase())));
      return found;
    };

    allRawLines.forEach((rawLine, rowIdx) => {
      const rowNum = rowIdx + 1;
      if (!rawLine || !rawLine.trim()) return;

      const tabParts = rawLine.split('\t').map((p) => p.trim());
      if (rowIdx === 0 && isPureHeaderRow(tabParts.filter(Boolean))) {
        return; // Skip header row cleanly
      }

      let candidate = '';
      let qtyCandidate = 0;
      let unitCandidate: string | undefined;
      let rateOverride: number | undefined;

      if (rawLine.includes('\t')) {
        const nonEmpty = tabParts.filter((p) => p.length > 0);
        if (nonEmpty.length === 0) return;

        // Identify description column (first non-pure-number, non-unit-only column; skip leading SL number like "1" or "01.")
        const unitWords = new Set(['coil', 'coils', 'bobin', 'pcs', 'mtr', 'meter', 'box', 'pkt', 'set', 'roll']);
        for (let cIdx = 0; cIdx < nonEmpty.length; cIdx++) {
          const cell = nonEmpty[cIdx];
          const strippedSl = cell.replace(/^\d+[\.\)]\s*/, '');
          const isPureNum = /^[\d,]+(\.\d+)?$/.test(cell.replace(/৳|tk\.?/gi, '').trim());
          if (!candidate && !isPureNum && !unitWords.has(cell.toLowerCase()) && strippedSl.length > 0) {
            candidate = cell;
            continue;
          }
          if (unitWords.has(cell.toLowerCase()) && !unitCandidate) {
            unitCandidate = cell;
            continue;
          }
          const cleanedNumStr = cell.replace(/[৳,\s]|tk\.?/gi, '');
          if (/^\d+(\.\d+)?$/.test(cleanedNumStr)) {
            const val = parseFloat(cleanedNumStr);
            if (!candidate && cIdx === 0 && nonEmpty.length > 1) {
              // Leading SL number — ignore
              continue;
            }
            if (qtyCandidate === 0 && val > 0 && val < 50000) {
              qtyCandidate = val;
            } else if (rateOverride === undefined && val > 0) {
              rateOverride = val;
            }
          }
        }
        // Fallback: if every cell looked numeric/short, STILL take the first cell as item name so nothing is dropped!
        if (!candidate) {
          candidate = nonEmpty[0];
        }
      } else {
        candidate = rawLine.trim();
      }

      // Only strip leading serial prefix like "1. " or "02) " if what follows is non-numeric item text (never strip "1.5 RM"!)
      if (/^\d{1,3}[\.\)]\s+[A-Za-z0-9]/.test(candidate) && !/^\d+\.\d+\s*(rm|re|sq|mm|x|\*)/i.test(candidate)) {
        candidate = candidate.replace(/^\d{1,3}[\.\)]\s+/, '').trim();
      }

      if (!candidate) {
        problems.push({
          item: `Excel Row ${rowNum}`,
          problem: `Row ${rowNum} has an empty item name cell.`,
          fix: `Enter a valid item name in Row ${rowNum} of your Excel sheet before copying.`
        });
        return;
      }

      // Skip grand total footer row if copied accidentally from Excel
      if (/^(grand\s*total|sub\s*total|total\s*amount|in\s*words)$/i.test(candidate.trim())) {
        return;
      }

      const matched = findItemMatch(candidate);
      if (!matched) {
        const effectiveRate = rateOverride ?? 0;
        problems.push({
          item: `Row ${rowNum}: "${candidate}"`,
          problem: `"${candidate}" was added to the list, but it does not match an existing item in Master Item Directory (Rate set to ৳${effectiveRate}).`,
          fix: `Click the item row to pick the exact catalog name from the dropdown, or add "${candidate}" in Master Item Directory so its standard price loads automatically.`
        });
        newItemsToAdd.push({
          id: `line-${Date.now()}-${rowIdx}-${Math.random().toString(36).substring(2, 6)}`,
          description: candidate,
          unit: (unitCandidate as any) || 'Coils',
          red: '',
          black: '',
          yellow: '',
          green: '',
          blue: '',
          quantity: qtyCandidate,
          remarks: '',
          isSpecialItem: false,
          rate: effectiveRate,
          amount: effectiveRate * qtyCandidate
        });
      } else {
        const finalRate = matched.rate && matched.rate > 0 ? matched.rate : (rateOverride ?? 0);
        if (!finalRate || finalRate <= 0) {
          problems.push({
            item: `Row ${rowNum}: "${matched.name}"`,
            problem: `"${matched.name}" matched in catalog, but its price/rate is currently ৳0.`,
            fix: `Update the price for "${matched.name}" in Master Item Directory so totals calculate accurately.`
          });
        }
        newItemsToAdd.push({
          id: `line-${Date.now()}-${rowIdx}-${Math.random().toString(36).substring(2, 6)}`,
          description: matched.name,
          itemId: matched.id,
          itemCode: matched.code,
          unit: (unitCandidate as any) || (matched.unit as any) || 'Coils',
          red: '',
          black: '',
          yellow: '',
          green: '',
          blue: '',
          quantity: qtyCandidate,
          remarks: '',
          isSpecialItem: isReCableItem(matched.name) && (matched.name.toLowerCase().includes('bobin') || matched.name.toLowerCase().includes('500m')),
          rate: finalRate,
          amount: finalRate * qtyCandidate
        });
      }
    });

    if (newItemsToAdd.length > 0) {
      setLines((prev) => {
        const targetIdx = prev.findIndex((l) => l.id === targetLineId);
        // Find first empty line if targetLineId is 'new' or already filled
        const firstEmptyIdx = prev.findIndex((l) => !l.description.trim() && !(Number(l.quantity) > 0));
        const insertAt = targetIdx !== -1 ? targetIdx : (firstEmptyIdx !== -1 ? firstEmptyIdx : prev.length);

        const before = prev.slice(0, insertAt);
        const targetLine = prev[insertAt];
        const after = prev.slice(insertAt + 1);

        // If targetLine is blank, overwrite it and consume any immediately following blank placeholder lines
        if (!targetLine || (!targetLine.description.trim() && !(Number(targetLine.quantity) > 0))) {
          let remainingToConsume = newItemsToAdd.length - 1;
          const filteredAfter = after.filter((l) => {
            if (remainingToConsume > 0 && !l.description.trim() && !(Number(l.quantity) > 0)) {
              remainingToConsume--;
              return false;
            }
            return true;
          });
          return [...before, ...newItemsToAdd, ...filteredAfter];
        }

        return [...before, targetLine, ...newItemsToAdd, ...after];
      });

      setExcelPasteSuccessCount(newItemsToAdd.length);
      if (problems.length > 0) {
        setExcelPasteProblems(problems);
        setShowExcelProblemModal(true);
      }
    } else if (problems.length > 0) {
      setExcelPasteSuccessCount(0);
      setExcelPasteProblems(problems);
      setShowExcelProblemModal(true);
    }
  };

  // Remove line if zero quantity and jump to discount field
  // Rule: item select but quantity 0 and press enter focus goes to discount then remove 0 quantity row and check blank row but sl no have then remove that
  const handleLineEnterWithZeroQty = (lineId: string) => {
    setLines((prev) => {
      const valid = prev.filter((l) => {
        if (l.id === lineId) return false;
        const hasDesc = Boolean(l.description && l.description.trim().length > 0);
        const q = Number(l.quantity) || 0;
        if (!hasDesc || q <= 0) return false;
        return true;
      });
      if (valid.length > 0) {
        return valid;
      }
      return [
        {
          id: `line-${Date.now()}`,
          description: '',
          unit: 'Coils',
          red: '',
          black: '',
          yellow: '',
          green: '',
          blue: '',
          quantity: 0,
          remarks: '',
          isSpecialItem: false,
          rate: 0,
          amount: 0
        }
      ];
    });
    setActiveItemSearchRowId(null);

    // Focus and select discount input with multi-attempt retry
    let attempts = 0;
    const maxAttempts = 10;
    const tryFocusDiscount = () => {
      attempts++;
      if (discountInputRef.current) {
        discountInputRef.current.focus();
        discountInputRef.current.select();
        return;
      }
      if (attempts < maxAttempts) {
        setTimeout(tryFocusDiscount, attempts * 30);
      }
    };
    setTimeout(tryFocusDiscount, 30);
  };

  // Reliable requisition line item focus & selection helper with retry
  const focusRequisitionItemInput = (targetLineId: string) => {
    let attempts = 0;
    const maxAttempts = 10;
    const tryFocus = () => {
      attempts++;
      const el = itemInputRefs.current[targetLineId] || (document.getElementById(`req-item-input-${targetLineId}`) as HTMLInputElement | null);
      if (el) {
        el.focus();
        if (typeof el.select === 'function') {
          el.select();
        }
        setActiveItemSearchRowId(targetLineId);
        return true;
      }
      if (attempts < maxAttempts) {
        setTimeout(tryFocus, attempts * 30);
      }
      return false;
    };

    if (!tryFocus()) {
      setTimeout(tryFocus, 25);
    }
  };

  // Confirm colors & quantity from ColorQuantityModal
  const handleConfirmColorModal = (totalQty: number, colors: ColorBreakdownData) => {
    if (!colorModalState) return;
    const { lineId, item } = colorModalState;

    const effectiveQty = totalQty > 0 ? totalQty : 0;

    // Generate formatted color breakdown string for remarks (e.g. "R:10, B:5, Y:2")
    const colorParts: string[] = [];
    if (colors.red && Number(colors.red) > 0) colorParts.push(`R:${colors.red}`);
    if (colors.blk && Number(colors.blk) > 0) colorParts.push(`B:${colors.blk}`);
    if (colors.yel && Number(colors.yel) > 0) colorParts.push(`Y:${colors.yel}`);
    if (colors.grn && Number(colors.grn) > 0) colorParts.push(`G:${colors.grn}`);
    if (colors.blu && Number(colors.blu) > 0) colorParts.push(`BL:${colors.blu}`);
    if (colors.others && Number(colors.others) > 0) colorParts.push(`Other:${colors.others}`);
    const colorRemarksStr = colorParts.join(', ');

    const currentIndex = lines.findIndex((l) => l.id === lineId);
    let targetNextLineId: string;
    if (currentIndex >= 0 && currentIndex < lines.length - 1) {
      targetNextLineId = lines[currentIndex + 1].id;
    } else {
      targetNextLineId = `line-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    }

    setLines((prev) => {
      const isLast = prev.findIndex((l) => l.id === lineId) >= prev.length - 1;
      const updatedLines = prev.map((line) => {
        if (line.id !== lineId) return line;

        const isSpecial =
          Boolean(item.isSpecialItem) ||
          item.unit === 'Bobin' ||
          item.name.toLowerCase().includes('bobin') ||
          item.name.toLowerCase().includes('500 m length') ||
          item.name.toLowerCase().includes('500m length');

        return {
          ...line,
          itemId: item.id,
          itemCode: item.code,
          description: getItemDisplayName(item),
          unit: item.unit || 'Coils',
          rate: item.rate || 0,
          red: colors.red ? Number(colors.red) : '',
          black: colors.blk ? Number(colors.blk) : '',
          yellow: colors.yel ? Number(colors.yel) : '',
          green: colors.grn ? Number(colors.grn) : '',
          blue: colors.blu ? Number(colors.blu) : '',
          others: colors.others ? Number(colors.others) : '',
          quantity: effectiveQty,
          remarks: colorRemarksStr || line.remarks || '',
          amount: (item.rate || 0) * effectiveQty,
          isSpecialItem: isSpecial
        };
      });

      if (isLast) {
        return [
          ...updatedLines,
          {
            id: targetNextLineId,
            description: '',
            unit: 'Coils',
            red: '',
            black: '',
            yellow: '',
            green: '',
            blue: '',
            others: '',
            quantity: 0,
            remarks: '',
            isSpecialItem: false,
            rate: 0,
            amount: 0
          }
        ];
      }

      return updatedLines;
    });

    setColorModalState(null);

    // Auto focus and select next item line input and open search
    focusRequisitionItemInput(targetNextLineId);
  };

  // Pick item from catalog for a line & auto open Color Modal (strictly for BYA and Aluminium, without RE items)
  const handleSelectItemForLine = (lineId: string, item: Item) => {
    const isSpecial =
      Boolean(item.isSpecialItem) ||
      item.unit === 'Bobin' ||
      item.name.toLowerCase().includes('bobin') ||
      item.name.toLowerCase().includes('500 m length') ||
      item.name.toLowerCase().includes('500m length');

    const isMeterLengthItem =
      item.name.toLowerCase().includes('500 m length') ||
      item.name.toLowerCase().includes('500m length') ||
      (item.unit || '').toLowerCase().includes('mtr') ||
      (item.unit || '').toLowerCase().includes('meter');

    const itemUnit = isMeterLengthItem ? 'Mtr' : (item.unit || 'Coils');

    const currentLine = lines.find((l) => l.id === lineId);
    const isColorReq = isColorApplicableCable(item);

    if (isColorReq) {
      // Open the color quantity modal only for BYA and Aluminium items
      setColorModalState({
        isOpen: true,
        lineId,
        item,
        unit: itemUnit,
        initialColors: {
          red: typeof currentLine?.red === 'number' ? currentLine.red : (Number(currentLine?.red) || 0),
          blk: typeof currentLine?.black === 'number' ? currentLine.black : (Number(currentLine?.black) || 0),
          yel: typeof currentLine?.yellow === 'number' ? currentLine.yellow : (Number(currentLine?.yellow) || 0),
          grn: typeof currentLine?.green === 'number' ? currentLine.green : (Number(currentLine?.green) || 0),
          blu: typeof currentLine?.blue === 'number' ? currentLine.blue : (Number(currentLine?.blue) || 0),
          others: typeof currentLine?.others === 'number' ? currentLine.others : (Number(currentLine?.others) || 0)
        },
        initialTotalQty: currentLine && currentLine.quantity > 0 ? currentLine.quantity : 0
      });
      setActiveItemSearchRowId(null);
    } else {
      // For items without color breakdown (RE items, Flexible, Telephone, etc.), immediately populate line with default quantity 0
      setLines((prev) =>
        prev.map((line) => {
          if (line.id !== lineId) return line;
          const currentQty = line.quantity > 0 ? line.quantity : 0;
          return {
            ...line,
            description: getItemDisplayName(item),
            itemId: item.id,
            itemCode: item.code,
            unit: itemUnit,
            rate: item.rate || 0,
            quantity: currentQty,
            amount: (item.rate || 0) * currentQty,
            isSpecialItem: isSpecial,
            red: '',
            black: '',
            yellow: '',
            green: '',
            blue: '',
            others: ''
          };
        })
      );
      setActiveItemSearchRowId(null);
      if (qtyInputRefs.current[lineId]) {
        qtyInputRefs.current[lineId]?.focus();
        qtyInputRefs.current[lineId]?.select();
      }
      setTimeout(() => {
        if (qtyInputRefs.current[lineId]) {
          qtyInputRefs.current[lineId]?.focus();
          qtyInputRefs.current[lineId]?.select();
        }
        const qtyEl = document.getElementById(`req-line-qty-${lineId}`) as HTMLInputElement | null;
        if (qtyEl) {
          qtyEl.focus();
          qtyEl.select();
        }
      }, 30);
    }
  };

  // Calculations
  const filledItemsCount = useMemo(() => {
    return lines.filter((l) => l.description.trim() !== '' || (Number(l.quantity) || 0) > 0).length;
  }, [lines]);

  // Live Requisition Slip Lines: Only lines with selected items / entered data (or 1 row if empty)
  const slipDisplayLines = useMemo(() => {
    const filled = lines.filter((l) => l.description.trim() !== '' || (Number(l.quantity) || 0) > 0);
    return filled.length > 0 ? filled : (lines.length > 0 ? [lines[0]] : []);
  }, [lines]);

  const totalRequisitionQuantity = useMemo(() => {
    return lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
  }, [lines]);

  const calculatedGrossAmount = useMemo(() => {
    const sum = lines.reduce((acc, l) => acc + (l.amount || (l.rate || 0) * (l.quantity || 0)), 0);
    return sum > 0 ? sum : (manualGrossAmountOverride || 0);
  }, [lines, manualGrossAmountOverride]);

  const discountAmount = useMemo(() => {
    if (manualDiscountAmountOverride !== null) return manualDiscountAmountOverride;
    return Math.round((calculatedGrossAmount * (discountPercent || 0)) / 100);
  }, [calculatedGrossAmount, discountPercent, manualDiscountAmountOverride]);

  const netAmountAfterDiscount = useMemo(() => {
    return Math.max(0, calculatedGrossAmount - discountAmount);
  }, [calculatedGrossAmount, discountAmount]);

  // Cleaner for requisition display remarks to prevent duplicates like "R:10, B:10, Y:2 (R:10, B:10, Y:2)"
  const cleanDisplayRemarks = (remarks?: string): string => {
    if (!remarks) return '';
    let str = remarks.trim();
    if (str.toLowerCase() === 'remarks' || str === '—' || str === '-') return '';
    
    // Normalize duplicate pattern e.g. "R:10, B:10, Y:2 (R:10, B:10, Y:2)" -> "R:10, B:10, Y:2"
    const dupMatch = str.match(/^(.*?)\s*\((.*?)\)$/);
    if (dupMatch) {
      const p1 = dupMatch[1].trim();
      const p2 = dupMatch[2].trim();
      const n1 = p1.replace(/[\s,;:_-]+/g, '').toLowerCase();
      const n2 = p2.replace(/[\s,;:_-]+/g, '').toLowerCase();
      if (n1 === n2 || !n2 || n1.includes(n2) || n2.includes(n1)) {
        str = p1 || p2;
      }
    }
    // Clean any color breakdown substrings (R:10, B:5, etc.) so no color details appear in requisition history view
    const strippedColors = cleanColorBreakdownFromRemarks(str);
    return strippedColors !== undefined ? strippedColors : str;
  };

  // Formatter for Colors / Remarks in the live slip
  const formatColorsRemarksForSlip = (line: RequisitionEntryLine): string => {
    const colorParts: string[] = [];
    if (line.red && Number(line.red) > 0) colorParts.push(`R:${line.red}`);
    if (line.black && Number(line.black) > 0) colorParts.push(`B:${line.black}`);
    if (line.yellow && Number(line.yellow) > 0) colorParts.push(`Y:${line.yellow}`);
    if (line.green && Number(line.green) > 0) colorParts.push(`G:${line.green}`);
    if (line.blue && Number(line.blue) > 0) colorParts.push(`BL:${line.blue}`);
    if (line.others && Number(line.others) > 0) colorParts.push(`Other:${line.others}`);

    const hasColors = colorParts.length > 0;
    const colorStr = colorParts.join(', ');

    let rawRemarks = cleanDisplayRemarks(line.remarks);

    // If remarks duplicates colorStr or has color codes in parentheses
    if (rawRemarks) {
      // First clean duplicate pattern if any
      const dupMatch = rawRemarks.match(/^(.*?)\s*\((.*?)\)$/);
      if (dupMatch) {
        const p1 = dupMatch[1].trim();
        const p2 = dupMatch[2].trim();
        const n1 = p1.replace(/[\s,;:_-]+/g, '').toLowerCase();
        const n2 = p2.replace(/[\s,;:_-]+/g, '').toLowerCase();
        if (n1 === n2 || !n2 || n1.includes(n2) || n2.includes(n1)) {
          rawRemarks = p1 || p2;
        }
      }

      if (colorStr) {
        const normColor = colorStr.replace(/[\s,]+/g, '').toLowerCase();
        const normRemarks = rawRemarks.replace(/[\s,()]+/g, '').toLowerCase();
        if (normRemarks === normColor || normRemarks.includes(normColor)) {
          const stripped = cleanColorBreakdownFromRemarks(rawRemarks);
          rawRemarks = stripped;
        } else {
          const stripped = cleanColorBreakdownFromRemarks(rawRemarks);
          if (!stripped || stripped.replace(/[\s,()]+/g, '').toLowerCase() === normColor) {
            rawRemarks = '';
          } else {
            rawRemarks = stripped;
          }
        }
      }
    }

    if (hasColors && rawRemarks) {
      return `${colorStr} (${rawRemarks})`;
    }
    if (hasColors) {
      return colorStr;
    }
    if (rawRemarks) {
      return rawRemarks;
    }
    return '';
  };

  // Helper to format WhatsApp breakdown for a line item e.g. (R-10+B-10+Y-5)
  const formatWhatsAppColors = (line: {
    red?: number | string;
    black?: number | string;
    yellow?: number | string;
    green?: number | string;
    blue?: number | string;
    others?: number | string;
    remarks?: string;
  }): string => {
    const parts: string[] = [];
    const r = Number(line.red) || 0;
    const b = Number(line.black) || 0;
    const y = Number(line.yellow) || 0;
    const g = Number(line.green) || 0;
    const bl = Number(line.blue) || 0;
    const oth = Number(line.others) || 0;

    if (r > 0) parts.push(`R-${r}`);
    if (b > 0) parts.push(`B-${b}`);
    if (y > 0) parts.push(`Y-${y}`);
    if (g > 0) parts.push(`G-${g}`);
    if (bl > 0) parts.push(`BL-${bl}`);
    if (oth > 0) parts.push(`Oth-${oth}`);

    if (parts.length > 0) {
      return ` (${parts.join('+')})`;
    }

    if (line.remarks && line.remarks.trim()) {
      const rmk = line.remarks.trim();
      if (rmk.toLowerCase() === 'remarks' || rmk === '—' || rmk === '-') return '';
      if (rmk.startsWith('(') && rmk.endsWith(')')) {
        return ` ${rmk}`;
      }
      const extracted: string[] = [];
      const tokens = rmk.split(/[,+]/).map((t) => t.trim());
      tokens.forEach((tok) => {
        const m1 = tok.match(/^R[:\s-]*(\d+)$/i) || tok.match(/^(\d+)\s*[-:]?\s*R$/i);
        const m2 = tok.match(/^B(?:LK)?[:\s-]*(\d+)$/i) || tok.match(/^(\d+)\s*[-:]?\s*B(?:LK)?$/i);
        const m3 = tok.match(/^Y(?:EL)?[:\s-]*(\d+)$/i) || tok.match(/^(\d+)\s*[-:]?\s*Y(?:EL)?$/i);
        const m4 = tok.match(/^G(?:RN)?[:\s-]*(\d+)$/i) || tok.match(/^(\d+)\s*[-:]?\s*G(?:RN)?$/i);
        const m5 = tok.match(/^BL(?:U)?[:\s-]*(\d+)$/i) || tok.match(/^(\d+)\s*[-:]?\s*BL(?:U)?$/i);
        if (m1) extracted.push(`R-${m1[1]}`);
        else if (m2) extracted.push(`B-${m2[1]}`);
        else if (m3) extracted.push(`Y-${m3[1]}`);
        else if (m4) extracted.push(`G-${m4[1]}`);
        else if (m5) extracted.push(`BL-${m5[1]}`);
      });
      if (extracted.length > 0) {
        return ` (${extracted.join('+')})`;
      }
      return ` (${rmk})`;
    }
    return '';
  };

  // Construct user-specified WhatsApp message body
  const buildRequisitionWhatsAppText = (customReq?: Requisition): string => {
    const targetPartyName = customReq?.partyName || customReq?.branchName || partyName || 'Customer';
    let targetPartyAddress = customReq ? (customReq.partyAddress || '') : partyAddress;
    if (!targetPartyAddress && targetPartyName && targetPartyName !== 'Customer') {
      const matched = parties.find((p) => p.name.trim().toLowerCase() === targetPartyName.trim().toLowerCase());
      if (matched?.address) {
        targetPartyAddress = matched.address;
      }
    }

    const targetReqDate = customReq ? formatDateDDMMYY(customReq.date) : reqDate;
    const shortDate = (customReq?.reqDateStr || discountEffectiveDate || targetReqDate).replace(/\.20(\d\d)$/, '.$1');
    const discPct = customReq?.discountPercent !== undefined ? customReq.discountPercent : discountPercent;

    // Resolve MP (Marketing Person full name e.g. Subrata Sutradhar)
    const personRaw = customReq?.createdByName || customReq?.marketingPersonName || marketingPerson || 'Subrata Sutradhar';
    const matchedSp = salespersons.find(
      (s) => s.name.toLowerCase().includes(personRaw.toLowerCase()) || s.code.toLowerCase() === personRaw.toLowerCase()
    );
    const matchedMp = MARKETING_PERSONS.find((m) => m.toLowerCase().includes(personRaw.toLowerCase()));
    const mpFullName = matchedSp?.name || matchedMp || personRaw;

    // Resolve Lines
    const validLines = customReq
      ? (customReq.lines || []).map((l) => ({
          description: l.itemName,
          quantity: l.requestedQty || l.approvedQty || 0,
          unit: l.unit || 'Coils',
          red: l.red,
          black: l.black,
          yellow: l.yellow,
          green: l.green,
          blue: l.blue,
          remarks: l.remarks || ''
        }))
      : slipDisplayLines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unit: l.unit || 'Coils',
          red: l.red !== undefined && l.red !== '' ? Number(l.red) : '',
          black: l.black !== undefined && l.black !== '' ? Number(l.black) : '',
          yellow: l.yellow !== undefined && l.yellow !== '' ? Number(l.yellow) : '',
          green: l.green !== undefined && l.green !== '' ? Number(l.green) : '',
          blue: l.blue !== undefined && l.blue !== '' ? Number(l.blue) : '',
          remarks: l.remarks || ''
        }));

    // Amounts
    let totalAmt = 0;
    if (customReq) {
      if (customReq.totalAmount && customReq.totalAmount > 0) {
        totalAmt = customReq.totalAmount;
      } else if (customReq.lines) {
        totalAmt = customReq.lines.reduce((s, l) => s + (l.amount || (l.rate || 0) * (l.requestedQty || l.approvedQty || 0)), 0);
      }
    } else {
      totalAmt = calculatedGrossAmount > 0 ? calculatedGrossAmount : netAmountAfterDiscount;
    }

    let dueAmt = customReq?.customerCurrentDue ?? customerCurrentDue;
    if ((dueAmt === undefined || dueAmt === 0) && targetPartyName && targetPartyName !== 'Customer') {
      dueAmt = calculatePartyCurrentDue(targetPartyName);
    }

    const formattedTotal = Math.round(totalAmt).toLocaleString('en-IN');
    const formattedDue = Math.abs(Math.round(dueAmt || 0)).toLocaleString('en-IN');

    // Build message body
    const msgParts: string[] = [];
    msgParts.push(`*${targetPartyName}*`);
    if (targetPartyAddress && targetPartyAddress.trim()) {
      const cleanAddr = targetPartyAddress.trim();
      msgParts.push(cleanAddr.endsWith('.') ? cleanAddr : `${cleanAddr}.`);
    }
    msgParts.push(''); // blank line

    validLines.forEach((l) => {
      if (l.description && l.description.trim()) {
        const colors = formatWhatsAppColors(l);
        msgParts.push(`${l.description} - ${l.quantity} ${l.unit}${colors}`);
      }
    });

    msgParts.push(''); // blank line
    msgParts.push(`MP: ${mpFullName}`);
    msgParts.push(`${shortDate}-(${discPct}%)`);
    msgParts.push(`Total: ${formattedTotal}/-`);
    msgParts.push(`Due: ${formattedDue}/-`);

    return msgParts.join('\n');
  };

  // Print Action
  const handlePrint = () => {
    window.print();
  };

  // Start fresh requisition: reset every field and switch to entry slip
  const handleStartFreshRequisition = () => {
    setEditingRequisitionId(null);
    setPartyName('');
    setPartyAddress('');
    setDeliverySite('');
    const today = getTodayDDMMYY();
    setReqDate(today);
    setDelvDate(today);
    setDiscountPercent(10);
    setCustomerCurrentDue(0);
    setManualGrossAmountOverride(null);
    setManualDiscountAmountOverride(null);
    setToDestination('Factory');
    const defaultCreator = loggedInSalespersonName || 'Subrata';
    setMarketingPerson(defaultCreator);
    setReqBySignature(defaultCreator);
    setPreparedBySignature(defaultCreator);
    setCheckedBySignature('');
    setApprovedBySignature(defaultApprover || DEFAULT_APPROVER_NAME);

    setLines(createBlankRequisitionLines(5));
    setActiveItemSearchRowId(null);
    setPartySearchOpen(false);

    // Set Req No sequence for new requisition (starts at 021-Subrata / auto-incremented number)
    setReqPrefix('');
    setReqSequence(initialSequence);
    setActiveTab('entry_slip');

    setTimeout(() => {
      partyInputRef.current?.focus();
    }, 120);
  };

  // Edit Existing Requisition (Approved requisitions cannot be changed)
  const handleEditRequisition = (req: Requisition) => {
    const isApproved = Boolean(
      req.isApproved ||
      req.stage === 'sent_to_factory' ||
      req.stage === 'factory_dispatched' ||
      req.stage === 'factory_received' ||
      req.stage === 'goods_received' ||
      req.stage === 'converted_to_bill'
    );
    if (isApproved) {
      alert('Approved requisition cannot be modified.');
      return;
    }

    setEditingRequisitionId(req.id);

    // Restore Prefix if present
    if (req.prefix) {
      setReqPrefix(req.prefix);
    } else {
      const prefixMatch = req.reqNo?.match(/^([A-Za-z0-9_-]+)\s*(req\s*#|#)/i);
      if (prefixMatch && prefixMatch[1].toLowerCase() !== 'req') {
        setReqPrefix(prefixMatch[1]);
      } else {
        setReqPrefix('');
      }
    }

    // 1. Parse Req Number e.g. "01-Subrata" or "01"
    const parts = req.reqNo ? req.reqNo.split('-') : [];
    const seqMatch = req.reqNo?.match(/(\d+)/);
    const seq = req.seqNumber || (seqMatch ? parseInt(seqMatch[1], 10) : NaN);
    if (!isNaN(seq)) {
      setReqSequence(seq < 10 ? String(seq).padStart(2, '0') : seq);
    } else {
      setReqSequence('');
    }
    const person = (parts[1]?.trim() || req.createdByName || 'Subrata').trim();
    if (person) {
      setMarketingPerson(person);
      setReqBySignature(person);
    }

    // Restore Sales Center
    const center = req.branchName || req.toDestination;
    if (center) {
      const match = branches.find((b) => b.name.toLowerCase().trim() === center.toLowerCase().trim() || cleanBranchName(b.name).toLowerCase() === cleanBranchName(center).toLowerCase());
      if (match) {
        setSelectedSalesCenter(match.name);
      }
    }

    // 2. Party Name & Address
    const pName = req.partyName || req.branchName || '';
    setPartyName(pName);

    let pAddr = req.partyAddress || '';
    if (!pAddr && pName) {
      const matched = parties.find((p) => p.name.trim().toLowerCase() === pName.trim().toLowerCase());
      if (matched?.address) pAddr = matched.address;
    }
    setPartyAddress(pAddr);

    // 3. Destination & Delivery Site
    setToDestination(req.toDestination || 'Factory');
    setDeliverySite(req.deliverySite || (req.remarks?.startsWith('Delivery Site: ') ? req.remarks.replace('Delivery Site: ', '') : req.remarks || ''));

    // 4. Dates
    if (req.reqDateStr) {
      setReqDate(req.reqDateStr);
    } else if (req.date) {
      setReqDate(formatDateDDMMYY(req.date));
    }
    if (req.delvDateStr) {
      setDelvDate(req.delvDateStr);
    }

    // 5. Discount & Due
    if (req.discountPercent !== undefined) {
      setDiscountPercent(req.discountPercent);
    }
    if (req.customerCurrentDue !== undefined) {
      setCustomerCurrentDue(req.customerCurrentDue);
    } else if (pName) {
      setCustomerCurrentDue(calculatePartyCurrentDue(pName));
    }

    // 6. Signatures
    if (req.checkedBySignature !== undefined) {
      setCheckedBySignature(req.checkedBySignature);
    } else {
      const savedChecked = localStorage.getItem('polycables_req_checked_by') || '';
      setCheckedBySignature(savedChecked);
    }
    if (req.approvedBySignature !== undefined) {
      setApprovedBySignature(req.approvedBySignature);
    } else {
      const savedApproved = localStorage.getItem('polycables_req_approved_by') || '';
      setApprovedBySignature(savedApproved);
    }
    if (req.preparedBySignature) {
      setPreparedBySignature(req.preparedBySignature);
    }

    // 7. Map lines (preserving full colour breakdown from explicit colour fields or raw remarks!)
    if (req.lines && req.lines.length > 0) {
      const mappedLines: RequisitionEntryLine[] = req.lines.map((l, index) => {
        const extracted = extractReqLineColors(l);
        const red: number | '' = extracted.red > 0 ? extracted.red : '';
        const black: number | '' = extracted.black > 0 ? extracted.black : '';
        const yellow: number | '' = extracted.yellow > 0 ? extracted.yellow : '';
        const green: number | '' = extracted.green > 0 ? extracted.green : '';
        const blue: number | '' = extracted.blue > 0 ? extracted.blue : '';
        const others: number | '' = extracted.others > 0 ? extracted.others : '';

        const qty = l.requestedQty || l.approvedQty || 0;
        const rate = l.rate || 0;
        const amt = l.amount || rate * qty;

        return {
          id: l.id || `line-${Date.now()}-${index}`,
          itemId: l.itemId,
          itemCode: l.itemCode || '',
          description: l.itemName || l.itemCode || '',
          unit: l.unit || 'Coils',
          red,
          black,
          yellow,
          green,
          blue,
          others,
          quantity: qty,
          remarks: extracted.customRemarks || '',
          isSpecialItem: isReCableItem(l.itemName || ''),
          rate,
          amount: amt
        };
      });
      setLines(mappedLines);
    }

    // Switch to entry slip tab
    setActiveTab('entry_slip');
    setSelectedRequisitionForView(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Cancel Edit and return to clean new requisition form
  const handleCancelEdit = () => {
    setEditingRequisitionId(null);
    setReqPrefix('');
    setPartyName('');
    setPartyAddress('');
    setDeliverySite('');
    setCustomerCurrentDue(0);
    setDiscountPercent(10);
    setManualGrossAmountOverride(null);
    setManualDiscountAmountOverride(null);
    const savedChecked = localStorage.getItem('polycables_req_checked_by') || '';
    const savedApproved = localStorage.getItem('polycables_req_approved_by') || '';
    setCheckedBySignature(savedChecked);
    setApprovedBySignature(savedApproved);
    setLines(createBlankRequisitionLines(5));
    const nextSeqForCenter = getNextSeqForSalesCenter(selectedSalesCenter, requisitions, branches);
    setReqSequence(nextSeqForCenter < 10 ? String(nextSeqForCenter).padStart(2, '0') : String(nextSeqForCenter));
    setTimeout(() => {
      partyInputRef.current?.focus();
    }, 100);
  };

  // Save or Update Action (Save Only)
  const handleSaveRequisition = (shouldReset = true): Requisition => {
    const validLines = lines.filter((l) => l.description.trim() !== '' || l.quantity > 0);
    const linesToSave = validLines.length > 0 ? validLines : lines;
    const existing = editingRequisitionId ? requisitions.find((r) => r.id === editingRequisitionId) : undefined;

    // Resolve numeric sequence (fallback to auto-generated sequence if user left blank)
    const effectiveSeq = typeof reqSequence === 'number' && !isNaN(reqSequence) && reqSequence > 0
      ? reqSequence
      : (parseInt(String(reqSequence), 10) || getNextSeqForSalesCenter(selectedSalesCenter, requisitions, branches));

    // Persist highest sequence used for this sales center for permanent auto-increment
    const scStorageKey = getSalesCenterStorageKey(selectedSalesCenter);
    try {
      localStorage.setItem(scStorageKey, String(effectiveSeq));
      localStorage.setItem('polycables_last_req_sequence', String(effectiveSeq));
    } catch (e) {}

    const seqStr = effectiveSeq < 10 ? String(effectiveSeq).padStart(2, '0') : String(effectiveSeq);
    const effectiveReqNo = reqSequence !== '' && reqSequence !== undefined && reqSequence !== null
      ? formattedReqNo
      : (marketingPerson ? `req # ${seqStr}-${marketingPerson}` : `req # ${seqStr}`);

    const branchObj = branches.find((b) => b.name === selectedSalesCenter || cleanBranchName(b.name) === cleanBranchName(selectedSalesCenter));

    const partyMatched = allPartiesWithSalesCenters.find(
      (p) => p.name.trim().toLowerCase() === (partyName || '').trim().toLowerCase()
    );

    const isPartySalesCenter = Boolean(
      (partyMatched as any)?.isSalesCenter ||
      branches.some((b) => cleanBranchName(b.name).toLowerCase() === cleanBranchName(partyName || '').toLowerCase() || b.name.toLowerCase() === (partyName || '').toLowerCase()) ||
      (partyName || '').toLowerCase().includes('sales center') ||
      (partyName || '').toLowerCase().includes('showroom')
    );

    const requisitionData: Requisition = {
      id: editingRequisitionId || `req-${Date.now()}`,
      isSalesCenterRequisition: isPartySalesCenter,
      prefix: reqPrefix.trim() || undefined,
      reqNo: effectiveReqNo,
      seqNumber: effectiveSeq,
      marketingPersonName: marketingPerson,
      date: getTodayISO(),
      branchId: branchObj?.id || 'branch-1',
      branchName: selectedSalesCenter || partyName || partyAddress || 'Madhupur Sales Center',
      branchType: 'showroom',
      partyName: partyName,
      partyAddress: partyAddress,
      toDestination: toDestination || selectedSalesCenter || 'Factory',
      deliverySite: deliverySite,
      discountPercent: discountPercent,
      customerCurrentDue: customerCurrentDue,
      reqDateStr: reqDate,
      delvDateStr: delvDate,
      needsInChargeApproval: true,
      createdByName: preparedBySignature || marketingPerson || 'Subrata',
      preparedBySignature: preparedBySignature || marketingPerson || 'Subrata',
      checkedBySignature: checkedBySignature || '',
      approvedBySignature: approvedBySignature || defaultApprover || DEFAULT_APPROVER_NAME,
      stage: existing ? existing.stage : 'pending_goods',
      percentage: existing ? (existing.percentage !== undefined ? existing.percentage : (existing.stage === 'converted_to_bill' || existing.stage === 'goods_received' ? 100 : 0)) : 0,
      auditMailSent: existing?.auditMailSent || false,
      auditMailSentAt: existing?.auditMailSentAt,
      isLocked: existing?.isLocked || existing?.stage === 'converted_to_bill' || false,
      convertedBillId: existing?.convertedBillId,
      convertedBillNo: existing?.convertedBillNo,
      convertedAt: existing?.convertedAt,
      urgency: 'normal',
      remarks: deliverySite ? `Delivery Site: ${deliverySite}` : '',
      lines: linesToSave.map((l) => ({
        id: l.id,
        itemId: l.itemId,
        itemCode: l.itemCode || '',
        itemName: l.description || 'Custom Cable Item',
        unit: l.unit,
        requestedQty: l.quantity,
        approvedQty: l.quantity,
        rate: l.rate,
        amount: l.amount,
        red: l.red !== '' && l.red !== undefined && Number(l.red) > 0 ? Number(l.red) : undefined,
        black: l.black !== '' && l.black !== undefined && Number(l.black) > 0 ? Number(l.black) : undefined,
        yellow: l.yellow !== '' && l.yellow !== undefined && Number(l.yellow) > 0 ? Number(l.yellow) : undefined,
        green: l.green !== '' && l.green !== undefined && Number(l.green) > 0 ? Number(l.green) : undefined,
        blue: l.blue !== '' && l.blue !== undefined && Number(l.blue) > 0 ? Number(l.blue) : undefined,
        others: l.others !== '' && l.others !== undefined && Number(l.others) > 0 ? Number(l.others) : undefined,
        remarks: formatColorsRemarksForSlip(l)
      })),
      totalRequestedQty: totalRequisitionQuantity,
      totalApprovedQty: totalRequisitionQuantity,
      totalAmount: netAmountAfterDiscount,
      savedAt: editingRequisitionId
        ? requisitions.find((r) => r.id === editingRequisitionId)?.savedAt || new Date().toISOString()
        : new Date().toISOString(),
      updatedAt: editingRequisitionId ? new Date().toISOString() : undefined
    };

    const wasEditing = Boolean(editingRequisitionId);
    let updated: Requisition[];
    if (editingRequisitionId) {
      updated = requisitions.map((r) => (r.id === editingRequisitionId ? requisitionData : r));
      setEditingRequisitionId(null);
    } else {
      updated = [requisitionData, ...requisitions];
      setReqSequence('');
    }

    saveRequisitionsToStorage(updated);
    setSaveNotification(true);
    // Success popup auto closes after 0.3s (300ms)
    setTimeout(() => setSaveNotification(false), 300);

    if (wasEditing) {
      setActiveTab('list');
    }

    if (shouldReset) {
      // Reset all fields to start from clean state with next auto-increment sequence
      setEditingRequisitionId(null);
      const nextSeqForCenter = getNextSeqForSalesCenter(selectedSalesCenter, updated, branches);
      setReqSequence(nextSeqForCenter < 10 ? String(nextSeqForCenter).padStart(2, '0') : String(nextSeqForCenter));
      setPartyName('');
      setPartyAddress('');
      setDeliverySite('');
      const today = getTodayDDMMYY();
      setReqDate(today);
      setDelvDate(today);
      setCustomerCurrentDue(0);
      setDiscountPercent(10);
      setManualGrossAmountOverride(null);
      setManualDiscountAmountOverride(null);
      const savedChecked = localStorage.getItem('polycables_req_checked_by') || '';
      const savedApproved = localStorage.getItem('polycables_req_approved_by') || '';
      setCheckedBySignature(savedChecked);
      setApprovedBySignature(savedApproved);
      setLines(createBlankRequisitionLines(5));
      setActiveItemSearchRowId(null);
      setPartySearchOpen(false);

      // Auto-focus party name input for the next entry
      setTimeout(() => {
        partyInputRef.current?.focus();
      }, 120);
    }

    return requisitionData;
  };

  // Save & WhatsApp & Mail Action
  const handleSaveAndWhatsAppAndMail = () => {
    const saved = handleSaveRequisition(false);
    handleOpenWhatsAppModal(saved);
  };

  // WhatsApp / Clipboard Copy
  const handleCopyWhatsAppText = () => {
    const msg = buildRequisitionWhatsAppText();
    navigator.clipboard.writeText(msg);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2500);
  };

  // Check if active requisition being edited is already converted
  const isCurrentReqConverted = useMemo(() => {
    if (!editingRequisitionId) return false;
    const r = requisitions.find((x) => x.id === editingRequisitionId);
    return r?.stage === 'converted_to_bill' || r?.isLocked;
  }, [editingRequisitionId, requisitions]);

  // Convert to Bill
  const handleConvertToBill = (customReq?: Requisition) => {
    if (!onOpenBillInEditor) return;

    if (customReq) {
      const cleanBillNo = customReq.convertedBillNo || extractBillNoFromReqNo(customReq.reqNo, (customReq as any).reqSequence || (customReq as any).seqNumber);
      // Mark customReq as Converted to Bill & Locked if not already
      if (customReq.stage !== 'converted_to_bill' || !customReq.convertedBillNo) {
        const updated = requisitions.map((r) => {
          if (r.id === customReq.id) {
            return {
              ...r,
              stage: 'converted_to_bill' as RequisitionStage,
              percentage: 100,
              isLocked: true,
              convertedBillNo: cleanBillNo,
              convertedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
          }
          return r;
        });
        saveRequisitionsToStorage(updated);
      }

      const spMatch = salespersons.find(
        (s) =>
          s.code === customReq.marketingPersonName ||
          (s.name && s.name.toLowerCase().includes((customReq.marketingPersonName || '').toLowerCase())) ||
          (customReq.marketingPersonName && customReq.marketingPersonName.toLowerCase().includes((s.name || '').toLowerCase()))
      );
      const spCode = spMatch?.code || '134';
      const spName = spMatch?.name || customReq.marketingPersonName || 'Subrata Sutradhar';

      const bHeader: BillHeader = {
        partyName: customReq.partyName || customReq.branchName || 'Customer',
        address: customReq.partyAddress || 'Madhupur',
        orderNumber: cleanBillNo,
        billNo: cleanBillNo,
        challanNo: (customReq.deliveryHistory && (customReq.deliveryHistory[0] as any)?.challanNo) || '',
        refNo: cleanBillNo,
        salesmanCode: spCode,
        salespersonName: spName,
        date: getTodayISO(),
        orderDate: getTodayISO(),
        challanDate: getTodayISO(),
        discountPercent: customReq.discountPercent !== undefined ? customReq.discountPercent : 10,
        isOfficeBill: true
      };

      const bLines: BillLineItem[] = (customReq.lines || []).map((l: any, idx) => {
        let matchedRate = Number(l.rate) || 0;
        if (!matchedRate && items.length > 0) {
          const mItem = items.find(
            (it) => it.id === l.itemId || it.name.toLowerCase().trim() === (l.itemName || l.description || '').toLowerCase().trim()
          );
          if (mItem) matchedRate = mItem.rate || 0;
        }
        const qty = Number(l.deliveredQty || l.requestedQty || l.approvedQty || l.quantity || 0);
        return {
          id: `bline-${Date.now()}-${idx}`,
          slNo: idx + 1,
          itemId: l.itemId || `item-${idx}`,
          itemDescription: l.itemName || l.description || 'Cable Item',
          sizeSpec: l.remarks || l.sizeSpec || '',
          coilQty: qty,
          unit: l.unit || 'Coils',
          rate: matchedRate,
          amount: matchedRate * (qty || 1)
        };
      });

      onOpenBillInEditor(bHeader, bLines);
      return;
    }

    // From current form
    if (editingRequisitionId) {
      const updated = requisitions.map((r) => {
        if (r.id === editingRequisitionId) {
          return {
            ...r,
            stage: 'converted_to_bill' as RequisitionStage,
            percentage: 100,
            isLocked: true,
            convertedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
        }
        return r;
      });
      saveRequisitionsToStorage(updated);
    }

    const cleanCurrentBillNo = extractBillNoFromReqNo(formattedReqNo, reqSequence);
    const spMatch = salespersons.find(
      (s) =>
        s.code === marketingPerson ||
        (s.name && s.name.toLowerCase().includes((marketingPerson || '').toLowerCase())) ||
        (marketingPerson && marketingPerson.toLowerCase().includes((s.name || '').toLowerCase()))
    );
    const spCode = spMatch?.code || '134';
    const spName = spMatch?.name || marketingPerson || 'Subrata Sutradhar';

    const bHeader: BillHeader = {
      partyName: partyName || 'Cash Party',
      address: partyAddress || 'Madhupur',
      orderNumber: cleanCurrentBillNo,
      billNo: cleanCurrentBillNo,
      challanNo: '',
      refNo: cleanCurrentBillNo,
      salesmanCode: spCode,
      salespersonName: spName,
      date: getTodayISO(),
      orderDate: getTodayISO(),
      challanDate: getTodayISO(),
      discountPercent: discountPercent,
      isOfficeBill: true
    };

    const bLines: BillLineItem[] = lines.map((l, idx) => ({
      id: `bline-${Date.now()}-${idx}`,
      slNo: idx + 1,
      itemId: l.itemId || `item-${idx}`,
      itemDescription: l.description,
      sizeSpec: formatColorsRemarksForSlip(l),
      coilQty: l.quantity,
      unit: l.unit || 'Coils',
      rate: l.rate || 0,
      amount: (l.rate || 0) * (l.quantity || 1)
    }));

    onOpenBillInEditor(bHeader, bLines);
  };

  // Email Requisition Handler (Attaches Excel sheet matching the exact screenshot layout)
  const handleOpenEmailModal = async (customReq?: Requisition) => {
    const targetReqNo = customReq?.reqNo || formattedReqNo;
    const targetPartyName = customReq?.partyName || customReq?.branchName || partyName || 'Customer';
    let targetPartyAddress = customReq ? (customReq.partyAddress || '') : partyAddress;
    if (!targetPartyAddress && targetPartyName && targetPartyName !== 'Customer') {
      const matched = parties.find((p) => p.name.trim().toLowerCase() === targetPartyName.trim().toLowerCase());
      if (matched?.address) {
        targetPartyAddress = matched.address;
      }
    }
    const targetReqDate = customReq ? formatDateDDMMYY(customReq.date) : reqDate;
    const targetDelvDate = customReq?.delvDateStr || delvDate;
    const targetLines = customReq ? customReq.lines.map((l: any) => ({
      description: l.itemName || l.description || '',
      quantity: l.requestedQty || l.approvedQty || l.quantity || 0,
      unit: l.unit || 'Coils',
      red: l.red,
      black: l.black,
      yellow: l.yellow,
      green: l.green,
      blue: l.blue,
      remarks: l.remarks || ''
    })) : slipDisplayLines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unit: l.unit || 'Coils',
      red: l.red,
      black: l.black,
      yellow: l.yellow,
      green: l.green,
      blue: l.blue,
      remarks: l.remarks || ''
    }));

    const excelPayload: RequisitionExcelData = {
      reqNo: targetReqNo,
      reqDate: targetReqDate,
      delvDate: targetDelvDate,
      toDestination: toDestination,
      partyName: targetPartyName,
      partyAddress: targetPartyAddress,
      lines: targetLines,
      reqBySignature: customReq?.createdByName || marketingPerson || reqBySignature || 'Subrata',
      preparedBySignature: preparedBySignature || marketingPerson || 'Rajon',
      checkedBySignature: checkedBySignature || 'Shaheen Khan',
      approvedBySignature: approvedBySignature || 'Shaheen Khan'
    };

    const base64Excel = await generateRequisitionExcelBase64(excelPayload);
    
    // Parse sequence number and center/person info for filename and subject:
    const centerName = (
      selectedSalesCenter ||
      customReq?.branchName ||
      (targetPartyName && targetPartyName.toLowerCase().includes('sales center') ? targetPartyName : '') ||
      'Madhupur Sales Center'
    ).replace(/\s*\/\s*Showroom/i, '').trim();

    const personName = (
      marketingPerson ||
      customReq?.createdByName ||
      customReq?.marketingPersonName ||
      'Subrata Sutradhar'
    ).trim();
    const shortPerson = personName.split(' ')[0].trim() || 'Subrata';

    const rawTarget = (targetReqNo || String(reqSequence)).trim();
    let seqNum = String(reqSequence || '01');
    const seqMatch = rawTarget.match(/(?:^|[^0-9])([0-9]{1,4})(?:[^0-9]|$)/);
    if (seqMatch && seqMatch[1]) {
      const n = parseInt(seqMatch[1], 10);
      seqNum = !isNaN(n) && n > 0 ? (n < 10 ? `0${n}` : String(n)) : seqMatch[1];
    }

    const effectivePrefix = (reqPrefix || customReq?.prefix || '').trim();
    let fileName = '';
    if (effectivePrefix || (targetReqNo.includes('-') && !targetReqNo.includes('req #'))) {
      const cleanNo = targetReqNo.replace(/^(req\s*#\s*)+/i, '').trim();
      fileName = `Req # ${cleanNo}.xlsx`;
    } else {
      fileName = `Req # ${seqNum}(${shortPerson}).xlsx`;
    }

    const mailSubject = `REQ # ${seqNum} (${centerName})`;

    // Calculate amounts for the email body:
    const grossAmt = customReq
      ? customReq.lines.reduce((s, l) => s + (l.rate || 0) * (l.approvedQty || l.requestedQty || 0), 0)
      : (calculatedGrossAmount > 0 ? calculatedGrossAmount : netAmountAfterDiscount);
    const formattedGross = Math.round(grossAmt || 0).toLocaleString('en-IN');

    // Body format requested by user:
    // Madhupur Sales Center (Subrata Sutradhar)
    // Amount-4,07,085 Tk.
    const bodyText = `${centerName} (${personName})\nAmount-${formattedGross} Tk.`;

    const richHtml = `
<div style="font-family: Arial, Helvetica, sans-serif; padding: 24px; background-color: #ffffff; color: #0f172a; max-width: 600px; border-radius: 12px; border: 1px solid #e2e8f0; line-height: 1.8;">
  <div style="font-size: 22px; font-weight: 800; color: #0f172a; margin-bottom: 12px; letter-spacing: -0.3px;">${centerName} (${personName})</div>
  <div style="font-size: 20px; font-weight: 700; color: #1e293b; margin-bottom: 16px;">Amount-${formattedGross} Tk.</div>
  <div style="margin-top: 24px; padding-top: 12px; border-top: 1px solid #cbd5e1; font-size: 13px; color: #64748b;">
    📎 Attached: <strong>${fileName}</strong> (Requisition Excel Sheet)
  </div>
</div>
`.trim();

    setEmailAttachmentName(fileName);
    setEmailAttachmentData(`data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64Excel}`);
    setEmailDefaultSubject(mailSubject);
    setEmailDefaultMessage(bodyText);
    setEmailHtmlBody(richHtml);
    setActiveEmailRequisitionId(customReq ? customReq.id : editingRequisitionId || null);
    setShowEmailModal(true);
  };

  // Open WhatsApp Modal for Requisition (Includes formatted summary + Attached Excel File)
  const handleOpenWhatsAppModal = async (customReq?: Requisition) => {
    const targetReqNo = customReq?.reqNo || formattedReqNo;
    const targetPartyName = customReq?.partyName || customReq?.branchName || partyName || 'Customer';
    let targetPartyAddress = customReq ? (customReq.partyAddress || '') : partyAddress;
    let targetPartyPhone = '';

    if (targetPartyName && targetPartyName !== 'Customer') {
      const matched = parties.find((p) => p.name.trim().toLowerCase() === targetPartyName.trim().toLowerCase());
      if (matched?.address && !targetPartyAddress) {
        targetPartyAddress = matched.address;
      }
      if (matched?.phone) {
        targetPartyPhone = matched.phone;
      }
    }

    const targetReqDate = customReq ? formatDateDDMMYY(customReq.date) : reqDate;
    const targetDelvDate = customReq?.delvDateStr || delvDate;
    const targetLines = customReq ? customReq.lines.map((l: any) => ({
      description: l.itemName || l.description || '',
      quantity: l.requestedQty || l.approvedQty || l.quantity || 0,
      unit: l.unit || 'Coils',
      red: l.red,
      black: l.black,
      yellow: l.yellow,
      green: l.green,
      blue: l.blue,
      remarks: l.remarks || ''
    })) : slipDisplayLines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unit: l.unit || 'Coils',
      red: l.red,
      black: l.black,
      yellow: l.yellow,
      green: l.green,
      blue: l.blue,
      remarks: l.remarks || ''
    }));

    const excelPayload: RequisitionExcelData = {
      reqNo: targetReqNo,
      reqDate: targetReqDate,
      delvDate: targetDelvDate,
      toDestination: toDestination,
      partyName: targetPartyName,
      partyAddress: targetPartyAddress,
      lines: targetLines,
      reqBySignature: customReq?.createdByName || marketingPerson || reqBySignature || 'Subrata',
      preparedBySignature: preparedBySignature || marketingPerson || 'Rajon',
      checkedBySignature: checkedBySignature || 'Shaheen Khan',
      approvedBySignature: approvedBySignature || 'Shaheen Khan'
    };

    const base64Excel = await generateRequisitionExcelBase64(excelPayload);
    const centerName = (
      selectedSalesCenter ||
      customReq?.branchName ||
      (targetPartyName && targetPartyName.toLowerCase().includes('sales center') ? targetPartyName : '') ||
      'Madhupur Sales Center'
    ).replace(/\s*\/\s*Showroom/i, '').trim();

    const personName = (
      marketingPerson ||
      customReq?.createdByName ||
      customReq?.marketingPersonName ||
      'Subrata Sutradhar'
    ).trim();
    const shortPerson = personName.split(' ')[0].trim() || 'Subrata';

    const rawTarget = (targetReqNo || String(reqSequence)).trim();
    let seqNum = String(reqSequence || '01');
    const seqMatch = rawTarget.match(/(?:^|[^0-9])([0-9]{1,4})(?:[^0-9]|$)/);
    if (seqMatch && seqMatch[1]) {
      const n = parseInt(seqMatch[1], 10);
      seqNum = !isNaN(n) && n > 0 ? (n < 10 ? `0${n}` : String(n)) : seqMatch[1];
    }

    const effectivePrefix = (reqPrefix || customReq?.prefix || '').trim();
    let fileName = '';
    if (effectivePrefix || (targetReqNo.includes('-') && !targetReqNo.includes('req #'))) {
      const cleanNo = targetReqNo.replace(/^(req\s*#\s*)+/i, '').trim();
      fileName = `Req # ${cleanNo}.xlsx`;
    } else {
      fileName = `Req # ${seqNum}(${shortPerson}).xlsx`;
    }

    const waMessage = buildRequisitionWhatsAppText(customReq);

    // Prepare WhatsApp states
    setWhatsAppAttachmentName(fileName);
    setWhatsAppAttachmentData(base64Excel);
    setWhatsAppDefaultPhone(targetPartyPhone);
    setWhatsAppDefaultMessage(waMessage);
    setWhatsAppPartyName(targetPartyName);
    setWhatsAppPartyAddress(targetPartyAddress);

    // Also pre-populate Email states for seamless transition
    const grossAmt = customReq
      ? customReq.lines.reduce((s, l) => s + (l.rate || 0) * (l.approvedQty || l.requestedQty || 0), 0)
      : (calculatedGrossAmount > 0 ? calculatedGrossAmount : netAmountAfterDiscount);
    const formattedGross = Math.round(grossAmt || 0).toLocaleString('en-IN');

    const mailSubject = `REQ # ${seqNum} (${centerName})`;
    const mailBodyText = `${centerName} (${personName})\nAmount-${formattedGross} Tk.`;

    const richHtml = `
<div style="font-family: Arial, Helvetica, sans-serif; padding: 24px; background-color: #ffffff; color: #0f172a; max-width: 600px; border-radius: 12px; border: 1px solid #e2e8f0; line-height: 1.8;">
  <div style="font-size: 22px; font-weight: 800; color: #0f172a; margin-bottom: 12px; letter-spacing: -0.3px;">${centerName} (${personName})</div>
  <div style="font-size: 20px; font-weight: 700; color: #1e293b; margin-bottom: 16px;">Amount-${formattedGross} Tk.</div>
  <div style="margin-top: 24px; padding-top: 12px; border-top: 1px solid #cbd5e1; font-size: 13px; color: #64748b;">
    📎 Attached: <strong>${fileName}</strong> (Requisition Excel Sheet)
  </div>
</div>
`.trim();

    setEmailAttachmentName(fileName);
    setEmailAttachmentData(`data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64Excel}`);
    setEmailDefaultSubject(mailSubject);
    setEmailDefaultMessage(mailBodyText);
    setEmailHtmlBody(richHtml);
    setActiveEmailRequisitionId(customReq ? customReq.id : editingRequisitionId || null);

    setShowWhatsAppModal(true);
  };

  // Download Excel File directly
  const handleDownloadExcel = async (customReq?: Requisition) => {
    const targetReqNo = customReq?.reqNo || formattedReqNo;
    const targetPartyName = customReq?.partyName || customReq?.branchName || partyName || 'Customer';
    let targetPartyAddress = customReq ? (customReq.partyAddress || '') : partyAddress;
    if (!targetPartyAddress && targetPartyName && targetPartyName !== 'Customer') {
      const matched = parties.find((p) => p.name.trim().toLowerCase() === targetPartyName.trim().toLowerCase());
      if (matched?.address) {
        targetPartyAddress = matched.address;
      }
    }
    const targetReqDate = customReq ? formatDateDDMMYY(customReq.date) : reqDate;
    const targetDelvDate = customReq?.delvDateStr || delvDate;
    const targetLines = customReq ? customReq.lines.map((l: any) => ({
      description: l.itemName || l.description || '',
      quantity: l.requestedQty || l.approvedQty || l.quantity || 0,
      unit: l.unit || 'Coils',
      red: l.red,
      black: l.black,
      yellow: l.yellow,
      green: l.green,
      blue: l.blue,
      remarks: l.remarks || ''
    })) : slipDisplayLines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unit: l.unit || 'Coils',
      red: l.red,
      black: l.black,
      yellow: l.yellow,
      green: l.green,
      blue: l.blue,
      remarks: l.remarks || ''
    }));

    const excelPayload: RequisitionExcelData = {
      reqNo: targetReqNo,
      reqDate: targetReqDate,
      delvDate: targetDelvDate,
      toDestination: toDestination,
      partyName: targetPartyName,
      partyAddress: targetPartyAddress,
      lines: targetLines,
      reqBySignature: customReq?.createdByName || marketingPerson || reqBySignature || 'Subrata',
      preparedBySignature: preparedBySignature || marketingPerson || 'Rajon',
      checkedBySignature: checkedBySignature || 'Shaheen Khan',
      approvedBySignature: approvedBySignature || 'Shaheen Khan'
    };

    const rawTarget = (targetReqNo || String(reqSequence)).trim();
    let seqNum = String(reqSequence || '01');
    const seqMatch = rawTarget.match(/(?:^|[^0-9])([0-9]{1,4})(?:[^0-9]|$)/);
    if (seqMatch && seqMatch[1]) {
      const n = parseInt(seqMatch[1], 10);
      seqNum = !isNaN(n) && n > 0 ? (n < 10 ? `0${n}` : String(n)) : seqMatch[1];
    }
    const personName = (rawTarget.split('-')[1]?.trim() || (customReq?.createdByName || marketingPerson) || 'Subrata').trim();
    const shortPerson = personName.split(' ')[0].trim() || 'Subrata';

    const effectivePrefix = (reqPrefix || customReq?.prefix || '').trim();
    let fileName = '';
    if (effectivePrefix || (targetReqNo.includes('-') && !targetReqNo.includes('req #'))) {
      const cleanNo = targetReqNo.replace(/^(req\s*#\s*)+/i, '').trim();
      fileName = `Req # ${cleanNo}.xlsx`;
    } else {
      fileName = `Req # ${seqNum}(${shortPerson}).xlsx`;
    }

    await downloadRequisitionExcel(excelPayload, fileName);
  };

  // Build sales center parties under sales center in-charge
  const salesCenterParties = useMemo(() => {
    return (activeBranches || []).map((b) => {
      // Find matching in-charge
      const matchedSp = 
        (b.inChargeName ? salespersons.find(s => s.name.toLowerCase() === b.inChargeName?.toLowerCase()) : undefined) ||
        salespersons.find(s => s.branchName === b.name && (s.role === 'incharge' || (s as any).isBranchInCharge)) ||
        salespersons.find(s => s.branchName === b.name);
      
      const inCharge = b.inChargeName || matchedSp?.name || `${b.name} In-Charge`;
      
      return {
        id: `sales-center-${b.id || b.name}`,
        name: b.name,
        address: b.address || `${b.name}, Poly Cables`,
        phone: b.phone || b.inChargePhone || matchedSp?.phone || '',
        salespersonName: inCharge,
        isSalesCenter: true,
        inChargeName: inCharge,
        branchId: b.id,
        branchName: b.name
      } as Party & { isSalesCenter?: boolean; inChargeName?: string };
    });
  }, [activeBranches, salespersons]);

  // Combined party list with sales centers
  const allPartiesWithSalesCenters = useMemo(() => {
    const scopedParties = requisitionPartyScopeBranch
      ? parties.filter((party) =>
          partyMatchesBranch(
            party,
            requisitionPartyScopeBranch,
            activeBranches,
            salespersons
          )
        )
      : parties;
    const scopedSalesCenters = requisitionPartyScopeBranch
      ? salesCenterParties.filter((party) =>
          partyMatchesBranch(
            party,
            requisitionPartyScopeBranch,
            activeBranches,
            salespersons
          )
        )
      : salesCenterParties;
    return [
      ...scopedSalesCenters.filter(
        (center) =>
          !scopedParties.some(
            (party) => party.name.trim().toLowerCase() === center.name.trim().toLowerCase()
          )
      ),
      ...scopedParties.filter(
        (party) =>
          !scopedSalesCenters.some(
            (center) => center.name.trim().toLowerCase() === party.name.trim().toLowerCase()
          )
      )
    ];
  }, [
    parties,
    salesCenterParties,
    requisitionPartyScopeBranch,
    activeBranches,
    salespersons
  ]);

  // Filtered party list
  const filteredParties = useMemo(() => {
    if (!partyName.trim()) return allPartiesWithSalesCenters;
    return allPartiesWithSalesCenters.filter((p) =>
      matchesFlexibleSearch(
        `${p.name} ${p.address || ''} ${p.phone || ''} ${(p as any).inChargeName || ''} ${p.salespersonName || ''}`,
        partyName.trim()
      )
    );
  }, [allPartiesWithSalesCenters, partyName]);

  const pageHeadTitle = isApprovalPage
    ? activeTab === 'approved_history'
      ? 'Approved History'
      : activeTab === 'delivered'
        ? 'Delivered Requisitions'
        : 'Approve Requisition'
    : activeTab === 'entry_slip'
      ? 'Sales Requisition Entry'
      : activeTab === 'approved_history'
        ? 'Approved History'
        : activeTab === 'delivered'
          ? 'Delivered'
          : 'Sales Requisition History';

  return (
    <div className="min-h-screen text-white font-sans pt-0 pb-4 px-1 sm:px-3 requisition-page-wrapper">
      {/* Top View Selector Bar (Only shown in non-approval mode, zero top action buttons) */}
      {!isApprovalPage && (
        <div className="max-w-[1700px] mx-auto mb-3 cyber-glass-card rounded-2xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 no-print">
          <h1 className="text-sm font-black tracking-tight text-cyan-200">
            {pageHeadTitle}
          </h1>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold text-cyan-200/80 uppercase tracking-wider">View:</label>
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value as any)}
              className="bg-[#061520] border border-cyan-500/35 text-cyan-100 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-cyan-400 cursor-pointer"
            >
              {!isFactoryRole && <option value="entry_slip">Requisition Entry Slip</option>}
              {!isFactoryRole && <option value="list">Requisition History ({requisitions.length})</option>}
              <option value="approved_history">
                Approved History ({isFactoryRole
                  ? approvedListRequisitions.length
                  : requisitions.filter((r) => r.isApproved || r.stage === 'sent_to_factory' || r.stage === 'factory_dispatched' || r.stage === 'factory_received' || r.stage === 'goods_received' || r.stage === 'converted_to_bill').length})
              </option>
              <option value="delivered">Delivered ({deliveredListRequisitions.length})</option>
            </select>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: MAIN ENTRY SLIP (SPLIT VIEW MATCHING THE SCREENSHOT EXACTLY)       */}
      {/* ========================================================================= */}
      {activeTab === 'entry_slip' && (
        <div className="max-w-5xl xl:max-w-6xl mx-auto space-y-4">
          {/* Active Editing Action Banner (shown when editing existing requisition) */}
          {editingRequisitionId && (
            <div className="no-print cyber-glass-card border border-amber-400/45 p-3 sm:p-4 rounded-2xl flex flex-wrap items-center justify-between gap-2.5 shadow-2xl sticky top-2 z-20">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleSaveRequisition(true)}
                  className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-black rounded-xl flex items-center space-x-1.5 shadow-lg transition-all cursor-pointer hover:scale-105"
                  title="Update factory requisition"
                >
                  <Save className="w-4 h-4 font-black" />
                  <span>Update Requisition</span>
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-3 py-2 bg-rose-500/20 hover:bg-rose-500 text-rose-200 hover:text-white border border-rose-400/40 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Cancel Edit
                </button>
              </div>
            </div>
          )}

          {/* Active Editing Banner */}
          {editingRequisitionId && (
            <div className="no-print p-3 bg-amber-500/15 border border-amber-400/40 rounded-xl flex items-center justify-between gap-2 text-xs backdrop-blur-md">
              <div className="flex items-center space-x-2 text-amber-300 font-bold">
                <Edit className="w-4 h-4 text-amber-400" />
                <span>
                  Editing Requisition: <strong className="font-mono font-black">{formattedReqNo}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="text-amber-300 hover:text-amber-100 underline font-bold cursor-pointer"
              >
                Switch to Fresh Slip
              </button>
            </div>
          )}

          {/* THE REQUISITION ENTRY SLIP FORM (DIRECT INTERACTIVE PAD) */}
          <div
            id="requisition-print-slip"
            className="bg-white text-slate-950 p-3 sm:p-8 rounded-2xl shadow-2xl border-2 border-slate-300 font-sans space-y-4 print:shadow-none print:border-0 print:p-0 print:m-0 print:max-w-none"
          >
            {/* Slip Branding Header */}
            <div className="text-center space-y-1 pb-1">
              <div className="flex justify-center mb-1">
                <PolyCablesLogo size="xl" showSubtitle={true} subtitleText="IND. LTD." />
              </div>
              <div className="flex justify-center">
                <span className="bg-slate-950 text-white text-[11px] sm:text-xs font-black px-5 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                  REQUISITION ENTRY SLIP
                </span>
              </div>
            </div>

            {/* Top Grid Form Fields: Styled as Requisition Slip Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-2 pb-1 border-y border-slate-200">
              {/* LEFT COLUMN: Req #, Party Name (spacious area, decoupled from marketing), Party Address */}
              <div className="space-y-2">
                {/* Prefix Box (Up the Req No, blank by default, used if needed) */}
                <div className="flex items-center space-x-2">
                  <span className="w-20 sm:w-24 font-bold text-slate-700 flex-shrink-0">
                    Prefix:
                  </span>
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 sm:space-x-2 flex-1 min-w-0">
                    <input
                      ref={reqPrefixInputRef}
                      type="text"
                      value={reqPrefix}
                      onChange={(e) => setReqPrefix(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          reqSeqInputRef.current?.focus();
                          reqSeqInputRef.current?.select();
                        }
                      }}
                      placeholder="Prefix (optional, e.g. TC, SC, HO)"
                      className="w-full sm:w-48 p-1.5 bg-slate-50 border border-slate-300 rounded font-semibold text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none shadow-inner text-xs placeholder:text-slate-400"
                      title="Requisition Prefix (e.g. TC, SC, HO - leave blank if not needed)"
                    />
                    <span className="text-[10px] text-slate-400 italic">
                      (Optional - blank if not used)
                    </span>
                  </div>
                </div>

                {/* Req # (Num-Marketing) */}
                <div className="flex items-center space-x-2">
                  <span className="w-24 font-bold text-slate-700 flex-shrink-0">
                    Req No:
                  </span>
                  <div className="flex items-center space-x-1.5 flex-1">
                    <input
                      ref={reqSeqInputRef}
                      type="text"
                      inputMode="numeric"
                      value={reqSequence}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          setReqSequence('');
                        } else {
                          const clean = val.replace(/\D/g, '');
                          setReqSequence(clean ? parseInt(clean, 10) : '');
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          partyInputRef.current?.focus();
                          partyInputRef.current?.select();
                          setPartySearchOpen(true);
                        }
                      }}
                      placeholder="Req#"
                      className="w-16 p-1.5 bg-slate-50 border border-slate-300 rounded font-black font-mono text-center text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none shadow-inner text-xs"
                      title="Sequence Number (Press Backspace to clear, Enter to move to Party Name)"
                    />
                    <input
                      type="text"
                      readOnly
                      value={formattedReqNo}
                      className="flex-1 p-1.5 bg-blue-50/70 border border-blue-200 rounded text-blue-900 font-bold font-mono text-xs focus:outline-none cursor-default"
                    />
                  </div>
                </div>

                {/* Party Name * with Expanded Input Area and Autocomplete */}
                <div className="flex items-center space-x-2 relative" ref={partySearchRef}>
                  <span className="w-24 font-bold text-slate-700 flex-shrink-0">
                    Party Name: <span className="text-rose-500">*</span>
                  </span>
                  <div className="relative flex-1">
                    <input
                      ref={partyInputRef}
                      type="text"
                      value={partyName}
                      onFocus={() => {
                        setPartySearchOpen(true);
                        setPartyHighlightedIndex(0);
                      }}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPartyName(val);
                        setPartySearchOpen(true);
                        setPartyHighlightedIndex(0);
                        const matched = allPartiesWithSalesCenters.find((p) => p.name.trim().toLowerCase() === val.trim().toLowerCase());
                        if (matched) {
                          if (matched.address) setPartyAddress(matched.address);
                          const inChargeOrSp = (matched as any).inChargeName || matched.salespersonName;
                          if (inChargeOrSp && inChargeOrSp.trim()) {
                            setMarketingPerson(inChargeOrSp.trim());
                            setReqBySignature(inChargeOrSp.trim());
                          }
                          const center = getSalesCenterForParty(matched);
                          setSelectedSalesCenter(center);
                          setSalesCenterFilter(center);
                          if ((matched as any).isSalesCenter) {
                            setToDestination('Factory');
                            setDeliverySite(matched.address || `${matched.name}, Poly Cables`);
                          } else {
                            setToDestination(center);
                          }
                          const nextSeq = getNextSeqForSalesCenter(center, requisitions, activeBranches);
                          setReqSequence(nextSeq < 10 ? String(nextSeq).padStart(2, '0') : String(nextSeq));
                          const autoDue = calculatePartyCurrentDue(matched.name, matched);
                          setCustomerCurrentDue(autoDue);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!partySearchOpen) {
                            setPartySearchOpen(true);
                            setPartyHighlightedIndex(0);
                          } else if (filteredParties.length > 0) {
                            setPartyHighlightedIndex((prev) => (prev + 1) % filteredParties.length);
                          }
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!partySearchOpen) {
                            setPartySearchOpen(true);
                            setPartyHighlightedIndex(0);
                          } else if (filteredParties.length > 0) {
                            setPartyHighlightedIndex((prev) => (prev - 1 + filteredParties.length) % filteredParties.length);
                          }
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (partySearchOpen && filteredParties.length > 0) {
                            const chosen = filteredParties[partyHighlightedIndex] || filteredParties[0];
                            handleSelectParty(chosen);
                          } else {
                            const valTrim = partyName.trim().toLowerCase();
                            const matched = allPartiesWithSalesCenters.find(
                              (p) => p.name.trim().toLowerCase() === valTrim || cleanBranchName(p.name).toLowerCase() === valTrim
                            );
                            if (matched) {
                              handleSelectParty(matched);
                            } else {
                              setPartySearchOpen(false);
                              const firstLineId = lines[0]?.id;
                              if (firstLineId && itemInputRefs.current[firstLineId]) {
                                itemInputRefs.current[firstLineId]?.focus();
                                itemInputRefs.current[firstLineId]?.select();
                              }
                            }
                          }
                        } else if (e.key === 'Escape') {
                          setPartySearchOpen(false);
                        }
                      }}
                      placeholder="Search or enter party name..."
                      className="w-full p-2 bg-slate-50 border border-slate-300 rounded text-slate-900 font-bold text-xs focus:bg-white focus:border-blue-600 focus:outline-none shadow-inner"
                    />
                    <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-slate-400 pointer-events-none" />

                    {partySearchOpen && (
                      <div
                        ref={partyListContainerRef}
                        className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-slate-300 rounded-lg shadow-2xl max-h-60 overflow-y-auto divide-y divide-slate-100"
                      >
                        {filteredParties.length === 0 ? (
                          <div className="p-3 text-slate-500 text-center text-xs italic">No matching party found</div>
                        ) : (
                          filteredParties.map((p, pIdx) => {
                            const isHighlighted = pIdx === partyHighlightedIndex;
                            const isSC = Boolean((p as any).isSalesCenter);
                            const isDuplicateName = (partyNameCounts.get((p.name || '').trim().toLowerCase()) || 0) > 1;
                            const displayPartyText = isDuplicateName && p.address?.trim()
                              ? `${p.name}, ${p.address.trim()}`
                              : p.name;

                            return (
                              <button
                                key={p.id ? `${p.id}-${pIdx}` : `party-${pIdx}`}
                                type="button"
                                data-req-party-highlighted={isHighlighted ? 'true' : 'false'}
                                onClick={() => handleSelectParty(p)}
                                onMouseEnter={() => setPartyHighlightedIndex(pIdx)}
                                className={`w-full text-left px-3 py-2 flex items-center justify-between text-xs cursor-pointer transition-colors whitespace-nowrap ${
                                  isHighlighted
                                    ? 'bg-blue-100 text-blue-950 font-bold border-l-4 border-blue-600'
                                    : 'hover:bg-slate-100 text-slate-800'
                                }`}
                                title={`${p.name}${p.address ? ` (${p.address})` : ''}`}
                              >
                                <span className="truncate text-xs font-bold text-slate-900 leading-normal">
                                  {displayPartyText}
                                </span>
                                {isSC && (
                                  <span className="shrink-0 text-[10px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.5 rounded border border-amber-300 ml-2">
                                    Sales Center
                                  </span>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Party Address */}
                <div className="flex items-center space-x-2">
                  <span className="w-24 font-bold text-slate-700 flex-shrink-0">
                    Address:
                  </span>
                  <input
                    type="text"
                    value={partyAddress}
                    onChange={(e) => setPartyAddress(e.target.value)}
                    placeholder="e.g. Ghatail / Sagordighi"
                    className="flex-1 p-1.5 bg-slate-50 border border-slate-300 rounded text-slate-800 text-xs focus:bg-white focus:border-blue-600 focus:outline-none shadow-inner"
                  />
                </div>
              </div>

              {/* RIGHT COLUMN: Req Date & Delivery Date on two lines in same column up the marketing */}
              <div className="space-y-2">
                {/* Req Date (Line 1) */}
                <div className="flex items-center space-x-2">
                  <span className="w-24 font-bold text-slate-700 flex-shrink-0">Req Date:</span>
                  <DateInputWithPicker
                    value={reqDate}
                    onChange={setReqDate}
                    valueFormat="ddmmyy"
                    theme="light"
                    placeholder="dd.mm.yy"
                    className="flex-1"
                    inputClassName="p-1.5 bg-slate-50 border-slate-300 text-slate-900 font-bold text-xs focus:bg-white focus:border-blue-600 shadow-inner"
                    title="Pick Req Date (dd.mm.yy)"
                  />
                </div>

                {/* Delivery Date (Line 2) */}
                <div className="flex items-center space-x-2">
                  <span className="w-24 font-bold text-slate-700 flex-shrink-0">Delivery Date:</span>
                  <DateInputWithPicker
                    value={delvDate}
                    onChange={setDelvDate}
                    valueFormat="ddmmyy"
                    theme="light"
                    placeholder="dd.mm.yy"
                    className="flex-1"
                    inputClassName="p-1.5 bg-slate-50 border-slate-300 text-slate-900 font-bold text-xs focus:bg-white focus:border-blue-600 shadow-inner"
                    title="Pick Delivery Date (dd.mm.yy)"
                  />
                </div>

                {/* Prepared By (Line 3 - Below the two dates) */}
                <div className="flex items-center space-x-2">
                  <span className="w-24 font-bold text-slate-700 flex-shrink-0 text-xs">
                    Prepared By:
                  </span>
                  {isSuperAdmin ? (
                    <div className="flex-1 flex flex-wrap sm:flex-nowrap items-center gap-1.5">
                      <select
                        value={userDirectoryNames.includes(marketingPerson) ? marketingPerson : '__custom__'}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val !== '__custom__') {
                            setMarketingPerson(val);
                            setPreparedBySignature(val);
                            setReqBySignature(val);
                            try { localStorage.setItem('polycables_req_prepared_by', val); } catch {}
                          }
                        }}
                        className="flex-1 min-w-[130px] p-1.5 bg-blue-50 border border-blue-300 rounded font-bold text-slate-900 text-xs focus:bg-white focus:border-blue-600 focus:outline-none shadow-inner cursor-pointer"
                        title="Super Admin can change/override the Prepared By person"
                      >
                        {userDirectoryNames.map((name, nIdx) => (
                          <option key={`${name}-${nIdx}`} value={name}>
                            {name}
                          </option>
                        ))}
                        {marketingPerson && !userDirectoryNames.includes(marketingPerson) && (
                          <option value="__custom__">{marketingPerson} (Custom)</option>
                        )}
                      </select>
                      <input
                        type="text"
                        value={marketingPerson}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMarketingPerson(val);
                          setPreparedBySignature(val);
                          setReqBySignature(val);
                          try { localStorage.setItem('polycables_req_prepared_by', val); } catch {}
                        }}
                        placeholder="Or type custom name"
                        className="w-36 p-1.5 bg-white border border-blue-300 rounded font-bold text-slate-800 text-xs focus:border-blue-600 focus:outline-none shadow-xs"
                        title="Super Admin can freely edit or type Prepared By name"
                      />
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center space-x-2">
                      <div className="flex-1 p-1.5 bg-slate-100 border border-slate-300 rounded font-bold text-slate-900 text-xs shadow-inner">
                        {marketingPerson || loggedInSalespersonName || 'Subrata'}
                      </div>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold border border-emerald-200 whitespace-nowrap">
                        Logged In User
                      </span>
                    </div>
                  )}
                </div>

                {/* Delivery Site (Line 4) */}
                <div className="flex items-center space-x-2">
                  <span className="w-24 font-bold text-slate-700 flex-shrink-0">
                    Delivery Site:
                  </span>
                  <input
                    type="text"
                    value={deliverySite}
                    onChange={(e) => setDeliverySite(e.target.value)}
                    placeholder="e.g. Site #4, Madhupur Road / Factory Store"
                    className="flex-1 p-1.5 bg-slate-50 border border-slate-300 rounded text-slate-800 text-xs focus:bg-white focus:border-blue-600 focus:outline-none shadow-inner"
                  />
                </div>
              </div>
            </div>

            {/* ========================================================= */}
            {/* PARTICULARS & COLOUR QUANTITIES SLIP TABLE                */}
            {/* ========================================================= */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between no-print px-1">
                <span className="text-xs font-bold text-slate-700">Particulars &amp; Quantity ({lines.length} lines)</span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      const newLineId = `line-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
                      setLines((prev) => [
                        ...prev,
                        {
                          id: newLineId,
                          description: '',
                          unit: 'Coils',
                          red: '',
                          black: '',
                          yellow: '',
                          green: '',
                          blue: '',
                          quantity: 0,
                          remarks: '',
                          isSpecialItem: false,
                          rate: 0,
                          amount: 0
                        }
                      ]);
                    }}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded text-xs font-bold flex items-center space-x-1 cursor-pointer transition-colors"
                  >
                    <Plus className="w-3 h-3 text-slate-600" />
                    <span>+ Add 1 Line</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const newItems: RequisitionEntryLine[] = Array.from({ length: 4 }, (_, i) => ({
                        id: `line-${Date.now()}-${Math.random().toString(36).substring(2, 6)}-${i}`,
                        description: '',
                        unit: 'Coils',
                        red: '',
                        black: '',
                        yellow: '',
                        green: '',
                        blue: '',
                        quantity: 0,
                        remarks: '',
                        isSpecialItem: false,
                        rate: 0,
                        amount: 0
                      }));
                      setLines((prev) => [...prev, ...newItems]);
                    }}
                    className="px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 rounded text-xs font-extrabold flex items-center space-x-1 cursor-pointer transition-colors shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5 text-blue-600" />
                    <span>+ Increase 4 Lines</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border-2 border-slate-400">
                <table className="w-full text-xs text-left border-collapse bg-white">
                  <thead>
                    <tr className="bg-slate-100 text-slate-900 text-[11px] uppercase font-black border-b-2 border-slate-400 divide-x divide-slate-400">
                      <th className="py-2.5 px-1 text-center w-10">SL</th>
                      <th className="py-2.5 px-3 min-w-[340px]">ITEM DESCRIPTION</th>
                      <th className="py-2.5 px-1 text-center w-20">QTY</th>
                      <th className="py-2.5 px-1 text-center w-20">UNIT</th>
                      <th className="py-2.5 px-2 text-center w-36">REMARKS</th>
                      <th className="py-2.5 px-1 text-center w-8 no-print"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300">
                    {lines.map((line, idx) => {
                      const isItemSearchActive = activeItemSearchRowId === line.id;
                      const hasQuery = Boolean(line.description && line.description.trim().length > 0);
                      const matchedItems = availableItems.filter((i) => matchesCableItem(i, line.description)).slice(0, 60);
                      const groupedItems = groupItemsByCategoryOrder(matchedItems, categoryOrder);
                      const filteredItems = groupedItems.orderedItems;
                      const isLineFilled = Boolean(line.description?.trim() || (Number(line.quantity) || 0) > 0);

                      return (
                        <tr key={line.id} className="divide-x divide-slate-300 hover:bg-blue-50/30 transition-colors">
                          {/* SL: Only show SL number if line has item/data; otherwise blank */}
                          <td className="py-1.5 px-1 text-center font-bold text-slate-700 font-mono text-xs">
                            {isLineFilled ? idx + 1 : ''}
                          </td>

                          {/* Item Description (Dynamic Search Box - Spacious Area) */}
                          <td className="py-1 px-2.5 relative item-search-container" data-item-row-id={line.id}>
                            <div className="relative flex items-center">
                              <input
                                id={`req-item-input-${line.id}`}
                                ref={(el) => { itemInputRefs.current[line.id] = el; }}
                                type="text"
                                value={line.description}
                                onPaste={(e) => {
                                  const text = e.clipboardData.getData('text');
                                  if (text && (text.includes('\n') || text.includes('\t'))) {
                                    e.preventDefault();
                                    handlePasteItemsFromExcel(line.id, text);
                                  }
                                }}
                                onFocus={(e) => {
                                  setActiveItemSearchRowId(line.id);
                                  setItemHighlightedIndex(0);
                                  e.target.select();
                                }}
                                onChange={(e) => {
                                  handleUpdateLine(line.id, 'description', e.target.value);
                                  setActiveItemSearchRowId(line.id);
                                  setItemHighlightedIndex(0);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (isItemSearchActive && filteredItems.length > 0) {
                                      setItemHighlightedIndex((prev) => (prev + 1) % filteredItems.length);
                                    } else if (idx < lines.length - 1) {
                                      itemInputRefs.current[lines[idx + 1].id]?.focus();
                                    }
                                  } else if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (isItemSearchActive && filteredItems.length > 0) {
                                      setItemHighlightedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
                                    } else if (idx > 0) {
                                      itemInputRefs.current[lines[idx - 1].id]?.focus();
                                    }
                                  } else if (e.key === 'Enter') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (isItemSearchActive && filteredItems.length > 0) {
                                      const chosenItem = filteredItems[itemHighlightedIndex] || filteredItems[0];
                                      if (chosenItem) {
                                        handleSelectItemForLine(line.id, chosenItem);
                                        return;
                                      }
                                    }
                                    if (!hasQuery) {
                                      const lineQty = Number(line.quantity) || 0;
                                      if (lineQty === 0) {
                                        handleLineEnterWithZeroQty(line.id);
                                      } else {
                                        qtyInputRefs.current[line.id]?.focus();
                                      }
                                    } else {
                                      qtyInputRefs.current[line.id]?.focus();
                                      setActiveItemSearchRowId(null);
                                    }
                                  } else if (e.key === 'Escape') {
                                    setActiveItemSearchRowId(null);
                                  }
                                }}
                                placeholder={idx === 0 ? "Search (e.g. 1.3rm, 1.5re, 12tt)..." : ""}
                                className="w-full py-1.5 px-1 pr-14 bg-transparent border-0 font-bold text-slate-900 text-xs sm:text-[13px] focus:bg-blue-50/50 focus:outline-none rounded tracking-wide"
                              />

                              <div className="absolute right-1 flex items-center space-x-1 no-print">
                                {line.description ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleUpdateLine(line.id, 'description', '');
                                      handleUpdateLine(line.id, 'itemId', '');
                                      handleUpdateLine(line.id, 'itemCode', '');
                                      handleUpdateLine(line.id, 'rate', 0);
                                      handleUpdateLine(line.id, 'amount', 0);
                                      handleUpdateLine(line.id, 'isSpecialItem', false);
                                      setActiveItemSearchRowId(line.id);
                                      setItemHighlightedIndex(0);
                                      itemInputRefs.current[line.id]?.focus();
                                    }}
                                    className="p-0.5 text-slate-400 hover:text-red-500 rounded cursor-pointer"
                                  >
                                    ✕
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isItemSearchActive) {
                                      setActiveItemSearchRowId(null);
                                    } else {
                                      setActiveItemSearchRowId(line.id);
                                      setItemHighlightedIndex(0);
                                      itemInputRefs.current[line.id]?.focus();
                                    }
                                  }}
                                  className="p-0.5 text-slate-400 hover:text-blue-600 cursor-pointer"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Dropdown list with visible colored category badges for all categories */}
                            {isItemSearchActive && (
                              <div
                                ref={(el) => { itemListContainerRef.current[line.id] = el; }}
                                className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border-2 border-slate-400 rounded-lg shadow-2xl max-h-64 overflow-y-auto divide-y divide-slate-100 no-print"
                              >
                                <div className="px-2.5 py-1 bg-slate-100 text-[10px] font-bold text-slate-700 uppercase flex justify-between items-center sticky top-0 z-10 border-b border-slate-200">
                                  <span>Select Item ({filteredItems.length} found)</span>
                                  <button
                                    type="button"
                                    onClick={() => setActiveItemSearchRowId(null)}
                                    className="text-slate-500 hover:text-red-600"
                                  >
                                    ✕
                                  </button>
                                </div>
                                {filteredItems.length === 0 ? (
                                  <div className="p-3 text-slate-500 text-center italic text-xs">
                                    No cable item matched "{line.description}"
                                  </div>
                                ) : (
                                  groupedItems.groups.map((grp) => (
                                    <div key={grp.category} className="divide-y divide-slate-100">
                                      <div className="px-2.5 py-1 bg-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-700 border-y border-slate-200">
                                        {grp.category} ({grp.items.length})
                                      </div>
                                      {grp.items.map(({ item, flatIndex: itIdx }) => {
                                        const isHighlighted = itIdx === itemHighlightedIndex;
                                        const catBadge = getCategoryBadgeStyle(item.category);
                                        return (
                                          <button
                                            key={item.id ? `${item.id}-${itIdx}` : `req-item-${itIdx}`}
                                            type="button"
                                            data-req-item-highlighted={isHighlighted ? 'true' : 'false'}
                                            onMouseDown={(e) => {
                                              e.preventDefault();
                                              handleSelectItemForLine(line.id, item);
                                            }}
                                            onClick={() => handleSelectItemForLine(line.id, item)}
                                            onMouseEnter={() => setItemHighlightedIndex(itIdx)}
                                            className={`w-full text-left p-2 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                                              isHighlighted ? 'bg-blue-100 text-blue-950 border-l-4 border-blue-600 font-bold' : 'hover:bg-slate-50 text-slate-800'
                                            }`}
                                          >
                                            <div>
                                              <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                                                <span className="font-bold text-slate-900">
                                                  {getItemDisplayName(item)}
                                                </span>
                                                {item.category && (
                                                  <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${catBadge.bg} ${catBadge.text} ${catBadge.border}`}>
                                                    {item.category}
                                                  </span>
                                                )}
                                              </div>
                                              <div className="text-[10px] text-slate-500">
                                                {item.sizeSpec || ''}
                                              </div>
                                            </div>
                                            <div className="text-right flex-none pl-2">
                                              <span className="text-[11px] text-slate-900 font-mono font-bold">
                                                ৳{(item.rate ?? 0).toLocaleString('en-IN')}
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
                          </td>

                          {/* TOTAL QTY */}
                          <td className="py-1 px-1 text-center">
                            <input
                              id={`req-line-qty-${line.id}`}
                              ref={(el) => { qtyInputRefs.current[line.id] = el; }}
                              type="number"
                              min="0"
                              value={line.quantity === 0 ? '' : line.quantity}
                              placeholder=""
                              onChange={(e) =>
                                handleUpdateLine(
                                  line.id,
                                  'quantity',
                                  e.target.value === '' ? 0 : parseInt(e.target.value) || 0
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const lineQty = Number(line.quantity) || 0;
                                  if (lineQty === 0) {
                                    handleLineEnterWithZeroQty(line.id);
                                  } else {
                                    // Move immediately to next row's item description field
                                    const currentIdx = lines.findIndex((l) => l.id === line.id);
                                    if (currentIdx >= 0 && currentIdx < lines.length - 1) {
                                      const nextLineId = lines[currentIdx + 1].id;
                                      itemInputRefs.current[nextLineId]?.focus();
                                      itemInputRefs.current[nextLineId]?.select();
                                      setActiveItemSearchRowId(nextLineId);
                                    } else {
                                      // On the last line: automatically add a new line item and focus its description field
                                      const newLineId = `line-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
                                      setLines((prev) => [
                                        ...prev,
                                        {
                                          id: newLineId,
                                          description: '',
                                          unit: 'Coils',
                                          red: '',
                                          black: '',
                                          yellow: '',
                                          green: '',
                                          blue: '',
                                          quantity: 0,
                                          remarks: '',
                                          isSpecialItem: false,
                                          rate: 0,
                                          amount: 0
                                        }
                                      ]);
                                      setTimeout(() => {
                                        itemInputRefs.current[newLineId]?.focus();
                                        itemInputRefs.current[newLineId]?.select();
                                        setActiveItemSearchRowId(newLineId);
                                      }, 60);
                                    }
                                  }
                                } else if (e.key === 'ArrowDown' && idx < lines.length - 1) {
                                  e.preventDefault();
                                  qtyInputRefs.current[lines[idx + 1].id]?.focus();
                                } else if (e.key === 'ArrowUp' && idx > 0) {
                                  e.preventDefault();
                                  qtyInputRefs.current[lines[idx - 1].id]?.focus();
                                } else if (e.key === 'ArrowRight') {
                                  unitInputRefs.current[line.id]?.focus();
                                } else if (e.key === 'ArrowLeft') {
                                  itemInputRefs.current[line.id]?.focus();
                                }
                              }}
                              className="w-full p-1 bg-transparent border-0 text-slate-900 font-black text-center text-xs focus:bg-blue-50/50 focus:outline-none rounded font-mono"
                            />
                          </td>

                          {/* UNIT */}
                          <td className="py-1 px-1 text-center">
                            <select
                              ref={(el) => { unitInputRefs.current[line.id] = el; }}
                              value={isLineFilled ? line.unit : ''}
                              onChange={(e) => handleUpdateLine(line.id, 'unit', e.target.value || 'Coils')}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  remarksInputRefs.current[line.id]?.focus();
                                  remarksInputRefs.current[line.id]?.select();
                                } else if (e.key === 'ArrowRight') {
                                  e.preventDefault();
                                  remarksInputRefs.current[line.id]?.focus();
                                  remarksInputRefs.current[line.id]?.select();
                                } else if (e.key === 'ArrowLeft') {
                                  e.preventDefault();
                                  qtyInputRefs.current[line.id]?.focus();
                                } else if (e.key === 'ArrowDown' && idx < lines.length - 1) {
                                  e.preventDefault();
                                  unitInputRefs.current[lines[idx + 1].id]?.focus();
                                } else if (e.key === 'ArrowUp' && idx > 0) {
                                  e.preventDefault();
                                  unitInputRefs.current[lines[idx - 1].id]?.focus();
                                }
                              }}
                              className="w-full p-1 bg-transparent border-0 text-slate-800 text-xs font-semibold text-center focus:bg-blue-50/50 focus:outline-none rounded cursor-pointer"
                            >
                              {!isLineFilled && <option value=""></option>}
                              <option value="Coils">Coils</option>
                              <option value="Mtr">Mtr</option>
                              <option value="Mtrs">Mtrs</option>
                              <option value="Meter">Meter</option>
                              <option value="Bobin">Bobin</option>
                              <option value="Pcs">Pcs</option>
                              <option value="Yds">Yds</option>
                            </select>
                          </td>

                          {/* REMARKS */}
                          <td className="py-1 px-1 text-center">
                            <input
                              ref={(el) => { remarksInputRefs.current[line.id] = el; }}
                              type="text"
                              value={line.remarks}
                              onChange={(e) => handleUpdateLine(line.id, 'remarks', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const lineQty = Number(line.quantity) || 0;
                                  if (lineQty === 0) {
                                    handleLineEnterWithZeroQty(line.id);
                                  } else {
                                    const currentIdx = lines.findIndex((l) => l.id === line.id);
                                    if (currentIdx < lines.length - 1) {
                                      const nextLineId = lines[currentIdx + 1].id;
                                      itemInputRefs.current[nextLineId]?.focus();
                                      itemInputRefs.current[nextLineId]?.select();
                                      setActiveItemSearchRowId(nextLineId);
                                    } else {
                                      const newLineId = `line-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
                                      setLines((prev) => [
                                        ...prev,
                                        {
                                          id: newLineId,
                                          description: '',
                                          unit: 'Coils',
                                          red: '',
                                          black: '',
                                          yellow: '',
                                          green: '',
                                          blue: '',
                                          quantity: 0,
                                          remarks: '',
                                          isSpecialItem: false,
                                          rate: 0,
                                          amount: 0
                                        }
                                      ]);
                                      setTimeout(() => {
                                        itemInputRefs.current[newLineId]?.focus();
                                        setActiveItemSearchRowId(newLineId);
                                      }, 60);
                                    }
                                  }
                                } else if (e.key === 'ArrowLeft') {
                                  e.preventDefault();
                                  unitInputRefs.current[line.id]?.focus();
                                } else if (e.key === 'ArrowDown' && idx < lines.length - 1) {
                                  e.preventDefault();
                                  remarksInputRefs.current[lines[idx + 1].id]?.focus();
                                } else if (e.key === 'ArrowUp' && idx > 0) {
                                  e.preventDefault();
                                  remarksInputRefs.current[lines[idx - 1].id]?.focus();
                                }
                              }}
                              placeholder=""
                              className="w-full p-1 bg-transparent border-0 text-slate-800 text-xs text-center focus:bg-blue-50/50 focus:outline-none rounded"
                            />
                          </td>

                          {/* Trash Icon */}
                          <td className="py-1 px-0.5 text-center no-print">
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(line.id)}
                              className="text-slate-400 hover:text-rose-600 p-0.5 transition-colors cursor-pointer"
                              title="Delete Row"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Slip Table Footer with Totals */}
                  <tfoot className="border-t-2 border-slate-400 bg-slate-50 text-xs font-semibold">
                    {/* Row 1: Total Coils & Subtotal */}
                    <tr className="border-b border-slate-300 divide-x divide-slate-300">
                      <td colSpan={2} className="py-2 px-3 text-right font-bold text-slate-800">
                        Total Coils =
                      </td>
                      <td className="py-2 px-1 text-center font-black font-mono text-slate-950 text-sm">
                        {totalRequisitionQuantity}
                      </td>
                      <td className="py-2 px-1 text-center font-bold text-slate-700">
                        Coils
                      </td>
                      <td className="py-2 px-2 text-right font-bold text-slate-700">
                        Subtotal =
                      </td>
                      <td className="py-2 px-2 text-right font-black font-mono text-slate-950 text-sm">
                        {calculatedGrossAmount ? `${calculatedGrossAmount.toLocaleString('en-IN')}/-` : '0/-'}
                      </td>
                    </tr>

                    {/* Row 2: Sales Discount */}
                    <tr className="border-b border-slate-300 divide-x divide-slate-300">
                      <td colSpan={4} className="py-1.5 px-3 text-right font-bold text-slate-800">
                        <span className="inline-flex items-center justify-end space-x-1.5">
                          <span>Sales Discount</span>
                          <input
                            ref={discountInputRef}
                            type="number"
                            min="0"
                            max="100"
                            step="any"
                            value={discountPercent || ''}
                            onChange={(e) => {
                              setDiscountPercent(parseFloat(e.target.value) || 0);
                              setManualDiscountAmountOverride(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                discountAmountInputRef.current?.focus();
                                discountAmountInputRef.current?.select();
                              }
                            }}
                            placeholder="0"
                            className="w-12 text-center bg-white border border-slate-300 rounded px-1 py-0.5 text-slate-900 font-bold font-mono focus:border-blue-600 focus:outline-none"
                          />
                          <span>% =</span>
                        </span>
                      </td>
                      <td colSpan={2} className="py-1.5 px-2 text-right font-bold font-mono text-rose-600 text-sm">
                        <div className="flex items-center justify-end space-x-1">
                          <input
                            ref={discountAmountInputRef}
                            type="number"
                            min="0"
                            value={manualDiscountAmountOverride !== null ? manualDiscountAmountOverride : (discountAmount || '')}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setManualDiscountAmountOverride(isNaN(val) ? null : val);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                saveOnlyButtonRef.current?.focus();
                              }
                            }}
                            placeholder="0"
                            className="w-24 text-right bg-white border border-slate-300 rounded px-1.5 py-0.5 text-rose-600 font-bold font-mono focus:border-blue-600 focus:outline-none text-xs"
                          />
                          <span className="text-slate-500 text-xs font-sans">/-</span>
                        </div>
                      </td>
                    </tr>

                    {/* Row 3: Net Total */}
                    <tr className="bg-slate-100 divide-x divide-slate-300">
                      <td colSpan={4} className="py-2 px-3 text-right font-black text-slate-900 uppercase tracking-wide">
                        Total =
                      </td>
                      <td colSpan={2} className="py-2 px-2 text-right font-black font-mono text-blue-700 text-base">
                        {netAmountAfterDiscount ? `${netAmountAfterDiscount.toLocaleString('en-IN')}/-` : '0/-'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Table Line Actions (no-print) */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 px-1 no-print">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    const newFour: RequisitionEntryLine[] = Array.from({ length: 4 }, (_, i) => ({
                      id: `line-${Date.now()}-${i + 1}-${Math.random().toString(36).substring(2, 6)}`,
                      description: '',
                      unit: 'Coils',
                      red: '',
                      black: '',
                      yellow: '',
                      green: '',
                      blue: '',
                      quantity: 0,
                      remarks: '',
                      isSpecialItem: false,
                      rate: 0,
                      amount: 0
                    }));
                    setLines((prev) => [...prev, ...newFour]);
                  }}
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg border border-blue-200 flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
                  title="Increase Requisition table by 4 lines"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ 4 Lines</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddLine()}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 flex items-center space-x-1 transition-colors cursor-pointer"
                  title="Add 1 Line"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ 1 Line</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExcelPasteInputText('');
                    setShowExcelPasteInputModal(true);
                  }}
                  className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg border border-emerald-300 flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
                  title="Paste item names directly from Excel"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Paste from Excel</span>
                </button>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                Total Lines: <strong className="text-slate-800 font-mono">{lines.length}</strong>
              </span>
            </div>

            {/* In Words & Customer Due */}
            <div className="pt-2 border-t border-slate-200 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <div className="font-semibold text-slate-800">
                  <span className="font-bold text-slate-950 uppercase">In Words:</span>{' '}
                  <span className="italic">{convertToTakaWords(netAmountAfterDiscount || 0)}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-slate-700">Customer Current Due:</span>
                  <span className="font-mono font-bold text-rose-600 text-sm">
                    ৳{customerCurrentDue.toLocaleString('en-IN')}/-
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const matched = parties.find((p) => p.name.trim().toLowerCase() === partyName.trim().toLowerCase());
                      if (matched) {
                        const autoDue = calculatePartyCurrentDue(matched.name, matched);
                        setCustomerCurrentDue(autoDue);
                      }
                    }}
                    className="no-print text-[10px] text-blue-600 hover:underline font-semibold cursor-pointer"
                    title="Sync due from Directory"
                  >
                    Sync
                  </button>
                </div>
              </div>
            </div>

            {/* Slip Signatures Footer */}
            <div className="pt-8 pb-2 border-t border-slate-200 grid grid-cols-3 gap-6 text-center text-xs">
              {/* Prepared By (Editable by Super Admin, or displays creator) */}
              <div className="space-y-1">
                {isSuperAdmin ? (
                  <div className="min-h-[22px] flex items-center justify-center">
                    <input
                      type="text"
                      value={preparedBySignature || marketingPerson || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPreparedBySignature(val);
                        setMarketingPerson(val);
                        setReqBySignature(val);
                        try { localStorage.setItem('polycables_req_prepared_by', val); } catch {}
                      }}
                      placeholder="Prepared By Name"
                      className="w-full text-center font-bold text-slate-900 text-sm tracking-wide bg-blue-50/50 hover:bg-blue-50 focus:bg-white border border-dashed border-blue-300 hover:border-blue-500 focus:border-blue-600 rounded px-1.5 py-0.5 outline-none transition-all"
                      title="Super Admin: Click to change Prepared By name"
                    />
                  </div>
                ) : (
                  <div className="font-bold text-slate-900 text-sm tracking-wide min-h-[22px] flex items-center justify-center">
                    {preparedBySignature || marketingPerson || 'Subrata'}
                  </div>
                )}
                <div className="border-t-2 border-slate-400 pt-1 text-[11px] text-slate-600 uppercase tracking-wider font-bold">
                  Prepared By
                </div>
              </div>

              {/* Checked By (User can set name now or later, auto-stored) */}
              <div className="space-y-1">
                <div className="min-h-[22px] flex items-center justify-center">
                  <input
                    type="text"
                    value={checkedBySignature}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCheckedBySignature(val);
                      try { localStorage.setItem('polycables_req_checked_by', val); } catch {}
                    }}
                    placeholder="Set name later"
                    className="w-full text-center font-bold text-slate-900 text-sm tracking-wide bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-300 focus:border-blue-500 rounded px-1.5 py-0.5 outline-none transition-all placeholder:text-slate-400 placeholder:italic placeholder:font-normal"
                  />
                </div>
                <div className="border-t-2 border-slate-400 pt-1 text-[11px] text-slate-600 uppercase tracking-wider font-bold">
                  Checked By
                </div>
              </div>

              {/* Approved By (Auto-set from Default Approver, with Set Option) */}
              <div className="space-y-1">
                <div className="min-h-[22px] flex items-center justify-center">
                  <input
                    type="text"
                    value={approvedBySignature}
                    onChange={(e) => {
                      const val = e.target.value;
                      setApprovedBySignature(val);
                      try { localStorage.setItem('polycables_req_approved_by', val); } catch {}
                    }}
                    placeholder={defaultApprover || 'Authorized Approver'}
                    className="w-full text-center font-bold text-slate-900 text-sm tracking-wide bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-300 focus:border-blue-500 rounded px-1.5 py-0.5 outline-none transition-all placeholder:text-slate-400"
                  />
                </div>
                <div className="border-t-2 border-slate-400 pt-1 text-[11px] text-slate-600 uppercase tracking-wider font-bold flex items-center justify-center space-x-1.5">
                  <span>Approved By</span>
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setTempApproverInput(defaultApprover || DEFAULT_APPROVER_NAME);
                        setIsApproverModalOpen(true);
                      }}
                      className="no-print inline-flex items-center space-x-0.5 text-[10px] text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded font-bold cursor-pointer transition-colors shadow-2xs"
                      title="Set Default Approver Option"
                    >
                      <Settings className="w-2.5 h-2.5" />
                      <span>Set Option</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Action Buttons (no-print) */}
            <div className="no-print pt-6 border-t border-slate-200 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-5 py-2.5 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 font-bold rounded-xl flex items-center space-x-2 border border-slate-300 hover:border-rose-300 transition-all text-xs cursor-pointer shadow-xs"
              >
                <X className="w-4 h-4 text-slate-500 hover:text-rose-600" />
                <span>Cancel</span>
              </button>

              <button
                type="button"
                onClick={handleSaveAndWhatsAppAndMail}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center space-x-2 shadow-md shadow-emerald-500/20 transition-all text-xs cursor-pointer active:scale-98"
              >
                <Share2 className="w-4 h-4 text-white" />
                <span>Save & WhatsApp & Mail</span>
              </button>

              <button
                ref={saveOnlyButtonRef}
                type="button"
                onClick={() => handleSaveRequisition(true)}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center space-x-2 shadow-md shadow-blue-500/25 transition-all text-xs cursor-pointer active:scale-98 focus:ring-4 focus:ring-blue-300 focus:outline-none"
              >
                <Save className="w-4 h-4 text-white" />
                <span>{editingRequisitionId ? 'Update Requisition' : 'Save Only'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: REQUISITION LIST / HISTORY & AUDIT                                  */}
      {/* ========================================================================= */}
      {activeTab === 'list' && (
        <div className="w-full space-y-2.5">
          {/* Unified Compact Filter Controls Bar (Hidden in list-wise Approve Requisition view) */}
          {!isApprovalPage && (
            <>
          <div className="bg-[#081e2d]/85 backdrop-blur-xl border border-cyan-500/25 p-2.5 px-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs shadow-lg">
            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
              {/* Search Box */}
              <div className="relative min-w-0 w-full sm:w-auto sm:min-w-[200px] max-w-xs flex-1">
                <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={listSearchQuery}
                  onChange={(e) => setListSearchQuery(e.target.value)}
                  placeholder="Search req #, party, creator, center..."
                  className="w-full pl-8 pr-7 py-1.5 h-[34px] bg-[#061520]/90 border border-cyan-500/30 rounded-xl text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 text-xs font-medium"
                />
                {listSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setListSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Approval Filter Pills */}
              <div className="flex items-center bg-[#061520]/90 p-0.5 h-[34px] rounded-xl border border-cyan-500/30 shrink-0">
                <button
                  type="button"
                  onClick={() => setListApprovalFilter('All')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                    listApprovalFilter === 'All'
                      ? 'bg-cyan-400 text-slate-950 shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  All ({listScopedRequisitions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setListApprovalFilter('pending')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1 ${
                    listApprovalFilter === 'pending'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-rose-400 hover:text-rose-300'
                  }`}
                >
                  <ShieldAlert className="w-3 h-3" />
                  <span>Pending ({approvalCounts.pending})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setListApprovalFilter('approved')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1 ${
                    listApprovalFilter === 'approved'
                      ? 'bg-emerald-500 text-slate-950 shadow-xs'
                      : 'text-emerald-400 hover:text-emerald-300'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Approved ({approvalCounts.approved})</span>
                </button>
              </div>

              {/* Stage Filter */}
              <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
                <span className="text-cyan-200/80 font-bold text-[11px] whitespace-nowrap">Stage:</span>
                <select
                  value={listStageFilter}
                  onChange={(e) => setListStageFilter(e.target.value)}
                  className="bg-transparent text-cyan-100 font-bold focus:outline-none text-xs cursor-pointer"
                >
                  <option value="All" className="bg-[#091e2c] text-white">All Stages</option>
                  <option value="pending_goods" className="bg-[#091e2c] text-white">Pending Goods</option>
                  <option value="goods_received" className="bg-[#091e2c] text-white">Goods Received</option>
                  <option value="converted_to_bill" className="bg-[#091e2c] text-white">Converted to Bill</option>
                </select>
              </div>

              {/* Marketing Dropdown */}
              <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
                <span className="text-cyan-200/80 font-bold text-[11px] whitespace-nowrap">Officer:</span>
                <select
                  value={listMarketingPersonFilter}
                  onChange={(e) => setListMarketingPersonFilter(e.target.value)}
                  className="bg-transparent text-cyan-100 font-bold focus:outline-none text-xs max-w-[140px] cursor-pointer"
                >
                  <option value="All" className="bg-[#091e2c] text-white">All Officers</option>
                  {getFilteredMarketingNamesForCenter(salesCenterFilter).map((name, nIdx) => (
                    <option key={`${name}-${nIdx}`} value={name} className="bg-[#091e2c] text-white">
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sales Center */}
              <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
                <span className="text-cyan-200/80 font-bold text-[11px] whitespace-nowrap">Center:</span>
                <select
                  value={salesCenterFilter}
                  onChange={(e) => {
                    const nextCenter = e.target.value;
                    setSalesCenterFilter(nextCenter);
                    if (listMarketingPersonFilter !== 'All') {
                      const nextNames = getFilteredMarketingNamesForCenter(nextCenter);
                      if (!nextNames.includes(listMarketingPersonFilter)) {
                        setListMarketingPersonFilter('All');
                      }
                    }
                  }}
                  className="bg-transparent text-cyan-100 font-bold focus:outline-none text-xs max-w-[170px] cursor-pointer"
                >
                  <option value="All" className="bg-[#091e2c] text-white">All Centers ({allSalesCenters.length})</option>
                  {allSalesCenters.map((cName, cIdx) => (
                    <option key={`${cName}-${cIdx}`} value={cName} className="bg-[#091e2c] text-white">
                      {cName}
                    </option>
                  ))}
                </select>
              </div>

              <StandardPeriodFilterBar
                period={listDateFilter}
                onSelectPeriod={(preset) => setListDateFilter(preset)}
                customStartDate={customStartDate}
                customEndDate={customEndDate}
                onCustomStartDateChange={(val) => {
                  setCustomStartDate(val);
                  setListDateFilter('custom');
                }}
                onCustomEndDateChange={(val) => {
                  setCustomEndDate(val);
                  setListDateFilter('custom');
                }}
                theme="dark"
              />

              {hasActiveHistoryFilters && (
                <button
                  type="button"
                  onClick={handleResetAllHistoryFilters}
                  className="inline-flex items-center gap-1 px-2.5 py-1 h-[34px] bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/35 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
                  title="Reset filters"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-rose-300" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <span className="text-slate-300 text-[11px] whitespace-nowrap">
                Showing <strong className="text-cyan-300 font-mono font-bold">{filteredRequisitions.length}</strong> / <strong className="text-white font-mono">{listScopedRequisitions.length}</strong>
              </span>

              <button
                type="button"
                onClick={handleStartFreshRequisition}
                className="bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black px-3 py-1 h-[34px] rounded-xl text-xs flex items-center space-x-1.5 shadow-md transition-all cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5 font-black" />
                <span>+ Create</span>
              </button>
            </div>
          </div>
            </>
          )}

          {/* Requisitions Grid / Table (Desktop) */}
          <div className="hidden md:block cyber-glass-card rounded-2xl overflow-hidden shadow-xl w-full">
            <div className="overflow-x-auto w-full">
              <table className="w-full text-xs text-left border-collapse table-fixed">
              <thead>
                <tr className="bg-[#0c2638] text-cyan-200 font-bold uppercase text-[10px] border-b border-cyan-500/30 select-none">
                  <th
                    className="py-2.5 px-1.5 w-[9.5%] cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleListSort('reqNo')}
                    title="Sort by Requisition Number"
                  >
                    <span className="inline-flex items-center truncate">
                      Req # {renderSortIndicator('reqNo')}
                    </span>
                  </th>
                  <th
                    className="py-2.5 px-1.5 w-[7.5%] cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleListSort('date')}
                    title="Sort by Date"
                  >
                    <span className="inline-flex items-center">
                      Date {renderSortIndicator('date')}
                    </span>
                  </th>
                  <th
                    className="py-2.5 px-1.5 w-[20%] cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleListSort('partyName')}
                    title="Sort by Party Name / Destination"
                  >
                    <span className="inline-flex items-center truncate">
                      Party / Destination {renderSortIndicator('partyName')}
                    </span>
                  </th>
                  <th
                    className="py-2.5 px-1.5 w-[11%] cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleListSort('marketingPerson')}
                    title="Sort by Marketing Person"
                  >
                    <span className="inline-flex items-center truncate">
                      Officer {renderSortIndicator('marketingPerson')}
                    </span>
                  </th>
                  <th
                    className="py-2.5 px-1 w-[4.5%] text-center cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleListSort('items')}
                    title="Sort by Items Count"
                  >
                    <span className="inline-flex items-center justify-center">
                      Items {renderSortIndicator('items')}
                    </span>
                  </th>
                  <th
                    className="py-2.5 px-1 w-[5%] text-center cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleListSort('total')}
                    title="Sort by Total Quantity"
                  >
                    <span className="inline-flex items-center justify-center">
                      Qty {renderSortIndicator('total')}
                    </span>
                  </th>
                  <th
                    className="py-2.5 px-1.5 w-[8.5%] text-right cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleListSort('amount')}
                    title="Sort by Total Amount"
                  >
                    <span className="inline-flex items-center justify-end">
                      Amount {renderSortIndicator('amount')}
                    </span>
                  </th>
                  <th className="py-2.5 px-1 w-[11%] text-center">
                    Approval
                  </th>
                  <th
                    className="py-2.5 px-1 w-[8%] text-center cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleListSort('stage')}
                    title="Sort by Stage"
                  >
                    <span className="inline-flex items-center justify-center">
                      Stage {renderSortIndicator('stage')}
                    </span>
                  </th>
                  <th className="py-2.5 px-1 w-[15%] text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                {filteredRequisitions.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400">
                      No requisitions found matching your filter
                    </td>
                  </tr>
                ) : (
                  filteredRequisitions.map((req) => {
                    const isConverted = req.stage === 'converted_to_bill' || req.isLocked;
                    const isReceived = req.stage === 'goods_received';
                    const pctValue = isConverted || isReceived ? 100 : (req.percentage || 0);

                    return (
                      <tr
                        key={req.id}
                        className={`transition-colors ${
                          isConverted
                            ? 'bg-emerald-500/10 border-l-4 border-l-emerald-400 text-white hover:bg-emerald-500/15 ring-1 ring-emerald-500/20'
                            : 'hover:bg-cyan-500/[0.06]'
                        }`}
                      >
                        <td className="py-1.5 px-2 font-bold text-cyan-300 font-mono">
                          <div className="flex items-center gap-1 truncate">
                            {isConverted && <Lock className="w-2.5 h-2.5 text-emerald-400 shrink-0" />}
                            <span className="truncate">{req.reqNo?.toLowerCase().startsWith('req #') ? req.reqNo : (req.reqNo?.startsWith('#') ? req.reqNo.replace(/^#\s*/, 'req # ') : `req # ${req.reqNo}`)}</span>
                          </div>
                        </td>
                        <td className="py-1.5 px-1.5 text-slate-300 font-mono whitespace-nowrap text-[11px]">
                          {req.reqDateStr || formatDateDDMMYY(req.date)}
                        </td>
                        <td className="py-1.5 px-2">
                          <div className="font-bold text-white truncate text-xs" title={req.partyName || req.branchName || ''}>
                            {getPartyDisplayWithAddress(req.partyName || req.branchName || '', req.partyAddress)}
                          </div>
                        </td>
                        <td className="py-1.5 px-1.5 text-slate-300 font-medium whitespace-nowrap truncate text-[11px]">
                          {(() => {
                            const matchedParty = parties.find((p) => p.name.trim().toLowerCase() === (req.partyName || req.branchName || '').trim().toLowerCase());
                            let mp = matchedParty?.salespersonName;
                            if (!mp && matchedParty?.salesmanCode) {
                              const sp = salespersons.find((s) => s.code.toLowerCase() === matchedParty.salesmanCode?.toLowerCase());
                              if (sp) mp = sp.name;
                            }
                            if (!mp) mp = req.marketingPersonName;
                            if (!mp) mp = req.createdByName;
                            if (!mp) mp = 'Subrata Sutradhar';
                            return normalizeMarketingPersonName(mp);
                          })()}
                        </td>
                        <td className="py-1.5 px-1 text-center text-slate-300 font-mono text-[11px]">
                          {req.lines?.length || 0}
                        </td>
                        <td className="py-1.5 px-1 text-center font-bold text-amber-300 font-mono text-xs">
                          {req.totalRequestedQty || 0}
                        </td>
                        <td className="py-1.5 px-1.5 text-right font-bold text-white font-mono text-xs whitespace-nowrap">
                          ৳{(req.totalAmount || 0).toLocaleString('en-IN')}
                        </td>
                        {/* Approval Status & Action Button */}
                        <td className="py-1.5 px-1 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {(() => {
                            const isApp = Boolean(
                              req.isApproved ||
                              req.stage === 'sent_to_factory' ||
                              req.stage === 'factory_dispatched' ||
                              req.stage === 'factory_received' ||
                              req.stage === 'goods_received' ||
                              req.stage === 'converted_to_bill'
                            );

                            const canInChargeApprove = canApproveInChargeRequisition(currentUser, req, branches, salespersons);
                            const canAdminApprove = canApproveSalesCenterRequisition(currentUser, req, branches, salespersons);

                            // 1. If Admin has given final approval
                            if (isApp) {
                              return (
                                <div className="flex items-center justify-center">
                                  {canAdminApprove ? (
                                    <button
                                      type="button"
                                      onClick={(e) => handleToggleApproveRequisition(req.id, e)}
                                      className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer transition-all active:scale-95"
                                      title={req.approvedBy ? `Approved by ${req.approvedBy}. Click to revoke.` : 'Approved ✓'}
                                    >
                                      <CheckCircle2 className="w-3 h-3 text-emerald-200 shrink-0" />
                                      <span>Approved</span>
                                    </button>
                                  ) : (
                                    <span
                                      className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 select-none"
                                      title={req.approvedBy ? `Approved by ${req.approvedBy}` : 'Approved ✓'}
                                    >
                                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                      <span>Approved</span>
                                    </span>
                                  )}
                                </div>
                              );
                            }

                            // 2. If Pending In-Charge (In-Charge has not approved yet)
                            const isInChargeApproved = Boolean(
                              req.inChargeApproved ||
                              req.inChargeApprovedBy ||
                              req.inChargeApprovalDate ||
                              req.stage === 'sent_to_factory' ||
                              req.stage === 'factory_dispatched' ||
                              req.stage === 'factory_received' ||
                              req.stage === 'goods_received' ||
                              req.stage === 'converted_to_bill'
                            );

                            if (!isInChargeApproved) {
                              if (canInChargeApprove) {
                                return (
                                  <div className="flex items-center justify-center">
                                    <button
                                      type="button"
                                      onClick={(e) => handleInChargeApproveRequisition(req.id, e)}
                                      className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-xs ring-1 ring-amber-300 cursor-pointer transition-all select-none active:scale-95"
                                      title="Click to Approve as In-Charge"
                                    >
                                      <ShieldAlert className="w-3 h-3 text-slate-950 shrink-0" />
                                      <span>Approve (IC)</span>
                                    </button>
                                  </div>
                                );
                              }
                              return (
                                <div className="flex items-center justify-center">
                                  <span
                                    className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 select-none opacity-90"
                                    title="Pending In-Charge Approval"
                                  >
                                    <Clock className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                                    <span>Pending IC</span>
                                  </span>
                                </div>
                              );
                            }

                            // 3. In-Charge has approved, now awaiting Admin approval
                            if (canAdminApprove) {
                              return (
                                <div className="flex items-center justify-center">
                                  <button
                                    type="button"
                                    onClick={(e) => handleToggleApproveRequisition(req.id, e)}
                                    className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 hover:bg-rose-500 text-white shadow-xs ring-1 ring-rose-400 cursor-pointer transition-all select-none active:scale-95"
                                    title="In-Charge Approved ✓. Click for Admin Final Approval"
                                  >
                                    <ShieldCheck className="w-3 h-3 text-white shrink-0" />
                                    <span>Approve</span>
                                  </button>
                                </div>
                              );
                            }

                            return (
                              <div className="flex items-center justify-center">
                                <span
                                  className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#081b28] text-slate-300 border border-cyan-500/25 select-none opacity-85"
                                  title="In-Charge Approved ✓. Waiting for Admin approval."
                                >
                                  <Lock className="w-2.5 h-2.5 text-cyan-400 shrink-0" />
                                  <span>Pending Admin</span>
                                </span>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="py-1.5 px-1 text-center whitespace-nowrap">
                          {isConverted ? (
                            <button
                              type="button"
                              onClick={() => handleConvertToBill(req)}
                              className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 inline-flex items-center gap-0.5 cursor-pointer"
                              title="Converted to Bill"
                            >
                              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                              <span>Bill</span>
                            </button>
                          ) : (
                            <select
                              value={req.stage || 'pending_goods'}
                              onChange={(e) => {
                                const nextStage = e.target.value as RequisitionStage;
                                if (nextStage === 'converted_to_bill') {
                                  handleConvertToBill(req);
                                } else {
                                  handleUpdateRequisitionStage(req.id, nextStage);
                                }
                              }}
                              className="px-1 py-0.5 rounded-md text-[9px] font-bold uppercase bg-[#061520] border border-cyan-500/30 text-white focus:outline-none cursor-pointer"
                            >
                              <option value="pending_goods">Pending</option>
                              <option value="goods_received">Received</option>
                              <option value="converted_to_bill">Bill</option>
                            </select>
                          )}
                        </td>
                        <td className="py-1.5 px-1 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            {/* View Slip */}
                            <button
                              type="button"
                              onClick={() => setSelectedRequisitionForView(req)}
                              className="p-1 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 rounded-lg transition-colors cursor-pointer"
                              title="View Requisition Slip"
                            >
                              <FileText className="w-3 h-3 text-cyan-300" />
                            </button>
                            {/* Edit (only available before approval) */}
                            {!Boolean(req.isApproved || req.stage === 'sent_to_factory' || req.stage === 'factory_dispatched' || req.stage === 'converted_to_bill') && (
                              <button
                                type="button"
                                onClick={() => handleEditRequisition(req)}
                                className="p-1 bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 rounded-lg transition-colors cursor-pointer border border-amber-500/35"
                                title="Edit Requisition (Available before approval)"
                              >
                                <Edit className="w-3 h-3" />
                              </button>
                            )}
                            {isApprovalPage ? (
                              <>
                                {/* WhatsApp */}
                                <button
                                  type="button"
                                  onClick={() => handleOpenWhatsAppModal(req)}
                                  className="p-1 bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 rounded-lg transition-colors cursor-pointer border border-emerald-500/35"
                                  title="Send Requisition via WhatsApp"
                                >
                                  <MessageCircle className="w-3 h-3" />
                                </button>
                                {/* Print */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedRequisitionForView(req);
                                    setTimeout(() => window.print(), 150);
                                  }}
                                  className="p-1 bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 rounded-lg transition-colors cursor-pointer border border-amber-500/35"
                                  title="Print Requisition Slip"
                                >
                                  <Printer className="w-3 h-3" />
                                </button>
                              </>
                            ) : (
                              <>
                                {/* Bill / Convert */}
                                <button
                                  type="button"
                                  onClick={() => handleConvertToBill(req)}
                                  className={`p-1 rounded-lg transition-colors cursor-pointer border ${isConverted ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40' : 'bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 border-cyan-500/35'}`}
                                  title={isConverted ? 'Open Bill in Bill Page' : 'Convert to Bill'}
                                >
                                  <FileCheck className="w-3 h-3" />
                                </button>
                                {/* Excel */}
                                <button
                                  type="button"
                                  onClick={() => handleDownloadExcel(req)}
                                  className="p-1 bg-teal-500/15 hover:bg-teal-500/30 text-teal-300 rounded-lg transition-colors cursor-pointer border border-teal-500/35"
                                  title="Download Excel (.xlsx)"
                                >
                                  <FileSpreadsheet className="w-3 h-3" />
                                </button>
                                {/* Email */}
                                <button
                                  type="button"
                                  onClick={() => handleOpenEmailModal(req)}
                                  className={`p-1 rounded-lg transition-colors cursor-pointer border ${req.auditMailSent ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-[#081b28] text-slate-300 hover:text-cyan-300 border-cyan-500/25'}`}
                                  title={req.auditMailSent ? 'Email Sent' : 'Send Email'}
                                >
                                  <Mail className="w-3 h-3" />
                                </button>
                              </>
                            )}
                            {/* Delete */}
                            <button
                              type="button"
                              onClick={() => setDeletingRequisition(req)}
                              className="p-1 bg-[#081b28] hover:bg-rose-500/25 text-slate-300 hover:text-rose-300 border border-cyan-500/20 rounded-lg transition-colors cursor-pointer"
                              title="Delete Requisition"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            </div>
          </div>

          {/* Requisitions Cards (Mobile View) */}
          <div className="block md:hidden space-y-2.5">
            {filteredRequisitions.length === 0 ? (
              <div className="p-6 text-center text-slate-400 cyber-glass-subcard rounded-xl border border-cyan-500/20 text-xs">
                No requisitions found matching your filter
              </div>
            ) : (
              filteredRequisitions.map((req) => {
                const isConverted = req.stage === 'converted_to_bill' || req.isLocked;
                const isReceived = req.stage === 'goods_received';
                const isDispatched = req.stage === 'factory_dispatched';
                const isApp = Boolean(
                  req.isApproved ||
                  req.stage === 'sent_to_factory' ||
                  req.stage === 'factory_dispatched' ||
                  req.stage === 'factory_received' ||
                  req.stage === 'goods_received' ||
                  req.stage === 'converted_to_bill'
                );
                const matchedParty = parties.find((p) => p.name.trim().toLowerCase() === (req.partyName || req.branchName || '').trim().toLowerCase());
                let mp = matchedParty?.salespersonName;
                if (!mp && matchedParty?.salesmanCode) {
                  const sp = salespersons.find((s) => s.code.toLowerCase() === matchedParty.salesmanCode?.toLowerCase());
                  if (sp) mp = sp.name;
                }
                if (!mp) mp = req.marketingPersonName || req.createdByName || 'Subrata Sutradhar';

                return (
                  <div
                    key={req.id}
                    className={`p-3 rounded-xl border transition-all ${
                      isConverted
                        ? 'bg-emerald-950/30 border-emerald-400/40 text-slate-100'
                        : 'cyber-glass-subcard border-cyan-500/25 text-slate-200'
                    }`}
                  >
                    {/* Top Row: Req #, Date, Status */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          {isConverted && <Lock className="w-3 h-3 text-emerald-400 shrink-0" />}
                          <span className="font-bold font-mono text-amber-300 text-xs">
                            {req.reqNo?.toLowerCase().startsWith('req #') ? req.reqNo : (req.reqNo?.startsWith('#') ? req.reqNo.replace(/^#\s*/, 'req # ') : `req # ${req.reqNo}`)}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {req.reqDateStr || formatDateDDMMYY(req.date)}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1 justify-end">
                        {isApp ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-600/90 text-white border border-emerald-400">
                            <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                            <span>Approved</span>
                          </span>
                        ) : !isReqInChargeApproved(req) ? (
                          canApproveInChargeRequisition(currentUser, req, branches, salespersons) ? (
                            <button
                              type="button"
                              onClick={(e) => handleInChargeApproveRequisition(req.id, e)}
                              className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-600 hover:bg-amber-500 text-white border border-amber-400 shadow-xs transition-transform active:scale-95 cursor-pointer"
                            >
                              Approve (IC)
                            </button>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-600">
                              Pending IC
                            </span>
                          )
                        ) : (
                          canApproveSalesCenterRequisition(currentUser, req, branches, salespersons) ? (
                            <button
                              type="button"
                              onClick={(e) => handleToggleApproveRequisition(req.id, e)}
                              className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-600 hover:bg-rose-500 text-white border border-rose-400 shadow-xs transition-transform active:scale-95 cursor-pointer"
                              title="In-Charge Approved ✓. Click for Admin Final Approval"
                            >
                              Approve
                            </button>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#081b28] text-slate-300 border border-cyan-500/25">
                              Pending Admin
                            </span>
                          )
                        )}
                        {isConverted ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-950 text-emerald-300 border border-emerald-600">
                            Converted
                          </span>
                        ) : isReceived ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-950 text-sky-300 border border-sky-600">
                            Received
                          </span>
                        ) : isDispatched ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-600">
                            Dispatched
                          </span>
                        ) : isApp ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-600">
                            Sent Factory
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#081b28] text-slate-300 border border-cyan-500/25">
                            Draft
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Party & Marketing */}
                    <div className="space-y-0.5 mb-2.5 text-xs">
                      <div className="font-bold text-white truncate">
                        {getPartyDisplayWithAddress(req.partyName || req.branchName || '', req.partyAddress)}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center space-x-1">
                        <span className="text-slate-400">Officer:</span>
                        <span className="text-cyan-200 font-medium">{normalizeMarketingPersonName(mp)}</span>
                      </div>
                    </div>

                    {/* Stats Row */}
                    <div className="grid grid-cols-3 gap-2 p-2 bg-[#061520]/80 rounded-lg border border-cyan-500/20 mb-2.5 text-center">
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-bold">Items</div>
                        <div className="font-mono font-bold text-slate-200 text-xs">{req.lines?.length || 0}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-bold">Qty (Coils)</div>
                        <div className="font-mono font-black text-amber-300 text-xs">{req.totalRequestedQty || 0}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-bold">Amount</div>
                        <div className="font-mono font-bold text-emerald-400 text-xs">৳{(req.totalAmount || 0).toLocaleString('en-IN')}</div>
                      </div>
                    </div>

                    {/* Actions Row */}
                    <div className="flex items-center justify-between gap-1 pt-1 border-t border-cyan-500/20">
                      <button
                        type="button"
                        onClick={() => setSelectedRequisitionForView(req)}
                        className="flex-1 py-1.5 px-2 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/25 text-xs font-bold rounded-lg transition-colors flex items-center justify-center space-x-1"
                      >
                        <FileText className="w-3.5 h-3.5 text-cyan-300" />
                        <span>View</span>
                      </button>
                      {!isConverted && !Boolean(req.isApproved || req.stage === 'sent_to_factory' || req.stage === 'factory_dispatched' || req.stage === 'converted_to_bill') && (
                        <button
                          type="button"
                          onClick={() => handleEditRequisition(req)}
                          className="py-1.5 px-2.5 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 rounded-lg transition-colors"
                          title="Edit Requisition (Available before approval)"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {isApprovalPage ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleOpenWhatsAppModal(req)}
                            className="py-1.5 px-2.5 bg-emerald-500/20 text-emerald-300 rounded-lg border border-emerald-500/40 transition-colors"
                            title="Send via WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRequisitionForView(req);
                              setTimeout(() => window.print(), 150);
                            }}
                            className="py-1.5 px-2.5 bg-amber-500/20 text-amber-300 rounded-lg border border-amber-500/40 transition-colors"
                            title="Print Requisition Slip"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleConvertToBill(req)}
                            className={`py-1.5 px-2.5 rounded-lg transition-colors ${
                              isConverted
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/40'
                                : 'bg-cyan-500/15 text-cyan-200 border border-cyan-400/35'
                            }`}
                            title={isConverted ? 'Open Bill in Bill Page' : 'Convert to Bill'}
                          >
                            <FileCheck className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadExcel(req)}
                            className="py-1.5 px-2.5 bg-teal-950 text-teal-300 rounded-lg border border-teal-700/40 transition-colors"
                            title="Download Excel"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEmailModal(req)}
                            className="py-1.5 px-2.5 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 rounded-lg transition-colors"
                            title="Send Email"
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeletingRequisition(req)}
                        className="py-1.5 px-2.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 rounded-lg border border-rose-700/50 transition-colors"
                        title="Delete Requisition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: APPROVED REQUISITIONS HISTORY (FACTORY ROLE & MANAGEMENT)           */}
      {/* ========================================================================= */}
      {activeTab === 'approved_history' && (
        <div className="w-full space-y-3">
          {/* Quick Stat Cards */}
          <div className={`grid grid-cols-1 ${isFactoryRole ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-3`}>
            <div className="cyber-glass-subcard border border-cyan-500/25 p-3 rounded-xl">
              <div className="text-[11px] font-bold text-cyan-200/80 uppercase tracking-wider">Total Approved Orders</div>
              <div className="text-2xl font-black text-emerald-400 font-mono mt-0.5">
                {approvedStats.totalCount}
              </div>
            </div>

            <div className="cyber-glass-subcard border border-cyan-500/25 p-3 rounded-xl">
              <div className="text-[11px] font-bold text-cyan-200/80 uppercase tracking-wider">Total Quantity (Coils)</div>
              <div className="text-2xl font-black text-amber-300 font-mono mt-0.5">
                {approvedStats.totalQty.toLocaleString('en-IN')}
              </div>
            </div>

            {!isFactoryRole && (
              <div className="cyber-glass-subcard border border-cyan-500/25 p-3 rounded-xl">
                <div className="text-[11px] font-bold text-cyan-200/80 uppercase tracking-wider">Total Approved Value</div>
                <div className="text-2xl font-black text-cyan-300 font-mono mt-0.5">
                  ৳{approvedStats.totalAmount.toLocaleString('en-IN')}
                </div>
              </div>
            )}
          </div>

          {/* Filter Controls Bar */}
          <div className="bg-[#081e2d]/85 backdrop-blur-xl text-white border border-cyan-500/25 p-2.5 px-3.5 rounded-2xl space-y-2 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              {/* Search Box */}
              <div className="flex items-center space-x-2 flex-1 min-w-0 w-full sm:w-auto sm:min-w-[220px] max-w-md">
                <div className="relative w-full">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-cyan-400 pointer-events-none" />
                  <input
                    type="text"
                    value={approvedSearchQuery}
                    onChange={(e) => setApprovedSearchQuery(e.target.value)}
                    placeholder="Search approved req #, party, destination, item..."
                    className="w-full pl-8 pr-7 py-1.5 h-[34px] bg-[#061520]/90 border border-cyan-500/30 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-cyan-400 text-xs font-medium placeholder:text-slate-400"
                  />
                  {approvedSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setApprovedSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-white rounded cursor-pointer"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Dropdowns */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Sales Center */}
                <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
                  <span className="text-cyan-200/80 font-bold text-[11px] whitespace-nowrap">Center:</span>
                  <select
                    value={approvedCenterFilter}
                    onChange={(e) => {
                      const nextCenter = e.target.value;
                      setApprovedCenterFilter(nextCenter);
                      if (approvedMarketingFilter !== 'All') {
                        const nextNames = getFilteredMarketingNamesForCenter(nextCenter);
                        if (!nextNames.includes(approvedMarketingFilter)) {
                          setApprovedMarketingFilter('All');
                        }
                      }
                    }}
                    className="bg-transparent text-cyan-100 font-bold focus:outline-none text-xs max-w-[170px] cursor-pointer"
                  >
                    <option value="All" className="bg-[#091e2c] text-white">All Centers ({allSalesCenters.length})</option>
                    {allSalesCenters.map((c, cIdx) => (
                      <option key={`${c}-${cIdx}`} value={c} className="bg-[#091e2c] text-white">
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Marketing */}
                <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
                  <span className="text-cyan-200/80 font-bold text-[11px] whitespace-nowrap">Marketing:</span>
                  <select
                    value={approvedMarketingFilter}
                    onChange={(e) => setApprovedMarketingFilter(e.target.value)}
                    className="bg-transparent text-cyan-100 font-bold focus:outline-none text-xs max-w-[170px] cursor-pointer"
                  >
                    <option value="All" className="bg-[#091e2c] text-white">All Marketing</option>
                    {getFilteredMarketingNamesForCenter(approvedCenterFilter).map((name, nIdx) => (
                      <option key={`${name}-${nIdx}`} value={name} className="bg-[#091e2c] text-white">
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <StandardPeriodFilterBar
                  period={approvedDateFilter}
                  onSelectPeriod={(preset) => setApprovedDateFilter(preset)}
                  customStartDate={approvedCustomStartDate}
                  customEndDate={approvedCustomEndDate}
                  onCustomStartDateChange={(val) => {
                    setApprovedCustomStartDate(val);
                    setApprovedDateFilter('custom');
                  }}
                  onCustomEndDateChange={(val) => {
                    setApprovedCustomEndDate(val);
                    setApprovedDateFilter('custom');
                  }}
                  theme="dark"
                />

                {hasActiveApprovedFilters && (
                  <button
                    type="button"
                    onClick={handleResetApprovedFilters}
                    className="inline-flex items-center gap-1 px-2.5 py-1 h-[34px] bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 rounded-xl text-xs font-bold border border-rose-400/35 transition-colors cursor-pointer shrink-0"
                    title="Reset all filters"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-rose-300" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Approved Requisitions Table (Desktop) */}
          <div className="hidden md:block cyber-glass-card rounded-2xl text-white border border-cyan-500/25 overflow-hidden">
            <div className="overflow-x-auto w-full">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-[#0c2638] text-cyan-200 font-bold uppercase text-[10px] border-b border-cyan-500/30 select-none">
                    <th
                      className="py-3 px-4 cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleApprovedSort('reqNo')}
                    >
                      <span className="inline-flex items-center">
                        Req # {renderApprovedSortIndicator('reqNo')}
                      </span>
                    </th>
                    <th
                      className="py-3 px-3 cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleApprovedSort('date')}
                    >
                      <span className="inline-flex items-center">
                        Date {renderApprovedSortIndicator('date')}
                      </span>
                    </th>
                    <th className="py-3 px-3">Showroom / Destination</th>
                    <th
                      className="py-3 px-3 cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleApprovedSort('partyName')}
                    >
                      <span className="inline-flex items-center">
                        Party / Customer {renderApprovedSortIndicator('partyName')}
                      </span>
                    </th>
                    <th className="py-3 px-3">Marketing</th>
                    <th className="py-3 px-3 text-left">Items &amp; Colour</th>
                    <th
                      className="py-3 px-2 text-center cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleApprovedSort('total')}
                    >
                      <span className="inline-flex items-center justify-center">
                        Qty (Coils) {renderApprovedSortIndicator('total')}
                      </span>
                    </th>
                    {!isFactoryRole && (
                      <th
                        className="py-3 px-3 text-right cursor-pointer hover:text-white transition-colors"
                        onClick={() => handleApprovedSort('amount')}
                      >
                        <span className="inline-flex items-center justify-end">
                          Amount {renderApprovedSortIndicator('amount')}
                        </span>
                      </th>
                    )}
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                  {approvedListRequisitions.length === 0 ? (
                    <tr>
                      <td colSpan={isFactoryRole ? 8 : 9} className="py-12 text-center text-slate-400">
                        <div className="max-w-md mx-auto space-y-2">
                          <CheckCircle2 className="w-8 h-8 text-emerald-400/50 mx-auto" />
                          <div className="text-sm font-bold text-slate-300">No Approved Requisitions Found</div>
                          <p className="text-xs text-slate-400">
                            When requisitions are approved from Requisition History using the red Approve button,
                            they will appear here immediately for Factory Role users and dispatch supply.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    approvedListRequisitions.map((req) => {
                      const isConverted = req.stage === 'converted_to_bill' || req.isLocked;
                      const isReceived = req.stage === 'goods_received';
                      const isDispatched = req.stage === 'factory_dispatched';
                      const delvInfo = getReqDeliveryInfo(req);

                      return (
                        <tr
                          key={req.id}
                          className="hover:bg-cyan-500/[0.06] transition-colors border-l-4 border-l-emerald-400"
                        >
                          <td className="py-3 px-4 font-bold text-amber-400 font-mono">
                            <span>{req.reqNo?.toLowerCase().startsWith('req #') ? req.reqNo : (req.reqNo?.startsWith('#') ? req.reqNo.replace(/^#\s*/, 'req # ') : `req # ${req.reqNo}`)}</span>
                          </td>
                          <td className="py-3 px-3 text-slate-300 font-mono whitespace-nowrap">
                            {req.reqDateStr || formatDateDDMMYY(req.date)}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-100">
                              {req.branchName || req.toDestination || 'Sales Center'}
                            </div>
                            {req.deliverySite && (
                              <div className="text-[10px] text-slate-400">{req.deliverySite}</div>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-200">
                              {getPartyDisplayWithAddress(req.partyName || req.branchName || '', req.partyAddress)}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-slate-300 font-medium whitespace-nowrap">
                            {normalizeMarketingPersonName(req.marketingPersonName || req.createdByName || 'Subrata Sutradhar')}
                          </td>
                          <td className="py-2.5 px-3 text-left min-w-[190px] max-w-[280px]">
                            {req.lines && req.lines.length > 0 ? (
                              <div className="space-y-1">
                                {expandedApprovedReqIds[req.id] ? (
                                  <>
                                    <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                                      <span className="text-[10px] font-bold text-slate-400">All Items ({req.lines.length})</span>
                                      <button
                                        type="button"
                                        onClick={() => setExpandedApprovedReqIds((prev) => ({ ...prev, [req.id]: false }))}
                                        className="text-[9.5px] text-slate-400 hover:text-white underline cursor-pointer"
                                      >
                                        Collapse
                                      </button>
                                    </div>
                                    <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                      {req.lines.map((ln, lIdx) => {
                                        const colInfo = extractReqLineColors(ln);
                                        const qtyVal = ln.approvedQty ?? ln.requestedQty ?? 0;
                                        return (
                                          <div key={ln.id || lIdx} className="text-[11px] leading-snug">
                                            <div className="flex items-center justify-between gap-1.5">
                                              <span className="font-semibold text-slate-200 truncate" title={ln.itemName}>
                                                {ln.itemName || ln.itemCode || 'Item'}
                                              </span>
                                              <span className="font-mono font-bold text-amber-300 shrink-0">
                                                {qtyVal} {ln.unit || 'Coils'}
                                              </span>
                                            </div>
                                            {(colInfo.badges.length > 0 || colInfo.customRemarks) && (
                                              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                                {colInfo.badges.map((b) => (
                                                  <span
                                                    key={b.key}
                                                    className={`px-1.5 py-0.2 rounded border text-[9.5px] font-mono font-bold ${b.darkClass}`}
                                                  >
                                                    {b.label}
                                                  </span>
                                                ))}
                                                {colInfo.customRemarks && (
                                                  <span className="text-[10px] text-slate-400 italic">
                                                    {colInfo.customRemarks}
                                                  </span>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </>
                                ) : (
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-slate-800 text-amber-300 border border-slate-700 font-mono">
                                        {req.lines.length} {req.lines.length === 1 ? 'Item' : 'Items'}
                                      </span>
                                      <span className="text-[10px] font-bold text-slate-400 font-mono">
                                        ({req.lines.reduce((s, l) => s + (l.approvedQty ?? l.requestedQty ?? 0), 0)} Coils)
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-300 truncate" title={req.lines[0]?.itemName}>
                                      {req.lines[0]?.itemName || req.lines[0]?.itemCode || 'Item'}
                                      {req.lines.length > 1 && (
                                        <span className="text-slate-500 font-medium ml-1">+{req.lines.length - 1} more</span>
                                      )}
                                    </div>
                                    <div className="flex items-center space-x-2 pt-0.5">
                                      <button
                                        type="button"
                                        onClick={() => setSelectedRequisitionForView(req)}
                                        className="text-[10px] font-bold text-sky-400 hover:text-sky-300 underline cursor-pointer"
                                        title="Click to view all items and complete requisition slip"
                                      >
                                        View All
                                      </button>
                                      <span className="text-slate-600 text-[10px]">•</span>
                                      <button
                                        type="button"
                                        onClick={() => setExpandedApprovedReqIds((prev) => ({ ...prev, [req.id]: true }))}
                                        className="text-[10px] text-slate-400 hover:text-slate-200 cursor-pointer"
                                      >
                                        Quick preview
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-500 font-mono">0</span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center font-mono">
                            <div className="font-black text-amber-300 text-sm">
                              {delvInfo.totalApproved}
                            </div>
                            {delvInfo.totalDelivered > 0 && (
                              <div className="text-[10px] font-bold text-emerald-400">
                                {delvInfo.totalDelivered} delv
                              </div>
                            )}
                            {delvInfo.totalRest > 0 && delvInfo.totalDelivered > 0 && (
                              <div className="text-[10px] font-bold text-rose-400">
                                {delvInfo.totalRest} rest
                              </div>
                            )}
                          </td>
                          {!isFactoryRole && (
                            <td className="py-3 px-3 text-right font-bold text-slate-100 font-mono whitespace-nowrap">
                              ৳{req.totalAmount?.toLocaleString('en-IN') || 0}
                            </td>
                          )}
                          {/* Actions */}
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end space-x-1.5">
                              {/* Multi-Delivery Action Button */}
                              {!delvInfo.isFullyDelivered ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenDeliveryModal(req)}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-black flex items-center space-x-1 shadow-md cursor-pointer transition-all active:scale-95"
                                  title={isFactoryRole ? 'Deliver shipment from Factory (Create Challan)' : `Deliver shipment from Factory (Bill #${delvInfo.nextBillNo})`}
                                >
                                  <Truck className="w-3.5 h-3.5" />
                                  <span>{isFactoryRole ? (delvInfo.deliveryCount > 0 ? 'Deliver Rest' : 'Deliver') : (delvInfo.deliveryCount > 0 ? `Deliver Rest (${delvInfo.nextBillNo})` : `Deliver (${delvInfo.nextBillNo})`)}</span>
                                </button>
                              ) : (
                                <span className="px-2 py-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 rounded-lg select-none">
                                  Delivered ✓
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => setSelectedRequisitionForView(req)}
                                className="p-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 rounded-lg transition-colors cursor-pointer"
                                title="View Requisition Slip"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedRequisitionForView(req);
                                  setIsReqPrintOptionOpen(true);
                                }}
                                className="p-1.5 bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-200 border border-cyan-400/35 rounded-lg transition-colors cursor-pointer"
                                title="Print Option (Copy Selector)"
                              >
                                <Sliders className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedRequisitionForView(req);
                                  setTimeout(() => window.print(), 100);
                                }}
                                className="p-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-lg transition-colors cursor-pointer shadow-xs"
                                title="Direct Print Option (Immediate Browser Print)"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingRequisition(req)}
                                className="p-1.5 bg-rose-950/60 hover:bg-rose-800 text-rose-300 rounded-lg transition-colors cursor-pointer border border-rose-700/40"
                                title="Delete Requisition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Approved Requisitions Cards (Mobile View) */}
          <div className="block md:hidden space-y-2.5">
            {approvedListRequisitions.length === 0 ? (
              <div className="p-6 text-center text-slate-400 cyber-glass-subcard rounded-xl border border-cyan-500/20 text-xs">
                No approved requisitions found
              </div>
            ) : (
              approvedListRequisitions.map((req) => {
                const isConverted = req.stage === 'converted_to_bill' || req.isLocked;
                const isReceived = req.stage === 'goods_received';
                const isDispatched = req.stage === 'factory_dispatched';
                const delvInfo = getReqDeliveryInfo(req);

                return (
                  <div
                    key={req.id}
                    className="p-3 rounded-xl cyber-glass-subcard border border-emerald-400/35 text-slate-200 space-y-2.5"
                  >
                    {/* Top Row: Req #, Date, Approved Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-bold font-mono text-amber-400 text-xs">
                          {req.reqNo?.toLowerCase().startsWith('req #') ? req.reqNo : (req.reqNo?.startsWith('#') ? req.reqNo.replace(/^#\s*/, 'req # ') : `req # ${req.reqNo}`)}
                        </span>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {req.reqDateStr || formatDateDDMMYY(req.date)}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold text-slate-300 text-xs">
                          {normalizeMarketingPersonName(req.marketingPersonName || req.createdByName || '')}
                        </span>
                      </div>
                    </div>

                    {/* Showroom & Customer */}
                    <div className="space-y-0.5 text-xs">
                      <div className="font-bold text-slate-100">
                        {getPartyDisplayWithAddress(req.partyName || req.branchName || '', req.partyAddress)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        <span className="text-slate-500">Destination:</span> {req.branchName || req.toDestination || 'Sales Center'}
                      </div>
                    </div>

                    {/* Item & Colour Breakdown on Mobile (Collapsed by default, visible all on View) */}
                    {req.lines && req.lines.length > 0 && (
                      <div className="p-2 bg-[#061520]/80 rounded-lg border border-cyan-500/20">
                        {expandedApprovedReqIds[req.id] ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between pb-1 border-b border-cyan-500/20">
                              <span className="text-[10px] font-bold text-slate-400">All Items ({req.lines.length})</span>
                              <button
                                type="button"
                                onClick={() => setExpandedApprovedReqIds((prev) => ({ ...prev, [req.id]: false }))}
                                className="text-[9.5px] text-cyan-300 underline cursor-pointer"
                              >
                                Collapse
                              </button>
                            </div>
                            {req.lines.map((ln, lIdx) => {
                              const colInfo = extractReqLineColors(ln);
                              return (
                                <div key={ln.id || lIdx} className="text-[11px]">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold text-slate-200">{ln.itemName || ln.itemCode}</span>
                                    <span className="font-mono font-bold text-amber-300 shrink-0">
                                      {ln.approvedQty ?? ln.requestedQty ?? 0} {ln.unit || 'Coils'}
                                    </span>
                                  </div>
                                  {(colInfo.badges.length > 0 || colInfo.customRemarks) && (
                                    <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                      {colInfo.badges.map((b) => (
                                        <span
                                          key={b.key}
                                          className={`px-1.5 py-0.2 rounded border text-[9.5px] font-mono font-bold ${b.darkClass}`}
                                        >
                                          {b.label}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-slate-300">
                              <span className="font-bold text-amber-300 font-mono mr-1.5">
                                {req.lines.length} {req.lines.length === 1 ? 'Item' : 'Items'}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                ({req.lines.reduce((s, l) => s + (l.approvedQty ?? l.requestedQty ?? 0), 0)} Coils)
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedRequisitionForView(req)}
                              className="text-[11px] font-bold text-cyan-300 underline cursor-pointer"
                            >
                              View All Items
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Stats */}
                    <div className={`grid ${isFactoryRole ? 'grid-cols-2' : 'grid-cols-3'} gap-2 p-2 bg-[#061520]/80 rounded-lg border border-cyan-500/20 text-center`}>
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase font-bold">Items</div>
                        <div className="font-mono font-bold text-slate-300 text-xs">{req.lines?.length || 0}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase font-bold">Qty (Coils)</div>
                        <div className="font-mono font-black text-amber-300 text-xs">{delvInfo.totalApproved}</div>
                        {delvInfo.totalDelivered > 0 && (
                          <div className="text-[9px] text-emerald-400 font-bold">{delvInfo.totalDelivered} delv</div>
                        )}
                        {delvInfo.totalRest > 0 && delvInfo.totalDelivered > 0 && (
                          <div className="text-[9px] text-rose-400 font-bold">{delvInfo.totalRest} rest</div>
                        )}
                      </div>
                      {!isFactoryRole && (
                        <div>
                          <div className="text-[10px] text-slate-500 uppercase font-bold">Amount</div>
                          <div className="font-mono font-bold text-emerald-400 text-xs">৳{req.totalAmount?.toLocaleString('en-IN') || 0}</div>
                        </div>
                      )}
                    </div>

                    {/* Delivery Status & Generated Bills */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[11px] text-slate-400 font-bold">Delivery Status:</span>
                        {delvInfo.isFullyDelivered ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-950 text-emerald-300 border border-emerald-500/50">
                            {delvInfo.deliveryCount > 1 ? `Fully Delivered (${delvInfo.deliveryCount} Parts)` : 'Fully Delivered'}
                          </span>
                        ) : delvInfo.isPartiallyDelivered ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-950 text-amber-300 border border-amber-500/50">
                            {delvInfo.deliveryCount > 1 ? `Partially Delivered (${delvInfo.deliveryCount} Parts)` : 'Partially Delivered (1 Part)'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                            Ready for Factory Delivery
                          </span>
                        )}
                      </div>
                      {req.deliveryHistory && req.deliveryHistory.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1">
                          {req.deliveryHistory.map((d, dIdx) => (
                            <span key={dIdx} className="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-blue-950/90 text-blue-300 border border-blue-500/50">
                              {isFactoryRole ? `Challan #${(d as any).challanNo || d.billNo}` : `Bill #${d.billNo}`} ({d.deliveredCoils} c)
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="space-y-1.5 pt-1 border-t border-cyan-500/20">
                      {!delvInfo.isFullyDelivered ? (
                        <button
                          type="button"
                          onClick={() => handleOpenDeliveryModal(req)}
                          className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-lg shadow-md transition-all flex items-center justify-center space-x-1.5"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          <span>{isFactoryRole ? (delvInfo.deliveryCount > 0 ? 'Deliver Rest' : 'Deliver Shipment') : (delvInfo.deliveryCount > 0 ? `Deliver Rest (${delvInfo.nextBillNo})` : `Deliver Shipment (${delvInfo.nextBillNo})`)}</span>
                        </button>
                      ) : (
                        <div className="text-center py-1 text-xs font-bold text-emerald-400 bg-emerald-950/40 rounded-lg border border-emerald-500/30">
                          Shipment Completed ✓
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedRequisitionForView(req)}
                          className="flex-1 py-1.5 px-2 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/25 text-slate-200 text-xs font-bold rounded-lg transition-colors flex items-center justify-center space-x-1"
                        >
                          <FileText className="w-3.5 h-3.5 text-cyan-300" />
                          <span>View Slip</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRequisitionForView(req);
                            setTimeout(() => window.print(), 100);
                          }}
                          className="py-1.5 px-3 bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-black rounded-lg transition-colors flex items-center space-x-1 shadow-xs"
                          title="Direct Print"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Direct Print</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingRequisition(req)}
                          className="py-1.5 px-2.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 rounded-lg border border-rose-500/40 transition-colors"
                          title="Delete Requisition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: DELIVERED REQUISITIONS & COMPLETED SUPPLY                         */}
      {/* ========================================================================= */}
      {activeTab === 'delivered' && (
        <div className="w-full space-y-3">
          {/* Quick Stat Cards */}
          <div className={`grid grid-cols-2 ${isFactoryRole ? 'sm:grid-cols-3' : 'sm:grid-cols-4'} gap-3`}>
            <div className="cyber-glass-subcard border border-cyan-500/25 p-3 rounded-xl shadow-md">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Delivered Orders</div>
              <div className="text-2xl font-black text-cyan-300 font-mono mt-0.5">
                {deliveredStats.totalCount}
              </div>
            </div>

            <div className="cyber-glass-subcard border border-cyan-500/25 p-3 rounded-xl shadow-md">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Delivered Quantity (Coils)</div>
              <div className="text-2xl font-black text-amber-300 font-mono mt-0.5">
                {deliveredStats.totalQty.toLocaleString('en-IN')}
              </div>
            </div>

            {!isFactoryRole && (
              <div className="cyber-glass-subcard border border-cyan-500/25 p-3 rounded-xl shadow-md">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Delivered Value</div>
                <div className="text-2xl font-black text-emerald-400 font-mono mt-0.5">
                  ৳{deliveredStats.totalAmount.toLocaleString('en-IN')}
                </div>
              </div>
            )}

            <div className="cyber-glass-subcard border border-cyan-500/25 p-3 rounded-xl shadow-md">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{isFactoryRole ? 'Delivery Challans' : 'Billed / Received'}</div>
              <div className="text-2xl font-black text-purple-300 font-mono mt-0.5">
                {isFactoryRole
                  ? deliveredListRequisitions.reduce((s, r) => s + (r.deliveryHistory?.length || 1), 0)
                  : `${deliveredStats.convertedCount} `}
                {!isFactoryRole && <span className="text-xs text-slate-400 font-normal">/ {deliveredStats.totalCount}</span>}
              </div>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="bg-[#081e2d]/85 backdrop-blur-xl text-white border border-cyan-500/25 p-2.5 px-3.5 rounded-2xl shadow-lg space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Search input */}
              <div className="flex-1 min-w-0 w-full sm:w-auto sm:min-w-[220px]">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={deliveredSearchQuery}
                    onChange={(e) => setDeliveredSearchQuery(e.target.value)}
                    placeholder={isFactoryRole ? 'Search by Req #, Challan #, Party, Destination, or Officer...' : 'Search by Req #, Bill #, Party, Destination, or Officer...'}
                    className="w-full pl-8 pr-7 py-1.5 h-[34px] bg-[#061520]/90 border border-cyan-500/30 rounded-xl text-xs text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 font-medium"
                  />
                  {deliveredSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setDeliveredSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Dropdowns */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Sales Center */}
                <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
                  <span className="text-cyan-200/80 font-bold text-[11px] whitespace-nowrap">Center:</span>
                  <select
                    value={deliveredCenterFilter}
                    onChange={(e) => {
                      const nextCenter = e.target.value;
                      setDeliveredCenterFilter(nextCenter);
                      if (deliveredMarketingFilter !== 'All') {
                        const nextNames = getFilteredMarketingNamesForCenter(nextCenter);
                        if (!nextNames.includes(deliveredMarketingFilter)) {
                          setDeliveredMarketingFilter('All');
                        }
                      }
                    }}
                    className="bg-transparent text-cyan-100 font-bold focus:outline-none text-xs max-w-[170px] cursor-pointer"
                  >
                    <option value="All" className="bg-[#091e2c] text-white">All Centers ({allSalesCenters.length})</option>
                    {allSalesCenters.map((c, cIdx) => (
                      <option key={`delv-${c}-${cIdx}`} value={c} className="bg-[#091e2c] text-white">
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Marketing */}
                <div className="flex items-center space-x-1.5 bg-[#061520]/90 text-white px-2.5 py-1 rounded-xl border border-cyan-500/30 shrink-0 h-[34px]">
                  <span className="text-cyan-200/80 font-bold text-[11px] whitespace-nowrap">Marketing:</span>
                  <select
                    value={deliveredMarketingFilter}
                    onChange={(e) => setDeliveredMarketingFilter(e.target.value)}
                    className="bg-transparent text-cyan-100 font-bold focus:outline-none text-xs max-w-[170px] cursor-pointer"
                  >
                    <option value="All" className="bg-[#091e2c] text-white">All Marketing</option>
                    {getFilteredMarketingNamesForCenter(deliveredCenterFilter).map((name, nIdx) => (
                      <option key={`delv-m-${name}-${nIdx}`} value={name} className="bg-[#091e2c] text-white">
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <StandardPeriodFilterBar
                  period={deliveredDateFilter}
                  onSelectPeriod={(preset) => setDeliveredDateFilter(preset)}
                  customStartDate={deliveredCustomStartDate}
                  customEndDate={deliveredCustomEndDate}
                  onCustomStartDateChange={(val) => {
                    setDeliveredCustomStartDate(val);
                    setDeliveredDateFilter('custom');
                  }}
                  onCustomEndDateChange={(val) => {
                    setDeliveredCustomEndDate(val);
                    setDeliveredDateFilter('custom');
                  }}
                  theme="dark"
                />

                {hasActiveDeliveredFilters && (
                  <button
                    type="button"
                    onClick={handleResetDeliveredFilters}
                    className="inline-flex items-center gap-1 px-2.5 py-1 h-[34px] bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 rounded-xl text-xs font-bold border border-rose-400/35 transition-colors cursor-pointer shrink-0"
                    title="Reset all filters"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-rose-300" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Delivered Requisitions Table (Desktop) */}
          <div className="hidden md:block cyber-glass-card border border-cyan-500/25 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto w-full">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-[#0c2638] text-cyan-200 font-bold uppercase text-[10px] border-b border-cyan-500/30 select-none">
                    <th
                      className="py-3 px-4 cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleDeliveredSort('reqNo')}
                    >
                      <span className="inline-flex items-center">
                        Req # {renderDeliveredSortIndicator('reqNo')}
                      </span>
                    </th>
                    <th
                      className="py-3 px-3 cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleDeliveredSort('date')}
                    >
                      <span className="inline-flex items-center">
                        Date {renderDeliveredSortIndicator('date')}
                      </span>
                    </th>
                    <th className="py-3 px-3">Sales Center / Destination</th>
                    <th
                      className="py-3 px-3 cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleDeliveredSort('partyName')}
                    >
                      <span className="inline-flex items-center">
                        Party / Customer {renderDeliveredSortIndicator('partyName')}
                      </span>
                    </th>
                    <th className="py-3 px-3">Marketing</th>
                    <th className="py-3 px-3 text-center">{isFactoryRole ? 'Delivery Challan #' : 'Delivered Bill #'}</th>
                    <th
                      className="py-3 px-2 text-center cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleDeliveredSort('total')}
                    >
                      <span className="inline-flex items-center justify-center">
                        Delivered Coils {renderDeliveredSortIndicator('total')}
                      </span>
                    </th>
                    {!isFactoryRole && (
                      <th
                        className="py-3 px-3 text-right cursor-pointer hover:text-white transition-colors"
                        onClick={() => handleDeliveredSort('amount')}
                      >
                        <span className="inline-flex items-center justify-end">
                          Amount {renderDeliveredSortIndicator('amount')}
                        </span>
                      </th>
                    )}
                    <th className="py-3 px-3 text-center">Approved By Admin</th>
                    <th className="py-3 px-3 text-center">Delivery Status</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                  {deliveredListRequisitions.length === 0 ? (
                    <tr>
                      <td colSpan={isFactoryRole ? 10 : 11} className="py-12 text-center text-slate-400">
                        <div className="max-w-md mx-auto space-y-2">
                          <Truck className="w-8 h-8 text-cyan-400/50 mx-auto" />
                          <div className="text-sm font-bold text-slate-300">No Delivered Orders Found</div>
                          <p className="text-xs text-slate-400">
                            Requisitions that are marked as Goods Received, Factory Dispatched, or Converted to Bill will appear here.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    deliveredListRequisitions.map((req) => {
                      const isConverted = !isFactoryRole && (req.stage === 'converted_to_bill' || req.isLocked || Boolean(req.convertedBillId));
                      const isReceived = req.stage === 'goods_received';
                      const cleanBillNo = !isFactoryRole
                        ? (req.convertedBillNo || (isConverted ? extractBillNoFromReqNo(req.reqNo, req.seqNumber) : null))
                        : null;
                      const fallbackChallanNo = extractBillNoFromReqNo(req.reqNo, req.seqNumber);

                      return (
                        <tr
                          key={`delv-row-${req.id}`}
                          className="hover:bg-cyan-500/[0.06] transition-colors border-l-4 border-l-cyan-400"
                        >
                          <td className="py-3 px-4 font-bold text-amber-400 font-mono">
                            <span>{req.reqNo?.toLowerCase().startsWith('req #') ? req.reqNo : (req.reqNo?.startsWith('#') ? req.reqNo.replace(/^#\s*/, 'req # ') : `req # ${req.reqNo}`)}</span>
                          </td>
                          <td className="py-3 px-3 text-slate-300 font-mono whitespace-nowrap">
                            {req.delvDateStr || req.reqDateStr || formatDateDDMMYY(req.date)}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-100">
                              {req.branchName || req.toDestination || 'Sales Center'}
                            </div>
                            {req.deliverySite && (
                              <div className="text-[10px] text-slate-400">{req.deliverySite}</div>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-200">
                              {getPartyDisplayWithAddress(req.partyName || req.branchName || '', req.partyAddress)}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-slate-300 font-medium whitespace-nowrap">
                            {normalizeMarketingPersonName(req.marketingPersonName || req.createdByName || 'Subrata Sutradhar')}
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap font-mono font-bold">
                            {req.deliveryHistory && req.deliveryHistory.length > 0 ? (
                              <div className="inline-flex flex-wrap items-center justify-center gap-1">
                                {req.deliveryHistory.map((d, dIdx) => {
                                  const rawCh = String((d as any).challanNo || d.billNo || '');
                                  const chLabel = rawCh.toUpperCase().startsWith('CH-') ? rawCh : `CH-${rawCh}`;
                                  return (
                                    <button
                                      key={dIdx}
                                      type="button"
                                      onClick={() => {
                                        const ch = buildChallanFromDelivery(req, d, dIdx);
                                        setPreviewReqForChallan(req);
                                        setPreviewDeliveryChallan(ch);
                                      }}
                                      className="px-2 py-0.5 rounded-md bg-indigo-950/80 hover:bg-indigo-800 text-indigo-300 hover:text-white border border-indigo-500/40 text-[11px] cursor-pointer transition-colors"
                                      title="Click to View / Reprint this Delivery Challan"
                                    >
                                      {isFactoryRole
                                        ? `Challan #${chLabel}`
                                        : (req.convertedBillNo ? `${chLabel} (Bill #${req.convertedBillNo})` : chLabel)}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (isFactoryRole || cleanBillNo) ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const ch = buildChallanFromDelivery(req);
                                  setPreviewReqForChallan(req);
                                  setPreviewDeliveryChallan(ch);
                                }}
                                className="px-2 py-0.5 rounded-md bg-indigo-950/80 hover:bg-indigo-800 text-indigo-300 hover:text-white border border-indigo-500/40 text-[11px] cursor-pointer transition-colors"
                                title="Click to View / Reprint Delivery Challan"
                              >
                                {isFactoryRole ? `Challan #CH-${fallbackChallanNo}` : `Bill #${cleanBillNo}`}
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Ready to Bill</span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center font-black text-amber-300 font-mono text-sm">
                            {req.totalDeliveredQty || req.totalRequestedQty || 0}
                          </td>
                          {!isFactoryRole && (
                            <td className="py-3 px-3 text-right font-bold text-slate-100 font-mono whitespace-nowrap">
                              ৳{req.totalAmount?.toLocaleString('en-IN') || 0}
                            </td>
                          )}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <div className="inline-flex flex-row items-center justify-center gap-1.5 whitespace-nowrap">
                              <span className="text-[10px] font-black text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40 shadow-2xs" title={`Approved by: ${req.approvedBy || req.approverName}`}>
                                Admin: {req.approvedBy || req.approverName || 'Sales Center Admin'}
                              </span>
                              {(req.approverApprovalDate || req.approvedAt) && (
                                <span className="text-[9px] text-slate-400 font-mono">
                                  {formatDateDDMMYY(req.approverApprovalDate || req.approvedAt || '')}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-950 text-blue-300 border border-blue-500/50">
                              <Truck className="w-3 h-3 text-blue-400" />
                              <span>{isFactoryRole ? (isReceived ? 'Delivered' : 'Dispatched') : (isConverted ? 'Delivered & Billed' : isReceived ? 'Goods Received' : 'Delivered')}</span>
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end space-x-1.5 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => {
                                  const hist = req.deliveryHistory && req.deliveryHistory.length > 0 ? req.deliveryHistory[req.deliveryHistory.length - 1] : undefined;
                                  const histIdx = req.deliveryHistory && req.deliveryHistory.length > 0 ? req.deliveryHistory.length - 1 : 0;
                                  const ch = buildChallanFromDelivery(req, hist, histIdx);
                                  setPreviewReqForChallan(req);
                                  setPreviewDeliveryChallan(ch);
                                }}
                                className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold transition-colors cursor-pointer flex items-center space-x-1"
                                title="View & Reprint Delivery Challan"
                              >
                                <Printer className="w-3 h-3" />
                                <span>Reprint Challan</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const hist = req.deliveryHistory && req.deliveryHistory.length > 0 ? req.deliveryHistory[req.deliveryHistory.length - 1] : undefined;
                                  const histIdx = req.deliveryHistory && req.deliveryHistory.length > 0 ? req.deliveryHistory.length - 1 : 0;
                                  const ch = buildChallanFromDelivery(req, hist, histIdx);
                                  handleDownloadDeliveryChallanPdf(ch);
                                }}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold transition-colors cursor-pointer flex items-center space-x-1"
                                title="Download Delivery Challan (PDF)"
                              >
                                <Download className="w-3 h-3" />
                                <span>Download Challan</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedRequisitionForView(req)}
                                className="p-1.5 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/25 text-slate-200 rounded-lg transition-colors cursor-pointer"
                                title="View Requisition Slip"
                              >
                                <FileText className="w-3.5 h-3.5 text-cyan-300" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadExcel(req)}
                                className="p-1.5 bg-teal-950/60 hover:bg-teal-800 text-teal-300 rounded-lg transition-colors cursor-pointer border border-teal-500/40"
                                title="Download Excel"
                              >
                                <FileSpreadsheet className="w-3.5 h-3.5" />
                              </button>
                              {onOpenBillInEditor && !isFactoryRole && (
                                <button
                                  type="button"
                                  onClick={() => handleConvertToBill(req)}
                                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-colors cursor-pointer flex items-center space-x-1 ${
                                    isConverted
                                      ? 'bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-200 border border-emerald-400/40'
                                      : 'bg-cyan-400 hover:bg-cyan-300 text-slate-950 shadow-xs'
                                  }`}
                                  title={isConverted ? 'Open / Edit Converted Bill' : 'Convert Delivered Requisition to Bill'}
                                >
                                  <FileCheck className="w-3 h-3" />
                                  <span>{isConverted ? 'Billed ✓' : 'Convert to Bill'}</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Delivered Requisitions Cards (Mobile) */}
          <div className="block md:hidden space-y-3">
            {deliveredListRequisitions.length === 0 ? (
              <div className="cyber-glass-subcard border border-cyan-500/25 p-8 rounded-2xl text-center text-slate-400">
                <Truck className="w-8 h-8 text-cyan-400/50 mx-auto mb-2" />
                <div className="text-sm font-bold text-slate-300">No Delivered Orders Found</div>
              </div>
            ) : (
              deliveredListRequisitions.map((req) => {
                const cleanBillNo = req.convertedBillNo || extractBillNoFromReqNo(req.reqNo, req.seqNumber);

                return (
                  <div
                    key={`delv-card-${req.id}`}
                    className="cyber-glass-subcard border border-cyan-500/25 p-3.5 rounded-2xl shadow-lg border-l-4 border-l-cyan-400 space-y-2.5"
                  >
                    <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
                      <div className="font-bold text-amber-400 font-mono text-sm">
                        {req.reqNo}
                      </div>
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950/80 text-cyan-200 border border-cyan-400/40">
                        <Truck className="w-3 h-3 text-cyan-300" />
                        <span>Delivered</span>
                      </span>
                    </div>

                    <div className="text-xs space-y-1">
                      <div className="font-bold text-slate-100">
                        {getPartyDisplayWithAddress(req.partyName || req.branchName || '', req.partyAddress)}
                      </div>
                      <div className="text-slate-400 flex items-center justify-between text-[11px]">
                        <span>Center: {req.branchName || req.toDestination}</span>
                        <span>{req.delvDateStr || req.reqDateStr || formatDateDDMMYY(req.date)}</span>
                      </div>
                      {req.deliveryHistory && req.deliveryHistory.length > 0 ? (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {req.deliveryHistory.map((d, dIdx) => (
                            <button
                              key={dIdx}
                              type="button"
                              onClick={() => {
                                const ch = buildChallanFromDelivery(req, d, dIdx);
                                setPreviewReqForChallan(req);
                                setPreviewDeliveryChallan(ch);
                              }}
                              className="px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-500/40 font-mono font-bold text-[10px] cursor-pointer"
                            >
                              Challan #{(d as any).challanNo || d.billNo}
                            </button>
                          ))}
                        </div>
                      ) : cleanBillNo ? (
                        <div className="text-cyan-300 font-mono font-bold text-[11px]">
                          Challan No: CH-{cleanBillNo}
                        </div>
                      ) : null}
                      {(req.approvedBy || req.approverName) && (
                        <div className="text-emerald-400 text-[10px] font-bold">
                          Approved by: {req.approvedBy || req.approverName}
                        </div>
                      )}
                    </div>

                    <div className={`grid ${isFactoryRole ? 'grid-cols-1' : 'grid-cols-2'} gap-2 p-2 bg-[#061520]/80 border border-cyan-500/20 rounded-lg text-center text-xs`}>
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-bold">Delivered Coils</div>
                        <div className="font-mono font-black text-amber-300">{req.totalDeliveredQty || req.totalRequestedQty || 0}</div>
                      </div>
                      {!isFactoryRole && (
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase font-bold">Amount</div>
                          <div className="font-mono font-bold text-emerald-400">৳{(req.totalAmount || 0).toLocaleString('en-IN')}</div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-1.5 pt-1 border-t border-cyan-500/20">
                      <button
                        type="button"
                        onClick={() => {
                          const hist = req.deliveryHistory && req.deliveryHistory.length > 0 ? req.deliveryHistory[req.deliveryHistory.length - 1] : undefined;
                          const histIdx = req.deliveryHistory && req.deliveryHistory.length > 0 ? req.deliveryHistory.length - 1 : 0;
                          const ch = buildChallanFromDelivery(req, hist, histIdx);
                          setPreviewReqForChallan(req);
                          setPreviewDeliveryChallan(ch);
                        }}
                        className="flex-1 py-1.5 px-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center space-x-1 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Reprint Challan</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const hist = req.deliveryHistory && req.deliveryHistory.length > 0 ? req.deliveryHistory[req.deliveryHistory.length - 1] : undefined;
                          const histIdx = req.deliveryHistory && req.deliveryHistory.length > 0 ? req.deliveryHistory.length - 1 : 0;
                          const ch = buildChallanFromDelivery(req, hist, histIdx);
                          handleDownloadDeliveryChallanPdf(ch);
                        }}
                        className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center space-x-1 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedRequisitionForView(req)}
                        className="py-1.5 px-2.5 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/25 text-slate-200 text-xs font-bold rounded-lg transition-colors flex items-center justify-center space-x-1 cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5 text-cyan-300" />
                        <span>Slip</span>
                      </button>
                      {onOpenBillInEditor && !isFactoryRole && (
                        <button
                          type="button"
                          onClick={() => handleConvertToBill(req)}
                          className={`py-1.5 px-3 text-xs font-black rounded-lg transition-colors cursor-pointer ${
                            req.stage === 'converted_to_bill' || req.isLocked
                              ? 'bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-200 border border-emerald-400/40'
                              : 'bg-cyan-400 hover:bg-cyan-300 text-slate-950'
                          }`}
                        >
                          {req.stage === 'converted_to_bill' || req.isLocked ? 'Billed ✓' : 'Convert to Bill'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Bottom Utility Action Bar (Only shown in non-approval mode) */}
      {!isApprovalPage && (
        <div className="max-w-[1700px] mx-auto mt-4 flex flex-wrap items-center justify-end gap-2 no-print">
          <button
            type="button"
            onClick={handlePrint}
            className="px-3 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 text-xs font-bold rounded-xl flex items-center space-x-1.5 border border-cyan-500/25 transition-all cursor-pointer hover:text-white"
            title="Print official Requisition Slip"
          >
            <Printer className="w-3.5 h-3.5 text-amber-300" />
            <span>Print Slip</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenEmailModal()}
            className="px-3 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 text-xs font-bold rounded-xl flex items-center space-x-1.5 border border-cyan-500/30 transition-all cursor-pointer"
            title="Email Requisition Excel Sheet to Factory/DGM"
          >
            <Mail className="w-3.5 h-3.5 text-cyan-300" />
            <span>Mail Excel</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenWhatsAppModal()}
            className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer"
            title="Send Requisition via WhatsApp"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-300" />
            <span>WhatsApp</span>
          </button>

          <button
            type="button"
            onClick={() => handleDownloadExcel()}
            className="px-3 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-emerald-300 text-xs font-bold rounded-xl flex items-center space-x-1.5 border border-cyan-500/25 transition-all cursor-pointer"
            title="Download formatted Excel (.xlsx)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>

          {onOpenForecast && (
            <button
              type="button"
              onClick={onOpenForecast}
              className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 text-xs font-bold rounded-xl flex items-center space-x-1.5 border border-purple-400/40 transition-all cursor-pointer active:scale-95"
              title="Open AI Sales & Demand Forecasting Intelligence"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
              <span>AI Forecast</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleConvertToBill()}
            className={`px-3 py-1.5 text-xs font-black rounded-xl flex items-center space-x-1.5 transition-all shadow-md cursor-pointer ${
              isCurrentReqConverted
                ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950'
                : 'bg-cyan-400 hover:bg-cyan-300 text-slate-950'
            }`}
            title={isCurrentReqConverted ? 'Go to Converted Office Bill' : 'Convert this Requisition into Office Sales Bill'}
          >
            {isCurrentReqConverted ? <FileSpreadsheet className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
            <span>{isCurrentReqConverted ? 'Go to Office Bill' : 'Convert to Bill'}</span>
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL FOR VIEWING PAST REQUISITION SLIP                                   */}
      {/* ========================================================================= */}
      {selectedRequisitionForView && (
        <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl border border-cyan-400/35 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-[0_24px_64px_rgba(0,0,0,0.65)] text-white">
            <div className="flex items-center justify-between border-b border-cyan-500/25 pb-3">
              <h3 className="text-base font-bold text-white">Requisition {selectedRequisitionForView.reqNo}</h3>
              <button
                type="button"
                onClick={() => setSelectedRequisitionForView(null)}
                className="text-cyan-300/70 hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Slip content */}
            <div id="requisition-modal-print-slip" className="bg-white text-slate-950 p-5 rounded-xl space-y-3 text-xs">
              <div className="text-center">
                <div className="flex justify-center mb-1">
                  <PolyCablesLogo size="lg" showSubtitle={true} subtitleText="IND. LTD." />
                </div>
                <div className="text-[10px] font-black uppercase tracking-wider bg-slate-950 text-white px-3 py-0.5 rounded-full inline-block mt-1">
                  REQUISITION SLIP {reqPrintCopyType ? `• ${reqPrintCopyType}` : ''}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-200">
                <div>
                  <strong>Req #:</strong> {selectedRequisitionForView.reqNo}
                  <br />
                  <strong>Branch / Party:</strong> {getPartyDisplayWithAddress(selectedRequisitionForView.partyName || selectedRequisitionForView.branchName || '', selectedRequisitionForView.partyAddress)}
                </div>
                <div className="text-right">
                  <strong>Date:</strong> {formatDateDDMMYY(selectedRequisitionForView.date)}
                  <br />
                  <strong>Prepared By:</strong> {selectedRequisitionForView.createdByName}
                </div>
              </div>

              <table className="w-full border border-slate-300 text-xs mt-2">
                <thead>
                  <tr className="bg-slate-100 font-bold border-b border-slate-300">
                    <th className="p-1 border-r border-slate-300 text-center">SL</th>
                    <th className="p-1 border-r border-slate-300 text-left">Item</th>
                    <th className="p-1 border-r border-slate-300 text-center">Qty</th>
                    <th className="p-1 text-center">Colour / Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRequisitionForView.lines?.map((l, i) => {
                    const colInfo = extractReqLineColors(l);
                    return (
                      <tr key={l.id || i} className="border-b border-slate-200">
                        <td className="p-1 border-r border-slate-300 text-center">{i + 1}</td>
                        <td className="p-1 border-r border-slate-300 font-semibold">{l.itemName}</td>
                        <td className="p-1 border-r border-slate-300 text-center font-mono font-bold whitespace-nowrap">
                          {l.requestedQty} {l.unit}
                        </td>
                        <td className="p-1 text-center">
                          {colInfo.badges.length > 0 || colInfo.customRemarks ? (
                            <div className="inline-flex flex-wrap items-center justify-center gap-1">
                              {colInfo.badges.map((b) => (
                                <span
                                  key={b.key}
                                  className={`px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold ${b.lightClass}`}
                                >
                                  {b.label}
                                </span>
                              ))}
                              {colInfo.customRemarks && (
                                <span className="text-[11px] text-slate-700 font-medium">{colInfo.customRemarks}</span>
                              )}
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="flex justify-between font-bold text-xs pt-1">
                <span>Total Quantity: {selectedRequisitionForView.totalRequestedQty}</span>
                {!isFactoryRole && (
                  <span>Amount: ৳{selectedRequisitionForView.totalAmount?.toLocaleString('en-IN')}</span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                {!Boolean(selectedRequisitionForView.isApproved || selectedRequisitionForView.stage === 'sent_to_factory' || selectedRequisitionForView.stage === 'factory_dispatched' || selectedRequisitionForView.stage === 'converted_to_bill') && (
                  <button
                    type="button"
                    onClick={() => {
                      handleEditRequisition(selectedRequisitionForView);
                    }}
                    className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black flex items-center space-x-1.5 cursor-pointer shadow-md"
                    title="Edit this Requisition (Available before approval)"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>Edit Requisition</span>
                  </button>
                )}
                {!isFactoryRole && (
                  selectedRequisitionForView.stage !== 'converted_to_bill' && !selectedRequisitionForView.isLocked ? (
                    <button
                      type="button"
                      onClick={() => {
                        const target = selectedRequisitionForView;
                        setSelectedRequisitionForView(null);
                        handleConvertToBill(target);
                      }}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center space-x-1.5 cursor-pointer shadow-md"
                      title="Convert this Requisition into Office Sales Bill"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      <span>Convert to Bill</span>
                    </button>
                  ) : (
                    <span className="px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-xl flex items-center space-x-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Converted to Bill</span>
                    </span>
                  )
                )}
                <button
                  type="button"
                  onClick={() => setIsReqPrintOptionOpen((prev) => !prev)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-md transition-all ${
                    isReqPrintOptionOpen
                      ? 'bg-amber-600 text-white ring-2 ring-amber-400'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                  title="Configure print options (Copy heading, notes, format)"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Print Option</span>
                </button>
              </div>

              {/* Print Option Toolbar */}
              {isReqPrintOptionOpen && (
                <div className="w-full bg-[#061520] border border-cyan-500/30 p-2.5 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-cyan-200">Copy Type:</span>
                    <select
                      value={reqPrintCopyType}
                      onChange={(e) => {
                        setReqPrintCopyType(e.target.value);
                        setIsReqPrintOptionOpen(false);
                      }}
                      className="bg-[#081b28] text-amber-300 font-bold border border-cyan-500/30 rounded-lg px-2 py-1 text-xs focus:ring-1 focus:ring-cyan-400"
                    >
                      <option value="Factory Copy">Factory Copy</option>
                      <option value="Showroom Copy">Showroom Copy</option>
                      <option value="Accounts Copy">Accounts Copy</option>
                      <option value="Store Copy">Store Copy</option>
                      <option value="Original Copy">Original Copy</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsReqPrintOptionOpen(false);
                      setTimeout(() => window.print(), 50);
                    }}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-sm flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print with {reqPrintCopyType}</span>
                  </button>
                </div>
              )}

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsReqPrintOptionOpen(false);
                    setSelectedRequisitionForView(null);
                  }}
                  className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-xl text-xs font-black cursor-pointer shadow-md flex items-center space-x-1.5"
                  title="Direct 1-Click Print (Immediate Browser Print)"
                >
                  <Printer className="w-4 h-4 text-slate-950" />
                  <span>Direct Print Option</span>
                </button>
              </div>
            </div>
          </div>
      )}

      {/* Email Sender Modal for Requisitions with Excel Attachment */}
      {showEmailModal && (
        <EmailSenderModal
          isOpen={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          defaultRecipient=""
          defaultSubject={emailDefaultSubject}
          defaultMessage={emailDefaultMessage}
          htmlBody={emailHtmlBody}
          attachmentName={emailAttachmentName}
          attachmentData={emailAttachmentData}
          documentType="requisition"
          company={company}
          companyName={company?.name || 'Poly Cables'}
          onEmailSentSuccess={() => {
            if (activeEmailRequisitionId) {
              const updated = requisitions.map((r) => {
                if (r.id === activeEmailRequisitionId) {
                  return {
                    ...r,
                    auditMailSent: true,
                    auditMailSentAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                  };
                }
                return r;
              });
              saveRequisitionsToStorage(updated);
            }
          }}
        />
      )}

      {/* WhatsApp Sender Modal with Direct In-App Sending & Excel Attachment */}
      {showWhatsAppModal && (
        <WhatsAppSenderModal
          isOpen={showWhatsAppModal}
          onClose={() => setShowWhatsAppModal(false)}
          defaultPhone={whatsAppDefaultPhone}
          defaultMessage={whatsAppDefaultMessage}
          partyName={whatsAppPartyName}
          partyAddress={whatsAppPartyAddress}
          parties={parties}
          salespersons={salespersons}
          attachmentFileName={whatsAppAttachmentName}
          attachmentBase64={whatsAppAttachmentData}
          onSuccessOpenMail={() => {
            setShowWhatsAppModal(false);
            setShowEmailModal(true);
          }}
        />
      )}

      {/* Color Quantity Selection Modal */}
      {colorModalState && colorModalState.isOpen && (
        <ColorQuantityModal
          isOpen={colorModalState.isOpen}
          item={colorModalState.item}
          unit={colorModalState.unit}
          initialColors={colorModalState.initialColors}
          initialTotalQty={colorModalState.initialTotalQty}
          onConfirm={handleConfirmColorModal}
          onClose={() => {
            const lineId = colorModalState?.lineId;
            const currentIdx = lines.findIndex((l) => l.id === lineId);
            let nextLineId = '';
            if (currentIdx >= 0 && currentIdx < lines.length - 1) {
              nextLineId = lines[currentIdx + 1].id;
            } else if (lineId) {
              nextLineId = lineId;
            }
            setColorModalState(null);
            if (nextLineId) {
              focusRequisitionItemInput(nextLineId);
            }
          }}
        />
      )}

      {/* Save Success Popup Modal (Auto Closes in 0.3s) */}
      {saveNotification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none transition-all duration-100">
          <div className="bg-[#091e2c]/95 text-white px-7 py-4 rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] flex items-center space-x-3.5 border-2 border-emerald-400/60 transform scale-100 animate-in fade-in zoom-in duration-75 backdrop-blur-2xl">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="text-base font-black tracking-wide text-white">Success!</div>
              <div className="text-xs font-bold text-emerald-300">Requisition saved successfully</div>
            </div>
          </div>
        </div>
      )}

      {/* Default Approver "Set Option" Modal */}
      {isApproverModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl max-w-md w-full shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 text-white overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="cyber-glass-header px-5 py-4 text-white flex items-center justify-between border-b border-cyan-500/25">
              <div className="flex items-center space-x-2">
                <Settings className="w-5 h-5 text-cyan-400" />
                <h3 className="font-black text-sm">Default Approver Option</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsApproverModalOpen(false)}
                className="text-cyan-300/70 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-300 leading-relaxed">
                Configure the default approver name for all new requisitions. New requisitions will automatically have <strong className="text-cyan-200">Approved By</strong> set to this name.
              </p>

              <div className="space-y-1.5">
                <label className="font-bold text-cyan-200">Approver Name & Title:</label>
                <input
                  type="text"
                  value={tempApproverInput}
                  onChange={(e) => setTempApproverInput(e.target.value)}
                  placeholder="Enter assigned approver name"
                  className="w-full p-2.5 border border-cyan-500/30 rounded-xl font-bold bg-[#061520] text-white placeholder:text-slate-400 text-sm focus:border-cyan-400 focus:outline-none"
                />
              </div>

              {salespersons.some((s) => s.role?.toLowerCase().includes('admin') || s.isInCharge) && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-cyan-300/80 uppercase tracking-wider">Assigned Admins / In-Charges:</span>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(
                      new Set(
                        salespersons
                          .filter((s) => s.name && (s.role?.toLowerCase().includes('admin') || s.isInCharge))
                          .map((s) => s.name.trim())
                      )
                    ).map((suggested, sugIdx) => (
                      <button
                        key={`sug-${suggested}-${sugIdx}`}
                        type="button"
                        onClick={() => setTempApproverInput(suggested)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                          tempApproverInput === suggested
                            ? 'bg-cyan-400 text-slate-950 border-cyan-300 font-black'
                            : 'bg-[#081b28] text-slate-200 hover:bg-[#0e2a3d] border-cyan-500/25'
                        }`}
                      >
                        {suggested}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-cyan-500/20 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsApproverModalOpen(false)}
                  className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 rounded-xl font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveDefaultApprover(tempApproverInput)}
                  className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-xl font-black shadow-md transition-colors cursor-pointer flex items-center space-x-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save Default Approver</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Requisition Delete Confirmation Modal */}
      {deletingRequisition && (
        <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl border border-rose-500/40 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-[0_24px_64px_rgba(0,0,0,0.65)] text-white animate-in fade-in">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black tracking-wide text-white">Delete Requisition?</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  {deletingRequisition.reqNo || deletingRequisition.id}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to permanently delete this requisition for{' '}
              <strong className="text-amber-300 font-semibold">{deletingRequisition.partyName || deletingRequisition.branchName || 'Customer'}</strong>? This will permanently delete it across all devices.
            </p>
            <div className="flex items-center justify-end space-x-2.5 pt-2 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setDeletingRequisition(null)}
                className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteRequisition}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition-colors shadow-md flex items-center space-x-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Factory Multi-Delivery Modal (Inline Item Name + Colour Boxes with Required Above & Auto-Summed Qty -> Creates Challan) */}
      {deliveryModalReq && (
        <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div ref={deliveryModalContainerRef} className="bg-[#091e2c]/95 backdrop-blur-2xl border border-cyan-400/35 rounded-2xl max-w-6xl w-full p-4 sm:p-5 space-y-3.5 shadow-[0_24px_64px_rgba(0,0,0,0.65)] text-white animate-in fade-in my-auto max-h-[95vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-cyan-500/25 pb-3">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-400">
                  <Truck className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base sm:text-lg font-black text-white">Factory Goods Delivery</h3>
                    {(() => {
                      const idx = deliveryModalReq.deliveryHistory?.length || 0;
                      const nextBill = getDeliveryBillNo(deliveryModalReq, idx);
                      return (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-black bg-emerald-500 text-slate-950 shadow-sm">
                          Challan #{deliveryChallanNo || `CH-${nextBill}`}
                        </span>
                      );
                    })()}
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    Req #{deliveryModalReq.reqNo} • {deliveryModalReq.partyName || deliveryModalReq.branchName} • Delivery #{((deliveryModalReq.deliveryHistory?.length || 0) + 1)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeliveryError('');
                  setDeliveryModalReq(null);
                }}
                className="text-cyan-300/70 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {deliveryError && (
              <div className="px-3 py-2 rounded-xl bg-rose-950/90 border border-rose-500/60 text-rose-200 text-xs font-semibold flex items-center justify-between">
                <span>{deliveryError}</span>
                <button
                  type="button"
                  onClick={() => setDeliveryError('')}
                  className="text-rose-300 hover:text-white ml-2 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Delivery Metadata Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-[#061520]/80 rounded-xl border border-cyan-500/25 text-xs">
              <div>
                <label className="text-cyan-200/80 font-bold block mb-1">Delivery Date (dd.mm.yy):</label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    data-delivery-focus="true"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    onBlur={() => {
                      if (deliveryDate.trim()) {
                        setDeliveryDate(formatDateDDMMYY(deliveryDate) || deliveryDate);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (deliveryDate.trim()) {
                          setDeliveryDate(formatDateDDMMYY(deliveryDate) || deliveryDate);
                        }
                        focusNextDeliveryInput(e.currentTarget);
                      }
                    }}
                    placeholder="dd.mm.yy"
                    className="w-full p-2 pr-8 bg-[#061520] border border-cyan-500/30 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                  />
                  <div className="absolute right-1.5 top-0 bottom-0 flex items-center justify-center">
                    <input
                      type="date"
                      tabIndex={-1}
                      value={parseDateToISO(deliveryDate)}
                      onChange={(e) => {
                        if (e.target.value) {
                          setDeliveryDate(formatDateDDMMYY(e.target.value));
                        }
                      }}
                      className="opacity-0 absolute inset-0 w-5 h-full cursor-pointer z-10"
                      title="Pick Delivery Date (dd.mm.yy)"
                    />
                    <Calendar className="w-3.5 h-3.5 text-cyan-300/80 pointer-events-none" />
                  </div>
                </div>
              </div>
              <div>
                <label className="text-cyan-200/80 font-bold block mb-1">Challan No:</label>
                <input
                  type="text"
                  data-delivery-focus="true"
                  value={deliveryChallanNo}
                  onChange={(e) => setDeliveryChallanNo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      focusNextDeliveryInput(e.currentTarget);
                    }
                  }}
                  placeholder={`CH-${getDeliveryBillNo(deliveryModalReq, deliveryModalReq.deliveryHistory?.length || 0)}`}
                  className="w-full p-2 bg-[#061520] border border-cyan-500/30 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="text-cyan-200/80 font-bold block mb-1">Vehicle / Transport No:</label>
                <input
                  type="text"
                  data-delivery-focus="true"
                  value={deliveryVehicleNo}
                  onChange={(e) => setDeliveryVehicleNo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      focusNextDeliveryInput(e.currentTarget);
                    }
                  }}
                  placeholder="e.g. Dhaka Metro-Ta 11-2233"
                  className="w-full p-2 bg-[#061520] border border-cyan-500/30 rounded-lg text-white text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            {/* Items Table for Multi-Delivery (Item Name + Colour Input Form on SAME LINE, Required above box, Auto Total Qty) */}
            <div className="flex-1 overflow-auto min-h-[180px] max-h-[420px] border border-cyan-500/25 rounded-xl">
              <table className="w-full text-xs text-left border-collapse min-w-[880px]">
                <thead className="sticky top-0 z-10 bg-[#0c2638] text-cyan-200 font-bold border-b border-cyan-500/30 text-[11px]">
                  <tr>
                    <th className="py-2.5 px-2.5 w-10 text-center">SL</th>
                    <th className="py-2.5 px-3 min-w-[200px]">Item Name</th>
                    <th className="py-2.5 px-2.5 min-w-[330px] text-center">Colour Input (Required Qty Shown Above Each Box)</th>
                    <th className="py-2.5 px-2 w-16 text-center">Appr</th>
                    <th className="py-2.5 px-2 w-14 text-center">Delv</th>
                    <th className="py-2.5 px-2 w-14 text-center">Rest</th>
                    <th className="py-2.5 px-3 w-24 text-right font-black text-emerald-400">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60">
                  {(deliveryModalReq.lines || []).map((l, idx) => {
                    const approved = Number(l.approvedQty || l.requestedQty || 0);
                    const prevDelivered = Number(l.deliveredQty || 0);
                    const rest = Math.max(0, approved - prevDelivered);
                    const colInfo = extractReqLineColors(l);
                    const prevDelCol = (l as any).deliveredColors || {};
                    const remColors: Record<'red' | 'black' | 'yellow' | 'green' | 'blue' | 'others', number> = {
                      red: Math.max(0, (colInfo.red || 0) - (Number(prevDelCol.red) || 0)),
                      black: Math.max(0, (colInfo.black || 0) - (Number(prevDelCol.black ?? prevDelCol.blk) || 0)),
                      yellow: Math.max(0, (colInfo.yellow || 0) - (Number(prevDelCol.yellow ?? prevDelCol.yel) || 0)),
                      green: Math.max(0, (colInfo.green || 0) - (Number(prevDelCol.green ?? prevDelCol.grn) || 0)),
                      blue: Math.max(0, (colInfo.blue || 0) - (Number(prevDelCol.blue ?? prevDelCol.blu) || 0)),
                      others: Math.max(0, (colInfo.others || 0) - (Number(prevDelCol.others) || 0))
                    };
                    const matchedCatalogItem = items.find(
                      (it) => it.id === l.itemId || it.name.toLowerCase().trim() === (l.itemName || l.itemCode || '').toLowerCase().trim()
                    );
                    const needsColorInput =
                      colInfo.badges.length > 0 ||
                      isColorApplicableCable(
                        matchedCatalogItem || {
                          name: l.itemName || '',
                          category: (l as any).category || ''
                        }
                      );
                    const curColor = deliveryColorInputs[l.id] || {};
                    const colorSum =
                      (Number(curColor.red) || 0) +
                      (Number(curColor.black) || 0) +
                      (Number(curColor.yellow) || 0) +
                      (Number(curColor.green) || 0) +
                      (Number(curColor.blue) || 0) +
                      (Number(curColor.others) || 0);
                    const deliveringNow = needsColorInput && colorSum > 0 ? colorSum : (deliveryInputs[l.id] ?? 0);
                    const isOverRest = deliveringNow > rest;

                    const colorFields: Array<{ key: 'red' | 'black' | 'yellow' | 'green' | 'blue' | 'others'; label: string; borderCls: string; textCls: string }> = [
                      { key: 'red', label: 'Red', borderCls: 'border-rose-500/60 focus:ring-rose-400', textCls: 'text-rose-300' },
                      { key: 'black', label: 'Blk', borderCls: 'border-slate-500 focus:ring-slate-400', textCls: 'text-slate-200' },
                      { key: 'yellow', label: 'Yel', borderCls: 'border-amber-500/60 focus:ring-amber-400', textCls: 'text-amber-300' },
                      { key: 'green', label: 'Grn', borderCls: 'border-emerald-500/60 focus:ring-emerald-400', textCls: 'text-emerald-300' },
                      { key: 'blue', label: 'Blu', borderCls: 'border-sky-500/60 focus:ring-sky-400', textCls: 'text-sky-300' },
                      { key: 'others', label: 'Oth', borderCls: 'border-purple-500/60 focus:ring-purple-400', textCls: 'text-purple-300' }
                    ];

                    return (
                      <tr key={l.id || idx} className="hover:bg-cyan-500/[0.06] transition-colors">
                        <td className="py-2 px-2.5 text-center text-slate-400 font-mono align-middle">{idx + 1}</td>
                        <td className="py-2 px-3 align-middle">
                          <div className="font-bold text-slate-100 leading-snug">{l.itemName || l.itemCode || 'Cable Item'}</div>
                          {colInfo.customRemarks && (
                            <div className="text-[10px] text-slate-400 mt-0.5">{colInfo.customRemarks}</div>
                          )}
                        </td>
                        <td className="py-2 px-2.5 align-middle">
                          {needsColorInput ? (
                            <div className="grid grid-cols-6 gap-1.5 items-end">
                              {colorFields.map((cf) => {
                                const val = Number(curColor[cf.key] || 0);
                                const reqColQty = remColors[cf.key] || 0;
                                return (
                                  <div key={cf.key} className="flex flex-col items-center">
                                    <span
                                      className={`text-[9px] font-mono font-bold leading-none mb-0.5 whitespace-nowrap ${
                                        reqColQty > 0 ? 'text-cyan-300' : 'text-slate-500'
                                      }`}
                                      title={`Required ${cf.label}: ${reqColQty}`}
                                    >
                                      Req:{reqColQty}
                                    </span>
                                    <label className={`text-[9px] font-black uppercase leading-none mb-1 ${cf.textCls}`}>
                                      {cf.label}
                                    </label>
                                    <input
                                      type="number"
                                      min="0"
                                      data-delivery-focus="true"
                                      value={val === 0 ? '' : val}
                                      onChange={(e) => {
                                        const nVal = Math.max(0, parseInt(e.target.value, 10) || 0);
                                        setDeliveryError('');
                                        const nextLineColor = {
                                          ...curColor,
                                          [cf.key]: nVal
                                        };
                                        const nextSum =
                                          (Number(nextLineColor.red) || 0) +
                                          (Number(nextLineColor.black) || 0) +
                                          (Number(nextLineColor.yellow) || 0) +
                                          (Number(nextLineColor.green) || 0) +
                                          (Number(nextLineColor.blue) || 0) +
                                          (Number(nextLineColor.others) || 0);
                                        setDeliveryColorInputs((prev) => ({
                                          ...prev,
                                          [l.id]: nextLineColor
                                        }));
                                        setDeliveryInputs((prev) => ({
                                          ...prev,
                                          [l.id]: nextSum
                                        }));
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          focusNextDeliveryInput(e.currentTarget);
                                        }
                                      }}
                                      placeholder="0"
                                      className={`w-full p-1 text-center font-mono font-bold text-[11px] bg-[#061520] border rounded ${cf.borderCls} ${cf.textCls} focus:outline-none focus:ring-1`}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-center text-[11px] text-slate-500 italic">
                              Direct quantity entry
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center font-mono font-bold text-slate-200 align-middle whitespace-nowrap">
                          {approved}
                        </td>
                        <td className="py-2 px-2 text-center font-mono font-bold text-emerald-400 align-middle">
                          {prevDelivered}
                        </td>
                        <td className="py-2 px-2 text-center font-mono font-bold text-amber-300 align-middle">
                          {rest}
                        </td>
                        <td className="py-2 px-3 text-right align-middle">
                          {needsColorInput && colorSum > 0 ? (
                            <div className="flex flex-col items-end">
                              <input
                                type="number"
                                readOnly
                                value={colorSum}
                                title="Auto-calculated total from colour boxes"
                                className={`w-20 p-1.5 text-right font-mono font-black text-xs bg-[#061520] border rounded-lg focus:outline-none ${
                                  isOverRest
                                    ? 'border-rose-500 text-rose-400'
                                    : 'border-emerald-500/70 text-emerald-300'
                                }`}
                              />
                              <span className="text-[9px] text-slate-400 mt-0.5">{l.unit || 'Coils'}</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-end">
                              <input
                                type="number"
                                min="0"
                                max={rest}
                                data-delivery-focus={needsColorInput ? undefined : 'true'}
                                value={deliveringNow === 0 ? '' : deliveringNow}
                                onChange={(e) => {
                                  const val = Math.max(0, Math.min(rest, parseInt(e.target.value, 10) || 0));
                                  setDeliveryError('');
                                  setDeliveryInputs((prev) => ({ ...prev, [l.id]: val }));
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    focusNextDeliveryInput(e.currentTarget);
                                  }
                                }}
                                placeholder="0"
                                className={`w-20 p-1.5 text-right font-mono font-bold text-xs bg-[#061520] border rounded-lg focus:outline-none focus:ring-1 ${
                                  isOverRest
                                    ? 'border-rose-500 text-rose-400 focus:ring-rose-400'
                                    : 'border-emerald-500/60 text-emerald-300 focus:ring-emerald-400'
                                }`}
                              />
                              <span className="text-[9px] text-slate-400 mt-0.5">{l.unit || 'Coils'}</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Quick Helper Buttons & Totals */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-cyan-500/20 text-xs">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    const allRest: Record<string, number> = {};
                    const allColors: Record<string, { red?: number; black?: number; yellow?: number; green?: number; blue?: number; others?: number }> = {};
                    (deliveryModalReq.lines || []).forEach((l) => {
                      const approved = Number(l.approvedQty || l.requestedQty || 0);
                      const delivered = Number(l.deliveredQty || 0);
                      const restQty = Math.max(0, approved - delivered);
                      const col = extractReqLineColors(l);
                      const prevDelCol = (l as any).deliveredColors || {};
                      const remCols = {
                        red: Math.max(0, (col.red || 0) - (Number(prevDelCol.red) || 0)),
                        black: Math.max(0, (col.black || 0) - (Number(prevDelCol.black ?? prevDelCol.blk) || 0)),
                        yellow: Math.max(0, (col.yellow || 0) - (Number(prevDelCol.yellow ?? prevDelCol.yel) || 0)),
                        green: Math.max(0, (col.green || 0) - (Number(prevDelCol.green ?? prevDelCol.grn) || 0)),
                        blue: Math.max(0, (col.blue || 0) - (Number(prevDelCol.blue ?? prevDelCol.blu) || 0)),
                        others: Math.max(0, (col.others || 0) - (Number(prevDelCol.others) || 0))
                      };
                      allColors[l.id] = remCols;
                      const colSum = remCols.red + remCols.black + remCols.yellow + remCols.green + remCols.blue + remCols.others;
                      allRest[l.id] = colSum > 0 ? Math.min(restQty, colSum) : restQty;
                    });
                    setDeliveryInputs(allRest);
                    setDeliveryColorInputs(allColors);
                  }}
                  className="px-2.5 py-1 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 border border-cyan-500/25 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Deliver All Rest
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const zeroInputs: Record<string, number> = {};
                    const zeroColors: Record<string, { red?: number; black?: number; yellow?: number; green?: number; blue?: number; others?: number }> = {};
                    (deliveryModalReq.lines || []).forEach((l) => {
                      zeroInputs[l.id] = 0;
                      zeroColors[l.id] = { red: 0, black: 0, yellow: 0, green: 0, blue: 0, others: 0 };
                    });
                    setDeliveryInputs(zeroInputs);
                    setDeliveryColorInputs(zeroColors);
                  }}
                  className="px-2.5 py-1 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-300 border border-cyan-500/25 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Clear All
                </button>
              </div>

              {/* Total Delivering Now */}
              <div className="text-right">
                <span className="text-slate-400 font-semibold mr-2">Delivering Now (Total):</span>
                <span className="font-mono font-black text-emerald-400 text-sm">
                  {Object.values(deliveryInputs).reduce((s, v) => s + (Number(v) || 0), 0)} Coils
                </span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end space-x-2.5 pt-3 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setDeliveryModalReq(null)}
                className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              {(() => {
                const idx = deliveryModalReq.deliveryHistory?.length || 0;
                const nextBill = getDeliveryBillNo(deliveryModalReq, idx);
                return (
                  <button
                    ref={deliveryConfirmBtnRef}
                    type="button"
                    onClick={handleConfirmDelivery}
                    className="px-5 py-2.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs rounded-xl shadow-lg transition-all flex items-center space-x-2 cursor-pointer active:scale-95 focus:ring-2 focus:ring-cyan-300"
                  >
                    <Truck className="w-4 h-4" />
                    <span>Confirm Delivery &amp; Create Challan #{deliveryChallanNo || `CH-${nextBill}`}</span>
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Delivery Challan View, Download & Reprint Modal (Factory -> Delivered) */}
      {previewDeliveryChallan && (
        <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl border border-cyan-400/35 rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-[0_24px_64px_rgba(0,0,0,0.65)] text-white my-auto">
            <div className="flex items-center justify-between border-b border-cyan-500/25 pb-3 no-print">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-black text-white">
                  Delivery Challan #{previewDeliveryChallan.challanNo}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreviewDeliveryChallan(null);
                  setPreviewReqForChallan(null);
                }}
                className="text-cyan-300/70 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {previewReqForChallan?.deliveryHistory && previewReqForChallan.deliveryHistory.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5 bg-[#061520] p-2 rounded-xl border border-cyan-500/25 text-xs no-print">
                <span className="text-cyan-200/80 font-bold mr-1">Challan Batches:</span>
                {previewReqForChallan.deliveryHistory.map((d, dIdx) => {
                  const chObj = buildChallanFromDelivery(previewReqForChallan, d, dIdx);
                  const isActive = chObj.challanNo === previewDeliveryChallan.challanNo;
                  return (
                    <button
                      key={dIdx}
                      type="button"
                      onClick={() => setPreviewDeliveryChallan(chObj)}
                      className={`px-2.5 py-1 rounded-lg font-mono font-bold cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-cyan-400 text-slate-950 font-black'
                          : 'bg-[#081b28] hover:bg-[#0e2a3d] text-slate-300 border border-cyan-500/20'
                      }`}
                    >
                      #{chObj.challanNo} ({d.deliveredCoils} Coils)
                    </button>
                  );
                })}
              </div>
            )}

            {/* Printable Challan Sheet */}
            <div id="factory-delivery-challan-print" className="bg-white text-slate-950 p-6 rounded-xl space-y-4 text-xs shadow-inner">
              <div className="text-center border-b-2 border-slate-800 pb-3">
                <div className="flex justify-center mb-1">
                  <PolyCablesLogo size="lg" showSubtitle={true} subtitleText="IND. LTD." />
                </div>
                {company?.address && (
                  <p className="text-[11px] text-slate-600">{company.address}</p>
                )}
                <div className="inline-block mt-1.5 px-4 py-0.5 rounded bg-slate-950 text-white font-black text-xs uppercase tracking-widest">
                  DELIVERY CHALLAN
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div className="space-y-1">
                  <div><strong>Party / Destination:</strong> {previewDeliveryChallan.partyName}</div>
                  <div><strong>Address:</strong> {previewDeliveryChallan.address || previewDeliveryChallan.branchName || '-'}</div>
                  <div><strong>Sales Center:</strong> {previewDeliveryChallan.branchName || '-'}</div>
                  <div><strong>Marketing Officer:</strong> {previewDeliveryChallan.salespersonName || '-'}</div>
                </div>
                <div className="space-y-1 text-right">
                  <div><strong>Challan No:</strong> <span className="font-mono font-bold">{previewDeliveryChallan.challanNo}</span></div>
                  <div><strong>Date:</strong> <span className="font-mono">{formatDateDDMMYY(previewDeliveryChallan.date)}</span></div>
                  <div><strong>Req / Order #:</strong> <span className="font-mono">{previewDeliveryChallan.orderNumber || previewDeliveryChallan.refNo || '-'}</span></div>
                  {previewDeliveryChallan.vehicleNo && (
                    <div><strong>Vehicle No:</strong> {previewDeliveryChallan.vehicleNo}</div>
                  )}
                </div>
              </div>

              <table className="w-full border border-slate-400 border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-900 font-bold border-b border-slate-400">
                    <th className="p-2 border-r border-slate-300 text-center w-10">SL</th>
                    <th className="p-2 border-r border-slate-300 text-left">Item Description</th>
                    <th className="p-2 border-r border-slate-300 text-right w-20">Quantity</th>
                    <th className="p-2 border-r border-slate-300 text-center w-16">Unit</th>
                    <th className="p-2 text-center">Colour</th>
                  </tr>
                </thead>
                <tbody>
                  {(previewDeliveryChallan.lines || []).map((line, i) => {
                    const cText = formatChallanColorsText((line as any).colors);
                    return (
                      <tr key={line.id || i} className="border-b border-slate-300">
                        <td className="p-2 border-r border-slate-300 text-center font-mono">{i + 1}</td>
                        <td className="p-2 border-r border-slate-300 font-semibold">{line.itemDescription}</td>
                        <td className="p-2 border-r border-slate-300 text-right font-mono font-black">{line.coilQty}</td>
                        <td className="p-2 border-r border-slate-300 text-center">{line.unit || 'Coils'}</td>
                        <td className="p-2 text-center font-mono text-[11px]">
                          {cText !== '-' ? cText : (line.sizeSpec || '-')}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-100 font-black">
                    <td colSpan={2} className="p-2 border-r border-slate-300 text-right">
                      Total Delivered Quantity:
                    </td>
                    <td className="p-2 border-r border-slate-300 text-right font-mono">
                      {(previewDeliveryChallan.lines || []).reduce((s, l) => s + (Number(l.coilQty) || 0), 0) || previewDeliveryChallan.totalQuantity}
                    </td>
                    <td className="p-2 border-r border-slate-300 text-center">Coils</td>
                    <td className="p-2"></td>
                  </tr>
                </tbody>
              </table>

              {previewDeliveryChallan.remarks && (
                <div className="text-[11px] bg-slate-50 p-2 rounded border border-slate-200">
                  <strong>Remarks:</strong> {previewDeliveryChallan.remarks}
                </div>
              )}

              <div style={{ height: '7.5rem' }} aria-hidden="true" />
              <div className="grid grid-cols-3 gap-6 text-center text-[11px] font-bold">
                <div className="border-t border-slate-600 pt-1">Prepared By</div>
                <div className="border-t border-slate-600 pt-1">Factory Store In-Charge</div>
                <div className="border-t border-slate-600 pt-1">Received By</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 no-print">
              <button
                type="button"
                onClick={() => {
                  setPreviewDeliveryChallan(null);
                  setPreviewReqForChallan(null);
                }}
                className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 rounded-xl text-xs font-bold cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handleDownloadDeliveryChallanPdf(previewDeliveryChallan)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center space-x-1.5 cursor-pointer shadow-md"
              >
                <Download className="w-4 h-4" />
                <span>Download Challan (PDF)</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-xl text-xs font-black flex items-center space-x-1.5 cursor-pointer shadow-md"
              >
                <Printer className="w-4 h-4" />
                <span>Print / Reprint Challan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paste from Excel Input Modal (iFrame-safe replacement for window.prompt) */}
      {showExcelPasteInputModal && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-lg w-full border border-cyan-400/35 text-white overflow-hidden">
            <div className="cyber-glass-header text-white px-4 py-3 flex items-center justify-between border-b border-cyan-500/25">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold text-sm">Paste Item Names from Excel</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowExcelPasteInputModal(false)}
                className="text-cyan-300/70 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-slate-300">
                Copy item names (or Item Name + Qty rows) directly from Excel and paste below. Every item row will be added automatically, and any missing/price issue will be reported with instructions to fix it.
              </p>
              <textarea
                rows={7}
                autoFocus
                value={excelPasteInputText}
                onChange={(e) => setExcelPasteInputText(e.target.value)}
                placeholder={'1X1.5 RM\t10\n1X2.5 RM\t5\n2X1.0 Flexible Wire\t8'}
                className="w-full p-3 border border-cyan-500/30 rounded-xl font-mono text-xs bg-[#061520] text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              />
            </div>
            <div className="px-4 py-3 bg-[#061520]/80 border-t border-cyan-500/20 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowExcelPasteInputModal(false)}
                className="px-3.5 py-1.5 rounded-xl border border-cyan-500/25 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const firstEmpty = lines.find((l) => !l.description.trim() && !(Number(l.quantity) > 0));
                  const targetId = firstEmpty?.id || 'new';
                  setShowExcelPasteInputModal(false);
                  handlePasteItemsFromExcel(targetId, excelPasteInputText);
                }}
                className="px-4 py-1.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-black cursor-pointer"
              >
                Add All Items
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel Item Paste Problem Diagnostic & Resolution Modal */}
      {showExcelProblemModal && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-lg w-full border border-amber-400/40 text-white overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-amber-500/15 border-b border-amber-400/30 text-white p-4 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-400/20 border border-amber-400/40 rounded-xl">
                  <AlertTriangle className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-white">Excel Item Import Diagnostics</h3>
                  <p className="text-[11px] text-amber-200">
                    {excelPasteSuccessCount} item(s) processed. {excelPasteProblems.length} issue(s) detected:
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExcelProblemModal(false)}
                className="text-amber-200/70 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
              <div className="text-xs text-slate-300 font-medium">
                We took all your items from Excel into the requisition. Review the issues below and how to fix them:
              </div>

              <div className="space-y-2.5">
                {excelPasteProblems.map((prob, pIdx) => (
                  <div key={pIdx} className="bg-[#061520] border border-amber-400/30 rounded-xl p-3 text-xs space-y-1.5">
                    <div className="font-bold text-amber-300 flex items-center space-x-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>
                      <span>{prob.item}</span>
                    </div>
                    <div className="text-rose-300 font-semibold pl-3.5">
                      <strong>Problem:</strong> {prob.problem}
                    </div>
                    <div className="text-emerald-300 font-medium pl-3.5 bg-emerald-500/10 p-1.5 rounded border border-emerald-400/25">
                      <strong>How to Fix:</strong> {prob.fix}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 bg-[#061520]/80 border-t border-cyan-500/20 flex justify-end">
              <button
                type="button"
                onClick={() => setShowExcelProblemModal(false)}
                className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs rounded-xl shadow cursor-pointer transition-transform active:scale-95"
              >
                Got It / Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Specific CSS */}
      <style>{`
        @page {
          size: A4 landscape;
          margin: 5mm;
        }
        @media print {
          html, body {
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          body * {
            visibility: hidden !important;
          }
          .no-print, .no-print *, nav, aside, header:not(.printable-header) {
            display: none !important;
            visibility: hidden !important;
          }
          .fixed.inset-0, [class*="backdrop-blur"] {
            position: static !important;
            inset: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
            backdrop-filter: none !important;
          }
          #requisition-print-slip,
          #requisition-print-slip *,
          #requisition-modal-print-slip,
          #requisition-modal-print-slip *,
          #factory-delivery-challan-print,
          #factory-delivery-challan-print * {
            visibility: visible !important;
          }
          #requisition-print-slip,
          #requisition-modal-print-slip {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 142mm !important;
            max-width: 50% !important;
            max-height: none !important;
            padding: 6mm !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: 1px solid #000000 !important;
            background: white !important;
            color: black !important;
            font-size: 11px !important;
            transform: none !important;
          }
          #factory-delivery-challan-print {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            max-height: none !important;
            padding: 8mm !important;
            margin: 0 auto !important;
            box-shadow: none !important;
            border: none !important;
            background: white !important;
            color: black !important;
            font-size: 11px !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
};
