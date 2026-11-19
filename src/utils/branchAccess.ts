import {
  AuthUser,
  BranchLocation,
  Salesperson,
  StoredBill,
  CollectionMR,
  StockReturnChallan,
  ExpenseEntry,
  Requisition,
  BankDeposit,
  Party,
  DeliveryChallan
} from '../types';
import { getSalesCenterPrefix } from './salesCenterHelper';

export function isSuvroAdmin(user: AuthUser | Salesperson | null | undefined): boolean {
  if (!user) return false;
  const username = ((user as any).username || '').toLowerCase().trim();
  const code = ((user as any).salespersonCode || (user as any).code || '').toLowerCase().trim();
  const name = ((user as any).name || '').toLowerCase().trim();
  const role = (((user as any).role || '') + ' ' + ((user as any).userRole || '')).toLowerCase().trim();
  const email = ((user as any).email || '').toLowerCase().trim();
  return (
    username === 'suvroadmin' ||
    username === 'suvro' ||
    code === 'suvroadmin' ||
    name === 'suvroadmin' ||
    username.includes('suvroadmin') ||
    name.includes('suvroadmin') ||
    role.includes('suvroadmin') ||
    email.startsWith('suvroadmin')
  );
}

export function isStrictSuperAdmin(user: AuthUser | Salesperson | null | undefined): boolean {
  if (!user) return false;
  const username = ((user as any).username || '').toLowerCase().trim();
  const code = ((user as any).salespersonCode || (user as any).code || '').toLowerCase().trim();
  const role = (user.role || '').toLowerCase().trim();
  const userRole = ((user as any).userRole || '').toLowerCase().trim();

  if (
    username === 'suvroadmin' ||
    username === 'suvro' ||
    code === 'suvroadmin' ||
    (user as any).isSuperAdmin === true ||
    role === 'super admin' ||
    userRole === 'super admin' ||
    role === 'super_admin' ||
    userRole === 'super_admin'
  ) {
    return true;
  }
  return false;
}


export function isAccountsAdmin(user: AuthUser | Salesperson | null | undefined): boolean {
  if (!user) return false;
  if (isStrictSuperAdmin(user)) return false;
  const roleLower = (user.role || '').toLowerCase();
  const userRoleLower = ((user as any).userRole || '').toLowerCase();
  return (roleLower.includes('admin') && roleLower.includes('account')) || (userRoleLower.includes('admin') && userRoleLower.includes('account'));
}

export function isAnyAdmin(user: AuthUser | Salesperson | null | undefined): boolean {
  if (!user) return false;
  if (isStrictSuperAdmin(user)) return true;
  const roleLower = (user.role || '').toLowerCase();
  const userRoleLower = ((user as any).userRole || '').toLowerCase();
  return (
    roleLower === 'admin' ||
    roleLower === 'agm' ||
    roleLower.includes('admin') ||
    userRoleLower.includes('admin') ||
    userRoleLower.includes('director') ||
    userRoleLower.includes('agm')
  );
}

export function isDefaultAdmin(
  sp?: { id?: string; code?: string; username?: string; name?: string; role?: string; isSuperAdmin?: boolean } | null
): boolean {
  if (!sp) return false;
  const username = (sp.username || '').toLowerCase().trim();
  const code = (sp.code || '').toLowerCase().trim();
  const name = (sp.name || '').toLowerCase().trim();

  // Root Super Admin account retains system session integrity, all individual regional admins can be edited and deleted
  return (
    Boolean(sp.isSuperAdmin) ||
    username === 'suvroadmin' ||
    code === 'suvroadmin' ||
    name === 'suvroadmin'
  );
}

export const DEFAULT_ADMIN_BRANCH_IDS = new Set<string>([
  'branch-ho',
  'branch-pm',
  'branch-gazipur',
  'branch-narayanganj',
  'branch-mirpur',
  'branch-1',
  'branch-mymensingh',
  'branch-ctg',
  'branch-comilla',
  'branch-feni',
  'branch-noakhali',
  'branch-sylhet'
]);

export function isProtectedSalesCenter(
  branch?: { id?: string; name?: string; type?: string } | null,
  salespersons: Salesperson[] = []
): boolean {
  if (!branch) return false;
  const id = (branch.id || '').toLowerCase().trim();
  const name = (branch.name || '').toLowerCase().trim();

  if (branch.type === 'head_office' || name.includes('head office')) return true;
  if (DEFAULT_ADMIN_BRANCH_IDS.has(id)) return true;

  // Check if assigned to any default admin in salespersons
  return salespersons.some((s) => {
    if (!isDefaultAdmin(s)) return false;
    if (s.branchId && s.branchId.toLowerCase() === id) return true;
    if (s.assignedBranchIds && s.assignedBranchIds.some((bId) => bId.toLowerCase() === id)) return true;
    return false;
  });
}

export function isDefaultBranch(
  branch?: { id?: string; name?: string } | null,
  defaultList: BranchLocation[] = []
): boolean {
  if (!branch) return false;
  const id = (branch.id || '').toLowerCase();
  const name = (branch.name || '').toLowerCase().trim();
  if (DEFAULT_ADMIN_BRANCH_IDS.has(id)) return true;
  return defaultList.some(
    (db) => db.id.toLowerCase() === id || db.name.toLowerCase().trim() === name
  );
}

export function isRegionalAdmin(
  user: AuthUser | null | undefined,
  salespersons: Salesperson[] = []
): boolean {
  if (!user) return false;
  if (isStrictSuperAdmin(user)) return false;
  return isAnyAdmin(user);
}

export function getAdminBranches(
  user: AuthUser | null | undefined,
  branches: BranchLocation[],
  salespersons: Salesperson[] = []
): BranchLocation[] {
  if (!user) return branches;
  if (isStrictSuperAdmin(user)) return branches;

  const userLower = (user.username || '').trim().toLowerCase();
  const nameLower = (user.name || '').trim().toLowerCase();
  const spCodeLower = ((user as any).salespersonCode || (user as any).code || '').trim().toLowerCase();

  const sp = salespersons.find(
    (s) =>
      (spCodeLower && s.code && s.code.trim().toLowerCase() === spCodeLower) ||
      (userLower && s.code && s.code.trim().toLowerCase() === userLower) ||
      (userLower && s.username && s.username.trim().toLowerCase() === userLower) ||
      (nameLower && s.name && s.name.trim().toLowerCase() === nameLower)
  );

  const assignedIds = new Set<string>([
    ...(user.assignedBranchIds || []),
    ...(sp?.assignedBranchIds || [])
  ]);

  const spNameLower = (sp?.name || '').trim().toLowerCase();
  const spUsernameLower = (sp?.username || '').trim().toLowerCase();

  const matched = branches.filter((b) => {
    if (assignedIds.has(b.id)) return true;
    const bAdminId = (b.adminId || '').trim().toLowerCase();
    const bAssignedAdminId = (b.assignedAdminId || '').trim().toLowerCase();
    const bAdminUser = (b.adminUsername || '').trim().toLowerCase();
    const bAdminName = (b.adminName || '').trim().toLowerCase();

    if (bAdminId && ((userLower && bAdminId === userLower) || (spCodeLower && bAdminId === spCodeLower) || (sp && b.adminId === sp.id))) return true;
    if (bAssignedAdminId && ((userLower && bAssignedAdminId === userLower) || (spCodeLower && bAssignedAdminId === spCodeLower) || (sp && b.assignedAdminId === sp.id))) return true;
    if (bAdminUser && ((userLower && bAdminUser === userLower) || (spUsernameLower && bAdminUser === spUsernameLower))) return true;
    if (bAdminName && ((nameLower && (bAdminName.includes(nameLower) || nameLower.includes(bAdminName))) || (spNameLower && (bAdminName.includes(spNameLower) || spNameLower.includes(bAdminName))))) return true;
    return false;
  });

  if (matched.length > 0) return matched;

  if (user.branchId && user.branchId.toLowerCase().trim() !== 'all') {
    const uBid = user.branchId.toLowerCase().trim();
    const single = branches.filter((b) => b.id.toLowerCase().trim() === uBid || cleanBranchName(b.name).toLowerCase() === cleanBranchName(user.branchName || '').toLowerCase());
    if (single.length > 0) return single;
  }

  const zone = (user.adminZone || sp?.adminZone || user.areaGroup || sp?.areaGroup || '').trim().toLowerCase();
  if (zone) {
    const zoneBranches = branches.filter((b) => {
      const bZone = ((b as any).adminZone || (b as any).areaGroup || b.adminName || '').trim().toLowerCase();
      return Boolean(bZone) && (bZone.includes(zone) || zone.includes(bZone));
    });
    if (zoneBranches.length > 0) return zoneBranches;
  }

  // Strict isolation: never leak other admins' sales centers
  return [];
}

export interface AdminClusterInfo {
  adminId: string;
  adminName: string;
  adminUsername: string;
  adminZone?: string;
  branches: BranchLocation[];
  branchCount: number;
  staffCount?: number;
}

export function getAllAdmins(
  salespersons: Salesperson[] = [],
  branches: BranchLocation[] = []
): AdminClusterInfo[] {
  const map = new Map<string, AdminClusterInfo>();

  // Discover real Regional Admins from registered salespersons
  const regionalAdminSalespersons = salespersons.filter((sp) => {
    if (!sp) return false;
    const spCodeLower = (sp.code || '').toLowerCase().trim();
    const spUsernameLower = (sp.username || '').toLowerCase().trim();
    const spNameLower = (sp.name || '').toLowerCase().trim();
    const spIdLower = (sp.id || '').toLowerCase().trim();

    if (
      spCodeLower === 'suvroadmin' ||
      spUsernameLower === 'suvroadmin' ||
      spNameLower === 'suvroadmin' ||
      spIdLower === 'suvroadmin' ||
      sp.isSuperAdmin ||
      sp.role?.toLowerCase() === 'super admin' ||
      spNameLower === 'admin' ||
      spUsernameLower === 'admin' ||
      spCodeLower === 'admin' ||
      spCodeLower === '111' ||
      spUsernameLower === '111' ||
      spIdLower === '111' ||
      spCodeLower === 'adm-111' ||
      spIdLower === 'adm-mahmudul' ||
      spIdLower === 'adm-subrata' ||
      spIdLower === 'adm-rashidul' ||
      spUsernameLower === 'admin1' ||
      spUsernameLower === 'admin2' ||
      spUsernameLower === 'admin3'
    ) {
      return false;
    }

    const roleLower = (sp.role || '').toLowerCase();
    return (
      roleLower === 'admin' ||
      sp.role === 'Admin' ||
      roleLower.includes('admin') ||
      roleLower.includes('agm')
    );
  });

  if (regionalAdminSalespersons.length > 0) {
    regionalAdminSalespersons.forEach((sp) => {
      const assigned: BranchLocation[] = [];
      const seenBranchIds = new Set<string>();

      // 1. Multi-branch assignments from sp.assignedBranchIds
      if (Array.isArray(sp.assignedBranchIds) && sp.assignedBranchIds.length > 0) {
        sp.assignedBranchIds.forEach((bId) => {
          if (!seenBranchIds.has(bId)) {
            seenBranchIds.add(bId);
            const found = branches.find((b) => b.id === bId);
            if (found) assigned.push(found);
          }
        });
      }

      // 2. Direct branch assignment
      if (sp.branchId && !seenBranchIds.has(sp.branchId)) {
        seenBranchIds.add(sp.branchId);
        const found = branches.find((b) => b.id === sp.branchId);
        if (found) assigned.push(found);
      }

      // 3. Branches with adminId or adminName matching this salesperson
      branches.forEach((b) => {
        if (!seenBranchIds.has(b.id)) {
          const matchAdmin =
            (b.adminId && (b.adminId === sp.id || b.adminId === sp.code || b.adminId === sp.username)) ||
            (b.adminUsername && (b.adminUsername === sp.username || b.adminUsername === sp.code)) ||
            (b.adminName && b.adminName.toLowerCase().trim() === sp.name.toLowerCase().trim());
          if (matchAdmin) {
            seenBranchIds.add(b.id);
            assigned.push(b);
          }
        }
      });

      // 4. If no specific branches mapped, check admin zone
      if (assigned.length === 0 && (sp.adminZone || sp.areaGroup)) {
        const zoneLower = (sp.adminZone || sp.areaGroup || '').toLowerCase().trim();
        branches.forEach((b) => {
          if (!seenBranchIds.has(b.id)) {
            const bZone = ((b as any).adminZone || (b as any).areaGroup || b.adminName || '').toLowerCase();
            if (bZone && (bZone.includes(zoneLower) || zoneLower.includes(bZone))) {
              seenBranchIds.add(b.id);
              assigned.push(b);
            }
          }
        });
      }

      // If this admin has assigned branches or is configured, register their cluster
      if (assigned.length > 0) {
        map.set(sp.id, {
          adminId: sp.id,
          adminName: sp.name,
          adminUsername: sp.username || sp.code,
          adminZone: sp.adminZone || sp.areaGroup || 'Regional Zone',
          branches: assigned,
          branchCount: assigned.length
        });
      }
    });
  }

  return Array.from(map.values())
    .map((c) => ({
      ...c,
      branches: c.branches
        .filter((b) => !isUnwantedSalesCenter(b))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
      branchCount: c.branches.filter((b) => !isUnwantedSalesCenter(b)).length
    }))
    .filter((c) => c.branches && c.branches.length > 0);
}

/**
 * Strict and robust matcher to determine if a collection belongs to a specific branch/sales center.
 */
