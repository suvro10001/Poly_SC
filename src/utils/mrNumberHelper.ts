import { BankDeposit, BranchLocation, CollectionMR, Party, Salesperson } from '../types';

function stripCenterSuffix(raw?: string | null): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/poly\s*cables\s*(ind\.?\s*ltd\.?)?/gi, '')
    .replace(/\b(sales\s*center|showroom|branch)\b/gi, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function resolveEntityToSalesCenter(
  entity?: string | null,
  branches: BranchLocation[] = [],
  salespersons: Salesperson[] = []
): string {
  const raw = String(entity || '').trim();
  if (!raw) return '';

  const low = raw.toLowerCase();
  const stripped = stripCenterSuffix(raw);

  // 1. Direct match against configured branches
  for (const b of branches || []) {
    if (!b) continue;
    const bId = (b.id || '').toLowerCase().trim();
    const bName = (b.name || '').toLowerCase().trim();
    const bStripped = stripCenterSuffix(b.name);
    if (
      (bId && bId === low) ||
      (bName && bName === low) ||
      (stripped && bStripped && bStripped === stripped)
    ) {
      return b.name;
    }
  }

  // 2. Match via Salesperson name / code / username
  const sp = (salespersons || []).find((s) => {
    if (!s) return false;
    const sName = (s.name || '').toLowerCase().trim();
    const sCode = (s.code || '').toLowerCase().trim();
    const sUser = (s.username || '').toLowerCase().trim();
    return (sName && sName === low) || (sCode && sCode === low) || (sUser && sUser === low);
  });

  if (sp) {
    if (sp.branchId) {
      const spBranch = (branches || []).find((b) => b.id === sp.branchId);
      if (spBranch?.name) return spBranch.name;
    }
    if (sp.branchName) {
      return resolveEntityToSalesCenter(sp.branchName, branches, []) || sp.branchName;
    }
  }

  return raw;
}

export function resolveCollectionSalesCenterKey(
  record: { branchId?: string; branchName?: string; entityName?: string; partyName?: string; customerName?: string; marketingPerson?: string; salesmanCode?: string },
  branches: BranchLocation[] = [],
  parties: Party[] = [],
  salespersons: Salesperson[] = []
): { branchId: string; normalizedName: string } {
  let bId = String(record.branchId || '').trim();
  if (bId === 'branch-main') bId = 'branch-1';

  const rawCenter = String(record.branchName || record.entityName || '').trim();
  let explicitResolvedName = '';
  if (rawCenter) {
    explicitResolvedName = resolveEntityToSalesCenter(rawCenter, branches, salespersons);
    const matchB = (branches || []).find(
      (b) =>
        b.name.toLowerCase().trim() === explicitResolvedName.toLowerCase().trim() ||
        (stripCenterSuffix(explicitResolvedName) && stripCenterSuffix(b.name) === stripCenterSuffix(explicitResolvedName))
    );
    // Trust explicit branch/entity name if branchId is missing OR stale/conflicting (e.g. legacy 'branch-1' fallback)
    if (matchB && (!bId || bId !== matchB.id)) {
      bId = matchB.id;
    } else if (!matchB && bId) {
      const idBranch = (branches || []).find((b) => b.id === bId);
      const idStripped = stripCenterSuffix(idBranch?.name);
      const rawStripped = stripCenterSuffix(explicitResolvedName || rawCenter);
      if (idStripped && rawStripped && idStripped !== rawStripped) {
        bId = '';
      }
    }
  }

  if (!bId && (record.partyName || record.customerName)) {
    const pLow = String(record.partyName || record.customerName || '').toLowerCase().trim();
    const matchedParty = (parties || []).find((p) => (p.name || '').toLowerCase().trim() === pLow);
    if (matchedParty?.branchId) bId = matchedParty.branchId === 'branch-main' ? 'branch-1' : matchedParty.branchId;
    else if (matchedParty?.branchName) {
      const matchB = (branches || []).find((b) => stripCenterSuffix(b.name) === stripCenterSuffix(matchedParty.branchName));
      if (matchB) bId = matchB.id;
    }
  }

  if (!bId && (record.salesmanCode || record.marketingPerson)) {
    const sCode = String(record.salesmanCode || '').toLowerCase().trim();
    const sName = String(record.marketingPerson || '').toLowerCase().trim();
    const matchedSp = (salespersons || []).find(
      (s) => (sCode && (s.code || '').toLowerCase().trim() === sCode) || (sName && (s.name || '').toLowerCase().trim() === sName)
    );
    if (matchedSp?.branchId) bId = matchedSp.branchId === 'branch-main' ? 'branch-1' : matchedSp.branchId;
    else if (matchedSp?.branchName) {
      const matchB = (branches || []).find((b) => stripCenterSuffix(b.name) === stripCenterSuffix(matchedSp.branchName));
      if (matchB) bId = matchB.id;
    }
  }

  const branchObj = (branches || []).find((b) => b.id === bId);
  const normalizedName = stripCenterSuffix(branchObj?.name || explicitResolvedName || rawCenter);
  return {
    branchId: bId.toLowerCase(),
    normalizedName,
  };
}

export function filterCollectionsBySalesCenter(
  collections: CollectionMR[] = [],
  salesCenterName?: string | null,
  branches: BranchLocation[] = [],
  parties: Party[] = [],
  salespersons: Salesperson[] = []
): CollectionMR[] {
  const targetCenterRaw = resolveEntityToSalesCenter(salesCenterName, branches, salespersons) || String(salesCenterName || '').trim();
  if (!targetCenterRaw) return collections || [];

  const targetBranch = (branches || []).find(
    (b) =>
      b.id.toLowerCase() === targetCenterRaw.toLowerCase() ||
      b.name.toLowerCase().trim() === targetCenterRaw.toLowerCase().trim() ||
      (targetCenterRaw && stripCenterSuffix(b.name) === stripCenterSuffix(targetCenterRaw))
  );
  const targetBranchId = (targetBranch?.id || '').toLowerCase();
  const targetStripped = stripCenterSuffix(targetBranch?.name || targetCenterRaw);

  if (!targetStripped && !targetBranchId) return collections || [];

  return (collections || []).filter((col) => {
    if (!col) return false;
    const key = resolveCollectionSalesCenterKey(col, branches, parties, salespersons);
    return Boolean(
      (targetBranchId && key.branchId && key.branchId === targetBranchId) ||
      (targetStripped && key.normalizedName && key.normalizedName === targetStripped)
    );
  });
}

export function isSameSalesCenterForDepositMatch(
  col: CollectionMR,
  dep: BankDeposit,
  branches: BranchLocation[] = [],
  parties: Party[] = [],
  salespersons: Salesperson[] = []
): boolean {
  if (!col || !dep) return false;
  const colKey = resolveCollectionSalesCenterKey(col, branches, parties, salespersons);
  const depKey = resolveCollectionSalesCenterKey(dep, branches, parties, salespersons);

  if (colKey.branchId && depKey.branchId) {
    return colKey.branchId === depKey.branchId;
  }
  if (colKey.normalizedName && depKey.normalizedName) {
    return colKey.normalizedName === depKey.normalizedName;
  }
  return true;
}

export function matchesMrTokenExact(text?: string | null, mrNo?: string | null): boolean {
  const hay = String(text || '').trim();
  const needle = String(mrNo || '').trim();
  if (!hay || !needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i');
  return re.test(hay);
}

export function computeNextSalesCenterMrNo(
  collections: CollectionMR[] = [],
  salesCenterName?: string | null,
  branches: BranchLocation[] = [],
  parties: Party[] = [],
  salespersons: Salesperson[] = []
): string {
  const targetCenterRaw = resolveEntityToSalesCenter(salesCenterName, branches, salespersons) || String(salesCenterName || '').trim();
  const targetBranch = (branches || []).find(
    (b) =>
      b.id.toLowerCase() === targetCenterRaw.toLowerCase() ||
      b.name.toLowerCase().trim() === targetCenterRaw.toLowerCase().trim() ||
      (targetCenterRaw && stripCenterSuffix(b.name) === stripCenterSuffix(targetCenterRaw))
  );
  const targetBranchId = (targetBranch?.id || '').toLowerCase();
  const targetStripped = stripCenterSuffix(targetBranch?.name || targetCenterRaw);
  const hasTarget = Boolean(targetStripped || targetBranchId);

  let maxNum = 0;
  let prefix = 'MR-';
  let padLen = 2;

  for (const col of collections || []) {
    if (!col || !col.mrNo) continue;
    if (hasTarget) {
      const key = resolveCollectionSalesCenterKey(col, branches, parties, salespersons);
      const matchesBranch =
        (targetBranchId && key.branchId && key.branchId === targetBranchId) ||
        (targetStripped && key.normalizedName && key.normalizedName === targetStripped);
      if (!matchesBranch) continue;
    }

    const mrTrim = col.mrNo.trim();
    // Skip cheque-prefixed, closing, adjustment, or system-generated references
    if (/^(cq-|mr-close|ye-close|mr-restore|adj-|close-)/i.test(mrTrim)) continue;
    const m = mrTrim.match(/^(.*?)(\d+)$/);
    if (m && m[2].length <= 5) {
      const val = parseInt(m[2], 10);
      if (!isNaN(val) && val > maxNum) {
        maxNum = val;
        if (m[1]) prefix = m[1];
        if (m[2].length > padLen) padLen = m[2].length;
      }
    }
  }

  return `${prefix}${String(maxNum + 1).padStart(padLen, '0')}`;
}
