import { Party, Salesperson, CollectionMR } from '../types';
import { standardizePartyName, getPartyCleanKey, isInvalidPartyName } from './partyDeduplication';

export interface ResolvedPartyAndMarketing {
  partyName: string;
  partyAddress: string;
  marketingPerson: string;
  salesmanCode: string;
  salesCenter: string;
  phone: string;
}

/**
 * Resolves authoritative customer party name, address, and assigned marketing officer
 * using customer directory, salespersons list, and prior collections history.
 */
export function resolvePartyAndMarketing(
  record: any,
  parties: Party[] = [],
  salespersons: Salesperson[] = [],
  collections: CollectionMR[] = []
): ResolvedPartyAndMarketing {
  if (!record) {
    return {
      partyName: '',
      partyAddress: '',
      marketingPerson: '-',
      salesmanCode: '',
      salesCenter: '',
      phone: ''
    };
  }

  const rawParty = (
    record.partyName ||
    record.customerName ||
    record.accountTitle ||
    record.name ||
    ''
  ).trim();

  const stdParty = rawParty ? standardizePartyName(rawParty) : '';
  const partyCleanKey = stdParty ? getPartyCleanKey(stdParty) : '';

  let matchedParty: Party | undefined;
  if (parties && parties.length > 0 && (partyCleanKey || stdParty)) {
    matchedParty = parties.find((p) => {
      if (!p || !p.name) return false;
      const pStd = standardizePartyName(p.name);
      const pKey = getPartyCleanKey(pStd);
      if (partyCleanKey && pKey && partyCleanKey === pKey) return true;
      if (stdParty && pStd.toLowerCase() === stdParty.toLowerCase()) return true;
      return false;
    });
  }

  // Determine final party name
  let finalPartyName = rawParty;
  if (matchedParty?.name) {
    finalPartyName = matchedParty.name;
  } else if (stdParty && !isInvalidPartyName(stdParty)) {
    finalPartyName = stdParty;
  }
  if (!finalPartyName || finalPartyName === '-' || finalPartyName.toLowerCase() === 'undefined' || finalPartyName.toLowerCase() === 'customer') {
    finalPartyName = '';
  }

  // Determine address
  const partyAddress =
    matchedParty?.address ||
    record.customerAddress ||
    record.address ||
    record.location ||
    '';

  // Determine phone
  const phone =
    matchedParty?.phone ||
    matchedParty?.mobile ||
    record.phone ||
    record.mobile ||
    '';

  // Determine sales center
  const salesCenter =
    matchedParty?.branchName ||
    matchedParty?.branch ||
    record.branchName ||
    record.salesCenter ||
    '';

  // Determine marketing person and code
  let marketingPerson =
    matchedParty?.salespersonName ||
    (matchedParty as any)?.salesperson ||
    '';
  let salesmanCode = matchedParty?.salesmanCode || record.salesmanCode || '';

  // If not on party, check record itself
  if (!marketingPerson || marketingPerson === '-') {
    marketingPerson =
      record.marketingPerson ||
      record.salesperson ||
      record.salespersonName ||
      '';
  }

  // If we have a salesman code, look up in salespersons list
  if ((!marketingPerson || marketingPerson === '-') && salesmanCode && salespersons?.length) {
    const sp = salespersons.find(
      (s) => s.code?.toLowerCase() === salesmanCode.toLowerCase()
    );
    if (sp) {
      marketingPerson = sp.name;
    }
  }

  // If still not found, check collections for recent entry for this party
  if (
    (!marketingPerson || marketingPerson === '-') &&
    partyCleanKey &&
    collections?.length
  ) {
    for (let i = collections.length - 1; i >= 0; i--) {
      const col = collections[i];
      if (!col) continue;
      const cParty = col.partyName || (col as any).customerName || '';
      const cKey = getPartyCleanKey(standardizePartyName(cParty));
      if (cKey && cKey === partyCleanKey) {
        const candidateSp = col.marketingPerson || (col as any).salesperson;
        if (candidateSp && candidateSp !== '-') {
          marketingPerson = candidateSp;
          if (col.salesmanCode) salesmanCode = col.salesmanCode;
          break;
        }
      }
    }
  }

  // Fallback to '-' if empty
  if (!marketingPerson || marketingPerson.trim() === '') {
    marketingPerson = '-';
  }

  return {
    partyName: finalPartyName,
    partyAddress,
    marketingPerson: marketingPerson.trim(),
    salesmanCode: salesmanCode.trim(),
    salesCenter,
    phone
  };
}

export default resolvePartyAndMarketing;
