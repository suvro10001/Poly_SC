import { BankDeposit } from '../types';
import { getPartyCleanKey, standardizePartyName } from './partyDeduplication';
import { parseDateToISO } from './dateUtils';
import { resolvePartyAndMarketing } from './partyAndMarketingResolver';

/**
 * Normalizes a bank name to find matching bank identifiers
 * (e.g. 'Pubali Bank PLC', 'Pubali Bank Limited', 'Pubali Bank' -> 'pubali')
 */
export function normalizeBankCleanName(bankName: string = ''): string {
  if (!bankName) return '';
  return bankName
    .toLowerCase()
    .replace(/\b(bank|plc|ltd|limited|corp|corporation|branch|agent|banking)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Deduplicates bank deposits based on:
 * 1. Unique deposit ID
 * 2. Specific voucher number / slip number with same amount
 * 3. Exact match of Date (normalized to ISO) + Party (authoritatively resolved) + Amount
 * 4. Exact match of Date + Bank Name + Amount (when party matches or one is generic)
 * 5. Preference for manual/richer entries over auto/incomplete placeholders
 */
export function deduplicateBankDeposits(deposits: BankDeposit[] = []): BankDeposit[] {
  if (!Array.isArray(deposits) || deposits.length <= 1) return deposits || [];

  const seenIds = new Set<string>();
  const seenVouchers = new Map<string, number>(); // vKey -> index in uniqueDeposits
  const seenDpa = new Map<string, number>();      // dpaKey -> index in uniqueDeposits
  const seenBankAmt = new Map<string, number>();  // bankKey -> index in uniqueDeposits
  const uniqueDeposits: BankDeposit[] = [];

  for (const dep of deposits) {
    if (!dep) continue;

    const depId = String(dep.id || '').trim();
    if (depId) {
      if (seenIds.has(depId)) continue;
      seenIds.add(depId);
    }

    const rawDate = dep.depositDate || dep.date || '';
    const isoDate = parseDateToISO(rawDate) || rawDate.trim();
    const cleanBank = normalizeBankCleanName(dep.bankName);
    const amount = Math.round((Number(dep.amount) || 0) * 100);
    const rawVoucher = String(dep.voucherNo || (dep as any).slipNo || (dep as any).referenceCode || '').trim().toLowerCase();
    const hasSpecificVoucher = rawVoucher && !rawVoucher.startsWith('dep-') && !rawVoucher.startsWith('slip-');

    // Authoritatively resolve party name
    const cleanPartyStr = (val?: any) => {
      const s = String(val || '').trim();
      return s && s.toLowerCase() !== 'customer' && s.toLowerCase() !== 'general customer' ? s : '';
    };

    const resolved = resolvePartyAndMarketing(dep);
    const rawParty = (cleanPartyStr(dep.partyName) || cleanPartyStr(dep.customerName) || (dep as any).accountTitle || '').trim();
    const finalParty = cleanPartyStr(resolved.partyName) || rawParty;
    const partyKey = getPartyCleanKey(finalParty);

    if (amount <= 0) {
      uniqueDeposits.push(dep);
      continue;
    }

    let isDuplicate = false;
    let existingIndex = -1;

    // Check 1: Specific voucher number + amount
    if (hasSpecificVoucher) {
      const vKey = `v_${rawVoucher}_${amount}`;
      if (seenVouchers.has(vKey)) {
        isDuplicate = true;
        existingIndex = seenVouchers.get(vKey)!;
      }
    }

    // Check 2: Same Date + Same Party Key + Same Amount
    if (!isDuplicate && isoDate && partyKey && amount > 0) {
      const dpaKey = `dpa_${isoDate}_${partyKey}_${amount}`;
      if (seenDpa.has(dpaKey)) {
        isDuplicate = true;
        existingIndex = seenDpa.get(dpaKey)!;
      }
    }

    // Check 3: Same Date + Clean Bank + Same Amount
    if (!isDuplicate && isoDate && cleanBank && amount > 0) {
      const bankKey = `bank_${isoDate}_${cleanBank}_${amount}`;
      if (seenBankAmt.has(bankKey)) {
        const candidateIdx = seenBankAmt.get(bankKey)!;
        const candidate = uniqueDeposits[candidateIdx];
        const candResolved = resolvePartyAndMarketing(candidate);
        const candRaw = (cleanPartyStr(candidate.partyName) || cleanPartyStr(candidate.customerName) || '').trim();
        const candPartyKey = getPartyCleanKey(cleanPartyStr(candResolved.partyName) || candRaw);
        // If neither has party, or both have same party, or one has party and the other is generic/empty
        if (!partyKey || !candPartyKey || partyKey === candPartyKey) {
          isDuplicate = true;
          existingIndex = candidateIdx;
        }
      }
    }

    // Check 4: Same Date + Same Amount when one is an auto deposit and another is manual
    if (!isDuplicate && isoDate && amount > 0) {
      const isCurrentAuto = Boolean((dep as any).isAutoDeposit || dep.id?.startsWith('auto-'));
      for (let i = 0; i < uniqueDeposits.length; i++) {
        const u = uniqueDeposits[i];
        const uIso = parseDateToISO(u.depositDate || u.date) || (u.depositDate || u.date);
        const uAmt = Math.round((Number(u.amount) || 0) * 100);
        if (uIso === isoDate && uAmt === amount) {
          const isUAuto = Boolean((u as any).isAutoDeposit || u.id?.startsWith('auto-'));
          const uResolved = resolvePartyAndMarketing(u);
          const uRaw = (cleanPartyStr(u.partyName) || cleanPartyStr(u.customerName) || '').trim();
          const uPartyKey = getPartyCleanKey(cleanPartyStr(uResolved.partyName) || uRaw);
          if (isCurrentAuto !== isUAuto) {
            if (!partyKey || !uPartyKey || partyKey === uPartyKey) {
              isDuplicate = true;
              existingIndex = i;
              break;
            }
          } else if (partyKey && uPartyKey && partyKey === uPartyKey) {
            isDuplicate = true;
            existingIndex = i;
            break;
          }
        }
      }
    }

    if (isDuplicate && existingIndex >= 0 && existingIndex < uniqueDeposits.length) {
      const existing = uniqueDeposits[existingIndex];
      const isExistingAuto = Boolean((existing as any).isAutoDeposit || existing.id?.startsWith('auto-'));
      const isIncomingManual = !(dep as any).isAutoDeposit && !dep.id?.startsWith('auto-');

      // Upgrade or enrich existing deposit with whichever has richer data
      const preferIncoming = isIncomingManual && isExistingAuto;
      const mergedParty = cleanPartyStr(dep.partyName) || cleanPartyStr(existing.partyName) || cleanPartyStr(dep.customerName) || cleanPartyStr(existing.customerName) || cleanPartyStr((dep as any).partyName) || cleanPartyStr((existing as any).partyName);
      const merged: BankDeposit = {
        ...(preferIncoming ? dep : existing),
        customerName: mergedParty,
        partyName: mergedParty,
        customerAddress: dep.customerAddress || existing.customerAddress,
        marketingPerson: (dep.marketingPerson && dep.marketingPerson !== '-') ? dep.marketingPerson : existing.marketingPerson,
        voucherNo: dep.voucherNo || existing.voucherNo,
        bankName: dep.bankName || existing.bankName,
        accountName: dep.accountName || existing.accountName,
        displayTag: dep.displayTag || existing.displayTag
      };

      uniqueDeposits[existingIndex] = merged;
      continue;
    }

    // Register all business keys for this newly accepted unique deposit
    const newIdx = uniqueDeposits.length;
    if (hasSpecificVoucher) {
      seenVouchers.set(`v_${rawVoucher}_${amount}`, newIdx);
    }
    if (isoDate && partyKey && amount > 0) {
      seenDpa.set(`dpa_${isoDate}_${partyKey}_${amount}`, newIdx);
    }
    if (isoDate && cleanBank && amount > 0) {
      seenBankAmt.set(`bank_${isoDate}_${cleanBank}_${amount}`, newIdx);
    }

    uniqueDeposits.push(dep);
  }

  return uniqueDeposits;
}
