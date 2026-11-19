/**
 * Ultra-smart flexible search helper for electrical cables, wires, and poly items.
 *
 * Core Principles:
 * 1. Specific cable types:
 *    - 'tt', 't/t', 'twintwisted', 'twisted': matches Twin Twisted cables ONLY (T/T). Never matches Flat Twin (F/T) or other non-twisted cables.
 *    - 'ft', 'f/t', 'flattwin', 'flat': matches Flat Twin cables ONLY (F/T). Never matches Twin Twisted (T/T).
 * 2. Exact strand / size numbers (e.g. 12, 8, 14, 23, 40, 70, 110):
 *    - Matches distinct strand/gauge specifications (e.g. '12/0.19', '12/.0076', '12/76', '12 rm', '12 re', '12 mm', '12 pair', 'd-12')
 *    - NEVER matches as a random substring of an item code (like PC-123 or PC-120) or larger numbers (123, 120, 112).
 * 3. Exact decimal specifications (e.g. '1.3', '1.0', '1.5', '2.0', '2.5', '3.0', '4.0', '4.5', '6.0', '7.0', '14.5'):
 *    - Matches exact decimal boundaries. '1.3' NEVER matches '13', '1.0', or '7.0'.
 * 4. Fractions & standard wire numbers:
 *    - '3/22', '3/29', '7/22', '7/20', '7/18', '14/76', '23/76', '40/76', '70/76', '110/76', '40/0.19', etc.
 * 5. Wire constructions / categories:
 *    - 'bya', 'byfy', 'bym', 'nyy', 'alu', 'bobin', '500m', 'd11', 'd12', 'rg6', '2pair'
 */
