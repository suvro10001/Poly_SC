import { StoredBill, CollectionMR } from '../types';

/**
 * Normalizes marketing person name / code for case-insensitive matching.
 */
export function normalizeMarketingPerson(personOrCode?: string): string {
  if (!personOrCode) return '';
  return personOrCode.trim().toLowerCase();
}

/**
 * Extracts the marketing person name or code from a stored bill.
 */
export function getBillMarketingPerson(
  b: StoredBill | { header?: { salespersonName?: string; salesmanCode?: string } }
): string {
  return (b.header?.salespersonName || b.header?.salesmanCode || '').trim();
}

/**
 * Generates the next available letter-suffixed bill number (e.g. 001 -> 001-A, 001-B, etc.)
 * for a specific marketing officer. Showroom Sale bills and Office bills share the same serial count.
 */
/**
 * Extracts uppercase prefix from bill number (e.g. "TG-01" -> "TG", "MP_05" -> "MP").
 */
export function extractBillPrefix(billNo?: string | null): string {
  if (!billNo) return '';
  const match = String(billNo).trim().match(/^([A-Za-z]+)[-_/\s]/);
  return match ? match[1].toUpperCase() : '';
}

/**
 * Generates the next available letter-suffixed bill number (e.g. TG-001 -> TG-001-A, TG-001-B, etc.)
 * for a specific marketing officer. Showroom Sale bills and Office bills share the same serial count.
 */
