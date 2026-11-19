import { BankDeposit, CollectionMR } from '../types';
import { getPartyCleanKey, standardizePartyName } from './partyDeduplication';
import { parseDateToISO } from './dateUtils';
import { resolvePartyAndMarketing } from './partyAndMarketingResolver';
import { normalizeBankCleanName } from './bankDepositDeduplication';

export interface DuplicateDatePartyAmountGroup {
  groupId: string;
  date: string;
  partyName: string;
  amount: number;
  cashItems: CollectionMR[];
  depositItems: BankDeposit[];
  totalOccurrences: number;
}

export interface DuplicateDepositGroup {
  groupId: string;
  key: string;
  deposits: BankDeposit[];
}

/**
 * Finds groups of duplicate bank deposits (same date, same customer/party, same amount OR same date, bank, account & amount)
 */
export function findDuplicateDepositGroups(
  bankDeposits: BankDeposit[] = [],
  _collections: CollectionMR[] = []
): DuplicateDepositGroup[] {
  if (!Array.isArray(bankDeposits) || bankDeposits.length <= 1) return [];

  const map = new Map<string, BankDeposit[]>();

  for (const dep of bankDeposits) {
    if (!dep) continue;
    const date = dep.depositDate || dep.date || '';
    const isoDate = parseDateToISO(date) || date;
    const cleanBank = normalizeBankCleanName(dep.bankName);
    const amount = Math.round((Number(dep.amount) || 0) * 100);

    const resolved = resolvePartyAndMarketing(dep);
    const rawDepParty = (dep.partyName || dep.customerName || (dep as any).accountTitle || '').trim();
    const resolvedParty = resolved.partyName && resolved.partyName.toLowerCase() !== 'customer'
      ? resolved.partyName
      : (rawDepParty.toLowerCase() !== 'customer' ? rawDepParty : '');
    const partyKey = getPartyCleanKey(resolvedParty);

    if (amount <= 0) continue;

    // Group primarily by date + party + amount, or date + clean bank + amount if no party
    const key = partyKey
      ? `${isoDate}__${partyKey}__${amount}`
      : `${isoDate}__${cleanBank || 'bank'}__${amount}`;

    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(dep);
  }

  const result: DuplicateDepositGroup[] = [];
  map.forEach((deposits, key) => {
    if (deposits.length > 1) {
      result.push({
        groupId: `dep-grp-${key}`,
        key,
        deposits
      });
    }
  });

  return result;
}

/**
 * Finds candidates that have the identical Date, Party Name & Amount across Cash Collections and Bank Deposits
 */
export function findDuplicateDatePartyAmountGroups(
  bankDeposits: BankDeposit[] = [],
  collections: CollectionMR[] = [],
  acknowledgedGroupIds: string[] = []
): DuplicateDatePartyAmountGroup[] {
  const ackSet = new Set(acknowledgedGroupIds || []);
  const map = new Map<
    string,
    {
      date: string;
      partyName: string;
      amount: number;
      cashItems: CollectionMR[];
      depositItems: BankDeposit[];
    }
  >();

  // Process collections
  for (const col of collections || []) {
    if (!col || (col.amount || 0) <= 0) continue;
    const resolved = resolvePartyAndMarketing(col);
    const rawColParty = (col.partyName || (col as any).customerName || '').trim();
    const resolvedParty = resolved.partyName && resolved.partyName.toLowerCase() !== 'customer'
      ? resolved.partyName
      : (rawColParty.toLowerCase() !== 'customer' ? rawColParty : '');
    const cleanKey = getPartyCleanKey(resolvedParty);
    if (!cleanKey) continue;
    const isoDate = parseDateToISO(col.date) || col.date;
    const amount = Number(col.amount) || 0;
    const key = `${isoDate}__${cleanKey}__${Math.round(amount * 100)}`;

    if (!map.has(key)) {
      map.set(key, {
        date: col.date,
        partyName: resolved.partyName || standardizePartyName(resolvedParty),
        amount,
        cashItems: [],
        depositItems: []
      });
    }
    map.get(key)!.cashItems.push(col);
  }

  // Process deposits
  for (const dep of bankDeposits || []) {
    if (!dep || (dep.amount || 0) <= 0) continue;
    const resolved = resolvePartyAndMarketing(dep);
    const rawDepParty = (dep.partyName || dep.customerName || (dep as any).accountTitle || '').trim();
    const resolvedParty = resolved.partyName && resolved.partyName.toLowerCase() !== 'customer'
      ? resolved.partyName
      : (rawDepParty.toLowerCase() !== 'customer' ? rawDepParty : '');
    const cleanKey = getPartyCleanKey(resolvedParty);
    if (!cleanKey) continue;
    const date = dep.depositDate || dep.date || '';
    const isoDate = parseDateToISO(date) || date;
    const amount = Number(dep.amount) || 0;
    const key = `${isoDate}__${cleanKey}__${Math.round(amount * 100)}`;

    if (!map.has(key)) {
      map.set(key, {
        date,
        partyName: resolved.partyName || standardizePartyName(resolvedParty),
        amount,
        cashItems: [],
        depositItems: []
      });
    }
    map.get(key)!.depositItems.push(dep);
  }

  const groups: DuplicateDatePartyAmountGroup[] = [];
  map.forEach((entry, key) => {
    const total = entry.cashItems.length + entry.depositItems.length;
    // A group is duplicate candidate if there are multiple entries for the exact same date, party and amount
    if (total > 1) {
      const groupId = `dup-dpa-${key}`;
      if (!ackSet.has(groupId)) {
        groups.push({
          groupId,
          date: entry.date,
          partyName: entry.partyName,
          amount: entry.amount,
          cashItems: entry.cashItems,
          depositItems: entry.depositItems,
          totalOccurrences: total
        });
      }
    }
  });

  return groups;
}