export function matchesFlexibleSearch(targetText: string, searchQuery: string, extraContext?: string): boolean {
  if (!searchQuery || !searchQuery.trim()) return true;
  if (!targetText && !extraContext) return false;

  const rawQuery = searchQuery.toLowerCase().trim().replace(/×/g, 'x').replace(/(\d)\s*\*\s*(\d)/g, '$1x$2');
  const searchingForPcCode = /\bpc\b|\bpc-|\bpc\d+/i.test(rawQuery);

  let cleanTargetText = targetText || '';
  let cleanExtra = extraContext || '';

  if (!searchingForPcCode) {
    // Remove "PC-xxx" patterns from target text so code numbers (like 120, 123) do not falsely match strand sizes
    cleanTargetText = cleanTargetText.replace(/\bpc-\d+[\w-]*\b/gi, '').replace(/\(pc-\d+[\w-]*\)/gi, '');
    cleanExtra = cleanExtra.replace(/\bpc-\d+[\w-]*\b/gi, '').replace(/\(pc-\d+[\w-]*\)/gi, '');
  }

  const combinedTarget = [cleanTargetText, cleanExtra].join(' ').trim();
  const rawTarget = combinedTarget.toLowerCase().replace(/×/g, 'x').replace(/(\d)\s*\*\s*(\d)/g, '$1x$2');

  // Direct whole-query substring match
  if (rawTarget.includes(rawQuery)) {
    return true;
  }

  // Symbol-agnostic match: spaces, -, /, *, _, parentheses, commas, etc. do not matter when searching items
  const strippedQuery = rawQuery.replace(/[^a-z0-9]/g, '');
  const strippedTarget = rawTarget.replace(/[^a-z0-9]/g, '');
  const isPureDigitsOrDecimal = /^\d+(?:\.\d+)?$/.test(rawQuery);
  if (!isPureDigitsOrDecimal && strippedQuery.length >= 2 && strippedTarget.includes(strippedQuery)) {
    return true;
  }

  // Cable type classifications
  const isTwinTwistedTarget =
    /\bt\s*[\/\-_]?\s*t\b/i.test(rawTarget) ||
    /\(t\/t\)/i.test(rawTarget) ||
    /\(tt\)/i.test(rawTarget) ||
    /\btt\b/i.test(rawTarget) ||
    /twin\s*twist(ed)?/i.test(rawTarget) ||
    /\btwisted\b/i.test(rawTarget);

  const isFlatTwinTarget =
    /\bf\s*[\/\-_]?\s*t\b/i.test(rawTarget) ||
    /\(f\/t\)/i.test(rawTarget) ||
    /\(ft\)/i.test(rawTarget) ||
    /\bft\b/i.test(rawTarget) ||
    /flat\s*twin/i.test(rawTarget) ||
    /\bflat\b/i.test(rawTarget);

  // Normalize query and extract tokens (treats -, /, _, spaces, commas, *, parentheses, and symbols as flexible separators)
  // E.g. "12tt" -> ["12", "tt"], "12/tt" -> ["12", "tt"], "2x40tt" -> ["2", "x", "40", "tt"], "1.3bya" -> ["1.3", "bya"]
  const normalizedQuery = rawQuery
    .replace(/t\s*[\/\-_]\s*t/g, ' tt ')
    .replace(/f\s*[\/\-_]\s*t/g, ' ft ')
    .replace(/(\d+)\s*[\/\-]\s*(\d*\.?\d+)/g, '$1/$2');

  const chunkRegex = /(\d+\/\d+\.\d+|\d+\/\.\d+|\d+\/\d+|\d+\.\d+|\d+|[a-z]+)/g;
  const chunkTokens: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = chunkRegex.exec(normalizedQuery)) !== null) {
    if (m[0]) {
      chunkTokens.push(m[0]);
    }
  }

  if (chunkTokens.length === 0) return strippedQuery.length > 0 ? strippedTarget.includes(strippedQuery) : true;

  // Specific check: if query has "tt" / "t/t" / "twist"
  const hasTtQuery = chunkTokens.some((t) => t === 'tt' || t === 'twist' || t === 'twintwisted');
  if (hasTtQuery) {
    // Target MUST be a Twin Twisted cable!
    if (!isTwinTwistedTarget) {
      return false;
    }
  }

  // Specific check: if query has "ft" / "f/t" / "flat"
  const hasFtQuery = chunkTokens.some((t) => t === 'ft' || t === 'flat' || t === 'flattwin');
  if (hasFtQuery) {
    // Target MUST be a Flat Twin cable!
    if (!isFlatTwinTarget) {
      return false;
    }
  }

  // Validate each token against target
  const checkTokenMatches = (token: string): boolean => {
    if (!token) return true;

    // Type tokens
    if (token === 'tt' || token === 'twist' || token === 'twintwisted') {
      return isTwinTwistedTarget;
    }
    if (token === 'ft' || token === 'flat' || token === 'flattwin') {
      return isFlatTwinTarget;
    }
    if (token === 'flexible' || token === 'flex') {
      return (
        rawTarget.includes('flex') ||
        isTwinTwistedTarget ||
        isFlatTwinTarget ||
        /\b(12|14|23|40|70|110)\s*[\/.]\s*(76|0076|0\.19|19)\b/.test(rawTarget)
      );
    }
    if (token === 'round') {
      return rawTarget.includes('round');
    }

    // Special items
    if (token === '500' || token === '500m' || token === 'bobin') {
      return rawTarget.includes('500') || rawTarget.includes('bobin');
    }

    // Decimal number: e.g. "1.3", "1.0", "1.5", "2.0", "2.5", "3.0", "4.0", "4.5", "6.0", "7.0", "14.5"
    if (/^\d+\.\d+$/.test(token)) {
      const escaped = token.replace('.', '\\.');
      const reg = new RegExp(`(^|[^0-9.])${escaped}([^0-9.]|$)`, 'i');
      return reg.test(rawTarget);
    }

    // Slash fractions: e.g. "3/22", "7/22", "12/76", "14/76", "23/76", "40/76", "70/76", "110/76", "40/0.19", "12/.0076"
    if (token.includes('/')) {
      const escaped = token.replace('.', '\\.').replace('/', '\\s*[\\/-]\\s*');
      const reg = new RegExp(escaped, 'i');
      if (reg.test(rawTarget)) return true;
      // Also match without slash/dot/symbols e.g. "1276" or "40019"
      const cleanWithoutSlash = token.replace(/[^a-z0-9]/g, '');
      return strippedTarget.includes(cleanWithoutSlash);
    }

    // Integer numbers: e.g. "12", "8", "14", "23", "40", "70", "110", "1", "2", "3", "4", "10", "16"
    if (/^\d+$/.test(token)) {
      // 1. Number at slash/hyphen/dot position: "12/...", ".../12", "(12/...", "12.0076", "12.19"
      const slashOrDotReg = new RegExp(`(^|[^0-9])(${token}\\s*[\\/.\\-]|[\\/.\\-]\\s*0?${token}([^0-9]|$))`, 'i');
      if (slashOrDotReg.test(rawTarget)) return true;

      // 2. Standalone number boundary in target (e.g. "12 rm", "12 re", "12 mm", "12 pair", "d-12", "2 x 12")
      const numBoundaryReg = new RegExp(`(^|[^0-9])${token}([^0-9]|$)`, 'i');
      if (numBoundaryReg.test(rawTarget)) return true;

      // 3. Composite slash/hyphen match: e.g. "1276" -> "12/76", "40019" -> "40/0.19", "400076" -> "40/.0076"
      const slashMatches = rawTarget.match(/(\d+)\s*[\/-]\s*(\d*\.?\d+)/g);
      if (slashMatches && slashMatches.some((sm) => sm.replace(/[^0-9]/g, '') === token)) {
        return true;
      }

      return false;
    }

    // Wire abbreviations: rm, re, sm, bya, byfy, bym, nyy, alu, pair, rg6, d11, d12
    if (['rm', 're', 'sm', 'bya', 'byfy', 'bym', 'nyy', 'alu', 'pair', 'rg6', 'd11', 'd12'].includes(token)) {
      const reg = new RegExp(`\\b${token}\\b`, 'i');
      if (reg.test(rawTarget)) return true;
    }

    // Single-letter suffix/modifier tokens (e.g. 'd11i' -> 'i' matches 'Insulated', 'p' matches 'Phase', 'w' matches '3-w')
    if (token.length === 1) {
      if (token === 'x') {
        return rawTarget.includes('x');
      }
      const wordStartReg = new RegExp(`\\b${token}`, 'i');
      if (wordStartReg.test(rawTarget)) {
        return true;
      }
      return false;
    }

    // Standard word substring match
    if (rawTarget.includes(token)) {
      return true;
    }

    // Clean match fallback for alpha tokens (e.g. "duplex", "insulated", "bare")
    const cleanToken = token.replace(/[^a-z0-9]/g, '');
    if (cleanToken && strippedTarget.includes(cleanToken)) {
      return true;
    }

    // Compound cable alpha decomposition (e.g. "1.3rmbya" -> "rmbya" -> ["rm", "bya"], "byafrls" -> ["bya", "frls"])
    if (/^[a-z]{3,}$/.test(token)) {
      const CABLE_VOCAB = [
        'twintwisted', 'flattwin', 'submersible', 'telephone', 'insulated', 'flexible',
        'armoured', 'shielded', 'coaxial', 'neutral', 'duplex', 'coated', 'copper',
        'single', 'double', 'aerial', 'yellow', 'bobin', 'round', 'twist', 'meter',
        'metre', 'cable', 'phase', 'green', 'black', 'white', 'frls', 'byfy', 'nycy',
        'xlpe', 'lszh', 'core', 'pair', 'flex', 'flat', 'skin', 'bare', 'wire',
        'drop', 'coil', 'coils', 'bya', 'bym', 'nyy', 'alu', 'mtr', 'swg', 'awg',
        'cat', 'rm', 're', 'sm', 'tt', 'ft', 'pc', 'rg', 'w', 'v', 'm'
      ];
      const splitTokens: string[] = [];
      let rem = token;
      while (rem.length > 0) {
        const matchedWord = CABLE_VOCAB.find((w) => rem.startsWith(w));
        if (!matchedWord) break;
        splitTokens.push(matchedWord);
        rem = rem.slice(matchedWord.length);
      }
      if (rem.length === 0 && splitTokens.length >= 2) {
        return splitTokens.every((sub) => checkTokenMatches(sub));
      }
    }

    return false;
  };

  if (chunkTokens.every(checkTokenMatches)) {
    return true;
  }

  // Fallback: compare symbol-stripped tokens if multi-chunk concatenated without symbols matches
  if (chunkTokens.length > 1) {
    const joinedClean = chunkTokens.join('').replace(/[^a-z0-9]/g, '');
    if (joinedClean.length >= 3 && strippedTarget.includes(joinedClean)) {
      return true;
    }
  }

  return false;
}