export function collectionMatchesBranch(
  c: CollectionMR,
  targetBranchId: string,
  branches: BranchLocation[] = [],
  salespersons: Salesperson[] = [],
  parties: Party[] = []
): boolean {
  if (!targetBranchId || targetBranchId.toLowerCase().trim() === 'all') return true;
  const targetId = targetBranchId.toLowerCase().trim();
  const targetBranch = branches.find(
    (b) => b.id.toLowerCase() === targetId || b.name.toLowerCase().trim() === targetId || cleanBranchName(b.name).toLowerCase() === targetId
  );
  const targetActualId = (targetBranch?.id || targetBranchId).toLowerCase().trim();
  const targetCleanName = cleanBranchName(targetBranch?.name || targetBranchId).toLowerCase().trim();

  // 1. Direct branch ID
  const colBranchId = (c.branchId || '').toLowerCase().trim();
  if (colBranchId) {
    if (colBranchId === targetActualId || colBranchId === targetId || (targetCleanName && colBranchId === targetCleanName)) {
      return true;
    }
  }

  // 2. Direct entity/branch name
  const colEntity = cleanBranchName(c.entityName || c.branchName || '').toLowerCase().trim();
  if (colEntity && targetCleanName) {
    if (colEntity === targetCleanName || colEntity.includes(targetCleanName) || targetCleanName.includes(colEntity)) {
      return true;
    }
  }

  // 3. Match via Salesperson
  const cSalesman = (c.salesmanCode || (c as any).salespersonCode || '').trim().toLowerCase();
  const cMkt = (c.marketingPerson || (c as any).salespersonName || '').trim().toLowerCase();
  if (cSalesman || cMkt) {
    const sp = salespersons.find(
      (s) =>
        (cSalesman && ((s.code || '').toLowerCase() === cSalesman || (s.id || '').toLowerCase() === cSalesman)) ||
        (cMkt && (s.name || '').toLowerCase().trim() === cMkt)
    );
    if (sp) {
      if (sp.branchId && sp.branchId.toLowerCase() === targetActualId) return true;
      if (sp.assignedBranchIds && sp.assignedBranchIds.some((id) => id.toLowerCase() === targetActualId)) return true;
      const spBName = cleanBranchName(sp.branchName || '').toLowerCase().trim();
      if (spBName && targetCleanName && (spBName === targetCleanName || spBName.includes(targetCleanName) || targetCleanName.includes(spBName))) return true;
      if (sp.branchId && sp.branchId.toLowerCase() !== targetActualId) return false;
    }
  }

  // 4. Match via Party
  const cParty = (c.partyName || (c as any).customerName || '').trim().toLowerCase();
  if (cParty) {
    const pObj = parties.find((p) => (p.name || '').trim().toLowerCase() === cParty);
    if (pObj) {
      if (pObj.branchId && pObj.branchId.toLowerCase() === targetActualId) return true;
      const pBName = cleanBranchName(pObj.branchName || '').toLowerCase().trim();
      if (pBName && targetCleanName && (pBName === targetCleanName || pBName.includes(targetCleanName) || targetCleanName.includes(pBName))) return true;
      if (pObj.branchId && pObj.branchId.toLowerCase() !== targetActualId) return false;
    }
  }

  // 5. Default fallback to head showroom ONLY IF no other branch matches and nothing else is specified
  if ((targetActualId === 'branch-1' || targetActualId === 'branch-main' || targetCleanName.includes('madhupur')) && !colBranchId && !colEntity && !cSalesman && !cParty) {
    return true;
  }

  return false;
}

const KNOWN_SALES_CENTER_PREFIXES = new Set<string>([
  'GP', 'TG', 'SV', 'AS', 'MP', 'PM', 'MR', 'NG', 'GT', 'DB', 'MM',
  'CT', 'CM', 'FN', 'NK', 'SY', 'HO', 'DH', 'TN', 'BG', 'RS', 'KL',
  'BR', 'RP', 'DJ', 'JS', 'PB', 'SG', 'JP', 'SP', 'NT', 'KG', 'BB',
  'CB', 'KS', 'FP'
]);

export function normalizeBranchId(id?: string | null): string {
  const raw = (id || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'branch-main') return 'branch-1';
  return raw;
}

function isAllSalesCenterPlaceholder(raw?: string | null): boolean {
  const s = (raw || '').trim().toLowerCase().replace(/\s*\((?:all|\d+)\)\s*$/i, '').trim();
  if (!s) return false;
  return (
    s === 'all' ||
    s === 'all sales center' ||
    s === 'all sales centers' ||
    s.startsWith('all sales center') ||
    s.startsWith('all assigned center') ||
    s.startsWith('all assigned sales') ||
    s === 'all branches'
  );
}

/**
 * Checks whether a party explicitly belongs to a specific sales center
 * (via its branchId, branchName, or assigned salesperson's branch).
 */
