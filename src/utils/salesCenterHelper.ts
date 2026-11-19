import { AuthUser, BranchLocation, StoredBill } from '../types';

export const DEFAULT_HEAD_OFFICE_BRANCH: BranchLocation = {
  id: 'branch-head-office',
  name: 'CORPORATE OFFICE',
  type: 'head_office',
  address: 'House-16, Block-C, Main Road, Aftabnagar, Dhaka, Bangladesh',
  phone: '01730732000',
  email: 'info@polycables.com.bd'
};

function cleanBranchName(name?: string | null): string {
  if (!name) return '';
  let str = name.trim();
  const matchParen = str.match(/poly\s*cables.*?\((.*?)\)/i);
  if (matchParen && matchParen[1]) {
    str = matchParen[1].trim();
  } else {
    str = str.replace(/^poly\s*cables(?:\s*ind\.?\s*ltd\.?|\s*ltd\.?)?[:\s-]*/i, '').trim();
  }
  str = str.replace(/\s*\/\s*showroom/gi, '').trim();
  str = str.replace(/\bshowroom\b/gi, 'Sales Center').trim();
  str = str.replace(/(Sales Center\s*)+/gi, 'Sales Center').trim();
  const lower = str.toLowerCase();
  if (lower.includes('head office') || lower.includes('corporate office') || lower.includes('motijheel') || lower.includes('central')) {
    return 'CORPORATE OFFICE';
  }
  return str;
}

function isAdminLikeUser(user?: AuthUser | null): boolean {
  if (!user) return false;
  const username = ((user as any).username || '').toLowerCase().trim();
  const code = ((user as any).salespersonCode || (user as any).code || '').toLowerCase().trim();
  const roleLower = (user.role || '').toLowerCase().trim();
  const userRoleLower = ((user as any).userRole || '').toLowerCase().trim();
  return Boolean(
    (user as any).isSuperAdmin === true ||
    username === 'suvroadmin' ||
    username === 'suvro' ||
    code === 'suvroadmin' ||
    roleLower === 'admin' ||
    roleLower === 'agm' ||
    roleLower.includes('admin') ||
    userRoleLower.includes('admin') ||
    userRoleLower.includes('director') ||
    userRoleLower.includes('agm')
  );
}

export function isHeadOfficeBranch(branch?: BranchLocation | null): boolean {
  if (!branch) return false;
  if (branch.type === 'head_office' || branch.id === 'branch-head-office' || branch.id === 'branch-ho') return true;
  const low = `${branch.name || ''} ${cleanBranchName(branch.name) || ''}`.toLowerCase();
  return (
    low.includes('corporate office') ||
    low.includes('head office') ||
    low.includes('motijheel') ||
    low.includes('dilkusha') ||
    low.includes('aftabnagar') ||
    low.includes('central')
  );
}

export function findHeadOfficeBranch(branches: BranchLocation[] = []): BranchLocation {
  const existing = (branches || []).find((b) => isHeadOfficeBranch(b));
  return existing || DEFAULT_HEAD_OFFICE_BRANCH;
}

export function withHeadOfficeForAdmin(
  branches: BranchLocation[] = [],
  currentUser?: AuthUser | null
): BranchLocation[] {
  const list = Array.isArray(branches) ? branches : [];
  if (list.some((b) => isHeadOfficeBranch(b))) {
    return list;
  }
  if (!isAdminLikeUser(currentUser)) {
    return list;
  }
  return [DEFAULT_HEAD_OFFICE_BRANCH, ...list];
}

/**
 * Standard 2-digit / 2-letter uppercase prefixes for Sales Centers.
 * Pattern requested:
 * Gazipur -> GP
 * Tangail -> TG
 * Savar -> SV
 * etc.
 */