import { Item } from '../types';
import { getAllCategories } from './categoryHelper';

export const CATEGORY_SERIAL_ORDER = [
  'BYA',
  'BYFY',
  'Flexible',
  'Flexible Cable- 01 Core',
  'BYM',
  'Flexible Cable- 02 Core',
  'Flexible Cable- 03 Core',
  'Flexible Cable- 04 Core',
  'Arial Cable',
  'Telephone Cable'
];

export function getCategorySerialRank(category?: string, customOrder?: string[]): number {
  if (!category || !category.trim()) return 9999;
  const normalizedCat = category.trim().toLowerCase();
  try {
    const rawNums = localStorage.getItem('polycables_category_numbers');
    if (rawNums) {
      const parsed = JSON.parse(rawNums);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const directNum = Number(parsed[normalizedCat]);
        if (!isNaN(directNum) && directNum > 0) return directNum;
        const cleanCat = normalizedCat.replace(/[^a-z0-9]/g, '');
        if (cleanCat) {
          for (const [k, v] of Object.entries(parsed)) {
            if (k.trim().toLowerCase().replace(/[^a-z0-9]/g, '') === cleanCat) {
              const numVal = Number(v);
              if (!isNaN(numVal) && numVal > 0) return numVal;
            }
          }
        }
      }
    }
  } catch {}
  const order = customOrder && customOrder.length > 0 ? customOrder : getAllCategories();
  const effectiveOrder = order.length > 0 ? order : CATEGORY_SERIAL_ORDER;
  const exactIdx = effectiveOrder.findIndex((c) => c.trim().toLowerCase() === normalizedCat);
  if (exactIdx !== -1) return exactIdx + 1;
  const cleanCat = normalizedCat.replace(/[^a-z0-9]/g, '');
  if (cleanCat) {
    const cleanIdx = effectiveOrder.findIndex((c) => c.trim().toLowerCase().replace(/[^a-z0-9]/g, '') === cleanCat);
    if (cleanIdx !== -1) return cleanIdx + 1;
  }
  return 9000;
}

