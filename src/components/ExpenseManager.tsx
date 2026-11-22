import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { ExpenseEntry, CollectionMR, BankDeposit, Salesperson, CompanyDetails, StoredBill, Party, BranchLocation, AuthUser, ConveyanceEntry } from '../types';
import { Plus, Trash2, Edit2, Edit3, Search, Calendar, FileText, Printer, Download, UserCheck, Building2, Wallet, DollarSign, Filter, Tag, Check, Sparkles, RefreshCw, CreditCard, Landmark, ArrowRight, ArrowDownLeft, ShieldCheck, ArrowLeft, X, Upload, Image as ImageIcon, ChevronDown, ChevronUp, ArrowUpDown, MapPin, User, Mail, Send, Copy, CheckCircle2, ListOrdered, Banknote, FileCheck, Users, FileSpreadsheet, Settings, AlertTriangle, FlaskConical, ExternalLink, Key, Eye, EyeOff, AlertCircle, Lock, RotateCcw, Clock, Save, BookOpen, HelpCircle, Zap, Receipt, History, Car } from 'lucide-react';
import { formatDateDDMMYY, parseDateToISO, getTodayDDMMYY } from '../utils/dateUtils';
import { checkCollectionDuplicate, CollectionDuplicateResult } from '../utils/duplicateChecker';
import { triggerAutoConfiguredPrint } from '../utils/printerAutoConfig';
import { moveToTrash, moveMultipleToTrash } from '../utils/trashHelper';
import {
  isSuperAdminOrAgm,
  isStrictSuperAdmin,
  isAnyAdmin,
  isAccountsAdmin,
  isInCharge,
  isAccountsOrStaff,
  hasUserTarget,
  isMarketingOfficer,
  filterBranchesForUser,
  filterSalespersonsByBranch,
  getUserBranch,
  cleanBranchName,
  getUserLoginFilters,
  isFactoryUser,
  isUnwantedSalesCenter,
  getBranchAddressDetails
} from '../utils/branchAccess';
import { convertToTakaWords } from '../utils/numberToWords';
import { resolvePartyAndMarketing } from '../utils/partyAndMarketingResolver';
import { isInvalidPartyName } from '../utils/partyDeduplication';
import { ExpenseProcedureModal } from './ExpenseProcedureModal';
import { ExpenseAmountTab } from './ExpenseAmountTab';
import { DateInputWithPicker } from './DateInputWithPicker';
import { SalesCenterSearchFilter, SalesCenterOption } from './SalesCenterSearchFilter';
import { PolyCablesLogo } from './PolyCablesLogo';
import { checkCanTakeEntry } from '../utils/cloudConnection';
import { recordDeletedEntityId, recordDeletedEntityIds, getGlobalDeletedIds, isGloballyDeletedId, getClientSyncId } from '../utils/deletedTracker';
import {
  computeNextSalesCenterMrNo,
  resolveEntityToSalesCenter,
  isSameSalesCenterForDepositMatch,
  matchesMrTokenExact
} from '../utils/mrNumberHelper';

export function safeResolvePartyAndMarketing(
  record: any,
  parties: Party[] = [],
  salespersons: Salesperson[] = [],
  collections: CollectionMR[] = []
) {
  try {
    if (typeof resolvePartyAndMarketing === 'function') {
      return resolvePartyAndMarketing(record, parties, salespersons, collections);
    }
  } catch (e) {}
  const rawParty = (record?.partyName || record?.customerName || record?.accountTitle || record?.name || '').trim();
  const matched = (parties || []).find((p) => p.name?.trim().toLowerCase() === rawParty.toLowerCase());
  return {
    partyName: matched?.name || rawParty,
    partyAddress: matched?.address || record?.customerAddress || record?.address || 'Madhupur',
    marketingPerson: matched?.salespersonName || record?.marketingPerson || record?.salesperson || '-',
    salesmanCode: matched?.salesmanCode || record?.salesmanCode || '',
    salesCenter: matched?.branchName || record?.branchName || '',
    phone: matched?.phone || record?.phone || ''
  };
}

export function cleanSalesCenterName(raw?: string): string {
  return cleanBranchName(raw);
}

export function normalizeSalesCenter(raw?: string | null): string {
  if (!raw) return 'Madhupur Sales Center';
  const clean = cleanBranchName(raw).trim();
  const lower = clean.toLowerCase();
  if (lower.includes('tangail')) return 'Tangail Sales Center';
  if (lower.includes('madhupur')) return 'Madhupur Sales Center';
  return clean;
}

/**
 * Checks if a given transaction date belongs to a month that has already ended.
 * At month end, remaining cash is deposited to Head Office (H/O) on the 1st of the next month,
 * so it should not continue appearing in the pending cash-in-hand list in subsequent months.
 */
export function isMonthEnded(dateStr?: string, referenceDate: Date = new Date()): boolean {
  if (!dateStr) return false;
  const iso = parseDateToISO(dateStr);
  if (!iso) return false;
  const parts = iso.split('-');
  if (parts.length < 2) return false;
  const colYear = parseInt(parts[0], 10);
  const colMonth = parseInt(parts[1], 10); // 1-12
  if (!colYear || !colMonth) return false;

  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth() + 1; // 1-12

  if (colYear < refYear) return true;
  if (colYear === refYear && colMonth < refMonth) return true;
  return false;
}

export function isCashAutoDepositedToHO(col?: CollectionMR | null): boolean {
  return false;
}

export function isExcelDateValue(val: any): boolean {
  if (!val && val !== 0) return false;
  if (val instanceof Date) return true;
  const str = String(val).trim();
  if (!str) return false;
  // Match standard date string formats like 01.07.26, 01/07/2026, 2026-07-01, 1-7-26
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(str)) return true;
  if (/^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/.test(str)) return true;
  return false;
}

export function parseExcelAmount(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') {
    if (isNaN(val) || !isFinite(val)) return 0;
    return Math.abs(val);
  }
  const str = String(val).trim();
  if (!str) return 0;
  // If the cell value is a date representation (like "01.07.26"), reject it as money amount!
  if (isExcelDateValue(str)) return 0;

  // Clean currency symbols, commas, spaces, trailing '/-', etc.
  const cleanStr = str
    .replace(/৳|Tk\.?|Tk|BDT|bdt|tk|taka|টাকা|\/-|\/-/gi, '')
    .replace(/,/g, '')
    .replace(/[()]/g, '')
    .trim();

  if (!cleanStr) return 0;
  // If after cleaning it still contains multiple dots/slashes/dashes like "01.07.26", it's a date not a float
  if (/^\d+[./-]\d+[./-]\d+/.test(cleanStr)) return 0;

  const num = parseFloat(cleanStr);
  if (isNaN(num) || !isFinite(num)) return 0;
  return Math.abs(num);
}

export function parseExcelDateToISO(rawVal: any): string {
  if (!rawVal) return new Date().toISOString().split('T')[0];
  if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
    const y = rawVal.getFullYear();
    const m = String(rawVal.getMonth() + 1).padStart(2, '0');
    const d = String(rawVal.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(rawVal).trim();
  if (!str) return new Date().toISOString().split('T')[0];

  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.substring(0, 10);
  }

  const parts = str.split(/[.\/-]/);
  if (parts.length === 3) {
    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);

    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    } else {
      if (year < 100) year += 2000;
    }

    if (!isNaN(day) && !isNaN(month) && !isNaN(year) && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const yStr = String(year);
      const mStr = String(month).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      return `${yStr}-${mStr}-${dStr}`;
    }
  }

  const num = Number(str);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    const jsDate = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(jsDate.getTime())) {
      const y = jsDate.getFullYear();
      const m = String(jsDate.getMonth() + 1).padStart(2, '0');
      const d = String(jsDate.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return new Date().toISOString().split('T')[0];
}

import {
  BankAndAccountDirectory,
  BankLogoBadge,
  getBankShortCode,
  getAccountShortCode,
  generateDisplayTag,
  getBankAndAccountShortTag,
  resolveFullBankName,
  resolveFullAccountName,
  resolveAccountNameFromTag,
  isInvalidBankOrAccount
} from './BankAndAccountDirectory';
import { defaultBanks, defaultAccounts } from '../data/defaultData';

export const DEFAULT_BANKS = defaultBanks;
export const DEFAULT_ACCOUNTS = defaultAccounts;
export {
  getBankShortCode,
  getAccountShortCode,
  generateDisplayTag,
  getBankAndAccountShortTag,
  resolveFullBankName,
  resolveFullAccountName,
  resolveAccountNameFromTag,
  isInvalidBankOrAccount
};

export function formatAmountWithCommas(amt: number): string {
  if (isNaN(amt) || amt === null || amt === undefined) return '0';
  return amt.toLocaleString('en-IN');
}

export function formatBankTagForSubject(deposit: BankDeposit): string {
  if (deposit.bankShortCode && deposit.accountShortCode) {
    return `${deposit.bankShortCode}(${deposit.accountShortCode})`;
  }
  if (deposit.displayTag) {
    const clean = deposit.displayTag.replace(/\s+\(/g, '(').trim();
    if (clean.includes('(')) return clean;
  }
  const bShort = getBankShortCode(deposit.bankName || 'Pubali Bank PLC');
  const aShort = getAccountShortCode(deposit.accountName || 'Padma Enterprise');
  if (bShort && aShort) {
    return `${bShort}(${aShort})`;
  }
  return bShort || deposit.bankName || 'BANK';
}

/**
 * Resolves and formats the date for a bank deposit entry.
 * Guarantees date is always shown on the Deposit History page.
 */
export function resolveDepositDate(dep: any, collections?: CollectionMR[]): string {
  if (!dep) return '';
  const rawDate = dep.depositDate || dep.date || dep.createdDate || dep.voucherDate || dep.passDate || dep.savedAt || dep.updatedAt;
  if (rawDate) {
    const formatted = formatDateDDMMYY(rawDate);
    if (formatted) return formatted;
    if (typeof rawDate === 'string' && rawDate.trim()) return rawDate.trim().slice(0, 10);
  }
  // If collectionMrId is linked, attempt to lookup collection date
  if (dep.collectionMrId && collections && collections.length > 0) {
    const col = collections.find((c) => c.id === dep.collectionMrId);
    if (col?.depositDate || col?.date) {
      const formatted = formatDateDDMMYY(col.depositDate || col.date);
      if (formatted) return formatted;
    }
  }
  return '';
}

export function generateDepositEmailSubject(
  deposit: BankDeposit,
  isTest: boolean = false,
  batchDeposits?: BankDeposit[]
): string {
  const isMulti = Boolean(batchDeposits && batchDeposits.length > 1);
  const effectiveDeposits = isMulti && batchDeposits ? batchDeposits : [deposit];
  const dateFormatted = formatDateShort(deposit.date || deposit.depositDate);
  const prefix = isTest ? '[TEST DEPOSIT NOTIFICATION] ' : '';
  const bankTag = formatBankTagForSubject(deposit);
  const mktPerson =
    deposit.marketingPerson ||
    deposit.entityName ||
    effectiveDeposits.find((d) => d.marketingPerson)?.marketingPerson ||
    'Sanjoy Chowhan';

  if (isMulti) {
    const totalAmount = effectiveDeposits.reduce((sum, d) => sum + (d.amount || 0), 0);
    const amountFormatted = formatAmountWithCommas(totalAmount) + '/-';
    // User requested format: 02.07.26-PBL(P.E)- 20,000/- (Marketing Person)
    return `${prefix}${dateFormatted}-${bankTag}- ${amountFormatted} (${mktPerson})`;
  } else {
    // Single party format: 02.07.26-Party, Address- 20,000/- (Marketing Person)
    const rawCustomer = (deposit.partyName || deposit.customerName || '').trim();
    const customer = rawCustomer && rawCustomer.toLowerCase() !== 'customer' && rawCustomer.toLowerCase() !== 'general customer'
      ? rawCustomer
      : (deposit.entityName || 'Partho Electric');
    const address = deposit.customerAddress || 'Madhupur';
    const amountFormatted = formatAmountWithCommas(deposit.amount) + '/-';
    return `${prefix}${dateFormatted}-${customer}, ${address}- ${amountFormatted} (${mktPerson})`;
  }
}

export function generateDepositEmailBody(
  deposit: BankDeposit,
  isTest: boolean = false,
  toList?: string[],
  ccList?: string[],
  batchDeposits?: BankDeposit[],
  parties?: Party[]
): string {
  const depositEmbeddedCollections = Array.isArray((deposit as any).collections) && (deposit as any).collections.length > 1
    ? ((deposit as any).collections as any[])
    : null;
  const isBatchMulti = Boolean(batchDeposits && batchDeposits.length > 1);
  const isMulti = isBatchMulti || Boolean(depositEmbeddedCollections);
  const effectiveDeposits = isBatchMulti && batchDeposits ? batchDeposits : [deposit];
  const mktPerson =
    deposit.marketingPerson ||
    deposit.entityName ||
    effectiveDeposits.find((d) => d.marketingPerson)?.marketingPerson ||
    'Sanjoy Chowhan';
  const dateFormatted = formatDateShort(deposit.date || deposit.depositDate);
  const totalAmount = isBatchMulti
    ? effectiveDeposits.reduce((sum, d) => sum + (Number(d.amount) || 0), 0)
    : depositEmbeddedCollections
      ? depositEmbeddedCollections.reduce((sum, c) => sum + (Number(c.amount) || 0), 0) || (Number(deposit.amount) || 0)
      : (Number(deposit.amount) || 0);
  const amountFormatted = formatAmountWithCommas(totalAmount) + '/-';
  const slipStatus =
    deposit.slipImage || effectiveDeposits.some((d) => d.slipImage)
      ? 'Attached Deposit Slip Photo Uploaded'
      : 'No Deposit Slip Attached';

  const testHeader = isTest
    ? `==================================================\n*** SYSTEM TEST EMAIL NOTIFICATION ***\nThis is a verified test email to check mail routing.\n==================================================\n\n`
    : '';

  const toFormatted = toList && toList.length > 0 ? toList.join(', ') : 'pcildomestic@gmail.com';
  const ccFormatted = ccList && ccList.length > 0 ? ccList.join(', ') : '290suvro.pcil@gmail.com';

  // Helper to resolve party-wise sales center name
  const getPartySalesCenter = (partyNameStr?: string, depositBranch?: string): string => {
    if (depositBranch && depositBranch !== 'All Sales Centers' && depositBranch !== 'all') {
      return depositBranch;
    }
    const cleanP = (partyNameStr || '').trim().toLowerCase();
    if (cleanP && parties && parties.length > 0) {
      const match = parties.find((p) => (p.name || '').trim().toLowerCase() === cleanP);
      if (match?.branchName) return match.branchName;
    }
    return deposit.branchName || 'Madhupur Sales Center';
  };

  // Helper to resolve party name, address, and amount for multiparty breakdown
  const resolvePartyBreakdownItem = (entry: any): { name: string; address: string; amount: number } => {
    const rawName = String(entry.partyName || entry.customerName || '').trim();
    const partyName =
      rawName && rawName.toLowerCase() !== 'customer' && rawName.toLowerCase() !== 'general customer'
        ? rawName
        : String(entry.entityName || deposit.partyName || deposit.customerName || 'Party').trim();

    const directAddress = String(entry.customerAddress || entry.partyAddress || entry.address || '').trim();
    const cleanP = partyName.toLowerCase();
    const matchedParty =
      cleanP && parties && parties.length > 0
        ? parties.find((p) => (p.name || '').trim().toLowerCase() === cleanP)
        : undefined;

    const resolvedAddress =
      (directAddress && directAddress.toLowerCase() !== 'madhupur' ? directAddress : '') ||
      (matchedParty?.address ? matchedParty.address.trim() : '') ||
      directAddress ||
      'N/A';

    return {
      name: partyName,
      address: resolvedAddress,
      amount: Number(entry.amount) || 0
    };
  };

  const partyBreakdownItems = isMulti
    ? (isBatchMulti ? effectiveDeposits : depositEmbeddedCollections || []).map(resolvePartyBreakdownItem)
    : [];

  const multiPartySection =
    isMulti && partyBreakdownItems.length > 0
      ? `\nParty-Wise Collection Details:\n--------------------------------------------------\n${partyBreakdownItems
          .map(
            (item, idx) =>
              `${idx + 1}. ${item.name} — Address: ${item.address} — Amount: ${formatAmountWithCommas(item.amount)}/-`
          )
          .join('\n')}\n`
      : '';

  const primaryPartyName = (deposit.partyName || deposit.customerName || '').trim();
  const primarySalesCenter = getPartySalesCenter(primaryPartyName, deposit.branchName);
  const bankTag = formatBankTagForSubject(deposit);

  return `${testHeader}Marketing person: ${mktPerson}

Bank Deposit Summary Details:
--------------------------------------------------
Date: ${dateFormatted}
Destination / Sales Center: ${primarySalesCenter}
Bank Account: ${deposit.bankName} (${deposit.accountName}) [${deposit.displayTag || bankTag}]
${isMulti ? `Total Deposit Amount: ${amountFormatted} (${partyBreakdownItems.length} Parties)` : `Deposit Amount: ${amountFormatted}`}
Deposit Slip: ${slipStatus}
Remarks / Ref: ${deposit.remarks || effectiveDeposits.find((d) => d.remarks)?.remarks || 'N/A'}
${multiPartySection}
Sender: madhupursc2026@gmail.com
Main Recipient (To): ${toFormatted}
CC Recipient (Deposit Slip Mail): ${ccFormatted}`;
}

interface ExpenseManagerProps {
  expenses: ExpenseEntry[];
  setExpenses: React.Dispatch<React.SetStateAction<ExpenseEntry[]>>;
  collections: CollectionMR[];
  setCollections: React.Dispatch<React.SetStateAction<CollectionMR[]>>;
  bankDeposits?: BankDeposit[];
  setBankDeposits?: React.Dispatch<React.SetStateAction<BankDeposit[]>>;
  onDeleteBankDeposit?: (id: string) => void;
  bankList?: string[];
  setBankList?: React.Dispatch<React.SetStateAction<string[]>>;
  onAddBank?: (name: string) => void;
  onDeleteBank?: (name: string) => void;
  onEditBank?: (oldName: string, newName: string) => void;
  onEditBankShortCode?: (bankName: string, shortCode: string) => void;
  onResetBanks?: () => void;
  accountList?: string[];
  setAccountList?: React.Dispatch<React.SetStateAction<string[]>>;
  onAddAccount?: (name: string) => void;
  onDeleteAccount?: (name: string) => void;
  onEditAccount?: (oldName: string, newName: string) => void;
  onEditAccountShortCode?: (accountName: string, shortCode: string) => void;
  onResetAccounts?: () => void;
  salespersons: Salesperson[];
  allSalespersons?: Salesperson[];
  parties?: Party[];
  setParties?: React.Dispatch<React.SetStateAction<Party[]>>;
  storedBills?: StoredBill[];
  company?: CompanyDetails;
  currentUser?: AuthUser | null;
  branches?: BranchLocation[];
  allBranches?: BranchLocation[];
  conveyances?: ConveyanceEntry[];
  setConveyances?: React.Dispatch<React.SetStateAction<ConveyanceEntry[]>>;
  initialMode?: 'entry' | 'directory' | 'expense_amount' | 'report' | 'collection_entry' | 'collection_list' | 'cash_in_hand' | 'cheque_in_hand' | 'deposit_history' | 'trash' | 'conveyance';
  onSyncCloud?: (dataSlice: Record<string, any>, immediate?: boolean) => void;
  onBack?: () => void;
  onClose?: () => void;
}

function computeNextMrNo(
  collectionsList: CollectionMR[],
  targetSalesCenter?: string | null,
  branches: BranchLocation[] = [],
  parties: Party[] = [],
  salespersons: Salesperson[] = []
): string {
  return computeNextSalesCenterMrNo(
    collectionsList,
    targetSalesCenter,
    branches,
    parties,
    salespersons
  );
}

function formatDateShort(dateStr: string): string {
  if (!dateStr) return '';
  return formatDateDDMMYY(dateStr);
}

export interface PartyCollectionEntryRow {
  id: string;
  partyName: string;
  amount: string;
  remarks: string;
  paymentType?: 'cash' | 'cheque';
  bankName?: string;
  chequeNo?: string;
  passDate?: string;
}

export interface ExpenseCategoryItem {
  id?: string;
  serial: number;
  name: string;
  standardAmount?: number;
}

export const DEFAULT_EXPENSE_HEADS = [
  'Advertisement',
  'Bank Charge',
  'Conveyance',
  'Day Allowance/ Lunch Bill',
  'Decoration & Reparing',
  'Trade licence Fee',
  'Donation',
  'Donation For Picnic',
  'Labour & Emp. License Fee',
  'Tangail Traders Programme',
  'Electricty Bill',
  'Prize Money (1st, 2nd, 3rd, 4th, 5th)',
  'Fuel For Car',
  'Internet Bill (June & July)',
  'Miscellaneous Exp.',
  'Mobile Set Purchase',
  'Sign Board Bill',
  'Office Stationery',
  'Party Entertainment',
  'Photocopy, Mail & Flexiload Bill',
  'Picnic Donation',
  'Postage & Courier',
  'Office Exp.',
  'Over time bill',
  'Sales Center Rent (May & June)',
  'Scratch Card',
  'Staff Rerreshment',
  'Transport Bill',
  'Vat',
  'Vehicle Repairs',
  'Wages & Labour'
];

interface SearchableComboboxProps {
  options: string[];
  value: string;
  onChange: (val: string) => void;
  getShortCode?: (val: string) => string;
  placeholder?: string;
  label?: string;
  required?: boolean;
  accentColor?: 'purple' | 'indigo' | 'amber' | 'emerald';
  entityLabel?: string; // 'Bank' or 'Account'
  onAddNew?: (newName: string) => void;
  onDeleteItem?: (itemToDelete: string) => void;
  onEditItem?: (oldItem: string, newItem: string) => void;
  onOpenManager?: () => void;
  onAdvance?: () => void;
  inputRef?: React.RefObject<HTMLInputElement>;
  hideInputBadge?: boolean;
}

function matchesBankOrAccount(
  opt: any,
  query: any,
  getShortCode?: (name: string) => string
): boolean {
  const optStr = (typeof opt === 'string' ? opt : (opt?.name || opt?.bankName || opt?.accountName || String(opt ?? ''))).trim();
  const queryStr = (typeof query === 'string' ? query : String(query ?? '')).trim();
  if (!queryStr) return true;
  const q = queryStr.toLowerCase();
  const optLower = optStr.toLowerCase();
  if (!optLower) return false;

  // 1. Direct substring match
  if (optLower.includes(q)) return true;

  // 2. Alphanumeric clean match (e.g. "p.e." -> "pe", "dutch-bangla" -> "dutchbangla")
  const qClean = q.replace(/[^a-z0-9]/g, '');
  const optClean = optLower.replace(/[^a-z0-9]/g, '');
  if (qClean && optClean.includes(qClean)) return true;

  // 3. Short code match (e.g. "DBBL", "PBL", "IBBL", "P.E", "Z.E", "S.C", etc.)
  const shortCode = getShortCode ? getShortCode(optStr) : '';
  if (shortCode) {
    const scLower = shortCode.toLowerCase();
    const scClean = scLower.replace(/[^a-z0-9]/g, '');
    if (scLower.includes(q) || (qClean && scClean.includes(qClean))) return true;
    if (q.includes(scLower) || (qClean && qClean.includes(scClean))) return true;
  }

  // 4. Acronym match (initials of words)
  const words = optStr.split(/[\s\-_\/]+/).filter(Boolean);
  const initials = words.map((w) => w[0]?.toLowerCase() || '').join('');
  if (qClean && (initials.includes(qClean) || qClean.includes(initials))) return true;

  // 5. Multi-token match (all typed words are matched)
  const qTokens = q.split(/\s+/).filter(Boolean);
  if (qTokens.length > 1) {
    const allTokensFound = qTokens.every((token) => {
      const tokenClean = token.replace(/[^a-z0-9]/g, '');
      return optLower.includes(token) || (tokenClean && optClean.includes(tokenClean));
    });
    if (allTokensFound) return true;
  }

  return false;
}

function SearchableCombobox({
  options,
  value,
  onChange,
  getShortCode,
  placeholder = 'Type to search or click to select...',
  label,
  required = false,
  accentColor = 'purple',
  entityLabel,
  onAddNew,
  onDeleteItem,
  onEditItem,
  onOpenManager,
  onAdvance,
  inputRef: externalInputRef,
  hideInputBadge = false
}: SearchableComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value || '');
  const [hasTypedFilter, setHasTypedFilter] = useState(false);
  const [isAddingInline, setIsAddingInline] = useState(false);
  const [inlineNewValue, setInlineNewValue] = useState('');
  const [editingItemName, setEditingItemName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [itemToDeleteConfirm, setItemToDeleteConfirm] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number; openAbove: boolean }>({
    top: 0,
    left: 0,
    width: 260,
    openAbove: false
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const localInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef || localInputRef;

  const safeOptions: string[] = useMemo(() => {
    if (!Array.isArray(options)) return [];
    const seen = new Set<string>();
    const list: string[] = [];
    for (const opt of options as any[]) {
      const s =
        typeof opt === 'string'
          ? opt.trim()
          : opt && typeof opt === 'object'
          ? String(opt.name || opt.bankName || opt.accountName || opt.title || opt.label || '').trim()
          : String(opt ?? '').trim();
      if (!s || isInvalidBankOrAccount(s)) continue;
      const key = s.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        list.push(s);
      }
    }
    return list;
  }, [options]);

  const updateDropdownPosition = useCallback(() => {
    const anchor = containerRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const viewportW = window.innerWidth || document.documentElement.clientWidth || 1024;
    const viewportH = window.innerHeight || document.documentElement.clientHeight || 768;
    const width = Math.min(Math.max(rect.width, 240), viewportW - 16);
    const left = Math.max(8, Math.min(rect.left, viewportW - width - 8));
    const spaceBelow = viewportH - rect.bottom;
    const spaceAbove = rect.top;
    const openAbove = spaceBelow < 240 && spaceAbove > spaceBelow;
    const top = openAbove ? Math.max(8, rect.top - 4) : Math.min(viewportH - 60, rect.bottom + 4);
    setDropdownRect({ top, left, width, openAbove });
  }, []);

  useEffect(() => {
    if (!value || !String(value).trim()) {
      setSearchTerm('');
      return;
    }
    const valClean = String(value).trim();
    if (isInvalidBankOrAccount(valClean)) {
      setSearchTerm('');
      return;
    }
    const exact = safeOptions.find((opt) => opt.toLowerCase() === valClean.toLowerCase());
    if (exact) {
      setSearchTerm(exact);
      return;
    }
    if (getShortCode) {
      const matchByCode = safeOptions.find((opt) => {
        const sc = getShortCode(opt);
        return sc && sc.toLowerCase() === valClean.toLowerCase();
      });
      if (matchByCode) {
        setSearchTerm(matchByCode);
        return;
      }
    }
    setSearchTerm(valClean);
  }, [value, safeOptions, getShortCode]);

  useEffect(() => {
    if (!isOpen) return;
    updateDropdownPosition();
    const handleReposition = () => updateDropdownPosition();
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [isOpen, updateDropdownPosition]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      const inContainer = containerRef.current && containerRef.current.contains(target);
      const inPortalDropdown = dropdownRef.current && dropdownRef.current.contains(target);
      if (!inContainer && !inPortalDropdown) {
        setIsOpen(false);
        setHasTypedFilter(false);
        setIsAddingInline(false);
        setEditingItemName(null);
        setItemToDeleteConfirm(null);
      }
    }
    function handleEsc(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setHasTypedFilter(false);
        setIsAddingInline(false);
        setEditingItemName(null);
        setItemToDeleteConfirm(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const rawQuery = (typeof searchTerm === 'string' ? searchTerm : String(searchTerm ?? '')).trim().toLowerCase();

  const filtered = useMemo(() => {
    // Only filter once the user actively types into the input; when opening an already-selected field, show all configured options
    if (!hasTypedFilter || !rawQuery) {
      return safeOptions;
    }
    return safeOptions.filter((opt) => matchesBankOrAccount(opt, searchTerm, getShortCode));
  }, [safeOptions, hasTypedFilter, rawQuery, searchTerm, getShortCode]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [filtered.length, rawQuery, hasTypedFilter, isOpen]);

  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const el = dropdownRef.current.querySelector('[data-combobox-highlighted="true"]') as HTMLElement | null;
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen]);

  const exactMatchExists = safeOptions.some(
    (opt) => opt.toLowerCase() === (searchTerm || '').trim().toLowerCase()
  );

  const focusRingColor =
    accentColor === 'indigo'
      ? 'focus:ring-indigo-500 hover:border-indigo-400'
      : accentColor === 'amber'
      ? 'focus:ring-amber-500 hover:border-amber-400'
      : accentColor === 'emerald'
      ? 'focus:ring-emerald-500 hover:border-emerald-400'
      : 'focus:ring-purple-500 hover:border-purple-400';

  const badgeBg =
    accentColor === 'indigo'
      ? 'bg-indigo-100 text-indigo-900 border-indigo-200'
      : accentColor === 'amber'
      ? 'bg-amber-100 text-amber-900 border-amber-200'
      : accentColor === 'emerald'
      ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
      : 'bg-purple-100 text-purple-900 border-purple-200';

  const handleCreateInline = (valToAdd: string) => {
    const trimmed = valToAdd.trim();
    if (!trimmed) return;
    if (onAddNew) {
      onAddNew(trimmed);
    }
    onChange(trimmed);
    setSearchTerm(trimmed);
    setHasTypedFilter(false);
    setIsAddingInline(false);
    setInlineNewValue('');
    setIsOpen(false);
  };

  const handleSaveEdit = (oldVal: string) => {
    const trimmed = editingValue.trim();
    if (!trimmed || trimmed === oldVal) {
      setEditingItemName(null);
      return;
    }
    if (onEditItem) {
      onEditItem(oldVal, trimmed);
    }
    if (value === oldVal) {
      onChange(trimmed);
      setSearchTerm(trimmed);
    }
    setEditingItemName(null);
  };

  const handleSelectOption = (opt: string) => {
    onChange(opt);
    setSearchTerm(opt);
    setHasTypedFilter(false);
    setIsOpen(false);
    if (onAdvance) {
      setTimeout(() => onAdvance(), 50);
    }
  };

  const handleDelete = (itemVal: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDeleteItem) {
      onDeleteItem(itemVal);
    }
    if (value === itemVal) {
      onChange('');
      setSearchTerm('');
    }
    setItemToDeleteConfirm(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setHasTypedFilter(false);
        setHighlightedIndex(0);
        updateDropdownPosition();
        setIsOpen(true);
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === 'Enter') {
        if (onAdvance) {
          e.preventDefault();
          onAdvance();
        }
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      setHighlightedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, filtered.length - 1)));
    } else if (e.key === 'Enter') {
      if (filtered.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        handleSelectOption(filtered[highlightedIndex] || filtered[0]);
      } else if (searchTerm.trim() && !exactMatchExists && onAddNew) {
        e.preventDefault();
        e.stopPropagation();
        handleCreateInline(searchTerm);
      } else if (onAdvance) {
        e.preventDefault();
        onAdvance();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
      setHasTypedFilter(false);
    }
  };

  const dropdownPortal = isOpen && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: dropdownRect.top,
            left: dropdownRect.left,
            width: dropdownRect.width,
            transform: dropdownRect.openAbove ? 'translateY(-100%)' : undefined,
            zIndex: 9999
          }}
          className="bg-[#081c29] border border-cyan-500/40 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] max-h-64 overflow-y-auto divide-y divide-cyan-500/15 text-white animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Quick Add Top Action if search term has no match and user typed something */}
          {hasTypedFilter && searchTerm.trim() && !exactMatchExists && onAddNew && (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                handleCreateInline(searchTerm);
              }}
              className="p-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border-b border-emerald-400/30 text-xs font-extrabold flex items-center justify-between cursor-pointer transition-colors"
            >
              <div className="flex items-center space-x-1.5 truncate">
                <Plus className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                <span className="truncate">Add "{searchTerm.trim()}" as new {entityLabel || 'Item'}</span>
              </div>
              <span className="text-[10px] bg-emerald-500/30 text-emerald-100 border border-emerald-400/40 font-mono px-2 py-0.5 rounded-full font-black flex-shrink-0">
                + Create
              </span>
            </div>
          )}

          {/* Inline Add Input Box if toggled */}
          {isAddingInline && (
            <div className="p-2 bg-[#0c2638] border-b border-cyan-500/25 flex items-center gap-1.5">
              <input
                type="text"
                autoFocus
                value={inlineNewValue}
                onChange={(e) => setInlineNewValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateInline(inlineNewValue);
                  }
                  if (e.key === 'Escape') setIsAddingInline(false);
                }}
                placeholder={`Type new ${entityLabel || 'name'}...`}
                className="flex-1 p-1.5 text-xs font-bold bg-[#061520] border border-cyan-500/30 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              />
              <button
                type="button"
                onClick={() => handleCreateInline(inlineNewValue)}
                className="px-2.5 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-lg text-xs font-extrabold cursor-pointer flex-shrink-0"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setIsAddingInline(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg text-xs cursor-pointer flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {filtered.length === 0 && !searchTerm.trim() ? (
            <div className="p-4 text-xs text-slate-400 italic text-center">
              No entries available.
            </div>
          ) : filtered.length === 0 && searchTerm.trim() ? (
            <div className="p-3 text-xs text-slate-300 text-center">
              No matching {entityLabel || 'entry'}. Click above to add or use custom name.
            </div>
          ) : (
            filtered.map((opt, idx) => {
              const code = getShortCode ? getShortCode(opt) : '';
              const isSelected = (value || '').trim().toLowerCase() === opt.toLowerCase();
              const isHighlighted = idx === highlightedIndex;
              const isEditingThis = editingItemName === opt;

              if (isEditingThis) {
                return (
                  <div key={`${opt}-${idx}`} className="p-2 bg-amber-500/15 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      autoFocus
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveEdit(opt);
                        }
                        if (e.key === 'Escape') setEditingItemName(null);
                      }}
                      className="flex-1 p-1.5 text-xs font-bold bg-[#061520] border border-amber-400/40 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(opt)}
                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded text-xs font-bold cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingItemName(null)}
                      className="p-1 text-slate-300 hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={`${opt}-${idx}`}
                  data-combobox-highlighted={isHighlighted}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectOption(opt);
                  }}
                  onClick={() => handleSelectOption(opt)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`group p-2.5 text-xs font-medium cursor-pointer flex items-center justify-between transition-colors ${
                    isHighlighted
                      ? isSelected
                        ? 'bg-cyan-500/30 text-white font-extrabold border-l-4 border-cyan-300 ring-1 ring-inset ring-cyan-300/70 pl-2'
                        : 'bg-cyan-500/20 text-white font-bold border-l-4 border-cyan-400 pl-2'
                      : isSelected
                      ? 'bg-cyan-500/15 text-cyan-100 font-extrabold border-l-4 border-cyan-500/60 pl-2'
                      : 'hover:bg-cyan-500/[0.06] text-slate-200'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate flex-1 min-w-0 pr-2">
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                    )}
                    {entityLabel === 'Bank' && <BankLogoBadge bankName={opt} size="sm" />}
                    <span className="truncate font-bold">{opt}</span>
                    {code && (
                      <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded border font-mono flex-shrink-0 ${badgeBg}`}>
                        {code}
                      </span>
                    )}
                  </div>

                  {/* Actions for each item: Edit and Delete with inline confirmation */}
                  <div
                    className="flex items-center space-x-1 opacity-90 group-hover:opacity-100 flex-shrink-0"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {itemToDeleteConfirm === opt ? (
                      <div className="flex items-center space-x-1 bg-rose-500/20 border border-rose-400/35 rounded-lg p-0.5 animate-in fade-in zoom-in-95">
                        <button
                          type="button"
                          onClick={(e) => handleDelete(opt, e)}
                          className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-[10px] rounded shadow-xs cursor-pointer"
                          title="Confirm permanent deletion"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setItemToDeleteConfirm(null);
                          }}
                          className="p-0.5 text-slate-300 hover:text-white rounded text-[10px] cursor-pointer"
                          title="Cancel"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <>
                        {onEditItem && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingItemName(opt);
                              setEditingValue(opt);
                              setItemToDeleteConfirm(null);
                            }}
                            className="p-1 text-slate-400 hover:text-amber-300 hover:bg-amber-500/15 rounded transition-colors cursor-pointer"
                            title={`Rename ${entityLabel || 'Item'}`}
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}
                        {onDeleteItem && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setItemToDeleteConfirm(opt);
                            }}
                            className="p-1 text-slate-400 hover:text-rose-300 hover:bg-rose-500/15 rounded transition-colors cursor-pointer"
                            title={`Delete ${entityLabel || 'Item'}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Dropdown Bottom Management Bar */}
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className="p-2 bg-[#0c2638] border-t border-cyan-500/25 flex items-center justify-between text-[11px]"
          >
            {onAddNew && !isAddingInline && (
              <button
                type="button"
                onClick={() => setIsAddingInline(true)}
                className="text-emerald-300 hover:text-emerald-200 font-extrabold flex items-center space-x-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add New {entityLabel || 'Item'}</span>
              </button>
            )}
            {onOpenManager && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenManager();
                }}
                className="text-cyan-300 hover:text-cyan-200 font-extrabold flex items-center space-x-1 cursor-pointer ml-auto"
              >
                <Landmark className="w-3.5 h-3.5" />
                <span>Manage {entityLabel ? `${entityLabel}s` : 'Directory'}</span>
              </button>
            )}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="relative w-full" ref={containerRef}>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-bold text-slate-300 block">
            {label} {required && <span className="text-rose-400">*</span>}
          </label>
          <div className="flex items-center space-x-1.5 text-[10px]">
            {onAddNew && (
              <button
                type="button"
                onClick={() => {
                  updateDropdownPosition();
                  setIsOpen(true);
                  setIsAddingInline(true);
                }}
                className="text-emerald-300 hover:text-emerald-200 font-bold hover:underline cursor-pointer flex items-center space-x-0.5"
                title={`Add new ${entityLabel || 'entry'}`}
              >
                <Plus className="w-3 h-3" />
                <span>Add {entityLabel || 'New'}</span>
              </button>
            )}
            {onOpenManager && (
              <button
                type="button"
                onClick={onOpenManager}
                className="text-cyan-300 hover:text-cyan-200 font-bold hover:underline cursor-pointer flex items-center space-x-0.5"
                title="Open Directory Manager"
              >
                <Landmark className="w-3 h-3" />
                <span>Directory</span>
              </button>
            )}
          </div>
        </div>
      )}
      <div className="relative">
        {entityLabel === 'Bank' && !hideInputBadge && searchTerm.trim() && (
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none z-10 flex items-center">
            <BankLogoBadge bankName={searchTerm} size="sm" />
          </div>
        )}
        <input
          ref={inputRef}
          type="text"
          value={searchTerm || ''}
          required={required}
          onFocus={(e) => {
            setHasTypedFilter(false);
            updateDropdownPosition();
            setIsOpen(true);
            e.currentTarget.select();
          }}
          onClick={() => {
            setHasTypedFilter(false);
            updateDropdownPosition();
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onChange={(e) => {
            const val = e.target.value;
            setHasTypedFilter(true);
            setSearchTerm(val);
            onChange(val);
            updateDropdownPosition();
            setIsOpen(true);
          }}
          onBlur={() => {
            setTimeout(() => {
              setHasTypedFilter(false);
              if (!searchTerm.trim() && value) {
                setSearchTerm(value);
              }
            }, 200);
          }}
          placeholder={placeholder}
          className={`w-full py-2.5 ${entityLabel === 'Bank' && !hideInputBadge && searchTerm.trim() ? 'pl-9' : 'pl-2.5'} pr-14 border border-cyan-500/30 rounded-lg text-xs font-bold text-white bg-[#061520] placeholder-slate-400 focus:outline-none focus:ring-2 ${focusRingColor} transition-colors shadow-xs`}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-0.5">
          {searchTerm && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                setSearchTerm('');
                setHasTypedFilter(false);
                onChange('');
                updateDropdownPosition();
                setIsOpen(true);
                inputRef.current?.focus();
              }}
              className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
              title="Clear Search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              setHasTypedFilter(false);
              updateDropdownPosition();
              setIsOpen((prev) => !prev);
            }}
            className="text-slate-400 hover:text-cyan-300 p-0.5 cursor-pointer"
            title="Toggle dropdown list"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180 text-cyan-300' : ''}`} />
          </button>
        </div>
      </div>

      {dropdownPortal}
    </div>
  );
}

interface ExpenseCategoryComboboxProps {
  categories: ExpenseCategoryItem[];
  value: string;
  onChange: (catName: string, item?: ExpenseCategoryItem) => void;
  onAddNew: (name: string) => ExpenseCategoryItem;
  onSelectAndAdvance?: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  placeholder?: string;
  required?: boolean;
  accentColor?: 'emerald' | 'indigo' | 'blue';
  onOpenCategoryManager?: () => void;
}

function ExpenseCategoryCombobox({
  categories,
  value,
  onChange,
  onAddNew,
  onSelectAndAdvance,
  inputRef,
  placeholder = 'Type serial # or category name (e.g. 3 or Conveyance)...',
  required = false,
  accentColor = 'emerald',
  onOpenCategoryManager
}: ExpenseCategoryComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const localInputRef = useRef<HTMLInputElement>(null);
  const activeInputRef = inputRef || localInputRef;

  // Sync display text with selected value
  useEffect(() => {
    if (!value) {
      setSearchTerm('');
      return;
    }
    const cleanVal = value.replace(/^\d+[\.\s\-]+/, '').trim().toLowerCase();
    const match = categories.find(
      (c) => c.name.toLowerCase() === cleanVal || c.name.toLowerCase() === value.trim().toLowerCase()
    );
    if (match) {
      setSearchTerm(`${match.serial}. ${match.name}`);
    } else {
      setSearchTerm(value);
    }
  }, [value, categories]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleEsc(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const rawQuery = searchTerm.trim().toLowerCase();
  const cleanQuery = rawQuery.replace(/^\d+[\.\s\-]+/, '').trim();
  const queryDigitsMatch = rawQuery.match(/^(\d+)/);
  const queryNumber = queryDigitsMatch ? parseInt(queryDigitsMatch[1], 10) : null;

  const nextSerial = useMemo(() => {
    return categories.reduce((max, c) => Math.max(max, c.serial || 0), 0) + 1;
  }, [categories]);

  const filtered = useMemo(() => {
    if (!rawQuery) {
      return categories;
    }

    return categories.filter((c) => {
      if (queryNumber !== null && c.serial === queryNumber) return true;
      if (c.serial.toString().startsWith(rawQuery)) return true;
      if (`${c.serial}.`.startsWith(rawQuery)) return true;
      const cNameLower = c.name.toLowerCase();
      if (cNameLower.includes(rawQuery)) return true;
      if (cleanQuery && cNameLower.includes(cleanQuery)) return true;
      if (`${c.serial}. ${cNameLower}`.includes(rawQuery)) return true;
      return false;
    });
  }, [categories, rawQuery, cleanQuery, queryNumber]);

  const exactMatch = categories.find(
    (c) =>
      c.name.toLowerCase() === cleanQuery ||
      c.name.toLowerCase() === rawQuery ||
      `${c.serial}. ${c.name.toLowerCase()}` === rawQuery
  );

  const canAddNew = Boolean(cleanQuery || rawQuery) && !exactMatch;
  const newNameCandidate = cleanQuery || rawQuery;

  useEffect(() => {
    setHighlightedIndex(0);
  }, [filtered.length, rawQuery, isOpen]);

  useEffect(() => {
    if (isOpen && listRef.current) {
      const el = listRef.current.querySelector('[data-cat-highlighted="true"]') as HTMLElement | null;
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (cat: ExpenseCategoryItem) => {
    onChange(cat.name, cat);
    setSearchTerm(`${cat.serial}. ${cat.name}`);
    setIsOpen(false);
    if (onSelectAndAdvance) {
      setTimeout(() => onSelectAndAdvance(), 10);
    }
  };

  const handleAddAndSelect = (nameToAdd: string) => {
    const created = onAddNew(nameToAdd);
    onChange(created.name, created);
    setSearchTerm(`${created.serial}. ${created.name}`);
    setIsOpen(false);
    if (onSelectAndAdvance) {
      setTimeout(() => onSelectAndAdvance(), 10);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setIsOpen(true);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (value) {
          if (onSelectAndAdvance) onSelectAndAdvance();
        } else if (searchTerm.trim()) {
          if (exactMatch) {
            handleSelect(exactMatch);
          } else {
            handleAddAndSelect(searchTerm);
          }
        }
        return;
      }
      return;
    }

    const totalOptionsCount = filtered.length + (canAddNew ? 1 : 0);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < totalOptionsCount - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, totalOptionsCount - 1)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex < filtered.length) {
        handleSelect(filtered[highlightedIndex]);
      } else if (canAddNew) {
        handleAddAndSelect(newNameCandidate);
      } else if (filtered.length > 0) {
        handleSelect(filtered[0]);
      } else if (searchTerm.trim()) {
        handleAddAndSelect(searchTerm);
      }
    } else if (e.key === 'Tab') {
      if (isOpen && filtered.length > 0 && highlightedIndex < filtered.length) {
        const cat = filtered[highlightedIndex];
        onChange(cat.name, cat);
        setSearchTerm(`${cat.serial}. ${cat.name}`);
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative flex items-center">
        <input
          ref={activeInputRef as any}
          type="text"
          value={searchTerm}
          required={required}
          placeholder={placeholder}
          onFocus={() => {
            setIsOpen(true);
            activeInputRef.current?.select();
          }}
          onClick={() => setIsOpen(true)}
          onChange={(e) => {
            const val = e.target.value;
            setSearchTerm(val);
            if (!isOpen) setIsOpen(true);
            if (!val.trim()) {
              onChange('');
            }
          }}
          onKeyDown={handleKeyDown}
          className="w-full p-2.5 pr-16 border border-cyan-500/30 rounded-lg text-sm bg-[#061520] font-bold text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none transition-all shadow-2xs"
        />
        <div className="absolute right-2 flex items-center space-x-1">
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                onChange('');
                activeInputRef.current?.focus();
              }}
              className="p-1 text-slate-400 hover:text-white rounded text-xs font-bold"
              title="Clear Category"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setIsOpen(!isOpen);
              activeInputRef.current?.focus();
            }}
            className="p-1 text-slate-400 hover:text-cyan-300 rounded"
            title="Toggle Categories"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-[#081c29] rounded-xl shadow-2xl border border-cyan-500/35 z-50 overflow-hidden max-h-72 flex flex-col text-white animate-in fade-in zoom-in-95">
          <div className="p-2 bg-[#0c2638] border-b border-cyan-500/25 flex items-center justify-between text-[11px] font-bold text-slate-300">
            <span>Dynamic Expense Heads ({categories.length} Total)</span>
            <span className="text-[10px] text-emerald-200 bg-emerald-500/20 border border-emerald-400/30 px-1.5 py-0.5 rounded font-mono">
              Auto Serial Numbering
            </span>
          </div>

          <div ref={listRef} className="overflow-y-auto flex-1 divide-y divide-cyan-500/15">
            {filtered.length === 0 && !canAddNew && (
              <div className="p-4 text-center text-xs text-slate-400 italic">
                No matching category found.
              </div>
            )}

            {filtered.map((cat, idx) => {
              const isSelected = value.toLowerCase() === cat.name.toLowerCase();
              const isHighlighted = highlightedIndex === idx;
              return (
                <div
                  key={cat.serial + '-' + cat.name}
                  data-cat-highlighted={isHighlighted}
                  onClick={() => handleSelect(cat)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`p-2.5 text-xs cursor-pointer flex items-center justify-between transition-colors ${
                    isHighlighted
                      ? isSelected
                        ? 'bg-emerald-500/30 text-white font-bold border-l-4 border-emerald-300 ring-1 ring-inset ring-cyan-300/70 pl-2'
                        : 'bg-cyan-500/20 text-white font-bold border-l-4 border-cyan-400 pl-2'
                      : isSelected
                      ? 'bg-emerald-500/15 text-emerald-100 font-bold border-l-4 border-emerald-400 pl-2'
                      : 'hover:bg-cyan-500/[0.06] text-slate-200'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <span className="font-mono text-cyan-200 bg-cyan-500/20 border border-cyan-400/30 px-1.5 py-0.5 rounded text-[11px] font-extrabold min-w-[28px] text-center">
                      {cat.serial}.
                    </span>
                    <span className="truncate font-bold text-white text-sm">{cat.name}</span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-emerald-300 shrink-0" />}
                </div>
              );
            })}

            {canAddNew && (
              <div
                data-cat-highlighted={highlightedIndex === filtered.length}
                onClick={() => handleAddAndSelect(newNameCandidate)}
                onMouseEnter={() => setHighlightedIndex(filtered.length)}
                className={`p-3 text-xs cursor-pointer flex items-center justify-between transition-colors border-t border-dashed border-emerald-400/40 ${
                  highlightedIndex === filtered.length
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 font-semibold'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/30 text-emerald-200 flex items-center justify-center font-bold text-xs">
                    +
                  </div>
                  <div>
                    <div className="font-bold">
                      Add New: <span className="underline decoration-2">{newNameCandidate}</span>
                    </div>
                    <div className={`text-[10px] ${highlightedIndex === filtered.length ? 'text-emerald-100' : 'text-emerald-300'}`}>
                      Auto-assigned Serial #{nextSerial} • Press Enter to create & proceed
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/25 font-bold">
                  SL #{nextSerial}
                </span>
              </div>
            )}
            {onOpenCategoryManager && (
              <div
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsOpen(false);
                  onOpenCategoryManager();
                }}
                className="p-2.5 border-t border-cyan-500/25 bg-[#0c2638] hover:bg-cyan-500/15 text-cyan-200 font-bold text-xs flex items-center justify-between cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <Settings className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Manage / Re-order All Expense Heads...</span>
                </div>
                <span className="text-[10px] bg-cyan-500/20 text-cyan-200 border border-cyan-400/30 font-mono px-1.5 py-0.5 rounded font-bold">
                  {categories.length} Heads
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface AssignExpenseToSelectProps {
  value: string;
  onChange: (val: string) => void;
  branches?: BranchLocation[];
  salespersons?: Salesperson[];
  onSelectAndProceed?: () => void;
  onGoBack?: () => void;
  triggerRef?: React.RefObject<HTMLDivElement | null>;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  themeColor?: 'emerald' | 'blue';
}

function AssignExpenseToSelect({
  value,
  onChange,
  branches = [],
  salespersons = [],
  onSelectAndProceed,
  onGoBack,
  triggerRef,
  inputRef,
  themeColor = 'emerald'
}: AssignExpenseToSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Group options into sales centers and users
  const { salesCenters, staffUsers } = useMemo(() => {
    const centers: { id: string; name: string; subtitle: string }[] = [];
    const centerNamesSeen = new Set<string>();

    branches.forEach((b) => {
      const cleanName = cleanSalesCenterName(b.name);
      if (!centerNamesSeen.has(cleanName.toLowerCase())) {
        centerNamesSeen.add(cleanName.toLowerCase());
        centers.push({
          id: b.id,
          name: cleanName,
          subtitle: b.type ? `${b.type.toUpperCase()}` : 'Sales Center / Branch'
        });
      }
    });

    if (!centerNamesSeen.has('madhupur sales center')) {
      centers.unshift({
        id: 'center_madhupur',
        name: 'Madhupur Sales Center',
        subtitle: 'Main Center'
      });
    }

    const users: { id: string; name: string; subtitle: string; code?: string }[] = [];
    salespersons.forEach((sp) => {
      const details = [
        sp.code ? `Code: ${sp.code}` : '',
        sp.role || sp.designation || 'Marketing / Staff',
        sp.branchName || sp.areaGroup || ''
      ].filter(Boolean).join(' • ');

      users.push({
        id: sp.id,
        name: sp.name,
        code: sp.code,
        subtitle: details
      });
    });

    return { salesCenters: centers, staffUsers: users };
  }, [branches, salespersons]);

  // Filter based on search term
  const filteredCenters = useMemo(() => {
    if (!searchTerm.trim()) return salesCenters;
    const q = searchTerm.toLowerCase();
    return salesCenters.filter(
      (c) => c.name.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q)
    );
  }, [salesCenters, searchTerm]);

  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return staffUsers;
    const q = searchTerm.toLowerCase();
    return staffUsers.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.code && u.code.toLowerCase().includes(q)) ||
        u.subtitle.toLowerCase().includes(q)
    );
  }, [staffUsers, searchTerm]);

  const combinedOptions = useMemo(
    () => [...filteredCenters.map((c) => c.name), ...filteredUsers.map((u) => u.name)],
    [filteredCenters, filteredUsers]
  );

  useEffect(() => {
    setHighlightedIdx(0);
  }, [searchTerm, combinedOptions.length, isOpen]);

  useEffect(() => {
    if (isOpen && listRef.current) {
      const el = listRef.current.querySelector('[data-assign-highlighted="true"]') as HTMLElement | null;
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIdx, isOpen]);

  // Click/touch outside or Escape to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const handleSelect = (name: string) => {
    onChange(name);
    setIsOpen(false);
    setSearchTerm('');
    if (onSelectAndProceed) {
      onSelectAndProceed();
    }
  };

  const ringClass =
    themeColor === 'emerald'
      ? 'focus:ring-cyan-400 focus:border-cyan-400'
      : 'focus:ring-cyan-400 focus:border-cyan-400';
  const activeBg =
    themeColor === 'emerald'
      ? 'bg-emerald-500/20 text-emerald-100 border-emerald-400/40 font-bold'
      : 'bg-cyan-500/20 text-cyan-100 border-cyan-400/40 font-bold';
  const checkColor = themeColor === 'emerald' ? 'text-emerald-300' : 'text-cyan-300';

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        ref={triggerRef}
        tabIndex={0}
        role="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (isOpen) {
              const topMatch = filteredCenters[0]?.name || filteredUsers[0]?.name;
              if (topMatch) handleSelect(topMatch);
              else if (searchTerm.trim()) handleSelect(searchTerm.trim());
            } else {
              if (onSelectAndProceed) onSelectAndProceed();
            }
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            if (!isOpen) {
              e.preventDefault();
              if (onSelectAndProceed) onSelectAndProceed();
            }
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            if (!isOpen) {
              e.preventDefault();
              if (onGoBack) onGoBack();
            }
          } else if (e.key === ' ' && !isOpen) {
            e.preventDefault();
            setIsOpen(true);
          } else if (e.key === 'Escape') {
            setIsOpen(false);
          }
        }}
        className={`w-full p-2.5 border border-cyan-500/30 rounded-lg text-sm font-bold text-white bg-[#061520] flex items-center justify-between cursor-pointer shadow-xs transition-all focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
          isOpen
            ? 'ring-2 ring-cyan-400 border-cyan-400'
            : 'hover:border-cyan-400/60'
        }`}
      >
        <div className="flex items-center space-x-2 truncate">
          {salesCenters.some((c) => c.name.toLowerCase() === value.toLowerCase()) ? (
            <Building2
              className={`w-4 h-4 shrink-0 ${
                themeColor === 'emerald' ? 'text-emerald-300' : 'text-cyan-300'
              }`}
            />
          ) : (
            <Users
              className={`w-4 h-4 shrink-0 ${
                themeColor === 'emerald' ? 'text-emerald-300' : 'text-cyan-300'
              }`}
            />
          )}
          <span className="truncate">{value || 'Select Sales Center or User...'}</span>
        </div>
        <div className="flex items-center space-x-1 shrink-0 text-slate-400">
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180 text-cyan-300' : ''}`}
          />
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1.5 w-full bg-[#081c29] rounded-xl shadow-2xl border border-cyan-500/35 overflow-hidden text-white animate-in fade-in zoom-in-95">
          {/* Search Bar inside dropdown */}
          <div className="p-2 border-b border-cyan-500/20 bg-[#0c2638]">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-cyan-400 absolute left-3 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                autoFocus
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setHighlightedIdx(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (combinedOptions.length > 0) {
                      setHighlightedIdx((prev) => (prev + 1) % combinedOptions.length);
                    }
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (combinedOptions.length > 0) {
                      setHighlightedIdx((prev) => (prev - 1 + combinedOptions.length) % combinedOptions.length);
                    }
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    const chosen = combinedOptions[highlightedIdx] || combinedOptions[0];
                    if (chosen) {
                      handleSelect(chosen);
                    } else if (searchTerm.trim()) {
                      handleSelect(searchTerm.trim());
                    }
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen(false);
                  }
                }}
                placeholder="Search sales center or user name..."
                className={`w-full pl-9 pr-8 py-2 text-xs font-semibold bg-[#061520] text-white placeholder-slate-400 border border-cyan-500/30 rounded-lg focus:outline-hidden focus:ring-2 ${ringClass}`}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* List of Centers & Users */}
          <div ref={listRef} className="max-h-64 overflow-y-auto divide-y divide-cyan-500/15">
            {/* Sales Centers Group */}
            {filteredCenters.length > 0 && (
              <div className="p-1.5">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-3 h-3 text-cyan-300" />
                    Sales Centers
                  </span>
                  <span className="bg-[#061520] border border-cyan-500/25 px-1.5 py-0.5 rounded text-[9px] font-mono text-cyan-200">
                    {filteredCenters.length}
                  </span>
                </div>
                <div className="space-y-0.5 mt-0.5">
                  {filteredCenters.map((center, cIdx) => {
                    const isSelected = value.toLowerCase() === center.name.toLowerCase();
                    const isHighlighted = highlightedIdx === cIdx;
                    return (
                      <button
                        key={center.id}
                        type="button"
                        data-assign-highlighted={isHighlighted}
                        onMouseEnter={() => setHighlightedIdx(cIdx)}
                        onClick={() => handleSelect(center.name)}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                          isHighlighted
                            ? 'bg-cyan-500/25 text-white ring-1 ring-inset ring-cyan-300/70'
                            : isSelected
                            ? activeBg
                            : 'hover:bg-cyan-500/10 text-slate-200'
                        }`}
                      >
                        <div className="truncate">
                          <div className="font-bold text-white">{center.name}</div>
                          <div className="text-[10px] text-slate-400">{center.subtitle}</div>
                        </div>
                        {isSelected && <Check className={`w-4 h-4 shrink-0 ${checkColor}`} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Users & Staff Group */}
            {filteredUsers.length > 0 && (
              <div className="p-1.5">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3 h-3 text-cyan-300" />
                    Users & Staff
                  </span>
                  <span className="bg-[#061520] border border-cyan-500/25 px-1.5 py-0.5 rounded text-[9px] font-mono text-cyan-200">
                    {filteredUsers.length}
                  </span>
                </div>
                <div className="space-y-0.5 mt-0.5">
                  {filteredUsers.map((user, uIdx) => {
                    const flatIdx = filteredCenters.length + uIdx;
                    const isSelected = value.toLowerCase() === user.name.toLowerCase();
                    const isHighlighted = highlightedIdx === flatIdx;
                    return (
                      <button
                        key={user.id}
                        type="button"
                        data-assign-highlighted={isHighlighted}
                        onMouseEnter={() => setHighlightedIdx(flatIdx)}
                        onClick={() => handleSelect(user.name)}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                          isHighlighted
                            ? 'bg-cyan-500/25 text-white ring-1 ring-inset ring-cyan-300/70'
                            : isSelected
                            ? activeBg
                            : 'hover:bg-cyan-500/10 text-slate-200'
                        }`}
                      >
                        <div className="truncate">
                          <div className="font-bold text-white">
                            {user.name} {user.code ? `(${user.code})` : ''}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">{user.subtitle}</div>
                        </div>
                        {isSelected && <Check className={`w-4 h-4 shrink-0 ${checkColor}`} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {filteredCenters.length === 0 && filteredUsers.length === 0 && (
              <div className="p-4 text-center text-xs text-slate-400">
                <p>No matching sales center or user found.</p>
                {searchTerm.trim() && (
                  <button
                    type="button"
                    onClick={() => handleSelect(searchTerm.trim())}
                    className="mt-2 px-3 py-1 bg-[#0c2638] hover:bg-[#12354c] text-cyan-200 border border-cyan-500/30 font-bold rounded-lg text-xs cursor-pointer inline-flex items-center gap-1"
                  >
                    <span>Use &ldquo;{searchTerm.trim()}&rdquo;</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface EditExpenseModalDialogProps {
  expense: ExpenseEntry;
  salespersons: Salesperson[];
  branches?: BranchLocation[];
  parties?: Party[];
  categories: ExpenseCategoryItem[];
  onAddNewCategory: (name: string) => ExpenseCategoryItem;
  onSave: (updated: ExpenseEntry) => void;
  onClose: () => void;
}

function EditExpenseModalDialog({
  expense,
  salespersons,
  branches = [],
  parties = [],
  categories,
  onAddNewCategory,
  onSave,
  onClose
}: EditExpenseModalDialogProps) {
  const [assignedEntity, setAssignedEntity] = useState<string>(expense.entityName || 'Madhupur Sales Center');
  const [entryDate, setEntryDate] = useState<string>(() => formatDateDDMMYY(expense.date));
  const [areaName, setAreaName] = useState<string>(expense.area || '');
  const [selectedHead, setSelectedHead] = useState<string>(expense.expenseHead || '');
  const [amount, setAmount] = useState<string>(expense.amount ? expense.amount.toString() : '');
  const [remarks, setRemarks] = useState<string>(expense.remarks || '');
  const [fundingPartyName, setFundingPartyName] = useState<string>(expense.fundingPartyName || '');
  const [isApproved, setIsApproved] = useState<boolean>(Boolean(expense.isApproved));
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      setError('Please enter a valid expense amount.');
      return;
    }
    if (!selectedHead.trim()) {
      setError('Please select or enter an expense category.');
      return;
    }

    const isCenter =
      branches.some((b) => cleanSalesCenterName(b.name).toLowerCase() === assignedEntity.toLowerCase()) ||
      assignedEntity.toLowerCase().includes('sales center') ||
      assignedEntity.toLowerCase().includes('showroom');
    const entityType = isCenter ? 'center' : 'marketing';
    const updated: ExpenseEntry = {
      ...expense,
      entityName: assignedEntity,
      entityType,
      date: entryDate,
      area: areaName,
      expenseHead: selectedHead.trim(),
      amount: num,
      remarks: remarks.trim(),
      fundingPartyName: fundingPartyName.trim() || undefined,
      isApproved: isApproved && Boolean(fundingPartyName.trim()),
      approvalStatus: isApproved && Boolean(fundingPartyName.trim()) ? 'approved' : 'pending',
      approvedAt: isApproved && Boolean(fundingPartyName.trim()) ? (expense.approvedAt || new Date().toISOString()) : undefined
    };

    onSave(updated);
  };

  return (
    <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-lg w-full border border-cyan-400/35 overflow-hidden text-white animate-in fade-in zoom-in-95">
        <div className="bg-[#0c2638]/95 border-b border-cyan-500/25 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Edit2 className="w-5 h-5 text-cyan-300" />
            <div>
              <h3 className="text-base font-bold text-white">Edit Expense Voucher</h3>
              <p className="text-xs text-cyan-200/80">Modify voucher accounts, category, or amount</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-300 hover:text-white rounded-lg hover:bg-cyan-500/15 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-2.5 bg-rose-500/15 border border-rose-400/40 text-rose-200 text-xs rounded-lg font-bold">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">Assign Expense To:</label>
            <AssignExpenseToSelect
              value={assignedEntity}
              onChange={setAssignedEntity}
              branches={branches}
              salespersons={salespersons}
              themeColor="blue"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">Expense Date:</label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  onBlur={() => {
                    if (entryDate.trim()) setEntryDate(formatDateDDMMYY(entryDate));
                  }}
                  placeholder="dd.mm.yy"
                  required
                  className="w-full p-2.5 pr-8 border border-cyan-500/30 rounded-lg text-sm font-mono font-bold text-white bg-[#061520] placeholder-slate-400 focus:ring-2 focus:ring-cyan-400"
                />
                <input
                  type="date"
                  value={parseDateToISO(entryDate)}
                  onChange={(e) => {
                    if (e.target.value) setEntryDate(formatDateDDMMYY(e.target.value));
                  }}
                  className="opacity-0 absolute right-1 w-6 h-6 cursor-pointer"
                  title="Pick Date"
                />
                <Calendar className="w-4 h-4 text-cyan-300 absolute right-2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">Area / Location:</label>
              <input
                type="text"
                value={areaName}
                onChange={(e) => setAreaName(e.target.value)}
                placeholder="Madhupur / Tangail"
                className="w-full p-2.5 border border-cyan-500/30 rounded-lg text-sm font-medium text-white bg-[#061520] placeholder-slate-400 focus:ring-2 focus:ring-cyan-400"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">Expense Head / Category:</label>
            <ExpenseCategoryCombobox
              categories={categories}
              value={selectedHead}
              onChange={(val) => setSelectedHead(val)}
              onAddNew={onAddNewCategory}
              accentColor="blue"
              required
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">Amount (Tk):</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-cyan-300 font-bold">৳</span>
              <input
                type="number"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
                className="w-full p-2.5 pl-8 border border-cyan-500/30 rounded-lg text-base font-extrabold text-white bg-[#061520] placeholder-slate-400 focus:ring-2 focus:ring-cyan-400"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">Remarks / Details:</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Voucher details / note"
              className="w-full p-2.5 border border-cyan-500/30 rounded-lg text-sm text-white bg-[#061520] placeholder-slate-400 focus:ring-2 focus:ring-cyan-400"
            />
          </div>

          <div className="pt-3 border-t border-cyan-500/20 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-bold text-slate-200 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg text-xs font-black text-slate-950 bg-cyan-400 hover:bg-cyan-300 flex items-center space-x-1.5 shadow-md cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Update Expense</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ExpenseCategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: ExpenseCategoryItem[];
  onSaveCategories: (cats: ExpenseCategoryItem[]) => void;
  onNotify: (type: 'success' | 'error', msg: string) => void;
}

function ExpenseCategoryManagerModal({
  isOpen,
  onClose,
  categories,
  onSaveCategories,
  onNotify
}: ExpenseCategoryManagerModalProps) {
  const [localCategories, setLocalCategories] = useState<ExpenseCategoryItem[]>(categories);
  const [newSerial, setNewSerial] = useState<number>(() => {
    return categories.reduce((max, c) => Math.max(max, c.serial || 0), 0) + 1;
  });
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editSerial, setEditSerial] = useState<number>(1);

  useEffect(() => {
    setLocalCategories(categories);
    const nextS = categories.reduce((max, c) => Math.max(max, c.serial || 0), 0) + 1;
    setNewSerial(nextS);
  }, [categories, isOpen]);

  if (!isOpen) return null;

  const handleAddHead = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = newCategoryName.trim();
    if (!clean) {
      onNotify('error', 'Please enter a category / expense head name.');
      return;
    }
    const exists = localCategories.some((c) => c.name.toLowerCase() === clean.toLowerCase());
    if (exists) {
      onNotify('error', `Category "${clean}" already exists.`);
      return;
    }

    const item: ExpenseCategoryItem = {
      serial: Number(newSerial) || (localCategories.reduce((max, c) => Math.max(max, c.serial || 0), 0) + 1),
      name: clean
    };

    const updated = [...localCategories, item].sort((a, b) => a.serial - b.serial);
    setLocalCategories(updated);
    onSaveCategories(updated);
    setNewCategoryName('');
    const nextS = updated.reduce((max, c) => Math.max(max, c.serial || 0), 0) + 1;
    setNewSerial(nextS);
    onNotify('success', `Added "${item.serial}. ${item.name}"`);
  };

  const handleDelete = (serialToDelete: number, nameToDelete: string) => {
    const updated = localCategories.filter((c) => !(c.serial === serialToDelete && c.name === nameToDelete));
    setLocalCategories(updated);
    onSaveCategories(updated);
    onNotify('success', `Deleted "${nameToDelete}".`);
  };

  const handleStartEdit = (cat: ExpenseCategoryItem, idx: number) => {
    setEditingIndex(idx);
    setEditSerial(cat.serial);
    setEditName(cat.name);
  };

  const handleSaveEdit = (idx: number) => {
    const clean = editName.trim();
    if (!clean) {
      onNotify('error', 'Category name cannot be empty.');
      return;
    }
    const updated = [...localCategories];
    updated[idx] = { serial: Number(editSerial) || 1, name: clean };
    updated.sort((a, b) => a.serial - b.serial);
    setLocalCategories(updated);
    onSaveCategories(updated);
    setEditingIndex(null);
    onNotify('success', `Updated to "${editSerial}. ${clean}"`);
  };

  const handleAutoRenumber = () => {
    const updated = localCategories.map((c, i) => ({ ...c, serial: i + 1 }));
    setLocalCategories(updated);
    onSaveCategories(updated);
    const nextS = updated.length + 1;
    setNewSerial(nextS);
    onNotify('success', `Renumbered ${updated.length} categories sequentially from 1 to ${updated.length}.`);
  };

  const handleResetToStandard = () => {
    if (window.confirm('Reset all expense categories to standard 31 heads? This cannot be undone.')) {
      const resetList = DEFAULT_EXPENSE_HEADS.map((name, idx) => ({ serial: idx + 1, name }));
      setLocalCategories(resetList);
      onSaveCategories(resetList);
      setNewSerial(resetList.length + 1);
      onNotify('success', 'Reset categories to standard 31 heads.');
    }
  };

  const filtered = localCategories.filter((c) => {
    if (!filterQuery) return true;
    const q = filterQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) || String(c.serial).includes(q);
  });

  return (
    <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-2xl w-full border border-cyan-400/35 overflow-hidden animate-in fade-in zoom-in-95 flex flex-col max-h-[90vh] text-white">
        {/* Modal Header */}
        <div className="bg-[#0c2638]/95 border-b border-cyan-500/25 text-white p-4 flex items-center justify-between flex-none">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-cyan-500/20 rounded-xl border border-cyan-400/30 text-cyan-300">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white tracking-wide">
                Expense Heads & Categories Master
              </h3>
              <p className="text-xs text-cyan-200/80">
                Add new expense heads, auto-set sequential serials, and customize heads ({localCategories.length} total)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-cyan-500/15 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Add New Category Form Box */}
        <div className="p-4 bg-[#0b2334]/80 border-b border-cyan-500/20 flex-none space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase text-cyan-200 tracking-wider flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-emerald-300" />
              Add New Expense Head / Category
            </span>
            <span className="text-[11px] font-bold text-cyan-200 bg-[#061520] border border-cyan-500/25 px-2 py-0.5 rounded-full">
              Next Serial Auto-Set: #{newSerial}
            </span>
          </div>

          <form onSubmit={handleAddHead} className="flex items-end gap-2">
            <div className="w-20 shrink-0">
              <label className="text-[10px] font-bold text-slate-400 block mb-0.5 uppercase">SL#</label>
              <input
                type="number"
                min={1}
                value={newSerial}
                onChange={(e) => setNewSerial(Number(e.target.value))}
                className="w-full p-2 border border-cyan-500/30 rounded-lg text-xs font-mono font-black text-center bg-[#061520] text-white focus:ring-2 focus:ring-cyan-400"
                placeholder="SL#"
                required
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-bold text-slate-400 block mb-0.5 uppercase">Category / Head Name</label>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g. Generator Fuel, Internet Bill, Office Water..."
                className="w-full p-2 border border-cyan-500/30 rounded-lg text-xs font-bold text-white bg-[#061520] placeholder-slate-400 focus:ring-2 focus:ring-cyan-400"
                required
              />
            </div>
            <div className="shrink-0">
              <button
                type="submit"
                className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-black rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Add Head</span>
              </button>
            </div>
          </form>
        </div>

        {/* Toolbar & Search */}
        <div className="p-3 bg-[#081b28] border-b border-cyan-500/20 flex-none flex flex-wrap items-center justify-between gap-2">
          <div className="relative min-w-0 w-full sm:w-auto sm:min-w-[200px] sm:flex-1">
            <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Search category name or serial..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#061520] border border-cyan-500/30 rounded-lg text-white placeholder-slate-400 focus:ring-1 focus:ring-cyan-400"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAutoRenumber}
              className="px-2.5 py-1.5 text-[11px] font-bold text-cyan-200 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/30 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
              title="Renumber all categories 1, 2, 3... in order"
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>Re-Serial (1..N)</span>
            </button>
            <button
              type="button"
              onClick={handleResetToStandard}
              className="px-2.5 py-1.5 text-[11px] font-bold text-slate-200 bg-[#0c2638] hover:bg-[#12354c] border border-cyan-500/30 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
              title="Reset to 31 standard heads"
            >
              <RotateCcw className="w-3.5 h-3.5 text-cyan-300" />
              <span>Reset to 31</span>
            </button>
          </div>
        </div>

        {/* Categories Table List */}
        <div className="flex-1 overflow-y-auto p-4">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#0c2638] border-b border-cyan-500/30 font-bold uppercase text-[10px] text-cyan-200">
                <th className="p-2 w-16 text-center">SL#</th>
                <th className="p-2">Expense Head / Category</th>
                <th className="p-2 w-28 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-slate-400 font-medium">
                    No categories found matching "{filterQuery}"
                  </td>
                </tr>
              ) : (
                filtered.map((cat, idx) => {
                  const isEditing = editingIndex === idx;
                  return (
                    <tr key={cat.serial + '-' + cat.name} className="hover:bg-cyan-500/[0.06]">
                      <td className="p-2 text-center font-mono font-bold text-cyan-200">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editSerial}
                            onChange={(e) => setEditSerial(Number(e.target.value))}
                            className="w-12 p-1 bg-[#061520] text-white border border-cyan-400/50 rounded text-center text-xs font-mono font-bold"
                          />
                        ) : (
                          cat.serial
                        )}
                      </td>
                      <td className="p-2 font-bold text-white">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full p-1 bg-[#061520] text-white border border-cyan-400/50 rounded text-xs font-bold"
                          />
                        ) : (
                          <span>{cat.name}</span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(idx)}
                              className="px-2 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded text-[10px] font-black cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingIndex(null)}
                              className="px-2 py-1 bg-[#0c2638] hover:bg-[#12354c] text-slate-200 border border-cyan-500/30 rounded text-[10px] font-bold cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(cat, idx)}
                              className="p-1 hover:bg-cyan-500/20 text-cyan-300 rounded transition-colors cursor-pointer"
                              title="Edit Head"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(cat.serial, cat.name)}
                              className="p-1 hover:bg-rose-500/20 text-rose-300 rounded transition-colors cursor-pointer"
                              title="Delete Head"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#071824]/90 border-t border-cyan-500/20 flex items-center justify-between flex-none text-xs">
          <span className="text-slate-400 font-medium">
            Total {localCategories.length} categories active. All changes save automatically.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black rounded-lg cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export interface EditCollectionMrModalDialogProps {
  collection: CollectionMR;
  parties: Party[];
  salespersons: Salesperson[];
  bankList: string[];
  branches?: BranchLocation[];
  onSave: (updated: CollectionMR) => void;
  onDelete?: (collectionId: string) => void;
  onClose: () => void;
}

export function EditCollectionMrModalDialog({
  collection,
  parties = [],
  salespersons = [],
  bankList = [],
  branches = [],
  onSave,
  onDelete,
  onClose
}: EditCollectionMrModalDialogProps) {
  const effectiveBranches = useMemo(() => {
    let list: BranchLocation[] = [];
    if (branches && branches.length > 0) list = branches;
    else {
      try {
        const saved = localStorage.getItem('polycables_branches');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) list = parsed;
        }
      } catch (e) {}
    }
    if (list.length === 0) {
      list = [{ id: 'br-madhupur', name: 'Madhupur Sales Center', code: 'MDH' } as any];
    }
    return list
      .filter((b) => b && !isUnwantedSalesCenter(b))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [branches]);
  const [mrDate, setMrDate] = useState<string>(() => formatDateDDMMYY(collection.date) || collection.date || '');
  const [mrNo, setMrNo] = useState<string>(collection.mrNo || '');
  const [partyName, setPartyName] = useState<string>(collection.partyName || '');
  const [partySearchQuery, setPartySearchQuery] = useState<string>(collection.partyName || '');
  const [isPartyDropdownOpen, setIsPartyDropdownOpen] = useState<boolean>(false);
  const [partyHighlightIdx, setPartyHighlightIdx] = useState<number>(0);
  const editPartyContainerRef = useRef<HTMLDivElement>(null);
  const editPartyDropdownRef = useRef<HTMLDivElement>(null);
  const [entityName, setEntityName] = useState<string>(collection.entityName || 'Madhupur Sales Center');
  const [paymentType, setPaymentType] = useState<'cash' | 'cheque'>(collection.paymentType || 'cash');
  const [amount, setAmount] = useState<number | string>(collection.amount || 0);
  const [bankName, setBankName] = useState<string>(collection.bankName || '');
  const [chequeNo, setChequeNo] = useState<string>(collection.chequeNo || '');
  const [passDate, setPassDate] = useState<string>(() => formatDateDDMMYY(collection.passDate || '') || collection.passDate || '');
  const [remarks, setRemarks] = useState<string>(collection.remarks || '');

  // Filter parties based on search query
  const filteredParties = useMemo(() => {
    const q = partySearchQuery.trim().toLowerCase();
    if (!q) return parties;
    return parties.filter((p) => {
      const pName = (p.name || '').toLowerCase();
      const pAddr = (p.address || '').toLowerCase();
      const pPhone = (p.phone || '').toLowerCase();
      const pSp = (p.salespersonName || '').toLowerCase();
      return pName.includes(q) || pAddr.includes(q) || pPhone.includes(q) || pSp.includes(q);
    });
  }, [parties, partySearchQuery]);

  useEffect(() => {
    setPartyHighlightIdx(0);
  }, [partySearchQuery, filteredParties.length, isPartyDropdownOpen]);

  useEffect(() => {
    if (isPartyDropdownOpen && editPartyDropdownRef.current) {
      const el = editPartyDropdownRef.current.querySelector('[data-edit-party-highlighted="true"]') as HTMLElement | null;
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [partyHighlightIdx, isPartyDropdownOpen]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (editPartyContainerRef.current && !editPartyContainerRef.current.contains(e.target as Node)) {
        setIsPartyDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, []);

  const handleSelectParty = (p: Party) => {
    setPartyName(p.name);
    setPartySearchQuery(p.name);
    setIsPartyDropdownOpen(false);
    if (p.salespersonName && p.salespersonName.trim() !== '') {
      const matchSp = salespersons.find(
        (sp) => sp.name.trim().toLowerCase() === p.salespersonName?.trim().toLowerCase()
      );
      if (matchSp) {
        setEntityName(matchSp.name);
      }
    }
  };

  const handleResetDate = () => {
    const today = formatDateDDMMYY(new Date().toISOString().split('T')[0]);
    setMrDate(today);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalDate = formatDateDDMMYY(mrDate) || mrDate;
    const finalPassDate = passDate ? (formatDateDDMMYY(passDate) || passDate) : '';
    const finalAmount = Number(amount) || 0;
    const resolvedCenterName = resolveEntityToSalesCenter(entityName, effectiveBranches, salespersons) || entityName;
    const matchedBr = effectiveBranches.find(
      (b) =>
        b.name.trim().toLowerCase() === resolvedCenterName.trim().toLowerCase() ||
        cleanSalesCenterName(b.name).toLowerCase() === cleanSalesCenterName(resolvedCenterName).toLowerCase()
    );

    const updated: CollectionMR = {
      ...collection,
      date: finalDate,
      mrNo: mrNo.trim(),
      partyName: partyName.trim() || partySearchQuery.trim(),
      entityName,
      branchName: matchedBr ? matchedBr.name : resolvedCenterName || collection.branchName,
      branchId: matchedBr ? matchedBr.id : collection.branchId,
      paymentType,
      amount: finalAmount,
      bankName: paymentType === 'cheque' ? bankName : (collection.bankName || (collection.depositBankTag === 'H/O' ? 'H/O' : undefined)),
      chequeNo: paymentType === 'cheque' ? chequeNo : undefined,
      passDate: paymentType === 'cheque' ? finalPassDate : undefined,
      remarks: remarks.trim()
    };

    onSave(updated);
  };

  return (
    <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 w-full max-w-xl overflow-hidden font-sans text-white">
        {/* Modal Header */}
        <div className="bg-[#0c2638]/95 border-b border-cyan-500/25 text-white p-3.5 sm:p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-cyan-500/20 border border-cyan-400/30 rounded-lg">
              <Edit2 className="w-4 h-4 text-cyan-300" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">Edit Collection MR Entry ({collection.mrNo})</h3>
              <p className="text-[11px] text-cyan-200/80">Update Money Receipt details, party allocation, and payment records</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-cyan-500/15 text-lg font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 text-xs">
          {/* Party Search dynamic combobox */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-slate-300 block">Party / Customer Name *:</label>
              <span className="text-[10px] text-slate-400 font-medium">Dynamic searchable list</span>
            </div>
            <div ref={editPartyContainerRef} className="relative">
              <input
                type="text"
                value={partySearchQuery}
                onChange={(e) => {
                  setPartySearchQuery(e.target.value);
                  setPartyName(e.target.value);
                  setIsPartyDropdownOpen(true);
                  setPartyHighlightIdx(0);
                }}
                onFocus={() => {
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
                    if (isPartyDropdownOpen && filteredParties.length > 0) {
                      e.preventDefault();
                      e.stopPropagation();
                      const chosen = filteredParties[partyHighlightIdx] || filteredParties[0];
                      if (chosen) handleSelectParty(chosen);
                    }
                  } else if (e.key === 'Escape') {
                    if (isPartyDropdownOpen) {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsPartyDropdownOpen(false);
                    }
                  }
                }}
                placeholder="Type party name to search..."
                required
                className="w-full p-2 pr-14 border border-cyan-500/30 rounded-lg text-xs font-bold text-white bg-[#061520] placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center space-x-0.5">
                {partySearchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setPartyName('');
                      setPartySearchQuery('');
                      setIsPartyDropdownOpen(true);
                      setPartyHighlightIdx(0);
                    }}
                    className="p-1 text-slate-400 hover:text-rose-300 rounded cursor-pointer"
                    title="Clear party input"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const nextOpen = !isPartyDropdownOpen;
                    if (nextOpen) setPartyHighlightIdx(0);
                    setIsPartyDropdownOpen(nextOpen);
                  }}
                  className="p-1 text-slate-400 hover:text-cyan-300 rounded cursor-pointer"
                  title="Toggle party dropdown"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              {/* Dropdown Popup */}
              {isPartyDropdownOpen && (
                <div
                  ref={editPartyDropdownRef}
                  className="absolute left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto bg-[#081c29] border border-cyan-500/35 rounded-xl shadow-2xl z-50 text-xs divide-y divide-cyan-500/15 text-white"
                >
                  <div className="p-2 bg-[#0c2638] font-bold text-[10px] text-cyan-200 uppercase flex justify-between items-center sticky top-0 z-10 border-b border-cyan-500/25">
                    <span>Parties ({filteredParties.length} found)</span>
                    <button
                      type="button"
                      onClick={() => setIsPartyDropdownOpen(false)}
                      className="text-slate-400 hover:text-rose-300 font-bold"
                    >
                      ✕
                    </button>
                  </div>
                  {filteredParties.length === 0 ? (
                    <div className="p-3 text-slate-400 text-center italic">
                      No matching registered party found. Custom name "{partySearchQuery}" will be used.
                    </div>
                  ) : (
                    filteredParties.map((p, idx) => {
                      const isSelected = partyName.trim().toLowerCase() === p.name.trim().toLowerCase();
                      const isHighlighted = partyHighlightIdx === idx;
                      return (
                        <button
                          key={p.id ? `${p.id}-${idx}` : `party-${idx}`}
                          type="button"
                          data-edit-party-highlighted={isHighlighted}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectParty(p);
                          }}
                          onMouseEnter={() => setPartyHighlightIdx(idx)}
                          className={`w-full text-left p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                            isHighlighted
                              ? isSelected
                                ? 'bg-cyan-500/30 text-white font-bold border-l-4 border-cyan-300 ring-1 ring-inset ring-cyan-300/70'
                                : 'bg-cyan-500/20 text-white font-bold border-l-4 border-cyan-400'
                              : isSelected
                              ? 'bg-cyan-500/15 text-cyan-100 font-bold border-l-4 border-cyan-500/60'
                              : 'hover:bg-cyan-500/[0.06] text-slate-200'
                          }`}
                        >
                          <div>
                            <div className="font-bold text-white">{p.name}</div>
                            <div className="text-[10px] text-slate-400">
                              {p.address || 'No address'} {p.phone ? `| Ph: ${p.phone}` : ''} {p.salespersonName ? `| Rep: ${p.salespersonName}` : ''}
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-cyan-300 shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Date, MR#, Assigned Person */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-300 block">Date (dd.mm.yy) *:</label>
                <button
                  type="button"
                  onClick={handleResetDate}
                  className="text-[10px] font-bold text-cyan-300 hover:text-cyan-200 hover:underline flex items-center space-x-0.5 cursor-pointer"
                  title="Reset date to today"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  <span>Reset</span>
                </button>
              </div>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={mrDate}
                  onChange={(e) => setMrDate(e.target.value)}
                  onBlur={() => {
                    if (mrDate.trim()) {
                      setMrDate(formatDateDDMMYY(mrDate) || mrDate);
                    }
                  }}
                  placeholder="dd.mm.yy"
                  required
                  className="w-full p-2 pr-10 border border-cyan-500/30 rounded-lg font-mono font-bold text-xs bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400"
                />
                <div className="absolute right-2 flex items-center">
                  <input
                    type="date"
                    value={parseDateToISO(mrDate)}
                    onChange={(e) => {
                      if (e.target.value) {
                        setMrDate(formatDateDDMMYY(e.target.value));
                      }
                    }}
                    className="opacity-0 absolute inset-0 w-7 h-7 cursor-pointer z-10"
                    title="Pick Date from Calendar"
                  />
                  <Calendar className="w-4 h-4 text-cyan-300 pointer-events-none" />
                </div>
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-300 block mb-1">MR No *:</label>
              <input
                type="text"
                value={mrNo}
                onChange={(e) => setMrNo(e.target.value)}
                placeholder="e.g. MR-001"
                required
                className="w-full p-2 border border-cyan-500/30 rounded-lg font-mono font-bold text-xs bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400"
              />
            </div>

            <div>
              <label className="font-bold text-slate-300 block mb-1">Assigned Account / Person:</label>
              <select
                value={entityName}
                onChange={(e) => setEntityName(e.target.value)}
                className="w-full p-2 border border-cyan-500/30 rounded-lg font-bold text-xs bg-[#061520] text-white focus:ring-2 focus:ring-cyan-400"
              >
                <optgroup label="Sales Centers / Branch Accounts">
                  {effectiveBranches.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                  {!effectiveBranches.some((b) => b.name === 'Madhupur Sales Center') && (
                    <option value="Madhupur Sales Center">Madhupur Sales Center</option>
                  )}
                </optgroup>
                <optgroup label="Assigned Salespersons / Officers">
                  {(effectiveBranches.some((b) => cleanBranchName(b.name).toLowerCase() === cleanBranchName(entityName).toLowerCase())
                    ? filterSalespersonsByBranch(salespersons, entityName, effectiveBranches)
                    : salespersons
                  ).map((sp) => (
                    <option key={sp.id} value={sp.name}>
                      {sp.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>

          {/* Payment Type & Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-300 block mb-1">Payment Type:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentType('cash')}
                  className={`p-2 rounded-lg border text-xs font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                    paymentType === 'cash'
                      ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/60 shadow ring-1 ring-emerald-400/40'
                      : 'bg-[#081b28] text-slate-300 border-cyan-500/30 hover:bg-[#0e2a3d]'
                  }`}
                >
                  <Wallet className="w-3.5 h-3.5" />
                  <span>Cash</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentType('cheque')}
                  className={`p-2 rounded-lg border text-xs font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                    paymentType === 'cheque'
                      ? 'bg-indigo-500/25 text-indigo-200 border-indigo-400/60 shadow ring-1 ring-indigo-400/40'
                      : 'bg-[#081b28] text-slate-300 border-cyan-500/30 hover:bg-[#0e2a3d]'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Cheque</span>
                </button>
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-300 block mb-1">Collection Amount (Tk) *:</label>
              <input
                type="number"
                step="any"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className="w-full p-2 border border-cyan-500/30 rounded-lg font-mono font-black text-sm bg-[#061520] text-emerald-300 focus:ring-2 focus:ring-emerald-400"
                required
              />
            </div>
          </div>

          {/* Cheque Details */}
          {paymentType === 'cheque' && (
            <div className="bg-indigo-500/10 p-3 rounded-xl border border-indigo-400/30 space-y-2.5">
              <div className="font-bold text-indigo-200 flex items-center space-x-1.5">
                <Landmark className="w-4 h-4 text-indigo-300" />
                <span>Cheque & Bank Information</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="font-bold text-indigo-200 block mb-1">Bank Name:</label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="e.g. Dutch Bangla Bank"
                    className="w-full p-1.5 border border-indigo-400/35 rounded text-xs bg-[#061520] text-white placeholder-slate-400"
                  />
                </div>
                <div>
                  <label className="font-bold text-indigo-200 block mb-1">Cheque No:</label>
                  <input
                    type="text"
                    value={chequeNo}
                    onChange={(e) => setChequeNo(e.target.value)}
                    placeholder="e.g. CQ-99120"
                    className="w-full p-1.5 border border-indigo-400/35 rounded font-mono text-xs bg-[#061520] text-white placeholder-slate-400"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-indigo-200 block">Pass Date:</label>
                    <button
                      type="button"
                      onClick={() => setPassDate(formatDateDDMMYY(new Date().toISOString().split('T')[0]))}
                      className="text-[9px] font-bold text-cyan-300 hover:underline cursor-pointer"
                    >
                      Today
                    </button>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={passDate}
                      onChange={(e) => setPassDate(e.target.value)}
                      onBlur={() => {
                        if (passDate.trim()) {
                          setPassDate(formatDateDDMMYY(passDate) || passDate);
                        }
                      }}
                      placeholder="dd.mm.yy"
                      className="w-full p-1.5 pr-8 border border-indigo-400/35 rounded font-mono text-xs bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-400"
                    />
                    <div className="absolute right-1.5 flex items-center">
                      <input
                        type="date"
                        value={parseDateToISO(passDate)}
                        onChange={(e) => {
                          if (e.target.value) {
                            setPassDate(formatDateDDMMYY(e.target.value));
                          }
                        }}
                        className="opacity-0 absolute inset-0 w-6 h-6 cursor-pointer z-10"
                        title="Pick Date from Calendar"
                      />
                      <Calendar className="w-3.5 h-3.5 text-indigo-300 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Remarks */}
          <div>
            <label className="font-bold text-slate-300 block mb-1">Remarks / Reference:</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Showroom Cash / Order # / Memo"
              className="w-full p-2 border border-cyan-500/30 rounded-lg text-xs bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400"
            />
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-between pt-3 border-t border-cyan-500/20">
            <div>
              {onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    const confirmMsg = `Are you sure you want to delete Collection MR #${collection.mrNo} (${collection.partyName} - ৳${collection.amount})? This will remove this entry and reverse its impact on party ledger balance.`;
                    if (window.confirm(confirmMsg)) {
                      onDelete(collection.id);
                    }
                  }}
                  className="px-3.5 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/40 font-bold rounded-lg cursor-pointer transition-colors flex items-center space-x-1.5"
                  title="Delete this Collection MR"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-300" />
                  <span>Delete MR</span>
                </button>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 font-bold rounded-lg cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black rounded-lg shadow-sm cursor-pointer transition-colors"
              >
                Save Collection Changes
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

interface CollectionSearchComboboxProps {
  collections: CollectionMR[];
  parties: Party[];
  selectedCollectionId: string;
  onSelectCollection: (col: CollectionMR | null) => void;
}

function CollectionSearchCombobox({
  collections,
  parties,
  selectedCollectionId,
  onSelectCollection
}: CollectionSearchComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedCollectionId) {
      const col = collections.find((c) => c.id === selectedCollectionId);
      if (col) {
        const matchedParty = (parties || []).find(
          (p) => p.name.trim().toLowerCase() === (col.partyName || '').trim().toLowerCase()
        );
        const addr = matchedParty?.address ? ` (${matchedParty.address})` : '';
        setSearchTerm(
          `${col.mrNo ? col.mrNo + ' - ' : ''}${col.partyName}${addr} | ৳${col.amount.toLocaleString('en-IN')} | ${formatDateShort(col.date)}`
        );
      }
    } else if (!isOpen) {
      setSearchTerm('');
    }
  }, [selectedCollectionId, collections, parties, isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleEsc(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const rawQuery = searchTerm.trim().toLowerCase();

  const filtered = collections.filter((col) => {
    if (!rawQuery) return true;
    const matchedParty = (parties || []).find(
      (p) => p.name.trim().toLowerCase() === (col.partyName || '').trim().toLowerCase()
    );
    const mrNo = (col.mrNo || '').toLowerCase();
    const partyName = (col.partyName || '').toLowerCase();
    const address = (matchedParty?.address || '').toLowerCase();
    const amountStr = String(col.amount);
    const dateStr = formatDateShort(col.date).toLowerCase();

    return (
      mrNo.includes(rawQuery) ||
      partyName.includes(rawQuery) ||
      address.includes(rawQuery) ||
      amountStr.includes(rawQuery) ||
      dateStr.includes(rawQuery)
    );
  });

  return (
    <div className="relative w-full" ref={containerRef}>
      <label className="text-[11px] font-bold text-purple-200 block mb-1">
        Select Customer Collection from Money Receipts (Search as you type):
      </label>
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
            if (selectedCollectionId) {
              onSelectCollection(null);
            }
          }}
          placeholder="🔍 Type MR#, Customer Name, Address, Amount to search..."
          className="w-full p-2.5 pr-8 border border-cyan-500/30 rounded-lg text-xs font-bold text-white bg-[#061520] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 hover:border-cyan-400/60 transition-colors shadow-xs"
        />
        {searchTerm ? (
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              onSelectCollection(null);
              setIsOpen(false);
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
            title="Clear"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-cyan-300 hover:text-cyan-200 p-0.5 cursor-pointer"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-40 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-[#081c29] border border-cyan-500/35 rounded-xl shadow-2xl divide-y divide-cyan-500/15 text-white animate-in fade-in zoom-in-95 duration-100">
          {filtered.length === 0 ? (
            <div className="p-3 text-xs text-slate-400 text-center italic">
              No matching collections found ({collections.length} available)
            </div>
          ) : (
            filtered.map((col, idx) => {
              const matchedParty = (parties || []).find(
                (p) => p.name.trim().toLowerCase() === (col.partyName || '').trim().toLowerCase()
              );
              const isSelected = col.id === selectedCollectionId;
              return (
                <div
                  key={`${col.id || 'col'}-${idx}`}
                  onClick={() => {
                    onSelectCollection(col);
                    setIsOpen(false);
                  }}
                  className={`p-2.5 text-xs cursor-pointer transition-colors flex items-center justify-between gap-2 ${
                    isSelected ? 'bg-purple-500/20 font-extrabold text-purple-100' : 'hover:bg-cyan-500/10 text-slate-200'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-1.5">
                      {col.mrNo && (
                        <span className="bg-purple-500/25 text-purple-200 border border-purple-400/30 px-1.5 py-0.5 rounded text-[10px] font-mono font-black">
                          {col.mrNo}
                        </span>
                      )}
                      <span className="font-bold truncate text-white">{col.partyName}</span>
                    </div>
                    {matchedParty?.address && (
                      <span className="text-[11px] text-cyan-200/80 font-medium block truncate">
                        📍 {matchedParty.address}
                      </span>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="font-extrabold text-emerald-300 font-mono text-xs block">
                      ৳{col.amount.toLocaleString('en-IN')}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {formatDateShort(col.date)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export const ExpenseManager: React.FC<ExpenseManagerProps> = ({
  expenses,
  setExpenses,
  collections,
  setCollections,
  bankDeposits = [],
  setBankDeposits,
  onDeleteBankDeposit,
  bankList: propsBankList,
  setBankList: propsSetBankList,
  onAddBank: propsOnAddBank,
  onDeleteBank: propsOnDeleteBank,
  onEditBank: propsOnEditBank,
  onEditBankShortCode,
  onResetBanks: propsOnResetBanks,
  accountList: propsAccountList,
  setAccountList: propsSetAccountList,
  onAddAccount: propsOnAddAccount,
  onDeleteAccount: propsOnDeleteAccount,
  onEditAccount: propsOnEditAccount,
  onEditAccountShortCode,
  onResetAccounts: propsOnResetAccounts,
  salespersons,
  allSalespersons,
  parties = [],
  setParties,
  storedBills = [],
  company,
  currentUser,
  branches = [],
  allBranches = [],
  conveyances = [],
  setConveyances,
  initialMode = 'directory',
  onSyncCloud,
  onBack,
  onClose
}) => {
  const effectiveAllBranches = useMemo(
    () => (allBranches && allBranches.length > 0 ? allBranches : branches),
    [allBranches, branches]
  );

  // Master list of all salespersons / marketing officers across the company
  const effectiveAllSalespersons = useMemo(() => {
    const list = allSalespersons && allSalespersons.length > 0 ? allSalespersons : salespersons;
    try {
      const saved = localStorage.getItem('polycables_salespersons');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const merged = [...list];
          parsed.forEach((p: Salesperson) => {
            if (p && p.name && !merged.some((m) => m.name.trim().toLowerCase() === p.name.trim().toLowerCase())) {
              merged.push(p);
            }
          });
          return merged;
        }
      }
    } catch (e) {}
    return list;
  }, [allSalespersons, salespersons]);

  const userBranch = useMemo(() => {
    if (currentUser?.branchId && branches.length) {
      const match = branches.find((b) => b.id === currentUser.branchId);
      if (match) return match;
    }
    const info = getUserBranch(currentUser, effectiveAllSalespersons, branches);
    if (info?.branchId && branches.length) {
      const match = branches.find((b) => b.id === info.branchId);
      if (match) return match;
    }
    if (info?.branchName && branches.length) {
      const cleanTarget = cleanSalesCenterName(info.branchName).toLowerCase();
      const match = branches.find((b) => cleanSalesCenterName(b.name).toLowerCase() === cleanTarget);
      if (match) return match;
    }
    if (info?.branchName) {
      return { id: info.branchId || 'assigned-branch', name: info.branchName, address: '', phone: '', email: '', isHeadOffice: false };
    }
    return null;
  }, [currentUser, branches, effectiveAllSalespersons]);

  const userBranchInfo = useMemo(() => {
    return getUserBranch(currentUser, effectiveAllSalespersons, branches);
  }, [currentUser, effectiveAllSalespersons, branches]);

  const allowedUserBranches = useMemo(
    () => filterBranchesForUser(branches, currentUser, effectiveAllSalespersons),
    [branches, currentUser, effectiveAllSalespersons]
  );
  const canViewAllUserCenters = isStrictSuperAdmin(currentUser) || isSuperAdminOrAgm(currentUser) || isAccountsAdmin(currentUser) || isAnyAdmin(currentUser) || allowedUserBranches.length > 1;

  // Count party occurrences by name to detect duplicate party names across the directory
  const partyNameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    (parties || []).forEach((p) => {
      const key = (p.name || '').trim().toLowerCase();
      if (key) {
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    });
    return counts;
  }, [parties]);

  // Helper to extract clean party name without trailing address or parenthesis artifacts
  const cleanSelectedPartyName = (raw: string): string => {
    if (!raw) return '';
    const trimmed = raw.trim();
    const matchParen = trimmed.match(/^(.*?)\s*\((.*?)\)$/);
    if (matchParen) {
      const candidateName = matchParen[1].trim();
      const p = (parties || []).find((x) => x.name.trim().toLowerCase() === candidateName.toLowerCase());
      if (p) return p.name;
      if (candidateName) return candidateName;
    }
    const matchDash = trimmed.match(/^(.*?)\s*[-—]\s*(.*?)$/);
    if (matchDash) {
      const candidateName = matchDash[1].trim();
      const p = (parties || []).find((x) => x.name.trim().toLowerCase() === candidateName.toLowerCase());
      if (p) return p.name;
    }
    const exact = (parties || []).find((x) => x.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (exact) return exact.name;
    return trimmed;
  };

  // Helper to display clean party name accurately without mangling
  const getPartyDisplayWithAddress = (name: string, fallbackAddress?: string): string => {
    if (!name) return 'N/A';
    return cleanSelectedPartyName(name);
  };

  const initialDefaultEntity = useMemo(() => {
    const isSuperOrAdm =
      isStrictSuperAdmin(currentUser) ||
      isAccountsAdmin(currentUser) ||
      isSuperAdminOrAgm(currentUser) ||
      isAnyAdmin(currentUser);

    if (isSuperOrAdm) {
      return 'All Sales Centers';
    }

    // Non-admin / regular user defaults strictly to their assigned sales center
    if (userBranch?.name) {
      return cleanSalesCenterName(userBranch.name);
    }
    const info = getUserBranch(currentUser, effectiveAllSalespersons, branches);
    if (info?.branchName) {
      return cleanSalesCenterName(info.branchName);
    }
    return 'Madhupur Sales Center';
  }, [currentUser, userBranch, effectiveAllSalespersons, branches]);

  // For Quick Expense Entry:
  // Admin and Super Admin should NOT default Area / Location or Assign Expense To (start empty)
  // For regular logged-in users, default based on their login user context
  const initialQuickExpenseEntity = useMemo(() => {
    try {
      const remembered = localStorage.getItem('polycables_last_assigned_expense_entity');
      if (remembered && remembered.trim()) {
        return remembered.trim();
      }
    } catch (e) {}
    if (isSuperAdminOrAgm(currentUser)) {
      return '';
    }
    const inCharge = isInCharge(currentUser, effectiveAllSalespersons, branches);
    const accountsOrStaff = isAccountsOrStaff(currentUser);
    if (!inCharge && !accountsOrStaff) {
      return currentUser?.name || currentUser?.username || '';
    }
    if (userBranch?.name) {
      return cleanSalesCenterName(userBranch.name);
    }
    return '';
  }, [currentUser, userBranch, effectiveAllSalespersons, branches]);

  const initialQuickExpenseArea = useMemo(() => {
    if (isSuperAdminOrAgm(currentUser)) {
      return '';
    }
    if (userBranch?.address) {
      return userBranch.address.split(',')[0].trim();
    }
    const sp = effectiveAllSalespersons.find((s) => s.name.toLowerCase() === (currentUser?.name || '').toLowerCase());
    if (sp?.areaGroup) {
      return sp.areaGroup;
    }
    return '';
  }, [currentUser, userBranch, effectiveAllSalespersons]);

  const defaultCenterName = initialDefaultEntity;
  const defaultArea = userBranch?.address ? userBranch.address.split(',')[0].trim() : (defaultCenterName.includes('Madhupur') ? 'Madhupur' : 'Sales Area');

  const [activeTab, setActiveTab] = useState<'directory' | 'expense_amount' | 'entry' | 'collection_entry' | 'collection_list' | 'cash_in_hand' | 'cheque_in_hand' | 'deposit_history' | 'report' | 'conveyance'>(
    initialMode === 'entry'
      ? 'entry'
      : initialMode === 'expense_amount'
      ? 'expense_amount'
      : initialMode === 'report'
      ? 'report'
      : initialMode === 'collection_entry'
      ? 'collection_entry'
      : initialMode === 'collection_list'
      ? 'collection_list'
      : initialMode === 'cash_in_hand'
      ? 'cash_in_hand'
      : initialMode === 'cheque_in_hand'
      ? 'cheque_in_hand'
      : initialMode === 'deposit_history'
      ? 'deposit_history'
      : initialMode === 'conveyance'
      ? 'conveyance'
      : 'directory'
  );

  // Deposit History Sub-Tab: 'all' | 'ho_deposited' | 'bank_only'
  const [depositHistorySubTab, setDepositHistorySubTab] = useState<'all' | 'ho_deposited' | 'bank_only'>('all');
  const [expandedDepositBankTagIds, setExpandedDepositBankTagIds] = useState<Record<string, boolean>>({});
  const [, setShortTagVersion] = useState(0);

  useEffect(() => {
    const onShortTagsUpdated = () => setShortTagVersion((v) => v + 1);
    window.addEventListener('polycables_short_tags_updated', onShortTagsUpdated);
    return () => window.removeEventListener('polycables_short_tags_updated', onShortTagsUpdated);
  }, []);

  const toggleDepositBankTagExpand = useCallback((depositId: string) => {
    setExpandedDepositBankTagIds((prev) => ({
      ...prev,
      [depositId]: !prev[depositId]
    }));
  }, []);

  // Internal navigation history stack for ExpenseManager sub-tabs
  const internalTabHistoryRef = useRef<string[]>([]);

  const handleExpenseManagerBack = () => {
    if (internalTabHistoryRef.current.length > 0) {
      const prev = internalTabHistoryRef.current.pop();
      if (prev && prev !== activeTab) {
        setActiveTab(prev as any);
        return;
      }
    }
    if (onBack) {
      onBack();
    }
  };

  const navigateSubTab = (newTab: 'directory' | 'entry' | 'collection_entry' | 'collection_list' | 'cash_in_hand' | 'cheque_in_hand' | 'deposit_history' | 'report') => {
    if (newTab !== activeTab) {
      internalTabHistoryRef.current.push(activeTab);
      setActiveTab(newTab);
    }
  };

  // Helper to identify Head Office (H/O) deposits
  const isHoDeposit = useCallback((d: BankDeposit): boolean => {
    if (!d) return false;
    if (d.isExpenseHoDeposit === true) return true;
    const bName = (d.bankName || '').trim().toUpperCase();
    const dTag = (d.displayTag || '').trim().toUpperCase();
    const sCode = (d.bankShortCode || '').trim().toUpperCase();
    if (bName === 'H/O' || dTag === 'H/O' || sCode === 'H/O') return true;
    const rem = (d.remarks || '').toLowerCase();
    if (rem.includes('h/o settlement') || rem.includes('h/o deposit') || rem.includes('head office expense settlement') || rem.includes('head office')) return true;
    return false;
  }, []);

  // Bank & Account directory modal state
  const [showBankManagerModal, setShowBankManagerModal] = useState<boolean>(false);
  const [showProcedureModal, setShowProcedureModal] = useState<boolean>(false);

  // Local fallback states if not provided via props
  const [localBankList, setLocalBankList] = useState<string[]>(() => {
    const saved = localStorage.getItem('polycables_bank_list');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const sanitized = parsed
            .map((item: any) => (typeof item === 'string' ? item : (item?.name || item?.bankName || '')).trim())
            .filter((item) => !isInvalidBankOrAccount(item));
          if (parsed.length === 0 || sanitized.length > 0) return sanitized;
        }
      } catch (e) {}
    }
    return DEFAULT_BANKS;
  });
  const [localAccountList, setLocalAccountList] = useState<string[]>(() => {
    const saved = localStorage.getItem('polycables_account_list');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const sanitized = parsed
            .map((item: any) => (typeof item === 'string' ? item : (item?.name || item?.accountName || '')).trim())
            .filter((item) => !isInvalidBankOrAccount(item));
          if (parsed.length === 0 || sanitized.length > 0) return sanitized;
        }
      } catch (e) {}
    }
    return DEFAULT_ACCOUNTS;
  });

  const rawBankList = propsBankList || localBankList;
  const rawAccountList = propsAccountList || localAccountList;

  const bankList = useMemo(() => {
    if (!Array.isArray(rawBankList)) return DEFAULT_BANKS;
    const sanitized = rawBankList
      .map((b: any) => (typeof b === 'string' ? b : (b?.name || b?.bankName || '')).trim())
      .filter((b) => !isInvalidBankOrAccount(b));
    return rawBankList.length === 0 || sanitized.length > 0 ? sanitized : DEFAULT_BANKS;
  }, [rawBankList]);

  const accountList = useMemo(() => {
    if (!Array.isArray(rawAccountList)) return DEFAULT_ACCOUNTS;
    const sanitized = rawAccountList
      .map((a: any) => (typeof a === 'string' ? a : (a?.name || a?.accountName || '')).trim())
      .filter((a) => !isInvalidBankOrAccount(a));
    return rawAccountList.length === 0 || sanitized.length > 0 ? sanitized : DEFAULT_ACCOUNTS;
  }, [rawAccountList]);

  const toSafeStr = (v: any) => (typeof v === 'string' ? v : (v?.name || v?.bankName || v?.accountName || String(v || ''))).trim();

  const handleAddBank = (name: string) => {
    const clean = toSafeStr(name);
    if (!clean) return;
    if (propsOnAddBank) {
      propsOnAddBank(clean);
    }
    setLocalBankList((prev) => {
      const safePrev = (prev || []).map(toSafeStr).filter(Boolean);
      if (safePrev.some((b) => b.toLowerCase() === clean.toLowerCase())) return safePrev;
      const next = [clean, ...safePrev];
      localStorage.setItem('polycables_bank_list', JSON.stringify(next));
      return next;
    });
  };

  const handleDeleteBank = (name: string) => {
    const target = toSafeStr(name).toLowerCase();
    if (propsOnDeleteBank) {
      propsOnDeleteBank(name);
    }
    setLocalBankList((prev) => {
      const next = (prev || []).map(toSafeStr).filter((b) => b && b.toLowerCase() !== target);
      localStorage.setItem('polycables_bank_list', JSON.stringify(next));
      return next;
    });
  };

  const handleEditBank = (oldName: string, newName: string) => {
    const clean = toSafeStr(newName);
    if (!clean) return;
    const oldTarget = toSafeStr(oldName).toLowerCase();
    if (propsOnEditBank) {
      propsOnEditBank(oldName, clean);
    }
    setLocalBankList((prev) => {
      const next = (prev || []).map(toSafeStr).filter(Boolean).map((b) => (b.toLowerCase() === oldTarget ? clean : b));
      localStorage.setItem('polycables_bank_list', JSON.stringify(next));
      return next;
    });
  };

  const handleResetBanks = () => {
    if (propsOnResetBanks) {
      propsOnResetBanks();
    }
    setLocalBankList(DEFAULT_BANKS);
    localStorage.setItem('polycables_bank_list', JSON.stringify(DEFAULT_BANKS));
  };

  const handleAddAccount = (name: string) => {
    const clean = toSafeStr(name);
    if (!clean) return;
    if (propsOnAddAccount) {
      propsOnAddAccount(clean);
    }
    setLocalAccountList((prev) => {
      const safePrev = (prev || []).map(toSafeStr).filter(Boolean);
      if (safePrev.some((a) => a.toLowerCase() === clean.toLowerCase())) return safePrev;
      const next = [clean, ...safePrev];
      localStorage.setItem('polycables_account_list', JSON.stringify(next));
      return next;
    });
  };

  const handleDeleteAccount = (name: string) => {
    const target = toSafeStr(name).toLowerCase();
    if (propsOnDeleteAccount) {
      propsOnDeleteAccount(name);
    }
    setLocalAccountList((prev) => {
      const next = (prev || []).map(toSafeStr).filter((a) => a && a.toLowerCase() !== target);
      localStorage.setItem('polycables_account_list', JSON.stringify(next));
      return next;
    });
  };

  const handleEditAccount = (oldName: string, newName: string) => {
    const clean = toSafeStr(newName);
    if (!clean) return;
    const oldTarget = toSafeStr(oldName).toLowerCase();
    if (propsOnEditAccount) {
      propsOnEditAccount(oldName, clean);
    }
    setLocalAccountList((prev) => {
      const next = (prev || []).map(toSafeStr).filter(Boolean).map((a) => (a.toLowerCase() === oldTarget ? clean : a));
      localStorage.setItem('polycables_account_list', JSON.stringify(next));
      return next;
    });
  };

  const handleResetAccounts = () => {
    if (propsOnResetAccounts) {
      propsOnResetAccounts();
    }
    setLocalAccountList(DEFAULT_ACCOUNTS);
    localStorage.setItem('polycables_account_list', JSON.stringify(DEFAULT_ACCOUNTS));
  };

  // Form State for Expense Entry
  const [assignedEntity, setAssignedEntity] = useState<string>(initialQuickExpenseEntity);
  const [filterRecentByAssignee, setFilterRecentByAssignee] = useState<boolean>(true);
  const [entryDate, setEntryDate] = useState<string>(() => formatDateDDMMYY(new Date()));
  const [startDate, setStartDate] = useState<string>(() => {
    try {
      return sessionStorage.getItem('polycables_expense_start_date') || '';
    } catch {
      return '';
    }
  });
  const [endDate, setEndDate] = useState<string>(() => {
    try {
      return sessionStorage.getItem('polycables_expense_end_date') || '';
    } catch {
      return '';
    }
  });
  const [areaName, setAreaName] = useState<string>(initialQuickExpenseArea);
  const [selectedHead, setSelectedHead] = useState<string>(''); // Default Select Category
  const [customHead, setCustomHead] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [fundingPartyName, setFundingPartyName] = useState<string>('');
  const [autoApproveHo, setAutoApproveHo] = useState<boolean>(true);

  // Dynamic Expense Categories with Auto-Numbering (defaulting to standard 31 voucher heads)
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategoryItem[]>(() => {
    try {
      const savedV2 = localStorage.getItem('polycables_expense_categories_v2');
      if (savedV2) {
        const parsed = JSON.parse(savedV2);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item, idx) => {
            if (typeof item === 'string') {
              return { serial: idx + 1, name: item };
            }
            return { serial: item.serial || idx + 1, name: item.name };
          });
        }
      }
    } catch (e) {}
    return DEFAULT_EXPENSE_HEADS.map((name, idx) => ({ serial: idx + 1, name }));
  });

  // Persist expense categories to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('polycables_expense_categories_v2', JSON.stringify(expenseCategories));
      localStorage.setItem('polycables_expense_categories', JSON.stringify(expenseCategories));
    } catch (e) {}
  }, [expenseCategories]);

  // Resolves person name and sales center name based on selected account/filter
  const getEntityDisplayDetails = (entity: string) => {
    if (entity === 'All Sales Centers' || entity === 'All') {
      return { centerName: 'All Sales Centers', personName: 'All Sales Centers', isCenter: true };
    }
    const repClean = cleanSalesCenterName(entity);
    const isCenter =
      repClean === 'Madhupur Sales Center' ||
      repClean === 'Tangail Sales Center' ||
      branches.some((b) => cleanSalesCenterName(b.name) === repClean);

    if (isCenter) {
      // When a sales center is selected (e.g., Tangail Sales Center, Madhupur Sales Center):
      // Both Name fields show the Sales Center name; sales & collection default to "-"
      return { centerName: repClean, personName: repClean, isCenter: true };
    } else {
      // It's a specific marketing officer, accounts, or staff person:
      // Person name is their own name, center name is their marketing-wise assigned sales center
      const person = entity;
      const sp = effectiveAllSalespersons.find((s) => s.name.trim().toLowerCase() === entity.trim().toLowerCase());
      let spCenter = '';
      if (sp?.branchName) {
        spCenter = cleanSalesCenterName(sp.branchName);
      } else if (sp?.branchId) {
        const br = branches.find((b) => b.id === sp.branchId);
        if (br) spCenter = cleanSalesCenterName(br.name);
      } else if (userBranch?.name) {
        spCenter = cleanSalesCenterName(userBranch.name);
      } else {
        spCenter = 'Madhupur Sales Center';
      }
      return { centerName: spCenter, personName: person, isCenter: false };
    }
  };

  // Report Specific Header Fields (matching ex 2.png voucher sheet)
  const initialDetails = useMemo(() => getEntityDisplayDetails(initialDefaultEntity), [initialDefaultEntity, branches, effectiveAllSalespersons]);
  const [reportPersonName, setReportPersonName] = useState<string>(() => initialDetails.personName);
  const [reportSalesCenterName, setReportSalesCenterName] = useState<string>(() => initialDetails.centerName);
  const [reportSalesAmount, setReportSalesAmount] = useState<string>('');
  const [reportCollectionAmount, setReportCollectionAmount] = useState<string>('');

  // Helper to check if a person has individual sales or collections
  const checkPersonHasIndividualSalesOrCollection = useCallback(
    (personName: string, personCode?: string, spObj?: Salesperson) => {
      if (spObj && hasUserTarget(spObj)) return true;
      const pNameLow = (personName || '').trim().toLowerCase();
      const pCodeLow = (personCode || '').trim().toLowerCase();

      // Check stored bills (sales)
      const hasSales = storedBills.some((b) => {
        const bSpName = (b.header?.salespersonName || '').trim().toLowerCase();
        const bSpCode = (b.header?.salesmanCode || '').trim().toLowerCase();
        const bMkt = (b.marketingPerson || '').trim().toLowerCase();
        return (
          (pNameLow && (bSpName === pNameLow || bMkt === pNameLow)) ||
          (pCodeLow && pCodeLow !== 'ic' && bSpCode === pCodeLow)
        ) && (b.grandTotal || 0) > 0;
      });
      if (hasSales) return true;

      // Check collections
      const hasCollection = collections.some((c) => {
        const cMkt = (c.marketingPerson || '').trim().toLowerCase();
        const cEntity = (c.entityName || '').trim().toLowerCase();
        return (
          pNameLow && (cMkt === pNameLow || cEntity === pNameLow)
        ) && (c.amount || 0) > 0;
      });
      if (hasCollection) return true;

      // Check bank deposits
      const hasDeposit = (bankDeposits || []).some((d) => {
        const dMkt = (d.marketingPerson || '').trim().toLowerCase();
        const dEntity = (d.entityName || '').trim().toLowerCase();
        return (
          pNameLow && (dMkt === pNameLow || dEntity === pNameLow)
        ) && (d.amount || 0) > 0;
      });
      if (hasDeposit) return true;

      return false;
    },
    [storedBills, collections, bankDeposits]
  );

  // Available Account options:
  // Shows all Sales Centers / Showrooms + Marketing Officers with sales/collection,
  // and Sales Center staff or accounts if and only if they have individual sales or collection.
  const availableAccountOptions = useMemo(() => {
    const isSuper = isSuperAdminOrAgm(currentUser);
    const isAccAdmin = isAccountsAdmin(currentUser);
    const inCharge = isInCharge(currentUser, effectiveAllSalespersons, branches);
    const accountsOrStaff = isAccountsOrStaff(currentUser);

    // Expense all pages open for all users without factory
    const canSeeAllOfficers = !isFactoryUser(currentUser) || isSuper || isAccAdmin || inCharge || accountsOrStaff || activeTab === 'report' || ['collection_list', 'cash_in_hand', 'cheque_in_hand', 'deposit_history'].includes(activeTab);

    if (!canSeeAllOfficers) {
      const myName = currentUser?.name || currentUser?.username || 'My Account';
      return [{ type: 'user' as const, label: myName, value: myName, branchName: userBranchInfo.branchName }];
    }

    const options: { type: 'branch' | 'user'; label: string; value: string; branchName?: string }[] = [];

    // All Sales Centers option: Super Admin, Accounts Admin, or Regional Admin with multiple centers
    if (canViewAllUserCenters) {
      options.push({
        type: 'branch',
        label: isSuper || isAccAdmin ? 'All Sales Centers' : `All My Centers (${allowedUserBranches.length})`,
        value: 'All Sales Centers'
      });
    }

    // 1. Sales Centers / Showrooms (Branches)
    const branchNamesSet = new Set<string>();
    const branchSource = (isSuper || isAccAdmin) ? branches : (allowedUserBranches.length > 0 ? allowedUserBranches : []);
    if (branchSource.length > 0) {
      branchSource.forEach((b) => {
        const cleanName = cleanSalesCenterName(b.name);
        const lower = cleanName.toLowerCase();
        if (
          cleanName &&
          b.id !== 'branch-main' &&
          !lower.includes('polycables store') &&
          !lower.includes('billing portal')
        ) {
          branchNamesSet.add(cleanName);
        }
      });
    }
    if (branchNamesSet.size === 0) {
      const userAssignedBranchName = cleanSalesCenterName(userBranch?.name || userBranchInfo.branchName || 'Madhupur Sales Center');
      branchNamesSet.add(userAssignedBranchName);
    }

    const sortedBranchNames = Array.from(branchNamesSet).sort((a, b) => a.localeCompare(b));
    sortedBranchNames.forEach((bName) => {
      options.push({ type: 'branch', label: bName, value: bName });
    });

    // 2. Marketing Officers & Staff (only show those who have individual sales or collection, scoped to allowedUserBranches)
    const seenUsers = new Set<string>();
    const userOptions: { type: 'user'; label: string; value: string; branchName?: string }[] = [];
    const allowedOfficerSet = new Set(
      (isSuper || isAccAdmin
        ? effectiveAllSalespersons
        : filterSalespersonsByBranch(effectiveAllSalespersons, 'ALL', allowedUserBranches, currentUser)
      ).map((s) => (s.id || s.name || '').toLowerCase().trim())
    );

    effectiveAllSalespersons.forEach((sp) => {
      if (!sp || !sp.name || !sp.name.trim()) return;
      const cleanName = sp.name.trim();
      const lower = cleanName.toLowerCase();
      if (seenUsers.has(lower)) return;

      // If user is not super/accounts admin, ONLY show salespersons belonging to user's assigned sales centers
      if (!isSuper && !isAccAdmin) {
        const keyId = (sp.id || sp.name || '').toLowerCase().trim();
        if (!allowedOfficerSet.has(keyId)) return;
      }

      const isStaffOrAccounts = isAccountsOrStaff(sp) || !isMarketingOfficer(sp);
      const hasSalesOrCol = checkPersonHasIndividualSalesOrCollection(cleanName, sp.code, sp);
      const hasExpenseEntry = expenses.some(
        (exp) =>
          (exp.entityName || '').trim().toLowerCase() === lower ||
          ((exp as any).assignedEntity || '').trim().toLowerCase() === lower
      );
      if (!hasSalesOrCol && !hasExpenseEntry) {
        return;
      }

      seenUsers.add(lower);
      userOptions.push({
        type: 'user',
        label: sp.code && sp.code.toLowerCase() !== 'ic' ? `${cleanName} (${sp.code})` : cleanName,
        value: cleanName,
        branchName: sp.branchName ? cleanSalesCenterName(sp.branchName) : 'Madhupur Sales Center',
      });
    });

    // Also include any custom entity / assignee present in saved expenses so filters never drop assigned expenses
    expenses.forEach((exp) => {
      const eName = (exp.entityName || (exp as any).assignedEntity || '').trim();
      if (!eName) return;
      const eLow = eName.toLowerCase();
      if (seenUsers.has(eLow) || branchNamesSet.has(cleanSalesCenterName(eName))) return;
      if (options.some((o) => o.value.toLowerCase() === eLow || o.value.toLowerCase() === cleanSalesCenterName(eName).toLowerCase())) return;
      seenUsers.add(eLow);
      userOptions.push({
        type: 'user',
        label: eName,
        value: eName,
        branchName: exp.branchName ? cleanSalesCenterName(exp.branchName) : undefined
      });
    });

    // Sort userOptions alphabetically by label/name
    userOptions.sort((a, b) => a.label.localeCompare(b.label));

    // Combine branches and user options
    options.push(...userOptions);

    return options;
  }, [currentUser, effectiveAllSalespersons, branches, allowedUserBranches, canViewAllUserCenters, collections, expenses, storedBills, activeTab, checkPersonHasIndividualSalesOrCollection, userBranch, userBranchInfo]);

  const groupedAccountOptions = useMemo(() => {
    const branchOpts = availableAccountOptions.filter((opt) => opt.type === 'branch');
    const userOpts = availableAccountOptions.filter((opt) => opt.type === 'user');
    return { branches: branchOpts, users: userOpts };
  }, [availableAccountOptions]);

  const accountFilterSearchOptions = useMemo<SalesCenterOption[]>(() => {
    return availableAccountOptions.map((opt) => ({
      id: opt.value,
      name: opt.label,
      label: opt.label,
      group: opt.type === 'branch' ? 'Sales Centers / Showrooms' : 'Marketing Officers / Staff'
    }));
  }, [availableAccountOptions]);

  // Banks and Bank Accounts that actually have deposit records (excluding empty ones)
  const banksWithDeposits = useMemo(() => {
    const bankSet = new Set<string>();
    const accountSet = new Set<string>();
    (bankDeposits || []).forEach((d) => {
      if ((d.amount || 0) > 0 || (d.collections && d.collections.length > 0)) {
        if (d.bankName && d.bankName.trim()) bankSet.add(d.bankName.trim());
        if (d.accountName && d.accountName.trim()) accountSet.add(d.accountName.trim());
      }
    });
    return {
      banks: Array.from(bankSet).sort(),
      accounts: Array.from(accountSet).sort()
    };
  }, [bankDeposits]);

  const cashInHandSearchOptions = useMemo<SalesCenterOption[]>(() => {
    const list: SalesCenterOption[] = [...accountFilterSearchOptions];
    if (banksWithDeposits.accounts.length > 0) {
      banksWithDeposits.accounts.forEach((acc) => {
        list.push({ id: acc, name: acc, label: acc, group: 'Bank Accounts (With Deposits)' });
      });
    }
    if (banksWithDeposits.banks.length > 0) {
      banksWithDeposits.banks.forEach((b) => {
        list.push({ id: b, name: b, label: b, group: 'Banks (With Deposits)' });
      });
    }
    return list;
  }, [accountFilterSearchOptions, banksWithDeposits]);

  const renderAccountSelectOptions = () => {
    return (
      <>
        <option value="All Sales Centers">All Sales Centers</option>
        {groupedAccountOptions.branches.filter((opt) => opt.value !== 'All Sales Centers').length > 0 && (
          <optgroup label="Sales Centers / Showrooms">
            {groupedAccountOptions.branches.filter((opt) => opt.value !== 'All Sales Centers').map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </optgroup>
        )}
        {groupedAccountOptions.users.length > 0 && (
          <optgroup label="Marketing Officers / Associates">
            {groupedAccountOptions.users.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </optgroup>
        )}
      </>
    );
  };

  const formatDateShortYY = (dStr: string) => {
    if (!dStr) return '';
    const d = formatDateDDMMYY(dStr);
    const parts = d.split('.');
    if (parts.length === 3) {
      const yy = parts[2].length === 4 ? parts[2].slice(-2) : parts[2];
      return `${parts[0].padStart(2, '0')}.${parts[1].padStart(2, '0')}.${yy}`;
    }
    return d;
  };

  const handleResetTo31StandardHeads = () => {
    const std = DEFAULT_EXPENSE_HEADS.map((name, idx) => ({ serial: idx + 1, name }));
    setExpenseCategories(std);
    try {
      localStorage.setItem('polycables_expense_categories_v2', JSON.stringify(std));
      localStorage.setItem('polycables_expense_categories', JSON.stringify(std));
    } catch (e) {}
    onSyncCloud?.({ expenseCategories: std }, true);
    showNotify('success', 'Reset expense categories to standard 31 voucher heads.');
  };

  // Synchronize any existing expense entries having categories not in list
  useEffect(() => {
    if (!expenses || expenses.length === 0) return;
    setExpenseCategories((prev) => {
      const existingNames = new Set<string>(prev.map((c) => c.name.toLowerCase()));
      const newItems: ExpenseCategoryItem[] = [];
      let maxSerial = prev.reduce((max, c) => Math.max(max, c.serial || 0), 0);

      const existingArray = Array.from(existingNames);
      const isVariantOfExisting = (head: string) => {
        const h = head.toLowerCase();
        for (const name of existingArray) {
          if (name.includes(h) || h.includes(name)) return true;
          if (h.includes('decoration') && name.includes('decoration')) return true;
          if (h.includes('trade licen') && name.includes('trade licen')) return true;
          if ((h.includes('electricity') || h.includes('electricty')) && name.includes('electri')) return true;
          if (h.includes('prize money') && name.includes('prize money')) return true;
          if (h.includes('internet') && name.includes('internet')) return true;
          if ((h.includes('rent') || h.includes('sales center rent')) && name.includes('rent')) return true;
          if ((h.includes('refreshment') || h.includes('rerreshment')) && (name.includes('refreshment') || name.includes('rerreshment'))) return true;
          if ((h.includes('labour') || h.includes('wages')) && (name.includes('labour') || name.includes('wages'))) return true;
        }
        return false;
      };

      for (const exp of expenses) {
        const raw = (exp.expenseHead || '').trim();
        if (!raw || raw.toLowerCase() === 'select category') continue;
        const clean = raw.replace(/^\d+[\.\s\-]+/, '').trim();
        const target = clean || raw;
        if (!existingNames.has(target.toLowerCase()) && !isVariantOfExisting(target)) {
          existingNames.add(target.toLowerCase());
          newItems.push({ serial: ++maxSerial, name: target });
        }
      }

      if (newItems.length > 0) {
        return [...prev, ...newItems];
      }
      return prev;
    });
  }, [expenses]);

  // Keyboard navigation input refs for sequential Enter key workflow
  const assignExpenseTriggerRef = useRef<HTMLDivElement>(null);
  const assigneeSelectRef = useRef<HTMLSelectElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const areaInputRef = useRef<HTMLInputElement>(null);
  const categoryInputRef = useRef<HTMLInputElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const remarksInputRef = useRef<HTMLInputElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  // Auto-focus Assign Expense To when Quick Expense Entry opens
  useEffect(() => {
    if (activeTab === 'entry') {
      const timer = setTimeout(() => {
        assignExpenseTriggerRef.current?.focus();
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [activeTab]);

  // Guard against duplicate rapid submissions
  const isSavingExpenseRef = useRef<boolean>(false);
  const lastExpenseSubmitRef = useRef<{ timestamp: number; signature: string }>({ timestamp: 0, signature: '' });
  const [isSavingExpense, setIsSavingExpense] = useState<boolean>(false);

  // Edit Expense states and Directory Print Modal
  const [editingExpense, setEditingExpense] = useState<ExpenseEntry | null>(null);
  const [editModalExpense, setEditModalExpense] = useState<ExpenseEntry | null>(null);
  const [showDirectoryPrintPreviewModal, setShowDirectoryPrintPreviewModal] = useState<boolean>(false);
  const [showCategoryManagerModal, setShowCategoryManagerModal] = useState<boolean>(false);

  // Computed month period string e.g., "From: 01.01.25 To: 31.01.25"
  const monthRange = `From: ${formatDateDDMMYY(startDate)} To: ${formatDateDDMMYY(endDate)}`;

  // Quick Time Period Presets matching Unified Filter Bar (sticky within session)
  const [periodPreset, setPeriodPreset] = useState<'this_month' | 'last_month' | 'this_year' | 'last_year' | 'all' | 'custom'>(() => {
    try {
      const saved = sessionStorage.getItem('polycables_expense_period_preset');
      if (saved === 'this_month' || saved === 'last_month' || saved === 'this_year' || saved === 'last_year' || saved === 'all' || saved === 'custom') {
        return saved;
      }
    } catch {}
    return 'all';
  });

  useEffect(() => {
    try {
      sessionStorage.setItem('polycables_expense_period_preset', periodPreset);
      sessionStorage.setItem('polycables_expense_start_date', startDate);
      sessionStorage.setItem('polycables_expense_end_date', endDate);
    } catch {}
  }, [periodPreset, startDate, endDate]);

  const nowForFilter = new Date();
  const runningYyyy = nowForFilter.getFullYear();
  const runningYy = String(runningYyyy).slice(-2);
  const runningMm = String(nowForFilter.getMonth() + 1).padStart(2, '0');
  const runningLastDay = new Date(runningYyyy, nowForFilter.getMonth() + 1, 0).getDate();
  const prevMonthDate = new Date(runningYyyy, nowForFilter.getMonth() - 1, 1);
  const prevMm = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
  const prevYy = String(prevMonthDate.getFullYear()).slice(-2);
  const prevLastDay = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0).getDate();

  const handleSelectPeriodPreset = (p: 'this_month' | 'last_month' | 'this_year' | 'last_year' | 'all' | 'custom') => {
    setPeriodPreset(p);
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    if (p === 'this_month') {
      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);
      setStartDate(formatDateDDMMYY(first));
      setEndDate(formatDateDDMMYY(last));
    } else if (p === 'last_month') {
      const first = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0);
      setStartDate(formatDateDDMMYY(first));
      setEndDate(formatDateDDMMYY(last));
    } else if (p === 'this_year') {
      setStartDate(formatDateDDMMYY(`${y}-01-01`));
      setEndDate(formatDateDDMMYY(`${y}-12-31`));
    } else if (p === 'last_year') {
      setStartDate(formatDateDDMMYY(`${y - 1}-01-01`));
      setEndDate(formatDateDDMMYY(`${y - 1}-12-31`));
    } else if (p === 'all') {
      setStartDate('');
      setEndDate('');
    }
  };

  const setPeriodThisMonth = () => handleSelectPeriodPreset('this_month');
  const setPeriodLastMonth = () => handleSelectPeriodPreset('last_month');
  const setPeriodThisYear = () => handleSelectPeriodPreset('this_year');
  const setPeriodAll = () => handleSelectPeriodPreset('all');

  // Excel (.xlsx) Import Ref & Handler for Collection List & Deposit History
  const xlsxFileInputRef = useRef<HTMLInputElement>(null);
  const depositXlsxFileInputRef = useRef<HTMLInputElement>(null);

  const [collectionSuccessModal, setCollectionSuccessModal] = useState<{
    count: number;
    totalAmount: number;
    startingMr: string;
    nextMr: string;
    date: string;
    paymentType: string;
    savedItems: { partyName: string; amount: number; mrNo: string }[];
  } | null>(null);

  const wasCollectionModalOpenRef = useRef<boolean>(false);

  // Auto close collection success modal after 1s per user requirement and reset focus to Field 1
  useEffect(() => {
    if (collectionSuccessModal) {
      wasCollectionModalOpenRef.current = true;
      const timer = setTimeout(() => {
        setCollectionSuccessModal(null);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (wasCollectionModalOpenRef.current && activeTab === 'collection_entry') {
      wasCollectionModalOpenRef.current = false;
      const focusTimer = setTimeout(() => {
        mrDateInputRef.current?.focus();
        mrDateInputRef.current?.select();
      }, 50);
      return () => clearTimeout(focusTimer);
    }
  }, [collectionSuccessModal, activeTab]);

  // Duplicate collection confirmation modal states
  const [collectionDupConfirmModal, setCollectionDupConfirmModal] = useState<{
    isOpen: boolean;
    dupInfo: CollectionDuplicateResult;
    pendingCollection: CollectionMR;
  } | null>(null);

  const [excelImportDupModal, setExcelImportDupModal] = useState<{
    isOpen: boolean;
    allRecords: CollectionMR[];
    uniqueRecords: CollectionMR[];
    duplicateRecords: { record: CollectionMR; reason: string; existing: CollectionMR }[];
  } | null>(null);

  const [importedPartiesNeedCorrection, setImportedPartiesNeedCorrection] = useState<string[]>([]);

  // Never auto-create extra parties in Customer Directory on Excel collection import
  const processNewPartiesFromImport = (_records: CollectionMR[]): string[] => {
    return [];
  };

  const handleImportCollectionsXlsx = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        
        // Read as 2D array first to find the true header row
        const rawGrid = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
        if (!rawGrid || rawGrid.length === 0) {
          showNotify('error', 'The uploaded Excel file is empty or invalid.');
          return;
        }

        // Search first 15 rows to find the actual header row
        let headerRowIndex = 0;
        let bestHeaderScore = 0;

        const headerKeywords = [
          'amount', 'amt', 'collection', 'taka', 'tk', 'টাকা', 'পরিমাণ', 'date', 'তারিখ',
          'party', 'customer', 'নাম', 'পার্টি', 'mr', 'receipt', 'sl', 'bank', 'cheque', 'note'
        ];

        for (let r = 0; r < Math.min(15, rawGrid.length); r++) {
          const rowCells = rawGrid[r];
          if (!Array.isArray(rowCells)) continue;
          let score = 0;
          rowCells.forEach((cell) => {
            const str = String(cell || '').toLowerCase().trim();
            if (headerKeywords.some((k) => str.includes(k))) {
              score++;
            }
          });
          if (score > bestHeaderScore) {
            bestHeaderScore = score;
            headerRowIndex = r;
          }
        }

        // Convert with the detected header row
        const data = XLSX.utils.sheet_to_json<any>(sheet, {
          range: headerRowIndex,
          defval: ''
        });

        if (!data || data.length === 0) {
          showNotify('error', 'No data rows found in the uploaded Excel file.');
          return;
        }

        const newRecords: CollectionMR[] = [];
        const newDeposits: BankDeposit[] = [];

        // Exact date and amount keywords to prevent collisions
        const dateKeywords = [
          'collectiondate', 'mrdate', 'txdate', 'voucherdate', 'entrydate', 'passdate', 'date', 'dt', 'তারিখ', 'দিন'
        ];

        const amountKeywords = [
          'collectionamount', 'collamount', 'amounttk', 'mramount', 'টাকারপরিমাণ', 'কালেকশনটাকা', 'জমাটাকা', 'receivedamount', 'netamount', 'totalamount', 'paidamount',
          'amount', 'amt', 'cash', 'cashamount', 'cashinhand', 'inhand', 'collected', 'collection', 'credit', 'receiptamount', 'cashcollection',
          'টাকা', 'পরিমাণ', 'received', 'recv', 'taka', 'tk', 'bdt', 'payment', 'paid', 'total', 'money', 'কালেকশন', 'জমা', 'মূল্য'
        ];

        const mrNoKeywords = [
          'mrno', 'mr', 'receiptno', 'receipt', 'sl', 'slno', 'voucherno', 'vno', 'memo', 'নং', 'ভাউচার', 'সিরিয়াল'
        ];

        const partyKeywords = [
          'partyname', 'party', 'customer', 'customername', 'client', 'account', 'accname', 'নাম', 'পার্টি', 'গ্রাহক', 'দোকানেরনাম'
        ];

        const entityKeywords = [
          'assignedaccount', 'entity', 'salesperson', 'entityname', 'center', 'marketing', 'salesman', 'বিক্রেতা'
        ];

        const typeKeywords = [
          'type', 'paymenttype', 'paytype', 'mode', 'paymentmode', 'ধরন', 'পদ্ধতি'
        ];

        const bankKeywords = [
          'bank', 'bankname', 'bank_name', 'ব্যাংক', 'ব্যাংকনাম'
        ];

        const accountKeywords = [
          'account', 'accountname', 'account_name', 'accname', 'acc', 'hisaab', 'হিসাব', 'হিসাবনং', 'tag', 'banktag', 'shorttag', 'ট্যাগ'
        ];

        const chequeNoKeywords = [
          'chequeno', 'cheque', 'cqno', 'chkno', 'চেক'
        ];

        const passDateKeywords = [
          'passdate', 'cleardate', 'চেকপাস'
        ];

        const remarksKeywords = [
          'remarks', 'note', 'ref', 'reference', 'বিবরণ', 'মন্তব্য'
        ];

        const firstRowKeys = Object.keys(data[0] || {});
        const hasExplicitAmountColumn = firstRowKeys.some((k) => {
          const cleanedK = k.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]/g, '');
          if (['date', 'dt', 'তারিখ', 'দিন', 'mr', 'party', 'salesman', 'name', 'phone'].some((ex) => cleanedK.includes(ex))) {
            return false;
          }
          return amountKeywords.some((c) => {
            const cleanedC = c.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]/g, '');
            return cleanedK.includes(cleanedC) || cleanedC.includes(cleanedK);
          });
        });

        const isSummaryText = (str: any): boolean => {
          const clean = String(str || '').trim().toLowerCase();
          if (!clean) return false;
          return (
            /^(total|grand\s*total|sub\s*total|subtotal|net\s*total|মোট|সর্বমোট|total\s*amount|total\s*collection|total\s*taka|total\s*tk|total\s*cash|closing\s*balance|opening\s*balance|balance)[\s:：.-]*$/i.test(clean) ||
            /^(total|grand\s*total|sub\s*total|net\s*total|মোট|সর্বমোট)[\s:：.-]/i.test(clean)
          );
        };
        const summaryRowRegex = /^(total|grand\s*total|sub\s*total|subtotal|net\s*total|মোট|সর্বমোট|total\s*amount|total\s*collection|total\s*taka|total\s*tk|total\s*cash|closing\s*balance|opening\s*balance|balance)[\s:：.-]*$/i;

        const effectiveBankList = bankList && bankList.length > 0 ? bankList : DEFAULT_BANKS;
        const effectiveAccountList = accountList && accountList.length > 0 ? accountList : DEFAULT_ACCOUNTS;
        const mrCalcWorkingList: CollectionMR[] = [...collections];

        data.forEach((row, idx) => {
          const keys = Object.keys(row);

          // Skip if any cell in the row is a Total / Summary label
          const isSummaryRow = keys.some((k) => isSummaryText(row[k]));
          if (isSummaryRow) return;

          const findVal = (colNames: string[], excludeWords: string[] = []) => {
            const key = keys.find((k) => {
              const cleanedK = k.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]/g, '');
              if (excludeWords.some((ex) => cleanedK.includes(ex))) return false;
              return colNames.some((c) => {
                const cleanedC = c.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]/g, '');
                return cleanedK.includes(cleanedC) || cleanedC.includes(cleanedK);
              });
            });
            return key !== undefined ? row[key] : '';
          };

          const rawDate = findVal(dateKeywords);
          const rawMrNo = findVal(mrNoKeywords, ['date', 'amount', 'party']);
          const rawParty = findVal(partyKeywords, ['date', 'amount', 'salesman']);
          const rawEntity = findVal(entityKeywords, ['date', 'amount', 'party']);
          const rawType = findVal(typeKeywords, ['date', 'amount']);
          const rawBank = findVal(bankKeywords, ['date', 'amount']);
          const rawAccount = findVal(accountKeywords, ['date', 'amount', 'party']);
          const rawChequeNo = findVal(chequeNoKeywords, ['date', 'amount']);
          const rawPassDate = findVal(passDateKeywords);
          
          // Amount column MUST NOT match date/party/salesman columns
          let rawAmount = findVal(amountKeywords, ['date', 'dt', 'তারিখ', 'দিন', 'mr', 'party', 'salesman', 'name', 'phone']);
          const rawRemarks = findVal(remarksKeywords, ['date', 'amount']);

          let parsedAmount = parseExcelAmount(rawAmount);

          // Only scan remaining columns if the sheet did NOT have a named amount column
          if (!hasExplicitAmountColumn && parsedAmount <= 0) {
            for (const k of keys) {
              const cleanK = k.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]/g, '');
              if (['date', 'dt', 'tx', 'mr', 'sl', 'phone', 'mobile', 'cell', 'party', 'name', 'নাম', 'তারিখ'].some(ex => cleanK.includes(ex))) {
                continue;
              }
              const val = row[k];
              if (isExcelDateValue(val)) continue;
              const testAmt = parseExcelAmount(val);
              if (testAmt > 0) {
                parsedAmount = testAmt;
                break;
              }
            }
          }

          if (parsedAmount <= 0) return;

          // Validate Party Name: skip blank party rows (such as bottom Total rows) or repeated header rows
          const cleanPartyName = String(rawParty ?? '').trim();
          if (
            !cleanPartyName ||
            cleanPartyName === '-' ||
            cleanPartyName === '0' ||
            summaryRowRegex.test(cleanPartyName) ||
            /^(party|party\s*name|customer|customer\s*name|client|নাম|পার্টি|গ্রাহক|imported\s*customer|unknown\s*party)$/i.test(cleanPartyName)
          ) {
            return;
          }

          const parsedDate = parseExcelDateToISO(rawDate);
          const pTypeStr = String(rawType).toLowerCase();
          const isChequeExplicit = pTypeStr.includes('cq') || pTypeStr.includes('cheque') || pTypeStr.includes('check') || pTypeStr.includes('চেক');
          // When importing on Cheque In Hand tab, ensure only cheques are imported and stored
          const isChequeTab = activeTab === 'cheque_in_hand';
          const hasRawChqNo = Boolean(String(rawChequeNo || '').trim() && String(rawChequeNo || '').trim() !== '-' && String(rawChequeNo || '').trim() !== '0');

          if (isChequeTab && (pTypeStr === 'cash' || pTypeStr.includes('cash')) && !hasRawChqNo && !isChequeExplicit) {
            // Strictly skip cash records on Cheque page to store and display ONLY cheques
            return;
          }

          const paymentType: 'cash' | 'cheque' = isChequeTab ? 'cheque' : ((activeTab === 'cash_in_hand' && !isChequeExplicit) ? 'cash' : (isChequeExplicit ? 'cheque' : 'cash'));

          const matchedParty = (parties || []).find(
            (p) => p.name.trim().toLowerCase() === cleanPartyName.toLowerCase()
          );

          const rawEntityStr = String(rawEntity).trim();
          const rowTargetCenterName =
            rawEntityStr ||
            matchedParty?.branchName ||
            defaultCollectionAssignedEntity ||
            (userBranch?.name ? cleanSalesCenterName(userBranch.name) : 'Madhupur Sales Center');
          const resolvedRowCenterName =
            resolveEntityToSalesCenter(rowTargetCenterName, effectiveAllBranches, effectiveAllSalespersons) ||
            cleanSalesCenterName(rowTargetCenterName) ||
            'Madhupur Sales Center';
          const resolvedRowBranch =
            effectiveAllBranches.find(
              (b) =>
                cleanSalesCenterName(b.name).toLowerCase() === resolvedRowCenterName.toLowerCase() ||
                b.id === matchedParty?.branchId
            ) || userBranch;
          const resolvedRowBranchId = resolvedRowBranch?.id || matchedParty?.branchId || (effectiveAllBranches && effectiveAllBranches.length > 0 ? effectiveAllBranches[0].id : 'branch-1');

          let finalMrNo = String(rawMrNo).trim();
          if (!finalMrNo || finalMrNo === '-' || finalMrNo === '0') {
            const seqMr = computeNextSalesCenterMrNo(
              mrCalcWorkingList,
              resolvedRowCenterName,
              effectiveAllBranches,
              parties,
              effectiveAllSalespersons
            );
            finalMrNo = isChequeTab ? `CQ-${seqMr}` : seqMr;
          }

          // Bank & Account Auto-Deposit Detection
          const rawBankStr = String(rawBank || '').trim();
          const rawAccountStr = String(rawAccount || '').trim();
          const rawRemarksStr = String(rawRemarks || '').trim();
          const fullRowText = `${rawBankStr} ${rawAccountStr} ${rawRemarksStr}`.toLowerCase();

          let detectedBank = '';
          let detectedAccount = '';

          if (rawBankStr) {
            detectedBank = resolveFullBankName(rawBankStr, effectiveBankList);
          }
          if (rawAccountStr) {
            detectedAccount = resolveFullAccountName(rawAccountStr, effectiveAccountList);
          }

          // Detect combined bank & account patterns (e.g. "PBL (PE)", "DBBL (ZE)", "Pubali (PE)")
          if (!detectedBank || !detectedAccount) {
            const tagMatch = fullRowText.match(/\b(pbl|dbbl|ibbl|cbl|ebl|pubali|dutch|islami)\s*[\(\/_\-\s]\s*(pe|ze|padma|zahid)\b/i);
            if (tagMatch) {
              const bToken = tagMatch[1];
              const aToken = tagMatch[2];
              if (!detectedBank) detectedBank = resolveFullBankName(bToken, effectiveBankList);
              if (!detectedAccount) detectedAccount = resolveFullAccountName(aToken, effectiveAccountList);
            }
          }

          if (detectedBank && !detectedAccount) {
            if (fullRowText.includes('padma') || fullRowText.includes('(pe)') || fullRowText.includes(' pe')) {
              detectedAccount = resolveFullAccountName('Padma Enterprise', effectiveAccountList);
            } else if (fullRowText.includes('zahid') || fullRowText.includes('(ze)') || fullRowText.includes(' ze')) {
              detectedAccount = resolveFullAccountName('Zahid Enterprise', effectiveAccountList);
            } else if (rawAccountStr) {
              detectedAccount = resolveFullAccountName(rawAccountStr, effectiveAccountList);
            }
          }

          const isBankDepositAuto = Boolean(detectedBank && detectedAccount);
          let newDepId: string | undefined = undefined;
          let displayTag: string | undefined = undefined;

          if (isBankDepositAuto) {
            const bShort = getBankShortCode(detectedBank);
            const aShort = getAccountShortCode(detectedAccount);
            displayTag = generateDisplayTag(detectedBank, detectedAccount) || `${bShort} (${aShort})`;
            newDepId = `dep-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`;

            const newDep: BankDeposit = {
              id: newDepId,
              date: parsedDate,
              depositDate: parsedDate,
              entityName: resolvedRowCenterName,
              customerName: cleanPartyName,
              partyName: cleanPartyName,
              voucherNo: finalMrNo,
              customerAddress: matchedParty?.address || '',
              marketingPerson: matchedParty?.salespersonName || resolvedRowCenterName,
              salesmanCode: matchedParty?.salesmanCode || undefined,
              bankName: detectedBank,
              accountName: detectedAccount,
              bankShortCode: bShort,
              accountShortCode: aShort,
              displayTag,
              amount: parsedAmount,
              remarks: rawRemarksStr || 'Imported via Excel Collection List',
              emailSent: false,
              branchId: resolvedRowBranchId,
              branchName: resolvedRowCenterName
            };
            newDeposits.push(newDep);
          }

          const importedColRecord: CollectionMR = {
            id: `col-import-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
            date: parsedDate,
            mrNo: finalMrNo,
            entityName: resolvedRowCenterName,
            branchId: resolvedRowBranchId,
            branchName: resolvedRowCenterName,
            partyName: cleanPartyName,
            paymentType,
            bankName: detectedBank || (String(rawBank).trim() || undefined),
            chequeNo: (String(rawChequeNo).trim() && String(rawChequeNo).trim() !== '-' && String(rawChequeNo).trim() !== '0')
              ? String(rawChequeNo).trim()
              : (paymentType === 'cheque' ? `CQ-${Date.now().toString().slice(-4)}-${idx + 1}` : undefined),
            passDate: rawPassDate ? parseExcelDateToISO(rawPassDate) : undefined,
            amount: parsedAmount,
            remarks: rawRemarksStr || '',
            isDeposited: isBankDepositAuto,
            bankDepositId: newDepId,
            depositDate: isBankDepositAuto ? parsedDate : undefined,
            depositBankTag: displayTag
          };
          newRecords.push(importedColRecord);
          mrCalcWorkingList.push(importedColRecord);
        });

        // Guard against a trailing Total row whose amount equals the sum of all previous imported rows or has a summary party name
        if (newRecords.length > 2) {
          const lastRec = newRecords[newRecords.length - 1];
          const sumPrev = newRecords.slice(0, -1).reduce((s, r) => s + (Number(r.amount) || 0), 0);
          if ((sumPrev > 0 && Math.abs((Number(lastRec.amount) || 0) - sumPrev) <= 1.0) || isSummaryText(lastRec.partyName)) {
            newRecords.pop();
            if (newDeposits.length > 0 && newDeposits[newDeposits.length - 1].voucherNo === lastRec.mrNo) {
              newDeposits.pop();
            }
          }
        }

        if (newRecords.length === 0) {
          showNotify('error', 'No valid collection records with amounts were found in the Excel sheet.');
          return;
        }

        // When importing a Collection List (.xlsx), the imported records represent the authoritative list.
        // Same party, same amount, and same date are valid separate collections and NOT duplicates!
        const updated = newRecords;
        setCollections(updated);
        try {
          localStorage.setItem('polycables_collections', JSON.stringify(updated));
        } catch (e) {}

        // Save auto-created bank deposits if present
        if (newDeposits.length > 0 && setBankDeposits) {
          const currentExistingDeposits = (bankDeposits || []).filter(
            (d) => d && !d.isAutoDeposit && !String(d.id || '').startsWith('auto-ho-') && !isGloballyDeletedId(d.id)
          );
          const updatedDeposits = [...newDeposits, ...currentExistingDeposits];
          setBankDeposits(updatedDeposits);
          try {
            localStorage.setItem('polycables_bank_deposits', JSON.stringify(updatedDeposits));
            localStorage.setItem('depositHistory', JSON.stringify(updatedDeposits));
          } catch (e) {}
          window.dispatchEvent(new CustomEvent('polycables_deposits_updated', { detail: { deposits: newDeposits } }));
        }

        processNewPartiesFromImport(newRecords);
        if (activeTab === 'cash_in_hand') {
          setCashDepositFilter('pending');
        }
        setFilterEntity('All');
        setFilterParty('All');
        setFilterSalesman('All');
        setStartDate('');
        setEndDate('');
        setSearch('');

        if (newDeposits.length > 0) {
          setActiveTab('deposit_history');
          showNotify(
            'success',
            `✅ Successfully imported ${newRecords.length} Collections and auto-created ${newDeposits.length} Bank Deposits! Showing Deposit History.`
          );
        } else {
          showNotify('success', `Successfully imported ${newRecords.length} collection records from Excel file!`);
        }
      } catch (err: any) {
        showNotify('error', `Failed to parse Excel file: ${err.message || err}`);
      }
    };

    reader.readAsBinaryString(file);
    if (e.target) e.target.value = '';
  };

  // User Login Access & Default Account Resolutions for Collection Entry
  const userLoginFilters = useMemo(() => {
    return getUserLoginFilters(currentUser, effectiveAllSalespersons, branches);
  }, [currentUser, effectiveAllSalespersons, branches]);

  const defaultCollectionAssignedEntity = useMemo(() => {
    if (userLoginFilters.branchName) {
      return cleanSalesCenterName(userLoginFilters.branchName);
    }
    if (userBranch?.name) {
      return cleanSalesCenterName(userBranch.name);
    }
    if (userLoginFilters.salesmanName) {
      const spObj = effectiveAllSalespersons.find(
        (s) => s.name.toLowerCase() === userLoginFilters.salesmanName?.toLowerCase()
      );
      if (spObj?.branchId) {
        const br = branches.find((b) => b.id === spObj.branchId);
        if (br?.name) return cleanSalesCenterName(br.name);
      }
      if (spObj?.branchName) return cleanSalesCenterName(spObj.branchName);
      return userLoginFilters.salesmanName;
    }
    if (currentUser?.name) {
      const matchSp = effectiveAllSalespersons.find(
        (s) => s.name.toLowerCase() === currentUser.name?.toLowerCase()
      );
      if (matchSp?.branchName) return cleanSalesCenterName(matchSp.branchName);
      if (matchSp) return matchSp.name;
    }
    const firstValidBranch = (branches || []).find((b) => b && !isUnwantedSalesCenter(b));
    return firstValidBranch ? cleanSalesCenterName(firstValidBranch.name) : 'Madhupur Sales Center';
  }, [userLoginFilters, userBranch, currentUser, effectiveAllSalespersons, branches]);

  // User-wise fixed sales center (auto-locked when a sales center / branch / marketing user is logged in)
  const userFixedSalesCenter = useMemo(() => {
    if (isSuperAdminOrAgm(currentUser)) return '';
    const candidateBranchName =
      userLoginFilters.branchName ||
      userBranch?.name ||
      (() => {
        if (userLoginFilters.salesmanName) {
          const spObj = effectiveAllSalespersons.find(
            (s) => s.name.toLowerCase() === userLoginFilters.salesmanName?.toLowerCase()
          );
          if (spObj?.branchId) {
            const br = branches.find((b) => b.id === spObj.branchId);
            if (br?.name) return br.name;
          }
          if (spObj?.branchName) return spObj.branchName;
        }
        return '';
      })();
    if (!candidateBranchName) return '';
    const cleaned = cleanSalesCenterName(candidateBranchName);
    const matchedBr = (branches || []).find(
      (b) => b && !isUnwantedSalesCenter(b) && cleanSalesCenterName(b.name).toLowerCase() === cleaned.toLowerCase()
    );
    return matchedBr ? matchedBr.name : cleaned;
  }, [currentUser, userLoginFilters, userBranch, effectiveAllSalespersons, branches]);

  const isUserSalesCenterFixed = Boolean(userFixedSalesCenter);

  // Resolve a party's assigned Sales Center by party name
  const resolvePartySalesCenter = (partyNameVal: string): string => {
    const cleanP = cleanSelectedPartyName(partyNameVal || '').trim().toLowerCase();
    if (!cleanP) return '';
    const matchedParty = (parties || []).find(
      (p) => p.name.trim().toLowerCase() === cleanP || p.name.trim().toLowerCase() === (partyNameVal || '').trim().toLowerCase()
    );
    if (!matchedParty) return '';
    if (matchedParty.branchId) {
      const br = (effectiveAllBranches || []).find((b) => b.id === matchedParty.branchId && !isUnwantedSalesCenter(b));
      if (br?.name) return br.name;
    }
    const rawPartyBranch = matchedParty.branchName || (matchedParty as any).salesCenter || '';
    if (rawPartyBranch) {
      const cleanedBr = cleanSalesCenterName(rawPartyBranch);
      const brMatch = (effectiveAllBranches || []).find(
        (b) => b && !isUnwantedSalesCenter(b) && cleanSalesCenterName(b.name).toLowerCase() === cleanedBr.toLowerCase()
      );
      return brMatch ? brMatch.name : cleanedBr;
    }
    if (matchedParty.salespersonName || matchedParty.salesmanCode) {
      const spMatch = effectiveAllSalespersons.find(
        (s) =>
          (matchedParty.salespersonName && s.name.toLowerCase() === matchedParty.salespersonName.trim().toLowerCase()) ||
          (matchedParty.salesmanCode && s.code.toLowerCase() === matchedParty.salesmanCode.trim().toLowerCase())
      );
      if (spMatch) {
        if (spMatch.branchId) {
          const br = (branches || []).find((b) => b.id === spMatch.branchId && !isUnwantedSalesCenter(b));
          if (br?.name) return br.name;
        }
        if (spMatch.branchName) return cleanSalesCenterName(spMatch.branchName);
      }
    }
    return '';
  };

  // Form State for Money Receipt Collection Entry
  const [mrDate, setMrDate] = useState<string>(() => getTodayDDMMYY());
  const [mrNo, setMrNo] = useState<string>('');
  const [isMrNoManuallyEdited, setIsMrNoManuallyEdited] = useState<boolean>(false);
  const [mrEntity, setMrEntity] = useState<string>(() => userFixedSalesCenter || defaultCollectionAssignedEntity);
  const [mrPartyFixedBranch, setMrPartyFixedBranch] = useState<string>('');
  const [mrPartyName, setMrPartyName] = useState<string>('');
  const [customPartyName, setCustomPartyName] = useState<string>('');
  const [mrPaymentType, setMrPaymentType] = useState<'cash' | 'cheque'>('cash');
  const [mrBankName, setMrBankName] = useState<string>('');
  const [mrChequeNo, setMrChequeNo] = useState<string>('');
  const [mrPassDate, setMrPassDate] = useState<string>(() => getTodayDDMMYY());
  const [mrAmount, setMrAmount] = useState<string>('');
  const [mrRemarks, setMrRemarks] = useState<string>('');

  // Keep mrEntity auto-fixed user-wise whenever logged-in user belongs to a sales center
  useEffect(() => {
    if (userFixedSalesCenter) {
      setMrEntity(userFixedSalesCenter);
      setMrPartyFixedBranch('');
    }
  }, [userFixedSalesCenter, activeTab]);

  // Multi-Party & Amount Rows System for Party Collection Entry
  const [mrPartyRows, setMrPartyRows] = useState<PartyCollectionEntryRow[]>([
    {
      id: 'prow-1',
      partyName: '',
      amount: '',
      remarks: ''
    }
  ]);

  const handleAddMrPartyRow = () => {
    setMrPartyRows((prev) => [
      ...prev,
      {
        id: `prow-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        partyName: '',
        amount: '',
        remarks: ''
      }
    ]);
  };

  const handleRemoveMrPartyRow = (id: string) => {
    setMrPartyRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  };

  const handleUpdateMrPartyRow = (id: string, field: keyof PartyCollectionEntryRow, value: string) => {
    const finalVal = field === 'partyName' ? cleanSelectedPartyName(value) : value;
    const next = mrPartyRows.map((r) => (r.id === id ? { ...r, [field]: finalVal } : r));
    setMrPartyRows(next);
    if (field === 'partyName') {
      if (isUserSalesCenterFixed && userFixedSalesCenter) {
        setMrEntity(userFixedSalesCenter);
      } else {
        // Party-wise Sales Center auto-fixed based on matched party (row 0 or active edited row)
        const targetPartyName = finalVal.trim() ? finalVal : (next[0]?.partyName || '');
        const partyCenter = resolvePartySalesCenter(targetPartyName);
        if (partyCenter) {
          setMrEntity(partyCenter);
          setMrPartyFixedBranch(partyCenter);
          setIsMrNoManuallyEdited(false);
        } else if (!targetPartyName.trim()) {
          setMrPartyFixedBranch('');
          setIsMrNoManuallyEdited(false);
        }
      }
    }
  };

  // Resolve the active Sales Center for the Collection Entry form so MR numbering starts from MR-01 per Sales Center
  const activeCollectionSalesCenter = useMemo(() => {
    const firstPartyCenter = resolvePartySalesCenter(mrPartyRows[0]?.partyName || '');
    const resolvedEntityCenter = resolveEntityToSalesCenter(mrEntity, effectiveAllBranches, effectiveAllSalespersons);
    return (
      userFixedSalesCenter ||
      mrPartyFixedBranch ||
      firstPartyCenter ||
      resolvedEntityCenter ||
      mrEntity ||
      'Madhupur Sales Center'
    );
  }, [userFixedSalesCenter, mrPartyFixedBranch, mrPartyRows, mrEntity, effectiveAllBranches, effectiveAllSalespersons, parties]);

  // Keyboard navigation & focus refs for Collection Entry
  const mrPartyInputRef = useRef<HTMLInputElement>(null);
  const mrDateInputRef = useRef<HTMLInputElement>(null);
  const mrCashBtnRef = useRef<HTMLButtonElement>(null);
  const mrChequeBtnRef = useRef<HTMLButtonElement>(null);
  const mrBankInputRef = useRef<HTMLInputElement>(null);
  const mrChequeNoInputRef = useRef<HTMLInputElement>(null);
  const mrPassDateInputRef = useRef<HTMLInputElement>(null);
  const mrAmountInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus first field (Collection Date) when Collection Entry is activated
  useEffect(() => {
    if (activeTab === 'collection_entry') {
      const timer = setTimeout(() => {
        mrDateInputRef.current?.focus();
        mrDateInputRef.current?.select();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeTab]);

  // Deposit Modal State
  const [isDepositModalOpen, setIsDepositModalOpen] = useState<boolean>(false);
  const [depositModalType, setDepositModalType] = useState<'cash' | 'cheque'>('cash');
  const [cashDepositFilter, setCashDepositFilter] = useState<'pending' | 'all' | 'deposited'>('pending');
  const [chequeDepositFilter, setChequeDepositFilter] = useState<'pending' | 'history' | 'deposited' | 'cashed' | 'all'>('pending');
  const [editingBankDeposit, setEditingBankDeposit] = useState<BankDeposit | null>(null);

  // Cheque Action (Cheque to Cash vs Cheque to Bank) Modal State
  const [chequeActionModal, setChequeActionModal] = useState<{
    isOpen: boolean;
    collection: CollectionMR | null;
    actionType: 'cash' | 'bank';
    cashDate: string;
    remarks: string;
  }>({
    isOpen: false,
    collection: null,
    actionType: 'cash',
    cashDate: formatDateDDMMYY(new Date().toISOString().split('T')[0]),
    remarks: ''
  });

  // Multi-Party Batch Deposit Correction & Edit Modal State
  const [editingBatchDeposits, setEditingBatchDeposits] = useState<BankDeposit[] | null>(null);
  const [batchEditPartyRows, setBatchEditPartyRows] = useState<{ id: string; customerName: string; customerAddress: string; marketingPerson: string; amount: string; selectedCollectionId?: string }[]>([]);
  const [batchEditBankName, setBatchEditBankName] = useState<string>('');
  const [batchEditAccountName, setBatchEditAccountName] = useState<string>('');
  const [batchEditDate, setBatchEditDate] = useState<string>('');
  const [batchEditDisplayTag, setBatchEditDisplayTag] = useState<string>('');
  const [batchEditRemarks, setBatchEditRemarks] = useState<string>('');
  const [batchEditSlipImage, setBatchEditSlipImage] = useState<string | undefined>(undefined);
  const [batchEditShowCashInHand, setBatchEditShowCashInHand] = useState<boolean>(true);
  const [batchEditCashSearch, setBatchEditCashSearch] = useState<string>('');
  const [batchEditCashFilter, setBatchEditCashFilter] = useState<'pending' | 'all' | 'selected'>('pending');

  // Dynamic Party Selection for Collection Entry
  const [mrPartySearchQuery, setMrPartySearchQuery] = useState<string>('');
  const [isMrPartyDropdownOpen, setIsMrPartyDropdownOpen] = useState<boolean>(false);
  const [isShowingAllMrParties, setIsShowingAllMrParties] = useState<boolean>(false);
  const [mrPartyHighlightIdx, setMrPartyHighlightIdx] = useState<number>(0);
  const [activeMrRowPartyIdx, setActiveMrRowPartyIdx] = useState<number | null>(null);
  const [mrRowPartyHighlightIdx, setMrRowPartyHighlightIdx] = useState<number>(0);
  const mrRowPartyDropdownRef = useRef<HTMLDivElement>(null);

  // Close MR party dropdown on click/touch outside or Escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest('.collection-entry-party-container')) {
        setIsMrPartyDropdownOpen(false);
      }
      if (!target.closest('.mr-party-row-container')) {
        setActiveMrRowPartyIdx(null);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMrPartyDropdownOpen(false);
        setActiveMrRowPartyIdx(null);
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

  useEffect(() => {
    if (activeMrRowPartyIdx !== null && mrRowPartyDropdownRef.current) {
      const el = mrRowPartyDropdownRef.current.querySelector('[data-mr-party-highlighted="true"]') as HTMLElement | null;
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [mrRowPartyHighlightIdx, activeMrRowPartyIdx]);

  const filteredMrParties = React.useMemo(() => {
    if (isShowingAllMrParties || !mrPartySearchQuery.trim()) {
      return parties || [];
    }
    const q = mrPartySearchQuery.toLowerCase().trim();
    return (parties || []).filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.address && p.address.toLowerCase().includes(q)) ||
        (p.mobile && p.mobile.toLowerCase().includes(q))
    );
  }, [parties, mrPartySearchQuery, isShowingAllMrParties]);

  // Dynamic Party Filter States
  const [filterParty, setFilterParty] = useState<string>('All');
  const [partySearchInput, setPartySearchInput] = useState<string>('');
  const [isPartyDropdownOpen, setIsPartyDropdownOpen] = useState<boolean>(false);
  const [partyFilterHighlightIdx, setPartyFilterHighlightIdx] = useState<number>(0);
  const partyFilterDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isPartyDropdownOpen && partyFilterDropdownRef.current) {
      const el = partyFilterDropdownRef.current.querySelector('[data-party-filter-highlighted="true"]') as HTMLElement | null;
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [partyFilterHighlightIdx, isPartyDropdownOpen]);

  // Dynamic list of unique party options for the "By Party" filter box
  const allPartyOptions = React.useMemo(() => {
    const isCleanParty = (s?: string) => {
      if (!s) return false;
      const t = s.trim().toLowerCase();
      return t !== '' && t !== '-' && t !== 'customer' && t !== 'general customer';
    };
    const set = new Set<string>();
    (parties || []).forEach((p) => {
      if (isCleanParty(p.name)) set.add(p.name.trim());
    });
    collections.forEach((c) => {
      if (isCleanParty(c.partyName)) set.add(c.partyName.trim());
    });
    bankDeposits.forEach((d) => {
      if (isCleanParty(d.partyName)) set.add(d.partyName.trim());
      if (isCleanParty(d.customerName)) set.add(d.customerName.trim());
    });
    storedBills.forEach((b) => {
      if (isCleanParty(b.header?.partyName)) set.add(b.header.partyName.trim());
    });
    return Array.from(set).sort();
  }, [parties, collections, bankDeposits, storedBills]);

  // Parties that have cash entry (only show parties that have cash collection entries or cash bank deposits)
  // Per requirement: "in deposit page party name filter only show they have cash entry."
  const partiesWithCashEntry = React.useMemo(() => {
    const isCleanParty = (s?: string) => {
      if (!s) return false;
      const t = s.trim().toLowerCase();
      return t !== '' && t !== '-' && t !== 'customer' && t !== 'general customer';
    };
    const set = new Set<string>();
    (collections || []).forEach((c) => {
      const isCash = !c.paymentType || c.paymentType.toLowerCase() === 'cash';
      if (isCash && isCleanParty(c.partyName) && (Number(c.amount) || 0) > 0) {
        set.add(c.partyName.trim());
      }
    });
    (bankDeposits || []).forEach((d) => {
      if (isCleanParty(d.partyName) && (d.amount || 0) > 0) {
        set.add(d.partyName.trim());
      }
      if (isCleanParty(d.customerName) && (d.amount || 0) > 0) {
        set.add(d.customerName.trim());
      }
      if (d.collections && d.collections.length > 0) {
        d.collections.forEach((c) => {
          if (isCleanParty(c.partyName)) set.add(c.partyName.trim());
        });
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [collections, bankDeposits]);

  // Parties that have actually collected money (from cash/cheque collections where amount > 0)
  // Per requirement: "in Edit Bank Deposit page Customer / Party Name not show search list. here show only they have collected money."
  const partiesWithCollectedMoney = React.useMemo(() => {
    const map = new Map<string, { name: string; address?: string; marketingPerson?: string; totalCollected: number }>();

    (collections || []).forEach((c) => {
      const pName = (c.partyName || '').trim();
      const amt = Number(c.amount) || 0;
      if (pName && pName.toLowerCase() !== 'customer' && pName.toLowerCase() !== 'general customer' && amt > 0) {
        const key = pName.toLowerCase();
        if (!map.has(key)) {
          const matchedParty = (parties || []).find(
            (p) => p.name.trim().toLowerCase() === key
          );
          map.set(key, {
            name: matchedParty?.name || pName,
            address: matchedParty?.address || 'Madhupur',
            marketingPerson: matchedParty?.salespersonName || matchedParty?.salesmanCode || c.marketingPerson || 'Sanjoy Chowhan',
            totalCollected: amt
          });
        } else {
          const existing = map.get(key)!;
          existing.totalCollected += amt;
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [collections, parties]);

  // Sync activeTab when initialMode changes
  useEffect(() => {
    if (initialMode) {
      setActiveTab(
        initialMode === 'entry'
          ? 'entry'
          : initialMode === 'expense_amount'
          ? 'expense_amount'
          : initialMode === 'report'
          ? 'report'
          : initialMode === 'collection_entry'
          ? 'collection_entry'
          : initialMode === 'collection_list'
          ? 'collection_list'
          : initialMode === 'cash_in_hand'
          ? 'cash_in_hand'
          : initialMode === 'cheque_in_hand'
          ? 'cheque_in_hand'
          : initialMode === 'deposit_history'
          ? 'deposit_history'
          : initialMode === 'conveyance'
          ? 'conveyance'
          : 'directory'
      );
    }
  }, [initialMode]);

  // Auto-set MR Number independently per Sales Center unless manually overridden
  useEffect(() => {
    if (!isMrNoManuallyEdited || !mrNo.trim()) {
      const nextAutoMr = computeNextSalesCenterMrNo(
        collections,
        activeCollectionSalesCenter,
        effectiveAllBranches,
        parties,
        effectiveAllSalespersons
      );
      if (nextAutoMr !== mrNo) {
        setMrNo(nextAutoMr);
      }
    }
  }, [collections, activeCollectionSalesCenter, effectiveAllBranches, parties, effectiveAllSalespersons, isMrNoManuallyEdited, mrNo]);

  // Automatically strip any bogus "Imported Customer" / "Total" row or lingering sample col-1 when real imports exist
  useEffect(() => {
    if (!collections || collections.length === 0) return;
    const hasImported = collections.some((c) => c && typeof c.id === 'string' && c.id.startsWith('col-import-'));
    const summaryRegex = /^(total|grand\s*total|sub\s*total|subtotal|মোট|সর্বমোট|total\s*amount|total\s*collection|party\s*name|customer\s*name)$/i;

    let cleaned = collections.filter((c) => {
      if (!c) return false;
      const pName = (c.partyName || '').trim().toLowerCase();
      if (!pName || pName === 'imported customer' || pName === 'unknown party' || summaryRegex.test(pName)) {
        return false;
      }
      if (hasImported && /^col-(\d+|aug-\d+)$/.test(c.id)) {
        return false;
      }
      return true;
    });

    if (cleaned.length > 2) {
      const totalSum = cleaned.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
      const halfSum = totalSum / 2;
      if (halfSum > 0) {
        const lastIdx = cleaned.length - 1;
        if (Math.abs((Number(cleaned[lastIdx].amount) || 0) - halfSum) < 0.01 && cleaned[lastIdx].id?.startsWith('col-import-')) {
          cleaned = cleaned.slice(0, lastIdx);
        } else if (Math.abs((Number(cleaned[0].amount) || 0) - halfSum) < 0.01 && cleaned[0].id?.startsWith('col-import-')) {
          cleaned = cleaned.slice(1);
        }
      }
    }

    if (cleaned.length !== collections.length) {
      setCollections(cleaned);
      try {
        localStorage.setItem('polycables_collections', JSON.stringify(cleaned));
      } catch (e) {}
    }
  }, [collections, setCollections]);

  // Party Selection Handler with Auto-Select for Assigned Account / Person
  const handlePartySelect = (selectedName: string) => {
    setMrPartyName(selectedName);
    if (selectedName && selectedName !== 'Custom...' && parties) {
      const partyMatches = parties.filter(
        (p) => p.name.trim().toLowerCase() === selectedName.trim().toLowerCase()
      );
      const matchedParty =
        (partyMatches.length > 1 && userLoginFilters.salesmanCode
          ? partyMatches.find((p) => (p.salesmanCode || '').trim().toLowerCase() === userLoginFilters.salesmanCode.toLowerCase())
          : undefined) ||
        (partyMatches.length > 1 && userLoginFilters.salesmanName
          ? partyMatches.find((p) => (p.salespersonName || '').trim().toLowerCase() === userLoginFilters.salesmanName.toLowerCase())
          : undefined) ||
        partyMatches[0];
      if (matchedParty) {
        // If the logged-in user is a specific salesperson or restricted branch user, preserve their login assigned account
        if (userLoginFilters.salesmanName) {
          setMrEntity(userLoginFilters.salesmanName);
        } else if (userLoginFilters.branchName && !isSuperAdminOrAgm(currentUser)) {
          setMrEntity(userLoginFilters.branchName);
        } else if (matchedParty.salespersonName) {
          setMrEntity(matchedParty.salespersonName);
        } else if (matchedParty.salesmanCode && salespersons) {
          const spMatch = salespersons.find(
            (s) => s.code.toLowerCase() === matchedParty.salesmanCode?.toLowerCase()
          );
          if (spMatch) {
            setMrEntity(spMatch.name);
          }
        }
      }
    }
    // After select party name move to Collection Date
    setTimeout(() => {
      mrDateInputRef.current?.focus();
      mrDateInputRef.current?.select();
    }, 50);
  };

  // Form State for Bank Deposit and Multi-party Rows

  // Bank Deposit Form States & Linked Customer Collection
  const [depDate, setDepDate] = useState<string>(() => formatDateDDMMYY(new Date()));
  const [depEntity, setDepEntity] = useState<string>('Sonjoy Chowhan');
  const [depCustomerName, setDepCustomerName] = useState<string>('');
  const [depCustomerAddress, setDepCustomerAddress] = useState<string>('');
  const [depMarketingPerson, setDepMarketingPerson] = useState<string>('');
  const [depSelectedCollectionId, setDepSelectedCollectionId] = useState<string>('');
  
  // Multi-party deposit rows
  const [depPartyRows, setDepPartyRows] = useState<{ id: string; customerName: string; customerAddress: string; marketingPerson: string; amount: string; selectedCollectionId?: string }[]>([
    { id: 'dep-row-1', customerName: '', customerAddress: 'Madhupur', marketingPerson: 'Sanjoy Chowhan', amount: '' }
  ]);

  const handleAddPartyRow = () => {
    setDepPartyRows((prev) => [
      ...prev,
      { id: `dep-row-${Date.now()}-${prev.length}`, customerName: '', customerAddress: 'Madhupur', marketingPerson: 'Sanjoy Chowhan', amount: '' }
    ]);
  };

  const handleRemovePartyRow = (id: string) => {
    if (depPartyRows.length > 1) {
      setDepPartyRows((prev) => prev.filter((r) => r.id !== id));
    }
  };

  const handleUpdatePartyRow = (id: string, field: string, val: string) => {
    setDepPartyRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
  };

  const [depositModalMode, setDepositModalMode] = useState<'single' | 'multi'>('single');
  const [showQuickCollectionsHelper, setShowQuickCollectionsHelper] = useState<boolean>(false);

  const openDepositModal = (type: 'cash' | 'cheque', isMulti: boolean = false) => {
    const activeBranchDefault =
      (filterEntity && filterEntity !== 'All' && filterEntity !== 'All Sales Centers'
        ? effectiveAllBranches.find((b) => normalizeSalesCenter(b.name).toLowerCase() === normalizeSalesCenter(filterEntity).toLowerCase())
        : undefined) || userBranch;
    const defaultAddr =
      activeBranchDefault?.address?.split(',')[0]?.trim() ||
      cleanSalesCenterName(activeBranchDefault?.name || '') ||
      '';
    const defaultMkt =
      (filterSalesman && filterSalesman !== 'all' ? filterSalesman : '') ||
      userLoginFilters.salesmanName ||
      '';

    setDepositModalType(type);
    setDepositModalMode(isMulti ? 'multi' : 'single');
    setShowQuickCollectionsHelper(false);
    setDepPartyRows([
      { id: `dep-row-${Date.now()}-1`, customerName: '', customerAddress: defaultAddr, marketingPerson: defaultMkt, amount: '' }
    ]);
    setDepDate(formatDateDDMMYY(new Date()));
    setDepCustomerName('');
    setDepAmount('');
    setDepCustomerAddress(defaultAddr);
    setDepMarketingPerson(defaultMkt);
    setDepSelectedCollectionId('');
    setDepRemarks('');
    setDepSlipImage('');
    setDepBankName('');
    setDepAccountName('');
    setDepDisplayTag('');
    setIsDepositModalOpen(true);
  };

  const closeDepositModal = () => {
    setIsDepositModalOpen(false);
    setDepBankName('');
    setDepAccountName('');
    setDepDisplayTag('');
    setDepCustomerName('');
    setDepAmount('');
    setDepSelectedCollectionId('');
    setDepRemarks('');
    setDepSlipImage('');
    setShowQuickCollectionsHelper(false);
  };

  const handleSelectCollectionForDeposit = (col: CollectionMR) => {
    const resolved = safeResolvePartyAndMarketing(col, parties, salespersons, collections);
    const partyName = cleanSelectedPartyName(resolved.partyName || col.partyName || '');
    const matchedParty = (parties || []).find(
      (p) => p.name.trim().toLowerCase() === partyName.trim().toLowerCase()
    );
    const addr = resolved.partyAddress || matchedParty?.address || 'Madhupur';
    const mkt = (resolved.marketingPerson && resolved.marketingPerson !== '-' ? resolved.marketingPerson : undefined) ||
      col.marketingPerson ||
      matchedParty?.salespersonName ||
      col.entityName ||
      'Subrata Sutradhar';
    const colAmountStr = String(col.amount);

    if (col.date) setDepDate(formatDateDDMMYY(col.date));
    
    // Resolve full bank name and account name from collection MR only if specifically provided
    const validColBank = col.bankName && !isInvalidBankOrAccount(col.bankName) ? String(col.bankName).trim() : '';
    if (validColBank) {
      const isHO = validColBank.toLowerCase() === 'h/o' || validColBank.toLowerCase() === 'h.o' || validColBank.toLowerCase() === 'head office';
      if (isHO) {
        setDepBankName('H/O');
        setDepAccountName('Head Office');
        setDepDisplayTag('H/O');
      } else {
        const fullBank = resolveFullBankName(validColBank, bankList) || validColBank;
        setDepBankName(fullBank);
        const tagAccount = resolveAccountNameFromTag(validColBank, accountList);
        if (tagAccount) {
          setDepAccountName(tagAccount);
          setDepDisplayTag(generateDisplayTag(fullBank, tagAccount));
        } else {
          setDepAccountName('');
          setDepDisplayTag(generateDisplayTag(fullBank, ''));
        }
      }
    } else {
      // By default keep blank so user can select target bank & account
      setDepBankName('');
      setDepAccountName('');
      setDepDisplayTag('');
    }

    setDepSelectedCollectionId(col.id);
    setDepCustomerName(partyName);
    setDepAmount(colAmountStr);
    setDepCustomerAddress(addr);
    setDepMarketingPerson(mkt);
    setDepEntity(mkt);

    setDepPartyRows((prevRows) => {
      // 1. Check if this collection is already selected in one of the rows
      const existingIndex = prevRows.findIndex((r) => r.selectedCollectionId === col.id);
      if (existingIndex !== -1) {
        return prevRows.map((r, idx) =>
          idx === existingIndex
            ? {
                ...r,
                customerName: partyName,
                customerAddress: addr,
                marketingPerson: mkt,
                amount: colAmountStr,
                selectedCollectionId: col.id
              }
            : r
        );
      }

      // 2. If the first row (Party Entry #1) is empty/blank, fill Party Entry #1
      if (
        prevRows.length === 1 &&
        (!prevRows[0].customerName.trim() && !prevRows[0].amount.trim())
      ) {
        return [
          {
            ...prevRows[0],
            customerName: partyName,
            customerAddress: addr,
            marketingPerson: mkt,
            amount: colAmountStr,
            selectedCollectionId: col.id
          }
        ];
      }

      // 3. Otherwise (Party Entry #1 is already filled), append Party Entry #2 (or next row) and auto select
      return [
        ...prevRows,
        {
          id: `dep-row-${Date.now()}-${prevRows.length + 1}`,
          customerName: partyName,
          customerAddress: addr,
          marketingPerson: mkt,
          amount: colAmountStr,
          selectedCollectionId: col.id
        }
      ];
    });

    showNotify(
      'success',
      `Auto-selected payment from ${partyName} (৳${col.amount.toLocaleString('en-IN')}) into Party Entry!`
    );
  };
  const [depBankName, setDepBankName] = useState<string>('');
  const [depAccountName, setDepAccountName] = useState<string>('');
  const [depDisplayTag, setDepDisplayTag] = useState<string>('');
  const [depAmount, setDepAmount] = useState<string>('');
  const [depRemarks, setDepRemarks] = useState<string>('');
  const [depSlipImage, setDepSlipImage] = useState<string>('');
  const [previewImageModal, setPreviewImageModal] = useState<string | null>(null);
  const [emailModalDeposit, setEmailModalDeposit] = useState<BankDeposit | null>(null);
  const [emailBatchDeposits, setEmailBatchDeposits] = useState<BankDeposit[]>([]);
  const [isTestEmailMode, setIsTestEmailMode] = useState<boolean>(false);
  const [emailToList, setEmailToList] = useState<string[]>(['pcildomestic@gmail.com']);
  const [emailCcList, setEmailCcList] = useState<string[]>(['290suvro.pcil@gmail.com']);
  const [newToInput, setNewToInput] = useState<string>('');
  const [newCcInput, setNewCcInput] = useState<string>('');
  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false);
  const [emailSendError, setEmailSendError] = useState<string | null>(null);
  const [showSmtpSettings, setShowSmtpSettings] = useState<boolean>(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState<boolean>(false);
  const [isTestingSmtp, setIsTestingSmtp] = useState<boolean>(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ ok: boolean; message: string; advice?: string } | null>(null);
  const [smtpConfig, setSmtpConfig] = useState<{
    host: string;
    port: string;
    user: string;
    pass: string;
    from: string;
    secure: boolean;
  }>(() => {
    const saved = localStorage.getItem('polycables_smtp_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return {
      host: 'smtp.gmail.com',
      port: '465',
      user: 'madhupursc2026@gmail.com',
      pass: 'xcfqpgacrfpzraxe',
      from: 'Madhupur Sales Center <madhupursc2026@gmail.com>',
      secure: true
    };
  });

  const handleOpenDepositEmail = (dep: BankDeposit) => {
    setIsTestEmailMode(false);
    setEmailDeliveryReceipt(null);
    setEmailSendError(null);

    let siblings: BankDeposit[] = [];
    if (dep.batchId) {
      siblings = (bankDeposits || []).filter((d) => d.batchId === dep.batchId);
    } else {
      const matched = (bankDeposits || []).filter(
        (d) =>
          d.id === dep.id ||
          (d.date === dep.date &&
            d.bankName === dep.bankName &&
            d.accountName === dep.accountName &&
            d.slipImage &&
            d.slipImage === dep.slipImage)
      );
      if (matched.length > 1) {
        siblings = matched;
      }
    }

    const finalBatch = siblings.length > 0 ? siblings : [dep];
    setEmailModalDeposit(dep);
    setEmailBatchDeposits(finalBatch);
  };

  const handleSaveSmtpConfig = (newConfig: typeof smtpConfig) => {
    setSmtpConfig(newConfig);
    localStorage.setItem('polycables_smtp_config', JSON.stringify(newConfig));
    showNotify('success', '✓ SMTP sender credentials saved successfully!');
  };

  const handleTestSmtp = async () => {
    if (!smtpConfig.user || !smtpConfig.pass) {
      setSmtpTestResult({
        ok: false,
        message: 'Please enter your Gmail address and 16-character Google App Password first.'
      });
      showNotify('error', 'Please enter your Gmail user and App Password.');
      return;
    }
    setIsTestingSmtp(true);
    setSmtpTestResult(null);
    try {
      const res = await fetch('/api/test-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smtpConfig })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSmtpTestResult({ ok: true, message: data.message || 'SMTP Connection Verified! Ready to dispatch emails.' });
        localStorage.setItem('polycables_smtp_config', JSON.stringify(smtpConfig));
        showNotify('success', '✓ SMTP connection verified successfully!');
      } else {
        setSmtpTestResult({
          ok: false,
          message: data.error || 'Authentication failed with SMTP server',
          advice: data.advice
        });
        showNotify('error', data.error || 'SMTP Test Failed');
      }
    } catch (err: any) {
      setSmtpTestResult({ ok: false, message: err.message || 'Network error testing SMTP' });
      showNotify('error', err.message || 'Network error');
    } finally {
      setIsTestingSmtp(false);
    }
  };

  const [emailDeliveryReceipt, setEmailDeliveryReceipt] = useState<{
    messageId: string;
    sentAt: string;
    recipients: string;
    subject: string;
  } | null>(null);

  const handleSendDepositEmail = async () => {
    if (!emailModalDeposit) return;
    setIsSendingEmail(true);
    setEmailSendError(null);

    const effectiveBatch = emailBatchDeposits.length > 0 ? emailBatchDeposits : [emailModalDeposit];
    const subject = generateDepositEmailSubject(emailModalDeposit, isTestEmailMode, effectiveBatch);
    const body = generateDepositEmailBody(emailModalDeposit, isTestEmailMode, emailToList, emailCcList, effectiveBatch, parties);
    const toParam = emailToList.join(', ');
    const ccParam = emailCcList.join(', ');

    const activeSlip = emailModalDeposit.slipImage || effectiveBatch.find((d) => d.slipImage)?.slipImage;
    const primaryPartyMatched = (parties || []).find((p) => p.name.trim().toLowerCase() === (emailModalDeposit.customerName || emailModalDeposit.partyName || '').trim().toLowerCase());
    const partySalesCenter = emailModalDeposit.branchName || primaryPartyMatched?.branchName || emailModalDeposit.entityName || 'Madhupur Sales Center';

    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emailToList.join(', '),
          cc: emailCcList.length > 0 ? emailCcList.join(', ') : undefined,
          subject,
          textBody: body,
          documentType: 'bank_deposit',
          documentId: emailModalDeposit.id,
          attachmentName: activeSlip ? `Deposit_Slip_${emailModalDeposit.customerName || 'Customer'}_${emailModalDeposit.date}.jpg` : undefined,
          attachmentData: activeSlip || undefined,
          salesCenterName: partySalesCenter,
          senderName: partySalesCenter,
          smtpConfig: (smtpConfig && smtpConfig.user && smtpConfig.pass) ? smtpConfig : undefined
        })
      });

      const resData = await response.json();

      if (!response.ok || !resData.success) {
        const errMsg = resData.error || 'Failed to dispatch email over SMTP';
        setEmailSendError(errMsg);
        if (resData.status === 'smtp_not_configured') {
          setShowSmtpSettings(true);
        }
        showNotify('error', errMsg);
        return;
      }

      const receipt = {
        messageId: resData.messageId || `DEP-${Date.now().toString(36).toUpperCase()}`,
        sentAt: resData.sentAt || new Date().toISOString(),
        recipients: `To: ${toParam}${ccParam ? ` | CC: ${ccParam}` : ''}`,
        subject
      };

      setEmailDeliveryReceipt(receipt);

      if (setBankDeposits && !isTestEmailMode) {
        const batchIds = new Set(effectiveBatch.map((d) => d.id));
        batchIds.add(emailModalDeposit.id);
        setBankDeposits((prev) =>
          prev.map((d) => (batchIds.has(d.id) ? { ...d, emailSent: true } : d))
        );
      }

      try {
        const savedLogs = localStorage.getItem('polycables_email_logs');
        const logs = savedLogs ? JSON.parse(savedLogs) : [];
        logs.unshift(receipt);
        localStorage.setItem('polycables_email_logs', JSON.stringify(logs.slice(0, 50)));
      } catch (e) {}

      showNotify('success', `✓ Live email successfully delivered to ${toParam}! Message ID: ${receipt.messageId}`);
      // Notify and close email modal window after successful send
      setTimeout(() => {
        setEmailModalDeposit(null);
        setEmailDeliveryReceipt(null);
        setEmailSendError(null);
      }, 1000);
    } catch (err: any) {
      console.error('Mail dispatch error:', err);
      setEmailSendError(err.message || 'Network error connecting to email server');
      showNotify('error', err.message || 'Failed to dispatch email');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleAddRecipient = (type: 'to' | 'cc', emailToAdd?: string) => {
    const raw = emailToAdd !== undefined ? emailToAdd : (type === 'to' ? newToInput : newCcInput);
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (!trimmed.includes('@')) {
      showNotify('error', 'Please enter a valid email address.');
      return;
    }
    if (type === 'to') {
      if (emailToList.includes(trimmed)) {
        showNotify('error', 'Email address is already in the To list.');
      } else {
        setEmailToList((prev) => [...prev, trimmed]);
        setNewToInput('');
        showNotify('success', `Added "${trimmed}" to Main Recipient list`);
      }
    } else {
      if (emailCcList.includes(trimmed)) {
        showNotify('error', 'Email address is already in the CC list.');
      } else {
        setEmailCcList((prev) => [...prev, trimmed]);
        setNewCcInput('');
        showNotify('success', `Added "${trimmed}" to CC list`);
      }
    }
  };

  const handleRemoveRecipient = (type: 'to' | 'cc', emailToRemove: string) => {
    if (type === 'to') {
      if (emailToList.length <= 1) {
        showNotify('error', 'At least one main recipient is required.');
        return;
      }
      setEmailToList((prev) => prev.filter((e) => e !== emailToRemove));
    } else {
      setEmailCcList((prev) => prev.filter((e) => e !== emailToRemove));
    }
  };

  const [showReportPrintPreviewModal, setShowReportPrintPreviewModal] = useState<boolean>(false);

  const handleOpenTestEmail = (dep?: BankDeposit) => {
    const targetDep: BankDeposit = dep || (bankDeposits && bankDeposits.length > 0 ? bankDeposits[0] : {
      id: 'test-dep-' + Date.now(),
      date: formatDateDDMMYY(new Date()),
      entityName: 'Madhupur Sales Center',
      customerName: 'A.K. Electric & Hardware (Test Party)',
      customerAddress: 'Madhupur Bazaar, Tangail',
      marketingPerson: 'Sanjoy Chowhan',
      bankName: 'Pubali Bank PLC',
      accountName: 'Padma Enterprise',
      bankShortCode: 'PBL',
      accountShortCode: 'PE',
      displayTag: 'PBL-PE',
      amount: 150000,
      remarks: 'Test system verification for deposit slip mail routing',
      emailSent: false
    });
    setIsTestEmailMode(true);
    setEmailModalDeposit(targetDep);
    setEmailBatchDeposits(dep && dep.batchId ? (bankDeposits || []).filter((d) => d.batchId === dep.batchId) : []);
  };

  const handleSlipImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        showNotify('error', 'Image size exceeds 5MB limit. Please select a smaller photo.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setDepSlipImage(reader.result);
          showNotify('success', 'Deposit slip image attached successfully!');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBatchEditSlipUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        showNotify('error', 'Image size exceeds 5MB limit. Please select a smaller photo.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setBatchEditSlipImage(reader.result);
          showNotify('success', 'Deposit slip image attached to deposit batch!');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDirectSlipUpload = (depositId: string, e: React.ChangeEvent<HTMLInputElement>, batchId?: string) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        showNotify('error', 'Image size exceeds 5MB limit. Please select a smaller photo.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          const base64 = reader.result;
          if (setBankDeposits) {
            setBankDeposits((prev) =>
              prev.map((d) => {
                if (batchId && d.batchId === batchId) {
                  return { ...d, slipImage: base64 };
                }
                if (d.id === depositId) {
                  return { ...d, slipImage: base64 };
                }
                return d;
              })
            );
          }
          showNotify('success', 'Deposit slip uploaded and saved successfully!');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const defaultUserAccount = useMemo(() => {
    if (
      isStrictSuperAdmin(currentUser) ||
      isAccountsAdmin(currentUser) ||
      isSuperAdminOrAgm(currentUser) ||
      isAnyAdmin(currentUser)
    ) {
      return 'All Sales Centers';
    }
    if (userLoginFilters.branchName) {
      return userLoginFilters.branchName;
    }
    if (userBranch?.name) {
      return cleanSalesCenterName(userBranch.name);
    }
    return initialDefaultEntity;
  }, [userLoginFilters, userBranch, currentUser, initialDefaultEntity]);

  const defaultUserSalesman = useMemo(() => {
    if (isAccountsOrStaff(currentUser)) return 'all';
    if (userLoginFilters.salesmanName) {
      return userLoginFilters.salesmanName;
    }
    return 'all';
  }, [userLoginFilters, currentUser]);

  // Search & Filter
  const [search, setSearch] = useState<string>('');
  const [filterEntity, setFilterEntity] = useState<string>(() => initialDefaultEntity);
  const [filterSalesman, setFilterSalesman] = useState<string>(() => defaultUserSalesman);
  const [filterExpenseCategory, setFilterExpenseCategory] = useState<string>('all');
  const [directoryView, setDirectoryView] = useState<'expenses' | 'collections'>('expenses');
  const [editingCollection, setEditingCollection] = useState<CollectionMR | null>(null);

  // Helper to resolve a salesman's normalized Sales Center
  const getSalesmanBranchName = (sp: Salesperson): string => {
    if (sp.branchName) return normalizeSalesCenter(sp.branchName);
    if (sp.branchId) {
      const br = branches.find((b) => b.id === sp.branchId);
      if (br) return normalizeSalesCenter(br.name);
    }
    if (sp.areaGroup && sp.areaGroup.toLowerCase().includes('tangail')) {
      return 'Tangail Sales Center';
    }
    return 'Madhupur Sales Center';
  };

  // Master list of salesmen with their associated Sales Center for filters
  const salesmanListForFilters = useMemo(() => {
    const list: { id: string; code: string; name: string; label: string; branchName: string }[] = [];
    const seenNames = new Set<string>();

    effectiveAllSalespersons.forEach((sp) => {
      if (!sp || !sp.name || !sp.name.trim()) return;
      const cleanName = sp.name.trim();
      const lower = cleanName.toLowerCase();
      if (seenNames.has(lower)) return;
      seenNames.add(lower);

      const bName = getSalesmanBranchName(sp);
      list.push({
        id: sp.id || cleanName,
        code: sp.code || '',
        name: cleanName,
        label: sp.code && sp.code.toLowerCase() !== 'ic' ? `${cleanName} (${sp.code})` : cleanName,
        branchName: bName
      });
    });

    // Also include any other marketing officers found in collections/parties/storedBills
    const addExtra = (rawName?: string, branchHint?: string) => {
      if (!rawName) return;
      const clean = rawName.trim();
      const lower = clean.toLowerCase();
      if (!clean || lower === 'all' || lower === 'none' || lower.includes('sales center') || lower.includes('showroom')) return;
      if (seenNames.has(lower)) return;
      seenNames.add(lower);
      let bName = 'Madhupur Sales Center';
      if (branchHint) {
        bName = normalizeSalesCenter(branchHint);
      } else if (clean.toLowerCase().includes('tangail')) {
        bName = 'Tangail Sales Center';
      }
      list.push({
        id: clean,
        code: '',
        name: clean,
        label: clean,
        branchName: bName
      });
    };

    collections.forEach((c) => addExtra(c.marketingPerson, c.branchName || c.entityName));
    parties.forEach((p) => addExtra(p.salespersonName, p.branchName));

    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [effectiveAllSalespersons, branches, collections, parties]);

  // Available salesmen filtered dynamically based on the selected Sales Center (and user's allowed centers)
  const visibleSalesmenOptions = useMemo(() => {
    const isSuperOrAcc = isSuperAdminOrAgm(currentUser) || isAccountsAdmin(currentUser);
    const allowedCleanNames = new Set(allowedUserBranches.map((b) => normalizeSalesCenter(b.name).toLowerCase()));
    const userScopedList = isSuperOrAcc || allowedUserBranches.length === 0
      ? salesmanListForFilters
      : salesmanListForFilters.filter((sp) => {
          const spBranch = normalizeSalesCenter(sp.branchName).toLowerCase();
          return allowedCleanNames.has(spBranch) || Array.from(allowedCleanNames).some((an) => spBranch.includes(an) || an.includes(spBranch));
        });

    if (!filterEntity || filterEntity === 'All' || filterEntity === 'All Sales Centers') {
      return userScopedList;
    }
    const cleanTarget = normalizeSalesCenter(filterEntity).toLowerCase();
    return userScopedList.filter((sp) => {
      const spBranch = normalizeSalesCenter(sp.branchName).toLowerCase();
      return spBranch === cleanTarget || spBranch.includes(cleanTarget) || cleanTarget.includes(spBranch);
    });
  }, [salesmanListForFilters, filterEntity, allowedUserBranches, currentUser]);

  // Check if a party belongs to a specific salesman
  const partyBelongsToSalesman = useCallback((partyName: string, salesmanName: string): boolean => {
    if (!salesmanName || salesmanName === 'all') return true;
    const target = salesmanName.toLowerCase().trim();
    // 1. In parties directory
    const p = parties.find((item) => item.name && item.name.toLowerCase().trim() === partyName.toLowerCase().trim());
    if (p) {
      const spName = (p.salespersonName || '').toLowerCase().trim();
      const spCode = (p.salesmanCode || '').toLowerCase().trim();
      if (spName === target || spCode === target || (spName && target.includes(spName)) || (spCode && target.includes(spCode))) {
        return true;
      }
    }
    // 2. In collections
    const inCol = collections.some(
      (c) =>
        c.partyName &&
        c.partyName.toLowerCase().trim() === partyName.toLowerCase().trim() &&
        c.marketingPerson &&
        (c.marketingPerson.toLowerCase().trim() === target || target.includes(c.marketingPerson.toLowerCase().trim()))
    );
    if (inCol) return true;
    // 3. In stored bills
    const inBill = storedBills.some(
      (b) =>
        b.header?.partyName &&
        b.header.partyName.toLowerCase().trim() === partyName.toLowerCase().trim() &&
        b.header.salesperson &&
        (b.header.salesperson.toLowerCase().trim() === target || target.includes(b.header.salesperson.toLowerCase().trim()))
    );
    return inBill;
  }, [parties, collections, storedBills]);

  // Check if a party belongs to a specific sales center
  const partyBelongsToSalesCenter = useCallback((partyName: string, centerName: string): boolean => {
    if (!centerName || centerName === 'All' || centerName === 'All Sales Centers') return true;
    const target = normalizeSalesCenter(centerName).toLowerCase();
    const p = parties.find((item) => item.name && item.name.toLowerCase().trim() === partyName.toLowerCase().trim());
    if (p) {
      if (p.branchName) {
        const b = normalizeSalesCenter(p.branchName).toLowerCase();
        if (b === target || b.includes(target) || target.includes(b)) return true;
      }
      if (p.salesmanCode) {
        const sp = effectiveAllSalespersons.find((s) => s.code && s.code.toLowerCase() === p.salesmanCode?.toLowerCase());
        if (sp) {
          const spBranch = normalizeSalesCenter(getSalesmanBranchName(sp)).toLowerCase();
          if (spBranch === target || spBranch.includes(target) || target.includes(spBranch)) return true;
        }
      }
      if (p.salespersonName) {
        const sp = effectiveAllSalespersons.find((s) => s.name && s.name.toLowerCase() === p.salespersonName?.toLowerCase());
        if (sp) {
          const spBranch = normalizeSalesCenter(getSalesmanBranchName(sp)).toLowerCase();
          if (spBranch === target || spBranch.includes(target) || target.includes(spBranch)) return true;
        }
      }
      if (p.address) {
        const addr = p.address.toLowerCase();
        if (target.includes('tangail') && addr.includes('tangail')) return true;
        if (target.includes('madhupur') && addr.includes('madhupur')) return true;
      }
    }
    const inCol = collections.some(
      (c) =>
        c.partyName &&
        c.partyName.toLowerCase().trim() === partyName.toLowerCase().trim() &&
        (normalizeSalesCenter(c.branchName || c.entityName || '').toLowerCase() === target)
    );
    if (inCol) return true;
    const inBill = storedBills.some(
      (b) =>
        b.header?.partyName &&
        b.header.partyName.toLowerCase().trim() === partyName.toLowerCase().trim() &&
        (normalizeSalesCenter(b.header.branchName || '').toLowerCase() === target)
    );
    if (inBill) return true;
    const inDep = bankDeposits.some(
      (d) =>
        ((d.customerName && d.customerName.toLowerCase().trim() === partyName.toLowerCase().trim()) ||
         (d.partyName && d.partyName.toLowerCase().trim() === partyName.toLowerCase().trim())) &&
        normalizeSalesCenter(d.branchName || d.entityName || '').toLowerCase() === target
    );
    return inDep;
  }, [parties, collections, storedBills, bankDeposits, effectiveAllSalespersons]);

  // Table Column Sort States (Collection List, Cash in Hand, Cheque in Hand, Expense Log)
  const [collectionSortField, setCollectionSortField] = useState<string>('date');
  const [collectionSortDirection, setCollectionSortDirection] = useState<'asc' | 'desc'>('desc');

  const [cashSortField, setCashSortField] = useState<string>('date');
  const [cashSortDirection, setCashSortDirection] = useState<'asc' | 'desc'>('desc');

  const [chequeSortField, setChequeSortField] = useState<string>('date');
  const [chequeSortDirection, setChequeSortDirection] = useState<'asc' | 'desc'>('desc');

  const [expenseSortField, setExpenseSortField] = useState<string>('date');
  const [expenseSortDirection, setExpenseSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleTableSort = (
    field: string,
    currentField: string,
    currentDirection: 'asc' | 'desc',
    setField: (f: string) => void,
    setDir: (d: 'asc' | 'desc') => void
  ) => {
    if (currentField === field) {
      setDir(currentDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setField(field);
      setDir('asc');
    }
  };

  const renderSortIndicator = (field: string, currentField: string, currentDirection: 'asc' | 'desc', darkBg = true) => {
    const isActive = currentField === field;
    return (
      <span className="inline-flex items-center ml-1 text-[10px] select-none font-mono tracking-tighter shrink-0">
        <span className={isActive && currentDirection === 'asc' ? (darkBg ? 'text-amber-400 font-extrabold scale-110' : 'text-blue-600 font-extrabold scale-110') : (darkBg ? 'text-slate-500 opacity-60' : 'text-slate-400 opacity-60')}>▲</span>
        <span className={isActive && currentDirection === 'desc' ? (darkBg ? 'text-amber-400 font-extrabold scale-110' : 'text-blue-600 font-extrabold scale-110') : (darkBg ? 'text-slate-500 opacity-60' : 'text-slate-400 opacity-60')}>▼</span>
      </span>
    );
  };

  // Synchronize report person name and sales center name whenever filterEntity changes
  useEffect(() => {
    const details = getEntityDisplayDetails(filterEntity);
    setReportPersonName(details.personName);
    setReportSalesCenterName(details.centerName);
  }, [filterEntity, branches, salespersons, userBranch]);

  // Ensure current filterEntity is valid within availableAccountOptions
  useEffect(() => {
    if (availableAccountOptions.length > 0) {
      const exists = availableAccountOptions.some((opt) => opt.value === filterEntity);
      if (!exists && filterEntity !== 'All' && filterEntity !== 'All Sales Centers') {
        setFilterEntity(availableAccountOptions[0].value);
      }
    }
  }, [availableAccountOptions, filterEntity]);

  // Default to user's login account and salesman whenever navigating to Collection List, Cash In Hand, Cheque In Hand, or Deposit History
  useEffect(() => {
    if (['collection_list', 'cash_in_hand', 'cheque_in_hand', 'deposit_history'].includes(activeTab)) {
      setFilterEntity(defaultUserAccount);
      setFilterSalesman(defaultUserSalesman);
    }
  }, [activeTab, defaultUserAccount, defaultUserSalesman]);

  useEffect(() => {
    if (initialMode && ['collection_list', 'cash_in_hand', 'cheque_in_hand', 'deposit_history'].includes(initialMode)) {
      setFilterEntity(defaultUserAccount);
      setFilterSalesman(defaultUserSalesman);
    }
  }, [initialMode, defaultUserAccount, defaultUserSalesman]);

  // Keep filters updated when currentUser changes or logs in
  useEffect(() => {
    setFilterEntity(defaultUserAccount);
    setFilterSalesman(defaultUserSalesman);
  }, [defaultUserAccount, defaultUserSalesman]);

  // Auto-set Assigned Account / Person in Collection Entry based on who logged in
  useEffect(() => {
    if (activeTab === 'collection_entry' || initialMode === 'collection_entry') {
      setMrEntity(defaultCollectionAssignedEntity);
    }
  }, [activeTab, initialMode, defaultCollectionAssignedEntity]);

  useEffect(() => {
    setMrEntity(defaultCollectionAssignedEntity);
  }, [defaultCollectionAssignedEntity]);

  const handleAccountFilterChange = (newVal: string) => {
    setFilterEntity(newVal);
    const details = getEntityDisplayDetails(newVal);
    setReportPersonName(details.personName);
    setReportSalesCenterName(details.centerName);
    // Reset manual overrides so new account calculates dynamic figures
    setReportSalesAmount('');
    setReportCollectionAmount('');

    // Check if user selected a marketing officer from the Account dropdown
    const matchedSp = salesmanListForFilters.find(
      (s) => s.name.toLowerCase() === newVal.toLowerCase() || (s.code && s.code.toLowerCase() === newVal.toLowerCase())
    );
    if (matchedSp) {
      setFilterSalesman(matchedSp.name);
      setFilterEntity(matchedSp.name);
      if (filterParty && filterParty !== 'All') {
        if (!partyBelongsToSalesman(filterParty, matchedSp.name)) {
          setFilterParty('All');
          setPartySearchInput('');
        }
      }
      return;
    }

    // Bi-directional Auto-filtering:
    // If user selects a Sales Center, auto-filter salesman options.
    // If the currently selected salesman does not belong to this Sales Center, auto-reset salesman to 'all'
    if (newVal !== 'All' && newVal !== 'All Sales Centers') {
      const cleanTarget = normalizeSalesCenter(newVal).toLowerCase();
      if (filterSalesman !== 'all') {
        const currentSp = salesmanListForFilters.find(
          (s) => s.name.toLowerCase() === filterSalesman.toLowerCase() || (s.code && s.code.toLowerCase() === filterSalesman.toLowerCase())
        );
        if (currentSp) {
          const spBranch = normalizeSalesCenter(currentSp.branchName).toLowerCase();
          const isMatch = spBranch === cleanTarget || spBranch.includes(cleanTarget) || cleanTarget.includes(spBranch);
          if (!isMatch) {
            setFilterSalesman('all');
          }
        }
      }
      // If currently selected party does not belong to this sales center, reset to 'All'
      if (filterParty && filterParty !== 'All') {
        if (!partyBelongsToSalesCenter(filterParty, newVal)) {
          setFilterParty('All');
          setPartySearchInput('');
        }
      }
    }
  };

  const handleSalesmanFilterChange = (newSalesman: string) => {
    setFilterSalesman(newSalesman);
    // Bi-directional Auto-filtering:
    // If a salesman is selected, auto-set the corresponding Sales Center in the Account dropdown!
    if (newSalesman && newSalesman !== 'all') {
      const spObj = salesmanListForFilters.find(
        (s) => s.name.toLowerCase() === newSalesman.toLowerCase() || (s.code && s.code.toLowerCase() === newSalesman.toLowerCase())
      );
      if (spObj && spObj.branchName) {
        const targetBranch = normalizeSalesCenter(spObj.branchName);
        setFilterEntity(targetBranch);
        const details = getEntityDisplayDetails(targetBranch);
        setReportPersonName(details.personName);
        setReportSalesCenterName(details.centerName);
      }
      // If currently selected party does not belong to this salesman, reset to 'All'
      if (filterParty && filterParty !== 'All') {
        if (!partyBelongsToSalesman(filterParty, newSalesman)) {
          setFilterParty('All');
          setPartySearchInput('');
        }
      }
    }
  };

  // Central filter check for collection records against both selected Sales Center and Salesman
  const collectionMatchesFilter = (c: CollectionMR): boolean => {
    // 1. Sales Center / Person match
    if (filterEntity && filterEntity !== 'All' && filterEntity !== 'All Sales Centers') {
      const cleanTarget = normalizeSalesCenter(filterEntity).toLowerCase();
      const rawTarget = filterEntity.trim().toLowerCase();
      const cEntityClean = normalizeSalesCenter(c.entityName || '').toLowerCase();
      const cBranchClean = normalizeSalesCenter(c.branchName || '').toLowerCase();
      const cMkt = (c.marketingPerson || '').trim().toLowerCase();
      const cEntityRaw = (c.entityName || '').trim().toLowerCase();

      let branchMatch = false;
      if (cMkt === rawTarget || cEntityRaw === rawTarget) branchMatch = true;
      else if (cEntityClean === cleanTarget || cBranchClean === cleanTarget) branchMatch = true;
      else if (cEntityClean.includes(cleanTarget) || cleanTarget.includes(cEntityClean)) branchMatch = true;
      else if (cBranchClean && (cBranchClean.includes(cleanTarget) || cleanTarget.includes(cBranchClean))) branchMatch = true;
      else if (cleanTarget.includes('tangail') && (cEntityClean.includes('tangail') || cBranchClean.includes('tangail'))) branchMatch = true;
      else if (cleanTarget.includes('madhupur') && (cEntityClean.includes('madhupur') || cBranchClean.includes('madhupur'))) branchMatch = true;

      if (!branchMatch) {
        const spName = (c.marketingPerson || c.entityName || '').trim().toLowerCase();
        const spCode = (c.salesmanCode || '').trim().toLowerCase();
        const sp = effectiveAllSalespersons.find(
          (s) => s.name.trim().toLowerCase() === spName || (s.code && s.code.trim().toLowerCase() === spCode)
        );
        if (sp) {
          const spBranch = normalizeSalesCenter(getSalesmanBranchName(sp)).toLowerCase();
          if (spBranch === cleanTarget || spBranch.includes(cleanTarget) || cleanTarget.includes(spBranch)) {
            branchMatch = true;
          }
        }
      }

      if (!branchMatch && c.partyName) {
        branchMatch = partyBelongsToSalesCenter(c.partyName, filterEntity);
      }

      if (!branchMatch) {
        const pName = (c.partyName || '').trim().toLowerCase();
        const party = (parties || []).find((p) => p.name.trim().toLowerCase() === pName);
        if (party) {
          const pBranch = normalizeSalesCenter(party.branchName || '').toLowerCase();
          if (pBranch === cleanTarget || pBranch.includes(cleanTarget) || cleanTarget.includes(pBranch)) {
            branchMatch = true;
          } else if (cleanTarget.includes('tangail') && (party.address || '').toLowerCase().includes('tangail')) {
            branchMatch = true;
          } else if (cleanTarget.includes('madhupur') && (party.address || '').toLowerCase().includes('madhupur')) {
            branchMatch = true;
          } else if (party.salesmanCode || party.salespersonName) {
            const sp = effectiveAllSalespersons.find(
              (s) => (party.salesmanCode && s.code?.toLowerCase() === party.salesmanCode.toLowerCase()) ||
                     (party.salespersonName && s.name?.toLowerCase() === party.salespersonName.toLowerCase())
            );
            if (sp) {
              const spBranch = normalizeSalesCenter(getSalesmanBranchName(sp)).toLowerCase();
              if (spBranch === cleanTarget || spBranch.includes(cleanTarget) || cleanTarget.includes(spBranch)) {
                branchMatch = true;
              }
            }
          }
        }
      }

      if (!branchMatch) return false;
    }

    // 2. Salesman match
    if (filterSalesman && filterSalesman !== 'all') {
      const targetSp = filterSalesman.trim().toLowerCase();
      const cMkt = (c.marketingPerson || '').trim().toLowerCase();
      const cCode = (c.salesmanCode || '').trim().toLowerCase();
      const cEntity = (c.entityName || '').trim().toLowerCase();

      let salesmanMatch = false;
      if (cMkt === targetSp || cMkt.includes(targetSp) || targetSp.includes(cMkt)) salesmanMatch = true;
      else if (cCode && cCode === targetSp) salesmanMatch = true;
      else if (cEntity === targetSp || cEntity.includes(targetSp) || targetSp.includes(cEntity)) salesmanMatch = true;
      else if (c.partyName && partyBelongsToSalesman(c.partyName, filterSalesman)) salesmanMatch = true;
      else {
        const pName = (c.partyName || '').trim().toLowerCase();
        const party = (parties || []).find((p) => p.name.trim().toLowerCase() === pName);
        if (party) {
          const pSpName = (party.salespersonName || '').trim().toLowerCase();
          const pSpCode = (party.salesmanCode || '').trim().toLowerCase();
          if (pSpName === targetSp || pSpName.includes(targetSp) || targetSp.includes(pSpName) || (pSpCode && pSpCode === targetSp)) {
            salesmanMatch = true;
          }
        }
      }

      if (!salesmanMatch) return false;
    }

    return true;
  };

  // Central filter check for bank deposit records against both selected Sales Center and Salesman
  const depositMatchesFilter = (d: BankDeposit): boolean => {
    // 1. Sales Center / Person match
    if (filterEntity && filterEntity !== 'All' && filterEntity !== 'All Sales Centers') {
      const cleanTarget = normalizeSalesCenter(filterEntity).toLowerCase();
      const rawTarget = filterEntity.trim().toLowerCase();
      const dEntityClean = normalizeSalesCenter(d.entityName || '').toLowerCase();
      const dBranchClean = normalizeSalesCenter(d.branchName || '').toLowerCase();
      const dBank = (d.bankName || '').toLowerCase();
      const dAcc = (d.accountName || '').toLowerCase();
      const dMkt = (d.marketingPerson || '').trim().toLowerCase();
      const dEntityRaw = (d.entityName || '').trim().toLowerCase();
      const dDepositedBy = (d.depositedBy || (d as any).createdBy || '').trim().toLowerCase();

      let branchMatch = false;
      if (d.branchId && effectiveAllBranches && effectiveAllBranches.length > 0) {
        const mappedBranch = effectiveAllBranches.find((b) => b.id.toLowerCase().trim() === String(d.branchId).toLowerCase().trim());
        if (mappedBranch) {
          const mbClean = normalizeSalesCenter(mappedBranch.name).toLowerCase();
          if (mbClean === cleanTarget || mbClean.includes(cleanTarget) || cleanTarget.includes(mbClean)) {
            branchMatch = true;
          }
        }
      }
      if (!branchMatch && (dMkt === rawTarget || dEntityRaw === rawTarget)) branchMatch = true;
      else if (!branchMatch && (dEntityClean === cleanTarget || dBranchClean === cleanTarget || dBank === cleanTarget || dAcc === cleanTarget)) branchMatch = true;
      else if (!branchMatch && dEntityClean && (dEntityClean.includes(cleanTarget) || cleanTarget.includes(dEntityClean))) branchMatch = true;
      else if (!branchMatch && dBranchClean && (dBranchClean.includes(cleanTarget) || cleanTarget.includes(dBranchClean))) branchMatch = true;
      else if (!branchMatch && cleanTarget.includes('tangail') && (dEntityClean.includes('tangail') || dBranchClean.includes('tangail'))) branchMatch = true;
      else if (!branchMatch && cleanTarget.includes('madhupur') && (dEntityClean.includes('madhupur') || dBranchClean.includes('madhupur'))) branchMatch = true;

      if (!branchMatch) {
        const spName = (d.marketingPerson || d.entityName || dDepositedBy || '').trim().toLowerCase();
        const sp = effectiveAllSalespersons.find((s) => s.name.trim().toLowerCase() === spName);
        if (sp) {
          const spBranch = normalizeSalesCenter(getSalesmanBranchName(sp)).toLowerCase();
          if (spBranch === cleanTarget || spBranch.includes(cleanTarget) || cleanTarget.includes(spBranch)) {
            branchMatch = true;
          }
        }
      }

      if (!branchMatch) {
        const pName = (d.customerName || d.partyName || '').trim().toLowerCase();
        if (pName && partyBelongsToSalesCenter(pName, filterEntity)) {
          branchMatch = true;
        } else {
          const party = (parties || []).find((p) => p.name.trim().toLowerCase() === pName);
          if (party) {
            const pBranch = normalizeSalesCenter(party.branchName || '').toLowerCase();
            if (pBranch === cleanTarget || pBranch.includes(cleanTarget) || cleanTarget.includes(pBranch)) {
              branchMatch = true;
            } else if (cleanTarget.includes('tangail') && (party.address || '').toLowerCase().includes('tangail')) {
              branchMatch = true;
            } else if (cleanTarget.includes('madhupur') && (party.address || '').toLowerCase().includes('madhupur')) {
              branchMatch = true;
            } else if (party.salesmanCode || party.salespersonName) {
              const sp = effectiveAllSalespersons.find(
                (s) => (party.salesmanCode && s.code?.toLowerCase() === party.salesmanCode.toLowerCase()) ||
                       (party.salespersonName && s.name?.toLowerCase() === party.salespersonName.toLowerCase())
              );
              if (sp) {
                const spBranch = normalizeSalesCenter(getSalesmanBranchName(sp)).toLowerCase();
                if (spBranch === cleanTarget || spBranch.includes(cleanTarget) || cleanTarget.includes(spBranch)) {
                  branchMatch = true;
                }
              }
            }
          }
        }
      }

      if (!branchMatch && (d as any).collections && ((d as any).collections as CollectionMR[]).some((c) => collectionMatchesFilter(c))) {
        branchMatch = true;
      }

      if (!branchMatch && d.batchId) {
        const batchMatches = (bankDeposits || []).filter((b) => b.batchId === d.batchId);
        branchMatch = batchMatches.some((b) => {
          const pName = (b.customerName || b.partyName || '').trim();
          return partyBelongsToSalesCenter(pName, filterEntity);
        });
      }

      if (!branchMatch) return false;
    }

    // 2. Salesman match
    if (filterSalesman && filterSalesman !== 'all') {
      const targetSp = filterSalesman.trim().toLowerCase();
      const dMkt = (d.marketingPerson || '').trim().toLowerCase();
      const dEntity = (d.entityName || '').trim().toLowerCase();

      let salesmanMatch = false;
      if (dMkt === targetSp || dMkt.includes(targetSp) || targetSp.includes(dMkt)) salesmanMatch = true;
      else if (dEntity === targetSp || dEntity.includes(targetSp) || targetSp.includes(dEntity)) salesmanMatch = true;
      else {
        const pName = (d.customerName || d.partyName || '').trim().toLowerCase();
        const party = (parties || []).find((p) => p.name.trim().toLowerCase() === pName);
        if (party) {
          const pSpName = (party.salespersonName || '').trim().toLowerCase();
          const pSpCode = (party.salesmanCode || '').trim().toLowerCase();
          if (pSpName === targetSp || pSpName.includes(targetSp) || targetSp.includes(pSpName) || (pSpCode && pSpCode === targetSp)) {
            salesmanMatch = true;
          }
        }
      }

      if (!salesmanMatch && (d as any).collections && ((d as any).collections as CollectionMR[]).some((c) => collectionMatchesFilter(c))) {
        salesmanMatch = true;
      }

      if (!salesmanMatch && d.batchId) {
        const batchMatches = (bankDeposits || []).filter((b) => b.batchId === d.batchId);
        salesmanMatch = batchMatches.some((b) => {
          const pName = (b.customerName || b.partyName || '').trim();
          return partyBelongsToSalesman(pName, filterSalesman);
        });
      }

      if (!salesmanMatch) return false;
    }

    return true;
  };

  // Compact Salesman Filter Dropdown Component
  const SalesmanFilterControl = ({ color = 'emerald' }: { color?: 'emerald' | 'blue' | 'purple' | 'indigo' }) => {
    const colorClasses = {
      emerald: 'text-emerald-300 border-slate-600 focus:ring-emerald-500',
      blue: 'text-blue-300 border-slate-600 focus:ring-blue-500',
      purple: 'text-purple-300 border-slate-600 focus:ring-purple-500',
      indigo: 'text-indigo-300 border-slate-600 focus:ring-indigo-500'
    }[color];

    const iconColor = {
      emerald: 'text-emerald-400',
      blue: 'text-blue-400',
      purple: 'text-purple-400',
      indigo: 'text-indigo-400'
    }[color];

    return (
      <div className="flex items-center space-x-1 bg-slate-900/90 px-1.5 py-0.5 rounded-lg border border-slate-700 shrink-0">
        <UserCheck className={`w-3.5 h-3.5 ${iconColor} shrink-0`} />
        <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">
          Salesman:
        </label>
        <select
          value={filterSalesman}
          onChange={(e) => handleSalesmanFilterChange(e.target.value)}
          className={`bg-slate-800 ${colorClasses} font-bold border rounded px-1.5 py-0.5 text-xs focus:ring-1 focus:outline-none cursor-pointer max-w-[145px] truncate`}
        >
          <option value="all">All Salesmen</option>
          {visibleSalesmenOptions.map((sp) => (
            <option key={sp.id || sp.name} value={sp.name}>
              {sp.label}
            </option>
          ))}
        </select>
      </div>
    );
  };

  // Notification
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const reportPrintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (depBankName || depAccountName) {
      const generated = generateDisplayTag(depBankName, depAccountName);
      setDepDisplayTag(generated);
    }
  }, [depBankName, depAccountName]);

  const showNotify = (type: 'success' | 'error' | 'info', text: string) => {
    setNotification({ type: type === 'info' ? 'success' : type, text });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleAddNewCategory = (rawName: string): ExpenseCategoryItem => {
    const cleanName = rawName.replace(/^\d+[\.\s\-\)]+/, '').trim();
    if (!cleanName) return { serial: 1, name: '' };

    const existing = expenseCategories.find(
      (c) => c.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (existing) {
      return existing;
    }

    const nextSerial = expenseCategories.reduce((max, c) => Math.max(max, c.serial || 0), 0) + 1;
    const newCat: ExpenseCategoryItem = { serial: nextSerial, name: cleanName };

    setExpenseCategories((prev) => {
      const next = [...prev, newCat];
      onSyncCloud?.({ expenseCategories: next }, true);
      return next;
    });
    showNotify('success', `Added new category: "${nextSerial}. ${cleanName}"`);
    return newCat;
  };

  const handleSaveExpense = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!checkCanTakeEntry('Expense', (msg) => showNotify('error', msg))) {
      return;
    }

    // Guard against rapid duplicate submission (e.g. Enter on input + native form submit, or double clicking)
    if (isSavingExpenseRef.current) return;

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      showNotify('error', 'Please enter a valid expense amount.');
      amountInputRef.current?.focus();
      return;
    }

    if (!assignedEntity.trim()) {
      showNotify('error', 'Please select a Sales Center or Marketing Person to assign this expense.');
      return;
    }

    const headToUse = selectedHead === 'Custom...' ? customHead.trim() : selectedHead.trim();
    if (!headToUse || headToUse === 'Select Category') {
      showNotify('error', 'Please select a valid expense category.');
      categoryInputRef.current?.focus();
      return;
    }

    const now = Date.now();
    // Unique signature to detect identical rapid submissions within 2 seconds
    const submissionSig = `${entryDate}_${assignedEntity}_${headToUse}_${numericAmount}_${remarks.trim()}`;
    if (now - lastExpenseSubmitRef.current.timestamp < 2000 && lastExpenseSubmitRef.current.signature === submissionSig) {
      return; // Ignore duplicate execution
    }

    isSavingExpenseRef.current = true;
    lastExpenseSubmitRef.current = { timestamp: now, signature: submissionSig };
    setIsSavingExpense(true);

    const isCenter =
      branches.some((b) => cleanSalesCenterName(b.name).toLowerCase() === assignedEntity.toLowerCase()) ||
      assignedEntity.toLowerCase().includes('sales center') ||
      assignedEntity.toLowerCase().includes('showroom');
    const entityType = isCenter ? 'center' : 'marketing';

    const matchedBranch = branches.find(
      (b) =>
        cleanSalesCenterName(b.name).toLowerCase() === cleanSalesCenterName(assignedEntity).toLowerCase() ||
        (userBranch?.id && b.id === userBranch.id)
    ) || userBranch || branches[0];

    const targetBranchId = matchedBranch?.id || userBranch?.id || 'branch-1';
    const targetBranchName = matchedBranch?.name || userBranch?.name || 'Madhupur Sales Center';

    if (editingExpense) {
      const isApprovedOnEdit = Boolean(autoApproveHo && fundingPartyName.trim());
      const hoDepId = editingExpense.hoDepositId || (isApprovedOnEdit ? `dep-ho-${Date.now()}-${Math.random().toString(36).substring(2, 6)}` : undefined);
      const updatedExpense: ExpenseEntry = {
        ...editingExpense,
        date: entryDate,
        entityType,
        entityName: assignedEntity,
        expenseHead: headToUse,
        amount: numericAmount,
        remarks: remarks.trim(),
        monthRange,
        area: areaName,
        branchId: editingExpense.branchId || targetBranchId,
        branchName: editingExpense.branchName || targetBranchName,
        fundingPartyName: fundingPartyName.trim() || undefined,
        isApproved: isApprovedOnEdit,
        approvalStatus: isApprovedOnEdit ? 'approved' : 'pending',
        approvedAt: isApprovedOnEdit ? (editingExpense.approvedAt || new Date().toISOString()) : undefined,
        hoDepositId: isApprovedOnEdit ? hoDepId : undefined,
        updatedAt: new Date().toISOString()
      };

      setExpenses((prev) => {
        const updated = prev.map((item) => (item.id === editingExpense.id ? updatedExpense : item));
        try {
          localStorage.setItem('polycables_expenses', JSON.stringify(updated));
        } catch (err) {}
        if (onSyncCloud) {
          onSyncCloud({ expenses: updated }, true);
        }
        return updated;
      });

      setEditingExpense(null);
      setAmount('');
      setRemarks('');
      setSelectedHead('');
      setCustomHead('');
      setFundingPartyName('');
      setAutoApproveHo(true);
      showNotify('success', `Expense voucher updated successfully!`);
      setActiveTab('directory');
      setTimeout(() => {
        isSavingExpenseRef.current = false;
        setIsSavingExpense(false);
      }, 400);
      return;
    }

    const newEntry: ExpenseEntry = {
      id: 'exp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      date: entryDate,
      entityType,
      entityName: assignedEntity,
      expenseHead: headToUse,
      amount: numericAmount,
      remarks: remarks.trim(),
      monthRange,
      area: areaName,
      branchId: targetBranchId,
      branchName: targetBranchName,
      createdBy: currentUser?.name || currentUser?.username || 'Staff',
      createdById: currentUser?.id,
      updatedAt: new Date().toISOString()
    };

    setExpenses((prev) => {
      const updated = [newEntry, ...prev];
      try {
        localStorage.setItem('polycables_expenses', JSON.stringify(updated));
      } catch (err) {}
      if (onSyncCloud) {
        onSyncCloud({ expenses: updated }, true);
      }
      return updated;
    });

    setAmount('');
    setRemarks('');
    setSelectedHead('');
    setCustomHead('');
    setFundingPartyName('');
    setAutoApproveHo(true);
    try {
      if (assignedEntity.trim()) {
        localStorage.setItem('polycables_last_assigned_expense_entity', assignedEntity.trim());
      }
    } catch (e) {}
    showNotify('success', `Expense of ৳${numericAmount.toLocaleString('en-IN')} added under ${assignedEntity}!`);

    // Quick Expense workflow: remember Assign Expense To, and automatically move focus to Date input
    setTimeout(() => {
      isSavingExpenseRef.current = false;
      setIsSavingExpense(false);
      dateInputRef.current?.focus();
      dateInputRef.current?.select();
    }, 250);
  };

  const handleStartEditExpense = (exp: ExpenseEntry) => {
    setEditModalExpense(exp);
  };

  const handleStartFullFormEditExpense = (exp: ExpenseEntry) => {
    setEditingExpense(exp);
    setAssignedEntity(exp.entityName || 'Madhupur Sales Center');
    setEntryDate(formatDateDDMMYY(exp.date));
    setAreaName(exp.area || '');
    setSelectedHead(exp.expenseHead || '');
    setAmount(exp.amount ? exp.amount.toString() : '');
    setRemarks(exp.remarks || '');
    setFundingPartyName(exp.fundingPartyName || '');
    setAutoApproveHo(Boolean(exp.isApproved));
    setActiveTab('entry');
    showNotify('success', `Editing Expense Voucher in Quick Entry mode.`);
  };

  const handleCancelEditExpense = () => {
    setEditingExpense(null);
    setAmount('');
    setRemarks('');
    setSelectedHead('');
    setCustomHead('');
    setFundingPartyName('');
    setAutoApproveHo(true);
    setAssignedEntity(initialQuickExpenseEntity);
    setAreaName(initialQuickExpenseArea);
  };

  // Merge and persist clean non-auto, non-deleted deposits across state and both storage keys
  const mergeAndPersistDeposits = (
    upsertList: BankDeposit[] = [],
    excludeIds: Set<string> = new Set(),
    baseList: BankDeposit[] = bankDeposits || []
  ): BankDeposit[] => {
    const mergedMap = new Map<string, BankDeposit>();
    const addClean = (list: any[]) => {
      if (!Array.isArray(list)) return;
      list.forEach((d: any) => {
        if (
          !d ||
          typeof d !== 'object' ||
          !d.id ||
          d.isAutoDeposit ||
          String(d.id).startsWith('auto-ho-') ||
          excludeIds.has(d.id) ||
          isGloballyDeletedId(d.id)
        ) {
          return;
        }
        if (!mergedMap.has(d.id)) {
          mergedMap.set(d.id, d);
        }
      });
    };

    upsertList.forEach((d) => {
      if (d && d.id && !excludeIds.has(d.id) && !isGloballyDeletedId(d.id)) {
        mergedMap.set(d.id, d);
      }
    });
    addClean(baseList);
    try {
      const savedPrimary = localStorage.getItem('polycables_bank_deposits');
      if (savedPrimary) addClean(JSON.parse(savedPrimary));
    } catch {}
    try {
      const savedHistory = localStorage.getItem('depositHistory');
      if (savedHistory) addClean(JSON.parse(savedHistory));
    } catch {}

    const snapshot = Array.from(mergedMap.values());
    try {
      localStorage.setItem('polycables_bank_deposits', JSON.stringify(snapshot));
      localStorage.setItem('depositHistory', JSON.stringify(snapshot));
    } catch {}
    window.dispatchEvent(
      new CustomEvent('polycables_deposits_updated', {
        detail: upsertList.length > 0 ? { deposits: upsertList } : {}
      })
    );
    return snapshot;
  };

  // Save edited Collection MR (including H/O type collections and Cheque Pass completion)
  const handleSaveEditedCollection = (updated: CollectionMR) => {
    const nowIso = new Date().toISOString();
    let stampedUpdated: CollectionMR = { ...updated, updatedAt: nowIso };
    let nextCollections = collections.map((c) => (c.id === stampedUpdated.id ? stampedUpdated : c));

    let nextDeposits: BankDeposit[] | undefined;
    if (setBankDeposits && (stampedUpdated.bankDepositId || stampedUpdated.id)) {
      const currentClean = (bankDeposits || []).filter(
        (d) => d && !d.isAutoDeposit && !String(d.id || '').startsWith('auto-ho-') && !isGloballyDeletedId(d.id)
      );
      let foundLinkedDeposit = false;
      const updatedDepositsList: BankDeposit[] = [];

      const mapped = currentClean.map((d) => {
        if (
          d.id === stampedUpdated.bankDepositId ||
          d.collectionMrId === stampedUpdated.id ||
          (d.voucherNo === stampedUpdated.mrNo && (d.displayTag === 'H/O' || d.bankName === 'H/O') && isSameSalesCenterForDepositMatch(stampedUpdated, d, branches, parties, effectiveAllSalespersons))
        ) {
          foundLinkedDeposit = true;
          const patched: BankDeposit = {
            ...d,
            date: stampedUpdated.passDate?.trim() && stampedUpdated.paymentType === 'cheque' ? (d.date || stampedUpdated.passDate) : stampedUpdated.date,
            depositDate: stampedUpdated.passDate?.trim() && stampedUpdated.paymentType === 'cheque' ? (d.depositDate || stampedUpdated.passDate) : stampedUpdated.date,
            customerName: stampedUpdated.partyName,
            partyName: stampedUpdated.partyName,
            amount: stampedUpdated.amount,
            entityName: stampedUpdated.entityName,
            chequeNo: stampedUpdated.paymentType === 'cheque' ? (stampedUpdated.chequeNo || (d as any).chequeNo) : (d as any).chequeNo,
            status: stampedUpdated.paymentType === 'cheque' && stampedUpdated.passDate?.trim() ? 'Confirmed' : (d as any).status,
            updatedAt: nowIso
          } as BankDeposit;
          updatedDepositsList.push(patched);
          return patched;
        }
        return d;
      });

      // If a cheque collection is marked with a Pass Date and didn't have a BankDeposit record yet, create one now
      if (!foundLinkedDeposit && stampedUpdated.paymentType === 'cheque' && stampedUpdated.passDate?.trim()) {
        const passDateStr = formatDateDDMMYY(stampedUpdated.passDate) || stampedUpdated.passDate.trim();
        const rawBank = ((stampedUpdated as any).targetBankName || stampedUpdated.bankName || (bankList && bankList[0]) || 'Pubali Bank PLC').trim();
        const fullBank = resolveFullBankName(rawBank, bankList) || rawBank;
        const fullAcc = resolveFullAccountName(stampedUpdated.accountName || (accountList && accountList[0]) || 'Padma Enterprise', accountList) || 'Padma Enterprise';
        const bShort = getBankShortCode(fullBank);
        const aShort = getAccountShortCode(fullAcc);
        const tag = generateDisplayTag(fullBank, fullAcc) || `${bShort}(${aShort})`;
        const passDepositId = `dep-pass-${stampedUpdated.id}`;
        const matchedParty = (parties || []).find(
          (p) => p.name.trim().toLowerCase() === (stampedUpdated.partyName || '').trim().toLowerCase()
        );

        const newPassDeposit: BankDeposit = {
          id: passDepositId,
          date: passDateStr,
          depositDate: passDateStr,
          branchId: stampedUpdated.branchId || matchedParty?.branchId || undefined,
          branchName: stampedUpdated.branchName || matchedParty?.branchName || 'Madhupur Sales Center',
          entityName: stampedUpdated.marketingPerson || stampedUpdated.entityName || stampedUpdated.branchName || 'Madhupur Sales Center',
          customerName: stampedUpdated.partyName,
          partyName: stampedUpdated.partyName,
          customerAddress: matchedParty?.address || 'Madhupur',
          marketingPerson: stampedUpdated.marketingPerson || matchedParty?.salespersonName || '',
          collectionMrId: stampedUpdated.id,
          voucherNo: stampedUpdated.mrNo,
          slipNo: stampedUpdated.chequeNo || stampedUpdated.mrNo || passDepositId,
          chequeNo: stampedUpdated.chequeNo || undefined,
          referenceCode: stampedUpdated.chequeNo || stampedUpdated.mrNo,
          depositedBy: currentUser?.name || currentUser?.username || stampedUpdated.marketingPerson || 'Accounts Officer',
          createdBy: currentUser?.username || currentUser?.name || undefined,
          depositType: 'Cheque Deposit',
          status: 'Confirmed',
          bankName: fullBank,
          targetBankName: fullBank,
          accountName: fullAcc,
          accountShortTag: aShort,
          depositBankTag: tag,
          bankShortCode: bShort,
          accountShortCode: aShort,
          displayTag: tag,
          amount: Number(stampedUpdated.amount) || 0,
          remarks: stampedUpdated.remarks || `Cheque #${stampedUpdated.chequeNo || ''} Passed (${passDateStr})`,
          savedAt: nowIso,
          updatedAt: nowIso
        } as BankDeposit;

        updatedDepositsList.push(newPassDeposit);
        stampedUpdated = {
          ...stampedUpdated,
          isDeposited: true,
          bankDepositId: passDepositId,
          depositDate: passDateStr,
          depositBankTag: tag,
          targetBankName: fullBank,
          accountName: fullAcc
        } as CollectionMR;
        nextCollections = nextCollections.map((c) => (c.id === stampedUpdated.id ? stampedUpdated : c));
        nextDeposits = mergeAndPersistDeposits([newPassDeposit], new Set(), mapped);
      } else if (foundLinkedDeposit) {
        nextDeposits = mergeAndPersistDeposits(updatedDepositsList, new Set(), mapped);
      }

      if (nextDeposits) {
        setBankDeposits(nextDeposits);
      }
    }

    setCollections(nextCollections);
    try {
      localStorage.setItem('polycables_collections', JSON.stringify(nextCollections));
    } catch (err) {}

    let nextExpenses: ExpenseEntry[] | undefined;
    // Synchronize linked Expense Voucher if H/O
    setExpenses((prev) => {
      const next = prev.map((exp) => {
        if (exp.hoDepositId && exp.hoDepositId === stampedUpdated.bankDepositId) {
          return {
            ...exp,
            date: stampedUpdated.date,
            fundingPartyName: stampedUpdated.partyName,
            amount: stampedUpdated.amount
          };
        }
        return exp;
      });
      nextExpenses = next;
      try {
        localStorage.setItem('polycables_expenses', JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    // Immediate cloud sync with zero delay
    if (onSyncCloud) {
      onSyncCloud({
        collections: nextCollections,
        ...(nextDeposits ? { bankDeposits: nextDeposits } : {}),
        ...(nextExpenses ? { expenses: nextExpenses } : {})
      }, true);
    }

    // Background sync to backend hub
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: getClientSyncId(),
        patch: {
          collections: nextCollections,
          ...(nextDeposits ? { bankDeposits: nextDeposits } : {}),
          ...(nextExpenses ? { expenses: nextExpenses } : {})
        }
      })
    }).catch((err) => {
      console.warn('[Collection Edit Sync Note]:', err);
    });

    setEditingCollection(null);
    showNotify('success', `Collection MR ${stampedUpdated.mrNo} updated successfully!`);
  };

  const handleDeleteEditedCollection = (collectionId: string) => {
    const target = collections.find((c) => c.id === collectionId);
    const nextCollections = collections.filter((c) => c.id !== collectionId);
    setCollections(nextCollections);
    try {
      localStorage.setItem('polycables_collections', JSON.stringify(nextCollections));
    } catch (err) {}

    recordDeletedEntityId(collectionId);
    const deletedIds = [collectionId];
    if (target?.bankDepositId) {
      recordDeletedEntityId(target.bankDepositId);
      deletedIds.push(target.bankDepositId);
    }

    let nextDeposits: BankDeposit[] | undefined;
    if (setBankDeposits && target) {
      const matchedDepositIds = (bankDeposits || [])
        .filter(
          (d) =>
            d.id === target.bankDepositId ||
            d.collectionMrId === target.id ||
            (d.voucherNo === target.mrNo && (d.displayTag === 'H/O' || d.bankName === 'H/O') && isSameSalesCenterForDepositMatch(target, d, branches, parties, effectiveAllSalespersons))
        )
        .map((d) => d.id);
      matchedDepositIds.forEach((dId) => recordDeletedEntityId(dId));
      const excludeSet = new Set<string>([...matchedDepositIds, ...(target.bankDepositId ? [target.bankDepositId] : [])]);
      nextDeposits = mergeAndPersistDeposits([], excludeSet, bankDeposits || []);
      setBankDeposits(nextDeposits);
    }

    // Immediate cloud sync with zero delay
    if (onSyncCloud) {
      onSyncCloud({
        collections: nextCollections,
        ...(nextDeposits ? { bankDeposits: nextDeposits } : {}),
        deletedEntityIds: getGlobalDeletedIds()
      }, true);
    }

    // Background API delete notification
    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: getClientSyncId(),
        ids: deletedIds,
        type: 'collection'
      })
    }).catch((err) => {
      console.warn('[Collection Delete Note]:', err);
    });

    setEditingCollection(null);
    showNotify('info', `Collection MR #${target?.mrNo || ''} has been deleted.`);
  };

  const handleSaveCollection = (e?: React.FormEvent, bypassDupCheck: boolean = false) => {
    if (e) e.preventDefault();

    if (!checkCanTakeEntry('Collection', (msg) => showNotify('error', msg))) {
      return;
    }

    // Check if rows have any content entered
    const rowsToProcess = mrPartyRows.filter(
      (r) => r.partyName.trim() || (parseFloat(r.amount) > 0)
    );

    // If no row has party or amount, check if the single/legacy field has values
    const effectiveRows: PartyCollectionEntryRow[] = rowsToProcess.length > 0
      ? rowsToProcess
      : (mrPartyName.trim() || parseFloat(mrAmount) > 0
          ? [{
              id: 'prow-1',
              partyName: mrPartyName === 'Custom...' ? customPartyName.trim() : mrPartyName.trim(),
              amount: mrAmount,
              remarks: mrRemarks,
              paymentType: mrPaymentType,
              bankName: mrBankName,
              chequeNo: mrChequeNo,
              passDate: mrPassDate
            }]
          : []);

    if (effectiveRows.length === 0) {
      showNotify('error', 'Please enter at least one Party Name and Collection Amount.');
      return;
    }

    // Validate each row
    for (let i = 0; i < effectiveRows.length; i++) {
      const r = effectiveRows[i];
      if (!r.partyName.trim()) {
        showNotify('error', `Row #${i + 1}: Please select or enter a Party Name.`);
        return;
      }
      const numAmt = parseFloat(r.amount);
      if (isNaN(numAmt) || numAmt <= 0) {
        showNotify('error', `Row #${i + 1} (${r.partyName}): Please enter a valid Collection Amount.`);
        return;
      }
      const pType = r.paymentType || mrPaymentType;
      if (pType === 'cheque') {
        const bName = r.bankName || mrBankName;
        const cNo = r.chequeNo || mrChequeNo;
        if (!bName) {
          showNotify('error', `Row #${i + 1} (${r.partyName}): Please select a Bank Name for cheque payment.`);
          return;
        }
        if (!cNo?.trim()) {
          showNotify('error', `Row #${i + 1} (${r.partyName}): Please enter the Cheque Number.`);
          return;
        }
      }
    }

    const cleanMrDate = formatDateDDMMYY(mrDate) || mrDate;
    const firstRowCenter = resolvePartySalesCenter(effectiveRows[0]?.partyName || '');
    const collectionTargetCenter =
      userFixedSalesCenter ||
      mrPartyFixedBranch ||
      firstRowCenter ||
      resolveEntityToSalesCenter(mrEntity, effectiveAllBranches, effectiveAllSalespersons) ||
      mrEntity ||
      'Madhupur Sales Center';
    const baseMrNo =
      mrNo.trim() ||
      computeNextSalesCenterMrNo(
        collections,
        collectionTargetCenter,
        effectiveAllBranches,
        parties,
        effectiveAllSalespersons
      );

    // Parse base MR prefix and starting number for sequential allocation
    let basePrefix = 'MR-';
    let baseNum = 0;
    let padLen = 2;
    const matchDigits = baseMrNo.match(/^(.*?)(\d+)$/);
    if (matchDigits) {
      basePrefix = matchDigits[1];
      baseNum = parseInt(matchDigits[2], 10);
      padLen = Math.max(2, matchDigits[2].length);
    }

    const newCollections: CollectionMR[] = [];
    const newPartiesToAdd: Party[] = [];

    effectiveRows.forEach((row, idx) => {
      const rowMrNo = matchDigits
        ? `${basePrefix}${String(baseNum + idx).padStart(padLen, '0')}`
        : (effectiveRows.length > 1 ? `${baseMrNo}-${idx + 1}` : baseMrNo);

      const rawParty = row.partyName.trim();
      const resolved = safeResolvePartyAndMarketing({ partyName: rawParty }, parties, salespersons, collections);
      const cleanPartyName = cleanSelectedPartyName(resolved.partyName || rawParty);

      // Find matched party in existing directory
      const matchedParty = (parties || []).find(
        (p) => p.name.trim().toLowerCase() === cleanPartyName.toLowerCase() ||
               p.name.trim().toLowerCase() === rawParty.toLowerCase()
      );

      // Determine assigned salesperson
      const spFromEntity = effectiveAllSalespersons.find((s) => s.name.toLowerCase() === mrEntity.trim().toLowerCase());
      const assignedSpName =
        matchedParty?.salespersonName ||
        (resolved.marketingPerson && resolved.marketingPerson !== '-' ? resolved.marketingPerson : undefined) ||
        (spFromEntity ? spFromEntity.name : undefined) ||
        userLoginFilters.salesmanName ||
        'Subrata Sutradhar';

      const assignedSpObj = effectiveAllSalespersons.find((s) => s.name.toLowerCase() === assignedSpName.toLowerCase());
      const assignedSpCode =
        matchedParty?.salesmanCode ||
        resolved.salesmanCode ||
        assignedSpObj?.code ||
        '134';

      // Determine assigned sales center / showroom consistently from target center & full branch catalog
      const resolvedTargetCenter =
        resolveEntityToSalesCenter(collectionTargetCenter, effectiveAllBranches, effectiveAllSalespersons) ||
        collectionTargetCenter;
      const branchFromTarget = effectiveAllBranches.find(
        (b) =>
          b.name.toLowerCase().trim() === resolvedTargetCenter.trim().toLowerCase() ||
          cleanSalesCenterName(b.name).toLowerCase() === cleanSalesCenterName(resolvedTargetCenter).toLowerCase()
      );
      const assignedBranch =
        branchFromTarget?.name ||
        resolvedTargetCenter ||
        matchedParty?.branchName ||
        (assignedSpObj ? getSalesmanBranchName(assignedSpObj) : undefined) ||
        userLoginFilters.branchName ||
        (userBranch?.name ? cleanSalesCenterName(userBranch.name) : undefined) ||
        'Madhupur Sales Center';

      const assignedBranchId =
        branchFromTarget?.id ||
        effectiveAllBranches.find((b) => normalizeSalesCenter(b.name).toLowerCase() === normalizeSalesCenter(assignedBranch).toLowerCase())?.id ||
        matchedParty?.branchId ||
        'branch-1';

      const pType = row.paymentType || mrPaymentType;
      const bName = pType === 'cheque' ? (row.bankName || mrBankName) : undefined;
      const cNo = pType === 'cheque' ? (row.chequeNo || mrChequeNo).trim() : undefined;
      const pDate = pType === 'cheque' ? (formatDateDDMMYY(row.passDate || mrPassDate) || mrPassDate) : undefined;
      const numAmt = parseFloat(row.amount);

      newCollections.push({
        id: `mr-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
        date: cleanMrDate,
        mrNo: rowMrNo,
        entityName: mrEntity || assignedBranch,
        partyName: cleanPartyName,
        paymentType: pType,
        bankName: bName,
        chequeNo: cNo,
        passDate: pDate,
        amount: numAmt,
        remarks: row.remarks?.trim() || mrRemarks.trim() || '',
        branchId: assignedBranchId,
        branchName: assignedBranch,
        marketingPerson: assignedSpName,
        salesmanCode: assignedSpCode,
        createdBy: currentUser?.name || currentUser?.username || 'Staff'
      });

      // Never auto-add extra parties on collection save
    });

    const prevCollections = [...collections];
    const prevParties = [...(parties || [])];
    const updated = [...newCollections, ...collections];
    setCollections(updated);
    try {
      localStorage.setItem('polycables_collections', JSON.stringify(updated));
    } catch (e) {}

    // Auto-save new party in Customer Directory if not existing
    if (newPartiesToAdd.length > 0 && setParties) {
      setParties((prev) => {
        const nextParties = [...newPartiesToAdd, ...prev];
        try {
          localStorage.setItem('polycables_parties', JSON.stringify(nextParties));
        } catch (e) {}
        return nextParties;
      });
    }

    // Immediate cloud and database sync with zero delay
    if (onSyncCloud) {
      onSyncCloud({
        collections: updated,
        ...(newPartiesToAdd.length > 0 ? { parties: [...newPartiesToAdd, ...prevParties] } : {})
      }, true);
    }

    // Trigger immediate background sync with zero delay and optimistic rollback
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: getClientSyncId(),
        patch: {
          collections: updated,
          ...(newPartiesToAdd.length > 0 ? { parties: [...newPartiesToAdd, ...prevParties] } : {})
        }
      })
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Collection sync failed: ${res.status}`);
      })
      .catch((err) => {
        console.error('[Collection Create Sync Error]:', err);
        setCollections(prevCollections);
        try {
          localStorage.setItem('polycables_collections', JSON.stringify(prevCollections));
        } catch {}
        if (newPartiesToAdd.length > 0 && setParties) {
          setParties(prevParties);
          try {
            localStorage.setItem('polycables_parties', JSON.stringify(prevParties));
          } catch {}
        }
        showNotify('error', 'Cloud sync failed! Collection entries were rolled back.');
      });

    // Auto-increase MR Number for next entry (scoped to active Sales Center)
    const resetEntityCenter = userFixedSalesCenter || mrEntity || defaultCollectionAssignedEntity;
    const nextMr = computeNextSalesCenterMrNo(
      updated,
      resetEntityCenter,
      effectiveAllBranches,
      parties,
      effectiveAllSalespersons
    );
    setIsMrNoManuallyEdited(false);
    setMrNo(nextMr);
    setMrAmount('');
    setMrChequeNo('');
    setMrRemarks('');
    setMrPartyName('');
    setCustomPartyName('');
    setMrPartySearchQuery('');
    setIsMrPartyDropdownOpen(false);
    setMrPartyFixedBranch('');
    setMrEntity(resetEntityCenter);
    setMrPartyRows([
      {
        id: `prow-${Date.now()}`,
        partyName: '',
        amount: '',
        remarks: ''
      }
    ]);

    const totalSavedAmt = newCollections.reduce((s, c) => s + c.amount, 0);
    setCollectionSuccessModal({
      count: newCollections.length,
      totalAmount: totalSavedAmt,
      startingMr: newCollections[0]?.mrNo || baseMrNo,
      nextMr: nextMr,
      date: cleanMrDate,
      paymentType: mrPaymentType,
      savedItems: newCollections.map((c) => ({
        partyName: c.partyName || '',
        amount: c.amount,
        mrNo: c.mrNo
      }))
    });
    showNotify(
      'success',
      `Saved ${newCollections.length} MR (৳${totalSavedAmt.toLocaleString('en-IN')}) • Next: ${nextMr}`
    );
  };

  // Delete confirmation modal state
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    type: 'expense' | 'collection' | 'bankDeposit' | 'bulkCollection' | 'bulkBankDeposit';
    id?: string;
    ids?: string[];
    label?: string;
    amount?: number;
  } | null>(null);

  // Multi-select for Cash In Hand & Collection List
  const [selectedCashIds, setSelectedCashIds] = useState<string[]>([]);
  // Multi-select for Bank Deposits (Recorded Bank Deposits Statement & Deposit History)
  const [selectedDepositIds, setSelectedDepositIds] = useState<string[]>([]);

  // Bank Deposits Sorting State for both Deposited History & Cash In Hand Recorded Bank Deposits
  type BankDepositSortColumn = 'sl' | 'date' | 'depositeDate' | 'customer' | 'address' | 'officer' | 'tag' | 'amount' | 'remarks';
  const [depositSortCol, setDepositSortCol] = useState<BankDepositSortColumn>('date');
  const [depositSortDir, setDepositSortDir] = useState<'asc' | 'desc'>('desc');

  const handleToggleDepositSort = (col: BankDepositSortColumn) => {
    if (depositSortCol === col) {
      setDepositSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setDepositSortCol(col);
      setDepositSortDir(col === 'date' || col === 'amount' ? 'desc' : 'asc');
    }
  };
  const confirmDeleteBtnRef = useRef<HTMLButtonElement>(null);

  // Auto-focus confirm delete button when modal opens
  useEffect(() => {
    if (deleteConfirmTarget) {
      const timer = setTimeout(() => {
        confirmDeleteBtnRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [deleteConfirmTarget]);

  // Keyboard shortcut: Enter to confirm deletion, Esc to cancel
  useEffect(() => {
    if (!deleteConfirmTarget) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        executeConfirmDelete();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setDeleteConfirmTarget(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteConfirmTarget]);

  const toggleSelectCash = (id: string) => {
    setSelectedCashIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAllCash = (visibleList: CollectionMR[]) => {
    const visibleIds = visibleList.map((c) => c.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedCashIds.includes(id));
    if (allSelected) {
      setSelectedCashIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedCashIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleBulkDeleteCash = () => {
    if (selectedCashIds.length === 0) return;
    const selectedEntries = collections.filter((c) => selectedCashIds.includes(c.id));
    if (selectedEntries.length === 0) {
      setSelectedCashIds([]);
      return;
    }
    const validIds = selectedEntries.map((c) => c.id);
    const totalAmount = selectedEntries.reduce((sum, c) => sum + (c.amount || 0), 0);
    const names = selectedEntries.map((c) => c.partyName || 'Customer').slice(0, 3).join(', ');
    const label = `${validIds.length} Collections (${names}${validIds.length > 3 ? '...' : ''})`;
    setDeleteConfirmTarget({
      type: 'bulkCollection',
      ids: validIds,
      label,
      amount: totalAmount
    });
  };

  const toggleSelectDeposit = (id: string) => {
    setSelectedDepositIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAllDeposits = (visibleList: BankDeposit[]) => {
    const visibleIds = visibleList.map((d) => d.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedDepositIds.includes(id));
    if (allSelected) {
      setSelectedDepositIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedDepositIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleBulkDeleteDeposits = () => {
    if (selectedDepositIds.length === 0) return;
    const selectedEntries = bankDeposits.filter((d) => selectedDepositIds.includes(d.id));
    const totalAmount = selectedEntries.reduce((sum, d) => sum + (d.amount || 0), 0);
    const names = selectedEntries.map((d) => d.customerName || d.bankName || 'Deposit').slice(0, 3).join(', ');
    const label = `${selectedDepositIds.length} Bank Deposits (${names}${selectedEntries.length > 3 ? '...' : ''})`;
    setDeleteConfirmTarget({
      type: 'bulkBankDeposit',
      ids: selectedDepositIds,
      label,
      amount: totalAmount
    });
  };

  const handleDeleteExpense = (id: string, label?: string, amount?: number) => {
    setDeleteConfirmTarget({ type: 'expense', id, label, amount });
  };

  const handleDeleteCollection = (id: string, label?: string, amount?: number) => {
    setDeleteConfirmTarget({ type: 'collection', id, label, amount });
  };

  const executeConfirmDelete = () => {
    if (!deleteConfirmTarget) return;
    if (!checkCanTakeEntry('Delete ' + (deleteConfirmTarget.type || 'entry'), (msg) => showNotify('error', msg))) return;
    const { type, id, ids } = deleteConfirmTarget;
    if (type === 'bulkCollection' && ids && ids.length > 0) {
      ids.forEach((cId) => recordDeletedEntityId(cId));
      const prevCollections = [...collections];
      const count = ids.length;
      const toTrash = collections.filter((c) => ids.includes(c.id));
      moveMultipleToTrash('polycables_trashed_collections', toTrash, 'Collection / MR');
      try {
        const saved = localStorage.getItem('polycables_trashed_collections');
        const existing = saved ? JSON.parse(saved) : [];
        localStorage.setItem('polycables_trashed_collections', JSON.stringify([...toTrash, ...existing]));
      } catch (e) {}
      const next = collections.filter((c) => !ids.includes(c.id));
      setCollections(next);
      try {
        localStorage.setItem('polycables_collections', JSON.stringify(next));
      } catch (e) {}
      setSelectedCashIds((prev) => prev.filter((i) => !ids.includes(i)));

      // Immediate cloud sync with zero delay
      if (onSyncCloud) {
        onSyncCloud({ collections: next, deletedEntityIds: getGlobalDeletedIds() }, true);
      }

      // Background API delete request
      fetch('/api/sync/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: getClientSyncId(),
          ids,
          type: 'collection'
        })
      }).catch((err) => {
        console.warn('[Bulk Collection Delete Note]:', err);
      });

      showNotify('success', `${count} Collection entries moved to Trash.`);
    } else if (type === 'bulkBankDeposit' && ids && ids.length > 0) {
      const targetIdsSet = new Set(ids);
      (bankDeposits || []).forEach((d) => {
        if (ids.includes(d.id) && d.batchId) {
          (bankDeposits || []).forEach((m) => {
            if (m.batchId === d.batchId) targetIdsSet.add(m.id);
          });
        }
      });
      const allTargetIds = Array.from(targetIdsSet);
      const count = allTargetIds.length;
      const toTrash = (bankDeposits || []).filter((d) => allTargetIds.includes(d.id));
      if (toTrash.length > 0) {
        moveMultipleToTrash('polycables_trashed_deposits', toTrash, 'Bank Deposits');
      }
      if (setCollections) {
        setCollections((prev) =>
          prev.map((c) => {
            const matchedDep = toTrash.find(
              (d) =>
                d.id === c.bankDepositId ||
                d.collectionMrId === c.id ||
                (c.mrNo && d.voucherNo === c.mrNo && isSameSalesCenterForDepositMatch(c, d, branches, parties, effectiveAllSalespersons))
            );
            if ((c.bankDepositId && allTargetIds.includes(c.bankDepositId)) || matchedDep) {
              return {
                ...c,
                isDeposited: false,
                bankDepositId: undefined,
                depositDate: undefined,
                depositBankTag: undefined,
                bankName: (c.bankName || '').toUpperCase() === 'H/O' ? undefined : c.bankName
              };
            }
            return c;
          })
        );
      }
      allTargetIds.forEach((dId) => recordDeletedEntityId(dId));
      const cleanRemaining = mergeAndPersistDeposits([], targetIdsSet, bankDeposits || []);
      if (onDeleteBankDeposit) {
        allTargetIds.forEach((dId) => onDeleteBankDeposit(dId));
      } else if (setBankDeposits) {
        setBankDeposits(cleanRemaining);
      }
      if (onSyncCloud) {
        onSyncCloud({
          bankDeposits: cleanRemaining,
          deletedEntityIds: getGlobalDeletedIds()
        }, true);
      }
      setSelectedDepositIds((prev) => prev.filter((i) => !allTargetIds.includes(i)));
      showNotify('success', `${count} Bank Deposit entries moved to Trash.`);
    } else if (type === 'expense' && id) {
      const targetExp = expenses.find((e) => e.id === id);
      if (targetExp) {
        moveToTrash('polycables_trashed_expenses', targetExp, 'Expense Manager');
        if (targetExp.hoDepositId) {
          recordDeletedEntityId(targetExp.hoDepositId);
          const excludeSet = new Set<string>([targetExp.hoDepositId]);
          (bankDeposits || []).forEach((d) => {
            if (d.expenseId === targetExp.id) excludeSet.add(d.id);
          });
          const nextDeps = mergeAndPersistDeposits([], excludeSet, bankDeposits || []);
          if (setBankDeposits) {
            setBankDeposits(nextDeps);
          }
          setCollections((prev) => {
            const next = prev.map((c) =>
              c.bankDepositId === targetExp.hoDepositId
                ? { ...c, isDeposited: false, bankDepositId: undefined, depositDate: undefined, depositBankTag: undefined }
                : c
            );
            try {
              localStorage.setItem('polycables_collections', JSON.stringify(next));
            } catch (e) {}
            return next;
          });
        }
      }
      recordDeletedEntityId(id);
      fetch('/api/sync/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: getClientSyncId(), ids: [id], type: 'expense' })
      }).catch(() => {});

      setExpenses((prev) => {
        const next = prev.filter((e) => e.id !== id);
        try {
          localStorage.setItem('polycables_expenses', JSON.stringify(next));
        } catch (err) {}
        if (onSyncCloud) {
          onSyncCloud({ expenses: next, deletedEntityIds: getGlobalDeletedIds() }, true);
        }
        return next;
      });
      showNotify('success', 'Expense entry moved to Trash.');
    } else if (type === 'collection' && id) {
      recordDeletedEntityId(id);
      const toTrash = collections.filter((c) => c.id === id);
      const targetCol = toTrash[0];
      if (toTrash.length > 0) {
        moveToTrash('polycables_trashed_collections', targetCol, 'Collection / MR');
      }
      try {
        const saved = localStorage.getItem('polycables_trashed_collections');
        const existing = saved ? JSON.parse(saved) : [];
        localStorage.setItem('polycables_trashed_collections', JSON.stringify([...toTrash, ...existing]));
      } catch (e) {}
      const nextCollections = collections.filter((c) => c.id !== id);
      setCollections(nextCollections);
      try {
        localStorage.setItem('polycables_collections', JSON.stringify(nextCollections));
      } catch (e) {}

      // Immediate cloud sync with zero delay
      if (onSyncCloud) {
        onSyncCloud({ collections: nextCollections, deletedEntityIds: getGlobalDeletedIds() }, true);
      }

      // Background API delete notification
      fetch('/api/sync/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: getClientSyncId(),
          ids: [id],
          type: 'collection'
        })
      }).catch((err) => {
        console.warn('[Collection Delete Note]:', err);
      });

      if (targetCol) {
        const linkedDeps = (bankDeposits || []).filter(
          (d) =>
            d.id === targetCol.bankDepositId ||
            d.collectionMrId === targetCol.id ||
            (targetCol.mrNo && d.voucherNo === targetCol.mrNo && (d.displayTag === 'H/O' || d.bankName === 'H/O') && isSameSalesCenterForDepositMatch(targetCol, d, branches, parties, effectiveAllSalespersons))
        );
        if (linkedDeps.length > 0) {
          const linkedIds = new Set(linkedDeps.map((d) => d.id));
          linkedDeps.forEach((d) => recordDeletedEntityId(d.id));
          const nextDeps = mergeAndPersistDeposits([], linkedIds, bankDeposits || []);
          if (onDeleteBankDeposit) {
            linkedDeps.forEach((d) => onDeleteBankDeposit(d.id));
          } else if (setBankDeposits) {
            setBankDeposits(nextDeps);
          }
        }
      }
      setSelectedCashIds((prev) => prev.filter((i) => i !== id));
      showNotify('success', 'Collection entry moved to Trash.');
    } else if (type === 'bankDeposit' && id) {
      const targetDep = bankDeposits.find((d) => d.id === id);
      const batchDeposits = targetDep?.batchId
        ? bankDeposits.filter((d) => d.batchId === targetDep.batchId)
        : targetDep
        ? [targetDep]
        : [];
      const targetIds = batchDeposits.length > 0 ? batchDeposits.map((d) => d.id) : [id];
      const isHo = targetDep ? isHoDeposit(targetDep) : id.startsWith('auto-ho-');
      if (batchDeposits.length > 1) {
        moveMultipleToTrash('polycables_trashed_deposits', batchDeposits, 'Bank Deposits');
      } else if (targetDep) {
        moveToTrash('polycables_trashed_deposits', targetDep, 'Bank Deposits');
      }
      targetIds.forEach((dId) => recordDeletedEntityId(dId));
      const cleanRemaining = mergeAndPersistDeposits([], new Set(targetIds), bankDeposits || []);
      if (onDeleteBankDeposit) {
        targetIds.forEach((dId) => onDeleteBankDeposit(dId));
      } else if (setBankDeposits) {
        setBankDeposits(cleanRemaining);
      }
      if (onSyncCloud) {
        onSyncCloud({
          bankDeposits: cleanRemaining,
          deletedEntityIds: getGlobalDeletedIds()
        }, true);
      }

      // Revert linked collections and ensure they appear in Cash In Hand
      if (setCollections) {
        setCollections((prev) => {
          let foundLinked = false;
          const updated = prev.map((c) => {
            const matchesDepositId =
              (c.bankDepositId && targetIds.includes(c.bankDepositId)) ||
              batchDeposits.some((bd) => c.id === bd.collectionMrId || (c.mrNo && bd.voucherNo === c.mrNo && isSameSalesCenterForDepositMatch(c, bd, branches, parties, effectiveAllSalespersons)));
            const matchesNameAndAmt = batchDeposits.some(
              (bd) =>
                isSameSalesCenterForDepositMatch(c, bd, branches, parties, effectiveAllSalespersons) &&
                (c.partyName || '').trim().toLowerCase() === (bd.customerName || bd.partyName || '').trim().toLowerCase() &&
                Math.abs(c.amount - bd.amount) < 1
            );
            if (matchesDepositId || (c.isDeposited && matchesNameAndAmt)) {
              foundLinked = true;
              return {
                ...c,
                isDeposited: false,
                bankDepositId: undefined,
                depositDate: undefined,
                depositBankTag: undefined,
                bankName: (c.bankName || '').toUpperCase() === 'H/O' ? undefined : c.bankName
              };
            }
            return c;
          });

          // If this was a manual H/O deposit and NO existing collection was found in collections,
          // create a restored cash collection MR so the amount is guaranteed to be found on Cash In Hand page
          if (isHo && !foundLinked && targetDep && !targetDep.isAutoDeposit && !id.startsWith('auto-ho-')) {
            const restoredCollection: CollectionMR = {
              id: `mr-ho-restored-${Date.now()}`,
              mrNo: `MR-RESTORE-${Date.now().toString().slice(-4)}`,
              entityName: targetDep.entityName || 'Madhupur Sales Center',
              date: targetDep.date || formatDateDDMMYY(new Date().toISOString()),
              partyName: targetDep.customerName || targetDep.partyName || 'Customer Cash Restored',
              paymentType: 'cash',
              amount: targetDep.amount,
              salesperson: targetDep.marketingPerson || 'Sonjoy Chowhan',
              branchLocation: (targetDep.entityName as any) || 'Madhupur Sales Center',
              remarks: `Restored to Cash In Hand from deleted H/O Deposit (${targetDep.customerName || 'Party'})`,
              isDeposited: false
            };
            try {
              localStorage.setItem('polycables_collections', JSON.stringify([restoredCollection, ...updated]));
            } catch (e) {}
            return [restoredCollection, ...updated];
          }

          try {
            localStorage.setItem('polycables_collections', JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });
      }

      // If linked to an expense voucher, reset expense approval status
      if (targetDep && (targetDep.expenseId || isHo)) {
        setExpenses((prev) => {
          const next = prev.map((exp) => {
            if (
              (targetDep.expenseId && exp.id === targetDep.expenseId) ||
              (exp.hoDepositId && targetIds.includes(exp.hoDepositId))
            ) {
              return { ...exp, isApproved: false, hoDepositId: undefined };
            }
            return exp;
          });
          try {
            localStorage.setItem('polycables_expenses', JSON.stringify(next));
          } catch (e) {}
          return next;
        });
      }

      setSelectedDepositIds((prev) => prev.filter((i) => !targetIds.includes(i)));
      if (isHo) {
        showNotify('success', `H/O Deposit deleted. ৳${targetDep?.amount?.toLocaleString('en-IN') || ''} is now restored and found on Cash In Hand page.`);
      } else {
        showNotify('success', 'Bank deposit entry moved to Trash.');
      }
    }
    setDeleteConfirmTarget(null);
  };

  const handleSaveBankDeposit = (e?: React.FormEvent, sendMailNow: boolean = true): boolean => {
    if (e) e.preventDefault();

    if (!checkCanTakeEntry('Bank Deposit', (msg) => showNotify('error', msg))) {
      return false;
    }

    // Gather valid party entries
    let validRows = depPartyRows.filter((r) => {
      const amt = parseFloat(r.amount);
      return !isNaN(amt) && amt > 0 && r.customerName.trim().length > 0;
    });

    // Fallback if legacy single party fields were filled directly
    if (validRows.length === 0 && depCustomerName.trim() && parseFloat(depAmount) > 0) {
      validRows = [
        {
          id: 'row-single',
          customerName: depCustomerName.trim(),
          customerAddress: depCustomerAddress.trim() || 'Madhupur',
          marketingPerson: depMarketingPerson.trim() || 'Sanjoy Chowhan',
          amount: depAmount,
          selectedCollectionId: depSelectedCollectionId || undefined
        }
      ];
    }

    if (validRows.length === 0) {
      showNotify('error', 'Please enter at least one valid party deposit with Customer Name and Amount > 0.');
      return false;
    }

    const resolvedBank = (depBankName || '').trim();
    if (!resolvedBank) {
      showNotify('error', 'Please select or enter Target Bank Name.');
      return false;
    }
    const isTargetHO =
      resolvedBank.toLowerCase() === 'h/o' ||
      resolvedBank.toLowerCase() === 'h.o' ||
      resolvedBank.toLowerCase() === 'head office';

    const targetBankName = isTargetHO ? 'H/O' : (resolveFullBankName(resolvedBank, bankList) || resolvedBank);
    const resolvedAccount = isTargetHO ? 'Head Office' : (depAccountName || '').trim();
    if (!isTargetHO && !resolvedAccount) {
      showNotify('error', 'Please select or enter Account Name.');
      return false;
    }
    const targetAccountName = isTargetHO ? 'Head Office' : (resolveFullAccountName(resolvedAccount, accountList) || resolvedAccount);

    // Ensure custom / newly selected bank & account stay saved in directory lists across reloads
    if (!isTargetHO) {
      if (targetBankName && !bankList.some((b) => b.toLowerCase() === targetBankName.toLowerCase())) {
        handleAddBank(targetBankName);
      }
      if (targetAccountName && !accountList.some((a) => a.toLowerCase() === targetAccountName.toLowerCase())) {
        handleAddAccount(targetAccountName);
      }
    }

    const bShort = isTargetHO ? 'H/O' : getBankShortCode(targetBankName);
    const aShort = isTargetHO ? 'H/O' : getAccountShortCode(targetAccountName);
    const generatedFallbackTag = isTargetHO ? 'H/O' : (generateDisplayTag(targetBankName, targetAccountName) || `${bShort}(${aShort})`);
    const finalTag = isTargetHO
      ? 'H/O'
      : (depDisplayTag.trim() || generatedFallbackTag);

    const nowIso = new Date().toISOString();
    const isBatch = validRows.length > 1;
    const batchId = isBatch ? `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}` : undefined;
    const newDepositsCreated: BankDeposit[] = [];

    let updatedCollectionsSnapshot: CollectionMR[] = [...(collections || [])];
    const activeFilterBranchObj =
      filterEntity && filterEntity !== 'All' && filterEntity !== 'All Sales Centers'
        ? (effectiveAllBranches || []).find((b) => {
            const bClean = normalizeSalesCenter(b.name).toLowerCase();
            const fClean = normalizeSalesCenter(filterEntity).toLowerCase();
            return bClean === fClean || bClean.includes(fClean) || fClean.includes(bClean);
          })
        : undefined;

    validRows.forEach((row, idx) => {
      const numAmount = parseFloat(row.amount);
      const rowCustomer = cleanSelectedPartyName(row.customerName.trim());
      const matchedParty = (parties || []).find(
        (p) => p.name.trim().toLowerCase() === rowCustomer.toLowerCase()
      );
      let linkedCollection = row.selectedCollectionId
        ? updatedCollectionsSnapshot.find((c) => c.id === row.selectedCollectionId)
        : undefined;

      if (!linkedCollection && row.customerName.trim()) {
        const targetParty = rowCustomer.toLowerCase();
        linkedCollection =
          updatedCollectionsSnapshot.find(
            (c) =>
              !c.isDeposited &&
              (c.partyName || '').trim().toLowerCase() === targetParty &&
              Math.abs((Number(c.amount) || 0) - numAmount) < 1 &&
              (!c.date || !(depDate || formatDateDDMMYY(new Date())) || c.date === (depDate || formatDateDDMMYY(new Date()))) &&
              (depositModalType === 'cheque' ? isCheque(c) : !isCheque(c))
          ) ||
          updatedCollectionsSnapshot.find(
            (c) =>
              !c.isDeposited &&
              (c.partyName || '').trim().toLowerCase() === targetParty &&
              Math.abs((Number(c.amount) || 0) - numAmount) < 1 &&
              (depositModalType === 'cheque' ? isCheque(c) : true)
          );
      }

      const defaultAddrForBranch =
        activeFilterBranchObj?.address?.split(',')[0]?.trim() ||
        userBranch?.address?.split(',')[0]?.trim() ||
        (isTargetHO ? 'Head Office' : '');

      const rowAddress =
        (row.customerAddress?.trim() && row.customerAddress.trim() !== 'Madhupur'
          ? row.customerAddress.trim()
          : matchedParty?.address) ||
        row.customerAddress?.trim() ||
        defaultAddrForBranch ||
        (isTargetHO ? 'Head Office' : 'Madhupur');

      const rawMkt = row.marketingPerson?.trim();
      const rowMkt =
        linkedCollection?.marketingPerson?.trim() ||
        matchedParty?.salespersonName?.trim() ||
        (rawMkt && rawMkt !== 'Sanjoy Chowhan' && rawMkt !== 'Sonjoy Chowhan' ? rawMkt : '') ||
        (filterSalesman && filterSalesman !== 'all' ? filterSalesman : '') ||
        userLoginFilters.salesmanName ||
        rawMkt ||
        (depEntity && depEntity !== 'Sonjoy Chowhan' ? depEntity : '') ||
        currentUser?.name ||
        '';

      const matchedSp = rowMkt || matchedParty?.salesmanCode
        ? effectiveAllSalespersons.find(
            (s) =>
              (rowMkt && s.name.trim().toLowerCase() === rowMkt.toLowerCase()) ||
              (matchedParty?.salesmanCode && s.code?.toLowerCase() === matchedParty.salesmanCode.toLowerCase())
          )
        : undefined;

      const resolvedBranchObj =
        (linkedCollection?.branchId && effectiveAllBranches.find((b) => b.id === linkedCollection?.branchId)) ||
        (matchedParty?.branchId && effectiveAllBranches.find((b) => b.id === matchedParty.branchId)) ||
        (matchedSp?.branchId && effectiveAllBranches.find((b) => b.id === matchedSp.branchId)) ||
        activeFilterBranchObj ||
        userBranch ||
        effectiveAllBranches.find((b) => {
          const cand = normalizeSalesCenter(linkedCollection?.branchName || matchedParty?.branchName || depEntity || '').toLowerCase();
          const bClean = normalizeSalesCenter(b.name).toLowerCase();
          return cand && (bClean === cand || bClean.includes(cand) || cand.includes(bClean));
        });

      const resolvedBranchId =
        linkedCollection?.branchId ||
        matchedParty?.branchId ||
        resolvedBranchObj?.id ||
        matchedSp?.branchId ||
        '';
      const resolvedBranchName =
        normalizeSalesCenter(
          linkedCollection?.branchName ||
            matchedParty?.branchName ||
            resolvedBranchObj?.name ||
            matchedSp?.branchName ||
            (activeFilterBranchObj ? activeFilterBranchObj.name : '') ||
            'Madhupur Sales Center'
        ) || 'Madhupur Sales Center';

      const depositId = `dep-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`;
      const depositDateStr = depDate || formatDateDDMMYY(new Date());
      const isChequeDep = depositModalType === 'cheque' || Boolean(linkedCollection && isCheque(linkedCollection));
      const slipOrVoucher =
        (depRemarks || '').trim() ||
        linkedCollection?.mrNo ||
        `DEP-${Date.now().toString().slice(-6)}`;
      const depositorName = currentUser?.name || currentUser?.username || rowMkt || 'Accounts Officer';

      const newDeposit: BankDeposit = {
        id: depositId,
        batchId,
        date: depositDateStr,
        depositDate: depositDateStr,
        branchId: resolvedBranchId || undefined,
        branchName: resolvedBranchName,
        entityName: rowMkt || resolvedBranchName || depEntity,
        customerName: rowCustomer,
        partyName: rowCustomer,
        customerAddress: rowAddress,
        marketingPerson: rowMkt,
        collectionMrId: row.selectedCollectionId || linkedCollection?.id || undefined,
        voucherNo: linkedCollection?.mrNo || (depRemarks || '').trim() || undefined,
        slipNo: slipOrVoucher,
        chequeNo: linkedCollection?.chequeNo || undefined,
        referenceCode: (depRemarks || '').trim() || linkedCollection?.chequeNo || linkedCollection?.mrNo || slipOrVoucher,
        depositedBy: depositorName,
        createdBy: currentUser?.username || currentUser?.name || undefined,
        depositType: isChequeDep ? 'Cheque Deposit' : 'Cash Deposit',
        status: 'Confirmed',
        bankName: targetBankName,
        targetBankName: targetBankName,
        accountName: targetAccountName,
        accountShortTag: aShort,
        depositBankTag: finalTag,
        bankShortCode: bShort,
        accountShortCode: aShort,
        displayTag: finalTag,
        amount: numAmount,
        remarks: depRemarks || (linkedCollection?.chequeNo ? `Cheque #${linkedCollection.chequeNo}` : ''),
        slipImage: depSlipImage || undefined,
        emailSent: false,
        savedAt: nowIso,
        updatedAt: nowIso
      } as BankDeposit;

      newDepositsCreated.push(newDeposit);

      const targetCollectionId = row.selectedCollectionId || linkedCollection?.id;
      if (targetCollectionId) {
        updatedCollectionsSnapshot = updatedCollectionsSnapshot.map((c) =>
          c.id === targetCollectionId
            ? ({
                ...c,
                isDeposited: true,
                bankDepositId: newDeposit.id,
                depositDate: newDeposit.date,
                depositBankTag: finalTag,
                bankName: targetBankName,
                targetBankName: targetBankName,
                accountName: targetAccountName,
                accountShortTag: aShort,
                updatedAt: nowIso
              } as CollectionMR)
            : c
        );
      }
    });

    const createdIdSet = new Set(newDepositsCreated.map((d) => d.id));
    const nextDepositsSnapshot = mergeAndPersistDeposits(newDepositsCreated, createdIdSet, bankDeposits || []);

    if (setBankDeposits) {
      setBankDeposits((prev) => {
        const cleanPrev = (prev || []).filter(
          (d) => d && !d.isAutoDeposit && !String(d.id || '').startsWith('auto-ho-') && !createdIdSet.has(d.id) && !isGloballyDeletedId(d.id)
        );
        return [...newDepositsCreated, ...cleanPrev];
      });
    }

    if (setCollections) {
      setCollections(updatedCollectionsSnapshot);
    }
    try {
      localStorage.setItem('polycables_collections', JSON.stringify(updatedCollectionsSnapshot));
    } catch {}

    if (onSyncCloud) {
      onSyncCloud(
        {
          bankDeposits: nextDepositsSnapshot,
          collections: updatedCollectionsSnapshot
        },
        true
      );
    }
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: getClientSyncId(),
        patch: {
          bankDeposits: nextDepositsSnapshot,
          collections: updatedCollectionsSnapshot
        }
      })
    }).catch(() => {});

    const totalSum = newDepositsCreated.reduce((sum, d) => sum + d.amount, 0);

    if (sendMailNow && newDepositsCreated.length > 0) {
      setEmailModalDeposit(newDepositsCreated[0]);
      setEmailBatchDeposits(newDepositsCreated);
      showNotify(
        'success',
        `${newDepositsCreated.length} Bank Deposit(s) totaling ৳${totalSum.toLocaleString('en-IN')} saved! Opening Email notification...`
      );
    } else {
      showNotify(
        'success',
        `${newDepositsCreated.length} Deposit(s) ৳${totalSum.toLocaleString('en-IN')} saved (${targetBankName} • ${targetAccountName})!`
      );
    }

    // Reset Form
    setDepPartyRows([
      { id: 'dep-row-1', customerName: '', customerAddress: '', marketingPerson: '', amount: '' }
    ]);
    setDepAmount('');
    setDepRemarks('');
    setDepSlipImage('');
    setDepCustomerName('');
    setDepCustomerAddress('');
    setDepMarketingPerson('');
    setDepSelectedCollectionId('');
    setDepBankName('');
    setDepAccountName('');
    setDepDisplayTag('');
    return true;
  };

  const openBatchDepositEditor = (batchId: string) => {
    const batchItems = bankDeposits.filter((d) => d.batchId === batchId);
    if (batchItems.length === 0) return;
    const sample = batchItems[0];
    const resolvedBank = resolveFullBankName(sample.targetBankName || sample.bankName || (sample as any).bankShortCode || (sample as any).displayTag, bankList) || sample.targetBankName || sample.bankName || (bankList && bankList[0]) || 'Pubali Bank PLC';
    const resolvedAccount = resolveFullAccountName(sample.accountName || (sample as any).accountShortCode || (sample as any).depositBankTag || (sample as any).displayTag, accountList) || sample.accountName || (accountList && accountList[0]) || 'Padma Enterprise';
    setBatchEditBankName(resolvedBank);
    setBatchEditAccountName(resolvedAccount);
    setBatchEditDate(formatDateDDMMYY(sample.date));
    setBatchEditDisplayTag(sample.displayTag || generateDisplayTag(resolvedBank, resolvedAccount));
    setBatchEditRemarks(sample.remarks || '');
    setBatchEditSlipImage(sample.slipImage);
    setBatchEditShowCashInHand(true);
    setBatchEditCashSearch('');

    const rows = batchItems.map((item, idx) => ({
      id: item.id || `row-${idx}`,
      customerName: item.customerName || item.entityName || '',
      customerAddress: item.customerAddress || 'Madhupur',
      marketingPerson: item.marketingPerson || item.entityName || 'Sanjoy Chowhan',
      amount: String(item.amount),
      selectedCollectionId: item.collectionMrId || undefined
    }));
    setBatchEditPartyRows(rows);
  };

  const handleOpenEditBankDeposit = (dep: BankDeposit) => {
    if (dep.batchId) {
      const batchMatches = (bankDeposits || []).filter((d) => d.batchId === dep.batchId);
      if (batchMatches.length > 1) {
        openBatchDepositEditor(dep.batchId);
        return;
      }
    }
    singleToBatch(dep);
  };

  const singleToBatch = (dep: BankDeposit) => {
    const generatedBatchId = dep.batchId || `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const resolvedBank = resolveFullBankName(dep.targetBankName || dep.bankName || (dep as any).bankShortCode || (dep as any).displayTag, bankList) || dep.targetBankName || dep.bankName || (bankList && bankList[0]) || 'Pubali Bank PLC';
    const resolvedAccount = resolveFullAccountName(dep.accountName || (dep as any).accountShortCode || (dep as any).depositBankTag || (dep as any).displayTag, accountList) || dep.accountName || (accountList && accountList[0]) || 'Padma Enterprise';
    setEditingBankDeposit(null);
    setEditingBatchDeposits([{ ...dep, batchId: generatedBatchId }]);
    setBatchEditBankName(resolvedBank);
    setBatchEditAccountName(resolvedAccount);
    setBatchEditDate(resolveDepositDate(dep, collections) || formatDateDDMMYY(dep.date || dep.depositDate));
    setBatchEditDisplayTag(dep.displayTag || generateDisplayTag(resolvedBank, resolvedAccount));
    setBatchEditRemarks(dep.remarks || '');
    setBatchEditSlipImage(dep.slipImage);
    setBatchEditShowCashInHand(true);
    setBatchEditCashSearch('');
    setBatchEditPartyRows([
      {
        id: dep.id,
        customerName: dep.customerName || dep.entityName || '',
        customerAddress: dep.customerAddress || 'Madhupur',
        marketingPerson: dep.marketingPerson || dep.entityName || 'Sanjoy Chowhan',
        amount: String(dep.amount),
        selectedCollectionId: dep.collectionMrId || undefined
      }
    ]);
  };

  const handleSaveBatchChanges = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBatchDeposits || editingBatchDeposits.length === 0) return;

    const validRows = batchEditPartyRows.filter(
      (r) => r.customerName.trim() && parseFloat(r.amount) > 0
    );

    if (validRows.length === 0) {
      showNotify('error', 'Please enter at least one valid party entry with customer name and amount > 0.');
      return;
    }

    const resolvedBank = (batchEditBankName || '').trim() || (bankList && bankList[0] ? bankList[0] : 'Pubali Bank PLC');
    const isTargetHO =
      resolvedBank.toLowerCase() === 'h/o' ||
      resolvedBank.toLowerCase() === 'h.o' ||
      resolvedBank.toLowerCase() === 'head office';

    const targetBank = isTargetHO ? 'H/O' : resolveFullBankName(resolvedBank, bankList);
    const resolvedAcc = isTargetHO ? 'Head Office' : ((batchEditAccountName || '').trim() || (accountList && accountList[0] ? accountList[0] : 'Padma Enterprise'));
    const targetAcc = isTargetHO ? 'Head Office' : resolveFullAccountName(resolvedAcc, accountList);

    if (!isTargetHO) {
      if (targetBank && !bankList.some((b) => b.toLowerCase() === targetBank.toLowerCase())) {
        handleAddBank(targetBank);
      }
      if (targetAcc && !accountList.some((a) => a.toLowerCase() === targetAcc.toLowerCase())) {
        handleAddAccount(targetAcc);
      }
    }

    const bShort = isTargetHO ? 'H/O' : getBankShortCode(targetBank);
    const aShort = isTargetHO ? 'H/O' : getAccountShortCode(targetAcc);
    const generatedFallbackTag = isTargetHO ? 'H/O' : (generateDisplayTag(targetBank, targetAcc) || `${bShort} (${aShort})`);
    const finalTag = isTargetHO ? 'H/O' : (batchEditDisplayTag.trim() || generatedFallbackTag);
    const nowIso = new Date().toISOString();
    const batchId = editingBatchDeposits[0].batchId || `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const oldBatchDepositIds = editingBatchDeposits.map((d) => d.id);

    const updatedDeposits: BankDeposit[] = validRows.map((row, idx) => {
      const numAmt = parseFloat(row.amount);
      const existingDep = editingBatchDeposits.find((d) => d.id === row.id);
      return {
        ...existingDep,
        id: existingDep && existingDep.id ? existingDep.id : `dep-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        batchId,
        date: batchEditDate || formatDateDDMMYY(new Date()),
        depositDate: batchEditDate || existingDep?.depositDate || formatDateDDMMYY(new Date()),
        branchId: existingDep?.branchId || userBranch?.id || undefined,
        branchName: existingDep?.branchName || (userBranch?.name ? normalizeSalesCenter(userBranch.name) : undefined),
        entityName: row.marketingPerson.trim() || existingDep?.entityName || 'Madhupur Sales Center',
        customerName: row.customerName.trim(),
        partyName: row.customerName.trim(),
        customerAddress: row.customerAddress.trim() || 'Madhupur',
        marketingPerson: row.marketingPerson.trim() || 'Sanjoy Chowhan',
        collectionMrId: row.selectedCollectionId || undefined,
        depositType: existingDep?.depositType || (existingDep?.chequeNo ? 'Cheque Deposit' : 'Cash Deposit'),
        status: existingDep?.status || 'Confirmed',
        depositedBy: existingDep?.depositedBy || row.marketingPerson.trim() || currentUser?.name || 'Accounts Officer',
        referenceCode: existingDep?.referenceCode || batchEditRemarks || existingDep?.voucherNo,
        bankName: targetBank,
        targetBankName: targetBank,
        accountName: targetAcc,
        accountShortTag: aShort,
        depositBankTag: finalTag,
        bankShortCode: bShort,
        accountShortCode: aShort,
        displayTag: finalTag,
        amount: numAmt,
        remarks: batchEditRemarks,
        slipImage: batchEditSlipImage || undefined,
        emailSent: existingDep ? existingDep.emailSent : false,
        savedAt: existingDep?.savedAt || nowIso,
        updatedAt: nowIso
      } as BankDeposit;
    });

    // Update Bank Deposits and Collections with synchronous real-time cloud sync
    const oldBatchIdSet = new Set(oldBatchDepositIds);
    const updatedIdSet = new Set(updatedDeposits.map((d) => d.id));
    const excludeBatchSet = new Set<string>([...oldBatchIdSet, ...updatedIdSet]);
    const finalDeposits = mergeAndPersistDeposits(updatedDeposits, excludeBatchSet, bankDeposits || []);

    const newlyLinkedCollectionIds = validRows
      .map((r) => r.selectedCollectionId)
      .filter(Boolean) as string[];

    const finalCollections = (collections || []).map((c) => {
      // If this collection was linked to one of oldBatchDepositIds, but is NO LONGER linked in validRows:
      if (c.bankDepositId && oldBatchDepositIds.includes(c.bankDepositId) && !newlyLinkedCollectionIds.includes(c.id)) {
        return {
          ...c,
          isDeposited: false,
          bankDepositId: undefined,
          depositDate: undefined,
          depositBankTag: undefined,
          bankName: undefined,
          targetBankName: undefined,
          accountName: undefined,
          accountShortTag: undefined,
          updatedAt: nowIso
        } as CollectionMR;
      }
      // If this collection is selected in validRows:
      const matchingDeposit = updatedDeposits.find((d) => d.collectionMrId === c.id);
      if (matchingDeposit) {
        return {
          ...c,
          isDeposited: true,
          bankDepositId: matchingDeposit.id,
          depositDate: matchingDeposit.date,
          depositBankTag: finalTag,
          bankName: targetBank,
          targetBankName: targetBank,
          accountName: targetAcc,
          accountShortTag: aShort,
          updatedAt: nowIso
        } as CollectionMR;
      }
      return c;
    });

    if (setBankDeposits) {
      setBankDeposits((prev) => {
        const cleanPrev = (prev || []).filter(
          (d) => d && !d.isAutoDeposit && !String(d.id || '').startsWith('auto-ho-') && !oldBatchIdSet.has(d.id) && !updatedIdSet.has(d.id) && !isGloballyDeletedId(d.id)
        );
        return [...updatedDeposits, ...cleanPrev];
      });
    }

    if (setCollections) {
      setCollections(finalCollections);
      try {
        localStorage.setItem('polycables_collections', JSON.stringify(finalCollections));
      } catch (e) {}
    }

    if (onSyncCloud) {
      onSyncCloud({ bankDeposits: finalDeposits, collections: finalCollections }, true);
    }
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: getClientSyncId(), patch: { bankDeposits: finalDeposits, collections: finalCollections } })
    }).catch(() => {});

    const totalSum = updatedDeposits.reduce((s, d) => s + d.amount, 0);
    showNotify('success', `Deposit updated (${updatedDeposits.length} party, ৳${totalSum.toLocaleString('en-IN')})`);
    setEditingBatchDeposits(null);
  };

  const handleDeleteEntireBatch = () => {
    if (!editingBatchDeposits) return;
    const oldBatchDepositIds = editingBatchDeposits.map((d) => d.id);
    const totalSum = editingBatchDeposits.reduce((s, d) => s + d.amount, 0);
    const partyCount = editingBatchDeposits.length;

    moveMultipleToTrash('polycables_trashed_deposits', editingBatchDeposits, 'Bank Deposits');
    recordDeletedEntityIds(oldBatchDepositIds);

    fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: getClientSyncId(), ids: oldBatchDepositIds, type: 'deposit' })
    }).catch(() => {});

    if (onDeleteBankDeposit) {
      oldBatchDepositIds.forEach((dId) => onDeleteBankDeposit(dId));
    }

    const remainingDeposits = mergeAndPersistDeposits([], new Set(oldBatchDepositIds), bankDeposits || []);
    if (setBankDeposits) {
      setBankDeposits(remainingDeposits);
    }

    const updatedCollections = (collections || []).map((c) =>
      (c.bankDepositId && oldBatchDepositIds.includes(c.bankDepositId)) ||
      editingBatchDeposits.some((bd) => bd.collectionMrId === c.id)
        ? {
            ...c,
            isDeposited: false,
            bankDepositId: undefined,
            depositDate: undefined,
            depositBankTag: undefined,
            bankName: (c.bankName || '').toUpperCase() === 'H/O' ? undefined : c.bankName
          }
        : c
    );

    if (setCollections) {
      setCollections(updatedCollections);
      try {
        localStorage.setItem('polycables_collections', JSON.stringify(updatedCollections));
      } catch (e) {}
    }

    if (onSyncCloud) {
      onSyncCloud({
        bankDeposits: remainingDeposits,
        collections: updatedCollections,
        deletedEntityIds: getGlobalDeletedIds()
      }, true);
    }

    showNotify('success', `Deleted multi-party batch of ${partyCount} deposits totaling ৳${totalSum.toLocaleString('en-IN')}.`);
    setEditingBatchDeposits(null);
  };

  const handleDeleteBankDeposit = (id: string, label?: string, amount?: number) => {
    setDeleteConfirmTarget({ type: 'bankDeposit', id, label, amount });
  };

  // Filtered Expenses
  const filteredExpenses = useMemo(() => {
    const sTerm = search.trim().toLowerCase();
    const isSuperOrAcc = isSuperAdminOrAgm(currentUser) || isAccountsAdmin(currentUser);
    const allowedIds = new Set(allowedUserBranches.map((b) => b.id));
    const allowedNames = new Set(allowedUserBranches.map((b) => cleanSalesCenterName(b.name).toLowerCase()).filter(Boolean));

    const list = expenses.filter((e) => {
      // Scope non-super/non-accounts users strictly to their allowed branches (supporting multi-branch Regional Admins)
      if (!isSuperOrAcc && allowedUserBranches.length > 0) {
        const eBranchId = e.branchId || '';
        const eBranchClean = cleanSalesCenterName(e.branchName || '').toLowerCase();
        const eEntityClean = cleanSalesCenterName(e.entityName || '').toLowerCase();

        if (eBranchId && !allowedIds.has(eBranchId)) {
          return false;
        }
        if (eBranchClean && !Array.from(allowedNames).some((an) => eBranchClean === an || eBranchClean.includes(an) || an.includes(eBranchClean))) {
          return false;
        }
        if (eEntityClean && branches.some((b) => {
          const bClean = cleanSalesCenterName(b.name).toLowerCase();
          return bClean === eEntityClean && !allowedNames.has(bClean);
        })) {
          return false;
        }
      }

      let matchesDate = true;
      if (periodPreset !== 'all' && startDate && endDate) {
        const expIso = parseDateToISO(e.date);
        const startIso = parseDateToISO(startDate);
        const endIso = parseDateToISO(endDate);
        if (expIso && startIso && endIso) {
          matchesDate = expIso >= startIso && expIso <= endIso;
        }
      }
      const formattedDate = formatDateDDMMYY(e.date).toLowerCase();
      const amountStr = e.amount ? e.amount.toString() : '';
      const formattedAmount = e.amount ? e.amount.toLocaleString('en-IN') : '';

      const matchesSearch =
        !sTerm ||
        (e.expenseHead || '').toLowerCase().includes(sTerm) ||
        (e.entityName || '').toLowerCase().includes(sTerm) ||
        (e.remarks || '').toLowerCase().includes(sTerm) ||
        (e.area || '').toLowerCase().includes(sTerm) ||
        formattedDate.includes(sTerm) ||
        amountStr.includes(sTerm) ||
        formattedAmount.includes(sTerm);

      const filterTargetLow = (filterEntity || '').trim().toLowerCase();
      const filterTargetCleanLow = cleanSalesCenterName(filterEntity || '').trim().toLowerCase();
      const expEntityLow = (e.entityName || (e as any).assignedEntity || '').trim().toLowerCase();
      const expEntityCleanLow = cleanSalesCenterName(e.entityName || '').trim().toLowerCase();
      const expBranchCleanLow = cleanSalesCenterName(e.branchName || '').trim().toLowerCase();
      const matchesEntity =
        !filterEntity ||
        filterEntity === 'All' ||
        filterEntity === 'all' ||
        filterEntity === 'All Sales Centers' ||
        filterEntity.startsWith('All My Centers') ||
        expEntityLow === filterTargetLow ||
        (filterTargetCleanLow !== '' && (expEntityCleanLow === filterTargetCleanLow || expBranchCleanLow === filterTargetCleanLow));
      const matchesCategory =
        !filterExpenseCategory ||
        filterExpenseCategory === 'all' ||
        filterExpenseCategory === 'All' ||
        (e.expenseHead || '').trim().toLowerCase() === filterExpenseCategory.trim().toLowerCase();

      return matchesSearch && matchesEntity && matchesCategory && matchesDate;
    });

    return [...list].sort((a, b) => {
      let comp = 0;
      if (expenseSortField === 'sl') {
        const aNum = parseInt((a.id || '').replace(/\D/g, ''), 10) || 0;
        const bNum = parseInt((b.id || '').replace(/\D/g, ''), 10) || 0;
        comp = aNum - bNum;
      } else if (expenseSortField === 'date') {
        const aIso = parseDateToISO(a.date) || a.date || '';
        const bIso = parseDateToISO(b.date) || b.date || '';
        comp = aIso.localeCompare(bIso);
      } else if (expenseSortField === 'entityName') {
        comp = (a.entityName || '').localeCompare(b.entityName || '');
      } else if (expenseSortField === 'expenseHead') {
        comp = (a.expenseHead || '').localeCompare(b.expenseHead || '');
      } else if (expenseSortField === 'amount') {
        comp = (a.amount || 0) - (b.amount || 0);
      } else if (expenseSortField === 'periodMonth') {
        comp = (a.periodMonth || a.area || '').localeCompare(b.periodMonth || b.area || '');
      } else if (expenseSortField === 'remarks') {
        comp = (a.remarks || '').localeCompare(b.remarks || '');
      }
      return expenseSortDirection === 'asc' ? comp : -comp;
    });
  }, [expenses, search, filterEntity, filterExpenseCategory, startDate, endDate, expenseSortField, expenseSortDirection]);

  // Filtered Collections
  const filteredCollections = useMemo(() => {
    const list = collections.filter((c) => {
      const sTerm = search.trim().toLowerCase();
      const formattedDate = formatDateDDMMYY(c.date).toLowerCase();
      const amountStr = c.amount ? c.amount.toString() : '';
      const formattedAmount = c.amount ? c.amount.toLocaleString('en-IN') : '';
      const matchedParty = (parties || []).find((p) => p.name.trim().toLowerCase() === (c.partyName || '').trim().toLowerCase());
      const partyAddress = matchedParty?.address ? matchedParty.address.toLowerCase() : '';

      const matchesSearch =
        !sTerm ||
        (c.partyName || '').toLowerCase().includes(sTerm) ||
        (c.mrNo || '').toLowerCase().includes(sTerm) ||
        (c.bankName || '').toLowerCase().includes(sTerm) ||
        (c.chequeNo || '').toLowerCase().includes(sTerm) ||
        (c.entityName || '').toLowerCase().includes(sTerm) ||
        (c.remarks || '').toLowerCase().includes(sTerm) ||
        (c.paymentType || '').toLowerCase().includes(sTerm) ||
        partyAddress.includes(sTerm) ||
        (c.date || '').toLowerCase().includes(sTerm) ||
        formattedDate.includes(sTerm) ||
        amountStr.includes(sTerm) ||
        formattedAmount.includes(sTerm);
      
      const matchesEntityAndSalesman = collectionMatchesFilter(c);

      const matchesParty =
        !filterParty || filterParty === 'All' ||
        (c.partyName || '').toLowerCase().includes(filterParty.toLowerCase().trim());

      let matchesDate = true;
      if (startDate && endDate) {
        const cIso = parseDateToISO(c.date);
        const startIso = parseDateToISO(startDate);
        const endIso = parseDateToISO(endDate);
        if (cIso && startIso && endIso) {
          matchesDate = cIso >= startIso && cIso <= endIso;
        }
      }

      return matchesSearch && matchesEntityAndSalesman && matchesParty && matchesDate;
    });

    return [...list].sort((a, b) => {
      let comp = 0;
      if (collectionSortField === 'sl') {
        const aNum = parseInt((a.mrNo || '').replace(/\D/g, ''), 10) || 0;
        const bNum = parseInt((b.mrNo || '').replace(/\D/g, ''), 10) || 0;
        comp = aNum - bNum;
      } else if (collectionSortField === 'date') {
        const aIso = parseDateToISO(a.date) || a.date || '';
        const bIso = parseDateToISO(b.date) || b.date || '';
        comp = aIso.localeCompare(bIso);
      } else if (collectionSortField === 'partyName') {
        comp = (a.partyName || '').localeCompare(b.partyName || '');
      } else if (collectionSortField === 'entityName') {
        const getColSp = (c: CollectionMR) => {
          const mp = (parties || []).find((p) => p.name.trim().toLowerCase() === (c.partyName || '').trim().toLowerCase());
          return c.marketingPerson || c.salespersonName || mp?.salespersonName || (!c.entityName?.toLowerCase().includes('center') && !c.entityName?.toLowerCase().includes('store') ? c.entityName : '') || '';
        };
        comp = getColSp(a).localeCompare(getColSp(b));
      } else if (collectionSortField === 'paymentType') {
        comp = (a.paymentType || 'cash').localeCompare(b.paymentType || 'cash');
      } else if (collectionSortField === 'amount') {
        comp = (a.amount || 0) - (b.amount || 0);
      } else if (collectionSortField === 'remarks') {
        comp = (a.remarks || '').localeCompare(b.remarks || '');
      }
      return collectionSortDirection === 'asc' ? comp : -comp;
    });
  }, [collections, search, filterEntity, filterSalesman, filterParty, startDate, endDate, parties, collectionSortField, collectionSortDirection]);

  // Helper to determine if a collection is strictly a cheque record
  const isCheque = (c: CollectionMR): boolean => {
    if (!c) return false;
    const anyC = c as any;
    // Cash collections encashed from a cheque belong to Cash In Hand only
    if (c.convertedFromChequeId || anyC.convertedFromChequeId) return false;

    const pType = String(c.paymentType || anyC.payType || anyC.method || '').toLowerCase().trim();

    // Pure cash records are NEVER cheques
    if (pType === 'cash' || pType.includes('cash')) {
      return false;
    }

    const chqNum = String(c.chequeNo || anyC.cheque_no || anyC.chequeNumber || anyC.checkNo || anyC.chkNo || anyC.cqNo || '').trim();
    const hasValidChqNum = chqNum !== '' && chqNum !== '-' && chqNum !== 'n/a' && chqNum !== 'null' && chqNum !== 'undefined' && chqNum !== '0';

    // Explicit cheque payment type
    if (pType === 'cheque' || pType.includes('cheque') || pType.includes('check') || pType === 'cq' || pType === 'chq' || pType.includes('pay_order') || pType.includes('payorder')) {
      return true;
    }

    // Cheque lifecycle record (e.g. original cheque that was encashed into cash)
    if (c.chequeToCash || anyC.cheque_to_cash) {
      return true;
    }

    // Explicit valid cheque number present (when paymentType is not set or not cash)
    if (hasValidChqNum) {
      return true;
    }

    // Explicit cheque keywords in remarks
    const remarks = String(c.remarks || anyC.notes || anyC.note || '').toLowerCase();
    if (/\b(cheque|check|chq#|cq#|pay\s*order)\b/i.test(remarks) && (c.bankName || c.passDate || hasValidChqNum)) {
      return true;
    }

    return false;
  };

  // Handler to export collections / cash list / cheque list to Excel (.xlsx)
  const handleExportCollectionsXlsx = (mode: 'all' | 'cash' | 'cheque' | any = 'all') => {
    const activeMode: 'all' | 'cash' | 'cheque' = (mode === 'cash' || mode === 'cheque') ? mode : 'all';
    let listToExport: CollectionMR[];
    if (activeMode === 'cash') {
      listToExport = cashDepositFilter === 'pending'
        ? undepositedCashCollections
        : cashDepositFilter === 'deposited'
        ? cashCollectionsList.filter((col) => isCollectionDeposited(col))
        : cashCollectionsList;
    } else if (activeMode === 'cheque') {
      listToExport = collections.filter(isCheque);
    } else {
      listToExport = filteredCollections;
    }

    if (listToExport.length === 0) {
      showNotify('error', `No ${mode === 'cheque' ? 'cheque' : mode === 'cash' ? 'cash' : 'collection'} records found to export for the current filters.`);
      return;
    }

    const rows = listToExport.map((col, idx) => {
      const isDep = isCollectionDeposited(col);
      const depInfo = isDep ? getCollectionBankDepositDetails(col) : null;
      const typeStr = col.paymentType === 'cheque'
        ? 'Cheque'
        : (depInfo ? `${depInfo.bankTag}${depInfo.depositDate ? ` (${depInfo.depositDate})` : ''}` : 'Cash');

      if (mode === 'cheque') {
        const destStr = col.chequeToCash
          ? `Encashed to Cash (${col.chequeToCashDate || ''})`
          : isDep
          ? `Deposited to ${depInfo?.bankName || depInfo?.bankTag || 'Bank'} (A/C: ${depInfo?.accountNumber || ''}) on ${depInfo?.depositDate || col.depositDate || ''}`
          : 'Pending In Hand';

        return {
          'SL#': idx + 1,
          'Date': formatDateDDMMYY(col.date),
          'Party Name': getPartyDisplayWithAddress(col.partyName || ''),
          'Assigned Person / Center': col.entityName || '',
          'Bank Name': col.bankName || '',
          'Cheque No': col.chequeNo || '',
          'Pass Date': col.passDate ? formatDateDDMMYY(col.passDate) : '',
          'Amount (Tk)': col.amount,
          'Destination / Whereabouts': destStr,
          'Remarks': col.remarks || ''
        };
      }

      return {
        'SL#': idx + 1,
        'Date': formatDateDDMMYY(col.date),
        'Party Name': getPartyDisplayWithAddress(col.partyName || ''),
        'Assigned Marketing Person': col.entityName || '',
        'Type': typeStr,
        'Amount (Tk)': col.amount,
        'Remarks': col.remarks || ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    const sheetName = mode === 'cash' ? 'Cash_List' : mode === 'cheque' ? 'Cheque_List' : 'Collections';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const startStr = startDate ? startDate.replace(/\./g, '-') : 'all';
    const endStr = endDate ? endDate.replace(/\./g, '-') : 'all';
    const fileName = mode === 'cash' 
      ? `Cash_List_${startStr}_to_${endStr}.xlsx` 
      : mode === 'cheque'
      ? `Cheque_List_${startStr}_to_${endStr}.xlsx`
      : `Collections_List_${startStr}_to_${endStr}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showNotify('success', `Exported ${rows.length} ${mode === 'cash' ? 'cash' : mode === 'cheque' ? 'cheque' : 'collection'} records to Excel (${fileName})!`);
  };

  // Handler to export Bank Deposits to Excel (.xlsx)
  const handleExportDepositsXlsx = () => {
    const listToExport = filteredBankDeposits;
    if (listToExport.length === 0) {
      showNotify('error', 'No deposit records found to export for the current filters.');
      return;
    }

    const rows = listToExport.map((dep, idx) => {
      const depDate = dep.depositDate || dep.date || '';
      const pName = dep.customerName || dep.partyName || dep.entityName || '';
      const bankTag = dep.displayTag || getBankAndAccountShortTag(dep.bankName, dep.accountName, dep.bankName);

      return {
        'SL#': idx + 1,
        'Date': formatDateDDMMYY(depDate),
        'Party / Customer Name': pName,
        'Marketing Person': dep.marketingPerson || dep.entityName || '',
        'Sales Center': dep.branchName || '',
        'Bank Name': dep.bankName || '',
        'Account Name': dep.accountName || '',
        'Bank Tag': bankTag,
        'Account Number': dep.accountNumber || '',
        'Voucher / Slip No': dep.voucherNo || '',
        'Amount (Tk)': dep.amount,
        'Deposit Type': dep.depositType || 'Cash Deposit',
        'Remarks': dep.remarks || ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bank_Deposits');
    const startStr = startDate ? startDate.replace(/\./g, '-') : 'all';
    const endStr = endDate ? endDate.replace(/\./g, '-') : 'all';
    const fileName = `Bank_Deposits_${startStr}_to_${endStr}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showNotify('success', `Exported ${rows.length} bank deposit records to Excel (${fileName})!`);
  };

  // Handler to import Bank Deposits from Excel (.xlsx)
  const handleImportDepositsXlsx = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          showNotify('error', 'The uploaded Excel file contains no records.');
          return;
        }

        const newDeposits: BankDeposit[] = [];
        rawJson.forEach((row, idx) => {
          const rawDate = row['Date'] || row['date'] || row['Deposit Date'] || row['DEPOSIT DATE'] || '';
          const rawParty = row['Party / Customer Name'] || row['Party Name'] || row['Customer Name'] || row['Party'] || row['party'] || '';
          const rawMarketing = row['Marketing Person'] || row['Salesperson'] || row['Marketing'] || '';
          const rawBank = row['Bank Name'] || row['Bank'] || row['bank'] || '';
          const rawAccount = row['Account Name'] || row['Account'] || row['account'] || '';
          const rawTag = row['Bank Tag'] || row['Tag'] || '';
          const rawAccNo = row['Account Number'] || row['A/C No'] || row['Account No'] || '';
          const rawVoucher = row['Voucher / Slip No'] || row['Voucher No'] || row['Slip No'] || row['Ref No'] || '';
          const rawAmount = row['Amount (Tk)'] || row['Amount'] || row['amount'] || row['Total'] || 0;
          const rawType = row['Deposit Type'] || row['Type'] || 'Cash Deposit';
          const rawRemarks = row['Remarks'] || row['remarks'] || row['Note'] || '';

          const parsedAmt = parseExcelAmount(rawAmount);
          if (parsedAmt <= 0) return;

          let isoDate = parseExcelDateToISO(rawDate);
          if (!isoDate || isoDate === 'Invalid Date') {
            isoDate = new Date().toISOString().split('T')[0];
          }

          const resolvedBank = resolveFullBankName(rawBank, bankList);
          const resolvedAccount = resolveFullAccountName(rawAccount, accountList);
          const displayTag = rawTag || getBankAndAccountShortTag(resolvedBank, resolvedAccount, resolvedBank);

          const newDep: BankDeposit = {
            id: `dep-imp-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
            date: isoDate,
            depositDate: isoDate,
            entityName: rawMarketing || rawParty || 'Madhupur Sales Center',
            customerName: rawParty || undefined,
            partyName: rawParty || undefined,
            marketingPerson: rawMarketing || undefined,
            bankName: resolvedBank,
            accountName: resolvedAccount,
            accountNumber: rawAccNo ? String(rawAccNo) : undefined,
            voucherNo: rawVoucher ? String(rawVoucher) : undefined,
            displayTag,
            amount: parsedAmt,
            depositType: String(rawType).toLowerCase().includes('cheque') ? 'Cheque Deposit' : 'Cash Deposit',
            remarks: rawRemarks ? String(rawRemarks) : 'Imported via Excel'
          };
          newDeposits.push(newDep);
        });

        if (newDeposits.length === 0) {
          showNotify('error', 'No valid deposit records with amounts found in file.');
          return;
        }

        const cleanExisting = bankDeposits.filter(
          (d) => d && !d.isAutoDeposit && !String(d.id || '').startsWith('auto-ho-')
        );
        const updated = [...newDeposits, ...cleanExisting];
        setBankDeposits((prev) => {
          const cleanPrev = (prev || []).filter(
            (d) => d && !d.isAutoDeposit && !String(d.id || '').startsWith('auto-ho-')
          );
          return [...newDeposits, ...cleanPrev];
        });
        try {
          localStorage.setItem('polycables_bank_deposits', JSON.stringify(updated));
          localStorage.setItem('depositHistory', JSON.stringify(updated));
        } catch {}
        window.dispatchEvent(new CustomEvent('polycables_deposits_updated', { detail: { deposits: newDeposits } }));
        if (onSyncCloud) {
          onSyncCloud({ bankDeposits: updated }, true);
        }
        showNotify('success', `Successfully imported ${newDeposits.length} deposits from Excel!`);
      } catch (err: any) {
        console.error('Error importing deposits Excel:', err);
        showNotify('error', `Failed to read Excel file: ${err?.message || 'Invalid format'}`);
      }
    };
    reader.readAsBinaryString(file);
    if (depositXlsxFileInputRef.current) {
      depositXlsxFileInputRef.current.value = '';
    }
  };

  // Filtered Bank Deposits
  const filteredBankDeposits = bankDeposits.filter((d) => {
    const sTerm = search.trim().toLowerCase();
    const effectiveDateStr = d.date || d.depositDate || '';
    const formattedDate = formatDateDDMMYY(effectiveDateStr).toLowerCase();
    const amountStr = d.amount ? d.amount.toString() : '';
    const formattedAmount = d.amount ? d.amount.toLocaleString('en-IN') : '';

    const matchesSearch =
      !sTerm ||
      (d.bankName || '').toLowerCase().includes(sTerm) ||
      (d.accountName || '').toLowerCase().includes(sTerm) ||
      (d.accountNumber || '').toLowerCase().includes(sTerm) ||
      (d.branchName || '').toLowerCase().includes(sTerm) ||
      (d.displayTag || '').toLowerCase().includes(sTerm) ||
      getBankAndAccountShortTag(d.bankName || '', d.accountName || '', d.displayTag || '').toLowerCase().includes(sTerm) ||
      (d.entityName || '').toLowerCase().includes(sTerm) ||
      (d.customerName || '').toLowerCase().includes(sTerm) ||
      (d.partyName || '').toLowerCase().includes(sTerm) ||
      (d.customerAddress || '').toLowerCase().includes(sTerm) ||
      (d.marketingPerson || '').toLowerCase().includes(sTerm) ||
      (d.remarks || '').toLowerCase().includes(sTerm) ||
      ((d as any).slipNo || '').toLowerCase().includes(sTerm) ||
      ((d as any).chequeNo || '').toLowerCase().includes(sTerm) ||
      ((d as any).referenceCode || '').toLowerCase().includes(sTerm) ||
      (d.date || '').toLowerCase().includes(sTerm) ||
      (d.depositDate || '').toLowerCase().includes(sTerm) ||
      formattedDate.includes(sTerm) ||
      amountStr.includes(sTerm) ||
      formattedAmount.includes(sTerm) ||
      (Boolean(d.batchId) && (bankDeposits || []).some((b) => b.batchId === d.batchId && (
        (b.customerName || '').toLowerCase().includes(sTerm) ||
        (b.partyName || '').toLowerCase().includes(sTerm)
      )));

    const matchesEntityAndSalesman = depositMatchesFilter(d);

    const partyTerm = (filterParty && filterParty !== 'All' ? filterParty : partySearchInput).trim().toLowerCase();

    const matchesParty =
      !partyTerm ||
      (d.customerName || '').toLowerCase().includes(partyTerm) ||
      (d.partyName || '').toLowerCase().includes(partyTerm) ||
      (d.entityName || '').toLowerCase().includes(partyTerm) ||
      (Boolean(d.batchId) && (bankDeposits || []).some((b) => b.batchId === d.batchId && (
        (b.customerName || '').toLowerCase().includes(partyTerm) ||
        (b.partyName || '').toLowerCase().includes(partyTerm)
      ))) ||
      Boolean(d.collections && d.collections.some((c) => (c.partyName || '').toLowerCase().includes(partyTerm))) ||
      (Boolean(d.collectionMrId) && collections.some((c) => c.id === d.collectionMrId && (c.partyName || '').toLowerCase().includes(partyTerm)));

    let matchesDate = true;
    if (periodPreset !== 'all' && startDate && endDate) {
      const dIso = parseDateToISO(d.date || d.depositDate);
      const startIso = parseDateToISO(startDate);
      const endIso = parseDateToISO(endDate);
      if (dIso && startIso && endIso) {
        matchesDate = dIso >= startIso && dIso <= endIso;
      }
    }

    return matchesSearch && matchesEntityAndSalesman && matchesParty && matchesDate;
  });

  // Consolidated Bank Deposits (consolidates multi-party batch records into single master rows for the Statement views)
  const consolidatedBankDeposits = useMemo(() => {
    const seenBatches = new Set<string>();
    const list: BankDeposit[] = [];
    for (const dep of filteredBankDeposits) {
      if (dep.batchId && (bankDeposits || []).filter((d) => d.batchId === dep.batchId).length > 1) {
        if (!seenBatches.has(dep.batchId)) {
          seenBatches.add(dep.batchId);
          list.push(dep);
        }
      } else {
        list.push(dep);
      }
    }
    return list;
  }, [filteredBankDeposits, bankDeposits]);

  // Sub-tab counts for Deposit History
  const hoDepositsCount = useMemo(() => {
    return consolidatedBankDeposits.filter(isHoDeposit).length;
  }, [consolidatedBankDeposits, isHoDeposit]);

  const bankOnlyDepositsCount = useMemo(() => {
    return consolidatedBankDeposits.filter((d) => !isHoDeposit(d)).length;
  }, [consolidatedBankDeposits, isHoDeposit]);

  // Tab-filtered Bank Deposits (All vs H/O Deposited vs Bank Branch Only)
  const tabFilteredBankDeposits = useMemo(() => {
    if (depositHistorySubTab === 'ho_deposited') {
      return consolidatedBankDeposits.filter(isHoDeposit);
    }
    if (depositHistorySubTab === 'bank_only') {
      return consolidatedBankDeposits.filter((d) => !isHoDeposit(d));
    }
    return consolidatedBankDeposits;
  }, [consolidatedBankDeposits, depositHistorySubTab, isHoDeposit]);

  // Sorted Bank Deposits based on active sort column and direction
  const sortedBankDeposits = useMemo(() => {
    const list = [...tabFilteredBankDeposits];
    return list.sort((a, b) => {
      let cmp = 0;
      if (depositSortCol === 'sl') {
        cmp = 0;
      } else if (depositSortCol === 'date') {
        const aIso = parseDateToISO(a.date || a.depositDate) || '';
        const bIso = parseDateToISO(b.date || b.depositDate) || '';
        cmp = aIso.localeCompare(bIso);
      } else if (depositSortCol === 'depositeDate') {
        const aIso = parseDateToISO(a.depositDate || a.date) || '';
        const bIso = parseDateToISO(b.depositDate || b.date) || '';
        cmp = aIso.localeCompare(bIso);
      } else if (depositSortCol === 'customer') {
        const aParty = (a.partyName || a.customerName || '').trim();
        const aName = (aParty && aParty.toLowerCase() !== 'customer' && aParty.toLowerCase() !== 'general customer' ? aParty : (a.entityName || '')).trim().toLowerCase();
        const bParty = (b.partyName || b.customerName || '').trim();
        const bName = (bParty && bParty.toLowerCase() !== 'customer' && bParty.toLowerCase() !== 'general customer' ? bParty : (b.entityName || '')).trim().toLowerCase();
        cmp = aName.localeCompare(bName);
      } else if (depositSortCol === 'address') {
        const aAddr = (a.customerAddress || 'Madhupur').trim().toLowerCase();
        const bAddr = (b.customerAddress || 'Madhupur').trim().toLowerCase();
        cmp = aAddr.localeCompare(bAddr);
      } else if (depositSortCol === 'officer') {
        const aOff = (a.marketingPerson || '').trim().toLowerCase();
        const bOff = (b.marketingPerson || '').trim().toLowerCase();
        cmp = aOff.localeCompare(bOff);
      } else if (depositSortCol === 'tag') {
        const aTag = (isHoDeposit(a) ? 'H/O' : getBankAndAccountShortTag(a.bankName, a.accountName, a.displayTag)).trim().toLowerCase();
        const bTag = (isHoDeposit(b) ? 'H/O' : getBankAndAccountShortTag(b.bankName, b.accountName, b.displayTag)).trim().toLowerCase();
        cmp = aTag.localeCompare(bTag);
      } else if (depositSortCol === 'amount') {
        const aBatch = a.batchId ? (bankDeposits || []).filter((d) => d.batchId === a.batchId) : [];
        const aAmount = aBatch.length > 1 ? aBatch.reduce((s, d) => s + d.amount, 0) : a.amount;
        const bBatch = b.batchId ? (bankDeposits || []).filter((d) => d.batchId === b.batchId) : [];
        const bAmount = bBatch.length > 1 ? bBatch.reduce((s, d) => s + d.amount, 0) : b.amount;
        cmp = (aAmount || 0) - (bAmount || 0);
      } else if (depositSortCol === 'remarks') {
        cmp = (a.remarks || '').localeCompare(b.remarks || '');
      }
      return depositSortDir === 'asc' ? cmp : -cmp;
    });
  }, [tabFilteredBankDeposits, depositSortCol, depositSortDir, bankDeposits]);

  const renderDepositSortHeader = (
    label: string,
    col: BankDepositSortColumn,
    align: 'left' | 'center' | 'right' = 'left',
    extraClasses: string = ''
  ) => {
    return (
      <th
        key={col}
        onClick={() => handleToggleDepositSort(col)}
        className={`py-2 px-2.5 cursor-pointer select-none hover:bg-slate-800 transition-colors ${
          align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'
        } ${extraClasses}`}
        title={`Sort by ${label}`}
      >
        <span className={`inline-flex items-center ${
          align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'
        }`}>
          {label} {renderSortIndicator(col, depositSortCol, depositSortDir, true)}
        </span>
      </th>
    );
  };

  // Helper to check if a collection MR has been deposited into the bank
  const isCollectionDeposited = (col: CollectionMR): boolean => {
    if (!col) return false;
    // 1. Explicitly recorded flag or converted from cheque to cash
    if (col.isDeposited === true || col.chequeToCash === true) {
      return true;
    }
    // 2. Direct link: bankDepositId exists and matches an existing bank deposit
    if (col.bankDepositId) {
      return bankDeposits.some((d) => d.id === col.bankDepositId);
    }
    // 3. Direct reverse link: bank deposit collectionMrId matches this collection's ID
    if (bankDeposits.some((d) => d.collectionMrId === col.id)) {
      return true;
    }
    // 4. Explicitly recorded deposit tag or date
    if (col.depositDate || col.depositBankTag) {
      return true;
    }
    // 5. Exact MR number explicitly mentioned in bank deposit remarks or voucher (within the same Sales Center)
    const colMrNo = (col.mrNo || '').trim().toLowerCase();
    if (colMrNo && colMrNo !== '-' && colMrNo !== 'n/a' && colMrNo.length >= 3) {
      const matchByMr = bankDeposits.some((d) => {
        if (!isSameSalesCenterForDepositMatch(col, d, branches, parties, effectiveAllSalespersons)) {
          return false;
        }
        return matchesMrTokenExact(d.remarks, col.mrNo) || matchesMrTokenExact(d.voucherNo, col.mrNo);
      });
      if (matchByMr) return true;
    }

    return false;
  };

  // Helper to retrieve bank short tag and deposit date for a deposited collection
  const getCollectionBankDepositDetails = (col: CollectionMR): { bankTag: string; depositDate: string; bankName?: string; accountName?: string; accountNumber?: string; voucherNo?: string } => {
    let matchedDep: BankDeposit | undefined = undefined;
    if (col.bankDepositId) {
      matchedDep = (bankDeposits || []).find((d) => d.id === col.bankDepositId);
    }
    if (!matchedDep) {
      matchedDep = (bankDeposits || []).find((d) => d.collectionMrId === col.id);
    }
    if (!matchedDep && col.mrNo && col.mrNo.trim().length >= 3 && col.mrNo !== '-' && col.mrNo !== 'n/a') {
      matchedDep = (bankDeposits || []).find((d) => {
        if (!isSameSalesCenterForDepositMatch(col, d, branches, parties, effectiveAllSalespersons)) {
          return false;
        }
        return matchesMrTokenExact(d.remarks, col.mrNo) || matchesMrTokenExact(d.voucherNo, col.mrNo);
      });
    }

    if (matchedDep) {
      const resolvedMatchedBank = matchedDep.targetBankName || matchedDep.bankName;
      const tag = getBankAndAccountShortTag(resolvedMatchedBank, matchedDep.accountName, matchedDep.displayTag);
      const rawDate = matchedDep.depositDate || matchedDep.date || col.depositDate;
      const formattedDate = rawDate ? formatDateDDMMYY(rawDate) : '';
      return {
        bankTag: tag,
        depositDate: formattedDate,
        bankName: resolvedMatchedBank,
        accountName: matchedDep.accountName,
        accountNumber: matchedDep.accountNumber,
        voucherNo: matchedDep.voucherNo
      };
    }

    if (col.bankName || col.depositBankTag || col.accountName) {
      const fallbackTag = getBankAndAccountShortTag(
        col.bankName || col.depositBankTag,
        col.accountName,
        col.depositBankTag
      );
      return {
        bankTag: fallbackTag,
        depositDate: col.depositDate ? formatDateDDMMYY(col.depositDate) : (col.date ? formatDateDDMMYY(col.date) : ''),
        bankName: col.bankName,
        accountName: col.accountName,
        accountNumber: col.accountNumber,
        voucherNo: col.voucherNo
      };
    }

    return {
      bankTag: '',
      depositDate: col.depositDate ? formatDateDDMMYY(col.depositDate) : (col.date ? formatDateDDMMYY(col.date) : ''),
      bankName: col.bankName,
      accountName: col.accountName,
      accountNumber: col.accountNumber,
      voucherNo: col.voucherNo
    };
  };

  // Convert cheque to cash: moves amount to Cash In Hand and marks history in Cheque In Hand
  const handleChequeToCash = (targetCol: CollectionMR, cashDate?: string, notes?: string) => {
    const finalDate = cashDate ? (formatDateDDMMYY(cashDate) || cashDate) : formatDateDDMMYY(new Date().toISOString().split('T')[0]);
    const cleanNotes = notes?.trim() || `Cheque #${targetCol.chequeNo || 'N/A'} (${targetCol.bankName || 'Bank'}) encashed to Cash In Hand`;

    const newCashId = `cash-cq-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const newCashMrNo = targetCol.mrNo ? `CASH-${targetCol.mrNo}` : `CASH-CQ-${targetCol.chequeNo || Date.now().toString().slice(-4)}`;

    const newCashCollection: CollectionMR = {
      id: newCashId,
      date: finalDate,
      mrNo: newCashMrNo,
      entityName: targetCol.entityName,
      partyName: targetCol.partyName,
      paymentType: 'cash',
      amount: targetCol.amount,
      remarks: cleanNotes,
      isDeposited: false, // In Cash In Hand, ready to be kept or deposited as cash
      branchId: targetCol.branchId,
      branchName: targetCol.branchName,
      marketingPerson: targetCol.marketingPerson,
      salesmanCode: targetCol.salesmanCode,
      createdBy: targetCol.createdBy,
      convertedFromChequeId: targetCol.id
    };

    const updatedList = (collections || []).map((c) => {
      if (c.id === targetCol.id) {
        return {
          ...c,
          isDeposited: true,
          depositDate: finalDate,
          chequeToCash: true,
          chequeToCashDate: finalDate,
          chequeToCashRemarks: cleanNotes,
          cashedCollectionId: newCashId
        };
      }
      return c;
    });
    const nextCol = [newCashCollection, ...updatedList];

    if (setCollections) {
      setCollections(nextCol);
      try {
        localStorage.setItem('polycables_collections', JSON.stringify(nextCol));
      } catch (e) {}
    }
    if (onSyncCloud) {
      onSyncCloud({ collections: nextCol }, true);
    }
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: getClientSyncId(), patch: { collections: nextCol } })
    }).catch(() => {});

    showNotify('success', `Cheque #${targetCol.chequeNo || ''} (৳${targetCol.amount.toLocaleString('en-IN')}) successfully encashed and moved to Cash In Hand!`);
  };

  // Cash in Hand Calculations
  const cashCollectionsList = collections
    .filter((c) => {
      const isCash = !c.paymentType || (c.paymentType as string).toLowerCase() === 'cash';
      if (!isCash) return false;

      const sTerm = search.trim().toLowerCase();
      const formattedDate = formatDateDDMMYY(c.date).toLowerCase();
      const amountStr = c.amount ? c.amount.toString() : '';
      const formattedAmount = c.amount ? c.amount.toLocaleString('en-IN') : '';

      const matchesSearch =
        !sTerm ||
        (c.partyName || '').toLowerCase().includes(sTerm) ||
        (c.mrNo || '').toLowerCase().includes(sTerm) ||
        (c.entityName || '').toLowerCase().includes(sTerm) ||
        (c.remarks || '').toLowerCase().includes(sTerm) ||
        (c.date || '').toLowerCase().includes(sTerm) ||
        formattedDate.includes(sTerm) ||
        amountStr.includes(sTerm) ||
        formattedAmount.includes(sTerm);

      if (!matchesSearch) return false;

      const matchesParty =
        !filterParty || filterParty === 'All' ||
        (c.partyName || '').toLowerCase().includes(filterParty.toLowerCase().trim());
      if (!matchesParty) return false;
      let matchesDate = true;
      if (startDate && endDate) {
        const cIso = parseDateToISO(c.date);
        const startIso = parseDateToISO(startDate);
        const endIso = parseDateToISO(endDate);
        if (cIso && startIso && endIso) {
          matchesDate = cIso >= startIso && cIso <= endIso;
        }
      }
      if (!matchesDate) return false;
      return collectionMatchesFilter(c);
    });

  const undepositedCashCollections = cashCollectionsList.filter((c) => !isCollectionDeposited(c));

  const filteredCashCollections = useMemo(() => {
    return cashCollectionsList.filter((col) => {
      const isDep = isCollectionDeposited(col);
      if (cashDepositFilter === 'pending') return !isDep;
      if (cashDepositFilter === 'deposited') return isDep;
      return true;
    });
  }, [cashCollectionsList, cashDepositFilter, bankDeposits]);

  const sortedCashCollections = useMemo(() => {
    return [...filteredCashCollections].sort((a, b) => {
      let comp = 0;
      if (cashSortField === 'sl') {
        const aNum = parseInt((a.mrNo || '').replace(/\D/g, ''), 10) || 0;
        const bNum = parseInt((b.mrNo || '').replace(/\D/g, ''), 10) || 0;
        comp = aNum - bNum;
      } else if (cashSortField === 'date') {
        const aIso = parseDateToISO(a.date) || a.date || '';
        const bIso = parseDateToISO(b.date) || b.date || '';
        comp = aIso.localeCompare(bIso);
      } else if (cashSortField === 'partyName') {
        comp = (a.partyName || '').localeCompare(b.partyName || '');
      } else if (cashSortField === 'address') {
        const aParty = (parties || []).find((p) => p.name.trim().toLowerCase() === (a.partyName || '').trim().toLowerCase());
        const bParty = (parties || []).find((p) => p.name.trim().toLowerCase() === (b.partyName || '').trim().toLowerCase());
        comp = (aParty?.address || '').localeCompare(bParty?.address || '');
      } else if (cashSortField === 'status') {
        const aDep = isCollectionDeposited(a) ? 1 : 0;
        const bDep = isCollectionDeposited(b) ? 1 : 0;
        comp = aDep - bDep;
      } else if (cashSortField === 'entityName') {
        comp = (a.entityName || '').localeCompare(b.entityName || '');
      } else if (cashSortField === 'remarks') {
        comp = (a.remarks || '').localeCompare(b.remarks || '');
      } else if (cashSortField === 'amount') {
        comp = (a.amount || 0) - (b.amount || 0);
      }
      return cashSortDirection === 'asc' ? comp : -comp;
    });
  }, [filteredCashCollections, cashSortField, cashSortDirection, parties, bankDeposits]);

  const cashCollectedSum = cashCollectionsList.reduce((sum, c) => sum + c.amount, 0);

  const bankDepositedSum = filteredBankDeposits.reduce((sum, d) => sum + d.amount, 0);

  const undepositedCashSum = undepositedCashCollections.reduce((sum, c) => sum + c.amount, 0);
  // Cash in hand balance is the total sum of undeposited cash collections
  const cashInHandBalance = undepositedCashSum;

  // Personal Report calculations
  const reportEntity =
    (filterEntity === 'All' && !canViewAllUserCenters)
      ? initialDefaultEntity
      : (filterEntity === 'All' ? 'All Sales Centers' : filterEntity);
  
  // Helper to determine if an account/person is configured as 'user' role
  const isUserRoleAccount = (entityName: string) => {
    const match = effectiveAllSalespersons.find(
      (s) => s.name.trim().toLowerCase() === entityName.trim().toLowerCase()
    );
    return match ? match.userType === 'user' : false;
  };

  const isConveyanceOrLunchHead = (head: string) => {
    const h = head.toLowerCase();
    return (
      h.includes('conveyance') ||
      h.includes('day allowance') ||
      h.includes('lunch bill') ||
      h.includes('allowance')
    );
  };

  // Combine expense entries according to User Role routing logic & Date filter:
  const startIso = periodPreset === 'all' ? '' : parseDateToISO(startDate);
  const endIso = periodPreset === 'all' ? '' : parseDateToISO(endDate);

  const repClean = cleanSalesCenterName(reportEntity);
  const isAllReport =
    !reportEntity ||
    reportEntity.trim().toLowerCase() === 'all' ||
    reportEntity.trim().toLowerCase() === 'all sales centers' ||
    repClean.toLowerCase() === 'all' ||
    repClean.toLowerCase() === 'all sales centers';

  const isCenterReport =
    !isAllReport &&
    (repClean === 'Madhupur Sales Center' ||
      repClean === 'Tangail Sales Center' ||
      branches.some((b) => cleanSalesCenterName(b.name).toLowerCase() === repClean.toLowerCase()));

  const findExpenseUserMatch = (e: ExpenseEntry) => {
    const rawEntity = (e.entityName || '').trim().toLowerCase();
    const baseEntity = rawEntity.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const spId = ((e as any).salespersonId || '').trim().toLowerCase();
    const spCode = ((e as any).salesmanCode || '').trim().toLowerCase();
    const mkt = ((e as any).marketingPerson || '').trim().toLowerCase();
    const createdBy = (e.createdBy || '').trim().toLowerCase();
    return effectiveAllSalespersons.find((s) => {
      const sName = (s.name || '').trim().toLowerCase();
      const sCode = (s.code || '').trim().toLowerCase();
      const sId = (s.id || '').trim().toLowerCase();
      return (
        (sId && spId && sId === spId) ||
        (sCode && spCode && sCode === spCode) ||
        (sName && rawEntity && sName === rawEntity) ||
        (sName && baseEntity && sName === baseEntity) ||
        (sName && mkt && sName === mkt) ||
        (sName && createdBy && sName === createdBy)
      );
    });
  };

  const entityExpenses = expenses.filter((e) => {
    if ((e as any).approvalStatus === 'rejected' || (e as any).status === 'rejected') {
      return false;
    }

    const eIso = parseDateToISO(e.date);
    if (periodPreset !== 'all' && startIso && endIso && eIso) {
      if (eIso < startIso || eIso > endIso) return false;
    }

    if (isAllReport) return true;

    const expEntityClean = cleanSalesCenterName(e.entityName || '');
    const userMatch = findExpenseUserMatch(e);

    if (isCenterReport) {
      const repCleanLow = repClean.toLowerCase();
      // 1. Direct expenses booked to this Sales Center
      if (expEntityClean.toLowerCase() === repCleanLow || (e.entityName || '').trim().toLowerCase() === reportEntity.trim().toLowerCase()) {
        return true;
      }
      if (e.branchName && cleanSalesCenterName(e.branchName).toLowerCase() === repCleanLow) {
        return true;
      }
      if (e.branchId && branches.some((b) => b.id === e.branchId && cleanSalesCenterName(b.name).toLowerCase() === repCleanLow)) {
        return true;
      }
      if ((e as any).salesCenter && cleanSalesCenterName((e as any).salesCenter).toLowerCase() === repCleanLow) {
        return true;
      }

      // 2. Expenses entered by user / staff / marketing officer belonging to this Sales Center (no cross-branch fallback!)
      let userCenter = '';
      if (userMatch?.branchName) {
        userCenter = cleanSalesCenterName(userMatch.branchName);
      } else if (userMatch?.branchId) {
        const br = branches.find((b) => b.id === userMatch.branchId);
        if (br) userCenter = cleanSalesCenterName(br.name);
      }

      if (userCenter && userCenter.toLowerCase() === repCleanLow) {
        return true;
      }

      return false;
    } else {
      // Individual Person / User report
      const repLower = reportEntity.trim().toLowerCase();
      const expEntityRaw = (e.entityName || '').trim().toLowerCase();
      const expEntityBase = expEntityRaw.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const expMktLower = ((e as any).marketingPerson || '').trim().toLowerCase();
      const expCreatedByLower = (e.createdBy || '').trim().toLowerCase();
      const expSpLower = ((e as any).salespersonName || '').trim().toLowerCase();
      if (
        expEntityRaw === repLower ||
        expEntityBase === repLower ||
        expMktLower === repLower ||
        expCreatedByLower === repLower ||
        expSpLower === repLower ||
        (userMatch && userMatch.name.trim().toLowerCase() === repLower)
      ) {
        return true;
      }
      return false;
    }
  });

  const entityCollections = collections.filter((c) => {
    const cIso = parseDateToISO(c.date);
    if (periodPreset !== 'all' && startIso && endIso && cIso) {
      if (cIso < startIso || cIso > endIso) return false;
    }

    if (isAllReport) return true;

    if (isCenterReport) {
      const cCenterClean = cleanSalesCenterName(c.branchName || '');
      if (cCenterClean.toLowerCase() === repClean.toLowerCase()) return true;
      if (c.branchId && branches.some((b) => b.id === c.branchId && cleanSalesCenterName(b.name).toLowerCase() === repClean.toLowerCase())) return true;
      const sp = effectiveAllSalespersons.find((s) => s.id === (c as any).salespersonId || s.name.trim().toLowerCase() === (c.marketingPerson || c.entityName || '').trim().toLowerCase());
      if (sp?.branchName && cleanSalesCenterName(sp.branchName).toLowerCase() === repClean.toLowerCase()) return true;
      if (sp?.branchId && branches.some((b) => b.id === sp.branchId && cleanSalesCenterName(b.name).toLowerCase() === repClean.toLowerCase())) return true;
      return false;
    } else {
      const repLower = reportEntity.trim().toLowerCase();
      const entityLower = (c.entityName || '').trim().toLowerCase();
      const mktLower = (c.marketingPerson || '').trim().toLowerCase();
      return entityLower === repLower || mktLower === repLower;
    }
  });

  const entityBankDeposits = bankDeposits.filter((d) => {
    const dIso = parseDateToISO(d.date);
    if (periodPreset !== 'all' && startIso && endIso && dIso) {
      if (dIso < startIso || dIso > endIso) return false;
    }

    if (isAllReport) return true;

    if (isCenterReport) {
      const dCenterClean = cleanSalesCenterName(d.branchName || '');
      if (dCenterClean.toLowerCase() === repClean.toLowerCase()) return true;
      if (d.branchId && branches.some((b) => b.id === d.branchId && cleanSalesCenterName(b.name).toLowerCase() === repClean.toLowerCase())) return true;
      return false;
    } else {
      const repLower = reportEntity.trim().toLowerCase();
      const dEntityLower = (d.entityName || '').trim().toLowerCase();
      const dMktLower = (d.marketingPerson || '').trim().toLowerCase();
      if (dEntityLower === repLower || dMktLower === repLower) return true;

      // Check linked collection
      if (d.collectionMrId) {
        const col = collections.find((c) => c.id === d.collectionMrId);
        if (col && ((col.marketingPerson || '').trim().toLowerCase() === repLower || (col.entityName || '').trim().toLowerCase() === repLower)) {
          return true;
        }
      }
      if ((d as any).collections && Array.isArray((d as any).collections)) {
        if (((d as any).collections as CollectionMR[]).some((c) => (c.marketingPerson || '').trim().toLowerCase() === repLower || (c.entityName || '').trim().toLowerCase() === repLower)) {
          return true;
        }
      }
      // Check customer party
      const pName = (d.customerName || d.partyName || '').trim().toLowerCase();
      if (pName) {
        const party = (parties || []).find((p) => p.name.trim().toLowerCase() === pName);
        if (party && ((party.salespersonName || '').trim().toLowerCase() === repLower || (party.salesmanCode || '').trim().toLowerCase() === repLower)) {
          return true;
        }
      }
      return false;
    }
  });

  const totalBankDepositedSum = entityBankDeposits.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  // Group Expenses by Head for Statement
  const expenseHeadTotals: { [head: string]: number } = {};
  expenseCategories.forEach((cat) => {
    const cleanCatName = (cat.name || '').trim();
    if (cleanCatName) {
      expenseHeadTotals[cleanCatName] = 0;
    }
  });

  entityExpenses.forEach((exp) => {
    const expAmt = Number(exp.amount) || 0;
    if (expAmt <= 0) return;
    const rawHead = (exp.expenseHead || '').trim();
    const cleanHead = rawHead.replace(/^\d+[\.\)\s\-]+/, '').trim();
    let matchedCategory = expenseCategories.find(
      (c) =>
        (c.name || '').trim().toLowerCase() === rawHead.toLowerCase() ||
        (c.name || '').trim().toLowerCase() === cleanHead.toLowerCase()
    );

    if (!matchedCategory) {
      const cLow = cleanHead.toLowerCase();
      matchedCategory = expenseCategories.find((c) => {
        const nameLow = (c.name || '').trim().toLowerCase();
        if (cLow && nameLow && (nameLow === cLow || nameLow.includes(cLow) || cLow.includes(nameLow))) return true;
        if (cLow.includes('conveyance') && nameLow.includes('conveyance')) return true;
        if ((cLow.includes('day allowance') || cLow.includes('lunch')) && nameLow.includes('day allowance')) return true;
        if (cLow.includes('decoration') && nameLow.includes('decoration')) return true;
        if ((cLow.includes('trade licence') || cLow.includes('trade license')) && nameLow.includes('trade licence')) return true;
        if (cLow.includes('picnic donation') && nameLow.includes('picnic donation')) return true;
        if (cLow.includes('donation') && !cLow.includes('picnic') && nameLow === 'donation') return true;
        if ((cLow.includes('traders programme') || cLow.includes('electrician')) && nameLow.includes('traders programme')) return true;
        if ((cLow.includes('electricity') || cLow.includes('electricty')) && nameLow.includes('electri')) return true;
        if (cLow.includes('prize money') && nameLow.includes('prize money')) return true;
        if (cLow.includes('fuel') && nameLow.includes('fuel')) return true;
        if (cLow.includes('internet') && nameLow.includes('internet')) return true;
        if (cLow.includes('stationery') && nameLow.includes('stationery')) return true;
        if (cLow.includes('entertainment') && nameLow.includes('entertainment')) return true;
        if ((cLow.includes('flexiload') || cLow.includes('photocopy')) && nameLow.includes('flexiload')) return true;
        if (cLow.includes('office exp') && nameLow.includes('office exp')) return true;
        if (cLow.includes('over time') && nameLow.includes('over time')) return true;
        if ((cLow.includes('rent') || cLow.includes('sales center rent')) && nameLow.includes('sales center rent')) return true;
        if ((cLow.includes('refreshment') || cLow.includes('rerreshment')) && (nameLow.includes('refreshment') || nameLow.includes('rerreshment'))) return true;
        if (cLow.includes('transport') && nameLow.includes('transport')) return true;
        if (cLow.includes('vat') && nameLow.includes('vat')) return true;
        if (cLow.includes('vehicle') && nameLow.includes('vehicle')) return true;
        if ((cLow.includes('wages') || cLow.includes('labour')) && nameLow.includes('wages')) return true;
        return false;
      });
    }

    const key = (matchedCategory ? matchedCategory.name : (cleanHead || rawHead || 'Other')).trim();
    if (expenseHeadTotals[key] !== undefined) {
      expenseHeadTotals[key] += expAmt;
    } else {
      expenseHeadTotals[key] = expAmt;
    }
  });

  // User requirement:
  // "total conveyance goes to expense report page user wise conveyance field and daily allowance goes to Day Allowance/ Lunch Bill field.
  // conveyance bill need to approve, first it approved by Sales center In-charge, if approved by in-charge then goes to Sales center admin,
  // if admin approved then goes to Expense Report page else only show total."
  const approvedConveyanceEntries = (conveyances || []).filter((c) => {
    if (c.status !== 'approved') return false;
    const cIso = parseDateToISO(c.date);
    if (periodPreset !== 'all' && startIso && endIso && cIso) {
      if (cIso < startIso || cIso > endIso) return false;
    }

    if (isAllReport) return true;

    if (isCenterReport) {
      const cCenterClean = cleanSalesCenterName(c.branchName || '');
      if (cCenterClean.toLowerCase() === repClean.toLowerCase()) return true;
      if (c.branchId && branches.some((b) => b.id === c.branchId && cleanSalesCenterName(b.name).toLowerCase() === repClean.toLowerCase())) return true;
      const sp = effectiveAllSalespersons.find((s) => s.id === c.salespersonId || s.name.trim().toLowerCase() === (c.salespersonName || '').trim().toLowerCase());
      if (sp?.branchName && cleanSalesCenterName(sp.branchName).toLowerCase() === repClean.toLowerCase()) return true;
      if (sp?.branchId && branches.some((b) => b.id === sp.branchId && cleanSalesCenterName(b.name).toLowerCase() === repClean.toLowerCase())) return true;
      return false;
    } else {
      const repLower = reportEntity.trim().toLowerCase();
      const spNameLower = (c.salespersonName || '').trim().toLowerCase();
      const spIdLower = (c.salespersonId || '').trim().toLowerCase();
      const spCodeLower = (c.salesmanCode || '').trim().toLowerCase();
      return (
        spNameLower === repLower ||
        spIdLower === repLower ||
        spCodeLower === repLower ||
        repLower.includes(spNameLower) ||
        (spNameLower && spNameLower.includes(repLower))
      );
    }
  });

  approvedConveyanceEntries.forEach((c) => {
    const conveyancePortion = (Number(c.conveyanceAmount) || 0) + (c.hasHotelBill ? (Number(c.hotelAmount) || 0) : 0);
    const dailyAllowancePortion = Number(c.dailyAllowanceAmount) || 0;

    const convKey = Object.keys(expenseHeadTotals).find((k) => k.toLowerCase().includes('conveyance')) || 'Conveyance';
    if (expenseHeadTotals[convKey] !== undefined) {
      expenseHeadTotals[convKey] += conveyancePortion;
    } else {
      expenseHeadTotals[convKey] = conveyancePortion;
    }

    const daKey = Object.keys(expenseHeadTotals).find((k) => k.toLowerCase().includes('day allowance') || k.toLowerCase().includes('daily allowance') || k.toLowerCase().includes('lunch')) || 'Day Allowance/ Lunch Bill';
    if (expenseHeadTotals[daKey] !== undefined) {
      expenseHeadTotals[daKey] += dailyAllowancePortion;
    } else {
      expenseHeadTotals[daKey] = dailyAllowancePortion;
    }
  });

  const totalExpenseSum = Object.values(expenseHeadTotals).reduce((a, b) => a + (Number(b) || 0), 0);
  const totalCollectionSum = entityCollections.reduce((a, b) => a + (Number(b.amount) || 0), 0);

  // Calculate Net Sale from Stored Bills
  const totalNetSaleSum = storedBills.reduce((acc, bill) => {
    const bDateStr = bill.header?.date || bill.savedAt || '';
    const bIso = parseDateToISO(bDateStr);
    if (periodPreset !== 'all' && startIso && endIso && bIso) {
      if (bIso < startIso || bIso > endIso) return acc;
    }

    if (isAllReport) {
      return acc + (Number(bill.grandTotal) || 0);
    }

    if (isCenterReport) {
      // Sales center wise has NO sales or collection
      return acc;
    } else {
      const repLower = reportEntity.trim().toLowerCase();
      const sp = effectiveAllSalespersons.find(
        (s) => s.name.trim().toLowerCase() === repLower
      );
      const targetCodes = [repLower];
      if (sp?.code) targetCodes.push(sp.code.trim().toLowerCase());

      const party = parties.find((p) => p.name.trim().toLowerCase() === (bill.header?.partyName || '').trim().toLowerCase());
      const billSpName = (bill.header?.salespersonName || '').trim().toLowerCase();
      const billSpCode = (bill.header?.salesmanCode || '').trim().toLowerCase();
      const partySpName = (party?.salespersonName || '').trim().toLowerCase();
      const partySpCode = (party?.salesmanCode || '').trim().toLowerCase();
      const billMkt = (bill.marketingPerson || '').trim().toLowerCase();

      const isMatch =
        targetCodes.includes(billSpName) ||
        targetCodes.includes(billSpCode) ||
        targetCodes.includes(partySpName) ||
        targetCodes.includes(partySpCode) ||
        targetCodes.includes(billMkt) ||
        (billSpName && repLower.includes(billSpName)) ||
        (partySpName && repLower.includes(partySpName));

      if (isMatch) {
        return acc + (bill.grandTotal || 0);
      }
      return acc;
    }
  }, 0);

  const handlePrintReport = () => {
    setShowReportPrintPreviewModal(true);
  };

  // Render Party Filter Box with explicit Back / Close system (supports dynamic search, keyboard navigation & dark theme)
  const PartyFilterControl = ({ dark = false }: { dark?: boolean }) => {
    const isDepositView = (activeTab as string) === 'deposits' || activeTab === 'deposit_history';
    const basePartyList = isDepositView ? partiesWithCashEntry : allPartyOptions;

    const searchTarget = partySearchInput;
    const scopedParties = useMemo(() => {
      return basePartyList.filter((partyName) => {
        if (filterSalesman && filterSalesman !== 'all') {
          if (!partyBelongsToSalesman(partyName, filterSalesman)) return false;
        }
        if (filterEntity && filterEntity !== 'All' && filterEntity !== 'All Sales Centers') {
          if (!partyBelongsToSalesCenter(partyName, filterEntity)) return false;
        }
        return true;
      });
    }, [basePartyList, filterSalesman, filterEntity, partyBelongsToSalesman, partyBelongsToSalesCenter]);

    const filteredParties = useMemo(() => {
      if (!searchTarget.trim()) return scopedParties;
      const q = searchTarget.toLowerCase().trim();
      return scopedParties.filter((p) => p.toLowerCase().includes(q));
    }, [searchTarget, scopedParties]);

    const handleSelectParty = (partyName: string) => {
      setFilterParty(partyName);
      setPartySearchInput(partyName === 'All' ? '' : partyName);
      setIsPartyDropdownOpen(false);
      setPartyFilterHighlightIdx(0);
    };

    return (
      <div className="relative min-w-[140px] max-w-[185px] shrink-0">
        <div className={`flex items-center space-x-1 px-1.5 py-0.5 rounded-lg border ${dark ? 'bg-slate-900/90 border-slate-700 text-white' : 'bg-purple-50/80 border-purple-200'}`}>
          <Users className={`w-3.5 h-3.5 shrink-0 ${dark ? 'text-purple-400' : 'text-purple-700'}`} />
          <label className={`text-[11px] font-bold uppercase tracking-wide whitespace-nowrap ${dark ? 'text-slate-300' : 'text-purple-900'}`}>
            Party:
          </label>
          <div className="relative flex-1 flex items-center min-w-0">
            <input
              type="text"
              value={partySearchInput || (filterParty !== 'All' ? filterParty : '')}
              onChange={(e) => {
                const val = e.target.value;
                setPartySearchInput(val);
                setFilterParty(val.trim() ? val.trim() : 'All');
                setIsPartyDropdownOpen(true);
                setPartyFilterHighlightIdx(0);
              }}
              onFocus={() => {
                setIsPartyDropdownOpen(true);
                setPartyFilterHighlightIdx(0);
              }}
              onKeyDown={(e) => {
                if (!isPartyDropdownOpen) {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsPartyDropdownOpen(true);
                    setPartyFilterHighlightIdx(0);
                  }
                  return;
                }
                const hasSearchQuery = Boolean(partySearchInput.trim());
                const totalItems = filteredParties.length + 1; // filtered parties + "All Parties"
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  e.stopPropagation();
                  setPartyFilterHighlightIdx((prev) => (prev + 1) % totalItems);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  e.stopPropagation();
                  setPartyFilterHighlightIdx((prev) => (prev - 1 + totalItems) % totalItems);
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  if (hasSearchQuery && filteredParties.length > 0) {
                    if (partyFilterHighlightIdx < filteredParties.length) {
                      handleSelectParty(filteredParties[partyFilterHighlightIdx]);
                    } else {
                      handleSelectParty('All');
                    }
                  } else if (partyFilterHighlightIdx === 0) {
                    handleSelectParty('All');
                  } else if (filteredParties[partyFilterHighlightIdx - 1]) {
                    handleSelectParty(filteredParties[partyFilterHighlightIdx - 1]);
                  }
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsPartyDropdownOpen(false);
                }
              }}
              placeholder={isDepositView ? "Party (Cash Only)..." : "Filter party..."}
              className={`w-full px-1.5 py-0.5 text-xs font-bold rounded shadow-2xs focus:outline-none focus:ring-1 focus:ring-purple-500 pr-5 truncate ${
                dark ? 'bg-slate-800 text-white placeholder-slate-400 border border-slate-600' : 'bg-white text-slate-900 border border-purple-300'
              }`}
            />
            {filterParty && filterParty !== 'All' ? (
              <button
                type="button"
                onClick={() => handleSelectParty('All')}
                className={`absolute right-1 p-0.5 rounded cursor-pointer transition-colors ${dark ? 'text-rose-400 hover:text-rose-300' : 'text-purple-700 hover:text-rose-600'}`}
                title="Close filter & Back to All Parties"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const nextOpen = !isPartyDropdownOpen;
                  if (nextOpen) setPartyFilterHighlightIdx(0);
                  setIsPartyDropdownOpen(nextOpen);
                }}
                className="absolute right-1 text-slate-400 hover:text-purple-400 p-0.5 rounded cursor-pointer"
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${isPartyDropdownOpen ? 'rotate-180 text-purple-400' : ''}`} />
              </button>
            )}
          </div>
          {filterParty !== 'All' && (
            <button
              type="button"
              onClick={() => handleSelectParty('All')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold flex items-center gap-0.5 cursor-pointer whitespace-nowrap ${
                dark ? 'bg-purple-900/80 hover:bg-purple-800 text-purple-200 border border-purple-700' : 'bg-purple-200 hover:bg-purple-300 text-purple-950'
              }`}
              title="Back to All Parties"
            >
              <ArrowLeft className="w-2.5 h-2.5" />
              <span>Back</span>
            </button>
          )}
        </div>

        {isPartyDropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setIsPartyDropdownOpen(false)}
            />
            <div
              ref={partyFilterDropdownRef}
              className="absolute z-40 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1 text-xs font-medium divide-y divide-slate-800 text-white w-full sm:min-w-[280px] max-w-[calc(100vw-2rem)]"
            >
              <div className="p-1.5 bg-slate-800 flex items-center justify-between text-[10px] font-bold text-slate-300 sticky top-0 z-10">
                <span>Parties ({filteredParties.length} found)</span>
                <button
                  type="button"
                  onClick={() => setIsPartyDropdownOpen(false)}
                  className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
                  title="Close dropdown"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              {!(partySearchInput.trim() && filteredParties.length > 0) && (
                <button
                  type="button"
                  data-party-filter-highlighted={partyFilterHighlightIdx === 0}
                  onMouseEnter={() => setPartyFilterHighlightIdx(0)}
                  onClick={() => handleSelectParty('All')}
                  className={`w-full text-left px-3 py-1.5 hover:bg-slate-800 font-bold text-purple-300 flex items-center justify-between cursor-pointer ${
                    partyFilterHighlightIdx === 0 ? 'bg-purple-600/25 ring-1 ring-inset ring-purple-400 text-white' : ''
                  }`}
                >
                  <span>-- All Parties (Back to Full List) --</span>
                  {filterParty === 'All' && <Check className="w-3.5 h-3.5 text-purple-400" />}
                </button>
              )}
              {filteredParties.length === 0 ? (
                <div className="p-3 text-center text-slate-400 text-xs italic">
                  No parties matching "{partySearchInput}"
                </div>
              ) : (
                filteredParties.map((partyName, pIdx) => {
                  const hasQuery = Boolean(partySearchInput.trim());
                  const optionIndex = hasQuery ? pIdx : pIdx + 1;
                  const isHighlighted = partyFilterHighlightIdx === optionIndex;
                  const isSelected = filterParty === partyName;
                  return (
                    <button
                      key={`${partyName}-${pIdx}`}
                      type="button"
                      data-party-filter-highlighted={isHighlighted}
                      onMouseEnter={() => setPartyFilterHighlightIdx(optionIndex)}
                      onClick={() => handleSelectParty(partyName)}
                      className={`w-full text-left px-3 py-1.5 transition-colors flex items-center justify-between cursor-pointer ${
                        isHighlighted
                          ? 'bg-purple-600/30 text-white font-bold ring-1 ring-inset ring-purple-400'
                          : isSelected
                          ? 'bg-purple-950/70 font-extrabold text-purple-300'
                          : 'hover:bg-slate-800 text-slate-200'
                      }`}
                    >
                      <span className="truncate">{partyName}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                    </button>
                  );
                })
              )}
              {partySearchInput.trim() && filteredParties.length > 0 && (
                <button
                  type="button"
                  data-party-filter-highlighted={partyFilterHighlightIdx === filteredParties.length}
                  onMouseEnter={() => setPartyFilterHighlightIdx(filteredParties.length)}
                  onClick={() => handleSelectParty('All')}
                  className={`w-full text-left px-3 py-1.5 hover:bg-slate-800 font-bold text-purple-300 flex items-center justify-between cursor-pointer ${
                    partyFilterHighlightIdx === filteredParties.length ? 'bg-purple-600/25 ring-1 ring-inset ring-purple-400 text-white' : ''
                  }`}
                >
                  <span>-- All Parties (Back to Full List) --</span>
                  {filterParty === 'All' && <Check className="w-3.5 h-3.5 text-purple-400" />}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  // Calculated Net Balance for Statement
  const computedNetBalance = totalCollectionSum - totalExpenseSum;

  // Export Statement to CSV / Excel matching ex 2.png 2-sided ledger
  const handleExportExcel = () => {
    try {
      const details = getEntityDisplayDetails(reportEntity);
      const displayName = reportPersonName.trim() || details.personName;
      const displayCenterName = reportSalesCenterName.trim() || details.centerName;

      let displaySales = reportSalesAmount.trim();
      if (!displaySales) {
        if (details.isCenter || isCenterReport) {
          displaySales = '-';
        } else if (totalNetSaleSum > 0) {
          displaySales = `${totalNetSaleSum.toLocaleString('en-IN')}/-`;
        } else {
          displaySales = '-';
        }
      } else if (!displaySales.endsWith('/-') && displaySales !== '-') {
        displaySales = `${displaySales}/-`;
      }

      let displayCollection = reportCollectionAmount.trim();
      if (!displayCollection) {
        if (details.isCenter || isCenterReport) {
          displayCollection = '-';
        } else {
          const colAmt = totalBankDepositedSum > 0 ? totalBankDepositedSum : totalCollectionSum;
          if (colAmt > 0) {
            displayCollection = `${colAmt.toLocaleString('en-IN')}/-`;
          } else {
            displayCollection = '-';
          }
        }
      } else if (!displayCollection.endsWith('/-') && displayCollection !== '-') {
        displayCollection = `${displayCollection}/-`;
      }

      // Marketing officers show their deposited amount like Bank Summary only, sorted date ascending; sales centers have no sales or collection
      let leftEntries: { date: string; rawDate: string; bankName: string; amount: number }[] = [];
      if (details.isCenter || isCenterReport) {
        leftEntries = [];
      } else {
        const depositMap = new Map<string, { date: string; rawDate: string; bankName: string; amount: number }>();

        if (entityBankDeposits.length > 0) {
          entityBankDeposits.forEach((d) => {
            const bTag = (d.bankName === 'H/O' || d.displayTag === 'H/O')
              ? 'H/O'
              : getBankAndAccountShortTag(d.bankName, (d as any).accountName, d.displayTag) || d.displayTag || d.bankName || 'PBL(P.E)';
            const isoDate = parseDateToISO(d.date) || d.date;
            const key = `${isoDate}___${bTag.trim()}`;
            const existing = depositMap.get(key);
            if (existing) {
              existing.amount += (Number(d.amount) || 0);
            } else {
              depositMap.set(key, {
                date: formatDateDDMMYY(d.date),
                rawDate: isoDate,
                bankName: bTag.trim(),
                amount: Number(d.amount) || 0
              });
            }
          });
        } else if (entityCollections.length > 0) {
          // Deposited collections only (matching Bank Summary deposited amount)
          const depositedCols = entityCollections.filter((c) => isCollectionDeposited(c));
          depositedCols.forEach((c) => {
            const matchedDep = bankDeposits.find((d) => d.collectionMrId === c.id || (c.bankDepositId && d.id === c.bankDepositId));
            const bTag = matchedDep
              ? (matchedDep.bankName === 'H/O' || matchedDep.displayTag === 'H/O' ? (matchedDep.displayTag || matchedDep.bankName) : getBankAndAccountShortTag(matchedDep.bankName, matchedDep.accountName, matchedDep.displayTag) || matchedDep.displayTag || matchedDep.bankName)
              : getBankAndAccountShortTag(c.bankName, (c as any).accountName, c.depositBankTag) || c.depositBankTag || c.bankName || 'PBL(P.E)';
            const isoDate = parseDateToISO(c.depositDate || c.date) || c.date;
            const key = `${isoDate}___${bTag.trim()}`;
            const existing = depositMap.get(key);
            if (existing) {
              existing.amount += (Number(c.amount) || 0);
            } else {
              depositMap.set(key, {
                date: formatDateDDMMYY(c.depositDate || c.date),
                rawDate: isoDate,
                bankName: bTag.trim(),
                amount: Number(c.amount) || 0
              });
            }
          });
        }

        leftEntries = Array.from(depositMap.values());
        // Sort Date Ascending
        leftEntries.sort((a, b) => {
          const isoA = parseDateToISO(a.rawDate) || a.rawDate;
          const isoB = parseDateToISO(b.rawDate) || b.rawDate;
          return isoA.localeCompare(isoB);
        });
      }

      const monthHeaderLabel =
        startDate && endDate
          ? `${formatDateShortYY(startDate)} to ${formatDateShortYY(endDate)}`
          : 'All Dates';

      const rows: string[][] = [
        [`Month: ${monthHeaderLabel}`, '', `Name: ${displayName}`, '', '', `Name: ${displayCenterName}`],
        [`Sales: ${displaySales}`, '', '', '', '', `Collection: ${displayCollection}`],
        [],
        ['SL#', 'Date', 'Bank Name', 'Amount', 'SL#', 'Expense', 'Amount']
      ];

      const activeExpenseCategories = [...expenseCategories];
      Object.keys(expenseHeadTotals).forEach((head) => {
        const cleanH = head.trim().toLowerCase();
        if (expenseHeadTotals[head] > 0 && !activeExpenseCategories.some((c) => (c.name || '').trim().toLowerCase() === cleanH)) {
          activeExpenseCategories.push({
            id: `head_${head}`,
            serial: activeExpenseCategories.length + 1,
            name: head,
            standardAmount: 0
          });
        }
      });
      const maxRows = Math.max(31, activeExpenseCategories.length, leftEntries.length);
      for (let i = 0; i < maxRows; i++) {
        const item = leftEntries[i];
        const cat = activeExpenseCategories[i];
        const catKey = cat ? (cat.name || '').trim() : '';
        const expAmt = catKey ? (expenseHeadTotals[catKey] || 0) : 0;
        rows.push([
          item ? String(i + 1) : '',
          item ? item.date : '',
          item ? item.bankName : '',
          item && item.amount ? String(item.amount) : '',
          cat ? String(cat.serial || (i + 1)) : '',
          cat ? cat.name : '',
          expAmt > 0 ? String(expAmt) : ''
        ]);
      }

      const totalBankSum = leftEntries.reduce((sum, item) => sum + (item.amount || 0), 0);
      const displayTotalCollectionAmount = (details.isCenter || isCenterReport)
        ? '-'
        : totalBankSum > 0
        ? String(totalBankSum)
        : totalCollectionSum > 0
        ? String(totalCollectionSum)
        : '-';
      const displayTotalExpenseAmount = totalExpenseSum > 0 ? String(totalExpenseSum) : '0';

      rows.push([
        '',
        '',
        'Total',
        displayTotalCollectionAmount,
        '',
        'Total',
        displayTotalExpenseAmount
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Expense_Report_${displayCenterName.replace(/\s+/g, '_')}_${startDate}_to_${endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showNotify('success', 'Expense report exported successfully.');
    } catch (e) {
      console.error(e);
      showNotify('error', 'Failed to export expense statement.');
    }
  };

  // Render Expense Report Sheet matching ex 2.png
  const renderExpenseReportSheet = () => {
    const details = getEntityDisplayDetails(reportEntity);
    const displayName = reportPersonName.trim() || details.personName;
    const displayCenterName = reportSalesCenterName.trim() || details.centerName;

    // Marketing officers show their deposited amount like Bank Summary only, sorted date ascending; sales centers have no sales or collection
    let leftEntries: { date: string; rawDate: string; bankName: string; amount: number }[] = [];
    if (details.isCenter || isCenterReport) {
      leftEntries = [];
    } else {
      const depositMap = new Map<string, { date: string; rawDate: string; bankName: string; amount: number }>();

      if (entityBankDeposits.length > 0) {
        entityBankDeposits.forEach((d) => {
          const bTag = (d.bankName === 'H/O' || d.displayTag === 'H/O')
            ? 'H/O'
            : getBankAndAccountShortTag(d.bankName, (d as any).accountName, d.displayTag) || d.displayTag || d.bankName || 'PBL(P.E)';
          const isoDate = parseDateToISO(d.date) || d.date;
          const key = `${isoDate}___${bTag.trim()}`;
          const existing = depositMap.get(key);
          if (existing) {
            existing.amount += (Number(d.amount) || 0);
          } else {
            depositMap.set(key, {
              date: formatDateDDMMYY(d.date),
              rawDate: isoDate,
              bankName: bTag.trim(),
              amount: Number(d.amount) || 0
            });
          }
        });
      } else if (entityCollections.length > 0) {
        // Deposited collections only (matching Bank Summary deposited amount)
        const depositedCols = entityCollections.filter((c) => isCollectionDeposited(c));
        depositedCols.forEach((c) => {
          const matchedDep = bankDeposits.find((d) => d.collectionMrId === c.id || (c.bankDepositId && d.id === c.bankDepositId));
          const bTag = matchedDep
            ? (matchedDep.bankName === 'H/O' || matchedDep.displayTag === 'H/O' ? (matchedDep.displayTag || matchedDep.bankName) : getBankAndAccountShortTag(matchedDep.bankName, matchedDep.accountName, matchedDep.displayTag) || matchedDep.displayTag || matchedDep.bankName)
            : getBankAndAccountShortTag(c.bankName, (c as any).accountName, c.depositBankTag) || c.depositBankTag || c.bankName || 'PBL(P.E)';
          const isoDate = parseDateToISO(c.depositDate || c.date) || c.date;
          const key = `${isoDate}___${bTag.trim()}`;
          const existing = depositMap.get(key);
          if (existing) {
            existing.amount += (Number(c.amount) || 0);
          } else {
            depositMap.set(key, {
              date: formatDateDDMMYY(c.depositDate || c.date),
              rawDate: isoDate,
              bankName: bTag.trim(),
              amount: Number(c.amount) || 0
            });
          }
        });
      }

      leftEntries = Array.from(depositMap.values());
      // Sort Date Ascending
      leftEntries.sort((a, b) => {
        const isoA = parseDateToISO(a.rawDate) || a.rawDate;
        const isoB = parseDateToISO(b.rawDate) || b.rawDate;
        return isoA.localeCompare(isoB);
      });
    }

    const activeExpenseCategories = [...expenseCategories];
    Object.keys(expenseHeadTotals).forEach((head) => {
      const cleanH = head.trim().toLowerCase();
      if (expenseHeadTotals[head] > 0 && !activeExpenseCategories.some((c) => (c.name || '').trim().toLowerCase() === cleanH)) {
        activeExpenseCategories.push({
          id: `head_${head}`,
          serial: activeExpenseCategories.length + 1,
          name: head,
          standardAmount: 0
        });
      }
    });
    const totalRowsCount = Math.max(31, activeExpenseCategories.length, leftEntries.length);
    const statementRows = [];
    for (let i = 0; i < totalRowsCount; i++) {
      const item = leftEntries[i];
      const cat = activeExpenseCategories[i];
      const catKey = cat ? (cat.name || '').trim() : '';
      const expAmt = catKey ? (expenseHeadTotals[catKey] || 0) : 0;

      statementRows.push({
        colSl: item ? String(i + 1) : '',
        colDate: item ? item.date : '',
        colBankName: item ? item.bankName : '',
        colAmount: item && item.amount ? item.amount.toLocaleString('en-IN') : '',
        expSl: cat ? String(cat.serial || (i + 1)) : '',
        expName: cat ? cat.name : '',
        expAmount: expAmt > 0 ? expAmt.toLocaleString('en-IN') : ''
      });
    }

    let displaySales = reportSalesAmount.trim();
    if (!displaySales) {
      if (details.isCenter || isCenterReport) {
        displaySales = '-';
      } else if (totalNetSaleSum > 0) {
        displaySales = `${totalNetSaleSum.toLocaleString('en-IN')}/-`;
      } else {
        displaySales = '-';
      }
    } else if (!displaySales.endsWith('/-') && displaySales !== '-') {
      displaySales = `${displaySales}/-`;
    }

    const totalBankSum = leftEntries.reduce((sum, item) => sum + (item.amount || 0), 0);

    let displayCollection = reportCollectionAmount.trim();
    if (!displayCollection) {
      if (details.isCenter || isCenterReport) {
        displayCollection = '-';
      } else {
        const colAmt = totalBankSum > 0 ? totalBankSum : (totalBankDepositedSum > 0 ? totalBankDepositedSum : totalCollectionSum);
        if (colAmt > 0) {
          displayCollection = `${colAmt.toLocaleString('en-IN')}/-`;
        } else {
          displayCollection = '-';
        }
      }
    } else if (!displayCollection.endsWith('/-') && displayCollection !== '-') {
      displayCollection = `${displayCollection}/-`;
    }
    const displayTotalCollectionAmount = (details.isCenter || isCenterReport)
      ? '-'
      : totalBankSum > 0
      ? totalBankSum.toLocaleString('en-IN')
      : totalCollectionSum > 0
      ? totalCollectionSum.toLocaleString('en-IN')
      : '-';
    const displayTotalExpenseAmount = totalExpenseSum > 0 ? totalExpenseSum.toLocaleString('en-IN') : '0';

    return (
      <div className="space-y-2 text-black font-['Times_New_Roman',_Times,_serif] w-full">
        {/* Document Header matching ex 2.png */}
        <div className="pb-2 text-black">
          {/* Row 1: Month (Left), Person Name (Center), Sales Center Name (Right) */}
          <div className="flex flex-wrap sm:flex-nowrap print:flex-nowrap justify-between items-center gap-1 text-[12px] sm:text-[14px] font-bold">
            <div className="text-left sm:w-1/3 print:w-1/3">
              <span>
                Month:&nbsp;
                {startDate && endDate
                  ? `${formatDateShortYY(startDate)} to ${formatDateShortYY(endDate)}`
                  : 'All Dates'}
              </span>
            </div>
            <div className="text-left sm:text-center print:text-center sm:w-1/3 print:w-1/3">
              <span>Name:&nbsp;{displayName}</span>
            </div>
            <div className="text-left sm:text-right print:text-right sm:w-1/3 print:w-1/3">
              <span>Name:&nbsp;{displayCenterName}</span>
            </div>
          </div>

          {/* Row 2: Sales (Left) and Collection (Right) */}
          <div className="flex flex-wrap justify-between items-center gap-1 text-[12px] sm:text-[14px] font-bold pt-1.5">
            <div className="text-left">
              <span>Sales:&nbsp;{displaySales}</span>
            </div>
            <div className="text-right">
              <span>Collection:&nbsp;{displayCollection}</span>
            </div>
          </div>
        </div>

        {/* 2-Column Ledger Table matching ex 2.png */}
        <div className="w-full overflow-x-auto print:overflow-visible">
          <table className="w-full min-w-[540px] border-collapse border border-black text-black text-xs">
            <thead>
              <tr className="border-b border-black text-black font-bold bg-white">
                <th className="border-r border-black text-center py-1 px-1 w-9 text-[11px]">SL#</th>
                <th className="border-r border-black text-center py-1 px-1 w-20 text-[11px]">Date</th>
                <th className="border-r border-black text-center py-1 px-1 w-32 text-[11px]">Bank Name</th>
                <th className="border-r border-black text-right py-1 px-1.5 w-24 text-[11px]">Amount</th>
                <th className="border-r border-black text-center py-1 px-1 w-9 text-[11px]">SL#</th>
                <th className="border-r border-black text-left py-1 px-2 text-[11px]">Expense</th>
                <th className="border-none text-right py-1 px-2 w-24 text-[11px]">Amount</th>
              </tr>
            </thead>
            <tbody>
              {statementRows.map((row, idx) => (
                <tr key={idx} className="border-b border-black h-[21px] leading-none hover:bg-slate-50">
                  {/* Left: Bank / Collections */}
                  <td className="border-r border-black text-center px-1 font-mono text-[11px]">{row.colSl}</td>
                  <td className="border-r border-black text-center px-1 text-[11px]">{row.colDate}</td>
                  <td className="border-r border-black text-center px-1 text-[11px] font-medium">{row.colBankName}</td>
                  <td className="border-r border-black text-right px-1.5 font-mono text-[11px]">{row.colAmount}</td>

                  {/* Right: Expenses */}
                  <td className="border-r border-black text-center px-1 font-mono text-[11px]">{row.expSl}</td>
                  <td className="border-r border-black text-left px-2 text-[11px] font-medium">{row.expName}</td>
                  <td className="border-none text-right px-2 font-mono text-[11px] font-semibold">{row.expAmount}</td>
                </tr>
              ))}

              {/* Total Row matching ex 2.png */}
              <tr className="border-t-2 border-black font-bold h-7">
                <td className="border-r border-black text-center px-1"></td>
                <td className="border-r border-black text-center px-1"></td>
                <td className="border-r border-black text-center px-1 font-bold text-xs">
                  Total
                </td>
                <td className="border-r border-black text-right px-1.5 font-mono font-bold text-xs">
                  {displayTotalCollectionAmount}
                </td>
                <td className="border-r border-black text-center px-1"></td>
                <td className="border-r border-black text-right px-3 font-bold text-xs">
                  Total
                </td>
                <td className="border-none text-right px-2 font-mono font-bold text-xs">
                  {displayTotalExpenseAmount}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 3 Signatures matching ex.png & ex 2.png */}
        <div className="flex justify-between items-end pt-14 pb-4 px-6 text-black text-xs font-bold">
          <div className="flex flex-col items-center">
            <div className="w-24 border-t border-black mb-1"></div>
            <span className="tracking-wider">AGM</span>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-36 border-t border-black mb-1"></div>
            <span className="tracking-wider">Accounts/Audit</span>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-24 border-t border-black mb-1"></div>
            <span className="tracking-wider">DGM</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 font-sans">


      {/* Compact Toast Notification */}
      {notification && (
        <div
          className={`fixed bottom-4 right-4 z-[130] max-w-xs w-auto px-3 py-2 rounded-xl text-[11px] font-bold shadow-xl flex items-center gap-2 border backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150 ${
            notification.type === 'success'
              ? 'bg-emerald-950/95 text-emerald-200 border-emerald-400/50'
              : 'bg-rose-950/95 text-rose-200 border-rose-400/50'
          }`}
        >
          <span className="leading-snug">{notification.text}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-slate-300 hover:text-white font-bold cursor-pointer shrink-0 ml-1"
            title="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Global Excel Import Input for Collection List & Cash In Hand */}
      <input
        type="file"
        ref={xlsxFileInputRef}
        onChange={handleImportCollectionsXlsx}
        accept=".xlsx, .xls, .csv"
        className="hidden"
      />

      {/* 1. EXPENSE ENTRY FORM - REARRANGED FOR FAST PETTY CASH DISPATCH */}
      {activeTab === 'entry' && (
        <div className="space-y-6 max-w-4xl mx-auto">
          <div className="cyber-glass-card rounded-2xl overflow-visible text-white">
            {/* Header Banner */}
            <div className="cyber-glass-header rounded-t-2xl p-4 sm:p-5 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="bg-emerald-500/20 p-2.5 rounded-xl border border-emerald-400/35 text-emerald-300">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-black text-white tracking-tight">Quick Expense Entry</h2>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-200 border border-emerald-400/35 px-2 py-0.5 rounded-full font-mono uppercase font-bold">
                      Rapid Voucher
                    </span>
                  </div>
                  <p className="text-xs text-cyan-200/80 mt-0.5">Rapid 1-Click Petty Cash Dispatch & Accounts Allocation</p>
                </div>
              </div>
              <div />
            </div>

            <form onSubmit={handleSaveExpense} className="p-5 sm:p-6 space-y-5">
              {editingExpense && (
                <div className="p-3 bg-amber-500/15 border border-amber-400/40 rounded-xl flex items-center justify-between animate-in fade-in">
                  <div className="flex items-center space-x-2">
                    <Edit2 className="w-4 h-4 text-amber-300" />
                    <span className="text-xs font-bold text-amber-100">
                      Editing Voucher #{editingExpense.id} ({editingExpense.expenseHead} - ৳{editingExpense.amount.toLocaleString('en-IN')})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelEditExpense}
                    className="text-xs font-bold text-amber-200 hover:text-white px-2.5 py-1 bg-[#081b28] border border-amber-400/40 rounded-lg hover:bg-amber-500/20 cursor-pointer"
                  >
                    Cancel Edit
                  </button>
                </div>
              )}

              {/* SECTION 1: CONTEXT & ALLOCATION (REARRANGED 3-COLUMN GRID) */}
              <div className="cyber-glass-subcard p-4 rounded-xl border border-cyan-500/25 space-y-3">
                <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
                  <span className="text-xs font-bold text-cyan-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Allocation & Voucher Info</span>
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Press <kbd className="px-1.5 py-0.5 text-[10px] bg-[#061520] text-cyan-200 border border-cyan-500/30 rounded font-bold">Enter ↵</kbd> to jump between fields
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  {/* Field 1: Assign Expense To (SELECT FIRST & REMEMBERED) */}
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      1. Assign Expense To: <span className="text-[10px] text-emerald-300 font-semibold">(Remembered)</span>
                    </label>
                    <AssignExpenseToSelect
                      triggerRef={assignExpenseTriggerRef}
                      value={assignedEntity}
                      onChange={(val) => {
                        setAssignedEntity(val);
                        try {
                          localStorage.setItem('polycables_last_assigned_expense_entity', val);
                        } catch (e) {}
                        if (!areaName.trim()) {
                          const b = branches.find((br) => cleanSalesCenterName(br.name).toLowerCase() === val.toLowerCase());
                          if (b?.address) {
                            setAreaName(b.address.split(',')[0].trim());
                          } else {
                            const sp = effectiveAllSalespersons.find((s) => s.name.toLowerCase() === val.toLowerCase());
                            if (sp?.areaGroup) {
                              setAreaName(sp.areaGroup);
                            } else if (sp?.branchName) {
                              setAreaName(sp.branchName.replace(/\s*(sales center|showroom|branch)\s*/i, '').trim());
                            }
                          }
                        }
                      }}
                      branches={branches}
                      salespersons={salespersons}
                      onSelectAndProceed={() => {
                        setTimeout(() => {
                          dateInputRef.current?.focus();
                          dateInputRef.current?.select();
                        }, 10);
                      }}
                      onGoBack={() => {
                        saveButtonRef.current?.focus();
                      }}
                      themeColor="emerald"
                    />
                  </div>

                  {/* Field 2: Expense Date (After save goes to Date -> Date to Assign Expense To on Enter/Arrow) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-300">2. Expense Date:</label>
                      <button
                        type="button"
                        onClick={() => setEntryDate(formatDateDDMMYY(new Date()))}
                        className="text-[10px] text-cyan-300 hover:text-cyan-200 font-bold underline cursor-pointer"
                        title="Set to today's date"
                      >
                        Today
                      </button>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        ref={dateInputRef}
                        type="text"
                        value={entryDate}
                        onChange={(e) => setEntryDate(e.target.value)}
                        onBlur={() => {
                          if (entryDate.trim()) {
                            setEntryDate(formatDateDDMMYY(entryDate));
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                            e.preventDefault();
                            if (entryDate.trim()) {
                              setEntryDate(formatDateDDMMYY(entryDate));
                            }
                            categoryInputRef.current?.focus();
                            categoryInputRef.current?.select();
                          } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                            e.preventDefault();
                            assignExpenseTriggerRef.current?.focus();
                          }
                        }}
                        placeholder="dd.mm.yy"
                        required
                        className="w-full p-2.5 pr-9 border border-cyan-500/30 rounded-lg text-xs bg-[#061520] font-mono font-bold text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                      />
                      <div className="absolute right-2 flex items-center">
                        <input
                          type="date"
                          value={parseDateToISO(entryDate)}
                          onChange={(e) => {
                            if (e.target.value) {
                              setEntryDate(formatDateDDMMYY(e.target.value));
                            }
                          }}
                          className="opacity-0 absolute inset-0 w-7 h-7 cursor-pointer z-10"
                          title="Pick Expense Date"
                        />
                        <Calendar className="w-4 h-4 text-cyan-300/80 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  {/* Field 3: Area / Location */}
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">3. Area / Location:</label>
                    <input
                      ref={areaInputRef}
                      type="text"
                      value={areaName}
                      onChange={(e) => setAreaName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                          e.preventDefault();
                          categoryInputRef.current?.focus();
                          categoryInputRef.current?.select();
                        } else if (e.key === 'ArrowUp' || (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0)) {
                          e.preventDefault();
                          assignExpenseTriggerRef.current?.focus();
                        }
                      }}
                      placeholder="Madhupur / Tangail"
                      className="w-full p-2.5 border border-cyan-500/30 rounded-lg text-xs bg-[#061520] text-white placeholder-slate-400 font-medium focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: EXPENSE CATEGORY & AMOUNT (PROMINENT REARRANGED INPUTS) */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Left: Category / Head with Frequent Preset Chips */}
                <div className="md:col-span-7 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300 block">
                      Expense Head / Category *
                    </label>
                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={() => setShowCategoryManagerModal(true)}
                        className="text-[10px] text-cyan-200 hover:text-white bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/35 px-2 py-0.5 rounded font-bold transition-colors cursor-pointer flex items-center space-x-1"
                        title="Add, edit, or renumber all expense categories"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Manage Heads</span>
                      </button>
                    </div>
                  </div>

                  <ExpenseCategoryCombobox
                    inputRef={categoryInputRef}
                    categories={expenseCategories}
                    value={selectedHead}
                    onChange={(val) => setSelectedHead(val)}
                    onAddNew={handleAddNewCategory}
                    onOpenCategoryManager={() => setShowCategoryManagerModal(true)}
                    onSelectAndAdvance={() => {
                      amountInputRef.current?.focus();
                      amountInputRef.current?.select();
                    }}
                    placeholder="Type serial # or name (e.g. 3 or Fuel)..."
                    required
                  />
                </div>

                {/* Right: Amount (Large, High Visibility Box) */}
                <div className="md:col-span-5 space-y-2">
                  <label className="text-xs font-bold text-slate-300 block">
                    Amount to Disburse (Tk) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-emerald-300 font-black text-lg">৳</span>
                    <input
                      ref={amountInputRef}
                      type="number"
                      step="any"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          remarksInputRef.current?.focus();
                          remarksInputRef.current?.select();
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          categoryInputRef.current?.focus();
                          categoryInputRef.current?.select();
                        }
                      }}
                      placeholder="0.00"
                      required
                      className="w-full p-2.5 pl-8 border-2 border-emerald-400/50 rounded-xl text-xl font-black text-emerald-300 bg-[#061520] placeholder-slate-500 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Enter petty cash disbursed amount in Bangladeshi Taka.
                  </p>
                </div>
              </div>

              {/* SECTION 3: REMARKS & NARRATION */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Remarks / Voucher Reference (Optional):</label>
                <input
                  ref={remarksInputRef}
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      saveButtonRef.current?.focus();
                    } else if (e.key === 'ArrowUp' || (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0)) {
                      e.preventDefault();
                      amountInputRef.current?.focus();
                      amountInputRef.current?.select();
                    }
                  }}
                  placeholder="e.g. Voucher #1024 / Paid cash to vendor (Press Enter ↵ to proceed)"
                  className="w-full p-2.5 border border-cyan-500/30 rounded-lg text-xs bg-[#061520] text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                />
              </div>

              {/* ACTION BUTTONS BAR */}
              <div className="pt-3 flex items-center justify-between border-t border-cyan-500/20">
                <button
                  type="button"
                  onClick={() => {
                    setAmount('');
                    setSelectedHead('');
                    setRemarks('');
                    if (editingExpense) handleCancelEditExpense();
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-slate-200 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 cursor-pointer"
                >
                  Clear Form
                </button>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('directory')}
                    className="px-4 py-2 rounded-lg text-xs font-bold text-slate-200 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    ref={saveButtonRef}
                    type="submit"
                    disabled={isSavingExpense}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        remarksInputRef.current?.focus();
                      }
                    }}
                    className="px-6 py-2.5 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 text-xs font-black rounded-xl shadow-md transition-all flex items-center space-x-2 cursor-pointer active:scale-95 focus:ring-2 focus:ring-cyan-300 focus:outline-none"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isSavingExpense ? 'Saving...' : editingExpense ? 'Update Expense Entry' : 'Save Expense'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* SECTION 4: RECENT TODAY'S EXPENSES LOG (LIVE FILTERED BY ASSIGN EXPENSE TO) */}
          {(() => {
            const targetLow = (assignedEntity || '').trim().toLowerCase();
            const targetCleanLow = cleanSalesCenterName(assignedEntity || '').trim().toLowerCase();
            const assigneeMatchedExpenses = !targetLow
              ? expenses
              : expenses.filter((exp) => {
                  const eNameLow = (exp.entityName || (exp as any).assignedEntity || '').trim().toLowerCase();
                  const eCleanLow = cleanSalesCenterName(exp.entityName || '').trim().toLowerCase();
                  const eBranchCleanLow = cleanSalesCenterName(exp.branchName || '').trim().toLowerCase();
                  return (
                    eNameLow === targetLow ||
                    (targetCleanLow !== '' && (eCleanLow === targetCleanLow || eBranchCleanLow === targetCleanLow))
                  );
                });
            const displayedRecentExpenses = filterRecentByAssignee && targetLow ? assigneeMatchedExpenses : expenses;
            const visibleSlice = displayedRecentExpenses.slice(0, 12);

            return (
              <div className="cyber-glass-card rounded-2xl overflow-hidden text-white">
                <div className="cyber-glass-header p-3.5 px-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                    <Receipt className="w-4 h-4 text-cyan-300" />
                    <h3 className="text-xs sm:text-sm font-bold text-white">Recent Expenses Log</h3>
                    <span className="text-[10px] bg-emerald-500/15 text-emerald-200 border border-emerald-400/35 px-2 py-0.5 rounded font-mono">
                      {displayedRecentExpenses.length} Records
                    </span>
                    {assignedEntity && (
                      <div className="flex items-center gap-1 bg-[#061520] p-0.5 rounded-lg border border-cyan-500/30">
                        <button
                          type="button"
                          onClick={() => setFilterRecentByAssignee(true)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                            filterRecentByAssignee
                              ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/40'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Assigned: {assignedEntity} ({assigneeMatchedExpenses.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setFilterRecentByAssignee(false)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                            !filterRecentByAssignee
                              ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/40'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          All ({expenses.length})
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="text-xs font-bold text-slate-300">
                    Filtered Total:{' '}
                    <span className="text-amber-300 font-mono font-black text-sm">
                      ৳{displayedRecentExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 font-bold uppercase text-[10px]">
                        <th className="py-2 px-3 w-10 text-center">SL</th>
                        <th className="py-2 px-3 w-24">Date</th>
                        <th className="py-2 px-3">Expense Head</th>
                        <th className="py-2 px-3">Assigned To</th>
                        <th className="py-2 px-3 text-right w-28">Amount (Tk)</th>
                        <th className="py-2 px-3">Remarks</th>
                        <th className="py-2 px-3 w-20 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                      {visibleSlice.map((exp, idx) => (
                        <tr key={exp.id || idx} className="hover:bg-cyan-500/[0.06] transition-colors">
                          <td className="py-2 px-3 text-center font-mono text-slate-400">{idx + 1}</td>
                          <td className="py-2 px-3 font-mono text-slate-300 font-medium">{formatDateDDMMYY(exp.date)}</td>
                          <td className="py-2 px-3 font-bold text-white">{exp.expenseHead}</td>
                          <td className="py-2 px-3 text-slate-300">{exp.entityName || (exp as any).assignedEntity || exp.branchName || exp.area || '-'}</td>
                          <td className="py-2 px-3 text-right font-mono font-black text-emerald-300">
                            ৳{(Number(exp.amount) || 0).toLocaleString('en-IN')}
                          </td>
                          <td className="py-2 px-3 text-slate-400 truncate max-w-[200px]">{exp.remarks || '-'}</td>
                          <td className="py-2 px-3 text-center">
                            <div className="flex items-center justify-center space-x-1">
                              <button
                                type="button"
                                onClick={() => handleStartEditExpense(exp)}
                                className="p-1 text-slate-400 hover:text-cyan-300 rounded hover:bg-cyan-500/15 transition-colors cursor-pointer"
                                title="Edit"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteExpense(exp.id, exp.expenseHead, exp.amount)}
                                className="p-1 text-slate-400 hover:text-rose-300 rounded hover:bg-rose-500/15 transition-colors cursor-pointer"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {visibleSlice.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-slate-400 italic">
                            {filterRecentByAssignee && assignedEntity
                              ? `No expenses found assigned to "${assignedEntity}".`
                              : 'No expense vouchers logged yet.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* 2. COLLECTION (MR) ENTRY FORM - MONEY RECEIPT STYLE CONVERTED TO CYBER-GLASS & POLY CABLES BRANDING */}
      {activeTab === 'collection_entry' && (() => {
        const firstEnteredPartyCenter = resolvePartySalesCenter(mrPartyRows[0]?.partyName || '');
        const resolvedMrCenterName = userFixedSalesCenter || mrPartyFixedBranch || firstEnteredPartyCenter || mrEntity;
        const activeMrBranch = (
          branches.find((b) => cleanBranchName(b.name).toLowerCase() === cleanBranchName(resolvedMrCenterName).toLowerCase()) ||
          (userBranch ? branches.find((b) => b.id === userBranch.id) : null) ||
          userBranch ||
          null
        ) as BranchLocation | null;
        const activeMrBranchAddr = getBranchAddressDetails(activeMrBranch, company?.phone, company?.email);
        // Never allow "Madhupur Sales Center" or any Sales Center name as the Company Name on Money Receipt
        const rawCompName = (company?.name || '').trim();
        const isSalesCenterAsComp = /madhupur|sales\s*center|showroom/i.test(rawCompName);
        const mrCompanyName = (!rawCompName || isSalesCenterAsComp) ? 'POLY CABLES INDUSTRIES LTD.' : rawCompName;
        const cleanCompanyAddr = (
          company?.address ||
          (activeMrBranchAddr.fullAddress || '').replace(/^[^,:]*sales\s*center[^,:]*[,:]?\s*/i, '') ||
          'Dhaka, Bangladesh'
        ).trim();
        const totalMrCollection = mrPartyRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
        const totalMrInWords = totalMrCollection > 0 ? convertToTakaWords(totalMrCollection) : 'Zero Taka Only';

        // Compute matched party ledger Paid / Due summary across selected party rows
        const enteredPartyKeys = Array.from(
          new Set(
            mrPartyRows
              .map((r) => cleanSelectedPartyName(r.partyName).trim().toLowerCase())
              .filter(Boolean)
          )
        );
        const partyBillsSum =
          enteredPartyKeys.length > 0
            ? (storedBills || []).reduce((sum, b) => {
                const bParty = cleanSelectedPartyName(b.header?.partyName || '').trim().toLowerCase();
                if (enteredPartyKeys.includes(bParty)) {
                  const netVal = Number(b.netAmount ?? b.grandTotal ?? (b as any).totals?.netTotal ?? (b as any).totals?.grandTotal ?? 0);
                  return sum + (isNaN(netVal) ? 0 : netVal);
                }
                return sum;
              }, 0)
            : 0;
        const priorPartyPaidSum =
          enteredPartyKeys.length > 0
            ? (collections || []).reduce((sum, c) => {
                const cParty = cleanSelectedPartyName(c.partyName || (c as any).customerName || '').trim().toLowerCase();
                if (enteredPartyKeys.includes(cParty)) {
                  return sum + (Number(c.amount) || 0);
                }
                return sum;
              }, 0)
            : 0;
        const totalPaidWithCurrent = priorPartyPaidSum + totalMrCollection;
        const calculatedDueTotal = partyBillsSum > 0 ? Math.max(0, partyBillsSum - totalPaidWithCurrent) : 0;

        return (
        <div className="w-full max-w-5xl mx-auto space-y-2.5 text-white">
          {/* Standard Compact Page Head Line with Back & Close Sign Buttons */}
          <div className="cyber-glass-card rounded-2xl px-4 py-2.5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="flex items-center space-x-2 text-cyan-300 min-w-0">
              <Receipt className="w-4 h-4 text-cyan-300 shrink-0" />
              <span className="hidden sm:inline text-xs font-bold uppercase tracking-wider text-cyan-200/90 truncate">
                Money Receipt Voucher
              </span>
            </div>

            <h2 className="text-base sm:text-lg font-black text-white tracking-tight text-center">
              Party Collection Entry
            </h2>

            <div className="shrink-0" />
          </div>

          {/* MONEY RECEIPT PAPER-STYLE CYBER-GLASS CONTAINER (Matches Template Architecture) */}
          <form
            onSubmit={handleSaveCollection}
            className="cyber-glass-card rounded-2xl overflow-hidden border border-cyan-500/35 shadow-[0_24px_60px_rgba(0,0,0,0.55)] bg-[#061520]/95"
          >
            {/* Top Two-Tone Diagonal Split Bar (Deep Cyan Left + Angled Gap + Amber/Orange Right) */}
            <div className="relative h-6 w-full bg-[#061520] overflow-hidden select-none">
              <div
                className="absolute inset-y-0 left-0 w-[38%] bg-gradient-to-r from-[#0a3c59] via-[#0e5778] to-cyan-400"
                style={{ clipPath: 'polygon(0 0, 100% 0, 88% 100%, 0% 100%)' }}
              />
              <div
                className="absolute inset-y-0 right-0 w-[66%] bg-gradient-to-r from-amber-500 via-amber-400 to-orange-500"
                style={{ clipPath: 'polygon(6% 0, 100% 0, 100% 100%, 0% 100%)' }}
              />
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              {/* Receipt Header Row: Left = Poly Cables Logo, Center = MONEY RECEIPT + Phone/Email, Right = Company Name + Address (No Sales Center as Company Name) */}
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-3">
                {/* Left: Brand Logo */}
                <div className="flex items-center justify-start">
                  <PolyCablesLogo size="md" variant="dark" showSubtitle={true} subtitleText="STORE & BILLING" />
                </div>

                {/* Center: Title + Contact */}
                <div className="text-center space-y-0.5">
                  <h1 className="text-2xl sm:text-3xl font-black tracking-wider text-cyan-300 drop-shadow-[0_0_12px_rgba(34,211,238,0.28)]">
                    MONEY RECEIPT
                  </h1>
                  <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-300 font-medium">
                    <span>📞 {activeMrBranchAddr.phone || company?.phone || '01713-434290'}</span>
                    <span>✉ {activeMrBranchAddr.email || company?.email || 'info@polycables.com.bd'}</span>
                  </div>
                </div>

                {/* Right: Official Company Name & Address (Madhupur Sales Center removed) */}
                <div className="md:text-right text-left space-y-0.5">
                  <div className="text-sm sm:text-base font-black text-white tracking-wide uppercase">
                    {mrCompanyName}
                  </div>
                  <div className="text-[11px] text-slate-300 leading-snug">
                    {cleanCompanyAddr}
                  </div>
                </div>
              </div>

              {/* NO .......... & Date .......... Metadata Bar + Horizontal Amber/Cyan Divider */}
              <div className="space-y-2.5 pt-1">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  {/* Left: NO */}
                  <div className="flex items-baseline gap-2 min-w-[200px]">
                    <label htmlFor="mr-no-input" className="text-sm font-black tracking-wide text-slate-200 shrink-0">
                      NO
                    </label>
                    <input
                      id="mr-no-input"
                      type="text"
                      value={mrNo}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMrNo(val);
                        setIsMrNoManuallyEdited(val.trim() !== '');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          document.getElementById('mr-entity-select')?.focus();
                        }
                      }}
                      placeholder="MR-01"
                      required
                      className="w-40 bg-transparent border-b border-dotted border-cyan-400/70 px-1.5 py-0.5 text-sm font-mono font-black text-cyan-300 focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  {/* Right: Date */}
                  <div className="flex items-baseline gap-2">
                    <label htmlFor="mr-date-input" className="text-sm font-black tracking-wide text-slate-200 shrink-0">
                      Date
                    </label>
                    <div className="relative flex items-center">
                      <input
                        ref={mrDateInputRef}
                        id="mr-date-input"
                        type="text"
                        value={mrDate}
                        onChange={(e) => setMrDate(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (mrDate.trim()) {
                              setMrDate(formatDateDDMMYY(mrDate) || mrDate);
                            }
                            document.getElementById('mr-party-input-0')?.focus();
                          }
                        }}
                        onBlur={() => {
                          if (mrDate.trim()) {
                            setMrDate(formatDateDDMMYY(mrDate) || mrDate);
                          }
                        }}
                        placeholder="dd.mm.yy"
                        required
                        className="w-36 pr-7 bg-transparent border-b border-dotted border-cyan-400/70 px-1.5 py-0.5 text-sm font-mono font-bold text-white focus:outline-none focus:border-amber-400"
                      />
                      <div className="absolute right-0.5 flex items-center">
                        <input
                          type="date"
                          value={parseDateToISO(mrDate)}
                          onChange={(e) => {
                            if (e.target.value) {
                              setMrDate(formatDateDDMMYY(e.target.value));
                            }
                          }}
                          className="opacity-0 absolute inset-0 w-6 h-6 cursor-pointer z-10"
                          title="Pick Collection Date"
                        />
                        <Calendar className="w-3.5 h-3.5 text-cyan-300 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Horizontal Accent Divider matching Money Receipt bar */}
                <div className="h-1.5 w-full rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-cyan-400 shadow-[0_0_12px_rgba(245,158,11,0.3)]" />
              </div>

              {/* Datalist for party autocomplete */}
              <datalist id="party-collection-options">
                {parties.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.address ? `${p.name} — ${p.address}` : p.name}
                  </option>
                ))}
              </datalist>

              {/* Dotted-Line Money Receipt Body Rows */}
              <div className="space-y-3.5 pt-1">
                {/* Multi-Party Rows header + Add Row */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-300/85">
                    Receipt Voucher Lines ({mrPartyRows.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddMrPartyRow}
                    className="px-2.5 py-1 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-[11px] rounded-lg shadow-sm flex items-center space-x-1 cursor-pointer transition-all active:scale-95"
                    title="Add another party row to this voucher"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Row</span>
                  </button>
                </div>

                {mrPartyRows.map((row, idx) => {
                  const cleanRowName = cleanSelectedPartyName(row.partyName);
                  const matchedParty = parties.find(
                    (p) =>
                      p.name.trim().toLowerCase() === cleanRowName.trim().toLowerCase() ||
                      p.name.trim().toLowerCase() === row.partyName.trim().toLowerCase()
                  );
                  const rowQuery = row.partyName.trim().toLowerCase();
                  const rowFilteredParties = (
                    !rowQuery
                      ? parties
                      : parties.filter(
                          (p) =>
                            (p.name || '').toLowerCase().includes(rowQuery) ||
                            (p.address || '').toLowerCase().includes(rowQuery) ||
                            (p.phone || '').toLowerCase().includes(rowQuery) ||
                            (p.mobile || '').toLowerCase().includes(rowQuery) ||
                            (p.salespersonName || '').toLowerCase().includes(rowQuery)
                        )
                  ).slice(0, 40);
                  const isRowDropdownOpen = activeMrRowPartyIdx === idx;

                  return (
                    <div
                      key={row.id}
                      className="p-3 sm:p-3.5 rounded-xl bg-[#091d2b]/80 border border-cyan-500/25 space-y-3 hover:border-cyan-400/50 transition-colors"
                    >
                      {/* Row 1: Received with thanks from .............................. */}
                      <div className="flex flex-col sm:flex-row sm:items-baseline gap-2">
                        <div className="flex items-center gap-2 shrink-0">
                          {mrPartyRows.length > 1 && (
                            <span className="font-mono font-black text-[11px] text-cyan-200 bg-cyan-500/15 border border-cyan-400/35 px-1.5 py-0.5 rounded">
                              #{idx + 1}
                            </span>
                          )}
                          <label htmlFor={`mr-party-input-${idx}`} className="text-xs sm:text-sm font-bold text-slate-100 whitespace-nowrap">
                            Received with thanks from
                          </label>
                        </div>
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <div className="flex-1 min-w-0 relative mr-party-row-container">
                            <div className="flex items-center border-b border-dotted border-cyan-400/60 focus-within:border-amber-400">
                              <input
                                id={`mr-party-input-${idx}`}
                                ref={idx === 0 ? mrPartyInputRef : undefined}
                                type="text"
                                autoComplete="off"
                                value={row.partyName}
                                onChange={(e) => {
                                  handleUpdateMrPartyRow(row.id, 'partyName', e.target.value);
                                  setActiveMrRowPartyIdx(idx);
                                  setMrRowPartyHighlightIdx(0);
                                }}
                                onFocus={() => {
                                  setActiveMrRowPartyIdx(idx);
                                  setMrRowPartyHighlightIdx(0);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (!isRowDropdownOpen) {
                                      setActiveMrRowPartyIdx(idx);
                                      setMrRowPartyHighlightIdx(0);
                                    } else if (rowFilteredParties.length > 0) {
                                      setMrRowPartyHighlightIdx((prev) => Math.min(prev + 1, rowFilteredParties.length - 1));
                                    }
                                  } else if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (!isRowDropdownOpen) {
                                      setActiveMrRowPartyIdx(idx);
                                      setMrRowPartyHighlightIdx(0);
                                    } else if (rowFilteredParties.length > 0) {
                                      setMrRowPartyHighlightIdx((prev) => Math.max(prev - 1, 0));
                                    }
                                  } else if (e.key === 'Escape') {
                                    if (isRowDropdownOpen) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setActiveMrRowPartyIdx(null);
                                    }
                                  } else if (e.key === 'Enter') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (isRowDropdownOpen && rowFilteredParties.length > 0) {
                                      const chosen = rowFilteredParties[mrRowPartyHighlightIdx] || rowFilteredParties[0];
                                      if (chosen) {
                                        handleUpdateMrPartyRow(row.id, 'partyName', chosen.name);
                                      }
                                    }
                                    setActiveMrRowPartyIdx(null);
                                    setTimeout(() => {
                                      document.getElementById(`mr-amount-input-${idx}`)?.focus();
                                    }, 20);
                                  }
                                }}
                                placeholder="Type or select customer / party name..."
                                className="w-full bg-transparent px-2 py-1 text-sm font-extrabold text-white placeholder-slate-500 focus:outline-none"
                                required
                              />
                              <button
                                type="button"
                                tabIndex={-1}
                                onClick={() => {
                                  const nextOpen = isRowDropdownOpen ? null : idx;
                                  setActiveMrRowPartyIdx(nextOpen);
                                  if (nextOpen !== null) setMrRowPartyHighlightIdx(0);
                                }}
                                className="p-1 text-cyan-300/70 hover:text-cyan-200 cursor-pointer shrink-0"
                                title="Toggle party list"
                              >
                                <ChevronDown className={`w-4 h-4 transition-transform ${isRowDropdownOpen ? 'rotate-180' : ''}`} />
                              </button>
                            </div>

                            {isRowDropdownOpen && rowFilteredParties.length > 0 && (
                              <div
                                ref={mrRowPartyDropdownRef}
                                className="absolute left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto bg-[#081c29] border border-cyan-500/40 rounded-xl shadow-2xl z-50 divide-y divide-cyan-500/15 text-xs"
                              >
                                {rowFilteredParties.map((p, pIdx) => {
                                  const isHighlighted = mrRowPartyHighlightIdx === pIdx;
                                  const isSelected = row.partyName.trim().toLowerCase() === p.name.trim().toLowerCase();
                                  return (
                                    <button
                                      key={p.id || `${p.name}-${pIdx}`}
                                      type="button"
                                      data-mr-party-highlighted={isHighlighted}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleUpdateMrPartyRow(row.id, 'partyName', p.name);
                                        setActiveMrRowPartyIdx(null);
                                        setTimeout(() => {
                                          document.getElementById(`mr-amount-input-${idx}`)?.focus();
                                        }, 20);
                                      }}
                                      onMouseEnter={() => setMrRowPartyHighlightIdx(pIdx)}
                                      className={`w-full text-left px-3 py-2 flex items-center justify-between cursor-pointer transition-colors ${
                                        isHighlighted
                                          ? 'bg-cyan-500/25 text-white font-bold border-l-4 border-cyan-400'
                                          : isSelected
                                          ? 'bg-emerald-500/15 text-emerald-200 font-bold'
                                          : 'hover:bg-cyan-500/10 text-slate-200'
                                      }`}
                                    >
                                      <div className="min-w-0">
                                        <div className="font-bold text-white truncate">{p.name}</div>
                                        <div className="text-[10px] text-slate-400 truncate">
                                          {p.address || 'No address'} {p.salespersonName ? `• ${p.salespersonName}` : ''} {p.branchName ? `• ${p.branchName}` : ''}
                                        </div>
                                      </div>
                                      {isSelected && <Check className="w-3.5 h-3.5 text-emerald-300 shrink-0 ml-2" />}
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {matchedParty && (
                              <div className="text-[10px] text-slate-400 flex flex-wrap items-center gap-2.5 pt-1">
                                {matchedParty.address && <span>📍 {matchedParty.address}</span>}
                                {matchedParty.salespersonName && (
                                  <span className="text-cyan-300 font-semibold">👤 {matchedParty.salespersonName}</span>
                                )}
                                {matchedParty.branchName && (
                                  <span className="text-amber-300 font-medium">🏢 {matchedParty.branchName}</span>
                                )}
                              </div>
                            )}
                          </div>
                          {mrPartyRows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMrPartyRow(row.id)}
                              className="p-1.5 text-rose-400 hover:text-rose-200 hover:bg-rose-500/15 rounded-lg transition-colors cursor-pointer shrink-0"
                              title="Remove row"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Row 2: Amount ................................................ */}
                      <div className="flex flex-col sm:flex-row sm:items-baseline gap-2">
                        <label htmlFor={`mr-amount-input-${idx}`} className="text-xs sm:text-sm font-bold text-slate-100 whitespace-nowrap sm:w-44 shrink-0">
                          Amount (৳)
                        </label>
                        <div className="flex-1 flex items-center gap-2 border-b border-dotted border-cyan-400/60 pb-0.5">
                          <span className="text-sm font-black text-emerald-300">৳</span>
                          <input
                            id={`mr-amount-input-${idx}`}
                            type="number"
                            step="any"
                            value={row.amount}
                            onChange={(e) => handleUpdateMrPartyRow(row.id, 'amount', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                document.getElementById(`mr-remarks-input-${idx}`)?.focus();
                              }
                            }}
                            placeholder="0.00"
                            className="w-full bg-transparent px-1 py-0.5 text-sm font-mono font-black text-emerald-300 placeholder-slate-500 focus:outline-none"
                            required
                          />
                        </div>
                      </div>

                      {/* Row 4 (For) + Row-level cheque overrides when cheque mode */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-baseline">
                        <div className="flex items-baseline gap-2">
                          <label htmlFor={`mr-remarks-input-${idx}`} className="text-xs sm:text-sm font-bold text-slate-100 whitespace-nowrap shrink-0">
                            For
                          </label>
                          <input
                            id={`mr-remarks-input-${idx}`}
                            type="text"
                            value={row.remarks}
                            onChange={(e) => handleUpdateMrPartyRow(row.id, 'remarks', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                if (idx === 0) {
                                  const branchEl = document.getElementById('mr-entity-select') as HTMLSelectElement | null;
                                  if (branchEl && !branchEl.disabled) {
                                    branchEl.focus();
                                    return;
                                  }
                                }
                                if (idx + 1 < mrPartyRows.length) {
                                  document.getElementById(`mr-party-input-${idx + 1}`)?.focus();
                                } else {
                                  (mrPaymentType === 'cheque' ? mrChequeBtnRef.current : mrCashBtnRef.current)?.focus();
                                }
                              }
                            }}
                            placeholder="Invoice / Bill ref or remarks..."
                            className="flex-1 bg-transparent border-b border-dotted border-cyan-400/60 px-2 py-0.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                          />
                        </div>

                        {idx === 0 && (
                          <div className="flex items-baseline gap-2">
                            <label htmlFor="mr-entity-select" className="text-xs sm:text-sm font-bold text-slate-100 whitespace-nowrap shrink-0 flex items-center gap-1.5">
                              <span>Branch</span>
                              {(isUserSalesCenterFixed || Boolean(mrPartyFixedBranch)) && (
                                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-400/40">
                                  {isUserSalesCenterFixed ? 'Fixed (User)' : 'Fixed (Party)'}
                                </span>
                              )}
                            </label>
                            <select
                              id="mr-entity-select"
                              value={mrEntity}
                              disabled={isUserSalesCenterFixed || Boolean(mrPartyFixedBranch)}
                              onChange={(e) => {
                                if (!isUserSalesCenterFixed && !mrPartyFixedBranch) {
                                  setMrEntity(e.target.value);
                                  setIsMrNoManuallyEdited(false);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (mrPartyRows.length > 1) {
                                    document.getElementById('mr-party-input-1')?.focus();
                                  } else {
                                    (mrPaymentType === 'cheque' ? mrChequeBtnRef.current : mrCashBtnRef.current)?.focus();
                                  }
                                }
                              }}
                              className={`flex-1 bg-[#061520] border-b border-dotted border-cyan-400/60 px-2 py-1 text-xs sm:text-sm font-bold text-cyan-200 focus:outline-none focus:border-amber-400 rounded-t ${
                                isUserSalesCenterFixed || Boolean(mrPartyFixedBranch) ? 'opacity-90 cursor-not-allowed' : ''
                              }`}
                            >
                              <optgroup label="Sales Centers / Branch Accounts">
                                {(effectiveAllBranches || [])
                                  .filter((b) => b && !isUnwantedSalesCenter(b))
                                  .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                                  .map((b) => (
                                    <option key={b.id} value={b.name}>
                                      {b.name}
                                    </option>
                                  ))}
                                {!(effectiveAllBranches || []).some((b) => b.name === 'Madhupur Sales Center') && (
                                  <option value="Madhupur Sales Center">Madhupur Sales Center</option>
                                )}
                              </optgroup>
                              {!isUserSalesCenterFixed && !mrPartyFixedBranch && (
                                <optgroup label="Assigned Salespersons / Officers">
                                  {salespersons.map((sp) => (
                                    <option key={sp.id} value={sp.name}>
                                      {sp.name}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                          </div>
                        )}
                      </div>

                      {/* Row-level Cheque overrides if multiple rows under Cheque Payment */}
                      {mrPaymentType === 'cheque' && (
                        <div className="pt-2 border-t border-indigo-400/25 grid grid-cols-1 sm:grid-cols-3 gap-2 bg-indigo-500/10 p-2 rounded-lg text-xs">
                          <div>
                            <span className="text-[10px] font-bold text-indigo-200 block mb-0.5">Bank:</span>
                            <input
                              id={`mr-row-bank-${idx}`}
                              type="text"
                              value={row.bankName !== undefined ? row.bankName : mrBankName}
                              onChange={(e) => handleUpdateMrPartyRow(row.id, 'bankName', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  document.getElementById(`mr-row-cheque-${idx}`)?.focus();
                                }
                              }}
                              placeholder={mrBankName || 'Bank Name...'}
                              className="w-full p-1.5 border border-cyan-500/30 rounded text-xs text-white placeholder-slate-400 bg-[#061520]"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-indigo-200 block mb-0.5">Cheque No:</span>
                            <input
                              id={`mr-row-cheque-${idx}`}
                              type="text"
                              value={row.chequeNo !== undefined ? row.chequeNo : mrChequeNo}
                              onChange={(e) => handleUpdateMrPartyRow(row.id, 'chequeNo', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  document.getElementById(`mr-row-passdate-${idx}`)?.focus();
                                }
                              }}
                              placeholder={mrChequeNo || 'Cheque No...'}
                              className="w-full p-1.5 border border-cyan-500/30 rounded text-xs font-mono text-white placeholder-slate-400 bg-[#061520]"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-indigo-200 block mb-0.5">Pass Date (dd.mm.yy):</span>
                            <div className="relative flex items-center">
                              <input
                                id={`mr-row-passdate-${idx}`}
                                type="text"
                                value={row.passDate !== undefined ? row.passDate : mrPassDate}
                                onChange={(e) => handleUpdateMrPartyRow(row.id, 'passDate', e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (row.passDate?.trim()) {
                                      handleUpdateMrPartyRow(row.id, 'passDate', formatDateDDMMYY(row.passDate) || row.passDate);
                                    }
                                    if (idx + 1 < mrPartyRows.length) {
                                      document.getElementById(`mr-party-input-${idx + 1}`)?.focus();
                                    } else {
                                      mrChequeBtnRef.current?.focus();
                                    }
                                  }
                                }}
                                onBlur={() => {
                                  if (row.passDate?.trim()) {
                                    handleUpdateMrPartyRow(row.id, 'passDate', formatDateDDMMYY(row.passDate) || row.passDate);
                                  }
                                }}
                                placeholder="dd.mm.yy"
                                className="w-full p-1.5 pr-7 border border-cyan-500/30 rounded text-xs font-mono text-white placeholder-slate-400 bg-[#061520]"
                              />
                              <div className="absolute right-1.5 top-0 bottom-0 flex items-center justify-center">
                                <input
                                  type="date"
                                  tabIndex={-1}
                                  value={parseDateToISO(row.passDate !== undefined ? row.passDate : mrPassDate)}
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      handleUpdateMrPartyRow(row.id, 'passDate', formatDateDDMMYY(e.target.value));
                                    }
                                  }}
                                  className="opacity-0 absolute inset-0 w-5 h-full cursor-pointer z-10"
                                  title="Pick Pass Date from Calendar"
                                />
                                <Calendar className="w-3.5 h-3.5 text-cyan-300/80 pointer-events-none" />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Row 3: In word ....................................................... */}
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 px-1">
                  <span className="text-xs sm:text-sm font-bold text-slate-100 whitespace-nowrap shrink-0">
                    In word
                  </span>
                  <div className="flex-1 border-b border-dotted border-cyan-400/60 pb-1 text-xs sm:text-sm font-bold text-cyan-200 italic">
                    {totalMrInWords}
                  </div>
                </div>

                {/* Row 5: ACCT. ...........   PAID ...........   DUE ........... */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center px-1 pt-1">
                  {/* ACCT. (Cash / Cheque Payment Switcher) */}
                  <div className="lg:col-span-6 flex flex-wrap items-center gap-2">
                    <span className="text-xs sm:text-sm font-bold text-slate-100 shrink-0">ACCT.</span>
                    <div className="inline-flex rounded-lg p-0.5 bg-[#091d2b] border border-cyan-500/30">
                      <button
                        ref={mrCashBtnRef}
                        id="mr-cash-btn"
                        type="button"
                        onClick={() => setMrPaymentType('cash')}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowRight') {
                            e.preventDefault();
                            setMrPaymentType('cheque');
                            setTimeout(() => mrChequeBtnRef.current?.focus(), 20);
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            setMrPaymentType('cash');
                            document.getElementById('mr-save-submit-btn')?.focus();
                          }
                        }}
                        className={`py-1.5 px-3 rounded-md text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
                          mrPaymentType === 'cash'
                            ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/60 shadow-xs'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        <Wallet className="w-3.5 h-3.5" />
                        <span>Cash Payment</span>
                      </button>

                      <button
                        ref={mrChequeBtnRef}
                        id="mr-cheque-btn"
                        type="button"
                        onClick={() => setMrPaymentType('cheque')}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowLeft') {
                            e.preventDefault();
                            setMrPaymentType('cash');
                            setTimeout(() => mrCashBtnRef.current?.focus(), 20);
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            setMrPaymentType('cheque');
                            document.getElementById('mr-save-submit-btn')?.focus();
                          }
                        }}
                        className={`py-1.5 px-3 rounded-md text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
                          mrPaymentType === 'cheque'
                            ? 'bg-indigo-500/25 text-indigo-200 border border-indigo-400/60 shadow-xs'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Cheque Payment</span>
                      </button>
                    </div>
                  </div>

                  {/* PAID */}
                  <div className="lg:col-span-3 flex items-baseline gap-2">
                    <span className="text-xs sm:text-sm font-bold text-slate-100 shrink-0">PAID</span>
                    <div className="flex-1 border-b border-dotted border-cyan-400/60 pb-0.5 text-sm font-mono font-black text-emerald-300 text-right pr-1">
                      ৳{totalPaidWithCurrent.toLocaleString('en-IN')}
                    </div>
                  </div>

                  {/* DUE */}
                  <div className="lg:col-span-3 flex items-baseline gap-2">
                    <span className="text-xs sm:text-sm font-bold text-slate-100 shrink-0">DUE</span>
                    <div className="flex-1 border-b border-dotted border-cyan-400/60 pb-0.5 text-sm font-mono font-black text-amber-300 text-right pr-1">
                      {partyBillsSum > 0 ? `৳${calculatedDueTotal.toLocaleString('en-IN')}` : '—'}
                    </div>
                  </div>
                </div>

                {/* Cheque Bank & Details Panel when Cheque Payment is active */}
                {mrPaymentType === 'cheque' && (
                  <div className="p-3 bg-indigo-500/10 border border-indigo-400/30 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between border-b border-indigo-400/25 pb-1.5">
                      <span className="text-xs font-extrabold text-indigo-200 flex items-center space-x-1.5">
                        <Landmark className="w-4 h-4 text-indigo-300" />
                        <span>Cheque &amp; Bank Details (Posted to Cheque In Hand)</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowBankManagerModal(true)}
                        className="text-[11px] font-bold text-indigo-200 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/35 px-2 py-0.5 rounded flex items-center space-x-1 cursor-pointer transition-colors"
                        title="Open Global Bank & Account Directory"
                      >
                        <Settings className="w-3 h-3 text-indigo-300" />
                        <span>Manage Banks</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <SearchableCombobox
                        label="Select Cheque Bank Name:"
                        options={bankList}
                        value={mrBankName}
                        onChange={(val) => setMrBankName(val)}
                        getShortCode={getBankShortCode}
                        placeholder="🔍 Type bank (e.g. DBBL, Pubali)..."
                        required={mrPaymentType === 'cheque'}
                        accentColor="indigo"
                        entityLabel="Bank"
                        inputRef={mrBankInputRef}
                        onAdvance={() => mrChequeNoInputRef.current?.focus()}
                        onAddNew={(newBank) => {
                          handleAddBank(newBank);
                          setMrBankName(newBank);
                          showNotify('success', `Added "${newBank}" to Bank Directory!`);
                        }}
                        onDeleteItem={(delBank) => {
                          handleDeleteBank(delBank);
                          if (mrBankName === delBank) setMrBankName('');
                          showNotify('success', `Removed "${delBank}" from Bank Directory.`);
                        }}
                        onEditItem={(oldBank, newBank) => {
                          handleEditBank(oldBank, newBank);
                          if (mrBankName === oldBank) setMrBankName(newBank);
                          showNotify('success', `Renamed "${oldBank}" to "${newBank}".`);
                        }}
                        onOpenManager={() => setShowBankManagerModal(true)}
                      />

                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">
                          Default Cheque No:
                        </label>
                        <input
                          ref={mrChequeNoInputRef}
                          type="text"
                          value={mrChequeNo}
                          onChange={(e) => setMrChequeNo(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              mrPassDateInputRef.current?.focus();
                            }
                          }}
                          placeholder="e.g. CQ-908234"
                          className="w-full p-2 border border-cyan-500/30 rounded text-xs font-mono font-bold text-white placeholder-slate-400 bg-[#061520]"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">
                          Pass Date / Cheque Date (dd.mm.yy):
                        </label>
                        <div className="relative flex items-center">
                          <input
                            ref={mrPassDateInputRef}
                            type="text"
                            value={mrPassDate}
                            onChange={(e) => setMrPassDate(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                if (mrPassDate.trim()) {
                                  setMrPassDate(formatDateDDMMYY(mrPassDate) || mrPassDate);
                                }
                                document.getElementById('mr-save-submit-btn')?.focus();
                              }
                            }}
                            onBlur={() => {
                              if (mrPassDate.trim()) {
                                setMrPassDate(formatDateDDMMYY(mrPassDate) || mrPassDate);
                              }
                            }}
                            placeholder="dd.mm.yy"
                            className="w-full p-2 pr-9 border border-cyan-500/30 rounded text-xs font-mono font-medium text-white placeholder-slate-400 bg-[#061520] focus:ring-1 focus:ring-cyan-400 focus:outline-none"
                          />
                          <div className="absolute right-2 flex items-center">
                            <input
                              type="date"
                              value={parseDateToISO(mrPassDate)}
                              onChange={(e) => {
                                if (e.target.value) {
                                  setMrPassDate(formatDateDDMMYY(e.target.value));
                                }
                              }}
                              className="opacity-0 absolute inset-0 w-7 h-7 cursor-pointer z-10"
                              title="Pick Pass / Cheque Date"
                            />
                            <button
                              type="button"
                              tabIndex={-1}
                              className="p-1 text-cyan-300/80 rounded pointer-events-none"
                            >
                              <Calendar className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Row: Amount = [ box ]  |  Received by  |  Authorized Signature + Save */}
              <div className="grid grid-cols-1 md:grid-cols-[auto_1fr_1fr_auto] items-end gap-4 pt-4 border-t border-dashed border-cyan-500/30">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-white">Amount =</span>
                  <div className="min-w-[140px] px-3.5 py-2 border border-cyan-400/50 bg-[#091d2b] rounded-lg text-base font-mono font-black text-emerald-300 text-right shadow-inner">
                    ৳{totalMrCollection.toLocaleString('en-IN')}
                  </div>
                </div>

                <div className="text-center px-3">
                  <div className="text-xs font-semibold text-cyan-200 mb-0.5 truncate">
                    {currentUser?.name || mrEntity}
                  </div>
                  <div className="border-t border-dotted border-cyan-400/60 pt-1 text-[11px] font-bold text-slate-300">
                    Received by
                  </div>
                </div>

                <div className="text-center px-3">
                  <div className="text-xs font-semibold text-transparent select-none mb-0.5">.</div>
                  <div className="border-t border-dotted border-cyan-400/60 pt-1 text-[11px] font-bold text-slate-300">
                    Authorized Signature
                  </div>
                </div>

                <button
                  id="mr-save-submit-btn"
                  type="submit"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveCollection();
                    }
                  }}
                  className="px-5 py-2.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-black rounded-xl shadow-[0_0_20px_rgba(34,211,238,0.3)] cursor-pointer flex items-center justify-center space-x-1.5 transition-all active:scale-95 shrink-0"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {(() => {
                      const activeCount = mrPartyRows.filter((r) => r.partyName.trim() && parseFloat(r.amount) > 0).length || mrPartyRows.length;
                      return activeCount > 1 ? `Save Collection (${activeCount})` : 'Save Collection';
                    })()}
                  </span>
                </button>
              </div>
            </div>

            {/* Bottom Two-Tone Diagonal Split Bar (Amber Left + Angled Gap + Deep Cyan Right) */}
            <div className="relative h-6 w-full bg-[#061520] overflow-hidden select-none">
              <div
                className="absolute inset-y-0 left-0 w-[66%] bg-gradient-to-r from-orange-500 via-amber-400 to-amber-500"
                style={{ clipPath: 'polygon(0 0, 100% 0, 94% 100%, 0% 100%)' }}
              />
              <div
                className="absolute inset-y-0 right-0 w-[38%] bg-gradient-to-r from-cyan-400 via-[#0e5778] to-[#0a3c59]"
                style={{ clipPath: 'polygon(12% 0, 100% 0, 100% 100%, 0% 100%)' }}
              />
            </div>
          </form>
        </div>
        );
      })()}

      {/* 2. COLLECTION LIST TAB */}
      {activeTab === 'collection_list' && (
        <div className="w-full space-y-2.5">
          <div className="cyber-glass-card text-white p-3 rounded-2xl flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center space-x-2.5 shrink-0">
              <div className="bg-cyan-500/20 border border-cyan-400/35 p-2 rounded-xl text-cyan-300">
                <ListOrdered className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <h2 className="text-sm sm:text-base font-black tracking-wide text-white whitespace-nowrap">Collection List & Money Receipts</h2>
            </div>

          </div>

          {importedPartiesNeedCorrection.length > 0 && (
            <div className="bg-amber-500/15 border border-amber-400/45 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 backdrop-blur-md animate-in fade-in">
              <div className="flex items-start space-x-2.5">
                <AlertCircle className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-black text-amber-200">
                    ⚠️ {importedPartiesNeedCorrection.length} New Party/Parties Created with BLANK Marketing Officer
                  </div>
                  <div className="text-[11px] text-amber-100/80 font-medium mt-0.5">
                    Parties from Excel: <span className="font-bold font-mono text-amber-200">{importedPartiesNeedCorrection.join(', ')}</span>. Please assign the Marketing Officer in Customer Directory.
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('directory');
                  }}
                  className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  Open Customer Directory
                </button>
                <button
                  type="button"
                  onClick={() => setImportedPartiesNeedCorrection([])}
                  className="p-1.5 text-amber-300 hover:text-white rounded-lg hover:bg-amber-500/20 transition-colors cursor-pointer"
                  title="Dismiss notification"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* FILTER BAR - Cyber Teal Frosted Glass */}
          <div className="bg-[#0b2334]/85 backdrop-blur-xl text-white rounded-2xl shadow-lg border border-cyan-500/25 p-2.5 sm:p-3 space-y-2">
            {/* Row 1: Filters & Search */}
            <div className="flex items-center space-x-1.5 flex-wrap gap-y-1.5">
              {/* Filter Person / Account Search Box */}
              <SalesCenterSearchFilter
                value={filterEntity}
                onChange={(val) => {
                  handleAccountFilterChange(val);
                  if (val !== 'All' && val !== 'All Sales Centers') {
                    setDepEntity(val);
                  }
                }}
                options={accountFilterSearchOptions}
                isLocked={!canViewAllUserCenters}
                includeAllOption={canViewAllUserCenters}
                allOptionLabel="All Sales Centers"
                allOptionValue="All Sales Centers"
                label="Account:"
                placeholder="Search account / showroom..."
                theme="dark"
                size="xs"
                widthClass="min-w-[150px] max-w-[210px]"
              />

              {/* Salesman Filter Dropdown */}
              <SalesmanFilterControl color="emerald" />

              {/* By Party Searchable Box */}
              <PartyFilterControl dark={true} />

              {/* Search Box with Clear Button */}
              <div className="relative flex-1 min-w-[145px] max-w-[210px]">
                <Search className="w-3.5 h-3.5 text-cyan-300/80 absolute left-2 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search party, MR#, amount..."
                  className="w-full pl-7 pr-6 py-0.5 text-xs bg-[#061520] text-white placeholder-slate-400 border border-cyan-500/30 rounded-lg font-medium focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-all truncate"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs p-0.5 cursor-pointer font-bold"
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Reset Filters Button */}
              {(Boolean(search) || (filterEntity !== 'All Sales Centers' && filterEntity !== 'All') || filterParty !== 'All' || filterSalesman !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setFilterEntity('All Sales Centers');
                    setFilterSalesman('all');
                    setFilterParty('All');
                    setPartySearchInput('');
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold text-rose-200 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/35 rounded-lg transition-colors cursor-pointer shrink-0"
                  title="Reset search and filters to default"
                >
                  <RotateCcw className="w-3 h-3 text-rose-300" />
                  <span>Reset</span>
                </button>
              )}

              {/* Filtered Total Badge */}
              <div className="ml-auto flex items-center space-x-1.5 bg-[#061520] px-2.5 py-0.5 rounded-lg border border-cyan-500/30 text-xs shrink-0">
                <span className="text-slate-400 font-bold">Filtered Total:</span>
                <span className="text-amber-300 font-extrabold text-sm font-mono">
                  ৳{filteredCollections.reduce((a, b) => a + b.amount, 0).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Row 2: Period Selection, Quick Presets & Inline Custom Range */}
            <div className="pt-1.5 border-t border-cyan-500/20 flex items-center space-x-2 flex-wrap gap-y-1.5">
              <div className="flex items-center space-x-1.5 bg-[#071824]/90 p-1 px-2 rounded-lg border border-cyan-500/25">
                <label className="text-slate-300 font-bold flex items-center space-x-1 shrink-0">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs">Period:</span>
                </label>

                {/* Quick Period Buttons */}
                <div className="flex items-center space-x-1 flex-wrap gap-y-1">
                  {(['this_month', 'last_month', 'this_year', 'last_year', 'all', 'custom'] as const).map((presetKey) => {
                    const labels: Record<string, string> = {
                      this_month: 'This Month',
                      last_month: 'Last Month',
                      this_year: 'This Year',
                      last_year: 'Last Year',
                      all: 'All',
                      custom: 'Custom Range'
                    };
                    return (
                      <button
                        key={presetKey}
                        type="button"
                        onClick={() => handleSelectPeriodPreset(presetKey)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer border whitespace-nowrap ${
                          periodPreset === presetKey
                            ? 'bg-emerald-500/90 text-white border-emerald-300/90 shadow-[0_0_16px_rgba(16,185,129,0.50)] font-black'
                            : 'bg-[#081c28]/55 hover:bg-white/[0.10] text-slate-200 border-white/[0.12] font-bold'
                        }`}
                      >
                        {labels[presetKey]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Date Range in the SAME line */}
              <div className="flex items-center space-x-1.5 bg-[#061520] text-white p-1 px-2.5 rounded-lg border border-cyan-500/30 text-[11px]">
                <span className="text-slate-400 font-bold whitespace-nowrap">Date Range:</span>
                <div className="flex items-center space-x-1">
                  <span className="font-semibold text-slate-300">From:</span>
                  <input
                    id="col-list-from-date"
                    type="text"
                    value={startDate}
                    onClick={() => {
                      setStartDate('');
                      setPeriodPreset('custom');
                    }}
                    onFocus={() => {
                      setStartDate('');
                      setPeriodPreset('custom');
                    }}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setPeriodPreset('custom');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (startDate.trim()) setStartDate(formatDateDDMMYY(startDate));
                        const toEl = document.getElementById('col-list-to-date') as HTMLInputElement | null;
                        toEl?.focus();
                        toEl?.select();
                      }
                    }}
                    onBlur={() => {
                      if (startDate.trim()) setStartDate(formatDateDDMMYY(startDate));
                    }}
                    placeholder="dd.mm.yy"
                    className="bg-[#081b28] text-cyan-300 font-mono font-bold py-0.5 px-1.5 border border-cyan-500/30 rounded w-[68px] text-center text-xs focus:ring-1 focus:ring-cyan-400 focus:outline-none"
                  />
                  <div className="relative flex items-center">
                    <input
                      type="date"
                      value={parseDateToISO(startDate)}
                      onChange={(e) => {
                        if (e.target.value) {
                          setStartDate(formatDateDDMMYY(e.target.value));
                          setPeriodPreset('custom');
                        }
                      }}
                      className="opacity-0 absolute inset-0 w-6 h-6 cursor-pointer z-10"
                      title="Pick From Date from calendar"
                    />
                    <Calendar className="w-3.5 h-3.5 text-cyan-300/80 hover:text-white cursor-pointer" />
                  </div>
                </div>
                <span className="text-slate-500 font-bold">-</span>
                <div className="flex items-center space-x-1">
                  <span className="font-semibold text-slate-300">To:</span>
                  <input
                    id="col-list-to-date"
                    type="text"
                    value={endDate}
                    onClick={() => {
                      setEndDate('');
                      setPeriodPreset('custom');
                    }}
                    onFocus={() => {
                      setEndDate('');
                      setPeriodPreset('custom');
                    }}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setPeriodPreset('custom');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (endDate.trim()) setEndDate(formatDateDDMMYY(endDate));
                      }
                    }}
                    onBlur={() => {
                      if (endDate.trim()) setEndDate(formatDateDDMMYY(endDate));
                    }}
                    placeholder="dd.mm.yy"
                    className="bg-[#081b28] text-cyan-300 font-mono font-bold py-0.5 px-1.5 border border-cyan-500/30 rounded w-[68px] text-center text-xs focus:ring-1 focus:ring-cyan-400 focus:outline-none"
                  />
                  <div className="relative flex items-center">
                    <input
                      type="date"
                      value={parseDateToISO(endDate)}
                      onChange={(e) => {
                        if (e.target.value) {
                          setEndDate(formatDateDDMMYY(e.target.value));
                          setPeriodPreset('custom');
                        }
                      }}
                      className="opacity-0 absolute inset-0 w-6 h-6 cursor-pointer z-10"
                      title="Pick To Date from calendar"
                    />
                    <Calendar className="w-3.5 h-3.5 text-cyan-300/80 hover:text-white cursor-pointer" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Collection MR Table */}
          <div className="cyber-glass-card rounded-2xl overflow-hidden w-full relative">

            {/* Bulk Action Toolbar for Multi-Selected Collection Entries */}
            {selectedCashIds.length > 0 && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#091e2c]/95 text-white backdrop-blur-xl px-4 py-2.5 rounded-2xl shadow-2xl border border-rose-400/50 flex items-center space-x-4 animate-in fade-in slide-in-from-bottom-2 duration-150">
                <div className="flex items-center space-x-3">
                  <span className="bg-rose-500/20 text-rose-200 border border-rose-400/40 font-black text-xs px-2.5 py-1 rounded-full font-mono shadow-xs">
                    {selectedCashIds.length} Selected
                  </span>
                  <span className="text-xs font-bold text-rose-200">
                    Total: <span className="text-white font-mono font-black text-sm">৳{collections.filter((c) => selectedCashIds.includes(c.id)).reduce((sum, c) => sum + (c.amount || 0), 0).toLocaleString('en-IN')}</span>
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setSelectedCashIds([])}
                    className="px-3 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
                  >
                    Deselect All
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkDeleteCash}
                    className="px-4 py-1.5 bg-rose-500 hover:bg-rose-400 text-white font-black text-xs rounded-lg shadow-md cursor-pointer transition-all flex items-center space-x-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Selected ({selectedCashIds.length})</span>
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-200">
                <thead>
                  <tr className="bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 font-bold uppercase text-[10px]">
                    <th className="py-2 px-2.5 w-10 text-center">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded text-rose-500 focus:ring-rose-500 cursor-pointer accent-rose-500"
                        title="Select/Deselect All Filtered Collections"
                        checked={
                          filteredCollections.length > 0 &&
                          filteredCollections.every((col) => selectedCashIds.includes(col.id))
                        }
                        onChange={() => toggleSelectAllCash(filteredCollections)}
                      />
                    </th>
                    <th
                      onClick={() => handleTableSort('sl', collectionSortField, collectionSortDirection, setCollectionSortField, setCollectionSortDirection)}
                      className="py-2 px-2.5 w-12 text-center cursor-pointer select-none hover:bg-cyan-500/10 transition-colors"
                      title="Sort by Serial Number"
                    >
                      <span className="inline-flex items-center justify-center">
                        SL# {renderSortIndicator('sl', collectionSortField, collectionSortDirection, true)}
                      </span>
                    </th>
                    <th
                      onClick={() => handleTableSort('date', collectionSortField, collectionSortDirection, setCollectionSortField, setCollectionSortDirection)}
                      className="py-2 px-2.5 w-28 cursor-pointer select-none hover:bg-cyan-500/10 transition-colors"
                      title="Sort by Date"
                    >
                      <span className="inline-flex items-center">
                        Date {renderSortIndicator('date', collectionSortField, collectionSortDirection, true)}
                      </span>
                    </th>
                    <th
                      onClick={() => handleTableSort('partyName', collectionSortField, collectionSortDirection, setCollectionSortField, setCollectionSortDirection)}
                      className="py-2 px-2.5 min-w-[160px] cursor-pointer select-none hover:bg-cyan-500/10 transition-colors"
                      title="Sort by Party Name"
                    >
                      <span className="inline-flex items-center">
                        Party Name {renderSortIndicator('partyName', collectionSortField, collectionSortDirection, true)}
                      </span>
                    </th>
                    <th
                      onClick={() => handleTableSort('entityName', collectionSortField, collectionSortDirection, setCollectionSortField, setCollectionSortDirection)}
                      className="py-2 px-2.5 min-w-[150px] cursor-pointer select-none hover:bg-cyan-500/10 transition-colors"
                      title="Sort by Assigned Marketing Person"
                    >
                      <span className="inline-flex items-center">
                        Assigned Marketing Person {renderSortIndicator('entityName', collectionSortField, collectionSortDirection, true)}
                      </span>
                    </th>
                    <th
                      onClick={() => handleTableSort('paymentType', collectionSortField, collectionSortDirection, setCollectionSortField, setCollectionSortDirection)}
                      className="py-2 px-2.5 w-28 text-center cursor-pointer select-none hover:bg-cyan-500/10 transition-colors"
                      title="Sort by Payment Type"
                    >
                      <span className="inline-flex items-center justify-center">
                        Type {renderSortIndicator('paymentType', collectionSortField, collectionSortDirection, true)}
                      </span>
                    </th>
                    <th
                      onClick={() => handleTableSort('amount', collectionSortField, collectionSortDirection, setCollectionSortField, setCollectionSortDirection)}
                      className="py-2 px-2.5 w-28 text-right bg-[#0e2d42] text-cyan-200 cursor-pointer select-none hover:bg-cyan-500/20 transition-colors"
                      title="Sort by Amount"
                    >
                      <span className="inline-flex items-center justify-end">
                        Amount (Tk) {renderSortIndicator('amount', collectionSortField, collectionSortDirection, true)}
                      </span>
                    </th>
                    <th
                      onClick={() => handleTableSort('remarks', collectionSortField, collectionSortDirection, setCollectionSortField, setCollectionSortDirection)}
                      className="py-2 px-2.5 cursor-pointer select-none hover:bg-cyan-500/10 transition-colors"
                      title="Sort by Remarks"
                    >
                      <span className="inline-flex items-center">
                        Remarks {renderSortIndicator('remarks', collectionSortField, collectionSortDirection, true)}
                      </span>
                    </th>
                    <th className="py-2 px-2.5 w-16 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                  {filteredCollections.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-5 px-2.5 text-center text-slate-400 italic">
                        No collection records found.
                      </td>
                    </tr>
                  ) : (
                    filteredCollections.map((col, idx) => {
                      const matchedParty = (parties || []).find(
                        (p) => p.name.trim().toLowerCase() === (col.partyName || '').trim().toLowerCase()
                      );
                      const isDep = isCollectionDeposited(col);
                      const isSelected = selectedCashIds.includes(col.id);
                      return (
                        <tr
                          key={`${col.id || 'cash'}-${idx}`}
                          className={`transition-colors ${
                            isSelected
                              ? 'bg-rose-500/15'
                              : 'hover:bg-cyan-500/[0.06]'
                          }`}
                        >
                          <td className="py-1.5 px-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectCash(col.id)}
                              className="w-4 h-4 rounded text-rose-500 focus:ring-rose-500 accent-rose-500 cursor-pointer"
                              title="Select for bulk delete"
                            />
                          </td>
                          <td className="py-1.5 px-2.5 text-center font-mono font-bold text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="py-1.5 px-2.5 font-mono font-medium text-slate-300">
                            {formatDateDDMMYY(col.date)}
                          </td>
                          <td className="py-1.5 px-2.5 font-extrabold text-white">
                            <div className="flex flex-col">
                              <span>{cleanSelectedPartyName(col.partyName || 'N/A')}</span>
                              {matchedParty?.address && (
                                <span className="text-[10px] text-slate-400 font-normal">📍 {matchedParty.address}</span>
                              )}
                            </div>
                          </td>
                          <td className="py-1.5 px-2.5 font-semibold text-slate-300">
                            {col.marketingPerson || col.salespersonName || matchedParty?.salespersonName || (matchedParty?.salesmanCode ? (effectiveAllSalespersons || []).find((s) => s.code.toLowerCase() === matchedParty.salesmanCode?.toLowerCase())?.name : '') || (!col.entityName?.toLowerCase().includes('center') && !col.entityName?.toLowerCase().includes('store') ? col.entityName : '') || '-'}
                          </td>
                          <td className="py-1.5 px-2.5 text-center">
                            {col.paymentType === 'cheque' ? (
                              <span className="inline-flex items-center space-x-1 bg-indigo-500/20 text-indigo-200 px-2 py-0.5 rounded text-[10px] font-extrabold border border-indigo-400/35">
                                <CreditCard className="w-3 h-3 text-indigo-300" />
                                <span>Cheque</span>
                              </span>
                            ) : isDep || (col.bankName || '').toUpperCase() === 'H/O' || (col.depositBankTag || '').toUpperCase() === 'H/O' ? (
                              (() => {
                                const depInfo = getCollectionBankDepositDetails(col);
                                const bankTag = depInfo?.bankTag || col.depositBankTag || ((col.bankName || '').toUpperCase() === 'H/O' ? 'H/O' : 'Bank');
                                const isHo = bankTag === 'H/O' || (col.bankName || '').toUpperCase() === 'H/O' || (col.depositBankTag || '').toUpperCase() === 'H/O';
                                const depDate = depInfo?.depositDate || col.depositDate;
                                return (
                                  <span
                                    className={`inline-flex flex-col items-center justify-center px-2.5 py-0.5 rounded text-[10px] font-extrabold leading-tight shadow-xs whitespace-nowrap ${
                                      isHo
                                        ? 'bg-amber-500/20 text-amber-200 border border-amber-400/45 font-black'
                                        : 'bg-sky-500/20 text-sky-200 border border-sky-400/35'
                                    }`}
                                    title={isHo ? `Head Office Deposit: H/O${depDate ? ` on ${depDate}` : ''}` : `Bank Deposited: ${bankTag}${depDate ? ` on ${depDate}` : ''}`}
                                  >
                                    <span className="inline-flex items-center space-x-1">
                                      <BankLogoBadge bankName={isHo ? 'H/O' : (depInfo?.bankName || col.bankName || bankTag)} size="sm" />
                                      <span className={`font-black ${isHo ? 'text-amber-200' : 'text-sky-200'}`}>{bankTag}</span>
                                    </span>
                                    {depDate && (
                                      <span className={`text-[9px] font-mono font-bold mt-0.5 ${isHo ? 'text-amber-300/90' : 'text-sky-300/90'}`}>
                                        {depDate}
                                      </span>
                                    )}
                                  </span>
                                );
                              })()
                            ) : (
                              <span className="inline-flex items-center space-x-1 bg-emerald-500/20 text-emerald-200 px-2 py-0.5 rounded text-[10px] font-extrabold border border-emerald-400/35">
                                <Banknote className="w-3 h-3 text-emerald-300" />
                                <span>Cash</span>
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-mono text-sm font-black text-cyan-200 bg-cyan-500/[0.06]">
                            ৳{col.amount.toLocaleString('en-IN')}
                          </td>
                          <td className="py-1.5 px-2.5 italic text-[11px] text-slate-400">
                            {col.remarks && !/Imported from Excel/i.test(col.remarks) ? col.remarks : '-'}
                          </td>
                          <td className="py-1.5 px-2.5 text-center">
                            <div className="flex items-center justify-center space-x-1">
                              {(() => {
                                const depInfo = getCollectionBankDepositDetails(col);
                                const isHo = depInfo?.bankTag === 'H/O' || (col.bankName || '').toUpperCase() === 'H/O' || (col.depositBankTag || '').toUpperCase() === 'H/O';
                                return (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setEditingCollection(col)}
                                      className="p-1 hover:bg-cyan-500/20 text-cyan-300 rounded transition-colors cursor-pointer"
                                      title={isHo ? 'Edit H/O Collection MR (Active)' : 'Edit Collection MR'}
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteCollection(col.id, col.partyName || col.mrNo, col.amount)}
                                      className="p-1 hover:bg-rose-500/20 text-rose-300 rounded transition-colors cursor-pointer"
                                      title="Delete Collection MR"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </>
                                );
                              })()}
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

          <div className="cyber-glass-card rounded-2xl p-3 flex flex-wrap items-center justify-end gap-2 no-print">
            <button
              type="button"
              onClick={() => {
                if (xlsxFileInputRef.current) {
                  xlsxFileInputRef.current.value = '';
                  xlsxFileInputRef.current.click();
                }
              }}
              className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 font-bold text-xs rounded-lg flex items-center space-x-1.5 cursor-pointer transition-all border border-emerald-400/35"
              title="Import collections from Excel (.xlsx) file"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Import Excel</span>
            </button>

            <button
              type="button"
              onClick={handleExportCollectionsXlsx}
              className="px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 font-bold text-xs rounded-lg flex items-center space-x-1.5 cursor-pointer transition-all border border-indigo-400/35"
              title="Export current collection list to Excel (.xlsx) file"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('collection_entry')}
              className="px-3.5 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs rounded-lg shadow-sm flex items-center space-x-1.5 cursor-pointer transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ New Entry</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. CASH IN HAND TO BANK DEPOSIT PAGE (MODERNIZED REDESIGN) */}
      {activeTab === 'cash_in_hand' && (
        <div className="w-full space-y-3">
          {/* Top Command Header & Quick Deposit Toolbar */}
          <div className="cyber-glass-card text-white p-3.5 sm:p-4 rounded-2xl border border-cyan-500/30 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 shadow-lg">
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-br from-emerald-500/30 to-cyan-500/20 border border-emerald-400/40 p-2.5 rounded-xl text-emerald-300 shadow-inner">
                <Banknote className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black tracking-wide text-white leading-tight">
                  Cash In Hand &amp; Bank Deposit
                </h2>
                <p className="text-[11px] text-cyan-200/75 font-medium">
                  Track undeposited party cash, route deposits to configured bank accounts &amp; dispatch slips
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 no-print">
              <button
                type="button"
                onClick={() => openDepositModal('cash', false)}
                className="px-3.5 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs rounded-xl shadow-[0_0_16px_rgba(34,211,238,0.25)] flex items-center space-x-1.5 cursor-pointer transition-all active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Deposit Cash</span>
              </button>

              <button
                type="button"
                onClick={() => openDepositModal('cash', true)}
                className="px-3 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 font-bold text-xs rounded-xl flex items-center space-x-1.5 cursor-pointer transition-all border border-indigo-400/40"
                title="Deposit multiple customer payments at once into a bank account"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Multi-Party Deposit</span>
              </button>

              <button
                type="button"
                onClick={() => setShowBankManagerModal(true)}
                className="px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 font-bold text-xs rounded-xl flex items-center space-x-1.5 cursor-pointer transition-all border border-purple-400/40"
                title="Manage Banks & Account Directory"
              >
                <Landmark className="w-3.5 h-3.5 text-purple-300" />
                <span>Bank Directory</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (xlsxFileInputRef.current) {
                    xlsxFileInputRef.current.value = '';
                    xlsxFileInputRef.current.click();
                  }
                }}
                className="px-2.5 py-2 bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 font-bold text-xs rounded-xl flex items-center space-x-1.5 cursor-pointer transition-all border border-teal-400/35"
                title="Import cash collections from Excel (.xlsx) file"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Import</span>
              </button>

              <button
                type="button"
                onClick={() => handleExportCollectionsXlsx('cash')}
                className="px-2.5 py-2 bg-[#061520]/90 hover:bg-[#0e2a3d] text-slate-200 font-bold text-xs rounded-xl flex items-center space-x-1.5 cursor-pointer transition-all border border-cyan-500/30"
                title="Export Cash List to Excel (.xlsx) file"
              >
                <Download className="w-3.5 h-3.5 text-cyan-300" />
                <span className="hidden sm:inline">Export</span>
              </button>
            </div>
          </div>

          {/* 3-Card Financial Overview Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="cyber-glass-subcard p-3.5 rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/10 to-[#061520]/80 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-emerald-300/90">
                  Undeposited Cash In Hand
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono text-emerald-300 mt-0.5">
                  ৳{undepositedCashCollections.reduce((sum, c) => sum + (c.amount || 0), 0).toLocaleString('en-IN')}
                </div>
                <div className="text-[11px] text-slate-400 font-semibold mt-0.5">
                  {undepositedCashCollections.length} Pending Receipt{undepositedCashCollections.length === 1 ? '' : 's'}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/35 text-emerald-300 shrink-0">
                <Wallet className="w-5 h-5" />
              </div>
            </div>

            <div className="cyber-glass-subcard p-3.5 rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/10 to-[#061520]/80 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-cyan-300/90">
                  Total Bank Deposited
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono text-white mt-0.5">
                  ৳{bankDepositedSum.toLocaleString('en-IN')}
                </div>
                <div className="text-[11px] text-slate-400 font-semibold mt-0.5">
                  {filteredBankDeposits.length} Deposit Transaction{filteredBankDeposits.length === 1 ? '' : 's'}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-cyan-500/20 border border-cyan-400/35 text-cyan-300 shrink-0">
                <Landmark className="w-5 h-5" />
              </div>
            </div>

            <div className="cyber-glass-subcard p-3.5 rounded-2xl border border-purple-400/30 bg-gradient-to-br from-purple-500/10 to-[#061520]/80 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-purple-300/90">
                  Slips &amp; Dispatch Status
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono text-purple-200 mt-0.5">
                  {filteredBankDeposits.filter((d) => d.emailSent).length} / {filteredBankDeposits.length}
                </div>
                <div className="text-[11px] text-slate-400 font-semibold mt-0.5">
                  Mails Sent • {filteredBankDeposits.filter((d) => Boolean(d.slipImage)).length} Slips Attached
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-purple-500/20 border border-purple-400/35 text-purple-300 shrink-0">
                <Mail className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* FILTER BAR */}
          <div className="bg-[#0b2334]/85 backdrop-blur-xl text-white rounded-2xl shadow-lg border border-cyan-500/25 p-2.5 sm:p-3 space-y-2">
            {/* Row 1: Filters & Search */}
            <div className="flex items-center space-x-1.5 flex-wrap gap-y-1.5">
              {/* Filter Account Search Box */}
              <SalesCenterSearchFilter
                value={filterEntity}
                onChange={(val) => handleAccountFilterChange(val)}
                options={accountFilterSearchOptions}
                isLocked={!canViewAllUserCenters}
                includeAllOption={canViewAllUserCenters}
                allOptionLabel="All Sales Centers"
                allOptionValue="All Sales Centers"
                label="Account:"
                placeholder="Search account / showroom..."
                theme="dark"
                size="xs"
                widthClass="min-w-[150px] max-w-[210px]"
              />

              {/* Salesman Filter Dropdown */}
              <SalesmanFilterControl color="emerald" />

              {/* By Party Searchable Box */}
              <PartyFilterControl dark={true} />

              {/* Search Box with Clear Button */}
              <div className="relative flex-1 min-w-[145px] max-w-[210px]">
                <Search className="w-3.5 h-3.5 text-cyan-300/80 absolute left-2 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search cash, MR#, amount, bank..."
                  className="w-full pl-7 pr-6 py-0.5 text-xs bg-[#061520] text-white placeholder-slate-400 border border-cyan-500/30 rounded-lg font-medium focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-all truncate"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs p-0.5 cursor-pointer font-bold"
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Reset Filters Button */}
              {(Boolean(search) || (filterEntity !== 'All Sales Centers' && filterEntity !== 'All') || filterParty !== 'All' || filterSalesman !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setFilterEntity('All Sales Centers');
                    setFilterSalesman('all');
                    setFilterParty('All');
                    setPartySearchInput('');
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold text-rose-300 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-700/70 rounded-lg transition-colors cursor-pointer shadow-2xs shrink-0"
                  title="Reset search and filters to default"
                >
                  <RotateCcw className="w-3 h-3 text-rose-400" />
                  <span>Reset</span>
                </button>
              )}

              {/* Undeposited Cash In Hand Total Badge */}
              <div className="ml-auto flex items-center space-x-1.5 bg-[#061520] px-2.5 py-0.5 rounded-lg border border-cyan-500/30 text-xs shrink-0">
                <span className="text-slate-400 font-bold">Total Undeposited:</span>
                <span className="text-emerald-300 font-extrabold text-sm font-mono">
                  ৳{undepositedCashCollections.reduce((sum, c) => sum + (c.amount || 0), 0).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Row 2: Period Selection, Quick Presets & Inline Custom Range */}
            <div className="pt-1.5 border-t border-cyan-500/20 flex items-center space-x-2 flex-wrap gap-y-1.5">
              <div className="flex items-center space-x-1.5 bg-[#071824]/90 p-1 px-2 rounded-lg border border-cyan-500/25">
                <label className="text-slate-300 font-bold flex items-center space-x-1 shrink-0">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs">Period:</span>
                </label>

                {/* Quick Period Buttons */}
                <div className="flex items-center space-x-1 flex-wrap gap-y-1">
                  {(['this_month', 'last_month', 'this_year', 'last_year', 'all', 'custom'] as const).map((presetKey) => {
                    const labels: Record<string, string> = {
                      this_month: 'This Month',
                      last_month: 'Last Month',
                      this_year: 'This Year',
                      last_year: 'Last Year',
                      all: 'All',
                      custom: 'Custom Range'
                    };
                    return (
                      <button
                        key={presetKey}
                        type="button"
                        onClick={() => handleSelectPeriodPreset(presetKey)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer border whitespace-nowrap ${
                          periodPreset === presetKey
                            ? 'bg-emerald-500/90 text-white border-emerald-300/90 shadow-[0_0_16px_rgba(16,185,129,0.50)] font-black'
                            : 'bg-[#081c28]/55 hover:bg-white/[0.10] text-slate-200 border-white/[0.12] font-bold'
                        }`}
                      >
                        {labels[presetKey]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Date Range in the SAME line */}
              <div className="flex items-center space-x-1.5 bg-[#061520] text-white p-1 px-2.5 rounded-lg border border-cyan-500/30 text-[11px]">
                <span className="text-slate-400 font-bold whitespace-nowrap">Date Range:</span>
                <div className="flex items-center space-x-1">
                  <span className="font-semibold text-slate-300">From:</span>
                  <input
                    id="cash-in-hand-from-date"
                    type="text"
                    value={startDate}
                    onClick={() => {
                      setStartDate('');
                      setPeriodPreset('custom');
                    }}
                    onFocus={() => {
                      setStartDate('');
                      setPeriodPreset('custom');
                    }}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setPeriodPreset('custom');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (startDate.trim()) setStartDate(formatDateDDMMYY(startDate));
                        const toEl = document.getElementById('cash-in-hand-to-date') as HTMLInputElement | null;
                        toEl?.focus();
                        toEl?.select();
                      }
                    }}
                    onBlur={() => {
                      if (startDate.trim()) setStartDate(formatDateDDMMYY(startDate));
                    }}
                    placeholder="dd.mm.yy"
                    className="bg-[#081b28] text-cyan-300 font-mono font-bold py-0.5 px-1.5 border border-cyan-500/30 rounded w-[68px] text-center text-xs focus:ring-1 focus:ring-cyan-400 focus:outline-none"
                  />
                  <div className="relative flex items-center">
                    <input
                      type="date"
                      value={parseDateToISO(startDate)}
                      onChange={(e) => {
                        if (e.target.value) {
                          setStartDate(formatDateDDMMYY(e.target.value));
                          setPeriodPreset('custom');
                        }
                      }}
                      className="opacity-0 absolute inset-0 w-6 h-6 cursor-pointer z-10"
                      title="Pick From Date from calendar"
                    />
                    <Calendar className="w-3.5 h-3.5 text-cyan-300/80 hover:text-white cursor-pointer" />
                  </div>
                </div>
                <span className="text-slate-500 font-bold">-</span>
                <div className="flex items-center space-x-1">
                  <span className="font-semibold text-slate-300">To:</span>
                  <input
                    id="cash-in-hand-to-date"
                    type="text"
                    value={endDate}
                    onClick={() => {
                      setEndDate('');
                      setPeriodPreset('custom');
                    }}
                    onFocus={() => {
                      setEndDate('');
                      setPeriodPreset('custom');
                    }}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setPeriodPreset('custom');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (endDate.trim()) setEndDate(formatDateDDMMYY(endDate));
                      }
                    }}
                    onBlur={() => {
                      if (endDate.trim()) setEndDate(formatDateDDMMYY(endDate));
                    }}
                    placeholder="dd.mm.yy"
                    className="bg-[#081b28] text-cyan-300 font-mono font-bold py-0.5 px-1.5 border border-cyan-500/30 rounded w-[68px] text-center text-xs focus:ring-1 focus:ring-cyan-400 focus:outline-none"
                  />
                  <div className="relative flex items-center">
                    <input
                      type="date"
                      value={parseDateToISO(endDate)}
                      onChange={(e) => {
                        if (e.target.value) {
                          setEndDate(formatDateDDMMYY(e.target.value));
                          setPeriodPreset('custom');
                        }
                      }}
                      className="opacity-0 absolute inset-0 w-6 h-6 cursor-pointer z-10"
                      title="Pick To Date from calendar"
                    />
                    <Calendar className="w-3.5 h-3.5 text-cyan-300/80 hover:text-white cursor-pointer" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CUSTOMERS WHO PAID CASH TABLE */}
          <div className="cyber-glass-card rounded-2xl overflow-hidden w-full relative">
            <div className="p-3 cyber-glass-header flex flex-wrap items-center justify-between gap-2.5">
              <div>
                <h3 className="text-sm font-extrabold text-emerald-300 flex items-center space-x-2">
                  <UserCheck className="w-4 h-4 text-emerald-300 shrink-0" />
                  <span>Cash In Hand List (Pending Bank Deposit)</span>
                </h3>
              </div>

              <div className="flex items-center bg-[#061520] p-1 rounded-lg border border-cyan-500/30">
                <button
                  type="button"
                  onClick={() => setCashDepositFilter('pending')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors whitespace-nowrap ${
                    cashDepositFilter === 'pending'
                      ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/45 shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Cash In Hand ({undepositedCashCollections.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCashDepositFilter('deposited')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors whitespace-nowrap ${
                    cashDepositFilter === 'deposited'
                      ? 'bg-indigo-500/25 text-indigo-200 border border-indigo-400/45 shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Deposited History ({cashCollectionsList.length - undepositedCashCollections.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCashDepositFilter('all')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors whitespace-nowrap ${
                    cashDepositFilter === 'all'
                      ? 'bg-[#0e2d42] text-cyan-200 border border-cyan-400/45 shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All ({cashCollectionsList.length})
                </button>
              </div>
            </div>

            {/* Floating Bulk Action Toolbar for Multi-Selected Cash Entries */}
            {selectedCashIds.length > 0 && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#091e2c]/95 text-white backdrop-blur-xl px-4 py-2.5 rounded-2xl shadow-2xl border border-rose-400/50 flex items-center space-x-4 animate-in fade-in slide-in-from-bottom-2 duration-150">
                <div className="flex items-center space-x-3">
                  <span className="bg-rose-500/20 text-rose-200 border border-rose-400/40 font-black text-xs px-2.5 py-1 rounded-full font-mono shadow-xs">
                    {selectedCashIds.length} Selected
                  </span>
                  <span className="text-xs font-bold text-rose-200">
                    Total Selected Amount: <span className="text-white font-mono font-black text-sm">৳{collections.filter((c) => selectedCashIds.includes(c.id)).reduce((sum, c) => sum + (c.amount || 0), 0).toLocaleString('en-IN')}</span>
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setSelectedCashIds([])}
                    className="px-3 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 hover:text-white font-bold text-xs rounded-lg cursor-pointer transition-colors border border-cyan-500/30"
                  >
                    Deselect All
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkDeleteCash}
                    className="px-4 py-1.5 bg-rose-500 hover:bg-rose-400 text-white font-black text-xs rounded-lg shadow-md cursor-pointer transition-all flex items-center space-x-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Selected ({selectedCashIds.length})</span>
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-200">
                <thead>
                  <tr className="bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 font-bold uppercase text-[10px]">
                    <th className="py-2 px-2.5 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={
                          filteredCashCollections.length > 0 &&
                          filteredCashCollections.every((col) => selectedCashIds.includes(col.id))
                        }
                        onChange={() => toggleSelectAllCash(filteredCashCollections)}
                        className="w-4 h-4 rounded text-rose-500 focus:ring-rose-500 cursor-pointer accent-rose-500"
                        title="Select All / Deselect All Cash Entries"
                      />
                    </th>
                    <th
                      onClick={() => handleTableSort('sl', cashSortField, cashSortDirection, setCashSortField, setCashSortDirection)}
                      className="py-2 px-2.5 w-12 text-center cursor-pointer select-none hover:bg-cyan-500/10 transition-colors"
                      title="Sort by Serial Number"
                    >
                      <span className="inline-flex items-center justify-center">
                        SL# {renderSortIndicator('sl', cashSortField, cashSortDirection, true)}
                      </span>
                    </th>
                    <th
                      onClick={() => handleTableSort('date', cashSortField, cashSortDirection, setCashSortField, setCashSortDirection)}
                      className="py-2 px-2.5 w-28 cursor-pointer select-none hover:bg-cyan-500/10 transition-colors"
                      title="Sort by Date"
                    >
                      <span className="inline-flex items-center">
                        Date {renderSortIndicator('date', cashSortField, cashSortDirection, true)}
                      </span>
                    </th>
                    <th
                      onClick={() => handleTableSort('partyName', cashSortField, cashSortDirection, setCashSortField, setCashSortDirection)}
                      className="py-2 px-2.5 min-w-[160px] cursor-pointer select-none hover:bg-cyan-500/10 transition-colors"
                      title="Sort by Party Name"
                    >
                      <span className="inline-flex items-center">
                        Party Name {renderSortIndicator('partyName', cashSortField, cashSortDirection, true)}
                      </span>
                    </th>
                    <th
                      onClick={() => handleTableSort('entityName', cashSortField, cashSortDirection, setCashSortField, setCashSortDirection)}
                      className="py-2 px-2.5 min-w-[150px] cursor-pointer select-none hover:bg-cyan-500/10 transition-colors"
                      title="Sort by Assigned Marketing Person"
                    >
                      <span className="inline-flex items-center">
                        Assigned Marketing Person {renderSortIndicator('entityName', cashSortField, cashSortDirection, true)}
                      </span>
                    </th>
                    <th
                      onClick={() => handleTableSort('status', cashSortField, cashSortDirection, setCashSortField, setCashSortDirection)}
                      className="py-2 px-2.5 w-28 text-center cursor-pointer select-none hover:bg-cyan-500/10 transition-colors"
                      title="Sort by Type"
                    >
                      <span className="inline-flex items-center justify-center">
                        Type {renderSortIndicator('status', cashSortField, cashSortDirection, true)}
                      </span>
                    </th>
                    <th
                      onClick={() => handleTableSort('amount', cashSortField, cashSortDirection, setCashSortField, setCashSortDirection)}
                      className="py-2 px-2.5 w-28 text-right bg-[#0e2d42] text-cyan-200 cursor-pointer select-none hover:bg-cyan-500/20 transition-colors"
                      title="Sort by Amount"
                    >
                      <span className="inline-flex items-center justify-end">
                        Amount (Tk) {renderSortIndicator('amount', cashSortField, cashSortDirection, true)}
                      </span>
                    </th>
                    <th
                      onClick={() => handleTableSort('remarks', cashSortField, cashSortDirection, setCashSortField, setCashSortDirection)}
                      className="py-2 px-2.5 cursor-pointer select-none hover:bg-cyan-500/10 transition-colors"
                      title="Sort by Remarks"
                    >
                      <span className="inline-flex items-center">
                        Remarks {renderSortIndicator('remarks', cashSortField, cashSortDirection, true)}
                      </span>
                    </th>
                    <th className="py-2 px-2.5 w-44 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                  {sortedCashCollections.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-5 px-2.5 text-center text-slate-400 italic">
                        {cashDepositFilter === 'pending'
                          ? 'No pending cash collections (all party cash has been deposited!).'
                          : cashDepositFilter === 'deposited'
                          ? 'No deposited cash collections recorded yet.'
                          : 'No customer cash collections recorded yet.'}
                      </td>
                    </tr>
                  ) : (
                    sortedCashCollections.map((col, idx) => {
                        const matchedParty = (parties || []).find(
                          (p) => p.name.trim().toLowerCase() === (col.partyName || '').trim().toLowerCase()
                        );
                        const isDep = isCollectionDeposited(col);
                        const isSelected = selectedCashIds.includes(col.id);

                        return (
                          <tr key={`${col.id || 'cash'}-${idx}`} className={`transition-colors ${isSelected ? 'bg-rose-500/15' : 'hover:bg-cyan-500/[0.06]'}`}>
                            <td className="py-1.5 px-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectCash(col.id)}
                                className="w-4 h-4 rounded text-rose-500 focus:ring-rose-500 accent-rose-500 cursor-pointer"
                                title="Select for bulk delete"
                              />
                            </td>
                            <td className="py-1.5 px-2.5 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                            <td className="py-1.5 px-2.5 font-mono font-medium text-slate-300">{formatDateDDMMYY(col.date)}</td>
                            <td className="py-1.5 px-2.5 font-extrabold text-white">
                              <div className="flex flex-col">
                                <span>{cleanSelectedPartyName(col.partyName || 'N/A')}</span>
                                {matchedParty?.address && (
                                  <span className="text-[10px] text-slate-400 font-normal">📍 {matchedParty.address}</span>
                                )}
                              </div>
                            </td>
                            <td className="py-1.5 px-2.5 font-semibold text-slate-300">
                              {col.marketingPerson || col.entityName || matchedParty?.salespersonName || '-'}
                            </td>
                            <td className="py-1.5 px-2.5 text-center">
                              {isDep ? (
                                (() => {
                                  const depInfo = getCollectionBankDepositDetails(col);
                                  const isAutoHo = depInfo?.bankTag === 'H/O';
                                  if (isAutoHo) {
                                    return (
                                      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded text-[10px] font-extrabold bg-purple-500/20 text-purple-200 border border-purple-400/35 whitespace-nowrap" title={`Auto-deposited to Head Office${depInfo?.depositDate ? ` on ${depInfo.depositDate}` : ''}`}>
                                        <CheckCircle2 className="w-3 h-3 text-purple-300 shrink-0" />
                                        <span>Deposited to H/O</span>
                                      </span>
                                    );
                                  }
                                  const bankTag = depInfo?.bankTag || 'Bank';
                                  const depDate = depInfo?.depositDate;
                                  return (
                                    <span
                                      className="inline-flex flex-col items-center justify-center bg-sky-500/20 text-sky-200 px-2.5 py-0.5 rounded text-[10px] font-extrabold border border-sky-400/35 leading-tight whitespace-nowrap"
                                      title={`Bank Deposited: ${depInfo?.bankName || bankTag}${depDate ? ` on ${depDate}` : ''}`}
                                    >
                                      <span className="inline-flex items-center space-x-1.5">
                                        <BankLogoBadge bankName={depInfo?.bankName || bankTag} size="sm" />
                                        <span className="font-black text-sky-200">{bankTag}</span>
                                      </span>
                                      {depDate && (
                                        <span className="text-[9px] font-mono text-sky-300/90 font-bold mt-0.5">
                                          {depDate}
                                        </span>
                                      )}
                                    </span>
                                  );
                                })()
                              ) : (
                                <span className="inline-flex items-center space-x-1 bg-emerald-500/20 text-emerald-200 px-2 py-0.5 rounded text-[10px] font-extrabold border border-emerald-400/35">
                                  <Banknote className="w-3 h-3 text-emerald-300" />
                                  <span>Cash In Hand</span>
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-mono text-sm font-black text-cyan-200 bg-cyan-500/[0.06]">
                              ৳{col.amount.toLocaleString('en-IN')}
                            </td>
                            <td className="py-1.5 px-2.5 italic text-[11px] text-slate-400">
                              {col.remarks && !/Imported from Excel/i.test(col.remarks) ? col.remarks : '-'}
                            </td>
                            <td className="py-1.5 px-2.5 text-center">
                              <div className="flex items-center justify-center space-x-1">
                                {!isDep ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      openDepositModal('cash');
                                      handleSelectCollectionForDeposit(col);
                                    }}
                                    className="px-2.5 py-1 bg-emerald-500/25 hover:bg-emerald-500/35 text-emerald-200 border border-emerald-400/40 font-extrabold text-[11px] rounded cursor-pointer transition-colors whitespace-nowrap inline-flex items-center space-x-1"
                                    title="Deposit Cash to Bank"
                                  >
                                    <Landmark className="w-3 h-3 text-emerald-300 shrink-0" />
                                    <span>Deposit Cash</span>
                                  </button>
                                ) : (
                                  <span className="text-[10px] font-bold px-2 py-1 border rounded whitespace-nowrap inline-flex items-center space-x-1 text-emerald-200 bg-emerald-500/20 border-emerald-400/35" title="Deposited">
                                    <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-300" />
                                    <span>Done ✓</span>
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setEditingCollection(col)}
                                  className="p-1 hover:bg-cyan-500/20 text-cyan-300 rounded transition-colors cursor-pointer"
                                  title="Edit Collection MR"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCollection(col.id, col.partyName || col.mrNo, col.amount)}
                                  className="p-1 hover:bg-rose-500/20 text-rose-300 rounded transition-colors cursor-pointer"
                                  title="Delete Collection MR"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>

                {/* TOTAL SUMMARY ROW */}
                {cashCollectionsList.filter((col) => {
                  const isDep = isCollectionDeposited(col);
                  if (cashDepositFilter === 'pending') return !isDep;
                  if (cashDepositFilter === 'deposited') return isDep;
                  return true;
                }).length > 0 && (
                  <tfoot className="bg-[#0c2638] text-white font-bold border-t border-cyan-500/30">
                    <tr className="h-9">
                      <td colSpan={6} className="py-2 px-2.5 text-right uppercase text-[10px] font-black tracking-wider text-slate-300 border-r border-cyan-500/20">
                        Total Cash Amount ({cashCollectionsList.filter((col) => {
                          const isDep = isCollectionDeposited(col);
                          if (cashDepositFilter === 'pending') return !isDep;
                          if (cashDepositFilter === 'deposited') return isDep;
                          return true;
                        }).length} Entries):
                      </td>
                      <td className="py-2 px-2.5 text-right font-black font-mono text-sm text-cyan-200 bg-[#0e2d42] whitespace-nowrap">
                        ৳{cashCollectionsList
                          .filter((col) => {
                            const isDep = isCollectionDeposited(col);
                            if (cashDepositFilter === 'pending') return !isDep;
                            if (cashDepositFilter === 'deposited') return isDep;
                            return true;
                          })
                          .reduce((sum, c) => sum + (c.amount || 0), 0)
                          .toLocaleString('en-IN')}
                      </td>
                      <td colSpan={2} className="py-2 px-2.5 text-center text-[10px] font-bold text-slate-400 whitespace-nowrap">
                        {cashDepositFilter === 'pending'
                          ? 'Pending Cash'
                          : cashDepositFilter === 'deposited'
                          ? 'Deposited Cash'
                          : 'All Cash Total'}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* RECORDED BANK DEPOSITS TABLE HEADER SUMMARY STRIP */}
          <div className="cyber-glass-subcard p-2.5 px-4 rounded-xl border border-cyan-500/25 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2">
              <Landmark className="w-4 h-4 text-purple-300" />
              <span className="font-extrabold text-purple-200 uppercase tracking-wider">Bank Statement Overview:</span>
              <span className="font-mono font-black text-white">৳{bankDepositedSum.toLocaleString('en-IN')}</span>
              <span className="text-slate-400">({filteredBankDeposits.length} Entries)</span>
            </div>
            <div className="text-[11px] font-semibold text-cyan-200/80">
              Active Configured Banks: <strong className="text-white font-mono">{bankList.length}</strong> • Accounts: <strong className="text-white font-mono">{accountList.length}</strong>
            </div>
          </div>

          {/* RECORDED BANK DEPOSITS TABLE */}
          <div className="cyber-glass-card rounded-2xl overflow-hidden w-full relative">
            <div className="p-3 cyber-glass-header flex flex-wrap items-center justify-between gap-2.5">
              <div>
                <h3 className="text-sm font-extrabold text-white">Recorded Bank Deposits Statement</h3>
                <p className="text-[11px] text-slate-400">History of all bank deposits saved & email dispatch log</p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleOpenTestEmail()}
                  className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-400/35 rounded-lg text-xs font-bold flex items-center space-x-1.5 cursor-pointer transition-colors"
                  title="Send test email to pcildomestic@gmail.com & 290suvro.pcil@gmail.com"
                >
                  <FlaskConical className="w-3.5 h-3.5 text-purple-300" />
                  <span>🧪 Send Test Mail</span>
                </button>
              </div>
            </div>

            {/* Floating Bulk Action Toolbar for Multi-Selected Bank Deposits */}
            {selectedDepositIds.length > 0 && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#091e2c]/95 text-white backdrop-blur-xl px-4 py-2.5 rounded-2xl shadow-2xl border border-rose-400/50 flex items-center space-x-4 animate-in fade-in slide-in-from-bottom-2 duration-150">
                <div className="flex items-center space-x-3">
                  <span className="bg-rose-500/20 text-rose-200 border border-rose-400/40 font-black text-xs px-2.5 py-1 rounded-full font-mono shadow-xs">
                    {selectedDepositIds.length} Selected
                  </span>
                  <span className="text-xs font-bold text-rose-200">
                    Total Selected Amount: <span className="text-white font-mono font-black text-sm">৳{bankDeposits.filter((d) => selectedDepositIds.includes(d.id)).reduce((sum, d) => sum + (d.amount || 0), 0).toLocaleString('en-IN')}</span>
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setSelectedDepositIds([])}
                    className="px-3 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
                  >
                    Deselect All
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkDeleteDeposits}
                    className="px-4 py-1.5 bg-rose-500 hover:bg-rose-400 text-white font-black text-xs rounded-lg shadow-md cursor-pointer transition-all flex items-center space-x-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Selected ({selectedDepositIds.length})</span>
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-200">
                <thead>
                  <tr className="bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 font-bold uppercase text-[10px]">
                    <th className="py-2 px-2.5 w-10 text-center">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded text-rose-500 focus:ring-rose-500 cursor-pointer accent-rose-500"
                        title="Select/Deselect All Filtered Deposits"
                        checked={
                          filteredBankDeposits.length > 0 &&
                          filteredBankDeposits.every((dep) => selectedDepositIds.includes(dep.id))
                        }
                        onChange={() => toggleSelectAllDeposits(filteredBankDeposits)}
                      />
                    </th>
                    {renderDepositSortHeader('SL', 'sl', 'center', 'w-12')}
                    {renderDepositSortHeader('Date', 'date', 'left', 'w-24 whitespace-nowrap')}
                    {renderDepositSortHeader('Party Name', 'customer', 'left', 'min-w-[160px]')}
                    {renderDepositSortHeader('Address', 'address', 'left', 'min-w-[120px]')}
                    {renderDepositSortHeader('Marketing Officer', 'officer', 'left', 'w-36 whitespace-nowrap')}
                    {renderDepositSortHeader('Target Bank & Account', 'tag', 'left', 'w-48 whitespace-nowrap')}
                    {renderDepositSortHeader('Deposite Date', 'depositeDate', 'left', 'w-28 whitespace-nowrap')}
                    {renderDepositSortHeader('Amount (Tk)', 'amount', 'right', 'w-32 bg-[#0e2d42] text-cyan-200 whitespace-nowrap')}
                    <th className="py-2 px-2.5 w-44 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                  {sortedBankDeposits.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-5 px-2.5 text-center text-slate-400 italic">
                        No bank deposit entries recorded yet.
                      </td>
                    </tr>
                  ) : (
                    sortedBankDeposits.map((dep, idx) => {
                      const isSelected = selectedDepositIds.includes(dep.id);
                      const batchMatches = dep.batchId ? (bankDeposits || []).filter((d) => d.batchId === dep.batchId) : [];
                      const isMulti = batchMatches.length > 1;
                      const bSum = isMulti ? batchMatches.reduce((s, d) => s + d.amount, 0) : dep.amount;
                      return (
                        <tr key={dep.id} className={`transition-colors ${isSelected ? 'bg-rose-500/15' : 'hover:bg-cyan-500/[0.06]'}`}>
                          <td className="py-1.5 px-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectDeposit(dep.id)}
                              className="w-4 h-4 rounded text-rose-500 focus:ring-rose-500 cursor-pointer accent-rose-500"
                              title="Select for bulk delete"
                            />
                          </td>
                          <td className="py-1.5 px-2.5 text-center font-mono text-slate-400 font-bold">{idx + 1}</td>
                          <td className="py-1.5 px-2.5 font-mono font-medium text-slate-300 whitespace-nowrap">{resolveDepositDate(dep, collections) || formatDateDDMMYY(dep.date || dep.depositDate) || (dep.date ? String(dep.date) : '') || (dep.depositDate ? String(dep.depositDate) : '') || '-'}</td>
                          <td className="py-1.5 px-2.5 font-extrabold text-white">
                            {isMulti ? (
                              <div className="space-y-1 font-mono text-xs pt-0.5">
                                {batchMatches.map((m, mIdx) => {
                                  const rawP = (m.partyName || m.customerName || '').trim();
                                  const displayP = rawP && rawP.toLowerCase() !== 'customer' && rawP.toLowerCase() !== 'general customer'
                                    ? rawP
                                    : (m.entityName || '-');
                                  return (
                                    <div key={m.id || mIdx} className="flex items-center justify-between gap-3 text-white">
                                      <span className="font-extrabold">{displayP}</span>
                                      <span className="font-bold text-purple-200 whitespace-nowrap bg-purple-500/20 px-1.5 py-0.5 rounded border border-purple-400/35 text-[11px]">
                                        - {formatAmountWithCommas(m.amount)}/-
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              (() => {
                                const rawP = (dep.partyName || dep.customerName || '').trim();
                                const displayP = rawP && rawP.toLowerCase() !== 'customer' && rawP.toLowerCase() !== 'general customer'
                                  ? rawP
                                  : (dep.entityName || '-');
                                return <span className="text-white font-extrabold">{displayP}</span>;
                              })()
                            )}
                          </td>
                          <td className="py-1.5 px-2.5 font-semibold text-slate-300 whitespace-nowrap">
                            <div className="flex items-center space-x-1">
                              <MapPin className="w-3.5 h-3.5 text-cyan-300/70 shrink-0" />
                              <span>{dep.customerAddress || 'Madhupur'}</span>
                            </div>
                          </td>
                          <td className="py-1.5 px-2.5 font-semibold text-slate-300 whitespace-nowrap">
                            {dep.marketingPerson ? (
                              <div className="flex items-center space-x-1">
                                <User className="w-3.5 h-3.5 text-cyan-300/70 shrink-0" />
                                <span>{dep.marketingPerson}</span>
                              </div>
                            ) : (
                              <span className="text-slate-500 italic">-</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2.5 text-left whitespace-nowrap">
                            {(() => {
                              const isHo = isHoDeposit(dep);
                              const rawBank = dep.targetBankName || dep.bankName || dep.displayTag || dep.depositBankTag;
                              const resolvedBank = isHo ? 'H/O' : (resolveFullBankName(rawBank, bankList) || rawBank || 'Pubali Bank PLC');
                              const rawAcc = dep.accountName || dep.accountShortTag || dep.depositBankTag || dep.displayTag;
                              const resolvedAccount = isHo ? 'Head Office' : (resolveFullAccountName(rawAcc, accountList) || rawAcc || 'Padma Enterprise');
                              const shortTag = isHo ? 'H/O' : getBankAndAccountShortTag(resolvedBank, resolvedAccount, dep.displayTag || dep.depositBankTag);
                              return (
                                <div className="flex flex-col">
                                  <div className="flex items-center space-x-2">
                                    <BankLogoBadge bankName={resolvedBank} size="md" />
                                    <span className={`inline-flex items-center ${isHo ? 'bg-amber-500/20 text-amber-200 border-amber-400/40' : 'bg-sky-500/20 text-sky-200 border-sky-400/35'} px-1.5 py-0.2 rounded text-[10px] font-black border font-mono`}>
                                      {shortTag}
                                    </span>
                                  </div>
                                  <span className="text-[11px] font-semibold text-slate-400 pl-9">
                                    A/C: {resolvedAccount}
                                  </span>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="py-1.5 px-2.5 font-mono font-medium text-slate-300 whitespace-nowrap">{resolveDepositDate(dep, collections) || formatDateDDMMYY(dep.depositDate || dep.date) || (dep.depositDate ? String(dep.depositDate) : '') || (dep.date ? String(dep.date) : '') || '-'}</td>
                          <td className="py-1.5 px-2.5 text-right font-mono text-sm font-black text-cyan-200 bg-cyan-500/[0.06] whitespace-nowrap">
                            <div className="font-black text-cyan-200 text-sm">
                              {isMulti ? `- ৳${bSum.toLocaleString('en-IN')}/-` : `৳${dep.amount.toLocaleString('en-IN')}`}
                            </div>
                            {isMulti && (
                              <div className="text-[10px] text-purple-300 font-bold">
                                Total ({batchMatches.length} Parties)
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 px-2.5 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center space-x-1">
                              {/* View Slip */}
                              {dep.slipImage ? (
                                <button
                                  type="button"
                                  onClick={() => setPreviewImageModal(dep.slipImage || null)}
                                  className="p-1 hover:bg-purple-500/20 text-purple-300 rounded transition-colors cursor-pointer"
                                  title="View uploaded deposit slip"
                                >
                                  <ImageIcon className="w-4 h-4" />
                                </button>
                              ) : (
                                <span className="p-1 text-slate-600 cursor-not-allowed" title="No Slip Attached">
                                  <ImageIcon className="w-4 h-4 opacity-40" />
                                </span>
                              )}

                              {/* Upload / replace slip */}
                              <label
                                className={`p-1 rounded transition-colors cursor-pointer inline-flex items-center ${
                                  dep.slipImage ? 'hover:bg-purple-500/20 text-purple-300' : 'hover:bg-amber-500/20 text-amber-300'
                                }`}
                                title={dep.slipImage ? "Replace / update deposit slip" : "Upload deposit slip image"}
                              >
                                <Upload className="w-4 h-4" />
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => handleDirectSlipUpload(dep.id, e, dep.batchId)}
                                  className="hidden"
                                />
                              </label>

                              {/* Send mail / Sent */}
                              <button
                                type="button"
                                onClick={() => handleOpenDepositEmail(dep)}
                                className={`p-1 rounded transition-colors cursor-pointer ${
                                  dep.emailSent ? 'hover:bg-teal-500/20 text-teal-300' : 'hover:bg-cyan-500/20 text-cyan-300'
                                }`}
                                title={
                                  dep.emailSent
                                    ? 'Email Sent ✓ (Click to view or resend)'
                                    : 'Send deposit notification mail'
                                }
                              >
                                {dep.emailSent ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                                ) : (
                                  <Mail className="w-4 h-4" />
                                )}
                              </button>

                              {/* Multi-party batch */}
                              {isMulti && (
                                <button
                                  type="button"
                                  onClick={() => openBatchDepositEditor(dep.batchId!)}
                                  className="p-1 hover:bg-indigo-500/20 text-indigo-300 rounded transition-colors cursor-pointer"
                                  title={`Edit Multi-Party Batch (${batchMatches.length} parties)`}
                                >
                                  <Users className="w-4 h-4" />
                                </button>
                              )}

                              {/* Edit */}
                              <button
                                type="button"
                                onClick={() => handleOpenEditBankDeposit(dep)}
                                className="p-1 hover:bg-cyan-500/20 text-cyan-300 rounded transition-colors cursor-pointer"
                                title={isMulti ? `Edit Deposit Batch (${batchMatches.length} parties)` : "Edit / Correct Bank Deposit"}
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>

                              {/* Delete */}
                              <button
                                type="button"
                                onClick={() => handleDeleteBankDeposit(dep.id, isMulti ? `Batch (${batchMatches.length} parties)` : (dep.customerName || dep.bankName), bSum)}
                                className="p-1 hover:bg-rose-500/20 text-rose-300 rounded cursor-pointer transition-colors"
                                title="Delete Bank Deposit"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {/* TOTAL SUMMARY ROW */}
                {filteredBankDeposits.length > 0 && (
                  <tfoot className="bg-[#0c2638] text-white font-bold border-t border-cyan-500/30">
                    <tr className="h-9">
                      <td colSpan={8} className="py-2 px-2.5 text-right uppercase text-[10px] font-black tracking-wider text-slate-300 border-r border-cyan-500/20">
                        Total Bank Deposits ({filteredBankDeposits.length} Entries):
                      </td>
                      <td className="py-2 px-2.5 text-right font-black font-mono text-sm text-cyan-200 bg-[#0e2d42] whitespace-nowrap">
                        ৳{filteredBankDeposits.reduce((sum, dep) => sum + (dep.amount || 0), 0).toLocaleString('en-IN')}
                      </td>
                      <td className="py-2 px-2.5 text-center text-[10px] font-bold text-slate-400 whitespace-nowrap">
                        {filteredBankDeposits.filter((d) => d.emailSent).length} of {filteredBankDeposits.length} Mails Sent
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="cyber-glass-card rounded-2xl p-3 flex flex-wrap items-center justify-end gap-2 no-print">
            <button
              type="button"
              onClick={() => {
                if (xlsxFileInputRef.current) {
                  xlsxFileInputRef.current.value = '';
                  xlsxFileInputRef.current.click();
                }
              }}
              className="px-3 py-1.5 bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 font-bold text-xs rounded-lg flex items-center space-x-1.5 cursor-pointer transition-all border border-teal-400/35"
              title="Import cash collections from Excel (.xlsx) file"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Import Excel</span>
            </button>

            <button
              type="button"
              onClick={() => handleExportCollectionsXlsx('cash')}
              className="px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 font-bold text-xs rounded-lg flex items-center space-x-1.5 cursor-pointer transition-all border border-indigo-400/35"
              title="Export Cash List to Excel (.xlsx) file"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Cash List</span>
            </button>

            <button
              type="button"
              onClick={() => openDepositModal('cash', false)}
              className="px-3.5 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs rounded-lg shadow-sm flex items-center space-x-1.5 cursor-pointer transition-all"
            >
              <Plus className="w-3.5 h-3.5 text-slate-950" />
              <span>Deposit Cash</span>
            </button>

            <button
              type="button"
              onClick={() => openDepositModal('cash', true)}
              className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 font-black text-xs rounded-lg flex items-center space-x-1.5 cursor-pointer transition-all border border-blue-400/35"
              title="Deposit multiple customer payments at once into this bank"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Multi-Party Deposit Cash</span>
            </button>

            <button
              type="button"
              onClick={() => setShowBankManagerModal(true)}
              className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 font-bold text-xs rounded-lg flex items-center space-x-1.5 cursor-pointer transition-all border border-purple-400/35"
              title="Directly manage Bank & Account Directory without exiting or leaving the page"
            >
              <Landmark className="w-3.5 h-3.5 text-purple-300" />
              <span>Bank & Account Directory</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. DEPOSIT HISTORY PAGE */}
      {activeTab === 'deposit_history' && (
        <div className="w-full space-y-2.5">
          {/* Top Banner & Action Buttons */}
          <div className="cyber-glass-card text-white p-3 rounded-2xl flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center space-x-2.5 shrink-0">
              <div className="bg-purple-500/20 border border-purple-400/35 p-2 rounded-xl text-purple-300">
                <Landmark className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <h2 className="text-sm sm:text-base font-black tracking-wide text-white whitespace-nowrap">Bank Deposit History</h2>
            </div>

            <div className="flex items-center space-x-1.5 bg-[#061520]/80 px-2.5 py-1 rounded-lg border border-cyan-500/25 shrink-0">
              <Landmark className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
              <span className="text-[11px] font-bold text-slate-300 uppercase">Filter View:</span>
              <select
                value={depositHistorySubTab}
                onChange={(e) => setDepositHistorySubTab(e.target.value as 'all' | 'ho_deposited' | 'bank_only')}
                className="bg-[#081b28] text-cyan-200 border border-cyan-500/30 rounded px-2 py-0.5 text-xs font-bold focus:ring-1 focus:ring-cyan-400 focus:outline-none cursor-pointer"
              >
                <option value="all">All Deposits ({filteredBankDeposits.length})</option>
                <option value="ho_deposited">H/O Deposited ({hoDepositsCount})</option>
                <option value="bank_only">Bank Branch Only ({bankOnlyDepositsCount})</option>
              </select>
            </div>
            <input
              type="file"
              ref={depositXlsxFileInputRef}
              onChange={handleImportDepositsXlsx}
              accept=".xlsx, .xls, .csv"
              className="hidden"
            />
          </div>

          {/* BANK-WISE DEPOSIT LOGO SUMMARY BAR (Pubali, DBBL, BRAC, City, EBL, Islami, NCC, etc.) */}
          {(() => {
            const bankBuckets = new Map<string, { bankName: string; count: number; total: number }>();
            (tabFilteredBankDeposits || []).forEach((dep) => {
              const isHo = isHoDeposit(dep);
              const bName = isHo
                ? 'H/O'
                : (resolveFullBankName(dep.bankName || dep.targetBankName || dep.displayTag || dep.depositBankTag, bankList) ||
                   dep.bankName ||
                   'Pubali Bank PLC');
              const key = bName.toLowerCase();
              const cur = bankBuckets.get(key) || { bankName: bName, count: 0, total: 0 };
              cur.count += 1;
              cur.total += Number(dep.amount) || 0;
              bankBuckets.set(key, cur);
            });
            const entries = Array.from(bankBuckets.values()).sort((a, b) => b.total - a.total);
            if (entries.length === 0) return null;
            return (
              <div className="cyber-glass-subcard p-2.5 rounded-xl border border-cyan-500/25 flex items-center gap-2 overflow-x-auto custom-scrollbar">
                <span className="text-[10px] font-black uppercase tracking-wider text-cyan-300 whitespace-nowrap px-1">
                  Banks:
                </span>
                {entries.map((entry) => {
                  const isActiveFilter = search.trim().toLowerCase() === entry.bankName.toLowerCase();
                  return (
                    <button
                      key={entry.bankName}
                      type="button"
                      onClick={() => setSearch(isActiveFilter ? '' : entry.bankName)}
                      className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-left transition-all shrink-0 cursor-pointer ${
                        isActiveFilter
                          ? 'bg-cyan-500/25 border-cyan-400 shadow-sm'
                          : 'bg-[#061520]/85 hover:bg-[#0c2638] border-cyan-500/25'
                      }`}
                      title={`Click to filter deposits for ${entry.bankName}`}
                    >
                      <BankLogoBadge bankName={entry.bankName} size="md" />
                      <div className="leading-tight">
                        <div className="text-[11px] font-extrabold text-white whitespace-nowrap">
                          <span className="text-[10px] text-cyan-300 font-mono">({entry.count})</span>
                        </div>
                        <div className="text-[11px] font-mono font-black text-emerald-300">
                          ৳{entry.total.toLocaleString('en-IN')}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* H/O Deposited Tab Notice Banner */}
          {depositHistorySubTab === 'ho_deposited' && (
            <div className="bg-amber-500/15 border border-amber-400/40 p-2.5 sm:p-3 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-amber-100">
              <div className="flex items-center space-x-2">
                <Building2 className="w-4 h-4 text-amber-300 shrink-0" />
                <span className="font-medium">
                  <strong>H/O Deposited Tab:</strong> Showing Head Office deposit settlements for branch expenses funded by parties.
                  You can <strong>Edit</strong> details or <strong>Delete</strong> any entry. If deleted, that amount is immediately restored and found on the <strong>Cash In Hand</strong> page.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowProcedureModal(true)}
                className="text-amber-200 hover:text-white underline font-bold cursor-pointer whitespace-nowrap ml-auto"
              >
                View Full Procedure Flow →
              </button>
            </div>
          )}

          {/* FILTER BAR */}
          <div className="bg-[#0b2334]/85 backdrop-blur-xl text-white rounded-2xl shadow-lg border border-cyan-500/25 p-2.5 sm:p-3 space-y-2">
            {/* Row 1: Filters & Search */}
            <div className="flex items-center space-x-1.5 flex-wrap gap-y-1.5">
              {/* Filter Account Search Box */}
              <SalesCenterSearchFilter
                value={filterEntity}
                onChange={(val) => handleAccountFilterChange(val)}
                options={cashInHandSearchOptions}
                isLocked={!canViewAllUserCenters}
                includeAllOption={canViewAllUserCenters}
                allOptionLabel="All Sales Centers"
                allOptionValue="All Sales Centers"
                label="Account:"
                placeholder="Search account / bank / showroom..."
                theme="dark"
                size="xs"
                widthClass="min-w-[150px] max-w-[210px]"
              />

              {/* Salesman Filter Dropdown */}
              <SalesmanFilterControl color="purple" />

              {/* By Party Searchable Box */}
              <PartyFilterControl dark={true} />

              {/* Search Box with Clear Button */}
              <div className="relative flex-1 min-w-[145px] max-w-[210px]">
                <Search className="w-3.5 h-3.5 text-cyan-300/80 absolute left-2 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search cheque#, party, bank..."
                  className="w-full pl-7 pr-6 py-0.5 text-xs bg-[#061520] text-white placeholder-slate-400 border border-cyan-500/30 rounded-lg font-medium focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-all truncate"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs p-0.5 cursor-pointer font-bold"
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Reset Filters Button */}
              {(Boolean(search) || (filterEntity !== 'All Sales Centers' && filterEntity !== 'All') || filterParty !== 'All' || filterSalesman !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setFilterEntity('All Sales Centers');
                    setFilterSalesman('all');
                    setFilterParty('All');
                    setPartySearchInput('');
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold text-rose-200 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/35 rounded-lg transition-colors cursor-pointer shrink-0"
                  title="Reset search and filters to default"
                >
                  <RotateCcw className="w-3 h-3 text-rose-300" />
                  <span>Reset</span>
                </button>
              )}

              {/* Total Summary */}
              <div className="ml-auto flex items-center space-x-1.5 bg-[#061520] px-3 py-1 rounded-lg border border-cyan-500/30 text-xs">
                <span className="text-slate-400 font-bold">
                  {depositHistorySubTab === 'ho_deposited' ? 'H/O Total:' : depositHistorySubTab === 'bank_only' ? 'Bank Total:' : 'Filtered Total:'}
                </span>
                <span className="text-purple-300 font-extrabold text-sm font-mono">
                  ৳{tabFilteredBankDeposits.reduce((sum, dep) => {
                    const batchMatches = dep.batchId ? (bankDeposits || []).filter((d) => d.batchId === dep.batchId) : [];
                    const amt = batchMatches.length > 1 ? batchMatches.reduce((s, d) => s + d.amount, 0) : dep.amount;
                    return sum + (amt || 0);
                  }, 0).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Row 2: Period Selection, Quick Presets & Inline Custom Range */}
            <div className="pt-1.5 border-t border-cyan-500/20 flex items-center space-x-2 flex-wrap gap-y-1.5">
              <div className="flex items-center space-x-1.5 bg-[#071824]/90 p-1 px-2 rounded-lg border border-cyan-500/25">
                <label className="text-slate-300 font-bold flex items-center space-x-1 shrink-0">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs">Period:</span>
                </label>

                {/* Quick Period Buttons */}
                <div className="flex items-center space-x-1 flex-wrap gap-y-1">
                  {(['this_month', 'last_month', 'this_year', 'last_year', 'all', 'custom'] as const).map((presetKey) => {
                    const labels: Record<string, string> = {
                      this_month: 'This Month',
                      last_month: 'Last Month',
                      this_year: 'This Year',
                      last_year: 'Last Year',
                      all: 'All',
                      custom: 'Custom Range'
                    };
                    return (
                      <button
                        key={presetKey}
                        type="button"
                        onClick={() => handleSelectPeriodPreset(presetKey)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer border whitespace-nowrap ${
                          periodPreset === presetKey
                            ? 'bg-emerald-500/90 text-white border-emerald-300/90 shadow-[0_0_16px_rgba(16,185,129,0.50)] font-black'
                            : 'bg-[#081c28]/55 hover:bg-white/[0.10] text-slate-200 border-white/[0.12] font-bold'
                        }`}
                      >
                        {labels[presetKey]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Date Range in the SAME line */}
              <div className="flex items-center space-x-1.5 bg-[#061520] text-white p-1 px-2.5 rounded-lg border border-cyan-500/30 text-[11px]">
                <span className="text-slate-400 font-bold whitespace-nowrap">Date Range:</span>
                <div className="flex items-center space-x-1">
                  <span className="font-semibold text-slate-300">From:</span>
                  <input
                    id="dep-hist-from-date"
                    type="text"
                    value={startDate}
                    onClick={() => {
                      setStartDate('');
                      setPeriodPreset('custom');
                    }}
                    onFocus={() => {
                      setStartDate('');
                      setPeriodPreset('custom');
                    }}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setPeriodPreset('custom');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (startDate.trim()) setStartDate(formatDateDDMMYY(startDate));
                        const toEl = document.getElementById('dep-hist-to-date') as HTMLInputElement | null;
                        toEl?.focus();
                        toEl?.select();
                      }
                    }}
                    onBlur={() => {
                      if (startDate.trim()) setStartDate(formatDateDDMMYY(startDate));
                    }}
                    placeholder="dd.mm.yy"
                    className="bg-[#081b28] text-cyan-300 font-mono font-bold py-0.5 px-1.5 border border-cyan-500/30 rounded w-[68px] text-center text-xs focus:ring-1 focus:ring-cyan-400 focus:outline-none"
                  />
                  <div className="relative flex items-center">
                    <input
                      type="date"
                      value={parseDateToISO(startDate)}
                      onChange={(e) => {
                        if (e.target.value) {
                          setStartDate(formatDateDDMMYY(e.target.value));
                          setPeriodPreset('custom');
                        }
                      }}
                      className="opacity-0 absolute inset-0 w-6 h-6 cursor-pointer z-10"
                      title="Pick From Date from calendar"
                    />
                    <Calendar className="w-3.5 h-3.5 text-cyan-300/80 hover:text-white cursor-pointer" />
                  </div>
                </div>
                <span className="text-slate-500 font-bold">-</span>
                <div className="flex items-center space-x-1">
                  <span className="font-semibold text-slate-300">To:</span>
                  <input
                    id="dep-hist-to-date"
                    type="text"
                    value={endDate}
                    onClick={() => {
                      setEndDate('');
                      setPeriodPreset('custom');
                    }}
                    onFocus={() => {
                      setEndDate('');
                      setPeriodPreset('custom');
                    }}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setPeriodPreset('custom');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (endDate.trim()) setEndDate(formatDateDDMMYY(endDate));
                      }
                    }}
                    onBlur={() => {
                      if (endDate.trim()) setEndDate(formatDateDDMMYY(endDate));
                    }}
                    placeholder="dd.mm.yy"
                    className="bg-[#081b28] text-cyan-300 font-mono font-bold py-0.5 px-1.5 border border-cyan-500/30 rounded w-[68px] text-center text-xs focus:ring-1 focus:ring-cyan-400 focus:outline-none"
                  />
                  <div className="relative flex items-center">
                    <input
                      type="date"
                      value={parseDateToISO(endDate)}
                      onChange={(e) => {
                        if (e.target.value) {
                          setEndDate(formatDateDDMMYY(e.target.value));
                          setPeriodPreset('custom');
                        }
                      }}
                      className="opacity-0 absolute inset-0 w-6 h-6 cursor-pointer z-10"
                      title="Pick To Date from calendar"
                    />
                    <Calendar className="w-3.5 h-3.5 text-cyan-300/80 hover:text-white cursor-pointer" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RECORDED BANK DEPOSITS TABLE */}
          <div className="cyber-glass-card rounded-2xl overflow-x-hidden overflow-y-auto w-full relative max-h-[calc(100vh-18rem)] min-h-[10rem]">

            {/* MOBILE CARDS VIEW (md:hidden) */}
            <div className="block md:hidden p-2.5 space-y-2.5 bg-[#071824]/60">
              {sortedBankDeposits.length === 0 ? (
                <div className="py-8 text-center text-slate-400 italic text-xs cyber-glass-subcard rounded-xl border border-cyan-500/20">
                  No bank deposit entries recorded yet.
                </div>
              ) : (
                <>
                  {sortedBankDeposits.map((dep, idx) => {
                    const batchMatches = dep.batchId ? (bankDeposits || []).filter((d) => d.batchId === dep.batchId) : [];
                    const isMulti = batchMatches.length > 1;
                    const bSum = isMulti ? batchMatches.reduce((s, d) => s + d.amount, 0) : dep.amount;
                    const depParty = (parties || []).find((p) => p.name.trim().toLowerCase() === (dep.customerName || dep.partyName || '').trim().toLowerCase());
                    const mkt = dep.marketingPerson || depParty?.salespersonName;
                    const addr = (dep.customerAddress && dep.customerAddress !== 'Madhupur' ? dep.customerAddress : depParty?.address) || dep.customerAddress || (dep.bankName === 'H/O' ? 'Head Office' : 'Madhupur');
                    const isHo = isHoDeposit(dep);
                    const fullBank = isHo ? 'Head Office (H/O)' : (resolveFullBankName(dep.bankName || dep.targetBankName || dep.displayTag || dep.depositBankTag, bankList) || 'Pubali Bank PLC');
                    const fullAccount = isHo ? 'Head Office' : (resolveFullAccountName(dep.accountName || dep.depositBankTag || dep.accountShortTag || dep.displayTag, accountList) || 'Padma Enterprise');
                    const shortTag = isHo ? 'H/O' : getBankAndAccountShortTag(fullBank, fullAccount, dep.displayTag || dep.depositBankTag);

                    return (
                      <div key={dep.id} className="p-3 cyber-glass-subcard rounded-xl border border-cyan-500/25 space-y-2">
                        {/* Header: SL, Date, and Clickable Short Tag */}
                        <div className="flex items-center justify-between gap-2 border-b border-cyan-500/15 pb-2">
                          <div className="flex items-center gap-1.5 font-mono text-xs">
                            <span className="bg-cyan-500/15 text-cyan-200 border border-cyan-400/30 px-1.5 py-0.5 rounded font-bold text-[11px]">#{idx + 1}</span>
                            <span className="font-semibold text-slate-300">{resolveDepositDate(dep, collections) || formatDateDDMMYY(dep.date || dep.depositDate) || (dep.date ? String(dep.date) : '') || '-'}</span>
                          </div>
                          {/* Bank Logo & Short Tag */}
                          <div className="inline-flex items-center space-x-2 py-1 px-2 rounded-lg bg-[#061520] border border-cyan-500/30 font-mono text-[10px] font-black text-white select-none">
                            <BankLogoBadge bankName={isHo ? 'H/O' : (fullBank || shortTag)} size="md" />
                            <div className="flex flex-col leading-tight">
                              <span className="font-bold text-cyan-300 text-[9px]">{shortTag}</span>
                            </div>
                          </div>
                        </div>

                        {/* Party & Details */}
                        <div>
                          {isMulti ? (
                            <div className="space-y-1 font-mono text-xs">
                              {batchMatches.map((m, mIdx) => {
                                const rawP = (m.partyName || m.customerName || '').trim();
                                const cleanP = cleanSelectedPartyName(rawP);
                                const displayP = cleanP && cleanP.toLowerCase() !== 'customer' && cleanP.toLowerCase() !== 'general customer'
                                  ? cleanP
                                  : (m.entityName || '-');
                                return (
                                  <div key={m.id || mIdx} className="flex items-center justify-between gap-2 text-white">
                                    <span className="font-extrabold truncate">{displayP}</span>
                                    <span className="font-bold text-purple-200 whitespace-nowrap bg-purple-500/20 px-1.5 py-0.5 rounded border border-purple-400/35 text-[11px]">
                                      - {formatAmountWithCommas(m.amount)}/-
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="font-extrabold text-white text-sm">
                              {(() => {
                                const rawP = (dep.partyName || dep.customerName || '').trim();
                                const cleanP = cleanSelectedPartyName(rawP);
                                return cleanP && cleanP.toLowerCase() !== 'customer' && cleanP.toLowerCase() !== 'general customer'
                                  ? cleanP
                                  : (dep.entityName || '-');
                              })()}
                            </div>
                          )}
                        </div>

                        {/* Meta: Location & Marketing */}
                        {(addr || mkt) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-slate-300">
                            {addr && (
                              <div className="flex items-center gap-1 text-slate-400 truncate">
                                <MapPin className="w-3 h-3 text-cyan-300/70 shrink-0" />
                                <span className="truncate">{addr}</span>
                              </div>
                            )}
                            {mkt && (
                              <div className="flex items-center gap-1 text-slate-400 truncate">
                                <User className="w-3 h-3 text-cyan-300/70 shrink-0" />
                                <span className="truncate">{mkt}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Remarks Note */}
                        {dep.remarks && !/Imported from Excel/i.test(dep.remarks) && (
                          <div className="text-[11px] italic text-slate-300 bg-[#061520] px-2 py-1 rounded truncate border border-cyan-500/20" title={dep.remarks}>
                            <span className="font-semibold not-italic text-cyan-200">Note: </span>
                            {dep.remarks}
                          </div>
                        )}

                        {/* Amount & Actions */}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-cyan-500/15">
                          <div>
                            <div className="font-mono font-black text-base text-cyan-200">
                              {isMulti ? `- ৳${bSum.toLocaleString('en-IN')}/-` : `৳${dep.amount.toLocaleString('en-IN')}`}
                            </div>
                            {isMulti && (
                              <div className="text-[10px] text-purple-300 font-bold">
                                Total ({batchMatches.length} Parties)
                              </div>
                            )}
                          </div>

                          <div className="flex items-center flex-wrap justify-end gap-1">
                            {dep.slipImage ? (
                              <button
                                type="button"
                                onClick={() => setPreviewImageModal(dep.slipImage || null)}
                                className="p-1.5 hover:bg-purple-500/20 text-purple-300 rounded-lg cursor-pointer transition-colors"
                                title="View uploaded deposit slip"
                              >
                                <ImageIcon className="w-4 h-4" />
                              </button>
                            ) : null}

                            <label
                              className={`p-1.5 rounded-lg cursor-pointer inline-flex items-center transition-colors ${
                                dep.slipImage ? 'hover:bg-purple-500/20 text-purple-300' : 'hover:bg-amber-500/20 text-amber-300'
                              }`}
                              title={dep.slipImage ? "Replace deposit slip" : "Upload deposit slip"}
                            >
                              <Upload className="w-4 h-4" />
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleDirectSlipUpload(dep.id, e, dep.batchId)}
                                className="hidden"
                              />
                            </label>

                            <button
                              type="button"
                              onClick={() => handleOpenDepositEmail(dep)}
                              className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                                dep.emailSent ? 'hover:bg-teal-500/20 text-teal-300' : 'hover:bg-cyan-500/20 text-cyan-300'
                              }`}
                              title={dep.emailSent ? 'Email Sent' : 'Send deposit email'}
                            >
                              {dep.emailSent ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                              ) : (
                                <Mail className="w-4 h-4" />
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenEditBankDeposit(dep)}
                              className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                                isHo ? 'hover:bg-amber-500/20 text-amber-300' : 'hover:bg-cyan-500/20 text-cyan-300'
                              }`}
                              title="Edit Deposit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleDeleteBankDeposit(
                                  dep.id,
                                  isHo
                                    ? `H/O Deposit for ${dep.customerName || dep.partyName || 'Party'}`
                                    : isMulti
                                    ? `Batch (${batchMatches.length} parties)`
                                    : (dep.customerName || dep.bankName),
                                  bSum
                                )
                              }
                              className="p-1.5 hover:bg-rose-500/20 text-rose-300 rounded-lg cursor-pointer transition-colors"
                              title="Delete Deposit"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Mobile Total Card */}
                  <div className="p-3 bg-[#0c2638] border border-cyan-500/30 text-white rounded-xl flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-300">
                      Total ({sortedBankDeposits.length} Entries):
                    </span>
                    <span className="font-mono text-sm text-cyan-200 font-black">
                      ৳{sortedBankDeposits.reduce((sum, dep) => {
                        const batchMatches = dep.batchId ? (bankDeposits || []).filter((d) => d.batchId === dep.batchId) : [];
                        const amt = batchMatches.length > 1 ? batchMatches.reduce((s, d) => s + d.amount, 0) : dep.amount;
                        return sum + (amt || 0);
                      }, 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-200">
                <thead>
                  <tr className="bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 font-bold uppercase text-[10px]">
                    {renderDepositSortHeader('SL', 'sl', 'center', 'w-10')}
                    {renderDepositSortHeader('Date', 'date', 'left', 'w-20 whitespace-nowrap')}
                    {renderDepositSortHeader('Party Name', 'customer', 'left', 'min-w-[130px]')}
                    {renderDepositSortHeader('Address', 'address', 'left', 'w-24 whitespace-nowrap')}
                    {renderDepositSortHeader('Marketing Officer', 'officer', 'left', 'w-28 whitespace-nowrap')}
                    {renderDepositSortHeader('Target Bank & Account', 'tag', 'left', 'w-36 whitespace-nowrap')}
                    {renderDepositSortHeader('Deposite Date', 'depositeDate', 'left', 'w-24 whitespace-nowrap')}
                    {renderDepositSortHeader('Amount (Tk)', 'amount', 'right', 'w-28 bg-[#0e2d42] text-cyan-200 whitespace-nowrap')}
                    {renderDepositSortHeader('Remarks', 'remarks', 'left', 'w-20 max-w-[80px]')}
                    <th className="py-1.5 px-2 w-28 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                  {sortedBankDeposits.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-5 px-2.5 text-center text-slate-400 italic">
                        No bank deposit entries recorded yet.
                      </td>
                    </tr>
                  ) : (
                    sortedBankDeposits.map((dep, idx) => {
                      const batchMatches = dep.batchId ? (bankDeposits || []).filter((d) => d.batchId === dep.batchId) : [];
                      const isMulti = batchMatches.length > 1;
                      const bSum = isMulti ? batchMatches.reduce((s, d) => s + d.amount, 0) : dep.amount;
                      return (
                        <tr key={dep.id} className="hover:bg-cyan-500/[0.06] transition-colors">
                          <td className="py-1 px-1.5 text-center font-mono text-slate-400 font-bold">{idx + 1}</td>
                          <td className="py-1 px-1.5 font-mono font-medium text-slate-300 whitespace-nowrap">{resolveDepositDate(dep, collections) || formatDateDDMMYY(dep.date || dep.depositDate) || (dep.date ? String(dep.date) : '') || (dep.depositDate ? String(dep.depositDate) : '') || '-'}</td>
                          <td className="py-1 px-1.5 font-extrabold text-white">
                            <div className="flex flex-col gap-1">
                              {isMulti ? (
                                <div className="space-y-1 font-mono text-xs pt-0.5">
                                  {batchMatches.map((m, mIdx) => {
                                    const rawP = (m.partyName || m.customerName || '').trim();
                                    const cleanP = cleanSelectedPartyName(rawP);
                                    const displayP = cleanP && cleanP.toLowerCase() !== 'customer' && cleanP.toLowerCase() !== 'general customer'
                                      ? cleanP
                                      : (m.entityName || '-');
                                    return (
                                      <div key={m.id || mIdx} className="flex items-center justify-between gap-3 text-white">
                                        <span className="font-extrabold">{displayP}</span>
                                        <span className="font-bold text-purple-200 whitespace-nowrap bg-purple-500/20 px-1.5 py-0.5 rounded border border-purple-400/35 text-[11px]">
                                          - {formatAmountWithCommas(m.amount)}/-
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                (() => {
                                  const rawP = (dep.partyName || dep.customerName || '').trim();
                                  const cleanP = cleanSelectedPartyName(rawP);
                                  const displayP = cleanP && cleanP.toLowerCase() !== 'customer' && cleanP.toLowerCase() !== 'general customer'
                                    ? cleanP
                                    : (dep.entityName || '-');
                                  return <span className="text-white font-extrabold">{displayP}</span>;
                                })()
                              )}
                            </div>
                          </td>
                          <td className="py-1 px-1.5 font-semibold text-slate-300 whitespace-nowrap">
                            <div className="flex items-center space-x-1">
                              <MapPin className="w-3.5 h-3.5 text-cyan-300/70 shrink-0" />
                              <span>{(() => {
                                const depParty = (parties || []).find((p) => p.name.trim().toLowerCase() === (dep.customerName || dep.partyName || '').trim().toLowerCase());
                                return (dep.customerAddress && dep.customerAddress !== 'Madhupur' ? dep.customerAddress : depParty?.address) || dep.customerAddress || (dep.bankName === 'H/O' ? 'Head Office' : 'Madhupur');
                              })()}</span>
                            </div>
                          </td>
                          <td className="py-1 px-1.5 font-semibold text-slate-300 whitespace-nowrap">
                            {(() => {
                              const depParty = (parties || []).find((p) => p.name.trim().toLowerCase() === (dep.customerName || dep.partyName || '').trim().toLowerCase());
                              const mkt = dep.marketingPerson || depParty?.salespersonName;
                              return mkt ? (
                                <div className="flex items-center space-x-1">
                                  <User className="w-3.5 h-3.5 text-cyan-300/70 shrink-0" />
                                  <span>{mkt}</span>
                                </div>
                              ) : (
                                <span className="text-slate-500 italic">-</span>
                              );
                            })()}
                          </td>
                          <td className="py-1 px-1.5 text-left whitespace-nowrap">
                            {(() => {
                              const isHo = isHoDeposit(dep);
                              const resolvedBank = isHo ? 'Head Office (H/O)' : (resolveFullBankName(dep.bankName || dep.targetBankName || dep.displayTag || dep.depositBankTag, bankList) || 'Pubali Bank PLC');
                              const resolvedAccount = isHo ? 'Head Office' : (resolveFullAccountName(dep.accountName || dep.depositBankTag || dep.accountShortTag || dep.displayTag, accountList) || 'Padma Enterprise');
                              const shortTag = isHo ? 'H/O' : getBankAndAccountShortTag(resolvedBank, resolvedAccount, dep.displayTag || dep.depositBankTag);
                              return (
                                <div className="inline-flex items-center space-x-2 py-1 px-2 rounded-lg bg-[#061520] border border-cyan-500/30 text-white select-none">
                                  <BankLogoBadge bankName={isHo ? 'H/O' : resolvedBank} size="md" />
                                  <div className="flex flex-col leading-tight">
                                    <span className="font-mono font-bold text-cyan-300 text-[10px]">{shortTag}</span>
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="py-1 px-1.5 font-mono font-medium text-slate-300 whitespace-nowrap">{resolveDepositDate(dep, collections) || formatDateDDMMYY(dep.depositDate || dep.date) || (dep.depositDate ? String(dep.depositDate) : '') || (dep.date ? String(dep.date) : '') || '-'}</td>
                          <td className="py-1 px-1.5 text-right font-mono text-sm font-black text-cyan-200 bg-cyan-500/[0.06] whitespace-nowrap">
                            <div className="font-black text-cyan-200 text-sm">
                              {isMulti ? `- ৳${bSum.toLocaleString('en-IN')}/-` : `৳${dep.amount.toLocaleString('en-IN')}`}
                            </div>
                            {isMulti && (
                              <div className="text-[10px] text-purple-300 font-bold">
                                Total ({batchMatches.length} Parties)
                              </div>
                            )}
                          </td>
                          <td className="py-1 px-1.5 italic text-[10px] text-slate-400 whitespace-nowrap w-20 max-w-[80px] truncate" title={dep.remarks || ''}>
                            {dep.remarks && !/Imported from Excel/i.test(dep.remarks) ? dep.remarks : '-'}
                          </td>
                          <td className="py-1 px-1.5 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center space-x-1">
                              {/* View Slip */}
                              {dep.slipImage ? (
                                <button
                                  type="button"
                                  onClick={() => setPreviewImageModal(dep.slipImage || null)}
                                  className="p-1 hover:bg-purple-500/20 text-purple-300 rounded transition-colors cursor-pointer"
                                  title="View uploaded deposit slip"
                                >
                                  <ImageIcon className="w-4 h-4" />
                                </button>
                              ) : (
                                <span className="p-1 text-slate-600 cursor-not-allowed" title="No Slip Attached">
                                  <ImageIcon className="w-4 h-4 opacity-40" />
                                </span>
                              )}

                              {/* Upload / replace slip */}
                              <label
                                className={`p-1 rounded transition-colors cursor-pointer inline-flex items-center ${
                                  dep.slipImage ? 'hover:bg-purple-500/20 text-purple-300' : 'hover:bg-amber-500/20 text-amber-300'
                                }`}
                                title={dep.slipImage ? "Replace / update deposit slip" : "Upload deposit slip image"}
                              >
                                <Upload className="w-4 h-4" />
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => handleDirectSlipUpload(dep.id, e, dep.batchId)}
                                  className="hidden"
                                />
                              </label>

                              {/* Send mail / Sent */}
                              <button
                                type="button"
                                onClick={() => handleOpenDepositEmail(dep)}
                                className={`p-1 rounded transition-colors cursor-pointer ${
                                  dep.emailSent ? 'hover:bg-teal-500/20 text-teal-300' : 'hover:bg-cyan-500/20 text-cyan-300'
                                }`}
                                title={
                                  dep.emailSent
                                    ? 'Email Sent ✓ (Click to view or resend)'
                                    : 'Send deposit notification mail'
                                }
                              >
                                {dep.emailSent ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                                ) : (
                                  <Mail className="w-4 h-4" />
                                )}
                              </button>

                              {/* Multi-party batch */}
                              {isMulti && (
                                <button
                                  type="button"
                                  onClick={() => openBatchDepositEditor(dep.batchId!)}
                                  className="p-1 hover:bg-indigo-500/20 text-indigo-300 rounded transition-colors cursor-pointer"
                                  title={`Edit Multi-Party Batch (${batchMatches.length} parties)`}
                                >
                                  <Users className="w-4 h-4" />
                                </button>
                              )}

                              {/* Edit */}
                              <button
                                type="button"
                                onClick={() => {
                                  handleOpenEditBankDeposit(dep);
                                }}
                                className={`p-1 rounded transition-colors cursor-pointer ${
                                  isHoDeposit(dep) ? 'hover:bg-amber-500/20 text-amber-300' : 'hover:bg-cyan-500/20 text-cyan-300'
                                }`}
                                title={
                                  isHoDeposit(dep)
                                    ? "Edit H/O Deposited Entry"
                                    : isMulti
                                    ? `Edit Deposit Batch (${batchMatches.length} parties)`
                                    : "Edit / Correct Bank Deposit"
                                }
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>

                              {/* Delete */}
                              <button
                                type="button"
                                onClick={() =>
                                  handleDeleteBankDeposit(
                                    dep.id,
                                    isHoDeposit(dep)
                                      ? `H/O Deposit for ${dep.customerName || dep.partyName || 'Party'}`
                                      : isMulti
                                      ? `Batch (${batchMatches.length} parties)`
                                      : (dep.customerName || dep.bankName),
                                    bSum
                                  )
                                }
                                className="p-1 hover:bg-rose-500/20 text-rose-300 rounded cursor-pointer transition-colors"
                                title={
                                  isHoDeposit(dep)
                                    ? "Delete H/O Deposit (Restores amount to Cash In Hand page)"
                                    : "Delete Bank Deposit"
                                }
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {/* TOTAL SUMMARY ROW */}
                {sortedBankDeposits.length > 0 && (
                  <tfoot className="bg-[#0c2638] text-white font-bold border-t border-cyan-500/30">
                    <tr className="h-9">
                      <td colSpan={7} className="py-1.5 px-2 text-right uppercase text-[10px] font-black tracking-wider text-slate-300 border-r border-cyan-500/20">
                        {depositHistorySubTab === 'ho_deposited'
                          ? `Total H/O Deposited (${sortedBankDeposits.length} Entries):`
                          : depositHistorySubTab === 'bank_only'
                          ? `Total Bank Branch Deposits (${sortedBankDeposits.length} Entries):`
                          : `Total Bank Deposits (${sortedBankDeposits.length} Entries):`}
                      </td>
                      <td className="py-1.5 px-2 text-right font-black font-mono text-sm text-cyan-200 bg-[#0e2d42] whitespace-nowrap">
                        ৳{sortedBankDeposits.reduce((sum, dep) => {
                          const batchMatches = dep.batchId ? (bankDeposits || []).filter((d) => d.batchId === dep.batchId) : [];
                          const amt = batchMatches.length > 1 ? batchMatches.reduce((s, d) => s + d.amount, 0) : dep.amount;
                          return sum + (amt || 0);
                        }, 0).toLocaleString('en-IN')}
                      </td>
                      <td colSpan={2} className="py-1.5 px-2 text-center text-[10px] font-bold text-slate-400 whitespace-nowrap">
                        {depositHistorySubTab === 'ho_deposited' ? (
                          <span className="text-amber-300 font-semibold">Credited to Party Ledgers</span>
                        ) : (
                          `${sortedBankDeposits.filter((d) => d.emailSent).length} of ${sortedBankDeposits.length} Mails Sent`
                        )}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="cyber-glass-card rounded-2xl p-3 flex flex-wrap items-center justify-end gap-2 no-print">
            <button
              type="button"
              onClick={() => setShowProcedureModal(true)}
              className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-400/35 rounded-lg text-xs font-bold flex items-center space-x-1.5 cursor-pointer transition-all mr-auto"
              title="Learn how branch expense money flows, where it comes from, and the H/O settlement procedure"
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-300" />
              <span>H/O Procedure Guide</span>
            </button>
            <button
              type="button"
              onClick={() => openDepositModal('cash', false)}
              className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/35 font-bold text-xs rounded-lg flex items-center space-x-1.5 cursor-pointer transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Deposit Cash</span>
            </button>
            <button
              type="button"
              onClick={() => openDepositModal('cash', true)}
              className="px-3.5 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs rounded-lg shadow-sm flex items-center space-x-1.5 cursor-pointer transition-all"
              title="Deposit multiple customer cash collections in a single bank transaction"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Multi-Party Deposit Cash</span>
            </button>
            <button
              type="button"
              onClick={() => openDepositModal('cheque')}
              className="px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-400/35 font-bold text-xs rounded-lg flex items-center space-x-1.5 cursor-pointer transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Deposit Cheque</span>
            </button>
            <button
              type="button"
              onClick={() => setShowBankManagerModal(true)}
              className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 font-bold text-xs rounded-lg flex items-center space-x-1.5 cursor-pointer transition-all border border-purple-400/35"
              title="Directly manage Bank & Account Directory without exiting or leaving the page"
            >
              <Landmark className="w-3.5 h-3.5 text-purple-300" />
              <span>Bank & Account Directory</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (depositXlsxFileInputRef.current) {
                  depositXlsxFileInputRef.current.value = '';
                  depositXlsxFileInputRef.current.click();
                }
              }}
              className="px-3 py-1.5 bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 font-bold text-xs rounded-lg flex items-center space-x-1.5 cursor-pointer transition-all border border-teal-400/35"
              title="Import bank deposits from Excel (.xlsx) file"
            >
              <Upload className="w-3.5 h-3.5 text-teal-300" />
              <span>Import (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={handleExportDepositsXlsx}
              className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 font-bold text-xs rounded-lg flex items-center space-x-1.5 cursor-pointer transition-all border border-emerald-400/35"
              title="Export bank deposits to Excel (.xlsx) file"
            >
              <Download className="w-3.5 h-3.5 text-emerald-300" />
              <span>Export (.xlsx)</span>
            </button>
          </div>
        </div>
      )}

      {/* 5. CHEQUE IN HAND PAGE */}
      {activeTab === 'cheque_in_hand' && (() => {
        const allChequeList = collections.filter(isCheque);
        const pendingCheques = allChequeList.filter((c) => !isCollectionDeposited(c));
        const depositedCheques = allChequeList.filter((c) => isCollectionDeposited(c));
        const bankDepositedCheques = allChequeList.filter((c) => isCollectionDeposited(c) && !c.chequeToCash);
        const cashedCheques = allChequeList.filter((c) => Boolean(c.chequeToCash));

        const totalChequeSum = allChequeList.reduce((acc, c) => acc + (c.amount || 0), 0);
        const pendingChequeSum = pendingCheques.reduce((acc, c) => acc + (c.amount || 0), 0);
        const depositedChequeSum = depositedCheques.reduce((acc, c) => acc + (c.amount || 0), 0);
        const bankDepositedSum = bankDepositedCheques.reduce((acc, c) => acc + (c.amount || 0), 0);
        const cashedSum = cashedCheques.reduce((acc, c) => acc + (c.amount || 0), 0);

        return (
          <div className="w-full space-y-2">
            {/* Top Banner & Deposit Button */}
            <div className="cyber-glass-card rounded-2xl text-white p-2.5 sm:p-3.5 border border-cyan-500/25 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center space-x-2.5 shrink-0">
                <div className="bg-cyan-500/20 border border-cyan-400/35 p-1.5 sm:p-2 rounded-xl text-cyan-300 shadow-inner">
                  <CreditCard className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <h2 className="text-sm sm:text-base font-black tracking-wide text-white whitespace-nowrap">Cheque In Hand & Clearing System</h2>
              </div>

            </div>

            {/* FILTER BAR */}
            <div className="bg-[#0b2334]/85 backdrop-blur-xl text-white rounded-2xl shadow-lg border border-cyan-500/25 p-2.5 sm:p-3 space-y-2">
              {/* Row 1: Filters & Search */}
              <div className="flex items-center space-x-1.5 flex-wrap gap-y-1.5">
                <SalesCenterSearchFilter
                  value={filterEntity}
                  onChange={(val) => handleAccountFilterChange(val)}
                  options={accountFilterSearchOptions}
                  isLocked={!canViewAllUserCenters}
                  includeAllOption={canViewAllUserCenters}
                  allOptionLabel="All Sales Centers"
                  allOptionValue="All Sales Centers"
                  label="Account:"
                  placeholder="Search account / showroom..."
                  theme="dark"
                  size="xs"
                  widthClass="min-w-[150px] max-w-[210px]"
                />

                <SalesmanFilterControl color="indigo" />

                <PartyFilterControl dark={true} />

                {/* Search Box with Clear Button */}
                <div className="relative flex-1 min-w-[145px] max-w-[210px]">
                  <Search className="w-3.5 h-3.5 text-cyan-400/70 absolute left-2 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search party, cheque#, bank..."
                    className="w-full pl-7 pr-6 py-1 text-xs bg-[#061520] text-white placeholder-slate-400 border border-cyan-500/30 rounded-lg font-medium focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-all truncate"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs p-0.5 cursor-pointer font-bold"
                      title="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Reset Filters Button */}
                {(Boolean(search) || (filterEntity !== 'All Sales Centers' && filterEntity !== 'All') || filterParty !== 'All' || filterSalesman !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setFilterEntity('All Sales Centers');
                      setFilterSalesman('all');
                      setFilterParty('All');
                      setPartySearchInput('');
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 rounded-lg transition-colors cursor-pointer shadow-2xs shrink-0"
                    title="Reset search and filters to default"
                  >
                    <RotateCcw className="w-3 h-3 text-rose-300" />
                    <span>Reset</span>
                  </button>
                )}

                {/* Cheque Summary Badges */}
                <div className="ml-auto flex items-center space-x-2 bg-[#061520]/90 px-2.5 py-1 rounded-lg border border-cyan-500/25 text-xs shrink-0">
                  <span className="text-slate-400 font-bold">Total:</span>
                  <span className="text-white font-mono font-black">৳{totalChequeSum.toLocaleString('en-IN')}</span>
                  <span className="text-cyan-500/40">|</span>
                  <span className="text-cyan-300 font-bold">Pending:</span>
                  <span className="text-cyan-200 font-mono font-black">৳{pendingChequeSum.toLocaleString('en-IN')}</span>
                  <span className="text-cyan-500/40">|</span>
                  <span className="text-emerald-300 font-bold">Cleared:</span>
                  <span className="text-emerald-200 font-mono font-black">৳{depositedChequeSum.toLocaleString('en-IN')}</span>
                </div>
              </div>

              {/* Row 2: Period Selection, Quick Presets & Inline Custom Range */}
              <div className="pt-1.5 border-t border-cyan-500/20 flex items-center space-x-2 flex-wrap gap-y-1.5">
                <div className="flex items-center space-x-1.5 bg-[#061520]/80 p-1 px-2 rounded-lg border border-cyan-500/25">
                  <label className="text-slate-300 font-bold flex items-center space-x-1 shrink-0">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs">Period:</span>
                  </label>

                  {/* Quick Period Buttons */}
                  <div className="flex items-center space-x-1 flex-wrap gap-y-1">
                    {(['this_month', 'last_month', 'this_year', 'last_year', 'all', 'custom'] as const).map((presetKey) => {
                      const labels: Record<string, string> = {
                        this_month: 'This Month',
                        last_month: 'Last Month',
                        this_year: 'This Year',
                        last_year: 'Last Year',
                        all: 'All',
                        custom: 'Custom Range'
                      };
                      return (
                        <button
                          key={presetKey}
                          type="button"
                          onClick={() => handleSelectPeriodPreset(presetKey)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer border whitespace-nowrap ${
                            periodPreset === presetKey
                              ? 'bg-emerald-500/90 text-white border-emerald-300/90 shadow-[0_0_16px_rgba(16,185,129,0.50)] font-black'
                              : 'bg-[#081c28]/55 hover:bg-white/[0.10] text-slate-200 border-white/[0.12] font-bold'
                          }`}
                        >
                          {labels[presetKey]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Date Range */}
                <div className="flex items-center space-x-1.5 bg-[#061520]/80 text-white p-1 px-2.5 rounded-lg border border-cyan-500/25 text-[11px]">
                  <span className="text-slate-400 font-bold whitespace-nowrap">Date Range:</span>
                  <div className="flex items-center space-x-1">
                    <span className="font-semibold text-slate-300">From:</span>
                    <input
                      id="cheque-in-hand-from-date"
                      type="text"
                      value={startDate}
                      onClick={() => {
                        setStartDate('');
                        setPeriodPreset('custom');
                      }}
                      onFocus={() => {
                        setStartDate('');
                        setPeriodPreset('custom');
                      }}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setPeriodPreset('custom');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (startDate.trim()) setStartDate(formatDateDDMMYY(startDate));
                          const toEl = document.getElementById('cheque-in-hand-to-date') as HTMLInputElement | null;
                          toEl?.focus();
                          toEl?.select();
                        }
                      }}
                      onBlur={() => {
                        if (startDate.trim()) setStartDate(formatDateDDMMYY(startDate));
                      }}
                      placeholder="dd.mm.yy"
                      className="bg-[#081b28] text-cyan-200 font-mono font-bold py-0.5 px-1.5 border border-cyan-500/30 rounded w-[68px] text-center text-xs focus:ring-1 focus:ring-cyan-400 focus:outline-none"
                    />
                    <div className="relative flex items-center">
                      <input
                        type="date"
                        value={parseDateToISO(startDate)}
                        onChange={(e) => {
                          if (e.target.value) {
                            setStartDate(formatDateDDMMYY(e.target.value));
                            setPeriodPreset('custom');
                          }
                        }}
                        className="opacity-0 absolute inset-0 w-6 h-6 cursor-pointer z-10"
                        title="Pick From Date from calendar"
                      />
                      <Calendar className="w-3.5 h-3.5 text-cyan-400 hover:text-cyan-200 cursor-pointer" />
                    </div>
                  </div>
                  <span className="text-slate-500 font-bold">-</span>
                  <div className="flex items-center space-x-1">
                    <span className="font-semibold text-slate-300">To:</span>
                    <input
                      id="cheque-in-hand-to-date"
                      type="text"
                      value={endDate}
                      onClick={() => {
                        setEndDate('');
                        setPeriodPreset('custom');
                      }}
                      onFocus={() => {
                        setEndDate('');
                        setPeriodPreset('custom');
                      }}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        setPeriodPreset('custom');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (endDate.trim()) setEndDate(formatDateDDMMYY(endDate));
                        }
                      }}
                      onBlur={() => {
                        if (endDate.trim()) setEndDate(formatDateDDMMYY(endDate));
                      }}
                      placeholder="dd.mm.yy"
                      className="bg-[#081b28] text-cyan-200 font-mono font-bold py-0.5 px-1.5 border border-cyan-500/30 rounded w-[68px] text-center text-xs focus:ring-1 focus:ring-cyan-400 focus:outline-none"
                    />
                    <div className="relative flex items-center">
                      <input
                        type="date"
                        value={parseDateToISO(endDate)}
                        onChange={(e) => {
                          if (e.target.value) {
                            setEndDate(formatDateDDMMYY(e.target.value));
                            setPeriodPreset('custom');
                          }
                        }}
                        className="opacity-0 absolute inset-0 w-6 h-6 cursor-pointer z-10"
                        title="Pick To Date from calendar"
                      />
                      <Calendar className="w-3.5 h-3.5 text-cyan-400 hover:text-cyan-200 cursor-pointer" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* CUSTOMERS WHO PAID BY CHEQUE TABLE */}
            {(() => {
              const filteredChequeRows = allChequeList.filter((c) => {
                const isDep = isCollectionDeposited(c);
                if (chequeDepositFilter === 'pending' && isDep) return false;
                if (chequeDepositFilter === 'history' && !isDep) return false;
                if (chequeDepositFilter === 'deposited' && (!isDep || c.chequeToCash)) return false;
                if (chequeDepositFilter === 'cashed' && !c.chequeToCash) return false;

                const sTerm = search.trim().toLowerCase();
                const formattedDate = formatDateDDMMYY(c.date).toLowerCase();
                const passDateFormatted = c.passDate ? formatDateDDMMYY(c.passDate).toLowerCase() : '';
                const amountStr = c.amount ? c.amount.toString() : '';
                const formattedAmount = c.amount ? c.amount.toLocaleString('en-IN') : '';
                const matchedParty = (parties || []).find(
                  (p) => p.name.trim().toLowerCase() === (c.partyName || '').trim().toLowerCase()
                );
                const partyAddress = matchedParty?.address ? matchedParty.address.toLowerCase() : '';
                const depDetails = getCollectionBankDepositDetails(c);
                const destinationStr = c.chequeToCash
                  ? 'cash in hand encashed'
                  : isDep
                  ? `bank deposit ${depDetails.bankName || ''} ${depDetails.bankTag || ''} ${depDetails.accountName || ''} ${depDetails.accountNumber || ''}`.toLowerCase()
                  : 'pending in hand vault';

                const matchesSearch =
                  !sTerm ||
                  (c.partyName || '').toLowerCase().includes(sTerm) ||
                  (c.bankName || '').toLowerCase().includes(sTerm) ||
                  (c.chequeNo || '').toLowerCase().includes(sTerm) ||
                  (c.mrNo || '').toLowerCase().includes(sTerm) ||
                  (c.remarks || '').toLowerCase().includes(sTerm) ||
                  (c.entityName || '').toLowerCase().includes(sTerm) ||
                  partyAddress.includes(sTerm) ||
                  destinationStr.includes(sTerm) ||
                  (c.date || '').toLowerCase().includes(sTerm) ||
                  formattedDate.includes(sTerm) ||
                  (c.passDate || '').toLowerCase().includes(sTerm) ||
                  passDateFormatted.includes(sTerm) ||
                  amountStr.includes(sTerm) ||
                  formattedAmount.includes(sTerm);

                const matchesParty =
                  !filterParty || filterParty === 'All' ||
                  (c.partyName || '').toLowerCase().includes(filterParty.toLowerCase().trim());

                let matchesDate = true;
                if (startDate && endDate) {
                  const sDate = parseDateToISO(startDate);
                  const eDate = parseDateToISO(endDate);
                  if (sDate && eDate) {
                    const itemDate = parseDateToISO(c.date);
                    const depDate = parseDateToISO(c.depositDate || depDetails.depositDate || c.chequeToCashDate);
                    if (isDep) {
                      matchesDate = Boolean(
                        (itemDate && itemDate >= sDate && itemDate <= eDate) ||
                        (depDate && depDate >= sDate && depDate <= eDate)
                      );
                    } else if (chequeDepositFilter === 'pending') {
                      matchesDate = periodPreset === 'custom' ? Boolean(itemDate && itemDate >= sDate && itemDate <= eDate) : true;
                    } else {
                      matchesDate = Boolean(itemDate && itemDate >= sDate && itemDate <= eDate);
                    }
                  }
                }

                const matchesEntityAndSalesman = (!filterEntity || filterEntity === 'All' || filterEntity === 'All Sales Centers')
                  ? true
                  : collectionMatchesFilter(c);

                return matchesSearch && matchesParty && matchesDate && matchesEntityAndSalesman;
              });

              const filteredChequeSum = filteredChequeRows.reduce((sum, c) => sum + (c.amount || 0), 0);

              const sortedChequeRows = [...filteredChequeRows].sort((a, b) => {
                let comp = 0;
                if (chequeSortField === 'sl') {
                  const aNum = parseInt((a.mrNo || '').replace(/\D/g, ''), 10) || 0;
                  const bNum = parseInt((b.mrNo || '').replace(/\D/g, ''), 10) || 0;
                  comp = aNum - bNum;
                } else if (chequeSortField === 'date') {
                  const aIso = parseDateToISO(a.date) || a.date || '';
                  const bIso = parseDateToISO(b.date) || b.date || '';
                  comp = aIso.localeCompare(bIso);
                } else if (chequeSortField === 'partyName') {
                  comp = (a.partyName || '').localeCompare(b.partyName || '');
                } else if (chequeSortField === 'bankName') {
                  comp = (a.bankName || '').localeCompare(b.bankName || '');
                } else if (chequeSortField === 'chequeNo') {
                  comp = (a.chequeNo || '').localeCompare(b.chequeNo || '');
                } else if (chequeSortField === 'passDate') {
                  const aIso = parseDateToISO(a.passDate) || a.passDate || '';
                  const bIso = parseDateToISO(b.passDate) || b.passDate || '';
                  comp = aIso.localeCompare(bIso);
                } else if (chequeSortField === 'status') {
                  const aDep = isCollectionDeposited(a) ? 1 : 0;
                  const bDep = isCollectionDeposited(b) ? 1 : 0;
                  comp = aDep - bDep;
                } else if (chequeSortField === 'entityName') {
                  comp = (a.entityName || '').localeCompare(b.entityName || '');
                } else if (chequeSortField === 'remarks') {
                  comp = (a.remarks || '').localeCompare(b.remarks || '');
                } else if (chequeSortField === 'amount') {
                  comp = (a.amount || 0) - (b.amount || 0);
                }
                return chequeSortDirection === 'asc' ? comp : -comp;
              });

              return (
                <div className="cyber-glass-card rounded-2xl overflow-hidden w-full relative text-white">
                  <div className="p-3 cyber-glass-header border-b border-cyan-500/25 flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex items-center space-x-2">
                      <CreditCard className="w-4 h-4 text-cyan-300 shrink-0" />
                      <div>
                        <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                          <span>Cheque In Hand & Clearance System</span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-400/35">
                            {chequeDepositFilter === 'history' ? 'Complete Lifecycle Audit' : chequeDepositFilter === 'pending' ? 'Active In Hand' : chequeDepositFilter === 'deposited' ? 'Banked History' : chequeDepositFilter === 'cashed' ? 'Cashed to Hand' : 'All Register'}
                          </span>
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          {chequeDepositFilter === 'history'
                            ? 'Every customer cheque is identified with its exact destination (Which Bank, A/C No, or Encashed to Cash)'
                            : 'Track active physical cheques in hand and bank deposit clearances.'}
                        </p>
                      </div>
                    </div>

                    {/* Status & Cheque History Filter Tabs */}
                    <div className="flex items-center bg-[#061520]/90 p-1 rounded-xl border border-cyan-500/25 shadow-2xs flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => setChequeDepositFilter('pending')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors flex items-center space-x-1 ${
                          chequeDepositFilter === 'pending'
                            ? 'bg-[#0e2d42] text-cyan-200 border border-cyan-400/60 shadow-xs'
                            : 'text-slate-300 hover:text-white hover:bg-[#0e2a3d]'
                        }`}
                        title="Show cheques currently waiting in hand / vault"
                      >
                        <Clock className="w-3.5 h-3.5 text-cyan-300" />
                        <span>Pending In Hand ({pendingCheques.length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setChequeDepositFilter('history')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold cursor-pointer transition-colors flex items-center space-x-1 ${
                          chequeDepositFilter === 'history'
                            ? 'bg-[#0e2d42] text-amber-200 border border-amber-400/60 shadow-xs'
                            : 'text-slate-300 hover:text-white hover:bg-[#0e2a3d]'
                        }`}
                        title="Detailed history identifying where every single cheque went"
                      >
                        <History className="w-3.5 h-3.5 text-amber-300" />
                        <span>Cheque History & Whereabouts ({depositedCheques.length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setChequeDepositFilter('deposited')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors flex items-center space-x-1 ${
                          chequeDepositFilter === 'deposited'
                            ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/60 shadow-xs'
                            : 'text-slate-300 hover:text-white hover:bg-[#0e2a3d]'
                        }`}
                        title="Cheques deposited to bank accounts"
                      >
                        <Building2 className="w-3.5 h-3.5 text-emerald-300" />
                        <span>To Bank ({bankDepositedCheques.length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setChequeDepositFilter('cashed')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors flex items-center space-x-1 ${
                          chequeDepositFilter === 'cashed'
                            ? 'bg-amber-500/25 text-amber-200 border border-amber-400/60 shadow-xs'
                            : 'text-slate-300 hover:text-white hover:bg-[#0e2a3d]'
                        }`}
                        title="Cheques converted to Cash In Hand"
                      >
                        <Banknote className="w-3.5 h-3.5 text-amber-300" />
                        <span>To Cash ({cashedCheques.length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setChequeDepositFilter('all')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                          chequeDepositFilter === 'all'
                            ? 'bg-[#0e2d42] text-white border border-cyan-400/60 shadow-xs'
                            : 'text-slate-300 hover:text-white hover:bg-[#0e2a3d]'
                        }`}
                      >
                        All ({allChequeList.length})
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-200">
                      <thead>
                        <tr className="bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 font-bold uppercase text-[10px]">
                          <th
                            onClick={() => handleTableSort('sl', chequeSortField, chequeSortDirection, setChequeSortField, setChequeSortDirection)}
                            className="py-2.5 px-2.5 w-12 text-center cursor-pointer select-none hover:bg-[#103047] transition-colors"
                            title="Sort by Serial Number"
                          >
                            <span className="inline-flex items-center justify-center">
                              SL# {renderSortIndicator('sl', chequeSortField, chequeSortDirection, true)}
                            </span>
                          </th>
                          <th
                            onClick={() => handleTableSort('date', chequeSortField, chequeSortDirection, setChequeSortField, setChequeSortDirection)}
                            className="py-2.5 px-2.5 w-24 cursor-pointer select-none hover:bg-[#103047] transition-colors"
                            title="Sort by Received Date"
                          >
                            <span className="inline-flex items-center">
                              Date {renderSortIndicator('date', chequeSortField, chequeSortDirection, true)}
                            </span>
                          </th>
                          <th
                            onClick={() => handleTableSort('partyName', chequeSortField, chequeSortDirection, setChequeSortField, setChequeSortDirection)}
                            className="py-2.5 px-2.5 min-w-[160px] cursor-pointer select-none hover:bg-[#103047] transition-colors"
                            title="Sort by Party Name"
                          >
                            <span className="inline-flex items-center">
                              Party Name {renderSortIndicator('partyName', chequeSortField, chequeSortDirection, true)}
                            </span>
                          </th>
                          <th
                            onClick={() => handleTableSort('chequeNo', chequeSortField, chequeSortDirection, setChequeSortField, setChequeSortDirection)}
                            className="py-2.5 px-2.5 min-w-[140px] cursor-pointer select-none hover:bg-[#103047] transition-colors"
                            title="Sort by Cheque Info"
                          >
                            <span className="inline-flex items-center">
                              Cheque Info {renderSortIndicator('chequeNo', chequeSortField, chequeSortDirection, true)}
                            </span>
                          </th>
                          <th
                            onClick={() => handleTableSort('entityName', chequeSortField, chequeSortDirection, setChequeSortField, setChequeSortDirection)}
                            className="py-2.5 px-2.5 min-w-[130px] cursor-pointer select-none hover:bg-[#103047] transition-colors"
                            title="Sort by Assigned Center / Person"
                          >
                            <span className="inline-flex items-center">
                              Assigned Person {renderSortIndicator('entityName', chequeSortField, chequeSortDirection, true)}
                            </span>
                          </th>
                          <th
                            onClick={() => handleTableSort('amount', chequeSortField, chequeSortDirection, setChequeSortField, setChequeSortDirection)}
                            className="py-2.5 px-2.5 w-28 text-right bg-[#0e2d42] text-cyan-200 cursor-pointer select-none hover:bg-[#123852] transition-colors"
                            title="Sort by Amount"
                          >
                            <span className="inline-flex items-center justify-end">
                              Amount (Tk) {renderSortIndicator('amount', chequeSortField, chequeSortDirection, true)}
                            </span>
                          </th>
                          <th className="py-2.5 px-3 min-w-[210px] text-left bg-[#0e2d42] text-amber-300">
                            <span className="inline-flex items-center gap-1 font-black">
                              <History className="w-3.5 h-3.5 text-amber-300" />
                              <span>Where Cheque Went (Destination & Trace)</span>
                            </span>
                          </th>
                          <th className="py-2.5 px-2.5 w-40 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                        {sortedChequeRows.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-8 px-2.5 text-center text-slate-400 italic">
                              {chequeDepositFilter === 'pending'
                                ? 'No pending cheques in hand matching criteria.'
                                : chequeDepositFilter === 'deposited'
                                ? 'No deposited cheque history matching criteria.'
                                : chequeDepositFilter === 'cashed'
                                ? 'No cheques converted to cash matching criteria.'
                                : 'No customer cheque records found matching criteria.'}
                            </td>
                          </tr>
                        ) : (
                          sortedChequeRows.map((col, idx) => {
                            const matchedParty = (parties || []).find(
                              (p) => p.name.trim().toLowerCase() === (col.partyName || '').trim().toLowerCase()
                            );
                            const isDep = isCollectionDeposited(col);
                            const depInfo = getCollectionBankDepositDetails(col);

                            return (
                              <tr key={`${col.id || 'cheque'}-${idx}`} className="hover:bg-cyan-500/[0.06] transition-colors">
                                <td className="py-2 px-2.5 text-center font-mono text-slate-400 font-bold">{idx + 1}</td>
                                <td className="py-2 px-2.5 font-mono font-medium text-slate-300 whitespace-nowrap">
                                  {formatDateDDMMYY(col.date)}
                                </td>
                                <td className="py-2 px-2.5 font-extrabold text-white">
                                  <div className="flex flex-col">
                                    <span>{cleanSelectedPartyName(col.partyName || 'N/A')}</span>
                                    {matchedParty?.address && (
                                      <span className="text-[10px] text-slate-400 font-normal">📍 {matchedParty.address}</span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 px-2.5 text-slate-200 text-[11px]">
                                  <div className="flex flex-col gap-0.5">
                                    <div className="font-bold text-cyan-200 flex items-center gap-1.5 flex-wrap">
                                      <BankLogoBadge bankName={col.bankName || 'Bank Cheque'} size="sm" />
                                      {col.chequeNo && (
                                        <span className="font-mono text-[10px] bg-[#061520] text-cyan-200 px-1.5 py-0.5 rounded border border-cyan-500/30 font-bold">
                                          #{col.chequeNo}
                                        </span>
                                      )}
                                    </div>
                                    {col.passDate && (
                                      <span className="text-[10px] text-emerald-300 font-mono font-bold flex items-center gap-1">
                                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                                        <span>Pass Date: {formatDateDDMMYY(col.passDate)}</span>
                                      </span>
                                    )}
                                    {col.mrNo && (
                                      <span className="text-[10px] text-slate-400 font-mono">MR#: {col.mrNo}</span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 px-2.5 font-semibold text-slate-300">
                                  <div className="flex flex-col">
                                    <span>{col.marketingPerson || col.entityName || matchedParty?.salespersonName || '-'}</span>
                                    {col.branchName && (
                                      <span className="text-[10px] text-slate-400 font-normal">🏛️ {col.branchName}</span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 px-2.5 text-right font-mono text-sm font-black text-cyan-200 bg-[#0c2638]/55 whitespace-nowrap">
                                  ৳{col.amount.toLocaleString('en-IN')}
                                </td>

                                {/* WHERE CHEQUE WENT */}
                                <td className="py-2 px-3 text-left">
                                  {isDep ? (
                                    col.chequeToCash ? (
                                      <div className="flex flex-col gap-0.5">
                                        <span className="inline-flex items-center space-x-1 text-amber-200 bg-amber-500/20 border border-amber-400/35 px-2 py-0.5 rounded text-[10px] font-extrabold w-fit shadow-2xs">
                                          <Banknote className="w-3 h-3 text-amber-300 shrink-0" />
                                          <span>Encashed to Cash In Hand</span>
                                        </span>
                                        <span className="text-[10px] text-slate-300 font-mono">
                                          📅 Date: <strong className="text-white">{col.chequeToCashDate || '-'}</strong>
                                        </span>
                                        {col.chequeToCashRemarks && (
                                          <span className="text-[9px] text-slate-400 italic max-w-[220px] truncate" title={col.chequeToCashRemarks}>
                                            {col.chequeToCashRemarks}
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      (() => {
                                        const bankTitle = depInfo.bankName || depInfo.bankTag || 'Bank Account';
                                        const acctStr = depInfo.accountName || depInfo.accountNumber ? `${depInfo.accountName || ''} ${depInfo.accountNumber || ''}`.trim() : '';
                                        return (
                                          <div className="flex flex-col gap-0.5">
                                            <span className="inline-flex items-center space-x-1.5 text-cyan-200 bg-cyan-500/20 border border-cyan-400/35 px-2 py-0.5 rounded text-[10px] font-extrabold w-fit shadow-2xs">
                                              <BankLogoBadge bankName={bankTitle} size="sm" />
                                              <span>Deposited to bank</span>
                                            </span>
                                            {acctStr && (
                                              <span className="text-[10px] text-slate-300 font-mono">
                                                A/C: <strong className="text-white">{acctStr}</strong>
                                              </span>
                                            )}
                                            <span className="text-[10px] text-slate-300 font-mono">
                                              📅 Date: <strong className="text-white">{depInfo.depositDate || col.depositDate || '-'}</strong>
                                              {col.passDate && (
                                                <span className="ml-1 text-emerald-300 font-bold">• Cleared ✓</span>
                                              )}
                                            </span>
                                            {depInfo.voucherNo && (
                                              <span className="text-[9px] text-slate-400 font-mono">
                                                Slip / Voucher: {depInfo.voucherNo}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })()
                                    )
                                  ) : (
                                    <div className="flex flex-col gap-0.5">
                                      <span className="inline-flex items-center space-x-1 text-cyan-200 bg-cyan-500/15 border border-cyan-400/35 px-2 py-0.5 rounded text-[10px] font-extrabold w-fit">
                                        <Clock className="w-3 h-3 text-cyan-300 shrink-0" />
                                        <span>Pending In Hand / Vault</span>
                                      </span>
                                      <span className="text-[10px] text-slate-400">
                                        Ready for Bank Deposit or Encash
                                      </span>
                                    </div>
                                  )}
                                </td>

                                <td className="py-2 px-2.5 text-center">
                                  <div className="flex items-center justify-center space-x-1">
                                    {!isDep ? (
                                      <div className="inline-flex items-center space-x-1">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            openDepositModal('cheque');
                                            handleSelectCollectionForDeposit(col);
                                          }}
                                          className="px-2.5 py-1 bg-indigo-500/25 hover:bg-indigo-500/40 text-indigo-200 border border-indigo-400/40 font-extrabold text-[11px] rounded shadow-2xs cursor-pointer transition-colors whitespace-nowrap"
                                          title="Deposit Cheque to Bank"
                                        >
                                          To Bank
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setChequeActionModal({
                                              isOpen: true,
                                              collection: col,
                                              actionType: 'cash',
                                              cashDate: formatDateDDMMYY(new Date().toISOString().split('T')[0]),
                                              remarks: `Cheque #${col.chequeNo || ''} (${col.bankName || ''}) encashed to Cash In Hand`
                                            });
                                          }}
                                          className="px-2.5 py-1 bg-amber-500/25 hover:bg-amber-500/40 text-amber-200 border border-amber-400/40 font-extrabold text-[11px] rounded shadow-2xs cursor-pointer transition-colors whitespace-nowrap"
                                          title="Cheque to Cash (Move to Cash In Hand)"
                                        >
                                          To Cash
                                        </button>
                                      </div>
                                    ) : col.chequeToCash ? (
                                      <span className="text-[10px] font-bold px-2 py-1 border rounded whitespace-nowrap inline-flex items-center space-x-1 text-amber-200 bg-amber-500/20 border-amber-400/35">
                                        <CheckCircle2 className="w-3 h-3 shrink-0 text-amber-300" />
                                        <span>Cashed ✓</span>
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-bold px-2 py-1 border rounded whitespace-nowrap inline-flex items-center space-x-1 text-emerald-200 bg-emerald-500/20 border-emerald-400/35">
                                        <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-300" />
                                        <span>Banked ✓</span>
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => setEditingCollection(col)}
                                      className="p-1 hover:bg-cyan-500/20 text-cyan-300 rounded transition-colors cursor-pointer"
                                      title="Edit Collection MR"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteCollection(col.id, col.partyName || col.mrNo, col.amount)}
                                      className="p-1 hover:bg-rose-500/20 text-rose-300 rounded transition-colors cursor-pointer"
                                      title="Delete Collection MR"
                                    >
                                      <Trash2 className="w-4 h-4" />
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
              );
            })()}

            <div className="cyber-glass-card rounded-2xl p-3 flex flex-wrap items-center justify-end gap-2 no-print">
              <button
                type="button"
                onClick={() => {
                  if (xlsxFileInputRef.current) {
                    xlsxFileInputRef.current.value = '';
                    xlsxFileInputRef.current.click();
                  }
                }}
                className="px-3 py-1.5 bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 font-bold text-xs rounded-lg shadow-sm flex items-center space-x-1.5 cursor-pointer transition-all border border-teal-400/40"
                title="Import cheques from Excel (.xlsx) file"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-teal-300" />
                <span>Import Cheques</span>
              </button>

              <button
                type="button"
                onClick={() => handleExportCollectionsXlsx('cheque')}
                className="px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 font-bold text-xs rounded-lg shadow-sm flex items-center space-x-1.5 cursor-pointer transition-all border border-indigo-400/40"
                title="Export Cheque List to Excel (.xlsx) file"
              >
                <Download className="w-3.5 h-3.5 text-indigo-300" />
                <span>Export Cheques</span>
              </button>

              <button
                type="button"
                onClick={() => openDepositModal('cheque')}
                className="px-3.5 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs rounded-lg shadow-sm flex items-center space-x-1.5 cursor-pointer transition-all"
              >
                <Plus className="w-3.5 h-3.5 text-slate-950" />
                <span>Deposit Cheque to Bank</span>
              </button>

              <button
                type="button"
                onClick={() => setShowBankManagerModal(true)}
                className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 font-bold text-xs rounded-lg shadow-sm flex items-center space-x-1.5 cursor-pointer transition-all border border-purple-400/40"
                title="Directly manage Bank & Account Directory without exiting or leaving the page"
              >
                <Landmark className="w-3.5 h-3.5 text-purple-300" />
                <span>Bank & Account Directory</span>
              </button>
            </div>
          </div>
        );
      })()}

      {/* 5. BANK DEPOSIT MODAL / POPUP */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 w-full max-w-4xl overflow-hidden my-8 text-white">
            <div className="cyber-glass-header border-b border-cyan-500/25 text-white p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2.5">
                <Landmark className="w-6 h-6 text-cyan-300 shrink-0" />
                <div>
                  <h3 className="text-base font-black text-white">
                    Bank Deposit System - {depositModalType === 'cash' ? (depositModalMode === 'multi' ? 'Multi-Party Cash Deposit' : 'Deposit Cash') : 'Deposit Cheque'}
                  </h3>
                  <p className="text-xs text-cyan-200/80">
                    {depositModalType === 'cash'
                      ? depositModalMode === 'multi'
                        ? 'Batch multiple customer cash collections into one deposit transaction.'
                        : 'Deposit customer cash collection into your designated bank account.'
                      : 'Select a customer cheque in hand or enter cheque deposit details.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {depositModalType === 'cash' && (
                  <div className="bg-[#061520]/90 p-1 rounded-xl border border-cyan-500/25 flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => setDepositModalMode('single')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                        depositModalMode === 'single'
                          ? 'bg-[#0e2d42] text-cyan-200 border border-cyan-400/60 shadow-sm'
                          : 'text-slate-300 hover:text-white hover:bg-[#0e2a3d]'
                      }`}
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Single Party</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDepositModalMode('multi')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                        depositModalMode === 'multi'
                          ? 'bg-amber-400 text-slate-950 font-black shadow-sm'
                          : 'text-slate-300 hover:text-white hover:bg-[#0e2a3d]'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Multi-Party Deposit</span>
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowBankManagerModal(true)}
                  className="px-2.5 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 font-bold text-xs rounded-xl shadow-xs flex items-center space-x-1.5 cursor-pointer transition-all border border-purple-400/40 shrink-0 whitespace-nowrap"
                  title="Directly manage Bank & Account Directory without leaving"
                >
                  <Landmark className="w-3.5 h-3.5 text-purple-300" />
                  <span>Bank Directory</span>
                </button>

                <button
                  type="button"
                  onClick={closeDepositModal}
                  className="text-slate-300 hover:text-white bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 p-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              {/* Customer Collections Paid Table (Only shown for Cheque Deposits) */}
              {depositModalType === 'cheque' && (
                <div className="cyber-glass-subcard p-4 rounded-xl border border-cyan-500/25 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-cyan-200 uppercase tracking-wide flex items-center space-x-1.5">
                      <CreditCard className="w-4 h-4 text-cyan-300" />
                      <span>All Customers Who Paid You by Cheque (Cheque In Hand):</span>
                    </h4>
                    <span className="text-[11px] font-bold text-cyan-200 bg-cyan-500/20 border border-cyan-400/35 px-2.5 py-0.5 rounded-full">
                      Click "Deposit This Cheque" to select
                    </span>
                  </div>

                  <div className="overflow-x-auto max-h-48 border border-cyan-500/25 rounded-lg bg-[#061520]/80">
                    <table className="w-full text-left text-xs text-slate-200">
                      <thead className="bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 font-bold uppercase text-[10px] sticky top-0">
                        <tr>
                          <th className="p-2.5">Customer Name</th>
                          <th className="p-2.5">MR Date / #</th>
                          <th className="p-2.5">Cheque # & Bank</th>
                          <th className="p-2.5 text-right">Amount (Tk)</th>
                          <th className="p-2.5 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cyan-500/15">
                        {collections.filter((c) => isCheque(c) && !isCollectionDeposited(c)).length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-4 text-center text-slate-400 italic">
                              No pending customer cheque collections in hand.
                            </td>
                          </tr>
                        ) : (
                          collections
                            .filter((c) => isCheque(c) && !isCollectionDeposited(c))
                            .map((col, idx) => {
                              const matchedParty = (parties || []).find(
                                (p) => p.name.trim().toLowerCase() === (col.partyName || '').trim().toLowerCase()
                              );
                              return (
                                <tr key={`${col.id || 'cheque'}-${idx}`} className="hover:bg-cyan-500/[0.06] transition-colors">
                                  <td className="p-2.5 font-extrabold text-white">
                                    {col.partyName || 'N/A'}
                                    {matchedParty?.address && (
                                      <span className="block text-[10px] text-cyan-300/80 font-normal">📍 {matchedParty.address}</span>
                                    )}
                                  </td>
                                  <td className="p-2.5 font-mono text-[11px] text-slate-300">
                                    {formatDateDDMMYY(col.date)} <span className="text-cyan-300 font-bold">({col.mrNo})</span>
                                  </td>
                                  <td className="p-2.5 font-mono text-[11px] text-cyan-200">
                                    <span className="font-bold">{col.chequeNo || '-'}</span>
                                    {col.bankName && <BankLogoBadge bankName={col.bankName} size="sm" className="mt-1" />}
                                  </td>
                                  <td className="p-2.5 text-right font-black text-cyan-200 font-mono text-xs">
                                    ৳{col.amount.toLocaleString('en-IN')}
                                  </td>
                                  <td className="p-2.5 text-center">
                                    {(() => {
                                      const selectedEntryIdx = depPartyRows.findIndex((r) => r.selectedCollectionId === col.id);
                                      if (selectedEntryIdx !== -1) {
                                        return (
                                          <button
                                            type="button"
                                            onClick={() => handleSelectCollectionForDeposit(col)}
                                            className="px-2.5 py-1 bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-200 border border-emerald-400/50 font-extrabold text-[10px] rounded shadow-2xs cursor-pointer transition-colors inline-flex items-center space-x-1"
                                            title="Click to re-select or update details"
                                          >
                                            <CheckCircle2 className="w-3 h-3 text-emerald-300" />
                                            <span>Selected</span>
                                          </button>
                                        );
                                      }
                                      return (
                                        <button
                                          type="button"
                                          onClick={() => handleSelectCollectionForDeposit(col)}
                                          className="px-2.5 py-1 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-[10px] rounded shadow-2xs cursor-pointer transition-colors"
                                        >
                                          Deposit This Cheque
                                        </button>
                                      );
                                    })()}
                                  </td>
                                </tr>
                              );
                            })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Bank Deposit Form */}
              <form
                onSubmit={(e) => {
                  if (handleSaveBankDeposit(e, true)) {
                    closeDepositModal();
                  }
                }}
                className="space-y-4"
              >
                {/* Deposit Date & Target Bank & Account Comboboxes */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="text-xs font-bold text-slate-300 mb-1 flex items-center justify-between">
                      <span>Deposit Date * (dd.mm.yy):</span>
                      <span className="text-cyan-200 font-mono font-extrabold bg-cyan-500/20 px-1.5 py-0.5 rounded text-[11px] border border-cyan-400/35">
                        {formatDateDDMMYY(depDate) || 'dd.mm.yy'}
                      </span>
                    </label>
                    <DateInputWithPicker
                      value={depDate}
                      onChange={setDepDate}
                      valueFormat="ddmmyy"
                      theme="dark"
                      placeholder="dd.mm.yy"
                      required
                      inputClassName="p-2.5 text-xs font-bold text-white"
                      title="Pick Deposit Date (dd.mm.yy)"
                    />
                  </div>

                  <div>
                    <SearchableCombobox
                      options={bankList}
                      value={depBankName || ''}
                      hideInputBadge={true}
                      onChange={(val) => {
                        const isHO = val.trim().toLowerCase() === 'h/o' || val.trim().toLowerCase() === 'h.o' || val.trim().toLowerCase() === 'head office';
                        setDepBankName(val);
                        if (isHO) {
                          setDepAccountName('Head Office');
                          setDepDisplayTag('H/O');
                        } else {
                          if (val && depAccountName) {
                            setDepDisplayTag(generateDisplayTag(val, depAccountName));
                          } else if (val) {
                            const bCode = getBankShortCode ? getBankShortCode(val) : val;
                            setDepDisplayTag(bCode);
                          } else {
                            setDepDisplayTag('');
                          }
                        }
                      }}
                      getShortCode={getBankShortCode}
                      placeholder="Search Bank (e.g. PBL, DBBL, H/O)..."
                      label="Target Bank Name"
                      required
                      accentColor="purple"
                      entityLabel="Bank"
                      onAddNew={(newBank) => {
                        handleAddBank(newBank);
                        const isHO = newBank.trim().toLowerCase() === 'h/o' || newBank.trim().toLowerCase() === 'h.o' || newBank.trim().toLowerCase() === 'head office';
                        setDepBankName(newBank);
                        if (isHO) {
                          setDepAccountName('Head Office');
                          setDepDisplayTag('H/O');
                        } else {
                          if (depAccountName) {
                            setDepDisplayTag(generateDisplayTag(newBank, depAccountName));
                          }
                        }
                        showNotify('success', `Added "${newBank}" to Bank Directory!`);
                      }}
                      onDeleteItem={(delBank) => {
                        handleDeleteBank(delBank);
                        if (depBankName === delBank) {
                          setDepBankName('');
                          setDepDisplayTag('');
                        }
                        showNotify('success', `Removed "${delBank}" from Bank Directory.`);
                      }}
                      onEditItem={(oldBank, newBank) => {
                        handleEditBank(oldBank, newBank);
                        if (depBankName === oldBank) {
                          const isHO = newBank.trim().toLowerCase() === 'h/o' || newBank.trim().toLowerCase() === 'h.o' || newBank.trim().toLowerCase() === 'head office';
                          setDepBankName(newBank);
                          if (isHO) {
                            setDepAccountName('Head Office');
                            setDepDisplayTag('H/O');
                          } else {
                            if (depAccountName) {
                              setDepDisplayTag(generateDisplayTag(newBank, depAccountName));
                            }
                          }
                        }
                        showNotify('success', `Renamed "${oldBank}" to "${newBank}".`);
                      }}
                      onOpenManager={() => setShowBankManagerModal(true)}
                    />
                  </div>

                  <div>
                    <SearchableCombobox
                      options={accountList}
                      value={depAccountName || ''}
                      onChange={(val) => {
                        const isHO = depBankName.trim().toLowerCase() === 'h/o' || depBankName.trim().toLowerCase() === 'h.o' || depBankName.trim().toLowerCase() === 'head office';
                        if (isHO) {
                          setDepAccountName('Head Office');
                          setDepDisplayTag('H/O');
                        } else {
                          setDepAccountName(val);
                          if (depBankName && val) {
                            setDepDisplayTag(generateDisplayTag(depBankName, val));
                          } else if (val) {
                            const aCode = getAccountShortCode ? getAccountShortCode(val) : val;
                            setDepDisplayTag(aCode);
                          } else {
                            setDepDisplayTag('');
                          }
                        }
                      }}
                      getShortCode={getAccountShortCode}
                      placeholder={
                        depBankName.trim().toLowerCase() === 'h/o' || depBankName.trim().toLowerCase() === 'h.o' || depBankName.trim().toLowerCase() === 'head office'
                          ? 'Not required for H/O'
                          : 'Search Account (e.g. P.E, Z.E)...'
                      }
                      label="Account Name"
                      required={
                        !(depBankName.trim().toLowerCase() === 'h/o' || depBankName.trim().toLowerCase() === 'h.o' || depBankName.trim().toLowerCase() === 'head office')
                      }
                      accentColor="purple"
                      entityLabel="Account"
                      onAddNew={(newAccount) => {
                        handleAddAccount(newAccount);
                        setDepAccountName(newAccount);
                        if (depBankName) {
                          setDepDisplayTag(generateDisplayTag(depBankName, newAccount));
                        }
                        showNotify('success', `Added "${newAccount}" to Account Directory!`);
                      }}
                      onDeleteItem={(delAccount) => {
                        handleDeleteAccount(delAccount);
                        if (depAccountName === delAccount) {
                          setDepAccountName('');
                          setDepDisplayTag('');
                        }
                        showNotify('success', `Removed "${delAccount}" from Account Directory.`);
                      }}
                      onEditItem={(oldAccount, newAccount) => {
                        handleEditAccount(oldAccount, newAccount);
                        if (depAccountName === oldAccount) {
                          setDepAccountName(newAccount);
                          if (depBankName) {
                            setDepDisplayTag(generateDisplayTag(depBankName, newAccount));
                          }
                        }
                        showNotify('success', `Renamed "${oldAccount}" to "${newAccount}".`);
                      }}
                      onOpenManager={() => setShowBankManagerModal(true)}
                    />
                  </div>
                </div>

                {/* Display Tag, Remarks & Slip Image */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">Display Tag (Short Code):</label>
                    <input
                      type="text"
                      value={depDisplayTag || (depBankName && depAccountName ? generateDisplayTag(depBankName, depAccountName) : '')}
                      onChange={(e) => setDepDisplayTag(e.target.value)}
                      placeholder="e.g. PBL(P.E)"
                      className="w-full p-2.5 border border-purple-400/40 bg-[#061520] rounded-lg text-xs font-mono font-black text-purple-200 placeholder-slate-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">Remarks / Deposit Slip #:</label>
                    <input
                      type="text"
                      value={depRemarks}
                      onChange={(e) => setDepRemarks(e.target.value)}
                      placeholder="Slip # / Notes..."
                      className="w-full p-2.5 border border-cyan-500/30 rounded-lg text-xs bg-[#061520] text-white placeholder-slate-400"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-300">Deposit Slip Image:</label>
                      {depSlipImage && (
                        <span className="text-[10px] font-bold text-emerald-200 bg-emerald-500/20 border border-emerald-400/35 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" /> Attached
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleSlipImageUpload}
                        className="w-full text-xs text-slate-300 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border file:border-purple-400/35 file:text-xs file:font-semibold file:bg-purple-500/20 file:text-purple-200 hover:file:bg-purple-500/30 cursor-pointer"
                      />
                      {depSlipImage && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setPreviewImageModal(depSlipImage)}
                            className="p-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 rounded border border-purple-400/35 text-xs font-bold flex items-center gap-1 cursor-pointer"
                            title="Preview uploaded deposit slip"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDepSlipImage('')}
                            className="p-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 rounded border border-rose-400/35 text-xs font-bold flex items-center gap-1 cursor-pointer"
                            title="Remove deposit slip"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <datalist id="party-suggestions-list">
                  {partiesWithCollectedMoney.map((p, pIdx) => (
                    <option key={`${p.name}-${pIdx}`} value={p.name}>
                      {p.name} (Collected: ৳{p.totalCollected.toLocaleString('en-IN')})
                    </option>
                  ))}
                </datalist>

                {/* 1. MULTI-PARTY DEPOSIT MODE */}
                {depositModalType === 'cash' && depositModalMode === 'multi' && (
                  <div className="mt-2 pt-4 border-t border-cyan-500/20 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-black text-cyan-200 uppercase tracking-wide flex items-center gap-1.5">
                          <span>Party Cash Collection Entries</span>
                          <span className="text-[10px] font-normal normal-case text-purple-200 bg-purple-500/20 px-2 py-0.5 rounded-full border border-purple-400/35">
                            Multi-party deposit supported
                          </span>
                        </h4>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={handleAddPartyRow}
                          className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-400/35 font-extrabold text-xs rounded-lg flex items-center space-x-1 cursor-pointer transition-colors shadow-2xs"
                        >
                          <Plus className="w-3.5 h-3.5 text-purple-300" />
                          <span>Add Another Party</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {depPartyRows.map((row, idx) => (
                        <div key={row.id} className="p-3 cyber-glass-subcard rounded-xl border border-cyan-500/25 space-y-2">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-extrabold text-cyan-200">
                              Party Entry #{idx + 1}
                            </span>
                            {depPartyRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemovePartyRow(row.id)}
                                className="text-xs text-rose-300 hover:text-rose-200 font-bold flex items-center space-x-1 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Remove Entry</span>
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                            <div>
                              <label className="text-[10px] font-bold text-slate-300 block mb-0.5">
                                Party Name *
                              </label>
                              <input
                                type="text"
                                value={row.customerName}
                                onChange={(e) => {
                                  const name = e.target.value;
                                  handleUpdatePartyRow(row.id, 'customerName', name);
                                  const match = parties.find(p => p.name.trim().toLowerCase() === name.trim().toLowerCase());
                                  if (match) {
                                    if (match.address) handleUpdatePartyRow(row.id, 'customerAddress', match.address);
                                    if (match.salespersonName || match.salesmanCode) handleUpdatePartyRow(row.id, 'marketingPerson', match.salespersonName || match.salesmanCode || 'Sanjoy Chowhan');
                                  }
                                }}
                                placeholder="e.g. Sarker Electric"
                                list="party-suggestions-list"
                                required
                                className="w-full p-2 border border-cyan-500/30 rounded-lg text-xs font-bold text-white bg-[#061520] placeholder-slate-400"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-slate-300 block mb-0.5">
                                Party Address
                              </label>
                              <input
                                type="text"
                                value={row.customerAddress}
                                onChange={(e) => handleUpdatePartyRow(row.id, 'customerAddress', e.target.value)}
                                placeholder="e.g. Bhuapur"
                                className="w-full p-2 border border-cyan-500/30 rounded-lg text-xs text-white bg-[#061520] placeholder-slate-400"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-slate-300 block mb-0.5">
                                Marketing Rep
                              </label>
                              <input
                                type="text"
                                value={row.marketingPerson}
                                onChange={(e) => handleUpdatePartyRow(row.id, 'marketingPerson', e.target.value)}
                                placeholder="e.g. Sanjoy Chowhan"
                                className="w-full p-2 border border-cyan-500/30 rounded-lg text-xs text-white bg-[#061520] placeholder-slate-400"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-slate-300 block mb-0.5">
                                Amount (Tk) *
                              </label>
                              <input
                                type="number"
                                step="any"
                                value={row.amount}
                                onChange={(e) => handleUpdatePartyRow(row.id, 'amount', e.target.value)}
                                placeholder="0.00"
                                required
                                className="w-full p-2 border border-cyan-500/35 rounded-lg text-xs font-black text-cyan-200 bg-[#061520] font-mono placeholder-slate-400"
                              />
                            </div>
                          </div>

                          {/* Linked Collection Status Badge */}
                          {row.selectedCollectionId && (() => {
                            const linkedCol = collections.find((c) => c.id === row.selectedCollectionId);
                            return (
                              <div className="flex items-center justify-between bg-emerald-500/15 border border-emerald-400/35 px-2.5 py-1 rounded-lg text-[11px] text-emerald-200 font-medium">
                                <div className="flex items-center space-x-1.5 truncate">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                                  <span>
                                    Linked to MR: <strong className="font-mono font-bold text-white">{linkedCol?.mrNo || 'N/A'}</strong> ({formatDateDDMMYY(linkedCol?.date)}) — ৳{(linkedCol?.amount || 0).toLocaleString('en-IN')}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleUpdatePartyRow(row.id, 'selectedCollectionId', '')}
                                  className="text-[10px] text-emerald-200 hover:text-rose-300 font-bold underline ml-2 shrink-0 cursor-pointer"
                                >
                                  Unlink
                                </button>
                              </div>
                            );
                          })()}

                          {/* Quick Selection for Undeposited MRs of this Party */}
                          {!row.selectedCollectionId && row.customerName.trim() && (() => {
                            const undepositedCols = collections.filter(
                              (c) =>
                                (!c.paymentType || c.paymentType === 'cash') &&
                                (c.partyName || '').trim().toLowerCase() === row.customerName.trim().toLowerCase() &&
                                !isCollectionDeposited(c)
                            );
                            if (undepositedCols.length === 0) return null;
                            return (
                              <div className="bg-amber-500/15 border border-amber-400/35 rounded-lg p-2 space-y-1">
                                <span className="text-[10px] font-extrabold text-amber-200 block">
                                  💡 Link to specific Money Receipt for {row.customerName}:
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {undepositedCols.map((c) => (
                                    <button
                                      key={c.id}
                                      type="button"
                                      onClick={() => {
                                        handleUpdatePartyRow(row.id, 'selectedCollectionId', c.id);
                                        handleUpdatePartyRow(row.id, 'amount', String(c.amount));
                                        if (c.marketingPerson) handleUpdatePartyRow(row.id, 'marketingPerson', c.marketingPerson);
                                        const matchedP = (parties || []).find(
                                          (p) => p.name.trim().toLowerCase() === (c.partyName || '').trim().toLowerCase()
                                        );
                                        if (matchedP?.address) handleUpdatePartyRow(row.id, 'customerAddress', matchedP.address);
                                      }}
                                      className="px-2 py-0.5 bg-[#081b28] hover:bg-amber-500/20 border border-amber-400/40 rounded text-[10px] font-mono text-amber-200 font-bold cursor-pointer transition-colors shadow-2xs"
                                    >
                                      MR #{c.mrNo || 'N/A'} ({formatDateDDMMYY(c.date)}) • ৳{c.amount.toLocaleString('en-IN')}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between p-3 bg-purple-500/15 rounded-xl border border-purple-400/35">
                      <span className="text-xs font-bold text-purple-200">Total Deposit Sum Across Parties:</span>
                      <span className="text-sm font-black text-white font-mono">
                        ৳{depPartyRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                )}

                {/* 2. SINGLE PARTY DEPOSIT MODE */}
                {depositModalType === 'cash' && depositModalMode === 'single' && (
                  <div className="mt-2 pt-4 border-t border-cyan-500/20 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-black text-cyan-200 uppercase tracking-wide flex items-center space-x-1.5">
                        <UserCheck className="w-4 h-4 text-cyan-300" />
                        <span>Party Deposit Details</span>
                      </h4>
                    </div>

                    <div className="p-4 cyber-glass-subcard rounded-xl border border-cyan-500/25 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-slate-300 block mb-1">
                            Party Name *
                          </label>
                          <input
                            type="text"
                            value={depCustomerName}
                            onChange={(e) => {
                              const name = e.target.value;
                              setDepCustomerName(name);
                              const match = parties.find(p => p.name.trim().toLowerCase() === name.trim().toLowerCase());
                              if (match) {
                                if (match.address) setDepCustomerAddress(match.address);
                                if (match.salespersonName || match.salesmanCode) setDepMarketingPerson(match.salespersonName || match.salesmanCode || 'Sanjoy Chowhan');
                              }
                              setDepPartyRows(prev => [{
                                ...prev[0],
                                customerName: name,
                                customerAddress: match?.address || prev[0]?.customerAddress || 'Madhupur',
                                marketingPerson: match?.salespersonName || match?.salesmanCode || prev[0]?.marketingPerson || 'Sanjoy Chowhan'
                              }]);
                            }}
                            placeholder="e.g. Sarker Electric"
                            list="party-suggestions-list"
                            required
                            className="w-full p-2.5 border border-cyan-500/30 rounded-lg text-xs font-bold text-white bg-[#061520] placeholder-slate-400"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-300 block mb-1">
                            Party Address
                          </label>
                          <input
                            type="text"
                            value={depCustomerAddress}
                            onChange={(e) => {
                              setDepCustomerAddress(e.target.value);
                              setDepPartyRows(prev => [{ ...prev[0], customerAddress: e.target.value }]);
                            }}
                            placeholder="e.g. Bhuapur"
                            className="w-full p-2.5 border border-cyan-500/30 rounded-lg text-xs text-white bg-[#061520] placeholder-slate-400"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-300 block mb-1">
                            Marketing Rep
                          </label>
                          <input
                            type="text"
                            value={depMarketingPerson}
                            onChange={(e) => {
                              setDepMarketingPerson(e.target.value);
                              setDepPartyRows(prev => [{ ...prev[0], marketingPerson: e.target.value }]);
                            }}
                            placeholder="e.g. Sanjoy Chowhan"
                            className="w-full p-2.5 border border-cyan-500/30 rounded-lg text-xs text-white bg-[#061520] placeholder-slate-400"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-300 block mb-1">
                            Deposit Amount (Tk) *
                          </label>
                          <input
                            type="number"
                            step="any"
                            value={depAmount}
                            onChange={(e) => {
                              setDepAmount(e.target.value);
                              setDepPartyRows(prev => [{ ...prev[0], amount: e.target.value }]);
                            }}
                            placeholder="0.00"
                            required
                            className="w-full p-2.5 border border-cyan-500/35 rounded-lg text-xs font-black text-cyan-200 bg-[#061520] font-mono placeholder-slate-400"
                          />
                        </div>
                      </div>

                      {/* Linked Collection Status Badge */}
                      {depSelectedCollectionId && (() => {
                        const linkedCol = collections.find((c) => c.id === depSelectedCollectionId);
                        return (
                          <div className="flex items-center justify-between bg-emerald-500/15 border border-emerald-400/35 px-3 py-1.5 rounded-lg text-xs text-emerald-200 font-medium">
                            <div className="flex items-center space-x-2 truncate">
                              <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                              <span>
                                Linked to Money Receipt: <strong className="font-mono font-bold text-white">{linkedCol?.mrNo || 'N/A'}</strong> ({formatDateDDMMYY(linkedCol?.date)}) — ৳{(linkedCol?.amount || 0).toLocaleString('en-IN')}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setDepSelectedCollectionId('');
                                setDepPartyRows(prev => [{ ...prev[0], selectedCollectionId: undefined }]);
                              }}
                              className="text-xs text-emerald-200 hover:text-rose-300 font-bold underline ml-2 shrink-0 cursor-pointer"
                            >
                              Unlink
                            </button>
                          </div>
                        );
                      })()}

                      {/* Quick Links for MRs of this Party */}
                      {!depSelectedCollectionId && depCustomerName.trim() && (() => {
                        const undepositedCols = collections.filter(
                          (c) =>
                            (!c.paymentType || c.paymentType === 'cash') &&
                            (c.partyName || '').trim().toLowerCase() === depCustomerName.trim().toLowerCase() &&
                            !isCollectionDeposited(c)
                        );
                        if (undepositedCols.length === 0) return null;
                        return (
                          <div className="bg-amber-500/15 border border-amber-400/35 rounded-lg p-2.5 space-y-1.5">
                            <span className="text-xs font-extrabold text-amber-200 block">
                              💡 Link to specific Money Receipt for {depCustomerName}:
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {undepositedCols.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => handleSelectCollectionForDeposit(c)}
                                  className="px-2.5 py-1 bg-[#081b28] hover:bg-amber-500/20 border border-amber-400/40 rounded text-xs font-mono text-amber-200 font-bold cursor-pointer transition-colors shadow-2xs"
                                >
                                  MR #{c.mrNo || 'N/A'} ({formatDateDDMMYY(c.date)}) • ৳{c.amount.toLocaleString('en-IN')}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* 3. CHEQUE DEPOSIT DETAILS FORM */}
                {depositModalType === 'cheque' && (
                  <div className="mt-2 pt-4 border-t border-cyan-500/20 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-black text-cyan-200 uppercase tracking-wide flex items-center space-x-1.5">
                        <CreditCard className="w-4 h-4 text-cyan-300" />
                        <span>Cheque Deposit Details</span>
                      </h4>

                      {/* Cheque Action Switch */}
                      {depSelectedCollectionId && (() => {
                        const linkedCol = collections.find((c) => c.id === depSelectedCollectionId);
                        if (!linkedCol) return null;
                        return (
                          <div className="flex items-center space-x-2">
                            <span className="text-[11px] font-bold text-slate-400">Deposit Mode:</span>
                            <span className="px-2 py-0.5 rounded text-[11px] font-black bg-indigo-500/20 text-indigo-200 border border-indigo-400/35">
                              🏦 Cheque to Bank
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setIsDepositModalOpen(false);
                                setChequeActionModal({
                                  isOpen: true,
                                  collection: linkedCol,
                                  actionType: 'cash',
                                  cashDate: formatDateDDMMYY(new Date().toISOString().split('T')[0]),
                                  remarks: `Cheque #${linkedCol.chequeNo || ''} (${linkedCol.bankName || ''}) encashed to Cash In Hand`
                                });
                              }}
                              className="px-2.5 py-0.5 rounded text-[11px] font-black bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-200 border border-emerald-400/45 shadow-2xs cursor-pointer transition-colors flex items-center space-x-1"
                              title="Switch to Cheque to Cash (Move to Cash In Hand)"
                            >
                              <Banknote className="w-3.5 h-3.5 text-emerald-300" />
                              <span>Switch to Cheque to Cash</span>
                            </button>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="p-4 cyber-glass-subcard rounded-xl border border-cyan-500/25 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-slate-300 block mb-1">
                            Customer Name *
                          </label>
                          <input
                            type="text"
                            value={depCustomerName}
                            onChange={(e) => {
                              const name = e.target.value;
                              setDepCustomerName(name);
                              const match = parties.find(p => p.name.trim().toLowerCase() === name.trim().toLowerCase());
                              if (match) {
                                if (match.address) setDepCustomerAddress(match.address);
                                if (match.salespersonName || match.salesmanCode) setDepMarketingPerson(match.salespersonName || match.salesmanCode || 'Sanjoy Chowhan');
                              }
                              setDepPartyRows(prev => [{
                                ...prev[0],
                                customerName: name,
                                customerAddress: match?.address || prev[0]?.customerAddress || 'Madhupur',
                                marketingPerson: match?.salespersonName || match?.salesmanCode || prev[0]?.marketingPerson || 'Sanjoy Chowhan'
                              }]);
                            }}
                            placeholder="e.g. Sarker Electric"
                            list="party-suggestions-list"
                            required
                            className="w-full p-2.5 border border-cyan-500/30 rounded-lg text-xs font-bold text-white bg-[#061520] placeholder-slate-400"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-300 block mb-1">
                            Customer Address
                          </label>
                          <input
                            type="text"
                            value={depCustomerAddress}
                            onChange={(e) => {
                              setDepCustomerAddress(e.target.value);
                              setDepPartyRows(prev => [{ ...prev[0], customerAddress: e.target.value }]);
                            }}
                            placeholder="e.g. Bhuapur"
                            className="w-full p-2.5 border border-cyan-500/30 rounded-lg text-xs text-white bg-[#061520] placeholder-slate-400"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-300 block mb-1">
                            Marketing Rep
                          </label>
                          <input
                            type="text"
                            value={depMarketingPerson}
                            onChange={(e) => {
                              setDepMarketingPerson(e.target.value);
                              setDepPartyRows(prev => [{ ...prev[0], marketingPerson: e.target.value }]);
                            }}
                            placeholder="e.g. Sanjoy Chowhan"
                            className="w-full p-2.5 border border-cyan-500/30 rounded-lg text-xs text-white bg-[#061520] placeholder-slate-400"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-300 block mb-1">
                            Cheque Amount (Tk) *
                          </label>
                          <input
                            type="number"
                            step="any"
                            value={depAmount}
                            onChange={(e) => {
                              setDepAmount(e.target.value);
                              setDepPartyRows(prev => [{ ...prev[0], amount: e.target.value }]);
                            }}
                            placeholder="0.00"
                            required
                            className="w-full p-2.5 border border-cyan-500/35 rounded-lg text-xs font-black text-cyan-200 bg-[#061520] font-mono placeholder-slate-400"
                          />
                        </div>
                      </div>

                      {/* Linked Collection Status Badge */}
                      {depSelectedCollectionId && (() => {
                        const linkedCol = collections.find((c) => c.id === depSelectedCollectionId);
                        return (
                          <div className="flex items-center justify-between bg-emerald-500/15 border border-emerald-400/35 px-3 py-1.5 rounded-lg text-xs text-emerald-200 font-medium">
                            <div className="flex items-center space-x-2 truncate">
                              <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                              <span>
                                Linked to Cheque MR: <strong className="font-mono font-bold text-white">{linkedCol?.mrNo || 'N/A'}</strong> (Cheque: {linkedCol?.chequeNo || 'N/A'}) — ৳{(linkedCol?.amount || 0).toLocaleString('en-IN')}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setDepSelectedCollectionId('');
                                setDepPartyRows(prev => [{ ...prev[0], selectedCollectionId: undefined }]);
                              }}
                              className="text-xs text-emerald-200 hover:text-rose-300 font-bold underline ml-2 shrink-0 cursor-pointer"
                            >
                              Unlink
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                <div className="pt-3 flex items-center justify-end space-x-3 border-t border-cyan-500/20">
                  <button
                    type="button"
                    onClick={closeDepositModal}
                    className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 font-bold text-xs rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      if (handleSaveBankDeposit(e, false)) {
                        closeDepositModal();
                      }
                    }}
                    className="px-4 py-2 bg-indigo-500/25 hover:bg-indigo-500/35 text-indigo-200 border border-indigo-400/40 font-bold text-xs rounded-lg cursor-pointer"
                  >
                    Save Deposit Only
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs rounded-lg cursor-pointer flex items-center space-x-1.5 shadow"
                  >
                    <Send className="w-3.5 h-3.5 text-slate-950" />
                    <span>Save & Send Mail</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* EDIT BANK DEPOSIT MODAL (SINGLE & MULTI-PARTY BATCH)     */}
      {/* Filtered strictly to parties that have collected money    */}
      {/* ========================================================= */}
      {editingBatchDeposits && editingBatchDeposits.length > 0 && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-4xl w-full my-auto overflow-hidden border border-cyan-400/35 text-white animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="cyber-glass-header border-b border-cyan-500/25 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-500/20 text-purple-300 rounded-lg border border-purple-400/35">
                  <Landmark className="w-5 h-5 text-cyan-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-white tracking-wide">Edit Bank Deposit</h3>
                    <span className="text-[10px] uppercase font-extrabold bg-purple-500/25 text-purple-200 px-2 py-0.5 rounded-full border border-purple-400/40">
                      {batchEditPartyRows.length > 1 ? `${batchEditPartyRows.length} Parties Batch` : 'Single Party'}
                    </span>
                  </div>
                  <p className="text-xs text-cyan-200/80">
                    Modify bank deposit, linked party, and collection allocations.
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="hidden sm:block text-right">
                  <div className="text-[10px] uppercase tracking-wider text-cyan-300 font-bold">Total Deposit</div>
                  <div className="text-sm font-black text-emerald-300">
                    ৳{batchEditPartyRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0).toLocaleString('en-IN')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBankManagerModal(true)}
                  className="px-2.5 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 font-bold text-xs rounded-lg shadow-xs flex items-center space-x-1.5 cursor-pointer transition-all border border-purple-400/40 shrink-0 whitespace-nowrap"
                  title="Directly access Bank & Account Directory without leaving"
                >
                  <Landmark className="w-3.5 h-3.5 text-purple-300" />
                  <span>Bank Directory</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditingBatchDeposits(null)}
                  className="p-1.5 rounded-lg bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Datalist for party search in Edit Bank Deposit - Shows ONLY parties with collected money */}
            <datalist id="party-suggestions-list-edit">
              {partiesWithCollectedMoney.map((p, pIdx) => (
                <option key={`${p.name}-${pIdx}`} value={p.name}>
                  {p.name} (Collected: ৳{p.totalCollected.toLocaleString('en-IN')})
                </option>
              ))}
            </datalist>

            {/* Modal Body */}
            <form onSubmit={handleSaveBatchChanges} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto text-xs">
              {/* Bank & Date Settings */}
              <div className="cyber-glass-subcard p-3.5 rounded-xl border border-cyan-500/25 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <SearchableCombobox
                      options={bankList}
                      value={batchEditBankName || ''}
                      onChange={(val) => {
                        const isHO = val.trim().toLowerCase() === 'h/o' || val.trim().toLowerCase() === 'h.o' || val.trim().toLowerCase() === 'head office';
                        setBatchEditBankName(val);
                        if (isHO) {
                          setBatchEditAccountName('Head Office');
                          setBatchEditDisplayTag('H/O');
                        } else {
                          setBatchEditDisplayTag(generateDisplayTag(val, batchEditAccountName || accountList[0] || 'Padma Enterprise'));
                        }
                      }}
                      getShortCode={getBankShortCode}
                      placeholder="Select or search Target Bank..."
                      label="Target Bank Name"
                      required
                      accentColor="purple"
                      entityLabel="Bank"
                      onAddNew={(newBank) => {
                        handleAddBank(newBank);
                        setBatchEditBankName(newBank);
                        setBatchEditDisplayTag(generateDisplayTag(newBank, batchEditAccountName || accountList[0] || 'Padma Enterprise'));
                        showNotify('success', `Added "${newBank}" to Bank Directory!`);
                      }}
                      onDeleteItem={(delBank) => {
                        handleDeleteBank(delBank);
                        if (batchEditBankName === delBank) setBatchEditBankName('');
                      }}
                      onEditItem={(oldBank, newBank) => {
                        handleEditBank(oldBank, newBank);
                        if (batchEditBankName === oldBank) setBatchEditBankName(newBank);
                      }}
                      onOpenManager={() => setShowBankManagerModal(true)}
                    />
                  </div>

                  <div>
                    <SearchableCombobox
                      options={accountList}
                      value={batchEditAccountName || ''}
                      onChange={(val) => {
                        setBatchEditAccountName(val);
                        setBatchEditDisplayTag(generateDisplayTag(batchEditBankName || bankList[0] || 'Pubali Bank PLC', val));
                      }}
                      getShortCode={getAccountShortCode}
                      placeholder="Select or search Target Account..."
                      label="Target Account Name"
                      required
                      accentColor="purple"
                      entityLabel="Account"
                      onAddNew={(newAccount) => {
                        handleAddAccount(newAccount);
                        setBatchEditAccountName(newAccount);
                        setBatchEditDisplayTag(generateDisplayTag(batchEditBankName || bankList[0] || 'Pubali Bank PLC', newAccount));
                        showNotify('success', `Added "${newAccount}" to Account Directory!`);
                      }}
                      onDeleteItem={(delAccount) => {
                        handleDeleteAccount(delAccount);
                        if (batchEditAccountName === delAccount) setBatchEditAccountName('');
                      }}
                      onEditItem={(oldAccount, newAccount) => {
                        handleEditAccount(oldAccount, newAccount);
                        if (batchEditAccountName === oldAccount) setBatchEditAccountName(newAccount);
                      }}
                      onOpenManager={() => setShowBankManagerModal(true)}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">Deposit Date (dd.mm.yy):</label>
                    <DateInputWithPicker
                      value={batchEditDate}
                      onChange={setBatchEditDate}
                      valueFormat="ddmmyy"
                      theme="dark"
                      placeholder="dd.mm.yy"
                      required
                      inputClassName="p-2.5 text-xs font-bold text-white"
                      title="Pick Deposit Date (dd.mm.yy)"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">Display Tag (Short Code):</label>
                    <input
                      type="text"
                      value={batchEditDisplayTag}
                      onChange={(e) => setBatchEditDisplayTag(e.target.value)}
                      placeholder="e.g. PBL (P.E)"
                      className="w-full p-2 border border-purple-400/40 bg-[#061520] rounded-lg text-xs font-mono font-bold text-purple-200 placeholder-slate-400"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">Remarks / Note:</label>
                    <input
                      type="text"
                      value={batchEditRemarks}
                      onChange={(e) => setBatchEditRemarks(e.target.value)}
                      placeholder="Optional notes..."
                      className="w-full p-2 border border-cyan-500/30 bg-[#061520] rounded-lg text-xs text-white placeholder-slate-400"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-300">Deposit Slip Image:</label>
                      {batchEditSlipImage && (
                        <span className="text-[10px] font-bold text-emerald-200 bg-emerald-500/20 border border-emerald-400/35 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" /> Attached
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleBatchEditSlipUpload}
                        className="w-full text-xs text-slate-300 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border file:border-purple-400/35 file:text-xs file:font-semibold file:bg-purple-500/20 file:text-purple-200 hover:file:bg-purple-500/30 cursor-pointer"
                      />
                      {batchEditSlipImage && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setPreviewImageModal(batchEditSlipImage)}
                            className="p-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 rounded border border-purple-400/35 text-xs font-bold flex items-center gap-1 cursor-pointer"
                            title="Preview attached deposit slip"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setBatchEditSlipImage(undefined)}
                            className="p-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 rounded border border-rose-400/35 text-xs font-bold flex items-center gap-1 cursor-pointer"
                            title="Remove deposit slip"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer / Party Information Banner */}
              <div className="bg-emerald-500/15 border border-emerald-400/35 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                  <span className="text-xs font-bold text-emerald-200">
                    Customer Search List is filtered to show only parties with collected money ({partiesWithCollectedMoney.length} parties available).
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setBatchEditShowCashInHand(!batchEditShowCashInHand)}
                  className="text-xs font-bold text-emerald-200 hover:text-white underline cursor-pointer shrink-0 ml-2"
                >
                  {batchEditShowCashInHand ? 'Hide Collected Money Quick Pick' : 'Show Collected Money Quick Pick'}
                </button>
              </div>

              {/* Quick Pick Collected Money Table (if toggled) */}
              {batchEditShowCashInHand && (
                <div className="cyber-glass-subcard p-3 rounded-xl border border-cyan-500/25 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 text-xs">
                      Available Cash/Cheque Collections In-Hand (Click to Link into Deposit):
                    </span>
                    <input
                      type="text"
                      value={batchEditCashSearch}
                      onChange={(e) => setBatchEditCashSearch(e.target.value)}
                      placeholder="Filter collections..."
                      className="p-1 px-2 border border-cyan-500/30 rounded text-[11px] bg-[#061520] text-white placeholder-slate-400 w-48"
                    />
                  </div>

                  <div className="max-h-40 overflow-y-auto border border-cyan-500/25 rounded-lg bg-[#061520]/80">
                    <table className="w-full text-[11px] text-left text-slate-200">
                      <thead className="bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 font-bold sticky top-0">
                        <tr>
                          <th className="p-2">Party / Customer</th>
                          <th className="p-2">MR No</th>
                          <th className="p-2">Date</th>
                          <th className="p-2 text-right">Amount</th>
                          <th className="p-2 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cyan-500/15">
                        {collections
                          .filter((c) => {
                            if (c.isDeposited && !editingBatchDeposits.some((d) => d.collectionMrId === c.id)) return false;
                            if (!batchEditCashSearch.trim()) return true;
                            const t = batchEditCashSearch.toLowerCase();
                            return (
                              (c.partyName || '').toLowerCase().includes(t) ||
                              (c.mrNo || '').toLowerCase().includes(t) ||
                              (c.marketingPerson || '').toLowerCase().includes(t)
                            );
                          })
                          .slice(0, 30)
                          .map((col, idx) => {
                            const isAlreadyLinked = batchEditPartyRows.some((r) => r.selectedCollectionId === col.id);
                            return (
                              <tr key={`${col.id || 'col'}-${idx}`} className={isAlreadyLinked ? 'bg-purple-500/15 font-semibold' : 'hover:bg-cyan-500/[0.06]'}>
                                <td className="p-2 font-bold text-white">{col.partyName}</td>
                                <td className="p-2 font-mono text-slate-300">{col.mrNo}</td>
                                <td className="p-2 text-slate-300">{formatDateDDMMYY(col.date)}</td>
                                <td className="p-2 text-right font-extrabold text-emerald-300">
                                  ৳{Number(col.amount).toLocaleString('en-IN')}
                                </td>
                                <td className="p-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const matchedParty = parties.find(
                                        (p) => p.name.trim().toLowerCase() === (col.partyName || '').trim().toLowerCase()
                                      );
                                      const newRow = {
                                        id: `row-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                                        customerName: col.partyName || '',
                                        customerAddress: matchedParty?.address || 'Madhupur',
                                        marketingPerson: matchedParty?.salespersonName || col.marketingPerson || 'Sanjoy Chowhan',
                                        amount: String(col.amount),
                                        selectedCollectionId: col.id
                                      };
                                      setBatchEditPartyRows((prev) => {
                                        if (prev.length === 1 && !prev[0].customerName.trim()) {
                                          return [newRow];
                                        }
                                        return [...prev, newRow];
                                      });
                                    }}
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                                      isAlreadyLinked
                                        ? 'bg-purple-500/25 text-purple-200 border border-purple-400/35'
                                        : 'bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-200 border border-emerald-400/40'
                                    }`}
                                  >
                                    {isAlreadyLinked ? 'Linked' : '+ Link Collection'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Party Entries Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-cyan-200 uppercase tracking-wide">
                    Party Deposit Allocation ({batchEditPartyRows.length} Rows)
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      setBatchEditPartyRows((prev) => [
                        ...prev,
                        {
                          id: `row-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                          customerName: '',
                          customerAddress: 'Madhupur',
                          marketingPerson: 'Sanjoy Chowhan',
                          amount: '',
                          selectedCollectionId: undefined
                        }
                      ]);
                    }}
                    className="px-2.5 py-1 bg-purple-500/25 hover:bg-purple-500/40 text-purple-200 border border-purple-400/40 font-bold text-xs rounded-lg flex items-center space-x-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Party Row</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {batchEditPartyRows.map((row, idx) => {
                    return (
                      <div
                        key={row.id}
                        className="p-3 cyber-glass-subcard border border-cyan-500/25 rounded-xl shadow-xs space-y-2 relative"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                          <div className="sm:col-span-1 text-center font-bold text-slate-400 text-xs">
                            #{idx + 1}
                          </div>

                          {/* Party Name */}
                          <div className="sm:col-span-4">
                            <label className="text-[10px] font-bold text-slate-300 block mb-0.5">
                              Party Name * (Collected Money Only)
                            </label>
                            <input
                              type="text"
                              list="party-suggestions-list-edit"
                              value={row.customerName}
                              onChange={(e) => {
                                const val = e.target.value;
                                const matched = partiesWithCollectedMoney.find(
                                  (p) => p.name.trim().toLowerCase() === val.trim().toLowerCase()
                                );
                                setBatchEditPartyRows((prev) =>
                                  prev.map((r) =>
                                    r.id === row.id
                                      ? {
                                          ...r,
                                          customerName: val,
                                          customerAddress: matched?.address || r.customerAddress || 'Madhupur',
                                          marketingPerson: matched?.marketingPerson || r.marketingPerson || 'Sanjoy Chowhan'
                                        }
                                      : r
                                  )
                                );
                              }}
                              placeholder="Type or select party..."
                              className="w-full p-2 border border-cyan-500/30 rounded-lg text-xs font-bold text-white bg-[#061520] placeholder-slate-400"
                              required
                            />
                          </div>

                          {/* Address */}
                          <div className="sm:col-span-2">
                            <label className="text-[10px] font-bold text-slate-300 block mb-0.5">Address</label>
                            <input
                              type="text"
                              value={row.customerAddress}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBatchEditPartyRows((prev) =>
                                  prev.map((r) => (r.id === row.id ? { ...r, customerAddress: val } : r))
                                );
                              }}
                              placeholder="Address..."
                              className="w-full p-2 border border-cyan-500/30 rounded-lg text-xs bg-[#061520] text-white placeholder-slate-400"
                            />
                          </div>

                          {/* Marketing Person */}
                          <div className="sm:col-span-2">
                            <label className="text-[10px] font-bold text-slate-300 block mb-0.5">Marketing Person</label>
                            <input
                              type="text"
                              value={row.marketingPerson}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBatchEditPartyRows((prev) =>
                                  prev.map((r) => (r.id === row.id ? { ...r, marketingPerson: val } : r))
                                );
                              }}
                              placeholder="Marketing person..."
                              className="w-full p-2 border border-cyan-500/30 rounded-lg text-xs bg-[#061520] text-white placeholder-slate-400"
                            />
                          </div>

                          {/* Deposit Amount */}
                          <div className="sm:col-span-2">
                            <label className="text-[10px] font-bold text-slate-300 block mb-0.5">Amount (Tk) *</label>
                            <input
                              type="number"
                              step="any"
                              value={row.amount}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBatchEditPartyRows((prev) =>
                                  prev.map((r) => (r.id === row.id ? { ...r, amount: val } : r))
                                );
                              }}
                              placeholder="0.00"
                              className="w-full p-2 border border-emerald-400/40 bg-[#061520] rounded-lg text-xs font-extrabold text-emerald-200 font-mono placeholder-slate-400"
                              required
                            />
                          </div>

                          {/* Remove Action */}
                          <div className="sm:col-span-1 text-center pt-3 sm:pt-0">
                            {batchEditPartyRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setBatchEditPartyRows((prev) => prev.filter((r) => r.id !== row.id));
                                }}
                                className="p-1.5 text-rose-300 hover:text-rose-200 hover:bg-rose-500/20 rounded-lg transition-colors cursor-pointer"
                                title="Remove row"
                              >
                                <Trash2 className="w-4 h-4 mx-auto" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Linked Collection Status */}
                        {row.selectedCollectionId && (
                          <div className="flex items-center space-x-2 text-[11px] text-purple-200 bg-purple-500/15 px-2.5 py-1 rounded border border-purple-400/35">
                            <Check className="w-3.5 h-3.5 text-purple-300" />
                            <span>Linked with Money Receipt #{collections.find((c) => c.id === row.selectedCollectionId)?.mrNo || row.selectedCollectionId}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setBatchEditPartyRows((prev) =>
                                  prev.map((r) => (r.id === row.id ? { ...r, selectedCollectionId: undefined } : r))
                                );
                              }}
                              className="font-bold text-rose-300 hover:underline cursor-pointer ml-auto"
                            >
                              Unlink
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modal Footer Controls */}
              <div className="pt-4 flex flex-wrap items-center justify-between gap-3 border-t border-cyan-500/20 bg-[#071824]/90 -mx-5 -mb-4 px-5 pb-4 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    const confirmDel = window.confirm('Are you sure you want to delete this entire bank deposit? It will be moved to the Trash Bin.');
                    if (confirmDel) {
                      handleDeleteEntireBatch();
                    }
                  }}
                  className="px-3.5 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/40 font-bold text-xs rounded-lg flex items-center space-x-1.5 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-300" />
                  <span>Delete Deposit (Move to Trash)</span>
                </button>

                <div className="flex items-center space-x-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setEditingBatchDeposits(null)}
                    className="px-4 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 font-bold text-xs rounded-lg cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs rounded-lg flex items-center space-x-1.5 shadow-md cursor-pointer transition-colors"
                  >
                    <Save className="w-3.5 h-3.5 text-slate-950" />
                    <span>Save & Update Deposit</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. EXPENSE DIRECTORY LOG */}
      {activeTab === 'directory' && (
        <div className="space-y-3 font-sans">
          {/* Header Banner */}
          <div className="cyber-glass-card rounded-2xl text-white p-3 sm:p-4 border border-cyan-500/25 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-cyan-500/20 text-cyan-300 rounded-xl border border-cyan-400/35">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-wide">Expense Directory & Transaction Log</h3>
                <p className="text-xs text-slate-400">Expense Vouchers, Petty Cash & Ledger Archive ({filteredExpenses.length} Records)</p>
              </div>
            </div>

          </div>

          {/* Filter Bar */}
          <div className="bg-[#0b2334]/85 backdrop-blur-xl text-white rounded-2xl shadow-lg border border-cyan-500/25 p-2.5 sm:p-3 space-y-2">
            {/* Row 1: Account, Category, Search, Reset, Total Filtered */}
            <div className="flex items-center space-x-2 flex-wrap gap-y-2">
              <SalesCenterSearchFilter
                value={filterEntity}
                onChange={(val) => handleAccountFilterChange(val)}
                options={accountFilterSearchOptions}
                isLocked={!canViewAllUserCenters}
                includeAllOption={canViewAllUserCenters}
                allOptionLabel="All Accounts / Sales Centers"
                allOptionValue="All Sales Centers"
                label="Account:"
                placeholder="Search account / showroom..."
                theme="dark"
                size="sm"
                widthClass="min-w-[170px] max-w-[240px]"
              />

              {/* Expense Category Filter */}
              <div className="flex items-center space-x-1.5 bg-[#061520]/80 px-2.5 py-1 rounded-lg border border-cyan-500/25">
                <Tag className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">
                  Category:
                </label>
                <select
                  value={filterExpenseCategory}
                  onChange={(e) => setFilterExpenseCategory(e.target.value)}
                  className="bg-[#081b28] text-emerald-200 font-bold border border-cyan-500/30 rounded px-2 py-0.5 text-xs focus:ring-1 focus:ring-cyan-400 focus:outline-none cursor-pointer max-w-[200px] truncate"
                >
                  <option value="all">All Categories ({expenseCategories.length})</option>
                  {expenseCategories.map((cat) => (
                    <option key={cat.serial + '-' + cat.name} value={cat.name}>
                      {cat.serial}. {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search Box */}
              <div className="relative flex-1 min-w-[170px] max-w-xs">
                <Search className="w-3.5 h-3.5 text-cyan-400/70 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search head, remarks, amount..."
                  className="w-full pl-8 pr-7 py-1 text-xs bg-[#061520] text-white placeholder-slate-400 border border-cyan-500/30 rounded-lg font-medium focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-all"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs p-0.5 cursor-pointer font-bold"
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Reset Filters */}
              {(Boolean(search) || filterEntity !== initialDefaultEntity || filterExpenseCategory !== 'all' || periodPreset !== 'this_month') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setFilterEntity('Madhupur Sales Center');
                    setFilterExpenseCategory('all');
                    handleSelectPeriodPreset('this_month');
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 rounded-lg transition-colors cursor-pointer shadow-2xs"
                  title="Reset search and filters to default"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-rose-300" />
                  <span>Reset</span>
                </button>
              )}

              {/* Filtered Total Badge */}
              <div className="ml-auto flex items-center space-x-1.5 bg-[#061520]/90 px-3 py-1 rounded-lg border border-cyan-500/25 text-xs">
                <span className="text-slate-400 font-bold">Total Filtered:</span>
                <span className="text-rose-300 font-extrabold text-sm font-mono">
                  ৳{filteredExpenses.reduce((a, b) => a + b.amount, 0).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Row 2: Period Selection, Quick Presets & Inline Custom Range */}
            <div className="pt-1.5 border-t border-cyan-500/20 flex items-center space-x-2 flex-wrap gap-y-1.5">
              <div className="flex items-center space-x-1.5 bg-[#061520]/80 p-1 px-2 rounded-lg border border-cyan-500/25">
                <label className="text-slate-300 font-bold flex items-center space-x-1">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-xs">Period:</span>
                </label>

                {/* Quick Period Buttons */}
                <div className="flex items-center space-x-1 flex-wrap gap-y-1">
                  {(['this_month', 'last_month', 'this_year', 'last_year', 'all', 'custom'] as const).map((presetKey) => {
                    const labels: Record<string, string> = {
                      this_month: 'This Month',
                      last_month: 'Last Month',
                      this_year: 'This Year',
                      last_year: 'Last Year',
                      all: 'All',
                      custom: 'Custom Range'
                    };
                    return (
                      <button
                        key={presetKey}
                        type="button"
                        onClick={() => handleSelectPeriodPreset(presetKey)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer border whitespace-nowrap ${
                          periodPreset === presetKey
                            ? 'bg-emerald-500/90 text-white border-emerald-300/90 shadow-[0_0_16px_rgba(16,185,129,0.50)] font-black'
                            : 'bg-[#081c28]/55 hover:bg-white/[0.10] text-slate-200 border-white/[0.12] font-bold'
                        }`}
                      >
                        {labels[presetKey]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Date Range Picker */}
              <div className="flex items-center space-x-1 bg-[#061520]/80 p-1 px-2 rounded-lg border border-cyan-500/25">
                <span className="text-[11px] font-bold text-slate-300">From:</span>
                <input
                  type="text"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPeriodPreset('custom');
                  }}
                  onBlur={() => {
                    if (startDate.trim()) setStartDate(formatDateDDMMYY(startDate));
                  }}
                  placeholder="dd.mm.yy"
                  className="bg-[#081b28] text-amber-200 font-mono font-bold border border-cyan-500/30 rounded px-1.5 py-0.5 text-xs text-center w-20 focus:ring-1 focus:ring-cyan-400"
                />
                <div className="relative flex items-center">
                  <input
                    type="date"
                    value={parseDateToISO(startDate)}
                    onChange={(e) => {
                      if (e.target.value) {
                        setStartDate(formatDateDDMMYY(e.target.value));
                        setPeriodPreset('custom');
                      }
                    }}
                    className="opacity-0 absolute inset-0 w-6 h-6 cursor-pointer z-10"
                    title="Pick Start Date"
                  />
                  <Calendar className="w-3.5 h-3.5 text-cyan-400 hover:text-cyan-200 cursor-pointer" />
                </div>

                <span className="text-[11px] font-bold text-slate-300 ml-1">To:</span>
                <input
                  type="text"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPeriodPreset('custom');
                  }}
                  onBlur={() => {
                    if (endDate.trim()) setEndDate(formatDateDDMMYY(endDate));
                  }}
                  placeholder="dd.mm.yy"
                  className="bg-[#081b28] text-amber-200 font-mono font-bold border border-cyan-500/30 rounded px-1.5 py-0.5 text-xs text-center w-20 focus:ring-1 focus:ring-cyan-400"
                />
                <div className="relative flex items-center">
                  <input
                    type="date"
                    value={parseDateToISO(endDate)}
                    onChange={(e) => {
                      if (e.target.value) {
                        setEndDate(formatDateDDMMYY(e.target.value));
                        setPeriodPreset('custom');
                      }
                    }}
                    className="opacity-0 absolute inset-0 w-6 h-6 cursor-pointer z-10"
                    title="Pick End Date"
                  />
                  <Calendar className="w-3.5 h-3.5 text-cyan-400 hover:text-cyan-200 cursor-pointer" />
                </div>
              </div>
            </div>
          </div>

          <div className="cyber-glass-card rounded-2xl overflow-hidden text-white">
{directoryView === 'expenses' ? (
              <table className="w-full text-left text-xs text-slate-200">
                <thead>
                  <tr className="bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 font-bold uppercase text-[10px]">
                    <th className="py-2 px-2.5 w-12 text-center">SL#</th>
                    <th className="py-2 px-2.5 w-28">Date</th>
                    <th className="py-2 px-2.5 min-w-[160px]">Account / Entity</th>
                    <th className="py-2 px-2.5 min-w-[180px]">Expense Head / Category</th>
                    <th className="py-2 px-2.5 w-28 text-right bg-[#0e2d42] text-rose-200">Amount (Tk)</th>
                    <th className="py-2 px-2.5 min-w-[140px]">Period / Area</th>
                    <th className="py-2 px-2.5">Remarks</th>
                    <th className="py-2 px-2.5 w-16 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                  {filteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-5 px-2.5 text-center text-slate-400 italic">
                        No expenses recorded yet. Click "+ Create New Bill" or "Ex. Entry (Quick)" above to add expenses.
                      </td>
                    </tr>
                  ) : (
                    filteredExpenses.map((exp, idx) => (
                      <tr key={exp.id} className="hover:bg-cyan-500/[0.06] transition-colors">
                        <td className="py-1.5 px-2.5 text-center font-mono text-slate-400 font-bold">{idx + 1}</td>
                        <td className="py-1.5 px-2.5 font-mono font-medium text-slate-300">{formatDateDDMMYY(exp.date)}</td>
                        <td className="py-1.5 px-2.5 font-bold text-white">
                          <span className={`inline-block px-2 py-0.5 rounded text-[11px] border ${
                            exp.entityName === 'Madhupur Sales Center'
                              ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/35 font-extrabold'
                              : 'bg-purple-500/20 text-purple-200 border-purple-400/35 font-extrabold'
                          }`}>
                            {exp.entityName}
                          </span>
                        </td>
                        <td className="py-1.5 px-2.5 font-bold text-white">
                          <div>{exp.expenseHead}</div>
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-extrabold text-rose-300 bg-[#0c2638]/55 font-mono">
                          ৳{exp.amount.toLocaleString('en-IN')}
                        </td>
                        <td className="py-1.5 px-2.5 text-slate-300 text-[11px]">
                          {exp.monthRange || 'N/A'} {exp.area ? `(${exp.area})` : ''}
                        </td>
                        <td className="py-1.5 px-2.5 text-slate-400 italic text-[11px]">{exp.remarks || '-'}</td>
                        <td className="py-1.5 px-2.5 text-center">
                          <div className="flex items-center justify-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => handleStartEditExpense(exp)}
                              className="p-1 hover:bg-cyan-500/20 text-cyan-300 rounded transition-colors cursor-pointer"
                              title="Edit Expense Voucher"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteExpense(exp.id, exp.expenseHead, exp.amount)}
                              className="p-1 hover:bg-rose-500/20 text-rose-300 rounded transition-colors cursor-pointer"
                              title="Delete Expense"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              /* COLLECTIONS MR TABLE WITH PARTY NAME, PAYMENT METHOD, BANK, CHEQUE NO, PASS DATE */
              <table className="w-full text-left text-xs text-slate-200">
                <thead>
                  <tr className="bg-[#0c2638] text-cyan-200 border-b border-cyan-500/30 font-bold uppercase text-[10px]">
                    <th className="py-2 px-2.5 w-12 text-center">SL#</th>
                    <th className="py-2 px-2.5 w-28">Date</th>
                    <th className="py-2 px-2.5 min-w-[160px]">Party Name</th>
                    <th className="py-2 px-2.5 min-w-[150px]">Assigned Account</th>
                    <th className="py-2 px-2.5 w-28 text-center">Type</th>
                    <th className="py-2 px-2.5 min-w-[180px]">Bank / Cheque Details</th>
                    <th className="py-2 px-2.5 w-28 text-right bg-[#0e2d42] text-cyan-200">Amount (Tk)</th>
                    <th className="py-2 px-2.5">Remarks</th>
                    <th className="py-2 px-2.5 w-16 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-500/15 bg-[#071824]/60 text-slate-200">
                  {filteredCollections.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-5 px-2.5 text-center text-slate-400 italic">
                        No collection records found. Click "Add Collection Entry" above to add new party collections.
                      </td>
                    </tr>
                  ) : (
                    filteredCollections.map((col, idx) => (
                      <tr key={`${col.id || 'col'}-${idx}`} className="hover:bg-cyan-500/[0.06] transition-colors">
                        <td className="py-1.5 px-2.5 text-center font-mono text-slate-400 font-bold">{idx + 1}</td>
                        <td className="py-1.5 px-2.5 font-mono font-medium text-slate-300">{formatDateDDMMYY(col.date)}</td>
                        <td className="py-1.5 px-2.5 font-extrabold text-white">
                          {col.partyName || <span className="text-slate-400 font-normal italic">N/A</span>}
                        </td>
                        <td className="py-1.5 px-2.5 font-semibold text-slate-300">
                          {col.marketingPerson || col.salespersonName || (parties || []).find((p) => p.name.trim().toLowerCase() === (col.partyName || '').trim().toLowerCase())?.salespersonName || (!col.entityName?.toLowerCase().includes('center') && !col.entityName?.toLowerCase().includes('store') ? col.entityName : '') || '-'}
                        </td>
                        <td className="py-1.5 px-2.5 text-center">
                          {col.paymentType === 'cheque' ? (
                            <span className="inline-flex items-center space-x-1 bg-indigo-500/20 text-indigo-200 px-2 py-0.5 rounded text-[10px] font-extrabold border border-indigo-400/35">
                              <CreditCard className="w-3 h-3 text-indigo-300" />
                              <span>Cheque</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 bg-emerald-500/20 text-emerald-200 px-2 py-0.5 rounded text-[10px] font-extrabold border border-emerald-400/35">
                              <Wallet className="w-3 h-3 text-emerald-300" />
                              <span>Cash</span>
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 px-2.5 text-[11px]">
                          {col.paymentType === 'cheque' ? (
                            <div className="space-y-0.5">
                              <div className="font-bold text-cyan-200 flex items-center space-x-1">
                                <BankLogoBadge bankName={col.bankName || 'Bank N/A'} size="sm" />
                              </div>
                              <div className="text-slate-300 font-mono text-[10px]">
                                CQ#: <span className="font-bold text-white">{col.chequeNo || 'N/A'}</span>
                              </div>
                              {col.passDate && (
                                <div className="text-slate-400 text-[10px]">
                                  Pass Date: <span className="font-medium text-emerald-300">{formatDateDDMMYY(col.passDate)}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Cash Transaction</span>
                          )}
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-extrabold text-cyan-200 bg-[#0c2638]/55 font-mono text-sm">
                          ৳{col.amount.toLocaleString('en-IN')}
                        </td>
                        <td className="py-1.5 px-2.5 text-slate-400 italic text-[11px]">{col.remarks || '-'}</td>
                        <td className="py-1.5 px-2.5 text-center">
                          <div className="flex items-center justify-center space-x-1">
                            <button
                              type="button"
                              onClick={() => setEditingCollection(col)}
                              className="p-1 hover:bg-cyan-500/20 text-cyan-300 rounded transition-colors cursor-pointer"
                              title="Edit Collection MR"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCollection(col.id, col.partyName || col.mrNo, col.amount)}
                              className="p-1 hover:bg-rose-500/20 text-rose-300 rounded transition-colors cursor-pointer"
                              title="Delete Collection"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

          <div className="cyber-glass-card rounded-2xl p-3 flex flex-wrap items-center justify-end gap-2 no-print">
            <button
              type="button"
              onClick={() => setShowProcedureModal(true)}
              className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/40 text-xs font-black rounded-lg shadow-md transition-all flex items-center space-x-1.5 cursor-pointer active:scale-95 mr-auto"
              title="Show where expense money comes from and the complete funding/settlement procedure"
            >
              <BookOpen className="w-4 h-4 text-amber-300" />
              <span>Expense Procedure & Origin</span>
            </button>
            <button
              type="button"
              onClick={() => setShowDirectoryPrintPreviewModal(true)}
              className="px-3.5 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-400/40 text-xs font-bold rounded-lg shadow-md transition-all flex items-center space-x-1.5 cursor-pointer active:scale-95"
              title="Print Expense Directory & Transaction Log with active filters"
            >
              <Printer className="w-4 h-4" />
              <span>Print Directory</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('entry')}
              className="px-3.5 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-black rounded-lg shadow-md transition-all flex items-center space-x-1.5 cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>+ New Expense</span>
            </button>
          </div>
        </div>
      )}

      {/* EXPENSE AMOUNT TAB: Collection funded expenses & Head Office auto-deposit on 1st of following month */}
      {activeTab === 'expense_amount' && (
        <ExpenseAmountTab
          expenses={expenses}
          collections={collections}
          bankDeposits={bankDeposits}
          branches={branches}
          company={company}
          currentUser={currentUser}
          parties={parties}
          setParties={setParties}
          setCollections={setCollections}
          setBankDeposits={setBankDeposits}
          allSalespersons={allSalespersons || salespersons}
          onSyncCloud={onSyncCloud}
          onNavigateEntry={() => setActiveTab('entry')}
          onBack={handleExpenseManagerBack}
        />
      )}


      {/* 4. EXPENSE STATEMENT REPORT */}
      {activeTab === 'report' && (
        <div className="space-y-4">
          {/* FILTER BAR - Matches Stock Report Style Exactly */}
          <div className="bg-[#0b2334]/85 backdrop-blur-xl text-white rounded-2xl shadow-lg border border-cyan-500/25 p-2.5 sm:p-3 space-y-2 print:hidden">
            {/* Row 1 */}
            <div className="flex items-center space-x-2 flex-wrap gap-y-2 justify-between">
              <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                <SalesCenterSearchFilter
                  value={filterEntity}
                  onChange={(val) => handleAccountFilterChange(val)}
                  options={accountFilterSearchOptions}
                  isLocked={!canViewAllUserCenters}
                  includeAllOption={canViewAllUserCenters}
                  allOptionLabel="All Sales Centers"
                  allOptionValue="All Sales Centers"
                  label="Account:"
                  placeholder="Search account / showroom..."
                  theme="dark"
                  size="sm"
                  widthClass="min-w-[170px] max-w-[250px]"
                />

                {(filterEntity !== initialDefaultEntity || periodPreset !== 'this_month') && (
                  <button
                    type="button"
                    onClick={() => {
                      handleAccountFilterChange(initialDefaultEntity);
                      handleSelectPeriodPreset('this_month');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 rounded-lg transition-colors cursor-pointer shadow-2xs"
                    title="Reset filters to default"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-rose-300" />
                    <span>Reset</span>
                  </button>
                )}

                <div className="hidden lg:flex items-center space-x-1.5 bg-[#061520]/90 px-2.5 py-1 rounded-lg border border-cyan-500/25 text-[11px]">
                  <span className="text-slate-400 font-bold">Net Sale:</span>
                  <span className="text-cyan-300 font-bold font-mono">৳{totalNetSaleSum.toLocaleString('en-IN')}</span>
                  <span className="text-cyan-500/40">|</span>
                  <span className="text-slate-400 font-bold">Collection:</span>
                  <span className="text-emerald-300 font-bold font-mono">৳{totalCollectionSum.toLocaleString('en-IN')}</span>
                  <span className="text-cyan-500/40">|</span>
                  <span className="text-slate-400 font-bold">Expense:</span>
                  <span className="text-rose-300 font-bold font-mono">৳{totalExpenseSum.toLocaleString('en-IN')}</span>
                  <span className="text-cyan-500/40">|</span>
                  <span className="text-slate-400 font-bold">Net Balance:</span>
                  <span className={`font-black font-mono ${computedNetBalance >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    ৳{computedNetBalance.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

            </div>

            {/* Row 2: Period Selection */}
            <div className="pt-1.5 border-t border-cyan-500/20 flex items-center space-x-2 flex-wrap gap-y-1.5">
              <div className="flex items-center space-x-1.5 bg-[#061520]/80 p-1 px-2 rounded-lg border border-cyan-500/25">
                <label className="text-slate-300 font-bold flex items-center space-x-1">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-xs">Period:</span>
                </label>

                <div className="flex items-center space-x-1 flex-wrap gap-y-1">
                  {(['this_month', 'last_month', 'this_year', 'last_year', 'all', 'custom'] as const).map((presetKey) => {
                    const labels: Record<string, string> = {
                      this_month: 'This Month',
                      last_month: 'Last Month',
                      this_year: 'This Year',
                      last_year: 'Last Year',
                      all: 'All',
                      custom: 'Custom Range'
                    };
                    return (
                      <button
                        key={presetKey}
                        type="button"
                        onClick={() => handleSelectPeriodPreset(presetKey)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer border whitespace-nowrap ${
                          periodPreset === presetKey
                            ? 'bg-emerald-500/90 text-white border-emerald-300/90 shadow-[0_0_16px_rgba(16,185,129,0.50)] font-black'
                            : 'bg-[#081c28]/55 hover:bg-white/[0.10] text-slate-200 border-white/[0.12] font-bold'
                        }`}
                      >
                        {labels[presetKey]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Date Range Picker */}
              <div className="flex items-center space-x-1 bg-[#061520]/80 p-1 px-2 rounded-lg border border-cyan-500/25">
                <span className="text-[11px] font-bold text-slate-300">From:</span>
                <input
                  type="text"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPeriodPreset('custom');
                  }}
                  onBlur={() => {
                    if (startDate.trim()) setStartDate(formatDateDDMMYY(startDate));
                  }}
                  placeholder="dd.mm.yy"
                  className="bg-[#081b28] text-amber-200 font-mono font-bold border border-cyan-500/30 rounded px-1.5 py-0.5 text-xs text-center w-20 focus:ring-1 focus:ring-cyan-400"
                />
                <div className="relative flex items-center">
                  <input
                    type="date"
                    value={parseDateToISO(startDate)}
                    onChange={(e) => {
                      if (e.target.value) {
                        setStartDate(formatDateDDMMYY(e.target.value));
                        setPeriodPreset('custom');
                      }
                    }}
                    className="opacity-0 absolute inset-0 w-6 h-6 cursor-pointer z-10"
                    title="Pick Start Date"
                  />
                  <Calendar className="w-3.5 h-3.5 text-cyan-400 hover:text-cyan-200 cursor-pointer" />
                </div>

                <span className="text-[11px] font-bold text-slate-300 ml-1">To:</span>
                <input
                  type="text"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPeriodPreset('custom');
                  }}
                  onBlur={() => {
                    if (endDate.trim()) setEndDate(formatDateDDMMYY(endDate));
                  }}
                  placeholder="dd.mm.yy"
                  className="bg-[#081b28] text-amber-200 font-mono font-bold border border-cyan-500/30 rounded px-1.5 py-0.5 text-xs text-center w-20 focus:ring-1 focus:ring-cyan-400"
                />
                <div className="relative flex items-center">
                  <input
                    type="date"
                    value={parseDateToISO(endDate)}
                    onChange={(e) => {
                      if (e.target.value) {
                        setEndDate(formatDateDDMMYY(e.target.value));
                        setPeriodPreset('custom');
                      }
                    }}
                    className="opacity-0 absolute inset-0 w-6 h-6 cursor-pointer z-10"
                    title="Pick End Date"
                  />
                  <Calendar className="w-3.5 h-3.5 text-cyan-400 hover:text-cyan-200 cursor-pointer" />
                </div>
              </div>
            </div>

            {/* Row 3: Sheet Header Inputs */}
            {(() => {
              const currentDetails = getEntityDisplayDetails(reportEntity);
              return (
                <div className="pt-1.5 border-t border-cyan-500/20 flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="flex items-center space-x-2 flex-wrap gap-y-1.5">
                    <div className="flex items-center space-x-1.5 bg-[#061520]/80 px-2 py-0.5 rounded-lg border border-cyan-500/25">
                      <span className="text-[11px] font-bold text-slate-400">Name:</span>
                      <input
                        type="text"
                        value={reportPersonName}
                        onChange={(e) => setReportPersonName(e.target.value)}
                        placeholder={currentDetails.personName}
                        className="bg-[#081b28] text-cyan-200 font-bold border border-cyan-500/30 rounded px-1.5 py-0.5 text-xs w-32 focus:ring-1 focus:ring-cyan-400"
                      />
                    </div>

                    <div className="flex items-center space-x-1.5 bg-[#061520]/80 px-2 py-0.5 rounded-lg border border-cyan-500/25">
                      <span className="text-[11px] font-bold text-slate-400">Center:</span>
                      <input
                        type="text"
                        value={reportSalesCenterName}
                        onChange={(e) => setReportSalesCenterName(e.target.value)}
                        placeholder={currentDetails.centerName}
                        className="bg-[#081b28] text-teal-200 font-bold border border-cyan-500/30 rounded px-1.5 py-0.5 text-xs w-36 focus:ring-1 focus:ring-cyan-400"
                      />
                    </div>

                    <div className="flex items-center space-x-1.5 bg-[#061520]/80 px-2 py-0.5 rounded-lg border border-cyan-500/25">
                      <span className="text-[11px] font-bold text-slate-400">Sales:</span>
                      <input
                        type="text"
                        value={reportSalesAmount}
                        onChange={(e) => setReportSalesAmount(e.target.value)}
                        placeholder="-"
                        className="bg-[#081b28] text-cyan-200 font-mono font-bold border border-cyan-500/30 rounded px-1.5 py-0.5 text-xs w-28 focus:ring-1 focus:ring-cyan-400"
                      />
                    </div>

                    <div className="flex items-center space-x-1.5 bg-[#061520]/80 px-2 py-0.5 rounded-lg border border-cyan-500/25">
                      <span className="text-[11px] font-bold text-slate-400">Collection:</span>
                      <input
                        type="text"
                        value={reportCollectionAmount}
                        onChange={(e) => setReportCollectionAmount(e.target.value)}
                        placeholder="-"
                        className="bg-[#081b28] text-emerald-200 font-mono font-bold border border-cyan-500/30 rounded px-1.5 py-0.5 text-xs w-28 focus:ring-1 focus:ring-cyan-400"
                      />
                    </div>
                  </div>

              <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                <button
                  type="button"
                  onClick={handleResetTo31StandardHeads}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-amber-200 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 rounded-lg transition-colors cursor-pointer shadow-2xs"
                  title="Reset Expense Categories to the standard 31 heads matching the voucher sheet"
                >
                  <RotateCcw className="w-3 h-3 text-amber-300" />
                  <span>Sync 31 Voucher Heads</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowCategoryManagerModal(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-slate-200 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/30 rounded-lg transition-colors cursor-pointer shadow-2xs"
                  title="Add, Edit or Reorder Expense Heads"
                >
                  <Settings className="w-3 h-3 text-cyan-300" />
                  <span>Expense Heads</span>
                </button>
              </div>
            </div>
              );
            })()}
          </div>

          {/* Statement Document Container matching ex.png */}
          <div
            id="expense-statement-report-content"
            ref={reportPrintRef}
            className={`expense-statement-sheet bg-white p-3 sm:p-8 rounded-lg shadow-xl border border-slate-300 text-black max-w-[780px] mx-auto space-y-4 font-sans print:p-0 print:border-none print:shadow-none print:m-0 print:max-w-none ${
              showReportPrintPreviewModal ? 'no-print print:hidden hidden' : ''
            }`}
          >
            {renderExpenseReportSheet()}
          </div>

          <div className="cyber-glass-card rounded-2xl p-3 max-w-[780px] mx-auto flex flex-wrap items-center justify-end gap-2 no-print">
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-emerald-200 font-bold text-xs rounded-xl border border-emerald-400/35 transition-colors flex items-center space-x-1.5 cursor-pointer shadow-xs active:scale-95"
              title="Export Statement to Excel"
            >
              <Download className="w-4 h-4 text-emerald-300" />
              <span>Export Excel</span>
            </button>

            <button
              type="button"
              onClick={handlePrintReport}
              className="px-3.5 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-black rounded-xl shadow-md flex items-center space-x-1.5 cursor-pointer transition-all active:scale-95"
              title="Print Expense Statement Report"
            >
              <Printer className="w-4 h-4 text-slate-950" />
              <span>Print Expense Report</span>
            </button>
          </div>
        </div>
      )}

      {/* PRINT PREVIEW MODAL */}
      {showReportPrintPreviewModal && (
        <div className="print-preview-modal-backdrop fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 overflow-y-auto p-4 flex justify-center print:p-0 print:bg-white print:static">
          <style>{`
            @media print {
              #expense-statement-report-content-modal {
                position: static !important;
                width: 100% !important;
                max-width: 100% !important;
                margin: 0 auto !important;
                padding: 4mm !important;
                background: #ffffff !important;
                box-shadow: none !important;
                border: none !important;
                overflow: visible !important;
                max-height: none !important;
              }
            }
          `}</style>
          <div className="print-preview-modal-dialog bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-4xl w-full border border-cyan-400/35 overflow-hidden my-6 print:m-0 print:border-none print:shadow-none print:rounded-none">
            <div className="cyber-glass-header text-white p-4 flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/25 no-print">
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => setShowReportPrintPreviewModal(false)}
                  className="flex items-center space-x-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer border border-cyan-500/30"
                  title="Go Back"
                >
                  <ArrowLeft className="w-4 h-4 text-slate-300" />
                  <span>Back</span>
                </button>
                <div className="flex items-center space-x-2">
                  <FileText className="w-5 h-5 text-cyan-300" />
                  <h3 className="text-sm font-extrabold tracking-wide uppercase">
                    Expense Report - Print Preview ({reportEntity})
                  </h3>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerAutoConfiguredPrint('report', {
                      paperPreset: 'a4'
                    });
                  }}
                  className="flex items-center space-x-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 px-4 py-1.5 rounded-lg text-xs font-black transition-colors cursor-pointer shadow-xs"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Document</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowReportPrintPreviewModal(false)}
                  className="flex items-center space-x-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/40 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  <X className="w-4 h-4" />
                  <span>Close</span>
                </button>
              </div>
            </div>
            <div className="p-2.5 sm:p-6 bg-[#061520]/80 overflow-auto max-h-[85vh] flex justify-start sm:justify-center print:p-0 print:max-h-none print:overflow-visible">
              <div
                id="expense-statement-report-content-modal"
                className="expense-statement-sheet bg-white p-3 sm:p-8 rounded-lg shadow-xl border border-slate-300 text-black max-w-[780px] w-full mx-auto font-sans print:p-0 print:border-none print:shadow-none print:m-0 print:max-w-none"
              >
                {renderExpenseReportSheet()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-md w-full p-6 border border-rose-500/40 space-y-4 text-white">
            <div className="flex items-center space-x-3 text-rose-300">
              <div className="p-3 bg-rose-500/20 border border-rose-400/40 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-rose-300" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Confirm Deletion</h3>
                <p className="text-xs text-slate-400 font-medium">This action cannot be undone.</p>
              </div>
            </div>
            <div className="bg-[#061520]/90 p-3 rounded-xl border border-cyan-500/25 text-xs text-slate-200">
              Are you sure you want to permanently delete this {
                deleteConfirmTarget.type === 'expense' ? 'expense voucher' :
                deleteConfirmTarget.type === 'collection' ? 'collection MR' :
                deleteConfirmTarget.type === 'bankDeposit' ? 'bank deposit entry' :
                deleteConfirmTarget.type === 'bulkBankDeposit' ? 'selected bank deposits' :
                deleteConfirmTarget.type === 'bulkCollection' ? 'selected collection entries' : 'record'
              }
              {deleteConfirmTarget.label ? ` (${deleteConfirmTarget.label})` : ''}
              {deleteConfirmTarget.amount ? ` worth ৳${deleteConfirmTarget.amount.toLocaleString('en-IN')}` : ''}?
            </div>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-4 py-2 text-xs font-bold text-slate-200 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/25 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                ref={confirmDeleteBtnRef}
                type="button"
                onClick={() => {
                  executeConfirmDelete();
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-colors cursor-pointer shadow-md"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COLLECTION DUPLICATE CONFIRMATION MODAL */}
      {collectionDupConfirmModal?.isOpen && (
        <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-lg w-full p-6 border border-amber-400/40 space-y-4 text-white">
            <div className="flex items-center space-x-3 text-amber-300">
              <div className="p-3 bg-amber-500/20 border border-amber-400/40 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-amber-300" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Duplicate Cash Collection Detected</h3>
                <p className="text-xs text-slate-400 font-medium">
                  An identical collection record was found in the database.
                </p>
              </div>
            </div>
            <div className="bg-amber-500/10 p-3.5 rounded-xl border border-amber-400/30 space-y-2 text-xs">
              <div className="font-extrabold text-amber-300 text-xs">
                ⚠️ Warning: {collectionDupConfirmModal.dupInfo.reason}
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div>
                  <span className="text-slate-400 font-bold block">Party Name:</span>
                  <span className="font-black text-white">{collectionDupConfirmModal.pendingCollection.partyName}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block">Collection Date:</span>
                  <span className="font-mono font-bold text-slate-200">{formatDateDDMMYY(collectionDupConfirmModal.pendingCollection.date)}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block">Amount:</span>
                  <span className="font-mono font-extrabold text-emerald-300 text-sm">৳{collectionDupConfirmModal.pendingCollection.amount.toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block">Existing MR#:</span>
                  <span className="font-mono font-bold text-amber-300">{collectionDupConfirmModal.dupInfo.matchingCollection?.mrNo || 'N/A'}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setCollectionDupConfirmModal(null)}
                className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-slate-200 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/25 rounded-xl transition-colors cursor-pointer"
              >
                Cancel / Correction
              </button>
              <button
                type="button"
                onClick={() => {
                  const pending = collectionDupConfirmModal.pendingCollection;
                  setCollectionDupConfirmModal(null);
                  const updated = [pending, ...collections];
                  setCollections(updated);
                  const dupCenter =
                    userFixedSalesCenter ||
                    pending.branchName ||
                    resolveEntityToSalesCenter(pending.entityName, effectiveAllBranches, effectiveAllSalespersons) ||
                    defaultCollectionAssignedEntity;
                  const nextMr = computeNextSalesCenterMrNo(
                    updated,
                    dupCenter,
                    effectiveAllBranches,
                    parties,
                    effectiveAllSalespersons
                  );
                  setIsMrNoManuallyEdited(false);
                  setMrNo(nextMr);
                  setMrAmount('');
                  setMrChequeNo('');
                  setMrRemarks('');
                  setMrPartyName('');
                  setCustomPartyName('');
                  showNotify('success', `Collection MR (${pending.mrNo}) saved.`);
                }}
                className="w-full sm:w-auto px-4 py-2 text-xs font-black text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-colors cursor-pointer shadow-md"
              >
                Confirm & Save Duplicate Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXCEL IMPORT DUPLICATE REVIEW & RESOLUTION MODAL */}
      {excelImportDupModal?.isOpen && (
        <div className="fixed inset-0 z-50 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-2xl w-full p-6 border border-amber-400/40 space-y-4 max-h-[90vh] flex flex-col text-white">
            <div className="flex items-center space-x-3 text-amber-300 flex-none">
              <div className="p-3 bg-amber-500/20 border border-amber-400/40 rounded-xl">
                <FileSpreadsheet className="w-6 h-6 text-amber-300" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">
                  Excel Import: {excelImportDupModal.duplicateRecords.length} Duplicate Records Found
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  {excelImportDupModal.uniqueRecords.length} unique records ready to import, {excelImportDupModal.duplicateRecords.length} duplicate records detected.
                </p>
              </div>
            </div>
            <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-400/30 text-xs text-amber-200">
              <p className="font-bold">
                The following records already exist in your collection records (same Date, Party, and Amount):
              </p>
            </div>
            <div className="flex-1 overflow-y-auto border border-cyan-500/25 bg-[#061520]/80 rounded-xl divide-y divide-cyan-500/15 max-h-60">
              {excelImportDupModal.duplicateRecords.map((item, i) => (
                <div key={i} className="p-3 text-xs flex items-center justify-between hover:bg-cyan-500/[0.06]">
                  <div className="space-y-0.5">
                    <div className="font-bold text-white">{item.record.partyName || "Unknown Party"}</div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      Date: {formatDateDDMMYY(item.record.date)} • MR: {item.record.mrNo || "N/A"} • {item.reason}
                    </div>
                  </div>
                  <div className="font-mono font-extrabold text-amber-300 text-sm">
                    ৳{Number(item.record.amount || 0).toLocaleString("en-IN")}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-3 border-t border-cyan-500/20 flex-none">
              <button
                type="button"
                onClick={() => setExcelImportDupModal(null)}
                className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-slate-200 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/25 rounded-xl transition-colors cursor-pointer"
              >
                Cancel Import
              </button>
              <button
                type="button"
                onClick={() => {
                  const updated = [...excelImportDupModal.uniqueRecords, ...collections];
                  setCollections(updated);
                  try {
                    localStorage.setItem('polycables_collections', JSON.stringify(updated));
                  } catch (e) {}
                  processNewPartiesFromImport(excelImportDupModal.uniqueRecords);
                  if (activeTab === 'cash_in_hand') setCashDepositFilter('pending');
                  setFilterEntity('All');
                  setFilterParty('All');
                  setFilterSalesman('All');
                  setStartDate('');
                  setEndDate('');
                  setSearch('');
                  setExcelImportDupModal(null);
                  showNotify("success", `Imported ${excelImportDupModal.uniqueRecords.length} non-duplicate records successfully!`);
                }}
                className="w-full sm:w-auto px-4 py-2 text-xs font-black text-emerald-200 bg-emerald-500/20 hover:bg-emerald-500/30 rounded-xl transition-colors cursor-pointer border border-emerald-400/40"
              >
                Skip Duplicates ({excelImportDupModal.uniqueRecords.length} Records)
              </button>
              <button
                type="button"
                onClick={() => {
                  const updated = [...excelImportDupModal.allRecords, ...collections];
                  setCollections(updated);
                  try {
                    localStorage.setItem('polycables_collections', JSON.stringify(updated));
                  } catch (e) {}
                  processNewPartiesFromImport(excelImportDupModal.allRecords);
                  if (activeTab === 'cash_in_hand') setCashDepositFilter('pending');
                  setFilterEntity('All');
                  setFilterParty('All');
                  setFilterSalesman('All');
                  setStartDate('');
                  setEndDate('');
                  setSearch('');
                  setExcelImportDupModal(null);
                  showNotify("success", `Imported all ${excelImportDupModal.allRecords.length} records including duplicates.`);
                }}
                className="w-full sm:w-auto px-4 py-2 text-xs font-black text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-colors cursor-pointer shadow-md"
              >
                Import All Anyway ({excelImportDupModal.allRecords.length} Records)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT EXPENSE VOUCHER MODAL */}
      {editModalExpense && (
        <EditExpenseModalDialog
          expense={editModalExpense}
          salespersons={salespersons}
          branches={branches}
          parties={parties}
          categories={expenseCategories}
          onAddNewCategory={handleAddNewCategory}
          onSave={(updated) => {
            const wasApproved = Boolean(editModalExpense.isApproved);
            const isNowApproved = Boolean(updated.isApproved && updated.fundingPartyName);

            setExpenses((prev) => {
              const next = prev.map((exp) => (exp.id === updated.id ? updated : exp));
              try {
                localStorage.setItem(
                  'polycables_expenses',
                  JSON.stringify(next)
                );
              } catch (e) {}
              if (onSyncCloud) {
                onSyncCloud({ expenses: next }, true);
              }
              return next;
            });

            setEditModalExpense(null);
            showNotify('success', `Expense voucher updated successfully.`);
          }}
          onClose={() => setEditModalExpense(null)}
        />
      )}

      {/* EDIT COLLECTION MR MODAL (ACTIVE SYSTEM FOR H/O AND COLLECTIONS) */}
      {editingCollection && (
        <EditCollectionMrModalDialog
          collection={editingCollection}
          parties={parties}
          salespersons={salespersons}
          bankList={bankList}
          branches={effectiveAllBranches}
          onSave={handleSaveEditedCollection}
          onDelete={handleDeleteEditedCollection}
          onClose={() => setEditingCollection(null)}
        />
      )}

      {/* EXPENSE DIRECTORY & TRANSACTION LOG PRINT PREVIEW MODAL */}
      {showDirectoryPrintPreviewModal && (
        <div className="print-preview-modal-backdrop fixed inset-0 bg-[#030d14]/85 backdrop-blur-sm z-50 overflow-y-auto p-4 flex justify-center print:p-0 print:bg-white print:static">
          <div className="print-preview-modal-dialog bg-[#091e2c]/95 rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-5xl w-full border border-cyan-400/35 overflow-hidden my-6 print:m-0 print:border-none print:shadow-none print:rounded-none">
            {/* Top Toolbar */}
            <div className="cyber-glass-header text-white p-4 flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/25 no-print print:hidden">
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => setShowDirectoryPrintPreviewModal(false)}
                  className="flex items-center space-x-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer border border-cyan-500/25"
                  title="Go Back"
                >
                  <ArrowLeft className="w-4 h-4 text-cyan-300" />
                  <span>Back</span>
                </button>
                <div className="flex items-center space-x-2">
                  <FileText className="w-5 h-5 text-cyan-300" />
                  <div>
                    <h3 className="text-sm font-extrabold tracking-wide uppercase">
                      Expense Directory & Transaction Log - Print Preview
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Account: <span className="text-cyan-200 font-bold">{filterEntity}</span> | Category: <span className="text-cyan-200 font-bold">{filterExpenseCategory === 'all' ? 'All Categories' : filterExpenseCategory}</span> | Period: <span className="text-cyan-200 font-bold">{startDate} to {endDate}</span>
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerAutoConfiguredPrint('report', {
                      paperPreset: 'a4'
                    });
                  }}
                  className="flex items-center space-x-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 px-4 py-1.5 rounded-lg text-xs font-black transition-colors cursor-pointer shadow-xs"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Document</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowDirectoryPrintPreviewModal(false)}
                  className="flex items-center space-x-1.5 bg-rose-600/80 hover:bg-rose-600 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  <X className="w-4 h-4" />
                  <span>Close</span>
                </button>
              </div>
            </div>

            {/* Printable Area */}
            <div className="print-paper-sheet p-6 sm:p-8 overflow-y-auto flex-1 text-black bg-white print:p-2 print:overflow-visible print:max-h-none">
              <div className="text-center border-b border-black pb-4">
                <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-black">
                  POLY CABLES INDUSTRIES LTD.
                </h1>
                <p className="text-xs font-bold text-slate-700 uppercase tracking-widest mt-0.5">
                  CORPORATE OFFICE: House-16, Block-C, Main Road, Aftabnagar, Dhaka, Bangladesh • Mobile: 01730732000
                </p>
                <h2 className="text-base font-extrabold uppercase text-black mt-2 underline decoration-2 underline-offset-4">
                  Expense Directory & Transaction Log
                </h2>
                <div className="flex flex-wrap items-center justify-between mt-3 text-xs font-bold text-slate-900 border-t border-slate-300 pt-2">
                  <div>
                    <span className="text-slate-600">Account / Branch:</span>{' '}
                    <span className="font-extrabold font-mono text-black">{filterEntity}</span>
                  </div>
                  <div>
                    <span className="text-slate-600">Category Filter:</span>{' '}
                    <span className="font-extrabold font-mono text-black">
                      {filterExpenseCategory === 'all' ? 'All Categories' : filterExpenseCategory}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-600">Date Range:</span>{' '}
                    <span className="font-extrabold font-mono text-black">{startDate} to {endDate}</span>
                  </div>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="py-4">
                <table className="w-full text-xs text-black border-collapse">
                  <thead>
                    <tr className="border-b-2 border-black bg-slate-100 font-bold uppercase text-[10px]">
                      <th className="p-2 border border-black text-center w-10">SL#</th>
                      <th className="p-2 border border-black text-center w-24">Date</th>
                      <th className="p-2 border border-black text-left w-40">Assigned Account</th>
                      <th className="p-2 border border-black text-left">Expense Head / Category</th>
                      <th className="p-2 border border-black text-left">Remarks / Details</th>
                      <th className="p-2 border border-black text-right w-28">Amount (৳)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-slate-400 italic border border-black">
                          No expense vouchers found matching the selected filters.
                        </td>
                      </tr>
                    ) : (
                      filteredExpenses.map((exp, idx) => (
                        <tr key={exp.id} className="border-b border-slate-300 h-7 hover:bg-slate-50">
                          <td className="p-1.5 border border-black text-center text-xs font-mono">{idx + 1}</td>
                          <td className="p-1.5 border border-black text-center text-xs font-mono font-bold">
                            {formatDateDDMMYY(exp.date)}
                          </td>
                          <td className="p-1.5 border border-black text-left text-xs font-semibold">
                            {exp.entityName}
                          </td>
                          <td className="p-1.5 border border-black text-left text-xs font-bold">
                            {exp.expenseHead}
                          </td>
                          <td className="p-1.5 border border-black text-left text-xs text-slate-700">
                            {exp.remarks || '-'} {exp.area ? `(${exp.area})` : ''}
                          </td>
                          <td className="p-1.5 border border-black text-right text-xs font-bold font-mono">
                            ৳{exp.amount.toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))
                    )}
                    <tr className="border-t-2 border-black bg-slate-100 font-bold text-black h-9">
                      <td colSpan={5} className="p-2 text-right uppercase text-xs font-extrabold border border-black">
                        Total Filtered Expenses ({filteredExpenses.length} Vouchers)
                      </td>
                      <td className="p-2 text-right text-sm font-black font-mono border border-black">
                        ৳{filteredExpenses.reduce((sum, e) => sum + e.amount, 0).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-3 gap-8 text-center pt-12 pb-4 text-xs font-bold text-black uppercase tracking-wider">
                <div>
                  <div className="border-t border-black pt-1 max-w-[140px] mx-auto">Prepared By</div>
                </div>
                <div>
                  <div className="border-t border-black pt-1 max-w-[140px] mx-auto">Accounts / Audit</div>
                </div>
                <div>
                  <div className="border-t border-black pt-1 max-w-[140px] mx-auto">Authorized By</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EXPENSE CATEGORY / HEAD MANAGER MODAL */}
      {showCategoryManagerModal && (
        <ExpenseCategoryManagerModal
          isOpen={showCategoryManagerModal}
          onClose={() => setShowCategoryManagerModal(false)}
          categories={expenseCategories}
          onSaveCategories={(updated) => {
            setExpenseCategories(updated);
            try {
              localStorage.setItem('polycables_expense_categories', JSON.stringify(updated));
              localStorage.setItem('polycables_expense_categories_v2', JSON.stringify(updated));
            } catch (e) {}
            onSyncCloud?.({ expenseCategories: updated }, true);
          }}
          onNotify={showNotify}
        />
      )}

      {/* ========================================================= */}
      {/* BANK DEPOSIT NOTIFICATION EMAIL MODAL                    */}
      {/* ========================================================= */}
      {emailModalDeposit && (
        <div className="fixed inset-0 bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-2xl w-full my-auto overflow-hidden border border-cyan-400/35 animate-in fade-in zoom-in-95 duration-150 text-white">
            {/* Modal Header */}
            <div className="cyber-glass-header text-white px-5 py-4 flex items-center justify-between border-b border-cyan-500/25">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-cyan-500/20 text-cyan-300 rounded-lg border border-cyan-400/35">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-extrabold tracking-wide text-white">
                      Deposit Slip Notification Email
                    </h3>
                    {isTestEmailMode && (
                      <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 rounded-full">
                        Test Mode
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-cyan-200/80">
                    Dispatch live bank deposit receipt & slip attachment via SMTP
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEmailModalDeposit(null);
                  setEmailDeliveryReceipt(null);
                  setEmailSendError(null);
                }}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                title="Close Modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Delivery Receipt / Success Notification */}
              {emailDeliveryReceipt && (
                <div className="p-4 bg-emerald-500/15 border border-emerald-400/40 rounded-xl text-emerald-200 space-y-1.5 shadow-xs">
                  <div className="flex items-center space-x-2 font-bold text-sm text-white">
                    <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
                    <span>✓ Email Successfully Dispatched!</span>
                  </div>
                  <div className="text-xs font-mono text-emerald-200 pl-7 space-y-0.5">
                    <div><strong>Message ID:</strong> {emailDeliveryReceipt.messageId}</div>
                    <div><strong>Sent At:</strong> {new Date(emailDeliveryReceipt.sentAt).toLocaleString()}</div>
                    <div><strong>Recipients:</strong> {emailDeliveryReceipt.recipients}</div>
                  </div>
                </div>
              )}

              {/* Error Notification */}
              {emailSendError && (
                <div className="p-3 bg-rose-500/15 border border-rose-400/40 rounded-xl text-rose-200 text-xs flex items-start space-x-2 shadow-xs">
                  <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-white">Email dispatch failed:</p>
                    <p className="font-mono mt-0.5">{emailSendError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSmtpSettings(!showSmtpSettings)}
                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] font-bold cursor-pointer shrink-0"
                  >
                    Check SMTP
                  </button>
                </div>
              )}

              {/* SMTP Settings Bar Toggle */}
              <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
                <button
                  type="button"
                  onClick={() => setShowSmtpSettings(!showSmtpSettings)}
                  className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-200 hover:text-cyan-300 cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5 text-cyan-400" />
                  <span>SMTP Sender Configuration ({smtpConfig.user || 'Not Configured'})</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSmtpSettings ? 'rotate-180' : ''}`} />
                </button>
                <span className="text-[11px] text-slate-400 font-mono">
                  Port {smtpConfig.port} ({smtpConfig.secure ? 'SSL' : 'TLS'})
                </span>
              </div>

              {/* Collapsible SMTP Configuration Panel */}
              {showSmtpSettings && (
                <div className="p-4 cyber-glass-subcard rounded-xl border border-cyan-500/25 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">SMTP Host</label>
                      <input
                        type="text"
                        value={smtpConfig.host}
                        onChange={(e) => setSmtpConfig({ ...smtpConfig, host: e.target.value })}
                        placeholder="smtp.gmail.com"
                        className="w-full text-xs font-mono px-2.5 py-1.5 border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">Port</label>
                      <input
                        type="text"
                        value={smtpConfig.port}
                        onChange={(e) => setSmtpConfig({ ...smtpConfig, port: e.target.value })}
                        placeholder="465"
                        className="w-full text-xs font-mono px-2.5 py-1.5 border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">Gmail / Sender User</label>
                      <input
                        type="email"
                        value={smtpConfig.user}
                        onChange={(e) => setSmtpConfig({ ...smtpConfig, user: e.target.value })}
                        placeholder="yourname@gmail.com"
                        className="w-full text-xs font-mono px-2.5 py-1.5 border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">Google App Password</label>
                      <div className="relative">
                        <input
                          type={showSmtpPassword ? 'text' : 'password'}
                          value={smtpConfig.pass}
                          onChange={(e) => setSmtpConfig({ ...smtpConfig, pass: e.target.value })}
                          placeholder="16-character app password"
                          className="w-full text-xs font-mono px-2.5 py-1.5 pr-8 border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-300 cursor-pointer"
                        >
                          {showSmtpPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {smtpTestResult && (
                    <div className={`p-2.5 rounded-lg text-xs ${smtpTestResult.ok ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40' : 'bg-rose-500/20 text-rose-200 border border-rose-400/40'}`}>
                      {smtpTestResult.message}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      disabled={isTestingSmtp}
                      onClick={handleTestSmtp}
                      className="px-3 py-1.5 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/25 text-xs font-bold rounded-lg cursor-pointer transition-colors"
                    >
                      {isTestingSmtp ? 'Testing SMTP...' : 'Test Connection'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveSmtpConfig(smtpConfig)}
                      className="px-3 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-black rounded-lg cursor-pointer transition-colors"
                    >
                      Save Credentials
                    </button>
                  </div>
                </div>
              )}

              {/* Recipients (To) */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Main Recipients (To):
                </label>
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  {emailToList.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 bg-cyan-500/15 text-cyan-200 border border-cyan-400/35 rounded-lg text-xs font-mono font-medium"
                    >
                      <span>{email}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveRecipient('to', email)}
                        className="text-cyan-300 hover:text-rose-400 cursor-pointer ml-1"
                        title="Remove"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="email"
                    value={newToInput}
                    onChange={(e) => setNewToInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddRecipient('to');
                      }
                    }}
                    placeholder="Enter email and click Add or press Enter"
                    className="flex-1 text-xs px-3 py-2 border border-cyan-500/30 bg-[#061520] text-white placeholder-slate-400 rounded-lg focus:ring-1 focus:ring-cyan-400 focus:border-cyan-400"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddRecipient('to')}
                    className="px-3 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 text-xs font-bold rounded-lg border border-cyan-500/25 cursor-pointer"
                  >
                    Add Recipient
                  </button>
                </div>
              </div>

              {/* CC Recipients */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Carbon Copy (CC):
                </label>
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  {emailCcList.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 bg-indigo-500/20 text-indigo-200 border border-indigo-400/35 rounded-lg text-xs font-mono font-medium"
                    >
                      <span>{email}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveRecipient('cc', email)}
                        className="text-indigo-300 hover:text-rose-400 cursor-pointer ml-1"
                        title="Remove"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="email"
                    value={newCcInput}
                    onChange={(e) => setNewCcInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddRecipient('cc');
                      }
                    }}
                    placeholder="Enter CC email and click Add or press Enter"
                    className="flex-1 text-xs px-3 py-2 border border-cyan-500/30 bg-[#061520] text-white placeholder-slate-400 rounded-lg focus:ring-1 focus:ring-cyan-400 focus:border-cyan-400"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddRecipient('cc')}
                    className="px-3 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-cyan-200 text-xs font-bold rounded-lg border border-cyan-500/25 cursor-pointer"
                  >
                    Add CC
                  </button>
                </div>
              </div>

              {/* Subject Preview */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Subject Preview:
                </label>
                <div className="p-2.5 bg-[#061520] rounded-lg font-mono text-xs text-cyan-200 font-bold border border-cyan-500/25 select-all">
                  {generateDepositEmailSubject(
                    emailModalDeposit,
                    isTestEmailMode,
                    emailBatchDeposits.length > 0 ? emailBatchDeposits : [emailModalDeposit]
                  )}
                </div>
              </div>

              {/* Body Preview */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Message Body Preview:
                </label>
                <pre className="p-3 bg-[#040f17] text-slate-100 rounded-lg font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto border border-cyan-500/25 select-all">
                  {generateDepositEmailBody(
                    emailModalDeposit,
                    isTestEmailMode,
                    emailToList,
                    emailCcList,
                    emailBatchDeposits.length > 0 ? emailBatchDeposits : [emailModalDeposit],
                    parties
                  )}
                </pre>
              </div>

              {/* Attachment Preview (Deposit Slip Image) */}
              {(emailModalDeposit.slipImage || emailBatchDeposits.find((d) => d.slipImage)?.slipImage) && (
                <div className="p-3 cyber-glass-subcard border border-cyan-500/25 rounded-xl flex items-center space-x-3">
                  <img
                    src={emailModalDeposit.slipImage || emailBatchDeposits.find((d) => d.slipImage)?.slipImage}
                    alt="Slip preview"
                    className="w-14 h-14 object-cover rounded-lg border border-cyan-500/35 shrink-0"
                  />
                  <div className="text-xs">
                    <p className="font-bold text-white">Deposit Slip Attached</p>
                    <p className="text-slate-400 font-mono text-[11px]">
                      Will be sent as high-resolution image attachment to recipients
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-[#071824]/90 px-5 py-3.5 border-t border-cyan-500/20 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsTestEmailMode(!isTestEmailMode)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors cursor-pointer flex items-center space-x-1.5 ${
                  isTestEmailMode
                    ? 'bg-amber-500/20 text-amber-200 border-amber-400/40'
                    : 'bg-[#081b28] text-slate-200 border-cyan-500/25 hover:bg-[#0e2a3d]'
                }`}
              >
                <FlaskConical className="w-3.5 h-3.5" />
                <span>{isTestEmailMode ? 'Test Mode Active' : 'Toggle Test Mode'}</span>
              </button>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setEmailModalDeposit(null);
                    setEmailDeliveryReceipt(null);
                    setEmailSendError(null);
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-200 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/25 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSendingEmail}
                  onClick={handleSendDepositEmail}
                  className="px-5 py-2 text-xs font-black text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl shadow-md transition-colors cursor-pointer flex items-center space-x-2 disabled:opacity-50"
                >
                  {isSendingEmail ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending Email...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Send Email Now</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deposit Slip Image Preview Modal (Read-Only, Never Modifies Slip) */}
      {previewImageModal && (
        <div 
          className="fixed inset-0 z-[9999] bg-[#030d14]/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150"
          onClick={() => setPreviewImageModal(null)}
        >
          <div 
            className="bg-[#091e2c]/95 backdrop-blur-2xl text-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-cyan-400/35"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="cyber-glass-header px-4 sm:px-5 py-3 border-b border-cyan-500/25 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-cyan-500/20 text-cyan-300 rounded-lg border border-cyan-400/35">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">Bank Deposit Slip Document</h3>
                  <p className="text-[11px] text-slate-400">View-only verified slip copy • Uploaded file is preserved and unedited</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <a
                  href={previewImageModal}
                  download="bank-deposit-slip.png"
                  className="px-3 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-black rounded-lg shadow-sm flex items-center space-x-1 cursor-pointer transition-all"
                  title="Download Slip"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Download</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewImageModal(null)}
                  className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                  title="Close Preview"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Image preview with zoom/fit */}
            <div className="flex-1 overflow-auto bg-[#040f17] p-2 sm:p-4 flex items-center justify-center min-h-[300px]">
              <img
                src={previewImageModal}
                alt="Bank Deposit Slip"
                className="max-w-full max-h-[78vh] object-contain rounded-lg border border-cyan-500/25 shadow-2xl"
              />
            </div>
          </div>
        </div>
      )}

      {/* Cheque Action Modal (Convert Cheque to Cash In Hand) */}
      {chequeActionModal.isOpen && chequeActionModal.collection && (
        <div className="fixed inset-0 z-[9999] bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-150 text-white">
            <div className="cyber-glass-header text-white p-4 flex items-center justify-between border-b border-amber-400/30">
              <div className="flex items-center space-x-2.5">
                <div className="p-1.5 bg-amber-500/20 border border-amber-400/40 rounded-lg">
                  <Banknote className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Convert Cheque to Cash</h3>
                  <p className="text-xs text-amber-200/80">Encashed into Cash In Hand</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setChequeActionModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Cheque details card */}
              <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-3.5 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold">Party / Customer:</span>
                  <span className="text-white font-black">{chequeActionModal.collection.partyName}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold">Cheque Amount:</span>
                  <span className="text-emerald-300 font-black text-sm font-mono">
                    ৳{(chequeActionModal.collection.amount || 0).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold">Cheque No & Bank:</span>
                  <div className="inline-flex items-center gap-1 text-cyan-200 font-bold font-mono">
                    #{chequeActionModal.collection.chequeNo || 'N/A'} <BankLogoBadge bankName={chequeActionModal.collection.bankName || 'Bank'} size="sm" />
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold">Collection Date:</span>
                  <span className="text-slate-200 font-medium font-mono">{formatDateDDMMYY(chequeActionModal.collection.date)}</span>
                </div>
              </div>

              {/* Input for Cash Date */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Encashed / Cash Date (dd.mm.yy):
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={chequeActionModal.cashDate}
                    onChange={(e) => setChequeActionModal((prev) => ({ ...prev, cashDate: e.target.value }))}
                    onBlur={() => {
                      if (chequeActionModal.cashDate.trim()) {
                        setChequeActionModal((prev) => ({ ...prev, cashDate: formatDateDDMMYY(chequeActionModal.cashDate) || chequeActionModal.cashDate }));
                      }
                    }}
                    placeholder="dd.mm.yy"
                    className="w-full p-2 pr-9 border border-cyan-500/30 rounded-lg text-xs font-mono font-bold text-white bg-[#061520] placeholder-slate-400 focus:ring-2 focus:ring-cyan-400"
                  />
                  <div className="absolute right-2 flex items-center">
                    <input
                      type="date"
                      value={parseDateToISO(chequeActionModal.cashDate)}
                      onChange={(e) => {
                        if (e.target.value) {
                          setChequeActionModal((prev) => ({ ...prev, cashDate: formatDateDDMMYY(e.target.value) }));
                        }
                      }}
                      className="opacity-0 absolute inset-0 w-7 h-7 cursor-pointer z-10"
                    />
                    <Calendar className="w-4 h-4 text-cyan-300 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Remarks / Encashed Notes:
                </label>
                <input
                  type="text"
                  value={chequeActionModal.remarks}
                  onChange={(e) => setChequeActionModal((prev) => ({ ...prev, remarks: e.target.value }))}
                  placeholder="e.g. Encashed to Cash In Hand"
                  className="w-full p-2 border border-cyan-500/30 rounded-lg text-xs text-white bg-[#061520] placeholder-slate-400 focus:ring-2 focus:ring-cyan-400"
                />
              </div>
            </div>

            <div className="bg-[#071824]/90 px-5 py-3.5 border-t border-cyan-500/20 flex items-center justify-end space-x-2.5">
              <button
                type="button"
                onClick={() => setChequeActionModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-xs font-bold text-slate-200 bg-[#081b28] hover:bg-[#0e2a3d] border border-cyan-500/25 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleChequeToCash(
                    chequeActionModal.collection!,
                    chequeActionModal.cashDate,
                    chequeActionModal.remarks
                  );
                  setChequeActionModal((prev) => ({ ...prev, isOpen: false }));
                }}
                className="px-5 py-2 text-xs font-black text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl shadow-md transition-all cursor-pointer flex items-center space-x-1.5 active:scale-95"
              >
                <Check className="w-4 h-4" />
                <span>Confirm Encashed to Cash</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expense Procedure Modal */}
      <ExpenseProcedureModal
        isOpen={showProcedureModal}
        onClose={() => setShowProcedureModal(false)}
      />

      {/* Bank & Account Directory Modal */}
      {showBankManagerModal && (
        <BankAndAccountDirectory
          isModal={true}
          bankList={bankList}
          accountList={accountList}
          onAddBank={handleAddBank}
          onDeleteBank={handleDeleteBank}
          onEditBank={handleEditBank}
          onEditBankShortCode={onEditBankShortCode}
          onResetBanks={handleResetBanks}
          onAddAccount={handleAddAccount}
          onDeleteAccount={handleDeleteAccount}
          onEditAccount={handleEditAccount}
          onEditAccountShortCode={onEditAccountShortCode}
          onResetAccounts={handleResetAccounts}
          onClose={() => setShowBankManagerModal(false)}
        />
      )}

      {/* Compact Collection Entry Success Toast */}
      {collectionSuccessModal && (
        <div
          className="fixed bottom-4 right-4 z-[120] max-w-xs w-full bg-[#091e2c]/95 backdrop-blur-xl rounded-xl shadow-[0_12px_32px_rgba(0,0,0,0.65)] border border-emerald-400/55 p-3 text-white animate-in fade-in slide-in-from-bottom-2 duration-150"
          role="status"
        >
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-emerald-200 truncate">
                  Collection Saved ({collectionSuccessModal.count})
                </span>
                <button
                  type="button"
                  onClick={() => setCollectionSuccessModal(null)}
                  className="p-0.5 text-slate-400 hover:text-white rounded cursor-pointer shrink-0"
                  title="Close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-baseline justify-between gap-2 mt-0.5">
                <span className="text-sm font-black font-mono text-white">
                  ৳{collectionSuccessModal.totalAmount.toLocaleString('en-IN')}
                </span>
                <span className="text-[10px] font-mono text-cyan-300 font-bold">
                  MR {collectionSuccessModal.startingMr} → {collectionSuccessModal.nextMr}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseManager;
