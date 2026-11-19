import { standardizePartyName, isInvalidPartyName } from './partyDeduplication';

/**
 * Sanitizes a single party name by stripping embedded currency amounts,
 * parenthetical amount values, and system artifacts.
 */
export function sanitizeSinglePartyName(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let str = raw.trim();

  // Strip embedded currency notes e.g., "(৳10,000)", "(Tk 50,000)", ": 25000", "(20,000)"
  str = str.replace(/\s*[\(\[]\s*(?:৳|tk|taka)?\s*[\d,.]+\s*[\)\]]/gi, '');
  str = str.replace(/[:\-–—]\s*(?:৳|tk|taka)?\s*[\d,.]+\s*$/gi, '');
  str = str.replace(/\s*(?:৳|tk|taka)\s*[\d,.]+/gi, '');

  str = str.trim();
  if (isInvalidPartyName(str)) return '';
  return standardizePartyName(str);
}

/**
 * Extracts a list of clean, unique party names from either a comma-separated string
 * or an array of strings.
 */
export function extractCleanPartyList(input: string | string[] | null | undefined): string[] {
  if (!input) return [];

  const rawList: string[] = Array.isArray(input) ? input : String(input).split(',');
  const cleaned: string[] = [];
  const seen = new Set<string>();

  for (const item of rawList) {
    if (!item || typeof item !== 'string') continue;
    const sanitized = sanitizeSinglePartyName(item);
    if (!sanitized) continue;
    const lower = sanitized.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      cleaned.push(sanitized);
    }
  }

  return cleaned;
}
