import { Party, StoredBill, Salesperson } from '../types';

/**
 * Normalizes cable description by cleaning punctuation, casing, spacing, and sizing abbreviations.
 */
export function normalizeCableDescription(name: string): string {
  if (!name) return '';
  return name
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[/\\_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes cable quantity and length rules (e.g., converting 500m / meters / coils if needed).
 */
export function applyCableQuantityAndLengthRule(
  description: string,
  quantity: number,
  unit?: string
): {
  normalizedDescription: string;
  displayQty: number;
  displayUnit: string;
  isConverted: boolean;
  convertedFromMeters?: boolean;
} {
  const normDesc = normalizeCableDescription(description || '');
  const cleanUnit = (unit || 'Coils').trim();
  const qty = Number(quantity) || 0;

  return {
    normalizedDescription: normDesc || description,
    displayQty: qty,
    displayUnit: cleanUnit,
    isConverted: false,
    convertedFromMeters: false
  };
}

/**
 * Returns line coil equivalent for tallying total coils on bills or challans.
 */
export function getLineCoilEquivalent(coilQty: number, unit?: string, itemDescription?: string): number {
  const q = Number(coilQty) || 0;
  if (!unit) return q;
  const u = unit.trim().toLowerCase();
  if (u.includes('bobin') || u.includes('500m') || u.includes('500 m')) {
    return q * 5;
  }
  return q;
}

/**
 * Identifies the salesman code for a party from the existing parties, stored bills, or salespersons list.
 */
export function identifySalesmanCodeForParty(
  partyName: string,
  parties: Party[] = [],
  storedBills: StoredBill[] = [],
  salespersons: Salesperson[] = []
): string | undefined {
  if (!partyName) return undefined;
  const pNorm = partyName.trim().toLowerCase();

  // 1. Check directory parties
  const matchedParty = parties.find(
    (p) => p.name && p.name.trim().toLowerCase() === pNorm
  );
  if (matchedParty?.salesmanCode) {
    return matchedParty.salesmanCode;
  }

  // 2. Check previous stored bills for this party
  const previousBill = storedBills.find(
    (b) => b.header?.partyName && b.header.partyName.trim().toLowerCase() === pNorm && b.header.salesmanCode
  );
  if (previousBill?.header?.salesmanCode) {
    return previousBill.header.salesmanCode;
  }

  return undefined;
}