const KNOWN_BRANCH_PREFIXES: Record<string, string> = {
  // Explicit requested pattern
  gazipur: 'GP',
  tangail: 'TG',
  savar: 'SV',
  ashulia: 'AS',

  // Core showrooms & sales centers
  madhupur: 'MP',
  'branch-1': 'MP',
  'branch-main': 'MP',
  'polycables store': 'MP',
  nawabpur: 'PM',
  'power market': 'PM',
  mirpur: 'MR',
  narayanganj: 'NG',
  ghatail: 'GT',
  dhanbari: 'DB',
  mymensingh: 'MM',
  chittagong: 'CT',
  chattogram: 'CT',
  comilla: 'CM',
  cumilla: 'CM',
  feni: 'FN',
  noakhali: 'NK',
  maijdee: 'NK',
  sylhet: 'SY',
  'head office': 'HO',
  corporate: 'HO',
  dhaka: 'DH',

  // Other regional centers
  tongi: 'TN',
  bogra: 'BG',
  bogura: 'BG',
  rajshahi: 'RS',
  khulna: 'KL',
  barisal: 'BR',
  rangpur: 'RP',
  dinajpur: 'DJ',
  jessore: 'JS',
  jashore: 'JS',
  pabna: 'PB',
  sirajganj: 'SG',
  jamalpur: 'JP',
  sherpur: 'SP',
  netrokona: 'NT',
  kishoreganj: 'KG',
  brahmanbaria: 'BB',
  coxsbazar: 'CB',
  kushtia: 'KS',
  faridpur: 'FP'
};

/**
 * Derives a clean 2-letter uppercase prefix for any sales center / branch.
 * Examples:
 * - Gazipur Chowrasta Sales Center -> GP
 * - Tangail Sadar Sales Center -> TG
 * - Savar Sales Center -> SV
 * - Madhupur Sales Center -> MP
 */
export function getSalesCenterPrefix(branch?: BranchLocation | string | null): string {
  if (!branch) return 'SC';

  const rawName = typeof branch === 'string' ? branch : branch.name || branch.id || '';
  const clean = rawName
    .toLowerCase()
    .replace(/poly\s*cables\s*(ind\.?\s*ltd\.?)?/gi, '')
    .replace(/sales\s+center/gi, '')
    .replace(/showroom/gi, '')
    .replace(/branch/gi, '')
    .replace(/corporate/gi, '')
    .trim();

  // 1. Check known prefixes
  for (const [key, prefix] of Object.entries(KNOWN_BRANCH_PREFIXES)) {
    if (clean.includes(key) || rawName.toLowerCase().includes(key)) {
      return prefix;
    }
  }

  // 2. Fallback algorithmic 2-letter prefix from words
  const words = clean.split(/[\s\-_]+/).filter(Boolean);
  if (words.length >= 2) {
    const first = words[0].charAt(0).toUpperCase();
    const second = words[1].charAt(0).toUpperCase();
    return `${first}${second}`;
  }

  if (words.length === 1 && words[0].length >= 2) {
    const word = words[0];
    const first = word.charAt(0).toUpperCase();
    // Pick the next prominent consonant or 2nd letter
    const consonants = word.slice(1).replace(/[aeiou]/gi, '');
    const second = (consonants.length > 0 ? consonants.charAt(0) : word.charAt(1)).toUpperCase();
    return `${first}${second}`;
  }

  return 'SC';
}

/**
 * Computes next sequential Bill No starting from 1 for a specific Sales Center.
 * Format: {PREFIX}-{01, 02, ...} e.g. GP-01, TG-01, SV-01.
 * Every sales center maintains its own independent serial number.
 */
export function computeNextSalesCenterBillNumber(
  storedBills: StoredBill[] = [],
  branch?: BranchLocation | string | null
): string {
  const prefix = getSalesCenterPrefix(branch);
  const prefixUpper = prefix.toUpperCase();

  const branchId = typeof branch === 'object' && branch ? (branch.id || '').trim().toLowerCase() : '';
  const branchName = typeof branch === 'object' && branch ? (branch.name || '').trim().toLowerCase() : (typeof branch === 'string' ? branch.trim().toLowerCase() : '');

  let maxNum = 0;
  let padLength = 2;

  const safeBills = Array.isArray(storedBills) ? storedBills : [];

  for (const b of safeBills) {
    if (!b || !b.header) continue;
    // Exclude Office Bills
    if (b.header.isOfficeBill || (b as any).isOfficeBill) continue;

    const bBillNo = (b.header.billNo || '').trim().toUpperCase();
    const bBranchId = (b.header.branchId || b.branchId || '').trim().toLowerCase();
    const bBranchName = (b.header.branchName || (b as any).branchName || '').trim().toLowerCase();

    // Check if bill belongs to this sales center:
    // Either by bill prefix (e.g. "GP-01" or "GP01") or matching branch
    const hasMatchingPrefix = bBillNo.startsWith(`${prefixUpper}-`) || bBillNo.startsWith(prefixUpper);
    const hasMatchingBranch = (branchId && bBranchId && bBranchId === branchId) ||
      (branchName && bBranchName && (bBranchName.includes(branchName) || branchName.includes(bBranchName)));

    if (hasMatchingPrefix || hasMatchingBranch) {
      // Extract numeric portion
      const digitsMatch = bBillNo.match(/\d+/g);
      if (digitsMatch && digitsMatch.length > 0) {
        // Last number in bill number (e.g. GP-01 -> 1, GP-05-A -> 5)
        const numStr = digitsMatch[digitsMatch.length - 1];
        const val = parseInt(numStr, 10);
        if (!isNaN(val) && val > maxNum) {
          maxNum = val;
          if (numStr.length > padLength) {
            padLength = numStr.length;
          }
        }
      }
    }
  }

  const nextVal = maxNum + 1;
  return `${prefixUpper}-${String(nextVal).padStart(padLength, '0')}`;
}