export function hasSpecificPartySalesCenter(
  p: Party | null | undefined,
  salespersons: Salesperson[] = []
): boolean {
  if (!p) return false;
  const rawPid = (p.branchId || (p as any).salesCenterId || '').trim();
  const pBranchId = isAllSalesCenterPlaceholder(rawPid) ? '' : normalizeBranchId(rawPid);
  if (pBranchId && pBranchId !== 'all') return true;

  const rawPName = (p.branchName || (p as any).salesCenter || '').trim();
  const pBranchName = isAllSalesCenterPlaceholder(rawPName) ? '' : cleanBranchName(rawPName).toLowerCase().trim();
  if (pBranchName && !isAllSalesCenterPlaceholder(pBranchName)) return true;

  const pSalesman = (p.salesmanCode || (p as any).salespersonCode || '').trim().toLowerCase();
  const pMkt = (p.salespersonName || (p as any).salesman || '').trim().toLowerCase();
  if (pSalesman || pMkt) {
    const sp = salespersons.find(
      (s) =>
        (pSalesman && ((s.code || '').trim().toLowerCase() === pSalesman || (s.id || '').trim().toLowerCase() === pSalesman)) ||
        (pMkt && (s.name || '').trim().toLowerCase() === pMkt)
    );
    if (sp && !(sp.assignedBranchIds && sp.assignedBranchIds.length > 1)) {
      const rawSpBid = (sp.branchId || '').trim();
      const spBranchId = isAllSalesCenterPlaceholder(rawSpBid) ? '' : normalizeBranchId(rawSpBid);
      const rawSpBName = (sp.branchName || '').trim();
      const spBranchName = isAllSalesCenterPlaceholder(rawSpBName) ? '' : cleanBranchName(rawSpBName).toLowerCase().trim();
      if ((spBranchId && spBranchId !== 'all') || (spBranchName && !isAllSalesCenterPlaceholder(spBranchName))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Resolves the Party record associated with a stored bill, supporting partyId and
 * disambiguating duplicate party names by salesman and branch.
 */
export function findPartyForBill(
  b: StoredBill,
  parties: Party[] = [],
  salespersons: Salesperson[] = [],
  branches: BranchLocation[] = []
): Party | undefined {
  if (!b || !Array.isArray(parties) || parties.length === 0) return undefined;

  const billPartyId = ((b as any).partyId || (b.header as any)?.partyId || '').trim().toLowerCase();
  if (billPartyId) {
    const byId = parties.find((p) => (p.id || '').trim().toLowerCase() === billPartyId);
    if (byId) return byId;
  }

  const billPartyName = (b.header?.partyName || (b as any).partyName || '').trim().toLowerCase();
  if (!billPartyName) return undefined;

  const matches = parties.filter((p) => (p.name || '').trim().toLowerCase() === billPartyName);
  if (matches.length === 0) return undefined;
  if (matches.length === 1) return matches[0];

  const billSpCode = (b.header?.salesmanCode || (b as any).salesmanCode || '').trim().toLowerCase();
  const billSpName = (b.header?.salespersonName || (b as any).salespersonName || '').trim().toLowerCase();

  let narrowed = matches;
  if (billSpCode || billSpName) {
    const billSp = salespersons.find(
      (s) =>
        (billSpCode && ((s.code || '').trim().toLowerCase() === billSpCode || (s.id || '').trim().toLowerCase() === billSpCode)) ||
        (billSpName && (s.name || '').trim().toLowerCase() === billSpName)
    );
    const spCodeTarget = (billSp?.code || billSpCode).trim().toLowerCase();
    const spNameTarget = (billSp?.name || billSpName).trim().toLowerCase();
    const spMatches = matches.filter((p) => {
      const pCode = (p.salesmanCode || (p as any).salespersonCode || '').trim().toLowerCase();
      const pName = (p.salespersonName || (p as any).salesman || '').trim().toLowerCase();
      return Boolean((spCodeTarget && pCode === spCodeTarget) || (spNameTarget && pName === spNameTarget));
    });
    if (spMatches.length === 1) return spMatches[0];
    if (spMatches.length > 0) narrowed = spMatches;
  }

  const rawBillBid = (b.branchId || b.header?.branchId || '').trim();
  const billBranchId = isAllSalesCenterPlaceholder(rawBillBid) ? '' : normalizeBranchId(rawBillBid);
  const rawBillBName = (
    b.branchName || b.header?.branchName || (b.header as any)?.salesCenter || (b as any).salesCenter || ''
  ).trim();
  let billBranchClean = isAllSalesCenterPlaceholder(rawBillBName)
    ? ''
    : cleanBranchName(rawBillBName).toLowerCase().trim();
  if (!billBranchClean && billBranchId && branches.length > 0) {
    const bObj = branches.find((br) => normalizeBranchId(br.id) === billBranchId);
    if (bObj?.name) billBranchClean = cleanBranchName(bObj.name).toLowerCase().trim();
  }

  if (billBranchId || billBranchClean) {
    const branchMatches = narrowed.filter((p) => {
      const rawPBid = (p.branchId || (p as any).salesCenterId || '').trim();
      const pBid = isAllSalesCenterPlaceholder(rawPBid) ? '' : normalizeBranchId(rawPBid);
      const rawPBName = (p.branchName || (p as any).salesCenter || '').trim();
      let pBName = isAllSalesCenterPlaceholder(rawPBName) ? '' : cleanBranchName(rawPBName).toLowerCase().trim();
      if (!pBName && pBid && branches.length > 0) {
        const pBrObj = branches.find((br) => normalizeBranchId(br.id) === pBid);
        if (pBrObj?.name) pBName = cleanBranchName(pBrObj.name).toLowerCase().trim();
      }
      return Boolean(
        (billBranchId && pBid && pBid === billBranchId) ||
        (billBranchClean && pBName && (pBName === billBranchClean || pBName.includes(billBranchClean) || billBranchClean.includes(pBName)))
      );
    });
    if (branchMatches.length === 1) return branchMatches[0];
  }

  // If all matching parties share the exact same branch, it's unambiguous for branch scoping
  const distinctBranchKeys = new Set(
    matches.map((p) => normalizeBranchId(p.branchId || (p as any).salesCenterId) || cleanBranchName(p.branchName || '').toLowerCase().trim())
  );
  if (distinctBranchKeys.size === 1) {
    return matches[0];
  }

  return undefined;
}

/**
 * Strict and robust matcher to determine if a party belongs to a specific branch/sales center.
 */
export function partyMatchesBranch(
  p: Party,
  targetBranchId: string,
  branches: BranchLocation[] = [],
  salespersons: Salesperson[] = []
): boolean {
  if (!targetBranchId || isAllSalesCenterPlaceholder(targetBranchId)) return true;
  const targetId = targetBranchId.toLowerCase().trim();
  const normalizedTargetQuery = normalizeBranchId(targetId);
  const targetCleanQuery = cleanBranchName(targetBranchId).toLowerCase().trim();
  const targetBranch = branches.find(
    (b) =>
      normalizeBranchId(b.id) === normalizedTargetQuery ||
      b.id.toLowerCase() === targetId ||
      b.name.toLowerCase().trim() === targetId ||
      cleanBranchName(b.name).toLowerCase() === targetCleanQuery
  );
  const targetActualId = normalizeBranchId(targetBranch?.id || targetBranchId);
  const targetCleanName = cleanBranchName(targetBranch?.name || targetBranchId).toLowerCase().trim();

  // 1. Direct branch ID & name (handle stale/recreated branchId via branchName when branchId is unknown)
  const rawPBranchId = (p.branchId || (p as any).salesCenterId || '').trim();
  const pBranchId = isAllSalesCenterPlaceholder(rawPBranchId) ? '' : normalizeBranchId(rawPBranchId);
  const rawPBranchName = (p.branchName || (p as any).salesCenter || '').trim();
  const pBranchName = isAllSalesCenterPlaceholder(rawPBranchName) ? '' : cleanBranchName(rawPBranchName).toLowerCase().trim();

  if (pBranchId && pBranchId !== 'all') {
    if (pBranchId === targetActualId || pBranchId === targetId || pBranchId === normalizedTargetQuery || (targetCleanName && pBranchId === targetCleanName)) {
      return true;
    }
    const knownOtherBranch = branches.find(
      (b) => normalizeBranchId(b.id) === pBranchId || b.id.toLowerCase() === pBranchId
    );
    if (knownOtherBranch) {
      return false;
    }
    // If branchId is stale/unrecognized and branchName is explicitly set, validate by branchName
    if (pBranchName) {
      return Boolean(targetCleanName && (pBranchName === targetCleanName || pBranchName.includes(targetCleanName) || targetCleanName.includes(pBranchName)));
    }
    return false;
  }

  // 2. Direct branch name
  if (pBranchName) {
    if (targetCleanName && (pBranchName === targetCleanName || pBranchName.includes(targetCleanName) || targetCleanName.includes(pBranchName))) {
      return true;
    }
    return false;
  }

  // 3. Match via Salesperson
  const pSalesman = (p.salesmanCode || (p as any).salespersonCode || '').trim().toLowerCase();
  const pMkt = (p.salespersonName || (p as any).salesman || '').trim().toLowerCase();
  if (pSalesman || pMkt) {
    const sp = salespersons.find(
      (s) =>
        (pSalesman && ((s.code || '').trim().toLowerCase() === pSalesman || (s.id || '').trim().toLowerCase() === pSalesman)) ||
        (pMkt && (s.name || '').toLowerCase().trim() === pMkt)
    );
    if (sp) {
      const rawSpBid = (sp.branchId || '').trim();
      const spBranchId = isAllSalesCenterPlaceholder(rawSpBid) ? '' : normalizeBranchId(rawSpBid);
      if (spBranchId && spBranchId === targetActualId) return true;
      if (sp.assignedBranchIds && sp.assignedBranchIds.some((id) => normalizeBranchId(id) === targetActualId)) return true;
      const rawSpBName = (sp.branchName || '').trim();
      const spBName = isAllSalesCenterPlaceholder(rawSpBName) ? '' : cleanBranchName(rawSpBName).toLowerCase().trim();
      if (spBName && targetCleanName && (spBName === targetCleanName || spBName.includes(targetCleanName) || targetCleanName.includes(spBName))) return true;
      if ((spBranchId && spBranchId !== 'all') || spBName) return false;
    }
  }

  // 4. Default fallback to head showroom/default branch if unassigned to any other branch
  if ((targetActualId === 'branch-1' || targetCleanName.includes('madhupur')) && !pBranchId && !pBranchName && !pSalesman && !pMkt) {
    return true;
  }

  return false;
}

export function isSuperAdminOrAgm(user: AuthUser | Salesperson | null | undefined): boolean {
  if (!user) return false;
  return isStrictSuperAdmin(user);
}

export function isInCharge(
  user: AuthUser | Salesperson | null | undefined,
  salespersons?: Salesperson[],
  branches?: BranchLocation[]
): boolean {
  if (!user) return false;
  if (isSuperAdminOrAgm(user)) return true;
  if (user.isInCharge === true) return true;

  const role = (user.role || '').toLowerCase().trim();
  const userRole = ((user as any).userRole || '').toLowerCase().trim();
  const designation = (user.designation || '').toLowerCase().trim();
  const userSpCode = ((user as any).salespersonCode || (user as any).code || '').toLowerCase().trim();
  const username = ((user as any).username || '').toLowerCase().trim();
  const name = ((user as any).name || '').toLowerCase().trim();

  if (
    role.includes('in-charge') ||
    role.includes('incharge') ||
    role.includes('in charge') ||
    userRole.includes('in-charge') ||
    userRole.includes('incharge') ||
    userRole.includes('in charge') ||
    designation.includes('in-charge') ||
    designation.includes('incharge') ||
    designation.includes('in charge')
  ) {
    return true;
  }

  if (salespersons && salespersons.length > 0) {
    const sp = salespersons.find(
      (s) =>
        (userSpCode && s.code.toLowerCase().trim() === userSpCode) ||
        (username && (s.username || s.code).toLowerCase().trim() === username) ||
        (name && s.name.toLowerCase().trim() === name)
    );
    if (sp) {
      if (sp.isInCharge === true) return true;
      const spRole = (sp.role || '').toLowerCase().trim();
      const spDesig = (sp.designation || '').toLowerCase().trim();
      if (
        spRole.includes('in-charge') ||
        spRole.includes('incharge') ||
        spRole.includes('in charge') ||
        spDesig.includes('in-charge') ||
        spDesig.includes('incharge') ||
        spDesig.includes('in charge')
      ) {
        return true;
      }
    }
  }

  if (branches && branches.length > 0) {
    const isBranchInCharge = branches.some((b) => {
      const bInCharge = ((b as any).inCharge || (b as any).inChargeName || b.inChargeId || '').toLowerCase().trim();
      return (
        (userSpCode && bInCharge.includes(userSpCode)) ||
        (username && bInCharge.includes(username)) ||
        (name && bInCharge.includes(name))
      );
    });
    if (isBranchInCharge) return true;
  }

  return false;
}

export function isAccountsOrStaff(
  user: AuthUser | Salesperson | null | undefined,
  salespersons: Salesperson[] = []
): boolean {
  if (!user) return false;
  const role = (user.role || '').toLowerCase();
  const userRole = ((user as any).userRole || '').toLowerCase();
  const designation = (user.designation || '').toLowerCase();

  // If user is explicitly an admin/agm/director, return false
  if (role.includes('admin') || userRole.includes('admin') || role.includes('agm') || userRole.includes('agm')) {
    return false;
  }

  // Check linked salesperson record first
  if (salespersons && salespersons.length > 0) {
    const spCode = ((user as any).salespersonCode || (user as any).code || '').trim().toLowerCase();
    const username = (user.username || '').trim().toLowerCase();
    const name = (user.name || '').trim().toLowerCase();
    const sp = salespersons.find(
      (s) =>
        (spCode && s.code && s.code.trim().toLowerCase() === spCode) ||
        (username && (s as any).username && ((s as any).username as string).trim().toLowerCase() === username) ||
        (name && s.name && s.name.trim().toLowerCase() === name)
    );
    if (sp) {
      const spRole = (sp.role || '').toLowerCase();
      const spType = (sp.userType || '').toLowerCase();
      const spDesig = (sp.designation || '').toLowerCase();
      if (
        spRole.includes('staff') ||
        spRole.includes('account') ||
        spRole.includes('showroom') ||
        spRole.includes('sales center') ||
        spDesig.includes('staff') ||
        spDesig.includes('account') ||
        spType === 'staff' ||
        spType === 'accountant'
      ) {
        return true;
      }
    }
  }

  return (
    role === 'accountant' ||
    role === 'staff' ||
    role.includes('account') ||
    role.includes('staff') ||
    role.includes('showroom') ||
    role.includes('sales center') ||
    userRole.includes('account') ||
    userRole.includes('staff') ||
    userRole.includes('showroom') ||
    userRole.includes('sales center') ||
    designation.includes('account') ||
    designation.includes('staff')
  );
}

export function hasBranchWideAccess(
  user: AuthUser | null | undefined,
  salespersons: Salesperson[] = [],
  branches: BranchLocation[] = []
): boolean {
  if (!user) return false;
  if (isStrictSuperAdmin(user)) return true;
  if (isAnyAdmin(user)) return true;
  if (isInCharge(user, salespersons, branches)) return true;
  if (isAccountsOrStaff(user, salespersons)) return true;
  return false;
}

export function hasUserTarget(sp?: Salesperson | null): boolean {
  if (!sp) return false;
  if (sp.yearlyTargetSales !== undefined && sp.yearlyTargetSales > 0) return true;
  if (sp.monthlyTargetSales !== undefined && sp.monthlyTargetSales > 0) return true;
  if (sp.yearlyTargetCollection !== undefined && sp.yearlyTargetCollection > 0) return true;
  if (sp.monthlyTargetCollection !== undefined && sp.monthlyTargetCollection > 0) return true;
  if (sp.monthlyTargetCoils !== undefined && sp.monthlyTargetCoils > 0) return true;
  if (sp.userType === 'marketing') return true;
  return false;
}

export function isMarketingOfficer(sp?: Salesperson | null): boolean {
  if (!sp) return false;
  if (sp.userType === 'marketing') return true;
  const role = (sp.role || '').toLowerCase();
  const desig = (sp.designation || '').toLowerCase();
  if (
    role.includes('marketing') ||
    role.includes('representative') ||
    role.includes('officer') ||
    role.includes('sales') ||
    role.includes('in-charge') ||
    role.includes('incharge') ||
    role.includes('manager') ||
    desig.includes('marketing') ||
    desig.includes('officer') ||
    desig.includes('executive') ||
    desig.includes('manager')
  ) {
    return true;
  }
  if (hasUserTarget(sp)) return true;
  if (
    role === 'accountant' ||
    role === 'showroom staff' ||
    role === 'general user / staff' ||
    role === 'cleaner' ||
    role === 'peon' ||
    role === 'office boy'
  ) {
    return false;
  }
  return true;
}

export function getUserBranch(
  user: AuthUser | null | undefined,
  salespersons: Salesperson[] = [],
  branches: BranchLocation[] = []
): { branchId: string; branchName: string } {
  const madhupurBranch = branches.find(
    (b) => b.id === 'branch-1' || cleanBranchName(b.name).toLowerCase().includes('madhupur')
  ) || branches.find((b) => b.id === 'branch-1') || branches[0];

  if (!user) {
    return {
      branchId: madhupurBranch?.id || 'branch-1',
      branchName: madhupurBranch?.name || 'Madhupur Sales Center'
    };
  }

  const rawUserBranchId = (user.branchId || '').trim();
  if (rawUserBranchId && rawUserBranchId.toLowerCase() !== 'all') {
    const rawUserBNameClean = cleanBranchName(user.branchName || '').toLowerCase().trim();
    const b =
      branches.find((br) => br.id.toLowerCase().trim() === rawUserBranchId.toLowerCase()) ||
      (rawUserBNameClean
        ? branches.find(
            (br) =>
              br.name.toLowerCase().trim() === (user.branchName || '').toLowerCase().trim() ||
              cleanBranchName(br.name).toLowerCase().trim() === rawUserBNameClean
          )
        : undefined);
    return {
      branchId: b?.id || rawUserBranchId,
      branchName: b?.name || user.branchName || 'Madhupur Sales Center'
    };
  }

  const spCodeLower = ((user as any).salespersonCode || (user as any).code || '').trim().toLowerCase();
  const usernameLower = (user.username || '').trim().toLowerCase();
  const nameLower = (user.name || '').trim().toLowerCase();

  const sp = salespersons.find(
    (s) =>
      (spCodeLower && s.code && s.code.trim().toLowerCase() === spCodeLower) ||
      (usernameLower && ((s.username && s.username.trim().toLowerCase() === usernameLower) || (s.code && s.code.trim().toLowerCase() === usernameLower))) ||
      (nameLower && s.name && s.name.trim().toLowerCase() === nameLower)
  );
  if (sp) {
    if (sp.branchId && sp.branchId.toLowerCase().trim() !== 'all') {
      const b = branches.find((br) => br.id.toLowerCase().trim() === sp.branchId!.toLowerCase().trim());
      if (b) {
        return { branchId: b.id, branchName: b.name };
      }
      return {
        branchId: sp.branchId,
        branchName: sp.branchName || ''
      };
    }
    if (sp.branchName) {
      const spBNameClean = cleanBranchName(sp.branchName).toLowerCase().trim();
      const b = branches.find(
        (br) =>
          br.name.toLowerCase().trim() === sp.branchName!.toLowerCase().trim() ||
          cleanBranchName(br.name).toLowerCase().trim() === spBNameClean
      );
      if (b) {
        return { branchId: b.id, branchName: b.name };
      }
    }
  }

  if (user.branchName && user.branchName.toLowerCase().trim() !== 'all sales centers') {
    const userBNameClean = cleanBranchName(user.branchName).toLowerCase().trim();
    const b = branches.find(
      (br) =>
        br.name.toLowerCase().trim() === user.branchName!.toLowerCase().trim() ||
        cleanBranchName(br.name).toLowerCase().trim() === userBNameClean
    );
    if (b) {
      return { branchId: b.id, branchName: b.name };
    }
  }

  return {
    branchId: madhupurBranch?.id || 'branch-1',
    branchName: madhupurBranch?.name || 'Madhupur Sales Center'
  };
}

export function getUserLoginFilters(
  user: AuthUser | null | undefined,
  salespersons: Salesperson[] = [],
  branches: BranchLocation[] = []
): {
  branchId: string | null;
  branchName: string | null;
  salesmanCode: string | null;
  salesmanName: string | null;
  isRestricted: boolean;
} {
  if (
    !user ||
    isStrictSuperAdmin(user) ||
    isSuperAdminOrAgm(user) ||
    isAccountsAdmin(user) ||
    isAnyAdmin(user) ||
    isRegionalAdmin(user, salespersons)
  ) {
    return { branchId: null, branchName: null, salesmanCode: null, salesmanName: null, isRestricted: false };
  }

  // Find matching salesperson by salespersonCode or username or name
  let matchedSp: Salesperson | undefined;
  if (user.salespersonCode) {
    matchedSp = salespersons.find(
      (s) => s.code.toLowerCase() === user.salespersonCode?.toLowerCase()
    );
  }
  if (!matchedSp && user.username) {
    matchedSp = salespersons.find(
      (s) => s.code.toLowerCase() === user.username.toLowerCase()
    );
  }
  if (!matchedSp && user.name) {
    matchedSp = salespersons.find(
      (s) => s.name.toLowerCase() === user.name.toLowerCase()
    );
  }

  // Resolve branch
  let targetBranchId: string | null = null;
  let targetBranchName: string | null = null;

  if (user.branchId) {
    targetBranchId = user.branchId;
    const b = branches.find((br) => br.id === user.branchId);
    if (b) targetBranchName = b.name;
  } else if (matchedSp?.branchId) {
    targetBranchId = matchedSp.branchId;
    const b = branches.find((br) => br.id === matchedSp!.branchId);
    if (b) targetBranchName = b.name;
  }

  if (!targetBranchName) {
    const rawBranchName = user.branchName || matchedSp?.branchName;
    if (rawBranchName) {
      const b = branches.find((br) => br.name.toLowerCase().trim() === rawBranchName.toLowerCase().trim());
      if (b) {
        targetBranchId = b.id;
        targetBranchName = b.name;
      } else {
        targetBranchName = rawBranchName;
      }
    }
  }

  // If user has a branch from getUserBranch
  if (!targetBranchId && !targetBranchName && !isSuperAdminOrAgm(user)) {
    const ub = getUserBranch(user, salespersons, branches);
    targetBranchId = ub.branchId;
    targetBranchName = ub.branchName;
  }

  // If user has branch-wide access (Admin, In-charge, Accounts, Staff), they are NOT restricted to a single salesman's parties
  // and must be able to see all party names, statements, and records under their sales center
  const branchWide = hasBranchWideAccess(user, salespersons, branches);

  const salesmanCode = branchWide ? null : (matchedSp?.code || user.salespersonCode || null);
  const salesmanName = branchWide ? null : (matchedSp?.name || (salesmanCode ? user.name : null));

  const isRestricted = !isSuperAdminOrAgm(user);

  return {
    branchId: targetBranchId,
    branchName: targetBranchName,
    salesmanCode,
    salesmanName,
    isRestricted
  };
}

export function isUnwantedSalesCenter(nameOrBranch: any): boolean {
  if (!nameOrBranch) return false;
  // User-created or dynamically assigned branches must never be blocked
  if (typeof nameOrBranch === 'object' && nameOrBranch) {
    if (nameOrBranch.isUserCreated) return false;
    const strId = String(nameOrBranch.id || '');
    if (/^\d+$/.test(strId.replace('branch-', '')) || strId.startsWith('branch-user-') || strId.startsWith('branch-custom-')) {
      return false;
    }
  }
  const name = (typeof nameOrBranch === 'string' ? nameOrBranch : nameOrBranch.name || nameOrBranch.label || '').toLowerCase().trim();
  const id = (typeof nameOrBranch === 'object' && nameOrBranch ? nameOrBranch.id || '' : '').toLowerCase().trim();

  // Only filter out legacy system title artifacts or empty placeholders
  if (name.includes('polycables store') || name.includes('billing portal')) return true;
  if (id === 'branch-main' && !name) return true;
  return false;
}

export function filterBranchesForUser(
  branches: BranchLocation[],
  user: AuthUser | null | undefined,
  salespersons: Salesperson[] = []
): BranchLocation[] {
  let result: BranchLocation[] = branches;
  if (!user || isStrictSuperAdmin(user)) {
    result = branches;
  } else if (isAnyAdmin(user)) {
    const adminBranches = getAdminBranches(user, branches, salespersons);
    if (isAccountsAdmin(user) && adminBranches.length === 0) {
      result = branches;
    } else {
      result = adminBranches;
    }
  } else {
    const { branchId, branchName } = getUserBranch(user, salespersons, branches);
    const normUserBranchId = normalizeBranchId(branchId);
    const cleanUserBranchName = branchName ? cleanBranchName(branchName).toLowerCase().trim() : '';
    const matched = branches.filter(
      (b) =>
        b.id === branchId ||
        (normUserBranchId && normalizeBranchId(b.id) === normUserBranchId) ||
        (cleanUserBranchName && cleanBranchName(b.name).toLowerCase().trim() === cleanUserBranchName)
    );
    result = matched.length > 0 ? matched : branches.slice(0, 1);
  }

  return [...result]
    .filter((b) => b && !isUnwantedSalesCenter(b))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export function filterSalespersonsByBranch(
  salespersons: Salesperson[],
  selectedBranchIdOrName: string | null | undefined,
  allowedBranches: BranchLocation[] = [],
  user?: AuthUser | null
): Salesperson[] {
  const list = Array.isArray(salespersons) ? salespersons : [];
  const rawSel = (selectedBranchIdOrName || '').trim();
  const selLower = rawSel.toLowerCase();
  const isAll =
    !selLower ||
    selLower === 'all' ||
    selLower === 'all sales centers' ||
    selLower.startsWith('all sales center') ||
    selLower === 'all branches';

  if (isAll) {
    if (!user || isStrictSuperAdmin(user) || isAccountsAdmin(user)) {
      return list;
    }
    if (allowedBranches.length === 0) return [];
    const allowedIds = new Set(allowedBranches.map((b) => b.id.toLowerCase().trim()));
    const allowedNames = new Set(allowedBranches.map((b) => cleanBranchName(b.name).toLowerCase().trim()));
    return list.filter((sp) => {
      const spBranchId = (sp.branchId || '').toLowerCase().trim();
      if (spBranchId && allowedIds.has(spBranchId)) return true;
      if (sp.assignedBranchIds && sp.assignedBranchIds.some((id) => allowedIds.has(id.toLowerCase().trim()))) return true;
      const spBranchName = cleanBranchName(sp.branchName || (sp as any).branch || '').toLowerCase().trim();
      if (spBranchName && allowedNames.has(spBranchName)) return true;
      return false;
    });
  }

  const matchedBranch = allowedBranches.find(
    (b) =>
      b.id.toLowerCase().trim() === selLower ||
      b.name.toLowerCase().trim() === selLower ||
      cleanBranchName(b.name).toLowerCase().trim() === cleanBranchName(rawSel).toLowerCase().trim()
  );
  const targetId = (matchedBranch?.id || rawSel).toLowerCase().trim();
  const targetCleanName = cleanBranchName(matchedBranch?.name || rawSel).toLowerCase().trim();

  return list.filter((sp) => {
    const spBranchId = (sp.branchId || '').toLowerCase().trim();
    if (spBranchId && (spBranchId === targetId || spBranchId === selLower)) return true;
    if (
      sp.assignedBranchIds &&
      sp.assignedBranchIds.some((id) => {
        const lid = id.toLowerCase().trim();
        return lid === targetId || lid === selLower;
      })
    ) {
      return true;
    }
    const spBranchName = cleanBranchName(sp.branchName || (sp as any).branch || '').toLowerCase().trim();
    if (!spBranchName) return false;
    return (
      spBranchName === targetCleanName ||
      spBranchName === selLower ||
      (targetCleanName.length >= 3 && (spBranchName.includes(targetCleanName) || targetCleanName.includes(spBranchName)))
    );
  });
}

function getBranchContext(
  branchId: string,
  user: AuthUser | null | undefined,
  salespersons: Salesperson[] = [],
  branches: BranchLocation[] = [],
  parties: Party[] = []
) {
  const normBranchId = normalizeBranchId(branchId);
  const currentBranch = branches.find((b) => normalizeBranchId(b.id) === normBranchId || b.id === branchId);
  const branchNames: string[] = [];
  if (currentBranch?.name) {
    branchNames.push(currentBranch.name.toLowerCase().trim());
    const cleaned = cleanBranchName(currentBranch.name).toLowerCase().trim();
    if (cleaned && !branchNames.includes(cleaned)) {
      branchNames.push(cleaned);
    }
  }

  const branchSalespersons = salespersons.filter((s) => {
    const sBid = normalizeBranchId(s.branchId);
    if (sBid && sBid === normBranchId) return true;
    if (s.assignedBranchIds && s.assignedBranchIds.some((id) => normalizeBranchId(id) === normBranchId)) return true;
    const sBName = cleanBranchName(s.branchName || '').toLowerCase().trim();
    if (sBName && branchNames.some((bn) => sBName === bn || sBName.includes(bn) || bn.includes(sBName))) return true;
    return false;
  });
  const branchSpCodes = new Set(
    branchSalespersons.map((s) => (s.code || '').trim().toLowerCase()).filter(Boolean)
  );
  const branchSpNames = new Set(
    branchSalespersons.map((s) => (s.name || '').trim().toLowerCase()).filter(Boolean)
  );

  if (user?.salespersonCode) {
    branchSpCodes.add(user.salespersonCode.trim().toLowerCase());
  }

  const branchParties = parties.filter((p) => {
    if (hasSpecificPartySalesCenter(p, salespersons)) {
      return partyMatchesBranch(p, branchId, branches, salespersons);
    }
    if (p.salesmanCode && branchSpCodes.has(p.salesmanCode.trim().toLowerCase())) return true;
    return false;
  });
  const branchPartyNames = new Set(
    branchParties.map((p) => (p.name || '').trim().toLowerCase()).filter(Boolean)
  );

  return {
    branchId,
    branchNames,
    branchSpCodes,
    branchSpNames,
    branchPartyNames,
    currentBranch
  };
}

export function filterBillsForUser(
  bills: StoredBill[],
  user: AuthUser | null | undefined,
  salespersons: Salesperson[] = [],
  branches: BranchLocation[] = [],
  parties: Party[] = []
): StoredBill[] {
  if (!user || isStrictSuperAdmin(user)) return bills;

  // Regional Admin / Accounts Admin
  if (isRegionalAdmin(user, salespersons)) {
    const adminBranches = getAdminBranches(user, branches, salespersons);
    if (isAccountsAdmin(user) && adminBranches.length === 0) {
      return bills;
    }
    if (adminBranches.length === 0) {
      return [];
    }
    return bills.filter((b) => {
      const matchedParty = findPartyForBill(b, parties, salespersons, branches);
      if (matchedParty && hasSpecificPartySalesCenter(matchedParty, salespersons)) {
        const partyAllowed = adminBranches.some((ab) => partyMatchesBranch(matchedParty, ab.id, branches, salespersons));
        if (!partyAllowed) return false;
      }
      return adminBranches.some((ab) => billMatchesBranch(b, ab.id, branches, salespersons, parties));
    });
  }

  if (isSuperAdminOrAgm(user)) return bills;
  const { branchId } = getUserBranch(user, salespersons, branches);
  if (!branchId || branchId.toLowerCase() === 'all') {
    return bills;
  }

  const branchWide = hasBranchWideAccess(user, salespersons, branches);
  const userSpCode = (user?.salespersonCode || '').trim().toLowerCase();
  const userName = (user?.name || user?.username || '').trim().toLowerCase();

  return bills.filter((b) => {
    // Enforce Sales Center & strict party-to-sales-center scoping uniformly
    if (!billMatchesBranch(b, branchId, branches, salespersons, parties)) {
      return false;
    }

    if (branchWide) {
      return true;
    }

    // Marketing officer / non-branch-wide user sees own salesman bills or bills for own parties
    const bSalesman = (b.header?.salesmanCode || (b as any).salesmanCode || '').trim().toLowerCase();
    const bSalesmanName = (b.header?.salespersonName || (b as any).salespersonName || '').trim().toLowerCase();
    const bCreatedBy = (b.header?.createdBy || (b as any).createdBy || '').trim().toLowerCase();

    if (userSpCode && bSalesman && bSalesman === userSpCode) return true;
    if (userName && bSalesmanName && (bSalesmanName === userName || bSalesmanName.includes(userName))) return true;
    if (userName && bCreatedBy && (bCreatedBy === userName || bCreatedBy.includes(userName))) return true;

    const matchedParty = findPartyForBill(b, parties, salespersons, branches);
    if (matchedParty) {
      const pCode = (matchedParty.salesmanCode || '').trim().toLowerCase();
      const pName = (matchedParty.salespersonName || '').trim().toLowerCase();
      if (userSpCode && pCode === userSpCode) return true;
      if (userName && pName && (pName === userName || pName.includes(userName))) return true;
    }

    return false;
  });
}

export function filterCollectionsForUser(
  collections: CollectionMR[],
  user: AuthUser | null | undefined,
  salespersons: Salesperson[] = [],
  branches: BranchLocation[] = [],
  parties: Party[] = []
): CollectionMR[] {
  if (isStrictSuperAdmin(user)) return collections;

  // Admin with 4/5 sales centers
  if (isRegionalAdmin(user, salespersons)) {
    const adminBranches = getAdminBranches(user, branches, salespersons);
    const adminBranchIds = new Set(adminBranches.map((b) => b.id));
    const adminBranchNames = new Set(adminBranches.map((b) => cleanBranchName(b.name).toLowerCase()));
    return collections.filter((col) => {
      if (col.branchId && adminBranchIds.has(col.branchId)) return true;
      const colEntity = cleanBranchName(col.entityName || col.branchName || '').toLowerCase();
      if (colEntity && adminBranchNames.has(colEntity)) return true;
      const colSalesman = (col.salesmanCode || '').trim().toLowerCase();
      if (colSalesman) {
        const sp = salespersons.find(s => s.code.toLowerCase() === colSalesman);
        if (sp?.branchId && adminBranchIds.has(sp.branchId)) return true;
      }
      return false;
    });
  }

  if (isSuperAdminOrAgm(user)) return collections;
  const { branchId } = getUserBranch(user, salespersons, branches);
  if (!branchId || branchId.toLowerCase() === 'all') {
    return collections;
  }

  const branchWide = hasBranchWideAccess(user, salespersons, branches);
  const userSpCode = (user?.salespersonCode || '').trim().toLowerCase();
  const userName = (user?.name || user?.username || '').trim().toLowerCase();

  return collections.filter((c) => {
    // In-charge, sales center staff, and accounts see ALL collections for their sales center
    if (branchWide) {
      return collectionMatchesBranch(c, branchId, branches, salespersons, parties);
    }

    // Regular officer only sees their own collections
    const cSalesman = (c.salesmanCode || (c as any).salespersonCode || '').trim().toLowerCase();
    const cParty = (c.partyName || (c as any).customerName || '').trim().toLowerCase();
    const cMkt = (c.marketingPerson || (c as any).salespersonName || '').trim().toLowerCase();
    const cEntity = (c.entityName || '').trim().toLowerCase();

    if (userSpCode && cSalesman && cSalesman === userSpCode) return true;
    const mkt = cMkt || cEntity;
    if (userName && mkt && (mkt === userName || mkt.includes(userName) || userName.includes(mkt))) return true;
    const linkedSp = salespersons.find(
      (s) =>
        (userSpCode && s.code?.toLowerCase() === userSpCode) ||
        (userName && s.name?.toLowerCase() === userName)
    );
    if (linkedSp?.name) {
      const sName = linkedSp.name.trim().toLowerCase();
      if (mkt === sName || mkt.includes(sName) || sName.includes(mkt)) return true;
    }
    if (userSpCode && cParty) {
      const pObj = parties.find(p => (p.name || '').trim().toLowerCase() === cParty);
      if (pObj && (pObj.salesmanCode || '').trim().toLowerCase() === userSpCode) return true;
    }
    return false;
  });
}

export function filterReturnsForUser(
  returns: StockReturnChallan[],
  user: AuthUser | null | undefined,
  salespersons: Salesperson[] = [],
  branches: BranchLocation[] = [],
  parties: Party[] = []
): StockReturnChallan[] {
  if (isStrictSuperAdmin(user)) return returns;

  if (isRegionalAdmin(user, salespersons)) {
    const adminBranches = getAdminBranches(user, branches, salespersons);
    const adminBranchIds = new Set(adminBranches.map((b) => b.id));
    return returns.filter((r) => {
      const rBranchId = (r as any).branchId;
      if (rBranchId && adminBranchIds.has(rBranchId)) return true;
      const rSalesman = (r.salesmanCode || '').trim().toLowerCase();
      if (rSalesman) {
        const sp = salespersons.find((s) => s.code.toLowerCase() === rSalesman);
        if (sp?.branchId && adminBranchIds.has(sp.branchId)) return true;
      }
      return false;
    });
  }

  if (isSuperAdminOrAgm(user)) return returns;
  const { branchId } = getUserBranch(user, salespersons, branches);
  const branchWide = hasBranchWideAccess(user, salespersons, branches);
  const userSpCode = (user?.salespersonCode || '').trim().toLowerCase();

  const { branchSpCodes, branchPartyNames } = getBranchContext(
    branchId,
    user,
    salespersons,
    branches,
    parties
  );

  return returns.filter((r) => {
    const rBranchId = (r as any).branchId;
    if (rBranchId && rBranchId !== branchId) {
      return false;
    }
    const rSalesman = (r.salesmanCode || '').trim().toLowerCase();
    const rParty = (r.partyName || '').trim().toLowerCase();

    if (!branchWide) {
      if (userSpCode && rSalesman && rSalesman === userSpCode) return true;
      if (userSpCode && rParty) {
        const pObj = parties.find(p => (p.name || '').trim().toLowerCase() === rParty);
        if (pObj && (pObj.salesmanCode || '').trim().toLowerCase() === userSpCode) return true;
      }
      return false;
    }

    if (rBranchId && rBranchId === branchId) return true;
    if (rSalesman && branchSpCodes.has(rSalesman)) return true;
    if (rParty && branchPartyNames.has(rParty)) return true;
    return false;
  });
}

export function filterExpensesForUser(
  expenses: ExpenseEntry[],
  user: AuthUser | null | undefined,
  salespersons: Salesperson[] = [],
  branches: BranchLocation[] = []
): ExpenseEntry[] {
  if (isStrictSuperAdmin(user)) return expenses;

  if (isRegionalAdmin(user, salespersons)) {
    const adminBranches = getAdminBranches(user, branches, salespersons);
    const adminBranchIds = new Set(adminBranches.map((b) => b.id));
    const adminBranchNames = new Set(adminBranches.map((b) => cleanBranchName(b.name).toLowerCase()).filter(Boolean));
    const adminSpTokens = new Set<string>();
    (salespersons || []).forEach((s) => {
      const spBranchClean = cleanBranchName(s.branchName || '').toLowerCase();
      const spInAdminBranch =
        (s.branchId && adminBranchIds.has(s.branchId)) ||
        (spBranchClean && adminBranchNames.has(spBranchClean));
      if (spInAdminBranch) {
        if (s.id) adminSpTokens.add(s.id.trim().toLowerCase());
        if (s.code) adminSpTokens.add(s.code.trim().toLowerCase());
        if (s.name) adminSpTokens.add(s.name.trim().toLowerCase());
        if (s.name && s.code) adminSpTokens.add(`${s.name.trim().toLowerCase()} (${s.code.trim().toLowerCase()})`);
      }
    });
    return expenses.filter((e) => {
      if (e.branchId && adminBranchIds.has(e.branchId)) return true;
      const eBranch = cleanBranchName(e.branchName || '').toLowerCase();
      if (eBranch && adminBranchNames.has(eBranch)) return true;
      const eEntityClean = cleanBranchName(e.entityName || '').toLowerCase();
      if (eEntityClean && adminBranchNames.has(eEntityClean)) return true;
      const eEntityRaw = (e.entityName || '').trim().toLowerCase();
      const eEntityBase = eEntityRaw.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const eSpId = ((e as any).salespersonId || '').trim().toLowerCase();
      const eSpCode = ((e as any).salesmanCode || '').trim().toLowerCase();
      const eMkt = ((e as any).marketingPerson || '').trim().toLowerCase();
      const eCreatedBy = (e.createdBy || '').trim().toLowerCase();
      if (
        (eEntityRaw && adminSpTokens.has(eEntityRaw)) ||
        (eEntityBase && adminSpTokens.has(eEntityBase)) ||
        (eSpId && adminSpTokens.has(eSpId)) ||
        (eSpCode && adminSpTokens.has(eSpCode)) ||
        (eMkt && adminSpTokens.has(eMkt)) ||
        (eCreatedBy && adminSpTokens.has(eCreatedBy))
      ) {
        return true;
      }
      return false;
    });
  }

  // Admin or Super Admin can see all over expense (nationwide / company-wide)
  if (isSuperAdminOrAgm(user)) return expenses;

  // Resolve user's assigned sales center
  const { branchId, branchName } = getUserBranch(user, salespersons, branches);
  if (!branchId && !branchName) return [];

  const { branchNames, branchSpNames, currentBranch } = getBranchContext(
    branchId,
    user,
    salespersons,
    branches,
    []
  );

  // Other known branches to strictly prevent cross-branch leakage
  const otherBranches = branches.filter((b) => b.id !== branchId);
  const otherBranchNames = otherBranches
    .map((b) => (b.name || '').toLowerCase().trim())
    .filter(Boolean);

  const otherSalespersons = salespersons.filter((s) => s.branchId && s.branchId !== branchId);
  const otherSpNames = new Set(
    otherSalespersons.map((s) => (s.name || '').toLowerCase().trim()).filter(Boolean)
  );

  return expenses.filter((e) => {
    // 1. If expense is explicitly tagged with another branchId, reject immediately
    if (e.branchId && e.branchId !== branchId) {
      return false;
    }

    const eEntity = (e.entityName || '').trim().toLowerCase();
    const eCreatedBy = (e.createdBy || '').trim().toLowerCase();
    const eBranchName = (e.branchName || '').trim().toLowerCase();

    // 2. If expense explicitly references another sales center name, reject
    if (eBranchName && otherBranchNames.some((obn) => eBranchName.includes(obn) || obn.includes(eBranchName))) {
      return false;
    }
    if (eEntity && otherBranchNames.some((obn) => eEntity === obn || eEntity.includes(obn))) {
      return false;
    }
    if (eEntity && otherSpNames.has(eEntity)) {
      return false;
    }

    // 3. Match if expense is explicitly tagged with user's branchId
    if (e.branchId && e.branchId === branchId) {
      return true;
    }

    // 4. Match if branchName matches user's sales center
    if (eBranchName && branchNames.some((bn) => eBranchName.includes(bn) || bn.includes(eBranchName))) {
      return true;
    }

    // 5. Match by entity name containing assigned sales center name
    if (eEntity && branchNames.some((bn) => eEntity.includes(bn) || bn.includes(eEntity))) {
      return true;
    }

    // 6. Match by salespersons belonging to this sales center
    if (eEntity && branchSpNames.has(eEntity)) {
      return true;
    }

    // 7. Match if created by user in this branch or salesperson in this branch
    if (eCreatedBy && (branchSpNames.has(eCreatedBy) || (user?.name && eCreatedBy.includes(user.name.toLowerCase())))) {
      return true;
    }

    // 8. Match by branch address/area
    if (e.area && currentBranch?.address && currentBranch.address.toLowerCase().includes(e.area.toLowerCase())) {
      return true;
    }

    // 9. Fallback: only if expense entity explicitly matches this branch or no affiliation exists for this branch
    if (branchId === 'branch-1' && !e.branchId && !e.branchName && !eEntity) {
      return true;
    }

    return false;
  });
}

export function isFactoryUser(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  const role = (user.role || '').toLowerCase();
  const userRole = (user.userRole || '').toLowerCase();
  const desig = (user.designation || '').toLowerCase();
  const username = (user.username || '').toLowerCase();
  const name = (user.name || '').toLowerCase();
  return (
    role === 'factory' ||
    userRole === 'factory' ||
    desig.includes('factory') ||
    username.includes('factory') ||
    name.includes('factory')
  );
}

/**
 * Checks if the current user is authorized to approve requisitions for a sales center.
 * Rule: Only the assigned Admin for that sales center (or Super Admin) can approve requisitions.
 */
export function canApproveSalesCenterRequisition(
  user: AuthUser | null | undefined,
  req: Requisition | null | undefined,
  branches: BranchLocation[] = [],
  salespersons: Salesperson[] = []
): boolean {
  if (!user || !req) return false;
  if (isStrictSuperAdmin(user) || (user as any).isSuperAdmin || (user.role || '').toLowerCase() === 'superadmin') return true;
  if (!isAnyAdmin(user)) return false;

  const targetBranchId = (req.branchId || '').trim().toLowerCase();
  const targetBranchName = cleanBranchName(req.branchName || req.toDestination || '').trim().toLowerCase();

  // If user is Admin with no assignedBranchIds / branch restrictions, allow all branches
  if (!user.assignedBranchIds || user.assignedBranchIds.length === 0) {
    const adminBranches = getAdminBranches(user, branches, salespersons);
    if (adminBranches.length === 0) {
      return true;
    }
  }

  // Find admin's managed branches
  const adminBranches = getAdminBranches(user, branches, salespersons);
  if (adminBranches.length === 0 && (!user.assignedBranchIds || user.assignedBranchIds.length === 0)) {
    return true;
  }
  if (targetBranchId && adminBranches.some((b) => b.id.toLowerCase() === targetBranchId)) {
    return true;
  }
  if (targetBranchName && adminBranches.some((b) => cleanBranchName(b.name).toLowerCase() === targetBranchName || targetBranchName.includes(cleanBranchName(b.name).toLowerCase()))) {
    return true;
  }

  // Also check direct match on req branch
  const branchObj = branches.find(
    (b) => (targetBranchId && b.id.toLowerCase() === targetBranchId) ||
           (targetBranchName && cleanBranchName(b.name).toLowerCase() === targetBranchName)
  );

  if (branchObj) {
    const userLower = (user.username || '').toLowerCase().trim();
    const spCodeLower = (user.salespersonCode || '').toLowerCase().trim();
    const nameLower = (user.name || '').toLowerCase().trim();
    if (
      (branchObj.adminId && (branchObj.adminId.toLowerCase() === userLower || branchObj.adminId.toLowerCase() === spCodeLower)) ||
      (branchObj.assignedAdminId && (branchObj.assignedAdminId.toLowerCase() === userLower || branchObj.assignedAdminId.toLowerCase() === spCodeLower)) ||
      (branchObj.adminUsername && branchObj.adminUsername.toLowerCase() === userLower) ||
      (branchObj.adminName && (branchObj.adminName.toLowerCase().includes(nameLower) || nameLower.includes(branchObj.adminName.toLowerCase())))
    ) {
      return true;
    }
  }

  // Check if user has assignedBranchIds containing this branch
  if (Array.isArray(user.assignedBranchIds) && user.assignedBranchIds.length > 0) {
    if (targetBranchId && user.assignedBranchIds.some((id) => id.toLowerCase() === targetBranchId)) {
      return true;
    }
    if (branchObj && user.assignedBranchIds.some((id) => id.toLowerCase() === branchObj.id.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if the user is authorized to approve requisition as Showroom / Sales Center In-Charge.
 * Requisitions must be approved by In-Charge first before Admin final approval.
 */
export function canApproveInChargeRequisition(
  user: AuthUser | null | undefined,
  req: Requisition | null | undefined,
  branches: BranchLocation[] = [],
  salespersons: Salesperson[] = []
): boolean {
  if (!user || !req) return false;
  // Admins (Regional, Accounts, Super Admin) do NOT approve the In-Charge step; In-Charge must approve first
  if (isAnyAdmin(user) || isStrictSuperAdmin(user)) return false;
  // User must be In-Charge: Admins who are not in-charge cannot approve the in-charge step
  if (!isInCharge(user, salespersons, branches)) return false;

  const { branchId: userBranchId } = getUserBranch(user, salespersons, branches);
  const targetBranchId = (req.branchId || '').trim();
  if (userBranchId && targetBranchId) {
    return userBranchId.toLowerCase() === targetBranchId.toLowerCase();
  }

  return true;
}

/**
 * Checks if the user is authorized to approve conveyance as Sales Center Admin.
 * Rule: After In-Charge approval, only the assigned Admin for that sales center (or Super Admin) can approve conveyance.
 */
export function canApproveSalesCenterConveyance(
  user: AuthUser | null | undefined,
  conveyance: { branchId?: string; branchName?: string; salespersonId?: string; salespersonName?: string } | null | undefined,
  branches: BranchLocation[] = [],
  salespersons: Salesperson[] = []
): boolean {
  if (!user || !conveyance) return false;
  if (isStrictSuperAdmin(user) || (user as any).isSuperAdmin || (user.role || '').toLowerCase() === 'superadmin') return true;
  if (!isAnyAdmin(user)) return false;

  let targetBranchId = (conveyance.branchId || '').trim().toLowerCase();
  let targetBranchName = cleanBranchName(conveyance.branchName || '').trim().toLowerCase();

  // If no branch on conveyance, try to resolve from salesperson
  if (!targetBranchId && !targetBranchName && conveyance.salespersonId) {
    const sp = salespersons.find(
      (s) => s.id === conveyance.salespersonId || s.code === conveyance.salespersonId || s.name === conveyance.salespersonName
    );
    if (sp?.branchId) targetBranchId = sp.branchId.trim().toLowerCase();
    if (sp?.branchName) targetBranchName = cleanBranchName(sp.branchName).trim().toLowerCase();
  }

  // If user is Admin with no assignedBranchIds / branch restrictions, allow all branches
  if (!user.assignedBranchIds || user.assignedBranchIds.length === 0) {
    const adminBranches = getAdminBranches(user, branches, salespersons);
    if (adminBranches.length === 0) {
      return true;
    }
  }

  // Find admin's managed branches
  const adminBranches = getAdminBranches(user, branches, salespersons);
  if (adminBranches.length === 0 && (!user.assignedBranchIds || user.assignedBranchIds.length === 0)) {
    return true;
  }
  if (targetBranchId && adminBranches.some((b) => b.id.toLowerCase() === targetBranchId)) {
    return true;
  }
  if (targetBranchName && adminBranches.some((b) => cleanBranchName(b.name).toLowerCase() === targetBranchName || targetBranchName.includes(cleanBranchName(b.name).toLowerCase()))) {
    return true;
  }

  const branchObj = branches.find(
    (b) => (targetBranchId && b.id.toLowerCase() === targetBranchId) ||
           (targetBranchName && cleanBranchName(b.name).toLowerCase() === targetBranchName)
  );

  if (branchObj) {
    const userLower = (user.username || '').toLowerCase().trim();
    const spCodeLower = (user.salespersonCode || '').toLowerCase().trim();
    const nameLower = (user.name || '').toLowerCase().trim();
    if (
      (branchObj.adminId && (branchObj.adminId.toLowerCase() === userLower || branchObj.adminId.toLowerCase() === spCodeLower)) ||
      (branchObj.assignedAdminId && (branchObj.assignedAdminId.toLowerCase() === userLower || branchObj.assignedAdminId.toLowerCase() === spCodeLower)) ||
      (branchObj.adminUsername && branchObj.adminUsername.toLowerCase() === userLower) ||
      (branchObj.adminName && (branchObj.adminName.toLowerCase().includes(nameLower) || nameLower.includes(branchObj.adminName.toLowerCase())))
    ) {
      return true;
    }
  }

  if (Array.isArray(user.assignedBranchIds) && user.assignedBranchIds.length > 0) {
    if (targetBranchId && user.assignedBranchIds.some((id) => id.toLowerCase() === targetBranchId)) {
      return true;
    }
    if (branchObj && user.assignedBranchIds.some((id) => id.toLowerCase() === branchObj.id.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if the user is authorized to approve conveyance as Showroom / Sales Center In-Charge.
 */
export function canApproveInChargeConveyance(
  user: AuthUser | null | undefined,
  conveyance: { branchId?: string; branchName?: string; salespersonId?: string; salespersonName?: string } | null | undefined,
  branches: BranchLocation[] = [],
  salespersons: Salesperson[] = []
): boolean {
  if (!user || !conveyance) return false;
  // Admins do NOT approve the In-Charge step; Showroom In-Charge must approve first
  if (isAnyAdmin(user) || isStrictSuperAdmin(user)) return false;
  // User must be In-Charge: pure admins cannot approve the in-charge step
  if (!isInCharge(user, salespersons, branches)) return false;

  const { branchId: userBranchId } = getUserBranch(user, salespersons, branches);
  let targetBranchId = (conveyance.branchId || '').trim();
  if (!targetBranchId && conveyance.salespersonId) {
    const sp = salespersons.find((s) => s.id === conveyance.salespersonId || s.code === conveyance.salespersonId);
    if (sp?.branchId) targetBranchId = sp.branchId;
  }

  if (userBranchId && targetBranchId) {
    return userBranchId.toLowerCase() === targetBranchId.toLowerCase();
  }

  return true;
}

/**
 * Filters conveyance entries for the current user according to organizational rules:
 * - Super Admin: sees all conveyances.
 * - Sales Center In-Charge: sees conveyances for their sales center (at any stage).
 * - Sales Center Admin: "if In-Charge not approve then admin can not see any conveyance."
 *   Admin only sees conveyances that have been approved by In-Charge (status === 'pending_admin', 'approved', 'rejected').
 * - Regular Staff/Salesperson: sees only their own conveyances.
 */
export function filterConveyancesForUser(
  conveyances: any[],
  user: AuthUser | null | undefined,
  salespersons: Salesperson[] = [],
  branches: BranchLocation[] = []
): any[] {
  if (!user || !Array.isArray(conveyances)) return [];
  if (isStrictSuperAdmin(user) || (user as any).isSuperAdmin || (user.role || '').toLowerCase() === 'superadmin') {
    return conveyances;
  }

  const userIsAdmin = isAnyAdmin(user);
  const userIsInCharge = !userIsAdmin && isInCharge(user, salespersons, branches);
  const { branchId: userBranchId, branchName: userBranchName } = getUserBranch(user, salespersons, branches);
  const cleanUserBranch = cleanBranchName(userBranchName || '').toLowerCase();
  const adminBranches = userIsAdmin ? getAdminBranches(user, branches, salespersons) : [];

  return conveyances.filter((c) => {
    if (!c) return false;
    const cBranchId = (c.branchId || '').trim().toLowerCase();
    const cBranchName = cleanBranchName(c.branchName || '').trim().toLowerCase();

    // Check if branch matches user's scope
    let branchMatches = false;
    if (userIsAdmin) {
      if (adminBranches.length === 0 && (!user.assignedBranchIds || user.assignedBranchIds.length === 0)) {
        branchMatches = true; // Unrestricted admin
      } else {
        branchMatches = adminBranches.some((b) => b.id.toLowerCase() === cBranchId || cleanBranchName(b.name).toLowerCase() === cBranchName) ||
          (user.assignedBranchIds && user.assignedBranchIds.some((id: string) => id.toLowerCase() === cBranchId));
      }
    } else if (userIsInCharge) {
      branchMatches = !userBranchId || !cBranchId ||
        userBranchId.toLowerCase() === cBranchId ||
        (cleanUserBranch && cBranchName && (cBranchName.includes(cleanUserBranch) || cleanUserBranch.includes(cBranchName)));
    } else {
      // Salesperson/Staff: matches their own salespersonId or code or username
      const userSpCode = (user.salespersonCode || user.username || '').toLowerCase().trim();
      const userName = (user.name || '').toLowerCase().trim();
      const cSpId = (c.salespersonId || '').toLowerCase().trim();
      const cSpCode = (c.salesmanCode || '').toLowerCase().trim();
      const cSpName = (c.salespersonName || '').toLowerCase().trim();
      return (
        (userSpCode && (userSpCode === cSpId || userSpCode === cSpCode)) ||
        (userName && (userName === cSpName || cSpName.includes(userName)))
      );
    }

    if (!branchMatches) return false;

    // Critical user rule: "sales center in-charge approved first, if not then not see admin, after in-charge approve then see admin. this roles for Requisition and Conveyance."
    if (userIsAdmin && !isStrictSuperAdmin(user)) {
      const isInChargeApproved = Boolean(
        c.inChargeApprovedBy ||
        c.inChargeApprovedAt ||
        c.status === 'pending_admin' ||
        c.status === 'approved'
      );
      if (!isInChargeApproved) {
        return false;
      }
    }

    return true;
  });
}

export function filterRequisitionsForUser(
  requisitions: Requisition[],
  user: AuthUser | null | undefined,
  salespersons: Salesperson[] = [],
  branches: BranchLocation[] = [],
  parties: Party[] = []
): Requisition[] {
  if (!user || !Array.isArray(requisitions)) return [];

  // Factory Role user can ONLY see approved requisitions!
  if (isFactoryUser(user)) {
    return requisitions.filter(
      (r) =>
        r.isApproved ||
        r.stage === 'sent_to_factory' ||
        r.stage === 'factory_dispatched' ||
        r.stage === 'factory_received' ||
        r.stage === 'goods_received' ||
        r.stage === 'converted_to_bill'
    );
  }

  if (isStrictSuperAdmin(user)) return requisitions;

  const userIsAdmin = isAnyAdmin(user) || isRegionalAdmin(user, salespersons) || isSuperAdminOrAgm(user);
  const userIsInCharge = !userIsAdmin && isInCharge(user, salespersons, branches);

  // Helper: check if requisition has passed Sales Center In-Charge approval
  // Rule: "sales center in-charge approved first, if not then not see admin, after in-charge approve then see admin."
  const isReqInChargeApproved = (r: Requisition): boolean => {
    return Boolean(
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
  };

  const { branchId, branchName } = getUserBranch(user, salespersons, branches);
  const cleanUserBranch = cleanBranchName(branchName || '').toLowerCase();
  const userSpCode = (user?.salespersonCode || user?.username || '').trim().toLowerCase();
  const userName = (user?.name || user?.username || '').trim().toLowerCase();

  const { branchSpCodes, branchSpNames, branchPartyNames } = getBranchContext(
    branchId,
    user,
    salespersons,
    branches,
    parties
  );

  // 1. Regional Admin / Sales Center Admin
  if (userIsAdmin) {
    const adminBranches = getAdminBranches(user, branches, salespersons);
    const adminBranchIds = new Set(adminBranches.map((b) => b.id.toLowerCase()));
    const adminBranchNames = new Set(adminBranches.map((b) => cleanBranchName(b.name).toLowerCase()));

    return requisitions.filter((r) => {
      // Rule: if sales center in-charge has not approved first, admin cannot see requisition
      if (!isStrictSuperAdmin(user) && !isReqInChargeApproved(r)) {
        return false;
      }
      const rBranchId = (r.branchId || '').toLowerCase();
      if (rBranchId && adminBranchIds.has(rBranchId)) return true;
      const rBranch = cleanBranchName(r.branchName || r.toDestination || '').toLowerCase();
      if (rBranch && adminBranchNames.has(rBranch)) return true;
      const rSalesman = (((r as any).salesmanCode || '') as string).trim().toLowerCase();
      if (rSalesman) {
        const sp = salespersons.find(s => s.code.toLowerCase() === rSalesman);
        if (sp?.branchId && adminBranchIds.has(sp.branchId.toLowerCase())) return true;
      }
      // If admin has no specific branch restriction, allow
      if (adminBranchIds.size === 0) return true;
      return false;
    });
  }

  // 2. Sales Center In-Charge: sees ALL requisitions belonging to their sales center
  if (userIsInCharge) {
    return requisitions.filter((r) => {
      if (!r) return false;
      const rBranchId = (r.branchId || '').toLowerCase();
      const rBranchName = cleanBranchName(r.branchName || r.toDestination || '').toLowerCase();
      const rSalesmanCode = (((r as any).salesmanCode || '') as string).trim().toLowerCase();
      const rMktName = (r.marketingPersonName || '').trim().toLowerCase();
      const rCreatedBy = (((r as any).createdBy || r.createdByName || '') as string).trim().toLowerCase();
      const rPartyName = (r.partyName || '').trim().toLowerCase();

      // If tagged directly with In-Charge's branchId
      if (branchId && rBranchId && rBranchId === branchId.toLowerCase()) return true;

      // If tagged with In-Charge's sales center name
      if (cleanUserBranch && rBranchName && (rBranchName === cleanUserBranch || rBranchName.includes(cleanUserBranch) || cleanUserBranch.includes(rBranchName))) return true;

      // If created by or marketing person is In-Charge himself (Subrata Sutradhar)
      if (userName && (rMktName === userName || rMktName.includes(userName) || rCreatedBy === userName || rCreatedBy.includes(userName))) return true;
      if (userSpCode && (rSalesmanCode === userSpCode || rSalesmanCode.includes(userSpCode))) return true;

      // If marketing person belongs to In-Charge's branch
      if (rMktName && branchSpNames.has(rMktName)) return true;
      if (rSalesmanCode && branchSpCodes.has(rSalesmanCode)) return true;

      // If party belongs to In-Charge's branch
      if (rPartyName && branchPartyNames.has(rPartyName)) return true;

      // Fallback for branch requisitions with matching salesperson
      const reqSp = salespersons.find(
        (s) =>
          (rSalesmanCode && (s.code || '').trim().toLowerCase() === rSalesmanCode) ||
          (rMktName && (s.name || '').trim().toLowerCase() === rMktName)
      );
      if (reqSp?.branchId && branchId && reqSp.branchId.toLowerCase() === branchId.toLowerCase()) return true;

      // Fallback if no specific branch set
      if (!rBranchId && (!reqSp?.branchId || (branchId && reqSp.branchId.toLowerCase() === branchId.toLowerCase()))) return true;

      return false;
    });
  }

  // 3. Regular Salesperson / Officer: sees their own requisitions only
  const branchWide = hasBranchWideAccess(user, salespersons, branches);

  return requisitions.filter((r) => {
    if (!r) return false;
    const rBranchId = (r.branchId || '').toLowerCase();
    if (branchId && rBranchId && rBranchId !== branchId.toLowerCase()) {
      return false;
    }
    const rSalesmanCode = (((r as any).salesmanCode || '') as string).trim().toLowerCase();
    const rMktName = (r.marketingPersonName || '').trim().toLowerCase();
    const rCreatedBy = (((r as any).createdBy || r.createdByName || '') as string).trim().toLowerCase();
    const rPartyName = (r.partyName || '').trim().toLowerCase();

    const reqSp = salespersons.find(
      (s) =>
        (rSalesmanCode && (s.code || '').trim().toLowerCase() === rSalesmanCode) ||
        (rMktName && (s.name || '').trim().toLowerCase() === rMktName)
    );

    const reqParty = parties.find(
      (p) => (p.name || '').trim().toLowerCase() === rPartyName
    );

    if (reqSp?.branchId && branchId && reqSp.branchId.toLowerCase() !== branchId.toLowerCase()) {
      return false;
    }

    if (!branchWide) {
      if (userSpCode && (rSalesmanCode === userSpCode || reqSp?.code?.toLowerCase() === userSpCode)) return true;
      if (userName && (rMktName === userName || rMktName.includes(userName) || rCreatedBy === userName || rCreatedBy.includes(userName))) return true;
      const userSp = salespersons.find((s) => (s.code || '').toLowerCase() === userSpCode);
      if (userSp && (rMktName === userSp.name.toLowerCase() || rMktName.includes(userSp.name.toLowerCase()))) return true;
      if (reqParty && userSpCode && (reqParty.salesmanCode || '').toLowerCase() === userSpCode) return true;
      return false;
    }

    if (branchId && rBranchId && rBranchId === branchId.toLowerCase()) return true;
    if (rSalesmanCode && branchSpCodes.has(rSalesmanCode)) return true;
    if (rMktName && branchSpNames.has(rMktName)) return true;
    if (reqSp?.branchId && branchId && reqSp.branchId.toLowerCase() === branchId.toLowerCase()) return true;
    if (reqParty?.branchId && branchId && reqParty.branchId.toLowerCase() === branchId.toLowerCase()) return true;
    if (!rBranchId && !reqSp?.branchId) return true;
    return false;
  });
}

export function filterDepositsForUser(
  deposits: BankDeposit[],
  user: AuthUser | null | undefined,
  salespersons: Salesperson[] = [],
  branches: BranchLocation[] = []
): BankDeposit[] {
  if (!Array.isArray(deposits)) return [];
  if (isStrictSuperAdmin(user)) return deposits;

  const userName = (user?.name || user?.username || '').trim().toLowerCase();
  const userSpCode = (user?.salespersonCode || '').trim().toLowerCase();

  if (isRegionalAdmin(user, salespersons)) {
    const adminBranches = getAdminBranches(user, branches, salespersons);
    const adminBranchIds = new Set(adminBranches.map((b) => b.id.trim().toLowerCase()));
    const adminBranchNames = new Set(adminBranches.map((b) => cleanBranchName(b.name).toLowerCase()).filter(Boolean));
    const adminSpNames = new Set(
      salespersons
        .filter((sp) => {
          const spBid = (sp.branchId || '').trim().toLowerCase();
          const spBName = cleanBranchName(sp.branchName || (sp as any).branch || '').toLowerCase();
          return (spBid && adminBranchIds.has(spBid)) || (spBName && adminBranchNames.has(spBName));
        })
        .map((sp) => (sp.name || '').trim().toLowerCase())
        .filter(Boolean)
    );

    return deposits.filter((d) => {
      const dBid = (d.branchId || '').trim().toLowerCase();
      if (dBid && adminBranchIds.has(dBid)) return true;
      const dEntity = cleanBranchName(d.entityName || '').toLowerCase();
      const dBranch = cleanBranchName(d.branchName || '').toLowerCase();
      if (dEntity && adminBranchNames.has(dEntity)) return true;
      if (dBranch && adminBranchNames.has(dBranch)) return true;
      const dMkt = (d.marketingPerson || '').trim().toLowerCase();
      const dEntityRaw = (d.entityName || '').trim().toLowerCase();
      const dCreatedBy = ((d as any).createdBy || (d as any).depositedBy || '').trim().toLowerCase();
      if (dMkt && adminSpNames.has(dMkt)) return true;
      if (dEntityRaw && adminSpNames.has(dEntityRaw)) return true;
      if (userName && dCreatedBy && (dCreatedBy === userName || dCreatedBy.includes(userName))) return true;
      return false;
    });
  }

  if (isSuperAdminOrAgm(user)) return deposits;
  const { branchId } = getUserBranch(user, salespersons, branches);
  const branchWide = hasBranchWideAccess(user, salespersons, branches);
  const branchIdLow = (branchId || '').trim().toLowerCase();

  const { branchNames, branchSpNames } = getBranchContext(
    branchId,
    user,
    salespersons,
    branches,
    []
  );
  const branchSpNameSet = branchSpNames || new Set<string>();

  return deposits.filter((d) => {
    const dBid = (d.branchId || '').trim().toLowerCase();
    if (dBid && branchIdLow && dBid !== branchIdLow) {
      return false;
    }
    const dEntity = (d.entityName || '').trim().toLowerCase();
    const dEntityClean = cleanBranchName(d.entityName || '').toLowerCase();
    const dBranchClean = cleanBranchName(d.branchName || '').toLowerCase();
    const dMkt = (d.marketingPerson || '').trim().toLowerCase();
    const dCreatedBy = ((d as any).createdBy || (d as any).depositedBy || '').trim().toLowerCase();

    if (!branchWide) {
      if (userName && dEntity && (dEntity === userName || dEntity.includes(userName))) return true;
      if (userName && dMkt && (dMkt === userName || dMkt.includes(userName))) return true;
      if (userSpCode && dEntity && (dEntity === userSpCode || dEntity.includes(userSpCode))) return true;
      if (userName && dCreatedBy && (dCreatedBy === userName || dCreatedBy.includes(userName))) return true;
      return false;
    }

    if (dBid && branchIdLow && dBid === branchIdLow) return true;
    if (dBranchClean && branchNames.some((bn) => dBranchClean === bn || dBranchClean.includes(bn) || bn.includes(dBranchClean))) return true;
    if (dEntityClean && branchNames.some((bn) => dEntityClean === bn || dEntityClean.includes(bn) || bn.includes(dEntityClean))) return true;
    if (dMkt && branchSpNameSet.has(dMkt)) return true;
    if (dEntity && branchSpNameSet.has(dEntity)) return true;
    if (userName && dCreatedBy && (dCreatedBy === userName || dCreatedBy.includes(userName))) return true;
    return false;
  });
}

export function filterPartiesForUser(
  parties: Party[],
  user: AuthUser | null | undefined,
  salespersons: Salesperson[] = [],
  branches: BranchLocation[] = []
): Party[] {
  if (isStrictSuperAdmin(user)) return parties;

  if (isRegionalAdmin(user, salespersons)) {
    const adminBranches = getAdminBranches(user, branches, salespersons);
    return parties.filter((p) => {
      return adminBranches.some((ab) => partyMatchesBranch(p, ab.id, branches, salespersons));
    });
  }

  if (isSuperAdminOrAgm(user)) return parties;
  const { branchId } = getUserBranch(user, salespersons, branches);
  if (!branchId || branchId.toLowerCase() === 'all') {
    return parties;
  }

  const branchWide = hasBranchWideAccess(user, salespersons, branches);
  const userSpCode = (user?.salespersonCode || '').trim().toLowerCase();
  const userName = (user?.name || user?.username || '').trim().toLowerCase();

  return parties.filter((p) => {
    // In-charge, sales center staff, and accounts see ALL parties in their sales center
    if (branchWide) {
      return partyMatchesBranch(p, branchId, branches, salespersons);
    }

    const pSalesman = (p.salesmanCode || (p as any).salespersonCode || '').trim().toLowerCase();
    const pCreatedBy = ((p as any).createdBy || '').trim().toLowerCase();

    if (userSpCode && pSalesman && pSalesman === userSpCode) return true;
    if (userName && pCreatedBy && (pCreatedBy === userName || pCreatedBy.includes(userName))) return true;
    if (!pSalesman && partyMatchesBranch(p, branchId, branches, salespersons)) return true;
    return false;
  });
}

export function filterChallansForUser(
  challans: DeliveryChallan[],
  user: AuthUser | null | undefined,
  salespersons: Salesperson[] = [],
  branches: BranchLocation[] = [],
  parties: Party[] = []
): DeliveryChallan[] {
  if (isFactoryUser(user)) return challans;
  if (isStrictSuperAdmin(user)) return challans;

  if (isRegionalAdmin(user, salespersons)) {
    const adminBranches = getAdminBranches(user, branches, salespersons);
    const adminBranchIds = new Set(adminBranches.map((b) => b.id));
    const adminBranchNames = new Set(adminBranches.map((b) => cleanBranchName(b.name).toLowerCase()));
    return challans.filter((c) => {
      const cBranchId = (c as any).branchId || (c as any).header?.branchId;
      if (cBranchId && adminBranchIds.has(cBranchId)) return true;
      const cSalesCenter = cleanBranchName(((c as any).salesCenter || '').trim()).toLowerCase();
      if (cSalesCenter && adminBranchNames.has(cSalesCenter)) return true;
      const cSalesman = (c.salesmanCode || (c as any).header?.salesmanCode || '').trim().toLowerCase();
      if (cSalesman) {
        const sp = salespersons.find(s => s.code.toLowerCase() === cSalesman);
        if (sp?.branchId && adminBranchIds.has(sp.branchId)) return true;
      }
      return false;
    });
  }

  if (isSuperAdminOrAgm(user)) return challans;
  const { branchId } = getUserBranch(user, salespersons, branches);
  const branchWide = hasBranchWideAccess(user, salespersons, branches);
  const userSpCode = (user?.salespersonCode || '').trim().toLowerCase();
  const userName = (user?.name || user?.username || '').trim().toLowerCase();

  const { branchNames, branchSpCodes, branchPartyNames } = getBranchContext(
    branchId,
    user,
    salespersons,
    branches,
    parties
  );

  return challans.filter((c) => {
    const cBranchId = (c as any).branchId || (c as any).header?.branchId;
    if (cBranchId && cBranchId !== branchId) {
      return false;
    }

    const cSalesman = (c.salesmanCode || (c as any).header?.salesmanCode || '').trim().toLowerCase();
    const cParty = (c.partyName || (c as any).header?.partyName || '').trim().toLowerCase();
    const cSalesCenter = ((c as any).salesCenter || '').trim().toLowerCase();
    const cCreatedBy = ((c as any).createdBy || (c as any).header?.createdBy || '').trim().toLowerCase();

    // If challan has no explicit branchId, check if salesman belongs to another branch
    if (!cBranchId && cSalesman) {
      const sp = salespersons.find(
        (s) => (s.code || '').toLowerCase() === cSalesman || (s.name || '').toLowerCase() === cSalesman
      );
      if (sp?.branchId && sp.branchId !== branchId) {
        return false;
      }
    }

    // If challan has no explicit branchId, check if party belongs to another branch
    if (!cBranchId && cParty) {
      const pObj = parties.find((p) => (p.name || '').toLowerCase() === cParty);
      if (pObj?.branchId && pObj.branchId !== branchId) {
        return false;
      }
    }

    if (!branchWide) {
      if (userSpCode && cSalesman && cSalesman === userSpCode) return true;
      if (userName && cCreatedBy && (cCreatedBy === userName || cCreatedBy.includes(userName))) return true;
      if (userSpCode && cParty) {
        const pObj = parties.find(p => (p.name || '').trim().toLowerCase() === cParty);
        if (pObj && (pObj.salesmanCode || '').trim().toLowerCase() === userSpCode) return true;
      }
      return false;
    }

    if (cBranchId && cBranchId === branchId) return true;
    if (cSalesman && branchSpCodes.has(cSalesman)) return true;
    if (cParty && branchPartyNames.has(cParty)) return true;
    if (cSalesCenter && branchNames.some((bn) => cSalesCenter === bn || cSalesCenter.startsWith(bn))) return true;
    return false;
  });
}

export function filterSalespersonsForUser(
  salespersons: Salesperson[],
  user: AuthUser | null | undefined,
  branches: BranchLocation[] = []
): Salesperson[] {
  if (isStrictSuperAdmin(user)) return salespersons;

  if (isRegionalAdmin(user, salespersons)) {
    const adminBranches = getAdminBranches(user, branches, salespersons);
    const adminBranchIds = new Set(adminBranches.map((b) => b.id));
    const adminBranchNames = new Set(adminBranches.map((b) => cleanBranchName(b.name).toLowerCase()));
    const userSpCode = (user?.salespersonCode || user?.username || '').trim().toLowerCase();
    return salespersons.filter((s) => {
      if (s.id === user?.id || (s.code && s.code.toLowerCase() === userSpCode)) return true;
      if (s.branchId && adminBranchIds.has(s.branchId)) return true;
      const sBranch = cleanBranchName(s.branchName || '').toLowerCase();
      if (sBranch && adminBranchNames.has(sBranch)) return true;
      return false;
    });
  }

  if (isSuperAdminOrAgm(user)) return salespersons;
  const { branchId, branchName } = getUserBranch(user, salespersons, branches);
  const branchWide = hasBranchWideAccess(user, salespersons, branches);
  const currentBranch = branches.find((b) => b.id === branchId);
  const userSpCode = (user?.salespersonCode || '').trim().toLowerCase();
  const userName = (user?.name || user?.username || '').trim().toLowerCase();

  return salespersons.filter((s) => {
    // If not in same branch, skip
    if (s.branchId && s.branchId !== branchId) {
      return false;
    }

    // Regular officer/user only sees their own profile
    if (!branchWide) {
      if (userSpCode && s.code && s.code.trim().toLowerCase() === userSpCode) return true;
      if (userName && s.name && s.name.trim().toLowerCase() === userName) return true;
      return false;
    }

    // In-charge, Accounts, and Staff see all users in their own showroom/sales center
    if (s.branchId && s.branchId === branchId) return true;
    if (s.branchName && branchName && s.branchName.trim().toLowerCase() === branchName.trim().toLowerCase()) return true;
    if (
      s.areaGroup &&
      currentBranch?.address &&
      currentBranch.address.toLowerCase().includes(s.areaGroup.toLowerCase())
    ) {
      return true;
    }
    return false;
  });
}

export interface FormattedBranchAddress {
  line1: string;
  line2: string;
  line3: string;
  fullAddress: string;
  phone: string;
  email: string;
}

/**
 * Cleans and standardizes sales center / showroom names.
 * Strips redundant prefixes like "Poly Cables Ind. Ltd. (Madhupur Sales Center)" -> "Madhupur Sales Center",
 * "Poly Cables Ind. Ltd. (Tangail Sadar Showroom):" -> "Tangail Sadar Showroom",
 * and trims trailing colons, slashes, etc.
 */
export function cleanBranchName(raw?: string | null): string {
  if (!raw) return 'Madhupur Sales Center';
  let str = raw.trim();

  // If matches "Poly Cables Ind. Ltd. (Branch Name)" or "Poly Cables (Branch Name)"
  const matchParen = str.match(/poly\s*cables.*?\((.*?)\)/i);
  if (matchParen && matchParen[1]) {
    str = matchParen[1].trim();
  } else {
    // Strip leading "Poly Cables Ind. Ltd." or "Poly Cables Ltd." or "Poly Cables:"
    str = str.replace(/^poly\s*cables(?:\s*ind\.?\s*ltd\.?|\s*ltd\.?)?[:\s-]*/i, '').trim();
  }

  // Remove trailing count suffixes like "(12)" or "(All)"
  str = str.replace(/\s*\((?:all|\d+)\)\s*$/i, '').trim();

  // Remove trailing colons, dashes or whitespace
  str = str.replace(/[:\-–—\s]+$/, '').trim();

  // Remove "/ Showroom", "/Showroom", or standalone "Showroom"
  str = str.replace(/\s*\/\s*showroom/gi, '').trim();
  str = str.replace(/\bshowroom\b/gi, 'Sales Center').trim();
  str = str.replace(/(Sales Center\s*)+/gi, 'Sales Center').trim();

  // Legacy system titles for the primary showroom map to Madhupur Sales Center
  const lower = str.toLowerCase();
  if (lower.includes('billing portal') || lower.includes('polycables store') || lower === 'branch-main') {
    return 'Madhupur Sales Center';
  }

  // CORPORATE OFFICE (formerly Head Office / Central)
  if (
    lower.includes('corporate office') ||
    lower.includes('head office') ||
    lower.includes('motijheel') ||
    lower.includes('central')
  ) {
    return 'CORPORATE OFFICE';
  }

  // If empty or system placeholder, fallback to Madhupur Sales Center
  if (!str) {
    return 'Madhupur Sales Center';
  }

  return str;
}

/**
 * Cleanly formats sales center display names for registration, dropdowns, and emails,
 * hiding "showroom" labels and tags.
 */
export function formatSalesCenterDisplayName(raw?: string | null): string {
  if (!raw) return '';
  let str = raw.trim();
  // Strip "Poly Cables Ind. Ltd."
  const matchParen = str.match(/poly\s*cables.*?\((.*?)\)/i);
  if (matchParen && matchParen[1]) {
    str = matchParen[1].trim();
  } else {
    str = str.replace(/^poly\s*cables(?:\s*ind\.?\s*ltd\.?|\s*ltd\.?)?[:\s-]*/i, '').trim();
  }
  str = str.replace(/\s*\/\s*showroom/gi, '').trim();
  str = str.replace(/\bshowroom\b/gi, 'Sales Center').trim();
  str = str.replace(/(Sales Center\s*)+/gi, 'Sales Center').trim();
  str = str.replace(/[:\-–—\s]+$/, '').trim();
  return str;
}

/**
 * Returns formatted 3-line company address for invoices and challans based on sales center.
 */
export function getBranchAddressDetails(
  branch?: BranchLocation | null,
  fallbackPhone?: string,
  fallbackEmail?: string
): FormattedBranchAddress {
  if (
    !branch ||
    branch.id === 'ALL' ||
    branch.id === 'all' ||
    cleanBranchName(branch?.name).toLowerCase().includes('all sales center') ||
    cleanBranchName(branch?.name).toLowerCase() === 'all'
  ) {
    return {
      line1: '',
      line2: '',
      line3: '',
      fullAddress: '',
      phone: '',
      email: ''
    };
  }

  let branchName = cleanBranchName(branch.name);
  if (branch.type === 'head_office' && !branchName.toLowerCase().includes('corporate office')) {
    branchName = 'CORPORATE OFFICE';
  }

  const isMadhupur =
    branch.id === 'branch-1' ||
    branchName.toLowerCase().includes('madhupur') ||
    (branch.address || '').toLowerCase().includes('madhupur');

  const isHeadOffice =
    branch.type === 'head_office' ||
    branch.id === 'branch-head-office' ||
    branch.id === 'branch-ho' ||
    branchName.toLowerCase().includes('corporate office') ||
    branchName.toLowerCase().includes('head office') ||
    branchName.toLowerCase().includes('central');

  const rawBranchAddr = (branch.address || '').trim();
  const isLegacyHoAddr =
    !rawBranchAddr ||
    rawBranchAddr.toLowerCase().includes('dilkusha') ||
    rawBranchAddr.toLowerCase().includes('motijheel') ||
    rawBranchAddr.toLowerCase().includes('poly tower');

  const addr = isHeadOffice
    ? (isLegacyHoAddr ? 'House-16, Block-C, Main Road, Aftabnagar, Dhaka, Bangladesh' : rawBranchAddr)
    : (rawBranchAddr || (isMadhupur ? 'Holding No. 392, Shop No. 3, Sanjoy Smrity Market, Raypara, Madhupur, Tangail' : ''));

  const rawBranchPhone = (branch.phone || '').trim();
  const isLegacyHoPhone = !rawBranchPhone || rawBranchPhone === '01713-434290' || rawBranchPhone === '01713434290';
  const phone = isHeadOffice
    ? (isLegacyHoPhone ? '01730732000' : rawBranchPhone)
    : (rawBranchPhone || fallbackPhone || (isMadhupur ? '01713-434290' : '')).trim();
  const email = (branch.email || fallbackEmail || 'info@polycables.com.bd').trim();

  if (isHeadOffice) {
    return {
      line1: `${branchName}: House-16, Block-C, Main Road, Aftabnagar,`,
      line2: `Dhaka, Bangladesh. Mobile: ${phone}`,
      line3: email ? `E-mail: ${email}` : '',
      fullAddress: `${branchName ? branchName + ', ' : ''}${addr}`,
      phone,
      email
    };
  }

  if (!addr && !phone) {
    return {
      line1: branchName ? `${branchName}` : '',
      line2: '',
      line3: email ? `E-mail: ${email}` : '',
      fullAddress: branchName || '',
      phone,
      email
    };
  }

  // If Madhupur showroom or standard pattern
  if (addr.toLowerCase().includes('sanjoy smrity market')) {
    return {
      line1: `${branchName}: Holding No. 392, Shop No. 3, Sanjoy Smrity Market,`,
      line2: `Raypara, Madhupur, Tangail. Mob: ${phone}`,
      line3: `E-mail: ${email}`,
      fullAddress: `${branchName ? branchName + ', ' : ''}${addr}`,
      phone,
      email
    };
  }

  // Other branches: split by comma to balance 2 lines cleanly
  const parts = addr.split(',').map((s) => s.trim()).filter(Boolean);
  let l1 = addr;
  let l2 = '';
  if (parts.length >= 3) {
    const splitIdx = Math.ceil(parts.length / 2);
    l1 = parts.slice(0, splitIdx).join(', ') + ',';
    l2 = parts.slice(splitIdx).join(', ');
  } else if (parts.length === 2) {
    l1 = parts[0] + ',';
    l2 = parts[1];
  }

  return {
    line1: l1 ? `${branchName}: ${l1}` : branchName,
    line2: l2 ? `${l2}${phone ? `. Mob: ${phone}` : ''}` : (phone ? `Mob: ${phone}` : ''),
    line3: email ? `E-mail: ${email}` : '',
    fullAddress: `${branchName ? branchName + ', ' : ''}${addr}`,
    phone,
    email
  };
}

/**
 * Robust matcher to determine if a stored bill belongs to a specific branch/sales center.
 * Inspects party sales-center scope, bill's branch ID, branch name, and salesman's branch.
 */
export function billMatchesBranch(
  b: StoredBill,
  targetBranchId: string,
  branches: BranchLocation[] = [],
  salespersons: Salesperson[] = [],
  parties: Party[] = []
): boolean {
  const targetTrimmed = (targetBranchId || '').trim();
  const targetIdLower = targetTrimmed.toLowerCase();
  if (!targetIdLower || isAllSalesCenterPlaceholder(targetIdLower)) {
    return true;
  }

  const normalizedQueryId = normalizeBranchId(targetIdLower);
  const targetCleanQuery = cleanBranchName(targetTrimmed).toLowerCase().trim();

  const targetBranch = branches.find(
    (br) =>
      normalizeBranchId(br.id) === normalizedQueryId ||
      br.id.toLowerCase().trim() === targetIdLower ||
      br.name.toLowerCase().trim() === targetIdLower ||
      cleanBranchName(br.name).toLowerCase().trim() === targetCleanQuery
  ) || branches.find(
    (br) =>
      Boolean(targetCleanQuery) &&
      (cleanBranchName(br.name).toLowerCase().includes(targetCleanQuery) ||
        targetCleanQuery.includes(cleanBranchName(br.name).toLowerCase()))
  );

  const targetCleanName = cleanBranchName(targetBranch?.name || targetTrimmed).toLowerCase().trim();
  const targetActualId = (targetBranch?.id || targetTrimmed).toLowerCase().trim();
  const normalizedTargetId = normalizeBranchId(targetActualId);
  const targetPrefix = getSalesCenterPrefix(targetBranch || targetTrimmed);

  const isMadhupurTarget = normalizedTargetId === 'branch-1' || targetCleanName.includes('madhupur') || targetPrefix === 'MP';
  const isAshuliaTarget = normalizedTargetId === 'branch-ashulia' || targetCleanName.includes('ashulia') || targetPrefix === 'AS';

  // 0. Strict Party-to-Sales-Center Scoping:
  // If the bill's party belongs to a specific Sales Center, that party's bills must ONLY be visible under that Sales Center's scope.
  const matchedParty = findPartyForBill(b, parties, salespersons, branches);
  if (matchedParty && hasSpecificPartySalesCenter(matchedParty, salespersons)) {
    return partyMatchesBranch(matchedParty, targetBranch?.id || targetBranchId, branches, salespersons);
  }

  // 1. Bill's direct branch fields (ignore "ALL" / "All Sales Centers" placeholders)
  const rawBillBranchIdRaw = (b.branchId || (b as any).header?.branchId || '').trim().toLowerCase();
  const rawBillBranchId = isAllSalesCenterPlaceholder(rawBillBranchIdRaw) ? '' : rawBillBranchIdRaw;
  const billBranchId = normalizeBranchId(rawBillBranchId);

  const rawBillBranchNameVal = (b.branchName || (b as any).header?.branchName || (b as any).header?.salesCenter || (b as any).salesCenter || '').trim();
  const rawBillBranchName = isAllSalesCenterPlaceholder(rawBillBranchNameVal) ? '' : rawBillBranchNameVal;
  const billCleanName = rawBillBranchName ? cleanBranchName(rawBillBranchName).toLowerCase().trim() : '';

  // Prefix extraction (supports MP-01, MP01, GP-01, AS-01, etc.)
  const rawBillNo = (b.header?.billNo || (b as any).billNo || '').trim();
  const billPrefixMatch = rawBillNo.match(/^([A-Za-z]{2,5})(?:[-_/\s]+|\d|$)/i);
  const billPrefix = billPrefixMatch ? billPrefixMatch[1].toUpperCase() : '';

  // Prevent Madhupur (MP) and Ashulia (AS) showroom bills from leaking into each other or other centers
  if (billPrefix === 'MP' && !isMadhupurTarget) {
    return false;
  }
  if (isAshuliaTarget) {
    if (billPrefix === 'MP' || billBranchId === 'branch-1' || billCleanName.includes('madhupur') || rawBillBranchName.toLowerCase().includes('madhupur')) {
      return false;
    }
  }
  if (isMadhupurTarget) {
    if (billPrefix === 'AS' || billBranchId === 'branch-ashulia' || billCleanName.includes('ashulia') || rawBillBranchName.toLowerCase().includes('ashulia')) {
      return false;
    }
  }

  // Direct match by branch ID (checked BEFORE generic prefix heuristics so explicit branchId is authoritative)
  if (billBranchId && billBranchId !== 'all') {
    if (billBranchId === normalizedTargetId || billBranchId === normalizedQueryId || billBranchId === targetIdLower || billBranchId === targetActualId) {
      return true;
    }
    if (targetCleanName && billBranchId === targetCleanName) {
      return true;
    }
    const cleanIdAsName = cleanBranchName(billBranchId).toLowerCase().trim();
    if (targetCleanName && cleanIdAsName && (cleanIdAsName === targetCleanName || cleanIdAsName.includes(targetCleanName) || targetCleanName.includes(cleanIdAsName))) {
      return true;
    }
    // Check if billBranchId refers to a known other branch in the branches catalog;
    // if stale/recreated (not in catalog) and rawBillBranchName is present, fall back to branchName check below.
    const knownOtherBranch = branches.find(
      (br) => normalizeBranchId(br.id) === billBranchId || br.id.toLowerCase().trim() === billBranchId
    );
    if (knownOtherBranch || !rawBillBranchName) {
      return false;
    }
  }

  // Direct match by bill branch / sales center name
  if (rawBillBranchName) {
    if (billCleanName && targetCleanName && (billCleanName === targetCleanName || billCleanName.includes(targetCleanName) || targetCleanName.includes(billCleanName))) {
      return true;
    }
    const rawLower = rawBillBranchName.toLowerCase();
    if (
      rawLower === targetIdLower ||
      rawLower === normalizedTargetId ||
      (targetBranch?.name && rawLower.includes(targetBranch.name.toLowerCase()))
    ) {
      return true;
    }
    // Explicit other sales center name assigned
    return false;
  }

  // For bills with NO explicit branchId/branchName, isolate ONLY known Sales Center code prefixes (e.g. GP-01, TG-01)
  if (
    billPrefix &&
    KNOWN_SALES_CENTER_PREFIXES.has(billPrefix) &&
    billPrefix !== targetPrefix &&
    targetPrefix !== 'SC'
  ) {
    return false;
  }

  // 2. Match by salesman's assigned branch
  const billSalesman = (b.header?.salesmanCode || (b as any).salesmanCode || b.header?.salespersonName || (b as any).salespersonName || '').trim().toLowerCase();
  if (billSalesman && salespersons.length > 0) {
    const matchedSp = salespersons.find(
      (sp) =>
        (sp.code || '').trim().toLowerCase() === billSalesman ||
        (sp.name || '').trim().toLowerCase() === billSalesman ||
        (sp.id || '').trim().toLowerCase() === billSalesman
    );
    if (matchedSp) {
      const spBranchId = normalizeBranchId(matchedSp.branchId);
      const spBranchName = cleanBranchName(matchedSp.branchName || '').toLowerCase().trim();
      const isMultiBranchSp = Boolean(matchedSp.assignedBranchIds && matchedSp.assignedBranchIds.length > 1);

      if (spBranchId && (spBranchId === normalizedTargetId || spBranchId === normalizedQueryId || spBranchId === targetIdLower || spBranchId === targetActualId)) {
        return true;
      }
      if (matchedSp.assignedBranchIds && matchedSp.assignedBranchIds.some((id) => normalizeBranchId(id) === normalizedTargetId)) {
        return true;
      }
      if (!isMultiBranchSp && targetCleanName && spBranchName && (spBranchName === targetCleanName || spBranchName.includes(targetCleanName) || targetCleanName.includes(spBranchName))) {
        return true;
      }
      if ((spBranchId && spBranchId !== 'all') || (!isMultiBranchSp && spBranchName)) {
        return false;
      }
    }
  }

  // 3. Default / Fallback ONLY for legacy untagged bills that have NO explicit branch ID and NO explicit branch name
  if (isMadhupurTarget) {
    if (
      (!billBranchId && !rawBillBranchName) ||
      (b.header?.address || '').toLowerCase().includes('madhupur') ||
      (b.header?.partyName || '').toLowerCase().includes('sonchita') ||
      (b.company?.name || '').toLowerCase().includes('madhupur')
    ) {
      return true;
    }
  }

  return false;
}