function getExplicitSerialRaw(it: any): string | number | null {
  if (it.serial !== undefined && it.serial !== null && String(it.serial).trim() !== '') {
    return it.serial;
  }
  if (it.serialNo !== undefined && it.serialNo !== null && String(it.serialNo).trim() !== '') {
    return it.serialNo;
  }
  return null;
}

function compareRawSerialValues(rawA: string | number, rawB: string | number): number {
  const strA = String(rawA).trim();
  const strB = String(rawB).trim();
  if (/^\d+(?:\.\d+)?$/.test(strA) && /^\d+(?:\.\d+)?$/.test(strB)) {
    const diff = parseFloat(strA) - parseFloat(strB);
    if (diff !== 0) return diff;
  }
  return strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
}

function getItemFallbackOrder(it: any): number | null {
  if (it.order !== undefined && it.order !== null && it.order !== '') {
    const n = Number(it.order);
    if (!isNaN(n)) return n;
  }
  const m = (it.name || '').match(/^(\d{1,4})[.)\s]/);
  if (m && !/^\d+\.\d+\s*(rm|re|sq|mm|x|\*)/i.test(it.name || '')) {
    const n = parseInt(m[1], 10);
    if (!isNaN(n)) return n;
  }
  return null;
}

function compareItemSerialsOrName(a: any, b: any): number {
  const rawSerA = getExplicitSerialRaw(a);
  const rawSerB = getExplicitSerialRaw(b);
  if (rawSerA !== null && rawSerB !== null) {
    const cmp = compareRawSerialValues(rawSerA, rawSerB);
    if (cmp !== 0) return cmp;
  } else if (rawSerA !== null) {
    return -1;
  } else if (rawSerB !== null) {
    return 1;
  }

  const ordA = getItemFallbackOrder(a);
  const ordB = getItemFallbackOrder(b);
  if (ordA !== null && ordB !== null) {
    if (ordA !== ordB) return ordA - ordB;
  } else if (ordA !== null) {
    return -1;
  } else if (ordB !== null) {
    return 1;
  }
  return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
}