export function getNextSuffixBillNo(
  baseBillNo: string,
  isOfficeBill: boolean,
  existingBills: StoredBill[] = [],
  marketingPersonOrCode?: string,
  branchOrPrefix?: string
): string {
  const cleanBase = (baseBillNo || '01').trim();
  const targetMarketing = normalizeMarketingPerson(marketingPersonOrCode);
  const safeBills = Array.isArray(existingBills) ? existingBills : [];
  const targetPrefix = (branchOrPrefix ? extractBillPrefix(branchOrPrefix) || branchOrPrefix.trim().toUpperCase() : '') || extractBillPrefix(cleanBase);

  // Extract base prefix without existing trailing letter suffix if already present (e.g., "TG-001-A" -> "TG-001")
  const suffixMatch = cleanBase.match(/^(.*?)[\-_/ ]([A-Za-z])$/);
  const coreNo = suffixMatch ? suffixMatch[1].trim() : cleanBase;

  // Filter bills: Office bills and Showroom Sale bills share the same serial count partitioned by marketing officer and sales center prefix
  const sameSeriesBills = safeBills.filter((b) => {
    if (!b) return false;
    if (targetPrefix) {
      const bPrefix = extractBillPrefix(b.header?.billNo || (b as any).billNo);
      if (bPrefix && bPrefix !== targetPrefix) return false;
    }
    if (targetMarketing) {
      const bMarketing = normalizeMarketingPerson(getBillMarketingPerson(b));
      return bMarketing === targetMarketing;
    }
    return true;
  });

  const existingNumbers = new Set(
    sameSeriesBills.map((b) => (b.header?.billNo || '').trim().toLowerCase())
  );

  // Try suffixes: -A, -B, -C, ..., -Z, -AA, -AB...
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let i = 0; i < letters.length; i++) {
    const candidate = `${coreNo}-${letters[i]}`;
    if (!existingNumbers.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  // Fallback for more than 26 suffixes
  for (let i = 0; i < letters.length; i++) {
    for (let j = 0; j < letters.length; j++) {
      const candidate = `${coreNo}-${letters[i]}${letters[j]}`;
      if (!existingNumbers.has(candidate.toLowerCase())) {
        return candidate;
      }
    }
  }

  return `${coreNo}-DUP-${Date.now().toString().slice(-4)}`;
}

/**
 * Computes the next sequential numeric bill number for a marketing officer
 * across BOTH Showroom Sale bills and Office bills together (no difference in serial).
 */
export function computeNextBillNumber(
  storedBills: StoredBill[] = [],
  marketingPersonOrCode?: string
): string {
  const targetMarketing = normalizeMarketingPerson(marketingPersonOrCode);
  let maxNum = 0;
  let padLength = 2;

  const safeBills = Array.isArray(storedBills) ? storedBills : [];
  // Filter bills for this marketing officer across BOTH Showroom and Office bills
  const relevantBills = targetMarketing
    ? safeBills.filter((b) => normalizeMarketingPerson(getBillMarketingPerson(b)) === targetMarketing)
    : safeBills;

  for (const b of relevantBills) {
    const raw = b?.header?.billNo || '';
    const digitsMatch = String(raw).match(/\d+/);
    if (digitsMatch) {
      const numStr = digitsMatch[0];
      const val = parseInt(numStr, 10);
      if (!isNaN(val) && val > maxNum) {
        maxNum = val;
        if (numStr.length > padLength) {
          padLength = numStr.length;
        }
      }
    }
  }

  const nextVal = maxNum + 1;
  return String(nextVal).padStart(padLength, '0');
}

export interface BillDuplicateResult {
  isDuplicate: boolean;
  matchingBill?: StoredBill;
  suggestedBillNo: string;
  isSameType: boolean;
  isCrossTypeSameNumber: boolean;
  isCrossMarketingSameNumber?: boolean;
  otherMarketingPersonName?: string;
  message?: string;
}

/**
 * Checks if a bill number already exists.
 * Requirement: "prefix wise separate bill so no option to duplicate."
 * - Separate bills by sales center prefix (e.g. TG-, MP-, GP-, SV-) so bills with different prefixes NEVER collide.
 * - Same bill number across DIFFERENT sales center prefixes is allowed.
 * - Office bill and Showroom Sale bill share same serial maintenance.
 */
export function checkBillDuplicate(
  billNo: string,
  isOfficeBill: boolean,
  existingBills: StoredBill[] = [],
  excludeId?: string | null,
  date?: string,
  marketingPersonOrCode?: string,
  branchOrPrefix?: string
): BillDuplicateResult {
  const cleanNo = (billNo || '').trim();
  if (!cleanNo) {
    return {
      isDuplicate: false,
      suggestedBillNo: '01',
      isSameType: false,
      isCrossTypeSameNumber: false,
      isCrossMarketingSameNumber: false
    };
  }

  const safeExistingBills = Array.isArray(existingBills) ? existingBills : [];
  const targetMarketing = normalizeMarketingPerson(marketingPersonOrCode);
  const targetPrefix = (branchOrPrefix ? extractBillPrefix(branchOrPrefix) || branchOrPrefix.trim().toUpperCase() : '') || extractBillPrefix(cleanNo);

  // Look for any bill with same billNo and same sales center prefix
  const matches = safeExistingBills.filter((b) => {
    if (!b) return false;
    if (excludeId && b.id === excludeId) return false;
    const existingNo = String(b.header?.billNo || '').trim();
    if (existingNo.toLowerCase() !== cleanNo.toLowerCase()) return false;

    // "prefix wise separate bill so no option to duplicate"
    if (targetPrefix) {
      const bPrefix = extractBillPrefix(existingNo) || extractBillPrefix(b.header?.branchName || (b as any).branchName || b.header?.branchId);
      if (bPrefix && bPrefix !== targetPrefix) {
        // Different sales center prefix -> NOT a duplicate!
        return false;
      }
    }
    return true;
  });

  if (matches.length === 0) {
    return {
      isDuplicate: false,
      suggestedBillNo: cleanNo,
      isSameType: false,
      isCrossTypeSameNumber: false,
      isCrossMarketingSameNumber: false
    };
  }

  // If a marketing officer is identified on the bill:
  if (targetMarketing) {
    // Check if there is an existing bill for the SAME marketing officer (Showroom or Office)
    const sameMarketingMatch = matches.find((b) => {
      const bMarketing = normalizeMarketingPerson(getBillMarketingPerson(b));
      return bMarketing === targetMarketing;
    });

    if (sameMarketingMatch) {
      const matchParty = sameMarketingMatch.header?.partyName || 'Party';
      const matchDate = sameMarketingMatch.header?.date || '';
      const matchTotal = sameMarketingMatch.grandTotal || 0;
      const matchIsOffice = Boolean(sameMarketingMatch.isOfficeBill || sameMarketingMatch.header?.isOfficeBill);
      const matchTypeLabel = matchIsOffice ? 'Office Bill' : 'Showroom Sale Bill';
      const spLabel = marketingPersonOrCode ? ` for Marketing Officer "${marketingPersonOrCode}"` : '';
      const suggestedBillNo = getNextSuffixBillNo(cleanNo, isOfficeBill, existingBills, marketingPersonOrCode, targetPrefix);

      return {
        isDuplicate: true,
        matchingBill: sameMarketingMatch,
        suggestedBillNo,
        isSameType: true,
        isCrossTypeSameNumber: false,
        isCrossMarketingSameNumber: false,
        message: `Duplicate Invoice #${cleanNo} detected${spLabel}! Existing ${matchTypeLabel} for "${matchParty}" on ${matchDate} (৳${matchTotal.toLocaleString('en-IN')}). Prefix-wise separate series.`
      };
    }

    // Matches exist, but for DIFFERENT marketing officer(s): ALLOWED!
    const otherMatch = matches[0];
    const otherPerson = getBillMarketingPerson(otherMatch) || otherMatch.header?.partyName || 'another representative';
    return {
      isDuplicate: false,
      matchingBill: otherMatch,
      suggestedBillNo: cleanNo,
      isSameType: false,
      isCrossTypeSameNumber: false,
      isCrossMarketingSameNumber: true,
      otherMarketingPersonName: otherPerson,
      message: `Note: Bill #${cleanNo} exists for Marketing Officer "${otherPerson}", but is allowed because each marketing officer maintains their own serial count.`
    };
  }

  // If no marketing officer is specified, compare against all bills with this number & prefix
  const match = matches[0];
  const matchParty = match.header?.partyName || 'Party';
  const matchDate = match.header?.date || '';
  const matchTotal = match.grandTotal || 0;
  const matchIsOffice = Boolean(match.isOfficeBill || match.header?.isOfficeBill);
  const matchTypeLabel = matchIsOffice ? 'Office Bill' : 'Showroom Sale Bill';
  const suggestedBillNo = getNextSuffixBillNo(cleanNo, isOfficeBill, existingBills, undefined, targetPrefix);

  return {
    isDuplicate: true,
    matchingBill: match,
    suggestedBillNo,
    isSameType: true,
    isCrossTypeSameNumber: false,
    isCrossMarketingSameNumber: false,
    message: `Duplicate Invoice #${cleanNo} detected! A previous ${matchTypeLabel} exists for "${matchParty}" on ${matchDate} (৳${matchTotal.toLocaleString('en-IN')}).`
  };
}

export interface CollectionDuplicateResult {
  isDuplicate: boolean;
  duplicateType: 'exact_match' | 'mr_match' | 'none';
  matchingCollection?: CollectionMR;
  suggestedMrNo?: string;
  message?: string;
  reason?: string;
}

import { filterCollectionsBySalesCenter } from './mrNumberHelper';
import { BranchLocation, Party, Salesperson } from '../types';

/**
 * Returns a unique MR number within a Sales Center. If baseMrNo is already taken in that
 * Sales Center's existingCollections, finds the next available sequential MR number.
 */
export function getUniqueMrNo(
  baseMrNo: string,
  existingCollections: CollectionMR[] = [],
  excludeId?: string | null,
  targetSalesCenter?: string | null,
  branches: BranchLocation[] = [],
  parties: Party[] = [],
  salespersons: Salesperson[] = []
): string {
  const cleanBase = (baseMrNo || '').trim() || 'MR-01';
  const scopedCollections = targetSalesCenter
    ? filterCollectionsBySalesCenter(existingCollections, targetSalesCenter, branches, parties, salespersons)
    : existingCollections;
  const existingSet = new Set(
    scopedCollections
      .filter((c) => !excludeId || c.id !== excludeId)
      .map((c) => (c.mrNo || '').trim().toLowerCase())
      .filter(Boolean)
  );

  if (!existingSet.has(cleanBase.toLowerCase())) {
    return cleanBase;
  }

  // 1. If cleanBase matches format like "MR-01", "MR01", "MR-100", or just numbers "101"
  const prefixMatch = cleanBase.match(/^(.*?)(\d+)$/);
  if (prefixMatch) {
    const prefix = prefixMatch[1];
    const numStr = prefixMatch[2];
    const padLen = numStr.length;
    let nextNum = parseInt(numStr, 10) + 1;
    for (let i = 0; i < 500; i++) {
      const candidate = `${prefix}${String(nextNum).padStart(padLen, '0')}`;
      if (!existingSet.has(candidate.toLowerCase())) {
        return candidate;
      }
      nextNum++;
    }
  }

  // 2. Try suffix suffixes: -1, -2, -3...
  for (let i = 1; i <= 999; i++) {
    const candidate = `${cleanBase}-${i}`;
    if (!existingSet.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  // 3. Fallback timestamp
  return `${cleanBase}-${Date.now().toString().slice(-4)}`;
}

/**
 * Checks if a cash collection entry has a conflicting explicit MR number within its Sales Center.
 * Note: Same date, same party name, and same amount is allowed and NOT treated as a duplicate.
 */
export function checkCollectionDuplicate(
  date: string,
  partyName: string,
  amount: number,
  mrNo?: string,
  existingCollections: CollectionMR[] = [],
  excludeId?: string | null,
  targetSalesCenter?: string | null,
  branches: BranchLocation[] = [],
  parties: Party[] = [],
  salespersons: Salesperson[] = []
): CollectionDuplicateResult {
  const cleanParty = (partyName || '').trim().toLowerCase();
  const cleanAmount = typeof amount === 'number' ? amount : parseFloat(String(amount)) || 0;
  const cleanMrNo = (mrNo || '').trim().toLowerCase();

  if (!cleanParty || cleanAmount <= 0) {
    return { isDuplicate: false, duplicateType: 'none', suggestedMrNo: mrNo };
  }

  const suggestedMrNo = cleanMrNo
    ? getUniqueMrNo(mrNo || '', existingCollections, excludeId, targetSalesCenter, branches, parties, salespersons)
    : undefined;

  return { isDuplicate: false, duplicateType: 'none', suggestedMrNo: suggestedMrNo || mrNo };
}
