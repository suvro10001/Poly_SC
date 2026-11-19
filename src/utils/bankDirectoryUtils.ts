const DELETED_BANKS_KEY = 'polycables_deleted_banks';
const DELETED_ACCOUNTS_KEY = 'polycables_deleted_accounts';

export function normalizeBankOrAccountKey(name: string): string {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function deduplicateStringArray(arr: string[] = []): string[] {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of arr) {
    if (!item || typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = normalizeBankOrAccountKey(trimmed);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }

  return result;
}

function getDeletedBanksRaw(): string[] {
  try {
    const raw = localStorage.getItem(DELETED_BANKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getDeletedBanks(): Set<string> {
  const list = getDeletedBanksRaw();
  return new Set(list.map(normalizeBankOrAccountKey).filter(Boolean));
}

export function addDeletedBank(name: string): void {
  try {
    const current = getDeletedBanksRaw();
    const key = normalizeBankOrAccountKey(name);
    if (!current.some((b) => normalizeBankOrAccountKey(b) === key)) {
      current.push(name.trim());
      localStorage.setItem(DELETED_BANKS_KEY, JSON.stringify(current));
    }
  } catch {}
}

export function removeDeletedBank(name: string): void {
  try {
    const current = getDeletedBanksRaw();
    const key = normalizeBankOrAccountKey(name);
    const updated = current.filter((b) => normalizeBankOrAccountKey(b) !== key);
    localStorage.setItem(DELETED_BANKS_KEY, JSON.stringify(updated));
  } catch {}
}

export function clearDeletedBanks(): void {
  try {
    localStorage.removeItem(DELETED_BANKS_KEY);
  } catch {}
}

function getDeletedAccountsRaw(): string[] {
  try {
    const raw = localStorage.getItem(DELETED_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getDeletedAccounts(): Set<string> {
  const list = getDeletedAccountsRaw();
  return new Set(list.map(normalizeBankOrAccountKey).filter(Boolean));
}

export function addDeletedAccount(name: string): void {
  try {
    const current = getDeletedAccountsRaw();
    const key = normalizeBankOrAccountKey(name);
    if (!current.some((a) => normalizeBankOrAccountKey(a) === key)) {
      current.push(name.trim());
      localStorage.setItem(DELETED_ACCOUNTS_KEY, JSON.stringify(current));
    }
  } catch {}
}

export function removeDeletedAccount(name: string): void {
  try {
    const current = getDeletedAccountsRaw();
    const key = normalizeBankOrAccountKey(name);
    const updated = current.filter((a) => normalizeBankOrAccountKey(a) !== key);
    localStorage.setItem(DELETED_ACCOUNTS_KEY, JSON.stringify(updated));
  } catch {}
}

export function clearDeletedAccounts(): void {
  try {
    localStorage.removeItem(DELETED_ACCOUNTS_KEY);
  } catch {}
}