export function sortItemsCategorySerialWise<T extends { category?: string; name: string; id?: string; code?: string; isSpecialItem?: boolean; baseItemId?: string; baseItemCode?: string; serial?: number | string; serialNo?: number | string; order?: number } = Item>(
  items: T[],
  categoryOrder?: string[],
  sortMode: 'category_serial' | 'serial_only' = 'category_serial'
): T[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  const activeOrder = categoryOrder && categoryOrder.length > 0 ? categoryOrder : getAllCategories();

  // Deduplicate input items by unique ID so duplicate records never enter downstream rendering
  const seenInputIds = new Set<string>();
  const uniqueItems: T[] = [];
  for (const it of items) {
    if (!it) continue;
    const itId = it.id ? String(it.id).trim() : '';
    if (itId && seenInputIds.has(itId)) continue;
    if (itId) seenInputIds.add(itId);
    uniqueItems.push(it);
  }

  // Separate standard items and special variant items
  const standardItems = uniqueItems.filter((i) => !i.isSpecialItem);
  const specialItems = uniqueItems.filter((i) => i.isSpecialItem);

  const compareByCategoryAndItem = (a: T, b: T): number => {
    if (sortMode === 'serial_only') {
      return compareItemSerialsOrName(a, b);
    }
    const rankA = getCategorySerialRank(a.category, activeOrder);
    const rankB = getCategorySerialRank(b.category, activeOrder);
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    if (rankA >= 9000) {
      const catCmp = (a.category || '').localeCompare(b.category || '', undefined, { numeric: true, sensitivity: 'base' });
      if (catCmp !== 0) return catCmp;
    }
    return compareItemSerialsOrName(a, b);
  };

  // Sort standard items category rank, then user serial/order, then natural alphanumeric
  const sortedStandard = [...standardItems].sort(compareByCategoryAndItem);

  const result: T[] = [];
  const usedSpecialIds = new Set<string>();

  sortedStandard.forEach((stdItem) => {
    result.push(stdItem);
    // Find all special variant items belonging to this main item
    const matchingSpecials = specialItems.filter((sp) => {
      const spId = sp.id ? String(sp.id).trim() : '';
      if (spId && usedSpecialIds.has(spId)) return false;
      if (stdItem.id && sp.baseItemId && String(sp.baseItemId).trim() === String(stdItem.id).trim()) return true;
      if (stdItem.code && sp.baseItemCode && String(sp.baseItemCode).trim().toUpperCase() === String(stdItem.code).trim().toUpperCase()) return true;
      return false;
    });

    matchingSpecials.forEach((sp) => {
      const spId = sp.id ? String(sp.id).trim() : '';
      if (spId && usedSpecialIds.has(spId)) return;
      result.push(sp);
      if (spId) usedSpecialIds.add(spId);
    });
  });

  // Any remaining unlinked special items placed under their category
  const remainingSpecials = specialItems.filter((sp) => {
    const spId = sp.id ? String(sp.id).trim() : '';
    return !spId || !usedSpecialIds.has(spId);
  });
  if (remainingSpecials.length > 0) {
    const sortedRemaining = [...remainingSpecials].sort(compareByCategoryAndItem);
    result.push(...sortedRemaining);
  }

  // Final deduplication guard to ensure 100% unique IDs
  const seenFinalIds = new Set<string>();
  const dedupedResult: T[] = [];
  for (const it of result) {
    if (!it) continue;
    const itId = it.id ? String(it.id).trim() : '';
    if (itId && seenFinalIds.has(itId)) continue;
    if (itId) seenFinalIds.add(itId);
    dedupedResult.push(it);
  }

  return dedupedResult;
}

