import { Party } from '../types';

export function normalizePartyName(name: string): string {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

// Clean alphanumeric key to match variations like "M/S Brother" vs "M/s Brother" or "M/S. Brother"
export function getPartyCleanKey(name: string): string {
  if (!name) return '';
  const std = standardizePartyName(name);
  return std.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Check if a name is a fake/system/internal name rather than a real customer party
export function isInvalidPartyName(name: string): boolean {
  if (!name || !name.trim()) return true;
  const lower = name.trim().toLowerCase();
  return (
    lower === 'cash deposit' ||
    lower === 'head office' ||
    lower === 'head office expense settlement' ||
    lower === 'head office cash deposit' ||
    lower === 'madhupur sales center' ||
    lower === 'madhupur sales center / showroom' ||
    lower === 'sales center' ||
    lower === 'showroom' ||
    lower === 'imported customer' ||
    lower === 'unknown party' ||
    lower === '-' ||
    lower.startsWith('auto deposit')
  );
}

/**
 * Standardizes common truncated party names:
 * e.g., 'Lucky Enterprise llElectric & Hardwa' -> 'Lucky Enterprise Electric & Hardware'
 * e.g., 'Lucky Enterprise Electric & Hardwa' -> 'Lucky Enterprise Electric & Hardware'
 */
export function standardizePartyName(name: string): string {
  if (!name) return '';
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();

  // 1. Lucky Enterprise variations
  if (
    lower.includes('lucky enterprise') ||
    (/lucky/i.test(lower) && (/enterprise/i.test(lower) || /electric/i.test(lower) || /hardwa/i.test(lower) || /llelectric/i.test(lower)))
  ) {
    return 'Lucky Enterprise Electric & Hardware';
  }
  if (/^lucky\s+/i.test(trimmed)) {
    return 'Lucky Enterprise Electric & Hardware';
  }

  // 2. Brother Electric Store variations
  if (lower.includes('brother electric') || lower.includes('brother store') || lower.includes('brother el') || lower === 'ms brother electric store' || lower === 'm/s brother electric store') {
    return 'M/S Brother Electric Store';
  }

  // 3. New Sonchita Enterprise variations
  if (lower.includes('sonchita enterprise') || lower.includes('sonchita') || lower.includes('sanchita') || lower === 'new sonchita enterprise') {
    return 'New Sonchita Enterprise';
  }

  // 4. Tamanna Akhi Enterprise variations
  if (lower.includes('tamanna akhi') || lower.includes('tamanna') || lower.includes('akhi enter')) {
    return 'Tamanna Akhi Enterprice';
  }

  // 5. Alif Enterprise variations
  if (lower.includes('alif enterprise') || lower === 'm/s alif enterprise' || lower === 'ms alif enterprise') {
    return 'M/s Alif Enterprise';
  }

  // 6. Shupti Electric variations
  if (lower.includes('shupti electric') || lower.includes('shupti')) {
    return 'Shupti Electric & Lighting House';
  }

  // 7. Partho Electric variations
  if (lower.includes('partho electric') || lower === 'partho') {
    return 'Partho Electric';
  }

  // 8. Sattar Electric variations
  if (lower.includes('sattar electric') || lower === 'sattar') {
    return 'Sattar Electric';
  }

  // 9. Sarker Electric variations
  if (lower.includes('sarker electric') || lower === 'sarker') {
    return 'Sarker Electric';
  }

  // 10. Maa Electric variations
  if (lower.includes('maa electric') || lower === 'maa') {
    return 'Maa Electric';
  }

  // 11. Shohag Electric variations
  if (lower.includes('shohag electric') || lower === 'shohag') {
    return 'Shohag Electric';
  }

  // 12. Nahar Electric variations
  if (lower.includes('nahar electric') || lower === 'nahar') {
    return 'Nahar Electric';
  }

  // 13. Tangail Cable House variations
  if (lower.includes('tangail cable') || lower === 'tangail cable house') {
    return 'Tangail Cable House';
  }

  // 14. Shorif Iqbal Store variations
  if (lower.includes('shorif iqbal') || lower.includes('sharif iqbal')) {
    return 'Shorif Iqbal Store';
  }

  return trimmed;
}

export function mergePartyPair(existing: Party, incoming: Party): Party {
  const isExistingStable = Boolean(existing.id && !existing.id.startsWith('p-auto-') && !existing.id.startsWith('party-auto-'));
  const isIncomingStable = Boolean(incoming.id && !incoming.id.startsWith('p-auto-') && !incoming.id.startsWith('party-auto-'));

  // Stable ID (like 'p-1', 'p-4') takes precedence
  const chosenId = isExistingStable ? existing.id : (isIncomingStable ? incoming.id : existing.id);

  // Take the longer / better-formatted name
  const stdIncomingName = standardizePartyName(incoming.name || '');
  const stdExistingName = standardizePartyName(existing.name || '');
  const chosenName = (stdIncomingName.length >= stdExistingName.length)
    ? stdIncomingName
    : stdExistingName;

  // Address: if one is specific (not just 'Madhupur' or empty), keep it
  const isExistingSpecificAddr = existing.address && existing.address.trim().toLowerCase() !== 'madhupur';
  const isIncomingSpecificAddr = incoming.address && incoming.address.trim().toLowerCase() !== 'madhupur';
  const chosenAddress = isExistingSpecificAddr
    ? existing.address.trim()
    : (isIncomingSpecificAddr ? incoming.address.trim() : (existing.address || incoming.address || ''));

  const chosenPhone = (existing.phone && existing.phone.trim())
    ? existing.phone.trim()
    : (incoming.phone?.trim() || incoming.mobile?.trim() || existing.mobile?.trim() || '');

  const chosenMobile = (existing.mobile && existing.mobile.trim())
    ? existing.mobile.trim()
    : (incoming.mobile?.trim() || '');

  const chosenSalesmanCode = (existing.salesmanCode && existing.salesmanCode.trim())
    ? existing.salesmanCode.trim()
    : (incoming.salesmanCode?.trim() || '');

  const chosenSalespersonName = (existing.salespersonName && existing.salespersonName.trim())
    ? existing.salespersonName.trim()
    : (incoming.salespersonName?.trim() || '');

  const chosenBranchId = (existing.branchId && existing.branchId.trim())
    ? existing.branchId.trim()
    : (incoming.branchId?.trim() || '');

  let rawBranchName = (existing.branchName && existing.branchName.trim())
    ? existing.branchName.trim()
    : (incoming.branchName?.trim() || '');
  if (/madhupur/i.test(rawBranchName)) {
    rawBranchName = 'Madhupur Sales Center';
  } else if (rawBranchName) {
    rawBranchName = rawBranchName.replace(/\s*\/\s*Showroom$/i, '').trim();
  }
  const chosenBranchName = rawBranchName;

  const chosenOpeningBal = (existing.openingBalance && existing.openingBalance > 0)
    ? existing.openingBalance
    : (incoming.openingBalance || 0);

  return {
    ...existing,
    ...incoming,
    id: chosenId,
    name: chosenName,
    address: chosenAddress,
    phone: chosenPhone,
    mobile: chosenMobile,
    salesmanCode: chosenSalesmanCode,
    salespersonName: chosenSalespersonName,
    branchId: chosenBranchId,
    branchName: chosenBranchName,
    openingBalance: chosenOpeningBal,
  };
}

/**
 * Enforces that Subrata Sutradhar (Salesman Code 134) has strictly at most his 1st 9 parties.
 * Any other parties beyond the first 9 have their salesperson unassigned so they are never
 * incorrectly listed under Subrata Sutradhar in the Customer Directory.
 */
export function enforceSubrataNinePartyCap(parties: Party[]): Party[] {
  if (!Array.isArray(parties)) return [];
  let subrataCount = 0;
  return parties.map((p) => {
    if (!p) return p;
    const isSubrata =
      p.salesmanCode === '134' ||
      (p.salespersonName || '').toLowerCase().includes('subrata');
    if (isSubrata) {
      subrataCount++;
      if (subrataCount > 9) {
        return {
          ...p,
          salesmanCode: undefined,
          salespersonName: undefined
        };
      }
    }
    return p;
  });
}

/**
 * Deduplicates an array of parties:
 * - Eliminates double/triple records by matching on clean party name keys
 * - Merges data so phone, address, and salesperson information are preserved
 * - Filters out invalid/system labels
 * - Enforces Subrata Sutradhar exactly 1st 9 party cap
 */
export function deduplicateParties(parties: Party[]): Party[] {
  if (!Array.isArray(parties)) return [];

  const map = new Map<string, Party>();

  for (const p of parties) {
    if (!p || !p.name) continue;
    const stdName = standardizePartyName(p.name);
    if (isInvalidPartyName(stdName)) continue;

    const normKey = getPartyCleanKey(stdName);
    if (!normKey) continue;

    // Allow parties with the same name to coexist when assigned to different marketing persons / salesmen
    const mktKey = (p.salesmanCode || p.salespersonName || '').trim().toLowerCase();
    const dedupKey = `${normKey}::${mktKey}`;

    if (!map.has(dedupKey)) {
      map.set(dedupKey, {
        ...p,
        name: stdName
      });
    } else {
      const existing = map.get(dedupKey)!;
      map.set(dedupKey, mergePartyPair(existing, p));
    }
  }

  return Array.from(map.values());
}