/**
 * Computes running sequential bill number for branch (or office bill).
 */
export function computeBranchRunningBillNo(
  storedBills: StoredBill[] = [],
  branch?: BranchLocation | string | null,
  isOfficeBill: boolean = false
): string {
  if (isOfficeBill) {
    const prefixUpper = branch ? getSalesCenterPrefix(branch).toUpperCase() : '';
    const branchId = typeof branch === 'object' && branch ? (branch.id || '').trim().toLowerCase() : '';
    const branchName =
      typeof branch === 'object' && branch
        ? cleanBranchName(branch.name).toLowerCase()
        : (typeof branch === 'string' ? cleanBranchName(branch).toLowerCase() : '');

    let maxNum = 0;
    let padLength = 2;
    const safeBills = Array.isArray(storedBills) ? storedBills : [];

    for (const b of safeBills) {
      if (!b || !b.header) continue;
      if (b.header.isOfficeBill || (b as any).isOfficeBill) {
        const rawNo = (b.header.billNo || '').trim().toUpperCase();
        const bBranchId = (b.header.branchId || b.branchId || '').trim().toLowerCase();
        const bBranchName = cleanBranchName(b.header.branchName || (b as any).branchName || '').toLowerCase();

        if (branch && prefixUpper) {
          const hasMatchingPrefix = rawNo.startsWith(`${prefixUpper}-`);
          const hasMatchingBranch =
            (branchId && bBranchId && bBranchId === branchId) ||
            (branchName && bBranchName && (bBranchName === branchName || bBranchName.includes(branchName) || branchName.includes(bBranchName)));
          const isLegacyUnprefixedForHo = prefixUpper === 'HO' && !/^[A-Z]{2,5}[-_/\s]/.test(rawNo) && !bBranchId;
          if (!hasMatchingPrefix && !hasMatchingBranch && !isLegacyUnprefixedForHo) {
            continue;
          }
        }

        const digits = rawNo.match(/\d+/g);
        if (digits && digits.length > 0) {
          const numStr = digits[digits.length - 1];
          const val = parseInt(numStr, 10);
          if (!isNaN(val) && val > maxNum) {
            maxNum = val;
            if (numStr.length > padLength) padLength = numStr.length;
          }
        }
      }
    }
    const nextVal = maxNum + 1;
    const seq = String(nextVal).padStart(padLength, '0');
    return prefixUpper && prefixUpper !== 'SC' ? `${prefixUpper}-OB-${seq}` : `OB-${seq}`;
  }

  return computeNextSalesCenterBillNumber(storedBills, branch);
}

/**
 * Strips branch prefix (e.g. 'GP-01' -> '01') for print invoice pads.
 */
export function stripBranchPrefixForPrint(billNo?: string | null): string {
  if (!billNo) return '';
  const trimmed = billNo.trim();
  const stripped = trimmed.replace(/^[A-Za-z]{2,5}(?:[-_/\s]+OB)?[-_/\s]+/i, '');
  return stripped || trimmed;
}

/**
 * Formats a bill number for admin display, prefixing with sales center code when appropriate.
 */
export function formatAdminBillNo(
  billNo?: string | null,
  branch?: BranchLocation | string | null,
  isOfficeBill: boolean = false
): string {
  if (!billNo) return '';
  const trimmed = billNo.trim();
  if (isOfficeBill) return trimmed;
  // If it already has a letter prefix (e.g. "GP-01", "TG-02"), return as is
  if (/^[A-Za-z]{2,5}[-_/\s]/.test(trimmed)) {
    return trimmed;
  }
  const prefix = getSalesCenterPrefix(branch);
  if (prefix && prefix !== 'SC') {
    return `${prefix}-${trimmed}`;
  }
  return trimmed;
}