export interface CategoryItemGroup<T> {
  category: string;
  categoryRank: number;
  items: Array<{ item: T; flatIndex: number }>;
}

/**
 * Groups items into ordered category sections following the user's configured category list order
 * (getAllCategories() & getCategorySerialRank), assigning continuous 0..N-1 flatIndex values
 * so keyboard navigation matches the rendered grouped list 1:1.
 */
export function groupItemsByCategoryOrder<
  T extends {
    category?: string;
    name: string;
    id?: string;
    code?: string;
    isSpecialItem?: boolean;
    baseItemId?: string;
    baseItemCode?: string;
    serial?: number | string;
    serialNo?: number | string;
    order?: number;
  } = Item
>(
  items: T[],
  categoryOrder?: string[]
): {
  groups: CategoryItemGroup<T>[];
  orderedItems: T[];
} {
  if (!Array.isArray(items) || items.length === 0) {
    return { groups: [], orderedItems: [] };
  }
  const activeOrder = categoryOrder && categoryOrder.length > 0 ? categoryOrder : getAllCategories();
  const sorted = sortItemsCategorySerialWise(items, activeOrder, 'category_serial');

  const resolveCanonicalCategory = (rawCat?: string): string => {
    const trimmed = (rawCat || '').trim();
    if (!trimmed) return 'Uncategorized';
    const norm = trimmed.toLowerCase();
    const exact = activeOrder.find((c) => c.trim().toLowerCase() === norm);
    if (exact) return exact;
    const clean = norm.replace(/[^a-z0-9]/g, '');
    if (clean) {
      const cleanMatch = activeOrder.find((c) => c.trim().toLowerCase().replace(/[^a-z0-9]/g, '') === clean);
      if (cleanMatch) return cleanMatch;
    }
    return trimmed;
  };

  const baseCategoryById = new Map<string, string>();
  const baseCategoryByCode = new Map<string, string>();
  for (const it of sorted) {
    if (!it.isSpecialItem && it.category && it.category.trim()) {
      if (it.id) baseCategoryById.set(String(it.id).trim(), it.category);
      if (it.code) baseCategoryByCode.set(String(it.code).trim().toUpperCase(), it.category);
    }
  }

  const bucketMap = new Map<string, { category: string; categoryRank: number; items: T[] }>();
  for (const it of sorted) {
    let rawCat = it.category;
    if ((!rawCat || !rawCat.trim()) && it.isSpecialItem) {
      rawCat =
        (it.baseItemId && baseCategoryById.get(String(it.baseItemId).trim())) ||
        (it.baseItemCode && baseCategoryByCode.get(String(it.baseItemCode).trim().toUpperCase())) ||
        rawCat;
    }
    const catLabel = resolveCanonicalCategory(rawCat);
    const key = catLabel.toLowerCase();
    let bucket = bucketMap.get(key);
    if (!bucket) {
      bucket = {
        category: catLabel,
        categoryRank: catLabel === 'Uncategorized' ? 99999 : getCategorySerialRank(catLabel, activeOrder),
        items: []
      };
      bucketMap.set(key, bucket);
    }
    bucket.items.push(it);
  }

  const sortedBuckets = Array.from(bucketMap.values()).sort((a, b) => {
    if (a.categoryRank !== b.categoryRank) {
      return a.categoryRank - b.categoryRank;
    }
    if (a.category === 'Uncategorized' && b.category !== 'Uncategorized') return 1;
    if (b.category === 'Uncategorized' && a.category !== 'Uncategorized') return -1;
    return a.category.localeCompare(b.category, undefined, { numeric: true, sensitivity: 'base' });
  });

  const orderedItems: T[] = [];
  const groups: CategoryItemGroup<T>[] = sortedBuckets.map((b) => ({
    category: b.category,
    categoryRank: b.categoryRank,
    items: b.items.map((item) => {
      const flatIndex = orderedItems.length;
      orderedItems.push(item);
      return { item, flatIndex };
    })
  }));

  return { groups, orderedItems };
}


