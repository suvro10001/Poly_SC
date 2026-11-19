import { BranchLocation, CompanyDetails } from '../types';
import { defaultBranches } from '../data/defaultData';

export interface BranchHeaderAddress {
  companyName: string;
  addressLine1: string;
  addressLine2: string;
  fullAddress: string;
  phone: string;
  email: string;
  branchName: string;
  branchId: string;
}

/**
 * Resolves dynamic, sales-center-specific header address and contact details
 * Format:
 * Poly Cables Ind. Ltd.: Holding No. 392, Shop No. 3, Sanjoy Smrity Market,
 * Raypara, Madhupur, Tangail. Mob: 01713-434290
 * E-mail: info@polycables.com.bd
 */
export function getBranchHeaderAddress(
  branchOrId?: BranchLocation | string | null,
  branches: BranchLocation[] = defaultBranches,
  fallbackCompany?: Partial<CompanyDetails> | null
): BranchHeaderAddress {
  const effectiveBranches = branches && branches.length > 0 ? branches : defaultBranches;
  
  let branch: BranchLocation | undefined;
  if (typeof branchOrId === 'string' && branchOrId) {
    const query = branchOrId.toLowerCase().trim();
    branch = effectiveBranches.find(
      (b) => b.id.toLowerCase() === query || b.name.toLowerCase().trim() === query
    );
    if (!branch) {
      branch = effectiveBranches.find(
        (b) => b.id.toLowerCase().includes(query) || b.name.toLowerCase().includes(query)
      );
    }
  } else if (branchOrId && typeof branchOrId === 'object') {
    branch = branchOrId;
  }

  // If no branch found, fallback to first branch if available
  if (!branch) {
    branch = effectiveBranches[0];
  }

  const bName = branch?.name || fallbackCompany?.name || 'Sales Center / Showroom';
  const bId = branch?.id || '';
  const companyTitle = 'POLY CABLES IND. LTD.';
  const rawAddress = branch?.address?.trim() || '';
  const isCorp =
    branch?.type === 'head_office' ||
    bId === 'branch-head-office' ||
    bId === 'branch-ho' ||
    bId === 'branch-main' ||
    bName.toLowerCase().includes('head office') ||
    bName.toLowerCase().includes('corporate office') ||
    bName.toLowerCase().includes('central') ||
    rawAddress.toLowerCase().includes('poly tower') ||
    rawAddress.toLowerCase().includes('dilkusha') ||
    rawAddress.toLowerCase().includes('aftabnagar');
  const bPhone = isCorp
    ? (branch?.phone && branch.phone !== '01713-434290' ? branch.phone : '01730732000')
    : (branch?.phone || fallbackCompany?.phone || '01713-434290');
  const bEmail = branch?.email || fallbackCompany?.email || 'info@polycables.com.bd';

  // Branch-specific address split logic
  let line1 = '';
  let line2 = '';

  if (isCorp) {
    line1 = 'CORPORATE OFFICE: House-16, Block-C, Main Road, Aftabnagar,';
    line2 = 'Dhaka, Bangladesh.';
  } else if (rawAddress.toLowerCase().includes('holding no. 392') || bId === 'branch-1' || bName.toLowerCase().includes('madhupur')) {
    line1 = 'Poly Cables Ind. Ltd.: Holding No. 392, Shop No. 3, Sanjoy Smrity Market,';
    line2 = 'Raypara, Madhupur, Tangail.';
  } else if (rawAddress.toLowerCase().includes('victoria road') || bId === 'branch-2' || bName.toLowerCase().includes('tangail')) {
    line1 = 'Poly Cables Ind. Ltd.: Victoria Road,';
    line2 = 'Tangail Sadar, Tangail.';
  } else if (rawAddress.toLowerCase().includes('college road') || bId === 'branch-3' || bName.toLowerCase().includes('ghatail')) {
    line1 = 'Poly Cables Ind. Ltd.: College Road,';
    line2 = 'Ghatail, Tangail.';
  } else if (rawAddress.toLowerCase().includes('nawabpur') || bId === 'branch-pm' || bName.toLowerCase().includes('nawabpur')) {
    line1 = 'Poly Cables Ind. Ltd.: Nawabpur Road,';
    line2 = 'Old Dhaka, Dhaka.';
  } else if (rawAddress) {
    // Split on first comma or midpoint for clean two-line presentation
    const parts = rawAddress.split(',');
    if (parts.length >= 2) {
      const mid = Math.ceil(parts.length / 2);
      const firstPart = parts.slice(0, mid).join(',').trim();
      const secondPart = parts.slice(mid).join(',').trim();
      line1 = `Poly Cables Ind. Ltd.: ${firstPart},`;
      line2 = secondPart.endsWith('.') ? secondPart : `${secondPart}.`;
    } else {
      line1 = 'Poly Cables Ind. Ltd.:';
      line2 = rawAddress.endsWith('.') ? rawAddress : `${rawAddress}.`;
    }
  } else {
    // Default fallback to Madhupur
    line1 = 'Poly Cables Ind. Ltd.: Holding No. 392, Shop No. 3, Sanjoy Smrity Market,';
    line2 = 'Raypara, Madhupur, Tangail.';
  }

  const fullAddress = `${line1} ${line2}`;

  return {
    companyName: companyTitle,
    addressLine1: line1,
    addressLine2: line2,
    fullAddress,
    phone: bPhone,
    email: bEmail,
    branchName: bName,
    branchId: bId
  };
}
