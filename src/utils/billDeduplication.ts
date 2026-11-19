import { StoredBill } from '../types';

/**
 * Deduplicates a list of stored bills based on:
 * 1. Unique Bill ID
 * 2. Combination of Bill No + Office Bill Flag + Date + Party Name
 */
function normalizeBranchDedupeKey(bill: StoredBill): string {
  const header = bill.header || ({} as any);
  let branchId = String(header.branchId || bill.branchId || '').trim().toLowerCase();
  if (branchId === 'branch-main' || branchId === 'branch_main') branchId = 'branch-1';
  if (branchId === 'all' || branchId === 'all sales centers' || branchId === 'all branches') branchId = '';
  if (branchId) return branchId;
  let branchName = String(header.branchName || bill.branchName || '').trim().toLowerCase();
  if (branchName === 'all' || branchName === 'all sales centers' || branchName === 'all branches') branchName = '';
  return branchName.replace(/[^a-z0-9]/g, '');
}

function getBillFreshnessMs(bill: StoredBill): number {
  const raw =
    (bill as any)?.updatedAt ??
    (bill as any)?.modifiedAt ??
    (bill.header as any)?.updatedAt ??
    bill.savedAt ??
    (bill as any)?.createdAt ??
    0;
  if (typeof raw === 'number') return raw;
  const parsed = raw ? Date.parse(String(raw)) : 0;
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function deduplicateBills(bills: StoredBill[] = []): StoredBill[] {
  if (!Array.isArray(bills) || bills.length <= 1) return bills || [];

  const result: StoredBill[] = [];
  const idToIndex = new Map<string, number>();
  const businessKeyToIndex = new Map<string, number>();

  for (const bill of bills) {
    if (!bill) continue;

    const billId = String(bill.id || '').trim();
    const header = bill.header || ({} as any);
    const branchKey = normalizeBranchDedupeKey(bill);
    const billNo = String(header.billNo || '').trim().toLowerCase();
    const isOffice = Boolean(header.isOfficeBill);
    const date = String(header.date || '').trim();
    const partyName = String(header.partyName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const bKey = billNo ? `${branchKey}__${isOffice ? 'off' : 'reg'}__${billNo}__${date}__${partyName}` : '';

    const existingIdx =
      (billId && idToIndex.has(billId) ? idToIndex.get(billId) : undefined) ??
      (bKey && businessKeyToIndex.has(bKey) ? businessKeyToIndex.get(bKey) : undefined);

    if (existingIdx !== undefined) {
      const existing = result[existingIdx];
      if (getBillFreshnessMs(bill) > getBillFreshnessMs(existing)) {
        result[existingIdx] = bill;
        if (billId) idToIndex.set(billId, existingIdx);
        if (bKey) businessKeyToIndex.set(bKey, existingIdx);
      }
      continue;
    }

    const nextIdx = result.length;
    result.push(bill);
    if (billId) idToIndex.set(billId, nextIdx);
    if (bKey) businessKeyToIndex.set(bKey, nextIdx);
  }

  return result;
}

/**
 * Counts how many duplicate bills exist in the provided list
 */
export function countDuplicateBills(bills: StoredBill[] = []): number {
  if (!Array.isArray(bills) || bills.length <= 1) return 0;
  const deduped = deduplicateBills(bills);
  return Math.max(0, bills.length - deduped.length);
}
